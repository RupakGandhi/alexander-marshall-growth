# Alexander Public Schools — Marshall Growth Platform

## 📚 Documentation

Complete role-specific user guides and a full technical developer guide are in **[`docs/`](docs/README.md)**:

- [Super Admin Guide](docs/USER_GUIDE_SUPER_ADMIN.md)
- [Superintendent Guide](docs/USER_GUIDE_SUPERINTENDENT.md)
- [Appraiser / Principal Guide](docs/USER_GUIDE_APPRAISER.md)
- [Coach Guide](docs/USER_GUIDE_COACH.md)
- [Teacher Guide](docs/USER_GUIDE_TEACHER.md)
- [**Technical Developer Guide**](docs/TECHNICAL_DEVELOPER_GUIDE.md) — architecture, schema, API reference, and step-by-step replication guide

## ✅ Production Transmittal Status (April 2026)

- **Cloudflare Pages**: live at https://alexander-marshall-growth.pages.dev — deployed from `main`.
- **Production D1** (`alexander-marshall-growth-production`, id `7ad58a8f-621b-41e8-aa9a-dc27069eb039`): all 4 migrations applied, all 4 seeds loaded — **including the v2 PD seed (120 lesson‑plan modules)**.
- **GitHub**: https://github.com/RupakGandhi/alexander-marshall-growth (synced with deploy).
- **Default password for seeded accounts**: `Alexander2026!` (forced change on first login).
- **Built for**: Dr. Rupak Gandhi / OptimizED Strategic Solutions.

No additional setup steps are required before the district can log in and begin using the platform.

## ⭐ What's New (Round 4 — April 2026, production‑ready pass)

### Fool‑proof auto‑save, with visible confirmation
- **Every text field** on an observation (Scripted notes, Private notes, Overall summary, Subject, Grade, Class context) now auto‑saves to the database on every keystroke (700 ms debounce) AND on blur — no "Save" button required.
- Each card shows a **prominent green pill** — `✓ Saved — 412 chars at 10:17` — the moment the server confirms the write. A red pill appears if a network blip stopped the save. Three pill states: grey `Nothing saved yet`, grey `Typing…`, green `Saved — N chars at HH:MM`, red `Not saved — try again`.
- A new **"Saved scripted notes in database"** disclosure under the Scripted Notes textarea shows the exact text the server is holding right now, so appraisers can verify at a glance — not just trust a toast.

### Fully interactive PD modules (no more "how do I circle this on a computer?")
- Rubric signals (`evidence_signals`) and research‑backed next moves (`teacher_next_moves`) are now rendered as **real HTML checkboxes**. Artifact choice is a **radio group** (Exit ticket / Board photo / Work sample / Transcript / Other). Every click saves itself.
- Every step has an inline auto‑saving **answer box** bound to `(phase, step)` so teachers can type directly in the module. No more copy‑paste to a Google Doc.
- A single green pill in the module header — `✓ Saved (learn) at 10:17` — confirms every input on every phase.
- The reflection row for each phase is now a JSON blob `{notes, steps, checks}` so we can render structured UI while keeping backward compatibility with old free‑text reflections.

### PD state machine no longer traps teachers
- `advanceEnrollment` now has an explicit set of **bridge transitions**: `recommended → learn_done`, `recommended → practice_done`, `recommended → submitted`, `started → practice_done`, `started → submitted`, `learn_done → submitted`. Whatever button a teacher clicks, the state machine fast‑forwards silently and backfills the missing timestamps (`learn_done_at`, `practice_done_at`).
- The "Start module" button is now optional — if a teacher skips it and clicks **Mark learn complete** first, the system auto‑starts the enrollment. **No more `cannot move recommended → learn_done` error.**
- Practice unlocks the moment Learn is marked complete (verified end‑to‑end in `tmp/e2e_smoke.sh`). Same for Apply after Practice.

