# Proposal — Alexander Marshall Growth Platform

**Prepared for:** Leslie Bieber, Superintendent, Alexander Public School
**Prepared by:** Dr. Rupak Gandhi · OptimizED Strategic Solutions
**Date:** April 23, 2026
**Valid through:** July 31, 2026 (locks in summer onboarding)

---

## 1. Executive summary

Alexander Public School needs a single tool that (a) lets principals capture Marshall‑aligned walkthroughs without a spreadsheet, (b) replaces Rocky Mountain, and (c) automatically turns low rubric scores into a specific, research‑backed PD plan for each teacher with a tangible classroom deliverable — not a generic workshop.

That tool is built, deployed to production, and running against your real district data right now at **https://alexander-marshall-growth.pages.dev**. This proposal covers two options:

| Option | Price | Best for |
|---|---|---|
| **Full Platform** | **$10,000 / year** | Alexander — everything you asked for, white‑glove onboarding, full PD engine, NW School Leaders presentation included |
| **Chapter Edition** | **$5,000 / year** | Districts that want only the evaluation + reporting half now and want to add the PD engine in year two |

Both options include hosting, security, data backup, and all four quarterly updates for the school year.

---

## 2. What's included — side by side

| Feature | Full Platform $10K | Chapter Edition $5K |
|---|:---:|:---:|
| Marshall rubric (2014/2023 verbatim), 6 domains, 60 indicators, 4 levels | ✅ | ✅ |
| Per‑teacher performance snapshot (your "intervention data" ask) | ✅ | ✅ |
| Mini / formal / annual observation workflow | ✅ | ✅ |
| Scripted notes with auto‑save + server‑side verification | ✅ | ✅ |
| Auto‑generated glows, grows, focus areas, next steps | ✅ | ✅ |
| E‑signature for principal + teacher, "seen not agreement" language | ✅ | ✅ |
| Principal, coach, superintendent, super‑admin, teacher roles | ✅ | ✅ |
| CSV + PDF reports (8 row shapes × any date × any teacher/school) | ✅ | ✅ |
| Per‑school and district KPI dashboards | ✅ | ✅ |
| Bulk CSV import of staff | ✅ | ✅ |
| Assignments of teachers to appraisers + coaches | ✅ | ✅ |
| In‑app notifications with deep links | ✅ | ✅ |
| Web push notifications to phones (free, PWA‑based) | ✅ | ✅ |
| **Pedagogy library** — 240 cells (60 × 4 levels), evidence signals, next moves | ✅ | ✅ |
| **PD engine** — auto‑enroll on level ≤ 2, deterministic, research‑based | ✅ | ⬜ |
| 120 lesson‑plan‑driven PD modules (Learn → Practice → Apply) | ✅ | ⬜ |
| Interactive PD workspace (checkboxes, radios, auto‑saving answers) | ✅ | ⬜ |
| PD deliverable submission + supervisor verify / request revision | ✅ | ⬜ |
| Floating PD Day plan mode (bundle several modules) | ✅ | ⬜ |
| PD Completion Report (filter by teacher, school, domain, status…) | ✅ | ⬜ |
| Guided Tours for every role (built‑in, no PDF needed) | ✅ | ✅ |
| 6 user guides + technical developer guide (Markdown + printable PDF) | ✅ | ✅ |
| White‑glove onboarding — half‑day on site with your team | ✅ | Remote only, 1 hour |
| NW School Leaders September presentation (Kent Dennis) | ✅ | ⬜ |
| Four quarterly platform updates (Aug, Nov, Feb, May) | ✅ | ✅ |
| Priority support — text or email direct to Dr. Gandhi | ✅ | Business‑hours email |
| Annual district data export (CSV + PDF archive) | ✅ | ✅ |

### What you LOSE if you go with Chapter Edition ($5K)

1. **The PD engine.** No auto‑enrollment on low scores, no Learn → Practice → Apply workspace, no deliverables, no supervisor verify flow, no Floating PD Day. You still get observations and reports — but the "CTE teacher not sitting in an ELA PD" promise requires the PD engine.
2. **On‑site onboarding.** Chapter Edition is fully remote — we still walk your team through a 1‑hour Zoom demo, but the half‑day on‑site immersion is $10K only.
3. **The NW School Leaders presentation.** I'll still attend and present if Kent Dennis invites me, but the slide deck and travel are bundled with the $10K.
4. **Priority (text‑me‑anytime) support.** Chapter is on a 1‑business‑day email SLA.

**Upgrade path:** you can start with Chapter Edition for 2026‑27 and upgrade to Full Platform for 2027‑28 for **$5,000 prorated** (effectively the same $10K/year, just paid across two years). All of your data carries forward — no re‑importing, no re‑training.

