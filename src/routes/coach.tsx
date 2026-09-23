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
  const notesSql = user.role === 'super_admin'
    ? `SELECT n.*, u.first_name AS author_first, u.last_name AS author_last
         FROM coaching_notes n JOIN users u ON u.id = n.author_id
        WHERE n.teacher_id = ?
        ORDER BY n.updated_at DESC`
    : `SELECT n.*, u.first_name AS author_first, u.last_name AS author_last
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

// Best-effort share notification.  Never re-thrown — the note has already
// been persisted by the time we get here; a notify() failure produces a
// warn+returns-false so the redirect can surface a helpful message but
// the caller's DB state stays consistent.
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

// ---- POST: create a new coaching note ------------------------------------
//
// The handler is idempotent per (author_id, client_token) so a double-submit
// from a flaky network produces exactly one row.  The client's form embeds a
// UUID in `client_token`; if it's missing we still succeed (INSERT falls back
// to the normal path — the button also disables itself on submit to keep
// the accidental-double-click window small).
app.post('/teachers/:id/notes', async (c) => {
  const user = c.get('user')!;
  const teacherId = Number(c.req.param('id'));
  if (!(await requireCoachAssignment(c.env.DB, user, teacherId))) {
    return c.text('Not assigned to this teacher', 403);
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
  const now = new Date().toISOString().replace('T',' ').slice(0,19);

  // Idempotent INSERT.  If (author_id, client_token) already exists (a retry
  // after a network hiccup) we skip the INSERT and reuse the earlier row.
  // The RETURNING clause gives us the id in both branches so we don't need
  // a follow-up SELECT.  On the ON CONFLICT DO NOTHING path RETURNING is
  // empty, so we look up by token afterward.
  await c.env.DB.prepare(
    `INSERT INTO coaching_notes
       (author_id, teacher_id, occurred_on, class_context, evidence, glow, grow, next_step, follow_up_on,
        status, first_shared_at, client_token, version, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
     ON CONFLICT (author_id, client_token) WHERE client_token IS NOT NULL DO NOTHING`
  ).bind(
    user.id, teacherId, values.occurred_on, values.class_context, values.evidence,
    values.glow, values.grow, values.next_step, values.follow_up_on,
    status, status === 'shared' ? now : null, clientToken, now, now
  ).run();

  // Look up the id we just wrote (or the pre-existing row if a duplicate).
  let noteId: number;
  if (clientToken) {
    const row = await c.env.DB.prepare(
      `SELECT id, status, first_shared_at FROM coaching_notes WHERE author_id=? AND client_token=?`
    ).bind(user.id, clientToken).first<any>();
    if (!row) return c.text('save failed', 500);
    noteId = row.id;
    // If a stale retry hit an already-shared row, we have nothing else to do
    // — just redirect with a message.  This can happen when the FIRST attempt
    // shared successfully but the response never made it back to the client.
    if (row.status === 'shared' && submitAction === 'share') {
      return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Already shared with teacher.')}#notes`);
    }
  } else {
    // No token supplied — legacy path.  Fall back to last_insert_rowid.
    const idRow = await c.env.DB.prepare(`SELECT last_insert_rowid() AS id`).first<any>();
    noteId = Number(idRow?.id || 0);
    if (!noteId) return c.text('save failed', 500);
  }

  // Audit trail (create + optional share) as a batched write with the
  // notification-fire flag.  batch() is D1's atomic multi-statement primitive.
  const auditStatements = [
    c.env.DB.prepare(
      `INSERT INTO coaching_note_audit (note_id, actor_id, action) VALUES (?,?,?)`
    ).bind(noteId, user.id, 'create'),
  ];
  if (status === 'shared') {
    auditStatements.push(
      c.env.DB.prepare(
        `INSERT INTO coaching_note_audit (note_id, actor_id, action) VALUES (?,?,?)`
      ).bind(noteId, user.id, 'share')
    );
  }
  await c.env.DB.batch(auditStatements);

  let msg = status === 'shared' ? 'Shared with teacher.' : 'Draft saved.';
  if (status === 'shared') {
    const notified = await sendShareNotification(c.env.DB, c.env, noteId, teacherId, user);
    if (!notified) msg = 'Shared with teacher (notification delivery is retrying).';
  }
  await logActivity(c.env.DB, user.id, 'coaching_note', noteId,
    status === 'shared' ? 'share_note' : 'save_draft', { teacherId });
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
  const existing = await c.env.DB.prepare(
    `SELECT * FROM coaching_notes WHERE id=? AND teacher_id=?`
  ).bind(noteId, teacherId).first<any>();
  if (!existing) return c.text('Note not found', 404);
  // Author ownership (super_admin allowed for support).
  if (existing.author_id !== user.id && user.role !== 'super_admin') {
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

  if (submitAction === 'draft_save') {
    // Draft → draft.  Optimistic lock on version.  If someone else has
    // touched this row we bail with a helpful message rather than overwrite.
    const upd = await c.env.DB.prepare(
      `UPDATE coaching_notes
          SET occurred_on=?, class_context=?, evidence=?, glow=?, grow=?, next_step=?, follow_up_on=?,
              updated_at=?, version = version + 1
        WHERE id=? AND status='draft' AND version=?`
    ).bind(
      values.occurred_on, values.class_context, values.evidence, values.glow, values.grow,
      values.next_step, values.follow_up_on, now, noteId, submittedVersion,
    ).run();
    if ((upd.meta as any)?.changes !== 1) {
      return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Someone else updated this draft — reopen it and try again.')}#notes`);
    }
    await c.env.DB.prepare(
      `INSERT INTO coaching_note_audit (note_id, actor_id, action) VALUES (?,?,?)`
    ).bind(noteId, user.id, 'edit').run();
    await logActivity(c.env.DB, user.id, 'coaching_note', noteId, 'update_note', { teacherId, transition: 'draft→draft' });
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Draft saved.')}#notes`);
  }

  if (submitAction === 'draft_share') {
    // Draft → shared.  Atomic first-share transition: the UPDATE only
    // succeeds if first_shared_at is still NULL AND version matches.  Two
    // concurrent share requests both attempt the same UPDATE and exactly
    // one gets changes=1; the loser sees changes=0 and re-renders (the
    // note is now shared, so the shared view is correct).
    const upd = await c.env.DB.prepare(
      `UPDATE coaching_notes
          SET occurred_on=?, class_context=?, evidence=?, glow=?, grow=?, next_step=?, follow_up_on=?,
              status='shared', first_shared_at=?, updated_at=?, version = version + 1
        WHERE id=? AND status='draft' AND first_shared_at IS NULL AND version=?`
    ).bind(
      values.occurred_on, values.class_context, values.evidence, values.glow, values.grow,
      values.next_step, values.follow_up_on, now, now, noteId, submittedVersion,
    ).run();
    if ((upd.meta as any)?.changes !== 1) {
      // Either the version was stale OR another concurrent request already
      // completed the share.  In BOTH cases we do NOT fire a second
      // notification; the winner already did.  This is the atomicity that
      // R2 asked for.
      return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Already shared or updated by another request.')}#notes`);
    }
    // We won the race; audit + notify.
    await c.env.DB.prepare(
      `INSERT INTO coaching_note_audit (note_id, actor_id, action) VALUES (?,?,?)`
    ).bind(noteId, user.id, 'share').run();
    const notified = await sendShareNotification(c.env.DB, c.env, noteId, teacherId, user);
    const msg = notified ? 'Shared with teacher.' : 'Shared with teacher (notification delivery is retrying).';
    await logActivity(c.env.DB, user.id, 'coaching_note', noteId, 'share_note', { teacherId });
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent(msg)}#notes`);
  }

  if (submitAction === 'shared_save') {
    // Shared → shared (revised).  Optimistic-locked update, marked as
    // 'reshare' in the audit trail so we can distinguish "originally shared"
    // from "edited after sharing".  No new notification (per R2).
    const upd = await c.env.DB.prepare(
      `UPDATE coaching_notes
          SET occurred_on=?, class_context=?, evidence=?, glow=?, grow=?, next_step=?, follow_up_on=?,
              updated_at=?, version = version + 1
        WHERE id=? AND status='shared' AND version=?`
    ).bind(
      values.occurred_on, values.class_context, values.evidence, values.glow, values.grow,
      values.next_step, values.follow_up_on, now, noteId, submittedVersion,
    ).run();
    if ((upd.meta as any)?.changes !== 1) {
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
          <span class="block mt-1">Drafts are visible only to you. Shared entries are visible to you and <strong>{teacher.first_name}</strong> — not to other coaches, principals, or district dashboards.</span>
        </p>

        {/* New-note form.
            The hidden _token is a per-form UUID generated in inline JS on
            load; a double-submit collapses server-side via the
            (author_id, client_token) unique index (migration 0013). */}
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
                        : <span class="text-slate-500"><i class="fas fa-lock mr-1"></i>Draft — only you can see this</span>}
                    </span>
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
                {/* Edit affordance — author-only, plus super_admin support.
                    R3: shared entries expose ONE explicit "Save and share
                    changes" action, validated for meaningful content on the
                    server.  A draft still supports Save-draft and Share.
                    _version is submitted so the server can detect stale
                    edits (optimistic lock) and refuse to silently overwrite
                    a concurrent update. */}
                {(n.author_id === user.id || user.role === 'super_admin') && (
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
