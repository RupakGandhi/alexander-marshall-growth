import { Hono } from 'hono';
import type { Bindings, Variables } from '../lib/types';
import { Layout, Card } from '../lib/layout';
import { requireRole } from '../lib/auth';
import { getObservation } from '../lib/db';
import { formatDate, levelColor, levelLabels, statusBadge, statusLabel } from '../lib/ui';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use('*', requireRole(['superintendent', 'super_admin']));

// District overview — KPIs and school-by-school rollup
app.get('/', async (c) => {
  const user = c.get('user')!;
  const welcome = c.req.query('welcome') === '1';
  const kpis = await computeDistrictKpis(c.env.DB);
  // Count every teacher linked to the school via either users.school_id (primary)
  // OR the user_schools junction — multi-school teachers appear under each
  // school they are assigned to.
  const bySchool = await c.env.DB.prepare(
    `SELECT s.id, s.name, s.grade_span,
       (SELECT COUNT(DISTINCT u.id) FROM users u
          LEFT JOIN user_schools us ON us.user_id = u.id
         WHERE u.role='teacher' AND u.active=1
           AND (u.school_id = s.id OR us.school_id = s.id)) AS teachers,
       (SELECT COUNT(DISTINCT o.id) FROM observations o
          JOIN users u ON u.id = o.teacher_id
          LEFT JOIN user_schools us ON us.user_id = u.id
         WHERE (u.school_id = s.id OR us.school_id = s.id)) AS total_obs,
       (SELECT COUNT(DISTINCT o.id) FROM observations o
          JOIN users u ON u.id = o.teacher_id
          LEFT JOIN user_schools us ON us.user_id = u.id
         WHERE (u.school_id = s.id OR us.school_id = s.id)
           AND (o.status='published' OR o.status='acknowledged')) AS published_obs
     FROM schools s WHERE s.district_id=1 ORDER BY s.name`
  ).all();
  return c.html(<SuperintendentHome user={user} kpis={kpis} schools={bySchool.results || []} welcome={welcome} />);
});

