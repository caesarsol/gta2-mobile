# Engine rebuild and archived builds

The engine in this repo (`gta2.wasm` + `gta2.js` at the root) **is our rebuild** of
gta2-browser with our patches; M1sterMo's last build (`3213c238…`) is kept under `old/`.

## Pipeline

`engine/build.sh <work>` does everything:

1. clones `gta2-browser` at the pinned commit (66d3462) into `<work>`, applies
   `engine/port-web.patch` (our changes to `port/`, `web/`, `scripts/` there) and the gta2_re
   patches `engine/00NN-*.patch` (0026 Mobile camera: mode 2, pinned to its target, look-ahead
   hook; 0027 steering: key override hook + wheel-angle scale hook) onto `research/port-work/core`
   (stale copies of our patches in `port/patches` are removed first);
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
diff; engine (gta2_re) changes become new numbered patches: commit in the core repo
(`research/port-work/core`, branch `browser-port`), `git format-patch -1 --start-number NN -o
engine/`. Keep **one patch per area** (squash into the existing camera / steering commit with a
`rebase -i` and re-export both) rather than a patch per iteration: `build_port.py --prepare`
re-creates the core from the patches, so the core's history is ours to rewrite.

## Port files we own

- `port/platform/steer_web.cpp` — `gta2_port_set_steer_target`, `_set_steer_params`,
  `_set_steer_ramp` (soft zone), `_set_steer_grip` (no sliding), `_steer_debug`;
  `Gta2Port_SteerOverride` / `Gta2Port_SteerScale` called from patch 0027 (see
  `notes/engine.md`, Cars).
- `port/platform/mobile_camera_web.cpp` — `gta2_port_set_camera_lead(k, max)` (the camera
  itself is pinned to its target in patch 0026).
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
- **Experimental builds leave archives behind.** Every `build.sh` run archives the live build
  under `old/<id>/` (repo) **and** under `build/port/release/old/` + `build/pages/old/` in the
  work dir, and the next run copies the work-dir archives back into the repo. After an
  experiment that was never published, delete its `old/<id>` in all three places (the final
  rebuild then shows no `old/` change). The `old/` list is for builds a phone may have saves of.
- The build is deterministic: the same sources give the same `gta2.wasm` (consolidating the
  patches reproduced 02bb1fc4 exactly), so a patch-only change needs no new archive.
