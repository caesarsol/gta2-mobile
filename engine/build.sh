#!/usr/bin/env bash
# Rebuilds the engine (gta2.js + gta2.wasm) and the static site with GTA2 Mobile's engine
# changes, then syncs the result into this repo's root.
#
#   engine/build.sh [work-dir]        (default: ../gta2-mobile-engine next to this repo)
#
# Needs: git, python3, ~3 GB of disk, network (emsdk 6.0.12 ≈ 600 MB, gta2_re, unshield).
# A prebuilt unshield.{js,wasm} in <work>/gta2-browser/build/unshield skips the unshield build.
# Steps: clone M1sterMo/gta2-browser at the pinned source commit, apply engine/port-web.patch
# (port/ + web/ changes) and copy engine/00NN-*.patch into port/patches, install Emscripten,
# run upstream's build_port.py --prepare (applies all patches to gta2_re) and build_pages.py,
# keep the currently published build under old/<build-id>/ for existing saves, then rsync
# build/pages into the repo root (mobile/, scripts/, engine/, CLAUDE.md and README.md untouched)
# and re-apply the index.html hooks.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd)
WORK=${1:-$REPO/../gta2-mobile-engine}
SRC_PIN=66d3462482abc6ad5ab56dc3ae95ecb41a447461   # M1sterMo/gta2-browser matching the published build
EMSDK_VER=6.0.12
UNSHIELD_PIN=0d1e7cb

mkdir -p "$WORK"
cd "$WORK"
if [ ! -d gta2-browser/.git ]; then
  git clone -q https://github.com/M1sterMo/gta2-browser gta2-browser
fi
cd gta2-browser
git fetch -q origin
if git apply --reverse --check "$REPO/engine/port-web.patch" 2>/dev/null; then
  echo "build.sh: port-web.patch already applied in $PWD"
else
  git checkout -q "$SRC_PIN" && git reset -q --hard "$SRC_PIN" && git clean -qfd port web scripts
  git apply "$REPO/engine/port-web.patch"
fi
cp "$REPO"/engine/00*.patch port/patches/
mkdir -p research/toolchains
[ -d research/gta2_re/.git ] || git clone -q https://github.com/CriminalRETeam/gta2_re research/gta2_re
[ -d research/toolchains/unshield/.git ] || { git clone -q https://github.com/twogood/unshield research/toolchains/unshield && git -C research/toolchains/unshield checkout -q "$UNSHIELD_PIN"; }
if [ ! -x research/toolchains/emsdk/upstream/emscripten/em++ ]; then
  [ -d research/toolchains/emsdk/.git ] || git clone -q https://github.com/emscripten-core/emsdk research/toolchains/emsdk
  research/toolchains/emsdk/emsdk install "$EMSDK_VER"
  research/toolchains/emsdk/emsdk activate "$EMSDK_VER"
fi
python3 scripts/build_port.py --preset release --prepare
# archive the currently published build so saves made with it still open (web/saves.js "old/")
build_id() { python3 -c "import hashlib,sys; print(hashlib.sha256(open(sys.argv[1],'rb').read()).hexdigest()[:24])" "$1"; }
LIVE_ID=$(build_id "$REPO/gta2.wasm")
if ! cmp -s "$REPO/gta2.wasm" build/port/release/gta2.wasm && [ ! -d "$REPO/old/$LIVE_ID" ]; then
  mkdir -p "build/port/release/old/$LIVE_ID"
  cp "$REPO"/*.js "$REPO"/index.html "$REPO"/gta2.wasm "$REPO"/unshield.wasm "$REPO"/unshield-LICENSE.txt "build/port/release/old/$LIVE_ID/"
  cp -R "$REPO/vendor" "build/port/release/old/$LIVE_ID/"
fi
[ -d "$REPO/old" ] && cp -R "$REPO/old/." build/port/release/old/
python3 scripts/build_pages.py
python3 - "$PWD/build/pages" "$REPO" <<'PY'
import shutil, sys
shutil.copytree(sys.argv[1], sys.argv[2], dirs_exist_ok=True, ignore=shutil.ignore_patterns('README.md'))
PY
python3 "$REPO/engine/patch-index.py"
echo "engine/build.sh: done. New build id: $(build_id "$REPO/gta2.wasm")"
echo "Review with: git -C $REPO status --short | head; then commit."
