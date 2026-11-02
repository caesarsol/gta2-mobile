# Headless testing and probes

How to run the game headless, measure things and not fool yourself. Read this before writing a
probe; append what you learn (section "Lessons") the moment something took more than one try.

## Setup (every session)

```bash
cd /home/user/gta2-mobile
source <(scripts/dev-servers.sh /path/to/GTA2INSTALLER.exe)   # site :8124 + installer mirror :8443, exports INSTALLER_MIRROR
node scripts/headless.js                                        # smoke test: clean start, turn, walk, car
```

- The site server (`python3 -m http.server 8124` from the repo root) **dies between turns** in
  the sandbox (it belongs to the shell that started it): the script restarts it when needed.
  **It must serve this checkout**: a server started from another directory (the GTA.js project
  uses `/home/user` on :8123, easy to mix up) answers on the port, `cleanSaves` "works" on any
  page and `startGame` waits 15 minutes for nothing. `dev-servers.sh` and `h.launch()` both
  check that the served `gta2.wasm` is ours (size) and `mobile/boot.js` exists; the script
  stops a wrong-root server by pid and starts ours, `launch()` starts ours when nothing answers
  and **refuses to run** otherwise (also when `INSTALLER_MIRROR` is set but dead). Never start
  the server by hand with a bare `nohup`: use the script.
- **Always use the installer mirror.** The game downloads the 346 MB freeware installer from
  archive.org on the first visit of a browser profile; through the sandbox proxy that runs at
  ~1 MB/min (hours). `scripts/installer-mirror.py` serves a local copy over plain HTTP with CORS
  headers, and `scripts/headless.js` redirects the archive.org request to it with a Playwright
  route (302) when `INSTALLER_MIRROR` is set. Chromium flags (`--host-resolver-rules`) do **not**
  work here: the proxy resolves names itself. Getting the installer once: the `/download/` URL
  of archive.org supports `curl -C -` resume (the `/cors/` one does not), ~20 min; keep it
  outside the repo (this sandbox: `<scratchpad>/gta2inst/GTA2INSTALLER.exe`, scratchpad =
  `/tmp/claude-0/-home-user*/<session>/scratchpad`).
- The browser profile (`PROFILE_DIR`, default `/tmp/gta2-mobile-profile`) keeps the unpacked
  game files (IndexedDB `gta2-port-gamefiles`, ~67 MB) across runs. `/tmp` does not survive a
  new sandbox: when `node scripts/headless.js` logs "Downloading GTA2…", the profile is gone,
  not broken. With the mirror a fresh unpack takes ~20 s.
- One Chromium per profile: two probes at once on the same `PROFILE_DIR` fail. Run probes
  sequentially; kill leftovers by pid. `pkill -f <pattern>` **or `pgrep -f`** with a pattern
  that also appears in your own shell command line (even in another part of the same `bash -c`,
  e.g. the `nohup python3 -m http.server 8124` that restarts it) kills the shell (exit 144):
  find the owner of a port with `lsof -ti tcp:8124 -sTCP:LISTEN` (or `fuser -n tcp 8124`;
  `ss` is not installed here), or put the commands in a script file.
- Device: iPhone 13, 844×390 landscape (`VIEWPORT=390x844` for the forced-landscape tests),
  `hasTouch`, `--use-gl=swiftshader`. Touches go through CDP `Input.dispatchTouchEvent`
  (`h.touch`, `h.tap(selector)`, `h.stickDown / stickAt(heading, radius) / stickUp`); keys
  through synthetic `KeyboardEvent`s on `window` (`h.key`, `h.hold`, `h.tapKey`).

## Probe hygiene (measurements)

1. **Start clean**: `await h.startClean(page)` (= `cleanSaves` + `startGame`). `autostart.js`
   presses **Continue** when an autosave exists, so without it the probe resumes the previous
   probe's world: its abandoned test cars on the road, its position, its damage. Symptoms seen:
   spawns "failing" (the new car lands on an old one and Enter boards neither), the player
   crawling at heading 180°, hard "braking" at full speed that was a rear-ending.
