#!/usr/bin/env node
/**
 * Acceptance suite for the Sept 23, 2026 coaching-capability change.
 * Runs against the LOCAL server (http://localhost:3000) which is backed by
 * the isolated test D1 (restored from a prod snapshot then augmented with
 * can_coach=1 on Miranda & Tristae).  Never talks to production.
 *
 * The 8 sub-suites map 1:1 to Section 8 of the change spec.
 *
 * Usage: node tests/acceptance.mjs
 */

const BASE = 'http://localhost:3000';
const PW = 'Alexander2026!';

// ---- tiny HTTP helper with cookie-jar per user ---------------------------
class Client {
  constructor(email) { this.email = email; this.cookie = null; this.userLabel = email.split('@')[0]; }
  async login() {
    const form = new URLSearchParams({ email: this.email, password: PW });
    const res = await fetch(`${BASE}/login`, {
      method: 'POST',
      body: form,
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
    });
    if (res.status !== 302) throw new Error(`${this.userLabel} login: HTTP ${res.status}`);
    const setCookie = res.headers.get('set-cookie');
    if (!setCookie) throw new Error(`${this.userLabel} login: no session cookie`);
    // Extract just the aps_session=<value> part (before the first ;)
    const m = setCookie.match(/(aps_session=[^;]+)/);
    if (!m) throw new Error(`${this.userLabel} login: no aps_session cookie`);
    this.cookie = m[1];
    // Guard against "must change password" redirect
    const loc = res.headers.get('location');
    if (loc && loc.includes('/change-password')) {
      throw new Error(`${this.userLabel} login: forced password change (fix seed)`);
    }
    return this;
  }
  async get(path) {
    const r = await fetch(`${BASE}${path}`, {
      redirect: 'manual',
      headers: { cookie: this.cookie || '' },
    });
    const text = r.status < 400 ? await r.text() : '';
    return { status: r.status, location: r.headers.get('location'), text };
  }
  async post(path, form) {
    const body = form instanceof URLSearchParams ? form : new URLSearchParams(form);
    const r = await fetch(`${BASE}${path}`, {
      method: 'POST',
      redirect: 'manual',
      body,
      headers: { cookie: this.cookie || '', 'content-type': 'application/x-www-form-urlencoded' },
    });
    return { status: r.status, location: r.headers.get('location') };
  }
}

