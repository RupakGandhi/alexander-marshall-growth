// Environment / Cloudflare bindings
export type Bindings = {
  DB: D1Database;
  SESSION_SECRET: string;
};

export type UserRole = 'super_admin' | 'superintendent' | 'appraiser' | 'coach' | 'teacher';

export interface User {
  id: number;
  district_id: number;
  school_id: number | null;
  email: string;
  first_name: string;
  last_name: string;
  role: UserRole;
  title: string | null;
  phone: string | null;
  avatar_url: string | null;
  active: number;
  must_change_password: number;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
  // June 2, 2026 — Fix 11: classroom context for context-aware auto-feedback.
  // All three are optional/backward-compatible. NULL columns are treated as
  // "no context provided" by the feedback generator.
  subject_area?: string | null;       // e.g. "Mathematics", "ELA", "Self-contained Elementary"
  classroom_type?: string | null;     // e.g. "self_contained", "departmentalized", "specials", "intervention"
  grade_band?: string | null;         // e.g. "K-2", "3-5", "6-8", "9-12"
  // Sept 23, 2026 — Section 2 of the Aaron-caseload change.  A teacher with
  // can_coach=1 gets the same coach *capability* as a role='coach' user WITHOUT
  // losing their teacher role, records, or personal workspace.  Default 0
  // (added in migration 0012).  role='coach' users don't need this flag —
  // their role already grants coaching.  Prefer `hasCoachAccess(user)` over
  // reading either the role or this flag directly at call sites.
  can_coach?: number;
}

export type Variables = {
  user: User | null;
};
