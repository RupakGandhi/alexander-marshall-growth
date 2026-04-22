-- ============================================================================
-- Alexander Public Schools — District + School Year + Schools
-- ============================================================================
INSERT OR IGNORE INTO districts (id, name, address, city, state, zip, phone, active_school_year)
VALUES (1, 'Alexander Public School District', '601 Delaney St', 'Alexander', 'ND', '58831', '701-828-3334', '2025-2026');

INSERT OR IGNORE INTO school_years (id, district_id, label, start_date, end_date, is_current)
VALUES (1, 1, '2025-2026', '2025-08-25', '2026-05-29', 1);

INSERT OR IGNORE INTO schools (id, district_id, name, grade_span, address, phone) VALUES
  (1, 1, 'Alexander Elementary School', 'PK-5', '601 Delaney St, Alexander, ND 58831', '701-828-3334'),
  (2, 1, 'Alexander Junior/Senior High School', '6-12', '601 Delaney St, Alexander, ND 58831', '701-828-3334');

-- ============================================================================
-- Marshall Framework (2014)
-- ============================================================================
INSERT OR IGNORE INTO frameworks (id, district_id, name, version, description, scale_levels, is_active)
VALUES (1, 1, 'Kim Marshall Teacher Evaluation Rubric', '2014',
  'Six-domain research-based rubric for end-of-year teacher performance evaluation. Designed to be used with frequent mini-observations rather than single-visit checklists.',
  4, 1);

UPDATE districts SET active_framework_id = 1 WHERE id = 1;

-- ============================================================================
-- DOMAINS
-- ============================================================================
INSERT OR IGNORE INTO framework_domains (id, framework_id, code, name, description, sort_order) VALUES
  (1, 1, 'A', 'Planning and Preparation for Learning',
    'Subject knowledge, standards alignment, unit and lesson design, assessment planning, anticipation of student thinking, engagement, materials, differentiation, and learning environment.', 1),
  (2, 1, 'B', 'Classroom Management',
    'Expectations, relationships, respect, social-emotional climate, routines, student responsibility, disciplinary repertoire, efficiency, prevention, and incentive systems.', 2),
  (3, 1, 'C', 'Delivery of Instruction',
    'Expectations, growth mindset, goals, connections to prior knowledge, clarity, instructional repertoire, student engagement, differentiation, nimbleness, and application/closure.', 3),
  (4, 1, 'D', 'Monitoring, Assessment, and Follow-Up',
    'Success criteria, diagnosis, on-the-spot checks for understanding, student self-assessment, recognition of work, interim assessment analysis, tenacity with strugglers, support referrals, data analysis, and reflection.', 4),
  (5, 1, 'E', 'Family and Community Outreach',
    'Cultural respect, belief in every student, clear expectations, two-way communication, involving families, homework, responsiveness, reporting, outreach to hard-to-reach families, and classroom resources.', 5),
  (6, 1, 'F', 'Professional Responsibilities',
    'Attendance, professional language, reliability, professionalism, judgment/ethics, above-and-beyond contributions, leadership, openness to feedback, collaboration, and continuous professional growth.', 6);

-- ============================================================================
-- DOMAIN A — Planning and Preparation for Learning
-- ============================================================================
INSERT OR IGNORE INTO framework_indicators (id, domain_id, code, name, sort_order, prompt) VALUES
  (1,  1, 'a', 'Knowledge',       1,  'The teacher:'),
  (2,  1, 'b', 'Standards',       2,  'The teacher:'),
  (3,  1, 'c', 'Units',           3,  'The teacher:'),
  (4,  1, 'd', 'Assessments',     4,  'The teacher:'),
  (5,  1, 'e', 'Anticipation',    5,  'The teacher:'),
  (6,  1, 'f', 'Lessons',         6,  'The teacher:'),
  (7,  1, 'g', 'Engagement',      7,  'The teacher:'),
  (8,  1, 'h', 'Materials',       8,  'The teacher:'),
  (9,  1, 'i', 'Differentiation', 9,  'The teacher:'),
  (10, 1, 'j', 'Environment',     10, 'The teacher:');

