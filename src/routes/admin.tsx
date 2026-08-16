import { Hono } from 'hono';
import type { Bindings, Variables, UserRole } from '../lib/types';
import { Layout, Card, Button, DomainTabs } from '../lib/layout';
import { requireRole, hashPassword } from '../lib/auth';
import {
  getDomainsWithIndicators, getActiveFramework, logActivity,
  setUserSchools, getUserSchoolIds,
  listExternalPdQueue, getNumericSetting, setSetting, recentAdminAudit, logAdminAudit,
} from '../lib/db';
// Aug 16, 2026 — Fix: /admin/users/create called `notify(...)` without importing it,
// which surfaced to the admin as a "Could not create user: notify is not defined" toast
// (even though the INSERT succeeded before notify() threw). Pull it in explicitly so
// the welcome notification actually fires and the toast disappears.
import { notify } from '../lib/notifications';
import { formatDate, formatDateTime, levelLabels, levelColor } from '../lib/ui';
import { parseCsvAsObjects, buildCsv } from '../lib/csv';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use('*', requireRole(['super_admin']));

// ---------- Admin overview ----------
app.get('/', async (c) => {
  const user = c.get('user')!;
  const welcome = c.req.query('welcome') === '1';
  const users = await c.env.DB.prepare(
    `SELECT role, COUNT(*) AS n FROM users WHERE active=1 GROUP BY role`
  ).all();
  const byRole: Record<string, number> = {};
  for (const r of (users.results as any[])) byRole[r.role] = r.n;
  const obs = await c.env.DB.prepare(`SELECT status, COUNT(*) AS n FROM observations GROUP BY status`).all();
  const byStatus: Record<string, number> = {};
  for (const r of (obs.results as any[])) byStatus[r.status] = r.n;
  const recent = await c.env.DB.prepare(
    `SELECT al.*, u.first_name, u.last_name FROM activity_log al
     LEFT JOIN users u ON u.id = al.user_id
     ORDER BY al.id DESC LIMIT 20`
  ).all();
  return c.html(<AdminHome user={user} byRole={byRole} byStatus={byStatus} recent={recent.results || []} welcome={welcome} />);
});

// ---------- Users ----------
app.get('/users', async (c) => {
  const user = c.get('user')!;
  const q = (c.req.query('q') || '').trim();
  const roleFilter = c.req.query('role') || '';
  const msg = c.req.query('msg');
  let sql = `SELECT u.*, s.name AS school_name FROM users u LEFT JOIN schools s ON s.id=u.school_id WHERE 1=1`;
  const binds: any[] = [];
  if (q) { sql += ` AND (lower(u.first_name||' '||u.last_name) LIKE ? OR lower(u.email) LIKE ?)`; binds.push(`%${q.toLowerCase()}%`, `%${q.toLowerCase()}%`); }
  if (roleFilter) { sql += ` AND u.role = ?`; binds.push(roleFilter); }
  sql += ` ORDER BY u.role, u.last_name, u.first_name`;
  const rows = await c.env.DB.prepare(sql).bind(...binds).all();
  const schools = await c.env.DB.prepare(`SELECT * FROM schools WHERE district_id=1 ORDER BY name`).all();

  // Pull all school links in one query and group by user so the UI can show chips.
  const links = await c.env.DB.prepare(
    `SELECT us.user_id, us.school_id, us.is_primary, s.name
       FROM user_schools us JOIN schools s ON s.id = us.school_id
      ORDER BY us.is_primary DESC, s.name`
  ).all();
  const linksByUser = new Map<number, any[]>();
  for (const l of (links.results as any[])) {
    if (!linksByUser.has(l.user_id)) linksByUser.set(l.user_id, []);
    linksByUser.get(l.user_id)!.push(l);
  }
  const rowsWithSchools = (rows.results as any[]).map((u: any) => ({
    ...u, schools: linksByUser.get(u.id) || [],
  }));
  return c.html(<UsersPage user={user} rows={rowsWithSchools} schools={schools.results || []} q={q} roleFilter={roleFilter} msg={msg} />);
});

app.post('/users/create', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody({ all: true });
  const email = String(body.email || '').trim().toLowerCase();
  const first = String(body.first_name || '').trim();
  const last = String(body.last_name || '').trim();
  const role = String(body.role || '') as UserRole;
  const title = String(body.title || '').trim() || null;
  const phone = String(body.phone || '').trim() || null;
  const schoolIds = parseMultiIds(body.school_ids);
  const pw = String(body.password || 'Alexander2026!');
  // June 3, 2026 — Fix 11 (completion): admin can now set classroom context
  // (subject_area / classroom_type / grade_band) directly when creating users.
  // These feed the context-aware auto-feedback generator (db.ts:teacherContextNote).
  const subjectArea    = String(body.subject_area || '').trim() || null;
  const classroomType  = String(body.classroom_type || '').trim() || null;
  const gradeBand      = String(body.grade_band || '').trim() || null;
  if (!email || !first || !last || !role) return c.redirect('/admin/users?msg=Missing+fields');
  const hash = await hashPassword(pw);
  try {
    const res = await c.env.DB.prepare(
      `INSERT INTO users (district_id, school_id, email, password_hash, first_name, last_name, role, title, phone, active, must_change_password, subject_area, classroom_type, grade_band)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?, ?)`
    ).bind(schoolIds[0] || null, email, hash, first, last, role, title, phone, subjectArea, classroomType, gradeBand).run();
    const newId = Number((res.meta as any)?.last_row_id);
    if (schoolIds.length) await setUserSchools(c.env.DB, newId, schoolIds);
    await logActivity(c.env.DB, user.id, 'user', newId, 'create_user', { email, role, schoolIds });
    // Welcome notification — shown on first sign-in bell
    await notify(c.env.DB, {
      user_id: newId,
      kind: 'account_created',
      title: 'Welcome to the Marshall Growth Platform',
      body: `Your ${role} account is active. Use your temporary password to sign in, then change it on the Profile page.`,
      url: '/profile',
      entity_type: 'user', entity_id: newId, actor_user_id: user.id,
    }, c.env);
    return c.redirect(`/admin/users?msg=Created+${encodeURIComponent(first+' '+last)}`);
  } catch (e: any) {
    return c.redirect('/admin/users?msg=' + encodeURIComponent('Could not create user: ' + (e.message || e)));
  }
});

