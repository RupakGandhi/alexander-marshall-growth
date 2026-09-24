#!/usr/bin/env node
/**
 * Acceptance suite — Sept 23, 2026, revised per ChatGPT review.
 *
 * Runs against the LOCAL server (http://localhost:3000) which is backed by
 * the LOCAL wrangler D1.  Before this suite runs you must:
 *
 *   1) Boot the local server:  pm2 start ecosystem.config.cjs
 *   2) Rebuild the synthetic fixture:  node tests/fixture.mjs
 *
 * The synthetic fixture is defined in tests/fixture.mjs — it does NOT restore
 * a production snapshot.  Users, assignments, and one seeded observation +
 * PD enrollment are the only data present.
 *
 * DB probes go through better-sqlite3 (a direct read of the local D1 file);
 * this avoids the subprocess socket contention that hung the earlier
 * acceptance run.  HTTP requests use undici's global fetch.
 *
 * Corrections vs. the earlier draft:
 *   * URL-decode the redirect location before pattern-matching so
 *     'Draft%20saved' matches whether wrangler encodes as %20 or +.
 *   * Parenthesize the share assertion so status is always checked.
 *   * Ownership test uses PureCoach's actual draft on Alice while both
 *     PureCoach and CoachOne are assigned to Alice (the real overlap case
 *     Aaron asked about).
 *   * Notification-delivery check reads the notifications table directly,
 *     not the bundle text.
 *   * Fresh coverage: revoked capability, preserved teacher hours,
 *     overlapping caseloads, PD report leaks, concurrent shares.
 *
 * Test passwords come from the synthetic fixture (TestPass1!).  No production
 * account is ever touched by this suite.
 */

import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { readdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASE = 'http://localhost:3000';
const PW = 'TestPass1!';

// ---- locate the local D1 file --------------------------------------------
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

// ---- HTTP client with per-user cookie jar --------------------------------
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

// ---- test harness --------------------------------------------------------
let passed = 0, failed = 0, sectionName = '';
const failures = [];
function suite(name) { sectionName = name; console.log(`\n[${name}]`); }
function ok(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); failures.push(`${sectionName}: ${name}${detail ? ' — ' + detail : ''}`); }
}
// Compare using URL-decoded location so %20 and + both match "Draft saved" etc.
function locHas(loc, text) {
  if (!loc) return false;
  try { return decodeURIComponent(loc).includes(text); } catch { return loc.includes(text); }
}
// Convenience so the socket has a beat between rapid requests.
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// RFC-4180-ish CSV row parser: handles quoted cells with commas/em-dashes and
// escaped quotes.  Good enough for our export format which uses double-quotes
// for any cell containing a comma, newline, or quote.
function parseCsvRow(row) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i];
    if (inQuotes) {
      if (ch === '"' && row[i+1] === '"') { cur += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else cur += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
  }
  out.push(cur);
  return out;
}

// Fixture IDs (see tests/fixture.mjs comment for the full map).
const IDS = {
  admin: 1, principal: 2, pureCoach: 3, coachOne: 4, coachTwo: 5, coachThree: 6,
  alice: 10, bob: 11, carol: 12, dan: 13, plain: 14, unrelated: 20,
};

async function main() {

// Log everyone in up front so per-test HTTP is just the flow we care about.
const admin      = await new Client('admin@test',      'admin').login();
const pureCoach  = await new Client('pure.coach@test', 'PureCoach').login();
const coachOne   = await new Client('coach1@test',     'CoachOne').login();
const coachTwo   = await new Client('coach2@test',     'CoachTwo').login();
const coachThree = await new Client('coach3@test',     'CoachThree').login();
const alice      = await new Client('alice@test',      'Alice').login();
const bob        = await new Client('bob@test',        'Bob').login();
const plain      = await new Client('plain@test',      'PlainTeacher').login();

// ==========================================================================
suite('Case 1 — Michelle/Peer coaches retain existing experience; teacher-coaches have BOTH workspaces');

{
  const r = await pureCoach.get('/coach');
  ok('PureCoach /coach 200', r.status === 200, `HTTP ${r.status}`);
}
{
  const t = await coachOne.get('/teacher');
  ok('CoachOne /teacher 200', t.status === 200, `HTTP ${t.status}`);
  ok('CoachOne /teacher shows "My Coaching" nav', t.text.includes('My Coaching'), 'nav missing');
  ok('CoachOne /teacher shows PD Review nav', t.text.includes('/pd/review'), 'nav missing');
  const c = await coachOne.get('/coach');
  ok('CoachOne /coach 200 (capability path)', c.status === 200, `HTTP ${c.status}`);
}
{
  // Teacher records for a teacher-coach must be intact
  const t = await coachOne.get('/teacher');
  // Presence of the personal dashboard sections proves the teacher
  // workspace still works — Focus Areas card, PD LMS card, hours pill.
  ok('CoachOne teacher workspace shows PD hours pill', t.text.includes('PD Hours This Year'));
  ok('CoachOne teacher workspace shows Active Focus Areas', t.text.includes('Active Focus Areas'));
}

// ==========================================================================
suite('Case 2 — Ordinary teachers cannot use coach routes; per-target checks enforce assignment');

{
  const r = await plain.get('/coach');
  ok('PlainTeacher blocked from /coach', r.status === 403, `HTTP ${r.status}`);
  const r2 = await plain.get('/pd/review');
  ok('PlainTeacher blocked from /pd/review', r2.status === 403, `HTTP ${r2.status}`);
}
{
  // CoachOne is assigned to Alice + Bob only; NOT Carol.
  const r = await coachOne.get(`/coach/teachers/${IDS.carol}`);
  ok('CoachOne blocked from unassigned Carol', r.status === 403, `HTTP ${r.status}`);
  const r2 = await coachOne.get(`/coach/teachers/${IDS.alice}`);
  ok('CoachOne can view assigned Alice', r2.status === 200, `HTTP ${r2.status}`);
  const r3 = await coachOne.get(`/coach/teachers/${IDS.bob}`);
  ok('CoachOne can view assigned Bob', r3.status === 200, `HTTP ${r3.status}`);
}
{
  // No self-coaching. CoachOne is user 4; there's no assignment where teacher_id=4,
  // so the check refuses independent of the self-coach guard, but confirm it.
  const r = await coachOne.get(`/coach/teachers/${IDS.coachOne}`);
  ok('CoachOne blocked from self-coach URL', r.status === 403, `HTTP ${r.status}`);
}
{
  // Overlap: both PureCoach and CoachOne are assigned to Alice.  Both must see her.
  const r1 = await pureCoach.get(`/coach/teachers/${IDS.alice}`);
  const r2 = await coachOne.get(`/coach/teachers/${IDS.alice}`);
  ok('Overlap: PureCoach sees Alice', r1.status === 200);
  ok('Overlap: CoachOne sees Alice', r2.status === 200);
}

// ==========================================================================
suite('Case 3 — Draft saves survive; sharing produces exactly one visible entry + one notification');

// Preflight: count of coach_note notifications for Alice BEFORE we start.
const preAliceNotifs = db.prepare(
  `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note'`
).get(IDS.alice).n;

let draftId = null;
{
  const form = new URLSearchParams({
    _token: 'test-token-' + Date.now(),
    occurred_on: '2026-09-20',
    class_context: 'Grade 4 reading, 18 students',
    evidence: 'Students led a book-club discussion using the fishbowl protocol.',
    glow: 'Facilitator moves were consistent — Alice distributed turns evenly.',
    grow: '',
    next_step: 'Try a written prompt so quieter students contribute in writing.',
    _action: 'draft',
  });
  const r = await coachOne.post(`/coach/teachers/${IDS.alice}/notes`, form);
  ok('CoachOne POST draft → 302', r.status === 302, `HTTP ${r.status}`);
  ok('draft redirect says "Draft saved" (URL-decoded)', locHas(r.location, 'Draft saved'), `loc=${r.location}`);
}
{
  const t = await alice.get('/teacher');
  ok('Alice does NOT see draft in her workspace', !t.text.includes('Facilitator moves were consistent'), 'draft leaked to teacher');
}
{
  const r = await coachOne.get(`/coach/teachers/${IDS.alice}`);
  ok('CoachOne sees her own draft', r.text.includes('Facilitator moves were consistent'), 'author view missing draft');
  const m = r.text.match(new RegExp(`/coach/teachers/${IDS.alice}/notes/(\\d+)/update`));
  draftId = m ? Number(m[1]) : null;
  ok('extracted draft note id', draftId != null && draftId > 0, 'no id in edit form');
}
{
  // Overlapping-coach isolation: PureCoach is ALSO Alice's coach, but should
  // NOT see CoachOne's draft.
  const r = await pureCoach.get(`/coach/teachers/${IDS.alice}`);
  ok('PureCoach does NOT see CoachOne\'s draft (per-coach isolation)',
     !r.text.includes('Facilitator moves were consistent'), 'draft leaked to other coach');
}
{
  // Share it.  Now switching to the versioned edit endpoint.  We need the
  // current version — fetch it from the DB.
  const row = db.prepare(`SELECT version, first_shared_at FROM coaching_notes WHERE id=?`).get(draftId);
  const form = new URLSearchParams({
    _version: String(row.version),
    occurred_on: '2026-09-20',
    class_context: 'Grade 4 reading, 18 students',
    evidence: 'Students led a book-club discussion using the fishbowl protocol.',
    glow: 'Facilitator moves were consistent — Alice distributed turns evenly.',
    grow: '',
    next_step: 'Try a written prompt so quieter students contribute in writing.',
    _action: 'draft_share',
  });
  const r = await coachOne.post(`/coach/teachers/${IDS.alice}/notes/${draftId}/update`, form);
  ok('CoachOne draft_share → 302', r.status === 302, `HTTP ${r.status}`);
  ok('draft_share redirect says "Shared" (URL-decoded)', locHas(r.location, 'Shared'), `loc=${r.location}`);
}
{
  const t = await alice.get('/teacher');
  ok('Alice now sees the shared entry', t.text.includes('Facilitator moves were consistent'), 'share not visible');
  ok('Alice sees author "CoachOne Combined"', t.text.includes('CoachOne Combined'), 'author label missing');
}
{
  // A second coach's draft on Alice is still isolated after CoachOne shared theirs.
  // Verify PureCoach still doesn't see CoachOne's now-shared note in the coach view
  // (that's OWN-author-only; the visibility rule says teacher gets to see it, other
  // coach does not).
  const r = await pureCoach.get(`/coach/teachers/${IDS.alice}`);
  ok('PureCoach still does NOT see CoachOne\'s shared note in coach view',
     !r.text.includes('Facilitator moves were consistent'),
     'coach view leaked shared note to another coach');
}

// Now the notification idempotency probe.  We re-issue draft_share twice more.
// Each retry must NOT append a notification.
{
  const row = db.prepare(`SELECT version FROM coaching_notes WHERE id=?`).get(draftId);
  const retryForm = new URLSearchParams({
    _version: String(row.version),
    occurred_on: '2026-09-20',
    class_context: 'Grade 4 reading, 18 students',
    evidence: 'Students led a book-club discussion using the fishbowl protocol.',
    glow: 'Facilitator moves were consistent — Alice distributed turns evenly.',
    grow: '',
    next_step: 'Try a written prompt so quieter students contribute in writing.',
    _action: 'draft_share',
  });
  await coachOne.post(`/coach/teachers/${IDS.alice}/notes/${draftId}/update`, retryForm);
  await sleep(50);
  await coachOne.post(`/coach/teachers/${IDS.alice}/notes/${draftId}/update`, retryForm);
  await sleep(50);
  const postAliceNotifs = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`
  ).get(IDS.alice, draftId).n;
  ok(`exactly one coach_note notification for Alice on note ${draftId} (got ${postAliceNotifs})`,
     postAliceNotifs === 1, `got ${postAliceNotifs}`);
}

// ==========================================================================
suite('Case 3b — Concurrent-share race safety (Promise.all bursts must still produce ONE notification)');

let raceDraftId = null;
{
  // Create a second draft to race on.
  const form = new URLSearchParams({
    _token: 'race-token-' + Date.now(),
    occurred_on: '2026-09-21',
    evidence: 'Second visit — same routines.',
    glow: 'Consistent transitions.',
    _action: 'draft',
  });
  const r = await coachOne.post(`/coach/teachers/${IDS.alice}/notes`, form);
  ok('created second draft', r.status === 302);
  const row = db.prepare(
    `SELECT id FROM coaching_notes WHERE author_id=? AND teacher_id=? ORDER BY id DESC LIMIT 1`
  ).get(IDS.coachOne, IDS.alice);
  raceDraftId = row.id;
}
{
  const version = db.prepare(`SELECT version FROM coaching_notes WHERE id=?`).get(raceDraftId).version;
  const notifBefore = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE entity_id=? AND kind='coach_note'`
  ).get(raceDraftId).n;
  const form = new URLSearchParams({
    _version: String(version),
    occurred_on: '2026-09-21',
    evidence: 'Second visit — same routines.',
    glow: 'Consistent transitions.',
    _action: 'draft_share',
  });
  // Fire 5 in parallel.  Only ONE should win the atomic UPDATE.  Only ONE
  // should notify Alice.  ALL responses should be 302 — the winner redirects
  // with a "Shared" message and the losers redirect with an "Already shared"
  // message (no bare 400s).
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      coachOne.post(`/coach/teachers/${IDS.alice}/notes/${raceDraftId}/update`, form)
    )
  );
  ok('all 5 concurrent requests returned 302', results.every(r => r.status === 302),
     `statuses: ${results.map(r=>r.status).join(',')}`);
  // Winner's redirect contains "Shared with teacher"; every loser lands on
  // an "Already shared" message (three possible flavours from the handler —
  // pre-check, atomic-update no-op, and idempotent-create path).  Assert the
  // union so any of those is accepted as a graceful loss.
  const winners = results.filter(r => locHas(r.location, 'Shared with teacher'));
  const losers  = results.filter(r => locHas(r.location, 'Already shared'));
  ok(`exactly one race winner (got ${winners.length}) and rest are graceful losers (got ${losers.length})`,
     winners.length === 1 && (winners.length + losers.length) === 5,
     `winners=${winners.length} losers=${losers.length}; locations: ${results.map(r=>r.location).join(' | ')}`);
  const notifAfter = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE entity_id=? AND kind='coach_note'`
  ).get(raceDraftId).n;
  ok(`concurrent shares created exactly one notification (before=${notifBefore}, after=${notifAfter})`,
     notifAfter - notifBefore === 1, `delta was ${notifAfter - notifBefore}`);
  const status = db.prepare(`SELECT status, first_shared_at FROM coaching_notes WHERE id=?`).get(raceDraftId);
  ok('note is shared with first_shared_at set', status.status === 'shared' && !!status.first_shared_at);
}

// ==========================================================================
suite('Case 3c — Idempotency on CREATE: same _token collapses to one row');

{
  const token = 'idem-' + Date.now();
  const form = new URLSearchParams({
    _token: token,
    occurred_on: '2026-09-22',
    evidence: 'idempotency probe',
    glow: 'x',
    _action: 'draft',
  });
  const before = db.prepare(`SELECT COUNT(*) AS n FROM coaching_notes WHERE author_id=? AND teacher_id=?`)
    .get(IDS.coachOne, IDS.alice).n;
  // Fire 3 identical requests concurrently.
  const results = await Promise.all(
    Array.from({ length: 3 }, () => coachOne.post(`/coach/teachers/${IDS.alice}/notes`, form))
  );
  ok('all 3 duplicate creates returned 302', results.every(r => r.status === 302),
     `statuses: ${results.map(r=>r.status).join(',')}`);
  const after = db.prepare(`SELECT COUNT(*) AS n FROM coaching_notes WHERE author_id=? AND teacher_id=?`)
    .get(IDS.coachOne, IDS.alice).n;
  ok(`exactly one row inserted (before=${before}, after=${after})`, after - before === 1, `delta=${after-before}`);
}

// ==========================================================================
suite('Case 4 — Server-side authz rejects altered form targets, other authors\' drafts, self-coach');

{
  // CoachTwo tries to edit CoachOne's draft note (a real overlap: both are
  // assigned to Alice, but the note is CoachOne's).  Server must refuse on
  // author-ownership grounds, not on assignment grounds.
  const version = db.prepare(`SELECT version FROM coaching_notes WHERE id=?`).get(draftId).version;
  // CoachTwo isn't assigned to Alice, but she IS assigned to Bob — so we need
  // a different setup.  Give CoachTwo a temporary Alice assignment via DB
  // so we test AUTHOR-OWNERSHIP not assignment.
  db.prepare(`INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active) VALUES (?, ?, 'coach', 1, 1)`).run(IDS.alice, IDS.coachTwo);
  try {
    const form = new URLSearchParams({
      _version: String(version),
      occurred_on: '2026-09-20',
      evidence: 'hijack attempt', glow: 'x', _action: 'draft_save',
    });
    const r = await coachTwo.post(`/coach/teachers/${IDS.alice}/notes/${draftId}/update`, form);
    ok('CoachTwo blocked from editing CoachOne\'s note (author-ownership)',
       r.status === 403, `HTTP ${r.status}`);
  } finally {
    db.prepare(`DELETE FROM assignments WHERE teacher_id=? AND staff_id=? AND relationship='coach'`).run(IDS.alice, IDS.coachTwo);
  }
}
{
  // Altered POST target — CoachOne tries to write for Dan (not her coachee)
  const form = new URLSearchParams({
    _token: 'alter-'+Date.now(), occurred_on: '2026-09-22', glow: 'x', _action: 'draft',
  });
  const r = await coachOne.post(`/coach/teachers/${IDS.dan}/notes`, form);
  ok('CoachOne blocked from writing note for unassigned Dan', r.status === 403, `HTTP ${r.status}`);
}
{
  // Self-coach POST
  const form = new URLSearchParams({
    _token: 'self-'+Date.now(), occurred_on: '2026-09-22', glow: 'x', _action: 'draft',
  });
  const r = await coachOne.post(`/coach/teachers/${IDS.coachOne}/notes`, form);
  ok('CoachOne blocked from self-coaching POST', r.status === 403, `HTTP ${r.status}`);
}
{
  // Coach cannot export observation scores CSV
  const r = await pureCoach.get(`/reports/csv?mode=scores`);
  ok('PureCoach blocked from CSV mode=scores', r.status === 403, `HTTP ${r.status}`);
}
{
  // BUT: teacher-coach exporting their OWN scores must succeed.  CoachOne
  // is a teacher-coach; their teacher-scope report path filters by teacher_id
  // = self.  Should NOT be 403.
  const r = await coachOne.get(`/reports/csv?mode=scores`);
  // CoachOne is role=teacher so this hits the teacher-scope path.  Scores
  // CSV for her own record: no observations exist for CoachOne in the
  // fixture, so the CSV is empty but still returns 200.
  ok('CoachOne (teacher-coach) CAN export her own scores CSV (200)',
     r.status === 200, `HTTP ${r.status}`);
}

// ==========================================================================
suite('Case 5 — Coaching feedback creates ZERO observations/scores/PD credit');

{
  const before = {
    observations: db.prepare('SELECT COUNT(*) AS n FROM observations').get().n,
    feedback_items: db.prepare('SELECT COUNT(*) AS n FROM feedback_items').get().n,
    obs_scores: db.prepare('SELECT COUNT(*) AS n FROM observation_scores').get().n,
    focus_areas: db.prepare('SELECT COUNT(*) AS n FROM focus_areas').get().n,
    pd_enrollments: db.prepare('SELECT COUNT(*) AS n FROM pd_enrollments').get().n,
    deliv_scores: db.prepare('SELECT COUNT(*) AS n FROM pd_deliverable_scores').get().n,
  };
  // Create one more coaching note.
  await coachOne.post(`/coach/teachers/${IDS.alice}/notes`, new URLSearchParams({
    _token: 'nozero-'+Date.now(), occurred_on: '2026-09-23',
    evidence: 'follow-up', glow: 'growth', _action: 'draft_share',
  }));
  const after = {
    observations: db.prepare('SELECT COUNT(*) AS n FROM observations').get().n,
    feedback_items: db.prepare('SELECT COUNT(*) AS n FROM feedback_items').get().n,
    obs_scores: db.prepare('SELECT COUNT(*) AS n FROM observation_scores').get().n,
    focus_areas: db.prepare('SELECT COUNT(*) AS n FROM focus_areas').get().n,
    pd_enrollments: db.prepare('SELECT COUNT(*) AS n FROM pd_enrollments').get().n,
    deliv_scores: db.prepare('SELECT COUNT(*) AS n FROM pd_deliverable_scores').get().n,
  };
  for (const k of Object.keys(before)) {
    ok(`${k} unchanged (${before[k]} → ${after[k]})`, before[k] === after[k]);
  }
}

// ==========================================================================
suite('Case 6 — Notifications: recipient link works AND lands on an authorized page');

{
  // Verify the coach_note notification for Alice points at /teacher#coaching-feedback
  // and that Alice can actually load that URL (not a 404, not a 403).
  const notif = db.prepare(
    `SELECT url FROM notifications WHERE user_id=? AND kind='coach_note' ORDER BY id DESC LIMIT 1`
  ).get(IDS.alice);
  ok('recipient notification has a URL', !!notif?.url, `url=${notif?.url}`);
  // Follow the link as the recipient (strip the fragment since fetch ignores it).
  const url = (notif?.url || '').split('#')[0];
  const r = await alice.get(url);
  ok(`notification link ${url} loads for the recipient with HTTP 200 (not 404 or 403)`,
     r.status === 200, `HTTP ${r.status}`);
  // C5b tightening: require the response to show the entry — the /teacher
  // page must actually contain the previously-shared feedback content.
  ok(`recipient's landing page shows the shared feedback content`,
     r.text.includes('Facilitator moves were consistent'),
     'landing page did not surface the shared feedback');
}
{
  // Teacher-coach eligibility for PD-submit notifications: exercise the REAL
  // /teacher/pd/:id/submit path.  Bob (coachee of Principal, PureCoach,
  // CoachTwo) submits a deliverable for enrollment 200 (seeded).  All three
  // supervisors should receive a pd_deliverable_submitted notification.
  const beforeCount = (uid) => db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='pd_deliverable_submitted' AND entity_id=200`
  ).get(uid).n;
  const before = {
    [IDS.principal]: beforeCount(IDS.principal),
    [IDS.pureCoach]: beforeCount(IDS.pureCoach),
    [IDS.coachTwo]: beforeCount(IDS.coachTwo),
  };
  const form = new URLSearchParams({ title: 'PD deliverable test', body: 'deliverable body' });
  const r = await bob.post(`/teacher/pd/200/submit`, form);
  ok('Bob POST /teacher/pd/200/submit returns 302', r.status === 302, `HTTP ${r.status}`);
  // Confirm each recipient got exactly one new notification and the URL is
  // /pd/review/200 (NOT /appraiser/pd/review/200).
  const after = {
    [IDS.principal]: beforeCount(IDS.principal),
    [IDS.pureCoach]: beforeCount(IDS.pureCoach),
    [IDS.coachTwo]: beforeCount(IDS.coachTwo),
  };
  ok(`Principal notified (${before[IDS.principal]} → ${after[IDS.principal]})`,
     after[IDS.principal] === before[IDS.principal] + 1);
  ok(`PureCoach notified (${before[IDS.pureCoach]} → ${after[IDS.pureCoach]})`,
     after[IDS.pureCoach] === before[IDS.pureCoach] + 1);
  ok(`CoachTwo (teacher-coach) notified (${before[IDS.coachTwo]} → ${after[IDS.coachTwo]})`,
     after[IDS.coachTwo] === before[IDS.coachTwo] + 1);
  const notifUrl = db.prepare(
    `SELECT url FROM notifications WHERE user_id=? AND kind='pd_deliverable_submitted' AND entity_id=200 ORDER BY id DESC LIMIT 1`
  ).get(IDS.coachTwo).url;
  ok(`PD-submit notification URL is /pd/review/200 (got "${notifUrl}")`,
     notifUrl === '/pd/review/200', `got "${notifUrl}"`);
}
{
  // Every recipient must be able to reach /pd/review/200 with HTTP 200 (not
  // 404 — that was the OLD test's weakness).  PureCoach + CoachTwo both
  // qualify via relationship='coach'.  Principal qualifies via 'appraiser'.
  const principal = await new Client('principal@test','Principal').login();
  for (const [label, cli] of [['Principal', principal], ['PureCoach', pureCoach], ['CoachTwo', coachTwo]]) {
    const r = await cli.get('/pd/review/200');
    ok(`${label} can access /pd/review/200 with HTTP 200`,
       r.status === 200, `HTTP ${r.status}`);
  }
  // But CoachThree (has no assignments) MUST get 403 — never 200 or 404.
  const r = await coachThree.get('/pd/review/200');
  ok('CoachThree gets 403 on /pd/review/200 (not 404 or 200)',
     r.status === 403, `HTTP ${r.status}`);
}
{
  // Regression: the PD-submitted notification url must be /pd/review/:id, not
  // /appraiser/pd/review/:id.  Bundle text check as a belt on the runtime
  // check above.
  const { readFileSync } = await import('node:fs');
  const bundle = readFileSync('dist/_worker.js', 'utf8');
  ok('bundle does NOT contain broken /appraiser/pd/review/ URL',
     !bundle.includes('/appraiser/pd/review/'));
}

// ==========================================================================
suite('Case 7 — Report leaks & permissions');

{
  // PureCoach fetches the PD Completion report for Alice (coachee, has an
  // observation → auto-enrolled).  Alice doesn't have a seeded pd_enrollment
  // in the fixture — Bob does.  So fetch it and confirm source_score_level
  // is scrubbed for Bob's row when viewed by PureCoach.
  const r = await pureCoach.get('/reports/pd');
  ok('PureCoach loads /reports/pd (200)', r.status === 200, `HTTP ${r.status}`);
  // Bob's row is present but "Auto (L2)" text (from source_score_level=2)
  // must NOT appear.  The bundle emits "Auto (L{n})" for source_score_level;
  // we grep the response HTML.
  ok('PureCoach\'s /reports/pd does NOT show "Auto (L2)" for Bob',
     !r.text.includes('Auto (L2)'), 'source_score_level leaked to coach');
}
{
  // Same check on CSV.
  const r = await pureCoach.get('/reports/pd.csv');
  ok('PureCoach loads /reports/pd.csv (200)', r.status === 200, `HTTP ${r.status}`);
    // Trigger Score Level is column index 11 in the header.  A naive
    // comma split would break on quoted cells that contain commas or
    // em-dashes, so use a proper CSV row parser.
    const lines = r.text.split(/\r?\n/);
    const bobRow = lines.find(l => l.startsWith('200,'));
    ok(`Bob's CSV row exists`, !!bobRow, `no row for enrollment 200`);
    if (bobRow) {
      const cols = parseCsvRow(bobRow);
      ok(`Trigger Score Level is blank for Bob's row in PureCoach CSV (got "${cols[11]}")`,
         cols[11] === '' || cols[11] === undefined, `got "${cols[11]}"; row: ${bobRow}`);
    }
}
{
  // Principal (appraiser) SHOULD still see source_score_level.  Sanity.
  const r = await new Client('principal@test','Principal').login().then(c => c.get('/reports/pd'));
  ok('Principal loads /reports/pd (200)', r.status === 200);
  ok('Principal DOES see "Auto (L2)" for Bob',
     r.text.includes('Auto (L2)'), 'principal lost score visibility');
}
{
  // PD drill-down /reports/pd/200 authz — PureCoach is Bob's coach, allowed.
  const r = await pureCoach.get('/reports/pd/200');
  ok('PureCoach drill-down for Bob (200)', r.status === 200, `HTTP ${r.status}`);
}
{
  // ...but the same drill-down for CoachThree (has NO assignments at all)
  // must 403.
  const r = await coachThree.get('/reports/pd/200');
  ok('CoachThree drill-down for Bob is 403 (no assignment)', r.status === 403, `HTTP ${r.status}`);
}

