import type { Bindings } from './types';

export async function getDistrict(db: D1Database) {
  return db.prepare('SELECT * FROM districts WHERE id = 1').first();
}

export async function getActiveFramework(db: D1Database) {
  return db.prepare('SELECT * FROM frameworks WHERE is_active = 1 LIMIT 1').first();
}

// Picks the current school year automatically based on today's date in US Central Time:
// - If a row's date range covers today, prefer that row and mark it is_current.
// - Otherwise, if a row already has is_current=1, use it.
// - Otherwise, auto-create a new row for today's school year (Aug 1 - Jul 31) and return it.
// This makes the current-year selection truly dynamic year-over-year with no admin intervention.
export async function getCurrentSchoolYear(db: D1Database) {
  // Compute today's date in America/Chicago so rollovers happen at midnight Central.
  const now = new Date();
  const centralParts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const y = Number(centralParts.find(p => p.type === 'year')?.value || 0);
  const m = Number(centralParts.find(p => p.type === 'month')?.value || 0);
  const d = Number(centralParts.find(p => p.type === 'day')?.value || 0);
  const todayIso = `${y.toString().padStart(4,'0')}-${m.toString().padStart(2,'0')}-${d.toString().padStart(2,'0')}`;

  // 1. Find a row that contains today's date.
  const covering = await db.prepare(
    `SELECT * FROM school_years
       WHERE date(?) BETWEEN date(start_date) AND date(end_date)
       ORDER BY start_date DESC LIMIT 1`
  ).bind(todayIso).first();
  if (covering) {
    if (!(covering as any).is_current) {
      await db.prepare(`UPDATE school_years SET is_current = CASE WHEN id = ? THEN 1 ELSE 0 END`).bind((covering as any).id).run();
      (covering as any).is_current = 1;
    }
    return covering;
  }

  // 2. Fall back to whichever row is flagged is_current.
  const flagged = await db.prepare('SELECT * FROM school_years WHERE is_current = 1 LIMIT 1').first();
  if (flagged) return flagged;

  // 3. Auto-create a new row (August 1 - July 31 school-year convention).
  const startYear = m >= 8 ? y : y - 1;
  const label = `${startYear}-${startYear + 1}`;
  const startDate = `${startYear}-08-01`;
  const endDate = `${startYear + 1}-07-31`;
  await db.prepare(`UPDATE school_years SET is_current = 0`).run();
  const ins = await db.prepare(
    `INSERT INTO school_years (district_id, label, start_date, end_date, is_current)
     VALUES (1, ?, ?, ?, 1)`
  ).bind(label, startDate, endDate).run();
  return {
    id: Number((ins.meta as any)?.last_row_id),
    district_id: 1, label, start_date: startDate, end_date: endDate, is_current: 1,
  };
}

export async function getDomainsWithIndicators(db: D1Database, frameworkId: number) {
  const domains = await db.prepare(
    'SELECT * FROM framework_domains WHERE framework_id = ? ORDER BY sort_order'
  ).bind(frameworkId).all();
  const indicators = await db.prepare(
    `SELECT fi.* FROM framework_indicators fi
     JOIN framework_domains fd ON fd.id = fi.domain_id
     WHERE fd.framework_id = ? ORDER BY fd.sort_order, fi.sort_order`
  ).bind(frameworkId).all();
  const descriptors = await db.prepare(
    `SELECT fdesc.* FROM framework_descriptors fdesc
     JOIN framework_indicators fi ON fi.id = fdesc.indicator_id
     JOIN framework_domains fd ON fd.id = fi.domain_id
     WHERE fd.framework_id = ? ORDER BY fdesc.level DESC`
  ).bind(frameworkId).all();

  const indByDomain = new Map<number, any[]>();
  for (const ind of indicators.results as any[]) {
    if (!indByDomain.has(ind.domain_id)) indByDomain.set(ind.domain_id, []);
    const levels = (descriptors.results as any[]).filter(d => d.indicator_id === ind.id);
    indByDomain.get(ind.domain_id)!.push({ ...ind, descriptors: levels });
  }
  return (domains.results as any[]).map(d => ({ ...d, indicators: indByDomain.get(d.id) || [] }));
}

