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

  // ======================================================================
  // Notification Bell + Web Push
  // ----------------------------------------------------------------------
  // Drives the bell icon in the header:
  //   • Polls /api/notifications/summary every 45s for the unread badge
  //   • Lazy-loads full list on first open
  //   • Exposes window.APSBell.{toggle, open, close, refresh, markAllRead}
  //   • Also registers a Web Push subscription the first time the user
  //     interacts with the bell (required by browsers for permission).
  // ======================================================================
  const APSBell = {
    _panel: null, _list: null, _badge: null, _btn: null, _empty: null,
    _loaded: false, _pollTimer: null,
    _refs() {
      this._panel = document.getElementById('aps-bell-panel');
      this._list  = document.getElementById('aps-bell-list');
      this._badge = document.getElementById('aps-bell-badge');
      this._btn   = document.getElementById('aps-bell-btn');
      this._empty = document.getElementById('aps-bell-empty');
      return !!this._panel;
    },
    toggle(ev) {
      if (ev) ev.stopPropagation();
      if (!this._refs()) return;
      const open = this._panel.classList.contains('hidden');
      this._panel.classList.toggle('hidden');
      this._btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) { this.refresh(); this._ensurePushSubscribed(); }
    },
    close() {
      if (!this._refs()) return;
      this._panel.classList.add('hidden');
      this._btn.setAttribute('aria-expanded', 'false');
    },
    async refresh() {
      if (!this._refs()) return;
      try {
        const r = await fetch('/api/notifications', { credentials: 'include' });
        if (!r.ok) return;
        const data = await r.json();
        this._render(data.items || []);
        this._updateBadge(data.unread || 0);
        this._loaded = true;
      } catch (_) { /* network fail is OK — poll will retry */ }
    },
    async summary() {
      try {
        const r = await fetch('/api/notifications/summary', { credentials: 'include' });
        if (!r.ok) return;
        const data = await r.json();
        this._refs();
        this._updateBadge(data.unread || 0);
      } catch (_) {}
    },
    _updateBadge(n) {
      if (!this._badge) return;
      if (n > 0) {
        this._badge.textContent = n > 99 ? '99+' : String(n);
        this._badge.classList.remove('hidden');
      } else {
        this._badge.classList.add('hidden');
      }
    },
    _render(items) {
      if (!this._list) return;
      if (items.length === 0) {
        this._list.innerHTML = '<div class="p-8 text-center text-slate-400 text-xs"><i class="far fa-bell-slash text-2xl mb-2 block"></i>No notifications yet.</div>';
        return;
      }
      const sevColor = {
        success: 'text-emerald-600', warning: 'text-amber-600',
        action: 'text-aps-navy', info: 'text-slate-500',
      };
      const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]);
      const rel = (iso) => {
        try {
          const d = String(iso || '').replace(' ','T');
          const t = new Date(/Z$/.test(d) ? d : d + 'Z').getTime();
          const diff = (Date.now() - t) / 1000;
          if (diff < 60) return 'just now';
          if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
          if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
          return Math.floor(diff / 86400) + 'd ago';
        } catch (e) { return ''; }
      };
      const html = items.map((n) => {
        const read = !!n.read_at;
        const sev  = sevColor[n.severity] || sevColor.info;
        const dot  = read ? '' : '<span class="absolute top-3 right-3 w-2 h-2 rounded-full bg-aps-blue"></span>';
        const rowBg = read ? 'bg-white hover:bg-slate-50' : 'bg-sky-50/60 hover:bg-sky-50';
        const url  = esc(n.url || '#');
        const actor = (n.actor_first || n.actor_last) ? ('<span class="text-slate-500"> · ' + esc(n.actor_first||'') + ' ' + esc(n.actor_last||'') + '</span>') : '';
        return (
          '<div class="relative border-b border-slate-100 ' + rowBg + '">' +
            dot +
            '<a href="' + url + '" class="flex gap-3 p-3" data-id="' + n.id + '" data-nav="1">' +
              '<div class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center ' + sev + ' shrink-0"><i class="fas ' + esc(n.icon || 'fa-bell') + '"></i></div>' +
              '<div class="flex-1 min-w-0">' +
                '<div class="text-sm font-medium text-slate-800 truncate">' + esc(n.title) + '</div>' +
                (n.body ? '<div class="text-xs text-slate-600 mt-0.5 line-clamp-2">' + esc(n.body) + '</div>' : '') +
                '<div class="text-[11px] text-slate-400 mt-1">' + rel(n.created_at) + actor + '</div>' +
              '</div>' +
            '</a>' +
          '</div>'
        );
      }).join('');
      this._list.innerHTML = html;
      // Mark read when clicked + navigate
      this._list.querySelectorAll('a[data-nav]').forEach((a) => {
        a.addEventListener('click', (ev) => {
          const id = a.getAttribute('data-id');
          // fire-and-forget — do not block navigation
          try { fetch('/api/notifications/' + id + '/read', { method: 'POST', credentials: 'include' }); } catch (e) {}
        });
      });
    },
    async markAllRead() {
      try {
        await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'include' });
        this._updateBadge(0);
        if (this._loaded) this.refresh();
      } catch (e) {}
    },
    startPolling() {
      if (this._pollTimer) return;
      this.summary();
      this._pollTimer = setInterval(() => this.summary(), 45000);
      // Also refresh when the tab regains focus
      document.addEventListener('visibilitychange', () => { if (!document.hidden) this.summary(); });
    },
    // Web Push — registered only after user opens the bell (interaction gate)
    async _ensurePushSubscribed() {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
      try {
        const reg = await navigator.serviceWorker.ready;
        let sub = await reg.pushManager.getSubscription();
        if (sub) return; // already subscribed on this device
        if (Notification.permission === 'denied') return;
        if (Notification.permission !== 'granted') {
          const p = await Notification.requestPermission();
          if (p !== 'granted') return;
        }
        const keyRes = await fetch('/api/push/public-key', { credentials: 'include' });
        if (!keyRes.ok) return;
        const { publicKey } = await keyRes.json();
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey),
        });
        await fetch('/api/push/subscribe', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(sub.toJSON ? sub.toJSON() : sub),
        });
      } catch (e) { /* permission denied / unsupported — silently skip */ }
    },
  };
  window.APSBell = APSBell;

  // Bell opens from icon click; close on outside click like the user menu
  document.addEventListener('click', (e) => {
    const root = document.getElementById('aps-bell-root');
    const panel = document.getElementById('aps-bell-panel');
    if (root && panel && !panel.classList.contains('hidden') && !root.contains(e.target)) {
      APSBell.close();
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') APSBell.close();
  });
  document.addEventListener('DOMContentLoaded', () => {
    if (document.getElementById('aps-bell-btn')) APSBell.startPolling();
  });

  // Refresh summary right after a navigation (the freshest unread count
  // wins, so if the same page triggers a notification we'll pick it up).
  window.addEventListener('pageshow', () => { if (window.APSBell) APSBell.summary(); });

  function urlBase64ToUint8Array(base64String) {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const b64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(b64);
    const out = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
    return out;
  }
})();
