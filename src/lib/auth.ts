import bcrypt from 'bcryptjs';
import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Bindings, User, UserRole, Variables } from './types';

const SESSION_COOKIE = 'aps_session';
const SESSION_DAYS = 30;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}
export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try { return await bcrypt.compare(plain, hash); } catch { return false; }
}

function randomToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function createSession(c: Context<{ Bindings: Bindings }>, userId: number): Promise<string> {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
  const ua = c.req.header('user-agent') || '';
  const ip = c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || '';
  await c.env.DB.prepare(
    `INSERT INTO sessions (id, user_id, expires_at, ip, user_agent) VALUES (?, ?, ?, ?, ?)`
  ).bind(token, userId, expires, ip, ua).run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
  return token;
}

export async function getCurrentUser(c: Context<{ Bindings: Bindings; Variables: Variables }>): Promise<User | null> {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  const row = await c.env.DB.prepare(
    `SELECT u.* FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.active = 1`
  ).bind(token).first<User>();
  return row || null;
}

export async function destroySession(c: Context<{ Bindings: Bindings }>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    await c.env.DB.prepare(`DELETE FROM sessions WHERE id = ?`).bind(token).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export function requireRole(roles: UserRole[]) {
  return async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: () => Promise<void>) => {
    const user = await getCurrentUser(c);
    if (!user) return c.redirect('/login');
    if (!roles.includes(user.role)) return c.text('Forbidden', 403);
    c.set('user', user);
    await next();
  };
}

export function requireAuth() {
  return async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: () => Promise<void>) => {
    const user = await getCurrentUser(c);
    if (!user) return c.redirect('/login');
    c.set('user', user);
    await next();
  };
}
