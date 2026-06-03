import { Hono } from 'hono';
import type { Bindings, Variables } from '../lib/types';
import { Layout, Card, Button, DomainTabs, PDHoursHeatMap } from '../lib/layout';
import { requireRole } from '../lib/auth';
import {
  getAssignedTeachers, getTeacherSummary, getObservation,
  getDomainsWithIndicators, getActiveFramework, getCurrentSchoolYear,
  getPedagogy, logActivity, getTeacherPerformanceSummary,
  teacherContextNote, listExternalPdQueue, getExternalPd,
  getTeacherPDHoursSummary, getNumericSetting,
} from '../lib/db';
import {
  levelColor, levelLabels, formatDate, formatDateTime,
  statusBadge, statusLabel, escapeHtml,
} from '../lib/ui';
import { notify } from '../lib/notifications';
import { autoEnrollForObservation } from '../lib/pd';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use('*', requireRole(['appraiser', 'super_admin']));

// ---- Appraiser home: list assigned teachers
app.get('/', async (c) => {
  const user = c.get('user')!;
  const welcome = c.req.query('welcome') === '1';
  const teachers = await getAssignedTeachers(c.env.DB, user.id, 'appraiser');
  // Latest observation per teacher
  const ids = (teachers as any[]).map(t => t.id);
  const latest: Record<number, any> = {};
  if (ids.length) {
    const placeholders = ids.map(() => '?').join(',');
    const rows = await c.env.DB.prepare(
      `SELECT o.* FROM observations o
       WHERE o.teacher_id IN (${placeholders})
       AND o.id = (SELECT MAX(id) FROM observations o2 WHERE o2.teacher_id = o.teacher_id)`
    ).bind(...ids).all();
    for (const r of (rows.results as any[])) latest[r.teacher_id] = r;
  }
  // Fix 6 — PD-hours heat-map scoped to this appraiser's assigned teachers.
  // We pull per-teacher rows by passing the teacher-id list one at a time
  // (getTeacherPDHoursSummary supports schoolIds + teacherId but not a
  // teacher-list at once). For typical assignments (≤30 teachers) this is
  // a tight loop, and each call is a single fast aggregation query.
  const heatRowsAll: any[] = [];
  let heatTarget = 22.5;
  for (const t of ids) {
    const r = await getTeacherPDHoursSummary(c.env.DB, { teacherId: t });
    if (r.rows.length) heatRowsAll.push(r.rows[0]);
    heatTarget = r.target;
  }
  // Sort low → met so behind-target teachers float to the top.
  const heatOrder = { low: 0, mid: 1, near: 2, met: 3 } as const;
  heatRowsAll.sort((a, b) => heatOrder[a.heat as keyof typeof heatOrder] - heatOrder[b.heat as keyof typeof heatOrder]);
  const pdHours = { target: heatTarget, rows: heatRowsAll };
  return c.html(<AppraiserHome user={user} teachers={teachers} latest={latest} welcome={welcome} pdHours={pdHours} />);
});

// ---- Single teacher detail
app.get('/teachers/:id', async (c) => {
  const user = c.get('user')!;
  const teacherId = Number(c.req.param('id'));
  // Verify assignment
  const assign = await c.env.DB.prepare(
    `SELECT 1 FROM assignments WHERE teacher_id = ? AND staff_id = ? AND relationship='appraiser' AND active=1`
  ).bind(teacherId, user.id).first();
  if (!assign && user.role !== 'super_admin') return c.text('Not assigned to this teacher', 403);
  const summary = await getTeacherSummary(c.env.DB, teacherId);
  if (!summary) return c.text('Teacher not found', 404);
  const performance = await getTeacherPerformanceSummary(c.env.DB, teacherId);
  // Fix 4 — modules available for manual recommendation. Active only; sorted
  // by domain so the dropdown reads naturally for the appraiser.
  const modulesRes = await c.env.DB.prepare(
    `SELECT m.id, m.title, m.est_minutes, m.target_level,
            d.code AS domain_code, i.code AS indicator_code, i.name AS indicator_name
       FROM pd_modules m
       JOIN framework_indicators i ON i.id = m.indicator_id
       JOIN framework_domains    d ON d.id = i.domain_id
      WHERE m.is_active = 1
      ORDER BY d.sort_order, i.sort_order, m.target_level, m.title`
  ).all();
  const msg = c.req.query('msg');
  return c.html(<AppraiserTeacherDetail
    user={user}
    summary={summary}
    performance={performance}
    modules={(modulesRes.results as any[]) || []}
    msg={msg}
  />);
});

// ---- Fix 4: Manually recommend a PD module to this teacher.
// Available to appraisers and super_admins on their own teacher detail page.
// The recommendModule() helper writes pd_enrollments.source='assigned' plus
// the recommender's id + optional note, and fires a notification. The coach
// uses a separate route in coach.tsx to keep the no-scores boundary clean.
app.post('/teachers/:id/recommend-module', async (c) => {
  const user = c.get('user')!;
  const teacherId = Number(c.req.param('id'));
  // Same assignment guard as the GET handler.
  const assign = await c.env.DB.prepare(
    `SELECT 1 FROM assignments WHERE teacher_id = ? AND staff_id = ? AND relationship='appraiser' AND active=1`
  ).bind(teacherId, user.id).first();
  if (!assign && user.role !== 'super_admin') return c.text('Not assigned to this teacher', 403);
  const body = await c.req.parseBody();
  const moduleId = Number(body.module_id);
  const note = String(body.note || '').trim() || null;
  if (!moduleId) return c.redirect(`/appraiser/teachers/${teacherId}?msg=${encodeURIComponent('Pick a module first.')}`);
  try {
    const { recommendModule } = await import('../lib/pd');
    await recommendModule(c.env.DB, teacherId, moduleId, user.id, note, c.env);
    await logActivity(c.env.DB, user.id, 'pd_enrollment', moduleId, 'recommend_module', { teacherId, note });
    return c.redirect(`/appraiser/teachers/${teacherId}?msg=${encodeURIComponent('Module recommended — the teacher has been notified.')}`);
  } catch (err: any) {
    return c.redirect(`/appraiser/teachers/${teacherId}?msg=${encodeURIComponent('Could not recommend: ' + (err?.message || 'unknown error'))}`);
  }
});

// ---- Start a new observation
// Auto-prefills subject/grade from the teacher's title when not explicitly set, and stamps
// observed_at with the current server time (which will display in US Central via formatDateTime).
app.post('/teachers/:id/observations/start', async (c) => {
  const user = c.get('user')!;
  const teacherId = Number(c.req.param('id'));
  const body = await c.req.parseBody();
  const type = (String(body.observation_type || 'mini')) as any;
  // Look up the teacher's profile so we can auto-fill subject/grade from their title.
  const teacher = await c.env.DB.prepare('SELECT title FROM users WHERE id = ?').bind(teacherId).first<any>();
  const titleText = String(teacher?.title || '');
  // Heuristic: extract a parenthetical grade span, e.g., "Art (PK-12)" → grade "PK-12", subject "Art"
  const m = titleText.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  const autoSubject = m ? m[1].trim() : titleText.trim();
  const autoGrade = m ? m[2].trim() : '';
  const subject = (String(body.subject || '').trim() || autoSubject) || null;
  const gradeLevel = (String(body.grade_level || '').trim() || autoGrade) || null;
  const location = String(body.location || '').trim() || null;
  const context = String(body.class_context || '').trim() || null;
  const fw = await getActiveFramework(c.env.DB);
  const sy = await getCurrentSchoolYear(c.env.DB);
  if (!fw) return c.text('No active framework', 500);
  const res = await c.env.DB.prepare(
    `INSERT INTO observations (teacher_id, appraiser_id, school_year_id, framework_id,
      observation_type, class_context, subject, grade_level, location, observed_at, status)
     VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,'draft')`
  ).bind(teacherId, user.id, (sy as any)?.id || null, (fw as any).id, type, context, subject, gradeLevel, location).run();
  const obsId = (res.meta as any)?.last_row_id;
  await logActivity(c.env.DB, user.id, 'observation', Number(obsId), 'start', { teacherId, type });
  return c.redirect(`/appraiser/observations/${obsId}`);
});

// ---- All observations listing
app.get('/observations', async (c) => {
  const user = c.get('user')!;
  const rows = await c.env.DB.prepare(
    `SELECT o.*, t.first_name AS t_first, t.last_name AS t_last, t.title AS t_title
     FROM observations o
     JOIN users t ON t.id = o.teacher_id
     WHERE o.appraiser_id = ?
     ORDER BY o.observed_at DESC`
  ).bind(user.id).all();
  return c.html(<AppraiserObservations user={user} rows={(rows.results as any[]) || []} />);
});

// ---- Observation editor
app.get('/observations/:id', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const o = await getObservation(c.env.DB, id);
  if (!o) return c.text('Not found', 404);
  if (o.appraiser_id !== user.id && user.role !== 'super_admin') return c.text('Forbidden', 403);
  const fw = await getActiveFramework(c.env.DB);
  const domains = await getDomainsWithIndicators(c.env.DB, (fw as any).id);
  const msg = c.req.query('msg');
  return c.html(<ObservationEditor user={user} o={o} domains={domains} msg={msg} />);
});

// ---- Auto-save one field of an observation while the appraiser is typing.
// Returns JSON so the client can show a "Saved" indicator without reloading.
// Only allows a whitelist of plain-text fields — everything else goes through
// the full form submit below.
app.post('/observations/:id/autosave', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  // Enforce: only the owning appraiser may auto-save, and only on drafts.
  const o = await c.env.DB.prepare(
    `SELECT status, appraiser_id FROM observations WHERE id = ?`
  ).bind(id).first<any>();
  if (!o || o.appraiser_id !== user.id) return c.json({ ok: false, err: 'forbidden' }, 403);
  if (!['draft','scored'].includes(o.status)) return c.json({ ok: false, err: 'published' }, 409);

  const ALLOWED = new Set([
    'scripted_notes', 'private_notes', 'overall_summary',
    'class_context', 'subject', 'grade_level', 'location',
  ]);
  const body = await c.req.parseBody();
  const field = String(body.field || '');
  const value = String(body.value || '');
  if (!ALLOWED.has(field)) return c.json({ ok: false, err: 'bad_field' }, 400);

  // Each field is written with a dedicated prepared statement so we never
  // interpolate a column name into SQL.
  const col: Record<string, string> = {
    scripted_notes:   'scripted_notes',
    private_notes:    'private_notes',
    overall_summary:  'overall_summary',
    class_context:    'class_context',
    subject:          'subject',
    grade_level:      'grade_level',
    location:         'location',
  };
  const sql = `UPDATE observations SET ${col[field]} = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND appraiser_id = ?`;
  const res = await c.env.DB.prepare(sql).bind(value, id, user.id).run();
  return c.json({ ok: true, field, saved_at: new Date().toISOString(), changes: res.meta?.changes || 0 });
});

