import { Hono } from 'hono';
import type { Bindings, Variables, UserRole } from '../lib/types';
import { Layout, Card, Button } from '../lib/layout';
import { requireRole, hashPassword } from '../lib/auth';
import { getDomainsWithIndicators, getActiveFramework, logActivity } from '../lib/db';
import { formatDate, formatDateTime, levelLabels, levelColor } from '../lib/ui';
import { parseCsvAsObjects, buildCsv } from '../lib/csv';

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

// ============================================================================
// BULK IMPORT — Users (teachers, principals, coaches, etc.)
// ============================================================================
const USER_CSV_HEADERS = [
  'first_name','last_name','email','role','title','phone','school_name','password','active'
];

const USER_CSV_TEMPLATE_ROWS: string[][] = [
  // Sample rows so the admin can see exactly the expected format.
  ['Jane','Doe','jane.doe@k12.nd.us','teacher','2nd Grade','701-828-3334','Alexander Elementary','Alexander2026!','yes'],
  ['John','Smith','john.smith@k12.nd.us','teacher','Physical Education','701-828-3334','Alexander Elementary','Alexander2026!','yes'],
  ['Alex','Principal','alex.principal@k12.nd.us','appraiser','Elementary Principal','701-828-3334','Alexander Elementary','Alexander2026!','yes'],
  ['Casey','Coach','casey.coach@k12.nd.us','coach','Instructional Coach','701-828-3334','Alexander Junior/Senior High','Alexander2026!','yes'],
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
  // Validate headers
  const missing = USER_CSV_HEADERS.filter(h => !headers.includes(h));
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
    const schoolName = (r.school_name || '').trim();
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
    let school_id: number | null = null;
    if (schoolName) {
      const hit = schoolMap.get(schoolName.toLowerCase());
      if (!hit) {
        report.warnings.push(`Line ${line}: school "${schoolName}" not found — user will be created without a school assignment.`);
      } else school_id = hit;
    }

    if (dryRun) {
      if (existingMap.has(email)) report.updated++; else report.created++;
      continue;
    }

    try {
      const existingId = existingMap.get(email);
      if (existingId) {
        await c.env.DB.prepare(
          `UPDATE users SET first_name=?, last_name=?, role=?, title=?, phone=?, school_id=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
        ).bind(first, last, role, title, phone, school_id, active, existingId).run();
        report.updated++;
      } else {
        const hash = await hashPassword(password);
        const res = await c.env.DB.prepare(
          `INSERT INTO users (district_id, school_id, email, password_hash, first_name, last_name, role, title, phone, active, must_change_password)
           VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
        ).bind(school_id, email, hash, first, last, role, title, phone, active).run();
        existingMap.set(email, Number((res.meta as any)?.last_row_id));
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
          <Button href="/admin/import/users" variant="secondary"><i class="fas fa-file-import"></i>Bulk Import Users</Button>
          <Button href="/admin/import/rubric" variant="secondary"><i class="fas fa-file-import"></i>Bulk Import Rubric</Button>
          <Button href="/reports" variant="secondary"><i class="fas fa-file-export"></i>Reports</Button>
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

      <Card title="Add many users at once" icon="fas fa-file-import" class="mt-4">
        <div class="flex items-center justify-between gap-3 flex-wrap">
          <p class="text-sm text-slate-600">Need to onboard a full roster of teachers, principals, or coaches? Download the CSV template, fill it out in Excel, and upload it back — existing emails are updated, new emails are created.</p>
          <a href="/admin/import/users" class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm whitespace-nowrap"><i class="fas fa-file-import mr-1"></i>Bulk import users</a>
        </div>
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
      <div class="mb-4 flex flex-wrap gap-2">
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

      <Card title="Step 1 — Download the template" icon="fas fa-file-csv">
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
            <li><code>school_name</code> — must exactly match an existing school name (case-insensitive). If blank or no match, user is created without a school assignment. Existing schools: {schools.length === 0 ? <em>(none defined yet)</em> : schools.map((s: any, i: number) => <span><code>{s.name}</code>{i < schools.length - 1 ? ', ' : ''}</span>)}.</li>
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
