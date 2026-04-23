// ============================================================================
// pd.ts — Professional Development LMS core
// ============================================================================
// Auto-enrollment, status transitions, and query helpers for the teacher PD
// workspace.  The whole system is driven by one idea: every Marshall rubric
// (indicator × level) cell can have one or more research-based Learn →
// Practice → Apply modules attached to it.  When a teacher is scored at level
// 1 or 2 on any indicator, the system looks up the matching modules and
// auto-enrolls the teacher in them.  The teacher completes the module phases,
// uploads a classroom deliverable, and a supervisor verifies it.
//
// This file is intentionally deterministic and database-driven — no AI calls,
// no hidden prompt magic.  Everything the super-admin edits in the module
// editor flows straight into what teachers see.
// ============================================================================

import type { Bindings } from './types';
import { notify } from './notifications';

// Enrollment status machine (matches DB):
//   recommended → started → learn_done → practice_done → submitted → verified
//   branches:    needs_revision (from submitted)  |  declined (from any)
export type PDStatus =
  | 'recommended' | 'started' | 'learn_done' | 'practice_done'
  | 'submitted' | 'verified' | 'needs_revision' | 'declined';

// Rule: any observation score at level <= 2 (Improvement Necessary or Does
// Not Meet) generates a module recommendation. Level 3 & 4 do not, because
// the teacher is already meeting or exceeding expectations — the library is
// for growth, not busywork.
export const AUTO_ENROLL_THRESHOLD = 2;

// --------------------------------------------------------------------------
// Auto-enroll a teacher in the PD modules that match their low scores on a
// specific observation.  Called on observation publish.  Idempotent — uses
// (teacher_id, module_id, source_observation_id) unique key so repeated
// publishes never duplicate enrollments.
// --------------------------------------------------------------------------
export async function autoEnrollForObservation(db: D1Database, observationId: number, env?: Bindings) {
  const scores = await db.prepare(
    `SELECT s.indicator_id, s.level, o.teacher_id, o.appraiser_id
       FROM observation_scores s
       JOIN observations o ON o.id = s.observation_id
       WHERE s.observation_id = ? AND s.level IS NOT NULL AND s.level <= ?`
  ).bind(observationId, AUTO_ENROLL_THRESHOLD).all();
  const rows = (scores.results as any[]) || [];
  let created = 0;
  for (const r of rows) {
    // Find active module(s) targeting this indicator + level
    const modules = await db.prepare(
      `SELECT id, title FROM pd_modules
         WHERE indicator_id = ? AND target_level = ? AND is_active = 1
         ORDER BY id LIMIT 3`   // cap at 3 per cell so we don't drown teachers
    ).bind(r.indicator_id, r.level).all();
    for (const m of ((modules.results as any[]) || [])) {
      const ins = await db.prepare(
        `INSERT OR IGNORE INTO pd_enrollments
           (teacher_id, module_id, source, source_observation_id, source_score_level, status)
         VALUES (?, ?, 'auto', ?, ?, 'recommended')`
      ).bind(r.teacher_id, m.id, observationId, r.level).run();
      if ((ins.meta as any)?.changes) {
        created += 1;
        if (env) {
          await notify(db, {
            user_id: r.teacher_id,
            kind: 'pd_module_recommended',
            title: `New PD module: ${m.title}`,
            body: 'Based on your observation scores, this research-based module was added to your PD LMS.',
            url: `/teacher/pd`,
            entity_type: 'pd_enrollment', entity_id: m.id,
            actor_user_id: r.appraiser_id,
          }, env);
        }
      }
    }
  }
  return { created };
}

