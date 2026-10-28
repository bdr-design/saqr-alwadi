"""The theatre: one big map, the three maps joined into a single country, with an air base.

usage: python3 tools/make_theater.py

North to south along one road: the valley, the desert, then the port and its coast. Each is placed so its road meets
the next one's exactly at the seam (the valley's ends 811 px across, the desert's starts at 816: 5 px; the desert's
ends at 968, the port's starts at 1105). At each seam the two pictures are brought to the same colour (the difference
of their means along the seam, faded out over 300 px either side) and cross-faded along a wandering line (each side
continued past the seam as its own mirror), so no straight cut shows. The sea that runs down the port's whole west
side would meet the desert in a straight line: instead the port's own coastline (shallows, reefs, surf, beach) is
copied along a new shore that curves from the seam out to the west edge. Gaps the offsets leave, and the strip east
for the air base, are laid in patches of the ground beside them, from about the same rows. The air base is laid on
it from its picture (make_airbase.place: the owner's whole base, a 2,225 m runway, at 0.81 m a px, the theatre's full
height), with the access road from the main road.

Works at level 2 (4 px a map px) from the maps' own level-2 tiles; writes maps/theater/tiles/**, the far field and
TSD picture, the ruins atlas, house_pad.png, and data/maps/theater/map.json (road: the three roads joined).
"""
import sys, json, pathlib
import numpy as np
from PIL import Image, ImageFilter
root = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / 'tools'))
from mapkit import T, save_level, grain, ruin, atlas, far_field, quilt, blur
import make_airbase
Image.MAX_IMAGE_PIXELS = None
rng = np.random.default_rng(11)
K = 4                                              # level 2: px per map px
# id, level-2 tiles, offset (map px), size, road file
PARTS = [('valley', root / 'tiles' / '2', (142, 0), (1672, 941)),
         ('desert', root / 'maps' / 'desert' / 'tiles' / '2', (137, 941), (1672, 941)),
         ('port', root / 'maps' / 'port' / 'tiles' / '2', (0, 1882), (1672, 940))]
COLA, ABW = 1814, 1425                              # the maps' column, and the air base's strip east of it
W, H = COLA + ABW, 2822
SEAMS = (941, 1882)
out = root / 'maps' / 'theater'

def stitch(d, w, h):
    im = Image.new('RGB', (w * K, h * K))
    for f in d.glob('*.jpg'):
        tx, ty = map(int, f.stem.split('_')); im.paste(Image.open(f), (tx * T, ty * T))
    return np.asarray(im)

cv = np.zeros((H * K, W * K, 3), np.uint8)
for pid, d, (ox, oy), (w, h) in PARTS:
    a = stitch(d, w, h); cv[oy * K:oy * K + a.shape[0], ox * K:ox * K + a.shape[1]] = a
    print('placed', pid)

# ---- gaps: patches of the ground beside them, from about the same rows, feathered into it
# west of the valley and of the desert: from their own west strips (feathered: their edges are the pictures' edges)
def fill_west(y0, y1, gap):
    src = cv[y0:y1, gap:gap + 1200].astype(np.float32)
    q = quilt(rng, src, np.arange(y1 - y0), None, y1 - y0, gap + 160, B=448, jit=240)
    cur = cv[y0:y1, 0:gap + 160].astype(np.float32)
    al = np.clip((gap + 160 - np.arange(gap + 160)) / 160, 0, 1)[None, :, None]
    cv[y0:y1, 0:gap + 160] = (cur * (1 - al) + q * al).clip(0, 255).astype(np.uint8)
def fill_east(y0, y1, edge, width, jit=240):
    src = cv[y0:y1, edge - 1200:edge].astype(np.float32)
    q = quilt(rng, src, np.arange(y1 - y0), None, y1 - y0, width + 160, B=448, jit=jit)
    cur = cv[y0:y1, edge - 160:edge + width].astype(np.float32)
    al = np.clip((np.arange(width + 160)) / 160, 0, 1)[None, :, None]
    cv[y0:y1, edge - 160:edge + width] = (cur * (1 - al) + q * al).clip(0, 255).astype(np.uint8)