### Guides and tours updated
- `docs/USER_GUIDE_TEACHER.md` — new "How you actually 'do' a module on the computer" section (interactive checkboxes + radio + autosave pill).
- `docs/USER_GUIDE_APPRAISER.md` — new "Auto‑save — your typing is never lost" section with the pill legend and the "Saved scripted notes in database" disclosure explained.
- `src/lib/tour.ts` — guided tour stops now point at the autosave pill and the interactive widgets.

### Verified end‑to‑end
`tmp/e2e_smoke.sh` runs the full flow: appraiser logs in → creates a draft → autosaves scripted/private/summary notes → reloads and confirms each text is persisted; teacher logs in → self‑enrolls in a lesson‑plan module → verifies step answers and checkboxes render → saves a Learn JSON reflection → clicks "Mark learn complete" from `recommended` state (bridge path) → confirms Practice unlocked → saves Practice JSON → advances to practice_done → confirms Apply unlocked → submits deliverable → confirms status is Submitted → reloads and confirms all typed answers persist. **All green.**

## ⭐ What's New (Round 3 — April 2026)

### Teacher observation view redesigned for clarity
- **"Please read the full observation below before signing"** banner at the top of every published observation, with chip‑links to Strengths / Growth Areas / Next Steps / Focus Areas / Rubric Scores / Signatures (each showing the count so nothing is missed).
- Warning banner if an observation was published with no feedback or scores, so the teacher can raise it with their appraiser before signing.
- Clearer acknowledgement block: signing means "seen and discussed", not agreement — and the optional response field is explicitly for disagreements or clarifying notes.

### PD modules redesigned: lesson‑plan‑driven, not generic PD
All 120 modules now follow a Pick → Read rubric → Spot gap → Rewrite → Script → Pick evidence → Teach → Submit template. Every module guides the teacher to redesign a real upcoming lesson so the next observation scores one rubric level higher on that specific Marshall indicator. The deliverable is a usable classroom artifact (lesson plan + scripted moments + real student evidence + impact note) — not a journal entry.

Research basis for every module: Marshall (2014/2023), Saphier et al. *The Skillful Teacher* (7th ed.), Hattie *Visible Learning for Teachers*, Wiggins & McTighe *Understanding by Design*, Wiliam *Embedded Formative Assessment*, Lemov *Teach Like a Champion 3.0*. Content is derived from the district's own pedagogy library at seed time — editing a library cell and re‑running `seed/004_pd_modules.sql` safely updates every affected module without invalidating existing teacher enrollments.

### Bug fix — PD LMS now works end‑to‑end
`src/lib/pd.ts:getEnrollment` was using `SELECT e.*, m.*` which collapsed the `e.id` column to `m.id` in SQLite/D1 — every Save/Advance/Submit form in the module workspace was posting to the wrong URL. Query now enumerates each column with an alias; Learn → Practice → Apply → Submit now verified working end‑to‑end for auto‑enrolled, self‑enrolled, and assigned modules.

## ⭐ What's New (Round 2)

### In‑app notifications + Web Push (replaces all email/SMS)
- **Bell in the header on every page.** Unread badge, click‑to‑open dropdown, "Mark all read", deep‑links to the related screen.
- **Web Push** to installed PWAs on any device — Android, iOS 16.4+, macOS, Windows, Chromebook. Zero subscription cost: the district owns its own VAPID key pair generated inside the app on first use.
- **Workflow‑wired**: publishing an observation → teacher notified; teacher acknowledges → appraiser (and super admin) notified; focus area opened → teacher notified; annual summary published → superintendents notified; PD deliverable submitted / verified / needs revision — all wired automatically.
- **Per‑user settings** on `/profile#notifications`:
  - 🔴 **Master push on/off** (one‑click "silence all devices")
  - 🔴 **Master in‑app on/off** (hide bell badge district‑wide for this user)
  - ✅ Per‑kind granular toggle (in‑app + push for every kind in the catalog)

