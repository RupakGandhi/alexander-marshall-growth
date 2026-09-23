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
| Total test assertions | **214 pass / 0 fail** (20 Prose + 182 HTTP acceptance + 12 Playwright browser) |
| Additive migrations pending on prod | `0012`, `0013`, `0014` (in that order — `0014` new this round). None applied yet. |
| Production D1 restore point | **Take fresh export at deploy time** with `npx wrangler d1 export alexander-marshall-growth-production --remote --output=backups/prod-preapproval-<YYYYMMDD>-<HHMM>.sql` — see §10 |

---

## 2. Corrections applied vs the last review

Sept 23 follow-up findings (F1–F5) are ALL resolved. The earlier C1–C7 fixes stand.

### 2a. Follow-up round (F1–F5) — Sept 23, second review

| # | Finding | Where fixed | Proof |
|---|---|---|---|
| **F1** | Note write + audit write were in SEPARATE transactions; a mid-flight audit failure could leave a committed note with no audit trail. | `src/routes/coach.tsx` — every create and update branch now runs the primary write AND the audit write in ONE `db.batch()`. The audit `INSERT` uses `SELECT ... FROM coaching_notes WHERE author_id=? AND client_token=? AND created_at=?` so it lands only when the note write did; a rolled-back batch takes both out together. `logActivity()` calls are wrapped in `try/catch` so an optional-logging failure NEVER converts a successful save into an error response. | **Case 18** — installs a `BEFORE INSERT` trigger on `coaching_note_audit` that RAISEs on the specific test actor, POSTs a create, verifies the response is a non-2xx AND the `coaching_notes` count is unchanged AND the `coaching_note_audit` count is unchanged. If the writes were in separate transactions the note row would appear despite the audit failure — proven not to happen. |
| **F2a** | `notify-retry` did a `SELECT ... EXISTS` then a separate `INSERT`; two concurrent retries could both pass the SELECT and both send. | New table `coaching_note_share_delivery` (migration 0014) with `UNIQUE(note_id)`. First delivery attempts `INSERT ... ON CONFLICT DO NOTHING RETURNING id`; only the winner calls `notify()`. Retry uses `UPDATE ... WHERE status='failed'` — only one caller can flip a failed row to attempting, so the actual `notify()` call is serialized. | **Case 19** — fires TWO concurrent notify-retry requests via `Promise.all`; asserts exactly ONE notification row exists at the end AND the delivery ledger is `'delivered'`. Both requests return 302 with a friendly outcome message. |
| **F2b** | The inbox notification row was used as the sole "did we ever deliver?" record. An admin deleting the inbox row would re-arm a second first-share alert. | Delivery ledger (`coaching_note_share_delivery`) is now the source of truth. Coach view reads its `status` column, not `EXISTS(notifications)`. | **Case 19 second block** — after the winning retry succeeds, delete the inbox row and hit notify-retry again. Assertion: response says "already delivered", zero new inbox rows created. The delivery ledger's `'delivered'` state suppresses the re-arm. |
| **F2c** | Prefs-driven suppression was reported as "failed" delivery. | `notify()` returns `0` when prefs suppress → delivery ledger writes `'suppressed'` (terminal). Coach view shows a distinct grey "Recipient opted out of alerts" info badge instead of the yellow "not delivered" warning. `notify-retry` on a suppressed note tells the coach the recipient opted out and does not send. | **Case 20** — sets Carol's `notification_preferences.in_app=0` for coach_note, shares a note; asserts zero notifications, ledger records `'suppressed'`, coach view shows the "opted out" badge (not the warning). A subsequent retry produces no notification and correctly explains the preference. |
| **F3a** | Reused-token draft-promote path validated the NEW payload but promoted the STORED (possibly stale/empty) draft. | New `payload_digest` column (added to migration 0013). On a retry with the same token, if the new payload's digest doesn't match the stored row's, the server REJECTS the request with a friendly "Reopen the existing entry" message. | **Case 21 first block** — save a draft with token+content-A; POST retry with same token but content-B and `_action=share`. Assertion: response redirects with "different content" / "Reopen", stored row remains a DRAFT with the ORIGINAL content, no notification fires. |
| **F3b** | Reused token could target a different teacher. | On the retry branch, the server compares the stored row's `teacher_id` with the URL path teacher_id before doing anything else; a mismatch returns HTTP 409. | **Case 21 second block** — POST the same token to two different teacher URLs; second request returns HTTP 409 (not 302, not 500). |
| **F4a** | `CASELOAD_PREVIEW.md §7c` executed 15 INSERTs while the doc's summary said 13 confirmed; Laura Ferry and Jacki Hansel were pending but still in the executable batch. | Moved both statements out of §7c into a new §7c-pending, wrapped in `--` comment lines with a DO NOT EXECUTE banner. Uncommenting requires a separate approval. | **Local verify** — extract §7a + §7c + §7d SQL (comments stripped) and run against fresh in-memory SQLite three times. Result: Run 1 = 32 writes (2 UPDATEs + 13 Miranda + 17 Tristae). Runs 2 & 3 = 0 writes. Miranda ends with exactly 13 rows; Tristae with 17. |
| **F4b** | Michelle staying at 27 kept access she didn't need per Aaron's "PK-5 + specials" scope, but no removals were proposed. | Added §2b with 5 named candidate removals (Lesa Gowing, Grace Martinson, Lisa Nelson, Shane Sagert, Amber Severson — all pure secondary academics). SQL for those removals is in §7b inside a DO NOT EXECUTE comment block; nothing runs without a second explicit approval. The 8 genuinely unresolved rows (Pamela, Vicky, Laura, Jacki, Jason, Jena, Martha, Cathy) stay separate in §2c with no removal proposal. | Numbers reconcile: 14 confirmed retain + 5 pending remove + 8 unresolved = 27 = Michelle's current row count. Executable batch writes 0 removals; Michelle sees 27 on `/coach` after deploy. |
| **F5a** | Preservation "before" values were captured at Case 10 time — AFTER Cases 2–9 already exercised coach paths. | Added a `FIXTURE_BASELINE` const containing the seeded values from `tests/fixture.mjs` and compare against those (not against a runtime snapshot). | **Case 10** — every assertion now reads `FIXTURE_BASELINE.obs101_status='acknowledged'`, `obs101_score_level=3`, `enr201_status='verified'`, `enr201_hours_credited=3.5` as the fixed baseline. If any coach-mode activity had ever leaked into CoachOne's teacher-side records over the entire suite, one of these would fail. |
| **F5b** | "Force a real notification exception" was previously simulated by deleting the delivered inbox row. That's not the failure path; it's a post-success cleanup. | **Case 14 rewritten** — writes `status='failed'` into the delivery ledger AND clears the inbox (the exact state a real `notify()` throw would have left). Then exercises notify-retry against the failed state; asserts it wins, calls `notify()`, ends at `'delivered'`. | Verified end-to-end; second retry is a no-op via ledger check. |
| **F5c** | PD review-revise-verify-credit and principal-publish → teacher-acknowledge round-trips weren't exercised by the automated suite. | Two new cases run the REAL POSTs. | **Case 22** — principal publishes a fresh observation for Dan (POST `/appraiser/observations/:id/publish` with a signature); asserts observation flips to `published`, teacher gets the `observation_published` notification. Teacher acknowledges (POST `/teacher/observations/:id/acknowledge` with signature + response); asserts observation flips to `acknowledged` with signature + timestamp, principal gets the `observation_acknowledged` notification. **Case 23** — principal requests revision on PD 200 (POST `/pd/review/200/verify` with `action=revise`); teacher notified of revision. Teacher resubmits. Principal verifies WITH credit hours (`action=verify` + `credit_hours=2.5`); asserts enrollment flips to `verified` AND `hours_credited=2.5` AND teacher gets the `pd_deliverable_verified` notification. |

