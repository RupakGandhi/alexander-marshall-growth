# Alexander Marshall Growth Platform — End-to-End Test Plan

> **Audience**: A ChatGPT (or any) testing agent driving a real browser against the live production environment.
> **Goal**: Confirm every artifact-submission, PD-request, and supervisor-review workflow works perfectly across every role before the **August 16, 2026 firm launch**.
> **Production URL**: <https://alexander-marshall-growth.pages.dev>
> **Last verified**: June 5, 2026 (Dr. Gandhi pass — guided tour disabled by default + UI/UX role audit)

---

## 0. How to use this document

1. Work through each test in order, top to bottom — later tests assume earlier tests left specific state (e.g. a submitted deliverable that the appraiser then verifies).
2. For each step, the **Expected** column tells you exactly what to look for. If anything diverges, **stop** and report:
   - Which test section (e.g. "Test 4, step 3")
   - The exact URL you were on
   - The exact text or screenshot of what you saw vs. what was expected
   - Browser console errors (if any) — open DevTools → Console
3. If a test is destructive (e.g. "verify a deliverable"), you do **not** need to revert — the next agent run will re-create state.
4. **Browser**: Use Chrome or Firefox latest. JavaScript must be enabled. Cookies must be enabled.
5. **Do not** use the `?welcome=1` URL parameter — that's a login-redirect artifact, not a feature to test.

---

## 1. Test accounts (all share password `demo1234`)

| Role | Name | Email | Password | What they see |
|---|---|---|---|---|
| **Teacher** | Jil Stahosky | `jil.stahosky@k12.nd.us` | `demo1234` | Personal dashboard, PD LMS, observations she received, focus areas, external PD submissions |
| **Appraiser** | Aaron Allard | `aaron.allard@k12.nd.us` | `demo1234` | Teachers he supervises (incl. Jil), observation tool, PD review queue, external PD review queue |
| **Appraiser** | Shannon Faller | `shannon.faller@k12.nd.us` | `demo1234` | Different teacher caseload (use if you need a second appraiser perspective) |
| **Coach** | Jacki Hansel | `jacki.hansel@k12.nd.us` | `demo1234` | Read-only view of her assigned teachers' published feedback (no scores) + PD review queue |
| **Superintendent** | Leslie Bieber | `leslie.bieber@k12.nd.us` | `demo1234` | District-wide overview, school rollups, all observations and feedback |
| **Super Admin** | District Administrator | `admin@alexanderschoolnd.us` | `demo1234` | Everything: user management, framework editor, PD module editor, data tools, settings |

> If a login fails with "must change password," the seed reset was not applied — escalate before continuing.

---

## 2. Universal sanity checks (run once at the start)

### 2.1 Guided tour does NOT auto-launch on login

For **each** of the six accounts above:

1. Open an **incognito / private** browser window.
2. Navigate to <https://alexander-marshall-growth.pages.dev/login>.
3. Sign in with the credentials.
4. **Expected**: You land on the role's home page. **No tour overlay appears.** No dark-screen "Welcome — let me show you around" pop-up. No spotlight ring on any nav item.
5. Locate the **"Guided Tour"** button (top-right of the desktop nav bar, or inside the hamburger menu on mobile).
6. Click it. **Expected**: The tour overlay now opens with step 1 of N. Click "Next" once, then "Close" — the overlay disappears cleanly.
7. Refresh the page. **Expected**: The tour does **not** re-open.
8. Log out (top-right menu → Sign out) and repeat for the next role.

**Pass criteria**: All six roles show **zero auto-launched tours**, but every role's manually-clicked "Guided Tour" button still works.

### 2.2 Scroll-preserving save (universal AJAX interceptor)

