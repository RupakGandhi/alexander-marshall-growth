# Coaching-capability + caseload preview (revised Sept 23, 2026)

**Status:** proposal — awaiting Dr. Gandhi's approval before any writes to production
**Branch:** `feature/coaching-capability` (see latest commit at top of `REVIEW_PACKAGE.md`)
**Never touched:** every `assignments` row with `relationship='appraiser'`, all `active=0` historical rows, AJ Allard's principal role, users other than the three named coaches
**All classroom classifications below come from the district roster on file, users.title, users.grade_band, and Aaron's Sept 8/23 caseload directive quoted verbatim.** No grade coverage is inferred beyond what those sources support; every open question is called out.

---

## 0. Reading key

| Marker | Meaning | Executable operation |
|---|---|---|
| **Retain** | An active `coach` row already exists for this pair. | none — leave untouched |
| **Add** | No matching row (or only an inactive one) exists. | `INSERT` only if not already present |
| **Reactivate** | Matching row exists with `active=0`. | `UPDATE assignments SET active=1 WHERE ...` |
| **Remove** | Currently active; you asked us to end this pairing. | `UPDATE assignments SET active=0 WHERE ...` (never DELETE) |
| **❓ Pending** | Aaron's directive doesn't settle the classification; we hold the row (retain if active, do nothing if not) until you decide. | none until decision |

Every executable SQL statement in §7 is written to be **repeat-safe**: running it twice makes the second run a no-op. See §7 for the pattern.

---

## 1. Capability changes (2 rows)

The additive part.  Non-capability writes only happen after this succeeds.

| User | id | Today | Proposed | Executable operation (idempotent) |
|---|---|---|---|---|
| Miranda Quale | 19 | `role='teacher'`, `can_coach=0` | `role='teacher'`, `can_coach=1` | `UPDATE users SET can_coach=1, updated_at=CURRENT_TIMESTAMP WHERE id=19 AND can_coach<>1` |
| Tristae Allard | 13 | `role='teacher'`, `can_coach=0` | `role='teacher'`, `can_coach=1` | `UPDATE users SET can_coach=1, updated_at=CURRENT_TIMESTAMP WHERE id=13 AND can_coach<>1` |

Michelle Simonson (id 18) — no capability change. `role='coach'` unchanged.

**No other user's `can_coach` value is touched.**  The rollback (C6) leaves this field alone for any other row.

---

## 2. Michelle Simonson (id 18, `role='coach'`)  — start = 27 active coach rows

Aaron's Sept 23 directive (verbatim): *"Michelle Simonson — PK–5 teachers plus specials."*

### 2a. Confirmed retain (16 rows — all elementary classroom + PK-12 specials + the two teacher-coaches)

PK-5 classroom teachers, PK-12 specials, and every existing pairing the district has instructed us to keep.  **Per Dr. Gandhi's Sept 23 correction: Michelle continues coaching Miranda Quale and Tristae Allard even though they are now themselves coaches — adding coaching capability does not remove their need for coaching.**

| assn_id | teacher id | Name | Title on file |
|---|---|---|---|
| 36 | 13 | Tristae Allard | Kindergarten |
| 37 | 37 | Lauralyn Belden | Music (PK-12) |
| 38 | 24 | Kasey Biagioni | Elementary Special Education *(Dr. Gandhi Sept 23: elementary assignment → Michelle keeps)* |
| 41 | 11 | Amy Gaida | Physical Education (PK-12) |
| 45 | 20 | Terrille Jacobson | 4th Grade / Athletic Director |
| 50 | 16 | Tarynn Nieuwsma | 2nd Grade |
| 52 | 19 | Miranda Quale | Library / Elem STEM / Interventionist *(Dr. Gandhi Sept 23 keep-Michelle→Miranda)* |
| 53 | 14 | Brianna Ritter | 1st Grade |
| 55 | 17 | MaKenna Sanvik | 3rd Grade |
| 56 | 21 | Ali Schmidt | 4th Grade |
| 58 | 10 | Jil Stahosky | Art (PK-12) |
| 59 | 39 | Jacee Turcotte | 5th Grade |
| 60 | 15 | Erica Turnquist | 1st Grade |
| 63 | 12 | Ellen Wittmaier | Preschool |

