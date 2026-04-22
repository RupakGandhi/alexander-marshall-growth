-- ============================================================================
-- Alexander Public Schools — Staff Seed
-- Real roster sourced from alexanderschoolnd.us/staff (public site)
-- Default password for all seeded accounts: "Alexander2026!" (bcrypt hashed)
-- Every user has must_change_password = 1 — forces password reset on first login.
--
-- Password hash below is bcrypt of "Alexander2026!" at cost 10.
-- (pre-computed so we don't have to run bcrypt at seed time)
-- ============================================================================

-- bcrypt hash of "Alexander2026!" — computed with bcryptjs cost=10
-- $2a$10$N9qo8uLOickgx2ZMRZoMye...  (placeholder replaced at runtime by seed script)

-- Super Admin
INSERT OR IGNORE INTO users (id, district_id, school_id, email, password_hash, first_name, last_name, role, title, must_change_password, active) VALUES
  (1, 1, NULL, 'admin@alexanderschoolnd.us', '$2b$10$7hZTL9yErKkTXJcPE9sMye9SjmMccH8oj4aVDaWc7nCHBNMQrJ7jC', 'District', 'Administrator', 'super_admin', 'Super Administrator', 1, 1);

-- Superintendent
INSERT OR IGNORE INTO users (id, district_id, school_id, email, password_hash, first_name, last_name, role, title, phone, must_change_password, active) VALUES
  (2, 1, NULL, 'leslie.bieber@k12.nd.us', '$2b$10$7hZTL9yErKkTXJcPE9sMye9SjmMccH8oj4aVDaWc7nCHBNMQrJ7jC', 'Leslie', 'Bieber', 'superintendent', 'Superintendent', '701-828-3335', 1, 1);

-- Principals (Appraisers)
INSERT OR IGNORE INTO users (id, district_id, school_id, email, password_hash, first_name, last_name, role, title, phone, must_change_password, active) VALUES
  (3, 1, 2, 'shannon.faller@k12.nd.us',  '$2b$10$7hZTL9yErKkTXJcPE9sMye9SjmMccH8oj4aVDaWc7nCHBNMQrJ7jC', 'Shannon', 'Faller',  'appraiser', '6-12 Principal', '701-828-3334', 1, 1),
  (4, 1, 1, 'aaron.allard@k12.nd.us',    '$2b$10$7hZTL9yErKkTXJcPE9sMye9SjmMccH8oj4aVDaWc7nCHBNMQrJ7jC', 'Aaron',   'Allard',  'appraiser', 'Elementary Principal', '701-828-3334', 1, 1);

-- Instructional Coach (Alexander doesn't currently have a named coach in public directory;
-- Counselor Jacki Hansel is often the de-facto support role. Seeding a coach account ready for use.)
INSERT OR IGNORE INTO users (id, district_id, school_id, email, password_hash, first_name, last_name, role, title, phone, must_change_password, active) VALUES
  (5, 1, NULL, 'jacki.hansel@k12.nd.us', '$2b$10$7hZTL9yErKkTXJcPE9sMye9SjmMccH8oj4aVDaWc7nCHBNMQrJ7jC', 'Jacki',   'Hansel',  'coach',     'Counselor / Instructional Support', '701-828-3334', 1, 1);

-- Teachers (names drawn from public APS staff directory, page 1)
INSERT OR IGNORE INTO users (id, district_id, school_id, email, password_hash, first_name, last_name, role, title, phone, must_change_password, active) VALUES
  (10, 1, 1, 'jil.stahosky@k12.nd.us',      '$2b$10$7hZTL9yErKkTXJcPE9sMye9SjmMccH8oj4aVDaWc7nCHBNMQrJ7jC', 'Jil',      'Stahosky',  'teacher', 'Art (PK-12)', '701-828-3334', 1, 1),
  (11, 1, 1, 'amy.gaida@k12.nd.us',         '$2b$10$7hZTL9yErKkTXJcPE9sMye9SjmMccH8oj4aVDaWc7nCHBNMQrJ7jC', 'Amy',      'Gaida',     'teacher', 'Physical Education (PK-12)', '701-828-3334', 1, 1),
  (12, 1, 1, 'ellen.wittmaier@k12.nd.us',   '$2b$10$7hZTL9yErKkTXJcPE9sMye9SjmMccH8oj4aVDaWc7nCHBNMQrJ7jC', 'Ellen',    'Wittmaier', 'teacher', 'Preschool', '701-828-3334', 1, 1),
  (13, 1, 1, 'tristae.allard@k12.nd.us',    '$2b$10$7hZTL9yErKkTXJcPE9sMye9SjmMccH8oj4aVDaWc7nCHBNMQrJ7jC', 'Tristae',  'Allard',    'teacher', 'Kindergarten', '701-828-3334', 1, 1),
  (14, 1, 1, 'brianna.ritter@k12.nd.us',    '$2b$10$7hZTL9yErKkTXJcPE9sMye9SjmMccH8oj4aVDaWc7nCHBNMQrJ7jC', 'Brianna',  'Ritter',    'teacher', 'Kindergarten', '701-828-3334', 1, 1),
  (15, 1, 1, 'erica.turnquist@k12.nd.us',   '$2b$10$7hZTL9yErKkTXJcPE9sMye9SjmMccH8oj4aVDaWc7nCHBNMQrJ7jC', 'Erica',    'Turnquist', 'teacher', '1st Grade',  '701-828-3334', 1, 1),
  (16, 1, 1, 'tarynn.nieuwsma@k12.nd.us',   '$2b$10$7hZTL9yErKkTXJcPE9sMye9SjmMccH8oj4aVDaWc7nCHBNMQrJ7jC', 'Tarynn',   'Nieuwsma',  'teacher', '2nd Grade',  '701-828-3334', 1, 1);

-- Assignments: all teachers' appraiser = Aaron Allard (Elementary Principal) for elementary
INSERT OR IGNORE INTO assignments (teacher_id, staff_id, relationship, school_year_id, active) VALUES
  (10, 4, 'appraiser', 1, 1),
  (11, 4, 'appraiser', 1, 1),
  (12, 4, 'appraiser', 1, 1),
  (13, 4, 'appraiser', 1, 1),
  (14, 4, 'appraiser', 1, 1),
  (15, 4, 'appraiser', 1, 1),
  (16, 4, 'appraiser', 1, 1);

-- All teachers also assigned Jacki Hansel as instructional coach
INSERT OR IGNORE INTO assignments (teacher_id, staff_id, relationship, school_year_id, active) VALUES
  (10, 5, 'coach', 1, 1),
  (11, 5, 'coach', 1, 1),
  (12, 5, 'coach', 1, 1),
  (13, 5, 'coach', 1, 1),
  (14, 5, 'coach', 1, 1),
  (15, 5, 'coach', 1, 1),
  (16, 5, 'coach', 1, 1);
