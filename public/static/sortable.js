/*!
 * Alexander Marshall Growth Platform — sortable.js
 * ----------------------------------------------------------------------------
 * Lightweight, zero-dependency client-side sort for any table marked with
 * `data-sortable="true"`. Drop a `data-sort-type` on each <th> and the table's
 * <tbody> rows will be re-ordered in place when the header is clicked.
 *
 * Features:
 *   - Click a header to sort by that column (ascending → descending → none).
 *   - SHIFT-click additional headers to multi-sort (primary, secondary, …).
 *   - Type-aware comparisons: text | number | date | rating
 *       • text   — case-insensitive locale compare
 *       • number — parseFloat, NaN sorts to the bottom of both directions
 *       • date   — Date.parse, falls back to the raw string if unparseable
 *       • rating — strips non-digits ("Level 2", "L2", "2 / 4") and compares as int
 *     Use `data-sort-value` on a <td> to override what gets compared (e.g. show
 *     "May 14, 2026" but sort on "2026-05-14").
 *   - Stable sort: ties preserve the original DOM order, so progressive sorts
 *     compose cleanly.
 *   - "Reset sort" button (any element with `data-sort-reset` targeting the
 *     same table) restores the original document order.
 *   - Visual indicator: sort arrow + badge with the priority number when
 *     multi-sorted.
 *   - Persists the sort state per table in sessionStorage so a single page-reload
 *     keeps the user's chosen view (key = `sort:${pathname}:${tableId}`).
 *
 * This file is intentionally written without any framework — Hono renders the
 * tables server-side and we just enhance the DOM after load.
 *
 * Last updated: June 4, 2026 — initial release alongside the heat-map sort
 * controls (final pre-launch UX polish requested by Dr. Rupak Gandhi).
 */
