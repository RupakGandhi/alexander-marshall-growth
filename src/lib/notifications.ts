// ============================================================================
// notifications.ts — In-app + Web Push notifications
// ============================================================================
// Unified alert system for the Alexander Marshall Growth platform.  Replaces
// every outbound email a traditional eval system would send with (a) an
// always-on bell dropdown inside the PWA and (b) Web Push notifications that
// reach any device running the installed PWA — all without an email or SMS
// subscription.
//
// Public helpers:
//   notify()          — create a single notification (and optionally push it)
//   notifyMany()      — same, broadcast to a list of user ids
//   getUnreadCount()  — count for bell badge
//   listRecent()      — bell dropdown contents
//   markRead / markAllRead / deleteNotification
//   getOrCreateVapidKeys() — self-provisioning Web Push identity
//   pushTo()          — best-effort push delivery
//
// Design choices that matter:
//   • Persistence first — the DB row is the source of truth.  A push failure
//     never rolls back or blocks a workflow.
//   • Empty-payload push — we send VAPID-signed pushes with no encrypted body.
//     The service worker responds by fetching /api/notifications/latest, which
//     returns the freshest unread title/body/url.  This keeps the crypto path
//     small (just signing a JWT) and avoids the AES-GCM ECE dance that is
//     painful in a Worker runtime.
//   • Zero cost — everything uses the open Web Push + built-in Web Crypto
//     standards.  The district owns its VAPID key pair forever.
// ============================================================================

import type { Bindings } from './types';

export type NotifSeverity = 'info' | 'success' | 'warning' | 'action';

export interface NotifPayload {
  user_id: number;
  kind: string;                 // machine key from NOTIFICATION_KINDS below
  title: string;
  body?: string | null;
  url?: string | null;
  icon?: string | null;         // Font Awesome suffix, e.g. 'fa-clipboard-check'
  severity?: NotifSeverity;
  entity_type?: string | null;
  entity_id?: number | null;
  actor_user_id?: number | null;
}

