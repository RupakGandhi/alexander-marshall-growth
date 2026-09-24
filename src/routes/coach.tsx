import { Hono } from 'hono';
import type { Bindings, Variables } from '../lib/types';
import { Layout, Card } from '../lib/layout';
import { requireCoachAccess } from '../lib/auth';
import { hasCoachAccess, requireCoachAssignment } from '../lib/access';
import { getAssignedTeachers, logActivity } from '../lib/db';
import { recommendModule } from '../lib/pd';
import { notify } from '../lib/notifications';
import { formatDate, formatDateTime, statusBadge, statusLabel } from '../lib/ui';
import { Prose } from '../lib/prose';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
// Sept 23, 2026 — gate switched from role-only to capability-based so
// role='teacher' users with can_coach=1 (Miranda Quale, Tristae Allard) get
// through without giving every teacher supervisor access.  Per-target
// authorization is enforced inside each handler via requireCoachAssignment
// (never trust the outer role gate to authorize actions on someone's data).
app.use('*', requireCoachAccess());

// Coach home: assigned teachers
app.get('/', async (c) => {
  const user = c.get('user')!;
  const welcome = c.req.query('welcome') === '1';
  const teachers = await getAssignedTeachers(c.env.DB, user.id, 'coach');
  // For each teacher, show count of active focus areas
  const data: any[] = [];
  for (const t of (teachers as any[])) {
    const focus = await c.env.DB.prepare(
      // Practice-cleanup soft-delete: exclude f.deleted_at rows.
    `SELECT COUNT(*) AS n FROM focus_areas WHERE teacher_id=? AND status='active' AND deleted_at IS NULL`
    ).bind(t.id).first<any>();
    data.push({ ...t, focusCount: focus?.n || 0 });
  }
  return c.html(<CoachHome user={user} teachers={data} welcome={welcome} />);
});

// Coach teacher view — only focus areas & constructive feedback (no scores)
app.get('/teachers/:id', async (c) => {
  const user = c.get('user')!;
  const teacherId = Number(c.req.param('id'));
  // requireCoachAssignment centralizes the "active coach relationship + no
  // self-coaching" check and honors super_admin.  Any code that hand-rolls
  // this check will drift out of sync — always call the helper.
  if (!(await requireCoachAssignment(c.env.DB, user, teacherId))) {
    return c.text('Not assigned to this teacher', 403);
  }

  const teacher = await c.env.DB.prepare('SELECT * FROM users WHERE id=? AND role=?').bind(teacherId, 'teacher').first<any>();
  if (!teacher) return c.text('Not found', 404);

  // Published observations only — feedback items minus scores/private notes
  const obs = await c.env.DB.prepare(
    // Practice-cleanup soft-delete: exclude o.deleted_at rows.
    `SELECT o.id, o.observed_at, o.observation_type, o.class_context, o.subject, o.published_at, o.overall_summary, o.status,
       a.first_name AS a_first, a.last_name AS a_last
     FROM observations o JOIN users a ON a.id = o.appraiser_id
     WHERE o.teacher_id=? AND (o.status='published' OR o.status='acknowledged') AND o.deleted_at IS NULL
     ORDER BY o.observed_at DESC`
  ).bind(teacherId).all();

  const obsWithFeedback: any[] = [];
  for (const o of (obs.results as any[])) {
    const fb = await c.env.DB.prepare(
      // feedback_items now honors deleted_at (migration 0015).
      `SELECT fi.category, fi.title, fi.body, fi.indicator_id,
         i.name AS indicator_name, i.code AS indicator_code, d.code AS domain_code
       FROM feedback_items fi
       LEFT JOIN framework_indicators i ON i.id = fi.indicator_id
       LEFT JOIN framework_domains d ON d.id = i.domain_id
       WHERE fi.observation_id = ?
       AND fi.category IN ('glow','grow','focus_area','next_step')
       AND fi.deleted_at IS NULL
       ORDER BY fi.sort_order, fi.id`
    ).bind(o.id).all();
    obsWithFeedback.push({ ...o, feedback: fb.results || [] });
  }

  const focus = await c.env.DB.prepare(
    // Practice-cleanup soft-delete: exclude f.deleted_at rows.
    `SELECT f.*, i.name AS indicator_name, i.code AS indicator_code, d.code AS domain_code, d.name AS domain_name
     FROM focus_areas f
     LEFT JOIN framework_indicators i ON i.id = f.indicator_id
     LEFT JOIN framework_domains d ON d.id = i.domain_id
     WHERE f.teacher_id=? AND f.status='active' AND f.deleted_at IS NULL
     ORDER BY f.opened_at DESC`
  ).bind(teacherId).all();

  // Fix 4 — coaches can recommend PD modules to their teachers.  IMPORTANT:
  // this query reads ONLY from the pd_modules + framework tables (no
  // observation_scores, no rubric levels exposed to the coach). The
  // dropdown still shows the module's target_level number because that's
  // a pedagogy-library property of the module itself, not a score on the
  // teacher.  No-scores rule is preserved.
  const modulesRes = await c.env.DB.prepare(
    `SELECT m.id, m.title, m.est_minutes,
            d.code AS domain_code, i.code AS indicator_code, i.name AS indicator_name
       FROM pd_modules m
       JOIN framework_indicators i ON i.id = m.indicator_id
       JOIN framework_domains    d ON d.id = i.domain_id
      WHERE m.is_active = 1
      ORDER BY d.sort_order, i.sort_order, m.title`
  ).all();

  // Sept 23, 2026 — Section 3: this coach's OWN coaching notes for this
  // teacher.  Deliberately author-scoped: another coach's notes on the same
  // teacher are not visible here (visibility policy: draft = author-only,
  // shared = author + teacher).  A super_admin sees everything for support.
  //
  // F2 + T1 (Sept 23 third follow-up) — the per-note "delivery status" is
  // computed FROM BOTH the ledger and the notifications inbox so a coach's
  // view of a note always reflects the actual transport-layer truth.
  //
  //   * raw ledger status stays authoritative for the terminal-safe cases
  //     ('delivered', 'suppressed').  Those never get re-armed by a stale
  //     inbox delete, and they never get "downgraded" here.
  //   * for the intermediate/failed cases ('attempting', 'failed', 'never')
  //     we consult the notifications table.  If an inbox row exists we
  //     REPORT the note as delivered (delivery_status_effective='delivered')
  //     so the UI shows the correct state immediately and does NOT hang on
  //     "Delivery in progress" or falsely warn "Notification not delivered".
  //     A subsequent notify-retry from THIS coach's screen will hit the
  //     endpoint's preflight (coachNoteAlreadyDelivered) and idempotently
  //     repair the ledger on the server — the effective state is truthful
  //     from the very first page load, whether or not the coach clicks.
  //
  // This closes the T1 gap where a successful notify() followed by a
  // ledger-UPDATE failure left the ledger stuck at 'attempting' and the
  // coach page said "Delivery in progress" indefinitely with no way out.
  const deliveryStatus = `COALESCE((
    SELECT sd.status FROM coaching_note_share_delivery sd WHERE sd.note_id = n.id
  ), 'never') AS delivery_status_raw`;
  // Inbox-exists check for THIS specific note.  When true, the notification
  // is provably in the recipient's inbox regardless of what the ledger says.
  const inboxExists = `EXISTS (
    SELECT 1 FROM notifications nx
     WHERE nx.user_id = n.teacher_id
       AND nx.kind = 'coach_note'
       AND nx.entity_type = 'coaching_note'
       AND nx.entity_id = n.id
  ) AS inbox_delivered`;
  // Practice-cleanup soft-delete (migration 0015): hide n.deleted_at rows
  // from BOTH the author-scoped view and the super_admin support view.
  // A soft-deleted practice note must not surface in any coach page.
  const notesSql = user.role === 'super_admin'
    ? `SELECT n.*, u.first_name AS author_first, u.last_name AS author_last, ${deliveryStatus}, ${inboxExists}
         FROM coaching_notes n JOIN users u ON u.id = n.author_id
        WHERE n.teacher_id = ? AND n.deleted_at IS NULL
        ORDER BY n.updated_at DESC`
    : `SELECT n.*, u.first_name AS author_first, u.last_name AS author_last, ${deliveryStatus}, ${inboxExists}
         FROM coaching_notes n JOIN users u ON u.id = n.author_id
        WHERE n.teacher_id = ? AND n.author_id = ? AND n.deleted_at IS NULL
        ORDER BY n.updated_at DESC`;
  const notesRes = user.role === 'super_admin'
    ? await c.env.DB.prepare(notesSql).bind(teacherId).all()
    : await c.env.DB.prepare(notesSql).bind(teacherId, user.id).all();

  // T1 reconciliation: derive delivery_status by combining ledger + inbox.
  // The rules:
  //   1. Ledger 'delivered'   → 'delivered'         (never downgrade)
  //   2. Ledger 'suppressed'  → 'suppressed'        (terminal — recipient prefs)
  //   3. Otherwise, IF inbox row exists → 'delivered'  (transport-truth wins)
  //   4. Otherwise → ledger status verbatim (attempting / failed / never)
  // This is a READ-ONLY view derivation.  Actual ledger repair still
  // happens on the notify-retry endpoint and inside the delivery helpers'
  // preflight — this SELECT does not write.
  const notes = ((notesRes.results as any[]) || []).map((n) => {
    let effective: string = n.delivery_status_raw;
    if (effective !== 'delivered' && effective !== 'suppressed' && n.inbox_delivered) {
      effective = 'delivered';
    }
    return { ...n, delivery_status: effective };
  });

  const msg = c.req.query('msg');
  return c.html(<CoachTeacher
    user={user}
    teacher={teacher}
    observations={obsWithFeedback}
    focusAreas={focus.results || []}
    modules={(modulesRes.results as any[]) || []}
    coachingNotes={notes}
    msg={msg}
  />);
});

