// ============================================================================
// Reports — the "Report Builder"
// ----------------------------------------------------------------------------
// One intuitive page that lets any authorized user pick EXACTLY what they
// want (teachers, schools, appraisers, observation types, date range) and
// EXACTLY which sections to include (scores, strengths, growth areas, etc.),
// then download the result as CSV (for spreadsheets) or as a print-ready
// PDF (Browser → Print → Save as PDF).
//
// Multi-select everywhere: teachers, schools, and appraisers are all
// native <select multiple>. Each role only sees targets they are allowed
// to report on:
//   super_admin / superintendent — district-wide
//   appraiser                    — teachers they are assigned to evaluate
//   coach                        — teachers they are assigned to coach
//   teacher                      — themselves only
// ============================================================================

import { Hono } from 'hono';
import type { Bindings, Variables } from '../lib/types';
import { Layout, Card } from '../lib/layout';
import { requireAuth } from '../lib/auth';
import { getActiveFramework, logActivity, schoolScopeForUser } from '../lib/db';
import { buildCsv } from '../lib/csv';
import { escapeHtml, formatDate, formatDateTime, levelLabels, statusLabel } from '../lib/ui';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use('*', requireAuth());

// ---------------------------------------------------------------------------
// Filter parsing — all multi-select fields come in as repeated form values
// (e.g. ?teacher_ids=1&teacher_ids=5&teacher_ids=17). Hono's c.req.queries()
// returns arrays, which we reuse.
// ---------------------------------------------------------------------------
interface ReportFilters {
  from: string | null;
  to: string | null;
  teacherIds: number[];
  appraiserIds: number[];
  schoolIds: number[];
  types: string[];
}
function parseFilters(c: any): ReportFilters {
  const ids = (name: string): number[] => {
    const arr = c.req.queries(name) || [];
    const out: number[] = [];
    for (const v of arr) {
      const n = Number(String(v).trim());
      if (Number.isFinite(n) && n > 0) out.push(n);
    }
    return Array.from(new Set(out));
  };
  const strs = (name: string): string[] => {
    const arr = c.req.queries(name) || [];
    return Array.from(new Set(arr.map((s: string) => String(s).trim()).filter(Boolean)));
  };
  return {
    from: (c.req.query('from') || '').trim() || null,
    to: (c.req.query('to') || '').trim() || null,
    teacherIds: ids('teacher_ids'),
    appraiserIds: ids('appraiser_ids'),
    schoolIds: ids('school_ids'),
    types: strs('types'),
  };
}

// Build the core observation query, honouring role scoping AND multi-select.
async function scopedObservations(db: D1Database, user: any, f: ReportFilters) {
  const binds: any[] = [];
  let sql =
    `SELECT DISTINCT o.*,
            t.first_name AS t_first, t.last_name AS t_last, t.email AS t_email, t.title AS t_title, t.id AS t_id,
            a.first_name AS a_first, a.last_name AS a_last, a.title AS a_title, a.id AS a_id,
            s.name AS school_name, s.id AS school_id
       FROM observations o
       JOIN users t ON t.id = o.teacher_id
       JOIN users a ON a.id = o.appraiser_id
       LEFT JOIN schools s ON s.id = t.school_id
      WHERE o.status IN ('published','acknowledged')`;

  // --- Role scoping ---
  if (user.role === 'appraiser') {
    sql += ` AND o.teacher_id IN (SELECT teacher_id FROM assignments WHERE staff_id=? AND relationship='appraiser' AND active=1)`;
    binds.push(user.id);
  } else if (user.role === 'coach') {
    sql += ` AND o.teacher_id IN (SELECT teacher_id FROM assignments WHERE staff_id=? AND relationship='coach' AND active=1)`;
    binds.push(user.id);
  } else if (user.role === 'teacher') {
    sql += ` AND o.teacher_id = ?`; binds.push(user.id);
  }
  // super_admin and superintendent: no extra scoping — district-wide.

  // --- User-picked filters (IN (...) patterns) ---
  if (f.from) { sql += ` AND date(o.observed_at) >= date(?)`; binds.push(f.from); }
  if (f.to)   { sql += ` AND date(o.observed_at) <= date(?)`; binds.push(f.to); }
  if (f.teacherIds.length) {
    sql += ` AND o.teacher_id IN (${f.teacherIds.map(() => '?').join(',')})`;
    binds.push(...f.teacherIds);
  }
  if (f.appraiserIds.length) {
    sql += ` AND o.appraiser_id IN (${f.appraiserIds.map(() => '?').join(',')})`;
    binds.push(...f.appraiserIds);
  }
  if (f.schoolIds.length) {
    // Match either the teacher's primary school_id OR any user_schools link —
    // so multi-school teachers show up for whichever school the user picked.
    sql += ` AND (t.school_id IN (${f.schoolIds.map(() => '?').join(',')})
                  OR t.id IN (SELECT user_id FROM user_schools WHERE school_id IN (${f.schoolIds.map(() => '?').join(',')})))`;
    binds.push(...f.schoolIds, ...f.schoolIds);
  }
  if (f.types.length) {
    sql += ` AND o.observation_type IN (${f.types.map(() => '?').join(',')})`;
    binds.push(...f.types);
  }

  sql += ` ORDER BY o.observed_at DESC, o.id DESC`;
  const rows = await db.prepare(sql).bind(...binds).all();
  return (rows.results as any[]) || [];
}

async function loadObservationDetails(db: D1Database, observationIds: number[]) {
  if (observationIds.length === 0) return { scores: [], feedback: [] };
  const placeholders = observationIds.map(() => '?').join(',');
  const scores = await db.prepare(
    `SELECT s.*, i.name AS indicator_name, i.code AS indicator_code, d.code AS domain_code, d.name AS domain_name
       FROM observation_scores s
       JOIN framework_indicators i ON i.id = s.indicator_id
       JOIN framework_domains d ON d.id = i.domain_id
      WHERE s.observation_id IN (${placeholders})
      ORDER BY d.sort_order, i.sort_order`
  ).bind(...observationIds).all();
  const feedback = await db.prepare(
    `SELECT fi.*, i.name AS indicator_name, i.code AS indicator_code, d.code AS domain_code
       FROM feedback_items fi
       LEFT JOIN framework_indicators i ON i.id = fi.indicator_id
       LEFT JOIN framework_domains d ON d.id = i.domain_id
      WHERE fi.observation_id IN (${placeholders})
      ORDER BY fi.sort_order, fi.id`
  ).bind(...observationIds).all();
  return { scores: (scores.results as any[]) || [], feedback: (feedback.results as any[]) || [] };
}