### Floating PD Day — deterministic, research‑based PD LMS
- **120 PD modules seeded** (60 indicators × 2 growth levels), each with Learn → Practice → Apply content, a concrete **classroom deliverable prompt**, a rubric, and resource links.
- **Auto‑enrollment on low scores** (level ≤ 2): publishing an observation auto‑recommends up to 3 modules per low indicator into the teacher's PD LMS — exactly the same deterministic DB logic as the feedback engine, no AI calls.
- **Teacher "My PD LMS"** (`/teacher/pd`) shows every module recommended/assigned, tracks completion by phase, accepts the deliverable inside the platform, and keeps per‑phase reflection notes.
- **Supervisor PD Review** (`/pd/review`) — appraisers and coaches verify or send back for revision (and the teacher is notified in‑app/push).
- **Super‑admin module management** (`/admin/pd`) — add, edit, archive modules with full content, deliverable, rubric, resources.
- **Overload guard**: modules are idempotent per `(teacher × module × source observation)` and bucketed by status to avoid flooding.

### PD Completion Report
- New **`/reports/pd`** page and **`/reports/pd.csv`** export: every enrollment across the platform, filterable by teacher, school, rubric domain/indicator, status, source, and date range, sortable six ways, with KPI strip (total / verified / submitted / revision / in progress / total minutes).
- **Drill‑down** at `/reports/pd/:enrollmentId` shows the module, the teacher's actual deliverable (title + body + any attachment), all reflections, verification notes, and timestamps — so administrators can show exactly which modules a teacher completed and what they produced.
- Scoping matches the rest of the platform: teachers see only themselves, coaches/appraisers see only their assigned teachers, superintendent and super_admin see the district.

### Schools ↔ Appraisers (distinct role)
- Any user may be assigned to **one or more schools** via `user_schools`. This is distinct from the **appraiser** role: being in a school links a person to that building for scoping (appraiser queues, reports, superintendent drill‑down) while the **role** determines what they can *do*. A principal is `role = appraiser` **and** `user_schools = {their building}`; a district‑level appraiser can have `user_schools = {all buildings}`.

## Project Overview
- **Name**: Alexander Public Schools — Marshall Growth Platform
- **District**: Alexander Public School District · 601 Delaney St, Alexander, ND 58831 · 701‑828‑3334
- **Superintendent**: Leslie Bieber
- **Purpose**: District‑owned, production‑ready web + mobile (PWA) platform for the entire teacher‑evaluation and instructional‑feedback process based on the Kim Marshall Teacher Evaluation Rubric (2014).
- **Built for**: OptimizED Strategic Solutions (Dr. Rupak Gandhi)

## Completed Features

### Authentication & User Management (no external email service)
- Bcrypt‑hashed passwords stored in Cloudflare D1
- 30‑day session cookies (HttpOnly, Secure, SameSite=Lax)
- First‑login forced password change
- Super‑admin can create users, edit profiles, reset passwords (with session invalidation), deactivate users
- Every user can edit their own profile and change their own password
- No SendGrid / Resend / email dependencies

### Roles & Access Control
- **super_admin** — district‑wide control: users, assignments, schools, pedagogy library, framework, district settings
- **superintendent** — district overview + drill‑down by school and by teacher (read‑only)
- **appraiser** (principal) — observations, scoring, feedback, publishing
- **coach** — focus areas + teacher‑facing feedback only (no scores, no private notes)
- **teacher** — personal dashboard, published observations, acknowledgment with signature

### Marshall Rubric (seeded verbatim from 2014 PDF)
- 6 Domains (A–F), 60 indicators (10 per domain), 4 proficiency levels each = 240 descriptor cells
- Descriptors, level labels, and domain descriptions are stored in the framework tables and displayed exactly as written in the rubric PDF

