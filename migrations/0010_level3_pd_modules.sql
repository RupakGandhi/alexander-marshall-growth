-- ============================================================================
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


-- A.A Knowledge — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  1, 3,
  'Level 3 → 4: Modeling deep subject-matter expertise so colleagues seek you out as a content resource',
  'Marshall indicator A.A · Knowledge — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Knowledge. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Knowledge that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Knowledge

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Knowledge. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Knowledge — others observe your classroom or ask for your planning
  · The practice on Knowledge produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Knowledge:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Knowledge
  · Student outcomes on Knowledge are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Knowledge from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Knowledge, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Knowledge.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Knowledge so colleagues can adopt it.
  • INNOVATE — Try one move on Knowledge that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Knowledge right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Knowledge, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Knowledge is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Knowledge)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Knowledge?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Knowledge
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Knowledge, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Knowledge is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Knowledge.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Knowledge are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Knowledge produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Knowledge.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Knowledge? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Knowledge — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Knowledge.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 1 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- A.B Standards — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  2, 3,
  'Level 3 → 4: Becoming the grade-level standards expert your team consults when unpacking new units',
  'Marshall indicator A.B · Standards — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Standards. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Standards that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Standards

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Standards. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Standards — others observe your classroom or ask for your planning
  · The practice on Standards produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Standards:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Standards
  · Student outcomes on Standards are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Standards from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Standards, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Standards.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Standards so colleagues can adopt it.
  • INNOVATE — Try one move on Standards that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Standards right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Standards, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Standards is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Standards)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Standards?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Standards
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Standards, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Standards is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Standards.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Standards are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Standards produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Standards.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Standards? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Standards — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Standards.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 2 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- A.C Units — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  3, 3,
  'Level 3 → 4: Publishing a model unit that colleagues adopt and adapt across the building',
  'Marshall indicator A.C · Units — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Units. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Units that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Units

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Units. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Units — others observe your classroom or ask for your planning
  · The practice on Units produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Units:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Units
  · Student outcomes on Units are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Units from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Units, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Units.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Units so colleagues can adopt it.
  • INNOVATE — Try one move on Units that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Units right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Units, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Units is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Units)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Units?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Units
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Units, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Units is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Units.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Units are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Units produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Units.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Units? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Units — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Units.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 3 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- A.D Assessments — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  4, 3,
  'Level 3 → 4: Designing district-grade assessments and coaching colleagues to do the same',
  'Marshall indicator A.D · Assessments — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Assessments. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Assessments that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Assessments

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Assessments. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Assessments — others observe your classroom or ask for your planning
  · The practice on Assessments produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Assessments:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Assessments
  · Student outcomes on Assessments are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Assessments from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Assessments, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Assessments.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Assessments so colleagues can adopt it.
  • INNOVATE — Try one move on Assessments that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Assessments right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Assessments, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Assessments is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Assessments)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Assessments?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Assessments
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Assessments, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Assessments is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Assessments.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Assessments are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Assessments produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Assessments.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Assessments? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Assessments — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Assessments.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 4 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- A.E Anticipation — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  5, 3,
  'Level 3 → 4: Building a shared bank of anticipated misconceptions for your team to use',
  'Marshall indicator A.E · Anticipation — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Anticipation. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Anticipation that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Anticipation

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Anticipation. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Anticipation — others observe your classroom or ask for your planning
  · The practice on Anticipation produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Anticipation:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Anticipation
  · Student outcomes on Anticipation are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Anticipation from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Anticipation, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Anticipation.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Anticipation so colleagues can adopt it.
  • INNOVATE — Try one move on Anticipation that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Anticipation right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Anticipation, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Anticipation is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Anticipation)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Anticipation?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Anticipation
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Anticipation, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Anticipation is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Anticipation.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Anticipation are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Anticipation produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Anticipation.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Anticipation? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Anticipation — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Anticipation.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 5 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- A.F Lessons — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  6, 3,
  'Level 3 → 4: Crafting model lessons that colleagues observe, debrief, and replicate',
  'Marshall indicator A.F · Lessons — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Lessons. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Lessons that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Lessons

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Lessons. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Lessons — others observe your classroom or ask for your planning
  · The practice on Lessons produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Lessons:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Lessons
  · Student outcomes on Lessons are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Lessons from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Lessons, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Lessons.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Lessons so colleagues can adopt it.
  • INNOVATE — Try one move on Lessons that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Lessons right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Lessons, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Lessons is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Lessons)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Lessons?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Lessons
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Lessons, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Lessons is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Lessons.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Lessons are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Lessons produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Lessons.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Lessons? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Lessons — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Lessons.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 6 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- A.G Engagement — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  7, 3,
  'Level 3 → 4: Designing signature engagement experiences other teachers ask to learn from',
  'Marshall indicator A.G · Engagement — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Engagement. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Engagement that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Engagement

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Engagement. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Engagement — others observe your classroom or ask for your planning
  · The practice on Engagement produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Engagement:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Engagement
  · Student outcomes on Engagement are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Engagement from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Engagement, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Engagement.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Engagement so colleagues can adopt it.
  • INNOVATE — Try one move on Engagement that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Engagement right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Engagement, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Engagement is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Engagement)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Engagement?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Engagement
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Engagement, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Engagement is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Engagement.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Engagement are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Engagement produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Engagement.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Engagement? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Engagement — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Engagement.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 7 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- A.H Materials — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  8, 3,
  'Level 3 → 4: Curating the materials library your grade level or department uses',
  'Marshall indicator A.H · Materials — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Materials. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Materials that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Materials

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Materials. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Materials — others observe your classroom or ask for your planning
  · The practice on Materials produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Materials:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Materials
  · Student outcomes on Materials are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Materials from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Materials, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Materials.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Materials so colleagues can adopt it.
  • INNOVATE — Try one move on Materials that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Materials right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Materials, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Materials is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Materials)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Materials?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Materials
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Materials, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Materials is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Materials.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Materials are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Materials produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Materials.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Materials? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Materials — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Materials.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 8 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- A.I Differentiation — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  9, 3,
  'Level 3 → 4: Leading your team to plan deeply differentiated lessons together',
  'Marshall indicator A.I · Differentiation — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Differentiation. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Differentiation that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Differentiation

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Differentiation. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Differentiation — others observe your classroom or ask for your planning
  · The practice on Differentiation produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Differentiation:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Differentiation
  · Student outcomes on Differentiation are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Differentiation from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Differentiation, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Differentiation.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Differentiation so colleagues can adopt it.
  • INNOVATE — Try one move on Differentiation that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Differentiation right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Differentiation, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Differentiation is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Differentiation)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Differentiation?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Differentiation
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Differentiation, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Differentiation is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Differentiation.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Differentiation are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Differentiation produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Differentiation.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Differentiation? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Differentiation — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Differentiation.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 9 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- A.J Environment — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  10, 3,
  'Level 3 → 4: Building a classroom environment colleagues tour as an exemplar',
  'Marshall indicator A.J · Environment — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Environment. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Environment that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Environment

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Environment. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Environment — others observe your classroom or ask for your planning
  · The practice on Environment produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Environment:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Environment
  · Student outcomes on Environment are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Environment from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Environment, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Environment.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Environment so colleagues can adopt it.
  • INNOVATE — Try one move on Environment that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Environment right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Environment, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Environment is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Environment)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Environment?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Environment
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Environment, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Environment is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Environment.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Environment are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Environment produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Environment.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Environment? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Environment — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Environment.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 10 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- B.A Expectations — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  11, 3,
  'Level 3 → 4: Coaching colleagues on establishing classroom expectations that actually hold',
  'Marshall indicator B.A · Expectations — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Expectations. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Expectations that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Expectations

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Expectations. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Expectations — others observe your classroom or ask for your planning
  · The practice on Expectations produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Expectations:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Expectations
  · Student outcomes on Expectations are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Expectations from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Expectations, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Expectations.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Expectations so colleagues can adopt it.
  • INNOVATE — Try one move on Expectations that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Expectations right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Expectations, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Expectations is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Expectations)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Expectations?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Expectations
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Expectations, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Expectations is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Expectations.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Expectations are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Expectations produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Expectations.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Expectations? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Expectations — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Expectations.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 11 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- B.B Relationships — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  12, 3,
  'Level 3 → 4: Modeling teacher-student relationship-building that transforms hard-to-reach students',
  'Marshall indicator B.B · Relationships — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Relationships. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Relationships that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Relationships

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Relationships. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Relationships — others observe your classroom or ask for your planning
  · The practice on Relationships produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Relationships:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Relationships
  · Student outcomes on Relationships are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Relationships from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Relationships, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Relationships.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Relationships so colleagues can adopt it.
  • INNOVATE — Try one move on Relationships that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Relationships right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Relationships, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Relationships is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Relationships)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Relationships?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Relationships
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Relationships, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Relationships is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Relationships.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Relationships are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Relationships produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Relationships.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Relationships? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Relationships — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Relationships.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 12 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- B.C Respect — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  13, 3,
  'Level 3 → 4: Building a building-wide respect culture by modeling and naming the moves',
  'Marshall indicator B.C · Respect — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Respect. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Respect that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Respect

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Respect. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Respect — others observe your classroom or ask for your planning
  · The practice on Respect produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Respect:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Respect
  · Student outcomes on Respect are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Respect from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Respect, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Respect.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Respect so colleagues can adopt it.
  • INNOVATE — Try one move on Respect that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Respect right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Respect, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Respect is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Respect)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Respect?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Respect
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Respect, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Respect is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Respect.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Respect are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Respect produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Respect.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Respect? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Respect — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Respect.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 13 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- B.D Social-emotional — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  14, 3,
  'Level 3 → 4: Leading SEL implementation for your grade level or department',
  'Marshall indicator B.D · Social-emotional — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Social-emotional. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Social-emotional that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Social-emotional

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Social-emotional. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Social-emotional — others observe your classroom or ask for your planning
  · The practice on Social-emotional produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Social-emotional:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Social-emotional
  · Student outcomes on Social-emotional are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Social-emotional from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Social-emotional, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Social-emotional.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Social-emotional so colleagues can adopt it.
  • INNOVATE — Try one move on Social-emotional that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Social-emotional right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Social-emotional, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Social-emotional is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Social-emotional)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Social-emotional?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Social-emotional
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Social-emotional, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Social-emotional is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Social-emotional.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Social-emotional are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Social-emotional produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Social-emotional.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Social-emotional? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Social-emotional — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Social-emotional.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 14 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- B.E Routines — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  15, 3,
  'Level 3 → 4: Coaching colleagues to design routines that recover instructional minutes',
  'Marshall indicator B.E · Routines — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Routines. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Routines that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Routines

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Routines. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Routines — others observe your classroom or ask for your planning
  · The practice on Routines produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Routines:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Routines
  · Student outcomes on Routines are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Routines from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Routines, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Routines.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Routines so colleagues can adopt it.
  • INNOVATE — Try one move on Routines that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Routines right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Routines, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Routines is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Routines)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Routines?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Routines
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Routines, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Routines is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Routines.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Routines are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Routines produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Routines.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Routines? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Routines — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Routines.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 15 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- B.F Responsibility — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  16, 3,
  'Level 3 → 4: Modeling student-accountability conversations colleagues then adopt',
  'Marshall indicator B.F · Responsibility — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Responsibility. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Responsibility that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Responsibility

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Responsibility. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Responsibility — others observe your classroom or ask for your planning
  · The practice on Responsibility produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Responsibility:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Responsibility
  · Student outcomes on Responsibility are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Responsibility from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Responsibility, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Responsibility.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Responsibility so colleagues can adopt it.
  • INNOVATE — Try one move on Responsibility that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Responsibility right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Responsibility, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Responsibility is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Responsibility)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Responsibility?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Responsibility
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Responsibility, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Responsibility is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Responsibility.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Responsibility are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Responsibility produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Responsibility.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Responsibility? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Responsibility — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Responsibility.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 16 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- B.G Repertoire (behavior) — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  17, 3,
  'Level 3 → 4: Sharing your de-escalation repertoire with colleagues through coaching cycles',
  'Marshall indicator B.G · Repertoire (behavior) — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Repertoire (behavior). The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Repertoire (behavior) that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Repertoire (behavior)

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Repertoire (behavior). Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Repertoire (behavior) — others observe your classroom or ask for your planning
  · The practice on Repertoire (behavior) produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Repertoire (behavior):
  · Colleagues seek out your materials, lesson designs, or coaching moves for Repertoire (behavior)
  · Student outcomes on Repertoire (behavior) are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Repertoire (behavior) from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Repertoire (behavior), then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Repertoire (behavior).
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Repertoire (behavior) so colleagues can adopt it.
  • INNOVATE — Try one move on Repertoire (behavior) that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Repertoire (behavior) right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Repertoire (behavior), what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Repertoire (behavior) is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Repertoire (behavior))
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Repertoire (behavior)?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Repertoire (behavior)
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Repertoire (behavior), and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Repertoire (behavior) is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Repertoire (behavior).

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Repertoire (behavior) are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Repertoire (behavior) produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Repertoire (behavior).

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Repertoire (behavior)? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Repertoire (behavior) — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Repertoire (behavior).
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 17 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- B.H Efficiency — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  18, 3,
  'Level 3 → 4: Auditing instructional-time efficiency across your team and recovering lost minutes',
  'Marshall indicator B.H · Efficiency — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Efficiency. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Efficiency that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Efficiency

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Efficiency. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Efficiency — others observe your classroom or ask for your planning
  · The practice on Efficiency produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Efficiency:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Efficiency
  · Student outcomes on Efficiency are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Efficiency from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Efficiency, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Efficiency.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Efficiency so colleagues can adopt it.
  • INNOVATE — Try one move on Efficiency that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Efficiency right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Efficiency, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Efficiency is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Efficiency)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Efficiency?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Efficiency
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Efficiency, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Efficiency is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Efficiency.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Efficiency are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Efficiency produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Efficiency.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Efficiency? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Efficiency — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Efficiency.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 18 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- B.I Prevention — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  19, 3,
  'Level 3 → 4: Coaching colleagues on proactive classroom-presence moves that prevent disruption',
  'Marshall indicator B.I · Prevention — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Prevention. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Prevention that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Prevention

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Prevention. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Prevention — others observe your classroom or ask for your planning
  · The practice on Prevention produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Prevention:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Prevention
  · Student outcomes on Prevention are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Prevention from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Prevention, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Prevention.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Prevention so colleagues can adopt it.
  • INNOVATE — Try one move on Prevention that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Prevention right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Prevention, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Prevention is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Prevention)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Prevention?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Prevention
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Prevention, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Prevention is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Prevention.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Prevention are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Prevention produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Prevention.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Prevention? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Prevention — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Prevention.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 19 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- B.J Incentives — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  20, 3,
  'Level 3 → 4: Leading your team away from compliance rewards toward intrinsic-motivation systems',
  'Marshall indicator B.J · Incentives — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Incentives. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Incentives that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Incentives

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Incentives. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Incentives — others observe your classroom or ask for your planning
  · The practice on Incentives produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Incentives:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Incentives
  · Student outcomes on Incentives are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Incentives from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Incentives, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Incentives.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Incentives so colleagues can adopt it.
  • INNOVATE — Try one move on Incentives that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Incentives right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Incentives, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Incentives is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Incentives)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Incentives?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Incentives
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Incentives, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Incentives is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Incentives.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Incentives are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Incentives produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Incentives.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Incentives? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Incentives — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Incentives.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 20 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- C.A Expectations — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  21, 3,
  'Level 3 → 4: Modeling high-expectations language and pushback colleagues observe and try',
  'Marshall indicator C.A · Expectations — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Expectations. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Expectations that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Expectations

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Expectations. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Expectations — others observe your classroom or ask for your planning
  · The practice on Expectations produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Expectations:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Expectations
  · Student outcomes on Expectations are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Expectations from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Expectations, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Expectations.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Expectations so colleagues can adopt it.
  • INNOVATE — Try one move on Expectations that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Expectations right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Expectations, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Expectations is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Expectations)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Expectations?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Expectations
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Expectations, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Expectations is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Expectations.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Expectations are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Expectations produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Expectations.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Expectations? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Expectations — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Expectations.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 21 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- C.B Mindset — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  22, 3,
  'Level 3 → 4: Leading building-wide growth-mindset implementation through visible teacher moves',
  'Marshall indicator C.B · Mindset — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Mindset. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Mindset that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Mindset

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Mindset. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Mindset — others observe your classroom or ask for your planning
  · The practice on Mindset produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Mindset:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Mindset
  · Student outcomes on Mindset are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Mindset from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Mindset, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Mindset.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Mindset so colleagues can adopt it.
  • INNOVATE — Try one move on Mindset that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Mindset right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Mindset, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Mindset is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Mindset)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Mindset?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Mindset
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Mindset, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Mindset is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Mindset.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Mindset are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Mindset produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Mindset.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Mindset? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Mindset — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Mindset.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 22 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- C.C Goals — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  23, 3,
  'Level 3 → 4: Coaching colleagues to make learning goals the center of every lesson',
  'Marshall indicator C.C · Goals — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Goals. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Goals that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Goals

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Goals. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Goals — others observe your classroom or ask for your planning
  · The practice on Goals produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Goals:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Goals
  · Student outcomes on Goals are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Goals from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Goals, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Goals.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Goals so colleagues can adopt it.
  • INNOVATE — Try one move on Goals that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Goals right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Goals, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Goals is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Goals)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Goals?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Goals
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Goals, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Goals is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Goals.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Goals are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Goals produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Goals.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Goals? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Goals — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Goals.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 23 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- C.D Connections — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  24, 3,
  'Level 3 → 4: Building a shared protocol for activating prior knowledge that your team uses',
  'Marshall indicator C.D · Connections — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Connections. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Connections that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Connections

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Connections. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Connections — others observe your classroom or ask for your planning
  · The practice on Connections produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Connections:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Connections
  · Student outcomes on Connections are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Connections from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Connections, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Connections.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Connections so colleagues can adopt it.
  • INNOVATE — Try one move on Connections that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Connections right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Connections, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Connections is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Connections)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Connections?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Connections
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Connections, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Connections is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Connections.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Connections are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Connections produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Connections.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Connections? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Connections — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Connections.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 24 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- C.E Clarity — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  25, 3,
  'Level 3 → 4: Modeling explanations and academic-language moves that colleagues script and try',
  'Marshall indicator C.E · Clarity — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Clarity. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Clarity that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Clarity

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Clarity. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Clarity — others observe your classroom or ask for your planning
  · The practice on Clarity produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Clarity:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Clarity
  · Student outcomes on Clarity are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Clarity from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Clarity, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Clarity.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Clarity so colleagues can adopt it.
  • INNOVATE — Try one move on Clarity that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Clarity right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Clarity, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Clarity is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Clarity)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Clarity?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Clarity
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Clarity, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Clarity is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Clarity.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Clarity are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Clarity produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Clarity.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Clarity? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Clarity — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Clarity.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 25 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- C.F Repertoire (instruction) — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  26, 3,
  'Level 3 → 4: Coaching colleagues to expand their instructional repertoire through peer observation',
  'Marshall indicator C.F · Repertoire (instruction) — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Repertoire (instruction). The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Repertoire (instruction) that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Repertoire (instruction)

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Repertoire (instruction). Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Repertoire (instruction) — others observe your classroom or ask for your planning
  · The practice on Repertoire (instruction) produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Repertoire (instruction):
  · Colleagues seek out your materials, lesson designs, or coaching moves for Repertoire (instruction)
  · Student outcomes on Repertoire (instruction) are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Repertoire (instruction) from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Repertoire (instruction), then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Repertoire (instruction).
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Repertoire (instruction) so colleagues can adopt it.
  • INNOVATE — Try one move on Repertoire (instruction) that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Repertoire (instruction) right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Repertoire (instruction), what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Repertoire (instruction) is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Repertoire (instruction))
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Repertoire (instruction)?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Repertoire (instruction)
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Repertoire (instruction), and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Repertoire (instruction) is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Repertoire (instruction).

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Repertoire (instruction) are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Repertoire (instruction) produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Repertoire (instruction).

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Repertoire (instruction)? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Repertoire (instruction) — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Repertoire (instruction).
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 26 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- C.G Engagement — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  27, 3,
  'Level 3 → 4: Leading the implementation of high-engagement strategies across your team',
  'Marshall indicator C.G · Engagement — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Engagement. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Engagement that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Engagement

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Engagement. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Engagement — others observe your classroom or ask for your planning
  · The practice on Engagement produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Engagement:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Engagement
  · Student outcomes on Engagement are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Engagement from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Engagement, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Engagement.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Engagement so colleagues can adopt it.
  • INNOVATE — Try one move on Engagement that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Engagement right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Engagement, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Engagement is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Engagement)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Engagement?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Engagement
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Engagement, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Engagement is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Engagement.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Engagement are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Engagement produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Engagement.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Engagement? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Engagement — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Engagement.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 27 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- C.H Differentiation — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  28, 3,
  'Level 3 → 4: Designing personalized learning routines your team adopts',
  'Marshall indicator C.H · Differentiation — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Differentiation. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Differentiation that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Differentiation

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Differentiation. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Differentiation — others observe your classroom or ask for your planning
  · The practice on Differentiation produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Differentiation:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Differentiation
  · Student outcomes on Differentiation are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Differentiation from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Differentiation, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Differentiation.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Differentiation so colleagues can adopt it.
  • INNOVATE — Try one move on Differentiation that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Differentiation right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Differentiation, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Differentiation is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Differentiation)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Differentiation?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Differentiation
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Differentiation, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Differentiation is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Differentiation.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Differentiation are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Differentiation produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Differentiation.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Differentiation? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Differentiation — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Differentiation.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 28 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- C.I Nimbleness — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  29, 3,
  'Level 3 → 4: Modeling on-the-fly instructional adjustments that colleagues study via video',
  'Marshall indicator C.I · Nimbleness — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Nimbleness. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Nimbleness that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Nimbleness

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Nimbleness. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Nimbleness — others observe your classroom or ask for your planning
  · The practice on Nimbleness produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Nimbleness:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Nimbleness
  · Student outcomes on Nimbleness are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Nimbleness from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Nimbleness, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Nimbleness.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Nimbleness so colleagues can adopt it.
  • INNOVATE — Try one move on Nimbleness that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Nimbleness right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Nimbleness, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Nimbleness is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Nimbleness)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Nimbleness?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Nimbleness
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Nimbleness, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Nimbleness is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Nimbleness.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Nimbleness are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Nimbleness produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Nimbleness.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Nimbleness? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Nimbleness — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Nimbleness.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 29 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- C.J Application — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  30, 3,
  'Level 3 → 4: Designing transfer-task structures your team uses across the building',
  'Marshall indicator C.J · Application — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Application. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Application that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Application

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Application. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Application — others observe your classroom or ask for your planning
  · The practice on Application produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Application:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Application
  · Student outcomes on Application are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Application from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Application, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Application.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Application so colleagues can adopt it.
  • INNOVATE — Try one move on Application that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Application right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Application, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Application is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Application)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Application?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Application
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Application, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Application is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Application.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Application are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Application produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Application.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Application? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Application — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Application.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 30 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- D.A Criteria — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  31, 3,
  'Level 3 → 4: Building shared exemplars and rubrics your team and department use',
  'Marshall indicator D.A · Criteria — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Criteria. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Criteria that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Criteria

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Criteria. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Criteria — others observe your classroom or ask for your planning
  · The practice on Criteria produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Criteria:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Criteria
  · Student outcomes on Criteria are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Criteria from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Criteria, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Criteria.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Criteria so colleagues can adopt it.
  • INNOVATE — Try one move on Criteria that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Criteria right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Criteria, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Criteria is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Criteria)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Criteria?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Criteria
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Criteria, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Criteria is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Criteria.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Criteria are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Criteria produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Criteria.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Criteria? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Criteria — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Criteria.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 31 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- D.B Diagnosis — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  32, 3,
  'Level 3 → 4: Leading data-driven diagnostic conversations in your PLC',
  'Marshall indicator D.B · Diagnosis — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Diagnosis. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Diagnosis that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Diagnosis

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Diagnosis. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Diagnosis — others observe your classroom or ask for your planning
  · The practice on Diagnosis produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Diagnosis:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Diagnosis
  · Student outcomes on Diagnosis are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Diagnosis from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Diagnosis, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Diagnosis.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Diagnosis so colleagues can adopt it.
  • INNOVATE — Try one move on Diagnosis that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Diagnosis right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Diagnosis, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Diagnosis is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Diagnosis)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Diagnosis?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Diagnosis
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Diagnosis, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Diagnosis is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Diagnosis.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Diagnosis are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Diagnosis produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Diagnosis.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Diagnosis? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Diagnosis — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Diagnosis.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 32 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- D.C On-the-Spot — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  33, 3,
  'Level 3 → 4: Modeling rapid formative-assessment routines colleagues observe and adopt',
  'Marshall indicator D.C · On-the-Spot — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on On-the-Spot. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on On-the-Spot that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on On-the-Spot

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for On-the-Spot. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on On-the-Spot — others observe your classroom or ask for your planning
  · The practice on On-the-Spot produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on On-the-Spot:
  · Colleagues seek out your materials, lesson designs, or coaching moves for On-the-Spot
  · Student outcomes on On-the-Spot are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating On-the-Spot from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on On-the-Spot, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on On-the-Spot.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on On-the-Spot so colleagues can adopt it.
  • INNOVATE — Try one move on On-the-Spot that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on On-the-Spot right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on On-the-Spot, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on On-the-Spot is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on On-the-Spot)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on On-the-Spot?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on On-the-Spot
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on On-the-Spot, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on On-the-Spot is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on On-the-Spot.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on On-the-Spot are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on On-the-Spot produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on On-the-Spot.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on On-the-Spot? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on On-the-Spot — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on On-the-Spot.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 33 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- D.D Self-Assessment — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  34, 3,
  'Level 3 → 4: Coaching colleagues to build student self-assessment capacity in their classrooms',
  'Marshall indicator D.D · Self-Assessment — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Self-Assessment. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Self-Assessment that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Self-Assessment

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Self-Assessment. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Self-Assessment — others observe your classroom or ask for your planning
  · The practice on Self-Assessment produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Self-Assessment:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Self-Assessment
  · Student outcomes on Self-Assessment are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Self-Assessment from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Self-Assessment, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Self-Assessment.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Self-Assessment so colleagues can adopt it.
  • INNOVATE — Try one move on Self-Assessment that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Self-Assessment right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Self-Assessment, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Self-Assessment is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Self-Assessment)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Self-Assessment?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Self-Assessment
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Self-Assessment, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Self-Assessment is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Self-Assessment.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Self-Assessment are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Self-Assessment produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Self-Assessment.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Self-Assessment? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Self-Assessment — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Self-Assessment.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 34 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- D.E Recognition — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  35, 3,
  'Level 3 → 4: Modeling specific, learning-focused recognition language for colleagues',
  'Marshall indicator D.E · Recognition — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Recognition. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Recognition that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Recognition

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Recognition. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Recognition — others observe your classroom or ask for your planning
  · The practice on Recognition produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Recognition:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Recognition
  · Student outcomes on Recognition are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Recognition from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Recognition, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Recognition.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Recognition so colleagues can adopt it.
  • INNOVATE — Try one move on Recognition that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Recognition right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Recognition, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Recognition is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Recognition)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Recognition?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Recognition
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Recognition, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Recognition is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Recognition.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Recognition are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Recognition produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Recognition.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Recognition? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Recognition — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Recognition.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 35 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- D.F Interims — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  36, 3,
  'Level 3 → 4: Leading interim-assessment data analysis cycles for your team',
  'Marshall indicator D.F · Interims — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Interims. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Interims that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Interims

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Interims. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Interims — others observe your classroom or ask for your planning
  · The practice on Interims produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Interims:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Interims
  · Student outcomes on Interims are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Interims from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Interims, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Interims.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Interims so colleagues can adopt it.
  • INNOVATE — Try one move on Interims that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Interims right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Interims, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Interims is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Interims)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Interims?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Interims
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Interims, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Interims is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Interims.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Interims are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Interims produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Interims.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Interims? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Interims — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Interims.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 36 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- D.G Tenacity — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  37, 3,
  'Level 3 → 4: Coaching colleagues on building student tenacity through productive struggle',
  'Marshall indicator D.G · Tenacity — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Tenacity. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Tenacity that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Tenacity

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Tenacity. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Tenacity — others observe your classroom or ask for your planning
  · The practice on Tenacity produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Tenacity:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Tenacity
  · Student outcomes on Tenacity are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Tenacity from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Tenacity, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Tenacity.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Tenacity so colleagues can adopt it.
  • INNOVATE — Try one move on Tenacity that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Tenacity right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Tenacity, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Tenacity is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Tenacity)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Tenacity?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Tenacity
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Tenacity, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Tenacity is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Tenacity.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Tenacity are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Tenacity produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Tenacity.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Tenacity? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Tenacity — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Tenacity.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 37 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- D.H Support — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  38, 3,
  'Level 3 → 4: Designing the tiered-support system your team uses for struggling students',
  'Marshall indicator D.H · Support — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Support. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Support that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Support

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Support. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Support — others observe your classroom or ask for your planning
  · The practice on Support produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Support:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Support
  · Student outcomes on Support are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Support from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Support, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Support.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Support so colleagues can adopt it.
  • INNOVATE — Try one move on Support that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Support right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Support, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Support is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Support)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Support?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Support
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Support, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Support is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Support.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Support are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Support produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Support.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Support? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Support — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Support.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 38 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- D.I Analysis — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  39, 3,
  'Level 3 → 4: Leading equity-focused data analysis across student subgroups',
  'Marshall indicator D.I · Analysis — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Analysis. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Analysis that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Analysis

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Analysis. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Analysis — others observe your classroom or ask for your planning
  · The practice on Analysis produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Analysis:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Analysis
  · Student outcomes on Analysis are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Analysis from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Analysis, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Analysis.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Analysis so colleagues can adopt it.
  • INNOVATE — Try one move on Analysis that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Analysis right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Analysis, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Analysis is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Analysis)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Analysis?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Analysis
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Analysis, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Analysis is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Analysis.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Analysis are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Analysis produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Analysis.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Analysis? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Analysis — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Analysis.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 39 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- D.J Reflection — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  40, 3,
  'Level 3 → 4: Modeling reflective practice that drives colleague growth in your PLC',
  'Marshall indicator D.J · Reflection — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Reflection. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Reflection that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Reflection

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Reflection. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Reflection — others observe your classroom or ask for your planning
  · The practice on Reflection produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Reflection:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Reflection
  · Student outcomes on Reflection are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Reflection from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Reflection, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Reflection.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Reflection so colleagues can adopt it.
  • INNOVATE — Try one move on Reflection that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Reflection right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Reflection, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Reflection is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Reflection)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Reflection?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Reflection
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Reflection, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Reflection is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Reflection.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Reflection are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Reflection produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Reflection.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Reflection? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Reflection — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Reflection.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 40 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- E.A Respect — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  41, 3,
  'Level 3 → 4: Coaching colleagues on culturally responsive family communication',
  'Marshall indicator E.A · Respect — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Respect. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Respect that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Respect

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Respect. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Respect — others observe your classroom or ask for your planning
  · The practice on Respect produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Respect:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Respect
  · Student outcomes on Respect are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Respect from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Respect, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Respect.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Respect so colleagues can adopt it.
  • INNOVATE — Try one move on Respect that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Respect right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Respect, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Respect is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Respect)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Respect?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Respect
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Respect, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Respect is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Respect.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Respect are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Respect produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Respect.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Respect? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Respect — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Respect.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 41 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- E.B Belief — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  42, 3,
  'Level 3 → 4: Leading your team in reframing family conversations around student strengths',
  'Marshall indicator E.B · Belief — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Belief. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Belief that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Belief

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Belief. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Belief — others observe your classroom or ask for your planning
  · The practice on Belief produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Belief:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Belief
  · Student outcomes on Belief are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Belief from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Belief, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Belief.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Belief so colleagues can adopt it.
  • INNOVATE — Try one move on Belief that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Belief right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Belief, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Belief is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Belief)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Belief?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Belief
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Belief, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Belief is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Belief.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Belief are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Belief produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Belief.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Belief? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Belief — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Belief.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 42 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- E.C Expectations — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  43, 3,
  'Level 3 → 4: Modeling clear, two-way family-school goal-setting colleagues then adopt',
  'Marshall indicator E.C · Expectations — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Expectations. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Expectations that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Expectations

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Expectations. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Expectations — others observe your classroom or ask for your planning
  · The practice on Expectations produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Expectations:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Expectations
  · Student outcomes on Expectations are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Expectations from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Expectations, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Expectations.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Expectations so colleagues can adopt it.
  • INNOVATE — Try one move on Expectations that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Expectations right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Expectations, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Expectations is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Expectations)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Expectations?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Expectations
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Expectations, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Expectations is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Expectations.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Expectations are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Expectations produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Expectations.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Expectations? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Expectations — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Expectations.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 43 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- E.D Communication — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  44, 3,
  'Level 3 → 4: Building the building-wide family-communication system your colleagues use',
  'Marshall indicator E.D · Communication — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Communication. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Communication that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Communication

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Communication. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Communication — others observe your classroom or ask for your planning
  · The practice on Communication produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Communication:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Communication
  · Student outcomes on Communication are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Communication from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Communication, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Communication.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Communication so colleagues can adopt it.
  • INNOVATE — Try one move on Communication that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Communication right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Communication, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Communication is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Communication)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Communication?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Communication
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Communication, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Communication is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Communication.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Communication are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Communication produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Communication.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Communication? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Communication — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Communication.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 44 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- E.E Involving — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  45, 3,
  'Level 3 → 4: Designing meaningful family-involvement routines other teachers replicate',
  'Marshall indicator E.E · Involving — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Involving. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Involving that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Involving

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Involving. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Involving — others observe your classroom or ask for your planning
  · The practice on Involving produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Involving:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Involving
  · Student outcomes on Involving are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Involving from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Involving, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Involving.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Involving so colleagues can adopt it.
  • INNOVATE — Try one move on Involving that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Involving right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Involving, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Involving is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Involving)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Involving?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Involving
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Involving, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Involving is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Involving.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Involving are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Involving produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Involving.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Involving? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Involving — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Involving.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 45 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- E.F Homework — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  46, 3,
  'Level 3 → 4: Leading your team to design homework that genuinely supports family partnership',
  'Marshall indicator E.F · Homework — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Homework. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Homework that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Homework

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Homework. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Homework — others observe your classroom or ask for your planning
  · The practice on Homework produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Homework:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Homework
  · Student outcomes on Homework are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Homework from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Homework, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Homework.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Homework so colleagues can adopt it.
  • INNOVATE — Try one move on Homework that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Homework right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Homework, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Homework is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Homework)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Homework?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Homework
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Homework, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Homework is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Homework.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Homework are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Homework produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Homework.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Homework? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Homework — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Homework.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 46 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- E.G Responsiveness — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  47, 3,
  'Level 3 → 4: Building a responsiveness standard your team aspires to (and tracks)',
  'Marshall indicator E.G · Responsiveness — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Responsiveness. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Responsiveness that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Responsiveness

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Responsiveness. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Responsiveness — others observe your classroom or ask for your planning
  · The practice on Responsiveness produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Responsiveness:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Responsiveness
  · Student outcomes on Responsiveness are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Responsiveness from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Responsiveness, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Responsiveness.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Responsiveness so colleagues can adopt it.
  • INNOVATE — Try one move on Responsiveness that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Responsiveness right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Responsiveness, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Responsiveness is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Responsiveness)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Responsiveness?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Responsiveness
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Responsiveness, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Responsiveness is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Responsiveness.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Responsiveness are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Responsiveness produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Responsiveness.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Responsiveness? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Responsiveness — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Responsiveness.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 47 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- E.H Reporting — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  48, 3,
  'Level 3 → 4: Modeling jargon-free progress reporting that colleagues then write like',
  'Marshall indicator E.H · Reporting — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Reporting. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Reporting that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Reporting

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Reporting. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Reporting — others observe your classroom or ask for your planning
  · The practice on Reporting produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Reporting:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Reporting
  · Student outcomes on Reporting are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Reporting from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Reporting, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Reporting.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Reporting so colleagues can adopt it.
  • INNOVATE — Try one move on Reporting that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Reporting right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Reporting, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Reporting is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Reporting)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Reporting?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Reporting
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Reporting, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Reporting is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Reporting.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Reporting are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Reporting produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Reporting.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Reporting? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Reporting — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Reporting.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 48 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- E.I Outreach — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  49, 3,
  'Level 3 → 4: Leading proactive outreach to historically disengaged families across your team',
  'Marshall indicator E.I · Outreach — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Outreach. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Outreach that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Outreach

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Outreach. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Outreach — others observe your classroom or ask for your planning
  · The practice on Outreach produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Outreach:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Outreach
  · Student outcomes on Outreach are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Outreach from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Outreach, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Outreach.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Outreach so colleagues can adopt it.
  • INNOVATE — Try one move on Outreach that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Outreach right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Outreach, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Outreach is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Outreach)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Outreach?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Outreach
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Outreach, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Outreach is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Outreach.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Outreach are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Outreach produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Outreach.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Outreach? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Outreach — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Outreach.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 49 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- E.J Resources — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  50, 3,
  'Level 3 → 4: Building the community-partnership network your school relies on',
  'Marshall indicator E.J · Resources — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Resources. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Resources that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Resources

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Resources. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Resources — others observe your classroom or ask for your planning
  · The practice on Resources produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Resources:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Resources
  · Student outcomes on Resources are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Resources from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Resources, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Resources.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Resources so colleagues can adopt it.
  • INNOVATE — Try one move on Resources that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Resources right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Resources, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Resources is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Resources)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Resources?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Resources
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Resources, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Resources is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Resources.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Resources are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Resources produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Resources.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Resources? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Resources — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Resources.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 50 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- F.A Attendance — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  51, 3,
  'Level 3 → 4: Modeling reliability and preparedness that colleagues across the building emulate',
  'Marshall indicator F.A · Attendance — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Attendance. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Attendance that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Attendance

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Attendance. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Attendance — others observe your classroom or ask for your planning
  · The practice on Attendance produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Attendance:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Attendance
  · Student outcomes on Attendance are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Attendance from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Attendance, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Attendance.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Attendance so colleagues can adopt it.
  • INNOVATE — Try one move on Attendance that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Attendance right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Attendance, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Attendance is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Attendance)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Attendance?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Attendance
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Attendance, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Attendance is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Attendance.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Attendance are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Attendance produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Attendance.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Attendance? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Attendance — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Attendance.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 51 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- F.B Language — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  52, 3,
  'Level 3 → 4: Coaching colleagues on professional language and trust-building communication',
  'Marshall indicator F.B · Language — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Language. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Language that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Language

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Language. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Language — others observe your classroom or ask for your planning
  · The practice on Language produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Language:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Language
  · Student outcomes on Language are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Language from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Language, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Language.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Language so colleagues can adopt it.
  • INNOVATE — Try one move on Language that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Language right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Language, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Language is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Language)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Language?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Language
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Language, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Language is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Language.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Language are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Language produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Language.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Language? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Language — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Language.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 52 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- F.C Reliability — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  53, 3,
  'Level 3 → 4: Becoming the colleague leadership counts on for high-stakes work',
  'Marshall indicator F.C · Reliability — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Reliability. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Reliability that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Reliability

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Reliability. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Reliability — others observe your classroom or ask for your planning
  · The practice on Reliability produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Reliability:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Reliability
  · Student outcomes on Reliability are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Reliability from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Reliability, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Reliability.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Reliability so colleagues can adopt it.
  • INNOVATE — Try one move on Reliability that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Reliability right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Reliability, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Reliability is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Reliability)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Reliability?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Reliability
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Reliability, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Reliability is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Reliability.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Reliability are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Reliability produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Reliability.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Reliability? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Reliability — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Reliability.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 53 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- F.D Professionalism — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  54, 3,
  'Level 3 → 4: Representing the profession in a way that elevates the school district-wide',
  'Marshall indicator F.D · Professionalism — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Professionalism. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Professionalism that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Professionalism

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Professionalism. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Professionalism — others observe your classroom or ask for your planning
  · The practice on Professionalism produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Professionalism:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Professionalism
  · Student outcomes on Professionalism are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Professionalism from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Professionalism, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Professionalism.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Professionalism so colleagues can adopt it.
  • INNOVATE — Try one move on Professionalism that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Professionalism right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Professionalism, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Professionalism is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Professionalism)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Professionalism?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Professionalism
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Professionalism, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Professionalism is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Professionalism.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Professionalism are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Professionalism produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Professionalism.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Professionalism? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Professionalism — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Professionalism.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 54 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- F.E Judgment — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  55, 3,
  'Level 3 → 4: Mentoring colleagues through ethical and judgment-call situations',
  'Marshall indicator F.E · Judgment — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Judgment. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Judgment that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Judgment

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Judgment. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Judgment — others observe your classroom or ask for your planning
  · The practice on Judgment produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Judgment:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Judgment
  · Student outcomes on Judgment are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Judgment from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Judgment, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Judgment.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Judgment so colleagues can adopt it.
  • INNOVATE — Try one move on Judgment that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Judgment right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Judgment, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Judgment is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Judgment)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Judgment?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Judgment
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Judgment, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Judgment is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Judgment.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Judgment are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Judgment produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Judgment.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Judgment? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Judgment — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Judgment.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 55 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- F.F Above-and-beyond — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  56, 3,
  'Level 3 → 4: Leading school-improvement work that reaches beyond your own classroom',
  'Marshall indicator F.F · Above-and-beyond — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Above-and-beyond. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Above-and-beyond that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Above-and-beyond

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Above-and-beyond. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Above-and-beyond — others observe your classroom or ask for your planning
  · The practice on Above-and-beyond produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Above-and-beyond:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Above-and-beyond
  · Student outcomes on Above-and-beyond are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Above-and-beyond from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Above-and-beyond, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Above-and-beyond.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Above-and-beyond so colleagues can adopt it.
  • INNOVATE — Try one move on Above-and-beyond that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Above-and-beyond right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Above-and-beyond, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Above-and-beyond is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Above-and-beyond)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Above-and-beyond?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Above-and-beyond
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Above-and-beyond, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Above-and-beyond is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Above-and-beyond.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Above-and-beyond are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Above-and-beyond produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Above-and-beyond.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Above-and-beyond? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Above-and-beyond — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Above-and-beyond.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 56 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- F.G Leadership — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  57, 3,
  'Level 3 → 4: Stepping into formal teacher-leader roles (department chair, instructional coach, PLC lead)',
  'Marshall indicator F.G · Leadership — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Leadership. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Leadership that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Leadership

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Leadership. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Leadership — others observe your classroom or ask for your planning
  · The practice on Leadership produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Leadership:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Leadership
  · Student outcomes on Leadership are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Leadership from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Leadership, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Leadership.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Leadership so colleagues can adopt it.
  • INNOVATE — Try one move on Leadership that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Leadership right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Leadership, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Leadership is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Leadership)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Leadership?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Leadership
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Leadership, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Leadership is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Leadership.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Leadership are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Leadership produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Leadership.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Leadership? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Leadership — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Leadership.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 57 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- F.H Openness — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  58, 3,
  'Level 3 → 4: Coaching colleagues on receiving feedback and turning it into changed practice',
  'Marshall indicator F.H · Openness — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Openness. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Openness that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Openness

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Openness. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Openness — others observe your classroom or ask for your planning
  · The practice on Openness produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Openness:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Openness
  · Student outcomes on Openness are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Openness from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Openness, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Openness.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Openness so colleagues can adopt it.
  • INNOVATE — Try one move on Openness that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Openness right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Openness, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Openness is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Openness)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Openness?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Openness
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Openness, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Openness is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Openness.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Openness are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Openness produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Openness.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Openness? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Openness — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Openness.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 58 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- F.I Collaboration — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  59, 3,
  'Level 3 → 4: Leading the PLC or department to co-plan, co-analyze, and co-revise practice',
  'Marshall indicator F.I · Collaboration — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Collaboration. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Collaboration that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Collaboration

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Collaboration. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Collaboration — others observe your classroom or ask for your planning
  · The practice on Collaboration produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Collaboration:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Collaboration
  · Student outcomes on Collaboration are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Collaboration from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Collaboration, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Collaboration.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Collaboration so colleagues can adopt it.
  • INNOVATE — Try one move on Collaboration that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Collaboration right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Collaboration, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Collaboration is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Collaboration)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Collaboration?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Collaboration
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Collaboration, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Collaboration is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Collaboration.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Collaboration are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Collaboration produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Collaboration.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Collaboration? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Collaboration — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Collaboration.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 59 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);

