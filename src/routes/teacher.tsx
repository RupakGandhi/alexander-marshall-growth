import { Hono } from 'hono';
import type { Bindings, Variables } from '../lib/types';
import { Layout, Card, Button } from '../lib/layout';
import { requireRole } from '../lib/auth';
import { getTeacherSummary, getObservation, logActivity } from '../lib/db';
import { levelColor, levelLabels, formatDate, formatDateTime, statusBadge, statusLabel, escapeHtml } from '../lib/ui';

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
app.use('*', requireRole(['teacher']));

app.get('/', async (c) => {
  const user = c.get('user')!;
  const welcome = c.req.query('welcome') === '1';
  const summary = await getTeacherSummary(c.env.DB, user.id);
  return c.html(<TeacherHome user={user} summary={summary} welcome={welcome} />);
});

app.get('/observations', async (c) => {
  const user = c.get('user')!;
  const summary = await getTeacherSummary(c.env.DB, user.id);
  return c.html(<TeacherObservations user={user} summary={summary} />);
});

app.get('/observations/:id', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const o = await getObservation(c.env.DB, id);
  if (!o || o.teacher_id !== user.id) return c.text('Not found', 404);
  if (o.status !== 'published' && o.status !== 'acknowledged') return c.text('This observation has not been published yet.', 403);
  const msg = c.req.query('msg');
  return c.html(<TeacherObservationView user={user} o={o} msg={msg} />);
});

