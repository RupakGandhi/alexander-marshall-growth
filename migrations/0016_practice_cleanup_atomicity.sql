-- ============================================================================
-- 0016 — Practice-cleanup atomicity, per-child ownership, delivery-history
--        preservation, preview-scope binding, and F7 historical-ambiguous
--        notification tracking.
-- ----------------------------------------------------------------------------
-- Follow-up to 0015.  Second review (Sept 24, 2026) surfaced five defects
-- that this migration + the accompanying src/lib/practice_cleanup.ts rewrite
-- correct together.  This file is the SCHEMA half; the code half enforces
-- the invariants.
--
--   F3 — Atomicity.  executeCleanup() ran ~15-20 separate .run() calls per
--        parent record.  An injected mid-batch failure left the batch stuck
--        at status='preview', the audit rows soft-deleted, the note active,
--        and the delivery ledger already hard-deleted.  restoreBatch()
--        refused a 'preview' batch, so nothing could be recovered.
--
--        FIX (code): wrap every per-parent cascade in db.batch([...]) so
--        SQLite runs the whole cascade in a single transaction.  Flip the
--        batch to 'executed' in the SAME statement group so it is
--        transactionally consistent with the row writes.
--
--        FIX (schema, this file): add batch.writer_nonce TEXT so the flip
--        step is idempotent — a retry against a batch that already flipped
--        can prove ownership and skip.  Also add batch.candidate_snapshot_
--        json so we retain the exact scope reviewed at preview time even
--        after execution, for support review.
--
--   F4 — Per-child ownership.  The v0015 practice_cleanup_row only stored
--        (batch_id, entity_type, entity_id) for PARENT records.  restore
--        did blanket "UPDATE ... SET deleted_at=NULL WHERE parent_id=?",
--        which revives child rows that were deleted BEFORE this batch ever
--        ran (e.g. a deliverable an admin soft-deleted a week earlier).
--
--        FIX (schema, this file): new practice_cleanup_child table records
--        ONE row per child row this batch actually soft-deleted, capturing
--        its prior_deleted_at (which is always NULL when the batch was the
--        deleter — the code only inserts the child manifest row after a
--        SELECT confirms deleted_at was NULL, then a WHERE-guarded UPDATE
--        soft-deletes it; both are in the same db.batch()).  Restore only
--        clears deleted_at for rows in practice_cleanup_child, and only
--        for those whose prior_deleted_at is NULL.
--
--        This means a previously-deleted child is NOT tracked and NOT
--        touched by restore.  Overlapping batches also work correctly:
--        each row is owned by exactly one batch's manifest, so restoring
--        batch A does not resurrect a child that batch B later re-deleted.
--
--   F5 — Delivery-history preservation.  The old code hard-deleted the
--        coaching_note_share_delivery ledger during cleanup.  A subsequent
--        restore then reported the shared note as "never delivered",
--        exposed a Resend button, and (if clicked) would fire a duplicate
--        first-share alert.
--
--        FIX (code): change the ledger cascade from DELETE to a soft-
--        delete UPDATE (the deleted_at column already exists from 0015).
--        Add the ledger rows to practice_cleanup_child so restore un-
--        soft-deletes them — the delivered/suppressed/failed status flag
--        is preserved verbatim.  Coach-view reads that treat a soft-
--        deleted ledger row as "never" during the cleanup window are
--        acceptable because the parent note is also invisible during that
--        window; on restore both come back with their pre-cleanup state.
--
--        No schema change needed for F5 beyond the child manifest above.
--        We also add ledger reads in coach.tsx that filter deleted_at IS
--        NULL for the same reason.  Notifications-table rows are still
--        hard-deleted (the inbox is user-facing state; restoring stale
--        alerts would be surprising) — that intentional gap is disclosed
--        on the results screen and does NOT falsely report failed
--        delivery: the ledger becomes the source of truth again after
--        restore and correctly says 'delivered'.
--
--   F6 — Scope-binding on confirm.  The v0015 /execute endpoint re-read
--        listPracticeCandidates() at execute-time.  A second tab tagging
--        record B AFTER the admin reviewed A could ride the confirm and
--        get both cleaned.
--
--        FIX (schema, this file): the batch is now created at PREVIEW
--        time (not execute time) with status='preview', the reviewed
--        scope frozen in practice_cleanup_row, and its members re-shown
--        on the confirm screen for the admin to inspect.  The /execute
--        endpoint takes an explicit batch_id, checks that the currently-
--        tagged is_practice=1 set MATCHES the reviewed batch's manifest,
--        and refuses to run if the sets differ (redirect back to a
--        refreshed preview).  This is a two-phase commit.
--
--        Also add practice_cleanup_batches.scope_hash TEXT — a stable
--        SHA-like fingerprint of the reviewed manifest (entity_type +
--        entity_id sorted list joined by ';').  Execute compares against
--        a freshly computed hash of the currently-tagged set.  If they
--        disagree, execute rejects with 'scope_changed'.
--
--   F7 — Historical ambiguous PD notifications.  The old auto-enroll
--        code stored notifications with entity_type='pd_enrollment' but
--        entity_id=module_id (not enrollment_id).  Cleaning up a practice
--        enrollment now could either miss a real practice notification
--        or delete an unrelated notification whose entity_id happened to
--        equal a pd_modules.id.
--
--        FIX (code): the auto-enroll path is already corrected in
--        src/lib/pd.ts (this branch).  For HISTORICAL rows that were
--        written under the old bug, we conservatively DETECT and do NOT
--        automatically delete.  Detection: entity_type='pd_enrollment'
--        AND entity_id does NOT EXIST in pd_enrollments but DOES EXIST
--        in pd_modules.  We surface those to the admin via a new
--        practice_cleanup_ambiguous_notif table, populated at execute
--        time for any candidate whose cascade found ambiguity.  The
--        admin can inspect them on the results screen and delete
--        individually.  No blind cleanup, no false positives.
--
-- Rollback: fully additive.  Reverting the app removes the new columns/
-- tables' usage; the columns/tables sit unused but do not corrupt existing
-- data.  The v0015 workflow continues to function against the pre-existing
-- practice_cleanup_batches + practice_cleanup_row without needing the
-- fields added here.  New batches created by the new code fully populate
-- everything below; old batches (if any) have NULL/empty new fields and
-- keep behaving under their original semantics.
-- ============================================================================

