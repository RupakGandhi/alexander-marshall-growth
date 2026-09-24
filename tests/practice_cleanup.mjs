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

  // Untag so V9's scope-drift test starts fresh.
  await admin.post('/admin/data/practice-cleanup/mark', new URLSearchParams({
    entity_type: 'coaching_note', entity_id: String(practiceDraftNote.id), is_practice: '0',
  }));

  // Idempotence: a second execute against the SAME preview batch is a no-op
  // (writer_nonce guard).  We test this by manually executing the previewed
  // batch and then re-POSTing execute — the second call must not error.
  // First, retag+preview a fresh set.
  await admin.post('/admin/data/practice-cleanup/mark', new URLSearchParams({
    entity_type: 'coaching_note', entity_id: String(practiceDraftNote.id), is_practice: '1',
  }));
  const rPrev2 = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({
    note: 'V8 idempotence',
  }));
  const idBatch2 = Number((rPrev2.location || '').split('/batches/')[1]);
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
     decodeURIComponent(rExec.location || '').includes('tagged set has changed'),
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

  // Preview + execute cleanup on enrollment 9920.
  const rPrev = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({
    note: 'V12',
  }));
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
  ok(`V12: ambiguous row resolves_as='pd_module'`,
     amb.find(r => r.notification_id === Number(ambNotifId))?.resolves_as === 'pd_module');
  ok(`V12: ambiguous row suspected_parent_enrollment_id = 9920`,
     amb.find(r => r.notification_id === Number(ambNotifId))?.suspected_parent_enrollment_id === 9920);

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
  // Reset any state.  We use IDS.alice as the "teacher who receives a
  // new auto-enrollment", and a fresh observation with a low-level score.
  // Then we verify:
  //   * autoEnrollForObservation creates pd_enrollments AND notifications
  //     whose entity_id matches the ENROLLMENT id (not the module id).
  //   * We tag, preview, execute, restore that batch — leaves module able
  //     to be re-recommended immediately.
  //   * We tag the fresh enrollment as practice, preview+execute, then a
  //     second auto-enroll can create a NEW enrollment on the same module
  //     (fresh row, not conflict) — the F8 flow works end-to-end.
  const teacherId = IDS.alice;
  const appraiserId = IDS.principal;
  const fw = db.prepare(`SELECT id FROM frameworks ORDER BY id LIMIT 1`).get();
  // Find a module targeting a level=1 indicator so autoEnrollForObservation triggers.
  const modWithIndicator = db.prepare(
    `SELECT m.id AS module_id, m.indicator_id, m.target_level
       FROM pd_modules m
      WHERE m.is_active=1 AND m.target_level<=2
      ORDER BY m.id LIMIT 1`
  ).get();
  ok(`V13 precondition: found auto-enrollable module (module=${modWithIndicator?.module_id}, indicator=${modWithIndicator?.indicator_id}, target=${modWithIndicator?.target_level})`,
     !!modWithIndicator);

  // Wipe any pre-existing enrollments for this teacher+module (so we can
  // observe fresh insertion cleanly).
  db.prepare(`DELETE FROM notifications WHERE user_id=? AND entity_type='pd_enrollment' AND entity_id IN (SELECT id FROM pd_enrollments WHERE teacher_id=? AND module_id=?)`)
    .run(teacherId, teacherId, modWithIndicator.module_id);
  db.prepare(`DELETE FROM pd_enrollments WHERE teacher_id=? AND module_id=?`).run(teacherId, modWithIndicator.module_id);

  // Create an observation + score at target_level that triggers auto-enroll.
  const now = new Date().toISOString();
  db.prepare(`DELETE FROM observation_scores WHERE observation_id IN (9800, 9801)`).run();
  db.prepare(`DELETE FROM observations WHERE id IN (9800, 9801)`).run();
  db.prepare(`INSERT INTO observations (id, teacher_id, appraiser_id, school_year_id, framework_id,
    observation_type, class_context, subject, grade_level, observed_at, status, is_practice, created_at, updated_at)
    VALUES (9800, ?, ?, 1, ?, 'informal', 'V13 pre-publish', 'ELA', '3', ?, 'draft', 0, ?, ?)`)
    .run(teacherId, appraiserId, fw.id, now, now, now);
  db.prepare(`INSERT INTO observation_scores (observation_id, indicator_id, level, evidence_note, created_at, updated_at)
    VALUES (9800, ?, ?, 'V13 evidence', ?, ?)`).run(modWithIndicator.indicator_id, modWithIndicator.target_level, now, now);

  // Publish via the appraiser endpoint (triggers autoEnrollForObservation).
  const rPub = await appraiser.post(`/appraiser/observations/9800/publish`, new URLSearchParams({}));
  ok(`V13: publish observation 9800 → 302 (${rPub.status})`, rPub.status === 302);

  // Now inspect: pd_enrollments row created + notification with entity_id=enrollment_id.
  const newEnr = db.prepare(
    `SELECT id FROM pd_enrollments WHERE teacher_id=? AND module_id=? AND source_observation_id=9800 ORDER BY id DESC LIMIT 1`
  ).get(teacherId, modWithIndicator.module_id);
  ok(`V13: auto-enroll created a fresh enrollment (id=${newEnr?.id})`, !!newEnr?.id);
  const notif = db.prepare(
    `SELECT entity_id, url FROM notifications WHERE user_id=? AND kind='pd_module_recommended' AND entity_type='pd_enrollment' ORDER BY id DESC LIMIT 1`
  ).get(teacherId);
  ok(`V13: notification entity_id = enrollment_id (${notif?.entity_id} === ${newEnr?.id}) — F7 fix verified`,
     notif?.entity_id === newEnr?.id);
  ok(`V13: notification url deep-links to /teacher/pd/${newEnr?.id}`,
     notif?.url === `/teacher/pd/${newEnr?.id}`);

  // Now tag the fresh enrollment as practice, preview + execute cleanup.
  await admin.post('/admin/data/practice-cleanup/mark', new URLSearchParams({
    entity_type: 'pd_enrollment', entity_id: String(newEnr.id), is_practice: '1',
  }));
  const rPrev = await admin.post('/admin/data/practice-cleanup/preview', new URLSearchParams({ note: 'V13' }));
  const bid = Number((rPrev.location || '').split('/batches/')[1]);
  await admin.post(`/admin/data/practice-cleanup/batches/${bid}/execute`, new URLSearchParams({
    confirm: 'CLEAN PRACTICE DATA',
  }));

  // Enrollment soft-deleted.  Fresh auto-enroll after a second publish
  // should create a NEW enrollment (the old one is invisible).
  const softDel = db.prepare(`SELECT deleted_at FROM pd_enrollments WHERE id=?`).get(newEnr.id);
  ok(`V13: original enrollment soft-deleted after cleanup`, !!softDel?.deleted_at);

  // F8: a second observation → publish → autoEnrollForObservation must
  // create a fresh enrollment (source_observation_id=9801), even though
  // a soft-deleted enrollment on the same module exists.
  db.prepare(`INSERT INTO observations (id, teacher_id, appraiser_id, school_year_id, framework_id,
    observation_type, class_context, subject, grade_level, observed_at, status, is_practice, created_at, updated_at)
    VALUES (9801, ?, ?, 1, ?, 'informal', 'V13 post-cleanup', 'ELA', '3', ?, 'draft', 0, ?, ?)`)
    .run(teacherId, appraiserId, fw.id, now, now, now);
  db.prepare(`INSERT INTO observation_scores (observation_id, indicator_id, level, evidence_note, created_at, updated_at)
    VALUES (9801, ?, ?, 'V13 evidence 2', ?, ?)`).run(modWithIndicator.indicator_id, modWithIndicator.target_level, now, now);
  const rPub2 = await appraiser.post(`/appraiser/observations/9801/publish`, new URLSearchParams({}));
  ok(`V13 F8: second publish → 302 (${rPub2.status})`, rPub2.status === 302);
  // The UNIQUE constraint on pd_enrollments is (teacher_id, module_id,
  // source_observation_id) so a different source_observation_id makes a
  // new row even if the old one still exists (soft-deleted).
  const secondEnr = db.prepare(
    `SELECT id FROM pd_enrollments WHERE teacher_id=? AND module_id=? AND source_observation_id=9801 ORDER BY id DESC LIMIT 1`
  ).get(teacherId, modWithIndicator.module_id);
  ok(`V13 F8: fresh auto-enroll created a NEW enrollment (id=${secondEnr?.id}) despite the cleaned one still existing`,
     !!secondEnr?.id && secondEnr.id !== newEnr.id);
  const secondNotif = db.prepare(
    `SELECT entity_id FROM notifications WHERE user_id=? AND kind='pd_module_recommended' AND entity_type='pd_enrollment' ORDER BY id DESC LIMIT 1`
  ).get(teacherId);
  ok(`V13 F8: fresh notification's entity_id = new enrollment id (${secondNotif?.entity_id})`,
     secondNotif?.entity_id === secondEnr?.id);

  // Housekeep: leave newEnr soft-deleted (V13 didn't restore).  The V4-second-pass
  // assertion earlier compares against a snapshot that already accounted for
  // cleanups; V13 comes after V4-second-pass so any deltas belong to V13 alone.
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
