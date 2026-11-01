/*
 * Cache-busting boot loader. This file never changes; it loads our own files
 * with a fresh query string on every page load so neither the phone browser
 * nor the GitHub Pages CDN can serve a stale overlay. It also shows a small
 * version label (Last-Modified of mobile.js) and a reload pill.
 */
(() => {
  'use strict';
  const v = Date.now();
  const FILES = ['mobile/mobile.css', 'mobile/mobile.js', 'mobile/autostart.js'];

  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = `${FILES[0]}?v=${v}`;
  document.head.appendChild(css);

  // async=false keeps execution order for dynamically inserted scripts.
  for (const f of FILES.slice(1)) {
    const s = document.createElement('script');
    s.src = `${f}?v=${v}`;
    s.async = false;
    document.head.appendChild(s);
  }

  const ready = (fn) => (document.body ? fn() : document.addEventListener('DOMContentLoaded', fn));
  ready(() => {
    const label = document.createElement('div');
    label.id = 'gtaVersion';
    label.textContent = 'v …';
    document.body.appendChild(label);
    // Deploy time (Last-Modified) plus a few chars of the ETag, which changes with the content
    // even when the time header does not.
    fetch(`mobile/mobile.js?v=${v}`, { method: 'HEAD', cache: 'no-store' })
      .then((r) => {
        const lm = r.headers.get('last-modified');
        const etag = (r.headers.get('etag') || '').replace(/\W/g, '').slice(-4);
        if (!lm) return (label.textContent = 'v local' + (etag ? ` · ${etag}` : ''));
        const d = new Date(lm);
        label.textContent =
          'v ' +
          d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit' }) +
          ' ' +
          d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) +
          (etag ? ` · ${etag}` : '');
      })
      .catch(() => (label.textContent = 'v ?'));

    const reload = document.createElement('button');
    reload.type = 'button';
    reload.id = 'gtaReload';
    reload.className = 'gta-pill';
    reload.textContent = '↻';
    reload.title = 'Reload overlay files';
    // Reload with a unique query string: the page itself then bypasses the CDN cache too
    // (our files already load with ?v=<timestamp>). Visible feedback first.
    reload.addEventListener('pointerdown', (e) => { e.preventDefault(); reload.classList.add('is-down'); });
    reload.addEventListener('pointerup', async (e) => {
      e.preventDefault();
      reload.textContent = '…';
      try {
        await Promise.all(
          ['index.html', 'mobile/boot.js', ...FILES].map((f) => fetch(f, { cache: 'reload' }).catch(() => null))
        );
      } finally {
        location.replace(`${location.pathname}?r=${Date.now()}${location.hash}`);
      }
    });
    document.body.appendChild(reload);
  });
})();
