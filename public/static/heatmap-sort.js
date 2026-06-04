/*!
 * Alexander Marshall Growth Platform — heatmap-sort.js
 * ----------------------------------------------------------------------------
 * Drives the sort + filter dropdowns on the PDHoursHeatMap widget.  The tiles
 * carry their sort metadata as data-* attributes (see PDHoursHeatMap in
 * src/lib/layout.tsx), so this helper just reads and re-orders them.
 *
 *   <select data-heatmap-sort="pd-heatmap-grid-...">     ← sort dropdown
 *   <select data-heatmap-filter="pd-heatmap-grid-...">   ← filter dropdown
 *   <span   data-heatmap-count="pd-heatmap-grid-...">    ← "N of M shown" text
 *   <div    id="pd-heatmap-grid-...">                    ← the tile grid
 *     <a|div data-heatmap-tile
 *            data-heat="met|near|mid|low"
 *            data-total="…" data-pct="…"
 *            data-internal="…" data-external="…"
 *            data-name="last first" data-school="name"
 *     >…</a|div>
 *     …
 *   </div>
 *
 * Last updated: June 4, 2026 — initial release alongside the sortable tables
 * (final pre-launch UX polish requested by Dr. Rupak Gandhi).
 */
(function () {
  'use strict';

  // The "original" rendered order — captured once per grid so the user can
  // always return to it by picking "Original (heat group)".
  const originalOrder = new WeakMap();

  function num(el, key) {
    const v = parseFloat(el.getAttribute('data-' + key));
    return Number.isFinite(v) ? v : 0;
  }
  function str(el, key) {
    return String(el.getAttribute('data-' + key) || '');
  }

  // Heat priority for the default "group by heat" ordering — same order as
  // the legend at the top of the widget (met → near → mid → low).
  const HEAT_RANK = { met: 0, near: 1, mid: 2, low: 3 };

  function sortTiles(grid, mode) {
    const tiles = Array.from(grid.querySelectorAll('[data-heatmap-tile]'));
    if (!originalOrder.has(grid)) originalOrder.set(grid, tiles.slice());
    let sorted = tiles.slice();
    switch (mode) {
      case 'total_desc':    sorted.sort((a, b) => num(b, 'total') - num(a, 'total')); break;
      case 'total_asc':     sorted.sort((a, b) => num(a, 'total') - num(b, 'total')); break;
      case 'pct_desc':      sorted.sort((a, b) => num(b, 'pct')   - num(a, 'pct'));   break;
      case 'pct_asc':       sorted.sort((a, b) => num(a, 'pct')   - num(b, 'pct'));   break;
      case 'internal_desc': sorted.sort((a, b) => num(b, 'internal') - num(a, 'internal')); break;
      case 'external_desc': sorted.sort((a, b) => num(b, 'external') - num(a, 'external')); break;
      case 'name_asc':      sorted.sort((a, b) => str(a, 'name').localeCompare(str(b, 'name'))); break;
      case 'name_desc':     sorted.sort((a, b) => str(b, 'name').localeCompare(str(a, 'name'))); break;
      case 'school_asc':    sorted.sort((a, b) => str(a, 'school').localeCompare(str(b, 'school'))); break;
      case 'default':
      default: {
        const original = originalOrder.get(grid);
        if (original) sorted = original.slice();
        else sorted.sort((a, b) => {
          // Fallback: sort by heat group + name when we don't have a snapshot
          const ha = HEAT_RANK[str(a, 'heat')] ?? 9;
          const hb = HEAT_RANK[str(b, 'heat')] ?? 9;
          if (ha !== hb) return ha - hb;
          return str(a, 'name').localeCompare(str(b, 'name'));
        });
        break;
      }
    }
    const frag = document.createDocumentFragment();
    sorted.forEach((t) => frag.appendChild(t));
    grid.appendChild(frag);
  }

  function filterTiles(grid, mode, countLabel) {
    const tiles = Array.from(grid.querySelectorAll('[data-heatmap-tile]'));
    let shown = 0;
    tiles.forEach((t) => {
      const heat = str(t, 'heat');
      let visible = true;
      switch (mode) {
        case 'all':          visible = true; break;
        case 'met':          visible = heat === 'met'; break;
        case 'near':         visible = heat === 'near'; break;
        case 'mid':          visible = heat === 'mid'; break;
        case 'low':          visible = heat === 'low'; break;
        case 'below_target': visible = heat !== 'met'; break;
        default:             visible = true;
      }
      t.style.display = visible ? '' : 'none';
      if (visible) shown++;
    });
    if (countLabel) {
      countLabel.textContent = shown + ' of ' + tiles.length + ' shown';
    }
  }

  function persist(gridId, key, value) {
    try { sessionStorage.setItem('heatmap:' + key + ':' + location.pathname + ':' + gridId, value); } catch (_) {}
  }
  function restore(gridId, key) {
    try { return sessionStorage.getItem('heatmap:' + key + ':' + location.pathname + ':' + gridId); } catch (_) { return null; }
  }

  function wire(select, key) {
    const gridId = select.getAttribute('data-heatmap-' + key);
    if (!gridId) return;
    const grid = document.getElementById(gridId);
    if (!grid) return;
    const countLabel = document.querySelector('[data-heatmap-count="' + gridId + '"]');

    // Restore previous selection from sessionStorage so a single reload keeps
    // the user's chosen view.
    const saved = restore(gridId, key);
    if (saved && Array.from(select.options).some((o) => o.value === saved)) {
      select.value = saved;
    }

    const apply = () => {
      if (key === 'sort')   sortTiles(grid, select.value);
      if (key === 'filter') filterTiles(grid, select.value, countLabel);
      persist(gridId, key, select.value);
    };
    select.addEventListener('change', apply);
    // Apply the restored selection on load (if any)
    if (saved) apply();
  }

  function init() {
    document.querySelectorAll('select[data-heatmap-sort]').forEach((s) => wire(s, 'sort'));
    document.querySelectorAll('select[data-heatmap-filter]').forEach((s) => wire(s, 'filter'));
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
