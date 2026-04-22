-- Migration 0002: Multi-school support + helpful indexes
-- Allows a single staff member (principal, coach, teacher, superintendent) to
-- be linked to MULTIPLE schools. Keeps users.school_id as a "primary school"
-- for backward compatibility; the junction table is the source of truth
-- when looking up "who belongs to school X".

CREATE TABLE IF NOT EXISTS user_schools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  school_id INTEGER NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE CASCADE,
  UNIQUE(user_id, school_id)
);
CREATE INDEX IF NOT EXISTS idx_user_schools_user ON user_schools(user_id);
CREATE INDEX IF NOT EXISTS idx_user_schools_school ON user_schools(school_id);

-- Backfill: everyone who currently has a single school_id gets a row marked as primary.
INSERT OR IGNORE INTO user_schools (user_id, school_id, is_primary)
SELECT id, school_id, 1 FROM users WHERE school_id IS NOT NULL;

-- Helpful indexes for the report builder's multi-select queries.
CREATE INDEX IF NOT EXISTS idx_obs_observed_at ON observations(observed_at);
CREATE INDEX IF NOT EXISTS idx_obs_type ON observations(observation_type);
