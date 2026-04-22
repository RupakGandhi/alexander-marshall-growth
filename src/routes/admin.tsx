import { Hono } from 'hono';
import type { Bindings, Variables, UserRole } from '../lib/types';
import { Layout, Card, Button } from '../lib/layout';
import { requireRole, hashPassword } from '../lib/auth';
import { getDomainsWithIndicators, getActiveFramework, logActivity } from '../lib/db';
import { formatDate, formatDateTime, levelLabels, levelColor } from '../lib/ui';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use('*', requireRole(['super_admin']));

// ---------- Admin overview ----------
app.get('/', async (c) => {
  const user = c.get('user')!;
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
  return c.html(<AdminHome user={user} byRole={byRole} byStatus={byStatus} recent={recent.results || []} />);
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
  return c.html(<UsersPage user={user} rows={rows.results || []} schools={schools.results || []} q={q} roleFilter={roleFilter} msg={msg} />);
});

app.post('/users/create', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const email = String(body.email || '').trim().toLowerCase();
  const first = String(body.first_name || '').trim();
  const last = String(body.last_name || '').trim();
  const role = String(body.role || '') as UserRole;
  const title = String(body.title || '').trim() || null;
  const phone = String(body.phone || '').trim() || null;
  const school_id = body.school_id ? Number(body.school_id) : null;
  const pw = String(body.password || 'Alexander2026!');
  if (!email || !first || !last || !role) return c.redirect('/admin/users?msg=Missing+fields');
  const hash = await hashPassword(pw);
  try {
    const res = await c.env.DB.prepare(
      `INSERT INTO users (district_id, school_id, email, password_hash, first_name, last_name, role, title, phone, active, must_change_password)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1)`
    ).bind(school_id, email, hash, first, last, role, title, phone).run();
    await logActivity(c.env.DB, user.id, 'user', Number((res.meta as any)?.last_row_id), 'create_user', { email, role });
    return c.redirect(`/admin/users?msg=Created+${encodeURIComponent(first+' '+last)}`);
  } catch (e: any) {
    return c.redirect('/admin/users?msg=' + encodeURIComponent('Could not create user: ' + (e.message || e)));
  }
});

