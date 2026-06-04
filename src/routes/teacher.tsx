import { Hono } from 'hono';
import type { Bindings, Variables } from '../lib/types';
import { Layout, Card, Button } from '../lib/layout';
import { requireRole } from '../lib/auth';
import {
  getTeacherSummary, getObservation, logActivity,
  // June 2, 2026 helpers
  listTeacherGoals, getTeacherGoal,
  listExternalPdForTeacher,
  getTeacherPDHoursSummary,
  getNumericSetting,
} from '../lib/db';
import { teacherEnrollments } from '../lib/pd';
import { softenTitleForTeacher, softenSourceForTeacher } from '../lib/teacher_labels';
import { levelColor, levelLabels, formatDate, formatDateTime, statusBadge, statusLabel, escapeHtml } from '../lib/ui';
import { notify } from '../lib/notifications';
import { Prose } from '../lib/prose';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use('*', requireRole(['teacher']));

app.get('/', async (c) => {
  const user = c.get('user')!;
  const welcome = c.req.query('welcome') === '1';
  const [summary, enrollments, goals, externalPd, hours] = await Promise.all([
    getTeacherSummary(c.env.DB, user.id),
    teacherEnrollments(c.env.DB, user.id),
    listTeacherGoals(c.env.DB, user.id),
    listExternalPdForTeacher(c.env.DB, user.id),
    getTeacherPDHoursSummary(c.env.DB, { teacherId: user.id }),
  ]);
  const teacherHours = (hours.rows && hours.rows[0]) || { total_hours: 0, internal_hours: 0, external_hours: 0, target: hours.target };
  return c.html(
    <TeacherHome
      user={user}
      summary={summary}
      enrollments={enrollments}
      goals={goals}
      externalPd={externalPd}
      hours={teacherHours}
      hoursTarget={hours.target}
      welcome={welcome}
      msg={c.req.query('msg')}
    />
  );
});

app.get('/observations', async (c) => {
  const user = c.get('user')!;
  const summary = await getTeacherSummary(c.env.DB, user.id);
  return c.html(<TeacherObservations user={user} summary={summary} />);
});

app.get('/observations/:id', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const o = await getObservation(c.env.DB, id);
  if (!o || o.teacher_id !== user.id) return c.text('Not found', 404);
  if (o.status !== 'published' && o.status !== 'acknowledged') return c.text('This observation has not been published yet.', 403);
  const msg = c.req.query('msg');
  return c.html(<TeacherObservationView user={user} o={o} msg={msg} />);
});

app.post('/observations/:id/acknowledge', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const o = await c.env.DB.prepare('SELECT * FROM observations WHERE id = ? AND teacher_id = ?').bind(id, user.id).first<any>();
  if (!o) return c.text('Not found', 404);
  if (o.status !== 'published') return c.redirect(`/teacher/observations/${id}`);
  const body = await c.req.parseBody();
  const sig = String(body.signature || '');
  const response = String(body.response || '').trim() || null;
  if (!sig || !sig.startsWith('data:image/')) return c.redirect(`/teacher/observations/${id}?msg=Signature+required`);
  await c.env.DB.prepare(
    `UPDATE observations SET status = 'acknowledged', teacher_acknowledged_at = CURRENT_TIMESTAMP,
     teacher_signature_data = ?, teacher_response = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(sig, response, id).run();
  await logActivity(c.env.DB, user.id, 'observation', id, 'acknowledge');

  // Notify the appraiser (and any super-admin) that the teacher has acknowledged
  await notify(c.env.DB, {
    user_id: o.appraiser_id,
    kind: 'observation_acknowledged',
    title: 'Teacher acknowledged',
    body: `${user.first_name} ${user.last_name} acknowledged the observation${response ? ' and left a comment.' : '.'}`,
    url: `/appraiser/observations/${id}`,
    entity_type: 'observation', entity_id: id, actor_user_id: user.id,
  }, c.env);
  return c.redirect(`/teacher/observations/${id}?msg=Acknowledged`);
});

app.get('/focus', async (c) => {
  const user = c.get('user')!;
  const summary = await getTeacherSummary(c.env.DB, user.id);
  return c.html(<TeacherFocus user={user} summary={summary} />);
});

// ===========================================================================
// Fix 10 (June 2, 2026) — Teacher Personal Goal Tracking
// CRUD for the teacher's own goals. Only the teacher themselves can manage
// their goals; admins/appraisers/coaches see them via other surfaces.
// ===========================================================================
app.post('/goals', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const title = String(body.title || '').trim();
  const description = String(body.description || '').trim() || null;
  const target_date = String(body.target_date || '').trim() || null;
  const domain_code = String(body.domain_code || '').trim() || null;
  if (!title) return c.redirect('/teacher?msg=Goal+title+is+required');
  await c.env.DB.prepare(
    `INSERT INTO teacher_goals (teacher_id, title, description, target_date, domain_code, status, progress_pct)
     VALUES (?, ?, ?, ?, ?, 'active', 0)`
  ).bind(user.id, title, description, target_date, domain_code).run();
  await logActivity(c.env.DB, user.id, 'teacher_goal', null, 'create', { title });
  return c.redirect('/teacher?msg=Goal+added');
});

app.post('/goals/:id/update', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const g = await getTeacherGoal(c.env.DB, id);
  if (!g || g.teacher_id !== user.id) return c.text('Not found', 404);
  const body = await c.req.parseBody();
  const title = String(body.title || g.title).trim();
  const description = String(body.description || '').trim() || null;
  const target_date = String(body.target_date || '').trim() || null;
  const status = String(body.status || g.status);
  const progress_notes = String(body.progress_notes || '').trim() || null;
  const progress_pct = Math.max(0, Math.min(100, Number(body.progress_pct || g.progress_pct || 0)));
  const completed_at = status === 'complete' && !g.completed_at ? new Date().toISOString().slice(0, 19).replace('T', ' ') : g.completed_at;
  await c.env.DB.prepare(
    `UPDATE teacher_goals SET title = ?, description = ?, target_date = ?, status = ?, progress_notes = ?, progress_pct = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`
  ).bind(title, description, target_date, status, progress_notes, progress_pct, completed_at, id).run();
  return c.redirect('/teacher?msg=Goal+updated#my-goals');
});

app.post('/goals/:id/delete', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const g = await getTeacherGoal(c.env.DB, id);
  if (!g || g.teacher_id !== user.id) return c.text('Not found', 404);
  await c.env.DB.prepare(`UPDATE teacher_goals SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run();
  return c.redirect('/teacher?msg=Goal+removed#my-goals');
});