// Fix 4 — coach manual recommendation. Same assignment guard, same
// recommendModule() helper as the appraiser path. No score data is
// read or written; we only INSERT a row into pd_enrollments.
app.post('/teachers/:id/recommend-module', async (c) => {
  const user = c.get('user')!;
  const teacherId = Number(c.req.param('id'));
  if (!(await requireCoachAssignment(c.env.DB, user, teacherId))) {
    return c.text('Not assigned to this teacher', 403);
  }
  const body = await c.req.parseBody();
  const moduleId = Number(body.module_id);
  const note = String(body.note || '').trim() || null;
  if (!moduleId) return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Pick a module first.')}`);
  try {
    // Sept 23, 2026 — Section 5 attribution requirement.  Even when the actor
    // is a teacher-coach (role='teacher', can_coach=1) we tag this action as
    // 'coach' because it was performed via the coaching workspace.  The
    // notify path in pd.ts reads this label when composing the recipient
    // message, and this ensures the audit log never labels Miranda/Tristae
    // as "admin" or "teacher" for coach actions.
    await recommendModule(c.env.DB, teacherId, moduleId, user.id, note, c.env, 'coach');
    await logActivity(c.env.DB, user.id, 'pd_enrollment', moduleId, 'recommend_module', { teacherId, note, actor: 'coach' });
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Module recommended — the teacher has been notified.')}`);
  } catch (err: any) {
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Could not recommend: ' + (err?.message || 'unknown error'))}`);
  }
});

// ============================================================================
// SECTION 3 — Non-evaluative coaching feedback (write path)
//
// Author-owned, teacher-shared, per-assignment gated.  Never scored, never
// mixed with observations / feedback_items / focus_areas.
//
// Visibility policy:
//   - draft   : author only (super_admin can VIEW and EDIT for support).
//   - shared  : author + subject teacher.  Never other coaches, never
//               principals, never evaluation exports.
//
// Correctness properties this rewrite enforces (per Sept 23 review):
//
//   R2 — Duplicate prevention.  Every create form carries a UUID
//        `client_token`.  The INSERT uses ON CONFLICT (author_id,
//        client_token) DO NOTHING; a double-submit collapses to one row.
//        First-share is an atomic UPDATE ... WHERE first_shared_at IS NULL
//        that returns rowsAffected — only the WINNER of the race fires
//        the notification.  Concurrent share requests cannot double-notify.
//
//   R3 — Shared entries get ONE explicit "Save and share changes" action
//        that validates meaningful content on the way through.  Drafts
//        keep the Save-draft / Share buttons.  A shared entry cannot be
//        silently emptied by a "Save draft" click.
//
//   R4 — Partial-failure handling.  The write to coaching_notes and the
//        write to coaching_note_audit are executed as a D1 batch, so either
//        both land or neither does.  The notification is a separate best-
//        effort call AFTER the DB batch commits — if notify() throws we
//        catch it and mark the note "shared but notification failed" in
//        the redirect message; the note is still saved and visible to the
//        teacher.  The share-atomicity guard prevents a retry-after-notify-
//        failure from producing a second notification.  Optimistic-lock on
//        `version` prevents a stale edit from overwriting a newer save.
//
// The audit table stores actor_id / action / timestamp only — NOT the
// previous body text.  This is deliberate: coaching notes contain private
// coach-teacher conversation content and we do not persist historical
// versions.  The `updated_at` timestamp and the presence of a `reshare`
// audit row are the signals that a shared entry has been revised.
// ============================================================================

// ---- validation helpers --------------------------------------------------

interface NoteValues {
  teacher_id: number;
  occurred_on: string;
  class_context: string | null;
  evidence: string | null;
  glow: string | null;
  grow: string | null;
  next_step: string | null;
  follow_up_on: string | null;
}

function parseCoachingNoteForm(body: Record<string, any>): { errors: string[]; values: NoteValues } {
  const errors: string[] = [];
  const s = (k: string) => String(body[k] ?? '').trim();
  const teacherId = Number(body.teacher_id);
  const occurredOn = s('occurred_on');
  const values: NoteValues = {
    teacher_id: teacherId,
    occurred_on: occurredOn,
    class_context: s('class_context') || null,
    evidence: s('evidence') || null,
    glow: s('glow') || null,
    grow: s('grow') || null,
    next_step: s('next_step') || null,
    follow_up_on: s('follow_up_on') || null,
  };
  if (!Number.isFinite(teacherId) || teacherId <= 0) errors.push('Choose a teacher.');
  if (!occurredOn) errors.push('Enter the observation or conversation date.');
  return { errors, values };
}

function hasMeaningfulContent(v: Pick<NoteValues,'evidence'|'glow'|'grow'|'next_step'>): boolean {
  return !!(v.evidence?.trim() || v.glow?.trim() || v.grow?.trim() || v.next_step?.trim());
}

const MAX_FIELD_CHARS = 8000;
function clampFields(v: NoteValues): NoteValues {
  const out: NoteValues = { ...v };
  for (const k of ['class_context','evidence','glow','grow','next_step'] as const) {
    const cur = out[k];
    if (typeof cur === 'string' && cur.length > MAX_FIELD_CHARS) out[k] = cur.slice(0, MAX_FIELD_CHARS);
  }
  return out;
}

/** Normalise a client-supplied idempotency token.  Falsy / oversized / non-UUID-shape → null. */
function sanitizeClientToken(raw: any): string | null {
  const s = String(raw ?? '').trim();
  if (!s) return null;
  if (s.length > 64) return null;
  if (!/^[A-Za-z0-9._-]{8,64}$/.test(s)) return null;
  return s;
}

/** Server-generated fallback token when the form didn't send one (or sent an
 *  invalid one).  Format matches sanitizeClientToken's regex so the same
 *  UNIQUE index applies.  This guarantees EVERY note row has a client_token,
 *  which is what makes the atomic-batch pattern below work: the audit-row
 *  INSERTs look the note up by (author_id, client_token) and are guaranteed
 *  to find exactly one row in the same batch. */
function serverToken(): string {
  const g: any = globalThis as any;
  if (g.crypto?.randomUUID) return 's_' + (g.crypto.randomUUID() as string).replace(/-/g, '').slice(0, 30);
  return 's_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 12);
}

/**
 * Per-request nonce stamped onto coaching_notes.writer_nonce by every
 * INSERT/UPDATE this request performs.  Audit-row SELECT-in-INSERT
 * statements filter on `WHERE writer_nonce=?` so they match ONLY the row
 * this specific request wrote/updated.  This replaces the previous
 * created_at/updated_at based winner detection, which broke under
 * same-second concurrent requests (SQLite CURRENT_TIMESTAMP has 1-second
 * granularity; two same-second requests could both satisfy a `created_at=?`
 * gate).  UUIDs are unique per request, so the loser's audit SELECT
 * matches zero rows.
 */
function requestNonce(): string {
  const g: any = globalThis as any;
  if (g.crypto?.randomUUID) return 'n_' + (g.crypto.randomUUID() as string).replace(/-/g, '');
  return 'n_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 14) + Math.random().toString(36).slice(2, 14);
}

/**
 * Canonicalise the note "payload" for idempotency comparison.  F3: two
 * requests carrying the same client_token but different content are NOT the
 * same operation — one is likely a stale/refreshed form.  We reject the
 * second one and tell the user to reopen the existing draft.
 *
 * We hash the canonical string SHA-1 (256 bits of key material overkill for
 * a per-user collision-detection use case; we only need it stable) using
 * Web Crypto (available in Workers).  Stored on the row's `payload_digest`
 * column.  A subsequent same-token request whose digest doesn't match the
 * stored digest is rejected with a "content-changed" error.
 */
async function payloadDigest(v: NoteValues): Promise<string> {
  // Order matters for the hash; keep it stable.
  const canon = JSON.stringify([
    v.teacher_id, v.occurred_on, v.class_context || '',
    v.evidence || '', v.glow || '', v.grow || '', v.next_step || '',
    v.follow_up_on || '',
  ]);
  const bytes = new TextEncoder().encode(canon);
  const g: any = globalThis as any;
  if (g.crypto?.subtle) {
    const buf: ArrayBuffer = await g.crypto.subtle.digest('SHA-1', bytes);
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
  }
  // Fallback (Node without crypto.subtle): FNV-1a 64-bit hex.  Sufficient
  // for the collision-detection use case; production Workers always have
  // Web Crypto.
  let h = 0xcbf29ce484222325n; const p = 0x100000001b3n;
  for (let i = 0; i < bytes.length; i++) { h ^= BigInt(bytes[i]); h = (h * p) & 0xffffffffffffffffn; }
  return h.toString(16).padStart(16, '0');
}

/**
 * SQL timestamp for `created_at` / `updated_at` / `first_shared_at`.  These
 * ARE UTC timestamps and we render them with time-zone context in the UI, so
 * ISO in UTC is correct here.  Uses 'YYYY-MM-DD HH:MM:SS' form.
 */
