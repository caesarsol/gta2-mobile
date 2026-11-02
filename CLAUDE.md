# CLAUDE.md — GTA2 Mobile

Fork of [M1sterMo/gta2](https://github.com/M1sterMo/gta2), the published static build of
[gta2-browser](https://github.com/M1sterMo/gta2-browser) (GTA2 1999 in the browser: the
`gta2_re` decompilation compiled to WebAssembly + a JS shell, MIT), plus **touch controls for
phones** ported from the user's `gta-js-mobile` (GTA.js) overlay.
Live at https://caesarsol.github.io/gta2-mobile/ (GitHub Pages from `main`, root).

## How we work

- **Proposals first, then work.** When asked for options, write them *before* doing anything,
  and then only do the approved work. Never do the work first and propose after.
- Answer in the order of effort: things needing no commands first, then read-only checks,
  then edits.
- Every step: verify in headless Chromium, **commit and push to `main`**. The user tests on a
  real phone right after.
- **One commit per logical change.** When a message asks for several things, make a separate
  commit for each (feature, fix, docs, revert…), never one bundled commit.
- **Squash calibration commits.** Consecutive (or nearly consecutive) commits that keep
  adjusting the *same* feature (tuning a value, fixing the change just pushed) belong in the
  previous commit: `git commit --amend` (last commit) or `git commit --fixup=<sha>` +
  `git rebase -i --autosquash` (older one), then `git push --force-with-lease origin main`.
  A new logical change is still its own commit.
- Chat in Italian; code, comments, commit messages and docs in English.
- The branch is `main`. Do not create `claude/*` branches.

## Architecture (do not break)

- Everything at the root except `mobile/`, `scripts/`, `CLAUDE.md` and the README note is the
  **upstream build** (`gta2.wasm`, `gta2.js`, `shell.js`, `map.js`, …, `old/` = previous
  builds for old saves). Never edit it: `git merge` of upstream must stay trivial. The one
  hook is the `index.html` head (viewport, Apple metas, manifest, `<script src="mobile/boot.js?v=N">`).
  Upstream source and docs: the `gta2-browser` repo (`web/` there = these files minus `?v=` hashes).
- `mobile/boot.js`: cache-busting loader (`?v=<timestamp>` for our files), version label,
  reload pill. Changing it costs up to 10 min of Pages CDN cache → avoid; add logic to the
  other files instead. If you must, bump `?v=N` in `index.html`.
- `mobile/mobile.js` + `mobile.css`: the overlay (joystick, buttons, top-bar pills, weapon
  pill, Tune panel, sound pill, menu mode). Icons are inline SVG in `ICONS` (`window.gtaIcons`).
- `mobile/autostart.js`: landing page → Continue / Play → front end → gameplay.
- `mobile/manifest.webmanifest` + `icon-*.png`: home-screen web app.
- Everything we do goes through `window.gta2` (`Module`, `map`, `audio`, `states`, `storage`,
  `renderer`; set by `shell.js start()`) and synthetic `KeyboardEvent`s on `window`.
- No save code of our own: the port has save states (Saves screen, autosave, Continue).

## UI component rule

GTA2's HUD owns both top corners (health/armor bars left; cash, lives, hearts and the weapon
icon right, down to ~85 px). Our pills live in the top centre (bar) and under the HUD on the
right (weapon ◀ ▶); never put anything in the corners.

One component for every tappable control: `.gta-pill` with modifiers `is-on` (white =
active/selected), `is-down`, `--primary` (yellow), `--danger`, `--dim`, `--block`.
Positioning by id only. Round action buttons are `.gta-btn` with the same tokens. Size by
padding, never fixed width/height. Keep the reset on the component classes, not on
`#gtaMobile button` (boot.js mounts the reload pill outside `#gtaMobile`).

## Engine / shell facts

- Input: `keydown`/`keyup` on **`window`**, by `e.code`, with `e.key` used for typing in the
  game's menus (`shell.js wireInput`). Defaults (`PORT_CONTROLS`): W/S move, A/D turn, L fire,
  Enter in/out of cars, Space jump/handbrake, J/K weapons, M map, Esc menu, Tab scoreboard,
  −/= view distance. Players can rebind them in the game's Options → we assume defaults.
- Live state: `gta2.map.last` every frame (`map.js state()`): `hasPlayer`, `inCar`, `x`, `y`,
  `heading` (radians, engine units /1440), camera. `null` outside gameplay.
- `Module.ccall('gta2_dev_state')` → 10 ints: player, inCar, x, y, z, speed (fixed /16384,
  a **magnitude**, no sign), carModel, rot, weapon idx (−1 fists, 1 pistol, 2 MG, … pickup
  order of map.js `WEAPONS`), ammo (**10× the HUD count**). Dev hooks are in the release wasm:
  `gta2_dev_spawn_car(model,dx,dy,rot)` (model 10 is a plain enterable car, **20 cannot be
  entered**), `gta2_dev_teleport(x,y)`, `gta2_dev_find_road()`, `gta2_dev_give_weapon(kind,ammo)`
  (kind = weapon idx; it does not select it), `gta2_dev_add_cash(n)`.
