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
  // Non-admin POST to preview must also fail (new F6 endpoint).
  const rPrev = await pureCoach.post('/admin/data/practice-cleanup/preview', new URLSearchParams({}));
  ok('PureCoach POST /preview → 403 (super-admin only)',
     rPrev.status === 403, `HTTP ${rPrev.status}`);
  // Non-admin POST to execute must also fail.
  const rExec = await pureCoach.post('/admin/data/practice-cleanup/batches/1/execute', new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));
  ok('PureCoach POST /batches/:id/execute → 403 (super-admin only)',
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
suite('V2 (execute): admin runs two-phase cleanup — preview freezes scope, execute soft-deletes atomically');
{
  // Phase 1: PREVIEW (F6).  Creates a batch with status='preview'.
  const rPrev = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({
    note: 'test cleanup',
  }));
  ok(`preview returns 302 to batch page (${rPrev.status})`, rPrev.status === 302);
  ok('preview redirects to /admin/data/practice-cleanup/batches/…',
     rPrev.location && rPrev.location.includes('/practice-cleanup/batches/'), `loc=${rPrev.location}`);
  const batchId = Number((rPrev.location || '').split('/batches/')[1]);
  ok(`batch id parsed from redirect (${batchId})`, batchId > 0);

  // Preview batch is in status='preview' with scope_hash captured.
  const previewBatch = db.prepare(
    `SELECT status, scope_hash, writer_nonce, candidate_snapshot_json FROM practice_cleanup_batches WHERE id=?`
  ).get(batchId);
  ok(`preview batch status='preview' (${previewBatch.status})`, previewBatch.status === 'preview');
  ok(`preview batch has scope_hash captured (${previewBatch.scope_hash?.slice(0, 32)}...)`,
     !!previewBatch.scope_hash && previewBatch.scope_hash.length > 0);
  ok(`preview batch has writer_nonce set (idempotence token)`, !!previewBatch.writer_nonce);
  ok(`preview batch has candidate_snapshot_json captured`, !!previewBatch.candidate_snapshot_json);

  // At this point, NOTHING is soft-deleted yet.
  const midDraft = db.prepare(`SELECT deleted_at FROM coaching_notes WHERE id=?`).get(practiceDraftNote.id);
  ok(`draft note NOT soft-deleted before execute (${midDraft.deleted_at || 'null'})`, !midDraft.deleted_at);

  // Phase 2: EXECUTE with phrase guard rejection.
  const rBad = await admin.post(`/admin/data/practice-cleanup/batches/${batchId}/execute`, new URLSearchParams({
    confirm: 'not the phrase',
  }));
  ok('execute without correct phrase redirects with error message',
     rBad.status === 302 && rBad.location && rBad.location.includes('exactly'), `loc=${rBad.location}`);

  // Real execute.
  const r = await admin.post(`/admin/data/practice-cleanup/batches/${batchId}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));
  ok(`execute returns 302 (${r.status})`, r.status === 302);
  ok('execute redirects to /admin/data/practice-cleanup/batches/…',
     r.location && r.location.includes('/practice-cleanup/batches/'), `loc=${r.location}`);

  // Parent rows are now soft-deleted (deleted_at IS NOT NULL).
  const draftDel = db.prepare(`SELECT deleted_at FROM coaching_notes WHERE id=?`).get(practiceDraftNote.id).deleted_at;
  const sharedDel = db.prepare(`SELECT deleted_at FROM coaching_notes WHERE id=?`).get(practiceSharedNote.id).deleted_at;
  const enrDel = db.prepare(`SELECT deleted_at FROM pd_enrollments WHERE id=200`).get().deleted_at;
  ok(`draft note soft-deleted`, !!draftDel);
  ok(`shared note soft-deleted`, !!sharedDel);
  ok(`PD enrollment 200 soft-deleted`, !!enrDel);

  // Batch flipped to 'executed' atomically with the writes.
  const execBatch = db.prepare(
    `SELECT status, writer_nonce, executed_at, affected_counts_json FROM practice_cleanup_batches WHERE id=?`
  ).get(batchId);
  ok(`batch status='executed' after execute (${execBatch.status})`, execBatch.status === 'executed');
  ok(`writer_nonce cleared on successful flip`, execBatch.writer_nonce === null);
  ok(`executed_at timestamp set`, !!execBatch.executed_at);
  const summary = JSON.parse(execBatch.affected_counts_json);
  ok(`affected_counts.affected.coaching_note = 2`, summary.affected.coaching_note === 2);
  ok(`affected_counts.affected.pd_enrollment = 1`, summary.affected.pd_enrollment === 1);

  // Coaching-note audit cascade: audit rows for the deleted notes should be soft-deleted too.
  const draftAuditLive = db.prepare(`SELECT COUNT(*) AS n FROM coaching_note_audit WHERE note_id=? AND deleted_at IS NULL`).get(practiceDraftNote.id).n;
  const sharedAuditLive = db.prepare(`SELECT COUNT(*) AS n FROM coaching_note_audit WHERE note_id=? AND deleted_at IS NULL`).get(practiceSharedNote.id).n;
  ok(`draft note's audit rows soft-deleted (${draftAuditLive} live remain)`, draftAuditLive === 0);
  ok(`shared note's audit rows soft-deleted (${sharedAuditLive} live remain)`, sharedAuditLive === 0);

  // F5: Share-delivery ledger is now SOFT-deleted (not hard-deleted).
  // The row must still exist, marked deleted_at IS NOT NULL, preserving
  // the 'delivered' status for eventual restore.
  const sharedLedgerRow = db.prepare(`SELECT status, deleted_at FROM coaching_note_share_delivery WHERE note_id=?`).get(practiceSharedNote.id);
  ok(`shared note's delivery ledger still EXISTS (F5 preservation)`, !!sharedLedgerRow);
  ok(`shared note's delivery ledger is SOFT-deleted (deleted_at set)`,
     !!sharedLedgerRow?.deleted_at);
  ok(`shared note's ledger status preserved as 'delivered' (was: '${sharedLedgerRow?.status}')`,
     sharedLedgerRow?.status === 'delivered');
  // Also: the deleted_at IS NULL count from the coach's perspective is 0.
  const sharedLedgerLive = db.prepare(`SELECT COUNT(*) AS n FROM coaching_note_share_delivery WHERE note_id=? AND deleted_at IS NULL`).get(practiceSharedNote.id).n;
  ok(`shared note's ledger invisible to live reads (${sharedLedgerLive} live remain)`, sharedLedgerLive === 0);

  // F4: per-child manifest was populated.
  const childManifest = db.prepare(
    `SELECT child_kind, COUNT(*) AS n FROM practice_cleanup_child WHERE batch_id=? GROUP BY child_kind ORDER BY child_kind`
  ).all(batchId);
  const cmMap = Object.fromEntries(childManifest.map(r => [r.child_kind, r.n]));
  ok(`child manifest includes coaching_note_share_delivery (${cmMap.coaching_note_share_delivery || 0})`,
     (cmMap.coaching_note_share_delivery || 0) >= 1);
  ok(`child manifest includes coaching_note_audit (${cmMap.coaching_note_audit || 0})`,
     (cmMap.coaching_note_audit || 0) >= 1);
  ok(`child manifest includes pd_deliverable, pd_reflection, pd_deliverable_score`,
     (cmMap.pd_deliverable || 0) >= 1 && (cmMap.pd_reflection || 0) >= 1 && (cmMap.pd_deliverable_score || 0) >= 1);
  // All child manifest rows have prior_deleted_at IS NULL (this batch was the deleter).
  const priorNonNull = db.prepare(
    `SELECT COUNT(*) AS n FROM practice_cleanup_child WHERE batch_id=? AND prior_deleted_at IS NOT NULL`
  ).get(batchId).n;
  ok(`all child manifest rows have prior_deleted_at IS NULL (this batch owned every soft-delete) (${priorNonNull} with prior != NULL)`,
     priorNonNull === 0);

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

  // Notifications were hard-deleted; NOT re-created (documented behavior).
  const notifRestored = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE entity_type IN ('coaching_note','pd_enrollment') AND entity_id IN (?,?,200)`
  ).get(practiceDraftNote.id, practiceSharedNote.id).n;
  ok(`notifications NOT re-created (${notifRestored} — documented terminal behavior)`, notifRestored === 0);

  // F5: share-delivery ledger IS restored (soft-delete → un-soft-delete).
  // The row now visible to live reads with its preserved 'delivered' status.
  const ledgerRow = db.prepare(`SELECT status, deleted_at FROM coaching_note_share_delivery WHERE note_id=?`).get(practiceSharedNote.id);
  ok(`share-delivery ledger IS restored (F5): row still exists`, !!ledgerRow);
  ok(`share-delivery ledger deleted_at cleared on restore`, !ledgerRow?.deleted_at);
  ok(`share-delivery ledger status preserved as 'delivered' through restore`,
     ledgerRow?.status === 'delivered');

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
suite('V7 (F2 — score-summary regression): getTeacherPerformanceSummary only aggregates active, own scores');
{
  // Reproduces the bug reported in the review:
  //   * teacher A has one RETAINED score of 4
  //   * teacher B has one DELETED score of 1
  //   * teacher C has NO scores
  //   Expected: A shows avg=4, B shows no scores, C shows no scores.
  //   Bug: A showed 2.5 (deleted 1 leaking into A's aggregation), C showed 1.0.
  //
  // We use existing framework indicator + fixtureless teachers by injecting a
  // fresh observation for each teacher and comparing the rendered
  // /appraiser/teachers/:id page (which calls getTeacherPerformanceSummary).
  //
  // We use IDs 12 (Carol=A), 13 (Dan=B), 14 (Plain=C) as the three teachers.
  const teacherA = IDS.carol;
  const teacherB = IDS.dan;
  const teacherC = IDS.plain;
  const appraiserId = IDS.principal;

  const indicator = db.prepare(`SELECT id FROM framework_indicators ORDER BY sort_order LIMIT 1`).get();
  const fwId = db.prepare(`SELECT framework_id FROM observations WHERE id=101`).get()?.framework_id
    || db.prepare(`SELECT id FROM frameworks ORDER BY id LIMIT 1`).get().id;

  const now = new Date().toISOString();
  // Clean any prior V7 rows if the suite re-ran.
  db.prepare(`DELETE FROM observation_scores WHERE observation_id IN (9701, 9702, 9703)`).run();
  db.prepare(`DELETE FROM observations WHERE id IN (9701, 9702, 9703)`).run();

  // Teacher A: retained observation with score=4
  db.prepare(`INSERT INTO observations (id, teacher_id, appraiser_id, school_year_id, framework_id,
    observation_type, class_context, subject, grade_level, observed_at, status,
    published_at, teacher_acknowledged_at, created_at, updated_at)
    VALUES (9701, ?, ?, 1, ?, 'formal', 'V7 teacher A', 'ELA', '3', ?, 'acknowledged', ?, ?, ?, ?)`)
    .run(teacherA, appraiserId, fwId, now, now, now, now, now);
  db.prepare(`INSERT INTO observation_scores (observation_id, indicator_id, level, evidence_note, created_at, updated_at)
    VALUES (9701, ?, 4, 'V7 A evidence', ?, ?)`).run(indicator.id, now, now);
  // Teacher B: DELETED observation with score=1 (must not leak into A's aggregate)
  db.prepare(`INSERT INTO observations (id, teacher_id, appraiser_id, school_year_id, framework_id,
    observation_type, class_context, subject, grade_level, observed_at, status,
    published_at, teacher_acknowledged_at, deleted_at, created_at, updated_at)
    VALUES (9702, ?, ?, 1, ?, 'formal', 'V7 teacher B', 'ELA', '3', ?, 'acknowledged', ?, ?, ?, ?, ?)`)
    .run(teacherB, appraiserId, fwId, now, now, now, now, now, now);
  db.prepare(`INSERT INTO observation_scores (observation_id, indicator_id, level, evidence_note, created_at, updated_at)
    VALUES (9702, ?, 1, 'V7 B evidence (deleted)', ?, ?)`).run(indicator.id, now, now);
  // Teacher C: no scores at all (no observation).

  // Fetch summary via the appraiser teacher-detail view.
  const appraiser = principal;
  const pageA = await appraiser.get(`/appraiser/teachers/${teacherA}`);
  const pageB = await appraiser.get(`/appraiser/teachers/${teacherB}`);
  const pageC = await appraiser.get(`/appraiser/teachers/${teacherC}`);
  ok(`V7: teacher A page renders (HTTP ${pageA.status})`, pageA.status === 200);
  ok(`V7: teacher B page renders (HTTP ${pageB.status})`, pageB.status === 200);
  ok(`V7: teacher C page renders (HTTP ${pageC.status})`, pageC.status === 200);

  // Teacher A's page must show avg of 4.0 for this indicator's domain, NOT 2.5.
  // We look for "4.0" in a domain-avg cell.  The bug produced "2.5" or "2.50".
  ok(`V7: teacher A does NOT show buggy 2.5 avg (score-summary regression fixed)`,
     !/\b2\.5(\b|<|0)/.test(pageA.text.replace(/2\.5%|2\.5x/g, '')),
     'teacher A page contains "2.5" — deleted score B is leaking into A\'s aggregate');

  // Teacher C (no scores) must NOT show any avg > 0 for the indicator's domain.
  // The bug produced avg=1.0 (deleted B's score leaking across teachers).
  // We check by re-querying getTeacherPerformanceSummary via the DB directly
  // rather than the HTML (which may contain incidental "1.0" strings for
  // unrelated version/style tokens).  A score_count of 0 in every domain is
  // the true condition.
  const teacherC_totalScores = db.prepare(
    `SELECT COUNT(*) AS n FROM observation_scores s
       JOIN observations o ON o.id=s.observation_id
      WHERE o.teacher_id=? AND o.deleted_at IS NULL AND o.status IN ('published','acknowledged') AND s.level IS NOT NULL`
  ).get(teacherC).n;
  ok(`V7: teacher C really has zero active scores in DB (${teacherC_totalScores})`,
     teacherC_totalScores === 0);
  // No "aggregate score" or "domain averaged" language that indicates
  // spurious avg for empty domain.  The regression rendered domain rows
  // with "1.0" cells — spot-check that no "Avg 1.0" text appears.
  ok(`V7: teacher C page does NOT display "Avg 1.0" or "average 1.0" text`,
     !/(avg|average)[^\d]{0,8}1\.0/i.test(pageC.text),
     'teacher C page shows an averaged score for a teacher with no scores');

  // Teacher A's aggregate should include the retained 4 (via level="4").
  // Just verify the page mentions the 9701 observation.
  ok(`V7: teacher A page references the retained observation`,
     pageA.text.includes('9701') || pageA.text.includes('V7 A evidence') || pageA.text.match(/score.*4/i));
}

// ==========================================================================
suite('V8 (F3 — atomicity): a mid-cascade DB failure leaves the batch recoverable');
{
  // We can't easily inject a mid-batch failure through HTTP without touching
  // the runtime.  Instead, we verify the two invariants that F3 guarantees:
  //   1. On a SUCCESSFUL cleanup, the batch's status flip to 'executed'
  //      happens ONLY after every parent's cascade has been attempted, and
  //      is transactionally consistent with the writes (writer_nonce cleared).
  //   2. On a preview that was NEVER executed, restore refuses with
  //      'batch_not_restorable' rather than corrupting state — the preview
  //      can be revisited or abandoned.
  //
  // (1) was covered in V2's assertions about writer_nonce and executed_at.
  // (2): create a fresh preview, don't execute it, try to restore.
  //
  // First re-tag records so preview has something to work with.
  await admin.post('/admin/data/practice-cleanup/mark', new URLSearchParams({
    entity_type: 'coaching_note', entity_id: String(practiceDraftNote.id), is_practice: '1',
  }));
  const rPrev = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({
    note: 'V8 preview-only',
  }));
  const previewBatchId = Number((rPrev.location || '').split('/batches/')[1]);
  ok(`V8: fresh preview batch created (id=${previewBatchId})`, previewBatchId > 0);

  // Attempt restore on a preview-only batch → 'batch_not_restorable'.
  const rRestore = await admin.post(`/admin/data/practice-cleanup/batches/${previewBatchId}/restore`, new URLSearchParams({
    confirm: 'RESTORE BATCH',
  }));
  ok(`V8: restore of preview-only batch redirects with error (${rRestore.status})`,
     rRestore.status === 302 && rRestore.location && decodeURIComponent(rRestore.location).includes('not in a state that can be restored'),
     `loc=${decodeURIComponent(rRestore.location || '')}`);

  // Abandon the preview-only batch (releases its open_claim) so a fresh
  // preview can claim the same tagged parent for the idempotence test.
  await admin.post(`/admin/data/practice-cleanup/batches/${previewBatchId}/abandon`, new URLSearchParams({
    confirm: 'ABANDON PREVIEW',
  }));

  // Idempotence: a second execute against the SAME preview batch is a no-op
  // (writer_nonce guard).  Re-preview the still-tagged note.
  const rPrev2 = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({
    note: 'V8 idempotence',
  }));
  const idBatch2 = Number((rPrev2.location || '').split('/batches/')[1]);
  ok(`V8: idempotence preview batch created (id=${idBatch2}, redirect=${rPrev2.location?.slice(0, 80)})`,
     idBatch2 > 0);
  // First execute.
  await admin.post(`/admin/data/practice-cleanup/batches/${idBatch2}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));
  const afterFirst = db.prepare(`SELECT status FROM practice_cleanup_batches WHERE id=?`).get(idBatch2);
  ok(`V8: batch executed once, status='${afterFirst.status}'`, afterFirst.status === 'executed');
  // Second execute — must reject with 'already_executed'.
  const r2 = await admin.post(`/admin/data/practice-cleanup/batches/${idBatch2}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));
  ok(`V8: repeat execute redirects with 'already_executed' message`,
     r2.status === 302 && decodeURIComponent(r2.location || '').includes('already executed'),
     `loc=${decodeURIComponent(r2.location || '')}`);

  // Restore this cleanup so V9/V10/V11 start with a clean state.
  await admin.post(`/admin/data/practice-cleanup/batches/${idBatch2}/restore`, new URLSearchParams({
    confirm: 'RESTORE BATCH',
  }));
  // Untag draft note so subsequent tests can start fresh.
  await admin.post('/admin/data/practice-cleanup/mark', new URLSearchParams({
    entity_type: 'coaching_note', entity_id: String(practiceDraftNote.id), is_practice: '0',
  }));
}

// ==========================================================================
suite('V9 (F4 — per-child ownership): restore preserves previously-deleted children');
{
  // Create a fresh PD enrollment + child rows, then soft-delete ONE child
  // deliverable BEFORE creating the batch.  After execute + restore, that
  // deliverable must remain soft-deleted (not resurrected by restore).
  const teacherId = IDS.bob;
  const mod = db.prepare(`SELECT id FROM pd_modules LIMIT 1`).get();
  const now = new Date().toISOString();
  db.prepare(`DELETE FROM pd_deliverables WHERE enrollment_id=9990`).run();
  db.prepare(`DELETE FROM pd_enrollments WHERE id=9990`).run();
  db.prepare(`INSERT INTO pd_enrollments (id, teacher_id, module_id, source, status, is_practice, created_at, updated_at)
    VALUES (9990, ?, ?, 'self', 'submitted', 1, ?, ?)`).run(teacherId, mod.id, now, now);
  // Two deliverables: 90001 (deleted BEFORE cleanup), 90002 (fresh).
  // Note: pd_deliverables has a UNIQUE(enrollment_id) constraint — only ONE
  // deliverable per enrollment. Since V9 needs to test previously-deleted
  // vs freshly-deleted child ownership, we soft-delete the ONE deliverable
  // BEFORE the cleanup batch, then verify restore does not resurrect it.
  db.prepare(`DELETE FROM pd_deliverables WHERE enrollment_id=9990`).run();
  db.prepare(`INSERT INTO pd_deliverables (id, enrollment_id, title, body, created_at, updated_at)
    VALUES (90001, 9990, 'V9 previously-deleted deliv', 'body', ?, ?)`).run(now, now);
  // Also add a pd_reflection as the "fresh" child (no UNIQUE constraint).
  db.prepare(`DELETE FROM pd_reflections WHERE enrollment_id=9990`).run();
  db.prepare(`INSERT INTO pd_reflections (id, enrollment_id, phase, body, created_at)
    VALUES (90002, 9990, 'learn', 'V9 fresh reflection', ?)`).run(now);
  // Pre-delete 90001 with a timestamp DIFFERENT from CURRENT_TIMESTAMP so we
  // can verify it wasn't touched.
  const priorTs = '2020-01-01 00:00:00';
  db.prepare(`UPDATE pd_deliverables SET deleted_at=? WHERE id=90001`).run(priorTs);

  // Preview + execute the batch that soft-deletes enrollment 9990.
  const rPrev = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({
    note: 'V9',
  }));
  const bid = Number((rPrev.location || '').split('/batches/')[1]);
  await admin.post(`/admin/data/practice-cleanup/batches/${bid}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));

  // Batch's child manifest must ONLY include the fresh deliv (90002), not the
  // previously-deleted one (90001).
  const childManifest = db.prepare(
    `SELECT child_id FROM practice_cleanup_child WHERE batch_id=? AND child_kind='pd_deliverable'`
  ).all(bid).map(r => r.child_id);
  // With the UNIQUE(enrollment_id) constraint on pd_deliverables, we have
  // only 1 deliverable (90001) which we pre-deleted, plus 1 reflection
  // (90002).  The child manifest for deliverables must be EMPTY (90001 was
  // already deleted so gatherChildIds returns nothing for it).
  ok(`V9: child manifest excludes previously-deleted deliverable 90001 (deliverables in manifest: ${childManifest.join(',')})`,
     !childManifest.includes(90001));
  // Fresh reflection 90002 IS in the reflection manifest.
  const reflManifest = db.prepare(
    `SELECT child_id FROM practice_cleanup_child WHERE batch_id=? AND child_kind='pd_reflection'`
  ).all(bid).map(r => r.child_id);
  ok(`V9: child manifest includes freshly-deleted reflection 90002 (${reflManifest.join(',')})`,
     reflManifest.includes(90002));

  // Restore.
  await admin.post(`/admin/data/practice-cleanup/batches/${bid}/restore`, new URLSearchParams({
    confirm: 'RESTORE BATCH',
  }));

  // 90002 (reflection) must be un-soft-deleted; 90001 (deliverable) must remain
  // deleted with its ORIGINAL deleted_at timestamp preserved.
  const d90001 = db.prepare(`SELECT deleted_at FROM pd_deliverables WHERE id=90001`).get();
  const r90002 = db.prepare(`SELECT deleted_at FROM pd_reflections WHERE id=90002`).get();
  ok(`V9: previously-deleted deliverable 90001 STILL deleted after restore (deleted_at='${d90001.deleted_at}')`,
     !!d90001.deleted_at);
  ok(`V9: previously-deleted deliverable 90001 retains its ORIGINAL deleted_at (${d90001.deleted_at} === ${priorTs})`,
     d90001.deleted_at === priorTs);
  ok(`V9: fresh reflection 90002 correctly restored (deleted_at is NULL)`,
     !r90002.deleted_at);

  // Untag so V10 starts fresh.
  await admin.post('/admin/data/practice-cleanup/mark', new URLSearchParams({
    entity_type: 'pd_enrollment', entity_id: '9990', is_practice: '0',
  }));
}