-- A descriptors (level, label, text)
INSERT OR IGNORE INTO framework_descriptors (indicator_id, level, level_label, descriptor) VALUES
  -- a. Knowledge
  (1, 4, 'Highly Effective', 'Is expert in the subject area and up to date on authoritative research on child development and how students learn.'),
  (1, 3, 'Effective',        'Knows the subject matter well and has a good grasp of child development and how students learn.'),
  (1, 2, 'Improvement Necessary', 'Is somewhat familiar with the subject and has a few ideas of ways students develop and learn.'),
  (1, 1, 'Does Not Meet Standards', 'Has little familiarity with the subject matter and few ideas on how to teach it and how students learn.'),
  -- b. Standards
  (2, 4, 'Highly Effective', 'Has a detailed plan for the year that is tightly aligned with high standards and external assessments.'),
  (2, 3, 'Effective',        'Plans the year so students will meet high standards and be ready for external assessments.'),
  (2, 2, 'Improvement Necessary', 'Has done some thinking about how to cover high standards and test requirements this year.'),
  (2, 1, 'Does Not Meet Standards', 'Plans lesson by lesson and has little familiarity with state standards and tests.'),
  -- c. Units
  (3, 4, 'Highly Effective', 'Plans all units embedding big ideas, essential questions, knowledge, and skill goals that cover all Bloom''s levels.'),
  (3, 3, 'Effective',        'Plans most units with big ideas, essential questions, knowledge, and skill goals and most of Bloom''s levels.'),
  (3, 2, 'Improvement Necessary', 'Plans lessons with some thought to larger goals and objectives and higher-order thinking skills.'),
  (3, 1, 'Does Not Meet Standards', 'Teaches on an ad hoc basis with little or no consideration for long-range curriculum goals.'),
  -- d. Assessments
  (4, 4, 'Highly Effective', 'Prepares diagnostic, on-the-spot, interim, and summative assessments to monitor student learning.'),
  (4, 3, 'Effective',        'Plans on-the-spot and unit assessments to measure student learning.'),
  (4, 2, 'Improvement Necessary', 'Drafts unit tests as instruction proceeds.'),
  (4, 1, 'Does Not Meet Standards', 'Writes final tests shortly before they are given.'),
  -- e. Anticipation
  (5, 4, 'Highly Effective', 'Anticipates students'' misconceptions and confusions and develops multiple strategies to overcome them.'),
  (5, 3, 'Effective',        'Anticipates misconceptions that students might have and plans to address them.'),
  (5, 2, 'Improvement Necessary', 'Has a hunch about one or two ways that students might become confused with the content.'),
  (5, 1, 'Does Not Meet Standards', 'Proceeds without considering misconceptions that students might have about the material.'),
  -- f. Lessons
  (6, 4, 'Highly Effective', 'Designs each lesson with clear, measurable goals closely aligned with standards and unit outcomes.'),
  (6, 3, 'Effective',        'Designs lessons focused on measurable outcomes aligned with unit goals.'),
  (6, 2, 'Improvement Necessary', 'Plans lessons with some consideration of long-term goals.'),
  (6, 1, 'Does Not Meet Standards', 'Plans lessons aimed primarily at entertaining students or covering textbook chapters.'),
  -- g. Engagement
  (7, 4, 'Highly Effective', 'Designs highly relevant lessons that will motivate all students and engage them in active learning.'),
  (7, 3, 'Effective',        'Designs lessons that are relevant, motivating, and likely to engage most students.'),
  (7, 2, 'Improvement Necessary', 'Plans lessons that will catch some students'' interest and perhaps get a discussion going.'),
  (7, 1, 'Does Not Meet Standards', 'Plans lessons with very little likelihood of motivating or involving students.'),
  -- h. Materials
  (8, 4, 'Highly Effective', 'Designs lessons that use an effective mix of high-quality, multicultural learning materials and technology.'),
  (8, 3, 'Effective',        'Designs lessons that use an appropriate, multicultural mix of materials and technology.'),
  (8, 2, 'Improvement Necessary', 'Plans lessons that involve a mixture of good and mediocre learning materials.'),
  (8, 1, 'Does Not Meet Standards', 'Plans lessons that rely mainly on mediocre and low-quality textbooks, workbooks, or worksheets.'),
  -- i. Differentiation
  (9, 4, 'Highly Effective', 'Designs lessons that break down complex tasks and address all learning needs, styles, and interests.'),
  (9, 3, 'Effective',        'Designs lessons that target several learning needs, styles, and interests.'),
  (9, 2, 'Improvement Necessary', 'Plans lessons with some thought as to how to accommodate special needs students.'),
  (9, 1, 'Does Not Meet Standards', 'Plans lessons with no differentiation.'),
  -- j. Environment
  (10, 4, 'Highly Effective', 'Uses room arrangement, materials, and displays to maximize student learning of all material.'),
  (10, 3, 'Effective',        'Organizes classroom furniture, materials, and displays to support unit and lesson goals.'),
  (10, 2, 'Improvement Necessary', 'Organizes furniture and materials to support the lesson, with only a few decorative displays.'),
  (10, 1, 'Does Not Meet Standards', 'Has a conventional furniture arrangement, hard-to-access materials, and few wall displays.');

