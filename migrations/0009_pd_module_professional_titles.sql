-- ============================================================================
-- Migration 0009 — Professional PD module titles (June 2 2026, Dr. Gandhi review)
-- ----------------------------------------------------------------------------
-- Replaces the auto-generated "Level X → Y: redesign your next {Indicator}
-- lesson" template with indicator-aware, professionally written titles aligned
-- to Kim Marshall's Teacher Evaluation Rubric (six domains, 60 indicators).
--
-- Title conventions:
--   • Sentence case ("Building...", "Strengthening..."), not lowercase verbs
--   • Action verb chosen to match the indicator's actual practice domain
--     (lesson design vs. classroom management vs. assessment vs. family work)
--   • Level transition kept as a leading clause: "Level 1 → 2:" / "Level 2 → 3:"
--   • No reference to "lesson" for non-lesson indicators (Attendance,
--     Professionalism, Outreach, Reporting, Leadership, Collaboration, Growth)
--   • All updates idempotent and scoped to indicator_id × target_level
--
-- Safe to re-run: each UPDATE is a targeted upsert against the existing row.
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- DOMAIN A — PLANNING AND PREPARATION FOR LEARNING (lesson-design focused)
-- ─────────────────────────────────────────────────────────────────────────────

-- A.a Knowledge
UPDATE pd_modules SET title = 'Level 1 → 2: Deepening subject-matter knowledge for the units you teach' WHERE indicator_id = 1 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Connecting content expertise to student misconceptions and prior knowledge' WHERE indicator_id = 1 AND target_level = 2 AND is_active = 1;

-- A.b Standards
UPDATE pd_modules SET title = 'Level 1 → 2: Unpacking grade-level standards into student-friendly learning targets' WHERE indicator_id = 2 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Backwards-mapping a unit from standards to daily objectives' WHERE indicator_id = 2 AND target_level = 2 AND is_active = 1;

-- A.c Units
UPDATE pd_modules SET title = 'Level 1 → 2: Designing a coherent unit plan with clear culminating tasks' WHERE indicator_id = 3 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Aligning unit arc, daily lessons, and assessments around essential questions' WHERE indicator_id = 3 AND target_level = 2 AND is_active = 1;

-- A.d Assessments
UPDATE pd_modules SET title = 'Level 1 → 2: Writing pre- and post-assessments aligned to your learning targets' WHERE indicator_id = 4 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Designing rigorous, standards-aligned assessments with answer keys and rubrics' WHERE indicator_id = 4 AND target_level = 2 AND is_active = 1;

-- A.e Anticipation
UPDATE pd_modules SET title = 'Level 1 → 2: Anticipating student misconceptions before you teach a lesson' WHERE indicator_id = 5 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Planning targeted responses to predicted student struggles' WHERE indicator_id = 5 AND target_level = 2 AND is_active = 1;

-- A.f Lessons
UPDATE pd_modules SET title = 'Level 1 → 2: Designing a lesson with a clear hook, instruction block, and check for understanding' WHERE indicator_id = 6 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Crafting lessons that gradually release responsibility from teacher to student' WHERE indicator_id = 6 AND target_level = 2 AND is_active = 1;

-- A.g Engagement
UPDATE pd_modules SET title = 'Level 1 → 2: Planning hooks and entry events that capture student curiosity' WHERE indicator_id = 7 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Building authentic, real-world relevance into every lesson you design' WHERE indicator_id = 7 AND target_level = 2 AND is_active = 1;

-- A.h Materials
UPDATE pd_modules SET title = 'Level 1 → 2: Selecting high-quality materials and texts at the right complexity' WHERE indicator_id = 8 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Curating diverse, culturally responsive materials for your unit' WHERE indicator_id = 8 AND target_level = 2 AND is_active = 1;

-- A.i Differentiation
UPDATE pd_modules SET title = 'Level 1 → 2: Differentiating a lesson for at least two learner groups' WHERE indicator_id = 9 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Building tiered tasks and flexible grouping into your lesson plan' WHERE indicator_id = 9 AND target_level = 2 AND is_active = 1;

