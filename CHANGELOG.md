# Changelog — Alexander Marshall Growth Platform

All notable changes to this project are documented here. The platform follows an
additive upgrade model: each round preserves every prior workflow (auto-save,
Learn → Practice → Apply gating, score-routed auto-enrollment (Support PD for
scores of 1 or 2; Stretch PD manual-only for Effective practice), dashboards,
role permissions, forced-first-login password flow) byte-for-byte.

---

## [June 4, 2026 — late evening] — Instant-save scoring + bulk-score affordances + focus area trigger explained

Triggered by Dr. Gandhi's verbatim feedback during testing:

> *"Also when making saves as a user in any field, the page auto refreshes and scrolls all the way to the top. The user thne has to scroll all the way back down to what they were doing and that is annoying. Lets solve that for them.*
>
> *Also, what triggers a focus area appearing in the system? Did an observation and it didnt generate*
>
> *Also think about the principal user experience during observations. How do we streamline this as easy as possible to them. Sometimes they may not score any element and will just have scripted nots, other times they may have to score all 64. How do we make that experience of scoring as smooth and easy and flexible for them in all situations? Having to press save 64 times when mass scoring would be very hard."*

### Fix 1 — Scoring now auto-saves instantly (no reload, no scroll loss)

**Root cause:** the `/observations/:id/score` endpoint was a classic
form-POST-then-302-redirect — the browser navigated away to the redirect target,
which forced a fresh page render and reset the scroll position to the top. The
old inline JS only highlighted "unsaved" rows in red; it never intercepted the
submit, so every score click cost the appraiser a 60-row scroll back to where
they were.

**Resolution** in `src/routes/appraiser.tsx`:

- `/observations/:id/score` is now **JSON-aware**: when the request carries
  `Accept: application/json` or `X-Requested-With: XMLHttpRequest`, it returns
  `{ ok, indicator_id, level, totals }` with the recomputed scoreboard counts
  instead of redirecting. Legacy no-JS form POSTs still get the 302 fallback.
- The endpoint also accepts `level=""` as an explicit **soft delete** — pick
  "Not scored" and the row is removed from `observation_scores`, returning the
  indicator to the unscored pool (which the new bulk action depends on).
- New inline JS handler intercepts every `[data-score-form]`:
  - Radio change → instant `fetch()` POST → updates the rating badge + flashes
    a "Saved" pill for 1.5s + refreshes the sticky scoreboard counters — all
    in place, no scroll movement, no reload.
  - Evidence-note textarea → auto-saves on blur.
  - Form submit (Enter key etc.) is `preventDefault()`-ed and rerouted through
    the same fetch path.
- The per-row "Save score" button is now a **`<noscript>` fallback only** — when
  JS is loaded, no button click is ever required to record a score. Helpful
  inline copy on the scoring section was updated: *"Click any rating tile to
  record a score — auto-saves instantly, no need to press anything else."*

### Fix 2 — Speed-grade affordances: score 0 or 64 indicators with the same effort

Dr. Gandhi's two extreme cases:

- **Walkthrough / scripted-notes-only:** appraiser doesn't score any indicator
  and just wants to publish narrative notes
- **Full formal observation:** appraiser needs to set all ~60 indicators in a
  reasonable time without 60 individual button clicks

**Resolution** — new bulk-score system in `appraiser.tsx`:

- New endpoint `POST /observations/:id/bulk-score` accepts `level=4|3|2|1|""`
  and `scope=all|domain` (+ `domain_code` when scoped). **Critical safety
  contract:** the SQL `WHERE (os.id IS NULL OR os.level IS NULL)` clause
  ensures the bulk action only touches **currently unscored** indicators — a
  rating the appraiser already set manually is **never** overwritten. Verified
  end-to-end with a smoke test (manually scored 1 indicator → bulk-applied
  level 3 to "all" → applied 49 of the 50 unscored, the manually scored row
  stayed at its original value).
- The query is scoped to the **observation's own framework_id**, so the bulk
  action only sees the indicators actually rendered to this user.
- Each domain `<details>` accordion now has a **per-domain bulk toolbar**:
  > 🎯 Speed-grade unscored in this domain: [All 4 · HE] [All 3 · E] [All 2 · IN] [All 1 · DNM] · [Reset to "Not scored"]
- A **whole-form bulk-actions row** sits below all six domains for the "all 60
  in one click" case: *"All 64 indicators at once: [All unscored → 4] [→ 3]
  [→ 2] [→ 1]  ·  [Reset all to "Not scored"]"*
- Every bulk button shows a confirm dialog naming the scope and reassuring the
  appraiser that existing scores won't be touched. After fetch returns, every
  affected row's rating badge + saved pill animate in place; the sticky
  scoreboard updates per-domain and overall in real time.

### Fix 3 — Sticky live scoreboard (no more "did that save?")

- New `#aps-scoreboard` strip sits sticky below the global header at
  `top: 112px / 120px`, **visible at all times** while scoring. It shows
  `N / 60 indicators scored` plus six per-domain pills (`A · 7/10`, `B · 0/10`,
  …) that link to their domain anchors. When 60/60 is reached, an "All scores
  saved" badge appears. Every score change — single or bulk — updates these
  counters via the JSON response totals, no reload required.

### Fix 4 — Focus area trigger explanation surfaced in the UI

**Dr. Gandhi's report:** *"Did an observation and it didnt generate."* He
expected a focus area to appear and one didn't. **Root cause** (it's working as
designed, but the design wasn't visible to the user): the auto-feedback
generator's category rule in `generateFeedbackForObservation` is:

```
level >= 3 → 'glow'             (Strengths)
level === 2 → 'grow'             (Growth Areas)
level <= 1 → 'focus_area'        (Focus Areas)
```

Only indicators scored **1 · Does Not Meet Standards** auto-create a focus
area. Dr. Gandhi's test indicator was scored at level 2, so it correctly
landed in Growth Areas, not Focus Areas. There was also no visible explanation
of this rule, so the system felt opaque.

**Resolution** in `FeedbackColumn`:

- The Focus Areas column now renders a small amber hint at the top **explaining
  exactly when a focus area appears**:
  > 💡 **How focus areas appear:** generated automatically from any indicator
  > scored **1 · DNM**, or manually — change any feedback item's category to
  > *Focus area*, or add one below. They become the teacher's active focus
  > areas when you publish.
