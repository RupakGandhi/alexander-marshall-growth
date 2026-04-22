// ============================================================================
// Reports — CSV + printable-HTML (PDF) exports of published observations
// Available to super_admin, superintendent, and appraiser (scoped to their
// assigned teachers). Teachers can export their own published observations.
// ============================================================================

import { Hono } from 'hono';
import type { Bindings, Variables } from '../lib/types';
import { Layout, Card } from '../lib/layout';
import { requireAuth } from '../lib/auth';
import { getActiveFramework, logActivity } from '../lib/db';
import { buildCsv } from '../lib/csv';
import { escapeHtml, formatDate, formatDateTime, levelLabels, statusLabel } from '../lib/ui';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use('*', requireAuth());

// ---------------------------------------------------------------------------
// Helpers: role-scoped query for observations.
// ---------------------------------------------------------------------------
interface ReportFilters {
  from: string | null;       // ISO date
  to: string | null;         // ISO date
  teacherId: number | null;
  appraiserId: number | null;
  schoolId: number | null;
  observationType: string | null; // mini|formal|annual_summary
  includeAck: boolean;       // include 'acknowledged' + 'published'
}

function parseFilters(c: any): ReportFilters {
  const q = c.req.query.bind(c.req);
  const n = (s: any) => { const v = Number(s); return Number.isFinite(v) && v > 0 ? v : null; };
  return {
    from: (q('from') || '').trim() || null,
    to: (q('to') || '').trim() || null,
    teacherId: n(q('teacher_id')),
    appraiserId: n(q('appraiser_id')),
    schoolId: n(q('school_id')),
    observationType: (q('type') || '').trim() || null,
    includeAck: true, // we always include both published + acknowledged
  };
}

async function scopedObservations(db: D1Database, user: any, f: ReportFilters) {
  const binds: any[] = [];
  let sql =
    `SELECT o.*,
            t.first_name AS t_first, t.last_name AS t_last, t.email AS t_email, t.title AS t_title, t.id AS t_id,
            a.first_name AS a_first, a.last_name AS a_last, a.title AS a_title, a.id AS a_id,
            s.name AS school_name, s.id AS school_id
       FROM observations o
       JOIN users t ON t.id = o.teacher_id
       JOIN users a ON a.id = o.appraiser_id
       LEFT JOIN schools s ON s.id = t.school_id
      WHERE o.status IN ('published','acknowledged')`;

  // Role scoping
  if (user.role === 'appraiser') {
    sql += ` AND o.appraiser_id = ?`; binds.push(user.id);
  } else if (user.role === 'teacher') {
    sql += ` AND o.teacher_id = ?`; binds.push(user.id);
  } else if (user.role === 'coach') {
    sql += ` AND o.teacher_id IN (SELECT teacher_id FROM assignments WHERE staff_id=? AND relationship='coach' AND active=1)`;
    binds.push(user.id);
  }
  // super_admin and superintendent: no extra scoping — district-wide

  if (f.from) { sql += ` AND date(o.observed_at) >= date(?)`; binds.push(f.from); }
  if (f.to)   { sql += ` AND date(o.observed_at) <= date(?)`; binds.push(f.to); }
  if (f.teacherId)   { sql += ` AND o.teacher_id = ?`;   binds.push(f.teacherId); }
  if (f.appraiserId) { sql += ` AND o.appraiser_id = ?`; binds.push(f.appraiserId); }
  if (f.schoolId)    { sql += ` AND t.school_id = ?`;    binds.push(f.schoolId); }
  if (f.observationType) { sql += ` AND o.observation_type = ?`; binds.push(f.observationType); }

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
  return {
    scores: (scores.results as any[]) || [],
    feedback: (feedback.results as any[]) || [],
  };
}

