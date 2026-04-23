-- Preview account setup for Leslie Bieber's demo access.
-- Sets a known password and removes the forced-password-change flag for
-- one representative account per role so she can click through without
-- friction. Run via:
--   npx wrangler d1 execute alexander-marshall-growth-production --remote \
--     --file=transmittal/preview_accounts.sql

-- Password: PreviewAlexander2026   (bcrypt, 10 rounds)
UPDATE users
   SET password_hash          = '$2b$10$iaCODbYta8QoFVs1b1ePKuTK4q5ZuqNEiX5f/3yruMV1PbSjX.VQS',
       must_change_password   = 0,
       updated_at             = CURRENT_TIMESTAMP
 WHERE email IN (
    'admin@alexanderschoolnd.us',   -- super admin
    'leslie.bieber@k12.nd.us',      -- superintendent (Leslie)
    'aaron.allard@k12.nd.us',       -- principal / appraiser
    'jacki.hansel@k12.nd.us',       -- instructional coach
    'jil.stahosky@k12.nd.us',       -- teacher
    'amy.gaida@k12.nd.us'           -- second teacher
 );
