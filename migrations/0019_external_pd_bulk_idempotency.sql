-- ============================================================================
-- Migration 0019 — external-PD bulk-assign idempotency
--
-- Why: independent testing of commit 63dcbad found that the bulk-assign
--   flow could produce partial saves and duplicate credit on retry.  A
--   principal who ticks 6 teachers, submits, and then hits refresh (or has
--   the browser retry a slow POST) would land TWO rows per teacher for
--   the same event — teacher #1 would show 7 hours instead of the 3.5
--   that were intended.  Same window for a double-click on the submit
--   button.
--
-- Fix strategy (the SQL half; the app-code half lives in
-- src/routes/appraiser.tsx):
--
--   1) Add external_pd_submissions.client_op_id — a stable string
--      generated per bulk-assign FORM LOAD by the browser (hidden input
--      _op_id).  The server stamps every row in a single bulk-assign
--      request with the same value.
--
--   2) Add a UNIQUE index on (reviewed_by, client_op_id, teacher_id)
--      covering only rows where client_op_id IS NOT NULL.  Semantics:
--        - A retry of the SAME bulk-assign for the SAME teacher becomes
--          a NO-OP at the SQL level (INSERT OR IGNORE returns
--          changes=0 for that row).
--        - The unique index is PARTIAL (WHERE client_op_id IS NOT NULL)
--          so it does not affect the many existing external_pd_submissions
--          rows that predate this feature.  Historical rows have
--          client_op_id=NULL and remain unindexed by the new constraint.
--        - The reviewed_by column is part of the index so two different
--          principals with the (astronomically unlikely) same random
--          UUID cannot collide with each other.
--
--   3) NO backfill of client_op_id on existing rows.  The column stays
--      NULL for pre-migration data.  Only the new INSERT-OR-IGNORE code
--      path uses it.
--
-- Rollback plan: dropping the UNIQUE index + column is safe — no other
-- code path reads client_op_id and no existing data depends on it.
-- ============================================================================

ALTER TABLE external_pd_submissions ADD COLUMN client_op_id TEXT;

-- Partial UNIQUE index — active only for the new idempotent bulk-assign
-- code path.  Existing rows (client_op_id IS NULL) are exempt.
CREATE UNIQUE INDEX IF NOT EXISTS uq_extpd_client_op
  ON external_pd_submissions (reviewed_by, client_op_id, teacher_id)
  WHERE client_op_id IS NOT NULL;
