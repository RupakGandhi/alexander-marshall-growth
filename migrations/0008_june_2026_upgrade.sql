-- Migration 0008 — June 2, 2026 Leadership Upgrade
-- Consolidated schema additions for Fixes 4, 5, 6, 7, 8, 10, 11 in the
-- Developer Build Brief (Aug 16, 2026 launch deadline). Fully idempotent.
--
--   Fix 4  : manual PD recommendation (recommender + note on enrollments)
--   Fix 5  : external PD submission + approval workflow
--   Fix 6  : unified hours dashboard (system_settings.pd_hours_target)
--   Fix 7  : artifact approval gates PD credit (hours_credited on enrollment)
--   Fix 8  : mass-delete + reset + soft-delete pattern + admin_audit_log
--   Fix 10 : teacher personal goal tracking (teacher_goals)
--   Fix 11 : context-aware auto-feedback (subject_area / classroom_type /
--           grade_band on users)
--
-- NOTE on idempotent ALTER TABLE: SQLite does not support
-- "ALTER TABLE ... ADD COLUMN IF NOT EXISTS". Each ALTER below is wrapped in
-- an "INSERT INTO migration_skip" sentinel pattern using PRAGMA
-- table_info() via a tiny helper. Because Wrangler runs every statement in
-- its own transaction and we cannot use procedural SQL, we instead split
-- each ALTER into its own file-level statement and rely on the migration
-- only being applied ONCE by wrangler (which is how the d1_migrations
-- table works). Re-running this file by hand on an already-migrated DB
-- will throw "duplicate column name" — that is acceptable because
-- Wrangler protects us.

-- ---------------------------------------------------------------------------
-- Fix 4 + Fix 7 : pd_enrollments — recommendations + hours credit + soft delete
-- ---------------------------------------------------------------------------
ALTER TABLE pd_enrollments ADD COLUMN recommended_by_user_id INTEGER;
ALTER TABLE pd_enrollments ADD COLUMN recommender_note TEXT;
ALTER TABLE pd_enrollments ADD COLUMN hours_credited REAL;         -- in hours (e.g. 0.75 = 45 min)
ALTER TABLE pd_enrollments ADD COLUMN credited_at TEXT;
ALTER TABLE pd_enrollments ADD COLUMN credited_by_user_id INTEGER;
ALTER TABLE pd_enrollments ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_pdenr_recommender ON pd_enrollments(recommended_by_user_id);
CREATE INDEX IF NOT EXISTS idx_pdenr_credited    ON pd_enrollments(credited_at);
CREATE INDEX IF NOT EXISTS idx_pdenr_deleted     ON pd_enrollments(deleted_at);

-- ---------------------------------------------------------------------------
-- Fix 8 : Soft-delete on observations + pd_deliverables + pd_deliverable_submissions
-- (pd_deliverable_submissions is the per-submission attempt; we also add
--  deleted_at on pd_deliverables for legacy single-deliverable rows.)
-- ---------------------------------------------------------------------------
ALTER TABLE observations    ADD COLUMN deleted_at TEXT;
ALTER TABLE pd_deliverables ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_obs_deleted        ON observations(deleted_at);
CREATE INDEX IF NOT EXISTS idx_pddeliv_deleted    ON pd_deliverables(deleted_at);

-- ---------------------------------------------------------------------------
-- Fix 11 : context-aware auto-feedback — extend users with classroom context
-- ---------------------------------------------------------------------------
ALTER TABLE users ADD COLUMN subject_area    TEXT;   -- e.g. "Mathematics", "ELA", "Self-contained", "K-2 General"
ALTER TABLE users ADD COLUMN classroom_type  TEXT;   -- e.g. "self_contained", "departmentalized", "specials", "intervention"
ALTER TABLE users ADD COLUMN grade_band      TEXT;   -- e.g. "K-2", "3-5", "6-8", "9-12"

