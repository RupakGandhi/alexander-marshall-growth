#!/usr/bin/env node
// ============================================================================
// Generator for migration 0010 — Level 3 → 4 (Highly Effective) PD modules.
//
// Produces 60 INSERT statements (one per Marshall indicator) using the same
// 8-step Learn → Practice → Apply scaffold as the 120 existing modules, but
// reframed for the Effective → Highly Effective transition: modeling for
// colleagues, leading the practice, innovating beyond the rubric, building
// sustained student impact, disseminating to the building.
//
// Idempotency: each row is guarded by NOT EXISTS so re-running is safe.
//
// Run:  node scripts/gen_level3_modules.cjs > migrations/0010_level3_pd_modules.sql
// ============================================================================

// Title pattern: "Level 3 → 4: <highly-effective verb phrase tied to the indicator>"
// Each indicator gets a custom verb that matches what 'Highly Effective' looks
// like for THAT indicator on the Marshall rubric.
const TITLES = {
  // Domain A — Planning and Preparation for Learning
  1:  'Modeling deep subject-matter expertise so colleagues seek you out as a content resource',
  2:  'Becoming the grade-level standards expert your team consults when unpacking new units',
  3:  'Publishing a model unit that colleagues adopt and adapt across the building',
  4:  'Designing district-grade assessments and coaching colleagues to do the same',
  5:  'Building a shared bank of anticipated misconceptions for your team to use',
  6:  'Crafting model lessons that colleagues observe, debrief, and replicate',
  7:  'Designing signature engagement experiences other teachers ask to learn from',
  8:  'Curating the materials library your grade level or department uses',
  9:  'Leading your team to plan deeply differentiated lessons together',
  10: 'Building a classroom environment colleagues tour as an exemplar',
  // Domain B — Classroom Management
  11: 'Coaching colleagues on establishing classroom expectations that actually hold',
  12: 'Modeling teacher-student relationship-building that transforms hard-to-reach students',
  13: 'Building a building-wide respect culture by modeling and naming the moves',
  14: 'Leading SEL implementation for your grade level or department',
  15: 'Coaching colleagues to design routines that recover instructional minutes',
  16: 'Modeling student-accountability conversations colleagues then adopt',
  17: 'Sharing your de-escalation repertoire with colleagues through coaching cycles',
  18: 'Auditing instructional-time efficiency across your team and recovering lost minutes',
  19: 'Coaching colleagues on proactive classroom-presence moves that prevent disruption',
  20: 'Leading your team away from compliance rewards toward intrinsic-motivation systems',
  // Domain C — Delivery of Instruction
  21: 'Modeling high-expectations language and pushback colleagues observe and try',
  22: 'Leading building-wide growth-mindset implementation through visible teacher moves',
  23: 'Coaching colleagues to make learning goals the center of every lesson',
  24: 'Building a shared protocol for activating prior knowledge that your team uses',
  25: 'Modeling explanations and academic-language moves that colleagues script and try',
  26: 'Coaching colleagues to expand their instructional repertoire through peer observation',
  27: 'Leading the implementation of high-engagement strategies across your team',
  28: 'Designing personalized learning routines your team adopts',
  29: 'Modeling on-the-fly instructional adjustments that colleagues study via video',
  30: 'Designing transfer-task structures your team uses across the building',
  // Domain D — Monitoring, Assessment, and Follow-up
  31: 'Building shared exemplars and rubrics your team and department use',
  32: 'Leading data-driven diagnostic conversations in your PLC',
  33: 'Modeling rapid formative-assessment routines colleagues observe and adopt',
  34: 'Coaching colleagues to build student self-assessment capacity in their classrooms',
  35: 'Modeling specific, learning-focused recognition language for colleagues',
  36: 'Leading interim-assessment data analysis cycles for your team',
  37: 'Coaching colleagues on building student tenacity through productive struggle',
  38: 'Designing the tiered-support system your team uses for struggling students',
  39: 'Leading equity-focused data analysis across student subgroups',
  40: 'Modeling reflective practice that drives colleague growth in your PLC',
  // Domain E — Family and Community Outreach
  41: 'Coaching colleagues on culturally responsive family communication',
  42: 'Leading your team in reframing family conversations around student strengths',
  43: 'Modeling clear, two-way family-school goal-setting colleagues then adopt',
  44: 'Building the building-wide family-communication system your colleagues use',
  45: 'Designing meaningful family-involvement routines other teachers replicate',
  46: 'Leading your team to design homework that genuinely supports family partnership',
  47: 'Building a responsiveness standard your team aspires to (and tracks)',
  48: 'Modeling jargon-free progress reporting that colleagues then write like',
  49: 'Leading proactive outreach to historically disengaged families across your team',
  50: 'Building the community-partnership network your school relies on',
  // Domain F — Professional Responsibilities
  51: 'Modeling reliability and preparedness that colleagues across the building emulate',
  52: 'Coaching colleagues on professional language and trust-building communication',
  53: 'Becoming the colleague leadership counts on for high-stakes work',
  54: 'Representing the profession in a way that elevates the school district-wide',
  55: 'Mentoring colleagues through ethical and judgment-call situations',
  56: 'Leading school-improvement work that reaches beyond your own classroom',
  57: 'Stepping into formal teacher-leader roles (department chair, instructional coach, PLC lead)',
  58: 'Coaching colleagues on receiving feedback and turning it into changed practice',
  59: 'Leading the PLC or department to co-plan, co-analyze, and co-revise practice',
  60: 'Pursuing advanced credentials, leading PD, or publishing your practice to influence the field',
};