2. **Where to drive**: `h.findOpen()` → the largest open square (a park, ~19 blocks; room for
   turns, no walls, but speeds stay ≤ 0.2 blocks/tick); `h.findRoad()` → the longest straight
   road (145 blocks along y at the first result; top speed 0.4 for model 25) — it has **traffic
   and parked cars**, so a lane change can hit something: repeat on 2–3 offsets along the road
   and discard runs whose speed collapses with no steering input. Start from a corner only if
   the turn goes *into* the square.
3. **One car per game.** `exit → teleport → spawn → enter` in the same game is unreliable:
   Enter is ignored while the car rolls, `gta2_dev_teleport` is refused while the ped is seated
   (`get_car` still set during the exit animation, when `hasPlayer` even flickers false), and a
   car spawned next to the old one wedges both (nothing moves, every later variant reads
   "speed 0"). For a series of runs call `h.startClean()` **before each run** (~15 s with the
   game files cached) and teleport once, on foot. `h.exitCar` / the retrying `h.teleport` help
   but do not make the sequence reliable.
4. **Entering a car**: `h.enterCar(x, model, dx, dy, rot)` (x = the harness) waits for `map.last.inCar` **and**
   the dev state (`gta2_dev_state` inCar). `map.last.inCar` is true from the moment the ped
   starts walking to the door; for ~4.5 s the dev state still says "no car" and the overlay's
   **on-foot** controller runs. Model 10 = plain car, 25 = fast, 20 = cannot be entered.
   Spawn each car on a fresh spot (another `dy`, or another offset along the road).
5. **Teleport then wait**: `h.teleport(page, x, y)` waits until the camera has arrived
   (`|player − cam| < 0.3`; it pans at a limited speed, up to ~30 s). Camera-relative
   measurements before that are noise.
6. **Record per frame**: `const r = await h.record(page, ms)` → `await r.rows()`: `t`,
   `heading` (deg), `x`, `y` (blocks), `speed` (blocks/tick, magnitude), `keys` held, `steer`
   (engine steering debug, 12 ints: `[active, error, omega, key, scale, slip, lateral v, speed,
   skid F, skid R, assist, pedal]`, see `notes/engine.md` Cars), stick `gear` / `mode`. Velocity
   direction from positions is `atan2(dx, dy)` (map coords, y down; forward = `(sin a, cos a)`);
   slip angle = that − heading. Sampling is per animation frame (≈ 1–2 engine ticks at 30 Hz):
   a key *tapped* inside one frame is invisible to a per-frame `keys` sample — log the events
   (`keydown`/`keyup` listeners) when you need to know what was pressed.
7. **Compare against the engine alone** (keyboard keys, no stick) in the same place and at the
   same speed before blaming the overlay: W + a 150 ms A tap shows how the car reacts to one
   tick of steering; A held 300 ms is a "hard" keyboard swerve.
8. **Screenshots** (`page.screenshot`) for layout checks; read them (the Read tool shows PNGs).
   Fixed-position elements have `offsetParent === null`: test visibility with `hidden` +
   `getComputedStyle().display`, not `offsetParent`.
9. Keep probes in the scratchpad, not the repo; when a probe becomes a recurring check, move
   it to `scripts/` with a one-line description in this file.

## Where things are (this sandbox)

- Repo: `/home/user/gta2-mobile`. Engine toolchain + sources: `/home/user/m1stermo/gta2-browser/`
  (`research/gta2_re` pinned, `research/port-work/core` patched, `research/toolchains/emsdk`,
  1.7 GB). See `notes/build.md`.
- Installer: `<scratchpad>/gta2inst/GTA2INSTALLER.exe` (362 331 961 bytes). Mirror:
  `scripts/installer-mirror.py` (the old scratchpad `mirror/serve.py` is the same thing).
- Browser profile: `/tmp/gta2-mobile-profile`.

## Lessons (trial and error — add yours)

- A probe that reports `inCar: true` but `speed: 0` and `A`/`D` taps in `keys` is **on foot**
  (door walk in progress or the car never boarded): check `devInCar`.
- The first stick-vs-keyboard skid comparison (2026-11) spent six runs on polluted saves and
  traffic before the clean-start rule existed. Clean start, same spot, both methods, 2–3 offsets.
- The open square is too small for top speed; the long road too busy for 90° turns. Use the
  square for turning geometry (jitter, settling), the road for speed (camera lead, slip in a
  lane change), and accept that road runs need repeats.
