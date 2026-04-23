// ============================================================================
// Guided-tour step definitions, per role.
//
// Each tour is just an ordered list of steps. Steps describe:
//   - which page the user needs to be on (the engine auto-navigates if not)
//   - which element to highlight (CSS selector, usually a data-tour attr)
//   - a plain-English title + body HTML
//   - an optional extra "try this" hint
//
// Keep the language human and Dr. Rupak friendly: explain *why* a feature
// matters, not just *what* it is.
// ============================================================================
import type { UserRole } from './types';

export interface TourStep {
  page: string;
  selector?: string;
  title: string;
  body: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
  hint?: string;
  noHighlight?: boolean; // render as a centered modal (no highlight box)
}

// ----------------------------------------------------------------------------
// Shared intro + shared "reports" sub-tour (used by several roles)
// ----------------------------------------------------------------------------
const introStep = (roleLabel: string, homeUrl: string): TourStep => ({
  page: homeUrl,
  noHighlight: true,
  title: `Welcome to the Marshall Growth Platform`,
  body: `
    <p>You're signed in as a <strong>${roleLabel}</strong>. This short walkthrough shows you the features available to you right now, exactly as you'll use them.</p>
    <p>It takes about <strong>2–3 minutes</strong>. Use <strong>Next →</strong> to move forward, <strong>← Back</strong> to review, or <strong>Skip</strong> to exit at any time. You can always restart from the <strong>Guided Tour</strong> button at the top of the screen.</p>`,
  hint: 'Keyboard shortcuts work too — press → for next, ← for back, Esc to close.',
});

const reportsTourSteps = (includeAppraisers: boolean): TourStep[] => [
  {
    page: '/reports',
    selector: '[data-tour="reports-title"]',
    placement: 'bottom',
    title: 'The Report Builder — everything in one place',
    body: `<p>Any CSV or PDF you need — one teacher, one school, one date range, or a whole year — starts here. Build it in <strong>three steps</strong>: ① who, ② what, ③ download.</p>`,
  },
  {
    page: '/reports',
    selector: '[data-tour="reports-who"]',
    placement: 'bottom',
    title: 'Step 1 — pick who',
    body: `<p>Use multi-select to choose one or many <strong>teachers</strong>${includeAppraisers ? ', one or many <strong>schools</strong>, one or many <strong>appraisers</strong>' : ' and one or many <strong>schools</strong>'}. Leave a list empty to include everyone you're authorized to see.</p><p>Then pick a date range and observation types.</p>`,
    hint: 'Hold Ctrl (or ⌘ on Mac) to pick more than one item at a time.',
  },
  {
    page: '/reports',
    selector: '[data-tour="reports-what"]',
    placement: 'top',
    title: 'Step 2 — pick what to include',
    body: `<p>One-click <strong>presets</strong> ("Full observation", "Scores only", "Strengths only", "Growth areas only", "Feedback only", "Teacher folder copy") set the right boxes for common use-cases. You can also check individual sections by hand.</p>`,
  },
  {
    page: '/reports',
    selector: '[data-tour="reports-download"]',
    placement: 'top',
    title: 'Step 3 — download',
    body: `<p><strong>CSV</strong> opens in Excel or Google Sheets — with 8 different row shapes to pick from (summary, scores-only, one-row-per-feedback-item, and more).</p><p><strong>PDF</strong> opens a print-ready report in a new tab. Use <em>Print → Save as PDF</em> in your browser to save or email it.</p>`,
    hint: 'Preview below shows exactly which observations will be included in your export.',
  },
];

