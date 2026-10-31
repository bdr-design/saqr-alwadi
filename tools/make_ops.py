"""An operations area of Velmora as a map: Wadi Seren (assets/originals/velmora/ops1), 4.41 km square.

usage: python3 tools/make_ops.py            ->  maps/seren/tiles/{0,1,2,far}, maps/seren/house_pad.png,
                                                data/maps/seren/map.json (marked 'trial': in the game only when
                                                tools/build.py is run with --trial, until the owner approves it)

The owner regenerated the area's nine Sentinel-2 tiles (10 m, enlarged x3) at about 0.72 m a pixel (x3/<col>_<row>.jpg,
2048 px each). Laid side by side they are joined by their colour: each was drawn on its own, so each is a little
lighter, darker or greener than the next. So the mosaic's low frequencies (features over some 25 m) are taken from the
satellite picture itself (source/zoom1.png, one continuous image): the tiles meet in colour and stay true to the
ground's real colour, while everything finer is the generator's detail.

The reservoir at the bottom (where the satellite saw dark water, and west of it the same lake under a thin cloud and
its shadows) the generator drew as haze. Its outline is read off the generated picture's own grey, and the water laid
in: the satellite's colour of the lake (shallow edges lighter with silt, deeper darker), with the ripples of the
port's open sea (maps/port, a photograph) brought to this scale. A few metres of wet ground darker round the shore.

Levels: 0 at 0.85 m a map px (the game's scale, MPP), 1 and 2 (x2, x4). No level 3 ('top': 2): the picture holds
detail to about 0.7 m, so x8 would be the same picture only larger, and it would be some 1,700 more files.
"""
import json, pathlib, sys
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
from scipy import ndimage
root = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / 'tools'))
from mapkit import save_level, grain, far_field
Image.MAX_IMAGE_PIXELS = None
rng = np.random.default_rng(17)
MID = 'seren'
SRC = root / 'assets' / 'originals' / 'velmora' / 'ops1'
TT = 2048; NN = 3 * TT                                   # the generated tiles and their mosaic (px)
KM = 4.41                                                # the area's side (3 x 1.47 km)
W = H = round(KM * 1000 / 0.85)                          # map px at the game's 0.85 m
out = root / 'maps' / MID

# ---- the mosaic, its colour from the satellite picture
gen = Image.new('RGB', (NN, NN))
for c in range(3):
    for r in range(3):
        im = Image.open(SRC / 'x3' / f'{c}_{r}.jpg').convert('RGB')
        gen.paste(im if im.size == (TT, TT) else im.resize((TT, TT), Image.LANCZOS), (c * TT, r * TT))