1. Sign in as **Jil Stahosky** (teacher).
2. Open **My Dashboard** → scroll to "My Goals" section.
3. If she has no goals, click "Add a goal" and fill in: title `Test goal — improve exit tickets`, type `professional`, target date `2026-08-30`. Submit.
4. **Expected**: A small "Saving…" then "Saved" pill briefly appears top-right. The page does **not** scroll to the top. You stay positioned at the "My Goals" section.
5. Repeat the same scroll-preservation check on **at least 3 more save actions** across the system:
   - Teacher: "Save reflection" inside any active PD module
   - Appraiser: scoring an observation indicator
   - Super Admin: editing a PD module title in `/admin/pd`
6. **Pass criteria**: Every save updates content in place. The Saved pill is visible. Scroll position stays within ~50 px of where you were. No full-page reload.

### 2.3 Auto-generated feedback renders cleanly (no raw pipes)

1. Sign in as **Aaron Allard** (appraiser).
2. Open the most recent draft observation for **Jil Stahosky**. If none exists, create one: My Dashboard → click Jil → "New Observation" → type "Mini-Observation" → save.
3. In the **Scripted Notes** textarea, paste this exact markdown:
   ```
   Here are sample scripted observation notes:

   | # | Observation Note |
   | -: | --- |
   | 1 | Objective posted: "Students will analyze how an author develops theme through character choices." |
   | 2 | Bell ringer displayed and students writing independently. |
   | 3 | Teacher circulates and prompts one student to "Go back to the text." |
   ```
