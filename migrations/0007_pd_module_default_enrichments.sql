-- ============================================================
-- 0007_pd_module_default_enrichments.sql
-- April 2026 upgrade, part 2: back-fill default enrichment text
-- for every PD module that still has NULL enrichment fields.
--
-- Why: migration 0006 enriched three indicators (B.d, B.e, E.c).
-- The Alexander Marshall platform has 60 indicators × 2 levels = 120
-- modules total.  Admins were told they can *edit every field* in
-- the admin UI, but we don't want them staring at 114 blank
-- "Modeling examples" boxes — they need a sensible default they
-- can leave as-is OR tighten up.
--
-- This migration populates the four enrichment columns with
-- **general-purpose, rubric-anchored** text keyed off the
-- indicator name and target level.  Every default begins with a
-- clear "(DEFAULT — edit in /admin/pd)" marker so admins can tell
-- at a glance which modules have custom content vs. defaults.
-- ============================================================

-- Default modeling example — structured around "describe one
-- specific classroom moment where the Level-up move shows up."
UPDATE pd_modules
   SET modeling_examples = '(DEFAULT — edit in /admin/pd)' || char(10) || char(10) ||
     'Example of what the Level-up move looks like in a single classroom moment:' || char(10) || char(10) ||
     '  1. Set-up (1-2 min): The teacher names the move out loud and tells students what to watch for. Students know what "good" is going to look like before it happens.' || char(10) ||
     '  2. Model it (2-3 min): The teacher performs the move — slowly the first time, at natural speed the second time. Students hear the internal monologue ("I am noticing… I decided to… I said it this way because…").' || char(10) ||
     '  3. Student rehearsal (3-5 min): Students try it in pairs while the teacher circulates and narrates the moves they hear. One or two student examples are shared with the class.' || char(10) ||
     '  4. Debrief (1-2 min): Teacher names what changed compared to the Level-below version. Students describe the difference in their own words.' || char(10) || char(10) ||
     'Write your own modeling example in the admin panel — it should be concrete (real student-facing language), short (under 10 lines), and centered on ONE moment, not a whole lesson.'
 WHERE modeling_examples IS NULL;

-- Default collaboration prompt — PLC / peer rehearsal invitation.
UPDATE pd_modules
   SET collaboration_prompts = '(DEFAULT — edit in /admin/pd)' || char(10) || char(10) ||
     'Collaboration move: Bring your rebuilt lesson or routine to your next PLC, team meeting, or grade-level huddle. Ask one colleague (or your instructional coach) to do two things:' || char(10) || char(10) ||
     '  1. Watch you run the move — live (2-5 minutes in your classroom) or via a short video.' || char(10) ||
     '  2. Give you two pieces of feedback: one on pacing (did the move land in the time you planned?) and one on student response (did students actually show the Level-up signal?).' || char(10) || char(10) ||
     'Then return the favor — watch your colleague try the move in their room and give them the same two pieces of feedback. Peer practice is the single highest-leverage collaboration move we have.'
 WHERE collaboration_prompts IS NULL;

-- Default family-engagement note — equity-first, low-tech friendly.
UPDATE pd_modules
   SET family_engagement_notes = '(DEFAULT — edit in /admin/pd)' || char(10) || char(10) ||
     'Equity-first family communication (works for any indicator):' || char(10) || char(10) ||
     '  • Language: Assume some families speak a language other than English. Offer a translated copy when you can (district translation, or Google Translate + a quick check from a native-speaker colleague).' || char(10) ||
     '  • Access: Assume some families do not have reliable internet or a printer. Send at least one paper version home in the backpack.' || char(10) ||
     '  • Timing: Assume some families work evenings or nights. Offer one daytime AND one evening option for any live event. Let families pick.' || char(10) ||
     '  • Plain language: Write at a 6th-grade reading level. Skip the education jargon ("formative assessment," "standards-aligned") — describe what students will DO instead.' || char(10) ||
     '  • Ask back: Every communication should end with ONE question families can answer ("What is one way your child showed you they understood this week?").' || char(10) || char(10) ||
     'Customize the specifics in /admin/pd for your own indicator and grade level.'
 WHERE family_engagement_notes IS NULL;

-- Default contextual differentiation — elementary vs secondary.
UPDATE pd_modules
   SET contextual_differentiation = '(DEFAULT — edit in /admin/pd)' || char(10) || char(10) ||
     'How this move lands in different grade bands:' || char(10) || char(10) ||
     'Elementary (K-5):' || char(10) ||
     '  • Use visual anchors — anchor charts, picture cards, color-coded cues.' || char(10) ||
     '  • Keep each mini-practice under 5-7 minutes and build in a song, chant, or movement.' || char(10) ||
     '  • Rehearse daily for the first two weeks. Young students learn routines by repetition, not by explanation.' || char(10) ||
     '  • Invite families early — backpack notes home, picture of the teacher, preferred-name survey.' || char(10) || char(10) ||
     'Secondary (6-12):' || char(10) ||
     '  • Frame the move as an executive-function, academic-leadership, or career-readiness skill — that signals "this matters for you," not "this is babyish."' || char(10) ||
     '  • Use content-area case studies (a lab partnership, a debate, a team rehearsal) so the move lives inside the discipline, not next to it.' || char(10) ||
     '  • Keep mini-practices to 3-5 minutes so you do not give up instructional time.' || char(10) ||
     '  • Tie family communication to the LMS + one text / call — secondary families rarely show up physically, but they do read texts.'
 WHERE contextual_differentiation IS NULL;
