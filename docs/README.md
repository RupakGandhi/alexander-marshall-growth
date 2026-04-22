# Marshall Growth Platform — Documentation

Complete reference documents for the Alexander Public Schools Marshall Growth Platform.

## User Guides

Written for end-users. No technical knowledge required.

| Guide | Audience | Covers |
|-------|----------|--------|
| [USER_GUIDE_SUPER_ADMIN.md](USER_GUIDE_SUPER_ADMIN.md) | Super Administrators | Full platform control — users, schools, assignments, rubric, pedagogy library, bulk import, district settings, reports |
| [USER_GUIDE_SUPERINTENDENT.md](USER_GUIDE_SUPERINTENDENT.md) | Superintendents | District KPIs, school/teacher drill-down, reports, read-only overview |
| [USER_GUIDE_APPRAISER.md](USER_GUIDE_APPRAISER.md) | Principals / Administrators / Appraisers | Full observation workflow — scripting, scoring, feedback generation, publishing, reports |
| [USER_GUIDE_COACH.md](USER_GUIDE_COACH.md) | Instructional Coaches | Read-only teacher views, feedback-only mode (no scores), coaching considerations |
| [USER_GUIDE_TEACHER.md](USER_GUIDE_TEACHER.md) | Teachers | Personal dashboard, viewing observations, acknowledgment with signature, focus areas, reports |

## Technical Documentation

Written for developers and technical staff.

| Document | Purpose |
|----------|---------|
| [TECHNICAL_DEVELOPER_GUIDE.md](TECHNICAL_DEVELOPER_GUIDE.md) | Complete technical reference — architecture, database schema, every API endpoint, deployment workflow, and a step-by-step replication guide so any developer can recreate the platform for a new district. |

## Quick Links

- **Live app:** https://alexander-marshall-growth.pages.dev
- **Source code:** https://github.com/RupakGandhi/alexander-marshall-growth
- **Project overview:** [../README.md](../README.md)

## Recommended Reading Order

**If you are a new user:**
1. Pick your role-specific user guide above.
2. Log in and use the in-app **Guided Tour** (gold pill in the top nav).

**If you are a developer joining the project:**
1. [TECHNICAL_DEVELOPER_GUIDE.md](TECHNICAL_DEVELOPER_GUIDE.md) — sections 1-5 (architecture, stack, structure, schema).
2. Clone the repo, run through section 19 (local dev setup).
3. Read one route file end-to-end (e.g., `src/routes/appraiser.tsx`) to see the full pattern.
4. Consult the API reference (section 8) and extension points (section 22) as needed.

**If you are replicating the platform for a new district:**
1. [TECHNICAL_DEVELOPER_GUIDE.md](TECHNICAL_DEVELOPER_GUIDE.md) section 20 — "Replication Guide".
2. ~35 minutes end-to-end.

---

**Last updated:** 2026-04-22