// ----------------------------------------------------------------------------
// Super Administrator tour
// ----------------------------------------------------------------------------
const superAdminSteps: TourStep[] = [
  introStep('Super Administrator', '/admin'),
  {
    page: '/admin',
    selector: '[data-tour="main-nav"]',
    placement: 'bottom',
    title: 'Your navigation',
    body: `<p>As Super Admin you have the <strong>full menu</strong>: Users, Assignments, Schools, Pedagogy Library, Framework, Bulk Import, Reports, and District settings.</p>`,
  },
  {
    page: '/admin',
    selector: '[data-tour="admin-overview"]',
    placement: 'auto',
    title: 'Overview dashboard',
    body: `<p>Live counts of teachers, appraisers, coaches, and superintendents; observation-status rollup; and a feed of the most recent activity across the whole platform.</p>`,
  },
  {
    page: '/admin/users',
    selector: '[data-tour="users-create"]',
    placement: 'bottom',
    title: 'Create users',
    body: `<p>Add a teacher, principal, coach, or superintendent here. <strong>Schools is a multi-select</strong> — the first school you pick becomes the user's primary; any extras are additional links. Leave the password blank and the user will be created with <code>Alexander2026!</code> and be forced to change it on first login.</p>`,
  },
  {
    page: '/admin/users',
    selector: '[data-tour="users-bulk"]',
    placement: 'bottom',
    title: 'Bulk add many users at once',
    body: `<p>If you're onboarding a whole roster, skip the one-at-a-time form and use <strong>Bulk Import</strong>. Download the CSV template, fill it in Excel, and upload — existing emails are updated, new ones are created.</p>`,
  },
  {
    page: '/admin/users',
    selector: '[data-tour="users-list"]',
    placement: 'top',
    title: 'Search, filter, edit, reset',
    body: `<p>Search any user by name or email, filter by role, then click their name to expand an editor where you can fix their details, reset their password, or deactivate them.</p><p>The chips in the <strong>School</strong> column show every school they're linked to — the gold-starred chip is their primary school.</p>`,
  },
  {
    page: '/admin/assignments',
    selector: '[data-tour="assign-create"]',
    placement: 'bottom',
    title: 'Link teachers to appraisers and coaches',
    body: `<p>This is the key page for scoping. Pick <strong>any number of teachers</strong> and <strong>any number of staff</strong> in one submit — every teacher × staff combination you selected is linked in a single click. Use the relationship dropdown to switch between <em>Appraiser</em> and <em>Coach</em>.</p>`,
    hint: 'Want to give a teacher both an appraiser and a coach? Submit the form twice — once with each relationship.',
  },
  {
    page: '/admin/assignments',
    selector: '[data-tour="assign-current"]',
    placement: 'top',
    title: 'See who evaluates whom — and unlink in bulk',
    body: `<p>Current assignments are grouped by staff member so you can see at a glance who each principal or coach is responsible for. Tick as many rows as you want, then click <strong>Remove checked</strong> — or delete a single row with the trash icon.</p>`,
  },
  {
    page: '/admin/schools',
    selector: '[data-tour="schools-add"]',
    placement: 'bottom',
    title: 'Manage schools',
    body: `<p>Add or edit each school's name, grade span, address, and phone. Any school here becomes available in the multi-school picker on the Users page and as a filter in the Report Builder.</p>`,
  },
  {
    page: '/admin/framework',
    selector: '[data-tour="framework-actions"]',
    placement: 'bottom',
    title: 'Your evaluation framework',
    body: `<p>This shows the active rubric — four performance levels for every indicator. You can <strong>bulk-import</strong> a new rubric from CSV, <strong>export</strong> the current one for editing, or tune individual cells in the Pedagogy Library.</p>`,
  },
  {
    page: '/admin/pedagogy',
    noHighlight: true,
    title: 'Pedagogy Library',
    body: `<p>Every cell in the rubric has an entry with: <strong>interpretation</strong> in plain English, <strong>evidence signals</strong> (what it looks like in a real classroom), <strong>teacher next moves</strong>, <strong>coaching considerations</strong>, <strong>resources</strong>, and a <strong>feedback-starter sentence</strong> used when auto-generating feedback.</p><p>Click any cell on this page to edit it — the content flows back into every observation.</p>`,
  },
  {
    page: '/admin/import/users',
    selector: '[data-tour="import-users-template"]',
    placement: 'bottom',
    title: 'Bulk import users',
    body: `<p>Download the template, fill it out in Excel, and upload. The <code>school_names</code> column accepts a single school <em>or</em> a pipe-separated list like <code>Alexander Elementary | Alexander Jr/Sr High</code> — perfect for staff covering more than one building.</p>`,
    hint: 'Tick "Dry run" first to see exactly what will be created/updated before it happens.',
  },
  ...reportsTourSteps(true),
  {
    page: '/admin/district',
    selector: '[data-tour="district-form"]',
    placement: 'auto',
    title: 'District settings',
    body: `<p>Finally, the district's name, address, and phone number appear on every printed PDF. Keep them current here.</p>`,
  },
  {
    page: '/admin/pd',
    noHighlight: true,
    title: 'PD Modules — the in-platform LMS',
    body: `
      <p>This is where you <strong>build the PD curriculum</strong> teachers see on their "My PD LMS" page. Each module is attached to a specific Marshall rubric indicator at a target level, and the seed ships <strong>120 lesson-plan-driven modules</strong> (60 indicators × levels 1 & 2) built around an 8-step Learn → Practice → Apply protocol:</p>
      <ul>
        <li><strong>Learn</strong> — teacher picks an upcoming lesson, reads the rubric side-by-side (current level vs. target), and identifies the evidence gap.</li>
        <li><strong>Practice</strong> — teacher rebuilds that lesson, scripts opener / pivot / close, and picks one piece of student evidence to collect.</li>
        <li><strong>Apply</strong> — teacher teaches the rebuilt lesson and submits <em>plan + evidence + 3-sentence impact note</em> for supervisor verification.</li>
      </ul>
      <p>When a teacher scores 1 or 2 on an indicator in a published observation, the platform auto-enrolls them in up to three matching modules — no manual assignment needed. You can edit, add, or retire any module here.</p>`,
  },
  {
    page: '/admin',
    selector: '#aps-bell-btn',
    placement: 'bottom',
    title: 'Notifications — replaces every email',
    body: `
      <p>The bell in the header is the in-platform alert system. It fires for every important event: a teacher acknowledged, a PD deliverable submitted, a bulk import finished, etc.</p>
      <p>Teachers, principals, coaches, and superintendents all get their own role-specific notifications. No SendGrid. No Twilio. No subscription. The district owns its own VAPID key pair and uses the browser's built-in Web Push standard.</p>`,
  },
  {
    page: '/admin',
    noHighlight: true,
    title: "Schools vs. Appraiser — what's the difference?",
    body: `
      <p><strong>Schools</strong> are the physical buildings (Elementary, High School…). They're used for org structure, reporting roll-ups, and telling the system where a teacher is based. A teacher can belong to <strong>multiple</strong> schools.</p>
      <p><strong>Appraiser</strong> is a <em>role</em> — typically a principal — who is <em>assigned</em> to teachers via the Assignments page. Being the principal of a school does <strong>not</strong> automatically assign you to its teachers; the super-admin picks explicitly who evaluates whom. This lets one principal cover teachers across buildings (very common in small districts) and keeps the eval system separate from staff directory data.</p>`,
  },
  {
    page: '/admin',
    noHighlight: true,
    title: "You're all set",
    body: `<p>That's the whole super-admin toolkit. Replay the tour from the <strong>Guided Tour</strong> button any time, and use the <strong>Profile</strong> menu in the top-right to change your password or notification preferences.</p><p>Questions? The <em>README</em> linked at the bottom of the site documents every route and feature.</p>`,
  },
];