export async function getAssignedTeachers(db: D1Database, staffId: number, relationship: 'appraiser'|'coach') {
  const r = await db.prepare(
    `SELECT u.* FROM assignments a
     JOIN users u ON u.id = a.teacher_id
     WHERE a.staff_id = ? AND a.relationship = ? AND a.active = 1 AND u.active = 1
     ORDER BY u.last_name, u.first_name`
  ).bind(staffId, relationship).all();
  return r.results || [];
}

export async function getTeacherSummary(db: D1Database, teacherId: number) {
  const teacher = await db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').bind(teacherId, 'teacher').first();
  if (!teacher) return null;
  const observations = await db.prepare(
    `SELECT o.*, a.first_name AS app_first, a.last_name AS app_last
     FROM observations o
     JOIN users a ON a.id = o.appraiser_id
     WHERE o.teacher_id = ?
     ORDER BY o.observed_at DESC`
  ).bind(teacherId).all();
  const focus = await db.prepare(
    `SELECT f.*, i.name AS indicator_name, i.code AS indicator_code, d.code AS domain_code, d.name AS domain_name
     FROM focus_areas f
     LEFT JOIN framework_indicators i ON i.id = f.indicator_id
     LEFT JOIN framework_domains d ON d.id = i.domain_id
     WHERE f.teacher_id = ? AND f.status = 'active'
     ORDER BY f.opened_at DESC`
  ).bind(teacherId).all();
  return { teacher, observations: observations.results || [], focusAreas: focus.results || [] };
}

export async function getObservation(db: D1Database, id: number) {
  const o = await db.prepare(
    `SELECT o.*,
            t.first_name AS t_first, t.last_name AS t_last, t.email AS t_email, t.title AS t_title,
            t.subject_area AS t_subject_area, t.classroom_type AS t_classroom_type, t.grade_band AS t_grade_band,
            a.first_name AS a_first, a.last_name AS a_last, a.title AS a_title
     FROM observations o
     JOIN users t ON t.id = o.teacher_id
     JOIN users a ON a.id = o.appraiser_id
     WHERE o.id = ?`
  ).bind(id).first<any>();
  if (!o) return null;
  const scores = await db.prepare(
    `SELECT s.*, i.name AS indicator_name, i.code AS indicator_code, d.code AS domain_code, d.name AS domain_name, d.id AS domain_id
     FROM observation_scores s
     JOIN framework_indicators i ON i.id = s.indicator_id
     JOIN framework_domains d ON d.id = i.domain_id
     WHERE s.observation_id = ?
     ORDER BY d.sort_order, i.sort_order`
  ).bind(id).all();
  const feedback = await db.prepare(
    `SELECT fi.*, i.name AS indicator_name, i.code AS indicator_code, d.code AS domain_code
     FROM feedback_items fi
     LEFT JOIN framework_indicators i ON i.id = fi.indicator_id
     LEFT JOIN framework_domains d ON d.id = i.domain_id
     WHERE fi.observation_id = ?
     ORDER BY fi.sort_order, fi.id`
  ).bind(id).all();
  return { ...o, scores: scores.results || [], feedback: feedback.results || [] };
}

/**
 * Data-driven performance summary for a teacher.
 * Pulls directly from observation_scores + framework tables — no AI summarization.
 * Only scores from published or acknowledged observations count toward the averages,
 * so drafts in progress never leak into leadership views.
 */
