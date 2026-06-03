// ============================================================================
// pd_hours_export.tsx — Shared CSV + printable exports for the PD-hours
// heat-map widget. Used by both /superintendent/pd-hours and
// /appraiser/pd-hours so the on-screen numbers and the export numbers come
// from the same render path (getTeacherPDHoursSummary).
//
// Added June 3, 2026 in response to the pre-launch verification report which
// flagged that the heat-map widget showed totals but had no download/print
// affordance. Tester quote: "no export buttons (PDF/CSV) were found on the
// widget; only a PWA installation button was available."
// ============================================================================

import { buildCsv } from './csv';

export type PdHoursSummary = {
  target: number;
  rows: Array<{
    teacher_id: number;
    first_name: string;
    last_name: string;
    school_name?: string | null;
    internal_hours: number;
    external_hours: number;
    total_hours: number;
    pct_of_target: number;
    heat: 'low' | 'mid' | 'near' | 'met';
  }>;
};

const HEAT_LABEL: Record<string, string> = {
  met:  'Met target',
  near: 'Near target',
  mid:  'In progress',
  low:  'Behind target',
};

export function buildPdHoursCsv(pdHours: PdHoursSummary): string {
  const target = Number(pdHours.target || 0);
  const headers = [
    'Last name',
    'First name',
    'School',
    'Internal hours',
    'External hours',
    'Total hours',
    'Target hours',
    'Percent of target',
    'Heat tier',
  ];
  const rows = (pdHours.rows || []).map((r) => {
    const total = Number(r.total_hours || 0);
    const pct = Math.round(Number(r.pct_of_target || 0) * 1000) / 10; // one decimal
    return [
      r.last_name || '',
      r.first_name || '',
      r.school_name || '',
      Number(r.internal_hours || 0).toFixed(2),
      Number(r.external_hours || 0).toFixed(2),
      total.toFixed(2),
      target.toFixed(2),
      `${pct.toFixed(1)}%`,
      HEAT_LABEL[r.heat] || r.heat,
    ];
  });
  return buildCsv(headers, rows);
}

export function renderPdHoursPrint(props: {
  scopeLabel: string;
  user: { first_name?: string; last_name?: string; role?: string };
  pdHours: PdHoursSummary;
}): string {
  const { scopeLabel, user, pdHours } = props;
  const target = Number(pdHours.target || 0);
  const rows = pdHours.rows || [];
  const totals = rows.reduce(
    (acc, r) => {
      acc.internal += Number(r.internal_hours || 0);
      acc.external += Number(r.external_hours || 0);
      acc.total    += Number(r.total_hours || 0);
      if (r.heat === 'met') acc.met += 1;
      return acc;
    },
    { internal: 0, external: 0, total: 0, met: 0 }
  );
  const groupCount: Record<string, number> = { low: 0, mid: 0, near: 0, met: 0 };
  for (const r of rows) groupCount[r.heat] = (groupCount[r.heat] || 0) + 1;

  const escape = (s: any) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const stamp = new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' });

  const rowsHtml = rows.map((r) => {
    const pct = Math.min(1, Math.max(0, Number(r.pct_of_target || 0)));
    const heatLabel = HEAT_LABEL[r.heat] || r.heat;
    const heatBg = r.heat === 'met' ? '#d1fae5' : r.heat === 'near' ? '#dbeafe' : r.heat === 'mid' ? '#fef3c7' : '#fee2e2';
    return `
      <tr>
        <td>${escape(r.last_name)}, ${escape(r.first_name)}</td>
        <td>${escape(r.school_name || '')}</td>
        <td class="num">${Number(r.internal_hours || 0).toFixed(2)}h</td>
        <td class="num">${Number(r.external_hours || 0).toFixed(2)}h</td>
        <td class="num"><strong>${Number(r.total_hours || 0).toFixed(2)}h</strong></td>
        <td class="num">${(pct * 100).toFixed(0)}%</td>
        <td style="background:${heatBg}">${escape(heatLabel)}</td>
      </tr>
    `;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>PD Hours Heat-Map — ${escape(scopeLabel)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #0f172a; margin: 0; padding: 2rem; }
  h1 { font-size: 22px; margin: 0 0 4px; color: #0c2340; }
  .meta { color: #64748b; font-size: 12px; margin-bottom: 16px; }
  .summary { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 16px; }
  .summary div { border: 1px solid #cbd5e1; border-radius: 6px; padding: 8px; text-align: center; }
  .summary .n { font-size: 20px; font-weight: bold; color: #0c2340; }
  .summary .l { font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; color: #475569; }
  .totals { font-size: 13px; color: #334155; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; }
  th, td { padding: 6px 8px; text-align: left; border-bottom: 1px solid #e2e8f0; }
  th { background: #f1f5f9; color: #0c2340; font-weight: 600; }
  td.num { text-align: right; font-variant-numeric: tabular-nums; }
  .footer { margin-top: 18px; font-size: 10px; color: #64748b; }
  .print-btn { background: #0c2340; color: white; padding: 8px 14px; border-radius: 4px; border: none; cursor: pointer; font-size: 13px; margin-bottom: 12px; }
  @media print { .print-btn { display: none; } body { padding: 0.5in; } }
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
<h1>PD Hours Heat-Map — ${escape(scopeLabel)}</h1>
<div class="meta">
  Alexander Public Schools · Marshall Growth Platform<br/>
  Generated ${escape(stamp)} by ${escape((user.first_name || '') + ' ' + (user.last_name || ''))} (${escape(user.role || '')})<br/>
  Annual PD-hours target: <strong>${target.toFixed(2)}h</strong> per teacher
</div>
<div class="summary">
  <div><div class="n" style="color:#15803d">${groupCount.met || 0}</div><div class="l">Met target</div></div>
  <div><div class="n" style="color:#0369a1">${groupCount.near || 0}</div><div class="l">Near target</div></div>
  <div><div class="n" style="color:#a16207">${groupCount.mid || 0}</div><div class="l">In progress</div></div>
  <div><div class="n" style="color:#b91c1c">${groupCount.low || 0}</div><div class="l">Behind target</div></div>
</div>
<div class="totals">
  ${rows.length} teacher${rows.length === 1 ? '' : 's'} in scope ·
  Total: <strong>${totals.total.toFixed(2)}h</strong>
  (${totals.internal.toFixed(2)}h internal + ${totals.external.toFixed(2)}h external) ·
  <strong>${totals.met}</strong> of ${rows.length} have met the goal.
</div>
<table>
  <thead>
    <tr>
      <th>Teacher</th>
      <th>School</th>
      <th style="text-align:right">Internal</th>
      <th style="text-align:right">External</th>
      <th style="text-align:right">Total</th>
      <th style="text-align:right">% Target</th>
      <th>Heat tier</th>
    </tr>
  </thead>
  <tbody>${rowsHtml || '<tr><td colspan="7" style="text-align:center;color:#64748b;padding:20px">No teachers in scope.</td></tr>'}</tbody>
</table>
<div class="footer">
  Heat-map combines verified internal-LMS PD (with hours credited at verification time) and approved external PD.
  Target is admin-editable in Admin → PD-hours target.
</div>
</body>
</html>`;
}
