#!/usr/bin/env python3
"""Adds GTA2 Mobile's hooks to a built index.html (idempotent).

  engine/patch-index.py                 the repo root's index.html (prefix '')
  engine/patch-index.py old/<id>/index.html  an archived build: the loader is referenced from
                                             the root (prefix '../../'), where mobile/ lives.

Upstream's build_pages.py regenerates index.html from the shell's; this adds the viewport, the
home-screen metadata and the mobile/boot.js loader back. The loader resolves our other files
from its own URL, so one copy at the root serves the archived builds too.
"""
import pathlib, re, sys

BOOT_V = 3
ROOT = pathlib.Path(__file__).resolve().parents[1]
target = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / 'index.html'
rel = target.resolve().parent.relative_to(ROOT)
prefix = '../' * len(rel.parts)
html = target.read_text()
hook = f'<script src="{prefix}mobile/boot.js?v={BOOT_V}"></script>'
if hook in html:
    print(f'patch-index: {target}: up to date')
    sys.exit(0)
if 'mobile/boot.js' in html:
    html = re.sub(r'<script src="[^"]*mobile/boot\.js\?v=\d+"></script>', hook, html)
    target.write_text(html)
    print(f'patch-index: {target}: loader path/version updated')
    sys.exit(0)
old = '  <meta name="viewport" content="width=device-width, initial-scale=1">\n'
if old not in html:
    print(f'patch-index: {target}: viewport meta not found', file=sys.stderr)
    sys.exit(1)
new = ('  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">\n'
       '  <!-- GTA2 Mobile (mobile/): home-screen web app metadata and the touch overlay loader -->\n'
       '  <meta name="apple-mobile-web-app-capable" content="yes">\n'
       '  <meta name="mobile-web-app-capable" content="yes">\n'
       '  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
       '  <meta name="apple-mobile-web-app-title" content="GTA2">\n'
       f'  <link rel="apple-touch-icon" href="{prefix}mobile/icon-180.png">\n'
       f'  <link rel="manifest" href="{prefix}mobile/manifest.webmanifest">\n'
       f'  {hook}\n')
target.write_text(html.replace(old, new, 1))
print(f'patch-index: {target}: hooks added')
