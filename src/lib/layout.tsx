import type { User } from './types';
import { getTour } from './tour';

export function roleLabel(role: string): string {
  switch (role) {
    case 'super_admin': return 'Super Administrator';
    case 'superintendent': return 'Superintendent';
    case 'appraiser': return 'Administrator / Appraiser';
    case 'coach': return 'Instructional Coach';
    case 'teacher': return 'Teacher';
    default: return role;
  }
}

export function roleHomeUrl(role: string): string {
  switch (role) {
    case 'super_admin': return '/admin';
    case 'superintendent': return '/superintendent';
    case 'appraiser': return '/appraiser';
    case 'coach': return '/coach';
    case 'teacher': return '/teacher';
    default: return '/';
  }
}

export function Layout(props: { title: string; user: User | null; children: any; activeNav?: string; autoLaunchTour?: boolean }) {
  const { title, user, children, activeNav, autoLaunchTour } = props;
  const nav = user ? navFor(user, activeNav) : null;

  // Embed the role-specific tour payload as a JSON blob. The tour engine
  // (/static/tour.js) reads this on DOMContentLoaded.
  const tourSteps = user ? getTour(user.role as any) : [];
  const tourPayload = user && tourSteps.length ? {
    userId: user.id,
    role: user.role,
    roleLabel: roleLabel(user.role),
    autoLaunch: !!autoLaunchTour,
    steps: tourSteps,
  } : null;

  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=yes" />
        <meta name="theme-color" content="#0b2545" />
        <meta name="color-scheme" content="light" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="APS Growth" />
        <meta name="application-name" content="APS Growth" />
        <meta name="format-detection" content="telephone=yes" />
        <meta name="msapplication-TileColor" content="#0b2545" />
        <link rel="manifest" href="/static/manifest.json" />
        <link rel="icon" type="image/png" sizes="32x32" href="/static/favicon-32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/static/favicon-16.png" />
        <link rel="shortcut icon" href="/static/favicon.ico" />
        <link rel="apple-touch-icon" href="/static/apple-touch-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/static/apple-touch-icon.png" />
        <title>{title} · Alexander Public Schools — Marshall Growth Platform</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet" />
        <link href="/static/styles.css" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html: `tailwind.config = { theme: { extend: { colors: {
              aps: { navy:'#0b2545', blue:'#13315c', sky:'#8da9c4', wheat:'#eef4ed', gold:'#c9a227' }
            }, fontFamily: { display: ['Georgia','serif'], sans:['Inter','ui-sans-serif','system-ui'] } } } }`,
          }}
        />
      </head>
      <body class="bg-aps-wheat min-h-screen font-sans text-slate-800 aps-body">
        {nav}
        {/* April 2026: dismissible sign-in banner that informs users they can
            keep Alexander2026! for testing or change it any time from Profile.
            Rendered client-side so it doesn't require plumbing state through
            every route; remembered per-user in localStorage once dismissed. */}
        {user && (
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){
  try {
    var p = new URLSearchParams(location.search);
    if (p.get('pwreminder') !== '1') return;
    var KEY = 'aps-pwreminder-dismissed-${user.id}';
    if (localStorage.getItem(KEY)) return;
    var wrap = document.createElement('div');
    wrap.id = 'aps-pwreminder';
    wrap.className = 'max-w-7xl mx-auto px-3 sm:px-4 pt-4';
    wrap.innerHTML =
      '<div class="p-3 rounded border border-sky-200 bg-sky-50 text-sky-900 text-sm flex flex-wrap items-start gap-3">' +
        '<i class="fas fa-circle-info mt-0.5"></i>' +
        '<div class="flex-1 min-w-[200px]">' +
          "<strong>You're signed in.</strong> You can keep the current password " +
          "(<code class=\\"bg-white border border-sky-200 rounded px-1 py-0.5 text-xs\\">Alexander2026!</code>) " +
          'for testing, or change it any time from <a href="/profile" class="underline font-medium">Profile</a>.' +
        '</div>' +
        '<button type="button" id="aps-pwreminder-dismiss" class="text-xs text-sky-800 hover:text-sky-950 px-2 py-1 rounded hover:bg-sky-100" aria-label="Dismiss"><i class="fas fa-xmark mr-1"></i>Dismiss</button>' +
      '</div>';
    var main = document.querySelector('main');
    if (main && main.parentNode) main.parentNode.insertBefore(wrap, main);
    var btn = document.getElementById('aps-pwreminder-dismiss');
    if (btn) btn.addEventListener('click', function(){
      localStorage.setItem(KEY, String(Date.now()));
      var n = document.getElementById('aps-pwreminder');
      if (n && n.parentNode) n.parentNode.removeChild(n);
      // Clean the URL so refresh doesn't re-show it.
      try { p.delete('pwreminder'); var q = p.toString();
        history.replaceState({}, '', location.pathname + (q ? '?'+q : '') + location.hash);
      } catch(e) {}
    });
  } catch(e) { /* never block the page */ }
})();`,
            }}
          />
        )}
        <main class="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6">{children}</main>
        <footer class="max-w-7xl mx-auto px-3 sm:px-4 py-6 text-xs text-slate-500 flex flex-wrap gap-2 sm:gap-3 justify-between items-center">
          <div>© {new Date().getFullYear()} Alexander Public School District · 601 Delaney St, Alexander, ND 58831 · 701-828-3334</div>
          <div>Marshall Growth Platform v1.0</div>
        </footer>
        {tourPayload && (
          <script
            dangerouslySetInnerHTML={{
              __html: `window.__APS_TOUR__=${JSON.stringify(tourPayload).replace(/</g, '\\u003c')};`,
            }}
          />
        )}
        <script src="/static/app.js" defer></script>
        {tourPayload && <script src="/static/tour.js" defer></script>}
      </body>
    </html>
  );
}

function navFor(user: User, active?: string) {
  const nav = navItems(user.role);
  return (
    <header class="bg-aps-navy text-white shadow-md sticky top-0 z-40 aps-header">
      <div class="max-w-7xl mx-auto px-3 sm:px-4 py-2 sm:py-3 flex items-center justify-between gap-2 sm:gap-4">
        {/* Mobile hamburger (left) */}
        <button
          type="button"
          id="aps-mobile-nav-btn"
          class="md:hidden w-10 h-10 flex items-center justify-center rounded hover:bg-aps-blue focus:outline-none focus:ring-2 focus:ring-white"
          aria-label="Open navigation menu"
          aria-haspopup="true"
          aria-expanded="false"
          aria-controls="aps-mobile-nav"
          onclick="window.toggleMobileNav && window.toggleMobileNav(event)"
        >
          <i class="fas fa-bars text-lg"></i>
        </button>

        {/* Logo + title */}
        <a href={roleHomeUrl(user.role)} class="flex items-center gap-2 sm:gap-3 min-w-0 flex-1 md:flex-initial">
          <div class="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-aps-gold text-aps-navy font-display font-bold flex items-center justify-center text-base sm:text-lg flex-shrink-0">A</div>
          <div class="leading-tight min-w-0">
            <div class="font-display text-sm sm:text-lg truncate">Alexander Public Schools</div>
            <div class="text-[10px] sm:text-xs text-aps-sky truncate">Marshall Growth Platform</div>
          </div>
        </a>

        {/* Desktop nav */}
        <nav class="hidden md:flex items-center gap-1 flex-wrap" data-tour="main-nav">
          {nav.map((item) => (
            <a href={item.href} class={`px-2 lg:px-3 py-2 rounded text-xs lg:text-sm hover:bg-aps-blue whitespace-nowrap ${active === item.key ? 'bg-aps-blue' : ''}`}>
              <i class={`${item.icon} mr-1 lg:mr-2`}></i>{item.label}
            </a>
          ))}
        </nav>

        <div class="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* Guided Tour launcher — desktop and tablet */}
          <button
            type="button"
            class="aps-tour-nav-btn hidden sm:inline-flex"
            title="Open the guided walkthrough for your role"
            onclick="window.APSGuidedTour && window.APSGuidedTour.start()"
          >
            <i class="fas fa-compass"></i><span class="hidden lg:inline">Guided Tour</span>
          </button>

          {/* User name — hide on small screens */}
          <div class="text-right hidden lg:block">
            <div class="text-sm font-medium truncate max-w-[10rem]">{user.first_name} {user.last_name}</div>
            <div class="text-xs text-aps-sky truncate max-w-[10rem]">{roleLabel(user.role)}</div>
          </div>

          {/* Notification bell */}
          <div class="relative" id="aps-bell-root">
            <button
              type="button"
              id="aps-bell-btn"
              class="relative w-10 h-10 flex items-center justify-center rounded-full hover:bg-aps-blue focus:outline-none focus:ring-2 focus:ring-white"
              aria-label="Notifications" aria-haspopup="true" aria-expanded="false"
              onclick="window.APSBell && window.APSBell.toggle(event)"
            >
              <i class="fas fa-bell text-lg"></i>
              <span id="aps-bell-badge" class="hidden absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-bold flex items-center justify-center border border-aps-navy">0</span>
            </button>
            <div id="aps-bell-panel" class="hidden absolute right-0 mt-1 w-80 sm:w-96 max-h-[70vh] overflow-hidden bg-white text-slate-800 rounded-md shadow-xl z-50 border border-slate-200 flex flex-col">
              <div class="px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                <div class="text-sm font-semibold text-aps-navy">Notifications</div>
                <button type="button" class="text-xs text-aps-blue hover:underline" onclick="window.APSBell && window.APSBell.markAllRead()">Mark all read</button>
              </div>
              <div id="aps-bell-list" class="flex-1 overflow-y-auto text-sm">
                <div class="p-6 text-center text-slate-400 text-xs" id="aps-bell-empty">Loading…</div>
              </div>
              <div class="px-4 py-2 border-t border-slate-200 text-center">
                <a href="/profile#notifications" class="text-xs text-aps-blue hover:underline"><i class="fas fa-sliders mr-1"></i>Notification settings</a>
              </div>
            </div>
          </div>

          {/* User avatar + menu */}
          <div class="relative" id="user-menu-root">
            <button
              type="button"
              id="user-menu-btn"
              onclick="window.toggleUserMenu && window.toggleUserMenu(event)"
              class="w-10 h-10 rounded-full bg-aps-sky text-aps-navy font-bold flex items-center justify-center hover:ring-2 hover:ring-white focus:outline-none focus:ring-2 focus:ring-white"
              aria-label="User menu" aria-haspopup="true" aria-expanded="false"
            >
              {user.first_name[0]}{user.last_name[0]}
            </button>
            <div id="user-menu-panel" class="absolute right-0 mt-1 w-64 sm:w-56 bg-white text-slate-800 rounded-md shadow-xl hidden z-50 border border-slate-200">
              <div class="px-4 py-3 border-b border-slate-200">
                <div class="text-sm font-semibold text-aps-navy truncate">{user.first_name} {user.last_name}</div>
                <div class="text-xs text-slate-500">{roleLabel(user.role)}</div>
              </div>
              <button type="button" class="block w-full text-left px-4 py-3 hover:bg-slate-100 text-sm min-h-[44px]" onclick="window.APSGuidedTour && window.APSGuidedTour.start()">
                <i class="fas fa-compass mr-2 w-4 text-aps-navy"></i>Guided Tour
              </button>
              <a class="block px-4 py-3 hover:bg-slate-100 text-sm min-h-[44px]" href="/profile">
                <i class="fas fa-user-gear mr-2 w-4 text-aps-navy"></i>Profile &amp; Password
              </a>
              <form method="post" action="/logout">
                <button class="block w-full text-left px-4 py-3 hover:bg-slate-100 text-sm text-red-700 min-h-[44px]">
                  <i class="fas fa-sign-out-alt mr-2 w-4"></i>Sign out
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile drawer menu */}
      <nav
        id="aps-mobile-nav"
        class="md:hidden hidden bg-aps-blue text-white border-t border-aps-navy/30"
        aria-label="Main navigation"
        data-tour="main-nav"
      >
        <div class="max-w-7xl mx-auto px-2 py-2 grid grid-cols-1 gap-0.5">
          {nav.map((item) => (
            <a
              href={item.href}
              class={`flex items-center gap-3 px-4 py-3 rounded text-sm min-h-[44px] ${active === item.key ? 'bg-aps-navy font-semibold' : 'hover:bg-aps-navy/50'}`}
            >
              <i class={`${item.icon} w-5 text-aps-sky`}></i>
              <span>{item.label}</span>
            </a>
          ))}
          <button
            type="button"
            class="flex items-center gap-3 px-4 py-3 rounded text-sm min-h-[44px] hover:bg-aps-navy/50 text-left"
            onclick="window.APSGuidedTour && window.APSGuidedTour.start()"
          >
            <i class="fas fa-compass w-5 text-aps-gold"></i>
            <span>Guided Tour</span>
          </button>
        </div>
      </nav>
    </header>
  );
}

function navItems(role: string) {
  switch (role) {
    case 'super_admin':
      return [
        { key: 'admin-home',     label: 'Overview',          href: '/admin',              icon: 'fas fa-gauge' },
        { key: 'admin-users',    label: 'Users',             href: '/admin/users',        icon: 'fas fa-users' },
        { key: 'admin-assign',   label: 'Assignments',       href: '/admin/assignments',  icon: 'fas fa-user-group' },
        { key: 'admin-schools',  label: 'Schools',           href: '/admin/schools',      icon: 'fas fa-school' },
        { key: 'admin-pedagogy', label: 'Pedagogy Library',  href: '/admin/pedagogy',     icon: 'fas fa-book' },
        { key: 'admin-pd',       label: 'PD Modules',        href: '/admin/pd',           icon: 'fas fa-graduation-cap' },
        { key: 'admin-ext-pd',   label: 'External PD',       href: '/admin/external-pd',  icon: 'fas fa-clipboard-list' },
        { key: 'admin-framework',label: 'Framework',         href: '/admin/framework',    icon: 'fas fa-list-check' },
        { key: 'admin-import',   label: 'Bulk Import',       href: '/admin/import/users', icon: 'fas fa-file-import' },
        { key: 'admin-reports',  label: 'Reports',           href: '/reports',            icon: 'fas fa-file-export' },
        { key: 'admin-district', label: 'District',          href: '/admin/district',     icon: 'fas fa-building-columns' },
        { key: 'data',           label: 'Data Management',   href: '/admin/data',         icon: 'fas fa-database' },
      ];
    case 'superintendent':
      return [
        { key: 'supt-home',    label: 'District Overview', href: '/superintendent',          icon: 'fas fa-gauge' },
        { key: 'supt-insights',label: 'Insights',          href: '/superintendent/insights', icon: 'fas fa-chart-line' },
        { key: 'supt-schools', label: 'By School',         href: '/superintendent/schools',  icon: 'fas fa-school' },
        { key: 'supt-teacher', label: 'By Teacher',        href: '/superintendent/teachers', icon: 'fas fa-chalkboard-user' },
        { key: 'supt-reports', label: 'Reports',           href: '/reports',                 icon: 'fas fa-file-export' },
      ];
    case 'appraiser':
      return [
        { key: 'ap-home',      label: 'My Teachers',   href: '/appraiser',             icon: 'fas fa-chalkboard-user' },
        { key: 'ap-obs',       label: 'Observations',  href: '/appraiser/observations',icon: 'fas fa-clipboard-list' },
        { key: 'pd-review',    label: 'PD Review',     href: '/pd/review',             icon: 'fas fa-clipboard-check' },
        { key: 'ap-ext-pd',    label: 'External PD',   href: '/appraiser/external-pd', icon: 'fas fa-clipboard-list' },
        { key: 'ap-reports',   label: 'Reports',       href: '/reports',               icon: 'fas fa-file-export' },
      ];
    case 'coach':
      return [
        { key: 'co-home',   label: 'My Teachers',  href: '/coach',      icon: 'fas fa-chalkboard-user' },
        { key: 'pd-review', label: 'PD Review',    href: '/pd/review',  icon: 'fas fa-clipboard-check' },
      ];
    case 'teacher':
      return [
        { key: 't-home',    label: 'My Dashboard',  href: '/teacher',              icon: 'fas fa-gauge' },
        { key: 't-obs',     label: 'Observations',  href: '/teacher/observations', icon: 'fas fa-clipboard-list' },
        { key: 't-focus',   label: 'Focus Areas',   href: '/teacher/focus',        icon: 'fas fa-bullseye' },
        { key: 't-pd',      label: 'My PD LMS',     href: '/teacher/pd',           icon: 'fas fa-graduation-cap' },
        { key: 't-reports', label: 'Exports',       href: '/reports',              icon: 'fas fa-file-export' },
      ];
    default:
      return [];
  }
}

export function Card(props: { id?: string; title?: string; icon?: string; children: any; class?: string; ['data-tour']?: string }) {
  return (
    <section id={props.id} class={`bg-white rounded-lg shadow-sm border border-slate-200 ${props.class || ''} scroll-mt-24`} data-tour={props['data-tour']}>
      {props.title && (
        <header class="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
          {props.icon && <i class={`${props.icon} text-aps-navy`}></i>}
          <h2 class="font-display text-lg text-aps-navy">{props.title}</h2>
        </header>
      )}
      <div class="p-5">{props.children}</div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// DomainTabs — Fix 1 (June 2, 2026 brief)
//
// Sticky tab bar that pivots between the 6 Marshall domains (A–F). Used in
// three places per the brief:
//   • Observation editor (appraiser.tsx)
//   • /admin/pedagogy
//   • /admin/pd  (and /admin/pd/coverage)
//
// Behavior:
//   • Tabs are anchor links (#domain-A, #domain-B ...) so the page is
//     fully usable with JS disabled — clicking a tab scrolls to that domain.
//   • When JS is on (default), tabs.js intercepts clicks, switches "active",
//     and scrolls the section into view smoothly. URL hash stays in sync so
//     a deep-link like /appraiser/observations/42#domain-C works.
//   • Mobile: tabs are horizontally swipeable (overflow-x-auto with
//     snap-x snap-mandatory).
//   • Sticky: stays under the global header while scrolling.
//   • The component renders only the *header* — callers are responsible for
//     rendering one <section id="domain-X" data-domain-section="X"> per
//     domain in document order. tabs.js auto-derives "active" from scroll.
// ---------------------------------------------------------------------------
export function DomainTabs(props: {
  domains: Array<{ id: number; code: string; name: string }>;
  /** Optional id-prefix in case multiple instances co-exist on one page. */
  idPrefix?: string;
  /** Optional className override for the outer wrapper (e.g. for sticky offset tuning). */
  class?: string;
}) {
  const { domains } = props;
  const prefix = props.idPrefix || 'domain';
  return (
    <nav
      class={`aps-domain-tabs sticky top-[56px] sm:top-[64px] z-30 bg-aps-wheat/95 backdrop-blur border-b border-slate-200 -mx-3 sm:-mx-4 px-3 sm:px-4 ${props.class || ''}`}
      role="tablist"
      aria-label="Marshall rubric domains"
      data-domain-tabs="1"
      data-domain-prefix={prefix}
    >
      <div class="overflow-x-auto snap-x snap-mandatory">
        <ul class="flex gap-1 py-2 min-w-max">
          {domains.map((d, idx) => (
            <li class="snap-start">
              <a
                href={`#${prefix}-${d.code}`}
                role="tab"
                data-domain-tab={d.code}
                aria-controls={`${prefix}-${d.code}`}
                aria-selected={idx === 0 ? 'true' : 'false'}
                class={
                  'inline-flex items-center gap-2 whitespace-nowrap px-3 py-2 rounded-md text-sm font-medium border ' +
                  'transition-colors hover:bg-aps-navy hover:text-white ' +
                  (idx === 0
                    ? 'bg-aps-navy text-white border-aps-navy'
                    : 'bg-white text-aps-navy border-slate-300')
                }
              >
                <span class="font-display text-xs px-1.5 py-0.5 rounded bg-aps-gold/20 text-aps-navy">{d.code}</span>
                <span class="hidden sm:inline">{d.name}</span>
                <span class="sm:hidden">Domain {d.code}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

