# Coaching-capability change — reviewable package (Sept 23, 2026 revised)

**Awaiting Dr. Gandhi's approval before ANY production write.**

Nothing here has been deployed or applied to production. `main` is at commit `64a12ca`; production D1 is untouched.

---

## 1. Final commit and preview

| Field | Value |
|---|---|
| Feature branch | `feature/coaching-capability` |
| Latest commit | (see `git log` — pushed with this doc) |
| Base commit (main) | `64a12ca` |
| GitHub | https://github.com/RupakGandhi/alexander-marshall-growth/tree/feature/coaching-capability |
| **Isolated preview URL** | **https://3000-iz4zjax2wz4mwitsuv97o-b9b802c4.sandbox.novita.ai/login** |
| Preview data | Synthetic fixture (12 users, 13 assignments, 2 observations, 2 pd_enrollments) — **NOT a copy of production** |
| Preview credentials | All test accounts: `TestPass1!`. Emails in `tests/fixture.mjs` (`principal@test`, `pure.coach@test`, `coach1@test`, `coach2@test`, `alice@test`, etc.) |
| Preview scope | Backed by the synthetic fixture; useful for click-testing without touching production |
| Total test assertions | **169 pass / 0 fail** (20 Prose + 137 HTTP acceptance + 12 Playwright browser) |

---

## 2. Corrections applied vs the last review (`f52c572`)

Every ChatGPT finding is resolved on this branch and independently verified in the test suite.

| # | Correction | Where fixed | Proof |
|---|---|---|---|
| 1 | First-time direct-share must create row + audit + notification | `src/routes/coach.tsx` — RETURNING-based distinction between fresh insert vs. ON CONFLICT retry; audit written as D1 batch | **Case 13** — fresh POST with `_action=share` creates exactly 1 row, audit `[create,share]`, exactly 1 notification. Same token retry adds 0 rows and 0 notifications. Verified in the browser as well (Case 1 of the browser suite): the toast reads "Shared with teacher" (never "Already shared" on first attempt). |
| 2 | Date-only fields must not shift through TZ conversion | `src/lib/ui.ts` — `formatDate()` short-circuits on `YYYY-MM-DD` shape and builds display string from integer parts; no `new Date()` for pure date values | **Case 13** asserts both coach view and teacher view render `Sep 22, 2026` for `occurred_on=2026-09-22`; **Browser Cases 1 & 2** confirm the same in real Chromium. |
| 3 | Note + audit atomic; truthful notification-status message; safe recovery path | `src/routes/coach.tsx` — every mutation branch runs the primary UPDATE and any audit write via `db.batch()`; the misleading "notification delivery is retrying" copy is gone; new endpoint `POST .../notify-retry` idempotently re-sends; a **badge + Resend button** appears on any shared note whose notification hasn't landed | **Case 14** — force-delete the notification row, verify the coach view shows the "Notification not delivered" badge, hit notify-retry, verify exactly one notification lands, hit again → "already delivered" no-op. Truthful message copy verified in-source. |
| 4 | Caseload doc and executable SQL must agree; SQL must be repeat-safe; unresolved kept separate; no unsupported quotes/inferences | `CASELOAD_PREVIEW.md` rewrite | Final rosters and counts in §8 are derived directly from the operations in §7; every INSERT is `... WHERE NOT EXISTS (...)`; every UPDATE has an `AND ... <> ...` idempotency guard. Repeat-safety verified by running the pattern three times against local D1: run 1 = 1 change, runs 2 & 3 = 0 changes. Michelle keeps her Miranda/Tristae links per Dr. Gandhi Sept 23; Kasey → Michelle+Miranda; Jena → Tristae; STEM/FACS/IA + Title + Counselor **held pending**. |
| 5 | Fill material verification gaps | `tests/fixture.mjs` seeds a teacher-coach (CoachOne, id=4) with a published+acknowledged observation, one score, one feedback item, and one VERIFIED PD enrollment with 3.5 credited hours. Acceptance suite reads pre/post values and asserts they're unchanged. Real PD-submit flow exercised. Recipient-link check requires HTTP 200 (never 404). Prefs / revocation / delete-with-history / delete-without-history all covered. Browser suite covers date rendering, phone viewport, keyboard access. | **Case 10** — CoachOne's status='acknowledged' → 'acknowledged', hours 3.5 → 3.5, score level 3 → 3 after her coaching activity. **Case 6** — real Bob-submits-PD → all three supervisors get exactly one `pd_deliverable_submitted` notification with URL `/pd/review/200`; each can access that URL with HTTP 200; CoachThree (no assignment) gets 403 (not 404 or 200). **Case 16** — prefs merged for teacher-coach, revocation of assignment → 403 next request, historical notes preserved, teacher retains shared feedback. **Case 17** — Alice hard-delete falls back to soft-delete with all inbound coaching notes preserved; PlainTeacher (no history) hard-deletes fully. **Browser cases** — phone 390×844 no overflow, Save-draft + Share-with-teacher reachable via Tab. |
| 6 | Rollback runbook: no DROP; preserve delete guard; only reset touched can_coach values | `migrations/0012_coaching_capability.sql` header rewrite | The runbook now names the delete-guard preservation requirement explicitly, gives the exact `UPDATE users SET can_coach=0 WHERE id IN (13, 19)` command (never blanket), and warns against a plain `git revert` that would remove the guard. The optional DROP block is removed from the runbook and called out as a distinct, separately-approved operation. |
| 7 | Super-admin view-only on coaching notes | `src/routes/coach.tsx` — new `refuseSuperAdminWrite()` guard on all three write endpoints; edit form no longer renders for super_admin; new-note form is replaced by a "view-only support" banner; ownership check for updates is author-only now | **Case 15** — admin can VIEW the coach page but POSTs to `/notes`, `/notes/:id/update`, `/notes/:id/notify-retry` all return HTTP 403. New-note form is absent from the admin's rendered page. Note version stays unchanged after admin write attempts. UI banner says: "Super-admin support view. You can see this coach's entries but cannot author, edit, share, or resend notifications for them." Same disclosure on the visibility paragraph: "Drafts are visible to you and to platform support (Super Administrator, view-only)". |

