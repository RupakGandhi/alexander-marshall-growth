-- Migration 0012 — Coaching capability for existing teachers + non-evaluative coaching feedback
--
-- Sept 23, 2026.  Aaron Allard's request via Dr. Gandhi: two current teachers
-- (Miranda Quale, Tristae Allard) plus one existing coach (Michelle Simonson)
-- form the K-12 coaching team.  Miranda and Tristae must KEEP their teacher
-- role, records, personal workspace, and hours — we only ADD a coaching
-- capability on top.
--
-- Section 3 of the change spec: a Non-evaluative coaching feedback section that
-- is DISTINCT from formal observations, evaluator feedback_items, and
-- evaluator focus_areas.  Never counts as a formal observation, never scores,
-- never triggers automatic PD.
--
-- This migration is ADDITIVE.  It does not touch users.role, existing
-- assignments, observations, feedback_items, focus_areas, PD tables, or any
-- credited hours.
--
-- Rollback policy (NON-DESTRUCTIVE).  Coaching notes authored after launch
-- are real teacher-visible feedback that MUST NOT be lost by a code rollback.
-- If we ever need to revert this change:
--
--   1. Revert the APPLICATION code to a commit that predates coach.tsx's
--      coaching-note UI.  The old code stops reading/writing coaching_notes
--      and stops treating can_coach as meaningful.  Teacher-coaches lose
--      the "My Coaching" nav, /coach access, and PD Review access — but
--      their teacher workspace, records, and hours are unchanged.
--   2. LEAVE the new tables and the users.can_coach column in place.
--      SQLite ALTER TABLE cannot drop a column without a full table rebuild
--      that would rewrite every row of users, and DROPping coaching_notes
--      would delete real feedback rows the teacher relied on.
--   3. If a future re-launch is planned, the same data becomes visible
--      again the moment the coaching UI comes back — no re-migration
--      needed.  If the rollback is permanent, an admin can hide the
--      capability with a one-line UPDATE (see below) without dropping data.
--
-- Reference commands for the rollback runbook (DO NOT RUN as part of the
-- migration itself; documented here for the operator's reference only):
--   -- disable ALL coaching-capability grants without losing history:
--   UPDATE users SET can_coach=0;
--   -- to truly purge coaching content (LAST RESORT; loses teacher-visible
--   -- feedback and audit trail; requires an explicit backup first):
--   -- DROP TABLE coaching_note_audit; DROP TABLE coaching_notes;
--
-- The forward-only nature of this rollback plan is why the migration is
-- kept strictly additive.

-- 1) The coaching capability flag itself.  Default 0 so nothing changes for
--    the 32 existing users until the admin explicitly turns it on.  Existing
--    role='coach' users continue to work unchanged (they don't need the flag).
ALTER TABLE users ADD COLUMN can_coach INTEGER NOT NULL DEFAULT 0;

-- 2) Non-evaluative coaching feedback entries.
--    - author_id  = the coaching user (either role='coach' OR role='teacher' with can_coach=1)
--    - teacher_id = the coached teacher (must have an active assignments row with relationship='coach')
--    - status     = 'draft' (author-only) or 'shared' (author + subject teacher)
--    - Only ONE notification fires when a draft first becomes shared;
--      first_shared_at guards against duplicate notifications on re-shares.
CREATE TABLE IF NOT EXISTS coaching_notes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  author_id         INTEGER NOT NULL REFERENCES users(id),
  teacher_id        INTEGER NOT NULL REFERENCES users(id),
  occurred_on       TEXT NOT NULL,        -- ISO date the conversation/observation happened
  class_context     TEXT,                 -- optional free-text ("3rd hour geometry, 22 students")
  evidence          TEXT,                 -- what the coach noticed / saw
  glow              TEXT,                 -- strengths (a strength-only entry is allowed)
  grow              TEXT,                 -- growth opportunity
  next_step         TEXT,                 -- agreed next step
  follow_up_on      TEXT,                 -- optional ISO date for a follow-up
  status            TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','shared')),
  first_shared_at   TEXT,                 -- set ONCE on first successful share; enforces one-notification-only
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (author_id <> teacher_id)         -- no self-coaching at the DB level
);

-- The two queries the app runs constantly:
--   a) "show me all notes I've authored for teacher X"     (coach view)
--   b) "show me every SHARED note anyone wrote about me"   (teacher view)
CREATE INDEX IF NOT EXISTS idx_coaching_notes_author_teacher
  ON coaching_notes (author_id, teacher_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_coaching_notes_teacher_shared
  ON coaching_notes (teacher_id, status, first_shared_at DESC);

-- 3) Audit trail so edits/shares leave a record without needing an activity_log
--    join.  We keep it narrow: which note, who acted, what happened, when.
--    Body of the change is deliberately not captured here to keep sensitive
--    coach-teacher conversation text confined to the primary table.
CREATE TABLE IF NOT EXISTS coaching_note_audit (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id       INTEGER NOT NULL REFERENCES coaching_notes(id) ON DELETE CASCADE,
  actor_id      INTEGER NOT NULL REFERENCES users(id),
  action        TEXT NOT NULL CHECK (action IN ('create','edit','share','reshare')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_coaching_note_audit_note ON coaching_note_audit (note_id, id DESC);
