/*
 * GTA2 mobile overlay (touch controls), ported from gta-js-mobile.
 *
 * Strategy: the port reads the keyboard through `keydown` / `keyup` listeners
 * on `window`, keyed by `event.code` (web/shell.js wireInput). This overlay
 * never touches the engine: it synthesises KeyboardEvents from touch input and
 * reads the live state the shell already exposes (`window.gta2.map.last`).
 *
 *   Bottom-left  → fixed joystick, absolute direction of travel on screen;
 *                  pointing behind a car = reverse (hysteresis)
 *   Right side   → FIRE (KeyL), ENTER/EXIT (Enter), JUMP/BRAKE (Space)
 *   Top bar      → saves, menu (Escape), map (KeyM), fullscreen, sound, tune, reload
 *   Top bar      → also the Saves screen (the port's own save states)
 *   Right, under the HUD → current weapon + ammo, ◀ ▶ = previous / next (KeyJ / KeyK)
 *
 * While the game shows its own front-end menus (no player yet, game over) the
 * stick sends arrow keys and the buttons send Enter / Escape ("menu mode").
 * The overlay hides itself on the landing page and behind the shell's screens
 * (map, saves, controls).
 */
(() => {
  'use strict';

  if (!matchMedia('(pointer: coarse)').matches && !/Mobi|Android/i.test(navigator.userAgent)) {
    // Desktop: do nothing unless explicitly requested with ?touch
    if (!location.search.includes('touch')) return;
  }
  document.documentElement.classList.add('gta-touch');

  // Phones: fill the window instead of letterboxing to 16:9 (the shell reads this at start).
  try { if (localStorage.getItem('gta2-port-aspect') === null) localStorage.setItem('gta2-port-aspect', 'auto'); } catch { /* ignore */ }

  // ---------- Synthetic keyboard (the port's default bindings, web/shell.js PORT_CONTROLS) ----------
  const KEYS = {
    KeyW: { key: 'w' }, KeyS: { key: 's' }, KeyA: { key: 'a' }, KeyD: { key: 'd' },
    KeyL: { key: 'l' }, KeyJ: { key: 'j' }, KeyK: { key: 'k' }, KeyM: { key: 'm' },
    Space: { key: ' ' }, Enter: { key: 'Enter' }, Escape: { key: 'Escape' },
    ArrowUp: { key: 'ArrowUp' }, ArrowDown: { key: 'ArrowDown' }, ArrowLeft: { key: 'ArrowLeft' }, ArrowRight: { key: 'ArrowRight' },
  };
  const down = new Set();

  function emit(type, code) {
    const def = KEYS[code] || { key: code };
    window.dispatchEvent(new KeyboardEvent(type, { code, key: def.key, bubbles: true, cancelable: true, repeat: false }));
  }
  function press(code) {
    if (down.has(code)) return;
    down.add(code);
    emit('keydown', code);
  }
  function release(code) {
    if (!down.has(code)) return;
    down.delete(code);
    emit('keyup', code);
  }
  function tap(code) {
    emit('keydown', code);
    emit('keyup', code);
  }
  function releaseAll() {
    for (const code of [...down]) release(code);
  }

  // ---------- Game state (web/shell.js exposes window.gta2 once the game starts) ----------
  const G = () => window.gta2;
  // Per-frame state the shell's map reads from the engine: hasPlayer, inCar, heading (rad), x, y.
  const live = () => { const g = G(); return (g && g.map && g.map.last) || null; };
  // gta2_dev_state (port/platform/dev_hooks.cpp): speed (magnitude), weapon + ammo for the pill.
  let devState = null;
  function readDev() {
    const g = G();
    if (!g || !g.Module) return null;
    try {
      const M = g.Module;
      const p = M.ccall('gta2_dev_state', 'number', [], []);
      const v = M.HEAP32.subarray(p >> 2, (p >> 2) + 10);
      if (!v[0]) return null;
      return { inCar: !!v[1], speed: v[5] / 16384, carModel: v[6], weapon: v[8], ammo: v[9] };
    } catch {
      return null;
    }
  }

  // ---------- Icons (inline SVG, Material-style, 24px viewBox) ----------
  const svg = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;
  const ICONS = {
    fullscreen: svg('M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z'),
    soundOn: svg('M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0014 7.97v8.05A4.47 4.47 0 0016.5 12zM14 3.23v2.06a7 7 0 010 13.42v2.06a9 9 0 000-17.54z'),
    soundOff: svg('M16.5 12A4.5 4.5 0 0014 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0021 12a9 9 0 00-7-8.77v2.06A7 7 0 0119 12zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06a8.99 8.99 0 003.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z'),
    gear: svg('M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z'),
    save: svg('M17 3H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V7l-4-4zm-5 16a3 3 0 110-6 3 3 0 010 6zm3-10H5V5h10v4z'),
    map: svg('M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z'),
    reload: svg('M17.65 6.35A7.96 7.96 0 0012 4a8 8 0 108 8h-2a6 6 0 11-1.76-4.24L13 11h7V4l-2.35 2.35z'),
  };
  window.gtaIcons = ICONS;

  // ---------- DOM ----------
  const root = document.createElement('div');
  root.id = 'gtaMobile';
  root.innerHTML = `
    <div id="gtaStick">
      <div class="gta-ring gta-ring-move"></div>
      <div id="gtaHeading">
        <div class="gta-rev-sector"></div>
        <div class="gta-rev-line gta-rev-line-a"></div>
        <div class="gta-rev-line gta-rev-line-b"></div>
        <div class="gta-heading-arrow"></div>
      </div>
      <div id="gtaStickKnob"></div>
    </div>
    <div id="gtaStickZone"></div>

    <button type="button" class="gta-btn gta-btn-fire" data-key="KeyL" id="gtaFire">Fire</button>
    <button type="button" class="gta-btn gta-btn-enter" data-key="Enter" id="gtaEnter">Enter</button>
    <button type="button" class="gta-btn gta-btn-jump" data-key="Space" data-menu-key="Escape" id="gtaJump">Jump</button>

    <div id="gtaTopBar">
      <button type="button" class="gta-pill" id="gtaSaveBtn" aria-label="Saves">${ICONS.save}</button>
      <button type="button" class="gta-pill" id="gtaMenu" data-tap="Escape" aria-label="Game menu (Esc)">?</button>
      <button type="button" class="gta-pill" id="gtaMap" data-tap="KeyM" aria-label="Map (M)">${ICONS.map}</button>
      <button type="button" class="gta-pill" id="gtaFullscreen" aria-label="Fullscreen">${ICONS.fullscreen}</button>
      <button type="button" class="gta-pill" id="gtaSound" aria-label="Sound on/off">${ICONS.soundOff}</button>
      <button type="button" class="gta-pill" id="gtaTune" aria-label="Tune controls">${ICONS.gear}</button>
    </div>
    <div id="gtaWeapons">
      <button type="button" class="gta-pill" id="gtaWeaponPrev" data-tap="KeyJ" aria-label="Previous weapon">◀</button>
      <button type="button" class="gta-pill is-on" id="gtaWeapon">—</button>
      <button type="button" class="gta-pill" id="gtaWeaponNext" data-tap="KeyK" aria-label="Next weapon">▶</button>
    </div>
    <div id="gtaTunePanel" class="gta-panel" hidden>
      <div class="gta-panel-title">Tune controls</div>
      <div class="gta-tune-rows"></div>
      <div class="gta-panel-actions">
        <button type="button" class="gta-pill gta-pill--danger gta-tune-reset">Reset defaults</button>
        <button type="button" class="gta-pill gta-pill--primary gta-tune-close">Close</button>
      </div>
    </div>
  `;
  const mount = () => document.body.appendChild(root);
  if (document.body) mount();
  else document.addEventListener('DOMContentLoaded', mount);

  // ---------- Touch hardening ----------
  // Browsers turn touches into gestures we never want in a game: long-press
  // (context menu / iOS callout / text selection), double-tap zoom, pinch
  // zoom, pull-to-refresh, text-selection drag. CSS (touch-action, user-select,
  // touch-callout) covers most of it; the rest needs non-passive listeners.
  // Only the game canvases and our own controls are hardened: the shell's own
  // UI (landing page, saves / controls screens, lobby) keeps native behaviour,
  // including the `click` events it listens for.
  const isFormControl = (t) =>
    !!t && !!t.closest && !!t.closest('input, textarea, select, label, a, dialog, .gta-panel, #landing, #topnav, #saves-screen, #controls-screen, #picker, #coop, #tools');
  const isGameSurface = (t) =>
    !!t && !!t.closest && (t.tagName === 'CANVAS' || !!t.closest('#gtaMobile'));

  document.addEventListener('contextmenu', (e) => {
    if (!isFormControl(e.target)) e.preventDefault();
  });
  document.addEventListener('selectstart', (e) => {
    if (!isFormControl(e.target)) e.preventDefault();
  });
  document.addEventListener('dblclick', (e) => {
    if (!isFormControl(e.target)) e.preventDefault();
  });
  // Cancelling touchstart on the game surface suppresses the long-press
  // callout, double-tap zoom and the synthesised click; pointer events keep
  // firing, which is all the overlay and the port's map screen use.
  const touchOpts = { passive: false, capture: true };
  for (const type of ['touchstart', 'touchmove', 'touchend']) {
    document.addEventListener(
      type,
      (e) => {
        if (isGameSurface(e.target) && !isFormControl(e.target)) e.preventDefault();
      },
      touchOpts
    );
  }
  // iOS pinch-zoom gestures
  for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
    document.addEventListener(type, (e) => e.preventDefault(), touchOpts);
  }

  // ---------- Modes ----------
  // 'play': the player exists (tank controls). 'menu': the game's own front end
  // (title, PLAY, game over): the stick sends arrows, Jump sends Escape.
  let mode = 'play';

  // ---------- Buttons (hold) ----------
  for (const btn of root.querySelectorAll('[data-key]')) {
    let code = null; // the key pressed at pointerdown, released at pointerup (mode may change in between)
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      btn.classList.add('is-down');
      code = mode === 'menu' && btn.dataset.menuKey ? btn.dataset.menuKey : btn.dataset.key;
      press(code);
    });
    const up = () => {
      if (!btn.classList.contains('is-down')) return;
      btn.classList.remove('is-down');
      if (code) release(code);
      code = null;
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
  }

  // ---------- Pills (tap) ----------
  // Fired on pointerup, deferred one task (same pattern as gta-js-mobile; no
  // `click` is synthesised on the overlay because touchstart is cancelled above).
  const onTap = (el, fn) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('is-down'); });
    el.addEventListener('pointerup', () => { el.classList.remove('is-down'); setTimeout(fn, 0); });
    el.addEventListener('pointercancel', () => el.classList.remove('is-down'));
  };
  for (const btn of root.querySelectorAll('[data-tap]')) onTap(btn, () => tap(btn.dataset.tap));

  // Saves: the port's own Saves screen (save states; pauses the game while open).
  onTap(root.querySelector('#gtaSaveBtn'), () => {
    const b = document.getElementById('saves-open');
    if (b) b.click();
  });

  // ---------- Fullscreen + orientation ----------
  const fsBtn = root.querySelector('#gtaFullscreen');
  if (!document.fullscreenEnabled && !document.documentElement.webkitRequestFullscreen) fsBtn.hidden = true;
  fsBtn.addEventListener('pointerdown', async (e) => {
    e.preventDefault();
    try {
      if (!document.fullscreenElement) {
        await (document.documentElement.requestFullscreen?.() ||
          document.documentElement.webkitRequestFullscreen?.());
        await screen.orientation?.lock?.('landscape').catch(() => {});
      } else {
        await document.exitFullscreen?.();
      }
    } catch {
      /* iOS Safari (iPhone) has no Fullscreen API: install as PWA instead */
    }
  });

  // ---------- Fixed joystick, absolute direction ----------
  //
  // The stick direction is the *direction of travel on screen*. GTA2 only has
  // tank controls (A/D rotate, W/S move), so a small controller runs every
  // frame: it reads the current heading from the shell's map state and presses
  // A/D until the character/car faces the right way, while holding W (or S).
  // There is no run key in GTA2, so distance only decides idle vs. move.
  //
  // ---------- Tunables (editable from the "Tune" panel, persisted) ----------
  const TUNE_KEY = 'gta2-mobile:tune';
  const TUNE_DEFS = [
    { k: 'ringMove', label: 'Stick · move ring (px)', def: 20, step: 2, min: 6, max: 60,
      help: 'Dead zone radius. Inside it the stick does nothing; beyond it you walk / drive.' },
    { k: 'turnStart', label: 'Turn · start (°)', def: 1, step: 1, min: 1, max: 30,
      help: 'Start turning when your heading is off the stick direction by more than this. Smaller = snappier but can jitter.' },
    { k: 'turnStop', label: 'Turn · stop (°)', def: 0, step: 1, min: 0, max: 20,
      help: 'Stop turning once the error is within this. Keep it below "Turn · start".' },
    { k: 'revEnter', label: 'Reverse · enter (°)', def: 130, step: 5, min: 90, max: 180,
      help: 'Cars only. If the stick points more than this behind the car, you reverse toward it instead of U-turning. Drawn as the dashed red sector.' },
    { k: 'revExit', label: 'Reverse · exit (°)', def: 100, step: 5, min: 60, max: 180,
      help: 'Leave reverse when the stick comes back within this angle. Keep it below "Reverse · enter" (hysteresis).' },
  ];
  const T = {};
  function loadTune() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(TUNE_KEY) || '{}') || {}; } catch { saved = {}; }
    for (const d of TUNE_DEFS) T[d.k] = typeof saved[d.k] === 'number' ? saved[d.k] : d.def;
  }
  function saveTune() {
    try { localStorage.setItem(TUNE_KEY, JSON.stringify(T)); } catch { /* ignore */ }
  }
  loadTune();
  const KNOB_MAX = 130; // px: knob travel clamp (visual only)
  const deg = (d) => (d * Math.PI) / 180;
  //
  // Engine conventions (web/map.js state(): heading a, direction (sin a, cos a)
  // in map coordinates with y down; the camera is top-down and axis-aligned):
  //   forward on screen = (sin a, -cos a) → a = π faces screen-up
  //   screen angle φ = atan2(-dy, dx) (CSS y is down) and a = φ + π/2
  // Verified empirically (scripts/mobile/headless.js): KeyA increases a;
  // in a reversing car the steering sign is inverted (as in a real car).
  const TURN_LEFT_INCREASES = true;
  const STEER_INVERTED_WHEN_REVERSING = true;

  const zone = root.querySelector('#gtaStickZone');
  const stick = root.querySelector('#gtaStick');
  const knob = root.querySelector('#gtaStickKnob');

  let stickId = null;
  let cx = 0, cy = 0;
  let stickDx = 0, stickDy = 0, stickDist = 0;
  let turning = 0; // -1 = pressing right, 0 = none, +1 = pressing left
  let reversing = false;
  const held = { KeyW: false, KeyS: false, KeyA: false, KeyD: false, ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false };

  function setHeld(code, on) {
    if (held[code] === on) return;
    held[code] = on;
    on ? press(code) : release(code);
  }
  function releaseHeld() {
    for (const code of Object.keys(held)) setHeld(code, false);
  }

  function wrapAngle(a) {
    return Math.atan2(Math.sin(a), Math.cos(a));
  }

  // The engine flips the steering while the car backs up. gta2_dev_state's speed is a magnitude
  // (no sign), so "backing up" is simply our own reverse mode: S held.
  function steerInverted(s) {
    return STEER_INVERTED_WHEN_REVERSING && s.inCar && held.KeyS;
  }

  // Menu mode: the stick is a 4-way d-pad (one arrow at a time, 45° sectors).
  function menuTick() {
    if (stickDist < T.ringMove) { releaseHeld(); return; }
    const phi = Math.atan2(-stickDy, stickDx); // up-positive
    const dirs = { ArrowRight: 0, ArrowUp: Math.PI / 2, ArrowLeft: Math.PI, ArrowDown: -Math.PI / 2 };
    for (const [code, a] of Object.entries(dirs)) setHeld(code, Math.abs(wrapAngle(phi - a)) <= Math.PI / 4);
  }

  function stickTick() {
    const s = live();
    if (stickId === null || root.hidden) return;
    if (mode === 'menu' || !s || !s.hasPlayer) { menuTick(); return; }

    if (stickDist < T.ringMove) {
      releaseHeld();
      turning = 0;
      reversing = false;
      return;
    }

    // Direction of travel on screen → facing needed to drive forward there.
    const phi = Math.atan2(-stickDy, stickDx);
    const heading = s.heading;
    const fwdDelta = Math.abs(wrapAngle(phi + Math.PI / 2 - heading));
    // Reverse exists only in vehicles; on foot you always turn and walk forward.
    if (!s.inCar) reversing = false;
    else if (!reversing && fwdDelta > deg(T.revEnter)) reversing = true;
    else if (reversing && fwdDelta < deg(T.revExit)) reversing = false;

    // Reverse: face away from the travel direction and back into it.
    const target = phi + Math.PI / 2 + (reversing ? Math.PI : 0);
    const delta = wrapAngle(target - heading);
    const mag = Math.abs(delta);

    if (turning === 0 && mag > deg(T.turnStart)) turning = delta > 0 ? 1 : -1;
    else if (turning !== 0 && (mag < deg(T.turnStop) || Math.sign(delta) !== turning)) turning = 0;

    const sign = (TURN_LEFT_INCREASES ? 1 : -1) * (steerInverted(s) ? -1 : 1);
    setHeld('KeyA', turning * sign === 1);
    setHeld('KeyD', turning * sign === -1);
    setHeld('KeyW', !reversing);
    setHeld('KeyS', reversing);
    stick.dataset.mode = reversing ? 'rev' : 'fwd';
  }

  function updateStick(x, y) {
    let dx = x - cx;
    let dy = y - cy;
    const dist = Math.hypot(dx, dy);
    stickDx = dx;
    stickDy = dy;
    stickDist = dist;
    if (dist > KNOB_MAX) {
      dx = (dx / dist) * KNOB_MAX;
      dy = (dy / dist) * KNOB_MAX;
    }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    stick.dataset.gear = dist >= T.ringMove ? 'move' : 'idle';
  }

  function endStick() {
    stickId = null;
    stick.classList.remove('is-active');
    delete stick.dataset.gear;
    delete stick.dataset.mode;
    knob.style.transform = '';
    turning = 0;
    reversing = false;
    releaseHeld();
  }

  // Ring size and reverse sector follow the tunables
  function applyTuneVisuals() {
    const move = root.querySelector('.gta-ring-move');
    move.style.width = move.style.height = `${T.ringMove * 2}px`;
    const a = root.querySelector('.gta-rev-line-a');
    const b = root.querySelector('.gta-rev-line-b');
    const sec = root.querySelector('.gta-rev-sector');
    a.style.transform = `rotate(${-T.revEnter}deg)`;
    b.style.transform = `rotate(${T.revEnter}deg)`;
    const span = 360 - 2 * T.revEnter;
    sec.style.background = `conic-gradient(from ${T.revEnter}deg, rgba(255, 90, 60, 0.16) 0 ${span}deg, transparent ${span}deg 360deg)`;
  }
  applyTuneVisuals();

  function stickCenter() {
    const r = stick.getBoundingClientRect();
    cx = r.left + r.width / 2;
    cy = r.top + r.height / 2;
  }

  zone.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    e.preventDefault();
    stickId = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    stickCenter();
    stick.classList.add('is-active');
    updateStick(e.clientX, e.clientY);
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    e.preventDefault();
    updateStick(e.clientX, e.clientY);
  });
  const stickUp = (e) => {
    if (e.pointerId !== stickId) return;
    endStick();
  };
  zone.addEventListener('pointerup', stickUp);
  zone.addEventListener('pointercancel', stickUp);

  // Heading indicator: an arrow showing the current facing on screen, plus
  // (in vehicles) the dashed sector behind you where the stick triggers reverse.
  const headingEl = root.querySelector('#gtaHeading');
  function updateHeadingIndicator() {
    const s = live();
    if (!s || !s.hasPlayer || root.hidden) return;
    // facing a: a=π → screen up; CSS rotate is clockwise, so rotate(-(a-π)).
    const d = (-(s.heading - Math.PI) * 180) / Math.PI;
    headingEl.style.transform = `rotate(${d.toFixed(1)}deg)`;
    headingEl.dataset.vehicle = s.inCar ? '1' : '0';
    stick.dataset.vehicle = s.inCar ? '1' : '0';
  }

  // ---------- Tune panel: −/+ steppers for every tunable, persisted ----------
  const tunePanel = root.querySelector('#gtaTunePanel');
  const tuneRows = tunePanel.querySelector('.gta-tune-rows');
  const fmtVal = (d, v) => (d.step < 1 ? v.toFixed(1) : String(Math.round(v)));
  function renderTune() {
    tuneRows.innerHTML = '';
    for (const d of TUNE_DEFS) {
      const row = document.createElement('div');
      row.className = 'gta-tune-row';
      row.innerHTML = `<div class="gta-tune-label">${d.label} <span class="gta-tune-q">?</span></div>
        <button type="button" class="gta-pill" data-dir="-1">−</button>
        <div class="gta-tune-value">${fmtVal(d, T[d.k])}</div>
        <button type="button" class="gta-pill" data-dir="1">+</button>
        <div class="gta-tune-help" hidden>${d.help}</div>`;
      const valueEl = row.querySelector('.gta-tune-value');
      const helpEl = row.querySelector('.gta-tune-help');
      onTap(row.querySelector('.gta-tune-label'), () => { helpEl.hidden = !helpEl.hidden; });
      for (const b of row.querySelectorAll('[data-dir]')) {
        onTap(b, () => {
          const next = Math.min(d.max, Math.max(d.min, T[d.k] + d.step * Number(b.dataset.dir)));
          T[d.k] = Math.round(next * 1000) / 1000;
          valueEl.textContent = fmtVal(d, T[d.k]);
          if (T[d.k] === d.def) valueEl.classList.remove('is-changed'); else valueEl.classList.add('is-changed');
          saveTune();
          applyTuneVisuals();
        });
      }
      if (T[d.k] !== d.def) valueEl.classList.add('is-changed');
      tuneRows.appendChild(row);
    }
  }
  onTap(root.querySelector('#gtaTune'), () => { renderTune(); tunePanel.hidden = false; });
  onTap(tunePanel.querySelector('.gta-tune-close'), () => { tunePanel.hidden = true; });
  onTap(tunePanel.querySelector('.gta-tune-reset'), () => {
    for (const d of TUNE_DEFS) T[d.k] = d.def;
    saveTune();
    applyTuneVisuals();
    renderTune();
  });

  (function loop() {
    stickTick();
    updateHeadingIndicator();
    requestAnimationFrame(loop);
  })();

  // ---------- Sound pill (default off) ----------
  // Browsers only start audio inside a user gesture, and autostart.js presses
  // Play programmatically. The shell resumes its AudioContext on keydown /
  // pointerdown, but iOS does not count a touch pointerdown as a gesture. The
  // pill's pointerup is a real gesture: resume + unmute there. A looping
  // silent <audio> makes iOS treat the page as "playing media" so Web Audio
  // is not killed by the ringer/silent switch.
  const SOUND_KEY = 'gta2-mobile:sound';
  let soundOn = (() => { try { return localStorage.getItem(SOUND_KEY) === '1'; } catch { return false; } })();
  const soundBtn = root.querySelector('#gtaSound');
  // 0.25 s of 8-bit 8 kHz silence, inline: the site build refuses *.wav files (they could be game data).
  const SILENCE_WAV = 'data:audio/wav;base64,UklGRvQHAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YdAHAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
  const silence = new Audio(SILENCE_WAV);
  silence.loop = true;
  silence.volume = 0.05;
  silence.setAttribute('playsinline', '');
  silence.preload = 'auto';

  const audio = () => { const g = G(); return g && g.audio; };
  const audioRunning = () => { const a = audio(); return !!(a && a.ctx && a.ctx.state === 'running'); };
  let soundApplied = false;
  function applySound(fromGesture) {
    const a = audio();
    if (!a) return;
    soundApplied = true;
    if (soundOn) {
      if (fromGesture) {
        try { a.resume(); } catch { /* ignore */ }
        silence.play().catch(() => {});
      }
      a.setMuted(false);
    } else {
      a.setMuted(true);
      silence.pause();
    }
    renderSoundBtn();
  }
  function renderSoundBtn() {
    const pending = soundOn && !audioRunning();
    soundBtn.classList.toggle('is-on', soundOn && !pending);
    soundBtn.classList.toggle('is-pending', pending);
    soundBtn.innerHTML = soundOn ? ICONS.soundOn : ICONS.soundOff;
    soundBtn.title = soundOn ? (pending ? 'Sound on — tap anywhere to resume' : 'Sound on') : 'Sound off';
  }
  let soundRendered = '';
  renderSoundBtn();
  soundBtn.addEventListener('pointerdown', (e) => e.preventDefault());
  soundBtn.addEventListener('pointerup', () => {
    soundOn = !soundOn;
    try { localStorage.setItem(SOUND_KEY, soundOn ? '1' : '0'); } catch { /* ignore */ }
    applySound(true);
  });
  // Sound saved as "on" from a previous visit: it can only resume inside a
  // gesture, so finish the job on the next touch/key anywhere.
  const resumeOnGesture = (e) => { if (soundOn && !audioRunning() && (e.isTrusted || e.type !== 'keydown')) applySound(true); };
  for (const type of ['touchend', 'pointerup', 'keydown']) window.addEventListener(type, resumeOnGesture, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) silence.pause();
    else if (soundOn) silence.play().catch(() => {});
  });

  // ---------- Weapon pill (top-right) ----------
  // GTA2 has no direct weapon selection, only previous / next (J / K): the pill
  // shows the current weapon and its ammo, flanked by ◀ ▶.
  // Weapon idx (gta2_dev_state): −1 fists, 1 pistol, 2 machine gun, … in the pickup order of
  // map.js WEAPONS (verified: idx 1 draws the pistol on the HUD). Ammo is 10× the HUD count.
  const WEAPON_NAMES = ['Fists', 'Pistol', 'Machine Gun', 'Rocket Launcher', 'Electro Gun', 'Molotov', 'Grenades',
    'Shotgun', 'Electro Baton', 'Flamethrower', 'Silenced MG', 'Dual Pistol'];
  const weaponsEl = root.querySelector('#gtaWeapons');
  const weaponEl = root.querySelector('#gtaWeapon');
  let weaponSig = '';
  function syncWeapon(d) {
    const name = d ? (WEAPON_NAMES[d.weapon] || `Weapon ${d.weapon}`) : '';
    const label = !d ? '' : d.weapon < 0 ? WEAPON_NAMES[0] : `${name} (${Math.round(d.ammo / 10)})`;
    const sig = `${!!d}:${label}`;
    if (sig === weaponSig) return;
    weaponSig = sig;
    weaponsEl.hidden = !d;
    weaponEl.textContent = label;
  }

  // ---------- Visibility / game state sync ----------
  const enterBtn = root.querySelector('#gtaEnter');
  const jumpBtn = root.querySelector('#gtaJump');
  const fireBtn = root.querySelector('#gtaFire');
  const topBar = root.querySelector('#gtaTopBar');
  let lastLabels = '';

  const shown = (id) => { const el = document.getElementById(id); return !!el && !el.hidden; };

  function syncWithGame() {
    const g = G();
    const gameUp = !!g && shown('game');
    const landing = document.body.classList.contains('landing-on') || shown('landing');
    const screens = shown('saves-screen') || shown('controls-screen') || !!(g && g.map && g.map.open);
    const hide = !gameUp || landing || screens;
    if (hide !== root.hidden) {
      root.hidden = hide;
      if (hide) releaseAll();
    }
    if (hide) return;
    const s = live();
    const playing = !!(s && s.hasPlayer);
    const nextMode = playing ? 'play' : 'menu';
    if (nextMode !== mode) { mode = nextMode; releaseHeld(); root.dataset.mode = mode; }
    devState = playing ? readDev() : null;
    syncWeapon(devState);
    if (!soundApplied && g.audio) applySound(false); // default: muted until the pill is tapped
    const soundSig = `${soundOn}:${audioRunning()}`;
    if (soundSig !== soundRendered) { soundRendered = soundSig; renderSoundBtn(); }
    // boot.js mounts the reload pill outside the overlay: adopt it into the top bar with an icon.
    const reloadEl = document.getElementById('gtaReload');
    if (reloadEl && reloadEl.parentElement !== topBar) { reloadEl.innerHTML = ICONS.reload; reloadEl.setAttribute('aria-label', 'Reload'); topBar.appendChild(reloadEl); }
    const inCar = !!(s && s.inCar);
    const labels = `${mode}:${inCar}`;
    if (labels !== lastLabels) {
      lastLabels = labels;
      enterBtn.textContent = mode === 'menu' ? 'OK' : inCar ? 'Exit' : 'Enter';
      jumpBtn.textContent = mode === 'menu' ? 'Esc' : inCar ? 'Brake' : 'Jump';
      fireBtn.hidden = mode === 'menu';
    }
  }
  root.hidden = true;
  setInterval(syncWithGame, 200);

  // Safety: release everything when the page loses focus / is hidden
  window.addEventListener('blur', releaseAll);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
  });

  // Expose for debugging from the console
  window.gtaMobile = { press, release, tap, releaseAll, root, tune: T, TUNE_DEFS, live, readDev, get mode() { return mode; } };
})();
