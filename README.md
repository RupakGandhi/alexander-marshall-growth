# Alexander Public Schools — Marshall Growth Platform

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
| `/profile` | GET/POST | Edit own profile |
| `/profile/password` | POST | Change own password |

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

## Data Architecture

**Storage service**: Cloudflare D1 (SQLite at the edge). Session cookies issued server‑side.

**Main tables** (see `migrations/0001_initial_schema.sql`):
- `districts`, `schools`, `school_years`
- `users`, `sessions`
- `assignments` (teacher ↔ appraiser/coach per school year)
- `frameworks`, `framework_domains`, `framework_indicators`, `framework_descriptors`
- `pedagogy_library` (uniq on `indicator_id + level`)
- `observations`, `observation_scores`, `feedback_items`
- `focus_areas` (persistent, carry across observations)
- `activity_log` (audit trail)

**Seeds** (all idempotent `INSERT OR IGNORE` / `INSERT OR REPLACE`):
- `seed/001_district_and_framework.sql` — district, schools, Marshall framework + descriptors
- `seed/002_pedagogy_library.sql` — 240 pedagogy cells
- `seed/003_alexander_staff.sql` — real APS staff + assignments, default password `Alexander2026!`

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
- **Status**: ✅ Local build + full workflow verified; deployment to Cloudflare pending (requires `setup_cloudflare_api_key`)
- **Tech stack**: Hono 4 · Cloudflare D1 (SQLite) · Tailwind CDN · FontAwesome · bcryptjs · PM2 (dev) · Vite 6 · Wrangler 4
- **Last Updated**: 2026-04-22

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
- Production D1 database creation + deployment to Cloudflare Pages (blocked on Cloudflare API key)
- GitHub repository push (blocked on GitHub auth)
- Full APS staff roster beyond the 7 seeded teachers (current migration seeds page 1 of the public directory; additional teachers can be added via `/admin/users/create` or by extending `seed/003_alexander_staff.sql`)
- Annual rollover automation (manual via school_years table for now)
- ND state teacher‑evaluation export format
- Printable PDF observation reports (browser print stylesheet works today)
- Offline queueing in the service worker
- Superintendent pedagogy‑usage analytics (which library entries trigger most often)

## Recommended Next Steps
1. Run `setup_cloudflare_api_key` and complete the production deployment above
2. Run `setup_github_environment` and push to the user's selected GitHub repository
3. In production, log in as super admin, force‑change the seeded password, then reset all other seeded accounts to fresh passwords the district can distribute in person
4. Import the rest of the APS staff via `/admin/users` and link appraiser + coach assignments via `/admin/assignments`
5. Walk the superintendent through `/superintendent` for sign‑off
6. Replace the default‑password pattern with a district‑chosen seed phrase in `seed/003_alexander_staff.sql` if you prefer

---
© Alexander Public School District · Built by OptimizED Strategic Solutions · Marshall Growth Platform v1.0
