#!/usr/bin/env node
/**
 * Prose renderer regression tests — Sept 23, 2026.
 *
 * Section 7 of the Aaron/coaching change spec asked for coverage of:
 *   1. Lone pipe rows (the Aug 16 coach-1102 fix)
 *   2. Valid tables
 *   3. Blank-separated rows
 *   4. Bulleted and numbered lists
 *   5. CRLF line endings
 *   6. Long pasted feedback
 *   7. Literal markup safety (** appearing without a pair, backticks, etc.)
 *   8. 2,048 separator-only pipe lines — perf sentinel (target: linear time)
 *
 * We import the actual source (src/lib/prose.tsx) via esbuild transform-on-read
 * so we exercise the real parseBlocks/renderInline used at runtime, not a
 * hand-copied duplicate.  Run with: node tests/prose.test.mjs
 */
import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { transform } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// Compile src/lib/prose.tsx to a plain ES module we can import.  Rewrite the
// JSX to plain object trees so we can inspect the output without needing a
// JSX runtime — every block becomes { type, props, children }.
const src = await readFile(resolve(ROOT, 'src/lib/prose.tsx'), 'utf8');
// h() is a tiny hyperscript that returns {type, props, children}.
// Rename our hyperscript to _hh to avoid collisions with local `h` variables
// inside prose.tsx's .map callbacks (which shadow the factory).
const shim = `
const _hh = (type, props, ...children) => ({ type, props: props || {}, children: children.flat(Infinity).filter(c => c !== null && c !== undefined && c !== false) });
const _hhFragment = 'fragment';
`;
const { code } = await transform(src, {
  loader: 'tsx',
  jsxFactory: '_hh',
  jsxFragment: '_hhFragment',
  format: 'esm',
  target: 'es2022',
});
// Write to a temp file and dynamic-import it (Node needs a real URL for ESM).
const tmpDir = resolve(ROOT, '.tmp-tests');
await mkdir(tmpDir, { recursive: true });
const tmpPath = resolve(tmpDir, 'prose.mjs');
await writeFile(tmpPath, shim + code);
const prose = await import(pathToFileURL(tmpPath).href);

// -------- test harness ------------------------------------------------------
let passed = 0, failed = 0;
function assert(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else      { failed++; console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}
function assertEqual(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`  ✓ ${name}`); }
  else    { failed++; console.log(`  ✗ ${name}\n      expected: ${JSON.stringify(expected)}\n      got:      ${JSON.stringify(actual)}`); }
}

// Render <Prose> and pull out just the block "kinds" so we compare shapes,
// not full JSX trees.
function summarise(node) {
  if (!node) return null;
  if (typeof node === 'string') return { text: node };
  if (Array.isArray(node)) return node.map(summarise);
  const kids = (node.children || []).map(summarise);
  return { tag: node.type, kids };
}
function renderKinds(text) {
  const tree = prose.Prose({ text });
  if (!tree) return [];
  // Prose returns a <div class="aps-prose ..."> wrapping N block children.
  // Tables specifically are wrapped in a <div class="overflow-x-auto"> so
  // we unwrap one level for 'div' children to discover the actual block type.
  const wrapper = tree;
  return (wrapper.children || []).map(child => {
    if (!child) return null;
    if (child.type === 'div' && Array.isArray(child.children) && child.children.length === 1) {
      const inner = child.children[0];
      if (inner && typeof inner === 'object' && inner.type) return inner.type;
    }
    return child.type || null;
  });
}

// ---------------------------------------------------------------------------
console.log('\n[1] Lone pipe row — must NOT infinite-loop, renders as paragraph');
{
  // The exact shape that blew up on /coach/teachers/23 pre-Aug 16 fix.
  const body = 'Here are sample notes: |  # | Observation Note                    \n\n|  2 | Bell ringer displayed |\n\n|  6 | Teacher models a think-aloud |';
  const t0 = Date.now();
  const kinds = renderKinds(body);
  const ms = Date.now() - t0;
  assert('completes in under 100ms', ms < 100, `${ms}ms`);
  assert('emits at least one block', kinds.length > 0, `got ${kinds.length}`);
  // First para is the leading prose; the lone-pipe rows become paragraphs
  // (they aren't a valid 2+ row table).  So we expect all 'p' blocks here.
  assertEqual('all blocks are paragraphs (no table synthesised)', kinds, ['p','p','p']);
}

console.log('\n[2] Valid table — header + separator + rows');
{
  const body = '| # | Note |\n|---|---|\n| 1 | Objective on board |\n| 2 | Bell ringer done |';
  const kinds = renderKinds(body);
  assertEqual('one table block', kinds, ['table']);
}