-- A.j Environment
UPDATE pd_modules SET title = 'Level 1 → 2: Setting up a classroom environment that supports your instructional goals' WHERE indicator_id = 10 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Curating a learning environment that reflects student work and current units' WHERE indicator_id = 10 AND target_level = 2 AND is_active = 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- DOMAIN B — CLASSROOM MANAGEMENT (routines + behavior focused)
-- ─────────────────────────────────────────────────────────────────────────────

-- B.a Expectations
UPDATE pd_modules SET title = 'Level 1 → 2: Establishing clear behavioral expectations on day one' WHERE indicator_id = 11 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Co-constructing classroom expectations with students and reinforcing them consistently' WHERE indicator_id = 11 AND target_level = 2 AND is_active = 1;

-- B.b Relationships
UPDATE pd_modules SET title = 'Level 1 → 2: Building positive teacher-student relationships in the first weeks' WHERE indicator_id = 12 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Strengthening trust and rapport with every student, especially those who struggle' WHERE indicator_id = 12 AND target_level = 2 AND is_active = 1;

-- B.c Respect
UPDATE pd_modules SET title = 'Level 1 → 2: Modeling respectful interactions and addressing disrespect promptly' WHERE indicator_id = 13 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Cultivating a classroom culture where students respect each other and the work' WHERE indicator_id = 13 AND target_level = 2 AND is_active = 1;

-- B.d Social-emotional
UPDATE pd_modules SET title = 'Level 1 → 2: Integrating social-emotional check-ins into your daily routines' WHERE indicator_id = 14 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Embedding SEL skills (self-awareness, self-management, empathy) into instruction' WHERE indicator_id = 14 AND target_level = 2 AND is_active = 1;

-- B.e Routines
UPDATE pd_modules SET title = 'Level 1 → 2: Teaching and rehearsing classroom routines until they run on autopilot' WHERE indicator_id = 15 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Streamlining transitions, materials hand-out, and entry/exit routines' WHERE indicator_id = 15 AND target_level = 2 AND is_active = 1;

-- B.f Responsibility
UPDATE pd_modules SET title = 'Level 1 → 2: Holding students accountable for their behavior and learning' WHERE indicator_id = 16 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Building student ownership of classroom norms and personal responsibility' WHERE indicator_id = 16 AND target_level = 2 AND is_active = 1;

-- B.g Repertoire (B-side: behavior repertoire)
UPDATE pd_modules SET title = 'Level 1 → 2: Expanding your repertoire of de-escalation and redirection moves' WHERE indicator_id = 17 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Matching your behavior-management response to the function of the behavior' WHERE indicator_id = 17 AND target_level = 2 AND is_active = 1;

-- B.h Efficiency
UPDATE pd_modules SET title = 'Level 1 → 2: Maximizing instructional time and minimizing transitions' WHERE indicator_id = 18 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Auditing your minute-by-minute use of class time and tightening the slack' WHERE indicator_id = 18 AND target_level = 2 AND is_active = 1;

-- B.i Prevention
UPDATE pd_modules SET title = 'Level 1 → 2: Preventing misbehavior through proximity, scanning, and engaging tasks' WHERE indicator_id = 19 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Reading the room and intervening before low-level disruption becomes a problem' WHERE indicator_id = 19 AND target_level = 2 AND is_active = 1;

-- B.j Incentives
UPDATE pd_modules SET title = 'Level 1 → 2: Using positive reinforcement to build a productive classroom culture' WHERE indicator_id = 20 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Designing intrinsic, mastery-oriented incentives over extrinsic rewards' WHERE indicator_id = 20 AND target_level = 2 AND is_active = 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- DOMAIN C — DELIVERY OF INSTRUCTION (in-lesson focused)
-- ─────────────────────────────────────────────────────────────────────────────

-- C.a Expectations
UPDATE pd_modules SET title = 'Level 1 → 2: Communicating high expectations through your language and actions every lesson' WHERE indicator_id = 21 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Holding every student to grade-level rigor while scaffolding their path there' WHERE indicator_id = 21 AND target_level = 2 AND is_active = 1;

-- C.b Mindset
UPDATE pd_modules SET title = 'Level 1 → 2: Modeling and naming growth-mindset language in your daily instruction' WHERE indicator_id = 22 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Building student belief that effort + strategy drives improvement' WHERE indicator_id = 22 AND target_level = 2 AND is_active = 1;

