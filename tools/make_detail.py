"""The ground's fine grain near the eye (sprites/ground_detail.webp): the owner's overhead desert picture
(assets/originals/terrain/nadir_d.png), its light and shade only. Seen from the F-15's seat on the ground or low over
it, the base's picture (0.8 m a pixel) and the region's (some 2 m) are smooth smears; the game lays this over them,
repeated every few metres and faded out with distance (groundDetail, src/game/02-render.js).

  grey      the picture's brightness, less its broad shapes (a blur 5 px wide taken off): the stones and gravel,
            not the ridges
  even      scaled to the same spread everywhere, mean 128: it brightens and darkens the ground below it as much as
            it is ever going to, the colour all the base picture's own
  seamless  cross-faded with itself shifted half a tile, so it repeats without a seam

  python3 tools/make_detail.py
"""
import pathlib
import numpy as np
from PIL import Image, ImageFilter

root = pathlib.Path(__file__).resolve().parent.parent
N = 512
im = Image.open(root / 'assets' / 'originals' / 'terrain' / 'nadir_d.png').convert('L')
# (a slope west of the wadi, at full size: no line through it that would repeat across the ground)
g = im.crop((40, 380, 40 + N, 380 + N))
a = np.asarray(g, np.float32) - np.asarray(g.filter(ImageFilter.GaussianBlur(5)), np.float32)
a /= a.std() + 1e-6
# (across, then down: cross-faded with the same shifted half a tile, its weight 0 at the tile's edges, where the
# shifted copy, from the middle, runs on unbroken; scaled back so the blend is not flatter than either)
w = np.sin(np.linspace(0, np.pi, N, endpoint=False)) ** 2
for ax in (1, 0):
    k = w[None, :] if ax else w[:, None]
    a = (a * k + np.roll(a, N // 2, ax) * (1 - k)) / np.sqrt(k ** 2 + (1 - k) ** 2)
a /= a.std()
out = np.clip(128 + 40 * a, 0, 255).astype(np.uint8)
dst = root / 'sprites' / 'ground_detail.webp'
Image.fromarray(out).convert('RGB').save(dst, quality=82, method=6)
print('written', dst, dst.stat().st_size, 'bytes')