// ---- Save scripted/private notes and meta
app.post('/observations/:id/save', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const body = await c.req.parseBody();
  const scripted = String(body.scripted_notes || '');
  const priv = String(body.private_notes || '');
  const summary = String(body.overall_summary || '');
  const context = String(body.class_context || '');
  const subject = String(body.subject || '');
  const grade = String(body.grade_level || '');
  const loc = String(body.location || '');
  const duration = Number(body.duration_minutes || 0) || null;
  // observed_at is editable via a datetime-local input. The value comes in as "YYYY-MM-DDTHH:MM"
  // in the appraiser's local (Central) time. We convert it to a UTC SQLite timestamp string
  // so it can be stored and later rendered back correctly.
  const observedAtRaw = String(body.observed_at || '').trim();
  let observedAtSql: string | null = null;
  if (observedAtRaw) {
    // Treat input as America/Chicago wall-clock time, convert to UTC.
    const parts = observedAtRaw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
    if (parts) {
      const [, y, mo, d, h, mi] = parts;
      // Work out the Chicago offset at that moment (handles DST).
      const probe = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)));
      const tzShort = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', timeZoneName: 'short' })
        .formatToParts(probe).find(p => p.type === 'timeZoneName')?.value || 'CST';
      const offsetHours = tzShort === 'CDT' ? 5 : 6;
      const utcMs = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h) + offsetHours, Number(mi));
      observedAtSql = new Date(utcMs).toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');
    }
  }
  if (observedAtSql) {
    await c.env.DB.prepare(
      `UPDATE observations SET scripted_notes=?, private_notes=?, overall_summary=?,
         class_context=?, subject=?, grade_level=?, location=?, duration_minutes=?,
         observed_at=?, updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND appraiser_id=?`
    ).bind(scripted, priv, summary, context, subject, grade, loc, duration, observedAtSql, id, user.id).run();
  } else {
    await c.env.DB.prepare(
      `UPDATE observations SET scripted_notes=?, private_notes=?, overall_summary=?,
         class_context=?, subject=?, grade_level=?, location=?, duration_minutes=?,
         updated_at=CURRENT_TIMESTAMP
       WHERE id=? AND appraiser_id=?`
    ).bind(scripted, priv, summary, context, subject, grade, loc, duration, id, user.id).run();
  }
  await logActivity(c.env.DB, user.id, 'observation', id, 'save_notes');
  return c.redirect(`/appraiser/observations/${id}?msg=Saved`);
});

// ---- Score an indicator (AJAX from editor)
app.post('/observations/:id/score', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const body = await c.req.parseBody();
  const indicatorId = Number(body.indicator_id);
  const level = body.level !== '' && body.level !== undefined ? Number(body.level) : null;
  const note = String(body.evidence_note || '');
  // verify ownership
  const own = await c.env.DB.prepare(
    `SELECT 1 FROM observations WHERE id=? AND appraiser_id=?`
  ).bind(id, user.id).first();
  if (!own) return c.text('Forbidden', 403);
  await c.env.DB.prepare(
    `INSERT INTO observation_scores (observation_id, indicator_id, level, evidence_note)
     VALUES (?,?,?,?)
     ON CONFLICT(observation_id, indicator_id)
     DO UPDATE SET level=excluded.level, evidence_note=excluded.evidence_note, updated_at=CURRENT_TIMESTAMP`
  ).bind(id, indicatorId, level, note).run();
  await logActivity(c.env.DB, user.id, 'observation', id, 'score', { indicatorId, level });
  if (c.req.header('accept')?.includes('application/json')) {
    return c.json({ ok: true });
  }
  return c.redirect(`/appraiser/observations/${id}#ind-${indicatorId}`);
});

