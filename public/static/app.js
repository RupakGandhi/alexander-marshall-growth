// ============================================================================
// Alexander Public Schools — Marshall Growth Platform · client helpers
// ----------------------------------------------------------------------------
//  • Signature Pad (used on teacher acknowledgement + appraiser publish)
//  • Service-worker registration + update notification
//  • PWA install prompt ("Install app" button shown when eligible)
//  • Online / offline banner
//  • Auto-dismiss flash messages
//  • User-menu toggle
//  • Mobile-nav (hamburger) toggle
// ============================================================================
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
    window.addEventListener('orientationchange', resize);

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
      clear() { ctx.clearRect(0, 0, canvas.width, canvas.height); dirty = false; },
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

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('canvas[id^="sig-pad"]').forEach((c) => initPad(c.id));
  });

  // -------------------------- Service Worker + updates --------------------------
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/static/sw.js').then((reg) => {
        if (!reg) return;
        // Detect a fresh SW waiting to activate → prompt user to refresh.
        function promptToUpdate(sw) {
          if (!sw) return;
          const banner = document.createElement('div');
          banner.className = 'aps-update-banner';
          banner.innerHTML =
            '<span><i class="fas fa-rotate-right"></i> A new version is available.</span>' +
            '<button type="button" class="aps-update-btn">Refresh</button>';
          document.body.appendChild(banner);
          banner.querySelector('.aps-update-btn').addEventListener('click', () => {
            sw.postMessage('SKIP_WAITING');
          });
        }
        if (reg.waiting) promptToUpdate(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const newer = reg.installing;
          if (!newer) return;
          newer.addEventListener('statechange', () => {
            if (newer.state === 'installed' && navigator.serviceWorker.controller) {
              promptToUpdate(newer);
            }
          });
        });
        let refreshing = false;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (refreshing) return;
          refreshing = true;
          window.location.reload();
        });
      }).catch(() => { /* ignore */ });
    });
  }

  // -------------------------- PWA Install prompt --------------------------
  let deferredInstall = null;
  const INSTALL_HIDE_KEY = 'aps_install_dismissed';

  function isStandalone() {
    return (
      window.matchMedia && window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  function showInstallButton() {
    // Don't nag users who already installed or already dismissed.
    if (isStandalone()) return;
    try { if (localStorage.getItem(INSTALL_HIDE_KEY) === '1') return; } catch (e) {}
    if (document.querySelector('.aps-install-fab')) return;
    const fab = document.createElement('button');
    fab.type = 'button';
    fab.className = 'aps-install-fab';
    fab.setAttribute('aria-label', 'Install the Marshall Growth Platform app');
    fab.innerHTML = '<i class="fas fa-download"></i><span>Install app</span>' +
                    '<span class="aps-install-x" aria-label="Dismiss" title="Dismiss">×</span>';
    fab.addEventListener('click', async (e) => {
      if (e.target.classList.contains('aps-install-x')) {
        e.stopPropagation();
        try { localStorage.setItem(INSTALL_HIDE_KEY, '1'); } catch (err) {}
        fab.remove();
        return;
      }
      if (!deferredInstall) return;
      fab.disabled = true;
      deferredInstall.prompt();
      try {
        const choice = await deferredInstall.userChoice;
        if (choice && choice.outcome === 'accepted') {
          fab.remove();
        } else {
          fab.disabled = false;
        }
      } catch (err) { fab.disabled = false; }
      deferredInstall = null;
    });
    document.body.appendChild(fab);
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    showInstallButton();
  });
  window.addEventListener('appinstalled', () => {
    const fab = document.querySelector('.aps-install-fab');
    if (fab) fab.remove();
    try { localStorage.removeItem(INSTALL_HIDE_KEY); } catch (e) {}
  });

  // iOS Safari doesn't fire beforeinstallprompt. Show a one-time hint card.
  document.addEventListener('DOMContentLoaded', () => {
    const ua = navigator.userAgent || '';
    const iOS = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
    if (iOS && !isStandalone()) {
      try {
        if (localStorage.getItem('aps_ios_install_hint') !== '1') {
          // Show the hint only on the first real page (not when clicking /login)
          setTimeout(() => {
            if (document.querySelector('.aps-ios-install-hint')) return;
            const hint = document.createElement('div');
            hint.className = 'aps-ios-install-hint';
            hint.innerHTML =
              '<strong>Install this app:</strong> Tap <i class="fas fa-arrow-up-from-bracket"></i> Share, then <strong>Add to Home Screen</strong>.' +
              '<button type="button" class="aps-ios-x" aria-label="Dismiss">×</button>';
            document.body.appendChild(hint);
            hint.querySelector('.aps-ios-x').addEventListener('click', () => {
              hint.remove();
              try { localStorage.setItem('aps_ios_install_hint', '1'); } catch (e) {}
            });
          }, 4000);
        }
      } catch (e) {}
    }
  });

  // -------------------------- Online / offline --------------------------
  function setOnline(on) {
    const existing = document.querySelector('.aps-offline-banner');
    if (on) { if (existing) existing.remove(); return; }
    if (existing) return;
    const banner = document.createElement('div');
    banner.className = 'aps-offline-banner';
    banner.setAttribute('role', 'status');
    banner.innerHTML = '<i class="fas fa-wifi-slash"></i> You\'re offline — changes can\'t be saved until you reconnect.';
    document.body.appendChild(banner);
  }
  window.addEventListener('online', () => setOnline(true));
  window.addEventListener('offline', () => setOnline(false));
  document.addEventListener('DOMContentLoaded', () => {
    if (navigator.onLine === false) setOnline(false);
  });

  // -------------------------- Flash-message auto-dismiss --------------------------
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
    if (panel && root && !root.contains(e.target)) {
      panel.classList.add('hidden');
      const btn = document.getElementById('user-menu-btn');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    }
    // Mobile nav auto-close on outside click
    const mnav = document.getElementById('aps-mobile-nav');
    const mbtn = document.getElementById('aps-mobile-nav-btn');
    if (mnav && !mnav.classList.contains('hidden') && mbtn && !mbtn.contains(e.target) && !mnav.contains(e.target)) {
      mnav.classList.add('hidden');
      mbtn.setAttribute('aria-expanded', 'false');
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
      const mnav = document.getElementById('aps-mobile-nav');
      if (mnav && !mnav.classList.contains('hidden')) {
        mnav.classList.add('hidden');
        const mbtn = document.getElementById('aps-mobile-nav-btn');
        if (mbtn) mbtn.setAttribute('aria-expanded', 'false');
      }
    }
  });

  // -------------------------- Mobile nav (hamburger) --------------------------
  window.toggleMobileNav = function (event) {
    if (event) event.stopPropagation();
    const panel = document.getElementById('aps-mobile-nav');
    const btn = document.getElementById('aps-mobile-nav-btn');
    if (!panel || !btn) return;
    const nowOpen = panel.classList.contains('hidden');
    panel.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', nowOpen ? 'true' : 'false');
  };
})();
