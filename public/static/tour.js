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

  function onPage(stepPage) {
    if (!stepPage) return true;
    // Match by pathname only; ignore trailing slashes.
    const a = window.location.pathname.replace(/\/$/, '');
    const b = (stepPage.split('?')[0] || '').replace(/\/$/, '');
    return a === b;
  }

  function visibleTarget(selector) {
    if (!selector) return null;
    return Array.from(document.querySelectorAll(selector)).find(node => {
      const rect = node.getBoundingClientRect();
      return rect.width && rect.height && getComputedStyle(node).visibility !== 'hidden';
    }) || null;
  }

  function scrollToTarget(target) {
    const rect = target.getBoundingClientRect();
    const viewport = viewportBounds();
    if (rect.top < viewport.top || rect.bottom > viewport.bottom ||
        rect.left < viewport.left || rect.right > viewport.right) {
      target.scrollIntoView({
        block: rect.height > viewport.height ? 'start' : 'center',
        inline: 'nearest', behavior: 'instant',
      });
    }
  }

  // -------------------- Tour state --------------------
  let idx = 0;
  let overlayNode = null;
  let tooltipNode = null;
  let highlightNode = null;
  let layoutObserver = null;
  let frame = 0;
  let navigating = false;
  let opener = null;

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
    window.removeEventListener('resize', schedulePosition);
    window.removeEventListener('scroll', schedulePosition, true);
    window.visualViewport?.removeEventListener('resize', schedulePosition);
    window.visualViewport?.removeEventListener('scroll', schedulePosition);
    layoutObserver?.disconnect();
    layoutObserver = null;
    cancelAnimationFrame(frame);
    frame = 0;
  }

  function finish(doneMessage) {
    clearStep();
    teardown();
    const launcher = opener?.isConnected && opener.getClientRects().length
      ? opener : visibleTarget('.aps-tour-nav-btn') || visibleTarget('#aps-mobile-nav-btn');
    launcher?.focus({ preventScroll: true });
    opener = null;
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
    else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    else if (e.key === 'ArrowLeft')  { e.preventDefault(); prev(); }
    else if (e.key === 'Tab') {
      const items = tooltipNode.querySelectorAll('button:not([disabled]), a[href], [tabindex="0"]');
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last.focus({ preventScroll: true });
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first.focus({ preventScroll: true });
      }
    }
  }

  function viewportBounds() {
    // A fixed dialog and its anchor must use the same viewport coordinates,
    // including when a phone's visual viewport is smaller than the layout viewport.
    const vv = window.visualViewport;
    const left = vv?.offsetLeft || 0, top = vv?.offsetTop || 0;
    const width = vv?.width || document.documentElement.clientWidth;
    const height = vv?.height || document.documentElement.clientHeight;
    return { top, left, width, height, right: left + width, bottom: top + height };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  function schedulePosition(event) {
    // Scrolling a long tour explanation does not move its page anchor.
    if (tooltipNode?.contains(event?.target instanceof Node ? event.target : null)) return;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; reposition(); });
  }

  function reposition() {
    const step = getSteps()[idx];
    if (!tooltipNode || !step) return;
    const v = viewportBounds();
    const pad = 10, gap = 14;
    const target = step.noHighlight ? null : visibleTarget(step.selector);
    const rect = target?.getBoundingClientRect();
    // Draw only the visible part. Large forms and tables can span several screens.
    const clipped = rect && {
      left: Math.max(v.left, rect.left - 5), right: Math.min(v.right, rect.right + 5),
      top: Math.max(v.top, rect.top - 5), bottom: Math.min(v.bottom, rect.bottom + 5),
    };
    const anchored = clipped && clipped.right > clipped.left && clipped.bottom > clipped.top;
    highlightNode.hidden = !anchored;
    overlayNode.classList.toggle('aps-tour-has-target', Boolean(anchored));
    if (anchored) {
      Object.assign(highlightNode.style, {
        left: clipped.left + 'px', top: clipped.top + 'px',
        width: clipped.right - clipped.left + 'px', height: clipped.bottom - clipped.top + 'px',
      });
    }

    const narrow = v.width <= 640;
    const preferredWidth = narrow ? v.width : anchored ? 380 : 480;
    tooltipNode.style.width = Math.min(preferredWidth, v.width - 2 * pad) + 'px';
    const maxHeight = anchored && narrow && v.height >= 400 ? v.height * 0.72 : v.height - 2 * pad;
    tooltipNode.style.maxHeight = maxHeight + 'px';
    const w = tooltipNode.offsetWidth, h = tooltipNode.offsetHeight;
    let x = v.left + (v.width - w) / 2, y = v.top + (v.height - h) / 2;
    let side = 'center';
    if (anchored) {
      const room = {
        bottom: v.bottom - clipped.bottom - gap - pad, top: clipped.top - v.top - gap - pad,
        right: v.right - clipped.right - gap - pad, left: clipped.left - v.left - gap - pad,
      };
      const preferred = ['top', 'left', 'right', 'bottom'].includes(step.placement) ? step.placement : 'bottom';
      const order = [preferred, 'bottom', 'top', 'right', 'left'];
      const heightSide = s => s === 'top' || s === 'bottom';
      side = order.find(s => room[s] >= (heightSide(s) ? h : w));
      // If the anchor spans the screen, dock against the edge with more room.
      if (!side) side = room.bottom >= room.top ? 'bottom' : 'top';
      if (heightSide(side)) {
        x = (clipped.left + clipped.right - w) / 2;
        y = side === 'top' ? clipped.top - h - gap : clipped.bottom + gap;
      } else {
        y = (clipped.top + clipped.bottom - h) / 2;
        x = side === 'left' ? clipped.left - w - gap : clipped.right + gap;
      }
    }
    tooltipNode.style.left = clamp(x, v.left + pad, v.right - w - pad) + 'px';
    tooltipNode.style.top = clamp(y, v.top + pad, v.bottom - h - pad) + 'px';
    tooltipNode.dataset.placement = side;
  }

  function renderStep() {
    const steps = getSteps();
    const meta = getMeta();
    const step = steps[idx];
    if (!step) { finish('Tour complete! You can restart it any time from the “Guided Tour” button.'); return; }

    // If the current page doesn't match the step's page, navigate there.
    if (!onPage(step.page)) {
      navigating = true;
      saveStep(idx);
      const destination = new URL(step.page, window.location.href);
      destination.searchParams.set('tour', '1');
      destination.searchParams.set('tourStep', String(idx));
      window.location.assign(destination.href);
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
    const target = step.noHighlight ? null : visibleTarget(step.selector);

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
      onclick: prev,
    }, '← Back');
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
    // Keep the close and navigation buttons visible even when the explanation
    // is longer than the viewport. Only this middle section scrolls.
    const content = el('div', { class: 'aps-tour-content', tabindex: '0', role: 'region', 'aria-labelledby': 'aps-tour-title' }, [title, body, hint]);
    tooltipNode.appendChild(content);
    tooltipNode.appendChild(progress);
    tooltipNode.appendChild(foot);

    if (target && step.autoScroll !== false) scrollToTarget(target);
    reposition();
    nextBtn.focus({ preventScroll: true });
    saveStep(idx);
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', schedulePosition);
    window.addEventListener('scroll', schedulePosition, true);
    window.visualViewport?.addEventListener('resize', schedulePosition);
    window.visualViewport?.addEventListener('scroll', schedulePosition);
    if (window.ResizeObserver) {
      layoutObserver ||= new ResizeObserver(schedulePosition);
      layoutObserver.disconnect();
      layoutObserver.observe(tooltipNode);
      if (target) layoutObserver.observe(target);
    }
  }

  function next() {
    if (navigating) return;
    idx++; renderStep();
  }
  function prev() {
    if (navigating) return;
    idx = Math.max(0, idx - 1); renderStep();
  }

  // -------------------- Public API --------------------
  function start(fromStart, resumeStep) {
    const steps = getSteps();
    if (navigating || !steps.length) return;
    document.querySelectorAll('.aps-tour-toast').forEach(toast => toast.remove());
    if (fromStart) opener = document.activeElement?.closest('.aps-tour-nav-btn');
    idx = fromStart ? 0 : resumeStep ?? loadStep();
    if (!Number.isInteger(idx) || idx < 0 || idx >= steps.length) idx = 0;
    renderStep();
  }

  // If this page was opened as part of a running tour (?tour=1), resume.
  //
  // June 5, 2026 — Dr. Gandhi pass:
  // The auto-launch on first login was removed entirely. The tour
  // only ever runs now when the user explicitly clicks the "Guided
  // Tour" button (calls window.APSGuidedTour.start()), or when a step
  // navigates to a new page with ?tour=1 to resume mid-tour.  This
  // function still cleans up the ?tour=1 query param so reloads
  // don't loop, and still honors explicit resume — but it will NOT
  // launch the tour from cold on its own, regardless of any legacy
  // localStorage flag.  We also write a permanent "user has been
  // here" marker on every page load so even if the auto-launch
  // gating logic is ever revived, returning users won't be ambushed.
  function autoResumeOnLoad() {
    const qs = new URLSearchParams(window.location.search);
    const resume = qs.get('tour');
    const userId = getMeta().userId;
    if (userId) {
      try {
        localStorage.setItem(LS_AUTOLAUNCH_USER, String(userId));
        localStorage.setItem(LS_AUTOLAUNCH, '1');
      } catch (e) {}
    }
    if (resume) {
      const value = qs.get('tourStep');
      const resumeStep = value !== null && /^\d+$/.test(value) ? Number(value) : undefined;
      // Clean the query string so reloads don't keep resuming.
      try {
        qs.delete('tour');
        qs.delete('tourStep');
        const newUrl = window.location.pathname + (qs.toString() ? ('?' + qs.toString()) : '') + window.location.hash;
        window.history.replaceState({}, '', newUrl);
      } catch (e) {}
      start(false, resumeStep);
    }
  }

  window.APSGuidedTour = {
    start: function () { start(true); },
    resume: function () { start(false); },
    close: function () { finish(); },
  };

  // A restored browser-history entry can still contain the dialog from before
  // cross-page navigation. Allow the restored page to launch a fresh tour.
  window.addEventListener('pageshow', event => {
    if (event.persisted) {
      navigating = false;
      teardown();
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', autoResumeOnLoad);
  } else {
    autoResumeOnLoad();
  }
})();
