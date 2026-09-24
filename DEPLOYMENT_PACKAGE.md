# Deployment Package — Practice-Cleanup Workflow (migrations 0015 → 0018)

**Status:** STAGED — not deployed. Requires explicit approval before any
production migration, application deploy, data change, or setting change is
applied.

**Pinned release commit:** `aed4bd8` on `feature/data-mgmt-practice-cleanup`
(this file is updated in the same commit that releases the branch to
production; do NOT deploy any other commit).

**Target D1 database:**    `alexander-marshall-growth-production`
**Target Pages project:**  `alexander-marshall-growth`
**Target Pages branch (production):** `main`
**Currently applied on production D1:** migrations 0001 – 0014
**This package applies:** migrations 0015, 0016, 0017, 0018 (all additive)

**Wrangler version used to validate every command below:** `4.82.2`
(from `npx wrangler --version` in this sandbox). Run `npx wrangler --version`
on the operator machine before executing anything below; on any earlier
major version, re-read each `wrangler <cmd> --help` output and adjust
flag names before running.

**Standing hold:** no merge, no deploy, no production migration, no live
record / assignment / setting change without a separate explicit
approval per the user's standing constraint.

---

## 1. What this deploys

### Application changes on the pinned commit
* `src/lib/practice_cleanup.ts` — practice-cleanup workflow library
* `src/routes/admin.tsx` — super-admin cleanup routes + views
* `src/routes/appraiser.tsx` — deleted-record write guards on 7 write endpoints
* `src/routes/coach.tsx` — soft-delete filters on 3 ledger reads
* `src/routes/teacher.tsx`, `superintendent.tsx`, `pd.tsx`, `reports.tsx` — soft-delete filters on read paths
* `src/lib/db.ts` — `getTeacherPerformanceSummary` regression fix
* `src/lib/pd.ts` — `getEnrollment`/`getReflections` deleted_at filters + `autoEnrollForObservation` entity_id correctness

### Migrations (all ADDITIVE — no drops, no changed semantics on existing rows)

| # | File | New columns on existing tables | New tables |
|---|---|---|---|
| 0015 | `0015_practice_cleanup.sql` | `deleted_at` on 7 tables; `is_practice` on 5 | `practice_cleanup_batches`, `practice_cleanup_row` |
| 0016 | `0016_practice_cleanup_atomicity.sql` | `prior_deleted_at`, `writer_nonce`, `scope_hash`, `candidate_snapshot_json` | `practice_cleanup_child`, `practice_cleanup_ambiguous_notif` |
| 0017 | `0017_practice_cleanup_full_atomicity.sql` | `dep_fingerprint`, `deleted_at_stamp` on manifest rows | `practice_cleanup_open_claim` |
| 0018 | `0018_practice_cleanup_hardening.sql` | (none) | `practice_cleanup_execution_lock`, `practice_cleanup_notif_scope` |

Every `ALTER TABLE ADD COLUMN` adds a nullable column with a default;
existing rows keep their current values. No `DROP`, no `RENAME`, no
constraint change on any existing column. Legacy read paths that do not
know about the new columns continue to read them (they just ignore them).

---

## 2. Read-only production checks (RUN BEFORE step 3)

All queries in this section are `SELECT`-only and MUST be run with
`--remote` against the production D1. **A failure at any step here stops
the deployment for engineering investigation — it MUST NOT
automatically trigger a whole-database rollback.**

### 2.1 Snapshot current row counts (baseline for post-deploy diff)