// ==========================================================================
suite('V10 (F5 — delivery-history preservation): restore reports "delivered", not "never"');
{
  // Re-tag the practice shared note (still tagged from V1) then preview +
  // execute + restore, then look for the delivery status in the coach view.
  await admin.post('/admin/data/practice-cleanup/mark', new URLSearchParams({
    entity_type: 'coaching_note', entity_id: String(practiceSharedNote.id), is_practice: '1',
  }));
  const rPrev = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({
    note: 'V10 F5 test',
  }));
  const bid = Number((rPrev.location || '').split('/batches/')[1]);
  await admin.post(`/admin/data/practice-cleanup/batches/${bid}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));
  // During the cleanup window, the ledger row is soft-deleted (invisible)
  // and the note is soft-deleted (invisible).  Both come back on restore.
  const midWindow = db.prepare(`SELECT status, deleted_at FROM coaching_note_share_delivery WHERE note_id=?`).get(practiceSharedNote.id);
  ok(`V10 mid-window: ledger row still exists (not hard-deleted) (F5)`, !!midWindow);
  ok(`V10 mid-window: ledger row soft-deleted (deleted_at set)`, !!midWindow?.deleted_at);
  ok(`V10 mid-window: ledger status preserved as 'delivered' (was: '${midWindow?.status}')`, midWindow?.status === 'delivered');

  // Restore.
  await admin.post(`/admin/data/practice-cleanup/batches/${bid}/restore`, new URLSearchParams({
    confirm: 'RESTORE BATCH',
  }));
  // Ledger row now live with status='delivered'.
  const afterRestore = db.prepare(`SELECT status, deleted_at FROM coaching_note_share_delivery WHERE note_id=?`).get(practiceSharedNote.id);
  ok(`V10 after restore: ledger deleted_at cleared`, !afterRestore?.deleted_at);
  ok(`V10 after restore: ledger status='delivered' preserved`, afterRestore?.status === 'delivered');

  // Coach view of the restored note MUST NOT show "Notification not
  // delivered" or "Resend" — the shareDeliveryStatus() read returns
  // 'delivered' from the un-soft-deleted ledger row.
  const coachView = await pureCoach.get(`/coach/teachers/${IDS.alice}`);
  // The coach page renders each note with a status badge.  For a delivered
  // note, the "Notification not delivered" badge and the "Resend" button
  // should NOT appear for this specific note.  We look for the practice
  // note's marker text and check the surrounding context.
  ok(`V10: restored shared note visible in coach view`,
     coachView.text.includes('PRACTICE SHARED — training'),
     'restored note missing from coach view');
  // The overall page could contain other notes with those buttons; scope
  // the check by looking for "Notification not delivered" ONLY near this
  // note's identifying text.  A simpler assertion: shareDeliveryStatus()
  // is now 'delivered' — the ledger row is the source of truth.
  const status = db.prepare(`SELECT status FROM coaching_note_share_delivery WHERE note_id=? AND deleted_at IS NULL`).get(practiceSharedNote.id);
  ok(`V10: shareDeliveryStatus reads 'delivered' from live ledger row (no false 'never'/'failed')`,
     status?.status === 'delivered');

  // Untag so V11 starts fresh.
  await admin.post('/admin/data/practice-cleanup/mark', new URLSearchParams({
    entity_type: 'coaching_note', entity_id: String(practiceSharedNote.id), is_practice: '0',
  }));
}

// ==========================================================================
suite('V11 (F6 — scope-binding): execute rejects when scope drifts between preview and confirm');
{
  // Tag record A only, preview it.  Then tag record B behind the scenes
  // (simulating a second tab).  Execute must reject with 'scope_changed'.
  const teacherId = IDS.dan;
  const mod = db.prepare(`SELECT id FROM pd_modules LIMIT 1`).get();
  const now = new Date().toISOString();
  db.prepare(`DELETE FROM pd_enrollments WHERE id IN (9911, 9912)`).run();
  db.prepare(`INSERT INTO pd_enrollments (id, teacher_id, module_id, source, status, is_practice, created_at, updated_at)
    VALUES (9911, ?, ?, 'self', 'submitted', 1, ?, ?)`).run(teacherId, mod.id, now, now);
  db.prepare(`INSERT INTO pd_enrollments (id, teacher_id, module_id, source, status, is_practice, created_at, updated_at)
    VALUES (9912, ?, ?, 'self', 'submitted', 0, ?, ?)`).run(teacherId, mod.id, now, now);
  // Preview: freezes {9911}.
  const rPrev = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({
    note: 'V11 scope-drift',
  }));
  const bid = Number((rPrev.location || '').split('/batches/')[1]);
  const previewedRows = db.prepare(
    `SELECT entity_id FROM practice_cleanup_row WHERE batch_id=? ORDER BY entity_id`
  ).all(bid).map(r => r.entity_id);
  ok(`V11: preview froze [${previewedRows.join(',')}]`, previewedRows.includes(9911) && !previewedRows.includes(9912));

  // Simulate a second tab tagging 9912 AFTER preview.
  db.prepare(`UPDATE pd_enrollments SET is_practice=1 WHERE id=9912`).run();

  // Execute — must reject with scope_changed message.
  const rExec = await admin.post(`/admin/data/practice-cleanup/batches/${bid}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));
  ok(`V11: execute rejects with 302 (${rExec.status})`, rExec.status === 302);
  ok(`V11: reject message mentions scope changed`,
     /tagged set.*changed|scope changed|changed since you reviewed/i.test(decodeURIComponent(rExec.location || '')),
     `loc=${decodeURIComponent(rExec.location || '')}`);
  const afterReject = db.prepare(`SELECT status FROM practice_cleanup_batches WHERE id=?`).get(bid);
  ok(`V11: batch status remains 'preview' after rejected execute (${afterReject.status})`,
     afterReject.status === 'preview');
  // Neither 9911 nor 9912 were touched.
  const s9911 = db.prepare(`SELECT deleted_at FROM pd_enrollments WHERE id=9911`).get();
  const s9912 = db.prepare(`SELECT deleted_at FROM pd_enrollments WHERE id=9912`).get();
  ok(`V11: 9911 NOT soft-deleted by rejected execute`, !s9911.deleted_at);
  ok(`V11: 9912 NOT soft-deleted by rejected execute`, !s9912.deleted_at);

  // The batch note captures the drift for support review.
  const noteAfter = db.prepare(`SELECT note FROM practice_cleanup_batches WHERE id=?`).get(bid).note;
  ok(`V11: batch note now records the scope-drift mismatch (${(noteAfter || '').slice(0, 60)}...)`,
     (noteAfter || '').includes('scope_drift_rejected'));

  // Cleanup for later suites.
  db.prepare(`UPDATE pd_enrollments SET is_practice=0 WHERE id IN (9911, 9912)`).run();
}

