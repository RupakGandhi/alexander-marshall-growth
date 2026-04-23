-- =============================================================================
-- PD Module Seed (0004)
-- =============================================================================
-- Auto-generate one PD module per (indicator, level ∈ {1,2}) by drawing on the
-- same pedagogy_library rows that already power the appraiser feedback engine.
-- That keeps the PD content deterministic, research-based, and perfectly
-- aligned with what appraisers see — no magic AI, no drift.
--
-- We only create modules for the two growth levels (1 = Does Not Meet,
-- 2 = Improvement Necessary). Teachers scoring 3 or 4 do not need growth
-- modules auto-queued against them.
--
-- Idempotent — uses INSERT OR IGNORE with a synthetic natural key.
-- =============================================================================

-- Build modules from pedagogy_library (one row per indicator × level 1-2)
-- We wrap the library's human-readable JSON arrays with markdown-style bullets
-- so the output reads nicely in the Learn/Practice/Apply phases.

INSERT OR IGNORE INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes,
   research_basis, learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active, created_by)
SELECT
  p.indicator_id,
  p.level AS target_level,
  -- Title
  ('Grow: ' || i.name || ' (toward Level 3)') AS title,
  -- Subtitle
  ('Domain ' || d.code || ' · Indicator ' || d.code || '.' || UPPER(i.code) || ' — ' || COALESCE(i.prompt,'')) AS subtitle,
  -- 45 minutes by default
  45 AS est_minutes,
  -- Research basis: interpretation + a short frame
  ('Kim Marshall (2014, 2023). Rethinking Teacher Supervision and Evaluation.' || char(10) ||
   char(10) || 'WHY THIS MATTERS: ' || COALESCE(p.interpretation,'')) AS research_basis,
  -- LEARN phase: pedagogy_library interpretation + what "Level 3" evidence looks like
  ('LEARN — Build a shared understanding' || char(10) || char(10) ||
   'Read and unpack the rubric language.' || char(10) || char(10) ||
   'Current level (' || p.level || ') interpretation:' || char(10) || COALESCE(p.interpretation,'') || char(10) || char(10) ||
   'Target at Level 3 looks like this in a classroom — evidence signals an observer would capture:' || char(10) ||
   COALESCE((SELECT '• ' || REPLACE(REPLACE(evidence_signals,'[',''),']','') FROM pedagogy_library WHERE indicator_id = p.indicator_id AND level = 3),''))
  AS learn_content,
  -- PRACTICE phase: teacher_next_moves (as bullet list) + rehearsal prompts
  ('PRACTICE — Rehearse in low-stakes conditions' || char(10) || char(10) ||
   'Concrete moves to try this week:' || char(10) ||
   REPLACE(REPLACE(REPLACE(COALESCE(p.teacher_next_moves,'[]'),'[',''),']',''),'","','"' || char(10) || '• "') || char(10) || char(10) ||
   'Reflection prompts:' || char(10) ||
   '• Which move felt most natural?' || char(10) ||
   '• Which move created the biggest shift for students?' || char(10) ||
   '• What did you adapt from the script?') AS practice_content,
  -- APPLY phase: coaching considerations + deliverable framing
  ('APPLY — Deliver with real students' || char(10) || char(10) ||
   'Carry the practice into a real lesson.  Capture one artifact you can show your supervisor.' || char(10) || char(10) ||
   'Coaching considerations to keep in mind:' || char(10) ||
   REPLACE(REPLACE(REPLACE(COALESCE(p.coaching_considerations,'[]'),'[',''),']',''),'","','"' || char(10) || '• "'))
  AS apply_content,
  -- Deliverable prompt
  ('Submit a classroom artifact that demonstrates the move(s) from this module in action.' || char(10) ||
   'Minimum expectations:' || char(10) ||
   '1. A short description of the lesson context (grade, subject, student group).' || char(10) ||
   '2. The specific move(s) you used and what you said/did.' || char(10) ||
   '3. One piece of student evidence (work sample, exit ticket, quote).' || char(10) ||
   '4. One sentence of reflection on impact.') AS deliverable_prompt,
  -- Deliverable rubric ("looks like")
  ('A strong submission:' || char(10) ||
   '• Names the rubric move in plain language.' || char(10) ||
   '• Includes at least one student evidence artifact (not just teacher talk).' || char(10) ||
   '• Reflects honestly on what worked and what did not.' || char(10) ||
   '• Identifies one next step the teacher will try.') AS deliverable_rubric,
  -- Resources — pull any links already in the pedagogy_library
  p.resources AS resources,
  1 AS is_active,
  NULL AS created_by
FROM pedagogy_library p
JOIN framework_indicators i ON i.id = p.indicator_id
JOIN framework_domains d ON d.id = i.domain_id
WHERE p.level IN (1, 2)
  AND p.interpretation IS NOT NULL
  AND NOT EXISTS (
    -- Don't duplicate if a module for this indicator+level already exists with this title
    SELECT 1 FROM pd_modules m2
    WHERE m2.indicator_id = p.indicator_id AND m2.target_level = p.level
      AND m2.title = 'Grow: ' || i.name || ' (toward Level 3)'
  );
