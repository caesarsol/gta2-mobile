# Engine rebuild and archived builds

The engine in this repo (`gta2.wasm` + `gta2.js` at the root) **is our rebuild** of
gta2-browser with our patches; M1sterMo's last build (`3213c238…`) is kept under `old/`.

## Pipeline

`engine/build.sh <work>` does everything:

1. clones `gta2-browser` at the pinned commit (66d3462) into `<work>`, applies
   `engine/port-web.patch` (our changes to `port/`, `web/`, `scripts/` there) and the gta2_re
   patches `engine/00NN-*.patch` (0026 Mobile camera: mode 2, pinned to its target, look-ahead
   hook; 0027 steering: key override hook, wheel-angle scale hook, road assist off + note hooks;
   0028 analog throttle cap hook; 0029 tank turret aim hook) onto `research/port-work/core`
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
  `_set_steer_ramp` (soft zone), `_set_steer_grip` (no sliding), `_set_throttle` (pedal cap),
  `_steer_debug` (12 ints); `Gta2Port_SteerOverride` / `Gta2Port_SteerScale` /
  `Gta2Port_SteerAssistOff` / `Gta2Port_NoteSteerAssist` called from patch 0027,
  `Gta2Port_ThrottleCap` from 0028 (see `notes/engine.md`, Cars).
- `port/platform/test_area_web.cpp` — `gta2_dev_test_area`, `gta2_dev_area_objects`,
  `gta2_dev_car_name` (dev hooks, no gta2_re patch; see `notes/engine.md` and
  `notes/reference.md`).
- `port/platform/turret_web.cpp` — `gta2_port_set_turret_target`, `gta2_port_turret_state`;
  `Gta2Port_TurretOverride` called from patch 0029 (see `notes/engine.md`, Cars).
- `port/platform/mobile_camera_web.cpp` — `gta2_port_set_camera_lead(k, max)` (the camera
  itself is pinned to its target in patch 0026).
- `port/platform/dev_hooks.cpp` — `gta2_dev_*` (`find_open` and `spawn_car_near` are ours).
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
- **`engine/port-web.patch` must carry the new port files whole.** They are `git add -N`
  (intent-to-add) in the work tree, so a plain `git diff` of the paths shows them as `new file`;
  check `grep '^new file' engine/port-web.patch` after regenerating. `build.sh` resets the tree
  to the pinned commit and re-applies the patch whenever the reverse-apply check fails (any edit
  since the last export), so a partial patch would silently drop the rest of a file.
- **2026-11-04, fresh sandbox**: the unshield build failed (emscripten's zlib port download
  from github.com → 403 through the proxy). Copy the published `unshield.js`, `unshield.wasm`,
  `unshield-LICENSE.txt` from the repo root into `<work>/gta2-browser/build/unshield/` first
  (build.sh then skips it). The toolchain + first build took ~10 min; an unchanged rebuild
  reproduced 3e0b55df but rewrote every `?v=` hash in the root JS (`git checkout -- .`).
  New port files must be `git add -N`'d in `<work>/gta2-browser` before regenerating
  `engine/port-web.patch` (`git diff -- port/platform port/render scripts web`).
- 2026-11-04: ten rebuilds for one feature left seven unpublished archives in `old/` and in
  both work-dir `old/` folders; deleted in all three before the commit (the rule above).
  Port-only changes (a new `port/platform/*.cpp`) need no gta2_re patch: add the exports to
  `scripts/build_port.py`, `git add -N` the file, regenerate `engine/port-web.patch`.
- The core's commit hashes change on every `--prepare` (the core is re-created from the
  patches): take the hash to `--fixup` from `git log` at that moment, never from a note.
