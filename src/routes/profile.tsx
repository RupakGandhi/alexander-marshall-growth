import { Hono } from 'hono';
import type { Bindings, Variables } from '../lib/types';
import { Layout, Card, Button } from '../lib/layout';
import { requireAuth, hashPassword, verifyPassword, getCurrentUser } from '../lib/auth';
import { logActivity } from '../lib/db';
import { NOTIFICATION_KINDS, getPreferences, setPreference, getUserSettings, setUserSettings } from '../lib/notifications';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', requireAuth());

// Sept 23, 2026 (R5b): compute the set of notification kinds this user
// should be able to configure.  A pure teacher sees teacher kinds; a pure
// coach sees coach kinds; a super_admin sees everything.  A TEACHER-COACH
// (role='teacher' with can_coach=1) is a real combined account and gets the
// union — their existing teacher preferences (observation_published,
// focus_area_*, coach_note as recipient, etc.) are preserved AND the coach-
// side kinds (pd_deliverable_submitted) show up so they can opt in/out of
// the coach-inbox pings.  We deliberately do NOT reset any preference row —
// this only widens the visible set on the profile page.
function kindsFor(user: { role: string; can_coach?: number }) {
  return NOTIFICATION_KINDS.filter((k) => {
    if (user.role === 'super_admin') return true;
    if (k.appliesToRoles.includes(user.role)) return true;
    // Teacher-coaches see coach-side kinds as well.
    if (user.role === 'teacher' && user.can_coach === 1 && k.appliesToRoles.includes('coach')) return true;
    return false;
  });
}

app.get('/', async (c) => {
  const user = c.get('user')!;
  const first = c.req.query('first');
  const err = c.req.query('err');
  const msg = c.req.query('msg');
  const prefs = await getPreferences(c.env.DB, user.id);
  const settings = await getUserSettings(c.env.DB, user.id);
  const kinds = kindsFor(user);
  // Devices (with user agent hint + age) so user can audit & revoke
  const devs = await c.env.DB.prepare(
    `SELECT id, user_agent, created_at, last_used_at FROM push_subscriptions WHERE user_id = ? ORDER BY last_used_at DESC, created_at DESC`
  ).bind(user.id).all();
  return c.html(<ProfilePage user={user} first={!!first} err={err} msg={msg}
    notifKinds={kinds} notifPrefs={prefs} settings={settings}
    pushDevices={(devs.results as any[]) || []} />);
});

app.post('/notifications', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody({ all: true });
  // Master switches
  const masterPush  = body.master_push  ? true : false;
  const masterInApp = body.master_in_app ? true : false;
  await setUserSettings(c.env.DB, user.id, masterPush, masterInApp);
  // Per-kind (union for teacher-coaches — see kindsFor helper above).
  const kinds = kindsFor(user);
  for (const k of kinds) {
    const inApp = body[`in_app_${k.kind}`] ? true : false;
    const push  = body[`push_${k.kind}`]   ? true : false;
    await setPreference(c.env.DB, user.id, k.kind, inApp, push);
  }
  await logActivity(c.env.DB, user.id, 'user', user.id, 'notification_prefs_update');
  return c.redirect('/profile?msg=Notification+preferences+saved#notifications');
});

// Revoke a single device (server-side delete; the device itself is also
// invited to unsubscribe client-side via /api/push/unsubscribe)
app.post('/notifications/devices/:id/revoke', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare(
    `DELETE FROM push_subscriptions WHERE id = ? AND user_id = ?`
  ).bind(id, user.id).run();
  await logActivity(c.env.DB, user.id, 'user', user.id, 'push_device_revoke', { id });
  if (c.req.header('Accept') === 'application/json') return c.json({ ok: true });
  return c.redirect('/profile?msg=Device+removed#notifications');
});

app.post('/', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const first_name = String(body.first_name || user.first_name).trim();
  const last_name = String(body.last_name || user.last_name).trim();
  const phone = String(body.phone || '').trim() || null;
  const title = String(body.title || '').trim() || null;
  await c.env.DB.prepare(
    'UPDATE users SET first_name=?, last_name=?, phone=?, title=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
  ).bind(first_name, last_name, phone, title, user.id).run();
  await logActivity(c.env.DB, user.id, 'user', user.id, 'profile_update');
  return c.redirect('/profile?msg=Profile+updated');
});