### Pedagogy Library (240 cells, super‑admin editable)
One entry per (indicator × level), each containing:
- Interpretation in plain language
- Evidence signals (observable look‑fors)
- Teacher next moves (concrete strategies)
- Coaching considerations
- Research‑based resources (Marshall, Marzano, Hattie, Lemov, Danielson, Wiliam, UbD, Responsive Classroom, North Dakota standards)
- Feedback‑starter sentence used to seed auto‑generated feedback

All deterministic — **no runtime AI, no external APIs**. Super‑admin can edit any cell via `/admin/pedagogy`.

### Observation Workflow
1. Appraiser starts a **mini**, **formal**, or **annual_summary** observation on any assigned teacher
2. Scripted notes, private appraiser notes, overall summary, context (subject, grade, room, duration)
3. Click‑to‑score any of 60 indicators on the 4‑point Marshall scale with evidence note
4. **"Generate / refresh feedback"** — pulls the correct pedagogy library entries and auto‑fills **Glows, Grows, Focus Areas, Next Steps** as editable chunks
5. Appraiser edits or adds custom feedback items before publishing
6. **Sign & Publish** — canvas signature captured as base64 PNG; status → `published`
7. Focus‑area feedback items are promoted to persistent teacher focus areas
8. Teacher reviews, optionally responds in writing, **signs to acknowledge**; status → `acknowledged`
9. Coaches see only teacher‑facing feedback + focus areas; scores stay confidential
10. Superintendent can drill from district KPIs → school → teacher → any published observation

### District data (seeded)
- Alexander Public Schools district record (address, phone, active school year 2025–2026)
- Alexander Elementary School (PK‑5) + Alexander Junior/Senior High School (6‑12)
- Real staff from public directory: Supt. Leslie Bieber, 6‑12 Principal Shannon Faller, Elementary Principal Aaron Allard, Counselor/Coach Jacki Hansel, and 7 elementary teachers
- Default password for every seeded account: **`Alexander2026!`** (forces change on first login)
- Assignments pre‑linked: all seeded teachers → Aaron Allard (appraiser) + Jacki Hansel (coach)

### PWA
- `manifest.json`, `theme-color` meta, service worker at `/static/sw.js`, `apple-mobile-web-app-capable`
- Canvas signature pads with touch + mouse support (appraiser + teacher acknowledgement)

## Functional Entry URIs

### Public
| Path | Method | Purpose |
|------|--------|---------|
| `/` | GET | Redirect to role home or `/login` |
| `/login` | GET/POST | Sign‑in form |
| `/logout` | POST | End session |
| `/health` | GET | JSON health probe |

### Profile (all authenticated)
| `/profile` | GET/POST | Edit own profile + notification master switches + per‑kind preferences |
| `/profile/password` | POST | Change own password |
| `/profile/notifications` | POST | Save master push/in‑app + per‑kind in‑app/push preferences |

### Notifications & Web Push API (all authenticated, JSON)
| `/api/notifications/summary` | GET | `{ unread: N }` — polled every 45 s by the bell |
| `/api/notifications` | GET | Recent notification list for the dropdown |
| `/api/notifications/latest` | GET | Freshest unread, used by the service worker on push |
| `/api/notifications/:id/read` | POST | Mark one read |
| `/api/notifications/read-all` | POST | Mark all read |
| `/api/notifications/:id/delete` | POST | Remove one |
| `/api/push/public-key` | GET | District VAPID public key for `pushManager.subscribe` |
| `/api/push/subscribe` | POST | Register a browser push endpoint |
| `/api/push/unsubscribe` | POST | Remove one endpoint |