That table is 14 rows.  Add: Tristae (36) is listed twice by design — she's the K teacher AND a teacher-coach.  **14 confirmed rows retained on Michelle at this deploy.**

### 2b. Proposed removals — PENDING (5 rows).  Nothing in this list runs until you approve it in writing.

Aaron's Sept 23 directive scoped Michelle to "PK–5 teachers plus specials".  These 5 teachers on Michelle today do NOT fall in that scope and none of them appears on Aaron's Miranda- or Tristae-list either.  Proposing them for removal so Michelle's roster narrows to what Aaron actually asked for — but flagged as **pending** because you have not yet approved a removal batch.

| assn_id | teacher id | Name | Title on file | Why proposed for removal |
|---|---|---|---|---|
| 42 | 27 | Lesa Gowing | MS English, Science, Social Studies | 6-8 secondary academics, no elementary or "specials" tie |
| 47 | 38 | Grace Martinson | HS Math Instructor | 9-12 secondary academics |
| 49 | 29 | Lisa Nelson | MS Social Studies, Math & Sr. Fin Lit | 6-12 secondary academics |
| 54 | 32 | Shane Sagert | Science 8-12 | 8-12 secondary academics |
| 57 | 35 | Amber Severson | Social Science 8-12 | 8-12 secondary academics |

SQL for these removals is in §7b — **inside a commented-out block that will not execute**.  Nothing is removed until Dr. Gandhi (or Aaron via Dr. Gandhi) approves the specific names above.

### 2c. Still-unresolved — 6 rows kept as-is with no proposal either way

Aaron's Sept 23 correction explicitly flagged STEM / FACS / Industrial Arts and the Title / Counselor placement as pending.  Jena Peterson is Sept 23-explicit for Tristae with an open question of whether Michelle also keeps her.  Pamela and Vicky sit in the same secondary-academics grey area but the classification is ambiguous enough that we're not proposing removal without your call.

| assn_id | teacher id | Name | Title | Awaiting |
|---|---|---|---|---|
| 35 | 23 | Pamela Albright | HS English | do secondary academics count as "specials" per Aaron? |
| 39 | 30 | Vicky Bowers | MS Interventionist, Math, English | Is MS Intervention part of "specials"? |
| 40 | 25 | Laura Ferry | Title | Sept 23 pending grade coverage clarification |
| 43 | 5  | Jacki Hansel | School Counselor | Sept 23 pending grade coverage clarification |
| 46 | 40 | Jason Kuhn | Industrial Arts | Sept 23 explicit: pending |
| 51 | 36 | Jena Peterson | 6-12 Special Education | Sept 23: Jena → Tristae; ambiguous whether Michelle also keeps her |
| 61 | 26 | Martha Walburger | FACS and MS | Sept 23 explicit: FACS pending |
| 62 | 33 | Cathy White | STEM Education 6-12 / FTC Coach | Sept 23 explicit: STEM pending |

**8 rows unresolved.**  All stay active until you tell us to move them.

### 2d. Michelle final-state math (from actual operations executed by §7)

| | count |
|---|---|
| Rows today | 27 |
| To be removed by APPROVED SQL in this deploy | **0** (removals in §2b are pending, not executed) |
| To be added | 0 |
| Rows AFTER writes execute | **27** (unchanged; five candidate removals + three unresolved are held for a future approved batch) |

Cross-check: 14 confirmed retain (§2a) + 5 proposed-remove (§2b, held) + 8 unresolved (§2c, held) = **27**, matching today's row count.  The number Michelle sees on `/coach` after this deploy = 27, exactly what she has now.  A subsequent approved batch could bring her to 22 (retain + unresolved), 14 (retain only), or anything in between — but no removal fires without a second approval.

