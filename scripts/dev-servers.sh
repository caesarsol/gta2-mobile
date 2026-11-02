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

if ! curl -s -o /dev/null "http://127.0.0.1:8124/index.html"; then
  (cd "$ROOT" && nohup python3 -m http.server 8124 --bind 127.0.0.1 >/dev/null 2>&1 &)
  sleep 1
fi
echo "# site: http://127.0.0.1:8124/ ($(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8124/index.html))" >&2

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
