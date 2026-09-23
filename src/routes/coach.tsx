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
// SECTION 3 — Non-evaluative coaching feedback
//
// Author-owned, teacher-shared, per-assignment gated.  Never scored, never
// mixed with observations / feedback_items / focus_areas.  Aaron requested a
// standalone place to document classroom strengths, growth, and next steps
// for coaching conversations that are NOT evaluations.
//
// Visibility policy (Section 3 of the doc):
//   - draft   : ONLY the author sees it (plus super_admin support access).
//   - shared  : the author AND the subject teacher.  NOT visible to other
//               coaches assigned to the same teacher, NOT visible to
//               principals or in evaluation reports/exports.
//
// Repeat safety (Section 5): the notification only fires on FIRST successful
// share.  We stamp `first_shared_at` inside the same UPDATE so retries and
// double-clicks can't produce a duplicate notification.
// ============================================================================

// Validate one form's fields.  Returns { errors, values } so both create/edit
// handlers reuse it and the view can re-render inputs with user text intact.
function parseCoachingNoteForm(body: Record<string, any>) {
  const errors: string[] = [];
  const s = (k: string) => String(body[k] ?? '').trim();
  const teacherId = Number(body.teacher_id);
  const occurredOn = s('occurred_on');
  const values = {
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
  // Section 3 + user D-decision: a strength-only entry is fine, but at least
  // ONE of the four substantive fields must be present when sharing.  For a
  // draft, no content minimum is enforced (people jot notes and come back).
  return { errors, values };
}

// "Meaningful content" for sharing: at least one non-blank content field.
// Deliberately no arbitrary character floor (Dr. Gandhi decision D).
function hasMeaningfulContent(v: {
  evidence: string | null; glow: string | null; grow: string | null; next_step: string | null;
}): boolean {
  return !!(v.evidence?.trim() || v.glow?.trim() || v.grow?.trim() || v.next_step?.trim());
}

// Hard length caps so an accidental paste of a whole PDF doesn't blow up the
// D1 row size or the render.  8 KB per free-text field is plenty for
// classroom notes.
const MAX_FIELD_CHARS = 8000;
function clampFields<T extends Record<string, any>>(v: T): T {
  const out: any = { ...v };
  for (const k of ['class_context','evidence','glow','grow','next_step']) {
    if (typeof out[k] === 'string' && out[k].length > MAX_FIELD_CHARS) {
      out[k] = out[k].slice(0, MAX_FIELD_CHARS);
    }
  }
  return out;
}

// POST — create a note (draft OR share, decided by which button was pressed)
app.post('/teachers/:id/notes', async (c) => {
  const user = c.get('user')!;
  const teacherId = Number(c.req.param('id'));
  if (!(await requireCoachAssignment(c.env.DB, user, teacherId))) {
    return c.text('Not assigned to this teacher', 403);
  }
  const body = await c.req.parseBody();
  // Force teacher_id from the URL, not the form (defence in depth against
  // altered POST targets).
  body.teacher_id = String(teacherId);
  const submitAction = String(body._action || 'draft'); // 'draft' or 'share'
  const parsed = parseCoachingNoteForm(body);
  let values = clampFields(parsed.values);
  const errors = [...parsed.errors];
  if (submitAction === 'share' && !hasMeaningfulContent(values)) {
    errors.push('Add at least one of: evidence, glow, growth, or next step before sharing.');
  }
  if (errors.length) {
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent(errors.join(' '))}#notes`);
  }
  const status = submitAction === 'share' ? 'shared' : 'draft';
  const now = new Date().toISOString().replace('T',' ').slice(0,19);
  const res = await c.env.DB.prepare(
    `INSERT INTO coaching_notes
       (author_id, teacher_id, occurred_on, class_context, evidence, glow, grow, next_step, follow_up_on, status, first_shared_at, created_at, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
  ).bind(
    user.id, teacherId, values.occurred_on, values.class_context, values.evidence,
    values.glow, values.grow, values.next_step, values.follow_up_on,
    status, status === 'shared' ? now : null, now, now
  ).run();
  const noteId = Number((res.meta as any)?.last_row_id);
  await c.env.DB.prepare(
    `INSERT INTO coaching_note_audit (note_id, actor_id, action) VALUES (?,?,?)`
  ).bind(noteId, user.id, 'create').run();
  if (status === 'shared') {
    await c.env.DB.prepare(
      `INSERT INTO coaching_note_audit (note_id, actor_id, action) VALUES (?,?,?)`
    ).bind(noteId, user.id, 'share').run();
    await sendShareNotification(c.env.DB, c.env, noteId, teacherId, user);
  }
  await logActivity(c.env.DB, user.id, 'coaching_note', noteId, status === 'shared' ? 'share_note' : 'save_draft', { teacherId });
  return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent(status === 'shared' ? 'Shared with teacher.' : 'Draft saved.')}#notes`);
});