### Super Admin (`super_admin` only)
| `/admin` | GET | KPIs + activity log |
| `/admin/users` | GET | List + search + role filter |
| `/admin/users/create` | POST | Create user |
| `/admin/users/:id/update` | POST | Edit user |
| `/admin/users/:id/reset-password` | POST | Force password reset |
| `/admin/users/:id/delete` | POST | Deactivate |
| `/admin/assignments` | GET | Teacher ↔ appraiser/coach links |
| `/admin/assignments/create` | POST | Add assignment |
| `/admin/assignments/:id/delete` | POST | Remove assignment |
| `/admin/schools` | GET / POST | Manage schools |
| `/admin/pedagogy` | GET | 240‑cell matrix editor index |
| `/admin/pedagogy/:indicatorId/:level` | GET/POST | Edit any pedagogy cell |
| `/admin/framework` | GET | Read‑only Marshall rubric viewer |
| `/admin/district` | GET/POST | District info + school years |

### Appraiser
| `/appraiser` | GET | Assigned teachers grid |
| `/appraiser/teachers/:id` | GET | Teacher dashboard (observations + focus) |
| `/appraiser/teachers/:id/observations/start` | POST | Start new observation |
| `/appraiser/observations` | GET | All my observations |
| `/appraiser/observations/:id` | GET | Observation editor |
| `/appraiser/observations/:id/save` | POST | Save notes + context |
| `/appraiser/observations/:id/score` | POST | Score one indicator |
| `/appraiser/observations/:id/generate-feedback` | POST | Auto‑generate from pedagogy library |
| `/appraiser/observations/:id/feedback/save` | POST | Create/edit feedback chunk |
| `/appraiser/observations/:id/feedback/:itemId/delete` | POST | Delete chunk |
| `/appraiser/observations/:id/publish` | POST | Sign & publish to teacher |
| `/appraiser/observations/:id/delete` | POST | Delete draft only |

### Teacher
| `/teacher` | GET | Personal dashboard |
| `/teacher/observations` | GET | My published observations |
| `/teacher/observations/:id` | GET | View one published observation |
| `/teacher/observations/:id/acknowledge` | POST | Sign to acknowledge (+ optional response) |
| `/teacher/focus` | GET | My focus areas |
| `/teacher/pd` | GET | My PD LMS (Floating PD Day) — all recommended/assigned modules |
| `/teacher/pd/library` | GET | Browse all active PD modules (self‑enroll) |
| `/teacher/pd/modules/:id/enroll` | POST | Self‑enroll |
| `/teacher/pd/enroll/:id` | GET | Module workspace — Learn / Practice / Apply |
| `/teacher/pd/enroll/:id/advance` | POST | Advance phase |
| `/teacher/pd/enroll/:id/reflect` | POST | Save a per‑phase reflection |
| `/teacher/pd/enroll/:id/submit` | POST | Submit the deliverable (notifies supervisors) |
| `/teacher/pd/plans` | GET / POST | Build a multi‑module "Floating PD Day" plan |

### PD Review (appraiser + coach)
| `/pd/review` | GET | Queue of submitted deliverables to verify |
| `/pd/review/:enrollmentId` | GET | Read the deliverable + reflections |
| `/pd/review/:enrollmentId/verify` | POST | Mark verified (teacher notified) |
| `/pd/review/:enrollmentId/revision` | POST | Request revision (teacher notified) |
| `/pd/review/assign` | POST | Assign a specific module to a supervised teacher |

### PD Module Management (super_admin)
| `/admin/pd` | GET | List all modules with counts |
| `/admin/pd/new` | GET / POST | Create a new module |
| `/admin/pd/:id` | GET / POST | Edit module content, deliverable, rubric, resources |
| `/admin/pd/:id/archive` | POST | Soft‑archive |

### Reports — PD Completion (role‑scoped)
| `/reports/pd` | GET | Full on‑screen report: filters, KPI strip, sortable table |
| `/reports/pd.csv` | GET | CSV export of the filtered rows |
| `/reports/pd/:enrollmentId` | GET | Drill‑down: module + teacher's actual deliverable + reflections |

### Coach
| `/coach` | GET | My coached teachers |
| `/coach/teachers/:id` | GET | Focus areas + teacher‑facing feedback only |

