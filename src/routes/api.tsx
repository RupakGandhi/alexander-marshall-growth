import { Hono } from 'hono';
import type { Bindings, Variables } from '../lib/types';
import { requireAuth } from '../lib/auth';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use('*', requireAuth());

// Pedagogy preview for appraiser UI (auto-suggest)
app.get('/pedagogy/:indicatorId/:level', async (c) => {
  const indicatorId = Number(c.req.param('indicatorId'));
  const level = Number(c.req.param('level'));
  const entry = await c.env.DB.prepare(
    `SELECT * FROM pedagogy_library WHERE indicator_id=? AND level=?`
  ).bind(indicatorId, level).first<any>();
  if (!entry) return c.json({ ok: false });
  return c.json({
    ok: true,
    interpretation: entry.interpretation,
    feedback_starter: entry.feedback_starter,
    evidence_signals: safeParse(entry.evidence_signals, []),
    teacher_next_moves: safeParse(entry.teacher_next_moves, []),
    coaching_considerations: safeParse(entry.coaching_considerations, []),
    resources: safeParse(entry.resources, []),
  });
});

function safeParse<T>(v: any, fb: T): T {
  if (!v) return fb;
  try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return fb; }
}

export default app;