app.post('/users/:id/update', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const body = await c.req.parseBody({ all: true });
  const first = String(body.first_name || '').trim();
  const last = String(body.last_name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const role = String(body.role || '');
  const title = String(body.title || '').trim() || null;
  const phone = String(body.phone || '').trim() || null;
  const schoolIds = parseMultiIds(body.school_ids);
  const active = body.active ? 1 : 0;
  // June 3, 2026 — Fix 11 (completion): persist classroom-context fields.
  // Pre-launch verification report flagged these as missing from the edit form.
  // Empty string → NULL so admins can clear the value if a teacher changes assignment.
  const subjectArea    = String(body.subject_area || '').trim() || null;
  const classroomType  = String(body.classroom_type || '').trim() || null;
  const gradeBand      = String(body.grade_band || '').trim() || null;
  await c.env.DB.prepare(
    `UPDATE users SET first_name=?, last_name=?, email=?, role=?, title=?, phone=?, active=?, subject_area=?, classroom_type=?, grade_band=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(first, last, email, role, title, phone, active, subjectArea, classroomType, gradeBand, id).run();
  await setUserSchools(c.env.DB, id, schoolIds);
  await logActivity(c.env.DB, user.id, 'user', id, 'update_user', { schoolIds, subjectArea, classroomType, gradeBand });
  return c.redirect('/admin/users?msg=Updated');
});

// Small helper — accept a single value or a repeated-name form (FormData { all: true }).
function parseMultiIds(raw: any): number[] {
  if (raw === undefined || raw === null) return [];
  const arr = Array.isArray(raw) ? raw : [raw];
  const out: number[] = [];
  for (const v of arr) {
    const n = Number(String(v).trim());
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return Array.from(new Set(out));
}

// Dedicated standalone reset-password page (GET).
// Previously /admin/users/:id/reset-password was only a POST target used by
// an inline form. A direct browser navigation (e.g., from a bookmark) produced
// an Internal Server Error. This GET handler renders a proper page with a
// password field, visibility toggle, and match indicator.
app.get('/users/:id/reset-password', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id) || id <= 0) return c.redirect('/admin/users?msg=Unknown+user');
  const target = await c.env.DB.prepare(
    `SELECT id, email, first_name, last_name, role, active FROM users WHERE id = ?`
  ).bind(id).first<any>();
  if (!target) return c.redirect('/admin/users?msg=Unknown+user');
  const msg = c.req.query('msg');
  const err = c.req.query('err');
  return c.html(<ResetPasswordPage user={user} target={target} msg={msg} err={err} />);
});

app.post('/users/:id/reset-password', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const body = await c.req.parseBody();
  const rawPw = String(body.password || '').trim();
  // If no password is provided (blank), fall back to the district default so
  // staff can always get back in with Alexander2026!
  const pw = rawPw || 'Alexander2026!';
  const confirm = String(body.confirm_password || '').trim();
  // Only enforce match when a confirm field was submitted (standalone page).
  // The legacy inline form on /admin/users doesn't submit confirm — preserve
  // that behavior so we don't break existing UX.
  if (confirm !== '' && confirm !== rawPw) {
    return c.redirect(`/admin/users/${id}/reset-password?err=` + encodeURIComponent('Passwords do not match'));
  }
  if (rawPw && rawPw.length < 8) {
    return c.redirect(`/admin/users/${id}/reset-password?err=` + encodeURIComponent('Password must be at least 8 characters'));
  }
  const hash = await hashPassword(pw);
  // April 2026: do NOT force-change anymore. Admin-set password is usable
  // immediately; user can change it later from Profile whenever they want.
  await c.env.DB.prepare(
    `UPDATE users SET password_hash=?, must_change_password=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(hash, id).run();
  // kill active sessions so the reset password takes effect immediately
  await c.env.DB.prepare(`DELETE FROM sessions WHERE user_id=?`).bind(id).run();
  await logActivity(c.env.DB, user.id, 'user', id, 'reset_password');
  await notify(c.env.DB, {
    user_id: id, kind: 'password_reset',
    title: 'Your password was reset by an administrator',
    body: 'You can sign in with the new password. Change it any time from Profile.',
    url: '/profile', entity_type: 'user', entity_id: id, actor_user_id: user.id,
  }, c.env);
  // If the request came from the standalone reset page, go back there with a
  // success message; otherwise use the legacy users-list redirect.
  const referer = c.req.header('referer') || '';
  if (referer.includes(`/admin/users/${id}/reset-password`)) {
    return c.redirect(`/admin/users/${id}/reset-password?msg=` + encodeURIComponent(`Password reset to "${pw}"`));
  }
  return c.redirect('/admin/users?msg=Password+reset+to+' + encodeURIComponent(pw));
});

app.post('/users/:id/delete', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  if (id === user.id) return c.redirect('/admin/users?msg=Cannot+delete+yourself');
  // Soft delete
  await c.env.DB.prepare(`UPDATE users SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
  await c.env.DB.prepare(`DELETE FROM sessions WHERE user_id=?`).bind(id).run();
  await logActivity(c.env.DB, user.id, 'user', id, 'deactivate_user');
  return c.redirect('/admin/users?msg=User+deactivated');
});

// Aug 16, 2026 — Feature request from Dr. Gandhi.
// Admins previously could only deactivate accounts (soft delete). For staff who
// no longer work at the district (mid-year departures, wrong entries, ex-employees
// left over from a stale roster) we now support a true hard delete that removes
// the user row and every row that references it, so they no longer appear in
// user pickers, assignment dropdowns, or the users list at all.
//
// Guard rails:
//   • You can't hard-delete yourself.
//   • The last active super_admin cannot be hard-deleted (would lock the district out).
//   • Users with authored observations, feedback, or scored deliverables get a
//     soft-delete fallback: because their work is anchored to their id, wiping the
//     row would orphan real evaluation history the district may need for audit.
//     In those cases we set active=0 and tell the admin to keep the deactivated row.
app.post('/users/:id/hard-delete', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  if (!Number.isFinite(id) || id <= 0) return c.redirect('/admin/users?msg=Unknown+user');
  if (id === user.id) return c.redirect('/admin/users?msg=' + encodeURIComponent('You can\'t delete your own account.'));

  const target = await c.env.DB.prepare(
    `SELECT id, first_name, last_name, email, role FROM users WHERE id = ?`
  ).bind(id).first<any>();
  if (!target) return c.redirect('/admin/users?msg=Unknown+user');

  // Never delete the last active super admin.
  if (target.role === 'super_admin') {
    const cnt = await c.env.DB.prepare(
      `SELECT COUNT(*) AS n FROM users WHERE role='super_admin' AND active=1 AND id <> ?`
    ).bind(id).first<any>();
    if (!cnt || cnt.n === 0) {
      return c.redirect('/admin/users?msg=' + encodeURIComponent(
        'Cannot delete the last active Super Administrator. Promote another admin first.'));
    }
  }

  // Check for anchoring evaluation history. If any of these exist we deliberately
  // fall back to soft-delete so the audit trail stays intact — the row remains but
  // the user disappears from active pickers. Observations are the real anchor:
  // feedback, scores, and deliverables all chain off an observation or enrollment,
  // so if there's an observation on file (as teacher OR appraiser) we keep the row.
  const hasAnchor = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM observations WHERE teacher_id=? OR appraiser_id=?) AS obs,
       (SELECT COUNT(*) FROM external_pd_submissions WHERE teacher_id=? OR reviewed_by=?) AS ext_pd,
       (SELECT COUNT(*) FROM pd_deliverable_scores WHERE scored_by=?) AS scores`
  ).bind(id, id, id, id, id).first<any>();
  const totalAnchor = (hasAnchor?.obs || 0) + (hasAnchor?.ext_pd || 0) + (hasAnchor?.scores || 0);
  if (totalAnchor > 0) {
    await c.env.DB.prepare(`UPDATE users SET active=0, updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(id).run();
    await c.env.DB.prepare(`DELETE FROM sessions WHERE user_id=?`).bind(id).run();
    await logActivity(c.env.DB, user.id, 'user', id, 'hard_delete_blocked_soft_deleted',
      { email: target.email, obs: hasAnchor.obs, ext_pd: hasAnchor.ext_pd, scores: hasAnchor.scores });
    return c.redirect('/admin/users?msg=' + encodeURIComponent(
      `${target.first_name} ${target.last_name} had evaluation history on file (observations / PD credit), so their account was deactivated instead of deleted — this preserves the audit trail. They will no longer appear in active lists or pickers.`));
  }

  // No anchored history — safe to fully remove. Wipe every row that references this
  // user id so the delete doesn't hit a FK constraint or leak dangling references.
  // The parameter placeholders are counted from the SQL string, so we don't have to
  // maintain a parallel bind-count array by hand.
  const cleanup = [
    `DELETE FROM sessions WHERE user_id=?`,
    `DELETE FROM user_schools WHERE user_id=?`,
    `DELETE FROM user_settings WHERE user_id=?`,
    `DELETE FROM notifications WHERE user_id=? OR actor_user_id=?`,
    `DELETE FROM notification_preferences WHERE user_id=?`,
    `DELETE FROM push_subscriptions WHERE user_id=?`,
    `DELETE FROM assignments WHERE teacher_id=? OR staff_id=?`,
    `DELETE FROM teacher_goals WHERE teacher_id=?`,
    `DELETE FROM focus_areas WHERE teacher_id=?`,
    // deliverables/rubric scores chain through pd_enrollments so purge that chain first
    `DELETE FROM pd_deliverables WHERE enrollment_id IN (SELECT id FROM pd_enrollments WHERE teacher_id=?)`,
    `DELETE FROM pd_deliverable_scores WHERE enrollment_id IN (SELECT id FROM pd_enrollments WHERE teacher_id=?)`,
    `DELETE FROM pd_enrollments WHERE teacher_id=?`,
    `DELETE FROM pd_reflections WHERE teacher_id=?`,
    `DELETE FROM pd_plan_items WHERE plan_id IN (SELECT id FROM pd_plans WHERE teacher_id=?)`,
    `DELETE FROM pd_plans WHERE teacher_id=?`,
    `DELETE FROM external_pd_submissions WHERE teacher_id=? OR reviewed_by=?`,
    `DELETE FROM activity_log WHERE user_id=?`,
    `DELETE FROM admin_audit_log WHERE actor_user_id=?`,
  ];
  for (const sql of cleanup) {
    const paramCount = (sql.match(/\?/g) || []).length;
    const params: any[] = Array(paramCount).fill(id);
    try {
      await c.env.DB.prepare(sql).bind(...params).run();
    } catch (e: any) {
      // Best-effort cleanup — if a table doesn't exist in this DB revision, keep going.
      console.warn('hard-delete cleanup skipped:', sql, e?.message || e);
    }
  }

  // Finally drop the user row itself.
  await c.env.DB.prepare(`DELETE FROM users WHERE id=?`).bind(id).run();
  await logActivity(c.env.DB, user.id, 'user', id, 'hard_delete_user',
    { email: target.email, name: `${target.first_name} ${target.last_name}`, role: target.role });
  return c.redirect('/admin/users?msg=' + encodeURIComponent(
    `Permanently deleted ${target.first_name} ${target.last_name} (${target.email}).`));
});

// ---------- Assignments ----------
app.get('/assignments', async (c) => {
  const user = c.get('user')!;
  const msg = c.req.query('msg');
  const teachers = await c.env.DB.prepare(
    `SELECT u.*, s.name AS school_name FROM users u LEFT JOIN schools s ON s.id=u.school_id
     WHERE u.role='teacher' AND u.active=1 ORDER BY u.last_name, u.first_name`
  ).all();
  const appraisers = await c.env.DB.prepare(`SELECT * FROM users WHERE role IN ('appraiser','superintendent') AND active=1 ORDER BY last_name`).all();
  const coaches = await c.env.DB.prepare(`SELECT * FROM users WHERE role='coach' AND active=1 ORDER BY last_name`).all();
  const assignments = await c.env.DB.prepare(
    `SELECT a.*, t.first_name AS t_first, t.last_name AS t_last,
       st.first_name AS s_first, st.last_name AS s_last, st.role AS s_role
     FROM assignments a
     JOIN users t ON t.id = a.teacher_id
     JOIN users st ON st.id = a.staff_id
     WHERE a.active=1 ORDER BY t.last_name, t.first_name, a.relationship`
  ).all();
  return c.html(<AssignmentsPage user={user}
    teachers={teachers.results || []} appraisers={appraisers.results || []} coaches={coaches.results || []}
    assignments={assignments.results || []} msg={msg} />);
});

app.post('/assignments/create', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody({ all: true });
  const teacherIds = parseMultiIds(body.teacher_ids);
  const staffIds = parseMultiIds(body.staff_ids);
  const relationship = String(body.relationship);
  if (!teacherIds.length || !staffIds.length || !['appraiser','coach'].includes(relationship)) {
    return c.redirect('/admin/assignments?msg=' + encodeURIComponent('Pick at least one teacher and at least one staff member.'));
  }
  const sy = await c.env.DB.prepare(`SELECT id FROM school_years WHERE is_current=1`).first<any>();
  let created = 0, skipped = 0;
  for (const t of teacherIds) {
    for (const s of staffIds) {
      // Reactivate an existing row if present, otherwise insert a new one.
      const existing = await c.env.DB.prepare(
        `SELECT id, active FROM assignments WHERE teacher_id=? AND staff_id=? AND relationship=?`
      ).bind(t, s, relationship).first<any>();
      if (existing) {
        if (!existing.active) {
          await c.env.DB.prepare(`UPDATE assignments SET active=1 WHERE id=?`).bind(existing.id).run();
          created++;
        } else skipped++;
      } else {
        await c.env.DB.prepare(
          `INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active) VALUES (?,?,?,?,1)`
        ).bind(t, s, relationship, sy?.id || null).run();
        created++;
      }
    }
  }
  await logActivity(c.env.DB, user.id, 'assignment', null, 'create_assignments_bulk', { teacherIds, staffIds, relationship, created, skipped });
  return c.redirect('/admin/assignments?msg=' + encodeURIComponent(`${created} assignment(s) added${skipped ? `, ${skipped} already existed` : ''}.`));
});

app.post('/assignments/bulk-delete', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody({ all: true });
  const ids = parseMultiIds(body.ids);
  if (!ids.length) return c.redirect('/admin/assignments?msg=Nothing+selected');
  for (const id of ids) {
    await c.env.DB.prepare(`UPDATE assignments SET active=0 WHERE id=?`).bind(id).run();
  }
  await logActivity(c.env.DB, user.id, 'assignment', null, 'remove_assignments_bulk', { ids });
  return c.redirect('/admin/assignments?msg=' + encodeURIComponent(`Removed ${ids.length} assignment(s).`));
});

app.post('/assignments/:id/delete', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare(`UPDATE assignments SET active=0 WHERE id=?`).bind(id).run();
  await logActivity(c.env.DB, user.id, 'assignment', id, 'remove_assignment');
  return c.redirect('/admin/assignments?msg=Removed');
});

// ---------- Schools ----------
app.get('/schools', async (c) => {
  const user = c.get('user')!;
  const msg = c.req.query('msg');
  const schools = await c.env.DB.prepare(`SELECT * FROM schools WHERE district_id=1 ORDER BY name`).all();
  return c.html(<SchoolsPage user={user} schools={schools.results || []} msg={msg} />);
});

app.post('/schools/create', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const name = String(body.name || '').trim();
  const grade_span = String(body.grade_span || '').trim() || null;
  const address = String(body.address || '').trim() || null;
  const phone = String(body.phone || '').trim() || null;
  if (!name) return c.redirect('/admin/schools?msg=Name+required');
  await c.env.DB.prepare(`INSERT INTO schools (district_id, name, grade_span, address, phone) VALUES (1, ?, ?, ?, ?)`).bind(name, grade_span, address, phone).run();
  await logActivity(c.env.DB, user.id, 'school', null, 'create_school', { name });
  return c.redirect('/admin/schools?msg=Added');
});

app.post('/schools/:id/update', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const body = await c.req.parseBody();
  const name = String(body.name || '').trim();
  const grade_span = String(body.grade_span || '').trim() || null;
  const address = String(body.address || '').trim() || null;
  const phone = String(body.phone || '').trim() || null;
  await c.env.DB.prepare(`UPDATE schools SET name=?, grade_span=?, address=?, phone=? WHERE id=?`).bind(name, grade_span, address, phone, id).run();
  await logActivity(c.env.DB, user.id, 'school', id, 'update_school');
  return c.redirect('/admin/schools?msg=Updated');
});

// ---------- Pedagogy library ----------
app.get('/pedagogy', async (c) => {
  const user = c.get('user')!;
  const fw = await getActiveFramework(c.env.DB);
  const domains = await getDomainsWithIndicators(c.env.DB, (fw as any).id);
  const library = await c.env.DB.prepare(
    `SELECT * FROM pedagogy_library ORDER BY indicator_id, level DESC`
  ).all();
  const map = new Map<string, any>();
  for (const p of (library.results as any[])) map.set(`${p.indicator_id}:${p.level}`, p);
  return c.html(<PedagogyPage user={user} domains={domains} map={map} />);
});

app.get('/pedagogy/:indicatorId/:level', async (c) => {
  const user = c.get('user')!;
  const indicatorId = Number(c.req.param('indicatorId'));
  const level = Number(c.req.param('level'));
  const fw = await getActiveFramework(c.env.DB);
  const ind = await c.env.DB.prepare(
    `SELECT fi.*, fd.name AS domain_name, fd.code AS domain_code FROM framework_indicators fi
     JOIN framework_domains fd ON fd.id = fi.domain_id WHERE fi.id=?`
  ).bind(indicatorId).first<any>();
  if (!ind) return c.text('Not found', 404);
  const entry = await c.env.DB.prepare(
    `SELECT * FROM pedagogy_library WHERE indicator_id=? AND level=?`
  ).bind(indicatorId, level).first<any>();
  const msg = c.req.query('msg');
  return c.html(<PedagogyEdit user={user} ind={ind} level={level} entry={entry} msg={msg} />);
});

app.post('/pedagogy/:indicatorId/:level', async (c) => {
  const user = c.get('user')!;
  const indicatorId = Number(c.req.param('indicatorId'));
  const level = Number(c.req.param('level'));
  const body = await c.req.parseBody();
  const interpretation = String(body.interpretation || '');
  const feedback_starter = String(body.feedback_starter || '');
  const evidence = normalizeList(String(body.evidence_signals || ''));
  const moves = normalizeList(String(body.teacher_next_moves || ''));
  const coaching = normalizeList(String(body.coaching_considerations || ''));
  // Resources: two columns -> [{title, source}]
  const resTitles = String(body.resource_titles || '').split('\n').map(s => s.trim());
  const resSources = String(body.resource_sources || '').split('\n').map(s => s.trim());
  const resources: any[] = [];
  for (let i = 0; i < resTitles.length; i++) {
    if (resTitles[i]) resources.push({ title: resTitles[i], source: resSources[i] || '', type: 'resource' });
  }
  await c.env.DB.prepare(
    `INSERT INTO pedagogy_library (indicator_id, level, interpretation, evidence_signals, teacher_next_moves, coaching_considerations, resources, feedback_starter, updated_by, updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
     ON CONFLICT(indicator_id, level) DO UPDATE SET
       interpretation=excluded.interpretation,
       evidence_signals=excluded.evidence_signals,
       teacher_next_moves=excluded.teacher_next_moves,
       coaching_considerations=excluded.coaching_considerations,
       resources=excluded.resources,
       feedback_starter=excluded.feedback_starter,
       updated_by=excluded.updated_by,
       updated_at=CURRENT_TIMESTAMP`
  ).bind(
    indicatorId, level,
    interpretation,
    JSON.stringify(evidence),
    JSON.stringify(moves),
    JSON.stringify(coaching),
    JSON.stringify(resources),
    feedback_starter,
    user.id
  ).run();
  await logActivity(c.env.DB, user.id, 'pedagogy', indicatorId, 'edit_pedagogy', { level });
  return c.redirect(`/admin/pedagogy/${indicatorId}/${level}?msg=Saved`);
});

function normalizeList(raw: string): string[] {
  return raw.split('\n').map(l => l.replace(/^[•\-\*\s]+/, '').trim()).filter(Boolean);
}

// ---------- Framework viewer ----------
app.get('/framework', async (c) => {
  const user = c.get('user')!;
  const fw = await getActiveFramework(c.env.DB);
  const domains = await getDomainsWithIndicators(c.env.DB, (fw as any).id);
  return c.html(<FrameworkPage user={user} framework={fw} domains={domains} />);
});

// ---------- District ----------
app.get('/district', async (c) => {
  const user = c.get('user')!;
  const d = await c.env.DB.prepare('SELECT * FROM districts WHERE id=1').first<any>();
  const sy = await c.env.DB.prepare('SELECT * FROM school_years WHERE district_id=1 ORDER BY is_current DESC, label DESC').all();
  const msg = c.req.query('msg');
  return c.html(<DistrictPage user={user} d={d} years={sy.results || []} msg={msg} />);
});

app.post('/district/update', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  await c.env.DB.prepare(
    `UPDATE districts SET name=?, address=?, city=?, state=?, zip=?, phone=? WHERE id=1`
  ).bind(
    String(body.name || ''),
    String(body.address || '') || null,
    String(body.city || '') || null,
    String(body.state || '') || null,
    String(body.zip || '') || null,
    String(body.phone || '') || null,
  ).run();
  await logActivity(c.env.DB, user.id, 'district', 1, 'update_district');
  return c.redirect('/admin/district?msg=Saved');
});

// Manage school years manually. The auto-selector in lib/db.ts still picks the row
// whose date range covers today, so most years this page is informational only.
app.post('/district/school-years/create', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const label = String(body.label || '').trim();
  const start = String(body.start_date || '').trim();
  const end = String(body.end_date || '').trim();
  if (!label || !start || !end) return c.redirect('/admin/district?msg=Label%2C+start%2C+and+end+dates+required');
  await c.env.DB.prepare(
    `INSERT OR IGNORE INTO school_years (district_id, label, start_date, end_date, is_current) VALUES (1, ?, ?, ?, 0)`
  ).bind(label, start, end).run();
  await logActivity(c.env.DB, user.id, 'school_year', 0, 'create', { label, start, end });
  return c.redirect('/admin/district?msg=' + encodeURIComponent(`Added school year ${label}`));
});

app.post('/district/school-years/:id/update', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const body = await c.req.parseBody();
  const label = String(body.label || '').trim();
  const start = String(body.start_date || '').trim();
  const end = String(body.end_date || '').trim();
  await c.env.DB.prepare(
    `UPDATE school_years SET label=?, start_date=?, end_date=? WHERE id=?`
  ).bind(label, start, end, id).run();
  await logActivity(c.env.DB, user.id, 'school_year', id, 'update');
  return c.redirect('/admin/district?msg=' + encodeURIComponent('School year updated'));
});

app.post('/district/school-years/:id/set-current', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  await c.env.DB.prepare('UPDATE school_years SET is_current = CASE WHEN id = ? THEN 1 ELSE 0 END').bind(id).run();
  await logActivity(c.env.DB, user.id, 'school_year', id, 'set_current');
  return c.redirect('/admin/district?msg=' + encodeURIComponent('Set as current school year (manual override)'));
});

// ============================================================================
// BULK IMPORT — Users (teachers, principals, coaches, etc.)
// ============================================================================
const USER_CSV_HEADERS = [
  'first_name','last_name','email','role','title','phone','school_names','password','active'
];

const USER_CSV_TEMPLATE_ROWS: string[][] = [
  // Sample rows so the admin can see exactly the expected format.
  // school_names accepts ONE school OR a pipe-separated list of schools.
  // The FIRST school becomes the "primary".
  ['Jane','Doe','jane.doe@k12.nd.us','teacher','2nd Grade','701-828-3334','Alexander Elementary','Alexander2026!','yes'],
  ['John','Smith','john.smith@k12.nd.us','teacher','Physical Education','701-828-3334','Alexander Elementary | Alexander Junior/Senior High','Alexander2026!','yes'],
  ['Alex','Principal','alex.principal@k12.nd.us','appraiser','Principal (K-12)','701-828-3334','Alexander Elementary | Alexander Junior/Senior High','Alexander2026!','yes'],
  ['Casey','Coach','casey.coach@k12.nd.us','coach','Instructional Coach','701-828-3334','Alexander Elementary | Alexander Junior/Senior High','Alexander2026!','yes'],
];

app.get('/import/users/template', async (c) => {
  const csv = buildCsv(USER_CSV_HEADERS, USER_CSV_TEMPLATE_ROWS);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="users_import_template.csv"',
    },
  });
});

app.get('/import/users', async (c) => {
  const user = c.get('user')!;
  const msg = c.req.query('msg');
  const result = c.req.query('result'); // pass-through report
  const schools = await c.env.DB.prepare(`SELECT name FROM schools WHERE district_id=1 ORDER BY name`).all();
  return c.html(<ImportUsersPage user={user} msg={msg} result={result} schools={(schools.results as any[]) || []} />);
});

app.post('/import/users', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const file = body.csv as unknown as File | undefined;
  const dryRun = body.dry_run ? true : false;
  if (!file || typeof (file as any).text !== 'function') {
    return c.redirect('/admin/import/users?msg=' + encodeURIComponent('No file uploaded.'));
  }
  const text = await (file as any).text();
  const { headers, rows } = parseCsvAsObjects(text);
  // Validate headers — accept legacy 'school_name' in place of 'school_names' for backwards compatibility.
  const required = USER_CSV_HEADERS.map(h => h === 'school_names' && headers.includes('school_name') ? 'school_name' : h);
  const missing = required.filter(h => !headers.includes(h));
  if (missing.length) {
    return c.redirect('/admin/import/users?msg=' + encodeURIComponent(
      'Missing required columns: ' + missing.join(', ') + '. Download the template and use its header row.'));
  }

  // Pre-load schools + existing emails for lookup
  const schoolRows = await c.env.DB.prepare(`SELECT id, name FROM schools WHERE district_id=1`).all();
  const schoolMap = new Map<string, number>();
  for (const s of (schoolRows.results as any[])) schoolMap.set(String(s.name).trim().toLowerCase(), s.id);

  const existingRows = await c.env.DB.prepare(`SELECT id, email FROM users`).all();
  const existingMap = new Map<string, number>();
  for (const u of (existingRows.results as any[])) existingMap.set(String(u.email).toLowerCase(), u.id);

  const validRoles = ['teacher','appraiser','coach','superintendent','super_admin'];
  const report = {
    total: rows.length, created: 0, updated: 0, skipped: 0,
    errors: [] as string[], warnings: [] as string[],
  };

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const line = i + 2; // header is line 1
    const first = (r.first_name || '').trim();
    const last = (r.last_name || '').trim();
    const email = (r.email || '').trim().toLowerCase();
    const role = (r.role || '').trim().toLowerCase();
    const title = (r.title || '').trim() || null;
    const phone = (r.phone || '').trim() || null;
    // Accept either singular (school_name) or plural (school_names) header, pipe-separated for multi.
    const schoolRaw = (r.school_names || r.school_name || '').trim();
    const schoolNames = schoolRaw.split('|').map((s: string) => s.trim()).filter(Boolean);
    const password = (r.password || '').trim() || 'Alexander2026!';
    const activeRaw = (r.active || 'yes').trim().toLowerCase();
    const active = ['yes','y','true','1','active'].includes(activeRaw) ? 1 : 0;

    if (!first || !last || !email || !role) {
      report.errors.push(`Line ${line}: missing required field (first_name/last_name/email/role).`);
      report.skipped++; continue;
    }
    if (!validRoles.includes(role)) {
      report.errors.push(`Line ${line}: invalid role "${role}". Use one of ${validRoles.join(', ')}.`);
      report.skipped++; continue;
    }
    // Resolve every school name to an id; warn for any that don't match.
    const resolvedSchoolIds: number[] = [];
    for (const nm of schoolNames) {
      const hit = schoolMap.get(nm.toLowerCase());
      if (!hit) {
        report.warnings.push(`Line ${line}: school "${nm}" not found — that link will be skipped.`);
      } else resolvedSchoolIds.push(hit);
    }
    const primarySchoolId: number | null = resolvedSchoolIds[0] || null;

    if (dryRun) {
      if (existingMap.has(email)) report.updated++; else report.created++;
      continue;
    }

    try {
      const existingId = existingMap.get(email);
      if (existingId) {
        await c.env.DB.prepare(
          `UPDATE users SET first_name=?, last_name=?, role=?, title=?, phone=?, school_id=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
        ).bind(first, last, role, title, phone, primarySchoolId, active, existingId).run();
        if (resolvedSchoolIds.length) await setUserSchools(c.env.DB, existingId, resolvedSchoolIds);
        report.updated++;
      } else {
        const hash = await hashPassword(password);
        const res = await c.env.DB.prepare(
          `INSERT INTO users (district_id, school_id, email, password_hash, first_name, last_name, role, title, phone, active, must_change_password)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
        ).bind(primarySchoolId, email, hash, first, last, role, title, phone, active).run();
        const newId = Number((res.meta as any)?.last_row_id);
        existingMap.set(email, newId);
        if (resolvedSchoolIds.length) await setUserSchools(c.env.DB, newId, resolvedSchoolIds);
        report.created++;
      }
    } catch (e: any) {
      report.errors.push(`Line ${line}: ${e.message || e}`);
      report.skipped++;
    }
  }
  await logActivity(c.env.DB, user.id, 'import', null, dryRun ? 'users_import_dryrun' : 'users_import', report);
  const summary = `${dryRun ? 'Dry run · ' : ''}created=${report.created} updated=${report.updated} skipped=${report.skipped} errors=${report.errors.length}` +
    (report.errors.length ? '\nErrors:\n' + report.errors.slice(0, 20).join('\n') : '') +
    (report.warnings.length ? '\nWarnings:\n' + report.warnings.slice(0, 20).join('\n') : '');
  return c.redirect('/admin/import/users?result=' + encodeURIComponent(summary));
});

// ============================================================================
// BULK IMPORT — Rubric / Framework (domains + indicators + descriptors + pedagogy)
// ============================================================================
// Flat CSV template. One row per (domain, indicator, level).
// If you only want to replace descriptors, fill out levels 1-4 for each
// indicator. If you also want to seed pedagogy-library content, the optional
// pedagogy columns populate the teacher_next_moves / feedback_starter cells.
const RUBRIC_CSV_HEADERS = [
  'domain_code','domain_name','domain_description','domain_sort_order',
  'indicator_code','indicator_name','indicator_prompt','indicator_sort_order',
  'level','level_label','descriptor',
  'interpretation','evidence_signals','teacher_next_moves','coaching_considerations','resources','feedback_starter',
];

const RUBRIC_CSV_TEMPLATE_ROWS: string[][] = [
  [
    'A','Planning and Preparation for Learning','How the teacher plans and prepares for student learning','1',
    'a','Knowledge','The teacher:','1',
    '4','Highly Effective','Is expert in the subject and passionate about teaching it.',
    'Deep, current expertise in content',
    'Teacher explains why content matters | Makes cross-disciplinary connections | Answers advanced questions accurately',
    'Maintain monthly content-PD reading | Present at department meeting | Build a content FAQ',
    'Ask: "What recent research has reshaped how you teach this?" | Look for student-initiated advanced questions',
    'Wiggins & McTighe — Understanding by Design | Marzano — The Art and Science of Teaching',
    'You demonstrated expert knowledge of the subject today — particularly when…'
  ],
  [
    'A','Planning and Preparation for Learning','How the teacher plans and prepares for student learning','1',
    'a','Knowledge','The teacher:','1',
    '3','Effective','Knows the subject well and shows genuine interest in it.','','','','','','',''
  ],
  [
    'A','Planning and Preparation for Learning','How the teacher plans and prepares for student learning','1',
    'a','Knowledge','The teacher:','1',
    '2','Improvement Necessary','Has gaps in subject knowledge and/or shows limited interest in it.','','','','','','',''
  ],
  [
    'A','Planning and Preparation for Learning','How the teacher plans and prepares for student learning','1',
    'a','Knowledge','The teacher:','1',
    '1','Does Not Meet Standards','Has little content knowledge and/or disinterest in the subject.','','','','','','',''
  ],
];

app.get('/import/rubric/template', async (c) => {
  const csv = buildCsv(RUBRIC_CSV_HEADERS, RUBRIC_CSV_TEMPLATE_ROWS);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="rubric_import_template.csv"',
    },
  });
});

// Export the CURRENT rubric back out as CSV — handy for editing in Excel.
app.get('/import/rubric/export', async (c) => {
  const fw = await getActiveFramework(c.env.DB);
  if (!fw) return c.text('No active framework', 404);
  const rows = await c.env.DB.prepare(
    `SELECT d.code AS domain_code, d.name AS domain_name, d.description AS domain_description, d.sort_order AS domain_sort_order,
            i.code AS indicator_code, i.name AS indicator_name, i.prompt AS indicator_prompt, i.sort_order AS indicator_sort_order,
            fd.level, fd.level_label, fd.descriptor,
            pl.interpretation, pl.evidence_signals, pl.teacher_next_moves, pl.coaching_considerations, pl.resources, pl.feedback_starter
       FROM framework_domains d
       JOIN framework_indicators i ON i.domain_id = d.id
       LEFT JOIN framework_descriptors fd ON fd.indicator_id = i.id
       LEFT JOIN pedagogy_library pl ON pl.indicator_id = i.id AND pl.level = fd.level
      WHERE d.framework_id = ?
      ORDER BY d.sort_order, i.sort_order, fd.level DESC`
  ).bind((fw as any).id).all();
  const toList = (s: any) => {
    if (!s) return '';
    try { const arr = typeof s === 'string' ? JSON.parse(s) : s; if (Array.isArray(arr)) return arr.join(' | '); return String(s); }
    catch { return String(s); }
  };
  const toResources = (s: any) => {
    if (!s) return '';
    try {
      const arr = typeof s === 'string' ? JSON.parse(s) : s;
      if (Array.isArray(arr)) return arr.map((r: any) => [r.title, r.source].filter(Boolean).join(' — ')).join(' | ');
      return String(s);
    } catch { return String(s); }
  };
  const data = (rows.results as any[]).map(r => [
    r.domain_code, r.domain_name, r.domain_description || '', r.domain_sort_order || '',
    r.indicator_code, r.indicator_name, r.indicator_prompt || '', r.indicator_sort_order || '',
    r.level, r.level_label, r.descriptor,
    r.interpretation || '', toList(r.evidence_signals), toList(r.teacher_next_moves),
    toList(r.coaching_considerations), toResources(r.resources), r.feedback_starter || '',
  ]);
  const csv = buildCsv(RUBRIC_CSV_HEADERS, data);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="rubric_current_${(fw as any).version || 'active'}.csv"`,
    },
  });
});