// ==========================================================================
suite('Case 8 — Revoked capability revokes access without deleting history');

{
  // Take can_coach away from CoachOne.  Her existing notes must remain in
  // the DB; her /coach access must go away on the next request.
  db.prepare(`UPDATE users SET can_coach=0 WHERE id=?`).run(IDS.coachOne);
  // Re-login (session may cache — but our auth reads users.* on every request
  // so no restart needed).
  const r = await coachOne.get('/coach');
  ok('CoachOne after can_coach=0 → /coach 403', r.status === 403, `HTTP ${r.status}`);
  // Her authored notes still exist.
  const notes = db.prepare(`SELECT COUNT(*) AS n FROM coaching_notes WHERE author_id=?`).get(IDS.coachOne).n;
  ok(`CoachOne's coaching_notes rows preserved (${notes} exist)`, notes > 0);
  // Alice still sees the previously-shared entry from CoachOne.
  const t = await alice.get('/teacher');
  ok('Alice retains her previously-shared coaching feedback', t.text.includes('Facilitator moves were consistent'));
  // Restore for subsequent tests.
  db.prepare(`UPDATE users SET can_coach=1 WHERE id=?`).run(IDS.coachOne);
}

// ==========================================================================
suite('Case 9 — Hard-delete guard preserves coaching history');

{
  const r = await admin.post(`/admin/users/${IDS.coachOne}/hard-delete`, new URLSearchParams({}));
  ok('admin hard-delete CoachOne → 302', r.status === 302, `HTTP ${r.status}`);
  ok('redirect indicates soft-delete fallback (evaluation OR coaching)',
     locHas(r.location, 'evaluation') || locHas(r.location, 'coaching'),
     `loc=${r.location}`);
  const row = db.prepare(`SELECT id, active FROM users WHERE id=?`).get(IDS.coachOne);
  ok('CoachOne user row still exists', !!row);
  ok('CoachOne is now active=0', row?.active === 0, `active=${row?.active}`);
  const notes = db.prepare(`SELECT COUNT(*) AS n FROM coaching_notes WHERE author_id=?`).get(IDS.coachOne).n;
  ok(`CoachOne's authored coaching notes preserved (${notes} rows)`, notes > 0);
  // Restore for a clean fixture next time
  db.prepare(`UPDATE users SET active=1 WHERE id=?`).run(IDS.coachOne);
}

// ==========================================================================
suite('Case 10 — Preserved teacher records/hours/observations/acknowledgment for a teacher-coach');

// Case 9's hard-delete-soft-fallback deleted CoachOne's sessions row, which
// invalidates her cookie.  We're testing behavior here, not session
// mechanics — reissue the login before probing her workspace.  Any real
// user in this state would just log back in on their next click.
await coachOne.login();

// F5a (Sept 23 follow-up): the "before" snapshot for the preservation test
// must come from BEFORE the first coach mutation — not from a snapshot
// taken at Case 10 time, which is after Cases 2–9 already exercised coach
// paths for CoachOne.  We use `fixtureBaseline` captured at the top of the
// suite (see PRE-CASE-1 block above) instead of reading DB values here.
// The comparison is: fixture's seeded values (constants) === current DB
// values.  If any coach activity had spilled into her teacher-side records,
// this assertion would fail.
//
// The seeded constants in tests/fixture.mjs are:
//   observation 101 : status='acknowledged', acked=1 (teacher_acknowledged_at set)
//   observation_scores(observation_id=101) : level=3
//   pd_enrollments(id=201) : status='verified', hours_credited=3.5
// Any change from those exact values means coach-mode activity leaked.
const FIXTURE_BASELINE = {
  obs101_status: 'acknowledged',
  obs101_acked: 1,
  obs101_score_level: 3,
  enr201_status: 'verified',
  enr201_hours_credited: 3.5,
};

{
  const r = await coachOne.get('/teacher');
  ok('CoachOne /teacher after coaching activity still 200', r.status === 200);
  ok('CoachOne\'s teacher home shows PD Hours pill', r.text.includes('PD Hours This Year'));
  // F5a: compare current values against the fixture's SEEDED baseline (a
  // constant captured before any coach activity ran).  This is stronger than
  // "current === snapshot-taken-at-Case-10" because Cases 2–9 already ran
  // coach-mode POSTs by the time Case 10 starts.
  const nowObs = db.prepare(
    `SELECT status, teacher_acknowledged_at IS NOT NULL AS acked FROM observations WHERE id=101`
  ).get();
  ok(`CoachOne's own observation 101 status unchanged (fixture=${FIXTURE_BASELINE.obs101_status} → now=${nowObs.status})`,
     nowObs.status === FIXTURE_BASELINE.obs101_status);
  ok(`CoachOne's own observation acknowledgement preserved (fixture=${FIXTURE_BASELINE.obs101_acked} → now=${nowObs.acked})`,
     nowObs.acked === FIXTURE_BASELINE.obs101_acked);
  const nowEnr = db.prepare(`SELECT status, hours_credited FROM pd_enrollments WHERE id=201`).get();
  ok(`CoachOne's PD enrollment 201 status unchanged (fixture=${FIXTURE_BASELINE.enr201_status} → now=${nowEnr.status})`,
     nowEnr.status === FIXTURE_BASELINE.enr201_status);
  ok(`CoachOne's credited hours preserved (fixture=${FIXTURE_BASELINE.enr201_hours_credited} → now=${nowEnr.hours_credited})`,
     nowEnr.hours_credited === FIXTURE_BASELINE.enr201_hours_credited);
  const nowScore = db.prepare(`SELECT level FROM observation_scores WHERE observation_id=101 LIMIT 1`).get();
  ok(`CoachOne's own observation score unchanged (fixture=${FIXTURE_BASELINE.obs101_score_level} → now=${nowScore.level})`,
     nowScore.level === FIXTURE_BASELINE.obs101_score_level);
  // Her /reports/pd (teacher-coach) shows own PD + coachee PD (union).
  const pd = await coachOne.get('/reports/pd');
  ok('CoachOne\'s /reports/pd includes her OWN enrollment 201',
     pd.text.includes('/reports/pd/201'), '201 missing');
  ok('CoachOne\'s /reports/pd includes Bob\'s enrollment 200', pd.text.includes('/reports/pd/200'));
  // ...but source_score_level for Bob (someone else's row) must be scrubbed.
  ok('CoachOne\'s /reports/pd does NOT show "Auto (L2)" for Bob',
     !pd.text.includes('Auto (L2)'), 'teacher-coach still leaks other-teacher source score');
  // Her own observation-scope CSV must still contain her seeded score.
  const csv = await coachOne.get('/reports/csv?mode=scores');
  ok('CoachOne can pull her own scores CSV (HTTP 200)', csv.status === 200);
  // The seeded evidence_note is 'CoachOne evidence' — must appear in the CSV.
  ok('CoachOne\'s own scores CSV contains her seeded evidence note',
     csv.text.includes('CoachOne evidence'), 'own scores missing from own report');
}

// ==========================================================================
suite('Case 11 — R3: shared entries cannot be silently emptied by draft actions');

