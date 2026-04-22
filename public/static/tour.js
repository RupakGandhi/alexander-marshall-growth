// ============================================================================
// Marshall Growth Platform — Guided Tour Engine
// ----------------------------------------------------------------------------
// A lightweight, dependency-free walkthrough system. The server embeds a
// `window.__APS_TOUR__` object with the role-specific steps; this file renders
// the overlay, tooltip, step navigation, and persists progress in
// localStorage so users can re-run any time.
//
// Each step has the shape:
//   { page: '/admin/users', selector: '[data-tour="create-user"]',
//     title: '...', body: '...', placement: 'bottom',
//     autoScroll: true, optional: false, noHighlight: false }
//
// If the current URL doesn't match the step's `page`, the engine navigates
// there first (carrying the step index in the querystring so the tour picks
// up where it left off).
// ============================================================================
(function () {
  'use strict';

  if (window.__APS_TOUR_INSTALLED__) return;
  window.__APS_TOUR_INSTALLED__ = true;

  // -------------------- Persistence keys --------------------
  const LS_STEP = 'aps_tour_step';          // which step are we on
  const LS_AUTOLAUNCH = 'aps_tour_autolaunch_done'; // has the auto-launch fired for this user
  const LS_AUTOLAUNCH_USER = 'aps_tour_autolaunch_user'; // which user id we last fired for

  function getSteps() {
    const t = window.__APS_TOUR__;
    if (!t || !Array.isArray(t.steps)) return [];
    return t.steps;
  }
  function getMeta() {
    return window.__APS_TOUR__ || {};
  }

  // -------------------- DOM helpers --------------------
  function el(tag, attrs, children) {
    const n = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else if (k.startsWith('on')) n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    }
    if (children) (Array.isArray(children) ? children : [children]).forEach(c => {
      if (c == null) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function currentPath() {
    return window.location.pathname + window.location.search;
  }

  function onPage(stepPage) {
    if (!stepPage) return true;
    // Match by pathname only; ignore trailing slashes.
    const a = window.location.pathname.replace(/\/$/, '');
    const b = (stepPage.split('?')[0] || '').replace(/\/$/, '');
    return a === b;
  }

  function scrollIntoViewNice(target) {
    const rect = target.getBoundingClientRect();
    const inView = rect.top >= 0 && rect.bottom <= (window.innerHeight || document.documentElement.clientHeight);
    if (!inView) target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
  }

  // -------------------- Tour state --------------------
  let idx = 0;
  let overlayNode = null;
  let tooltipNode = null;
  let highlightNode = null;

  function saveStep(i) {
    try { localStorage.setItem(LS_STEP, String(i)); } catch (e) {}
  }
  function loadStep() {
    try { return Number(localStorage.getItem(LS_STEP) || 0) || 0; } catch (e) { return 0; }
  }
  function clearStep() {
    try { localStorage.removeItem(LS_STEP); } catch (e) {}
  }

  // -------------------- Render --------------------
  function teardown() {
    [overlayNode, tooltipNode, highlightNode].forEach(n => n && n.parentNode && n.parentNode.removeChild(n));
    overlayNode = tooltipNode = highlightNode = null;
    document.body.classList.remove('aps-tour-open');
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('resize', reposition, true);
    window.removeEventListener('scroll', reposition, true);
  }

  function finish(doneMessage) {
    clearStep();
    teardown();
    if (doneMessage) {
      const toast = el('div', { class: 'aps-tour-toast', role: 'status' }, doneMessage);
      document.body.appendChild(toast);
      setTimeout(() => { toast.style.opacity = '0'; }, 3200);
      setTimeout(() => { toast.remove(); }, 3800);
    }
  }

  function onKey(e) {
    if (!tooltipNode) return;
    if (e.key === 'Escape')     { e.preventDefault(); finish('Tour closed. You can re-open it any time from the “Guided Tour” button.'); }
    else if (e.key === 'ArrowRight' || e.key === 'Enter') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
  }

  function reposition() {
    const steps = getSteps();
    if (!tooltipNode || !steps[idx]) return;
    const step = steps[idx];
    if (step.noHighlight) return;
    const target = step.selector ? document.querySelector(step.selector) : null;
    if (!target) return;
    positionAround(target, step.placement || 'auto');
  }

  function positionAround(target, placement) {
    const rect = target.getBoundingClientRect();
    // Move the highlight box over the target
    if (highlightNode) {
      highlightNode.style.top = (rect.top + window.scrollY - 6) + 'px';
      highlightNode.style.left = (rect.left + window.scrollX - 6) + 'px';
      highlightNode.style.width = (rect.width + 12) + 'px';
      highlightNode.style.height = (rect.height + 12) + 'px';
    }
    // Position the tooltip
    const tipW = tooltipNode.offsetWidth || 360;
    const tipH = tooltipNode.offsetHeight || 200;
    const margin = 14;
    const viewportW = window.innerWidth, viewportH = window.innerHeight;
    let top, left, place = placement;

    if (place === 'auto') {
      const roomBelow = viewportH - rect.bottom;
      const roomAbove = rect.top;
      const roomRight = viewportW - rect.right;
      const roomLeft = rect.left;
      if (roomBelow >= tipH + margin) place = 'bottom';
      else if (roomAbove >= tipH + margin) place = 'top';
      else if (roomRight >= tipW + margin) place = 'right';
      else if (roomLeft >= tipW + margin) place = 'left';
      else place = 'bottom';
    }

    if (place === 'bottom') {
      top = rect.bottom + window.scrollY + margin;
      left = Math.max(8, Math.min(rect.left + window.scrollX + rect.width/2 - tipW/2, window.scrollX + viewportW - tipW - 8));
    } else if (place === 'top') {
      top = rect.top + window.scrollY - tipH - margin;
      left = Math.max(8, Math.min(rect.left + window.scrollX + rect.width/2 - tipW/2, window.scrollX + viewportW - tipW - 8));
    } else if (place === 'right') {
      top = Math.max(8, rect.top + window.scrollY + rect.height/2 - tipH/2);
      left = rect.right + window.scrollX + margin;
    } else {
      top = Math.max(8, rect.top + window.scrollY + rect.height/2 - tipH/2);
      left = Math.max(8, rect.left + window.scrollX - tipW - margin);
    }
    tooltipNode.style.top = top + 'px';
    tooltipNode.style.left = left + 'px';
    tooltipNode.setAttribute('data-placement', place);
  }

  function positionCentered() {
    if (!tooltipNode) return;
    const tipW = tooltipNode.offsetWidth || 420;
    const tipH = tooltipNode.offsetHeight || 240;
    tooltipNode.style.top = (window.scrollY + (window.innerHeight - tipH) / 2) + 'px';
    tooltipNode.style.left = ((window.innerWidth - tipW) / 2) + 'px';
    tooltipNode.setAttribute('data-placement', 'center');
    if (highlightNode) {
      highlightNode.style.width = '0px';
      highlightNode.style.height = '0px';
    }
  }

  function renderStep() {
    const steps = getSteps();
    const meta = getMeta();
    const step = steps[idx];
    if (!step) { finish('Tour complete! You can restart it any time from the “Guided Tour” button.'); return; }

    // If the current page doesn't match the step's page, navigate there.
    if (!onPage(step.page)) {
      saveStep(idx);
      window.location.href = step.page + (step.page.indexOf('?') === -1 ? '?' : '&') + 'tour=1';
      return;
    }

    // Build (once) or reuse overlay elements.
    if (!overlayNode) {
      overlayNode = el('div', { class: 'aps-tour-overlay', 'aria-hidden': 'true' });
      document.body.appendChild(overlayNode);
    }
    if (!highlightNode) {
      highlightNode = el('div', { class: 'aps-tour-highlight', 'aria-hidden': 'true' });
      document.body.appendChild(highlightNode);
    }
    if (!tooltipNode) {
      tooltipNode = el('div', { class: 'aps-tour-tooltip', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'aps-tour-title' });
      document.body.appendChild(tooltipNode);
    }
    document.body.classList.add('aps-tour-open');

    // Resolve the target element (may be missing on this particular page —
    // then we center the tooltip and skip the highlight).
    const target = step.selector && !step.noHighlight ? document.querySelector(step.selector) : null;

    // Build tooltip contents
    const total = steps.length;
    const isLast = idx === total - 1;
    const isFirst = idx === 0;

    const roleTag = meta.roleLabel
      ? el('span', { class: 'aps-tour-roletag' }, meta.roleLabel)
      : null;

    const header = el('div', { class: 'aps-tour-head' }, [
      el('div', { class: 'aps-tour-step-count' }, 'Step ' + (idx + 1) + ' of ' + total),
      roleTag,
      el('button', {
        class: 'aps-tour-close', 'aria-label': 'Close tour',
        onclick: () => finish('Tour closed. Use the “Guided Tour” button any time to restart.')
      }, '×'),
    ]);

    const title = el('h2', { id: 'aps-tour-title', class: 'aps-tour-title' }, step.title || '');

    const body = el('div', { class: 'aps-tour-body', html: step.body || '' });

    const hint = step.hint
      ? el('div', { class: 'aps-tour-hint', html: '<i class="fas fa-lightbulb"></i> ' + step.hint })
      : null;

    const progress = el('div', { class: 'aps-tour-progress' },
      el('div', { class: 'aps-tour-progress-bar', style: 'width:' + (((idx + 1) / total) * 100).toFixed(1) + '%' })
    );

    const prevBtn = el('button', {
      class: 'aps-tour-btn aps-tour-btn-ghost',
      onclick: prev, disabled: isFirst ? '' : null,
    }, isFirst ? '← Back' : '← Back');
    if (isFirst) prevBtn.setAttribute('disabled', 'disabled');

    const skipBtn = el('button', {
      class: 'aps-tour-btn aps-tour-btn-ghost',
      onclick: () => finish('Tour skipped. Use the “Guided Tour” button any time to restart.')
    }, 'Skip tour');

    const nextBtn = el('button', {
      class: 'aps-tour-btn aps-tour-btn-primary',
      onclick: isLast ? () => finish('🎉 Tour complete! You now know the whole platform. Re-open the tour any time from the top nav.') : next,
    }, isLast ? 'Finish ✓' : 'Next →');

    const foot = el('div', { class: 'aps-tour-foot' }, [prevBtn, skipBtn, nextBtn]);

    tooltipNode.innerHTML = '';
    tooltipNode.appendChild(header);
    tooltipNode.appendChild(title);
    tooltipNode.appendChild(body);
    if (hint) tooltipNode.appendChild(hint);
    tooltipNode.appendChild(progress);
    tooltipNode.appendChild(foot);

    // Position tooltip + highlight (or center if no target)
    if (target) {
      scrollIntoViewNice(target);
      // Wait one frame so the tooltip has layout metrics for positionAround.
      requestAnimationFrame(() => positionAround(target, step.placement || 'auto'));
    } else {
      positionCentered();
    }

    saveStep(idx);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', reposition, true);
    window.addEventListener('scroll', reposition, true);
    // Focus nextBtn so keyboard users can press Enter to advance.
    setTimeout(() => nextBtn && nextBtn.focus && nextBtn.focus(), 60);
  }

  function next() { idx++; renderStep(); }
  function prev() { idx = Math.max(0, idx - 1); renderStep(); }

  // -------------------- Public API --------------------
  function start(fromStart) {
    const steps = getSteps();
    if (!steps.length) return;
    idx = fromStart ? 0 : loadStep();
    if (idx >= steps.length) idx = 0;
    renderStep();
  }

  // If this page was opened as part of a running tour (?tour=1), resume.
  function autoResumeOnLoad() {
    const qs = new URLSearchParams(window.location.search);
    const resume = qs.get('tour');
    const userId = getMeta().userId;
    // Handle first-time auto-launch after login (but only once per user)
    if (!resume && userId) {
      let lastUser = null, alreadyDone = false;
      try {
        lastUser = localStorage.getItem(LS_AUTOLAUNCH_USER);
        alreadyDone = localStorage.getItem(LS_AUTOLAUNCH) === '1';
      } catch (e) {}
      if (getMeta().autoLaunch && (String(lastUser) !== String(userId) || !alreadyDone)) {
        try {
          localStorage.setItem(LS_AUTOLAUNCH_USER, String(userId));
          localStorage.setItem(LS_AUTOLAUNCH, '1');
        } catch (e) {}
        setTimeout(() => start(true), 500);
      }
      return;
    }
    if (resume) {
      // Clean the query string so reloads don't keep resuming.
      try {
        qs.delete('tour');
        const newUrl = window.location.pathname + (qs.toString() ? ('?' + qs.toString()) : '') + window.location.hash;
        window.history.replaceState({}, '', newUrl);
      } catch (e) {}
      setTimeout(() => start(false), 300);
    }
  }

  window.APSGuidedTour = {
    start: function () { start(true); },
    resume: function () { start(false); },
    close: function () { finish(); },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoResumeOnLoad);
  } else {
    autoResumeOnLoad();
  }
})();