-- C.c Goals
UPDATE pd_modules SET title = 'Level 1 → 2: Posting and referencing the daily learning goal throughout your lesson' WHERE indicator_id = 23 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Helping students set and self-monitor short-term learning goals' WHERE indicator_id = 23 AND target_level = 2 AND is_active = 1;

-- C.d Connections
UPDATE pd_modules SET title = 'Level 1 → 2: Activating prior knowledge at the start of every lesson' WHERE indicator_id = 24 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Bridging today''s lesson to yesterday''s learning and tomorrow''s application' WHERE indicator_id = 24 AND target_level = 2 AND is_active = 1;

-- C.e Clarity
UPDATE pd_modules SET title = 'Level 1 → 2: Delivering explanations and directions students understand the first time' WHERE indicator_id = 25 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Using precise academic language and well-chosen examples to make ideas stick' WHERE indicator_id = 25 AND target_level = 2 AND is_active = 1;

-- C.f Repertoire (C-side: instructional repertoire)
UPDATE pd_modules SET title = 'Level 1 → 2: Broadening your instructional toolkit beyond lecture and worksheets' WHERE indicator_id = 26 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Matching instructional strategy to learning purpose (acquire / practice / transfer)' WHERE indicator_id = 26 AND target_level = 2 AND is_active = 1;

-- C.g Engagement
UPDATE pd_modules SET title = 'Level 1 → 2: Increasing active student engagement through high-frequency response strategies' WHERE indicator_id = 27 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Designing tasks where every student is doing the cognitive work, not just compliant' WHERE indicator_id = 27 AND target_level = 2 AND is_active = 1;

-- C.h Differentiation
UPDATE pd_modules SET title = 'Level 1 → 2: Differentiating in real time based on what you see in the room' WHERE indicator_id = 28 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Personalizing instruction through flexible grouping, choice, and tiered support' WHERE indicator_id = 28 AND target_level = 2 AND is_active = 1;

-- C.i Nimbleness
UPDATE pd_modules SET title = 'Level 1 → 2: Adjusting your lesson on the fly when student understanding falters' WHERE indicator_id = 29 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Reading formative signals mid-lesson and pivoting without losing momentum' WHERE indicator_id = 29 AND target_level = 2 AND is_active = 1;

-- C.j Application
UPDATE pd_modules SET title = 'Level 1 → 2: Giving students opportunities to apply new learning in the same lesson' WHERE indicator_id = 30 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Designing transfer tasks that push students to apply learning in new contexts' WHERE indicator_id = 30 AND target_level = 2 AND is_active = 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- DOMAIN D — MONITORING, ASSESSMENT, AND FOLLOW-UP (formative + summative)
-- ─────────────────────────────────────────────────────────────────────────────

-- D.a Criteria
UPDATE pd_modules SET title = 'Level 1 → 2: Sharing success criteria and rubrics with students before they begin work' WHERE indicator_id = 31 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Co-constructing exemplars so students know what excellent work looks like' WHERE indicator_id = 31 AND target_level = 2 AND is_active = 1;

-- D.b Diagnosis
UPDATE pd_modules SET title = 'Level 1 → 2: Using pre-assessments to diagnose what students already know' WHERE indicator_id = 32 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Diagnosing the specific gap behind a wrong answer before you reteach' WHERE indicator_id = 32 AND target_level = 2 AND is_active = 1;

-- D.c On-the-Spot
UPDATE pd_modules SET title = 'Level 1 → 2: Using on-the-spot checks for understanding throughout every lesson' WHERE indicator_id = 33 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Building rapid formative-assessment routines (whiteboards, exit tickets, cold-calling)' WHERE indicator_id = 33 AND target_level = 2 AND is_active = 1;

-- D.d Self-Assessment
UPDATE pd_modules SET title = 'Level 1 → 2: Teaching students to self-assess their own work against the success criteria' WHERE indicator_id = 34 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Building peer-assessment and reflection routines that drive student ownership' WHERE indicator_id = 34 AND target_level = 2 AND is_active = 1;