### Superintendent
| `/superintendent` | GET | District KPIs + rating distribution + by‑school rollup |
| `/superintendent/schools` | GET | Drill by school |
| `/superintendent/teachers` | GET | Drill by teacher |
| `/superintendent/teachers/:id` | GET | Teacher observation history |
| `/superintendent/observations/:id` | GET | Read‑only published observation |

### API (JSON)
| `/api/pedagogy/:indicatorId/:level` | GET | Live pedagogy lookup for appraiser UI |
| `/api/notifications/*` | — | See "Notifications & Web Push API" above |

## Data Architecture

**Storage service**: Cloudflare D1 (SQLite at the edge). Session cookies issued server‑side.

**Main tables** (see `migrations/0001_initial_schema.sql`):
- `districts`, `schools`, `school_years`
- `users`, `sessions`
- `user_schools` *(0002)* — many‑to‑many link distinct from the `role` column
- `assignments` (teacher ↔ appraiser/coach per school year)
- `frameworks`, `framework_domains`, `framework_indicators`, `framework_descriptors`
- `pedagogy_library` (uniq on `indicator_id + level`)
- `observations`, `observation_scores`, `feedback_items`
- `focus_areas` (persistent, carry across observations)
- `activity_log` (audit trail)

**Notifications (migration 0003)**:
- `notifications` — the source of truth; bell, badge, and push all read from here
- `notification_preferences` — per‑user, per‑kind in‑app + push opt‑in
- `push_subscriptions` — one row per browser/device; auto‑pruned on 404/410
- `vapid_keys` — single‑row district VAPID identity, self‑generated

**PD LMS (migration 0003)**:
- `pd_modules` — keyed by `(indicator_id, target_level)`, holds Learn/Practice/Apply content, deliverable prompt, rubric, resources, `is_active`
- `pd_enrollments` — per‑teacher enrollment; status machine `recommended → started → learn_done → practice_done → submitted → verified / needs_revision / declined`
- `pd_reflections` — one row per `(enrollment, phase)` for free‑text teacher reflection
- `pd_deliverables` — the teacher's actual classroom deliverable (title, body, optional attachment url)
- `pd_plans` + `pd_plan_items` — multi‑module "Floating PD Day" plans

**User settings (migration 0004)**:
- `user_settings` — master push on/off + master in‑app on/off per user (quiet‑hours reserved)

**Seeds** (all idempotent `INSERT OR IGNORE` / `INSERT OR REPLACE`):
- `seed/001_district_and_framework.sql` — district, schools, Marshall framework + descriptors
- `seed/002_pedagogy_library.sql` — 240 pedagogy cells
- `seed/003_alexander_staff.sql` — real APS staff + assignments, default password `Alexander2026!`
- `seed/004_pd_modules.sql` — **120 PD modules** (60 indicators × 2 growth levels), deterministic, research‑based

## User Guide

### First login (any role)
1. Open the site → `/login`
2. Sign in with your district email and the default password `Alexander2026!`
3. You'll be redirected to `/profile?first=1` and required to set a new password
4. After saving the new password, you'll land on your role home

### Seeded accounts (password `Alexander2026!` — all require change on first login)
- Super Admin — `admin@alexanderschoolnd.us`
- Superintendent — `leslie.bieber@k12.nd.us`
- 6‑12 Principal / Appraiser — `shannon.faller@k12.nd.us`
- Elementary Principal / Appraiser — `aaron.allard@k12.nd.us`
- Instructional Coach — `jacki.hansel@k12.nd.us`
- Teachers — `jil.stahosky@k12.nd.us`, `amy.gaida@k12.nd.us`, `ellen.wittmaier@k12.nd.us`, `tristae.allard@k12.nd.us`, `brianna.ritter@k12.nd.us`, `erica.turnquist@k12.nd.us`, `tarynn.nieuwsma@k12.nd.us`