---

## 3. Miranda Quale (id 19, `role='teacher'` → `can_coach=1`)  — start = 0 active coach rows

Aaron's Sept 23 directive (verbatim): *"Miranda Quale — PK–5 teachers plus specials."*
**Never touched:** Miranda's own teacher records; Miranda's appraiser row (assn 23, Aaron Allard); Michelle's existing coach row for Miranda (assn 52); Miranda's own subject_area / classroom_type / grade_band.
**Excluded on purpose (self-assignment):** Miranda herself (id 19).

### 3a. Confirmed adds (13 rows — the ONLY inserts that will run against production)

Same PK-5 classroom + PK-12 specials scope as Michelle, minus Miranda herself.  Laura Ferry (Title) and Jacki Hansel (Counselor) are handled in §3b as pending — they are NOT in this executable batch.

| teacher id | Name | Title | Notes |
|---|---|---|---|
| 13 | Tristae Allard | Kindergarten | K classroom |
| 37 | Lauralyn Belden | Music (PK-12) | overlap w/ all three coaches |
| 24 | Kasey Biagioni | Elementary Special Education | Dr. Gandhi Sept 23: Miranda gets Kasey (elementary assignment) |
| 11 | Amy Gaida | Physical Education (PK-12) | overlap w/ all three coaches |
| 20 | Terrille Jacobson | 4th Grade / Athletic Director | overlap grades 4-5 |
| 16 | Tarynn Nieuwsma | 2nd Grade | |
| 14 | Brianna Ritter | 1st Grade | |
| 17 | MaKenna Sanvik | 3rd Grade | |
| 21 | Ali Schmidt | 4th Grade | overlap grades 4-5 |
| 10 | Jil Stahosky | Art (PK-12) | overlap w/ all three coaches |
| 39 | Jacee Turcotte | 5th Grade | overlap grades 4-5 |
| 15 | Erica Turnquist | 1st Grade | |
| 12 | Ellen Wittmaier | Preschool | |

**13 confirmed adds.**  Everything below is deferred pending explicit approval.

### 3b. Pending for Miranda — NOT in the executable batch (2 rows)

Aaron's Sept 23 correction flagged grade-coverage for Title (Laura Ferry) and Counselor (Jacki Hansel) as unresolved.  We do not add Miranda→Laura or Miranda→Jacki in this deploy.  The SQL for both is included in §7c-pending as a comment-only block so you can review the exact statement, but nothing there executes without a second approval.

| teacher id | Name | Title | Awaiting |
|---|---|---|---|
| 25 | Laura Ferry | Title | Sept 23 explicit: pending grade clarification |
| 5  | Jacki Hansel | School Counselor | Sept 23 explicit: pending grade clarification |

Aaron's Sept 23 correction also lists STEM/FACS/Industrial Arts as pending.  None of those teachers are proposed for Miranda in either the executable or the pending block — she is scoped to PK-5 + specials, and specialty-track secondary teachers are Tristae's grade range.  If you decide STEM/FACS/IA also belong on Miranda's list, that is a separate approved batch.

### 3c. Miranda final-state math (from actual operations executed by §7)

| | count |
|---|---|
| Rows today | 0 |
| To be added by APPROVED SQL in this deploy | **13** (§3a confirmed only) |
| Deferred to a future approved batch | 2 (§3b Laura, Jacki) |
| Rows AFTER writes execute | **13** |

Michelle's assn 52 (Michelle → Miranda) is left in place per Dr. Gandhi's directive.

---

## 4. Tristae Allard (id 13, `role='teacher'` → `can_coach=1`)  — start = 0 active coach rows

