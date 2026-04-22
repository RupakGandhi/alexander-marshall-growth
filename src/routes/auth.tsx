import { Hono } from 'hono';
import type { Bindings, Variables } from '../lib/types';
import { Layout } from '../lib/layout';
import { verifyPassword, createSession, destroySession, getCurrentUser } from '../lib/auth';
import { logActivity } from '../lib/db';
import { roleHomeUrl } from '../lib/layout';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.get('/login', async (c) => {
  const user = await getCurrentUser(c);
  if (user) return c.redirect(roleHomeUrl(user.role));
  const err = c.req.query('err');
  const msg = c.req.query('msg');
  return c.html(<LoginPage err={err} msg={msg} />);
});

app.post('/login', async (c) => {
  const body = await c.req.parseBody();
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return c.redirect('/login?err=Missing+credentials');

  const u = await c.env.DB.prepare('SELECT * FROM users WHERE lower(email) = ? AND active = 1').bind(email).first<any>();
  if (!u) return c.redirect('/login?err=Invalid+email+or+password');
  const ok = await verifyPassword(password, u.password_hash);
  if (!ok) return c.redirect('/login?err=Invalid+email+or+password');

  await createSession(c, u.id);
  await c.env.DB.prepare('UPDATE users SET last_login_at = CURRENT_TIMESTAMP WHERE id = ?').bind(u.id).run();
  await logActivity(c.env.DB, u.id, 'user', u.id, 'login');

  if (u.must_change_password) return c.redirect('/profile?first=1');
  return c.redirect(roleHomeUrl(u.role));
});

app.post('/logout', async (c) => {
  const u = await getCurrentUser(c);
  if (u) await logActivity(c.env.DB, u.id, 'user', u.id, 'logout');
  await destroySession(c);
  return c.redirect('/login?msg=Signed+out');
});

export default app;

function LoginPage(props: { err?: string; msg?: string }) {
  return (
    <Layout title="Sign In" user={null}>
      <div class="min-h-[70vh] flex items-center justify-center">
        <div class="w-full max-w-md">
          <div class="text-center mb-6">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-full bg-aps-navy text-aps-gold font-display text-2xl font-bold">A</div>
            <h1 class="mt-4 font-display text-2xl text-aps-navy">Alexander Public Schools</h1>
            <p class="text-slate-600 text-sm">Marshall Growth Platform · Sign in to continue</p>
          </div>
          {props.err && <div class="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-800 text-sm">{props.err}</div>}
          {props.msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{props.msg}</div>}
          <form method="post" action="/login" class="bg-white p-6 rounded-lg shadow-sm border border-slate-200 space-y-4">
            <label class="block">
              <span class="block text-sm font-medium text-slate-700 mb-1">Email</span>
              <input name="email" type="email" required autocomplete="username" class="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-aps-blue" />
            </label>
            <label class="block">
              <span class="block text-sm font-medium text-slate-700 mb-1">Password</span>
              <input name="password" type="password" required autocomplete="current-password" class="w-full border border-slate-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-aps-blue" />
            </label>
            <button class="w-full bg-aps-navy text-white rounded-md py-2 font-medium hover:bg-aps-blue">Sign in</button>
          </form>
          <p class="text-xs text-slate-500 mt-4 text-center">
            Need access? Contact your district administrator.
          </p>
        </div>
      </div>
    </Layout>
  );
}