export async function getTeacherPerformanceSummary(db: D1Database, teacherId: number) {
  // Per-domain averages and counts
  const domains = await db.prepare(
    `SELECT d.id AS domain_id, d.code AS domain_code, d.name AS domain_name, d.sort_order,
            COUNT(s.id) AS score_count,
            AVG(s.level) AS avg_level,
            SUM(CASE WHEN s.level = 4 THEN 1 ELSE 0 END) AS n4,
            SUM(CASE WHEN s.level = 3 THEN 1 ELSE 0 END) AS n3,
            SUM(CASE WHEN s.level = 2 THEN 1 ELSE 0 END) AS n2,
            SUM(CASE WHEN s.level = 1 THEN 1 ELSE 0 END) AS n1
     FROM framework_domains d
     LEFT JOIN framework_indicators i ON i.domain_id = d.id
     LEFT JOIN observation_scores s ON s.indicator_id = i.id
     LEFT JOIN observations o ON o.id = s.observation_id
     WHERE (o.teacher_id = ? OR o.teacher_id IS NULL)
       AND (o.status IN ('published','acknowledged') OR o.status IS NULL)
     GROUP BY d.id, d.code, d.name, d.sort_order
     ORDER BY d.sort_order`
  ).bind(teacherId).all();

  // Recent ratings: latest score per indicator (across published/acknowledged)
  const recent = await db.prepare(
    `SELECT i.id AS indicator_id, i.code AS indicator_code, i.name AS indicator_name,
            d.code AS domain_code,
            s.level, s.evidence_note, s.created_at, o.id AS observation_id, o.observed_at
     FROM observation_scores s
     JOIN framework_indicators i ON i.id = s.indicator_id
     JOIN framework_domains d ON d.id = i.domain_id
     JOIN observations o ON o.id = s.observation_id
     WHERE o.teacher_id = ? AND o.status IN ('published','acknowledged')
     ORDER BY o.observed_at DESC, d.sort_order, i.sort_order
     LIMIT 200`
  ).bind(teacherId).all();

  // Observation counts for context
  const counts = await db.prepare(
    `SELECT
       SUM(CASE WHEN status IN ('published','acknowledged') THEN 1 ELSE 0 END) AS published,
       SUM(CASE WHEN status IN ('draft','scored','awaiting_signature') THEN 1 ELSE 0 END) AS in_progress,
       MAX(CASE WHEN status IN ('published','acknowledged') THEN observed_at END) AS last_observed_at,
       SUM(CASE WHEN status IN ('published','acknowledged') THEN 1 ELSE 0 END) AS total_published
     FROM observations WHERE teacher_id = ?`
  ).bind(teacherId).first<any>();

  // Overall totals
  const totals = await db.prepare(
    `SELECT COUNT(s.id) AS total_scores, AVG(s.level) AS overall_avg,
            SUM(CASE WHEN s.level=4 THEN 1 ELSE 0 END) AS n4,
            SUM(CASE WHEN s.level=3 THEN 1 ELSE 0 END) AS n3,
            SUM(CASE WHEN s.level=2 THEN 1 ELSE 0 END) AS n2,
            SUM(CASE WHEN s.level=1 THEN 1 ELSE 0 END) AS n1
     FROM observation_scores s
     JOIN observations o ON o.id = s.observation_id
     WHERE o.teacher_id = ? AND o.status IN ('published','acknowledged')`
  ).bind(teacherId).first<any>();

  // Keep latest rating per indicator for the "Most Recent Indicator Ratings" block
  const seen = new Set<number>();
  const latestPerIndicator: any[] = [];
  for (const r of (recent.results as any[])) {
    if (seen.has(r.indicator_id)) continue;
    seen.add(r.indicator_id);
    latestPerIndicator.push(r);
  }

  return {
    domains: (domains.results as any[]) || [],
    latestPerIndicator,
    counts: counts || {},
    totals: totals || {},
  };
}

export async function getPedagogy(db: D1Database, indicatorId: number, level: number) {
  return db.prepare('SELECT * FROM pedagogy_library WHERE indicator_id = ? AND level = ?').bind(indicatorId, level).first<any>();
}

// ---------------------------------------------------------------------------
// Multi-school helpers (user_schools junction table)
// One user can be linked to many schools. users.school_id still holds the
// "primary" school (used for display / single-row UI). The junction table is
// the source of truth for "who belongs to school X" queries.
// ---------------------------------------------------------------------------
export async function getUserSchoolIds(db: D1Database, userId: number): Promise<number[]> {
  const r = await db.prepare(
    `SELECT school_id FROM user_schools WHERE user_id=? ORDER BY is_primary DESC, school_id`
  ).bind(userId).all();
  return (r.results as any[]).map(x => Number(x.school_id));
}

export async function getUserSchools(db: D1Database, userId: number) {
  const r = await db.prepare(
    `SELECT s.id, s.name, s.grade_span, us.is_primary
       FROM user_schools us JOIN schools s ON s.id = us.school_id
      WHERE us.user_id = ? ORDER BY us.is_primary DESC, s.name`
  ).bind(userId).all();
  return (r.results as any[]) || [];
}

/**
 * Replace a user's school links with the provided ids.
 * The first id in the array becomes the "primary" school and is also written
 * back to users.school_id so every place that reads users.school_id keeps
 * working unchanged.
 */
