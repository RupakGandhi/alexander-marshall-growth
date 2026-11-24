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
  body: `<p>You’re signed in as a <strong>${roleLabel}</strong>. Choose <strong>Next</strong> to continue, <strong>Back</strong> to revisit a step, or <strong>Skip</strong> to leave. You can replay the walkthrough from <strong>Guided Tour</strong>.</p>`,
});

const reportsTourSteps = (audience: 'district' | 'appraiser' | 'teacher'): TourStep[] => [
  {
    page: '/reports',
    selector: '[data-tour="reports-title"]',
    placement: 'bottom',
    title: "The Report Builder",
    body: `<p>Build an observation report in three steps. Choose the records, decide what to include, then download your report.</p>`,
  },
  {
    page: '/reports',
    selector: '[data-tour="reports-who"]',
    placement: 'bottom',
    title: "Choose who and when",
    body: `<p>${audience === 'teacher' ? 'Your observation report covers your own published and acknowledged observations.' : audience === 'district' ? 'Filter by teacher, school, or appraiser.' : 'Filter by teachers on your caseload or by school.'} Choose dates or observation types, then select <strong>Apply filters &amp; preview</strong>.</p>`,
  },
  {
    page: '/reports',
    selector: '[data-tour="reports-what"]',
    placement: 'top',
    title: "Choose what to include",
    body: `<p>Select a preset such as <strong>Scores only</strong> or <strong>Teacher folder copy</strong>. Adjust the individual checkboxes to include the sections you need.</p>`,
  },
  {
    page: '/reports',
    selector: '[data-tour="reports-download"]',
    placement: 'top',
    title: "Download your report",
    body: `<p>Choose <strong>Download CSV</strong> for a spreadsheet. For a printable report, choose <strong>Open PDF</strong>, then use your browser’s print menu to save a PDF.</p>`,
  },
];

