import { Hono } from 'hono';
import type { Bindings, Variables } from '../lib/types';
import { Layout, Card, Button } from '../lib/layout';
import { requireAuth, hashPassword, verifyPassword, getCurrentUser } from '../lib/auth';
import { logActivity } from '../lib/db';
import { NOTIFICATION_KINDS, getPreferences, setPreference, getUserSettings, setUserSettings } from '../lib/notifications';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', requireAuth());

app.get('/', async (c) => {
  const user = c.get('user')!;
  const first = c.req.query('first');
  const err = c.req.query('err');
  const msg = c.req.query('msg');
  const prefs = await getPreferences(c.env.DB, user.id);
  const settings = await getUserSettings(c.env.DB, user.id);
  // Only show kinds that apply to this role (or super_admin sees all)
  const kinds = NOTIFICATION_KINDS.filter((k) =>
    user.role === 'super_admin' || k.appliesToRoles.includes(user.role)
  );
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
  // Per-kind
  const kinds = NOTIFICATION_KINDS.filter((k) =>
    user.role === 'super_admin' || k.appliesToRoles.includes(user.role)
  );
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
        <div class="mb-4 p-3 rounded bg-amber-50 border border-amber-200 text-amber-900 text-sm">
          <i class="fas fa-triangle-exclamation mr-2"></i>
          Welcome. For security, please set a new password before you continue.
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
          <form method="post" action="/profile/password" class="space-y-4">
            {!user.must_change_password && (
              <Field label="Current password" name="current_password" type="password" autocomplete="current-password" />
            )}
            <Field label="New password" name="new_password" type="password" autocomplete="new-password" hint="Minimum 8 characters." />
            <Field label="Confirm new password" name="confirm_password" type="password" autocomplete="new-password" />
            <Button type="submit" variant="primary"><i class="fas fa-shield-halved"></i>Update password</Button>
          </form>
        </Card>
      </div>

      <Card title="Notifications" icon="fas fa-bell" class="mt-6" id="notifications">
        <p class="text-sm text-slate-700 mb-3">
          The bell in the header keeps a full history of every alert. <strong>Web Push</strong> delivers notifications to your devices
          (phone, tablet, laptop) even when this tab isn't open — at zero cost to the district, using the browser standard.
        </p>

        <form method="post" action="/profile/notifications" class="space-y-4">
          {/* Master kill-switches */}
          <div class="p-3 rounded-md border border-aps-navy/30 bg-aps-navy/[0.03]">
            <div class="text-xs font-semibold uppercase tracking-wide text-aps-navy mb-2"><i class="fas fa-sliders mr-1"></i>Master switches</div>
            <div class="grid sm:grid-cols-2 gap-3 text-sm">
              <label class="flex items-start gap-2 p-2 rounded border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" name="master_in_app" value="1" checked={settings.in_app_enabled} class="mt-1" />
                <span>
                  <span class="block font-medium text-slate-800"><i class="fas fa-bell mr-1 text-aps-navy"></i>In-app notifications</span>
                  <span class="block text-xs text-slate-500">When off, your bell stays empty and no new rows are written. Existing history is preserved.</span>
                </span>
              </label>
              <label class="flex items-start gap-2 p-2 rounded border border-slate-200 bg-white hover:bg-slate-50 cursor-pointer">
                <input type="checkbox" name="master_push" value="1" checked={settings.push_enabled} class="mt-1" />
                <span>
                  <span class="block font-medium text-slate-800"><i class="fas fa-mobile-screen-button mr-1 text-aps-navy"></i>Web push to my devices</span>
                  <span class="block text-xs text-slate-500">One-click silence for every enrolled device. Flip back on any time — your device list is kept.</span>
                </span>
              </label>
            </div>
          </div>

          {/* Device roster — only rendered if user has any subscriptions */}
          <div class="p-3 rounded-md border border-slate-200 bg-slate-50">
            <div class="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div class="text-xs font-semibold uppercase tracking-wide text-slate-700">
                <i class="fas fa-display mr-1"></i>Your push devices ({pushDevices.length})
              </div>
              <button type="button" class="text-xs px-2 py-1 rounded bg-aps-navy text-white hover:bg-aps-blue"
                onclick="(async()=>{try{if(!('serviceWorker' in navigator)||!('PushManager' in window)){alert('This browser does not support Web Push.');return;}const reg=await navigator.serviceWorker.ready;let s=await reg.pushManager.getSubscription();if(s){alert('Push is already enabled on this device.');return;}if(Notification.permission==='denied'){alert('Browser notifications are blocked. Re-enable them in site settings first.');return;}if(Notification.permission!=='granted'){const p=await Notification.requestPermission();if(p!=='granted')return;}const kr=await fetch('/api/push/public-key',{credentials:'include'});if(!kr.ok){alert('Could not fetch push key.');return;}const {publicKey}=await kr.json();function u8(b){const pad='='.repeat((4-b.length%4)%4);const b64=(b+pad).replace(/-/g,'+').replace(/_/g,'/');const r=atob(b64);const o=new Uint8Array(r.length);for(let i=0;i<r.length;i++)o[i]=r.charCodeAt(i);return o;}s=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:u8(publicKey)});await fetch('/api/push/subscribe',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify(s.toJSON?s.toJSON():s)});alert('Push enabled on this device.');location.reload();}catch(e){alert('Could not enable push: '+(e&&e.message||e));}})()">
                <i class="fas fa-plus mr-1"></i>Enable on this device
              </button>
            </div>
            {pushDevices.length === 0 ? (
              <p class="text-xs text-slate-500 italic">No devices yet. Click the button above on any phone, tablet, or computer to start getting system notifications there.</p>
            ) : (
              <ul class="space-y-1 text-xs">
                {pushDevices.map((d: any) => (
                  <li class="flex items-center justify-between gap-2 p-2 rounded bg-white border border-slate-200">
                    <div class="min-w-0">
                      <div class="text-slate-700 truncate">{d.user_agent || 'Unknown device'}</div>
                      <div class="text-slate-400">Added {d.created_at ? String(d.created_at).slice(0,16) : '—'}{d.last_used_at ? ` · last ping ${String(d.last_used_at).slice(0,16)}` : ''}</div>
                    </div>
                    <button type="button" class="text-rose-700 hover:underline"
                      onclick={`if(confirm('Remove this device? It will stop getting push notifications.'))fetch('/profile/notifications/devices/${d.id}/revoke',{method:'POST',credentials:'include'}).then(()=>location.reload())`}>
                      <i class="fas fa-trash mr-1"></i>Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Per-kind table */}
          {notifKinds.length === 0 ? <p class="text-xs text-slate-500">No role-specific notification kinds.</p> : (
            <div>
              <div class="text-xs font-semibold uppercase tracking-wide text-slate-700 mb-2"><i class="fas fa-list-check mr-1"></i>Per-event controls</div>
              <div class="overflow-x-auto rounded border border-slate-200">
                <table class="w-full text-sm">
                  <thead class="text-xs text-slate-500 text-left bg-slate-50">
                    <tr>
                      <th class="py-2 pl-3 pr-2">Event</th>
                      <th class="py-2 px-2 text-center w-24">In-app bell</th>
                      <th class="py-2 px-2 text-center w-24">Web push</th>
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
                An event fires a push only when <em>both</em> the master push switch AND its row are on. The master switches win.
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
          <button type="button"
            class="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-white text-aps-navy border border-aps-navy hover:bg-slate-50"
            onclick="try{localStorage.removeItem('aps_tour_autolaunch_done');localStorage.removeItem('aps_tour_autolaunch_user');alert('The guided tour will auto-launch again the next time you sign in.');}catch(e){}">
            <i class="fas fa-rotate-right"></i>Re-enable auto-launch on next login
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