// ---------------------------------------------------------------------------
// Report builder page (filter UI + CSV/PDF buttons)
// ---------------------------------------------------------------------------
app.get('/', async (c) => {
  const user = c.get('user')!;
  // Only roles with any read scope should see the reports UI
  if (!['super_admin','superintendent','appraiser','teacher'].includes(user.role)) {
    return c.text('Forbidden', 403);
  }
  const f = parseFilters(c);
  const observations = await scopedObservations(c.env.DB, user, f);

  // Lookups for filter dropdowns
  let teachers: any[] = [];
  if (user.role === 'teacher') {
    teachers = [{ id: user.id, first_name: user.first_name, last_name: user.last_name }];
  } else if (user.role === 'appraiser') {
    const r = await c.env.DB.prepare(
      `SELECT DISTINCT u.id, u.first_name, u.last_name FROM users u
         JOIN assignments a ON a.teacher_id = u.id AND a.relationship='appraiser' AND a.active=1
        WHERE a.staff_id=? AND u.active=1 ORDER BY u.last_name`
    ).bind(user.id).all();
    teachers = (r.results as any[]) || [];
  } else {
    const r = await c.env.DB.prepare(
      `SELECT id, first_name, last_name FROM users WHERE role='teacher' AND active=1 ORDER BY last_name`
    ).all();
    teachers = (r.results as any[]) || [];
  }

  const appraisers = user.role === 'appraiser'
    ? [{ id: user.id, first_name: user.first_name, last_name: user.last_name }]
    : (((await c.env.DB.prepare(
        `SELECT id, first_name, last_name FROM users WHERE role IN ('appraiser','superintendent') AND active=1 ORDER BY last_name`
      ).all()).results) as any[]);

  const schools = ((await c.env.DB.prepare(
    `SELECT id, name FROM schools WHERE district_id=1 ORDER BY name`
  ).all()).results as any[]);

  return c.html(
    <ReportsPage user={user} f={f} observations={observations} teachers={teachers} appraisers={appraisers} schools={schools} />
  );
});