// POST — edit an existing note (author-owned; edits to a shared note require
// re-sharing to be considered visible-again, but re-sharing does NOT create
// a second notification because first_shared_at is already set).
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
  // Author-ownership check (Section 4).  A super_admin can override for
  // support purposes; every other user is refused.
  if (existing.author_id !== user.id && user.role !== 'super_admin') {
    return c.text('Not your note', 403);
  }
  const body = await c.req.parseBody();
  body.teacher_id = String(teacherId);
  const submitAction = String(body._action || 'draft');
  const parsed = parseCoachingNoteForm(body);
  let values = clampFields(parsed.values);
  const errors = [...parsed.errors];
  if (submitAction === 'share' && !hasMeaningfulContent(values)) {
    errors.push('Add at least one of: evidence, glow, growth, or next step before sharing.');
  }
  if (errors.length) {
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent(errors.join(' '))}#notes`);
  }
  const now = new Date().toISOString().replace('T',' ').slice(0,19);
  const nextStatus = submitAction === 'share' ? 'shared' : existing.status;
  // Preserve first_shared_at; only set it if this is the FIRST time we share.
  const firstSharedAt = existing.first_shared_at
    ? existing.first_shared_at
    : (nextStatus === 'shared' ? now : null);
  await c.env.DB.prepare(
    `UPDATE coaching_notes
        SET occurred_on=?, class_context=?, evidence=?, glow=?, grow=?, next_step=?, follow_up_on=?,
            status=?, first_shared_at=?, updated_at=?
      WHERE id=?`
  ).bind(
    values.occurred_on, values.class_context, values.evidence, values.glow, values.grow,
    values.next_step, values.follow_up_on, nextStatus, firstSharedAt, now, noteId
  ).run();
  await c.env.DB.prepare(
    `INSERT INTO coaching_note_audit (note_id, actor_id, action) VALUES (?,?,?)`
  ).bind(noteId, user.id, existing.status === 'shared' && nextStatus === 'shared' ? 'edit' : (submitAction === 'share' ? (existing.first_shared_at ? 'reshare' : 'share') : 'edit')).run();
  // Notify ONLY on first share (idempotency guard).
  if (submitAction === 'share' && !existing.first_shared_at) {
    await sendShareNotification(c.env.DB, c.env, noteId, teacherId, user);
  }
  await logActivity(c.env.DB, user.id, 'coaching_note', noteId, 'update_note',
    { teacherId, transition: `${existing.status}→${nextStatus}` });
  return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent(submitAction === 'share' ? 'Updated & shared.' : 'Saved.')}#notes`);
});

// Notification helper — one place so the wording, kind, and url are
// consistent everywhere they're used.  Uses the existing 'coach_note'
// notification kind (already declared in src/lib/notifications.ts:67 with
// label 'Coach note', description 'Your instructional coach left a note or
// resource.', appliesToRoles: ['teacher']).  No new notification kind added.
async function sendShareNotification(
  db: D1Database,
  env: any,
  noteId: number,
  teacherId: number,
  author: { id: number; first_name: string; last_name: string },
) {
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
}

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

        {/* New-note form */}
        <form method="post" action={`/coach/teachers/${teacher.id}/notes`} class="border border-slate-200 rounded p-3 bg-slate-50 mb-4">
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
            <span class="text-[11px] text-slate-500 ml-2">Sharing sends {teacher.first_name} one notification and makes this note visible to them.</span>
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
                {/* Edit affordance — author-only, plus super_admin support */}
                {(n.author_id === user.id || user.role === 'super_admin') && (
                  <details class="mt-3">
                    <summary class="cursor-pointer text-xs text-aps-blue hover:underline"><i class="fas fa-pen mr-1"></i>Edit this entry</summary>
                    <form method="post" action={`/coach/teachers/${teacher.id}/notes/${n.id}/update`} class="mt-2 border border-slate-200 rounded p-3 bg-slate-50">
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
                        <button type="submit" name="_action" value="draft" class="bg-slate-600 hover:bg-slate-700 text-white px-3 py-1.5 rounded text-xs">
                          <i class="fas fa-floppy-disk mr-1"></i>Save {n.status === 'shared' ? 'edit' : 'draft'}
                        </button>
                        <button type="submit" name="_action" value="share" class="bg-aps-navy hover:bg-aps-blue text-white px-3 py-1.5 rounded text-xs">
                          <i class="fas fa-paper-plane mr-1"></i>{n.first_shared_at ? 'Update & keep shared' : 'Share with teacher'}
                        </button>
                        {n.status === 'shared' && !n.first_shared_at ? <span class="text-[11px] text-slate-500">(first share sends one notification)</span> : null}
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
