# Engine and shell facts

What the gta2-browser port and the `gta2_re` engine actually do, as verified. Function names are
from `gta2_re` (`Source/*.cpp`, in this sandbox under
`/home/user/m1stermo/gta2-browser/research/port-work/core/Source`). Add a dated line to
"Lessons" when a belief turned out wrong.

## Input and live state

- Input: `keydown`/`keyup` on **`window`**, by `e.code`, with `e.key` used for typing in the
  game's menus (`shell.js wireInput`). Defaults (`PORT_CONTROLS`): W/S move, A/D turn, L fire,
  Enter in/out of cars, Space jump/handbrake, J/K weapons, M map, Esc menu, Tab scoreboard,
  −/= view distance. Players can rebind them in the game's Options → we assume defaults.
  A key down+up inside one tick still counts as held for that tick, so one-frame taps work.
- Live state: `gta2.map.last` every frame (`map.js state()`): `hasPlayer`, `inCar`, `x`, `y`,
  `heading` (radians, engine units /1440), camera (`camX/Y/Z`, `zoom`). `null` outside gameplay.
- `Module.ccall('gta2_dev_state')` → 10 ints: player, inCar, x, y, z (Fix16, 16384 = 1 block),
  speed (Fix16, a **magnitude**, no sign), carModel, rot (Ang16), weapon idx, ammo. Dev hooks
  in the release wasm (`port/platform/dev_hooks.cpp`): `gta2_dev_spawn_car(model,dx,dy,rot)`,
  `gta2_dev_teleport(x,y)`, `gta2_dev_find_road()` → [x, y, ?, len, alongY],
  `gta2_dev_find_open()` → [x, y, ?, size], `gta2_dev_give_weapon(kind,ammo)` (kind = weapon
  idx; it does not select it; a car weapon kind while driving arms the car), `gta2_dev_add_cash(n)`.
- Weapon idx = the engine's `weapon_type` enum (`enums.hpp`): 0 pistol, 1 smg, 2 rocket,
  3 shocker, 4 molotov, 5 grenade, 6 shotgun, 7 electro baton, 8 flamethrower, 9 silenced smg,
  10 dual pistol, 15 car bomb, 16 oil, 17 mines, 18 car MG, 19 tank gun, 20 fire truck water,
  21 fire truck flame, 22 jeep gun; −1 = fists. **Not** the pickup order of map.js `WEAPONS`
  (that mistake gave "Electro" for molotovs). Ammo is **10× the HUD count** (`max_ammo_capacity`
  99 → 990).
- **In a car only a car weapon fires** (idx ≥ 15, `Weapon_8::is_car_weapon_433820`;
  `Ped::GetWeaponFromPed_46F110` returns the player's current weapon in a car only when it is a
  car weapon, otherwise nothing). The ped's own weapon is carried along, invisible. The overlay
  hides Fire and the weapon pills in an unarmed car (`canFire`).

## Geometry

- Heading `a`: forward on screen = `(sin a, −cos a)`; `a = π` faces screen-up; +x is
  screen-right, +y screen-down; in map coordinates (y down) forward = `(sin a, cos a)`. The camera
  is top-down and axis-aligned (verified visually). Stick math is identical to gta-js-mobile:
  screen angle φ = atan2(−dy, dx), target heading = φ + π/2.
- **Verified:** `A` increases `a` (turn left), on foot and in a moving car; while a car **backs
  up the steering is inverted** (as in a real car; the physics tests velocity vs heading,
  `CarPhysics_B0::HandleUserInputs_55A860`), so the controller flips A/D in reverse mode. Cars
  do not yaw at standstill.
- GTA2 has **no run key** and **no direct weapon selection** (J/K cycle).

## On foot

- **Turning is fast and quantised**: ~12° per 30 Hz tick once turning, seen a tick late, so a
  hold-until-aligned controller oscillates ±20° forever, whatever the threshold (measured
  1.20 ↔ 1.89 rad around 1.57). The overlay **holds** the key while far, releases it `stopAhead`
  (~0.3 rad, measured) early, then **taps** one tick at a time (~0.09 rad each, measured) with
  ~110 ms to settle. Converges in ~0.5 s with no overshoot.
- Turning on the spot (no W) works the same; a 90° turn in place takes ~1 s, no displacement.
- Entering a car takes about **4.5 s** (walk to the door + animation). `map.last.inCar` is true
  from the first step, the dev state only once inside. Getting out is immediate.

