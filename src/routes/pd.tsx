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
import { buildCsv, parseCsvAsObjects } from '../lib/csv';
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

// Save reflection for one phase (Learn / Practice / Apply) — form post, legacy.
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

// Auto-save the interactive workspace (checkboxes + per-step answers) for
// one phase. Body is a JSON blob we store verbatim in pd_reflections.body.
// Returns JSON so the client can show a "Saved" indicator without reloading.
teacherPd.post('/:id/reflect-json', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const e = await c.env.DB.prepare(`SELECT teacher_id, status FROM pd_enrollments WHERE id = ?`).bind(id).first<any>();
  if (!e || e.teacher_id !== user.id) return c.json({ ok: false, err: 'forbidden' }, 403);
  if (e.status === 'declined' || e.status === 'verified') {
    return c.json({ ok: false, err: 'locked' }, 409);
  }
  const body = await c.req.parseBody();
  const phase = String(body.phase || '') as 'learn'|'practice'|'apply';
  const blob = String(body.body || '').slice(0, 32_000); // hard cap
  if (!['learn','practice','apply'].includes(phase)) return c.json({ ok: false, err: 'bad_phase' }, 400);
  // Validate JSON before persisting so we never store junk.
  try { JSON.parse(blob || '{}'); } catch { return c.json({ ok: false, err: 'bad_json' }, 400); }
  await saveReflection(c.env.DB, id, phase, blob);
  return c.json({ ok: true, saved_at: new Date().toISOString() });
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
  // April 2026 upgrade: deliverable rubric criteria + prior scores.  Criteria
  // are admin-editable in the pd_deliverable_rubric_criteria table; scores
  // are captured once per (enrollment, criterion) in pd_deliverable_scores.
  const criteria = await c.env.DB.prepare(
    `SELECT id, code, label, description, weight, sort_order
       FROM pd_deliverable_rubric_criteria
       WHERE is_active = 1
       ORDER BY sort_order, id`
  ).all();
  const scores = await c.env.DB.prepare(
    `SELECT criterion_id, level, note FROM pd_deliverable_scores WHERE enrollment_id = ?`
  ).bind(id).all();
  const scoreMap: Record<number, any> = {};
  for (const s of (scores.results as any[]) || []) scoreMap[s.criterion_id] = s;
  return c.html(<ReviewPdDetail
    user={user} e={e} teacher={teacher} reflections={refMap}
    criteria={(criteria.results as any[]) || []}
    scoreMap={scoreMap}
    msg={c.req.query('msg')}
  />);
});

