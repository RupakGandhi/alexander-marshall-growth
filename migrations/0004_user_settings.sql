-- ============================================================================
-- Migration 0004: user_settings — per-user master switches
-- ============================================================================
-- Gives every user a single row of global preferences that apply across
-- notification kinds. Keeps per-kind controls in notification_preferences
-- but adds a master push kill-switch and a master in-app mute, so a user
-- can "silence everything while on vacation" with one click without losing
-- their per-kind settings.
--
-- IMPORTANT: the idempotency guarantee — every app path that sends a push
-- MUST also consult user_settings.push_enabled before firing.
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_settings (
  user_id        INTEGER PRIMARY KEY,
  push_enabled   INTEGER NOT NULL DEFAULT 1,   -- master: 0 = silence all push on all devices
  in_app_enabled INTEGER NOT NULL DEFAULT 1,   -- master: 0 = hide bell badge + empty list
  quiet_hours    TEXT,                         -- reserved for future (e.g. "22:00-06:00")
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
