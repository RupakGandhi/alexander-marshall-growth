import { Hono } from 'hono';
import type { Bindings, Variables } from '../lib/types';
import { Layout, Card } from '../lib/layout';
import { requireRole } from '../lib/auth';
import { getAssignedTeachers, logActivity } from '../lib/db';
import { recommendModule } from '../lib/pd';
import { formatDate, formatDateTime, statusBadge, statusLabel } from '../lib/ui';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use('*', requireRole(['coach', 'super_admin']));

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
  const assign = await c.env.DB.prepare(
    `SELECT 1 FROM assignments WHERE teacher_id=? AND staff_id=? AND relationship='coach' AND active=1`
  ).bind(teacherId, user.id).first();
  if (!assign && user.role !== 'super_admin') return c.text('Not assigned to this teacher', 403);

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

  const msg = c.req.query('msg');
  return c.html(<CoachTeacher
    user={user}
    teacher={teacher}
    observations={obsWithFeedback}
    focusAreas={focus.results || []}
    modules={(modulesRes.results as any[]) || []}
    msg={msg}
  />);
});

// Fix 4 — coach manual recommendation. Same assignment guard, same
// recommendModule() helper as the appraiser path. No score data is
// read or written; we only INSERT a row into pd_enrollments.
app.post('/teachers/:id/recommend-module', async (c) => {
  const user = c.get('user')!;
  const teacherId = Number(c.req.param('id'));
  const assign = await c.env.DB.prepare(
    `SELECT 1 FROM assignments WHERE teacher_id=? AND staff_id=? AND relationship='coach' AND active=1`
  ).bind(teacherId, user.id).first();
  if (!assign && user.role !== 'super_admin') return c.text('Not assigned to this teacher', 403);
  const body = await c.req.parseBody();
  const moduleId = Number(body.module_id);
  const note = String(body.note || '').trim() || null;
  if (!moduleId) return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Pick a module first.')}`);
  try {
    await recommendModule(c.env.DB, teacherId, moduleId, user.id, note, c.env);
    await logActivity(c.env.DB, user.id, 'pd_enrollment', moduleId, 'recommend_module', { teacherId, note });
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Module recommended — the teacher has been notified.')}`);
  } catch (err: any) {
    return c.redirect(`/coach/teachers/${teacherId}?msg=${encodeURIComponent('Could not recommend: ' + (err?.message || 'unknown error'))}`);
  }
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

function CoachTeacher({ user, teacher, observations, focusAreas, modules, msg }: any) {
  modules = modules || [];
  return (
    <Layout title={`${teacher.first_name} ${teacher.last_name}`} user={user} activeNav="co-home">
      <div class="mb-4"><a href="/coach" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>Back</a></div>
      <div class="mb-4">
        <h1 class="font-display text-2xl text-aps-navy">{teacher.first_name} {teacher.last_name}</h1>
        <p class="text-slate-600 text-sm">{teacher.title || 'Teacher'} · {teacher.email}</p>
        <p class="text-xs text-slate-500 mt-1 italic"><i class="fas fa-shield-alt mr-1"></i>Coach view — you see focus areas and teacher-facing feedback only. Scores and evaluator private notes are confidential.</p>
      </div>

      {msg && <div class="mb-3 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}

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
                {f.description && <div class="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{f.description}</div>}
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
            {o.overall_summary && <div class="mt-3 text-sm whitespace-pre-wrap text-slate-700">{o.overall_summary}</div>}
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
                          <div class="whitespace-pre-wrap text-slate-700">{f.body}</div>
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
