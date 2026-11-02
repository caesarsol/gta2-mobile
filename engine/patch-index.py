#!/usr/bin/env python3
"""Re-applies GTA2 Mobile's index.html hooks after an engine rebuild (idempotent).

Upstream's build_pages.py regenerates index.html from the shell's; this adds the home-screen
metadata, the viewport and the mobile/boot.js loader back, matching what the repo carries.
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
index = ROOT / 'index.html'
html = index.read_text()
if 'mobile/boot.js' in html:
    print('patch-index: hooks already present')
    sys.exit(0)
old = '  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
if old not in html:
    print('patch-index: viewport meta not found', file=sys.stderr)
    sys.exit(1)
boot_v = 2
m = re.search(r'mobile/boot\.js\?v=(\d+)', (ROOT / 'CLAUDE.md').read_text())
new = ('  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n'
       '  <!-- GTA2 Mobile (mobile/): home-screen web app metadata and the touch overlay loader -->\n'
       '  <meta name="apple-mobile-web-app-capable" content="yes">\n'
       '  <meta name="mobile-web-app-capable" content="yes">\n'
       '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
       '  <meta name="apple-mobile-web-app-title" content="GTA2">\n'
       '  <link rel="apple-touch-icon" href="mobile/icon-180.png">\n'
       '  <link rel="manifest" href="mobile/manifest.webmanifest">\n'
       f'  <script src="mobile/boot.js?v={boot_v}"></script>\n')
index.write_text(html.replace(old, new, 1))
print('patch-index: hooks added')
