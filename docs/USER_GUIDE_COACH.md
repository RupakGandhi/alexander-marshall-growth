# Instructional Coach — User Guide
**Alexander Public Schools · Marshall Growth Platform**

> **Who is this for?** Instructional coaches — literacy coaches, math coaches, new-teacher coaches, peer coaches, any non-evaluative support role. In the system your role is called `coach`.

---

## Table of Contents
1. [What You Can Do](#what-you-can-do)
2. [What You CAN'T Do (and why)](#what-you-cant-do-and-why)
3. [Signing In](#signing-in)
4. [My Teachers (Your Home)](#my-teachers-your-home)
5. [Inside a Teacher's View](#inside-a-teachers-view)
6. [Using the Pedagogy Library for Coaching](#using-the-pedagogy-library-for-coaching)
7. [Working with Focus Areas](#working-with-focus-areas)
8. [Reading Published Observations](#reading-published-observations)
9. [Guided Tour](#guided-tour)
10. [Mobile & Install as an App](#mobile--install-as-an-app)
11. [Tips for Effective Coaching with the Platform](#tips-for-effective-coaching-with-the-platform)

---

## What You Can Do

As an **Instructional Coach** you:
- See only the teachers **assigned to you** for coaching (separate from any appraiser assignments)
- Read every **published** observation for those teachers, including scores, evidence, glows, grows, focus areas, and next steps
- See the **coaching considerations** from the Pedagogy Library for the exact (indicator × level) a teacher is working on
- See each teacher's **active focus areas** — the thread of growth work you're supporting
- See the resources the Pedagogy Library recommends for each level

---

## What You CAN'T Do (and why)

**Intentionally blocked:**
- ❌ You **cannot see private appraiser notes**. Coaching is confidential; your view is built to be unbiased by what the principal wrote privately.
- ❌ You **cannot edit observations or scores**. That's the appraiser's job. Evaluative decisions are separated from coaching.
- ❌ You **cannot see teachers not assigned to you as coach**. Scope is strict.
- ❌ You **cannot create observations**. Only appraisers do.

**This separation is the point.** It keeps coaching judgement-free — teachers know you're there to support, not evaluate. Your view is a thinner, safer slice of the same data the principal sees.

---

## Signing In

1. Open https://alexander-marshall-growth.pages.dev
2. Use the email and starting password (`Alexander2026!`) your super admin provides.
3. On first login you're forced to change your password.
4. Your home is **My Teachers** (`/coach`).
5. The **Guided Tour** auto-launches on first sign-in (about 4 steps — the coach view is intentionally lean).

---

## My Teachers (Your Home)

**URL:** `/coach`

A grid of cards, one per teacher you're assigned to coach. Each card shows:
- **Teacher's name and title**
- Their **primary school**
- **Active focus areas count** — the number of growth threads they're working on right now (the most important number on this page — it tells you at a glance where the energy is)
- A link to their detailed coach view

**If a teacher is missing**, ask the Super Admin to add a `coach` assignment in `/admin/assignments`. It takes 30 seconds.

---

## Inside a Teacher's View

**URL:** `/coach/teachers/:id`

When you click a teacher, you see:

### Published observations list
Every observation the teacher's appraiser has officially published — with date, type, and status. Click any to read the full thing (scores, evidence, glows, grows, next steps). You'll never see the private appraiser notes.

### Active focus areas
Each active focus area shows:
- **The linked indicator** (domain + indicator code + name)
- **The current level** on that indicator (from the most recent observation)
- **The focus-area title and description** the appraiser wrote
- **Coaching considerations** for that exact (indicator × level) — pulled straight from the Pedagogy Library
- **Teacher next moves** (also Pedagogy Library) — the strategies the teacher is supposed to try
- **Resources** — the recommended readings / videos for this level

**Why this matters:** when you sit down for a coaching session, you already have:
- What the principal said the teacher should work on
- What level they're at on that skill right now
- The district-approved coaching moves for this exact situation
- Concrete strategies you can walk through together
- Resources you can share afterwards

That's 80% of a coaching session's prep done for you.

### Teacher context
- Primary school + any additional schools
- Recent observation history so you can read patterns
- Observation-count and last-observed date

---

## Using the Pedagogy Library for Coaching

The Pedagogy Library is the district's shared playbook. Every cell (60 indicators × 4 levels = 240 cells) contains:

| Field | How coaches use it |
|---|---|
| **Interpretation** | Plain-English "what this level really means" — use in coaching conversations to avoid scoring-talk |
| **Evidence signals** | Observable look-fors — help a teacher self-assess |
| **Teacher next moves** | Concrete strategies — pick 1–2 to try this week |
| **Coaching considerations** | *Your* starting points — the exact questions and moves to try in session |
| **Resources** | Articles, videos, books — share as homework |
| **Feedback starter** | Not really for you — that's the appraiser's language |

You can't edit the Pedagogy Library (that's the Super Admin), but you can and should **suggest edits** when you find language that isn't landing with teachers. Tell your Super Admin — they can update it in `/admin/pedagogy` and the changes flow to every teacher immediately.

---

## Working with Focus Areas

Focus areas are the persistent coaching thread. Unlike a one-time "next step" on an observation, a focus area lives until it's closed.

**Life cycle of a focus area:**
1. **Created by the appraiser** when a Grow becomes a long-term goal
2. **Linked to a specific indicator** (e.g. *D.2 — Checking for Understanding*)
3. **Active** while the teacher works on it, appearing in both the teacher's and coach's views
4. **Closed** by the appraiser (or re-evaluated at the next formal observation) when the teacher has demonstrated growth

**Your role:**
- Open every focus area → read the description and the coaching considerations
- Work a few minutes into each coaching session on one focus area at a time
- Pick 1–2 teacher next moves from the library and scaffold them
- Share the resources at the right moment (usually after a first try, not before)
- When the teacher demonstrates growth, celebrate it with them — and flag the appraiser at their next post-conference

**You cannot close focus areas yourself** — that's an evaluative judgement, so the appraiser handles it. If you think a teacher is ready, tell the principal and they'll close it at the next observation.

---

## Reading Published Observations

Click any observation on a teacher's profile to see:

- **Context** — date, type, class period, subject, location, duration
- **Overall summary** (teacher-facing)
- **Rubric scores** — every indicator the appraiser rated, with their level and evidence note
- **Glows** — strengths
- **Grows** — growth areas
- **Focus areas** — persistent threads
- **Next steps** — short-term actions
- **Signatures** — the appraiser's signature + the teacher's acknowledgment (if they've signed)

**You will NOT see:**
- Private appraiser notes
- Drafts or scored-but-not-published observations
- The appraiser's scripted notes if they're not in the official summary

This is the same view the teacher sees — perfect for coaching conversations because you're looking at the same thing.

---

## Guided Tour

The **Guided Tour** button in the top-right launches a 4-step walkthrough:
1. Welcome
2. Your coaching caseload
3. What you'll see on a teacher's page
4. Wrap-up — confidentiality emphasized

Re-launch any time from the button, from inside the user menu (click your initials), or from your Profile page.

---

## Mobile & Install as an App

The platform is a full **Progressive Web App**. Install it on your phone so you can pull up a teacher's focus areas in a hallway chat.

**iPhone / iPad (Safari):** Tap **Share** (↑) → **Add to Home Screen**

**Android / Chrome / Edge:** Tap the gold **"Install app"** button when it appears

**Once installed:**
- Opens like a native app
- Home-screen icon
- Pages you've visited still load offline
- "New version available" banner when the app updates

**On mobile:**
- The hamburger menu (☰) opens the full navigation
- Focus-area cards stack vertically
- Everything is finger-friendly

---

## Tips for Effective Coaching with the Platform

**Before a coaching session:**
- Open the teacher's page in the app
- Skim their most recent published observation — note the Grows and focus areas
- Open each active focus area and read the coaching considerations
- Pick ONE focus area to work on today (not all of them)
- Have a Pedagogy Library resource queued up if the conversation opens the door

**During the session:**
- Start with a Glow — ground the conversation in strength
- Use the appraiser's language where helpful but **don't parrot scores**. Coaching isn't an evaluation hearing.
- Work a concrete teacher next-move — something the teacher can try tomorrow
- Ask the teacher what *they* think the evidence should look like (use the evidence signals from the library as a guide)

**After the session:**
- Send the resource you referenced via email or however your district prefers (the platform doesn't send email, by design)
- Make your own notes however you normally do — the platform doesn't store coaching notes (again, by design: keeps coaching confidential and separate from evaluation)
- Check back in the next session to see what they tried

**Don't try to:**
- Score indicators yourself (not your job)
- Tell the teacher what score you think they got (not productive)
- Override the appraiser's feedback (not your role)

**Absolutely do:**
- Celebrate growth you see in session, then make sure the appraiser sees it at the next formal observation
- Advocate for edits to the Pedagogy Library when district language isn't landing
- Use the platform as your **source of truth** for what the teacher is working on — replaces the sticky notes and spreadsheets most coaches juggle today

---

## Frequently Asked Questions

**Q: What if I think the principal scored a teacher unfairly?**
You can't (and shouldn't) change the score, but you can have a conversation with the principal. The platform preserves evidence notes — if you think the evidence doesn't support the score, that's a productive conversation to have with the evaluator, not the teacher.

**Q: Can I see my own observations if I'm also a teacher-of-record?**
If you have a split role (coach + teacher, or coach + appraiser), your Super Admin sets that up. In practice, most coaches at Alexander are pure coaches. Ask your Super Admin about your access.

**Q: Why can't I write notes in the system?**
By design — coaching notes would be subject to the same records laws as evaluation data, and that's bad for trust. Keep coaching notes in your own notebook or a separate tool. The platform gives you read access to the rubric data and nothing more.

**Q: A teacher asked me if their principal wrote private notes about them. What do I say?**
Tell them "I don't know — coaches can't see private notes, and for a good reason. If you want to know, ask your principal directly." That's the honest answer and the right one.

**Q: How do I know if a teacher is doing better on a focus area?**
When the appraiser's next observation scores that indicator higher. You can compare scores across observations in the teacher's view. Trend over 2–3 observations is more reliable than a single jump.

---

## Where to Go Next

- [Appraiser User Guide](USER_GUIDE_APPRAISER.md) — so you understand what the principal is doing
- [Teacher User Guide](USER_GUIDE_TEACHER.md) — so you understand what the teacher sees
- [Super Admin User Guide](USER_GUIDE_SUPER_ADMIN.md) — who controls the platform
- [Technical Architecture Guide](TECHNICAL_GUIDE.md) — how everything is built

---

*Questions? Contact your Super Admin or OptimizED Strategic Solutions.*

---

## 🔔 Notifications + PD Review (new)

Coaches now see a bell in the top‑right header. It will ping you for:
- **PD deliverable submitted** by a teacher on your caseload
- Any module you assigned being completed
- Coach‑relevant focus‑area updates

Click the bell to jump straight to the item. Install the platform on your phone (Add to Home Screen / Install App) to receive push alerts on any device — **no email or SMS cost to the district**.

Turn individual alerts off on `/profile#notifications` — there's a master push switch and master in‑app switch for blanket control, plus per‑kind toggles.

### PD Review (coach mode)
Open **PD Review** in the main nav. You'll see submitted PD deliverables from every teacher on your coach caseload. You can **verify** a deliverable (teacher gets a success ping) or **request revision** with a short note (teacher gets a revision ping). You can also assign a module directly from the module library (`PD Review → Assign a module`).

### What a "good" PD deliverable looks like (redesigned April 2026)
Every module now asks the teacher to take an **upcoming lesson they were already going to teach** and rebuild it so the observer would score them one level higher on a specific Marshall indicator. When you open a submission, you are looking for six things:

1. **A real lesson** — grade, subject, unit, and a date the teacher taught or is about to teach it this week. Not a generic activity from a book.
2. **At least two next‑level moves** visibly built into the plan (bolded or highlighted). These come from the pedagogy library's `teacher_next_moves` for the target rubric level.
3. **Three scripted moments** — word‑for‑word opener, pivot move, and close in the teacher's own voice (not paraphrased rubric language).
4. **A real student‑evidence artifact** — exit‑ticket responses, a work sample, student quotes from the pivot moment, or a board photo.
5. **An honest 3‑sentence impact note** — names what worked, what did not, and where the redesign fell short.
6. **One concrete next classroom move** on the indicator so the teacher can stack progress on their next lesson.

If any of those are missing, click **Request revision** and leave a short, specific note. The teacher gets a notification, fixes the issue, and resubmits.

All of this rolls into **Reports → PD Completion Report** (`/reports/pd`) so you can show a principal exactly what modules your teachers completed and what they produced.