// ----------------------------------------------------------------------------
// Kind catalog — canonical list of every notification we send.  Rendered on
// the user's preferences page so they can opt specific kinds in/out.
// ----------------------------------------------------------------------------
export const NOTIFICATION_KINDS: Array<{
  kind: string;
  label: string;
  description: string;
  defaultIcon: string;
  defaultSeverity: NotifSeverity;
  defaultPush: boolean;
  appliesToRoles: string[];
}> = [
  { kind: 'observation_published',    label: 'Observation published',          description: 'A principal published an evaluation you can read.',                    defaultIcon: 'fa-clipboard-check',     defaultSeverity: 'action',  defaultPush: true,  appliesToRoles: ['teacher'] },
  { kind: 'observation_acknowledged', label: 'Teacher acknowledged',           description: 'A teacher you observed has signed/acknowledged their observation.',    defaultIcon: 'fa-signature',           defaultSeverity: 'success', defaultPush: true,  appliesToRoles: ['appraiser','super_admin'] },
  { kind: 'acknowledgment_overdue',   label: 'Acknowledgment overdue',         description: 'An observation has been unread/unsigned for more than 3 days.',        defaultIcon: 'fa-triangle-exclamation',defaultSeverity: 'warning', defaultPush: true,  appliesToRoles: ['teacher','appraiser'] },
  { kind: 'observation_scheduled',    label: 'Observation scheduled',          description: 'A principal started an observation draft about you (FYI).',            defaultIcon: 'fa-calendar-plus',       defaultSeverity: 'info',    defaultPush: false, appliesToRoles: ['teacher'] },
  { kind: 'focus_area_opened',        label: 'New focus area opened',          description: 'A growth focus was opened for you based on an observation.',           defaultIcon: 'fa-bullseye',            defaultSeverity: 'action',  defaultPush: true,  appliesToRoles: ['teacher'] },
  { kind: 'focus_area_closed',        label: 'Focus area achieved / closed',   description: 'A focus area on your plan was closed out.',                            defaultIcon: 'fa-flag-checkered',      defaultSeverity: 'success', defaultPush: true,  appliesToRoles: ['teacher'] },
  { kind: 'coach_note',               label: 'Coach note',                     description: 'Your instructional coach left a note or resource.',                    defaultIcon: 'fa-compass',             defaultSeverity: 'info',    defaultPush: true,  appliesToRoles: ['teacher'] },
  { kind: 'pd_module_recommended',    label: 'New PD module recommended',      description: 'A research-based module was added to your PD LMS based on your scores.',defaultIcon: 'fa-graduation-cap',     defaultSeverity: 'action',  defaultPush: true,  appliesToRoles: ['teacher'] },
  { kind: 'pd_module_assigned',       label: 'PD module assigned',             description: 'A principal or coach assigned you a specific PD module.',              defaultIcon: 'fa-clipboard-list',      defaultSeverity: 'action',  defaultPush: true,  appliesToRoles: ['teacher'] },
  { kind: 'pd_deliverable_submitted', label: 'Teacher submitted a deliverable',description: 'A teacher you supervise submitted a PD deliverable for review.',       defaultIcon: 'fa-inbox',               defaultSeverity: 'action',  defaultPush: true,  appliesToRoles: ['appraiser','coach','super_admin'] },
  { kind: 'pd_deliverable_verified',  label: 'Deliverable verified',           description: 'Your supervisor marked your PD deliverable as complete.',              defaultIcon: 'fa-circle-check',        defaultSeverity: 'success', defaultPush: true,  appliesToRoles: ['teacher'] },
  { kind: 'pd_deliverable_revision',  label: 'Deliverable needs revision',     description: 'Your supervisor requested changes to your PD deliverable.',            defaultIcon: 'fa-rotate-left',         defaultSeverity: 'warning', defaultPush: true,  appliesToRoles: ['teacher'] },
  { kind: 'annual_summary_published', label: 'Annual summary published',       description: 'An annual summary was published in your school or district.',          defaultIcon: 'fa-file-lines',          defaultSeverity: 'info',    defaultPush: true,  appliesToRoles: ['teacher','superintendent','super_admin'] },
  { kind: 'account_created',          label: 'Welcome to the platform',        description: 'Your account was created — change your password on first login.',     defaultIcon: 'fa-circle-user',         defaultSeverity: 'info',    defaultPush: false, appliesToRoles: ['teacher','appraiser','coach','superintendent','super_admin'] },
  { kind: 'password_reset',           label: 'Password reset by admin',        description: 'An admin reset your password — you must set a new one at login.',     defaultIcon: 'fa-key',                 defaultSeverity: 'warning', defaultPush: false, appliesToRoles: ['teacher','appraiser','coach','superintendent','super_admin'] },
  { kind: 'import_complete',          label: 'Bulk import finished',           description: 'A CSV import you kicked off has finished.',                            defaultIcon: 'fa-file-import',         defaultSeverity: 'success', defaultPush: false, appliesToRoles: ['super_admin'] },
];

const KIND_MAP: Record<string, typeof NOTIFICATION_KINDS[0]> = Object.fromEntries(
  NOTIFICATION_KINDS.map(k => [k.kind, k])
);

export function kindMeta(kind: string) {
  return KIND_MAP[kind] || {
    kind, label: kind, description: '', defaultIcon: 'fa-bell',
    defaultSeverity: 'info' as NotifSeverity, defaultPush: false, appliesToRoles: [],
  };
}

// ----------------------------------------------------------------------------
// Write side — create notifications
// ----------------------------------------------------------------------------