## Cars

- **Steering is on/off, instantly at full lock**: `CarPhysics_B0::UpdateSteeringAngle_562560`
  sets the wheel angle to `turn ratio × direction` the tick the key is held (only uni_num 2,
  bikes, scale it with speed). No ramp. Every car has front/rear skid thresholds in its handling
  data (`field_24/28_skid_threshhold`, `UpdateWheelSkidEffects_55DC00`): at speed, full lock
  slides — the arcade handling is by design, and a keyboard player avoids it with short taps.
- **Steering jitter: root cause (verified in open ground).** Cars have **yaw momentum**: after
  the key is released the heading keeps turning ~10° at low speed (more at speed, more for
  small cars with a high turn ratio), on top of the 1–2 tick input latency. A hold + hysteresis
  controller outside the engine (dead band 5°) overshoots and hunts around any target with a
  ±10° limit cycle, period ~1 s — measured in the park (`gta2_dev_find_open`) for targets of
  10°, 30°, 45° and 90° alike. Why it looked direction-dependent on the phone: along a street
  nothing is corrected, and at the cardinal directions the kerbs realign a scraping car (the
  map-edge collision response, `CarPhysics_B0::ApplyForward/ReverseEngineForce` → an angular
  impulse of 1°/tick toward the wall's axis), which damps the hunt; at a diagonal nothing masks
  it. There is **no** free-space auto-straightening (an earlier reading, taken on a one-block
  road, was wrong: the car was scraping the kerb).
- **Engine-side steering (patch 0027 + `port/platform/steer_web.cpp`)**: the fix.
  `gta2_port_set_steer_target(units)` (Ang16, 4 per degree, −1 = off) sets a target heading;
  `Car_BC::HandleUserInput_4418D0` of the *local* player's car gets its left / right keys
  decided once per tick with the exact heading and angular velocity: `predicted = error − ω·kd`
  (kd ticks of momentum, default 2), steer while |predicted| > band (6 units = 1.5°), restart
  only beyond 2× the band, keys inverted while backing up. `gta2_port_set_steer_params(kd,
  band)`; `gta2_port_steer_debug()` → [active, error, ω, decision]. Measured in the park with
  the joystick: 30° → −0.5°, 90° → +1.3°, −45° → +1°, settles in ~1.5–2 s, no hunting; reverse
  backs up straight. Co-op: the override changes the local car's inputs, so peers must run the
  same build (accepted). `mobile.js` clears the target (−1) whenever the stick is idle,
  released, on foot or hidden.
- **Skidding with the stick — measured (2026-11, clean runs, long road, model 25 at
  0.38 blocks/tick, 25° swerve for 0.5 s and back)**: stick with the engine steering at full
  lock → max slip 9°, heading peak 22°, settled within 1° in ~1.4 s; keyboard 100 ms taps (3 + 3)
  → slip 8°, peak 20°; keyboard A/D held 300 ms → slip 10°, peak 19°. So the stick does **not**
  slide more than a keyboard player on this car; the "sbandate" felt on the phone were partly
  **collisions with traffic** (speed collapsing 0.38 → 0.1 in a tick, then a 20–40° slide) and
  partly the full-lock jab feel. **Soft zone (`gta2_port_set_steer_ramp(units)`, Tune
  `steerRamp`, default 20°)**: within that angle of the target the key is pulsed by a sigma-delta
  modulator with duty |predicted| / ramp (a quarter of the ticks at a quarter of the ramp), full
  lock beyond. Measured on the same swerve: slip 7°, peak 17°, settled 0.7° in ~1.6 s — a bit
  gentler, slightly slower; 0 = the old behaviour. Small cars with a high turn ratio were not
  measured yet. `gta2_port_steer_debug()[3]` is now the key actually sent that tick.
- The overlay shows `Car <model>` under the weapon pills while driving (model = handling index).

## Camera

- The engine raises the camera with speed (car height + raw speed; drawn height 1 on foot,
  ~4.7 at speed 0.22, up to 14); the port's Modern camera only smooths it
  (`port_modern_camera.cpp`). `gta2_port_set_camera(mode, bias)` adds `bias` (clamped −2…+4)
  to the drawn height; `map.last.camZ` is that drawn height. The overlay's `camTick` holds it
  at Tune `camFoot` (2) / `camCar` (4) with bias = target − (camZ − bias), eased. Beyond the
  clamp (fast cars) it drifts up a little. `camLock = 0` restores the shell's stored camera.
- **Mobile camera (patch 0026)**: the real phone problem was the *lead*
  (`ApplyCarVelocityCameraOffset_436200` puts the camera up to ~4 blocks ahead of a moving car
  and raises it): the car ends up under the thumb. Mode 2 skips that offset (centred, like on
  foot); `gta2_port_set_camera` accepts 0/1/2; the shell's Camera button cycles Modern → Mobile
  → Classic (also a landing option); touch defaults to `mobile`.
- **Follow + look-ahead (patch 0028, `port/platform/mobile_camera_web.cpp`)**: the camera
  follows its target with a spring (`SmoothApproach`, `Camera_0xBC::Update_435FF0`) whose
  acceleration and top speed scale with the *simulated* height; mode 2 keeps it at 1, so a fast
  car outran the camera (lag ≈ 2.8 blocks per block/tick; 1.1 blocks at 0.4 = the front edge
  at camZ 4). Fix: in mode 2 the spring is scaled ×4 (`gta2_port_set_camera_follow`) and a
  bounded look-ahead along the velocity is added, lead = min(speed × k, 3 blocks), k = 7 ticks
  (`gta2_port_set_camera_lead(k, max)`, Tune `camLead`). Measured on the long road (model 25):
  camera ahead by ~3.8 × speed blocks (0.7 at 0.2, 1.5 at 0.4), zero when stopped, smooth. The
  Modern camera leads 2.7 blocks at 0.2 and rises.
- **HUD inset** (`gta2_port_set_hud_inset(refPx)`, port `frame.cpp`): the port anchors HUD parts
  to the screen edges by ±(width − 640)/2 reference px (side 0 left, 1 centre, 2 right); the
  inset pulls the anchored parts back in. The overlay sends its side padding (safe area / notch,
  ≥ 20 px) in reference px (480 per canvas height), so the health bars and the weapon icon
  clear the notch while the game view stays put.

## Shell

- Front end: Bink movies are stubbed, so after `gta2_start` the game shows its title and menu;
  **Enter twice** (title, PLAY) starts area 1 — upstream's `?autostart=1` does that at 1.5 s and
  3.5 s. `autostart.js` sends Enter until `hasPlayer`. "Continue" on the landing page loads the
  newest save state of **this build** right after start.
- Game files: the 346 MB freeware installer from archive.org is unpacked in a worker and kept
  in IndexedDB (`gta2-port-gamefiles`, ~67 MB, `navigator.storage.persist()`). iOS: a
  home-screen web app has its **own** storage, separate from Safari → the first download must
  happen inside the installed app.
- Save states: IndexedDB `gta2-port-states` (`savestate.js`), per engine build (`save.build`),
  autosave on tab hide. The Saves screen (`#saves-screen`, `saves.js`) pauses the game; a save
  of another build gets "Open in its version" → `window.open('old/<build>/', '_blank')` (we
  redirect it to the same tab, see `notes/overlay.md`).
- Audio: `gta2.audio` (`audio.js`): `resume()`, `setMuted(bool)`, `ctx`. The shell resumes on
  `keydown`/`pointerdown`; iOS needs a real gesture.
- The map screen (`gta2.map.open`, `#map-screen`) covers the game and pauses it; `map.zoomBy(f,
  px, py)`, `map.view.cx/cy/scale`, `map.reveal`, `map.waypoint`; keys E/Q zoom, Space recentre,
  F reveal, Delete clear waypoint. One pointer only (drag pans, tap sets the waypoint).
- Screens we must not cover or break: `#landing` (scrolls), `#saves-screen`,
  `#controls-screen`, the map, `#coop`, `#tools` (toolbar). The overlay hides behind them and
  never cancels their touches.
- `build_pages.py` (upstream) refuses `*.wav` → our silent loop is an inline data URI.

## Lessons (add yours, dated)

- 2026-11: weapon names were read off the HUD icon order; the engine enum is the truth.
- 2026-11: "cars auto-straighten in free space" was a misread probe (kerb scraping on a
  one-block road). Test in the open square before concluding anything about car dynamics.
- 2026-11: `map.last.inCar` ≠ "driving" during the door walk; the dev state is.
- 2026-11: speed collapses at full speed on the long road were traffic / abandoned test cars
  from previous probes (autosave Continue), not the steering override. Confirmed with clean
  runs: the collapse happens with keyboard steering too, and never without a car ahead.
