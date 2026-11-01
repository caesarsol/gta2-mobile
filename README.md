# GTA2 in your browser

> **This fork: GTA2 Mobile — touch controls for phones.** Live at
> https://caesarsol.github.io/gta2-mobile/ (add it to the home screen for a chrome-less,
> landscape web app). Everything of ours is in [`mobile/`](mobile/): a fixed joystick with
> absolute direction of travel (point where you want to go; reverse by pointing behind the
> car), FIRE / ENTER / JUMP-BRAKE buttons, top-bar pills (menu, map, fullscreen, sound, tune,
> reload), the port's Saves screen top-left and the current weapon with ◀ ▶ top-right. It
> skips the landing page and the front end straight into the game (Continue when a save
> exists). `index.html` only gains the home-screen metadata and `mobile/boot.js`; the rest of
> the site is the upstream build. Append `?touch` to force the overlay on desktop, `?nointro`
> to keep the landing page. Upstream README follows.

**Grand Theft Auto 2 (1999), the real game, in a browser tab.** No install. Bring friends.

### ▶ [Play now](https://m1stermo.github.io/gta2/)

- The first time you press Play, the page downloads the official 2004 freeware release of GTA2
  from the [Internet Archive](https://archive.org/details/gta2_rockstar-classics) (346 MB). It
  unpacks it in your browser and keeps it for next time.
- Widescreen, a calmer camera, a full map with waypoints, and smooth motion on high-refresh
  screens.
- Up to 6 players: free roam, **Gang Wars** (crews side with the street gangs) and
  free-for-all, connected browser to browser.

**Host your own copy:** fork this repo, then in **Settings → Pages** choose *Deploy from a
branch*, `main`, `/ (root)`. It goes live at `https://<you>.github.io/gta2/`. Any static host
works too; serve the files as they are.

This repo is the built site only and holds **no game files**. The source code and credits are
in [M1sterMo/gta2-browser](https://github.com/M1sterMo/gta2-browser). The engine is the
[gta2_re](https://github.com/CriminalRETeam/gta2_re) decompilation, compiled to WebAssembly.

GTA2 is © Rockstar Games. This is an unofficial, non-commercial fan project, not affiliated
with Rockstar Games or Take-Two Interactive.