### Typical principal observation flow
1. `/appraiser` → click **Start mini-observation** on a teacher card
2. On the editor, write timestamped scripted notes during or right after the lesson
3. Score indicators you have evidence for (others can stay unscored)
4. Click **Generate / refresh feedback** — the system populates Glows, Grows, Focus Areas, Next Steps from the Pedagogy Library
5. Edit any chunk, add custom ones, delete any you don't want
6. Sign on the canvas → **Sign & Publish to teacher**
7. Teacher receives it on their dashboard; when they sign, status flips to **Acknowledged**

### Pedagogy Library editing
Super Admin → `/admin/pedagogy` → pick a domain → click any cell in the 60×4 matrix → edit interpretation, evidence signals, concrete strategies, coaching moves, resources, and feedback‑starter text. Every edit is immediately used by future auto‑feedback generation.

## Deployment

- **Platform**: Cloudflare Pages + Cloudflare Workers + Cloudflare D1
- **Framework**: Hono 4 + TypeScript JSX (server‑rendered)
- **Status**: ✅ Fully deployed and transmittal‑ready — edge worker live, production D1 bound and seeded (users, framework, pedagogy, 120 v2 PD modules).
- **Production URL**: https://alexander-marshall-growth.pages.dev
- **Cloudflare project name**: `alexander-marshall-growth`
- **Cloudflare D1 database**: `alexander-marshall-growth-production` (id `7ad58a8f-621b-41e8-aa9a-dc27069eb039`)
- **GitHub repository**: https://github.com/RupakGandhi/alexander-marshall-growth
- **Sandbox preview (local D1 mirror)**: https://3000-iz4zjax2wz4mwitsuv97o-b9b802c4.sandbox.novita.ai
- **Tech stack**: Hono 4 · Cloudflare D1 (SQLite) · Tailwind CDN · FontAwesome · bcryptjs · PM2 (dev) · Vite 6 · Wrangler 4
- **Last Updated**: 2026-04-23

## Mobile & PWA (Installable App)
The platform is fully mobile‑responsive and installable as a Progressive Web App on iOS, Android, Windows, macOS, and Chromebooks.

**Mobile responsiveness:**
- Hamburger drawer menu on phones (replaces the overflowing horizontal nav)
- Safe‑area insets for notched devices (iPhone, newer Android)
- 44px+ touch targets on every button/link
- 16px form inputs so iOS Safari never zooms on focus
- Every data table is wrapped in an `overflow-x-auto` scroller
- Filter grids (Reports, Admin) collapse to a single column below 640px
- Guided Tour tooltip pins to the bottom on phones so it never covers content

**PWA capabilities:**
- Installable on iOS (Add to Home Screen), Android (Install app prompt + FAB), desktop Chrome/Edge
- App shortcuts: *Dashboard*, *Reports*, *Guided Tour*
- Service worker (`/static/sw.js`, v3):
  - Cache‑first for `/static/*` (instant icons, CSS, JS)
  - Stale‑while‑revalidate for Tailwind / FontAwesome CDN
  - Network‑first for HTML with automatic fallback to `/static/offline`
  - Never caches POST/PUT/DELETE — form submissions always hit the server
- Offline page with auto‑retry on reconnect
- "New version available" banner when the SW updates
- Online/offline status banner
- Icons: 16, 32, 180 (Apple), 192, 512 — all generated from a navy‑on‑gold "A" mark

**How users install:**
- **Android / Chrome desktop:** a gold "Install app" floating button appears in the corner — one tap to install
- **iOS Safari:** one‑time hint card shows ("Tap ↑ Share, then *Add to Home Screen*")
- **Windows / macOS Edge/Chrome:** install icon in the address bar