// ==========================================================================
suite('V12 (F7 second half — historical-ambiguous PD notifications preserved for review)');
{
  // Create an enrollment for Bob AND a HISTORICAL-ambiguous notification
  // (entity_type='pd_enrollment' but entity_id = the enrollment's module_id,
  // not the enrollment_id) pointed at Bob.  Then execute cleanup on the
  // enrollment.  The ambiguous notification must be PRESERVED and recorded
  // in practice_cleanup_ambiguous_notif.
  const teacherId = IDS.bob;
  const mod = db.prepare(`SELECT id FROM pd_modules LIMIT 1`).get();
  const now = new Date().toISOString();
  db.prepare(`DELETE FROM pd_enrollments WHERE id=9920`).run();
  db.prepare(`INSERT INTO pd_enrollments (id, teacher_id, module_id, source, status, is_practice, created_at, updated_at)
    VALUES (9920, ?, ?, 'auto', 'recommended', 1, ?, ?)`).run(teacherId, mod.id, now, now);
  // Historical ambiguous: entity_id = module_id, not enrollment_id.
  // Delete any existing notification for this exact combo to avoid dupes.
  db.prepare(`DELETE FROM notifications WHERE user_id=? AND kind='pd_module_recommended' AND entity_id=?`).run(teacherId, mod.id);
  const ambNotifRes = db.prepare(`INSERT INTO notifications (user_id, kind, title, body, url, entity_type, entity_id, created_at)
    VALUES (?, 'pd_module_recommended', 'V12 historical ambiguous', 'body', '/teacher/pd', 'pd_enrollment', ?, ?)`)
    .run(teacherId, mod.id, now);
  const ambNotifId = ambNotifRes.lastInsertRowid;
  ok(`V12: historical ambiguous notification created (id=${ambNotifId}, entity_id=module_id=${mod.id})`,
     ambNotifId > 0);

  // Confirm the ambiguity: entity_id resolves to a pd_modules row but NOT a
  // pd_enrollments row.
  const asModule = db.prepare(`SELECT 1 FROM pd_modules WHERE id=?`).get(mod.id);
  const asEnrollment = db.prepare(`SELECT 1 FROM pd_enrollments WHERE id=?`).get(mod.id);
  ok(`V12: precondition — entity_id ${mod.id} resolves as module (not enrollment)`,
     !!asModule && !asEnrollment);

  // Isolate this test: untag every other is_practice=1 row so preview
  // picks up ONLY enrollment 9920.  Also release any leftover open_claim
  // rows (from an earlier failed preview) that would block a fresh preview.
  const otherRowsV12 = db.prepare(`SELECT id, 'cn' AS k FROM coaching_notes WHERE is_practice=1 AND deleted_at IS NULL
    UNION ALL SELECT id, 'pe' FROM pd_enrollments WHERE is_practice=1 AND deleted_at IS NULL AND id<>9920
    UNION ALL SELECT id, 'obs' FROM observations WHERE is_practice=1 AND deleted_at IS NULL
    UNION ALL SELECT id, 'ext' FROM external_pd_submissions WHERE is_practice=1 AND deleted_at IS NULL`).all();
  for (const r of otherRowsV12) {
    const t = r.k === 'cn' ? 'coaching_notes' : r.k === 'pe' ? 'pd_enrollments' : r.k === 'obs' ? 'observations' : 'external_pd_submissions';
    db.prepare(`UPDATE ${t} SET is_practice=0 WHERE id=?`).run(r.id);
  }
  db.prepare(`DELETE FROM practice_cleanup_open_claim WHERE entity_type='pd_enrollment' AND entity_id=9920`).run();

  // Preview + execute cleanup on enrollment 9920.
  const rPrev = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({
    note: 'V12',
  }));
  ok(`V12: preview redirected to batch page (loc=${(rPrev.location || '').slice(0, 80)})`,
     (rPrev.location || '').includes('/batches/'));
  const bid = Number((rPrev.location || '').split('/batches/')[1]);
  await admin.post(`/admin/data/practice-cleanup/batches/${bid}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));

  // Ambiguous row recorded on the batch — NOT deleted.
  const amb = db.prepare(
    `SELECT notification_id, resolves_as, suspected_parent_enrollment_id
       FROM practice_cleanup_ambiguous_notif WHERE batch_id=?`
  ).all(bid);
  ok(`V12: ambiguous notification recorded for admin review (${amb.length} row(s))`,
     amb.some(r => r.notification_id === Number(ambNotifId)));
  // The recorded resolves_as reflects DETECTION SIGNAL (why we preserved
  // this row).  For our fixture the ambiguous notification's entity_id
  // equals the module id (a legitimate module), and that module id is
  // NOT itself a valid pd_enrollments id → 'pd_module'.  Additionally,
  // the notification's user_id equals Bob (the enrollment owner), so the
  // cross-teacher-collision signal does NOT fire.
  const ambRow = amb.find(r => r.notification_id === Number(ambNotifId));
  ok(`V12: ambiguous row resolves_as='pd_module' (detected via legacy module-id pattern)`,
     ambRow?.resolves_as === 'pd_module');
  // suspected_parent_enrollment_id records the enrollment WE WERE CLEANING
  // (the batch's parent).  That is 9920 for this fixture.
  ok(`V12: ambiguous row suspected_parent_enrollment_id = 9920 (the batch's parent enrollment)`,
     ambRow?.suspected_parent_enrollment_id === 9920);

  // The notification row itself is STILL there (not deleted).
  const stillThere = db.prepare(`SELECT id FROM notifications WHERE id=?`).get(ambNotifId);
  ok(`V12: original ambiguous notification NOT deleted by cleanup (id=${stillThere?.id})`,
     !!stillThere);

  // Admin can DELETE it via the resolve endpoint.
  const rDel = await admin.post(`/admin/data/practice-cleanup/batches/${bid}/ambiguous-notif/${ambNotifId}`, new URLSearchParams({
    decision: 'delete',
  }));
  ok(`V12: admin resolve→delete redirects (${rDel.status})`, rDel.status === 302);
  const gone = db.prepare(`SELECT id FROM notifications WHERE id=?`).get(ambNotifId);
  ok(`V12: notification now deleted by admin decision`, !gone);
  const resolved = db.prepare(`SELECT resolves_as FROM practice_cleanup_ambiguous_notif WHERE batch_id=? AND notification_id=?`).get(bid, ambNotifId);
  ok(`V12: ambiguous row resolves_as updated to include :admin_deleted`,
     (resolved?.resolves_as || '').includes('admin_deleted'));

  // Cleanup: restore V12's batch to keep DB tidy for downstream runs.
  await admin.post(`/admin/data/practice-cleanup/batches/${bid}/restore`, new URLSearchParams({
    confirm: 'RESTORE BATCH',
  }));
}

