# Alexander Marshall Growth Platform — step‑by‑step preview guide

**For:** Leslie Bieber, Superintendent, Alexander Public School
**Platform:** https://alexander-marshall-growth.pages.dev
**Time budget:** 10 minutes minimum, 30 minutes for the full loop

Everything you see already runs on your real school data: 2 principals, 1 coach, 28 teachers, all 60 Marshall indicators, 240 pedagogy‑library cells, 120 PD modules. No setup required. Log in, click around, clear the data when you're done.

---

## Your six preview logins

| Role | Email | Password | What to look at |
|---|---|---|---|
| **Superintendent (you)** | `leslie.bieber@k12.nd.us` | `PreviewAlexander2026` | The district dashboard, rollups, reports |
| **Super admin** | `admin@alexanderschoolnd.us` | `PreviewAlexander2026` | User management, PD module editor, district settings, data reset |
| **Principal / appraiser** | `aaron.allard@k12.nd.us` | `PreviewAlexander2026` | Day‑to‑day walkthroughs, scoring, publishing, PD review |
| **Instructional coach** | `jacki.hansel@k12.nd.us` | `PreviewAlexander2026` | Coach caseload, PD review, no publish rights |
| **Teacher** | `jil.stahosky@k12.nd.us` | `PreviewAlexander2026` | Teacher dashboard, observation view, PD LMS |
| **Teacher (second)** | `amy.gaida@k12.nd.us` | `PreviewAlexander2026` | Second teacher account for testing peer flows |

> ⚠️ These preview passwords skip the "change your password on first login" step so you can click around fast. Your real rollout will force every staff member to set their own password on first login — these are sandbox‑only.

---

## 10‑minute tour — see the whole lifecycle

Follow this in order. It walks an observation from walkthrough to signed acknowledgement to auto‑recommended PD to teacher deliverable to supervisor verification — the exact loop you described on April 21.

### Step 1 — Log in as the principal (Aaron Allard)
1. Open https://alexander-marshall-growth.pages.dev
2. Email: `aaron.allard@k12.nd.us` / Password: `PreviewAlexander2026`
3. You land on **/appraiser** — your teachers list.
4. **Top‑right, click the Guided Tour pill.** A 6‑step tour highlights each part of the page. Close it when you're done or skip to step 2.

### Step 2 — Start a walkthrough on Jil Stahosky
1. In the teachers list, click **Jil Stahosky**.
2. On her profile, click **Start a new observation → Mini observation**.
3. You're now in the observation editor. Notice:
   - **Context card** — subject, grade, date auto‑filled from when you hit Start.
   - **Scripted Notes card** — type anything, like `10:04 — Jil writes LT on board. 10:06 — students turn-and-talk. 10:09 — Maya explains pattern in own words.`
   - Watch the **green pill in the top‑right of the card**. It flips from grey `Typing…` to green `✓ Saved — N chars at HH:MM` within one second. That's the database confirming it wrote your text.
   - Below the textarea, open the **"Saved scripted notes in database"** disclosure — that's the exact text the server is holding. Verifiable.
4. Scroll down to **Marshall Rubric Scoring**.
   - Click domain B → indicator 4, cell **2** (Basic).
   - Click domain B → indicator 5, cell **3** (Proficient).
   - Click domain E → indicator 3, cell **1** (Does Not Meet).
5. Scroll past scoring and click **Generate / refresh feedback**. Watch glows, grows, focus areas, and next steps populate automatically — all editable.
6. Scroll to the very bottom. **Sign & Publish to Teacher** → draw a signature with your mouse → click publish.

### Step 3 — See it from the teacher's side (Jil Stahosky)
1. Click the profile icon top‑right → Log out.
2. Log in as `jil.stahosky@k12.nd.us` / `PreviewAlexander2026`.
3. You land on her dashboard. Notice:
   - **Awaiting acknowledgement banner** at the top — yellow, calls out the observation she just got.
   - **Bell icon (top‑right)** — click it. There's an unread ping for the new observation.
