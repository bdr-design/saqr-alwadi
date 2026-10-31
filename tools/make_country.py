"""Velmora: the country round an operations area, as a pyramid of tiles under its map (src/game/02-render.js,
updateCountry).

usage: python3 tools/make_country.py <c10.npy> [map id, default seren]

<c10.npy>: the country at Sentinel-2's full 10 m, 200 x 200 km, 20,000 px square (tools/fetch_country.py; 1.2 GB, not
in git). It is turned 180 degrees, as Velmora's map is (the coast is not known again, and the satellite's shadows fall
the way the game's sun throws them). The operations area is found in it by its own picture (the map's satellite
source, assets/originals/velmora/<ops>/source/zoom1.png, matched over the country to the pixel), so the map lies on
the country exactly. The country is sharpened a little (the median of three scenes is a shade soft), then:
  maps/<id>/country/<L>/<i>_<j>.jpg   levels 0..5, 625 to 20,000 px (320 m to 10 m a pixel), 512 px tiles
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
gap = img.sum(-1) == 0
if gap.any():
    _, (iy, ix) = ndimage.distance_transform_edt(gap[::4, ::4], return_indices=True)
    small = img[::4, ::4][iy, ix]
    fill = np.asarray(Image.fromarray(small).resize((N, N), Image.BILINEAR))
    img[gap] = fill[gap]
print('gaps filled', round(float(gap.mean()) * 100, 3), '%', flush=True)

# ---- where the operations area is: its satellite picture (4.41 km, the same scenes) matched over the country
z = Image.open(root / 'assets' / 'originals' / 'velmora' / OPS / 'source' / 'zoom1.png').convert('L')
km = mp['w'] * MPP / 1000; zs = round(km * 1000 / GSD)
zt = np.asarray(z.resize((zs, zs), Image.LANCZOS), np.float32)
g = img.mean(-1, dtype=np.float32)
# (searched first over the whole country at 40 m, then to the pixel at 10 m round the best)
def ncc(big, tpl):
    tpl = (tpl - tpl.mean()) / (tpl.std() + 1e-6); n = tpl.size
    s1 = fftconvolve(big, np.ones_like(tpl), 'valid'); s2 = fftconvolve(big * big, np.ones_like(tpl), 'valid')
    num = fftconvolve(big, tpl[::-1, ::-1], 'valid')
    return num / np.sqrt(np.maximum(s2 - s1 * s1 / n, 1e-6))
g4 = g[::4, ::4]; c = ncc(g4, zt[::4, ::4]); y4, x4 = np.unravel_index(np.argmax(c), c.shape)
m = 24; a0, b0 = max(y4 * 4 - m, 0), max(x4 * 4 - m, 0)
c = ncc(g[a0:a0 + zs + 2 * m, b0:b0 + zs + 2 * m], zt); dy, dx = np.unravel_index(np.argmax(c), c.shape)
sy, sx = a0 + dy, b0 + dx
print('area at', sx, sy, 'score', round(float(c.max()) / zs / zs, 3), flush=True)
del g, g4

# ---- the pyramid
full = Image.fromarray(img).filter(ImageFilter.UnsharpMask(radius=1.2, percent=40, threshold=2)); del img
out = root / 'maps' / MID / 'country'
nfiles = 0
for L in range(TOP, -1, -1):
    w = -(-N // 2 ** (TOP - L))
    im = full if L == TOP else full.resize((w, w), Image.LANCZOS)
    d = out / str(L); d.mkdir(parents=True, exist_ok=True)
    for j in range(-(-w // T)):
        for i in range(-(-w // T)):
            im.crop((i * T, j * T, min((i + 1) * T, w), min((j + 1) * T, w))).save(d / f'{i}_{j}.jpg', quality=84, optimize=True); nfiles += 1
    print('level', L, w, 'px', flush=True)
k = GSD / MPP
mp['country'] = {'dir': f'maps/{MID}/country/', 'w': N, 'top': TOP, 'x0': round(-sx * k, 2), 'y0': round(-sy * k, 2), 'k': round(k, 6)}
(root / 'data' / 'maps' / MID / 'map.json').write_text(json.dumps(mp, ensure_ascii=False))
print(nfiles, 'tiles; country', mp['country'])