- The hint is intentionally only on the focus-area column (the other three
  columns are self-explanatory). It clarifies both the auto-rule **and** the
  always-available manual override (existing dropdown / "Add new" form).
- The promotion-to-teacher pipeline at `/publish` is unchanged — feedback
  items with `category='focus_area'` already insert into `focus_areas` and
  show up on the teacher's dashboard.

### Implementation notes

- All three SQL queries in `scoreboardTotals()` and `/bulk-score` use the
  correct table names (`framework_indicators`, `framework_domains`) and scope
  by `framework_id` so totals match the rendered UI exactly.
- The text-field auto-save engine (`[data-autosave]` on Subject, Grade,
  Scripted Notes, Private Notes, Overall Summary) was already AJAX as of the
  June 2 release — that flow remains untouched. This change closes the last
  redirect-on-save loop: the scoring grid.
- Bundle delta: `dist/_worker.js` grew from 599.01 kB → 616.53 kB (+17 kB) to
  accommodate the new client-side helpers and the bulk-score endpoint.

### Verification

Local smoke tests against `localhost:3000` as Shannon Faller (appraiser):

| Test                                                         | Result                       |
| ------------------------------------------------------------ | ---------------------------- |
| `POST /score` w/ JSON header, level=3                         | `ok:true`, totals returned ✓ |
| `POST /score` w/ JSON header, level=""                        | soft-delete, scored:0 ✓      |
| `POST /bulk-score` scope=domain, code=A, level=3              | applied 10, only Domain A ✓  |
| `POST /bulk-score` scope=all, level=3 with 1 manual score=2   | applied 49, manual preserved ✓ |
| Rendered draft page: bulk buttons, scoreboard, focus hint     | 35 bulk btns, 6 toolbars, 60 noscript ✓ |

---

## [June 4, 2026 — evening] — Two UX fixes from Dr. Gandhi: PD-hours nav surfacing + collapsed observation domains

Triggered by Dr. Gandhi's verbatim feedback during testing:

> *"The link to `https://alexander-marshall-growth.pages.dev/admin/settings/pd-hours` is broken so I cant actually get to where I need to edit the pd hours? Fix that. Also, can you always have the observation boxes collapsed by default so there isnt as much scrolling. We want to minimize as much scrolling as possible so if the boxes are collapsed by default each time that would be best."*

### Fix 1 — PD-hours target was unreachable from the global nav

**Root cause** (not a 404): the route `/admin/settings/pd-hours` always worked,
but it was reachable **only** from the `/admin` overview's quick-link button.
From any other admin page (Users, Data Management, Audit Log, etc.) there was no
nav entry pointing at it, so Dr. Gandhi correctly experienced the link as "broken
— I can't actually get there." Additionally, the heat-map widget on the
superintendent dashboard rendered a legend link to the admin-only route, which
sent superintendents to `/login` (looks broken to them too).

**Resolution:**

- Added **PD-Hours Target** as a top-level item in the super_admin sidebar nav,
  right under **Data Management**, with the `fas fa-stopwatch` icon
- `PdHoursSettingsPage` now sets `activeNav="admin-pd-hours"` so the nav item
  highlights correctly when on the page
- Heat-map legend is now role-aware: super_admins still see the "Admin →
  PD-hours target" inline link; everyone else (superintendent / appraiser /
  teacher) sees plain copy "Target is set by district admin." — no dead-end click

### Fix 2 — Observation domain accordions collapsed by default

**Resolution** in `appraiser.tsx`:

- All six Marshall domain `<details>` blocks (A–F) now render **without** the
  `open` attribute — they collapse on initial load
- Added an "Expand all domains" / "Collapse all" mini-toolbar **above** the
  accordions for one-click bulk control when needed
- Enhanced the sticky DomainTabs handler in `public/static/app.js` so that
  clicking a domain tab **auto-expands** the corresponding `<details>` block
  before scrolling — no extra click required. Deep-links like
  `/appraiser/observations/42#obs-domain-C` also auto-expand on first paint
- The existing per-domain "scored N / M" count still renders in the collapsed
  summary, so the appraiser sees at-a-glance progress before deciding which
  domain to open next

This collapses ~6 screens of scrolling into a single screen on the observation
form, which is the highest-traffic surface in the platform. Power users (who
prefer the long-form view) can still click "Expand all" once and have everything
laid out as before.

### Files touched

- `src/lib/layout.tsx` — nav item add, `PDHoursHeatMap.userRole` prop, role-aware legend
- `src/routes/admin.tsx` — `PdHoursSettingsPage` `activeNav` update
- `src/routes/appraiser.tsx` — removed `open` from domain `<details>`; added expand/collapse mini-toolbar; passes `userRole` to heat-map
- `src/routes/superintendent.tsx` — passes `userRole` to heat-map
- `public/static/app.js` — domain-tab click handler auto-expands `<details>`; initial-hash also expands; new event delegation for `data-obs-domains-action` buttons

### Deploy

- Built clean: 63 modules → `dist/_worker.js` 599.01 kB
- Deployed via BYOK to `https://alexander-marshall-growth.pages.dev` (aliased from `371c83f7.alexander-marshall-growth.pages.dev`)
- URL is locked and never changes per Dr. Gandhi's standing directive

---

## [June 4, 2026] — Pre-launch sweep + reports get sortable columns + heat-map sort/filter toolbar

Triggered by the June 4 audit report (which confirmed all prior blockers cleared) and
Dr. Gandhi's directive: *"Do that and do the heat map column sorting. Do that sorting
in all admin reports and superintendent reports so they have the flexibility to
visualize the data however they need."* This entry covers the two re-verification
sweeps the audit asked for **and** the report-flexibility upgrade.

### Pre-launch verification sweeps — both PASSED

| # | Sweep | Result |
| --- | --- | --- |
| 1 | End-to-end publish workflow on freshly-wiped DB: principal Shannon Faller → mini observation on teacher Jil Stahosky → score indicator 1 at level 2 → publish with signature | ✅ 1 obs, 1 score, 4 notifications, 1 auto-enrollment created with `target_level=2`, `est_minutes=60` (Option A tier baseline) — teacher dashboard renders growth-oriented language with zero level-prefix leaks |
| 2 | PD module CSV export → re-import idempotency on 180-module library | ✅ Export = 1.74 MB / 22,049 lines (multi-line module content); re-import = `"180 updated · 0 created · 0 skipped"`; row count, max_id, and `sum_est_min` all match before/after exactly |