-- F.J Growth — Level 3 → 4
INSERT INTO pd_modules
  (indicator_id, target_level, title, subtitle, est_minutes, research_basis,
   learn_content, practice_content, apply_content,
   deliverable_prompt, deliverable_rubric, resources, is_active)
SELECT
  60, 3,
  'Level 3 → 4: Pursuing advanced credentials, leading PD, or publishing your practice to influence the field',
  'Marshall indicator F.J · Growth — move from Effective to Highly Effective',
  60,
  'Saphier — The Skillful Teacher; Marshall Teacher Evaluation Rubric (Highly Effective level); City, Elmore, Fiarman & Teitel — Instructional Rounds.',
  'STEP 1 — IDENTIFY THE PRACTICE YOU WILL ELEVATE
────────────────
You are at Level 3 (Effective) on Growth. The move from Effective → Highly Effective is not "do more of the same." It is: lead, model, and innovate so OTHER teachers grow because of you.

In your reflection box below, write:
  · The current strength on Growth that earned you the Level 3 score
  · One specific colleague (or grade-level/department team) you could share this practice with
  · One innovation beyond the rubric you have been wanting to try on Growth

STEP 2 — STUDY WHAT HIGHLY EFFECTIVE LOOKS LIKE (10 min)
────────────────
What Level 3 looks like (your current practice):
You are consistently meeting the rubric expectations for Growth. Students benefit and the practice is reliable.