-- D.e Recognition
UPDATE pd_modules SET title = 'Level 1 → 2: Recognizing student effort and growth, not just performance' WHERE indicator_id = 35 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Giving specific, learning-focused praise that names the strategy that worked' WHERE indicator_id = 35 AND target_level = 2 AND is_active = 1;

-- D.f Interims
UPDATE pd_modules SET title = 'Level 1 → 2: Using interim assessments to track student progress between summatives' WHERE indicator_id = 36 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Analyzing interim-assessment data with colleagues to drive instructional change' WHERE indicator_id = 36 AND target_level = 2 AND is_active = 1;

-- D.g Tenacity
UPDATE pd_modules SET title = 'Level 1 → 2: Persisting with struggling students rather than letting them disengage' WHERE indicator_id = 37 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Building student tenacity through productive struggle and well-timed support' WHERE indicator_id = 37 AND target_level = 2 AND is_active = 1;

-- D.h Support
UPDATE pd_modules SET title = 'Level 1 → 2: Offering targeted reteaching and small-group support to students who need it' WHERE indicator_id = 38 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Building a tiered support system (whole-class → small-group → individual)' WHERE indicator_id = 38 AND target_level = 2 AND is_active = 1;

-- D.i Analysis
UPDATE pd_modules SET title = 'Level 1 → 2: Analyzing your own assessment data to identify class-wide patterns' WHERE indicator_id = 39 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Disaggregating data by student group to surface and address gaps' WHERE indicator_id = 39 AND target_level = 2 AND is_active = 1;

-- D.j Reflection
UPDATE pd_modules SET title = 'Level 1 → 2: Reflecting after every lesson on what worked and what to adjust' WHERE indicator_id = 40 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Using a structured reflection routine to drive sustained instructional improvement' WHERE indicator_id = 40 AND target_level = 2 AND is_active = 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- DOMAIN E — FAMILY AND COMMUNITY OUTREACH (relational + communication)
-- ─────────────────────────────────────────────────────────────────────────────

-- E.a Respect
UPDATE pd_modules SET title = 'Level 1 → 2: Communicating with families in a respectful, culturally responsive way' WHERE indicator_id = 41 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Building family partnerships that honor home language and culture' WHERE indicator_id = 41 AND target_level = 2 AND is_active = 1;

-- E.b Belief
UPDATE pd_modules SET title = 'Level 1 → 2: Conveying belief in every student through your conversations with families' WHERE indicator_id = 42 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Framing every family conversation around the student''s strengths and growth' WHERE indicator_id = 42 AND target_level = 2 AND is_active = 1;

-- E.c Expectations
UPDATE pd_modules SET title = 'Level 1 → 2: Communicating learning expectations and classroom norms to families early' WHERE indicator_id = 43 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Co-setting goals with families so home and school pull in the same direction' WHERE indicator_id = 43 AND target_level = 2 AND is_active = 1;

-- E.d Communication
UPDATE pd_modules SET title = 'Level 1 → 2: Establishing regular, two-way communication channels with families' WHERE indicator_id = 44 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Tailoring your communication mode and language to each family''s preferences' WHERE indicator_id = 44 AND target_level = 2 AND is_active = 1;

-- E.e Involving
UPDATE pd_modules SET title = 'Level 1 → 2: Inviting families to participate in classroom learning' WHERE indicator_id = 45 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Designing meaningful roles for families in your unit and classroom community' WHERE indicator_id = 45 AND target_level = 2 AND is_active = 1;

-- E.f Homework
UPDATE pd_modules SET title = 'Level 1 → 2: Designing homework that families can support without doing it for the student' WHERE indicator_id = 46 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Communicating clear homework expectations and supports to families' WHERE indicator_id = 46 AND target_level = 2 AND is_active = 1;

-- E.g Responsiveness
UPDATE pd_modules SET title = 'Level 1 → 2: Responding to family questions and concerns within 24 hours' WHERE indicator_id = 47 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Anticipating family questions and addressing them before they need to ask' WHERE indicator_id = 47 AND target_level = 2 AND is_active = 1;

-- E.h Reporting
UPDATE pd_modules SET title = 'Level 1 → 2: Reporting student progress to families in clear, jargon-free language' WHERE indicator_id = 48 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Pairing every progress report with concrete next steps families can take' WHERE indicator_id = 48 AND target_level = 2 AND is_active = 1;