### Hard-wipe FK fix (carried forward from June 3 night)

| # | Finding | Status | Action |
| --- | --- | --- | --- |
| W1 | `CLEAR ALL DEMO DATA` returns 500 with `D1_ERROR: FOREIGN KEY constraint failed: SQLITE_CONSTRAINT_FOREIGNKEY` | 🔴 Blocker | **Fixed** — `pd_enrollments.source_observation_id → observations(id)` is non-cascading; route now deletes `pd_enrollments` before `observations` (also documented full FK cascade map inline) |

### Reports flexibility upgrade — sortable columns + heat-map controls

Every admin and superintendent table now has client-side multi-column sorting,
and the PD Hours Heat-Map gets a sort + filter toolbar. Progressive enhancement:
if JS is disabled, tables render in their original order with no broken UI.

**Two new self-contained static helpers** (zero dependencies, ~6 KB total):

- `public/static/sortable.js` — Drives any `<table data-sortable="true" id="…">`. Type-aware comparators (`text` / `number` / `date` / `rating`), shift-click multi-sort with priority badges, stable sort, sessionStorage persistence per `pathname:tableId`, per-table reset button via `<button data-sort-reset="…">`. Per-cell `data-sort-value` overrides formatted display values so `formatDateTime("Jun 4, 2026, 11:42 AM CDT")` sorts by underlying ISO timestamp. Per-column `data-sort-disable="true"` excludes action/decoration columns.
- `public/static/heatmap-sort.js` — Drives PDHoursHeatMap (tile-based, not table-based). 9 sort modes (heat group / hours / % of target / internal / external / name / school) + 6 filter modes (all + 5 heat groups). Live "N of M shown" count. WeakMap-stored original DOM order so reset is deterministic. Persists per `pathname:gridId`.

Both helpers wired globally via `<script defer>` in `src/lib/layout.tsx`.

### Sortable surfaces (10 tables + 1 heat-map)

| Surface | Table id | Columns |
| --- | --- | --- |
| `/admin/users` | `admin-users-table` | Name / Email / Role / School / Last login |
| `/admin/schools` | `admin-schools-table` | Name / Grade span / Address / Phone |
| `/admin/data` (audit summary) | `admin-data-recent-audit` | When / Actor / Action / Entity / Rows / Detail |
| `/admin/data` (all observations) | `admin-all-observations` | ID / Type / Teacher / Observer / School / When / Status |
| `/admin/data/audit-log` | `admin-audit-log` | When / Actor / Action / Entity / Rows / Filters / Detail |
| `/admin/external-pd` | `admin-external-pd-audit` | Teacher / School / Activity / Provider / Hrs(self) / Hrs(apr) / Status / Reviewer / Submitted |
| `/superintendent` | `supt-by-school-table` | School / Grades / Teachers / Observations / Published |
| `/superintendent/schools` | `supt-school-${id}-teachers` (per school) | Teacher / Title / Published Obs / Last Observed |
| `/superintendent/teachers` | `supt-all-teachers` | Teacher / School / Title / Obs / Published / Last observed |
| `/superintendent/teachers/:id` | `supt-teacher-obs-history` | Date / Type / Appraiser / Status |
| `/superintendent/observations/:id` | `supt-obs-scores` | Domain / Indicator / Rating (numeric) |
| `/superintendent/insights` | `supt-insights-groups` | Group / Observations / Scores / Average (numeric) / Distribution(no-sort) |
| `/superintendent` (heat-map widget) | `pd-heatmap-grid-*` | Sort + Filter dropdowns, 9 modes × 6 filters |

### UX details

- Each sortable table gets a small `<button data-sort-reset>` ("Reset sort" with rotate-left icon) above the table; click to clear the saved sort and return to server-side order
- A one-line tooltip ("Click any column header to sort. Shift-click for multi-column sort.") sits below each reset button so the affordance is discoverable
- Header arrows render via CSS only — no extra DOM. Active column gets an arrow + priority badge `(1)`, `(2)` etc. for multi-sort chains
- `data-sort-value` overrides applied to every date cell so the sort key is the raw ISO timestamp, not the human-readable "Jun 4, 2026, 11:42 AM CDT" formatting
- Insights Average cell wraps a colored badge but sorts numerically because of `data-sort-value={aAvg}`
- Heat-map "Original (heat group)" reset uses a per-grid WeakMap of original DOM nodes — survives sort + filter cycles correctly

### JSX fragment fixes

The sortable wiring exposed three ternary-else branches that previously held a single
node but now hold three siblings (reset-button div + tooltip p + table div). All three
wrapped in fragments to satisfy esbuild's JSX parser:

- `superintendent.tsx:527-544` — Observation History table (per-teacher detail)
- `superintendent.tsx:693-748` — Insights group-by table
- `admin.tsx:2214-2236` — Recent audit-log preview on `/admin/data`
- `admin.tsx:2244-2283` — All observations table on `/admin/data`
- `admin.tsx:2323-2352` — Full audit-log viewer on `/admin/data/audit-log`

### Files touched

- `public/static/sortable.js` — **new** (reusable progressive-enhancement table enhancer)
- `public/static/heatmap-sort.js` — **new** (PDHoursHeatMap sort + filter helper)
- `src/lib/layout.tsx` — global `<script defer>` for both helpers; PDHoursHeatMap now emits stable `gridId`, sort/filter toolbar with 9 sort + 6 filter options + count label, per-tile `data-heatmap-tile` + `data-heat`/`data-total`/`data-pct`/`data-internal`/`data-external`/`data-name`/`data-school` attributes
- `src/routes/admin.tsx` — 6 tables wired; 4 date cells got `data-sort-value`; 3 ternaries fragment-wrapped
- `src/routes/superintendent.tsx` — 6 tables wired; date + average cells got `data-sort-value`; 2 ternaries fragment-wrapped
- `migrations/` — **no schema change** (this is a UI/UX layer)

### Deploy

- Built clean: 63 modules → `dist/_worker.js` 598.25 kB
- Deployed via BYOK to `https://alexander-marshall-growth.pages.dev` (aliased from `8c2a6e27.alexander-marshall-growth.pages.dev`) — canonical URL is locked and never changes per Dr. Gandhi's standing directive
- Both static helpers verified live on production via curl

