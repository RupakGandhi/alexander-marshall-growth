# Superintendent — User Guide
**Alexander Public Schools · Marshall Growth Platform**

> **Who is this for?** The district superintendent (and any cabinet-level leader with district-wide read access). You see everything that's officially published, district-wide, but you don't edit users, rubrics, or observations.

---

## Table of Contents
1. [What You Can Do](#what-you-can-do)
2. [Signing In](#signing-in)
3. [The District Overview](#the-district-overview)
4. [By School](#by-school)
5. [By Teacher](#by-teacher)
6. [Reports — Your Main Tool](#reports--your-main-tool)
7. [What's NOT Shown to You](#whats-not-shown-to-you)
8. [Guided Tour](#guided-tour)
9. [Mobile & PWA Install](#mobile--install-as-an-app)
10. [Frequently Asked Questions](#frequently-asked-questions)

---

## What You Can Do

As **Superintendent** you have **district-wide, read-only visibility** into the evaluation program. Specifically:
- See live KPIs for the whole district (teachers, observations, publishing rates, rubric distribution)
- Drill down into every school
- See every teacher and their observation history
- Build, download, and print CSV and PDF reports across any subset of data
- Reply to the Guided Tour any time

You **cannot**:
- Create or edit users (that's the Super Admin's job)
- Score observations or edit feedback
- See drafts — you only see officially published work
- See private appraiser notes — those are always hidden outside the evaluation pair

This keeps you focused on the district story, not the paperwork.

---

## Signing In

1. Open https://alexander-marshall-growth.pages.dev
2. Use the email and starting password (`Alexander2026!`) your super admin provides.
3. On first login you're forced to set a new password.
4. After that, the **Guided Tour** auto-launches and walks you through every section.
5. Your home page is **District Overview** (`/superintendent`).

---

## The District Overview

**URL:** `/superintendent`

This is your one-page district health check. It shows:

### Top KPIs (live)
- **Teachers** — total active teachers
- **Appraisers** — principals / evaluators
- **Coaches** — instructional coaches
- **Active Focus Areas** — live coaching/growth targets across all teachers
- **Observations** — total count
- **Published** — how many have been signed by the appraiser and shared with the teacher
- **Acknowledged** — how many have been signed by the teacher
- **Completion Rate** — published ÷ total (a rough "how much of the program is finished?")

### Rubric distribution bar
A horizontal stacked bar shows the district-wide distribution of scored indicators across the four performance levels:
- **HE** — Highly Effective (green)
- **E** — Effective (blue)
- **IN** — Improvement Necessary (amber)
- **DNM** — Does Not Meet (red)

Each segment's width shows its percentage; hover for the raw count. Multi-school teachers are counted once — no double counting.

### By-school table
Every school in the district with:
- **Teachers** — count of distinct active teachers linked to that school (multi-school teachers are counted for every building they belong to)
- **Observations** — total count
- **Published** — how many are officially done
- A drill-down link → opens the school's teacher list

---

## By School

**URL:** `/superintendent/schools`

One card per school with every teacher, their title, their observation count, and when they were most recently observed.

**Use it to…**
- Spot buildings where observation activity has slowed
- Check that every new teacher has at least one observation
- Find out which teachers haven't been observed this year

**Click any teacher** to open their read-only profile with all their published observations.

---

## By Teacher

**URL:** `/superintendent/teachers`

The full district teacher list, sortable by name / school / observation count / last-observed date.

**Each row shows:**
- Name + title
- Primary school (with gold star) + any additional school chips
- Observation count
- Last observed date (links to the observation PDF)

**Click the name** to open their read-only profile. You'll see every published observation — date, type, appraiser, rubric scores, feedback chunks, overall summary, and status.

---

## Reports — Your Main Tool

**URL:** `/reports`

This is where you'll spend most of your time. The Report Builder is **the** tool for board presentations, HR, grant reporting, accreditation, equity audits — anything where you need evaluation data sliced a specific way.

### ① Who & when
- **Teachers** — pick any subset or leave empty for all
- **Schools** — same
- **Appraisers** — to run "every observation Principal Smith did this year"
- **From / To** — date range
- **Observation type** — Mini, Formal, Annual Summary (any combination)

### ② What to include
One-click **presets** for common requests:

| Preset | Use it for |
|---|---|
| **Full observation** | Board-ready documentation |
| **Scores only** | Rubric-driven stats (pivot tables, histograms) |
| **Strengths only** | Celebration / year-end acknowledgements |
| **Growth areas only** | PD-planning conversations |
| **Feedback only** | Coaching conversations — no scores to bias |
| **Teacher folder copy** | Anything a teacher takes to an HR meeting |

Or tick any custom combo of: Overall Summary, Rubric Scores, Strengths, Growth Areas, Focus Areas, Next Steps, Signatures.

### ③ Download
- **CSV** (8 shapes) — opens in Excel / Google Sheets
  - One row per observation (summary + counts + averages)
  - One row per rubric score (ideal for pivot tables)
  - One row per feedback item (glows + grows + focus + next steps)
  - Only strengths / only growth areas / only focus / only next steps
  - Everything (wide)
- **PDF** — a print-ready report opens in a new tab. Use your browser's **Print → Save as PDF**. Each observation starts on its own page.

### Live preview
Below the download buttons, a table shows the observations that match your current filter, so you know exactly what you're about to export.

**Tip:** For single-teacher HR folders, just tick that one teacher in step ①, leave everything else open, pick *Teacher folder copy* in step ②, and open the PDF.

---

## What's NOT Shown to You

By design:
- **Draft observations** — an observation only appears in your reports once the appraiser has officially published it.
- **Scored-but-not-published observations** — same; still invisible.
- **Private appraiser notes** — every observation has a private-notes field only the appraiser and the super admin can see.
- **Unacknowledged teacher responses** — if a teacher hasn't signed yet, you see the content but the acknowledgment status flags it as "awaiting signature."

This is intentional: you're looking at **the official record**, not works-in-progress.

---

## Guided Tour

Every page, every role, the gold **Guided Tour** pill in the top-right launches a role-aware walkthrough. Yours is ~8 steps covering:
1. Welcome
2. District KPIs
3. Rubric distribution
4. By-school rollup
5. Drill into any school
6. Every teacher district-wide
7. The Report Builder (3 steps)
8. Wrap-up

**Re-launch any time** from the Guided Tour button in the top nav, from inside the user menu (click your initials), or from your Profile page.

---

## Mobile & Install as an App

The platform is a full **Progressive Web App**. Install it on your phone for one-tap access.

**Android / Chrome / Edge:** A gold **"Install app"** button appears in the corner on first visit, or use the browser's install icon in the address bar.

**iPhone / iPad (Safari):** Tap **Share** (↑) → scroll down → **Add to Home Screen**. A one-time hint card shows you how.

**Once installed:**
- Opens like a native app (no browser chrome)
- App shortcuts let you jump straight to *Dashboard*, *Reports*, or *Guided Tour*
- Pages you've visited still open offline (read-only)
- A banner pops up when the app has an update — tap *Refresh* and you're current

**On mobile:**
- The hamburger menu (☰) in the top-left opens the full navigation
- KPI cards stack vertically
- Tables scroll horizontally without breaking the layout
- Everything is usable at 320px width

---

## Frequently Asked Questions

**Q: Can I see a specific principal's observations?**
Yes. Go to `/reports` → in step ①, leave teachers empty and pick just that principal in the **Appraisers** multi-select → preview → export.

**Q: How do I get a board-ready year-end report for one school?**
`/reports` → pick that school in step ① → set the date range to the school year → pick *Full observation* preset in step ② → open PDF in step ③ → *Print → Save as PDF*.

**Q: How do I see acknowledgment rates?**
The **Overview** dashboard shows district-wide published vs. acknowledged. For building-level, go to `/superintendent/schools` and compare the observation-count and last-observed columns. For teacher-level, the teacher profile page shows each observation's status.

**Q: Can I edit a typo in someone's observation?**
No. Only the original appraiser (while it's still a draft) or the super admin (via database) can edit observations. If there's a meaningful error, ask the appraiser to issue a correction observation.

**Q: Does this replace our HR evaluation file?**
That's a local policy question. The platform keeps a complete, signed, timestamped record, so many districts treat it as the authoritative source. Check with your school board attorney before setting policy.

**Q: What happens if a teacher leaves the district?**
Their user record is deactivated, not deleted. They disappear from lists, but their observation history is preserved for compliance. Ask your Super Admin to deactivate them from `/admin/users`.

**Q: Can I export multiple teachers into one PDF?**
Yes — pick multiple teachers in step ① and open the PDF. Each teacher's observations appear on their own pages, one after the other. Great for a board packet.

---

## Where to Go Next

- [Super Admin User Guide](USER_GUIDE_SUPER_ADMIN.md) — who controls the platform
- [Appraiser User Guide](USER_GUIDE_APPRAISER.md) — what your principals do day-to-day
- [Teacher User Guide](USER_GUIDE_TEACHER.md) — what teachers see
- [Technical Architecture Guide](TECHNICAL_GUIDE.md) — how the platform is built

---

*Questions? Contact your district's Super Admin or OptimizED Strategic Solutions.*

---

## 🔔 Notifications (new)

Your header has a bell. It pings for:
- **Annual summary published** anywhere in the district
- District‑wide exception events (overdue acknowledgments on high‑stakes observations)

Install the platform on your phone for push delivery. All on/off controls live on **Profile → Notifications** — master push, master in‑app, and per‑kind.

## 📊 PD Completion Report (new)

Open **Reports** and switch the pill to **PD Completion Report**. District‑wide by default — filter by teacher, school, domain, indicator, status, source, or date range. The KPI strip at the top answers "how much PD was actually completed this quarter?" in a single glance, and you can:
- Click any row to read the teacher's **actual classroom deliverable** and reflections.
- Download the filtered rows as CSV for board packets.
- Sort by submission date, verification date, teacher last name, rubric indicator, status, or module.