{
  // Try to hit /update on a SHARED entry with _action=draft_save.  Server
  // must refuse — expect a 302 with an "Already shared" msg, not a hard 400,
  // so the client re-renders cleanly.
  const version = db.prepare(`SELECT version FROM coaching_notes WHERE id=?`).get(draftId).version;
  const form = new URLSearchParams({
    _version: String(version),
    occurred_on: '2026-09-20',
    _action: 'draft_save',  // wrong action for a shared entry
  });
  const r = await coachOne.post(`/coach/teachers/${IDS.alice}/notes/${draftId}/update`, form);
  ok('shared entry rejects draft_save with redirect (302)', r.status === 302, `HTTP ${r.status}`);
  ok('shared entry redirect explains it is already shared',
     locHas(r.location, 'Already shared'), `loc=${r.location}`);
  // The shared content must remain intact.
  const row = db.prepare(`SELECT evidence FROM coaching_notes WHERE id=?`).get(draftId);
  ok('shared entry evidence still present',
     row.evidence?.includes('fishbowl protocol'),
     `evidence="${row.evidence}"`);
}

// ==========================================================================
suite('Case 12 — R3: shared entries require meaningful content on save');

{
  const version = db.prepare(`SELECT version FROM coaching_notes WHERE id=?`).get(draftId).version;
  const form = new URLSearchParams({
    _version: String(version),
    occurred_on: '2026-09-20',
    // All content fields deliberately blank
    evidence: '', glow: '', grow: '', next_step: '',
    _action: 'shared_save',
  });
  const r = await coachOne.post(`/coach/teachers/${IDS.alice}/notes/${draftId}/update`, form);
  ok('shared_save with blank content → 302 to error message', r.status === 302,
     `HTTP ${r.status}`);
  ok('shared_save blank content redirect explains the requirement',
     locHas(r.location, 'Add at least one of'), `loc=${r.location}`);
  // Original evidence must still be intact.
  const row = db.prepare(`SELECT evidence FROM coaching_notes WHERE id=?`).get(draftId);
  ok('shared entry evidence not overwritten by rejected save',
     row.evidence?.includes('fishbowl protocol'));
}

// ==========================================================================
suite('Case 13 — C1 direct-share fix: fresh POST /notes with _action=share creates row+audit+notification');
{
  // The bug you saw in preview: coach clicks "Share with teacher" on a NEW
  // note and the response says "Already shared with teacher" without any
  // row / audit / notification being written on the FIRST attempt.
  // With the RETURNING-based fresh/duplicate distinction, this MUST work.
  const notifBefore = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note'`
  ).get(IDS.alice).n;
  const notesBefore = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_notes WHERE author_id=? AND teacher_id=?`
  ).get(IDS.coachOne, IDS.alice).n;
  const form = new URLSearchParams({
    _token: 'c1-fresh-' + Date.now(),
    occurred_on: '2026-09-22', // C2: this MUST render as Sep 22 in views
    class_context: 'Direct-share fixture',
    glow: 'C1 fresh strength-only entry — must land on first click',
    _action: 'share',
  });
  const r = await coachOne.post(`/coach/teachers/${IDS.alice}/notes`, form);
  ok('fresh direct-share returns 302', r.status === 302, `HTTP ${r.status}`);
  ok('fresh direct-share redirect says "Shared with teacher" (NOT "Already shared")',
     locHas(r.location, 'Shared with teacher') && !locHas(r.location, 'Already shared'),
     `loc=${r.location}`);
  const notesAfter = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_notes WHERE author_id=? AND teacher_id=?`
  ).get(IDS.coachOne, IDS.alice).n;
  ok(`fresh direct-share created exactly one note row (${notesBefore} → ${notesAfter})`,
     notesAfter === notesBefore + 1);
  // The new row must have create+share audit rows AND be status='shared'.
  const newest = db.prepare(
    `SELECT id, status, first_shared_at FROM coaching_notes
      WHERE author_id=? AND teacher_id=? ORDER BY id DESC LIMIT 1`
  ).get(IDS.coachOne, IDS.alice);
  ok('new row is status=shared with first_shared_at set',
     newest.status === 'shared' && !!newest.first_shared_at,
     `status=${newest.status} first_shared_at=${newest.first_shared_at}`);
  const audits = db.prepare(
    `SELECT action FROM coaching_note_audit WHERE note_id=? ORDER BY id`
  ).all(newest.id).map(r => r.action);
  ok(`audit trail has create + share (got [${audits.join(',')}])`,
     audits.includes('create') && audits.includes('share'),
     `audits=[${audits.join(',')}]`);
  const notifAfter = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note'`
  ).get(IDS.alice).n;
  ok(`fresh direct-share fired exactly one notification (${notifBefore} → ${notifAfter})`,
     notifAfter === notifBefore + 1);
  // Retrying the SAME token must NOT create a second row or a second notification.
  const r2 = await coachOne.post(`/coach/teachers/${IDS.alice}/notes`, form);
  ok('retry with same token returns 302', r2.status === 302);
  ok('retry redirect says "Already shared" (not a fresh success)',
     locHas(r2.location, 'Already shared'), `loc=${r2.location}`);
  const notesFinal = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_notes WHERE author_id=? AND teacher_id=?`
  ).get(IDS.coachOne, IDS.alice).n;
  ok(`retry did NOT create a second row (${notesAfter} → ${notesFinal})`, notesFinal === notesAfter);
  const notifFinal = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note'`
  ).get(IDS.alice).n;
  ok(`retry did NOT fire a second notification (${notifAfter} → ${notifFinal})`, notifFinal === notifAfter);

  // C2 date rendering: the shared entry, viewed by BOTH coach and teacher,
  // must display "Sep 22, 2026" (not "Sep 21").
  const teacherView = await alice.get('/teacher');
  ok('Alice teacher view renders occurred_on as "Sep 22, 2026"',
     teacherView.text.includes('Sep 22, 2026'),
     'date shifted in teacher view');
  const coachView = await coachOne.get(`/coach/teachers/${IDS.alice}`);
  ok('CoachOne coach view renders occurred_on as "Sep 22, 2026"',
     coachView.text.includes('Sep 22, 2026'),
     'date shifted in coach view');
}

// ==========================================================================
suite('Case 14 — F2 notify-retry recovers from a real delivery failure and is idempotent');
{
  // F2 (Sept 23 follow-up): the correct way to simulate a "notification did
  // not deliver" state is to write a FAILED row into the delivery ledger —
  // NOT to delete the inbox row (which is now correctly IGNORED as a
  // source-of-truth signal; see Case 19 for that assertion).
  //
  // Setup: create a shared note, then overwrite its delivery ledger row to
  // status='failed' and clear the inbox row.  That's what a genuine notify()
  // exception would have produced.  A retry must then succeed and create
  // exactly one inbox row + flip the ledger to 'delivered'.
  const form = new URLSearchParams({
    _token: 'c14-notify-' + Date.now(),
    occurred_on: '2026-09-23',
    glow: 'C14 notify-retry test entry',
    _action: 'share',
  });
  await coachOne.post(`/coach/teachers/${IDS.alice}/notes`, form);
  const noteId = db.prepare(
    `SELECT id FROM coaching_notes WHERE author_id=? AND teacher_id=? ORDER BY id DESC LIMIT 1`
  ).get(IDS.coachOne, IDS.alice).id;
  // Force the "delivery failed" state.  Both writes together are what a
  // real notify() throw would have left behind (delivery=failed, no inbox).
  db.prepare(`DELETE FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`)
    .run(IDS.alice, noteId);
  const upd = db.prepare(
    `UPDATE coaching_note_share_delivery SET status='failed', detail='simulated for C14', notif_id=NULL, updated_at=CURRENT_TIMESTAMP WHERE note_id=?`
  ).run(noteId);
  ok(`forced delivery ledger to 'failed' (updated ${upd.changes})`, upd.changes === 1);
  // Coach view must show the "Notification not delivered" badge for THIS note.
  const view = await coachOne.get(`/coach/teachers/${IDS.alice}`);
  ok('coach view shows "Notification not delivered" badge for the failed-delivery note',
     view.text.includes('Notification not delivered'),
     'badge missing');
  // Trigger notify-retry — should win the atomic UPDATE status='failed' →
  // 'attempting' flip, call notify(), and land at 'delivered'.
  const retry = await coachOne.post(`/coach/teachers/${IDS.alice}/notes/${noteId}/notify-retry`, new URLSearchParams({}));
  ok('notify-retry returns 302', retry.status === 302, `HTTP ${retry.status}`);
  ok('notify-retry redirect says "Notification sent"',
     locHas(retry.location, 'Notification sent'), `loc=${retry.location}`);
  const nowN = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`
  ).get(IDS.alice, noteId).n;
  ok(`notify-retry re-created exactly one notification (${nowN})`, nowN === 1);
  const dstat = db.prepare(`SELECT status FROM coaching_note_share_delivery WHERE note_id=?`).get(noteId).status;
  ok(`delivery ledger now 'delivered' (got '${dstat}')`, dstat === 'delivered');
  // Second retry: idempotent no-op via the ledger check.
  const retry2 = await coachOne.post(`/coach/teachers/${IDS.alice}/notes/${noteId}/notify-retry`, new URLSearchParams({}));
  ok('second notify-retry says already delivered',
     locHas(retry2.location, 'already delivered'), `loc=${retry2.location}`);
  const finalN = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`
  ).get(IDS.alice, noteId).n;
  ok(`second retry did NOT duplicate (${nowN} → ${finalN})`, finalN === nowN);
}

// ==========================================================================
suite('Case 15 — C7 super_admin is view-only on coaching notes');
{
  // Admin can VIEW Alice's coach page (super_admin bypass in requireCoachAssignment).
  const viewRes = await admin.get(`/coach/teachers/${IDS.alice}`);
  ok('admin can VIEW Alice\'s coach page (view-only support access)',
     viewRes.status === 200, `HTTP ${viewRes.status}`);
  // The new-note form is HIDDEN and the "view-only" banner shows.
  ok('admin\'s view of coach page HIDES the new-note form',
     !viewRes.text.includes('name="_token"'),
     'new-note form leaked to super_admin');
  ok('admin\'s view of coach page shows the view-only support banner',
     viewRes.text.includes('view-only'), 'view-only banner missing');

  // Admin POST create must be blocked with 403.
  const createForm = new URLSearchParams({
    _token: 'admin-write-' + Date.now(),
    occurred_on: '2026-09-23',
    glow: 'admin should not be able to write this',
    _action: 'share',
  });
  const cRes = await admin.post(`/coach/teachers/${IDS.alice}/notes`, createForm);
  ok('admin POST /notes → 403 (view-only)', cRes.status === 403, `HTTP ${cRes.status}`);
  // Admin POST update must be blocked with 403 as well.  Grab an existing
  // note id (any of CoachOne's on Alice).
  const anyNote = db.prepare(
    `SELECT id, version FROM coaching_notes WHERE author_id=? AND teacher_id=? ORDER BY id DESC LIMIT 1`
  ).get(IDS.coachOne, IDS.alice);
  const uForm = new URLSearchParams({
    _version: String(anyNote.version), occurred_on: '2026-09-23',
    glow: 'admin should not edit', _action: 'shared_save',
  });
  const uRes = await admin.post(`/coach/teachers/${IDS.alice}/notes/${anyNote.id}/update`, uForm);
  ok('admin POST /update → 403 (view-only)', uRes.status === 403, `HTTP ${uRes.status}`);
  // Admin notify-retry must be blocked with 403.
  const nRes = await admin.post(`/coach/teachers/${IDS.alice}/notes/${anyNote.id}/notify-retry`, new URLSearchParams({}));
  ok('admin POST /notify-retry → 403 (view-only)', nRes.status === 403, `HTTP ${nRes.status}`);
  // Confirm nothing was written by any of those attempts.
  const noteVersion = db.prepare(`SELECT version FROM coaching_notes WHERE id=?`).get(anyNote.id).version;
  ok(`note version unchanged after admin write attempts (${anyNote.version} → ${noteVersion})`,
     noteVersion === anyNote.version);
}

// ==========================================================================
suite('Case 16 — notification-preference merging and revocation across two account types');
{
  // A teacher-coach (CoachOne) sees BOTH teacher-side and coach-side kinds
  // in her /profile.  A pure teacher (Alice) sees only teacher-side kinds.
  const pC = await coachOne.get('/profile');
  ok('CoachOne /profile 200', pC.status === 200);
  ok('CoachOne /profile shows a teacher-side kind (observation_published)',
     pC.text.includes('observation_published'));
  ok('CoachOne /profile shows a coach-side kind (pd_deliverable_submitted)',
     pC.text.includes('pd_deliverable_submitted'));
  const pA = await alice.get('/profile');
  ok('Alice /profile 200', pA.status === 200);
  ok('Alice /profile shows the teacher coach_note kind (she is a recipient)',
     pA.text.includes('coach_note'));
  ok('Alice /profile does NOT show pd_deliverable_submitted (not a coach)',
     !pA.text.includes('pd_deliverable_submitted'),
     'coach-side kind leaked to pure teacher');
}
{
  // Revocation: remove CoachOne's coach assignment to Alice.  Her /coach
  // page still works (she has Bob), but /coach/teachers/10 must 403.
  // Her authored notes on Alice STAY in the DB; Alice keeps seeing them.
  const notesBefore = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_notes WHERE author_id=? AND teacher_id=?`
  ).get(IDS.coachOne, IDS.alice).n;
  const aliceSeesBefore = (await alice.get('/teacher')).text.includes('C1 fresh strength-only entry');
  ok('Alice sees the C1 shared entry before revocation', aliceSeesBefore);
  db.prepare(
    `UPDATE assignments SET active=0 WHERE staff_id=? AND teacher_id=? AND relationship='coach'`
  ).run(IDS.coachOne, IDS.alice);
  const gone = await coachOne.get(`/coach/teachers/${IDS.alice}`);
  ok('CoachOne no longer authorized on /coach/teachers/10 after assignment revoked',
     gone.status === 403, `HTTP ${gone.status}`);
  const notesAfter = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_notes WHERE author_id=? AND teacher_id=?`
  ).get(IDS.coachOne, IDS.alice).n;
  ok(`CoachOne's authored notes on Alice preserved through revocation (${notesBefore} → ${notesAfter})`,
     notesAfter === notesBefore);
  const aliceSeesAfter = (await alice.get('/teacher')).text.includes('C1 fresh strength-only entry');
  ok('Alice STILL sees her previously-shared feedback after coach\'s assignment was revoked',
     aliceSeesAfter);
  // Restore for downstream tests.
  db.prepare(
    `UPDATE assignments SET active=1 WHERE staff_id=? AND teacher_id=? AND relationship='coach'`
  ).run(IDS.coachOne, IDS.alice);
}