app.get('/import/rubric', async (c) => {
  const user = c.get('user')!;
  const msg = c.req.query('msg');
  const result = c.req.query('result');
  const fw = await getActiveFramework(c.env.DB);
  return c.html(<ImportRubricPage user={user} msg={msg} result={result} framework={fw} />);
});

app.post('/import/rubric', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const file = body.csv as unknown as File | undefined;
  const dryRun = body.dry_run ? true : false;
  const frameworkName = String(body.framework_name || '').trim();
  const frameworkVersion = String(body.framework_version || '').trim() || null;
  const replaceExisting = body.replace_existing ? true : false;

  if (!file || typeof (file as any).text !== 'function') {
    return c.redirect('/admin/import/rubric?msg=' + encodeURIComponent('No file uploaded.'));
  }
  const text = await (file as any).text();
  const { headers, rows } = parseCsvAsObjects(text);
  const missing = RUBRIC_CSV_HEADERS.filter(h => !headers.includes(h));
  if (missing.length) {
    return c.redirect('/admin/import/rubric?msg=' + encodeURIComponent(
      'Missing required columns: ' + missing.join(', ') + '. Download the template and use its header row.'));
  }

  // Determine target framework
  let framework = await getActiveFramework(c.env.DB) as any;
  const report = {
    total: rows.length, domains: 0, indicators: 0, descriptors: 0, pedagogy: 0,
    errors: [] as string[], mode: 'update' as 'update' | 'new',
  };

  if (!framework || replaceExisting) {
    if (!dryRun) {
      // Create brand-new framework and mark it active. Keep old framework rows
      // intact so historical observations still have their framework reference.
      const name = frameworkName || 'Imported Framework';
      const version = frameworkVersion || new Date().toISOString().slice(0, 10);
      const ins = await c.env.DB.prepare(
        `INSERT INTO frameworks (district_id, name, version, description, scale_levels, is_active)
         VALUES (1, ?, ?, 'Imported via CSV', 4, 1)`
      ).bind(name, version).run();
      const newId = Number((ins.meta as any)?.last_row_id);
      await c.env.DB.prepare(`UPDATE frameworks SET is_active=0 WHERE id <> ?`).bind(newId).run();
      await c.env.DB.prepare(`UPDATE districts SET active_framework_id=? WHERE id=1`).bind(newId).run();
      framework = { id: newId, name, version };
    }
    report.mode = 'new';
  }

  // Build maps of existing domain/indicator rows so we can upsert.
  const domainRowsDb = framework
    ? await c.env.DB.prepare(`SELECT id, code FROM framework_domains WHERE framework_id=?`).bind((framework as any).id).all()
    : { results: [] } as any;
  const domainMap = new Map<string, number>();
  for (const d of (domainRowsDb.results as any[])) domainMap.set(String(d.code).toUpperCase(), d.id);

  const indicatorRowsDb = framework
    ? await c.env.DB.prepare(
        `SELECT i.id, i.code, i.domain_id FROM framework_indicators i
         JOIN framework_domains d ON d.id = i.domain_id
         WHERE d.framework_id = ?`
      ).bind((framework as any).id).all()
    : { results: [] } as any;
  const indicatorMap = new Map<string, number>(); // key `${domainId}:${indicatorCode}`
  for (const i of (indicatorRowsDb.results as any[])) indicatorMap.set(`${i.domain_id}:${String(i.code).toLowerCase()}`, i.id);

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const line = r + 2;
    const domainCode = (row.domain_code || '').trim().toUpperCase();
    const indicatorCode = (row.indicator_code || '').trim().toLowerCase();
    const level = Number(row.level);
    if (!domainCode || !indicatorCode || !level) {
      report.errors.push(`Line ${line}: domain_code, indicator_code, and level are required.`);
      continue;
    }
    if (![1,2,3,4].includes(level)) {
      report.errors.push(`Line ${line}: level must be 1-4.`);
      continue;
    }

    if (dryRun) {
      if (!domainMap.has(domainCode)) { report.domains++; domainMap.set(domainCode, -1); }
      const ikey = `${domainMap.get(domainCode) || 0}:${indicatorCode}`;
      if (!indicatorMap.has(ikey)) { report.indicators++; indicatorMap.set(ikey, -1); }
      report.descriptors++;
      if (row.interpretation || row.teacher_next_moves || row.feedback_starter) report.pedagogy++;
      continue;
    }

    // Upsert domain
    let domainId = domainMap.get(domainCode);
    if (!domainId) {
      const res = await c.env.DB.prepare(
        `INSERT INTO framework_domains (framework_id, code, name, description, sort_order) VALUES (?,?,?,?,?)`
      ).bind(
        (framework as any).id, domainCode, row.domain_name || domainCode,
        row.domain_description || null, Number(row.domain_sort_order) || 0,
      ).run();
      domainId = Number((res.meta as any)?.last_row_id);
      domainMap.set(domainCode, domainId);
      report.domains++;
    } else if (row.domain_name || row.domain_description || row.domain_sort_order) {
      await c.env.DB.prepare(
        `UPDATE framework_domains SET name=COALESCE(NULLIF(?, ''), name),
                                       description=COALESCE(NULLIF(?, ''), description),
                                       sort_order=COALESCE(NULLIF(?, 0), sort_order) WHERE id=?`
      ).bind(row.domain_name || '', row.domain_description || '', Number(row.domain_sort_order) || 0, domainId).run();
    }

    // Upsert indicator
    const ikey = `${domainId}:${indicatorCode}`;
    let indicatorId = indicatorMap.get(ikey);
    if (!indicatorId) {
      const res = await c.env.DB.prepare(
        `INSERT INTO framework_indicators (domain_id, code, name, sort_order, prompt) VALUES (?,?,?,?,?)`
      ).bind(
        domainId, indicatorCode, row.indicator_name || indicatorCode,
        Number(row.indicator_sort_order) || 0, row.indicator_prompt || null,
      ).run();
      indicatorId = Number((res.meta as any)?.last_row_id);
      indicatorMap.set(ikey, indicatorId);
      report.indicators++;
    } else if (row.indicator_name || row.indicator_prompt || row.indicator_sort_order) {
      await c.env.DB.prepare(
        `UPDATE framework_indicators SET name=COALESCE(NULLIF(?, ''), name),
                                          prompt=COALESCE(NULLIF(?, ''), prompt),
                                          sort_order=COALESCE(NULLIF(?, 0), sort_order) WHERE id=?`
      ).bind(row.indicator_name || '', row.indicator_prompt || '', Number(row.indicator_sort_order) || 0, indicatorId).run();
    }

    // Upsert descriptor for this level
    const descriptor = row.descriptor || '';
    const levelLabel = row.level_label || (level === 4 ? 'Highly Effective' : level === 3 ? 'Effective' : level === 2 ? 'Improvement Necessary' : 'Does Not Meet Standards');
    if (descriptor.trim()) {
      const existing = await c.env.DB.prepare(
        `SELECT id FROM framework_descriptors WHERE indicator_id=? AND level=?`
      ).bind(indicatorId, level).first<any>();
      if (existing) {
        await c.env.DB.prepare(
          `UPDATE framework_descriptors SET level_label=?, descriptor=? WHERE id=?`
        ).bind(levelLabel, descriptor, existing.id).run();
      } else {
        await c.env.DB.prepare(
          `INSERT INTO framework_descriptors (indicator_id, level, level_label, descriptor) VALUES (?,?,?,?)`
        ).bind(indicatorId, level, levelLabel, descriptor).run();
      }
      report.descriptors++;
    }

    // Optional pedagogy-library cell for this (indicator, level)
    const evidence = splitPipe(row.evidence_signals);
    const moves = splitPipe(row.teacher_next_moves);
    const coaching = splitPipe(row.coaching_considerations);
    const resources = splitPipe(row.resources).map(r => {
      const [title, source] = r.split(' — ').map(s => s.trim());
      return { title: title || r, source: source || '', type: 'resource' };
    });
    if ((row.interpretation && row.interpretation.trim()) || evidence.length || moves.length || coaching.length || resources.length || (row.feedback_starter && row.feedback_starter.trim())) {
      await c.env.DB.prepare(
        `INSERT INTO pedagogy_library (indicator_id, level, interpretation, evidence_signals, teacher_next_moves, coaching_considerations, resources, feedback_starter, updated_by, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
         ON CONFLICT(indicator_id, level) DO UPDATE SET
           interpretation=excluded.interpretation,
           evidence_signals=excluded.evidence_signals,
           teacher_next_moves=excluded.teacher_next_moves,
           coaching_considerations=excluded.coaching_considerations,
           resources=excluded.resources,
           feedback_starter=excluded.feedback_starter,
           updated_by=excluded.updated_by,
           updated_at=CURRENT_TIMESTAMP`
      ).bind(
        indicatorId, level, row.interpretation || '',
        JSON.stringify(evidence), JSON.stringify(moves),
        JSON.stringify(coaching), JSON.stringify(resources),
        row.feedback_starter || '', user.id
      ).run();
      report.pedagogy++;
    }
  }

  await logActivity(c.env.DB, user.id, 'import', (framework as any)?.id || null, dryRun ? 'rubric_import_dryrun' : 'rubric_import', report);
  const summary = `${dryRun ? 'Dry run · ' : ''}mode=${report.mode} domains=${report.domains} indicators=${report.indicators} descriptors=${report.descriptors} pedagogy=${report.pedagogy} errors=${report.errors.length}` +
    (report.errors.length ? '\nErrors:\n' + report.errors.slice(0, 20).join('\n') : '');
  return c.redirect('/admin/import/rubric?result=' + encodeURIComponent(summary));
});

function splitPipe(s: string | undefined): string[] {
  if (!s) return [];
  return String(s).split('|').map(x => x.trim()).filter(Boolean);
}

// ============================================================================
// Fix 5 — External PD audit (admin view).
// Read-only district-wide list of every external_pd_submissions row. Useful
// for compliance: super-admins can see who submitted what, what each
// appraiser approved/declined, and which submissions are still waiting.
// ============================================================================

app.get('/external-pd', async (c) => {
  const user = c.get('user')!;
  const status = c.req.query('status') || undefined;
  // Admin sees everything (no appraiserId filter).
  const rows = await listExternalPdQueue(c.env.DB, { status });
  return c.html(<AdminExternalPdAudit user={user} rows={rows} filterStatus={status} />);
});

// ============================================================================
// Fix 6 — Admin-editable PD-hours-per-year target (system_settings).
// The default seed is 22.5h (per Title II district policy). Admin can change
// it; the new value flows into every heat-map render through getNumericSetting.
// ============================================================================

app.get('/settings/pd-hours', async (c) => {
  const user = c.get('user')!;
  const current = await getNumericSetting(c.env.DB, 'pd_hours_target_annual', 22.5);
  const msg = c.req.query('msg');
  return c.html(<PdHoursSettingsPage user={user} target={current} msg={msg} />);
});

app.post('/settings/pd-hours', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const raw = String(body.target ?? '').trim();
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0 || parsed > 1000) {
    return c.redirect('/admin/settings/pd-hours?msg=' + encodeURIComponent('Enter a positive number between 0 and 1000.'));
  }
  const rounded = Math.round(parsed * 4) / 4;  // 0.25h granularity
  await setSetting(c.env.DB, 'pd_hours_target_annual', rounded, user.id, 'number');
  await logAdminAudit(c.env.DB, user.id, 'update_setting', {
    entityType: 'system_settings',
    detail: `pd_hours_target_annual = ${rounded.toFixed(2)}h`,
    filters: { key: 'pd_hours_target_annual', value: rounded },
  });
  return c.redirect('/admin/settings/pd-hours?msg=' + encodeURIComponent(`Annual PD-hours target updated to ${rounded.toFixed(2)}h.`));
});

// ============================================================================
// DATA MANAGEMENT
// ----------------------------------------------------------------------------
// Super-admin tools to wipe demo data before handing the platform to the client,
// and to edit/delete any individual observation regardless of status. These
// routes are guarded by a "CONFIRM" phrase typed in the UI and by the existing
// requireRole('super_admin') middleware at the top of this file.
// ============================================================================

// Fix 8 — Honor the brief URL. The June 2 brief calls this surface
// "/admin/data-management". Existing nav + bookmarks still point at /admin/data,
// so we redirect new URL → existing route to avoid breaking links.
app.get('/data-management', (c) => c.redirect('/admin/data'));

// Helper — read soft-delete preference (defaults to ON: prefer soft-delete).
async function readSoftDeletePref(db: D1Database): Promise<boolean> {
  const v = await getNumericSetting(db, 'soft_delete_enabled', 1);
  return v >= 1;
}

app.get('/data', async (c) => {
  const user = c.get('user')!;
  const msg = c.req.query('msg');
  // Counts now include both active and soft-deleted rows so the admin can see what's hidden.
  const counts = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM observations)                                AS observations,
       (SELECT COUNT(*) FROM observations WHERE deleted_at IS NOT NULL)   AS observations_soft_deleted,
       (SELECT COUNT(*) FROM observation_scores)                          AS scores,
       (SELECT COUNT(*) FROM feedback_items)                              AS feedback_items,
       (SELECT COUNT(*) FROM focus_areas)                                 AS focus_areas,
       (SELECT COUNT(*) FROM activity_log)                                AS activity_log,
       (SELECT COUNT(*) FROM pd_enrollments)                              AS pd_enrollments,
       (SELECT COUNT(*) FROM pd_enrollments WHERE deleted_at IS NOT NULL) AS pd_enrollments_soft_deleted,
       (SELECT COUNT(*) FROM external_pd_submissions)                     AS external_pd,
       (SELECT COUNT(*) FROM external_pd_submissions WHERE deleted_at IS NOT NULL) AS external_pd_soft_deleted,
       (SELECT COUNT(*) FROM admin_audit_log)                             AS admin_audit_log`
  ).first<any>();

  // Recent observations table — show both live + soft-deleted so admin can restore visibility.
  // NOTE: `observations` has NO school_id column. School affiliation comes from the
  // teacher's primary school (users.school_id). Previously this query joined on
  // `o.school_id` which crashed the entire page with D1_ERROR: no such column.
  // Reported by the June 3, 2026 pre-launch verification report. Fix: join through
  // the teacher (users t) to schools.
  const recentObs = await c.env.DB.prepare(
    `SELECT o.id, o.observation_type, o.observed_at, o.status, o.deleted_at,
            t.school_id AS school_id,
            t.first_name AS t_first, t.last_name AS t_last,
            a.first_name AS a_first, a.last_name AS a_last, a.role AS a_role,
            s.name AS school_name
     FROM observations o
     JOIN users t ON t.id = o.teacher_id
     JOIN users a ON a.id = o.appraiser_id
     LEFT JOIN schools s ON s.id = t.school_id
     ORDER BY o.observed_at DESC
     LIMIT 200`
  ).all();

  // Schools for filtered-delete dropdown.
  const schools = await c.env.DB.prepare(`SELECT id, name FROM schools WHERE district_id=1 ORDER BY name`).all();

  // Most-recent 25 admin-audit rows on the main page (full viewer at /audit-log).
  const audit = await recentAdminAudit(c.env.DB, 25);

  // Current soft-delete pref.
  const softDelete = await readSoftDeletePref(c.env.DB);

  return c.html(
    <DataManagementPage
      user={user}
      counts={counts || {}}
      rows={(recentObs.results as any[]) || []}
      schools={(schools.results as any[]) || []}
      audit={audit}
      softDelete={softDelete}
      msg={msg}
    />
  );
});

// ----------------------------------------------------------------------------
// Fix 8 — Toggle global soft-delete preference. When ON, single-observation
// deletes write deleted_at instead of cascading DELETE; mass deletes do same.
// ----------------------------------------------------------------------------
app.post('/data/soft-delete-toggle', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const next = String(body.enabled || '').trim() === '1' ? 1 : 0;
  await setSetting(c.env.DB, 'soft_delete_enabled', next, user.id, 'number');
  await logAdminAudit(c.env.DB, user.id, 'toggle_soft_delete', {
    entityType: 'system_settings',
    detail: next === 1 ? 'Soft-delete ENABLED (writes deleted_at)' : 'Soft-delete DISABLED (hard DELETE)',
    filters: { enabled: next },
  });
  return c.redirect('/admin/data?msg=' + encodeURIComponent(`Soft-delete is now ${next === 1 ? 'ENABLED' : 'DISABLED'}.`));
});

// Delete a single observation (any status) including scores & feedback & derived focus areas.
// Honors the global soft-delete preference: when ON, writes deleted_at instead of removing rows.
app.post('/data/observations/:id/delete', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  if (!id) return c.redirect('/admin/data?msg=Invalid+id');
  const soft = await readSoftDeletePref(c.env.DB);
  if (soft) {
    await c.env.DB.prepare(`UPDATE observations SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL`).bind(id).run();
    await logActivity(c.env.DB, user.id, 'observation', id, 'admin_soft_delete');
    await logAdminAudit(c.env.DB, user.id, 'soft_delete_observation', {
      entityType: 'observation', entityIds: [id], rowCount: 1,
      detail: `Soft-deleted observation #${id}`,
    });
    return c.redirect('/admin/data?msg=' + encodeURIComponent(`Soft-deleted observation #${id} (visible only in this admin view).`));
  }
  await c.env.DB.prepare(`DELETE FROM observation_scores WHERE observation_id = ?`).bind(id).run();
  await c.env.DB.prepare(`DELETE FROM feedback_items WHERE observation_id = ?`).bind(id).run();
  await c.env.DB.prepare(`UPDATE focus_areas SET opened_observation_id = NULL WHERE opened_observation_id = ?`).bind(id).run();
  await c.env.DB.prepare(`DELETE FROM observations WHERE id = ?`).bind(id).run();
  await logActivity(c.env.DB, user.id, 'observation', id, 'admin_delete');
  await logAdminAudit(c.env.DB, user.id, 'hard_delete_observation', {
    entityType: 'observation', entityIds: [id], rowCount: 1,
    detail: `Hard-deleted observation #${id} (cascade: scores, feedback, focus_areas)`,
  });
  return c.redirect('/admin/data?msg=' + encodeURIComponent(`Deleted observation #${id}`));
});

