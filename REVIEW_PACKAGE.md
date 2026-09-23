# Coaching-capability change — reviewable package

**Awaiting Dr. Gandhi's approval before ANY production write.**

Nothing in this package has been deployed. Production is still at commit `64a12ca` and the production D1 is untouched.

---

## 1. Final commit and preview

| Field | Value |
|---|---|
| Feature branch | `feature/coaching-capability` |
| Latest commit | `08e9541` (chore: apply ChatGPT review corrections + comprehensive acceptance suite) |
| Prior commit on branch | `cca1e2a` (feat: initial coaching-capability build) |
| Base commit (main) | `64a12ca` (fix(prose): guard the mini-renderer against an infinite loop) |
| GitHub | https://github.com/RupakGandhi/alexander-marshall-growth/tree/feature/coaching-capability |
| **Isolated preview URL** | **https://3000-iz4zjax2wz4mwitsuv97o-b9b802c4.sandbox.novita.ai/login** |
| Preview data | Synthetic fixture (12 users, 13 assignments, 1 observation, 1 pd_enrollment) — **NOT a copy of production** |
| Preview credentials | All test accounts use `TestPass1!`. Emails in `tests/fixture.mjs` (`principal@test`, `pure.coach@test`, `coach1@test`, `coach2@test`, `alice@test`, etc.) |
| Preview scope | This URL is a running instance of the feature branch backed by the synthetic fixture — perfect for click-testing without touching production. |

The preview stays alive for at least the next 60 minutes of activity; poke me if it goes cold and I'll re-request.

---

## 2. What ships with this branch

### 2a. New files

| File | Purpose |
|---|---|
| `migrations/0012_coaching_capability.sql` | additive: `users.can_coach`, `coaching_notes`, `coaching_note_audit` |
| `migrations/0013_coaching_note_idempotency.sql` | additive: `client_token` (per-form UUID) + `version` (optimistic lock) on `coaching_notes` |
| `src/lib/access.ts` | central helpers: `hasCoachAccess`, `isTeacherCoach`, `requireCoachAssignment` |
| `tests/fixture.mjs` | synthetic isolated fixture (not the production snapshot) |
| `tests/prose.test.mjs` | 20 Prose renderer assertions |
| `tests/acceptance.mjs` | 77 HTTP-level acceptance assertions |
| `CASELOAD_PREVIEW.md` | named before/after caseload proposal with 7 open questions |

### 2b. Modified files (relative to `main` at `64a12ca`)

| File | Change |
|---|---|
| `src/lib/auth.ts` | `requireCoachAccess()` middleware; `getCurrentUser` exported |
| `src/lib/layout.tsx` | `navItems` takes `User`; teacher-coaches get "My Coaching" + "PD Review" appended |
| `src/lib/pd.ts` | `submitDeliverable` recipient SQL includes teacher-coaches; URL fixed to `/pd/review/:id`; `recommendModule` takes explicit `actorLabel` |
| `src/lib/prose.tsx` | linear-time fix for pipe-run rescan (381 ms → 29 ms on 2048 rows) |
| `src/lib/types.ts` | `can_coach?: number` on `User` |
| `src/routes/admin.tsx` | can_coach toggle in create/edit; coaching_notes anchor in hard-delete guard; Assignments coach picker includes teacher-coaches |
| `src/routes/coach.tsx` | `requireCoachAccess` + `requireCoachAssignment` gates; note CRUD with idempotency + atomicity + R3 shared-save; UI section |
| `src/routes/pd.tsx` | `requiredRelationshipsFor` + `authorizedForTeacher`; guard on `/pd/review/:id/assign`; queue scoping by relationship |
| `src/routes/profile.tsx` | notification kinds is UNION for teacher-coaches |
| `src/routes/reports.tsx` | Observation exports: coach-of-others scrubs scores; teacher self-view keeps them. PD family: relationship-aware scoping + `source_score_level` scrub in `/reports/pd`, `.csv`, and `/pd/:id` drill-down |
| `src/routes/teacher.tsx` | read-only "Non-evaluative coaching feedback" section on teacher home |
| `package.json` | `better-sqlite3` as `devDependency` (test-only) |