// ===========================================================================
// Fix 5 (June 2, 2026) — Teacher External PD submission
// Teacher creates an external_pd_submissions row in status='submitted'.
// Appraisers approve/decline via /appraiser/external-pd. See appraiser.tsx.
// ===========================================================================
app.post('/external-pd', async (c) => {
  const user = c.get('user')!;
  const body = await c.req.parseBody();
  const title = String(body.title || '').trim();
  const provider = String(body.provider || '').trim() || null;
  const start_date = String(body.start_date || '').trim() || null;
  const end_date = String(body.end_date || '').trim() || null;
  const hours = Number(body.hours || 0);
  const description = String(body.description || '').trim() || null;
  const certificate_url = String(body.certificate_url || '').trim() || null;
  const domain_alignment = String(body.domain_alignment || '').trim() || null; // comma-separated codes
  if (!title || !(hours > 0)) return c.redirect('/teacher?msg=Title+and+positive+hours+are+required#external-pd');
  // Normalize domain_alignment to JSON
  const domains = domain_alignment
    ? JSON.stringify(domain_alignment.split(',').map((s) => s.trim()).filter(Boolean))
    : null;
  const ins = await c.env.DB.prepare(
    `INSERT INTO external_pd_submissions
       (teacher_id, title, provider, start_date, end_date, hours, domain_alignment, description, certificate_url, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted')`
  ).bind(user.id, title, provider, start_date, end_date, hours, domains, description, certificate_url).run();
  const subId = Number((ins.meta as any)?.last_row_id || 0);
  // Notify primary appraiser if any
  const appraiser = await c.env.DB.prepare(
    `SELECT u.id, u.first_name, u.last_name FROM assignments a
       JOIN users u ON u.id = a.staff_id
       WHERE a.teacher_id = ? AND a.relationship = 'appraiser' AND a.active = 1 AND u.active = 1
       LIMIT 1`
  ).bind(user.id).first<any>();
  if (appraiser) {
    await notify(c.env.DB, {
      user_id: appraiser.id,
      kind: 'external_pd_submitted',
      title: 'External PD awaiting review',
      body: `${user.first_name} ${user.last_name} submitted "${title}" (${hours}h) for approval.`,
      url: `/appraiser/external-pd/${subId}`,
      entity_type: 'external_pd_submission', entity_id: subId,
      actor_user_id: user.id,
    }, c.env);
  }
  return c.redirect('/teacher?msg=External+PD+submitted+for+review#external-pd');
});

app.post('/external-pd/:id/delete', async (c) => {
  // Teacher can soft-delete their own submissions only while status='submitted'.
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare(
    `SELECT * FROM external_pd_submissions WHERE id = ? AND teacher_id = ? AND deleted_at IS NULL`
  ).bind(id, user.id).first<any>();
  if (!row) return c.text('Not found', 404);
  if (row.status !== 'submitted' && row.status !== 'needs_revision') {
    return c.redirect('/teacher?msg=Cannot+withdraw+after+review#external-pd');
  }
  await c.env.DB.prepare(`UPDATE external_pd_submissions SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`).bind(id).run();
  return c.redirect('/teacher?msg=Submission+withdrawn#external-pd');
});