4. Wait for the autosave "✓ saved" indicator.
5. Click **"Generate Feedback"**.
6. **Expected**: A new "What I saw in your classroom" feedback chunk appears.
7. Scroll to that chunk. **Expected**: It renders as a **real HTML table** with two columns (`#` and `Observation Note`) and three data rows. **No raw pipe characters** (`| 1 |`, `|---|`) visible anywhere.
8. Publish the observation (skip for now if you don't want to sign — see Test 5 for full publish flow).

**Pass criteria**: Markdown tables, bulleted lists (lines starting with `•` or `-`), and numbered lists (`1. `, `2. `) in any feedback body **always** render as structured HTML elements, never as raw source text.

---

## 3. Teacher workflow — Jil Stahosky

> All steps below assume you start signed in as **`jil.stahosky@k12.nd.us` / `demo1234`** at <https://alexander-marshall-growth.pages.dev>.

### Test 3.1 — Self-enroll in a PD module from the library

1. Click **My PD LMS** in the nav.
2. **Expected page**: shows three stat tiles (Active / Completed / Plans), a card titled **"Recommended Modules"** (the title is exactly "Recommended Modules" — **not** "Suggested modules" and **not** "Your modules"), and a card titled **"Module Library"** further down with a "Browse all modules" link.
3. Click **"Browse all modules"** (or the **My PD LMS** sub-link to the library directly: `/teacher/pd/library`).
4. The page lists every active PD module grouped by domain and indicator. Each card has an **Add to my LMS** button (form-button that POSTs to `/library/<id>/enroll`).
5. Click **Add to my LMS** on any module that isn't already in your Active list.
6. **Expected**: You're redirected to `/teacher/pd/<new-enrollment-id>` — the module's three-phase workspace (Learn → Practice → Apply). The phase tabs are labeled clearly and the **Learn** tab is the active one.

### Test 3.2 — Work through Learn → Practice → Apply phases

1. On the Learn tab, fill in any text/checkbox widgets the module provides. The autosave pill in the top-right of the workspace should flash "✓ saved" within ~1 second of stopping typing.
2. Click **"Finish Learn — start Practice"** at the bottom.
3. **Expected**: Page does not scroll to top. The **Practice** tab is now active, and the **Learn** tab shows a green checkmark.
4. Fill in the Practice widgets and click **"Finish Practice — start Apply"**.
5. **Expected**: The **Apply** tab is now active. Both Learn and Practice tabs show checkmarks.

### Test 3.3 — Submit a deliverable (artifact)

1. In the Apply tab, scroll to the **"Submit your deliverable"** form.
2. Fill in:
   - Title: `Two routines I tried this week`
   - Body (long-form text area): paste at least 3 paragraphs describing what you implemented in your classroom, what happened, and what you learned. Use **markdown bullets** (`• ` or `- `) for one paragraph and a **numbered list** (`1.`, `2.`, `3.`) for another so we can also verify rendering downstream.
3. Click **Submit for review**.
4. **Expected**:
   - You're redirected back to the module workspace with the URL containing `?msg=Submitted+for+review`.
   - The status pill at the top of the page changes from "In progress" to **"Submitted"**.
   - The Apply form is now read-only.
   - A toast / banner confirms submission.

### Test 3.4 — Submit external PD

1. Click **My Dashboard** in the nav.
2. Scroll to the **"Submit External PD"** card.
3. Fill in:
   - Title: `ND Council of Teachers of English regional conference`
   - Provider: `NDCTE`
   - Hours: `4`
   - Activity date: pick a date in the past month
   - Description: 1–2 sentences about what was covered
4. Click **Submit for review**.
5. **Expected**:
   - The page updates in place (no scroll-to-top) and shows a "Submitted for review" toast.
   - The submission appears immediately in the **"My External PD"** list below the form with status badge **Submitted**.
   - A "Withdraw" link is offered (only available pre-review).

### Test 3.5 — View a published observation (read-only)

1. Click **Observations** in the nav.
2. If Jil has any past published observations, click the most recent one. If she has none, skip to Test 5 (where the appraiser will publish one), then come back here.
3. **Expected page**: A scored, published observation with:
   - Overall Summary from your Appraiser (clean paragraph rendering — no raw markdown)
   - Strengths / Growth Areas / Suggested Next Steps / Focus Areas cards
   - Rubric Scores table
   - Two signature blocks (appraiser's signature visible; yours either signed or showing the **Acknowledge** form)
4. If the Acknowledge form is visible, draw a signature in the canvas, type an optional comment, and click **Sign & Acknowledge**.
5. **Expected**: The form is replaced by your signature image, timestamp, and your comment.

### Test 3.6 — Profile / notifications

1. Click your name in the top-right → **Profile**.
2. Change your display title (e.g. `4th-grade ELA, Mentor`). Click Save.
3. **Expected**: Saved in place, "Profile updated" toast, no scroll-to-top.
4. Toggle a notification preference (e.g. uncheck "Email me when an observation is published"). Save.
5. **Expected**: Saved in place. The checkbox stays unchecked after page reload.

---

## 4. Coach workflow — Jacki Hansel

> Coach is **read-only on observations** by design: she can see published feedback but **never the rubric scores**. She can review PD deliverables for teachers assigned to her.

### Test 4.1 — Coach home

1. Sign out, sign in as `jacki.hansel@k12.nd.us` / `demo1234`.
2. **Expected**: Home page titled "My Teachers". Each assigned teacher card shows name, school, active focus areas count, and a "View" button. **No score numbers** appear anywhere on this page.

### Test 4.2 — Coach views a teacher's published feedback

1. Click any assigned teacher (Jil if visible).
2. **Expected**: A "Published Feedback (no scores)" section appears with cards per published observation. Each card shows:
   - Observation type, date, who observed
   - Strengths / Growth Areas / Focus Areas / Next Steps in cleanly formatted blocks
3. **Confirm**: **No rubric score numbers** (1, 2, 3, 4 ratings) are visible anywhere on the page. The "Rubric Scores" table you saw as the teacher in Test 3.5 is intentionally hidden from coaches.

### Test 4.3 — Coach verifies a teacher's PD deliverable

1. Click **PD Review** in the nav (path: `/pd/review`).
2. **Expected**: A queue of submitted deliverables from teachers assigned to Jacki.
3. Open the deliverable Jil submitted in Test 3.3.
4. **Expected page**: shows teacher info, the module's prompt, the teacher's submitted title + body, three reflection sections (Learn / Practice / Apply), and a **Deliverable Rubric** with N criteria.
5. Score at least one rubric criterion (pick a level 1–4 and optionally add a note). Click Save.
6. **Expected**: Saved in place — page does not scroll to top. The score pill on that criterion updates.
7. Click **"Verify deliverable"** (use credit hours `1.0` and add a note like `Nice routines`).
8. **Expected**: Status updates to "Verified" with hours_credited and verification note. Teacher Jil receives a notification.

---

## 5. Appraiser workflow — Aaron Allard

> The appraiser is the **only** role that can create observations, score them, generate feedback, sign them, and publish them to the teacher.

### Test 5.1 — Create a draft observation for Jil

1. Sign in as `aaron.allard@k12.nd.us` / `demo1234`.
2. Click **My Teachers** → Jil Stahosky.
3. Click **"New Observation"**.
4. Pick **type** = `Mini-Observation`, set **observed_at** = today's date/time, **subject** = `ELA Block`, then Save.
5. **Expected**: Redirected to `/appraiser/observations/<new-id>` with status **Draft**.

### Test 5.2 — Score every indicator

1. The page shows the full Marshall rubric grouped by Domain (A–F) with indicators 1–N under each.
2. For each indicator, click a rating button (1, 2, 3, or 4) — the score saves instantly. The Saved pill flashes top-right.
3. Optionally add an evidence note per indicator.
4. **Expected**: Every save is in-place, scroll position is preserved, the score-summary tile at the top of the page increments.

### Test 5.3 — Add scripted notes + generate feedback

1. Scroll to the **"Scripted Notes"** card.
2. Paste this exact text (includes a markdown table to verify clean rendering downstream):
   ```
   9:02 — Teacher writes learning target on board.

   | # | Note |
   | -- | --- |
   | 1 | Objective visible all 35 minutes. |
   | 2 | Bell ringer prompts text-based response. |
   | 3 | Cold-call sequence draws in two quieter students. |

   Strong close: students completed exit ticket with sentence frame.
   ```
3. Wait for the autosave "✓ chars saved" pill (~1 sec).
4. Click **"Generate Feedback"**.
5. **Expected**:
   - Page updates in place (no full reload, no scroll-to-top).
   - New feedback chunks appear: "What I saw in your classroom" plus per-indicator glow/grow/next-step items.
   - The "What I saw in your classroom" chunk renders the markdown table as a **real HTML table** with two columns and three data rows. **No raw pipe characters.**

### Test 5.4 — Edit feedback in place

1. Expand any auto-generated glow card.
2. Edit the body text (add a sentence). Click Save.
3. **Expected**: Saved in place, scroll position preserved.
4. Delete one feedback item (click Delete in the expanded card → confirm in browser dialog).
5. **Expected**: Item removed, page updates in place.

### Test 5.5 — Sign and publish

1. Scroll to the **Signature** card at the bottom.
2. Draw your signature in the canvas.
3. Click **Sign & Publish**.
4. **Expected**:
   - Status changes to **Published**.
   - Form fields become read-only.
   - Teacher Jil receives a notification.
   - Any focus_area feedback items become entries in Jil's "Focus Areas" list.
5. Sign out, sign back in as Jil, and complete **Test 3.5** to confirm the observation lands cleanly in her view.

### Test 5.6 — Approve Jil's external PD submission

1. Back as Aaron, click **External PD** in the nav (path: `/appraiser/external-pd`).
2. **Expected**: Queue showing Jil's external PD submission from Test 3.4 with status **Submitted**.
3. Open it. **Expected page**: shows the title, provider, hours, activity date, description (cleanly formatted), and a review form with three buttons (Approve / Request Revision / Decline).
4. Set **approved_hours** = `4` (or override), add a review note like `Great conference`, then click **Approve**.
5. **Expected**: Status flips to **Approved**, hours credited, review note saved. Teacher Jil receives a notification.

---

## 6. Superintendent workflow — Leslie Bieber

> Superintendent has **read-only district visibility** across all schools, all teachers, and all observations.

### Test 6.1 — District home

1. Sign in as `leslie.bieber@k12.nd.us` / `demo1234`.
2. **Expected**: "District Overview" page with KPI tiles (total teachers, observations this year, distribution across Highly Effective / Effective / Improvement Necessary / Does Not Meet) and a school-by-school rollup table.

### Test 6.2 — Drill into a teacher

1. Click any school → click a teacher → view their observation history.
2. **Expected**:
   - Every observation type and date is visible.
   - Opening any published observation shows the full scored rubric, full feedback chunks, and signatures.
   - All auto-generated content (summaries, feedback bodies, focus area descriptions) renders cleanly — no raw markdown pipes.

### Test 6.3 — PD hours heat map

1. Look for the PD hours heat-map widget on the district home (or a school page).
2. **Expected**: A color-coded grid showing teachers vs. hours-completed across the school year, with the district's PD-hours target highlighted.

### Test 6.4 — Export PD hours CSV

1. Find the "Export PD hours" link/button (typically next to the heat map or in the school detail page).
2. Click it. **Expected**: A CSV downloads with one row per teacher, columns for total hours, internal PD hours, external PD hours, and pacing toward target.

---

## 7. Super Admin workflow — District Administrator

> Super admin has **everything**: user management, framework editor, PD module editor, data tools, settings, audit log.

### Test 7.1 — User management

1. Sign in as `admin@alexanderschoolnd.us` / `demo1234`.
2. Click **Admin** → **Users**.
3. **Expected**: Searchable, sortable list of all users with role, school, active status.
4. Click any user → view their profile detail. Reset their password (use the "Reset password" action → a temporary password is generated; record it on screen). Confirm the user gets `must_change_password=1` set so they're forced to pick a new one on next login.
5. **Do not** reset the test accounts in the table above, or this whole test plan will break.

### Test 7.2 — PD module editor

1. Click **Admin** → **PD Modules** (`/admin/pd`).
2. **Expected**: List of all PD modules grouped by domain/indicator. Each shows title, target level, enrollment count.
3. Click any module → edit one field (e.g. add a sentence to **research_basis**). Save.
4. **Expected**: Saved in place. CSV export ("Export all to CSV") works and downloads a UTF-8 CSV with all 19 columns.

### Test 7.3 — Framework editor

1. Click **Admin** → **Framework** (or **Rubric**).
2. **Expected**: List of Marshall rubric domains and indicators. You can edit an indicator's name or description; changes save in place.

### Test 7.4 — Audit log

1. Click **Admin** → **Activity / Audit Log**.
2. **Expected**: Reverse-chronological list of recent actions (observation publishes, deliverable submits/verifies, password resets, user adds). Each row links to the affected entity.

### Test 7.5 — Settings (PD hours target etc.)

1. Click **Admin** → **Settings**.
2. **Expected**: Editable district-level settings (e.g. `pd_hours_target_per_year`, `force_password_change_on_first_login`, etc.).
3. Change the PD-hours target to `30`, save, then change it back to whatever it was. **Expected**: Both saves persist instantly without scroll-to-top.

### Test 7.6 — Data tools

1. Click **Admin** → **Data** (or the "Reset practice data" link).
2. **Expected**: A page warning that the reset will wipe PD enrollments, deliverables, external PD, and teacher goals — **without** touching observations, users, schools, rubric, or pedagogy library.
3. **Do not click the reset button** during testing — that's a destructive action only run during major demos / staff training resets.

---

## 8. UI/UX checks (every role, every page)

Run these on at least one page per role:

| Check | Pass criteria |
|---|---|
| **Mobile viewport** (375 × 667) | Nav collapses to hamburger; cards stack vertically; no horizontal scroll on any page |
| **Tablet viewport** (768 × 1024) | Nav shows top-level links; multi-column layouts (md:grid-cols-2) render correctly |
| **Desktop viewport** (≥1024 × 768) | Full nav visible; multi-column layouts (md:grid-cols-3) render correctly |
| **Color contrast** | Body text on cream `bg-aps-wheat` background has sufficient contrast (≥4.5:1 by APCA) |
| **Keyboard navigation** | Tab through any form — focus rings are always visible. Enter submits. Esc closes the tour overlay |
| **Console errors** | Open DevTools → Console on any page. Only the Tailwind CDN warning should appear. **Zero JavaScript errors.** |
| **404 page** | Visit `/this-path-does-not-exist` → friendly "Not found" page with a "Back to dashboard" link |
| **Auto-formatted feedback** | Anywhere a feedback body, summary, focus area description, or reviewer note appears, markdown bullets / numbered lists / pipe tables render as real HTML — never as raw source text |
| **In-place save** | Every form submission keeps you on the page you were on, preserves scroll position, and shows the "Saving… / Saved" pill |
| **No auto-tour** | The "Guided Tour" overlay never appears unless you explicitly click the Guided Tour button |

---

## 9. Known-bad inputs (security smoke tests)

Run these as **Jil Stahosky** unless noted otherwise.

| Action | Expected response |
|---|---|
| Submit external PD with `hours=-5` | Form is rejected with "Title and positive hours are required" (or similar). No row is created. |
| Submit a deliverable with empty body | Redirected back with `?msg=Deliverable+cannot+be+empty`. No row is created. |
| Navigate to `/admin/users` as Jil | HTTP 403 / "Forbidden" — Jil cannot see admin pages. |
| Navigate to `/pd/review/9999` (non-existent enrollment) | HTTP 404 "Not found". |
| Navigate to another teacher's observation by guessing its ID (`/teacher/observations/1`) | HTTP 404 / "Not found" — Jil can only see her own. |
| Open an observation by URL after publish, try to modify a feedback item | Form fields are read-only post-publish. |

---

## 10. Reporting back

When you finish, produce a report with this structure:

```
## E2E test report — <YYYY-MM-DD HH:MM UTC>

Environment: production (https://alexander-marshall-growth.pages.dev)
Browser: <Chrome / Firefox> <version>
Tester: <agent name>

### Summary
- Passed: N of M tests
- Failed: M-N (list each below)
- Console JS errors observed: yes/no (if yes, where)

### Failures
For each failed test:
  - **Test section**: e.g. "Test 5.3 step 5"
  - **URL**: e.g. https://alexander-marshall-growth.pages.dev/appraiser/observations/42
  - **Expected**: "Feedback chunk renders as HTML table"
  - **Actual**: "Feedback chunk shows raw pipe characters | 1 | ..."
  - **Console errors**: <paste any>
  - **Screenshot URL or paste**: <if applicable>

### Other observations
- UI/UX friction points the spec didn't anticipate
- Any places where the "Saving… / Saved" pill did NOT appear
- Any places where scroll position was lost
- Any places where a tour overlay appeared unexpectedly
```

Send the report to Dr. Rupak Gandhi (Co-Founder, OptimizED Strategic Solutions) for the August 16, 2026 launch sign-off.

---

## Appendix A — Component contract reminders

- **Card titles** use Title Case ("Strengths", "Growth Areas", "Recommended Modules", "Module Library"). Lowercase mid-word is a bug.
- **"Guided Tour"** button always exists in top-nav (and inside the hamburger on mobile). It launches the tour on demand. It does not pop up on its own.
- **Saved pill** uses a fixed-position element outside `<main>` so it survives in-place page swaps.
- **Prose renderer** (`src/lib/prose.tsx`) recognises pipe tables, `•/-/*/·` bullets, and `1.`/`1)` numbered lists. Plain prose stays as paragraphs. Everything is XSS-safe (Hono JSX auto-escapes; no `dangerouslySetInnerHTML`).

## Appendix B — Reset instructions for a re-test

If a destructive test (publish, verify, approve) leaves the system in a state that breaks a later test, run **as super-admin**:

1. Sign in as `admin@alexanderschoolnd.us` / `demo1234`.
2. Go to **Admin → Data**.
3. Click **"Reset practice data"** — wipes PD enrollments, deliverables, external PD, and teacher goals. Leaves observations, users, schools, rubric, pedagogy library, and audit log untouched.
4. Confirm.
5. Restart the test plan from **Test 3.1**.

To **also** wipe observations (rare — only during major demos), use the more destructive "Reset observations + PD" tool on the same page. Do not run this without a backup.