// ============================================================================
// Fix 6 — Unified PD-hours heat-map widget.
// One renderer, three callers (superintendent / appraiser / teacher). Takes
// the rows returned by getTeacherPDHoursSummary() and paints them as a list
// of teacher pills, each colored by the `heat` tier the helper computed.
// The component is purposely presentational — all aggregation logic lives
// in src/lib/db.ts so the heat tiers stay consistent.
// ============================================================================

const HEAT_CLASSES: Record<string, { box: string; bar: string; pill: string; label: string }> = {
  met:  { box: 'bg-emerald-50 border-emerald-200', bar: 'bg-emerald-500', pill: 'bg-emerald-100 text-emerald-900 border-emerald-300', label: 'Met target' },
  near: { box: 'bg-sky-50 border-sky-200',         bar: 'bg-sky-500',     pill: 'bg-sky-100 text-sky-900 border-sky-300',         label: 'Near target' },
  mid:  { box: 'bg-amber-50 border-amber-200',     bar: 'bg-amber-500',   pill: 'bg-amber-100 text-amber-900 border-amber-300',   label: 'In progress' },
  low:  { box: 'bg-red-50 border-red-200',         bar: 'bg-red-500',     pill: 'bg-red-100 text-red-900 border-red-300',         label: 'Behind target' },
};

