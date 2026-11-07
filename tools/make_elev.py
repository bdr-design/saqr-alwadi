"""Velmora's ground heights, from the Copernicus DEM (GLO-90, the surface model at 3 arc-seconds), for the game's
readouts: the sight's ELEV, the kneeboard's target elevation, and each area's own ground height (the game's world is
flat at that height: the aircraft's height above it, the bombs' fall, the haze).

usage: python3 tools/make_elev.py <dem90.npy>
  <dem90.npy>: the DEM mosaic over 42-45 E, 13-16 N, 3600 px square (1200 a degree; row 0 at 16 N), not in git.

writes maps/seren/country/elev.png: 400 x 400 cells of 500 m over the country (20,000 level-5 px, the c10 turned 180
degrees as the game's country is: tools/fetch_country.py, tools/make_country.py), each its cell's mean height in metres,
packed as R*256 + G (0..65535, sea and below 0); data/maps/<id>/map.json gains 'elev' (m: the median ground height over
its area) for the areas on the country, and 'country' gains 'elev': 'elev.png'.
"""
import json, pathlib, sys
import numpy as np
from PIL import Image
from pyproj import Transformer
root = pathlib.Path(__file__).resolve().parent.parent
dem = np.load(sys.argv[1]).astype(np.float32)
N, G = 20000, 400                                    # the country's level-5 px a side; the grid's cells a side
fw = Transformer.from_crs('EPSG:4326', 'EPSG:32638', always_xy=True)
inv = Transformer.from_crs('EPSG:32638', 'EPSG:4326', always_xy=True)
cx, cy = fw.transform(43.675, 14.75); R = 100000      # (as tools/fetch_country.py)
X0 = round((cx - R) / 10) * 10; Y0 = round((cy + R) / 10) * 10

def height(gx, gy):
    """the DEM's height (m) at level-5 px of the game's country (arrays), bilinear"""
    E = X0 + (N - 1 - gx) * 10 + 5; Nn = Y0 - (N - 1 - gy) * 10 - 5     # (turned 180 degrees)
    lon, lat = inv.transform(E, Nn)
    r = np.clip((16 - lat) * 1200 - 0.5, 0, 3598.999); c = np.clip((lon - 42) * 1200 - 0.5, 0, 3598.999)
    r0, c0 = np.floor(r).astype(int), np.floor(c).astype(int); fr, fc = r - r0, c - c0
    return (dem[r0, c0] * (1 - fr) * (1 - fc) + dem[r0, c0 + 1] * (1 - fr) * fc + dem[r0 + 1, c0] * fr * (1 - fc) + dem[r0 + 1, c0 + 1] * fr * fc)

# each cell the mean of 5 x 5 samples across it (a cell is 500 m, the DEM 90 m)
k = N / G
sub = (np.arange(5) + 0.5) / 5
gy, gx = np.meshgrid(np.arange(G), np.arange(G), indexing='ij')
acc = np.zeros((G, G), np.float64)
for a in sub:
    for b in sub: acc += height((gx + b) * k, (gy + a) * k)
h = np.clip(np.round(acc / 25), 0, 65535).astype(np.uint16)
out = root / 'maps' / 'seren' / 'country' / 'elev.png'
Image.fromarray(np.dstack([h >> 8, h & 255, np.zeros_like(h)]).astype(np.uint8), 'RGB').save(out, optimize=True)
print(out.relative_to(root), out.stat().st_size, 'bytes; heights', int(h.min()), '-', int(h.max()), 'm')

# each area's own ground: the median over it (its map in level-5 px of the country)
for mid in ('seren', 'silak'):
    p = root / 'data' / 'maps' / mid / 'map.json'; m = json.loads(p.read_text()); C = m['country']
    ax, ay = -C['x0'] / C['k'], -C['y0'] / C['k']; aw = m['w'] / C['k']
    yy, xx = np.meshgrid(np.linspace(ay, ay + aw, 60), np.linspace(ax, ax + aw, 60), indexing='ij')
    hh = height(xx, yy)
    m['elev'] = int(round(float(np.median(hh)))); C['elev'] = 'elev.png'
    p.write_text(json.dumps(m, ensure_ascii=False))
    print(mid, 'ground', m['elev'], 'm (its area', int(hh.min()), '-', int(hh.max()), 'm)')
