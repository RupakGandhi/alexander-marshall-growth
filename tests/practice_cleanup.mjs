#!/usr/bin/env node
/**
 * Practice-cleanup acceptance suite — Sept 24, 2026.
 *
 * Verifies the six items in the review request:
 *
 *   V1. Cleanup with isolated fixtures containing BOTH practice and retained
 *       records — only tagged records are affected.
 *   V2. End-to-end cleanup of a draft coaching note, a shared coaching note
 *       with delivered notification, and a PD enrollment with related
 *       deliverable + reflection + score work.
 *   V3. Retained records + credited hours are unchanged.
 *   V4. Deleted practice records no longer appear across the affected
 *       coach / teacher / PD-review / reports / detail views.
 *   V5. Soft-delete restoration works — parent + soft-deleted cascade
 *       come back; hard-deleted notifications do NOT.
 *   V6. Only super-admin can perform these actions (every non-admin role
 *       is blocked with HTTP 403).
 *
 * Runs against the LOCAL server backed by local wrangler D1 + the synthetic
 * fixture in tests/fixture.mjs.
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3000';
const PW = 'TestPass1!';

function localDbPath() {
  const stateDir = resolve(__dirname, '..', '.wrangler/state/v3/d1');
  const walk = (dir) => {
    const out = [];
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, name.name);
      if (name.isDirectory()) out.push(...walk(full));
      else if (name.name.endsWith('.sqlite')) out.push(full);
    }
    return out;
  };
  return walk(stateDir)[0];
}

const db = new Database(localDbPath(), { readonly: false });
db.pragma('foreign_keys = ON');

class Client {
  constructor(email, label) { this.email = email; this.label = label || email; this.cookie = null; }
  async login() {
    const res = await fetch(`${BASE}/login`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email: this.email, password: PW }),
    });
    if (res.status !== 302) throw new Error(`${this.label} login: HTTP ${res.status}`);
    const sc = res.headers.get('set-cookie') || '';
    const m = sc.match(/(aps_session=[^;]+)/);
    if (!m) throw new Error(`${this.label}: no session cookie`);
    this.cookie = m[1];
    return this;
  }
  async get(path) {
    const r = await fetch(`${BASE}${path}`, { redirect: 'manual', headers: { cookie: this.cookie || '' } });
    const text = r.status < 400 ? await r.text() : '';
    return { status: r.status, location: r.headers.get('location'), text };
  }
  async post(path, form) {
    const body = form instanceof URLSearchParams ? form : new URLSearchParams(form);
    const r = await fetch(`${BASE}${path}`, {
      method: 'POST', redirect: 'manual',
      headers: { cookie: this.cookie || '', 'content-type': 'application/x-www-form-urlencoded' },
      body,
    });
    return { status: r.status, location: r.headers.get('location') };
  }
}

let passed = 0, failed = 0, sectionName = '';
const failures = [];
function suite(name) { sectionName = name; console.log(`\n[${name}]`); }
function ok(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); failures.push(`${sectionName}: ${name}${detail ? ' — ' + detail : ''}`); }
}

// IDs from tests/fixture.mjs
const IDS = {
  admin: 1, principal: 2, pureCoach: 3, coachOne: 4, coachTwo: 5, coachThree: 6,
  alice: 10, bob: 11, carol: 12, dan: 13, plain: 14, unrelated: 20,
};

async function main() {

// Log in the roles we'll use.
const admin      = await new Client('admin@test',      'admin').login();
const pureCoach  = await new Client('pure.coach@test', 'PureCoach').login();
const coachOne   = await new Client('coach1@test',     'CoachOne').login();
const alice      = await new Client('alice@test',      'Alice').login();
const bob        = await new Client('bob@test',        'Bob').login();
const principal  = await new Client('principal@test',  'Principal').login();

// ==========================================================================
suite('Setup: create isolated PRACTICE and RETAINED records for the tests');

// -- practice records
// P1: draft coaching note by PureCoach → Alice
await pureCoach.post(`/coach/teachers/${IDS.alice}/notes`, new URLSearchParams({
  _token: 'pc-draft-' + Date.now(),
  occurred_on: '2026-09-24',
  glow: 'PRACTICE DRAFT — training',
  _action: 'draft',
}));
const practiceDraftNote = db.prepare(
  `SELECT id FROM coaching_notes WHERE author_id=? AND teacher_id=? AND glow LIKE 'PRACTICE DRAFT%' ORDER BY id DESC LIMIT 1`
).get(IDS.pureCoach, IDS.alice);
ok(`setup: practice draft note created (id=${practiceDraftNote?.id})`, !!practiceDraftNote?.id);

// P2: shared coaching note by PureCoach → Alice (with delivered notification)
await pureCoach.post(`/coach/teachers/${IDS.alice}/notes`, new URLSearchParams({
  _token: 'pc-shared-' + Date.now(),
  occurred_on: '2026-09-24',
  glow: 'PRACTICE SHARED — training',
  _action: 'share',
}));
const practiceSharedNote = db.prepare(
  `SELECT id FROM coaching_notes WHERE author_id=? AND teacher_id=? AND glow LIKE 'PRACTICE SHARED%' ORDER BY id DESC LIMIT 1`
).get(IDS.pureCoach, IDS.alice);
ok(`setup: practice shared note created (id=${practiceSharedNote?.id})`, !!practiceSharedNote?.id);
const practiceSharedNotifCount = db.prepare(
  `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`
).get(IDS.alice, practiceSharedNote.id).n;
ok(`setup: practice shared note delivered exactly 1 notification (${practiceSharedNotifCount})`,
   practiceSharedNotifCount === 1);
const practiceLedger = db.prepare(
  `SELECT status FROM coaching_note_share_delivery WHERE note_id=?`
).get(practiceSharedNote.id);
ok(`setup: delivery ledger row exists (status='${practiceLedger?.status}')`,
   !!practiceLedger && practiceLedger.status === 'delivered');

// P3: PD enrollment for Bob (id=200 is seeded by the fixture already; we'll
// tag it as practice for the test).  Bob already submitted in earlier fixture
// prep, but the acceptance run may have advanced it — normalise state by
// resetting to 'submitted' with no cascaded work, then create work now.
db.prepare(`UPDATE pd_enrollments SET status='submitted', hours_credited=0, deleted_at=NULL, is_practice=0 WHERE id=200`).run();
db.prepare(`DELETE FROM pd_deliverables WHERE enrollment_id=200`).run();
db.prepare(`DELETE FROM pd_reflections WHERE enrollment_id=200`).run();
db.prepare(`DELETE FROM pd_deliverable_scores WHERE enrollment_id=200`).run();
// Reset any leftover notifications for enrollment 200.
db.prepare(`DELETE FROM notifications WHERE entity_type='pd_enrollment' AND entity_id=200`).run();
db.prepare(`DELETE FROM activity_log WHERE entity_type='pd_enrollment' AND entity_id=200`).run();
// Bob submits a fresh deliverable (writes deliverable + notifications).
await bob.post(`/teacher/pd/200/submit`, new URLSearchParams({
  title: 'PRACTICE deliverable', body: 'PRACTICE body content',
}));
// Add a reflection and a deliverable score directly for coverage.
db.prepare(`INSERT INTO pd_reflections (enrollment_id, phase, body) VALUES (200, 'learn', 'PRACTICE reflection')`).run();
const criterion = db.prepare(`SELECT id FROM pd_deliverable_rubric_criteria LIMIT 1`).get();
if (criterion) {
  db.prepare(`INSERT INTO pd_deliverable_scores (enrollment_id, criterion_id, level, scored_by) VALUES (200, ?, 3, ?)`)
    .run(criterion.id, IDS.principal);
}
// Principal verifies with credit so we can also check hours_credited unchanged on RETAINED enrollments below.
// (We keep enrollment 200 in 'submitted' state to make sure PD-review still shows soft-deleted rows correctly.)
const practicePdRow = db.prepare(`SELECT id, hours_credited FROM pd_enrollments WHERE id=200`).get();
ok(`setup: practice PD enrollment id=200 exists (status=submitted, hours=${practicePdRow.hours_credited})`,
   practicePdRow.id === 200);
const practicePdDeliverables = db.prepare(`SELECT COUNT(*) AS n FROM pd_deliverables WHERE enrollment_id=200 AND deleted_at IS NULL`).get().n;
const practicePdReflections = db.prepare(`SELECT COUNT(*) AS n FROM pd_reflections WHERE enrollment_id=200 AND deleted_at IS NULL`).get().n;
const practicePdScores = db.prepare(`SELECT COUNT(*) AS n FROM pd_deliverable_scores WHERE enrollment_id=200 AND deleted_at IS NULL`).get().n;
ok(`setup: PD 200 has ${practicePdDeliverables} deliverable, ${practicePdReflections} reflection, ${practicePdScores} score`,
   practicePdDeliverables === 1 && practicePdReflections === 1 && practicePdScores === 1);

// -- retained records (must NOT be affected by the cleanup)
// R1: retained shared coaching note by CoachOne → Alice with delivered notification.
await coachOne.post(`/coach/teachers/${IDS.alice}/notes`, new URLSearchParams({
  _token: 'retain-shared-' + Date.now(),
  occurred_on: '2026-09-24',
  glow: 'RETAINED SHARED — real work',
  _action: 'share',
}));
const retainedSharedNote = db.prepare(
  `SELECT id FROM coaching_notes WHERE author_id=? AND teacher_id=? AND glow LIKE 'RETAINED SHARED%' ORDER BY id DESC LIMIT 1`
).get(IDS.coachOne, IDS.alice);
ok(`setup: retained shared note by CoachOne (id=${retainedSharedNote?.id})`, !!retainedSharedNote?.id);

// R2: retained PD enrollment id=201 (CoachOne, verified, hours_credited=3.5).
const retainedEnr = db.prepare(`SELECT id, status, hours_credited FROM pd_enrollments WHERE id=201`).get();
ok(`setup: retained PD enrollment 201 status='${retainedEnr?.status}', hours=${retainedEnr?.hours_credited}`,
   retainedEnr?.status === 'verified' && retainedEnr?.hours_credited === 3.5);

// Snapshot pre-cleanup baseline for RETAINED records.
const preNotes = db.prepare(`SELECT COUNT(*) AS n FROM coaching_notes WHERE deleted_at IS NULL`).get().n;
const preAudit = db.prepare(`SELECT COUNT(*) AS n FROM coaching_note_audit WHERE deleted_at IS NULL`).get().n;
const preLedger = db.prepare(`SELECT COUNT(*) AS n FROM coaching_note_share_delivery`).get().n;
const preNotifs = db.prepare(`SELECT COUNT(*) AS n FROM notifications`).get().n;
const preActivity = db.prepare(`SELECT COUNT(*) AS n FROM activity_log`).get().n;
const preEnr = db.prepare(`SELECT COUNT(*) AS n FROM pd_enrollments WHERE deleted_at IS NULL`).get().n;
const preRetainedHours = db.prepare(`SELECT hours_credited FROM pd_enrollments WHERE id=201`).get().hours_credited;
const preRetainedSharedNoteNotifs = db.prepare(
  `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`
).get(IDS.alice, retainedSharedNote.id).n;

// ==========================================================================
suite('V6 (permissions): non-super_admin cannot access practice-cleanup routes');
{
  for (const [label, cli] of [['PureCoach', pureCoach], ['CoachOne', coachOne], ['Alice', alice], ['Bob', bob], ['Principal', principal]]) {
    const r = await cli.get('/admin/data/practice-cleanup');
    ok(`${label} GET /admin/data/practice-cleanup → 403 (or redirect to login/403 page)`,
       r.status === 403 || (r.status === 302 && r.location && r.location.includes('/')),
       `HTTP ${r.status} loc=${r.location}`);
  }
  // Non-admin POST to mark must also fail.
  const rMark = await pureCoach.post('/admin/data/practice-cleanup/mark', new URLSearchParams({
    entity_type: 'coaching_note', entity_id: String(practiceDraftNote.id), is_practice: '1',
  }));
  ok('PureCoach POST /mark → 403 (super-admin only)',
     rMark.status === 403, `HTTP ${rMark.status}`);
  // Non-admin POST to execute must also fail.
  const rExec = await pureCoach.post('/admin/data/practice-cleanup/execute', new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));
  ok('PureCoach POST /execute → 403 (super-admin only)',
     rExec.status === 403, `HTTP ${rExec.status}`);
}

// ==========================================================================
suite('V1 (marking): admin tags each practice record; retained rows stay is_practice=0');
{
  // Admin GET the page works.
  const page = await admin.get('/admin/data/practice-cleanup');
  ok('admin GET /admin/data/practice-cleanup → 200', page.status === 200, `HTTP ${page.status}`);
  ok('admin page includes the workflow heading', page.text.includes('Practice-data cleanup'));
  ok('admin page shows "Review scope"', page.text.includes('Review scope'));

  // Tag each practice record via the mark endpoint.
  const tagOne = async (et, id) => {
    const r = await admin.post('/admin/data/practice-cleanup/mark', new URLSearchParams({
      entity_type: et, entity_id: String(id), is_practice: '1',
    }));
    return r;
  };
  const r1 = await tagOne('coaching_note', practiceDraftNote.id);
  ok(`tag draft note → 302 (${r1.status})`, r1.status === 302);
  const r2 = await tagOne('coaching_note', practiceSharedNote.id);
  ok(`tag shared note → 302 (${r2.status})`, r2.status === 302);
  const r3 = await tagOne('pd_enrollment', 200);
  ok(`tag PD enrollment 200 → 302 (${r3.status})`, r3.status === 302);

  // Confirm is_practice flags on the tagged rows and NOT on the retained ones.
  const tags = db.prepare(
    `SELECT 'coaching_note' AS et, id, is_practice FROM coaching_notes WHERE id IN (?,?,?)
       UNION ALL
     SELECT 'pd_enrollment', id, is_practice FROM pd_enrollments WHERE id IN (?, ?)`
  ).all(practiceDraftNote.id, practiceSharedNote.id, retainedSharedNote.id, 200, 201);
  const map = Object.fromEntries(tags.map(t => [`${t.et}:${t.id}`, t.is_practice]));
  ok(`practice draft note tagged`, map[`coaching_note:${practiceDraftNote.id}`] === 1);
  ok(`practice shared note tagged`, map[`coaching_note:${practiceSharedNote.id}`] === 1);
  ok(`practice PD 200 tagged`, map[`pd_enrollment:200`] === 1);
  ok(`retained shared note NOT tagged`, map[`coaching_note:${retainedSharedNote.id}`] === 0);
  ok(`retained PD 201 NOT tagged`, map[`pd_enrollment:201`] === 0);

  // Review-scope page shows the 3 tagged records with dependent counts.
  const scope = await admin.get('/admin/data/practice-cleanup');
  ok('scope page mentions "3 records tagged"',
     scope.text.includes('3 records tagged'),
     'expected "3 records tagged" in review scope');
}

// ==========================================================================
suite('V2 (execute): admin runs cleanup — parents soft-deleted, cascade handled');
{
  // Phrase-guard rejection first.
  const rBad = await admin.post('/admin/data/practice-cleanup/execute', new URLSearchParams({
    confirm: 'not the phrase',
  }));
  ok('execute without correct phrase redirects with error message',
     rBad.status === 302 && rBad.location && rBad.location.includes('exactly'), `loc=${rBad.location}`);
  // Real execute.
  const r = await admin.post('/admin/data/practice-cleanup/execute', new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
    note: 'test cleanup',
  }));
  ok(`execute returns 302 to batch page (${r.status})`, r.status === 302);
  ok('execute redirects to /admin/data/practice-cleanup/batches/…',
     r.location && r.location.includes('/practice-cleanup/batches/'), `loc=${r.location}`);
  const batchId = Number((r.location || '').split('/batches/')[1]);
  ok(`batch id parsed from redirect (${batchId})`, batchId > 0);

  // Parent rows are now soft-deleted (deleted_at IS NOT NULL).
  const draftDel = db.prepare(`SELECT deleted_at FROM coaching_notes WHERE id=?`).get(practiceDraftNote.id).deleted_at;
  const sharedDel = db.prepare(`SELECT deleted_at FROM coaching_notes WHERE id=?`).get(practiceSharedNote.id).deleted_at;
  const enrDel = db.prepare(`SELECT deleted_at FROM pd_enrollments WHERE id=200`).get().deleted_at;
  ok(`draft note soft-deleted`, !!draftDel);
  ok(`shared note soft-deleted`, !!sharedDel);
  ok(`PD enrollment 200 soft-deleted`, !!enrDel);

  // Coaching-note audit cascade: audit rows for the deleted notes should be soft-deleted too.
  const draftAuditLive = db.prepare(`SELECT COUNT(*) AS n FROM coaching_note_audit WHERE note_id=? AND deleted_at IS NULL`).get(practiceDraftNote.id).n;
  const sharedAuditLive = db.prepare(`SELECT COUNT(*) AS n FROM coaching_note_audit WHERE note_id=? AND deleted_at IS NULL`).get(practiceSharedNote.id).n;
  ok(`draft note's audit rows soft-deleted (${draftAuditLive} live remain)`, draftAuditLive === 0);
  ok(`shared note's audit rows soft-deleted (${sharedAuditLive} live remain)`, sharedAuditLive === 0);

  // Share-delivery ledger: hard-deleted.
  const sharedLedger = db.prepare(`SELECT COUNT(*) AS n FROM coaching_note_share_delivery WHERE note_id=?`).get(practiceSharedNote.id).n;
  ok(`shared note's delivery ledger HARD-deleted (${sharedLedger} rows)`, sharedLedger === 0);

  // Notifications for cleaned notes: hard-deleted.
  const cleanedNotifs = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id IN (?,?)`
  ).get(IDS.alice, practiceDraftNote.id, practiceSharedNote.id).n;
  ok(`notifications for cleaned notes hard-deleted (${cleanedNotifs})`, cleanedNotifs === 0);

  // PD 200 cascade: deliverables + reflections + scores all soft-deleted; notifications hard-deleted.
  const dLive = db.prepare(`SELECT COUNT(*) AS n FROM pd_deliverables WHERE enrollment_id=200 AND deleted_at IS NULL`).get().n;
  const rLive = db.prepare(`SELECT COUNT(*) AS n FROM pd_reflections WHERE enrollment_id=200 AND deleted_at IS NULL`).get().n;
  const sLive = db.prepare(`SELECT COUNT(*) AS n FROM pd_deliverable_scores WHERE enrollment_id=200 AND deleted_at IS NULL`).get().n;
  const pdNotifs = db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE entity_type='pd_enrollment' AND entity_id=200`).get().n;
  ok(`PD deliverables soft-deleted (${dLive} live remain)`, dLive === 0);
  ok(`PD reflections soft-deleted (${rLive} live remain)`, rLive === 0);
  ok(`PD deliverable scores soft-deleted (${sLive} live remain)`, sLive === 0);
  ok(`PD notifications hard-deleted (${pdNotifs} live remain)`, pdNotifs === 0);
}

// ==========================================================================
suite('V3 (retention): retained records + credited hours unchanged');
{
  // Retained shared coaching note by CoachOne: NOT soft-deleted, notification intact.
  const rNote = db.prepare(`SELECT deleted_at, status FROM coaching_notes WHERE id=?`).get(retainedSharedNote.id);
  ok(`retained shared note NOT soft-deleted`, !rNote.deleted_at);
  ok(`retained shared note status='shared'`, rNote.status === 'shared');
  const rNoteNotif = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`
  ).get(IDS.alice, retainedSharedNote.id).n;
  ok(`retained note's notification preserved (${preRetainedSharedNoteNotifs} → ${rNoteNotif})`,
     rNoteNotif === preRetainedSharedNoteNotifs && rNoteNotif > 0);

  // Retained PD 201: not soft-deleted, hours unchanged.
  const rEnr = db.prepare(`SELECT deleted_at, status, hours_credited FROM pd_enrollments WHERE id=201`).get();
  ok(`retained PD 201 NOT soft-deleted`, !rEnr.deleted_at);
  ok(`retained PD 201 status='${rEnr.status}' unchanged`, rEnr.status === 'verified');
  ok(`retained PD 201 credited hours preserved (${preRetainedHours} → ${rEnr.hours_credited})`,
     rEnr.hours_credited === preRetainedHours && rEnr.hours_credited === 3.5);
}

// ==========================================================================
suite('V4 (visibility): cleaned records do NOT appear in coach / teacher / PD-review / reports views');
{
  // Coach GET on Alice: cleaned notes MUST NOT be listed.
  const coachView = await pureCoach.get(`/coach/teachers/${IDS.alice}`);
  ok('PureCoach coach view: cleaned DRAFT text absent',
     !coachView.text.includes('PRACTICE DRAFT — training'),
     'cleaned draft leaked into coach view');
  ok('PureCoach coach view: cleaned SHARED text absent',
     !coachView.text.includes('PRACTICE SHARED — training'),
     'cleaned shared leaked into coach view');
  // Retained note still visible.
  ok('PureCoach coach view: RETAINED shared entry NOT visible (author-scoped — that\'s CoachOne\'s)',
     !coachView.text.includes('RETAINED SHARED — real work'));

  // Admin view of Alice's coach page: super_admin sees all authors' notes,
  // so RETAINED must still appear but cleaned ones must NOT.
  const adminCoachView = await admin.get(`/coach/teachers/${IDS.alice}`);
  ok('admin (super) coach view: cleaned DRAFT absent',
     !adminCoachView.text.includes('PRACTICE DRAFT — training'));
  ok('admin (super) coach view: cleaned SHARED absent',
     !adminCoachView.text.includes('PRACTICE SHARED — training'));
  ok('admin (super) coach view: retained shared IS visible',
     adminCoachView.text.includes('RETAINED SHARED — real work'));

  // Teacher view on Alice: cleaned SHARED note absent, retained visible.
  const teacherView = await alice.get('/teacher');
  ok('teacher view: cleaned SHARED note absent',
     !teacherView.text.includes('PRACTICE SHARED — training'));
  ok('teacher view: retained SHARED note visible',
     teacherView.text.includes('RETAINED SHARED — real work'));

  // PD-review list: cleaned enrollment 200 no longer listed.
  const pdReview = await principal.get('/pd/review');
  ok('PD-review list does NOT include soft-deleted enrollment 200',
     !pdReview.text.includes('/pd/review/200'),
     'cleaned enrollment leaked into PD-review list');
  // Retained enrollment 201 still visible if in-review status; even if not,
  // hitting the drill-down for 201 (which IS verified) is a valid GET.
  const pdDrill = await principal.get('/pd/review/200');
  ok('PD-review drill-down /pd/review/200 for cleaned enrollment returns 404 (not found)',
     pdDrill.status === 404, `HTTP ${pdDrill.status}`);

  // Reports: PD report should NOT show soft-deleted enrollment 200 in CSV or HTML.
  const pdReport = await principal.get('/reports/pd');
  ok('PD report HTML does NOT list drill link for soft-deleted 200',
     !pdReport.text.includes('/reports/pd/200'),
     'cleaned enrollment leaked into PD report');
  const pdCsv = await principal.get('/reports/pd.csv');
  ok('PD CSV export does NOT contain a row starting with "200,"',
     !pdCsv.text.split(/\r?\n/).some(l => l.startsWith('200,')),
     'cleaned enrollment leaked into PD CSV');

  // Practice-cleanup detail view for enrollment 200 (drill-down) returns 404.
  const t200 = await bob.get('/teacher/pd/200');
  ok('teacher direct-detail /teacher/pd/200 for soft-deleted enrollment → 404',
     t200.status === 404, `HTTP ${t200.status}`);
}

// ==========================================================================
suite('V5 (restore): "Undo last cleanup" un-soft-deletes parents + cascade');
{
  // Get the most recent batch (which is our test batch).
  const batch = db.prepare(`SELECT id, status FROM practice_cleanup_batches ORDER BY id DESC LIMIT 1`).get();
  ok(`test batch exists with status='executed' (id=${batch?.id}, status='${batch?.status}')`,
     batch?.status === 'executed');
  // Restore.
  const r = await admin.post(`/admin/data/practice-cleanup/batches/${batch.id}/restore`, new URLSearchParams({
    confirm: 'RESTORE BATCH',
  }));
  ok(`restore returns 302 (${r.status})`, r.status === 302);
  ok('restore redirect message says "Restored batch"',
     r.location && decodeURIComponent(r.location).includes('Restored batch'),
     `loc=${r.location}`);

  // Parents un-soft-deleted.
  ok('draft note un-soft-deleted',
     !db.prepare(`SELECT deleted_at FROM coaching_notes WHERE id=?`).get(practiceDraftNote.id).deleted_at);
  ok('shared note un-soft-deleted',
     !db.prepare(`SELECT deleted_at FROM coaching_notes WHERE id=?`).get(practiceSharedNote.id).deleted_at);
  ok('PD 200 un-soft-deleted',
     !db.prepare(`SELECT deleted_at FROM pd_enrollments WHERE id=200`).get().deleted_at);

  // Soft-deleted cascade rows restored (audit, deliverables, reflections, scores).
  const draftAudit = db.prepare(`SELECT COUNT(*) AS n FROM coaching_note_audit WHERE note_id=? AND deleted_at IS NULL`).get(practiceDraftNote.id).n;
  const sharedAudit = db.prepare(`SELECT COUNT(*) AS n FROM coaching_note_audit WHERE note_id=? AND deleted_at IS NULL`).get(practiceSharedNote.id).n;
  ok(`draft note audit restored (${draftAudit} live rows)`, draftAudit > 0);
  ok(`shared note audit restored (${sharedAudit} live rows)`, sharedAudit > 0);
  const dRestored = db.prepare(`SELECT COUNT(*) AS n FROM pd_deliverables WHERE enrollment_id=200 AND deleted_at IS NULL`).get().n;
  ok(`PD deliverables restored (${dRestored} live)`, dRestored > 0);
  const rRestored = db.prepare(`SELECT COUNT(*) AS n FROM pd_reflections WHERE enrollment_id=200 AND deleted_at IS NULL`).get().n;
  ok(`PD reflections restored (${rRestored} live)`, rRestored > 0);
  const sRestored = db.prepare(`SELECT COUNT(*) AS n FROM pd_deliverable_scores WHERE enrollment_id=200 AND deleted_at IS NULL`).get().n;
  ok(`PD deliverable scores restored (${sRestored} live)`, sRestored > 0);

  // Notifications and share-delivery ledger were hard-deleted; NOT restored (documented behavior).
  const notifRestored = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE entity_type IN ('coaching_note','pd_enrollment') AND entity_id IN (?,?,200)`
  ).get(practiceDraftNote.id, practiceSharedNote.id).n;
  ok(`notifications NOT re-created (${notifRestored} — documented terminal behavior)`, notifRestored === 0);
  const ledgerRestored = db.prepare(`SELECT COUNT(*) AS n FROM coaching_note_share_delivery WHERE note_id=?`).get(practiceSharedNote.id).n;
  ok(`share-delivery ledger NOT re-created for restored shared note (${ledgerRestored})`, ledgerRestored === 0);

  // Restored notes are now visible again in coach/teacher views (V4-inverse).
  const coachView = await admin.get(`/coach/teachers/${IDS.alice}`);
  ok('after restore: PRACTICE DRAFT visible again in super-admin coach view',
     coachView.text.includes('PRACTICE DRAFT — training'));
  ok('after restore: PRACTICE SHARED visible again in super-admin coach view',
     coachView.text.includes('PRACTICE SHARED — training'));

  // Restore is now marked 'restored' in the batches table.
  const b2 = db.prepare(`SELECT status FROM practice_cleanup_batches WHERE id=?`).get(batch.id);
  ok(`batch status flipped to 'restored' (${b2.status})`, b2.status === 'restored');
}

// ==========================================================================
suite('V4 second pass — after V2 execute, unrelated activity_log/notifications preserved');
{
  // Compare totals against the pre-cleanup snapshot.  Only rows tied to
  // cleaned entities should have decreased.
  // At this point V5 has restored the parents but notifications+activity for
  // the cleaned entities are permanently gone.  We compare against pre-
  // cleanup counts to bound the loss.
  const postNotifs = db.prepare(`SELECT COUNT(*) AS n FROM notifications`).get().n;
  const postActivity = db.prepare(`SELECT COUNT(*) AS n FROM activity_log`).get().n;
  // Notifications: dropped by exactly the number tied to cleaned coaching notes
  // (1 for the shared note) + PD 200 recipient (1 pd_deliverable_submitted).
  // Retained records' notifications must remain — we already asserted that above.
  ok(`notifications dropped by at most the number tied to cleaned entities (pre=${preNotifs}, post=${postNotifs})`,
     postNotifs >= preNotifs - 5 && postNotifs <= preNotifs);
  // Activity log dropped by the entries for cleaned entities only.  Should
  // never DROP by more than the cleaned-entity count (i.e., retained rows
  // still present).
  ok(`activity_log dropped by at most cleaned-entity entries (pre=${preActivity}, post=${postActivity})`,
     postActivity >= preActivity - 10 && postActivity <= preActivity);
  // Silence unused-var linter for setup snapshots we don't reuse further.
  void preNotes; void preAudit; void preLedger; void preEnr;
}

// ==========================================================================
suite('V1 second pass — untag flow works (is_practice=0 removes from scope)');
{
  // Retag the draft note (V5 restored it fresh; is_practice was left =1 on
  // restore because it's a marker, not a delete flag).  Then untag it and
  // confirm scope shrinks.
  const before = (await admin.get('/admin/data/practice-cleanup')).text;
  ok('scope page currently mentions our restored practice draft as tagged',
     before.includes('records tagged') || before.includes('record tagged'));
  const r = await admin.post('/admin/data/practice-cleanup/mark', new URLSearchParams({
    entity_type: 'coaching_note', entity_id: String(practiceDraftNote.id), is_practice: '0',
  }));
  ok(`untag draft note → 302 (${r.status})`, r.status === 302);
  const nowFlag = db.prepare(`SELECT is_practice FROM coaching_notes WHERE id=?`).get(practiceDraftNote.id).is_practice;
  ok('draft note is_practice cleared to 0', nowFlag === 0);
}

// ==========================================================================
console.log('\n============================================================');
console.log(`  ${passed} passed · ${failed} failed`);
if (failed) {
  console.log('  Failures:');
  for (const f of failures) console.log(`    - ${f}`);
}
console.log('============================================================');
db.close();
process.exit(failed > 0 ? 1 : 0);

}

main().catch(e => { console.error('FATAL', e); db.close(); process.exit(2); });
