-- ============================================================================
-- 0011_pd_est_minutes_recalibration.sql
-- ============================================================================
-- Per Dr. Gandhi's June 2, 2026 audit of PD module timings:
--
-- Previous values (arbitrary baselines from prior migrations + generator
-- defaults):
--   Level 1 → 2  →  30 min × 60 modules
--   Level 2 → 3  →  45 min × 60 modules
--   Level 3 → 4  →  60 min × 60 modules
--
-- New tier-based estimates that honor the actual 8-step Learn → Practice →
-- Apply scaffold plus the deliverable workload:
--   Level 1 → 2 (Support, foundational)    →  45 min
--       (Learn 10 + Practice scaffolds 15 + classroom Apply + deliverable 20)
--   Level 2 → 3 (Support, refinement)      →  60 min
--       (same scaffold, but expects evidence collection)
--   Level 3 → 4 (Stretch, leadership)      →  90 min
--       (plural deliverable: student-impact + colleague-impact evidence —
--        closer to 2 hours when honest, 90 is a fair median)
--
-- Notes:
--   1. Not tied to ND state PD-hour reporting. These minutes are a default
--      pre-fill for the verifier and a planning aid for the teacher.
--   2. Credit is still gated by deliverable verification (verifyDeliverable
--      in src/lib/pd.ts — the verifier can override hours_credited at
--      verify time, or set 0 to verify without credit).
--   3. Idempotent: re-running this migration is safe — UPDATE statements
--      converge any module to its tier-correct value regardless of where
--      it started.
--   4. Only touches active modules (is_active = 1) to avoid silently
--      changing archived/superseded module data.
-- ============================================================================

UPDATE pd_modules SET est_minutes = 45 WHERE target_level = 1 AND is_active = 1;
UPDATE pd_modules SET est_minutes = 60 WHERE target_level = 2 AND is_active = 1;
UPDATE pd_modules SET est_minutes = 90 WHERE target_level = 3 AND is_active = 1;