app.post('/password', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const current = String(body.current_password || '');
  const next = String(body.new_password || '');
  const confirm = String(body.confirm_password || '');
  if (next.length < 8) return c.redirect('/profile?err=Password+must+be+at+least+8+characters');
  if (next !== confirm) return c.redirect('/profile?err=New+passwords+do+not+match');

  // For forced-change scenario, allow skip of current password verification ONLY if must_change_password=1
  const fresh = await c.env.DB.prepare('SELECT password_hash, must_change_password FROM users WHERE id = ?').bind(user.id).first<any>();
  const force = fresh?.must_change_password === 1;
  if (!force) {
    if (!current) return c.redirect('/profile?err=Current+password+required');
    const ok = await verifyPassword(current, fresh.password_hash);
    if (!ok) return c.redirect('/profile?err=Current+password+incorrect');
  }
  const hash = await hashPassword(next);
  await c.env.DB.prepare(
    'UPDATE users SET password_hash = ?, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(hash, user.id).run();
  await logActivity(c.env.DB, user.id, 'user', user.id, 'password_change');
  return c.redirect('/profile?msg=Password+updated');
});

export default app;

function deviceLabel(agent: string | null) {
  const ua = agent || '';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox'
    : /Chrome|CriOS/.test(ua) ? 'Chrome' : /Safari/.test(ua) ? 'Safari' : 'Browser';
  const os = /iPad/.test(ua) ? 'iPad' : /iPhone/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android'
    : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

function ProfilePage(props: { user: any; first?: boolean; err?: string; msg?: string;
                              notifKinds?: any[]; notifPrefs?: Record<string, { in_app: boolean; push: boolean }>;
                              settings?: { push_enabled: boolean; in_app_enabled: boolean };
                              pushDevices?: any[] }) {
  const { user, first, err, msg, notifKinds = [], notifPrefs = {},
          settings = { push_enabled: true, in_app_enabled: true },
          pushDevices = [] } = props;
  return (
    <Layout title="Profile" user={user}>
      <h1 class="font-display text-2xl text-aps-navy mb-4">Profile &amp; Password</h1>
      {first && (
        <div class="mb-4 p-3 rounded bg-sky-50 border border-sky-200 text-sky-900 text-sm">
          <i class="fas fa-circle-info mr-2"></i>
          Welcome! Changing your password is optional — you can keep the district default
          or pick your own below. Either works for sign-in.
        </div>
      )}
      {err && <div class="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-800 text-sm">{err}</div>}
      {msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}

      <div class="grid md:grid-cols-2 gap-6">
        <Card title="Your Information" icon="fas fa-user">
          <form method="post" action="/profile" class="space-y-4">
            <div class="grid grid-cols-2 gap-3">
              <Field label="First name" name="first_name" value={user.first_name} />
              <Field label="Last name" name="last_name" value={user.last_name} />
            </div>
            <Field label="Title" name="title" value={user.title || ''} placeholder="e.g. 2nd Grade, Elementary Principal" />
            <Field label="Phone" name="phone" value={user.phone || ''} />
            <div class="text-sm text-slate-500">
              <div><span class="font-medium">Email:</span> {user.email} (managed by administrator)</div>
              <div><span class="font-medium">Role:</span> {user.role}</div>
            </div>
            <Button type="submit" variant="primary"><i class="fas fa-save"></i>Save profile</Button>
          </form>
        </Card>

        <Card title="Change Password" icon="fas fa-key">
          <div class="p-3 mb-3 rounded bg-sky-50 border border-sky-200 text-sky-900 text-xs">
            <i class="fas fa-circle-info mr-1"></i>
            Changing your password is <strong>optional</strong>. You can keep
            the district default (<code class="bg-white border border-sky-200 rounded px-1 py-0.5">Alexander2026!</code>)
            or pick your own below. The password eye icon lets you see what
            you've typed.
          </div>
          <form method="post" action="/profile/password" class="space-y-4" id="aps-profile-pw-form">
            <PasswordField id="aps-cur-pw" label="Current password" name="current_password" autocomplete="current-password" />
            <PasswordField id="aps-new-pw" label="New password" name="new_password" autocomplete="new-password" hint="Minimum 8 characters." />
            <PasswordField id="aps-new-pw2" label="Confirm new password" name="confirm_password" autocomplete="new-password" />
            <div id="aps-new-pw-match" class="text-xs min-h-[1rem]"></div>
            <Button type="submit" variant="primary" id="aps-profile-pw-submit"><i class="fas fa-shield-halved"></i>Update password</Button>
          </form>
          {/* UX: eye-toggle on every password field, live match indicator,
              submit stays disabled until both fields are ≥ 8 chars and match. */}
          <script dangerouslySetInnerHTML={{ __html: `
            (function(){
              // Generic eye-toggle — attach to any button with data-eye-for pointing at an input id.
              document.querySelectorAll('button[data-eye-for]').forEach(function(btn){
                var id = btn.getAttribute('data-eye-for');
                var input = document.getElementById(id);
                if (!input) return;
                btn.addEventListener('click', function(){
                  if (input.type === 'password') { input.type = 'text';  btn.innerHTML = '<i class="fas fa-eye-slash"></i>'; btn.setAttribute('aria-label','Hide password'); }
                  else                           { input.type = 'password'; btn.innerHTML = '<i class="fas fa-eye"></i>';       btn.setAttribute('aria-label','Show password'); }
                });
              });
              var pw  = document.getElementById('aps-new-pw');
              var pw2 = document.getElementById('aps-new-pw2');
              var match = document.getElementById('aps-new-pw-match');
              var btn = document.getElementById('aps-profile-pw-submit');
              if (!pw || !pw2 || !match || !btn) return;
              function update(){
                var a = pw.value, b = pw2.value;
                var longEnough = a.length >= 8;
                var matches = a === b && a.length > 0;
                if (!a) { match.textContent = ''; match.className = 'text-xs min-h-[1rem]'; }
                else if (!longEnough) { match.textContent = 'At least 8 characters.'; match.className = 'text-xs min-h-[1rem] text-amber-700'; }
                else if (!b) { match.textContent = 'Type the new password again to confirm.'; match.className = 'text-xs min-h-[1rem] text-slate-500'; }
                else if (!matches) { match.textContent = '✗ Passwords do not match.'; match.className = 'text-xs min-h-[1rem] text-red-700'; }
                else { match.textContent = '✓ Passwords match.'; match.className = 'text-xs min-h-[1rem] text-emerald-700'; }
                btn.disabled = !(longEnough && matches);
              }
              pw.addEventListener('input', update);
              pw2.addEventListener('input', update);
              update();
            })();
          `}} />
        </Card>
      </div>

      <Card title="Notifications" icon="fas fa-bell" class="mt-6" id="notifications">
        <form method="post" action="/profile/notifications" class="space-y-4" id="aps-notification-settings">
          <div class="grid sm:grid-cols-2 gap-3 text-sm">
            <label class="flex items-start gap-2 p-3 rounded border border-slate-200">
              <input type="checkbox" name="master_in_app" value="1" checked={settings.in_app_enabled} class="mt-1" />
              <span>
                <span class="block font-medium text-slate-800">In-app bell</span>
                <span class="block text-xs text-slate-600">Show new alerts in the bell at the top of the platform.</span>
              </span>
            </label>
            <div class="p-3 rounded border border-slate-200">
              <label class="flex items-start gap-2">
                <input type="checkbox" id="aps-device-alerts" disabled class="mt-1"
                  aria-describedby="aps-device-status" data-account-muted={settings.push_enabled ? '0' : '1'} />
                <span class="font-medium text-slate-800">Device alerts on this browser</span>
              </label>
              <p class="ml-5 mt-1 text-xs text-slate-600" id="aps-device-status" role="status" aria-live="polite">Checking this browser…</p>
              <button type="button" id="aps-device-test" hidden class="ml-5 mt-2 text-xs text-aps-navy underline">Send a test alert</button>
              <noscript><p class="text-xs text-slate-600">Enable JavaScript to manage alerts on this browser.</p></noscript>
            </div>
          </div>

          <details class="text-sm" open={!settings.push_enabled}>
            <summary class="cursor-pointer text-aps-navy font-medium">Manage device alerts</summary>
            <div class="pl-3 pt-3 space-y-3">
              <label class="flex items-center gap-2">
                <input type="checkbox" name="master_push" value="1" checked={settings.push_enabled} />
                Allow device alerts for my account
              </label>
              <p class="text-xs text-slate-600">Turn this off to pause alerts on all enrolled devices. Save notification settings to apply.</p>
              <ul id="aps-enrolled-devices" class="space-y-1 text-xs">
                {pushDevices.map((d: any) => (
                  <li data-device-id={String(d.id)} class="flex items-center justify-between gap-2 py-1">
                    <span class="min-w-0 break-words" data-device-name>{deviceLabel(d.user_agent)}</span>
                    <button type="button" data-device-revoke={String(d.id)} class="text-rose-700 hover:underline">Remove</button>
                  </li>
                ))}
              </ul>
              <p id="aps-device-management-status" class="text-xs text-slate-600" role="status"></p>
            </div>
          </details>

          {/* Per-kind table */}
          {notifKinds.length === 0 ? <p class="text-xs text-slate-500">No role-specific notification kinds.</p> : (
            <div>
              <div class="text-xs font-semibold uppercase tracking-wide text-slate-700 mb-2"><i class="fas fa-list-check mr-1"></i>Alerts by event</div>
              <div class="overflow-x-auto rounded border border-slate-200">
                <table class="w-full text-sm">
                  <thead class="text-xs text-slate-500 text-left bg-slate-50">
                    <tr>
                      <th class="py-2 pl-3 pr-2">Event</th>
                      <th class="py-2 px-2 text-center w-24">In-app bell</th>
                      <th class="py-2 px-2 text-center w-24">Device alerts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifKinds.map((k: any) => {
                      const p = notifPrefs[k.kind] || { in_app: true, push: k.defaultPush };
                      return (
                        <tr class="border-t border-slate-100">
                          <td class="py-2 pl-3 pr-2">
                            <div class="text-slate-800 font-medium"><i class={`fas ${k.defaultIcon} mr-1 text-aps-navy`}></i>{k.label}</div>
                            <div class="text-xs text-slate-500">{k.description}</div>
                          </td>
                          <td class="py-2 px-2 text-center"><input type="checkbox" name={`in_app_${k.kind}`} value="1" checked={p.in_app} /></td>
                          <td class="py-2 px-2 text-center"><input type="checkbox" name={`push_${k.kind}`}  value="1" checked={p.push} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p class="text-[11px] text-slate-500 mt-2">
                Choose where to receive each event. Save notification settings to apply changes to the bell, your account, and the event list.
              </p>
            </div>
          )}

          <div class="pt-1 flex items-center gap-2">
            <Button type="submit" variant="primary"><i class="fas fa-save"></i>Save notification settings</Button>
          </div>
        </form>
      </Card>

      <Card title="Guided Tour" icon="fas fa-compass" class="mt-6">
        <p class="text-sm text-slate-700 mb-3">
          Want a walkthrough of every feature available to your account? The guided tour highlights each part of the site, step by step, customized for your role.
        </p>
        <p class="text-xs text-slate-500 mb-3">
          You can also relaunch the tour any time from the <strong>Guided Tour</strong> button in the top navigation, or from the menu under your initials in the upper-right.
        </p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="aps-tour-nav-btn" onclick="window.APSGuidedTour && window.APSGuidedTour.start()">
            <i class="fas fa-play"></i>Start the tour
          </button>

        </div>
      </Card>
    </Layout>
  );
}

function Field(props: { label: string; name: string; value?: string; type?: string; autocomplete?: string; placeholder?: string; hint?: string }) {
  return (
    <label class="block">
      <span class="block text-sm font-medium text-slate-700 mb-1">{props.label}</span>
      <input name={props.name} type={props.type || 'text'} value={props.value || ''} autocomplete={props.autocomplete} placeholder={props.placeholder}
        class="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-aps-blue" />
      {props.hint && <span class="block text-xs text-slate-500 mt-1">{props.hint}</span>}
    </label>
  );
}

// PasswordField: a text field plus an "eye" icon so the user can see what
// they're typing (reduces typos during sign-in and change-password).
function PasswordField(props: { id: string; label: string; name: string; autocomplete?: string; hint?: string; required?: boolean }) {
  return (
    <label class="block">
      <span class="block text-sm font-medium text-slate-700 mb-1">{props.label}</span>
      <div class="relative">
        <input id={props.id} name={props.name} type="password" autocomplete={props.autocomplete}
          class="w-full border border-slate-300 rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-aps-blue" />
        <button type="button" data-eye-for={props.id}
          class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 p-1"
          aria-label="Show password" title="Show / hide password">
          <i class="fas fa-eye"></i>
        </button>
      </div>
      {props.hint && <span class="block text-xs text-slate-500 mt-1">{props.hint}</span>}
    </label>
  );
}