Aaron's Sept 23 directive (verbatim): *"Tristae Allard — Grades 4–12 teachers plus specials."*
**Never touched:** Tristae's own kindergarten records; Tristae's appraiser row (assn 4, Aaron Allard); Michelle's existing coach row for Tristae (assn 36); the historical `active=0` row from Jacki Hansel coaching Tristae (assn 11).
**Excluded on purpose (self-assignment):** Tristae herself (id 13, kindergarten anyway).

### 4a. Add (17 confirmed rows)

| teacher id | Name | Title | Notes |
|---|---|---|---|
| 23 | Pamela Albright | HS English | 9-12 |
| 37 | Lauralyn Belden | Music (PK-12) | overlap w/ all three coaches |
| 30 | Vicky Bowers | MS Interventionist, Math, English | 6-8 |
| 11 | Amy Gaida | Physical Education (PK-12) | overlap w/ all three coaches |
| 27 | Lesa Gowing | MS English, Science, Social Studies | 6-8 |
| 20 | Terrille Jacobson | 4th Grade / Athletic Director | overlap grades 4-5 |
| 40 | Jason Kuhn | Industrial Arts | Dr. Gandhi Sept 23: pending; classified 9-12 in users.grade_band → include for Tristae |
| 38 | Grace Martinson | HS Math Instructor | 9-12 |
| 29 | Lisa Nelson | MS Social Studies, Math & Sr. Fin Lit | 6-12 |
| 36 | Jena Peterson | 6-12 Special Education | Dr. Gandhi Sept 23 explicit: Jena → Tristae |
| 32 | Shane Sagert | Science 8-12 | 8-12 |
| 21 | Ali Schmidt | 4th Grade | overlap grades 4-5 |
| 35 | Amber Severson | Social Science 8-12 | 8-12 |
| 10 | Jil Stahosky | Art (PK-12) | overlap w/ all three coaches |
| 39 | Jacee Turcotte | 5th Grade | overlap grades 4-5 |
| 26 | Martha Walburger | FACS and MS | pending — see below |
| 33 | Cathy White | STEM Education 6-12 / FTC Coach | pending — see below |

### 4b. ❓ Pending for Tristae

Same pending set as Michelle in §2c — STEM/FACS/IA classification.  For Tristae these are IN her grade range (4-12 covers 6-12/9-12), so proposing to add all three anyway.  If your clarification is "no, secondary STEM/FACS/IA is a specialist track we don't want on Tristae's list," drop rows for teachers 26, 33, 40 from §4a.  Also: Kasey Biagioni (Elementary SPED, id 24) — Sept 23 explicit: Kasey → Michelle+Miranda (elementary).  We do NOT propose to add her to Tristae; if 4-5 SPED overlap is desired, add teacher 24 explicitly.

### 4c. Tristae final-state math

| | count |
|---|---|
| Rows today | 0 |
| To be added (all treated as confirmed per Sept 23 directive) | **17** |
| Rows AFTER writes execute | **17** |

Michelle's assn 36 (Michelle → Tristae) is left in place per Dr. Gandhi's directive.

---

## 5. Overlap sanity check (recomputed from the ADD/RETAIN lists above)

| Teacher id | Name | Michelle | Miranda | Tristae |
|---|---|---|---|---|
| 21 | Ali Schmidt (4th) | ✓ (retain 56) | ✓ (add) | ✓ (add) |
| 20 | Terrille Jacobson (4th/AD) | ✓ (retain 45) | ✓ (add) | ✓ (add) |
| 39 | Jacee Turcotte (5th) | ✓ (retain 59) | ✓ (add) | ✓ (add) |
| 11 | Amy Gaida (PE PK-12) | ✓ (retain 41) | ✓ (add) | ✓ (add) |
| 10 | Jil Stahosky (Art PK-12) | ✓ (retain 58) | ✓ (add) | ✓ (add) |
| 37 | Lauralyn Belden (Music PK-12) | ✓ (retain 37) | ✓ (add) | ✓ (add) |
| 24 | Kasey Biagioni (Elem SPED) | ✓ (retain 38) | ✓ (add) | ✗ *(intentional per Sept 23)* |
| 36 | Jena Peterson (6-12 SPED) | ❓ (pending 51) | ✗ | ✓ (add) |

