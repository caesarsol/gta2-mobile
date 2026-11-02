#!/usr/bin/env python3
"""Local stand-in for the archive.org GTA2 installer, for repeatable headless runs.

Serves one file (GTA2INSTALLER.exe, 346 MB) over plain HTTP with CORS headers, like
https://archive.org/cors/gta2_rockstar-classics/GTA2INSTALLER.exe does. scripts/headless.js
redirects the game's request to it when INSTALLER_MIRROR is set (Playwright route → 302), so
no proxy or host-resolver tricks are needed (the sandbox proxy ignores --host-resolver-rules).

    python3 -I scripts/installer-mirror.py /path/to/GTA2INSTALLER.exe [port]   # default 8443
    export INSTALLER_MIRROR=http://127.0.0.1:8443/GTA2INSTALLER.exe

Any path ending in GTA2INSTALLER.exe is served; Range requests are supported (the unpacker
asks for the whole file, curl -C - works too).
"""
import http.server
import os
import sys

FILE = sys.argv[1]
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8443


class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        if not self.path.endswith('GTA2INSTALLER.exe'):
            self.send_response(404)
            self.end_headers()
            return
        size = os.path.getsize(FILE)
        start, end = 0, size - 1
        rng = self.headers.get('Range')
        if rng and rng.startswith('bytes='):
            a, _, b = rng[6:].partition('-')
            start = int(a or 0)
            end = int(b) if b else size - 1
            self.send_response(206)
            self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        else:
            self.send_response(200)
        self.send_header('Content-Type', 'application/octet-stream')
        self.send_header('Content-Length', str(end - start + 1))
        self.send_header('Accept-Ranges', 'bytes')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        with open(FILE, 'rb') as f:
            f.seek(start)
            left = end - start + 1
            while left > 0:
                chunk = f.read(min(1 << 20, left))
                if not chunk:
                    break
                left -= len(chunk)
                try:
                    self.wfile.write(chunk)
                except BrokenPipeError:
                    return

    def do_HEAD(self):
        self.send_response(200 if self.path.endswith('GTA2INSTALLER.exe') else 404)
        if self.path.endswith('GTA2INSTALLER.exe'):
            self.send_header('Content-Length', str(os.path.getsize(FILE)))
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    if not os.path.isfile(FILE):
        sys.exit(f'not a file: {FILE}')
    print(f'serving {FILE} ({os.path.getsize(FILE) >> 20} MB) on http://127.0.0.1:{PORT}/GTA2INSTALLER.exe', flush=True)
    http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()