---

## 3. What can be customized (and what can't)

### ✅ Fully customizable by your super admin, inside the UI

- **Staff list** — add / edit / deactivate users, bulk import from CSV, assign to schools, assign to appraisers.
- **Schools** — rename, merge, split, close.
- **Pedagogy library** — all 240 rubric cells (evidence signals, teacher next moves, coaching considerations). Edit any cell; the next observation uses your edits for feedback generation.
- **PD modules** — rewrite the Learn / Practice / Apply content, change the deliverable prompt, replace the research citations, add new modules, archive old ones.
- **Auto‑enroll threshold** — today it fires on indicators scored 1 or 2. You can change that to "only 1" or "1, 2, and 3" in `src/lib/pd.ts` (one‑line change, I ship the updated build within 24 hours).
- **Notification defaults** — which notifications fire by default and which are opt‑in per user.
- **PDF branding** — district name, address, phone, logo (in a later sprint), header / footer text, whether to include private notes.
- **Observation types** — today: mini, formal, annual. You can add "probationary" or "improvement plan" observation types with their own fields.
- **Focus areas taxonomy** — any labels you want.
- **Colors** — the platform ships in Alexander Eagles navy / blue / gold; you can swap the palette to whatever your district brand is.

### ⚠️ Customizable with a change request (I do it, 3–5 business days)

- Adding a brand‑new rubric alongside Marshall (e.g. an athletics coach rubric or a SPED teacher rubric).
- Integration with Google Classroom / PowerSchool / Skyward for roster sync.
- Single sign‑on (SSO) with Google Workspace or Microsoft 365. Included at $10K tier, $1,500 add‑on at $5K tier.
- SMS notifications (Twilio) instead of / in addition to web push. Add‑on, $500 setup + SMS usage at cost.
- Custom KPIs on the superintendent dashboard.

### 🚫 Not customizable (IP / compliance)

- **The four Marshall performance levels** (1 = Does Not Meet, 2 = Basic, 3 = Proficient, 4 = Expert). We license Marshall's exact 2014/2023 language and cannot change it — that's what makes this Marshall‑aligned and not a DIY rubric.
- **The bcrypt password hashing and Web Crypto API** (security compliance).
- **Cloudflare Pages + D1 hosting** — we use a global edge network that gives you sub‑50‑ms response times. We don't offer "self‑host on your own server" at these price points; if your state IT requires on‑prem, that's a separate conversation.

---

## 4. Data, security, and FERPA