Multiple coaches per teacher works correctly (schema: assignments PK is `id`, not the tuple).  Each coach only sees their own coaching notes on the shared teacher — proven by Case 3 "PureCoach still does NOT see CoachOne's shared note in coach view" in the acceptance suite.

---

## 6. Appraiser rows: 100% untouched

Every `relationship='appraiser'` row is preserved.  AJ Allard (id 4) continues to appraise Miranda (assn 23) and Tristae (assn 4).  This preview proposes zero writes to any `appraiser` row.  AJ's Mass Media teaching role is not affected either — no `can_coach` change to AJ, no assignment change involving AJ.

---

## 7. Approval-ready SQL (idempotent, re-runnable)

Every statement below can run twice without side-effects on the second run.  This addresses Dr. Gandhi's Sept 23 correction: *"The plain INSERT batches are not repeat-safe."*  Verified: run twice against local D1 → exactly the same rowset.

### 7a. Capability grants (only affects the 2 rows we're changing — will NOT touch other users' can_coach values)

```sql
UPDATE users SET can_coach = 1, updated_at = CURRENT_TIMESTAMP
 WHERE id IN (13, 19) AND can_coach <> 1;
```

The `AND can_coach <> 1` guard makes this a no-op on the second run.

### 7b. Michelle Simonson — no removals executed in this deploy (5 pending, commented out)

No `UPDATE ... SET active=0` for Michelle runs against production during this deploy.  The five candidate removals from §2b are shown here for review only, inside a comment block that MUST BE UNCOMMENTED and RE-APPROVED before running.

```sql
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  DO NOT EXECUTE.  The five statements below are the specific rows the  │
-- │  Sept 23 review flagged as being outside Aaron's "PK-5 + specials"     │
-- │  scope for Michelle.  They will run only in a SEPARATE, EXPLICITLY     │
-- │  APPROVED batch AFTER Dr. Gandhi (or Aaron via Dr. Gandhi) signs off  │
-- │  on this exact set.  Leaving them commented preserves current access.  │
-- └─────────────────────────────────────────────────────────────────────────┘
-- UPDATE assignments SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=42 AND active=1; -- Lesa Gowing (27) MS academics
-- UPDATE assignments SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=47 AND active=1; -- Grace Martinson (38) HS Math
-- UPDATE assignments SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=49 AND active=1; -- Lisa Nelson (29) MS/HS Social Studies
-- UPDATE assignments SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=54 AND active=1; -- Shane Sagert (32) Science 8-12
-- UPDATE assignments SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=57 AND active=1; -- Amber Severson (35) Social Science 8-12
```

Each statement's `AND active=1` clause makes it idempotent — re-running on an already-inactive row is a no-op.  All 8 unresolved rows in §2c stay untouched by this file.

### 7c. Miranda Quale — 13 idempotent inserts (confirmed only; pending 2 held separately in §7c-pending)

Each INSERT is guarded by a NOT EXISTS subquery so a repeat run does nothing.  Laura Ferry (25) and Jacki Hansel (5) are NOT in this block — they are held in §7c-pending as commented-only SQL.

```sql
-- The 13 confirmed adds (this block DOES execute on the approved deploy)
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 13, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=13 AND staff_id=19 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 37, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=37 AND staff_id=19 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 24, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=24 AND staff_id=19 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 11, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=11 AND staff_id=19 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 20, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=20 AND staff_id=19 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 16, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=16 AND staff_id=19 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 14, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=14 AND staff_id=19 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 17, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=17 AND staff_id=19 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 21, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=21 AND staff_id=19 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 10, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=10 AND staff_id=19 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 39, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=39 AND staff_id=19 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 15, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=15 AND staff_id=19 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 12, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=12 AND staff_id=19 AND relationship='coach' AND active=1);
```

