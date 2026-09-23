/**
 * Centralized access-capability helpers.
 *
 * Sept 23, 2026 (Section 2 of the Aaron caseload change).  We now have two
 * *sources* of coaching capability:
 *
 *   1. role='coach'          — the historical Michelle Simonson case
 *   2. can_coach=1           — a teacher (Miranda Quale, Tristae Allard) who
 *                              retains their teaching role but has been
 *                              granted the coaching capability additively.
 *
 * Every place in the codebase that used to check `user.role === 'coach'` to
 * gate "may this person do coach things?" must instead call `hasCoachAccess`.
 * NOTHING should ever check `role === 'coach' || can_coach` inline — that path
 * has already caused subtle bugs elsewhere.  If you find yourself reading
 * both flags at a call site, delete that logic and call this helper instead.
 *
 * Route middleware (`requireRole`) still uses `role` because a super_admin or
 * admin acting on behalf of coaching is a different concept from being a
 * coach yourself.  We layer this helper on top: `requireRole` bounds the
 * outer surface; `hasCoachAccess` decides whether the *coaching-specific*
 * branch inside a handler applies.
 */

import type { User } from './types';

/**
 * True iff `user` may perform coaching actions somewhere in the system.
 * Does NOT check whether they're assigned to any particular teacher — that
 * check is per-action and lives next to the query that reads/writes the
 * teacher's data (see `requireCoachAssignment`).
 */
export function hasCoachAccess(user: User | null | undefined): boolean {
  if (!user) return false;
  if (!user.active) return false;
  if (user.role === 'super_admin') return true; // super_admin sees everything
  if (user.role === 'coach') return true;
  if (user.role === 'teacher' && user.can_coach === 1) return true;
  return false;
}

/**
 * True iff `user` is a coach specifically via the additive teacher-coach
 * capability (i.e. Miranda / Tristae).  Used by nav/UI to render BOTH the
 * "My teaching" and "My coaching" affordances at the same time.
 * Pure coaches (Michelle) don't need the split — their role already implies
 * the coaching workspace.
 */
export function isTeacherCoach(user: User | null | undefined): boolean {
  if (!user) return false;
  return user.active === 1 && user.role === 'teacher' && user.can_coach === 1;
}

/**
 * Server-side gate for a coaching action against a specific teacher.
 * Returns true iff:
 *   - user has coach access at all (hasCoachAccess), AND
 *   - there is an ACTIVE assignments row with relationship='coach'
 *     linking user to that teacher, OR user is super_admin.
 *
 * NEVER short-circuits on role alone.  A user without a coach assignment
 * for THAT teacher is refused even if they coach 20 other teachers.
 * NEVER allows self-coaching (guarded here in addition to the DB CHECK).
 */
export async function requireCoachAssignment(
  db: D1Database,
  user: User,
  teacherId: number,
): Promise<boolean> {
  if (!hasCoachAccess(user)) return false;
  if (user.role === 'super_admin') return true;
  if (user.id === teacherId) return false; // no self-coaching
  const hit = await db
    .prepare(
      `SELECT 1
         FROM assignments
        WHERE staff_id = ?
          AND teacher_id = ?
          AND relationship = 'coach'
          AND active = 1
        LIMIT 1`,
    )
    .bind(user.id, teacherId)
    .first();
  return !!hit;
}