// ---- Auto-generate feedback chunks from scored indicators + pedagogy library
// Accepts both classic form POSTs (redirects) and XHR with `Accept: application/json`
// (returns JSON so the page can stay in place and flip a toast — spec 2.1).
app.post('/observations/:id/generate-feedback', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const wantsJson = (c.req.header('accept') || '').includes('application/json') ||
    (c.req.header('x-requested-with') || '').toLowerCase() === 'fetch';
  const o = await getObservation(c.env.DB, id);
  if (!o || (o.appraiser_id !== user.id && user.role !== 'super_admin')) return c.text('Forbidden', 403);

  // Fix 11: classroom-context awareness. The teacher's subject_area / grade_band /
  // classroom_type live on users.* and arrived on `o` via the JOIN as t_subject_area
  // etc. teacherContextNote() returns '' when all three are empty so we degrade
  // gracefully for any teacher whose profile hasn't been filled in yet — no
  // existing observations regress.
  const ctxNote = teacherContextNote({
    subject_area:   (o as any).t_subject_area,
    classroom_type: (o as any).t_classroom_type,
    grade_band:     (o as any).t_grade_band,
  });

  // Wipe prior auto-generated items (preserve custom ones)
  await c.env.DB.prepare(
    `DELETE FROM feedback_items WHERE observation_id = ? AND source = 'pedagogy_library'`
  ).bind(id).run();

  let order = 0;
  const scripted = (o.scripted_notes || '').trim();
  // If there are raw scripted notes, include an organized summary chunk
  if (scripted) {
    const summaryChunk = organizeScriptedNotes(scripted);
    const body = ctxNote ? `${ctxNote}\n\n${summaryChunk}` : summaryChunk;
    await c.env.DB.prepare(
      `INSERT INTO feedback_items (observation_id, indicator_id, category, title, body, sort_order, source)
       VALUES (?, NULL, 'glow', ?, ?, ?, 'pedagogy_library')`
    ).bind(id, 'What I saw in your classroom', body, order++).run();
  }

  for (const s of (o.scores as any[])) {
    if (s.level == null) continue;
    const ped = await getPedagogy(c.env.DB, s.indicator_id, s.level);
    if (!ped) continue;
    const indLabel = `${s.domain_code}.${(s.indicator_code || '').toUpperCase()} ${s.indicator_name}`;
    const starter = (ped as any).feedback_starter || '';
    const moves = safeParse((ped as any).teacher_next_moves, []);
    const category = s.level >= 3 ? 'glow' : (s.level === 2 ? 'grow' : 'focus_area');
    const levelLabel = levelLabels[s.level];

    const glowBody = `${starter}${s.evidence_note ? `\n\nEvidence from this observation:\n${s.evidence_note}` : ''}`;
    await c.env.DB.prepare(
      `INSERT INTO feedback_items (observation_id, indicator_id, category, title, body, sort_order, source)
       VALUES (?,?,?,?,?,?, 'pedagogy_library')`
    ).bind(id, s.indicator_id, category, `${indLabel} — ${levelLabel}`, glowBody, order++).run();

    if (moves && moves.length && s.level < 4) {
      // Fix 11: prepend the context note to the "next steps" body so the
      // appraiser sees concrete moves filtered through grade-band / subject lens.
      const movesBody = moves.slice(0, 4).map((m: string) => `• ${m}`).join('\n');
      const nextBody = ctxNote ? `${ctxNote}\n\n${movesBody}` : movesBody;
      await c.env.DB.prepare(
        `INSERT INTO feedback_items (observation_id, indicator_id, category, title, body, sort_order, source)
         VALUES (?,?, 'next_step', ?, ?, ?, 'pedagogy_library')`
      ).bind(id, s.indicator_id, `Next steps for ${indLabel}`, nextBody, order++).run();
    }
  }

  await c.env.DB.prepare(
    `UPDATE observations SET status = CASE WHEN status='draft' THEN 'scored' ELSE status END,
       updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(id).run();
  await logActivity(c.env.DB, user.id, 'observation', id, 'generate_feedback');
  if (wantsJson) {
    // Return the fresh feedback chunks so the client can swap them in place
    // without reloading the page or losing the appraiser's scroll position.
    const items = await c.env.DB.prepare(
      `SELECT id, indicator_id, category, title, body, sort_order, source
         FROM feedback_items WHERE observation_id=? ORDER BY category, sort_order, id`
    ).bind(id).all();
    return c.json({
      ok: true,
      saved_at: new Date().toISOString(),
      items: (items.results as any[]) || [],
    });
  }
  return c.redirect(`/appraiser/observations/${id}?msg=Feedback+generated`);
});

// Simple heuristic organizer — breaks scripted notes into a cleaner narrative
function organizeScriptedNotes(raw: string): string {
  const lines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean);
  if (!lines.length) return raw;
  // Group into 1-3 paragraphs by blank separators
  const paras: string[] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.length < 3) continue;
    current.push(line);
    if (current.length >= 4) { paras.push(current.join(' ')); current = []; }
  }
  if (current.length) paras.push(current.join(' '));
  return paras.join('\n\n');
}

function safeParse<T>(v: any, fallback: T): T {
  if (!v) return fallback;
  try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return fallback; }
}

// ---- Edit feedback item
app.post('/observations/:id/feedback/save', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const own = await c.env.DB.prepare(
    `SELECT 1 FROM observations WHERE id=? AND appraiser_id=?`
  ).bind(id, user.id).first();
  if (!own && user.role !== 'super_admin') return c.text('Forbidden', 403);
  const body = await c.req.parseBody();
  const itemId = body.id ? Number(body.id) : null;
  const category = String(body.category || 'glow');
  const title = String(body.title || '').trim() || null;
  const bodyText = String(body.body || '').trim();
  const indicatorId = body.indicator_id ? Number(body.indicator_id) : null;
  if (!bodyText) return c.redirect(`/appraiser/observations/${id}?msg=Feedback+cannot+be+empty`);
  if (itemId) {
    await c.env.DB.prepare(
      `UPDATE feedback_items SET category=?, title=?, body=?, indicator_id=? WHERE id=? AND observation_id=?`
    ).bind(category, title, bodyText, indicatorId, itemId, id).run();
  } else {
    await c.env.DB.prepare(
      `INSERT INTO feedback_items (observation_id, indicator_id, category, title, body, source)
       VALUES (?,?,?,?,?, 'custom')`
    ).bind(id, indicatorId, category, title, bodyText).run();
  }
  return c.redirect(`/appraiser/observations/${id}?msg=Feedback+saved`);
});

app.post('/observations/:id/feedback/:itemId/delete', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const itemId = Number(c.req.param('itemId'));
  const own = await c.env.DB.prepare(
    `SELECT 1 FROM observations WHERE id=? AND appraiser_id=?`
  ).bind(id, user.id).first();
  if (!own && user.role !== 'super_admin') return c.text('Forbidden', 403);
  await c.env.DB.prepare(`DELETE FROM feedback_items WHERE id=? AND observation_id=?`).bind(itemId, id).run();
  return c.redirect(`/appraiser/observations/${id}?msg=Deleted`);
});

// ---- Sign & publish
app.post('/observations/:id/publish', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const body = await c.req.parseBody();
  const sig = String(body.signature || '');
  if (!sig || !sig.startsWith('data:image/')) {
    return c.redirect(`/appraiser/observations/${id}?msg=Signature+required+to+publish`);
  }
  const own = await c.env.DB.prepare(
    `SELECT * FROM observations WHERE id=? AND appraiser_id=?`
  ).bind(id, user.id).first<any>();
  if (!own) return c.text('Forbidden', 403);
  await c.env.DB.prepare(
    `UPDATE observations SET appraiser_signature_data=?, appraiser_signed_at=CURRENT_TIMESTAMP,
       status='published', published_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP
     WHERE id=?`
  ).bind(sig, id).run();

  // Promote focus_area feedback items to teacher focus_areas
  const focus = await c.env.DB.prepare(
    `SELECT * FROM feedback_items WHERE observation_id=? AND category='focus_area'`
  ).bind(id).all();
  const focusRows = (focus.results as any[]) || [];
  for (const f of focusRows) {
    await c.env.DB.prepare(
      `INSERT INTO focus_areas (teacher_id, indicator_id, title, description, status, opened_observation_id)
       VALUES (?,?,?,?, 'active', ?)`
    ).bind(own.teacher_id, f.indicator_id, f.title || 'Focus area', f.body, id).run();
  }

  await logActivity(c.env.DB, user.id, 'observation', id, 'publish');

  // ----- Notifications + PD recommendations -----
  // 1) Tell the teacher that their observation has been published
  const obsTypeLabel = own.observation_type === 'annual_summary' ? 'Annual summary'
    : own.observation_type === 'formal' ? 'Formal observation' : 'Mini-observation';
  await notify(c.env.DB, {
    user_id: own.teacher_id,
    kind: 'observation_published',
    title: `${obsTypeLabel} published`,
    body: `${user.first_name} ${user.last_name} shared an evaluation with you. Review and acknowledge when ready.`,
    url: `/teacher/observations/${id}`,
    entity_type: 'observation', entity_id: id, actor_user_id: user.id,
    severity: own.observation_type === 'annual_summary' ? 'info' : 'action',
  }, c.env);
  // 2) For every focus area promoted above, nudge the teacher again
  for (const f of focusRows) {
    await notify(c.env.DB, {
      user_id: own.teacher_id,
      kind: 'focus_area_opened',
      title: 'New focus area opened',
      body: f.title || 'A growth focus was opened for you.',
      url: `/teacher/observations/${id}`,
      entity_type: 'focus_area', entity_id: id, actor_user_id: user.id,
    }, c.env);
  }
  // 3) Auto-enroll the teacher in PD modules for any indicator scored 1 or 2
  await autoEnrollForObservation(c.env.DB, id, c.env);
  // 4) Special case: annual summary → tell superintendents as an FYI
  if (own.observation_type === 'annual_summary') {
    const supts = await c.env.DB.prepare(
      `SELECT id FROM users WHERE active=1 AND role IN ('superintendent','super_admin')`
    ).all();
    const ids = ((supts.results as any[]) || []).map((r) => r.id);
    const teacher = await c.env.DB.prepare(`SELECT first_name, last_name FROM users WHERE id=?`).bind(own.teacher_id).first<any>();
    for (const uid of ids) {
      if (uid === user.id) continue;
      await notify(c.env.DB, {
        user_id: uid, kind: 'annual_summary_published',
        title: 'Annual summary published',
        body: `${user.first_name} ${user.last_name} published an annual summary for ${teacher?.first_name || ''} ${teacher?.last_name || ''}.`,
        url: `/superintendent/observations/${id}`,
        entity_type: 'observation', entity_id: id, actor_user_id: user.id,
      }, c.env);
    }
  }

  return c.redirect(`/appraiser/observations/${id}?msg=Published+to+teacher`);
});

// ---- Delete draft observation (only drafts)
app.post('/observations/:id/delete', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const own = await c.env.DB.prepare(`SELECT * FROM observations WHERE id=? AND appraiser_id=?`).bind(id, user.id).first<any>();
  if (!own) return c.text('Forbidden', 403);
  if (own.status !== 'draft' && own.status !== 'scored') return c.redirect(`/appraiser/observations/${id}?msg=Can+only+delete+drafts`);
  await c.env.DB.prepare(`DELETE FROM observations WHERE id=?`).bind(id).run();
  await logActivity(c.env.DB, user.id, 'observation', id, 'delete_draft');
  return c.redirect('/appraiser');
});

// ============================================================================
// Fix 5 — External PD Submission Review Queue
// ============================================================================
// Teachers post external PD via /teacher/external-pd (handled in teacher.tsx).
// The appraiser sees the queue here, scoped to their assigned teachers.
// Three review actions: approve (with hour count), needs_revision, decline.
// Super-admins see ALL submissions and can act on any of them.
// ----------------------------------------------------------------------------

app.get('/external-pd', async (c) => {
  const user = c.get('user')!;
  const status = c.req.query('status') || undefined;
  // Appraisers see only their assigned teachers; super_admin sees everything.
  const rows = await listExternalPdQueue(c.env.DB, {
    status,
    appraiserId: user.role === 'super_admin' ? undefined : user.id,
  });
  return c.html(<ExternalPdQueue user={user} rows={rows} filterStatus={status} />);
});

app.get('/external-pd/:id', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const row = await getExternalPd(c.env.DB, id);
  if (!row) return c.text('Not found', 404);
  // Permission gate: appraiser must be assigned to this teacher.
  if (user.role !== 'super_admin') {
    const ok = await c.env.DB.prepare(
      `SELECT 1 FROM assignments WHERE teacher_id=? AND staff_id=? AND relationship='appraiser' AND active=1`
    ).bind(row.teacher_id, user.id).first();
    if (!ok) return c.text('Not assigned to this teacher', 403);
  }
  const msg = c.req.query('msg');
  return c.html(<ExternalPdDetail user={user} row={row} msg={msg} />);
});

app.post('/external-pd/:id/review', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const row = await getExternalPd(c.env.DB, id);
  if (!row) return c.text('Not found', 404);
  if (user.role !== 'super_admin') {
    const ok = await c.env.DB.prepare(
      `SELECT 1 FROM assignments WHERE teacher_id=? AND staff_id=? AND relationship='appraiser' AND active=1`
    ).bind(row.teacher_id, user.id).first();
    if (!ok) return c.text('Not assigned to this teacher', 403);
  }
  const body = await c.req.parseBody();
  const action = String(body.action || '').trim();   // 'approve' | 'revise' | 'decline'
  const note = String(body.review_note || '').trim() || null;
  // Approved hours: defaults to the teacher's self-reported value but can be
  // overridden. We round to 0.25h to match the internal-credit granularity.
  let approvedHours: number | null = null;
  if (action === 'approve') {
    const raw = String(body.approved_hours ?? '').trim();
    const parsed = raw !== '' ? Number(raw) : Number(row.hours);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 200) {
      approvedHours = Math.round(parsed * 4) / 4;
    } else {
      return c.redirect(`/appraiser/external-pd/${id}?msg=${encodeURIComponent('Enter a valid hour value between 0 and 200.')}`);
    }
  }
  const newStatus =
    action === 'approve' ? 'approved'
    : action === 'revise' ? 'needs_revision'
    : action === 'decline' ? 'declined'
    : null;
  if (!newStatus) return c.redirect(`/appraiser/external-pd/${id}?msg=${encodeURIComponent('Pick approve, revise, or decline.')}`);

  await c.env.DB.prepare(
    `UPDATE external_pd_submissions
        SET status = ?, reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP,
            review_note = ?, approved_hours = ?
      WHERE id = ?`
  ).bind(newStatus, user.id, note, approvedHours, id).run();

  // Notify teacher of the decision.
  const titles: Record<string, string> = {
    approved: 'External PD approved',
    needs_revision: 'External PD needs revision',
    declined: 'External PD declined',
  };
  const bodyText =
    newStatus === 'approved'
      ? `Your external PD "${row.title}" was approved for ${approvedHours?.toFixed(2)} hour${approvedHours === 1 ? '' : 's'} of credit.${note ? ` Note: ${note}` : ''}`
      : newStatus === 'needs_revision'
      ? `Your supervisor asked for another pass on "${row.title}".${note ? ` Note: ${note}` : ''}`
      : `"${row.title}" was declined.${note ? ` Reason: ${note}` : ''}`;
  const { notify } = await import('../lib/notifications');
  await notify(c.env.DB, {
    user_id: row.teacher_id,
    kind: 'external_pd_' + newStatus,
    title: titles[newStatus],
    body: bodyText,
    url: '/teacher#external-pd',
    entity_type: 'external_pd_submission', entity_id: id, actor_user_id: user.id,
  }, c.env);

  await logActivity(c.env.DB, user.id, 'external_pd_submission', id, 'review_' + newStatus, { approved_hours: approvedHours, note });
  return c.redirect(`/appraiser/external-pd/${id}?msg=${encodeURIComponent('Decision recorded — teacher notified.')}`);
});

export default app;

// ============================== VIEWS ==============================

function AppraiserHome({ user, teachers, latest, welcome, pdHours }: any) {
  pdHours = pdHours || { target: 22.5, rows: [] };
  return (
    <Layout title="My Teachers" user={user} activeNav="ap-home" autoLaunchTour={!!welcome}>
      <h1 class="font-display text-2xl text-aps-navy mb-1">My Teachers</h1>
      <p class="text-slate-600 text-sm mb-6">Assigned for observation and evaluation · {teachers.length} teacher{teachers.length!==1?'s':''}</p>

      {/* Fix 6 — PD-hours heat-map scoped to this appraiser's caseload. */}
      {pdHours.rows.length > 0 && (
        <Card title="PD Hours Heat-Map" icon="fas fa-stopwatch" class="mb-6">
          <PDHoursHeatMap target={pdHours.target} rows={pdHours.rows} linkPrefix="/appraiser/teachers" />
        </Card>
      )}

      {teachers.length === 0 ? (
        <Card><p class="text-slate-500 text-sm">No teachers assigned. Contact your super admin for assignments.</p></Card>
      ) : (
        <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4" data-tour="ap-teachers">
          {teachers.map((t: any) => {
            const l = latest[t.id];
            return (
              <Card>
                <div class="flex items-start justify-between">
                  <div>
                    <div class="font-display text-lg text-aps-navy">{t.first_name} {t.last_name}</div>
                    <div class="text-sm text-slate-600">{t.title || 'Teacher'}</div>
                    <div class="text-xs text-slate-400 mt-1">{t.email}</div>
                  </div>
                  <div class="w-10 h-10 rounded-full bg-aps-sky text-aps-navy font-bold flex items-center justify-center">{t.first_name[0]}{t.last_name[0]}</div>
                </div>
                <div class="text-xs text-slate-500 mt-3 min-h-[32px]">
                  {l ? <>Last observed <strong>{formatDate(l.observed_at)}</strong> · <span class={`px-1.5 py-0.5 rounded-full border ${statusBadge(l.status)}`}>{statusLabel(l.status)}</span></>
                     : <>No observations yet</>}
                </div>
                <div class="mt-3 flex flex-wrap gap-2" data-tour="ap-start-obs">
                  <a href={`/appraiser/teachers/${t.id}`} class="inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md border border-aps-navy text-aps-navy hover:bg-slate-50"><i class="fas fa-folder-open"></i>View data</a>
                  {/* Dropdown: start any of the three observation types without leaving this screen.
                      Subject/grade are auto-filled server-side from the teacher's title, so the
                      appraiser just has to click one item and can edit details on the next page. */}
                  <details class="relative inline-block">
                    <summary class="list-none cursor-pointer inline-flex items-center gap-1 text-sm px-3 py-1.5 rounded-md bg-aps-navy text-white hover:bg-aps-blue select-none"><i class="fas fa-play"></i>Start observation<i class="fas fa-caret-down ml-1"></i></summary>
                    <div class="absolute z-20 mt-1 right-0 w-56 bg-white border border-slate-200 rounded-md shadow-lg overflow-hidden">
                      <form method="post" action={`/appraiser/teachers/${t.id}/observations/start`}>
                        <input type="hidden" name="observation_type" value="mini" />
                        <button class="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100"><i class="fas fa-bolt text-amber-500 mr-2 w-4"></i>Mini observation</button>
                      </form>
                      <form method="post" action={`/appraiser/teachers/${t.id}/observations/start`}>
                        <input type="hidden" name="observation_type" value="formal" />
                        <button class="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 border-b border-slate-100"><i class="fas fa-file-lines text-sky-600 mr-2 w-4"></i>Formal observation</button>
                      </form>
                      <form method="post" action={`/appraiser/teachers/${t.id}/observations/start`}>
                        <input type="hidden" name="observation_type" value="annual_summary" />
                        <button class="w-full text-left px-3 py-2 text-sm hover:bg-slate-50"><i class="fas fa-calendar-check text-emerald-600 mr-2 w-4"></i>Annual summary</button>
                      </form>
                    </div>
                  </details>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </Layout>
  );
}

function AppraiserTeacherDetail({ user, summary, performance, modules, msg }: any) {
  const { teacher, observations, focusAreas } = summary;
  modules = modules || [];
  const perf = performance || { domains: [], latestPerIndicator: [], counts: {}, totals: {} };
  const totalScores = Number(perf.totals?.total_scores || 0);
  const overallAvg = perf.totals?.overall_avg ? Number(perf.totals.overall_avg) : null;
  const pct = (n: number) => totalScores > 0 ? Math.round((n / totalScores) * 100) : 0;
  const n4 = Number(perf.totals?.n4 || 0);
  const n3 = Number(perf.totals?.n3 || 0);
  const n2 = Number(perf.totals?.n2 || 0);
  const n1 = Number(perf.totals?.n1 || 0);
  return (
    <Layout title={`${teacher.first_name} ${teacher.last_name}`} user={user} activeNav="ap-home">
      <div class="mb-4"><a href="/appraiser" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>Back to my teachers</a></div>
      {msg && <div class="mb-3 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}

      <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 class="font-display text-2xl text-aps-navy">{teacher.first_name} {teacher.last_name}</h1>
          <p class="text-slate-600 text-sm">{teacher.title || 'Teacher'} · {teacher.email}</p>
        </div>
        <div class="flex flex-wrap gap-2">
          <form method="post" action={`/appraiser/teachers/${teacher.id}/observations/start`} class="flex flex-wrap items-end gap-2 bg-white p-3 border border-slate-200 rounded-md">
            <label class="text-xs"><span class="block text-slate-600 mb-1">Type</span>
              <select name="observation_type" class="border rounded px-2 py-1 text-sm">
                <option value="mini">Mini-observation</option>
                <option value="formal">Formal observation</option>
                <option value="annual_summary">Annual summary</option>
              </select>
            </label>
            <label class="text-xs"><span class="block text-slate-600 mb-1">Subject</span><input name="subject" placeholder="e.g., Algebra I" class="border rounded px-2 py-1 text-sm" /></label>
            <label class="text-xs"><span class="block text-slate-600 mb-1">Location</span><input name="location" placeholder="Room #" class="border rounded px-2 py-1 text-sm w-24" /></label>
            <label class="text-xs"><span class="block text-slate-600 mb-1">Context</span><input name="class_context" placeholder="3rd period, 22 students" class="border rounded px-2 py-1 text-sm w-64" /></label>
            <button class="bg-aps-navy text-white px-3 py-1.5 rounded text-sm hover:bg-aps-blue"><i class="fas fa-play mr-1"></i>Start observation</button>
          </form>
        </div>
      </div>

      {/* ---------- Performance Summary (pulled directly from DB scores) ---------- */}
      <Card title="Performance Summary" icon="fas fa-chart-column" class="mb-4">
        {totalScores === 0 ? (
          <p class="text-slate-500 text-sm">No published observation scores yet. Once you sign and publish an observation, rubric-level averages, domain breakdowns, and a rating distribution will appear here — pulled directly from the indicators you scored, no AI summarization.</p>
        ) : (
          <div>
            <div class="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
              <div class="rounded-md border border-slate-200 p-3">
                <div class="text-xs text-slate-500">Overall Avg</div>
                <div class="text-2xl font-bold text-aps-navy">{overallAvg !== null ? overallAvg.toFixed(2) : '—'}<span class="text-sm text-slate-400"> / 4</span></div>
                <div class="text-xs text-slate-500">{totalScores} indicator score{totalScores!==1?'s':''}</div>
              </div>
              <div class="rounded-md border border-emerald-200 bg-emerald-50 p-3">
                <div class="text-xs text-emerald-700">Highly Effective (4)</div>
                <div class="text-2xl font-bold text-emerald-800">{n4}</div>
                <div class="text-xs text-emerald-700">{pct(n4)}%</div>
              </div>
              <div class="rounded-md border border-sky-200 bg-sky-50 p-3">
                <div class="text-xs text-sky-700">Effective (3)</div>
                <div class="text-2xl font-bold text-sky-800">{n3}</div>
                <div class="text-xs text-sky-700">{pct(n3)}%</div>
              </div>
              <div class="rounded-md border border-amber-200 bg-amber-50 p-3">
                <div class="text-xs text-amber-700">Improvement Necessary (2)</div>
                <div class="text-2xl font-bold text-amber-800">{n2}</div>
                <div class="text-xs text-amber-700">{pct(n2)}%</div>
              </div>
              <div class="rounded-md border border-red-200 bg-red-50 p-3">
                <div class="text-xs text-red-700">Does Not Meet (1)</div>
                <div class="text-2xl font-bold text-red-800">{n1}</div>
                <div class="text-xs text-red-700">{pct(n1)}%</div>
              </div>
            </div>

            {/* Domain breakdown */}
            <div class="text-xs text-slate-500 uppercase tracking-wide mb-2">By Domain</div>
            <div class="space-y-2">
              {perf.domains.filter((d: any) => Number(d.score_count || 0) > 0).map((d: any) => {
                const avg = d.avg_level ? Number(d.avg_level) : 0;
                const count = Number(d.score_count || 0);
                const pctBar = Math.max(0, Math.min(100, (avg / 4) * 100));
                const tone = avg >= 3.5 ? 'bg-emerald-600' : avg >= 2.5 ? 'bg-sky-600' : avg >= 1.5 ? 'bg-amber-500' : 'bg-red-600';
                return (
                  <div class="border border-slate-200 rounded-md p-2">
                    <div class="flex items-center justify-between text-sm">
                      <div><span class="font-semibold text-aps-navy">Domain {d.domain_code}</span> <span class="text-slate-600">· {d.domain_name}</span></div>
                      <div class="text-slate-600 text-xs">Avg <span class="font-semibold text-aps-navy">{avg.toFixed(2)}</span> · {count} score{count!==1?'s':''} (4:{d.n4 || 0} / 3:{d.n3 || 0} / 2:{d.n2 || 0} / 1:{d.n1 || 0})</div>
                    </div>
                    <div class="w-full h-2 bg-slate-100 rounded mt-1 overflow-hidden">
                      <div class={`h-full ${tone}`} style={`width:${pctBar}%`}></div>
                    </div>
                  </div>
                );
              })}
              {perf.domains.filter((d: any) => Number(d.score_count || 0) > 0).length === 0 && (
                <p class="text-xs text-slate-500">No domain-level scores yet.</p>
              )}
            </div>

            {/* Most recent indicator ratings */}
            {perf.latestPerIndicator.length > 0 && (
              <div class="mt-4">
                <div class="text-xs text-slate-500 uppercase tracking-wide mb-2">Most Recent Indicator Ratings</div>
                <div class="grid md:grid-cols-2 gap-2">
                  {perf.latestPerIndicator.slice(0, 10).map((r: any) => (
                    <div class="flex items-start gap-2 border border-slate-200 rounded-md p-2 text-sm">
                      <span class={`inline-block w-8 h-8 rounded text-white font-bold flex items-center justify-center ${r.level === 4 ? 'bg-emerald-600' : r.level === 3 ? 'bg-sky-600' : r.level === 2 ? 'bg-amber-500' : 'bg-red-600'}`}>{r.level}</span>
                      <div class="min-w-0">
                        <div class="text-xs text-slate-500">{r.domain_code}.{(r.indicator_code || '').toUpperCase()} · {formatDate(r.observed_at)}</div>
                        <div class="text-aps-navy font-medium truncate">{r.indicator_name}</div>
                        {r.evidence_note && <div class="text-xs text-slate-600 truncate">{r.evidence_note}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <p class="text-[11px] text-slate-400 mt-3"><i class="fas fa-circle-info mr-1"></i>All numbers above are computed directly from published observation scores in the database — no AI summarization.</p>
          </div>
        )}
      </Card>

      <div class="grid lg:grid-cols-3 gap-4">
        <div class="lg:col-span-2 space-y-4">
          <Card title="Observation History" icon="fas fa-clock-rotate-left">
            {observations.length === 0 ? <p class="text-slate-500 text-sm">No observations yet.</p> :
              <div class="overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5"><table class="w-full text-sm">
                <thead><tr class="text-left border-b border-slate-200 text-slate-600">
                  <th class="py-2">Date</th><th>Type</th><th>Status</th><th>Summary</th><th></th>
                </tr></thead>
                <tbody>
                  {observations.map((o: any) => (
                    <tr class="border-b border-slate-100">
                      <td class="py-2">{formatDate(o.observed_at)}</td>
                      <td>{o.observation_type}</td>
                      <td><span class={`px-2 py-0.5 rounded-full text-xs border ${statusBadge(o.status)}`}>{statusLabel(o.status)}</span></td>
                      <td class="text-slate-600 text-xs truncate max-w-xs">{(o.overall_summary || '').slice(0,100)}</td>
                      <td><a href={`/appraiser/observations/${o.id}`} class="text-aps-blue hover:underline">Open →</a></td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
            }
          </Card>
        </div>

        <div class="space-y-4">
          <Card title="Active Focus Areas" icon="fas fa-bullseye">
            {focusAreas.length === 0 ? <p class="text-slate-500 text-sm">None active.</p> :
              <ul class="space-y-2">
                {focusAreas.map((f: any) => (
                  <li class="text-sm border border-slate-200 rounded p-2">
                    <div class="text-xs text-slate-500">{f.domain_code}.{(f.indicator_code || '').toUpperCase()} {f.indicator_name}</div>
                    <div class="font-medium text-aps-navy">{f.title}</div>
                    {f.description && <div class="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{f.description.slice(0,160)}</div>}
                  </li>
                ))}
              </ul>
            }
          </Card>

          {/* Fix 4 — Manually recommend a PD module to this teacher.  The
              recommender_note threads through to the teacher's "Recommended
              for You" card so they see WHY this module is on their list. */}
          <Card title="Recommend a PD module" icon="fas fa-hand-pointer">
            {modules.length === 0 ? (
              <p class="text-sm text-slate-500">No active PD modules in the library yet.</p>
            ) : (
              <form method="post" action={`/appraiser/teachers/${teacher.id}/recommend-module`} class="space-y-2">
                <label class="block text-xs text-slate-600">
                  <span class="block mb-1 font-medium">Module</span>
                  <select name="module_id" required class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm">
                    <option value="">— Select a module —</option>
                    {modules.map((m: any) => (
                      <option value={m.id}>
                        {m.domain_code}.{(m.indicator_code || '').toUpperCase()} · {m.title} ({m.est_minutes}m)
                      </option>
                    ))}
                  </select>
                </label>
                <label class="block text-xs text-slate-600">
                  <span class="block mb-1 font-medium">Note for the teacher <span class="text-slate-400 font-normal">(optional)</span></span>
                  <textarea name="note" rows={3}
                    placeholder="e.g. After Tuesday's observation, I think this anchor-charts module will help you sustain the level-3 routine you started."
                    class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"></textarea>
                </label>
                <button class="bg-aps-navy hover:bg-aps-blue text-white px-3 py-1.5 rounded text-sm w-full">
                  <i class="fas fa-paper-plane mr-1"></i>Recommend module
                </button>
                <p class="text-[11px] text-slate-500 mt-1">
                  The teacher will see this on their "Recommended for You" card and receive a notification.
                </p>
              </form>
            )}
          </Card>
        </div>
      </div>
    </Layout>
  );
}

function AppraiserObservations({ user, rows }: any) {
  return (
    <Layout title="Observations" user={user} activeNav="ap-obs">
      <h1 class="font-display text-2xl text-aps-navy mb-4">All Observations</h1>
      <Card data-tour="ap-obs-list">
        {rows.length === 0 ? <p class="text-slate-500 text-sm">No observations yet.</p> :
          <div class="overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5"><table class="w-full text-sm">
            <thead><tr class="text-left border-b border-slate-200 text-slate-600"><th class="py-2">Date</th><th>Teacher</th><th>Type</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {rows.map((o: any) => (
                <tr class="border-b border-slate-100">
                  <td class="py-2">{formatDate(o.observed_at)}</td>
                  <td>{o.t_first} {o.t_last}</td>
                  <td>{o.observation_type}</td>
                  <td><span class={`px-2 py-0.5 rounded-full text-xs border ${statusBadge(o.status)}`}>{statusLabel(o.status)}</span></td>
                  <td><a href={`/appraiser/observations/${o.id}`} class="text-aps-blue hover:underline">Open →</a></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        }
      </Card>
    </Layout>
  );
}

function ObservationEditor({ user, o, domains, msg }: any) {
  const scores: any[] = o.scores || [];
  const scoreMap = new Map<number, any>();
  for (const s of scores) scoreMap.set(s.indicator_id, s);
  const editable = o.status === 'draft' || o.status === 'scored' || o.status === 'awaiting_signature';
  const feedback: any[] = o.feedback || [];
  const feedbackByCat = {
    glow: feedback.filter((f:any)=>f.category==='glow'),
    grow: feedback.filter((f:any)=>f.category==='grow'),
    focus_area: feedback.filter((f:any)=>f.category==='focus_area'),
    next_step: feedback.filter((f:any)=>f.category==='next_step'),
  };
  // Prepare the observed_at value for <input type="datetime-local"> — must be "YYYY-MM-DDTHH:MM"
  // expressed in Central Time (the appraiser's wall-clock). The DB stores UTC.
  let observedAtLocal = '';
  if (o.observed_at) {
    try {
      const raw = String(o.observed_at);
      const utc = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(raw)
        ? new Date(raw.replace(' ', 'T') + 'Z') : new Date(raw);
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hour12: false,
      }).formatToParts(utc);
      const g = (t: string) => parts.find(p => p.type === t)?.value || '00';
      observedAtLocal = `${g('year')}-${g('month')}-${g('day')}T${g('hour')}:${g('minute')}`;
    } catch { observedAtLocal = ''; }
  }

  return (
    <Layout title="Observation" user={user} activeNav="ap-obs">
      {msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}
      <div class="mb-4"><a href="/appraiser" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>Back</a></div>

      <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 class="font-display text-2xl text-aps-navy">
            {o.observation_type === 'mini' ? 'Mini-Observation' : o.observation_type === 'formal' ? 'Formal Observation' : 'Annual Summary'}
            <span class="text-slate-500 text-base font-normal"> · {o.t_first} {o.t_last}</span>
          </h1>
          <p class="text-slate-600 text-sm">Started {formatDateTime(o.observed_at)} · {o.t_title || 'Teacher'}</p>
        </div>
        <div class="flex items-center gap-2">
          <span class={`px-3 py-1 rounded-full text-xs border ${statusBadge(o.status)}`}>{statusLabel(o.status)}</span>
          {(o.status === 'draft' || o.status === 'scored') && (
            <form method="post" action={`/appraiser/observations/${o.id}/delete`} onsubmit="return confirm('Delete this draft observation?')">
              <button class="text-xs text-red-700 hover:underline"><i class="fas fa-trash"></i> Delete draft</button>
            </form>
          )}
        </div>
      </div>

      {/* Context + notes. Each text field auto-saves individually via the
          /autosave JSON endpoint — the "Save draft" button at the bottom is
          now a belt-and-suspenders backup that also saves the full form and
          the datetime/duration (which aren't in the autosave whitelist). */}
      <form method="post" action={`/appraiser/observations/${o.id}/save`}>
        <Card title="Context" icon="fas fa-circle-info">
          <p class="text-xs text-slate-500 mb-3"><i class="fas fa-wand-magic-sparkles mr-1 text-amber-500"></i>We pre-filled Subject, Grade, and the Date/Time from when you started. Edit anything if it changed on the day — each field auto-saves as you type.</p>
          <div class="grid md:grid-cols-3 gap-3 text-sm">
            <label>Subject<input data-autosave="subject" name="subject" value={o.subject || ''} class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" disabled={!editable} /></label>
            <label>Grade / Course<input data-autosave="grade_level" name="grade_level" value={o.grade_level || ''} class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" disabled={!editable} /></label>
            <label>Location / Room <span class="text-slate-400">(optional)</span><input data-autosave="location" name="location" value={o.location || ''} class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" placeholder="e.g. Rm 204" disabled={!editable} /></label>
          </div>
          <div class="grid md:grid-cols-3 gap-3 text-sm mt-3">
            <label>Date &amp; time <span class="text-slate-400">(Central)</span>
              <input type="datetime-local" name="observed_at" value={observedAtLocal} class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" disabled={!editable} />
            </label>
            <label>Duration (min)
              <div class="mt-1 flex items-center gap-2">
                <input id="aps-duration-input" type="number" name="duration_minutes" value={o.duration_minutes || ''} class="flex-1 border border-slate-300 rounded px-2 py-1.5" placeholder="auto" disabled={!editable} />
                {editable && !o.duration_minutes ? (
                  <button type="button" id="aps-duration-toggle" class="text-xs px-2 py-1 rounded border border-aps-navy text-aps-navy hover:bg-slate-50" data-started-at={o.observed_at || ''}><i class="fas fa-stopwatch mr-1"></i>Auto</button>
                ) : null}
              </div>
            </label>
            <label>Class context <span class="text-slate-400">(optional)</span>
              <input data-autosave="class_context" name="class_context" value={o.class_context || ''} class="mt-1 w-full border border-slate-300 rounded px-2 py-1.5" placeholder="e.g. 22 students" disabled={!editable} />
            </label>
          </div>
        </Card>

        <Card title="Scripted Notes" icon="fas fa-pen-to-square" class="mt-4">
          <div class="flex items-center justify-between mb-2 gap-3">
            <p class="text-xs text-slate-500">Write what you see and hear — student language, teacher moves, timing. Your notes <strong>auto-save as you type</strong>. Private until you publish.</p>
            <span class="aps-autosave-status text-xs px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-500 whitespace-nowrap" data-for="scripted_notes" aria-live="polite">{(o.scripted_notes || '').trim() ? `✓ ${(o.scripted_notes || '').length} chars saved` : 'Nothing saved yet'}</span>
          </div>
          <textarea data-autosave="scripted_notes" name="scripted_notes" rows={10} class="w-full border border-slate-300 rounded px-3 py-2 text-sm font-mono" placeholder="9:02 — Mr. Allard writes learning target on board..." disabled={!editable}>{o.scripted_notes || ''}</textarea>
          {(o.scripted_notes || '').trim() && (
            <details class="mt-2 text-xs text-slate-600" open={!editable}>
              <summary class="cursor-pointer text-emerald-700 hover:underline"><i class="fas fa-database mr-1"></i>Saved scripted notes in database ({(o.scripted_notes || '').length} chars){!editable ? ' — read-only after publish' : ' — this is what\'s on the server right now'}</summary>
              <pre class="mt-2 whitespace-pre-wrap bg-emerald-50 border border-emerald-200 rounded p-2 font-mono text-slate-700">{o.scripted_notes}</pre>
            </details>
          )}
        </Card>

        <Card title="Private Appraiser Notes" icon="fas fa-lock" class="mt-4">
          <div class="flex items-center justify-between mb-2 gap-3">
            <p class="text-xs text-slate-500">Only visible to you and the super admin — never to the teacher or coach. Auto-saves.</p>
            <span class="aps-autosave-status text-xs px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-500 whitespace-nowrap" data-for="private_notes" aria-live="polite">{(o.private_notes || '').trim() ? `✓ ${(o.private_notes || '').length} chars saved` : 'Nothing saved yet'}</span>
          </div>
          <textarea data-autosave="private_notes" name="private_notes" rows={4} class="w-full border border-slate-300 rounded px-3 py-2 text-sm" disabled={!editable}>{o.private_notes || ''}</textarea>
        </Card>

        <Card title="Overall Summary (visible to teacher when published)" icon="fas fa-message" class="mt-4">
          <div class="flex items-center justify-between mb-2 gap-3">
            <p class="text-xs text-slate-500">This summary appears at the top of the teacher's view. Auto-saves.</p>
            <span class="aps-autosave-status text-xs px-2 py-1 rounded-full border border-slate-200 bg-slate-50 text-slate-500 whitespace-nowrap" data-for="overall_summary" aria-live="polite">{(o.overall_summary || '').trim() ? `✓ ${(o.overall_summary || '').length} chars saved` : 'Nothing saved yet'}</span>
          </div>
          <textarea data-autosave="overall_summary" name="overall_summary" rows={4} class="w-full border border-slate-300 rounded px-3 py-2 text-sm" placeholder="Your summary narrative." disabled={!editable}>{o.overall_summary || ''}</textarea>
        </Card>

        {editable && (
          <div class="mt-4 flex items-center justify-between gap-2 bg-sky-50 border border-sky-200 rounded p-3">
            <div class="text-xs text-sky-800"><i class="fas fa-floppy-disk mr-1"></i>Fields auto-save as you type. Use <strong>Save draft</strong> below only if you changed the date/time or duration (those don't auto-save). Nothing is shared with the teacher until you sign and publish.</div>
            <button type="submit" class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm whitespace-nowrap"><i class="fas fa-save mr-1"></i>Save draft</button>
          </div>
        )}
      </form>

      {/* Auto-save engine — picks up every [data-autosave] input/textarea in
          the page and POSTs to /observations/:id/autosave on every change. */}
      {editable && (
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            const OBS_ID = ${JSON.stringify(o.id)};
            const URL = '/appraiser/observations/' + OBS_ID + '/autosave';
            const timers = new Map();
            function setStatus(field, text, bg, fg, border) {
              document.querySelectorAll('.aps-autosave-status[data-for="'+field+'"]').forEach(el => {
                el.textContent = text;
                if (bg)     el.style.backgroundColor = bg;
                if (fg)     el.style.color = fg;
                if (border) el.style.borderColor = border;
              });
            }
            async function save(field, value) {
              try {
                setStatus(field, 'Saving…', '#f1f5f9', '#64748b', '#cbd5e1');
                const fd = new FormData();
                fd.set('field', field);
                fd.set('value', value);
                const r = await fetch(URL, { method: 'POST', body: fd, credentials: 'same-origin' });
                if (!r.ok) throw new Error('HTTP ' + r.status);
                const j = await r.json();
                if (!j.ok) throw new Error(j.err || 'save_failed');
                const when = new Date();
                const t = when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                // Prominent green pill so the user has no doubt it's saved.
                setStatus(field, '✓ Saved — ' + value.length + ' chars at ' + t, '#d1fae5', '#065f46', '#6ee7b7');
              } catch (err) {
                setStatus(field, '⚠ Not saved — try again', '#fee2e2', '#991b1b', '#fca5a5');
              }
            }
            document.querySelectorAll('[data-autosave]').forEach(el => {
              const field = el.getAttribute('data-autosave');
              el.addEventListener('input', () => {
                setStatus(field, 'Typing…', '#94a3b8');
                if (timers.has(field)) clearTimeout(timers.get(field));
                timers.set(field, setTimeout(() => save(field, el.value), 700));
              });
              el.addEventListener('blur', () => {
                if (timers.has(field)) { clearTimeout(timers.get(field)); timers.delete(field); }
                save(field, el.value);
              });
            });
          })();
        ` }}></script>
      )}

      {/* Scoring grid */}
      <h2 class="font-display text-xl text-aps-navy mt-8 mb-3">Marshall Rubric Scoring</h2>
      <p class="text-sm text-slate-600 mb-3">Click any cell to assign a rating for that indicator. You can leave indicators unscored for mini-observations and only score the ones you had evidence for.</p>

      {/* Fix 1 (June 2, 2026 brief) — sticky tabbed domain navigation that
          lets appraisers jump between Domains A-F without losing scroll
          position. With JS disabled it falls back to anchor links. */}
      <DomainTabs domains={domains.map((d: any) => ({ id: d.id, code: d.code, name: d.name }))} idPrefix="obs-domain" />

      <div class="space-y-3 mt-3">
        {domains.map((d: any) => (
          // April 2026 UI polish: open ALL domains by default so Domain E (the
          // "Professional Responsibilities" domain that used to stay collapsed)
          // is visible without an extra click.  Appraisers can still collapse
          // any domain by clicking its header.
          <details id={`obs-domain-${d.code}`} data-domain-section={d.code} class="bg-white rounded-lg border border-slate-200 scroll-mt-32" open>
            <summary class="px-4 py-3 cursor-pointer flex items-center gap-2">
              <span class="w-8 h-8 rounded-full bg-aps-navy text-white font-display flex items-center justify-center text-sm">{d.code}</span>
              <span class="font-display text-aps-navy">{d.name}</span>
              <span class="ml-auto text-xs text-slate-500">
                {d.indicators.filter((i:any)=>scoreMap.has(i.id)).length} / {d.indicators.length} scored
              </span>
            </summary>
            <div class="px-4 pb-4 space-y-2">
              {d.indicators.map((i: any) => (
                <IndicatorRow o={o} d={d} i={i} score={scoreMap.get(i.id)} editable={editable} />
              ))}
            </div>
          </details>
        ))}
      </div>

      {/* Generate feedback — async + scroll-preserving (April 2026 UI polish).
          When JS is available we POST with fetch + show a toast right next to
          the button, then swap the feedback list in place; if JS fails or is
          disabled the form still works as a normal POST (graceful fallback). */}
      <div id="aps-generate-feedback-block" class="mt-6 p-4 bg-white rounded-lg border border-slate-200">
        <div class="flex flex-wrap gap-3 items-center justify-between">
          <div class="text-sm">
            <div class="font-medium text-aps-navy">Organize feedback for the teacher</div>
            <div class="text-xs text-slate-500">Turns your scored indicators + scripted notes into an editable draft of glows, grows, focus areas, and next steps using the Pedagogy Library.</div>
          </div>
          <form id="aps-generate-feedback-form" method="post" action={`/appraiser/observations/${o.id}/generate-feedback`} class="flex items-center gap-3">
            <span id="aps-generate-feedback-status" class="text-xs text-slate-500" aria-live="polite"></span>
            <button class="bg-aps-gold text-aps-navy font-medium px-4 py-2 rounded hover:bg-yellow-400 text-sm" disabled={!editable}><i class="fas fa-wand-magic-sparkles mr-1"></i>Generate / refresh feedback</button>
          </form>
        </div>
        {/* Animated progress indicator — hidden by default, shown while feedback is being organized. */}
        <div id="aps-feedback-progress" class="mt-3 hidden" aria-hidden="true">
          <div class="flex items-center gap-2 text-sm text-aps-navy mb-2">
            <svg class="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path></svg>
            <span id="aps-feedback-progress-label">Reading your scored indicators…</span>
          </div>
          <div class="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
            <div id="aps-feedback-progress-bar" class="h-full bg-aps-gold transition-all duration-500" style="width: 10%"></div>
          </div>
          <div class="text-[11px] text-slate-500 mt-1">Based on your scores, here's what we found — strengths to celebrate, growth areas, focus areas, and evidence-based next steps.</div>
        </div>
      </div>

      {/* Feedback chunks editor */}
      <h2 class="font-display text-xl text-aps-navy mt-8 mb-3">Organized Feedback</h2>
      <div class="grid md:grid-cols-2 gap-4">
        <FeedbackColumn o={o} items={feedbackByCat.glow} cat="glow" label="Strengths (Glows)" icon="fas fa-star" accent="emerald" editable={editable} />
        <FeedbackColumn o={o} items={feedbackByCat.grow} cat="grow" label="Growth Areas (Grows)" icon="fas fa-seedling" accent="sky" editable={editable} />
        <FeedbackColumn o={o} items={feedbackByCat.focus_area} cat="focus_area" label="Focus Areas" icon="fas fa-bullseye" accent="amber" editable={editable} />
        <FeedbackColumn o={o} items={feedbackByCat.next_step} cat="next_step" label="Suggested Next Steps" icon="fas fa-forward" accent="slate" editable={editable} />
      </div>

      {/* Publish */}
      <Card title="Sign & Publish to Teacher" icon="fas fa-signature" class="mt-8">
        {o.status === 'published' || o.status === 'acknowledged' ? (
          <div>
            <p class="text-sm text-emerald-700"><i class="fas fa-check mr-1"></i>Published {formatDateTime(o.published_at)}.</p>
            {o.appraiser_signature_data && <img src={o.appraiser_signature_data} class="border mt-2 max-h-32" alt="signature" />}
            {o.status === 'acknowledged' && (
              <p class="text-sm text-emerald-700 mt-2"><i class="fas fa-check-double mr-1"></i>Teacher acknowledged {formatDateTime(o.teacher_acknowledged_at)}.</p>
            )}
            {/* April 2026 UI polish: jump-back links so the appraiser doesn't
                have to hunt through the nav after publishing. */}
            <div class="mt-3 flex flex-wrap gap-3 text-sm">
              <a href={`/appraiser/teachers/${o.teacher_id}`} class="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-aps-navy text-aps-navy hover:bg-aps-navy hover:text-white"><i class="fas fa-user"></i> Back to {`${o.t_first || ''} ${o.t_last || 'teacher'}`.trim()}'s page</a>
              <a href="/appraiser" class="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"><i class="fas fa-list"></i> All my teachers</a>
              <a href="/coach/pd-review" class="inline-flex items-center gap-1 px-3 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50"><i class="fas fa-graduation-cap"></i> PD review queue</a>
            </div>
          </div>
        ) : (
          <form method="post" action={`/appraiser/observations/${o.id}/publish`} class="space-y-2" id="publish-form">
            <div class="p-3 rounded bg-amber-50 border border-amber-200 text-amber-900 text-xs mb-2">
              <i class="fas fa-triangle-exclamation mr-1"></i>
              <strong>Signature required only when you are ready to send to the teacher.</strong> If you're not finished, simply use <em>Save draft</em> above — your notes, scores, and feedback will be waiting for you next time you open this observation. Signing and publishing is final and makes the observation visible to the teacher.
            </div>
            <p class="text-sm text-slate-600">Your signature confirms this observation is complete and ready for the teacher to view.</p>
            <canvas id="sig-pad" class="border border-slate-300 rounded w-full h-32 bg-white touch-none"></canvas>
            <input type="hidden" name="signature" id="sig-data" />
            <div class="flex items-center gap-2">
              <button type="button" onclick="window.SigPad.clear('sig-pad','sig-data')" class="text-sm text-slate-600 hover:underline"><i class="fas fa-eraser"></i> Clear signature</button>
            </div>
            <button type="submit" onclick="return window.SigPad.submit('sig-pad','sig-data')" class="bg-aps-navy text-white px-4 py-2 rounded hover:bg-aps-blue text-sm"><i class="fas fa-paper-plane mr-1"></i>Sign &amp; Publish to teacher</button>
          </form>
        )}
      </Card>

      {/* April 2026 UI polish: async feedback generation + unsaved-score outline.
          (1) Fetch-based POST to /generate-feedback — we stay on the page, keep
              the scroll position exactly where it was, show a toast right next
              to the button, and let the page reflect the fresh items via a
              one-time location.reload() (so all the feedback edit forms stay
              connected to their real DB ids).
          (2) Red outline + tooltip on any IndicatorRow where the appraiser has
              selected a level but not yet clicked "Save score".  Clears once
              the row is saved. */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function(){
          // ---- Unsaved score outlines ---------------------------------------
          document.querySelectorAll('form[action*="/score"]').forEach(function(form){
            var radios = form.querySelectorAll('input[type="radio"][name="level"]');
            var saveBtn = form.querySelector('button[type="submit"]');
            var row = form.closest('.border');
            function markDirty(){
              if (!row) return;
              row.style.outline = '2px solid #dc2626';
              row.style.outlineOffset = '2px';
              row.title = 'Unsaved — click Save score to record this rating.';
              if (saveBtn) {
                saveBtn.classList.remove('bg-aps-navy');
                saveBtn.classList.add('bg-red-600','animate-pulse');
                saveBtn.innerHTML = '<i class="fas fa-exclamation-circle mr-1"></i>Save score (unsaved)';
              }
            }
            radios.forEach(function(r){
              r.addEventListener('change', markDirty);
            });
            var note = form.querySelector('textarea[name="evidence_note"]');
            if (note) note.addEventListener('input', markDirty);
            // Submit clears dirty state before the navigation happens.
            form.addEventListener('submit', function(){
              if (row) { row.style.outline = ''; row.title = ''; }
            });
          });

          // ---- Async feedback generation ------------------------------------
          var genForm = document.getElementById('aps-generate-feedback-form');
          var status = document.getElementById('aps-generate-feedback-status');
          var progress = document.getElementById('aps-feedback-progress');
          var progressBar = document.getElementById('aps-feedback-progress-bar');
          var progressLabel = document.getElementById('aps-feedback-progress-label');
          // Friendly step phrases that animate while the request is in flight.
          var phases = [
            { pct: 20,  label: 'Reading your scored indicators…' },
            { pct: 45,  label: 'Cross-referencing the Pedagogy Library…' },
            { pct: 70,  label: 'Organizing glows, grows, focus areas, and next steps…' },
            { pct: 90,  label: 'Based on your scores — almost ready…' }
          ];
          var phaseTimer = null;
          function startProgress(){
            if (!progress) return;
            progress.classList.remove('hidden');
            progress.setAttribute('aria-hidden', 'false');
            if (progressBar) progressBar.style.width = '10%';
            var i = 0;
            function step(){
              if (i >= phases.length) return;
              if (progressBar) progressBar.style.width = phases[i].pct + '%';
              if (progressLabel) progressLabel.textContent = phases[i].label;
              i++;
              phaseTimer = setTimeout(step, 600);
            }
            step();
          }
          function finishProgress(){
            if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
            if (progressBar) progressBar.style.width = '100%';
            if (progressLabel) progressLabel.textContent = '✓ Feedback organized.';
          }
          function hideProgress(){
            if (phaseTimer) { clearTimeout(phaseTimer); phaseTimer = null; }
            if (progress) { progress.classList.add('hidden'); progress.setAttribute('aria-hidden', 'true'); }
          }
          if (genForm && status) {
            genForm.addEventListener('submit', function(ev){
              ev.preventDefault();
              var btn = genForm.querySelector('button[type="submit"]');
              if (btn) btn.disabled = true;
              status.style.color = '#0369a1';
              status.textContent = 'Organizing feedback…';
              startProgress();
              // Preserve scroll position precisely.
              var y = window.scrollY;
              fetch(genForm.action, {
                method: 'POST',
                headers: { 'Accept': 'application/json', 'X-Requested-With': 'fetch' },
                body: new FormData(genForm),
              }).then(function(r){ return r.json().catch(function(){ return {}; }); })
                .then(function(j){
                  if (j && j.ok) {
                    finishProgress();
                    status.style.color = '#065f46';
                    var n = (j.items ? j.items.length : 0);
                    status.textContent = '✓ Based on your scores, we organized ' + n + ' feedback item' + (n === 1 ? '' : 's') + '.';
                    // One-time full reload to rebuild the edit forms with real DB ids,
                    // then scroll back to where the appraiser was.
                    sessionStorage.setItem('aps-feedback-y', String(y));
                    setTimeout(function(){ location.reload(); }, 900);
                  } else {
                    hideProgress();
                    status.style.color = '#991b1b';
                    status.textContent = '⚠ Could not refresh — try the button again.';
                    if (btn) btn.disabled = false;
                  }
                })
                .catch(function(){
                  hideProgress();
                  status.style.color = '#991b1b';
                  status.textContent = '⚠ Network error — you can still try the button again.';
                  if (btn) btn.disabled = false;
                });
            });
          }
          // Restore scroll after the one-time reload above.
          var restoreY = sessionStorage.getItem('aps-feedback-y');
          if (restoreY) {
            sessionStorage.removeItem('aps-feedback-y');
            window.scrollTo(0, Number(restoreY) || 0);
            if (status) {
              status.style.color = '#065f46';
              status.textContent = '✓ Feedback refreshed — scroll preserved';
              setTimeout(function(){ if(status) status.textContent=''; }, 4000);
            }
          }
        })();
      ` }}></script>

      {/* Client-side helper: "Auto" button next to Duration auto-calculates elapsed minutes
          from when the observation was started. The appraiser can still override manually. */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function(){
          var btn = document.getElementById('aps-duration-toggle');
          var inp = document.getElementById('aps-duration-input');
          if (!btn || !inp) return;
          btn.addEventListener('click', function(){
            var startedAt = btn.getAttribute('data-started-at');
            if (!startedAt) { inp.value = 0; return; }
            // DB timestamps are UTC wall-clock without suffix; add Z so JS parses them as UTC.
            var d = startedAt.replace(' ','T');
            if (!/Z$|[+-]\\d\\d:?\\d\\d$/.test(d)) d += 'Z';
            var start = new Date(d).getTime();
            if (isNaN(start)) return;
            var mins = Math.max(1, Math.round((Date.now() - start) / 60000));
            inp.value = mins;
            inp.focus();
          });
        })();
      `}} />
    </Layout>
  );
}