// ==========================================================================
suite('Case 17 — hard-delete behavior for accounts with/without coaching history');
{
  // Alice IS a coaching-note recipient (many rows point to her via teacher_id).
  // Hard-deleting her should soft-fall-back and preserve every note.
  const aliceNotesBefore = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_notes WHERE teacher_id=?`
  ).get(IDS.alice).n;
  ok(`Alice has ${aliceNotesBefore} coaching notes as recipient`, aliceNotesBefore > 0);
  const rA = await admin.post(`/admin/users/${IDS.alice}/hard-delete`, new URLSearchParams({}));
  ok('admin hard-delete Alice returns 302', rA.status === 302, `HTTP ${rA.status}`);
  ok('Alice hard-delete → soft-fallback message mentions coaching or evaluation',
     locHas(rA.location, 'coaching') || locHas(rA.location, 'evaluation'),
     `loc=${rA.location}`);
  const aliceRow = db.prepare(`SELECT active FROM users WHERE id=?`).get(IDS.alice);
  ok('Alice row still exists (soft-deleted)', aliceRow && aliceRow.active === 0);
  const aliceNotesAfter = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_notes WHERE teacher_id=?`
  ).get(IDS.alice).n;
  ok(`Alice's inbound coaching notes preserved (${aliceNotesBefore} → ${aliceNotesAfter})`,
     aliceNotesAfter === aliceNotesBefore);
  // Restore.
  db.prepare(`UPDATE users SET active=1 WHERE id=?`).run(IDS.alice);
}
{
  // PlainTeacher (id 14) has NO coaching history, NO observations, NO PD.
  // Hard-delete for her should ACTUALLY DELETE the row (not soft-fallback).
  const before = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE id=?`).get(IDS.plain).n;
  ok('PlainTeacher exists before delete', before === 1);
  const r = await admin.post(`/admin/users/${IDS.plain}/hard-delete`, new URLSearchParams({}));
  ok('admin hard-delete PlainTeacher returns 302', r.status === 302, `HTTP ${r.status}`);
  const after = db.prepare(`SELECT COUNT(*) AS n FROM users WHERE id=?`).get(IDS.plain).n;
  ok(`PlainTeacher row is actually gone (${before} → ${after})`, after === 0);
}

// ==========================================================================
suite('Case 18 — F1 atomic write: forced audit failure leaves NO orphan note');
{
  // F1 (Sept 23 follow-up) claim: note write + audit write land in ONE
  // db.batch() transaction — either both persist or neither does.
  // To test this we install a trigger on coaching_note_audit that RAISEs an
  // exception on INSERT for a specific poisoned actor_id, force the write
  // path to run, and confirm the coaching_notes row is ALSO rolled back.
  db.exec(`
    DROP TRIGGER IF EXISTS test_poison_audit;
    CREATE TRIGGER test_poison_audit BEFORE INSERT ON coaching_note_audit
      WHEN NEW.actor_id = ${IDS.coachOne}
      BEGIN
        SELECT RAISE(ABORT, 'poisoned audit insert for F1 test');
      END;
  `);
  const notesBefore = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_notes WHERE author_id=? AND teacher_id=?`
  ).get(IDS.coachOne, IDS.bob).n;
  const auditBefore = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_note_audit
       WHERE actor_id=?
         AND note_id IN (SELECT id FROM coaching_notes WHERE author_id=? AND teacher_id=?)`
  ).get(IDS.coachOne, IDS.coachOne, IDS.bob).n;
  // POST a create.  Server will attempt to run [insert note, insert audit]
  // as one batch; the audit statement will RAISE ABORT; the batch rolls
  // back; the client should get a 5xx (the poison trigger surfaces as an
  // exception in the batch call, which coach.tsx does NOT catch — that's
  // by design, so the write path fails loudly instead of pretending success).
  const form = new URLSearchParams({
    _token: 'f1-poison-' + Date.now(),
    occurred_on: '2026-09-23',
    evidence: 'F1 atomic-write test — this INSERT must roll back with the audit',
    _action: 'draft',
  });
  let rStatus = 0;
  try {
    const r = await coachOne.post(`/coach/teachers/${IDS.bob}/notes`, form);
    rStatus = r.status;
  } catch (e) {
    rStatus = -1; // network/socket-level failure counts as "not 200/302"
  }
  ok('poisoned create returns 5xx (not a successful 302)',
     rStatus === 500 || rStatus === 400 || rStatus === -1,
     `HTTP ${rStatus} — expected a failure code because the audit trigger aborts the batch`);
  const notesAfter = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_notes WHERE author_id=? AND teacher_id=?`
  ).get(IDS.coachOne, IDS.bob).n;
  const auditAfter = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_note_audit
       WHERE actor_id=?
         AND note_id IN (SELECT id FROM coaching_notes WHERE author_id=? AND teacher_id=?)`
  ).get(IDS.coachOne, IDS.coachOne, IDS.bob).n;
  ok(`no orphan note row created (${notesBefore} → ${notesAfter})`, notesAfter === notesBefore);
  ok(`no orphan audit row created (${auditBefore} → ${auditAfter})`, auditAfter === auditBefore);
  // Clean up the poison trigger so subsequent cases (if any) aren't blocked.
  db.exec(`DROP TRIGGER IF EXISTS test_poison_audit`);
}

// ==========================================================================
suite('Case 19 — F2 concurrent notify-retry dedupes atomically');
{
  // F2 claim: two simultaneous notify-retry requests both hit
  // POST .../notify-retry; exactly ONE wins and sends the alert; the other
  // returns "in progress" or "already delivered".  Net notifications = 1.
  //
  // Setup: create a shared note whose delivery is in 'failed' state (we
  // simulate the failure by deleting the delivery row + the inbox row and
  // re-inserting a delivery row with status='failed', which is what a
  // real earlier notify() throw would have produced).
  const form = new URLSearchParams({
    _token: 'f2-concurrent-' + Date.now(),
    occurred_on: '2026-09-23',
    glow: 'F2 concurrent-retry test entry',
    _action: 'share',
  });
  await coachTwo.post(`/coach/teachers/${IDS.dan}/notes`, form);
  const note = db.prepare(
    `SELECT id FROM coaching_notes WHERE author_id=? AND teacher_id=? ORDER BY id DESC LIMIT 1`
  ).get(IDS.coachTwo, IDS.dan);
  ok('setup: shared note exists', !!note?.id);
  // Force delivery state to 'failed' + wipe the inbox row so the retry
  // must actually call notify().  Doing it directly in the DB simulates a
  // prior deliverShareNotification that threw.
  db.prepare(`DELETE FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`)
    .run(IDS.dan, note.id);
  db.prepare(`DELETE FROM coaching_note_share_delivery WHERE note_id=?`).run(note.id);
  db.prepare(`INSERT INTO coaching_note_share_delivery (note_id, status, detail) VALUES (?, 'failed', 'simulated prior failure')`)
    .run(note.id);
  // Fire two retries concurrently.  Promise.all serializes await but issues
  // the fetch immediately, so both HTTP requests go on the wire before
  // either response returns.  D1 serializes the atomic UPDATE inside
  // retryShareNotification → exactly one wins.
  const [r1, r2] = await Promise.all([
    coachTwo.post(`/coach/teachers/${IDS.dan}/notes/${note.id}/notify-retry`, new URLSearchParams({})),
    coachTwo.post(`/coach/teachers/${IDS.dan}/notes/${note.id}/notify-retry`, new URLSearchParams({})),
  ]);
  ok('both retries responded 302', r1.status === 302 && r2.status === 302,
     `r1=${r1.status} r2=${r2.status}`);
  // Exactly one notification row should exist (dedupe worked).
  const nrows = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`
  ).get(IDS.dan, note.id).n;
  ok(`exactly one notification created despite 2 concurrent retries (got ${nrows})`, nrows === 1);
  // Delivery row is now 'delivered' (terminal).
  const dstat = db.prepare(`SELECT status FROM coaching_note_share_delivery WHERE note_id=?`).get(note.id);
  ok(`delivery ledger flipped to 'delivered' (got '${dstat?.status}')`, dstat?.status === 'delivered');
  // One retry redirect should say "Notification sent"; the OTHER should
  // say "already delivered" (winner) or "in progress" (contended lock).
  // We accept any of those three friendly outcomes — what matters is the
  // notification count above.
  const okFriendly = (loc) =>
    locHas(loc, 'Notification sent') ||
    locHas(loc, 'already delivered') ||
    locHas(loc, 'in progress');
  ok(`r1 has a friendly outcome message (loc=${r1.location})`, okFriendly(r1.location));
  ok(`r2 has a friendly outcome message (loc=${r2.location})`, okFriendly(r2.location));
}
{
  // F2 second claim: deleting the inbox row does NOT re-arm a duplicate
  // first-share.  Consequence: after we deleted notifications for the F2
  // test above, another notify-retry should NOT create a THIRD alert —
  // the delivery ledger is 'delivered' and the retry endpoint sees that
  // and returns "already delivered".
  const note = db.prepare(
    `SELECT id FROM coaching_notes WHERE author_id=? AND teacher_id=? ORDER BY id DESC LIMIT 1`
  ).get(IDS.coachTwo, IDS.dan);
  // Manually delete the inbox row that the winning retry above just wrote.
  const del = db.prepare(`DELETE FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`)
    .run(IDS.dan, note.id);
  ok(`inbox row deleted for the ledger test (deleted ${del.changes})`, del.changes === 1);
  // Now retry — the delivery ledger says 'delivered'.  Endpoint should
  // return "already delivered" WITHOUT re-inserting into notifications.
  const r = await coachTwo.post(`/coach/teachers/${IDS.dan}/notes/${note.id}/notify-retry`, new URLSearchParams({}));
  ok('post-delete retry returns 302', r.status === 302);
  ok('post-delete retry says already delivered (inbox is not the source of truth)',
     locHas(r.location, 'already delivered'), `loc=${r.location}`);
  const nrows = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`
  ).get(IDS.dan, note.id).n;
  ok(`no new inbox row after admin-deleted delivered row (${nrows})`, nrows === 0);
}

// ==========================================================================
suite('Case 20 — F2 notification prefs suppression is truthfully reported (not a "failure")');
{
  // F2 claim: when the recipient's preferences suppress the coach_note kind,
  // deliverShareNotification returns { status:'suppressed' } — NOT a
  // failure.  The delivery ledger records 'suppressed'; the UI shows an
  // informational badge, not the yellow "not delivered" warning.
  //
  // Set Carol to opt out of coach_note.
  db.prepare(`INSERT OR REPLACE INTO notification_preferences
    (user_id, kind, in_app, push, updated_at) VALUES (?, 'coach_note', 0, 0, CURRENT_TIMESTAMP)`)
    .run(IDS.carol);
  const notifBefore = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note'`
  ).get(IDS.carol).n;
  // PureCoach → Carol (PureCoach has Carol as assignee).  Share a fresh note.
  const form = new URLSearchParams({
    _token: 'f2-suppress-' + Date.now(),
    occurred_on: '2026-09-23',
    glow: 'F2 suppressed-notification test entry',
    _action: 'share',
  });
  const r = await pureCoach.post(`/coach/teachers/${IDS.carol}/notes`, form);
  ok('suppressed-recipient share returns 302', r.status === 302);
  ok('suppressed-recipient share redirect mentions preferences/no alert',
     locHas(r.location, 'turned off') || locHas(r.location, 'no alert'),
     `loc=${r.location}`);
  const notifAfter = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note'`
  ).get(IDS.carol).n;
  ok(`preferences-off recipient got ZERO new notifications (${notifBefore} → ${notifAfter})`,
     notifAfter === notifBefore);
  const note = db.prepare(
    `SELECT id FROM coaching_notes WHERE author_id=? AND teacher_id=? ORDER BY id DESC LIMIT 1`
  ).get(IDS.pureCoach, IDS.carol);
  const del = db.prepare(`SELECT status FROM coaching_note_share_delivery WHERE note_id=?`).get(note.id);
  ok(`delivery ledger records 'suppressed' (got '${del?.status}')`, del?.status === 'suppressed');
  // Coach view shows the "recipient opted out" info badge, not the failure warning.
  const view = await pureCoach.get(`/coach/teachers/${IDS.carol}`);
  ok('coach view shows "Recipient opted out" info badge',
     view.text.includes('Recipient opted out of alerts'),
     'suppressed-recipient badge missing');
  ok('coach view does NOT show "Notification not delivered" for suppressed',
     !view.text.includes('Notification not delivered'),
     'suppressed state incorrectly rendered as a failure');
  // A retry on a suppressed note must NOT fire an alert (preference is
  // policy, not failure).
  const retry = await pureCoach.post(`/coach/teachers/${IDS.carol}/notes/${note.id}/notify-retry`, new URLSearchParams({}));
  ok('retry on suppressed note returns 302', retry.status === 302);
  ok('retry on suppressed note explains preference (does not claim to have sent)',
     locHas(retry.location, 'turned off'), `loc=${retry.location}`);
  const notifFinal = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note'`
  ).get(IDS.carol).n;
  ok(`retry on suppressed did not create a notification (${notifAfter} → ${notifFinal})`,
     notifFinal === notifAfter);
  // Cleanup so Case 20's Carol pref doesn't leak into future runs.
  db.prepare(`DELETE FROM notification_preferences WHERE user_id=? AND kind='coach_note'`).run(IDS.carol);
}

// ==========================================================================
suite('Case 21 — F3 reused-token payload change is rejected (does not silently share stale content)');
{
  // F3 claim: the same client_token with a DIFFERENT payload must NOT
  // silently promote the older stored draft.  Server rejects with a
  // "content changed" redirect and directs the user to reopen the entry.
  const token = 'f3-changed-payload-' + Date.now();
  const draftForm = new URLSearchParams({
    _token: token, occurred_on: '2026-09-23',
    evidence: 'ORIGINAL draft content',
    glow: 'original strengths',
    _action: 'draft',
  });
  const r1 = await pureCoach.post(`/coach/teachers/${IDS.alice}/notes`, draftForm);
  ok('first save (draft) returns 302', r1.status === 302);
  // Retry SAME token but DIFFERENT payload.
  const changedForm = new URLSearchParams({
    _token: token, occurred_on: '2026-09-23',
    evidence: 'CHANGED content — should NOT be silently accepted',
    glow: 'changed strengths',
    _action: 'share',
  });
  const r2 = await pureCoach.post(`/coach/teachers/${IDS.alice}/notes`, changedForm);
  ok('retry with different payload returns 302', r2.status === 302);
  ok('retry with different payload is rejected with a friendly "content changed" message',
     locHas(r2.location, 'different content') || locHas(r2.location, 'Reopen'),
     `loc=${r2.location}`);
  // The stored row must still be a draft with the ORIGINAL content.
  const stored = db.prepare(
    `SELECT status, evidence FROM coaching_notes WHERE author_id=? AND client_token=?`
  ).get(IDS.pureCoach, token);
  ok(`stored row is still a draft (got status='${stored?.status}')`, stored?.status === 'draft');
  ok(`stored evidence is ORIGINAL not CHANGED (got "${stored?.evidence?.slice(0,20)}...")`,
     stored?.evidence?.includes('ORIGINAL'), 'stale content was silently overwritten');
}
{
  // F3 second claim: teacher_id mismatch on reused token → 409.
  const token = 'f3-teacher-mismatch-' + Date.now();
  const draftForm = new URLSearchParams({
    _token: token, occurred_on: '2026-09-23',
    evidence: 'draft for Alice', glow: 'glow', _action: 'draft',
  });
  await pureCoach.post(`/coach/teachers/${IDS.alice}/notes`, draftForm);
  // Reuse the token but POST to a DIFFERENT teacher.
  const bobForm = new URLSearchParams({
    _token: token, occurred_on: '2026-09-23',
    evidence: 'draft for Alice', glow: 'glow', _action: 'draft',
  });
  const r = await pureCoach.post(`/coach/teachers/${IDS.bob}/notes`, bobForm);
  ok('reused token on different teacher → 409 (not 302, not 500)',
     r.status === 409, `HTTP ${r.status}`);
}

