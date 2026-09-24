-- ============================================================================
-- 0018 — Practice-cleanup hardening: winning-execution claim, exact-scope
--        enforcement including notifications/activity_log, and durable
--        counts state.
-- ----------------------------------------------------------------------------
-- Fourth-round review (Sept 24, 2026 late) reproduced three defects against
-- c7c9a23:
--
--   1. CONCURRENT EXECUTION could break restoration.  Two overlapping
--      executeCleanup() calls both ran their per-parent statements to
--      completion.  The loser's UPDATE on practice_cleanup_row.deleted_at_stamp
--      lacked a "only if not already stamped" guard, so it overwrote the
--      winner's stamp with a different timestamp.  Restore then compared
--      the parent's actual deleted_at (winner's stamp) against the
--      manifest's stamp (loser's stamp) — mismatch — and left the parent
--      soft-deleted while restoring the children.
--
--      FIX (schema, this file): new table practice_cleanup_execution_lock
--      with PRIMARY KEY on batch_id.  The FIRST statement of the execute
--      batch INSERTs a row.  A duplicate concurrent execute hits the
--      PRIMARY KEY constraint, the whole db.batch() rolls back, and no
--      manifest damage is possible.
--
--      FIX (code): manifest stamp UPDATE also carries "AND deleted_at_stamp
--      IS NULL" as belt-and-suspenders.  Successful restore DELETEs the
--      execution_lock row so a future re-execute (only possible via
--      abandon+re-preview) can proceed.
--
--   2. SCOPE EXPANSION.  scope + dep fingerprints were checked BEFORE the
--      transaction.  A child (deliverable/reflection/etc.) added between
--      that check and the batch's INSERT...SELECT was silently captured
--      AND deleted — outside the reviewed scope.  Notifications and
--      activity_log rows were also entirely absent from the fingerprint,
--      so any notification added after preview was permanently deleted
--      without another review.
--
--      FIX (schema, this file): practice_cleanup_child rows are populated
--      at PREVIEW time (not execute time).  The execute batch then does
--      "UPDATE ... SET deleted_at=? WHERE id IN (SELECT child_id FROM
--      practice_cleanup_child WHERE batch_id=? AND child_kind=?)" — this
--      restricts deletion to the frozen scope, and a late-added child is
--      NOT touched.
--
--      New table practice_cleanup_notif_scope holds the notification and
--      activity_log ids the preview would delete.  The execute batch's
--      DELETE uses "WHERE id IN (SELECT scope_id FROM practice_cleanup_
--      notif_scope WHERE batch_id=? AND scope_kind=? AND action='delete')".
--      A late-added notification is not in this table and survives.
--
--      dep_fingerprint on practice_cleanup_batches now also incorporates
--      the notification + activity_log ids (so drift shows the admin
--      exactly what changed at scope-diff time).
--
--   3. COUNTS-BACKFILL FAILURE broke the results page.  Batch committed,
--      counts UPDATE afterwards failed, batch retained affected_counts_
--      json='__pending__', results page's unconditional JSON.parse threw
--      and blocked restoration UI.
--
--      FIX (schema, this file): no new columns needed — the '__pending__'
--      sentinel is handled by loadBatch (self-healing recompute from the
--      manifest) and by the results page (renders counts from the
--      manifest whenever affected_counts_json is missing/sentinel).
--      executeCleanup no longer throws on backfill failure — the cleanup
--      was already committed, so a failure to write the report has no
--      effect on correctness.
--
-- Rollback: fully additive.  New tables + columns are inert if the app
-- reverts.  Older 0015/0016/0017-shaped batches continue to work under
-- their original semantics.
-- ============================================================================

-- --- (A) practice_cleanup_execution_lock — one-winner guard ---------------
--
-- PRIMARY KEY(batch_id) guarantees that only ONE executeCleanup() can
-- ever run the actual write batch for a given batch_id.  A duplicate
-- concurrent execute hits the PRIMARY KEY on INSERT, the entire db.batch()
-- rolls back, and neither the parent, children, notifications, nor the
-- manifest are mutated by the loser.

CREATE TABLE IF NOT EXISTS practice_cleanup_execution_lock (
  batch_id     INTEGER PRIMARY KEY REFERENCES practice_cleanup_batches(id) ON DELETE CASCADE,
  acquired_at  TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- --- (B) practice_cleanup_notif_scope — frozen delete scope for
--         notifications and activity_log rows ------------------------------
--
-- Populated at PREVIEW time.  Execute's DELETE only touches ids in this
-- table.  A late-added notification/activity_log row for the same
-- entity_id is NOT in the reviewed scope and survives cleanup.  Admins
-- can see the exact list on the results screen.
--
-- scope_kind ∈ ('notification', 'activity_log').
-- action     — always 'delete' today; kept as a column so a future
--              'preserve' behavior can be added without a schema change.

CREATE TABLE IF NOT EXISTS practice_cleanup_notif_scope (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id       INTEGER NOT NULL REFERENCES practice_cleanup_batches(id) ON DELETE CASCADE,
  parent_entity_type TEXT NOT NULL,
  parent_entity_id   INTEGER NOT NULL,
  scope_kind     TEXT NOT NULL CHECK (scope_kind IN ('notification','activity_log')),
  scope_id       INTEGER NOT NULL,
  action         TEXT NOT NULL DEFAULT 'delete' CHECK (action IN ('delete')),
  UNIQUE(batch_id, scope_kind, scope_id)
);
CREATE INDEX IF NOT EXISTS idx_practice_cleanup_notif_scope_batch
  ON practice_cleanup_notif_scope(batch_id);
CREATE INDEX IF NOT EXISTS idx_practice_cleanup_notif_scope_parent
  ON practice_cleanup_notif_scope(parent_entity_type, parent_entity_id);