function IndicatorRow({ o, d, i, score, editable }: any) {
  const descriptors: any[] = i.descriptors || [];
  const current = score?.level;
  return (
    <div id={`ind-${i.id}`} class="border border-slate-200 rounded">
      <div class="px-3 py-2 flex items-center gap-2 bg-slate-50 border-b border-slate-200">
        <span class="text-xs text-slate-500">{d.code}.{(i.code || '').toUpperCase()}</span>
        <span class="font-medium text-aps-navy">{i.name}</span>
        {current && <span class={`ml-auto px-2 py-0.5 rounded-full text-xs border ${levelColor[current]}`}>{current} · {levelLabels[current]}</span>}
      </div>
      <form method="post" action={`/appraiser/observations/${o.id}/score`} class="px-3 py-3 space-y-2">
        <input type="hidden" name="indicator_id" value={i.id} />
        <div class="grid md:grid-cols-4 gap-2 text-xs">
          {[4,3,2,1].map(lvl => {
            const desc = descriptors.find((x:any)=>x.level===lvl);
            const sel = current === lvl;
            return (
              <label class={`cursor-pointer border rounded p-2 ${sel ? levelColor[lvl] : 'border-slate-200 hover:bg-slate-50'}`}>
                <input type="radio" name="level" value={lvl} class="mr-1" checked={sel} disabled={!editable} />
                <span class="font-medium">{lvl} · {levelLabels[lvl]}</span>
                {desc && <div class="mt-1 text-[11px] leading-snug text-slate-700">{desc.descriptor}</div>}
              </label>
            );
          })}
          <label class="cursor-pointer border rounded p-2 border-slate-200 hover:bg-slate-50 text-xs">
            <input type="radio" name="level" value="" class="mr-1" checked={!current} disabled={!editable} />
            <span class="font-medium">Not scored</span>
            <div class="mt-1 text-[11px] text-slate-500">No evidence this observation</div>
          </label>
        </div>
        <label class="block text-xs">
          <span class="block text-slate-600 mb-1">Evidence note (visible to teacher when published)</span>
          <textarea name="evidence_note" rows={2} class="w-full border border-slate-300 rounded px-2 py-1.5 text-xs" placeholder="What you saw/heard that supports this rating" disabled={!editable}>{score?.evidence_note || ''}</textarea>
        </label>
        {editable && <button type="submit" class="text-xs bg-aps-navy text-white px-3 py-1 rounded hover:bg-aps-blue"><i class="fas fa-save mr-1"></i>Save score</button>}
      </form>
    </div>
  );
}