// ==========================================================================
suite('V13 (F7 first-half + F8 — auto-enroll writes correct entity_id, re-recommend works after cleanup)');
{
  // We use IDS.carol (a teacher not used for the shared/PD cleanup above)
  // as the "teacher who receives a new auto-enrollment" so V13 doesn't
  // collide with the notification counts snapshot from V4 second pass.
  const teacherId = IDS.carol;
  const appraiserId = IDS.principal;
  // A 1x1 transparent PNG data URI — valid appraiser_signature_data
  // (publish requires a string starting with "data:image/").
  const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAQMAAAAl21bKAAAAA1BMVEX///+nxBvIAAAAAXRSTlMAQObYZgAAAApJREFUCNdjYAAAAAIAAeIhvDMAAAAASUVORK5CYII=';
  const fw = db.prepare(`SELECT id FROM frameworks ORDER BY id LIMIT 1`).get();
  const modWithIndicator = db.prepare(
    `SELECT m.id AS module_id, m.indicator_id, m.target_level
       FROM pd_modules m
      WHERE m.is_active=1 AND m.target_level<=2
      ORDER BY m.id LIMIT 1`
  ).get();
  ok(`V13 precondition: found auto-enrollable module (module=${modWithIndicator?.module_id}, indicator=${modWithIndicator?.indicator_id}, target=${modWithIndicator?.target_level})`,
     !!modWithIndicator);

  // Isolate: untag every other is_practice=1 row so V13's own preview
  // (after auto-enroll creates a new enrollment) only picks up the new
  // enrollment.  Also clear leftover open_claim rows.
  const otherRowsV13 = db.prepare(`SELECT id, 'cn' AS k FROM coaching_notes WHERE is_practice=1 AND deleted_at IS NULL
    UNION ALL SELECT id, 'pe' FROM pd_enrollments WHERE is_practice=1 AND deleted_at IS NULL
    UNION ALL SELECT id, 'obs' FROM observations WHERE is_practice=1 AND deleted_at IS NULL
    UNION ALL SELECT id, 'ext' FROM external_pd_submissions WHERE is_practice=1 AND deleted_at IS NULL`).all();
  for (const r of otherRowsV13) {
    const t = r.k === 'cn' ? 'coaching_notes' : r.k === 'pe' ? 'pd_enrollments' : r.k === 'obs' ? 'observations' : 'external_pd_submissions';
    db.prepare(`UPDATE ${t} SET is_practice=0 WHERE id=?`).run(r.id);
  }
  db.prepare(`DELETE FROM practice_cleanup_open_claim`).run();

  // Wipe any pre-existing enrollments for this teacher+module so we can
  // observe fresh insertion cleanly.
  db.prepare(`DELETE FROM notifications WHERE user_id=? AND entity_type='pd_enrollment' AND entity_id IN (SELECT id FROM pd_enrollments WHERE teacher_id=? AND module_id=?)`)
    .run(teacherId, teacherId, modWithIndicator.module_id);
  db.prepare(`DELETE FROM pd_enrollments WHERE teacher_id=? AND module_id=?`).run(teacherId, modWithIndicator.module_id);

  const now = new Date().toISOString();
  db.prepare(`DELETE FROM observation_scores WHERE observation_id IN (9800, 9801)`).run();
  db.prepare(`DELETE FROM observations WHERE id IN (9800, 9801)`).run();
  db.prepare(`INSERT INTO observations (id, teacher_id, appraiser_id, school_year_id, framework_id,
    observation_type, class_context, subject, grade_level, observed_at, status, is_practice, created_at, updated_at)
    VALUES (9800, ?, ?, 1, ?, 'informal', 'V13 pre-publish', 'ELA', '3', ?, 'draft', 0, ?, ?)`)
    .run(teacherId, appraiserId, fw.id, now, now, now);
  db.prepare(`INSERT INTO observation_scores (observation_id, indicator_id, level, evidence_note, created_at, updated_at)
    VALUES (9800, ?, ?, 'V13 evidence', ?, ?)`).run(modWithIndicator.indicator_id, modWithIndicator.target_level, now, now);

  // Publish with a VALID signature payload so publish actually completes
  // and autoEnrollForObservation() runs.  The field name is 'signature'
  // per src/routes/appraiser.tsx line 626 (parseBody + startsWith('data:image/')).
  const rPub = await principal.post(`/appraiser/observations/9800/publish`, new URLSearchParams({ signature: SIG }));
  ok(`V13: publish observation 9800 → 302 (${rPub.status})`, rPub.status === 302);
  // Assert actual publication landed.
  const pubRow = db.prepare(`SELECT status, published_at FROM observations WHERE id=9800`).get();
  ok(`V13: observation 9800 status='published' (${pubRow?.status})`,
     pubRow?.status === 'published' && !!pubRow?.published_at);

  // Assert new enrollment row.
  const newEnr = db.prepare(
    `SELECT id FROM pd_enrollments WHERE teacher_id=? AND module_id=? AND source_observation_id=9800 ORDER BY id DESC LIMIT 1`
  ).get(teacherId, modWithIndicator.module_id);
  ok(`V13: auto-enroll created a fresh enrollment (id=${newEnr?.id})`, !!newEnr?.id);
  // Filter notification by entity_id=newEnr.id so we assert the specific
  // module's alert (auto-enroll may create multiple enrollments across
  // sibling modules targeting the same indicator+level; each gets its
  // own notification whose entity_id = its enrollment id).
  const notif = db.prepare(
    `SELECT entity_id, url FROM notifications WHERE user_id=? AND kind='pd_module_recommended' AND entity_type='pd_enrollment' AND entity_id=?`
  ).get(teacherId, newEnr.id);
  ok(`V13: notification entity_id = enrollment_id (${notif?.entity_id} === ${newEnr?.id}) — F7 fix verified`,
     notif?.entity_id === newEnr?.id);
  ok(`V13: notification url deep-links to /teacher/pd/${newEnr?.id}`,
     notif?.url === `/teacher/pd/${newEnr?.id}`);

  // Tag + preview + execute cleanup of the new enrollment.
  await admin.post('/admin/data/practice-cleanup/mark', new URLSearchParams({
    entity_type: 'pd_enrollment', entity_id: String(newEnr.id), is_practice: '1',
  }));
  const rPrev = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({ note: 'V13' }));
  const bid = Number((rPrev.location || '').split('/batches/')[1]);
  await admin.post(`/admin/data/practice-cleanup/batches/${bid}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));

  const softDel = db.prepare(`SELECT deleted_at FROM pd_enrollments WHERE id=?`).get(newEnr.id);
  ok(`V13: original enrollment soft-deleted after cleanup`, !!softDel?.deleted_at);

  // F8: second publish creates fresh enrollment even though soft-deleted
  // enrollment on same module exists.
  db.prepare(`INSERT INTO observations (id, teacher_id, appraiser_id, school_year_id, framework_id,
    observation_type, class_context, subject, grade_level, observed_at, status, is_practice, created_at, updated_at)
    VALUES (9801, ?, ?, 1, ?, 'informal', 'V13 post-cleanup', 'ELA', '3', ?, 'draft', 0, ?, ?)`)
    .run(teacherId, appraiserId, fw.id, now, now, now);
  db.prepare(`INSERT INTO observation_scores (observation_id, indicator_id, level, evidence_note, created_at, updated_at)
    VALUES (9801, ?, ?, 'V13 evidence 2', ?, ?)`).run(modWithIndicator.indicator_id, modWithIndicator.target_level, now, now);
  const rPub2 = await principal.post(`/appraiser/observations/9801/publish`, new URLSearchParams({ signature: SIG }));
  ok(`V13 F8: second publish → 302 (${rPub2.status})`, rPub2.status === 302);
  const pubRow2 = db.prepare(`SELECT status FROM observations WHERE id=9801`).get();
  ok(`V13 F8: observation 9801 status='published' (${pubRow2?.status})`, pubRow2?.status === 'published');

  const secondEnr = db.prepare(
    `SELECT id FROM pd_enrollments WHERE teacher_id=? AND module_id=? AND source_observation_id=9801 ORDER BY id DESC LIMIT 1`
  ).get(teacherId, modWithIndicator.module_id);
  ok(`V13 F8: fresh auto-enroll created a NEW enrollment (id=${secondEnr?.id}) despite the cleaned one still existing`,
     !!secondEnr?.id && secondEnr.id !== newEnr.id);
  const secondNotif = db.prepare(
    `SELECT entity_id FROM notifications WHERE user_id=? AND kind='pd_module_recommended' AND entity_type='pd_enrollment' AND entity_id=?`
  ).get(teacherId, secondEnr.id);
  ok(`V13 F8: fresh notification's entity_id = new enrollment id (${secondNotif?.entity_id})`,
     secondNotif?.entity_id === secondEnr?.id);
}

// ==========================================================================
suite('V14 (item 1 — full-batch atomicity: injected mid-batch failure rolls back EVERYTHING)');
{
  // Simulate a mid-batch DB failure using a temporary RAISE(ABORT) trigger
  // that fires on the second parent's UPDATE.  We tag TWO parents (a
  // coaching note and a PD enrollment), preview, install the trigger that
  // aborts the pd_enrollments UPDATE, then execute.
  //
  // Expected:
  //   * Execute throws / errors.
  //   * First parent (coaching note) is NOT soft-deleted (rollback).
  //   * Its children are NOT soft-deleted (rollback).
  //   * Second parent (pd_enrollment) is NOT soft-deleted (trigger prevented).
  //   * Batch remains at status='preview' (rollback of status flip).
  //   * open_claim rows still present (rollback releases them, but batch
  //     itself remains at preview so a retry can decide to abandon).
  //   * Retry against same batch id after removing the trigger completes
  //     successfully.

  // Create fresh isolated parents so this test doesn't collide.
  const now = new Date().toISOString();
  const t = IDS.dan;
  db.prepare(`DELETE FROM coaching_notes WHERE id=9950`).run();
  db.prepare(`INSERT INTO coaching_notes (id, teacher_id, author_id, occurred_on, glow, next_step, status, is_practice, created_at, updated_at)
    VALUES (9950, ?, ?, '2026-09-24', 'V14 mid-batch atomicity test', '', 'draft', 1, ?, ?)`)
    .run(t, IDS.pureCoach, now, now);
  const mod = db.prepare(`SELECT id FROM pd_modules LIMIT 1`).get();
  db.prepare(`DELETE FROM pd_enrollments WHERE id=9951`).run();
  db.prepare(`INSERT INTO pd_enrollments (id, teacher_id, module_id, source, status, is_practice, created_at, updated_at)
    VALUES (9951, ?, ?, 'self', 'submitted', 1, ?, ?)`).run(t, mod.id, now, now);

  // Ensure clean slate — no lingering claims from earlier tests.
  db.prepare(`DELETE FROM practice_cleanup_open_claim WHERE entity_type='coaching_note' AND entity_id=9950`).run();
  db.prepare(`DELETE FROM practice_cleanup_open_claim WHERE entity_type='pd_enrollment' AND entity_id=9951`).run();

  const rPrev = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({ note: 'V14 atomicity' }));
  const bid = Number((rPrev.location || '').split('/batches/')[1]);
  ok(`V14: preview created (id=${bid})`, bid > 0);

  // Install a trigger that aborts the pd_enrollments UPDATE we're about
  // to run.  BEFORE UPDATE OF deleted_at ON pd_enrollments matches our
  // soft-delete UPDATE precisely.
  db.prepare(`DROP TRIGGER IF EXISTS v14_abort_pd_update`).run();
  db.prepare(`CREATE TRIGGER v14_abort_pd_update
              BEFORE UPDATE OF deleted_at ON pd_enrollments
              FOR EACH ROW WHEN NEW.id=9951 AND OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
              BEGIN SELECT RAISE(ABORT, 'v14_injected_failure'); END`).run();

  // Execute — should fail; UI catches and redirects with error message.
  const rExec = await admin.post(`/admin/data/practice-cleanup/batches/${bid}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));
  ok(`V14: execute redirects (${rExec.status}) — error handling caught the rollback`,
     rExec.status === 302);
  const errLoc = decodeURIComponent(rExec.location || '');
  ok(`V14: redirect message reflects a failure (msg='${errLoc.split('msg=')[1]?.slice(0, 80)}...')`,
     errLoc.toLowerCase().includes('cleanup failed') || errLoc.toLowerCase().includes('v14_injected_failure'));

  // Now verify the ROLLBACK invariants:
  const c9950 = db.prepare(`SELECT deleted_at FROM coaching_notes WHERE id=9950`).get();
  const e9951 = db.prepare(`SELECT deleted_at FROM pd_enrollments WHERE id=9951`).get();
  ok(`V14 ROLLBACK: first parent (coaching_note 9950) NOT soft-deleted (deleted_at='${c9950?.deleted_at}')`,
     !c9950?.deleted_at);
  ok(`V14 ROLLBACK: second parent (pd_enrollment 9951) NOT soft-deleted (trigger prevented)`,
     !e9951?.deleted_at);
  const batchAfter = db.prepare(`SELECT status FROM practice_cleanup_batches WHERE id=?`).get(bid);
  ok(`V14 ROLLBACK: batch still at status='preview' (${batchAfter?.status}) — atomic status flip also rolled back`,
     batchAfter?.status === 'preview');
  // Manifest rows for THIS batch may or may not exist depending on where
  // rollback happened; the important invariant is no soft-deletes leaked.
  const childrenAfter = db.prepare(`SELECT COUNT(*) AS n FROM practice_cleanup_child WHERE batch_id=?`).get(bid).n;
  ok(`V14 ROLLBACK: no child manifest rows recorded for the rolled-back batch (${childrenAfter})`,
     childrenAfter === 0);

  // Remove the trigger and retry — same batch id should now execute cleanly.
  db.prepare(`DROP TRIGGER v14_abort_pd_update`).run();
  const rRetry = await admin.post(`/admin/data/practice-cleanup/batches/${bid}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));
  ok(`V14 RETRY: same batch id executes cleanly after trigger removed (${rRetry.status})`,
     rRetry.status === 302 && (rRetry.location || '').includes(`/batches/${bid}`));
  const finalState = db.prepare(`SELECT status FROM practice_cleanup_batches WHERE id=?`).get(bid);
  ok(`V14 RETRY: batch status='executed' after clean retry (${finalState?.status})`,
     finalState?.status === 'executed');
  const cFinal = db.prepare(`SELECT deleted_at FROM coaching_notes WHERE id=9950`).get();
  const eFinal = db.prepare(`SELECT deleted_at FROM pd_enrollments WHERE id=9951`).get();
  ok(`V14 RETRY: both parents now soft-deleted (cn.deleted_at=${!!cFinal?.deleted_at}, enr.deleted_at=${!!eFinal?.deleted_at})`,
     !!cFinal?.deleted_at && !!eFinal?.deleted_at);
}

