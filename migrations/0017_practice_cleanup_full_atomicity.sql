-- ============================================================================
-- 0017 — Practice-cleanup FULL atomicity, exact-scope binding,
--        concurrent-execution guard, and ambiguous-notification collision
--        handling.
-- ----------------------------------------------------------------------------
-- Third-round review (Sept 24, 2026 evening) found five defects that the
-- 0016 revision did not fully close.  This migration is the SCHEMA half of
-- the correction; src/lib/practice_cleanup.ts and src/routes/appraiser.tsx
-- carry the code half.
--
--   1. FULL-BATCH ATOMICITY.  0016 wrapped each parent's cascade in its own
--      db.batch() and did the status='executed' flip in a separate UPDATE.
--      A failure on the second parent's batch left the first parent soft-
--      deleted, the batch stuck at 'preview' (so restore refused), and a
--      retry rejected with scope_changed.  A failure on the final status
--      flip caused the same problem even with a single parent.
--
--      FIX (code): a SINGLE db.batch() call carries every write for every
--      parent AND the final status-flip UPDATE.  D1 runs the entire batch
--      as one implicit BEGIN/COMMIT — any failure rolls back every write.
--      No schema change is required for this, but we bound the batch size:
--      the code refuses previews larger than PRACTICE_CLEANUP_MAX_BATCH
--      rows (default 200) BEFORE writing anything, which keeps a runaway
--      preview from producing a batch too large for SQLite to run.
--
--   2. EXACT-SCOPE BINDING.  0016's scope_hash only fingerprinted PARENT
--      ids.  A child added between preview and execute would be gathered
--      by the pre-transaction SELECT that fed cleanupOneParent but was
--      not part of the fingerprint, so drift went undetected.  A broader
--      relationship-based UPDATE (WHERE enrollment_id=?) also targeted
--      children that appeared AFTER the collection SELECT, which then
--      never entered the restore manifest.
--
--      FIX (schema, this file): add practice_cleanup_batches.dep_fingerprint
--      TEXT — a fingerprint over the child-row ids for every parent in the
--      preview.  Execute recomputes the dep_fingerprint (INSIDE the
--      transaction, from freshly-read data) and refuses to run if it
--      differs from the preview.
--
--      FIX (code): child manifest inserts happen via INSERT INTO
--      practice_cleanup_child ... SELECT id FROM <child_table>
--      WHERE ... AND deleted_at IS NULL — same rows the follow-up UPDATE
--      soft-deletes, both statements inside the same batch/transaction.
--      A child added mid-batch is either caught by the INSERT ... SELECT
--      and cleaned + manifested (correct), OR appears after the SELECT
--      committed and remains untouched (also correct, because the UPDATE
--      target set is captured by SQLite at statement-execution time — but
--      the follow-up SELECT for the dep_fingerprint recheck would catch
--      the drift on the NEXT execute attempt).
--
--   3. CONCURRENT-EXECUTION OWNERSHIP.  0016 allowed two admins to
--      preview the same tagged parent record concurrently — both would
--      get preview batches, and only one could execute successfully, but
--      the loser's batch would sit forever with a dep-drift note that
--      was ambiguous about WHY (the row was already cleaned by the
--      winner, not by a subsequent tag).  Worse: restoring an older
--      batch could resurrect records that a newer cleanup had since
--      re-cleaned.
--
--      FIX (schema, this file): a UNIQUE partial index on
--      practice_cleanup_row(entity_type, entity_id) filtered to open
--      preview batches only (whose parent batch has status='preview').
--      SQLite doesn't support filtered indexes with subqueries, so we
--      simulate it with a dedicated table (practice_cleanup_open_claim)
--      that holds one row per (entity_type, entity_id) currently owned
--      by an open preview batch.  UNIQUE(entity_type, entity_id)
--      enforces mutual exclusion.  previewBatch() writes to this table
--      inside the same transaction as practice_cleanup_row; the row is
--      DELETEd when the batch executes, restores, or is abandoned.
--
--      Restore ownership: 0016 already stores per-child prior_deleted_at
--      in practice_cleanup_child.  Restore only clears deleted_at where
--      that column IS NULL.  But 0016 did the parent restore purely by
--      id; if a newer cleanup batch (batch B) later re-cleaned the same
--      parent, restoring the older batch (batch A) would resurrect a
--      record batch B intended to remain soft-deleted.
--
--      FIX (code, guarded by schema below): the parent restore UPDATE
--      now checks that the parent's CURRENT deleted_at timestamp
--      matches the timestamp this batch stamped.  We add
--      practice_cleanup_row.deleted_at_stamp TEXT to record the exact
--      timestamp this batch wrote to the parent (so restore can compare
--      and refuse to touch a parent whose deleted_at was later
--      overwritten by another batch).  Same idea for the child manifest
--      via a new practice_cleanup_child.deleted_at_stamp column.
--
--   4. AMBIGUOUS-NOTIFICATION COLLISIONS.  0016's detector for historical
--      pd_enrollment notifications used the pattern:
--        entity_id NOT IN pd_enrollments AND entity_id IN pd_modules
--      This missed the DANGEROUS case where entity_id happens to equal
--      BOTH a valid enrollment_id AND a valid module_id — e.g. practice
--      enrollment #5 for teacher A on module #9, retained enrollment
--      #100 for teacher B on module #5; the teacher-B recommendation
--      alert has entity_id=5 (module id) but 5 also names a real
--      enrollment (teacher A's), so cleaning enrollment #5 hard-deleted
--      teacher B's unrelated alert.
--
--      FIX (code): the detector now preserves ANY notification whose
--      user_id belongs to a teacher OTHER than the enrollment's owner
--      OR whose entity_id happens to point at a valid pd_modules row.
--      That is: a match on notifications.user_id = pd_enrollments.teacher_id
--      is a necessary precondition for hard-delete; anything else is
--      recorded in practice_cleanup_ambiguous_notif for admin review.
--
--      No schema change is strictly required — practice_cleanup_ambiguous_notif
--      already exists from 0016 — but we add a new resolves_as value
--      'cross_teacher_collision' to the audit trail so the results
--      screen can distinguish the "wrong-teacher owner" case from the
--      "wrong-id-shape" case.
--
--   5. Stale /save endpoint.  Not a schema change — fixed in the
--      appraiser routes to filter deleted_at IS NULL on the UPDATE +
--      pre-check ownership.
--
-- Rollback: fully additive.  Reverting the app removes the new columns +
-- table's usage; the columns + table sit unused but do not corrupt
-- existing data.  Old batches (0015/0016 shape) continue to work under
-- their original semantics; new batches populate every added field.
-- ============================================================================

-- --- (A) dep_fingerprint on practice_cleanup_batches ---------------------
-- Fingerprint over the (parent -> [child_ids]) shape at preview time.
-- executeCleanup recomputes from a fresh SELECT and rejects on mismatch,
-- which catches "child added after preview" and "child removed after
-- preview" cases that scope_hash (parent-ids-only) missed.
ALTER TABLE practice_cleanup_batches ADD COLUMN dep_fingerprint TEXT;

-- --- (B) deleted_at_stamp on manifest rows --------------------------------
-- The exact CURRENT_TIMESTAMP value this batch wrote to the row's
-- deleted_at column.  Restore compares against the current deleted_at
-- and refuses to clear it if a newer batch has overwritten (the newer
-- batch's owner is the responsible party for restore).  Prevents
-- older-batch restore from resurrecting rows that a newer cleanup
-- intended to remain deleted.
ALTER TABLE practice_cleanup_row   ADD COLUMN deleted_at_stamp TEXT;
ALTER TABLE practice_cleanup_child ADD COLUMN deleted_at_stamp TEXT;

-- --- (C) practice_cleanup_open_claim --------------------------------------
-- One row per (entity_type, entity_id) currently owned by an open (not
-- yet executed, not yet abandoned) preview batch.  UNIQUE guards two
-- concurrent previews from claiming the same parent.  previewBatch()
-- inserts here inside the same transaction that writes practice_cleanup_row;
-- executeCleanup / abandon deletes the corresponding rows so the parent
-- becomes available for the next preview.
CREATE TABLE IF NOT EXISTS practice_cleanup_open_claim (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id     INTEGER NOT NULL REFERENCES practice_cleanup_batches(id) ON DELETE CASCADE,
  entity_type  TEXT NOT NULL,
  entity_id    INTEGER NOT NULL,
  claimed_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(entity_type, entity_id)
);
CREATE INDEX IF NOT EXISTS idx_practice_cleanup_open_claim_batch
  ON practice_cleanup_open_claim(batch_id);