What Level 4 looks like (your target — Marshall rubric, Highly Effective):
  · You are the go-to colleague on Growth — others observe your classroom or ask for your planning
  · The practice on Growth produces sustained, observable gains for students AND demonstrably shifts colleague practice
  · You innovate beyond what the rubric describes — you are pushing the field, not just meeting it
  · Your impact reaches beyond your own classroom (grade level, building, sometimes district)

STEP 3 — SPOT THE LEVERAGE POINT
────────────────
These are the observable signals at Level 4 — what an observer or instructional coach would write down if you were operating at Highly Effective on Growth:
  · Colleagues seek out your materials, lesson designs, or coaching moves for Growth
  · Student outcomes on Growth are measurably above peer classrooms over time
  · You can articulate WHY the practice works, not just THAT it works
  · You have a public artifact (a model lesson, a shared document, a coaching protocol) that others use

In the reflection box, mark which signals you are CLOSE on and which feel furthest away. The furthest one is your leverage point — that is what this module will help you build.',
  'STEP 4 — DESIGN THE LEAD MOVE (25 min)
────────────────
Choose ONE of the four pathways below for elevating Growth from Effective to Highly Effective. You will execute this in the Apply phase:

  • MODEL — Invite a colleague to observe one of your lessons/practices on Growth, then debrief together using a structured protocol.
  • COACH — Offer a colleague a coaching cycle (one observation + one co-planning session + one follow-up observation) focused on Growth.
  • PUBLISH — Build a shareable artifact (a model unit, an annotated lesson plan, a coaching one-pager, a video) that captures your practice on Growth so colleagues can adopt it.
  • INNOVATE — Try one move on Growth that goes BEYOND what the rubric describes, measure its student impact, and document what you learned.