`dist/_worker.js` size: 648.37 kB (up from 623 kB pre-branch — an increase of 25 kB, entirely from new routes + view code).

---

## 3. Migration plan

Two additive migrations, in order:

```
0012_coaching_capability.sql
  ALTER TABLE users ADD COLUMN can_coach INTEGER NOT NULL DEFAULT 0;
  CREATE TABLE coaching_notes ( … CHECK author_id <> teacher_id );
  CREATE TABLE coaching_note_audit ( … );
  CREATE INDEX idx_coaching_notes_author_teacher …;
  CREATE INDEX idx_coaching_notes_teacher_shared …;
  CREATE INDEX idx_coaching_note_audit_note …;

0013_coaching_note_idempotency.sql
  ALTER TABLE coaching_notes ADD COLUMN client_token TEXT;
  ALTER TABLE coaching_notes ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
  CREATE UNIQUE INDEX uq_coaching_notes_author_token
    ON coaching_notes (author_id, client_token) WHERE client_token IS NOT NULL;
```

Both are strictly additive. Neither drops or alters any existing column, neither touches any existing table, and both leave production data untouched. Running order matters (0013 references `coaching_notes`).

Production apply command (waiting for approval — DO NOT RUN yet):

```
npx wrangler d1 migrations apply alexander-marshall-growth-production --remote
```

Wrangler is migration-history-aware: it applies only rows in `d1_migrations` that aren't already present, so re-running after a partial apply is safe.

---

## 4. Test results

### 4a. Prose regression (`node tests/prose.test.mjs`) — 20 / 20 pass

Lone pipe rows, valid tables, blank-separated rows, bullets, numbered lists, CRLF, 40 KB pasted feedback, literal markup safety (no `<script>` node produced), 2,048 separator-only rows (29 ms — the linear-time fix), empty/null inputs, inline bold in table cells.

### 4b. Acceptance (`node tests/acceptance.mjs`) — 77 / 77 pass on isolated LOCAL D1

| Case | Coverage | Assertions |
|---|---|---|
| 1  | Pure coach retains coach experience; teacher-coaches have BOTH workspaces | 7 |
| 2  | Ordinary teachers blocked from coach routes; per-target checks enforce assignment; overlaps work | 8 |
| 3  | Draft saves survive; sharing produces one visible entry + one notification; per-coach isolation | 12 |
| 3b | Concurrent-share race: 5 parallel requests → 1 winner, 4 graceful losers, 1 notification | 4 |
| 3c | Idempotency on CREATE: 3 identical-token parallel creates → 1 row | 2 |
| 4  | Author-ownership on edits; unassigned-teacher POSTs refused; self-coach refused; coach cannot export scores; teacher-coach CAN export own scores | 5 |
| 5  | Coaching feedback creates 0 observations / 0 scores / 0 focus areas / 0 pd_enrollments / 0 deliv_scores | 6 |
| 6  | Recipient notification link loads; teacher-coach appears in PD-submit recipient list; bundle has no broken `/appraiser/pd/review/` URL | 5 |
| 7  | Report leaks & permissions: PureCoach cannot see `source_score_level` on HTML or CSV; Principal still can; drill-down authz respects `relationship='coach'` for coaches | 8 |
| 8  | Revoked capability → 403 next request; historical notes preserved; teacher retains shared feedback | 3 |
| 9  | Hard-delete guard soft-deletes any user with coaching_notes history; row + notes preserved | 5 |
| 10 | Preserved teacher records/hours for a teacher-coach; her `/reports/pd` shows own + coachee PD; source_score_level scrubbed on coachee row | 4 |
| 11 | Shared entries reject `draft_save` action with a 302 + message; content preserved | 3 |
| 12 | `shared_save` with blank content is refused; original content stays intact | 3 |