// --------------------------------------------------------------------------
// Recommend modules directly (without an observation) — used by the teacher
// self-service flow when they want to add a module from the library.  Also
// used when a supervisor assigns a module manually.
// --------------------------------------------------------------------------
export async function enrollTeacher(
  db: D1Database,
  teacherId: number,
  moduleId: number,
  source: 'auto' | 'self' | 'assigned',
  assignedBy?: number,
  env?: Bindings
) {
  // When there's no observation context, source_observation_id is NULL — so
  // the UNIQUE constraint uses (teacher_id, module_id, NULL) which in SQLite
  // does allow duplicate NULLs.  Guard manually against the common case.
  const exists = await db.prepare(
    `SELECT id FROM pd_enrollments WHERE teacher_id = ? AND module_id = ? AND source_observation_id IS NULL AND status NOT IN ('declined')`
  ).bind(teacherId, moduleId).first<any>();
  if (exists) return { enrollment_id: exists.id, created: false };
  const res = await db.prepare(
    `INSERT INTO pd_enrollments (teacher_id, module_id, source, assigned_by, status)
     VALUES (?, ?, ?, ?, 'recommended')`
  ).bind(teacherId, moduleId, source, assignedBy || null).run();
  const id = Number((res.meta as any)?.last_row_id || 0);
  if (env && source === 'assigned') {
    const mod = await db.prepare(`SELECT title FROM pd_modules WHERE id = ?`).bind(moduleId).first<any>();
    await notify(db, {
      user_id: teacherId,
      kind: 'pd_module_assigned',
      title: `PD module assigned: ${mod?.title || 'New module'}`,
      body: 'A supervisor added this module to your PD LMS.',
      url: `/teacher/pd/${id}`,
      entity_type: 'pd_enrollment', entity_id: id,
      actor_user_id: assignedBy,
    }, env);
  }
  return { enrollment_id: id, created: true };
}

// --------------------------------------------------------------------------
// Advance an enrollment to the next state.  Designed so UI just calls this
// and trusts the library to reject illegal transitions.
// --------------------------------------------------------------------------
export async function advanceEnrollment(db: D1Database, enrollmentId: number, teacherId: number, to: PDStatus) {
  const e = await db.prepare(`SELECT * FROM pd_enrollments WHERE id = ? AND teacher_id = ?`)
    .bind(enrollmentId, teacherId).first<any>();
  if (!e) throw new Error('not found');
  const from = e.status as PDStatus;

  // Explicit single-step transitions the UI can request.
  const ok: Record<PDStatus, PDStatus[]> = {
    recommended:    ['started', 'declined'],
    started:        ['learn_done', 'declined'],
    learn_done:     ['practice_done', 'started'],
    practice_done:  ['submitted', 'learn_done'],
    submitted:      [],                              // only supervisors move this on
    verified:       [],
    needs_revision: ['submitted'],
    declined:       ['recommended'],                 // re-open
  };
  // Auto-bridging transitions — if a teacher clicks "Mark learn complete" on
  // a `recommended` enrollment (for example because they jumped straight to the
  // Learn phase without pressing "Start module" first), we silently auto-start
  // the enrollment and then mark Learn done. The UI never has to show a
  // confusing "cannot move recommended → learn_done" error for a valid forward
  // click. The map below declares which forward-jumps are safe to bridge.
  const bridges: Partial<Record<PDStatus, PDStatus[]>> = {
    recommended: ['learn_done', 'practice_done', 'submitted'],
    started:     ['practice_done', 'submitted'],
    learn_done:  ['submitted'],
  };
  const direct = ok[from]?.includes(to);
  const bridge = bridges[from]?.includes(to);
  if (!direct && !bridge) {
    throw new Error(`cannot move ${from} → ${to}`);
  }

  // Compute the timestamps we need to set. If we're bridging recommended →
  // learn_done, we also backfill started (via the implicit visit through it).
  const now = new Date().toISOString().replace('T', ' ').replace(/\..*Z?$/, '');
  const set: string[] = [`status = ?`, `updated_at = CURRENT_TIMESTAMP`];
  const bindVals: any[] = [to];
  if (to === 'learn_done' && !e.learn_done_at)         { set.push(`learn_done_at = ?`);    bindVals.push(now); }
  if (to === 'practice_done' && !e.practice_done_at)   { set.push(`practice_done_at = ?`); bindVals.push(now); }
  if (to === 'practice_done' && !e.learn_done_at)      { set.push(`learn_done_at = ?`);    bindVals.push(now); }
  if (to === 'submitted' && !e.practice_done_at)       { set.push(`practice_done_at = ?`); bindVals.push(now); }
  if (to === 'submitted' && !e.learn_done_at)          { set.push(`learn_done_at = ?`);    bindVals.push(now); }
  bindVals.push(enrollmentId);
  await db.prepare(`UPDATE pd_enrollments SET ${set.join(', ')} WHERE id = ?`).bind(...bindVals).run();
}