-- ============================================================================
-- DOMAIN B — Classroom Management
-- ============================================================================
INSERT OR IGNORE INTO framework_indicators (id, domain_id, code, name, sort_order, prompt) VALUES
  (11, 2, 'a', 'Expectations',           1,  'The teacher:'),
  (12, 2, 'b', 'Relationships',          2,  'The teacher:'),
  (13, 2, 'c', 'Respect',                3,  'The teacher:'),
  (14, 2, 'd', 'Social-emotional',       4,  'The teacher:'),
  (15, 2, 'e', 'Routines',               5,  'The teacher:'),
  (16, 2, 'f', 'Responsibility',         6,  'The teacher:'),
  (17, 2, 'g', 'Repertoire',             7,  'The teacher:'),
  (18, 2, 'h', 'Efficiency',             8,  'The teacher:'),
  (19, 2, 'i', 'Prevention',             9,  'The teacher:'),
  (20, 2, 'j', 'Incentives',             10, 'The teacher:');

INSERT OR IGNORE INTO framework_descriptors (indicator_id, level, level_label, descriptor) VALUES
  (11, 4, 'Highly Effective', 'Is direct, specific, consistent, and tenacious in communicating and enforcing very high expectations.'),
  (11, 3, 'Effective',        'Clearly communicates and consistently enforces high standards for student behavior.'),
  (11, 2, 'Improvement Necessary', 'Announces and posts classroom rules and punishments.'),
  (11, 1, 'Does Not Meet Standards', 'Comes up with ad hoc rules and punishments as events unfold during the year.'),

  (12, 4, 'Highly Effective', 'Shows warmth, caring, respect, and fairness for all students and builds strong relationships.'),
  (12, 3, 'Effective',        'Is fair and respectful toward students and builds positive relationships.'),
  (12, 2, 'Improvement Necessary', 'Is fair and respectful toward most students and builds positive relationships with some.'),
  (12, 1, 'Does Not Meet Standards', 'Is sometimes unfair and disrespectful to the class; plays favorites.'),

  (13, 4, 'Highly Effective', 'Wins all students'' respect and creates a climate in which disruption of learning is unthinkable.'),
  (13, 3, 'Effective',        'Commands respect and refuses to tolerate disruption.'),
  (13, 2, 'Improvement Necessary', 'Wins the respect of some students but there are regular disruptions in the classroom.'),
  (13, 1, 'Does Not Meet Standards', 'Is not respected by students and the classroom is frequently chaotic and sometimes dangerous.'),

  (14, 4, 'Highly Effective', 'Implements a program that successfully develops positive interactions and social-emotional skills.'),
  (14, 3, 'Effective',        'Fosters positive interactions among students and teaches useful social skills.'),
  (14, 2, 'Improvement Necessary', 'Often lectures students on the need for good behavior, and makes an example of "bad" students.'),
  (14, 1, 'Does Not Meet Standards', 'Publicly berates "bad" students, blaming them for their poor behavior.'),

  (15, 4, 'Highly Effective', 'Successfully inculcates class routines up front so that students maintain them throughout the year.'),
  (15, 3, 'Effective',        'Teaches routines and has students maintain them all year.'),
  (15, 2, 'Improvement Necessary', 'Tries to train students in class routines but many of the routines are not maintained.'),
  (15, 1, 'Does Not Meet Standards', 'Does not teach routines and is constantly nagging, threatening, and punishing students.'),

  (16, 4, 'Highly Effective', 'Gets all students to be self-disciplined, take responsibility for their actions, and have a strong sense of efficacy.'),
  (16, 3, 'Effective',        'Develops students'' self-discipline and teaches them to be responsible for their own actions.'),
  (16, 2, 'Improvement Necessary', 'Tries to get students to be responsible for their actions, but many lack self-discipline.'),
  (16, 1, 'Does Not Meet Standards', 'Is unsuccessful in fostering self-discipline in students; they are dependent on the teacher to behave.'),

  (17, 4, 'Highly Effective', 'Has a highly effective discipline repertoire and can capture and hold students'' attention any time.'),
  (17, 3, 'Effective',        'Has a repertoire of discipline "moves" and can capture and maintain students'' attention.'),
  (17, 2, 'Improvement Necessary', 'Has a limited disciplinary repertoire and students are frequently not paying attention.'),
  (17, 1, 'Does Not Meet Standards', 'Has few discipline skills and constantly struggles to get students'' attention.'),

  (18, 4, 'Highly Effective', 'Skillfully uses coherence, momentum, and transitions so that every minute of classroom time produces learning.'),
  (18, 3, 'Effective',        'Maximizes academic learning time through coherence, lesson momentum, and smooth transitions.'),
  (18, 2, 'Improvement Necessary', 'Sometimes loses teaching time due to lack of clarity, interruptions, and inefficient transitions.'),
  (18, 1, 'Does Not Meet Standards', 'Loses a great deal of instructional time because of confusion, interruptions, and ragged transitions.'),

  (19, 4, 'Highly Effective', 'Is alert, poised, dynamic, and self-assured and nips virtually all discipline problems in the bud.'),
  (19, 3, 'Effective',        'Has a confident, dynamic presence and nips most discipline problems in the bud.'),
  (19, 2, 'Improvement Necessary', 'Tries to prevent discipline problems but sometimes little things escalate into big problems.'),
  (19, 1, 'Does Not Meet Standards', 'Is unsuccessful at spotting and preventing discipline problems, and they frequently escalate.'),

  (20, 4, 'Highly Effective', 'Gets students to buy into a highly effective system of incentives linked to intrinsic rewards.'),
  (20, 3, 'Effective',        'Uses incentives wisely to encourage and reinforce student cooperation.'),
  (20, 2, 'Improvement Necessary', 'Uses extrinsic rewards in an attempt to get students to cooperate and comply.'),
  (20, 1, 'Does Not Meet Standards', 'Gives out extrinsic rewards (e.g., free time) without using them as a lever to improve behavior.');

