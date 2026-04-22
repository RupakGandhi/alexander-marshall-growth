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

export function formatDate(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return d; }
}

export function formatDateTime(d: string | null | undefined): string {
  if (!d) return '—';
  try { return new Date(d).toLocaleString('en-US', { year:'numeric', month:'short', day:'numeric', hour:'numeric', minute:'2-digit' }); }
  catch { return d; }
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