// ==========================================================================
suite('Case 24 — R1: same-second same-token race with conflicting content is handled correctly');
{
  // R1 (Sept 23 second follow-up) reproduces the ChatGPT-flagged bug:
  // second-precision timestamps let two same-second requests with the same
  // token BOTH satisfy the audit gate, even when only one INSERT actually
  // wrote a row.  The fix: audit-INSERT SELECT-in-INSERT filters on the
  // per-request UUID `writer_nonce`, so exactly one request's audits land.
  //
  // (A) DIRECT-SEED SCENARIO — deterministic hit on the retry branch:
  //     Seed a note row directly at (author, token) as if request A already
  //     committed.  Then POST from "request B" with the same token but a
  //     DIFFERENT payload and DIFFERENT teacher_id.  Handler must:
  //       * detect teacher_id mismatch → HTTP 409
  //       * (rerun with same teacher, different payload) → "content changed"
  //         friendly redirect; ORIGINAL stored content preserved
  //       * (rerun with same teacher, same payload, share intent) → promote
  //         atomically OR (if already shared) report already-shared
  const token = 'r1-samesecond-' + Date.now();
  // Simulate the winning request A — a blank draft for Alice.
  const nowSql = new Date().toISOString().replace('T',' ').slice(0,19);
  const seededId = db.prepare(`INSERT INTO coaching_notes
    (author_id, teacher_id, occurred_on, class_context, evidence, glow, grow, next_step, follow_up_on,
     status, first_shared_at, client_token, payload_digest, writer_nonce, version, created_at, updated_at)
    VALUES (?, ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, 'draft', NULL, ?, ?, ?, 1, ?, ?)`)
    .run(IDS.coachOne, IDS.alice, '2026-09-23', token,
         // Digest of a blank-values tuple for Alice on 2026-09-23.  Doesn't
         // matter that it's specific — the payload-mismatch check just needs
         // it to DIFFER from request B's digest, which will be non-blank.
         'seeded-a-blank-draft-digest',
         'seeded-a-writer-nonce',
         nowSql, nowSql).lastInsertRowid;
  const seededNoteId = Number(seededId);
  const auditsBefore = db.prepare(`SELECT COUNT(*) AS n FROM coaching_note_audit WHERE note_id=?`).get(seededNoteId).n;
  const notifsBeforeAlice = db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note'`).get(IDS.alice).n;

  // Sub-case (a.i): different TEACHER on the reused token → HTTP 409.
  {
    const rTeacherMismatch = await coachOne.post(`/coach/teachers/${IDS.bob}/notes`, new URLSearchParams({
      _token: token, occurred_on: '2026-09-23',
      evidence: 'B different content targeting Bob',
      _action: 'share',
    }));
    ok('(a.i) reused token to a DIFFERENT teacher → HTTP 409 (not 302, not 500)',
       rTeacherMismatch.status === 409, `HTTP ${rTeacherMismatch.status}`);
  }

  // Sub-case (a.ii): SAME teacher, DIFFERENT payload, share intent → rejected
  // with a friendly "content changed" redirect; stored content unchanged.
  {
    const rContentChange = await coachOne.post(`/coach/teachers/${IDS.alice}/notes`, new URLSearchParams({
      _token: token, occurred_on: '2026-09-23',
      evidence: 'B different content — MUST NOT be silently shared',
      glow: 'B injected strength',
      _action: 'share',
    }));
    ok('(a.ii) reused token with DIFFERENT payload → 302 to "content changed" message',
       rContentChange.status === 302, `HTTP ${rContentChange.status}`);
    ok('(a.ii) redirect body mentions "different content" / "Reopen"',
       locHas(rContentChange.location, 'different content') || locHas(rContentChange.location, 'Reopen'),
       `loc=${rContentChange.location}`);
    // Stored row still a blank draft (no share, no evidence change, no audit rows added).
    const stillDraft = db.prepare(`SELECT status, evidence, glow FROM coaching_notes WHERE id=?`).get(seededNoteId);
    ok('(a.ii) stored row is STILL a draft', stillDraft.status === 'draft');
    ok('(a.ii) stored row was NOT overwritten with B\'s content',
       !stillDraft.evidence && !stillDraft.glow,
       `evidence=${JSON.stringify(stillDraft.evidence)} glow=${JSON.stringify(stillDraft.glow)}`);
    const auditsAfter1 = db.prepare(`SELECT COUNT(*) AS n FROM coaching_note_audit WHERE note_id=?`).get(seededNoteId).n;
    ok(`(a.ii) NO audit rows added for the rejected retry (${auditsBefore} → ${auditsAfter1})`,
       auditsAfter1 === auditsBefore);
    const notifsAfter1 = db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note'`).get(IDS.alice).n;
    ok(`(a.ii) NO notification fired for the rejected retry (${notifsBeforeAlice} → ${notifsAfter1})`,
       notifsAfter1 === notifsBeforeAlice);
  }

  // (B) CONCURRENT-BATCH SCENARIO — two requests with same token + different
  // content fired via Promise.all.  We can't force the specific race window
  // deterministically from userspace, but the INVARIANT is the same either
  // way: at most one create-audit row per note; at most one notification;
  // no fresh note has both authors' content mixed in; both responses are
  // truthful about what they saved.
  const token2 = 'r1-race-' + Date.now();
  const notifsBeforeCarol = db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note'`).get(IDS.carol).n;
  // Request A: strength-only draft-save
  const formA = new URLSearchParams({
    _token: token2, occurred_on: '2026-09-23',
    glow: 'race-A strength content',
    _action: 'draft',
  });
  // Request B: different content, share intent
  const formB = new URLSearchParams({
    _token: token2, occurred_on: '2026-09-23',
    evidence: 'race-B different evidence',
    glow: 'race-B different strength',
    _action: 'share',
  });
  const [rA, rB] = await Promise.all([
    pureCoach.post(`/coach/teachers/${IDS.carol}/notes`, formA),
    pureCoach.post(`/coach/teachers/${IDS.carol}/notes`, formB),
  ]);
  ok('(b) both concurrent requests responded (2xx or 3xx)',
     (rA.status >= 200 && rA.status < 400) && (rB.status >= 200 && rB.status < 400),
     `rA=${rA.status} rB=${rB.status}`);
  // Regardless of who wrote first, there must be exactly ONE row for this
  // (author, token) pair.
  const rowsForToken = db.prepare(
    `SELECT id, status, evidence, glow, payload_digest FROM coaching_notes WHERE author_id=? AND client_token=?`
  ).all(IDS.pureCoach, token2);
  ok(`(b) exactly ONE row per (author, token) after the race (got ${rowsForToken.length})`,
     rowsForToken.length === 1);
  const raceNote = rowsForToken[0];
  // Its content must match ONE of the two request payloads — never a
  // mixture and never the loser's payload merged with the winner's status.
  const looksLikeA = raceNote.glow === 'race-A strength content' && !raceNote.evidence;
  const looksLikeB = raceNote.glow === 'race-B different strength' && raceNote.evidence === 'race-B different evidence';
  ok('(b) stored content matches exactly ONE of the two requests (A or B, never mixed)',
     looksLikeA || looksLikeB,
     `got glow="${raceNote.glow}" evidence=${JSON.stringify(raceNote.evidence)}`);
  // Exactly ONE 'create' audit row per token.
  const createAudits = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_note_audit WHERE note_id=? AND action='create'`
  ).get(raceNote.id).n;
  ok(`(b) exactly ONE 'create' audit row after the race (got ${createAudits})`, createAudits === 1);
  const shareAudits = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_note_audit WHERE note_id=? AND action='share'`
  ).get(raceNote.id).n;
  const notifsAfterCarol = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`
  ).get(IDS.carol, raceNote.id).n;

  // T3 (Sept 23 third follow-up) — tighten the race invariants.  Instead
  // of the loose "at most ONE" claim, split on the winner's intent:
  //   * If the winning request was request A (draft), the note is a
  //     DRAFT and there must be EXACTLY 0 share-audit rows and EXACTLY
  //     0 notifications.  Request B's INSERT lost to ON CONFLICT and
  //     hit R1b's post-conflict revalidation, which refuses to enter
  //     the notify path when the stored row is a draft (status
  //     mismatch redirect).
  //   * If the winning request was request B (share), the note is
  //     SHARED and there must be EXACTLY 1 share-audit row and EXACTLY
  //     1 notification.  Request A's INSERT lost; A's response cannot
  //     falsely claim "Shared".
  const saysShared = (loc) => locHas(loc, 'Shared with teacher');
  if (looksLikeA) {
    // A won → stored is a draft.
    ok(`(b/T3) A-won: stored is draft (got status='${raceNote.status}')`,
       raceNote.status === 'draft');
    ok(`(b/T3) A-won: EXACTLY 0 'share' audit rows (got ${shareAudits})`, shareAudits === 0);
    ok(`(b/T3) A-won: EXACTLY 0 notifications (got ${notifsAfterCarol})`, notifsAfterCarol === 0);
    ok('(b/T3) A-won: NEITHER response says "Shared with teacher"',
       !saysShared(rA.location) && !saysShared(rB.location),
       `rA.loc=${rA.location} rB.loc=${rB.location}`);
  } else if (looksLikeB) {
    // B won → stored is shared.
    ok(`(b/T3) B-won: stored is shared (got status='${raceNote.status}')`,
       raceNote.status === 'shared');
    ok(`(b/T3) B-won: EXACTLY 1 'share' audit row (got ${shareAudits})`, shareAudits === 1);
    ok(`(b/T3) B-won: EXACTLY 1 notification (got ${notifsAfterCarol})`, notifsAfterCarol === 1);
    // Exactly ONE of the two responses should have announced the share.
    // We don't know which because the race outcome depends on scheduling,
    // but at least one MUST have (the winner) and at most one CAN have
    // (the loser goes through R1b's revalidation and never enters notify).
    const nSaidShared = (saysShared(rA.location) ? 1 : 0) + (saysShared(rB.location) ? 1 : 0);
    ok(`(b/T3) B-won: exactly ONE response announced the share (got ${nSaidShared})`,
       nSaidShared === 1,
       `rA.loc=${rA.location} rB.loc=${rB.location}`);
  }
}

// ==========================================================================
suite('Case 25 — R2: notify() throw during initial share leaves note+audit intact, retry delivers exactly once');
{
  // R2 (Sept 23 second follow-up) — the tricky failure path is:
  //   notify() successfully writes the notifications row → then the ledger
  //   UPDATE throws → old code marked ledger 'failed' → retry called
  //   notify() again → DUPLICATE inbox row.
  //
  // This case tests the OTHER failure path from that pair, which is easier
  // to force from userspace: notify() itself throws.  The claim: the note
  // and its audit rows are still committed (because they're in a different
  // batch, R1 atomicity intact), the ledger records 'failed' correctly,
  // and a subsequent retry delivers exactly ONE notification.
  //
  // We force notify() to throw by installing a BEFORE INSERT trigger on the
  // notifications table that RAISEs when the target user_id is our test
  // recipient (dan, IDS.dan).  This is a REAL exception from inside notify(),
  // not a seeded ledger state — the exception handler in the code is
  // actually exercised.
  db.exec(`DROP TRIGGER IF EXISTS test_r2_notify_poison`);
  db.exec(`
    CREATE TRIGGER test_r2_notify_poison BEFORE INSERT ON notifications
      WHEN NEW.user_id = ${IDS.dan} AND NEW.kind = 'coach_note'
      BEGIN
        SELECT RAISE(ABORT, 'R2 test: notify() forced throw');
      END;
  `);
  const notesBefore = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_notes WHERE author_id=? AND teacher_id=?`
  ).get(IDS.coachTwo, IDS.dan).n;
  const form = new URLSearchParams({
    _token: 'r2-throw-' + Date.now(),
    occurred_on: '2026-09-23',
    glow: 'R2 forced-throw share test',
    _action: 'share',
  });
  const r = await coachTwo.post(`/coach/teachers/${IDS.dan}/notes`, form);
  ok('(2b) share POST still returns 302 despite notify() throwing', r.status === 302,
     `HTTP ${r.status}`);
  // The note + audit ARE committed (the atomic batch for the note write
  // was independent of notify()).
  const notesAfter = db.prepare(
    `SELECT id, status FROM coaching_notes WHERE author_id=? AND teacher_id=? ORDER BY id DESC`
  ).all(IDS.coachTwo, IDS.dan);
  ok(`(2b) note row IS committed despite notify() throw (${notesBefore} → ${notesAfter.length})`,
     notesAfter.length === notesBefore + 1);
  const newNote = notesAfter[0];
  ok(`(2b) note is status='shared'`, newNote.status === 'shared');
  const audits = db.prepare(`SELECT action FROM coaching_note_audit WHERE note_id=? ORDER BY id`).all(newNote.id).map(r=>r.action);
  ok(`(2b) audit trail has create + share (got [${audits.join(',')}])`,
     audits.includes('create') && audits.includes('share'));
  // Redirect message tells the truth: saved AND shared, notification did NOT deliver.
  ok('(2b) redirect message truthfully says "Notification did NOT deliver"',
     locHas(r.location, 'did NOT deliver') || locHas(r.location, 'Notification') && locHas(r.location, 'not deliver'),
     `loc=${r.location}`);
  // The delivery ledger records 'failed'.
  const dstat = db.prepare(`SELECT status, detail FROM coaching_note_share_delivery WHERE note_id=?`).get(newNote.id);
  ok(`(2b) delivery ledger records 'failed' (got '${dstat?.status}')`, dstat?.status === 'failed');
  ok('(2b) delivery ledger detail explains the throw',
     typeof dstat?.detail === 'string' && dstat.detail.includes('R2 test'),
     `detail=${JSON.stringify(dstat?.detail)}`);
  const notifsFail = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`
  ).get(IDS.dan, newNote.id).n;
  ok(`(2b) ZERO notification rows exist for this note (${notifsFail})`, notifsFail === 0);
  // Now DROP the poison trigger and retry — notify() will succeed.
  db.exec(`DROP TRIGGER IF EXISTS test_r2_notify_poison`);
  const retry = await coachTwo.post(`/coach/teachers/${IDS.dan}/notes/${newNote.id}/notify-retry`, new URLSearchParams({}));
  ok('(2b) notify-retry after poison removed → 302', retry.status === 302);
  ok('(2b) notify-retry says "Notification sent"',
     locHas(retry.location, 'Notification sent'), `loc=${retry.location}`);
  const notifsRetry = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`
  ).get(IDS.dan, newNote.id).n;
  ok(`(2b) exactly ONE notification exists after retry (${notifsRetry})`, notifsRetry === 1);
  const dstat2 = db.prepare(`SELECT status FROM coaching_note_share_delivery WHERE note_id=?`).get(newNote.id);
  ok(`(2b) ledger now 'delivered' after successful retry (got '${dstat2?.status}')`, dstat2?.status === 'delivered');
}