### 2b. Prior round (C1–C7) still holds

| # | Correction | Where fixed | Proof |
|---|---|---|---|
| 1 | First-time direct-share must create row + audit + notification | `src/routes/coach.tsx` — atomic batch does the insert-note + insert-audit-create + insert-audit-share in one transaction; RETURNING (now via `created_at` timestamp comparison) distinguishes fresh vs. concurrent-race-loser. | **Case 13** — fresh POST creates exactly 1 row, audit `[create,share]`, exactly 1 notification. Same token retry adds 0 rows and 0 notifications. |
| 2 | Date-only fields must not shift through TZ conversion | `src/lib/ui.ts` — `formatDate()` short-circuits on `YYYY-MM-DD` shape | **Case 13** + **Browser Cases 1 & 2** confirm `2026-09-22` renders as `Sep 22, 2026` in coach + teacher views, in Chromium. Browser assertions are SCOPED to the specific test entry so unrelated dates (`2026-09-20`, `-21`) posted by other cases don't false-fail. |
| 3 | Note + audit atomic; truthful notification-status message; safe recovery path | See F1 (audit atomicity) + F2 (recovery) | See F1/F2 above. |
| 4 | Caseload doc and executable SQL must agree; SQL must be repeat-safe; unresolved kept separate | See F4 for the revised state | See F4 above. |
| 5 | Fill material verification gaps | See F5a/F5b/F5c | See F5 above. |
| 6 | Rollback runbook: no DROP; preserve delete guard; only reset touched can_coach values | `migrations/0012_coaching_capability.sql` header rewrite | Runbook names the delete-guard preservation requirement explicitly, gives exact scoped `WHERE id IN (13, 19)` command, warns against a plain `git revert` that would remove the guard. The optional DROP block is removed. |
| 7 | Super-admin view-only on coaching notes | `src/routes/coach.tsx` — `refuseSuperAdminWrite()` on all three write endpoints; edit form hidden; view-only banner; ownership check is author-only | **Case 15** — admin GET returns 200 but POST /notes, /update, /notify-retry all return HTTP 403; new-note form absent; note version unchanged after failed writes. |