function nowSqlTimestamp(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

// C2 note (Sept 23 correction) — coaching_notes.occurred_on and follow_up_on
// are date-only fields.  The user picks "September 22, 2026" in the browser
// date picker and the form posts the bare `YYYY-MM-DD` string.  Displaying
// that through the OLD src/lib/ui.ts:formatDate() built a UTC-midnight Date
// and then rendered it in America/Chicago, shifting it back a day for any
// user west of UTC.  formatDate() now short-circuits for the date-only
// shape (see src/lib/ui.ts), so occurred_on and follow_up_on stay stable.
// No local helper needed here.

// F2 (Sept 23, follow-up correction) — atomic first-share delivery.
//
// deliverShareNotification() is the ONLY caller of notify() for the coach_note
// kind.  It uses the coaching_note_share_delivery table (migration 0014) to
// serialize concurrent delivery attempts per note_id.  The flow:
//
//   1. Try to INSERT (note_id, 'attempting') into share_delivery.  UNIQUE
//      (note_id) means the winner gets the lock; losers get "already exists".
//   2. Winner calls notify().  notify() returns:
//        > 0  → row inserted into notifications.  Mark delivered.
//        = 0  → recipient's preferences suppress this kind.  Mark suppressed
//               (terminal — do not retry, it's a policy decision).
//        throws → mark failed with detail.
//   3. Loser reads the existing share_delivery row and returns the appropriate
//      status without ever calling notify() again.
//
// A `failed` row is the ONLY status eligible for a subsequent retry — an
// UPDATE with WHERE status='failed' guard makes the retry itself atomic.
//
// This decouples "was the first-share alert ever delivered?" from the inbox
// row.  A support admin can safely delete the inbox row (normal cleanup)
// without accidentally re-arming a duplicate first-share alert on the next
// retry.  Deleting the share_delivery row would be the only way to reset —
// and that operation is not exposed in any UI.

export type DeliveryOutcome =
  | { status: 'delivered'; notifId: number }
  | { status: 'suppressed' }                          // recipient turned this kind off
  | { status: 'failed'; detail: string }              // notify() threw
  | { status: 'already_delivered' }                   // idempotent no-op
  | { status: 'already_suppressed' }                  // idempotent no-op
  | { status: 'in_flight' }                           // another request holds the lock right now
  | { status: 'retry_not_eligible' };                 // rare: unexpected pre-existing state

/**
 * R2 (Sept 23 second follow-up) — the source of truth for "did we ever
 * deliver a first-share alert for this note?" is the notifications table,
 * not the share_delivery ledger.  Reasons:
 *
 *   * If notify() succeeds but the subsequent `UPDATE ... SET
 *     status='delivered'` throws, the notification row EXISTS but the
 *     ledger says something else (attempting or, worse, our catch marked
 *     it failed).  A retry that consulted only the ledger would call
 *     notify() again and duplicate the alert.
 *   * Consulting the notifications table before calling notify() makes
 *     the retry idempotent at the transport layer — if the alert is
 *     already in the recipient's inbox we skip notify() and REPAIR the
 *     ledger to 'delivered' instead.
 *   * A support admin deleting an inbox row is still guarded — the
 *     ledger's terminal 'delivered' state suppresses further retries
 *     regardless of whether the inbox row is present or not.  So the
 *     retry check is: EITHER the notifications table has a row for this
 *     note OR the ledger is already 'delivered' → no-op.  This closes
 *     the "notify succeeded / ledger update failed" gap without
 *     reopening the "deleted inbox row re-arms first-share" gap.
 */
async function coachNoteAlreadyDelivered(
  db: D1Database, noteId: number, teacherId: number,
): Promise<{ delivered: boolean; via: 'notifications'|'ledger'|null; notifId: number|null }> {
  const nrow = await db.prepare(
    `SELECT id FROM notifications
      WHERE user_id=? AND kind='coach_note' AND entity_type='coaching_note' AND entity_id=?
      LIMIT 1`
  ).bind(teacherId, noteId).first<any>();
  if (nrow) return { delivered: true, via: 'notifications', notifId: Number(nrow.id) };
  const lrow = await db.prepare(
    `SELECT status, notif_id FROM coaching_note_share_delivery WHERE note_id=?`
  ).bind(noteId).first<any>();
  if (lrow && lrow.status === 'delivered') {
    return { delivered: true, via: 'ledger', notifId: lrow.notif_id != null ? Number(lrow.notif_id) : null };
  }
  return { delivered: false, via: null, notifId: null };
}

/**
 * Best-effort ledger update.  R2: this is DELIBERATELY SEPARATE from the
 * notify() try block — if the ledger write fails AFTER notify() succeeded,
 * we log a warning and return.  We do NOT mark the ledger 'failed' in that
 * case (that would misreport a successful delivery as a failure and permit
 * a duplicate on retry).  The notifications row is the actual source of
 * truth; a future retry will find it via coachNoteAlreadyDelivered() and
 * repair the ledger then.
 */
async function tryLedgerUpdate(
  db: D1Database, sql: string, binds: any[], context: string,
): Promise<boolean> {
  try {
    await db.prepare(sql).bind(...binds).run();
    return true;
  } catch (e) {
    console.warn('coach_note ledger update failed (delivery still authoritative)', {
      context, err: (e as any)?.message || e,
    });
    return false;
  }
}

async function deliverShareNotification(
  db: D1Database,
  env: any,
  noteId: number,
  teacherId: number,
  author: { id: number; first_name: string; last_name: string },
): Promise<DeliveryOutcome> {
  // R2 preflight — if the notifications table already has a coach_note
  // row for this note, treat as already delivered.  This covers the rare
  // "we crashed after notify() succeeded but before the ledger write"
  // case: on the next request through, the transport-layer proof of
  // delivery beats any stale ledger state.
  const pre = await coachNoteAlreadyDelivered(db, noteId, teacherId);
  if (pre.delivered) {
    // Repair the ledger opportunistically (best-effort; ignored if it fails).
    await tryLedgerUpdate(db,
      `UPDATE coaching_note_share_delivery
          SET status='delivered', notif_id=COALESCE(notif_id, ?), updated_at=CURRENT_TIMESTAMP
        WHERE note_id=? AND status<>'delivered' AND status<>'suppressed'`,
      [pre.notifId, noteId], 'preflight-repair-delivered');
    return { status: 'already_delivered' };
  }

  // Attempt to take the delivery lock.  ON CONFLICT DO NOTHING means a
  // concurrent request that already inserted the row will make us the loser.
  const lock = await db.prepare(
    `INSERT INTO coaching_note_share_delivery (note_id, status)
     VALUES (?, 'attempting')
     ON CONFLICT (note_id) DO NOTHING
     RETURNING id`
  ).bind(noteId).run();
  const gotLock = ((lock.results as any[]) || []).length === 1;

  if (!gotLock) {
    // Loser — inspect the existing row and translate.
    const row = await db.prepare(
      `SELECT status, notif_id FROM coaching_note_share_delivery WHERE note_id=?`
    ).bind(noteId).first<any>();
    if (!row) return { status: 'retry_not_eligible' };
    if (row.status === 'delivered')  return { status: 'already_delivered' };
    if (row.status === 'suppressed') return { status: 'already_suppressed' };
    if (row.status === 'attempting') return { status: 'in_flight' };
    return { status: 'retry_not_eligible' };
  }

  // R2 — winner-branch phased writes.  Each phase is in its OWN try block
  // so a failure at a later phase never causes us to misreport the earlier
  // phase's success.
  //
  // Phase A: call notify().  If it throws → the notification did NOT get
  //   created; ledger 'failed' is truthful.
  //
  // Phase B: if notify() succeeded with notifId>0 → the alert EXISTS in
  //   the recipient's inbox.  Ledger update to 'delivered' is best-effort;
  //   if it throws, log and return delivered=true anyway (the notification
  //   is the truth; retries will find it via coachNoteAlreadyDelivered).
  //
  // Phase C: if notify() returned 0 (prefs suppression) → ledger update to
  //   'suppressed' is also best-effort; on failure, log and return
  //   suppressed=true.
  let notifId: number;
  try {
    notifId = await notify(db, {
      user_id: teacherId,
      kind: 'coach_note',
      title: `${author.first_name} ${author.last_name} shared coaching feedback with you`,
      body: 'Open your workspace to read the strengths, growth areas, and next step your coach shared.',
      url: '/teacher#coaching-feedback',
      entity_type: 'coaching_note',
      entity_id: noteId,
      actor_user_id: author.id,
    }, env);
  } catch (e) {
    // Phase A FAILED — notification was NOT created.  Ledger 'failed' is
    // accurate.  If THIS ledger write also throws we still return failed
    // (the retry check will detect no notifications row and re-attempt).
    const detail = (e as any)?.message || String(e);
    console.warn('coach_note notify failed', { noteId, teacherId, err: detail });
    await tryLedgerUpdate(db,
      `UPDATE coaching_note_share_delivery
          SET status='failed', detail=?, updated_at=CURRENT_TIMESTAMP
        WHERE note_id=? AND status='attempting'`,
      [detail.slice(0, 500), noteId], 'winner-mark-failed');
    return { status: 'failed', detail };
  }

  if (notifId > 0) {
    // Phase B — notification created.  Best-effort ledger update.
    await tryLedgerUpdate(db,
      `UPDATE coaching_note_share_delivery
          SET status='delivered', notif_id=?, updated_at=CURRENT_TIMESTAMP
        WHERE note_id=? AND status='attempting'`,
      [notifId, noteId], 'winner-mark-delivered');
    return { status: 'delivered', notifId };
  }

  // Phase C — notify() returned 0 → prefs suppression.  Best-effort ledger.
  await tryLedgerUpdate(db,
    `UPDATE coaching_note_share_delivery
        SET status='suppressed', updated_at=CURRENT_TIMESTAMP
      WHERE note_id=? AND status='attempting'`,
    [noteId], 'winner-mark-suppressed');
  return { status: 'suppressed' };
}

/**
 * Retry a previously-failed first-share delivery.  R2: the transport-layer
 * check (notifications table) runs BEFORE we do any lock flip.  If the
 * alert exists we short-circuit → already_delivered, and opportunistically
 * repair the ledger.  Otherwise we atomically flip status='failed' →
 * 'attempting' (only one caller wins) and go through the same phased-write
 * pattern as deliverShareNotification.
 */
async function retryShareNotification(
  db: D1Database,
  env: any,
  noteId: number,
  teacherId: number,
  author: { id: number; first_name: string; last_name: string },
): Promise<DeliveryOutcome> {
  // R2 preflight — if the notification already exists (ledger got out of
  // sync but the alert was delivered), NEVER call notify() again.
  const pre = await coachNoteAlreadyDelivered(db, noteId, teacherId);
  if (pre.delivered) {
    await tryLedgerUpdate(db,
      `UPDATE coaching_note_share_delivery
          SET status='delivered', notif_id=COALESCE(notif_id, ?), updated_at=CURRENT_TIMESTAMP
        WHERE note_id=? AND status<>'delivered' AND status<>'suppressed'`,
      [pre.notifId, noteId], 'retry-preflight-repair');
    return { status: 'already_delivered' };
  }

  // Try to atomically transition failed → attempting.
  const flip = await db.prepare(
    `UPDATE coaching_note_share_delivery
        SET status='attempting', updated_at=CURRENT_TIMESTAMP, detail=NULL
      WHERE note_id=? AND status='failed'`
  ).bind(noteId).run();
  const won = ((flip.meta as any)?.changes || 0) === 1;
  if (!won) {
    const row = await db.prepare(
      `SELECT status FROM coaching_note_share_delivery WHERE note_id=?`
    ).bind(noteId).first<any>();
    if (!row) {
      // No delivery record at all yet — fall through to a fresh attempt
      // (rare corner: an admin manually cleaned the row, or the note
      // pre-dates migration 0014).
      return deliverShareNotification(db, env, noteId, teacherId, author);
    }
    if (row.status === 'delivered')  return { status: 'already_delivered' };
    if (row.status === 'suppressed') return { status: 'already_suppressed' };
    if (row.status === 'attempting') return { status: 'in_flight' };
    return { status: 'retry_not_eligible' };
  }
  // Won the flip.  Same phased-write pattern as deliverShareNotification.
  let notifId: number;
  try {
    notifId = await notify(db, {
      user_id: teacherId,
      kind: 'coach_note',
      title: `${author.first_name} ${author.last_name} shared coaching feedback with you`,
      body: 'Open your workspace to read the strengths, growth areas, and next step your coach shared.',
      url: '/teacher#coaching-feedback',
      entity_type: 'coaching_note',
      entity_id: noteId,
      actor_user_id: author.id,
    }, env);
  } catch (e) {
    const detail = (e as any)?.message || String(e);
    console.warn('coach_note notify retry failed', { noteId, teacherId, err: detail });
    await tryLedgerUpdate(db,
      `UPDATE coaching_note_share_delivery
          SET status='failed', detail=?, updated_at=CURRENT_TIMESTAMP
        WHERE note_id=? AND status='attempting'`,
      [detail.slice(0, 500), noteId], 'retry-mark-failed');
    return { status: 'failed', detail };
  }
  if (notifId > 0) {
    await tryLedgerUpdate(db,
      `UPDATE coaching_note_share_delivery
          SET status='delivered', notif_id=?, updated_at=CURRENT_TIMESTAMP
        WHERE note_id=? AND status='attempting'`,
      [notifId, noteId], 'retry-mark-delivered');
    return { status: 'delivered', notifId };
  }
  await tryLedgerUpdate(db,
    `UPDATE coaching_note_share_delivery
        SET status='suppressed', updated_at=CURRENT_TIMESTAMP
      WHERE note_id=? AND status='attempting'`,
    [noteId], 'retry-mark-suppressed');
  return { status: 'suppressed' };
}

/**
 * The per-note "did we ever deliver, or suppress, or fail?" view for the UI.
 * Reads coaching_note_share_delivery — NOT the inbox.  Returns:
 *   'delivered' | 'suppressed' | 'failed' | 'attempting' | 'never'
 * The coach view uses this to decide whether to show the "Notification not
 * delivered" badge + Resend button (only 'failed' or 'never' qualify).
 * 'suppressed' shows a different, informational badge (recipient opted out).
 */
async function shareDeliveryStatus(
  db: D1Database, noteId: number,
): Promise<'delivered'|'suppressed'|'failed'|'attempting'|'never'> {
  const row = await db.prepare(
    `SELECT status FROM coaching_note_share_delivery WHERE note_id=?`
  ).bind(noteId).first<any>();
  return (row?.status as any) || 'never';
}

/**
 * Truthful, human-readable message for a first-share attempt outcome.
 * The redirect handler stitches this onto the URL as ?msg=... so the coach
 * sees exactly what happened.  We NEVER lie about "retry in progress" —
 * failure paths always point at the manual Resend button.
 */
function firstShareMsg(outcome: DeliveryOutcome): string {
  switch (outcome.status) {
    case 'delivered':          return 'Shared with teacher.';
    case 'suppressed':         return 'Saved and shared. The teacher has turned off coach-note notifications, so no alert was sent.';
    case 'failed':             return 'Saved and shared. Notification did NOT deliver — use "Resend notification" in the entry to retry.';
    case 'already_delivered':  return 'Already shared with teacher.';
    case 'already_suppressed': return 'Already shared. (No notification: the teacher has turned off coach-note alerts.)';
    case 'in_flight':          return 'Saved and shared. Another delivery attempt is in progress — refresh in a moment.';
    case 'retry_not_eligible': return 'Saved and shared. Notification state is unusual — check the entry and use Resend if needed.';
  }
}

function retryMsg(outcome: DeliveryOutcome): string {
  switch (outcome.status) {
    case 'delivered':          return 'Notification sent.';
    case 'suppressed':         return 'The teacher has turned off coach-note notifications — no alert can be sent unless they re-enable it.';
    case 'failed':             return 'Notification retry failed — try again or contact support.';
    case 'already_delivered':  return 'Notification is already delivered.';
    case 'already_suppressed': return 'The teacher has turned off coach-note notifications — nothing to send.';
    case 'in_flight':          return 'Another retry is already in progress — refresh in a moment.';
    case 'retry_not_eligible': return 'Notification is not eligible for retry (unexpected state).';
  }
}

// ---- Super-admin write guard ---------------------------------------------
//
// C7 (Sept 23 correction) — for this release, super_admin is VIEW-ONLY on
// coaching notes.  They can inspect any note (drafts + shared) for support
// purposes but cannot create, edit, share, or notify-retry another coach's
// feedback.  A super_admin acting as themselves would also not have a
// coaching assignment to anyone, so requireCoachAssignment already blocks
// them from most POSTs — but a super_admin CAN pass requireCoachAssignment
// via its own super_admin bypass in src/lib/access.ts.  Add an explicit
// write-block that runs immediately after the assignment gate.
function refuseSuperAdminWrite(user: { role: string }): boolean {
  return user.role === 'super_admin';
}

// ---- POST: create a new coaching note ------------------------------------
//
// F1 (Sept 23, follow-up correction) — TRUE atomicity for the create path.
// The previous implementation split the write into two steps:
//     INSERT coaching_notes ... RETURNING id   (step 1, own transaction)
//     BATCH [ insert audit rows ]              (step 2, own transaction)
// A failure between steps left a committed note with no audit trail.
// This rewrite executes note + audit rows in ONE db.batch() so they land
// together or not at all:
//     BATCH [
//       INSERT coaching_notes ... RETURNING id,
//       INSERT INTO coaching_note_audit ... SELECT id FROM coaching_notes
//         WHERE author_id=? AND client_token=? AND ... action='create',
//       INSERT INTO coaching_note_audit ... SELECT id FROM coaching_notes
//         WHERE ... AND status='shared' AND action='share',      -- only if sharing
//     ]
// The audit SELECT clauses re-look-up the note by (author_id, client_token)
// rather than reading step 1's RETURNING result — D1 batches guarantee ONE
// transaction, so the audit rows see the fresh note.  When step 1 hit
// ON CONFLICT DO NOTHING (a retry with a token we've seen), the SELECT-in-
// INSERT for the 'create' audit finds the original row but is gated on
// created_at=? so it does NOT re-insert.
//
// To make the audit SELECT work reliably we now REQUIRE client_token on every
// insert — if the form didn't send one, we generate a server-side token
// (see serverToken()).  This also makes the (author_id, client_token) index
// the single source of truth for "did we write this row?".
//
// F3 — reused-token draft promotion.  Previously the retry branch could
// promote a stored draft to shared even if the incoming payload differed
// from what was saved (i.e., different evidence/glow/grow text).  New
// policy: token = identity of an operation.  If the retry POSTs a payload
// whose digest doesn't match the stored row's, we REJECT with a "content
// changed" message and direct the user to reopen the existing draft.
// This is safer than silently sharing content the coach may have edited
// after the original draft-save.  We also verify the existing row's
// teacher_id matches the URL path before doing anything.
//
// C7 — super_admin view-only, still enforced at the top.
app.post('/teachers/:id/notes', async (c) => {
  const user = c.get('user')!;
  const teacherId = Number(c.req.param('id'));
  if (!(await requireCoachAssignment(c.env.DB, user, teacherId))) {
    return c.text('Not assigned to this teacher', 403);
  }
  if (refuseSuperAdminWrite(user)) {
    return c.text('Super-admin support access is view-only for coaching notes. The assigned coach must author the entry.', 403);
  }
  const body = await c.req.parseBody();
  body.teacher_id = String(teacherId);
  const submitAction = String(body._action || 'draft'); // 'draft' | 'share'
  // F1: every row gets a client_token, either the form-supplied one or a
  // server-generated fallback.  This makes the audit-INSERT SELECT-lookup
  // deterministic and gives us the unique-index dedupe on retries.
  const clientToken = sanitizeClientToken(body._token) || serverToken();
  const parsed = parseCoachingNoteForm(body);
  const values = clampFields(parsed.values);
  const errors = [...parsed.errors];
  if (submitAction === 'share' && !hasMeaningfulContent(values)) {
    errors.push('Add at least one of: evidence, glow, growth, or next step before sharing.');
  }
  if (errors.length) {
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent(errors.join(' '))}#notes`);
  }
  const status = submitAction === 'share' ? 'shared' : 'draft';
  const now = nowSqlTimestamp();
  const digest = await payloadDigest(values);

  // F3 — check for prior use of this token BEFORE the atomic batch.  If a
  // row with this (author_id, client_token) already exists we're on a retry
  // path, and the retry branch is the only place that runs.  This keeps the
  // atomic-batch path (below) reserved for genuine first inserts.
  // Soft-deleted priors are ignored: if the original row was cleaned as
  // practice, the coach can re-use the same token for a genuine new save.
  const priorRow = await c.env.DB.prepare(
    `SELECT id, teacher_id, status, first_shared_at, version, payload_digest
       FROM coaching_notes WHERE author_id=? AND client_token=? AND deleted_at IS NULL`
  ).bind(user.id, clientToken).first<any>();

  if (priorRow) {
    // R1b (Sept 23 second follow-up) — revalidate on the retry branch too.
    // F3a: teacher_id mismatch on the reused token.
    if (Number(priorRow.teacher_id) !== teacherId) {
      return c.text('token belongs to a note for a different teacher', 409);
    }
    // F3b: payload changed — reject.
    if (priorRow.payload_digest && priorRow.payload_digest !== digest) {
      return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent(
        'This entry was already saved with different content. Reopen the existing entry (below) to edit or share it.'
      )}#notes`);
    }
    // F3c: identical retry — safe to promote if this call intends to share
    // and the row is still a draft.  R1: winner detection uses the
    // per-request writer_nonce.  UPDATE stamps writer_nonce=?; audit INSERT
    // filters `WHERE writer_nonce=?` — matches ONLY the row this request
    // updated.  Both in one db.batch().
    const nonce = requestNonce();
    let isFreshShare = false;
    if (status === 'shared' && priorRow.status !== 'shared') {
      const upd = await c.env.DB.batch([
        c.env.DB.prepare(
          `UPDATE coaching_notes
              SET status='shared', first_shared_at=?, updated_at=?, version = version + 1,
                  writer_nonce=?
            WHERE id=? AND status='draft' AND first_shared_at IS NULL AND version=?`
        ).bind(now, now, nonce, priorRow.id, priorRow.version),
        c.env.DB.prepare(
          `INSERT INTO coaching_note_audit (note_id, actor_id, action)
             SELECT id, ?, 'share' FROM coaching_notes
              WHERE id=? AND writer_nonce=?`
        ).bind(user.id, priorRow.id, nonce),
      ]);
      const changes = ((upd[0] as any)?.meta?.changes) || 0;
      isFreshShare = changes === 1;
    }
    // Only the promotion winner fires the notification.
    let msg: string;
    if (isFreshShare) {
      const outcome = await deliverShareNotification(c.env.DB, c.env, priorRow.id, teacherId, user);
      msg = firstShareMsg(outcome);
    } else {
      msg = status === 'shared'
        ? (priorRow.status === 'shared' ? 'Already shared with teacher.' : 'Saved as draft (retry).')
        : 'Draft already saved.';
    }
    try {
      await logActivity(c.env.DB, user.id, 'coaching_note', priorRow.id,
        isFreshShare ? 'share_note' : 'retry_no_op',
        { teacherId, retry: true });
    } catch (e) { console.warn('logActivity failed (non-fatal)', (e as any)?.message || e); }
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent(msg)}#notes`);
  }

  // ---- Fresh insert path — TRULY ATOMIC in one db.batch() ----------------
  //
  // R1 (Sept 23 second follow-up).  The previous implementation used
  // second-precision `created_at` to determine "did WE write this row?".
  // Two same-second requests could both satisfy `created_at=?` — a losing
  // INSERT (0 rows via ON CONFLICT) would still find the winner's row, so
  // both requests wrote audit rows AND both entered the notify path.
  //
  // Fix: stamp a per-request `writer_nonce` (UUID) on the row's
  // `writer_nonce` column.  Audit-INSERT SELECT-in-INSERT filters on
  // `WHERE writer_nonce=?`.  Because the nonce is unique per request:
  //   * Our INSERT wrote the row → row.writer_nonce = OUR nonce →
  //     audit-INSERT matches → audit row lands.
  //   * Our INSERT lost to ON CONFLICT → row.writer_nonce = WINNER's
  //     nonce → audit-INSERT matches 0 rows → no-op.
  //
  // The winner signal is `INSERT ... RETURNING id, teacher_id, status,
  // payload_digest` — reading results.length is atomic mutation-result
  // truth from SQLite itself.  We use that (not the writer_nonce roundtrip)
  // to branch on winner/loser AFTER the batch commits.
  const nonce = requestNonce();
  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO coaching_notes
         (author_id, teacher_id, occurred_on, class_context, evidence, glow, grow, next_step, follow_up_on,
          status, first_shared_at, client_token, payload_digest, writer_nonce, version, created_at, updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
       ON CONFLICT (author_id, client_token) WHERE client_token IS NOT NULL DO NOTHING
       RETURNING id, teacher_id, status, payload_digest, first_shared_at`
    ).bind(
      user.id, teacherId, values.occurred_on, values.class_context, values.evidence,
      values.glow, values.grow, values.next_step, values.follow_up_on,
      status, status === 'shared' ? now : null, clientToken, digest, nonce, now, now
    ),
    c.env.DB.prepare(
      `INSERT INTO coaching_note_audit (note_id, actor_id, action)
         SELECT id, ?, 'create' FROM coaching_notes
          WHERE author_id=? AND client_token=? AND writer_nonce=?`
    ).bind(user.id, user.id, clientToken, nonce),
  ];
  if (status === 'shared') {
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO coaching_note_audit (note_id, actor_id, action)
           SELECT id, ?, 'share' FROM coaching_notes
            WHERE author_id=? AND client_token=? AND writer_nonce=? AND status='shared'`
      ).bind(user.id, user.id, clientToken, nonce)
    );
  }
  const batchRes = await c.env.DB.batch(stmts);

  // R1: winner detection = the RETURNING result of Statement A, NOT any
  // timestamp comparison.  results.length===1 iff SQLite actually inserted
  // a row on this request; ===0 iff ON CONFLICT DO NOTHING suppressed it.
  const returnedRows = ((batchRes[0] as any)?.results as any[]) || [];
  const wonInsert = returnedRows.length === 1;

  let noteId: number;
  let isFreshShare = false;

  if (wonInsert) {
    // We wrote the row and (in the same batch) the audit rows.  The
    // returned row is authoritative — no re-SELECT needed.
    noteId = Number(returnedRows[0].id);
    isFreshShare = status === 'shared';
  } else {
    // R1b: post-conflict revalidation.  We lost to a concurrent request
    // that reserved (author_id, client_token) first.  BEFORE returning
    // success or firing a notification, verify the stored row is actually
    // ours to talk about: same teacher, same payload, same intended
    // status.  If ANY of those diverge, refuse — a concurrent request
    // wrote something different under our token.
    const stored = await c.env.DB.prepare(
      `SELECT id, teacher_id, status, payload_digest, first_shared_at
         FROM coaching_notes WHERE author_id=? AND client_token=? AND deleted_at IS NULL`
    ).bind(user.id, clientToken).first<any>();
    if (!stored) return c.text('save failed', 500);
    if (Number(stored.teacher_id) !== teacherId) {
      return c.text('token belongs to a note for a different teacher', 409);
    }
    if (stored.payload_digest && stored.payload_digest !== digest) {
      return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent(
        'This entry was already saved with different content. Reopen the existing entry (below) to edit or share it.'
      )}#notes`);
    }
    noteId = Number(stored.id);
    // If we requested share but the stored row is still a draft, the
    // concurrent winner saved as draft — we did NOT get to promote (that
    // would require the promote-branch above, which only runs if priorRow
    // was known before the batch).  Report the truthful state: the note
    // is a draft; NOT falsely say "shared".
    if (status === 'shared' && stored.status !== 'shared') {
      return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent(
        'This entry was just saved as a draft by an earlier request. Reopen it and click "Share with teacher" to send it.'
      )}#notes`);
    }
    // status matches → duplicate retry that happened to hit the batch
    // path.  No audit, no notification.
  }

  let msg: string;
  if (isFreshShare) {
    const outcome = await deliverShareNotification(c.env.DB, c.env, noteId, teacherId, user);
    msg = firstShareMsg(outcome);
  } else if (wonInsert) {
    msg = 'Draft saved.';
  } else {
    msg = status === 'shared'
      ? 'Already shared with teacher.'
      : 'Draft already saved.';
  }
  try {
    await logActivity(c.env.DB, user.id, 'coaching_note', noteId,
      isFreshShare ? 'share_note' : (wonInsert ? 'save_draft' : 'retry_no_op'),
      { teacherId, fresh: wonInsert });
  } catch (e) { console.warn('logActivity failed (non-fatal)', (e as any)?.message || e); }
  return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent(msg)}#notes`);
});