export function PDHoursHeatMap(props: {
  target: number;
  rows: Array<{
    teacher_id: number;
    first_name: string;
    last_name: string;
    school_name?: string | null;
    internal_hours: number;
    external_hours: number;
    total_hours: number;
    pct_of_target: number;
    heat: 'low' | 'mid' | 'near' | 'met';
  }>;
  /** When true, suppresses the teacher's name and links — used for the
   *  single-row teacher self-view where their identity is implicit. */
  selfView?: boolean;
  /** Link prefix for each tile when not in selfView (e.g. '/appraiser/teachers') */
  linkPrefix?: string;
  /** Hide the legend (used when embedded in a card that already explains the colors). */
  hideLegend?: boolean;
}) {
  const target = Number(props.target || 0);
  const rows = props.rows || [];
  // District / school-wide roll-up totals to show above the grid.
  const totals = rows.reduce(
    (acc, r) => {
      acc.internal += Number(r.internal_hours || 0);
      acc.external += Number(r.external_hours || 0);
      acc.total    += Number(r.total_hours || 0);
      if (r.heat === 'met') acc.met += 1;
      return acc;
    },
    { internal: 0, external: 0, total: 0, met: 0 }
  );
  const groupCount: Record<string, number> = { low: 0, mid: 0, near: 0, met: 0 };
  for (const r of rows) groupCount[r.heat] = (groupCount[r.heat] || 0) + 1;

  return (
    <div>
      {!props.selfView && (
        <div class="grid sm:grid-cols-4 gap-2 mb-3 text-center text-xs">
          {(['met','near','mid','low'] as const).map((k) => (
            <div class={`rounded-md border p-2 ${HEAT_CLASSES[k].box}`}>
              <div class="text-lg font-bold">{groupCount[k] || 0}</div>
              <div class="text-[11px] uppercase tracking-wide">{HEAT_CLASSES[k].label}</div>
            </div>
          ))}
        </div>
      )}
      {!props.selfView && (
        <div class="mb-3 text-xs text-slate-600">
          Target: <strong>{target.toFixed(2)}h</strong> · District total: <strong>{totals.total.toFixed(2)}h</strong>
          {' '}(<span class="text-aps-blue">{totals.internal.toFixed(2)}h internal</span>
          {' + '}<span class="text-amber-700">{totals.external.toFixed(2)}h external</span>)
          {' · '}<strong class="text-emerald-700">{totals.met}</strong> of {rows.length} teachers have met their goal.
        </div>
      )}

      {rows.length === 0 ? (
        <p class="text-sm text-slate-500 italic">No teachers in scope.</p>
      ) : (
        <div class="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {rows.map((r) => {
            const cls = HEAT_CLASSES[r.heat] || HEAT_CLASSES.low;
            const pct = Math.min(1, Math.max(0, Number(r.pct_of_target || 0)));
            const barWidth = `${(pct * 100).toFixed(1)}%`;
            const Inner = (
              <div class={`p-3 rounded border ${cls.box} block`}>
                {!props.selfView && (
                  <div class="flex items-start justify-between gap-2 mb-1">
                    <div class="min-w-0">
                      <div class="font-medium text-aps-navy text-sm truncate">{r.first_name} {r.last_name}</div>
                      <div class="text-xs text-slate-500 truncate">{r.school_name || ''}</div>
                    </div>
                    <span class={`shrink-0 text-[11px] px-2 py-0.5 rounded-full border ${cls.pill}`}>{cls.label}</span>
                  </div>
                )}
                <div class="flex items-baseline justify-between text-sm">
                  <span><strong class="tabular-nums">{Number(r.total_hours || 0).toFixed(2)}h</strong> <span class="text-xs text-slate-500">/ {target.toFixed(2)}h</span></span>
                  <span class="text-xs tabular-nums">{(pct * 100).toFixed(0)}%</span>
                </div>
                <div class="mt-1 h-2 rounded-full bg-white/70 overflow-hidden border border-white">
                  <div class={`h-full ${cls.bar}`} style={`width:${barWidth}`}></div>
                </div>
                <div class="mt-1 text-[11px] text-slate-600">
                  <span class="text-aps-blue">{Number(r.internal_hours || 0).toFixed(2)}h internal</span>
                  {' · '}
                  <span class="text-aps-navy">{Number(r.external_hours || 0).toFixed(2)}h external</span>
                </div>
              </div>
            );
            return props.linkPrefix && !props.selfView ? (
              <a href={`${props.linkPrefix}/${r.teacher_id}`} class="block hover:opacity-90 transition">{Inner}</a>
            ) : Inner;
          })}
        </div>
      )}

      {!props.hideLegend && !props.selfView && (
        <p class="text-[11px] text-slate-500 mt-3">
          <i class="fas fa-circle-info mr-1"></i>
          Heat-map combines verified internal-LMS PD (with hours credited at verification time) and approved external PD.
          {' '}Target is admin-editable in <a href="/admin/settings/pd-hours" class="text-aps-blue hover:underline">Admin → PD-hours target</a>.
        </p>
      )}
    </div>
  );
}

export function Button(props: { href?: string; onClick?: string; variant?: 'primary'|'secondary'|'danger'|'ghost'; children: any; type?: string; class?: string; name?: string; value?: string; formaction?: string }) {
  const variantClass = {
    primary:  'bg-aps-navy text-white hover:bg-aps-blue',
    secondary:'bg-white text-aps-navy border border-aps-navy hover:bg-slate-50',
    danger:   'bg-red-700 text-white hover:bg-red-800',
    ghost:    'bg-transparent text-aps-navy hover:bg-slate-100',
  }[props.variant || 'primary'];
  const cls = `inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${variantClass} ${props.class || ''}`;
  if (props.href) return <a href={props.href} class={cls}>{props.children}</a>;
  return <button type={(props.type as any) || 'button'} class={cls} onclick={props.onClick} name={props.name} value={props.value} formaction={props.formaction}>{props.children}</button>;
}