app.post('/observations/:id/acknowledge', async (c) => {
  const user = c.get('user')!;
  const id = Number(c.req.param('id'));
  const o = await c.env.DB.prepare('SELECT * FROM observations WHERE id = ? AND teacher_id = ?').bind(id, user.id).first<any>();
  if (!o) return c.text('Not found', 404);
  if (o.status !== 'published') return c.redirect(`/teacher/observations/${id}`);
  const body = await c.req.parseBody();
  const sig = String(body.signature || '');
  const response = String(body.response || '').trim() || null;
  if (!sig || !sig.startsWith('data:image/')) return c.redirect(`/teacher/observations/${id}?msg=Signature+required`);
  await c.env.DB.prepare(
    `UPDATE observations SET status = 'acknowledged', teacher_acknowledged_at = CURRENT_TIMESTAMP,
     teacher_signature_data = ?, teacher_response = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(sig, response, id).run();
  await logActivity(c.env.DB, user.id, 'observation', id, 'acknowledge');
  return c.redirect(`/teacher/observations/${id}?msg=Acknowledged`);
});

app.get('/focus', async (c) => {
  const user = c.get('user')!;
  const summary = await getTeacherSummary(c.env.DB, user.id);
  return c.html(<TeacherFocus user={user} summary={summary} />);
});

export default app;

// ---------------------------- VIEWS ----------------------------

function TeacherHome({ user, summary, welcome }: any) {
  if (!summary) return <Layout title="Dashboard" user={user}><p>No teacher record found.</p></Layout>;
  const { observations, focusAreas } = summary;
  const recent = observations.filter((o: any) => o.status === 'published' || o.status === 'acknowledged').slice(0, 5);
  const awaiting = observations.filter((o: any) => o.status === 'published').length;
  return (
    <Layout title="Dashboard" user={user} activeNav="t-home" autoLaunchTour={!!welcome}>
      <div class="mb-6">
        <h1 class="font-display text-2xl text-aps-navy">Welcome, {user.first_name}</h1>
        <p class="text-slate-600 text-sm">Your personal growth dashboard · {user.title || ''}</p>
      </div>

      {awaiting > 0 && (
        <div class="mb-6 p-4 rounded-md bg-amber-50 border border-amber-200 flex items-center justify-between">
          <div><i class="fas fa-bell mr-2 text-amber-700"></i><span class="text-amber-900">You have <strong>{awaiting}</strong> observation{awaiting>1?'s':''} awaiting your review and acknowledgement.</span></div>
          <Button href="/teacher/observations" variant="primary">Review</Button>
        </div>
      )}

      <div class="grid md:grid-cols-3 gap-4 mb-6" data-tour="t-summary">
        <Card title="Active Focus Areas" icon="fas fa-bullseye">
          <div class="text-3xl font-display text-aps-navy">{focusAreas.length}</div>
          <a href="/teacher/focus" class="text-sm text-aps-blue hover:underline">View all →</a>
        </Card>
        <Card title="Published Observations" icon="fas fa-clipboard-check">
          <div class="text-3xl font-display text-aps-navy">{observations.filter((o:any)=>o.status==='published'||o.status==='acknowledged').length}</div>
          <a href="/teacher/observations" class="text-sm text-aps-blue hover:underline">View all →</a>
        </Card>
        <Card title="Current School Year" icon="fas fa-calendar">
          <div class="text-3xl font-display text-aps-navy">2025-2026</div>
          <div class="text-sm text-slate-500">Alexander Public Schools</div>
        </Card>
      </div>

      <div class="grid md:grid-cols-2 gap-6">
        <Card title="Active Focus Areas" icon="fas fa-bullseye">
          {focusAreas.length === 0 ? <p class="text-slate-500 text-sm">No active focus areas.</p> :
            <ul class="space-y-3">
              {focusAreas.map((f: any) => (
                <li class="border border-slate-200 rounded-md p-3">
                  <div class="text-xs text-slate-500">{f.domain_code && `${f.domain_code}.${f.indicator_code} · ${f.indicator_name}`}</div>
                  <div class="font-medium text-aps-navy">{f.title}</div>
                  {f.description && <div class="text-sm text-slate-600 mt-1">{f.description}</div>}
                  <div class="text-xs text-slate-400 mt-1">Opened {formatDate(f.opened_at)}</div>
                </li>
              ))}
            </ul>
          }
        </Card>
        <Card title="Recent Published Observations" icon="fas fa-clock-rotate-left">
          {recent.length === 0 ? <p class="text-slate-500 text-sm">No published observations yet.</p> :
            <ul class="space-y-2">
              {recent.map((o: any) => (
                <li class="flex items-center justify-between border border-slate-200 rounded-md p-3">
                  <div>
                    <div class="font-medium text-aps-navy">{o.observation_type === 'mini' ? 'Mini-Observation' : (o.observation_type === 'formal' ? 'Formal Observation' : 'Annual Summary')}</div>
                    <div class="text-xs text-slate-500">{formatDate(o.observed_at)} · {o.app_first} {o.app_last}</div>
                  </div>
                  <div class="flex items-center gap-2">
                    <span class={`px-2 py-0.5 rounded-full text-xs border ${statusBadge(o.status)}`}>{statusLabel(o.status)}</span>
                    <a href={`/teacher/observations/${o.id}`} class="text-sm text-aps-blue hover:underline">View</a>
                  </div>
                </li>
              ))}
            </ul>
          }
        </Card>
      </div>
    </Layout>
  );
}

function TeacherObservations({ user, summary }: any) {
  const list = summary.observations.filter((o: any) => o.status === 'published' || o.status === 'acknowledged');
  return (
    <Layout title="Observations" user={user} activeNav="t-obs">
      <h1 class="font-display text-2xl text-aps-navy mb-4">My Observations</h1>
      <Card data-tour="t-obs-list">
        {list.length === 0 ? <p class="text-slate-500 text-sm">No published observations yet.</p> :
          <div class="overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5"><table class="w-full text-sm">
            <thead><tr class="text-left border-b border-slate-200 text-slate-600">
              <th class="py-2">Date</th><th>Type</th><th>Subject / Context</th><th>Appraiser</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>
              {list.map((o: any) => (
                <tr class="border-b border-slate-100">
                  <td class="py-2">{formatDate(o.observed_at)}</td>
                  <td>{o.observation_type}</td>
                  <td>{o.subject || o.class_context || '—'}</td>
                  <td>{o.app_first} {o.app_last}</td>
                  <td><span class={`px-2 py-0.5 rounded-full text-xs border ${statusBadge(o.status)}`}>{statusLabel(o.status)}</span></td>
                  <td><a href={`/teacher/observations/${o.id}`} class="text-aps-blue hover:underline">Open →</a></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        }
      </Card>
    </Layout>
  );
}

function TeacherObservationView({ user, o, msg }: any) {
  const scores: any[] = o.scores || [];
  const feedback: any[] = o.feedback || [];
  const glows = feedback.filter((f) => f.category === 'glow');
  const grows = feedback.filter((f) => f.category === 'grow');
  const focus = feedback.filter((f) => f.category === 'focus_area');
  const next = feedback.filter((f) => f.category === 'next_step');
  return (
    <Layout title="Observation" user={user} activeNav="t-obs">
      {msg && <div class="mb-4 p-3 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">{msg}</div>}
      <div class="mb-4">
        <a href="/teacher/observations" class="text-sm text-aps-blue hover:underline"><i class="fas fa-arrow-left mr-1"></i>Back</a>
      </div>
      <div class="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 class="font-display text-2xl text-aps-navy">
            {o.observation_type === 'mini' ? 'Mini-Observation' : o.observation_type === 'formal' ? 'Formal Observation' : 'Annual Summary'}
          </h1>
          <p class="text-slate-600 text-sm">{formatDateTime(o.observed_at)} · Observed by {o.a_first} {o.a_last} ({o.a_title || 'Appraiser'})</p>
          {o.class_context && <p class="text-sm text-slate-600">Context: {o.class_context}</p>}
        </div>
        <span class={`px-2 py-0.5 rounded-full text-xs border ${statusBadge(o.status)}`}>{statusLabel(o.status)}</span>
      </div>

      {o.overall_summary && (
        <Card title="Overall Summary from your Appraiser" icon="fas fa-message">
          <p class="whitespace-pre-wrap text-slate-700">{o.overall_summary}</p>
        </Card>
      )}

      <div class="grid md:grid-cols-2 gap-4 mt-4">
        {glows.length > 0 && (
          <Card title="Strengths" icon="fas fa-star" class="border-emerald-200">
            <ul class="space-y-2">{glows.map((f) => <li class="text-sm"><span class="font-medium">{f.title || 'Strength'}</span><div class="whitespace-pre-wrap text-slate-700">{f.body}</div></li>)}</ul>
          </Card>
        )}
        {grows.length > 0 && (
          <Card title="Growth Areas" icon="fas fa-seedling" class="border-sky-200">
            <ul class="space-y-2">{grows.map((f) => <li class="text-sm"><span class="font-medium">{f.title || 'Growth area'}</span><div class="whitespace-pre-wrap text-slate-700">{f.body}</div></li>)}</ul>
          </Card>
        )}
        {next.length > 0 && (
          <Card title="Suggested Next Steps" icon="fas fa-forward" class="border-aps-sky">
            <ul class="space-y-2">{next.map((f) => <li class="text-sm"><div class="whitespace-pre-wrap text-slate-700">{f.body}</div></li>)}</ul>
          </Card>
        )}
        {focus.length > 0 && (
          <Card title="Focus Areas" icon="fas fa-bullseye" class="border-aps-gold">
            <ul class="space-y-2">{focus.map((f) => <li class="text-sm"><span class="font-medium">{f.title}</span><div class="whitespace-pre-wrap text-slate-700">{f.body}</div></li>)}</ul>
          </Card>
        )}
      </div>

      {scores.length > 0 && (
        <Card title="Rubric Scores" icon="fas fa-table-list" class="mt-4">
          <div class="overflow-x-auto -mx-3 sm:-mx-5 px-3 sm:px-5"><table class="w-full text-sm">
            <thead><tr class="text-left border-b border-slate-200 text-slate-600"><th class="py-2">Domain</th><th>Indicator</th><th>Rating</th><th>Evidence Note</th></tr></thead>
            <tbody>
              {scores.map((s) => (
                <tr class="border-b border-slate-100">
                  <td class="py-2">{s.domain_code}. {s.domain_name}</td>
                  <td>{s.indicator_code}. {s.indicator_name}</td>
                  <td>{s.level ? <span class={`px-2 py-0.5 rounded-full text-xs border ${levelColor[s.level]}`}>{s.level} · {levelLabels[s.level]}</span> : <span class="text-slate-400">Not scored</span>}</td>
                  <td class="text-slate-700">{s.evidence_note || ''}</td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </Card>
      )}

      <Card title="Signatures" icon="fas fa-signature" class="mt-4">
        <div class="grid md:grid-cols-2 gap-6">
          <div>
            <div class="text-sm font-medium text-slate-700">Appraiser</div>
            {o.appraiser_signature_data
              ? <img src={o.appraiser_signature_data} alt="appraiser signature" class="border border-slate-200 rounded mt-2 max-h-32" />
              : <div class="text-sm text-slate-400 mt-1">Not signed.</div>}
            <div class="text-xs text-slate-500 mt-1">Signed {formatDateTime(o.appraiser_signed_at)} · {o.a_first} {o.a_last}</div>
          </div>
          <div>
            <div class="text-sm font-medium text-slate-700">Teacher acknowledgement</div>
            {o.teacher_signature_data
              ? <>
                  <img src={o.teacher_signature_data} alt="teacher signature" class="border border-slate-200 rounded mt-2 max-h-32" />
                  <div class="text-xs text-slate-500 mt-1">Acknowledged {formatDateTime(o.teacher_acknowledged_at)}</div>
                  {o.teacher_response && <div class="text-sm text-slate-700 mt-2 italic">Your comment: "{o.teacher_response}"</div>}
                </>
              : <AcknowledgeForm o={o} />
            }
          </div>
        </div>
      </Card>
    </Layout>
  );
}

function AcknowledgeForm({ o }: any) {
  return (
    <form method="post" action={`/teacher/observations/${o.id}/acknowledge`} class="mt-2 space-y-2" id="ack-form">
      <div class="text-xs text-slate-500 mb-1">Your signature indicates you have seen and discussed this observation. It does not necessarily denote agreement.</div>
      <canvas id="sig-pad" class="border border-slate-300 rounded w-full h-32 bg-white touch-none"></canvas>
      <input type="hidden" name="signature" id="sig-data" />
      <div class="flex items-center gap-2">
        <button type="button" onclick="window.SigPad.clear('sig-pad','sig-data')" class="text-sm text-slate-600 hover:underline"><i class="fas fa-eraser"></i> Clear</button>
      </div>
      <label class="block">
        <span class="block text-sm font-medium text-slate-700 mb-1">Optional teacher response</span>
        <textarea name="response" rows={3} class="w-full border border-slate-300 rounded-md px-3 py-2" placeholder="Any comment you want on record (optional)"></textarea>
      </label>
      <button type="submit" onclick="return window.SigPad.submit('sig-pad','sig-data')" class="bg-aps-navy text-white px-4 py-2 rounded-md text-sm hover:bg-aps-blue"><i class="fas fa-signature mr-1"></i>Sign &amp; Acknowledge</button>
    </form>
  );
}

function TeacherFocus({ user, summary }: any) {
  const { focusAreas, observations } = summary;
  return (
    <Layout title="Focus Areas" user={user} activeNav="t-focus">
      <h1 class="font-display text-2xl text-aps-navy mb-4" data-tour="t-focus">Focus Areas</h1>
      <Card>
        {focusAreas.length === 0 ? <p class="text-slate-500 text-sm">No active focus areas. Your appraiser will add these as you work together.</p> :
          <ul class="space-y-3">
            {focusAreas.map((f: any) => (
              <li class="border border-slate-200 rounded-md p-4">
                <div class="text-xs text-slate-500">{f.domain_code && `Domain ${f.domain_code} · ${f.indicator_code?.toUpperCase()}. ${f.indicator_name}`}</div>
                <div class="font-medium text-aps-navy text-lg">{f.title}</div>
                {f.description && <div class="text-sm text-slate-700 mt-1 whitespace-pre-wrap">{f.description}</div>}
                <div class="text-xs text-slate-400 mt-2">Opened {formatDate(f.opened_at)}</div>
              </li>
            ))}
          </ul>
        }
      </Card>
    </Layout>
  );
}
