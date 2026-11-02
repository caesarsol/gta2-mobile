#!/usr/bin/env node
/*
 * Headless harness for the mobile overlay (Playwright + preinstalled Chromium).
 *
 *   node scripts/headless.js [url]   → smoke test: start, read the live state, turn, drive
 *   const h = require('./scripts/headless'); → reuse helpers in ad-hoc probes
 *
 * Before a run: `source <(scripts/dev-servers.sh /path/to/GTA2INSTALLER.exe)` starts the site
 * server (127.0.0.1:8124) and the installer mirror, and exports INSTALLER_MIRROR. Read
 * notes/testing.md first: probe hygiene (clean saves, where to drive, what to wait for).
 *
 * The browser profile persists in PROFILE_DIR, so the 346 MB installer is unpacked once
 * (IndexedDB, ~67 MB). With INSTALLER_MIRROR=<url> the archive.org installer request is
 * redirected (Playwright route → 302) to that URL (scripts/installer-mirror.py) instead of the
 * slow Internet Archive.
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
  } else {
    console.warn('[headless] INSTALLER_MIRROR is not set: a fresh profile downloads 346 MB from archive.org (slow). See scripts/dev-servers.sh');
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
  const tapKey = async (code, ms = 150) => hold(code, ms);
  const h = { browser: ctx.browser(), ctx, page, cdp, touch, tap, key, hold, tapKey, url };
  // Joystick: finger down at the stick centre, then stickAt(angle, radius) in *heading* terms
  // (the car/ped heading the stick asks for; π = screen-up), stickUp() to release.
  let stickCentre = null;
  h.stickDown = async () => {
    const zone = await page.$('#gtaStickZone'); const bb = await zone.boundingBox();
    stickCentre = { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
    await touch('touchStart', [{ x: stickCentre.x, y: stickCentre.y, id: 1 }]);
  };
  h.stickAt = async (heading, radius = 100) => {
    if (!stickCentre) await h.stickDown();
    const phi = heading - Math.PI / 2; // screen angle (CSS y down)
    await touch('touchMove', [{ x: stickCentre.x + radius * Math.cos(phi), y: stickCentre.y - radius * Math.sin(phi), id: 1 }]);
  };
  h.stickUp = async () => { await touch('touchEnd', []); stickCentre = null; };
  return h;
}

// Deletes the port's save states so autostart.js presses Play (a fresh area 1) instead of
// Continue (the previous probe's world: its abandoned cars, its position). Call before startGame.
async function cleanSaves(page, url = DEFAULT_URL) {
  await page.goto(new URL('mobile/manifest.webmanifest', url).href, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.deleteDatabase('gta2-port-states');
    r.onsuccess = r.onerror = r.onblocked = () => res();
  }));
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
  // After a fresh unpack the game starts from memory while the 60 MB IndexedDB write is still
  // in flight; closing the browser before the 'complete' marker lands means downloading again
  // next time. Wait for it (up to 90 s) whenever this run downloaded.
  if (/Downloading|Unpacking/.test(lastStatus)) {
    const t1 = Date.now();
    while (Date.now() - t1 < 90000) {
      const done = await page.evaluate(() => new Promise((res) => {
        const r = indexedDB.open('gta2-port-gamefiles', 1);
        r.onerror = () => res(false);
        r.onsuccess = () => { const db = r.result; try { const g = db.transaction('meta', 'readonly').objectStore('meta').get('complete'); g.onsuccess = () => { db.close(); res(!!g.result); }; g.onerror = () => { db.close(); res(false); }; } catch { db.close(); res(false); } };
      }));
      if (done) break;
      await page.waitForTimeout(1000);
    }
    console.log('[headless] game files stored in', Math.round((Date.now() - t1) / 1000), 's');
  }
}

// cleanSaves + startGame: what every measurement probe should call.
async function startClean(page, url = DEFAULT_URL) {
  await cleanSaves(page, url);
  await startGame(page, url);
}

function state(page) {
  return page.evaluate(() => {
    const g = window.gta2; const s = g.map.last; const d = window.gtaMobile ? window.gtaMobile.readDev() : null;
    return {
      hasPlayer: !!(s && s.hasPlayer), inCar: !!(s && s.inCar), devInCar: !!(d && d.inCar), x: s ? +s.x.toFixed(2) : null, y: s ? +s.y.toFixed(2) : null,
      heading: s ? +s.heading.toFixed(3) : null, speed: d ? +d.speed.toFixed(3) : null, carModel: d ? d.carModel : null, weapon: d ? d.weapon : null, ammo: d ? d.ammo : null,
      mode: window.gtaMobile ? window.gtaMobile.mode : null, overlayHidden: window.gtaMobile ? window.gtaMobile.root.hidden : null,
    };
  });
}

const ccall = (page, name, ret, types, args) => page.evaluate(([n, r, t, a]) => window.gta2.Module.ccall(n, r, t, a), [name, ret, types, args]);
const ints = (page, name, n) => page.evaluate(([nm, k]) => { const M = window.gta2.Module; const p = M.ccall(nm, 'number', [], []); return Array.from(M.HEAP32.subarray(p >> 2, (p >> 2) + k)); }, [name, n]);

// Dev hooks (port/platform/dev_hooks.cpp). Places: the largest open square (a park: [x, y, ?, size])
// and the longest straight road ([x, y, ?, len, alongY]); both have traffic / peds around.
const findOpen = (page) => ints(page, 'gta2_dev_find_open', 4);
const findRoad = (page) => ints(page, 'gta2_dev_find_road', 5);

// Teleport and wait for the camera to arrive (it pans at a limited speed, up to ~30 s): camera
// measurements, and the camera-relative lead, are meaningless before that.
async function teleport(page, x, y, waitCamera = true) {
  // the hook moves the ped only: a seated ped stays in its car, so get out first
  const s = await state(page);
  if (s.devInCar || s.inCar) {
    const key = (type, code, k = code.replace(/^Key/, '').toLowerCase()) => page.evaluate(([t, c, kk]) => window.dispatchEvent(new KeyboardEvent(t, { code: c, key: kk, bubbles: true })), [type, code, k]);
    await exitCar({ page, key, tapKey: async (code, ms = 150) => { await key('keydown', code); await page.waitForTimeout(ms); await key('keyup', code); } });
  }
  let ok = 0;
  for (let i = 0; i < 5 && !ok; i++) {
    ok = await ccall(page, 'gta2_dev_teleport', 'number', ['number', 'number'], [x, y]); // 0 = refused (ped still seated)
    if (!ok) await page.waitForTimeout(700);
  }
  if (!ok) { console.warn('[headless] teleport refused: the ped is still in a car'); return false; }
  if (!waitCamera) { await page.waitForTimeout(1500); return true; }
  const camDist = () => page.evaluate(() => { const s = window.gta2.map.last; return Math.hypot(s.x - s.camX, s.y - s.camY); });
  const t0 = Date.now();
  while ((await camDist()) > 0.3 && Date.now() - t0 < 45000) await page.waitForTimeout(300);
  await page.waitForTimeout(800);
  return true;
}

// Gets out of the current car, if any: Enter is ignored while the car still rolls, so brake
// first (handbrake), then press Enter until the dev state agrees. Teleporting or spawning while
// still seated wedges the new car against the old one (nothing moves afterwards).
async function exitCar(h) {
  let s = await state(h.page);
  if (!s.devInCar && !s.inCar) return true;
  for (let i = 0; i < 30 && s.speed > 0.01; i++) { await h.key('keydown', 'Space'); await h.page.waitForTimeout(100); s = await state(h.page); }
  await h.key('keyup', 'Space');
  for (let tries = 0; tries < 4; tries++) {
    await h.tapKey('Enter');
    for (let i = 0; i < 10; i++) {
      await h.page.waitForTimeout(300);
      s = await state(h.page);
      // during the exit animation the ped briefly is not the player (hasPlayer false): wait for a real reading
      if (s.hasPlayer && !s.devInCar && !s.inCar) { await h.page.waitForTimeout(500); return true; }
    }
  }
  return false;
}

// Spawns a car next to the player (dev hook) and gets in with Enter. The walk to the door and
// the animation take about 4.5 s; map.last.inCar turns true as soon as the walk starts, the
// dev state only when the ped is really inside: wait for both. Model 10 is a plain car, 25 is
// fast, 20 cannot be entered. Spawn on a fresh spot: a car on top of another one fails.
async function enterCar(h, model = 10, dx = 0, dy = 2, rot = 0) {
  if (!(await exitCar(h))) return false;
  await ccall(h.page, 'gta2_dev_spawn_car', 'number', ['number', 'number', 'number', 'number'], [model, dx, dy, rot]);
  await h.page.waitForTimeout(500);
  await h.tapKey('Enter');
  for (let i = 0; i < 24; i++) {
    await h.page.waitForTimeout(500);
    const s = await state(h.page);
    if (s.inCar && s.devInCar) { await h.page.waitForTimeout(500); return true; }
  }
  return false;
}

// Per-frame recorder (requestAnimationFrame): heading (deg), x, y, speed, held movement keys,
// steer debug [active, error, omega, decision], stick gear/mode. start it, act, then rows().
// Positions are map blocks; velocity direction = atan2(dx, dy) (forward = (sin a, cos a) there).
async function record(page, ms) {
  await page.evaluate((ms) => {
    window.__rec = []; const held = {};
    window.addEventListener('keydown', (e) => { held[e.code] = 1; }, true);
    window.addEventListener('keyup', (e) => { held[e.code] = 0; }, true);
    const M = window.gta2.Module; const t0 = performance.now();
    const f = () => {
      const s = window.gta2.map.last; const d = window.gtaMobile.readDev();
      let dbg = null; try { const p = M.ccall('gta2_port_steer_debug', 'number', [], []); dbg = Array.from(M.HEAP32.subarray(p >> 2, (p >> 2) + 5)); } catch { /* older engine */ }
      const st = document.getElementById('gtaStick');
      window.__rec.push({ t: Math.round(performance.now() - t0), heading: +(s.heading * 180 / Math.PI).toFixed(1), x: +s.x.toFixed(3), y: +s.y.toFixed(3), speed: d ? +d.speed.toFixed(3) : 0,
        keys: Object.entries(held).filter(([, v]) => v).map(([k]) => k.replace('Key', '')).join(''), steer: dbg, gear: st && st.dataset.gear, mode: st && st.dataset.mode });
      if (performance.now() - t0 < ms) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
  }, ms);
  return { rows: () => page.evaluate(() => window.__rec) };
}

module.exports = { DEFAULT_URL, PROFILE_DIR, launch, cleanSaves, startGame, startClean, state, ccall, ints, findOpen, findRoad, teleport, exitCar, enterCar, record };

if (require.main === module) {
  (async () => {
    const h = await launch();
    await startClean(h.page, process.argv[2] || DEFAULT_URL);
    const s0 = await state(h.page);
    console.log('spawn', JSON.stringify(s0));
    await h.hold('KeyA', 700);
    const s1 = await state(h.page);
    console.log('after A 0.7s', JSON.stringify(s1), 'Δheading', +(s1.heading - s0.heading).toFixed(3));
    await h.hold('KeyW', 1500);
    const s2 = await state(h.page);
    console.log('after W 1.5s', JSON.stringify(s2), 'Δx', +(s2.x - s1.x).toFixed(2), 'Δy', +(s2.y - s1.y).toFixed(2));
    console.log('entered car:', await enterCar(h));
    await h.hold('KeyW', 1500);
    const c1 = await state(h.page);
    console.log('car after W 1.5s', JSON.stringify(c1), 'speed', c1.speed);
    await h.page.screenshot({ path: 'headless.png' });
    await h.ctx.close();
  })().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
}
