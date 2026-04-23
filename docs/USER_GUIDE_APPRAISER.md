# Appraiser / Principal — User Guide
**Alexander Public Schools · Marshall Growth Platform**

> **Who is this for?** Building principals, assistant principals, and any other staff member formally responsible for evaluating teachers. In the system your role is called `appraiser`.

---

## Table of Contents
1. [What You Can Do](#what-you-can-do)
2. [Signing In](#signing-in)
3. [My Teachers (Your Home)](#my-teachers-your-home)
4. [Starting a New Observation](#starting-a-new-observation)
5. [Inside the Observation Editor](#inside-the-observation-editor)
6. [Scripted Notes vs. Private Notes](#scripted-notes-vs-private-notes)
7. [Scoring the Rubric](#scoring-the-rubric)
8. [Auto-Generating Feedback](#auto-generating-feedback)
9. [Glows, Grows, Focus Areas, Next Steps](#glows-grows-focus-areas-next-steps)
10. [Signing and Publishing](#signing-and-publishing)
11. [Viewing All Your Observations](#viewing-all-your-observations)
12. [Reports](#reports)
13. [Guided Tour](#guided-tour)
14. [Mobile & Install as an App](#mobile--install-as-an-app)
15. [Tips, Tricks, and Legal Notes](#tips-tricks-and-legal-notes)

---

## What You Can Do

As an **Appraiser** you can:
- See only the teachers **assigned to you** (scoped by the super admin)
- Start **Mini**, **Formal**, or **Annual Summary** observations
- Take scripted notes during observation
- Score every Marshall indicator on a 1–4 scale with an evidence note
- **Auto-generate feedback** from the Pedagogy Library — then accept, edit, or replace it
- Organize feedback into **Glows** (strengths), **Grows** (growth areas), **Focus areas** (persistent growth targets), and **Next steps** (specific follow-ups)
- Keep **private notes** the teacher never sees
- **Sign and publish** — triggering the teacher's acknowledgment workflow
- Run CSV and PDF reports **scoped to your teachers**

You **cannot**:
- See or observe teachers not assigned to you
- Edit the Marshall rubric itself (that's the Super Admin)
- Edit an observation after you've published it (you can issue a new one)
- See other appraisers' observations or private notes

---

## Signing In

1. Open https://alexander-marshall-growth.pages.dev
2. Use the email and starting password (`Alexander2026!`) your super admin provides.
3. On first login you'll be forced to change your password.
4. The **Guided Tour** auto-launches and walks you through every feature (about 8 steps). Skip it any time with *Esc*, restart it any time from the **Guided Tour** button in the top nav.
5. Your home is **My Teachers** (`/appraiser`).

---

## My Teachers (Your Home)

**URL:** `/appraiser`

You'll see a grid with one card per teacher you're assigned to evaluate. Each card shows:
- **Name and title** (e.g. *2nd Grade Teacher*, *HS Math*)
- Their **primary school** (and any additional schools as chips)
- The **most recent observation** — date, type, and status badge
- A **Start observation** button that drops down three types

**Search / filter:** type in the search box at the top to narrow by name.

**If a teacher you expect to see is missing**, it means the Super Admin hasn't linked you with an `appraiser` relationship for that teacher. Contact them — it's a 30-second fix in `/admin/assignments`.

---

## Starting a New Observation

1. On a teacher card, click **Start observation** → pick the type:

   | Type | When to use |
   |---|---|
   | **Mini** | 10–15-min walk-through. Score a small subset of indicators. |
   | **Formal** | Full-period announced observation. Score the full rubric. |
   | **Annual Summary** | End-of-year rollup. Usually no new scores — summarize the year. |

2. You land in the **Observation editor** at `/appraiser/observations/:id`. The observation is saved as a draft immediately.

3. Fill in the **context**:
   - Subject (e.g. *Algebra I*, *3rd Grade Reading*)
   - Grade level
   - Location (room number or space)
   - Class context (e.g. *3rd period, 24 students, station rotation*)
   - Observed at — pre-fills to right now
   - Duration in minutes

4. Click **Save context** — your draft is preserved.

---

## Inside the Observation Editor

The editor is one long page with clearly-labelled sections. You can work on them in any order, save at any time, and return any time from **My observations**. Every save flips `updated_at` so you never lose work.

### Top bar
- Observation type and status badge
- The teacher's name (links to their profile)
- A **Delete draft** button (appears only while it's still a draft)
- A **Print preview** link

### Sections on the page
1. **Class context** — the form above
2. **Scripted notes** — low-inference evidence you gather in real time
3. **Rubric scoring** — every indicator grouped by domain (A–F)
4. **Glows / Grows / Focus areas / Next steps** — organized feedback
5. **Overall summary** — the teacher-facing summary paragraph
6. **Private notes** — admin-only, never visible to the teacher
7. **Signatures** — your signature (to publish) and later the teacher's (on acknowledge)

---

## Scripted Notes vs. Private Notes

**Scripted notes** (teacher-facing):
- What you type here is visible to the teacher once you publish.
- Best practice: low-inference quotes, time-stamped evidence, observable student behavior.
- Example: *"10:04 — T. asks 'What did we notice?' T.S.W. pauses 5s before calling on first hand (Maria). Maria: 'There's a pattern.' T responds 'What kind?'…"*

**Private notes** (appraiser + super admin only):
- Your raw, internal thoughts. Questions for the post-conference. Concerns to raise with the superintendent. Anything inappropriate for a formal record.
- **Teachers NEVER see these.** Reports default to hiding them; only Super Admins can opt to include them in exports.
- Example: *"Need to follow up with T about classroom management — 3 separate redirections I didn't write in the official script. Talk privately next week."*

### Auto-save — your typing is never lost

Every text field on the observation page (Scripted notes, Private notes, Overall summary, Subject, Grade, Class context) **saves to the server automatically while you type**. No "Save" button to remember. Look at the small pill in the top-right of each card:

| Pill text | What it means |
|---|---|
| `Nothing saved yet` | (grey) No content saved yet for this field. |
| `Typing… (will save in 1s)` | (grey) We'll flush to the server shortly. |
| `Saving…` | (grey) In flight. |
| `✓ Saved — 412 chars at 10:17` | (green) Confirmed written to the database. |
| `⚠ Not saved — try again` | (red) Network blip; just click the textarea and type again. |

Below the Scripted Notes box there is also a **Saved scripted notes in database** disclosure. Click it to view the exact text the server has stored right now. This is the ground-truth copy — if what's in that box matches what you typed, your notes are safe.

---

## Scoring the Rubric

**The Marshall rubric has 60 indicators in 6 domains (A–F), with 4 performance levels each:**

| Level | Label | Typical use |
|---|---|---|
| **4** | Highly Effective | Exemplary, sustained, widespread |
| **3** | Effective | Proficient, the expected standard |
| **2** | Improvement Necessary | Below standard; growth area |
| **1** | Does Not Meet | Serious concern |

### How to score
1. Each indicator has a row with the level descriptors visible. Click **1**, **2**, **3**, or **4**.
2. A text area pops open below — **write your evidence**. This is the most important field in the whole platform. Specific, observable, low-inference evidence turns a score into a teachable moment.
3. The **Pedagogy Library entry** for that (indicator × level) pair appears as sidebar guidance — interpretation, evidence signals, teacher next moves. This is there to support your decision, not override it.
4. Move to the next indicator.

**Best practices:**
- Mini-observations: score only the 5–10 indicators you saw clear evidence for.
- Formal observations: aim for most or all of the 60.
- Annual Summary: combine all year's evidence; one summary score per indicator.

**Tips:**
- You can **change a score** as many times as you want while it's a draft. Scores are final only once you publish.
- Leave an indicator **unscored** (nothing selected) if you didn't see enough evidence. It's honest and fine.

---

## Auto-Generating Feedback

Once you've scored at least a few indicators, scroll to the **Feedback** section and click **Generate feedback from rubric**.

**What happens:**
- For every indicator you scored at level **3 or 4**, the system creates a **Glow** using the Pedagogy Library's *feedback starter* for that cell.
- For every indicator at level **1 or 2**, it creates a **Grow** using the feedback starter plus the teacher next moves.
- Each suggestion is editable — you can rewrite the wording, split it, merge it with another, or delete it entirely.

**Why this matters:**
- Saves you ~20 minutes of writing per formal observation.
- Keeps feedback grounded in the rubric's language, not your mood.
- Consistency across appraisers (every principal is pulling from the same library).

**You can always write custom feedback** that doesn't come from the library — use the **Add custom** button.

---

## Glows, Grows, Focus Areas, Next Steps

These are the four categories every piece of teacher-facing feedback lives in. They show up on the teacher's published observation in separate, clearly-labelled cards.

| Category | Meaning | Typical volume per observation |
|---|---|---|
| **Glow** | "What's working — keep doing this." | 2–5 |
| **Grow** | "Here's an area to develop." | 1–3 |
| **Focus area** | A persistent growth target that *stays active across observations* — a year-long coaching thread. | 0–2 new per observation |
| **Next step** | A specific, short-term action the teacher should take before the next observation. | 2–4 |

**Focus areas are special:**
- They live in their own `focus_areas` table, not just on the observation.
- They appear on the teacher's **Focus Areas** page (`/teacher/focus`) until you or a coach marks them closed.
- The linked indicator automatically pulls the Pedagogy Library's *teacher next moves* and *resources* for the teacher's current level — so every time the teacher looks at it, they see concrete strategies and readings.

---

## Signing and Publishing

When the observation is complete:

1. Scroll to the **Signatures** section.
2. Sign with your mouse or finger in the signature pad. Tap **Clear** if you need to redo.
3. Click **Sign & Publish**.

**What happens on publish:**
- Status flips from `draft` → `published`
- `published_at` and `appraiser_signed_at` are time-stamped
- Your base64-PNG signature is stored with the observation
- The teacher gets a notice on their dashboard: *"You have 1 observation awaiting your review and acknowledgement."*
- **You can no longer edit** the observation — you can only view or print it
- The observation becomes visible in superintendent and super-admin reports

**If you realize you made a mistake after publishing:**
- Minor typo: tell the teacher verbally, no system action needed.
- Real error: start a new observation with a brief note in the summary ("This corrects my [date] observation"). Don't try to edit the original — signed records should be immutable for legal reasons.

---

## Viewing All Your Observations

**URL:** `/appraiser/observations`

A table of every observation you've ever started — drafts, scored-but-not-published, published, and acknowledged. Columns:
- Date (observed_at)
- Teacher
- Type (mini / formal / annual_summary)
- Status (badge)
- Last updated

**Click any row** to open it in the editor (drafts) or in read-only view (published).

**Bulk filter:** type in the search box to narrow by teacher name.

---

## Reports

**URL:** `/reports`

Same three-step Report Builder as everyone else, **scoped to your teachers only**.

### ① Who & when
- **Teachers** — multi-select, pre-filtered to your assigned teachers
- **Schools** — multi-select
- **From / To** date range
- **Observation type** — Mini / Formal / Annual Summary (any combination)

### ② What to include
Presets:
- **Full observation** — everything
- **Scores only**
- **Strengths only** (Glows)
- **Growth areas only** (Grows + Next Steps)
- **Feedback only** — for coaching conversations
- **Teacher folder copy** — for teacher portfolio / HR meetings

Or tick individual checkboxes. Private notes are available to you (they won't leak to superintendents or teachers in their views).

### ③ Download
- **CSV** (8 row shapes)
- **PDF** — print-ready

**Common use cases:**
- End-of-year summary for a single teacher → pick teacher → *Teacher folder copy* → PDF
- Every mini you did this semester → leave teachers empty → set date range → check *Mini* only → CSV *summary*
- Post-observation packet for a teacher → their name → *Full observation* → PDF

---

## Guided Tour

Every page has a gold **Guided Tour** pill in the top-right that launches a role-specific walkthrough. Yours has ~8 steps covering:
1. Welcome
2. Your teachers card grid
3. Starting a new observation
4. All your observations
5. Inside the observation editor (scripted notes, scoring, glows/grows, private notes, signatures)
6. The Report Builder (3 steps)
7. Wrap-up

Also accessible from the user menu (click your initials) and your **Profile** page (restart any time, or re-enable auto-launch on next login).

---

## Mobile & Install as an App

The platform is a full **Progressive Web App**. You can observe from your phone — no laptop required in the classroom.

**Install on iPhone / iPad (Safari):**
- Tap **Share** (↑) → **Add to Home Screen**
- A one-time hint card explains this the first time you visit

**Install on Android / Chrome / Edge:**
- A gold **"Install app"** button appears in the corner on first visit
- Or use the browser's install icon in the address bar

**Mobile observation workflow:**
1. From your phone's home screen, tap the APS Growth icon
2. Sign in (cookie is remembered for 30 days)
3. Tap a teacher → **Start observation** → type
4. Use the scripted-notes text area on your phone as your low-inference tracker
5. Score as you go — the 1–4 buttons are finger-friendly
6. Sign with your finger
7. Publish

**Tips for mobile observing:**
- Rotate to landscape for a wider rubric view
- The signature pad responds to touch — sign with your finger
- Tables scroll horizontally inside their cards; use two-finger pan
- A banner warns you if you go offline mid-observation — your draft is saved but changes can't be pushed until you reconnect

---

## Tips, Tricks, and Legal Notes

**Best practices for great observations:**
- Script in low-inference language. "Students worked in groups" → "4 of 5 groups began the task within 30s of the timer starting; Maria's group asked a clarifying question at 10:04."
- Use **specific student initials / first names** (not full names) in scripted notes — enough to track patterns but not personally-identifiable for a legal record.
- Score only what you saw evidence for. An unscored indicator is better than a guessed one.
- Write at least one Glow for every Grow. Balanced feedback is more actionable.
- Keep the post-conference conversation about 2–3 focus areas max. More than that overwhelms.
- Use **Next steps** to make a Grow actionable: "By next mini, try cold-calling 3 non-volunteer students every check-for-understanding."

**Legal / HR notes:**
- Once published, an observation is a **signed, timestamped record**. Treat it accordingly.
- **Never** put anything in private notes you'd be embarrassed to see in a court deposition or a FOIA response. Private isn't secret — it's just not teacher-facing.
- If a teacher refuses to acknowledge an observation, the system allows that — an observation can stay "published" forever without teacher acknowledgement. Check your district policy on what that means for HR.
- Encourage teachers to use the **response** field when they sign. It's their chance to add context, disagreement, or nuance — and that response lives alongside the observation forever.

---

## Where to Go Next

- [Teacher User Guide](USER_GUIDE_TEACHER.md) — so you understand what the teacher will see
- [Coach User Guide](USER_GUIDE_COACH.md) — how coaches use your published observations
- [Super Admin User Guide](USER_GUIDE_SUPER_ADMIN.md) — who controls the platform
- [Technical Architecture Guide](TECHNICAL_GUIDE.md) — how everything is built

---

*Questions? Contact your Super Admin or OptimizED Strategic Solutions.*

---

## 🔔 Notifications + PD Review (new)

### The bell in your header
Every principal/appraiser sees a bell in the top‑right. You'll get alerts for:
- **Teacher acknowledged** an observation you published (click to jump to it)
- **Acknowledgment overdue** — a teacher hasn't signed within 3 days
- **PD deliverable submitted** — one of your teachers turned in a classroom deliverable
- **Annual summary published** (if you're also a superintendent)

### Push to any device, no subscription
Install the PWA on your phone (Add to Home Screen) and the very first time you click the bell you'll be asked for push permission. That's it — you now get principal alerts like a text message with **zero district cost**.

### Customize on `/profile#notifications`
Two master switches (push on/off, in‑app on/off) plus per‑kind granular control. Everything is persisted so your settings follow you from browser to phone.

---

## 🎓 PD Review (new)

When you publish a formal/mini observation, the platform **auto‑recommends PD modules** for every indicator you scored at level 1 or 2 (up to 3 per indicator). Teachers see them in their "My PD LMS". You'll get a notification when they submit a deliverable — open **PD Review** in the main nav to:

1. See the queue of submitted deliverables from teachers assigned to you.
2. Click a row to read the teacher's actual deliverable + their per‑phase reflections.
3. **Verify** (teacher gets a success ping) or **Request revision** with a short note (teacher gets a ↺ ping).
4. **Assign a specific module** from the module library if you want a teacher to tackle a growth area that wasn't flagged by an observation yet.

### What a "good" deliverable looks like (redesigned April 2026)
Every PD module is now lesson‑plan‑driven. The teacher's deliverable should include:

1. **Lesson context** — one paragraph (grade, subject, unit, date taught, class composition).
2. **Rebuilt lesson plan** — the actual plan the teacher used, with the rubric next‑level moves visibly bolded/highlighted.
3. **Three scripted moments** — word‑for‑word opener, pivot move, and close in the teacher's own voice.
4. **Real student evidence** — exit‑ticket responses, work sample, quoted student talk, or a board photo.
5. **Impact note (3 sentences)** — what worked, what did not, and one concrete next classroom move on the indicator.

When you click **Verify**, you are confirming the lesson was a real lesson, at least two next‑level rubric moves are visibly built into the plan, scripted moments are in the teacher's voice, evidence is real, and the impact note is honest. If any of those are missing, use **Request revision** and write a short note — the teacher gets an alert with your note and can resubmit.

All PD completion data rolls into **Reports → PD Completion Report** (`/reports/pd`), filterable by teacher, school, rubric domain/indicator, status, source, and date, with drill‑down to the deliverable itself.
