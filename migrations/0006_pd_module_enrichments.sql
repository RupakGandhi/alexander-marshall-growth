-- ============================================================
-- 0006_pd_module_enrichments.sql
-- April 2026 upgrade: enrich PD module content with admin-editable
-- text fields for:
--   1. modeling_examples        - textual mini-case studies / scripts (no video)
--   2. collaboration_prompts    - PLC/peer collaboration invitations
--   3. family_engagement_notes  - culturally responsive family communication
--   4. contextual_differentiation - elementary vs secondary guidance
--
-- Per the spec, these are rendered *below* existing learn/practice/apply
-- content rather than embedded in it, so the original workflow and
-- auto-generated module library remain untouched.  All four fields are
-- nullable and fully editable from /admin/pd/:id without code changes.
-- ============================================================

ALTER TABLE pd_modules ADD COLUMN modeling_examples TEXT;
ALTER TABLE pd_modules ADD COLUMN collaboration_prompts TEXT;
ALTER TABLE pd_modules ADD COLUMN family_engagement_notes TEXT;
ALTER TABLE pd_modules ADD COLUMN contextual_differentiation TEXT;

-- New rubric criteria for the PD deliverable review queue.  The set
-- of criteria is itself editable through /admin/pd-rubric, and each
-- principal review captures a score (1-4) + optional note per criterion.
CREATE TABLE IF NOT EXISTS pd_deliverable_rubric_criteria (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  code         TEXT NOT NULL UNIQUE,         -- stable key, e.g. "alignment"
  label        TEXT NOT NULL,                -- teacher-facing label
  description  TEXT NOT NULL,                -- 1-2 sentence scoring guidance
  weight       INTEGER NOT NULL DEFAULT 1,   -- relative weight (default equal)
  sort_order   INTEGER NOT NULL DEFAULT 0,
  is_active    INTEGER NOT NULL DEFAULT 1,
  updated_by   INTEGER,
  updated_at   TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT OR IGNORE INTO pd_deliverable_rubric_criteria
  (code, label, description, weight, sort_order) VALUES
  ('alignment',     'Alignment with target indicator',
   'The lesson redesign, script, and artifact directly address the Marshall indicator the module targets. The teacher can point to where the Level-up move shows up in student work.', 1, 1),
  ('completeness',  'Completeness of redesign / artifact',
   'The deliverable includes all required pieces: the rebuilt lesson plan, three scripted moments, one student-evidence artifact, and a short impact note. Nothing is missing.', 1, 2),
  ('student_impact', 'Evidence of student impact / engagement',
   'The student artifact or utterance log shows concrete evidence that students responded to the redesign. Vague "it went well" statements are not enough.', 1, 3),
  ('reflection',    'Reflection quality',
   'The impact note is specific and honest — it names what worked, what did not, and what the teacher will change next time, in their own words.', 1, 4);

-- Per-enrollment per-criterion scores captured by the supervisor during
-- PD review. One row per (enrollment, criterion). Allows principals to
-- score 1-4 with an optional note, separate from the pass/fail verify.
CREATE TABLE IF NOT EXISTS pd_deliverable_scores (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  enrollment_id  INTEGER NOT NULL,
  criterion_id   INTEGER NOT NULL,
  level          INTEGER NOT NULL,            -- 1-4 mirroring Marshall scale
  note           TEXT,
  scored_by      INTEGER NOT NULL,
  scored_at      TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (enrollment_id) REFERENCES pd_enrollments(id) ON DELETE CASCADE,
  FOREIGN KEY (criterion_id)  REFERENCES pd_deliverable_rubric_criteria(id) ON DELETE CASCADE,
  FOREIGN KEY (scored_by)     REFERENCES users(id),
  UNIQUE (enrollment_id, criterion_id)
);
CREATE INDEX IF NOT EXISTS idx_pddscore_enr ON pd_deliverable_scores(enrollment_id);

-- ============================================================
-- Seed defaults for the three indicators named in the upgrade spec
-- (B.d, B.e, E.c).  These defaults are plain text so admins can freely
-- edit them through /admin/pd.  All other modules stay NULL for now and
-- will fall back to a "(not specified)" render, which admins can fill.
-- ============================================================

-- B.d modules — social-emotional learning (indicator_id = 14)
UPDATE pd_modules
   SET modeling_examples = 'Example: a 5-minute morning meeting.' || char(10) || char(10) ||
       '  1. Greeting (60s): every student shakes hands with a partner and names them.' || char(10) ||
       '  2. Share (90s): one partner answers the prompt "when was a time this week you handled frustration well?"' || char(10) ||
       '  3. Model (90s): teacher narrates the SEL skill ("I noticed Maya paused, took a breath, and then asked her partner to repeat the question. That is self-regulation.").' || char(10) ||
       '  4. Practice (90s): students rehearse that single skill in pairs.' || char(10) || char(10) ||
       'Sample teacher script: "Today we are practicing self-regulation. Watch what I do when I notice my own frustration rising. [Teacher pauses, takes a breath.] That pause is the skill. Today, your job is to try that pause one time when you feel stuck."',
       collaboration_prompts = 'Bring your rebuilt SEL routine to your next PLC. Ask one colleague to watch you run it (live or via a 2-minute video) and give you one piece of feedback on pacing and one on student response. Offer to return the favor.',
       family_engagement_notes = 'Send families a 2-sentence note: "This month we are practicing [SEL skill] during morning meeting. At home you can reinforce it by [one concrete thing: e.g., naming emotions at dinner, asking your child what they noticed]." Translate into the languages of your class.',
       contextual_differentiation = 'Elementary: use visual feelings-cards, picture-book examples, and puppet modeling. Lessons should fit in 5-10 minutes.' || char(10) ||
       'Secondary: frame SEL as executive-function / leadership skill, use case studies drawn from the content area (lab partners, group debate, team sport), and keep each mini-lesson to 5 minutes so it does not eat instructional time.'
 WHERE indicator_id = 14;

-- B.e modules — classroom routines (indicator_id = 15)
UPDATE pd_modules
   SET modeling_examples = 'Example: the 3-sentence transition rehearsal (Lemov 2021, Technique 30).' || char(10) || char(10) ||
       '  1. Name it: "We are going to switch from partner work to whole group. That means materials down, eyes on me, in 10 seconds."' || char(10) ||
       '  2. Rehearse it: "Let us practice. Materials down, eyes on me. [Count 10-1.]"' || char(10) ||
       '  3. Affirm / reset: "Back row was clean. Front row — let us do that one more time."' || char(10) || char(10) ||
       'Time the transition. Aim to move from 45 seconds to 20 seconds over two weeks.',
       collaboration_prompts = 'Swap routine scripts with a grade-level teammate. Observe each other for 5 minutes and time transitions. Debrief in 10 minutes: what did the other teacher do differently, and what could you steal?',
       family_engagement_notes = 'Share your posted routines with families once a month ("here is how we line up / turn in work / start class"). Invite feedback on what is working at home.',
       contextual_differentiation = 'Elementary: post routines with pictures, rehearse daily for the first two weeks, use a visual count-down timer.' || char(10) ||
       'Secondary: keep routines in a pinned digital agenda, rehearse once per new procedure, and tie transitions to instructional stakes ("each saved minute = one more problem we get to practice").'
 WHERE indicator_id = 15;

-- E.c modules — communication with families (indicator_id = 43)
UPDATE pd_modules
   SET modeling_examples = 'Example: unit overview that families can actually use (1 page):' || char(10) || char(10) ||
       '  • What we are learning (2 sentences, plain language, no jargon).' || char(10) ||
       '  • Key vocabulary (3-5 words with family-friendly definitions).' || char(10) ||
       '  • What a successful student will be able to do by the end of the unit.' || char(10) ||
       '  • Two questions families can ask at home ("Can you show me how to ___?").' || char(10) ||
       '  • How to reach me (phone, email, office hours) and best day of the week for a quick check-in.' || char(10) || char(10) ||
       'Sample call script: "Hi, this is [name] calling about [student]. I am calling because I want you to know one thing that is going well this week in our class, and one thing we are working on. Do you have two minutes?"',
       collaboration_prompts = 'Share your unit overview draft with a colleague and get feedback on whether it would make sense to a family member without an education background. Co-plan a curriculum night agenda with grade-level teammates so families get a consistent experience.',
       family_engagement_notes = 'Equity first: assume families speak languages other than English, may not have reliable internet, and may work during typical "parent night" hours. Offer a printed copy, a translated version (use district translation support or Google Translate + a native-speaker colleague to check), and either a daytime or evening option for any live event. Ask families directly (survey, phone, paper slip) what time works for them.',
       contextual_differentiation = 'Elementary: send a physical copy home in the backpack AND email, include a picture of the teacher, invite families to reply with their preferred name and language.' || char(10) ||
       'Secondary: post the unit overview in the LMS, text families a short "here is what we are doing and here is how to ask about it" blurb on day 1 of the unit, and give students a copy to discuss at home.'
 WHERE indicator_id = 43;