// ---- POST: update an existing coaching note ------------------------------
//
// Handles three cases, decided by the _action field:
//   * 'draft_save'  → only valid on drafts.  Saves without validating
//                     meaningful content; strength-only OK.
//   * 'draft_share' → only valid on drafts.  Validates meaningful content,
//                     atomically transitions to shared, fires the ONE
//                     share notification.
//   * 'shared_save' → only valid on already-shared entries.  Validates
//                     meaningful content, updates in place, marks 'revised'
//                     in the audit table.  Never fires a second notification.
// Any mismatch (e.g. 'draft_save' on a shared row) is refused so a stale
// form cannot silently empty a shared note.
app.post('/teachers/:teacherId/notes/:noteId/update', async (c) => {
  const user = c.get('user')!;
  const teacherId = Number(c.req.param('teacherId'));
  const noteId = Number(c.req.param('noteId'));
  if (!(await requireCoachAssignment(c.env.DB, user, teacherId))) {
    return c.text('Not assigned to this teacher', 403);
  }
  // C7: super_admin support is view-only on coaching notes.
  if (refuseSuperAdminWrite(user)) {
    return c.text('Super-admin support access is view-only for coaching notes. Only the authoring coach can edit or share.', 403);
  }
  const existing = await c.env.DB.prepare(
    // Ownership check filters soft-deleted notes so an admin-cleaned note
    // cannot be edited via a stale form URL.
    `SELECT * FROM coaching_notes WHERE id=? AND teacher_id=? AND deleted_at IS NULL`
  ).bind(noteId, teacherId).first<any>();
  if (!existing) return c.text('Note not found', 404);
  // C7 tightening: author ownership is now REQUIRED — super_admin no longer
  // has an ownership override.  Any support intervention that needs write
  // access must go through the author's account.
  if (existing.author_id !== user.id) {
    return c.text('Not your note', 403);
  }
  const body = await c.req.parseBody();
  body.teacher_id = String(teacherId);
  const submitAction = String(body._action || '');
  const submittedVersion = Number(body._version || 0);

  const parsed = parseCoachingNoteForm(body);
  const values = clampFields(parsed.values);
  const errors = [...parsed.errors];

  // Enforce which action is valid for the current status.  For shared entries
  // hit with a draft-side action (or vice versa) we return a friendly 302
  // with a message rather than a bare 400 — that also covers the "5 concurrent
  // draft_shares race" case where 4 losers see the note as already shared
  // when they arrive.  A hard 400 was rejecting duplicate submits with an
  // ugly error page.
  const isSharedNow = existing.status === 'shared';
  if (isSharedNow && submitAction !== 'shared_save') {
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Already shared. Use "Save and share changes" to update.')}#notes`);
  }
  if (!isSharedNow && submitAction !== 'draft_save' && submitAction !== 'draft_share') {
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Invalid action for a draft entry.')}#notes`);
  }
  // Meaningful-content check runs for BOTH visible-to-teacher transitions.
  const needsMeaningful = submitAction === 'draft_share' || submitAction === 'shared_save';
  if (needsMeaningful && !hasMeaningfulContent(values)) {
    errors.push('Add at least one of: evidence, glow, growth, or next step before sharing.');
  }
  if (errors.length) {
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent(errors.join(' '))}#notes`);
  }
  const now = new Date().toISOString().replace('T',' ').slice(0,19);

  // R1 (Sept 23 second follow-up) — atomic writes gated on writer_nonce,
  // NOT timestamps.  Every UPDATE stamps writer_nonce=? with a fresh UUID;
  // the audit INSERT's SELECT-in-INSERT filters on `WHERE writer_nonce=?`.
  // Because the nonce is unique per request, only the mutation winner's
  // audit row ever lands.  A concurrent request that lost the version race
  // UPDATEs 0 rows (its nonce never stamped) AND its audit SELECT matches
  // 0 rows — both no-ops.  batch() keeps them in one transaction.
  const nonce = requestNonce();

  if (submitAction === 'draft_save') {
    const batchRes = await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE coaching_notes
            SET occurred_on=?, class_context=?, evidence=?, glow=?, grow=?, next_step=?, follow_up_on=?,
                updated_at=?, version = version + 1, writer_nonce=?
          WHERE id=? AND status='draft' AND version=?`
      ).bind(
        values.occurred_on, values.class_context, values.evidence, values.glow, values.grow,
        values.next_step, values.follow_up_on, now, nonce, noteId, submittedVersion,
      ),
      c.env.DB.prepare(
        `INSERT INTO coaching_note_audit (note_id, actor_id, action)
           SELECT id, ?, 'edit' FROM coaching_notes
            WHERE id=? AND writer_nonce=?`
      ).bind(user.id, noteId, nonce),
    ]);
    const changes = ((batchRes[0] as any)?.meta?.changes) || 0;
    if (changes !== 1) {
      return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Someone else updated this draft — reopen it and try again.')}#notes`);
    }
    try {
      await logActivity(c.env.DB, user.id, 'coaching_note', noteId, 'update_note', { teacherId, transition: 'draft→draft' });
    } catch (e) { console.warn('logActivity failed (non-fatal)', (e as any)?.message || e); }
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Draft saved.')}#notes`);
  }

  if (submitAction === 'draft_share') {
    // Draft → shared, atomic via ONE batch.  UPDATE guards on
    // (draft, first_shared_at IS NULL, version=?); audit INSERT gates on
    // writer_nonce=? so only the winner records the audit row.
    const batchRes = await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE coaching_notes
            SET occurred_on=?, class_context=?, evidence=?, glow=?, grow=?, next_step=?, follow_up_on=?,
                status='shared', first_shared_at=?, updated_at=?, version = version + 1, writer_nonce=?
          WHERE id=? AND status='draft' AND first_shared_at IS NULL AND version=?`
      ).bind(
        values.occurred_on, values.class_context, values.evidence, values.glow, values.grow,
        values.next_step, values.follow_up_on, now, now, nonce, noteId, submittedVersion,
      ),
      c.env.DB.prepare(
        `INSERT INTO coaching_note_audit (note_id, actor_id, action)
           SELECT id, ?, 'share' FROM coaching_notes
            WHERE id=? AND writer_nonce=? AND status='shared'`
      ).bind(user.id, noteId, nonce),
    ]);
    const changes = ((batchRes[0] as any)?.meta?.changes) || 0;
    if (changes !== 1) {
      return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Already shared or updated by another request.')}#notes`);
    }
    const outcome = await deliverShareNotification(c.env.DB, c.env, noteId, teacherId, user);
    const msg = firstShareMsg(outcome);
    try {
      await logActivity(c.env.DB, user.id, 'coaching_note', noteId, 'share_note', { teacherId, delivery: outcome.status });
    } catch (e) { console.warn('logActivity failed (non-fatal)', (e as any)?.message || e); }
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent(msg)}#notes`);
  }

  if (submitAction === 'shared_save') {
    // Shared → shared (revised).  Same nonce-based winner detection.
    const batchRes = await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE coaching_notes
            SET occurred_on=?, class_context=?, evidence=?, glow=?, grow=?, next_step=?, follow_up_on=?,
                updated_at=?, version = version + 1, writer_nonce=?
          WHERE id=? AND status='shared' AND version=?`
      ).bind(
        values.occurred_on, values.class_context, values.evidence, values.glow, values.grow,
        values.next_step, values.follow_up_on, now, nonce, noteId, submittedVersion,
      ),
      c.env.DB.prepare(
        `INSERT INTO coaching_note_audit (note_id, actor_id, action)
           SELECT id, ?, 'reshare' FROM coaching_notes
            WHERE id=? AND writer_nonce=? AND status='shared'`
      ).bind(user.id, noteId, nonce),
    ]);
    const changes = ((batchRes[0] as any)?.meta?.changes) || 0;
    if (changes !== 1) {
      return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Someone else updated this shared entry — reopen it and try again.')}#notes`);
    }
    try {
      await logActivity(c.env.DB, user.id, 'coaching_note', noteId, 'update_note', { teacherId, transition: 'shared→shared_revised' });
    } catch (e) { console.warn('logActivity failed (non-fatal)', (e as any)?.message || e); }
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Saved and shared changes.')}#notes`);
  }

  return c.text('Unrecognised action', 400);
});

