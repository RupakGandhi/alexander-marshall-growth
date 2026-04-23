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