- `h.state()` is one evaluate per call (~5–10 ms): fine for pacing, too coarse for dynamics →
  `h.record`.
- The headless smoke test and the probes share the profile: a probe that crashes mid-run
  leaves no browser behind (the persistent context closes with node), but a `timeout`-killed
  one may; `pgrep -fc chrom` then kill by pid.
- Autostart's Continue card appears ~2.5 s after the landing page; `startGame` waits for
  `hasPlayer`, so a probe never has to click anything on the landing page itself.
- After a fresh unpack the game starts while the 60 MB IndexedDB write is still in flight;
  closing the browser right after "ready" left the cache incomplete and the next run downloaded
  again (seen twice before `startGame` learned to wait for the `complete` marker).
- Piping node through `grep` without `--line-buffered` into a file shows nothing until exit; a
  `timeout`-killed probe then leaves an empty log. Use `grep --line-buffered` or no grep.
- The helpers take the harness object returned by `launch()` (`x`), not the module (`h`):
  `h.enterCar(x, …)`, `x.stickAt(…)`. Mixing them up fails with "reading 'evaluate'".
- The open square (`findOpen`) is 19 blocks with objects inside: cars reach ~0.1 blocks/tick
  and hit something within 3 blocks from the corner. Use it for low-speed turning only; speed
  tests go on the long road, started fresh per run, with 2–3 repeats to drop traffic hits.
- **CDP touch dispatch is slow at speed**: `stickAt` (one `Input.dispatchTouchEvent`) returned
  after ~200 ms, and in road runs the engine saw the new target up to ~1 s after the call; the
  overlay itself reacts the next frame (verified with a `performance.now()` mark). Align the
  analysis on the first steering frame (`steer[3] != 0` / first key), never on the wall-clock
  time of the call.
- **Rotate offsets across variants.** `off = 3 + 12 * (run % 4)` with 4 variants put every
  variant at the same road offset every time: a parked car or a kerb at one offset then reads
  as a property of that variant (the soft-zone slip "4° vs 12°" was partly this). Use
  `(run * 3) % 4` or shuffle, and judge by the clean repeats.
- Slip on the long road scatters ±4° between clean runs at the same settings; a difference
  needs 3 clean runs per variant (speed must not collapse before the swerve or after it).
- **2026-11-02, the wrong-root server.** The :8124 server had died with the turn; it was
  restarted from `/home/user` (the GTA.js habit) and a probe spent its full 15-minute
  `startGame` budget on a directory listing, with no error, because `cleanSaves` only needs
  *a* page and a bare `curl` exits 0 on a 404. Now both `dev-servers.sh` and `launch()`
  verify the served `gta2.wasm` is this checkout's, and `launch()` refuses to run against
  anything else (see Setup). Lesson: a check that only tests "something answers" is no check.
- **2026-11-02, `source <(scripts/dev-servers.sh …)` hung in the Bash tool** after printing all
  its lines (both servers freshly started); the tool killed it after 30 min and the servers
  died with it. Run plainly (`scripts/dev-servers.sh <exe>` returns in seconds, same servers)
  and set `INSTALLER_MIRROR=http://127.0.0.1:8443/GTA2INSTALLER.exe` by hand. Cause not found
  (the servers' stdout/stderr go to /dev/null; `launch()` starts the site server by itself anyway).
- **2026-11-02, `scripts/dev-servers.sh … | tail -3` hung too**: the detached servers inherit
  the pipe, so `tail` never sees EOF (that is also what `source <(…)` waits for). Run the script
  with no pipe and no process substitution; if it still hangs, start the mirror by hand:
  `(nohup python3 -I scripts/installer-mirror.py <exe> 8443 >/dev/null 2>&1 &)`. The installer
  lives in the *gta-js-mobile* scratchpad of this sandbox
  (`/tmp/claude-0/-home-user-gta-js-mobile/<session>/scratchpad/gta2inst/`), not this repo's.
- Car models for `h.enterCar(x, model)` are the handling index (`car_model_enum`,
  `Source/enums.hpp`): 10 BUICK (plain), 12 COPCAR (police), 25 HOTDOG_D2 (the fast one used
  in the steering measurements), 83 ZCX5 (the Zaibatsu Z-Type).