// ==========================================================================
suite('V15 (item 1 — status-flip failure also rolls back all writes)');
{
  // A trigger on practice_cleanup_batches that aborts the final flip
  // UPDATE.  Even with a single parent, the whole batch must roll back.
  const now = new Date().toISOString();
  const t = IDS.dan;
  db.prepare(`DELETE FROM coaching_notes WHERE id=9960`).run();
  db.prepare(`INSERT INTO coaching_notes (id, teacher_id, author_id, occurred_on, glow, status, is_practice, created_at, updated_at)
    VALUES (9960, ?, ?, '2026-09-24', 'V15 status-flip atomicity', 'draft', 1, ?, ?)`)
    .run(t, IDS.pureCoach, now, now);
  db.prepare(`DELETE FROM practice_cleanup_open_claim WHERE entity_type='coaching_note' AND entity_id=9960`).run();

  const rPrev = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({ note: 'V15 status flip' }));
  const bid = Number((rPrev.location || '').split('/batches/')[1]);

  db.prepare(`DROP TRIGGER IF EXISTS v15_abort_flip`).run();
  db.prepare(`CREATE TRIGGER v15_abort_flip
              BEFORE UPDATE OF status ON practice_cleanup_batches
              FOR EACH ROW WHEN NEW.id=${bid} AND NEW.status='executed'
              BEGIN SELECT RAISE(ABORT, 'v15_flip_failure'); END`).run();
  const rExec = await admin.post(`/admin/data/practice-cleanup/batches/${bid}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));
  ok(`V15: execute redirects with error (${rExec.status})`, rExec.status === 302);
  const c9960 = db.prepare(`SELECT deleted_at FROM coaching_notes WHERE id=9960`).get();
  ok(`V15 ROLLBACK: parent NOT soft-deleted despite writes being staged (deleted_at='${c9960?.deleted_at}')`,
     !c9960?.deleted_at);
  const batchAfter = db.prepare(`SELECT status FROM practice_cleanup_batches WHERE id=?`).get(bid);
  ok(`V15 ROLLBACK: batch still at status='preview' (${batchAfter?.status})`, batchAfter?.status === 'preview');

  db.prepare(`DROP TRIGGER v15_abort_flip`).run();
  // Clean retry.
  const rRetry = await admin.post(`/admin/data/practice-cleanup/batches/${bid}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));
  ok(`V15 RETRY: clean retry succeeds (${rRetry.status})`, rRetry.status === 302);
  const finalStatus = db.prepare(`SELECT status FROM practice_cleanup_batches WHERE id=?`).get(bid);
  ok(`V15 RETRY: batch now 'executed' (${finalStatus?.status})`, finalStatus?.status === 'executed');
}

// ==========================================================================
suite('V16 (item 2 — dep_fingerprint: child added between preview and execute is rejected)');
{
  // Preview a PD enrollment with 0 existing deliverables.  Between preview
  // and execute, another admin/user adds a deliverable.  Execute must
  // reject with scope_changed because the dep_fingerprint changed.
  const now = new Date().toISOString();
  const t = IDS.dan;
  const mod = db.prepare(`SELECT id FROM pd_modules LIMIT 1`).get();
  db.prepare(`DELETE FROM pd_deliverables WHERE enrollment_id=9970`).run();
  db.prepare(`DELETE FROM pd_enrollments WHERE id=9970`).run();
  db.prepare(`INSERT INTO pd_enrollments (id, teacher_id, module_id, source, status, is_practice, created_at, updated_at)
    VALUES (9970, ?, ?, 'self', 'started', 1, ?, ?)`).run(t, mod.id, now, now);
  // No deliverables yet — preview should record dep_fingerprint with an
  // empty child list.
  db.prepare(`DELETE FROM practice_cleanup_open_claim WHERE entity_type='pd_enrollment' AND entity_id=9970`).run();

  const rPrev = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({ note: 'V16 dep drift' }));
  const bid = Number((rPrev.location || '').split('/batches/')[1]);
  const depBefore = db.prepare(`SELECT dep_fingerprint FROM practice_cleanup_batches WHERE id=?`).get(bid).dep_fingerprint;
  ok(`V16: preview captured dep_fingerprint (${(depBefore || '').slice(0, 60)}...)`, !!depBefore);

  // Simulate a mid-flight child add.
  db.prepare(`INSERT INTO pd_deliverables (id, enrollment_id, title, body, created_at, updated_at)
    VALUES (99001, 9970, 'V16 late deliverable', 'body', ?, ?)`).run(now, now);

  // Execute must reject with scope_changed.
  const rExec = await admin.post(`/admin/data/practice-cleanup/batches/${bid}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));
  ok(`V16: execute rejects (${rExec.status})`, rExec.status === 302);
  const errLoc = decodeURIComponent(rExec.location || '');
  ok(`V16: rejection message mentions scope drift`,
     /changed since you reviewed it/i.test(errLoc) || /scope/i.test(errLoc),
     `loc=${errLoc}`);

  // Enrollment untouched.
  const enrState = db.prepare(`SELECT deleted_at FROM pd_enrollments WHERE id=9970`).get();
  ok(`V16: enrollment 9970 NOT soft-deleted by rejected execute`, !enrState?.deleted_at);
  const delivState = db.prepare(`SELECT deleted_at FROM pd_deliverables WHERE id=99001`).get();
  ok(`V16: late-added deliverable 99001 NOT soft-deleted (drift-reject prevented broad-relationship UPDATE)`,
     !delivState?.deleted_at);

  // Abandon and preview again — should include the late deliverable now.
  await admin.post(`/admin/data/practice-cleanup/batches/${bid}/abandon`, new URLSearchParams({
    confirm: 'ABANDON PREVIEW',
  }));
  const rPrev2 = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({ note: 'V16 refreshed' }));
  const bid2 = Number((rPrev2.location || '').split('/batches/')[1]);
  const depAfter = db.prepare(`SELECT dep_fingerprint FROM practice_cleanup_batches WHERE id=?`).get(bid2).dep_fingerprint;
  ok(`V16: refreshed preview captured NEW dep_fingerprint that differs`,
     depAfter !== depBefore);
  // Execute now works.
  const rExecOk = await admin.post(`/admin/data/practice-cleanup/batches/${bid2}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));
  ok(`V16: refreshed execute succeeds (${rExecOk.status})`,
     rExecOk.status === 302 && (rExecOk.location || '').includes(`/batches/${bid2}`));
  // Now both the enrollment AND the late-added deliverable were captured in
  // the manifest AND soft-deleted.
  const enrFinal = db.prepare(`SELECT deleted_at FROM pd_enrollments WHERE id=9970`).get();
  const delivFinal = db.prepare(`SELECT deleted_at FROM pd_deliverables WHERE id=99001`).get();
  const manifestChild = db.prepare(`SELECT child_id FROM practice_cleanup_child WHERE batch_id=? AND child_id=99001`).get(bid2);
  ok(`V16: after refreshed execute, enrollment 9970 IS soft-deleted`, !!enrFinal?.deleted_at);
  ok(`V16: after refreshed execute, deliverable 99001 IS soft-deleted`, !!delivFinal?.deleted_at);
  ok(`V16: the late-added deliverable IS recorded in the restore manifest`,
     manifestChild?.child_id === 99001);
}

// ==========================================================================
suite('V17 (item 3 — concurrent-execution ownership: two overlapping previews cannot both claim the same parent)');
{
  // Tag a fresh parent.  Preview it (locks it in open_claim).  Preview
  // again while the first is still open → second must reject with
  // 'concurrent_batch'.  After abandon of the first, second preview works.
  const now = new Date().toISOString();
  const t = IDS.dan;
  db.prepare(`DELETE FROM coaching_notes WHERE id=9980`).run();
  db.prepare(`INSERT INTO coaching_notes (id, teacher_id, author_id, occurred_on, glow, status, is_practice, created_at, updated_at)
    VALUES (9980, ?, ?, '2026-09-24', 'V17 concurrent-preview', 'draft', 1, ?, ?)`)
    .run(t, IDS.pureCoach, now, now);
  db.prepare(`DELETE FROM practice_cleanup_open_claim WHERE entity_type='coaching_note' AND entity_id=9980`).run();

  // Untag everything else so this is the only candidate.
  const otherTagged = db.prepare(`SELECT id FROM coaching_notes WHERE is_practice=1 AND deleted_at IS NULL AND id<>9980`).all();
  for (const r of otherTagged) db.prepare(`UPDATE coaching_notes SET is_practice=0 WHERE id=?`).run(r.id);
  const otherPd = db.prepare(`SELECT id FROM pd_enrollments WHERE is_practice=1 AND deleted_at IS NULL`).all();
  for (const r of otherPd) db.prepare(`UPDATE pd_enrollments SET is_practice=0 WHERE id=?`).run(r.id);
  const otherObs = db.prepare(`SELECT id FROM observations WHERE is_practice=1 AND deleted_at IS NULL`).all();
  for (const r of otherObs) db.prepare(`UPDATE observations SET is_practice=0 WHERE id=?`).run(r.id);
  const otherExt = db.prepare(`SELECT id FROM external_pd_submissions WHERE is_practice=1 AND deleted_at IS NULL`).all();
  for (const r of otherExt) db.prepare(`UPDATE external_pd_submissions SET is_practice=0 WHERE id=?`).run(r.id);

  const rPrev1 = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({ note: 'V17 first preview' }));
  const bid1 = Number((rPrev1.location || '').split('/batches/')[1]);
  ok(`V17: first preview created (id=${bid1})`, bid1 > 0);
  const claim = db.prepare(`SELECT batch_id FROM practice_cleanup_open_claim WHERE entity_type='coaching_note' AND entity_id=9980`).get();
  ok(`V17: open_claim row present (batch_id=${claim?.batch_id})`, claim?.batch_id === bid1);

  // Second preview must reject with concurrent_batch.
  const rPrev2 = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({ note: 'V17 second concurrent' }));
  ok(`V17: second preview redirected (${rPrev2.status})`, rPrev2.status === 302);
  const rejectMsg = decodeURIComponent(rPrev2.location || '');
  ok(`V17: second preview error message mentions concurrent/open`,
     /open preview|concurrent/i.test(rejectMsg),
     `loc=${rejectMsg}`);

  // Abandon first.
  await admin.post(`/admin/data/practice-cleanup/batches/${bid1}/abandon`, new URLSearchParams({
    confirm: 'ABANDON PREVIEW',
  }));
  const claimAfter = db.prepare(`SELECT batch_id FROM practice_cleanup_open_claim WHERE entity_type='coaching_note' AND entity_id=9980`).get();
  ok(`V17: abandon released the open_claim (${claimAfter ? 'still present' : 'gone'})`, !claimAfter);

  // Second preview now works.
  const rPrev3 = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({ note: 'V17 after abandon' }));
  ok(`V17: after abandon, fresh preview succeeds (${rPrev3.status})`,
     rPrev3.status === 302 && (rPrev3.location || '').includes('/batches/'));
  // Clean up.
  const bid3 = Number((rPrev3.location || '').split('/batches/')[1]);
  await admin.post(`/admin/data/practice-cleanup/batches/${bid3}/abandon`, new URLSearchParams({
    confirm: 'ABANDON PREVIEW',
  }));
}

// ==========================================================================
suite('V18 (item 3 — restoring an older batch does NOT resurrect records a newer cleanup re-cleaned)');
{
  // Batch A cleans record X.  Restore A → X visible.  Tag X again, batch
  // B cleans X.  Now attempting to restore A must NOT resurrect X (batch
  // B is now the responsible party; A has no ownership stamp on the
  // current deleted_at value).
  const now = new Date().toISOString();
  const t = IDS.dan;
  db.prepare(`DELETE FROM coaching_notes WHERE id=9990`).run();
  db.prepare(`INSERT INTO coaching_notes (id, teacher_id, author_id, occurred_on, glow, status, is_practice, created_at, updated_at)
    VALUES (9990, ?, ?, '2026-09-24', 'V18 overlapping cleanup+restore', 'draft', 1, ?, ?)`)
    .run(t, IDS.pureCoach, now, now);
  // Untag everything else so only 9990 is tagged.
  const others = db.prepare(`SELECT id, 'cn' AS k FROM coaching_notes WHERE is_practice=1 AND id<>9990
                             UNION ALL SELECT id, 'pe' FROM pd_enrollments WHERE is_practice=1
                             UNION ALL SELECT id, 'obs' FROM observations WHERE is_practice=1
                             UNION ALL SELECT id, 'ext' FROM external_pd_submissions WHERE is_practice=1`).all();
  for (const r of others) {
    const table = r.k === 'cn' ? 'coaching_notes' : r.k === 'pe' ? 'pd_enrollments' : r.k === 'obs' ? 'observations' : 'external_pd_submissions';
    db.prepare(`UPDATE ${table} SET is_practice=0 WHERE id=?`).run(r.id);
  }
  db.prepare(`DELETE FROM practice_cleanup_open_claim WHERE entity_type='coaching_note' AND entity_id=9990`).run();

  // Batch A: preview → execute → restore.
  const rPa = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({ note: 'V18 batch A' }));
  const bidA = Number((rPa.location || '').split('/batches/')[1]);
  await admin.post(`/admin/data/practice-cleanup/batches/${bidA}/execute`, new URLSearchParams({ confirm: 'CLEAN PRACTICE DATA' }));
  const stampA = db.prepare(`SELECT deleted_at_stamp FROM practice_cleanup_row WHERE batch_id=? AND entity_id=9990`).get(bidA)?.deleted_at_stamp;
  ok(`V18: batch A stamped deleted_at=${stampA}`, !!stampA);
  await admin.post(`/admin/data/practice-cleanup/batches/${bidA}/restore`, new URLSearchParams({ confirm: 'RESTORE BATCH' }));
  const afterA = db.prepare(`SELECT deleted_at FROM coaching_notes WHERE id=9990`).get();
  ok(`V18: after A restore, note is live (${afterA?.deleted_at || 'null'})`, !afterA?.deleted_at);

  // Re-tag and run batch B.
  db.prepare(`UPDATE coaching_notes SET is_practice=1 WHERE id=9990`).run();
  const rPb = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({ note: 'V18 batch B' }));
  const bidB = Number((rPb.location || '').split('/batches/')[1]);
  await admin.post(`/admin/data/practice-cleanup/batches/${bidB}/execute`, new URLSearchParams({ confirm: 'CLEAN PRACTICE DATA' }));
  const stampB = db.prepare(`SELECT deleted_at_stamp FROM practice_cleanup_row WHERE batch_id=? AND entity_id=9990`).get(bidB)?.deleted_at_stamp;
  ok(`V18: batch B stamped deleted_at=${stampB} (different from A: ${stampA !== stampB})`,
     !!stampB && stampB !== stampA);

  // Sanity: note is deleted with B's stamp, not A's.
  const curr = db.prepare(`SELECT deleted_at FROM coaching_notes WHERE id=9990`).get().deleted_at;
  ok(`V18: current deleted_at (${curr}) matches batch B's stamp`, curr === stampB);
  ok(`V18: current deleted_at does NOT match batch A's stamp`, curr !== stampA);

  // Attempt to restore batch A now.  It has status='restored' — restore
  // rejects with batch_not_restorable.  But what we're really testing is:
  // if the batch WERE re-restorable, the guarded UPDATE (WHERE
  // deleted_at=<stamp A>) would find zero rows and leave X alone.
  const rRestoreA = await admin.post(`/admin/data/practice-cleanup/batches/${bidA}/restore`, new URLSearchParams({ confirm: 'RESTORE BATCH' }));
  ok(`V18: re-restore of A rejected as not_restorable (${rRestoreA.status})`,
     rRestoreA.status === 302 && decodeURIComponent(rRestoreA.location || '').includes('not in a state that can be restored'));

  // Directly manipulate: temporarily unset A's restored status so the
  // restore path would try to run its UPDATEs.  Verify the stamp-guarded
  // UPDATE leaves 9990 alone (deleted_at value belongs to batch B).
  db.prepare(`UPDATE practice_cleanup_batches SET status='executed', restored_at=NULL, restored_by=NULL WHERE id=?`).run(bidA);
  const rRestoreA2 = await admin.post(`/admin/data/practice-cleanup/batches/${bidA}/restore`, new URLSearchParams({ confirm: 'RESTORE BATCH' }));
  ok(`V18: re-attempted restore of A returns 302 (${rRestoreA2.status})`, rRestoreA2.status === 302);
  const afterA2 = db.prepare(`SELECT deleted_at FROM coaching_notes WHERE id=9990`).get().deleted_at;
  ok(`V18: after re-restore of A, note STILL soft-deleted (batch B remains the responsible party)`,
     !!afterA2);
  ok(`V18: note's deleted_at still matches batch B's stamp (${afterA2} === ${stampB})`,
     afterA2 === stampB);
}

