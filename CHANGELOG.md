# Changelog — Alexander Marshall Growth Platform

All notable changes to this project are documented here. The platform follows an
additive upgrade model: each round preserves every prior workflow (auto-save,
Learn → Practice → Apply gating, auto-enrollment at score ≤ 2, dashboards, role
permissions, forced-first-login password flow) byte-for-byte.

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
