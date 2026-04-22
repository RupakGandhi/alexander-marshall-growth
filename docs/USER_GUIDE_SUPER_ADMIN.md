# Super Administrator — User Guide
**Alexander Public Schools · Marshall Growth Platform**

> **Who is this for?** The district-level administrator(s) who own the platform — usually the person(s) responsible for onboarding staff, configuring the district, maintaining the rubric, and running district-wide reports.

---

## Table of Contents
1. [What You Can Do](#what-you-can-do)
2. [Signing In](#signing-in-for-the-first-time)
3. [The Overview Dashboard](#the-overview-dashboard)
4. [Managing Users](#managing-users)
5. [Multi-School Users](#multi-school-users)
6. [Assignments (who evaluates whom)](#assignments-linking-teachers-to-appraisers--coaches)
7. [Managing Schools](#managing-schools)
8. [The Pedagogy Library](#the-pedagogy-library-240-cells-you-can-edit)
9. [The Evaluation Framework](#the-evaluation-framework)
10. [Bulk Import — Users (CSV)](#bulk-import--users-csv)
11. [Bulk Import / Replace Rubric (CSV)](#bulk-import--replace-rubric-csv)
12. [Reports — CSV and PDF Exports](#reports--csv-and-pdf-exports)
13. [District Settings](#district-settings)
14. [Guided Tour](#the-guided-tour)
15. [Mobile & PWA Install](#mobile--install-as-an-app)
16. [Troubleshooting](#troubleshooting)

---

## What You Can Do

As a **Super Administrator** you have **full control** over the platform. No one else can:
- Create, edit, deactivate, or reset passwords for any user
- Link users to **multiple schools**, and link teachers to multiple appraisers/coaches
- Edit any of the **240 cells** in the Pedagogy Library (interpretation, evidence signals, teacher next moves, coaching considerations, resources, feedback starters)
- Bulk-replace the Marshall rubric via CSV
- Bulk-import users via CSV
- Run **district-wide** reports across every observation
- Update district contact info shown on every printed PDF

You can also do everything a Superintendent / Appraiser / Teacher can — your role is the superset.

---

## Signing In (First Time)

1. Your account is already created by the district. Your email is the address on file; your starting password is **`Alexander2026!`**.
2. Open https://alexander-marshall-growth.pages.dev → enter your email and `Alexander2026!` → **Sign in**.
3. On first login the site **forces you to change your password** before anything else. Pick something at least 8 characters long.
4. After you save it, the **Guided Tour** auto-launches and walks you through every section. (You can replay it any time from the **Guided Tour** button in the top nav.)

---

## The Overview Dashboard

**URL:** `/admin` (or click *Overview* in the top nav)

What you see at a glance:
- **User counts** — teachers, appraisers, coaches, superintendents, super admins (all active)
- **Observation status roll-up** — how many are in draft, scored, awaiting signature, published, acknowledged
- **Recent activity feed** — the last 20 actions across the whole platform (who logged in, who created a user, who published an observation, etc.)
- **Quick links** — shortcut buttons to Users, Assignments, Schools, Pedagogy Library, Framework, Bulk Import, Reports, District Info

This page is your "is everything healthy?" scan.

---

## Managing Users

**URL:** `/admin/users`

### Create a user
1. Fill out the **Add user** form at the top:
   - First name, Last name, Email (required — must be unique)
   - Role — `super_admin`, `superintendent`, `appraiser`, `coach`, or `teacher`
   - Title (optional) — e.g. *2nd Grade*, *Elementary Principal*, *Math Coach*
   - Phone (optional)
   - **Schools** — multi-select. The first one picked becomes their **primary school**; extras are additional memberships
   - Password — leave blank to use the district default `Alexander2026!`; tick *Force password change* if you want them to change it on first login (on by default)
2. Click **Create user**. The user is added immediately.

### Edit a user
1. In the **All users** table, click the user's name (or the "Edit" chevron).
2. An inline editor opens with their current values.
3. Update any fields and click **Save**. Schools are a multi-select — add or remove as needed.

### Reset a user's password
1. Open the user's row.
2. Click **Reset password**. Their password is set back to `Alexander2026!`, their `must_change_password` flag flips on, and **every active session** for that user is killed. They'll be forced to sign in fresh with the new password and change it.

### Deactivate a user
1. Open the user's row.
2. Click **Deactivate**. The account becomes invisible in lists, can't sign in, and is excluded from reports — but **all their historical observations and data remain** (nothing is deleted). To re-enable, contact the developer; there's no UI for reactivation today because districts rarely need it.

### Search & filter
- The **search box** matches first name, last name, or email (partial match).
- The **role filter** narrows the list to one role.
- The **school chips** in each row show every school the user is linked to; a small gold star marks the primary school.

---

## Multi-School Users

Some staff work across two or more buildings — a reading coach who covers the elementary and middle school, a principal on special assignment, a teacher who splits their day. The platform supports this natively.

**How it works:**
- Every user still has a single "primary school" for display purposes.
- They can ALSO be linked to any number of additional schools via the `user_schools` table.
- **Report Builder** correctly matches a user if *any* of their schools is selected in the school filter.
- **Superintendent views** correctly count the teacher at every school they belong to.

**To link a user to multiple schools:**
- Pick multiple schools in the *Schools* multi-select on the Create or Edit form.
- Hold **Ctrl** (Windows/Linux) or **⌘** (Mac) and click each school, OR tap each one in sequence on mobile.
- The **first school selected is the primary**. Change the primary by de-selecting and re-picking in the right order, or by editing and saving again.

---

## Assignments (linking teachers to appraisers / coaches)

**URL:** `/admin/assignments`

This is **the** page that powers role-based data scoping. It's also a multi-select page so you can do many assignments at once.

### Creating assignments
1. Pick any number of **teachers** on the left (Ctrl/⌘-click for multi).
2. Pick any number of **staff** on the right (appraisers and coaches appear mixed with a role label).
3. Pick the **relationship**: *Appraiser* or *Coach*.
4. Click **Create assignments**. Every teacher × staff combination you picked is linked in one operation. The summary tells you how many were created and how many were skipped because they already existed.

**Tips:**
- To give a teacher BOTH an appraiser AND a coach, submit the form twice — once with each relationship.
- If a teacher changes principals mid-year, don't delete the old assignment — deactivate it instead. Historical observations will still show the right appraiser.

### Seeing who reports to whom
The **Current assignments** card is grouped by staff member, so you can see "Principal Smith evaluates these 12 teachers; Coach Jones coaches these 6 teachers."

### Bulk-unlinking
- Tick the checkboxes next to any rows you want to remove, then click **Remove checked**. All rows are deactivated in one operation.
- Or delete a single row with the trash icon.

**What happens when you unlink someone?**
- The row is marked inactive (soft delete) — nothing is hard-deleted.
- Past observations that principal/coach created are untouched.
- The teacher simply disappears from that staff member's "My Teachers" list going forward.

---

## Managing Schools

**URL:** `/admin/schools`

### Add a school
Fill in name, grade span (e.g. *PK-5*), address, and phone. Click **Add school**.

### Edit a school
Click any school in the **All schools** table to expand an inline editor.

**Why schools matter:**
- Every school becomes available in the multi-school picker on the Users page
- Every school becomes a filter in the Report Builder
- The grade-span string shows up in the school drill-downs
- Address and phone are used on printed PDFs when a single-school header is generated

---

## The Pedagogy Library (240 cells you can edit)

**URL:** `/admin/pedagogy`

The Marshall rubric has 60 indicators × 4 performance levels = **240 cells**. For each cell, the Pedagogy Library stores:

| Field | Who sees it | Purpose |
|---|---|---|
| **Interpretation** | Appraisers + Coaches | Plain-English "what does this score really mean?" |
| **Evidence signals** | Appraisers | Observable look-fors in a real classroom |
| **Teacher next moves** | Teachers | Concrete, grade-agnostic strategies the teacher can try |
| **Coaching considerations** | Coaches | The coaching conversation starting points |
| **Resources** | Teachers + Coaches | Books, articles, videos (title + source) |
| **Feedback starter** | Appraisers | Editable sentence used when auto-generating feedback |

**Editing a cell:**
1. Browse to `/admin/pedagogy`.
2. Expand any domain (A–F) → any indicator → click any level.
3. Edit the fields. Bulleted lists work — put each bullet on its own line; leading `-` or `•` is stripped.
4. Click **Save**. The change is logged to the activity feed and instantly used by every observation going forward.

**Why would I edit a cell?**
- You adopt updated district language for an indicator.
- Your coaches find better resources.
- Your staff wants more grade-level-appropriate teacher next moves.
- You want to align the feedback starters with district voice.

---

## The Evaluation Framework

**URL:** `/admin/framework`

A read-only view of the currently active framework (Kim Marshall 2014 by default): domains, indicators, and all 240 rubric cells as seeded from the original PDF.

From here you can:
- **Bulk import / replace** the whole rubric via CSV (see next section)
- **Export** the current rubric to CSV (for district committee review, archiving, or editing offline)
- Jump to the **Pedagogy Library** to edit any cell

---

## Bulk Import — Users (CSV)

**URL:** `/admin/import/users`

When onboarding a full staff roster, skip the one-at-a-time form.

### Step 1 — Download the template
Click the *Download template* link. You'll get `users_import_template.csv` with these columns:

| Column | Required | Notes |
|---|---|---|
| `first_name` | yes | |
| `last_name` | yes | |
| `email` | yes | Must be unique; matching email UPDATES the user instead of creating |
| `role` | yes | One of `super_admin`, `superintendent`, `appraiser`, `coach`, `teacher` |
| `title` | no | Free text |
| `phone` | no | |
| `school_names` | no | **Pipe-separated** list for multi-school users, e.g. `Alexander Elementary \| Alexander Jr/Sr High`. Single-school users just put one name. (Legacy column `school_name` still works.) |
| `password` | no | Blank → default `Alexander2026!` + force change |
| `active` | no | `0` to deactivate, blank/`1` for active |

### Step 2 — Fill it out in Excel / Google Sheets
Match existing school names exactly. Emails are case-insensitive.

### Step 3 — Upload
- Tick **Dry run** first to see exactly what will be created/updated without committing anything.
- Then uncheck Dry run and upload for real.
- You'll get a summary: created / updated / skipped / errors (with row numbers and reasons).

**The import is idempotent** — re-uploading the same CSV won't duplicate anyone. Matching emails update the existing record.

---

## Bulk Import / Replace Rubric (CSV)

**URL:** `/admin/import/rubric`

For when you adopt a new rubric or want to import district-edited language wholesale.

### Step 1 — Download the template or export current
- *Download template* → empty CSV with the right column shape
- *Export current rubric* → the live rubric as CSV, editable in Excel

### Step 2 — The CSV shape
One row per indicator (not per cell). Columns:
- `domain_code`, `domain_name`
- `indicator_code`, `indicator_name`, `indicator_description`
- `level_4_*`, `level_3_*`, `level_2_*`, `level_1_*` (the descriptor text for each level)

### Step 3 — Upload
- **Replace mode** (default) — the upload replaces the active framework entirely. New domains/indicators are created, missing ones are deactivated. Existing observation scores survive because scores point to stable indicator IDs.
- Always run a **dry run first** and eyeball the summary before committing.

---

## Reports — CSV and PDF Exports

**URL:** `/reports`

The Report Builder is a three-step process:

### ① Who & when
- **Teachers** (multi-select)
- **Schools** (multi-select) — matches multi-school teachers correctly
- **Appraisers** (multi-select) — so you can run "every observation Principal Smith did this year"
- **From / To** date range
- **Observation type** — Mini / Formal / Annual Summary (any combination)
- An empty list for any filter = "everyone I'm authorized to see."

### ② What to include
One-click **presets**:
- **Full observation** — summary, scores, feedback, signatures (everything)
- **Scores only** — just rubric scores per indicator
- **Strengths only** — Glows only
- **Growth areas only** — Grows + Next Steps
- **Feedback only** — all feedback, no scores (great for coaching conversations)
- **Teacher folder copy** — everything a teacher needs for their portfolio

Or tick individual checkboxes. Super admins can also include **private appraiser notes** (teacher PDFs never include these).

### ③ Download
- **CSV** — opens in Excel / Google Sheets. Pick the row shape:
  - *One row per observation* (summary + counts + averages)
  - *One row per rubric score* (ideal for pivot tables)
  - *One row per feedback item* (glows + grows + focus + next steps)
  - *Only strengths / Only growth areas / Only focus / Only next steps*
  - *Everything (wide)*
- **PDF** — a print-ready report opens in a new tab. Use your browser's **Print → Save as PDF** to save or email. Each observation starts on its own page.

**Preview below** — a live table shows the observations that match your filter so you know exactly what will be exported.

---

## District Settings

**URL:** `/admin/district`

District name, address, city/state/zip, phone. These values appear on:
- Every printed PDF header/footer
- The login page footer
- Any district-branded emails (future)

Keep them current — every observation PDF your teachers take to a hearing or a promotion meeting carries this info.

---

## The Guided Tour

**Every page, every role**, the gold **Guided Tour** pill in the top-right launches a role-aware walkthrough. For super admins it has 15 steps covering overview → users → assignments → schools → framework → pedagogy → imports → reports → district settings.

**How to access:**
- Gold **Guided Tour** pill in the top navigation (or inside the ☰ menu on phones)
- *Guided Tour* item in the user menu (click your initials in the top-right)
- *Start the tour* button on your **Profile** page
- **Auto-launches** the very first time you sign in (once per user, remembered in localStorage)

**Controls inside the tour:**
- **→ Next**, **← Back**, **Esc** to close, **Skip tour**
- The engine auto-navigates between pages when a step targets a different URL
- A progress bar shows "Step 5 of 15"
- Dismissible any time; your progress is saved if you reload mid-tour

---

## Mobile & Install as an App

The platform is a full **Progressive Web App (PWA)** — you can install it on your phone, tablet, or desktop.

**Android / Chrome / Edge:**
- A gold **"Install app"** floating button appears in the corner on first visit
- Or use the browser's Install icon in the address bar

**iPhone / iPad (Safari):**
- Tap the **Share** button (↑) at the bottom
- Scroll down → **Add to Home Screen**
- A one-time hint card shows you exactly how

**What you get when installed:**
- Opens in its own window (no browser chrome)
- Home-screen / Start-menu icon
- App shortcuts: *Dashboard*, *Reports*, *Guided Tour*
- Works on any page you've already visited — the service worker caches the app shell
- Automatic "New version available" banner when the app is updated

**Mobile-specific UI:**
- A hamburger menu (☰) in the top-left replaces the desktop nav
- Data tables scroll horizontally inside their card instead of breaking the layout
- Forms collapse to one column
- Every button/link meets the 44px touch-target minimum

---

## Troubleshooting

| Problem | What to check |
|---|---|
| "Invalid email or password" on login | Emails are case-insensitive; passwords are case-sensitive. If a user forgot theirs, use **Reset password** on their row. |
| A teacher is missing from a principal's "My Teachers" | Go to `/admin/assignments` and make sure an active `appraiser` link exists between that teacher and that principal. |
| A multi-school teacher doesn't show up in a school report | Make sure the `user_schools` junction has both schools listed. Edit the user and re-pick both schools to be sure. |
| Someone says the rubric wording is wrong | That's the Pedagogy Library — edit the cell at `/admin/pedagogy/:indicatorId/:level`. |
| Bulk import fails with "School not found" | The CSV's `school_names` must match the school name **exactly** (spelling, punctuation). Use a pipe `\|` between schools for multi-school staff. |
| PDF exports are missing data | Check the **What to include** checkboxes in the Report Builder; also confirm the observations are **published** (drafts never export). |
| An observation is stuck in "draft" forever | Only the original appraiser (or you) can delete a draft. Open it at `/appraiser/observations/:id` and click **Delete draft**. |

---

## Where to Go Next

- [Superintendent User Guide](USER_GUIDE_SUPERINTENDENT.md) — what the district-level read-only user sees
- [Appraiser User Guide](USER_GUIDE_APPRAISER.md) — what principals do day-to-day
- [Coach User Guide](USER_GUIDE_COACH.md) — the coaching view
- [Teacher User Guide](USER_GUIDE_TEACHER.md) — what teachers see
- [Technical Architecture Guide](TECHNICAL_GUIDE.md) — how the whole platform is built

---

*Questions or bug reports? Contact Dr. Rupak Gandhi at OptimizED Strategic Solutions.*
