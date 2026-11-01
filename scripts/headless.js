#!/usr/bin/env node
/*
 * Headless harness for the mobile overlay (Playwright + preinstalled Chromium).
 *
 *   node scripts/headless.js [url]   → smoke test: start, read the live state, turn, drive
 *   const h = require('./scripts/headless'); → reuse helpers in ad-hoc probes
 *
 * Serve the repo root first:
 *   python3 -m http.server 8124 --bind 127.0.0.1
 *
 * The browser profile persists in PROFILE_DIR, so the 346 MB installer is downloaded and
 * unpacked once (IndexedDB). With INSTALLER_MIRROR=<url> the archive.org installer request is
 * redirected (Playwright route → 302) to that URL, e.g. a local HTTP server with CORS headers
 * serving a GTA2INSTALLER.exe you already have, instead of the slow Internet Archive.
 */
const path = require('path');
const { chromium, devices } = require('playwright');

const DEFAULT_URL = 'http://127.0.0.1:8124/';
const PROFILE_DIR = process.env.PROFILE_DIR || path.join(require('os').tmpdir(), 'gta2-mobile-profile');

async function launch({ url = DEFAULT_URL } = {}) {
  const args = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'];
  // VIEWPORT=390x844 for a portrait phone (forced-landscape tests); landscape by default.
  const [vw, vh] = (process.env.VIEWPORT || '844x390').split('x').map(Number);
  const ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
    ...devices['iPhone 13'], isMobile: true, hasTouch: true, viewport: { width: vw, height: vh }, args,
  });
  if (process.env.INSTALLER_MIRROR) {
    await ctx.route('https://archive.org/cors/gta2_rockstar-classics/GTA2INSTALLER.exe', (route) =>
      route.fulfill({ status: 302, headers: { location: process.env.INSTALLER_MIRROR } }));
  }
  const page = ctx.pages()[0] || (await ctx.newPage());
  page.on('pageerror', (e) => console.log('[pageerror]', e.message.slice(0, 300)));
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, touchPoints) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
  const tap = async (selector) => {
    const el = await page.waitForSelector(selector, { state: 'visible', timeout: 15000 });
    const bb = await el.boundingBox();
    await touch('touchStart', [{ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2, id: 9 }]);
    await touch('touchEnd', []);
    await page.waitForTimeout(100);
  };
  // Keys go to window, like the shell's own listeners expect (code + key).
  const key = (type, code, k = code.replace(/^Key/, '').toLowerCase()) =>
    page.evaluate(([t, c, kk]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: kk, bubbles: true })), [type, code, k]);
  const hold = async (code, ms) => { await key('keydown', code); await page.waitForTimeout(ms); await key('keyup', code); };
  return { browser: ctx.browser(), ctx, page, cdp, touch, tap, key, hold, url };
}

// Navigate and wait until the player exists (autostart.js presses Play / Continue and skips the
// front end; the first run downloads and unpacks the installer, which takes minutes).
async function startGame(page, url = DEFAULT_URL, timeoutMs = 15 * 60 * 1000) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const t0 = Date.now();
  let lastStatus = '';
  while (Date.now() - t0 < timeoutMs) {
    await page.waitForTimeout(500);
    const st = await page.evaluate(() => ({
      ready: !!(window.gta2 && window.gta2.map && window.gta2.map.last && window.gta2.map.last.hasPlayer),
      status: (document.getElementById('files-state') || {}).textContent || (document.getElementById('status') || {}).textContent || '',
    }));
    if (st.ready) break;
    if (st.status && st.status !== lastStatus) { lastStatus = st.status; console.log('[status]', st.status.trim().slice(0, 120)); }
  }
  await page.waitForTimeout(1000);
}

function state(page) {
  return page.evaluate(() => {
    const g = window.gta2; const s = g.map.last; const d = window.gtaMobile ? window.gtaMobile.readDev() : null;
    return {
      hasPlayer: !!(s && s.hasPlayer), inCar: !!(s && s.inCar), x: s ? +s.x.toFixed(2) : null, y: s ? +s.y.toFixed(2) : null,
      heading: s ? +s.heading.toFixed(3) : null, speed: d ? +d.speed.toFixed(3) : null, weapon: d ? d.weapon : null, ammo: d ? d.ammo : null,
      mode: window.gtaMobile ? window.gtaMobile.mode : null, overlayHidden: window.gtaMobile ? window.gtaMobile.root.hidden : null,
    };
  });
}

// Spawns a car next to the player (dev hook in the engine) and gets in with Enter: the walk to
// the door and the animation take about 4.5 s. Model 10 is a plain car; 20 cannot be entered.
async function enterCar(h, model = 10) {
  await h.page.evaluate((m) => window.gta2.Module.ccall('gta2_dev_spawn_car', 'number', ['number', 'number', 'number', 'number'], [m, 1, 0, 0]), model);
  await h.page.waitForTimeout(500);
  await h.key('keydown', 'Enter', 'Enter'); await h.page.waitForTimeout(150); await h.key('keyup', 'Enter', 'Enter');
  for (let i = 0; i < 20; i++) {
    await h.page.waitForTimeout(500);
    if ((await state(h.page)).inCar) return true;
  }
  return false;
}

module.exports = { DEFAULT_URL, PROFILE_DIR, launch, startGame, state, enterCar };

if (require.main === module) {
  (async () => {
    const h = await launch();
    await startGame(h.page, process.argv[2] || DEFAULT_URL);
    const s0 = await state(h.page);
    console.log('spawn', JSON.stringify(s0));
    await h.hold('KeyA', 700);
    const s1 = await state(h.page);
    console.log('after A 0.7s', JSON.stringify(s1), 'Δheading', +(s1.heading - s0.heading).toFixed(3));
    await h.hold('KeyW', 1500);
    const s2 = await state(h.page);
    console.log('after W 1.5s', JSON.stringify(s2), 'Δx', +(s2.x - s1.x).toFixed(2), 'Δy', +(s2.y - s1.y).toFixed(2));
    console.log('entered car:', await enterCar(h));
    const c0 = await state(h.page);
    await h.hold('KeyW', 1500);
    const c1 = await state(h.page);
    console.log('car after W 1.5s', JSON.stringify(c1), 'speed', c1.speed);
    await h.page.screenshot({ path: 'headless.png' });
    await h.ctx.close();
  })().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
}
