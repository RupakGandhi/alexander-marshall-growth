/**
 * Prose renderer — turns plain-text feedback bodies into nicely formatted
 * blocks so auto-generated and copy-pasted content never reads like raw
 * markdown source.  Added June 5, 2026 (Dr. Gandhi pass) after pre-seeded
 * "What I saw in your classroom" feedback was landing in teachers' views
 * as `| 1 | Objective ... |` table syntax.
 *
 * Why a custom mini-renderer instead of a real markdown lib?
 *  - Cloudflare Workers bundle stays small (no marked / markdown-it).
 *  - We only need to handle the three patterns our LLM-generated and
 *    appraiser-pasted feedback actually produces:
 *      1. Markdown pipe tables ("| # | Note |\n|---|---|\n| 1 | ... |")
 *      2. Bulleted lists (lines starting with "•", "-", "*", "·")
 *      3. Numbered lists (lines starting with "1.", "1)", "(1)")
 *  - Everything else falls back to paragraphs with preserved line breaks.
 *
 * Hono JSX auto-escapes text node children, so untrusted feedback bodies
 * are safe — we never use dangerouslySetInnerHTML.  The component returns
 * a JSX fragment so it can be dropped in anywhere a <div>{body}</div>
 * used to be.
 */

type ProseProps = {
  text: string | null | undefined;
  /** Optional extra classes for the wrapper. */
  class?: string;
  /** Visual size — defaults to inheriting parent. */
  size?: 'xs' | 'sm' | 'base';
};

// --- helpers ---------------------------------------------------------------

const NUMBERED_RE = /^\s*(?:\(?\d{1,3}[\.\)])\s+(.+)$/;
const BULLET_RE   = /^\s*[•\-\*·]\s+(.+)$/;
const TABLE_ROW_RE = /^\s*\|.+\|\s*$/;
// A markdown table separator row: |---|---|, |:--|--:|, | -: | --- |, even |-|-|.
// We accept 1+ dashes per cell so common LLM/typed variants like "| -: | --- |"
// (one-dash align cell) are recognized and stripped out instead of leaking into
// the rendered table as a data row of all dashes.
const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?\s*$/;

function splitTableRow(line: string): string[] {
  // Trim leading/trailing pipes, then split on |, trim each cell.
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|'))   s = s.slice(0, -1);
  return s.split('|').map(c => c.trim());
}

/**
 * Parse the body into a sequence of blocks.  Each block is either a
 * paragraph, a bulleted list, a numbered list, or a table.
 */
type Block =
  | { kind: 'p';  lines: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'table'; headers: string[]; rows: string[][] };

function parseBlocks(raw: string): Block[] {
  // Normalize line endings, drop trailing whitespace.
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines between blocks.
    if (!line.trim()) { i++; continue; }

    // --- TABLE detection: at least two consecutive pipe rows, ideally
    // separated by a `|---|---|` row.  We accept tables even without the
    // separator row (some LLMs forget) provided there are >= 2 pipe rows.
    if (TABLE_ROW_RE.test(line)) {
      const tableLines: string[] = [];
      let j = i;
      while (j < lines.length && (TABLE_ROW_RE.test(lines[j]) || TABLE_SEP_RE.test(lines[j]))) {
        tableLines.push(lines[j]);
        j++;
      }
      // Drop separator rows from the data.
      const dataRows = tableLines.filter(l => !TABLE_SEP_RE.test(l));
      if (dataRows.length >= 2) {
        const headers = splitTableRow(dataRows[0]);
        const rows = dataRows.slice(1).map(splitTableRow);
        blocks.push({ kind: 'table', headers, rows });
        i = j;
        continue;
      }
      // Only one pipe row — fall through, treat as paragraph.
    }

    // --- BULLETED list
    if (BULLET_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && BULLET_RE.test(lines[i])) {
        items.push(lines[i].replace(BULLET_RE, '$1').trim());
        i++;
      }
      blocks.push({ kind: 'ul', items });
      continue;
    }

    // --- NUMBERED list
    if (NUMBERED_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && NUMBERED_RE.test(lines[i])) {
        items.push(lines[i].replace(NUMBERED_RE, '$1').trim());
        i++;
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    // --- Paragraph: gather consecutive non-blank, non-list, non-table lines.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !BULLET_RE.test(lines[i]) &&
      !NUMBERED_RE.test(lines[i]) &&
      !TABLE_ROW_RE.test(lines[i])
    ) {
      para.push(lines[i].trim());
      i++;
    }
    if (para.length) blocks.push({ kind: 'p', lines: para });
  }

  return blocks;
}

/**
 * Render a single inline string.  We currently support **bold** so that
 * pasted markdown emphasis renders correctly (very common in LLM output).
 * Everything else is plain text — Hono JSX escapes for us.
 */
function renderInline(s: string): any {
  if (!s) return s;
  // Split on **bold** while keeping the bold spans.
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p) => {
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) {
      return <strong>{p.slice(2, -2)}</strong>;
    }
    return p;
  });
}

// --- component -------------------------------------------------------------

export function Prose({ text, class: klass, size }: ProseProps) {
  const raw = (text == null ? '' : String(text)).trim();
  if (!raw) return null;

  const blocks = parseBlocks(raw);
  const baseSize =
    size === 'xs'  ? 'text-xs'  :
    size === 'sm'  ? 'text-sm'  :
    size === 'base' ? 'text-base' : '';

  return (
    <div class={`aps-prose ${baseSize} ${klass || ''}`.trim()}>
      {blocks.map((b) => {
        if (b.kind === 'p') {
          return (
            <p class="text-slate-700 leading-relaxed mb-2 last:mb-0 whitespace-pre-line">
              {b.lines.map((ln, idx) => (
                <>
                  {idx > 0 ? <br /> : null}
                  {renderInline(ln)}
                </>
              ))}
            </p>
          );
        }
        if (b.kind === 'ul') {
          return (
            <ul class="list-disc pl-5 space-y-1 mb-2 last:mb-0 text-slate-700 leading-relaxed">
              {b.items.map((it) => <li>{renderInline(it)}</li>)}
            </ul>
          );
        }
        if (b.kind === 'ol') {
          return (
            <ol class="list-decimal pl-5 space-y-1 mb-2 last:mb-0 text-slate-700 leading-relaxed">
              {b.items.map((it) => <li>{renderInline(it)}</li>)}
            </ol>
          );
        }
        if (b.kind === 'table') {
          return (
            <div class="overflow-x-auto -mx-2 my-2">
              <table class="min-w-full text-sm border border-slate-200 rounded">
                <thead class="bg-slate-50">
                  <tr>
                    {b.headers.map((h) => (
                      <th class="text-left px-2 py-1.5 border-b border-slate-200 font-medium text-slate-700 align-top">
                        {renderInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {b.rows.map((row) => (
                    <tr class="border-b border-slate-100 last:border-0">
                      {row.map((cell) => (
                        <td class="px-2 py-1.5 text-slate-700 align-top">{renderInline(cell)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
