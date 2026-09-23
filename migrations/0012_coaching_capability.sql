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
-- Rollback policy (NON-DESTRUCTIVE, no DROP).  Coaching notes authored after
-- launch are real teacher-visible feedback that MUST be preserved through
-- any rollback.  The runbook is:
--
--   Step 1.  Deploy a PATCH release (a commit on the same branch, or an
--            explicit revert on `main` that PRESERVES the delete guard in
--            src/routes/admin.tsx that references coaching_notes) — but
--            NEVER a plain revert of the initial feature commit, because
--            that revert would remove the guard and let a hard-delete of
--            a user with authored/received coaching notes fail on a
--            foreign-key error partway through the cascade cleanup, or
--            (worse) succeed and cascade-delete real notes.
--
--            Approved rollback artifact must include a guard that either:
--              (a) keeps the coaching_notes anchor check in the hard-delete
--                  handler, so accounts with retained history follow the
--                  soft-delete path exactly as they do now, OR
--              (b) if the delete-guard code cannot be kept, temporarily
--                  disables the hard-delete endpoint entirely.  Users
--                  who have to be removed during the rollback window
--                  are deactivated (active=0) instead of hard-deleted.
--
--   Step 2.  Only reset can_coach for the users we actually changed here.
--            NEVER run `UPDATE users SET can_coach=0` unconditionally —
--            that clobbers rows that were never part of this deployment.
--            The correct disable command is:
--
--                UPDATE users SET can_coach = 0
--                 WHERE id IN (13, 19);       -- the two users touched by the launch
--
--            (or the id list from the applied caseload change set, whichever
--            is broader.)  Any other user's can_coach stays at whatever the
--            operator or a separate change set left it at.
--
--   Step 3.  LEAVE the tables coaching_notes and coaching_note_audit and
--            the column users.can_coach in place.  The rolled-back
--            application code will not read from them, but the historical
--            rows are preserved so any future re-launch can display them
--            immediately without a data-recovery step.
--
-- We deliberately DO NOT include DROP TABLE or DROP COLUMN statements in
-- this file or in the rollback runbook.  Any operator who genuinely needs
-- to purge coaching content (which is data loss) must explicitly take a
-- separate backup and execute the drops as a distinct, approved change —
-- and even then the correct sequence is backup → export → drops, not the
-- reverse.
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