// ----------------------------------------------------------------------------
// Super Administrator tour
// ----------------------------------------------------------------------------
const superAdminSteps: TourStep[] = [
  introStep('Super Administrator', '/admin'),
  {
    page: '/admin',
    selector: '[data-tour="main-nav"], #aps-mobile-nav-btn',
    placement: 'bottom',
    title: 'Your navigation',
    body: `<p>Use the navigation to move between Users, Assignments, Schools, and your other tools. On a small screen, open the menu at the top left.</p>`,
  },
  {
    page: '/admin',
    selector: '[data-tour="admin-overview"]',
    placement: 'auto',
    title: 'Overview dashboard',
    body: `<p>The overview summarizes district activity and provides links to the tools you use to manage the platform.</p>`,
  },
  {
    page: '/admin/users',
    selector: '[data-tour="users-create"]',
    placement: 'bottom',
    title: 'Create users',
    body: `<p>Enter the staff member’s name, email, role, and school information. Use the initial password field to set their starting password. They can change it in <strong>Profile &amp; Password</strong>.</p>`,
  },
  {
    page: '/admin/users',
    selector: '[data-tour="users-bulk"]',
    placement: 'bottom',
    title: 'Bulk add many users at once',
    body: `<p>Use <strong>Add many users at once</strong> to open the CSV import workflow. A downloadable template shows which columns to fill in.</p>`,
  },
  {
    page: '/admin/users',
    selector: '[data-tour="users-list"]',
    placement: 'top',
    title: "Find and manage a user",
    body: `<p>Search by name or email, or filter by role. Open a user’s controls to edit their account or reset their password.</p>`,
  },
  {
    page: '/admin/assignments',
    selector: '[data-tour="assign-create"]',
    placement: 'bottom',
    title: 'Link teachers to appraisers and coaches',
    body: `<p>Select teachers, choose the appraiser or coach relationship, then select the staff members to link. Set up a separate relationship for each role the teacher needs.</p>`,
  },
  {
    page: '/admin/assignments',
    selector: '[data-tour="assign-current"]',
    placement: 'top',
    title: "Review current assignments",
    body: `<p>Assignments are grouped by staff member. Use this list to check which teachers are linked to each appraiser or coach.</p>`,
  },
  {
    page: '/admin/schools',
    selector: '[data-tour="schools-add"]',
    placement: 'bottom',
    title: 'Manage schools',
    body: `<p>Use this page to add a school and review the district’s existing schools. School membership is managed on each user’s account.</p>`,
  },
  {
    page: '/admin/framework',
    selector: '[data-tour="framework-actions"]',
    placement: 'bottom',
    title: 'Your evaluation framework',
    body: `<p>Review the evaluation domains, indicators, and rating descriptors. The actions at the top let you export the framework or open the bulk import workflow.</p>`,
  },
  {
    page: '/admin/pedagogy',
    noHighlight: true,
    title: 'Pedagogy Library',
    body: `<p>The Pedagogy Library organizes teaching guidance by rubric indicator and performance level. Select the relevant entry to review or edit its guidance.</p>`,
  },
  {
    page: '/admin/import/users',
    selector: '[data-tour="import-users-template"]',
    placement: 'bottom',
    title: 'Bulk import users',
    body: `<p>Download the CSV template and fill it in with staff information. Select <strong>Dry run</strong> to preview counts and errors before an import writes account changes.</p>`,
  },
  ...reportsTourSteps('district'),
  {
    page: '/admin/district',
    selector: '[data-tour="district-form"]',
    placement: 'auto',
    title: 'District settings',
    body: `<p>Edit district contact details here. The School years section below lets you manage the year used for district records.</p>`,
  },
  {
    page: '/admin/pd',
    noHighlight: true,
    title: "PD modules",
    body: `<p>Manage the modules teachers see in My PD LMS. Each module connects to an indicator and target level. Open a module to review the guidance and deliverable.</p>`,
  },
  {
    page: '/admin',
    selector: '#aps-bell-btn',
    placement: 'bottom',
    title: "Your notifications",
    body: `<p>Open the bell to read your notifications. Choose <strong>Notification settings</strong> to manage your preferences or turn on optional alerts for this device.</p>`,
  },
  {
    page: '/admin',
    noHighlight: true,
    title: "School membership and appraiser assignments",
    body: `<p>School membership groups records by building. Use <strong>Assignments</strong> to connect a teacher with the person who evaluates or coaches them.</p>`,
  },
  {
    page: '/admin/data',
    selector: 'main a[href="/admin/data/practice-cleanup"]',
    title: "Practice-data cleanup",
    body: `<p>After training, open <strong>Practice-data cleanup</strong> to select individual demo records and preview the exact selection. Read the preview before confirming. The district-wide reset controls affect a much broader set of records.</p>`,
  },
  {
    page: '/admin',
    noHighlight: true,
    title: "You're all set",
    body: `<p>Open <strong>Guided Tour</strong> to replay these steps. To change your password, open your account menu and choose <strong>Profile &amp; Password</strong>.</p>`,
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
    title: "District dashboard",
    body: `<p>Review district counts for staff, focus areas, and observations. The dashboard distinguishes total observations from published observations.</p>`,
  },
  {
    page: '/superintendent',
    selector: '[data-tour="supt-by-school"]',
    placement: 'auto',
    title: 'By-school rollup',
    body: `<p>The <strong>By School</strong> table summarizes activity by building. Use the school view to see the teachers behind those counts.</p>`,
  },
  {
    page: '/superintendent/schools',
    selector: 'main h1',
    placement: 'auto',
    title: "Teachers by school",
    body: `<p>Each school lists its teachers, published observation counts, and most recent observation dates. Open a teacher’s record from their row.</p>`,
  },
  {
    page: '/superintendent/teachers',
    selector: '[data-tour="supt-teachers-list"]',
    placement: 'auto',
    title: "District teacher directory",
    body: `<p>Use the district-wide list to find teachers across buildings and open their records.</p>`,
  },
  ...reportsTourSteps('district'),
  {
    page: '/superintendent',
    noHighlight: true,
    title: "You're all set",
    body: `<p>Open <strong>Guided Tour</strong> to replay these steps. To change your password, open your account menu and choose <strong>Profile &amp; Password</strong>.</p>`,
  },
];