-- E.i Outreach
UPDATE pd_modules SET title = 'Level 1 → 2: Reaching out proactively to families who are hard to connect with' WHERE indicator_id = 49 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Building authentic relationships with families historically disengaged from school' WHERE indicator_id = 49 AND target_level = 2 AND is_active = 1;

-- E.j Resources
UPDATE pd_modules SET title = 'Level 1 → 2: Connecting families to school and community resources when needed' WHERE indicator_id = 50 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Building a network of community partners that wraps services around your students' WHERE indicator_id = 50 AND target_level = 2 AND is_active = 1;

-- ─────────────────────────────────────────────────────────────────────────────
-- DOMAIN F — PROFESSIONAL RESPONSIBILITIES (career + growth focused)
-- ─────────────────────────────────────────────────────────────────────────────

-- F.a Attendance
UPDATE pd_modules SET title = 'Level 1 → 2: Maintaining consistent attendance and arriving prepared every day' WHERE indicator_id = 51 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Modeling reliability for colleagues and students by planning ahead for absences' WHERE indicator_id = 51 AND target_level = 2 AND is_active = 1;

-- F.b Language
UPDATE pd_modules SET title = 'Level 1 → 2: Using professional, respectful language in every workplace interaction' WHERE indicator_id = 52 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Choosing language that builds trust with students, families, and colleagues' WHERE indicator_id = 52 AND target_level = 2 AND is_active = 1;

-- F.c Reliability
UPDATE pd_modules SET title = 'Level 1 → 2: Following through on commitments to students, colleagues, and families' WHERE indicator_id = 53 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Becoming the person colleagues count on when something has to get done right' WHERE indicator_id = 53 AND target_level = 2 AND is_active = 1;

-- F.d Professionalism
UPDATE pd_modules SET title = 'Level 1 → 2: Conducting yourself professionally in all school settings' WHERE indicator_id = 54 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Representing the school and the profession well in every public-facing moment' WHERE indicator_id = 54 AND target_level = 2 AND is_active = 1;

-- F.e Judgment
UPDATE pd_modules SET title = 'Level 1 → 2: Exercising sound professional judgment in difficult student and family situations' WHERE indicator_id = 55 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Navigating ethical gray areas by consulting colleagues and following district policy' WHERE indicator_id = 55 AND target_level = 2 AND is_active = 1;

-- F.f Above-and-beyond
UPDATE pd_modules SET title = 'Level 1 → 2: Volunteering for school activities and supporting colleagues beyond your role' WHERE indicator_id = 56 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Taking on school-improvement work that benefits students beyond your own classroom' WHERE indicator_id = 56 AND target_level = 2 AND is_active = 1;

-- F.g Leadership
UPDATE pd_modules SET title = 'Level 1 → 2: Stepping into informal teacher-leader roles on your team' WHERE indicator_id = 57 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Leading colleagues through grade-level, department, or building-wide initiatives' WHERE indicator_id = 57 AND target_level = 2 AND is_active = 1;

-- F.h Openness
UPDATE pd_modules SET title = 'Level 1 → 2: Welcoming feedback from administrators and coaches without becoming defensive' WHERE indicator_id = 58 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Actively seeking feedback and turning it into changed practice within the week' WHERE indicator_id = 58 AND target_level = 2 AND is_active = 1;

-- F.i Collaboration
UPDATE pd_modules SET title = 'Level 1 → 2: Collaborating productively with grade-level or department colleagues' WHERE indicator_id = 59 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Co-planning, co-analyzing student work, and co-revising practice with colleagues' WHERE indicator_id = 59 AND target_level = 2 AND is_active = 1;

-- F.j Growth
UPDATE pd_modules SET title = 'Level 1 → 2: Setting and pursuing a personal professional-growth goal each year' WHERE indicator_id = 60 AND target_level = 1 AND is_active = 1;
UPDATE pd_modules SET title = 'Level 2 → 3: Engaging in sustained, evidence-based professional learning that shifts your practice' WHERE indicator_id = 60 AND target_level = 2 AND is_active = 1;
