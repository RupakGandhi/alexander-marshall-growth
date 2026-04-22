// ============================================================================
// CSV utilities — RFC 4180-ish parser and builder with quoted fields + commas
// Works in Cloudflare Workers runtime (no Node dependencies).
// ============================================================================

/**
 * Parse CSV text into a 2D array of strings.
 * Handles:
 *   - Quoted fields: "hello, world"
 *   - Escaped quotes inside quotes: "She said ""hi"""
 *   - CRLF and LF line endings
 *   - Empty trailing fields
 */
export function parseCsv(text: string): string[][] {
  // Normalize to LF and strip BOM
  const src = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else { inQuotes = false; }
      } else {
        cell += ch;
      }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(cell); cell = ''; }
      else if (ch === '\n') { row.push(cell); cell = ''; rows.push(row); row = []; }
      else { cell += ch; }
    }
  }
  // flush trailing cell/row
  if (cell.length > 0 || row.length > 0) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.length > 1 || (r.length === 1 && r[0].trim() !== ''));
}

/**
 * Parse CSV into an array of row objects keyed by the header row.
 * Header names are lowercased and trimmed.
 */
export function parseCsvAsObjects(text: string): { headers: string[]; rows: Record<string,string>[] } {
  const grid = parseCsv(text);
  if (grid.length === 0) return { headers: [], rows: [] };
  const headers = grid[0].map(h => h.trim().toLowerCase());
  const rows: Record<string,string>[] = [];
  for (let r = 1; r < grid.length; r++) {
    const raw = grid[r];
    const obj: Record<string,string> = {};
    let hasValue = false;
    for (let c = 0; c < headers.length; c++) {
      const v = (raw[c] ?? '').trim();
      obj[headers[c]] = v;
      if (v) hasValue = true;
    }
    if (hasValue) rows.push(obj);
  }
  return { headers, rows };
}

/** Escape a single field for CSV output. */
export function csvEscape(v: any): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (s.includes('"') || s.includes(',') || s.includes('\n') || s.includes('\r')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/** Build a CSV string from a header row + row array. */
export function buildCsv(headers: string[], rows: any[][]): string {
  const out: string[] = [];
  out.push(headers.map(csvEscape).join(','));
  for (const row of rows) {
    out.push(row.map(csvEscape).join(','));
  }
  // Excel-friendly UTF-8 BOM so accented characters render correctly
  return '\uFEFF' + out.join('\r\n') + '\r\n';
}