// Indicator name lookup — drives the {Indicator} placeholder in scaffolded content.
const INAMES = {
  1:'Knowledge', 2:'Standards', 3:'Units', 4:'Assessments', 5:'Anticipation',
  6:'Lessons', 7:'Engagement', 8:'Materials', 9:'Differentiation', 10:'Environment',
  11:'Expectations', 12:'Relationships', 13:'Respect', 14:'Social-emotional', 15:'Routines',
  16:'Responsibility', 17:'Repertoire (behavior)', 18:'Efficiency', 19:'Prevention', 20:'Incentives',
  21:'Expectations', 22:'Mindset', 23:'Goals', 24:'Connections', 25:'Clarity',
  26:'Repertoire (instruction)', 27:'Engagement', 28:'Differentiation', 29:'Nimbleness', 30:'Application',
  31:'Criteria', 32:'Diagnosis', 33:'On-the-Spot', 34:'Self-Assessment', 35:'Recognition',
  36:'Interims', 37:'Tenacity', 38:'Support', 39:'Analysis', 40:'Reflection',
  41:'Respect', 42:'Belief', 43:'Expectations', 44:'Communication', 45:'Involving',
  46:'Homework', 47:'Responsiveness', 48:'Reporting', 49:'Outreach', 50:'Resources',
  51:'Attendance', 52:'Language', 53:'Reliability', 54:'Professionalism', 55:'Judgment',
  56:'Above-and-beyond', 57:'Leadership', 58:'Openness', 59:'Collaboration', 60:'Growth',
};

// Domain + indicator code lookup for the subtitle (so it matches existing modules).
const CODES = {
  1:'A.A', 2:'A.B', 3:'A.C', 4:'A.D', 5:'A.E', 6:'A.F', 7:'A.G', 8:'A.H', 9:'A.I', 10:'A.J',
  11:'B.A', 12:'B.B', 13:'B.C', 14:'B.D', 15:'B.E', 16:'B.F', 17:'B.G', 18:'B.H', 19:'B.I', 20:'B.J',
  21:'C.A', 22:'C.B', 23:'C.C', 24:'C.D', 25:'C.E', 26:'C.F', 27:'C.G', 28:'C.H', 29:'C.I', 30:'C.J',
  31:'D.A', 32:'D.B', 33:'D.C', 34:'D.D', 35:'D.E', 36:'D.F', 37:'D.G', 38:'D.H', 39:'D.I', 40:'D.J',
  41:'E.A', 42:'E.B', 43:'E.C', 44:'E.D', 45:'E.E', 46:'E.F', 47:'E.G', 48:'E.H', 49:'E.I', 50:'E.J',
  51:'F.A', 52:'F.B', 53:'F.C', 54:'F.D', 55:'F.E', 56:'F.F', 57:'F.G', 58:'F.H', 59:'F.I', 60:'F.J',
};

