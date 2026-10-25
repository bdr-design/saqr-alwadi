"""Cockpit overlay: cut the chroma-key areas out of the generated Apache front-seat images.

  python3 tools/make_cockpit.py      # writes sprites/cockpit_day.webp and sprites/cockpit_night.webp, prints the screen rects

Inputs: assets/originals/cockpit/cockpit_day.png, cockpit_night.png (same geometry; the night one was made from the day one)
  magenta (#FF00FF) = canopy glass  -> transparent, the game draws the terrain behind it
  green   (#00FF00) = the three displays -> transparent, the game draws the TEDAC video and the two MPD pages behind it
"""
import os
import numpy as np
from PIL import Image, ImageFilter
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'originals', 'cockpit')
OUT = os.path.join(ROOT, 'sprites')


def key(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # strict keys: the night image's NVIS panel glow is green too (up to ~170 above red/blue), the key is ~245
    mag = np.clip((np.minimum(r, b) - g - 150) / 60, 0, 1)        # how magenta a pixel is
    grn = np.clip((g - np.maximum(r, b) - 185) / 40, 0, 1)        # how green
    k = np.maximum(mag, grn)
    # pull the hard key edge in by a pixel, then soften, so no coloured fringe survives
    ki = Image.fromarray((k * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(3)).filter(ImageFilter.GaussianBlur(0.6))
    alpha = 1 - np.asarray(ki).astype(np.float32) / 255
    # despill, only along the key edges (the panel glow elsewhere stays green): magenta / green tint -> neutral
    edge = np.asarray(Image.fromarray(((k > 0.02) * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9))) > 0
    rb = np.minimum(r, b)
    a2 = a.copy()
    a2[..., 0] = np.where(edge & (rb > g + 4), np.minimum(r, g + 4), r)
    a2[..., 2] = np.where(edge & (rb > g + 4), np.minimum(b, g + 4), b)
    a2[..., 1] = np.where(edge, np.minimum(a2[..., 1], np.maximum(a2[..., 0], a2[..., 2]) + 14), g)
    # magenta reflections on the metal anywhere (a real cockpit has nothing magenta): take the excess out of red and blue
    ex = np.clip(np.minimum(a2[..., 0], a2[..., 2]) - a2[..., 1] - 12, 0, None)
    a2[..., 0] -= ex; a2[..., 2] -= ex
    rgba = np.dstack([np.clip(a2, 0, 255), np.clip(alpha * 255, 0, 255)]).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA'), grn


def rects(grn):
    # the three display areas: bounding boxes of the green regions, left to right
    m = grn > 0.5
    cols = np.nonzero(m.any(0))[0]
    groups, start = [], cols[0]
    for i in range(1, len(cols)):
        if cols[i] != cols[i - 1] + 1: groups.append((start, cols[i - 1])); start = cols[i]
    groups.append((start, cols[-1]))
    out = []
    for x0, x1 in groups:
        rows = np.nonzero(m[:, x0:x1 + 1].any(1))[0]
        out.append((int(x0), int(rows[0]), int(x1 - x0 + 1), int(rows[-1] - rows[0] + 1)))
    return out


for name in ('day', 'night'):
    im, grn = key(os.path.join(SRC, f'cockpit_{name}.png'))
    im.save(os.path.join(OUT, f'cockpit_{name}.webp'), 'WEBP', quality=88, method=6)
    print(name, im.size, 'screens (x, y, w, h):', rects(grn))
