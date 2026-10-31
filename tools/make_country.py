"""Velmora: the country round an operations area, as a pyramid of tiles under its map (src/game/02-render.js,
updateCountry).

usage: python3 tools/make_country.py <c10.npy> [map id, default seren]

<c10.npy>: the country at Sentinel-2's full 10 m, 200 x 200 km, 20,000 px square (tools/fetch_country.py; 1.2 GB, not
in git). It is turned 180 degrees, as Velmora's map is (the coast is not known again, and the satellite's shadows fall
the way the game's sun throws them). The operations area is found in it by its own picture (the map's satellite
source, assets/originals/velmora/<ops>/source/zoom1.png, matched over the country to the pixel), so the map lies on
the country exactly. The country is sharpened a little (the median of three scenes is a shade soft), then:
  maps/<id>/country/<L>/<i>_<j>.jpg   levels 0..5, 625 to 20,000 px (320 m to 10 m a pixel), 512 px tiles: levels
                                      0-2 whole, 3-5 only as far as the game can reach from the area (ROAM)
and data/maps/<id>/map.json gains 'country': {dir, w, top, x0, y0, k}: where the country's corner is on the map (map px)
and how many map px a level-5 pixel is.
"""
import json, pathlib, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage
from scipy.signal import fftconvolve
root = pathlib.Path(__file__).resolve().parent.parent
Image.MAX_IMAGE_PIXELS = None
SRC = pathlib.Path(sys.argv[1]); MID = sys.argv[2] if len(sys.argv) > 2 else 'seren'
OPS = {'seren': 'ops1'}[MID]
T = 512; TOP = 5; GSD = 10.0; MPP = 0.85
mp = json.loads((root / 'data' / 'maps' / MID / 'map.json').read_text())
c10 = np.load(SRC, mmap_mode='r'); N = c10.shape[0]
img = np.ascontiguousarray(c10[::-1, ::-1])                     # turned 180 degrees
print('country', N, 'px', flush=True)

# ---- gaps (no scene saw them): filled from the nearest ground seen
gap = img.max(-1) == 0
if gap.any():
    _, (iy, ix) = ndimage.distance_transform_edt(gap[::4, ::4], return_indices=True)
    small = img[::4, ::4][iy, ix]
    fill = np.asarray(Image.fromarray(small).resize((N, N), Image.BILINEAR))
    img[gap] = fill[gap]; del fill, small, iy, ix
print('gaps filled', round(float(gap.mean()) * 100, 3), '%', flush=True)

# ---- where the operations area is: its satellite picture (4.41 km, the same scenes) matched over the country
z = Image.open(root / 'assets' / 'originals' / 'velmora' / OPS / 'source' / 'zoom1.png').convert('L')
km = mp['w'] * MPP / 1000; zs = round(km * 1000 / GSD)
zt = np.asarray(z.resize((zs, zs), Image.LANCZOS), np.float32)
g = img.mean(-1, dtype=np.float32)
# (searched first over the whole country at 40 m, a 4 x 4 mean, then to the pixel at 10 m round the best; the true
# normalized cross-correlation, -1..1, in float64; windows with almost no texture (gap fill, sea) left out)
def ncc(big, tpl):
    big = big.astype(np.float64); tpl = tpl.astype(np.float64); n = tpl.size
    tpl = (tpl - tpl.mean()) / (tpl.std() + 1e-9)
    s1 = fftconvolve(big, np.ones_like(tpl), 'valid'); s2 = fftconvolve(big * big, np.ones_like(tpl), 'valid')
    var = np.maximum(s2 - s1 * s1 / n, 0)
    c = fftconvolve(big, tpl[::-1, ::-1], 'valid') / np.sqrt(np.maximum(var, 1e-9) * n)
    c[var < n * 3.0 ** 2] = 0
    return c
box4 = lambda a: a[:a.shape[0] // 4 * 4, :a.shape[1] // 4 * 4].reshape(a.shape[0] // 4, 4, a.shape[1] // 4, 4).mean((1, 3))
g4 = box4(g); c = ncc(g4, box4(zt)); y4, x4 = np.unravel_index(np.argmax(c), c.shape)
m = 24; a0, b0 = max(y4 * 4 - m, 0), max(x4 * 4 - m, 0)
c = ncc(g[a0:a0 + zs + 2 * m, b0:b0 + zs + 2 * m], zt); dy, dx = np.unravel_index(np.argmax(c), c.shape)
sy, sx = a0 + dy, b0 + dx
print('area at', sx, sy, 'ncc', round(float(c.max()), 3), flush=True)
assert c.max() > 0.5, 'the operations area was not found in the country'
del g, g4

# ---- the pyramid. The game holds a level's tiles only within its ring of the aircraft (2.5 km at level 5, twice as far
# a level coarser: src/game/02-render.js, updateCountry), and the aircraft stays about its area: so the finer levels
# are written only within ROAM of the area and that level's ring (the ZF-25's wheel and its run-ins reach some 25 km
# out); levels 0-2 whole. The country itself (<c10.npy>) is kept whole, for areas yet to come.
ROAM = 30000
full = Image.fromarray(img).filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=2)); del img
out = root / 'maps' / MID / 'country'
nfiles = 0; im = full
cx, cy = sx + zs / 2, sy + zs / 2                                 # the area's centre, level-5 px
for L in range(TOP, -1, -1):
    w = -(-N // 2 ** (TOP - L))
    if L < TOP: im = im.resize((w, w), Image.LANCZOS)               # (each level from the one above)
    d = out / str(L); d.mkdir(parents=True, exist_ok=True)
    s5 = 2 ** (TOP - L); reach = (ROAM + 2500 * s5) / GSD / s5 if L >= 3 else 1e9   # level-L px
    for j in range(-(-w // T)):
        for i in range(-(-w // T)):
            if L >= 3 and (abs((i + 0.5) * T - cx / s5) > reach + T / 2 or abs((j + 0.5) * T - cy / s5) > reach + T / 2): continue
            im.crop((i * T, j * T, min((i + 1) * T, w), min((j + 1) * T, w))).save(d / f'{i}_{j}.jpg', quality=84, optimize=True); nfiles += 1
    print('level', L, w, 'px', flush=True)
k = GSD / MPP
mp['country'] = {'dir': f'maps/{MID}/country/', 'w': N, 'top': TOP, 'x0': round(-sx * k, 2), 'y0': round(-sy * k, 2), 'k': round(k, 6)}
(root / 'data' / 'maps' / MID / 'map.json').write_text(json.dumps(mp, ensure_ascii=False))
print(nfiles, 'tiles; country', mp['country'])
