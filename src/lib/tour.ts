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
    page: '/admin',
    noHighlight: true,
    title: "You're all set",
    body: `<p>That's the whole super-admin toolkit. Replay the tour from the <strong>Guided Tour</strong> button any time, and use the <strong>Profile</strong> menu in the top-right to change your password.</p><p>Questions? The <em>README</em> linked at the bottom of the site documents every route and feature.</p>`,
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
        <li><strong>Scripted notes</strong> — low-inference evidence you collect live in the classroom.</li>
        <li><strong>Rubric scoring</strong> — click 1–4 on each indicator; the pedagogy library's plain-English language appears as guidance.</li>
        <li><strong>Glows & Grows</strong> — auto-generated starter sentences you can accept or rewrite.</li>
        <li><strong>Focus areas & next steps</strong> — what the teacher should work on and how.</li>
        <li><strong>Private notes</strong> — admin-only; never shown to the teacher.</li>
        <li><strong>Signatures</strong> — sign and publish; the teacher gets notified to acknowledge.</li>
      </ul>`,
  },
  ...reportsTourSteps(false),
  {
    page: '/appraiser',
    noHighlight: true,
    title: "You're all set",
    body: `<p>Everything you do here is <strong>scoped to your assigned teachers</strong> — reports, searches, and lists. If a teacher you expected to see is missing, ask your super admin to add the assignment.</p>`,
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
    title: 'Acknowledging an observation',
    body: `
      <p>When you open a published observation you'll see:</p>
      <ul>
        <li><strong>Scores</strong> on every indicator the appraiser marked, with evidence notes.</li>
        <li><strong>Strengths (Glows)</strong>, <strong>Growth areas (Grows)</strong>, <strong>Focus areas</strong>, and <strong>Next steps</strong>.</li>
        <li>A place to <strong>type your response</strong> and <strong>sign</strong> — that officially acknowledges the observation.</li>
      </ul>
      <p>Acknowledging doesn't mean "I agree with every rating" — it means "I've read this and had a chance to respond."</p>`,
  },
  {
    page: '/teacher/focus',
    selector: '[data-tour="t-focus"]',
    placement: 'auto',
    title: 'Your current focus areas',
    body: `<p>These are the specific indicators your appraiser wants you to work on. Each one links to the pedagogy library's <strong>teacher next moves</strong> and <strong>resources</strong> for that exact indicator at your current level.</p>`,
  },
  ...reportsTourSteps(false),
  {
    page: '/teacher',
    noHighlight: true,
    title: "You're all set",
    body: `<p>Everything here is <strong>your private record</strong> — only you, your appraiser, and district leadership can see it. Re-open the tour from the top nav any time, and use <strong>Profile</strong> to change your password.</p>`,
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