(function () {
  'use strict';

  // ---- Comparators -------------------------------------------------------
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

  function compareText(a, b) {
    return collator.compare(String(a == null ? '' : a), String(b == null ? '' : b));
  }
  function compareNumber(a, b) {
    const na = parseFloat(a);
    const nb = parseFloat(b);
    const aBad = !Number.isFinite(na);
    const bBad = !Number.isFinite(nb);
    if (aBad && bBad) return 0;
    if (aBad) return 1;   // NaN always sinks
    if (bBad) return -1;
    return na - nb;
  }
  function compareDate(a, b) {
    const da = Date.parse(a);
    const db = Date.parse(b);
    const aBad = isNaN(da);
    const bBad = isNaN(db);
    if (aBad && bBad) return compareText(a, b);
    if (aBad) return 1;
    if (bBad) return -1;
    return da - db;
  }
  function compareRating(a, b) {
    // pulls the first integer out of strings like "Level 2", "L2", "2 / 4", "—"
    const grab = (s) => {
      const m = String(s == null ? '' : s).match(/-?\d+(?:\.\d+)?/);
      return m ? parseFloat(m[0]) : NaN;
    };
    return compareNumber(grab(a), grab(b));
  }
  function pickComparator(type) {
    switch ((type || 'text').toLowerCase()) {
      case 'number': return compareNumber;
      case 'date':   return compareDate;
      case 'rating': return compareRating;
      default:       return compareText;
    }
  }

  // ---- Value extraction --------------------------------------------------
  function cellValue(row, colIdx) {
    const cells = row.cells;
    if (!cells || colIdx >= cells.length) return '';
    const td = cells[colIdx];
    if (td.dataset && td.dataset.sortValue !== undefined) return td.dataset.sortValue;
    // .innerText collapses whitespace and skips hidden content — what humans see
    return (td.innerText || td.textContent || '').trim();
  }

  // ---- State -------------------------------------------------------------
  // sortKeys per table: [{ colIdx, dir: 1|-1, type }]
  const stateByTable = new WeakMap();

  function storageKey(table) {
    if (!table.id) return null;
    return 'sort:' + window.location.pathname + ':' + table.id;
  }
  function persist(table, keys) {
    const k = storageKey(table);
    if (!k) return;
    try { sessionStorage.setItem(k, JSON.stringify(keys)); } catch (_) {}
  }
  function restore(table) {
    const k = storageKey(table);
    if (!k) return null;
    try {
      const raw = sessionStorage.getItem(k);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : null;
    } catch (_) { return null; }
  }

  // ---- Rendering ---------------------------------------------------------
  function updateHeaderIndicators(table, keys) {
    const ths = table.querySelectorAll('thead th');
    ths.forEach((th, idx) => {
      // Strip prior indicator
      const arrow = th.querySelector('.sortable-arrow');
      if (arrow) arrow.remove();
      const badge = th.querySelector('.sortable-badge');
      if (badge) badge.remove();
      th.removeAttribute('aria-sort');
      const key = keys.find((k) => k.colIdx === idx);
      if (!key) return;
      const span = document.createElement('span');
      span.className = 'sortable-arrow ml-1 inline-block text-aps-blue';
      span.setAttribute('aria-hidden', 'true');
      span.textContent = key.dir === 1 ? '▲' : '▼';
      th.appendChild(span);
      th.setAttribute('aria-sort', key.dir === 1 ? 'ascending' : 'descending');
      if (keys.length > 1) {
        const b = document.createElement('span');
        b.className = 'sortable-badge ml-1 inline-flex items-center justify-center text-[10px] font-bold rounded-full bg-aps-blue text-white w-4 h-4';
        b.textContent = String(keys.indexOf(key) + 1);
        b.setAttribute('aria-label', 'sort priority ' + (keys.indexOf(key) + 1));
        th.appendChild(b);
      }
    });
  }

  function applySort(table, keys) {
    const tbody = table.tBodies[0];
    if (!tbody) return;
    const rows = Array.from(tbody.rows);
    // Remember the original index so we can fall back to it for a stable sort
    // AND so we can restore via the "reset" button later.
    rows.forEach((r, i) => {
      if (r.dataset.sortOrigIdx === undefined) r.dataset.sortOrigIdx = String(i);
    });
    if (keys.length === 0) {
      rows.sort((a, b) => Number(a.dataset.sortOrigIdx) - Number(b.dataset.sortOrigIdx));
    } else {
      const cmps = keys.map((k) => ({ cmp: pickComparator(k.type), colIdx: k.colIdx, dir: k.dir }));
      rows.sort((a, b) => {
        for (const k of cmps) {
          const av = cellValue(a, k.colIdx);
          const bv = cellValue(b, k.colIdx);
          const c = k.cmp(av, bv);
          if (c !== 0) return c * k.dir;
        }
        return Number(a.dataset.sortOrigIdx) - Number(b.dataset.sortOrigIdx);
      });
    }
    // Re-append in new order (stable, no flicker)
    const frag = document.createDocumentFragment();
    rows.forEach((r) => frag.appendChild(r));
    tbody.appendChild(frag);
    updateHeaderIndicators(table, keys);
  }

  // ---- Click handler -----------------------------------------------------
  function onHeaderClick(e) {
    const th = e.currentTarget;
    const table = th.closest('table');
    if (!table) return;
    const ths = Array.from(table.querySelectorAll('thead th'));
    const colIdx = ths.indexOf(th);
    if (colIdx < 0) return;
    const type = th.dataset.sortType || 'text';
    let keys = (stateByTable.get(table) || []).slice();
    const existingIdx = keys.findIndex((k) => k.colIdx === colIdx);
    if (e.shiftKey) {
      // Multi-sort path: cycle this column, leave others intact
      if (existingIdx >= 0) {
        const cur = keys[existingIdx];
        if (cur.dir === 1) {
          cur.dir = -1;
        } else {
          keys.splice(existingIdx, 1); // remove this column from the sort chain
        }
      } else {
        keys.push({ colIdx, dir: 1, type });
      }
    } else {
      // Single-sort path: clear others, cycle this one
      if (existingIdx >= 0 && keys.length === 1) {
        const cur = keys[0];
        if (cur.dir === 1) {
          keys = [{ colIdx, dir: -1, type }];
        } else {
          keys = []; // back to original order
        }
      } else {
        keys = [{ colIdx, dir: 1, type }];
      }
    }
    stateByTable.set(table, keys);
    persist(table, keys);
    applySort(table, keys);
  }

  // ---- Wire it up --------------------------------------------------------
  function enhance(table) {
    if (table.dataset.sortableInit === '1') return;
    table.dataset.sortableInit = '1';

    const ths = table.querySelectorAll('thead th');
    ths.forEach((th) => {
      if (th.dataset.sortDisable === 'true') return;
      // Default to text sort if author didn't pick a type
      if (!th.dataset.sortType) th.dataset.sortType = 'text';
      th.style.cursor = 'pointer';
      th.classList.add('select-none');
      th.setAttribute('role', 'button');
      th.setAttribute('tabindex', '0');
      if (!th.title) th.title = 'Click to sort. Shift-click another column for multi-column sort.';
      th.addEventListener('click', onHeaderClick);
      th.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          // Synthesize a click; preserve shiftKey
          th.click();
        }
      });
    });

    // Reset buttons (optional, opt-in via data-sort-reset="<tableId>")
    const tableId = table.id;
    if (tableId) {
      document.querySelectorAll('[data-sort-reset="' + tableId + '"]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          stateByTable.set(table, []);
          persist(table, []);
          applySort(table, []);
        });
      });
    }

    // Restore previous sort if user reloaded the page
    const saved = restore(table);
    if (saved && saved.length) {
      stateByTable.set(table, saved);
      applySort(table, saved);
    }
  }

  function init() {
    document.querySelectorAll('table[data-sortable="true"]').forEach(enhance);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
  // Re-init on dynamic DOM (e.g. HTMX swap) — best-effort
  document.addEventListener('htmx:afterSwap', init);

  // Expose for ad-hoc use
  window.AlexanderSortable = { init: init, enhance: enhance };
})();
