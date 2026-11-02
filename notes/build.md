# Engine rebuild and archived builds

The engine in this repo (`gta2.wasm` + `gta2.js` at the root) **is our rebuild** of
gta2-browser with our patches; M1sterMo's last build (`3213c238…`) is kept under `old/`.

## Pipeline

`engine/build.sh <work>` does everything:

1. clones `gta2-browser` at the pinned commit (66d3462) into `<work>`, applies
   `engine/port-web.patch` (our changes to `port/`, `web/`, `scripts/` there) and the gta2_re
   patches `engine/00NN-*.patch` (0026 Mobile camera, 0027 engine-side steering, 0028 camera
   follow + look-ahead) onto `research/port-work/core`;
2. installs Emscripten 6.0.12 under `research/toolchains/emsdk` (first time only, ~300 MB; the
   download was once blocked by a classifier and then went through on retry) and the prebuilt
   unshield; `build_port.py --prepare`, `build_pages.py` (compile ≈ 30 s on 4 cores);
3. archives the live build under `old/<id>/` (id = first 24 hex of sha256(gta2.wasm)), syncs
   the new output to the repo root (all `?v=` hashes change), and re-applies the `index.html`
   hooks with `engine/patch-index.py` (root and every `old/*/index.html`, with the right
   `../../mobile/boot.js` prefix).

This sandbox: work dir `/home/user/m1stermo`, sources and toolchain under
`/home/user/m1stermo/gta2-browser/research/`. Edit the port there (`port/platform/*.cpp`,
`web/*.js`, `scripts/build_port.py` exports) and regenerate `engine/port-web.patch` from its git
diff; engine (gta2_re) changes become new numbered patches.

## Port files we own

- `port/platform/steer_web.cpp` — `gta2_port_set_steer_target`, `_set_steer_params`,
  `_steer_debug` (see `notes/engine.md`, Cars).
- `port/platform/mobile_camera_web.cpp` — `gta2_port_set_camera_lead(k, max)`,
  `gta2_port_set_camera_follow(scale)`.
- `port/platform/dev_hooks.cpp` — `gta2_dev_*` (`find_open` is ours).
- `port/platform/frame.cpp` — `gta2_port_set_hud_inset`.
- `port/platform/vid_web.cpp` — `gta2_port_set_camera` modes 0/1/2.
- `web/shell.js`, `web/landing.js` — 3-mode camera button / option.

## Archived builds and save states

- **Save states are per build.** After a rebuild the previous build goes under `old/<id>/` so
  existing saves still open: the Saves screen offers "Open in its version" for a save of a
  build that is still served (it HEADs `old/<build>/gta2.wasm`).
- Every archived page must carry the overlay hook too: `patch-index.py old/<id>/index.html`
  (build.sh does it) writes `<script src="../../mobile/boot.js?v=N">`; `boot.js` resolves
  `mobile.css` / `mobile.js` / `autostart.js` from its own URL, so one `mobile/` at the root
  serves them all. Without the hook an old save "starts the game without our controls".
- `old/` holds intermediate dev builds too (21 MB); prune the short-lived ones if the repo gets
  heavy, keeping any build that a real phone may have saves for.

## Lessons

- `build_pages.py` refuses `*.wav` (it treats the suffix as game data) → inline data URI.
- The HUD inset side logic: upstream passes offset × side (0 left, 1 centre, 2 right); compare
  with (width − 640)/2, not the sign.
- `gta2_port_set_camera` must clamp the mode to 0..2; the shell stores mode *strings*
  (`gta2-port-camera`: modern / mobile / classic).
