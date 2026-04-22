-- Alexander Public Schools Marshall Growth Platform
-- Initial schema: users, districts, schools, framework, observations, pedagogy library

-- ============================================================================
-- DISTRICTS & SCHOOLS
-- ============================================================================
CREATE TABLE IF NOT EXISTS districts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  logo_url TEXT,
  active_framework_id INTEGER,
  active_school_year TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS schools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  grade_span TEXT,            -- e.g. "PK-5", "6-12"
  address TEXT,
  phone TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (district_id) REFERENCES districts(id)
);

CREATE TABLE IF NOT EXISTS school_years (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district_id INTEGER NOT NULL,
  label TEXT NOT NULL,        -- e.g. "2025-2026"
  start_date TEXT,
  end_date TEXT,
  is_current INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (district_id) REFERENCES districts(id)
);

-- ============================================================================
-- USERS & AUTH
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district_id INTEGER NOT NULL,
  school_id INTEGER,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  role TEXT NOT NULL,          -- 'super_admin' | 'superintendent' | 'appraiser' | 'coach' | 'teacher'
  title TEXT,                  -- e.g. "2nd Grade", "Elementary Principal"
  phone TEXT,
  avatar_url TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (district_id) REFERENCES districts(id),
  FOREIGN KEY (school_id) REFERENCES schools(id)
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_school ON users(school_id);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,         -- session token (random)
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip TEXT,
  user_agent TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

-- ============================================================================
-- ASSIGNMENTS (who evaluates / coaches whom)
-- ============================================================================
CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL,
  staff_id INTEGER NOT NULL,             -- appraiser OR coach
  relationship TEXT NOT NULL,            -- 'appraiser' | 'coach'
  school_year_id INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (staff_id) REFERENCES users(id),
  FOREIGN KEY (school_year_id) REFERENCES school_years(id)
);
CREATE INDEX IF NOT EXISTS idx_assign_teacher ON assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assign_staff ON assignments(staff_id);

-- ============================================================================
-- EVALUATION FRAMEWORK (Marshall Rubric)
-- ============================================================================
CREATE TABLE IF NOT EXISTS frameworks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  district_id INTEGER NOT NULL,
  name TEXT NOT NULL,                    -- "Kim Marshall Teacher Evaluation Rubric"
  version TEXT,                          -- "2014"
  description TEXT,
  scale_levels INTEGER NOT NULL DEFAULT 4,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (district_id) REFERENCES districts(id)
);

CREATE TABLE IF NOT EXISTS framework_domains (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  framework_id INTEGER NOT NULL,
  code TEXT NOT NULL,                    -- 'A','B','C','D','E','F'
  name TEXT NOT NULL,                    -- "Planning and Preparation for Learning"
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (framework_id) REFERENCES frameworks(id)
);

CREATE TABLE IF NOT EXISTS framework_indicators (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain_id INTEGER NOT NULL,
  code TEXT NOT NULL,                    -- 'a','b','c'...'j'
  name TEXT NOT NULL,                    -- "Knowledge"
  sort_order INTEGER NOT NULL DEFAULT 0,
  prompt TEXT,                           -- "The teacher:"
  FOREIGN KEY (domain_id) REFERENCES framework_domains(id)
);

CREATE TABLE IF NOT EXISTS framework_descriptors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  indicator_id INTEGER NOT NULL,
  level INTEGER NOT NULL,                -- 4,3,2,1
  level_label TEXT NOT NULL,             -- "Highly Effective" etc.
  descriptor TEXT NOT NULL,              -- Kim Marshall's exact text
  FOREIGN KEY (indicator_id) REFERENCES framework_indicators(id)
);

-- ============================================================================
-- PEDAGOGY LIBRARY — mapped to (indicator, level)
-- Super Admin can edit these — they drive auto-populated suggestions
-- ============================================================================
CREATE TABLE IF NOT EXISTS pedagogy_library (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  indicator_id INTEGER NOT NULL,
  level INTEGER NOT NULL,
  -- content fields (markdown-ish plain text)
  interpretation TEXT,              -- What this score means in plain language
  evidence_signals TEXT,            -- JSON array of observable evidence signals at this level
  teacher_next_moves TEXT,          -- JSON array of concrete strategies
  coaching_considerations TEXT,     -- JSON array of coaching moves
  resources TEXT,                   -- JSON array of PD resources/readings
  feedback_starter TEXT,            -- Editable draft feedback sentence(s)
  updated_by INTEGER,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (indicator_id) REFERENCES framework_indicators(id),
  FOREIGN KEY (updated_by) REFERENCES users(id),
  UNIQUE(indicator_id, level)
);

