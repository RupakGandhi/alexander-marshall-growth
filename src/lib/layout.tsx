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
        <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
        <meta name="theme-color" content="#0b2545" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="manifest" href="/static/manifest.json" />
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
      <body class="bg-aps-wheat min-h-screen font-sans text-slate-800">
        {nav}
        <main class="max-w-7xl mx-auto px-4 py-6">{children}</main>
        <footer class="max-w-7xl mx-auto px-4 py-6 text-xs text-slate-500 flex flex-wrap gap-3 justify-between items-center">
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
    <header class="bg-aps-navy text-white shadow-md sticky top-0 z-40">
      <div class="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-4">
        <a href={roleHomeUrl(user.role)} class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-full bg-aps-gold text-aps-navy font-display font-bold flex items-center justify-center text-lg">A</div>
          <div class="leading-tight">
            <div class="font-display text-lg">Alexander Public Schools</div>
            <div class="text-xs text-aps-sky">Marshall Growth Platform</div>
          </div>
        </a>
        <nav class="hidden md:flex items-center gap-1" data-tour="main-nav">
          {nav.map((item) => (
            <a href={item.href} class={`px-3 py-2 rounded text-sm hover:bg-aps-blue ${active === item.key ? 'bg-aps-blue' : ''}`}>
              <i class={`${item.icon} mr-2`}></i>{item.label}
            </a>
          ))}
        </nav>
        <div class="flex items-center gap-3">
          {/* Guided Tour launcher — visible on every page, every role */}
          <button
            type="button"
            class="aps-tour-nav-btn hidden sm:inline-flex"
            title="Open the guided walkthrough for your role"
            onclick="window.APSGuidedTour && window.APSGuidedTour.start()"
          >
            <i class="fas fa-compass"></i>Guided Tour
          </button>
          <div class="text-right hidden sm:block">
            <div class="text-sm font-medium">{user.first_name} {user.last_name}</div>
            <div class="text-xs text-aps-sky">{roleLabel(user.role)}</div>
          </div>
          <div class="relative" id="user-menu-root">
            <button type="button" id="user-menu-btn" onclick="window.toggleUserMenu && window.toggleUserMenu(event)" class="w-9 h-9 rounded-full bg-aps-sky text-aps-navy font-bold flex items-center justify-center hover:ring-2 hover:ring-white focus:outline-none focus:ring-2 focus:ring-white" aria-label="User menu" aria-haspopup="true" aria-expanded="false">
              {user.first_name[0]}{user.last_name[0]}
            </button>
            <div id="user-menu-panel" class="absolute right-0 mt-1 w-56 bg-white text-slate-800 rounded-md shadow-xl hidden z-50 border border-slate-200">
              <div class="px-4 py-2 border-b border-slate-200">
                <div class="text-sm font-semibold text-aps-navy">{user.first_name} {user.last_name}</div>
                <div class="text-xs text-slate-500">{roleLabel(user.role)}</div>
              </div>
              <button type="button" class="block w-full text-left px-4 py-2 hover:bg-slate-100 text-sm" onclick="window.APSGuidedTour && window.APSGuidedTour.start()">
                <i class="fas fa-compass mr-2"></i>Guided Tour
              </button>
              <a class="block px-4 py-2 hover:bg-slate-100 text-sm" href="/profile"><i class="fas fa-user-gear mr-2"></i>Profile &amp; Password</a>
              <form method="post" action="/logout"><button class="block w-full text-left px-4 py-2 hover:bg-slate-100 text-sm text-red-700"><i class="fas fa-sign-out-alt mr-2"></i>Sign out</button></form>
            </div>
          </div>
        </div>
      </div>
      <nav class="md:hidden bg-aps-blue text-white overflow-x-auto">
        <div class="flex gap-1 px-2 py-1">
          {nav.map((item) => (
            <a href={item.href} class={`whitespace-nowrap px-3 py-2 rounded text-sm ${active === item.key ? 'bg-aps-navy' : ''}`}>
              <i class={`${item.icon} mr-1`}></i>{item.label}
            </a>
          ))}
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
        { key: 'admin-framework',label: 'Framework',         href: '/admin/framework',    icon: 'fas fa-list-check' },
        { key: 'admin-import',   label: 'Bulk Import',       href: '/admin/import/users', icon: 'fas fa-file-import' },
        { key: 'admin-reports',  label: 'Reports',           href: '/reports',            icon: 'fas fa-file-export' },
        { key: 'admin-district', label: 'District',          href: '/admin/district',     icon: 'fas fa-building-columns' },
      ];
    case 'superintendent':
      return [
        { key: 'supt-home',   label: 'District Overview', href: '/superintendent',          icon: 'fas fa-gauge' },
        { key: 'supt-schools',label: 'By School',         href: '/superintendent/schools',  icon: 'fas fa-school' },
        { key: 'supt-teacher',label: 'By Teacher',        href: '/superintendent/teachers', icon: 'fas fa-chalkboard-user' },
        { key: 'supt-reports',label: 'Reports',           href: '/reports',                 icon: 'fas fa-file-export' },
      ];
    case 'appraiser':
      return [
        { key: 'ap-home',    label: 'My Teachers',    href: '/appraiser',             icon: 'fas fa-chalkboard-user' },
        { key: 'ap-obs',     label: 'Observations',   href: '/appraiser/observations',icon: 'fas fa-clipboard-list' },
        { key: 'ap-reports', label: 'Reports',        href: '/reports',               icon: 'fas fa-file-export' },
      ];
    case 'coach':
      return [
        { key: 'co-home',  label: 'My Teachers',    href: '/coach',                 icon: 'fas fa-chalkboard-user' },
      ];
    case 'teacher':
      return [
        { key: 't-home',    label: 'My Dashboard',   href: '/teacher',                icon: 'fas fa-gauge' },
        { key: 't-obs',     label: 'Observations',   href: '/teacher/observations',   icon: 'fas fa-clipboard-list' },
        { key: 't-focus',   label: 'Focus Areas',    href: '/teacher/focus',          icon: 'fas fa-bullseye' },
        { key: 't-reports', label: 'Exports',        href: '/reports',                icon: 'fas fa-file-export' },
      ];
    default:
      return [];
  }
}

export function Card(props: { title?: string; icon?: string; children: any; class?: string; ['data-tour']?: string }) {
  return (
    <section class={`bg-white rounded-lg shadow-sm border border-slate-200 ${props.class || ''}`} data-tour={props['data-tour']}>
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
