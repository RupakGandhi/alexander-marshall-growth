// Alexander Public Schools — Marshall Growth Platform · client helpers
(function () {
  'use strict';

  // -------------------------- Signature Pad --------------------------
  const pads = new Map();

  function initPad(canvasId) {
    if (pads.has(canvasId)) return pads.get(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    function resize() {
      const rect = canvas.getBoundingClientRect();
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.scale(dpr, dpr);
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#0b2545';
    }
    resize();
    window.addEventListener('resize', resize);

    let drawing = false;
    let last = null;
    let dirty = false;

    function pos(e) {
      const rect = canvas.getBoundingClientRect();
      const t = e.touches ? e.touches[0] : e;
      return { x: t.clientX - rect.left, y: t.clientY - rect.top };
    }

    function start(e) { e.preventDefault(); drawing = true; last = pos(e); }
    function move(e) {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke();
      last = p; dirty = true;
    }
    function end() { drawing = false; }

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('mouseleave', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);

    const api = {
      canvas,
      clear() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        dirty = false;
      },
      isDirty() { return dirty; },
      toDataURL() { return canvas.toDataURL('image/png'); },
    };
    pads.set(canvasId, api);
    return api;
  }

  window.SigPad = {
    clear(canvasId, hiddenId) {
      const p = initPad(canvasId); if (p) p.clear();
      const h = document.getElementById(hiddenId); if (h) h.value = '';
    },
    submit(canvasId, hiddenId) {
      const p = initPad(canvasId);
      if (!p || !p.isDirty()) {
        alert('Please sign before continuing.');
        return false;
      }
      const h = document.getElementById(hiddenId);
      if (h) h.value = p.toDataURL();
      return true;
    },
  };

  // Initialize every canvas with class .signature-pad automatically
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('canvas[id^="sig-pad"]').forEach((c) => initPad(c.id));
  });

  // -------------------------- PWA service worker --------------------------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/static/sw.js').catch(() => {/* ignore */});
    });
  }

  // -------------------------- Tiny helpers --------------------------
  // Auto-dismiss flash messages after 5s
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-autodismiss]').forEach((el) => {
      setTimeout(() => { el.style.opacity = '0'; }, 5000);
      setTimeout(() => { el.remove(); }, 5500);
    });
  });

  // -------------------------- User menu (click-to-toggle) --------------------------
  window.toggleUserMenu = function (event) {
    if (event) event.stopPropagation();
    const panel = document.getElementById('user-menu-panel');
    const btn = document.getElementById('user-menu-btn');
    if (!panel || !btn) return;
    const nowOpen = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
  };
  document.addEventListener('click', (e) => {
    const panel = document.getElementById('user-menu-panel');
    const root = document.getElementById('user-menu-root');
    if (!panel || !root) return;
    if (!root.contains(e.target)) {
      panel.classList.add('hidden');
      const btn = document.getElementById('user-menu-btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const panel = document.getElementById('user-menu-panel');
      if (panel && !panel.classList.contains('hidden')) {
        panel.classList.add('hidden');
        const btn = document.getElementById('user-menu-btn');
        if (btn) btn.setAttribute('aria-expanded', 'false');
      }
    }
  });
})();
