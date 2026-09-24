-- ============================================================================
-- 0015 — Practice-cleanup workflow support
-- ----------------------------------------------------------------------------
-- Motivation (Sept 24, 2026 review): the existing "Reset practice data" button
-- on /admin/data:
--   * only touches pd_enrollments/pd_deliverables/external_pd_submissions/
--     teacher_goals — NOT coaching_notes, coaching_note_audit, or
--     coaching_note_share_delivery, and NOT their matching notifications /
--     activity_log rows;
--   * uses soft-delete when the global flag is ON, but many read paths
--     (appraiser.tsx, coach.tsx, reports.tsx, pd.tsx list & drill-down)
--     don't filter on deleted_at, so a "soft-deleted" record still appears
--     in real workflows;
--   * has no per-record selection — it clears an entire category.
--
-- This migration is ADDITIVE and non-destructive.  It:
--   1. Adds `deleted_at TEXT` to the tables that were missing it so the
--      soft-delete story is uniform.
--   2. Adds `is_practice INTEGER NOT NULL DEFAULT 0` to the tables the
--      practice-cleanup workflow can select from.  Rows are ONLY tagged
--      is_practice=1 when an admin explicitly marks them via the new
--      review-scope UI — never by date, never by author.
--   3. Adds a `practice_cleanup_batches` table so each cleanup run gets a
--      batch id and every soft-deleted row records which batch removed it.
--      This is what makes "Undo last cleanup" work as a scoped restore.
--   4. Adds a `practice_cleanup_row` audit table listing which specific
--      records each batch marked for cleanup — the review-scope screen
--      reads this to show "you are about to remove these N records" and
--      the results screen re-reads it to confirm what actually happened.
--
-- Rollback: fully non-destructive.  Reverting the app removes the /admin/
-- data/practice-cleanup UI + endpoints and stops writing to the new columns
-- and tables.  Existing data continues to work.  The delete-guard for
-- coaching history in the hard-delete path (migration 0012 header) stays.
-- ============================================================================

-- --- (1) Missing deleted_at columns for soft-delete uniformity ------------

-- feedback_items and focus_areas were previously cascade-deleted alongside
-- observations; they had no soft-delete story of their own.  Adding
-- deleted_at means the read paths can now honor a soft-delete and the
-- practice-cleanup batch can soft-clear them without immediately breaking
-- the observation view.
ALTER TABLE feedback_items                ADD COLUMN deleted_at TEXT;
ALTER TABLE focus_areas                   ADD COLUMN deleted_at TEXT;
ALTER TABLE pd_deliverable_scores         ADD COLUMN deleted_at TEXT;
ALTER TABLE pd_reflections                ADD COLUMN deleted_at TEXT;
ALTER TABLE coaching_notes                ADD COLUMN deleted_at TEXT;
ALTER TABLE coaching_note_audit           ADD COLUMN deleted_at TEXT;
ALTER TABLE coaching_note_share_delivery  ADD COLUMN deleted_at TEXT;

-- --- (2) is_practice tag stamped ONLY by explicit admin marking -----------

-- These are the tables from which the review-scope workflow can pick
-- practice records.  Default 0 means "not practice" — existing rows and
-- future rows are safe unless an admin flags them.
ALTER TABLE coaching_notes         ADD COLUMN is_practice INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pd_enrollments         ADD COLUMN is_practice INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pd_deliverables        ADD COLUMN is_practice INTEGER NOT NULL DEFAULT 0;
ALTER TABLE external_pd_submissions ADD COLUMN is_practice INTEGER NOT NULL DEFAULT 0;
ALTER TABLE observations           ADD COLUMN is_practice INTEGER NOT NULL DEFAULT 0;

-- Fast lookups for the review-scope query ("show me every is_practice=1
-- record I could clean up now").
CREATE INDEX IF NOT EXISTS idx_coaching_notes_is_practice
  ON coaching_notes(is_practice) WHERE is_practice = 1;
CREATE INDEX IF NOT EXISTS idx_pd_enrollments_is_practice
  ON pd_enrollments(is_practice) WHERE is_practice = 1;
CREATE INDEX IF NOT EXISTS idx_observations_is_practice
  ON observations(is_practice) WHERE is_practice = 1;

-- --- (3) practice_cleanup_batches — one row per admin action ---------------

CREATE TABLE IF NOT EXISTS practice_cleanup_batches (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id          INTEGER NOT NULL REFERENCES users(id),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  -- 'preview' = the admin has staged this batch via mark; not yet executed
  -- 'executed' = the cleanup ran (rows are soft-deleted)
  -- 'restored' = a previously-executed batch was rolled back
  status            TEXT NOT NULL DEFAULT 'preview' CHECK (status IN ('preview','executed','restored')),
  -- Snapshot of counts at execute-time so the results screen shows the
  -- exact number affected by THIS batch (not the current view state).
  affected_counts_json TEXT,
  executed_at       TEXT,
  restored_at       TEXT,
  restored_by       INTEGER REFERENCES users(id),
  note              TEXT               -- optional admin-supplied description
);

-- --- (4) practice_cleanup_row — the enumerated selection --------------------
--
-- One row per (batch, entity) pair.  The review-scope screen writes these
-- when the admin marks a record for cleanup; the execute step reads them
-- to know exactly what to soft-delete; the results screen re-reads them to
-- confirm what happened; the restore step reads them to know what to
-- un-soft-delete.

CREATE TABLE IF NOT EXISTS practice_cleanup_row (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id     INTEGER NOT NULL REFERENCES practice_cleanup_batches(id) ON DELETE CASCADE,
  entity_type  TEXT NOT NULL CHECK (entity_type IN (
    'coaching_note', 'pd_enrollment', 'external_pd_submission', 'observation'
  )),
  entity_id    INTEGER NOT NULL,
  -- Optional label captured at mark-time so the results screen can display
  -- "note 47 for Alice Anders" instead of just "47".
  label        TEXT,
  UNIQUE(batch_id, entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_practice_cleanup_row_batch ON practice_cleanup_row(batch_id);
CREATE INDEX IF NOT EXISTS idx_practice_cleanup_row_entity ON practice_cleanup_row(entity_type, entity_id);