// ==========================================================================
suite('Case 26 — T2 (R2 corrected): real ledger UPDATE failure after notify() success');
{
  // T2 (Sept 23 third follow-up).  Previous Case 26 seeded ledger='failed'
  // after a successful share and asked whether a subsequent retry would
  // duplicate.  That missed the point of the R2 correction: the buggy code
  // put notify() and the ledger UPDATE in one try/catch, so the ledger
  // never even reached 'failed' after a notify-success/ledger-throw — it
  // stayed at 'attempting' because the catch, on the fix path, ONLY marks
  // failed when notify() itself threw.
  //
  // This rewrite forces the ACTUAL failure via a BEFORE UPDATE trigger
  // that raises when the ledger transitions to 'delivered'.  Verifies the
  // four claims in the review:
  //
  //   1. Sharing still saves the note and audit and creates exactly one
  //      notification (the atomic note+audit batch is independent of the
  //      ledger UPDATE; notify() succeeds before the failing UPDATE runs).
  //   2. The failed ledger write does NOT report the saved note as
  //      failed — the response message is truthful about the delivery,
  //      and the coach page's effective delivery status is 'delivered'
  //      (reconciled from the notifications inbox by the coach GET).
  //   3. After removing the trigger, normal coach-screen interaction
  //      repairs the status — either the notify-retry endpoint OR the
  //      next GET of the coach page (which now runs the reconciliation).
  //   4. Repeating recovery creates no additional notification.
  db.exec(`DROP TRIGGER IF EXISTS test_t2_ledger_poison`);
  db.exec(`
    CREATE TRIGGER test_t2_ledger_poison BEFORE UPDATE ON coaching_note_share_delivery
      WHEN NEW.status = 'delivered' AND OLD.status = 'attempting'
      BEGIN
        SELECT RAISE(ABORT, 'T2 test: ledger UPDATE to delivered forced to throw');
      END;
  `);

  // Setup — a fresh share targeting Carol (pureCoach's coachee, unused by
  // Cases 19/20/25/26-old so we don't collide with their state).  Case 20
  // set carol's coach_note pref off; ensure it's ON so notify() actually
  // writes an inbox row.
  db.prepare(`DELETE FROM notification_preferences WHERE user_id=? AND kind='coach_note'`).run(IDS.carol);
  const notesBefore = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_notes WHERE author_id=? AND teacher_id=?`
  ).get(IDS.pureCoach, IDS.carol).n;
  const notifsBefore = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note'`
  ).get(IDS.carol).n;
  const form = new URLSearchParams({
    _token: 't2-ledger-throw-' + Date.now(),
    occurred_on: '2026-09-23',
    glow: 'T2 real-ledger-fail scenario',
    _action: 'share',
  });
  const r = await pureCoach.post(`/coach/teachers/${IDS.carol}/notes`, form);
  // Claim 1a: share POST still returns a successful redirect.
  ok('(T2.1) share POST returns 302 despite ledger UPDATE trigger failing', r.status === 302,
     `HTTP ${r.status}`);
  // Claim 1b: note + audit saved.
  const notesAfter = db.prepare(
    `SELECT id, status FROM coaching_notes WHERE author_id=? AND teacher_id=? ORDER BY id DESC`
  ).all(IDS.pureCoach, IDS.carol);
  ok(`(T2.1) note row IS saved (${notesBefore} → ${notesAfter.length})`,
     notesAfter.length === notesBefore + 1);
  const newNote = notesAfter[0];
  ok(`(T2.1) note status='shared'`, newNote.status === 'shared');
  const audits = db.prepare(
    `SELECT action FROM coaching_note_audit WHERE note_id=? ORDER BY id`
  ).all(newNote.id).map(r => r.action);
  ok(`(T2.1) audit trail has [create, share] (got [${audits.join(',')}])`,
     audits.includes('create') && audits.includes('share'));
  // Claim 1c: exactly one notification row (notify() succeeded before the
  // ledger UPDATE that we forced to fail).
  const notifsAfter = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`
  ).get(IDS.carol, newNote.id).n;
  ok(`(T2.1) exactly ONE notification created (${notifsBefore} → ${notifsBefore + notifsAfter}; per-note count = ${notifsAfter})`,
     notifsAfter === 1);
  // The ledger did NOT reach 'delivered' — the trigger blocked it.  The
  // helper's error-swallow policy (tryLedgerUpdate) means status stays
  // whatever it was BEFORE the failed UPDATE, i.e. 'attempting'.  This is
  // the exact state that motivated the T1 reconciliation gap.
  const dstat0 = db.prepare(`SELECT status FROM coaching_note_share_delivery WHERE note_id=?`).get(newNote.id);
  ok(`(T2.1) ledger stays at 'attempting' because the UPDATE to 'delivered' was blocked (got '${dstat0?.status}')`,
     dstat0?.status === 'attempting');

  // Claim 2: the response message does NOT falsely report the save as
  // failed.  It must reflect the actual delivery (successful) or at
  // minimum not claim a failure that didn't happen.  The helper returns
  // { status:'delivered', notifId } because notify() succeeded even
  // though the ledger UPDATE was blocked; the redirect message therefore
  // says "Shared with teacher.", not "Notification did NOT deliver".
  ok('(T2.2) response does NOT wrongly say "did NOT deliver"',
     !locHas(r.location, 'did NOT deliver'),
     `loc=${r.location}`);
  ok('(T2.2) response truthfully says "Shared with teacher"',
     locHas(r.location, 'Shared with teacher'), `loc=${r.location}`);

  // Claim 3a: coach GET reconciles the effective status to 'delivered'
  // even though the ledger says 'attempting', because the notifications
  // row exists.  The rendered page must NOT show "Delivery in progress"
  // (misleading and stuck) or "Notification not delivered" for this note.
  const viewWithTrigger = await pureCoach.get(`/coach/teachers/${IDS.carol}`);
  // Scope to THIS note's <li> via its unique glow text.
  const liTextRe = /class="[^"]*"[^>]*>[\s\S]*?T2 real-ledger-fail scenario[\s\S]*?<\/li>/;
  const liMatch = viewWithTrigger.text.match(liTextRe);
  ok('(T2.3) coach page contains our T2 test entry LI', !!liMatch);
  const liText = liMatch ? liMatch[0] : '';
  ok('(T2.3) coach view does NOT show "Delivery in progress" for this entry',
     !liText.includes('Delivery in progress'),
     'stuck-attempting badge leaked into the entry');
  ok('(T2.3) coach view does NOT show "Notification not delivered" for this entry',
     !liText.includes('Notification not delivered'),
     'false failure warning leaked into the entry');

  // Claim 3b: remove the trigger and interact normally.  Hitting notify-
  // retry from the coach's screen is one valid recovery path — it uses
  // the same protected endpoint the UI would use.  The preflight sees
  // the inbox row and marks the ledger 'delivered' without calling
  // notify() again.
  db.exec(`DROP TRIGGER IF EXISTS test_t2_ledger_poison`);
  const retry = await pureCoach.post(`/coach/teachers/${IDS.carol}/notes/${newNote.id}/notify-retry`, new URLSearchParams({}));
  ok('(T2.3) notify-retry after trigger removed → 302', retry.status === 302);
  ok('(T2.3) notify-retry says "already delivered" (preflight caught the existing notification)',
     locHas(retry.location, 'already delivered'), `loc=${retry.location}`);
  const dstat1 = db.prepare(`SELECT status FROM coaching_note_share_delivery WHERE note_id=?`).get(newNote.id);
  ok(`(T2.3) ledger repaired to 'delivered' (got '${dstat1?.status}')`, dstat1?.status === 'delivered');

  // Claim 4: repeating the recovery does not create a duplicate.
  const retry2 = await pureCoach.post(`/coach/teachers/${IDS.carol}/notes/${newNote.id}/notify-retry`, new URLSearchParams({}));
  ok('(T2.4) second retry → 302', retry2.status === 302);
  ok('(T2.4) second retry still says "already delivered"',
     locHas(retry2.location, 'already delivered'), `loc=${retry2.location}`);
  const notifsFinal = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`
  ).get(IDS.carol, newNote.id).n;
  ok(`(T2.4) repeated recovery created ZERO additional notifications (still ${notifsFinal} = 1)`,
     notifsFinal === 1);
}
{
  // T2 bonus — the alternate recovery path: coach GET reconciliation is
  // enough on its own even without hitting the notify-retry endpoint.
  // Force the same "notify succeeded, ledger stuck at 'attempting'" state
  // (no trigger needed this time — just seed it), THEN check that:
  //   (a) coach GET shows the entry as delivered (no misleading badge)
  //   (b) no duplicate notification exists
  //   (c) hitting notify-retry once still succeeds as an idempotent no-op
  // This proves the correction meets the "must accurately show the
  // completed delivery" clause even without any user action.
  const form = new URLSearchParams({
    _token: 't2-gettime-recovery-' + Date.now(),
    occurred_on: '2026-09-23',
    glow: 'T2 GET-reconciles-without-click test',
    _action: 'share',
  });
  await pureCoach.post(`/coach/teachers/${IDS.carol}/notes`, form);
  const note = db.prepare(
    `SELECT id FROM coaching_notes WHERE author_id=? AND teacher_id=? ORDER BY id DESC LIMIT 1`
  ).get(IDS.pureCoach, IDS.carol);
  // Set ledger back to 'attempting' with no notif_id to simulate the
  // observable end-state of the failure path.
  db.prepare(
    `UPDATE coaching_note_share_delivery SET status='attempting', notif_id=NULL WHERE note_id=?`
  ).run(note.id);
  const viewRes = await pureCoach.get(`/coach/teachers/${IDS.carol}`);
  const liRe = /<li[^>]*>[\s\S]*?T2 GET-reconciles-without-click test[\s\S]*?<\/li>/;
  const li = (viewRes.text.match(liRe) || [''])[0];
  ok('(T2 bonus) coach GET renders the entry',
     li.includes('T2 GET-reconciles-without-click test'));
  ok('(T2 bonus) reconciled GET does NOT show "Delivery in progress"',
     !li.includes('Delivery in progress'),
     'delivery status was not reconciled from the notifications inbox');
  ok('(T2 bonus) reconciled GET does NOT show "Notification not delivered"',
     !li.includes('Notification not delivered'),
     'delivery status was falsely reported as failed');
  // Notification count is still 1.
  const nrows = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`
  ).get(IDS.carol, note.id).n;
  ok(`(T2 bonus) still exactly one notification (${nrows})`, nrows === 1);
}

// ==========================================================================
suite('Case 22 — F5c: principal publish + teacher acknowledge round-trip works and fires the expected notifications');
{
  // F5c gap closure: exercise the REAL publish + acknowledge endpoints,
  // not a DB-only setup.  We publish a fresh observation for Dan (id=13)
  // authored by Principal (id=2), confirm Dan gets the observation_published
  // notification, then Dan acknowledges via POST + signature, and we
  // confirm Principal gets the observation_acknowledged notification and
  // the observation flips to 'acknowledged' with a signed timestamp.
  const principal = await new Client('principal@test','Principal').login();
  const dan = await new Client('dan@test','Dan').login();
  // Seed a fresh draft observation for Dan.  (Bypassing the appraiser draft
  // UI because that's not what we're testing — the publish + acknowledge
  // POSTs are.)
  const fwId = db.prepare(`SELECT id FROM frameworks WHERE is_active=1 LIMIT 1`).get()?.id || 1;
  const nowSql = new Date().toISOString().replace('T',' ').slice(0,19);
  const insId = db.prepare(`INSERT INTO observations
    (teacher_id, appraiser_id, school_year_id, framework_id, observation_type,
     class_context, subject, grade_level, observed_at, status, scripted_notes,
     overall_summary, created_at, updated_at)
    VALUES (?, 2, 1, ?, 'formal', 'F5c publish/ack test', 'Math', '8', ?, 'draft',
      'notes', 'summary', ?, ?)`).run(IDS.dan, fwId, nowSql, nowSql, nowSql).lastInsertRowid;
  const obsId = Number(insId);
  // A trivial 1-pixel signature keeps the guard happy without depending
  // on any real canvas library.
  const sig = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
  const notifBefore = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='observation_published' AND entity_id=?`
  ).get(IDS.dan, obsId).n;
  const pub = await principal.post(`/appraiser/observations/${obsId}/publish`, new URLSearchParams({ signature: sig }));
  ok('principal publish returns 302', pub.status === 302, `HTTP ${pub.status}`);
  const row1 = db.prepare(`SELECT status, published_at FROM observations WHERE id=?`).get(obsId);
  ok('observation flipped to published',
     row1.status === 'published' && !!row1.published_at, `status=${row1.status}`);
  const notifAfter = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='observation_published' AND entity_id=?`
  ).get(IDS.dan, obsId).n;
  ok(`teacher notified of publish (${notifBefore} → ${notifAfter})`, notifAfter === notifBefore + 1);
  // Now Dan acknowledges.
  const ackNotifBefore = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='observation_acknowledged' AND entity_id=?`
  ).get(IDS.principal, obsId).n;
  const ack = await dan.post(`/teacher/observations/${obsId}/acknowledge`,
    new URLSearchParams({ signature: sig, response: 'F5c ack response' }));
  ok('teacher acknowledge returns 302', ack.status === 302, `HTTP ${ack.status}`);
  const row2 = db.prepare(
    `SELECT status, teacher_acknowledged_at, teacher_signature_data IS NOT NULL AS has_sig
       FROM observations WHERE id=?`
  ).get(obsId);
  ok('observation flipped to acknowledged with a signature',
     row2.status === 'acknowledged' && !!row2.teacher_acknowledged_at && row2.has_sig === 1,
     `status=${row2.status} ack=${row2.teacher_acknowledged_at} sig=${row2.has_sig}`);
  const ackNotifAfter = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='observation_acknowledged' AND entity_id=?`
  ).get(IDS.principal, obsId).n;
  ok(`principal notified of acknowledge (${ackNotifBefore} → ${ackNotifAfter})`,
     ackNotifAfter === ackNotifBefore + 1);
}

// ==========================================================================
suite('Case 23 — F5c: PD review-revise-verify-credit round-trip works and credits hours');
{
  // F5c gap closure: real POSTs against /pd/review/:id/verify with both
  // action=revise and action=verify + credit_hours.  Uses Bob's PD 200
  // (already submitted by Case 6).
  const principal = await new Client('principal@test','Principal').login();
  // Case 6 left enrollment 200 in status='submitted' (Bob just submitted).
  const s0 = db.prepare(`SELECT status, hours_credited FROM pd_enrollments WHERE id=200`).get();
  ok(`pre-revise status is 'submitted' (got '${s0.status}')`, s0.status === 'submitted');
  // Principal requests a revision.
  const notifBefore = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='pd_deliverable_revision' AND entity_id=?`
  ).get(IDS.bob, 200).n;
  const rev = await principal.post(`/pd/review/200/verify`, new URLSearchParams({
    action: 'revise', note: 'F5c: please expand on section 2 and resubmit.',
  }));
  ok('review revise returns 302', rev.status === 302, `HTTP ${rev.status}`);
  const s1 = db.prepare(`SELECT status FROM pd_enrollments WHERE id=200`).get();
  ok(`enrollment flipped to revision state after review request (got '${s1.status}')`,
     s1.status === 'revision' || s1.status === 'needs_revision' || s1.status === 'revision_requested' || s1.status === 'started',
     `got status='${s1.status}'`);
  const notifAfter = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='pd_deliverable_revision' AND entity_id=?`
  ).get(IDS.bob, 200).n;
  ok(`teacher notified of revision request (${notifBefore} → ${notifAfter})`,
     notifAfter === notifBefore + 1);
  // Teacher resubmits.
  const resub = await bob.post(`/teacher/pd/200/submit`, new URLSearchParams({
    title: 'F5c resubmission', body: 'F5c revised body content',
  }));
  ok('teacher resubmit returns 302', resub.status === 302);
  const s2 = db.prepare(`SELECT status FROM pd_enrollments WHERE id=200`).get();
  ok(`enrollment back to 'submitted' after resubmit (got '${s2.status}')`, s2.status === 'submitted');
  // Principal verifies WITH credit hours.
  const hoursBefore = Number(db.prepare(`SELECT hours_credited FROM pd_enrollments WHERE id=200`).get().hours_credited || 0);
  const verifNotifBefore = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='pd_deliverable_verified' AND entity_id=?`
  ).get(IDS.bob, 200).n;
  const ver = await principal.post(`/pd/review/200/verify`, new URLSearchParams({
    action: 'verify', credit_hours: '2.5', note: 'F5c approved',
  }));
  ok('review verify returns 302', ver.status === 302);
  const s3 = db.prepare(`SELECT status, hours_credited FROM pd_enrollments WHERE id=200`).get();
  ok(`enrollment flipped to verified (got '${s3.status}')`, s3.status === 'verified' || s3.status === 'completed',
     `got status='${s3.status}'`);
  ok(`credited hours moved from ${hoursBefore} → ${s3.hours_credited} (expected 2.5)`,
     Number(s3.hours_credited) === 2.5);
  const verifNotifAfter = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='pd_deliverable_verified' AND entity_id=?`
  ).get(IDS.bob, 200).n;
  ok(`teacher notified of verification (${verifNotifBefore} → ${verifNotifAfter})`,
     verifNotifAfter === verifNotifBefore + 1);
}

// ==========================================================================
suite('Case 29 — teacher-coach guided tour merges teacher + coach steps (Miranda/Tristae case)');
{
  // Sept 24, 2026 — a role='teacher' user with can_coach=1 (in prod:
  // Tristae Allard, Miranda Quale) has BOTH a teacher workspace and a
  // coaching workspace.  The tour used to return teacherSteps only,
  // silently dropping the entire coaching walkthrough.  This case
  // verifies:
  //   * pure teacher (Alice, can_coach=0) still gets teacher-only tour
  //   * pure coach (PureCoach, role='coach') still gets coach-only tour
  //   * teacher-coach (CoachOne, role='teacher' AND can_coach=1) gets
  //     the MERGED tour containing both role's key selectors, exactly
  //     one "You're all set" outro, and the combined role label.
  //
  // The tour payload is inlined as window.__APS_TOUR__=<JSON>; on every
  // authenticated page.  We parse it out of the HTML to inspect steps.
  //
  // Case 17 above triggers a soft-fallback delete of Alice which kills
  // her sessions before restoring active=1.  Log her (and everyone else
  // this case exercises) back in with FRESH clients so a stale cookie
  // doesn't 302 us to /login and blank out the tour payload.
  const aliceTour     = await new Client('alice@test',     'AliceTour').login();
  const pureCoachTour = await new Client('pure.coach@test','PureCoachTour').login();
  const coachOneTour  = await new Client('coach1@test',    'CoachOneTour').login();

  // Extract the payload JSON from an HTML page's __APS_TOUR__ inline
  // script.  Returns null if the marker isn't present.
  function extractTourPayload(html) {
    const m = html.match(/window\.__APS_TOUR__=(\{[\s\S]*?\});/);
    if (!m) return null;
    // The layout escapes '<' to '\u003c' inside the JSON so the closing
    // </script> can't leak.  JSON.parse handles the \u003c form directly.
    try { return JSON.parse(m[1]); } catch { return null; }
  }

  // Reference selectors from tour.ts that anchor teacher- and coach-side
  // steps.  If either regresses (e.g. a merge accidentally drops one
  // side), these lookups fail.
  const TEACHER_ANCHORS = ['t-summary', 't-obs-list', 't-focus', 't-pd-home', 't-coaching-feedback'];
  const COACH_ANCHORS   = ['co-teachers', 'co-notes'];

  // -- Pure teacher (Alice, can_coach=0) --
  {
    const r = await aliceTour.get('/teacher');
    ok('Alice /teacher 200', r.status === 200, `HTTP ${r.status}`);
    const p = extractTourPayload(r.text);
    ok('Alice: tour payload present', !!p, 'no __APS_TOUR__ marker');
    ok('Alice: role label = "Teacher" (not the teacher-coach label)',
       !!p && p.roleLabel === 'Teacher', `got '${p?.roleLabel}'`);
    const selectors = ((p && p.steps) || []).map(s => (s.selector || '').replace(/^\[data-tour="/, '').replace(/"\]$/, ''));
    for (const anchor of TEACHER_ANCHORS) {
      ok(`Alice: teacher tour has ${anchor}`, selectors.includes(anchor),
         `selectors=${JSON.stringify(selectors)}`);
    }
    for (const anchor of COACH_ANCHORS) {
      ok(`Alice: teacher tour does NOT contain coach anchor ${anchor}`, !selectors.includes(anchor));
    }
    // Exactly one terminal step titled "You're all set".
    const outroCount = ((p && p.steps) || []).filter(s => s.title === "You're all set").length;
    ok(`Alice: exactly one "You're all set" outro (got ${outroCount})`, outroCount === 1);
  }

  // -- Pure coach (PureCoach, role='coach') --
  {
    const r = await pureCoachTour.get('/coach');
    ok('PureCoach /coach 200', r.status === 200, `HTTP ${r.status}`);
    const p = extractTourPayload(r.text);
    ok('PureCoach: tour payload present', !!p, 'no __APS_TOUR__ marker');
    ok('PureCoach: role label = "Instructional Coach"',
       !!p && p.roleLabel === 'Instructional Coach', `got '${p?.roleLabel}'`);
    const selectors = ((p && p.steps) || []).map(s => (s.selector || '').replace(/^\[data-tour="/, '').replace(/"\]$/, ''));
    for (const anchor of COACH_ANCHORS) {
      ok(`PureCoach: coach tour has ${anchor}`, selectors.includes(anchor),
         `selectors=${JSON.stringify(selectors)}`);
    }
    for (const anchor of TEACHER_ANCHORS) {
      ok(`PureCoach: coach tour does NOT contain teacher anchor ${anchor}`, !selectors.includes(anchor));
    }
    const outroCount = ((p && p.steps) || []).filter(s => s.title === "You're all set").length;
    ok(`PureCoach: exactly one "You're all set" outro (got ${outroCount})`, outroCount === 1);
  }

  // -- Teacher-coach (CoachOne, role='teacher' AND can_coach=1) --
  {
    const r = await coachOneTour.get('/teacher');
    ok('CoachOne /teacher 200', r.status === 200, `HTTP ${r.status}`);
    const p = extractTourPayload(r.text);
    ok('CoachOne: tour payload present', !!p, 'no __APS_TOUR__ marker');
    ok('CoachOne: role label = "Teacher & Instructional Coach"',
       !!p && p.roleLabel === 'Teacher & Instructional Coach', `got '${p?.roleLabel}'`);
    const selectors = ((p && p.steps) || []).map(s => (s.selector || '').replace(/^\[data-tour="/, '').replace(/"\]$/, ''));
    // MUST contain every teacher anchor.
    for (const anchor of TEACHER_ANCHORS) {
      ok(`CoachOne (teacher-coach): merged tour includes teacher anchor ${anchor}`, selectors.includes(anchor),
         `selectors=${JSON.stringify(selectors)}`);
    }
    // MUST contain every coach anchor.
    for (const anchor of COACH_ANCHORS) {
      ok(`CoachOne (teacher-coach): merged tour includes coach anchor ${anchor}`, selectors.includes(anchor),
         `selectors=${JSON.stringify(selectors)}`);
    }
    // Bridge step between the two halves must exist.
    const bridgeStep = ((p && p.steps) || []).find(s =>
      String(s.title || '').startsWith("That's your teaching workspace"));
    ok('CoachOne (teacher-coach): bridge step present', !!bridgeStep);
    // Exactly one intro (title starts with "Welcome to") and one outro
    // ("You're all set") — no duplication from the two source tours.
    const introCount = ((p && p.steps) || []).filter(s => /^Welcome to/.test(s.title)).length;
    const outroCount = ((p && p.steps) || []).filter(s => s.title === "You're all set").length;
    ok(`CoachOne (teacher-coach): exactly one intro step (got ${introCount})`, introCount === 1);
    ok(`CoachOne (teacher-coach): exactly one outro step (got ${outroCount})`, outroCount === 1);
    // Merged tour is meaningfully longer than the teacher tour alone.
    // Teacher tour was ~9 steps; coach tour ~5 steps; merged should be
    // teacher(7 body) + 1 intro + 1 bridge + coach(4 body) + 1 outro = ~14+.
    ok(`CoachOne (teacher-coach): merged tour has 10+ steps (got ${(p?.steps || []).length})`,
       (p?.steps || []).length >= 10);
    // Same page must serve teacher-coach tour on both /teacher and /coach.
    const r2 = await coachOneTour.get('/coach');
    ok('CoachOne /coach 200', r2.status === 200, `HTTP ${r2.status}`);
    const p2 = extractTourPayload(r2.text);
    ok('CoachOne on /coach also gets teacher-coach payload (same length)',
       !!p2 && p2.steps.length === (p?.steps || []).length,
       `/teacher=${p?.steps?.length} /coach=${p2?.steps?.length}`);
  }
}

// ==========================================================================
suite('Case 30 — admin can create teacher / coach / teacher+can_coach, and each gets the correct tour');
{
  // End-to-end: super_admin uses POST /admin/users/create with each role
  // variant, then we log in as each newly-created user and verify the
  // guided-tour payload matches the intended workflow.  This is the
  // full round-trip Dr. Rupak asked for — "assign coach, teacher, or
  // coach + teacher and then the guided tour for anyone would adjust
  // accordingly."
  //
  // We also exercise the UPDATE endpoint by flipping one user's
  // can_coach on/off and re-checking the tour changes with them.
  //
  // Every user is created with password 'Alexander2026!' (the create
  // handler's default).  We do NOT touch fixture users; Case 30 creates
  // its own throwaway accounts under a case30- email prefix.

  // Same payload extractor + anchor lists as Case 29.
  function extractTourPayload(html) {
    const m = html.match(/window\.__APS_TOUR__=(\{[\s\S]*?\});/);
    if (!m) return null;
    try { return JSON.parse(m[1]); } catch { return null; }
  }
  function tourSelectors(p) {
    return ((p && p.steps) || []).map(s =>
      (s.selector || '').replace(/^\[data-tour="/, '').replace(/"\]$/, '')
    );
  }
  const TEACHER_ANCHORS = ['t-summary', 't-obs-list', 't-focus', 't-pd-home', 't-coaching-feedback'];
  const COACH_ANCHORS   = ['co-teachers', 'co-notes'];
  const CREATE_PW = 'Alexander2026!';

  // Login helper for a user with the CREATE_PW default password (fixture
  // users use TestPass1!, so we can't reuse the Client class's built-in
  // login).  Returns a Client with a live cookie.
  async function loginNewUser(email, label) {
    const c = new Client(email, label);
    const res = await fetch(`${BASE}/login`, {
      method: 'POST', redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ email, password: CREATE_PW }),
    });
    if (res.status !== 302) throw new Error(`${label} login: HTTP ${res.status}`);
    const sc = res.headers.get('set-cookie') || '';
    const m = sc.match(/(aps_session=[^;]+)/);
    if (!m) throw new Error(`${label}: no session cookie`);
    c.cookie = m[1];
    return c;
  }

  // Reuse the fixture admin (super_admin, has POST /admin/users/create).
  // -----------------------------------------------------------------
  // Sub-case A: create role='teacher' (no can_coach)
  // -----------------------------------------------------------------
  const emailT = `case30-teacher-${Date.now()}@test.local`;
  {
    const r = await admin.post('/admin/users/create', new URLSearchParams({
      email: emailT, first_name: 'Case30', last_name: 'Teacher',
      role: 'teacher', title: '', phone: '', password: CREATE_PW,
    }));
    ok('30A: admin create teacher returns 302', r.status === 302, `HTTP ${r.status}`);
    const row = db.prepare(`SELECT id, role, can_coach FROM users WHERE email=?`).get(emailT);
    ok('30A: created user row exists', !!row, 'no DB row');
    ok('30A: role stored as teacher', row?.role === 'teacher', `got '${row?.role}'`);
    ok('30A: can_coach stored as 0', row?.can_coach === 0, `got ${row?.can_coach}`);
    const client = await loginNewUser(emailT, 'Case30Teacher');
    const page = await client.get('/teacher');
    ok('30A: new teacher /teacher 200', page.status === 200, `HTTP ${page.status}`);
    const payload = extractTourPayload(page.text);
    ok('30A: tour payload present', !!payload);
    ok('30A: role label = "Teacher"', payload?.roleLabel === 'Teacher', `got '${payload?.roleLabel}'`);
    const sels = tourSelectors(payload);
    for (const a of TEACHER_ANCHORS) ok(`30A: teacher tour includes ${a}`, sels.includes(a));
    for (const a of COACH_ANCHORS)   ok(`30A: teacher tour does NOT include coach anchor ${a}`, !sels.includes(a));
  }

  // -----------------------------------------------------------------
  // Sub-case B: create role='coach' (pure coach)
  // -----------------------------------------------------------------
  const emailC = `case30-coach-${Date.now()}@test.local`;
  {
    const r = await admin.post('/admin/users/create', new URLSearchParams({
      email: emailC, first_name: 'Case30', last_name: 'Coach',
      role: 'coach', title: '', phone: '', password: CREATE_PW,
    }));
    ok('30B: admin create coach returns 302', r.status === 302, `HTTP ${r.status}`);
    const row = db.prepare(`SELECT id, role, can_coach FROM users WHERE email=?`).get(emailC);
    ok('30B: role stored as coach', row?.role === 'coach', `got '${row?.role}'`);
    ok('30B: can_coach stored as 0 (redundant for pure coach)', row?.can_coach === 0);
    const client = await loginNewUser(emailC, 'Case30Coach');
    const page = await client.get('/coach');
    ok('30B: new coach /coach 200', page.status === 200, `HTTP ${page.status}`);
    const payload = extractTourPayload(page.text);
    ok('30B: tour payload present', !!payload);
    ok('30B: role label = "Instructional Coach"',
       payload?.roleLabel === 'Instructional Coach', `got '${payload?.roleLabel}'`);
    const sels = tourSelectors(payload);
    for (const a of COACH_ANCHORS)   ok(`30B: coach tour includes ${a}`, sels.includes(a));
    for (const a of TEACHER_ANCHORS) ok(`30B: coach tour does NOT include teacher anchor ${a}`, !sels.includes(a));
  }

  // -----------------------------------------------------------------
  // Sub-case C: create role='teacher' + can_coach=1 (teacher-coach)
  // -----------------------------------------------------------------
  const emailTC = `case30-teachercoach-${Date.now()}@test.local`;
  {
    const r = await admin.post('/admin/users/create', new URLSearchParams({
      email: emailTC, first_name: 'Case30', last_name: 'TeacherCoach',
      role: 'teacher', title: '', phone: '', password: CREATE_PW,
      can_coach: '1',
    }));
    ok('30C: admin create teacher+can_coach returns 302', r.status === 302, `HTTP ${r.status}`);
    const row = db.prepare(`SELECT id, role, can_coach FROM users WHERE email=?`).get(emailTC);
    ok('30C: role stored as teacher', row?.role === 'teacher');
    ok('30C: can_coach stored as 1', row?.can_coach === 1, `got ${row?.can_coach}`);
    const client = await loginNewUser(emailTC, 'Case30TeacherCoach');
    const page = await client.get('/teacher');
    ok('30C: new teacher-coach /teacher 200', page.status === 200, `HTTP ${page.status}`);
    const payload = extractTourPayload(page.text);
    ok('30C: tour payload present', !!payload);
    ok('30C: role label = "Teacher & Instructional Coach"',
       payload?.roleLabel === 'Teacher & Instructional Coach', `got '${payload?.roleLabel}'`);
    const sels = tourSelectors(payload);
    for (const a of TEACHER_ANCHORS) ok(`30C: merged tour includes teacher anchor ${a}`, sels.includes(a));
    for (const a of COACH_ANCHORS)   ok(`30C: merged tour includes coach anchor ${a}`, sels.includes(a));
    ok('30C: merged tour has 10+ steps', (payload?.steps || []).length >= 10,
       `got ${(payload?.steps || []).length}`);
    // /coach must also render (teacher-coach has access to that route).
    const cp = await client.get('/coach');
    ok('30C: teacher-coach /coach 200 (coach access granted)', cp.status === 200, `HTTP ${cp.status}`);
  }

  // -----------------------------------------------------------------
  // Sub-case D: edit — flip teacher (sub-case A) TO teacher+can_coach.
  //  Verifies POST /admin/users/:id/update honors can_coach on edit and
  //  that the newly-elevated user's tour flips to the merged shape.
  // -----------------------------------------------------------------
  {
    const rowBefore = db.prepare(`SELECT id, can_coach FROM users WHERE email=?`).get(emailT);
    ok('30D: pre-flip teacher row exists', !!rowBefore);
    ok('30D: pre-flip can_coach=0', rowBefore.can_coach === 0);
    // Get their primary school so the edit payload keeps them assigned.
    const uid = rowBefore.id;
    const update = await admin.post(`/admin/users/${uid}/update`, new URLSearchParams({
      first_name: 'Case30', last_name: 'Teacher',
      email: emailT, role: 'teacher', title: '', phone: '',
      active: '1', can_coach: '1',
    }));
    ok('30D: admin update returns 302', update.status === 302, `HTTP ${update.status}`);
    const rowAfter = db.prepare(`SELECT can_coach FROM users WHERE id=?`).get(uid);
    ok('30D: post-flip can_coach=1', rowAfter.can_coach === 1, `got ${rowAfter.can_coach}`);
    // Re-login with fresh session and verify tour flipped to teacher-coach.
    const client = await loginNewUser(emailT, 'Case30TeacherFlipped');
    const page = await client.get('/teacher');
    const payload = extractTourPayload(page.text);
    ok('30D: post-flip tour role label = "Teacher & Instructional Coach"',
       payload?.roleLabel === 'Teacher & Instructional Coach', `got '${payload?.roleLabel}'`);
    const sels = tourSelectors(payload);
    for (const a of TEACHER_ANCHORS) ok(`30D: flipped tour includes teacher anchor ${a}`, sels.includes(a));
    for (const a of COACH_ANCHORS)   ok(`30D: flipped tour includes coach anchor ${a}`, sels.includes(a));
  }

  // -----------------------------------------------------------------
  // Sub-case E: edit — revoke can_coach on the teacher-coach (C).
  //  Verifies POST /admin/users/:id/update DROPS coaching when the
  //  can_coach box is unchecked, and the tour reverts to teacher-only.
  //  (Omitting the checkbox from the form body is exactly what the
  //  browser does when the box isn't checked.)
  // -----------------------------------------------------------------
  {
    const uid = db.prepare(`SELECT id FROM users WHERE email=?`).get(emailTC).id;
    const update = await admin.post(`/admin/users/${uid}/update`, new URLSearchParams({
      first_name: 'Case30', last_name: 'TeacherCoach',
      email: emailTC, role: 'teacher', title: '', phone: '',
      active: '1', // NO can_coach — simulates unchecked checkbox
    }));
    ok('30E: admin revoke can_coach returns 302', update.status === 302, `HTTP ${update.status}`);
    const rowAfter = db.prepare(`SELECT can_coach FROM users WHERE id=?`).get(uid);
    ok('30E: post-revoke can_coach=0', rowAfter.can_coach === 0, `got ${rowAfter.can_coach}`);
    const client = await loginNewUser(emailTC, 'Case30TCRevoked');
    const page = await client.get('/teacher');
    const payload = extractTourPayload(page.text);
    ok('30E: post-revoke role label = "Teacher"',
       payload?.roleLabel === 'Teacher', `got '${payload?.roleLabel}'`);
    const sels = tourSelectors(payload);
    for (const a of COACH_ANCHORS) ok(`30E: revoked tour does NOT include coach anchor ${a}`, !sels.includes(a));
    // And /coach must now 403 for this user (coach access revoked).
    const cp = await client.get('/coach');
    ok('30E: /coach returns 403 after revoke (got HTTP ' + cp.status + ')',
       cp.status === 403);
  }

  // -----------------------------------------------------------------
  // Sub-case F: edit — change role from teacher(can_coach=1) to 'coach'.
  //  Server should clear can_coach (redundant for pure coach), and
  //  tour should become the pure-coach walkthrough.
  //  Uses the coach account created in 30B (currently role='coach').
  //  We flip it teacher→coach in one step to also cover role migration.
  //  (Recreate a fresh teacher-coach first because 30E already revoked
  //  emailTC.)
  // -----------------------------------------------------------------
  const emailF = `case30-flip-${Date.now()}@test.local`;
  {
    // Seed as teacher-coach.
    const c1 = await admin.post('/admin/users/create', new URLSearchParams({
      email: emailF, first_name: 'Case30', last_name: 'FlipMe',
      role: 'teacher', title: '', phone: '', password: CREATE_PW,
      can_coach: '1',
    }));
    ok('30F: seed teacher-coach returns 302', c1.status === 302);
    const uid = db.prepare(`SELECT id FROM users WHERE email=?`).get(emailF).id;
    // Now flip role → coach (checkbox still submitted, but server MUST
    // coerce can_coach=0 because role is no longer teacher).
    const upd = await admin.post(`/admin/users/${uid}/update`, new URLSearchParams({
      first_name: 'Case30', last_name: 'FlipMe',
      email: emailF, role: 'coach', title: '', phone: '',
      active: '1', can_coach: '1', // deliberately still checked
    }));
    ok('30F: admin flip teacher→coach returns 302', upd.status === 302);
    const row = db.prepare(`SELECT role, can_coach FROM users WHERE id=?`).get(uid);
    ok('30F: role stored as coach', row.role === 'coach', `got '${row.role}'`);
    ok('30F: can_coach coerced to 0 despite form checkbox still checked',
       row.can_coach === 0, `got ${row.can_coach}`);
    const client = await loginNewUser(emailF, 'Case30FlippedToCoach');
    const page = await client.get('/coach');
    const payload = extractTourPayload(page.text);
    ok('30F: post-flip role label = "Instructional Coach"',
       payload?.roleLabel === 'Instructional Coach', `got '${payload?.roleLabel}'`);
    const sels = tourSelectors(payload);
    for (const a of COACH_ANCHORS)   ok(`30F: coach tour includes ${a}`, sels.includes(a));
    for (const a of TEACHER_ANCHORS) ok(`30F: coach tour does NOT include teacher anchor ${a}`, !sels.includes(a));
  }
}

// ==========================================================================
suite('Case 31 — principal bulk-assigns external PD to multiple teachers (Aaron Allard training request)');
{
  // Sept 24, 2026 — Aaron Allard's request from the admin+coaches
  // training: give principals a way to record ONE group PD event (e.g.
  // district CLA training) for many teachers at once, instead of
  // asking each teacher to submit it themselves.  Implementation
  // details:
  //   * POST /appraiser/external-pd/bulk-assign
  //   * Inserts one external_pd_submissions row per selected teacher
  //     directly in status='approved' with approved_hours=hours.
  //   * Silently skips teachers not on the principal's caseload, so
  //     an authorization bypass attempt returns a partial success
  //     message instead of a server error.
  //   * Fires one external_pd_approved notification per teacher.
  //
  // Fixture setup: principal (id 2) has appraiser assignments to
  // teachers 10 (Alice), 11 (Bob), 12 (Carol), 13 (Dan), 14 (Plain),
  // 20 (Unrelated).  Teacher 20 (Unrelated) is on principal's list —
  // switch to id 3 (PureCoach) or the admin (1) for the "not on
  // caseload" negative test.
  const principal = await new Client('principal@test','Principal').login();

  const BULK_TITLE = `CLA Reading Curriculum Training — Case 31 ${Date.now()}`;
  const BULK_HOURS = 3.5;
  const targets = [IDS.alice, IDS.bob, IDS.carol]; // 3 teachers principal DOES coach
  const notOnCaseload = IDS.pureCoach; // role='coach', principal has no appraiser assignment for them

  // Baseline: notification and submissions counts BEFORE the bulk call.
  const preRowsPerTeacher = {};
  const preNotifsPerTeacher = {};
  for (const tid of [...targets, notOnCaseload]) {
    preRowsPerTeacher[tid] = db.prepare(
      `SELECT COUNT(*) AS n FROM external_pd_submissions WHERE teacher_id=? AND deleted_at IS NULL`
    ).get(tid).n;
    preNotifsPerTeacher[tid] = db.prepare(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='external_pd_approved'`
    ).get(tid).n;
  }

  // -----------------------------------------------------------------
  // 31A: happy path — bulk-assign to 3 teachers on caseload
  // -----------------------------------------------------------------
  {
    const form = new URLSearchParams();
    form.append('title', BULK_TITLE);
    form.append('provider', 'CLA');
    form.append('start_date', '2026-09-20');
    form.append('end_date', '2026-09-24');
    form.append('hours', String(BULK_HOURS));
    form.append('description', 'District-wide CLA reading curriculum training.');
    form.append('domain_alignment', 'B,C');
    for (const tid of targets) form.append('teacher_ids', String(tid));
    const r = await principal.post('/appraiser/external-pd/bulk-assign', form);
    ok('31A: bulk-assign returns 302', r.status === 302, `HTTP ${r.status}`);
    ok('31A: redirect toast reports "for 3 teachers"',
       locHas(r.location, 'for 3 teachers'), `loc=${r.location}`);
  }

  // 31A verifications: each target has exactly ONE new row in status='approved'.
  for (const tid of targets) {
    const row = db.prepare(
      `SELECT id, title, status, approved_hours, hours, reviewed_by, review_note, domain_alignment
         FROM external_pd_submissions
        WHERE teacher_id=? AND title=? AND deleted_at IS NULL`
    ).get(tid, BULK_TITLE);
    ok(`31A teacher ${tid}: row inserted`, !!row);
    ok(`31A teacher ${tid}: status=approved`, row?.status === 'approved', `got '${row?.status}'`);
    ok(`31A teacher ${tid}: approved_hours=${BULK_HOURS}`,
       Number(row?.approved_hours) === BULK_HOURS, `got ${row?.approved_hours}`);
    ok(`31A teacher ${tid}: reviewed_by=principal`, row?.reviewed_by === IDS.principal);
    ok(`31A teacher ${tid}: review_note names principal`,
       (row?.review_note || '').includes('Peggy Principal'),
       `got '${row?.review_note}'`);
    ok(`31A teacher ${tid}: domain_alignment JSON contains B and C`,
       (row?.domain_alignment || '').includes('B') && (row?.domain_alignment || '').includes('C'));

    // Exactly one new notification.
    const postNotifs = db.prepare(
      `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='external_pd_approved'`
    ).get(tid).n;
    ok(`31A teacher ${tid}: exactly one new external_pd_approved notification`,
       postNotifs === preNotifsPerTeacher[tid] + 1,
       `${preNotifsPerTeacher[tid]} → ${postNotifs}`);
    // Notification body names the principal + title + hours.
    const notif = db.prepare(
      `SELECT title, body FROM notifications
        WHERE user_id=? AND kind='external_pd_approved'
        ORDER BY id DESC LIMIT 1`
    ).get(tid);
    ok(`31A teacher ${tid}: notification body mentions the bulk title`,
       (notif?.body || '').includes(BULK_TITLE),
       `body='${notif?.body?.slice(0,120)}...'`);
  }

  // 31A row-count invariant: exactly ONE row per target (no dupes).
  for (const tid of targets) {
    const n = db.prepare(
      `SELECT COUNT(*) AS n FROM external_pd_submissions
        WHERE teacher_id=? AND title=? AND deleted_at IS NULL`
    ).get(tid, BULK_TITLE).n;
    ok(`31A teacher ${tid}: exactly ONE row for this bulk title (got ${n})`, n === 1);
  }

  // -----------------------------------------------------------------
  // 31B: authorization guard — principal tries to include a teacher
  // they DON'T supervise (PureCoach, id 3).  Server must silently
  // skip that id, insert for allowed ids only, and report the skip.
  // -----------------------------------------------------------------
  {
    const form = new URLSearchParams();
    form.append('title', `31B mixed batch ${Date.now()}`);
    form.append('hours', '1.0');
    form.append('teacher_ids', String(IDS.alice));     // allowed
    form.append('teacher_ids', String(notOnCaseload)); // NOT allowed
    const r = await principal.post('/appraiser/external-pd/bulk-assign', form);
    ok('31B: mixed batch returns 302', r.status === 302);
    ok('31B: toast says "for 1 teacher" (skipped the unauthorized one)',
       locHas(r.location, 'for 1 teacher'), `loc=${r.location}`);
    ok('31B: toast reports the skipped-authorization count',
       locHas(r.location, 'Skipped 1 teacher') && locHas(r.location, 'not on your caseload'),
       `loc=${r.location}`);
    const rowForBadTeacher = db.prepare(
      `SELECT COUNT(*) AS n FROM external_pd_submissions
        WHERE teacher_id=? AND title LIKE '31B mixed batch%' AND deleted_at IS NULL`
    ).get(notOnCaseload).n;
    ok('31B: NO row inserted for the unauthorized teacher', rowForBadTeacher === 0);
  }

  // -----------------------------------------------------------------
  // 31C: all-unauthorized batch — a principal targeting ONLY teachers
  // not on their caseload gets a friendly rejection, zero rows written.
  // -----------------------------------------------------------------
  {
    const preAll = db.prepare(`SELECT COUNT(*) AS n FROM external_pd_submissions WHERE deleted_at IS NULL`).get().n;
    const form = new URLSearchParams();
    form.append('title', `31C rejection ${Date.now()}`);
    form.append('hours', '1.0');
    form.append('teacher_ids', String(notOnCaseload));
    const r = await principal.post('/appraiser/external-pd/bulk-assign', form);
    ok('31C: all-unauthorized returns 302', r.status === 302);
    ok('31C: toast explains "None of the selected teachers are on your caseload"',
       locHas(r.location, 'None of the selected teachers are on your caseload'),
       `loc=${r.location}`);
    const postAll = db.prepare(`SELECT COUNT(*) AS n FROM external_pd_submissions WHERE deleted_at IS NULL`).get().n;
    ok('31C: zero rows written (no partial insert)', postAll === preAll,
       `${preAll} → ${postAll}`);
  }

  // -----------------------------------------------------------------
  // 31D: input validation — empty title / bad hours / no teachers.
  // -----------------------------------------------------------------
  {
    // Missing title
    const preAll = db.prepare(`SELECT COUNT(*) AS n FROM external_pd_submissions WHERE deleted_at IS NULL`).get().n;
    const r1 = await principal.post('/appraiser/external-pd/bulk-assign', new URLSearchParams({
      hours: '1', teacher_ids: String(IDS.alice),
    }));
    ok('31D: missing title returns 302 with error toast',
       r1.status === 302 && locHas(r1.location, 'Title is required'), `loc=${r1.location}`);
    // Zero hours
    const r2 = await principal.post('/appraiser/external-pd/bulk-assign', new URLSearchParams({
      title: '31D zero hours', hours: '0', teacher_ids: String(IDS.alice),
    }));
    ok('31D: zero hours returns 302 with valid-hour toast',
       r2.status === 302 && locHas(r2.location, 'Enter a valid hour value'), `loc=${r2.location}`);
    // No teachers selected
    const r3 = await principal.post('/appraiser/external-pd/bulk-assign', new URLSearchParams({
      title: '31D no teachers', hours: '1',
    }));
    ok('31D: no teachers returns 302 with "Pick at least one" toast',
       r3.status === 302 && locHas(r3.location, 'Pick at least one teacher'), `loc=${r3.location}`);
    // No writes happened during any of the three rejects.
    const postAll = db.prepare(`SELECT COUNT(*) AS n FROM external_pd_submissions WHERE deleted_at IS NULL`).get().n;
    ok('31D: zero writes across all three validation rejects', postAll === preAll,
       `${preAll} → ${postAll}`);
  }

  // -----------------------------------------------------------------
  // 31E: GET /appraiser/external-pd renders the bulk-assign card AND
  // populates its teacher select with the principal's caseload only.
  // -----------------------------------------------------------------
  {
    const r = await principal.get('/appraiser/external-pd');
    ok('31E: /appraiser/external-pd returns 200', r.status === 200, `HTTP ${r.status}`);
    ok('31E: page renders "Bulk-assign external PD" heading',
       r.text.includes('Bulk-assign external PD to multiple teachers'));
    ok('31E: page renders the bulk-assign form action',
       r.text.includes('action="/appraiser/external-pd/bulk-assign"'));
    // Principal is assigned to teachers 10,11,12,13,14,20 → all should
    // appear in the multi-select.  A teacher NOT on their caseload
    // (super_admin id=1) must NOT appear.
    const selectMatch = r.text.match(/<select[^>]*name="teacher_ids"[^>]*>([\s\S]*?)<\/select>/);
    ok('31E: teacher_ids multi-select is present', !!selectMatch, 'no select found');
    if (selectMatch) {
      const options = selectMatch[1];
      // Plain (id 14) was hard-deleted by Case 17 and is gone from the
      // users table, so we don't assert her presence.  Alice/Bob/Carol/
      // Dan/Unrelated (10,11,12,13,20) all remain and are on the
      // principal's caseload (fixture line 163).
      for (const tid of [IDS.alice, IDS.bob, IDS.carol, IDS.dan, IDS.unrelated]) {
        ok(`31E: teacher id ${tid} present in select`,
           new RegExp(`<option value="${tid}"`).test(options),
           `teacher_ids options=${options.slice(0,300)}...`);
      }
      ok('31E: admin (id 1) NOT in the multi-select (not a teacher)',
         !/value="1"/.test(options));
    }
  }

  // -----------------------------------------------------------------
  // 31F: authorization — a NON-appraiser (a plain teacher) hitting the
  // bulk endpoint must be forbidden.  The requireRole gate at the top
  // of appraiser.tsx enforces this; verify it hasn't regressed.
  //
  // Case 17 earlier soft-fallback-deleted Alice + revoked her sessions,
  // and Plain was hard-deleted, so we log in with a FRESH Bob client
  // for this negative case.  Bob (id 11) is a pure teacher (role=teacher,
  // can_coach=0), which is exactly the negative case we want.
  // -----------------------------------------------------------------
  {
    const bobFresh = await new Client('bob@test', 'BobBulkNeg').login();
    const r = await bobFresh.post('/appraiser/external-pd/bulk-assign', new URLSearchParams({
      title: '31F privilege escalation', hours: '1', teacher_ids: String(IDS.carol),
    }));
    ok('31F: teacher POST to bulk-assign is forbidden (403)',
       r.status === 403, `HTTP ${r.status}`);
    const leaked = db.prepare(
      `SELECT COUNT(*) AS n FROM external_pd_submissions
        WHERE title = '31F privilege escalation'`
    ).get().n;
    ok('31F: no row written despite teacher attempt', leaked === 0);
  }
}

