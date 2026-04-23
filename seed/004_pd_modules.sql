-- =============================================================================
-- PD Module Seed (0004) — v2: lesson-plan-focused, rubric-anchored
-- =============================================================================
-- target_level convention (unchanged from v1): stores the OBSERVATION SCORE
-- level that this module is designed for — i.e. autoEnrollForObservation
-- looks up WHERE target_level = <score>. Internally the content pushes the
-- teacher from that score to score+1.
--
-- One module per (indicator, score ∈ {1, 2}) = 60 × 2 = 120 modules. Each
-- module guides the teacher to redesign and teach an upcoming lesson so
-- their next observation moves from <score> to <score+1>.
--
-- FK-safe upsert pattern:
--   1. Build a temp table pd_modules_v2 with fully-computed content rows
--      (this is where we concat all the long strings — one big SELECT so
--      SQLite expression depth stays manageable per row).
--   2. UPDATE existing pd_modules rows from the temp table.
--   3. INSERT any missing (indicator_id, target_level) rows from the temp
--      table.
--   4. Drop the temp table.
-- =============================================================================

DROP TABLE IF EXISTS pd_modules_v2;
CREATE TABLE pd_modules_v2 AS
SELECT
  cur.indicator_id                                                    AS indicator_id,
  cur.level                                                           AS target_level,
  -- title (short, no subqueries)
  'Level ' || cur.level || ' → ' || (cur.level + 1)
    || ': redesign your next ' || i.name || ' lesson'                 AS title,
  -- subtitle
  'Marshall indicator ' || d.code || '.' || UPPER(i.code) || ' · '
    || i.name || ' — '
    || CASE cur.level
         WHEN 1 THEN 'move from Does Not Meet to Improvement Necessary'
         WHEN 2 THEN 'move from Improvement Necessary to Effective'
         WHEN 3 THEN 'move from Effective to Highly Effective'
       END                                                            AS subtitle,
  CASE cur.level WHEN 1 THEN 30 ELSE 45 END                           AS est_minutes,
  -- research_basis
  'WHY THIS MATTERS' || char(10) || '────────────────' || char(10)
    || COALESCE(cur.interpretation,'') || char(10) || char(10)
    || 'WHAT LEVEL ' || (cur.level + 1) || ' LOOKS LIKE IN A CLASSROOM' || char(10)
    || '────────────────' || char(10)
    || COALESCE(tgt.interpretation,'') || char(10) || char(10)
    || 'The research under this module:' || char(10)
    || '• Marshall, K. (2014/2023). Rethinking Teacher Supervision and Evaluation.' || char(10)
    || '• Saphier, Haley-Speca, & Gower. The Skillful Teacher (RBT, 7th ed.).' || char(10)
    || '• Hattie, J. Visible Learning for Teachers (Routledge, 2012).' || char(10)
    || '• Wiggins & McTighe. Understanding by Design (ASCD, 2005).' || char(10)
    || '• Wiliam, D. Embedded Formative Assessment (Solution Tree, 2018).' || char(10)
    || '• Lemov, D. Teach Like a Champion 3.0 (Jossey-Bass, 2021).'   AS research_basis,
  -- learn_content
  'STEP 1 — PICK THE LESSON YOU WILL REBUILD' || char(10) || '────────────────' || char(10)
    || 'Open your lesson plans for the next 1-2 weeks. Choose ONE lesson where this indicator will matter most — ' || i.name || '.' || char(10)
    || 'Write down in your reflection box at the bottom of this phase:' || char(10)
    || '  · Grade / subject / unit / exact lesson date you will deliver the rebuilt version' || char(10)
    || '  · One sentence on why this indicator shows up in THAT lesson (not in general)' || char(10) || char(10)
    || 'STEP 2 — READ THE RUBRIC SIDE-BY-SIDE (10 min)' || char(10) || '────────────────' || char(10)
    || 'Your current rubric level on this indicator: Level ' || cur.level || char(10) || char(10)
    || 'What Level ' || cur.level || ' looks like (your current practice):' || char(10)
    || COALESCE(cur.interpretation,'') || char(10) || char(10)
    || 'What Level ' || (cur.level + 1) || ' looks like (your target):' || char(10)
    || COALESCE(tgt.interpretation,'') || char(10) || char(10)
    || 'STEP 3 — SPOT THE EVIDENCE GAP' || char(10) || '────────────────' || char(10)
    || 'These are the observable signals at Level ' || (cur.level + 1) || ' — exactly what an observer would write down if you were hitting the target in the lesson you just picked:' || char(10)
    || REPLACE(REPLACE(REPLACE(COALESCE(tgt.evidence_signals,'[]'),'["','  · '),'","', char(10) || '  · '),'"]','') || char(10) || char(10)
    || 'In the reflection box below, put a ✓ next to every signal you already do in the lesson you picked, and circle the 1-2 signals that are missing. Those missing signals are exactly what your redesigned lesson has to introduce.'
                                                                       AS learn_content,
  -- practice_content
  'STEP 4 — REWRITE THE LESSON (25 min)' || char(10) || '────────────────' || char(10)
    || 'Take the lesson you picked in Step 1 and rebuild it so the missing Level ' || (cur.level + 1) || ' signals SHOW UP in the lesson. Use these research-backed moves from the Marshall pedagogy library:' || char(10) || char(10)
    || REPLACE(REPLACE(REPLACE(COALESCE(tgt.teacher_next_moves,'[]'),'["','  • '),'","', char(10) || '  • '),'"]','') || char(10) || char(10)
    || 'STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS' || char(10) || '────────────────' || char(10)
    || 'Write down — word for word — what you will SAY or DO at these three moments in the lesson:' || char(10)
    || '  1. The opening (first 3 minutes). What question or task launches the lesson so that Level ' || (cur.level + 1) || ' is visible immediately?' || char(10)
    || '  2. The pivot (middle). Where will student thinking most likely go sideways, and what is your move when it does?' || char(10)
    || '  3. The close (last 5 minutes). How will students DEMONSTRATE that Level ' || (cur.level + 1) || ' signal for you?' || char(10) || char(10)
    || 'STEP 6 — ONE EVIDENCE ARTIFACT' || char(10) || '────────────────' || char(10)
    || 'Decide now — before you teach — which ONE artifact from the lesson you will keep as evidence that the redesign landed. Candidates:' || char(10)
    || '  · a completed exit ticket that shows student mastery of the indicator' || char(10)
    || '  · an annotated photo of the board or anchor chart' || char(10)
    || '  · a student work sample (with name redacted)' || char(10)
    || '  · a short transcript of 3-5 student utterances during the pivot moment' || char(10) || char(10)
    || 'Note your choice in the reflection box. You will submit the artifact with your deliverable in the Apply phase.'
                                                                       AS practice_content,
  -- apply_content
  'STEP 7 — TEACH THE REDESIGNED LESSON' || char(10) || '────────────────' || char(10)
    || 'Deliver the lesson you rebuilt in Step 4. Keep a sticky note or quick voice memo for these three questions so you do not forget them by the end of the day:' || char(10)
    || '  · Which of the Level ' || (cur.level + 1) || ' moves actually happened in the room?' || char(10)
    || '  · What did students say or do that surprised you?' || char(10)
    || '  · What would you change before teaching this lesson again?' || char(10) || char(10)
    || 'STEP 8 — BUNDLE THE ARTIFACT' || char(10) || '────────────────' || char(10)
    || 'In the deliverable box below you will paste:' || char(10)
    || '  1. The rebuilt LESSON PLAN (or link to it). It must show the Level ' || (cur.level + 1) || ' moves you added.' || char(10)
    || '  2. The STUDENT EVIDENCE artifact you chose in Step 6.' || char(10)
    || '  3. A 3-sentence impact note: what changed for students because of the redesign?' || char(10) || char(10)
    || 'COACHING CONSIDERATIONS YOUR SUPERVISOR ALREADY SEES' || char(10) || '────────────────' || char(10)
    || 'When your supervisor reviews this, they are looking for these specific supports to be real in your work:' || char(10)
    || REPLACE(REPLACE(REPLACE(COALESCE(tgt.coaching_considerations,'[]'),'["','  · '),'","', char(10) || '  · '),'"]','')
                                                                       AS apply_content,
  -- deliverable_prompt
  'SUBMIT YOUR REBUILT LESSON' || char(10) || char(10)
    || 'Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:' || char(10) || char(10)
    || '1) LESSON CONTEXT — one paragraph: grade, subject, unit, the date you taught it, the size and composition of the class.' || char(10) || char(10)
    || '2) REBUILT LESSON PLAN — the actual plan you used. Bold or highlight the parts that changed from the original so the Level ' || (cur.level + 1) || ' moves are easy to spot. (Objective, opening, main task, checks for understanding, close, materials.)' || char(10) || char(10)
    || '3) THE 3 SCRIPTED MOMENTS — paste the word-for-word opener, pivot move, and close from Step 5.' || char(10) || char(10)
    || '4) STUDENT EVIDENCE — attach or paste: the exit ticket text + student responses, an annotated board photo link, or 3-5 student quotes with context.' || char(10) || char(10)
    || '5) IMPACT NOTE (3 sentences) — What moved for students? Where did the redesign fall short? What is your ONE next classroom move on this indicator?'
                                                                       AS deliverable_prompt,
  -- deliverable_rubric
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:' || char(10) || char(10)
    || '✓ The submitted lesson is a LESSON YOU ACTUALLY TAUGHT (or are about to teach this week) — not a generic activity from a book.' || char(10)
    || '✓ At least two of the Level ' || (cur.level + 1) || ' moves are visibly built into the plan (highlighted, bolded, or called out).' || char(10)
    || '✓ The three scripted moments (opener, pivot, close) are written in your voice — not paraphrased rubric language.' || char(10)
    || '✓ The student-evidence artifact is real — an exit ticket, a work sample, quoted student talk, or a board photo.' || char(10)
    || '✓ The impact note is honest — it names what worked AND what did not.' || char(10)
    || '✓ You identify one concrete next classroom move on ' || i.name || ' so you can stack progress.'
                                                                       AS deliverable_rubric,
  COALESCE(tgt.resources, cur.resources)                              AS resources
