# The touch overlay (`mobile/`)

Design decisions and mechanics of `mobile.js` / `mobile.css` / `autostart.js` / `boot.js`. The
"why" lives here; the code comments say "what".

## Joystick

- Absolute direction of travel on screen; the controller turns the character/car to face it
  (tank controls underneath). Tunables in `TUNE_DEFS` (`window.gtaMobile.tune`), persisted in
  `localStorage['gta2-mobile:tune']`.
- **On foot**: two rings. Dead zone `ringMove` (20 px); up to `ringAim` (60 px, dashed) the ped
  only **turns on the spot** (aim and shoot), knob white; beyond it the ped turns first and
  **walks once within `walkStart`** (45°; 20° made it stop and turn too often) of the direction,
  stopping again beyond 2× (hysteresis).
  Turning uses the measured hold→tap controller (`notes/engine.md`, On foot).
- **In a car**: any distance beyond the dead zone drives; the engine steers
  (`setSteerTarget`, soft zone `steerSoft` → `gta2_port_set_steer_ramp`, grip `steerGrip` →
  `gta2_port_set_steer_grip`; 0 in the tank and while the Brake button is held, `gripNow()`), the overlay holds W or S. Pointing more than `revEnter` (130°) behind the
  car = reverse (exit below `revExit`, 100°), drawn as the red sector; A/D are flipped in reverse.
  **Throttle**: the distance between the dead zone and `throttleFull` (110 px; 0 = off) caps the
  engine's gas pedal in proportion (`setThrottle` → `gta2_port_set_throttle`, 0..256; 256 whenever
  the stick is idle / released / on foot). The pedal is a 3:1 range of engine force, not of
  speed (`notes/engine.md`, Cars). Shown on the stick: a dotted yellow ring at `throttleFull`
  and a **throttle fan**, a 28° wedge from the centre toward the thumb as long as the gas it
  gives (`.gta-throttle-fan`, a conic gradient sized in `updateStick`; CSS conic angles are
  clockwise from up = `atan2(dx, −dy)`). Both only in a car with the feature on.
- Rejected / removed: a JS-side predictive release for cars (replaced by the engine override),
  damping code (the user asked to remove it).

## Buttons and pills

- **Tank: Fire's turret ring** (`turretTick`, `turretRingDown`): while driving a tank
  (`gta2_port_turret_state()[0]`) Fire grows to 124 px around the same centre (`.is-turret`):
  the inner disc (radius `TURRET_INNER` 36 px, dashed) fires as before; a touch on the ring, or a
  drag along it, sends the turret toward that direction on screen (`gta2_port_set_turret_target`,
  same angle convention as the stick) without firing; the yellow mark on the ring is the
  turret's actual direction, per frame. The turret then holds that world heading while the hull
  turns; the target is cleared (−1) when leaving the tank. The ring's left edge just touches
  Brake (checked at 844×390). Verified headless, landscape and forced landscape: ring up →
  turret 720 (up), no ammo used; drag right → down → target 0; centre tap fires (200 → 190).

- Right: Fire (L), Enter/Exit (Enter), Jump/Brake (Space). In menu mode (no player yet, game
  over) the stick is a d-pad, Enter = OK, Jump = Esc. In an **unarmed car** Fire and the weapon
  pills are hidden (`canFire`: weapon idx ≥ 15).
- Top bar (centre): Saves, ? (Esc menu), Map (M), Fullscreen (hidden on iPhone), Sound, Tune,
  ⋯ (the shell's toolbar), Reload (mounted by boot.js, adopted into the bar), and in an
  **archived build** a yellow ⤒ back to the latest version.
- Weapon pill under the HUD, right: `◀ name (ammo) ▶` (J/K). `#gtaCar` shows `Car <model>`.
- **Component rule**: `.gta-pill` (+ `is-on`, `is-down`, `--primary`, `--danger`, `--dim`,
  `--block`), `.gta-btn` for round buttons; positioning by id; size by padding. The HUD owns
  both top corners (health left, cash/lives/weapon right, down to ~85 px): never put anything
  there. Resets stay on the component classes, not on `#gtaMobile button` (the reload pill
  lives outside `#gtaMobile`).

## Tune panel

`TUNE_DEFS` entries are `{ k, label: 'Group · item', def, step, min, max, help }`; the panel
groups rows by the label's group and flows the groups down two CSS columns (`columns: 2`,
`break-inside: avoid`), ✕ pill absolute in the corner (the inner `.gta-panel-scroll` scrolls,
padded on the left by the notch inset), small Reset. `saveTune` stores **only values that differ
from the default**, so a changed default reaches everyone who left that setting alone (no
migration list). Tap the label for the help text. A **Spawn · get in** row on top (`SPAWN_MODELS`:
Tank 54, Z-Type 83, Gun jeep 22, Police 12, Fire truck 17, Bus 11, Bike 69) closes the panel,
gets out of the current car (handbrake, then Enter), spawns the model 2 blocks ahead
(`gta2_dev_spawn_car`, same heading) and presses Enter (the door walk takes ~4 s). Pushed
untested on request (2026-11-04). No probes or screenshots for this panel (user
request): edit and push.

## Touch hardening

`touchstart/move/end` are cancelled on the game surface (canvases + overlay) with non-passive
capture listeners: no long-press callout, double-tap zoom or synthesised `click`. Therefore
**no `click` fires on our controls**: act on `pointerup` (`onTap`, deferred one task). The
shell's own UI (`#landing`, `#saves-screen`, `#controls-screen`, `#coop`, `#tools`, dialogs)
is excluded and keeps native clicks. iOS `gesturestart/change/end` are cancelled too.