Write your choice in the reflection box and explain in 2–3 sentences why this is the right pathway for YOU on Growth right now.

STEP 5 — SCRIPT THE 3 HIGH-LEVERAGE MOMENTS
────────────────
Now plan the three moments where your leadership will be visible:

  1. THE INVITE. Word-for-word — what will you SAY to the colleague (or team) when you invite them in? Highly Effective teachers extend the invitation; they do not wait to be asked.

  2. THE NAMING. When the colleague sees your practice on Growth, what is the SPECIFIC move you will name for them? "What you just saw me do is ___, and here is why it works: ___." This is the move that turns a demonstration into transferable learning.

  3. THE TRANSFER. What will you ASK the colleague to try in their own classroom this week? Make it small enough that it actually happens, specific enough that it is observable.

STEP 6 — DEFINE THE EVIDENCE OF IMPACT
────────────────
Highly Effective on Growth is not "I did the thing." It is "students AND a colleague are visibly different because of me."

Decide now — before you execute — what evidence you will collect:
  · Student-impact evidence (one artifact showing the practice landed for YOUR students on Growth)
  · Colleague-impact evidence (one artifact showing the colleague tried the move you shared — a photo, a text, a quote, their lesson plan)

Note your two artifacts in the reflection box. You will submit both in the Apply phase.',
  'STEP 7 — EXECUTE THE LEAD MOVE