// F2 (Sept 23 follow-up) — the recovery endpoint uses the coaching_note_
// share_delivery table for atomic dedupe.  Two simultaneous retry requests
// race on `UPDATE ... WHERE status='failed'`; exactly ONE wins and calls
// notify().  The loser reads the row and returns "in progress" or the
// terminal outcome.  Deleting the recipient's inbox row does NOT re-arm
// this endpoint — the share_delivery row is the source of truth.
//
// Preference-driven suppression is reported honestly: if the recipient has
// turned off coach_note alerts (either master switch or per-kind pref), the
// UI shows "recipient opted out" — that is NOT a delivery failure and the
// endpoint will refuse to keep retrying it (returning already_suppressed).
app.post('/teachers/:teacherId/notes/:noteId/notify-retry', async (c) => {
  const user = c.get('user')!;
  const teacherId = Number(c.req.param('teacherId'));
  const noteId = Number(c.req.param('noteId'));
  if (!(await requireCoachAssignment(c.env.DB, user, teacherId))) {
    return c.text('Not assigned to this teacher', 403);
  }
  if (refuseSuperAdminWrite(user)) {
    return c.text('Super-admin support access is view-only for coaching notes.', 403);
  }
  const existing = await c.env.DB.prepare(
    `SELECT id, author_id, teacher_id, status FROM coaching_notes WHERE id=? AND teacher_id=? AND deleted_at IS NULL`
  ).bind(noteId, teacherId).first<any>();
  if (!existing) return c.text('Note not found', 404);
  if (existing.author_id !== user.id) {
    return c.text('Only the author may retry the share notification.', 403);
  }
  if (existing.status !== 'shared') {
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Note is a draft — nothing to notify.')}#notes`);
  }
  const outcome = await retryShareNotification(c.env.DB, c.env, noteId, teacherId, user);
  const msg = retryMsg(outcome);
  try {
    await logActivity(c.env.DB, user.id, 'coaching_note', noteId, 'notify_retry', { teacherId, outcome: outcome.status });
  } catch (e) { console.warn('logActivity failed (non-fatal)', (e as any)?.message || e); }
  return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent(msg)}#notes`);
});