export async function setUserSchools(db: D1Database, userId: number, schoolIds: number[]) {
  const clean = Array.from(new Set(schoolIds.filter(n => Number.isFinite(n) && n > 0)));
  await db.prepare(`DELETE FROM user_schools WHERE user_id=?`).bind(userId).run();
  for (let i = 0; i < clean.length; i++) {
    await db.prepare(
      `INSERT INTO user_schools (user_id, school_id, is_primary) VALUES (?,?,?)`
    ).bind(userId, clean[i], i === 0 ? 1 : 0).run();
  }
  // Keep users.school_id in sync with the primary for legacy reads.
  await db.prepare(
    `UPDATE users SET school_id=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(clean[0] || null, userId).run();
}

/**
 * Return school ids that should scope a user's multi-school view.
 * Falls back to users.school_id when the junction row is missing (for very
 * old seeded users). Empty array = district-wide (super_admin / supt).
 */
export async function schoolScopeForUser(db: D1Database, user: { id: number; role: string; school_id: number | null }): Promise<number[]> {
  if (user.role === 'super_admin' || user.role === 'superintendent') return [];
  const ids = await getUserSchoolIds(db, user.id);
  if (ids.length) return ids;
  return user.school_id ? [user.school_id] : [];
}

export async function logActivity(db: D1Database, userId: number | null, entity: string, entityId: number | null, action: string, detail?: any) {
  try {
    await db.prepare(
      'INSERT INTO activity_log (user_id, entity_type, entity_id, action, detail) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, entity, entityId, action, detail ? JSON.stringify(detail) : null).run();
  } catch (e) { console.warn('activity_log failed', e); }
}

// ===========================================================================
// June 2, 2026 — leadership upgrade helpers (Fixes 4, 5, 6, 7, 8, 10, 11)
// ===========================================================================

// ---- Fix 8: admin_audit_log ----------------------------------------------
// Separate from activity_log because this is the "high-trust mutation" trail
// (mass deletes, practice-data resets) that needs row counts + filter dumps
// for compliance reviews.
export async function logAdminAudit(
  db: D1Database,
  actorUserId: number,
  action: string,
  opts?: { entityType?: string; entityIds?: number[]; rowCount?: number; filters?: any; detail?: string; ip?: string | null; userAgent?: string | null }
) {
  try {
    await db.prepare(
      `INSERT INTO admin_audit_log
         (actor_user_id, action, entity_type, entity_ids, row_count, filters, detail, ip, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      actorUserId,
      action,
      opts?.entityType || null,
      opts?.entityIds && opts.entityIds.length ? JSON.stringify(opts.entityIds) : null,
      Number(opts?.rowCount || 0),
      opts?.filters ? JSON.stringify(opts.filters) : null,
      opts?.detail || null,
      opts?.ip || null,
      opts?.userAgent || null,
    ).run();
  } catch (e) {
    console.warn('admin_audit_log failed', e);
  }
}

export async function recentAdminAudit(db: D1Database, limit = 100) {
  const r = await db.prepare(
    `SELECT al.*, u.first_name, u.last_name, u.role
       FROM admin_audit_log al
       LEFT JOIN users u ON u.id = al.actor_user_id
       ORDER BY al.created_at DESC LIMIT ?`
  ).bind(limit).all();
  return (r.results as any[]) || [];
}

// ---- Fix 6: system_settings (admin-editable knobs) -----------------------
export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const r = await db.prepare(`SELECT value FROM system_settings WHERE key = ?`).bind(key).first<any>();
  return r ? String(r.value) : null;
}