---

## 3. What ships with this branch (new/modified since `f52c572`)

| File | Change |
|---|---|
| `src/routes/coach.tsx` | RETURNING-based fresh-vs-retry, atomic batch writes, truthful notification copy, `notify-retry` endpoint, "Notification not delivered" badge + Resend button, super-admin view-only enforcement, view-only banner + disclosure text |
| `src/lib/ui.ts` | `formatDate()` short-circuits on `YYYY-MM-DD` shape (no TZ conversion) |
| `migrations/0012_coaching_capability.sql` | Rollback runbook rewrite (no DROP; delete-guard preservation; scoped can_coach reset) |
| `tests/fixture.mjs` | Adds a full teacher-coach with observation + score + feedback + verified PD + 3.5 credited hours |
| `tests/acceptance.mjs` | Cases 13-17 (direct-share, notify-retry, super-admin view-only, prefs/revocation, delete-with-and-without-history) plus tightening: PD-submit recipient link must return 200 (never 404) |
| `tests/browser.mjs` | New Playwright suite (12 assertions): desktop direct-share, teacher-view date, shared-entry single action, phone viewport, keyboard access |
| `CASELOAD_PREVIEW.md` | Full rewrite. Counts derived from operations; idempotent SQL; pending kept separate; Kasey→Michelle+Miranda, Jena→Tristae, Michelle keeps Miranda+Tristae |
| `REVIEW_PACKAGE.md` | This doc |
| `package.json` | `playwright` added as devDependency (`better-sqlite3` from earlier round) |

Build: `dist/_worker.js` = 652.26 kB, clean.

---

## 4. Migration plan (unchanged)

Two additive migrations, in order:

```
0012_coaching_capability.sql
  ALTER TABLE users ADD COLUMN can_coach INTEGER NOT NULL DEFAULT 0
  CREATE TABLE coaching_notes (…)
  CREATE TABLE coaching_note_audit (…)
  3 indexes

0013_coaching_note_idempotency.sql
  ALTER TABLE coaching_notes ADD COLUMN client_token TEXT
  ALTER TABLE coaching_notes ADD COLUMN version INTEGER NOT NULL DEFAULT 1
  UNIQUE INDEX uq_coaching_notes_author_token ON (author_id, client_token) WHERE client_token IS NOT NULL
```

Production apply command (waiting for approval):

```
npx wrangler d1 migrations apply alexander-marshall-growth-production --remote
```

---

## 5. Test results — completed vs untested, called out separately

### 5a. COMPLETED — automated coverage (169 pass / 0 fail)

**Prose renderer (20 assertions):** lone pipe rows, valid tables, blank-separated rows, bullets, numbered lists, CRLF, 40 KB pasted feedback, literal markup safety, 2,048 separator-only rows (29 ms — linear-time confirmed), empty/null, table cell inline bold.

**HTTP acceptance (137 assertions across 17 cases):**