- **Hosting:** Cloudflare Pages + D1 SQLite. SOC 2 Type II certified infrastructure. Data centers in Chicago and Atlanta (US‑central).
- **Encryption:** HTTPS everywhere (TLS 1.3). Password hashes use bcrypt with cost factor 10. Session cookies are `HttpOnly; Secure; SameSite=Lax`.
- **Data ownership:** Alexander owns all data. Annual CSV + PDF archive export is included. On contract end, we export your full database and hand it over in 14 days; no vendor lock‑in.
- **Backups:** Cloudflare D1 nightly backups with 7‑day retention. Point‑in‑time restore is on the 2026‑27 roadmap.
- **FERPA:** Observation data does not constitute a student record under FERPA (it's an employee evaluation record). But we follow FERPA‑aligned controls anyway: role‑based access, activity audit log, no third‑party trackers, no ad networks.
- **PII minimization:** We store only what you need — name, email, school assignment, role. No SSN, no DOB, no photos unless you upload avatars.
- **Audit log:** Every save, score, publish, acknowledge, and verify is logged with user + timestamp + entity. Super admin can export at any time.
- **Data reset:** You can wipe test observations / PD data at any time without affecting staff, rubric, or pedagogy library. One command.

---

## 5. Implementation timeline — Full Platform $10K

**Week 0 — Contract signed**
- MSA signed. 50% invoice ($5,000) due. Onboarding kickoff call scheduled.

**Week 1 — Data prep**
- I import your real staff roster (you send me a Google Sheet or CSV — I format it).
- I run `seed/004_pd_modules.sql` to refresh your 120 PD modules from the latest research.
- I create your super admin account and send the credential.

**Week 2 — On‑site onboarding (half day)**
- Morning: principals and coach, 2 hours, hands‑on walkthrough.
- Lunch break.
- Afternoon: 28 teachers, 90 minutes, hands‑on walkthrough + install the PWA on their phones.

**Week 3 — Soft launch**
- Principals do 2–3 mini walkthroughs each. I'm on standby by text.
- At the end of the week, we do a 30‑minute Zoom to iron out any friction.

**Week 4 — Full launch**
- Every walkthrough, formal, and annual goes through the platform.
- Teachers begin working PD modules as they're auto‑recommended.
- 50% balance invoice ($5,000) due.

**September — NW School Leaders**
- I present to Kent Dennis's group of ~30 superintendents. Alexander is featured as the pilot.

**November, February, May — Quarterly updates**
- I ship new features based on your team's feedback. Patch notes + short video.

**May 2027 — Annual archive**
- You get a full CSV + PDF archive of the year.
- Renewal conversation begins.

---

## 6. Implementation timeline — Chapter Edition $5K

Same as above minus: on‑site onboarding (Zoom only), NW presentation bundle, PD engine launch, priority support.

---

## 7. Pricing detail

### Full Platform — $10,000 / year

| Line item | Cost |
|---|---:|
| Platform license (1 district, unlimited users) | $6,500 |
| Onboarding — half day on site, data migration, training | $1,500 |
| Four quarterly updates | $1,000 |
| Priority support (text anytime, 4‑hour response) | $1,000 |
| **Total — year one** | **$10,000** |
| **Renewal — year two onward** | **$8,000 / year** (onboarding is a one‑time) |

### Chapter Edition — $5,000 / year

| Line item | Cost |
|---|---:|
| Platform license — evaluation + reports only (no PD engine) | $3,500 |
| Onboarding — 1‑hour Zoom, remote data migration | $500 |
| Four quarterly updates | $500 |
| Email support (1‑business‑day SLA) | $500 |
| **Total — year one** | **$5,000** |
| **Renewal — year two onward** | **$4,500 / year** |

### Payment schedule
- 50% at MSA signing
- 50% at end of Week 4 (full launch)
- Payable by ACH or district check to **OptimizED Strategic Solutions LLC**

### Per‑building (Chapter) for adjacent districts
If NW School Leaders wants the Chapter Edition for individual buildings (not whole districts), we price it at **$1,500 / building / year** with a 3‑building minimum. This is how we'd scale it across the 30 superintendents Kent Dennis works with.

---

## 8. What we need from Alexander to go live

1. **Signed MSA** (attached as a separate document; one page, plain English).
2. **Staff roster CSV** — first name, last name, email, title, subject, school, role. I format it if you have it in any shape.
3. **District contact info** for PDF headers — name, address, phone, logo if you have one.
4. **Two on‑site dates** (one for admin onboarding, one for teacher onboarding). I'll drive out from Fargo.
5. **A named super admin** — one district employee who owns user management going forward. Usually your IT person or your admin assistant.

That's it. No servers to provision, no IT tickets to open, no software to install. Your staff gets a link and a login on Day 1.

---

## 9. Why OptimizED vs. PowerSchool / Frontline / Rocky Mountain

| | OptimizED (us) | PowerSchool Professional Growth | Frontline Professional Growth | Rocky Mountain Walkthrough |
|---|:---:|:---:|:---:|:---:|
| Marshall rubric verbatim | ✅ | ⚠️ generic | ⚠️ generic | ✅ |
| Auto‑enroll PD from rubric score | ✅ | ⬜ | ⚠️ manual | ⬜ |
| Lesson‑plan‑driven PD (not workshop‑driven) | ✅ | ⬜ | ⬜ | ⬜ |
| Built by a former superintendent | ✅ | ⬜ | ⬜ | ⬜ |
| Text‑the‑founder support | ✅ | ⬜ | ⬜ | ⬜ |
| Customizable pedagogy library in UI | ✅ | ⬜ | ⚠️ $$$ | ⬜ |
| Cost / district / year | $5–10K | $15–25K | $20–40K | $3–6K |

We are cheaper than PowerSchool and Frontline, roughly priced with Rocky Mountain, but we ship the PD engine neither Rocky Mountain nor the big vendors ship — and we're built, used, and customized by someone who actually led a district (Fargo, 11,000 students, 7 years).

---

## 10. The ask

1. **Click around this week.** Use the preview guide. Break things. Message me what surprises you.
2. **Schedule the team demo.** Me + your two principals + Jacki (coach) + anyone else. 45 minutes. Free.
3. **Pick an option.** Full Platform $10K or Chapter Edition $5K. We can revisit in year two.
4. **Sign the one‑page MSA.** We start Week 0 whenever you're ready.

I built this for Alexander. I want to be straight: even if you walk away, the platform as it stands is yours to export. You paid nothing for the preview and you owe nothing for the preview. If it's not a fit for your 2026‑27, we part as friends and I'll still present for Kent Dennis in September.

Thank you for the time, the trust, and the candor.

**Dr. Rupak Gandhi**
Co‑Founder, OptimizED Strategic Solutions
rupak.gandhi@optimizedstrategicsolutions.com · (XXX) XXX‑XXXX
