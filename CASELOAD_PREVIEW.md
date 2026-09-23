# Coaching-capability + caseload preview

**Status:** proposal — awaiting Dr. Gandhi's approval before any writes to production
**Branch:** `feature/coaching-capability` (commit at the head of this file's history)
**Never-touched:** every `assignments` row with `relationship='appraiser'`, all `active=0` historical rows

---

## 0. Reading key

| Marker | Meaning |
|---|---|
| **Retain** | Row already exists as `staff_id, teacher_id, 'coach', active=1`. Do NOT re-insert; leave `assn_id` alone. |
| **Add** | No matching row today. Run one INSERT. |
| **Reactivate** | Matching row exists with `active=0`. Run one UPDATE to `active=1` (preserves history). |
| **Remove** | Currently active; proposed to be deactivated. Run one UPDATE to `active=0` (never DELETE). |
| **Unresolved** | Aaron's instructions leave the classification open. Marked ❓ — needs your call before any write. |

**Capability changes** are separate one-line UPDATEs on `users.can_coach` and are listed at the top of each coach who needs one.

Overlap-by-design (Aaron's instructions):
* Grades 4-5 (Ali Schmidt / Terrille Jacobson / Jacee Turcotte) → **all three** coaches
* PE / Art / Music PK-12 (Amy Gaida / Jil Stahosky / Lauralyn Belden) → **all three** coaches

Self-coaching is forbidden by DB CHECK constraint on `coaching_notes` and by the app; any proposal below that would produce a self-link has been dropped and is called out as such.

---

## 1. Michelle Simonson  (id 18, `michelle.simonson@k12.nd.us`)

**Role:** `coach` (unchanged — no capability change needed)
**Aaron's directive:** PK–5 teachers plus specials
**Today:** 27 active `coach` assignments (assn_ids 35, 36, 37, 38, 39, 40, 41, 42, 43, 45, 46, 47, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63)

### 1a. Retain (14 rows)

These are all PK-5 classroom teachers, PK-12 specials, or the ES SPED / Title / Counselor / Interventionist roster we're proposing Michelle keeps.

| assn_id | teacher id | Name | Title |
|---|---|---|---|
| 36 | 13 | Tristae Allard | Kindergarten |
| 37 | 37 | Lauralyn Belden | Music (PK-12) — **overlap with all 3 coaches** |
| 38 | 24 | Kasey Biagioni | Elementary Special Education (see ❓ Q1) |
| 40 | 25 | Laura Ferry | Title (see ❓ Q3) |
| 41 | 11 | Amy Gaida | Physical Education (PK-12) — **overlap with all 3 coaches** |
| 43 | 5 | Jacki Hansel | School Counselor (see ❓ Q4) |
| 45 | 20 | Terrille Jacobson | 4th Grade / Athletic Director — **grades 4–5 overlap** |
| 50 | 16 | Tarynn Nieuwsma | 2nd Grade |
| 52 | 19 | Miranda Quale | Library/Elem STEM/Interventionist (see ❓ Q5 — is this peer coaching?) |
| 53 | 14 | Brianna Ritter | 1st Grade |
| 55 | 17 | MaKenna Sanvik | 3rd Grade |
| 56 | 21 | Ali Schmidt | 4th Grade — **grades 4–5 overlap** |
| 58 | 10 | Jil Stahosky | Art (PK-12) — **overlap with all 3 coaches** |
| 59 | 39 | Jacee Turcotte | 5th Grade — **grades 4–5 overlap** |
| 60 | 15 | Erica Turnquist | 1st Grade |
| 63 | 12 | Ellen Wittmaier | Preschool |

_16 confirmed PK-5 / specials teachers to retain. (Sorry, table is 16 rows — bad summary above; the count IS 16.)_

### 1b. Remove (deactivate) — proposed for Michelle (7 rows)

Secondary-only classroom teachers. Aaron's directive is PK-5 + specials; these are 6-12 core academics.

| assn_id | teacher id | Name | Title | Reason |
|---|---|---|---|---|
| 35 | 23 | Pamela Albright | HS English | 9-12 core |
| 42 | 27 | Lesa Gowing | MS English, Science, Social Studies | 6-8 core |
| 47 | 38 | Grace Martinson | HS Math Instructor | 9-12 core |
| 49 | 29 | Lisa Nelson | MS Social Studies, Math & Sr. Fin Lit | 6-12 core |
| 54 | 32 | Shane Sagert | Science 8-12 | 8-12 core |
| 57 | 35 | Amber Severson | Social Science 8-12 | 8-12 core |
| 62 | 33 | Cathy White | STEM Education 6-12 / FTC Coach | 6-12; ❓ Q1 asks whether STEM counts as a "special" |

### 1c. Add / Reactivate — proposed for Michelle

None. Michelle already coaches everyone on her PK-5 + specials retention list.

### 1d. Unresolved for Michelle (see the Open Questions section at the end)

- **Vicky Bowers** (assn 39, id 30, "MS Interventionist, Math, English") — is she PK-5? MS = 6-8. Currently proposed to **remove**; flag if she should stay as an "intervention" specialist.
- **Martha Walburger** (assn 61, id 26, "FACS and MS") — FACS often PK-12 with heavy MS/HS. Currently proposed to **remove**; flag if she should stay.
- **Jason Kuhn** (assn 46, id 40, "Industrial Arts", grade_band=9-12) — currently proposed to **remove**; ❓ Q1 asks whether Industrial Arts counts as a "special" for Michelle/Miranda.
- **Jena Peterson** (assn 51, id 36, "6-12 Special Education") — SPED is not automatically the same as "specials." Currently proposed to **remove** for Michelle; Tristae's caseload asks whether Jena moves there (❓ Q2).

_These four are TENTATIVELY placed in the Remove list above (rows for Vicky/Martha/Jason/Jena included), but they're the ones I'm least sure of; please review before I run the writes._

### 1e. Net effect on Michelle after your approval

* Capability: unchanged (still `role='coach'`).
* Coach caseload: **27 → 16** teachers, all PK-5 or PK-12 specials (with 3 open questions above that could nudge that number to 17-20).
* Appraiser relationships: none for Michelle (she is not an appraiser).

---

## 2. Miranda Quale  (id 19, `miranda.quale@k12.nd.us`)

**Role:** `teacher` (KEEP — do not change).
**Capability change:** `UPDATE users SET can_coach=1 WHERE id=19` — one row, additive.
**Aaron's directive:** PK–5 teachers plus specials.
**Today:** 0 active `coach` assignments (clean slate).
**Untouched:** appraiser row 23 (Miranda's principal is AJ Allard) stays as-is; Michelle's coach row 52 (Miranda IS a coachee of Michelle) stays as-is unless you say otherwise.

### 2a. Add (proposed insertions)

All are NEW rows (no historical `active=0` row exists for `staff_id=19` on these teachers).

| teacher id | Name | Title | Note |
|---|---|---|---|
| 13 | Tristae Allard | Kindergarten | **BUT wait** — Tristae herself is a coach on this list; check ❓ Q6. If she stays a coachee of Miranda, this is fine (they are peers coaching each other's teachers in different subsets). |
| 37 | Lauralyn Belden | Music (PK-12) | **overlap with all 3 coaches** |
| 24 | Kasey Biagioni | Elementary Special Education | see ❓ Q1 |
| 25 | Laura Ferry | Title | see ❓ Q3 |
| 11 | Amy Gaida | Physical Education (PK-12) | **overlap with all 3 coaches** |
| 5 | Jacki Hansel | School Counselor | see ❓ Q4 |
| 20 | Terrille Jacobson | 4th Grade / Athletic Director | **grades 4-5 overlap** |
| 16 | Tarynn Nieuwsma | 2nd Grade | |
| 14 | Brianna Ritter | 1st Grade | |
| 17 | MaKenna Sanvik | 3rd Grade | |
| 21 | Ali Schmidt | 4th Grade | **grades 4-5 overlap** |
| 10 | Jil Stahosky | Art (PK-12) | **overlap with all 3 coaches** |
| 39 | Jacee Turcotte | 5th Grade | **grades 4-5 overlap** |
| 15 | Erica Turnquist | 1st Grade | |
| 12 | Ellen Wittmaier | Preschool | |

**Self-assignment forbidden:** the natural next entry would be Miranda's own teacher record (id 19). We do NOT add it; the DB CHECK on `assignments`… actually the current `assignments` schema does not have a CHECK preventing self-assignment, but the coach helper (`requireCoachAssignment` in `src/lib/access.ts`) rejects `user.id === teacherId`. **We simply don't propose it here.**

**Excluded on purpose:** Miranda herself (id 19).

### 2b. Reactivate — none.
### 2c. Remove — none (Miranda has no active coach rows today).
### 2d. Retain — n/a.

### 2e. Net effect on Miranda after your approval

* `role`: unchanged (still `teacher`).
* `can_coach`: `0 → 1`.
* Coach caseload as staff: **0 → 15** teachers (subject to ❓ Q1/Q3/Q4/Q6 adjustments).
* Appraiser row 23 (AJ Allard is her principal): unchanged.
* Michelle's coach row 52 (Michelle continues to coach Miranda): unchanged — needs your explicit OK if you want it removed.
* All observations, feedback_items, focus_areas, PD enrollments, PD credit for teacher_id=19: unchanged.

---

## 3. Tristae Allard  (id 13, `tristae.allard@k12.nd.us`)

**Role:** `teacher` (KEEP — do not change; kindergarten identity intact).
**Capability change:** `UPDATE users SET can_coach=1 WHERE id=13` — one row, additive.
**Aaron's directive:** Grades 4–12 teachers plus specials.
**Today:** 0 active `coach` assignments as staff (clean slate).
**Untouched:** appraiser row 4 (Tristae's principal is AJ Allard) stays as-is; Michelle's coach row 36 (Tristae is Michelle's coachee) stays as-is unless you say otherwise; the historical `active=0` row for Jacki Hansel coaching Tristae (assn 11) is left as `active=0`.

### 3a. Add (proposed insertions)

| teacher id | Name | Title | Note |
|---|---|---|---|
| 23 | Pamela Albright | HS English | grade 9-12 |
| 37 | Lauralyn Belden | Music (PK-12) | **overlap with all 3 coaches** |
| 30 | Vicky Bowers | MS Interventionist, Math, English | grades 6-8 |
| 11 | Amy Gaida | Physical Education (PK-12) | **overlap with all 3 coaches** |
| 27 | Lesa Gowing | MS English, Science, Social Studies | grades 6-8 |
| 20 | Terrille Jacobson | 4th Grade / Athletic Director | **grades 4-5 overlap** |
| 40 | Jason Kuhn | Industrial Arts (grade_band=9-12) | grades 9-12; see ❓ Q1 |
| 38 | Grace Martinson | HS Math Instructor | grades 9-12 |
| 29 | Lisa Nelson | MS Social Studies, Math & Sr. Fin Lit | grades 6-12 |
| 36 | Jena Peterson | 6-12 Special Education | see ❓ Q2 |
| 32 | Shane Sagert | Science 8-12 | grades 8-12 |
| 21 | Ali Schmidt | 4th Grade | **grades 4-5 overlap** |
| 35 | Amber Severson | Social Science 8-12 | grades 8-12 |
| 10 | Jil Stahosky | Art (PK-12) | **overlap with all 3 coaches** |
| 39 | Jacee Turcotte | 5th Grade | **grades 4-5 overlap** |
| 26 | Martha Walburger | FACS and MS | grades 6-12 |
| 33 | Cathy White | STEM Education 6-12 / FTC Coach | grades 6-12 |

**Self-assignment forbidden:** Tristae herself (id 13) is Kindergarten (PK). She would not be in a grades-4-12 caseload anyway, so this is a natural exclusion. Explicitly excluded.

### 3b. Reactivate — none (the `active=0` Jacki Hansel row is Jacki-coaching-Tristae, not Tristae-coaching-anyone).
### 3c. Remove — none (Tristae has no active coach rows today).
### 3d. Retain — n/a.

### 3e. Net effect on Tristae after your approval

* `role`: unchanged (`teacher`, Kindergarten identity preserved).
* `can_coach`: `0 → 1`.
* Coach caseload as staff: **0 → 17** teachers (subject to ❓ Q1/Q2 adjustments).
* Appraiser row 4 (AJ Allard is her principal): unchanged.
* Michelle's coach row 36 (Michelle continues to coach Tristae): unchanged — needs your explicit OK if you want it removed.
* Kindergarten records, PD hours, and observations for teacher_id=13: unchanged.

---

## 4. Overlap sanity check

Every teacher Aaron flagged as an intentional overlap appears under multiple coaches:

| Teacher id | Name | Michelle | Miranda | Tristae |
|---|---|---|---|---|
| 21 | Ali Schmidt (4th) | ✓ | ✓ | ✓ |
| 20 | Terrille Jacobson (4th/AD) | ✓ | ✓ | ✓ |
| 39 | Jacee Turcotte (5th) | ✓ | ✓ | ✓ |
| 11 | Amy Gaida (PE PK-12) | ✓ | ✓ | ✓ |
| 10 | Jil Stahosky (Art PK-12) | ✓ | ✓ | ✓ |
| 37 | Lauralyn Belden (Music PK-12) | ✓ | ✓ | ✓ |

Multiple active coach rows on the same teacher work correctly (per `assignments` schema — the PK is (id), not (teacher_id, staff_id)). Each coach only sees THEIR OWN coaching notes on the shared teacher (per-coach isolation was tested in Case 3 of the acceptance suite).

---

## 5. Untouched: appraiser assignments

Every `relationship='appraiser'` row remains as-is. This preview only affects `relationship='coach'` rows and the `users.can_coach` column. AJ Allard (id 4) continues to appraise Miranda (assn 23) and Tristae (assn 4). This preview does **not** change AJ's principal access in any way — including his own "Mass Media" teaching role, which the instructions specifically called out.

---

## 6. Open questions I need your explicit call on before writing anything

**Q1. Do STEM (secondary), FACS, and Industrial Arts count as "specials" for Michelle and Miranda?**
Affected today: Cathy White (STEM 6-12, id 33), Martha Walburger (FACS+MS, id 26), Jason Kuhn (Industrial Arts 9-12, id 40).
Current tentative placement: **Michelle → remove; Miranda → not added; Tristae → add** (fits her 4-12+specials brief). If you want them treated as specials for Michelle/Miranda too, we insert (Michelle keeps them, add Miranda→each).

**Q2. Kasey Biagioni (Elementary SPED, id 24) and Jena Peterson (6-12 SPED, id 36) — do they get all three coaches?**
Aaron said "Special education and specials are separate categories; do not infer one from the other." So the default is:
* Kasey (elementary) → Michelle ✓, Miranda ✓, Tristae ✗ (Tristae is grades 4-12; K-3 SPED is outside her brief).
* Jena (6-12) → Michelle ✗ (not PK-5), Miranda ✗ (not PK-5), Tristae ✓ (fits 4-12).
Does that match your intent, or do you want Kasey to also appear under Tristae (grades 4-5 SPED could be inside her range)?

**Q3. Laura Ferry (Title, id 25) — grade coverage?**
Title I typically PK-5 in this district. Currently: Michelle ✓, Miranda ✓ ("plus specials" — interventionist-style), Tristae ✗. Confirm.

**Q4. Jacki Hansel (School Counselor, id 5) — grade coverage?**
Counselor is often K-12. Currently: Michelle ✓, Miranda ✓, Tristae ✗. If she's truly K-12, Tristae should also be added.

**Q5. Miranda's "Library / Elem STEM / Interventionist" role AND Michelle's Interventionist / Instructional-Coach role — peer-coaching conflicts?**
Miranda (id 19) is one of Michelle's coachees today (assn 52). Under Aaron's directive Miranda is now also a coach herself. Two decisions to confirm:
1. Does Michelle keep coaching Miranda? (currently: yes, no change proposed.)
2. Should Miranda coach any of her Elem-STEM / Library peers? The natural candidates are Cathy White (STEM 6-12) and Kasey Biagioni (Elem SPED); STEM overlap is covered by Q1.
No self-links are proposed either way.

**Q6. Michelle continuing to coach Tristae + Miranda?**
Currently: Michelle's assignments 36 (Tristae) and 52 (Miranda) are marked "retain." Both are now coaches themselves; you might want Michelle to STOP coaching her peers. Say the word and I'll flip both to `active=0`.

**Q7. AJ Allard (id 4) — mass-media teaching role.**
Aaron flagged: "AJ Allard's Mass Media teaching role must not cause a change to his principal access." No change to any `appraiser` row involving AJ (id 4) is proposed in this preview. He remains an appraiser for teachers 13, 19, and everyone else on his existing list. The only place AJ's teaching role would matter is if you also wanted him to appear as a coachee somewhere — which is not on Aaron's list, so no proposal.

---

## 7. Approval-ready SQL (for after you sign off)

I have NOT executed any of these yet. When approved, they run as-is in this order:

```sql
-- Capability grants (2 rows)
UPDATE users SET can_coach = 1, updated_at = CURRENT_TIMESTAMP WHERE id IN (13, 19);

-- Michelle Simonson removals (proposed 7 rows; edit list per Q1/Q2 answers)
UPDATE assignments SET active = 0 WHERE id IN (35, 42, 47, 49, 54, 57, 62);
-- Plus tentative extras subject to Q1/Q2: 39, 46, 51, 61 (Vicky/Jason/Jena/Martha)

-- Miranda Quale additions (proposed 15 rows; edit list per Q1/Q3/Q4)
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
VALUES
  (13, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (37, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (24, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (25, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (11, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  ( 5, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (20, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (16, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (14, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (17, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (21, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (10, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (39, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (15, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (12, 19, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1);

-- Tristae Allard additions (proposed 17 rows; edit list per Q1/Q2)
INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
VALUES
  (23, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (37, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (30, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (11, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (27, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (20, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (40, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (38, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (29, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (36, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (32, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (21, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (35, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (10, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (39, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (26, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1),
  (33, 13, 'coach', (SELECT id FROM school_years WHERE is_current=1), 1);
```

`school_year_id` is looked up at run-time so the writes stay correct if the current year has advanced. `active=1` is written explicitly for clarity. No `id` is asserted — SQLite auto-assigns from `sqlite_sequence`.

The two UPDATE / three INSERT batches are idempotent by their pattern: an INSERT that duplicates an already-active row would violate no unique constraint, but running the script twice is not planned (I'll run it once, log the write count per statement, and verify).

Nothing else in this file executes writes; every command lives here for your review only.