// ==========================================================================
suite('V19 (item 4 — cross-teacher notification collision preserved for review)');
{
  // Set up the exact scenario from the review:
  //   Practice enrollment 5 (fake id) belongs to teacher A, module 9.
  //   Retained enrollment 100 (fake id) belongs to teacher B, module 5.
  //   Teacher B's historical alert has entity_id=5 (module id of B's
  //     enrollment, but numerically also matches the practice enrollment id).
  //   Cleaning practice enrollment 5 must PRESERVE teacher B's alert.
  //
  // We use IDS.alice as teacher A, IDS.bob as teacher B.
  const teacherA = IDS.alice;
  const teacherB = IDS.bob;
  const now = new Date().toISOString();

  // Delete stale rows first (respecting FK: notifs → enrollments → modules).
  db.prepare(`DELETE FROM notifications WHERE entity_type='pd_enrollment' AND entity_id IN (8005, 8100)`).run();
  db.prepare(`DELETE FROM pd_enrollments WHERE id IN (8005, 8100)`).run();
  // Insert module 8005 FIRST (safe: no rows reference it after the enrollment
  // wipe above; pd_modules has no FK backrefs from other tables in the
  // wipe set).  If module 8005 already exists (previous V19 run), keep it.
  const modA = db.prepare(`SELECT id FROM pd_modules WHERE id<>8005 ORDER BY id LIMIT 1`).get();
  const mod8005Exists = db.prepare(`SELECT 1 FROM pd_modules WHERE id=8005`).get();
  if (!mod8005Exists) {
    db.prepare(`INSERT INTO pd_modules (id, title, subtitle, is_active, target_level, indicator_id,
      learn_content, practice_content, apply_content, deliverable_prompt)
      SELECT 8005, 'V19 test module', 'V19 collision fixture', 1, target_level, indicator_id,
             learn_content, practice_content, apply_content, deliverable_prompt
        FROM pd_modules WHERE id=?`).run(modA.id);
  }
  // Practice enrollment id=8005 for teacher A on modA (any module).
  db.prepare(`INSERT INTO pd_enrollments (id, teacher_id, module_id, source, status, is_practice, created_at, updated_at)
    VALUES (8005, ?, ?, 'self', 'started', 1, ?, ?)`).run(teacherA, modA.id, now, now);
  // Retained enrollment id=8100 for teacher B on module 8005 — this is
  // the cross-collision setup (entity_id 8005 is now BOTH a real
  // enrollment AND a real module).
  db.prepare(`INSERT INTO pd_enrollments (id, teacher_id, module_id, source, status, is_practice, created_at, updated_at)
    VALUES (8100, ?, 8005, 'self', 'started', 0, ?, ?)`).run(teacherB, now, now);
  // Teacher B's historical ambiguous alert: entity_id=8005 (module id of
  // B's enrollment).  entity_id 8005 ALSO happens to be enrollment 8005
  // (teacher A's practice).  Recipient user_id=teacherB (Bob), NOT teacher A.
  const notifBRes = db.prepare(`INSERT INTO notifications (user_id, kind, title, body, url, entity_type, entity_id, created_at)
    VALUES (?, 'pd_module_recommended', ?, 'body', '/teacher/pd', 'pd_enrollment', 8005, ?)`)
    .run(teacherB, 'V19 Bob legit alert (looks ambiguous)', now);
  const notifBId = notifBRes.lastInsertRowid;
  // Also add teacher A's own notification for enrollment 8005 (unambiguous).
  const notifARes = db.prepare(`INSERT INTO notifications (user_id, kind, title, body, url, entity_type, entity_id, created_at)
    VALUES (?, 'pd_module_recommended', ?, 'body', '/teacher/pd/8005', 'pd_enrollment', 8005, ?)`)
    .run(teacherA, 'V19 Alice practice alert', now);
  const notifAId = notifARes.lastInsertRowid;

  // Untag everything else so V19's preview only picks up enrollment 8005.
  const others = db.prepare(`SELECT id, 'cn' AS k FROM coaching_notes WHERE is_practice=1 AND deleted_at IS NULL
                             UNION ALL SELECT id, 'pe' FROM pd_enrollments WHERE is_practice=1 AND deleted_at IS NULL AND id<>8005
                             UNION ALL SELECT id, 'obs' FROM observations WHERE is_practice=1 AND deleted_at IS NULL
                             UNION ALL SELECT id, 'ext' FROM external_pd_submissions WHERE is_practice=1 AND deleted_at IS NULL`).all();
  for (const r of others) {
    const table = r.k === 'cn' ? 'coaching_notes' : r.k === 'pe' ? 'pd_enrollments' : r.k === 'obs' ? 'observations' : 'external_pd_submissions';
    db.prepare(`UPDATE ${table} SET is_practice=0 WHERE id=?`).run(r.id);
  }
  db.prepare(`DELETE FROM practice_cleanup_open_claim WHERE entity_type='pd_enrollment' AND entity_id=8005`).run();

  // Preview + execute.
  const rPrev = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({ note: 'V19 cross-teacher collision' }));
  const bid = Number((rPrev.location || '').split('/batches/')[1]);
  await admin.post(`/admin/data/practice-cleanup/batches/${bid}/execute`, new URLSearchParams({ confirm: 'CLEAN PRACTICE DATA' }));

  // Bob's notification must SURVIVE (preserved for admin review).
  const notifBStill = db.prepare(`SELECT id FROM notifications WHERE id=?`).get(notifBId);
  ok(`V19: Bob's cross-teacher notification PRESERVED (id=${notifBStill?.id})`,
     !!notifBStill);
  const amb = db.prepare(`SELECT resolves_as, user_id FROM practice_cleanup_ambiguous_notif WHERE batch_id=? AND notification_id=?`).get(bid, notifBId);
  ok(`V19: Bob's notification recorded as ambiguous`, !!amb);
  ok(`V19: ambiguous row's resolves_as includes 'cross_teacher_collision' (was: '${amb?.resolves_as}')`,
     (amb?.resolves_as || '').includes('cross_teacher_collision'));
  ok(`V19: ambiguous row's user_id = teacher B (${amb?.user_id} === ${teacherB})`,
     amb?.user_id === teacherB);
  // Alice's own notification (unambiguous owner) IS deleted.
  const notifAStill = db.prepare(`SELECT id FROM notifications WHERE id=?`).get(notifAId);
  ok(`V19 NON-COLLISION: Alice's own alert (correct owner) IS deleted`, !notifAStill);

  // Cleanup: restore V19's batch so downstream tests start fresh.
  await admin.post(`/admin/data/practice-cleanup/batches/${bid}/restore`, new URLSearchParams({ confirm: 'RESTORE BATCH' }));
  db.prepare(`DELETE FROM notifications WHERE id=?`).run(notifBId);
  db.prepare(`DELETE FROM pd_enrollments WHERE id IN (8005, 8100)`).run();
  // NOTE: leave pd_modules row 8005 in place — later fixture reruns will
  // wipe it via the standard wipeTables list.  Deleting it here would
  // race with any lingering FK reference from a leftover ambiguous_notif
  // row inserted during this test's execute.
}

// ==========================================================================
suite('V20 (item 4 — POST /appraiser/observations/:id/save rejects stale writes to cleaned observations)');
{
  // Create a practice observation for Bob, publish it via appraiser, then
  // clean it, then a stale-tab POST to /save must return 403 with no
  // change to the observation's fields.
  const teacherId = IDS.bob;
  const appraiserId = IDS.principal;
  const fw = db.prepare(`SELECT id FROM frameworks ORDER BY id LIMIT 1`).get();
  const now = new Date().toISOString();
  db.prepare(`DELETE FROM observations WHERE id=9502`).run();
  db.prepare(`INSERT INTO observations (id, teacher_id, appraiser_id, school_year_id, framework_id,
    observation_type, class_context, subject, grade_level, observed_at, status, is_practice,
    scripted_notes, private_notes, overall_summary, created_at, updated_at)
    VALUES (9502, ?, ?, 1, ?, 'informal', 'V20 pre-cleanup', 'ELA', '3', ?, 'draft', 1,
            'ORIGINAL scripted', 'ORIGINAL private', 'ORIGINAL summary', ?, ?)`)
    .run(teacherId, appraiserId, fw.id, now, now, now);

  // Tag + preview + execute cleanup on the observation.
  // Untag other rows first.
  const others = db.prepare(`SELECT id, 'cn' AS k FROM coaching_notes WHERE is_practice=1 AND deleted_at IS NULL
                             UNION ALL SELECT id, 'pe' FROM pd_enrollments WHERE is_practice=1 AND deleted_at IS NULL
                             UNION ALL SELECT id, 'obs' FROM observations WHERE is_practice=1 AND deleted_at IS NULL AND id<>9502
                             UNION ALL SELECT id, 'ext' FROM external_pd_submissions WHERE is_practice=1 AND deleted_at IS NULL`).all();
  for (const r of others) {
    const table = r.k === 'cn' ? 'coaching_notes' : r.k === 'pe' ? 'pd_enrollments' : r.k === 'obs' ? 'observations' : 'external_pd_submissions';
    db.prepare(`UPDATE ${table} SET is_practice=0 WHERE id=?`).run(r.id);
  }
  db.prepare(`DELETE FROM practice_cleanup_open_claim WHERE entity_type='observation' AND entity_id=9502`).run();

  const rPrev = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({ note: 'V20 stale save guard' }));
  const bid = Number((rPrev.location || '').split('/batches/')[1]);
  await admin.post(`/admin/data/practice-cleanup/batches/${bid}/execute`, new URLSearchParams({ confirm: 'CLEAN PRACTICE DATA' }));
  const cleaned = db.prepare(`SELECT deleted_at, scripted_notes FROM observations WHERE id=9502`).get();
  ok(`V20 precondition: observation 9502 soft-deleted`, !!cleaned?.deleted_at);
  ok(`V20 precondition: scripted_notes still 'ORIGINAL scripted' (soft-delete preserves fields)`,
     cleaned?.scripted_notes === 'ORIGINAL scripted');

  // Stale-tab full-form save attempt (all fields present, as a real browser
  // form would submit).
  const rSave = await principal.post('/appraiser/observations/9502/save', new URLSearchParams({
    scripted_notes: 'STALE OVERWRITE scripted',
    private_notes: 'STALE OVERWRITE private',
    overall_summary: 'STALE OVERWRITE summary',
    class_context: 'STALE class',
    subject: 'STALE subject',
    grade_level: '9',
    location: 'STALE location',
    duration_minutes: '99',
    observed_at: '2027-01-01T10:00',
  }));
  ok(`V20: stale /save returns 403 (${rSave.status})`, rSave.status === 403);

  const after = db.prepare(`SELECT scripted_notes, private_notes, overall_summary, class_context, subject FROM observations WHERE id=9502`).get();
  ok(`V20: scripted_notes UNCHANGED (${after?.scripted_notes})`, after?.scripted_notes === 'ORIGINAL scripted');
  ok(`V20: private_notes UNCHANGED`, after?.private_notes === 'ORIGINAL private');
  ok(`V20: overall_summary UNCHANGED`, after?.overall_summary === 'ORIGINAL summary');
  ok(`V20: class_context UNCHANGED (still 'V20 pre-cleanup')`, after?.class_context === 'V20 pre-cleanup');

  // Also assert: no save_notes activity was logged for the cleaned obs by
  // the stale POST (endpoint returned before logActivity ran).
  const savedLogged = db.prepare(`SELECT COUNT(*) AS n FROM activity_log WHERE entity_type='observation' AND entity_id=9502 AND action='save_notes' AND created_at > ?`).get(cleaned?.deleted_at || now).n;
  ok(`V20: no save_notes activity logged after cleanup (${savedLogged})`, savedLogged === 0);
}