-- ============================================================================
-- DOMAIN C — Delivery of Instruction
-- ============================================================================
INSERT OR IGNORE INTO framework_indicators (id, domain_id, code, name, sort_order, prompt) VALUES
  (21, 3, 'a', 'Expectations',       1, 'The teacher:'),
  (22, 3, 'b', 'Mindset',             2, 'The teacher:'),
  (23, 3, 'c', 'Goals',               3, 'The teacher:'),
  (24, 3, 'd', 'Connections',         4, 'The teacher:'),
  (25, 3, 'e', 'Clarity',             5, 'The teacher:'),
  (26, 3, 'f', 'Repertoire',          6, 'The teacher:'),
  (27, 3, 'g', 'Engagement',          7, 'The teacher:'),
  (28, 3, 'h', 'Differentiation',     8, 'The teacher:'),
  (29, 3, 'i', 'Nimbleness',          9, 'The teacher:'),
  (30, 3, 'j', 'Application',        10, 'The teacher:');

INSERT OR IGNORE INTO framework_descriptors (indicator_id, level, level_label, descriptor) VALUES
  (21, 4, 'Highly Effective', 'Exudes high expectations and determination and convinces all students that they will master the material.'),
  (21, 3, 'Effective',        'Conveys to students: This is important, you can do it, and I''m not going to give up on you.'),
  (21, 2, 'Improvement Necessary', 'Tells students that the subject matter is important and they need to work hard.'),
  (21, 1, 'Does Not Meet Standards', 'Gives up on some students as hopeless.'),

  (22, 4, 'Highly Effective', 'Actively inculcates a "growth" mindset: take risks, learn from mistakes; through effective effort you can and will achieve at high levels.'),
  (22, 3, 'Effective',        'Tells students that effective effort, not innate ability, is the key.'),
  (22, 2, 'Improvement Necessary', 'Doesn''t counteract students'' misconceptions about innate ability.'),
  (22, 1, 'Does Not Meet Standards', 'Communicates a "fixed" mindset about ability: some students have it, some don''t.'),

  (23, 4, 'Highly Effective', 'Shows students exactly what''s expected by posting essential questions, goals, rubrics, and exemplars of proficient work.'),
  (23, 3, 'Effective',        'Gives students a clear sense of purpose by posting the unit''s essential questions and the lesson''s goals.'),
  (23, 2, 'Improvement Necessary', 'Tells students the main learning objectives of each lesson.'),
  (23, 1, 'Does Not Meet Standards', 'Begins lessons without giving students a sense of where instruction is headed.'),

  (24, 4, 'Highly Effective', 'Hooks all students'' interest and makes connections to prior knowledge, experience, and reading.'),
  (24, 3, 'Effective',        'Activates students'' prior knowledge and hooks their interest in each unit and lesson.'),
  (24, 2, 'Improvement Necessary', 'Is only sometimes successful in making the subject interesting and relating it to things students already know.'),
  (24, 1, 'Does Not Meet Standards', 'Rarely hooks students'' interest or makes connections to their lives.'),

  (25, 4, 'Highly Effective', 'Always presents material clearly and explicitly, with well-chosen examples and vivid and appropriate language.'),
  (25, 3, 'Effective',        'Uses clear explanations, appropriate language, and examples to present material.'),
  (25, 2, 'Improvement Necessary', 'Sometimes uses language and explanations that are fuzzy, confusing, or inappropriate.'),
  (25, 1, 'Does Not Meet Standards', 'Often presents material in a confusing way, using language that is inappropriate.'),

  (26, 4, 'Highly Effective', 'Orchestrates highly effective strategies, materials, and groupings to involve and motivate all students.'),
  (26, 3, 'Effective',        'Orchestrates effective strategies, materials, and classroom groupings to foster student learning.'),
  (26, 2, 'Improvement Necessary', 'Uses a limited range of classroom strategies, materials, and groupings with mixed success.'),
  (26, 1, 'Does Not Meet Standards', 'Uses only one or two teaching strategies and types of materials and fails to reach most students.'),

  (27, 4, 'Highly Effective', 'Gets all students highly involved in focused work in which they are active learners and problem-solvers.'),
  (27, 3, 'Effective',        'Has students actively think about, discuss, and use the ideas and skills being taught.'),
  (27, 2, 'Improvement Necessary', 'Attempts to get students actively involved but some students are disengaged.'),
  (27, 1, 'Does Not Meet Standards', 'Mostly lectures to passive students or has them plod through textbooks and worksheets.'),

  (28, 4, 'Highly Effective', 'Successfully reaches all students by skillfully differentiating and scaffolding.'),
  (28, 3, 'Effective',        'Differentiates and scaffolds instruction to accommodate most students'' learning needs.'),
  (28, 2, 'Improvement Necessary', 'Attempts to accommodate students with learning deficits, but with mixed success.'),
  (28, 1, 'Does Not Meet Standards', 'Fails to differentiate instruction for students with learning deficits.'),

  (29, 4, 'Highly Effective', 'Deftly adapts lessons and units to exploit teachable moments and correct misunderstandings.'),
  (29, 3, 'Effective',        'Is flexible about modifying lessons to take advantage of teachable moments.'),
  (29, 2, 'Improvement Necessary', 'Sometimes doesn''t take advantage of teachable moments.'),
  (29, 1, 'Does Not Meet Standards', 'Is rigid and inflexible with lesson plans and rarely takes advantage of teachable moments.'),

  (30, 4, 'Highly Effective', 'Consistently has all students summarize and internalize what they learn and apply it to real-life situations.'),
  (30, 3, 'Effective',        'Has students sum up what they have learned and apply it in a different context.'),
  (30, 2, 'Improvement Necessary', 'Sometimes brings closure to lessons and asks students to think about applications.'),
  (30, 1, 'Does Not Meet Standards', 'Moves on at the end of each lesson without closure or application to other contexts.');