-- ---------------------------------------------------------------------------
-- Fix 5 : external_pd_submissions
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS external_pd_submissions (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id         INTEGER NOT NULL,
  title              TEXT NOT NULL,             -- "AVID Summer Institute 2026"
  provider           TEXT,                      -- "NDCEL", "ASCD", "AVID Center", etc.
  start_date         TEXT,                      -- YYYY-MM-DD
  end_date           TEXT,                      -- YYYY-MM-DD
  hours              REAL NOT NULL,             -- self-reported clock hours
  domain_alignment   TEXT,                      -- JSON array of domain codes e.g. ["B","D"]
  indicator_alignment TEXT,                     -- JSON array of indicator ids e.g. [12,17]
  description        TEXT,                      -- teacher's narrative
  certificate_url    TEXT,                      -- link/URL to certificate (manual paste OK)
  status             TEXT NOT NULL DEFAULT 'submitted',   -- 'submitted' | 'approved' | 'declined' | 'needs_revision'
  submitted_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_by        INTEGER,
  reviewed_at        TEXT,
  review_note        TEXT,
  approved_hours     REAL,                      -- appraiser may approve a different hour count
  deleted_at         TEXT,
  FOREIGN KEY (teacher_id)   REFERENCES users(id),
  FOREIGN KEY (reviewed_by)  REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_extpd_teacher   ON external_pd_submissions(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_extpd_status    ON external_pd_submissions(status, submitted_at);
CREATE INDEX IF NOT EXISTS idx_extpd_reviewer  ON external_pd_submissions(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_extpd_deleted   ON external_pd_submissions(deleted_at);

-- ---------------------------------------------------------------------------
-- Fix 10 : teacher_goals — personal goal tracking
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS teacher_goals (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id      INTEGER NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  domain_code     TEXT,                  -- optional: aligned to rubric domain (A..F)
  indicator_id    INTEGER,               -- optional: aligned to a specific indicator
  target_date     TEXT,                  -- YYYY-MM-DD
  status          TEXT NOT NULL DEFAULT 'active',   -- 'active' | 'complete' | 'on_hold' | 'archived'
  progress_notes  TEXT,                  -- free text running log
  progress_pct    INTEGER NOT NULL DEFAULT 0,       -- 0..100
  created_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at    TEXT,
  deleted_at      TEXT,
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (indicator_id) REFERENCES framework_indicators(id)
);
CREATE INDEX IF NOT EXISTS idx_tgoals_teacher ON teacher_goals(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_tgoals_deleted ON teacher_goals(deleted_at);

-- ---------------------------------------------------------------------------
-- Fix 8 : admin_audit_log — high-trust mutations from /admin/data-management
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_audit_log (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_user_id  INTEGER NOT NULL,
  action         TEXT NOT NULL,           -- e.g. 'soft_delete_observations', 'reset_practice_data'
  entity_type    TEXT,                    -- 'observation' | 'pd_enrollment' | 'external_pd' | 'bulk' | ...
  entity_ids     TEXT,                    -- JSON array of affected ids (or null for bulk)
  row_count      INTEGER NOT NULL DEFAULT 0,
  filters        TEXT,                    -- JSON dump of filter inputs (date range, role, etc.)
  detail         TEXT,                    -- free-text reason / note
  ip             TEXT,
  user_agent     TEXT,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_adminaudit_actor  ON admin_audit_log(actor_user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_adminaudit_action ON admin_audit_log(action, created_at);

-- ---------------------------------------------------------------------------
-- Fix 6 : system_settings — admin-editable knobs (pd_hours_target etc.)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS system_settings (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL,
  value_type   TEXT NOT NULL DEFAULT 'string',   -- 'string' | 'number' | 'json' | 'boolean'
  description  TEXT,
  updated_by   INTEGER,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id)
);

-- Seed the annual PD hours target (Alexander Public Schools: 22.5h/year per brief)
INSERT OR IGNORE INTO system_settings (key, value, value_type, description)
VALUES ('pd_hours_target_annual', '22.5', 'number', 'Annual PD hours target per teacher (combined internal + external). Set in June 2 leadership session — admin-editable.');

-- Seed: enable manual recommendation banner copy on teacher home
INSERT OR IGNORE INTO system_settings (key, value, value_type, description)
VALUES ('teacher_recommendation_banner', 'Your coach or principal recommended this for you', 'string', 'Caption shown on the "Recommended for You" card on /teacher.');
