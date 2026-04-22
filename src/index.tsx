import { Hono } from 'hono';
import { logger } from 'hono/logger';
import type { Bindings, Variables } from './lib/types';
import { getCurrentUser } from './lib/auth';
import { roleHomeUrl } from './lib/layout';

import authRoutes from './routes/auth';
import profileRoutes from './routes/profile';
import teacherRoutes from './routes/teacher';
import appraiserRoutes from './routes/appraiser';
import coachRoutes from './routes/coach';
import superintendentRoutes from './routes/superintendent';
import adminRoutes from './routes/admin';
import apiRoutes from './routes/api';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

app.use('*', logger());

// Public landing: redirect to role home if logged in; else login page
app.get('/', async (c) => {
  const user = await getCurrentUser(c);
  if (user) return c.redirect(roleHomeUrl(user.role));
  return c.redirect('/login');
});

app.route('/', authRoutes);
app.route('/profile', profileRoutes);
app.route('/teacher', teacherRoutes);
app.route('/appraiser', appraiserRoutes);
app.route('/coach', coachRoutes);
app.route('/superintendent', superintendentRoutes);
app.route('/admin', adminRoutes);
app.route('/api', apiRoutes);

// Health
app.get('/health', (c) => c.json({ ok: true, time: new Date().toISOString() }));

export default app;
