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

// ============================================================================
// DomainTabs — Fix 1 (June 2, 2026 brief)
// ============================================================================
// Progressive enhancement for the <nav.aps-domain-tabs> rendered by
// layout.tsx's DomainTabs component. With JS disabled the anchor links still
// jump to the right section; with JS on we also:
//   • update the "active" pill as the user scrolls (IntersectionObserver)
//   • update the URL hash without scrolling the page when a tab is clicked
//   • horizontal-scroll the active tab into view on small screens
// Safe to load on pages that don't render the tabs — it no-ops gracefully.
(function(){
  'use strict';
  function init() {
    var bars = document.querySelectorAll('nav.aps-domain-tabs[data-domain-tabs="1"]');
    if (!bars.length) return;
    bars.forEach(function(bar){
      var prefix = bar.getAttribute('data-domain-prefix') || 'domain';
      var tabs   = Array.prototype.slice.call(bar.querySelectorAll('[data-domain-tab]'));
      if (!tabs.length) return;
      var codes  = tabs.map(function(a){ return a.getAttribute('data-domain-tab'); });
      function activate(code, opts){
        tabs.forEach(function(t){
          var on = t.getAttribute('data-domain-tab') === code;
          t.setAttribute('aria-selected', on ? 'true' : 'false');
          if (on) {
            t.classList.add('bg-aps-navy','text-white','border-aps-navy');
            t.classList.remove('bg-white','text-aps-navy','border-slate-300');
            // Scroll the pill into view inside the mobile horizontal scroller
            try { t.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } catch(_) {}
          } else {
            t.classList.remove('bg-aps-navy','text-white','border-aps-navy');
            t.classList.add('bg-white','text-aps-navy','border-slate-300');
          }
        });
        if (opts && opts.updateHash) {
          try { history.replaceState(null, '', '#' + prefix + '-' + code); } catch(_) {}
        }
      }
      // Click handler — intercept anchor jumps so we get smooth scroll.
      // If the target is a <details> element (June 4 2026: observation domains
      // collapse by default to minimize scrolling), auto-expand it on tab-click
      // so the appraiser lands on visible content.
      tabs.forEach(function(a){
        a.addEventListener('click', function(ev){
          var code = a.getAttribute('data-domain-tab');
          var target = document.getElementById(prefix + '-' + code);
          if (target) {
            ev.preventDefault();
            if (target.tagName === 'DETAILS' && !target.open) {
              target.open = true;
            }
            var top = target.getBoundingClientRect().top + window.scrollY - 110;
            window.scrollTo({ top: top, behavior: 'smooth' });
            activate(code, { updateHash: true });
          }
        });
      });
      // Observer — keep the right pill highlighted as the user scrolls
      var sections = codes.map(function(c){ return document.getElementById(prefix + '-' + c); }).filter(Boolean);
      if (sections.length && 'IntersectionObserver' in window) {
        var io = new IntersectionObserver(function(entries){
          // Pick the entry closest to the top that is intersecting
          var visible = entries.filter(function(e){ return e.isIntersecting; });
          if (!visible.length) return;
          visible.sort(function(a,b){ return a.boundingClientRect.top - b.boundingClientRect.top; });
          var topEntry = visible[0];
          var id = topEntry.target.id || '';
          var code = id.replace(prefix + '-', '');
          if (code) activate(code, { updateHash: false });
        }, { rootMargin: '-120px 0px -55% 0px', threshold: [0, 0.25, 0.5] });
        sections.forEach(function(s){ io.observe(s); });
      }
      // Honor the initial URL hash on first paint
      var initialHash = (location.hash || '').replace('#','');
      if (initialHash && initialHash.indexOf(prefix + '-') === 0) {
        var code = initialHash.replace(prefix + '-', '');
        if (codes.indexOf(code) >= 0) {
          activate(code, { updateHash: false });
          setTimeout(function(){
            var target = document.getElementById(initialHash);
            if (target) {
              // Auto-expand <details> sections when deep-linked
              if (target.tagName === 'DETAILS' && !target.open) {
                target.open = true;
              }
              var top = target.getBoundingClientRect().top + window.scrollY - 110;
              window.scrollTo({ top: top, behavior: 'auto' });
            }
          }, 50);
        }
      }
    });

    // June 4 2026 — Expand all / Collapse all helpers for the observation
    // domain accordions on the appraiser scoring page.  Buttons identified by
    // data-obs-domains-action="expand" or "collapse".  Operates on every
    // <details data-domain-section> on the current page.
    document.querySelectorAll('[data-obs-domains-action]').forEach(function(btn){
      btn.addEventListener('click', function(ev){
        ev.preventDefault();
        var action = btn.getAttribute('data-obs-domains-action');
        var open = (action === 'expand');
        document.querySelectorAll('details[data-domain-section]').forEach(function(d){
          d.open = open;
        });
      });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// ============================================================================
// Global AJAX form interceptor — June 4, 2026 (late evening) shipping fix
// ----------------------------------------------------------------------------
// Dr. Gandhi's complaint: "when making saves as a user in any field, the page
// auto refreshes and scrolls all the way to the top. The user then has to
// scroll all the way back down to what they were doing and that is annoying."
//
// Previously fixed for the score grid. This interceptor extends the same
// pattern to EVERY save form in the application — feedback edits, focus area
// notes, profile saves, goal saves, admin tweaks, PD reflections, deliverable
// submissions, etc. — without touching the server endpoints.
//
// Strategy:
//   1. Listen for submit on document (event delegation, works on any form
//      that exists now OR is added later via swap).
//   2. Skip forms in the denylist (login/logout, signature publish, anything
//      that needs a real navigation or sets a session cookie).
//   3. Skip forms that explicitly opt out (data-no-ajax="true") or that
//      already have their own AJAX handler (form.dataset.ajaxHandled or
//      ev.defaultPrevented = true by an earlier listener).
//   4. Capture { x, y } scroll position + the form's focused element id.
//   5. POST via fetch with redirect:'follow'. The server still does its
//      normal 302 to the canonical page — fetch follows and returns the
//      destination HTML.
//   6. Parse that HTML, replace <main> innerHTML, re-execute inline <script>
//      tags inside <main>, then restore scroll position and focus.
//   7. On any network error → fall back to a real form submit so the user
//      never loses data.
//
// Forms that already AJAX-save themselves (autosave engine, scoring grid,
// bulk-score buttons, feedback regenerator) are unaffected — they call
// preventDefault() before this listener sees them and we honor that.
// ============================================================================
(function(){
  'use strict';

  // Forms whose submit MUST trigger a real navigation (don't intercept).
  // Match by form `action` ending or by an explicit data-no-ajax flag.
  var DENY_ACTION_SUFFIXES = [
    '/login',                       // sets session cookie + role-based home
    '/logout',
    '/publish',                     // signature canvas + final navigation
    '/acknowledge',                 // teacher signature acknowledge flow
    '/print',                       // print views
    '/export',                      // file downloads
    '/download',
    '/import',                      // CSV uploads
    '/upload'
  ];

  function isDenied(form) {
    if (form.getAttribute('data-no-ajax') === 'true') return true;
    if (form.enctype && form.enctype.toLowerCase() === 'multipart/form-data') return true;
    var action = form.getAttribute('action') || window.location.pathname;
    for (var i = 0; i < DENY_ACTION_SUFFIXES.length; i++) {
      if (action.indexOf(DENY_ACTION_SUFFIXES[i]) !== -1) return true;
    }
    // GET forms = search/filter; let the browser handle them so the URL
    // updates and back-button works correctly.
    var method = (form.getAttribute('method') || 'get').toLowerCase();
    if (method !== 'post') return true;
    return false;
  }

  // Fixed-position "Saving / Saved" toast that lives OUTSIDE <main>, so it
  // survives the innerHTML swap when the destination page replaces <main>.
  // Top-right placement keeps it out of the way of the user's actual work.
  function ensureToastHost() {
    var host = document.getElementById('aps-ajax-toast');
    if (host) return host;
    host = document.createElement('div');
    host.id = 'aps-ajax-toast';
    host.style.cssText = 'position:fixed;top:14px;right:14px;z-index:9999;pointer-events:none;';
    document.body.appendChild(host);
    return host;
  }
  function showSavingPill(form) {
    var host = ensureToastHost();
    var pill = document.createElement('div');
    pill.className = 'aps-ajax-pill';
    pill.style.cssText = 'margin-top:6px;padding:6px 12px;border-radius:9999px;border:1px solid #bae6fd;background:#f0f9ff;color:#075985;font-size:12px;box-shadow:0 4px 12px rgba(15,23,42,0.08);';
    pill.innerHTML = '<i class="fas fa-circle-notch fa-spin" style="margin-right:6px"></i>Saving…';
    host.appendChild(pill);
    return pill;
  }
  function swapPillToSaved(pill) {
    if (!pill) return;
    pill.style.borderColor = '#a7f3d0';
    pill.style.background = '#ecfdf5';
    pill.style.color = '#065f46';
    pill.innerHTML = '<i class="fas fa-check" style="margin-right:6px"></i>Saved';
    setTimeout(function(){ if (pill && pill.parentNode) pill.parentNode.removeChild(pill); }, 1500);
  }
  function swapPillToError(pill) {
    if (!pill) return;
    pill.style.borderColor = '#fca5a5';
    pill.style.background = '#fee2e2';
    pill.style.color = '#991b1b';
    pill.innerHTML = '<i class="fas fa-triangle-exclamation" style="margin-right:6px"></i>Could not save';
    setTimeout(function(){ if (pill && pill.parentNode) pill.parentNode.removeChild(pill); }, 2500);
  }

  // Re-execute every <script> inside the swapped-in container.  innerHTML
  // assignment does NOT run inline <script> tags, so we walk and re-create
  // them.  Both inline and external scripts are handled.
  function executeScripts(container) {
    var scripts = container.querySelectorAll('script');
    for (var i = 0; i < scripts.length; i++) {
      var old = scripts[i];
      var fresh = document.createElement('script');
      // Copy attributes (src, type, etc.).
      for (var j = 0; j < old.attributes.length; j++) {
        var a = old.attributes[j];
        fresh.setAttribute(a.name, a.value);
      }
      fresh.text = old.textContent;
      if (old.parentNode) old.parentNode.replaceChild(fresh, old);
    }
  }

  // Re-run page-init helpers that attach to elements rendered inside <main>.
  // The original init() lives in the IIFE above and attaches listeners via
  // querySelectorAll, so we just need to call it again on the new DOM. We
  // expose it indirectly by re-dispatching DOMContentLoaded-like signals.
  function reinit() {
    // Re-attach the "Expand all / Collapse all" buttons and any other
    // per-page hooks that were originally bound during init().
    document.querySelectorAll('[data-obs-domains-action]').forEach(function(btn){
      if (btn.__apsBound) return;
      btn.__apsBound = true;
      btn.addEventListener('click', function(ev){
        ev.preventDefault();
        var action = btn.getAttribute('data-obs-domains-action');
        var open = (action === 'expand');
        document.querySelectorAll('details[data-domain-section]').forEach(function(d){ d.open = open; });
      });
    });
    // Let any other module that needs to rebind hook in.
    document.dispatchEvent(new CustomEvent('aps:ajax-swapped'));
  }

  // Capture scroll + focus, return a restorer.
  function captureContext() {
    var y = window.scrollY || window.pageYOffset || 0;
    var x = window.scrollX || window.pageXOffset || 0;
    var focusId = (document.activeElement && document.activeElement.id) || null;
    // Find the anchor the user is closest to so we can restore even if the
    // page height changed (e.g., a feedback item was added).
    var anchor = null;
    var anchorEls = document.querySelectorAll('[id]');
    var bestDelta = Infinity;
    for (var i = 0; i < anchorEls.length; i++) {
      var rect = anchorEls[i].getBoundingClientRect();
      var delta = Math.abs(rect.top - 100); // prefer something near top of viewport
      if (rect.top >= 0 && delta < bestDelta) { bestDelta = delta; anchor = anchorEls[i].id; }
    }
    return { x: x, y: y, focusId: focusId, anchor: anchor };
  }
  function restoreContext(ctx) {
    // Prefer the anchor (handles DOM growth/shrink correctly), else fall
    // back to the absolute Y we captured.
    if (ctx.anchor) {
      var el = document.getElementById(ctx.anchor);
      if (el) {
        var rect = el.getBoundingClientRect();
        var targetY = window.scrollY + rect.top - 100;
        window.scrollTo({ left: ctx.x, top: targetY, behavior: 'instant' in window ? 'instant' : 'auto' });
      } else {
        window.scrollTo(ctx.x, ctx.y);
      }
    } else {
      window.scrollTo(ctx.x, ctx.y);
    }
    if (ctx.focusId) {
      var f = document.getElementById(ctx.focusId);
      if (f && typeof f.focus === 'function') {
        try { f.focus({ preventScroll: true }); } catch (_) { f.focus(); }
      }
    }
  }

  document.addEventListener('submit', function(ev){
    // Bubble phase (no `true` 3rd arg) so per-form handlers like the score
    // grid's instant-save listener fire FIRST and can call preventDefault()
    // — we honor it via the defaultPrevented check.
    if (ev.defaultPrevented) return;
    var form = ev.target;
    if (!form || form.tagName !== 'FORM') return;
    if (isDenied(form)) return;

    ev.preventDefault();
    var pill = showSavingPill(form);
    var ctx = captureContext();
    // Honor button[formaction] / formmethod when the user clicks a button
    // that overrides the form's defaults — used by the Delete buttons on
    // teacher goals and appraiser feedback items.
    var submitter = ev.submitter;
    var url = (submitter && submitter.getAttribute('formaction'))
      || form.getAttribute('action')
      || window.location.pathname;
    var method = ((submitter && submitter.getAttribute('formmethod'))
      || form.getAttribute('method')
      || 'POST').toUpperCase();
    // Re-check denylist against the resolved URL (the submitter's formaction
    // could point at a denied endpoint even though the form's action does not).
    for (var i = 0; i < DENY_ACTION_SUFFIXES.length; i++) {
      if (url.indexOf(DENY_ACTION_SUFFIXES[i]) !== -1) {
        // Remove our pill and let the native submit proceed.
        if (pill && pill.parentNode) pill.parentNode.removeChild(pill);
        // We already preventDefault()-ed — we need to re-submit natively.
        var fallback = form.cloneNode(true);
        if (submitter && submitter.name) {
          var hi = document.createElement('input');
          hi.type = 'hidden'; hi.name = submitter.name; hi.value = submitter.value || '';
          fallback.appendChild(hi);
        }
        // Apply the submitter's formaction so the destination is correct.
        if (submitter && submitter.getAttribute('formaction')) {
          fallback.setAttribute('action', submitter.getAttribute('formaction'));
        }
        fallback.style.display = 'none';
        fallback.setAttribute('data-no-ajax', 'true');
        document.body.appendChild(fallback);
        fallback.submit();
        return;
      }
    }
    var fd = new FormData(form);
    // If a named submitter was clicked, include its name=value in the body
    // so server-side switches (e.g., "save" vs "save_and_continue") still work.
    if (submitter && submitter.name) {
      fd.set(submitter.name, submitter.value || '');
    }

    fetch(url, {
      method: method,
      body: fd,
      credentials: 'same-origin',
      redirect: 'follow',           // server still 302s → we land on the canonical page
      headers: { 'X-Requested-With': 'XMLHttpRequest' }
    }).then(function(res){
      if (!res.ok && res.status !== 0) {
        // Bad request, server error, etc. — surface as error pill but
        // ALSO try to render the response body so the user sees the
        // server's error message.
        return res.text().then(function(html){
          swapPillToError(pill);
          // For 400/403 etc, fall through to a real navigation so the
          // user sees the server's error page.
          throw new Error('http_' + res.status);
        });
      }
      return res.text().then(function(html){
        return { html: html, finalUrl: res.url || url };
      });
    }).then(function(result){
      // Parse the destination HTML and swap the <main> region.
      var doc;
      try {
        doc = new DOMParser().parseFromString(result.html, 'text/html');
      } catch (e) {
        // Parse failed — fall back to a real reload of the destination.
        window.location.href = result.finalUrl;
        return;
      }
      var newMain = doc.querySelector('main');
      var curMain = document.querySelector('main');
      if (newMain && curMain) {
        // Update the document title to match the new page.
        if (doc.title) document.title = doc.title;
        // Update the URL bar to the destination URL so the back button
        // and reload work correctly, without triggering navigation.
        if (result.finalUrl && result.finalUrl !== window.location.href) {
          try { window.history.replaceState(null, '', result.finalUrl); } catch (_) {}
        }
        curMain.innerHTML = newMain.innerHTML;
        executeScripts(curMain);
        reinit();
        swapPillToSaved(pill);
        // Pill was inside the old <main> — it's gone now after swap. That's
        // fine; the green "Saved" pill we attached lived inside the old
        // form's DOM which has been replaced.  Restore scroll instead.
        restoreContext(ctx);
      } else {
        // Couldn't find <main> in the response — likely a special page;
        // do a normal navigation so we don't lose state.
        window.location.href = result.finalUrl;
      }
    }).catch(function(err){
      // Network failure or non-2xx — fall back to a real submit so the
      // user never loses their data.  We rebuild the request as a hidden
      // form so the browser handles it the original way.
      swapPillToError(pill);
      if (err && String(err.message).indexOf('http_') === 0) {
        // Already shown — let the user retry; do nothing else.
        return;
      }
      // Otherwise: full reload-and-resubmit via native form.
      var fallback = form.cloneNode(true);
      fallback.style.display = 'none';
      fallback.removeAttribute('data-ajax');
      fallback.setAttribute('data-no-ajax', 'true');
      document.body.appendChild(fallback);
      fallback.submit();
    });
  });

  // Expose for debugging.
  window.APS_AjaxForms = { isDenied: isDenied };
})();