| Case | What it proves |
|---|---|
| 1 | Michelle retains coach experience; teacher-coaches have both workspaces |
| 2 | Ordinary teachers blocked from coach routes; per-target checks enforce assignment; overlapping caseloads |
| 3 | Draft saves survive; sharing → one visible entry + one notification; per-coach isolation on same teacher |
| 3b | Concurrent share race (5-parallel) → 1 winner, 4 graceful losers, exactly 1 notification |
| 3c | Idempotent CREATE with same token (3-parallel) → 1 row |
| 4 | Author-ownership on edits; altered POST targets refused; self-coach refused; coach cannot export scores; teacher-coach CAN export own scores |
| 5 | Coaching feedback creates 0 observations / 0 scores / 0 focus areas / 0 PD enrollments / 0 deliv_scores |
| 6 | **Real** PD-submit flow: 3 supervisors receive notification, each recipient reaches `/pd/review/200` with HTTP 200 (never 404), unassigned coach gets 403 |
| 7 | Report leaks: coach cannot see `source_score_level` on HTML or CSV; Principal still can; drill-down authz honors relationship |
| 8 | Revoked capability → 403 next request; historical notes preserved; teacher retains shared feedback |
| 9 | Hard-delete guard soft-deletes on coaching_notes history; row + notes preserved |
| 10 | Preserved teacher records/hours for a teacher-coach: status, acknowledgement, credited hours, score all unchanged; own CSV includes own scores |
| 11 | Shared entries reject `draft_save` with helpful redirect; content preserved |
| 12 | `shared_save` with blank content refused; original content unchanged |
| **13** | **C1 fix**: fresh direct-share creates row + audit (`[create,share]`) + one notification; retry with same token adds nothing; both views render `Sep 22, 2026` (C2) |
| **14** | **C3b**: notify-retry endpoint fires one notification on retry, no-op on second call, view shows "Notification not delivered" badge on the affected note |
| **15** | **C7**: super_admin GET works, all three POSTs (create/update/notify-retry) return 403, new-note form hidden, view-only banner present, note version unchanged after failed writes |
| 16 | Notification prefs merged for teacher-coach (both teacher-side and coach-side kinds shown); revocation preserves historical notes; Alice still sees her feedback |
| 17 | Alice hard-delete → soft-fallback + inbound coaching notes preserved; PlainTeacher (no history) fully hard-deletes |

**Playwright browser (12 assertions):**

| Case | What it proves |
|---|---|
| 1 | Desktop: fresh direct-share redirects with "Shared with teacher" msg (never "Already shared"); coach page shows new entry; date renders "Sep 22, 2026" (C2 in real browser) |
| 2 | Teacher view: sees shared entry, date "Sep 22, 2026", author name |
| 3 | Shared entry edit form exposes exactly one `shared_save` action (R3) |
| 4 | Phone viewport (390×844): entry visible, no horizontal scroll, shared badge present |
| 5 | Keyboard access: Save-draft and Share-with-teacher both reachable via Tab |

### 5b. NOT YET TESTED (limitations to disclose)

* **Notification delivery to real recipients** — the tests read the `notifications` row, not push/email delivery. Push and email delivery are unchanged from the pre-branch baseline; the `notify()` helper writes the in-app row and (for opted-in users) queues push notifications through the existing pipeline. A real end-to-end push delivery is not exercised by this suite; the notify-retry test proves the app's own retry path, not the transport's.
* **Screen-reader** — keyboard reachability is covered by the browser suite, but a full ARIA / screen-reader pass was not run.
* **Production D1 migration timing** — the migration commands were only applied to the local isolated D1. Production timing on `--remote` is not measured in this suite.
* **Actual `wrangler pages deploy` to production** — deliberately not run.
* **Facilitator guide** — not created (per instruction: only after deployment and independent retest).

---

## 6. Preservation checks

Verified nothing pre-existing changes on the branch:

* **`users.role`** — no code path rewrites it. Miranda and Tristae remain `role='teacher'`. Nobody else's role is touched.
* **`users.can_coach`** — only writes are: `UPDATE ... WHERE id IN (13, 19) AND can_coach<>1`. Every other user's flag is untouched. Verified in the idempotency check (Case 16 also confirms revocation of assignment doesn't touch the flag).
* **`assignments` where `relationship='appraiser'`** — untouched by any new code path and untouched by every proposed SQL in `CASELOAD_PREVIEW.md`.
* **`observations`, `observation_scores`, `feedback_items`, `focus_areas`, `pd_enrollments`, `pd_deliverables`, `pd_deliverable_scores`, `external_pd_submissions`, credited hours** — Case 5 counts every table before and after coaching-note activity; Case 10 reads CoachOne's OWN observation status/acknowledgement/score/PD-status/credited-hours pre and post and asserts each value unchanged.
* **Existing `role='coach'` behavior** — Case 1 verifies PureCoach reaches `/coach` and sees the caseload.
* **Existing notification kinds** — no kind was renamed, deprecated, or repurposed. `coach_note` is reused for the sharing notification (its declared description already matched: "Your instructional coach left a note or resource").
* **Existing routes** — no route was removed. New routes: `POST /coach/teachers/:id/notes`, `POST /coach/teachers/:teacherId/notes/:noteId/update`, and (new in this revision) `POST /coach/teachers/:teacherId/notes/:noteId/notify-retry`.