-- ============================================================================
-- DOMAIN D — Monitoring, Assessment, and Follow-Up
-- ============================================================================
INSERT OR IGNORE INTO framework_indicators (id, domain_id, code, name, sort_order, prompt) VALUES
  (31, 4, 'a', 'Criteria',          1, 'The teacher:'),
  (32, 4, 'b', 'Diagnosis',         2, 'The teacher:'),
  (33, 4, 'c', 'On-the-Spot',       3, 'The teacher:'),
  (34, 4, 'd', 'Self-Assessment',   4, 'The teacher:'),
  (35, 4, 'e', 'Recognition',       5, 'The teacher:'),
  (36, 4, 'f', 'Interims',          6, 'The teacher:'),
  (37, 4, 'g', 'Tenacity',          7, 'The teacher:'),
  (38, 4, 'h', 'Support',           8, 'The teacher:'),
  (39, 4, 'i', 'Analysis',          9, 'The teacher:'),
  (40, 4, 'j', 'Reflection',       10, 'The teacher:');

INSERT OR IGNORE INTO framework_descriptors (indicator_id, level, level_label, descriptor) VALUES
  (31, 4, 'Highly Effective', 'Posts and reviews clear criteria for proficient work, including rubrics and exemplars, and all students internalize them.'),
  (31, 3, 'Effective',        'Posts criteria for proficiency, including rubrics and exemplars of student work.'),
  (31, 2, 'Improvement Necessary', 'Tells students some of the qualities that their finished work should exhibit.'),
  (31, 1, 'Does Not Meet Standards', 'Expects students to know (or figure out) what it takes to get good grades.'),

  (32, 4, 'Highly Effective', 'Gives students a well-constructed diagnostic assessment up front, and uses the information to fine-tune instruction.'),
  (32, 3, 'Effective',        'Diagnoses students'' knowledge and skills up front and makes small adjustments based on the data.'),
  (32, 2, 'Improvement Necessary', 'Does a quick K-W-L (Know, Want to Know, Learned) exercise before beginning a unit.'),
  (32, 1, 'Does Not Meet Standards', 'Begins instruction without diagnosing students'' skills and knowledge.'),

  (33, 4, 'Highly Effective', 'Uses a variety of effective methods to check for understanding; immediately unscrambles confusion and clarifies.'),
  (33, 3, 'Effective',        'Frequently checks for understanding and gives students helpful information if they seem confused.'),
  (33, 2, 'Improvement Necessary', 'Uses mediocre methods (e.g., thumbs up, thumbs down) to check for understanding during instruction.'),
  (33, 1, 'Does Not Meet Standards', 'Uses ineffective methods ("Is everyone with me?") to check for understanding.'),

  (34, 4, 'Highly Effective', 'Has students set ambitious goals, continuously self-assess, and know where they stand academically at all times.'),
  (34, 3, 'Effective',        'Has students set goals, self-assess, and take responsibility for improving performance.'),
  (34, 2, 'Improvement Necessary', 'Urges students to look over their work, see where they had trouble, and aim to improve those areas.'),
  (34, 1, 'Does Not Meet Standards', 'Allows students to move on without assessing and improving problems in their work.'),

  (35, 4, 'Highly Effective', 'Frequently posts students'' work with rubrics and commentary to celebrate progress and motivate and direct effort.'),
  (35, 3, 'Effective',        'Regularly posts students'' work to make visible their progress with respect to standards.'),
  (35, 2, 'Improvement Necessary', 'Posts some "A" student work as an example to others.'),
  (35, 1, 'Does Not Meet Standards', 'Posts only a few samples of student work or none at all.'),

  (36, 4, 'Highly Effective', 'Works with colleagues to use interim assessment data, fine-tune teaching, re-teach, and help struggling students.'),
  (36, 3, 'Effective',        'Uses data from interim assessments to adjust teaching, re-teach, and follow up with failing students.'),
  (36, 2, 'Improvement Necessary', 'Looks over students'' tests to see if there is anything that needs to be re-taught.'),
  (36, 1, 'Does Not Meet Standards', 'Gives tests and moves on without analyzing them and following up with students.'),

  (37, 4, 'Highly Effective', 'Relentlessly follows up with struggling students with personal attention so they all reach proficiency.'),
  (37, 3, 'Effective',        'Takes responsibility for students who are not succeeding and gives them extra help.'),
  (37, 2, 'Improvement Necessary', 'Offers students who fail tests some additional time to study and do re-takes.'),
  (37, 1, 'Does Not Meet Standards', 'Tells students that if they fail a test, that''s it; the class has to move on to cover the curriculum.'),

  (38, 4, 'Highly Effective', 'Makes sure that students who need specialized diagnosis and help receive appropriate services immediately.'),
  (38, 3, 'Effective',        'When necessary, refers students for specialized diagnosis and extra help.'),
  (38, 2, 'Improvement Necessary', 'Sometimes doesn''t refer students promptly for special help, and/or refers students who don''t need it.'),
  (38, 1, 'Does Not Meet Standards', 'Often fails to refer students for special services and/or refers students who do not need them.'),

  (39, 4, 'Highly Effective', 'Works with colleagues to analyze and chart data, draw action conclusions, and leverage student growth.'),
  (39, 3, 'Effective',        'Analyzes data from assessments, draws conclusions, and shares them appropriately.'),
  (39, 2, 'Improvement Necessary', 'Records students'' grades and notes some general patterns for future reference.'),
  (39, 1, 'Does Not Meet Standards', 'Records students'' grades and moves on with the curriculum.'),

  (40, 4, 'Highly Effective', 'Works with colleagues to reflect on what worked and what didn''t and continuously improve instruction.'),
  (40, 3, 'Effective',        'Reflects on the effectiveness of lessons and units and continuously works to improve them.'),
  (40, 2, 'Improvement Necessary', 'At the end of a teaching unit or semester, thinks about what might have been done better.'),
  (40, 1, 'Does Not Meet Standards', 'Does not draw lessons for the future when teaching is unsuccessful.');

