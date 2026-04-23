export function escapeHtml(s: string): string {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  } as any)[c]);
}

export const levelLabels: Record<number, string> = {
  4: 'Highly Effective',
  3: 'Effective',
  2: 'Improvement Necessary',
  1: 'Does Not Meet Standards',
};

export const levelColor: Record<number, string> = {
  4: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  3: 'bg-sky-100 text-sky-800 border-sky-300',
  2: 'bg-amber-100 text-amber-800 border-amber-300',
  1: 'bg-red-100 text-red-800 border-red-300',
};

export const levelDot: Record<number, string> = {
  4: 'bg-emerald-500',
  3: 'bg-sky-500',
  2: 'bg-amber-500',
  1: 'bg-red-500',
};

// All DB timestamps are stored in UTC by SQLite (CURRENT_TIMESTAMP → "YYYY-MM-DD HH:MM:SS" with no TZ suffix).
// We explicitly append 'Z' so the JS Date is parsed as UTC, then format in US Central Time.
const APS_TZ = 'America/Chicago';

function toUtcDate(d: string): Date {
  // Accept formats: "2026-04-22 15:30:00", "2026-04-22T15:30:00", ISO with Z, ISO with offset.
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(d)) {
    return new Date(d.replace(' ', 'T') + 'Z');
  }
  return new Date(d);
}

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return toUtcDate(d).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric', timeZone: APS_TZ,
    });
  } catch { return d; }
}

export function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  try {
    return toUtcDate(d).toLocaleString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
      timeZone: APS_TZ, timeZoneName: 'short',
    });
  } catch { return d; }
}

// Returns "YYYY-MM-DDTHH:MM" string suitable for <input type="datetime-local"> in US Central Time.
export function nowCentralForDateTimeLocal(): string {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APS_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '00';
  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}:${get('minute')}`;
}

// Determine the current school year label based on today's date in Central Time.
// Rule: August 1 - July 31 defines a school year. E.g., Aug 2025 - Jul 2026 → "2025-2026".
export function computeCurrentSchoolYearLabel(today: Date = new Date()): string {
  const centralParts = new Intl.DateTimeFormat('en-US', {
    timeZone: APS_TZ, year: 'numeric', month: '2-digit',
  }).formatToParts(today);
  const year = Number(centralParts.find(p => p.type === 'year')?.value || 0);
  const month = Number(centralParts.find(p => p.type === 'month')?.value || 0);
  // If we're in Aug-Dec → school year started this calendar year; Jan-Jul → started previous year
  const startYear = month >= 8 ? year : year - 1;
  return `${startYear}-${startYear + 1}`;
}

export function statusBadge(s: string): string {
  const map: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 border-slate-300',
    scored: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    awaiting_signature: 'bg-amber-100 text-amber-800 border-amber-300',
    published: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    acknowledged: 'bg-teal-100 text-teal-800 border-teal-300',
  };
  return map[s] || 'bg-slate-100 text-slate-700 border-slate-300';
}

export function statusLabel(s: string): string {
  const map: Record<string,string> = {
    draft: 'Draft',
    scored: 'Scored',
    awaiting_signature: 'Awaiting Signature',
    published: 'Published to Teacher',
    acknowledged: 'Acknowledged by Teacher',
  };
  return map[s] || s;
}