```bash
# Save this baseline output; the same query is re-run post-migration
# (step 4.4) and every count MUST be unchanged.
npx wrangler d1 execute alexander-marshall-growth-production --remote --command "
SELECT 'users' AS t, COUNT(*) AS n FROM users
UNION ALL SELECT 'observations',            COUNT(*) FROM observations
UNION ALL SELECT 'observation_scores',      COUNT(*) FROM observation_scores
UNION ALL SELECT 'feedback_items',          COUNT(*) FROM feedback_items
UNION ALL SELECT 'focus_areas',             COUNT(*) FROM focus_areas
UNION ALL SELECT 'pd_enrollments',          COUNT(*) FROM pd_enrollments
UNION ALL SELECT 'pd_deliverables',         COUNT(*) FROM pd_deliverables
UNION ALL SELECT 'pd_reflections',          COUNT(*) FROM pd_reflections
UNION ALL SELECT 'pd_deliverable_scores',   COUNT(*) FROM pd_deliverable_scores
UNION ALL SELECT 'external_pd_submissions', COUNT(*) FROM external_pd_submissions
UNION ALL SELECT 'coaching_notes',          COUNT(*) FROM coaching_notes
UNION ALL SELECT 'coaching_note_audit',     COUNT(*) FROM coaching_note_audit
UNION ALL SELECT 'coaching_note_share_delivery', COUNT(*) FROM coaching_note_share_delivery
UNION ALL SELECT 'notifications',           COUNT(*) FROM notifications
UNION ALL SELECT 'activity_log',            COUNT(*) FROM activity_log
UNION ALL SELECT 'assignments',             COUNT(*) FROM assignments
UNION ALL SELECT 'user_schools',            COUNT(*) FROM user_schools
UNION ALL SELECT 'schools',                 COUNT(*) FROM schools
UNION ALL SELECT 'frameworks',              COUNT(*) FROM frameworks
UNION ALL SELECT 'framework_domains',       COUNT(*) FROM framework_domains
UNION ALL SELECT 'framework_indicators',    COUNT(*) FROM framework_indicators
UNION ALL SELECT 'pd_modules',              COUNT(*) FROM pd_modules
UNION ALL SELECT 'teacher_goals',           COUNT(*) FROM teacher_goals
;
" --json > baseline-$(date -u +%Y%m%d-%H%M%S).json
```

### 2.2 Schema-conflict guard (read-only)

Confirm the new columns and tables do NOT already exist on production.
Every `SELECT` below MUST return **zero rows**. Any non-zero result
means the schema is not in the state we expected — stop and investigate
before applying migrations.

```bash
npx wrangler d1 execute alexander-marshall-growth-production --remote --command "
SELECT 'feedback_items.deleted_at'                   AS existing_col
  WHERE EXISTS (SELECT 1 FROM pragma_table_info('feedback_items')                WHERE name='deleted_at')
UNION ALL SELECT 'focus_areas.deleted_at'
  WHERE EXISTS (SELECT 1 FROM pragma_table_info('focus_areas')                   WHERE name='deleted_at')
UNION ALL SELECT 'pd_deliverable_scores.deleted_at'
  WHERE EXISTS (SELECT 1 FROM pragma_table_info('pd_deliverable_scores')         WHERE name='deleted_at')
UNION ALL SELECT 'pd_reflections.deleted_at'
  WHERE EXISTS (SELECT 1 FROM pragma_table_info('pd_reflections')                WHERE name='deleted_at')
UNION ALL SELECT 'coaching_notes.deleted_at'
  WHERE EXISTS (SELECT 1 FROM pragma_table_info('coaching_notes')                WHERE name='deleted_at')
UNION ALL SELECT 'coaching_notes.is_practice'
  WHERE EXISTS (SELECT 1 FROM pragma_table_info('coaching_notes')                WHERE name='is_practice')
UNION ALL SELECT 'coaching_note_audit.deleted_at'
  WHERE EXISTS (SELECT 1 FROM pragma_table_info('coaching_note_audit')           WHERE name='deleted_at')
UNION ALL SELECT 'coaching_note_share_delivery.deleted_at'
  WHERE EXISTS (SELECT 1 FROM pragma_table_info('coaching_note_share_delivery')  WHERE name='deleted_at')
UNION ALL SELECT 'pd_enrollments.is_practice'
  WHERE EXISTS (SELECT 1 FROM pragma_table_info('pd_enrollments')                WHERE name='is_practice')
UNION ALL SELECT 'pd_deliverables.is_practice'
  WHERE EXISTS (SELECT 1 FROM pragma_table_info('pd_deliverables')               WHERE name='is_practice')
UNION ALL SELECT 'external_pd_submissions.is_practice'
  WHERE EXISTS (SELECT 1 FROM pragma_table_info('external_pd_submissions')       WHERE name='is_practice')
UNION ALL SELECT 'observations.is_practice'
  WHERE EXISTS (SELECT 1 FROM pragma_table_info('observations')                  WHERE name='is_practice')
UNION ALL SELECT 'table:' || name FROM sqlite_master WHERE type='table' AND name IN (
  'practice_cleanup_batches','practice_cleanup_row','practice_cleanup_child',
  'practice_cleanup_ambiguous_notif','practice_cleanup_open_claim',
  'practice_cleanup_execution_lock','practice_cleanup_notif_scope'
);
"
```

