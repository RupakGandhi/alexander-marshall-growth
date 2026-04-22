import type { Bindings } from './types';

export async function getDistrict(db: D1Database) {
  return db.prepare('SELECT * FROM districts WHERE id = 1').first();
}

export async function getActiveFramework(db: D1Database) {
  return db.prepare('SELECT * FROM frameworks WHERE is_active = 1 LIMIT 1').first();
}

export async function getCurrentSchoolYear(db: D1Database) {
  return db.prepare('SELECT * FROM school_years WHERE is_current = 1 LIMIT 1').first();
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

export async function getPedagogy(db: D1Database, indicatorId: number, level: number) {
  return db.prepare('SELECT * FROM pedagogy_library WHERE indicator_id = ? AND level = ?').bind(indicatorId, level).first<any>();
}

export async function logActivity(db: D1Database, userId: number | null, entity: string, entityId: number | null, action: string, detail?: any) {
  try {
    await db.prepare(
      'INSERT INTO activity_log (user_id, entity_type, entity_id, action, detail) VALUES (?, ?, ?, ?, ?)'
    ).bind(userId, entity, entityId, action, detail ? JSON.stringify(detail) : null).run();
  } catch (e) { console.warn('activity_log failed', e); }
}