- Entering a car takes about **4.5 s** (walk to the door + animation): wait that long in probes.
  Getting out is immediate.
- Heading `a`: forward on screen = `(sin a, −cos a)`; `a = π` faces screen-up; +x is
  screen-right, +y screen-down; the camera is top-down and axis-aligned (verified visually).
  Stick math is identical to gta-js-mobile. **Verified:** `A` increases `a` (turn left), on foot
  and in a moving car; while a car **backs up the steering is inverted** (as in a real car), so
  the controller flips A/D in reverse mode (`STEER_INVERTED_WHEN_REVERSING`). Cars do not yaw at
  standstill.
- GTA2 has **no run key** and **no direct weapon selection** (J/K cycle): one move ring, and a
  weapon pill with ◀ ▶.
- **On-foot turning is fast and quantised**: ~12° per 30 Hz tick once turning, seen a tick
  late, so a hold-until-aligned controller oscillates ±20° forever, whatever the threshold
  (measured 1.20 ↔ 1.89 rad around 1.57). The overlay **holds** the key while far, releases it
  `stopAhead` (~0.3 rad, measured) early, then **taps** one tick at a time (~0.09 rad each,
  measured) with ~110 ms to settle. Converges in ~0.5 s with no overshoot. **Cars are steered
  by the engine** (next points): the overlay only sends the target heading and holds W / S.