**Expected result:** empty result set (no rows). Any row surfaced here
must be investigated — do NOT proceed to step 3.

### 2.3 Currently-applied migration ledger

```bash
npx wrangler d1 migrations list alexander-marshall-growth-production --remote
```

Expected: 0001 … 0014 all listed as applied; 0015 … 0018 listed as pending.

---

## 3. Backup (RUN BEFORE step 4)

### 3.1 Full SQL export (`--remote` explicitly)

```bash
STAMP=$(date -u +%Y%m%d-%H%M%S)
npx wrangler d1 export alexander-marshall-growth-production \
  --remote \
  --output "backup-pre-0015-0018-${STAMP}.sql"

# Sanity checks on the export (must be non-empty and contain the tables
# we care about):
test -s "backup-pre-0015-0018-${STAMP}.sql" \
  || { echo "ABORT: export file is empty"; exit 1; }
grep -c 'CREATE TABLE' "backup-pre-0015-0018-${STAMP}.sql"    # expect > 20
grep -c 'INSERT INTO users'          "backup-pre-0015-0018-${STAMP}.sql"
grep -c 'INSERT INTO pd_enrollments' "backup-pre-0015-0018-${STAMP}.sql"
grep -c 'INSERT INTO coaching_notes' "backup-pre-0015-0018-${STAMP}.sql"
```

Copy the SQL file off-cluster (long-term archive per your org's
retention policy). Do NOT delete it for at least 30 days after cutover.

### 3.2 Cloudflare Time Travel bookmark

