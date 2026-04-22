# Alexander Public Schools — Marshall Growth Platform

Production-ready, cross-platform (phone, tablet, web) teacher growth & evaluation application for **Alexander Public School District** (Alexander, ND — Superintendent Leslie Bieber, K-12, ~344 students, two schools). Built around the **Kim Marshall Teacher Evaluation Rubric** (2014 revision) and designed to be used the way Marshall intends it: frequent unannounced mini-observations feeding a year-end summary, with strong role-based privacy between evaluators, coaches, and teachers.

## Project Overview
- **Name:** Alexander Public Schools — Marshall Growth Platform
- **Goal:** Digitize Marshall mini-observations, formal observations, and annual evaluation summaries; power constructive coaching from a shared Pedagogy Library; protect teacher privacy with per-role scoping; provide a superintendent/district-wide picture with drill-down.
- **Tech Stack:** Hono (edge) + TypeScript JSX + Tailwind (CDN) + Cloudflare Pages + Cloudflare D1 (SQLite).
- **Zero external services:** No AI APIs, no email provider. All user management, password resets, and "organized feedback" are local to the app and driven by an editable in-database Pedagogy Library.

## Currently Completed Features
### Authentication & Account Management
- Email + password login (bcrypt hashes; no external identity provider).
- Session cookies stored in D1 (`sessions` table), HTTP-only, 30-day sliding.
- Forced password-change on first login (`must_change_password` flag).
- Super Admin can create / deactivate users and reset any password (invalidates active sessions).
- User self-service profile & password-change page.

### Super Administrator (hidden / internal)
- Create all roles (teacher, appraiser, principal, instructional coach, superintendent, super admin).
- Link teachers to appraisers and coaches in the Assignments UI.
- Manage schools and district info.
- **Pedagogy Library editor** — grid of 240 cells (6 domains × ~10 indicators × 4 rating levels). Each cell stores:
  - Plain-language interpretation
  - Evidence signals (what this looks like in a classroom)
  - Concrete teacher next-moves
  - Coaching considerations (for principals/coaches)
  - Resources / PD readings
  - Editable feedback-starter sentence used by the auto-organizer
- Read-only Framework viewer (full Marshall rubric with all level descriptors).
- District info & school-year view.
- Activity log for audit.

### Appraiser / Principal
- "My Teachers" dashboard with the full assigned roster, last-observed date/status.
- Per-teacher view: observation history, open focus areas, prior growth areas.
- **Start a new observation** with one click (mini, formal, or annual summary) — timestamp recorded automatically.
- Observation editor:
  - Scripted note field for real-time typing during the mini.
  - Private appraiser-only notes (never visible to teacher or coach).
  - Public "overall summary" field.
  - Full Marshall rubric scoring grid — click any of the four level descriptors for any indicator, add evidence note, save.
- **"Organize feedback" button** — takes the scored indicators + scripted notes and produces editable glow / grow / focus-area / next-step chunks pulling from the Pedagogy Library. Appraiser can edit every chunk, add custom ones, or delete them before publishing.
- Sign-and-publish with on-canvas signature capture.
- Focus-area items automatically promote to the teacher's persistent focus-area list on publish.

### Instructional Coach
- Assigned-teacher list only. **Cannot see scores or appraiser private notes.**
- Per-teacher view shows only:
  - Active focus areas.
  - Published observation feedback chunks (glows / grows / focus / next-steps) with the appraiser's overall summary.

### Superintendent
- District overview: KPI tiles, rubric-rating distribution bar, school-by-school rollup.
- "By School" drill-down: all teachers per school with published counts and last-observed dates.
- "By Teacher" list: any teacher's full observation history.
- Read-only view of any published observation (scores + summary).

### Teacher
- Dashboard with active focus areas, published observation count, alerts for unacknowledged observations.
- Observation history (only published / acknowledged).
- Published observation page: summary, glows/grows/focus/next-steps, full rubric scores with evidence.
- Sign-to-acknowledge flow (canvas signature + optional teacher response).
- Focus Areas page carrying long-term growth commitments.