-- --- (A) practice_cleanup_batches — new columns for F3, F6 -----------------
--
-- writer_nonce: idempotence token for the 'executed' flip step.  Set at
-- preview creation, cleared on successful execute.  A retry against the
-- same batch id checks the nonce to know whether it already ran.
--
-- scope_hash: fingerprint of the reviewed scope (see F6 above).  Set at
-- preview time; execute recomputes it against the current is_practice=1
-- set and refuses when they differ.
--
-- candidate_snapshot_json: full serialised preview scope (labels + dep
-- counts) so the results screen can render the "reviewed" set even after
-- rows changed / were untagged / another admin overrode.

ALTER TABLE practice_cleanup_batches ADD COLUMN writer_nonce TEXT;
ALTER TABLE practice_cleanup_batches ADD COLUMN scope_hash TEXT;
ALTER TABLE practice_cleanup_batches ADD COLUMN candidate_snapshot_json TEXT;

-- --- (B) practice_cleanup_row — new column for F4 --------------------------
--
-- prior_deleted_at: the deleted_at value the PARENT row had immediately
-- before this batch's UPDATE.  If NULL, the batch is the deleter (restore
-- should un-soft-delete).  If NOT NULL, the parent was already soft-deleted
-- by someone else — restore leaves it alone.

ALTER TABLE practice_cleanup_row ADD COLUMN prior_deleted_at TEXT;

-- --- (C) practice_cleanup_child — per-child manifest (F4, F5) ---------------
--
-- One row per CHILD record this batch actually soft-deleted.  Captures the
-- prior state so restore can distinguish "this batch's soft-delete" (undo it)
-- from "someone else's soft-delete" (leave it alone).
--
-- child_kind covers every cascade dependent:
--   'coaching_note_audit', 'coaching_note_share_delivery',
--   'pd_deliverable',      'pd_reflection', 'pd_deliverable_score',
--   'feedback_item',       'focus_area'.
--
-- UNIQUE(batch_id, child_kind, child_id) prevents double-counting; a
-- given ledger row can only be soft-deleted once per batch.

CREATE TABLE IF NOT EXISTS practice_cleanup_child (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id          INTEGER NOT NULL REFERENCES practice_cleanup_batches(id) ON DELETE CASCADE,
  parent_entity_type TEXT NOT NULL CHECK (parent_entity_type IN (
    'coaching_note', 'pd_enrollment', 'external_pd_submission', 'observation'
  )),
  parent_entity_id  INTEGER NOT NULL,
  child_kind        TEXT NOT NULL CHECK (child_kind IN (
    'coaching_note_audit', 'coaching_note_share_delivery',
    'pd_deliverable', 'pd_reflection', 'pd_deliverable_score',
    'feedback_item',  'focus_area'
  )),
  child_id          INTEGER NOT NULL,
  prior_deleted_at  TEXT,     -- NULL means "this batch was the deleter"
  UNIQUE(batch_id, child_kind, child_id)
);
CREATE INDEX IF NOT EXISTS idx_practice_cleanup_child_batch
  ON practice_cleanup_child(batch_id);
CREATE INDEX IF NOT EXISTS idx_practice_cleanup_child_parent
  ON practice_cleanup_child(parent_entity_type, parent_entity_id);

-- --- (D) practice_cleanup_ambiguous_notif — F7 historical ambiguity --------
--
-- When executeCleanup() walks the cascade for a pd_enrollment candidate,
-- it looks for notifications keyed on entity_type='pd_enrollment' AND
-- entity_id=<enrollment_id>.  It ALSO looks for the historical-ambiguous
-- pattern: notifications with entity_type='pd_enrollment' whose entity_id
-- resolves to a pd_modules.id (not a pd_enrollments.id).  Those rows are
-- NOT deleted — they are recorded here for admin review on the results
-- screen with enough context to decide manually.
--
-- Populated at execute time.  Empty for any batch whose parents had no
-- ambiguous historical rows.  Restore does not touch these — the admin
-- had a manual decision path.

CREATE TABLE IF NOT EXISTS practice_cleanup_ambiguous_notif (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id          INTEGER NOT NULL REFERENCES practice_cleanup_batches(id) ON DELETE CASCADE,
  notification_id   INTEGER NOT NULL,
  entity_type       TEXT NOT NULL,
  entity_id         INTEGER NOT NULL,
  resolves_as       TEXT NOT NULL,       -- 'pd_module' when the id lives in pd_modules
  user_id           INTEGER,
  kind              TEXT,
  title             TEXT,
  suspected_parent_enrollment_id INTEGER,  -- our best guess (may be NULL)
  UNIQUE(batch_id, notification_id)
);
CREATE INDEX IF NOT EXISTS idx_practice_cleanup_ambiguous_batch
  ON practice_cleanup_ambiguous_notif(batch_id);
