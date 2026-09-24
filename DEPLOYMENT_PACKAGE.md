# Deployment Package — Practice-Cleanup Workflow (migrations 0015 → 0018)

**Status:** STAGED — not deployed. Requires explicit approval before any
production migration, deploy, data change, or setting change is applied.

**Branch:** `feature/data-mgmt-practice-cleanup`
**Final commit:** _updated below at delivery time_
**Target database:** Cloudflare D1 — `alexander-marshall-growth-production`
**Target env:** Cloudflare Pages — `alexander-marshall-growth`
**Currently deployed on production:** migrations 0001 – 0014
**This package applies:** migrations 0015, 0016, 0017, 0018 (additive only)

---

## 1. What this deploys

### Application changes
* `src/lib/practice_cleanup.ts` — practice-cleanup workflow library
* `src/routes/admin.tsx` — super-admin cleanup routes + views
* `src/routes/appraiser.tsx` — deleted-record write guards on 7 write endpoints
* `src/routes/coach.tsx` — soft-delete filters on ledger reads
* `src/routes/teacher.tsx`, `superintendent.tsx`, `pd.tsx`, `reports.tsx` — soft-delete filters on read paths
* `src/lib/db.ts` — `getTeacherPerformanceSummary` regression fix
* `src/lib/pd.ts` — `getEnrollment`/`getReflections` deleted_at filters + `autoEnrollForObservation` entity_id correctness

### Migrations (all ADDITIVE — no drops, no altered semantics on existing rows)

| # | File | Purpose | New columns | New tables |
|---|---|---|---|---|
| 0015 | `0015_practice_cleanup.sql` | Practice-cleanup foundation | `deleted_at`, `is_practice` on 7 tables | `practice_cleanup_batches`, `practice_cleanup_row` |
| 0016 | `0016_practice_cleanup_atomicity.sql` | Per-child ownership + ambiguous notifs | `prior_deleted_at`, `writer_nonce`, `scope_hash`, `candidate_snapshot_json` | `practice_cleanup_child`, `practice_cleanup_ambiguous_notif` |
| 0017 | `0017_practice_cleanup_full_atomicity.sql` | Full-batch atomicity + concurrent-preview guard | `dep_fingerprint`, `deleted_at_stamp` on manifest rows | `practice_cleanup_open_claim` |
| 0018 | `0018_practice_cleanup_hardening.sql` | One-winner execute + frozen dep scope | (none) | `practice_cleanup_execution_lock`, `practice_cleanup_notif_scope` |

**All ALTER TABLEs add nullable columns with defaults; existing rows are unaffected.**
**No CREATE INDEX blocks writes on Cloudflare D1 for the row volumes present.**

---

## 2. Preservation checks (RUN BEFORE step 3)

Run these against production D1 with `wrangler d1 execute alexander-marshall-growth-production --command "..."` (read-only, no `--file`).

### 2.1 Snapshot current counts (baseline for post-deploy diff)
```sql
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
```
Save the output — every count must be **unchanged** after the migration.

### 2.2 Confirm no schema conflicts
```sql
-- Confirm the new columns do NOT already exist on their target tables.
-- If ANY of these return a row, the migration will fail; investigate before proceeding.
SELECT name FROM pragma_table_info('feedback_items')                WHERE name IN ('deleted_at');
SELECT name FROM pragma_table_info('focus_areas')                   WHERE name IN ('deleted_at');
SELECT name FROM pragma_table_info('pd_deliverable_scores')         WHERE name IN ('deleted_at');
SELECT name FROM pragma_table_info('pd_reflections')                WHERE name IN ('deleted_at');
SELECT name FROM pragma_table_info('coaching_notes')                WHERE name IN ('deleted_at','is_practice');
SELECT name FROM pragma_table_info('coaching_note_audit')           WHERE name IN ('deleted_at');
SELECT name FROM pragma_table_info('coaching_note_share_delivery')  WHERE name IN ('deleted_at');
SELECT name FROM pragma_table_info('pd_enrollments')                WHERE name IN ('is_practice');
SELECT name FROM pragma_table_info('pd_deliverables')               WHERE name IN ('is_practice');
SELECT name FROM pragma_table_info('external_pd_submissions')       WHERE name IN ('is_practice');
SELECT name FROM pragma_table_info('observations')                  WHERE name IN ('is_practice');

-- Confirm the new tables do NOT already exist:
SELECT name FROM sqlite_master WHERE type='table' AND name IN (
  'practice_cleanup_batches','practice_cleanup_row','practice_cleanup_child',
  'practice_cleanup_ambiguous_notif','practice_cleanup_open_claim',
  'practice_cleanup_execution_lock','practice_cleanup_notif_scope'
);
```
All queries must return **zero rows**.