export default app;

// ============================== VIEWS ==============================

function CoachHome({ user, teachers, welcome }: any) {
  return (
    <Layout title="My Teachers" user={user} activeNav="co-home" autoLaunchTour={!!welcome}>
      <h1 class="font-display text-2xl text-aps-navy mb-1">My Teachers</h1>
      <p class="text-slate-600 text-sm mb-6">Instructional coach view — focus areas and teacher-facing feedback only. You do not see scores or appraiser private notes.</p>
      {teachers.length === 0 ? (
        <Card><p class="text-slate-500 text-sm">No teachers are currently assigned to you as coach.</p></Card>
      ) : (
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-tour="co-teachers">
          {teachers.map((t: any) => (
            <Card>
              <div class="flex items-start justify-between">
                <div>
                  <div class="font-display text-lg text-aps-navy">{t.first_name} {t.last_name}</div>
                  <div class="text-sm text-slate-600">{t.title || 'Teacher'}</div>
                </div>
                <div class="w-10 h-10 rounded-full bg-aps-sky text-aps-navy font-bold flex items-center justify-center">{t.first_name[0]}{t.last_name[0]}</div>
              </div>
              <div class="text-sm text-slate-600 mt-3">
                <i class="fas fa-bullseye text-aps-gold mr-1"></i>
                <strong>{t.focusCount}</strong> active focus area{t.focusCount===1?'':'s'}
              </div>
              <a href={`/coach/teachers/${t.id}`} class="inline-flex items-center gap-1 mt-3 text-sm px-3 py-1.5 rounded-md bg-aps-navy text-white hover:bg-aps-blue"><i class="fas fa-folder-open"></i>Open coaching view</a>
            </Card>
          ))}
        </div>
      )}
    </Layout>
  );
}