4. Click **Review** in the banner to open the observation. Notice:
   - A blue **"Please read the full observation below before signing"** banner with chip‑links: Strengths, Growth Areas, Next Steps, Focus Areas, Rubric Scores, Sign & Acknowledge. Each shows a count so nothing is missed.
   - Scroll through. You see the overall summary → strengths → growth areas → next steps → focus areas → rubric scores → signatures — in that order.
5. Scroll to the bottom. Notice the plain‑English note: "Your signature confirms you have seen and discussed this observation. It does NOT mean you agree with every part." Draw a signature, optionally type a response, click **Sign & Acknowledge**.

### Step 4 — Her PD LMS auto‑populated
1. In the left navigation, click **My PD LMS**.
2. You'll see **3 new modules** under "Recommended" — one for each indicator scored at level 1 or 2. Each says "Level 1 → 2: redesign your next [Indicator] lesson" or "Level 2 → 3…".
3. Click the first module. The whole workspace opens:
   - **How this module works** (three phases).
   - **Learn phase** — Pick the lesson, Read the rubric side by side, Spot the gap.
   - **Practice phase** — locked until Learn is done.
   - **Apply phase** — locked until Practice is done.
4. Inside Learn:
   - STEP 1 has an auto‑saving textarea — type a lesson description.
   - STEP 2 shows current‑level vs target‑level rubric language side by side.
   - STEP 3 lists **observable signals as clickable checkboxes** — tick the ones already in your lesson. This is the computer‑friendly version of "circle this / check that."
   - Watch the **green pill in the module header**: `✓ Saved (learn) at HH:MM` after every click or typed character.
5. At the bottom of Learn, click **Mark learn complete**. Practice unlocks instantly.
6. Inside Practice:
   - STEP 4 shows research‑backed next moves as **checkboxes** — tick the ones you'll use.
   - STEP 5 has three small textareas for your scripted opener / pivot / close.
   - STEP 6 is a **radio group** — pick one student evidence artifact.
   - Click **Mark practice complete**. Apply unlocks.
7. Inside Apply:
   - Type a deliverable (2–3 sentences is fine for a demo).
   - Click **Submit for supervisor review**. You get "Submitted for review" confirmation.

### Step 5 — Back to the principal to verify
1. Log out → log back in as `aaron.allard@k12.nd.us`.
2. Top nav → **PD Review**. The deliverable Jil just submitted is at the top of the queue.
3. Click in. You'll see her workspace (Learn, Practice, Apply answers all readable), her deliverable text, and a verification form with the six‑point rubric as a checklist.
4. Click **Verify** (optionally add a note). Jil gets a success notification ping. The module is marked complete in her PD history.

### Step 6 — Zoom back out to district view
1. Log out → log back in as `leslie.bieber@k12.nd.us` (you).
2. You land on **/superintendent** — KPIs across all schools, by‑school rollups, per‑teacher drill‑downs.
3. Top nav → **Reports**. Build any CSV or PDF you want: pick whose (teacher, school, you), what (full record, scores only, PD completion, strengths only, growth areas only), dates, download. Both CSV (Excel‑friendly) and PDF (print‑ready).
4. Top nav → **PD Completion Report** (`/reports/pd`). Filter by teacher, school, domain, indicator, status, source, date. KPI strip shows quarterly completion.

**That's the whole lifecycle.** 10 minutes if you move fast, 30 if you want to explore every screen.

---

## How to clear the test data when you're done

**Option A — from inside the platform (what your team will use):**
1. Log in as `admin@alexanderschoolnd.us` / `PreviewAlexander2026`.
2. Go to **/admin/data-reset** (coming soon — planned for your go‑live week).
3. Pick one or more: "Clear all test observations", "Clear all test PD enrollments", "Clear all test deliverables".
4. Confirm. Staff, rubric, pedagogy library, and PD modules stay. Test data is wiped.

**Option B — text or email me right now:**
- Reply to my transmittal email with "reset Alexander demo data". I run one SQL command from my side. It takes 30 seconds. Your rubric, pedagogy library, staff list, and 120 PD modules stay untouched — just the test observations, scores, PD enrollments, deliverables, and reflections you created during the demo go away. Next time you log in, it's a clean slate.