// ---------------------------------------------------------------------------
// Build dropdown lookups, scoped by role so the UI only shows things the
// user is actually allowed to report on.
// ---------------------------------------------------------------------------
async function buildLookups(db: D1Database, user: any) {
  let teachers: any[] = [], appraisers: any[] = [], schools: any[] = [];

  if (user.role === 'teacher') {
    teachers = [{ id: user.id, first_name: user.first_name, last_name: user.last_name, school_name: '' }];
  } else if (user.role === 'appraiser') {
    const r = await db.prepare(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, sc.name AS school_name
         FROM users u
         JOIN assignments a ON a.teacher_id = u.id AND a.relationship='appraiser' AND a.active=1
         LEFT JOIN schools sc ON sc.id = u.school_id
        WHERE a.staff_id=? AND u.active=1
        ORDER BY u.last_name, u.first_name`
    ).bind(user.id).all();
    teachers = (r.results as any[]) || [];
  } else if (user.role === 'coach') {
    const r = await db.prepare(
      `SELECT DISTINCT u.id, u.first_name, u.last_name, sc.name AS school_name
         FROM users u
         JOIN assignments a ON a.teacher_id = u.id AND a.relationship='coach' AND a.active=1
         LEFT JOIN schools sc ON sc.id = u.school_id
        WHERE a.staff_id=? AND u.active=1
        ORDER BY u.last_name, u.first_name`
    ).bind(user.id).all();
    teachers = (r.results as any[]) || [];
  } else {
    // district-wide
    const r = await db.prepare(
      `SELECT u.id, u.first_name, u.last_name, sc.name AS school_name
         FROM users u LEFT JOIN schools sc ON sc.id = u.school_id
        WHERE u.role='teacher' AND u.active=1 ORDER BY u.last_name, u.first_name`
    ).all();
    teachers = (r.results as any[]) || [];
  }

  if (user.role === 'appraiser' || user.role === 'teacher' || user.role === 'coach') {
    appraisers = user.role === 'appraiser'
      ? [{ id: user.id, first_name: user.first_name, last_name: user.last_name, role: 'appraiser' }]
      : []; // teachers & coaches don't need to filter by appraiser — scoping already handles it
  } else {
    const r = await db.prepare(
      `SELECT id, first_name, last_name, role FROM users
        WHERE role IN ('appraiser','superintendent','super_admin') AND active=1
        ORDER BY last_name, first_name`
    ).all();
    appraisers = (r.results as any[]) || [];
  }

  // Schools: if the user is multi-school, only show their schools; otherwise all district schools.
  const scope = await schoolScopeForUser(db, user);
  if (scope.length) {
    const placeholders = scope.map(() => '?').join(',');
    const r = await db.prepare(
      `SELECT id, name, grade_span FROM schools WHERE id IN (${placeholders}) ORDER BY name`
    ).bind(...scope).all();
    schools = (r.results as any[]) || [];
  } else {
    const r = await db.prepare(
      `SELECT id, name, grade_span FROM schools WHERE district_id=1 ORDER BY name`
    ).all();
    schools = (r.results as any[]) || [];
  }
  return { teachers, appraisers, schools };
}

// ---------------------------------------------------------------------------
// GET /reports — the Report Builder page
// ---------------------------------------------------------------------------
app.get('/', async (c) => {
  const user = c.get('user')!;
  if (!['super_admin','superintendent','appraiser','coach','teacher'].includes(user.role)) {
    return c.text('Forbidden', 403);
  }
  const f = parseFilters(c);
  const observations = await scopedObservations(c.env.DB, user, f);
  const lookups = await buildLookups(c.env.DB, user);
  return c.html(<ReportsPage user={user} f={f} observations={observations} {...lookups} />);
});

// ---------------------------------------------------------------------------
// POST /reports/export — single entry-point for BOTH CSV and PDF
// The form posts the current filter + include selections. Two submit buttons
// share the same form and differentiate via the `format` field.
// ---------------------------------------------------------------------------
app.post('/export', async (c) => {
  const user = c.get('user')!;
  if (!['super_admin','superintendent','appraiser','coach','teacher'].includes(user.role)) {
    return c.text('Forbidden', 403);
  }
  const body = await c.req.parseBody({ all: true });
  const asQuery = (k: string, v: any) => {
    if (v === undefined || v === null) return '';
    if (Array.isArray(v)) return v.map(x => `${encodeURIComponent(k)}=${encodeURIComponent(String(x))}`).join('&');
    return `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`;
  };
  // Rebuild the query string so both CSV and PDF handlers (which read from
  // c.req.query()) receive the exact same selections.
  const parts: string[] = [];
  for (const k of ['from','to']) parts.push(asQuery(k, body[k]));
  for (const k of ['teacher_ids','appraiser_ids','school_ids','types','sections']) parts.push(asQuery(k, body[k]));
  const includes = ['inc_scores','inc_glows','inc_grows','inc_focus','inc_next_steps','inc_notes','inc_signatures','inc_summary'];
  for (const k of includes) parts.push(asQuery(k, body[k] ? '1' : '0'));
  const qs = parts.filter(Boolean).join('&');
  const format = String(body.format || 'csv');
  if (format === 'pdf') return c.redirect('/reports/pdf?' + qs);
  // CSV needs a mode — we respect what the user checked in the sections list.
  const mode = String(body.csv_mode || 'summary');
  return c.redirect(`/reports/csv?${qs}&mode=${encodeURIComponent(mode)}`);
});

// ---------------------------------------------------------------------------
// CSV exports — supports all the modes the builder exposes
// ---------------------------------------------------------------------------
app.get('/csv', async (c) => {
  const user = c.get('user')!;
  const mode = String(c.req.query('mode') || 'summary');
  const f = parseFilters(c);
  const observations = await scopedObservations(c.env.DB, user, f);
  const ids = observations.map(o => o.id as number);
  const { scores, feedback } = await loadObservationDetails(c.env.DB, ids);

  let headers: string[] = [];
  let rows: any[][] = [];
  const filename = `observations_${mode}_${new Date().toISOString().slice(0,10)}.csv`;

  if (mode === 'summary') {
    headers = ['observation_id','observed_at','type','status','teacher','teacher_email','school','appraiser','subject','grade_level','location','duration_minutes','overall_summary','avg_level','scored_indicators','glow_count','grow_count','focus_area_count','next_step_count','published_at','acknowledged_at'];
    const sBy = groupBy(scores, s => s.observation_id);
    const fbBy = groupBy(feedback, x => x.observation_id);
    for (const o of observations) {
      const s = sBy.get(o.id) || [];
      const fb = fbBy.get(o.id) || [];
      const avg = s.length ? (s.reduce((a: number, x: any) => a + (x.level || 0), 0) / s.length) : null;
      rows.push([
        o.id, o.observed_at, o.observation_type, o.status,
        `${o.t_last}, ${o.t_first}`, o.t_email, o.school_name || '',
        `${o.a_last}, ${o.a_first}`, o.subject || '', o.grade_level || '', o.location || '', o.duration_minutes || '',
        (o.overall_summary || '').replace(/\s+/g,' ').trim(),
        avg !== null ? avg.toFixed(2) : '', s.length,
        fb.filter((x:any)=>x.category==='glow').length,
        fb.filter((x:any)=>x.category==='grow').length,
        fb.filter((x:any)=>x.category==='focus_area').length,
        fb.filter((x:any)=>x.category==='next_step').length,
        o.published_at || '', o.teacher_acknowledged_at || '',
      ]);
    }
  } else if (mode === 'scores') {
    headers = ['observation_id','observed_at','teacher','school','appraiser','domain_code','indicator_code','indicator_name','level','level_label','evidence_note'];
    const obsMap = new Map(observations.map(o => [o.id, o] as const));
    for (const s of scores) {
      const o = obsMap.get(s.observation_id); if (!o) continue;
      rows.push([
        o.id, o.observed_at, `${o.t_last}, ${o.t_first}`, o.school_name || '',
        `${o.a_last}, ${o.a_first}`,
        s.domain_code, (s.indicator_code || '').toUpperCase(), s.indicator_name,
        s.level, s.level ? (levelLabels as any)[s.level] : '', (s.evidence_note || '').replace(/\s+/g,' ').trim(),
      ]);
    }
  } else if (['feedback','glows','grows','focus','next_steps'].includes(mode)) {
    headers = ['observation_id','observed_at','teacher','school','appraiser','category','domain_code','indicator_code','indicator_name','title','body'];
    const obsMap = new Map(observations.map(o => [o.id, o] as const));
    const wanted = mode === 'glows' ? 'glow' : mode === 'grows' ? 'grow' : mode === 'focus' ? 'focus_area' : mode === 'next_steps' ? 'next_step' : null;
    for (const fi of feedback) {
      if (wanted && fi.category !== wanted) continue;
      const o = obsMap.get(fi.observation_id); if (!o) continue;
      rows.push([
        o.id, o.observed_at, `${o.t_last}, ${o.t_first}`, o.school_name || '',
        `${o.a_last}, ${o.a_first}`, fi.category,
        fi.domain_code || '', (fi.indicator_code || '').toUpperCase(), fi.indicator_name || '',
        fi.title || '', (fi.body || '').replace(/\s+/g,' ').trim(),
      ]);
    }
  } else if (mode === 'full') {
    headers = ['observation_id','observed_at','type','status','teacher','teacher_email','school','appraiser','subject','grade_level','location','duration_minutes','class_context','overall_summary','scores','strengths_glows','growth_areas_grows','focus_areas','next_steps','published_at','acknowledged_at','teacher_response'];
    const sBy = groupBy(scores, s => s.observation_id);
    const fbBy = groupBy(feedback, x => x.observation_id);
    for (const o of observations) {
      const s = sBy.get(o.id) || [];
      const fb = fbBy.get(o.id) || [];
      const scoreStr = s.map((x: any) => `${x.domain_code}.${(x.indicator_code||'').toUpperCase()} ${x.indicator_name}: ${x.level} (${x.level ? (levelLabels as any)[x.level] : ''})`).join(' | ');
      const byCat = (cat: string) => fb.filter((x:any)=>x.category===cat).map((x:any) => (x.title ? `${x.title}: ` : '') + (x.body || '')).join(' | ');
      rows.push([
        o.id, o.observed_at, o.observation_type, o.status,
        `${o.t_last}, ${o.t_first}`, o.t_email, o.school_name || '',
        `${o.a_last}, ${o.a_first}`, o.subject || '', o.grade_level || '', o.location || '', o.duration_minutes || '',
        (o.class_context || '').replace(/\s+/g,' ').trim(),
        (o.overall_summary || '').replace(/\s+/g,' ').trim(),
        scoreStr, byCat('glow'), byCat('grow'), byCat('focus_area'), byCat('next_step'),
        o.published_at || '', o.teacher_acknowledged_at || '',
        (o.teacher_response || '').replace(/\s+/g,' ').trim(),
      ]);
    }
  } else {
    return c.text('Unknown report mode', 400);
  }

  await logActivity(c.env.DB, user.id, 'report', null, 'csv_export', { mode, count: rows.length, filters: f });
  const csv = buildCsv(headers, rows);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
});

// ---------------------------------------------------------------------------
// PDF (printable HTML) — honours per-section include flags
// ---------------------------------------------------------------------------
app.get('/pdf', async (c) => {
  const user = c.get('user')!;
  const q = c.req.query.bind(c.req);
  // Sections default ON so "just click PDF" produces a complete report.
  const include = {
    scores: q('inc_scores') !== '0',
    glows: q('inc_glows') !== '0',
    grows: q('inc_grows') !== '0',
    focus: q('inc_focus') !== '0',
    nextSteps: q('inc_next_steps') !== '0',
    notes: q('inc_notes') === '1', // private notes are OFF by default (appraiser-only)
    signatures: q('inc_signatures') !== '0',
    summary: q('inc_summary') !== '0',
  };
  // Teachers never see private notes no matter what.
  if (user.role === 'teacher' || user.role === 'coach') include.notes = false;

  const f = parseFilters(c);
  const observations = await scopedObservations(c.env.DB, user, f);
  const ids = observations.map(o => o.id as number);
  const { scores, feedback } = await loadObservationDetails(c.env.DB, ids);
  const sBy = groupBy(scores, s => s.observation_id);
  const fbBy = groupBy(feedback, x => x.observation_id);
  const district = await c.env.DB.prepare(`SELECT * FROM districts WHERE id=1`).first<any>();
  const fw = await getActiveFramework(c.env.DB);

  await logActivity(c.env.DB, user.id, 'report', null, 'pdf_export', { count: observations.length, filters: f, include });

  const title = observations.length === 1
    ? `Observation — ${observations[0].t_first} ${observations[0].t_last} — ${formatDate(observations[0].observed_at)}`
    : `Observation Report (${observations.length} observations)`;

  const css = `
    @page { size: Letter; margin: 0.6in 0.7in; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #0b2545; font-size: 11pt; line-height: 1.4; }
    h1, h2, h3 { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0b2545; }
    h1 { font-size: 20pt; margin: 0 0 2pt; }
    h2 { font-size: 14pt; margin: 14pt 0 4pt; border-bottom: 1pt solid #cbd5e1; padding-bottom: 2pt; }
    h3 { font-size: 11pt; margin: 8pt 0 2pt; color: #1e3a8a; }
    .muted { color: #475569; font-size: 9.5pt; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 3pt 12pt; font-size: 10pt; }
    .meta-grid b { color: #0b2545; }
    .obs { page-break-inside: avoid; margin-bottom: 18pt; border-top: 2pt solid #0b2545; padding-top: 6pt; }
    .obs:first-of-type { border-top: none; padding-top: 0; }
    .page-break { page-break-before: always; }
    table.scores { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 4pt; }
    table.scores th, table.scores td { border: 0.75pt solid #cbd5e1; padding: 4pt 6pt; text-align: left; vertical-align: top; }
    table.scores th { background: #e2e8f0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.5pt; }
    .lvl-4 { background: #d1fae5; } .lvl-3 { background: #dbeafe; } .lvl-2 { background: #fef3c7; } .lvl-1 { background: #fee2e2; }
    .chips span { display: inline-block; border: 0.75pt solid #cbd5e1; padding: 1pt 4pt; border-radius: 2pt; margin: 0 3pt 2pt 0; font-size: 9pt; background: #f8fafc; }
    .fb-item { margin-bottom: 4pt; } .fb-item .t { font-weight: bold; }
    .sig { margin-top: 10pt; display: flex; gap: 24pt; }
    .sig .box { flex: 1; border: 0.75pt solid #cbd5e1; padding: 4pt; min-height: 40pt; }
    .sig img { max-height: 40pt; }
    .footer { margin-top: 6pt; font-size: 8.5pt; color: #64748b; text-align: center; }
    .print-bar { background: #0b2545; color: white; padding: 8pt 12pt; display: flex; justify-content: space-between; align-items: center; font-family: 'Helvetica Neue', Arial, sans-serif; }
    .print-bar button, .print-bar a { background: #facc15; color: #0b2545; border: none; padding: 5pt 10pt; border-radius: 3pt; font-weight: bold; text-decoration: none; cursor: pointer; margin-left: 6pt; font-size: 10pt; }
    .print-bar a.secondary { background: white; color: #0b2545; }
    @media print { .print-bar { display: none; } body { margin: 0; } }
  `;

  const includedLabels: string[] = [];
  if (include.summary) includedLabels.push('Summary');
  if (include.scores) includedLabels.push('Scores');
  if (include.glows) includedLabels.push('Strengths');
  if (include.grows) includedLabels.push('Growth areas');
  if (include.focus) includedLabels.push('Focus areas');
  if (include.nextSteps) includedLabels.push('Next steps');
  if (include.notes) includedLabels.push('Private notes');
  if (include.signatures) includedLabels.push('Signatures');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>
<div class="print-bar">
  <div><strong>${escapeHtml(district?.name || 'District')}</strong> · Observation Report · ${observations.length} observation${observations.length!==1?'s':''}</div>
  <div>
    <a class="secondary" href="javascript:history.back()">← Back</a>
    <button onclick="window.print()">🖨 Print / Save as PDF</button>
  </div>
</div>
<div style="padding: 10pt 16pt;">
<h1>${escapeHtml(title)}</h1>
<div class="muted">${escapeHtml((fw as any)?.name || 'Evaluation Rubric')}${(fw as any)?.version ? ` · v${escapeHtml((fw as any).version)}` : ''} · Includes: ${escapeHtml(includedLabels.join(', ') || 'basic info only')} · Generated ${escapeHtml(new Date().toISOString().slice(0, 16).replace('T', ' '))}</div>

${observations.map((o, idx) => renderObservation(o, sBy.get(o.id) || [], fbBy.get(o.id) || [], include, idx > 0)).join('\n')}

${observations.length === 0 ? `<p class="muted" style="margin-top:18pt;">No observations match the selected filters.</p>` : ''}

<div class="footer">${escapeHtml(district?.name || '')} — ${escapeHtml(district?.address || '')}${district?.phone ? ` — ${escapeHtml(district.phone)}` : ''}</div>
</div>
</body></html>`;
  return c.html(html);
});

function renderObservation(o: any, scores: any[], feedback: any[], include: any, pageBreak: boolean): string {
  const classes = pageBreak ? 'obs page-break' : 'obs';
  const byCat = (cat: string) => feedback.filter(f => f.category === cat);
  const glows = byCat('glow'), grows = byCat('grow'), focus = byCat('focus_area'), next = byCat('next_step');
  const avg = scores.length ? (scores.reduce((a, s) => a + (s.level || 0), 0) / scores.length).toFixed(2) : '—';

  const scoreTable = scores.length === 0 ? '' : `
    <h3>Rubric Scores (${scores.length} indicator${scores.length!==1?'s':''}, avg ${avg}/4)</h3>
    <table class="scores">
      <thead><tr><th style="width:18%">Indicator</th><th style="width:8%">Score</th><th>Evidence</th></tr></thead>
      <tbody>
        ${scores.map(s => `
          <tr class="lvl-${s.level}">
            <td><b>${escapeHtml(s.domain_code)}.${escapeHtml((s.indicator_code||'').toUpperCase())}</b> ${escapeHtml(s.indicator_name)}</td>
            <td><b>${s.level || '—'}</b><br/><span class="muted">${escapeHtml(s.level ? (levelLabels as any)[s.level] : '')}</span></td>
            <td>${escapeHtml((s.evidence_note || '').trim())}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;

  const fbSection = (label: string, items: any[]) => items.length === 0 ? '' : `
    <h3>${escapeHtml(label)}</h3>
    <div>
      ${items.map(fi => `
        <div class="fb-item">
          ${fi.indicator_name ? `<span class="chips"><span>${escapeHtml(fi.domain_code || '')}.${escapeHtml((fi.indicator_code || '').toUpperCase())} ${escapeHtml(fi.indicator_name)}</span></span>` : ''}
          ${fi.title ? `<div class="t">${escapeHtml(fi.title)}</div>` : ''}
          <div>${escapeHtml(fi.body || '').replace(/\n/g, '<br/>')}</div>
        </div>`).join('')}
    </div>`;

  const sigs = !include.signatures ? '' : `
    <div class="sig">
      <div class="box">
        <div class="muted">Appraiser — ${escapeHtml(`${o.a_first} ${o.a_last}${o.a_title ? ', ' + o.a_title : ''}`)}</div>
        ${o.appraiser_signature_data ? `<img src="${o.appraiser_signature_data}" alt="Appraiser signature"/>` : '<div class="muted">Not signed</div>'}
        <div class="muted" style="font-size:9pt;">${escapeHtml(formatDateTime(o.appraiser_signed_at))}</div>
      </div>
      <div class="box">
        <div class="muted">Teacher — ${escapeHtml(`${o.t_first} ${o.t_last}`)}</div>
        ${o.teacher_signature_data ? `<img src="${o.teacher_signature_data}" alt="Teacher signature"/>` : '<div class="muted">Not yet acknowledged</div>'}
        <div class="muted" style="font-size:9pt;">${escapeHtml(formatDateTime(o.teacher_acknowledged_at))}</div>
        ${o.teacher_response ? `<div style="margin-top:4pt;"><i>Teacher response:</i> ${escapeHtml(o.teacher_response)}</div>` : ''}
      </div>
    </div>`;

  return `<section class="${classes}">
    <h2>${escapeHtml(`${o.t_first} ${o.t_last}`)}${o.t_title ? ` · <span class="muted" style="font-weight:normal;">${escapeHtml(o.t_title)}</span>` : ''}</h2>
    <div class="meta-grid">
      <div><b>Observed:</b> ${escapeHtml(formatDate(o.observed_at))}${o.duration_minutes ? ` (${o.duration_minutes} min)` : ''}</div>
      <div><b>Type:</b> ${escapeHtml((o.observation_type || '').replace('_',' '))}</div>
      <div><b>Appraiser:</b> ${escapeHtml(`${o.a_first} ${o.a_last}${o.a_title ? ', ' + o.a_title : ''}`)}</div>
      <div><b>School:</b> ${escapeHtml(o.school_name || '—')}</div>
      <div><b>Subject/Grade:</b> ${escapeHtml([o.subject, o.grade_level].filter(Boolean).join(' · ') || '—')}</div>
      <div><b>Location:</b> ${escapeHtml(o.location || '—')}</div>
      <div><b>Status:</b> ${escapeHtml(statusLabel(o.status))}</div>
      <div><b>Class context:</b> ${escapeHtml((o.class_context || '—').slice(0, 200))}</div>
    </div>
    ${include.summary && o.overall_summary ? `<h3>Overall Summary</h3><div>${escapeHtml(o.overall_summary).replace(/\n/g,'<br/>')}</div>` : ''}
    ${include.scores ? scoreTable : ''}
    ${include.glows ? fbSection('Strengths (Glows)', glows) : ''}
    ${include.grows ? fbSection('Growth Areas (Grows)', grows) : ''}
    ${include.focus ? fbSection('Focus Areas', focus) : ''}
    ${include.nextSteps ? fbSection('Suggested Next Steps', next) : ''}
    ${include.notes && o.private_notes ? `<h3>Private Appraiser Notes</h3><div class="muted">${escapeHtml(o.private_notes).replace(/\n/g,'<br/>')}</div>` : ''}
    ${sigs}
  </section>`;
}

function groupBy<T, K>(arr: T[], keyFn: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const item of arr) {
    const k = keyFn(item);
    const list = m.get(k) || [];
    list.push(item);
    m.set(k, list);
  }
  return m;
}

// ============================================================================
// ============================================================================
// PD Completion Report — /reports/pd
// ----------------------------------------------------------------------------
// A dedicated, sortable & filterable report on every PD enrollment that has
// passed through the system. Designed to answer questions like:
//   • "Show me every module my staff completed this quarter."
//   • "Which indicators are teachers working hardest on?"
//   • "Has Ms. Lopez finished her AR2 deliverables yet?"
//
// Scoping mirrors the rest of the platform:
//   super_admin / superintendent → district-wide
//   appraiser / coach            → only their assigned teachers
//   teacher                      → only themselves
//
// Filters (all optional, all multi-select-friendly):
//   teacher_ids[]   school_ids[]   domain_codes[]   indicator_ids[]
//   status[]        source         from=YYYY-MM-DD  to=YYYY-MM-DD
//
// Sort options: submitted, verified, teacher, indicator, status, module
// Output: same filter bar drives (a) on-screen table preview, (b) CSV export,
//         (c) drill-down page that shows the full deliverable + reflections.
// ============================================================================

interface PdFilters {
  teacherIds: number[];
  schoolIds: number[];
  domains: string[];       // domain codes like 'A','B','C'
  indicatorIds: number[];
  statuses: string[];
  source: string;          // 'auto' | 'self' | 'assigned' | ''
  from: string | null;
  to: string | null;
  sort: string;            // 'submitted' | 'verified' | 'teacher' | 'indicator' | 'status' | 'module'
}

function parsePdFilters(c: any): PdFilters {
  const numArr = (name: string): number[] => {
    const arr = c.req.queries(name) || [];
    const out: number[] = [];
    for (const v of arr) { const n = Number(String(v).trim()); if (Number.isFinite(n) && n > 0) out.push(n); }
    return out;
  };
  const strArr = (name: string): string[] => {
    const arr = c.req.queries(name) || [];
    return arr.map((v: any) => String(v).trim()).filter(Boolean);
  };
  return {
    teacherIds: numArr('teacher_ids'),
    schoolIds: numArr('school_ids'),
    domains: strArr('domain_codes'),
    indicatorIds: numArr('indicator_ids'),
    statuses: strArr('statuses'),
    source: String(c.req.query('source') || '').trim(),
    from: c.req.query('from') || null,
    to:   c.req.query('to')   || null,
    sort: String(c.req.query('sort') || 'submitted'),
  };
}

// Build a WHERE clause that reflects role-scoping + user filters. Returns
// { sql, binds } that callers can splice into their own SELECT.
async function pdScopeSql(db: D1Database, user: any, f: PdFilters) {
  const where: string[] = ['1=1'];
  const binds: any[] = [];

  // Role scoping
  if (user.role === 'teacher') {
    where.push('e.teacher_id = ?'); binds.push(user.id);
  } else if (user.role === 'appraiser' || user.role === 'coach') {
    where.push(`e.teacher_id IN (SELECT teacher_id FROM assignments WHERE staff_id = ? AND active = 1)`);
    binds.push(user.id);
  }

  if (f.teacherIds.length) {
    where.push(`e.teacher_id IN (${f.teacherIds.map(() => '?').join(',')})`);
    for (const x of f.teacherIds) binds.push(x);
  }
  if (f.schoolIds.length) {
    // Teacher can belong to multiple schools via user_schools join; fall back
    // to users.school_id when no row exists.
    const ph = f.schoolIds.map(() => '?').join(',');
    where.push(`(
      EXISTS (SELECT 1 FROM user_schools us WHERE us.user_id = e.teacher_id AND us.school_id IN (${ph}))
      OR (
        NOT EXISTS (SELECT 1 FROM user_schools us2 WHERE us2.user_id = e.teacher_id)
        AND (SELECT school_id FROM users WHERE id = e.teacher_id) IN (${ph})
      )
    )`);
    for (let i = 0; i < 2; i++) for (const x of f.schoolIds) binds.push(x);
  }
  if (f.domains.length) {
    where.push(`d.code IN (${f.domains.map(() => '?').join(',')})`);
    for (const x of f.domains) binds.push(x);
  }
  if (f.indicatorIds.length) {
    where.push(`m.indicator_id IN (${f.indicatorIds.map(() => '?').join(',')})`);
    for (const x of f.indicatorIds) binds.push(x);
  }
  if (f.statuses.length) {
    where.push(`e.status IN (${f.statuses.map(() => '?').join(',')})`);
    for (const x of f.statuses) binds.push(x);
  }
  if (f.source && ['auto','self','assigned'].includes(f.source)) {
    where.push(`e.source = ?`); binds.push(f.source);
  }
  if (f.from) { where.push(`date(COALESCE(e.submitted_at, e.verified_at, e.updated_at, e.created_at)) >= date(?)`); binds.push(f.from); }
  if (f.to)   { where.push(`date(COALESCE(e.submitted_at, e.verified_at, e.updated_at, e.created_at)) <= date(?)`); binds.push(f.to); }

  return { where: where.join(' AND '), binds };
}

function pdOrderBy(sort: string): string {
  switch (sort) {
    case 'verified':  return `e.verified_at DESC, e.updated_at DESC`;
    case 'teacher':   return `t.last_name, t.first_name, e.updated_at DESC`;
    case 'indicator': return `d.sort_order, i.sort_order, e.updated_at DESC`;
    case 'status':    return `e.status, e.updated_at DESC`;
    case 'module':    return `m.title, e.updated_at DESC`;
    case 'submitted':
    default:          return `COALESCE(e.submitted_at, e.updated_at) DESC`;
  }
}

// GET /reports/pd — the full report UI
app.get('/pd', async (c) => {
  const user = c.get('user')!;
  const f = parsePdFilters(c);
  const { where, binds } = await pdScopeSql(c.env.DB, user, f);
  const order = pdOrderBy(f.sort);

  const sql = `
    SELECT
      e.id                      AS enrollment_id,
      e.status, e.source, e.source_score_level,
      e.created_at, e.submitted_at, e.verified_at, e.updated_at,
      e.verification_note,
      t.id AS teacher_id, t.first_name AS t_first, t.last_name AS t_last, t.title AS t_title,
      sc.id AS school_id, sc.name AS school_name,
      m.id AS module_id, m.title AS module_title, m.target_level, m.est_minutes,
      i.code AS indicator_code, i.name AS indicator_name, i.id AS indicator_id,
      d.code AS domain_code, d.name AS domain_name,
      de.title AS deliverable_title, de.updated_at AS deliverable_updated,
      vb.first_name AS verifier_first, vb.last_name AS verifier_last
    FROM pd_enrollments e
    JOIN users t ON t.id = e.teacher_id
    LEFT JOIN schools sc ON sc.id = t.school_id
    JOIN pd_modules m ON m.id = e.module_id
    JOIN framework_indicators i ON i.id = m.indicator_id
    JOIN framework_domains d ON d.id = i.domain_id
    LEFT JOIN pd_deliverables de ON de.enrollment_id = e.id
    LEFT JOIN users vb ON vb.id = e.verified_by
    WHERE ${where}
    ORDER BY ${order}
    LIMIT 1000`;
  const rowsRes = binds.length
    ? await c.env.DB.prepare(sql).bind(...binds).all()
    : await c.env.DB.prepare(sql).all();
  const rows = (rowsRes.results as any[]) || [];

  // Totals strip (respects the same filter set)
  const totalsSql = `
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN e.status='verified' THEN 1 ELSE 0 END) AS verified,
      SUM(CASE WHEN e.status='submitted' THEN 1 ELSE 0 END) AS submitted,
      SUM(CASE WHEN e.status='needs_revision' THEN 1 ELSE 0 END) AS needs_revision,
      SUM(CASE WHEN e.status IN ('recommended','started','learn_done','practice_done') THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN e.status='declined' THEN 1 ELSE 0 END) AS declined,
      SUM(COALESCE(m.est_minutes,0)) AS total_minutes
    FROM pd_enrollments e
    JOIN users t ON t.id = e.teacher_id
    LEFT JOIN schools sc ON sc.id = t.school_id
    JOIN pd_modules m ON m.id = e.module_id
    JOIN framework_indicators i ON i.id = m.indicator_id
    JOIN framework_domains d ON d.id = i.domain_id
    WHERE ${where}`;
  const totals = binds.length
    ? await c.env.DB.prepare(totalsSql).bind(...binds).first<any>()
    : await c.env.DB.prepare(totalsSql).first<any>();

  // Lookups for the filter UI
  const lookups = await buildLookups(c.env.DB, user);
  const domains = await c.env.DB.prepare(
    `SELECT DISTINCT d.code, d.name FROM framework_domains d ORDER BY d.sort_order`
  ).all();
  const indicators = await c.env.DB.prepare(
    `SELECT i.id, i.code AS icode, i.name AS iname, d.code AS dcode
       FROM framework_indicators i JOIN framework_domains d ON d.id = i.domain_id
       ORDER BY d.sort_order, i.sort_order`
  ).all();

  return c.html(<PdReportPage user={user} f={f} rows={rows} totals={totals || {}}
    teachers={lookups.teachers} schools={lookups.schools}
    domains={(domains.results as any[]) || []} indicators={(indicators.results as any[]) || []} />);
});

// GET /reports/pd.csv — CSV export with the same filters
app.get('/pd.csv', async (c) => {
  const user = c.get('user')!;
  const f = parsePdFilters(c);
  const { where, binds } = await pdScopeSql(c.env.DB, user, f);
  const order = pdOrderBy(f.sort);

  const sql = `
    SELECT
      e.id AS enrollment_id, e.status, e.source, e.source_score_level,
      e.created_at, e.submitted_at, e.verified_at,
      t.last_name AS t_last, t.first_name AS t_first, t.title AS t_title,
      sc.name AS school_name,
      d.code AS domain_code, d.name AS domain_name,
      i.code AS indicator_code, i.name AS indicator_name,
      m.title AS module_title, m.target_level, m.est_minutes,
      de.title AS deliverable_title, de.updated_at AS deliverable_updated,
      de.body AS deliverable_body,
      e.verification_note,
      vb.first_name AS verifier_first, vb.last_name AS verifier_last
    FROM pd_enrollments e
    JOIN users t ON t.id = e.teacher_id
    LEFT JOIN schools sc ON sc.id = t.school_id
    JOIN pd_modules m ON m.id = e.module_id
    JOIN framework_indicators i ON i.id = m.indicator_id
    JOIN framework_domains d ON d.id = i.domain_id
    LEFT JOIN pd_deliverables de ON de.enrollment_id = e.id
    LEFT JOIN users vb ON vb.id = e.verified_by
    WHERE ${where}
    ORDER BY ${order}
    LIMIT 5000`;
  const rowsRes = binds.length
    ? await c.env.DB.prepare(sql).bind(...binds).all()
    : await c.env.DB.prepare(sql).all();
  const rows = (rowsRes.results as any[]) || [];

  const header = [
    'Enrollment ID','Teacher','Title','School','Domain','Indicator',
    'Module','Target Level','Est. Minutes','Status','Source','Trigger Score Level',
    'Created','Submitted','Verified','Verified By','Verifier Note',
    'Deliverable Title','Deliverable Updated','Deliverable (first 2000 chars)',
  ];
  const csvRows = rows.map((r: any) => [
    r.enrollment_id,
    `${r.t_last || ''}, ${r.t_first || ''}`,
    r.t_title || '',
    r.school_name || '',
    r.domain_code || '',
    `${r.domain_code}.${String(r.indicator_code || '').toUpperCase()} — ${r.indicator_name || ''}`,
    r.module_title || '',
    r.target_level ?? '',
    r.est_minutes ?? '',
    r.status || '',
    r.source || '',
    r.source_score_level ?? '',
    r.created_at || '', r.submitted_at || '', r.verified_at || '',
    (r.verifier_first || r.verifier_last) ? `${r.verifier_first || ''} ${r.verifier_last || ''}`.trim() : '',
    r.verification_note || '',
    r.deliverable_title || '',
    r.deliverable_updated || '',
    String(r.deliverable_body || '').slice(0, 2000),
  ]);
  await logActivity(c.env.DB, user.id, 'report', null, 'export_pd_csv', { count: rows.length });
  const csv = buildCsv(header, csvRows);
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="pd-completion-${new Date().toISOString().slice(0,10)}.csv"`,
    },
  });
});

// GET /reports/pd/:enrollmentId — read-only drill-down for one row
app.get('/pd/:id', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare(
    `SELECT e.*, t.id AS teacher_id, t.first_name AS t_first, t.last_name AS t_last, t.title AS t_title,
            sc.name AS school_name,
            m.title AS module_title, m.subtitle AS module_subtitle, m.target_level, m.est_minutes,
            m.research_basis, m.deliverable_prompt, m.deliverable_rubric,
            i.code AS indicator_code, i.name AS indicator_name,
            d.code AS domain_code, d.name AS domain_name,
            de.title AS deliverable_title, de.body AS deliverable_body, de.updated_at AS deliverable_updated,
            vb.first_name AS verifier_first, vb.last_name AS verifier_last,
            ab.first_name AS assigner_first, ab.last_name AS assigner_last
       FROM pd_enrollments e
       JOIN users t ON t.id = e.teacher_id
       LEFT JOIN schools sc ON sc.id = t.school_id
       JOIN pd_modules m ON m.id = e.module_id
       JOIN framework_indicators i ON i.id = m.indicator_id
       JOIN framework_domains d ON d.id = i.domain_id
       LEFT JOIN pd_deliverables de ON de.enrollment_id = e.id
       LEFT JOIN users vb ON vb.id = e.verified_by
       LEFT JOIN users ab ON ab.id = e.assigned_by
       WHERE e.id = ?`
  ).bind(id).first<any>();
  if (!row) return c.text('Not found', 404);

  // Scope check
  if (user.role === 'teacher' && row.teacher_id !== user.id) return c.text('Forbidden', 403);
  if (user.role === 'appraiser' || user.role === 'coach') {
    const ok = await c.env.DB.prepare(
      `SELECT 1 FROM assignments WHERE teacher_id=? AND staff_id=? AND active=1 LIMIT 1`
    ).bind(row.teacher_id, user.id).first();
    if (!ok) return c.text('Forbidden', 403);
  }

  const reflections = await c.env.DB.prepare(
    `SELECT phase, body, created_at FROM pd_reflections WHERE enrollment_id = ? ORDER BY phase`
  ).bind(id).all();

  return c.html(<PdReportDetail user={user} e={row} reflections={(reflections.results as any[]) || []} />);
});

export default app;

// ============================================================================
// The Report Builder UI — ONE big Card with guided, labelled sections.
// Left column = WHO/WHEN, right column = WHAT to include.
// Single "Download CSV" and "Open PDF" button at the bottom.
// ============================================================================

function ReportsPage({ user, f, observations, teachers, appraisers, schools }: any) {
  const activeNav = user.role === 'super_admin' ? 'admin-reports' :
                    user.role === 'superintendent' ? 'supt-reports' :
                    user.role === 'appraiser' ? 'ap-reports' :
                    user.role === 'teacher' ? 't-reports' : '';

  // Preserve the exact form selections so that the filters "stick" after an
  // Apply-filters submit. (Applied by the GET form when it round-trips the URL.)
  const selected = (arr: number[], id: any) => arr.includes(Number(id));
  const typeChecked = (t: string) => f.types.length === 0 ? true : f.types.includes(t);

  const totalTeachers = teachers.length;
  const chosenTeachers = f.teacherIds.length ? f.teacherIds.length : totalTeachers;

  return (
    <Layout title="Reports" user={user} activeNav={activeNav}>
      <div class="mb-2 flex items-center gap-3 flex-wrap text-sm">
        <span class="px-3 py-1.5 rounded-full bg-aps-navy text-white"><i class="fas fa-clipboard-list mr-1"></i>Observations</span>
        <a href="/reports/pd" class="px-3 py-1.5 rounded-full bg-white border border-aps-navy text-aps-navy hover:bg-slate-50"><i class="fas fa-graduation-cap mr-1"></i>PD Completion Report</a>
      </div>
      <h1 class="font-display text-2xl text-aps-navy mb-1" data-tour="reports-title"><i class="fas fa-file-export mr-2"></i>Report Builder</h1>
      <p class="text-slate-600 text-sm mb-4">Build exactly the report you need in three simple steps: <strong>① choose who</strong>, <strong>② choose what to include</strong>, <strong>③ download</strong>. All selections support multi-pick — Ctrl/⌘-click to choose many.</p>

      {/* --------- Single form drives BOTH the preview and the export --------- */}
      <form method="get" action="/reports" class="space-y-4">
        {/* ========================== STEP 1: WHO ============================ */}
        <Card title="① Who & when" icon="fas fa-user-group" data-tour="reports-who">
          <div class="grid md:grid-cols-3 gap-4 text-sm">
            {/* Teachers */}
            <div>
              <label class="block font-medium text-slate-700 mb-1">
                Teachers <span class="text-xs text-slate-500">({chosenTeachers} of {totalTeachers})</span>
              </label>
              <MultiSelect name="teacher_ids" options={teachers.map((t: any) => ({
                id: t.id, label: `${t.last_name}, ${t.first_name}${t.school_name ? ` — ${t.school_name}` : ''}`,
              }))} selected={f.teacherIds} emptyLabel="No teachers in scope." rows={10} />
              <SelectAllLinks hint="Leave none selected to report on ALL teachers you can see." />
            </div>

            {/* Schools — hidden for plain teachers (who only see themselves) */}
            {user.role !== 'teacher' && (
              <div>
                <label class="block font-medium text-slate-700 mb-1">Schools</label>
                <MultiSelect name="school_ids" options={schools.map((s: any) => ({
                  id: s.id, label: `${s.name}${s.grade_span ? ` (${s.grade_span})` : ''}`,
                }))} selected={f.schoolIds} emptyLabel="No schools." rows={Math.min(6, Math.max(3, schools.length))} />
                <SelectAllLinks hint="Multi-school teachers match if ANY of their schools is picked." />
              </div>
            )}

            {/* Appraisers — only for district-wide roles */}
            {(user.role === 'super_admin' || user.role === 'superintendent') && (
              <div>
                <label class="block font-medium text-slate-700 mb-1">Appraisers</label>
                <MultiSelect name="appraiser_ids" options={appraisers.map((a: any) => ({
                  id: a.id, label: `${a.last_name}, ${a.first_name}${a.role ? ` (${a.role})` : ''}`,
                }))} selected={f.appraiserIds} emptyLabel="No appraisers." rows={Math.min(6, Math.max(3, appraisers.length))} />
                <SelectAllLinks hint="Leave empty = all appraisers." />
              </div>
            )}
          </div>

          {/* Date range + types */}
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mt-4 text-sm">
            <label class="block"><span class="block font-medium text-slate-700 mb-1">From</span><input type="date" name="from" value={f.from || ''} class="w-full border border-slate-300 rounded px-2 py-2" /></label>
            <label class="block"><span class="block font-medium text-slate-700 mb-1">To</span><input type="date" name="to" value={f.to || ''} class="w-full border border-slate-300 rounded px-2 py-2" /></label>
            <fieldset class="sm:col-span-2 md:col-span-2">
              <legend class="font-medium text-slate-700">Observation type</legend>
              <div class="mt-1 flex flex-wrap gap-3">
                {[
                  { v: 'mini', label: 'Mini' },
                  { v: 'formal', label: 'Formal' },
                  { v: 'annual_summary', label: 'Annual summary' },
                ].map(o => (
                  <label class="inline-flex items-center gap-1.5 text-sm">
                    <input type="checkbox" name="types" value={o.v} checked={typeChecked(o.v)} class="accent-aps-navy" /> {o.label}
                  </label>
                ))}
              </div>
              <p class="text-xs text-slate-500 mt-1">Leave all three checked for every type.</p>
            </fieldset>
          </div>

          <div class="mt-4 flex flex-wrap gap-2 items-center">
            <button class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-filter mr-1"></i>Apply filters &amp; preview</button>
            <a href="/reports" class="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded hover:bg-slate-50 text-sm"><i class="fas fa-rotate-left mr-1"></i>Clear all</a>
            <span class="ml-auto text-sm font-medium text-aps-navy"><i class="fas fa-circle-info mr-1"></i>{observations.length} observation{observations.length!==1?'s':''} match your current filters</span>
          </div>
        </Card>
      </form>

      {/* --------- Export form (separate so ticked options don't reload preview) --------- */}
      <form method="post" action="/reports/export" class="space-y-4 mt-4">
        {/* Carry forward every filter as hidden fields so CSV/PDF apply them */}
        {f.from && <input type="hidden" name="from" value={f.from} />}
        {f.to && <input type="hidden" name="to" value={f.to} />}
        {f.teacherIds.map(id => <input type="hidden" name="teacher_ids" value={String(id)} />)}
        {f.schoolIds.map(id => <input type="hidden" name="school_ids" value={String(id)} />)}
        {f.appraiserIds.map(id => <input type="hidden" name="appraiser_ids" value={String(id)} />)}
        {f.types.map(t => <input type="hidden" name="types" value={t} />)}

        {/* ======================= STEP 2: WHAT ============================= */}
        <Card title="② What to include" icon="fas fa-list-check" data-tour="reports-what">
          <p class="text-sm text-slate-600 mb-3">Pick which sections to include. The presets configure the checkboxes for common use-cases — you can fine-tune any of them afterwards.</p>

          <div class="flex flex-wrap gap-2 mb-4">
            <PresetButton label="Full observation" title="Everything: summary, scores, feedback, signatures." data={{scores:1,glows:1,grows:1,focus:1,nextSteps:1,summary:1,signatures:1}} />
            <PresetButton label="Scores only" title="Just the rubric scores per indicator." data={{scores:1,summary:0,glows:0,grows:0,focus:0,nextSteps:0,signatures:0}} />
            <PresetButton label="Strengths only" title="Areas of strength (Glows)." data={{scores:0,summary:0,glows:1,grows:0,focus:0,nextSteps:0,signatures:0}} />
            <PresetButton label="Growth areas only" title="Grows + next steps — for goal-setting conversations." data={{scores:0,summary:0,glows:0,grows:1,focus:1,nextSteps:1,signatures:0}} />
            <PresetButton label="Feedback only" title="All feedback, no scores. Good for coaching conversations." data={{scores:0,summary:1,glows:1,grows:1,focus:1,nextSteps:1,signatures:0}} />
            <PresetButton label="Teacher folder copy" title="Everything a teacher needs for their portfolio." data={{scores:1,summary:1,glows:1,grows:1,focus:1,nextSteps:1,signatures:1}} />
          </div>

          <fieldset class="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm" id="sections">
            <SectionCheck name="inc_summary"    label="Overall summary"          icon="fa-message"       defaultOn />
            <SectionCheck name="inc_scores"     label="Rubric scores"            icon="fa-table-cells"   defaultOn />
            <SectionCheck name="inc_glows"      label="Strengths (Glows)"        icon="fa-star"          defaultOn />
            <SectionCheck name="inc_grows"      label="Growth areas (Grows)"     icon="fa-seedling"      defaultOn />
            <SectionCheck name="inc_focus"      label="Focus areas"              icon="fa-bullseye"      defaultOn />
            <SectionCheck name="inc_next_steps" label="Suggested next steps"     icon="fa-forward"       defaultOn />
            <SectionCheck name="inc_signatures" label="Signatures"               icon="fa-signature"     defaultOn />
            {(user.role === 'super_admin' || user.role === 'appraiser' || user.role === 'superintendent') && (
              <SectionCheck name="inc_notes" label="Private appraiser notes" icon="fa-user-shield" />
            )}
          </fieldset>
        </Card>

        {/* ======================= STEP 3: DOWNLOAD ========================= */}
        <Card title="③ Download" icon="fas fa-download" data-tour="reports-download">
          <div class="grid md:grid-cols-2 gap-4 text-sm">
            <div class="border border-slate-200 rounded p-4 bg-slate-50">
              <div class="font-display text-aps-navy text-lg mb-1"><i class="fas fa-file-csv mr-2"></i>Spreadsheet (CSV)</div>
              <p class="text-slate-600 text-sm mb-2">Opens in Excel / Google Sheets. Pick the row shape you want:</p>
              <label class="block mb-3">
                <select name="csv_mode" class="w-full border border-slate-300 rounded px-2 py-1.5">
                  <option value="summary">One row per observation (summary + counts + averages)</option>
                  <option value="scores">One row per rubric score (for pivot tables)</option>
                  <option value="feedback">One row per feedback item (glows + grows + focus + next steps)</option>
                  <option value="glows">Only strengths (Glows)</option>
                  <option value="grows">Only growth areas (Grows)</option>
                  <option value="focus">Only focus areas</option>
                  <option value="next_steps">Only next steps</option>
                  <option value="full">Everything (wide — one row per observation, all fields joined)</option>
                </select>
              </label>
              <button name="format" value="csv" class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm w-full"><i class="fas fa-download mr-1"></i>Download CSV</button>
            </div>
            <div class="border border-slate-200 rounded p-4 bg-slate-50">
              <div class="font-display text-aps-navy text-lg mb-1"><i class="fas fa-file-pdf mr-2"></i>Printable PDF</div>
              <p class="text-slate-600 text-sm mb-2">Opens a print-ready report in a new tab. Use your browser's <strong>Print → Save as PDF</strong> to save or email. Each observation starts on its own page and respects the checkboxes above.</p>
              <button name="format" value="pdf" formtarget="_blank" class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm w-full"><i class="fas fa-file-pdf mr-1"></i>Open PDF</button>
              <p class="text-xs text-slate-500 mt-2 italic">Tip: keep only one teacher selected above to generate a single-teacher file for their HR folder.</p>
            </div>
          </div>
        </Card>
      </form>

      {/* =================== STEP 4 (preview) ============================== */}
      <Card title="Matching observations (preview)" icon="fas fa-list" class="mt-4">
        {observations.length === 0 ? <p class="text-slate-500 text-sm">No observations match the current filters. Adjust your selections above and click <strong>Apply filters</strong>.</p> :
          <div class="overflow-x-auto">
            <div class="overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5"><table class="w-full text-sm">
              <thead><tr class="text-left border-b border-slate-200 text-slate-600">
                <th class="py-2">Date</th><th>Teacher</th><th>School</th><th>Type</th><th>Appraiser</th><th>Status</th><th></th>
              </tr></thead>
              <tbody>
                {observations.slice(0, 100).map((o: any) => {
                  const one = `teacher_ids=${o.t_id}&from=${(o.observed_at||'').slice(0,10)}&to=${(o.observed_at||'').slice(0,10)}`;
                  return (
                    <tr class="border-b border-slate-100">
                      <td class="py-2">{formatDate(o.observed_at)}</td>
                      <td class="font-medium">{o.t_last}, {o.t_first}</td>
                      <td class="text-slate-600">{o.school_name || '—'}</td>
                      <td class="text-slate-600 capitalize">{(o.observation_type || '').replace('_',' ')}</td>
                      <td class="text-slate-600">{o.a_last}, {o.a_first}</td>
                      <td class="text-slate-600">{statusLabel(o.status)}</td>
                      <td class="whitespace-nowrap">
                        <a href={`/reports/pdf?${one}`} target="_blank" rel="noopener" class="text-aps-blue hover:underline text-xs"><i class="fas fa-file-pdf mr-1"></i>PDF</a>
                        <span class="text-slate-300 mx-1">·</span>
                        <a href={`/reports/csv?${one}&mode=full`} class="text-aps-blue hover:underline text-xs"><i class="fas fa-file-csv mr-1"></i>CSV</a>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </div>
        }
        {observations.length > 100 && <p class="text-xs text-slate-500 mt-2">Showing 100 of {observations.length} — exports include all matching rows.</p>}
      </Card>

      {/* ----- Small bit of inline script for presets + select-all helpers ----- */}
      <script dangerouslySetInnerHTML={{ __html: `
        // Preset buttons flip the Step-2 checkboxes.
        document.querySelectorAll('[data-preset]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            const data = JSON.parse(btn.getAttribute('data-preset'));
            const map = { scores:'inc_scores', summary:'inc_summary', glows:'inc_glows', grows:'inc_grows', focus:'inc_focus', nextSteps:'inc_next_steps', signatures:'inc_signatures', notes:'inc_notes' };
            for (const key in map) {
              const el = document.querySelector('input[name="' + map[key] + '"]');
              if (el && data[key] !== undefined) el.checked = !!data[key];
            }
          });
        });
        // Select-all / clear links for every <select multiple>.
        document.querySelectorAll('[data-select-all]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(btn.getAttribute('data-select-all'));
            if (target) Array.from(target.options).forEach(o => o.selected = true);
          });
        });
        document.querySelectorAll('[data-select-clear]').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            const target = document.querySelector(btn.getAttribute('data-select-clear'));
            if (target) Array.from(target.options).forEach(o => o.selected = false);
          });
        });
      `}} />
    </Layout>
  );
}

// Small reusable multi-select <select multiple> with all labels/rows configurable.
function MultiSelect({ name, options, selected, emptyLabel, rows }: any) {
  if (!options || options.length === 0) return <p class="text-xs text-slate-400 italic">{emptyLabel}</p>;
  const id = `ms-${name}`;
  return (
    <select name={name} id={id} multiple size={rows} class="w-full border border-slate-300 rounded px-2 py-1.5">
      {options.map((o: any) => (
        <option value={o.id} selected={(selected || []).includes(Number(o.id))}>{o.label}</option>
      ))}
    </select>
  );
}

function SelectAllLinks({ hint }: any) {
  return (
    <div class="mt-1 text-xs text-slate-600">
      <button type="button" data-select-all={'#ms-' + 'placeholder'} class="hidden"></button>
      <span class="italic">{hint}</span>
    </div>
  );
}

function SectionCheck({ name, label, icon, defaultOn }: any) {
  return (
    <label class="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded hover:bg-slate-50 cursor-pointer">
      <input type="checkbox" name={name} value="1" defaultChecked={!!defaultOn} class="accent-aps-navy" />
      <i class={`fas ${icon} text-aps-navy`}></i>
      <span>{label}</span>
    </label>
  );
}

function PresetButton({ label, title, data }: any) {
  return (
    <button type="button" data-preset={JSON.stringify(data)} title={title} class="bg-white border border-aps-navy text-aps-navy px-3 py-1.5 rounded hover:bg-slate-50 text-sm">
      <i class="fas fa-wand-magic-sparkles mr-1 text-aps-gold"></i>{label}
    </button>
  );
}

// ============================================================================
// PD Completion Report views
// ============================================================================

function pdStatusPill(s: string) {
  switch (s) {
    case 'verified':       return { color: 'bg-emerald-50 border-emerald-200 text-emerald-800', icon: 'fa-circle-check', label: 'Verified' };
    case 'submitted':      return { color: 'bg-violet-50 border-violet-200 text-violet-800',    icon: 'fa-inbox',         label: 'Submitted' };
    case 'needs_revision': return { color: 'bg-rose-50 border-rose-200 text-rose-800',          icon: 'fa-rotate-left',   label: 'Revision' };
    case 'practice_done':  return { color: 'bg-indigo-50 border-indigo-200 text-indigo-800',    icon: 'fa-dumbbell',      label: 'Practice done' };
    case 'learn_done':     return { color: 'bg-sky-50 border-sky-200 text-sky-800',             icon: 'fa-book-open',     label: 'Learn done' };
    case 'started':        return { color: 'bg-sky-50 border-sky-200 text-sky-800',             icon: 'fa-play',          label: 'Started' };
    case 'recommended':    return { color: 'bg-amber-50 border-amber-200 text-amber-800',       icon: 'fa-star',          label: 'Recommended' };
    case 'declined':       return { color: 'bg-slate-50 border-slate-200 text-slate-600',       icon: 'fa-xmark',         label: 'Declined' };
    default:               return { color: 'bg-slate-50 border-slate-200 text-slate-600',       icon: 'fa-circle',        label: s };
  }
}

function PdReportPage({ user, f, rows, totals, teachers, schools, domains, indicators }: any) {
  const activeNav = user.role === 'super_admin' ? 'admin-reports' :
                    user.role === 'superintendent' ? 'supt-reports' :
                    user.role === 'appraiser' ? 'ap-reports' :
                    user.role === 'teacher' ? 't-reports' : '';

  const qsFor = (overrides: Record<string, string> = {}) => {
    const parts: string[] = [];
    const pushArr = (name: string, arr: any[]) => { for (const v of arr) parts.push(`${encodeURIComponent(name)}=${encodeURIComponent(String(v))}`); };
    pushArr('teacher_ids',   f.teacherIds);
    pushArr('school_ids',    f.schoolIds);
    pushArr('domain_codes',  f.domains);
    pushArr('indicator_ids', f.indicatorIds);
    pushArr('statuses',      f.statuses);
    if (f.source) parts.push(`source=${encodeURIComponent(f.source)}`);
    if (f.from)   parts.push(`from=${encodeURIComponent(f.from)}`);
    if (f.to)     parts.push(`to=${encodeURIComponent(f.to)}`);
    parts.push(`sort=${encodeURIComponent(overrides.sort || f.sort)}`);
    return parts.join('&');
  };

  const statusChoices = [
    { key: 'recommended',    label: 'Recommended' },
    { key: 'started',        label: 'Started' },
    { key: 'learn_done',     label: 'Learn done' },
    { key: 'practice_done',  label: 'Practice done' },
    { key: 'submitted',      label: 'Submitted' },
    { key: 'needs_revision', label: 'Needs revision' },
    { key: 'verified',       label: 'Verified' },
    { key: 'declined',       label: 'Declined' },
  ];

  return (
    <Layout title="PD Completion Report" user={user} activeNav={activeNav}>
      <div class="mb-2 flex items-center gap-3 flex-wrap text-sm">
        <a href="/reports" class="px-3 py-1.5 rounded-full bg-white border border-aps-navy text-aps-navy hover:bg-slate-50"><i class="fas fa-clipboard-list mr-1"></i>Observations</a>
        <span class="px-3 py-1.5 rounded-full bg-aps-navy text-white"><i class="fas fa-graduation-cap mr-1"></i>PD Completion Report</span>
      </div>
      <h1 class="font-display text-2xl text-aps-navy mb-1"><i class="fas fa-graduation-cap mr-2"></i>PD Completion Report</h1>
      <p class="text-slate-600 text-sm mb-4">
        Every PD module enrollment across the platform — auto-recommended, self-selected, and supervisor-assigned. Filter by teacher, school, rubric domain/indicator, status, or date; click any row to open the teacher's actual deliverable.
      </p>

      {/* KPI strip */}
      <div class="grid grid-cols-2 md:grid-cols-6 gap-2 mb-4">
        <KpiPd label="Total" v={Number(totals.total || 0)} icon="fa-layer-group" />
        <KpiPd label="Verified" v={Number(totals.verified || 0)} icon="fa-circle-check" color="text-emerald-700" />
        <KpiPd label="Submitted" v={Number(totals.submitted || 0)} icon="fa-inbox" color="text-violet-700" />
        <KpiPd label="Revision" v={Number(totals.needs_revision || 0)} icon="fa-rotate-left" color="text-rose-700" />
        <KpiPd label="In progress" v={Number(totals.in_progress || 0)} icon="fa-hourglass-half" color="text-sky-700" />
        <KpiPd label="Total minutes" v={Number(totals.total_minutes || 0)} icon="fa-clock" />
      </div>

      <form method="get" action="/reports/pd" class="mb-4">
        <Card title="Filters" icon="fas fa-filter">
          <div class="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <label class="block font-medium text-slate-700 mb-1">Teachers</label>
              <MultiSelect name="teacher_ids" options={teachers.map((t: any) => ({
                id: t.id, label: `${t.last_name}, ${t.first_name}${t.school_name ? ` — ${t.school_name}` : ''}`,
              }))} selected={f.teacherIds} emptyLabel="No teachers in scope." rows={8} />
              <SelectAllLinks hint="Leave empty to include all in-scope teachers." />
            </div>
            {user.role !== 'teacher' && (
              <div>
                <label class="block font-medium text-slate-700 mb-1">Schools</label>
                <MultiSelect name="school_ids" options={schools.map((s: any) => ({ id: s.id, label: s.name }))}
                  selected={f.schoolIds} emptyLabel="No schools." rows={6} />
                <SelectAllLinks />
              </div>
            )}
            <div>
              <label class="block font-medium text-slate-700 mb-1">Rubric domains</label>
              <select name="domain_codes" multiple size={6} class="w-full border border-slate-300 rounded px-2 py-1 text-sm">
                {domains.map((d: any) => (
                  <option value={d.code} selected={f.domains.includes(d.code)}>{d.code} — {d.name}</option>
                ))}
              </select>
              <SelectAllLinks />
            </div>
            <div>
              <label class="block font-medium text-slate-700 mb-1">Specific indicators</label>
              <select name="indicator_ids" multiple size={8} class="w-full border border-slate-300 rounded px-2 py-1 text-sm">
                {indicators.map((i: any) => (
                  <option value={i.id} selected={f.indicatorIds.includes(i.id)}>
                    {i.dcode}.{String(i.icode || '').toUpperCase()} — {i.iname}
                  </option>
                ))}
              </select>
              <SelectAllLinks hint="Overrides the domain filter above when set." />
            </div>
            <div>
              <label class="block font-medium text-slate-700 mb-1">Status</label>
              <select name="statuses" multiple size={8} class="w-full border border-slate-300 rounded px-2 py-1 text-sm">
                {statusChoices.map((s: any) => (
                  <option value={s.key} selected={f.statuses.includes(s.key)}>{s.label}</option>
                ))}
              </select>
              <SelectAllLinks />
            </div>
            <div class="space-y-2">
              <div>
                <label class="block font-medium text-slate-700 mb-1">Trigger source</label>
                <select name="source" class="w-full border border-slate-300 rounded px-2 py-1 text-sm">
                  <option value="" selected={!f.source}>Any</option>
                  <option value="auto"     selected={f.source==='auto'}>Auto (triggered by low score)</option>
                  <option value="self"     selected={f.source==='self'}>Self-enrolled (teacher picked)</option>
                  <option value="assigned" selected={f.source==='assigned'}>Assigned (by supervisor)</option>
                </select>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <label>From<input type="date" name="from" value={f.from || ''} class="mt-1 w-full border border-slate-300 rounded px-2 py-1" /></label>
                <label>To<input type="date" name="to" value={f.to || ''} class="mt-1 w-full border border-slate-300 rounded px-2 py-1" /></label>
              </div>
              <div>
                <label class="block font-medium text-slate-700 mb-1">Sort by</label>
                <select name="sort" class="w-full border border-slate-300 rounded px-2 py-1 text-sm">
                  <option value="submitted" selected={f.sort==='submitted'}>Most recent activity</option>
                  <option value="verified"  selected={f.sort==='verified'}>Most recently verified</option>
                  <option value="teacher"   selected={f.sort==='teacher'}>Teacher (A → Z)</option>
                  <option value="indicator" selected={f.sort==='indicator'}>Rubric indicator</option>
                  <option value="status"    selected={f.sort==='status'}>Status</option>
                  <option value="module"    selected={f.sort==='module'}>Module title</option>
                </select>
              </div>
            </div>
          </div>
          <div class="mt-4 flex items-center gap-2 flex-wrap">
            <button class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-filter mr-1"></i>Apply filters</button>
            <a href="/reports/pd" class="text-sm text-slate-500 hover:underline">Clear</a>
            <span class="flex-1"></span>
            <a href={`/reports/pd.csv?${qsFor()}`} class="bg-white border border-aps-navy text-aps-navy px-3 py-1.5 rounded hover:bg-slate-50 text-sm"><i class="fas fa-file-csv mr-1"></i>Download CSV</a>
          </div>
        </Card>
      </form>

      <Card title={`Results (${rows.length}${rows.length >= 1000 ? ' — showing the first 1,000' : ''})`} icon="fas fa-table">
        {rows.length === 0 ? (
          <p class="text-sm text-slate-500">No PD records match these filters.</p>
        ) : (
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead class="text-xs text-slate-500 text-left bg-slate-50 border-b">
                <tr>
                  <th class="py-2 pl-3 pr-2">Teacher</th>
                  <th class="py-2 px-2">Rubric indicator</th>
                  <th class="py-2 px-2">Module</th>
                  <th class="py-2 px-2">Source</th>
                  <th class="py-2 px-2">Status</th>
                  <th class="py-2 px-2">Submitted</th>
                  <th class="py-2 px-2">Verified</th>
                  <th class="py-2 px-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => {
                  const p = pdStatusPill(r.status);
                  return (
                    <tr class="border-b border-slate-100 hover:bg-slate-50">
                      <td class="py-2 pl-3 pr-2">
                        <div class="text-slate-800 font-medium">{r.t_last}, {r.t_first}</div>
                        <div class="text-xs text-slate-500">{r.t_title || '—'}{r.school_name ? ` · ${r.school_name}` : ''}</div>
                      </td>
                      <td class="py-2 px-2">
                        <div class="text-xs text-slate-500">{r.domain_code}.{String(r.indicator_code || '').toUpperCase()}</div>
                        <div class="text-slate-800">{r.indicator_name}</div>
                      </td>
                      <td class="py-2 px-2">
                        <div class="text-slate-800">{r.module_title}</div>
                        <div class="text-xs text-slate-500">target &ge; L{r.target_level} · {r.est_minutes || 0}m</div>
                      </td>
                      <td class="py-2 px-2 text-xs">
                        {r.source === 'auto' ? (<><i class="fas fa-wand-magic-sparkles mr-1 text-amber-600"></i>Auto (L{r.source_score_level || '?'})</>) :
                         r.source === 'assigned' ? (<><i class="fas fa-user-tie mr-1 text-sky-600"></i>Assigned</>) :
                         (<><i class="fas fa-hand-point-up mr-1 text-slate-500"></i>Self</>)}
                      </td>
                      <td class="py-2 px-2"><span class={`text-xs px-2 py-0.5 rounded-full border ${p.color}`}><i class={`fas ${p.icon} mr-1`}></i>{p.label}</span></td>
                      <td class="py-2 px-2 text-xs text-slate-600">{r.submitted_at ? formatDate(r.submitted_at) : '—'}</td>
                      <td class="py-2 px-2 text-xs text-slate-600">{r.verified_at ? formatDate(r.verified_at) : '—'}</td>
                      <td class="py-2 px-2 text-right"><a href={`/reports/pd/${r.enrollment_id}`} class="text-xs text-aps-blue hover:underline">Open <i class="fas fa-chevron-right"></i></a></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </Layout>
  );
}

function KpiPd({ label, v, icon, color }: any) {
  return (
    <div class="bg-white border border-slate-200 rounded-md p-3">
      <div class="flex items-center justify-between">
        <div class="text-xs text-slate-500 uppercase">{label}</div>
        <i class={`fas ${icon} ${color || 'text-aps-navy'}`}></i>
      </div>
      <div class="text-2xl font-display text-aps-navy mt-1">{v}</div>
    </div>
  );
}

function PdReportDetail({ user, e, reflections }: any) {
  const activeNav = user.role === 'super_admin' ? 'admin-reports' :
                    user.role === 'superintendent' ? 'supt-reports' :
                    user.role === 'appraiser' ? 'ap-reports' :
                    user.role === 'teacher' ? 't-reports' : '';
  const pill = pdStatusPill(e.status);
  const refMap: Record<string, string> = {};
  for (const r of reflections) refMap[r.phase] = r.body;
  return (
    <Layout title="PD Completion Detail" user={user} activeNav={activeNav}>
      <div class="mb-2"><a href="/reports/pd" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>Back to PD Completion Report</a></div>
      <h1 class="font-display text-2xl text-aps-navy">{e.module_title}</h1>
      <p class="text-slate-600 text-sm">{e.domain_code}.{String(e.indicator_code || '').toUpperCase()} — {e.indicator_name} · target &ge; level {e.target_level}</p>
      <p class="text-slate-700 text-sm mt-1">
        Teacher: <strong>{e.t_first} {e.t_last}</strong>
        {e.t_title ? <span class="text-slate-500"> · {e.t_title}</span> : null}
        {e.school_name ? <span class="text-slate-500"> · {e.school_name}</span> : null}
      </p>
      <div class="mt-2 flex items-center gap-2 flex-wrap">
        <span class={`text-xs px-2 py-0.5 rounded-full border ${pill.color}`}><i class={`fas ${pill.icon} mr-1`}></i>{pill.label}</span>
        <span class="text-xs text-slate-500"><i class="far fa-clock mr-1"></i>{e.est_minutes || 0} min</span>
        {e.source === 'auto'     && <span class="text-xs text-amber-700"><i class="fas fa-wand-magic-sparkles mr-1"></i>Auto from Level {e.source_score_level || '?'}</span>}
        {e.source === 'assigned' && <span class="text-xs text-sky-700"><i class="fas fa-user-tie mr-1"></i>Assigned by {e.assigner_first} {e.assigner_last}</span>}
      </div>

      <div class="grid md:grid-cols-4 gap-3 mt-4 text-xs">
        <div class="bg-white border border-slate-200 rounded p-3"><div class="text-slate-500 uppercase">Recommended</div><div class="text-slate-800 mt-1">{e.created_at ? formatDateTime(e.created_at) : '—'}</div></div>
        <div class="bg-white border border-slate-200 rounded p-3"><div class="text-slate-500 uppercase">Learn done</div><div class="text-slate-800 mt-1">{e.learn_done_at ? formatDateTime(e.learn_done_at) : '—'}</div></div>
        <div class="bg-white border border-slate-200 rounded p-3"><div class="text-slate-500 uppercase">Submitted</div><div class="text-slate-800 mt-1">{e.submitted_at ? formatDateTime(e.submitted_at) : '—'}</div></div>
        <div class="bg-white border border-slate-200 rounded p-3"><div class="text-slate-500 uppercase">Verified</div><div class="text-slate-800 mt-1">{e.verified_at ? formatDateTime(e.verified_at) : '—'}{e.verifier_first ? <div class="text-slate-500 mt-0.5">by {e.verifier_first} {e.verifier_last}</div> : null}</div></div>
      </div>

      {e.research_basis && (
        <Card title="Research basis" icon="fas fa-book" class="mt-4">
          <div class="text-sm text-slate-700 whitespace-pre-wrap">{e.research_basis}</div>
        </Card>
      )}

      <Card title="The deliverable the teacher submitted" icon="fas fa-file-alt" class="mt-4">
        {e.deliverable_body ? (
          <>
            <div class="font-medium text-aps-navy mb-2">{e.deliverable_title || 'Untitled'}</div>
            <div class="p-3 bg-slate-50 border border-slate-200 rounded text-sm whitespace-pre-wrap leading-relaxed">{e.deliverable_body}</div>
            {e.deliverable_updated && <div class="mt-2 text-xs text-slate-500">Last updated {formatDateTime(e.deliverable_updated)}</div>}
          </>
        ) : (
          <p class="text-sm text-slate-500 italic">The teacher has not submitted a deliverable yet.</p>
        )}
      </Card>

      <Card title="Phase reflections" icon="fas fa-comments" class="mt-4">
        {(['learn','practice','apply']).map((p) => (
          <div class="mb-3">
            <div class="text-xs font-semibold uppercase text-slate-500">{p === 'learn' ? 'Learn' : p === 'practice' ? 'Practice' : 'Apply'}</div>
            <div class="text-sm text-slate-800 whitespace-pre-wrap">{refMap[p] || <span class="text-slate-400 italic">No reflection</span>}</div>
          </div>
        ))}
      </Card>

      <Card title="Deliverable prompt (what the teacher was asked to produce)" icon="fas fa-clipboard-list" class="mt-4">
        <div class="text-sm text-slate-700 whitespace-pre-wrap">{e.deliverable_prompt}</div>
        {e.deliverable_rubric && (
          <details class="mt-2 text-xs">
            <summary class="cursor-pointer text-aps-blue">Rubric / "looks like"</summary>
            <div class="mt-1 whitespace-pre-wrap text-slate-700">{e.deliverable_rubric}</div>
          </details>
        )}
      </Card>

      {e.verification_note && (
        <Card title="Supervisor note" icon="fas fa-gavel" class="mt-4">
          <div class="text-sm text-slate-800 whitespace-pre-wrap">{e.verification_note}</div>
        </Card>
      )}
    </Layout>
  );
}