// ----------------------------------------------------------------------------
// Superintendent tour
// ----------------------------------------------------------------------------
const superintendentSteps: TourStep[] = [
  introStep('Superintendent', '/superintendent'),
  {
    page: '/superintendent',
    selector: '[data-tour="supt-kpis"]',
    placement: 'bottom',
    title: 'District KPIs at a glance',
    body: `<p>Live district-wide totals: how many teachers, appraisers, coaches you have; how many observations are published vs. acknowledged; and a distribution of rubric scores across all four levels.</p>`,
  },
  {
    page: '/superintendent',
    selector: '[data-tour="supt-by-school"]',
    placement: 'auto',
    title: 'By-school rollup',
    body: `<p>Each school card shows teacher count, total observations, and how many are officially published. Multi-school teachers are counted for every building they belong to.</p>`,
  },
  {
    page: '/superintendent/schools',
    selector: '[data-tour="supt-schools-list"]',
    placement: 'auto',
    title: 'Drill into any school',
    body: `<p>See every teacher by school, with their title, how many observations they have, and when they were most recently observed. Click any teacher to view their individual profile.</p>`,
  },
  {
    page: '/superintendent/teachers',
    selector: '[data-tour="supt-teachers-list"]',
    placement: 'auto',
    title: 'Every teacher, district-wide',
    body: `<p>The full teacher list with school, observation count, and last-observed date. Click a name to open a read-only profile with all their published observations.</p>`,
  },
  ...reportsTourSteps(true),
  {
    page: '/superintendent',
    noHighlight: true,
    title: "You're all set",
    body: `<p>You can re-open this tour any time from the <strong>Guided Tour</strong> button. All observation data you see is scoped to what's officially published — drafts in progress are never counted.</p>`,
  },
];