// By school drill-down
app.get('/schools', async (c) => {
  const user = c.get('user')!;
  const schools = await c.env.DB.prepare(`SELECT * FROM schools WHERE district_id=1 ORDER BY name`).all();
  const data: any[] = [];
  for (const s of (schools.results as any[])) {
    // Include teachers whose primary school OR any user_schools link matches.
    const teachers = await c.env.DB.prepare(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, u.title,
         (SELECT COUNT(*) FROM observations o WHERE o.teacher_id = u.id AND (o.status='published' OR o.status='acknowledged')) AS pub,
         (SELECT MAX(observed_at) FROM observations o WHERE o.teacher_id = u.id) AS last_obs
       FROM users u
       LEFT JOIN user_schools us ON us.user_id = u.id
       WHERE u.role='teacher' AND u.active=1
         AND (u.school_id=? OR us.school_id=?)
       ORDER BY u.last_name, u.first_name`
    ).bind(s.id, s.id).all();
    data.push({ school: s, teachers: teachers.results || [] });
  }
  return c.html(<SuperintendentSchools user={user} data={data} />);
});

// By teacher: full list, drill to individual read-only observation
app.get('/teachers', async (c) => {
  const user = c.get('user')!;
  const rows = await c.env.DB.prepare(
    `SELECT u.id, u.first_name, u.last_name, u.title, s.name AS school_name,
       (SELECT COUNT(*) FROM observations o WHERE o.teacher_id = u.id) AS obs_count,
       (SELECT COUNT(*) FROM observations o WHERE o.teacher_id = u.id AND (o.status='published' OR o.status='acknowledged')) AS pub_count,
       (SELECT MAX(observed_at) FROM observations o WHERE o.teacher_id = u.id) AS last_obs
     FROM users u LEFT JOIN schools s ON s.id = u.school_id
     WHERE u.role='teacher' AND u.active=1 ORDER BY u.last_name, u.first_name`
  ).all();
  return c.html(<SuperintendentTeachers user={user} rows={rows.results || []} />);
});

app.get('/teachers/:id', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const t = await c.env.DB.prepare(
    `SELECT u.*, s.name AS school_name FROM users u LEFT JOIN schools s ON s.id=u.school_id WHERE u.id=?`
  ).bind(id).first<any>();
  if (!t) return c.text('Not found', 404);
  const obs = await c.env.DB.prepare(
    `SELECT o.*, a.first_name AS a_first, a.last_name AS a_last
     FROM observations o JOIN users a ON a.id=o.appraiser_id
     WHERE o.teacher_id=? ORDER BY o.observed_at DESC`
  ).bind(id).all();
  return c.html(<SuperintendentTeacherDetail user={user} t={t} observations={obs.results || []} />);
});

app.get('/observations/:id', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const o = await getObservation(c.env.DB, id);
  if (!o) return c.text('Not found', 404);
  return c.html(<SuperintendentObservationView user={user} o={o} />);
});

// --------------------------------------------------------------------------
// INSTRUCTIONAL INSIGHTS — dynamic, filterable dashboard covering performance
// by school / teacher / domain / indicator, appraiser activity, and feedback
// volume. Designed so a superintendent can spot PD needs, support principals,
// and have evidence-based conversations with teachers.
// --------------------------------------------------------------------------
app.get('/insights', async (c) => {
  const user = c.get('user')!;
  const schoolFilter = c.req.query('school') || '';
  const groupBy = (c.req.query('group') || 'school') as 'school'|'teacher'|'domain'|'appraiser';
  const domainFilter = c.req.query('domain') || '';
  const typeFilter = c.req.query('type') || '';
  const sortBy = (c.req.query('sort') || 'avg_desc') as string;

  // Build shared WHERE clause for scoped queries.
  const whereParts: string[] = [`(o.status = 'published' OR o.status = 'acknowledged')`, 's.level IS NOT NULL'];
  const whereBinds: any[] = [];
  if (schoolFilter) { whereParts.push(`(t.school_id = ? OR EXISTS (SELECT 1 FROM user_schools us WHERE us.user_id = t.id AND us.school_id = ?))`); whereBinds.push(Number(schoolFilter), Number(schoolFilter)); }
  if (domainFilter) { whereParts.push(`d.code = ?`); whereBinds.push(domainFilter); }
  if (typeFilter) { whereParts.push(`o.observation_type = ?`); whereBinds.push(typeFilter); }
  const WHERE = `WHERE ${whereParts.join(' AND ')}`;

  // District-wide summary for the header strip.
  const summary = await c.env.DB.prepare(
    `SELECT COUNT(*) AS n_scores,
            AVG(s.level * 1.0) AS avg_level,
            SUM(CASE WHEN s.level = 4 THEN 1 ELSE 0 END) AS n4,
            SUM(CASE WHEN s.level = 3 THEN 1 ELSE 0 END) AS n3,
            SUM(CASE WHEN s.level = 2 THEN 1 ELSE 0 END) AS n2,
            SUM(CASE WHEN s.level = 1 THEN 1 ELSE 0 END) AS n1,
            COUNT(DISTINCT t.id) AS n_teachers,
            COUNT(DISTINCT o.id) AS n_observations,
            COUNT(DISTINCT o.appraiser_id) AS n_appraisers
     FROM observation_scores s
     JOIN observations o ON o.id = s.observation_id
     JOIN users t ON t.id = o.teacher_id
     JOIN framework_indicators i ON i.id = s.indicator_id
     JOIN framework_domains d ON d.id = i.domain_id
     ${WHERE}`
  ).bind(...whereBinds).first<any>();

  // Main group-by query.
  let groupSql: string;
  let orderSql: string;
  const sortMap: Record<string,string> = {
    avg_desc: 'avg_level DESC', avg_asc: 'avg_level ASC',
    name_asc: 'label ASC', name_desc: 'label DESC',
    n_desc: 'n_scores DESC', n_asc: 'n_scores ASC',
  };
  orderSql = sortMap[sortBy] || 'avg_level DESC';

  switch (groupBy) {
    case 'teacher':
      groupSql = `
        SELECT t.id AS group_id,
               t.first_name || ' ' || t.last_name AS label,
               COALESCE(s2.name, '—') AS sublabel,
               COUNT(*) AS n_scores,
               AVG(s.level * 1.0) AS avg_level,
               SUM(CASE WHEN s.level = 4 THEN 1 ELSE 0 END) AS n4,
               SUM(CASE WHEN s.level = 3 THEN 1 ELSE 0 END) AS n3,
               SUM(CASE WHEN s.level = 2 THEN 1 ELSE 0 END) AS n2,
               SUM(CASE WHEN s.level = 1 THEN 1 ELSE 0 END) AS n1,
               COUNT(DISTINCT o.id) AS n_observations
        FROM observation_scores s
        JOIN observations o ON o.id = s.observation_id
        JOIN users t ON t.id = o.teacher_id
        LEFT JOIN schools s2 ON s2.id = t.school_id
        JOIN framework_indicators i ON i.id = s.indicator_id
        JOIN framework_domains d ON d.id = i.domain_id
        ${WHERE}
        GROUP BY t.id
        ORDER BY ${orderSql}
      `;
      break;
    case 'domain':
      groupSql = `
        SELECT d.id AS group_id,
               d.code || ' — ' || d.name AS label,
               '6 indicators per domain' AS sublabel,
               COUNT(*) AS n_scores,
               AVG(s.level * 1.0) AS avg_level,
               SUM(CASE WHEN s.level = 4 THEN 1 ELSE 0 END) AS n4,
               SUM(CASE WHEN s.level = 3 THEN 1 ELSE 0 END) AS n3,
               SUM(CASE WHEN s.level = 2 THEN 1 ELSE 0 END) AS n2,
               SUM(CASE WHEN s.level = 1 THEN 1 ELSE 0 END) AS n1,
               COUNT(DISTINCT o.id) AS n_observations
        FROM observation_scores s
        JOIN observations o ON o.id = s.observation_id
        JOIN users t ON t.id = o.teacher_id
        JOIN framework_indicators i ON i.id = s.indicator_id
        JOIN framework_domains d ON d.id = i.domain_id
        ${WHERE}
        GROUP BY d.id
        ORDER BY ${orderSql === 'avg_level DESC' || orderSql === 'avg_level ASC' ? orderSql : 'd.sort_order ASC'}
      `;
      break;
    case 'appraiser':
      groupSql = `
        SELECT a.id AS group_id,
               a.first_name || ' ' || a.last_name AS label,
               COALESCE(a.title, '—') AS sublabel,
               COUNT(*) AS n_scores,
               AVG(s.level * 1.0) AS avg_level,
               SUM(CASE WHEN s.level = 4 THEN 1 ELSE 0 END) AS n4,
               SUM(CASE WHEN s.level = 3 THEN 1 ELSE 0 END) AS n3,
               SUM(CASE WHEN s.level = 2 THEN 1 ELSE 0 END) AS n2,
               SUM(CASE WHEN s.level = 1 THEN 1 ELSE 0 END) AS n1,
               COUNT(DISTINCT o.id) AS n_observations
        FROM observation_scores s
        JOIN observations o ON o.id = s.observation_id
        JOIN users t ON t.id = o.teacher_id
        JOIN users a ON a.id = o.appraiser_id
        JOIN framework_indicators i ON i.id = s.indicator_id
        JOIN framework_domains d ON d.id = i.domain_id
        ${WHERE}
        GROUP BY a.id
        ORDER BY ${orderSql}
      `;
      break;
    default: // school
      groupSql = `
        SELECT sch.id AS group_id,
               sch.name AS label,
               COALESCE(sch.grade_span, '—') AS sublabel,
               COUNT(*) AS n_scores,
               AVG(s.level * 1.0) AS avg_level,
               SUM(CASE WHEN s.level = 4 THEN 1 ELSE 0 END) AS n4,
               SUM(CASE WHEN s.level = 3 THEN 1 ELSE 0 END) AS n3,
               SUM(CASE WHEN s.level = 2 THEN 1 ELSE 0 END) AS n2,
               SUM(CASE WHEN s.level = 1 THEN 1 ELSE 0 END) AS n1,
               COUNT(DISTINCT o.id) AS n_observations
        FROM observation_scores s
        JOIN observations o ON o.id = s.observation_id
        JOIN users t ON t.id = o.teacher_id
        JOIN schools sch ON sch.id = t.school_id
        JOIN framework_indicators i ON i.id = s.indicator_id
        JOIN framework_domains d ON d.id = i.domain_id
        ${WHERE}
        GROUP BY sch.id
        ORDER BY ${orderSql}
      `;
  }
  const groups = await c.env.DB.prepare(groupSql).bind(...whereBinds).all();

  // Per-domain heatmap, scoped to the same filters.
  const heatmap = await c.env.DB.prepare(
    `SELECT d.code AS domain_code, d.name AS domain_name,
            AVG(s.level * 1.0) AS avg_level, COUNT(*) AS n_scores
     FROM observation_scores s
     JOIN observations o ON o.id = s.observation_id
     JOIN users t ON t.id = o.teacher_id
     JOIN framework_indicators i ON i.id = s.indicator_id
     JOIN framework_domains d ON d.id = i.domain_id
     ${WHERE}
     GROUP BY d.id
     ORDER BY d.sort_order`
  ).bind(...whereBinds).all();

  // PD "areas of concern": indicators with lowest avg score across the filter.
  const pdHotspots = await c.env.DB.prepare(
    `SELECT i.code AS indicator_code, i.name AS indicator_name,
            d.code AS domain_code, d.name AS domain_name,
            AVG(s.level * 1.0) AS avg_level, COUNT(*) AS n_scores
     FROM observation_scores s
     JOIN observations o ON o.id = s.observation_id
     JOIN users t ON t.id = o.teacher_id
     JOIN framework_indicators i ON i.id = s.indicator_id
     JOIN framework_domains d ON d.id = i.domain_id
     ${WHERE}
     GROUP BY i.id
     HAVING COUNT(*) >= 1
     ORDER BY avg_level ASC, n_scores DESC
     LIMIT 10`
  ).bind(...whereBinds).all();

  // Recent feedback stream (what's actually being said to teachers).
  const feedbackWhereParts: string[] = [`(o.status = 'published' OR o.status = 'acknowledged')`];
  const feedbackBinds: any[] = [];
  if (schoolFilter) { feedbackWhereParts.push(`(t.school_id = ? OR EXISTS (SELECT 1 FROM user_schools us WHERE us.user_id = t.id AND us.school_id = ?))`); feedbackBinds.push(Number(schoolFilter), Number(schoolFilter)); }
  if (typeFilter) { feedbackWhereParts.push(`o.observation_type = ?`); feedbackBinds.push(typeFilter); }
  const feedbackWHERE = `WHERE ${feedbackWhereParts.join(' AND ')}`;
  const recentFeedback = await c.env.DB.prepare(
    `SELECT f.category, f.title, f.body AS description, f.indicator_id,
            t.first_name AS t_first, t.last_name AS t_last,
            a.first_name AS a_first, a.last_name AS a_last,
            o.id AS obs_id, o.observed_at, o.observation_type,
            i.code AS indicator_code, dd.code AS domain_code
     FROM feedback_items f
     JOIN observations o ON o.id = f.observation_id
     JOIN users t ON t.id = o.teacher_id
     JOIN users a ON a.id = o.appraiser_id
     LEFT JOIN framework_indicators i ON i.id = f.indicator_id
     LEFT JOIN framework_domains dd ON dd.id = i.domain_id
     ${feedbackWHERE}
     ORDER BY o.observed_at DESC, f.sort_order
     LIMIT 40`
  ).bind(...feedbackBinds).all();

  const schools = await c.env.DB.prepare(`SELECT * FROM schools WHERE district_id=1 ORDER BY name`).all();
  const domains = await c.env.DB.prepare(`SELECT code, name FROM framework_domains ORDER BY sort_order`).all();

  return c.html(<SuperintendentInsights
    user={user}
    summary={summary || {}}
    groups={groups.results || []}
    groupBy={groupBy}
    heatmap={heatmap.results || []}
    pdHotspots={pdHotspots.results || []}
    feedback={recentFeedback.results || []}
    schools={schools.results || []}
    domains={domains.results || []}
    filters={{ school: schoolFilter, domain: domainFilter, type: typeFilter, sort: sortBy }}
  />);
});

async function computeDistrictKpis(db: D1Database) {
  const teachers = await db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role='teacher' AND active=1`).first<any>();
  const appraisers = await db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role='appraiser' AND active=1`).first<any>();
  const coaches = await db.prepare(`SELECT COUNT(*) AS n FROM users WHERE role='coach' AND active=1`).first<any>();
  const obs = await db.prepare(`SELECT COUNT(*) AS n FROM observations`).first<any>();
  const pub = await db.prepare(`SELECT COUNT(*) AS n FROM observations WHERE status='published' OR status='acknowledged'`).first<any>();
  const ack = await db.prepare(`SELECT COUNT(*) AS n FROM observations WHERE status='acknowledged'`).first<any>();
  const focus = await db.prepare(`SELECT COUNT(*) AS n FROM focus_areas WHERE status='active'`).first<any>();
  // Distribution
  const dist = await db.prepare(
    `SELECT level, COUNT(*) AS n FROM observation_scores s
     JOIN observations o ON o.id = s.observation_id
     WHERE s.level IS NOT NULL AND (o.status='published' OR o.status='acknowledged')
     GROUP BY level`
  ).all();
  const distribution: Record<number, number> = { 1:0, 2:0, 3:0, 4:0 };
  for (const r of (dist.results as any[])) distribution[r.level] = r.n;
  const total = distribution[1] + distribution[2] + distribution[3] + distribution[4];
  const pct = (n: number) => total === 0 ? 0 : Math.round((n / total) * 100);
  return {
    teachers: teachers?.n || 0,
    appraisers: appraisers?.n || 0,
    coaches: coaches?.n || 0,
    totalObs: obs?.n || 0,
    publishedObs: pub?.n || 0,
    acknowledgedObs: ack?.n || 0,
    activeFocusAreas: focus?.n || 0,
    distribution, total,
    pct: { 1: pct(distribution[1]), 2: pct(distribution[2]), 3: pct(distribution[3]), 4: pct(distribution[4]) },
  };
}

export default app;

// ============================== VIEWS ==============================

function SuperintendentHome({ user, kpis, schools, welcome }: any) {
  return (
    <Layout title="District Overview" user={user} activeNav="supt-home" autoLaunchTour={!!welcome}>
      <h1 class="font-display text-2xl text-aps-navy mb-1">District Overview</h1>
      <p class="text-slate-600 text-sm mb-6">Alexander Public School District · {kpis.teachers} teachers · {schools.length} schools</p>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6" data-tour="supt-kpis">
        <Kpi label="Teachers" value={kpis.teachers} icon="fas fa-chalkboard-user" />
        <Kpi label="Appraisers" value={kpis.appraisers} icon="fas fa-user-tie" />
        <Kpi label="Coaches" value={kpis.coaches} icon="fas fa-compass" />
        <Kpi label="Active Focus Areas" value={kpis.activeFocusAreas} icon="fas fa-bullseye" />
        <Kpi label="Observations (all)" value={kpis.totalObs} icon="fas fa-clipboard-list" />
        <Kpi label="Published" value={kpis.publishedObs} icon="fas fa-clipboard-check" />
        <Kpi label="Acknowledged" value={kpis.acknowledgedObs} icon="fas fa-check-double" />
        <Kpi label="Completion Rate" value={kpis.totalObs ? Math.round(kpis.publishedObs / kpis.totalObs * 100) + '%' : '—'} icon="fas fa-chart-line" />
      </div>

      <Card title="Rubric Rating Distribution (published observations)" icon="fas fa-chart-column">
        {kpis.total === 0 ? <p class="text-slate-500 text-sm">No scored indicators yet.</p> :
          <div>
            <div class="flex h-8 w-full rounded overflow-hidden border border-slate-200">
              <div style={`width:${kpis.pct[4]}%`} class="bg-emerald-500 text-xs text-white flex items-center justify-center">{kpis.pct[4] > 6 && `${kpis.pct[4]}% HE`}</div>
              <div style={`width:${kpis.pct[3]}%`} class="bg-sky-500 text-xs text-white flex items-center justify-center">{kpis.pct[3] > 6 && `${kpis.pct[3]}% E`}</div>
              <div style={`width:${kpis.pct[2]}%`} class="bg-amber-500 text-xs text-white flex items-center justify-center">{kpis.pct[2] > 6 && `${kpis.pct[2]}% IN`}</div>
              <div style={`width:${kpis.pct[1]}%`} class="bg-red-500 text-xs text-white flex items-center justify-center">{kpis.pct[1] > 6 && `${kpis.pct[1]}% DNM`}</div>
            </div>
            <div class="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-600">
              <div><span class="inline-block w-3 h-3 rounded-full bg-emerald-500 mr-1"></span>Highly Effective — {kpis.distribution[4]}</div>
              <div><span class="inline-block w-3 h-3 rounded-full bg-sky-500 mr-1"></span>Effective — {kpis.distribution[3]}</div>
              <div><span class="inline-block w-3 h-3 rounded-full bg-amber-500 mr-1"></span>Improvement Necessary — {kpis.distribution[2]}</div>
              <div><span class="inline-block w-3 h-3 rounded-full bg-red-500 mr-1"></span>Does Not Meet — {kpis.distribution[1]}</div>
            </div>
          </div>
        }
      </Card>

      <Card title="By School" icon="fas fa-school" class="mt-4" data-tour="supt-by-school">
        <div class="overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5"><table class="w-full text-sm">
          <thead><tr class="text-left border-b border-slate-200 text-slate-600"><th class="py-2">School</th><th>Grades</th><th>Teachers</th><th>Observations</th><th>Published</th><th></th></tr></thead>
          <tbody>
            {schools.map((s: any) => (
              <tr class="border-b border-slate-100">
                <td class="py-2 font-medium">{s.name}</td>
                <td>{s.grade_span}</td>
                <td>{s.teachers}</td>
                <td>{s.total_obs}</td>
                <td>{s.published_obs}</td>
                <td><a href="/superintendent/schools" class="text-aps-blue hover:underline">Drill down →</a></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
    </Layout>
  );
}

function Kpi({ label, value, icon }: any) {
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

function SuperintendentSchools({ user, data }: any) {
  return (
    <Layout title="By School" user={user} activeNav="supt-schools">
      <h1 class="font-display text-2xl text-aps-navy mb-4">By School</h1>
      <div class="space-y-4" data-tour="supt-schools-list">
        {data.map((d: any) => (
          <Card title={`${d.school.name} · ${d.school.grade_span || ''}`} icon="fas fa-school">
            <div class="overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5"><table class="w-full text-sm">
              <thead><tr class="text-left border-b border-slate-200 text-slate-600"><th class="py-2">Teacher</th><th>Title</th><th>Published Obs</th><th>Last Observed</th><th></th></tr></thead>
              <tbody>
                {d.teachers.map((t: any) => (
                  <tr class="border-b border-slate-100">
                    <td class="py-2 font-medium">{t.first_name} {t.last_name}</td>
                    <td class="text-slate-600">{t.title || '—'}</td>
                    <td>{t.pub}</td>
                    <td class="text-slate-500">{formatDate(t.last_obs)}</td>
                    <td><a href={`/superintendent/teachers/${t.id}`} class="text-aps-blue hover:underline">View →</a></td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </Card>
        ))}
      </div>
    </Layout>
  );
}

function SuperintendentTeachers({ user, rows }: any) {
  return (
    <Layout title="By Teacher" user={user} activeNav="supt-teacher">
      <h1 class="font-display text-2xl text-aps-navy mb-4">All Teachers</h1>
      <Card data-tour="supt-teachers-list">
        <div class="overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5"><table class="w-full text-sm">
          <thead><tr class="text-left border-b border-slate-200 text-slate-600"><th class="py-2">Teacher</th><th>School</th><th>Title</th><th>Obs</th><th>Published</th><th>Last observed</th><th></th></tr></thead>
          <tbody>
            {rows.map((t: any) => (
              <tr class="border-b border-slate-100">
                <td class="py-2 font-medium">{t.first_name} {t.last_name}</td>
                <td class="text-slate-600">{t.school_name || '—'}</td>
                <td class="text-slate-600">{t.title || '—'}</td>
                <td>{t.obs_count}</td>
                <td>{t.pub_count}</td>
                <td class="text-slate-500">{formatDate(t.last_obs)}</td>
                <td><a href={`/superintendent/teachers/${t.id}`} class="text-aps-blue hover:underline">View →</a></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </Card>
    </Layout>
  );
}

function SuperintendentTeacherDetail({ user, t, observations }: any) {
  return (
    <Layout title={`${t.first_name} ${t.last_name}`} user={user} activeNav="supt-teacher">
      <div class="mb-4"><a href="/superintendent/teachers" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>Back</a></div>
      <h1 class="font-display text-2xl text-aps-navy">{t.first_name} {t.last_name}</h1>
      <p class="text-slate-600 text-sm mb-4">{t.title || 'Teacher'} · {t.school_name || '—'} · {t.email}</p>

      <Card title="Observation History" icon="fas fa-clock-rotate-left">
        {observations.length === 0 ? <p class="text-slate-500 text-sm">No observations.</p> :
          <div class="overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5"><table class="w-full text-sm">
            <thead><tr class="text-left border-b border-slate-200 text-slate-600"><th class="py-2">Date</th><th>Type</th><th>Appraiser</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {observations.map((o: any) => (
                <tr class="border-b border-slate-100">
                  <td class="py-2">{formatDate(o.observed_at)}</td>
                  <td>{o.observation_type}</td>
                  <td>{o.a_first} {o.a_last}</td>
                  <td><span class={`px-2 py-0.5 rounded-full text-xs border ${statusBadge(o.status)}`}>{statusLabel(o.status)}</span></td>
                  <td>{(o.status==='published'||o.status==='acknowledged') && <a href={`/superintendent/observations/${o.id}`} class="text-aps-blue hover:underline">Open →</a>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        }
      </Card>
    </Layout>
  );
}

function SuperintendentObservationView({ user, o }: any) {
  if (o.status !== 'published' && o.status !== 'acknowledged') {
    return <Layout title="Observation" user={user}><p>This observation is still in progress.</p></Layout>;
  }
  return (
    <Layout title="Observation" user={user} activeNav="supt-teacher">
      <div class="mb-4"><a href={`/superintendent/teachers/${o.teacher_id}`} class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>Back</a></div>
      <h1 class="font-display text-2xl text-aps-navy">{o.observation_type} · {o.t_first} {o.t_last}</h1>
      <p class="text-slate-600 text-sm">{formatDate(o.observed_at)} · by {o.a_first} {o.a_last}</p>
      {o.overall_summary && <Card title="Summary" icon="fas fa-message" class="mt-3"><p class="whitespace-pre-wrap">{o.overall_summary}</p></Card>}

      {(o.scores || []).length > 0 && (
        <Card title="Scores" icon="fas fa-table-list" class="mt-3">
          <div class="overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5"><table class="w-full text-sm">
            <thead><tr class="text-left border-b border-slate-200 text-slate-600"><th class="py-2">Domain</th><th>Indicator</th><th>Rating</th></tr></thead>
            <tbody>
              {o.scores.map((s: any) => (
                <tr class="border-b border-slate-100">
                  <td class="py-2">{s.domain_code}. {s.domain_name}</td>
                  <td>{s.indicator_code}. {s.indicator_name}</td>
                  <td>{s.level ? <span class={`px-2 py-0.5 rounded-full text-xs border ${levelColor[s.level]}`}>{s.level} · {levelLabels[s.level]}</span> : <span class="text-slate-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      )}
    </Layout>
  );
}

// --------------------------------------------------------------------------
// SuperintendentInsights — interactive instructional dashboard.
// --------------------------------------------------------------------------
function SuperintendentInsights({ user, summary, groups, groupBy, heatmap, pdHotspots, feedback, schools, domains, filters }: any) {
  const n = Number(summary.n_scores || 0);
  const avg = summary.avg_level ? Number(summary.avg_level).toFixed(2) : '—';
  const pct = (x: any) => n > 0 ? Math.round((Number(x) / n) * 100) : 0;
  const levelPill = (level: number) => {
    const map: Record<number,string> = {
      4: 'bg-emerald-100 border-emerald-300 text-emerald-800',
      3: 'bg-sky-100 border-sky-300 text-sky-800',
      2: 'bg-amber-100 border-amber-300 text-amber-800',
      1: 'bg-red-100 border-red-300 text-red-800',
    };
    return map[level] || 'bg-slate-100 border-slate-300 text-slate-700';
  };
  // Colored bar background for average scores (1.0 - 4.0 scale).
  const avgColor = (a: number | null) => {
    if (a == null) return 'bg-slate-100 text-slate-500';
    if (a >= 3.5) return 'bg-emerald-500 text-white';
    if (a >= 2.75) return 'bg-sky-500 text-white';
    if (a >= 2) return 'bg-amber-500 text-white';
    return 'bg-red-500 text-white';
  };
  const avgLabel = (a: number | null) => {
    if (a == null) return '—';
    if (a >= 3.5) return 'Highly Effective';
    if (a >= 2.75) return 'Effective';
    if (a >= 2) return 'Improvement Necessary';
    return 'Does Not Meet';
  };

  return (
    <Layout title="Instructional Insights" user={user} activeNav="supt-insights">
      <h1 class="font-display text-2xl text-aps-navy mb-1">Instructional Insights</h1>
      <p class="text-slate-600 text-sm mb-4">Filterable view of teacher performance, coaching targets, and feedback volume — pulled directly from the Marshall rubric and pedagogy library. Designed for evidence-based conversations with principals and teachers.</p>

      {/* Filter bar */}
      <form method="get" action="/superintendent/insights" class="bg-white border border-slate-200 rounded-md p-3 mb-4 flex flex-wrap items-end gap-2 text-sm">
        <label class="flex flex-col text-xs"><span class="text-slate-600 mb-1">Group by</span>
          <select name="group" class="border rounded px-2 py-1.5 text-sm">
            <option value="school" selected={groupBy==='school'}>School</option>
            <option value="teacher" selected={groupBy==='teacher'}>Teacher</option>
            <option value="domain" selected={groupBy==='domain'}>Rubric domain</option>
            <option value="appraiser" selected={groupBy==='appraiser'}>Appraiser</option>
          </select>
        </label>
        <label class="flex flex-col text-xs"><span class="text-slate-600 mb-1">School</span>
          <select name="school" class="border rounded px-2 py-1.5 text-sm">
            <option value="">All schools</option>
            {schools.map((s: any) => <option value={s.id} selected={String(filters.school) === String(s.id)}>{s.name}</option>)}
          </select>
        </label>
        <label class="flex flex-col text-xs"><span class="text-slate-600 mb-1">Domain</span>
          <select name="domain" class="border rounded px-2 py-1.5 text-sm">
            <option value="">All domains</option>
            {domains.map((d: any) => <option value={d.code} selected={filters.domain===d.code}>{d.code} — {d.name}</option>)}
          </select>
        </label>
        <label class="flex flex-col text-xs"><span class="text-slate-600 mb-1">Observation type</span>
          <select name="type" class="border rounded px-2 py-1.5 text-sm">
            <option value="">All types</option>
            <option value="mini" selected={filters.type==='mini'}>Mini</option>
            <option value="formal" selected={filters.type==='formal'}>Formal</option>
            <option value="annual_summary" selected={filters.type==='annual_summary'}>Annual summary</option>
          </select>
        </label>
        <label class="flex flex-col text-xs"><span class="text-slate-600 mb-1">Sort by</span>
          <select name="sort" class="border rounded px-2 py-1.5 text-sm">
            <option value="avg_desc" selected={filters.sort==='avg_desc'}>Avg score ↓</option>
            <option value="avg_asc" selected={filters.sort==='avg_asc'}>Avg score ↑</option>
            <option value="n_desc" selected={filters.sort==='n_desc'}># scores ↓</option>
            <option value="n_asc" selected={filters.sort==='n_asc'}># scores ↑</option>
            <option value="name_asc" selected={filters.sort==='name_asc'}>Name A-Z</option>
            <option value="name_desc" selected={filters.sort==='name_desc'}>Name Z-A</option>
          </select>
        </label>
        <button class="bg-aps-navy text-white px-3 py-1.5 rounded text-sm hover:bg-aps-blue"><i class="fas fa-filter mr-1"></i>Apply</button>
        <a href="/superintendent/insights" class="text-xs text-slate-500 hover:underline ml-1">Clear</a>
      </form>

      {/* Summary KPIs */}
      <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div class="bg-white border border-slate-200 rounded p-3"><div class="text-xs text-slate-500">Scored indicators</div><div class="text-2xl font-display text-aps-navy">{n}</div></div>
        <div class="bg-white border border-slate-200 rounded p-3"><div class="text-xs text-slate-500">Teachers represented</div><div class="text-2xl font-display text-aps-navy">{summary.n_teachers || 0}</div></div>
        <div class="bg-white border border-slate-200 rounded p-3"><div class="text-xs text-slate-500">Observations</div><div class="text-2xl font-display text-aps-navy">{summary.n_observations || 0}</div></div>
        <div class="bg-white border border-slate-200 rounded p-3"><div class="text-xs text-slate-500">Appraisers active</div><div class="text-2xl font-display text-aps-navy">{summary.n_appraisers || 0}</div></div>
        <div class={`border rounded p-3 ${avgColor(summary.avg_level ? Number(summary.avg_level) : null)}`}><div class="text-xs opacity-80">Average score</div><div class="text-2xl font-display">{avg}</div><div class="text-xs opacity-80">{avgLabel(summary.avg_level ? Number(summary.avg_level) : null)}</div></div>
      </div>

      {/* Rating distribution stacked bar */}
      {n > 0 ? (
        <Card title="Rating distribution (current filter)" icon="fas fa-chart-column" class="mb-4">
          <div class="flex h-8 w-full rounded overflow-hidden border border-slate-200 text-xs text-white font-medium">
            <div style={`width:${pct(summary.n4)}%`} class="bg-emerald-500 flex items-center justify-center">{pct(summary.n4) > 6 ? `${pct(summary.n4)}% HE` : ''}</div>
            <div style={`width:${pct(summary.n3)}%`} class="bg-sky-500 flex items-center justify-center">{pct(summary.n3) > 6 ? `${pct(summary.n3)}% E` : ''}</div>
            <div style={`width:${pct(summary.n2)}%`} class="bg-amber-500 flex items-center justify-center">{pct(summary.n2) > 6 ? `${pct(summary.n2)}% IN` : ''}</div>
            <div style={`width:${pct(summary.n1)}%`} class="bg-red-500 flex items-center justify-center">{pct(summary.n1) > 6 ? `${pct(summary.n1)}% DNM` : ''}</div>
          </div>
          <div class="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-slate-600">
            <div><span class="inline-block w-3 h-3 rounded-full bg-emerald-500 mr-1"></span>Highly Effective — {summary.n4 || 0}</div>
            <div><span class="inline-block w-3 h-3 rounded-full bg-sky-500 mr-1"></span>Effective — {summary.n3 || 0}</div>
            <div><span class="inline-block w-3 h-3 rounded-full bg-amber-500 mr-1"></span>Improvement Necessary — {summary.n2 || 0}</div>
            <div><span class="inline-block w-3 h-3 rounded-full bg-red-500 mr-1"></span>Does Not Meet — {summary.n1 || 0}</div>
          </div>
        </Card>
      ) : null}

      {/* Main group-by table */}
      <Card title={`Performance by ${groupBy}`} icon="fas fa-layer-group" class="mb-4">
        {groups.length === 0 ? <p class="text-sm text-slate-500">No scored indicators match the current filters.</p> : (
          <div class="overflow-x-auto"><table class="w-full text-sm">
            <thead>
              <tr class="text-left border-b border-slate-200 text-slate-600">
                <th class="py-2">{groupBy === 'domain' ? 'Domain' : groupBy === 'appraiser' ? 'Appraiser' : groupBy === 'teacher' ? 'Teacher' : 'School'}</th>
                <th>Observations</th>
                <th>Scores</th>
                <th class="w-[200px]">Average</th>
                <th class="w-[260px]">Distribution</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g: any) => {
                const gn = Number(g.n_scores || 0);
                const gPct = (x: any) => gn > 0 ? Math.round((Number(x) / gn) * 100) : 0;
                const aAvg = g.avg_level ? Number(g.avg_level) : null;
                return (
                  <tr class="border-b border-slate-100 align-top">
                    <td class="py-2">
                      <div class="font-medium text-aps-navy">{g.label}</div>
                      <div class="text-xs text-slate-500">{g.sublabel}</div>
                    </td>
                    <td class="text-slate-700">{g.n_observations}</td>
                    <td class="text-slate-700">{gn}</td>
                    <td>
                      <div class={`inline-flex items-center gap-2 px-2 py-1 rounded ${avgColor(aAvg)}`}>
                        <span class="font-display text-lg leading-none">{aAvg ? aAvg.toFixed(2) : '—'}</span>
                        <span class="text-xs opacity-90">/ 4.0</span>
                      </div>
                      <div class="text-xs text-slate-500 mt-1">{avgLabel(aAvg)}</div>
                    </td>
                    <td>
                      <div class="flex h-4 w-full rounded overflow-hidden border border-slate-200">
                        <div style={`width:${gPct(g.n4)}%`} class="bg-emerald-500" title={`HE: ${g.n4}`}></div>
                        <div style={`width:${gPct(g.n3)}%`} class="bg-sky-500" title={`E: ${g.n3}`}></div>
                        <div style={`width:${gPct(g.n2)}%`} class="bg-amber-500" title={`IN: ${g.n2}`}></div>
                        <div style={`width:${gPct(g.n1)}%`} class="bg-red-500" title={`DNM: ${g.n1}`}></div>
                      </div>
                      <div class="text-[10px] text-slate-500 mt-1">HE {g.n4||0} · E {g.n3||0} · IN {g.n2||0} · DNM {g.n1||0}</div>
                    </td>
                    <td class="text-right">
                      {groupBy === 'teacher' ? (
                        <a href={`/superintendent/teachers/${g.group_id}`} class="text-xs text-aps-blue hover:underline">View →</a>
                      ) : groupBy === 'school' ? (
                        <a href={`/superintendent/insights?school=${g.group_id}&group=teacher`} class="text-xs text-aps-blue hover:underline">Drill in →</a>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table></div>
        )}
      </Card>

      <div class="grid md:grid-cols-2 gap-4 mb-4">
        {/* Domain heatmap */}
        <Card title="Domain heatmap" icon="fas fa-temperature-half">
          {heatmap.length === 0 ? <p class="text-sm text-slate-500">No data.</p> : (
            <ul class="space-y-2">
              {heatmap.map((h: any) => {
                const a = h.avg_level ? Number(h.avg_level) : null;
                return (
                  <li>
                    <div class="flex items-center justify-between text-xs text-slate-600 mb-1">
                      <span class="font-medium"><strong class="text-aps-navy">{h.domain_code}</strong> · {h.domain_name}</span>
                      <span>{a ? a.toFixed(2) : '—'} · {h.n_scores} scored</span>
                    </div>
                    <div class="h-3 w-full rounded bg-slate-100 overflow-hidden">
                      <div class={`h-full ${avgColor(a).split(' ')[0]}`} style={`width:${a ? Math.round(((a - 1) / 3) * 100) : 0}%`}></div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* PD hotspots */}
        <Card title="PD hotspots (lowest-scoring indicators)" icon="fas fa-bullseye">
          {pdHotspots.length === 0 ? <p class="text-sm text-slate-500">No data.</p> : (
            <ol class="text-sm space-y-2 list-decimal list-inside">
              {pdHotspots.map((p: any) => {
                const a = p.avg_level ? Number(p.avg_level) : null;
                return (
                  <li class="leading-tight">
                    <span class="font-medium text-aps-navy">{p.domain_code}.{String(p.indicator_code||'').toUpperCase()}</span> {p.indicator_name}
                    <span class={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${avgColor(a)}`}>{a ? a.toFixed(2) : '—'}</span>
                    <span class="text-xs text-slate-500 ml-1">({p.n_scores} scored)</span>
                  </li>
                );
              })}
            </ol>
          )}
          <p class="text-xs text-slate-500 mt-3"><i class="fas fa-circle-info mr-1"></i>These are the lowest-scoring indicators district-wide. Cross-reference with the <a href="/admin/pedagogy" class="text-aps-blue hover:underline">Pedagogy Library</a> to design targeted PD.</p>
        </Card>
      </div>

      {/* Recent feedback stream */}
      <Card title="Recent feedback shared with teachers" icon="fas fa-comments" class="mb-4">
        {feedback.length === 0 ? <p class="text-sm text-slate-500">No published feedback yet.</p> : (
          <ul class="space-y-2">
            {feedback.slice(0, 20).map((f: any) => (
              <li class="border border-slate-200 rounded-md p-3 text-sm">
                <div class="flex flex-wrap items-center gap-2 text-xs text-slate-500 mb-1">
                  <span class={`px-2 py-0.5 rounded-full border ${categoryColor(f.category)}`}>{categoryLabel(f.category)}</span>
                  {f.domain_code ? <span class="text-xs bg-slate-100 border border-slate-200 px-2 py-0.5 rounded-full"><strong>{f.domain_code}.{String(f.indicator_code||'').toUpperCase()}</strong></span> : null}
                  <span>→ {f.t_first} {f.t_last}</span>
                  <span>· by {f.a_first} {f.a_last}</span>
                  <span>· <a href={`/superintendent/observations/${f.obs_id}`} class="text-aps-blue hover:underline">open observation</a></span>
                </div>
                {f.title ? <div class="font-medium text-aps-navy">{f.title}</div> : null}
                {f.description ? <div class="text-slate-700 text-xs whitespace-pre-wrap">{String(f.description).slice(0, 300)}{String(f.description).length > 300 ? '…' : ''}</div> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Layout>
  );
}

function categoryColor(c: string): string {
  const map: Record<string,string> = {
    glow: 'bg-emerald-50 border-emerald-300 text-emerald-800',
    grow: 'bg-amber-50 border-amber-300 text-amber-800',
    focus_area: 'bg-indigo-50 border-indigo-300 text-indigo-800',
    next_step: 'bg-sky-50 border-sky-300 text-sky-800',
  };
  return map[c] || 'bg-slate-100 border-slate-200 text-slate-700';
}
function categoryLabel(c: string): string {
  return ({ glow: 'Glow', grow: 'Grow', focus_area: 'Focus area', next_step: 'Next step' } as any)[c] || c;
}