### Cross-Platform / Device
- Responsive (mobile, tablet, desktop) via Tailwind CDN.
- PWA manifest + service worker (add-to-home-screen; static assets cached offline).
- Canvas-based signature pad works with mouse **and** touch (iPad / phone).

## Functional Entry URIs
| Path | Method | Role | Purpose |
|---|---|---|---|
| `/` | GET | public | Redirects to `/login` or the role home |
| `/login` | GET / POST | public | Email + password sign-in |
| `/logout` | POST | any | End session |
| `/profile` | GET / POST | any | Profile + password change (`POST /profile/password`) |
| `/health` | GET | public | JSON health probe |
| `/teacher` | GET | teacher | Dashboard |
| `/teacher/observations` | GET | teacher | List of published observations |
| `/teacher/observations/:id` | GET | teacher | View a published observation |
| `/teacher/observations/:id/acknowledge` | POST | teacher | Sign + acknowledge (body: `signature` data-URL, `response`) |
| `/teacher/focus` | GET | teacher | Active focus areas |
| `/appraiser` | GET | appraiser | "My Teachers" |
| `/appraiser/teachers/:id` | GET | appraiser | Teacher profile + history |
| `/appraiser/teachers/:id/observations/start` | POST | appraiser | Start a new observation (body: `observation_type`, `subject`, `location`, `class_context`) |
| `/appraiser/observations` | GET | appraiser | All observations |
| `/appraiser/observations/:id` | GET | appraiser | Observation editor |
| `/appraiser/observations/:id/save` | POST | appraiser | Save notes & context |
| `/appraiser/observations/:id/score` | POST | appraiser | Score an indicator (body: `indicator_id`, `level`, `evidence_note`) |
| `/appraiser/observations/:id/generate-feedback` | POST | appraiser | Auto-organize feedback from scores + pedagogy library |
| `/appraiser/observations/:id/feedback/save` | POST | appraiser | Create / update a feedback chunk |
| `/appraiser/observations/:id/feedback/:itemId/delete` | POST | appraiser | Delete a feedback chunk |
| `/appraiser/observations/:id/publish` | POST | appraiser | Sign + publish to teacher (body: `signature`) |
| `/appraiser/observations/:id/delete` | POST | appraiser | Delete a draft observation |
| `/coach` | GET | coach | Assigned teachers |
| `/coach/teachers/:id` | GET | coach | Coach-safe teacher view (focus + feedback, no scores) |
| `/superintendent` | GET | superintendent | District overview & KPIs |
| `/superintendent/schools` | GET | superintendent | Per-school drill-down |
| `/superintendent/teachers` | GET | superintendent | All teachers list |
| `/superintendent/teachers/:id` | GET | superintendent | Teacher read-only detail |
| `/superintendent/observations/:id` | GET | superintendent | Read-only observation |
| `/admin` | GET | super_admin | Admin overview + activity log |
| `/admin/users` | GET | super_admin | List / create users (`POST /admin/users/create`) |
| `/admin/users/:id/update` | POST | super_admin | Edit a user |
| `/admin/users/:id/reset-password` | POST | super_admin | Reset password + force change |
| `/admin/users/:id/delete` | POST | super_admin | Deactivate user |
| `/admin/assignments` | GET | super_admin | List / create assignments (`POST /admin/assignments/create`) |
| `/admin/assignments/:id/delete` | POST | super_admin | Remove assignment |
| `/admin/schools` | GET | super_admin | List / add schools (`POST /admin/schools/create`, `POST /admin/schools/:id/update`) |
| `/admin/pedagogy` | GET | super_admin | Pedagogy Library grid |
| `/admin/pedagogy/:indicatorId/:level` | GET / POST | super_admin | Edit one cell |
| `/admin/framework` | GET | super_admin | Full Marshall rubric (read-only) |
| `/admin/district` | GET | super_admin | District info (`POST /admin/district/update`) |
| `/api/pedagogy/:indicatorId/:level` | GET | any authed | JSON pedagogy lookup for client hints |

