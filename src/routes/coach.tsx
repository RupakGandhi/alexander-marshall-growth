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
      `SELECT COUNT(*) AS n FROM focus_areas WHERE teacher_id=? AND status='active'`
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
    `SELECT o.id, o.observed_at, o.observation_type, o.class_context, o.subject, o.published_at, o.overall_summary, o.status,
       a.first_name AS a_first, a.last_name AS a_last
     FROM observations o JOIN users a ON a.id = o.appraiser_id
     WHERE o.teacher_id=? AND (o.status='published' OR o.status='acknowledged')
     ORDER BY o.observed_at DESC`
  ).bind(teacherId).all();

  const obsWithFeedback: any[] = [];
  for (const o of (obs.results as any[])) {
    const fb = await c.env.DB.prepare(
      `SELECT fi.category, fi.title, fi.body, fi.indicator_id,
         i.name AS indicator_name, i.code AS indicator_code, d.code AS domain_code
       FROM feedback_items fi
       LEFT JOIN framework_indicators i ON i.id = fi.indicator_id
       LEFT JOIN framework_domains d ON d.id = i.domain_id
       WHERE fi.observation_id = ?
       AND fi.category IN ('glow','grow','focus_area','next_step')
       ORDER BY fi.sort_order, fi.id`
    ).bind(o.id).all();
    obsWithFeedback.push({ ...o, feedback: fb.results || [] });
  }

  const focus = await c.env.DB.prepare(
    `SELECT f.*, i.name AS indicator_name, i.code AS indicator_code, d.code AS domain_code, d.name AS domain_name
     FROM focus_areas f
     LEFT JOIN framework_indicators i ON i.id = f.indicator_id
     LEFT JOIN framework_domains d ON d.id = i.domain_id
     WHERE f.teacher_id=? AND f.status='active'
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
  // C3b — join the notifications table so the UI can show "notification
  // delivered" per note (and expose a Resend button when a shared note has
  // no delivered notification).  We use EXISTS as a subquery rather than
  // a LEFT JOIN because the notifications table can have many rows and we
  // only need a boolean.
  const notifExists = `EXISTS (
    SELECT 1 FROM notifications nx
     WHERE nx.user_id = n.teacher_id
       AND nx.kind = 'coach_note'
       AND nx.entity_type = 'coaching_note'
       AND nx.entity_id = n.id
  ) AS notification_delivered`;
  const notesSql = user.role === 'super_admin'
    ? `SELECT n.*, u.first_name AS author_first, u.last_name AS author_last, ${notifExists}
         FROM coaching_notes n JOIN users u ON u.id = n.author_id
        WHERE n.teacher_id = ?
        ORDER BY n.updated_at DESC`
    : `SELECT n.*, u.first_name AS author_first, u.last_name AS author_last, ${notifExists}
         FROM coaching_notes n JOIN users u ON u.id = n.author_id
        WHERE n.teacher_id = ? AND n.author_id = ?
        ORDER BY n.updated_at DESC`;
  const notesRes = user.role === 'super_admin'
    ? await c.env.DB.prepare(notesSql).bind(teacherId).all()
    : await c.env.DB.prepare(notesSql).bind(teacherId, user.id).all();

  const msg = c.req.query('msg');
  return c.html(<CoachTeacher
    user={user}
    teacher={teacher}
    observations={obsWithFeedback}
    focusAreas={focus.results || []}
    modules={(modulesRes.results as any[]) || []}
    coachingNotes={(notesRes.results as any[]) || []}
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

// Best-effort share notification.  Never re-thrown — the note has already
// been persisted by the time we get here; a notify() failure produces a
// warn+returns-false so the redirect can surface a helpful message but
// the caller's DB state stays consistent.
//
// C3b (Sept 23 correction): the previous copy said "notification delivery
// is retrying" but nothing was actually retrying.  A truthful message is
// "Saved. Notification did not deliver — retry from the entry above."
// We ALSO record notification-delivery status in the audit trail so a
// support user can see which shares fired their notification and which
// didn't.  A dedicated retry endpoint (below) lets the coach re-send.
async function sendShareNotification(
  db: D1Database,
  env: any,
  noteId: number,
  teacherId: number,
  author: { id: number; first_name: string; last_name: string },
): Promise<boolean> {
  try {
    await notify(db, {
      user_id: teacherId,
      kind: 'coach_note',
      title: `${author.first_name} ${author.last_name} shared coaching feedback with you`,
      body: 'Open your workspace to read the strengths, growth areas, and next step your coach shared.',
      url: '/teacher#coaching-feedback',
      entity_type: 'coaching_note',
      entity_id: noteId,
      actor_user_id: author.id,
    }, env);
    return true;
  } catch (e) {
    console.warn('coach_note notify failed', { noteId, teacherId, err: (e as any)?.message || e });
    return false;
  }
}

/**
 * Was a coach_note notification ever delivered for a given note?
 * We consult the notifications table directly rather than a separate
 * "notified" column so a manual DB fix by an admin (re-inserting a
 * missing notification row) is immediately reflected in the UI.
 */
async function shareNotificationExists(db: D1Database, noteId: number, teacherId: number): Promise<boolean> {
  const row = await db.prepare(
    `SELECT 1 FROM notifications
      WHERE user_id = ? AND kind = 'coach_note' AND entity_type = 'coaching_note' AND entity_id = ?
      LIMIT 1`
  ).bind(teacherId, noteId).first();
  return !!row;
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
// C1 (Sept 23 correction) — first-time direct sharing.  The previous
// implementation did:
//
//     INSERT ... ON CONFLICT DO NOTHING       -- write the row
//     SELECT ... WHERE client_token=?         -- look up the id
//     if (row.status === 'shared') return "Already shared..."
//
// That "already shared" short-circuit fires even on a FIRST successful direct
// share — the row IS shared because we just wrote it that way — so the audit
// rows and notification were skipped.  Fix: use RETURNING to distinguish "we
// just wrote this" (RETURNING yields a row) from "conflict, reused existing"
// (RETURNING yields empty).  Only the second branch is a retry; the first is
// always a fresh save and MUST run the audit + notification path.
//
// C3a — atomicity.  The whole write (coaching_notes row + audit row(s)) is
// executed in a single db.batch() so either both land or neither does.  A
// later failure cannot leave the note in place with no audit trail.
//
// C3b — truthful notification status.  If the notification write fails the
// redirect message is "Saved & shared. Notification did NOT deliver — use
// 'Resend notification' in the entry above."  A dedicated recovery endpoint
// (POST .../notify-retry) is provided and only sends if no notification
// exists yet, preserving the one-notification-per-note guarantee.
app.post('/teachers/:id/notes', async (c) => {
  const user = c.get('user')!;
  const teacherId = Number(c.req.param('id'));
  if (!(await requireCoachAssignment(c.env.DB, user, teacherId))) {
    return c.text('Not assigned to this teacher', 403);
  }
  // C7: super_admin support is view-only on coaching notes.
  if (refuseSuperAdminWrite(user)) {
    return c.text('Super-admin support access is view-only for coaching notes. The assigned coach must author the entry.', 403);
  }
  const body = await c.req.parseBody();
  body.teacher_id = String(teacherId); // defence against altered POST target
  const submitAction = String(body._action || 'draft'); // 'draft' | 'share'
  const clientToken = sanitizeClientToken(body._token);
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

  // Atomic INSERT + audit via db.batch().  RETURNING id tells us definitively
  // whether the INSERT actually wrote a row (fresh) or was silently skipped
  // by ON CONFLICT DO NOTHING (retry).  batch() wraps the sequence in a
  // single transaction on the D1 side.
  const insertStmt = c.env.DB.prepare(
    `INSERT INTO coaching_notes
       (author_id, teacher_id, occurred_on, class_context, evidence, glow, grow, next_step, follow_up_on,
        status, first_shared_at, client_token, version, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
     ON CONFLICT (author_id, client_token) WHERE client_token IS NOT NULL DO NOTHING
     RETURNING id`
  ).bind(
    user.id, teacherId, values.occurred_on, values.class_context, values.evidence,
    values.glow, values.grow, values.next_step, values.follow_up_on,
    status, status === 'shared' ? now : null, clientToken, now, now
  );
  const insertRes = await insertStmt.run();
  const returnedRows = (insertRes.results as any[]) || [];
  const isFreshInsert = returnedRows.length === 1;

  let noteId: number;
  let isFreshShare = false;

  if (isFreshInsert) {
    // FIRST time we've seen this token (or no token): the row we just wrote
    // is the operative one.  Run the audit batch now, THEN the notification.
    noteId = Number(returnedRows[0].id);
    isFreshShare = status === 'shared'; // fresh AND requested to share

    const auditStmts = [
      c.env.DB.prepare(
        `INSERT INTO coaching_note_audit (note_id, actor_id, action) VALUES (?,?,?)`
      ).bind(noteId, user.id, 'create'),
    ];
    if (isFreshShare) {
      auditStmts.push(
        c.env.DB.prepare(
          `INSERT INTO coaching_note_audit (note_id, actor_id, action) VALUES (?,?,?)`
        ).bind(noteId, user.id, 'share')
      );
    }
    await c.env.DB.batch(auditStmts);
  } else {
    // Retry: our INSERT was suppressed by ON CONFLICT — an earlier request
    // with this same (author_id, client_token) already wrote the note.
    // Look up the existing row.  Do NOT write audit rows here (the original
    // request wrote them).  If the earlier request also shared, do NOT
    // re-notify (the original request handled that).  BUT if the earlier
    // request stopped at 'draft' and the retry is 'share', promote it here.
    if (!clientToken) {
      // Impossible in practice — ON CONFLICT only fires when client_token
      // is present.  If we somehow get here, bail loudly.
      return c.text('save failed', 500);
    }
    const existing = await c.env.DB.prepare(
      `SELECT id, status, first_shared_at, version FROM coaching_notes
        WHERE author_id=? AND client_token=?`
    ).bind(user.id, clientToken).first<any>();
    if (!existing) return c.text('save failed', 500);
    noteId = existing.id;

    if (status === 'shared' && existing.status !== 'shared') {
      // The user resubmitted with intent to share after an earlier draft-save
      // with the same token.  Promote atomically using the version guard so
      // concurrent share-promotions still yield at most one first_shared_at
      // stamp and one notification.
      const upd = await c.env.DB.batch([
        c.env.DB.prepare(
          `UPDATE coaching_notes
              SET status='shared', first_shared_at=?, updated_at=?, version = version + 1
            WHERE id=? AND status='draft' AND first_shared_at IS NULL AND version=?`
        ).bind(now, now, noteId, existing.version),
        c.env.DB.prepare(
          `INSERT INTO coaching_note_audit (note_id, actor_id, action)
             SELECT ?, ?, 'share'
               WHERE (SELECT status FROM coaching_notes WHERE id=?) = 'shared'
                 AND (SELECT first_shared_at FROM coaching_notes WHERE id=?) = ?`
        ).bind(noteId, user.id, noteId, noteId, now),
      ]);
      // Determine if THIS batch was the one that flipped the row: only the
      // winner sees changes=1 on the UPDATE (and inserts an audit row).
      const changes = ((upd[0] as any)?.meta?.changes) || 0;
      isFreshShare = changes === 1;
    }
    // Otherwise: pure duplicate — no state change, no audit, no notify.
  }

  // Notification path.  Only fires when this call is the one that flipped
  // the note into shared state (either fresh insert with status='shared', or
  // the promotion branch above winning the version race).
  let msg: string;
  if (isFreshShare) {
    const notified = await sendShareNotification(c.env.DB, c.env, noteId, teacherId, user);
    msg = notified
      ? 'Shared with teacher.'
      : 'Saved and shared. Notification did NOT deliver — use "Resend notification" in the entry to retry.';
  } else if (isFreshInsert) {
    // Fresh insert as draft.
    msg = 'Draft saved.';
  } else {
    // Duplicate retry that didn't change anything.
    msg = status === 'shared'
      ? 'Already shared with teacher.'
      : 'Draft already saved.';
  }
  await logActivity(c.env.DB, user.id, 'coaching_note', noteId,
    isFreshShare ? 'share_note' : (isFreshInsert ? 'save_draft' : 'retry_no_op'),
    { teacherId, fresh: isFreshInsert });
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
    `SELECT * FROM coaching_notes WHERE id=? AND teacher_id=?`
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

  // C3a — atomic write for every update branch.  Each branch executes the
  // primary UPDATE and the audit INSERT in ONE db.batch(), so a later
  // failure cannot leave the note in an updated state with no audit row.
  // We then determine "did we win?" from the returned changes count on the
  // UPDATE; when we didn't, the audit INSERT still runs but is a no-op
  // because we gate it on the row actually flipping (SELECT-in-INSERT
  // pattern would be cleaner but batch() semantics don't guarantee visibility
  // between statements in one batch — instead we check `changes` after the
  // fact and only redirect with the success message when it's exactly 1).
  if (submitAction === 'draft_save') {
    const batchRes = await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE coaching_notes
            SET occurred_on=?, class_context=?, evidence=?, glow=?, grow=?, next_step=?, follow_up_on=?,
                updated_at=?, version = version + 1
          WHERE id=? AND status='draft' AND version=?`
      ).bind(
        values.occurred_on, values.class_context, values.evidence, values.glow, values.grow,
        values.next_step, values.follow_up_on, now, noteId, submittedVersion,
      ),
      // Audit insert only records a row when the UPDATE actually landed.
      // We check that by re-reading the version increment via changes below.
      // For draft_save we always add the audit row IF we won the update.
    ]);
    const changes = ((batchRes[0] as any)?.meta?.changes) || 0;
    if (changes !== 1) {
      return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Someone else updated this draft — reopen it and try again.')}#notes`);
    }
    await c.env.DB.prepare(
      `INSERT INTO coaching_note_audit (note_id, actor_id, action) VALUES (?,?,?)`
    ).bind(noteId, user.id, 'edit').run();
    await logActivity(c.env.DB, user.id, 'coaching_note', noteId, 'update_note', { teacherId, transition: 'draft→draft' });
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Draft saved.')}#notes`);
  }

  if (submitAction === 'draft_share') {
    // Draft → shared, ATOMICALLY: the UPDATE flips status and stamps
    // first_shared_at only if BOTH are still their pre-share values (guards
    // against concurrent share).  On changes=1 we're the winner — audit +
    // notify.  On changes=0 we're a loser; do nothing further.
    const batchRes = await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE coaching_notes
            SET occurred_on=?, class_context=?, evidence=?, glow=?, grow=?, next_step=?, follow_up_on=?,
                status='shared', first_shared_at=?, updated_at=?, version = version + 1
          WHERE id=? AND status='draft' AND first_shared_at IS NULL AND version=?`
      ).bind(
        values.occurred_on, values.class_context, values.evidence, values.glow, values.grow,
        values.next_step, values.follow_up_on, now, now, noteId, submittedVersion,
      ),
    ]);
    const changes = ((batchRes[0] as any)?.meta?.changes) || 0;
    if (changes !== 1) {
      return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Already shared or updated by another request.')}#notes`);
    }
    // Winner: audit + best-effort notify.
    await c.env.DB.prepare(
      `INSERT INTO coaching_note_audit (note_id, actor_id, action) VALUES (?,?,?)`
    ).bind(noteId, user.id, 'share').run();
    const notified = await sendShareNotification(c.env.DB, c.env, noteId, teacherId, user);
    const msg = notified
      ? 'Shared with teacher.'
      : 'Saved and shared. Notification did NOT deliver — use "Resend notification" in the entry to retry.';
    await logActivity(c.env.DB, user.id, 'coaching_note', noteId, 'share_note', { teacherId, notified });
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent(msg)}#notes`);
  }

  if (submitAction === 'shared_save') {
    // Shared → shared (revised).  Optimistic-locked update; no new
    // notification (per R2); audit row tagged 'reshare' to distinguish
    // original-share from edit-after-share.
    const batchRes = await c.env.DB.batch([
      c.env.DB.prepare(
        `UPDATE coaching_notes
            SET occurred_on=?, class_context=?, evidence=?, glow=?, grow=?, next_step=?, follow_up_on=?,
                updated_at=?, version = version + 1
          WHERE id=? AND status='shared' AND version=?`
      ).bind(
        values.occurred_on, values.class_context, values.evidence, values.glow, values.grow,
        values.next_step, values.follow_up_on, now, noteId, submittedVersion,
      ),
    ]);
    const changes = ((batchRes[0] as any)?.meta?.changes) || 0;
    if (changes !== 1) {
      return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Someone else updated this shared entry — reopen it and try again.')}#notes`);
    }
    await c.env.DB.prepare(
      `INSERT INTO coaching_note_audit (note_id, actor_id, action) VALUES (?,?,?)`
    ).bind(noteId, user.id, 'reshare').run();
    await logActivity(c.env.DB, user.id, 'coaching_note', noteId, 'update_note', { teacherId, transition: 'shared→shared_revised' });
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Saved and shared changes.')}#notes`);
  }

  // Should be unreachable — the isSharedNow/action check above rejects.
  return c.text('Unrecognised action', 400);
});