// ----------------------------------------------------------------------------
// Appraiser tour (principals / evaluators)
// ----------------------------------------------------------------------------
const appraiserSteps: TourStep[] = [
  introStep('Administrator / Appraiser', '/appraiser'),
  {
    page: '/appraiser',
    selector: '[data-tour="ap-teachers"], [data-tour="ap-empty"]',
    placement: 'auto',
    title: 'Your teachers',
    body: `<p>Your assigned teachers appear here. Use <strong>View data</strong> on a teacher’s card to review their record. If the list is empty, your super administrator can add your assignments.</p>`,
  },
  {
    page: '/appraiser',
    selector: '[data-tour="ap-start-obs"] summary, [data-tour="ap-empty"]',
    placement: 'auto',
    title: 'Start a new observation',
    body: `<p>On an assigned teacher’s card, <strong>Start observation</strong> offers Mini observation, Formal observation, and Annual summary. Choosing a type creates a draft. You can continue this tour without creating one.</p>`,
  },
  {
    page: '/appraiser/observations',
    selector: '[data-tour="ap-obs-list"]',
    placement: 'auto',
    title: "Your observations",
    body: `<p>Use the observations list to find an existing draft or revisit an observation you published. An empty list means you have no matching observations yet.</p>`,
  },
  {
    page: '/appraiser/observations',
    noHighlight: true,
    title: "From draft to published observation",
    body: `<p>Open a draft to enter the evidence, scores, and feedback for the observation. Review it and sign before publishing. Once published, the teacher can read it, respond, and acknowledge it.</p>`,
  },
  {
    page: '/pd/review',
    noHighlight: true,
    title: "Review a PD submission",
    body: `<p>Open a submitted deliverable in <strong>PD Review</strong> to read the teacher’s work and use the rubric. Verify completed work and set the credit hours, or ask for revision with feedback.</p>`,
  },
  {
    page: '/appraiser/external-pd',
    noHighlight: true,
    title: "External PD",
    body: `<p>Review external PD submissions from your teachers. To record a group event, enter the event details and hours, then select only the teachers who attended.</p>`,
  },
  {
    page: '/appraiser',
    selector: '#aps-bell-btn',
    placement: 'bottom',
    title: 'Your notification bell',
    body: `<p>Open the bell to read your notifications. Choose <strong>Notification settings</strong> to manage your preferences or turn on optional alerts for this device.</p>`,
  },
  ...reportsTourSteps('appraiser'),
  {
    page: '/appraiser',
    noHighlight: true,
    title: "You're all set",
    body: `<p>Open <strong>Guided Tour</strong> to replay these steps. To change your password, open your account menu and choose <strong>Profile &amp; Password</strong>.</p>`,
  },
];

// ----------------------------------------------------------------------------
// Coach tour
// ----------------------------------------------------------------------------
const coachSteps: TourStep[] = [
  introStep('Instructional Coach', '/coach'),
  {
    page: '/coach',
    selector: '[data-tour="co-teachers"], [data-tour="co-empty"]',
    placement: 'auto',
    title: 'Your coaching caseload',
    body: `<p>Your assigned teachers appear here. Choose <strong>Open coaching view</strong> on a teacher’s card to see their focus areas and teacher-facing feedback. If the list is empty, ask your super administrator about your assignments.</p>`,
  },
  {
    page: '/coach',
    noHighlight: true,
    title: "Inside a teacher’s coaching view",
    body: `<p>After the tour, open an assigned teacher’s coaching view. Review their focus areas and teacher-facing feedback to plan your next conversation.</p>`,
  },
  {
    page: '/coach',
    noHighlight: true,
    title: "Non-evaluative coaching feedback",
    body: `<p>In a teacher’s coaching view, use <strong>Non-evaluative coaching feedback</strong> to record a conversation. Save a draft while you work. Choose <strong>Share with teacher</strong> when you want it to appear on that teacher’s home page.</p>`,
  },
  {
    page: '/pd/review',
    selector: 'main h1',
    title: "Review teachers’ PD",
    body: `<p>Open a submitted deliverable from this queue to read the teacher’s work and give feedback. An empty queue means there is currently nothing awaiting review. You can continue the tour.</p>`,
  },
  {
    page: '/coach',
    noHighlight: true,
    title: "You're all set",
    body: `<p>Open <strong>Guided Tour</strong> to replay these steps. To change your password, open your account menu and choose <strong>Profile &amp; Password</strong>.</p>`,
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
    title: "Your teaching dashboard",
    body: `<p>The four cards show your active focus areas, published observations, PD hours this year, and goals. Counts can be zero when you first sign in.</p>`,
  },
  {
    page: '/teacher/observations',
    selector: '[data-tour="t-obs-list"]',
    placement: 'auto',
    title: "Your published observations",
    body: `<p>An observation appears here after your appraiser publishes it. Open one to read the scores and feedback. If your list is empty, continue the tour and explore the Module Library in My PD LMS.</p>`,
  },
  {
    page: '/teacher/observations',
    noHighlight: true,
    title: "Acknowledge an observation",
    body: `<p>After you have read and discussed a published observation, draw your signature, add an optional response, and choose <strong>Sign &amp; Acknowledge</strong>. Your signature records that you have seen and discussed the observation.</p>`,
  },
  {
    page: '/teacher/focus',
    selector: '[data-tour="t-focus"]',
    placement: 'auto',
    title: 'Your current focus areas',
    body: `<p>Your appraiser can identify focus areas for your work together. Active focus areas are listed here with their descriptions. Your first visit may show no active focus areas.</p>`,
  },
  {
    page: '/teacher',
    selector: '[data-tour="t-coaching-feedback"]',
    placement: 'auto',
    title: 'Non-evaluative coaching feedback',
    body: `<p>When your instructional coach chooses <strong>Share with teacher</strong>, their note appears in this section of your home page. These notes are separate from observation scores. The section is empty until a coach shares feedback.</p>`,
  },
  {
    page: '/teacher/pd',
    selector: '[data-tour="t-pd-home"]',
    placement: 'auto',
    title: "My PD LMS",
    body: `<p>Start with <strong>Recommended Modules</strong>, or browse the <strong>Module Library</strong> even before your first observation. Follow Learn, Practice, and Apply in your module, then submit your deliverable for review. Your reviewer can verify it or request a revision.</p>`,
  },
  {
    page: '/teacher',
    selector: '#aps-bell-btn',
    placement: 'bottom',
    title: "Your notifications",
    body: `<p>Open the bell to read your notifications. Choose <strong>Notification settings</strong> to manage your preferences or turn on optional alerts for this device.</p>`,
  },
  ...reportsTourSteps('teacher'),
  {
    page: '/teacher',
    noHighlight: true,
    title: "You're all set",
    body: `<p>Open <strong>Guided Tour</strong> to replay these steps. To change your password, open your account menu and choose <strong>Profile &amp; Password</strong>.</p>`,
  },
];

