// ============================================================================
// pd.tsx — Professional Development LMS routes
// ============================================================================
// Three audiences are served from this one router:
//   • Teachers at /teacher/pd/*          — their personal PD LMS
//   • Appraisers & coaches at /pd/review/* — queue of submitted deliverables
//   • Super-admins at /admin/pd/*         — module editor (create/edit content)
//
// Mounting is handled in src/index.tsx; this file intentionally uses distinct
// sub-routers so role-based access stays obvious.  Each sub-router gates on
// requireRole() up front.
// ============================================================================

import { Hono } from 'hono';
import type { Bindings, Variables } from '../lib/types';
import { Layout, Card, Button } from '../lib/layout';
import { requireRole } from '../lib/auth';
import { logActivity } from '../lib/db';
import { formatDate, formatDateTime, escapeHtml } from '../lib/ui';
import {
  teacherEnrollments, getEnrollment, getReflections, saveReflection,
  advanceEnrollment, submitDeliverable, verifyDeliverable,
  enrollTeacher, statusPill, phaseLabel,
} from '../lib/pd';
import { notify } from '../lib/notifications';

// ==========================================================================
// A. TEACHER-FACING  /teacher/pd
// ==========================================================================
export const teacherPd = new Hono<{ Bindings: Bindings; Variables: Variables }>();
teacherPd.use('*', requireRole(['teacher']));