// April 2026 upgrade: save per-criterion deliverable rubric score.
// Idempotent upsert so supervisors can adjust their scoring before verifying.
reviewPd.post('/:id/rubric', async (c) => {
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
  const body = await c.req.parseBody();
  const criterionId = Number(body.criterion_id);
  const level = Number(body.level);
  const note = String(body.note || '').trim() || null;
  if (!criterionId || !(level >= 1 && level <= 4)) {
    return c.redirect(`/pd/review/${id}?msg=${encodeURIComponent('Pick a 1-4 rating for this criterion.')}`);
  }
  await c.env.DB.prepare(
    `INSERT INTO pd_deliverable_scores (enrollment_id, criterion_id, level, note, scored_by)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(enrollment_id, criterion_id) DO UPDATE SET
       level = excluded.level,
       note  = excluded.note,
       scored_by = excluded.scored_by,
       scored_at = CURRENT_TIMESTAMP`
  ).bind(id, criterionId, level, note, user.id).run();
  await logActivity(c.env.DB, user.id, 'pd_enrollment', id, 'rubric_score');
  return c.redirect(`/pd/review/${id}?msg=${encodeURIComponent('Rubric score saved')}#rubric`);
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

// April 2026 upgrade: CSV export of every PD module — including the four
// enrichment fields — so admins can audit, bulk-edit in Excel, and re-import.
// (Registered BEFORE /:id so the literal path wins.)
adminPd.get('/export-csv', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT m.id, d.code AS domain_code, i.code AS indicator_code, i.name AS indicator_name,
            m.target_level, m.title, m.subtitle, m.est_minutes, m.research_basis,
            m.learn_content, m.practice_content, m.apply_content,
            m.deliverable_prompt, m.deliverable_rubric, m.resources,
            m.modeling_examples, m.collaboration_prompts,
            m.family_engagement_notes, m.contextual_differentiation,
            m.is_active
       FROM pd_modules m
       JOIN framework_indicators i ON i.id = m.indicator_id
       JOIN framework_domains d ON d.id = i.domain_id
       ORDER BY d.sort_order, i.sort_order, m.target_level`
  ).all();
  const headers = [
    'id','domain_code','indicator_code','indicator_name',
    'target_level','title','subtitle','est_minutes','research_basis',
    'learn_content','practice_content','apply_content',
    'deliverable_prompt','deliverable_rubric','resources',
    'modeling_examples','collaboration_prompts',
    'family_engagement_notes','contextual_differentiation','is_active',
  ];
  const data = (rows.results as any[]).map((r) => headers.map((h) => (r as any)[h] ?? ''));
  const csv = buildCsv(headers, data);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pd_modules_${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
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
  // April 2026 enrichments — all optional, all stored as plain text so admins
  // can edit them directly without touching any code.
  const modeling_examples = String(body.modeling_examples || '').trim() || null;
  const collaboration_prompts = String(body.collaboration_prompts || '').trim() || null;
  const family_engagement_notes = String(body.family_engagement_notes || '').trim() || null;
  const contextual_differentiation = String(body.contextual_differentiation || '').trim() || null;
  const is_active = body.is_active ? 1 : 0;
  if (!indicator_id || !title || !learn || !practice || !apply || !deliverable_prompt) {
    return c.redirect('/admin/pd?msg=' + encodeURIComponent('Title, indicator, target level, and all three phases are required.'));
  }
  if (id) {
    await c.env.DB.prepare(
      `UPDATE pd_modules SET indicator_id=?, target_level=?, title=?, subtitle=?, est_minutes=?,
         research_basis=?, learn_content=?, practice_content=?, apply_content=?,
         deliverable_prompt=?, deliverable_rubric=?, resources=?,
         modeling_examples=?, collaboration_prompts=?, family_engagement_notes=?, contextual_differentiation=?,
         is_active=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`
    ).bind(indicator_id, target_level, title, subtitle, est, research, learn, practice, apply,
           deliverable_prompt, deliverable_rubric, resources,
           modeling_examples, collaboration_prompts, family_engagement_notes, contextual_differentiation,
           is_active, id).run();
    await logActivity(c.env.DB, user.id, 'pd_module', id, 'update');
    return c.redirect('/admin/pd?msg=' + encodeURIComponent(`Updated "${title}"`));
  } else {
    const ins = await c.env.DB.prepare(
      `INSERT INTO pd_modules (indicator_id, target_level, title, subtitle, est_minutes,
         research_basis, learn_content, practice_content, apply_content,
         deliverable_prompt, deliverable_rubric, resources,
         modeling_examples, collaboration_prompts, family_engagement_notes, contextual_differentiation,
         is_active, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).bind(indicator_id, target_level, title, subtitle, est, research, learn, practice, apply,
           deliverable_prompt, deliverable_rubric, resources,
           modeling_examples, collaboration_prompts, family_engagement_notes, contextual_differentiation,
           is_active, user.id).run();
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

// Bulk CSV import for PD modules.  The CSV must include id, indicator_code,
// domain_code, and target_level; everything else is updated if the matching
// module exists, and a new row is inserted if id is blank.
adminPd.post('/import-csv', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const file = body.csv as unknown as File | undefined;
  if (!file || typeof (file as any).text !== 'function') {
    return c.redirect('/admin/pd?msg=' + encodeURIComponent('No CSV file uploaded.'));
  }
  const text = await (file as any).text();
  const { rows } = parseCsvAsObjects(text);
  let updated = 0; let created = 0; let skipped = 0;
  for (const row of rows) {
    const id = Number(row.id || 0);
    const domainCode = String(row.domain_code || '').trim().toUpperCase();
    const indicatorCode = String(row.indicator_code || '').trim().toLowerCase();
    const targetLevel = Number(row.target_level || 0);
    const title = String(row.title || '').trim();
    if (!title || !indicatorCode || !domainCode || !targetLevel) { skipped++; continue; }
    const indicator = await c.env.DB.prepare(
      `SELECT i.id FROM framework_indicators i
       JOIN framework_domains d ON d.id = i.domain_id
       WHERE LOWER(i.code) = ? AND UPPER(d.code) = ? LIMIT 1`
    ).bind(indicatorCode, domainCode).first<any>();
    if (!indicator) { skipped++; continue; }
    const fields = {
      indicator_id: indicator.id,
      target_level: targetLevel,
      title,
      subtitle: row.subtitle || null,
      est_minutes: Number(row.est_minutes || 45),
      research_basis: row.research_basis || null,
      learn_content: row.learn_content || '',
      practice_content: row.practice_content || '',
      apply_content: row.apply_content || '',
      deliverable_prompt: row.deliverable_prompt || '',
      deliverable_rubric: row.deliverable_rubric || null,
      resources: row.resources || null,
      modeling_examples: row.modeling_examples || null,
      collaboration_prompts: row.collaboration_prompts || null,
      family_engagement_notes: row.family_engagement_notes || null,
      contextual_differentiation: row.contextual_differentiation || null,
      is_active: String(row.is_active || '1') === '0' ? 0 : 1,
    } as any;
    if (id) {
      await c.env.DB.prepare(
        `UPDATE pd_modules SET indicator_id=?, target_level=?, title=?, subtitle=?, est_minutes=?,
           research_basis=?, learn_content=?, practice_content=?, apply_content=?,
           deliverable_prompt=?, deliverable_rubric=?, resources=?,
           modeling_examples=?, collaboration_prompts=?, family_engagement_notes=?, contextual_differentiation=?,
           is_active=?, updated_at=CURRENT_TIMESTAMP
         WHERE id=?`
      ).bind(
        fields.indicator_id, fields.target_level, fields.title, fields.subtitle, fields.est_minutes,
        fields.research_basis, fields.learn_content, fields.practice_content, fields.apply_content,
        fields.deliverable_prompt, fields.deliverable_rubric, fields.resources,
        fields.modeling_examples, fields.collaboration_prompts, fields.family_engagement_notes, fields.contextual_differentiation,
        fields.is_active, id,
      ).run();
      updated++;
    } else {
      await c.env.DB.prepare(
        `INSERT INTO pd_modules (indicator_id, target_level, title, subtitle, est_minutes,
           research_basis, learn_content, practice_content, apply_content,
           deliverable_prompt, deliverable_rubric, resources,
           modeling_examples, collaboration_prompts, family_engagement_notes, contextual_differentiation,
           is_active, created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).bind(
        fields.indicator_id, fields.target_level, fields.title, fields.subtitle, fields.est_minutes,
        fields.research_basis, fields.learn_content, fields.practice_content, fields.apply_content,
        fields.deliverable_prompt, fields.deliverable_rubric, fields.resources,
        fields.modeling_examples, fields.collaboration_prompts, fields.family_engagement_notes, fields.contextual_differentiation,
        fields.is_active, user.id,
      ).run();
      created++;
    }
  }
  await logActivity(c.env.DB, user.id, 'pd_module_bulk', 0, `import: ${updated} updated, ${created} created, ${skipped} skipped`);
  return c.redirect('/admin/pd?msg=' + encodeURIComponent(`Import complete: ${updated} updated · ${created} created · ${skipped} skipped.`));
});

// ==========================================================================
// C2. PD DELIVERABLE RUBRIC CRITERIA EDITOR  /admin/pd-rubric
// April 2026 upgrade — admins can rename labels, rewrite descriptions,
// tweak weights, or deactivate criteria without touching code.
// ==========================================================================
export const adminPdRubric = new Hono<{ Bindings: Bindings; Variables: Variables }>();
adminPdRubric.use('*', requireRole(['super_admin']));

adminPdRubric.get('/', async (c) => {
  const user = c.get('user')!;
  const rows = await c.env.DB.prepare(
    `SELECT * FROM pd_deliverable_rubric_criteria ORDER BY sort_order, id`
  ).all();
  return c.html(<AdminPdRubric user={user} rows={(rows.results as any[]) || []} msg={c.req.query('msg')} />);
});

adminPdRubric.post('/save', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const id = Number(body.id || 0);
  const code = String(body.code || '').trim();
  const label = String(body.label || '').trim();
  const description = String(body.description || '').trim();
  const weight = Math.max(1, Number(body.weight || 1));
  const sort_order = Number(body.sort_order || 0);
  const is_active = body.is_active ? 1 : 0;
  if (!code || !label || !description) {
    return c.redirect('/admin/pd-rubric?msg=' + encodeURIComponent('Code, label, and description are all required.'));
  }
  if (id) {
    await c.env.DB.prepare(
      `UPDATE pd_deliverable_rubric_criteria
         SET code=?, label=?, description=?, weight=?, sort_order=?, is_active=?, updated_by=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=?`
    ).bind(code, label, description, weight, sort_order, is_active, user.id, id).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO pd_deliverable_rubric_criteria (code, label, description, weight, sort_order, is_active, updated_by)
       VALUES (?,?,?,?,?,?,?)`
    ).bind(code, label, description, weight, sort_order, is_active, user.id).run();
  }
  await logActivity(c.env.DB, user.id, 'pd_rubric_criterion', id || 0, id ? 'update' : 'create');
  return c.redirect('/admin/pd-rubric?msg=' + encodeURIComponent('Saved'));
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

// Parse a pedagogy_library JSON-ish field. Tolerates both a real JSON array
// ("[\"a\",\"b\"]") and our legacy format that sometimes has stray whitespace.
function parseJsonList(raw: any): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw.map(String);
  try {
    const v = JSON.parse(String(raw));
    return Array.isArray(v) ? v.map(String) : [];
  } catch { return []; }
}

// Merge a reflection row back into a structured { notes, steps, checks }
// object. If the saved body is already JSON we use it; otherwise we treat
// the whole row as legacy free-text "notes" so teachers with old reflections
// don't lose anything.
function parseReflectionState(raw: string | undefined): { notes: string; steps: Record<string,string>; checks: Record<string,boolean> } {
  const empty = { notes: '', steps: {}, checks: {} };
  if (!raw) return empty;
  const s = String(raw).trim();
  if (!s) return empty;
  if (s.startsWith('{')) {
    try {
      const j = JSON.parse(s);
      return {
        notes: typeof j.notes === 'string' ? j.notes : '',
        steps: j.steps && typeof j.steps === 'object' ? j.steps : {},
        checks: j.checks && typeof j.checks === 'object' ? j.checks : {},
      };
    } catch { /* fall through to free-text */ }
  }
  return { notes: s, steps: {}, checks: {} };
}

function TeacherPdModule({ user, e, reflections, msg }: any) {
  const pill = statusPill(e.status);
  // Unlock rules: Learn is available as soon as the enrollment is not declined;
  // Practice unlocks once Learn is marked done; Apply unlocks once Practice is.
  const phaseUnlocked: Record<string, boolean> = {
    learn:    !['declined'].includes(e.status),
    practice: !!e.learn_done_at    && !['declined'].includes(e.status),
    apply:    !!e.practice_done_at && !['declined'].includes(e.status),
  };
  const autoStarted = e.status !== 'recommended' && e.status !== 'declined';
  // Extract per-level structured data from the pedagogy library (what the
  // written content summarises, but in machine form so we can render it as
  // clickable checkboxes instead of bullet text the teacher has to copy).
  const targetSignals = parseJsonList(e.tgt_evidence_signals);
  const targetMoves   = parseJsonList(e.tgt_teacher_next_moves);
  const targetCoach   = parseJsonList(e.tgt_coaching_considerations);

  // Parsed per-phase workspace state (notes + per-step answers + per-signal checkboxes).
  const learnState    = parseReflectionState(reflections.learn);
  const practiceState = parseReflectionState(reflections.practice);
  const applyState    = parseReflectionState(reflections.apply);

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
        <span id="aps-pd-autosave-status" class="text-xs px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-500 ml-auto whitespace-nowrap" aria-live="polite">{(reflections.learn || reflections.practice || reflections.apply) ? '✓ Your answers are saved' : 'Your answers will save automatically'}</span>
      </div>
      {msg && <div class="mt-3 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}

      {/* How this module works — always visible so teachers know the flow. */}
      <Card class="mt-4" title="How this module works" icon="fas fa-circle-info">
        <ol class="text-sm text-slate-700 space-y-1 list-decimal ml-5">
          <li><strong>Learn</strong> — pick an upcoming lesson, read the rubric side-by-side, check off which Level-{e.target_level + 1} evidence signals are already in that lesson and which are missing. <em>(Your answers auto-save as you type.)</em></li>
          <li><strong>Practice</strong> — rebuild the lesson using the research-backed moves for this indicator, script the opener / pivot / close, and pick one student-evidence artifact to collect.</li>
          <li><strong>Apply</strong> — teach the rebuilt lesson, then submit your lesson plan + student evidence + 3-sentence impact note. Your supervisor verifies right in the platform.</li>
        </ol>
        {!autoStarted && (
          <form method="post" action={`/teacher/pd/${e.id}/advance`} class="mt-3 inline-block">
            <input type="hidden" name="to" value="started" />
            <button class="bg-aps-navy text-white px-3 py-1.5 rounded text-sm hover:bg-aps-blue"><i class="fas fa-play mr-1"></i>Start module</button>
          </form>
        )}
        {!autoStarted && (
          <form method="post" action={`/teacher/pd/${e.id}/advance`} class="mt-3 ml-2 inline-block">
            <input type="hidden" name="to" value="declined" />
            <button class="text-xs text-slate-500 hover:underline">Not right now</button>
          </form>
        )}
      </Card>

      {e.research_basis && (
        <details class="mt-4 bg-white rounded-lg border border-slate-200 p-4">
          <summary class="cursor-pointer text-aps-navy font-display"><i class="fas fa-book mr-2"></i>Research basis &amp; what Level {e.target_level + 1} looks like</summary>
          <div class="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed mt-3">{e.research_basis}</div>
        </details>
      )}

      {/* ============================ LEARN ============================ */}
      <Card title={`1. Learn phase — pick the lesson, read the rubric, spot the gap`} icon="fas fa-book-open" class="mt-4">
        {!phaseUnlocked.learn ? (
          <p class="text-sm text-slate-500"><i class="fas fa-lock mr-1"></i>Finish the previous phase to unlock this one.</p>
        ) : (
          <div class="space-y-4" data-pd-phase="learn">
            <LearnStep num={1} title="Pick the lesson you will rebuild" state={learnState}>
              <p class="text-sm text-slate-700 mb-2">Open your lesson plans for the next 1-2 weeks. Choose <strong>ONE</strong> upcoming lesson where this indicator matters most — <em>{e.indicator_name}</em>. Describe it below:</p>
              <StepAnswer phase="learn" step={1} placeholder="Grade / subject / unit / exact lesson date — and one sentence on why THIS indicator matters in THAT lesson."
                value={learnState.steps['1'] || ''} rows={3} />
            </LearnStep>

            <LearnStep num={2} title={`Read the rubric side-by-side (10 min)`} state={learnState}>
              <div class="grid md:grid-cols-2 gap-3 text-sm">
                <div class="border border-slate-200 rounded-md p-3 bg-slate-50">
                  <div class="text-xs font-semibold text-slate-600 mb-1">Your current level ({e.target_level}):</div>
                  <div class="text-slate-800 whitespace-pre-wrap">{e.cur_interpretation || '—'}</div>
                </div>
                <div class="border border-emerald-200 rounded-md p-3 bg-emerald-50">
                  <div class="text-xs font-semibold text-emerald-800 mb-1">Your target level ({e.target_level + 1}):</div>
                  <div class="text-slate-800 whitespace-pre-wrap">{e.tgt_interpretation || '—'}</div>
                </div>
              </div>
              <div class="mt-3">
                <label class="text-xs text-slate-600 block mb-1">In your own words, what is the biggest difference between the two?</label>
                <StepAnswer phase="learn" step={2} placeholder="e.g. At Level 2 I explain; at Level 3 the students explain to each other…" value={learnState.steps['2'] || ''} rows={2} />
              </div>
            </LearnStep>

            <LearnStep num={3} title="Spot the evidence gap — check what's already in your lesson">
              {targetSignals.length === 0 ? (
                <p class="text-xs text-slate-500">(No evidence signals recorded for this indicator yet — skip this step and describe the gap below.)</p>
              ) : (
                <>
                  <p class="text-sm text-slate-700 mb-2">These are the Level {e.target_level + 1} signals an observer would write down. <strong>Check each signal that's already in the lesson you picked in Step 1.</strong> Unchecked = what your redesign has to introduce.</p>
                  <ul class="space-y-1.5">
                    {targetSignals.map((sig: string, i: number) => {
                      const key = `learn_sig_${i}`;
                      return (
                        <li>
                          <label class="flex items-start gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                            <input type="checkbox" data-pd-check={key} data-pd-phase="learn" class="mt-0.5 h-4 w-4 text-aps-navy" checked={!!learnState.checks[key]} />
                            <span>{sig}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              <div class="mt-3">
                <label class="text-xs text-slate-600 block mb-1">Write out the 1-2 specific signals that are <strong>missing</strong> — those are exactly what your redesigned lesson has to introduce:</label>
                <StepAnswer phase="learn" step={3} placeholder="e.g. I don't currently do a student-to-student discourse move during the pivot." value={learnState.steps['3'] || ''} rows={3} />
              </div>
            </LearnStep>

            <EnrichmentBlock e={e} phase="learn" />
            <PhaseFooter e={e} phase="learn" nextLabel="Mark learn complete" nextStatus="learn_done" doneStamp={e.learn_done_at} />
          </div>
        )}
      </Card>

      {/* ============================ PRACTICE ============================ */}
      <Card title={`2. Practice phase — rebuild the lesson & script the moves`} icon="fas fa-dumbbell" class="mt-4">
        {!phaseUnlocked.practice ? (
          <p class="text-sm text-slate-500"><i class="fas fa-lock mr-1"></i>Finish Learn first to unlock this one.</p>
        ) : (
          <div class="space-y-4" data-pd-phase="practice">
            <LearnStep num={4} title="Rewrite the lesson (25 min)">
              <p class="text-sm text-slate-700 mb-2">Take the lesson from Learn Step 1 and rebuild it so the missing Level {e.target_level + 1} signals show up. <strong>Check every research-backed move you're going to use in the rebuild:</strong></p>
              {targetMoves.length === 0 ? (
                <p class="text-xs text-slate-500">(No specific research moves are recorded for this indicator yet — describe your moves in the answer box below.)</p>
              ) : (
                <ul class="space-y-1.5">
                  {targetMoves.map((m: string, i: number) => {
                    const key = `practice_move_${i}`;
                    return (
                      <li>
                        <label class="flex items-start gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                          <input type="checkbox" data-pd-check={key} data-pd-phase="practice" class="mt-0.5 h-4 w-4 text-aps-navy" checked={!!practiceState.checks[key]} />
                          <span>{m}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              )}
              <div class="mt-3">
                <label class="text-xs text-slate-600 block mb-1">Paste or sketch your rebuilt lesson plan (or a link to it). Bold / highlight what changed:</label>
                <StepAnswer phase="practice" step={4} placeholder={`Rebuilt plan — objective, opening, main task, checks for understanding, close, materials.\n\nOr paste a link to your Google Doc / plan.`} value={practiceState.steps['4'] || ''} rows={8} />
              </div>
            </LearnStep>

            <LearnStep num={5} title="Script the 3 high-leverage moments">
              <p class="text-sm text-slate-700 mb-2">Write down — <strong>word for word</strong> — what you will say or do at these three moments:</p>
              <div class="space-y-3">
                <div>
                  <label class="text-xs font-semibold text-slate-700 block mb-1">① Opening (first 3 minutes): What question or task launches the lesson so Level {e.target_level + 1} is visible immediately?</label>
                  <StepAnswer phase="practice" step={5} placeholder={`e.g. "Turn to your partner and tell them — in one sentence — what yesterday's lesson was really about. I want to hear YOUR words, not mine."`} value={practiceState.steps['5'] || ''} rows={3} />
                </div>
                <div>
                  <label class="text-xs font-semibold text-slate-700 block mb-1">② Pivot moment (middle): Where will student thinking most likely go sideways? What's your move when it does?</label>
                  <StepAnswer phase="practice" step={6} placeholder='e.g. "I will notice if three or more students skip the units on their answer — then I will call on Maya to explain her method to the class."' value={practiceState.steps['6'] || ''} rows={3} />
                </div>
                <div>
                  <label class="text-xs font-semibold text-slate-700 block mb-1">③ Close (last 5 minutes): How will students DEMONSTRATE the Level {e.target_level + 1} signal for you?</label>
                  <StepAnswer phase="practice" step={7} placeholder={`e.g. "Exit ticket: In two sentences, explain to next year's student what today's rule is and WHEN to use it."`} value={practiceState.steps['7'] || ''} rows={3} />
                </div>
              </div>
            </LearnStep>

            <LearnStep num={6} title="Pick ONE student-evidence artifact you will keep">
              <p class="text-sm text-slate-700 mb-2">Decide now — before you teach — which single artifact you'll keep as proof the redesign worked. <strong>Pick one:</strong></p>
              <div class="space-y-1.5">
                {[
                  { key: 'exit_ticket',  label: 'A completed exit ticket showing student mastery of the indicator' },
                  { key: 'board_photo',  label: 'An annotated photo of the board / anchor chart' },
                  { key: 'work_sample',  label: 'A student work sample (with name redacted)' },
                  { key: 'transcript',   label: '3-5 student utterances during the pivot moment (short transcript)' },
                  { key: 'other',        label: 'Something else (describe in your answer)' },
                ].map((o) => {
                  const key = `practice_art_${o.key}`;
                  return (
                    <label class="flex items-start gap-2 text-sm cursor-pointer hover:bg-slate-50 rounded px-1 py-0.5">
                      <input type="radio" name="practice_artifact" data-pd-check={key} data-pd-check-group="practice_artifact" data-pd-phase="practice" class="mt-0.5 h-4 w-4 text-aps-navy" checked={!!practiceState.checks[key]} />
                      <span>{o.label}</span>
                    </label>
                  );
                })}
              </div>
              <div class="mt-3">
                <label class="text-xs text-slate-600 block mb-1">Note (1 sentence) — where/when in the lesson you'll capture it:</label>
                <StepAnswer phase="practice" step={8} placeholder="e.g. Board photo right after the close, before students leave." value={practiceState.steps['8'] || ''} rows={2} />
              </div>
            </LearnStep>

            <EnrichmentBlock e={e} phase="practice" />
            <PhaseFooter e={e} phase="practice" nextLabel="Mark practice complete" nextStatus="practice_done" doneStamp={e.practice_done_at} />
          </div>
        )}
      </Card>

      {/* ============================ APPLY ============================ */}
      <Card title={`3. Apply phase — teach the lesson & submit your bundle`} icon="fas fa-briefcase" class="mt-4">
        {!phaseUnlocked.apply ? (
          <p class="text-sm text-slate-500"><i class="fas fa-lock mr-1"></i>Finish Practice first to unlock this one.</p>
        ) : (
          <ApplyPhase e={e} applyState={applyState} targetCoach={targetCoach} />
        )}
      </Card>

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

      {/* Client-side engine: auto-save every [data-pd-step-answer] textarea
          and every [data-pd-check] checkbox into the reflection for its phase.
          Debounce typing; fire immediately on blur / check change. */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function() {
          const ENROLL_ID = ${JSON.stringify(e.id)};
          const URL = '/teacher/pd/' + ENROLL_ID + '/reflect-json';
          const status = document.getElementById('aps-pd-autosave-status');
          function setStatus(text, bg, fg, border) {
            if (!status) return;
            status.textContent = text;
            if (bg)     status.style.backgroundColor = bg;
            if (fg)     status.style.color = fg;
            if (border) status.style.borderColor = border;
          }
          // State by phase (learn/practice/apply): { notes, steps{}, checks{} }.
          const initial = ${JSON.stringify({ learn: learnState, practice: practiceState, apply: applyState })};
          const state = initial;
          const timers = {};
          async function flush(phase) {
            try {
              setStatus('Saving…', '#f1f5f9', '#64748b', '#cbd5e1');
              const fd = new FormData();
              fd.set('phase', phase);
              fd.set('body', JSON.stringify(state[phase]));
              const r = await fetch(URL, { method: 'POST', body: fd, credentials: 'same-origin' });
              if (!r.ok) throw new Error('HTTP ' + r.status);
              const j = await r.json();
              if (!j.ok) throw new Error(j.err || 'save_failed');
              const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              setStatus('✓ Saved (' + phase + ') at ' + t, '#d1fae5', '#065f46', '#6ee7b7');
            } catch (err) {
              setStatus('⚠ Not saved — try again', '#fee2e2', '#991b1b', '#fca5a5');
            }
          }
          function scheduleFlush(phase, immediate) {
            if (timers[phase]) clearTimeout(timers[phase]);
            if (immediate) { flush(phase); return; }
            timers[phase] = setTimeout(() => flush(phase), 700);
          }
          document.querySelectorAll('[data-pd-step-answer]').forEach(el => {
            const phase = el.getAttribute('data-pd-phase');
            const step = el.getAttribute('data-pd-step-answer');
            el.addEventListener('input', () => {
              state[phase].steps[step] = el.value;
              setStatus('Typing… (will save in 1s)', '#f1f5f9', '#475569', '#cbd5e1');
              scheduleFlush(phase, false);
            });
            el.addEventListener('blur', () => {
              state[phase].steps[step] = el.value;
              scheduleFlush(phase, true);
            });
          });
          document.querySelectorAll('[data-pd-check]').forEach(el => {
            const phase = el.getAttribute('data-pd-phase');
            const key = el.getAttribute('data-pd-check');
            const group = el.getAttribute('data-pd-check-group');
            el.addEventListener('change', () => {
              if (group && el.type === 'radio') {
                // clear other keys in the same group before setting this one
                document.querySelectorAll('[data-pd-check-group="' + group + '"]').forEach(other => {
                  const k = other.getAttribute('data-pd-check');
                  if (k && k !== key) state[phase].checks[k] = false;
                });
              }
              state[phase].checks[key] = !!el.checked;
              scheduleFlush(phase, true);
            });
          });
          const notesEl = document.querySelector('[data-pd-notes]');
          if (notesEl) {
            const phase = notesEl.getAttribute('data-pd-phase') || 'apply';
            notesEl.addEventListener('input', () => {
              state[phase].notes = notesEl.value;
              setStatus('Typing… (will save in 1s)', '#f1f5f9', '#475569', '#cbd5e1');
              scheduleFlush(phase, false);
            });
            notesEl.addEventListener('blur', () => {
              state[phase].notes = notesEl.value;
              scheduleFlush(phase, true);
            });
          }
        })();
      ` }}></script>
    </Layout>
  );
}

// Small labelled section inside a phase that renders one STEP with an icon.
function LearnStep({ num, title, children }: { num: number; title: string; state?: any; children: any }) {
  return (
    <div class="border-l-4 border-aps-navy/20 pl-4 py-1">
      <div class="flex items-center gap-2 mb-2">
        <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-aps-navy text-white text-xs font-bold">{num}</span>
        <h3 class="font-display text-aps-navy">STEP {num} — {title}</h3>
      </div>
      <div class="ml-9">{children}</div>
    </div>
  );
}

// An auto-saving inline text box bound to a (phase, step).
function StepAnswer({ phase, step, placeholder, value, rows }: { phase: string; step: number; placeholder: string; value: string; rows: number }) {
  return (
    <textarea
      data-pd-step-answer={String(step)}
      data-pd-phase={phase}
      rows={rows}
      placeholder={placeholder}
      class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm focus:border-aps-navy focus:outline-none focus:ring-1 focus:ring-aps-navy/30"
    >{value}</textarea>
  );
}

// --------------------------------------------------------------------------
// EnrichmentBlock (April 2026 upgrade)
// --------------------------------------------------------------------------
// Renders the four admin-editable enrichment fields (modeling_examples,
// collaboration_prompts, family_engagement_notes, contextual_differentiation)
// below each phase.  Every field is optional — fields that are null or empty
// are silently skipped so modules whose admins haven't filled them in yet
// continue to look clean.  All content lives in pd_modules (DB) and is fully
// editable via /admin/pd/:id — there is NO hard-coded text here.
function EnrichmentBlock({ e, phase }: { e: any; phase: 'learn' | 'practice' | 'apply' }) {
  // On the Learn phase we show modeling + differentiation (so teachers
  // visualize what good looks like BEFORE they try it).  On Practice we
  // surface collaboration prompts (rehearsal with a colleague).  On Apply
  // we surface family-engagement guidance (since Apply is where student +
  // family impact shows up).  Admins can override this allocation by
  // simply editing the content; we just pick which slot to *render* in.
  const parts: { title: string; icon: string; body: string }[] = [];
  if (phase === 'learn') {
    if (e.modeling_examples) parts.push({
      title: 'Modeling example — what good looks like',
      icon: 'fa-theater-masks',
      body: e.modeling_examples,
    });
    if (e.contextual_differentiation) parts.push({
      title: 'Elementary vs. secondary — pick the version that fits',
      icon: 'fa-arrows-split-up-and-left',
      body: e.contextual_differentiation,
    });
  } else if (phase === 'practice') {
    if (e.collaboration_prompts) parts.push({
      title: 'Collaborate — rehearse with a colleague',
      icon: 'fa-users',
      body: e.collaboration_prompts,
    });
    if (e.modeling_examples) parts.push({
      title: 'Re-read the modeling example before you script',
      icon: 'fa-theater-masks',
      body: e.modeling_examples,
    });
  } else {
    // apply
    if (e.family_engagement_notes) parts.push({
      title: 'Family engagement — culturally responsive communication',
      icon: 'fa-house-user',
      body: e.family_engagement_notes,
    });
    if (e.contextual_differentiation) parts.push({
      title: 'Adapt for your setting — elementary vs. secondary',
      icon: 'fa-arrows-split-up-and-left',
      body: e.contextual_differentiation,
    });
  }
  if (parts.length === 0) return null;
  return (
    <div class="mt-4 border-t border-slate-100 pt-4 space-y-3">
      {parts.map((p) => (
        <details class="bg-sky-50 border border-sky-200 rounded-md">
          <summary class="cursor-pointer px-3 py-2 text-sm font-medium text-aps-navy">
            <i class={`fas ${p.icon} mr-2 text-sky-700`}></i>{p.title}
          </summary>
          <div class="px-3 pb-3 text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{p.body}</div>
        </details>
      ))}
    </div>
  );
}

// Footer with "Mark phase complete" button. Hidden once the phase has been
// marked done. Posts through /advance with the correct target status; the
// state machine auto-bridges recommended → learn_done if the teacher never
// pressed "Start module" explicitly.
function PhaseFooter({ e, phase, nextLabel, nextStatus, doneStamp }: any) {
  if (doneStamp) {
    return (
      <div class="mt-3 text-sm text-emerald-700 flex items-center gap-2">
        <i class="fas fa-check-circle"></i>
        <span>{phase[0].toUpperCase() + phase.slice(1)} marked complete on {formatDate(doneStamp)}.</span>
      </div>
    );
  }
  return (
    <form method="post" action={`/teacher/pd/${e.id}/advance`} class="mt-3 flex items-center gap-2">
      <input type="hidden" name="to" value={nextStatus} />
      <button class="bg-aps-navy text-white px-3 py-1.5 rounded text-sm hover:bg-aps-blue">
        <i class="fas fa-check mr-1"></i>{nextLabel}
      </button>
      <span class="text-xs text-slate-500">Your answers are already saved — this unlocks the next phase.</span>
    </form>
  );
}

function ApplyPhase({ e, applyState, targetCoach }: any) {
  const canSubmit = ['practice_done','needs_revision','learn_done'].includes(e.status);
  const isFinal = e.status === 'verified';
  const steps = applyState?.steps || {};
  return (
    <div class="space-y-4" data-pd-phase="apply">
      <LearnStep num={7} title="Teach the redesigned lesson — then answer these 3 reflection prompts">
        <div class="space-y-3">
          <div>
            <label class="text-xs font-semibold text-slate-700 block mb-1">Which of the Level {e.target_level + 1} moves actually happened in the room?</label>
            <StepAnswer phase="apply" step={1} placeholder="e.g. The student-to-student explain move worked in Period 3 but not in Period 5 because…" value={steps['1'] || ''} rows={3} />
          </div>
          <div>
            <label class="text-xs font-semibold text-slate-700 block mb-1">What did students say or do that surprised you?</label>
            <StepAnswer phase="apply" step={2} placeholder="Quote a student if you can remember the words." value={steps['2'] || ''} rows={3} />
          </div>
          <div>
            <label class="text-xs font-semibold text-slate-700 block mb-1">What would you change before teaching this lesson again?</label>
            <StepAnswer phase="apply" step={3} placeholder="One concrete change — not a wish list." value={steps['3'] || ''} rows={3} />
          </div>
        </div>
      </LearnStep>

      {targetCoach && targetCoach.length > 0 && (
        <details class="text-xs text-slate-600 border border-slate-200 rounded p-3 bg-slate-50">
          <summary class="cursor-pointer text-slate-700">Coaching considerations your supervisor will look for</summary>
          <ul class="mt-2 space-y-1 list-disc ml-5">
            {targetCoach.map((c: string) => <li>{c}</li>)}
          </ul>
        </details>
      )}

      <LearnStep num={8} title="Bundle the artifact & submit">
        <div class="p-3 rounded bg-amber-50 border border-amber-200 text-sm mb-3">
          <div class="font-semibold text-amber-900 mb-1"><i class="fas fa-clipboard-list mr-1"></i>Your deliverable should contain:</div>
          <ol class="text-amber-900 list-decimal ml-5 space-y-0.5">
            <li><strong>Lesson context</strong> — grade, subject, unit, date taught, class composition (one paragraph).</li>
            <li><strong>Rebuilt lesson plan</strong> — paste or link. Bold the Level {e.target_level + 1} moves you added.</li>
            <li><strong>The 3 scripted moments</strong> — word-for-word opener, pivot, close (you wrote these in Practice).</li>
            <li><strong>Student evidence artifact</strong> — exit ticket text + responses, board photo link, student quotes, or work sample.</li>
            <li><strong>Impact note</strong> — 3 sentences: what moved, what fell short, ONE next classroom move.</li>
          </ol>
          {e.deliverable_rubric && (
            <details class="mt-2 text-xs text-amber-900/80">
              <summary class="cursor-pointer">What your supervisor will check</summary>
              <div class="mt-1 whitespace-pre-wrap">{e.deliverable_rubric}</div>
            </details>
          )}
        </div>
        <form method="post" action={`/teacher/pd/${e.id}/submit`} class="space-y-3">
          <label class="block text-sm">Title<br/>
            <input name="title" value={e.deliverable_title || `Rebuilt lesson — ${e.indicator_name} (Level ${e.target_level} → ${e.target_level + 1})`} class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" required disabled={isFinal} />
          </label>
          <label class="block text-sm">Your full deliverable (all 5 sections above)<br/>
            <textarea name="body" rows={14} required disabled={isFinal} class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5 font-mono text-xs leading-relaxed" placeholder={`1) LESSON CONTEXT\n\n2) REBUILT LESSON PLAN\n\n3) THE 3 SCRIPTED MOMENTS\n\n4) STUDENT EVIDENCE\n\n5) IMPACT NOTE`}>{e.deliverable_body || ''}</textarea>
          </label>
          <p class="text-xs text-slate-500">You can paste Google Doc / Canvas links instead of full text. Markdown is fine. Your supervisor will read this page to verify.</p>
          {canSubmit && !isFinal && (
            <button class="bg-aps-navy text-white px-3 py-1.5 rounded text-sm hover:bg-aps-blue"><i class="fas fa-paper-plane mr-1"></i>{e.status === 'needs_revision' ? 'Resubmit for review' : 'Submit for review'}</button>
          )}
          {e.status === 'submitted' && <span class="ml-2 text-xs text-violet-700"><i class="fas fa-inbox mr-1"></i>Awaiting supervisor review</span>}
        </form>
      </LearnStep>

      <EnrichmentBlock e={e} phase="apply" />
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

function ReviewPdDetail({ user, e, teacher, reflections, criteria, scoreMap, msg }: any) {
  const pill = statusPill(e.status);
  criteria = criteria || [];
  scoreMap = scoreMap || {};
  // Roll-up weighted average — shown in the rubric header so the supervisor
  // sees at a glance how the artifact is scoring overall.
  let totalWeight = 0;
  let weightedSum = 0;
  let scoredCount = 0;
  for (const cr of criteria) {
    const s = scoreMap[cr.id];
    if (s && s.level) {
      totalWeight += (cr.weight || 1);
      weightedSum += (cr.weight || 1) * s.level;
      scoredCount += 1;
    }
  }
  const avg = totalWeight ? (weightedSum / totalWeight) : null;
  const levelLabels: Record<number, string> = { 4: 'Highly Effective', 3: 'Effective', 2: 'Improvement Needed', 1: 'Does Not Meet' };
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

      {/* April 2026 upgrade: evidence-based deliverable rubric.  One row per
          criterion in pd_deliverable_rubric_criteria.  The supervisor scores
          1-4 on each; the rolled-up weighted average displays at the top so
          they can tell at a glance whether to verify or ask for revision. */}
      {criteria.length > 0 && (
        <Card title="Deliverable rubric" icon="fas fa-clipboard-check" class="mt-4">
          <a id="rubric"></a>
          <p class="text-xs text-slate-500 mb-2">
            Score the submitted artifact on each evidence-based criterion below. Your scores are saved individually — you can adjust any criterion before you click <em>Verify complete</em> or <em>Ask for revision</em> at the bottom of this page.
            {' '}All four criteria are editable in <a href="/admin/pd-rubric" class="text-aps-blue hover:underline">Admin → PD deliverable rubric</a>.
          </p>
          {avg !== null && (
            <div class="mb-3 p-2 bg-aps-navy text-white rounded flex items-center gap-3 text-sm">
              <i class="fas fa-chart-simple"></i>
              <span>Rolled-up weighted average: <strong>{avg.toFixed(2)} / 4.00</strong> ({scoredCount} / {criteria.length} criteria scored)</span>
            </div>
          )}
          <div class="space-y-3">
            {criteria.map((cr: any) => {
              const s = scoreMap[cr.id] || {};
              return (
                <form method="post" action={`/pd/review/${e.id}/rubric`} class="border border-slate-200 rounded p-3">
                  <input type="hidden" name="criterion_id" value={cr.id} />
                  <div class="flex items-start gap-2 flex-wrap">
                    <div class="flex-1 min-w-[14rem]">
                      <div class="font-medium text-aps-navy text-sm">{cr.label}</div>
                      <div class="text-xs text-slate-600 mt-0.5">{cr.description}</div>
                    </div>
                    {s.level && (
                      <span class="text-xs px-2 py-0.5 rounded-full bg-aps-gold/20 text-aps-navy border border-aps-gold">
                        Current: {s.level} · {levelLabels[s.level]}
                      </span>
                    )}
                  </div>
                  <div class="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
                    {[4, 3, 2, 1].map((lvl) => (
                      <label class={`cursor-pointer border rounded p-2 hover:bg-slate-50 ${s.level === lvl ? 'border-aps-navy bg-sky-50 font-medium' : 'border-slate-200'}`}>
                        <input type="radio" name="level" value={lvl} checked={s.level === lvl} class="mr-1" />
                        <span>{lvl} · {levelLabels[lvl]}</span>
                      </label>
                    ))}
                  </div>
                  <label class="block mt-2 text-xs">
                    <span class="block text-slate-600 mb-1">Note (optional — what you saw in the artifact that supports this level)</span>
                    <textarea name="note" rows={2} class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs" placeholder="e.g. The rebuilt plan explicitly scripts the level-3 move at the pivot — see paragraph 2.">{s.note || ''}</textarea>
                  </label>
                  <div class="mt-2">
                    <button class="text-xs bg-aps-navy text-white px-3 py-1 rounded hover:bg-aps-blue"><i class="fas fa-save mr-1"></i>Save score for this criterion</button>
                  </div>
                </form>
              );
            })}
          </div>
        </Card>
      )}

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
        <div class="flex flex-wrap gap-2">
          <a href="/admin/pd-rubric" class="bg-white border border-aps-navy text-aps-navy px-3 py-1.5 rounded text-sm hover:bg-slate-50"><i class="fas fa-clipboard-check mr-1"></i>Deliverable rubric</a>
          <a href="/admin/pd/export-csv" class="bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded text-sm hover:bg-slate-50"><i class="fas fa-file-export mr-1"></i>Export CSV</a>
          <a href="/admin/pd/new" class="bg-aps-navy text-white px-3 py-1.5 rounded text-sm hover:bg-aps-blue"><i class="fas fa-plus mr-1"></i>New module</a>
        </div>
      </div>
      {msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}

      {/* April 2026 upgrade: CSV import lets admins bulk-edit all 120 modules
          (including the four enrichment fields) in Excel and re-upload. */}
      <Card title="Bulk import from CSV" icon="fas fa-file-import" class="mb-4">
        <p class="text-xs text-slate-600 mb-2">Download the export above, edit in Excel, and re-upload to update existing rows (by <code>id</code>) or add new ones (leave <code>id</code> blank).</p>
        <form method="post" action="/admin/pd/import-csv" enctype="multipart/form-data" class="flex items-center gap-2 flex-wrap">
          <input type="file" name="csv" accept=".csv,text/csv" required class="text-sm" />
          <button class="bg-aps-navy text-white px-3 py-1.5 rounded text-sm hover:bg-aps-blue"><i class="fas fa-upload mr-1"></i>Import CSV</button>
        </form>
      </Card>

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

// April 2026 upgrade: admin-editable deliverable rubric criteria.  Each criterion
// becomes a scoring row in the PD review queue.  Admins can rename, rewrite,
// reweight, or deactivate any criterion (and add brand-new ones) without code.
function AdminPdRubric({ user, rows, msg }: any) {
  const blank = { id: 0, code: '', label: '', description: '', weight: 1, sort_order: (rows.length + 1) * 10, is_active: 1 };
  return (
    <Layout title="PD deliverable rubric" user={user} activeNav="admin-pd">
      <div class="mb-2"><a href="/admin/pd" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>PD modules</a></div>
      <h1 class="font-display text-2xl text-aps-navy mb-1">PD deliverable rubric</h1>
      <p class="text-sm text-slate-600 mb-4">
        These criteria appear — in this order — on every PD review page. Supervisors score each one 1-4 on the submitted artifact. Renaming a criterion here immediately changes what appraisers see. Scores already saved are never lost.
      </p>
      {msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}

      <div class="space-y-4">
        {rows.map((r: any) => <AdminPdRubricForm row={r} />)}
        <AdminPdRubricForm row={blank} isNew />
      </div>
    </Layout>
  );
}

function AdminPdRubricForm({ row, isNew }: { row: any; isNew?: boolean }) {
  return (
    <form method="post" action="/admin/pd-rubric/save" class={`border rounded p-3 ${isNew ? 'border-dashed border-slate-300 bg-slate-50' : 'border-slate-200 bg-white'}`}>
      <input type="hidden" name="id" value={row.id || ''} />
      <div class="flex items-center gap-2 flex-wrap mb-2">
        <strong class="text-aps-navy text-sm">{isNew ? 'Add a new criterion' : `Criterion: ${row.label}`}</strong>
        {!isNew && (
          <label class="text-xs text-slate-600 ml-auto flex items-center gap-1">
            <input type="checkbox" name="is_active" value="1" checked={!!row.is_active} /> Active
          </label>
        )}
      </div>
      <div class="grid md:grid-cols-6 gap-2 text-xs">
        <label class="md:col-span-1">Code (stable key)<input name="code" value={row.code || ''} required class="mt-1 w-full border border-slate-300 rounded px-2 py-1" placeholder="alignment" /></label>
        <label class="md:col-span-2">Label (teacher-facing)<input name="label" value={row.label || ''} required class="mt-1 w-full border border-slate-300 rounded px-2 py-1" placeholder="Alignment with target indicator" /></label>
        <label class="md:col-span-1">Weight<input type="number" name="weight" min="1" value={row.weight || 1} class="mt-1 w-full border border-slate-300 rounded px-2 py-1" /></label>
        <label class="md:col-span-1">Sort order<input type="number" name="sort_order" value={row.sort_order || 0} class="mt-1 w-full border border-slate-300 rounded px-2 py-1" /></label>
        {isNew && (
          <label class="md:col-span-1 flex items-center gap-1 text-xs text-slate-600">
            <input type="checkbox" name="is_active" value="1" checked /> Active
          </label>
        )}
      </div>
      <label class="block mt-2 text-xs">Description (scoring guidance)
        <textarea name="description" rows={2} required class="mt-1 w-full border border-slate-300 rounded px-2 py-1">{row.description || ''}</textarea>
      </label>
      <div class="mt-2">
        <button class="bg-aps-navy text-white px-3 py-1 rounded text-xs hover:bg-aps-blue"><i class="fas fa-save mr-1"></i>{isNew ? 'Add criterion' : 'Save changes'}</button>
      </div>
    </form>
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

        {/* April 2026 enrichments — all optional, all surfaced in the teacher view
            below the core Learn / Practice / Apply content.  Each field is plain
            text; admins can use bullet lists, numbered lists, or prose. */}
        <Card title="Enrichment: Modeling examples" icon="fas fa-theater-masks">
          <p class="text-xs text-slate-500 mb-2">A short textual mini-case study or scripted example that shows what effective practice looks like at the target level. No videos required — describe it step by step. Shown to teachers in the Learn and Practice phases.</p>
          <textarea name="modeling_examples" rows={6} class="w-full border border-slate-300 rounded px-2 py-1.5 font-mono text-xs leading-relaxed" placeholder="Example: a 5-minute morning meeting.&#10;  1. Greeting (60s): …&#10;  2. Share (90s): …&#10;Sample teacher script: &quot;…&quot;">{m.modeling_examples || ''}</textarea>
        </Card>

        <Card title="Enrichment: Collaboration prompts" icon="fas fa-users">
          <p class="text-xs text-slate-500 mb-2">One or two short prompts inviting the teacher to rehearse with a colleague or PLC. Shown in the Practice phase.</p>
          <textarea name="collaboration_prompts" rows={4} class="w-full border border-slate-300 rounded px-2 py-1.5 font-mono text-xs leading-relaxed" placeholder="Bring your rebuilt routine to the next PLC. Ask one colleague to watch you run it and give you one piece of feedback on pacing and one on student response. Offer to return the favor.">{m.collaboration_prompts || ''}</textarea>
        </Card>

        <Card title="Enrichment: Family engagement notes" icon="fas fa-house-user">
          <p class="text-xs text-slate-500 mb-2">Culturally responsive, accessible-language guidance for communicating with families about the redesigned lesson or routine. Shown in the Apply phase.</p>
          <textarea name="family_engagement_notes" rows={5} class="w-full border border-slate-300 rounded px-2 py-1.5 font-mono text-xs leading-relaxed" placeholder="Equity first: assume families speak languages other than English, may not have reliable internet, and may work during typical 'parent night' hours. Offer a printed copy, a translated version, and either a daytime or evening option.">{m.family_engagement_notes || ''}</textarea>
        </Card>

        <Card title="Enrichment: Contextual differentiation (elementary vs secondary)" icon="fas fa-arrows-split-up-and-left">
          <p class="text-xs text-slate-500 mb-2">How this module's moves look different in an elementary vs. a secondary classroom. Shown in the Learn and Apply phases so every teacher gets advice that fits their grade band.</p>
          <textarea name="contextual_differentiation" rows={4} class="w-full border border-slate-300 rounded px-2 py-1.5 font-mono text-xs leading-relaxed" placeholder="Elementary: use visual feelings-cards, picture-book examples, puppet modeling. Lessons should fit in 5-10 minutes.&#10;Secondary: frame as executive-function skill, use case studies from the content area, keep each mini-lesson to 5 minutes.">{m.contextual_differentiation || ''}</textarea>
        </Card>

        <div class="flex items-center gap-2">
          <button class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-save mr-1"></i>Save module</button>
          <a href="/admin/pd" class="text-sm text-slate-500 hover:underline">Cancel</a>
        </div>
      </form>
    </Layout>
  );
}
