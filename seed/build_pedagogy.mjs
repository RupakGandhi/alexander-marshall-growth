#!/usr/bin/env node
/**
 * Pedagogy Library Generator
 * ---------------------------------------------------------------------------
 * Generates seed SQL (002_pedagogy_library.sql) for 60 Marshall indicators × 4
 * levels = 240 rows of structured, research-grounded pedagogy guidance.
 *
 * Each entry contains:
 *   - interpretation:  what the score means in plain language
 *   - evidence_signals: JSON array of observable signals at this level
 *   - teacher_next_moves: JSON array of concrete research-backed strategies
 *   - coaching_considerations: JSON array of moves for the instructional coach
 *   - resources: JSON array of {title, source, type} references
 *   - feedback_starter: editable draft sentence(s) for the principal's feedback
 *
 * Grounded in: Kim Marshall (2014), Charlotte Danielson Framework, Robert
 * Marzano (The Art and Science of Teaching), John Hattie (Visible Learning),
 * Doug Lemov (Teach Like a Champion 3.0), Jim Knight (Instructional Coaching),
 * Carol Dweck (Mindset), Wiliam (Embedded Formative Assessment), Saphier
 * (The Skillful Teacher).
 *
 * Usage:  node build_pedagogy.mjs  >  002_pedagogy_library.sql
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const esc = (s) => String(s).replace(/'/g, "''");
const j = (arr) => esc(JSON.stringify(arr));

// ---------------------------------------------------------------------------
// Shared language patterns per level
// ---------------------------------------------------------------------------
const LEVEL_LABEL = { 4: 'Highly Effective', 3: 'Effective', 2: 'Improvement Necessary', 1: 'Does Not Meet Standards' };

const FEEDBACK_OPENER = {
  4: (indicator) => `Your practice in ${indicator.toLowerCase()} reflects mastery-level work that should be named, preserved, and shared with colleagues.`,
  3: (indicator) => `Your ${indicator.toLowerCase()} is solid and professionally sound — the kind of steady, student-centered practice the Marshall rubric describes as Effective.`,
  2: (indicator) => `Your ${indicator.toLowerCase()} shows the right instincts, but the evidence from the observation tells me we have room to lift this area to Effective with a targeted next step.`,
  1: (indicator) => `I want to be direct and supportive at the same time: your ${indicator.toLowerCase()} is not yet meeting the standard our students deserve, and this needs to be an immediate focus area with coaching support.`,
};

// Canonical resources library (all open-source / widely available)
const RES = {
  marshallBook:   { title: 'Rethinking Teacher Supervision and Evaluation', source: 'Kim Marshall (Jossey-Bass, 2009)', type: 'book' },
  hattie:         { title: 'Visible Learning for Teachers', source: 'John Hattie (Routledge, 2012)', type: 'book' },
  lemov:          { title: 'Teach Like a Champion 3.0', source: 'Doug Lemov (Jossey-Bass, 2021)', type: 'book' },
  marzano:        { title: 'The Art and Science of Teaching', source: 'Robert Marzano (ASCD, 2007)', type: 'book' },
  danielson:      { title: 'Enhancing Professional Practice: A Framework for Teaching', source: 'Charlotte Danielson (ASCD, 2nd ed.)', type: 'book' },
  wiliam:         { title: 'Embedded Formative Assessment', source: 'Dylan Wiliam (Solution Tree, 2nd ed., 2018)', type: 'book' },
  dweck:          { title: 'Mindset: The New Psychology of Success', source: 'Carol Dweck (Ballantine, 2006)', type: 'book' },
  knight:         { title: 'The Impact Cycle', source: 'Jim Knight (Corwin, 2017)', type: 'book' },
  ubd:            { title: 'Understanding by Design', source: 'Wiggins & McTighe (ASCD, 2005)', type: 'book' },
  saphier:        { title: 'The Skillful Teacher', source: 'Saphier, Haley-Speca, & Gower (RBT, 7th ed.)', type: 'book' },
  bloom:          { title: 'Bloom\'s Revised Taxonomy', source: 'Anderson & Krathwohl (2001)', type: 'framework' },
  edutopia:       { title: 'Edutopia Classroom Strategies library', source: 'George Lucas Educational Foundation', type: 'web' },
  ascdLearn:      { title: 'ASCD \'Educational Leadership\' archives', source: 'ASCD', type: 'journal' },
  responsive:     { title: 'Responsive Classroom: The Morning Meeting Book', source: 'Center for Responsive Schools', type: 'book' },
  casel:          { title: 'CASEL SEL Framework and Competencies', source: 'casel.org', type: 'framework' },
  epstein:        { title: 'School, Family, and Community Partnerships', source: 'Joyce Epstein (Corwin)', type: 'book' },
  ndCurriculum:   { title: 'North Dakota Content Standards', source: 'www.nd.gov/dpi', type: 'state-standard' },
};

// ---------------------------------------------------------------------------
// Pedagogy content by indicator_id × level
// Each entry returns: { interpretation, evidence, moves, coaching, resources, feedback }
// ---------------------------------------------------------------------------

// Utility: builds a complete 4-level record for an indicator with
// sensible patterns, while allowing per-indicator overrides.
function build(indicator_id, indicator_name, perLevel) {
  const rows = [];
  for (const level of [4, 3, 2, 1]) {
    const d = perLevel[level];
    const feedback =
      (FEEDBACK_OPENER[level](indicator_name) + ' ' + (d.feedback || '')).trim();
    rows.push({
      indicator_id,
      level,
      interpretation: d.interpretation,
      evidence: d.evidence,
      moves: d.moves,
      coaching: d.coaching,
      resources: d.resources || [],
      feedback,
    });
  }
  return rows;
}

// ===========================================================================
// DOMAIN A — Planning & Preparation for Learning
// ===========================================================================
const all = [];

all.push(...build(1, 'Knowledge', {
  4: {
    interpretation: 'The teacher demonstrates expert-level command of content AND keeps current with research on how children develop and learn. Content choices are deliberate, accurate, and connected to how the brain forms schema in this subject.',
    evidence: [
      'Uses precise academic vocabulary fluently and defines it for students',
      'Makes cross-disciplinary connections without being asked',
      'Corrects misconceptions on the fly with correct disciplinary reasoning',
      'References current research or recent professional reading in planning',
    ],
    moves: [
      'Share your content expertise by co-planning with a less experienced teammate',
      'Present a 10-minute content deep-dive at your next PLC meeting',
      'Keep a "misconception log" of the content questions students ask — feed it into next year\'s unit plans',
    ],
    coaching: [
      'Pair this teacher as a content anchor on the grade-level team',
      'Invite them to model-teach a unit opening while peers observe',
    ],
    resources: [RES.marshallBook, RES.saphier, RES.danielson],
    feedback: 'Keep doing the intellectual work of staying current — your students are getting the benefit of a scholar in front of them.',
  },
  3: {
    interpretation: 'Content and developmental knowledge are solid and reliable. Students get accurate instruction and the teacher can flex when a student asks an unexpected question.',
    evidence: [
      'Explanations are accurate and age-appropriate',
      'Minor misconceptions are caught and corrected',
      'Shows awareness of how students this age typically reason about the content',
    ],
    moves: [
      'Pick one unit this semester and read one recent article on how children learn that specific topic',
      'Build a "key misconceptions" section into each unit plan',
      'Map content to the North Dakota content standards at the sub-standard level',
    ],
    coaching: [RES.marshallBook, RES.ndCurriculum].map(x => x.title),
    resources: [RES.marshallBook, RES.ndCurriculum],
    feedback: 'Your content base is reliable; the next growth move is from confident to scholarly by layering in research on how students develop in this specific subject.',
  },
  2: {
    interpretation: 'The teacher can get through the content as it is scripted, but gaps show when students push past the surface or when the curriculum asks for disciplinary reasoning.',
    evidence: [
      'Relies heavily on textbook phrasing',
      'Hesitates or deflects when students ask "why"',
      'Occasional factual inaccuracies that go uncorrected',
    ],
    moves: [
      'Pre-read the next three units and identify the five concepts you least understand — study those first',
      'Partner with a content-strong colleague for weekly 20-minute content reviews',
      'Use a content self-assessment against state standards and flag your growth areas',
    ],
    coaching: [
      'Set up a weekly 20-minute content study block with a strong peer',
      'Observe a strong content model in another classroom for the next unit',
    ],
    resources: [RES.saphier, RES.ndCurriculum],
    feedback: 'Closing this gap is not about effort — it is about study time. Let\'s protect weekly content-study time on your calendar and re-check at the next observation.',
  },
  1: {
    interpretation: 'Content knowledge gaps are broad enough that students are receiving inaccurate or incoherent instruction. This is a classroom-integrity issue that requires an immediate plan.',
    evidence: [
      'Multiple content errors per observation',
      'Cannot answer foundational student questions in the subject',
      'Curriculum sequencing reflects misunderstanding of the discipline',
    ],
    moves: [
      'Work with the principal to identify a content mentor this week',
      'Begin daily content study for 30 minutes before unit delivery',
      'Submit weekly content-preparation plans for appraiser review',
    ],
    coaching: [
      'Assign a dedicated content mentor',
      'Build a 30/60/90-day content-competency improvement plan with weekly check-ins',
    ],
    resources: [RES.saphier, RES.marshallBook],
    feedback: 'We will build a short, specific content-study plan together this week and I will check in with you daily for the first two weeks.',
  },
}));

all.push(...build(2, 'Standards', {
  4: {
    interpretation: 'The year is architected against standards and external assessments — not assembled lesson-by-lesson. Every unit can be traced back to specific standards and the summative assessments students will eventually face.',
    evidence: [
      'Year-at-a-glance document posted or shared with coach/appraiser',
      'Unit plans explicitly cite the ND standards they address',
      'Curriculum maps show vertical alignment to prior and next grade',
    ],
    moves: [
      'Share your year-at-a-glance with the team as a model',
      'Audit once per semester for standards gaps or over-coverage',
    ],
    coaching: ['Invite this teacher to help lead next year\'s curriculum mapping work.'],
    resources: [RES.ubd, RES.ndCurriculum],
    feedback: 'Your backward-planned year is a model of what the Marshall rubric means by "tightly aligned to high standards."',
  },
  3: {
    interpretation: 'Standards alignment is real. The year is planned against standards, and students will be prepared for external assessments at a level that meets expectations.',
    evidence: ['Unit plans reference standards', 'Pacing guide is followed', 'Assessments match standards at reasonable rigor'],
    moves: [
      'Move from "standard referenced" to "standard anchored" by adding an essential question and a measurable performance goal to each unit',
      'Build a simple end-of-year backward map from the state assessment back to Week 1',
    ],
    coaching: ['Co-plan one unit using a UbD backward-design template.'],
    resources: [RES.ubd, RES.ndCurriculum],
    feedback: 'Your alignment work is where it should be; the highest-leverage next move is to go from \'referenced\' to backward-designed from the end-of-year assessment.',
  },
  2: {
    interpretation: 'Some thinking has happened about standards and tests, but planning is still largely lesson-by-lesson rather than unit-by-unit or year-by-year.',
    evidence: ['Standards appear in some lesson plans but not all', 'No written pacing guide', 'Summative assessments appear without explicit standards mapping'],
    moves: [
      'This month: write a one-page pacing guide against the ND standards for the remainder of the year',
      'Pick one upcoming unit and map every lesson objective to a specific sub-standard',
      'Identify the three highest-leverage standards the state assessment will test and double-plan them',
    ],
    coaching: ['Co-build a one-page pacing guide in the next coaching session.'],
    resources: [RES.ndCurriculum, RES.ubd],
    feedback: 'The fastest path to Effective here is a one-page pacing guide we can build together in about 45 minutes.',
  },
  1: {
    interpretation: 'Planning is reactive. The teacher is unfamiliar with the standards their students will be tested on, which means students are at real risk of not being prepared.',
    evidence: ['No written pacing guide', 'Cannot identify which standards a lesson addresses', 'State-assessment rigor is unfamiliar'],
    moves: ['Meet with the principal this week to build an emergency pacing plan for the rest of the year', 'Review the ND standards document for your grade/subject before the next planning session'],
    coaching: ['Require a written weekly plan with standards cited, reviewed by appraiser.'],
    resources: [RES.ndCurriculum],
    feedback: 'We need to build you a pacing plan this week. I will block time on both of our calendars.',
  },
}));

all.push(...build(3, 'Units', {
  4: {
    interpretation: 'Units are designed, not just sequenced. They contain big ideas, essential questions, and a deliberate mix of Bloom\'s levels from recall all the way to creation.',
    evidence: ['Essential questions posted', 'Units include explicit knowledge AND skill goals', 'Students can articulate the big idea of the unit mid-unit'],
    moves: ['Share a unit map with the team as a UbD model', 'Start a unit artifact library the school can reuse'],
    coaching: ['Invite this teacher to lead a unit-design session with peers.'],
    resources: [RES.ubd, RES.bloom],
    feedback: 'Your unit architecture models what Wiggins & McTighe call "backward design."',
  },
  3: {
    interpretation: 'Most units have the elements of good design — big ideas, essential questions, mix of Bloom\'s — but not always consistently.',
    evidence: ['Most units have essential questions', 'Higher-order thinking shows up but is uneven across units'],
    moves: ['Use a one-page unit template for every unit this semester', 'Aim for at least 30% of lesson activities at Bloom\'s Analyze level or higher'],
    coaching: ['Co-design one under-developed unit using UbD.'],
    resources: [RES.ubd, RES.bloom],
    feedback: 'Pick the weakest unit on your calendar and rebuild it backward from a performance task — that single redesign will move you toward Highly Effective.',
  },
  2: {
    interpretation: 'Planning is happening mostly at the lesson level. Larger structure and higher-order thinking are thought about, but not intentionally designed into the work students do.',
    evidence: ['Lesson plans exist but no unit-level planning document', 'Activities skew toward Remember/Understand on Bloom\'s'],
    moves: ['Adopt a one-page unit plan template starting with the next unit', 'Audit the next week of lessons against Bloom\'s — add at least two Analyze/Evaluate tasks'],
    coaching: ['Co-plan the next unit together end-to-end.'],
    resources: [RES.ubd, RES.bloom],
    feedback: 'Moving your planning lens from \'lesson\' to \'unit\' is the unlock here. Let\'s co-plan the next unit.'
  },
  1: {
    interpretation: 'Teaching is ad hoc day-to-day. There is no discernible larger structure and students cannot articulate what they are supposed to be learning over time.',
    evidence: ['No unit plan exists', 'Lessons do not build on each other', 'Students cannot describe the arc of the unit'],
    moves: ['This week: build one unit plan with essential question, knowledge goals, and skill goals'],
    coaching: ['Provide a unit template and co-author two units over the next three weeks.'],
    resources: [RES.ubd],
    feedback: 'We are going to build unit plans together — starting this week — because students need a coherent through-line.',
  },
}));

all.push(...build(4, 'Assessments', {
  4: {
    interpretation: 'A full assessment system is planned: diagnostic, on-the-spot (formative), interim, and summative. Assessment decisions are designed before instruction, not after.',
    evidence: ['Diagnostic at unit start', 'Frequent formative checks', 'Interim assessments every 4-6 weeks', 'Summatives aligned to standards and rubrics'],
    moves: ['Share your assessment system with the team', 'Run one data meeting around an interim assessment'],
    coaching: ['Invite to lead a data-team session.'],
    resources: [RES.wiliam, RES.ubd],
    feedback: 'Your planned assessment system is exactly what Wiliam calls "assessment for learning."',
  },
  3: {
    interpretation: 'The teacher plans formative checks and unit assessments. Some, but not all, of the pieces of a full system are present.',
    evidence: ['Formative checks show up in lessons', 'Unit tests exist and are planned in advance'],
    moves: ['Add a diagnostic to at least two units this semester', 'Introduce one mid-unit interim check'],
    coaching: ['Co-design a diagnostic and an interim for the next unit.'],
    resources: [RES.wiliam],
    feedback: 'Add a diagnostic and an interim to the units you already have — that\'s the move toward Highly Effective.',
  },
  2: {
    interpretation: 'Unit tests are being drafted as the unit unfolds rather than designed before instruction begins. Assessment is an afterthought rather than a design driver.',
    evidence: ['Tests are created late in the unit', 'Formative checks are rare or informal', 'Rubrics are not shared with students'],
    moves: ['Write the summative BEFORE teaching the next unit', 'Add 3-5 formative checks per week', 'Share the rubric with students on day 1'],
    coaching: ['Co-write the summative for the next unit together before teaching begins.'],
    resources: [RES.ubd, RES.wiliam],
    feedback: 'Writing the summative before the unit starts reverses the design and will sharpen every lesson in between.',
  },
  1: {
    interpretation: 'Final tests are written just before they are given. This means instruction cannot be aligned to what is being measured, and student learning is not being monitored.',
    evidence: ['Tests appear the week they are given', 'No formative checks', 'No rubrics'],
    moves: ['Stop this practice this week — every new unit must begin with a written summative'],
    coaching: ['Require summatives to be submitted to appraiser before the unit begins.'],
    resources: [RES.ubd],
    feedback: 'This pattern must change starting with the next unit; I will help you design the summative.'
  },
}));

all.push(...build(5, 'Anticipation', {
  4: {
    interpretation: 'The teacher has deeply studied how students get confused with this content and has multiple pre-planned strategies to address each likely misconception.',
    evidence: ['Unit plans include a misconceptions section', 'Teacher cites specific student confusions in advance', 'Teacher has "if/then" contingencies for the top 3-5 likely misconceptions'],
    moves: ['Add a "top misconceptions" companion to each unit plan as a PD contribution'],
    coaching: ['Let this teacher lead a "student thinking" PD session.'],
    resources: [RES.saphier, RES.hattie],
    feedback: 'Your anticipation of student thinking is the hallmark of a master teacher — keep recording these patterns.',
  },
  3: {
    interpretation: 'The teacher anticipates common misconceptions and plans to address them. This is the essential teacher mindset that makes instruction responsive.',
    evidence: ['Misconceptions named in planning conversations', 'Teacher can tell you what students will get wrong and why'],
    moves: ['Write the top 2 misconceptions into each lesson plan', 'Collect student thinking samples over the unit to refine your anticipation bank'],
    coaching: ['Do a "cognitive task analysis" of one tricky lesson together.'],
    resources: [RES.saphier, RES.hattie],
    feedback: 'Pushing from 1-2 anticipated misconceptions per unit to 3-5 with specific plans will move this to Highly Effective.',
  },
  2: {
    interpretation: 'There is a loose hunch about where students might struggle, but not a planned strategy to surface or repair the misconception.',
    evidence: ['Teacher can name "something might be hard" but not a specific student-thinking error', 'No repair plan'],
    moves: ['Before each upcoming lesson, write one sentence: "Where will students probably get this wrong, and what will I do?"', 'Ask students what confused them — document patterns'],
    coaching: ['Use a student-thinking protocol on student work samples in the next coaching cycle.'],
    resources: [RES.hattie],
    feedback: 'One sentence per lesson — "where will students trip, and what will I do?" — closes most of this gap in a few weeks.',
  },
  1: {
    interpretation: 'Instruction is delivered as if students will all understand the first time. When students struggle, the teacher is surprised and has no repair plan.',
    evidence: ['No misconceptions planning', 'Teacher blames students for confusion', 'No repair strategies'],
    moves: ['Begin adding a "confusion check" to every lesson plan starting next week'],
    coaching: ['Co-plan three lessons and insist on a written misconception section for each.'],
    resources: [RES.saphier, RES.hattie],
    feedback: 'The frame to internalize: student confusion is information, not failure. We will work this together lesson-by-lesson.',
  },
}));

all.push(...build(6, 'Lessons', {
  4: {
    interpretation: 'Every lesson has a clear, measurable objective tightly anchored to standards AND to the larger unit. Students always know what they are learning, why, and how it fits.',
    evidence: ['Objective is posted in student-friendly language', 'Objective is measurable (students can do X by end of lesson)', 'Students can restate the objective mid-lesson'],
    moves: ['Share your lesson template with the team', 'Add a "how this lesson fits the unit" line to your template if not already there'],
    coaching: ['Use this teacher as a model in a lesson-design workshop.'],
    resources: [RES.marzano, RES.lemov],
    feedback: 'Your lesson design models what Marzano calls "clear learning goals" — students always know where they are going.',
  },
  3: {
    interpretation: 'Lessons are built around measurable outcomes aligned with unit goals. Students have a clear sense of what they are learning.',
    evidence: ['Objectives are stated and measurable', 'Lessons connect to unit outcomes'],
    moves: ['Tighten objectives to SWBAT + measurable verb + condition format', 'Open each lesson with a 30-second "why this matters" hook'],
    coaching: ['Co-write 3 lesson objectives together using a precise verb bank.'],
    resources: [RES.marzano, RES.lemov],
    feedback: 'Sharpen your objective language — measurable verbs and conditions — and this jumps to Highly Effective quickly.',
  },
  2: {
    interpretation: 'There is thought behind each lesson but the connection to long-term goals is loose. Objectives exist but are general.',
    evidence: ['Objectives are broad ("Students will learn about fractions")', 'Lessons do not clearly accumulate toward a unit goal'],
    moves: ['Rewrite objectives using SWBAT + Bloom\'s verb + measurable condition', 'End each lesson with a check-for-objective mastery'],
    coaching: ['Co-plan three consecutive lessons and check each against the unit destination.'],
    resources: [RES.marzano, RES.bloom],
    feedback: 'Tightening your objective writing and the end-of-lesson mastery check is the move.',
  },
  1: {
    interpretation: 'Lessons are aimed at filling time rather than advancing specific learning. Students are being entertained or simply moved through a textbook.',
    evidence: ['No objective or vague ("today we\'re doing chapter 5")', 'No closure or mastery check', 'Activities with no obvious learning purpose'],
    moves: ['Every lesson plan must begin with a written SWBAT starting this week'],
    coaching: ['Require lesson plans with SWBAT written in advance, submitted daily for two weeks.'],
    resources: [RES.marzano, RES.lemov],
    feedback: 'We are going to require a written SWBAT for every lesson for the next two weeks — this is the base habit.',
  },
}));

all.push(...build(7, 'Engagement (Planning)', {
  4: {
    interpretation: 'Lessons are designed so that most or all students are motivated AND actively learning. Engagement is planned, not hoped for.',
    evidence: ['Lessons include a hook tied to student lives', 'Active learning tasks in every segment', 'Planned checks for all-student involvement'],
    moves: ['Share your engagement planning strategies with the team'],
    coaching: ['Co-present an engagement PD with the coach.'],
    resources: [RES.lemov, RES.marzano],
    feedback: 'You plan engagement the way Lemov describes it — as architecture, not accident.',
  },
  3: {
    interpretation: 'Lessons are designed to be relevant and likely to engage most students.',
    evidence: ['Relevance hooks are present', 'Most students appear on-task in designed tasks'],
    moves: ['Layer in a planned turn-and-talk or cold-call sequence every 7-10 minutes', 'Plan for the 20% you lose most often and build an engagement move for them'],
    coaching: ['Use an engagement heatmap in the next observation.'],
    resources: [RES.lemov],
    feedback: 'Lifting this to Highly Effective is about designing for the hardest-to-reach students in the room — not the middle.',
  },
  2: {
    interpretation: 'Lessons might spark some student interest, but engagement isn\'t the design driver. A few students will engage; many will coast.',
    evidence: ['Occasional relevance hooks', 'Most lesson time is passive'],
    moves: ['Redesign the next three lessons to include at least 4 active participation moves (turn-and-talk, cold call, choral response, written response)', 'Start every lesson with a 60-second "hook"'],
    coaching: ['Use TLAC engagement techniques as a coaching focus.'],
    resources: [RES.lemov, RES.marzano],
    feedback: 'Designed active participation moves every 7-10 minutes is the upgrade — let\'s pick three to practice.',
  },
  1: {
    interpretation: 'Lessons are unlikely to motivate or involve most students. The design assumes students will engage themselves.',
    evidence: ['Long stretches of teacher talk', 'Passive tasks', 'Student disengagement visible throughout'],
    moves: ['Add a planned active participation move every 5 minutes to every lesson starting this week'],
    coaching: ['Three-week engagement coaching cycle using TLAC techniques.'],
    resources: [RES.lemov],
    feedback: 'Engagement has to be designed into the lesson, not hoped for — let\'s coach specific techniques this month.',
  },
}));

all.push(...build(8, 'Materials', {
  4: {
    interpretation: 'Materials are deliberately chosen for quality, representation, and fit with learning goals. Technology is used when it adds real value.',
    evidence: ['Multicultural perspectives evident', 'Primary sources where appropriate', 'Technology augments, doesn\'t replace', 'Materials vetted for reading level and accuracy'],
    moves: ['Share your materials vetting criteria with the team'],
    coaching: ['Lead a materials-curation PD.'],
    resources: [RES.ascdLearn, RES.marshallBook],
    feedback: 'Your material selection reflects a curator\'s eye — keep auditing for representation and quality each year.',
  },
  3: {
    interpretation: 'Materials are appropriate, diverse, and support learning. Technology is used reasonably.',
    evidence: ['Mixed media', 'Some multicultural materials', 'Technology used functionally'],
    moves: ['Audit one unit\'s materials for multicultural representation', 'Replace one worksheet per week with a primary source or authentic text'],
    coaching: ['Use a materials-audit tool during the next planning session.'],
    resources: [RES.ascdLearn],
    feedback: 'An annual materials audit for representation and rigor lifts this to Highly Effective.',
  },
  2: {
    interpretation: 'Materials are a mix of quality and convenience. Some strong resources alongside workbook pages and generic worksheets.',
    evidence: ['Over-reliance on textbook or workbook', 'Worksheets dominate', 'Few multicultural materials'],
    moves: ['Swap one worksheet per lesson for a richer task (primary source, short text, problem-based task)', 'Build a unit-level materials list during planning'],
    coaching: ['Co-curate resources for the next unit.'],
    resources: [RES.ascdLearn],
    feedback: 'Small swaps — one worksheet at a time — accumulate quickly into stronger materials.',
  },
  1: {
    interpretation: 'Instruction is built almost entirely on mediocre textbooks, workbooks, or worksheets. Students are doing low-rigor tasks most of the time.',
    evidence: ['Worksheet-dominated lessons', 'No primary sources', 'No technology integration that enhances learning'],
    moves: ['Replace at least one worksheet per lesson with a richer task starting this week'],
    coaching: ['Co-curate materials for the next full unit.'],
    resources: [RES.ascdLearn, RES.marshallBook],
    feedback: 'The worksheet-driven pattern has to end — we will rebuild materials unit by unit starting now.',
  },
}));

all.push(...build(9, 'Differentiation (Planning)', {
  4: {
    interpretation: 'Every lesson is designed with differentiation built in — complex tasks are broken down, and multiple entry points address different learning needs, styles, and interests.',
    evidence: ['Tiered tasks or flexible grouping planned in advance', 'Scaffolds are named in the lesson plan', 'Enrichment options for fast finishers are intentional'],
    moves: ['Share your differentiation planning template with the team'],
    coaching: ['Lead a differentiation design PD.'],
    resources: [RES.danielson, RES.marzano],
    feedback: 'Planned differentiation for all learners is what the Marshall rubric calls "Highly Effective" — keep naming scaffolds explicitly.',
  },
  3: {
    interpretation: 'Differentiation targets several learning needs and interests. Not every student gets a perfectly customized path, but most do.',
    evidence: ['2-3 differentiation moves planned per lesson', 'Tiered questioning', 'Student choice in some tasks'],
    moves: ['Add a specific scaffold for your lowest-readiness learner in every lesson plan', 'Add an enrichment option for your highest-readiness learner'],
    coaching: ['Use a differentiation audit tool in the next coaching cycle.'],
    resources: [RES.danielson],
    feedback: 'Name your differentiation moves in writing on the plan — the discipline of writing them catalyzes more of them.',
  },
  2: {
    interpretation: 'Differentiation happens reactively for special-needs students but isn\'t designed into the lesson for all learners.',
    evidence: ['IEP accommodations show up but nothing else', 'One-size-fits-all tasks for the rest of the class'],
    moves: ['For the next three lessons, plan one scaffold and one enrichment task', 'Review student data before planning to target specific learners'],
    coaching: ['Use student readiness data to co-plan differentiated tasks.'],
    resources: [RES.danielson],
    feedback: 'Moving differentiation from IEP-only to designed-for-all is the next step.',
  },
  1: {
    interpretation: 'Lessons are designed for a mythical "average" student. Students who need more support fall behind; students who need more challenge coast.',
    evidence: ['Identical tasks for all students', 'No scaffolds or extensions', 'No use of student data in planning'],
    moves: ['Begin adding one scaffold and one extension to every lesson plan this week'],
    coaching: ['Three-week coaching cycle on planned differentiation using student data.'],
    resources: [RES.danielson, RES.marzano],
    feedback: 'One scaffold, one extension, every lesson — starting this week. That\'s the base habit.',
  },
}));

all.push(...build(10, 'Environment', {
  4: {
    interpretation: 'The physical classroom is an instructional tool. Arrangement, materials, and displays are all designed to maximize learning.',
    evidence: ['Furniture supports collaborative and individual work', 'Anchor charts are student-generated and current', 'Student work is prominently displayed with rubrics/commentary', 'Materials are easily accessible to students'],
    moves: ['Take photos of your room setup and share with the team'],
    coaching: ['Use this room as a model during new-teacher induction.'],
    resources: [RES.responsive, RES.marzano],
    feedback: 'Your classroom is an instructional tool in itself — keep refreshing anchor charts so they stay a thinking resource.',
  },
  3: {
    interpretation: 'Furniture, materials, and displays support the unit and lesson goals.',
    evidence: ['Current anchor charts posted', 'Flexible seating for different activities', 'Some student work displayed'],
    moves: ['Replace any display older than 30 days', 'Involve students in creating anchor charts'],
    coaching: ['Do a classroom environment audit together.'],
    resources: [RES.responsive],
    feedback: 'Keep anchor charts fresh and student-generated and this moves toward Highly Effective.',
  },
  2: {
    interpretation: 'The classroom is functional for the lesson but doesn\'t do instructional work on its own. Displays are mostly decorative.',
    evidence: ['Static, older displays', 'Decorative rather than instructional posters', 'Materials access requires teacher intermediary'],
    moves: ['Replace decorative displays with unit-aligned anchor charts', 'Build a "materials center" students can access independently'],
    coaching: ['Co-design a classroom refresh tied to the next unit.'],
    resources: [RES.responsive],
    feedback: 'Your walls can teach — let\'s redesign them around your current unit.',
  },
  1: {
    interpretation: 'The room reflects neither current learning nor student work. Arrangement is conventional and disconnected from instruction.',
    evidence: ['Rows of desks unchanging', 'Blank or irrelevant walls', 'No student work displayed'],
    moves: ['Refresh at least three wall displays this week with current unit content'],
    coaching: ['Schedule a classroom environment redesign session with the coach.'],
    resources: [RES.responsive],
    feedback: 'The environment piece is actually the quickest to move — a single afternoon can make a real difference.',
  },
}));

// ===========================================================================
// DOMAIN B — Classroom Management  (indicators 11-20)
// ===========================================================================
all.push(...build(11, 'Expectations', {
  4: {
    interpretation: 'Behavior expectations are communicated and enforced with such clarity, consistency, and tenacity that they feel like the room\'s default setting.',
    evidence: ['Expectations posted and taught, not just posted', 'Teacher responds to every violation — no missed calls', 'Expectations named in student language'],
    moves: ['Share your expectations-teaching plan with the team'],
    coaching: ['Model expectation-teaching for new teachers.'],
    resources: [RES.lemov, RES.responsive],
    feedback: 'Your expectations work is what Lemov calls "100 percent" — preserve that consistency all year.',
  },
  3: {
    interpretation: 'Expectations are clear, consistent, and generally enforced.',
    evidence: ['Posted expectations referenced in class', 'Most violations addressed', 'Tone is calm and professional'],
    moves: ['Close the "miss rate" — commit to addressing 100% of expectation gaps', 'Teach expectations explicitly three times in the first two weeks of any new quarter'],
    coaching: ['Use a tally tool to measure consistency.'],
    resources: [RES.lemov],
    feedback: 'Moving from 90% to 100% consistency is the move toward Highly Effective.',
  },
  2: {
    interpretation: 'Rules exist on the wall but aren\'t actively taught or consistently enforced. Students know the rules in theory but not in practice.',
    evidence: ['Rules posted but not explicitly taught', 'Inconsistent enforcement', 'Selective response to the same behavior'],
    moves: ['Explicitly re-teach expectations next Monday', 'Pre-commit to a specific response for the top 3 misbehaviors', 'Track your consistency with a simple tally for a week'],
    coaching: ['Observe and tally enforcement consistency; debrief weekly.'],
    resources: [RES.lemov, RES.responsive],
    feedback: 'Consistency is the unlock — we can design a specific plan together.',
  },
  1: {
    interpretation: 'Rules and consequences emerge ad hoc. Students have no clear sense of what is expected, and enforcement feels arbitrary.',
    evidence: ['No posted expectations or they\'re ignored', 'Consequences vary wildly for the same behavior', 'Students argue the rules frequently'],
    moves: ['This week: co-create expectations with students and teach them explicitly'],
    coaching: ['Immediate coaching cycle on expectation setting and consistency.'],
    resources: [RES.lemov, RES.responsive],
    feedback: 'We need a reset on expectations — let\'s do that together this week.',
  },
}));

all.push(...build(12, 'Relationships', {
  4: {
    interpretation: 'Students experience genuine warmth, care, respect, and fairness. Strong relationships are visible even in tough moments.',
    evidence: ['Teacher greets students by name at the door', 'Individual check-ins with struggling students', 'Teacher knows non-academic details about students', 'Tough conversations happen privately and restoratively'],
    moves: ['Mentor a teacher growing in relationship skills'],
    coaching: ['Lead relationship-building PD.'],
    resources: [RES.responsive, RES.lemov],
    feedback: 'The relational foundation you\'ve built is what makes every other instructional move stick.',
  },
  3: {
    interpretation: 'Fair and respectful treatment of students is the norm; positive relationships exist with most of the class.',
    evidence: ['Warm interactions', 'Fair corrections', 'No favorites visible'],
    moves: ['Build one individual relationship a week with a student you don\'t know well', 'Greet every student at the door by name'],
    coaching: ['Use a 2x10 relationship-building strategy with disengaged students.'],
    resources: [RES.responsive],
    feedback: 'Targeting the 2-3 students you know least well is the move toward Highly Effective.',
  },
  2: {
    interpretation: 'Some students experience strong relationships; others experience distance, inconsistency, or unintentional favoritism.',
    evidence: ['Stronger rapport with some students', 'Occasional sharp tone with others', 'Unequal investment across the class'],
    moves: ['Use a 2x10 strategy (2 minutes of non-academic conversation for 10 consecutive days) with 3 students you know least', 'Audit your call-ratio — are you calling on the same few students?'],
    coaching: ['2x10 coaching cycle with a focus list of students.'],
    resources: [RES.responsive],
    feedback: 'A 2x10 strategy with three specific students will shift this quickly.',
  },
  1: {
    interpretation: 'Sarcasm, unfairness, or favoritism shows up. Students don\'t trust the teacher to be consistent or caring.',
    evidence: ['Public criticism of students', 'Visible favorites', 'Sharp or dismissive tone'],
    moves: ['Begin a 2x10 strategy with your five most disconnected students this week', 'Remove sarcasm from teacher language'],
    coaching: ['Intensive relationship-building coaching cycle.'],
    resources: [RES.responsive],
    feedback: 'This is the highest-priority growth area — students cannot learn from someone they don\'t trust.',
  },
}));

all.push(...build(13, 'Respect', {
  4: {
    interpretation: 'Student respect is so established that disruption of learning feels unthinkable to the students themselves.',
    evidence: ['Students self-correct and peer-correct', 'Disruption is rare and quickly self-repaired', 'Visitors comment on the learning culture'],
    moves: ['Share your culture-building practices in PD'],
    coaching: ['Feature this classroom for visitors and new teachers.'],
    resources: [RES.lemov, RES.responsive],
    feedback: 'The climate you have built is something colleagues should come see.',
  },
  3: {
    interpretation: 'The teacher commands respect and refuses to allow disruption to eat learning time.',
    evidence: ['Prompt, calm responses to disruption', 'Clear authority without harshness', 'Disruption rare and short-lived'],
    moves: ['Shift from "commanding" respect to students "owning" the learning culture', 'Invite students into culture conversations'],
    coaching: ['Co-lead a student-voice culture session.'],
    resources: [RES.responsive],
    feedback: 'Moving from teacher-held respect to student-owned culture is the next step.',
  },
  2: {
    interpretation: 'Some students respect the teacher and the learning; others don\'t. Disruptions are regular and eat learning time.',
    evidence: ['Regular disruptions', 'Teacher escalates to get control', 'Same students disrupting repeatedly'],
    moves: ['Use stronger narration and non-verbal moves', 'Front-load expectations at start of each class for two weeks', 'Build relationships with chronic disruptors outside class'],
    coaching: ['Lemov-focused coaching cycle on strong voice + what to do.'],
    resources: [RES.lemov],
    feedback: 'We need to close the disruption leak — specific TLAC moves will help.',
  },
  1: {
    interpretation: 'The teacher is not respected. The classroom is frequently chaotic and sometimes unsafe.',
    evidence: ['Chaos is frequent', 'Teacher yells or gives up', 'Student safety concerns'],
    moves: ['Immediate intervention plan with admin support'],
    coaching: ['Daily coaching support for 2-3 weeks; consider classroom-swap shadow of a strong peer.'],
    resources: [RES.lemov, RES.responsive],
    feedback: 'This is an urgent safety and learning issue that needs immediate structured support.',
  },
}));

all.push(...build(14, 'Social-emotional', {
  4: {
    interpretation: 'The classroom runs a real social-emotional program. Students develop interaction skills, self-regulation, and empathy as intentionally as they develop academic skills.',
    evidence: ['Explicit SEL instruction', 'Morning meetings or circle time', 'Students use SEL vocabulary (feelings, strategies)', 'Peer mediation'],
    moves: ['Share your SEL structure with the team'],
    coaching: ['Lead SEL PD.'],
    resources: [RES.casel, RES.responsive],
    feedback: 'Your SEL work reflects what CASEL calls a systemic approach — not an add-on.',
  },
  3: {
    interpretation: 'Positive interactions are the norm and useful social skills are taught when they come up.',
    evidence: ['Positive classroom tone', 'Conflict-resolution language used', 'Students help each other'],
    moves: ['Add explicit SEL mini-lessons once a week', 'Use morning meetings or circle structures'],
    coaching: ['Introduce CASEL five competencies as a planning lens.'],
    resources: [RES.casel, RES.responsive],
    feedback: 'A weekly explicit SEL touch will move this to Highly Effective.',
  },
  2: {
    interpretation: 'Behavior is addressed reactively. Students are lectured rather than taught skills; problem behavior is personalized rather than skill-identified.',
    evidence: ['Public lectures on behavior', 'Bad students narrative', 'No SEL instruction'],
    moves: ['Replace behavior lectures with skill teaching ("We\'re going to practice...")', 'Start explicit SEL instruction'],
    coaching: ['Teach the replacement-behavior lens.'],
    resources: [RES.casel],
    feedback: 'Behavior is a skill — let\'s teach it rather than lecture about it.',
  },
  1: {
    interpretation: 'Students are publicly berated and blamed. This creates an unsafe climate and damages relationships.',
    evidence: ['Public shaming', 'Blame language', 'Unsafe emotional climate'],
    moves: ['Eliminate public shaming starting immediately', 'Conduct private, restorative conversations instead'],
    coaching: ['Immediate coaching on restorative practices.'],
    resources: [RES.responsive],
    feedback: 'Public berating must stop immediately — we will replace it with private, restorative conversations.',
  },
}));

all.push(...build(15, 'Routines', {
  4: {
    interpretation: 'Routines were established and practiced at the start of the year, and students maintain them without reminders all year long.',
    evidence: ['Entry, exit, transitions, materials all automatic', 'Students self-correct routine breaks', 'Instructional time is not lost to procedural friction'],
    moves: ['Share your routine scripts with the team', 'Re-teach routines after long breaks'],
    coaching: ['Use as a model during new-teacher summer training.'],
    resources: [RES.lemov, RES.responsive],
    feedback: 'Your routine work is the invisible engine of your classroom — protect it.',
  },
  3: {
    interpretation: 'Routines are taught and mostly maintained across the year, with periodic reinforcement.',
    evidence: ['Common routines run smoothly', 'Re-teaching happens after breaks'],
    moves: ['Script and practice one routine per week for two weeks', 'Time your transitions — aim for under 60 seconds'],
    coaching: ['Routine audit with a video analysis.'],
    resources: [RES.lemov],
    feedback: 'Tightening transitions to under 60 seconds is a clear lift toward Highly Effective.',
  },
  2: {
    interpretation: 'Routines were taught but are already breaking down. The teacher is spending instructional time re-directing procedures.',
    evidence: ['Ragged transitions', 'Procedural disputes mid-lesson', 'Time lost to "what do I do" questions'],
    moves: ['Re-teach the top 3 most-broken routines next week', 'Script the routine with clear steps and practice it three times'],
    coaching: ['Routine-by-routine coaching cycle.'],
    resources: [RES.lemov],
    feedback: 'Routines are an investment that pays back all year — let\'s re-teach next week.',
  },
  1: {
    interpretation: 'Routines were never established. Every procedure is a negotiation and the teacher is constantly managing behavior rather than teaching.',
    evidence: ['No predictable routines', 'Constant nagging', 'Instructional minutes lost to management'],
    moves: ['Install 3 critical routines next week: entry, transitions, exit'],
    coaching: ['Three-week routine-establishment coaching cycle.'],
    resources: [RES.lemov],
    feedback: 'Routines are the foundation everything else sits on — we need to rebuild this immediately.',
  },
}));

all.push(...build(16, 'Responsibility', {
  4: {
    interpretation: 'Students own their behavior, their learning, and their community. The teacher has built student efficacy as a primary goal.',
    evidence: ['Student-led classroom jobs', 'Students self-correct', 'Students reflect on behavior and academic work', 'High internal locus of control visible'],
    moves: ['Share student-responsibility practices with the team'],
    coaching: ['Lead student-agency PD.'],
    resources: [RES.responsive, RES.hattie],
    feedback: 'Student self-efficacy is Hattie\'s #1 effect-size factor — you are investing in exactly the right thing.',
  },
  3: {
    interpretation: 'The teacher is actively developing student self-discipline and responsibility.',
    evidence: ['Student self-assessment happens', 'Classroom jobs', 'Reflection on behavior'],
    moves: ['Add a weekly self-reflection routine', 'Add student-led classroom jobs'],
    coaching: ['Introduce goal-setting and self-monitoring tools.'],
    resources: [RES.hattie, RES.responsive],
    feedback: 'Adding formal student reflection lifts this to Highly Effective.',
  },
  2: {
    interpretation: 'The teacher expects responsibility but hasn\'t systematically built it. Many students still need external reminders for basic tasks.',
    evidence: ['Frequent reminders needed', 'Few self-management structures', 'Limited student jobs or leadership'],
    moves: ['Introduce 2 daily self-management routines (materials, objectives)', 'Create a class job rotation'],
    coaching: ['Build one self-management structure at a time over coaching cycles.'],
    resources: [RES.responsive],
    feedback: 'Build one self-management routine at a time — materials, then objective tracking, then reflection.',
  },
  1: {
    interpretation: 'Students depend on the teacher for every behavioral decision. There is no student ownership.',
    evidence: ['Students freeze when teacher isn\'t directing', 'No student leadership', 'No self-regulation practice'],
    moves: ['Install one self-management routine this week'],
    coaching: ['Focus coaching on building one structure at a time.'],
    resources: [RES.responsive],
    feedback: 'Let\'s start small — one student-ownership routine per week.',
  },
}));

all.push(...build(17, 'Repertoire', {
  4: {
    interpretation: 'The teacher has a deep toolbox of discipline moves and deploys them fluidly so student attention never fully leaves the learning.',
    evidence: ['Non-verbal moves used effectively', 'Proximity, voice, redirect — all fluid', 'Pre-corrects visible'],
    moves: ['Coach peers on the 3-5 moves you use most'],
    coaching: ['Let this teacher demo specific moves in PD.'],
    resources: [RES.lemov],
    feedback: 'Your range of moves is what lets you keep attention without ever raising your voice.',
  },
  3: {
    interpretation: 'The teacher has several reliable discipline moves and uses them to maintain attention.',
    evidence: ['2-3 go-to moves (narration, proximity, pause)', 'Can capture attention when it slips'],
    moves: ['Add 2 new moves from TLAC (e.g., Strong Voice elements, What-To-Do directions)', 'Practice pre-corrects'],
    coaching: ['Pick 2 TLAC techniques to install.'],
    resources: [RES.lemov],
    feedback: 'Expanding your toolbox with 2 specific TLAC techniques is the next step.',
  },
  2: {
    interpretation: 'The teacher has a narrow toolbox; students are frequently not paying attention.',
    evidence: ['Over-reliance on raising voice', 'No non-verbal repertoire', 'Students coast in and out of attention'],
    moves: ['Install What-To-Do directions as a habit', 'Add narration of positive behavior', 'Practice Strong Voice elements'],
    coaching: ['Focused TLAC coaching cycle.'],
    resources: [RES.lemov],
    feedback: 'A narrow toolbox is fixable — let\'s install 2 techniques in the next 3 weeks.',
  },
  1: {
    interpretation: 'The teacher struggles to capture attention. There is almost no repertoire.',
    evidence: ['Yelling or pleading', 'No management techniques visible', 'Chronic inattention'],
    moves: ['Begin daily TLAC technique practice'],
    coaching: ['Daily coaching support with video review.'],
    resources: [RES.lemov],
    feedback: 'Building this toolbox is urgent — we will coach specific techniques daily.',
  },
}));

all.push(...build(18, 'Efficiency', {
  4: {
    interpretation: 'Every classroom minute produces learning. Coherence, momentum, and transitions are so tight that no time is wasted.',
    evidence: ['Lessons end exactly on time', 'Transitions under 60 seconds', 'No dead time'],
    moves: ['Share your lesson-flow techniques in PD'],
    coaching: ['Lead lesson-pacing PD.'],
    resources: [RES.lemov, RES.marzano],
    feedback: 'Your lesson flow is what the Marshall rubric calls "every minute produces learning."',
  },
  3: {
    interpretation: 'The teacher maximizes learning time through coherence, momentum, and smooth transitions.',
    evidence: ['Transitions under 90 seconds', 'Pacing is reasonable', 'Lesson parts connect'],
    moves: ['Time every transition for a week — aim for sub-60 seconds', 'Cut one ritual that doesn\'t earn its time'],
    coaching: ['Use a pacing audit tool.'],
    resources: [RES.lemov],
    feedback: 'Tightening transitions to under 60 seconds is the clearest path up.',
  },
  2: {
    interpretation: 'Significant teaching time is lost to unclear directions, interruptions, and inefficient transitions.',
    evidence: ['Transitions over 2 minutes', 'Off-topic tangents', 'Repeating directions'],
    moves: ['Pre-write and rehearse directions', 'Script transitions', 'Use a timer visible to students'],
    coaching: ['Pacing coaching cycle with transition tallies.'],
    resources: [RES.lemov],
    feedback: 'Scripting transitions and visible timers usually reclaims 10-15 minutes per day.',
  },
  1: {
    interpretation: 'Most of the class is lost to confusion, interruptions, and ragged transitions. Students are not learning at the rate they should.',
    evidence: ['5+ minute transitions', 'Frequent off-task stretches', 'Chronically late starts'],
    moves: ['Install a visible timer on day one', 'Script entry and exit routines'],
    coaching: ['Daily pacing tallies with coaching debrief.'],
    resources: [RES.lemov],
    feedback: 'We need to reclaim instructional minutes — this is both a management and a planning issue.',
  },
}));

all.push(...build(19, 'Prevention', {
  4: {
    interpretation: 'The teacher reads the room so well that discipline problems are stopped at the smallest signal — before they ever escalate.',
    evidence: ['Pre-corrects', 'Subtle proximity and eye contact', 'Issues never get loud'],
    moves: ['Mentor peers on with-it-ness and pre-correcting'],
    coaching: ['Demo pre-correcting in PD.'],
    resources: [RES.lemov],
    feedback: 'Your with-it-ness (Kounin\'s term) is classroom gold — keep it.',
  },
  3: {
    interpretation: 'A confident, dynamic presence stops most problems in the bud.',
    evidence: ['Most issues addressed quickly', 'Calm, confident tone', 'Uses proximity and eye contact'],
    moves: ['Add pre-corrects at transitions', 'Practice scanning for 3 seconds at each transition'],
    coaching: ['With-it-ness coaching cycle.'],
    resources: [RES.lemov],
    feedback: 'Adding pre-corrects at every transition sharpens this to Highly Effective.',
  },
  2: {
    interpretation: 'Small issues escalate into bigger ones. The teacher sees problems late.',
    evidence: ['Issues grow before being addressed', 'Reactive rather than preventive', 'Misses early signals'],
    moves: ['Learn and practice pre-correcting at every transition', 'Use Strong Voice elements (chin up, pause, don\'t talk over)'],
    coaching: ['Video-based coaching cycle on with-it-ness.'],
    resources: [RES.lemov],
    feedback: 'Catching issues earlier is a skill — we can build it in 3 weeks of focused practice.',
  },
  1: {
    interpretation: 'The teacher doesn\'t see problems coming, and they escalate routinely.',
    evidence: ['Repeated escalations', 'Missed early cues', 'Reactive management only'],
    moves: ['Daily video self-review to spot missed cues'],
    coaching: ['Daily with-it-ness coaching with video.'],
    resources: [RES.lemov],
    feedback: 'Video review will show exactly what you\'re missing — we will do it together.',
  },
}));

all.push(...build(20, 'Incentives', {
  4: {
    interpretation: 'Incentives are tied to intrinsic motivation — mastery, purpose, belonging — and students have bought in.',
    evidence: ['Students celebrate growth, not just grades', 'Public recognition of effort and improvement', 'Classroom culture of shared success'],
    moves: ['Share your incentive framework with the team'],
    coaching: ['Lead a motivation PD.'],
    resources: [RES.dweck, RES.hattie],
    feedback: 'Intrinsic incentives are the hardest to get right — yours are working.',
  },
  3: {
    interpretation: 'Incentives are used wisely to reinforce cooperation and effort.',
    evidence: ['Recognition is specific', 'Extrinsic rewards used sparingly', 'Effort praised over ability'],
    moves: ['Shift praise language toward specific effort and strategies', 'Reduce frequency of extrinsic rewards over a month'],
    coaching: ['Use Dweck\'s praise framework in coaching.'],
    resources: [RES.dweck],
    feedback: 'A praise audit (effort-specific vs. ability-general) moves this toward Highly Effective.',
  },
  2: {
    interpretation: 'Extrinsic rewards dominate. Compliance is being bought rather than built.',
    evidence: ['Constant stickers, points, treats', 'Praise is generic ("good job")', 'Students focus on rewards not learning'],
    moves: ['Shift to process praise ("you used your strategy")', 'Reduce extrinsic rewards gradually over 4 weeks'],
    coaching: ['Praise-language coaching cycle.'],
    resources: [RES.dweck],
    feedback: 'Praise specificity is the fastest lever here — let\'s script 10 process-praise sentences together.',
  },
  1: {
    interpretation: 'Extrinsic rewards are given for things already expected, without any link to learning or behavior change.',
    evidence: ['Free time given to keep students quiet', 'Prizes for compliance', 'No link to learning'],
    moves: ['Stop rewarding expected behavior as a novelty'],
    coaching: ['Redesign incentive system from scratch with coach.'],
    resources: [RES.dweck, RES.responsive],
    feedback: 'We will rebuild your incentive system — paying for expected behavior creates a bad cycle.',
  },
}));

// ===========================================================================
// DOMAIN C — Delivery of Instruction (indicators 21-30)
// ===========================================================================
all.push(...build(21, 'Expectations (Delivery)', {
  4: {
    interpretation: 'The teacher\'s expectations are so palpable that every student believes mastery is possible AND expected of them personally.',
    evidence: ['"You will master this" language', 'Individual check-ins with every student', 'No student treated as hopeless'],
    moves: ['Share your expectation-setting language with peers'],
    coaching: ['Demo high-expectations language in PD.'],
    resources: [RES.lemov, RES.dweck],
    feedback: 'Your conviction is contagious — every student hears that you are on their side.',
  },
  3: {
    interpretation: 'The teacher conveys: this is important, you can do it, and I am not going to give up on you.',
    evidence: ['Consistent high-expectations language', 'Persistence with struggling students', 'Re-teaching rather than writing off'],
    moves: ['Name each student you doubt internally — and plan an expectation-raising move for them', 'Use "no opt out" technique consistently'],
    coaching: ['No Opt Out coaching cycle.'],
    resources: [RES.lemov],
    feedback: 'The No Opt Out technique is a concrete lever that lifts this toward Highly Effective.',
  },
  2: {
    interpretation: 'The teacher talks about high expectations but lets students off the hook in practice.',
    evidence: ['"Work hard" rhetoric but frequent accepts of "I don\'t know"', 'Lower questions for lower-performing students', 'Avoidance of calling on strugglers'],
    moves: ['Install No Opt Out next week', 'Equal distribution of cold calls across the class'],
    coaching: ['Call-pattern audit in next observation.'],
    resources: [RES.lemov],
    feedback: 'No Opt Out and equal call distribution will close the expectations-action gap.',
  },
  1: {
    interpretation: 'The teacher visibly gives up on some students — lower expectations, fewer questions, passive tolerance.',
    evidence: ['"He\'s not going to get it" mindset', 'Avoids calling on strugglers', 'Accepts low-quality work as "his best"'],
    moves: ['Identify the 5 students you have lowest expectations for and plan an expectation-raising move for each'],
    coaching: ['Intensive coaching cycle on high expectations.'],
    resources: [RES.lemov, RES.dweck],
    feedback: 'This is a critical area — no student gets written off in our school.',
  },
}));

all.push(...build(22, 'Mindset', {
  4: {
    interpretation: 'The classroom runs on an actively taught growth mindset. Students take risks, learn from mistakes, and own their development.',
    evidence: ['Mistakes celebrated as learning opportunities', 'Effort and strategy praise (Dweck-aligned)', 'Students use growth language'],
    moves: ['Share your mindset-building protocols with the team'],
    coaching: ['Lead growth-mindset PD.'],
    resources: [RES.dweck, RES.hattie],
    feedback: 'Your mindset work is a permanent gift to every student.',
  },
  3: {
    interpretation: 'The teacher tells students that effective effort, not innate ability, is the key.',
    evidence: ['Process praise', 'Strategy language', 'Some explicit mindset teaching'],
    moves: ['Add explicit mistake-celebration routines ("My favorite mistake")', 'Teach Dweck\'s research to students directly'],
    coaching: ['Add explicit mindset instruction weekly.'],
    resources: [RES.dweck],
    feedback: 'Teaching the research directly to students is the move toward Highly Effective.',
  },
  2: {
    interpretation: 'The teacher doesn\'t counteract fixed-mindset language that shows up in class. Students still say "I\'m just not a math person" without pushback.',
    evidence: ['Fixed-mindset student talk goes uncorrected', 'Ability-based praise ("you\'re so smart")', 'Mistakes are awkward'],
    moves: ['Interrupt every fixed-mindset statement with a growth reframe', 'Eliminate ability praise; use process praise only'],
    coaching: ['Dweck praise-language coaching.'],
    resources: [RES.dweck],
    feedback: 'Reframing fixed-mindset talk in the moment is the high-leverage move.',
  },
  1: {
    interpretation: 'The teacher communicates a fixed mindset — some students have it, some don\'t.',
    evidence: ['"She\'s just not a science kid" type language', 'Different expectations by perceived ability', 'Mistakes treated as failures'],
    moves: ['Stop using ability-based language immediately', 'Begin explicit growth-mindset teaching'],
    coaching: ['Immediate mindset coaching cycle.'],
    resources: [RES.dweck],
    feedback: 'Fixed-mindset messaging is harmful; we will replace it with growth-mindset practice.',
  },
}));

all.push(...build(23, 'Goals', {
  4: {
    interpretation: 'Students know exactly what proficient work looks like — they see essential questions, goals, rubrics, and exemplars.',
    evidence: ['Rubrics posted with exemplars', 'Students can self-assess against rubrics', 'Essential questions drive discussion'],
    moves: ['Share your exemplar library with the team'],
    coaching: ['Lead exemplar/rubric PD.'],
    resources: [RES.wiliam, RES.ubd],
    feedback: 'Students who can see proficiency can aim at it — your work here is foundational.',
  },
  3: {
    interpretation: 'Unit essential questions and lesson goals are posted; students have a clear sense of purpose.',
    evidence: ['Essential questions posted', 'Lesson objectives posted', 'Students can name the goal'],
    moves: ['Add exemplars of proficient work', 'Add rubrics students can self-score against'],
    coaching: ['Build rubrics with students.'],
    resources: [RES.wiliam, RES.ubd],
    feedback: 'Adding exemplars alongside goals moves this to Highly Effective.',
  },
  2: {
    interpretation: 'Lesson objectives are stated but not made visible, memorable, or referenced throughout the lesson.',
    evidence: ['Objective said once at start', 'No visible reference after', 'Students can\'t restate mid-lesson'],
    moves: ['Post the objective in student-friendly language', 'Reference it 3+ times per lesson', 'End with a check: "What did we learn today?"'],
    coaching: ['Objective-visibility coaching cycle.'],
    resources: [RES.wiliam],
    feedback: 'Visibility and repetition of the objective is the quickest win.',
  },
  1: {
    interpretation: 'Lessons start without giving students any sense of what they\'re learning or why.',
    evidence: ['No posted objective', 'No launch or hook', 'Students can\'t describe the learning goal'],
    moves: ['Post a student-friendly objective every lesson starting this week'],
    coaching: ['Daily objective-check for two weeks.'],
    resources: [RES.wiliam],
    feedback: 'A posted, student-friendly objective every lesson — that\'s the base habit we\'ll install.',
  },
}));

all.push(...build(24, 'Connections', {
  4: {
    interpretation: 'Every lesson hooks students and links new content to what they already know, have experienced, or have read.',
    evidence: ['Strong relevance hooks', 'Explicit prior-knowledge activation', 'Cross-lesson connections visible', 'Student lives and cultures referenced'],
    moves: ['Share your hook bank with peers'],
    coaching: ['Lead hook-design PD.'],
    resources: [RES.lemov, RES.marzano],
    feedback: 'Your ability to hook students to their own experience is Marzano\'s "engaging student interest" at a high level.',
  },
  3: {
    interpretation: 'Prior knowledge is activated and interest is hooked for most students.',
    evidence: ['Opening hook used', 'Some prior knowledge activation', 'Connections made when obvious'],
    moves: ['Pre-plan a hook for every lesson', 'Build a hook bank by unit'],
    coaching: ['Hook-design coaching.'],
    resources: [RES.lemov, RES.marzano],
    feedback: 'Pre-planning every hook (versus reaching for one in the moment) lifts this to Highly Effective.',
  },
  2: {
    interpretation: 'Sometimes the teacher makes it interesting; often the content arrives cold, without prior-knowledge activation.',
    evidence: ['Inconsistent hooks', 'Prior knowledge not activated', 'Some lessons land; others feel disconnected'],
    moves: ['Add a 30-second hook to every lesson', 'Use a consistent prior-knowledge routine (KWL, quick-write, brainstorm)'],
    coaching: ['Hook-and-activate coaching cycle.'],
    resources: [RES.marzano],
    feedback: 'A 30-second hook and a prior-knowledge routine at the start of every lesson is a 3-week habit shift.',
  },
  1: {
    interpretation: 'Content arrives without connection to student lives or prior learning.',
    evidence: ['No hooks', 'No prior-knowledge activation', 'Students see content as disconnected from them'],
    moves: ['Add a hook to every lesson starting this week'],
    coaching: ['Daily hook design for two weeks.'],
    resources: [RES.lemov],
    feedback: 'We will script hooks together daily for two weeks to build the habit.',
  },
}));

all.push(...build(25, 'Clarity', {
  4: {
    interpretation: 'Explanations are vivid, precise, and memorable. Examples are carefully chosen to illuminate concepts.',
    evidence: ['Precise academic language', 'Well-chosen examples and non-examples', 'Vivid analogies that map correctly', 'Students take notes that mirror clarity'],
    moves: ['Share your explanation-design practices with the team'],
    coaching: ['Let this teacher demo explanations in PD.'],
    resources: [RES.lemov, RES.saphier],
    feedback: 'Clarity at this level is an art — students are learning the content and learning how to explain it.',
  },
  3: {
    interpretation: 'Explanations are clear, language is appropriate, and examples help students learn.',
    evidence: ['Organized explanations', 'Appropriate vocabulary', 'Useful examples'],
    moves: ['Add non-examples to every concept', 'Script explanations for the hardest concepts'],
    coaching: ['Script-and-rehearse coaching cycle.'],
    resources: [RES.lemov],
    feedback: 'Scripting explanations for the hardest concepts is the move toward Highly Effective.',
  },
  2: {
    interpretation: 'Some explanations land; others are fuzzy or confusing. Language is occasionally inappropriate for the age.',
    evidence: ['Rambling explanations', 'Too much jargon or too little precision', 'Examples that muddle rather than clarify'],
    moves: ['Pre-script your 3 hardest explanations for the coming week', 'Use the "3 explanations" rule: say it 3 different ways'],
    coaching: ['Explanation-clarity coaching with rehearsal.'],
    resources: [RES.lemov, RES.saphier],
    feedback: 'Scripting and rehearsing tough explanations is a practice that pays back all year.',
  },
  1: {
    interpretation: 'Material is regularly presented in confusing ways. Students walk away without understanding.',
    evidence: ['Frequent confusion', 'Inappropriate language', 'Students can\'t restate'],
    moves: ['Begin daily scripting of key explanations'],
    coaching: ['Daily explanation rehearsal with coach.'],
    resources: [RES.lemov],
    feedback: 'We will script and rehearse your key explanations daily until the habit is installed.',
  },
}));

all.push(...build(26, 'Repertoire (Delivery)', {
  4: {
    interpretation: 'The teacher orchestrates a wide range of strategies, materials, and groupings with precision, always matched to the learning need.',
    evidence: ['Multiple modalities per lesson', 'Fluid grouping', 'Strategies vary by purpose'],
    moves: ['Share your strategy-selection logic with peers'],
    coaching: ['Lead instructional-strategy PD.'],
    resources: [RES.marzano, RES.hattie],
    feedback: 'Your range of instructional moves is Marzano\'s "art" of teaching — named and intentional.',
  },
  3: {
    interpretation: 'Effective strategies, materials, and groupings foster student learning.',
    evidence: ['2-3 strategies per lesson', 'Flexible grouping used', 'Appropriate materials selected'],
    moves: ['Add a new high-impact strategy from Hattie (jigsaw, Socratic seminar, concept attainment)', 'Plan groupings with a purpose for each'],
    coaching: ['High-yield strategy coaching cycle.'],
    resources: [RES.hattie, RES.marzano],
    feedback: 'Adding one new high-impact strategy per month builds your toolbox toward Highly Effective.',
  },
  2: {
    interpretation: 'The strategy range is narrow; same moves repeatedly. Mixed success with reach.',
    evidence: ['Relies on 1-2 strategies', 'Groupings default to rows or partners only', 'Some students never reached'],
    moves: ['Build a strategy rotation: 5 strategies over the week', 'Rotate grouping structures'],
    coaching: ['Strategy-rotation coaching.'],
    resources: [RES.marzano],
    feedback: 'A 5-strategy weekly rotation widens your reach fast.',
  },
  1: {
    interpretation: 'Only one or two teaching strategies used; most students are not reached.',
    evidence: ['Lecture-and-worksheet default', 'No grouping variation', 'Same type of materials all week'],
    moves: ['Install 2 new strategies this month (e.g., turn-and-talk + jigsaw)'],
    coaching: ['Strategy-expansion coaching cycle.'],
    resources: [RES.marzano, RES.hattie],
    feedback: 'We will install 2 new strategies in the next 4 weeks — starting with turn-and-talk.',
  },
}));

all.push(...build(27, 'Engagement (Delivery)', {
  4: {
    interpretation: 'All students are actively thinking, doing, and problem-solving throughout the lesson.',
    evidence: ['Near-100% participation', 'Thinking visible in student work during the lesson', 'Student-to-student discussion substantial'],
    moves: ['Share high-engagement routines with the team'],
    coaching: ['Lead engagement PD.'],
    resources: [RES.lemov, RES.hattie],
    feedback: 'When every student is doing the cognitive work, you are producing learning at the highest rate possible.',
  },
  3: {
    interpretation: 'Students actively think about, discuss, and use what\'s being taught.',
    evidence: ['Most students engaged most of the time', 'Regular talk and writing', 'Active tasks'],
    moves: ['Move from "most students" to "all students" via cold call + wait time', 'Add a written accountability component to every discussion'],
    coaching: ['Full-participation coaching cycle.'],
    resources: [RES.lemov],
    feedback: 'Closing the gap from 80% to 100% engagement is the move toward Highly Effective.',
  },
  2: {
    interpretation: 'Engagement attempts happen, but a meaningful group of students is disengaged.',
    evidence: ['Same students answering', 'Visible disengagement in 20-30% of the class', 'Passive stretches'],
    moves: ['Install cold call with wait time', 'Add written-response routines (every student writes)', 'Track call-ratio for one week'],
    coaching: ['Engagement-audit coaching cycle.'],
    resources: [RES.lemov],
    feedback: 'A call-ratio audit and cold-call installation is where we should start.',
  },
  1: {
    interpretation: 'Students are mostly passive — listening to lecture or plodding through worksheets.',
    evidence: ['Most of the class is listening or doing worksheets', 'Little to no student talk', 'Low cognitive effort'],
    moves: ['Install active participation every 5-7 minutes'],
    coaching: ['Daily engagement coaching.'],
    resources: [RES.lemov],
    feedback: 'Passive instruction is a no-go — we\'ll design active moves into every lesson segment.',
  },
}));

all.push(...build(28, 'Differentiation (Delivery)', {
  4: {
    interpretation: 'The teacher reaches every student through skillful differentiation and scaffolding on the fly.',
    evidence: ['Scaffolds visible in the moment', 'Task options matched to readiness', 'Every student has access to the learning'],
    moves: ['Share your scaffolding moves with the team'],
    coaching: ['Lead differentiation PD.'],
    resources: [RES.danielson],
    feedback: 'Your in-the-moment differentiation meets students where they are and moves them forward.',
  },
  3: {
    interpretation: 'Instruction is scaffolded to accommodate most students\' learning needs.',
    evidence: ['Scaffolds present for most students', 'Some task options', 'IEP/504 accommodations honored'],
    moves: ['Add a scaffold for your highest-need learners in every lesson', 'Add an extension for your highest-readiness learners'],
    coaching: ['Readiness-data-based differentiation coaching.'],
    resources: [RES.danielson],
    feedback: 'Planning specific scaffolds for your highest and lowest learners lifts this.',
  },
  2: {
    interpretation: 'The teacher attempts to accommodate but with mixed success. Differentiation is inconsistent.',
    evidence: ['Some scaffolds for IEP students', 'No other differentiation', 'One-size-fits-most tasks'],
    moves: ['For the next three lessons, name one scaffold and one extension you\'ll deploy', 'Use pre-assessment data to flex tasks'],
    coaching: ['Scaffold-and-extend coaching.'],
    resources: [RES.danielson],
    feedback: 'Explicit scaffolds and extensions — written into the lesson plan — closes most of this gap.',
  },
  1: {
    interpretation: 'No differentiation. Students with learning deficits are left behind.',
    evidence: ['Identical tasks for all', 'No scaffolds', 'No extensions', 'No flexible grouping'],
    moves: ['Begin adding one scaffold and one extension to every lesson'],
    coaching: ['Three-week intensive differentiation cycle.'],
    resources: [RES.danielson, RES.marzano],
    feedback: 'Every learner deserves access — we will build differentiation lesson by lesson.',
  },
}));

all.push(...build(29, 'Nimbleness', {
  4: {
    interpretation: 'The teacher is a masterful improviser — catches teachable moments and deftly repairs misunderstandings as they emerge.',
    evidence: ['Adapts lessons mid-flight', 'Addresses misconceptions the moment they surface', 'Uses student thinking to deepen the lesson'],
    moves: ['Share your flexibility strategies with the team'],
    coaching: ['Demo responsive teaching in PD.'],
    resources: [RES.saphier, RES.wiliam],
    feedback: 'Your ability to flex the lesson based on student thinking is master-teacher work.',
  },
  3: {
    interpretation: 'The teacher modifies lessons when teachable moments arise.',
    evidence: ['Some on-the-fly adjustments', 'Responds to student thinking when obvious', 'Willing to pause the plan'],
    moves: ['Plan branching paths in advance for likely student responses', 'Practice "parking" off-topic questions productively'],
    coaching: ['Responsive-teaching coaching.'],
    resources: [RES.saphier],
    feedback: 'Pre-planned branches sharpen your nimbleness.',
  },
  2: {
    interpretation: 'Teachable moments are often missed because the teacher is locked into the plan.',
    evidence: ['Plan drives over student thinking', 'Teachable moments waved off', 'Limited on-the-fly repair'],
    moves: ['Rehearse noticing: practice spotting 2 teachable moments per day', 'Plan 1 "if-then" contingency per lesson'],
    coaching: ['Observation-and-notice coaching cycle.'],
    resources: [RES.saphier],
    feedback: 'Training yourself to notice — and then pausing the plan — is the work.',
  },
  1: {
    interpretation: 'The lesson plan is followed rigidly. Students\' thinking and confusion are bypassed.',
    evidence: ['Sticks to script regardless of student cues', 'Ignores confusion', 'Misses every teachable moment'],
    moves: ['Plan one "I will pause here if students X" contingency per lesson'],
    coaching: ['Plan-with-branches coaching cycle.'],
    resources: [RES.saphier],
    feedback: 'We will plan branches into your lessons — that\'s how nimbleness becomes a habit.',
  },
}));

all.push(...build(30, 'Application', {
  4: {
    interpretation: 'Every lesson ends with students summarizing, internalizing, and transferring learning to real-life or novel contexts.',
    evidence: ['Consistent closure routines', 'Real-life application tasks', 'Transfer questions asked'],
    moves: ['Share your closure protocols with peers'],
    coaching: ['Lead closure-design PD.'],
    resources: [RES.wiliam, RES.marzano],
    feedback: 'Strong closure is what makes learning stick — keep doing it every lesson.',
  },
  3: {
    interpretation: 'Students sum up what they learned and apply it in a different context.',
    evidence: ['Closure happens most lessons', 'Application tasks present', 'Exit tickets used'],
    moves: ['Add a transfer prompt to every lesson (how does this connect to X?)', 'Use a 3-2-1 protocol'],
    coaching: ['Closure-variety coaching.'],
    resources: [RES.wiliam],
    feedback: 'A transfer prompt at closure moves this toward Highly Effective.',
  },
  2: {
    interpretation: 'Some closure happens, but it\'s inconsistent and application is weak.',
    evidence: ['Closure skipped when lesson runs long', 'Application is limited to "homework"', 'No summarization by students'],
    moves: ['Guarantee 3 minutes of closure in every lesson', 'Use an exit ticket daily'],
    coaching: ['Closure-habit coaching cycle.'],
    resources: [RES.wiliam],
    feedback: 'Protect the last 3 minutes of every lesson for student-led summary — that\'s the habit.',
  },
  1: {
    interpretation: 'Lessons end when the bell rings. No closure, no application.',
    evidence: ['Abrupt endings', 'No exit ticket or summary', 'No transfer to other contexts'],
    moves: ['Install a 60-second exit ticket every single day this week'],
    coaching: ['Daily closure check.'],
    resources: [RES.wiliam],
    feedback: 'Closure is non-negotiable — we will build the habit starting this week.',
  },
}));

// ===========================================================================
// DOMAIN D — Monitoring, Assessment, and Follow-Up  (indicators 31-40)
// ===========================================================================
all.push(...build(31, 'Criteria', {
  4: {
    interpretation: 'Students internalize the criteria for proficient work. They use rubrics and exemplars to self-direct their learning.',
    evidence: ['Rubrics posted and used by students', 'Exemplars visible', 'Students describe proficiency in their own words'],
    moves: ['Share your exemplar library with the team'],
    coaching: ['Lead rubric-internalization PD.'],
    resources: [RES.wiliam],
    feedback: 'Students who can see proficiency can self-correct — this work is foundational to self-directed learners.',
  },
  3: {
    interpretation: 'Rubrics and exemplars are posted; students can see what proficient work looks like.',
    evidence: ['Rubrics posted for major work', 'Exemplars shown', 'Students reference them'],
    moves: ['Have students co-create a rubric for one task per unit', 'Use rubrics for peer feedback'],
    coaching: ['Co-created-rubric coaching.'],
    resources: [RES.wiliam],
    feedback: 'Co-creating rubrics with students moves this toward Highly Effective.',
  },
  2: {
    interpretation: 'The teacher tells students some qualities of good work, but proficiency is mostly implicit.',
    evidence: ['Verbal criteria only', 'No posted rubrics', 'Unclear expectations for finished work'],
    moves: ['Create a rubric for every major task', 'Share exemplars before the task, not after'],
    coaching: ['Rubric-building coaching.'],
    resources: [RES.wiliam],
    feedback: 'Posted rubrics and pre-task exemplars are quick wins.',
  },
  1: {
    interpretation: 'Students have to guess what counts as good work.',
    evidence: ['No rubrics', 'No exemplars', 'Grading surprises students'],
    moves: ['Build a rubric for the next major task before assigning it'],
    coaching: ['Rubric-establishment coaching cycle.'],
    resources: [RES.wiliam],
    feedback: 'Rubrics are non-negotiable — we will build one for your next task together.',
  },
}));

all.push(...build(32, 'Diagnosis', {
  4: {
    interpretation: 'Every unit begins with a carefully designed diagnostic that the teacher uses to shape instruction.',
    evidence: ['Pre-assessments planned and analyzed', 'Instruction adjusted based on data', 'Students see how the pre-assessment guides the unit'],
    moves: ['Share your diagnostic protocols'],
    coaching: ['Lead pre-assessment PD.'],
    resources: [RES.wiliam, RES.ubd],
    feedback: 'Your diagnostic work is what Wiliam calls "assessment for learning" — not assessment of it.',
  },
  3: {
    interpretation: 'The teacher diagnoses students\' knowledge up front and makes small adjustments.',
    evidence: ['Pre-assessment used', 'Some adjustments made', 'Data referenced'],
    moves: ['Make the adjustments bigger — flex groupings or re-order based on data', 'Share the data with students'],
    coaching: ['Data-based adjustment coaching.'],
    resources: [RES.wiliam],
    feedback: 'Bigger moves on the data — regrouping, re-sequencing — lifts this toward Highly Effective.',
  },
  2: {
    interpretation: 'A quick KWL happens, but data isn\'t really used to shape instruction.',
    evidence: ['KWL or similar used', 'Data not analyzed', 'Instruction proceeds as planned regardless'],
    moves: ['Design a true diagnostic for the next unit', 'Commit to one instructional adjustment based on data'],
    coaching: ['Diagnostic-design coaching.'],
    resources: [RES.wiliam],
    feedback: 'A real diagnostic (not just KWL) and one adjustment based on it is the move.',
  },
  1: {
    interpretation: 'Instruction begins without diagnosing what students know. Misconceptions and gaps are not identified.',
    evidence: ['No pre-assessment', 'No adjustment to plans'],
    moves: ['Add a diagnostic to the next unit, starting next week'],
    coaching: ['Pre-assessment coaching cycle.'],
    resources: [RES.wiliam],
    feedback: 'Diagnosing before teaching is the most basic assessment-for-learning move — we will install it.',
  },
}));

all.push(...build(33, 'On-the-Spot', {
  4: {
    interpretation: 'The teacher has a variety of highly effective checks for understanding and immediately repairs confusion.',
    evidence: ['Multiple CFU techniques used', 'Data collected from every student, not just raised hands', 'Immediate repair of confusion'],
    moves: ['Share your CFU toolkit with peers'],
    coaching: ['Lead CFU PD.'],
    resources: [RES.wiliam, RES.lemov],
    feedback: 'Your checking-for-understanding work is the engine of responsive teaching.',
  },
  3: {
    interpretation: 'Frequent checks for understanding and useful feedback when students are confused.',
    evidence: ['Regular CFU', 'Feedback given in response', 'Some student data gathered'],
    moves: ['Add all-student techniques (white boards, hand signals, exit tickets)', 'Move from thumb-ups to written response'],
    coaching: ['All-student-response coaching.'],
    resources: [RES.lemov, RES.wiliam],
    feedback: 'Move from visible-CFU to all-student-written-CFU for the upgrade.',
  },
  2: {
    interpretation: 'The teacher uses mediocre CFU techniques (thumbs up, thumbs down) that don\'t reveal individual student understanding.',
    evidence: ['Group-level signals only', 'Same few students confirm understanding', 'Many students slip through'],
    moves: ['Install individual response techniques (white boards, written 1-sentence responses)', 'Cold call with "everyone writes first"'],
    coaching: ['CFU-upgrade coaching cycle.'],
    resources: [RES.lemov, RES.wiliam],
    feedback: 'Thumbs-up isn\'t enough — let\'s install whiteboards or written CFU.',
  },
  1: {
    interpretation: 'Checks are perfunctory ("Everyone with me?") and reveal nothing about individual student thinking.',
    evidence: ['"Any questions?" as CFU', 'No data gathered', 'Students slip through undetected'],
    moves: ['Install one all-student CFU technique this week (whiteboards or exit tickets)'],
    coaching: ['Daily CFU coaching.'],
    resources: [RES.lemov],
    feedback: '"Everyone with me?" is not a check — we will install a real one this week.',
  },
}));

all.push(...build(34, 'Self-Assessment', {
  4: {
    interpretation: 'Students set ambitious goals, continuously self-assess, and always know where they stand academically.',
    evidence: ['Student-owned data notebooks', 'Regular self-assessment routines', 'Goal-setting visible'],
    moves: ['Share your self-assessment system with the team'],
    coaching: ['Lead student-agency PD.'],
    resources: [RES.hattie, RES.wiliam],
    feedback: 'Student self-reported grades/self-assessment is Hattie\'s #1 effect size — you are investing in the highest-leverage skill.',
  },
  3: {
    interpretation: 'Students set goals, self-assess, and take responsibility for improving performance.',
    evidence: ['Goal-setting happens', 'Self-assessment routines in place', 'Student reflection present'],
    moves: ['Add student data notebooks', 'Move from unit-level to daily self-assessment'],
    coaching: ['Student data-notebook coaching.'],
    resources: [RES.hattie, RES.wiliam],
    feedback: 'Daily self-assessment and student-owned data builds toward Highly Effective.',
  },
  2: {
    interpretation: 'The teacher urges students to look over their work, but self-assessment isn\'t systemic.',
    evidence: ['Occasional self-checking', 'No self-assessment structure', 'Rare goal-setting'],
    moves: ['Install a weekly goal-setting routine', 'Add a daily "how did I do?" reflection'],
    coaching: ['Self-assessment structure coaching.'],
    resources: [RES.wiliam],
    feedback: 'Weekly goal-setting and daily reflection is the infrastructure we need to build.',
  },
  1: {
    interpretation: 'Students move on without self-assessment. There is no reflection or ownership.',
    evidence: ['No self-assessment', 'No goal setting', 'Students don\'t know how they\'re doing'],
    moves: ['Install a weekly self-check routine'],
    coaching: ['Build self-assessment from scratch.'],
    resources: [RES.wiliam],
    feedback: 'Self-assessment is the biggest lever available — we will install it.',
  },
}));

all.push(...build(35, 'Recognition', {
  4: {
    interpretation: 'Student work is regularly celebrated with rubrics and commentary, showing what proficient looks like and how to improve.',
    evidence: ['Frequent displays of student work with commentary', 'Rubric-based feedback visible', 'Recognition tied to growth'],
    moves: ['Share your recognition practices'],
    coaching: ['Lead work-display PD.'],
    resources: [RES.wiliam, RES.dweck],
    feedback: 'Your recognition practices make proficiency visible and motivate effort.',
  },
  3: {
    interpretation: 'Student work is regularly posted to make progress visible.',
    evidence: ['Student work posted', 'Some commentary', 'Linked to standards'],
    moves: ['Add rubric commentary to each displayed piece', 'Post a range of work, not only top work'],
    coaching: ['Growth-focused display coaching.'],
    resources: [RES.dweck],
    feedback: 'Show the range of work with commentary — not just the top — to move toward Highly Effective.',
  },
  2: {
    interpretation: 'Only "A" student work is posted, which sends the wrong message.',
    evidence: ['Only top work displayed', 'No commentary', 'Fixed-mindset vibe'],
    moves: ['Display a range of work showing growth', 'Add specific growth commentary'],
    coaching: ['Growth-display coaching.'],
    resources: [RES.dweck],
    feedback: 'Showing growth trajectories (not just end products) builds a growth-mindset culture.',
  },
  1: {
    interpretation: 'Little or no student work is displayed. Students don\'t see themselves in the classroom.',
    evidence: ['Blank walls', 'No student work posted'],
    moves: ['Post student work this week, with rubric commentary'],
    coaching: ['Recognition coaching cycle.'],
    resources: [RES.dweck],
    feedback: 'Students should see their own work on the walls — let\'s start this week.',
  },
}));

all.push(...build(36, 'Interims', {
  4: {
    interpretation: 'The teacher works with colleagues to use interim data to fine-tune teaching, re-teach, and help struggling students.',
    evidence: ['PLC data conversations', 'Data-driven re-teaching', 'Targeted intervention for strugglers'],
    moves: ['Lead the data-team process'],
    coaching: ['Invite to lead data-team PD.'],
    resources: [RES.wiliam, RES.marshallBook],
    feedback: 'Your data-team work is the heart of continuous improvement.',
  },
  3: {
    interpretation: 'Interim assessment data is used to adjust teaching, re-teach, and follow up with failing students.',
    evidence: ['Data analyzed after interims', 'Re-teaching happens', 'Follow-up for strugglers'],
    moves: ['Move data analysis from individual to team-based', 'Deepen root-cause analysis'],
    coaching: ['Data-team protocol coaching.'],
    resources: [RES.wiliam],
    feedback: 'Joining a team data protocol moves this to Highly Effective.',
  },
  2: {
    interpretation: 'The teacher looks over tests but doesn\'t deeply analyze or follow up.',
    evidence: ['Surface-level review', 'Minimal re-teaching', 'No intervention for strugglers'],
    moves: ['Use an item-analysis protocol on the next interim', 'Build one targeted re-teach plan per interim'],
    coaching: ['Item-analysis coaching cycle.'],
    resources: [RES.wiliam],
    feedback: 'Item analysis and targeted re-teach is the big move.',
  },
  1: {
    interpretation: 'Tests are given and the class moves on. No analysis, no follow-up.',
    evidence: ['No item analysis', 'No re-teaching', 'No intervention'],
    moves: ['After every assessment: pick 3 items to re-teach based on class performance'],
    coaching: ['Data-review coaching.'],
    resources: [RES.wiliam],
    feedback: 'Assessment without follow-up is wasted data — we will build the habit.',
  },
}));

all.push(...build(37, 'Tenacity', {
  4: {
    interpretation: 'The teacher relentlessly follows up with struggling students — with personal attention until they reach proficiency.',
    evidence: ['Individual re-teaching sessions', 'Relationship-based follow-up', 'Students who were struggling are now proficient'],
    moves: ['Share your follow-up protocols'],
    coaching: ['Lead intervention PD.'],
    resources: [RES.hattie],
    feedback: 'Your tenacity is the reason your struggling students catch up.',
  },
  3: {
    interpretation: 'The teacher takes responsibility for struggling students and gives them extra help.',
    evidence: ['Extra help offered', 'Struggling students tracked', 'Some improvement visible'],
    moves: ['Create a standing weekly intervention block', 'Track specific skill growth for each struggler'],
    coaching: ['Intervention-tracking coaching.'],
    resources: [RES.hattie],
    feedback: 'Tracking each struggler\'s specific skill growth is the move toward Highly Effective.',
  },
  2: {
    interpretation: 'The teacher offers re-takes, but doesn\'t fundamentally change the learning plan for students who are failing.',
    evidence: ['Re-takes offered', 'No root-cause analysis', 'Struggling students stay struggling'],
    moves: ['Beyond re-takes: identify what specifically each struggler needs and re-teach it', 'Install a weekly intervention block'],
    coaching: ['Root-cause coaching for struggling students.'],
    resources: [RES.hattie],
    feedback: 'Re-takes aren\'t enough — root-cause re-teaching is the move.',
  },
  1: {
    interpretation: 'The teacher communicates that if a student fails, the class moves on.',
    evidence: ['No follow-up', 'Visible "they failed, my problem is done" attitude'],
    moves: ['Build intervention time into every week starting now'],
    coaching: ['Intervention-design coaching.'],
    resources: [RES.hattie, RES.marshallBook],
    feedback: 'No student gets left behind — we will build intervention time immediately.',
  },
}));

all.push(...build(38, 'Support', {
  4: {
    interpretation: 'Students who need specialized support get it immediately — the teacher is an active partner with specialists.',
    evidence: ['Timely referrals', 'Active collaboration with specialists', 'Data shared with support teams'],
    moves: ['Share your referral process with the team'],
    coaching: ['Lead MTSS coordination.'],
    resources: [RES.marshallBook],
    feedback: 'Your referral and collaboration practices make the support system work for kids.',
  },
  3: {
    interpretation: 'The teacher refers students for specialized diagnosis when needed.',
    evidence: ['Appropriate referrals', 'Some collaboration with specialists'],
    moves: ['Move from referral to active collaboration with specialists', 'Build a tier-1 intervention plan before referring'],
    coaching: ['MTSS coaching.'],
    resources: [RES.marshallBook],
    feedback: 'Active collaboration with specialists is the upgrade.',
  },
  2: {
    interpretation: 'Referrals are late, or students who don\'t need them are referred.',
    evidence: ['Over-referral or under-referral', 'No tier-1 data before referral', 'Referrals feel random'],
    moves: ['Build a tier-1 intervention and data-collection step before referral', 'Use a consistent referral protocol'],
    coaching: ['Referral-protocol coaching.'],
    resources: [RES.marshallBook],
    feedback: 'A data-backed referral process is the move.',
  },
  1: {
    interpretation: 'Referral patterns are broken — students who need support don\'t get it, and students who don\'t are sent anyway.',
    evidence: ['Chronically mistimed referrals', 'No data behind referrals'],
    moves: ['Adopt the school referral protocol immediately'],
    coaching: ['Referral-process coaching.'],
    resources: [RES.marshallBook],
    feedback: 'We need to reset your referral process with the school MTSS team.',
  },
}));

all.push(...build(39, 'Analysis', {
  4: {
    interpretation: 'The teacher works with colleagues to analyze and chart data, draw action conclusions, and leverage student growth.',
    evidence: ['Team-based data analysis', 'Visible action conclusions', 'Data drives decisions'],
    moves: ['Lead team data analysis'],
    coaching: ['Invite to lead data PD.'],
    resources: [RES.wiliam, RES.marshallBook],
    feedback: 'Your data-analysis work keeps the team honest and growing.',
  },
  3: {
    interpretation: 'The teacher analyzes data, draws conclusions, and shares appropriately.',
    evidence: ['Data analyzed', 'Conclusions drawn', 'Some sharing'],
    moves: ['Move to collaborative analysis', 'Chart data so it\'s visible'],
    coaching: ['Collaborative data coaching.'],
    resources: [RES.wiliam],
    feedback: 'Moving to collaborative analysis builds toward Highly Effective.',
  },
  2: {
    interpretation: 'Grades get recorded, some patterns noticed, but no action taken on them.',
    evidence: ['Gradebook up to date', 'No formal analysis', 'No action plan'],
    moves: ['Use an item-analysis protocol at least twice per unit', 'Build one action plan per data review'],
    coaching: ['Item-analysis coaching cycle.'],
    resources: [RES.wiliam],
    feedback: 'Data without action plans is just record-keeping — let\'s add the action step.',
  },
  1: {
    interpretation: 'Grades are recorded and instruction moves on. No analysis happens.',
    evidence: ['Gradebook only', 'No analysis', 'No patterns identified'],
    moves: ['Start a weekly 15-minute data review habit'],
    coaching: ['Data-habit coaching.'],
    resources: [RES.wiliam],
    feedback: 'We will build a simple weekly data-review habit together.',
  },
}));

all.push(...build(40, 'Reflection', {
  4: {
    interpretation: 'The teacher reflects with colleagues on what worked and continuously improves instruction.',
    evidence: ['Regular reflection in PLCs', 'Documented lesson refinements', 'Evidence of improvement over time'],
    moves: ['Share your reflection protocols with the team'],
    coaching: ['Lead reflective-practice PD.'],
    resources: [RES.hattie, RES.knight],
    feedback: 'Reflection is the engine of teacher growth — yours is serious and structured.',
  },
  3: {
    interpretation: 'The teacher reflects on lessons and units and continuously works to improve them.',
    evidence: ['Individual reflection visible', 'Some lesson refinements', 'Growth over time'],
    moves: ['Move to collaborative reflection', 'Keep a formal reflection journal'],
    coaching: ['Reflective-practice coaching.'],
    resources: [RES.hattie],
    feedback: 'Adding a collaborative reflection structure takes this to Highly Effective.',
  },
  2: {
    interpretation: 'Reflection happens at the end of a unit or semester but not systematically.',
    evidence: ['Occasional reflection', 'No written record', 'Sporadic improvements'],
    moves: ['Install a weekly 10-minute reflection routine', 'Keep a brief digital journal'],
    coaching: ['Build reflection routine.'],
    resources: [RES.hattie],
    feedback: 'A weekly reflection habit is the structural upgrade.',
  },
  1: {
    interpretation: 'When teaching is unsuccessful, no lessons are drawn for the future. Mistakes are repeated.',
    evidence: ['No reflection', 'Patterns of ineffective teaching repeated'],
    moves: ['Begin a weekly reflection habit this week'],
    coaching: ['Reflection-habit coaching.'],
    resources: [RES.hattie],
    feedback: 'Reflection is how you keep growing — we will install a weekly habit.',
  },
}));

// ===========================================================================
// DOMAIN E — Family and Community Outreach  (indicators 41-50)
// ===========================================================================
all.push(...build(41, 'Family Respect', {
  4: {
    interpretation: 'The teacher shows great sensitivity and respect for family and community culture, values, and beliefs.',
    evidence: ['Cultural knowledge visible in curriculum', 'Parent-culture sensitivity in communication', 'Community values honored'],
    moves: ['Share cultural-responsiveness practices with team'],
    coaching: ['Lead cultural-responsiveness PD.'],
    resources: [RES.epstein],
    feedback: 'Your cultural responsiveness is a model for the school.',
  },
  3: {
    interpretation: 'The teacher communicates respectfully with parents and is sensitive to different families\' cultures.',
    evidence: ['Respectful tone', 'Awareness of diverse backgrounds', 'Culturally sensitive communication'],
    moves: ['Build a family-information card with cultural notes', 'Include home-language communication when needed'],
    coaching: ['Family-context coaching.'],
    resources: [RES.epstein],
    feedback: 'A systematic approach to learning family context lifts this toward Highly Effective.',
  },
  2: {
    interpretation: 'The teacher tries to be sensitive but sometimes shows lack of awareness.',
    evidence: ['Occasional missteps', 'Generic communication', 'Limited awareness of family diversity'],
    moves: ['Learn basic family-context information for each student', 'Review communications for cultural sensitivity'],
    coaching: ['Cultural-responsiveness coaching.'],
    resources: [RES.epstein],
    feedback: 'Building awareness of each family\'s context closes this gap.',
  },
  1: {
    interpretation: 'The teacher is often insensitive to the culture and beliefs of students\' families.',
    evidence: ['Dismissive of cultural differences', 'Assumes all families are alike', 'Insensitive communications'],
    moves: ['Begin building family-context profiles', 'Review all parent communications before sending'],
    coaching: ['Immediate cultural-responsiveness coaching.'],
    resources: [RES.epstein],
    feedback: 'Cultural responsiveness is foundational to serving our families — we will build it intentionally.',
  },
}));

all.push(...build(42, 'Belief', {
  4: {
    interpretation: 'The teacher shows each parent in-depth knowledge of their child and strong belief in their potential.',
    evidence: ['Personalized parent conversations', 'Belief language used', 'Parents feel known'],
    moves: ['Share your parent-communication practices with team'],
    coaching: ['Lead parent-conference PD.'],
    resources: [RES.epstein],
    feedback: 'Parents who feel their child is known and believed-in are your strongest partners.',
  },
  3: {
    interpretation: 'The teacher shows genuine interest and belief in each child reaching standards.',
    evidence: ['Individual interest shown', 'Positive messaging to parents'],
    moves: ['Move from "I care" to "I know" — share specific student achievements regularly', 'Build a brief note home each week for 5 families'],
    coaching: ['Specific-parent-communication coaching.'],
    resources: [RES.epstein],
    feedback: 'Moving from generic care to specific knowledge in parent communication is the next step.',
  },
  2: {
    interpretation: 'The teacher tells parents they care, but communication is generic.',
    evidence: ['Form-letter style communication', 'Generic "your child" messaging', 'Limited specifics'],
    moves: ['Personalize every parent communication with specifics', 'Share one concrete student achievement per communication'],
    coaching: ['Personalization coaching.'],
    resources: [RES.epstein],
    feedback: 'Specificity in parent communication is the high-leverage move.',
  },
  1: {
    interpretation: 'Parents don\'t see belief or concern in the teacher\'s communication.',
    evidence: ['No personalized communication', 'No expression of belief'],
    moves: ['Send a specific, positive communication about each student this month'],
    coaching: ['Parent-communication coaching.'],
    resources: [RES.epstein],
    feedback: 'Every family needs to hear you believe in their child — we will design this in.',
  },
}));

all.push(...build(43, 'Family Expectations', {
  4: {
    interpretation: 'Parents receive clear, user-friendly expectations and exemplars of proficient work.',
    evidence: ['Exemplars shared', 'Student-friendly expectations', 'Parent guides to curriculum'],
    moves: ['Share parent guide with team'],
    coaching: ['Lead parent-guide design PD.'],
    resources: [RES.epstein],
    feedback: 'Parents who see exemplars can support their children in specific ways.',
  },
  3: {
    interpretation: 'Parents get clear learning and behavior expectations for the year.',
    evidence: ['Back-to-school night communication', 'Syllabus shared', 'Expectations clear'],
    moves: ['Add exemplars of proficient work to parent communication', 'Update expectations mid-year'],
    coaching: ['Exemplar-for-parents coaching.'],
    resources: [RES.epstein],
    feedback: 'Adding exemplars to parent communication is the move.',
  },
  2: {
    interpretation: 'Parents get the rules and syllabus but no real guidance on what proficient work looks like.',
    evidence: ['Rules sheet sent home', 'No work exemplars', 'Limited curriculum communication'],
    moves: ['Build a parent-friendly curriculum guide', 'Share exemplars of proficient work'],
    coaching: ['Parent-guide coaching.'],
    resources: [RES.epstein],
    feedback: 'A parent-friendly curriculum guide lifts this quickly.',
  },
  1: {
    interpretation: 'Parents aren\'t informed about learning or behavior expectations.',
    evidence: ['No communication', 'Parents don\'t know what\'s happening in class'],
    moves: ['Send a unit overview to parents before each unit starting this week'],
    coaching: ['Parent-communication basics coaching.'],
    resources: [RES.epstein],
    feedback: 'Parents need this baseline communication — we will build the habit now.',
  },
}));

all.push(...build(44, 'Communication', {
  4: {
    interpretation: 'Parents hear positive news first AND are immediately informed about problems.',
    evidence: ['Regular positive communication', 'Prompt problem notification', 'Balanced messaging'],
    moves: ['Share your communication cadence with team'],
    coaching: ['Lead parent-communication PD.'],
    resources: [RES.epstein],
    feedback: 'Your communication cadence builds trust with families.',
  },
  3: {
    interpretation: 'The teacher promptly informs parents of problems and also shares good news.',
    evidence: ['Two-way communication', 'Balance of positive and concern', 'Timely outreach'],
    moves: ['Adopt a 2:1 positive-to-concern ratio', 'Log parent contacts'],
    coaching: ['Communication-ratio coaching.'],
    resources: [RES.epstein],
    feedback: 'A 2:1 positive-to-concern ratio in parent contacts is the refinement.',
  },
  2: {
    interpretation: 'Parents hear from the teacher mostly about problems.',
    evidence: ['Heavy concern-focused communication', 'Little positive outreach', 'Parents feel targeted'],
    moves: ['Send 3 positive notes per week before any concern note', 'Track your communication ratio'],
    coaching: ['Positive-communication coaching.'],
    resources: [RES.epstein],
    feedback: 'Leading with positive news changes the entire parent relationship.',
  },
  1: {
    interpretation: 'Parents rarely hear from the teacher about anything — concerns or good news.',
    evidence: ['Silent communication pattern', 'Parents surprised by grades', 'No relationship'],
    moves: ['Commit to a weekly positive contact with 5 families'],
    coaching: ['Parent-communication habit coaching.'],
    resources: [RES.epstein],
    feedback: 'We will build a weekly parent-communication habit.',
  },
}));

all.push(...build(45, 'Involving', {
  4: {
    interpretation: 'Parents are regularly involved in supporting and enriching the curriculum as it unfolds.',
    evidence: ['Weekly curriculum updates', 'Home-learning extensions', 'Parent volunteers'],
    moves: ['Share parent-involvement strategies'],
    coaching: ['Lead parent-involvement PD.'],
    resources: [RES.epstein],
    feedback: 'Your parent partnership is a real lever for student learning.',
  },
  3: {
    interpretation: 'The teacher updates parents on the curriculum and suggests home-support.',
    evidence: ['Curriculum updates', 'Home-learning suggestions'],
    moves: ['Move from "here\'s what\'s happening" to "here\'s how you can help"', 'Include parent-friendly home activities'],
    coaching: ['Home-learning coaching.'],
    resources: [RES.epstein],
    feedback: 'Shifting from informing to activating parents is the upgrade.',
  },
  2: {
    interpretation: 'Occasional home-support suggestions but no systematic involvement.',
    evidence: ['Occasional take-home activities', 'No structured involvement'],
    moves: ['Build weekly home-learning extension', 'Include parent tips in communications'],
    coaching: ['Home-support coaching.'],
    resources: [RES.epstein],
    feedback: 'A weekly structured home-learning extension is the move.',
  },
  1: {
    interpretation: 'The teacher rarely communicates with parents about helping at home.',
    evidence: ['No home-support communication', 'Parents uninvolved'],
    moves: ['Send one home-learning tip per week starting now'],
    coaching: ['Parent-involvement coaching.'],
    resources: [RES.epstein],
    feedback: 'Parents want to help — we will give them specific, doable ways.',
  },
}));

all.push(...build(46, 'Homework', {
  4: {
    interpretation: 'Homework is engaging, return rates are near 100%, and feedback is prompt and helpful.',
    evidence: ['Engaging assignments', '95%+ return', 'Feedback within 48 hours'],
    moves: ['Share your homework design with team'],
    coaching: ['Lead homework-design PD.'],
    resources: [RES.marzano, RES.epstein],
    feedback: 'Your homework system actually advances learning rather than punishing or pretending.',
  },
  3: {
    interpretation: 'Homework is appropriate, students are accountable, and the teacher gives feedback.',
    evidence: ['Appropriate assignments', 'Accountability measures', 'Feedback given'],
    moves: ['Tighten homework to 10-15 minutes of high-leverage practice per day', 'Shorten the feedback loop'],
    coaching: ['Homework-purpose coaching.'],
    resources: [RES.marzano],
    feedback: 'Homework with a clear purpose and quick feedback lifts this.',
  },
  2: {
    interpretation: 'Homework is assigned and tracked but rarely followed up.',
    evidence: ['Compliance tracked', 'No meaningful feedback', 'Quality of homework unclear'],
    moves: ['Give feedback within 48 hours', 'Use homework data to inform re-teaching'],
    coaching: ['Homework-feedback coaching.'],
    resources: [RES.marzano],
    feedback: 'Homework without feedback is a missed opportunity — we will install the feedback step.',
  },
  1: {
    interpretation: 'The teacher assigns homework but accepts that many students won\'t turn it in.',
    evidence: ['Low return rate', 'No follow-up', 'Homework feels meaningless'],
    moves: ['Redesign homework so it\'s clearly connected to next-day instruction', 'Build accountability with feedback'],
    coaching: ['Homework-redesign coaching.'],
    resources: [RES.marzano],
    feedback: 'Low-return homework signals we need to redesign the purpose and system.',
  },
}));

all.push(...build(47, 'Responsiveness', {
  4: {
    interpretation: 'The teacher deals immediately and successfully with parent concerns, making parents feel welcome anytime.',
    evidence: ['Same-day response to parents', 'Parents feel genuinely welcomed', 'Issues resolved quickly'],
    moves: ['Share your responsiveness standards with team'],
    coaching: ['Lead parent-responsiveness PD.'],
    resources: [RES.epstein],
    feedback: 'Parents who feel welcomed are your best advocates.',
  },
  3: {
    interpretation: 'The teacher responds promptly to parent concerns and makes parents feel welcome.',
    evidence: ['24-48 hour response', 'Welcoming tone', 'Issues addressed'],
    moves: ['Commit to same-day responses when possible', 'Track response times'],
    coaching: ['Response-time coaching.'],
    resources: [RES.epstein],
    feedback: 'Same-day responses move this to Highly Effective.',
  },
  2: {
    interpretation: 'The teacher is sometimes slow to respond and can come across as unwelcoming.',
    evidence: ['Delayed responses', 'Occasional cold tone', 'Parents feel hesitant to reach out'],
    moves: ['Set a 24-hour response standard', 'Review communication tone'],
    coaching: ['Tone-and-timing coaching.'],
    resources: [RES.epstein],
    feedback: 'A 24-hour response standard and tone review closes this gap.',
  },
  1: {
    interpretation: 'The teacher doesn\'t respond to parents, and parents feel unwelcome.',
    evidence: ['Ignored communications', 'Parents feel blocked'],
    moves: ['Respond to all parent communications within 24 hours starting this week'],
    coaching: ['Response-habit coaching.'],
    resources: [RES.epstein],
    feedback: 'Every parent communication gets a response within 24 hours — that\'s our standard.',
  },
}));

all.push(...build(48, 'Reporting', {
  4: {
    interpretation: 'The teacher uses student-led conferences, report cards, and informal talks to give parents detailed feedback.',
    evidence: ['Student-led conferences', 'Detailed progress reports', 'Informal check-ins'],
    moves: ['Share your conference approach with team'],
    coaching: ['Lead student-led conference PD.'],
    resources: [RES.epstein, RES.wiliam],
    feedback: 'Student-led conferences are the gold standard — keep this practice.',
  },
  3: {
    interpretation: 'Conferences and report cards give parents feedback on progress.',
    evidence: ['Regular conferences', 'Detailed report cards', 'Clear feedback'],
    moves: ['Move toward student-led conferences', 'Add mid-quarter progress communication'],
    coaching: ['Conference-structure coaching.'],
    resources: [RES.epstein],
    feedback: 'Moving toward student-led conferences is the path to Highly Effective.',
  },
  2: {
    interpretation: 'Conferences tell parents where their child can improve, but details are thin.',
    evidence: ['Surface-level feedback', 'Limited data shared', 'Focus only on weaknesses'],
    moves: ['Prepare data-rich conference materials', 'Balance strengths and growth areas'],
    coaching: ['Conference-preparation coaching.'],
    resources: [RES.epstein],
    feedback: 'Data-rich, balanced conferences are the move.',
  },
  1: {
    interpretation: 'Report cards go home; parents are expected to figure out the rest.',
    evidence: ['No conferences held', 'No follow-up', 'Parents surprised by grades'],
    moves: ['Hold a conference for every student this quarter'],
    coaching: ['Conference-establishment coaching.'],
    resources: [RES.epstein],
    feedback: 'Regular conferences are a baseline — we will establish them.',
  },
}));

all.push(...build(49, 'Outreach', {
  4: {
    interpretation: 'The teacher successfully contacts and works with all parents, including those hard to reach.',
    evidence: ['100% family contact', 'Tenacious with hard-to-reach', 'Home visits or flexible meeting times'],
    moves: ['Share your outreach strategies with team'],
    coaching: ['Lead hard-to-reach outreach PD.'],
    resources: [RES.epstein],
    feedback: 'Reaching all families — especially the hardest to reach — is the deepest equity work.',
  },
  3: {
    interpretation: 'The teacher tries to contact all parents and is tenacious with hard-to-reach families.',
    evidence: ['Broad outreach', 'Multiple attempts for hard-to-reach', 'Most families contacted'],
    moves: ['Offer evening or home visit options', 'Use multiple communication channels'],
    coaching: ['Channel-diversification coaching.'],
    resources: [RES.epstein],
    feedback: 'Multiple channels and flexible timing closes the last gap.',
  },
  2: {
    interpretation: 'Most of the teacher\'s contact is with high-achieving students\' parents.',
    evidence: ['Lopsided contact', 'Limited hard-to-reach outreach', 'Unequal relationships'],
    moves: ['List your 5 least-contacted families and reach out to them this month', 'Diversify outreach channels'],
    coaching: ['Equity-of-outreach coaching.'],
    resources: [RES.epstein],
    feedback: 'Targeting the families you don\'t hear from is the equity move.',
  },
  1: {
    interpretation: 'Little or no effort to contact parents.',
    evidence: ['No family outreach', 'No family relationships'],
    moves: ['Contact every family this month'],
    coaching: ['Outreach-establishment coaching.'],
    resources: [RES.epstein],
    feedback: 'We will establish family outreach as a core habit.',
  },
}));

all.push(...build(50, 'Resources', {
  4: {
    interpretation: 'The teacher successfully enlists classroom volunteers and extra resources from homes and the community.',
    evidence: ['Regular classroom volunteers', 'Community resources integrated', 'Parent expertise utilized'],
    moves: ['Share your resource-building practices'],
    coaching: ['Lead community-resource PD.'],
    resources: [RES.epstein],
    feedback: 'Your community-resource network strengthens learning for all students.',
  },
  3: {
    interpretation: 'The teacher reaches out to families and community agencies for volunteers and additional resources.',
    evidence: ['Some volunteers', 'Some community connections', 'Occasional resource-gathering'],
    moves: ['Systematize volunteer recruitment', 'Build a community-resource map'],
    coaching: ['Resource-mapping coaching.'],
    resources: [RES.epstein],
    feedback: 'A systematized approach to volunteers and resources is the move.',
  },
  2: {
    interpretation: 'The teacher asks for occasional parent involvement but doesn\'t actively build a resource network.',
    evidence: ['One-off volunteer requests', 'No community partnerships'],
    moves: ['Build one new community partnership this semester', 'Invite one volunteer per month'],
    coaching: ['Partnership-building coaching.'],
    resources: [RES.epstein],
    feedback: 'Intentional partnership-building is the upgrade.',
  },
  1: {
    interpretation: 'The teacher doesn\'t reach out for extra support from parents or the community.',
    evidence: ['No volunteers', 'No community connections'],
    moves: ['Invite one parent volunteer this month'],
    coaching: ['Outreach-habit coaching.'],
    resources: [RES.epstein],
    feedback: 'Even one volunteer per month changes a classroom — we will start there.',
  },
}));

// ===========================================================================
// DOMAIN F — Professional Responsibilities  (indicators 51-60)
// ===========================================================================
all.push(...build(51, 'Attendance', {
  4: {
    interpretation: 'Perfect or near-perfect attendance (98-100%).',
    evidence: ['Attends nearly every scheduled day', 'Plans ahead for known absences', 'Models reliability for students'],
    moves: ['Continue current patterns'],
    coaching: ['Preserve and honor this reliability.'],
    resources: [],
    feedback: 'Your presence is felt and your students are benefiting.',
  },
  3: {
    interpretation: 'Very good attendance (95-97%).',
    evidence: ['Reliable presence', 'Absences communicated appropriately'],
    moves: ['Continue patterns', 'Plan ahead for known absences'],
    coaching: [],
    resources: [],
    feedback: 'Your attendance reliability is professional and appreciated.',
  },
  2: {
    interpretation: 'Moderate absences (6-10%).',
    evidence: ['6-10% absence rate', 'Pattern is noticeable'],
    moves: ['Review absence patterns with principal', 'Build proactive sub-plans for known absence days'],
    coaching: ['Attendance-planning conversation.'],
    resources: [],
    feedback: 'Attendance pattern needs attention — let\'s discuss extenuating circumstances if any.',
  },
  1: {
    interpretation: 'Many absences (11%+).',
    evidence: ['Absence rate 11% or higher', 'Impact on student learning'],
    moves: ['Immediate conversation with principal', 'Review FMLA/ADA/personal situation'],
    coaching: ['Formal attendance improvement plan.'],
    resources: [],
    feedback: 'This level of absence impacts students — we need to discuss circumstances and a plan.',
  },
}));

all.push(...build(52, 'Language', {
  4: {
    interpretation: 'In professional contexts, the teacher speaks and writes correctly, succinctly, and eloquently.',
    evidence: ['Polished written communication', 'Precise verbal communication', 'Models strong language for students'],
    moves: ['Continue modeling'],
    coaching: ['Share polished communication as a model.'],
    resources: [],
    feedback: 'Your professional language models for students what academic fluency sounds like.',
  },
  3: {
    interpretation: 'Correct grammar, syntax, usage, and spelling in professional contexts.',
    evidence: ['Generally correct language', 'Professional tone'],
    moves: ['Use grammar-check tools for high-stakes communication', 'Proofread before sending'],
    coaching: [],
    resources: [],
    feedback: 'Your professional language is solid — maintain it.',
  },
  2: {
    interpretation: 'Periodic errors in grammar, syntax, usage, or spelling.',
    evidence: ['Occasional errors', 'Communications need proofreading'],
    moves: ['Always use a grammar-check tool', 'Ask a colleague to proof important communications'],
    coaching: ['Writing-check coaching.'],
    resources: [],
    feedback: 'Consistent use of grammar-check tools closes this gap.',
  },
  1: {
    interpretation: 'Frequent errors in professional language.',
    evidence: ['Regular errors in written communication', 'Unprofessional tone'],
    moves: ['Required proofreading of all communications by principal for a period'],
    coaching: ['Professional-writing coaching.'],
    resources: [],
    feedback: 'Professional language matters for credibility — we need to address this directly.',
  },
}));

all.push(...build(53, 'Reliability', {
  4: {
    interpretation: 'Meticulous records, punctual, conscientious.',
    evidence: ['Records are current and accurate', 'Never late', 'Paperwork always on time'],
    moves: ['Continue patterns'],
    coaching: ['Share your systems with peers.'],
    resources: [],
    feedback: 'Your reliability makes the whole school run better.',
  },
  3: {
    interpretation: 'Punctual and reliable with paperwork and assignments.',
    evidence: ['On time', 'Accurate records', 'Reliable follow-through'],
    moves: ['Maintain systems', 'Share what works with colleagues'],
    coaching: [],
    resources: [],
    feedback: 'Your reliability is professional and consistent.',
  },
  2: {
    interpretation: 'Occasionally skips assignments, is late, or misses paperwork deadlines.',
    evidence: ['Occasional missed deadlines', 'Some late arrivals', 'Records sometimes inaccurate'],
    moves: ['Use a calendar with reminders for all deadlines', 'Set up a weekly admin time block'],
    coaching: ['Systems coaching.'],
    resources: [],
    feedback: 'A simple calendar-reminder system closes this gap.',
  },
  1: {
    interpretation: 'Frequently skips assignments, is late, or misses deadlines.',
    evidence: ['Pattern of missed deadlines', 'Chronic tardiness', 'Record-keeping errors'],
    moves: ['Weekly check-in with principal on deadlines'],
    coaching: ['Accountability coaching.'],
    resources: [],
    feedback: 'Reliability is a baseline — we will establish a system.',
  },
}));

all.push(...build(54, 'Professionalism', {
  4: {
    interpretation: 'Always presents as a consummate professional with appropriate boundaries.',
    evidence: ['Professional demeanor in all interactions', 'Appropriate dress', 'Clear boundaries'],
    moves: ['Continue patterns', 'Mentor newer teachers'],
    coaching: ['Model professionalism for induction.'],
    resources: [],
    feedback: 'Your professionalism sets a tone for the whole building.',
  },
  3: {
    interpretation: 'Demonstrates professional demeanor and maintains appropriate boundaries.',
    evidence: ['Generally professional', 'Appropriate boundaries'],
    moves: ['Maintain patterns'],
    coaching: [],
    resources: [],
    feedback: 'Your professionalism is solid — maintain it.',
  },
  2: {
    interpretation: 'Occasional lapses in professional demeanor, dress, or boundaries.',
    evidence: ['Occasional issues', 'Some boundary confusion'],
    moves: ['Review district professionalism expectations', 'Seek mentor feedback on professional presentation'],
    coaching: ['Professional-presentation coaching.'],
    resources: [],
    feedback: 'A review of professional expectations will close this gap.',
  },
  1: {
    interpretation: 'Frequent professionalism issues that impact the learning environment.',
    evidence: ['Regular boundary issues', 'Unprofessional dress or demeanor'],
    moves: ['Immediate conversation with principal'],
    coaching: ['Formal professionalism plan.'],
    resources: [],
    feedback: 'Professionalism is a baseline expectation — we will address this directly.',
  },
}));

all.push(...build(55, 'Judgment', {
  4: {
    interpretation: 'Invariably ethical, honest, forthright; impeccable judgment; respects confidentiality.',
    evidence: ['Ethical decision-making', 'Honest communication', 'Confidentiality respected'],
    moves: ['Continue patterns', 'Mentor colleagues on ethical decision-making'],
    coaching: ['Model ethical judgment.'],
    resources: [],
    feedback: 'Your judgment is a pillar of trust in the school.',
  },
  3: {
    interpretation: 'Ethical and forthright, uses good judgment, maintains confidentiality.',
    evidence: ['Ethical behavior', 'Good judgment', 'Confidentiality maintained'],
    moves: ['Maintain patterns'],
    coaching: [],
    resources: [],
    feedback: 'Your ethical practice is solid.',
  },
  2: {
    interpretation: 'Questionable judgment at times; occasionally less than honest; sometimes discloses student information.',
    evidence: ['Occasional questionable decisions', 'Some confidentiality concerns'],
    moves: ['Review FERPA and district ethics policies', 'Consult with principal on gray-area decisions'],
    coaching: ['Ethics-and-FERPA coaching.'],
    resources: [],
    feedback: 'A FERPA/ethics refresher closes this gap.',
  },
  1: {
    interpretation: 'Frequently unethical, dishonest, poor judgment, or discloses student information.',
    evidence: ['Repeated ethical concerns', 'FERPA violations'],
    moves: ['Immediate formal intervention'],
    coaching: ['Formal ethics plan.'],
    resources: [],
    feedback: 'This is a formal matter requiring immediate intervention.',
  },
}));

all.push(...build(56, 'Above-and-beyond', {
  4: {
    interpretation: 'Important member of teacher teams and committees, frequently volunteers for after-school activities.',
    evidence: ['Committee leadership', 'After-school involvement', 'Team contributions'],
    moves: ['Continue engagement'],
    coaching: ['Invite into school leadership work.'],
    resources: [],
    feedback: 'Your contributions beyond the classroom build the school culture.',
  },
  3: {
    interpretation: 'Shares responsibility for grade-level and schoolwide activities.',
    evidence: ['Team member', 'After-school involvement'],
    moves: ['Take on one leadership role'],
    coaching: [],
    resources: [],
    feedback: 'Taking on a leadership role is the next step.',
  },
  2: {
    interpretation: 'Will serve when asked but doesn\'t initiate.',
    evidence: ['Reactive involvement', 'Minimal initiative'],
    moves: ['Volunteer for one committee or activity this semester'],
    coaching: ['Engagement-invitation coaching.'],
    resources: [],
    feedback: 'Moving from reactive to proactive engagement is the move.',
  },
  1: {
    interpretation: 'Declines invitations to serve and attend activities.',
    evidence: ['Refuses committee work', 'No after-school engagement'],
    moves: ['Conversation with principal about school contribution expectations'],
    coaching: ['Expectation-setting conversation.'],
    resources: [],
    feedback: 'All staff contribute to the school beyond the classroom — we need to discuss expectations.',
  },
}));

all.push(...build(57, 'Leadership', {
  4: {
    interpretation: 'Frequently contributes valuable ideas and instills in others a desire to improve student results.',
    evidence: ['Thought leadership', 'Positive influence on colleagues', 'Drives improvement'],
    moves: ['Continue leadership', 'Take on formal leadership roles'],
    coaching: ['Formal leadership pipeline.'],
    resources: [],
    feedback: 'Your leadership is building our school.',
  },
  3: {
    interpretation: 'Positive team player, contributes ideas, expertise, and time.',
    evidence: ['Active contribution', 'Team support', 'Positive attitude'],
    moves: ['Take on one initiative leadership role'],
    coaching: [],
    resources: [],
    feedback: 'Stepping into an initiative leadership role is the next growth move.',
  },
  2: {
    interpretation: 'Occasional suggestions but not consistent leadership.',
    evidence: ['Occasional ideas', 'Limited follow-through'],
    moves: ['Volunteer to lead one team initiative', 'Bring one idea per month to the team'],
    coaching: ['Leadership-development coaching.'],
    resources: [],
    feedback: 'Consistency in contribution is the move.',
  },
  1: {
    interpretation: 'Rarely contributes ideas to improving the school.',
    evidence: ['No team contribution', 'No ideas offered'],
    moves: ['Commit to one idea per team meeting'],
    coaching: ['Engagement-building coaching.'],
    resources: [],
    feedback: 'Being a contributing team member is an expectation — let\'s build the habit.',
  },
}));

all.push(...build(58, 'Openness', {
  4: {
    interpretation: 'Actively seeks feedback and uses it to improve.',
    evidence: ['Requests feedback regularly', 'Acts on feedback', 'Visible growth'],
    moves: ['Continue patterns', 'Mentor colleagues in feedback reception'],
    coaching: ['Model feedback-seeking behavior.'],
    resources: [RES.knight],
    feedback: 'Your feedback-seeking mindset is exactly what our coaching culture needs.',
  },
  3: {
    interpretation: 'Listens thoughtfully and responds constructively to suggestions.',
    evidence: ['Receives feedback well', 'Constructive response', 'Some action'],
    moves: ['Move from receiving to requesting feedback', 'Close the feedback loop with specific action'],
    coaching: ['Feedback-request coaching.'],
    resources: [RES.knight],
    feedback: 'Requesting feedback proactively is the upgrade.',
  },
  2: {
    interpretation: 'Somewhat defensive but does listen.',
    evidence: ['Initial defensiveness', 'Partial listening', 'Limited action on feedback'],
    moves: ['Practice receiving feedback with curiosity ("Tell me more")', 'Name one feedback item to act on weekly'],
    coaching: ['Feedback-reception coaching.'],
    resources: [RES.knight],
    feedback: 'Moving from defense to curiosity is the work.',
  },
  1: {
    interpretation: 'Very defensive; resistant to changing practice.',
    evidence: ['Strong defensiveness', 'Resistance to change', 'No growth from feedback'],
    moves: ['Work with coach to build feedback reception skills'],
    coaching: ['Intensive feedback-reception coaching.'],
    resources: [RES.knight],
    feedback: 'Openness to feedback is foundational — we will work on this together.',
  },
}));

all.push(...build(59, 'Collaboration', {
  4: {
    interpretation: 'Meets at least weekly with colleagues to plan, share teaching ideas, and analyze assessments.',
    evidence: ['Regular PLC participation', 'Data analysis with peers', 'Shared unit planning'],
    moves: ['Continue patterns', 'Lead PLC work'],
    coaching: ['PLC facilitation training.'],
    resources: [RES.hattie],
    feedback: 'Your collaborative practice is what Hattie calls "collective teacher efficacy" — the top effect size in his research.',
  },
  3: {
    interpretation: 'Collaborates with colleagues to plan units, share ideas, look at student work.',
    evidence: ['Regular collaboration', 'Shared planning', 'Some student-work analysis'],
    moves: ['Move to weekly collaboration', 'Add interim-assessment analysis'],
    coaching: ['Weekly-PLC coaching.'],
    resources: [RES.hattie],
    feedback: 'Weekly structured collaboration is the move.',
  },
  2: {
    interpretation: 'Occasional collaboration but not systematic.',
    evidence: ['Some conversations', 'No shared planning', 'No data analysis together'],
    moves: ['Commit to weekly PLC participation', 'Bring one data question per week'],
    coaching: ['PLC-participation coaching.'],
    resources: [RES.hattie],
    feedback: 'Weekly PLC engagement is the baseline.',
  },
  1: {
    interpretation: 'Meets infrequently and conversations lack educational substance.',
    evidence: ['Avoids collaboration', 'Shallow conversations', 'No team participation'],
    moves: ['Required weekly PLC participation'],
    coaching: ['PLC-facilitation support.'],
    resources: [RES.hattie],
    feedback: 'Collaborative practice is required — we will establish it.',
  },
}));

all.push(...build(60, 'Growth', {
  4: {
    interpretation: 'Actively reaches out for new ideas and engages in action research.',
    evidence: ['Action research projects', 'Reading and implementing new research', 'Continuous learner'],
    moves: ['Continue learning', 'Share action research with team'],
    coaching: ['Action-research support.'],
    resources: [RES.knight, RES.hattie],
    feedback: 'Your professional growth mindset models lifelong learning for students.',
  },
  3: {
    interpretation: 'Seeks effective teaching ideas from colleagues, workshops, and other sources.',
    evidence: ['PD participation', 'Tries new strategies', 'Learning from colleagues'],
    moves: ['Build a formal learning plan with 3 growth goals', 'Read one professional book per semester'],
    coaching: ['Learning-plan coaching.'],
    resources: [RES.knight],
    feedback: 'A formal learning plan with measurable goals is the move toward Highly Effective.',
  },
  2: {
    interpretation: 'Can occasionally be persuaded to try new practices.',
    evidence: ['Reluctant to try new things', 'Limited professional reading', 'Low PD engagement'],
    moves: ['Commit to one new practice per month', 'Attend one PD per semester outside required'],
    coaching: ['Growth-habit coaching.'],
    resources: [RES.knight],
    feedback: 'A monthly "new practice to try" habit builds growth mindset.',
  },
  1: {
    interpretation: 'Not open to new ideas for improving teaching.',
    evidence: ['Resistance to change', 'No PD engagement', 'Static practice'],
    moves: ['Build a formal growth plan with principal'],
    coaching: ['Intensive growth-mindset coaching.'],
    resources: [RES.knight],
    feedback: 'Growth is required in our profession — we need to build a formal plan.',
  },
}));

// ---------------------------------------------------------------------------
// Emit SQL
// ---------------------------------------------------------------------------
console.log('-- =====================================================');
console.log('-- Pedagogy Library — generated by seed/build_pedagogy.mjs');
console.log(`-- 240 entries (60 indicators × 4 levels)`);
console.log('-- =====================================================');
console.log('');

for (const r of all) {
  const interpretation = esc(r.interpretation || '');
  const evidence = j(r.evidence || []);
  const moves = j(r.moves || []);
  const coaching = j(r.coaching || []);
  // Normalize resources: strip raw objects, convert to small {title, source, type}
  const resources = j((r.resources || []).map(x => typeof x === 'string' ? { title: x } : x));
  const feedback = esc(r.feedback || '');
  console.log(
    `INSERT OR REPLACE INTO pedagogy_library (indicator_id, level, interpretation, evidence_signals, teacher_next_moves, coaching_considerations, resources, feedback_starter) VALUES (${r.indicator_id}, ${r.level}, '${interpretation}', '${evidence}', '${moves}', '${coaching}', '${resources}', '${feedback}');`
  );
}

console.error(`Generated ${all.length} pedagogy entries.`);
