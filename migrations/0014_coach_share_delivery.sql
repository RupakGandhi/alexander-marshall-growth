-- ============================================================================
-- 0014 — coaching_note_share_delivery
-- ----------------------------------------------------------------------------
-- Sept 23, 2026 — F2 correction.  Motivation:
--
-- The coach_note "first-share notification" needs a source of truth that is
-- INDEPENDENT of the notifications-inbox row.  Reasons:
--   * Two concurrent POST .../notify-retry requests both call
--     shareNotificationExists() (a SELECT) at roughly the same time, both
--     see "no row", and both then INSERT into notifications.  Result:
--     duplicate alerts.
--   * If an admin deletes the recipient's inbox row (a normal support action),
--     shareNotificationExists() returns false and a subsequent notify-retry
--     would fire a SECOND "here's coaching feedback" alert about a note the
--     recipient has already read.  The inbox is user-facing state; it must
--     not double as a delivery ledger.
--   * We also want to distinguish "recipient turned this kind off in their
--     preferences" (no notification is a policy outcome, not a failure) from
--     "delivery threw" (a failure worth retrying).
--
-- Design:
--   * One row per (note_id) — the note IS the unit of "did we ever send this
--     first-share alert?".  UNIQUE(note_id) enforces this at the DB.
--   * status ∈ ('attempting' | 'delivered' | 'failed' | 'suppressed').
--       - attempting = a request is in flight (lock).  A parallel request
--         that also tries to INSERT (note_id, 'attempting') will hit the
--         UNIQUE constraint and lose gracefully.
--       - delivered  = notify() returned a positive row id.
--       - suppressed = notify() returned 0 because the recipient's
--         preferences suppress this kind.  Not a failure; do NOT retry.
--       - failed     = notify() threw or returned <0.  Eligible for retry
--         via `UPDATE ... WHERE status='failed'` guard.
--   * Only `failed` rows are eligible for a subsequent retry.  `delivered`
--     is terminal (idempotent no-op).  `suppressed` is terminal by policy.
--     `attempting` is transient — a stuck-attempting row can only occur if
--     the request that took the lock crashed before updating; treat it the
--     same as `failed` after a grace window.
--
-- This table is append-only in normal use.  The delete-guard is preserved
-- (see migration 0012 §rollback runbook): rows here are per-note, so they
-- cascade the delete-guard's protection without extra logic.
-- ============================================================================

CREATE TABLE IF NOT EXISTS coaching_note_share_delivery (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id        INTEGER NOT NULL,
  status         TEXT NOT NULL CHECK (status IN ('attempting','delivered','suppressed','failed')),
  notif_id       INTEGER,       -- FK to notifications.id when status='delivered'; NULL otherwise
  detail         TEXT,          -- error message when status='failed'
  attempted_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(note_id),
  FOREIGN KEY (note_id) REFERENCES coaching_notes(id)
);

CREATE INDEX IF NOT EXISTS idx_cnsd_status ON coaching_note_share_delivery(status);