### 2.3 Confirm no in-flight cleanup state can be corrupted
The workflow is off in production (migrations 0015+ not yet applied), so
none of the practice-cleanup tables exist yet. There is nothing to
preserve or migrate on those tables. The `is_practice` default of `0`
means every existing row remains "not practice" and is entirely
untouched by cleanup logic.

---

## 3. Backup (RUN BEFORE step 4)

### 3.1 D1 point-in-time export
Cloudflare provides `wrangler d1 export` for full-database SQL dumps.
This produces a portable SQL file that can be re-imported to a fresh
database.

```bash
# Full export — schema + data, single file, timestamped.
STAMP=$(date -u +%Y%m%d-%H%M%S)
wrangler d1 export alexander-marshall-growth-production \
  --remote \
  --output "backup-pre-0015-0018-${STAMP}.sql"

# Verify the file is non-empty and includes the tables we care about.
grep -c 'CREATE TABLE' "backup-pre-0015-0018-${STAMP}.sql"    # expect > 20
grep -c 'INSERT INTO users'          "backup-pre-0015-0018-${STAMP}.sql"
grep -c 'INSERT INTO pd_enrollments' "backup-pre-0015-0018-${STAMP}.sql"
grep -c 'INSERT INTO coaching_notes' "backup-pre-0015-0018-${STAMP}.sql"

# Store the backup off-cluster (drop into R2 or wherever your archive
# convention lives).  DO NOT delete this file until at least 30 days
# after successful cutover.
```

### 3.2 Cloudflare Time Travel bookmark (belt-and-suspenders)
D1 supports Time Travel to any point in the last 30 days.

```bash
# Immediately BEFORE step 4 (migration apply), capture a bookmark id:
wrangler d1 time-travel info alexander-marshall-growth-production --remote
# Save the printed "bookmark" hash — you can restore to it later with:
#   wrangler d1 time-travel restore alexander-marshall-growth-production --bookmark <hash> --remote
```

---

## 4. Migration apply order (RUN IN THIS EXACT SEQUENCE)

**No file must be applied without the previous file's success confirmation.**

```bash
# 4.1 Apply 0015 (foundation).
wrangler d1 migrations apply alexander-marshall-growth-production --remote
# Confirm output shows: "0015_practice_cleanup.sql ✅"
# (`migrations apply` picks up ALL pending migrations in order — 0015..0018 
#  will apply together.  If you want to apply one at a time for the
#  strictest cutover, temporarily move the not-yet-desired files aside,
#  apply, verify, then move them back and apply the next.)

# 4.2 Post-migration schema sanity.
wrangler d1 execute alexander-marshall-growth-production --remote --command \
  "SELECT name FROM sqlite_master WHERE type='table'
    AND name IN ('practice_cleanup_batches','practice_cleanup_row',
                 'practice_cleanup_child','practice_cleanup_ambiguous_notif',
                 'practice_cleanup_open_claim','practice_cleanup_execution_lock',
                 'practice_cleanup_notif_scope')
    ORDER BY name;"
# Expect 7 rows.

wrangler d1 execute alexander-marshall-growth-production --remote --command \
  "SELECT name FROM pragma_table_info('coaching_notes')
    WHERE name IN ('deleted_at','is_practice') ORDER BY name;"
# Expect 2 rows: deleted_at, is_practice.

# 4.3 Post-migration data invariants.
wrangler d1 execute alexander-marshall-growth-production --remote --command \
  "SELECT COUNT(*) AS practice_tagged FROM coaching_notes WHERE is_practice=1
   UNION ALL SELECT COUNT(*) FROM pd_enrollments WHERE is_practice=1
   UNION ALL SELECT COUNT(*) FROM pd_deliverables WHERE is_practice=1
   UNION ALL SELECT COUNT(*) FROM observations WHERE is_practice=1
   UNION ALL SELECT COUNT(*) FROM external_pd_submissions WHERE is_practice=1;"
# Expect 5 rows, ALL 0 (nothing tagged as practice on day one).

wrangler d1 execute alexander-marshall-growth-production --remote --command \
  "SELECT COUNT(*) FROM coaching_notes WHERE deleted_at IS NOT NULL
   UNION ALL SELECT COUNT(*) FROM coaching_note_audit WHERE deleted_at IS NOT NULL
   UNION ALL SELECT COUNT(*) FROM feedback_items WHERE deleted_at IS NOT NULL
   UNION ALL SELECT COUNT(*) FROM focus_areas WHERE deleted_at IS NOT NULL;"
# Expect 4 rows, ALL 0 (no rows were soft-deleted by the migration).

# 4.4 Recount all pre-existing tables — every count MUST match the
# baseline from step 2.1.  Re-run the same UNION ALL SELECT COUNTs and
# diff against the baseline.  A mismatch means something moved and the
# rollback in section 6 must be executed.
```

