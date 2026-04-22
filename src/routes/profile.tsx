import { Hono } from 'hono';
import type { Bindings, Variables } from '../lib/types';
import { Layout, Card, Button } from '../lib/layout';
import { requireAuth, hashPassword, verifyPassword, getCurrentUser } from '../lib/auth';
import { logActivity } from '../lib/db';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', requireAuth());

app.get('/', async (c) => {
  const user = c.get('user')!;
  const first = c.req.query('first');
  const err = c.req.query('err');
  const msg = c.req.query('msg');
  return c.html(<ProfilePage user={user} first={!!first} err={err} msg={msg} />);
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

function ProfilePage(props: { user: any; first?: boolean; err?: string; msg?: string }) {
  const { user, first, err, msg } = props;
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