fill_west(0, 941 * K, 142 * K)
fill_west(941 * K, 1882 * K, 137 * K)
fill_east(941 * K, 1882 * K, 1809 * K, 5 * K)
fill_east(1882 * K, H * K, 1672 * K, 142 * K)
# the air base's strip: the ground beside it (foothills in the north, dunes in the middle, the port's desert in the
# south) gives way along a ragged line, a little inside the maps' east edge, to one gravel plain, laid in patches of
# the desert's own plain (between its road and its dunes, north of the wadi). The patches carrying the ground on past
# the edge are faded out within some tens of metres (further, patches of a dune field show as blocks)
fill_east(0, H * K, COLA * K, ABW * K)
E0 = COLA - 100
plain = cv[(941 + 555) * K:(941 + 690) * K, (137 + 650) * K:(137 + 860) * K].astype(np.float32)
qp = quilt(rng, plain, None, None, H * K, (W - E0) * K, B=448)
ed = cv[:, E0 * K:].astype(np.float32)
xx = (np.arange((W - E0) * K) / K + E0 - COLA)[None, :]
wn = blur(rng.random((H // 40 + 2, (W - E0) // 40 + 2)).astype(np.float32), 1)
wn = np.asarray(Image.fromarray(wn).resize(((W - E0) * K, H * K), Image.BICUBIC), np.float32)
wn = (wn - wn.mean()) / (wn.std() + 1e-6)
w = np.clip(1 - (xx + 20 - 45 * wn) / 140, 0, 1)[..., None]
cv[:, E0 * K:] = (ed * w + qp * (1 - w)).clip(0, 255).astype(np.uint8)
del plain, qp, ed, w, wn
print('gaps filled')

# ---- the coast: the port's own shoreline, copied along a new shore curving from the seam to the west edge
port = stitch(PARTS[2][1], 1672, 940).astype(np.float32)
sea = (port[..., 2] - port[..., 0]) > 18
# the waterline in each row of the port (level-2 px): the first land after open water, smoothed over rows
cx = []
for r in range(port.shape[0]):
    row = ~sea[r, 800:2400]; run = np.convolve(row.astype(np.float32), np.ones(24), 'valid')
    i = np.argmax(run >= 23); cx.append(800 + i if run.max() >= 23 else np.nan)
cx = np.array(cx); ok = ~np.isnan(cx); cx = np.interp(np.arange(len(cx)), np.flatnonzero(ok), cx[ok])
cx = np.convolve(np.pad(cx, 60, mode='edge'), np.ones(121) / 121, 'valid')
R0, R1 = 380 * K, 900 * K                           # the natural stretch of the port's coast (no harbour works)
D = 430                                             # how far north (map px) the new shore runs before the west edge
y_top = SEAMS[1] - D
# a gentle headland from the seam to the west edge: bowed out toward the sea (on the inside of a bend the copied
# shore would fan out), wobbling a little as a real coast does
tt = np.linspace(0, 1, 400)
v = np.array([-475.0, -D]); nsea = np.array([-v[1], v[0]]) / np.hypot(*v)
nsea = nsea if nsea[0] < 0 else -nsea                                          # the sea is to the south-west
wob = blur(rng.random(400).astype(np.float32)[None, :], 6)[0]; wob = (wob - wob.mean()) / (wob.std() + 1e-6)
off = (40 * np.sin(np.pi * tt) + 9 * wob * np.sin(np.pi * tt))[:, None] * nsea[None, :]
curve = (np.stack([475 * (1 - tt), SEAMS[1] - D * tt], 1) + off) * K           # level-2 px
seg = np.diff(curve, axis=0); sl = np.hypot(seg[:, 0], seg[:, 1]); s_cum = np.concatenate([[0], np.cumsum(sl)])
# nearest point on the shore and the signed distance, on a coarse grid, then interpolated
G = 4
gy, gx = np.mgrid[(y_top - 40) * K:SEAMS[1] * K:G, 0:520 * K:G].astype(np.float32)
P = np.stack([gx.ravel(), gy.ravel()], 1)
best_d = np.full(len(P), 1e9, np.float32); best_s = np.zeros(len(P), np.float32); side = np.zeros(len(P), np.float32)
for i in range(len(seg)):
    a = curve[i]; v = seg[i]; L2 = (v ** 2).sum()
    t = np.clip(((P - a) @ v) / L2, 0, 1); q = a + t[:, None] * v; dd = np.hypot(*(P - q).T)
    m = dd < best_d; best_d[m] = dd[m]; best_s[m] = s_cum[i] + t[m] * sl[i]
    cr = v[0] * (P[:, 1] - a[1]) - v[1] * (P[:, 0] - a[0]); side[m] = np.sign(cr[m])
sgn = side if side[np.argmin(P[:, 0] + (SEAMS[1] * K - P[:, 1]))] > 0 else -side   # positive: the sea side
dist = (best_d * sgn).reshape(gx.shape); sarc = best_s.reshape(gx.shape)
def up(a):
    im = Image.fromarray(a.astype(np.float32)); return np.asarray(im.resize((520 * K, (D + 40) * K), Image.BILINEAR), np.float32)
dist, sarc = up(dist), up(sarc)
# west of the curve and below its top: sea (dist > 0); a beach and the surf just landward (dist to -60)
r = (R0 + (sarc % (2 * (R1 - R0)))).astype(int); r = np.where(r >= R1, 2 * R1 - r, r).clip(0, port.shape[0] - 1)
col = (cx[r] - dist)
col = np.maximum(col, cx[r] - 520).clip(8, port.shape[1] - 1).astype(int)   # past the shallows the open sea takes over
src = port[r, col]
# out past the shallows: open water laid in random patches of the port's own deep sea
deep_src = port[R0:R1, 20 * K:300 * K]
qd = quilt(rng, deep_src, None, None, src.shape[0], src.shape[1], B=448)
wd = np.clip((dist - 360) / 160, 0, 1)[..., None]
src = src * (1 - wd) + qd * wd
y0r = (y_top - 40) * K
cur = cv[y0r:SEAMS[1] * K, 0:520 * K].astype(np.float32)
ycol = np.arange(y0r, SEAMS[1] * K)[:, None]
al = np.clip((dist + 70) / 50, 0, 1) * (ycol >= y_top * K - 1)
cv[y0r:SEAMS[1] * K, 0:520 * K] = (cur * (1 - al[..., None]) + src * al[..., None]).clip(0, 255).astype(np.uint8)
del port
print('coast drawn')

# ---- seams: the same colour either side, then a cross-fade along a wandering line
for ys in SEAMS:
    Y = ys * K; Kb = 240; R = 1200; BW = 220
    top = cv[Y - Kb:Y].astype(np.float32).mean(0); bot = cv[Y:Y + Kb].astype(np.float32).mean(0)
    def sm(a):  # smooth along x
        k = np.exp(-0.5 * (np.arange(-600, 601) / 200) ** 2); k /= k.sum()
        return np.stack([np.convolve(np.pad(a[:, c], 600, mode='edge'), k, 'valid') for c in range(3)], 1)
    top, bot = sm(top), sm(bot); mid = (top + bot) / 2
    for y in range(Y - R, Y + R):
        w = 1 - abs(y - Y + 0.5) / R
        cv[y] = (cv[y].astype(np.float32) + (mid - (top if y < Y else bot)) * w).clip(0, 255).astype(np.uint8)
    # the line wanders: broad swings and smaller ones, as the edge of a dune field or a rocky rise would
    n = blur(rng.random((1, W * K // 96 + 2)).astype(np.float32), 3)[0]; n = (n - n.mean()) / (n.std() + 1e-6)
    n2 = blur(rng.random((1, W * K // 24 + 2)).astype(np.float32), 1.5)[0]; n2 = (n2 - n2.mean()) / (n2.std() + 1e-6)
    line = Y + 190 * np.interp(np.arange(W * K), np.linspace(0, W * K, len(n)), n) + 40 * np.interp(np.arange(W * K), np.linspace(0, W * K, len(n2)), n2)
    line = np.clip(line, Y - 420, Y + 420)              # (each side is continued past the seam as its mirror: keep that short)
    band = np.arange(Y - BW - 440, Y + BW + 440)
    a = cv[band].astype(np.float32)
    up_ = np.where(band[:, None] < Y, band[:, None], 2 * Y - 1 - band[:, None])    # the north picture, mirrored past the seam
    dn_ = np.where(band[:, None] >= Y, band[:, None], 2 * Y - band[:, None])
    north = cv[up_[:, 0]].astype(np.float32); south = cv[dn_[:, 0]].astype(np.float32)
    t = np.clip((band[:, None] - line[None, :]) / BW * 0.5 + 0.5, 0, 1); t = t * t * (3 - 2 * t)
    cv[band] = (north * (1 - t[..., None]) + south * t[..., None]).clip(0, 255).astype(np.uint8)
print('seams blended')

# ---- the roads joined: the valley's, then the desert's, then the port's, each in its place
road = []
for pid, d, (ox, oy), _ in PARTS:
    pts = json.loads((root / 'data' / 'road.json').read_text()) if pid == 'valley' else json.loads((root / 'data' / 'maps' / pid / 'map.json').read_text())['road']
    pts = [[p[0] + ox, p[1] + oy] for p in pts]
    if road and np.hypot(pts[0][0] - road[-1][0], pts[0][1] - road[-1][1]) < 6: pts = pts[1:]
    road += pts
road = [[round(x, 2), round(y, 2)] for x, y in road]

# ---- the air base
img = Image.fromarray(cv); del cv
base = make_airbase.place(img, rng, K, road, root / 'assets' / 'originals' / 'airbase.png', (COLA + 12, 0))
cv = None

# ---- tiles: level 2 as composed (with a little grain), 3 enlarged from it, 1 and 0 reduced
# (tile by tile: the whole of level 3 would be 1.5 GB as a picture, several times that to work on)
def tiles_from(img, L, scale, q, fn):
    d = out / 'tiles' / str(L); d.mkdir(parents=True, exist_ok=True)
    w, h = img.size[0] * scale, img.size[1] * scale; m = 8
    for ty in range((h + T - 1) // T):
        for tx in range((w + T - 1) // T):
            x0, y0, x1, y1 = tx * T, ty * T, min(w, (tx + 1) * T), min(h, (ty + 1) * T)
            sx0, sy0 = max(0, x0 // scale - m), max(0, y0 // scale - m)
            sx1, sy1 = min(img.size[0], -(-x1 // scale) + m), min(img.size[1], -(-y1 // scale) + m)
            part = img.crop((sx0, sy0, sx1, sy1))
            if scale > 1: part = part.resize((part.size[0] * scale, part.size[1] * scale), Image.LANCZOS)
            part = fn(part).crop((x0 - sx0 * scale, y0 - sy0 * scale, x1 - sx0 * scale, y1 - sy0 * scale))
            part.save(d / f'{tx}_{ty}.jpg', quality=q, optimize=True)
tiles_from(img, 2, 1, 82, lambda p: grain(rng, p, 1.0))
tiles_from(img, 3, 2, 76, lambda p: grain(rng, p.filter(ImageFilter.UnsharpMask(radius=1.5, percent=35, threshold=2)), 1.8))
save_level(img.resize((W * 2, H * 2), Image.LANCZOS), out / 'tiles' / '1', 85)
x1 = img.resize((W, H), Image.LANCZOS); save_level(x1, out / 'tiles' / '0', 88)
print('tiles written')
# far field: 8 km square; the west side from its own rows (the sea is only in the south)
SIZE = 9411.76
x0, y0 = far_field(rng, x1, SIZE, out / 'tiles' / 'far', fold_x=(160, 300), N=4, ew_rows=60)
# buildings in the picture: the port's, moved, and the air base's
pm = json.loads((root / 'data' / 'maps' / 'port' / 'map.json').read_text())
blds = [(b[0], b[1] + SEAMS[1], b[2], b[3], b[4], b[5]) for b in pm.get('blds', [])] + base['blds']
rows, AW, AH = atlas([(b, *ruin(img, rng, *b)) for b in blds], out / 'ruins.webp')
(out / 'house_pad.png').write_bytes((root / 'maps' / 'desert' / 'house_pad.png').read_bytes())
mean = np.asarray(x1, np.float32).reshape(-1, 3).mean(0)
ground = int(mean[0] * 0.8) << 16 | int(mean[1] * 0.8) << 8 | int(mean[2] * 0.8)
hz = mean * 0.55 + np.array([200, 200, 205]) * 0.45; haze = int(hz[0]) << 16 | int(hz[1]) << 8 | int(hz[2])
d = root / 'data' / 'maps' / 'theater'; d.mkdir(parents=True, exist_ok=True)
mis = d / 'missions.json'
m = {'ar': 'المسرح الكامل', 'en': 'THEATRE', 'w': W, 'h': H, 'road': road, 'far': {'x0': round(x0, 2), 'y0': round(y0, 2), 'size': SIZE, 'n': 4},
     'ground': ground, 'haze': haze, 'hover': {'h1': {'b': 314, 'd': 1180}, 'h2': {'b': 160, 'd': 900}}, 'pad': True,
     'blds': rows, 'ruinsW': AW, 'ruinsH': AH, 'base': base['info'], 'parts': {p[0]: list(p[2]) for p in PARTS},
     'missions': json.loads(mis.read_text()) if mis.exists() else []}
(d / 'map.json').write_text(json.dumps(m, ensure_ascii=False))
print('map.json written', W, 'x', H, 'road', len(road), 'points; buildings', len(rows))