────────────────
Carry out the pathway you chose in Step 4 within the next 10 working days. Keep brief notes (sticky note or voice memo) on these three questions:
  · What did you SAY at the three scripted moments (the invite, the naming, the transfer)?
  · How did the colleague respond? What did they actually try?
  · What changed for students because of your work on Growth?

STEP 8 — BUNDLE THE EVIDENCE
────────────────
In the deliverable box below you will paste:
  1. The ARTIFACT you built or used (model lesson, coaching one-pager, video link, innovation write-up)
  2. The STUDENT-IMPACT evidence from your classroom on Growth
  3. The COLLEAGUE-IMPACT evidence — proof that another educator''s practice shifted because of you
  4. A 4-sentence reflection: what worked, what surprised you, what is your next leadership move on Growth, and what would you tell a colleague trying this for the first time?

WHAT HIGHLY EFFECTIVE FEELS LIKE
────────────────
Your supervisor will mark this verified when your work shows the practice on Growth is no longer just yours — it is moving through your team. Highly Effective is plural: students learn, colleagues grow, the school is better because you are on the staff.',
  'SUBMIT YOUR LEADERSHIP ARTIFACT

Your deliverable should be a single package your supervisor can read in 5 minutes. Include, in this order:

1) CONTEXT — one paragraph: the pathway you chose (Model / Coach / Publish / Innovate), the colleague or team you worked with, the timeframe, and your starting practice on Growth.