---

## 3. What ships with this branch (new/modified this round)

| File | Change |
|---|---|
| `src/routes/coach.tsx` | **Rewritten write path**: atomic `db.batch()` for note+audit on create and every update branch (F1); new `deliverShareNotification()` / `retryShareNotification()` helpers backed by the `coaching_note_share_delivery` ledger (F2); `payloadDigest()` + `serverToken()` helpers (F3); reused-token retry now verifies teacher_id match AND payload digest before promoting; `logActivity()` calls wrapped in try/catch so optional logging never surfaces as a failed save; coach view queries `delivery_status` from the ledger, renders three distinct badges (failed/never, suppressed, attempting); truthful `firstShareMsg()` / `retryMsg()` copy. |
| `src/lib/ui.ts` | `formatDate()` short-circuits on `YYYY-MM-DD` shape (unchanged this round). |
| `migrations/0012_coaching_capability.sql` | Rollback runbook (unchanged this round). |
| `migrations/0013_coaching_note_idempotency.sql` | **Amended**: adds `payload_digest TEXT` column (F3). |
| `migrations/0014_coach_share_delivery.sql` | **NEW**: `coaching_note_share_delivery` table with `UNIQUE(note_id)` for atomic dedupe (F2). |
| `tests/fixture.mjs` | Adds `coaching_note_share_delivery` to the wipe list (must precede `coaching_notes` for FK-safe teardown). |
| `tests/acceptance.mjs` | **Cases 14 rewritten; Cases 18, 19, 20, 21, 22, 23 added**. Case 10 uses fixture-baseline constants (F5a). |
| `tests/browser.mjs` | Cases 1 & 2 date assertions now DOM-scoped to the specific test entry, so incidental dates from other test cases don't false-fail. |
| `CASELOAD_PREVIEW.md` | `§2a/2b/2c/2d` restructured: 14 confirmed retain, 5 named candidate removals **held pending**, 8 unresolved. `§3a` = 13 confirmed adds only; `§3b` = 2 pending held. `§7b`, `§7c-pending` are commented-only blocks with DO NOT EXECUTE banners. Idempotent SQL verified 3× against isolated SQLite (32/0/0 writes). |
| `REVIEW_PACKAGE.md` | This doc, updated for F1–F5. |

Build: `dist/_worker.js` = 659.12 kB, clean.

---

## 4. Migration plan — pending on production

Three additive migrations, applied in this order. All three are non-destructive: additive ALTERs and CREATE-if-not-exists.