// Restore a soft-deleted observation.
app.post('/data/observations/:id/restore', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  if (!id) return c.redirect('/admin/data?msg=Invalid+id');
  await c.env.DB.prepare(`UPDATE observations SET deleted_at = NULL WHERE id = ?`).bind(id).run();
  await logAdminAudit(c.env.DB, user.id, 'restore_observation', {
    entityType: 'observation', entityIds: [id], rowCount: 1,
    detail: `Restored soft-deleted observation #${id}`,
  });
  return c.redirect('/admin/data?msg=' + encodeURIComponent(`Restored observation #${id}.`));
});

// ----------------------------------------------------------------------------
// Fix 8 — Filtered delete: school / date range / observer role. Always honors
// the soft-delete preference and logs filters + row_count to admin_audit_log.
// ----------------------------------------------------------------------------
app.post('/data/filtered-delete', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const confirm = String(body.confirm || '').trim().toUpperCase();
  const schoolId = body.school_id ? Number(body.school_id) : null;
  const dateFrom = String(body.date_from || '').trim();
  const dateTo   = String(body.date_to   || '').trim();
  const obsRole  = String(body.observer_role || '').trim();

  if (confirm !== 'DELETE FILTERED') {
    return c.redirect('/admin/data?msg=' + encodeURIComponent('You must type "DELETE FILTERED" exactly to confirm.'));
  }
  if (!schoolId && !dateFrom && !dateTo && !obsRole) {
    return c.redirect('/admin/data?msg=' + encodeURIComponent('Specify at least one filter (school, date range, or observer role).'));
  }

  // Build WHERE clause.
  // School filter: observations have no school_id column — affiliation comes
  // from the teacher's users.school_id. We always JOIN users t so the same
  // alias is available whether or not the school filter is in play.
  const conds: string[] = ['o.deleted_at IS NULL'];
  const binds: any[] = [];
  if (schoolId) { conds.push('t.school_id = ?'); binds.push(schoolId); }
  if (dateFrom) { conds.push('date(o.observed_at) >= date(?)'); binds.push(dateFrom); }
  if (dateTo)   { conds.push('date(o.observed_at) <= date(?)'); binds.push(dateTo); }
  if (obsRole && (obsRole === 'appraiser' || obsRole === 'coach' || obsRole === 'superintendent')) {
    conds.push('a.role = ?'); binds.push(obsRole);
  }
  const whereSql = conds.join(' AND ');

  // Preview matching ids first (for audit trail + row count cap).
  const matchedRes = await c.env.DB.prepare(
    `SELECT o.id
       FROM observations o
       JOIN users a ON a.id = o.appraiser_id
       JOIN users t ON t.id = o.teacher_id
      WHERE ${whereSql} LIMIT 5000`
  ).bind(...binds).all();
  const matched = ((matchedRes.results as any[]) || []).map(r => Number(r.id));
  if (matched.length === 0) {
    return c.redirect('/admin/data?msg=' + encodeURIComponent('No observations matched those filters. Nothing to delete.'));
  }

  const soft = await readSoftDeletePref(c.env.DB);
  const filters = { school_id: schoolId, date_from: dateFrom || null, date_to: dateTo || null, observer_role: obsRole || null };

  // Chunk by 100 ids per UPDATE/DELETE (D1 SQLite IN-list limit safety).
  let touched = 0;
  for (let i = 0; i < matched.length; i += 100) {
    const chunk = matched.slice(i, i + 100);
    const placeholders = chunk.map(() => '?').join(',');
    if (soft) {
      const r = await c.env.DB.prepare(`UPDATE observations SET deleted_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`).bind(...chunk).run();
      touched += (r.meta as any)?.changes || chunk.length;
    } else {
      await c.env.DB.prepare(`DELETE FROM observation_scores WHERE observation_id IN (${placeholders})`).bind(...chunk).run();
      await c.env.DB.prepare(`DELETE FROM feedback_items     WHERE observation_id IN (${placeholders})`).bind(...chunk).run();
      await c.env.DB.prepare(`UPDATE focus_areas SET opened_observation_id = NULL WHERE opened_observation_id IN (${placeholders})`).bind(...chunk).run();
      const r = await c.env.DB.prepare(`DELETE FROM observations WHERE id IN (${placeholders})`).bind(...chunk).run();
      touched += (r.meta as any)?.changes || chunk.length;
    }
  }

  await logAdminAudit(c.env.DB, user.id, soft ? 'soft_delete_observations_bulk' : 'hard_delete_observations_bulk', {
    entityType: 'observation',
    entityIds: matched.slice(0, 100), // cap audit payload size; full count in row_count
    rowCount: touched,
    filters,
    detail: `Filtered ${soft ? 'soft-delete' : 'hard-delete'} of ${touched} observation(s).`,
  });

  return c.redirect('/admin/data?msg=' + encodeURIComponent(`${soft ? 'Soft-deleted' : 'Deleted'} ${touched} observation(s) matching your filters.`));
});

// Clear ALL observations + scores + feedback + focus areas. Pedagogy library,
// users, schools, rubric, and district settings are preserved.
app.post('/data/clear-observations', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const confirm = String(body.confirm || '').trim().toUpperCase();
  if (confirm !== 'CLEAR OBSERVATIONS') {
    return c.redirect('/admin/data?msg=' + encodeURIComponent('You must type "CLEAR OBSERVATIONS" exactly to confirm.'));
  }
  const soft = await readSoftDeletePref(c.env.DB);
  let rowCount = 0;
  if (soft) {
    const r = await c.env.DB.prepare(`UPDATE observations SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL`).run();
    rowCount = (r.meta as any)?.changes || 0;
  } else {
    await c.env.DB.prepare('DELETE FROM observation_scores').run();
    await c.env.DB.prepare('DELETE FROM feedback_items').run();
    await c.env.DB.prepare('DELETE FROM focus_areas').run();
    const r = await c.env.DB.prepare('DELETE FROM observations').run();
    rowCount = (r.meta as any)?.changes || 0;
  }
  await logActivity(c.env.DB, user.id, 'system', 0, soft ? 'soft_clear_observations' : 'clear_observations');
  await logAdminAudit(c.env.DB, user.id, soft ? 'soft_clear_observations' : 'hard_clear_observations', {
    entityType: 'bulk', rowCount,
    detail: `${soft ? 'Soft-cleared' : 'Hard-cleared'} all observations.`,
  });
  return c.redirect('/admin/data?msg=' + encodeURIComponent(`${soft ? 'Soft-cleared' : 'Cleared'} all observations (${rowCount} row${rowCount === 1 ? '' : 's'}).`));
});

// Full demo reset: clear everything above PLUS deactivate non-real users (anything created after seed).
// Keeps users explicitly created by import (identified by email domains outside of k12.nd.us and
// alexanderschoolnd.us) untouched — we simply clear the dynamic data. Admin can then delete users manually.
app.post('/data/clear-all-demo', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const confirm = String(body.confirm || '').trim().toUpperCase();
  if (confirm !== 'CLEAR ALL DEMO DATA') {
    return c.redirect('/admin/data?msg=' + encodeURIComponent('You must type "CLEAR ALL DEMO DATA" exactly to confirm.'));
  }
  // Always hard-clear here — this is the "wipe everything before handover" button by design.
  //
  // June 3, 2026 — order-of-operations fix. The June 3 verification report flagged
  // this route as returning 500 in production. Root cause: `pd_enrollments` has a
  // non-cascading FK `source_observation_id → observations(id)`. When teachers
  // were auto-enrolled from a low-score observation, the resulting enrollment row
  // pinned the observation in place — and `DELETE FROM observations` triggered
  // SQLITE_CONSTRAINT_FOREIGNKEY.
  //
  // FK map (verified against migrations 0001 + 0003 + 0006):
  //   observation_scores.observation_id    → CASCADE  (safe, but we DELETE explicitly anyway for the audit count)
  //   feedback_items.observation_id        → CASCADE  (same)
  //   focus_areas.opened_observation_id    → no CASCADE → must DELETE first
  //   pd_enrollments.source_observation_id → no CASCADE → must DELETE first  ← was missing
  //   pd_deliverables.enrollment_id        → CASCADE on pd_enrollments
  //   pd_reflections.enrollment_id         → CASCADE on pd_enrollments
  //
  // So the correct teardown order is: scores/feedback/focus → pd_enrollments
  // (cascades to deliverables/reflections) → observations → activity_log.
  await c.env.DB.prepare('DELETE FROM observation_scores').run();
  await c.env.DB.prepare('DELETE FROM feedback_items').run();
  await c.env.DB.prepare('DELETE FROM focus_areas').run();
  // Clear PD enrollments that pin observations in place. Deliverables + reflections
  // cascade automatically. External PD submissions and teacher goals are NOT
  // tied to observations and are intentionally preserved here — they belong to
  // /admin/data/reset-practice-data, which is a separate button by design.
  const rEnr = await c.env.DB.prepare('DELETE FROM pd_enrollments').run();
  const rObs = await c.env.DB.prepare('DELETE FROM observations').run();
  const rAct = await c.env.DB.prepare('DELETE FROM activity_log').run();
  const rowCount =
    ((rEnr.meta as any)?.changes || 0) +
    ((rObs.meta as any)?.changes || 0) +
    ((rAct.meta as any)?.changes || 0);
  await logActivity(c.env.DB, user.id, 'system', 0, 'clear_all_demo');
  await logAdminAudit(c.env.DB, user.id, 'clear_all_demo', {
    entityType: 'bulk', rowCount,
    detail: 'Wiped observations + PD enrollments (cascading deliverables/reflections) + activity_log (handover reset).',
  });
  return c.redirect('/admin/data?msg=' + encodeURIComponent('All observation data, PD auto-enrollments, and activity log cleared. Users, schools, rubric, pedagogy library, external PD, and teacher goals preserved.'));
});

// ----------------------------------------------------------------------------
// Fix 8 — Reset practice / demo PD data (without touching observations).
// Targets: pd_enrollments + pd_deliverables + external_pd_submissions +
// teacher_goals. Phrase guard: "RESET PRACTICE DATA".
// ----------------------------------------------------------------------------
app.post('/data/reset-practice-data', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const confirm = String(body.confirm || '').trim().toUpperCase();
  if (confirm !== 'RESET PRACTICE DATA') {
    return c.redirect('/admin/data?msg=' + encodeURIComponent('You must type "RESET PRACTICE DATA" exactly to confirm.'));
  }
  const soft = await readSoftDeletePref(c.env.DB);
  let rowCount = 0;
  if (soft) {
    const r1 = await c.env.DB.prepare(`UPDATE pd_enrollments         SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL`).run();
    const r2 = await c.env.DB.prepare(`UPDATE pd_deliverables        SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL`).run();
    const r3 = await c.env.DB.prepare(`UPDATE external_pd_submissions SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL`).run();
    const r4 = await c.env.DB.prepare(`UPDATE teacher_goals          SET deleted_at = CURRENT_TIMESTAMP WHERE deleted_at IS NULL`).run();
    rowCount = ((r1.meta as any)?.changes || 0) + ((r2.meta as any)?.changes || 0) + ((r3.meta as any)?.changes || 0) + ((r4.meta as any)?.changes || 0);
  } else {
    const r1 = await c.env.DB.prepare(`DELETE FROM pd_deliverables`).run();
    const r2 = await c.env.DB.prepare(`DELETE FROM pd_enrollments`).run();
    const r3 = await c.env.DB.prepare(`DELETE FROM external_pd_submissions`).run();
    const r4 = await c.env.DB.prepare(`DELETE FROM teacher_goals`).run();
    rowCount = ((r1.meta as any)?.changes || 0) + ((r2.meta as any)?.changes || 0) + ((r3.meta as any)?.changes || 0) + ((r4.meta as any)?.changes || 0);
  }
  await logActivity(c.env.DB, user.id, 'system', 0, soft ? 'soft_reset_practice_data' : 'reset_practice_data');
  await logAdminAudit(c.env.DB, user.id, soft ? 'soft_reset_practice_data' : 'reset_practice_data', {
    entityType: 'bulk', rowCount,
    detail: `${soft ? 'Soft-' : 'Hard-'}reset of pd_enrollments + pd_deliverables + external_pd_submissions + teacher_goals.`,
  });
  return c.redirect('/admin/data?msg=' + encodeURIComponent(`${soft ? 'Soft-' : 'Hard-'}reset practice data: ${rowCount} row${rowCount === 1 ? '' : 's'} affected. Observations preserved.`));
});

// ----------------------------------------------------------------------------
// Fix 8 — Full admin-audit-log viewer (200 most recent mutations).
// ----------------------------------------------------------------------------
app.get('/data/audit-log', async (c) => {
  const user = c.get('user')!;
  const rows = await recentAdminAudit(c.env.DB, 200);
  return c.html(<AdminAuditLogPage user={user} rows={rows} />);
});

export default app;

// ============================== VIEWS ==============================

function AdminHome({ user, byRole, byStatus, recent, welcome }: any) {
  return (
    <Layout title="Admin" user={user} activeNav="admin-home" autoLaunchTour={!!welcome}>
      <h1 class="font-display text-2xl text-aps-navy mb-4" data-tour="admin-overview">Super Administrator</h1>
      <div class="grid md:grid-cols-5 gap-4 mb-6">
        <Stat label="Teachers" value={byRole.teacher || 0} icon="fas fa-chalkboard-user" />
        <Stat label="Appraisers" value={byRole.appraiser || 0} icon="fas fa-user-tie" />
        <Stat label="Coaches" value={byRole.coach || 0} icon="fas fa-compass" />
        <Stat label="Superintendents" value={byRole.superintendent || 0} icon="fas fa-building-columns" />
        <Stat label="Super Admins" value={byRole.super_admin || 0} icon="fas fa-shield-halved" />
      </div>
      <div class="grid md:grid-cols-2 gap-4">
        <Card title="Observation status" icon="fas fa-clipboard-list">
          <ul class="space-y-1 text-sm">
            {Object.entries(byStatus).map(([k, v]: any) => <li class="flex justify-between"><span class="capitalize">{k.replace(/_/g,' ')}</span><span class="font-semibold">{v}</span></li>)}
            {Object.keys(byStatus).length === 0 && <li class="text-slate-500">No observations yet.</li>}
          </ul>
        </Card>
        <Card title="Recent activity" icon="fas fa-clock-rotate-left">
          <ul class="space-y-1 text-sm">
            {recent.length === 0 && <li class="text-slate-500">No activity yet.</li>}
            {recent.map((a: any) => (
              <li class="text-xs text-slate-600 border-b border-slate-100 py-1">
                <span class="font-medium">{a.first_name} {a.last_name}</span> · {a.action} · {a.entity_type} #{a.entity_id || '—'} · {formatDateTime(a.created_at)}
              </li>
            ))}
          </ul>
        </Card>
      </div>
      <Card title="Quick links" class="mt-4">
        <div class="flex flex-wrap gap-2">
          <Button href="/admin/users"><i class="fas fa-users"></i>Users</Button>
          <Button href="/admin/assignments" variant="secondary"><i class="fas fa-user-group"></i>Assignments</Button>
          <Button href="/admin/schools" variant="secondary"><i class="fas fa-school"></i>Schools</Button>
          <Button href="/admin/pedagogy" variant="secondary"><i class="fas fa-book"></i>Pedagogy Library</Button>
          <Button href="/admin/framework" variant="secondary"><i class="fas fa-list-check"></i>Framework</Button>
          <Button href="/admin/import/users" variant="secondary"><i class="fas fa-file-import"></i>Bulk Import Users</Button>
          <Button href="/admin/import/rubric" variant="secondary"><i class="fas fa-file-import"></i>Bulk Import Rubric</Button>
          <Button href="/reports" variant="secondary"><i class="fas fa-file-export"></i>Reports</Button>
          <Button href="/admin/district" variant="secondary"><i class="fas fa-building-columns"></i>District Info</Button>
          <Button href="/admin/data" variant="secondary"><i class="fas fa-database"></i>Data Management</Button>
          <Button href="/admin/settings/pd-hours" variant="secondary"><i class="fas fa-stopwatch"></i>PD-hours target</Button>
          <Button href="/admin/pd" variant="secondary"><i class="fas fa-graduation-cap"></i>PD Modules</Button>
          <Button href="/admin/pd/coverage" variant="secondary"><i class="fas fa-chart-area"></i>PD Coverage</Button>
          <Button href="/admin/external-pd" variant="secondary"><i class="fas fa-clipboard-list"></i>External PD Audit</Button>
        </div>
      </Card>
    </Layout>
  );
}