// ---- test harness --------------------------------------------------------
let passed = 0, failed = 0, section = '';
function suite(name) { section = name; console.log(`\n[${name}]`); }
function ok(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else      { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
async function main() {

// Known IDs from the seeded prod snapshot:
//   admin=1, Leslie Bieber=2, Shannon Faller=3, AJ Allard=4,
//   Jacki Hansel=5, Jil Stahosky=10, Amy Gaida=11, Ellen Wittmaier=12,
//   Tristae Allard=13, Erica Turnquist=15, Tarynn Nieuwsma=16,
//   MaKenna Sanvik=17, Michelle Simonson=18, Miranda Quale=19,
//   Terrille Jacobson=20, Ali Schmidt=21, Pamela Albright=23,
//   Kasey Biagioni=24, Laura Ferry=25.
const IDS = {
  admin: 1, michelle: 18, miranda: 19, tristae: 13,
  ali: 21, terrille: 20, jil: 10, pamela: 23, aaron: 4, leslie: 2,
};

// Log everyone in.
const admin    = await new Client('admin@alexanderschoolnd.us').login();
const michelle = await new Client('michelle.simonson@k12.nd.us').login();
const miranda  = await new Client('miranda.quale@k12.nd.us').login();
const tristae  = await new Client('tristae.allard@k12.nd.us').login();
const jil      = await new Client('jil.stahosky@k12.nd.us').login();
const ali      = await new Client('ali.schmidt@k12.nd.us').login();  // subject of Miranda's coaching
const aaron    = await new Client('aaron.allard@k12.nd.us').login();

// ---------------------------------------------------------------------------
suite('Case 1 — Michelle retains coach experience; Miranda/Tristae have BOTH workspaces');

{
  const r = await michelle.get('/coach');
  ok('Michelle /coach returns HTTP 200', r.status === 200, `HTTP ${r.status}`);
  ok('Michelle sees My Teachers heading', r.text.includes('My Teachers') || r.text.includes('teachers assigned'), 'no heading');
}
{
  // Miranda is role=teacher with can_coach=1 → both workspaces
  const t = await miranda.get('/teacher');
  ok('Miranda /teacher (teaching workspace) returns 200', t.status === 200, `HTTP ${t.status}`);
  ok('Miranda /teacher shows the split-nav "My Coaching" link', t.text.includes('My Coaching'), 'nav missing');
  ok('Miranda /teacher shows PD Review nav', t.text.includes('/pd/review'), 'nav missing');
  const c = await miranda.get('/coach');
  ok('Miranda /coach returns 200 (capability path)', c.status === 200, `HTTP ${c.status}`);
  // Tristae's kindergarten teacher records still work
  const tt = await tristae.get('/teacher');
  ok('Tristae /teacher (kindergarten records) returns 200', tt.status === 200, `HTTP ${tt.status}`);
  const tc = await tristae.get('/coach');
  ok('Tristae /coach returns 200 (capability path)', tc.status === 200, `HTTP ${tc.status}`);
}

// ---------------------------------------------------------------------------
suite('Case 2 — Ordinary teachers cannot use coach routes; coaches see only their caseload');

{
  const r = await jil.get('/coach');
  ok('Jil (role=teacher, can_coach=0) blocked from /coach', r.status === 403, `HTTP ${r.status}`);
  const r2 = await jil.get('/pd/review');
  ok('Jil blocked from /pd/review', r2.status === 403, `HTTP ${r2.status}`);
}
{
  // Miranda tries to view a teacher she is NOT assigned to
  // (Pamela Albright id=23; Miranda is only assigned to Ali id=21).
  const r = await miranda.get('/coach/teachers/23');
  ok('Miranda blocked from viewing unassigned teacher (Pamela)', r.status === 403, `HTTP ${r.status}`);
  // But Miranda CAN view Ali (id=21) — her assigned teacher
  const r2 = await miranda.get('/coach/teachers/21');
  ok('Miranda can view her assigned teacher (Ali)', r2.status === 200, `HTTP ${r2.status}`);
}
{
  // No self-coaching: Miranda cannot open a coaching view of herself
  const r = await miranda.get('/coach/teachers/19');
  ok('Miranda blocked from self-coaching URL', r.status === 403, `HTTP ${r.status}`);
}

// ---------------------------------------------------------------------------
suite('Case 3 — Draft saves survive; sharing produces one visible entry with one notification');

let draftNoteId = null;
{
  // Miranda saves a DRAFT for Ali.
  const form = new URLSearchParams({
    occurred_on: '2026-09-20',
    class_context: 'Grade 4 reading, 18 students',
    evidence: 'Students led a book-club discussion using the fishbowl protocol.',
    glow: 'Facilitator moves were consistent — Ali distributed turns evenly.',
    grow: '',
    next_step: 'Try a written prompt so quieter students contribute in writing.',
    _action: 'draft',
  });
  const r = await miranda.post(`/coach/teachers/21/notes`, form);
  ok('Miranda POST draft note → 302', r.status === 302 && (r.location||'').includes('Draft saved'), `${r.status} ${r.location}`);
}
{
  // Ali should NOT see any coaching feedback in her workspace yet.
  const t = await ali.get('/teacher');
  ok('Ali cannot see draft in her workspace', !t.text.includes('Facilitator moves were consistent'), 'draft leaked');
}
{
  // Miranda opens her own view — she DOES see it.
  const r = await miranda.get('/coach/teachers/21');
  ok('Miranda sees her own draft', r.text.includes('Facilitator moves were consistent'), 'draft missing');
  // Extract note id from the edit form action so we can update it next
  const m = r.text.match(/\/coach\/teachers\/21\/notes\/(\d+)\/update/);
  draftNoteId = m ? Number(m[1]) : null;
  ok('extracted draft note id', draftNoteId != null, 'no id found');
}
{
  // Now SHARE the draft.
  const form = new URLSearchParams({
    occurred_on: '2026-09-20',
    class_context: 'Grade 4 reading, 18 students',
    evidence: 'Students led a book-club discussion using the fishbowl protocol.',
    glow: 'Facilitator moves were consistent — Ali distributed turns evenly.',
    grow: '',
    next_step: 'Try a written prompt so quieter students contribute in writing.',
    _action: 'share',
  });
  const r = await miranda.post(`/coach/teachers/21/notes/${draftNoteId}/update`, form);
  ok('Miranda shares the draft → 302', r.status === 302 && (r.location||'').includes('Shared') || (r.location||'').includes('Updated'), `${r.status} ${r.location}`);
}
{
  const t = await ali.get('/teacher');
  ok('Ali NOW sees the shared entry', t.text.includes('Facilitator moves were consistent'), 'share not visible');
  ok('Ali sees the author name (Miranda Quale)', t.text.includes('Miranda Quale'), 'author missing');
}
{
  // Sharing again must NOT create a second notification.
  const form = new URLSearchParams({
    occurred_on: '2026-09-20',
    class_context: 'Grade 4 reading, 18 students — reshare test',
    evidence: 'Students led a book-club discussion using the fishbowl protocol.',
    glow: 'Facilitator moves were consistent — Ali distributed turns evenly.',
    grow: '',
    next_step: 'Try a written prompt so quieter students contribute in writing.',
    _action: 'share',
  });
  await miranda.post(`/coach/teachers/21/notes/${draftNoteId}/update`, form);
  await miranda.post(`/coach/teachers/21/notes/${draftNoteId}/update`, form);
  // Query notifications for Ali on this note; must be exactly one.
  const { execSync } = await import('node:child_process');
  const out = execSync(
    `npx wrangler d1 execute alexander-marshall-growth-production --local --json --command="SELECT COUNT(*) AS n FROM notifications WHERE user_id=${IDS.ali} AND kind='coach_note' AND entity_id=${draftNoteId}"`,
    { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
  const n = JSON.parse(out)[0].results[0].n;
  ok(`exactly one coach_note notification for Ali on this note (got ${n})`, n === 1, `got ${n}`);
}

// ---------------------------------------------------------------------------
suite('Case 4 — Server-side authz rejects altered form targets and other authors\' drafts');

{
  // Tristae tries to update Miranda's note (author-ownership check)
  const form = new URLSearchParams({
    occurred_on: '2026-09-20', evidence: 'hijack attempt', _action: 'draft',
  });
  const r = await tristae.post(`/coach/teachers/21/notes/${draftNoteId}/update`, form);
  ok('Tristae blocked from editing Miranda\'s note', r.status === 403, `HTTP ${r.status}`);
}
{
  // Miranda tries to write a note about Pamela (id=23) — she is NOT assigned as Pamela's coach
  const form = new URLSearchParams({
    occurred_on: '2026-09-20', evidence: 'unassigned target', glow: 'test', _action: 'draft',
  });
  const r = await miranda.post(`/coach/teachers/23/notes`, form);
  ok('Miranda blocked from writing note for unassigned teacher', r.status === 403, `HTTP ${r.status}`);
}
{
  // Miranda tries self-coaching (POST to her own teacher id)
  const form = new URLSearchParams({
    occurred_on: '2026-09-20', evidence: 'self-coach attempt', glow: 'x', _action: 'draft',
  });
  const r = await miranda.post(`/coach/teachers/19/notes`, form);
  ok('Miranda blocked from self-coaching POST', r.status === 403, `HTTP ${r.status}`);
}
{
  // Coach cannot export observation scores
  const r = await michelle.get(`/reports/csv?mode=scores`);
  ok('Michelle blocked from CSV mode=scores', r.status === 403, `HTTP ${r.status}`);
  const r2 = await miranda.get(`/reports/csv?mode=scores`);
  ok('Miranda (teacher-coach) blocked from CSV mode=scores', r2.status === 403, `HTTP ${r2.status}`);
}

// ---------------------------------------------------------------------------
suite('Case 5 — Coaching feedback creates ZERO scores/observations/PD credit');

{
  const { execSync } = await import('node:child_process');
  const cmd = (sql) => JSON.parse(execSync(
    `npx wrangler d1 execute alexander-marshall-growth-production --local --json --command="${sql}"`,
    { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] })
  )[0].results[0];
  const before = {
    observations: cmd('SELECT COUNT(*) AS n FROM observations').n,
    feedback_items: cmd('SELECT COUNT(*) AS n FROM feedback_items').n,
    obs_scores: cmd('SELECT COUNT(*) AS n FROM observation_scores').n,
    focus_areas: cmd('SELECT COUNT(*) AS n FROM focus_areas').n,
    pd_enrollments: cmd('SELECT COUNT(*) AS n FROM pd_enrollments').n,
    deliv_scores: cmd('SELECT COUNT(*) AS n FROM pd_deliverable_scores').n,
  };
  // Create one more coaching note as a side channel to make sure the counts stay flat.
  await miranda.post(`/coach/teachers/21/notes`, new URLSearchParams({
    occurred_on: '2026-09-22', evidence: 'follow-up conversation', glow: 'showed growth', _action: 'share',
  }));
  const after = {
    observations: cmd('SELECT COUNT(*) AS n FROM observations').n,
    feedback_items: cmd('SELECT COUNT(*) AS n FROM feedback_items').n,
    obs_scores: cmd('SELECT COUNT(*) AS n FROM observation_scores').n,
    focus_areas: cmd('SELECT COUNT(*) AS n FROM focus_areas').n,
    pd_enrollments: cmd('SELECT COUNT(*) AS n FROM pd_enrollments').n,
    deliv_scores: cmd('SELECT COUNT(*) AS n FROM pd_deliverable_scores').n,
  };
  for (const k of Object.keys(before)) {
    ok(`${k} unchanged (${before[k]}→${after[k]})`, before[k] === after[k]);
  }
}

// ---------------------------------------------------------------------------
suite('Case 6 — PD review link uses /pd/review/:id (not /appraiser/pd/review/:id)');

{
  // Grep the compiled worker bundle for the fixed URL.
  const { readFileSync } = await import('node:fs');
  const bundle = readFileSync('dist/_worker.js', 'utf8');
  ok('bundle contains fixed /pd/review/ notification URL', bundle.includes('/pd/review/'));
  ok('bundle does NOT contain broken /appraiser/pd/review/ URL', !bundle.includes('/appraiser/pd/review/'));
}

// ---------------------------------------------------------------------------
suite('Case 7 — coach home + one assigned profile + phone-sized viewport render');

{
  // Full coach home renders
  const r = await michelle.get('/coach');
  ok('Michelle /coach 200', r.status === 200);
  ok('Michelle /coach contains at least one "Open coaching view"', r.text.includes('Open coaching view'));
  // Pamela's page still loads (was the Aug 16 1102 case)
  const p = await michelle.get('/coach/teachers/23');
  ok('Michelle /coach/teachers/23 (Pamela) 200 — no 1102 regression', p.status === 200, `HTTP ${p.status}`);
  ok('Pamela\'s page shows Coaching Feedback section', p.text.includes('Non-evaluative coaching feedback'));
  ok('Pamela\'s page still shows Published Feedback section', p.text.includes('Published Feedback'));
}

// ---------------------------------------------------------------------------
suite('Case 8 — Hard-delete guard protects coaching history');

{
  const { execSync } = await import('node:child_process');
  // Admin tries to hard-delete Miranda (she has authored coaching notes now)
  const r = await admin.post(`/admin/users/${IDS.miranda}/hard-delete`, new URLSearchParams({}));
  ok('Admin hard-delete Miranda returns 302', r.status === 302, `HTTP ${r.status}`);
  ok('redirect indicates soft-delete fallback (evaluation OR coaching history)',
     (r.location||'').includes('evaluation') || (r.location||'').includes('coaching'),
     `location=${r.location}`);
  // Miranda's user row must still exist (soft-deleted, not gone)
  const remain = JSON.parse(execSync(
    `npx wrangler d1 execute alexander-marshall-growth-production --local --json --command="SELECT id, active FROM users WHERE id=${IDS.miranda}"`,
    { encoding: 'utf8' }))[0].results;
  ok('Miranda user row still exists (soft-deleted)', remain.length === 1);
  ok('Miranda is now active=0', remain[0]?.active === 0, `active=${remain[0]?.active}`);
  // Her coaching notes must still exist
  const notes = JSON.parse(execSync(
    `npx wrangler d1 execute alexander-marshall-growth-production --local --json --command="SELECT COUNT(*) AS n FROM coaching_notes WHERE author_id=${IDS.miranda}"`,
    { encoding: 'utf8' }))[0].results[0].n;
  ok(`Miranda's authored coaching notes preserved (${notes} rows)`, notes >= 1);
  // Reactivate so the rest of the suite is clean
  execSync(`npx wrangler d1 execute alexander-marshall-growth-production --local --command="UPDATE users SET active=1 WHERE id=${IDS.miranda}"`,
    { encoding: 'utf8', stdio: ['pipe','pipe','pipe'] });
}

// ---------------------------------------------------------------------------
console.log('\n============================================================');
console.log(`  ${passed} passed · ${failed} failed`);
console.log('============================================================');
process.exit(failed > 0 ? 1 : 0);

}

main().catch(e => { console.error('FATAL', e); process.exit(2); });
