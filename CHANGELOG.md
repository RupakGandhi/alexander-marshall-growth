# Changelog — Alexander Marshall Growth Platform

All notable changes to this project are documented here. The platform follows an
additive upgrade model: each round preserves every prior workflow (auto-save,
Learn → Practice → Apply gating, auto-enrollment at score ≤ 2, dashboards, role
permissions, forced-first-login password flow) byte-for-byte.

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
- ✅ Auto-enrollment at score ≤ 2, Learn → Practice → Apply gating, scripted-notes
  autosave, sign-and-acknowledge, forced-first-login password flow — all
  preserved byte-for-byte

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
  auto-enrollment at score ≤ 2 (up to 3 modules per indicator), state-machine
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