FROM pedagogy_library cur
JOIN pedagogy_library tgt
       ON tgt.indicator_id = cur.indicator_id
      AND tgt.level        = cur.level + 1
JOIN framework_indicators i ON i.id = cur.indicator_id
JOIN framework_domains    d ON d.id = i.domain_id
WHERE cur.level IN (1, 2)
  AND cur.interpretation IS NOT NULL
  AND tgt.interpretation IS NOT NULL;

-- ---------------------------------------------------------------------------
-- UPDATE existing rows (in place, preserving FKs from pd_enrollments).
-- One column per statement keeps the expression tree shallow.
-- ---------------------------------------------------------------------------
UPDATE pd_modules AS m SET title = (SELECT v.title FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level) WHERE EXISTS (SELECT 1 FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level);
UPDATE pd_modules AS m SET subtitle = (SELECT v.subtitle FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level) WHERE EXISTS (SELECT 1 FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level);
UPDATE pd_modules AS m SET est_minutes = (SELECT v.est_minutes FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level) WHERE EXISTS (SELECT 1 FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level);
UPDATE pd_modules AS m SET research_basis = (SELECT v.research_basis FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level) WHERE EXISTS (SELECT 1 FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level);
UPDATE pd_modules AS m SET learn_content = (SELECT v.learn_content FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level) WHERE EXISTS (SELECT 1 FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level);
UPDATE pd_modules AS m SET practice_content = (SELECT v.practice_content FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level) WHERE EXISTS (SELECT 1 FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level);
UPDATE pd_modules AS m SET apply_content = (SELECT v.apply_content FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level) WHERE EXISTS (SELECT 1 FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level);
UPDATE pd_modules AS m SET deliverable_prompt = (SELECT v.deliverable_prompt FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level) WHERE EXISTS (SELECT 1 FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level);
UPDATE pd_modules AS m SET deliverable_rubric = (SELECT v.deliverable_rubric FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level) WHERE EXISTS (SELECT 1 FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level);
UPDATE pd_modules AS m SET resources = (SELECT v.resources FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level) WHERE EXISTS (SELECT 1 FROM pd_modules_v2 v WHERE v.indicator_id = m.indicator_id AND v.target_level = m.target_level);
UPDATE pd_modules SET is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE target_level IN (1, 2);

-- ---------------------------------------------------------------------------
-- INSERT any missing (indicator, target_level) rows.
-- ---------------------------------------------------------------------------
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes,
   research_basis, learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active, created_by)
SELECT
  v.indicator_id, v.target_level, v.title, v.subtitle, v.est_minutes,
  v.research_basis, v.learn_content, v.practice_content, v.apply_content,
  v.deliverable_prompt, v.deliverable_rubric, v.resources, 1, NULL
FROM pd_modules_v2 v
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules x
   WHERE x.indicator_id = v.indicator_id
     AND x.target_level = v.target_level
);

DROP TABLE IF EXISTS pd_modules_v2;
