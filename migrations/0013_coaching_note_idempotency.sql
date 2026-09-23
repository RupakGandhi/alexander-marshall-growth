-- Migration 0013 — coaching_notes idempotency + optimistic locking.
--
-- Sept 23, 2026, follow-up to the 0012 review.  ChatGPT flagged two concurrency
-- gaps in the coach.tsx create/share flow:
--
--   1) Duplicate creates on double-click: coach.tsx POST /notes always INSERTs,
--      so two rapid submits produce two rows and two shared-note notifications.
--   2) Duplicate first-share on concurrent requests: the "have we ever shared
--      this note before?" check was a read-then-write on first_shared_at.
--      Two overlapping share requests can both read NULL and both fire the
--      notify path.
--
-- This migration adds the columns needed to make both cases atomic:
--
--   * client_token TEXT UNIQUE per author — a per-form idempotency key
--     generated in the client (crypto.randomUUID()).  Server INSERT uses
--     ON CONFLICT (author_id, client_token) DO NOTHING so a double-submit
--     collapses to one row and returns the pre-existing id on the second
--     hit.  Null-friendly (older forms without a token stay unique via
--     the primary key alone).
--   * version INTEGER NOT NULL DEFAULT 1 — optimistic-lock token.  Every
--     UPDATE increments it in a single statement (UPDATE ... SET version =
--     version + 1 WHERE id=? AND version=?).  If two edits race, only one
--     succeeds; the other gets 0 rows affected and re-renders the form.
--
-- Backwards-compatible: existing rows get client_token=NULL and version=1.
-- Rollback: still non-destructive (leave both columns; the app just ignores
-- them if reverted).  See migration 0012 for the full rollback rationale.

ALTER TABLE coaching_notes ADD COLUMN client_token TEXT;
ALTER TABLE coaching_notes ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
-- Sept 23 follow-up (F3): SHA-1 hex of the canonicalised (values) tuple at
-- insert time.  A retry-post reusing the same client_token but carrying a
-- different payload will not match this digest → the server rejects the
-- reuse with "content changed" instead of silently sharing stale/empty text.
ALTER TABLE coaching_notes ADD COLUMN payload_digest TEXT;
-- Sept 23 second-follow-up (R1): per-request nonce stamped on the row by the
-- request that most recently wrote/updated it.  Every INSERT and UPDATE now
-- stamps writer_nonce with a fresh UUID; audit-row INSERTs use
-- SELECT-in-INSERT gated on `writer_nonce=?` so they land iff *this* request
-- was the one that wrote the row.  Second-precision timestamps are no longer
-- used for winner detection.  Two requests using the same client_token in
-- the same second still get distinct writer_nonces (UUID), so the loser's
-- audit SELECT matches zero rows.
ALTER TABLE coaching_notes ADD COLUMN writer_nonce TEXT;

-- Idempotency uniqueness is scoped per author: two different coaches happen
-- to reuse the same UUID only if the client PRNG collides across accounts,
-- and even then they can't overwrite each other because the pair is unique.
-- WHERE client_token IS NOT NULL keeps the index sparse so legacy inserts
-- without a token don't collide.
CREATE UNIQUE INDEX IF NOT EXISTS uq_coaching_notes_author_token
  ON coaching_notes (author_id, client_token)
  WHERE client_token IS NOT NULL;
