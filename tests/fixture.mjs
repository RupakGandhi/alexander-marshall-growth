#!/usr/bin/env node
/**
 * Synthetic acceptance fixture — Sept 23, 2026.
 *
 * ChatGPT (correctly) flagged that our earlier acceptance suite ran against
 * a restore of the PRODUCTION D1 snapshot.  That's the wrong test bed:
 *   - it made the tests brittle to real-world data drift
 *   - it commingled the protected production backup with the test flow
 *
 * This script rebuilds the LOCAL wrangler D1 with a hand-crafted synthetic
 * fixture that contains ONLY the minimum entities the acceptance suite needs:
 *
 *   * 1 district, 2 schools, current school year
 *   * 1 super_admin, 1 principal (appraiser), 1 pure coach, 3 teacher-coaches,
 *     4 plain teachers, 1 teacher who is NOT a coach (for negative tests)
 *   * assignments that give:
 *       - PureCoach → three teachers (Alice, Bob, Carol)
 *       - CoachOne → Alice + Bob   (overlaps PureCoach on Alice)
 *       - CoachTwo → Bob + Dan     (overlaps PureCoach on Bob)
 *       - Principal → all six teachers (appraiser relationship)
 *   * one seeded observation on Alice by Principal (published) with a
 *     numeric score + feedback body so reports/PD tests have data
 *   * one seeded pd_enrollment for Bob (Level-2 source_score_level) so
 *     the source_score_level leak checks have a row to grep for
 *   * seeded rubric criteria row so pd_deliverable_scores queries don't
 *     404 (kept minimal — one criterion)
 *
 * All test passwords: 'TestPass1!' (synthetic; NEVER used in production).
 *
 * The wrangler local D1 is at .wrangler/state/v3/d1/<db-id>/db.sqlite;
 * we open it directly via better-sqlite3 for speed and to avoid shelling
 * wrangler d1 execute in tight loops (that was the socket-flake root cause
 * of the previous acceptance run).
 *
 * Usage:
 *   node tests/fixture.mjs         # rebuild fixture
 *   node tests/fixture.mjs --path  # print DB path only
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';

// ---- locate the wrangler local D1 file ------------------------------------
function localDbPath() {
  const stateDir = resolve('.wrangler/state/v3/d1');
  // wrangler stores each D1 as .wrangler/state/v3/d1/miniflare-D1DatabaseObject/<id>.sqlite
  // but the exact layout changes across wrangler versions.  Walk the tree
  // and return the first .sqlite that isn't a WAL/shm sidecar.
  if (!existsSync(stateDir)) throw new Error(`local D1 dir not found: ${stateDir} — run \`npx wrangler d1 execute alexander-marshall-growth-production --local --command "SELECT 1"\` once to create it`);
  const walk = (dir) => {
    const out = [];
    for (const name of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, name.name);
      if (name.isDirectory()) out.push(...walk(full));
      else if (name.name.endsWith('.sqlite')) out.push(full);
    }
    return out;
  };
  const files = walk(stateDir);
  if (!files.length) throw new Error(`no .sqlite found under ${stateDir}`);
  return files[0];
}

if (process.argv.includes('--path')) {
  console.log(localDbPath());
  process.exit(0);
}

// ---- open the DB with FKs on ---------------------------------------------
const dbPath = localDbPath();
console.log('rebuilding synthetic fixture in', dbPath);
const db = new Database(dbPath);
db.pragma('foreign_keys = ON');

// ---- WIPE only the tables our test touches; leave migration state alone ---
// Order matters (FK-safe teardown).
const wipeTables = [
  'coaching_note_share_delivery',  // migration 0014 — must wipe before coaching_notes (FK dependency)
  'coaching_note_audit', 'coaching_notes',
  'notifications', 'notification_preferences', 'push_subscriptions',
  'pd_deliverable_scores', 'pd_deliverables', 'pd_reflections',
  'pd_enrollments', 'pd_plan_items', 'pd_plans',
  'external_pd_submissions',
  'observation_scores', 'feedback_items', 'focus_areas', 'observations',
  'teacher_goals',
  'assignments', 'user_schools', 'user_settings', 'sessions',
  'activity_log', 'admin_audit_log',
  'users', 'schools',
  'school_years', 'districts',
];
// Turn FKs OFF for the wipe so we can delete tables in any order (parent
// tables like districts still have children in other tables until we're done).
// Reactivated below before the seed phase.
db.pragma('foreign_keys = OFF');
db.exec('BEGIN');
try {
  for (const t of wipeTables) {
    try { db.exec(`DELETE FROM ${t}`); } catch (e) { /* table may not exist */ }
  }
  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK'); throw e;
}
db.pragma('foreign_keys = ON');