// ----------------------------------------------------------------------------
// Appraiser tour (principals / evaluators)
// ----------------------------------------------------------------------------
const appraiserSteps: TourStep[] = [
  introStep('Administrator / Appraiser', '/appraiser'),
  {
    page: '/appraiser',
    selector: '[data-tour="ap-teachers"]',
    placement: 'auto',
    title: 'Your teachers',
    body: `<p>These are the teachers <strong>assigned to you</strong> for evaluation. Each row shows their latest observation so you can see where everyone stands at a glance.</p>`,
  },
  {
    page: '/appraiser',
    selector: '[data-tour="ap-start-obs"]',
    placement: 'auto',
    title: 'Start a new observation',
    body: `<p>Click <strong>Start observation</strong> next to any teacher. You'll enter the class context (subject, grade, location, duration) and immediately land in the rubric editor.</p>`,
    hint: 'Three observation types: Mini (short walk-throughs), Formal (full observations), and Annual Summary (end-of-year rollup).',
  },
  {
    page: '/appraiser/observations',
    selector: '[data-tour="ap-obs-list"]',
    placement: 'auto',
    title: 'All your observations',
    body: `<p>Every observation you've ever started — drafts, scored-but-not-published, published, and acknowledged. Click any row to jump back in.</p>`,
  },
  {
    page: '/appraiser/observations',
    noHighlight: true,
    title: 'Inside an observation',
    body: `
      <p>When you open an observation, the editor gives you everything in one place:</p>
      <ul>
        <li><strong>Scripted notes</strong> — low-inference evidence you collect live in the classroom. <em>Auto-saves on every keystroke</em> — no "Save" button.</li>
        <li><strong>Rubric scoring</strong> — click 1–4 on each indicator; the pedagogy library's plain-English language appears as guidance.</li>
        <li><strong>Glows & Grows</strong> — auto-generated starter sentences you can accept or rewrite.</li>
        <li><strong>Focus areas & next steps</strong> — what the teacher should work on and how.</li>
        <li><strong>Private notes</strong> — admin-only; never shown to the teacher. Auto-saves too.</li>
        <li><strong>Signatures</strong> — sign and publish; the teacher gets notified to acknowledge.</li>
      </ul>
      <p>Look for the green <strong>✓ Saved — N chars at HH:MM</strong> pill in the top-right of each card — that's the server confirming it wrote your text. Below the Scripted Notes box, open <strong>"Saved scripted notes in database"</strong> to see the exact text the server is holding right now.</p>`,
  },
  {
    page: '/pd/review',
    noHighlight: true,
    title: 'PD review queue — verify the rebuilt lesson',
    body: `
      <p>Teachers don't need a separate LMS — every module lives inside this platform. When one of your teachers submits a PD deliverable, it appears here as a <strong>pending review</strong>.</p>
      <p>Each submission is a <strong>rebuilt lesson plan</strong> for the exact indicator where you scored them a 1 or 2 — plus a student-evidence artifact (exit ticket, board photo, student quotes) and a 3-sentence impact note. You're looking for six specific things (shown at the top of every review page):</p>
      <ul>
        <li>The lesson is real — one they taught or are about to teach.</li>
        <li>At least two of the target-level moves are built into the plan.</li>
        <li>Opener / pivot / close are scripted in their own voice.</li>
        <li>Student evidence is concrete (work sample, exit ticket, transcript).</li>
        <li>The impact note names both what worked and what didn't.</li>
        <li>They identify one concrete next classroom move.</li>
      </ul>
      <p>Click <em>verified</em> (success notification fires to the teacher) or ask for a revision with a note. No email, no external LMS.</p>`,
  },
  {
    page: '/appraiser',
    selector: '#aps-bell-btn',
    placement: 'bottom',
    title: 'Your notification bell',
    body: `
      <p>This bell replaces every email a traditional evaluation system would send. Teachers acknowledging their observations, deliverables submitted for review, overdue acknowledgments — they all surface here.</p>
      <p>Click once to enable <strong>Web Push</strong> so your phone or desktop pings you in real time. No subscription, no third-party service.</p>`,
  },
  ...reportsTourSteps(false),
  {
    page: '/appraiser',
    noHighlight: true,
    title: "You're all set",
    body: `<p>Everything you do here is <strong>scoped to your assigned teachers</strong> — reports, searches, lists, and PD reviews. If a teacher you expected to see is missing, ask your super admin to add the assignment.</p>`,
  },
];

