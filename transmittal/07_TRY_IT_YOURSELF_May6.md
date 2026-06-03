# Try It Yourself — Alexander Marshall Growth Platform
**For:** Leslie, Aaron, and Shannon
**Time required:** 10 minutes for the quick path · 30 minutes for the thorough path
**Where:** Any browser, any device. Phone works. Laptop is easier for the first session.

---

## Before you start (30 seconds)

1. Open **https://alexander-marshall-growth.pages.dev** in any browser.
2. Sign in with **your own email** (listed below) and the password **`Alexander2026!`**.
3. A blue banner will tell you that you can change your password anytime. **You don't have to.** Click **Dismiss** and keep going.

| Your role | Your email | Password |
|---|---|---|
| Superintendent (Leslie) | `leslie.bieber@k12.nd.us` | `Alexander2026!` |
| Elementary Principal (Aaron) | `aaron.allard@k12.nd.us` | `Alexander2026!` |
| 6-12 Principal (Shannon) | `shannon.faller@k12.nd.us` | `Alexander2026!` |

> **Pro tip:** Open a **second window** in private/incognito mode so you can sign in as a teacher (`pamela.albright@k12.nd.us`) at the same time. You'll want to flip between the two perspectives.

---

# The 6-step path

## Step 1 — As a Principal: open a real observation (3 minutes) ⭐

**Sign in as Aaron** (`aaron.allard@k12.nd.us`).

1. You land on **My Teachers**. Click **Pamela Albright (5th Grade)**.
2. Click the observation dated **April 23, 2026**.
3. Scroll through the **scripted notes** at the top. *This is what a principal types live during a lesson — auto-saved on every keystroke.*
4. Scroll to the **Marshall rubric grid**. You'll see three indicators already scored:
   - **B.d Social-emotional → Level 2**
   - **B.e Routines → Level 3**
   - **E.c Expectations → Level 1**
5. Scroll to the **"Organize feedback for the teacher"** card. Click **Generate / refresh feedback**.

> 👀 **Watch for:** the spinner and progress bar that fills in four phases: *Reading your scored indicators → Cross-referencing the Pedagogy Library → Organizing glows, grows, focus areas, and next steps → Almost ready.*

**You just turned three rubric scores into structured feedback.** That's the moment.

**Now click around:**
- Click any feedback item to expand and edit it.
- Scroll to the bottom — the observation is already published, so you'll see green checkmarks and the post-publish jump-back links: *Back to Pamela's page · All my teachers · PD review queue.*

---

## Step 2 — As a Teacher: see the receiving end (2 minutes) ⭐

**Open a private/incognito window.** Sign in as **`pamela.albright@k12.nd.us`** with the same password.

1. You land on Pamela's dashboard. You see her published observation.
2. Click the observation. **Notice it is the exact same record Aaron published** — not a copy, not an export. One source of truth.
3. Click back to the dashboard. Look at her **Personalized PD Plan** — three modules already in flight:
   - Social-emotional (Level 2 → 3) · *recommended*
   - Expectations (Level 1 → 2) · *started*
   - Prevention (Level 1 → 2) · *Learn done*
4. Click into **"redesign your next Expectations lesson"**.
5. You're now inside a **Learn → Practice → Apply** module. Walk through:
   - **Learn** — research summary. Open the disclosures: *Modeling example · Elementary vs. secondary.*
   - **Practice** — interactive checklists, real radio buttons, auto-saving textboxes. Open the disclosure: *Collaborate with a peer.*
   - **Apply** — the deliverable prompt where the teacher submits an artifact.

> 👀 **Watch for:** Pamela cannot move from Learn to Practice without the system seeing she's read it. She cannot submit Apply without uploading her artifact. The state machine guarantees the rigor.

---

## Step 3 — As a Coach: review the deliverable (2 minutes)

Sign out, sign back in as **`jacki.hansel@k12.nd.us`** with the same password.