// ===========================================================================
// Fix 3 (June 2, 2026) — Teacher PD Plan PDF export
// Renders a print-ready HTML page (browser handles the actual PDF rendering),
// matching the existing /reports/pdf pattern from reports.tsx so the look and
// feel is identical.
// ===========================================================================
app.get('/pd-plan/export.pdf', async (c) => {
  const user = c.get('user')!;
  const [enrollments, goals, externalPd, hours, district, summary] = await Promise.all([
    teacherEnrollments(c.env.DB, user.id),
    listTeacherGoals(c.env.DB, user.id),
    listExternalPdForTeacher(c.env.DB, user.id),
    getTeacherPDHoursSummary(c.env.DB, { teacherId: user.id }),
    c.env.DB.prepare(`SELECT * FROM districts WHERE id = 1`).first<any>(),
    getTeacherSummary(c.env.DB, user.id),
  ]);
  const teacherHours = (hours.rows && hours.rows[0]) || { total_hours: 0, internal_hours: 0, external_hours: 0, target: hours.target };

  // Filter to enrollments NOT verified yet — these are the "plan" the teacher
  // is currently working on. Verified ones are reported in the totals block.
  const active = (enrollments as any[]).filter((e) => e.status !== 'verified' && e.status !== 'declined');
  const completed = (enrollments as any[]).filter((e) => e.status === 'verified');
  await logActivity(c.env.DB, user.id, 'pd_plan_pdf', null, 'export', { active: active.length, completed: completed.length, goals: goals.length });

  const css = `
    @page { size: Letter; margin: 0.6in 0.7in; }
    body { font-family: Georgia, 'Times New Roman', serif; color: #0b2545; font-size: 11pt; line-height: 1.4; }
    h1, h2, h3 { font-family: 'Helvetica Neue', Arial, sans-serif; color: #0b2545; }
    h1 { font-size: 22pt; margin: 0 0 2pt; }
    h2 { font-size: 14pt; margin: 14pt 0 4pt; border-bottom: 1pt solid #cbd5e1; padding-bottom: 2pt; }
    h3 { font-size: 11pt; margin: 8pt 0 2pt; color: #1e3a8a; }
    .muted { color: #475569; font-size: 9.5pt; }
    .meta { display: flex; flex-wrap: wrap; gap: 4pt 12pt; font-size: 10pt; margin-top: 4pt; }
    .meta b { color: #0b2545; }
    .pill { display: inline-block; border: 0.75pt solid #cbd5e1; padding: 1pt 6pt; border-radius: 10pt; font-size: 9pt; background: #f8fafc; margin-right: 3pt; }
    table.plan { width: 100%; border-collapse: collapse; font-size: 10pt; margin-top: 4pt; }
    table.plan th, table.plan td { border: 0.75pt solid #cbd5e1; padding: 4pt 6pt; text-align: left; vertical-align: top; }
    table.plan th { background: #e2e8f0; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.5pt; }
    .hours { display: flex; gap: 20pt; margin-top: 4pt; font-size: 11pt; }
    .hours .b { font-weight: bold; font-size: 18pt; color: #0b2545; }
    .goal { page-break-inside: avoid; border-left: 2pt solid #c9a227; padding: 4pt 6pt; margin: 4pt 0; background: #fffbeb; }
    .footer { margin-top: 10pt; font-size: 8.5pt; color: #64748b; text-align: center; }
    .print-bar { background: #0b2545; color: white; padding: 8pt 12pt; display: flex; justify-content: space-between; align-items: center; font-family: 'Helvetica Neue', Arial, sans-serif; }
    .print-bar button, .print-bar a { background: #facc15; color: #0b2545; border: none; padding: 5pt 10pt; border-radius: 3pt; font-weight: bold; text-decoration: none; cursor: pointer; margin-left: 6pt; font-size: 10pt; }
    .print-bar a.secondary { background: white; color: #0b2545; }
    @media print { .print-bar { display: none; } body { margin: 0; } }
  `;
  const pctText = (n: number) => `${Math.round(n * 100)}%`;
  const rowsHtml = (rows: any[]) => rows.map((e) => {
    // Fix 2: soften title for teacher-facing output
    const title = escapeHtml(softenTitleForTeacher(e.module_title || ''));
    const dom = escapeHtml(`${e.domain_code || ''}.${(e.indicator_code || '').toUpperCase()} ${e.indicator_name || ''}`);
    const status = escapeHtml(e.status || '');
    const sub = escapeHtml(e.module_subtitle || '');
    const minutes = e.est_minutes ? `${e.est_minutes}m` : '';
    const hoursCredited = e.hours_credited ? `${Number(e.hours_credited).toFixed(2)}h credited` : '';
    return `<tr><td>${dom}</td><td><b>${title}</b>${sub ? `<br/><span class="muted">${sub}</span>` : ''}</td><td>${status}</td><td>${minutes}</td><td>${hoursCredited}</td></tr>`;
  }).join('');
  const goalsHtml = (goals as any[]).map((g: any) => `
    <div class="goal">
      <div><b>${escapeHtml(g.title)}</b>${g.target_date ? ` <span class="muted">· target ${escapeHtml(g.target_date)}</span>` : ''} <span class="pill">${escapeHtml(g.status)}</span></div>
      ${g.description ? `<div class="muted">${escapeHtml(g.description)}</div>` : ''}
      ${g.progress_notes ? `<div style="margin-top:2pt;">${escapeHtml(g.progress_notes)}</div>` : ''}
      <div class="muted">Progress: ${Number(g.progress_pct || 0)}%</div>
    </div>
  `).join('') || '<div class="muted">No personal goals on file yet.</div>';

  const externalHtml = (externalPd as any[]).length === 0 ? '<div class="muted">No external PD submitted.</div>' : `
    <table class="plan">
      <thead><tr><th>Title</th><th>Provider</th><th>Dates</th><th>Hours</th><th>Status</th></tr></thead>
      <tbody>
        ${(externalPd as any[]).map((x) => `
          <tr>
            <td><b>${escapeHtml(x.title)}</b></td>
            <td>${escapeHtml(x.provider || '—')}</td>
            <td>${escapeHtml([x.start_date, x.end_date].filter(Boolean).join(' → ') || '—')}</td>
            <td>${Number(x.approved_hours || x.hours).toFixed(2)}h</td>
            <td>${escapeHtml(x.status)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>`;
  const planTable = (rows: any[], emptyMsg: string) => rows.length === 0
    ? `<div class="muted">${emptyMsg}</div>`
    : `<table class="plan"><thead><tr><th>Indicator</th><th>Module</th><th>Status</th><th>Est</th><th>Credit</th></tr></thead><tbody>${rowsHtml(rows)}</tbody></table>`;

  const title = `My PD Plan — ${user.first_name} ${user.last_name}`;
  const html = `<!doctype html><html lang="en"><head>
<meta charset="utf-8"/><title>${escapeHtml(title)}</title><style>${css}</style></head><body>
<div class="print-bar">
  <div><strong>${escapeHtml(district?.name || 'Alexander Public Schools')}</strong> · PD Plan · ${escapeHtml(user.first_name + ' ' + user.last_name)}</div>
  <div>
    <a class="secondary" href="/teacher">← Back</a>
    <button onclick="window.print()">🖨 Print / Save as PDF</button>
  </div>
</div>
<div style="padding: 10pt 16pt;">
  <h1>${escapeHtml(title)}</h1>
  <div class="muted">Generated ${escapeHtml(new Date().toISOString().slice(0, 16).replace('T',' '))} · ${escapeHtml(user.title || 'Teacher')}</div>

  <h2>PD Hours This Year</h2>
  <div class="hours">
    <div><div class="b">${Number(teacherHours.total_hours).toFixed(2)}h</div><div class="muted">Total credited (target ${Number(teacherHours.target).toFixed(1)}h, ${pctText((teacherHours.total_hours || 0) / (teacherHours.target || 1))})</div></div>
    <div><div class="b">${Number(teacherHours.internal_hours || 0).toFixed(2)}h</div><div class="muted">Internal LMS (verified)</div></div>
    <div><div class="b">${Number(teacherHours.external_hours || 0).toFixed(2)}h</div><div class="muted">External PD (approved)</div></div>
  </div>

  <h2>My Personal Goals (${(goals as any[]).length})</h2>
  ${goalsHtml}

  <h2>Active PD Modules (${active.length})</h2>
  ${planTable(active, 'No active modules right now. Nice work!')}

  <h2>Completed &amp; Verified Modules (${completed.length})</h2>
  ${planTable(completed, 'No completed modules yet — your next verified module will appear here.')}

  <h2>External PD Submissions</h2>
  ${externalHtml}

  ${summary ? `<h2>Active Focus Areas (${(summary.focusAreas as any[]).length})</h2>
  ${(summary.focusAreas as any[]).length === 0
    ? '<div class="muted">No active focus areas.</div>'
    : (summary.focusAreas as any[]).map((f: any) => `<div class="goal"><b>${escapeHtml(f.title)}</b>${f.domain_code ? ` <span class="muted">${escapeHtml(f.domain_code)}.${escapeHtml((f.indicator_code||'').toUpperCase())} ${escapeHtml(f.indicator_name||'')}</span>` : ''}${f.description ? `<div class="muted">${escapeHtml(f.description)}</div>` : ''}</div>`).join('')
  }` : ''}

  <div class="footer">${escapeHtml(district?.name || '')} ${district?.address ? ' — ' + escapeHtml(district.address) : ''}${district?.phone ? ' — ' + escapeHtml(district.phone) : ''}</div>
</div>
</body></html>`;
  return c.html(html);
});

export default app;

// ---------------------------- VIEWS ----------------------------

function TeacherHome({ user, summary, enrollments, goals, externalPd, hours, hoursTarget, welcome, msg }: any) {
  if (!summary) return <Layout title="Dashboard" user={user}><p>No teacher record found.</p></Layout>;
  const { observations, focusAreas } = summary;
  const recent = observations.filter((o: any) => o.status === 'published' || o.status === 'acknowledged').slice(0, 5);
  const awaiting = observations.filter((o: any) => o.status === 'published').length;
  // Fix 4: "Recommended for You" — show non-declined recommended/started enrollments
  // that came from auto-enroll or a supervisor recommendation.
  const recommended = (enrollments as any[]).filter((e) =>
    (e.status === 'recommended' || e.status === 'started')
    && (e.source === 'auto' || e.source === 'assigned' || e.recommended_by_user_id)
  ).slice(0, 6);
  // Fix 10: split goals
  const activeGoals = (goals as any[]).filter((g) => g.status === 'active' || g.status === 'on_hold');
  const completedGoals = (goals as any[]).filter((g) => g.status === 'complete');
  const totalHours = Number(hours?.total_hours || 0);
  const pct = hoursTarget > 0 ? totalHours / hoursTarget : 0;
  const pctText = Math.round(pct * 100);
  const barColor = pct >= 1 ? 'bg-emerald-500' : pct >= 0.66 ? 'bg-sky-500' : pct >= 0.33 ? 'bg-amber-500' : 'bg-rose-400';

  return (
    <Layout title="Dashboard" user={user} activeNav="t-home" autoLaunchTour={!!welcome}>
      <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 class="font-display text-2xl text-aps-navy">Welcome, {user.first_name}</h1>
          <p class="text-slate-600 text-sm">Your personal growth dashboard · {user.title || ''}</p>
        </div>
        {/* Fix 3: PD Plan PDF download */}
        <a
          href="/teacher/pd-plan/export.pdf"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-aps-gold text-aps-navy hover:bg-yellow-400"
        >
          <i class="fas fa-file-pdf"></i> Download My PD Plan (PDF)
        </a>
      </div>

      {msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{decodeURIComponent(String(msg))}</div>}

      {awaiting > 0 && (
        <div class="mb-6 p-4 rounded-md bg-amber-50 border border-amber-200 flex items-center justify-between">
          <div><i class="fas fa-bell mr-2 text-amber-700"></i><span class="text-amber-900">You have <strong>{awaiting}</strong> observation{awaiting>1?'s':''} awaiting your review and acknowledgement.</span></div>
          <Button href="/teacher/observations" variant="primary">Review</Button>
        </div>
      )}

      {/* Summary stat row — now includes Fix 6 PD hours pill */}
      <div class="grid md:grid-cols-4 gap-4 mb-6" data-tour="t-summary">
        <Card title="Active Focus Areas" icon="fas fa-bullseye">
          <div class="text-3xl font-display text-aps-navy">{focusAreas.length}</div>
          <a href="/teacher/focus" class="text-sm text-aps-blue hover:underline">View all →</a>
        </Card>
        <Card title="Published Observations" icon="fas fa-clipboard-check">
          <div class="text-3xl font-display text-aps-navy">{observations.filter((o:any)=>o.status==='published'||o.status==='acknowledged').length}</div>
          <a href="/teacher/observations" class="text-sm text-aps-blue hover:underline">View all →</a>
        </Card>
        <Card title="PD Hours This Year" icon="fas fa-clock">
          <div class="text-3xl font-display text-aps-navy">{totalHours.toFixed(1)}h</div>
          <div class="text-xs text-slate-500 mb-2">of {Number(hoursTarget).toFixed(1)}h target ({pctText}%)</div>
          <div class="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
            <div class={`h-full ${barColor}`} style={`width:${Math.min(100, Math.max(0, pctText))}%`}></div>
          </div>
          <div class="text-xs text-slate-500 mt-2">{Number(hours?.internal_hours || 0).toFixed(1)}h LMS · {Number(hours?.external_hours || 0).toFixed(1)}h external</div>
        </Card>
        <Card title="My Goals" icon="fas fa-flag">
          <div class="text-3xl font-display text-aps-navy">{activeGoals.length}</div>
          <a href="#my-goals" class="text-sm text-aps-blue hover:underline">Manage →</a>
        </Card>
      </div>

      {/* Fix 4 — Recommended for You.
          Split into Support PD (target_level 1 or 2 — auto/assigned from a
          below-Effective score) and Stretch PD (target_level 3 — optional
          leadership pathway toward Highly Effective). Marshall's standard is
          Effective; Stretch PD is opt-in, not remediation. */}
      {(() => {
        const support = recommended.filter((e: any) => Number(e.target_level) !== 3);
        const stretch = recommended.filter((e: any) => Number(e.target_level) === 3);
        const renderItem = (e: any, tone: 'support' | 'stretch') => {
          const friendlyTitle = softenTitleForTeacher(e.module_title);
          const sourceCaption = softenSourceForTeacher(e);
          const captionClass = tone === 'stretch' ? 'text-indigo-700' : 'text-amber-700';
          const captionIcon = tone === 'stretch' ? 'fas fa-arrow-up-right-dots' : 'fas fa-lightbulb';
          return (
            <li class="border border-slate-200 rounded-md p-3 flex flex-wrap items-start gap-3">
              <div class="flex-1 min-w-[200px]">
                <div class="text-xs text-slate-500">{e.domain_code}.{(e.indicator_code || '').toUpperCase()} · {e.indicator_name}</div>
                <div class="font-medium text-aps-navy">{friendlyTitle}</div>
                {e.module_subtitle && <div class="text-sm text-slate-600">{e.module_subtitle}</div>}
                {sourceCaption && (
                  <div class={`text-xs ${captionClass} mt-1`}><i class={`${captionIcon} mr-1`}></i>{sourceCaption}</div>
                )}
                {e.recommender_note && (
                  <div class="text-xs text-slate-600 mt-1 italic">"{e.recommender_note}"</div>
                )}
              </div>
              <a href={`/teacher/pd/${e.id}`} class="px-3 py-1.5 rounded-md bg-aps-navy text-white text-sm hover:bg-aps-blue whitespace-nowrap">Open module</a>
            </li>
          );
        };
        return (
          <>
            <Card id="recommended-for-you" title="Recommended for You" icon="fas fa-wand-magic-sparkles" class="mb-6">
              {support.length === 0 ? (
                <p class="text-slate-500 text-sm">Nothing recommended right now. Your coach or principal can recommend modules here, and your own observations may surface new ones too.</p>
              ) : (
                <ul class="space-y-2">
                  {support.map((e: any) => renderItem(e, 'support'))}
                </ul>
              )}
            </Card>

            {stretch.length > 0 && (
              <Card id="stretch-growth" title="Optional Stretch Growth" icon="fas fa-arrow-up-right-dots" class="mb-6">
                <p class="text-xs text-slate-600 mb-3 leading-relaxed">
                  <span class="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-800 bg-indigo-100 border border-indigo-200 rounded px-1.5 py-0.5 mr-1">Stretch PD</span>
                  You are meeting the Marshall standard on these indicators. These optional modules surface what
                  <em> Highly Effective </em> practice looks like — feel free to explore them when you are ready to
                  model, coach, or lead beyond the rubric.
                </p>
                <ul class="space-y-2">
                  {stretch.map((e: any) => renderItem(e, 'stretch'))}
                </ul>
              </Card>
            )}
          </>
        );
      })()}

      <div class="grid md:grid-cols-2 gap-6">
        <Card title="Active Focus Areas" icon="fas fa-bullseye">
          {focusAreas.length === 0 ? <p class="text-slate-500 text-sm">No active focus areas.</p> :
            <ul class="space-y-3">
              {focusAreas.map((f: any) => (
                <li class="border border-slate-200 rounded-md p-3">
                  <div class="text-xs text-slate-500">{f.domain_code && `${f.domain_code}.${f.indicator_code} · ${f.indicator_name}`}</div>
                  <div class="font-medium text-aps-navy">{f.title}</div>
                  {f.description && <div class="text-sm text-slate-600 mt-1">{f.description}</div>}
                  <div class="text-xs text-slate-400 mt-1">Opened {formatDate(f.opened_at)}</div>
                </li>
              ))}
            </ul>
          }
        </Card>
        <Card title="Recent Published Observations" icon="fas fa-clock-rotate-left">
          {recent.length === 0 ? <p class="text-slate-500 text-sm">No published observations yet.</p> :
            <ul class="space-y-2">
              {recent.map((o: any) => (
                <li class="flex items-center justify-between border border-slate-200 rounded-md p-3">
                  <div>
                    <div class="font-medium text-aps-navy">{o.observation_type === 'mini' ? 'Mini-Observation' : (o.observation_type === 'formal' ? 'Formal Observation' : 'Annual Summary')}</div>
                    <div class="text-xs text-slate-500">{formatDate(o.observed_at)} · {o.app_first} {o.app_last}</div>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class={`px-2 py-0.5 rounded-full text-xs border ${statusBadge(o.status)}`}>{statusLabel(o.status)}</span>
                    <a href={`/teacher/observations/${o.id}`} class="text-sm text-aps-blue hover:underline">View</a>
                  </div>
                </li>
              ))}
            </ul>
          }
        </Card>
      </div>

      {/* Fix 10 — My Goals card with inline create form */}
      <Card id="my-goals" title="My Goals" icon="fas fa-flag" class="mt-6">
        <p class="text-sm text-slate-600 mb-3">
          Track your personal growth goals across the year. Goals appear on your PD Plan PDF and in your annual summary.
        </p>
        <form method="post" action="/teacher/goals" class="grid md:grid-cols-3 gap-2 text-sm mb-4 bg-slate-50 border border-slate-200 rounded p-3">
          <label class="md:col-span-2">
            <span class="block text-xs text-slate-600 mb-1">Goal title <span class="text-rose-600">*</span></span>
            <input name="title" required class="w-full border border-slate-300 rounded px-2 py-1.5" placeholder="e.g. Use cold-call protocol 3x/week" />
          </label>
          <label>
            <span class="block text-xs text-slate-600 mb-1">Target date</span>
            <input name="target_date" type="date" class="w-full border border-slate-300 rounded px-2 py-1.5" />
          </label>
          <label class="md:col-span-2">
            <span class="block text-xs text-slate-600 mb-1">Description</span>
            <textarea name="description" rows={2} class="w-full border border-slate-300 rounded px-2 py-1.5" placeholder="What does success look like?"></textarea>
          </label>
          <label>
            <span class="block text-xs text-slate-600 mb-1">Aligned domain</span>
            <select name="domain_code" class="w-full border border-slate-300 rounded px-2 py-1.5">
              <option value="">— optional —</option>
              {['A','B','C','D','E','F'].map((c) => <option value={c}>Domain {c}</option>)}
            </select>
          </label>
          <div class="md:col-span-3 text-right">
            <button class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-plus mr-1"></i>Add goal</button>
          </div>
        </form>

        {activeGoals.length === 0 && completedGoals.length === 0 ? (
          <p class="text-slate-500 text-sm">No goals on file yet. Add your first one above.</p>
        ) : (
          <ul class="space-y-3">
            {[...activeGoals, ...completedGoals].map((g: any) => <GoalRow goal={g} />)}
          </ul>
        )}
      </Card>

      {/* Fix 5 — External PD submission */}
      <Card id="external-pd" title="Submit External PD" icon="fas fa-cloud-arrow-up" class="mt-6">
        <p class="text-sm text-slate-600 mb-3">
          Submit conferences, workshops, or coursework completed <em>outside</em> the platform. Your appraiser reviews and credits hours toward your annual target.
        </p>
        <form method="post" action="/teacher/external-pd" class="grid md:grid-cols-3 gap-2 text-sm mb-4 bg-slate-50 border border-slate-200 rounded p-3">
          <label class="md:col-span-2">
            <span class="block text-xs text-slate-600 mb-1">Title <span class="text-rose-600">*</span></span>
            <input name="title" required class="w-full border border-slate-300 rounded px-2 py-1.5" placeholder="e.g. AVID Summer Institute 2026" />
          </label>
          <label>
            <span class="block text-xs text-slate-600 mb-1">Provider</span>
            <input name="provider" class="w-full border border-slate-300 rounded px-2 py-1.5" placeholder="e.g. NDCEL" />
          </label>
          <label>
            <span class="block text-xs text-slate-600 mb-1">Start date</span>
            <input name="start_date" type="date" class="w-full border border-slate-300 rounded px-2 py-1.5" />
          </label>
          <label>
            <span class="block text-xs text-slate-600 mb-1">End date</span>
            <input name="end_date" type="date" class="w-full border border-slate-300 rounded px-2 py-1.5" />
          </label>
          <label>
            <span class="block text-xs text-slate-600 mb-1">Hours <span class="text-rose-600">*</span></span>
            <input name="hours" type="number" min="0.25" step="0.25" required class="w-full border border-slate-300 rounded px-2 py-1.5" placeholder="e.g. 6.0" />
          </label>
          <label class="md:col-span-2">
            <span class="block text-xs text-slate-600 mb-1">Aligned domains <span class="text-slate-400">(comma-separated: A,B,D)</span></span>
            <input name="domain_alignment" class="w-full border border-slate-300 rounded px-2 py-1.5" placeholder="A,B" />
          </label>
          <label>
            <span class="block text-xs text-slate-600 mb-1">Certificate URL</span>
            <input name="certificate_url" type="url" class="w-full border border-slate-300 rounded px-2 py-1.5" placeholder="https://..." />
          </label>
          <label class="md:col-span-3">
            <span class="block text-xs text-slate-600 mb-1">Description / takeaways</span>
            <textarea name="description" rows={3} class="w-full border border-slate-300 rounded px-2 py-1.5" placeholder="What you learned and how you'll apply it"></textarea>
          </label>
          <div class="md:col-span-3 text-right">
            <button class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-paper-plane mr-1"></i>Submit for approval</button>
          </div>
        </form>

        {externalPd.length === 0 ? (
          <p class="text-slate-500 text-sm">No external PD submitted yet.</p>
        ) : (
          <div class="overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5">
            <table class="w-full text-sm">
              <thead><tr class="text-left border-b border-slate-200 text-slate-600">
                <th class="py-2">Title</th><th>Provider</th><th>Dates</th><th>Hours</th><th>Status</th><th>Reviewer</th><th></th>
              </tr></thead>
              <tbody>
                {externalPd.map((x: any) => (
                  <tr class="border-b border-slate-100">
                    <td class="py-2 font-medium text-aps-navy">{x.title}</td>
                    <td>{x.provider || '—'}</td>
                    <td class="text-xs">{[x.start_date, x.end_date].filter(Boolean).join(' → ') || '—'}</td>
                    <td>{Number(x.approved_hours || x.hours).toFixed(2)}h</td>
                    <td><span class={`px-2 py-0.5 rounded-full text-xs border ${externalStatusBadge(x.status)}`}>{x.status}</span></td>
                    <td class="text-xs text-slate-500">{x.reviewer_first ? `${x.reviewer_first} ${x.reviewer_last}` : '—'}</td>
                    <td>
                      {(x.status === 'submitted' || x.status === 'needs_revision') && (
                        <form method="post" action={`/teacher/external-pd/${x.id}/delete`} class="inline" onsubmit="return confirm('Withdraw this submission?')">
                          <button class="text-xs text-rose-700 hover:underline"><i class="fas fa-xmark"></i> Withdraw</button>
                        </form>
                      )}
                      {x.review_note && <div class="text-xs text-slate-500 italic">"{x.review_note}"</div>}
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

function externalStatusBadge(s: string) {
  switch (s) {
    case 'approved':       return 'bg-emerald-50 border-emerald-200 text-emerald-800';
    case 'declined':       return 'bg-rose-50 border-rose-200 text-rose-800';
    case 'needs_revision': return 'bg-amber-50 border-amber-200 text-amber-800';
    default:               return 'bg-sky-50 border-sky-200 text-sky-800';
  }
}

function GoalRow({ goal }: { goal: any }) {
  const isComplete = goal.status === 'complete';
  return (
    <li class={`border rounded-md p-3 ${isComplete ? 'border-emerald-200 bg-emerald-50' : 'border-slate-200'}`}>
      <details>
        <summary class="cursor-pointer flex items-start justify-between gap-2">
          <div class="flex-1 min-w-0">
            <div class="font-medium text-aps-navy">
              {isComplete && <i class="fas fa-circle-check text-emerald-600 mr-1"></i>}
              {goal.title}
              {goal.domain_code && <span class="ml-2 text-xs px-2 py-0.5 rounded-full bg-aps-sky/30 text-aps-navy">Domain {goal.domain_code}</span>}
            </div>
            {goal.target_date && <div class="text-xs text-slate-500">Target {goal.target_date}</div>}
            <div class="mt-1 w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
              <div class="h-full bg-aps-navy" style={`width:${Math.min(100, Math.max(0, Number(goal.progress_pct || 0)))}%`}></div>
            </div>
          </div>
          <span class="text-xs text-slate-500 ml-2"><i class="fas fa-chevron-down"></i></span>
        </summary>
        <form method="post" action={`/teacher/goals/${goal.id}/update`} class="mt-3 grid md:grid-cols-2 gap-2 text-sm">
          <label class="md:col-span-2">
            <span class="block text-xs text-slate-600 mb-1">Title</span>
            <input name="title" value={goal.title} class="w-full border border-slate-300 rounded px-2 py-1.5" />
          </label>
          <label class="md:col-span-2">
            <span class="block text-xs text-slate-600 mb-1">Description</span>
            <textarea name="description" rows={2} class="w-full border border-slate-300 rounded px-2 py-1.5">{goal.description || ''}</textarea>
          </label>
          <label>
            <span class="block text-xs text-slate-600 mb-1">Target date</span>
            <input name="target_date" type="date" value={goal.target_date || ''} class="w-full border border-slate-300 rounded px-2 py-1.5" />
          </label>
          <label>
            <span class="block text-xs text-slate-600 mb-1">Status</span>
            <select name="status" class="w-full border border-slate-300 rounded px-2 py-1.5">
              {['active','on_hold','complete','archived'].map((s) => <option value={s} selected={goal.status === s}>{s}</option>)}
            </select>
          </label>
          <label>
            <span class="block text-xs text-slate-600 mb-1">Progress %</span>
            <input name="progress_pct" type="number" min="0" max="100" value={Number(goal.progress_pct || 0)} class="w-full border border-slate-300 rounded px-2 py-1.5" />
          </label>
          <label class="md:col-span-2">
            <span class="block text-xs text-slate-600 mb-1">Progress notes</span>
            <textarea name="progress_notes" rows={2} class="w-full border border-slate-300 rounded px-2 py-1.5">{goal.progress_notes || ''}</textarea>
          </label>
          <div class="md:col-span-2 flex items-center justify-between">
            <button class="bg-aps-navy text-white px-3 py-1.5 rounded text-sm hover:bg-aps-blue"><i class="fas fa-save mr-1"></i>Save</button>
            <button type="submit" formaction={`/teacher/goals/${goal.id}/delete`} class="text-xs text-rose-700 hover:underline" onclick="return confirm('Remove this goal?')"><i class="fas fa-trash mr-1"></i>Delete</button>
          </div>
        </form>
      </details>
    </li>
  );
}

function TeacherObservations({ user, summary }: any) {
  const list = summary.observations.filter((o: any) => o.status === 'published' || o.status === 'acknowledged');
  return (
    <Layout title="Observations" user={user} activeNav="t-obs">
      <h1 class="font-display text-2xl text-aps-navy mb-4">My Observations</h1>
      <Card data-tour="t-obs-list">
        {list.length === 0 ? <p class="text-slate-500 text-sm">No published observations yet.</p> :
          <div class="overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5"><table class="w-full text-sm">
            <thead><tr class="text-left border-b border-slate-200 text-slate-600">
              <th class="py-2">Date</th><th>Type</th><th>Subject / Context</th><th>Appraiser</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {list.map((o: any) => (
                <tr class="border-b border-slate-100">
                  <td class="py-2">{formatDate(o.observed_at)}</td>
                  <td>{o.observation_type}</td>
                  <td>{o.subject || o.class_context || '—'}</td>
                  <td>{o.app_first} {o.app_last}</td>
                  <td><span class={`px-2 py-0.5 rounded-full text-xs border ${statusBadge(o.status)}`}>{statusLabel(o.status)}</span></td>
                  <td><a href={`/teacher/observations/${o.id}`} class="text-aps-blue hover:underline">Open →</a></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        }
      </Card>
    </Layout>
  );
}

function TeacherObservationView({ user, o, msg }: any) {
  const scores: any[] = o.scores || [];
  const feedback: any[] = o.feedback || [];
  const glows = feedback.filter((f) => f.category === 'glow');
  const grows = feedback.filter((f) => f.category === 'grow');
  const focus = feedback.filter((f) => f.category === 'focus_area');
  const next = feedback.filter((f) => f.category === 'next_step');
  const hasContent = glows.length + grows.length + focus.length + next.length + scores.length > 0 || !!o.overall_summary;
  const needsAck = o.status === 'published';
  return (
    <Layout title="Observation" user={user} activeNav="t-obs">
      {msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}
      <div class="mb-4">
        <a href="/teacher/observations" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>Back</a>
      </div>
      <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 class="font-display text-2xl text-aps-navy">
            {o.observation_type === 'mini' ? 'Mini-Observation' : o.observation_type === 'formal' ? 'Formal Observation' : 'Annual Summary'}
          </h1>
          <p class="text-slate-600 text-sm">{formatDateTime(o.observed_at)} · Observed by {o.a_first} {o.a_last} ({o.a_title || 'Appraiser'})</p>
          {o.class_context && <p class="text-sm text-slate-600">Context: {o.class_context}</p>}
        </div>
        <span class={`px-2 py-0.5 rounded-full text-xs border ${statusBadge(o.status)}`}>{statusLabel(o.status)}</span>
      </div>

      {/* Prominent read-first banner so teachers always see the feedback before the signature block */}
      {needsAck && (
        <div class="mb-4 p-4 rounded-md bg-sky-50 border border-sky-200">
          <div class="flex items-start gap-3">
            <i class="fas fa-circle-info text-sky-700 mt-0.5"></i>
            <div class="flex-1">
              <div class="font-semibold text-sky-900">Please read the full observation below before signing.</div>
              <p class="text-sm text-sky-900/80 mt-1">
                Your signature confirms you have <em>seen and discussed</em> this observation with your appraiser. It does <strong>not</strong> mean you agree with every part — you can leave an optional comment at the bottom. All feedback, scores, focus areas, and next steps are below.
              </p>
              <div class="mt-2 flex flex-wrap gap-2 text-xs">
                {o.overall_summary && <a href="#obs-summary" class="px-2 py-1 rounded-full border border-sky-300 bg-white text-sky-900 hover:bg-sky-100"><i class="fas fa-message mr-1"></i>Overall summary</a>}
                {glows.length > 0 && <a href="#obs-glows" class="px-2 py-1 rounded-full border border-emerald-300 bg-white text-emerald-900 hover:bg-emerald-50"><i class="fas fa-star mr-1"></i>Strengths ({glows.length})</a>}
                {grows.length > 0 && <a href="#obs-grows" class="px-2 py-1 rounded-full border border-sky-300 bg-white text-sky-900 hover:bg-sky-100"><i class="fas fa-seedling mr-1"></i>Growth areas ({grows.length})</a>}
                {next.length > 0 && <a href="#obs-next" class="px-2 py-1 rounded-full border border-indigo-300 bg-white text-indigo-900 hover:bg-indigo-50"><i class="fas fa-forward mr-1"></i>Next steps ({next.length})</a>}
                {focus.length > 0 && <a href="#obs-focus" class="px-2 py-1 rounded-full border border-amber-300 bg-white text-amber-900 hover:bg-amber-50"><i class="fas fa-bullseye mr-1"></i>Focus areas ({focus.length})</a>}
                {scores.length > 0 && <a href="#obs-scores" class="px-2 py-1 rounded-full border border-slate-300 bg-white text-slate-800 hover:bg-slate-50"><i class="fas fa-table-list mr-1"></i>Rubric scores ({scores.length})</a>}
                <a href="#obs-sign" class="px-2 py-1 rounded-full border border-aps-navy bg-aps-navy text-white hover:bg-aps-blue"><i class="fas fa-signature mr-1"></i>Sign &amp; acknowledge</a>
              </div>
            </div>
          </div>
        </div>
      )}

      {!hasContent && (
        <div class="mb-4 p-4 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-900">
          <i class="fas fa-triangle-exclamation mr-2"></i>
          This observation was published without written feedback or rubric scores. Please speak with your appraiser if you believe this is in error — you may still acknowledge below to confirm you received it.
        </div>
      )}

      {o.overall_summary && (
        <Card id="obs-summary" title="Overall Summary from your Appraiser" icon="fas fa-message">
          {/* June 5 2026 — use <Prose> so tables/bullets in auto-generated
              summaries render as real lists instead of raw pipe syntax. */}
          <Prose text={o.overall_summary} size="sm" />
        </Card>
      )}

      <div class="grid md:grid-cols-2 gap-4 mt-4">
        {glows.length > 0 && (
          <Card id="obs-glows" title={`Strengths (${glows.length})`} icon="fas fa-star" class="border-emerald-200">
            <ul class="space-y-3">{glows.map((f) => <li class="text-sm"><div class="font-medium text-slate-800 mb-1">{f.title || 'Strength'}</div><Prose text={f.body} size="sm" /></li>)}</ul>
          </Card>
        )}
        {grows.length > 0 && (
          <Card id="obs-grows" title={`Growth Areas (${grows.length})`} icon="fas fa-seedling" class="border-sky-200">
            <ul class="space-y-3">{grows.map((f) => <li class="text-sm"><div class="font-medium text-slate-800 mb-1">{f.title || 'Growth area'}</div><Prose text={f.body} size="sm" /></li>)}</ul>
          </Card>
        )}
        {next.length > 0 && (
          <Card id="obs-next" title={`Suggested Next Steps (${next.length})`} icon="fas fa-forward" class="border-aps-sky">
            <ul class="space-y-3">{next.map((f) => <li class="text-sm"><div class="font-medium text-slate-800 mb-1">{f.title || ''}</div><Prose text={f.body} size="sm" /></li>)}</ul>
          </Card>
        )}
        {focus.length > 0 && (
          <Card id="obs-focus" title={`Focus Areas (${focus.length})`} icon="fas fa-bullseye" class="border-aps-gold">
            <ul class="space-y-3">{focus.map((f) => <li class="text-sm"><div class="font-medium text-slate-800 mb-1">{f.title}</div><Prose text={f.body} size="sm" /></li>)}</ul>
          </Card>
        )}
      </div>

      {scores.length > 0 && (
        <Card id="obs-scores" title={`Rubric Scores (${scores.length})`} icon="fas fa-table-list" class="mt-4">
          <div class="overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5"><table class="w-full text-sm">
            <thead><tr class="text-left border-b border-slate-200 text-slate-600"><th class="py-2">Domain</th><th>Indicator</th><th>Rating</th><th>Evidence Note</th></tr></thead>
            <tbody>
              {scores.map((s) => (
                <tr class="border-b border-slate-100">
                  <td class="py-2">{s.domain_code}. {s.domain_name}</td>
                  <td>{s.indicator_code}. {s.indicator_name}</td>
                  <td>{s.level ? <span class={`px-2 py-0.5 rounded-full text-xs border ${levelColor[s.level]}`}>{s.level} · {levelLabels[s.level]}</span> : <span class="text-slate-400">Not scored</span>}</td>
                  <td class="text-slate-700">{s.evidence_note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      )}

      <Card id="obs-sign" title="Signatures" icon="fas fa-signature" class="mt-4">
        <div class="grid md:grid-cols-2 gap-6">
          <div>
            <div class="text-sm font-medium text-slate-700">Appraiser</div>
            {o.appraiser_signature_data
              ? <img src={o.appraiser_signature_data} alt="appraiser signature" class="border border-slate-200 rounded mt-2 max-h-32" />
              : <div class="text-sm text-slate-400 mt-1">Not signed.</div>}
            <div class="text-xs text-slate-500 mt-1">Signed {formatDateTime(o.appraiser_signed_at)} · {o.a_first} {o.a_last}</div>
          </div>
          <div>
            <div class="text-sm font-medium text-slate-700">Teacher acknowledgement</div>
            {o.teacher_signature_data
              ? <>
                  <img src={o.teacher_signature_data} alt="teacher signature" class="border border-slate-200 rounded mt-2 max-h-32" />
                  <div class="text-xs text-slate-500 mt-1">Acknowledged {formatDateTime(o.teacher_acknowledged_at)}</div>
                  {o.teacher_response && <div class="text-sm text-slate-700 mt-2 italic">Your comment: "{o.teacher_response}"</div>}
                </>
              : <AcknowledgeForm o={o} />
            }
          </div>
        </div>
      </Card>
    </Layout>
  );
}

function AcknowledgeForm({ o }: any) {
  return (
    <form method="post" action={`/teacher/observations/${o.id}/acknowledge`} class="mt-2 space-y-2" id="ack-form">
      <div class="text-xs p-2 rounded bg-slate-50 border border-slate-200 text-slate-700 mb-1">
        <i class="fas fa-circle-info mr-1"></i>
        Your signature confirms you have <strong>seen and discussed</strong> this observation. It does <strong>not</strong> mean you agree with every part. If you disagree with anything, use the comment box below to put that on record.
      </div>
      <canvas id="sig-pad" class="border border-slate-300 rounded w-full h-32 bg-white touch-none"></canvas>
      <input type="hidden" name="signature" id="sig-data" />
      <div class="flex items-center gap-2">
        <button type="button" onclick="window.SigPad.clear('sig-pad','sig-data')" class="text-sm text-slate-600 hover:underline"><i class="fas fa-eraser"></i> Clear</button>
      </div>
      <label class="block">
        <span class="block text-sm font-medium text-slate-700 mb-1">Optional teacher response <span class="text-slate-400">(put disagreements or clarifying notes here)</span></span>
        <textarea name="response" rows={3} class="w-full border border-slate-300 rounded-md px-3 py-2" placeholder="Any comment you want on record (optional)"></textarea>
      </label>
      <button type="submit" onclick="return window.SigPad.submit('sig-pad','sig-data')" class="bg-aps-navy text-white px-4 py-2 rounded-md text-sm hover:bg-aps-blue"><i class="fas fa-signature mr-1"></i>Sign &amp; Acknowledge</button>
    </form>
  );
}

function TeacherFocus({ user, summary }: any) {
  const { focusAreas, observations } = summary;
  return (
    <Layout title="Focus Areas" user={user} activeNav="t-focus">
      <h1 class="font-display text-2xl text-aps-navy mb-4" data-tour="t-focus">Focus Areas</h1>
      <Card>
        {focusAreas.length === 0 ? <p class="text-slate-500 text-sm">No active focus areas. Your appraiser will add these as you work together.</p> :
          <ul class="space-y-3">
            {focusAreas.map((f: any) => (
              <li class="border border-slate-200 rounded-md p-4">
                <div class="text-xs text-slate-500">{f.domain_code && `Domain ${f.domain_code} · ${f.indicator_code?.toUpperCase()}. ${f.indicator_name}`}</div>
                <div class="font-medium text-aps-navy text-lg">{f.title}</div>
                {f.description && <div class="mt-1"><Prose text={f.description} size="sm" /></div>}
                <div class="text-xs text-slate-400 mt-2">Opened {formatDate(f.opened_at)}</div>
              </li>
            ))}
          </ul>
        }
      </Card>
    </Layout>
  );
}