## Guided Tour (role‑aware walkthrough)
Every signed‑in account gets a built‑in, zero‑install tour that highlights the exact features they can use:
- **Auto‑launches on first login** (per‑user, remembered in `localStorage`)
- **Gold "Guided Tour" pill** in the top navigation on every page
- **"Guided Tour" menu item** under the user's initials (upper‑right dropdown)
- **"Start the tour" card** on the Profile page, plus a button to re‑enable auto‑launch on next login
- **Five role‑specific tours** — Super Admin, Superintendent, Appraiser (Principal), Coach, Teacher
- Auto‑navigates between pages (`/admin → /admin/users → /admin/assignments → …`) while keeping your place
- Keyboard shortcuts: `→` Next, `←` Back, `Esc` close
- Implementation: `src/lib/tour.ts` (role → steps) + `public/static/tour.js` (engine) + tour CSS in `public/static/styles.css`. No third‑party tour libraries — fully self‑hosted.

### Local development
```bash
cd /home/user/webapp
npm run build                   # builds dist/
npm run db:migrate:local        # applies schema to local D1
npm run db:seed:local           # seeds district, framework, pedagogy, staff
pm2 start ecosystem.config.cjs  # serves at http://localhost:3000
```

### Cloudflare Pages deployment (once API key configured)
```bash
# 1. Create production D1 database and note the database_id
npx wrangler d1 create webapp-production
# 2. Copy database_id into wrangler.jsonc
# 3. Apply migrations and seeds to production D1
npx wrangler d1 migrations apply webapp-production
npm run db:seed:prod
# 4. Create Pages project and deploy
npx wrangler pages project create <project-name> --production-branch main --compatibility-date 2026-04-13
npx wrangler pages deploy dist --project-name <project-name>
```

## Features NOT Yet Implemented (v1.1 roadmap)
- Full APS staff roster beyond the 7 seeded teachers (current migration seeds page 1 of the public directory; additional teachers can be added via `/admin/users/create` or by extending `seed/003_alexander_staff.sql`)
- Annual rollover automation (manual via school_years table for now)
- ND state teacher‑evaluation export format
- Printable PDF observation reports (browser print stylesheet works today)
- Offline queueing in the service worker
- Superintendent pedagogy‑usage analytics (which library entries trigger most often)

## Transmittal Checklist for the District (April 2026)

All of the following are complete and deployed; this checklist is for your own walkthrough before go‑live.

1. Log into https://alexander-marshall-growth.pages.dev as super admin (`admin@alexanderschoolnd.us` / `Alexander2026!`) and change the password.
2. Reset every other seeded account to a fresh district‑chosen password from `/admin/users` (each user is still forced to change on first login).
3. Import the rest of the APS staff via `/admin/users` → *Bulk Import*; link appraiser + coach assignments via `/admin/assignments`.
4. From the principal's login, run a practice observation on a test teacher and publish it — verify the teacher receives an in‑app alert (and a push alert after they install the PWA).
5. From the teacher's login, open the published observation, read the banner, and acknowledge — verify the signature appears and a PD module auto‑enrolls if any score is ≤ 2.
6. Walk the teacher through one PD module end‑to‑end: Learn → Practice → Apply → Submit. Have the principal verify it from `/pd/review`.
7. Open `/reports/pd` as superintendent or super admin to confirm the completion appears in the district report.
8. Walk the superintendent through `/superintendent` for sign‑off.

## Re‑seeding production from the sandbox (for future updates)

```bash
cd /home/user/webapp
# Apply any new migrations
npx wrangler d1 migrations apply alexander-marshall-growth-production --remote
# Re‑seed (all seeds are idempotent — safe to re‑run)
npx wrangler d1 execute alexander-marshall-growth-production --remote --file=seed/004_pd_modules.sql
# Build + deploy
npm run build
npx wrangler pages deploy dist --project-name alexander-marshall-growth --branch main
```

---
© Alexander Public School District · Built by OptimizED Strategic Solutions · Marshall Growth Platform v1.0