// ----------------------------------------------------------------------------
// Coach tour
// ----------------------------------------------------------------------------
const coachSteps: TourStep[] = [
  introStep('Instructional Coach', '/coach'),
  {
    page: '/coach',
    selector: '[data-tour="co-teachers"]',
    placement: 'auto',
    title: 'Your coaching caseload',
    body: `<p>The teachers you've been assigned to coach. Each row shows how many <strong>active focus areas</strong> they're working on right now — that's your starting point for every conversation.</p>`,
  },
  {
    page: '/coach',
    noHighlight: true,
    title: "What you'll see on a teacher's page",
    body: `
      <p>Click any teacher to see:</p>
      <ul>
        <li><strong>Published observations</strong> with the appraiser's glows, grows, and next steps.</li>
        <li><strong>Active focus areas</strong> — the exact indicator you should be coaching to.</li>
        <li>The <strong>pedagogy library's coaching considerations</strong> for that indicator at their current level, so every session has a clear focus.</li>
      </ul>
      <p>Coaching is <strong>strictly confidential</strong> — your view never shows private appraiser notes or affects their evaluation.</p>`,
  },
  {
    page: '/coach',
    noHighlight: true,
    title: "You're all set",
    body: `<p>That's the coach view — intentionally simple. Re-open the tour any time from the <strong>Guided Tour</strong> button at the top of the screen.</p>`,
  },
];

