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
}

export type Variables = {
  user: User | null;
};