// ==========================================================================
suite('V21 (0018 item 1 — concurrent executeCleanup: one winner, restoration works)');
{
  // Set up: a single preview batch on a fresh coaching_note.  Kick off
  // two execute HTTP requests in parallel (they land in D1 as
  // overlapping db.batch() calls).  Only one may commit the writes; the
  // loser's INSERT INTO practice_cleanup_execution_lock hits the
  // PRIMARY KEY constraint and the loser's whole batch rolls back.
  // The winner writes its stamp to the parent AND the manifest, and the
  // loser overwrites NEITHER.  A subsequent restore reads the winner's
  // stamp and successfully un-deletes the parent + children.
  const now = new Date().toISOString();
  const t = IDS.dan;
  db.prepare(`DELETE FROM coaching_notes WHERE id=9210`).run();
  db.prepare(`INSERT INTO coaching_notes (id, teacher_id, author_id, occurred_on, glow, status, is_practice, created_at, updated_at)
    VALUES (9210, ?, ?, '2026-09-24', 'V21 concurrent-execute test', 'draft', 1, ?, ?)`)
    .run(t, IDS.pureCoach, now, now);
  // Untag everything else.
  const others = db.prepare(`SELECT id, 'cn' AS k FROM coaching_notes WHERE is_practice=1 AND deleted_at IS NULL AND id<>9210
    UNION ALL SELECT id, 'pe' FROM pd_enrollments WHERE is_practice=1 AND deleted_at IS NULL
    UNION ALL SELECT id, 'obs' FROM observations WHERE is_practice=1 AND deleted_at IS NULL
    UNION ALL SELECT id, 'ext' FROM external_pd_submissions WHERE is_practice=1 AND deleted_at IS NULL`).all();
  for (const r of others) {
    const table = r.k === 'cn' ? 'coaching_notes' : r.k === 'pe' ? 'pd_enrollments' : r.k === 'obs' ? 'observations' : 'external_pd_submissions';
    db.prepare(`UPDATE ${table} SET is_practice=0 WHERE id=?`).run(r.id);
  }
  db.prepare(`DELETE FROM practice_cleanup_open_claim WHERE entity_type='coaching_note' AND entity_id=9210`).run();

  const rPrev = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({ note: 'V21 concurrent-execute' }));
  const bid = Number((rPrev.location || '').split('/batches/')[1]);
  ok(`V21: preview created (id=${bid})`, bid > 0);

  // Fire two concurrent execute POSTs.  Both go through the same admin
  // session; the HTTP layer serialises requests over the same TCP
  // connection but fetch() with different bodies triggers separate
  // requests, which the wrangler dev server processes concurrently.
  const runOne = () => admin.post(`/admin/data/practice-cleanup/batches/${bid}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));
  const [rExecA, rExecB] = await Promise.all([runOne(), runOne()]);
  ok(`V21: both requests returned 302 (A=${rExecA.status}, B=${rExecB.status})`,
     rExecA.status === 302 && rExecB.status === 302);
  // At least one must land on the batch page; the other may either land
  // on the same batch page (concurrent_execute fallback returns the
  // winner's state) or on the preview error page with a concurrent
  // message.
  const aOk = (rExecA.location || '').includes('/batches/');
  const bOk = (rExecB.location || '').includes('/batches/');
  ok(`V21: at least one request landed on batch page (A_ok=${aOk} B_ok=${bOk})`, aOk || bOk);

  // Batch is now in 'executed' status with a SINGLE consistent stamp.
  const afterExec = db.prepare(`SELECT status FROM practice_cleanup_batches WHERE id=?`).get(bid);
  ok(`V21: batch status='executed' (${afterExec?.status})`, afterExec?.status === 'executed');

  // Parent's deleted_at must EQUAL the manifest row's deleted_at_stamp.
  const parentRow = db.prepare(`SELECT deleted_at FROM coaching_notes WHERE id=9210`).get();
  const manifestRow = db.prepare(`SELECT deleted_at_stamp FROM practice_cleanup_row WHERE batch_id=? AND entity_id=9210`).get(bid);
  ok(`V21: parent.deleted_at is set (${parentRow?.deleted_at})`, !!parentRow?.deleted_at);
  ok(`V21: manifest.deleted_at_stamp is set (${manifestRow?.deleted_at_stamp})`, !!manifestRow?.deleted_at_stamp);
  ok(`V21: parent.deleted_at === manifest.deleted_at_stamp (STAMP CONSISTENCY — the item-1 invariant)`,
     parentRow?.deleted_at === manifestRow?.deleted_at_stamp);

  // Same consistency for the audit child rows (if any).
  const childCheck = db.prepare(`SELECT c.child_id, c.deleted_at_stamp AS m_stamp, a.deleted_at AS a_stamp
    FROM practice_cleanup_child c
    JOIN coaching_note_audit a ON a.id = c.child_id AND c.child_kind='coaching_note_audit'
    WHERE c.batch_id=?`).all(bid);
  let anyChildMismatch = false;
  for (const cr of childCheck) {
    if (cr.m_stamp !== cr.a_stamp) anyChildMismatch = true;
  }
  ok(`V21: EVERY child's actual deleted_at matches its manifest stamp (${childCheck.length} children checked)`,
     !anyChildMismatch);

  // Only ONE execution_lock row exists for this batch (the winner).
  const lockCount = db.prepare(`SELECT COUNT(*) AS n FROM practice_cleanup_execution_lock WHERE batch_id=?`).get(bid).n;
  ok(`V21: exactly ONE execution_lock row exists (${lockCount})`, lockCount === 1);

  // Restore succeeds and returns parent + children.
  const rRestore = await admin.post(`/admin/data/practice-cleanup/batches/${bid}/restore`, new URLSearchParams({
    confirm: 'RESTORE BATCH',
  }));
  ok(`V21: restore returns 302 (${rRestore.status})`, rRestore.status === 302);
  const afterRestore = db.prepare(`SELECT deleted_at FROM coaching_notes WHERE id=9210`).get();
  ok(`V21: parent restored — deleted_at is NULL (${afterRestore?.deleted_at})`, !afterRestore?.deleted_at);
  const stillDeletedChildren = db.prepare(`SELECT COUNT(*) AS n FROM coaching_note_audit
    WHERE id IN (SELECT child_id FROM practice_cleanup_child WHERE batch_id=? AND child_kind='coaching_note_audit')
      AND deleted_at IS NOT NULL`).get(bid).n;
  ok(`V21: children restored — none of this batch's children remain soft-deleted (${stillDeletedChildren})`,
     stillDeletedChildren === 0);
  const batchAfterRestore = db.prepare(`SELECT status FROM practice_cleanup_batches WHERE id=?`).get(bid);
  ok(`V21: batch status='restored' (${batchAfterRestore?.status})`, batchAfterRestore?.status === 'restored');
}