// ----------------------------------------------------------------------------
// Teacher tour
// ----------------------------------------------------------------------------
const teacherSteps: TourStep[] = [
  introStep('Teacher', '/teacher'),
  {
    page: '/teacher',
    selector: '[data-tour="t-summary"]',
    placement: 'auto',
    title: 'Your performance summary',
    body: `<p>A snapshot of your growth: per-domain averages, most-recent ratings on each indicator, and the observations that contributed to the numbers. Nothing is computed until an observation is <strong>published</strong> — drafts never affect your summary.</p>`,
  },
  {
    page: '/teacher/observations',
    selector: '[data-tour="t-obs-list"]',
    placement: 'auto',
    title: 'All your observations',
    body: `<p>Every observation your principal has run for you. The <strong>status</strong> tells you where each one stands: published means it's waiting for your acknowledgement, acknowledged means you've signed it.</p>`,
  },
  {
    page: '/teacher/observations',
    noHighlight: true,
    title: 'Acknowledging an observation — read first, sign after',
    body: `
      <p>When you open a published observation the <strong>blue banner at the very top</strong> tells you exactly how many strengths, growth areas, next steps, and rubric scores are waiting below — before you're asked to sign anything.</p>
      <ul>
        <li><strong>Rubric Scores</strong> — every indicator the appraiser marked, with evidence notes.</li>
        <li><strong>Strengths (Glows)</strong>, <strong>Growth areas (Grows)</strong>, and <strong>Next steps</strong>.</li>
        <li><strong>Focus areas</strong> opened for you.</li>
        <li>A place to <strong>type your response</strong> and <strong>sign</strong> at the bottom.</li>
      </ul>
      <p><strong>Signing = "seen and discussed"</strong> — not "I agree with every rating." If there's a dispute, use the response box; the signature is only the legal record that the conversation happened.</p>`,
  },
  {
    page: '/teacher/focus',
    selector: '[data-tour="t-focus"]',
    placement: 'auto',
    title: 'Your current focus areas',
    body: `<p>These are the specific indicators your appraiser wants you to work on. Each one links to the pedagogy library's <strong>teacher next moves</strong> and <strong>resources</strong> for that exact indicator at your current level.</p>`,
  },
  {
    page: '/teacher/pd',
    selector: '[data-tour="t-pd-home"]',
    placement: 'auto',
    title: 'My PD LMS — rebuild a real lesson, level up the rubric',
    body: `
      <p>Every module here is tied to one specific Marshall indicator where your last observation was scored 1 or 2. When you open a module you follow a simple 8-step protocol:</p>
      <ul>
        <li><strong>Learn</strong> (Steps 1-3) — pick an upcoming lesson you'll actually teach, read the rubric side-by-side for your current level vs. your target level, and spot the evidence gap.</li>
        <li><strong>Practice</strong> (Steps 4-6) — rewrite that lesson so the missing Level-up signals show up, script the three high-leverage moments (opener / pivot / close), and choose one piece of student evidence you'll collect.</li>
        <li><strong>Apply</strong> (Steps 7-8) — teach the redesigned lesson, then submit the rebuilt <strong>lesson plan + student evidence artifact + 3-sentence impact note</strong>. Your supervisor verifies that bundle right in the platform.</li>
      </ul>
      <p>The deliverable is <strong>work you keep</strong> — a lesson plan you can reuse, not a worksheet for a seminar you'll never open again. Group several modules into a <strong>PD Plan</strong> for a printable Floating PD Day agenda.</p>
      <p><strong>Works on the computer, not on paper:</strong> every "check that" becomes a clickable checkbox, every "pick one" becomes a radio button, and every answer box is an auto-saving textarea. Watch the green <em>✓ Saved (learn) at HH:MM</em> pill in the top-right — that's the server confirming every keystroke and click. You can close the browser any time; when you come back everything is exactly where you left it.</p>
      <p><strong>Practice unlocks</strong> the moment you click <em>Mark learn complete</em>; <strong>Apply unlocks</strong> the moment you click <em>Mark practice complete</em>. If you skipped "Start module" we forward you automatically — you will never be stuck.</p>`,
  },
  {
    page: '/teacher',
    selector: '#aps-bell-btn',
    placement: 'bottom',
    title: 'Notifications — no email required',
    body: `
      <p>The bell in the header collects every important event: a new observation, a focus area opened for you, a PD module recommended, a supervisor verification, and more.</p>
      <p>Open the bell once and the browser will ask permission to enable <strong>Web Push</strong>, so you'll also get notifications on your phone / laptop lock screen — still completely free to the district.</p>
      <p>You can fine-tune every notification kind (in-app + push, separately) from <strong>Profile &rarr; Notifications</strong>.</p>`,
  },
  ...reportsTourSteps(false),
  {
    page: '/teacher',
    noHighlight: true,
    title: "You're all set",
    body: `<p>Everything here is <strong>your private record</strong> — only you, your appraiser, and district leadership can see it. Re-open the tour from the top nav any time, and use <strong>Profile</strong> to change your password or notification preferences.</p>`,
  },
];

// ----------------------------------------------------------------------------
// Public getter
// ----------------------------------------------------------------------------
export function getTour(role: UserRole): TourStep[] {
  switch (role) {
    case 'super_admin':    return superAdminSteps;
    case 'superintendent': return superintendentSteps;
    case 'appraiser':      return appraiserSteps;
    case 'coach':          return coachSteps;
    case 'teacher':        return teacherSteps;
    default:               return [];
  }
}