- **Car steering jitter: root cause (verified in open ground).** Cars have **yaw momentum**:
  after the steering key is released the heading keeps turning ~10° at low speed (more at
  speed, more for small cars with a high turn ratio), on top of the 1–2 tick input latency. The
  plain hold + hysteresis controller (dead band 5°) therefore overshoots and hunts around any
  target with a ±10° limit cycle, period ~1 s — measured in the largest open square of the map
  (`gta2_dev_find_open`, a park) for targets of 10°, 30°, 45° **and 90°** alike. Why it looks
  direction-dependent on the phone: going straight along a street nothing is corrected, and
  at the cardinal directions the kerbs/buildings realign a scraping car (the map-edge collision
  response, `CarPhysics_B0::ApplyForward/ReverseEngineForce` → an angular impulse of 1°/tick
  toward the wall's axis) which damps the hunt; at a diagonal nothing masks it and the walls
  add their own torque. There is **no** free-space auto-straightening (an earlier reading of
  the probe data, taken on a one-block-wide road, was wrong: the car was scraping the kerb).
  **Method**: `scripts/headless.js` + a scratchpad probe that teleports to the open square,
  spawns a car (`gta2_dev_spawn_car(10, 0, 2, 0)` then Enter; ~4.5 s), and records
  `map.last.heading`, the held keys and `gta2_dev_state` speed every animation frame, first
  with the engine alone (W, a 150 ms A tap, W: the new heading holds), then with the stick at
  several offsets. The overlay shows `Car <model>` under the weapon pills while driving.
- **Engine-side car steering (patch 0027 + `port/platform/steer_web.cpp`)**: the fix for the
  above. `gta2_port_set_steer_target(units)` (Ang16, 4 per degree, −1 = off) sets a target
  heading; `Car_BC::HandleUserInput_4418D0` of the *local* player's car then gets its left /
  right keys decided once per tick with the exact heading and angular velocity:
  `predicted = error − ω·kd` (kd ticks of momentum, default 2), steer while |predicted| > band
  (default 6 units = 1.5°), restart only beyond 2× the band (hysteresis), keys inverted while
  the car backs up (velocity against heading). `gta2_port_set_steer_params(kd, band)`;
  `gta2_port_steer_debug()` → [active, error, ω, decision] for probes. Measured in the park
  with the real joystick: 30° → −0.5°, 90° → +1.3°, −45° → +1°, settles in ~1.5–2 s, no
  hunting; reverse backs up straight. Tune: `steerKd`, `steerBand`. Co-op: the override only
  touches the local player's car, but it changes that car's inputs, so peers must run the same
  build (accepted). `mobile.js` clears the target (−1) whenever the stick is idle, released,
  on foot or hidden. a key down+up inside one tick still
  counts as held for that tick, so one-frame taps are reliable.
- **Forced landscape** (`syncRotation`): iOS has no `screen.orientation.lock` and ignores the
  manifest orientation, so under a portrait lock the `body` is rotated 90° with CSS (sides
  swapped, `position: fixed`; fixed descendants rotate with it). The renderer, `chooseViewWidth`
  and the map measure canvases with `getBoundingClientRect()` **every frame**: on a rotated
  element that box has its sides swapped, so the game canvases get an instance override that
  returns the layout size. Stick deltas are rotated into the page frame; safe-area insets are
  physical and get remapped. Known limit: taps on the shell's map screen (waypoints) are not
  remapped. Tune `rotate`: 1 notch-left (default), −1 notch-right, 0 off. Headless:
  `VIEWPORT=390x844`.
- **Camera**: the engine raises the camera with speed (car height + raw speed; drawn height 1
  on foot, ~4.7 at speed 0.22, up to 14) and the port's Modern camera only smooths it
  (`port_modern_camera.cpp`). `gta2_port_set_camera(mode, bias)` adds `bias` (clamped −2…+4)
  to the drawn height immediately; `map.last.camZ` is that drawn height. `camTick` holds it at
  Tune `camFoot` (2) / `camCar` (4) with bias = target − (camZ − bias), eased between the two.
  Beyond the clamp (fast cars) it drifts up a little. The toolbar's View distance button is
  hidden on touch; `camLock = 0` restores the shell's stored camera.
- **Mobile camera = engine patch** (`engine/0026-*.patch`; `engine/0027-*.patch` is the steering; `engine/port-web.patch` carries the port/web/scripts changes): the real
  problem on a phone is the camera *lead* (`ApplyCarVelocityCameraOffset_436200` moves the
  camera up to ~4 blocks ahead of a moving car and raises it with speed): the car ends up under
  the thumb. Mode 2 skips that offset entirely (centred like on foot); `gta2_port_set_camera`
  accepts 0/1/2, the shell's Camera button cycles Modern → Mobile → Classic (also a landing
  option), touch defaults to `mobile`. The engine in this repo **is our rebuild** (build id =
  first 24 hex of sha256(gta2.wasm); M1sterMo's last build 3213c238… is kept under `old/`).
  `engine/build.sh <work>` does everything (Emscripten 6.0.12 + gta2_re + prebuilt unshield;
  the compile itself takes ~30 s on 4 cores). In this sandbox the toolchain and sources live in
  `/home/user/m1stermo/gta2-browser/research/` (work dir `/home/user/m1stermo`). After a
  rebuild the root files are the build output: all `?v=` hashes change, the `index.html` hooks
  come back via `engine/patch-index.py`, the previous build goes under `old/<id>/` so existing
  save states still open. Measured: while driving the Modern camera leads 2.7 blocks ahead, the
  Mobile one trails ~0.5 (its follow spring), none ahead.
- The map screen (`gta2.map.open`) covers the game and pauses it; on touch only our map pill
  stays visible to close it (M). The shell's toolbar `#tools` is hidden on touch and toggled by
  the ⋯ pill (z-index above the overlay so its clicks land).
- Front end: Bink movies are stubbed, so after `gta2_start` the game shows its title and
  menu; **Enter twice** (title, PLAY) starts area 1 — upstream's own `?autostart=1` does that
  at 1.5 s and 3.5 s. `autostart.js` sends Enter until `hasPlayer`. "Continue" on the landing
  page loads the newest save state right after start.
- Game files: the 346 MB freeware installer from archive.org is unpacked in a worker and kept
  in IndexedDB (`gta2-port-gamefiles`, `navigator.storage.persist()`), so later visits do not
  download. iOS: a home-screen web app has its **own** storage, separate from Safari → the
  first download must happen inside the installed app.
- Audio: `gta2.audio` (`audio.js`): `resume()`, `setMuted(bool)`, `ctx`. The shell resumes on
  `keydown`/`pointerdown`; iOS needs a real gesture → the Sound pill (default off) unlocks on
  its `pointerup`, with a silent inline `<audio>` loop (data URI) to survive the ringer switch.
- The shell's screens we must not cover or break: `#landing` (scrolls), `#saves-screen`,
  `#controls-screen`, the map (`gta2.map.open`), `#coop`. The overlay hides itself behind
  them and never cancels their touches.

## Testing (headless)

```bash
python3 -m http.server 8124 --bind 127.0.0.1 &      # from the repo root
node scripts/headless.js                             # smoke: start, turn, walk, spawn a car, drive
```

Playwright + Chromium are preinstalled; `--use-gl=swiftshader`; device iPhone 13, viewport
844×390, touches via CDP `Input.dispatchTouchEvent`. The browser profile persists
(`PROFILE_DIR`), so the installer is unpacked once. `INSTALLER_MIRROR=1` points archive.org at
a local HTTPS stand-in (127.0.0.1:8443, a tiny Python server with a self-signed cert) for
repeatable runs without the slow Internet Archive.

## Gotchas met so far

- Upstream's `build_pages.py` refuses `*.wav` (game-file suffix) → the silent loop is an
  inline data URI, so a future upstream rebuild can carry `mobile/` as is.
- Pages `index.html`/`boot.js` can lag 10 min; everything under `mobile/` is instant thanks to
  the timestamped loader.