---

## 5. Application deploy (RUN AFTER step 4 succeeds and 4.4 passes)

```bash
# From the repo root, on commit c7c9a23 or later on
# feature/data-mgmt-practice-cleanup.
cd /home/user/webapp
npm run build
# Expect: dist/_worker.js ~720 KB, "built in ~2s".

# Deploy to Cloudflare Pages.
wrangler pages deploy dist --project-name alexander-marshall-growth
# Wait for "Deployment complete!" and note the URL.
```

### 5.1 Post-deploy smoke checks

Sign in to the deployed URL as a super-admin and verify:

1. `/admin/data` — the "Practice-data cleanup" banner + link appears.
2. `/admin/data/practice-cleanup` loads (200) and shows:
   * "Review scope — 0 records tagged as practice" (correct on day one).
   * "Recent cleanup batches" — empty.
   * "Tag records" — the four browse tables render with real production records but every row's Tag button is un-tagged (yellow).
3. `/appraiser/observations/<any-real-obs>` loads and Save/Score/Publish
   all work exactly as before — the deleted_at guards do not break the
   normal (non-deleted) path.
4. `/coach/teachers/<any-real-teacher>` loads and the shared-notes list
   still renders.
5. `/teacher` (as a real teacher account) — the coaching-feedback panel
   and PD panel render as before.
6. `/reports/pd` and `/reports/pd.csv` — same output as pre-deploy.

**Do NOT tag any real production record as is_practice=1 until you have
verified the cleanup workflow on synthetic data in the deployed
environment.** The recommended path is:
   * Create a throwaway test enrollment / coaching note via the admin
     UI or the seeded fixtures.
   * Tag it, preview it, confirm it, restore it.
   * Confirm no other data moved.
   * Only then close the readiness handoff.

---

## 6. Rollback (if step 4 or 5 fails)

### 6.1 If step 4 fails MID-migration
Cloudflare D1 migrations are transactional per file. A failed migration
leaves prior migrations applied but the failing one rolled back. Fix the
failing file (or file a support ticket), then re-run `wrangler d1
migrations apply`. No data restoration needed.

### 6.2 If step 4 completed but data invariants (4.4) fail
This should not happen with additive migrations, but if it does:
```bash
# Restore from the Time Travel bookmark captured in step 3.2.
wrangler d1 time-travel restore alexander-marshall-growth-production \
  --bookmark <hash-from-step-3.2> --remote
# Or, restore from the SQL export:
#   1. Create a NEW empty D1 db, import the .sql file, verify counts.
#   2. Cutover the binding in wrangler.jsonc to the new db id.
#   3. Deploy.
# (Do not overwrite the current db in-place from an export — it drops
#  the tables and interrupts service.)
```

### 6.3 If step 5 (application deploy) fails
```bash
# Roll back the Pages deployment to the previous version:
wrangler pages deployment list --project-name alexander-marshall-growth
# Note the previous "Production" deployment id, then:
wrangler pages deployment tail --project-name alexander-marshall-growth  # to confirm which was live
# Cloudflare Pages exposes a "Rollback" button in the dashboard for the
# previous production build; use that.
# The database migrations REMAIN applied (they are additive and the
# older app version is defensive against unknown columns — it simply
# ignores them).  No data-side rollback is required.
```

### 6.4 If a bug is discovered post-cutover with tagged records or completed batches
* **Do NOT DROP the practice_cleanup_* tables.**  They hold the audit
  trail + ownership manifest.  Cleanup batches remain restorable so
  long as those tables exist.
* Revert the application (see 6.3).  The tables continue to sit inert.
* Address the bug on the branch, redeploy, resume the workflow.
* Only DROP practice_cleanup_* tables if the workflow is being retired
  permanently AND every executed batch has been either restored or
  explicitly "acknowledged as terminal."  This is a separate,
  approvals-gated decision.

---

## 7. Deferred items (out of scope for this deploy)

* Facilitator guide (documentation) — held per prior instruction.
* Any production data change (tagging real records for cleanup) — held
  until you sign off after the deploy smoke checks pass.
* Removal of the `soft_delete_enabled` setting on `/admin/data` — the
  legacy "reset practice data" buttons still exist under it; retire them
  separately once the new workflow is in service.

---

## 8. Contact / escalation

If any preservation check (step 2), invariant check (step 4.4), or smoke
check (step 5.1) fails, STOP the deploy and hand back to engineering.
Do NOT run any DELETE, UPDATE, or ALTER against production until the
failure is understood.
