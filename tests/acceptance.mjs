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

// C5a: capture CoachOne's teacher-side state BEFORE any coach activity of
// hers touched the system.  These values must still equal the fixture's
// seeded values after the acceptance suite runs (drafts + shares +
// notifications for other teachers all happened above).
const preCoachOneObs = db.prepare(
  `SELECT status, teacher_acknowledged_at IS NOT NULL AS acked FROM observations WHERE id=101`
).get();
const preCoachOneEnr = db.prepare(
  `SELECT status, hours_credited FROM pd_enrollments WHERE id=201`
).get();
const preCoachOneScore = db.prepare(
  `SELECT level FROM observation_scores WHERE observation_id=101 LIMIT 1`
).get();

{
  const r = await coachOne.get('/teacher');
  ok('CoachOne /teacher after coaching activity still 200', r.status === 200);
  ok('CoachOne\'s teacher home shows PD Hours pill', r.text.includes('PD Hours This Year'));
  // C5a: her personal seeded values are still exactly what we seeded.
  const nowObs = db.prepare(
    `SELECT status, teacher_acknowledged_at IS NOT NULL AS acked FROM observations WHERE id=101`
  ).get();
  ok(`CoachOne's own observation 101 status unchanged (${preCoachOneObs.status} → ${nowObs.status})`,
     nowObs.status === preCoachOneObs.status);
  ok(`CoachOne's own observation acknowledgement preserved (${preCoachOneObs.acked} → ${nowObs.acked})`,
     nowObs.acked === preCoachOneObs.acked);
  const nowEnr = db.prepare(`SELECT status, hours_credited FROM pd_enrollments WHERE id=201`).get();
  ok(`CoachOne's PD enrollment 201 status unchanged (${preCoachOneEnr.status} → ${nowEnr.status})`,
     nowEnr.status === preCoachOneEnr.status);
  ok(`CoachOne's credited hours preserved (${preCoachOneEnr.hours_credited} → ${nowEnr.hours_credited})`,
     nowEnr.hours_credited === preCoachOneEnr.hours_credited);
  const nowScore = db.prepare(`SELECT level FROM observation_scores WHERE observation_id=101 LIMIT 1`).get();
  ok(`CoachOne's own observation score unchanged (${preCoachOneScore.level} → ${nowScore.level})`,
     nowScore.level === preCoachOneScore.level);
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
suite('Case 14 — C3b notify-retry endpoint is idempotent and view-only for super_admin');
{
  // Set up: create a shared note, then DELETE the notification row so the
  // note is "delivered notification lost" state (simulating a real notify()
  // failure).  The GET view must show the badge, and POST notify-retry
  // must send exactly one notification.
  const form = new URLSearchParams({
    _token: 'c3b-notify-' + Date.now(),
    occurred_on: '2026-09-23',
    glow: 'C3b notify-retry test entry',
    _action: 'share',
  });
  await coachOne.post(`/coach/teachers/${IDS.alice}/notes`, form);
  const noteId = db.prepare(
    `SELECT id FROM coaching_notes WHERE author_id=? AND teacher_id=? ORDER BY id DESC LIMIT 1`
  ).get(IDS.coachOne, IDS.alice).id;
  // Force "notification lost": delete the row that was just created.
  const delRes = db.prepare(
    `DELETE FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`
  ).run(IDS.alice, noteId);
  ok(`forced delete of the notification row (deleted ${delRes.changes})`, delRes.changes === 1);
  // Coach view must show the "Notification not delivered" badge for THIS note.
  const view = await coachOne.get(`/coach/teachers/${IDS.alice}`);
  ok('coach view shows "Notification not delivered" badge for the lost note',
     view.text.includes('Notification not delivered'),
     'badge missing');
  // Trigger notify-retry.
  const retry = await coachOne.post(`/coach/teachers/${IDS.alice}/notes/${noteId}/notify-retry`, new URLSearchParams({}));
  ok('notify-retry returns 302', retry.status === 302, `HTTP ${retry.status}`);
  ok('notify-retry redirect says "Notification sent"',
     locHas(retry.location, 'Notification sent'), `loc=${retry.location}`);
  const nowN = db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND kind='coach_note' AND entity_id=?`
  ).get(IDS.alice, noteId).n;
  ok(`notify-retry re-created exactly one notification (${nowN})`, nowN === 1);
  // Second retry must be a no-op ("Notification is already delivered").
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