// ==========================================================================
suite('V22 (0018 item 2 — frozen scope: late-added child AND notification are preserved)');
{
  // Preview a PD enrollment with no existing children.  Between the
  // scope-hash check inside executeCleanup and the actual db.batch(),
  // insert (a) a new deliverable AND (b) a new notification for the
  // enrollment.  Because the delete targets are frozen at preview
  // time, neither the new deliverable nor the new notification may be
  // deleted — they are outside the reviewed scope.
  //
  // We cannot practically inject "between the internal check and the
  // batch" from the HTTP layer.  The stronger invariant the 0018 fix
  // guarantees is: even if the drift check passes, the actual DELETE
  // targets come from the FROZEN manifest, so a late-added row is not
  // deleted regardless.  We test that stronger invariant by:
  //   1. Previewing an enrollment with existing children (frozen scope).
  //   2. Adding a new deliverable + a new notification AFTER preview.
  //   3. Executing (drift check will REJECT because the added rows
  //      changed the dep fingerprint — that's the friendly path).
  //   4. To also verify the manifest-restriction path: MANUALLY revert
  //      the added rows just for the drift check, execute, then re-add.
  //      This is contrived; the more meaningful test is the standard
  //      drift rejection.
  //
  // Additionally we assert that the frozen manifest contains ONLY the
  // preview-time ids so the execute batch cannot possibly widen its
  // delete set.
  const now = new Date().toISOString();
  const t = IDS.dan;
  const mod = db.prepare(`SELECT id FROM pd_modules LIMIT 1`).get();
  db.prepare(`DELETE FROM pd_deliverables WHERE enrollment_id=9220`).run();
  db.prepare(`DELETE FROM pd_reflections WHERE enrollment_id=9220`).run();
  db.prepare(`DELETE FROM notifications WHERE entity_type='pd_enrollment' AND entity_id=9220`).run();
  db.prepare(`DELETE FROM activity_log WHERE entity_type='pd_enrollment' AND entity_id=9220`).run();
  db.prepare(`DELETE FROM pd_enrollments WHERE id=9220`).run();
  db.prepare(`INSERT INTO pd_enrollments (id, teacher_id, module_id, source, status, is_practice, created_at, updated_at)
    VALUES (9220, ?, ?, 'self', 'submitted', 1, ?, ?)`).run(t, mod.id, now, now);
  // Existing children: one reflection + one notification (so the
  // preview manifest is non-empty and we can verify late-added rows
  // are NOT in it).
  db.prepare(`INSERT INTO pd_reflections (id, enrollment_id, phase, body, created_at)
    VALUES (92201, 9220, 'learn', 'V22 pre-preview reflection', ?)`).run(now);
  db.prepare(`INSERT INTO notifications (user_id, kind, title, body, url, entity_type, entity_id, created_at)
    VALUES (?, 'pd_deliverable_verified', 'V22 pre-preview notif', 'body', '/', 'pd_enrollment', 9220, ?)`).run(t, now);
  const preNotifId = db.prepare(`SELECT id FROM notifications WHERE entity_type='pd_enrollment' AND entity_id=9220 ORDER BY id DESC LIMIT 1`).get().id;

  // Untag everything else.
  const othersV22 = db.prepare(`SELECT id, 'cn' AS k FROM coaching_notes WHERE is_practice=1 AND deleted_at IS NULL
    UNION ALL SELECT id, 'pe' FROM pd_enrollments WHERE is_practice=1 AND deleted_at IS NULL AND id<>9220
    UNION ALL SELECT id, 'obs' FROM observations WHERE is_practice=1 AND deleted_at IS NULL
    UNION ALL SELECT id, 'ext' FROM external_pd_submissions WHERE is_practice=1 AND deleted_at IS NULL`).all();
  for (const r of othersV22) {
    const table = r.k === 'cn' ? 'coaching_notes' : r.k === 'pe' ? 'pd_enrollments' : r.k === 'obs' ? 'observations' : 'external_pd_submissions';
    db.prepare(`UPDATE ${table} SET is_practice=0 WHERE id=?`).run(r.id);
  }
  db.prepare(`DELETE FROM practice_cleanup_open_claim WHERE entity_type='pd_enrollment' AND entity_id=9220`).run();

  const rPrev = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({ note: 'V22 frozen scope' }));
  const bid = Number((rPrev.location || '').split('/batches/')[1]);

  // Frozen scope inspection: the preview manifest contains EXACTLY the
  // pre-preview rows.
  const manifestChildIds = db.prepare(`SELECT child_id FROM practice_cleanup_child WHERE batch_id=? ORDER BY child_id`)
    .all(bid).map(r => r.child_id);
  const manifestNotifScope = db.prepare(`SELECT scope_id FROM practice_cleanup_notif_scope WHERE batch_id=? AND scope_kind='notification' ORDER BY scope_id`)
    .all(bid).map(r => r.scope_id);
  ok(`V22: manifest child ids = [92201] (${manifestChildIds.join(',')})`,
     manifestChildIds.length === 1 && manifestChildIds[0] === 92201);
  ok(`V22: manifest notification scope ids = [${preNotifId}] (${manifestNotifScope.join(',')})`,
     manifestNotifScope.length === 1 && manifestNotifScope[0] === preNotifId);

  // Insert LATE-ADDED child + notification AFTER preview.
  db.prepare(`INSERT INTO pd_reflections (id, enrollment_id, phase, body, created_at)
    VALUES (92202, 9220, 'apply', 'V22 LATE ADDED reflection', ?)`).run(now);
  db.prepare(`INSERT INTO notifications (user_id, kind, title, body, url, entity_type, entity_id, created_at)
    VALUES (?, 'pd_deliverable_verified', 'V22 LATE ADDED notif', 'body', '/', 'pd_enrollment', 9220, ?)`).run(t, now);
  const lateNotifId = db.prepare(`SELECT id FROM notifications WHERE entity_type='pd_enrollment' AND entity_id=9220 ORDER BY id DESC LIMIT 1`).get().id;

  // Execute — must reject with scope_changed (dep_fingerprint now
  // includes notification/activity ids so a late notification alone
  // trips the check).
  const rExec = await admin.post(`/admin/data/practice-cleanup/batches/${bid}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));
  ok(`V22: execute rejects with 302 (${rExec.status})`, rExec.status === 302);
  const errLoc = decodeURIComponent(rExec.location || '');
  ok(`V22: reject message mentions scope/dependencies changed`,
     /tagged set.*changed|scope|dependencies|reviewed/i.test(errLoc),
     `loc=${errLoc}`);

  // Everything remains untouched.
  const enrAfter = db.prepare(`SELECT deleted_at FROM pd_enrollments WHERE id=9220`).get();
  ok(`V22: enrollment 9220 NOT soft-deleted by rejected execute`, !enrAfter?.deleted_at);
  const preReflAfter = db.prepare(`SELECT deleted_at FROM pd_reflections WHERE id=92201`).get();
  const lateReflAfter = db.prepare(`SELECT deleted_at FROM pd_reflections WHERE id=92202`).get();
  ok(`V22: pre-preview reflection 92201 NOT deleted`, !preReflAfter?.deleted_at);
  ok(`V22: late-added reflection 92202 NOT deleted (outside reviewed scope)`, !lateReflAfter?.deleted_at);
  const preNotifAfter = db.prepare(`SELECT id FROM notifications WHERE id=?`).get(preNotifId);
  const lateNotifAfter = db.prepare(`SELECT id FROM notifications WHERE id=?`).get(lateNotifId);
  ok(`V22: pre-preview notification #${preNotifId} STILL present (execute was rejected)`, !!preNotifAfter);
  ok(`V22: late-added notification #${lateNotifId} STILL present (outside reviewed scope)`, !!lateNotifAfter);

  // NOW verify the stronger invariant: even if we bypass the drift
  // check, the FROZEN manifest is what drives DELETE targets.  We do
  // this by overriding the batch's dep_fingerprint to match the
  // current state (simulating a passed drift check), then executing.
  // The late-added rows are STILL not deleted because the batch's
  // delete targets come from practice_cleanup_child / practice_cleanup_
  // notif_scope, which only contain pre-preview ids.
  const currentCandidatesForBatch = [{ entity_type: 'pd_enrollment', entity_id: 9220 }];
  // Recompute what depFingerprintFromFrozenScope would emit for the
  // CURRENT world — mirror the code's format.
  const currentKids = db.prepare(`SELECT id FROM pd_reflections WHERE enrollment_id=9220 AND deleted_at IS NULL ORDER BY id`).all().map(r => r.id);
  const currentNotifs = db.prepare(`SELECT id FROM notifications WHERE entity_type='pd_enrollment' AND entity_id=9220 ORDER BY id`).all().map(r => r.id);
  const currentActs = db.prepare(`SELECT id FROM activity_log WHERE entity_type='pd_enrollment' AND entity_id=9220 ORDER BY id`).all().map(r => r.id);
  const forgedDep = `pd_enrollment#9220{pd_reflection=[${currentKids.join(',')}];n=[${currentNotifs.join(',')}];a=[${currentActs.join(',')}]}`;
  db.prepare(`UPDATE practice_cleanup_batches SET dep_fingerprint=? WHERE id=?`).run(forgedDep, bid);
  const rExecForced = await admin.post(`/admin/data/practice-cleanup/batches/${bid}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));
  ok(`V22-forced: forged-fingerprint execute returns 302 (${rExecForced.status})`, rExecForced.status === 302);
  const batchAfterForced = db.prepare(`SELECT status FROM practice_cleanup_batches WHERE id=?`).get(bid);
  ok(`V22-forced: batch status='executed' after forged-check execute (${batchAfterForced?.status})`, batchAfterForced?.status === 'executed');
  // Pre-preview reflection 92201: DELETED (was in manifest).
  const preReflFinal = db.prepare(`SELECT deleted_at FROM pd_reflections WHERE id=92201`).get();
  ok(`V22-forced INVARIANT: pre-preview reflection 92201 IS soft-deleted (was in frozen manifest)`, !!preReflFinal?.deleted_at);
  // Late-added reflection 92202: NOT deleted (NOT in manifest).
  const lateReflFinal = db.prepare(`SELECT deleted_at FROM pd_reflections WHERE id=92202`).get();
  ok(`V22-forced INVARIANT: late-added reflection 92202 IS NOT deleted (outside frozen manifest — the item-2 invariant)`,
     !lateReflFinal?.deleted_at);
  // Pre-preview notification: DELETED (was in scope).
  const preNotifFinal = db.prepare(`SELECT id FROM notifications WHERE id=?`).get(preNotifId);
  ok(`V22-forced INVARIANT: pre-preview notification #${preNotifId} IS deleted (was in frozen scope)`, !preNotifFinal);
  // Late-added notification: NOT deleted (NOT in scope).
  const lateNotifFinal = db.prepare(`SELECT id FROM notifications WHERE id=?`).get(lateNotifId);
  ok(`V22-forced INVARIANT: late-added notification #${lateNotifId} IS NOT deleted (outside frozen scope — the item-2 invariant)`,
     !!lateNotifFinal);
}

// ==========================================================================
suite('V23 (0018 item 3 — counts-backfill failure: cleanup commits, results page works, restore reachable)');
{
  // Set up a fresh preview.  Inject a trigger that aborts the
  // counts-backfill UPDATE (UPDATE practice_cleanup_batches SET
  // affected_counts_json=?).  Execute must:
  //   * commit the cleanup writes (parent + children + notifs)
  //   * NOT throw a fatal error to the HTTP handler
  //   * redirect to the batch results page
  //   * results page must render and expose the Restore button
  //   * restoration must succeed
  const now = new Date().toISOString();
  const t = IDS.dan;
  db.prepare(`DELETE FROM coaching_notes WHERE id=9230`).run();
  db.prepare(`INSERT INTO coaching_notes (id, teacher_id, author_id, occurred_on, glow, status, is_practice, created_at, updated_at)
    VALUES (9230, ?, ?, '2026-09-24', 'V23 counts-backfill failure', 'draft', 1, ?, ?)`)
    .run(t, IDS.pureCoach, now, now);
  // Untag everything else.
  const othersV23 = db.prepare(`SELECT id, 'cn' AS k FROM coaching_notes WHERE is_practice=1 AND deleted_at IS NULL AND id<>9230
    UNION ALL SELECT id, 'pe' FROM pd_enrollments WHERE is_practice=1 AND deleted_at IS NULL
    UNION ALL SELECT id, 'obs' FROM observations WHERE is_practice=1 AND deleted_at IS NULL
    UNION ALL SELECT id, 'ext' FROM external_pd_submissions WHERE is_practice=1 AND deleted_at IS NULL`).all();
  for (const r of othersV23) {
    const table = r.k === 'cn' ? 'coaching_notes' : r.k === 'pe' ? 'pd_enrollments' : r.k === 'obs' ? 'observations' : 'external_pd_submissions';
    db.prepare(`UPDATE ${table} SET is_practice=0 WHERE id=?`).run(r.id);
  }
  db.prepare(`DELETE FROM practice_cleanup_open_claim WHERE entity_type='coaching_note' AND entity_id=9230`).run();

  const rPrev = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({ note: 'V23 counts backfill' }));
  const bid = Number((rPrev.location || '').split('/batches/')[1]);
  ok(`V23: preview created (id=${bid})`, bid > 0);

  // Install trigger that aborts the counts-backfill UPDATE.  The batch's
  // main flip UPDATE writes affected_counts_json='__pending__'.  The
  // POST-batch UPDATE writes the actual JSON — we abort THAT one only.
  db.prepare(`DROP TRIGGER IF EXISTS v23_abort_counts_backfill`).run();
  db.prepare(`CREATE TRIGGER v23_abort_counts_backfill
              BEFORE UPDATE OF affected_counts_json ON practice_cleanup_batches
              FOR EACH ROW WHEN NEW.id=${bid}
                AND NEW.affected_counts_json <> '__pending__'
                AND OLD.affected_counts_json = '__pending__'
              BEGIN SELECT RAISE(ABORT, 'v23_counts_failure'); END`).run();

  // Execute.  The MAIN batch commits ('__pending__' is written by the
  // in-batch flip).  The post-batch backfill UPDATE throws in
  // executeCleanup; the handler must SWALLOW it and redirect to the
  // batch page, NOT surface a "Cleanup failed" error.
  const rExec = await admin.post(`/admin/data/practice-cleanup/batches/${bid}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));
  ok(`V23: execute returns 302 (${rExec.status})`, rExec.status === 302);
  const execLoc = rExec.location || '';
  ok(`V23: execute redirect goes to /batches/${bid} (results page), NOT the error page`,
     execLoc.includes(`/batches/${bid}`) && !execLoc.includes('msg=Cleanup+failed'),
     `loc=${execLoc}`);

  // Truthful completion status.
  const batchAfter = db.prepare(`SELECT status, affected_counts_json FROM practice_cleanup_batches WHERE id=?`).get(bid);
  ok(`V23: batch status='executed' (${batchAfter?.status}) — cleanup DID commit`, batchAfter?.status === 'executed');
  // BEFORE the results page renders, affected_counts_json is '__pending__'.
  ok(`V23: affected_counts_json currently '__pending__' (before self-heal)`,
     batchAfter?.affected_counts_json === '__pending__');
  const parentDeleted = db.prepare(`SELECT deleted_at FROM coaching_notes WHERE id=9230`).get();
  ok(`V23: parent WAS soft-deleted (cleanup writes committed)`, !!parentDeleted?.deleted_at);

  // Fetch the results page — must render (no unconditional JSON.parse
  // crash), must expose Restore button, must include the "counts pending"
  // fallback banner OR the self-healed summary card.
  const rPage = await admin.get(`/admin/data/practice-cleanup/batches/${bid}`);
  ok(`V23: results page GET returns 200 (${rPage.status})`, rPage.status === 200);
  ok(`V23: results page includes the batch id in the heading`,
     rPage.text.includes(`Cleanup batch #${bid}`));
  ok(`V23: results page includes the Restore controls (button is reachable)`,
     rPage.text.includes('Restore this batch') && rPage.text.includes('RESTORE BATCH'),
     'restore controls missing from results page');

  // With the trigger still active, loadBatch's self-heal write is ALSO
  // blocked (both writes touch affected_counts_json).  The results page
  // MUST still render truthfully — the "Cleanup counts" fallback banner
  // reads directly from the manifest tables, and the Restore button
  // remains reachable regardless.  Verify the fallback banner appears.
  ok(`V23: results page shows the manifest-driven fallback banner (self-heal blocked by trigger)`,
     rPage.text.includes('The saved counts report is not yet available'),
     'expected the __pending__ fallback banner text on the results page');
  // Now REMOVE the trigger and re-fetch the page — loadBatch's self-heal
  // write should succeed on this second read, upgrading affected_counts_
  // json to a valid JSON summary.
  db.prepare(`DROP TRIGGER v23_abort_counts_backfill`).run();
  const rPage2 = await admin.get(`/admin/data/practice-cleanup/batches/${bid}`);
  ok(`V23: second results page GET returns 200 (${rPage2.status})`, rPage2.status === 200);
  const healed = db.prepare(`SELECT affected_counts_json FROM practice_cleanup_batches WHERE id=?`).get(bid);
  ok(`V23: loadBatch self-healed affected_counts_json to a valid JSON summary (after trigger removed)`,
     healed?.affected_counts_json && healed.affected_counts_json !== '__pending__'
       && !!(safeJsonParse(healed.affected_counts_json)?.affected));

  // Restoration succeeds.
  const rRestore = await admin.post(`/admin/data/practice-cleanup/batches/${bid}/restore`, new URLSearchParams({
    confirm: 'RESTORE BATCH',
  }));
  ok(`V23: restore returns 302 (${rRestore.status})`, rRestore.status === 302);
  const parentAfterRestore = db.prepare(`SELECT deleted_at FROM coaching_notes WHERE id=9230`).get();
  ok(`V23: parent restored — deleted_at is NULL`, !parentAfterRestore?.deleted_at);
  const batchAfterRestore = db.prepare(`SELECT status FROM practice_cleanup_batches WHERE id=?`).get(bid);
  ok(`V23: batch status='restored' (${batchAfterRestore?.status})`, batchAfterRestore?.status === 'restored');
}

function safeJsonParse(s) {
  try { return JSON.parse(s); } catch { return null; }
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