-- ============================================================================
-- OBSERVATIONS & SCORING
-- ============================================================================
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL,
  appraiser_id INTEGER NOT NULL,
  school_year_id INTEGER,
  framework_id INTEGER NOT NULL,
  -- context
  observation_type TEXT NOT NULL DEFAULT 'mini',   -- 'mini' | 'formal' | 'annual_summary'
  class_context TEXT,                              -- e.g. "3rd period Algebra I, 24 students"
  subject TEXT,
  grade_level TEXT,
  location TEXT,                                   -- room number / space
  observed_at TEXT NOT NULL,                       -- timestamp
  duration_minutes INTEGER,
  -- workflow
  status TEXT NOT NULL DEFAULT 'draft',            -- 'draft' | 'scored' | 'awaiting_signature' | 'published' | 'acknowledged'
  -- notes (principal private + teacher-facing)
  scripted_notes TEXT,                             -- raw observation script
  private_notes TEXT,                              -- appraiser-only
  overall_summary TEXT,                            -- summary comment
  -- signatures
  appraiser_signed_at TEXT,
  appraiser_signature_data TEXT,                   -- base64 PNG data URL
  teacher_acknowledged_at TEXT,
  teacher_signature_data TEXT,
  teacher_response TEXT,                           -- optional teacher comment on ack
  -- publish
  published_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (appraiser_id) REFERENCES users(id),
  FOREIGN KEY (school_year_id) REFERENCES school_years(id),
  FOREIGN KEY (framework_id) REFERENCES frameworks(id)
);
CREATE INDEX IF NOT EXISTS idx_obs_teacher ON observations(teacher_id);
CREATE INDEX IF NOT EXISTS idx_obs_appraiser ON observations(appraiser_id);
CREATE INDEX IF NOT EXISTS idx_obs_status ON observations(status);

CREATE TABLE IF NOT EXISTS observation_scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observation_id INTEGER NOT NULL,
  indicator_id INTEGER NOT NULL,
  level INTEGER,                            -- 4,3,2,1 (nullable = not yet scored)
  evidence_note TEXT,                       -- appraiser's rationale for this score
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE CASCADE,
  FOREIGN KEY (indicator_id) REFERENCES framework_indicators(id),
  UNIQUE(observation_id, indicator_id)
);

-- Chunked / focus-area feedback — the "organized" feedback that teachers see
CREATE TABLE IF NOT EXISTS feedback_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  observation_id INTEGER NOT NULL,
  indicator_id INTEGER,                     -- optional link to indicator
  category TEXT NOT NULL,                   -- 'glow' | 'grow' | 'focus_area' | 'next_step'
  title TEXT,
  body TEXT NOT NULL,                       -- markdown-ish
  sort_order INTEGER NOT NULL DEFAULT 0,
  source TEXT,                              -- 'pedagogy_library' | 'custom'
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (observation_id) REFERENCES observations(id) ON DELETE CASCADE,
  FOREIGN KEY (indicator_id) REFERENCES framework_indicators(id)
);

-- Persistent teacher focus areas (carry across observations)
CREATE TABLE IF NOT EXISTS focus_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL,
  indicator_id INTEGER,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'active',    -- 'active' | 'achieved' | 'archived'
  opened_observation_id INTEGER,
  opened_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  closed_at TEXT,
  closed_note TEXT,
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (indicator_id) REFERENCES framework_indicators(id),
  FOREIGN KEY (opened_observation_id) REFERENCES observations(id)
);
CREATE INDEX IF NOT EXISTS idx_focus_teacher ON focus_areas(teacher_id);

-- Audit trail / activity log
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  entity_type TEXT,
  entity_id INTEGER,
  action TEXT,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