// ----------------------------------------------------------------------------
// The combined tour visits the teacher workspace, then the coaching caseload.
const TEACHER_COACH_OUTRO_TITLE = "You're all set";

function stripIntroAndOutro(steps: TourStep[], label: string): TourStep[] {
  // The first step is always introStep(…) — its title starts with "Welcome
  // to the Marshall Growth Platform".  Terminal step has title === "You're
  // all set".
  const startsWithIntro = steps.length > 0 && /^Welcome to the/.test(steps[0].title);
  const endsWithOutro = steps.length > 0 && steps[steps.length - 1].title === TEACHER_COACH_OUTRO_TITLE;
  if (!startsWithIntro || !endsWithOutro) {
    // Defensive: refuse to silently drop content if the invariants slipped.
    // Merging with an unexpected structure could stutter or hang the tour.
    console.warn(`tour.ts: ${label} steps have unexpected structure ` +
      `(intro=${startsWithIntro}, outro=${endsWithOutro}) — returning as-is`);
    return steps.slice();
  }
  return steps.slice(1, -1);
}

const teacherCoachSteps: TourStep[] = [
  // 1. Combined intro — replaces the role-specific "Welcome / You're signed
  //    in as a Teacher" line.  Names both hats up front so the user knows
  //    what to expect.
  {
    page: '/teacher',
    noHighlight: true,
    title: 'Welcome to the Marshall Growth Platform',
    body: `<p>This tour covers both your <strong>My Teaching</strong> and <strong>My Coaching</strong> workspaces. Choose <strong>Next</strong> to continue, <strong>Back</strong> to revisit a step, or <strong>Skip</strong> to leave. You can replay the walkthrough from <strong>Guided Tour</strong>.</p>`,
  },
  // 2. Teacher body (drops teacher intro + teacher outro).
  ...stripIntroAndOutro(teacherSteps, 'teacherSteps'),
  // 3. Bridge to the coaching workspace.
  {
    page: '/teacher',
    noHighlight: true,
    title: "From My Teaching to My Coaching",
    body: `<p>Next, you’ll see the coaching workspace for your assigned teachers. Use <strong>My Teaching</strong> to return to your own records or <strong>My Coaching</strong> to return to your caseload.</p>`,
  },
  // 4. Coach body (drops coach intro + coach outro).
  ...stripIntroAndOutro(coachSteps, 'coachSteps'),
  // 5. Combined outro naming both workspaces.
  {
    page: '/teacher',
    noHighlight: true,
    title: "You're all set",
    body: `<p>Use <strong>My Teaching</strong> for your own observations and PD, and <strong>My Coaching</strong> for your assigned teachers. Open <strong>Guided Tour</strong> to replay these steps. To change your password, open your account menu and choose <strong>Profile &amp; Password</strong>.</p>`,
  },
];

// ----------------------------------------------------------------------------
// Public getter
// ----------------------------------------------------------------------------
//
// Sept 24, 2026 — accepts an optional `canCoach` flag so a teacher-coach
// gets the merged teacher+coach tour instead of just the teacher tour.
// Callers pass `user.role, user.can_coach` (see src/lib/layout.tsx).  Older
// call sites that only pass a role still work — they get the pure-role
// tour, matching pre-fix behavior for pure teachers / pure coaches.
export function getTour(role: UserRole, canCoach?: number): TourStep[] {
  switch (role) {
    case 'super_admin':    return superAdminSteps;
    case 'superintendent': return superintendentSteps;
    case 'appraiser':      return appraiserSteps;
    case 'coach':          return coachSteps;
    case 'teacher':
      return canCoach === 1 ? teacherCoachSteps : teacherSteps;
    default:               return [];
  }
}