// ==========================================================================
suite('Case 27 — RESET PRACTICE DATA sweeps coaching_notes (+audit + share-delivery); observations preserved');
{
  // Seed a fresh coaching note authored by CoachOne for Alice, share it,
  // then run RESET PRACTICE DATA and verify:
  //   * coaching_notes: 0 active (soft-delete if pref ON, hard-delete otherwise)
  //   * coaching_note_audit: same
  //   * coaching_note_share_delivery: same
  //   * observations: preserved (Alice's seeded obs 100 still there)
  //   * admin_audit_log: has a reset_practice_data (or soft_ variant) row
  //     whose detail names coaching_notes
  //
  // Case 27 + 28 must run at the very END of the suite because they wipe
  // fixture state (coaching_notes and — for Case 28 — observations).
  const noteToken = 'case27-' + Date.now();
  const create = await coachOne.post(`/coach/teachers/${IDS.alice}/notes`, new URLSearchParams({
    _token: noteToken,
    occurred_on: '2026-09-24',
    class_context: 'Case 27 seed',
    evidence: 'Case 27 evidence text.',
    glow: 'Case 27 glow.',
    _action: 'share',
  }));
  ok('Case 27 seed note POST 302', create.status === 302, `HTTP ${create.status}`);
  const seededCount = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_notes WHERE deleted_at IS NULL`
  ).get().n;
  ok('at least one live coaching note before reset', seededCount >= 1, `got ${seededCount}`);

  // Confirm the soft-delete preference so we know which invariant to check.
  const softPref = Number(
    db.prepare(`SELECT value FROM system_settings WHERE key='soft_delete_enabled'`).get()?.value ?? 1
  ) >= 1;

  // Snapshot observation count so we can verify preservation.
  const obsBefore = db.prepare(
    `SELECT COUNT(*) AS n FROM observations WHERE deleted_at IS NULL`
  ).get().n;

  // Run RESET PRACTICE DATA.
  const reset = await admin.post('/admin/data/reset-practice-data', new URLSearchParams({
    confirm: 'RESET PRACTICE DATA',
  }));
  ok('RESET PRACTICE DATA returns 302', reset.status === 302, `HTTP ${reset.status}`);

  // Coaching notes: no live rows regardless of soft-pref.
  const cnLive = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_notes WHERE deleted_at IS NULL`
  ).get().n;
  ok(`no live coaching notes after reset (got ${cnLive})`, cnLive === 0);

  // Audit + delivery ledger: no live rows.
  const cnaLive = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_note_audit WHERE deleted_at IS NULL`
  ).get().n;
  ok(`no live coaching_note_audit after reset (got ${cnaLive})`, cnaLive === 0);
  const cnsLive = db.prepare(
    `SELECT COUNT(*) AS n FROM coaching_note_share_delivery WHERE deleted_at IS NULL`
  ).get().n;
  ok(`no live coaching_note_share_delivery after reset (got ${cnsLive})`, cnsLive === 0);

  // Soft-vs-hard-path invariant: if soft, rows must still exist with deleted_at set.
  if (softPref) {
    const cnSoft = db.prepare(
      `SELECT COUNT(*) AS n FROM coaching_notes WHERE deleted_at IS NOT NULL`
    ).get().n;
    ok(`soft-delete pref ON → coaching_notes rows preserved with deleted_at (got ${cnSoft})`, cnSoft >= 1);
  }

  // Observations preserved.
  const obsAfter = db.prepare(
    `SELECT COUNT(*) AS n FROM observations WHERE deleted_at IS NULL`
  ).get().n;
  ok(`observations preserved (${obsBefore} → ${obsAfter})`, obsAfter === obsBefore);

  // admin_audit_log has a reset_practice_data row whose detail names coaching_notes.
  const auditRow = db.prepare(
    `SELECT action, detail FROM admin_audit_log
      WHERE action IN ('reset_practice_data','soft_reset_practice_data')
      ORDER BY id DESC LIMIT 1`
  ).get();
  ok('reset_practice_data admin_audit_log row exists', !!auditRow, 'no audit row');
  ok('admin_audit_log detail mentions coaching_notes',
     !!auditRow && String(auditRow.detail || '').includes('coaching_notes'),
     `detail='${auditRow?.detail || ''}'`);
}

// ==========================================================================
suite('Case 28 — CLEAR ALL DEMO DATA sweeps coaching_notes + observations + notifications + practice_cleanup_*');
{
  // Seed a NEW coaching note (Case 27 wiped the previous one) plus an
  // observation-adjacent notification via the coach-share path.  Then run
  // CLEAR ALL DEMO DATA and verify EVERYTHING listed in the handover-wipe
  // scope is empty while users/schools/rubric/pd_modules stay intact.
  const noteToken = 'case28-' + Date.now();
  const create = await coachOne.post(`/coach/teachers/${IDS.alice}/notes`, new URLSearchParams({
    _token: noteToken,
    occurred_on: '2026-09-24',
    evidence: 'Case 28 evidence text.',
    glow: 'Case 28 glow.',
    _action: 'share',
  }));
  ok('Case 28 seed note POST 302', create.status === 302, `HTTP ${create.status}`);

  // Snapshot preserved-side counts BEFORE the wipe.
  const usersBefore     = db.prepare(`SELECT COUNT(*) AS n FROM users`).get().n;
  const schoolsBefore   = db.prepare(`SELECT COUNT(*) AS n FROM schools`).get().n;
  const asnBefore       = db.prepare(`SELECT COUNT(*) AS n FROM assignments`).get().n;
  const fwBefore        = db.prepare(`SELECT COUNT(*) AS n FROM framework_indicators`).get().n;
  const pdModsBefore    = db.prepare(`SELECT COUNT(*) AS n FROM pd_modules`).get().n;

  // Run CLEAR ALL DEMO DATA.
  const wipe = await admin.post('/admin/data/clear-all-demo', new URLSearchParams({
    confirm: 'CLEAR ALL DEMO DATA',
  }));
  ok('CLEAR ALL DEMO DATA returns 302', wipe.status === 302, `HTTP ${wipe.status}`);

  // Every practice/demo table is empty (hard-delete regardless of soft pref).
  const tablesShouldBeEmpty = [
    'observation_scores', 'feedback_items', 'focus_areas',
    'pd_enrollments', 'external_pd_submissions', 'teacher_goals',
    'coaching_note_audit', 'coaching_note_share_delivery', 'coaching_notes',
    'observations',
    'practice_cleanup_execution_lock', 'practice_cleanup_open_claim',
    'practice_cleanup_notif_scope', 'practice_cleanup_ambiguous_notif',
    'practice_cleanup_child', 'practice_cleanup_row', 'practice_cleanup_batches',
    'notifications',
  ];
  for (const t of tablesShouldBeEmpty) {
    const n = db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get().n;
    ok(`${t} empty after clear-all-demo (got ${n})`, n === 0);
  }
  // activity_log gets ONE fresh row from logActivity('system', 0, 'clear_all_demo')
  // itself — recorded AFTER the DELETE so the wipe leaves an audit trail of
  // the wipe.  The pre-wipe rows are gone; only this self-referential
  // 'clear_all_demo' record remains.
  const actRows = db.prepare(
    `SELECT COUNT(*) AS n FROM activity_log WHERE action='clear_all_demo'`
  ).get().n;
  const actTotal = db.prepare(`SELECT COUNT(*) AS n FROM activity_log`).get().n;
  ok(`activity_log holds ONLY the clear_all_demo self-record (total=${actTotal}, clear_all_demo=${actRows})`,
     actTotal === 1 && actRows === 1);

  // Preserved-side invariants: users, schools, assignments, rubric,
  // pd_modules must be untouched.
  const usersAfter   = db.prepare(`SELECT COUNT(*) AS n FROM users`).get().n;
  const schoolsAfter = db.prepare(`SELECT COUNT(*) AS n FROM schools`).get().n;
  const asnAfter     = db.prepare(`SELECT COUNT(*) AS n FROM assignments`).get().n;
  const fwAfter      = db.prepare(`SELECT COUNT(*) AS n FROM framework_indicators`).get().n;
  const pdModsAfter  = db.prepare(`SELECT COUNT(*) AS n FROM pd_modules`).get().n;
  ok(`users preserved (${usersBefore} → ${usersAfter})`, usersAfter === usersBefore);
  ok(`schools preserved (${schoolsBefore} → ${schoolsAfter})`, schoolsAfter === schoolsBefore);
  ok(`assignments preserved (${asnBefore} → ${asnAfter})`, asnAfter === asnBefore);
  ok(`framework_indicators preserved (${fwBefore} → ${fwAfter})`, fwAfter === fwBefore);
  ok(`pd_modules preserved (${pdModsBefore} → ${pdModsAfter})`, pdModsAfter === pdModsBefore);

  // admin_audit_log has a clear_all_demo row whose detail lists coaching_notes.
  // NOTE: activity_log was just wiped, but admin_audit_log is preserved by design.
  const auditRow = db.prepare(
    `SELECT action, detail FROM admin_audit_log
      WHERE action = 'clear_all_demo'
      ORDER BY id DESC LIMIT 1`
  ).get();
  ok('clear_all_demo admin_audit_log row exists', !!auditRow, 'no audit row');
  ok('admin_audit_log detail mentions coaching_notes',
     !!auditRow && String(auditRow.detail || '').includes('coaching_notes'),
     `detail='${auditRow?.detail || ''}'`);
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
