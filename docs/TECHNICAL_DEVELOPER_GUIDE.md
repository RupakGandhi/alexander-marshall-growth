# Technical Developer Guide
## Alexander Public Schools — Marshall Growth Platform

**Audience:** Software engineers, technical leads, and DevOps staff who need to understand, maintain, extend, or replicate this platform.

**Version:** 1.0 (April 2026)
**Repository:** https://github.com/RupakGandhi/alexander-marshall-growth
**Production URL:** https://alexander-marshall-growth.pages.dev

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Technology Stack](#3-technology-stack)
4. [Project Structure](#4-project-structure)
5. [Database Schema](#5-database-schema)
6. [Authentication & Authorization](#6-authentication--authorization)
7. [Routing & Role Scoping](#7-routing--role-scoping)
8. [Complete API Reference](#8-complete-api-reference)
9. [Observation Workflow (State Machine)](#9-observation-workflow-state-machine)
10. [Report Builder (CSV & PDF)](#10-report-builder-csv--pdf)
11. [Bulk CSV Import / Export](#11-bulk-csv-import--export)
12. [Pedagogy Library](#12-pedagogy-library)
13. [Guided Tour Engine](#13-guided-tour-engine)
14. [Progressive Web App (PWA)](#14-progressive-web-app-pwa)
15. [Mobile Responsiveness](#15-mobile-responsiveness)
16. [Frontend Conventions (JSX in Hono)](#16-frontend-conventions-jsx-in-hono)
17. [Security Model](#17-security-model)
18. [Deployment & Environments](#18-deployment--environments)
19. [Local Development Setup](#19-local-development-setup)
20. [Replication Guide (Step-by-Step)](#20-replication-guide-step-by-step)
21. [Troubleshooting & Operations](#21-troubleshooting--operations)
22. [Extension Points & Roadmap](#22-extension-points--roadmap)

---

## 1. Executive Summary

The Marshall Growth Platform is a serverless, edge-deployed web application that digitizes the complete Kim Marshall (2014) teacher-evaluation workflow for a school district. It runs entirely on Cloudflare's edge infrastructure — no long-running servers, no external runtime dependencies, no third-party data processors.

### What the application does

- Manages **users** across five roles (super_admin, superintendent, appraiser, coach, teacher) with bcrypt-hashed credentials and cookie sessions.
- Stores the **Marshall rubric**: 6 domains × 10 indicators × 4 proficiency levels = **240 descriptor cells**, with a parallel **pedagogy library** (240 rich-content cells) that drives auto-generated feedback.
- Runs the full **observation workflow**: start → script notes → score indicators → glows/grows/focus/next steps → private notes → dual signatures → publish → teacher acknowledge.
- Produces **CSV and PDF reports** with multi-select filters (teachers, schools, appraisers, date ranges, observation types) and eight CSV row modes.
- Supports **bulk CSV import** of users (with pipe-separated multi-school linking) and **rubric export/import** for cross-district portability.
- Provides a **role-specific guided tour**, fully installable **PWA**, and responsive mobile UI.

### Key design principles

| Principle | How it is implemented |
|-----------|-----------------------|
| Deterministic, no runtime AI | Feedback auto-generation reads from the `pedagogy_library` table based on scored indicators and levels — not an LLM call. |
| Minimal attack surface | Single Cloudflare Pages deployment, D1 database binding, bcrypt passwords, HttpOnly cookies, no third-party auth providers. |
| Server-rendered JSX | Hono's JSX renderer emits HTML directly from edge Workers; client JS is a thin layer (~4 KB) for signature pad, menus, and PWA. |
| Edge-first | All routes run at Cloudflare's edge; D1 provides globally-replicated SQLite reads. |
| Replicable | One D1 database + two migration files + three seed SQL files = any district can stand up a fresh instance in ~15 minutes. |

---

## 2. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  HTML (SSR)  │  │ app.js ~4 KB │  │ tour.js ~13 KB       │   │
│  │  Tailwind CDN│  │ signature pad│  │ guided tour engine   │   │
│  │  FontAwesome │  │ menu toggles │  │ role-specific steps  │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
│           + Service Worker (sw.js) — PWA cache layer            │
└─────────────────────────────────────────────────────────────────┘
                              │ HTTPS
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                  CLOUDFLARE PAGES (edge)                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │              Hono Worker (src/index.tsx)                │    │
│  │  ┌───────────┐ ┌─────────────┐ ┌──────────────────────┐ │    │
│  │  │ /auth     │ │ /teacher    │ │ /admin               │ │    │
│  │  │ /profile  │ │ /appraiser  │ │ /superintendent      │ │    │
│  │  │ /reports  │ │ /coach      │ │ /api  /health        │ │    │
│  │  └───────────┘ └─────────────┘ └──────────────────────┘ │    │
│  │  Shared libs: auth.ts, db.ts, csv.ts, tour.ts, layout   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                              │ D1 binding (DB)                  │
│                              ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │   Cloudflare D1 (SQLite)                                │    │
│  │   districts, schools, school_years, users, sessions,    │    │
│  │   user_schools, assignments, frameworks,                │    │
│  │   framework_domains, framework_indicators,              │    │
│  │   framework_descriptors, pedagogy_library, observations,│    │
│  │   observation_scores, feedback_items, focus_areas,      │    │
│  │   activity_log                                          │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
```

### Request lifecycle

1. Browser sends request → Cloudflare Pages edge (closest PoP).
2. Worker loads the Hono app (`src/index.tsx`) — cold start <10 ms.
3. Auth middleware reads `aps_session` cookie, hits `sessions` + `users` in D1.
4. Role-check middleware rejects (302 to `/login`) or sets `c.set('user', u)`.
5. Route handler queries D1, server-renders JSX (HTML + inline `<script>__APS_TOUR__ = {...}</script>`).
6. Response returns HTML (no client-side routing / hydration).

---

## 3. Technology Stack

| Layer | Technology | Version | Why |
|-------|------------|---------|-----|
| Runtime | Cloudflare Workers | — | No servers, global edge, free tier |
| Database | Cloudflare D1 (SQLite) | — | Native binding, replicated, cheap |
| Web framework | Hono | ^4.12.12 | Tiny (~30 KB), Workers-native, JSX built-in |
| Password hashing | bcryptjs | ^3.0.3 | Pure JS (no native deps), Workers-compatible |
| JWT/crypto | jose | ^6.2.2 | (imported but sessions use DB tokens, not JWT) |
| Build tool | Vite + @hono/vite-build | ^6.3.5 / ^1.2.0 | SSR bundle into `dist/_worker.js` |
| Dev tool | @hono/vite-dev-server | ^0.18.2 | Hot reload with Cloudflare adapter |
| Deploy | wrangler | ^4.4.0 | Cloudflare CLI |
| Styling | Tailwind CDN | 3.x | No build step for CSS |
| Icons | Font Awesome CDN | 6.4.0 | No build step |
| PWA | Vanilla Service Worker | — | ~1 KB, three-tier cache strategy |

### Deliberate non-choices

- **No React / Vue / Svelte:** Hono JSX is server-only; no client hydration means faster first paint and smaller payload.
- **No external auth (Auth0, Clerk):** single-district system, bcrypt + D1 sessions are sufficient and cost nothing.
- **No ORM (Prisma, Drizzle):** D1's prepared-statement API is already minimal; an ORM would bloat the Worker past the 10 MB limit.
- **No client-side router:** Hono server-renders every page; the PWA service worker caches HTML shells for offline.

---

## 4. Project Structure

```
/home/user/webapp/
├── docs/                            # This guide + user guides
│   ├── TECHNICAL_DEVELOPER_GUIDE.md
│   ├── USER_GUIDE_SUPER_ADMIN.md
│   ├── USER_GUIDE_SUPERINTENDENT.md
│   ├── USER_GUIDE_APPRAISER.md
│   ├── USER_GUIDE_COACH.md
│   └── USER_GUIDE_TEACHER.md
│
├── migrations/                      # D1 schema migrations
│   ├── 0001_initial_schema.sql      # 16 tables, all indexes
│   └── 0002_multi_school_and_indexes.sql  # user_schools junction + report indexes
│
├── seed/                            # Seed data loaded after migrations
│   ├── 001_district_and_framework.sql  # District, rubric (240 descriptors)
│   ├── 002_pedagogy_library.sql        # 240 pedagogy entries
│   └── 003_alexander_staff.sql         # Initial super_admin, schools, year
│
├── public/                          # Static assets (served by Pages)
│   └── static/
│       ├── app.js            (4.7 KB)  signature pad, SW register, menus
│       ├── tour.js           (13 KB)   Guided Tour engine
│       ├── styles.css        (5.2 KB)  global CSS, tour styles, mobile nav
│       ├── style.css         (legacy, 49 bytes — safe to delete)
│       ├── sw.js             (~2 KB)   Service Worker v3
│       ├── manifest.json               PWA manifest
│       ├── offline.html                Offline fallback page
│       ├── icon-192.png / icon-512.png PWA icons
│       ├── apple-touch-icon.png        iOS home-screen icon
│       ├── favicon-16.png / 32.png / favicon.ico / favicon.png
│       └── icon-source.png   (1024)    Source art for generated icons
│
├── src/
│   ├── index.tsx                    # Hono app entry, route mounting
│   ├── renderer.tsx                 # JSX renderer setup
│   │
│   ├── lib/
│   │   ├── types.ts          (29 ln) Bindings, UserRole, User, Variables
│   │   ├── auth.ts           (76 ln) bcrypt, sessions, requireAuth, requireRole
│   │   ├── db.ts            (244 ln) Shared DB query helpers
│   │   ├── csv.ts            (84 ln) CSV escape, parse, flatten observation rows
│   │   ├── ui.ts             (60 ln) roleLabel, roleHomeUrl, Card, Button
│   │   ├── layout.tsx       (278 ln) <Layout>, navFor, navItems, mobile nav
│   │   └── tour.ts          (356 ln) Role-specific tour step arrays + getTour
│   │
│   └── routes/
│       ├── auth.tsx          (78 ln) /login, /logout, forced-reset flow
│       ├── profile.tsx      (134 ln) /profile edit info, change password
│       ├── teacher.tsx      (300 ln) /teacher dashboard, obs view, acknowledge
│       ├── appraiser.tsx    (772 ln) /appraiser full observation workflow
│       ├── coach.tsx        (174 ln) /coach read-only teacher view
│       ├── superintendent.tsx (315 ln) /superintendent KPIs + drill-down
│       ├── admin.tsx       (1388 ln) /admin users, assignments, schools, etc.
│       ├── reports.tsx      (804 ln) /reports 3-step builder + CSV + PDF
│       └── api.tsx           (32 ln) /api/* lightweight JSON endpoints
│
├── ecosystem.config.cjs              # PM2 config (dev only)
├── wrangler.jsonc                    # CF Pages + D1 binding
├── vite.config.ts                    # Vite + Hono Cloudflare adapter
├── package.json                      # Scripts + deps
├── tsconfig.json                     # TS config with JSX
└── README.md
```

**Total source LOC:** ~5,124 lines of TS/TSX (routes + libs), ~300 lines CSS, ~18 KB client JS.

---

## 5. Database Schema

All tables are defined in `migrations/0001_initial_schema.sql` and `migrations/0002_multi_school_and_indexes.sql`.

### 5.1 Core identity & organization

```sql
districts(id PK, name, address, city, state, zip, phone,
          logo_url, active_framework_id, active_school_year, created_at)

schools(id PK, district_id FK→districts, name, grade_span,
        address, phone, created_at)

school_years(id PK, district_id FK, label, start_date, end_date, is_current)

users(id PK, district_id FK, school_id FK→schools,
      email UNIQUE, password_hash, first_name, last_name,
      role CHECK IN ('super_admin','superintendent','appraiser','coach','teacher'),
      title, phone, avatar_url, active BOOLEAN,
      must_change_password BOOLEAN, last_login_at, created_at, updated_at)
  INDEX(email), INDEX(role), INDEX(school_id)

user_schools(id PK, user_id FK, school_id FK,
             is_primary BOOLEAN, UNIQUE(user_id, school_id),
             created_at, updated_at)
  INDEX(user_id), INDEX(school_id)

sessions(id PK TEXT token, user_id FK, expires_at, created_at, ip, user_agent)
  INDEX(user_id)
```

**user_schools** is the multi-school junction added in migration `0002`. `users.school_id` remains as the *primary* school (backfilled into `user_schools` with `is_primary=1`). Every query that lists "all staff at school X" must UNION both tables, or use the junction alone now that backfill is complete.

### 5.2 Assignments (teacher ↔ staff)

```sql
assignments(id PK, teacher_id FK→users, staff_id FK→users,
            relationship CHECK IN ('appraiser','coach'),
            school_year_id FK, active BOOLEAN, created_at)
  INDEX(teacher_id), INDEX(staff_id)
```

A teacher can have multiple appraisers and multiple coaches. Admins manage via multi-select at `/admin/assignments`.

### 5.3 Rubric (framework)

```sql
frameworks(id PK, district_id, name, version, description,
           scale_levels INTEGER, is_active BOOLEAN, created_at)

framework_domains(id PK, framework_id FK, code, name, description, sort_order)
  -- 6 rows: A-F

framework_indicators(id PK, domain_id FK, code, name,
                     description, sort_order)
  -- 60 rows: 10 per domain

framework_descriptors(id PK, indicator_id FK,
                      level INTEGER (1-4), label, descriptor_text)
  -- 240 rows: 4 per indicator
```

### 5.4 Pedagogy library

```sql
pedagogy_library(id PK, indicator_id FK, level INTEGER,
                 interpretation TEXT,
                 evidence_signals TEXT,
                 teacher_next_moves TEXT,
                 coaching_considerations TEXT,
                 resources TEXT,
                 feedback_starter TEXT,
                 updated_by FK→users, updated_at,
                 UNIQUE(indicator_id, level))
  -- 240 rows
```

**One row per (indicator, level)**. When an appraiser clicks *Generate feedback*, the app looks up each scored indicator in this table and creates `feedback_items` rows using the library's `teacher_next_moves` and `feedback_starter` text.

### 5.5 Observation workflow

```sql
observations(id PK, teacher_id FK, appraiser_id FK,
             school_year_id FK, framework_id FK,
             observation_type CHECK IN ('mini','formal','annual_summary'),
             class_subject, class_grade, class_location, class_period,
             observed_at, duration_minutes,
             status CHECK IN ('draft','published','acknowledged'),
             notes_script TEXT, notes_private TEXT,
             summary_public TEXT,
             appraiser_signature_png TEXT,
             teacher_signature_png TEXT,
             published_at, acknowledged_at,
             teacher_response TEXT,
             created_at, updated_at)
  INDEX(teacher_id), INDEX(appraiser_id), INDEX(status),
  INDEX(observed_at), INDEX(observation_type)  -- added in 0002

observation_scores(id PK, observation_id FK, indicator_id FK,
                   level INTEGER, evidence_note TEXT,
                   UNIQUE(observation_id, indicator_id))

feedback_items(id PK, observation_id FK, indicator_id FK nullable,
               category CHECK IN ('glow','grow','focus_area','next_step'),
               title, body, sort_order, source, created_at, updated_at)

focus_areas(id PK, teacher_id FK, indicator_id FK,
            status CHECK IN ('active','closed'),
            opened_at, closed_at, opened_from_observation_id FK,
            notes TEXT)
  INDEX(teacher_id)

activity_log(id PK, user_id FK, entity_type, entity_id,
             action, details TEXT JSON, created_at)
```

### 5.6 Referential integrity

All FKs use `ON DELETE` defaults (RESTRICT) except `sessions.user_id` (`ON DELETE CASCADE`). "Deleting" a user is always a soft-delete (`active=0`); cascade delete would orphan historical observations.

---

## 6. Authentication & Authorization

**File:** `src/lib/auth.ts` (76 lines, entire module).

### 6.1 Password hashing

```ts
import bcrypt from 'bcryptjs';
export async function hashPassword(p: string) { return bcrypt.hash(p, 10); }
export async function verifyPassword(p: string, h: string) { return bcrypt.compare(p, h); }
```

- Cost factor 10 (~70 ms on Workers isolate) — balances UX and brute-force resistance.
- `bcryptjs` is pure JS; it works in Workers' V8 isolate without WASM or native modules.

### 6.2 Sessions

- On successful login, a random 32-byte hex token is generated with `crypto.getRandomValues`.
- Stored in `sessions(id=token, user_id, expires_at = now+30d, ip, user_agent)`.
- Sent as cookie `aps_session=<token>` with flags `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
- On every request, `getCurrentUser(c)` reads the cookie, joins `sessions` + `users`, returns `User | null`.
- Logout deletes the session row and expires the cookie.

### 6.3 Middleware

```ts
// requireAuth — reject if no session
export const requireAuth = async (c, next) => {
  const u = await getCurrentUser(c);
  if (!u) return c.redirect('/login');
  c.set('user', u);
  await next();
};

// requireRole(...roles) — reject if role mismatch
export const requireRole = (...roles: UserRole[]) => async (c, next) => {
  const u = c.get('user');
  if (!u || !roles.includes(u.role)) return c.redirect('/login');
  await next();
};
```

Each route file mounts these middleware at the top:

```ts
// src/routes/admin.tsx
const admin = new Hono<{Bindings; Variables}>();
admin.use('*', requireAuth);
admin.use('*', requireRole('super_admin'));
```

### 6.4 Forced password change

When `users.must_change_password = 1`, all route middleware redirects the user to `/profile` (change-password card) until they set a new password. This runs for:

1. Initial super_admin login (seeded with default "Alexander2026!").
2. Any admin-triggered password reset.
3. Newly-created users (admin sets temp password; user forced to rotate on first login).

---

## 7. Routing & Role Scoping

Each top-level route prefix maps to one role (plus super_admin who can access everything):

| Prefix | Access | File | Purpose |
|--------|--------|------|---------|
| `/login`, `/logout` | public | `auth.tsx` | Authentication |
| `/profile` | any authed | `profile.tsx` | Self-service profile |
| `/teacher` | teacher | `teacher.tsx` | Personal dashboard |
| `/appraiser` | appraiser, super_admin | `appraiser.tsx` | Observations |
| `/coach` | coach, super_admin | `coach.tsx` | Read-only teacher view |
| `/superintendent` | superintendent, super_admin | `superintendent.tsx` | District KPIs |
| `/admin` | super_admin | `admin.tsx` | Full CRUD |
| `/reports` | appraiser, coach, superintendent, super_admin, teacher | `reports.tsx` | CSV/PDF builder |
| `/api` | varies | `api.tsx` | JSON endpoints |

**Critical rule:** every route inside these prefixes is responsible for **data-scoping** — e.g., `GET /teacher/observations/:id` verifies `observation.teacher_id === currentUser.id` before rendering. Role check alone is not enough; an appraiser must only see observations where `observation.appraiser_id IN (my assignments)`.

---

## 8. Complete API Reference

Every route in the codebase. Methods: `GET` unless noted. All POST endpoints accept `application/x-www-form-urlencoded` (HTML form posts) and return `302` redirects. Authentication is required unless marked "public".

### 8.1 `/` (auth.tsx)

| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| GET  | `/login`  | public | Login page |
| POST | `/login`  | public | Submit credentials → session cookie → `/` |
| POST | `/logout` | authed | Destroy session |

### 8.2 `/profile`

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/profile`          | Profile page (info + password cards) |
| POST | `/profile/update`   | Update first_name, last_name, title, phone |
| POST | `/profile/password` | Change own password (requires current) |

### 8.3 `/teacher`

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/teacher`                     | Dashboard (KPIs, recent obs, focus) |
| GET  | `/teacher/observations`        | All published/acknowledged obs |
| GET  | `/teacher/observations/:id`    | View observation + acknowledge form |
| POST | `/teacher/observations/:id/acknowledge` | Save teacher response + signature |
| GET  | `/teacher/focus`               | Active focus areas |

### 8.4 `/appraiser`

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/appraiser`                               | Grid of assigned teachers |
| GET  | `/appraiser/teachers/:id`                  | Teacher detail (obs list, focus) |
| POST | `/appraiser/teachers/:id/observations/start` | Create draft, redirect to editor |
| GET  | `/appraiser/observations`                  | All my observations |
| GET  | `/appraiser/observations/:id`              | Editor (notes, scores, feedback, sign) |
| POST | `/appraiser/observations/:id/save`         | Persist notes, context, schedule |
| POST | `/appraiser/observations/:id/score`        | Score one indicator (level + evidence) |
| POST | `/appraiser/observations/:id/generate-feedback` | Auto-create feedback_items from pedagogy_library for scored indicators |
| POST | `/appraiser/observations/:id/feedback/save` | Create/edit a feedback chunk |
| POST | `/appraiser/observations/:id/feedback/:itemId/delete` | Remove chunk |
| POST | `/appraiser/observations/:id/publish`      | Capture both signatures → status=published |
| POST | `/appraiser/observations/:id/delete`       | Delete (draft only) |

### 8.5 `/coach`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/coach`                | Coaching caseload |
| GET | `/coach/teachers/:id`   | Read-only teacher view (no scores/private notes) |

### 8.6 `/superintendent`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/superintendent`              | District KPI dashboard |
| GET | `/superintendent/schools/:id`  | Drill into one school |
| GET | `/superintendent/teachers/:id` | Drill into one teacher |

### 8.7 `/admin`

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/admin`                           | Overview KPIs |
| GET  | `/admin/users`                     | User list + create form |
| POST | `/admin/users/create`              | Create user (with multi-school) |
| POST | `/admin/users/:id/update`          | Edit info, role, active, schools |
| POST | `/admin/users/:id/reset-password`  | Force reset → new temp password |
| POST | `/admin/users/:id/delete`          | Soft-delete (active=0) |
| GET  | `/admin/assignments`               | Teacher ↔ staff links |
| POST | `/admin/assignments/create`        | Multi-select bulk create |
| POST | `/admin/assignments/bulk-delete`   | Bulk deactivate |
| POST | `/admin/assignments/:id/delete`    | Deactivate single |
| GET  | `/admin/schools`                   | Schools list + form |
| POST | `/admin/schools/create`            | Add school |
| POST | `/admin/schools/:id/update`        | Edit school |
| GET  | `/admin/pedagogy`                  | 240-cell matrix index |
| GET  | `/admin/pedagogy/:indicatorId/:level` | Edit cell form |
| POST | `/admin/pedagogy/:indicatorId/:level` | Save cell |
| GET  | `/admin/framework`                 | Read-only rubric viewer |
| GET  | `/admin/district`                  | District settings + school years |
| POST | `/admin/district/update`           | Save district info |
| GET  | `/admin/import/users/template`     | Download user CSV template |
| GET  | `/admin/import/users`              | Import page |
| POST | `/admin/import/users`              | Dry-run or commit user CSV |
| GET  | `/admin/import/rubric/template`    | Download rubric CSV template |
| GET  | `/admin/import/rubric/export`      | Export current rubric as CSV |
| GET  | `/admin/import/rubric`             | Rubric import page |
| POST | `/admin/import/rubric`             | Import rubric CSV |

### 8.8 `/reports`

| Method | Path | Purpose |
|--------|------|---------|
| GET  | `/reports`        | 3-step builder UI + live preview |
| POST | `/reports/export` | Apply filters, re-render preview |
| GET  | `/reports/csv`    | Stream CSV download |
| GET  | `/reports/pdf`    | HTML page with print CSS (opens in new tab, user prints to PDF) |

### 8.9 `/api`

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health`             | JSON `{ok, time}` |
| GET | `/api/indicators/:domain` | Lookup indicators (used by forms) |

---

## 9. Observation Workflow (State Machine)

```
         ┌──────────────┐   appraiser
         │              │   clicks
         │   (none)     │   "Start new"
         │              │
         └──────┬───────┘
                │ POST /appraiser/teachers/:id/observations/start
                ▼
       ┌────────────────┐   appraiser edits:
       │                │   notes_script, notes_private
       │     draft      │◄──── scores, feedback_items
       │                │   (multiple POST round-trips)
       └────────┬───────┘
                │ POST /observations/:id/publish
                │ (captures both signatures, sets published_at)
                ▼
       ┌────────────────┐   teacher sees it in /teacher/observations
       │                │   teacher reads glows/grows/focus/next steps
       │   published    │
       │                │
       └────────┬───────┘
                │ POST /teacher/observations/:id/acknowledge
                │ (captures teacher signature, response, acknowledged_at)
                ▼
       ┌────────────────┐
       │                │   Locked — no further edits.
       │  acknowledged  │   Included in reports.
       │                │
       └────────────────┘

  Side effect on publish:
  If any feedback_item.category = 'focus_area', a matching focus_areas
  row is upserted (status='active', opened_from_observation_id=:id).
```

### Observation types

- **`mini`** — Short, script-only, typically ungraded. Used for quick walkthroughs.
- **`formal`** — Full observation with scores + rich feedback.
- **`annual_summary`** — End-of-year roll-up. No live classroom script; synthesizes prior observations.

Admins select type when starting; UI adapts (e.g., annual_summary hides scripting UI).

---

## 10. Report Builder (CSV & PDF)

**File:** `src/routes/reports.tsx` (804 lines).

### 10.1 Three-step UI

Step 1 — **Who & when** (all multi-select):
- `teacher_ids[]`  (filtered to user's scope: teacher sees self; appraiser sees assigned; super_admin sees all)
- `school_ids[]`  (hidden for teacher)
- `appraiser_ids[]`  (hidden for teacher/coach)
- `date_from`, `date_to`
- `observation_types[]` — checkboxes mini/formal/annual_summary

Step 2 — **What to include**:
- Preset buttons: Full, Scores only, Strengths only, Growth only, Feedback only, Teacher folder copy
- Section checkboxes: Summary, Scores, Glows, Grows, Focus, Next Steps, Signatures, Private notes (admin/appraiser only)

Step 3 — **Download**:
- **CSV row mode** dropdown with 8 options (see below)
- **PDF** button opens `/reports/pdf?<filters>` in new tab — user prints with browser

### 10.2 CSV row modes

| Mode | Row grain |
|------|-----------|
| `summary`    | 1 row per observation (basic metadata + overall summary) |
| `scores`     | 1 row per (observation, indicator) with level |
| `feedback`   | 1 row per feedback_item |
| `glows`      | 1 row per glow item |
| `grows`      | 1 row per grow item |
| `focus`      | 1 row per focus_area item |
| `next_steps` | 1 row per next_step item |
| `full`       | 1 row per observation with JSON-ish collapsed columns |

### 10.3 SQL strategy

The preview and exports use a **single prepared query** with dynamic `IN (?,?,?)` expansion:

```sql
SELECT o.*, t.first_name AS t_first, ...
FROM observations o
JOIN users t ON t.id = o.teacher_id
JOIN users a ON a.id = o.appraiser_id
LEFT JOIN schools s ON s.id = t.school_id
WHERE o.status IN ('published','acknowledged')
  AND (o.teacher_id IN (?, ?, ?) OR 0)           -- if teacher filter
  AND (a.id IN (?, ?) OR 0)                      -- if appraiser filter
  AND (s.id IN (?) OR 0)                         -- if school filter
  AND (o.observation_type IN (?, ?) OR 0)        -- if type filter
  AND (o.observed_at >= ? OR ? IS NULL)          -- date_from
  AND (o.observed_at <= ? OR ? IS NULL)          -- date_to
ORDER BY o.observed_at DESC
LIMIT 500
```

Indexes added in `0002`: `idx_obs_observed_at`, `idx_obs_type` keep this fast even across full-district queries.

### 10.4 PDF generation

No external PDF library. The `/reports/pdf` route renders plain HTML with:
- `@media print { ... }` CSS (header/footer control, page breaks)
- `<link rel="stylesheet">` to `/static/styles.css`
- `window.print()` called via `<script>` after load

Users click "Save as PDF" in the browser print dialog. This keeps the Worker under the 10 MB limit — a real PDF library (jsPDF, PDFKit) would balloon to ~3 MB.

---

## 11. Bulk CSV Import / Export

### 11.1 User import (`/admin/import/users`)

**CSV columns** (header row required):
```
email, first_name, last_name, role, title, phone,
primary_school, additional_schools, temp_password
```

- `role` ∈ `super_admin|superintendent|appraiser|coach|teacher`
- `additional_schools` is **pipe-separated** school names: `"Elementary|Middle School|High School"`
- `primary_school` must match an existing `schools.name` exactly
- `temp_password` → bcrypt hashed, `must_change_password=1`

### 11.2 Dry-run mode

POST with `mode=dry_run` returns a preview table showing:
- Row number
- Parsed columns
- Validation result per row (❌ with error, or ✅)
- Proposed DB actions (INSERT vs UPDATE by email)

POST with `mode=commit` runs the same validation then performs inserts.

### 11.3 Rubric export/import

- **Export:** `/admin/import/rubric/export` streams the full 240-descriptor + 240-pedagogy matrix as a single CSV (one row per cell).
- **Import:** parses the CSV, UPSERTs `framework_descriptors` and `pedagogy_library` by `(indicator_code, level)`.

This enables a sister district to replicate the entire rubric + pedagogy library by downloading our CSV and re-importing.

---

## 12. Pedagogy Library

**Purpose:** human-curated "what this level looks like" + "how to improve" content that drives deterministic feedback generation (no LLM).

**Structure:** 240 rows in `pedagogy_library`, one per (indicator, level). Fields:

| Field | Example (Indicator A1 / Level 2 – Improvement Necessary) |
|-------|----------------------------------------------------------|
| `interpretation` | "Planning shows awareness of standards but lacks depth in differentiation." |
| `evidence_signals` | "Objectives posted but not consistently referenced; few formative checkpoints." |
| `teacher_next_moves` | "Try 'I can' statements; add one quick check for understanding per 15 minutes." |
| `coaching_considerations` | "Model backwards-design in next planning conference." |
| `resources` | "Marshall chapter 2, pp. 34-41; Hattie VL effect size for clarity 0.75." |
| `feedback_starter` | "Your lesson objective was clearly visible. To strengthen, consider..." |

When an appraiser clicks **Generate feedback** after scoring:

```ts
// Pseudocode from appraiser.tsx
for (const score of scores) {
  const lib = await db.prepare(
    'SELECT * FROM pedagogy_library WHERE indicator_id = ? AND level = ?'
  ).bind(score.indicator_id, score.level).first();
  if (!lib) continue;

  await db.prepare(
    `INSERT INTO feedback_items (observation_id, indicator_id, category, title, body, source)
     VALUES (?, ?, ?, ?, ?, 'pedagogy_library')`
  ).bind(
    observationId, score.indicator_id,
    score.level >= 3 ? 'glow' : 'grow',
    `${indicator.code} — ${indicator.name}`,
    `${lib.feedback_starter}\n\n${lib.teacher_next_moves}`
  ).run();
}
```

Appraisers can then edit/rearrange/delete the generated chunks before publishing. This is the system's most valuable IP — swapping out the pedagogy library gives you an entirely different evaluation philosophy (e.g., Danielson, Marzano) without changing one line of code.

---

## 13. Guided Tour Engine

**Files:**
- `src/lib/tour.ts` (356 lines) — server-side role-specific step arrays
- `public/static/tour.js` (13 KB) — client-side engine
- CSS in `public/static/styles.css` under `.aps-tour-*`

### 13.1 Data flow

1. `<Layout>` component decides if tour should load:
   - `autoLaunchTour` prop (set when `?welcome=1` is on URL or `localStorage.aps_tour_seen` is unset)
   - OR user clicked "Guided Tour" pill in header
2. Server calls `getTour(user.role)` → array of `TourStep` objects.
3. Layout injects `<script>window.__APS_TOUR__ = {userId, role, roleLabel, autoLaunch, steps: [...]}</script>`
4. Layout also includes `<script src="/static/tour.js">`.
5. Tour engine reads `window.__APS_TOUR__`, renders overlay + tooltip, positions tooltip relative to `data-tour="..."` selector.

### 13.2 TourStep shape

```ts
interface TourStep {
  page: string;              // URL to navigate to (tour auto-nav across pages)
  selector?: string;         // CSS selector, e.g. '[data-tour="users-create"]'
  title: string;
  body: string;              // HTML allowed
  hint?: string;             // Optional callout box
  placement?: 'top'|'right'|'bottom'|'left'|'center';
}
```

### 13.3 Cross-page navigation

When a step's `page` differs from current URL, engine:
1. Saves next step index to `localStorage.aps_tour_step`
2. Navigates: `location.href = step.page + '?resume_tour=1'`
3. New page's Layout detects `?resume_tour=1` → `autoLaunch=true, startIndex=savedIndex`

### 13.4 Persistence

| Key | Purpose |
|-----|---------|
| `localStorage.aps_tour_seen_v1` | Set on finish or skip (prevents auto-launch) |
| `localStorage.aps_tour_step` | Resume index during cross-page flow |
| Profile page "Restart tour" link | Clears `aps_tour_seen_v1` and opens `/?welcome=1` |

### 13.5 Adding new steps

To add a step for a new UI element:

1. Add `data-tour="my-new-thing"` attribute to the target HTML.
2. In `src/lib/tour.ts`, add a `TourStep` to the relevant role array:
   ```ts
   { page: '/admin/users', selector: '[data-tour="my-new-thing"]',
     title: 'New Thing', body: 'Description here.' }
   ```
3. Rebuild (`npm run build`) — no client JS changes needed.

---

## 14. Progressive Web App (PWA)

### 14.1 manifest.json

```json
{
  "name": "Alexander Public Schools — Marshall Growth Platform",
  "short_name": "APS Growth",
  "id": "/",
  "start_url": "/",
  "scope": "/",
  "display": "standalone",
  "display_override": ["window-controls-overlay","standalone","minimal-ui","browser"],
  "background_color": "#eef4ed",
  "theme_color": "#0b2545",
  "orientation": "any",
  "categories": ["education","productivity"],
  "icons": [
    {"src":"/static/icon-192.png","sizes":"192x192","type":"image/png","purpose":"any maskable"},
    {"src":"/static/icon-512.png","sizes":"512x512","type":"image/png","purpose":"any maskable"}
  ],
  "shortcuts": [
    {"name":"Dashboard","url":"/"},
    {"name":"Reports","url":"/reports"},
    {"name":"Guided Tour","url":"/?welcome=1"}
  ]
}
```

### 14.2 Service Worker (v3) — 3-tier cache

**File:** `public/static/sw.js`

| Asset pattern | Strategy | Fallback |
|---------------|----------|----------|
| `/static/*` (CSS, JS, icons) | **Cache-first** | Network |
| `cdn.tailwindcss.com`, FontAwesome CDN | **Stale-while-revalidate** | Cached copy |
| HTML navigation requests | **Network-first**, 3 s timeout | `/static/offline.html` |
| POST/PUT/DELETE | **Never cached** — always network | — |

Cache name is versioned (`aps-growth-v3`); bumping it invalidates old caches and triggers a "New version available" refresh banner managed by `app.js`.

### 14.3 Install prompts

- **Android/Chrome/Edge:** `beforeinstallprompt` event → shows gold floating "Install app" button (dismissible, remembered for 30 days).
- **iOS Safari:** no install event available, so `app.js` detects iOS user agent + non-standalone mode and shows a one-time tooltip: "Tap ↑ Share → Add to Home Screen".
- **Desktop:** Chrome/Edge show install icon in address bar automatically.

### 14.4 Offline behavior

- `offline.html` is pre-cached on install.
- Navigation requests that fail return `offline.html`.
- Page auto-retries every 5 seconds when `navigator.onLine` becomes true.

---

## 15. Mobile Responsiveness

### 15.1 Viewport + safe areas

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
```

```css
body { padding-top: env(safe-area-inset-top); padding-bottom: env(safe-area-inset-bottom); }
```

### 15.2 Mobile navigation drawer

Header uses:
- `hidden md:flex` — desktop nav (horizontal)
- `md:hidden` — hamburger button that toggles `.aps-mobile-nav` drawer (full-screen, `inset-0`)

Drawer closes on link click, route change, Escape key, or overlay click.

### 15.3 Tables

Every `<table class="w-full">` is wrapped in `<div class="overflow-x-auto">` (bulk-applied via script). This preserves desktop layout while allowing horizontal scroll on phones instead of breaking the layout.

### 15.4 Forms

- All `<input>` use `text-base` (16 px) to prevent iOS auto-zoom on focus.
- Buttons minimum `py-3 px-4` for 44 px touch target.
- Multi-column grids use `grid-cols-1 md:grid-cols-3` pattern so they stack on phones.

### 15.5 Tour tooltip

On mobile, tour tooltip pins to `position: fixed; bottom: 0` instead of floating near its target (which often clips on narrow screens).

---

## 16. Frontend Conventions (JSX in Hono)

Hono supports JSX via `tsconfig.json`:

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "hono/jsx"
  }
}
```

JSX compiles to Hono's HTML renderer — no React, no hydration, no virtual DOM. Output is a plain `Response` with HTML content-type.

**Pattern:**

```tsx
import { Layout, Card, Button } from '../lib/layout';

admin.get('/users', async (c) => {
  const user = c.get('user');
  const users = await c.env.DB.prepare('SELECT * FROM users').all();

  return c.render(
    <Layout user={user} title="Users" active="users">
      <Card title="All Users" icon="users">
        <table class="w-full text-sm">
          {users.results.map(u => (
            <tr><td>{u.email}</td><td>{u.role}</td></tr>
          ))}
        </table>
      </Card>
    </Layout>
  );
});
```

**Important:** JSX in Hono does **not** execute on the client. All `onclick` handlers must be plain strings:

```tsx
// ✅ Works
<button onclick="toggleMenu()">Menu</button>

// ❌ Does nothing — this is Hono SSR, not React
<button onClick={() => toggleMenu()}>Menu</button>
```

Client interactivity lives in `public/static/app.js` (menus, signature pad, SW, install prompt) and `tour.js`.

---

## 17. Security Model

### 17.1 Defense layers

1. **Transport:** Cloudflare enforces HTTPS globally; `Secure` cookies never transmit over HTTP.
2. **Authentication:** bcrypt cost 10, 30-day random tokens, `HttpOnly` (no JS access), `SameSite=Lax` (blocks most CSRF).
3. **Authorization:** every route uses `requireAuth` + `requireRole` middleware; each handler re-validates data scope (e.g., teacher ID belongs to appraiser).
4. **SQL injection:** 100% of queries use `db.prepare(...).bind(...)` — never string concatenation.
5. **XSS:** Hono JSX auto-escapes text content. Raw HTML only via `<div dangerouslySetInnerHTML>` equivalent (`{html(trustedString)}`), used only for admin-edited pedagogy content.
6. **CSRF:** SameSite=Lax cookies block cross-origin POSTs. No CSRF token needed for same-origin form submissions (browser enforces).
7. **Password policy:** min 8 chars enforced in profile form; temp passwords force rotation on first login.
8. **Session fixation:** destroying and re-creating session on password change.

### 17.2 Known limitations

- No rate limiting on `/login` — a determined attacker could script brute force. Cloudflare Bot Management (paid) would address this.
- No MFA — single-factor password auth.
- Sessions do not rotate on IP change.
- No audit log for all admin actions (only significant entities go through `activity_log`).

### 17.3 PII handling

- Signatures stored as base64 PNG strings in D1 (inline, not in R2). ~10-30 KB per signature is acceptable.
- Email addresses are the primary identifier; no SSN or DOB stored.
- Private notes (`observations.notes_private`) never exposed to teachers or coaches — enforced at query level.

---

## 18. Deployment & Environments

### 18.1 Environments

| Env | D1 database | URL | Deploy command |
|-----|-------------|-----|----------------|
| Local dev | `.wrangler/state/v3/d1` (SQLite file) | http://localhost:3000 | `pm2 start ecosystem.config.cjs` |
| Production | `alexander-marshall-growth-production` (D1 id `7ad58a8f-...`) | https://alexander-marshall-growth.pages.dev | `npm run deploy` |

### 18.2 wrangler.jsonc

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "alexander-marshall-growth",
  "compatibility_date": "2026-04-13",
  "pages_build_output_dir": "./dist",
  "compatibility_flags": ["nodejs_compat"],
  "d1_databases": [{
    "binding": "DB",
    "database_name": "alexander-marshall-growth-production",
    "database_id": "7ad58a8f-621b-41e8-aa9a-dc27069eb039"
  }]
}
```

Note: the scripts in `package.json` currently reference `webapp-production` as the database name (legacy). For production deploys, use:
```bash
npx wrangler d1 migrations apply alexander-marshall-growth-production
```

### 18.3 Deploy workflow

```bash
# 1. Build
npm run build                            # Vite → dist/_worker.js (~265 KB)

# 2. Apply migrations to prod (first time or new migrations)
npx wrangler d1 migrations apply alexander-marshall-growth-production

# 3. Deploy to Cloudflare Pages
npx wrangler pages deploy dist --project-name alexander-marshall-growth

# Output:
# ✨ Success! Uploaded 12 files (7 already uploaded).
# 🌎 Deployment URL: https://<id>.alexander-marshall-growth.pages.dev
# 🌎 Alias URL: https://alexander-marshall-growth.pages.dev
```

### 18.4 Snapshot vs. alias URLs

- **Alias:** `https://alexander-marshall-growth.pages.dev` — always points to latest production deploy.
- **Snapshot:** `https://<deploy-id>.alexander-marshall-growth.pages.dev` — frozen to one specific deploy, useful for rollback testing.

---

## 19. Local Development Setup

### 19.1 Prerequisites

- Node.js 20+
- npm 10+
- Cloudflare account (free tier fine)
- `wrangler` authenticated (`wrangler login` or `CLOUDFLARE_API_TOKEN` env var)

### 19.2 First-time setup

```bash
# Clone
git clone https://github.com/RupakGandhi/alexander-marshall-growth.git
cd alexander-marshall-growth

# Install
npm install

# Create local D1 database + run migrations + seed
npm run db:migrate:local
npm run db:seed:local

# Build
npm run build

# Start (PM2)
pm2 start ecosystem.config.cjs

# Visit
open http://localhost:3000
# Login: admin@alexanderschoolnd.us / Alexander2026!
```

### 19.3 Daily dev loop

```bash
# Watch mode (Vite rebuilds on save)
pm2 restart alexander-marshall-growth --update-env

# Or manually
npm run build && pm2 restart alexander-marshall-growth

# Check logs
pm2 logs --nostream

# Reset local DB (wipes everything, re-runs migrations + seeds)
npm run db:reset:local
```

### 19.4 Debugging

```bash
# Query local D1 directly
npx wrangler d1 execute alexander-marshall-growth-production --local \
  --command "SELECT * FROM users WHERE role='super_admin'"

# Query prod D1 (careful!)
npx wrangler d1 execute alexander-marshall-growth-production \
  --command "SELECT COUNT(*) FROM observations"
```

---

## 20. Replication Guide (Step-by-Step)

To deploy this platform for a new district ("New District Public Schools") from scratch:

### 20.1 Cloudflare setup (5 min)

```bash
# 1. Create Pages project
npx wrangler pages project create new-district-growth \
  --production-branch main \
  --compatibility-date 2026-04-13

# 2. Create D1 database — NOTE the database_id from output
npx wrangler d1 create new-district-growth-production
# → database_id: <NEW-ID>
```

### 20.2 Configure (2 min)

Edit `wrangler.jsonc`:
```jsonc
{
  "name": "new-district-growth",
  "d1_databases": [{
    "binding": "DB",
    "database_name": "new-district-growth-production",
    "database_id": "<NEW-ID>"
  }]
}
```

Update `package.json` db scripts to match new database name.

### 20.3 Customize seed data (15 min)

Edit `seed/001_district_and_framework.sql`:
- `districts` row: name, address, phone, etc.
- (Optional) Replace the Marshall framework rows with your rubric, or keep as-is.

Edit `seed/003_alexander_staff.sql`:
- First super_admin user (email, name, temp password — bcrypt hash beforehand)
- Schools for the district
- Current `school_years` row

Edit `seed/002_pedagogy_library.sql` — the 240 pedagogy cells. If using a different rubric, the easiest path is:
1. Export our CSV: `GET /admin/import/rubric/export`
2. Edit in Excel
3. After deploy, import via `/admin/import/rubric`

### 20.4 Rebrand (10 min)

- Replace `public/static/icon-source.png` with new art; regenerate sized icons (ImageMagick: `convert icon-source.png -resize 192x192 icon-192.png`, etc.)
- Update `public/static/manifest.json` — `name`, `short_name`, `description`, `theme_color`
- Update `src/lib/layout.tsx` — brand colors (`#0b2545` → new), header text
- Update `public/static/styles.css` — any `#0b2545` / `#c9a227` references

### 20.5 Deploy

```bash
npm install
npm run build
npx wrangler d1 migrations apply new-district-growth-production
npx wrangler d1 execute new-district-growth-production --file=./seed/001_...sql
npx wrangler d1 execute new-district-growth-production --file=./seed/002_...sql
npx wrangler d1 execute new-district-growth-production --file=./seed/003_...sql
npx wrangler pages deploy dist --project-name new-district-growth
```

### 20.6 Verify

```bash
curl https://new-district-growth.pages.dev/health
# {"ok":true,"time":"..."}

curl -I https://new-district-growth.pages.dev/static/manifest.json
# HTTP/2 200
```

Log in with your seed super_admin credentials → forced password change → create users → done.

**Time estimate:** ~35 minutes end-to-end for an experienced developer.

---

## 21. Troubleshooting & Operations

### 21.1 Common issues

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `HTTP 500` on /login after deploy | Migrations not applied to prod | `npx wrangler d1 migrations apply <db-name>` |
| PWA shows old UI after deploy | Service worker cached old version | Bump cache version in `sw.js`, redeploy; users get "New version" banner |
| iOS install prompt not showing | iOS blocks install for 30 days after dismiss | Advise user to manually use Share → Add to Home Screen |
| `/reports/pdf` shows broken layout | Print CSS overridden | Inspect `@media print` rules in `styles.css` |
| `generate-feedback` creates no items | `pedagogy_library` empty for that level | Seed `002_pedagogy_library.sql` or manually edit via `/admin/pedagogy` |
| Admin gets logged out unexpectedly | Session expired (30 d) or DB `sessions` table cleared | Re-login; no action needed |

### 21.2 Useful queries

```sql
-- Active users by role
SELECT role, COUNT(*) FROM users WHERE active=1 GROUP BY role;

-- Observations by status and month
SELECT status, strftime('%Y-%m', observed_at) AS month, COUNT(*)
FROM observations GROUP BY 1, 2 ORDER BY 2;

-- Teachers with no active focus areas
SELECT u.email FROM users u WHERE u.role='teacher' AND u.active=1
  AND NOT EXISTS (SELECT 1 FROM focus_areas f
                  WHERE f.teacher_id=u.id AND f.status='active');

-- Pedagogy library completeness check (should be 240)
SELECT COUNT(*) FROM pedagogy_library;
```

### 21.3 Monitoring

Cloudflare dashboard → Pages project → **Deployments** tab shows latest builds. Analytics tab shows request volume, error rates, percentile latency. For D1 query performance, use `Analytics Engine` bindings if needed (not currently configured).

---

## 22. Extension Points & Roadmap

### 22.1 Designed extension points

1. **New role:** add to `UserRole` union in `types.ts`, add nav items in `layout.tsx`, create new route file, add tour in `tour.ts`. Estimated: 4-6 hours.
2. **New rubric:** UPSERT into `framework_domains`, `framework_indicators`, `framework_descriptors`, `pedagogy_library`. Set `frameworks.is_active=1` for new, 0 for old. Zero code change.
3. **New report row mode:** add enum to `reports.tsx` `ROW_MODES`, add a flattening function in `csv.ts`. ~50 lines.
4. **New observation type:** add to `observations.observation_type` CHECK constraint (new migration), add UI option in appraiser.tsx start form, optionally customize editor rendering.
5. **Email notifications:** currently no email. To add, integrate MailChannels (free on Workers) via `fetch('https://api.mailchannels.net/tx/v1/send', ...)` in a new `src/lib/mail.ts`.

### 22.2 Known tech debt

- `src/routes/admin.tsx` is 1388 lines — ripe for splitting into `admin/users.tsx`, `admin/schools.tsx`, etc.
- Multi-school junction (`user_schools`) added in migration `0002` but some queries still use `users.school_id` only. A future cleanup would standardize on the junction everywhere.
- Tailwind via CDN emits a production warning. To silence, switch to a PostCSS build with a trimmed JIT CSS file.
- No unit tests. Critical paths (auth, feedback generation, CSV) would benefit from Vitest coverage.
- `jose` package imported but unused (legacy from early JWT design — safe to remove).

### 22.3 Roadmap (not yet built)

- Real-time notifications when an observation is published (via WebSocket? Server-Sent Events? Polling is also fine).
- Teacher portfolio page with artifacts (PDFs, lesson plans) — would require Cloudflare R2 integration.
- District-level analytics dashboard with trend charts (current superintendent view is static KPIs).
- Two-factor authentication (TOTP) for super_admin role.
- Export observation as formal Word/PDF document (currently browser-print only).

---

## Appendix A — Files at a glance

| File | Lines | Purpose |
|------|-------|---------|
| `src/index.tsx` | ~40 | App entry, route mounting |
| `src/renderer.tsx` | ~10 | JSX renderer setup |
| `src/lib/types.ts` | 29 | Core types |
| `src/lib/auth.ts` | 76 | Auth primitives |
| `src/lib/db.ts` | 244 | Shared queries |
| `src/lib/csv.ts` | 84 | CSV utilities |
| `src/lib/ui.ts` | 60 | Small UI helpers |
| `src/lib/layout.tsx` | 278 | Layout, nav, mobile drawer |
| `src/lib/tour.ts` | 356 | Tour steps |
| `src/routes/auth.tsx` | 78 | Login/logout |
| `src/routes/profile.tsx` | 134 | Profile |
| `src/routes/teacher.tsx` | 300 | Teacher views |
| `src/routes/coach.tsx` | 174 | Coach views |
| `src/routes/appraiser.tsx` | 772 | Observation workflow |
| `src/routes/superintendent.tsx` | 315 | District KPIs |
| `src/routes/admin.tsx` | 1388 | Admin CRUD |
| `src/routes/reports.tsx` | 804 | Report Builder |
| `src/routes/api.tsx` | 32 | JSON endpoints |

**Total server code:** ~5,124 lines TS/TSX.
**Client code:** ~18 KB JS (app.js + tour.js + sw.js).
**CSS:** ~5 KB (styles.css).
**Build output:** `dist/_worker.js` ~265 KB (well under the 10 MB Worker size limit).

---

## Appendix B — Environment variables / secrets

Currently the app has **no runtime secrets**. All sensitive data (passwords) lives in the D1 database as bcrypt hashes. No third-party APIs are called, so no tokens.

If you add services (e.g., MailChannels, Stripe), use:
```bash
npx wrangler pages secret put MAIL_API_KEY --project-name alexander-marshall-growth
```

Then access in code via `c.env.MAIL_API_KEY`.

---

## Appendix C — License & attribution

- Platform code: proprietary, © Alexander Public Schools / OptimizED Strategic Solutions.
- Kim Marshall Teacher Evaluation Rubric (2014): used with attribution; rubric text is reproduced verbatim in `seed/001_district_and_framework.sql`. See https://marshallmemo.com for licensing.
- Third-party libraries: bcryptjs (MIT), hono (MIT), jose (MIT), Tailwind (MIT), Font Awesome Free (CC BY 4.0 / SIL OFL / MIT).

---

**Document version:** 1.0
**Last updated:** 2026-04-22
**Maintainer:** Dr. Rupak Gandhi, OptimizED Strategic Solutions
**Contact:** https://github.com/RupakGandhi/alexander-marshall-growth/issues