// Server-side UUID for the note-form idempotency token.  The Cloudflare
// Workers runtime exposes crypto.randomUUID() natively, so this stays inside
// the SSR render — no client-side JS execution required.  Repeated form
// submits from the browser include the same token; the server INSERT
// collapses duplicates via the (author_id, client_token) unique index.
function cryptoUuid(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g: any = globalThis as any;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  // Deterministic fallback for non-Workers test envs; NOT security-sensitive
  // here — the token only prevents accidental double-submits from one user.
  return 'ct_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function CoachTeacher({ user, teacher, observations, focusAreas, modules, coachingNotes, msg }: any) {
  modules = modules || [];
  coachingNotes = coachingNotes || [];
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Layout title={`${teacher.first_name} ${teacher.last_name}`} user={user} activeNav="co-home">
      <div class="mb-4"><a href="/coach" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>Back</a></div>
      <div class="mb-4">
        <h1 class="font-display text-2xl text-aps-navy">{teacher.first_name} {teacher.last_name}</h1>
        <p class="text-slate-600 text-sm">{teacher.title || 'Teacher'} · {teacher.email}</p>
        <p class="text-xs text-slate-500 mt-1 italic"><i class="fas fa-shield-alt mr-1"></i>Coach view — you see focus areas and teacher-facing feedback only. Scores and evaluator private notes are confidential.</p>
      </div>

      {msg && <div class="mb-3 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}

      {/* SECTION 3 — Non-evaluative coaching feedback.  Deliberately separated
          from Published Feedback (below) so the coach entry, the evaluator
          feedback, and the automated PD library never blend into each other.
          Draft = author-only; Shared = author + subject teacher; no other coach
          or principal sees these entries automatically. */}
      <div id="notes">
      <Card title="Non-evaluative coaching feedback" icon="fas fa-comment-medical" class="mb-4">
        <p class="text-xs text-slate-500 italic mb-3">
          <i class="fas fa-info-circle mr-1"></i>
          These entries are separate from formal observations. They never score, never enroll the teacher in PD, and never appear in evaluation exports.
          <span class="block mt-1">
            Drafts are visible to you and to platform support (Super Administrator, view-only). Shared entries are visible to you, <strong>{teacher.first_name}</strong>, and platform support — not to other coaches, principals, or district dashboards.
          </span>
        </p>

        {/* New-note form.
            The hidden _token is a per-form UUID generated in inline JS on
            load; a double-submit collapses server-side via the
            (author_id, client_token) unique index (migration 0013).
            C7: super_admin support is view-only, so the new-note form is
            hidden for them (they'd 403 on submit anyway). */}
        {user.role === 'super_admin' ? (
          <div class="mb-4 text-xs text-slate-500 italic border border-slate-200 rounded p-3 bg-slate-50">
            <i class="fas fa-eye mr-1"></i>Super-admin support view. You can see this coach's entries but cannot author, edit, share, or resend notifications for them.
          </div>
        ) : (
        <form method="post" action={`/coach/teachers/${teacher.id}/notes`}
              class="border border-slate-200 rounded p-3 bg-slate-50 mb-4"
              onsubmit="try{this.querySelectorAll('button[type=submit]').forEach(b=>{b.disabled=true;b.dataset.oldText=b.innerText;b.innerText='Saving…';});}catch(e){}">
          <input type="hidden" name="_token" value={cryptoUuid()} />
          <div class="grid md:grid-cols-3 gap-3 text-sm">
            <label class="block">
              <span class="block text-xs font-medium text-slate-700 mb-1">Date of observation/conversation <span class="text-red-600">*</span></span>
              <input type="date" name="occurred_on" required value={today} class="w-full border border-slate-300 rounded px-2 py-1.5" />
            </label>
            <label class="block md:col-span-2">
              <span class="block text-xs font-medium text-slate-700 mb-1">Classroom context <span class="text-slate-400 font-normal">(optional)</span></span>
              <input type="text" name="class_context" maxLength={200} placeholder="e.g., 3rd hour geometry, 22 students" class="w-full border border-slate-300 rounded px-2 py-1.5" />
            </label>
            <label class="block md:col-span-3">
              <span class="block text-xs font-medium text-slate-700 mb-1">Evidence / what you noticed</span>
              <textarea name="evidence" rows={3} maxLength={8000} placeholder="Specifics from the visit or conversation" class="w-full border border-slate-300 rounded px-2 py-1.5 font-body"></textarea>
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-emerald-700 mb-1"><i class="fas fa-star mr-1"></i>Strengths / glow</span>
              <textarea name="glow" rows={3} maxLength={8000} placeholder="A strength-only entry is fine — you don't need to identify a deficiency." class="w-full border border-slate-300 rounded px-2 py-1.5 font-body"></textarea>
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-sky-700 mb-1"><i class="fas fa-seedling mr-1"></i>Growth opportunity</span>
              <textarea name="grow" rows={3} maxLength={8000} placeholder="What could stretch this practice further?" class="w-full border border-slate-300 rounded px-2 py-1.5 font-body"></textarea>
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-amber-700 mb-1"><i class="fas fa-forward mr-1"></i>Agreed next step</span>
              <textarea name="next_step" rows={3} maxLength={8000} placeholder="What did you agree to try next?" class="w-full border border-slate-300 rounded px-2 py-1.5 font-body"></textarea>
            </label>
            <label class="block">
              <span class="block text-xs font-medium text-slate-700 mb-1">Follow-up date <span class="text-slate-400 font-normal">(optional)</span></span>
              <input type="date" name="follow_up_on" class="w-full border border-slate-300 rounded px-2 py-1.5" />
            </label>
          </div>
          <div class="mt-3 flex flex-wrap items-center gap-2">
            <button type="submit" name="_action" value="draft" class="bg-slate-600 hover:bg-slate-700 text-white px-3 py-1.5 rounded text-sm">
              <i class="fas fa-floppy-disk mr-1"></i>Save draft
            </button>
            <button type="submit" name="_action" value="share" class="bg-aps-navy hover:bg-aps-blue text-white px-3 py-1.5 rounded text-sm">
              <i class="fas fa-paper-plane mr-1"></i>Share with teacher
            </button>
            <span class="text-[11px] text-slate-500 ml-2">Sharing sends {teacher.first_name} one notification and makes this note visible to them. Requires evidence, glow, growth, or next step.</span>
          </div>
        </form>
        )}

        {/* Existing notes list */}
        {coachingNotes.length === 0 ? (
          <p class="text-sm text-slate-500 italic">No coaching notes yet for {teacher.first_name}.</p>
        ) : (
          <ul class="space-y-3">
            {coachingNotes.map((n: any) => (
              <li class="border border-slate-200 rounded p-3 bg-white">
                <div class="flex items-start justify-between gap-3 flex-wrap">
                  <div class="text-xs text-slate-600">
                    <span class="font-medium text-aps-navy">{formatDate(n.occurred_on)}</span>
                    {n.class_context ? <span> · {n.class_context}</span> : null}
                    <span class="ml-2">
                      {n.status === 'shared'
                        ? <span class="text-emerald-700"><i class="fas fa-eye mr-1"></i>Shared {n.first_shared_at ? formatDate(n.first_shared_at) : ''}</span>
                        : <span class="text-slate-500"><i class="fas fa-lock mr-1"></i>Draft — only you and platform support can see this</span>}
                    </span>
                    {/* F2 (Sept 23 follow-up): delivery-status badges read
                        the coaching_note_share_delivery table.  Three
                        user-visible states beyond the happy path:
                          - 'failed' or 'never'  → yellow warning + Resend button
                          - 'suppressed'         → grey info badge (recipient opted out;
                                                    Resend is deliberately NOT offered — a
                                                    retry can't override the recipient's
                                                    preference)
                          - 'attempting'         → blue transient badge, no Resend button
                                                    (a delivery attempt is in flight) */}
                    {n.status === 'shared' && (n.delivery_status === 'failed' || n.delivery_status === 'never') && (
                      <span class="ml-2 inline-flex items-center gap-2">
                        <span class="text-amber-800 bg-amber-100 border border-amber-300 rounded px-2 py-0.5 text-[11px]">
                          <i class="fas fa-triangle-exclamation mr-1"></i>Notification not delivered
                        </span>
                        {n.author_id === user.id && (
                          <form method="post" action={`/coach/teachers/${teacher.id}/notes/${n.id}/notify-retry`} class="inline">
                            <button class="text-[11px] text-aps-blue hover:underline"><i class="fas fa-bell mr-1"></i>Resend notification</button>
                          </form>
                        )}
                      </span>
                    )}
                    {n.status === 'shared' && n.delivery_status === 'suppressed' && (
                      <span class="ml-2 inline-flex items-center gap-2">
                        <span class="text-slate-700 bg-slate-100 border border-slate-300 rounded px-2 py-0.5 text-[11px]" title="The teacher has turned off coach-note notifications in their preferences.">
                          <i class="fas fa-bell-slash mr-1"></i>Recipient opted out of alerts
                        </span>
                      </span>
                    )}
                    {n.status === 'shared' && n.delivery_status === 'attempting' && (
                      <span class="ml-2 inline-flex items-center gap-2">
                        <span class="text-sky-800 bg-sky-100 border border-sky-300 rounded px-2 py-0.5 text-[11px]">
                          <i class="fas fa-hourglass-half mr-1"></i>Delivery in progress
                        </span>
                      </span>
                    )}
                    {n.author_id !== user.id && <span class="ml-2 text-slate-500 italic">by {n.author_first} {n.author_last}</span>}
                  </div>
                  <div class="text-[11px] text-slate-400">Updated {formatDateTime(n.updated_at)}</div>
                </div>
                <div class="grid md:grid-cols-2 gap-3 mt-3 text-sm">
                  {n.evidence && (
                    <div><div class="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Evidence</div><Prose text={n.evidence} size="sm" /></div>
                  )}
                  {n.glow && (
                    <div><div class="text-[11px] uppercase tracking-wide text-emerald-700 mb-1">Strengths</div><Prose text={n.glow} size="sm" /></div>
                  )}
                  {n.grow && (
                    <div><div class="text-[11px] uppercase tracking-wide text-sky-700 mb-1">Growth</div><Prose text={n.grow} size="sm" /></div>
                  )}
                  {n.next_step && (
                    <div><div class="text-[11px] uppercase tracking-wide text-amber-700 mb-1">Next step {n.follow_up_on ? <span class="text-slate-500 normal-case font-normal">(follow up {formatDate(n.follow_up_on)})</span> : null}</div><Prose text={n.next_step} size="sm" /></div>
                  )}
                </div>
                {/* Edit affordance — AUTHOR ONLY.  C7 tightening: super_admin
                    support is view-only on coaching notes, so we no longer
                    render the edit form for them.  R3 rules unchanged:
                    shared entries expose ONE explicit "Save and share changes"
                    action, drafts keep Save-draft / Share buttons, _version
                    is submitted for optimistic locking. */}
                {n.author_id === user.id && (
                  <details class="mt-3">
                    <summary class="cursor-pointer text-xs text-aps-blue hover:underline"><i class="fas fa-pen mr-1"></i>Edit this entry</summary>
                    <form method="post" action={`/coach/teachers/${teacher.id}/notes/${n.id}/update`}
                          class="mt-2 border border-slate-200 rounded p-3 bg-slate-50"
                          onsubmit="try{this.querySelectorAll('button[type=submit]').forEach(b=>{b.disabled=true;b.dataset.oldText=b.innerText;b.innerText='Saving…';});}catch(e){}">
                      <input type="hidden" name="_version" value={n.version || 1} />
                      <div class="grid md:grid-cols-3 gap-3 text-sm">
                        <label><span class="block text-xs font-medium text-slate-700 mb-1">Date</span>
                          <input type="date" name="occurred_on" required value={n.occurred_on} class="w-full border border-slate-300 rounded px-2 py-1.5" />
                        </label>
                        <label class="md:col-span-2"><span class="block text-xs font-medium text-slate-700 mb-1">Classroom context</span>
                          <input type="text" name="class_context" maxLength={200} value={n.class_context || ''} class="w-full border border-slate-300 rounded px-2 py-1.5" />
                        </label>
                        <label class="md:col-span-3"><span class="block text-xs font-medium text-slate-700 mb-1">Evidence</span>
                          <textarea name="evidence" rows={3} maxLength={8000} class="w-full border border-slate-300 rounded px-2 py-1.5 font-body">{n.evidence || ''}</textarea>
                        </label>
                        <label><span class="block text-xs font-medium text-emerald-700 mb-1">Strengths / glow</span>
                          <textarea name="glow" rows={3} maxLength={8000} class="w-full border border-slate-300 rounded px-2 py-1.5 font-body">{n.glow || ''}</textarea>
                        </label>
                        <label><span class="block text-xs font-medium text-sky-700 mb-1">Growth</span>
                          <textarea name="grow" rows={3} maxLength={8000} class="w-full border border-slate-300 rounded px-2 py-1.5 font-body">{n.grow || ''}</textarea>
                        </label>
                        <label><span class="block text-xs font-medium text-amber-700 mb-1">Next step</span>
                          <textarea name="next_step" rows={3} maxLength={8000} class="w-full border border-slate-300 rounded px-2 py-1.5 font-body">{n.next_step || ''}</textarea>
                        </label>
                        <label><span class="block text-xs font-medium text-slate-700 mb-1">Follow-up date</span>
                          <input type="date" name="follow_up_on" value={n.follow_up_on || ''} class="w-full border border-slate-300 rounded px-2 py-1.5" />
                        </label>
                      </div>
                      <div class="mt-3 flex flex-wrap items-center gap-2">
                        {n.status === 'shared' ? (
                          <>
                            <button type="submit" name="_action" value="shared_save" class="bg-aps-navy hover:bg-aps-blue text-white px-3 py-1.5 rounded text-xs">
                              <i class="fas fa-paper-plane mr-1"></i>Save and share changes
                            </button>
                            <span class="text-[11px] text-slate-500">This entry is already visible to {teacher.first_name}. Saving updates the visible entry and marks it as revised. No second notification is sent.</span>
                          </>
                        ) : (
                          <>
                            <button type="submit" name="_action" value="draft_save" class="bg-slate-600 hover:bg-slate-700 text-white px-3 py-1.5 rounded text-xs">
                              <i class="fas fa-floppy-disk mr-1"></i>Save draft
                            </button>
                            <button type="submit" name="_action" value="draft_share" class="bg-aps-navy hover:bg-aps-blue text-white px-3 py-1.5 rounded text-xs">
                              <i class="fas fa-paper-plane mr-1"></i>Share with teacher
                            </button>
                            <span class="text-[11px] text-slate-500">(first share sends one notification)</span>
                          </>
                        )}
                      </div>
                    </form>
                  </details>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      </div>

      {/* Fix 4 — coach manual recommendation.  Sits beneath the persona banner
          so the no-scores rule is visually reinforced: the coach picks a PD
          module from the library and writes a note, but never sees a rubric
          level or evaluator comment. */}
      <Card title="Recommend a PD module" icon="fas fa-hand-pointer" class="mb-4">
        {modules.length === 0 ? (
          <p class="text-sm text-slate-500">No active PD modules in the library yet.</p>
        ) : (
          <form method="post" action={`/coach/teachers/${teacher.id}/recommend-module`} class="grid md:grid-cols-3 gap-2 items-end">
            <label class="block text-xs text-slate-600 md:col-span-1">
              <span class="block mb-1 font-medium">Module</span>
              <select name="module_id" required class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
                <option value="">— Select a module —</option>
                {modules.map((m: any) => (
                  <option value={m.id}>
                    {m.domain_code}.{(m.indicator_code || '').toUpperCase()} · {m.title} ({m.est_minutes}m)
                  </option>
                ))}
              </select>
            </label>
            <label class="block text-xs text-slate-600 md:col-span-2">
              <span class="block mb-1 font-medium">Note for the teacher <span class="text-slate-400 font-normal">(optional)</span></span>
              <input name="note" type="text"
                placeholder="Why this module is worth their time"
                class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
            </label>
            <div class="md:col-span-3">
              <button class="bg-aps-navy hover:bg-aps-blue text-white px-3 py-1.5 rounded text-sm">
                <i class="fas fa-paper-plane mr-1"></i>Recommend module
              </button>
              <span class="text-[11px] text-slate-500 ml-2">The teacher will see this on their dashboard.</span>
            </div>
          </form>
        )}
      </Card>

      <Card title="Active Focus Areas" icon="fas fa-bullseye">
        {focusAreas.length === 0 ? <p class="text-slate-500 text-sm">No active focus areas for this teacher.</p> :
          <ul class="space-y-3">
            {focusAreas.map((f: any) => (
              <li class="border border-slate-200 rounded-md p-3">
                <div class="text-xs text-slate-500">{f.domain_code}.{(f.indicator_code || '').toUpperCase()} · {f.indicator_name}</div>
                <div class="font-medium text-aps-navy text-lg">{f.title}</div>
                {f.description && <div class="mt-1"><Prose text={f.description} size="sm" /></div>}
                <div class="text-xs text-slate-400 mt-2">Opened {formatDate(f.opened_at)}</div>
              </li>
            ))}
          </ul>
        }
      </Card>

      <h2 class="font-display text-xl text-aps-navy mt-8 mb-3">Published Feedback (no scores)</h2>
      {observations.length === 0 && <Card><p class="text-slate-500 text-sm">No published observation feedback yet.</p></Card>}
      <div class="space-y-4">
        {observations.map((o: any) => (
          <Card>
            <div class="flex items-center justify-between">
              <div>
                <div class="font-display text-aps-navy">{o.observation_type === 'mini' ? 'Mini-Observation' : o.observation_type === 'formal' ? 'Formal Observation' : 'Annual Summary'}</div>
                <div class="text-xs text-slate-500">{formatDateTime(o.observed_at)} · {o.subject || o.class_context || '—'} · by {o.a_first} {o.a_last}</div>
              </div>
              <span class={`px-2 py-0.5 rounded-full text-xs border ${statusBadge(o.status)}`}>{statusLabel(o.status)}</span>
            </div>
            {o.overall_summary && <div class="mt-3"><Prose text={o.overall_summary} size="sm" /></div>}
            <div class="grid md:grid-cols-2 gap-3 mt-3">
              {['glow','grow','focus_area','next_step'].map((cat: string) => {
                const items = o.feedback.filter((f: any) => f.category === cat);
                if (items.length === 0) return null;
                const labels: any = { glow: 'Strengths', grow: 'Growth areas', focus_area: 'Focus areas', next_step: 'Next steps' };
                const accents: any = { glow:'border-emerald-200', grow:'border-sky-200', focus_area:'border-amber-200', next_step:'border-slate-200' };
                return (
                  <div class={`border ${accents[cat]} rounded p-3 bg-slate-50`}>
                    <div class="text-xs font-medium text-slate-600 mb-2 uppercase tracking-wide">{labels[cat]}</div>
                    <ul class="space-y-2">
                      {items.map((f: any) => (
                        <li class="text-sm">
                          {f.title && <div class="font-medium">{f.title}</div>}
                          <Prose text={f.body} size="sm" />
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>
    </Layout>
  );
}