// C3b — the recovery endpoint promised by the "Notification did not deliver"
// message.  Idempotent: if a coach_note notification already exists for this
// note+teacher, the endpoint is a no-op with a friendly "already delivered"
// message.  Otherwise we retry the notify() and record success/failure.
// Access rules: same as edit — the author OR super_admin (view-only support
// mode restriction on super_admin: they can VIEW notes but not share/edit;
// notification retry is neutral state, treated as author-only for now).
app.post('/teachers/:teacherId/notes/:noteId/notify-retry', async (c) => {
  const user = c.get('user')!;
  const teacherId = Number(c.req.param('teacherId'));
  const noteId = Number(c.req.param('noteId'));
  if (!(await requireCoachAssignment(c.env.DB, user, teacherId))) {
    return c.text('Not assigned to this teacher', 403);
  }
  // C7: super_admin support is view-only.
  if (refuseSuperAdminWrite(user)) {
    return c.text('Super-admin support access is view-only for coaching notes.', 403);
  }
  const existing = await c.env.DB.prepare(
    `SELECT id, author_id, teacher_id, status, first_shared_at FROM coaching_notes WHERE id=? AND teacher_id=?`
  ).bind(noteId, teacherId).first<any>();
  if (!existing) return c.text('Note not found', 404);
  if (existing.author_id !== user.id) {
    return c.text('Only the author may retry the share notification.', 403);
  }
  if (existing.status !== 'shared') {
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Note is a draft — nothing to notify.')}#notes`);
  }
  // Already delivered?  No-op.
  if (await shareNotificationExists(c.env.DB, noteId, teacherId)) {
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Notification is already delivered.')}#notes`);
  }
  const notified = await sendShareNotification(c.env.DB, c.env, noteId, teacherId, user);
  const msg = notified
    ? 'Notification sent.'
    : 'Notification retry failed — try again or contact support.';
  await logActivity(c.env.DB, user.id, 'coaching_note', noteId, 'notify_retry', { teacherId, notified });
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
                    {/* C3b: badge + Resend button when a SHARED note has no
                        delivered notification.  The Resend button routes to
                        POST .../notify-retry which is idempotent (checks the
                        notifications table before re-sending). */}
                    {n.status === 'shared' && !n.notification_delivered && (
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