function Stat({ label, value, icon }: any) {
  return (
    <div class="bg-white rounded-lg border border-slate-200 p-4">
      <div class="flex items-center justify-between">
        <div class="text-xs text-slate-500 uppercase tracking-wide">{label}</div>
        <i class={`${icon} text-aps-navy`}></i>
      </div>
      <div class="text-3xl font-display text-aps-navy mt-1">{value}</div>
    </div>
  );
}

// Standalone reset-password page — navigating directly to
// /admin/users/:id/reset-password lands here (fixes the previous 500 error
// that happened when a GET request hit a POST-only route). Includes the new
// password UX: visibility toggle, match indicator, disable-submit-until-valid,
// plus a one-click "Use Alexander2026!" button for fast previews.
function ResetPasswordPage({ user, target, msg, err }: any) {
  const fullName = [target.first_name, target.last_name].filter(Boolean).join(' ') || target.email;
  return (
    <Layout title="Reset password" user={user} activeNav="admin-users">
      <div class="mb-4 flex items-center gap-3 text-sm">
        <a href="/admin/users" class="text-aps-navy hover:underline"><i class="fas fa-arrow-left mr-1"></i>Back to Users</a>
      </div>
      <h1 class="font-display text-2xl text-aps-navy mb-1"><i class="fas fa-key mr-2 text-aps-gold"></i>Reset password</h1>
      <p class="text-sm text-slate-600 mb-4">
        for <strong>{fullName}</strong> <span class="text-slate-500">({target.email})</span>
        <span class="ml-2 text-xs bg-slate-100 border border-slate-200 rounded-full px-2 py-0.5">{target.role}</span>
      </p>
      {msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}
      {err && <div class="mb-4 p-3 rounded bg-red-50 border border-red-200 text-red-800 text-sm">{err}</div>}

      <Card title="Set a new password" icon="fas fa-shield-halved">
        <div class="p-3 mb-4 rounded bg-sky-50 border border-sky-200 text-sky-900 text-xs">
          <i class="fas fa-circle-info mr-1"></i>
          The new password takes effect immediately. The user will be signed out of any active sessions
          and can change the password themselves any time from their <em>Profile</em> page.
        </div>

        <form method="post" action={`/admin/users/${target.id}/reset-password`} class="space-y-4 max-w-lg" id="aps-reset-form">
          <div>
            <label for="aps-pw" class="block text-sm font-medium text-slate-700 mb-1">New password</label>
            <div class="relative">
              <input id="aps-pw" name="password" type="password" autocomplete="new-password" minlength={8}
                class="w-full border border-slate-300 rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-aps-blue"
                placeholder="At least 8 characters" />
              <button type="button" id="aps-pw-eye"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 p-1"
                aria-label="Show password" title="Show / hide password">
                <i class="fas fa-eye"></i>
              </button>
            </div>
            <div id="aps-pw-hint" class="text-xs text-slate-500 mt-1">Minimum 8 characters.</div>
          </div>

          <div>
            <label for="aps-pw2" class="block text-sm font-medium text-slate-700 mb-1">Confirm new password</label>
            <div class="relative">
              <input id="aps-pw2" name="confirm_password" type="password" autocomplete="new-password"
                class="w-full border border-slate-300 rounded-md px-3 py-2 pr-10 focus:outline-none focus:ring-2 focus:ring-aps-blue"
                placeholder="Type the same password again" />
              <button type="button" id="aps-pw2-eye"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-800 p-1"
                aria-label="Show password" title="Show / hide password">
                <i class="fas fa-eye"></i>
              </button>
            </div>
            <div id="aps-pw2-match" class="text-xs mt-1 min-h-[1rem]"></div>
          </div>

          <div class="flex flex-wrap items-center gap-3 pt-2">
            <button id="aps-pw-submit" type="submit"
              class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              disabled>
              <i class="fas fa-save mr-1"></i>Save new password
            </button>
            <button id="aps-pw-default" type="button"
              class="bg-amber-500 text-white px-3 py-2 rounded hover:bg-amber-600 text-sm"
              title="Prefill both fields with the district default password Alexander2026!">
              <i class="fas fa-wand-magic-sparkles mr-1"></i>Use Alexander2026!
            </button>
            <a href="/admin/users" class="text-sm text-slate-600 hover:underline">Cancel</a>
          </div>
        </form>
      </Card>

      {/* Client-side UX:
          - Eye icons toggle visibility on each field independently.
          - Live match indicator + disable-until-valid on submit.
          - "Use Alexander2026!" fills both fields and enables submit instantly. */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function(){
          var pw   = document.getElementById('aps-pw');
          var pw2  = document.getElementById('aps-pw2');
          var eye1 = document.getElementById('aps-pw-eye');
          var eye2 = document.getElementById('aps-pw2-eye');
          var match= document.getElementById('aps-pw2-match');
          var btn  = document.getElementById('aps-pw-submit');
          var dflt = document.getElementById('aps-pw-default');
          if (!pw || !pw2 || !btn) return;
          function toggle(input, btn){
            if (input.type === 'password') { input.type = 'text';  btn.innerHTML = '<i class="fas fa-eye-slash"></i>'; btn.setAttribute('aria-label','Hide password'); }
            else                           { input.type = 'password'; btn.innerHTML = '<i class="fas fa-eye"></i>';       btn.setAttribute('aria-label','Show password'); }
          }
          if (eye1) eye1.addEventListener('click', function(){ toggle(pw,  eye1); });
          if (eye2) eye2.addEventListener('click', function(){ toggle(pw2, eye2); });
          function update(){
            var a = pw.value, b = pw2.value;
            var longEnough = a.length >= 8;
            var matches = a === b && a.length > 0;
            if (!a) { match.textContent = ''; match.className = 'text-xs mt-1 min-h-[1rem]'; }
            else if (!longEnough) { match.textContent = 'Password must be at least 8 characters.'; match.className = 'text-xs mt-1 min-h-[1rem] text-amber-700'; }
            else if (!b) { match.textContent = 'Type it again to confirm.'; match.className = 'text-xs mt-1 min-h-[1rem] text-slate-500'; }
            else if (!matches) { match.textContent = '✗ Passwords do not match.'; match.className = 'text-xs mt-1 min-h-[1rem] text-red-700'; }
            else { match.textContent = '✓ Passwords match.'; match.className = 'text-xs mt-1 min-h-[1rem] text-emerald-700'; }
            btn.disabled = !(longEnough && matches);
          }
          pw.addEventListener('input', update);
          pw2.addEventListener('input', update);
          if (dflt) dflt.addEventListener('click', function(){
            pw.value = 'Alexander2026!';
            pw2.value = 'Alexander2026!';
            update();
            pw2.focus();
          });
          update();
        })();
      `}} />
    </Layout>
  );
}

function UsersPage({ user, rows, schools, q, roleFilter, msg }: any) {
  return (
    <Layout title="Users" user={user} activeNav="admin-users">
      <h1 class="font-display text-2xl text-aps-navy mb-4">Users</h1>
      {msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}

      <Card title="Create user" icon="fas fa-user-plus">
        <form method="post" action="/admin/users/create" class="grid md:grid-cols-4 gap-3 text-sm" data-tour="users-create">
          <label>First name<input name="first_name" required class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
          <label>Last name<input name="last_name" required class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
          <label>Email<input name="email" type="email" required class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
          <label>Role<select name="role" required class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5">
            <option value="">Select…</option>
            <option value="teacher">Teacher</option>
            <option value="appraiser">Appraiser / Principal</option>
            <option value="coach">Instructional Coach</option>
            <option value="superintendent">Superintendent</option>
            <option value="super_admin">Super Administrator</option>
          </select></label>
          <label>Title<input name="title" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
          <label>Phone<input name="phone" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
          <label>Initial password<input name="password" placeholder="Default: Alexander2026!" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
          <label class="md:col-span-2">Schools <span class="text-xs text-slate-500">(hold Ctrl/⌘ to pick more than one — first pick becomes the primary)</span>
            <select name="school_ids" multiple size={Math.min(6, Math.max(3, schools.length))} class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5">
              {schools.map((s: any) => <option value={s.id}>{s.name}</option>)}
            </select>
          </label>
          {/* June 3, 2026 — Fix 11 completion: classroom context fields surfaced
              on the admin user form so the auto-feedback generator can produce
              context-aware language. All three are optional. */}
          <label>Subject area <span class="text-xs text-slate-500">(teachers only)</span>
            <input name="subject_area" list="subject-area-options" placeholder="e.g., Mathematics, ELA, Self-contained Elementary" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" />
          </label>
          <label>Classroom type
            <select name="classroom_type" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5">
              <option value="">— Not specified —</option>
              <option value="self_contained">Self-contained</option>
              <option value="departmentalized">Departmentalized</option>
              <option value="specials">Specials / Electives</option>
              <option value="intervention">Intervention / Support</option>
            </select>
          </label>
          <label>Grade band
            <select name="grade_band" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5">
              <option value="">— Not specified —</option>
              <option value="K-2">K–2</option>
              <option value="3-5">3–5</option>
              <option value="6-8">6–8</option>
              <option value="9-12">9–12</option>
            </select>
          </label>
          <datalist id="subject-area-options">
            <option value="ELA" />
            <option value="Mathematics" />
            <option value="Science" />
            <option value="Social Studies" />
            <option value="Self-contained Elementary" />
            <option value="Special Education" />
            <option value="World Languages" />
            <option value="Physical Education" />
            <option value="Music" />
            <option value="Art" />
            <option value="CTE" />
            <option value="Counseling" />
          </datalist>
          <div class="md:col-span-4"><button class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-plus mr-1"></i>Create user</button></div>
        </form>
      </Card>

      <Card title="Add many users at once" icon="fas fa-file-import" class="mt-4" data-tour="users-bulk">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <p class="text-sm text-slate-600">Need to onboard a full roster of teachers, principals, or coaches? Download the CSV template, fill it out in Excel, and upload it back — existing emails are updated, new emails are created.</p>
          <a href="/admin/import/users" class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm whitespace-nowrap"><i class="fas fa-file-import mr-1"></i>Bulk import users</a>
        </div>
      </Card>

      <Card title={`All users (${rows.length})`} icon="fas fa-users" class="mt-4" data-tour="users-list">
        <form method="get" action="/admin/users" class="flex gap-2 mb-3 text-sm">
          <input name="q" value={q} placeholder="Search name or email…" class="flex-1 border border-slate-300 rounded px-2 py-1.5" />
          <select name="role" class="border border-slate-300 rounded px-2 py-1.5">
            <option value="">All roles</option>
            <option value="teacher" selected={roleFilter==='teacher'}>Teacher</option>
            <option value="appraiser" selected={roleFilter==='appraiser'}>Appraiser</option>
            <option value="coach" selected={roleFilter==='coach'}>Coach</option>
            <option value="superintendent" selected={roleFilter==='superintendent'}>Superintendent</option>
            <option value="super_admin" selected={roleFilter==='super_admin'}>Super Admin</option>
          </select>
          <button class="bg-aps-navy text-white px-3 rounded">Filter</button>
        </form>
        <div class="flex items-center justify-end mb-1"><button type="button" data-sort-reset="admin-users-table" class="text-xs text-slate-500 hover:text-aps-navy hover:underline"><i class="fas fa-rotate-left mr-1"></i>Reset sort</button></div>
        <p class="text-[11px] text-slate-500 mb-2"><i class="fas fa-circle-info mr-1"></i>Click any column header to sort. Shift-click another header for multi-column sort.</p>
        <div class="overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5"><table id="admin-users-table" data-sortable="true" class="w-full text-sm">
          <thead><tr class="text-left border-b border-slate-200 text-slate-600"><th class="py-2" data-sort-type="text">Name</th><th data-sort-type="text">Email</th><th data-sort-type="text">Role</th><th data-sort-type="text">School</th><th data-sort-type="date">Last login</th><th data-sort-disable="true"></th></tr></thead>
          <tbody>
            {rows.map((u: any) => (
              <tr class="border-b border-slate-100">
                <td class="py-2">
                  <details>
                    <summary class="cursor-pointer font-medium">{u.first_name} {u.last_name}{!u.active ? <span class="ml-2 text-xs text-slate-400">(inactive)</span> : null}</summary>
                    <form method="post" action={`/admin/users/${u.id}/update`} class="mt-2 grid md:grid-cols-4 gap-2 bg-slate-50 p-2 rounded text-xs">
                      <label>First<input name="first_name" value={u.first_name} class="mt-1 w-full border rounded px-1 py-1" /></label>
                      <label>Last<input name="last_name" value={u.last_name} class="mt-1 w-full border rounded px-1 py-1" /></label>
                      <label>Email<input name="email" value={u.email} class="mt-1 w-full border rounded px-1 py-1" /></label>
                      <label>Role<select name="role" class="mt-1 w-full border rounded px-1 py-1">
                        {['teacher','appraiser','coach','superintendent','super_admin'].map(r => <option value={r} selected={u.role===r}>{r}</option>)}
                      </select></label>
                      <label>Title<input name="title" value={u.title || ''} class="mt-1 w-full border rounded px-1 py-1" /></label>
                      <label>Phone<input name="phone" value={u.phone || ''} class="mt-1 w-full border rounded px-1 py-1" /></label>
                      <label class="md:col-span-2">Schools <span class="text-[10px] text-slate-500">(hold Ctrl/⌘ for multi — first = primary)</span>
                        <select name="school_ids" multiple size={Math.min(5, Math.max(3, schools.length))} class="mt-1 w-full border rounded px-1 py-1">
                          {schools.map((s: any) => <option value={s.id} selected={(u.schools || []).some((x: any) => x.school_id === s.id)}>{s.name}</option>)}
                        </select>
                      </label>
                      {/* June 3, 2026 — Fix 11 completion: classroom context on edit form.
                          Pre-launch verification report flagged these as missing. They feed
                          the context-aware auto-feedback generator (teacherContextNote). */}
                      <label>Subject area
                        <input name="subject_area" value={u.subject_area || ''} list={`subj-opts-${u.id}`} placeholder="e.g., Mathematics" class="mt-1 w-full border rounded px-1 py-1" />
                        <datalist id={`subj-opts-${u.id}`}>
                          <option value="ELA" />
                          <option value="Mathematics" />
                          <option value="Science" />
                          <option value="Social Studies" />
                          <option value="Self-contained Elementary" />
                          <option value="Special Education" />
                          <option value="World Languages" />
                          <option value="Physical Education" />
                          <option value="Music" />
                          <option value="Art" />
                          <option value="CTE" />
                          <option value="Counseling" />
                        </datalist>
                      </label>
                      <label>Classroom type
                        <select name="classroom_type" class="mt-1 w-full border rounded px-1 py-1">
                          <option value="" selected={!u.classroom_type}>— Not specified —</option>
                          <option value="self_contained" selected={u.classroom_type==='self_contained'}>Self-contained</option>
                          <option value="departmentalized" selected={u.classroom_type==='departmentalized'}>Departmentalized</option>
                          <option value="specials" selected={u.classroom_type==='specials'}>Specials / Electives</option>
                          <option value="intervention" selected={u.classroom_type==='intervention'}>Intervention / Support</option>
                        </select>
                      </label>
                      <label>Grade band
                        <select name="grade_band" class="mt-1 w-full border rounded px-1 py-1">
                          <option value="" selected={!u.grade_band}>— Not specified —</option>
                          <option value="K-2" selected={u.grade_band==='K-2'}>K–2</option>
                          <option value="3-5" selected={u.grade_band==='3-5'}>3–5</option>
                          <option value="6-8" selected={u.grade_band==='6-8'}>6–8</option>
                          <option value="9-12" selected={u.grade_band==='9-12'}>9–12</option>
                        </select>
                      </label>
                      <label class="flex items-center gap-2 mt-5"><input type="checkbox" name="active" checked={!!u.active} /> Active</label>
                      <div class="md:col-span-4 flex flex-wrap gap-2"><button class="bg-aps-navy text-white px-3 py-1 rounded text-xs"><i class="fas fa-save mr-1"></i>Save</button></div>
                    </form>
                    <div class="mt-2 flex flex-wrap items-center gap-2 bg-amber-50 p-2 rounded text-xs">
                      <form method="post" action={`/admin/users/${u.id}/reset-password`} class="flex items-center gap-2 flex-1">
                        <input name="password" placeholder="New password (blank = Alexander2026!)" class="flex-1 border rounded px-1 py-1" />
                        <button class="bg-amber-600 text-white px-3 py-1 rounded text-xs" title="Quick reset from this row"><i class="fas fa-key mr-1"></i>Quick reset</button>
                      </form>
                      <a href={`/admin/users/${u.id}/reset-password`} class="text-xs text-aps-navy hover:underline" title="Open full reset page with confirm, eye-toggle, match indicator">
                        <i class="fas fa-arrow-up-right-from-square mr-1"></i>Full page
                      </a>
                    </div>
                    {/* Aug 16, 2026 — Dr. Gandhi requested a real delete option alongside
                        the existing deactivate. Both live in this danger zone so admins can
                        pick the right action for the situation. */}
                    {u.id !== user.id ? (
                      <div class="mt-2 flex flex-wrap items-center gap-3 bg-red-50 border border-red-200 rounded p-2">
                        <span class="text-[11px] uppercase tracking-wide text-red-800 font-semibold"><i class="fas fa-triangle-exclamation mr-1"></i>Danger zone</span>
                        {u.active ? (
                          <form method="post" action={`/admin/users/${u.id}/delete`} class="inline" onsubmit="return confirm('Deactivate this user? They can be reactivated later. Their evaluation history stays on file.')">
                            <button class="text-xs text-amber-800 hover:underline"><i class="fas fa-user-slash mr-1"></i>Deactivate</button>
                          </form>
                        ) : (
                          <span class="text-xs text-slate-500 italic">(already deactivated)</span>
                        )}
                        <form method="post" action={`/admin/users/${u.id}/hard-delete`} class="inline ml-auto" onsubmit={`return confirm('PERMANENTLY delete ${u.first_name} ${u.last_name} (${u.email})?\\n\\nThis removes the account for good. If they have observations, feedback, or PD credit on file, the system will automatically deactivate them instead (to preserve the audit trail).\\n\\nUse this for staff who no longer work at the district.')`}>
                          <button class="text-xs text-white bg-red-700 hover:bg-red-800 px-2 py-1 rounded" title="Permanently remove this user"><i class="fas fa-trash mr-1"></i>Delete permanently</button>
                        </form>
                      </div>
                    ) : null}
                  </details>
                </td>
                <td class="text-slate-600">{u.email}</td>
                <td><span class="text-xs bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">{u.role}</span></td>
                <td class="text-slate-600">
                  {(u.schools && u.schools.length) ? (
                    <div class="flex flex-wrap gap-1">
                      {u.schools.map((s: any) => (
                        <span class={`text-[11px] px-2 py-0.5 rounded-full border ${s.is_primary ? 'bg-aps-navy text-white border-aps-navy' : 'bg-slate-100 border-slate-200 text-slate-700'}`} title={s.is_primary ? 'Primary school' : 'Additional school'}>{s.name}{s.is_primary ? <i class="fas fa-star ml-1 text-[9px]"></i> : null}</span>
                      ))}
                    </div>
                  ) : <span class="text-slate-400">—</span>}
                </td>
                <td class="text-slate-500 text-xs" data-sort-value={u.last_login_at || ''}>{formatDateTime(u.last_login_at)}</td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
    </Layout>
  );
}

function AssignmentsPage({ user, teachers, appraisers, coaches, assignments, msg }: any) {
  // Group active assignments by staff member so it's easy to see "who evaluates whom".
  const byStaff = new Map<number, any>();
  for (const a of assignments) {
    if (!byStaff.has(a.staff_id)) byStaff.set(a.staff_id, {
      staff_id: a.staff_id, s_first: a.s_first, s_last: a.s_last, s_role: a.s_role,
      appraiser: [] as any[], coach: [] as any[],
    });
    const g = byStaff.get(a.staff_id)!;
    (a.relationship === 'coach' ? g.coach : g.appraiser).push(a);
  }
  const staffGroups = Array.from(byStaff.values()).sort((a, b) => `${a.s_last} ${a.s_first}`.localeCompare(`${b.s_last} ${b.s_first}`));

  return (
    <Layout title="Assignments" user={user} activeNav="admin-assign">
      <h1 class="font-display text-2xl text-aps-navy mb-1">Assignments</h1>
      <p class="text-slate-600 text-sm mb-4">Link one or many teachers to one or many appraisers (principal/admin) or instructional coaches in a single click. Each staff member can evaluate or coach as many teachers as you select.</p>
      {msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}

      <Card title="Add assignments (multi-select)" icon="fas fa-link" data-tour="assign-create">
        <form method="post" action="/admin/assignments/create" class="grid md:grid-cols-3 gap-4 text-sm items-start">
          <div>
            <label class="block font-medium text-slate-700 mb-1">Teachers <span class="text-xs text-slate-500">(Ctrl/⌘-click for many)</span></label>
            <select name="teacher_ids" multiple required size={Math.min(12, Math.max(6, teachers.length))} class="w-full border border-slate-300 rounded px-2 py-1.5">
              {teachers.map((t: any) => <option value={t.id}>{t.last_name}, {t.first_name} — {t.school_name || '—'}</option>)}
            </select>
            <div class="mt-1 text-xs">
              <button type="button" onclick="Array.from(this.closest('div').previousElementSibling.options).forEach(o=>o.selected=true)" class="text-aps-blue hover:underline">Select all</button>
              <span class="text-slate-400 mx-1">·</span>
              <button type="button" onclick="Array.from(this.closest('div').previousElementSibling.options).forEach(o=>o.selected=false)" class="text-aps-blue hover:underline">Clear</button>
            </div>
          </div>
          <div>
            <label class="block font-medium text-slate-700 mb-1">Relationship</label>
            <select name="relationship" required class="w-full border border-slate-300 rounded px-2 py-1.5">
              <option value="appraiser">Appraiser (principal / admin)</option>
              <option value="coach">Coach</option>
            </select>
            <p class="mt-2 text-xs text-slate-600 italic">Tip: to give a teacher both an appraiser and a coach, run this form twice — once with each relationship.</p>
          </div>
          <div>
            <label class="block font-medium text-slate-700 mb-1">Staff members <span class="text-xs text-slate-500">(Ctrl/⌘-click for many)</span></label>
            <select name="staff_ids" multiple required size={Math.min(12, Math.max(6, appraisers.length + coaches.length))} class="w-full border border-slate-300 rounded px-2 py-1.5">
              <optgroup label="Appraisers & Superintendents">
                {appraisers.map((s: any) => <option value={s.id} data-role={s.role}>{s.last_name}, {s.first_name} ({s.role})</option>)}
              </optgroup>
              <optgroup label="Coaches">
                {coaches.map((s: any) => <option value={s.id} data-role="coach">{s.last_name}, {s.first_name}</option>)}
              </optgroup>
            </select>
            <div class="mt-1 text-xs">
              <button type="button" onclick="Array.from(this.closest('div').previousElementSibling.options).forEach(o=>o.selected=true)" class="text-aps-blue hover:underline">Select all</button>
              <span class="text-slate-400 mx-1">·</span>
              <button type="button" onclick="Array.from(this.closest('div').previousElementSibling.options).forEach(o=>o.selected=false)" class="text-aps-blue hover:underline">Clear</button>
            </div>
          </div>
          <div class="md:col-span-3 flex items-center gap-3">
            <button class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-plus mr-1"></i>Link selected teachers to selected staff</button>
            <span class="text-xs text-slate-500">Creates every teacher × staff combination selected above (skipping duplicates).</span>
          </div>
        </form>
      </Card>

      <Card title={`Current assignments (${assignments.length}) — grouped by staff`} icon="fas fa-list" class="mt-4" data-tour="assign-current">
        {staffGroups.length === 0 ? <p class="text-slate-500 text-sm">No assignments yet.</p> :
          <form method="post" action="/admin/assignments/bulk-delete" onsubmit="return confirm('Remove all checked assignments?')">
            <div class="space-y-4">
              {staffGroups.map((g: any) => (
                <div class="border border-slate-200 rounded">
                  <div class="bg-slate-50 px-3 py-2 flex flex-wrap items-center gap-2 border-b border-slate-200">
                    <div class="font-medium text-aps-navy">{g.s_first} {g.s_last}</div>
                    <span class="text-xs text-slate-500">({g.s_role})</span>
                    <span class="ml-auto text-xs text-slate-500">{g.appraiser.length + g.coach.length} teacher(s) linked</span>
                  </div>
                  <div class="grid md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-slate-200">
                    {['appraiser','coach'].map((rel: string) => {
                      const list = rel === 'appraiser' ? g.appraiser : g.coach;
                      return (
                        <div class="p-3">
                          <div class="text-xs uppercase tracking-wide text-slate-500 mb-2 font-medium">{rel === 'appraiser' ? 'As appraiser of…' : 'As coach of…'}</div>
                          {list.length === 0 ? <p class="text-sm text-slate-400 italic">None</p> :
                            <ul class="space-y-1">
                              {list.map((a: any) => (
                                <li class="flex items-center gap-2 text-sm">
                                  <input type="checkbox" name="ids" value={a.id} class="accent-aps-navy" />
                                  <span class="flex-1">{a.t_first} {a.t_last}</span>
                                  <form method="post" action={`/admin/assignments/${a.id}/delete`} onsubmit="event.stopPropagation(); return confirm('Remove this one assignment?');" class="inline">
                                    <button class="text-red-700 hover:underline text-xs"><i class="fas fa-trash"></i></button>
                                  </form>
                                </li>
                              ))}
                            </ul>
                          }
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <div class="mt-4 flex items-center gap-3">
              <button class="bg-red-700 text-white px-4 py-2 rounded hover:bg-red-800 text-sm"><i class="fas fa-trash mr-1"></i>Remove checked assignments</button>
              <span class="text-xs text-slate-500">Tick any number of teachers above, then click to remove them in one step.</span>
            </div>
          </form>
        }
      </Card>
    </Layout>
  );
}

function SchoolsPage({ user, schools, msg }: any) {
  return (
    <Layout title="Schools" user={user} activeNav="admin-schools">
      <h1 class="font-display text-2xl text-aps-navy mb-4">Schools</h1>
      {msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}
      <Card title="Add school" icon="fas fa-plus" data-tour="schools-add">
        <form method="post" action="/admin/schools/create" class="grid md:grid-cols-4 gap-2 text-sm">
          <label>Name<input name="name" required class="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>Grade span<input name="grade_span" placeholder="PK-5" class="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>Address<input name="address" class="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>Phone<input name="phone" class="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <div class="md:col-span-4"><button class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-plus mr-1"></i>Add</button></div>
        </form>
      </Card>
      <Card title="All schools" icon="fas fa-school" class="mt-4">
        <div class="flex items-center justify-end mb-1"><button type="button" data-sort-reset="admin-schools-table" class="text-xs text-slate-500 hover:text-aps-navy hover:underline"><i class="fas fa-rotate-left mr-1"></i>Reset sort</button></div>
        <p class="text-[11px] text-slate-500 mb-2"><i class="fas fa-circle-info mr-1"></i>Click any column header to sort. Shift-click for multi-column sort.</p>
        <div class="overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5"><table id="admin-schools-table" data-sortable="true" class="w-full text-sm">
          <thead><tr class="text-left border-b border-slate-200 text-slate-600"><th class="py-2" data-sort-type="text">Name</th><th data-sort-type="text">Grade span</th><th data-sort-type="text">Address</th><th data-sort-type="text">Phone</th></tr></thead>
          <tbody>
            {schools.map((s: any) => (
              <tr class="border-b border-slate-100">
                <td class="py-2">
                  <details>
                    <summary class="cursor-pointer font-medium">{s.name}</summary>
                    <form method="post" action={`/admin/schools/${s.id}/update`} class="mt-2 grid md:grid-cols-4 gap-2 bg-slate-50 p-2 rounded text-xs">
                      <label>Name<input name="name" value={s.name} class="mt-1 w-full border rounded px-1 py-1" /></label>
                      <label>Grade span<input name="grade_span" value={s.grade_span || ''} class="mt-1 w-full border rounded px-1 py-1" /></label>
                      <label>Address<input name="address" value={s.address || ''} class="mt-1 w-full border rounded px-1 py-1" /></label>
                      <label>Phone<input name="phone" value={s.phone || ''} class="mt-1 w-full border rounded px-1 py-1" /></label>
                      <div class="md:col-span-4"><button class="bg-aps-navy text-white px-3 py-1 rounded text-xs"><i class="fas fa-save mr-1"></i>Save</button></div>
                    </form>
                  </details>
                </td>
                <td>{s.grade_span}</td><td>{s.address}</td><td>{s.phone}</td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
    </Layout>
  );
}

function PedagogyPage({ user, domains, map }: any) {
  return (
    <Layout title="Pedagogy Library" user={user} activeNav="admin-pedagogy">
      <h1 class="font-display text-2xl text-aps-navy mb-1">Pedagogy Library</h1>
      <p class="text-slate-600 text-sm mb-4">Each indicator has four rating levels. Click any cell to edit the interpretation, evidence signals, concrete next-steps, coaching considerations, PD resources, and the feedback-starter sentence used when auto-generating feedback.</p>

      {/* Fix 1 (June 2, 2026 brief) — sticky tabbed domain navigation. */}
      <DomainTabs domains={domains.map((d: any) => ({ id: d.id, code: d.code, name: d.name }))} idPrefix="ped-domain" />

      <div class="space-y-3 mt-3">
        {domains.map((d: any) => (
          <details id={`ped-domain-${d.code}`} data-domain-section={d.code} open class="bg-white rounded-lg border border-slate-200 scroll-mt-32">
            <summary class="px-4 py-3 cursor-pointer">
              <span class="inline-block w-7 h-7 rounded-full bg-aps-navy text-white font-display text-sm mr-2 text-center leading-7">{d.code}</span>
              <span class="font-display text-aps-navy">{d.name}</span>
            </summary>
            <div class="p-4 overflow-x-auto">
              <div class="overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5"><table class="w-full text-xs">
                <thead><tr class="text-left text-slate-500 border-b">
                  <th class="py-2 w-48">Indicator</th>
                  {[4,3,2,1].map(lvl => <th class="py-2"><span class={`inline-block px-2 py-0.5 rounded-full border ${levelColor[lvl]}`}>{lvl} · {levelLabels[lvl]}</span></th>)}
                </tr></thead>
                <tbody>
                  {d.indicators.map((i: any) => (
                    <tr class="border-b border-slate-100 align-top">
                      <td class="py-2 font-medium text-aps-navy">{d.code}.{(i.code || '').toUpperCase()} {i.name}</td>
                      {[4,3,2,1].map(lvl => {
                        const entry = map.get(`${i.id}:${lvl}`);
                        return (
                          <td class="py-2 pr-2">
                            <a href={`/admin/pedagogy/${i.id}/${lvl}`} class="block p-2 rounded border border-slate-200 hover:bg-slate-50">
                              {entry ? (
                                <div class="text-slate-700 line-clamp-3">{(entry.interpretation || '').slice(0, 160)}…</div>
                              ) : (
                                <div class="text-slate-400 italic">Add content</div>
                              )}
                              <div class="mt-1 text-aps-blue text-[11px]">Edit →</div>
                            </a>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table></div>
            </div>
          </details>
        ))}
      </div>
    </Layout>
  );
}

function PedagogyEdit({ user, ind, level, entry, msg }: any) {
  const ev = safeParse(entry?.evidence_signals, []);
  const moves = safeParse(entry?.teacher_next_moves, []);
  const coaching = safeParse(entry?.coaching_considerations, []);
  const resources: any[] = safeParse(entry?.resources, []);
  const titles = resources.map((r: any) => r.title || '').join('\n');
  const sources = resources.map((r: any) => r.source || '').join('\n');
  return (
    <Layout title="Edit pedagogy" user={user} activeNav="admin-pedagogy">
      <div class="mb-4"><a href="/admin/pedagogy" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>Back</a></div>
      {msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}
      <h1 class="font-display text-2xl text-aps-navy">{ind.domain_code}.{(ind.code || '').toUpperCase()} {ind.name} · <span class={`px-2 py-0.5 rounded-full border text-xs ${levelColor[level]}`}>{level} · {levelLabels[level]}</span></h1>
      <p class="text-slate-600 text-sm mb-4">{ind.domain_name}</p>
      <form method="post" action={`/admin/pedagogy/${ind.id}/${level}`} class="space-y-4">
        <Field label="Interpretation (plain-language meaning)" name="interpretation" rows={3} value={entry?.interpretation || ''} />
        <Field label="Evidence signals (one per line — what this looks like in a real classroom)" name="evidence_signals" rows={5} value={ev.join('\n')} />
        <Field label="Teacher next moves (one per line — concrete strategies)" name="teacher_next_moves" rows={5} value={moves.join('\n')} />
        <Field label="Coaching considerations (one per line — for the principal/coach)" name="coaching_considerations" rows={4} value={coaching.join('\n')} />
        <div class="grid md:grid-cols-2 gap-3">
          <Field label="Resource titles (one per line)" name="resource_titles" rows={5} value={titles} />
          <Field label="Resource sources (one per line, aligned with titles)" name="resource_sources" rows={5} value={sources} />
        </div>
        <Field label="Feedback starter (seed sentence used when auto-generating feedback)" name="feedback_starter" rows={4} value={entry?.feedback_starter || ''} />
        <button class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-save mr-1"></i>Save pedagogy entry</button>
      </form>
    </Layout>
  );
}

function Field({ label, name, value, rows }: any) {
  return (
    <label class="block text-sm">
      <span class="block text-slate-700 font-medium mb-1">{label}</span>
      <textarea name={name} rows={rows || 3} class="w-full border border-slate-300 rounded px-3 py-2">{value}</textarea>
    </label>
  );
}

function safeParse<T>(v: any, fb: T): T {
  if (!v) return fb;
  try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return fb; }
}

function FrameworkPage({ user, framework, domains }: any) {
  return (
    <Layout title="Framework" user={user} activeNav="admin-framework">
      <h1 class="font-display text-2xl text-aps-navy mb-1">{(framework as any).name}</h1>
      <p class="text-slate-600 text-sm mb-4">Version {(framework as any).version} · Read-only reference</p>
      <div class="mb-4 flex flex-wrap gap-2" data-tour="framework-actions">
        <a href="/admin/import/rubric" class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-file-import mr-1"></i>Bulk import / replace rubric</a>
        <a href="/admin/import/rubric/export" class="bg-white border border-aps-navy text-aps-navy px-4 py-2 rounded hover:bg-slate-50 text-sm"><i class="fas fa-file-export mr-1"></i>Export current rubric (CSV)</a>
        <a href="/admin/pedagogy" class="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded hover:bg-slate-50 text-sm"><i class="fas fa-pen-to-square mr-1"></i>Edit individual cells</a>
      </div>
      <div class="space-y-3">
        {domains.map((d: any) => (
          <details class="bg-white rounded-lg border border-slate-200">
            <summary class="px-4 py-3 cursor-pointer">
              <span class="inline-block w-7 h-7 rounded-full bg-aps-navy text-white font-display text-sm mr-2 text-center leading-7">{d.code}</span>
              <span class="font-display text-aps-navy">{d.name}</span>
            </summary>
            <div class="px-4 pb-4">
              {d.description && <p class="text-sm text-slate-600 mb-3">{d.description}</p>}
              {d.indicators.map((i: any) => (
                <div class="border-t border-slate-100 pt-3 pb-2">
                  <div class="font-medium text-aps-navy">{d.code}.{(i.code || '').toUpperCase()} {i.name}</div>
                  <div class="grid md:grid-cols-4 gap-2 mt-2 text-xs">
                    {(i.descriptors || []).sort((a:any,b:any)=>b.level-a.level).map((x: any) => (
                      <div class={`border rounded p-2 ${levelColor[x.level]}`}>
                        <div class="font-medium">{x.level} · {x.level_label}</div>
                        <div class="mt-1 leading-snug text-slate-800">{x.descriptor}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </Layout>
  );
}

function DistrictPage({ user, d, years, msg }: any) {
  return (
    <Layout title="District" user={user} activeNav="admin-district">
      <h1 class="font-display text-2xl text-aps-navy mb-4">District Information</h1>
      {msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}
      <Card title="District details" icon="fas fa-building-columns" data-tour="district-form">
        <form method="post" action="/admin/district/update" class="grid md:grid-cols-2 gap-3 text-sm">
          <label>Name<input name="name" value={d?.name || ''} class="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>Phone<input name="phone" value={d?.phone || ''} class="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>Address<input name="address" value={d?.address || ''} class="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>City<input name="city" value={d?.city || ''} class="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>State<input name="state" value={d?.state || ''} class="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>ZIP<input name="zip" value={d?.zip || ''} class="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <div class="md:col-span-2"><button class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-save mr-1"></i>Save</button></div>
        </form>
      </Card>
      <Card title="School years" icon="fas fa-calendar" class="mt-4">
        <p class="text-xs text-slate-500 mb-3"><i class="fas fa-circle-info mr-1"></i>The platform automatically marks the school year whose date range covers today as <strong>current</strong>. If no year covers today, a new one is auto-created using the Aug 1&ndash;Jul 31 convention. Edit a year's dates or add a future one below; the system will pick it up automatically when it starts.</p>

        {years.length === 0 ? <p class="text-sm text-slate-500 mb-3">No school years yet.</p> : (
          <div class="space-y-2 mb-4">
            {years.map((y: any) => (
              <div class="flex flex-wrap items-center gap-2 bg-slate-50 border border-slate-200 rounded p-2 text-sm">
                <form method="post" action={`/admin/district/school-years/${y.id}/update`} class="flex flex-wrap items-center gap-2 flex-1">
                  <input name="label" value={y.label} class="border rounded px-2 py-1 text-sm w-28" />
                  <input type="date" name="start_date" value={y.start_date} class="border rounded px-2 py-1 text-sm" />
                  <span class="text-xs text-slate-400">→</span>
                  <input type="date" name="end_date" value={y.end_date} class="border rounded px-2 py-1 text-sm" />
                  {y.is_current ? <span class="text-xs text-emerald-700 ml-2"><i class="fas fa-check-circle mr-1"></i>Current</span> : <span class="text-xs text-slate-400 ml-2">—</span>}
                  <button class="ml-auto text-xs bg-aps-navy text-white px-2 py-1 rounded hover:bg-aps-blue"><i class="fas fa-save mr-1"></i>Save</button>
                </form>
                {!y.is_current ? (
                  <form method="post" action={`/admin/district/school-years/${y.id}/set-current`}>
                    <button class="text-xs px-2 py-1 rounded border border-emerald-600 text-emerald-700 hover:bg-emerald-50"><i class="fas fa-star mr-1"></i>Set current</button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}

        <form method="post" action="/admin/district/school-years/create" class="flex flex-wrap items-end gap-2 bg-slate-50 border border-slate-200 rounded p-3">
          <label class="text-xs"><span class="block text-slate-600 mb-1">Label</span><input name="label" placeholder="2026-2027" class="border rounded px-2 py-1 text-sm" /></label>
          <label class="text-xs"><span class="block text-slate-600 mb-1">Start date</span><input type="date" name="start_date" class="border rounded px-2 py-1 text-sm" /></label>
          <label class="text-xs"><span class="block text-slate-600 mb-1">End date</span><input type="date" name="end_date" class="border rounded px-2 py-1 text-sm" /></label>
          <button class="bg-aps-navy text-white px-3 py-1.5 rounded text-sm hover:bg-aps-blue"><i class="fas fa-plus mr-1"></i>Add school year</button>
        </form>
      </Card>
    </Layout>
  );
}

// ============================================================================
// IMPORT / EXPORT VIEWS
// ============================================================================

function ImportUsersPage({ user, msg, result, schools }: any) {
  return (
    <Layout title="Bulk import users" user={user} activeNav="admin-import">
      <div class="mb-4"><a href="/admin/users" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>Back to users</a></div>
      <h1 class="font-display text-2xl text-aps-navy mb-1">Bulk import users</h1>
      <p class="text-slate-600 text-sm mb-4">Add or update many teachers, principals, coaches, or administrators at once from a CSV file. Existing users (matched by email) are updated; new emails are created with a default password and forced to change it on first login.</p>

      {msg && <div class="mb-4 p-3 rounded bg-amber-50 border border-amber-200 text-amber-800 text-sm whitespace-pre-wrap">{msg}</div>}
      {result && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm whitespace-pre-wrap">{result}</div>}

      <Card title="Step 1 — Download the template" icon="fas fa-file-csv" data-tour="import-users-template">
        <p class="text-sm text-slate-600 mb-3">The template already contains the exact header row the importer expects. Fill in your users, keep the column names unchanged, and save as CSV.</p>
        <a href="/admin/import/users/template" class="inline-flex items-center gap-2 bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-download"></i>Download users_import_template.csv</a>
        <div class="mt-4 text-xs">
          <div class="font-semibold text-aps-navy mb-1">Columns (all required in the header, even if blank in a row):</div>
          <ul class="list-disc pl-5 space-y-0.5 text-slate-700">
            <li><code>first_name</code>, <code>last_name</code> — required on every row.</li>
            <li><code>email</code> — required, unique. Matching email = update existing user.</li>
            <li><code>role</code> — required. One of: <code>teacher</code>, <code>appraiser</code>, <code>coach</code>, <code>superintendent</code>, <code>super_admin</code>.</li>
            <li><code>title</code> — e.g. "2nd Grade", "Elementary Principal". Optional.</li>
            <li><code>phone</code> — optional.</li>
            <li><code>school_names</code> — ONE school name, OR a <strong>pipe-separated list</strong> for users who work at several buildings (e.g. <code>Alexander Elementary | Alexander Junior/Senior High</code>). Names must exactly match existing schools (case-insensitive). The first name in the list becomes the "primary" school. If blank or no match, user is created without a school assignment. Existing schools: {schools.length === 0 ? <em>(none defined yet)</em> : schools.map((s: any, i: number) => <span><code>{s.name}</code>{i < schools.length - 1 ? ', ' : ''}</span>)}. Legacy column name <code>school_name</code> is still accepted.</li>
            <li><code>password</code> — optional initial password. If blank, defaults to <code>Alexander2026!</code>. User is always forced to change on first login.</li>
            <li><code>active</code> — <code>yes</code>/<code>no</code> (default <code>yes</code>).</li>
          </ul>
        </div>
      </Card>

      <Card title="Step 2 — Upload your filled-out CSV" icon="fas fa-upload" class="mt-4">
        <form method="post" action="/admin/import/users" enctype="multipart/form-data" class="space-y-3">
          <input type="file" name="csv" accept=".csv,text/csv" required class="block text-sm" />
          <label class="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="dry_run" value="1" />
            Dry run (preview counts without writing to the database)
          </label>
          <div class="flex items-center gap-2">
            <button class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-cloud-arrow-up mr-1"></i>Upload &amp; import</button>
            <span class="text-xs text-slate-500">Imports are atomic per-row: errors in one row never stop the others.</span>
          </div>
        </form>
      </Card>
    </Layout>
  );
}

function ImportRubricPage({ user, msg, result, framework }: any) {
  return (
    <Layout title="Bulk import rubric" user={user} activeNav="admin-import">
      <div class="mb-4"><a href="/admin/framework" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>Back to framework</a></div>
      <h1 class="font-display text-2xl text-aps-navy mb-1">Bulk import / replace rubric</h1>
      <p class="text-slate-600 text-sm mb-4">Update the Marshall Rubric (or any district rubric) in bulk from a CSV file. Use this when the framework is revised, when you want to switch to a different evaluation model, or when authoring the full pedagogy library offline.</p>

      {msg && <div class="mb-4 p-3 rounded bg-amber-50 border border-amber-200 text-amber-800 text-sm whitespace-pre-wrap">{msg}</div>}
      {result && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm whitespace-pre-wrap">{result}</div>}

      <Card title="Step 1 — Download a template" icon="fas fa-file-csv">
        <p class="text-sm text-slate-600 mb-3">Download either a blank template or an export of the currently-active rubric (recommended — it has every existing domain, indicator, descriptor, and pedagogy cell pre-filled so you can edit only what changed).</p>
        <div class="flex flex-wrap gap-2">
          <a href="/admin/import/rubric/template" class="inline-flex items-center gap-2 bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-download"></i>Blank template CSV</a>
          <a href="/admin/import/rubric/export" class="inline-flex items-center gap-2 bg-white border border-aps-navy text-aps-navy px-4 py-2 rounded hover:bg-slate-50 text-sm"><i class="fas fa-file-export"></i>Export current rubric ({(framework as any)?.name || 'none'})</a>
        </div>
        <div class="mt-4 text-xs">
          <div class="font-semibold text-aps-navy mb-1">Row format — one row per (domain, indicator, level). Four rows per indicator is typical (levels 4, 3, 2, 1).</div>
          <ul class="list-disc pl-5 space-y-0.5 text-slate-700">
            <li><code>domain_code</code>, <code>domain_name</code>, <code>domain_description</code>, <code>domain_sort_order</code> — the domain this indicator belongs to.</li>
            <li><code>indicator_code</code>, <code>indicator_name</code>, <code>indicator_prompt</code>, <code>indicator_sort_order</code> — the indicator row.</li>
            <li><code>level</code> (1-4), <code>level_label</code>, <code>descriptor</code> — the Kim Marshall-style cell text for that level.</li>
            <li><code>interpretation</code> — plain-language meaning of this score (optional).</li>
            <li><code>evidence_signals</code>, <code>teacher_next_moves</code>, <code>coaching_considerations</code>, <code>resources</code> — <strong>pipe-separated lists</strong> (e.g. <code>Item 1 | Item 2 | Item 3</code>).</li>
            <li><code>feedback_starter</code> — seed sentence used when auto-generating feedback (optional).</li>
          </ul>
        </div>
      </Card>

      <Card title="Step 2 — Upload your edited CSV" icon="fas fa-upload" class="mt-4">
        <form method="post" action="/admin/import/rubric" enctype="multipart/form-data" class="space-y-3">
          <input type="file" name="csv" accept=".csv,text/csv" required class="block text-sm" />
          <div class="grid md:grid-cols-2 gap-3 text-sm">
            <label>Framework name (only used when replacing)<input name="framework_name" placeholder="e.g. Kim Marshall Rubric (2026 revision)" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
            <label>Framework version (only used when replacing)<input name="framework_version" placeholder="e.g. 2026" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
          </div>
          <label class="flex items-start gap-2 text-sm text-slate-700">
            <input type="checkbox" name="replace_existing" value="1" class="mt-1" />
            <span><strong>Create a new active framework</strong> (keeps the previous one in history for past observations). Leave unchecked to update the current framework in place.</span>
          </label>
          <label class="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" name="dry_run" value="1" />
            Dry run (preview counts without writing to the database)
          </label>
          <div class="flex items-center gap-2">
            <button class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-cloud-arrow-up mr-1"></i>Upload &amp; import</button>
            <span class="text-xs text-slate-500">Existing indicators are matched by (domain_code, indicator_code); descriptors and pedagogy cells are upserted per level.</span>
          </div>
        </form>
      </Card>

      <Card title="Prefer the single-cell editor?" icon="fas fa-pen-to-square" class="mt-4">
        <p class="text-sm text-slate-600">For one-off edits to a single indicator/level cell, use the built-in editor at <a href="/admin/pedagogy" class="text-aps-blue hover:underline">Pedagogy Library</a>. The bulk importer is for large revisions.</p>
      </Card>
    </Layout>
  );
}

// ------------------------------------------------------------------
// Data Management view — wipe demo data, delete single observations.
// ------------------------------------------------------------------
function DataManagementPage({ user, counts, rows, schools, audit, softDelete, msg }: any) {
  return (
    <Layout title="Data Management" user={user} activeNav="data">
      <div class="flex items-start justify-between mb-1">
        <h1 class="font-display text-2xl text-aps-navy">Data Management</h1>
        <a href="/admin/data/audit-log" class="text-sm text-aps-blue hover:underline mt-1"><i class="fas fa-list-check mr-1"></i>Full admin audit log</a>
      </div>
      <p class="text-slate-600 text-sm mb-4">Edit or delete observations, mass-delete by filter, reset practice / demo data, and toggle soft-delete. Users, schools, rubric, and pedagogy library are <strong>never</strong> touched by the actions below.</p>
      {msg ? <div class="mb-4 p-3 rounded bg-amber-50 border border-amber-200 text-amber-900 text-sm whitespace-pre-wrap">{msg}</div> : null}

      <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        <div class="bg-white border border-slate-200 rounded-md p-4"><div class="text-xs text-slate-500">Observations</div><div class="text-2xl font-display text-aps-navy">{counts.observations || 0}</div>{counts.observations_soft_deleted ? <div class="text-[11px] text-amber-700 mt-1">{counts.observations_soft_deleted} soft-deleted</div> : null}</div>
        <div class="bg-white border border-slate-200 rounded-md p-4"><div class="text-xs text-slate-500">Scores</div><div class="text-2xl font-display text-aps-navy">{counts.scores || 0}</div></div>
        <div class="bg-white border border-slate-200 rounded-md p-4"><div class="text-xs text-slate-500">PD Enrollments</div><div class="text-2xl font-display text-aps-navy">{counts.pd_enrollments || 0}</div>{counts.pd_enrollments_soft_deleted ? <div class="text-[11px] text-amber-700 mt-1">{counts.pd_enrollments_soft_deleted} soft-deleted</div> : null}</div>
        <div class="bg-white border border-slate-200 rounded-md p-4"><div class="text-xs text-slate-500">External PD</div><div class="text-2xl font-display text-aps-navy">{counts.external_pd || 0}</div>{counts.external_pd_soft_deleted ? <div class="text-[11px] text-amber-700 mt-1">{counts.external_pd_soft_deleted} soft-deleted</div> : null}</div>
        <div class="bg-white border border-slate-200 rounded-md p-4"><div class="text-xs text-slate-500">Activity log</div><div class="text-2xl font-display text-aps-navy">{counts.activity_log || 0}</div></div>
        <div class="bg-white border border-slate-200 rounded-md p-4"><div class="text-xs text-slate-500">Admin audit</div><div class="text-2xl font-display text-aps-navy">{counts.admin_audit_log || 0}</div></div>
      </div>

      {/* ===== Soft-delete toggle ===== */}
      <Card title="Soft-delete mode" icon="fas fa-shield-halved">
        <div class="md:flex md:items-center md:justify-between gap-4">
          <div class="text-sm text-slate-700">
            <p class="mb-1">When <strong>ON</strong>, every delete action below writes a <code class="bg-slate-100 px-1 rounded">deleted_at</code> timestamp instead of removing the row. Records stay queryable for forensics and can be restored from this page.</p>
            <p class="text-xs text-slate-500">When <strong>OFF</strong>, deletes are permanent (existing behavior). The <em>Clear all demo data</em> button always performs a hard wipe regardless of this setting.</p>
          </div>
          <form method="post" action="/admin/data/soft-delete-toggle" class="mt-3 md:mt-0 shrink-0">
            <input type="hidden" name="enabled" value={softDelete ? '0' : '1'} />
            <span class={`inline-flex items-center text-xs px-2 py-0.5 rounded-full border mr-3 ${softDelete ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : 'bg-slate-100 border-slate-300 text-slate-700'}`}>
              <i class={`fas ${softDelete ? 'fa-circle-check' : 'fa-circle-xmark'} mr-1`}></i>
              {softDelete ? 'Soft-delete ENABLED' : 'Soft-delete DISABLED'}
            </span>
            <button class={`${softDelete ? 'bg-slate-600 hover:bg-slate-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white px-3 py-1.5 rounded text-sm`}>
              <i class={`fas ${softDelete ? 'fa-toggle-off' : 'fa-toggle-on'} mr-1`}></i>
              Turn {softDelete ? 'OFF' : 'ON'}
            </button>
          </form>
        </div>
      </Card>

      {/* ===== Filtered delete + Reset practice data ===== */}
      <div class="grid md:grid-cols-2 gap-4 mt-6">
        <Card title="Filtered delete" icon="fas fa-filter">
          <p class="text-sm text-slate-600 mb-3">Delete observations matching one or more filters. Honors the soft-delete setting above. Every action is recorded in the admin audit log.</p>
          <form method="post" action="/admin/data/filtered-delete" onsubmit="return confirm('Delete all observations matching these filters? This action is recorded in the admin audit log.')">
            <label class="block text-xs text-slate-600 mb-1 mt-2">School</label>
            <select name="school_id" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
              <option value="">(any school)</option>
              {schools.map((s: any) => <option value={s.id}>{s.name}</option>)}
            </select>
            <div class="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label class="block text-xs text-slate-600 mb-1">Observed from</label>
                <input type="date" name="date_from" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label class="block text-xs text-slate-600 mb-1">Observed to</label>
                <input type="date" name="date_to" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm" />
              </div>
            </div>
            <label class="block text-xs text-slate-600 mb-1 mt-2">Observer role</label>
            <select name="observer_role" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
              <option value="">(any role)</option>
              <option value="appraiser">Appraiser</option>
              <option value="coach">Coach</option>
              <option value="superintendent">Superintendent</option>
            </select>
            <label class="block text-xs text-slate-600 mb-1 mt-3">Type <code class="bg-slate-100 px-1">DELETE FILTERED</code> to confirm</label>
            <input name="confirm" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm mb-2" autocomplete="off" />
            <button class="bg-amber-700 text-white px-3 py-1.5 rounded text-sm hover:bg-amber-800"><i class="fas fa-filter-circle-xmark mr-1"></i>Apply filtered delete</button>
          </form>
        </Card>
        <Card title="Reset practice data" icon="fas fa-rotate-left">
          <p class="text-sm text-slate-600 mb-3">Wipes PD enrollments, deliverables, external PD submissions, and teacher goals — <strong>without</strong> touching observations, users, schools, rubric, or pedagogy library. Honors the soft-delete setting above. Use this to reset PD-system practice data after staff training.</p>
          <form method="post" action="/admin/data/reset-practice-data" onsubmit="return confirm('Reset all PD enrollments, deliverables, external PD, and teacher goals?')">
            <label class="block text-xs text-slate-600 mb-1">Type <code class="bg-slate-100 px-1">RESET PRACTICE DATA</code> to confirm</label>
            <input name="confirm" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm mb-2" autocomplete="off" />
            <button class="bg-sky-700 text-white px-3 py-1.5 rounded text-sm hover:bg-sky-800"><i class="fas fa-rotate-left mr-1"></i>Reset practice data</button>
          </form>
        </Card>
      </div>

      {/* ===== Recent audit-log preview ===== */}
      <div class="mt-6">
        <Card title="Recent admin audit entries" icon="fas fa-clipboard-list">
          {audit.length === 0 ? (
            <p class="text-sm text-slate-500">No high-trust mutations yet.</p>
          ) : (<>
            <div class="flex items-center justify-end mb-1"><button type="button" data-sort-reset="admin-data-recent-audit" class="text-xs text-slate-500 hover:text-aps-navy hover:underline"><i class="fas fa-rotate-left mr-1"></i>Reset sort</button></div>
            <p class="text-[11px] text-slate-500 mb-2"><i class="fas fa-circle-info mr-1"></i>Click any column header to sort. Shift-click for multi-column sort.</p>
            <div class="overflow-x-auto"><table id="admin-data-recent-audit" data-sortable="true" class="w-full text-sm">
              <thead class="text-left text-xs text-slate-500 border-b border-slate-200">
                <tr><th class="py-2" data-sort-type="date">When</th><th data-sort-type="text">Actor</th><th data-sort-type="text">Action</th><th data-sort-type="text">Entity</th><th class="text-right" data-sort-type="number">Rows</th><th data-sort-type="text">Detail</th></tr>
              </thead>
              <tbody>
                {audit.map((a: any) => (
                  <tr class="border-b border-slate-100 align-top">
                    <td class="py-2 text-xs text-slate-500 whitespace-nowrap" data-sort-value={a.created_at || ''}>{formatDateTime(a.created_at)}</td>
                    <td class="text-xs">{a.first_name ? `${a.first_name} ${a.last_name}` : `#${a.actor_user_id}`} <span class="text-slate-400">({a.role || '—'})</span></td>
                    <td class="text-xs font-mono">{a.action}</td>
                    <td class="text-xs">{a.entity_type || '—'}</td>
                    <td class="text-xs text-right">{a.row_count || 0}</td>
                    <td class="text-xs text-slate-600">{a.detail || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </>)}
          <div class="mt-3 text-right"><a href="/admin/data/audit-log" class="text-sm text-aps-blue hover:underline">See full audit log →</a></div>
        </Card>
      </div>

      {/* ===== Observation table ===== */}
      <div class="mt-6">
      <Card title="All observations (latest 200, including soft-deleted)" icon="fas fa-list">
        {rows.length === 0 ? (
          <p class="text-sm text-slate-500">No observations currently exist in the database.</p>
        ) : (<>
          <div class="flex items-center justify-end mb-1"><button type="button" data-sort-reset="admin-all-observations" class="text-xs text-slate-500 hover:text-aps-navy hover:underline"><i class="fas fa-rotate-left mr-1"></i>Reset sort</button></div>
          <p class="text-[11px] text-slate-500 mb-2"><i class="fas fa-circle-info mr-1"></i>Click any column header to sort. Shift-click for multi-column sort.</p>
          <div class="overflow-x-auto"><table id="admin-all-observations" data-sortable="true" class="w-full text-sm">
            <thead class="text-left text-xs text-slate-500 border-b border-slate-200">
              <tr><th class="py-2" data-sort-type="number">ID</th><th data-sort-type="text">Type</th><th data-sort-type="text">Teacher</th><th data-sort-type="text">Observer</th><th data-sort-type="text">School</th><th data-sort-type="date">When</th><th data-sort-type="text">Status</th><th data-sort-disable="true"></th></tr>
            </thead>
            <tbody>
              {rows.map((o: any) => (
                <tr class={`border-b border-slate-100 ${o.deleted_at ? 'opacity-60 bg-amber-50/40' : ''}`}>
                  <td class="py-2 text-slate-500 text-xs" data-sort-value={o.id}>#{o.id}</td>
                  <td class="capitalize text-xs">{String(o.observation_type || '').replace('_',' ')}</td>
                  <td class="text-xs">{o.t_first} {o.t_last}</td>
                  <td class="text-xs">{o.a_first} {o.a_last} <span class="text-slate-400">({o.a_role})</span></td>
                  <td class="text-xs text-slate-500">{o.school_name || '—'}</td>
                  <td class="text-xs text-slate-500" data-sort-value={o.observed_at || ''}>{formatDateTime(o.observed_at)}</td>
                  <td>
                    {o.deleted_at
                      ? <span class="text-xs px-2 py-0.5 rounded-full border bg-amber-50 border-amber-300 text-amber-800">soft-deleted</span>
                      : <span class={`text-xs px-2 py-0.5 rounded-full border ${o.status === 'published' ? 'bg-emerald-50 border-emerald-300 text-emerald-800' : o.status === 'acknowledged' ? 'bg-teal-50 border-teal-300 text-teal-800' : 'bg-slate-100 border-slate-200 text-slate-700'}`}>{o.status}</span>}
                  </td>
                  <td class="text-right whitespace-nowrap">
                    <a href={`/appraiser/observations/${o.id}`} class="text-xs text-aps-blue hover:underline mr-3"><i class="fas fa-eye mr-1"></i>View</a>
                    {o.deleted_at ? (
                      <form method="post" action={`/admin/data/observations/${o.id}/restore`} class="inline">
                        <button class="text-xs text-emerald-700 hover:underline"><i class="fas fa-rotate-left mr-1"></i>Restore</button>
                      </form>
                    ) : (
                      <form method="post" action={`/admin/data/observations/${o.id}/delete`} class="inline" onsubmit="return confirm('Delete this observation? (Honors the soft-delete setting above.)')">
                        <button class="text-xs text-red-700 hover:underline"><i class="fas fa-trash mr-1"></i>Delete</button>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>)}
      </Card>
      </div>

      {/* ===== Clear all ===== */}
      <div class="grid md:grid-cols-2 gap-4 mt-6">
        <Card title="Clear all observations" icon="fas fa-broom">
          <p class="text-sm text-slate-600 mb-3">Wipes every observation, score, feedback item, and focus area in one action. Honors the soft-delete setting (so by default, observations are <em>marked</em> as deleted, not removed). <strong>Users, schools, rubric, and pedagogy library are preserved.</strong></p>
          <form method="post" action="/admin/data/clear-observations" onsubmit="return confirm('Really clear ALL observation data? Honors the soft-delete setting above.')">
            <label class="block text-xs text-slate-600 mb-1">Type <code class="bg-slate-100 px-1">CLEAR OBSERVATIONS</code> to confirm</label>
            <input name="confirm" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm mb-2" autocomplete="off" />
            <button class="bg-amber-600 text-white px-3 py-1.5 rounded text-sm hover:bg-amber-700"><i class="fas fa-broom mr-1"></i>Clear observations</button>
          </form>
        </Card>
        <Card title="Hard-wipe all demo data" icon="fas fa-eraser">
          <p class="text-sm text-slate-600 mb-3">Permanently wipes all observations <em>plus</em> the activity log — <strong>regardless</strong> of the soft-delete setting. Does not touch users, schools, rubric, or pedagogy library. Use this right before handing the live site to the district.</p>
          <form method="post" action="/admin/data/clear-all-demo" onsubmit="return confirm('Really HARD-WIPE all demo observation data AND the activity log? This cannot be undone.')">
            <label class="block text-xs text-slate-600 mb-1">Type <code class="bg-slate-100 px-1">CLEAR ALL DEMO DATA</code> to confirm</label>
            <input name="confirm" class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm mb-2" autocomplete="off" />
            <button class="bg-red-700 text-white px-3 py-1.5 rounded text-sm hover:bg-red-800"><i class="fas fa-eraser mr-1"></i>Clear all demo data</button>
          </form>
        </Card>
      </div>
    </Layout>
  );
}

// ----------------------------------------------------------------------------
// Fix 8 — Full admin-audit-log viewer page.
// ----------------------------------------------------------------------------
function AdminAuditLogPage({ user, rows }: any) {
  return (
    <Layout title="Admin Audit Log" user={user} activeNav="data">
      <div class="flex items-start justify-between mb-1">
        <h1 class="font-display text-2xl text-aps-navy">Admin Audit Log</h1>
        <a href="/admin/data" class="text-sm text-aps-blue hover:underline mt-1"><i class="fas fa-arrow-left mr-1"></i>Back to Data Management</a>
      </div>
      <p class="text-slate-600 text-sm mb-4">High-trust mutations performed from the Data Management page. Filters and affected row ids are recorded for compliance review.</p>

      <Card title={`Recent ${rows.length} entries`} icon="fas fa-clipboard-list">
        {rows.length === 0 ? (
          <p class="text-sm text-slate-500">No admin audit entries yet.</p>
        ) : (<>
          <div class="flex items-center justify-end mb-1"><button type="button" data-sort-reset="admin-audit-log" class="text-xs text-slate-500 hover:text-aps-navy hover:underline"><i class="fas fa-rotate-left mr-1"></i>Reset sort</button></div>
          <p class="text-[11px] text-slate-500 mb-2"><i class="fas fa-circle-info mr-1"></i>Click any column header to sort. Shift-click for multi-column sort.</p>
          <div class="overflow-x-auto"><table id="admin-audit-log" data-sortable="true" class="w-full text-sm">
            <thead class="text-left text-xs text-slate-500 border-b border-slate-200">
              <tr><th class="py-2" data-sort-type="date">When</th><th data-sort-type="text">Actor</th><th data-sort-type="text">Action</th><th data-sort-type="text">Entity</th><th class="text-right" data-sort-type="number">Rows</th><th data-sort-type="text">Filters</th><th data-sort-disable="true">IDs (first 100)</th><th data-sort-type="text">Detail</th></tr>
            </thead>
            <tbody>
              {rows.map((a: any) => {
                let filters: any = null; let ids: any = null;
                try { filters = a.filters ? JSON.parse(a.filters) : null; } catch {}
                try { ids = a.entity_ids ? JSON.parse(a.entity_ids) : null; } catch {}
                return (
                  <tr class="border-b border-slate-100 align-top">
                    <td class="py-2 text-xs text-slate-500 whitespace-nowrap" data-sort-value={a.created_at || ''}>{formatDateTime(a.created_at)}</td>
                    <td class="text-xs">{a.first_name ? `${a.first_name} ${a.last_name}` : `#${a.actor_user_id}`} <span class="text-slate-400">({a.role || '—'})</span></td>
                    <td class="text-xs font-mono">{a.action}</td>
                    <td class="text-xs">{a.entity_type || '—'}</td>
                    <td class="text-xs text-right">{a.row_count || 0}</td>
                    <td class="text-xs text-slate-600 max-w-[14rem]"><pre class="whitespace-pre-wrap break-words font-mono text-[11px]">{filters ? JSON.stringify(filters) : ''}</pre></td>
                    <td class="text-xs text-slate-600 max-w-[12rem]"><pre class="whitespace-pre-wrap break-words font-mono text-[11px]">{ids ? (ids as number[]).slice(0,20).join(', ') + ((ids as number[]).length > 20 ? '…' : '') : ''}</pre></td>
                    <td class="text-xs text-slate-600">{a.detail || ''}</td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        </>)}
      </Card>
    </Layout>
  );
}

// ----------------------------------------------------------------------------
// Fix 5 — Admin audit view for external PD submissions.
// Read-only district-wide list. Admins do NOT take review action here (that
// happens on the appraiser page); this view exists for compliance + insight.
// ----------------------------------------------------------------------------

function extPdAuditPill(status: string) {
  switch (status) {
    case 'submitted':       return { label: 'Awaiting', icon: 'fa-hourglass-half', color: 'bg-amber-50 text-amber-800 border-amber-200' };
    case 'approved':        return { label: 'Approved', icon: 'fa-circle-check',   color: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
    case 'declined':        return { label: 'Declined', icon: 'fa-circle-xmark',   color: 'bg-red-50 text-red-800 border-red-200' };
    case 'needs_revision':  return { label: 'Revising', icon: 'fa-rotate-left',    color: 'bg-sky-50 text-sky-800 border-sky-200' };
    default:                return { label: status,     icon: 'fa-circle',         color: 'bg-slate-50 text-slate-700 border-slate-200' };
  }
}

function AdminExternalPdAudit({ user, rows, filterStatus }: any) {
  const submitted = rows.filter((r: any) => r.status === 'submitted').length;
  const revising  = rows.filter((r: any) => r.status === 'needs_revision').length;
  const approved  = rows.filter((r: any) => r.status === 'approved');
  const approvedHoursTotal = approved.reduce((s: number, r: any) => s + Number(r.approved_hours || 0), 0);
  return (
    <Layout title="External PD audit" user={user} activeNav="admin-ext-pd">
      <h1 class="font-display text-2xl text-aps-navy mb-1"><i class="fas fa-clipboard-list mr-2"></i>External PD audit</h1>
      <p class="text-slate-600 text-sm mb-4">
        District-wide ledger of every external PD submission (conferences, workshops, outside-LMS PD).
        Approval / decline / revision happens on the <a href="/appraiser/external-pd" class="text-aps-blue hover:underline">appraiser review queue</a>;
        this page is read-only for super-admins to monitor compliance.
      </p>

      <div class="grid sm:grid-cols-4 gap-3 mb-4">
        <div class="rounded-md border border-slate-200 bg-white p-3">
          <div class="text-xs text-slate-500">Total submissions</div>
          <div class="text-2xl font-bold text-aps-navy">{rows.length}</div>
        </div>
        <div class="rounded-md border border-amber-200 bg-amber-50 p-3">
          <div class="text-xs text-amber-700">Awaiting review</div>
          <div class="text-2xl font-bold text-amber-800">{submitted}</div>
        </div>
        <div class="rounded-md border border-sky-200 bg-sky-50 p-3">
          <div class="text-xs text-sky-700">Needs revision</div>
          <div class="text-2xl font-bold text-sky-800">{revising}</div>
        </div>
        <div class="rounded-md border border-emerald-200 bg-emerald-50 p-3">
          <div class="text-xs text-emerald-700">Approved hours (district)</div>
          <div class="text-2xl font-bold text-emerald-800">{approvedHoursTotal.toFixed(2)}h</div>
        </div>
      </div>

      <div class="mb-4 flex flex-wrap gap-2 text-xs">
        <a href="/admin/external-pd" class={`px-3 py-1.5 rounded border ${!filterStatus ? 'bg-aps-navy text-white border-aps-navy' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>All</a>
        <a href="/admin/external-pd?status=submitted" class={`px-3 py-1.5 rounded border ${filterStatus === 'submitted' ? 'bg-aps-navy text-white border-aps-navy' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>Awaiting</a>
        <a href="/admin/external-pd?status=needs_revision" class={`px-3 py-1.5 rounded border ${filterStatus === 'needs_revision' ? 'bg-aps-navy text-white border-aps-navy' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>Revising</a>
        <a href="/admin/external-pd?status=approved" class={`px-3 py-1.5 rounded border ${filterStatus === 'approved' ? 'bg-aps-navy text-white border-aps-navy' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>Approved</a>
        <a href="/admin/external-pd?status=declined" class={`px-3 py-1.5 rounded border ${filterStatus === 'declined' ? 'bg-aps-navy text-white border-aps-navy' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>Declined</a>
      </div>

      {rows.length === 0 ? (
        <Card><p class="text-sm text-slate-500">No external PD submissions match this filter.</p></Card>
      ) : (
        <Card>
          <div class="flex items-center justify-end mb-1"><button type="button" data-sort-reset="admin-external-pd-audit" class="text-xs text-slate-500 hover:text-aps-navy hover:underline"><i class="fas fa-rotate-left mr-1"></i>Reset sort</button></div>
          <p class="text-[11px] text-slate-500 mb-2"><i class="fas fa-circle-info mr-1"></i>Click any column header to sort. Shift-click for multi-column sort. Hours sort numerically.</p>
          <div class="overflow-x-auto">
            <table id="admin-external-pd-audit" data-sortable="true" class="w-full text-sm">
              <thead>
                <tr class="text-left border-b border-slate-200 text-slate-600">
                  <th class="py-2" data-sort-type="text">Teacher</th>
                  <th data-sort-type="text">School</th>
                  <th data-sort-type="text">Activity</th>
                  <th data-sort-type="text">Provider</th>
                  <th class="text-right" data-sort-type="number">Hrs (self)</th>
                  <th class="text-right" data-sort-type="number">Hrs (apr)</th>
                  <th data-sort-type="text">Status</th>
                  <th data-sort-type="text">Reviewer</th>
                  <th data-sort-type="date">Submitted</th>
                  <th data-sort-disable="true"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => {
                  const pill = extPdAuditPill(r.status);
                  return (
                    <tr class="border-b border-slate-100 hover:bg-slate-50">
                      <td class="py-2">{r.teacher_first} {r.teacher_last}</td>
                      <td class="text-slate-600 text-xs">{r.school_name || '—'}</td>
                      <td>{r.title}</td>
                      <td class="text-slate-600">{r.provider || '—'}</td>
                      <td class="text-right tabular-nums">{Number(r.hours).toFixed(2)}</td>
                      <td class="text-right tabular-nums">{r.approved_hours != null ? Number(r.approved_hours).toFixed(2) : <span class="text-slate-300">—</span>}</td>
                      <td><span class={`text-xs px-2 py-0.5 rounded-full border ${pill.color}`}><i class={`fas ${pill.icon} mr-1`}></i>{pill.label}</span></td>
                      <td class="text-xs text-slate-600">{r.reviewer_first ? `${r.reviewer_first} ${r.reviewer_last}` : <span class="text-slate-400 italic">—</span>}</td>
                      <td class="text-xs text-slate-500" data-sort-value={r.submitted_at || ''}>{formatDate(r.submitted_at)}</td>
                      <td><a href={`/appraiser/external-pd/${r.id}`} class="text-aps-blue hover:underline text-xs">View <i class="fas fa-chevron-right"></i></a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </Layout>
  );
}

// ----------------------------------------------------------------------------
// Fix 6 — Admin settings page for the annual PD-hours target.
// Single-knob page on purpose: this number drives the heat-map on the
// superintendent + appraiser + teacher views, so a misclick has wide
// downstream effects. Keeping it dedicated and simple reduces that risk.
// ----------------------------------------------------------------------------

function PdHoursSettingsPage({ user, target, msg }: any) {
  return (
    <Layout title="PD-hours target" user={user} activeNav="admin-pd-hours">
      <div class="mb-3"><a href="/admin" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>Admin overview</a></div>
      <h1 class="font-display text-2xl text-aps-navy mb-1"><i class="fas fa-stopwatch mr-2"></i>Annual PD-hours target</h1>
      <p class="text-slate-600 text-sm mb-4">
        Sets the per-teacher goal that powers the unified PD-hours heat-map on the superintendent, appraiser, and teacher dashboards.
        The default is <strong>22.5h</strong> (Title II district policy). Edits apply immediately — there is no scheduled rollover.
      </p>
      {msg && <div class="mb-3 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}
      <Card title="Target" icon="fas fa-bullseye">
        <form method="post" action="/admin/settings/pd-hours" class="flex flex-wrap items-end gap-3">
          <label class="block text-sm">
            <span class="block text-slate-700 mb-1 font-medium">Hours per teacher per school year</span>
            <input type="number" name="target" step="0.25" min="0" max="1000" value={Number(target).toFixed(2)}
              class="w-32 border border-slate-300 rounded px-2 py-1.5 text-sm" required />
          </label>
          <button class="bg-aps-navy hover:bg-aps-blue text-white px-3 py-1.5 rounded text-sm"><i class="fas fa-save mr-1"></i>Save target</button>
        </form>
        <p class="text-xs text-slate-500 mt-3"><i class="fas fa-circle-info mr-1"></i>The heat-map colors at:
          {' '}<span class="px-1 rounded bg-red-100 text-red-800">&lt; 33%</span> low,
          {' '}<span class="px-1 rounded bg-amber-100 text-amber-800">33-65%</span> mid,
          {' '}<span class="px-1 rounded bg-sky-100 text-sky-800">66-99%</span> near goal,
          {' '}<span class="px-1 rounded bg-emerald-100 text-emerald-800">≥ 100%</span> met.
        </p>
      </Card>
    </Layout>
  );
}