Time Travel commands do NOT take a `--remote` flag on Wrangler 4.82.2 —
they always operate on the remote D1 (help text: "This command acts on
remote D1 Databases"). Confirmed against `npx wrangler d1 time-travel
info --help`.

```bash
# IMMEDIATELY before step 4, capture a bookmark id:
npx wrangler d1 time-travel info alexander-marshall-growth-production --json \
  > bookmark-pre-0015-0018-${STAMP}.json

# Copy the printed "bookmark" string into a safe place.  Time Travel
# lets you restore to that point within the last 30 days:
#   npx wrangler d1 time-travel restore alexander-marshall-growth-production \
#     --bookmark <hash>
#
# Time Travel restore is a WHOLE-DATABASE operation — it rewinds every
# table, not just ours.  Do NOT invoke it automatically on a
# preservation-check failure.  See section 6.
```

---

## 4. Migration apply (RUN AFTER steps 2 + 3 pass)

Apply the four migrations in order.

```bash
# 4.1 Apply.  `migrations apply` runs every pending migration in
# lexical order (0015 → 0016 → 0017 → 0018).  On D1 each migration file
# is transactional per file: a failure rolls back that file only,
# earlier files stay applied.
npx wrangler d1 migrations apply alexander-marshall-growth-production --remote
# Confirm output ends with:
#   "0015_practice_cleanup.sql ✅"
#   "0016_practice_cleanup_atomicity.sql ✅"
#   "0017_practice_cleanup_full_atomicity.sql ✅"
#   "0018_practice_cleanup_hardening.sql ✅"
# If any file fails, stop and investigate — do NOT attempt the
# application deploy (step 5).

# 4.2 Confirm the seven new tables exist.
npx wrangler d1 execute alexander-marshall-growth-production --remote --command "
SELECT name FROM sqlite_master WHERE type='table'
  AND name IN ('practice_cleanup_batches','practice_cleanup_row',
               'practice_cleanup_child','practice_cleanup_ambiguous_notif',
               'practice_cleanup_open_claim','practice_cleanup_execution_lock',
               'practice_cleanup_notif_scope')
  ORDER BY name;
"
# Expect 7 rows.

# 4.3 Confirm the new columns exist on the ALTERed tables.
npx wrangler d1 execute alexander-marshall-growth-production --remote --command "
SELECT name FROM pragma_table_info('coaching_notes') WHERE name IN ('deleted_at','is_practice') ORDER BY name;
"
# Expect: deleted_at, is_practice.

# 4.4 Data invariants:  nothing tagged as practice, nothing soft-deleted.
npx wrangler d1 execute alexander-marshall-growth-production --remote --command "
SELECT 'coaching_notes.is_practice=1'          AS assertion, COUNT(*) AS n FROM coaching_notes           WHERE is_practice=1
UNION ALL SELECT 'pd_enrollments.is_practice=1',              COUNT(*) FROM pd_enrollments               WHERE is_practice=1
UNION ALL SELECT 'pd_deliverables.is_practice=1',             COUNT(*) FROM pd_deliverables              WHERE is_practice=1
UNION ALL SELECT 'observations.is_practice=1',                COUNT(*) FROM observations                 WHERE is_practice=1
UNION ALL SELECT 'external_pd_submissions.is_practice=1',     COUNT(*) FROM external_pd_submissions      WHERE is_practice=1
UNION ALL SELECT 'coaching_notes.deleted_at IS NOT NULL',     COUNT(*) FROM coaching_notes               WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'coaching_note_audit.deleted_at IS NOT NULL',COUNT(*) FROM coaching_note_audit          WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'feedback_items.deleted_at IS NOT NULL',     COUNT(*) FROM feedback_items               WHERE deleted_at IS NOT NULL
UNION ALL SELECT 'focus_areas.deleted_at IS NOT NULL',        COUNT(*) FROM focus_areas                  WHERE deleted_at IS NOT NULL;
"
# Expect: all 9 rows show n=0.

# 4.5 Row-count invariant: re-run the baseline query from step 2.1 and
# diff against the saved baseline.  Every count MUST be identical.
# A mismatch means something moved during migration — STOP and hand back
# to engineering.  Do NOT trigger Time Travel restore automatically;
# section 6.4 explains the manual investigation path.
```

---

## 5. Application deploy (RUN AFTER step 4 succeeds AND step 4.5 diff is empty)

```bash
# Deploy the PINNED commit only.  If the working tree is on a
# different commit, check out aed4bd8 first.
cd <repo-root>
git fetch origin
git checkout aed4bd8
git rev-parse HEAD    # confirm this prints aed4bd8

npm ci    # deterministic install from lockfile
npm run build
# Expect: dist/_worker.js ~726 KB, "built in ~2s".

# Deploy explicitly to the production branch.
npx wrangler pages deploy dist \
  --project-name alexander-marshall-growth \
  --branch main \
  --commit-hash aed4bd8 \
  --commit-message "Deploy practice-cleanup workflow (migrations 0015-0018)"
# Wait for "Deployment complete!" and note the deployment URL.
```

### 5.1 READ-ONLY post-deploy smoke checks

**All smoke checks in this section are GET-only navigations and
READ-only DB queries.  Do NOT save, score, publish, share, or delete
any real production record as a smoke test.**

Sign in on the deployed URL as a super-admin and verify:

1. **Data Management landing** — `/admin/data`
   * The "Practice-data cleanup" banner + link appears.
   * The page loads without error.
2. **Practice-cleanup landing** — `/admin/data/practice-cleanup`
   * Returns 200.
   * "Review scope — 0 records tagged as practice."
   * "Recent cleanup batches" — empty table.
   * Browse tables render with real production rows; every row's Tag
     button is un-tagged (yellow "Tag" state).  **Do NOT click Tag on
     any real production row as part of the smoke test.**
3. **Appraiser view sanity** (as a super-admin, viewing an existing
   observation)
   * `/appraiser/observations/<any-existing-obs-id>` loads (200).
   * The page renders scripted notes, scores, and feedback exactly as
     before.
   * **Do NOT press Save, Score, Publish, or Delete during the smoke
     test.**  Those write paths are covered by the automated test
     suites (V20 for the /save guard, V13 for publish + auto-enroll).
4. **Coach view sanity** (as a super-admin)
   * `/coach/teachers/<any-existing-teacher-id>` loads (200) and shows
     the shared-notes list as before.
   * **Do NOT create, edit, share, or resend a coaching note.**
5. **Read-only reports**
   * `/reports/pd` and `/reports/pd.csv` return the same rows as before
     the deploy (row-for-row diff of the CSV against a pre-deploy CSV
     is a strong check).
   * `/reports/observations` (if present) renders without error.
6. **Post-deploy DB invariants** (READ-ONLY, `--remote`)

```bash
# Confirm still-zero cleanup activity — no cleanup batch has been
# created yet.
npx wrangler d1 execute alexander-marshall-growth-production --remote --command "
SELECT 'practice_cleanup_batches' AS t, COUNT(*) AS n FROM practice_cleanup_batches
UNION ALL SELECT 'practice_cleanup_row',                COUNT(*) FROM practice_cleanup_row
UNION ALL SELECT 'practice_cleanup_child',              COUNT(*) FROM practice_cleanup_child
UNION ALL SELECT 'practice_cleanup_open_claim',         COUNT(*) FROM practice_cleanup_open_claim
UNION ALL SELECT 'practice_cleanup_execution_lock',     COUNT(*) FROM practice_cleanup_execution_lock
UNION ALL SELECT 'practice_cleanup_notif_scope',        COUNT(*) FROM practice_cleanup_notif_scope
UNION ALL SELECT 'practice_cleanup_ambiguous_notif',    COUNT(*) FROM practice_cleanup_ambiguous_notif;
"
# Expect: all 7 rows show n=0.

# Confirm the row counts from step 2.1 STILL match (the deploy itself
# should not have moved any data row).  Re-run and diff.
```

**A separately-identified and separately-approved end-to-end
verification** — using a demonstration record that is explicitly listed
and approved by you — is REQUIRED before the workflow is used on real
data. That record's identity and the approval are recorded outside this
package.

**Do NOT run fixture / seeding / test-data scripts against production.**
The scripts in `tests/fixture.mjs` are for local D1 only.

---

## 6. Rollback (if any step fails)

### 6.1 If step 2 (read-only checks) fails
Stop. Do not proceed. No production state has been changed. Investigate
the mismatch and re-plan.

### 6.2 If step 3 (backup) fails
Stop. Do not proceed. `wrangler d1 export --remote` failing means we
cannot capture a portable backup; you must not migrate without one.
Retry the export (transient network / auth); if it repeatedly fails,
file a Cloudflare support ticket.

### 6.3 If step 4 (migration apply) fails mid-file
Cloudflare D1 migrations are transactional per file. A failing file is
rolled back; earlier files stay applied. The `practice_cleanup_*`
tables added by any successful earlier file are inert — no application
code writes to them yet (application deploy hasn't happened). No
restoration is required. Fix the failing SQL file, re-run
`npx wrangler d1 migrations apply --remote`.

### 6.4 If step 4.5 row-count diff shows a mismatch after apply
This should be impossible with additive migrations, but if it happens:

1. **STOP.  Do NOT run `wrangler d1 time-travel restore` automatically.**
   Time Travel restore rewinds the ENTIRE database and would erase any
   legitimate writes performed between the pre-migration bookmark and
   now (e.g. teachers submitting observations concurrent with the
   migration).
2. Capture the diff: dump the specific mismatching table(s) via
   `wrangler d1 export --remote --table <name>` for forensic review.
3. Hand back to engineering with the diff and the baseline JSON from
   step 2.1. Time Travel is a manual escalation performed AFTER
   engineering confirms no legitimate concurrent writes need to be
   preserved.

### 6.5 If step 5 (application deploy) fails
```bash
# Roll back the Pages deployment to the previous PRODUCTION build.
npx wrangler pages deployment list --project-name alexander-marshall-growth
# Locate the previous "Production" deployment id (env=production, branch=main),
# then use the Cloudflare dashboard's "Rollback to this deployment" button on
# that build.  (Wrangler 4.82.2 does not expose a `deployment rollback` CLI
# subcommand; the dashboard is the supported path.)
```
The migrations remain applied. The prior application build is
defensive against extra unknown columns (it simply doesn't read them),
so the site returns to its pre-deploy behavior. **No cleanup batches
have run yet, so there is no manifest to preserve.**

### 6.6 If a bug is discovered AFTER cleanup batches have run
This is the critical case the review flagged. Once ANY cleanup batch
has been executed, the `practice_cleanup_*` tables hold live audit +
restoration manifest data. **DO NOT drop those tables. DO NOT revert
to a build older than `aed4bd8` without preserving cleanup
visibility.**

Sequence:
1. **Application rollback SHOULD be to a build that still HONORS the
   soft-delete columns** — i.e. any commit on
   `feature/data-mgmt-practice-cleanup` that is NEWER than the point
   where `deleted_at` filters landed on the read paths (specifically:
   commit `99d1762` "practice-cleanup workflow + soft-delete view
   guards" or later). Reverting past `99d1762` would expose cleaned
   records again because the earlier read paths do not filter
   `deleted_at`.
2. **Do NOT drop or truncate `practice_cleanup_*` tables**. They are
   the ownership manifest — every executed batch remains restorable so
   long as they exist.
3. If a cleanup batch needs to be undone, use the in-app Restore
   button on `/admin/data/practice-cleanup/batches/<id>` — even after
   an application rollback to a pre-workflow build, the batch page
   remains reachable at the pinned commit `aed4bd8`. The safe
   workflow is: redeploy `aed4bd8` briefly, restore any
   affected batches from the UI, then redeploy the rollback build.
4. Time Travel restore is a LAST RESORT — it would erase legitimate
   post-migration writes and cleanup batches alike. Only use it after
   you have (a) exported the current DB via `wrangler d1 export
   --remote` for forensic review, and (b) explicitly accepted the
   loss of every write since the bookmark.

---

## 7. Deferred items (out of scope for this deploy)

* Facilitator guide (documentation) — held per your standing instruction.
* Any real production data change (tagging real records for cleanup) —
  held until you sign off after the read-only smoke checks pass AND a
  separately-identified demonstration record is approved.
* Retiring the legacy `soft_delete_enabled` setting and the old
  "reset practice data" buttons on `/admin/data` — separate, later PR.

---

## 8. Contact / escalation

If any check in section 2, section 4.2–4.5, or section 5.1 fails, STOP
the deploy and hand back to engineering. Do NOT run any `INSERT`,
`UPDATE`, `DELETE`, `ALTER`, or `DROP` against production D1 until the
failure is understood. Do NOT invoke Time Travel restore without
explicit approval per section 6.4 / 6.6.