export async function getNumericSetting(db: D1Database, key: string, fallback: number): Promise<number> {
  const v = await getSetting(db, key);
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export async function setSetting(db: D1Database, key: string, value: string | number, updatedBy: number | null, valueType: 'string' | 'number' | 'json' | 'boolean' = 'string') {
  await db.prepare(
    `INSERT INTO system_settings (key, value, value_type, updated_by, updated_at)
     VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value, value_type = excluded.value_type,
       updated_by = excluded.updated_by, updated_at = CURRENT_TIMESTAMP`
  ).bind(key, String(value), valueType, updatedBy).run();
}

// ---- Fix 6 + Fix 7: unified PD hours aggregation --------------------------
// Returns one record per teacher with internal (verified+credited) + external
// (approved) hours plus a heat-map color class. Honors soft-delete: only
// non-deleted pd_enrollments and external_pd_submissions count.
export async function getTeacherPDHoursSummary(
  db: D1Database,
  opts?: { schoolIds?: number[]; teacherId?: number; sinceDate?: string | null }
) {
  const target = await getNumericSetting(db, 'pd_hours_target_annual', 22.5);
  const since = opts?.sinceDate || null; // YYYY-MM-DD

  const where: string[] = [`u.role = 'teacher'`, `u.active = 1`];
  const binds: any[] = [];
  if (opts?.schoolIds && opts.schoolIds.length) {
    where.push(`u.school_id IN (${opts.schoolIds.map(() => '?').join(',')})`);
    binds.push(...opts.schoolIds);
  }
  if (opts?.teacherId) {
    where.push(`u.id = ?`);
    binds.push(opts.teacherId);
  }

  // Internal hours: sum of pd_enrollments.hours_credited where credited and not deleted.
  // External hours: sum of external_pd_submissions.approved_hours where status='approved'
  // (fall back to .hours when approved_hours is NULL).
  const internalDateFilter = since ? `AND e.credited_at IS NOT NULL AND date(e.credited_at) >= date(?)` : '';
  const externalDateFilter = since ? `AND date(x.reviewed_at) >= date(?)` : '';
  const extraBindsInternal = since ? [since] : [];
  const extraBindsExternal = since ? [since] : [];

  const sql = `
    SELECT
      u.id AS teacher_id,
      u.first_name, u.last_name, u.email, u.school_id, u.subject_area, u.grade_band,
      s.name AS school_name,
      COALESCE(internal.hrs, 0) AS internal_hours,
      COALESCE(internal.cnt, 0) AS internal_count,
      COALESCE(external_.hrs, 0) AS external_hours,
      COALESCE(external_.cnt, 0) AS external_count
    FROM users u
    LEFT JOIN schools s ON s.id = u.school_id
    LEFT JOIN (
      SELECT e.teacher_id,
             SUM(COALESCE(e.hours_credited, 0)) AS hrs,
             SUM(CASE WHEN e.hours_credited > 0 THEN 1 ELSE 0 END) AS cnt
        FROM pd_enrollments e
        WHERE e.deleted_at IS NULL AND e.status = 'verified'
              ${internalDateFilter}
        GROUP BY e.teacher_id
    ) internal ON internal.teacher_id = u.id
    LEFT JOIN (
      SELECT x.teacher_id,
             SUM(COALESCE(x.approved_hours, x.hours, 0)) AS hrs,
             COUNT(*) AS cnt
        FROM external_pd_submissions x
        WHERE x.status = 'approved' AND x.deleted_at IS NULL
              ${externalDateFilter}
        GROUP BY x.teacher_id
    ) external_ ON external_.teacher_id = u.id
    WHERE ${where.join(' AND ')}
    ORDER BY u.last_name, u.first_name
  `;

  // Bind order: internal CTE filter, external CTE filter, then outer where binds.
  const allBinds = [...extraBindsInternal, ...extraBindsExternal, ...binds];
  const r = await db.prepare(sql).bind(...allBinds).all();
  const rows = ((r.results as any[]) || []).map((row) => {
    const total = Number(row.internal_hours || 0) + Number(row.external_hours || 0);
    const pct = target > 0 ? total / target : 0;
    let heat: 'low' | 'mid' | 'near' | 'met' = 'low';
    if (pct >= 1.0) heat = 'met';
    else if (pct >= 0.66) heat = 'near';
    else if (pct >= 0.33) heat = 'mid';
    return { ...row, total_hours: total, pct_of_target: pct, heat, target };
  });
  return { target, rows };
}

// ---- Fix 5: External PD submissions ---------------------------------------
export async function listExternalPdForTeacher(db: D1Database, teacherId: number) {
  const r = await db.prepare(
    `SELECT x.*, r.first_name AS reviewer_first, r.last_name AS reviewer_last
       FROM external_pd_submissions x
       LEFT JOIN users r ON r.id = x.reviewed_by
       WHERE x.teacher_id = ? AND x.deleted_at IS NULL
       ORDER BY x.submitted_at DESC`
  ).bind(teacherId).all();
  return (r.results as any[]) || [];
}

export async function listExternalPdQueue(db: D1Database, opts?: { status?: string; appraiserId?: number; schoolIds?: number[] }) {
  const where: string[] = [`x.deleted_at IS NULL`];
  const binds: any[] = [];
  if (opts?.status) { where.push(`x.status = ?`); binds.push(opts.status); }
  if (opts?.appraiserId) {
    where.push(`x.teacher_id IN (
      SELECT teacher_id FROM assignments WHERE staff_id = ? AND relationship = 'appraiser' AND active = 1
    )`);
    binds.push(opts.appraiserId);
  }
  if (opts?.schoolIds && opts.schoolIds.length) {
    where.push(`t.school_id IN (${opts.schoolIds.map(() => '?').join(',')})`);
    binds.push(...opts.schoolIds);
  }
  const r = await db.prepare(
    `SELECT x.*,
            t.first_name AS teacher_first, t.last_name AS teacher_last, t.email AS teacher_email,
            t.school_id, s.name AS school_name,
            r.first_name AS reviewer_first, r.last_name AS reviewer_last
       FROM external_pd_submissions x
       JOIN users t ON t.id = x.teacher_id
       LEFT JOIN schools s ON s.id = t.school_id
       LEFT JOIN users r ON r.id = x.reviewed_by
       WHERE ${where.join(' AND ')}
       ORDER BY
         CASE x.status
           WHEN 'submitted' THEN 0
           WHEN 'needs_revision' THEN 1
           WHEN 'approved' THEN 2
           WHEN 'declined' THEN 3
         END,
         x.submitted_at DESC`
  ).bind(...binds).all();
  return (r.results as any[]) || [];
}

export async function getExternalPd(db: D1Database, id: number) {
  return db.prepare(
    `SELECT x.*, t.first_name AS teacher_first, t.last_name AS teacher_last, t.email AS teacher_email, t.school_id,
            s.name AS school_name,
            r.first_name AS reviewer_first, r.last_name AS reviewer_last
       FROM external_pd_submissions x
       JOIN users t ON t.id = x.teacher_id
       LEFT JOIN schools s ON s.id = t.school_id
       LEFT JOIN users r ON r.id = x.reviewed_by
       WHERE x.id = ? AND x.deleted_at IS NULL`
  ).bind(id).first<any>();
}

// ---- Fix 10: Teacher Goals -----------------------------------------------
export async function listTeacherGoals(db: D1Database, teacherId: number, includeArchived = false) {
  const filter = includeArchived ? '' : `AND status NOT IN ('archived')`;
  const r = await db.prepare(
    `SELECT g.*, i.code AS indicator_code, i.name AS indicator_name
       FROM teacher_goals g
       LEFT JOIN framework_indicators i ON i.id = g.indicator_id
       WHERE g.teacher_id = ? AND g.deleted_at IS NULL ${filter}
       ORDER BY
         CASE g.status WHEN 'active' THEN 0 WHEN 'on_hold' THEN 1 WHEN 'complete' THEN 2 ELSE 3 END,
         COALESCE(g.target_date, '9999-12-31'),
         g.created_at DESC`
  ).bind(teacherId).all();
  return (r.results as any[]) || [];
}

export async function getTeacherGoal(db: D1Database, id: number) {
  return db.prepare(`SELECT * FROM teacher_goals WHERE id = ? AND deleted_at IS NULL`).bind(id).first<any>();
}

// ---- Fix 11: Build context note for the feedback generator ---------------
// Returns a short string the feedback generator can prepend to its template
// so the surfaced "next moves" reflect the teacher's classroom reality.
// Backward compatible: if all three context fields are empty, returns ''.
export function teacherContextNote(u: { subject_area?: string | null; classroom_type?: string | null; grade_band?: string | null } | null | undefined): string {
  if (!u) return '';
  const parts: string[] = [];
  if (u.grade_band)     parts.push(`grade band ${u.grade_band}`);
  if (u.subject_area)   parts.push(`teaches ${u.subject_area}`);
  if (u.classroom_type) parts.push(`${u.classroom_type.replace(/_/g, ' ')} setting`);
  if (!parts.length) return '';
  return `Context: ${parts.join(', ')}.`;
}