**Root-caused socket flake:** the previous run's failure at "Case 5" was NOT a product bug. `execSync('npx wrangler d1 execute ...')` inside an HTTP burst forked a full wrangler process for each DB probe; the wrangler dev server's parent PM2 shares fd space and the rapid subprocess churn dropped sockets. The current suite replaces every DB probe with a direct `better-sqlite3` read of the local D1 file — no subprocess, no socket contention. Full run completes in 2.4 s.

### 4c. Build — clean

`vite build` produces `dist/_worker.js  648.37 kB` in ~2.3 s, no warnings, 65 modules.

---

## 5. Preservation checks

Nothing pre-existing changes on the branch. Explicitly verified:

* **`users.role`** — never rewritten by any new code path. Miranda and Tristae remain `role='teacher'`.
* **`assignments` where `relationship='appraiser'`** — untouched by any new handler and untouched by any proposed script in `CASELOAD_PREVIEW.md`.
* **`observations`, `observation_scores`, `feedback_items`, `focus_areas`, `pd_enrollments`, `pd_deliverables`, `pd_deliverable_scores`, `external_pd_submissions`, credited hours** — Case 5 in the acceptance suite explicitly counts rows before and after a coaching-note flow and asserts every count is unchanged.
* **Existing `role='coach'` behavior** — Case 1 verifies PureCoach reaches `/coach` and sees the caseload she saw pre-change.
* **Existing notification kinds** — no kind was renamed, deprecated, or repurposed. `coach_note` is reused for the coaching-feedback share (its declared description already matched: "Your instructional coach left a note or resource").
* **Existing URLs** — no route was removed. New routes: `POST /coach/teachers/:id/notes` and `POST /coach/teachers/:teacherId/notes/:noteId/update`. All pre-existing URLs continue to work.
* **User notification preferences** — never reset. The profile page widens the SET of kinds shown for teacher-coaches; existing rows in `notification_preferences` are untouched. Case 8 confirms revoked capability doesn't wipe history or preferences.

---

## 6. Super-admin support permissions

For a **super_admin** user (`role='super_admin'`):

| Coaching-notes surface | View | Create | Edit | Share | Delete |
|---|:---:|:---:|:---:|:---:|:---:|
| Draft (any author, any teacher) | ✅ | ✅ (as super_admin) | ✅ | ✅ | ❌ (no delete endpoint) |
| Shared (any author, any teacher) | ✅ | ✅ (as super_admin) | ✅ | n/a already shared | ❌ (no delete endpoint) |

* The list query in `/coach/teachers/:id` branches on role: `super_admin` gets EVERY note on the teacher (both author's own and other coaches'); every other viewer gets `author_id = viewer.id` filtered.
* The edit-form ownership check accepts `super_admin` OR the original author.
* There is **no permanent-delete endpoint for coaching notes.** A super_admin cannot delete a note; nobody can. The hard-delete-user guard rejects deletion of any user with coaching-note history and downgrades to a soft delete, keeping the notes in the DB.
* Super-admin write actions do write audit rows tagged with the super_admin's `actor_id`, so any support intervention is discoverable in `coaching_note_audit`.

If you want a narrower scope for super_admin (e.g. view-only), say so and I'll change the ownership check to `existing.author_id === user.id` only.

---

## 7. Non-destructive rollback plan

**Rollback preserves every coaching note authored between deploy and rollback.** No DROP statements, no data loss.