1. You land on the coach dashboard. Click **PD Review Queue**.
2. Open any submitted enrollment.
3. You'll see a four-criterion rubric: **Alignment · Completeness · Student Impact · Reflection**. Score one criterion 1–4 with an optional note.
4. Watch the live weighted-average roll-up update.
5. Click **Verify** or **Ask for revision** — the verification decision is independent of the rubric scoring.

---

## Step 4 — As Superintendent: see the district view (2 minutes)

Sign in as **Leslie** (`leslie.bieber@k12.nd.us`).

1. You land on the district dashboard. Note the at-a-glance counts: observations by status, PD enrollments by phase.
2. Click **Reports** in the top navigation.
3. Apply a filter — for example, *Domain B (Classroom Management)* — and click **Apply filters**.
4. Click **Export PDF** or **Export CSV**. *Your school board packet, ready in one click.*

> 👀 **Watch for:** You see roll-ups across both buildings. You **don't** see scripted notes for individual classrooms — that's confidential to the principal. Privacy by design.

---

## Step 5 — As District Admin: see the control room (1 minute)

Sign in as **`admin@alexanderschoolnd.us`** with the same password.

Quickly visit each of these pages — don't change anything, just look:

- `/admin/users` — every staff member, edit any field, reset any password.
- `/admin/pedagogy` — every Marshall rubric cell editable in your browser.
- `/admin/pd` — all 120 PD modules. Note the **Download CSV** and **Upload CSV** buttons. *Your team can update 120 modules in Excel during a snow day.*
- `/admin/pd-rubric` — rename, reorder, reweight the deliverable rubric criteria without touching code.

---

## Step 6 — Try to break it ⭐

Spend five minutes clicking everywhere. Specifically try:

- Start a **new observation** for any teacher. Type some scripted notes — watch the **green "Saved" pill** appear in the corner.
- Score one indicator at Level 2 — watch the **red "unsaved" outline appear**, then disappear when you click Save score.
- Close the browser. Reopen it. Sign back in. **Everything is exactly where you left it.**
- Click your name in the top-right → **Profile** → change your password (or don't — the default works fine).

---

# What we want from you

When you find anything that:

- ✗ Doesn't work the way you'd expect
- 🤔 Is confusing or feels heavy
- 💡 Is missing that Alexander specifically needs
- ❤️ Surprised you in a good way

**Take a screenshot. Reply to the email. We'll read it within hours and almost always fix or change it within a day.** This is your platform — we built it for Alexander, not for "districts in general."

---

# Frequently asked first-time questions

**Q: Do I have to use my real email?**
A: Yes — those are your district email addresses, but the platform is sandboxed. Nothing leaves the system, nothing emails anyone, no one outside Alexander has access.

**Q: What if I forget my password?**
A: Sign in as `admin@alexanderschoolnd.us` and use `/admin/users/<id>/reset-password`. Or just ask Rupak — one SQL command resets everyone back to `Alexander2026!`.

**Q: Can I delete the demo data and start fresh?**
A: Yes — text Rupak. One SQL command wipes test observations, scores, and PD progress while keeping all 33 staff, 60 indicators, and 120 modules intact. Takes 10 seconds.

**Q: Will my changes be saved if I leave the page?**
A: Yes. Auto-save runs on every keystroke for scripted notes, scores, evidence, and PD reflections. The green "Saved" pill in the corner is your confirmation.

**Q: Does this work on my phone?**
A: Yes. Installable as a Progressive Web App — open the site, tap the browser's "Add to Home Screen" button, and it behaves like a real app. Tested on iOS and Android.

**Q: What if Aaron and I want different things?**
A: You'll get the same toolkit, but each principal sees only their own building's teachers. Settings can be scoped per-building if needed.

**Q: Can teachers see other teachers' observations?**
A: No. A teacher sees only their own published record. Principals see only their assigned teachers.

---

*Prepared by Dr. Rupak Gandhi & Dr. Britney Gandhi · OptimizED Strategic Solutions · May 6, 2026*