// SQL-escape any single quote.
const q = (s) => String(s).replace(/'/g, "''");

function buildLearn(iname, code) {
  return `STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on ${iname}. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on ${iname} that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on ${iname}

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for ${iname}. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on ${iname} — others observe your classroom or ask for your planning
  · The practice on ${iname} produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on ${iname}:
  · Colleagues seek out your materials, lesson designs, or coaching moves for ${iname}
  · Student outcomes on ${iname} are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.`;
}

function buildPractice(iname, code) {
  return `STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating ${iname} from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on ${iname}, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on ${iname}.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on ${iname} so colleagues can adopt it.
  • INNOVATE — Try one move on ${iname} that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on ${iname} right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on ${iname}, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on ${iname} is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on ${iname})
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.`;
}

function buildApply(iname, code) {
  return `STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on ${iname}?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on ${iname}
  3. The COLLEAGUE-IMPACT evidence — proof that another educator's practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on ${iname}, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on ${iname} is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.`;
}

function buildDeliverablePrompt(iname, code) {
  return `SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on ${iname}.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on ${iname} are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on ${iname} produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on ${iname}.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on ${iname}? What would you tell a colleague trying this for the first time?`;
}

function buildRubric(iname, code) {
  return `YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on ${iname} — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate's plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on ${iname}.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"`;
}

function buildResources(iname, code) {
  return JSON.stringify([
    { title: "The Skillful Teacher", source: "Jon Saphier (Research for Better Teaching)", type: "book" },
    { title: "Teacher Evaluation Rubric — Highly Effective level", source: "Kim Marshall", type: "framework" },
    { title: "Instructional Rounds in Education", source: "City, Elmore, Fiarman & Teitel (Harvard)", type: "book" },
  ]).replace(/'/g, "''");
}

// ----------------------------------------------------------------------------
// Emit migration
// ----------------------------------------------------------------------------
console.log(`-- ============================================================================
-- Migration 0010 — Level 3 → 4 (Highly Effective) PD modules
-- ----------------------------------------------------------------------------
-- Adds the missing third transition for all 60 Marshall indicators. Mirrors
-- the schema and content scaffold of the existing Level 1 → 2 and Level 2 → 3
-- modules (8-step Learn → Practice → Apply, deliverable prompt + rubric,
-- research resources). Titles use the same sentence-case Marshall-aligned
-- pattern as migration 0009.
--
-- These modules are MANUAL-ONLY: the auto-enrollment threshold is score ≤ 2,
-- so Level 3 → 4 modules are surfaced through (a) self-selection by a teacher
-- pushing toward Highly Effective, (b) coach or appraiser recommendation,
-- or (c) the Fix 9 PD Module Coverage Gap report.
--
-- Idempotent: INSERT guarded by NOT EXISTS on (indicator_id, target_level,
-- 'Level 3 → 4:' title prefix).
-- ============================================================================
`);

for (let id = 1; id <= 60; id++) {
  const title = `Level 3 → 4: ${TITLES[id]}`;
  const subtitle = `Marshall indicator ${CODES[id]} · ${INAMES[id]} — move from Effective to Highly Effective`;
  const iname = INAMES[id];
  const code = CODES[id];

  const learn = buildLearn(iname, code);
  const practice = buildPractice(iname, code);
  const apply = buildApply(iname, code);
  const dprompt = buildDeliverablePrompt(iname, code);
  const drubric = buildRubric(iname, code);
  const resources = buildResources(iname, code);

  console.log(`
-- ${code} ${iname} — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  ${id}, 3,
  '${q(title)}',
  '${q(subtitle)}',
  60,
  '${q('Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.')}',
  '${q(learn)}',
  '${q(practice)}',
  '${q(apply)}',
  '${q(dprompt)}',
  '${q(drubric)}',
  '${resources}',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = ${id} AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);`);
}