// PD LMS home — every enrollment the teacher has, sorted so urgent items surface first
teacherPd.get('/', async (c) => {
  const user = c.get('user')!;
  const enrollments = await teacherEnrollments(c.env.DB, user.id);
  // Suggest the top 6 active modules (any indicator) the teacher hasn't started
  const inactiveIds = enrollments.map((e: any) => e.module_id);
  const suggestSql = inactiveIds.length
    ? `SELECT m.id, m.title, m.subtitle, m.target_level, m.est_minutes, i.code AS icode, i.name AS iname, d.code AS dcode
         FROM pd_modules m
         JOIN framework_indicators i ON i.id = m.indicator_id
         JOIN framework_domains d ON d.id = i.domain_id
         WHERE m.is_active = 1 AND m.id NOT IN (${inactiveIds.map(() => '?').join(',')})
         ORDER BY m.updated_at DESC LIMIT 6`
    : `SELECT m.id, m.title, m.subtitle, m.target_level, m.est_minutes, i.code AS icode, i.name AS iname, d.code AS dcode
         FROM pd_modules m
         JOIN framework_indicators i ON i.id = m.indicator_id
         JOIN framework_domains d ON d.id = i.domain_id
         WHERE m.is_active = 1 ORDER BY m.updated_at DESC LIMIT 6`;
  const stmt = c.env.DB.prepare(suggestSql);
  const suggested = inactiveIds.length
    ? await stmt.bind(...inactiveIds).all()
    : await stmt.all();

  const plans = await c.env.DB.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM pd_plan_items WHERE plan_id = p.id) AS n_items
       FROM pd_plans p WHERE p.teacher_id = ? ORDER BY p.created_at DESC`
  ).bind(user.id).all();

  return c.html(<TeacherPdHome user={user} enrollments={enrollments} suggested={(suggested.results as any[]) || []} plans={(plans.results as any[]) || []} msg={c.req.query('msg')} />);
});

// Module library — teacher self-enroll
teacherPd.get('/library', async (c) => {
  const user = c.get('user')!;
  const indicator = c.req.query('indicator');
  const where = indicator ? `WHERE m.is_active = 1 AND i.code = ?` : `WHERE m.is_active = 1`;
  const stmt = c.env.DB.prepare(
    `SELECT m.*, i.code AS icode, i.name AS iname, d.code AS dcode, d.name AS dname
       FROM pd_modules m
       JOIN framework_indicators i ON i.id = m.indicator_id
       JOIN framework_domains d ON d.id = i.domain_id
       ${where}
       ORDER BY d.sort_order, i.sort_order, m.target_level`
  );
  const rows = indicator ? await stmt.bind(indicator).all() : await stmt.all();
  const domains = await c.env.DB.prepare(
    `SELECT d.code AS dcode, d.name AS dname, i.code AS icode, i.name AS iname
       FROM framework_indicators i JOIN framework_domains d ON d.id = i.domain_id
       ORDER BY d.sort_order, i.sort_order`
  ).all();
  return c.html(<TeacherPdLibrary user={user} modules={(rows.results as any[]) || []} indicators={(domains.results as any[]) || []} />);
});

teacherPd.post('/library/:moduleId/enroll', async (c) => {
  const user = c.get('user')!;
  const moduleId = Number(c.req.param('moduleId'));
  const { enrollment_id } = await enrollTeacher(c.env.DB, user.id, moduleId, 'self', undefined, c.env);
  return c.redirect(`/teacher/pd/${enrollment_id}`);
});

// Module workspace — Learn / Practice / Apply
teacherPd.get('/:id', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const e = await getEnrollment(c.env.DB, id);
  if (!e || e.teacher_id !== user.id) return c.text('Not found', 404);
  const reflections = await getReflections(c.env.DB, id);
  const refMap: Record<string, string> = {};
  for (const r of reflections) refMap[r.phase] = r.body;
  return c.html(<TeacherPdModule user={user} e={e} reflections={refMap} msg={c.req.query('msg')} />);
});

// Save reflection for one phase (Learn / Practice / Apply)
teacherPd.post('/:id/reflect', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const e = await getEnrollment(c.env.DB, id);
  if (!e || e.teacher_id !== user.id) return c.text('Forbidden', 403);
  const body = await c.req.parseBody();
  const phase = String(body.phase || '') as 'learn'|'practice'|'apply';
  const text = String(body.reflection || '').trim();
  if (!['learn','practice','apply'].includes(phase)) return c.redirect(`/teacher/pd/${id}`);
  if (text) await saveReflection(c.env.DB, id, phase, text);
  return c.redirect(`/teacher/pd/${id}?msg=Saved`);
});

// Phase-advance actions (button clicks: start, finish learn, finish practice, etc.)
teacherPd.post('/:id/advance', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const body = await c.req.parseBody();
  const to = String(body.to || '') as any;
  try { await advanceEnrollment(c.env.DB, id, user.id, to); }
  catch (err: any) { return c.redirect(`/teacher/pd/${id}?msg=` + encodeURIComponent(err?.message || 'cannot advance')); }
  return c.redirect(`/teacher/pd/${id}?msg=Progress+saved`);
});

// Submit deliverable (Apply phase → submitted)
teacherPd.post('/:id/submit', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const body = await c.req.parseBody();
  const title = String(body.title || '').trim() || 'Classroom deliverable';
  const text = String(body.body || '').trim();
  if (!text) return c.redirect(`/teacher/pd/${id}?msg=Deliverable+cannot+be+empty`);
  await submitDeliverable(c.env.DB, id, user.id, title, text, c.env);
  await logActivity(c.env.DB, user.id, 'pd_enrollment', id, 'submit');
  return c.redirect(`/teacher/pd/${id}?msg=Submitted+for+review`);
});

// ---- PD Plans (floating PD days) ----
teacherPd.post('/plans/create', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const name = String(body.name || '').trim() || `PD plan ${new Date().toISOString().slice(0,10)}`;
  const planned = String(body.planned_date || '').trim() || null;
  const goal = String(body.goal || '').trim() || null;
  const pickedRaw = body.enrollment_ids as any;
  const picked: number[] = Array.isArray(pickedRaw) ? pickedRaw.map((x) => Number(x)).filter(Boolean)
    : (pickedRaw ? [Number(pickedRaw)].filter(Boolean) : []);
  const ins = await c.env.DB.prepare(
    `INSERT INTO pd_plans (teacher_id, name, planned_date, goal, created_by, status)
     VALUES (?, ?, ?, ?, ?, 'active')`
  ).bind(user.id, name, planned, goal, user.id).run();
  const planId = Number((ins.meta as any)?.last_row_id || 0);
  for (let i = 0; i < picked.length; i++) {
    await c.env.DB.prepare(
      `INSERT OR IGNORE INTO pd_plan_items (plan_id, enrollment_id, sort_order) VALUES (?, ?, ?)`
    ).bind(planId, picked[i], i).run();
  }
  return c.redirect(`/teacher/pd/plans/${planId}`);
});

teacherPd.get('/plans/:id', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const plan = await c.env.DB.prepare(`SELECT * FROM pd_plans WHERE id = ? AND teacher_id = ?`).bind(id, user.id).first<any>();
  if (!plan) return c.text('Not found', 404);
  const items = await c.env.DB.prepare(
    `SELECT e.id AS enrollment_id, e.status, m.title AS module_title, m.est_minutes,
            i.code AS icode, i.name AS iname, d.code AS dcode
       FROM pd_plan_items p
       JOIN pd_enrollments e ON e.id = p.enrollment_id
       JOIN pd_modules m ON m.id = e.module_id
       JOIN framework_indicators i ON i.id = m.indicator_id
       JOIN framework_domains d ON d.id = i.domain_id
       WHERE p.plan_id = ?
       ORDER BY p.sort_order`
  ).bind(id).all();
  return c.html(<TeacherPdPlan user={user} plan={plan} items={(items.results as any[]) || []} />);
});

// ==========================================================================
// B. APPRAISER / COACH REVIEW QUEUE  /pd/review
// ==========================================================================
export const reviewPd = new Hono<{ Bindings: Bindings; Variables: Variables }>();
reviewPd.use('*', requireRole(['appraiser', 'coach', 'super_admin']));

reviewPd.get('/', async (c) => {
  const user = c.get('user')!;
  // Only show deliverables from teachers assigned to this supervisor (for appraisers/coaches)
  // Super-admin sees everything.
  const visibleTeacherClause = user.role === 'super_admin'
    ? '' : `AND e.teacher_id IN (SELECT teacher_id FROM assignments WHERE staff_id = ? AND active = 1)`;
  const stmt = c.env.DB.prepare(
    `SELECT e.id, e.status, e.submitted_at, e.teacher_id,
            t.first_name AS t_first, t.last_name AS t_last,
            m.title AS module_title, m.target_level,
            i.code AS icode, i.name AS iname, d.code AS dcode,
            de.title AS deliverable_title
       FROM pd_enrollments e
       JOIN users t ON t.id = e.teacher_id
       JOIN pd_modules m ON m.id = e.module_id
       JOIN framework_indicators i ON i.id = m.indicator_id
       JOIN framework_domains d ON d.id = i.domain_id
       LEFT JOIN pd_deliverables de ON de.enrollment_id = e.id
       WHERE e.status IN ('submitted','verified','needs_revision')
             ${visibleTeacherClause}
       ORDER BY
         CASE e.status WHEN 'submitted' THEN 0 WHEN 'needs_revision' THEN 1 ELSE 2 END,
         e.submitted_at DESC
       LIMIT 100`
  );
  const rows = user.role === 'super_admin' ? await stmt.all() : await stmt.bind(user.id).all();
  return c.html(<ReviewPdQueue user={user} rows={(rows.results as any[]) || []} />);
});

reviewPd.get('/:id', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const e = await getEnrollment(c.env.DB, id);
  if (!e) return c.text('Not found', 404);
  if (user.role !== 'super_admin') {
    const ok = await c.env.DB.prepare(
      `SELECT 1 FROM assignments WHERE teacher_id = ? AND staff_id = ? AND active = 1 LIMIT 1`
    ).bind(e.teacher_id, user.id).first();
    if (!ok) return c.text('Forbidden', 403);
  }
  const reflections = await getReflections(c.env.DB, id);
  const refMap: Record<string, string> = {};
  for (const r of reflections) refMap[r.phase] = r.body;
  const teacher = await c.env.DB.prepare(`SELECT first_name, last_name, title FROM users WHERE id = ?`).bind(e.teacher_id).first<any>();
  return c.html(<ReviewPdDetail user={user} e={e} teacher={teacher} reflections={refMap} msg={c.req.query('msg')} />);
});

reviewPd.post('/:id/verify', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const body = await c.req.parseBody();
  const action = String(body.action || 'verify');
  const note = String(body.note || '').trim() || null;
  const e = await getEnrollment(c.env.DB, id);
  if (!e) return c.text('Not found', 404);
  if (user.role !== 'super_admin') {
    const ok = await c.env.DB.prepare(
      `SELECT 1 FROM assignments WHERE teacher_id = ? AND staff_id = ? AND active = 1 LIMIT 1`
    ).bind(e.teacher_id, user.id).first();
    if (!ok) return c.text('Forbidden', 403);
  }
  await verifyDeliverable(c.env.DB, id, user.id, action === 'verify', note, c.env);
  await logActivity(c.env.DB, user.id, 'pd_enrollment', id, action === 'verify' ? 'verify' : 'request_revision');
  return c.redirect(`/pd/review/${id}?msg=${action === 'verify' ? 'Verified' : 'Sent+back+for+revision'}`);
});

reviewPd.post('/:id/assign', async (c) => {
  const user = c.get('user')!;
  // A supervisor can also assign a NEW module to a teacher from this page
  const body = await c.req.parseBody();
  const teacherId = Number(body.teacher_id);
  const moduleId = Number(body.module_id);
  if (!teacherId || !moduleId) return c.redirect('/pd/review?msg=Invalid+assignment');
  const { enrollment_id } = await enrollTeacher(c.env.DB, teacherId, moduleId, 'assigned', user.id, c.env);
  return c.redirect(`/pd/review/${enrollment_id}?msg=Assigned`);
});

// ==========================================================================
// C. SUPER-ADMIN MODULE EDITOR  /admin/pd
// ==========================================================================
export const adminPd = new Hono<{ Bindings: Bindings; Variables: Variables }>();
adminPd.use('*', requireRole(['super_admin']));

adminPd.get('/', async (c) => {
  const user = c.get('user')!;
  const rows = await c.env.DB.prepare(
    `SELECT m.*, i.code AS icode, i.name AS iname, d.code AS dcode,
            (SELECT COUNT(*) FROM pd_enrollments e WHERE e.module_id = m.id) AS enrollments
       FROM pd_modules m
       JOIN framework_indicators i ON i.id = m.indicator_id
       JOIN framework_domains d ON d.id = i.domain_id
       ORDER BY d.sort_order, i.sort_order, m.target_level`
  ).all();
  const indicators = await c.env.DB.prepare(
    `SELECT i.id, i.code AS icode, i.name AS iname, d.code AS dcode, d.name AS dname
       FROM framework_indicators i JOIN framework_domains d ON d.id = i.domain_id
       ORDER BY d.sort_order, i.sort_order`
  ).all();
  return c.html(<AdminPdList user={user} rows={(rows.results as any[]) || []} indicators={(indicators.results as any[]) || []} msg={c.req.query('msg')} />);
});

adminPd.get('/new', async (c) => {
  const user = c.get('user')!;
  const indicators = await c.env.DB.prepare(
    `SELECT i.id, i.code AS icode, i.name AS iname, d.code AS dcode, d.name AS dname
       FROM framework_indicators i JOIN framework_domains d ON d.id = i.domain_id
       ORDER BY d.sort_order, i.sort_order`
  ).all();
  return c.html(<AdminPdEditor user={user} indicators={(indicators.results as any[]) || []} m={{}} />);
});

adminPd.get('/:id', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const m = await c.env.DB.prepare(`SELECT * FROM pd_modules WHERE id = ?`).bind(id).first<any>();
  if (!m) return c.text('Not found', 404);
  const indicators = await c.env.DB.prepare(
    `SELECT i.id, i.code AS icode, i.name AS iname, d.code AS dcode, d.name AS dname
       FROM framework_indicators i JOIN framework_domains d ON d.id = i.domain_id
       ORDER BY d.sort_order, i.sort_order`
  ).all();
  return c.html(<AdminPdEditor user={user} indicators={(indicators.results as any[]) || []} m={m} />);
});

adminPd.post('/save', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const id = Number(body.id || 0);
  const indicator_id = Number(body.indicator_id);
  const target_level = Number(body.target_level);
  const title = String(body.title || '').trim();
  const subtitle = String(body.subtitle || '').trim() || null;
  const est = Number(body.est_minutes || 45);
  const research = String(body.research_basis || '').trim() || null;
  const learn = String(body.learn_content || '').trim();
  const practice = String(body.practice_content || '').trim();
  const apply = String(body.apply_content || '').trim();
  const deliverable_prompt = String(body.deliverable_prompt || '').trim();
  const deliverable_rubric = String(body.deliverable_rubric || '').trim() || null;
  const resources = String(body.resources || '').trim() || null;
  const is_active = body.is_active ? 1 : 0;
  if (!indicator_id || !title || !learn || !practice || !apply || !deliverable_prompt) {
    return c.redirect('/admin/pd?msg=' + encodeURIComponent('Title, indicator, target level, and all three phases are required.'));
  }
  if (id) {
    await c.env.DB.prepare(
      `UPDATE pd_modules SET indicator_id=?, target_level=?, title=?, subtitle=?, est_minutes=?,
         research_basis=?, learn_content=?, practice_content=?, apply_content=?,
         deliverable_prompt=?, deliverable_rubric=?, resources=?, is_active=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`
    ).bind(indicator_id, target_level, title, subtitle, est, research, learn, practice, apply,
           deliverable_prompt, deliverable_rubric, resources, is_active, id).run();
    await logActivity(c.env.DB, user.id, 'pd_module', id, 'update');
    return c.redirect('/admin/pd?msg=' + encodeURIComponent(`Updated "${title}"`));
  } else {
    const ins = await c.env.DB.prepare(
      `INSERT INTO pd_modules (indicator_id, target_level, title, subtitle, est_minutes,
         research_basis, learn_content, practice_content, apply_content,
         deliverable_prompt, deliverable_rubric, resources, is_active, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(indicator_id, target_level, title, subtitle, est, research, learn, practice, apply,
           deliverable_prompt, deliverable_rubric, resources, is_active, user.id).run();
    const newId = Number((ins.meta as any)?.last_row_id || 0);
    await logActivity(c.env.DB, user.id, 'pd_module', newId, 'create');
    return c.redirect('/admin/pd?msg=' + encodeURIComponent(`Created "${title}"`));
  }
});

