"""Cockpit overlay: cut the chroma-key areas out of the generated Apache front-seat images.

  python3 tools/make_cockpit.py      # writes sprites/cockpit_*.webp and sprites/f15_*.webp, prints the screen and glass rects

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


def regions(m, least):
    # the mask's connected regions of more than `least` pixels, as bounding boxes (x0, y0, x1, y1, px), x1 and y1 past
    # the last pixel
    from collections import deque
    seen = np.zeros_like(m); out = []
    H, W = m.shape
    for y0 in range(0, H, 3):
        for x0 in range(0, W, 3):
            if not m[y0, x0] or seen[y0, x0]: continue
            q = deque([(y0, x0)]); seen[y0, x0] = 1; xs = [x0, x0]; ys = [y0, y0]; n = 0
            while q:
                y, x = q.popleft(); n += 1
                xs[0] = min(xs[0], x); xs[1] = max(xs[1], x); ys[0] = min(ys[0], y); ys[1] = max(ys[1], y)
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    yy, xx = y + dy, x + dx
                    if 0 <= yy < H and 0 <= xx < W and m[yy, xx] and not seen[yy, xx]: seen[yy, xx] = 1; q.append((yy, xx))
            if n > least: out.append((xs[0], ys[0], xs[1] + 1, ys[1] + 1, n))
    return out


def rects(grn, alpha):
    # the display areas, left to right: each green region's opening in the overlay, wherever it lets anything through
    # (the key's edge was grown and softened, so that is a pixel or two past the green), and a pixel more under the
    # bezel: the game's display canvases lie under the photo, and one that stops short of the cut shows a seam of the
    # world behind it
    out = []
    for x0, y0, x1, y1, _ in sorted(regions(grn > 0.5, 400), key=lambda r: (r[0], r[1])):
        see = alpha[y0 - 6:y1 + 6, x0 - 6:x1 + 6] < 250
        ys, xs = np.nonzero(see)
        X0, Y0, X1, Y1 = x0 - 6 + xs.min() - 1, y0 - 6 + ys.min() - 1, x0 - 6 + xs.max() + 1, y0 - 6 + ys.max() + 1
        out.append((int(X0), int(Y0), int(X1 - X0 + 1), int(Y1 - Y0 + 1)))
    return out


def glass(path):
    # the canopy glass as a few rectangles (the game draws the world only inside them): the magenta's bounding boxes,
    # one per connected region of any size, as (x0, y0, x1, y1)
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.int32)
    m = (np.minimum(a[..., 0], a[..., 2]) - a[..., 1]) > 150
    return sorted(regions(m, 400), key=lambda r: -r[4])


# the AH-64E front seat (cockpit_*), and the F-15SA back seat (f15ex_*: the F-15EX's cockpit, the owner's choice)
# A photo at twice the size (<name>_2x.png, tools/cockpit_mosaic.py) is used where there is one: the game shows it at
# the same CSS size, so the places it prints are divided back to the original's pixels
for src, dst in (('cockpit', 'cockpit'), ('f15ex', 'f15')):
    for name in ('day', 'night'):
        p2 = os.path.join(SRC, f'{src}_{name}_2x.png'); k = 2 if os.path.exists(p2) else 1
        im, grn = key(p2 if k == 2 else os.path.join(SRC, f'{src}_{name}.png'))
        im.save(os.path.join(OUT, f'{dst}_{name}.webp'), 'WEBP', quality=88, method=6)
        r = [tuple(round(v / k, 1) for v in q) for q in rects(grn, np.asarray(im)[..., 3])]
        print(dst, name, im.size, 'screens (x, y, w, h) at the original size:', r)
    p2 = os.path.join(SRC, f'{src}_day_2x.png'); k = 2 if os.path.exists(p2) else 1
    print(dst, 'glass (x0, y0, x1, y1, px) at the original size:', [tuple(round(v / k, 1) for v in q[:4]) for q in glass(p2 if k == 2 else os.path.join(SRC, f'{src}_day.png'))])