## Forced landscape (`syncRotation`)

iOS has no `screen.orientation.lock` and ignores the manifest orientation, so under a portrait
lock the `body` is rotated 90° with CSS (sides swapped, `position: fixed`; fixed descendants
rotate with it). The renderer, `chooseViewWidth` and the map measure canvases with
`getBoundingClientRect()` **every frame**: on a rotated element that box has its sides
swapped, so the game canvases get an instance override returning the layout size. Stick deltas
are rotated into the page frame; safe-area insets are physical and get remapped. Panels size in
`%` of `#gtaMobile`, never `vw`/`vh`. Tune `rotate`: 1 notch-left (default), −1 notch-right,
0 off. Headless: `VIEWPORT=390x844`.

## Map screen

Only the **map bar** is shown (right-aligned column: ✕ (M), a pill-high gap, + / − (E / Q), You
(Space), Reveal (F, `is-on` when all is shown), Clear (Delete, dimmed without a waypoint)), so
the legend at the left stays free. The map canvas is inset 20 px (or the safe area) from the
notch side. Pointer events aimed at `#map-screen` are intercepted on `window` (capture) and
re-dispatched once, marked, with page-frame coordinates (inverse of the body rotation) — the
map knows one pointer: drag pans, tap = waypoint (verified: tap at centre + 150 px → waypoint
150 / scale blocks east). A **second finger** turns the gesture into a pinch: the map's own
drag is ended with a synthetic moved+up (no waypoint), then `map.zoomBy(f, midX, midY)` plus
the midpoint pan are driven by us until all fingers lift.

## Camera, HUD inset, engine parameters

`camTick` (per frame) keeps the drawn height at `camFoot` / `camCar` through
`gta2_port_set_camera(mode, bias)`, mode from `localStorage['gta2-port-camera']` ('mobile' = 2).
`applySteerParams` sends `gta2_port_set_steer_params`, `_set_steer_ramp`, `_set_steer_grip`,
`gta2_port_set_camera_lead(camLead, 3)` (default 0: the car stays centred) and
`gta2_port_set_hud_inset` (side padding → reference px) whenever a value changes. Details and
measurements: `notes/engine.md`.

## Driving charts (`mobile/charts.js`)

Tune `charts` (boolean) or the chart pill in the top bar. `mobile.js` loads `charts.js` itself
(from its own URL, with boot.js's `?v=`: boot.js's file list stays fixed) and pushes one sample
per frame from `gta2_port_steer_debug` (12 ints) while in a car; `window.gtaDrivingCharts.show/push`.
Design: the x axis is **time in motion** (advances only while speed > 0; the charts freeze when
stopped and stay readable), last 8 s, "now" at the right. Two panels, `#gtaCharts` in the middle
band (right of the stick, left of the buttons, under every control), the plot canvas at 20 %
opacity, the label canvas (name + current value per series, right of each panel) at 75 %. Each
series has its own scale (auto-range over the window with a floor, or fixed: lock ±1, pedal
0..5). Panel "steer": error °, ω °/tick, lock = key × scale, snap = road assist °/tick; band =
key held. Panel "grip": slip °, lateral b/t, speed b/t, pedal; bands = front / rear skid (wheel
force ≥ the handling's threshold). Labels only, no probes needed to read it: drive and look.

## Sound

Browsers start audio only inside a user gesture; iOS does not count a touch `pointerdown` and we
cancel `touchstart` (no click), so the shell's own one-shot resume never fires. The **Sound pill**
(default off) resumes + unmutes on its `pointerup`; a saved-on state finishes the job on the
next `touchend`/`pointerup`/`keydown`. A looping silent inline `<audio>` (data URI) keeps iOS
from muting Web Audio with the ringer switch.

## Loader, archived builds, autostart

- `boot.js` loads `mobile.css`, `mobile.js`, `autostart.js` with `?v=<timestamp>` from **its
  own URL** (so `old/<id>/index.html` can reference `../../mobile/boot.js`), shows the version
  label (Last-Modified + ETag tail) and the reload pill (`location.replace(path?r=now)`).
  Changing `boot.js` or `index.html` costs up to 10 min of Pages CDN cache: put logic in the
  other files. Bump `?v=N` in `index.html` when boot.js must change.
- Saves of an older build: `window.open('old/<build>/', '_blank')` is patched to
  `location.assign` (same tab; a home-screen app would land in Safari, whose storage has no
  game files); the ⤒ pill goes back to the root.
- `autostart.js`: presses Continue if the card shows within 2.5 s, else Play; then Enter every
  2 s (max 6) until `hasPlayer`. `?nointro` disables it.

## Lessons

- A reset rule with higher specificity (`#id button`) silently zeroes component padding.
- Fixed-position elements have `offsetParent === null` (don't test visibility with it).
- The reload pill was once hidden under the weapon pills: the top row has three owners (HUD
  left, bar centre, weapon pills right) — check all three at 844×390 and 390×844.
- `pointerdown` on the weapon ◀ ▶ while the pill hides (entering a car) must release the key.
- **An element id is a window global** (named access): the chart pill `id="gtaCharts"` made
  `window.gtaCharts` the button until charts.js assigned its module, and `C.show` threw inside
  the first `loop()` call, which runs *before* `window.gtaMobile` is set (the probes then saw
  a half-built overlay). Module globals get names no element uses (`gtaDrivingCharts`), and
  the pill is `#gtaChartsBtn`.
- The charts box must stay clear of the round buttons (right: safe area + 200 px) and the
  stick (left: safe area + 290 px): checked on the 844×390 screenshot.