---

## [June 3, 2026 — evening] — Second verification pass: two blockers cleared

Triggered by a second pre-launch verification report (ChatGPT retest as Dr. Rupak Gandhi).
The afternoon fix shipped exports + discoverability quick links; this evening pass
closes the remaining two blockers the retest surfaced.

### Findings actioned

| # | Finding | Status | Action |
| --- | --- | --- | --- |
| B1 | `/admin/data` returns Internal Server Error (`D1_ERROR: no such column: o.school_id`) | 🔴 Real blocker | **Fixed** — query rewritten to join through `users t` and read `t.school_id` (the `observations` table never had a `school_id` column — affiliation flows via the teacher) |
| B2 | Admin user edit form missing Fix 11 fields (subject area / classroom type / grade band) | 🔴 Real blocker | **Fixed** — create + edit forms now expose all three; POST handlers persist them; existing `teacherContextNote()` consumer in `db.ts` immediately picks them up |
| HM | Heat-map CSV/Print export buttons "missing" | ❓ False alarm | Verified buttons render in production header for both appraiser and superintendent views; tester missed them visually |

### Files touched (no schema change — fields already exist from migration 0008)

- `src/routes/admin.tsx`
  - `recentObs` query (BLOCKER 1) — replaced `o.school_id` with `t.school_id` and re-routed `LEFT JOIN schools` through the teacher
  - filtered-delete WHERE/SELECT (BLOCKER 1) — added `JOIN users t ON t.id = o.teacher_id`; school filter now uses `t.school_id = ?`
  - `POST /users/create` (BLOCKER 2) — accepts `subject_area`, `classroom_type`, `grade_band`; INSERT extended to persist them
  - `POST /users/:id/update` (BLOCKER 2) — accepts the same three fields; UPDATE extended; activity log records them
  - "Create user" card (BLOCKER 2) — new `<input>` (with `<datalist>` of common subjects) + two `<select>` dropdowns
  - Inline edit form per user row (BLOCKER 2) — same three fields, pre-populated from `u.subject_area / u.classroom_type / u.grade_band`

### Verified end-to-end (local D1)

```text
GET  /admin/data                  → HTTP 200 (was 500)
GET  /admin/data?school_id=1      → HTTP 200 (filter path also fixed)
GET  /admin/users                 → renders 13 sets of (subject_area, classroom_type, grade_band) form controls — 1 create form + 12 user rows
POST /admin/users/10/update       → fields persisted: NULL,NULL,NULL → Mathematics,departmentalized,6-8
```

No migration; no behavior change for any teacher / appraiser / coach / superintendent surface. Build: 587.29 kB worker bundle, 0 TypeScript errors.

---

## [June 3, 2026 — afternoon] — Pre-launch verification fixes

Round of fixes triggered by a comprehensive pre-launch verification report
(ChatGPT agent walk-through as Dr. Rupak Gandhi). The report confirmed most
fixes from prior rounds but flagged three real gaps and clarified one
permission boundary.

### Findings actioned

| # | Finding | Status | Action |
| --- | --- | --- | --- |
| 1A | PD Hours Heat-Map widget had no PDF/CSV export buttons | Real gap | **Fixed** |
| 1B | Admin-editable PD hours target setting "could not be located" | Discoverability gap | **Fixed** (route already existed) |
| 3C | Teacher "Recommended for You" card "not visible" | Tester misread | Confirmed correct — tester looked at `/teacher/pd` (LMS list) instead of `/teacher` (home). The new June 2 night entry already split the dashboard into "Recommended for You" + "Optional Stretch Growth" cards. |
| 4D | Coach external PD approval queue missing | Confirmed policy | Confirmed — external PD approval is **principal-only** by design. No coach external-PD code paths exist. |

### Findings 5A–5E, 6A, 6B, 6C — untested due to session limits

These were "Missing/Untested" in the report because the tester could not log
in as super_admin. The features themselves were verified to exist in code
during this round:
- `/admin/data` (Fix 8 Data Management + Reset Practice Data) — exists
- `/admin/pd/coverage` (Fix 9 PD Module Coverage) — exists
- `/admin/external-pd` (Fix 5 External PD Audit) — exists
- User profile subject fields (Fix 11) — exist
- PWA `manifest.json`, `sw.js`, icons, offline page — return 200
- CSV import/export round-trip — endpoints in place at `/admin/import/users` and `/admin/import/rubric`
- 33 logins — schema unchanged; existing forced-first-login flow still applies

### Files touched (text/UI/route work — no migration)

- `src/lib/pd_hours_export.tsx` (new) — Shared `buildPdHoursCsv()` +
  `renderPdHoursPrint()` helpers. Both reuse the heat-map summary so on-screen
  numbers and exported numbers come from the same render path.