-- ============================================================================
-- DOMAIN E — Family and Community Outreach
-- ============================================================================
INSERT OR IGNORE INTO framework_indicators (id, domain_id, code, name, sort_order, prompt) VALUES
  (41, 5, 'a', 'Respect',          1, 'The teacher:'),
  (42, 5, 'b', 'Belief',           2, 'The teacher:'),
  (43, 5, 'c', 'Expectations',     3, 'The teacher:'),
  (44, 5, 'd', 'Communication',    4, 'The teacher:'),
  (45, 5, 'e', 'Involving',        5, 'The teacher:'),
  (46, 5, 'f', 'Homework',         6, 'The teacher:'),
  (47, 5, 'g', 'Responsiveness',   7, 'The teacher:'),
  (48, 5, 'h', 'Reporting',        8, 'The teacher:'),
  (49, 5, 'i', 'Outreach',         9, 'The teacher:'),
  (50, 5, 'j', 'Resources',       10, 'The teacher:');

INSERT OR IGNORE INTO framework_descriptors (indicator_id, level, level_label, descriptor) VALUES
  (41, 4, 'Highly Effective', 'Shows great sensitivity and respect for family and community culture, values, and beliefs.'),
  (41, 3, 'Effective',        'Communicates respectfully with parents and is sensitive to different families'' culture and values.'),
  (41, 2, 'Improvement Necessary', 'Tries to be sensitive to the culture and beliefs of students'' families but sometimes shows lack of sensitivity.'),
  (41, 1, 'Does Not Meet Standards', 'Is often insensitive to the culture and beliefs of students'' families.'),

  (42, 4, 'Highly Effective', 'Shows each parent an in-depth knowledge of their child and a strong belief he or she will meet or exceed standards.'),
  (42, 3, 'Effective',        'Shows parents a genuine interest and belief in each child''s ability to reach standards.'),
  (42, 2, 'Improvement Necessary', 'Tells parents that he or she cares about their children and wants the best for them.'),
  (42, 1, 'Does Not Meet Standards', 'Does not communicate to parents knowledge of individual children or concern about their future.'),

  (43, 4, 'Highly Effective', 'Gives parents clear, user-friendly learning and behavior expectations and exemplars of proficient work.'),
  (43, 3, 'Effective',        'Gives parents clear expectations for student learning and behavior for the year.'),
  (43, 2, 'Improvement Necessary', 'Sends home a list of classroom rules and the syllabus for the year.'),
  (43, 1, 'Does Not Meet Standards', 'Doesn''t inform parents about learning and behavior expectations.'),

  (44, 4, 'Highly Effective', 'Makes sure parents hear positive news about their children first, and immediately flags any problems.'),
  (44, 3, 'Effective',        'Promptly informs parents of behavior and learning problems, and also updates parents on good news.'),
  (44, 2, 'Improvement Necessary', 'Lets parents know about problems their children are having but rarely mentions positive news.'),
  (44, 1, 'Does Not Meet Standards', 'Seldom informs parents of concerns or positive news about their children.'),

  (45, 4, 'Highly Effective', 'Frequently involves parents in supporting and enriching the curriculum for their children as it unfolds.'),
  (45, 3, 'Effective',        'Updates parents on the unfolding curriculum and suggests ways to support learning at home.'),
  (45, 2, 'Improvement Necessary', 'Sends home occasional suggestions on how parents can help their children with schoolwork.'),
  (45, 1, 'Does Not Meet Standards', 'Rarely if ever communicates with parents on ways to help their children at home.'),

  (46, 4, 'Highly Effective', 'Assigns highly engaging homework, gets close to a 100% return, and promptly provides helpful feedback.'),
  (46, 3, 'Effective',        'Assigns appropriate homework, holds students accountable for turning it in, and gives feedback.'),
  (46, 2, 'Improvement Necessary', 'Assigns homework, keeps track of compliance, but rarely follows up.'),
  (46, 1, 'Does Not Meet Standards', 'Assigns homework but is resigned to the fact that many students won''t turn it in, and doesn''t follow up.'),

  (47, 4, 'Highly Effective', 'Deals immediately and successfully with parent concerns and makes parents feel welcome any time.'),
  (47, 3, 'Effective',        'Responds promptly to parent concerns and makes parents feel welcome in the school.'),
  (47, 2, 'Improvement Necessary', 'Is slow to respond to some parent concerns and comes across as unwelcoming.'),
  (47, 1, 'Does Not Meet Standards', 'Does not respond to parent concerns and makes parents feel unwelcome in the classroom.'),

  (48, 4, 'Highly Effective', 'Uses student-led conferences, report cards, and informal talks to give parents detailed and helpful feedback on children''s progress.'),
  (48, 3, 'Effective',        'Uses conferences and report cards to give parents feedback on their children''s progress.'),
  (48, 2, 'Improvement Necessary', 'Uses report card conferences to tell parents the areas in which their children can improve.'),
  (48, 1, 'Does Not Meet Standards', 'Gives out report cards and expects parents to deal with the areas that need improvement.'),

  (49, 4, 'Highly Effective', 'Is successful in contacting and working with all parents, including those who are hard to reach.'),
  (49, 3, 'Effective',        'Tries to contact all parents and is tenacious in contacting hard-to-reach parents.'),
  (49, 2, 'Improvement Necessary', 'Tries to contact all parents, but ends up talking mainly to the parents of high-achieving students.'),
  (49, 1, 'Does Not Meet Standards', 'Makes little or no effort to contact parents.'),

  (50, 4, 'Highly Effective', 'Successfully enlists classroom volunteers and extra resources from homes and the community to enrich the curriculum.'),
  (50, 3, 'Effective',        'Reaches out to families and community agencies to bring in volunteers and additional resources.'),
  (50, 2, 'Improvement Necessary', 'Asks parents to volunteer in the classroom and contribute extra resources.'),
  (50, 1, 'Does Not Meet Standards', 'Does not reach out for extra support from parents or the community.');