Step | Action | Effect
--- | --- | ---
1 | `git revert 08e9541 cca1e2a` on `main` and deploy the revert to Cloudflare Pages | Application code returns to pre-launch behavior. Teacher-coaches lose the "My Coaching" and "PD Review" nav; the `/coach/*` routes stop reading/writing `coaching_notes`; teacher home stops rendering the coaching-feedback section. Everything else — teacher records, observations, PD hours, appraiser gate, evaluator feedback rendering — is unchanged.
2 | **Leave** migrations 0012 and 0013 applied. **Leave** `users.can_coach`, `coaching_notes`, `coaching_note_audit`, and their indexes in the DB. | Historical coaching notes are preserved but simply unreachable via UI. If you later reverse the rollback, they become visible again with zero data recovery work.
3 | (Optional; only if you want to explicitly disable capability without a re-deploy) | `UPDATE users SET can_coach=0;` — hides teacher-coach nav even if code is present. Non-destructive.
4 | (Last resort — DO NOT DO by default) | `DROP TABLE coaching_note_audit; DROP TABLE coaching_notes; ALTER TABLE users DROP COLUMN can_coach;` — this WOULD delete every note and every audit row. Requires an explicit backup first. Documented for completeness, not recommended.

Rollback command matrix:

* **Revert code only, keep data:** `git revert 08e9541 cca1e2a && wrangler pages deploy dist`
* **Revert capability only, keep everything:** `wrangler d1 execute ... --remote --command="UPDATE users SET can_coach=0"`
* **Full teardown (destructive, requires backup):** see step 4 above.

The migration 0012 header contains this same rollback runbook so an operator finding just the SQL file has the full context.

---

## 8. Caseload preview (Section 6)

See `CASELOAD_PREVIEW.md` for the full named diff. Summary:

| Coach | Retain | Add | Reactivate | Remove | Unresolved |
|---|---|---|---|---|---|
| Michelle Simonson (id 18, `role='coach'`) | 16 | 0 | 0 | 7 (+4 tentative) | 4 (Vicky Bowers, Martha Walburger, Jason Kuhn, Jena Peterson — depends on Q1/Q2) |
| Miranda Quale (id 19, `can_coach` → 1) | — | 15 | 0 | 0 | subject to Q1/Q3/Q4/Q6 |
| Tristae Allard (id 13, `can_coach` → 1) | — | 17 | 0 | 0 | subject to Q1/Q2 |

**Open questions requiring your explicit decision** (full details in `CASELOAD_PREVIEW.md` §6):

1. Do secondary STEM, FACS, and Industrial Arts count as "specials" for Michelle and Miranda?
2. Kasey Biagioni (Elementary SPED) and Jena Peterson (6-12 SPED) — do they get all three coaches?
3. Laura Ferry's Title grade coverage — PK-5 only?
4. Jacki Hansel's counselor coverage — is she K-12 (in which case Tristae adds her)?
5. Miranda's / Michelle's peer-coaching potential — should Miranda coach any of her Library/Elem STEM peers, and if so are there any 4-5 SPED cases Tristae should also cover?
6. Should Michelle continue to coach Miranda and Tristae now that they're coaches themselves?
7. AJ Allard's Mass Media teaching role — confirmed as no-change to any `appraiser` row (already documented as untouched).

Every proposed SQL statement is listed at the bottom of `CASELOAD_PREVIEW.md` §7. None is executed yet.

---

## 9. What happens on your approval

I will execute (in this order):

1. `npx wrangler d1 migrations apply alexander-marshall-growth-production --remote` (applies 0012 + 0013)
2. `npx wrangler pages deploy dist --project-name alexander-marshall-growth --branch main --commit-dirty=true` after merging `feature/coaching-capability` into `main`
3. The final approved caseload SQL from `CASELOAD_PREVIEW.md` §7 — as ONE explicit statement per row so you can see the write count returned per statement in the log
4. Send you a post-deploy report with the production commit hash, applied migration IDs, per-row write counts, and preservation-check diffs (observations count, feedback_items count, credited hours per teacher, appraiser rows count — all before and after)

I will NOT:

* Merge to `main` before your approval
* Deploy to production before your approval
* Apply migrations to production before your approval
* Insert/update any assignments row before your approval
* Change users.can_coach on any production account before your approval
* Create the facilitator guide before your independent re-test

If your review turns up more corrections, they land in a new commit on the same branch and this document is rebuilt.
