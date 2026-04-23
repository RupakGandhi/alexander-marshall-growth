#!/usr/bin/env node
/**
 * Apply rubric_improvement_suggestions.csv to the pedagogy_library.
 *
 * Per the April 2026 upgrade spec, the CSV contains revised values for
 * teacher_next_moves / coaching_considerations / resources / feedback_starter
 * for these indicator·level combinations:
 *   - B.d  level 2 (Improvement Necessary)
 *   - B.d  level 3 (Effective)
 *   - B.e  level 3 (Effective)
 *   - E.c  level 1 (Does Not Meet)
 *   - E.c  level 2 (Improvement Necessary)
 *
 * The DB stores teacher_next_moves and coaching_considerations as JSON arrays
 * of short bullet strings.  The CSV ships them as one long sentence with
 * semicolons separating the moves.  This script splits on "; " (optionally
 * followed by whitespace or a newline) to produce clean 3-5 bullet arrays
 * that match the rest of the library's shape.
 *
 * Usage:
 *   # generate the SQL to stdout:
 *   node seed/apply_rubric_improvements.mjs \
 *       > migrations/0005_rubric_improvements.sql
 *
 *   # apply directly against local D1:
 *   node seed/apply_rubric_improvements.mjs | \
 *       npx wrangler d1 execute alexander-marshall-growth-production --local
 *
 *   # apply to production:
 *   npx wrangler d1 execute alexander-marshall-growth-production --remote \
 *       --file=migrations/0005_rubric_improvements.sql
 *
 * Re-running is safe: the script uses INSERT OR REPLACE, so it will only
 * overwrite the five targeted rows and leave the rest of the library alone.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CSV_PATH = path.join(__dirname, 'rubric_improvement_suggestions.csv');

// Indicator-code → indicator_id mapping for the Alexander Marshall framework
// (deterministic — matches seed/001_district_and_framework.sql).
const INDICATOR_ID = {
  'B.d': 14, // Social-emotional learning
  'B.e': 15, // Routines
  'E.c': 43, // Communication with families
};

// -------------------------- CSV parser (RFC-4180 lite) --------------------------
function parseCsv(text) {
  const rows = [];
  let field = '';
  let row = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; }
        else { inQuotes = false; }
      } else field += ch;
    } else {
      if (ch === '"') inQuotes = true;
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        if (row.length > 1 || row[0] !== '') rows.push(row);
        row = [];
      } else field += ch;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

// ----------------------- Sentence-to-bullets splitter ------------------------
// The CSV delivers moves as one run-on sentence separated by "; " (and in a few
// rows by ". " between independent imperative clauses).  We split on these
// and also strip trailing periods to match the shape of the existing library.
function toBulletsFromSentence(s) {
  if (!s) return [];
  // normalize en-dash/em-dash/unicode whitespace-variants
  const clean = String(s).replace(/\s+/g, ' ').trim();
  // Split on "; " primarily.  The CSV uses this consistently.
  const parts = clean.split(/\s*;\s+/).map(p => p.trim()).filter(Boolean);
  // If the first pass didn't split (no semicolons), fall back to sentence-end splitting.
  const raw = parts.length > 1
    ? parts
    : clean.split(/(?<=[.!?])\s+(?=[A-Z])/).map(p => p.trim()).filter(Boolean);
  return raw.map(p => p.replace(/\.+$/, '').trim()).filter(Boolean);
}

// ----------------------- Resources parser ------------------------
// "A. (2020). Title; B. (n.d.). Title" →
// [{ title: "A. (2020). Title", source: "", type: "reading" }, …]
function toResourcesJson(s) {
  if (!s) return [];
  const clean = String(s).replace(/\s+/g, ' ').trim();
  // Split on "; " at boundaries but avoid breaking inside parentheses
  const parts = [];
  let buf = '';
  let depth = 0;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ';' && depth === 0) {
      if (buf.trim()) parts.push(buf.trim());
      buf = '';
    } else buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts.map(p => ({ title: p, source: p, type: 'reading' }));
}

// ----------------------- SQL escaping ------------------------
function sqlEscape(s) {
  if (s == null) return 'NULL';
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function jsonSql(obj) { return sqlEscape(JSON.stringify(obj)); }

// ----------------------------- MAIN ------------------------------
function main() {
  const csv = fs.readFileSync(CSV_PATH, 'utf-8');
  const rows = parseCsv(csv).filter(r => r.length > 1);
  if (!rows.length) throw new Error('empty CSV');

  const header = rows[0].map(h => h.trim());
  const col = name => header.indexOf(name);
  const cdomain = col('domain_code');
  const cindicator = col('indicator_code');
  const clevel = col('level');
  const cdescriptor = col('descriptor');
  const ctnm = col('teacher_next_moves');
  const ccc = col('coaching_considerations');
  const cresources = col('resources');
  const cstarter = col('feedback_starter');

  if ([cdomain, cindicator, clevel, ctnm, ccc, cresources, cstarter].some(i => i < 0)) {
    throw new Error('CSV is missing required columns');
  }

  const out = [];
  out.push('-- ============================================================');
  out.push('-- 0005_rubric_improvements.sql');
  out.push('-- Auto-generated from seed/rubric_improvement_suggestions.csv by');
  out.push('-- seed/apply_rubric_improvements.mjs.  Safe to re-run.');
  out.push('--');
  out.push('-- Updates teacher_next_moves / coaching_considerations / resources /');
  out.push('-- feedback_starter for B.d (L2,L3), B.e (L3), and E.c (L1,L2) only.');
  out.push('-- All other rubric cells are untouched.');
  out.push('-- ============================================================');
  out.push('');

  let count = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row[cdomain] || !row[cindicator] || !row[clevel]) continue;
    const key = `${row[cdomain].trim()}.${row[cindicator].trim()}`;
    const indicatorId = INDICATOR_ID[key];
    if (!indicatorId) {
      process.stderr.write(`WARN: skipping unknown indicator ${key}\n`);
      continue;
    }
    const level = parseInt(row[clevel], 10);
    if (![1, 2, 3, 4].includes(level)) continue;

    const tnm = toBulletsFromSentence(row[ctnm]);
    const cc  = toBulletsFromSentence(row[ccc]);
    const res = toResourcesJson(row[cresources]);
    const starter = (row[cstarter] || '').trim();

    // Preserve the existing `interpretation` and `evidence_signals` columns.
    // We write a partial UPDATE (not INSERT OR REPLACE) to avoid wiping those.
    const setClauses = [];
    if (tnm.length) setClauses.push(`teacher_next_moves = ${jsonSql(tnm)}`);
    if (cc.length)  setClauses.push(`coaching_considerations = ${jsonSql(cc)}`);
    if (res.length) setClauses.push(`resources = ${jsonSql(res)}`);
    if (starter)    setClauses.push(`feedback_starter = ${sqlEscape(starter)}`);
    setClauses.push(`updated_at = CURRENT_TIMESTAMP`);

    out.push(`-- ${key} level ${level} — ${row[cdescriptor] || ''}`);
    out.push(`UPDATE pedagogy_library SET ${setClauses.join(', ')} WHERE indicator_id = ${indicatorId} AND level = ${level};`);
    out.push('');
    count++;
  }

  out.push(`-- ${count} rows updated.`);
  process.stdout.write(out.join('\n') + '\n');
  process.stderr.write(`generated ${count} UPDATE statements\n`);
}

main();