---

## 7. Super-admin support permissions (revised, view-only)

| Coaching-notes surface | View | Create | Edit | Share | Notify-retry | Delete |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Draft (any author, any teacher) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Shared (any author, any teacher) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

* GET `/coach/teachers/:id` — allowed for super_admin, returns EVERY note on the teacher (own and other coaches').
* POST create/update/notify-retry — refused with HTTP 403 for super_admin.
* Only the authoring coach can edit, share, or retry a notification on their own entries.
* There is no permanent-delete endpoint for coaching notes for anyone.
* Every super_admin view is a read; no audit rows are written by a super_admin's activity in this area.

The visibility footer on the coach view now reads:
> "Drafts are visible to you and to platform support (Super Administrator, view-only). Shared entries are visible to you, {teacher.first_name}, and platform support — not to other coaches, principals, or district dashboards."

---

## 8. Non-destructive rollback plan (revised)

Rollback preserves every coaching note. No DROP, no unconditional resets.

| Step | Action | Effect |
|---|---|---|
| 1 | Cut a **rollback patch** on the same branch or on `main` that KEEPS the coaching_notes anchor check in the hard-delete guard (or disables the hard-delete endpoint entirely). Do NOT `git revert 08e9541 cca1e2a` in isolation — that revert also removes the guard and can cascade-delete or FK-fail on any user with retained coaching history. | Application code returns to pre-launch behavior but never puts real coaching data at risk during a subsequent hard-delete. |
| 2 | Deploy the rollback patch to Cloudflare Pages. | Teacher-coaches lose the "My Coaching" and "PD Review" nav; the `/coach/*` routes stop reading/writing `coaching_notes`; teacher home stops rendering the coaching-feedback section. Everything else — teacher records, observations, PD hours, appraiser gate, evaluator feedback rendering — is unchanged. |
| 3 | ONLY reset the specific `can_coach` values this launch set. Run `UPDATE users SET can_coach=0 WHERE id IN (13, 19)` (the two rows this launch changed). **Never** run `UPDATE users SET can_coach=0` unconditionally — that clobbers rows that were never part of this deployment. | Coaching capability grants are removed only for the launch's users. |
| 4 | LEAVE `coaching_notes`, `coaching_note_audit`, `users.can_coach`, and the migration 0013 additions in place. | Historical coaching notes preserved. A future re-launch of the coaching workspace shows them immediately with no data-recovery step. |
| 5 | If (last resort, and separately approved) coaching data must truly be purged: take a backup export FIRST (`wrangler d1 export --remote --output=<file>`), then run the drops in a distinct change window. | Explicit data-loss operation, decoupled from the rollback path itself. |

The rollback runbook is duplicated (with the same wording) in the header comment of `migrations/0012_coaching_capability.sql` so an operator who finds just the SQL file has the full context.

---

## 9. Caseload preview — see `CASELOAD_PREVIEW.md`

Summary (derived from actual proposed operations):

| Coach | Rows today | Retain | Add (confirmed) | Add (pending) | Remove | Rows after approved writes |
|---|---|---|---|---|---|---|
| Michelle Simonson (id 18, `role='coach'`) | 27 | 27 (16 confirmed + 11 pending — retained meanwhile) | 0 | 0 | **0** | **27** |
| Miranda Quale (id 19, `can_coach` → 1) | 0 | 0 | 13 | 2 (Laura Ferry / Jacki Hansel — your yes/no) | 0 | **13 – 15** |
| Tristae Allard (id 13, `can_coach` → 1) | 0 | 0 | 17 | 0 | 0 | **17** |

The eleven pending rows on Michelle and the two on Miranda are the specific questions the district needs to clarify (secondary STEM/FACS/IA classification, Title grade coverage, counselor grade coverage). Removing them or not is a future, separately-approved batch. No coach ends this deployment with unintended access.

---

## 10. What happens on your approval

I will execute (in this order):

1. `npx wrangler d1 migrations apply alexander-marshall-growth-production --remote` (applies 0012 + 0013)
2. Merge `feature/coaching-capability` into `main` and `npx wrangler pages deploy dist --project-name alexander-marshall-growth --branch main --commit-dirty=true`
3. The approved caseload SQL from `CASELOAD_PREVIEW.md` §7a + §7c + §7d — as one script; each statement's write count logged
4. A post-deploy report: production commit hash, applied migration IDs, per-row write counts, and preservation-check diffs (observations count, feedback_items count, credited hours per teacher, appraiser rows count — before vs after)

I will NOT (before your approval):

* Merge to `main`
* Deploy to production
* Apply migrations to production
* Insert/update any assignments row
* Change any `users.can_coach` on production
* Create the facilitator guide