adminPd.post('/:id/delete', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare(`DELETE FROM pd_modules WHERE id = ?`).bind(id).run();
  await logActivity(c.env.DB, user.id, 'pd_module', id, 'delete');
  return c.redirect('/admin/pd?msg=Deleted');
});

// ==========================================================================
// VIEWS
// ==========================================================================

function TeacherPdHome({ user, enrollments, suggested, plans, msg }: any) {
  const active = enrollments.filter((e: any) => !['verified','declined'].includes(e.status));
  const complete = enrollments.filter((e: any) => e.status === 'verified');
  return (
    <Layout title="My PD LMS" user={user} activeNav="t-pd">
      <h1 class="font-display text-2xl text-aps-navy mb-1"><i class="fas fa-graduation-cap mr-2"></i>My PD LMS</h1>
      <p class="text-slate-600 text-sm mb-4">Research-based, deliverable-driven modules that grow with your observation results. Complete a module's three phases (Learn &rarr; Practice &rarr; Apply), submit a classroom-ready deliverable, and your supervisor verifies it.</p>
      {msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}

      <div class="grid md:grid-cols-3 gap-3 mb-6">
        <StatMini label="Active modules" value={active.length} icon="fa-play" />
        <StatMini label="Completed" value={complete.length} icon="fa-circle-check" />
        <StatMini label="Plans" value={plans.length} icon="fa-calendar" />
      </div>

      <Card title="Your modules" icon="fas fa-list-check" class="mb-4" data-tour="t-pd-home">
        {active.length === 0 ? <p class="text-sm text-slate-500">No active modules right now. Your lowest observation scores will automatically add modules here — or browse the library below.</p> : (
          <div class="space-y-2">
            {active.map((e: any) => <EnrollmentRow e={e} />)}
          </div>
        )}
      </Card>

      {complete.length > 0 && (
        <Card title={`Completed (${complete.length})`} icon="fas fa-trophy" class="mb-4">
          <div class="space-y-2">
            {complete.map((e: any) => <EnrollmentRow e={e} />)}
          </div>
        </Card>
      )}

      <Card title="Build a PD plan for a floating PD day" icon="fas fa-calendar-check" class="mb-4">
        <p class="text-sm text-slate-600 mb-3">Pick a couple of your modules, give the plan a name (e.g. <em>Nov 8 Floating PD</em>), and you'll have a printable agenda ready for the day.</p>
        <form method="post" action="/teacher/pd/plans/create" class="space-y-3">
          <div class="grid md:grid-cols-3 gap-3 text-sm">
            <label>Plan name<input name="name" placeholder="e.g. Nov 8 Floating PD" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
            <label>Planned date<input type="date" name="planned_date" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
            <label>My goal<input name="goal" placeholder="e.g. Improve exit-ticket design" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
          </div>
          {active.length === 0 ? <p class="text-xs text-slate-500">You need at least one active module to build a plan.</p> : (
            <div class="space-y-1 text-sm">
              {active.map((e: any) => (
                <label class="flex items-start gap-2 p-2 border border-slate-200 rounded hover:bg-slate-50">
                  <input type="checkbox" name="enrollment_ids" value={e.id} class="mt-1" />
                  <span><strong>{e.module_title}</strong> <span class="text-xs text-slate-500">· {e.domain_code} · {e.indicator_code} · {e.est_minutes}m</span></span>
                </label>
              ))}
            </div>
          )}
          <button class="bg-aps-navy text-white px-3 py-1.5 rounded text-sm hover:bg-aps-blue" disabled={active.length === 0}><i class="fas fa-calendar-plus mr-1"></i>Create plan</button>
        </form>
      </Card>

      {plans.length > 0 && (
        <Card title="My PD plans" icon="fas fa-clipboard-list" class="mb-4">
          <ul class="space-y-1 text-sm">
            {plans.map((p: any) => (
              <li class="flex items-center justify-between border-b border-slate-100 py-1.5">
                <span><strong>{p.name}</strong> <span class="text-xs text-slate-500">· {p.n_items} modules · {p.planned_date ? formatDate(p.planned_date) : 'no date'}</span></span>
                <a href={`/teacher/pd/plans/${p.id}`} class="text-xs text-aps-blue hover:underline">Open <i class="fas fa-chevron-right"></i></a>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {suggested.length > 0 && (
        <Card title="Suggested modules" icon="fas fa-lightbulb" class="mb-4">
          <div class="grid md:grid-cols-2 gap-3">
            {suggested.map((m: any) => (
              <div class="border border-slate-200 rounded-md p-3 bg-white">
                <div class="text-xs text-slate-500">{m.dcode} · {m.icode} · target &ge; {m.target_level}</div>
                <div class="font-medium text-aps-navy">{m.title}</div>
                {m.subtitle && <div class="text-xs text-slate-600 mt-0.5">{m.subtitle}</div>}
                <div class="mt-2 flex items-center justify-between">
                  <span class="text-xs text-slate-500"><i class="far fa-clock mr-1"></i>{m.est_minutes}m</span>
                  <form method="post" action={`/teacher/pd/library/${m.id}/enroll`}>
                    <button class="text-xs bg-aps-navy text-white px-2 py-1 rounded hover:bg-aps-blue"><i class="fas fa-plus mr-1"></i>Add to my LMS</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
          <div class="mt-3 text-right"><a href="/teacher/pd/library" class="text-xs text-aps-blue hover:underline">Browse full library <i class="fas fa-chevron-right"></i></a></div>
        </Card>
      )}
    </Layout>
  );
}

function EnrollmentRow({ e }: any) {
  const pill = statusPill(e.status);
  return (
    <div class="flex items-center justify-between gap-3 border border-slate-200 rounded p-3 hover:bg-slate-50">
      <div class="flex-1 min-w-0">
        <div class="text-xs text-slate-500">{e.domain_code} · {e.indicator_code} · {e.indicator_name} · target &ge; {e.target_level}</div>
        <div class="font-medium text-aps-navy">{e.module_title}</div>
        {e.module_subtitle && <div class="text-xs text-slate-600">{e.module_subtitle}</div>}
      </div>
      <span class={`text-xs px-2 py-0.5 rounded-full border ${pill.color} whitespace-nowrap`}><i class={`fas ${pill.icon} mr-1`}></i>{pill.label}</span>
      <a href={`/teacher/pd/${e.id}`} class="text-xs text-aps-blue hover:underline whitespace-nowrap">Open <i class="fas fa-chevron-right"></i></a>
    </div>
  );
}

function StatMini({ label, value, icon }: any) {
  return (
    <div class="bg-white border border-slate-200 rounded-md p-4">
      <div class="flex justify-between items-center">
        <div class="text-xs text-slate-500 uppercase">{label}</div>
        <i class={`fas ${icon} text-aps-navy`}></i>
      </div>
      <div class="text-2xl font-display text-aps-navy mt-1">{value}</div>
    </div>
  );
}

function TeacherPdLibrary({ user, modules, indicators }: any) {
  const byDomain: Record<string, any[]> = {};
  for (const m of modules) {
    const key = `${m.dcode} — ${m.dname}`;
    if (!byDomain[key]) byDomain[key] = [];
    byDomain[key].push(m);
  }
  return (
    <Layout title="PD Module Library" user={user} activeNav="t-pd">
      <div class="mb-4"><a href="/teacher/pd" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>Back to My PD LMS</a></div>
      <h1 class="font-display text-2xl text-aps-navy mb-2">PD Module Library</h1>
      <p class="text-slate-600 text-sm mb-4">Every module is tied to a specific indicator and target level on the Kim Marshall rubric. Add any to your PD LMS — once enrolled, you'll work through Learn &rarr; Practice &rarr; Apply and submit a deliverable.</p>
      {Object.keys(byDomain).length === 0 ? <p class="text-sm text-slate-500">The module library is empty. Ask your super-admin to publish some modules.</p> : null}
      {Object.entries(byDomain).map(([name, list]) => (
        <Card title={name} icon="fas fa-folder-open" class="mb-4">
          <div class="grid md:grid-cols-2 gap-3">
            {list.map((m: any) => (
              <div class="border border-slate-200 rounded-md p-3 bg-white">
                <div class="text-xs text-slate-500">{m.icode} · {m.iname} · target &ge; {m.target_level}</div>
                <div class="font-medium text-aps-navy">{m.title}</div>
                {m.subtitle && <div class="text-xs text-slate-600 mt-0.5">{m.subtitle}</div>}
                <div class="mt-2 flex items-center justify-between">
                  <span class="text-xs text-slate-500"><i class="far fa-clock mr-1"></i>{m.est_minutes}m</span>
                  <form method="post" action={`/teacher/pd/library/${m.id}/enroll`}>
                    <button class="text-xs bg-aps-navy text-white px-2 py-1 rounded hover:bg-aps-blue"><i class="fas fa-plus mr-1"></i>Add to my LMS</button>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </Card>
      ))}
    </Layout>
  );
}

function TeacherPdModule({ user, e, reflections, msg }: any) {
  const pill = statusPill(e.status);
  const phases = [
    { key: 'learn',    label: 'Learn',    next: 'learn_done',    icon: 'fa-book-open', content: e.learn_content },
    { key: 'practice', label: 'Practice', next: 'practice_done', icon: 'fa-dumbbell', content: e.practice_content },
    { key: 'apply',    label: 'Apply',    next: 'submitted',     icon: 'fa-briefcase', content: e.apply_content },
  ];
  // Phase gating — teacher can't fill Apply until Learn + Practice are done
  const phaseUnlocked: Record<string, boolean> = {
    learn: !['declined'].includes(e.status),
    practice: ['started','learn_done','practice_done','submitted','verified','needs_revision'].includes(e.status) && !!e.learn_done_at,
    apply: ['practice_done','submitted','verified','needs_revision'].includes(e.status) && !!e.practice_done_at,
  };
  return (
    <Layout title={e.title} user={user} activeNav="t-pd">
      <div class="mb-2"><a href="/teacher/pd" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>My PD LMS</a></div>
      <h1 class="font-display text-2xl text-aps-navy">{e.title}</h1>
      <p class="text-slate-600 text-sm mt-1">{e.domain_code} · {e.indicator_code} · {e.indicator_name} · target level &ge; {e.target_level}</p>
      {e.subtitle && <p class="mt-1 text-slate-700">{e.subtitle}</p>}
      <div class="mt-2 flex items-center gap-3 flex-wrap">
        <span class={`text-xs px-2 py-0.5 rounded-full border ${pill.color}`}><i class={`fas ${pill.icon} mr-1`}></i>{pill.label}</span>
        <span class="text-xs text-slate-500"><i class="far fa-clock mr-1"></i>Estimated {e.est_minutes} minutes</span>
        {e.source === 'auto' && <span class="text-xs text-amber-700"><i class="fas fa-wand-magic-sparkles mr-1"></i>Auto-recommended from your observation</span>}
        {e.source === 'assigned' && <span class="text-xs text-sky-700"><i class="fas fa-user-tie mr-1"></i>Assigned by a supervisor</span>}
      </div>
      {msg && <div class="mt-3 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}

      {e.status === 'recommended' && (
        <Card class="mt-4" title="Ready to start?" icon="fas fa-play">
          <p class="text-sm text-slate-600 mb-3">When you click Start, your progress will be tracked. You can save and come back anytime.</p>
          <form method="post" action={`/teacher/pd/${e.id}/advance`} class="inline">
            <input type="hidden" name="to" value="started" />
            <button class="bg-aps-navy text-white px-3 py-1.5 rounded text-sm hover:bg-aps-blue"><i class="fas fa-play mr-1"></i>Start module</button>
          </form>
          <form method="post" action={`/teacher/pd/${e.id}/advance`} class="inline ml-2">
            <input type="hidden" name="to" value="declined" />
            <button class="text-xs text-slate-500 hover:underline">Not right now</button>
          </form>
        </Card>
      )}

      {e.research_basis && (
        <Card title="Research basis" icon="fas fa-book" class="mt-4">
          <div class="text-sm text-slate-700 whitespace-pre-wrap">{e.research_basis}</div>
        </Card>
      )}

      {phases.map((ph, idx) => {
        const unlocked = phaseUnlocked[ph.key];
        const doneStamp = ph.key === 'learn' ? e.learn_done_at : ph.key === 'practice' ? e.practice_done_at : e.submitted_at;
        const canAdvance = unlocked && !doneStamp && e.status !== 'declined';
        return (
          <Card title={`${idx + 1}. ${ph.label} phase`} icon={`fas ${ph.icon}`} class="mt-4">
            {!unlocked ? (
              <p class="text-sm text-slate-500"><i class="fas fa-lock mr-1"></i>Finish the previous phase to unlock this one.</p>
            ) : (
              <>
                <div class="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{ph.content}</div>
                {ph.key !== 'apply' && (
                  <form method="post" action={`/teacher/pd/${e.id}/reflect`} class="mt-3">
                    <input type="hidden" name="phase" value={ph.key} />
                    <label class="text-xs text-slate-600 block mb-1">Your reflection (optional — appears in your supervisor's review):</label>
                    <textarea name="reflection" rows={3} class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">{reflections[ph.key] || ''}</textarea>
                    <div class="mt-2 flex items-center gap-2">
                      <button class="text-xs bg-slate-200 hover:bg-slate-300 text-slate-800 px-2 py-1 rounded"><i class="far fa-save mr-1"></i>Save reflection</button>
                      {canAdvance && (
                        <button type="submit" formaction={`/teacher/pd/${e.id}/advance`} class="text-xs bg-aps-navy text-white px-2 py-1 rounded hover:bg-aps-blue" name="to" value={ph.next}>
                          <i class="fas fa-check mr-1"></i>Mark {ph.label.toLowerCase()} complete
                        </button>
                      )}
                      {doneStamp && <span class="text-xs text-emerald-700"><i class="fas fa-check-circle mr-1"></i>Completed {formatDate(doneStamp)}</span>}
                    </div>
                  </form>
                )}
                {ph.key === 'apply' && unlocked && (
                  <ApplyPhase e={e} reflection={reflections.apply || ''} />
                )}
              </>
            )}
          </Card>
        );
      })}

      {e.status === 'needs_revision' && (
        <Card title="Revision requested" icon="fas fa-rotate-left" class="mt-4">
          <div class="p-3 rounded bg-rose-50 border border-rose-200 text-sm text-rose-900">{e.verification_note || 'Your supervisor asked for a second pass.'}</div>
          <p class="text-xs text-slate-500 mt-2">Update your deliverable above and resubmit.</p>
        </Card>
      )}

      {e.status === 'verified' && (
        <Card title="Verified by supervisor" icon="fas fa-circle-check" class="mt-4">
          <div class="p-3 rounded bg-emerald-50 border border-emerald-200 text-sm text-emerald-900">
            {e.verification_note || 'Nice work — marked complete.'}
            <div class="text-xs text-emerald-700 mt-1">{formatDateTime(e.verified_at)}</div>
          </div>
        </Card>
      )}
    </Layout>
  );
}

function ApplyPhase({ e, reflection }: any) {
  const canSubmit = ['practice_done','needs_revision'].includes(e.status);
  const isSubmittedOrDone = ['submitted','verified'].includes(e.status);
  return (
    <div class="mt-3">
      <div class="p-3 rounded bg-amber-50 border border-amber-200 text-sm">
        <div class="font-semibold text-amber-900 mb-1"><i class="fas fa-clipboard-list mr-1"></i>Deliverable prompt</div>
        <div class="text-amber-900 whitespace-pre-wrap">{e.deliverable_prompt}</div>
        {e.deliverable_rubric && (
          <details class="mt-2 text-xs text-amber-900/80">
            <summary class="cursor-pointer">What a good deliverable looks like</summary>
            <div class="mt-1 whitespace-pre-wrap">{e.deliverable_rubric}</div>
          </details>
        )}
      </div>
      <form method="post" action={`/teacher/pd/${e.id}/submit`} class="mt-3">
        <label class="text-sm">Title <input name="title" value={e.deliverable_title || ''} class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" required disabled={isSubmittedOrDone && e.status === 'verified'} /></label>
        <label class="block mt-3 text-sm">Your deliverable
          <textarea name="body" rows={10} required disabled={isSubmittedOrDone && e.status === 'verified'} class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 font-mono text-xs leading-relaxed">{e.deliverable_body || ''}</textarea>
        </label>
        <p class="text-xs text-slate-500 mt-1">Paste the artifact right here — an exit ticket, rubric, lesson plan, anti-bias checklist, etc. Markdown is fine. Your supervisor will read this page to verify.</p>
        {canSubmit && <button class="mt-3 bg-aps-navy text-white px-3 py-1.5 rounded text-sm hover:bg-aps-blue"><i class="fas fa-paper-plane mr-1"></i>{e.status === 'needs_revision' ? 'Resubmit' : 'Submit for review'}</button>}
        {e.status === 'submitted' && <span class="ml-2 text-xs text-violet-700"><i class="fas fa-inbox mr-1"></i>Awaiting supervisor review</span>}
      </form>
    </div>
  );
}

function TeacherPdPlan({ user, plan, items }: any) {
  return (
    <Layout title={plan.name} user={user} activeNav="t-pd">
      <div class="mb-2"><a href="/teacher/pd" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>My PD LMS</a></div>
      <h1 class="font-display text-2xl text-aps-navy">{plan.name}</h1>
      <p class="text-slate-600 text-sm">{plan.planned_date ? `Planned for ${formatDate(plan.planned_date)}` : 'No date set'}{plan.goal ? ` · Goal: ${plan.goal}` : ''}</p>

      <Card title={`Modules in this plan (${items.length})`} icon="fas fa-list" class="mt-4">
        {items.length === 0 ? <p class="text-sm text-slate-500">Empty plan — go back and add some modules.</p> : (
          <ol class="space-y-2">
            {items.map((it: any, i: number) => {
              const pill = statusPill(it.status);
              return (
                <li class="flex items-center justify-between border border-slate-200 rounded p-3">
                  <div>
                    <div class="text-xs text-slate-500">{i + 1}. {it.dcode} · {it.icode} · {it.est_minutes}m</div>
                    <div class="font-medium text-aps-navy">{it.module_title}</div>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class={`text-xs px-2 py-0.5 rounded-full border ${pill.color}`}><i class={`fas ${pill.icon} mr-1`}></i>{pill.label}</span>
                    <a href={`/teacher/pd/${it.enrollment_id}`} class="text-xs text-aps-blue hover:underline">Open <i class="fas fa-chevron-right"></i></a>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </Card>
    </Layout>
  );
}

// ---------- Review views ----------

function ReviewPdQueue({ user, rows }: any) {
  const pending = rows.filter((r: any) => r.status === 'submitted');
  const revising = rows.filter((r: any) => r.status === 'needs_revision');
  const verified = rows.filter((r: any) => r.status === 'verified');
  return (
    <Layout title="PD review" user={user} activeNav="pd-review">
      <h1 class="font-display text-2xl text-aps-navy mb-1"><i class="fas fa-clipboard-check mr-2"></i>PD review queue</h1>
      <p class="text-slate-600 text-sm mb-4">Teacher-submitted PD deliverables waiting for your verification. Verifying counts the module as complete and releases a success notification to the teacher.</p>

      <Card title={`Awaiting review (${pending.length})`} icon="fas fa-inbox" class="mb-4">
        {pending.length === 0 ? <p class="text-sm text-slate-500">Nothing to review right now.</p> : (
          <div class="space-y-2">{pending.map((r: any) => <ReviewRow r={r} />)}</div>
        )}
      </Card>

      {revising.length > 0 && (
        <Card title={`Awaiting teacher revision (${revising.length})`} icon="fas fa-rotate-left" class="mb-4">
          <div class="space-y-2">{revising.map((r: any) => <ReviewRow r={r} />)}</div>
        </Card>
      )}

      {verified.length > 0 && (
        <Card title={`Recently verified (${verified.length})`} icon="fas fa-circle-check" class="mb-4">
          <div class="space-y-2">{verified.slice(0, 20).map((r: any) => <ReviewRow r={r} />)}</div>
        </Card>
      )}
    </Layout>
  );
}

function ReviewRow({ r }: any) {
  const pill = statusPill(r.status);
  return (
    <div class="flex items-center justify-between gap-3 border border-slate-200 rounded p-3 hover:bg-slate-50">
      <div>
        <div class="text-xs text-slate-500">{r.t_first} {r.t_last} · {r.dcode} · {r.icode} · target &ge; {r.target_level}</div>
        <div class="font-medium text-aps-navy">{r.deliverable_title || r.module_title}</div>
        <div class="text-xs text-slate-500 mt-0.5">Submitted {formatDateTime(r.submitted_at)}</div>
      </div>
      <div class="flex items-center gap-2">
        <span class={`text-xs px-2 py-0.5 rounded-full border ${pill.color}`}><i class={`fas ${pill.icon} mr-1`}></i>{pill.label}</span>
        <a href={`/pd/review/${r.id}`} class="text-xs text-aps-blue hover:underline">Open <i class="fas fa-chevron-right"></i></a>
      </div>
    </div>
  );
}

function ReviewPdDetail({ user, e, teacher, reflections, msg }: any) {
  const pill = statusPill(e.status);
  return (
    <Layout title={`Review: ${e.title}`} user={user} activeNav="pd-review">
      <div class="mb-2"><a href="/pd/review" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>Review queue</a></div>
      <h1 class="font-display text-2xl text-aps-navy">{e.title}</h1>
      <p class="text-slate-600 text-sm">{e.domain_code} · {e.indicator_code} · {e.indicator_name} · target &ge; {e.target_level}</p>
      <p class="text-slate-700 text-sm mt-1">Teacher: <strong>{teacher?.first_name} {teacher?.last_name}</strong> <span class="text-slate-500">· {teacher?.title}</span></p>
      <div class="mt-2"><span class={`text-xs px-2 py-0.5 rounded-full border ${pill.color}`}><i class={`fas ${pill.icon} mr-1`}></i>{pill.label}</span></div>
      {msg && <div class="mt-3 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}

      <Card title="Deliverable" icon="fas fa-file-alt" class="mt-4">
        <div class="font-medium text-aps-navy mb-2">{e.deliverable_title || 'Untitled'}</div>
        <div class="p-3 bg-slate-50 border border-slate-200 rounded text-sm whitespace-pre-wrap leading-relaxed">{e.deliverable_body || '(no content yet)'}</div>
        {e.deliverable_updated && <div class="mt-2 text-xs text-slate-500">Last updated {formatDateTime(e.deliverable_updated)}</div>}
      </Card>

      <Card title="Reflections" icon="fas fa-comments" class="mt-4">
        {['learn','practice','apply'].map((p) => (
          <div class="mb-3">
            <div class="text-xs font-semibold uppercase text-slate-500">{phaseLabel(p)}</div>
            <div class="text-sm text-slate-800 whitespace-pre-wrap">{reflections[p] || <span class="text-slate-400 italic">No reflection</span>}</div>
          </div>
        ))}
      </Card>

      <Card title="Deliverable prompt (for your reference)" icon="fas fa-book" class="mt-4">
        <div class="text-sm text-slate-700 whitespace-pre-wrap">{e.deliverable_prompt}</div>
        {e.deliverable_rubric && <details class="mt-2 text-xs"><summary class="cursor-pointer text-aps-blue">Rubric guidance</summary><div class="mt-1 whitespace-pre-wrap text-slate-700">{e.deliverable_rubric}</div></details>}
      </Card>

      {(e.status === 'submitted' || e.status === 'needs_revision') && (
        <Card title="Verify" icon="fas fa-gavel" class="mt-4">
          <form method="post" action={`/pd/review/${e.id}/verify`} class="space-y-2">
            <label class="text-sm block">Note to teacher <span class="text-slate-400">(optional)</span>
              <textarea name="note" rows={3} class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5"></textarea>
            </label>
            <div class="flex items-center gap-2">
              <button name="action" value="verify" class="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded text-sm"><i class="fas fa-check mr-1"></i>Verify complete</button>
              <button name="action" value="revise" class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded text-sm"><i class="fas fa-rotate-left mr-1"></i>Ask for revision</button>
            </div>
          </form>
        </Card>
      )}

      {e.status === 'verified' && (
        <Card title="Verified" icon="fas fa-circle-check" class="mt-4">
          <div class="text-sm text-emerald-900">{e.verification_note || 'Marked complete.'}</div>
          <div class="text-xs text-emerald-700 mt-1">{formatDateTime(e.verified_at)}</div>
        </Card>
      )}
    </Layout>
  );
}

// ---------- Admin module editor ----------

function AdminPdList({ user, rows, indicators, msg }: any) {
  return (
    <Layout title="PD modules" user={user} activeNav="admin-pd">
      <div class="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h1 class="font-display text-2xl text-aps-navy">PD modules</h1>
        <a href="/admin/pd/new" class="bg-aps-navy text-white px-3 py-1.5 rounded text-sm hover:bg-aps-blue"><i class="fas fa-plus mr-1"></i>New module</a>
      </div>
      {msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}

      <Card title={`Modules (${rows.length})`} icon="fas fa-list">
        {rows.length === 0 ? <p class="text-sm text-slate-500">No modules yet. Click <em>New module</em> above to create the first one.</p> : (
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-xs text-slate-500 text-left border-b">
                <tr><th class="py-2">Indicator</th><th>Target &ge;</th><th>Title</th><th>Minutes</th><th>Active</th><th>Enrollments</th><th></th></tr>
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr class="border-b border-slate-100">
                    <td class="py-2 text-xs text-slate-600">{r.dcode} · {r.icode}<br /><span class="text-slate-500">{r.iname}</span></td>
                    <td>{r.target_level}</td>
                    <td class="font-medium text-aps-navy">{r.title}{r.subtitle ? <div class="text-xs text-slate-500">{r.subtitle}</div> : null}</td>
                    <td>{r.est_minutes}m</td>
                    <td>{r.is_active ? <span class="text-emerald-700"><i class="fas fa-check-circle"></i></span> : <span class="text-slate-400"><i class="fas fa-circle-minus"></i></span>}</td>
                    <td>{r.enrollments}</td>
                    <td class="text-right">
                      <a href={`/admin/pd/${r.id}`} class="text-xs text-aps-blue hover:underline mr-3"><i class="fas fa-pen mr-1"></i>Edit</a>
                      <form method="post" action={`/admin/pd/${r.id}/delete`} class="inline" onsubmit="return confirm('Delete this module? Teacher enrollments for it will be broken.')">
                        <button class="text-xs text-red-700 hover:underline"><i class="fas fa-trash mr-1"></i>Delete</button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Layout>
  );
}

function AdminPdEditor({ user, indicators, m }: any) {
  const isNew = !m.id;
  return (
    <Layout title={isNew ? 'New PD module' : 'Edit PD module'} user={user} activeNav="admin-pd">
      <div class="mb-2"><a href="/admin/pd" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>All modules</a></div>
      <h1 class="font-display text-2xl text-aps-navy mb-4">{isNew ? 'New PD module' : `Edit: ${m.title}`}</h1>

      <form method="post" action="/admin/pd/save" class="space-y-4">
        <input type="hidden" name="id" value={m.id || ''} />
        <Card title="Indicator + level" icon="fas fa-crosshairs">
          <div class="grid md:grid-cols-3 gap-3 text-sm">
            <label class="md:col-span-2">Indicator
              <select name="indicator_id" required class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5">
                <option value="">Select an indicator…</option>
                {indicators.map((i: any) => <option value={i.id} selected={Number(m.indicator_id) === i.id}>{i.dcode}.{i.icode} — {i.iname} ({i.dname})</option>)}
              </select>
            </label>
            <label>Target level &ge;
              <select name="target_level" required class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5">
                {[1,2,3].map((l) => <option value={l} selected={Number(m.target_level) === l}>{l}</option>)}
              </select>
            </label>
          </div>
          <p class="text-xs text-slate-500 mt-2">This module will auto-enroll teachers who score <strong>at or below</strong> this level on this indicator.</p>
        </Card>

        <Card title="Module details" icon="fas fa-heading">
          <div class="grid md:grid-cols-3 gap-3 text-sm">
            <label class="md:col-span-2">Title<input name="title" value={m.title || ''} required class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
            <label>Estimated minutes<input type="number" name="est_minutes" value={m.est_minutes || 45} class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
          </div>
          <label class="block mt-3 text-sm">Subtitle<input name="subtitle" value={m.subtitle || ''} class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" placeholder="One-line framing (optional)" /></label>
          <label class="block mt-3 text-sm">Research basis<textarea name="research_basis" rows={3} class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" placeholder="Citations / research summary (shown to teacher at top of module).">{m.research_basis || ''}</textarea></label>
          <label class="block mt-3 text-sm flex items-center gap-2">
            <input type="checkbox" name="is_active" value="1" checked={!!m.is_active || isNew} />
            Active (teachers can enroll and auto-enrollment will pick this up)
          </label>
        </Card>

        <Card title="Learn phase" icon="fas fa-book-open">
          <textarea name="learn_content" rows={10} required class="w-full border border-slate-300 rounded px-2 py-1.5 font-mono text-xs leading-relaxed" placeholder="What does the teacher need to learn? Concrete examples, short explanation, links.">{m.learn_content || ''}</textarea>
        </Card>

        <Card title="Practice phase" icon="fas fa-dumbbell">
          <textarea name="practice_content" rows={10} required class="w-full border border-slate-300 rounded px-2 py-1.5 font-mono text-xs leading-relaxed" placeholder="Structured practice tasks — low-stakes, rehearsal-style.">{m.practice_content || ''}</textarea>
        </Card>

        <Card title="Apply phase" icon="fas fa-briefcase">
          <textarea name="apply_content" rows={8} required class="w-full border border-slate-300 rounded px-2 py-1.5 font-mono text-xs leading-relaxed" placeholder="Classroom application — what will the teacher do with real students?">{m.apply_content || ''}</textarea>
          <label class="block mt-3 text-sm">Deliverable prompt (shown in Apply phase)<textarea name="deliverable_prompt" rows={4} required class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 font-mono text-xs">{m.deliverable_prompt || ''}</textarea></label>
          <label class="block mt-3 text-sm">Rubric / "looks like" (optional)<textarea name="deliverable_rubric" rows={4} class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 font-mono text-xs">{m.deliverable_rubric || ''}</textarea></label>
        </Card>

        <Card title="Resources" icon="fas fa-link">
          <textarea name="resources" rows={4} class="w-full border border-slate-300 rounded px-2 py-1.5 font-mono text-xs" placeholder="Links, readings, videos (one per line).">{m.resources || ''}</textarea>
        </Card>

        <div class="flex items-center gap-2">
          <button class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-save mr-1"></i>Save module</button>
          <a href="/admin/pd" class="text-sm text-slate-500 hover:underline">Cancel</a>
        </div>
      </form>
    </Layout>
  );
}