sat = Image.open(SRC / 'source' / 'zoom1.png').convert('RGB').resize((NN, NN), Image.BICUBIC)
def low(im, f=32, r=1.5):
    s = im.resize((NN // f, NN // f), Image.BOX).filter(ImageFilter.GaussianBlur(r))
    return np.asarray(s.resize((NN, NN), Image.BICUBIC), np.float32)
img = np.asarray(gen, np.float32) + (low(sat) - low(gen))
del sat

# ---- the reservoir: its outline from the generated picture's grey (the land is brown), joined with the dark water
# the satellite saw; ragged by a few metres; the pale 'island' in it is the generator's haze over the water
g4 = np.asarray(gen.resize((NN // 4, NN // 4), Image.BOX), np.float32)
rb = ndimage.uniform_filter(g4[..., 0], 5) - ndimage.uniform_filter(g4[..., 2], 5)
reg = np.zeros(rb.shape, bool); reg[1380:, 700:1100] = True
lake = (rb < 30) & reg
lab, n = ndimage.label(lake); lake = lab == (np.argmax(ndimage.sum(lake, lab, range(1, n + 1))) + 1)
lake = ndimage.binary_opening(ndimage.binary_fill_holes(ndimage.binary_closing(lake, iterations=3)), iterations=2)
s0 = np.asarray(Image.open(SRC / 'source' / 'zoom1.png').convert('RGB'), np.float32)
sb = ndimage.uniform_filter(s0, (3, 3, 1)); slum = sb.mean(2)
dark = (sb[..., 0] - sb[..., 2] < 22) & (slum < 120); dark[:1200, :] = False; dark[:, :1150] = False
lab, n = ndimage.label(dark)
if n: dark = ndimage.binary_fill_holes(ndimage.binary_closing(lab == (np.argmax(ndimage.sum(dark, lab, range(1, n + 1))) + 1), iterations=3))
lake |= np.asarray(Image.fromarray((dark * 255).astype(np.uint8)).resize(lake.shape[::-1], Image.BILINEAR)) > 127
mf = np.asarray(Image.fromarray((lake * 255).astype(np.uint8)).resize((NN, NN), Image.BICUBIC), np.float32) / 255
nz = np.asarray(Image.fromarray((rng.random((NN // 16, NN // 16)) * 255).astype(np.uint8)).resize((NN, NN), Image.BICUBIC), np.float32) / 255
mask = ndimage.binary_opening((mf + (nz - 0.5) * 0.35) > 0.5, iterations=2)
yy, xx = np.ogrid[:NN, :NN]; mask |= ((xx - 3280) / 92.) ** 2 + ((yy - 5905) / 104.) ** 2 < 1
mask = ndimage.binary_fill_holes(mask)
ys, xs = np.nonzero(mask)
y0, y1, x0, x1 = max(ys.min() - 20, 0), min(ys.max() + 21, NN), max(xs.min() - 20, 0), min(xs.max() + 21, NN)
h_, w_ = y1 - y0, x1 - x0; mk = mask[y0:y1, x0:x1]
sea = Image.open(root / 'maps' / 'port' / 'tiles' / '2' / '0_2.jpg').convert('L').crop((20, 40, 560, 980))
sea = np.asarray(sea.resize((round(sea.width / 3.38), round(sea.height / 3.38)), Image.LANCZOS), np.float32)
hp = sea - ndimage.gaussian_filter(sea, 6); hp /= hp.std() + 1e-6
t = np.block([[hp, hp[:, ::-1]], [hp[::-1], hp[::-1, ::-1]]])
rip = np.tile(t, (h_ // t.shape[0] + 1, w_ // t.shape[1] + 1))[:h_, :w_]
d = ndimage.distance_transform_edt(mk); deep = np.clip(d / 70, 0, 1) ** 0.8
col = np.array([98, 93, 72], np.float32) * (1 - deep[..., None]) + np.array([50, 55, 46], np.float32) * deep[..., None]
lf = ndimage.gaussian_filter(rng.normal(0, 1, (h_ // 16 + 1, w_ // 16 + 1)), 2)
lf = np.array(Image.fromarray(lf.astype(np.float32)).resize((w_, h_), Image.BICUBIC)); lf /= lf.std() + 1e-6
col = col * (1 + 0.04 * lf[..., None]) + rip[..., None] * 2.6
a = np.clip(d / 2.5, 0, 1)[..., None]
wet = np.where(mk, 0, np.exp(-ndimage.distance_transform_edt(~mk) / 3.5) * 0.25)[..., None]
sub = img[y0:y1, x0:x1] * (1 - wet)
img[y0:y1, x0:x1] = sub * (1 - a) + col * a
full = Image.fromarray(img.clip(0, 255).astype(np.uint8)); del img, gen
full.resize((2048, 2048), Image.LANCZOS).save(SRC / 'preview' / 'seren_merged_2048.jpg', quality=88)

# ---- levels 0..2 (1024 px tiles)
src = full.resize((W, H), Image.LANCZOS)
save_level(src, out / 'tiles' / '0', 88)
save_level(full.resize((W * 2, H * 2), Image.LANCZOS), out / 'tiles' / '1', 85)
# level 2 in strips of one tile row (the whole of it at once would be 1.3 GB, and its grain five times that)
def x4_band(py0, py1, m=8):
    k = NN / (H * 4); a, b = max(py0 - m, 0), min(py1 + m, H * 4)
    band = full.resize((W * 4, b - a), Image.LANCZOS, box=(0, a * k, NN, b * k)).filter(ImageFilter.UnsharpMask(radius=2.0, percent=45, threshold=2))
    return band.crop((0, py0 - a, W * 4, py0 - a + (py1 - py0)))
d2 = out / 'tiles' / '2'; d2.mkdir(parents=True, exist_ok=True)
for ty in range((H * 4 + 1023) // 1024):
    band = grain(rng, x4_band(ty * 1024, min((ty + 1) * 1024, H * 4)), 1.6)
    for tx in range((W * 4 + 1023) // 1024):
        band.crop((tx * 1024, 0, min((tx + 1) * 1024, W * 4), band.height)).save(d2 / f'{tx}_{ty}.jpg', quality=82, optimize=True)

# ---- the road: up the main wadi's bed from the north, down the side wadi's track to the reservoir (traced on the
# picture at 1600 px, Catmull-Rom), 2 map px apart
P = np.array([(1078, 0), (1060, 60), (1035, 140), (1008, 240), (978, 330), (948, 410), (935, 470), (900, 510), (840, 535),
              (770, 568), (720, 615), (665, 662), (615, 700), (600, 760), (585, 830), (560, 890), (546, 960), (548, 1030),
              (570, 1110), (592, 1190), (603, 1270), (606, 1350), (618, 1410), (660, 1455), (715, 1500), (765, 1545),
              (815, 1585), (840, 1600)], float) * (W / 1600)
def catmull_rom(P, n):
    o = []; Q = np.vstack([P[0], P, P[-1]])
    for i in range(1, len(Q) - 2):
        p0, p1, p2, p3 = Q[i - 1], Q[i], Q[i + 1], Q[i + 2]
        for t_ in np.linspace(0, 1, n, endpoint=False):
            o.append(0.5 * ((2 * p1) + (-p0 + p2) * t_ + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t_ ** 2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t_ ** 3))
    o.append(P[-1]); return np.array(o)
D = catmull_rom(P, 16)
s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(D, axis=0), axis=1))]); ss = np.arange(0, s[-1], 2.0)
road = [[round(float(x), 2), round(float(y), 2)] for x, y in zip(np.interp(ss, s, D[:, 0]), np.interp(ss, s, D[:, 1]))]
print('road', len(road), 'points,', round(s[-1] * 0.85), 'm')

# ---- far field (6 km round the area, the area folded outward, then patches of its own ground) and the TSD picture
SIZE = W + 2 * 3600
fx0, fy0 = far_field(rng, src, SIZE, out / 'tiles' / 'far', None, None, None, 4)

# ---- a plot for houses: the flattest light ground
G = np.asarray(src.convert('L'), np.float32); best = None
for y in range(60, H - 60, 16):
    for x in range(60, W - 60, 16):
        p = G[y - 16:y + 16, x - 16:x + 16]; sc = p.std() - 0.2 * p.mean()
        if best is None or sc < best[0]: best = (sc, x, y)
_, px, py = best
plot = ImageEnhance.Brightness(full.crop(tuple(round(v * NN / W) for v in (px - 16, py - 16, px + 16, py + 16))).resize((256, 256), Image.BICUBIC)).enhance(1.05)
q = np.mgrid[0:256, 0:256] / 255.0 * 2 - 1
edge = np.maximum(np.abs(q[1]), np.abs(q[0])) * 0.55 + np.hypot(q[1], q[0]) * 0.45
noise = np.asarray(Image.fromarray((rng.random((16, 16)) * 255).astype(np.uint8)).resize((256, 256), Image.BICUBIC), np.float32) / 255
pm = np.clip((0.95 - edge - (noise - 0.5) * 0.35) / 0.3, 0, 1)
pad = plot.convert('RGBA'); pad.putalpha(Image.fromarray((pm * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4)))
pad.save(out / 'house_pad.png')

# ---- colours, and the map's data
mean = np.asarray(src, np.float32).reshape(-1, 3).mean(0)
ground = int(mean[0] * 0.8) << 16 | int(mean[1] * 0.8) << 8 | int(mean[2] * 0.8)
hz = mean * 0.55 + np.array([200, 200, 205]) * 0.45
haze = int(hz[0]) << 16 | int(hz[1]) << 8 | int(hz[2])
dd = root / 'data' / 'maps' / MID; dd.mkdir(parents=True, exist_ok=True)
mis = dd / 'missions.json'
m = {'ar': 'وادي سيرين', 'en': 'WADI SEREN', 'trial': True, 'top': 2, 'w': W, 'h': H, 'road': road,
     'far': {'x0': round(fx0, 2), 'y0': round(fy0, 2), 'size': SIZE, 'n': 4}, 'ground': ground, 'haze': haze,
     'hover': {'h1': {'b': 250, 'd': 1500}, 'h2': {'b': 70, 'd': 1600}}, 'pad': True,
     'missions': json.loads(mis.read_text()) if mis.exists() else []}
(dd / 'map.json').write_text(json.dumps(m, ensure_ascii=False))
print('map', W, 'x', H, 'map px; plot at', px, py, '; ground', hex(ground), 'haze', hex(haze))