// ---------------------------------------------------------------------------
// CSV exports — selectable mode via ?mode=
//   summary      — one row per observation (dates, teacher, status, avg score)
//   scores       — one row per scored indicator
//   feedback     — one row per feedback item
//   glows        — feedback rows filtered to category=glow (strengths)
//   grows        — feedback rows filtered to category=grow (growth areas)
//   focus        — feedback rows filtered to category=focus_area
//   next_steps   — feedback rows filtered to category=next_step
//   full         — wide one-row-per-observation including all structured text
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
  let filename = `observations_${mode}_${new Date().toISOString().slice(0,10)}.csv`;

  if (mode === 'summary') {
    headers = ['observation_id','observed_at','type','status','teacher','teacher_email','school','appraiser','subject','grade_level','location','duration_minutes','overall_summary','avg_level','scored_indicators','glow_count','grow_count','focus_area_count','next_step_count','published_at','acknowledged_at'];
    const scoresByObs = groupBy(scores, s => s.observation_id);
    const fbByObs = groupBy(feedback, x => x.observation_id);
    for (const o of observations) {
      const s = scoresByObs.get(o.id) || [];
      const fb = fbByObs.get(o.id) || [];
      const avg = s.length ? (s.reduce((a: number, x: any) => a + (x.level || 0), 0) / s.length) : null;
      rows.push([
        o.id, o.observed_at, o.observation_type, o.status,
        `${o.t_last}, ${o.t_first}`, o.t_email, o.school_name || '',
        `${o.a_last}, ${o.a_first}`, o.subject || '', o.grade_level || '', o.location || '', o.duration_minutes || '',
        (o.overall_summary || '').replace(/\s+/g, ' ').trim(),
        avg !== null ? avg.toFixed(2) : '',
        s.length,
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
      const o = obsMap.get(s.observation_id);
      if (!o) continue;
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
    const wanted =
      mode === 'glows' ? 'glow' :
      mode === 'grows' ? 'grow' :
      mode === 'focus' ? 'focus_area' :
      mode === 'next_steps' ? 'next_step' : null;
    for (const fi of feedback) {
      if (wanted && fi.category !== wanted) continue;
      const o = obsMap.get(fi.observation_id);
      if (!o) continue;
      rows.push([
        o.id, o.observed_at, `${o.t_last}, ${o.t_first}`, o.school_name || '',
        `${o.a_last}, ${o.a_first}`,
        fi.category,
        fi.domain_code || '', (fi.indicator_code || '').toUpperCase(), fi.indicator_name || '',
        fi.title || '', (fi.body || '').replace(/\s+/g,' ').trim(),
      ]);
    }
  } else if (mode === 'full') {
    headers = [
      'observation_id','observed_at','type','status','teacher','teacher_email','school','appraiser',
      'subject','grade_level','location','duration_minutes','class_context','overall_summary',
      'scores','strengths_glows','growth_areas_grows','focus_areas','next_steps',
      'published_at','acknowledged_at','teacher_response'
    ];
    const scoresByObs = groupBy(scores, s => s.observation_id);
    const fbByObs = groupBy(feedback, x => x.observation_id);
    for (const o of observations) {
      const s = scoresByObs.get(o.id) || [];
      const fb = fbByObs.get(o.id) || [];
      const scoreStr = s.map((x: any) => `${x.domain_code}.${(x.indicator_code||'').toUpperCase()} ${x.indicator_name}: ${x.level} (${x.level ? (levelLabels as any)[x.level] : ''})`).join(' | ');
      const byCat = (cat: string) => fb.filter((x:any)=>x.category===cat).map((x:any) => (x.title ? `${x.title}: ` : '') + (x.body || '')).join(' | ');
      rows.push([
        o.id, o.observed_at, o.observation_type, o.status,
        `${o.t_last}, ${o.t_first}`, o.t_email, o.school_name || '',
        `${o.a_last}, ${o.a_first}`,
        o.subject || '', o.grade_level || '', o.location || '', o.duration_minutes || '',
        (o.class_context || '').replace(/\s+/g,' ').trim(),
        (o.overall_summary || '').replace(/\s+/g,' ').trim(),
        scoreStr,
        byCat('glow'), byCat('grow'), byCat('focus_area'), byCat('next_step'),
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
// PDF-friendly HTML — opens print-ready in the browser, user clicks browser
// "Print → Save as PDF". No server-side PDF engine needed, which keeps the
// Worker bundle tiny and avoids binary deps (no puppeteer, no chromium).
// Supports the same mode= filter options as CSV.
// ---------------------------------------------------------------------------
app.get('/pdf', async (c) => {
  const user = c.get('user')!;
  const mode = String(c.req.query('mode') || 'summary');
  const include = {
    scores: c.req.query('inc_scores') !== '0',
    glows: c.req.query('inc_glows') !== '0',
    grows: c.req.query('inc_grows') !== '0',
    focus: c.req.query('inc_focus') !== '0',
    nextSteps: c.req.query('inc_next_steps') !== '0',
    notes: c.req.query('inc_notes') !== '0',
    signatures: c.req.query('inc_signatures') !== '0',
    summary: c.req.query('inc_summary') !== '0',
  };
  // Simple presets: "scores_only", "strengths_only", "growth_only"
  if (mode === 'scores_only')   { include.glows = include.grows = include.focus = include.nextSteps = include.notes = false; }
  if (mode === 'strengths_only'){ include.grows = include.focus = include.nextSteps = include.scores = false; }
  if (mode === 'growth_only')   { include.glows = include.scores = false; }
  if (mode === 'feedback_only') { include.scores = false; include.notes = false; }

  const f = parseFilters(c);
  const observations = await scopedObservations(c.env.DB, user, f);
  const ids = observations.map(o => o.id as number);
  const { scores, feedback } = await loadObservationDetails(c.env.DB, ids);
  const scoresByObs = groupBy(scores, s => s.observation_id);
  const fbByObs = groupBy(feedback, x => x.observation_id);
  const district = await c.env.DB.prepare(`SELECT * FROM districts WHERE id=1`).first<any>();
  const fw = await getActiveFramework(c.env.DB);

  await logActivity(c.env.DB, user.id, 'report', null, 'pdf_export', { mode, count: observations.length, filters: f, include });

  const title = observations.length === 1
    ? `Observation — ${observations[0].t_first} ${observations[0].t_last} — ${formatDate(observations[0].observed_at)}`
    : `Observation Report (${observations.length}) — ${formatDate(f.from)} to ${formatDate(f.to) || 'today'}`;

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
    .lvl-4 { background: #d1fae5; }
    .lvl-3 { background: #dbeafe; }
    .lvl-2 { background: #fef3c7; }
    .lvl-1 { background: #fee2e2; }
    .chips span { display: inline-block; border: 0.75pt solid #cbd5e1; padding: 1pt 4pt; border-radius: 2pt; margin: 0 3pt 2pt 0; font-size: 9pt; background: #f8fafc; }
    ul { margin: 2pt 0 4pt 18pt; padding: 0; }
    li { margin-bottom: 2pt; }
    .fb-item { margin-bottom: 4pt; }
    .fb-item .t { font-weight: bold; }
    .sig { margin-top: 10pt; display: flex; gap: 24pt; }
    .sig .box { flex: 1; border: 0.75pt solid #cbd5e1; padding: 4pt; min-height: 40pt; }
    .sig img { max-height: 40pt; }
    .footer { margin-top: 6pt; font-size: 8.5pt; color: #64748b; text-align: center; }
    .print-bar { background: #0b2545; color: white; padding: 8pt 12pt; display: flex; justify-content: space-between; align-items: center; font-family: 'Helvetica Neue', Arial, sans-serif; }
    .print-bar button, .print-bar a { background: #facc15; color: #0b2545; border: none; padding: 5pt 10pt; border-radius: 3pt; font-weight: bold; text-decoration: none; cursor: pointer; margin-left: 6pt; font-size: 10pt; }
    .print-bar a.secondary { background: white; color: #0b2545; }
    @media print { .print-bar { display: none; } body { margin: 0; } }
  `;

  const modeLabel: Record<string,string> = {
    summary: 'Summary',
    scores_only: 'Scores only',
    strengths_only: 'Strengths (Glows) only',
    growth_only: 'Growth Areas & Next Steps only',
    feedback_only: 'Feedback only (no scores)',
    full: 'Full observation',
  };

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>${css}</style>
</head>
<body>
<div class="print-bar">
  <div><strong>${escapeHtml(district?.name || 'District')}</strong> · ${escapeHtml(modeLabel[mode] || 'Observation Report')} · ${observations.length} observation${observations.length!==1?'s':''}</div>
  <div>
    <a class="secondary" href="javascript:history.back()">← Back</a>
    <button onclick="window.print()">🖨 Print / Save as PDF</button>
  </div>
</div>
<div style="padding: 10pt 16pt;">
<h1>${escapeHtml(title)}</h1>
<div class="muted">${escapeHtml((fw as any)?.name || 'Evaluation Rubric')}${(fw as any)?.version ? ` · v${escapeHtml((fw as any).version)}` : ''} · Generated ${escapeHtml(new Date().toISOString().slice(0, 16).replace('T', ' '))}</div>

${observations.map((o, idx) => renderObservation(o, scoresByObs.get(o.id) || [], fbByObs.get(o.id) || [], include, idx > 0)).join('\n')}

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

// ---------------------------------------------------------------------------
// Reports UI (HTML)
// ---------------------------------------------------------------------------
function ReportsPage({ user, f, observations, teachers, appraisers, schools }: any) {
  const activeNav = user.role === 'super_admin' ? 'admin-reports' :
                    user.role === 'superintendent' ? 'supt-reports' :
                    user.role === 'appraiser' ? 'ap-reports' :
                    user.role === 'teacher' ? 't-reports' : '';
  // Build query string carrying current filters through to export URLs
  const qs = (extra: Record<string, string>) => {
    const out: string[] = [];
    const put = (k: string, v: any) => { if (v !== null && v !== undefined && v !== '') out.push(`${k}=${encodeURIComponent(String(v))}`); };
    put('from', f.from); put('to', f.to);
    put('teacher_id', f.teacherId); put('appraiser_id', f.appraiserId);
    put('school_id', f.schoolId); put('type', f.observationType);
    for (const [k, v] of Object.entries(extra)) put(k, v as any);
    return out.join('&');
  };
  return (
    <Layout title="Reports" user={user} activeNav={activeNav}>
      <h1 class="font-display text-2xl text-aps-navy mb-1">Reports &amp; Exports</h1>
      <p class="text-slate-600 text-sm mb-4">Filter published observations and export the exact slice of data you need as CSV (for spreadsheets / statistical analysis) or printable PDF (for HR files, teacher folders, board presentations).</p>

      <Card title="Filters" icon="fas fa-filter">
        <form method="get" action="/reports" class="grid md:grid-cols-3 lg:grid-cols-6 gap-3 text-sm">
          <label>From<input type="date" name="from" value={f.from || ''} class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
          <label>To<input type="date" name="to" value={f.to || ''} class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" /></label>
          <label>Teacher
            <select name="teacher_id" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5">
              <option value="">All</option>
              {teachers.map((t: any) => <option value={t.id} selected={f.teacherId === t.id}>{t.last_name}, {t.first_name}</option>)}
            </select>
          </label>
          <label>Appraiser
            <select name="appraiser_id" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5">
              <option value="">All</option>
              {appraisers.map((a: any) => <option value={a.id} selected={f.appraiserId === a.id}>{a.last_name}, {a.first_name}</option>)}
            </select>
          </label>
          <label>School
            <select name="school_id" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5">
              <option value="">All</option>
              {schools.map((s: any) => <option value={s.id} selected={f.schoolId === s.id}>{s.name}</option>)}
            </select>
          </label>
          <label>Type
            <select name="type" class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5">
              <option value="">All</option>
              <option value="mini" selected={f.observationType==='mini'}>Mini</option>
              <option value="formal" selected={f.observationType==='formal'}>Formal</option>
              <option value="annual_summary" selected={f.observationType==='annual_summary'}>Annual summary</option>
            </select>
          </label>
          <div class="md:col-span-3 lg:col-span-6 flex flex-wrap gap-2">
            <button class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-filter mr-1"></i>Apply filters</button>
            <a href="/reports" class="bg-white border border-slate-300 text-slate-700 px-4 py-2 rounded hover:bg-slate-50 text-sm"><i class="fas fa-rotate-left mr-1"></i>Reset</a>
            <span class="text-sm text-slate-500 self-center ml-2">{observations.length} observation{observations.length!==1?'s':''} match</span>
          </div>
        </form>
      </Card>

      <div class="grid md:grid-cols-2 gap-4 mt-4">
        <Card title="CSV exports" icon="fas fa-file-csv">
          <p class="text-sm text-slate-600 mb-3">Download the current filter result as a CSV file. Opens cleanly in Excel, Google Sheets, or any spreadsheet tool.</p>
          <div class="grid grid-cols-2 gap-2 text-sm">
            <CsvButton href={`/reports/csv?${qs({ mode: 'summary' })}`} icon="fa-table-list" label="Summary (one row per observation)" />
            <CsvButton href={`/reports/csv?${qs({ mode: 'scores' })}`} icon="fa-table-cells" label="All rubric scores" />
            <CsvButton href={`/reports/csv?${qs({ mode: 'feedback' })}`} icon="fa-comments" label="All feedback items" />
            <CsvButton href={`/reports/csv?${qs({ mode: 'glows' })}`} icon="fa-star" label="Strengths (Glows) only" />
            <CsvButton href={`/reports/csv?${qs({ mode: 'grows' })}`} icon="fa-seedling" label="Growth areas (Grows) only" />
            <CsvButton href={`/reports/csv?${qs({ mode: 'focus' })}`} icon="fa-bullseye" label="Focus areas only" />
            <CsvButton href={`/reports/csv?${qs({ mode: 'next_steps' })}`} icon="fa-forward" label="Next steps only" />
            <CsvButton href={`/reports/csv?${qs({ mode: 'full' })}`} icon="fa-file-lines" label="Full / wide (everything joined)" />
          </div>
        </Card>

        <Card title="PDF exports" icon="fas fa-file-pdf">
          <p class="text-sm text-slate-600 mb-3">Opens a printable report in a new tab. Use your browser's Print dialog → "Save as PDF" to save or email. Each observation starts on a new page.</p>
          <div class="grid grid-cols-1 gap-2 text-sm">
            <PdfButton href={`/reports/pdf?${qs({ mode: 'summary' })}`} icon="fa-file-lines" label="Full observation report (everything)" />
            <PdfButton href={`/reports/pdf?${qs({ mode: 'scores_only' })}`} icon="fa-table-cells" label="Scores only" />
            <PdfButton href={`/reports/pdf?${qs({ mode: 'strengths_only' })}`} icon="fa-star" label="Strengths (Glows) only" />
            <PdfButton href={`/reports/pdf?${qs({ mode: 'growth_only' })}`} icon="fa-seedling" label="Growth areas &amp; next steps only" />
            <PdfButton href={`/reports/pdf?${qs({ mode: 'feedback_only' })}`} icon="fa-comments" label="Feedback only (no scores)" />
          </div>
          <details class="mt-3 text-xs text-slate-600">
            <summary class="cursor-pointer hover:text-aps-navy">Advanced — build your own PDF</summary>
            <p class="mt-2">Append any of the following to a PDF URL to include or exclude sections: <code>inc_scores=0</code>, <code>inc_glows=0</code>, <code>inc_grows=0</code>, <code>inc_focus=0</code>, <code>inc_next_steps=0</code>, <code>inc_notes=1</code> (private notes, appraisers only), <code>inc_signatures=0</code>, <code>inc_summary=0</code>.</p>
          </details>
        </Card>
      </div>

      <Card title="Preview — matching observations" icon="fas fa-list" class="mt-4">
        {observations.length === 0 ? <p class="text-slate-500 text-sm">No observations match the selected filters.</p> :
          <table class="w-full text-sm">
            <thead><tr class="text-left border-b border-slate-200 text-slate-600">
              <th class="py-2">Date</th><th>Teacher</th><th>School</th><th>Type</th><th>Appraiser</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {observations.slice(0, 100).map((o: any) => (
                <tr class="border-b border-slate-100">
                  <td class="py-2">{formatDate(o.observed_at)}</td>
                  <td>{o.t_last}, {o.t_first}</td>
                  <td class="text-slate-600">{o.school_name || '—'}</td>
                  <td class="text-slate-600 capitalize">{(o.observation_type || '').replace('_',' ')}</td>
                  <td class="text-slate-600">{o.a_last}, {o.a_first}</td>
                  <td class="text-slate-600">{statusLabel(o.status)}</td>
                  <td><a href={`/reports/pdf?${qs({})}&teacher_id=${o.t_id}&from=${(o.observed_at||'').slice(0,10)}&to=${(o.observed_at||'').slice(0,10)}&mode=summary`} target="_blank" rel="noopener" class="text-aps-blue hover:underline text-xs"><i class="fas fa-file-pdf mr-1"></i>PDF this one</a></td>
                </tr>
              ))}
            </tbody>
          </table>
        }
        {observations.length > 100 && <p class="text-xs text-slate-500 mt-2">Showing 100 of {observations.length} — exports include all matching rows.</p>}
      </Card>
    </Layout>
  );
}

function CsvButton({ href, icon, label }: any) {
  return (
    <a href={href} class="flex items-center gap-2 bg-white border border-aps-navy text-aps-navy px-3 py-2 rounded hover:bg-slate-50 text-sm">
      <i class={`fas ${icon}`}></i><span class="flex-1">{label}</span><i class="fas fa-download text-xs"></i>
    </a>
  );
}

function PdfButton({ href, icon, label }: any) {
  return (
    <a href={href} target="_blank" rel="noopener" class="flex items-center gap-2 bg-aps-navy text-white px-3 py-2 rounded hover:bg-aps-blue text-sm">
      <i class={`fas ${icon}`}></i><span class="flex-1">{label}</span><i class="fas fa-up-right-from-square text-xs"></i>
    </a>
  );
}

export default app;