// --------------------------------------------------------------------------
// Submit the Apply-phase deliverable.  Takes rich text + optional title.
// Transitions enrollment to 'submitted' and notifies the teacher's
// appraiser + any coach assigned to them.
// --------------------------------------------------------------------------
export async function submitDeliverable(
  db: D1Database,
  enrollmentId: number,
  teacherId: number,
  title: string,
  body: string,
  env?: Bindings
) {
  const e = await db.prepare(`SELECT * FROM pd_enrollments WHERE id = ? AND teacher_id = ?`)
    .bind(enrollmentId, teacherId).first<any>();
  if (!e) throw new Error('not found');
  await db.prepare(
    `INSERT INTO pd_deliverables (enrollment_id, title, body)
     VALUES (?, ?, ?)
     ON CONFLICT(enrollment_id) DO UPDATE SET title = excluded.title, body = excluded.body, updated_at = CURRENT_TIMESTAMP`
  ).bind(enrollmentId, title, body).run();
  await db.prepare(
    `UPDATE pd_enrollments SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(enrollmentId).run();
  if (!env) return;

  // Notify every appraiser and coach currently linked to this teacher
  const supers = await db.prepare(
    `SELECT DISTINCT a.staff_id AS uid
       FROM assignments a
       JOIN users u ON u.id = a.staff_id
       WHERE a.teacher_id = ? AND a.active = 1 AND u.active = 1 AND u.role IN ('appraiser','coach')`
  ).bind(teacherId).all();
  const uids = ((supers.results as any[]) || []).map((r) => r.uid);
  const mod = await db.prepare(
    `SELECT m.title FROM pd_enrollments e JOIN pd_modules m ON m.id = e.module_id WHERE e.id = ?`
  ).bind(enrollmentId).first<any>();
  const teacher = await db.prepare(`SELECT first_name, last_name FROM users WHERE id = ?`).bind(teacherId).first<any>();
  for (const uid of uids) {
    await notify(db, {
      user_id: uid,
      kind: 'pd_deliverable_submitted',
      title: 'PD deliverable submitted',
      body: `${teacher?.first_name || ''} ${teacher?.last_name || ''} submitted a deliverable for "${mod?.title || 'a PD module'}".`,
      url: `/appraiser/pd/review/${enrollmentId}`,
      entity_type: 'pd_enrollment', entity_id: enrollmentId, actor_user_id: teacherId,
    }, env);
  }
}

// --------------------------------------------------------------------------
// Supervisor verification — marks the enrollment done or sends it back.
// --------------------------------------------------------------------------
export async function verifyDeliverable(
  db: D1Database,
  enrollmentId: number,
  verifierId: number,
  ok: boolean,
  note?: string | null,
  env?: Bindings
) {
  const e = await db.prepare(`SELECT * FROM pd_enrollments WHERE id = ?`).bind(enrollmentId).first<any>();
  if (!e) throw new Error('not found');
  if (e.status !== 'submitted' && e.status !== 'needs_revision') throw new Error('not submitted');

  if (ok) {
    await db.prepare(
      `UPDATE pd_enrollments SET status = 'verified', verified_at = CURRENT_TIMESTAMP, verified_by = ?, verification_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(verifierId, note || null, enrollmentId).run();
    if (env) {
      await notify(db, {
        user_id: e.teacher_id, kind: 'pd_deliverable_verified',
        title: 'PD deliverable verified',
        body: note ? `Nice work — your supervisor noted: "${note}"` : 'Your supervisor marked your deliverable complete.',
        url: `/teacher/pd/${enrollmentId}`,
        entity_type: 'pd_enrollment', entity_id: enrollmentId, actor_user_id: verifierId,
      }, env);
    }
  } else {
    await db.prepare(
      `UPDATE pd_enrollments SET status = 'needs_revision', verification_note = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(note || null, enrollmentId).run();
    if (env) {
      await notify(db, {
        user_id: e.teacher_id, kind: 'pd_deliverable_revision',
        title: 'Deliverable needs revision',
        body: note || 'Your supervisor asked for another pass before verifying.',
        url: `/teacher/pd/${enrollmentId}`,
        entity_type: 'pd_enrollment', entity_id: enrollmentId, actor_user_id: verifierId,
      }, env);
    }
  }
}

// --------------------------------------------------------------------------
// Helpers for the teacher dashboard
// --------------------------------------------------------------------------

export async function teacherEnrollments(db: D1Database, teacherId: number) {
  const r = await db.prepare(
    `SELECT e.*, m.title AS module_title, m.subtitle AS module_subtitle,
            m.est_minutes, m.target_level, m.indicator_id,
            i.code AS indicator_code, i.name AS indicator_name,
            d.code AS domain_code, d.name AS domain_name,
            de.title AS deliverable_title
       FROM pd_enrollments e
       JOIN pd_modules m ON m.id = e.module_id
       JOIN framework_indicators i ON i.id = m.indicator_id
       JOIN framework_domains d ON d.id = i.domain_id
       LEFT JOIN pd_deliverables de ON de.enrollment_id = e.id
       WHERE e.teacher_id = ?
       ORDER BY
         CASE e.status
           WHEN 'needs_revision' THEN 0
           WHEN 'recommended'    THEN 1
           WHEN 'started'        THEN 2
           WHEN 'learn_done'     THEN 3
           WHEN 'practice_done'  THEN 4
           WHEN 'submitted'      THEN 5
           WHEN 'verified'       THEN 6
           WHEN 'declined'       THEN 7
         END,
         e.created_at DESC`
  ).bind(teacherId).all();
  return (r.results as any[]) || [];
}

export async function getEnrollment(db: D1Database, id: number) {
  // IMPORTANT: explicit column list — never use `e.*, m.*` together because
  // both tables have an `id` column and the duplicate-named column in D1/SQLite
  // collapses to the last one (module id), which silently broke every form
  // that points at /teacher/pd/{e.id}/advance.
  return db.prepare(
    `SELECT
        e.id                         AS id,
        e.teacher_id                 AS teacher_id,
        e.module_id                  AS module_id,
        e.source                     AS source,
        e.source_observation_id      AS source_observation_id,
        e.source_score_level         AS source_score_level,
        e.assigned_by                AS assigned_by,
        e.status                     AS status,
        e.learn_done_at              AS learn_done_at,
        e.practice_done_at           AS practice_done_at,
        e.submitted_at               AS submitted_at,
        e.verified_at                AS verified_at,
        e.declined_at                AS declined_at,
        e.verified_by                AS verified_by,
        e.verification_note          AS verification_note,
        e.decline_reason             AS decline_reason,
        e.created_at                 AS created_at,
        e.updated_at                 AS updated_at,
        m.id                         AS module_ref_id,
        m.indicator_id               AS indicator_id,
        m.target_level               AS target_level,
        m.title                      AS title,
        m.subtitle                   AS subtitle,
        m.est_minutes                AS est_minutes,
        m.research_basis             AS research_basis,
        m.learn_content              AS learn_content,
        m.practice_content           AS practice_content,
        m.apply_content              AS apply_content,
        m.deliverable_prompt         AS deliverable_prompt,
        m.deliverable_rubric         AS deliverable_rubric,
        m.resources                  AS resources,
        i.code                       AS indicator_code,
        i.name                       AS indicator_name,
        d.code                       AS domain_code,
        d.name                       AS domain_name,
        fr.name                      AS framework_name,
        de.title                     AS deliverable_title,
        de.body                      AS deliverable_body,
        de.updated_at                AS deliverable_updated,
        -- Pedagogy library rows for CURRENT and TARGET levels (JSON text),
        -- used to render interactive checklists / move-menus in the module
        -- workspace without the teacher having to re-read the bullet text.
        pl_cur.interpretation        AS cur_interpretation,
        pl_cur.evidence_signals      AS cur_evidence_signals,
        pl_cur.teacher_next_moves    AS cur_teacher_next_moves,
        pl_cur.coaching_considerations AS cur_coaching_considerations,
        pl_tgt.interpretation        AS tgt_interpretation,
        pl_tgt.evidence_signals      AS tgt_evidence_signals,
        pl_tgt.teacher_next_moves    AS tgt_teacher_next_moves,
        pl_tgt.coaching_considerations AS tgt_coaching_considerations,
        pl_tgt.resources             AS tgt_resources
       FROM pd_enrollments e
       JOIN pd_modules m ON m.id = e.module_id
       JOIN framework_indicators i ON i.id = m.indicator_id
       JOIN framework_domains d ON d.id = i.domain_id
       LEFT JOIN frameworks fr ON fr.id = (SELECT id FROM frameworks WHERE is_active = 1 LIMIT 1)
       LEFT JOIN pd_deliverables de ON de.enrollment_id = e.id
       LEFT JOIN pedagogy_library pl_cur ON pl_cur.indicator_id = m.indicator_id AND pl_cur.level = m.target_level
       LEFT JOIN pedagogy_library pl_tgt ON pl_tgt.indicator_id = m.indicator_id AND pl_tgt.level = m.target_level + 1
       WHERE e.id = ?`
  ).bind(id).first<any>();
}

export async function getReflections(db: D1Database, enrollmentId: number) {
  const r = await db.prepare(
    `SELECT phase, body, created_at FROM pd_reflections WHERE enrollment_id = ? ORDER BY phase`
  ).bind(enrollmentId).all();
  return (r.results as any[]) || [];
}

export async function saveReflection(db: D1Database, enrollmentId: number, phase: 'learn'|'practice'|'apply', body: string) {
  await db.prepare(
    `INSERT INTO pd_reflections (enrollment_id, phase, body)
     VALUES (?, ?, ?)
     ON CONFLICT(enrollment_id, phase) DO UPDATE SET body = excluded.body, created_at = CURRENT_TIMESTAMP`
  ).bind(enrollmentId, phase, body).run();
}

export function statusPill(s: string) {
  switch (s) {
    case 'recommended':    return { color: 'bg-amber-50 border-amber-200 text-amber-800',     label: 'Recommended',   icon: 'fa-star' };
    case 'started':        return { color: 'bg-sky-50 border-sky-200 text-sky-800',           label: 'Started',       icon: 'fa-play' };
    case 'learn_done':     return { color: 'bg-sky-50 border-sky-200 text-sky-800',           label: 'Learn done',    icon: 'fa-book-open' };
    case 'practice_done':  return { color: 'bg-indigo-50 border-indigo-200 text-indigo-800',  label: 'Practice done', icon: 'fa-dumbbell' };
    case 'submitted':      return { color: 'bg-violet-50 border-violet-200 text-violet-800',  label: 'Submitted',     icon: 'fa-inbox' };
    case 'verified':       return { color: 'bg-emerald-50 border-emerald-200 text-emerald-800', label: 'Verified',    icon: 'fa-circle-check' };
    case 'needs_revision': return { color: 'bg-rose-50 border-rose-200 text-rose-800',        label: 'Needs revision',icon: 'fa-rotate-left' };
    case 'declined':       return { color: 'bg-slate-50 border-slate-200 text-slate-600',     label: 'Declined',      icon: 'fa-xmark' };
    default:               return { color: 'bg-slate-50 border-slate-200 text-slate-600',     label: s,               icon: 'fa-circle' };
  }
}

export function phaseLabel(p: string) {
  return p === 'learn' ? 'Learn' : p === 'practice' ? 'Practice' : 'Apply';
}