## Data Architecture
- **Platform:** Cloudflare D1 (SQLite at the edge).
- **Core tables:**
  - `districts`, `schools`, `school_years`
  - `users` (bcrypt `password_hash`, role in `super_admin | superintendent | appraiser | coach | teacher`), `sessions`
  - `assignments` (teacher ↔ staff, `relationship` = `appraiser` | `coach`)
  - `frameworks` → `framework_domains` → `framework_indicators` → `framework_descriptors` (the full Marshall rubric)
  - `pedagogy_library` keyed by `(indicator_id, level)` — 240 rows, fully editable by super admin
  - `observations`, `observation_scores`, `feedback_items`, `focus_areas`, `activity_log`

## Seeded Alexander Public Schools Data
- District: Alexander Public School District, 601 Delaney St, Alexander ND 58831, 701-828-3334
- Schools: Alexander Elementary (PK-5), Alexander Junior/Senior High (6-12)
- Super Admin: `admin@alexanderschoolnd.us`
- Superintendent: `leslie.bieber@k12.nd.us` (Leslie Bieber)
- Principals: `shannon.faller@k12.nd.us` (6-12), `aaron.allard@k12.nd.us` (Elementary)
- Coach: `jacki.hansel@k12.nd.us` (counselor / instructional support)
- Seven real teachers from the public APS directory (Art, PE, Preschool, Kindergarten, 1st, 2nd) assigned to Aaron Allard (appraiser) and Jacki Hansel (coach).
- Full Marshall rubric (6 domains × 60 indicators × 4 descriptors = 240 descriptor cells).
- Full 240-cell Pedagogy Library with research-anchored interpretation, evidence signals, next-moves, coaching considerations, resources, and feedback-starter sentences for every `(indicator, level)` combination.

**All seeded accounts share the initial password `Alexander2026!` and must change it on first sign-in.**

## User Guide (Quick)
1. Super Admin signs in at `/login` with `admin@alexanderschoolnd.us` / `Alexander2026!`, is forced to set a new password, then uses `/admin/users` to reset/create accounts and `/admin/assignments` to link teachers, appraisers, and coaches.
2. A principal signs in, opens "My Teachers", clicks **Start mini-observation** on any teacher, scripts notes in the editor, scores the indicators they had evidence for, clicks **Generate / refresh feedback**, edits the auto-organized chunks, signs, and publishes.
3. The teacher sees the alert on their dashboard, opens the observation, reads the glows/grows/focus/next-steps, signs to acknowledge, and optionally adds a written response.
4. The coach sees only focus areas and the published feedback chunks — never the scores or private notes.
5. The superintendent sees district-wide KPIs and can drill into any school or teacher.
6. The super admin can edit any cell of the Pedagogy Library (`/admin/pedagogy`) at any time; changes affect all future auto-organized feedback.

## Deployment
- **Platform:** Cloudflare Pages + Cloudflare D1
- **Status:** ✅ Active (local dev) · production deployment pending Cloudflare API key
- **Last Updated:** 2026-04-22

### Local development (already configured)
```bash
# one-time
npm install
npm run build
npm run db:migrate:local
npm run db:seed:local

# running / restarting
pm2 start ecosystem.config.cjs          # first start
pm2 restart webapp                      # after code changes (wrangler hot-reloads)
npm run build && pm2 restart webapp     # after route changes

curl http://localhost:3000/health
pm2 logs webapp --nostream --lines 50
```

### Deploying to Cloudflare Pages (production)
```bash
# 1. Authenticate (via Deploy tab → Cloudflare API key) then:
npx wrangler whoami

# 2. Create the production D1 database
npx wrangler d1 create webapp-production
# Copy the database_id into wrangler.jsonc's d1_databases[0].database_id

# 3. Apply migrations & seed production D1
npm run db:migrate:prod
npm run db:seed:prod

# 4. Create and deploy the Pages project
npx wrangler pages project create webapp --production-branch main --compatibility-date 2024-01-01
npm run deploy    # runs `vite build` + `wrangler pages deploy dist`
```

### Remaining work (nice-to-have, non-blocking)
- Upload PWA icon-192.png / icon-512.png for true "add to home screen" branding.
- Add district-level CSV / PDF export of annual summaries.
- Optional: ND DPI reporting-format export once the ND DPI template is finalized.
