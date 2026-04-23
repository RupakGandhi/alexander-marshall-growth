import { Hono } from 'hono';
import type { Bindings, Variables } from '../lib/types';
import { requireAuth } from '../lib/auth';
import {
  getUnreadCount, listRecent, markRead, markAllRead, deleteNotification,
  getOrCreateVapidKeys, getLatestUnread,
} from '../lib/notifications';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use('*', requireAuth());

// ---------------------------------------------------------------------------
// Notifications API — powers the bell dropdown and the service worker
// ---------------------------------------------------------------------------

// Summary: unread count (used by header bell badge, polled every 45s)
app.get('/notifications/summary', async (c) => {
  const user = c.get('user')!;
  const n = await getUnreadCount(c.env.DB, user.id);
  return c.json({ unread: n });
});

// List recent notifications for the bell dropdown
app.get('/notifications', async (c) => {
  const user = c.get('user')!;
  const rows = await listRecent(c.env.DB, user.id, 25);
  return c.json({ items: rows, unread: rows.filter((r) => !r.read_at).length });
});

// Latest unread — used by the service worker on 'push' events so we can
// render the alert with a fresh title/body/url without encrypting the payload
app.get('/notifications/latest', async (c) => {
  const user = c.get('user')!;
  const n = await getLatestUnread(c.env.DB, user.id);
  if (!n) return c.json({ ok: false });
  return c.json({
    ok: true,
    id: n.id, title: n.title, body: n.body || '',
    url: n.url || '/', icon: n.icon || 'fa-bell',
  });
});

app.post('/notifications/:id/read', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  await markRead(c.env.DB, user.id, id);
  return c.json({ ok: true });
});

app.post('/notifications/read-all', async (c) => {
  const user = c.get('user')!;
  await markAllRead(c.env.DB, user.id);
  return c.json({ ok: true });
});

app.post('/notifications/:id/delete', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  await deleteNotification(c.env.DB, user.id, id);
  return c.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Web Push subscriptions — PWA devices register here
// ---------------------------------------------------------------------------
app.get('/push/public-key', async (c) => {
  const v = await getOrCreateVapidKeys(c.env.DB);
  return c.json({ publicKey: v.public_key });
});

app.post('/push/subscribe', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json<any>();
  const endpoint = String(body?.endpoint || '').trim();
  const p256dh = String(body?.keys?.p256dh || '').trim();
  const auth = String(body?.keys?.auth || '').trim();
  const ua = String(c.req.header('user-agent') || '').slice(0, 250);
  if (!endpoint || !p256dh || !auth) return c.json({ ok: false, error: 'invalid subscription' }, 400);
  await c.env.DB.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET
       user_id = excluded.user_id, p256dh = excluded.p256dh,
       auth = excluded.auth, user_agent = excluded.user_agent,
       last_used_at = CURRENT_TIMESTAMP`
  ).bind(user.id, endpoint, p256dh, auth, ua).run();
  return c.json({ ok: true });
});

app.post('/push/unsubscribe', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.json<any>().catch(() => ({}));
  const endpoint = String(body?.endpoint || '').trim();
  if (!endpoint) return c.json({ ok: false }, 400);
  await c.env.DB.prepare(`DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?`)
    .bind(user.id, endpoint).run();
  return c.json({ ok: true });
});

// Pedagogy preview for appraiser UI (auto-suggest)
app.get('/pedagogy/:indicatorId/:level', async (c) => {
  const indicatorId = Number(c.req.param('indicatorId'));
  const level = Number(c.req.param('level'));
  const entry = await c.env.DB.prepare(
    `SELECT * FROM pedagogy_library WHERE indicator_id=? AND level=?`
  ).bind(indicatorId, level).first<any>();
  if (!entry) return c.json({ ok: false });
  return c.json({
    ok: true,
    interpretation: entry.interpretation,
    feedback_starter: entry.feedback_starter,
    evidence_signals: safeParse(entry.evidence_signals, []),
    teacher_next_moves: safeParse(entry.teacher_next_moves, []),
    coaching_considerations: safeParse(entry.coaching_considerations, []),
    resources: safeParse(entry.resources, []),
  });
});

function safeParse<T>(v: any, fb: T): T {
  if (!v) return fb;
  try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return fb; }
}

export default app;
