"""The base seen from the ground (the F-15SA's taxi out, docs/DEVELOPER.md): the owner's generated pictures cut out.

  assets/originals/ground3d/sheet.png     the long sunshade from the side, the hardened shelter's front, and a parked
                                          F-15 from eight sides at eye level (front, then every 45 degrees round by
                                          its left: front-left, left, rear-left, rear, rear-right, right, front-right),
                                          each panel on a solid magenta ground, split by thin white lines
  assets/originals/ground3d/efb_hand.png  the officer's gloved left hand holding the iPad mini, its screen green, on
                                          magenta (the kneeboard, src/game.src.html)

Out: sprites/ground3d/*.webp, each cut out on a transparent ground, at the size the game draws it (a parked jet 192 px
tall: the height it fills on a 1080-line screen from 30 m off; the sunshade's side 1024 px across, the shelter's front 512). The magenta reachable from a panel's edge is the
ground (taken away, softly at its edge); magenta shut in by the jet's lines is the canopy seen through (made dark
smoked glass, not a hole); a pink cast left on the jet goes to neutral grey, and the outline's colour fringe (pink or
green, from the generator) is taken out. Nothing is drawn: only cut out.

    python3 tools/make_ground3d.py
"""
import json, pathlib
import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / 'assets' / 'originals' / 'ground3d', ROOT / 'sprites' / 'ground3d'
NAMES = ['sunshade_side', 'has_front', 'f15_000', 'f15_045', 'f15_090', 'f15_135', 'f15_180', 'f15_225', 'f15_270', 'f15_315']

def runs(v):
    out, s, p = [], None, None
    for x in v:
        if s is None: s = p = x
        elif x == p + 1: p = x
        else: out.append((s, p)); s = p = x
    if s is not None: out.append((s, p))
    return out

def panels(a):
    """the panels between the sheet's white lines: (x0, y0, x1, y1), row by row"""
    H, W = a.shape[:2]; white = a.min(2) > 235
    rows = runs([y for y in range(H) if white[y].mean() > 0.9])
    edges = [-1] + [v for r in rows for v in r] + [H]
    bands = [(edges[i] + 1, edges[i + 1] - 1) for i in range(0, len(edges), 2) if edges[i + 1] - edges[i] > 50]
    out = []
    for y0, y1 in bands:
        cs = runs([x for x in range(W) if white[y0 + 5:y1 - 5, x].mean() > 0.9])
        e = [-1] + [v for r in cs for v in r] + [W]
        out += [(e[i] + 1, y0, e[i + 1] - 1, y1) for i in range(0, len(e), 2) if e[i + 1] - e[i] > 50]
    return out

def cut(a):
    """one panel (float RGB) cut out: RGBA"""
    r, g, b = a[..., 0], a[..., 1], a[..., 2]; H, W = g.shape
    mx = np.maximum(np.maximum(r, g), b) + 1e-3; mn = np.minimum(r, b)
    mag = np.clip(((mn - g) / mx - 0.35) / 0.45, 0, 1) * np.clip((mn - 12) / 30, 0, 1)   # magenta, at any brightness
    hard = mag > 0.5
    lab, n = ndimage.label(hard); sizes = ndimage.sum(hard, lab, range(1, n + 1))
    frame = np.zeros_like(hard); frame[:8] = frame[-8:] = True; frame[:, :8] = frame[:, -8:] = True
    bg = np.isin(lab, list((set(np.unique(lab[frame & hard])) - {0}) | {i + 1 for i, s in enumerate(sizes) if s > 0.04 * H * W}))
    glass = hard & ~bg
    band = ndimage.binary_dilation(bg, iterations=2) & ~bg
    alpha = np.where(bg, 0.0, np.where(band, 1 - mag, 1.0))
    rgb = a.copy(); L = (r + g + b) / 3
    for c, v in zip(range(3), (36, 42, 50)): rgb[..., c] = np.where(glass, v + L * 0.16, rgb[..., c])
    pink = (r > g + 6) & (b > g + 6) & ~glass & ~bg
    gr = (r + b) / 2 * 0.35 + g * 0.65
    for c in range(3): rgb[..., c] = np.where(pink, gr, rgb[..., c])
    rim = ndimage.binary_dilation(bg, iterations=4) & ~bg
    for c in range(3): rgb[..., c] = np.where(rim, L + (rgb[..., c] - L) * 0.25, rgb[..., c])
    im = Image.fromarray(np.dstack([rgb.clip(0, 255), alpha * 255]).astype(np.uint8), 'RGBA')
    return im.crop(im.getchannel('A').getbbox())

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    sheet = Image.open(SRC / 'sheet.png').convert('RGB'); a = np.asarray(sheet, np.int16)
    P = panels(a); assert len(P) == len(NAMES), P
    sizes = {}
    for nm, (x0, y0, x1, y1) in zip(NAMES, P):
        m = 6   # the white lines' soft edge left out
        im = cut(np.asarray(sheet.crop((x0 + m, y0 + m, x1 + 1 - m, y1 + 1 - m)), np.float32))
        h = 192 if nm.startswith('f15') else None; w = {'sunshade_side': 1024, 'has_front': 512}.get(nm)
        im = im.resize((w, round(im.size[1] * w / im.size[0])) if w else (round(im.size[0] * h / im.size[1]), h), Image.LANCZOS)
        im.save(OUT / (nm + '.webp'), quality=86, method=6); sizes[nm] = im.size
    print(json.dumps(sizes))

if __name__ == '__main__':
    main()
