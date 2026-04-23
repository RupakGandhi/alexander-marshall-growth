-- ============================================================================
-- Migration 0003: In-app notifications + Professional Development LMS
-- ============================================================================
-- This migration adds two big new subsystems to the Alexander Marshall Growth
-- platform, both designed to work entirely inside the Cloudflare Pages/D1 stack
-- — no email, no SMS, no external services, zero district subscription cost.
--
--  1. NOTIFICATIONS
--     An in-app alert/bell system that fires on every important workflow event
--     (observation published, teacher acknowledged, focus area opened, PD
--     module assigned/completed, deliverable submitted/verified, etc.).
--     Also backs Web Push so notifications can surface on any device even when
--     the PWA is closed — still with no paid service, using the browser's
--     built-in Push API and a VAPID key pair owned by the district.
--
--  2. PROFESSIONAL DEVELOPMENT LMS
--     A research-based, deliverable-driven PD module library that mirrors the
--     Kim Marshall rubric one-to-one. Every (indicator × level) cell can have
--     one or more PD modules built on the classic Learn → Practice → Apply
--     flow (same structure as the OptimizED AI Institute). Teachers get a "My
--     PD LMS" workspace that auto-recommends modules based on their lowest
--     rubric scores, they work through each module's three phases, submit a
--     classroom-ready deliverable, and their supervisor (principal / coach /
--     super-admin) can verify completion right inside the platform.
--
-- All tables use IF NOT EXISTS so this migration is idempotent and safe to
-- re-run during development.
-- ============================================================================


-- ============================================================================
-- A. NOTIFICATIONS
-- ============================================================================

-- A1. notifications
-- One row per delivered alert. Persisted so the bell icon can show history
-- even weeks later and we can compute unread counts per user.
CREATE TABLE IF NOT EXISTS notifications (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id          INTEGER NOT NULL,          -- recipient
  kind             TEXT NOT NULL,             -- machine key, e.g. 'observation_published'
  title            TEXT NOT NULL,             -- short headline shown in dropdown
  body             TEXT,                      -- optional longer explanation
  url              TEXT,                      -- deep link to the relevant page
  icon             TEXT,                      -- Font Awesome icon class, e.g. 'fa-clipboard-check'
  severity         TEXT NOT NULL DEFAULT 'info', -- 'info' | 'success' | 'warning' | 'action'
  entity_type      TEXT,                      -- 'observation' | 'focus_area' | 'pd_module' | etc.
  entity_id        INTEGER,
  actor_user_id    INTEGER,                   -- who caused this (NULL for system)
  read_at          TEXT,                      -- NULL = unread
  created_at       TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (actor_user_id) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_notif_user_read ON notifications(user_id, read_at);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_entity ON notifications(entity_type, entity_id);

-- A2. notification_preferences
-- Per-user, per-kind opt-in/opt-out so power users can silence classes of
-- alerts they don't care about.  Absence of a row = use the platform default.
CREATE TABLE IF NOT EXISTS notification_preferences (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  kind          TEXT NOT NULL,
  in_app        INTEGER NOT NULL DEFAULT 1,   -- show in bell dropdown
  push          INTEGER NOT NULL DEFAULT 1,   -- send as Web Push
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, kind)
);

-- A3. push_subscriptions
-- Stores the raw Web Push subscription objects returned by each device's
-- browser. A single user can have many (desktop, phone, tablet).  Expired or
-- 410-Gone subscriptions are pruned automatically.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL,
  endpoint      TEXT NOT NULL,                -- full URL, globally unique per device
  p256dh        TEXT NOT NULL,                -- client public key (base64url)
  auth          TEXT NOT NULL,                -- client auth secret (base64url)
  user_agent    TEXT,                         -- human-readable device hint
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at  TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(endpoint)
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

-- A4. vapid_keys
-- The district owns ONE VAPID key pair. First server boot auto-generates one
-- and stores it here. No external service, no subscription — just raw Web
-- Push using the open standard.
CREATE TABLE IF NOT EXISTS vapid_keys (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  public_key   TEXT NOT NULL,                 -- base64url (uncompressed EC P-256)
  private_key  TEXT NOT NULL,                 -- base64url (EC P-256 scalar)
  subject      TEXT NOT NULL DEFAULT 'mailto:admin@alexanderschoolnd.us',
  created_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);


-- ============================================================================
-- B. PROFESSIONAL DEVELOPMENT LMS
-- ============================================================================