-- ============================================================================
-- DOMAIN F — Professional Responsibilities
-- ============================================================================
INSERT OR IGNORE INTO framework_indicators (id, domain_id, code, name, sort_order, prompt) VALUES
  (51, 6, 'a', 'Attendance',       1, 'The teacher:'),
  (52, 6, 'b', 'Language',         2, 'The teacher:'),
  (53, 6, 'c', 'Reliability',      3, 'The teacher:'),
  (54, 6, 'd', 'Professionalism',  4, 'The teacher:'),
  (55, 6, 'e', 'Judgment',         5, 'The teacher:'),
  (56, 6, 'f', 'Above-and-beyond', 6, 'The teacher:'),
  (57, 6, 'g', 'Leadership',       7, 'The teacher:'),
  (58, 6, 'h', 'Openness',         8, 'The teacher:'),
  (59, 6, 'i', 'Collaboration',    9, 'The teacher:'),
  (60, 6, 'j', 'Growth',          10, 'The teacher:');

INSERT OR IGNORE INTO framework_descriptors (indicator_id, level, level_label, descriptor) VALUES
  (51, 4, 'Highly Effective', 'Has perfect or near-perfect attendance (98-100%).'),
  (51, 3, 'Effective',        'Has very good attendance (95-97%).'),
  (51, 2, 'Improvement Necessary', 'Has moderate absences (6-10%). If there are extenuating circumstances, state below.'),
  (51, 1, 'Does Not Meet Standards', 'Has many absences (11% or more). If there are extenuating circumstances, state below.'),

  (52, 4, 'Highly Effective', 'In professional contexts, speaks and writes correctly, succinctly, and eloquently.'),
  (52, 3, 'Effective',        'Uses correct grammar, syntax, usage, and spelling in professional contexts.'),
  (52, 2, 'Improvement Necessary', 'Periodically makes errors in grammar, syntax, usage and/or spelling in professional contexts.'),
  (52, 1, 'Does Not Meet Standards', 'Frequently makes errors in grammar, syntax, usage, and/or spelling in professional contexts.'),

  (53, 4, 'Highly Effective', 'Carries out assignments conscientiously and punctually, keeps meticulous records, and is never late.'),
  (53, 3, 'Effective',        'Is punctual and reliable with paperwork, duties, and assignments; keeps accurate records.'),
  (53, 2, 'Improvement Necessary', 'Occasionally skips assignments, is late, makes errors in records, and misses paperwork deadlines.'),
  (53, 1, 'Does Not Meet Standards', 'Frequently skips assignments, is late, makes errors in records, and misses paperwork deadlines.'),

  (54, 4, 'Highly Effective', 'Presents as a consummate professional and always observes appropriate boundaries.'),
  (54, 3, 'Effective',        'Demonstrates professional demeanor and maintains appropriate boundaries.'),
  (54, 2, 'Improvement Necessary', 'Occasionally acts and/or dresses in an unprofessional manner and/or violates boundaries.'),
  (54, 1, 'Does Not Meet Standards', 'Frequently acts and/or dresses in an unprofessional manner and violates boundaries.'),

  (55, 4, 'Highly Effective', 'Is invariably ethical, honest, and forthright, uses impeccable judgment, and respects confidentiality.'),
  (55, 3, 'Effective',        'Is ethical and forthright, uses good judgment, and maintains confidentiality with student records.'),
  (55, 2, 'Improvement Necessary', 'Sometimes uses questionable judgment, is less than completely honest, and/or discloses student information.'),
  (55, 1, 'Does Not Meet Standards', 'Is frequently unethical, dishonest, uses poor judgment, and/or discloses student information.'),

  (56, 4, 'Highly Effective', 'Is an important member of teacher teams and committees and frequently volunteers for after-school activities.'),
  (56, 3, 'Effective',        'Shares responsibility for grade-level and schoolwide activities and takes part in after-school activities.'),
  (56, 2, 'Improvement Necessary', 'When asked, will serve on a committee and attend an after-school activity.'),
  (56, 1, 'Does Not Meet Standards', 'Declines invitations to serve on committees and attend after-school activities.'),

  (57, 4, 'Highly Effective', 'Frequently contributes valuable ideas and expertise and instills in others a desire to improve student results.'),
  (57, 3, 'Effective',        'Is a positive team player and contributes ideas, expertise, and time to the overall mission of the school.'),
  (57, 2, 'Improvement Necessary', 'Occasionally suggests an idea aimed at improving the school.'),
  (57, 1, 'Does Not Meet Standards', 'Rarely if ever contributes ideas that might help improve the school.'),

  (58, 4, 'Highly Effective', 'Actively seeks out feedback and suggestions and uses them to improve performance.'),
  (58, 3, 'Effective',        'Listens thoughtfully to other viewpoints and responds constructively to suggestions and criticism.'),
  (58, 2, 'Improvement Necessary', 'Is somewhat defensive but does listen to feedback and suggestions.'),
  (58, 1, 'Does Not Meet Standards', 'Is very defensive about criticism and resistant to changing classroom practice.'),

  (59, 4, 'Highly Effective', 'Meets at least weekly with colleagues to plan units, share teaching ideas, and analyze interim assessments.'),
  (59, 3, 'Effective',        'Collaborates with colleagues to plan units, share ideas, and look at student work.'),
  (59, 2, 'Improvement Necessary', 'Meets occasionally with colleagues to share ideas about teaching and students.'),
  (59, 1, 'Does Not Meet Standards', 'Meets infrequently with colleagues, and conversations lack educational substance.'),

  (60, 4, 'Highly Effective', 'Actively reaches out for new ideas and engages in action research with colleagues to figure out what works best.'),
  (60, 3, 'Effective',        'Seeks out effective teaching ideas from colleagues, workshops, and other sources and implements them well.'),
  (60, 2, 'Improvement Necessary', 'Can occasionally be persuaded to try out new classroom practices.'),
  (60, 1, 'Does Not Meet Standards', 'Is not open to ideas for improving teaching and learning.');