export async function notify(db: D1Database, p: NotifPayload, env?: Bindings): Promise<number> {
  const meta = kindMeta(p.kind);
  const severity = p.severity || meta.defaultSeverity;
  const icon = p.icon || meta.defaultIcon;

  // Master user settings (one row per user — absent row = defaults-on)
  const settings = await db.prepare(
    `SELECT push_enabled, in_app_enabled FROM user_settings WHERE user_id = ?`
  ).bind(p.user_id).first<any>();
  const masterInApp = settings ? !!settings.in_app_enabled : true;
  const masterPush  = settings ? !!settings.push_enabled   : true;

  const pref = await db.prepare(
    `SELECT in_app, push FROM notification_preferences WHERE user_id = ? AND kind = ?`
  ).bind(p.user_id, p.kind).first<any>();
  const inAppKind = pref ? !!pref.in_app : true;
  // Respect both master + per-kind — if either is off, don't write the row.
  if (!masterInApp || !inAppKind) return 0;

  const res = await db.prepare(
    `INSERT INTO notifications (user_id, kind, title, body, url, icon, severity,
        entity_type, entity_id, actor_user_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    p.user_id, p.kind, p.title, p.body || null, p.url || null, icon, severity,
    p.entity_type || null, p.entity_id || null, p.actor_user_id || null
  ).run();
  const id = Number((res.meta as any)?.last_row_id || 0);

  // Best-effort Web Push — never blocks or throws.
  // Gated on BOTH the master push switch AND the per-kind push preference.
  if (env) {
    const pushKind = pref ? !!pref.push : meta.defaultPush;
    if (masterPush && pushKind) {
      try { await pushTo(db, p.user_id); } catch { /* swallow */ }
    }
  }
  return id;
}

export async function notifyMany(
  db: D1Database,
  userIds: number[],
  p: Omit<NotifPayload, 'user_id'>,
  env?: Bindings
) {
  const ids: number[] = [];
  const uniq = Array.from(new Set(userIds.filter((x) => !!x)));
  for (const uid of uniq) ids.push(await notify(db, { ...p, user_id: uid }, env));
  return ids;
}

// ----------------------------------------------------------------------------
// Read side — dropdown, badge, mark read
// ----------------------------------------------------------------------------

export async function getUnreadCount(db: D1Database, userId: number): Promise<number> {
  const r = await db.prepare(
    `SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read_at IS NULL`
  ).bind(userId).first<any>();
  return Number(r?.n || 0);
}

export async function listRecent(db: D1Database, userId: number, limit = 25) {
  const r = await db.prepare(
    `SELECT n.*, u.first_name AS actor_first, u.last_name AS actor_last
       FROM notifications n
       LEFT JOIN users u ON u.id = n.actor_user_id
       WHERE n.user_id = ?
       ORDER BY n.created_at DESC
       LIMIT ?`
  ).bind(userId, limit).all();
  return (r.results as any[]) || [];
}

export async function getLatestUnread(db: D1Database, userId: number) {
  return db.prepare(
    `SELECT * FROM notifications WHERE user_id = ? AND read_at IS NULL
     ORDER BY created_at DESC LIMIT 1`
  ).bind(userId).first<any>();
}

export async function markRead(db: D1Database, userId: number, id: number) {
  await db.prepare(
    `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
       WHERE id = ? AND user_id = ? AND read_at IS NULL`
  ).bind(id, userId).run();
}

export async function markAllRead(db: D1Database, userId: number) {
  await db.prepare(
    `UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL`
  ).bind(userId).run();
}

export async function deleteNotification(db: D1Database, userId: number, id: number) {
  await db.prepare(`DELETE FROM notifications WHERE id = ? AND user_id = ?`).bind(id, userId).run();
}

// ----------------------------------------------------------------------------
// Preferences
// ----------------------------------------------------------------------------
export async function getPreferences(db: D1Database, userId: number): Promise<Record<string, { in_app: boolean; push: boolean }>> {
  const rows = await db.prepare(`SELECT kind, in_app, push FROM notification_preferences WHERE user_id = ?`).bind(userId).all();
  const map: Record<string, { in_app: boolean; push: boolean }> = {};
  for (const r of (rows.results as any[])) map[r.kind] = { in_app: !!r.in_app, push: !!r.push };
  return map;
}

export async function setPreference(db: D1Database, userId: number, kind: string, inApp: boolean, push: boolean) {
  await db.prepare(
    `INSERT INTO notification_preferences (user_id, kind, in_app, push)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(user_id, kind) DO UPDATE SET in_app=excluded.in_app, push=excluded.push, updated_at=CURRENT_TIMESTAMP`
  ).bind(userId, kind, inApp ? 1 : 0, push ? 1 : 0).run();
}

// ----------------------------------------------------------------------------
// Master user settings (one-click kill switches)
// ----------------------------------------------------------------------------
export async function getUserSettings(db: D1Database, userId: number): Promise<{ push_enabled: boolean; in_app_enabled: boolean }> {
  const r = await db.prepare(
    `SELECT push_enabled, in_app_enabled FROM user_settings WHERE user_id = ?`
  ).bind(userId).first<any>();
  return {
    push_enabled:   r ? !!r.push_enabled   : true,
    in_app_enabled: r ? !!r.in_app_enabled : true,
  };
}

export async function setUserSettings(db: D1Database, userId: number, pushEnabled: boolean, inAppEnabled: boolean) {
  await db.prepare(
    `INSERT INTO user_settings (user_id, push_enabled, in_app_enabled)
     VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       push_enabled = excluded.push_enabled,
       in_app_enabled = excluded.in_app_enabled,
       updated_at = CURRENT_TIMESTAMP`
  ).bind(userId, pushEnabled ? 1 : 0, inAppEnabled ? 1 : 0).run();
}

// ============================================================================
// VAPID + Web Push — zero-cost delivery to installed PWAs
// ============================================================================
// We store the VAPID key pair as a full JWK blob in the DB (private_key
// column) so ECDSA signing works cleanly in Workers' Web Crypto.  The
// public_key column holds the raw uncompressed EC point (65 bytes, base64url)
// that browsers want in their PushSubscribe `applicationServerKey`.

interface VapidRow { id: number; public_key: string; private_key: string; subject: string; }

export async function getOrCreateVapidKeys(db: D1Database, subject = 'mailto:admin@alexanderschoolnd.us'): Promise<VapidRow> {
  const existing = await db.prepare(`SELECT * FROM vapid_keys ORDER BY id LIMIT 1`).first<any>();
  if (existing && existing.public_key && existing.private_key) return existing as VapidRow;

  // Generate P-256 ECDSA key pair, export as JWK (for signing) + raw (for browser)
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']
  );
  const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)); // 65 bytes: 0x04 || x(32) || y(32)
  const privJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const publicB64 = b64urlBytes(rawPub);
  const privateBlob = JSON.stringify(privJwk); // full JWK so we can re-import later

  await db.prepare(`DELETE FROM vapid_keys`).run();  // single-row invariant
  await db.prepare(
    `INSERT INTO vapid_keys (public_key, private_key, subject) VALUES (?, ?, ?)`
  ).bind(publicB64, privateBlob, subject).run();
  const row = await db.prepare(`SELECT * FROM vapid_keys ORDER BY id LIMIT 1`).first<any>();
  return row as VapidRow;
}

// Send an empty-payload, VAPID-signed push to every subscription of this user.
// The SW handler responds by calling /api/notifications/latest to fetch the
// freshest unread notification and show it as a desktop alert.
export async function pushTo(db: D1Database, userId: number) {
  const subs = await db.prepare(
    `SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?`
  ).bind(userId).all();
  const rows = (subs.results as any[]) || [];
  if (rows.length === 0) return;
  const vapid = await getOrCreateVapidKeys(db);

  for (const sub of rows) {
    try {
      const res = await sendEmptyPush(sub.endpoint, vapid);
      if (res && (res.status === 404 || res.status === 410)) {
        await db.prepare(`DELETE FROM push_subscriptions WHERE id = ?`).bind(sub.id).run();
      } else {
        await db.prepare(`UPDATE push_subscriptions SET last_used_at = CURRENT_TIMESTAMP WHERE id = ?`)
          .bind(sub.id).run();
      }
    } catch { /* single-device failure never blocks others */ }
  }
}

async function sendEmptyPush(endpoint: string, vapid: VapidRow): Promise<Response | null> {
  const u = new URL(endpoint);
  const aud = `${u.protocol}//${u.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;
  const header = { typ: 'JWT', alg: 'ES256' };
  const claims = { aud, exp, sub: vapid.subject };

  const privJwk = JSON.parse(vapid.private_key);
  const privKey = await crypto.subtle.importKey(
    'jwk', privJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']
  );
  const enc = new TextEncoder();
  const h = b64urlBytes(enc.encode(JSON.stringify(header)));
  const p = b64urlBytes(enc.encode(JSON.stringify(claims)));
  const sigBytes = new Uint8Array(await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' }, privKey, enc.encode(`${h}.${p}`)
  ));
  const jwt = `${h}.${p}.${b64urlBytes(sigBytes)}`;

  return await fetch(endpoint, {
    method: 'POST',
    headers: {
      'TTL': '86400',
      'Content-Length': '0',
      'Urgency': 'normal',
      'Authorization': `vapid t=${jwt}, k=${vapid.public_key}`,
    },
  });
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
function b64urlBytes(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
