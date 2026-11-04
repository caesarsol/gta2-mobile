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

## Notes: progressive disclosure (read before, write after)

This file stays short. The details live in `notes/`, one file per area; **read the relevant
note before touching that area**, and **write back what you learn before moving on**: anything
that took more than one attempt, a wrong assumption, a measurement, a command that failed and
the one that worked. Each note ends with a "Lessons" section for that; keep entries dated and
terse. Update a note in the same commit as the change it documents (or its own `notes:` commit).

| Note | Read it when… |
|------|---------------|
| `notes/testing.md` | running anything headless: servers, installer mirror, probe hygiene, helpers, where files are in this sandbox |
| `notes/engine.md` | touching input, state, cars/steering, camera, HUD, shell screens, weapons; engine facts and measurements |
| `notes/overlay.md` | changing `mobile/`: joystick rings, buttons, rotation, map screen, sound, loader, autostart |
| `notes/build.md` | rebuilding the engine, patches, archived builds (`old/`) and per-build saves |
| `notes/reference.md` | vehicle model numbers and names, map block / slope / arrow bits, map objects and zones |

## Architecture (do not break)

- Everything at the root except `mobile/`, `scripts/`, `notes/`, `engine/`, `CLAUDE.md` and
  the README note is the **upstream build** (`gta2.wasm`, `gta2.js`, `shell.js`, `map.js`, …,
  `old/` = previous builds for old saves) — since the Mobile camera it is *our rebuild* of
  upstream with the patches in `engine/` (see `notes/build.md`). Never hand-edit it. The one
  hook is the `index.html` head (viewport, Apple metas, manifest, `<script src="mobile/boot.js?v=N">`).
- `mobile/boot.js`: cache-busting loader; changing it or `index.html` costs up to 10 min of
  Pages CDN cache → put logic in the other files. `mobile/mobile.js` + `mobile.css`: the
  overlay. `mobile/autostart.js`: landing → gameplay. `manifest.webmanifest` + icons: web app.
- Everything we do goes through `window.gta2` (`Module`, `map`, `audio`, `states`, `storage`,
  `renderer`; set by `shell.js start()`), synthetic `KeyboardEvent`s on `window`, and the
  `gta2_port_*` / `gta2_dev_*` exports of our engine build.
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

## Testing in one breath

```bash
source <(scripts/dev-servers.sh /path/to/GTA2INSTALLER.exe)   # site :8124, installer mirror :8443, INSTALLER_MIRROR
node scripts/headless.js                                        # smoke: clean start, turn, walk, car
```

Probes start **clean** (`h.startClean`), drive in the **test area** (`h.testArea`: walled road,
no traffic) or on the long road, wait for the dev state before driving, and record per frame
(`h.record`). Everything else: `notes/testing.md`.