```
0012_coaching_capability.sql
  ALTER TABLE users ADD COLUMN can_coach INTEGER NOT NULL DEFAULT 0
  CREATE TABLE coaching_notes (…)
  CREATE TABLE coaching_note_audit (…)
  3 indexes

0013_coaching_note_idempotency.sql
  ALTER TABLE coaching_notes ADD COLUMN client_token TEXT
  ALTER TABLE coaching_notes ADD COLUMN version INTEGER NOT NULL DEFAULT 1
  ALTER TABLE coaching_notes ADD COLUMN payload_digest TEXT       -- NEW (F3)
  UNIQUE INDEX uq_coaching_notes_author_token ON (author_id, client_token) WHERE client_token IS NOT NULL

0014_coach_share_delivery.sql                                     -- NEW (F2)
  CREATE TABLE coaching_note_share_delivery (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK(status IN ('attempting','delivered','suppressed','failed')),
    notif_id INTEGER,
    detail TEXT,
    attempted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES coaching_notes(id)
  )
  1 index (status)
```

**Production restore point** (taken immediately before applying migrations, at deploy time):

```
mkdir -p backups
npx wrangler d1 export alexander-marshall-growth-production --remote \
  --output=backups/prod-preapproval-$(date -u +%Y%m%d-%H%M).sql
```

That SQL export is a full-fidelity dump that `wrangler d1 execute --file=` can replay against a fresh D1 to recover. Store it before touching migrations.

**Production apply command** (waiting for approval):

```
npx wrangler d1 migrations apply alexander-marshall-growth-production --remote
```

All three migrations run in one command in order. Local wrangler confirms exactly `0012`, `0013`, `0014` are pending on prod (as of this branch).

---

## 5. Test results — completed vs untested, called out separately

### 5a. COMPLETED — automated coverage (214 pass / 0 fail)

**Prose renderer (20 assertions):** lone pipe rows, valid tables, blank-separated rows, bullets, numbered lists, CRLF, 40 KB pasted feedback, literal markup safety, 2,048 separator-only rows (29 ms — linear-time confirmed), empty/null, table cell inline bold.

**HTTP acceptance (182 assertions across 23 cases):**

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
| **13** | **C1**: fresh direct-share creates row + audit (`[create,share]`) + one notification; retry with same token adds nothing; both views render `Sep 22, 2026` (C2) |
| **14** | **F5b rewritten**: writes `status='failed'` into the delivery ledger (a genuine notify-throw state, not delete-after-success); notify-retry recovers and lands exactly one notification; ledger ends `'delivered'`; second retry is a no-op |
| **15** | **C7**: super_admin GET works, all three POSTs return 403, new-note form hidden, view-only banner present, note version unchanged |
| 16 | Notification prefs merged for teacher-coach; revocation preserves historical notes; Alice still sees her feedback |
| 17 | Alice hard-delete → soft-fallback + inbound coaching notes preserved; PlainTeacher (no history) fully hard-deletes |
| **18** | **F1**: forced-audit-failure test — poison trigger on `coaching_note_audit` RAISEs; create POST returns 5xx; note count AND audit count both unchanged (atomic batch rolls both back together) |
| **19** | **F2a + F2b**: two concurrent notify-retry requests via `Promise.all` yield exactly 1 notification; ledger records `'delivered'`; after admin-deleted inbox row a further retry says "already delivered" and creates 0 new inbox rows |
| **20** | **F2c**: recipient with `notification_preferences.in_app=0` for coach_note → share redirect says "turned off / no alert"; zero notifications; ledger records `'suppressed'`; coach view shows "Recipient opted out" info badge (not the yellow warning); retry on suppressed note produces zero notifications |
| **21** | **F3a + F3b**: same-token retry with different payload rejected with "Reopen" message and stored draft's original content preserved; same token targeting a different teacher returns HTTP 409 |
| **22** | **F5c**: principal publish + teacher acknowledge round-trip via the real POST endpoints; both notifications fire; obs status flips through `draft → published → acknowledged` with signature |
| **23** | **F5c**: PD review request-revision + resubmit + verify-with-credit round-trip via real POSTs; enrollment moves `submitted → needs_revision → submitted → verified`; `hours_credited` = 2.5; three notifications fire |

**Playwright browser (12 assertions):**

| Case | What it proves |
|---|---|
| 1 | Desktop: fresh direct-share redirects with "Shared with teacher" msg (never "Already shared"); coach page shows new entry; date renders "Sep 22, 2026" (C2 in real browser) |
| 2 | Teacher view: sees shared entry, date "Sep 22, 2026", author name |
| 3 | Shared entry edit form exposes exactly one `shared_save` action (R3) |
| 4 | Phone viewport (390×844): entry visible, no horizontal scroll, shared badge present |
| 5 | Keyboard access: Save-draft and Share-with-teacher both reachable via Tab |

