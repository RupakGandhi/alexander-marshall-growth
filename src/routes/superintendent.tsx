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
  const kpis = await computeDistrictKpis(c.env.DB);
  const bySchool = await c.env.DB.prepare(
    `SELECT s.id, s.name, s.grade_span,
       (SELECT COUNT(*) FROM users u WHERE u.school_id = s.id AND u.role='teacher' AND u.active=1) AS teachers,
       (SELECT COUNT(*) FROM observations o JOIN users u ON u.id = o.teacher_id WHERE u.school_id = s.id) AS total_obs,
       (SELECT COUNT(*) FROM observations o JOIN users u ON u.id = o.teacher_id WHERE u.school_id = s.id AND (o.status='published' OR o.status='acknowledged')) AS published_obs
     FROM schools s WHERE s.district_id=1 ORDER BY s.name`
  ).all();
  return c.html(<SuperintendentHome user={user} kpis={kpis} schools={bySchool.results || []} />);
});

// By school drill-down
app.get('/schools', async (c) => {
  const user = c.get('user')!;
  const schools = await c.env.DB.prepare(`SELECT * FROM schools WHERE district_id=1 ORDER BY name`).all();
  const data: any[] = [];
  for (const s of (schools.results as any[])) {
    const teachers = await c.env.DB.prepare(
      `SELECT u.id, u.first_name, u.last_name, u.title,
         (SELECT COUNT(*) FROM observations o WHERE o.teacher_id = u.id AND (o.status='published' OR o.status='acknowledged')) AS pub,
         (SELECT MAX(observed_at) FROM observations o WHERE o.teacher_id = u.id) AS last_obs
       FROM users u WHERE u.role='teacher' AND u.school_id=? AND u.active=1 ORDER BY u.last_name, u.first_name`
    ).bind(s.id).all();
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

function SuperintendentHome({ user, kpis, schools }: any) {
  return (
    <Layout title="District Overview" user={user} activeNav="supt-home">
      <h1 class="font-display text-2xl text-aps-navy mb-1">District Overview</h1>
      <p class="text-slate-600 text-sm mb-6">Alexander Public School District · {kpis.teachers} teachers · {schools.length} schools</p>

      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
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
            <div class="mt-2 grid grid-cols-4 gap-2 text-xs text-slate-600">
              <div><span class="inline-block w-3 h-3 rounded-full bg-emerald-500 mr-1"></span>Highly Effective — {kpis.distribution[4]}</div>
              <div><span class="inline-block w-3 h-3 rounded-full bg-sky-500 mr-1"></span>Effective — {kpis.distribution[3]}</div>
              <div><span class="inline-block w-3 h-3 rounded-full bg-amber-500 mr-1"></span>Improvement Necessary — {kpis.distribution[2]}</div>
              <div><span class="inline-block w-3 h-3 rounded-full bg-red-500 mr-1"></span>Does Not Meet — {kpis.distribution[1]}</div>
            </div>
          </div>
        }
      </Card>

      <Card title="By School" icon="fas fa-school" class="mt-4">
        <table class="w-full text-sm">
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
        </table>
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
      <div class="space-y-4">
        {data.map((d: any) => (
          <Card title={`${d.school.name} · ${d.school.grade_span || ''}`} icon="fas fa-school">
            <table class="w-full text-sm">
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
            </table>
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
      <Card>
        <table class="w-full text-sm">
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
        </table>
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
          <table class="w-full text-sm">
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
          </table>
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
          <table class="w-full text-sm">
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
          </table>
        </Card>
      )}
    </Layout>
  );
}