---

## What each role sees at a glance

### Superintendent (Leslie)
- District KPIs (observations this quarter, teachers with active focus areas, PD completion rate).
- Per‑school rollups (click a building to drill in).
- Per‑teacher drill‑downs (every indicator, every observation, every PD deliverable).
- Reports — CSV and PDF, filtered however you need.
- **No publish/grade rights.** You can read everything, but you can't rewrite a principal's observation or modify a teacher's PD record.

### Super admin (your IT person or designee)
- Manage users (add, edit, reset password, deactivate).
- Manage schools and assign principals/coaches to them.
- Manage the **PD module library** — edit module content, deliverables, rubrics, research basis, resources. Deactivate or activate modules.
- Manage the **pedagogy library** — the 240 rubric cells (60 indicators × 4 levels) with evidence signals, teacher next moves, coaching considerations. Editable in bulk or one cell at a time.
- District settings — contact info on PDFs, PDF header/footer, notification defaults.
- Bulk import users from CSV.
- View system‑wide activity log.

### Principal / appraiser
- Teacher caseload (assigned teachers).
- Start a walkthrough (mini / formal / annual).
- Observation editor with autosaving scripted notes, rubric scoring, generate‑feedback button, editable glows/grows/focus/next.
- PD Review queue — verify or request revision on teacher deliverables.
- Reports scoped to their teachers.

### Instructional coach
- Coaching caseload.
- Same observation view as principal (read‑only on published).
- PD Review queue — verify or request revision.
- Can open and update focus areas, add coaching notes and resources.
- **No publish rights** (only appraisers publish observations).

### Teacher
- Dashboard (awaiting acknowledgement banner, focus areas, recent observations, performance summary).
- Observation viewer (chip‑links, read‑first banner, strengths/grows/focus/next/scores before the signature block).
- Focus Areas page (active and closed growth threads).
- My PD LMS (auto‑recommended + assigned + self‑enrolled modules, Learn → Practice → Apply workspace).
- Profile page (password, notifications preferences).
- Reports — export their own full record as CSV or PDF.

### Roles at a glance

```
             |  Read   |  Score   |  Publish |  Verify PD |  Reports scope
Superintend. |  All    |    —     |    —     |     —      |  Whole district
Super admin  |  All    |    —     |    —     |    All     |  Whole district
Appraiser    |  Their  |   Their  |  Their   |   Their    |  Their teachers
Coach        |  Their  |    —     |    —     |   Their    |  Their teachers
Teacher      |  Own    |    —     |    —     |     —      |  Own record only
```

---

## Things to try that will surprise your principals

1. **Close the browser mid‑observation.** Open it back up 10 minutes later. Every keystroke of scripted notes is still there. Nothing is ever "lost in a tab."
2. **Open two tabs on the same observation as two different appraisers** (ask me to set up a second appraiser if you want). They'll each see live updates as the other types scripted notes — but private notes stay private.
3. **Publish an observation with only 2 indicators scored.** The feedback engine doesn't require you to score all 60. Score what you have evidence for.
4. **Open a PD module, start answering, then navigate away without clicking a "save" button.** Come back 20 minutes later — every checkbox, every radio choice, every typed answer is exactly where you left it.
5. **Install the web app to your phone.** Your principals open the site on their phones, tap the browser menu → "Add to Home Screen" (iOS) or "Install App" (Android / Chrome). They now have a dedicated app icon that works offline for viewing and online for writing, and it supports web‑push notifications (free, no SMS plan needed).
6. **Build a one‑teacher PDF.** Log in as yourself → Reports → pick Jil Stahosky → "Full record" → PDF. Print‑ready in 3 clicks.

---

## If something looks wrong or confusing

- **Message me on the cell I gave you.** I watch the error logs and can fix anything within a day. No ticketing system, no 1‑800 number. Text me.
- **Everything you see is a living product.** If your principals say "we wish it did X," that's gold. Bring it to our team demo and I'll add it.

---

*Built for Dr. Rupak Gandhi · OptimizED Strategic Solutions · April 2026*