// ---- reseed with just what tests need -------------------------------------
const PW = 'TestPass1!';
const hash = bcrypt.hashSync(PW, 4); // fast rounds for tests only
const now = new Date().toISOString().replace('T',' ').slice(0,19);

db.exec('BEGIN');
try {
  db.prepare(`INSERT INTO districts (id, name) VALUES (?, ?)`).run(1, 'Test District');
  db.prepare(`INSERT INTO schools (id, district_id, name) VALUES (?, ?, ?)`).run(1, 1, 'Test Elementary');
  db.prepare(`INSERT INTO schools (id, district_id, name) VALUES (?, ?, ?)`).run(2, 1, 'Test Junior/Senior High');
  db.prepare(`INSERT INTO school_years (id, district_id, label, start_date, end_date, is_current)
              VALUES (?, ?, ?, ?, ?, ?)`)
    .run(1, 1, '2025–2026', '2025-08-01', '2026-06-30', 1);

  const insertUser = db.prepare(
    `INSERT INTO users
       (id, district_id, school_id, email, password_hash, first_name, last_name, role,
        active, must_change_password, can_coach)
     VALUES (?, 1, ?, ?, ?, ?, ?, ?, 1, 0, ?)`);

  // IDs are stable so tests can reference them by literal.
  //   1 super_admin, 2 principal (appraiser),
  //   3 PureCoach (role='coach'),
  //   4 CoachOne (role='teacher', can_coach=1),
  //   5 CoachTwo (role='teacher', can_coach=1),
  //   6 CoachThree (role='teacher', can_coach=1) — not used in most tests, kept for future,
  //   10 Alice, 11 Bob, 12 Carol, 13 Dan, 14 PlainTeacher
  //   20 UnrelatedTeacher (for negative tests)
  insertUser.run(1,  null, 'admin@test',       hash, 'Test',   'Admin',           'super_admin',   0);
  insertUser.run(2,  1,    'principal@test',   hash, 'Peggy',  'Principal',       'appraiser',     0);
  insertUser.run(3,  1,    'pure.coach@test',  hash, 'Pure',   'Coach',           'coach',         0);
  insertUser.run(4,  1,    'coach1@test',      hash, 'CoachOne','Combined',       'teacher',       1);
  insertUser.run(5,  1,    'coach2@test',      hash, 'CoachTwo','Combined',       'teacher',       1);
  insertUser.run(6,  1,    'coach3@test',      hash, 'CoachThree','Combined',     'teacher',       1);
  insertUser.run(10, 1,    'alice@test',       hash, 'Alice',  'Anders',          'teacher',       0);
  insertUser.run(11, 1,    'bob@test',         hash, 'Bob',    'Bell',            'teacher',       0);
  insertUser.run(12, 1,    'carol@test',       hash, 'Carol',  'Cooper',          'teacher',       0);
  insertUser.run(13, 1,    'dan@test',         hash, 'Dan',    'Diaz',            'teacher',       0);
  insertUser.run(14, 1,    'plain@test',       hash, 'Plain',  'Teacher',         'teacher',       0);
  insertUser.run(20, 2,    'unrelated@test',   hash, 'Unrel',  'Ated',            'teacher',       0);

  const insertAssn = db.prepare(
    `INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
     VALUES (?, ?, ?, 1, 1)`);
  // Principal → all six teachers
  for (const t of [10,11,12,13,14,20]) insertAssn.run(t, 2, 'appraiser');
  // PureCoach → Alice, Bob, Carol
  for (const t of [10,11,12]) insertAssn.run(t, 3, 'coach');
  // CoachOne → Alice + Bob (overlaps PureCoach on both)
  for (const t of [10,11]) insertAssn.run(t, 4, 'coach');
  // CoachTwo → Bob + Dan (overlaps PureCoach on Bob only)
  for (const t of [11,13]) insertAssn.run(t, 5, 'coach');
  // CoachThree → no assignments yet (to prove revocation cases render nothing)

  // Seed one observation on Alice by Principal, published+acknowledged.
  // framework_id defaults to the seeded framework left untouched by the wipe.
  const fw = db.prepare(`SELECT id FROM frameworks WHERE is_active=1 LIMIT 1`).get();
  db.prepare(`INSERT INTO observations
    (id, teacher_id, appraiser_id, school_year_id, framework_id, observation_type, class_context,
     subject, grade_level, observed_at, status, scripted_notes, overall_summary,
     published_at, teacher_acknowledged_at, created_at, updated_at)
    VALUES (100, 10, 2, 1, ?, 'formal', 'Mini test observation', 'Reading', '4', ?, 'published',
      'notes body', 'summary body', ?, ?, ?, ?)`)
    .run(fw.id, now, now, now, now, now);

  // C5a (Sept 23 correction) — seed a TEACHER-COACH (CoachOne, id 4) with
  // authentic teaching history so the acceptance suite can verify those
  // values remain unchanged when she starts coaching.  We give CoachOne:
  //   * observation 101 authored by Principal, published + acknowledged
  //   * one observation_score row (so scored_indicators > 0)
  //   * one feedback_item so her Prose-rendered feedback loads
  //   * pd_enrollment 201 verified with 3.5 credited hours
  const indicator = db.prepare(
    `SELECT id FROM framework_indicators ORDER BY sort_order LIMIT 1`
  ).get();
  if (indicator) {
    db.prepare(`INSERT INTO observations
      (id, teacher_id, appraiser_id, school_year_id, framework_id, observation_type, class_context,
       subject, grade_level, observed_at, status, scripted_notes, overall_summary,
       published_at, teacher_acknowledged_at, created_at, updated_at)
      VALUES (101, 4, 2, 1, ?, 'formal', 'CoachOne classroom, pre-coach', 'ELA', '3', ?, 'acknowledged',
        'CoachOne notes', 'CoachOne summary', ?, ?, ?, ?)`)
      .run(fw.id, now, now, now, now, now);
    db.prepare(`INSERT INTO observation_scores
      (observation_id, indicator_id, level, evidence_note, created_at, updated_at)
      VALUES (101, ?, 3, 'CoachOne evidence', ?, ?)`).run(indicator.id, now, now);
    db.prepare(`INSERT INTO feedback_items
      (observation_id, indicator_id, category, title, body, sort_order, source, created_at)
      VALUES (101, ?, 'glow', 'CoachOne strength', 'CoachOne baseline feedback body', 0, 'appraiser', ?)`)
      .run(indicator.id, now);
  }

  // pd_enrollment for Bob with source_score_level=2 so R6b tests can grep.
  const mod = db.prepare(`SELECT id FROM pd_modules LIMIT 1`).get();
  if (mod) {
    db.prepare(`INSERT INTO pd_enrollments
      (id, teacher_id, module_id, source, status, source_score_level, created_at, updated_at)
      VALUES (200, 11, ?, 'auto', 'started', 2, ?, ?)`).run(mod.id, now, now);
    // CoachOne's OWN verified PD enrollment with credited hours.  The real
    // column is pd_enrollments.hours_credited (set by verifyDeliverable when
    // the appraiser approves with credit).  Tests read this back and assert
    // it is unchanged after any coaching activity.
    db.prepare(`INSERT INTO pd_enrollments
      (id, teacher_id, module_id, source, status, hours_credited, credited_at, credited_by_user_id,
       verified_at, verified_by, created_at, updated_at)
      VALUES (201, 4, ?, 'self', 'verified', 3.5, ?, 2, ?, 2, ?, ?)`)
      .run(mod.id, now, now, now, now);
  }

  db.exec('COMMIT');
} catch (e) {
  db.exec('ROLLBACK'); throw e;
}

const summary = {
  users: db.prepare('SELECT COUNT(*) AS n FROM users').get().n,
  assignments: db.prepare('SELECT COUNT(*) AS n FROM assignments').get().n,
  observations: db.prepare('SELECT COUNT(*) AS n FROM observations').get().n,
  pd_enrollments: db.prepare('SELECT COUNT(*) AS n FROM pd_enrollments').get().n,
};
console.log('fixture seeded:', JSON.stringify(summary));
db.close();