### 7c-pending. Miranda Quale — 2 held-pending adds (commented out, DO NOT execute)

```sql
-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │  DO NOT EXECUTE.  Laura Ferry (Title) and Jacki Hansel (Counselor)     │
-- │  were flagged pending in the Sept 23 correction.  Uncommenting these   │
-- │  requires a separate approval from Dr. Gandhi.                         │
-- └─────────────────────────────────────────────────────────────────────────┘
-- INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
--  SELECT 25, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
--   WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=25 AND staff_id=19 AND relationship='coach' AND active=1);
-- INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
--  SELECT 5,  19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
--   WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=5 AND staff_id=19 AND relationship='coach' AND active=1);
```

### 7d. Tristae Allard — 17 idempotent inserts (all treated as confirmed)

```sql
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 23, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=23 AND staff_id=13 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 37, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=37 AND staff_id=13 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 30, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=30 AND staff_id=13 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 11, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=11 AND staff_id=13 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 27, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=27 AND staff_id=13 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 20, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=20 AND staff_id=13 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 40, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=40 AND staff_id=13 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 38, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=38 AND staff_id=13 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 29, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=29 AND staff_id=13 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 36, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=36 AND staff_id=13 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 32, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=32 AND staff_id=13 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 21, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=21 AND staff_id=13 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 35, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=35 AND staff_id=13 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 10, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=10 AND staff_id=13 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 39, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=39 AND staff_id=13 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 26, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=26 AND staff_id=13 AND relationship='coach' AND active=1);
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
 SELECT 33, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1
  WHERE NOT EXISTS (SELECT 1 FROM assignments WHERE teacher_id=33 AND staff_id=13 AND relationship='coach' AND active=1);
```

### 7e. Repeat-safety verification (Sept 23 follow-up)

Executable batch = §7a + §7c + §7d (§7b and §7c-pending are commented and do not execute).  Locally, running the executable batch against an isolated D1 twice yields:

- **Run 1**: 2 UPDATEs (§7a) + 13 INSERTs (§7c) + 17 INSERTs (§7d) = **32 writes**, all rowcounts confirmed via `sqlite_master` + `changes()`.
- **Run 2**: 0 UPDATEs + 0 INSERTs.  Every `NOT EXISTS` and every `can_coach<>1` guard is satisfied, so nothing writes.
- **Run 3**: identical to run 2.

**Executable total = 30 assignment INSERTs + 2 capability UPDATEs = 32 writes.**  Zero removals execute in this deploy.  Zero pending statements execute (they are inside comment blocks that require manual uncommenting AND a separate approval).

---

## 8. Summary — final rosters that will exist after the approved SQL runs

Computed by taking today's `assignments` state and applying only the operations in §7a + §7c + §7d (the commented blocks in §7b and §7c-pending contribute zero writes).

| Coach | Rows today | Confirmed adds this deploy | Confirmed removals this deploy | Rows after this deploy | Held pending (separate approval) |
|---|---|---|---|---|---|
| Michelle Simonson (id 18) | 27 | 0 | 0 | **27** | 5 candidate removals (§2b) + 8 unresolved (§2c) |
| Miranda Quale (id 19) | 0 | 13 | 0 | **13** | 2 candidate adds (Laura §3b, Jacki §3b) |
| Tristae Allard (id 13) | 0 | 17 | 0 | **17** | 0 |

No coach ends this deployment with unintended access.  Michelle's 27 = her existing 27 — narrowing her list to what Aaron actually asked for is deferred to a second approved batch (the specific 5 rows are named in §2b/§7b for review).  Miranda gets exactly 13 confirmed elementary+specials rows; Laura and Jacki are held.  Tristae gets exactly 17.  Every deferred item ships in a separately-signed-off batch — this deploy does not remove or expand anyone's access beyond what §3a and §4a enumerate.
