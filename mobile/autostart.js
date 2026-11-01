/*
 * Straight into the game: skips the landing page and GTA2's own front end.
 *
 *   1. Landing page: press "Continue" when the shell offers the newest save
 *      state (web/landing.js showContinue), otherwise "Play". On the first
 *      visit Play downloads the freeware installer (346 MB) and unpacks it;
 *      the landing page shows the progress and we wait.
 *   2. Front end (after gta2_start): Enter at the title, Enter on PLAY, until
 *      the player exists (web/map.js state().hasPlayer). With Continue the
 *      save state loads by itself, no Enter needed.
 *
 * ?nointro disables it.
 */
(() => {
  'use strict';
  if (location.search.includes('nointro')) return;

  const CONTINUE_WAIT_MS = 2500; // the Continue card arrives asynchronously (listSaves)
  const ENTER_FIRST_MS = 1500; // web/shell.js ?autostart taps Enter at 1.5 s and 3.5 s
  const ENTER_EVERY_MS = 2000;
  const ENTER_MAX = 6;

  const visible = (el) => !!el && !el.hidden && !el.disabled && el.offsetParent !== null;
  const shown = (id) => { const el = document.getElementById(id); return !!el && !el.hidden; };
  const pressEnter = () => {
    for (const type of ['keydown', 'keyup']) {
      window.dispatchEvent(new KeyboardEvent(type, { code: 'Enter', key: 'Enter', bubbles: true, cancelable: true }));
    }
  };

  let clicked = false;
  let usedContinue = false;
  let gameSeenAt = 0;
  let enters = 0;
  let lastEnterAt = 0;
  let done = false;
  const t0 = Date.now();

  const tick = setInterval(() => {
    if (done) return clearInterval(tick);
    if (!clicked) {
      if (document.body.classList.contains('booting') || !shown('landing')) return;
      const cont = document.querySelector('#continue-root .continue');
      if (visible(cont)) { clicked = true; usedContinue = true; cont.click(); return; }
      if (Date.now() - t0 < CONTINUE_WAIT_MS) return;
      const play = document.querySelector('[data-play]');
      if (visible(play)) { clicked = true; play.click(); }
      return;
    }
    const g = window.gta2;
    if (!g || !g.map || !shown('game')) return;
    const s = g.map.last;
    if (s && s.hasPlayer) { done = true; return; }
    if (usedContinue) return;
    const now = Date.now();
    if (!gameSeenAt) { gameSeenAt = now; return; }
    if (now - gameSeenAt < ENTER_FIRST_MS) return;
    if (enters >= ENTER_MAX) { done = true; return; }
    if (now - lastEnterAt < ENTER_EVERY_MS) return;
    lastEnterAt = now;
    enters++;
    pressEnter();
  }, 250);
})();