2) THE ARTIFACT — the actual document, lesson, video link, coaching one-pager, or innovation write-up you built. Bold or highlight the parts where the Level 4 moves on Growth are visible.

3) THE 3 SCRIPTED MOMENTS — paste the word-for-word invite, naming, and transfer from Step 5. Note what you actually said vs. what you planned.

4) STUDENT-IMPACT EVIDENCE — one piece of evidence (work sample, data, student quote, exit ticket) showing the practice on Growth produced gains in YOUR classroom.

5) COLLEAGUE-IMPACT EVIDENCE — one piece of evidence (their lesson plan, a photo, a text/email, a quote) showing your colleague tried the move and something shifted in their practice on Growth.

6) REFLECTION (4 sentences) — What worked? What surprised you? What is your next leadership move on Growth? What would you tell a colleague trying this for the first time?',
  'YOUR SUPERVISOR WILL MARK THIS VERIFIED WHEN:

✓ Your pathway choice (Model / Coach / Publish / Innovate) is named clearly and matches the artifact you submitted.
✓ The artifact is real and shareable — not a private journal entry; another teacher could pick it up and use it.
✓ The three scripted moments (invite, naming, transfer) are written in your voice, not paraphrased rubric language.
✓ The student-impact evidence is specific and recent on Growth — concrete student work, data, or words.
✓ The colleague-impact evidence is real — a teammate''s plan, photo, text, or quote, NOT a hypothetical.
✓ The reflection is honest about what worked AND what fell short, and names your next leadership move on Growth.
✓ The artifact extends beyond your own classroom — there is a clear answer to "who else benefits?"',
  '[{"title":"The Skillful Teacher","source":"Jon Saphier (Research for Better Teaching)","type":"book"},{"title":"Teacher Evaluation Rubric — Highly Effective level","source":"Kim Marshall","type":"framework"},{"title":"Instructional Rounds in Education","source":"City, Elmore, Fiarman & Teitel (Harvard)","type":"book"}]',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM pd_modules
   WHERE indicator_id = 60 AND target_level = 3 AND title LIKE 'Level 3 → 4:%'
);
