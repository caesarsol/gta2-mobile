#!/usr/bin/env bash
# Starts (idempotently) what a headless run needs and prints the env line to export.
#
#   source <(scripts/dev-servers.sh [/path/to/GTA2INSTALLER.exe])
#
# 1. The site: python http.server on 127.0.0.1:8124 from the repo root (it dies when the
#    shell that started it goes away, so run this before every probe).
# 2. The installer mirror (scripts/installer-mirror.py) on 127.0.0.1:8443, if an installer
#    file is given (argument, or $GTA2_INSTALLER), and the INSTALLER_MIRROR export for
#    scripts/headless.js. Without it a fresh browser profile downloads 346 MB from archive.org
#    at ~1 MB/min: always use the mirror.
#
# Processes are detached (nohup); never `pkill -f` by a pattern that also matches your own
# shell command line (exit 144): kill by pid or just leave them.
set -u
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
EXE="${1:-${GTA2_INSTALLER:-}}"

# The site must serve THIS checkout: a server started from another directory answers on the
# same port and every probe then waits 15 minutes for a game that never loads (2026-11-02).
# "Serves this checkout" = the served gta2.wasm has the size of ours (curl without -f exits 0
# on a 404, so never test with a bare curl).
serves_repo() {
  local served
  served="$(curl -sI "http://127.0.0.1:8124/gta2.wasm" | tr -d '\r' | awk 'tolower($1)=="content-length:"{print $2}')"
  [ -n "$served" ] && [ "$served" = "$(stat -c %s "$ROOT/gta2.wasm")" ] && curl -sf -o /dev/null "http://127.0.0.1:8124/mobile/boot.js"
}
if ! serves_repo; then
  if curl -s -o /dev/null "http://127.0.0.1:8124/"; then
    # whoever listens on the port (lsof / fuser / ss, whichever this box has)
    pid="$( (lsof -ti tcp:8124 -sTCP:LISTEN 2>/dev/null || fuser -n tcp 8124 2>/dev/null || ss -ltnp 'sport = :8124' 2>/dev/null | grep -o 'pid=[0-9]*' | cut -d= -f2) | tr -d ' ' | head -1)"
    echo "# site: :8124 is owned by a server that does not serve $ROOT (pid ${pid:-?}): stopping it" >&2
    [ -n "$pid" ] && kill "$pid" && sleep 1
  fi
  (cd "$ROOT" && nohup python3 -m http.server 8124 --bind 127.0.0.1 >/dev/null 2>&1 &)
  sleep 1
fi
if serves_repo; then
  echo "# site: http://127.0.0.1:8124/ serves $ROOT" >&2
else
  echo "# site: FAILED: http://127.0.0.1:8124/ does not serve $ROOT" >&2
  echo "false"
fi

if [ -n "$EXE" ]; then
  if ! curl -s -o /dev/null -r 0-0 "http://127.0.0.1:8443/GTA2INSTALLER.exe"; then
    nohup python3 -I "$ROOT/scripts/installer-mirror.py" "$EXE" 8443 >/dev/null 2>&1 &
    sleep 1
  fi
  echo "# mirror: $(curl -s -o /dev/null -r 0-0 -w '%{http_code}' http://127.0.0.1:8443/GTA2INSTALLER.exe)" >&2
  echo "export INSTALLER_MIRROR=http://127.0.0.1:8443/GTA2INSTALLER.exe"
else
  echo "# no installer given: set GTA2_INSTALLER or pass the path, or the first run downloads from archive.org" >&2
fi