-- B1. pd_modules
-- Each row is one complete Learn → Practice → Apply module targeted at a
-- specific (indicator × level) cell of the Marshall rubric.  The super-admin
-- can create, edit, and retire modules entirely from the web UI — exactly
-- the same shape as the pedagogy_library so the mental model is consistent.
CREATE TABLE IF NOT EXISTS pd_modules (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  indicator_id        INTEGER NOT NULL,        -- which Marshall indicator
  target_level        INTEGER NOT NULL,        -- the score this module helps teachers PASS (1,2 or 3 → grow to 3/4)
  title               TEXT NOT NULL,           -- short, teacher-facing
  subtitle            TEXT,                    -- optional one-line framing
  est_minutes         INTEGER NOT NULL DEFAULT 45,
  research_basis      TEXT,                    -- citation(s) / research summary (markdown-ish)
  learn_content       TEXT NOT NULL,           -- the "Learn" phase body (markdown-ish)
  practice_content    TEXT NOT NULL,           -- the "Practice" phase body
  apply_content       TEXT NOT NULL,           -- the "Apply" phase body
  deliverable_prompt  TEXT NOT NULL,           -- what the teacher must produce
  deliverable_rubric  TEXT,                    -- what a "good" deliverable looks like
  resources           TEXT,                    -- JSON array of links / readings / videos
  is_active           INTEGER NOT NULL DEFAULT 1,
  created_by          INTEGER,
  created_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (indicator_id) REFERENCES framework_indicators(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_pdmod_indicator_level ON pd_modules(indicator_id, target_level);
CREATE INDEX IF NOT EXISTS idx_pdmod_active ON pd_modules(is_active);

-- B2. pd_enrollments
-- A teacher's workspace row for ONE module.  Created either automatically
-- (when a low score appears) or manually (teacher hits "Start this module").
-- The status transitions tell the supervisor exactly where the teacher is:
-- recommended → started → learn_done → practice_done → submitted → verified
-- (or: declined / needs_revision).
CREATE TABLE IF NOT EXISTS pd_enrollments (
  id                     INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id             INTEGER NOT NULL,
  module_id              INTEGER NOT NULL,
  source                 TEXT NOT NULL DEFAULT 'auto', -- 'auto' | 'self' | 'assigned'
  source_observation_id  INTEGER,               -- which observation triggered this (if any)
  source_score_level     INTEGER,               -- the level that triggered recommendation
  assigned_by            INTEGER,                -- principal/coach who assigned (if any)
  status                 TEXT NOT NULL DEFAULT 'recommended',
  learn_done_at          TEXT,
  practice_done_at       TEXT,
  submitted_at           TEXT,
  verified_at            TEXT,
  verified_by            INTEGER,
  verification_note      TEXT,
  declined_at            TEXT,
  decline_reason         TEXT,
  created_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (module_id) REFERENCES pd_modules(id),
  FOREIGN KEY (source_observation_id) REFERENCES observations(id),
  FOREIGN KEY (assigned_by) REFERENCES users(id),
  FOREIGN KEY (verified_by) REFERENCES users(id),
  UNIQUE(teacher_id, module_id, source_observation_id)   -- one per trigger
);
CREATE INDEX IF NOT EXISTS idx_pdenr_teacher ON pd_enrollments(teacher_id, status);
CREATE INDEX IF NOT EXISTS idx_pdenr_module ON pd_enrollments(module_id);

-- B3. pd_reflections
-- Per-phase reflection text teachers capture while learning.  Kept as its
-- own table (rather than columns) so we can easily show a timeline and so
-- teachers can save progress incrementally without losing state.
CREATE TABLE IF NOT EXISTS pd_reflections (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id  INTEGER NOT NULL,
  phase          TEXT NOT NULL,            -- 'learn' | 'practice' | 'apply'
  body           TEXT NOT NULL,
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (enrollment_id) REFERENCES pd_enrollments(id) ON DELETE CASCADE,
  UNIQUE(enrollment_id, phase)
);

-- B4. pd_deliverables
-- The artifact a teacher actually produces in the Apply phase (e.g. a lesson
-- plan, a rubric, a student-facing exit ticket).  Stored as rich text +
-- optional attachment URL.  Because Cloudflare Workers can't write files at
-- runtime we store the raw text content here directly (which is sufficient
-- for every deliverable type we've designed).  A future R2 hook can be added
-- without a schema change by populating `attachment_url`.
CREATE TABLE IF NOT EXISTS pd_deliverables (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id  INTEGER NOT NULL,
  title          TEXT NOT NULL,
  body           TEXT NOT NULL,            -- markdown-ish deliverable content
  attachment_url TEXT,                     -- optional future R2 link
  created_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at     TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (enrollment_id) REFERENCES pd_enrollments(id) ON DELETE CASCADE,
  UNIQUE(enrollment_id)
);

-- B5. pd_plans
-- The higher-level "PD Plan" a teacher (or a supervisor on their behalf)
-- creates for a floating PD day.  It groups a few enrollments together so
-- the teacher can look at ONE page that says "today's PD agenda" and so the
-- superintendent can see how the building is using the time.
CREATE TABLE IF NOT EXISTS pd_plans (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id    INTEGER NOT NULL,
  name          TEXT NOT NULL,             -- e.g. "Nov 8 Floating PD — Small-group instruction"
  planned_date  TEXT,                      -- YYYY-MM-DD of the floating day
  goal          TEXT,                      -- plain-English goal set by teacher
  created_by    INTEGER,                   -- teacher themselves or assigned_by
  status        TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'active' | 'complete'
  created_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (teacher_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);
CREATE INDEX IF NOT EXISTS idx_pdplan_teacher ON pd_plans(teacher_id, status);

-- B6. pd_plan_items
-- Join table: which enrollments belong to which plan, in which order.
CREATE TABLE IF NOT EXISTS pd_plan_items (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id        INTEGER NOT NULL,
  enrollment_id  INTEGER NOT NULL,
  sort_order     INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (plan_id) REFERENCES pd_plans(id) ON DELETE CASCADE,
  FOREIGN KEY (enrollment_id) REFERENCES pd_enrollments(id) ON DELETE CASCADE,
  UNIQUE(plan_id, enrollment_id)
);