### 5b. NOT YET TESTED (limitations to disclose)

* **Web Push delivery to a physical device** — the tests read the `notifications` inbox row and (F2) the `coaching_note_share_delivery` ledger. The `notify()` helper writes the inbox row and (for opted-in users with a push subscription) fires VAPID-signed Web Push through the existing pipeline. The pipeline is unchanged from the pre-branch baseline; F2's dedupe is proven at the app layer. A real physical-device Web Push handshake is not exercised.
* **Screen-reader** — keyboard reachability is covered by the browser suite, but a full NVDA / VoiceOver pass was not run.
* **Production D1 migration timing** — migrations were applied only to the local isolated D1. Production `--remote` timing is not measured in this suite.
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

Executable summary (derived from `§7a + §7c + §7d` — the ONLY blocks that run against production):

| Coach | Rows today | Confirmed adds | Confirmed removals | Rows after this deploy | Held pending (separate approval, not in this deploy) |
|---|---|---|---|---|---|
| Michelle Simonson (id 18, `role='coach'`) | 27 | 0 | 0 | **27** | 5 candidate removals (§2b/§7b) + 8 unresolved (§2c) |
| Miranda Quale (id 19, `can_coach` → 1) | 0 | 13 | 0 | **13** | 2 pending adds (Laura §3b, Jacki §3b) held in §7c-pending |
| Tristae Allard (id 13, `can_coach` → 1) | 0 | 17 | 0 | **17** | 0 |

**Total writes on this deploy: 32** (2 capability UPDATEs + 13 Miranda INSERTs + 17 Tristae INSERTs). Zero removals. Zero pending statements. Michelle's 27 stays 27 — the 5 named candidate removals in §2b/§7b are commented-out and require a second explicit approval before running. Miranda's Laura/Jacki lines are commented-out in §7c-pending for the same reason. Verified idempotent: repeat runs write 0.

---

## 10. What happens on your approval

I will execute (in this exact order, on the approved commit only — no re-editing between approval and deploy):

1. **Restore point**: `npx wrangler d1 export alexander-marshall-growth-production --remote --output=backups/prod-preapproval-<YYYYMMDD>-<HHMM>.sql` and confirm the file exists + is >0 bytes before proceeding.
2. **Confirm pending migrations**: `npx wrangler d1 migrations list alexander-marshall-growth-production --remote`. The list must show exactly `0012`, `0013`, `0014` as pending. If anything else appears, STOP and report back.
3. **Apply migrations**: `npx wrangler d1 migrations apply alexander-marshall-growth-production --remote`. Log the returned command count per file.
4. **Build and deploy the approved commit**: from the exact tagged commit (I will tag it `approval-<commit>` before deploy), `npm run build` followed by `npx wrangler pages deploy dist --project-name alexander-marshall-growth --branch main --commit-dirty=false`. Deploying the verified artifact — no last-minute edits.
5. **Merge to `main`**: fast-forward or explicit merge commit, no rebase, no squash — preserves the branch history and the approved commit hash.
6. **Run the caseload SQL**: the executable blocks §7a + §7c + §7d from `CASELOAD_PREVIEW.md` — as one script; each statement's write count logged. Confirm total = 32 (matches §7e run 1). §7b and §7c-pending remain commented and do NOT run.
7. **Post-deploy report**: production commit hash, applied migration IDs, per-row write counts from step 6, and preservation-check diffs (observations count, feedback_items count, credited hours per teacher, appraiser rows count — pre-migration export vs. post-deploy live).

I will NOT (before your approval):

* Merge to `main`
* Deploy to production
* Apply migrations to production
* Insert/update any assignments row
* Change any `users.can_coach` on production
* Run any of the pending SQL in §7b or §7c-pending
* Create the facilitator guide

The compatible rollback plan in §8 stays valid across this deploy: `coaching_notes` and `coaching_note_audit` are preserved, `coaching_note_share_delivery` is additive and stays preserved, the delete-guard stays in place, and the `can_coach` reset is scoped to `WHERE id IN (13, 19)`.