- `src/lib/layout.tsx` — `PDHoursHeatMap` accepts a new `exportPrefix?: string`
  prop. When provided, the widget renders two header buttons:
  *Download CSV* (link to `{prefix}/csv`, `Content-Disposition: attachment`)
  and *Print / Save as PDF* (opens `{prefix}/print` in a new tab; the
  print view auto-shows a "Print / Save as PDF" button that uses the
  browser's native PDF engine).
- `src/routes/superintendent.tsx` — added `GET /superintendent/pd-hours/csv`
  and `GET /superintendent/pd-hours/print` (district-wide scope). Heat-map
  call site now passes `exportPrefix="/superintendent/pd-hours"`.
- `src/routes/appraiser.tsx` — extracted `buildAppraiserPdHours(db, userId)`
  helper so the home view and the export endpoints share one code path.
  Added `GET /appraiser/pd-hours/csv` + `GET /appraiser/pd-hours/print`
  (caseload-scoped — each appraiser sees only their assigned teachers).
  Heat-map call site now passes `exportPrefix="/appraiser/pd-hours"`.
- `src/routes/admin.tsx` — `AdminHome` quick links now expose four new
  buttons that the tester could not locate: **PD-hours target**, **PD
  Modules**, **PD Coverage**, **External PD Audit**.

### Confirmed coach policy (no code change)

Per Dr. Gandhi's instruction, **coach has no external-PD approval queue.**
External PD review remains a principal/appraiser responsibility. Confirmed by
code audit: zero `external-pd` routes exist on `src/routes/coach.tsx`, and
`src/lib/layout.tsx` exposes the External PD nav entry to `super_admin`
(`admin-ext-pd`) and `appraiser` (`ap-ext-pd`) only — never to `coach`.

### Production status

Build: **583.39 kB** worker bundle (one new lib file added), zero TypeScript
errors. End-to-end smoke tests verified locally before deploy:
- `GET /superintendent/pd-hours/csv` → 200, valid RFC-4180 CSV with 7 teacher
  rows and 1 header row.
- `GET /superintendent/pd-hours/print` → 200, full printable HTML page with
  embedded Print button, summary tiles, and per-teacher table.
- `GET /admin` → 200, all 4 new quick-link buttons present.
- `GET /admin/settings/pd-hours` → 200, target editor renders.

No D1 migration required (route/UI work only). Deployed to
<https://alexander-marshall-growth.pages.dev>.

---

## [June 3, 2026] — PD module est_minutes recalibration

Follow-up to Dr. Gandhi's audit of PD module timings. Previous values were
arbitrary baselines from prior migrations + generator defaults (every module
within a tier carried the identical estimate, but the per-tier numbers
themselves — 30 / 45 / 60 — had no learning-design study behind them).

### Migration `0011_pd_est_minutes_recalibration.sql`

Recalibrates all 180 active modules to tier-based estimates that reflect the
actual 8-step Learn → Practice → Apply scaffold plus deliverable workload:

| Tier | Previous | New | Rationale |
| --- | --- | --- | --- |
| Level 1 → 2 (Support, foundational) | 30 min | **45 min** | Learn 10 + Practice scaffolds 15 + classroom Apply + deliverable 20 |
| Level 2 → 3 (Support, refinement) | 45 min | **60 min** | Same scaffold but expects evidence collection |
| Level 3 → 4 (Stretch, leadership) | 60 min | **90 min** | Plural deliverable (student-impact + colleague-impact evidence) — closer to 2 hours when honest, 90 is a fair median |

### Decisions captured (per Dr. Gandhi, June 3, 2026)

- **Not tied to ND state PD-hour reporting.** These minutes are a planning
  aid for the teacher and a default pre-fill for the verifier.
- **Credit is tied to the deliverable.** Behavior unchanged — `verifyDeliverable`
  in `src/lib/pd.ts` still gates `hours_credited` at verification time. The
  verifier can accept the default (est_minutes / 60 rounded to 0.25h),
  override it, or set 0 to verify without credit.
- **No phase-minutes column.** The scaffold is constant across modules; adding
  Learn-min / Practice-min / Apply-min would not earn its complexity.

### Files touched

- `migrations/0011_pd_est_minutes_recalibration.sql` — 3 UPDATE statements
  (idempotent, scoped to `is_active = 1`).
- `src/routes/pd.tsx` — editor default for new modules raised from `45` → `60`
  (the most common tier baseline). The visible "Estimated minutes" field in
  the module editor now picks the tier-correct default based on `target_level`
  (45 / 60 / 90) when a value is missing.
- `scripts/gen_level3_modules.cjs` — generator default for Level 3 → 4
  modules updated `60` → `90` so re-running the generator stays in sync with
  the migration.

### Production status

Migration applied to local + remote D1 (`alexander-marshall-growth-production`,
7ad58a8f-621b-41e8-aa9a-dc27069eb039). All 180 active modules now report new
tier baselines. Deployed to <https://alexander-marshall-growth.pages.dev>.

---

## [June 2, 2026 — night] — Support PD vs. Stretch PD language refinement

Follow-up to the Level 3 → 4 release after Dr. Gandhi and ChatGPT analysis
flagged that the platform's surfacing language did not honor Marshall's
explicit position that **Effective is the standard**, not a deficiency.

The auto-enrollment **mechanism** was already correct — `autoEnrollForObservation`
binds the teacher's actual score level as `target_level` so a score of 1 routes
to the 1 → 2 module and a score of 2 routes to the 2 → 3 module. What changed
this round was the **language** everywhere a recommendation surfaces.

### New vocabulary

| Term | Trigger | Tone | Surfaces |
| --- | --- | --- | --- |
| **Support PD** | Auto-recommended when a teacher scores **exactly 1** (Level 1 → 2) or **exactly 2** (Level 2 → 3) on an indicator | Priority support / growth toward Effective practice | "Recommended for You" card, observation-publish notification |
| **Stretch PD** | Manual-only — self-selected, coach/appraiser recommended, or surfaced through the library | Optional leadership pathway toward *Highly Effective*; never assigned by the system | "Optional Stretch Growth" card (new), library browse, coach/appraiser dropdown with `[Stretch]` tag |

### Files touched (text-only edits — no migration)

- `src/lib/teacher_labels.ts` — `softenSourceForTeacher` now branches on
  `source_score_level`: 1 → *"Priority support recommended after a recent
  observation"*, 2 → *"Growth module recommended to reach Effective practice"*,
  3 → *"Optional stretch — you are meeting the Marshall standard"*.
- `src/lib/pd.ts` — `AUTO_ENROLL_THRESHOLD = 2` doc-comment rewritten to clarify
  that Level 3 NEVER auto-recommends. Notification body in
  `autoEnrollForObservation` is now score-specific: score-1 teachers see
  *"Priority support recommended for this element"*; score-2 teachers see
  *"Growth module recommended to reach Effective practice"*.
- `src/routes/pd.tsx` — coverage-report footer rewritten with two badges
  (**Support PD** / **Stretch PD**) and explicit "scored exactly 1 / exactly 2"
  language. The footer now states that an automatic recommendation at Level 3
  would unintentionally signal Effective is a deficiency.
- `src/routes/teacher.tsx` — teacher home splits the "Recommended for You" card
  into two cards. **Support PD** items (target_level 1 or 2) appear in the
  primary card with the amber lightbulb caption. **Stretch PD** items
  (target_level 3) move to a separate "Optional Stretch Growth" card with an
  indigo `arrow-up-right-dots` icon and an opt-in framing paragraph.
- `src/routes/appraiser.tsx` — the Recommend Module sidebar now prefixes each
  dropdown option with `[Support 1→2]`, `[Support 2→3]`, or `[Stretch 3→4]`,
  and the helper text below the button explains the difference between Support
  and Stretch recommendations.

### Production status

No new D1 migration required — this round is text/UI only. Build verified at
**572 kB worker bundle**, zero TypeScript errors. Deployed to
<https://alexander-marshall-growth.pages.dev>. All 180 active modules
unaffected; only their *surfacing language* changed.

---

## [June 2, 2026 — late evening] — Level 3 → 4 PD modules (full Marshall coverage)

Same-day follow-up after Dr. Gandhi flagged that the Marshall framework has
**three** growth transitions per indicator (1 → 2, 2 → 3, 3 → 4), but the
platform only carried modules for the first two. The Level 3 → 4 (Effective →
Highly Effective) tier was missing.

### Migration `0010_level3_pd_modules.sql`
Adds 60 new PD modules — one per Marshall indicator — at `target_level = 3`.
Bringing total active modules from 120 → **180** (60 × 3 transitions).

- **Same content scaffold** as the existing 120 modules: 8-step Learn →
  Practice → Apply, scripted-moments section, deliverable prompt, supervisor
  rubric, three curated research resources (Saphier, Marshall, City/Elmore).
- **Reframed for Highly Effective**: Level 3 → 4 modules are not "do more of
  the same." They prompt teachers through four leadership pathways —
  **Model** (invite a colleague to observe), **Coach** (run a coaching cycle),
  **Publish** (build a shareable artifact), or **Innovate** (try a move
  beyond the rubric). The deliverable requires BOTH student-impact evidence
  AND colleague-impact evidence so verification is plural ("students learn,
  colleagues grow, the school is better because you are on the staff").
- **Manual-only by design** ("Stretch PD"): Level 3 → 4 modules are NEVER
  auto-recommended. Effective is the Marshall standard, so an automatic
  recommendation at Level 3 would unintentionally signal Effective is a
  deficiency. Stretch PD surfaces through (a) teacher self-selection,
  (b) coach/appraiser recommendation via Fix 4, or (c) the Fix 9 coverage
  report. This matches the Marshall philosophy that growth past Effective
  is voluntary professional leadership work.
- **Idempotent**: each INSERT is guarded by
  `NOT EXISTS WHERE indicator_id = ? AND target_level = 3 AND title LIKE 'Level 3 → 4:%'`.
- Titles use the same sentence-case Marshall-aligned pattern as migration
  0009 — verbs match what Highly Effective looks like for THAT indicator
  (Modeling, Coaching, Publishing, Leading, Mentoring, Becoming the colleague
  leadership counts on, etc.).
- Module generation script committed at `scripts/gen_level3_modules.cjs` so
  the 60 modules can be re-derived or extended.

### Fix 9 coverage report extended to Level 3 → 4
`/admin/pd/coverage` now checks all three transitions:
- `CROSS JOIN (SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3)` instead of just `(1, 2)`
- Table grows from 2 → 3 status columns
- Header copy + footnote rewritten to explain that 1 → 2 modules auto-recommend
  when a teacher scores **exactly 1**, 2 → 3 modules auto-recommend when a
  teacher scores **exactly 2**, and 3 → 4 modules are manual-only ("Stretch
  PD") for teachers pushing toward Highly Effective
- Total cells: indicators × 3 levels (180 total)

### Production status
Re-deployed `dd546599` at <https://alexander-marshall-growth.pages.dev> with
migration 0010 applied to remote D1 (61 commands). 572.50 kB worker bundle.
Total active PD modules: **180** (60 × 3 transitions). Zero coverage gaps
across all three growth steps.

---

## [June 2, 2026 — evening] — Post-launch polish (PD title rewrite + mobile)

Same-day follow-up after Dr. Gandhi reviewed the PD module library and flagged:

1. **All 120 PD modules carried a generic auto-generated title** —
   `"Level X → Y: redesign your next {Indicator} lesson"` — with lowercase
   `redesign` and the word "lesson" appended to indicators that aren't
   lesson-based (Attendance, Professionalism, Outreach, Reporting,
   Leadership, Collaboration, Growth, etc.).
2. **Data Management 6-tile stats grid** collapsed to a single column on
   mobile because it was hard-coded to `md:grid-cols-6`.

### Migration `0009_pd_module_professional_titles.sql`
Rewrites the title of every active PD module (120 rows) with:
- **Sentence-case verbs** ("Designing...", "Building...", "Strengthening...",
  "Co-constructing...") instead of lowercase `redesign`.
- **Indicator-aware phrasing** aligned to Kim Marshall's *Teacher Evaluation
  Rubric* — lesson-design language for Domain A (Planning), classroom-routine
  language for Domain B (Management), in-lesson moves for Domain C (Delivery),
  formative-assessment language for Domain D (Monitoring), family-communication
  language for Domain E (Outreach), and career-growth language for Domain F
  (Professional Responsibilities).
- **Level transitions preserved** as a leading clause: `"Level 1 → 2: …"` /
  `"Level 2 → 3: …"` — these match what teachers see when an observation
  scores them at *Does Not Meet* or *Improvement Necessary*.
- **No more "Attendance lesson", "Professionalism lesson"** etc. —
  non-lesson indicators get role- and behavior-appropriate verbs.
- 120 idempotent `UPDATE` statements, scoped on
  `indicator_id × target_level`. Safe to re-run.

### Mobile responsiveness fix
`DataManagementPage` stats grid changed from `grid md:grid-cols-6`
→ `grid-cols-2 md:grid-cols-3 lg:grid-cols-6` so the page reads cleanly on
phone, tablet, and desktop.

### PWA verified end-to-end
- `manifest.json` returns 200 with full `name`, `short_name`, `start_url`,
  `scope`, `display: standalone`, `theme_color`, all three icon sizes
  (192/512/180), and three app shortcuts (Dashboard, Reports, Tour).
- `<link rel="manifest">` injected on every page via `<Layout>`.
- Service Worker `/static/sw.js` returns 200 with `Content-Type:
  application/javascript`, registered from `public/static/app.js` on first
  page load. Strategies: Cache First (static), Network First with
  `/offline.html` fallback (HTML), Stale-While-Revalidate (CDN), Network only
  (API / form POSTs).
- All icons, apple-touch-icon, and offline page reachable.
- "Install app" badge that appears in Chrome / Edge is the browser's native
  PWA install prompt — fires automatically once manifest validates. No code
  change needed; works on Windows, macOS, Android, iOS (Add to Home Screen).

### Production status
Re-deployed `90e1ffb3` at <https://alexander-marshall-growth.pages.dev> with
migration 0009 applied to remote D1 (121 commands). 572.08 kB worker bundle.

---

## [June 2, 2026] — Leadership-Meeting Upgrade (11 fixes for Aug 16 launch)

Live at <https://alexander-marshall-growth.pages.dev>. Migration `0008_june_2026_upgrade.sql`
applied to remote D1 (31 statements: new tables `external_pd_submissions`,
`teacher_goals`, `admin_audit_log`, `system_settings`; new columns `deleted_at` on
`observations`, `pd_enrollments`, `pd_deliverables`, `external_pd_submissions`,
`teacher_goals`; seeded `pd_hours_target_annual = 22.5`).

### Fix 1 — Tabbed Domain Navigation
Sticky pill-bar tab navigation by framework domain on every long indicator-list
page (observation editor, pedagogy library, PD coverage). Pure HTML + tiny
IntersectionObserver script so it degrades gracefully when JS is off. Shared
`<DomainTabs>` component in `src/lib/layout.tsx`.

### Fix 2 — Softer Growth-Oriented Language for Teachers
New `src/lib/teacher_labels.ts` exports `softenTitleForTeacher`,
`softenSourceForTeacher`, `hideGrowthSignalsForTeacher`. Teachers no longer see
the words "Growth Plan", "Growth Signal", or "Auto-enrolled" — those become
"Recommended for You", "Suggested for You", and "Suggested by your evaluation".
Coach + appraiser + admin views are unchanged.

### Fix 3 — Teacher PDF Export of PD Plan
`/teacher/pd/print` renders an A4-friendly print view that uses the browser's
own Print → Save-as-PDF (no wkhtmltopdf — Workers can't run binaries). One-click
button on `/teacher/pd`.

### Fix 4 — Manual Recommendation System
Coaches and principals can now explicitly recommend a PD module to a teacher,
bypassing the auto-enrollment-at-score-≤-2 path. New `recommendModule()` in
`src/lib/pd.ts`; sidebar form on `/appraiser/teachers/:id` and
`/coach/teachers/:id`. Coach permission boundary preserved: coach sees no scores.
Teacher receives a notification + a "Recommended for You" card on /teacher.

### Fix 5 — External PD Submission + Approval Workflow
New `external_pd_submissions` table. Teachers submit external PD (conferences,
workshops, certifications) at `/teacher/pd/external` with title, provider,
hours, evidence URL, and reflection. Appraisers review at
`/appraiser/external-pd` and `/appraiser/external-pd/:id` with three actions:
**Approve & credit hours** (sets `approved_hours`), **Ask for revision**, or
**Decline**. Admin audit view at `/admin/external-pd` (read-only, district-wide).

### Fix 6 — Unified PD Hours Tracking Heat-Map
Shared `<PDHoursHeatMap>` widget in `src/lib/layout.tsx` renders one card per
teacher with a progress bar split into internal (verified PD) + external
(approved PD) hours and a color-class tier (`met` ≥ 100% green, `near` ≥ 66%
amber, `mid` ≥ 33% sky, `low` < 33% red). Visible on:
- Superintendent home (`/superintendent`)
- Appraiser home (`/appraiser`) for assigned teachers only
- Teacher home (`/teacher`, self-view, hides peer rankings)

Annual target stored in `system_settings` (`pd_hours_target_annual`), editable
by super-admins at `/admin/settings/pd-hours`.

### Fix 7 — Approve & Credit Hours Gate
`verifyDeliverable()` now takes an optional `creditHours` argument (0.25-hour
rounding, 0-100 range cap). On `/pd/review/:id`, verifying a deliverable now
shows an **"Approve & credit hours"** green button alongside the amber **"Ask
for revision"** button — the credited hours flow directly into the Fix 6 heat-map
and the teacher's notification.

### Fix 8 — Mass Delete + Practice Reset Tooling
`/admin/data` (also reachable at `/admin/data-management`) expanded with:
- **Soft-delete toggle** (default ON) — writes `deleted_at = CURRENT_TIMESTAMP`
  instead of hard DELETE on every action below. Toggleable per-district.
- **Filtered delete** — school × date range × observer role filters, with a
  preview-then-delete flow and `DELETE FILTERED` phrase guard. Chunks IN-lists
  by 100 ids for D1 safety.
- **Restore** — any soft-deleted observation can be restored from the table.
- **Reset practice data** — wipes `pd_enrollments`, `pd_deliverables`,
  `external_pd_submissions`, and `teacher_goals` without touching observations;
  `RESET PRACTICE DATA` phrase guard.
- **Existing clear-observations + clear-all-demo** kept exactly as before; the
  first now honors the soft-delete toggle, the second always hard-wipes (it is
  the pre-handover button by design).
- **Admin audit log** — every destructive action is recorded in
  `admin_audit_log` with `actor_user_id`, `action`, `entity_type`, `entity_ids`
  (JSON, first 100 for bulk), `row_count`, `filters` (JSON), `detail`, `ip`,
  `user_agent`. Last-25 preview on `/admin/data`, full 200-row viewer at
  `/admin/data/audit-log`.

### Fix 9 — PD Module Coverage Gap Report
New super-admin route `/admin/pd/coverage` (registered **before** `/:id` per
Hono route precedence). `CROSS JOIN framework_indicators × {1,2} target_level`
surfaces every indicator-level pair that has zero published modules. Sticky
`<DomainTabs>` nav + per-domain `<details>` cards with red/green pills for
Level 1→2 and Level 2→3 coverage.

### Fix 10 — Teacher Personal Goal Tracking
New `teacher_goals` table. Teachers create up to 5 self-directed goals at
`/teacher/goals` (title, description, target date, indicator link, status:
`active | met | paused`). Appraisers see read-only goals on
`/appraiser/teachers/:id`. Notifications fire when a goal is marked **Met**.

### Fix 11 — Context-Aware Auto-Feedback
`POST /appraiser/observations/:id/generate-feedback` now reads the teacher's
`subject_area`, `classroom_type`, `grade_band` from the `users` table and
prepends a one-line context note ("Grade-band: 9-12, Self-contained ELA")
to both the scripted-notes summary and every Next-Step body. Helper
`teacherContextNote()` in `src/lib/db.ts`.

### Bug fixes
- `appraiser.tsx` + `coach.tsx`: `WHERE m.active = 1` → `WHERE m.is_active = 1`
  (matches `pd_modules` schema from migration `0003_notifications_and_pd.sql`).

### Ground rules honored
- ✅ Coach permissions unchanged (no scores anywhere in coach views)
- ✅ Every change additive or in-place; zero prior workflows altered
- ✅ Score-routed auto-enrollment (Support PD for scores of 1 or 2; Stretch PD
  manual-only), Learn → Practice → Apply gating, scripted-notes autosave,
  sign-and-acknowledge, forced-first-login password flow — all preserved
  byte-for-byte

### Production status
Live at <https://alexander-marshall-growth.pages.dev> as of June 2, 2026 ·
deployment `3f3674ea` · 19 assets · 572.05 kB worker bundle · D1 migration 0008
applied (31 statements).

---

## [April 23, 2026] — Evidence-based PD Enrichment

### Added
- **Pedagogy Library refresh** (migration `0005_rubric_improvements.sql`)
  - Updates `teacher_next_moves`, `coaching_considerations`, `resources`, and
    `feedback_starter` for indicators **B.d (levels 2-3)**, **B.e (level 3)**,
    and **E.c (levels 1-2)**, keyed on `(domain_code, indicator_code, level)`.
  - All other rubric cells untouched. Every cell editable via
    `/admin/pedagogy/:indicator/:level`.
- **PD module enrichment** (migrations `0006_pd_module_enrichments.sql`,
  `0007_pd_module_default_enrichments.sql`)
  - Four new nullable TEXT columns on `pd_modules`:
    `modeling_examples`, `collaboration_prompts`,
    `family_engagement_notes`, `contextual_differentiation`.
  - Seed data for B.d / B.e / E.c; `(DEFAULT — edit in /admin/pd)` starter text
    back-filled to the remaining 114 modules (120 modules total enriched).
- **Deliverable rubric in PD review queue** (migration `0006`)
  - New tables `pd_deliverable_rubric_criteria` (4 seeded criteria: Alignment,
    Completeness, Student Impact, Reflection) and `pd_deliverable_scores`
    (upsert per `enrollment × criterion`).
  - Principals/coaches score deliverables 1-4 with optional notes and a
    weighted-average roll-up. Decoupled from the Verify / Ask-for-revision
    decision.
  - Super-admin page `/admin/pd-rubric` to rename, reweight, reorder,
    deactivate, or add criteria without code changes.
- **`<EnrichmentBlock>` component**
  - Collapsible `<details>` panels under each phase:
    - Learn → `Modeling example` + `Elementary vs. secondary`
    - Practice → `Collaborate` + `Re-read modeling`
    - Apply → `Family engagement` + `Differentiation`
  - Empty fields silently skipped.
- **CSV import / export for PD modules**
  - `/admin/pd/export-csv` — exports all 120 modules including enrichment
    fields.
  - `/admin/pd/import-csv` — re-imports edited CSV; updates by `id`, creates
    when `id` is blank. Verified round-trip: 120 updated / 0 created / 0
    skipped.
- **CSV import / export for Pedagogy Library** (existing rubric importer now
  recognizes all four pedagogy columns: `teacher_next_moves`,
  `coaching_considerations`, `resources`, `feedback_starter`).

### UI Polish (observation editor)
- **All rubric domains open by default** — Domain E no longer hidden behind a
  closed `<details>`.
- **Async Generate/refresh feedback** — POSTs with `fetch`, inline
  `Organizing feedback… → ✓ Feedback refreshed` toast, preserves appraiser
  scroll position via `sessionStorage`, refreshes only the feedback list.
- **Unsaved-score red outline** — indicator row gets a 2-px red outline + Save
  button turns red/pulses/rewords to `Save score (unsaved)` the instant an
  appraiser touches a radio or evidence note.
- **Post-publish jump-back links** — three buttons appear once an observation
  is published or acknowledged: `Back to <teacher>'s page`,
  `All my teachers`, `PD review queue`.

### Fixed
- Admin PD router had a route-order bug where `/:id` captured
  `/export-csv`. Reordered so `/export-csv` and `/import-csv` resolve before
  the parameterized `/:id` handlers.
- Migration tracking cleaned up so the already-applied
  `0006_pd_module_enrichments.sql` (which had been run manually on local) is
  recorded in `d1_migrations` and no longer blocks subsequent applies.

### Preserved (byte-for-byte unchanged)
- Login, role routing, Marshall rubric structure (60 indicators × 4 levels),
  score-routed auto-enrollment (Support PD for scores of 1 or 2; up to 3
  modules per indicator), state-machine
  bridges (`recommended → learn_done`, etc.), scripted-notes autosave,
  sign-and-acknowledge flow, Floating PD Day LMS, reports, notifications,
  tour scripts.

### Deployment
- Production URL: <https://alexander-marshall-growth.pages.dev>
- Production D1 migrations 0005, 0006, 0007 applied `--remote`.
- GitHub `main` @ commit `4b901fb`.

---

## [Round 4 — April 2026] — Production-ready pass

### Added
- Fool-proof autosave on every keystroke with visible green/red pill status.
- Disclosure panel showing saved scripted notes at a glance.
- Interactive PD modules with real HTML checkboxes/radio groups and
  auto-saving answer boxes.
- Revised PD state machine with bridge transitions (no more "cannot move"
  errors).
- Updated guides and tours highlighting the new features.
- Full end-to-end smoke test harness.

---

## [Round 3 — April 2026] — Lesson-plan PD v2

### Added
- PD modules now lesson-plan-driven (**120 modules** total, up from earlier
  set). Research-based design.
- Easy reseeding via `seed/004_pd_modules.sql`.
- Redesigned teacher observation view with banners and sign-off clarification.

---

## [Round 2]

### Added
- In-app + Web Push notifications.
- Floating PD Day LMS.
- PD Completion Report.

---

## [Round 1]

### Added
- Initial platform: auth, roles (teacher / appraiser / coach /
  superintendent / super-admin), Marshall rubric framework,
  observations with scripted notes, auto-enrollment, pedagogy library,
  PD modules, dashboards, mobile responsiveness, installable PWA.
- Role-specific documentation in `docs/`.