app.post('/users/:id/update', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const body = await c.req.parseBody();
  const first = String(body.first_name || '').trim();
  const last = String(body.last_name || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const role = String(body.role || '');
  const title = String(body.title || '').trim() || null;
  const phone = String(body.phone || '').trim() || null;
  const school_id = body.school_id ? Number(body.school_id) : null;
  const active = body.active ? 1 : 0;
  await c.env.DB.prepare(
    `UPDATE users SET first_name=?, last_name=?, email=?, role=?, title=?, phone=?, school_id=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(first, last, email, role, title, phone, school_id, active, id).run();
  await logActivity(c.env.DB, user.id, 'user', id, 'update_user');
  return c.redirect('/admin/users?msg=Updated');
});

app.post('/users/:id/reset-password', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const body = await c.req.parseBody();
  const pw = String(body.password || '').trim() || 'Alexander2026!';
  const hash = await hashPassword(pw);
  await c.env.DB.prepare(
    `UPDATE users SET password_hash=?, must_change_password=1, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(hash, id).run();
  // kill active sessions
  await c.env.DB.prepare(`DELETE FROM sessions WHERE user_id=?`).bind(id).run();
  await logActivity(c.env.DB, user.id, 'user', id, 'reset_password');
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
  const body = await c.req.parseBody();
  const teacher_id = Number(body.teacher_id);
  const staff_id = Number(body.staff_id);
  const relationship = String(body.relationship);
  const sy = await c.env.DB.prepare(`SELECT id FROM school_years WHERE is_current=1`).first<any>();
  await c.env.DB.prepare(
    `INSERT INTO assignments (teacher_id, staff_id, relationship, school_year_id, active)
     VALUES (?,?,?,?,1)`
  ).bind(teacher_id, staff_id, relationship, sy?.id || null).run();
  await logActivity(c.env.DB, user.id, 'assignment', null, 'create_assignment', { teacher_id, staff_id, relationship });
  return c.redirect('/admin/assignments?msg=Assignment+added');
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

export default app;

// ============================== VIEWS ==============================

function AdminHome({ user, byRole, byStatus, recent }: any) {
  return (
    <Layout title="Admin" user={user} activeNav="admin-home">
      <h1 class="font-display text-2xl text-aps-navy mb-4">Super Administrator</h1>
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
          <Button href="/admin/district" variant="secondary"><i class="fas fa-building-columns"></i>District Info</Button>
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

function UsersPage({ user, rows, schools, q, roleFilter, msg }: any) {
  return (
    <Layout title="Users" user={user} activeNav="admin-users">
      <h1 class="font-display text-2xl text-aps-navy mb-4">Users</h1>
      {msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}

      <Card title="Create user" icon="fas fa-user-plus">
        <form method="post" action="/admin/users/create" class="grid md:grid-cols-4 gap-3 text-sm">
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
          <label>School<select name="school_id" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5"><option value="">— None —</option>{schools.map((s: any) => <option value={s.id}>{s.name}</option>)}</select></label>
          <label>Initial password<input name="password" placeholder="Default: Alexander2026!" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
          <div class="md:col-span-4"><button class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-plus mr-1"></i>Create user</button></div>
        </form>
      </Card>

      <Card title={`All users (${rows.length})`} icon="fas fa-users" class="mt-4">
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
        <table class="w-full text-sm">
          <thead><tr class="text-left border-b border-slate-200 text-slate-600"><th class="py-2">Name</th><th>Email</th><th>Role</th><th>School</th><th>Last login</th><th></th></tr></thead>
          <tbody>
            {rows.map((u: any) => (
              <tr class="border-b border-slate-100">
                <td class="py-2">
                  <details>
                    <summary class="cursor-pointer font-medium">{u.first_name} {u.last_name}{!u.active && <span class="ml-2 text-xs text-slate-400">(inactive)</span>}</summary>
                    <form method="post" action={`/admin/users/${u.id}/update`} class="mt-2 grid md:grid-cols-4 gap-2 bg-slate-50 p-2 rounded text-xs">
                      <label>First<input name="first_name" value={u.first_name} class="mt-1 w-full border rounded px-1 py-1" /></label>
                      <label>Last<input name="last_name" value={u.last_name} class="mt-1 w-full border rounded px-1 py-1" /></label>
                      <label>Email<input name="email" value={u.email} class="mt-1 w-full border rounded px-1 py-1" /></label>
                      <label>Role<select name="role" class="mt-1 w-full border rounded px-1 py-1">
                        {['teacher','appraiser','coach','superintendent','super_admin'].map(r => <option value={r} selected={u.role===r}>{r}</option>)}
                      </select></label>
                      <label>Title<input name="title" value={u.title || ''} class="mt-1 w-full border rounded px-1 py-1" /></label>
                      <label>Phone<input name="phone" value={u.phone || ''} class="mt-1 w-full border rounded px-1 py-1" /></label>
                      <label>School<select name="school_id" class="mt-1 w-full border rounded px-1 py-1"><option value="">— None —</option>{schools.map((s: any) => <option value={s.id} selected={u.school_id===s.id}>{s.name}</option>)}</select></label>
                      <label class="flex items-center gap-2 mt-5"><input type="checkbox" name="active" checked={!!u.active} /> Active</label>
                      <div class="md:col-span-4 flex flex-wrap gap-2"><button class="bg-aps-navy text-white px-3 py-1 rounded text-xs"><i class="fas fa-save mr-1"></i>Save</button></div>
                    </form>
                    <form method="post" action={`/admin/users/${u.id}/reset-password`} class="mt-2 flex items-center gap-2 bg-amber-50 p-2 rounded text-xs">
                      <input name="password" placeholder="New password (blank = Alexander2026!)" class="flex-1 border rounded px-1 py-1" />
                      <button class="bg-amber-600 text-white px-3 py-1 rounded text-xs"><i class="fas fa-key mr-1"></i>Reset password</button>
                    </form>
                    {u.active && u.id !== user.id && (
                      <form method="post" action={`/admin/users/${u.id}/delete`} class="mt-2" onsubmit="return confirm('Deactivate this user?')">
                        <button class="text-xs text-red-700 hover:underline"><i class="fas fa-user-slash mr-1"></i>Deactivate user</button>
                      </form>
                    )}
                  </details>
                </td>
                <td class="text-slate-600">{u.email}</td>
                <td><span class="text-xs bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full">{u.role}</span></td>
                <td class="text-slate-600">{u.school_name || '—'}</td>
                <td class="text-slate-500 text-xs">{formatDateTime(u.last_login_at)}</td>
                <td></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </Layout>
  );
}

function AssignmentsPage({ user, teachers, appraisers, coaches, assignments, msg }: any) {
  return (
    <Layout title="Assignments" user={user} activeNav="admin-assign">
      <h1 class="font-display text-2xl text-aps-navy mb-4">Assignments</h1>
      <p class="text-slate-600 text-sm mb-4">Link each teacher to one or more appraisers (principal/admin) and instructional coaches.</p>
      {msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}

      <Card title="Add assignment" icon="fas fa-link">
        <form method="post" action="/admin/assignments/create" class="grid md:grid-cols-4 gap-2 text-sm items-end">
          <label>Teacher<select name="teacher_id" required class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5">
            <option value="">Select…</option>
            {teachers.map((t: any) => <option value={t.id}>{t.last_name}, {t.first_name} ({t.school_name || '—'})</option>)}
          </select></label>
          <label>Relationship<select name="relationship" id="rel-select" required class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5">
            <option value="appraiser">Appraiser</option>
            <option value="coach">Coach</option>
          </select></label>
          <label>Staff member<select name="staff_id" required class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5">
            <optgroup label="Appraisers">
              {appraisers.map((s: any) => <option value={s.id}>{s.last_name}, {s.first_name} ({s.role})</option>)}
            </optgroup>
            <optgroup label="Coaches">
              {coaches.map((s: any) => <option value={s.id}>{s.last_name}, {s.first_name}</option>)}
            </optgroup>
          </select></label>
          <button class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-plus mr-1"></i>Add</button>
        </form>
      </Card>

      <Card title={`Current assignments (${assignments.length})`} icon="fas fa-list" class="mt-4">
        {assignments.length === 0 ? <p class="text-slate-500 text-sm">No assignments yet.</p> :
          <table class="w-full text-sm">
            <thead><tr class="text-left border-b border-slate-200 text-slate-600"><th class="py-2">Teacher</th><th>Relationship</th><th>Staff member</th><th></th></tr></thead>
            <tbody>
              {assignments.map((a: any) => (
                <tr class="border-b border-slate-100">
                  <td class="py-2 font-medium">{a.t_first} {a.t_last}</td>
                  <td><span class="text-xs bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200 capitalize">{a.relationship}</span></td>
                  <td>{a.s_first} {a.s_last} <span class="text-xs text-slate-500">({a.s_role})</span></td>
                  <td><form method="post" action={`/admin/assignments/${a.id}/delete`} onsubmit="return confirm('Remove this assignment?')"><button class="text-red-700 hover:underline text-xs"><i class="fas fa-trash mr-1"></i>Remove</button></form></td>
                </tr>
              ))}
            </tbody>
          </table>
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
      <Card title="Add school" icon="fas fa-plus">
        <form method="post" action="/admin/schools/create" class="grid md:grid-cols-4 gap-2 text-sm">
          <label>Name<input name="name" required class="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>Grade span<input name="grade_span" placeholder="PK-5" class="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>Address<input name="address" class="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <label>Phone<input name="phone" class="mt-1 w-full border rounded px-2 py-1.5" /></label>
          <div class="md:col-span-4"><button class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-plus mr-1"></i>Add</button></div>
        </form>
      </Card>
      <Card title="All schools" icon="fas fa-school" class="mt-4">
        <table class="w-full text-sm">
          <thead><tr class="text-left border-b border-slate-200 text-slate-600"><th class="py-2">Name</th><th>Grade span</th><th>Address</th><th>Phone</th></tr></thead>
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
        </table>
      </Card>
    </Layout>
  );
}

function PedagogyPage({ user, domains, map }: any) {
  return (
    <Layout title="Pedagogy Library" user={user} activeNav="admin-pedagogy">
      <h1 class="font-display text-2xl text-aps-navy mb-1">Pedagogy Library</h1>
      <p class="text-slate-600 text-sm mb-4">Each indicator has four rating levels. Click any cell to edit the interpretation, evidence signals, concrete next-steps, coaching considerations, PD resources, and the feedback-starter sentence used when auto-generating feedback.</p>
      <div class="space-y-3">
        {domains.map((d: any) => (
          <details open={d.code === 'A'} class="bg-white rounded-lg border border-slate-200">
            <summary class="px-4 py-3 cursor-pointer">
              <span class="inline-block w-7 h-7 rounded-full bg-aps-navy text-white font-display text-sm mr-2 text-center leading-7">{d.code}</span>
              <span class="font-display text-aps-navy">{d.name}</span>
            </summary>
            <div class="p-4 overflow-x-auto">
              <table class="w-full text-xs">
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
              </table>
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
      <Card title="District details" icon="fas fa-building-columns">
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
        <ul class="space-y-1 text-sm">
          {years.map((y: any) => <li>{y.label} {y.is_current ? <span class="text-xs text-emerald-700 ml-1">(current)</span> : null} · {formatDate(y.start_date)} – {formatDate(y.end_date)}</li>)}
        </ul>
      </Card>
    </Layout>
  );
}