function FeedbackColumn({ o, items, cat, label, icon, editable }: any) {
  // Human-readable prompt for each category so an empty column guides the
  // appraiser instead of just saying "No items yet".
  const examples: Record<string, string> = {
    glow: 'e.g., "Clear learning target posted and referred to three times during the lesson."',
    grow: 'e.g., "Roughly 40% of students were disengaged during the 10-minute mini-lecture."',
    focus_area: 'e.g., "Use higher-order questioning to push thinking beyond recall."',
    next_step: 'e.g., "Enroll in PD module B.d Level 2 → 3 and rebuild tomorrow\'s lesson."',
  };
  return (
    <Card title={label} icon={icon}>
      {items.length === 0 && (
        <div class="text-xs text-slate-600 mb-3 p-3 bg-slate-50 border border-dashed border-slate-200 rounded">
          <div class="font-medium text-slate-700 mb-1"><i class="fas fa-lightbulb mr-1 text-aps-gold"></i>Nothing here yet.</div>
          <div>Click <strong>Generate / refresh feedback</strong> above to draft this column from your scores and scripted notes, or add one manually below.</div>
          <div class="mt-2 text-[11px] text-slate-500">{examples[cat] || ''}</div>
        </div>
      )}
      <ul class="space-y-3">
        {items.map((f: any) => (
          <li class="border border-slate-200 rounded-md p-3">
            <details>
              <summary class="cursor-pointer">
                <span class="font-medium text-aps-navy">{f.title || '(untitled)'}</span>
                <span class="text-xs text-slate-500 ml-2">[{f.source}]</span>
              </summary>
              {editable ? (
                <form method="post" action={`/appraiser/observations/${o.id}/feedback/save`} class="mt-2 space-y-2">
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="category" value={cat} />
                  <input type="hidden" name="indicator_id" value={f.indicator_id || ''} />
                  <input name="title" value={f.title || ''} class="w-full text-sm border border-slate-300 rounded px-2 py-1" placeholder="Title (optional)" />
                  <textarea name="body" rows={5} class="w-full text-sm border border-slate-300 rounded px-2 py-1">{f.body}</textarea>
                  <div class="flex items-center gap-2">
                    <button class="text-xs bg-aps-navy text-white px-3 py-1 rounded hover:bg-aps-blue"><i class="fas fa-save mr-1"></i>Save</button>
                    <button formaction={`/appraiser/observations/${o.id}/feedback/${f.id}/delete`} class="text-xs text-red-700 hover:underline" onclick="return confirm('Delete this feedback item?')"><i class="fas fa-trash mr-1"></i>Delete</button>
                  </div>
                </form>
              ) : (
                <div class="mt-2 text-sm whitespace-pre-wrap">{f.body}</div>
              )}
            </details>
          </li>
        ))}
      </ul>
      {editable && (
        <form method="post" action={`/appraiser/observations/${o.id}/feedback/save`} class="mt-4 border-t border-slate-100 pt-3 space-y-2">
          <input type="hidden" name="category" value={cat} />
          <input name="title" placeholder="New item title" class="w-full text-sm border border-slate-300 rounded px-2 py-1" />
          <textarea name="body" rows={3} class="w-full text-sm border border-slate-300 rounded px-2 py-1" placeholder={`Add a custom ${label.toLowerCase()} note...`}></textarea>
          <button class="text-xs bg-aps-blue text-white px-3 py-1 rounded hover:bg-aps-navy"><i class="fas fa-plus mr-1"></i>Add</button>
        </form>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------------------
// Fix 5 views: External PD queue + detail
// ----------------------------------------------------------------------------

function extPdPill(status: string) {
  switch (status) {
    case 'submitted':       return { label: 'Awaiting review', icon: 'fa-hourglass-half', color: 'bg-amber-50 text-amber-800 border-amber-200' };
    case 'approved':        return { label: 'Approved',        icon: 'fa-circle-check',   color: 'bg-emerald-50 text-emerald-800 border-emerald-200' };
    case 'declined':        return { label: 'Declined',        icon: 'fa-circle-xmark',   color: 'bg-red-50 text-red-800 border-red-200' };
    case 'needs_revision':  return { label: 'Needs revision',  icon: 'fa-rotate-left',    color: 'bg-sky-50 text-sky-800 border-sky-200' };
    default:                return { label: status,            icon: 'fa-circle',         color: 'bg-slate-50 text-slate-700 border-slate-200' };
  }
}

function ExternalPdQueue({ user, rows, filterStatus }: any) {
  const submitted = rows.filter((r: any) => r.status === 'submitted');
  const revising  = rows.filter((r: any) => r.status === 'needs_revision');
  const approved  = rows.filter((r: any) => r.status === 'approved');
  const declined  = rows.filter((r: any) => r.status === 'declined');
  return (
    <Layout title="External PD review" user={user} activeNav="ap-ext-pd">
      <h1 class="font-display text-2xl text-aps-navy mb-1"><i class="fas fa-clipboard-list mr-2"></i>External PD review queue</h1>
      <p class="text-slate-600 text-sm mb-4">
        Conferences, workshops, and outside-LMS PD that your teachers attended. Approved hours count toward each teacher's unified PD-hours total
        alongside internal LMS modules.
      </p>

      <div class="mb-4 flex flex-wrap gap-2 text-xs">
        <a href="/appraiser/external-pd" class={`px-3 py-1.5 rounded border ${!filterStatus ? 'bg-aps-navy text-white border-aps-navy' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>All ({rows.length})</a>
        <a href="/appraiser/external-pd?status=submitted" class={`px-3 py-1.5 rounded border ${filterStatus === 'submitted' ? 'bg-aps-navy text-white border-aps-navy' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>Awaiting review ({submitted.length})</a>
        <a href="/appraiser/external-pd?status=needs_revision" class={`px-3 py-1.5 rounded border ${filterStatus === 'needs_revision' ? 'bg-aps-navy text-white border-aps-navy' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>Needs revision ({revising.length})</a>
        <a href="/appraiser/external-pd?status=approved" class={`px-3 py-1.5 rounded border ${filterStatus === 'approved' ? 'bg-aps-navy text-white border-aps-navy' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>Approved ({approved.length})</a>
        <a href="/appraiser/external-pd?status=declined" class={`px-3 py-1.5 rounded border ${filterStatus === 'declined' ? 'bg-aps-navy text-white border-aps-navy' : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'}`}>Declined ({declined.length})</a>
      </div>

      {rows.length === 0 ? (
        <Card><p class="text-sm text-slate-500">Nothing here right now.</p></Card>
      ) : (
        <Card>
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left border-b border-slate-200 text-slate-600">
                  <th class="py-2">Teacher</th>
                  <th>Activity</th>
                  <th>Provider</th>
                  <th class="text-right">Hours</th>
                  <th>Submitted</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any) => {
                  const pill = extPdPill(r.status);
                  const hoursDisplay = r.status === 'approved' && r.approved_hours != null
                    ? `${Number(r.approved_hours).toFixed(2)}h (apr)`
                    : `${Number(r.hours).toFixed(2)}h`;
                  return (
                    <tr class="border-b border-slate-100 hover:bg-slate-50">
                      <td class="py-2">{r.teacher_first} {r.teacher_last}<div class="text-xs text-slate-500">{r.school_name || '—'}</div></td>
                      <td>{r.title}</td>
                      <td class="text-slate-600">{r.provider || <span class="text-slate-400 italic">—</span>}</td>
                      <td class="text-right tabular-nums">{hoursDisplay}</td>
                      <td class="text-xs text-slate-500">{formatDate(r.submitted_at)}</td>
                      <td><span class={`text-xs px-2 py-0.5 rounded-full border ${pill.color}`}><i class={`fas ${pill.icon} mr-1`}></i>{pill.label}</span></td>
                      <td><a href={`/appraiser/external-pd/${r.id}`} class="text-aps-blue hover:underline text-xs">Open <i class="fas fa-chevron-right"></i></a></td>
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

function ExternalPdDetail({ user, row, msg }: any) {
  const pill = extPdPill(row.status);
  const isDecided = row.status === 'approved' || row.status === 'declined';
  let domains: string[] = [];
  try { domains = JSON.parse(row.domain_alignment || '[]') || []; } catch {}
  return (
    <Layout title={`External PD: ${row.title}`} user={user} activeNav="ap-ext-pd">
      <div class="mb-2"><a href="/appraiser/external-pd" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>External PD queue</a></div>
      <h1 class="font-display text-2xl text-aps-navy">{row.title}</h1>
      <p class="text-slate-600 text-sm">
        Submitted by <strong>{row.teacher_first} {row.teacher_last}</strong>
        {row.school_name ? ` · ${row.school_name}` : ''} · {formatDate(row.submitted_at)}
      </p>
      <div class="mt-2"><span class={`text-xs px-2 py-0.5 rounded-full border ${pill.color}`}><i class={`fas ${pill.icon} mr-1`}></i>{pill.label}</span></div>
      {msg && <div class="mt-3 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}

      <Card title="Submission" icon="fas fa-file-lines" class="mt-4">
        <div class="grid md:grid-cols-2 gap-3 text-sm">
          <div><div class="text-xs text-slate-500">Provider</div><div>{row.provider || '—'}</div></div>
          <div><div class="text-xs text-slate-500">Dates</div><div>{row.start_date ? formatDate(row.start_date) : '—'}{row.end_date && row.end_date !== row.start_date ? ` → ${formatDate(row.end_date)}` : ''}</div></div>
          <div><div class="text-xs text-slate-500">Self-reported hours</div><div class="font-medium">{Number(row.hours).toFixed(2)}h</div></div>
          <div><div class="text-xs text-slate-500">Domain alignment</div><div>{domains.length ? domains.join(', ') : <span class="text-slate-400 italic">none</span>}</div></div>
        </div>
        {row.certificate_url && (
          <div class="mt-3 text-sm">
            <span class="text-xs text-slate-500 block">Certificate</span>
            <a href={row.certificate_url} target="_blank" rel="noopener" class="text-aps-blue hover:underline break-all"><i class="fas fa-up-right-from-square mr-1"></i>{row.certificate_url}</a>
          </div>
        )}
        {row.description && (
          <div class="mt-3">
            <div class="text-xs text-slate-500 mb-1">Description</div>
            <div class="p-3 bg-slate-50 border border-slate-200 rounded text-sm whitespace-pre-wrap">{row.description}</div>
          </div>
        )}
      </Card>

      {isDecided && (
        <Card title="Decision" icon="fas fa-gavel" class="mt-4">
          <div class="text-sm">
            <strong>{pill.label}</strong>
            {row.reviewer_first ? ` by ${row.reviewer_first} ${row.reviewer_last}` : ''}
            {row.reviewed_at ? ` on ${formatDateTime(row.reviewed_at)}` : ''}
          </div>
          {row.status === 'approved' && row.approved_hours != null && (
            <div class="mt-2 inline-flex items-center text-xs px-2 py-1 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-300">
              <i class="fas fa-clock mr-1"></i>{Number(row.approved_hours).toFixed(2)} approved PD hours
            </div>
          )}
          {row.review_note && <div class="mt-2 p-3 bg-slate-50 border border-slate-200 rounded text-sm whitespace-pre-wrap">{row.review_note}</div>}
        </Card>
      )}

      {!isDecided && (
        <Card title="Review" icon="fas fa-gavel" class="mt-4">
          <form method="post" action={`/appraiser/external-pd/${row.id}/review`} class="space-y-3">
            <label class="block text-sm">
              <span class="block text-slate-700 mb-1 font-medium">Review note <span class="text-slate-400 font-normal">(visible to teacher)</span></span>
              <textarea name="review_note" rows={3} class="w-full border border-slate-300 rounded px-2 py-1.5 text-sm"
                placeholder="e.g. Great alignment with domain B. Approving 6 of the 8 self-reported hours since the keynote wasn't instructional."></textarea>
            </label>
            <div class="flex flex-wrap items-end gap-3 p-3 bg-emerald-50 border border-emerald-200 rounded">
              <div>
                <label class="block text-xs font-semibold text-emerald-900 mb-1" for={`ap-hours-${row.id}`}><i class="fas fa-clock mr-1"></i>Approved PD hours</label>
                <input
                  id={`ap-hours-${row.id}`}
                  type="number"
                  name="approved_hours"
                  step="0.25"
                  min="0"
                  max="200"
                  value={Number(row.hours).toFixed(2)}
                  class="w-28 border border-emerald-300 rounded px-2 py-1.5 text-sm"
                />
                <div class="text-xs text-emerald-800 mt-1">Default = teacher's self-reported value ({Number(row.hours).toFixed(2)}h).</div>
              </div>
              <button name="action" value="approve" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm font-medium shadow-sm">
                <i class="fas fa-circle-check mr-1"></i>Approve &amp; Credit Hours
              </button>
            </div>
            <div class="flex items-center gap-2 pt-1 border-t border-slate-100">
              <button name="action" value="revise"  class="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded text-sm"><i class="fas fa-rotate-left mr-1"></i>Ask for revision</button>
              <button name="action" value="decline" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm"><i class="fas fa-circle-xmark mr-1"></i>Decline</button>
            </div>
          </form>
        </Card>
      )}
    </Layout>
  );
}