console.log('\n[3] Blank-separated pipe rows — 2+ pipe rows still form a table when adjacent');
{
  // Adjacent rows with no separator row should still parse as a table.
  const body = '| # | Note |\n| 1 | Objective |\n| 2 | Bell ringer |';
  const kinds = renderKinds(body);
  assertEqual('adjacent pipe rows form a table', kinds, ['table']);

  // But rows separated by a blank line each are lone rows, not a table —
  // and must render as paragraphs without hanging.
  const body2 = '| 1 | Objective |\n\n| 2 | Bell ringer |';
  const kinds2 = renderKinds(body2);
  assertEqual('blank-separated pipe rows are paragraphs', kinds2, ['p','p']);
}

console.log('\n[4] Bulleted and numbered lists');
{
  const bul = renderKinds('• First\n• Second\n• Third');
  assertEqual('bullets → ul', bul, ['ul']);
  const num = renderKinds('1. First\n2. Second\n3. Third');
  assertEqual('numbered → ol', num, ['ol']);
  const mix = renderKinds('- item a\n- item b\n1. step one\n2. step two');
  assertEqual('bullets then numbered → ul,ol', mix, ['ul','ol']);
}

console.log('\n[5] CRLF line endings normalized');
{
  const body = 'Line one\r\n\r\nLine two';
  const kinds = renderKinds(body);
  assertEqual('two paragraphs on CRLF', kinds, ['p','p']);
}

console.log('\n[6] Long pasted feedback — 40 KB of ordinary prose');
{
  const line = 'The teacher used cold call combined with wait time to draw quieter students into the discussion. ';
  const body = Array(400).fill(line).join('\n\n');
  console.log(`     input length: ${body.length} chars`);
  const t0 = Date.now();
  const kinds = renderKinds(body);
  const ms = Date.now() - t0;
  assert('completes in under 500ms', ms < 500, `${ms}ms`);
  assert('emits ~400 paragraph blocks', kinds.length >= 100 && kinds.every(k => k === 'p'), `got ${kinds.length}`);
}

console.log('\n[7] Literal markup safety');
{
  // Unclosed **, backticks, and lone HTML-looking text must NOT crash and must
  // NOT be interpreted as raw HTML.  Hono JSX auto-escapes text children —
  // the test here is that we produce a stable block tree.
  const body = 'This has **bold with no close and <script>alert(1)</script> and `code`';
  const t0 = Date.now();
  const kinds = renderKinds(body);
  const ms = Date.now() - t0;
  assert('literal markup completes fast', ms < 50, `${ms}ms`);
  assertEqual('literal markup renders as a paragraph', kinds, ['p']);
  // Serialize the tree and confirm no raw <script> tag object escapes.  Every
  // text child stays a string, never spliced into the DOM as HTML — Hono JSX
  // takes care of escaping at render time; our parser must not build a
  // {type:'script',...} node.
  const tree = prose.Prose({ text: body });
  const dump = JSON.stringify(tree);
  assert('no script-tag node in tree', !dump.includes('"type":"script"'));
}

console.log('\n[8] 2,048 separator-only pipe lines — perf sentinel (linear time)');
{
  // The doc reports this pattern took ~805 ms in local V8 before the linear-
  // time correction.  We require completion in well under that.  We use
  // 2048 separator-only rows (|---|---|) which match TABLE_SEP_RE but never
  // TABLE_ROW_RE, so the table-detection branch is entered zero times.
  // If a future regression re-introduces repeated inner scans this test
  // will jump orders of magnitude and fail.
  const rows = 2048;
  const body = Array(rows).fill('|---|---|').join('\n');
  const t0 = Date.now();
  const kinds = renderKinds(body);
  const ms = Date.now() - t0;
  console.log(`     ${rows} separator-only rows parsed in ${ms}ms → ${kinds.length} blocks`);
  assert('2048 separator rows complete in < 100ms', ms < 100, `${ms}ms`);
  // These rows match TABLE_SEP_RE but NOT TABLE_ROW_RE, so the parser never
  // enters the table branch — they fall into the paragraph loop as regular
  // text lines.  This is fine as long as it's linear.
}

console.log('\n[9] Empty and null inputs — defensive');
{
  assert('null → null', prose.Prose({ text: null }) === null);
  assert('empty string → null', prose.Prose({ text: '' }) === null);
  assert('whitespace-only → null', prose.Prose({ text: '   \n\n  ' }) === null);
}

console.log('\n[10] Table cell inline bold preserved');
{
  const body = '| Item | Note |\n|---|---|\n| **Important** | body text |';
  const tree = prose.Prose({ text: body });
  const dump = JSON.stringify(tree);
  assert('contains a <strong> in the table', dump.includes('"type":"strong"'));
}

// Cleanup
await rm(tmpDir, { recursive: true, force: true });

console.log(`\n============================================================`);
console.log(`  ${passed} passed · ${failed} failed`);
console.log(`============================================================`);
process.exit(failed > 0 ? 1 : 0);
