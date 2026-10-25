"""Build a second (or further) map from one top-down image: tiles, road, far field, TSD picture, house plot, colours.

usage: python3 tools/make_map.py desert

Reads assets/originals/<id>_map.png and the road's rough course (COARSE below); writes maps/<id>/tiles/** and
maps/<id>/house_pad.png, and data/maps/<id>/map.json (size, road, far field, colours, hover points), which
tools/build.py puts into the game. Missions for the map are in data/maps/<id>/missions.json (merged in here).

usage with AI detail (as the valley): python3 tools/make_map.py <id> <id>_x4_raw.png
  where <id>_x4_raw.png is Real-ESRGAN x4plus of the original (tools/build_onnx.py, then
  tools/upscale.py model.onnx assets/originals/<id>_map.png <id>_x4_raw.png - 4; not stored in git). Its detail is
  blended with a plain enlargement and softened like the valley's, so it reads as a sensor image, not an illustration;
  level 3 is that x4 enlarged x2. Without it the levels are a Lanczos enlargement with unsharp mask and grain (softer).
"""
import sys, json, pathlib
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
Image.MAX_IMAGE_PIXELS = None
root = pathlib.Path(__file__).resolve().parent.parent
MID = sys.argv[1] if len(sys.argv) > 1 else 'desert'
MAPS = {
    'desert': dict(ar='الصحراء', en='DESERT', coarse=[(820, 0), (818, 50), (795, 100), (775, 150), (768, 200), (775, 250), (800, 300), (830, 350),
                                                       (862, 400), (888, 450), (905, 500), (920, 550), (940, 600), (965, 650), (990, 700),
                                                       (1002, 750), (1005, 800), (995, 850), (985, 900), (975, 941)],
                   hover={'h1': {'b': 250, 'd': 1900}, 'h2': {'b': 60, 'd': 2200}}, plot_x=(620, 1150), coarse_dx=2, fold_x=(600, 600)),
    # port and camp: a paved (dark) road, the sea in the north-west; houses' plot from the open desert in the east
    'port': dict(ar='الميناء والمعسكر', en='PORT & CAMP', coarse=[(1110, 0), (1112, 50), (1112, 100), (1110, 150), (1107, 200), (1104, 250), (1098, 300),
                                                                  (1090, 350), (1080, 400), (1066, 450), (1052, 500), (1040, 550), (1030, 600), (1022, 650),
                                                                  (1015, 700), (1010, 750), (1005, 800), (1003, 850), (1000, 900), (999, 940)],
                 hover={'h1': {'b': 245, 'd': 1900}, 'h2': {'b': 75, 'd': 2100}}, plot_x=(1150, 1450), road_dark=True, road_wid=16, fold_x=(160, 500), band_n=(330, 540), band_s=(780, 940),
                 # the buildings in the picture, read off it by eye: centre x, y, size along / across (map px), turn (rad), kind
                 blds=[*[(x, y, w, h, 0, 'hall') for x, y, w, h in [
                           # camp: barracks, offices, stores
                           (676.5, 575.5, 55, 11), (717.8, 575.8, 9.5, 13.5), (657, 598.5, 34, 11), (657, 615, 34, 10), (622, 624, 18, 6.5),
                           (694, 607, 8, 22), (716.5, 607, 11, 22), (705, 629, 34.5, 7.5), (738.8, 575.8, 14, 11.7), (773.3, 583, 38.5, 10.8),
                           (811.7, 593.8, 16.7, 12.5), (737.5, 607.5, 10, 21.7), (759.2, 609.2, 11.7, 23.3), (820.4, 617.5, 7.5, 20),
                           (838.3, 647, 8.5, 19.2), (628.8, 668.3, 12.5, 56.7), (661, 659, 24, 12), (660.8, 676.8, 26.5, 11.5),
                           (691.5, 668.7, 13, 57), (715, 669.5, 13, 55), (608.8, 711, 7.5, 10), (691.5, 710, 13, 12), (712.9, 710.5, 12.3, 9),
                           (713.3, 723.8, 13.3, 7.5), (623, 730, 10, 20), (647.5, 733.8, 28.3, 12.5), (673, 742.5, 10, 31.7),
                           (691.3, 744.2, 12.5, 28.3), (711.7, 744.5, 11.7, 29), (811.3, 656, 12.5, 24), (811.3, 682.5, 12.5, 27),
                           (797.8, 721.7, 9.2, 23.3), (816.7, 721.7, 13.3, 23.3), (791.7, 757, 18.3, 17.5),
                           # port: sheds and offices on the quay
                           (560, 169.4, 20, 18.8), (560, 198, 20, 16), (562.4, 221.3, 17, 17.5), (568.8, 266.9, 17.5, 26), (607.5, 240, 15, 20),
                           (608, 218.8, 14, 7.5), (546.8, 154.4, 8.5, 8.8), (492.5, 124.4, 15, 11), (485.6, 272.5, 9, 15), (510, 296.3, 15, 12.5),
                           (797.5, 103.8, 7.5, 12.5)]],
                       # the depot's four warehouses, turned a little
                       (870.5, 101.3, 76, 22, 0.13, 'hall'), (976.8, 177.8, 81, 27, 0.13, 'hall'), (972.5, 214, 82.5, 28, 0.145, 'hall'),
                       (962.5, 278, 82.5, 29, 0.15, 'hall'),
                       *[(x, y, 12.5, 16.7, 0, 'tent') for y in (720, 745.8) for x in (733, 749.6, 766.3)],
                       (765.5, 561.8, 11, 11, 0, 'tank'), (782, 561.8, 11, 11, 0, 'tank'),
                       (453.8, 200, 75, 13, 1.454, 'ship'), (375.8, 265, 84, 11, -0.168, 'ship')]),
}
M = MAPS[MID]
src = Image.open(root / 'assets' / 'originals' / f'{MID}_map.png').convert('RGB')
W, H = src.size
out = root / 'maps' / MID
rng = np.random.default_rng(3)

# ---- tiles: levels 0..3 (x1..x8), 1024 px tiles
T = 1024
def grain(img, s):
    a = np.asarray(img, np.float32); a += rng.normal(0, s, a.shape[:2])[..., None]
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))
def save_level(img, L, q):
    d = out / 'tiles' / str(L); d.mkdir(parents=True, exist_ok=True)
    w, h = img.size
    for ty in range((h + T - 1) // T):
        for tx in range((w + T - 1) // T):
            img.crop((tx * T, ty * T, min(w, (tx + 1) * T), min(h, (ty + 1) * T))).save(d / f'{tx}_{ty}.jpg', quality=q, optimize=True)
if len(sys.argv) > 2:
    # the valley's recipe (tools/make_tiles.py): AI detail half-blended with a bicubic enlargement, then softened
    raw = Image.open(sys.argv[2]).convert('RGB'); assert raw.size == (W * 4, H * 4), raw.size
    x4 = Image.blend(raw, src.resize(raw.size, Image.BICUBIC), 0.45).filter(ImageFilter.GaussianBlur(0.6)); del raw
    # a little sensor grain: the AI detail alone looks painted when magnified
    save_level(grain(x4.resize((W * 8, H * 8), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.5, percent=35, threshold=2)), 1.8), 3, 78)
    save_level(grain(x4, 1.2), 2, 82)
    save_level(x4.resize((W * 2, H * 2), Image.LANCZOS), 1, 85)
    save_level(Image.blend(src, x4.resize((W, H), Image.LANCZOS), 0.5), 0, 88)
else:
    save_level(src, 0, 88)
    for L, (k, sharp, g, q) in enumerate([(2, 60, 2.0, 85), (4, 70, 2.6, 82), (8, 80, 3.0, 78)], start=1):
        up = src.resize((W * k, H * k), Image.LANCZOS).filter(ImageFilter.UnsharpMask(radius=1.2 * k / 2, percent=sharp, threshold=2))
        save_level(grain(up, g), L, q)
        if L == 2: x4 = up
        del up

# ---- road: rough course, Catmull-Rom, each point slides across to the brightest line of the track, smoothed
def catmull_rom(P, n):
    out = []; Q = np.vstack([P[0], P, P[-1]])
    for i in range(1, len(Q) - 2):
        p0, p1, p2, p3 = Q[i - 1], Q[i], Q[i + 1], Q[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-1]); return np.array(out)
# the track's middle, row by row (the road runs top to bottom): near the rough course, the stretch about one track
# wide that is lightest and smoothest (the graded dirt; the ground beside it is rougher and darker), then smoothed
def box(a, h, w):
    # moving mean over an h x w box (edges: shorter windows)
    c = np.cumsum(np.cumsum(np.pad(a, ((1, 0), (1, 0))), 0), 1)
    H_, W_ = a.shape; ys = np.arange(H_); xs_ = np.arange(W_)
    y0 = np.clip(ys - h // 2, 0, H_); y1 = np.clip(ys + h // 2 + 1, 0, H_); x0 = np.clip(xs_ - w // 2, 0, W_); x1 = np.clip(xs_ + w // 2 + 1, 0, W_)
    S = c[y1][:, x1] - c[y0][:, x1] - c[y1][:, x0] + c[y0][:, x0]
    return S / ((y1 - y0)[:, None] * (x1 - x0)[None, :])
def gsmooth(v, sig):
    k = np.exp(-0.5 * (np.arange(-3 * sig, 3 * sig + 1) / sig) ** 2); k /= k.sum()
    return np.convolve(np.pad(v, 3 * sig, mode='edge'), k, mode='valid')
D = catmull_rom(np.array(M['coarse'], float) + [M.get('coarse_dx', 0), 0], 12)
g2 = np.asarray(src.resize((W * 2, H * 2), Image.LANCZOS).convert('L'), np.float32)
wid = M.get('road_wid', 14)                                # about the track's width, in x2 pixels
mean = box(g2, 3, wid); var = box(g2 * g2, 3, wid) - mean ** 2
# a dirt track is the lightest smooth stretch; a paved road the darkest
score = (-mean if M.get('road_dark') else mean) - 1.5 * np.sqrt(np.maximum(var, 0))
cx = np.interp(np.arange(H * 2) / 2, D[:, 1], D[:, 0]) * 2
xs = []
for y in range(H * 2):
    a, b = int(cx[y] - 26), int(cx[y] + 26)
    row = score[y, max(a, 0):min(b, W * 2)]
    xs.append(max(a, 0) + int(np.argmax(row - 0.15 * np.abs(np.arange(len(row)) + max(a, 0) - cx[y]))))
# a running median first (a stray bright patch beside the track moves a few rows, not the line), then smooth
xs = np.array(xs, float); m_ = 31
xs = np.array([np.median(xs[max(0, i - m_):i + m_ + 1]) for i in range(len(xs))])
xs = gsmooth(xs, 24)
ref = [np.array([xs[y] / 2, y / 2]) for y in range(H * 2)]
R = np.array(ref); K = 2
Rs = np.array([R[max(0, i - K):min(len(R), i + K + 1)].mean(0) for i in range(len(R))]); Rs[0], Rs[-1] = R[0], R[-1]
s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(Rs, axis=0), axis=1))])
ss = np.arange(0, s[-1], 2.0)
road = [[round(float(x), 2), round(float(y), 2)] for x, y in zip(np.interp(ss, s, Rs[:, 0]), np.interp(ss, s, Rs[:, 1]))]
print('road', len(road), 'points,', round(s[-1] * 0.85), 'm')

# ---- far field: 6 km around the map, the map itself folded outward, softened with
# distance, 4 x 4 tiles of 1024 px; and the TSD's whole-area picture
SIZE = 7058.82; N = 4; C = N * T; k = C / SIZE
x0, y0 = W / 2 - SIZE / 2, H / 2 - SIZE / 2
# each far pixel samples the map folded back and forth (a mirror at every edge, so seams meet without a cut). West
# and east of the map the fold stays within a strip along that edge ('fold_x': the west and east strips' widths),
# so the ground beyond is that side's ground: on a coast the sea runs on to the horizon instead of the land coming
# back across it as a strait, and the road is not repeated beside itself. North and south the road runs on.
def fold(v, a, b):
    L = b - a; t = np.mod(v - a, 2 * L); return a + np.where(t < L, t, 2 * L - t)
small = np.asarray(src.resize((round(W * k), round(H * k)), Image.LANCZOS), np.float32)
X = x0 + (np.arange(C) + 0.5) / k; Y = y0 + (np.arange(C) + 0.5) / k
fw_, fe_ = M.get('fold_x', (W, W))
sx = np.where(X < 0, fold(X, 0, fw_), np.where(X > W, fold(X, W - fe_, W), X))
sy = fold(Y, 0, H)
ix = np.clip((sx * k).astype(int), 0, small.shape[1] - 1); iy = np.clip((sy * k).astype(int), 0, small.shape[0] - 1)
far = small[iy[:, None], ix[None, :]]
# a mirror shows: folded twice, the far ground turns into a kaleidoscope. So beyond the west and east edges the strip's
# ground is laid again in random patches (turned over at random, feathered into each other), fading in from the
# plain fold a little way out from the edge where the fold still joins the map without a seam
def quilt(strip, h, w):
    sh_, sw_ = strip.shape[:2]; B = int(min(112, sw_ - 2, sh_ - 2)); O = B // 4; st = B - O
    acc = np.zeros((h, w, 3), np.float32); wt = np.zeros((h, w), np.float32)
    win = np.outer(np.hanning(B + 2)[1:-1], np.hanning(B + 2)[1:-1]).astype(np.float32) + 1e-3
    for y in range(-O, h, st):
        for x in range(-O, w, st):
            sy_, sx_ = rng.integers(0, sh_ - B + 1), rng.integers(0, sw_ - B + 1)
            b = strip[sy_:sy_ + B, sx_:sx_ + B]
            if rng.random() < 0.5: b = b[::-1]
            if rng.random() < 0.5: b = b[:, ::-1]
            ya, xa = max(0, y), max(0, x); yb, xb = min(h, y + B), min(w, x + B)
            acc[ya:yb, xa:xb] += b[ya - y:yb - y, xa - x:xb - x] * win[ya - y:yb - y, xa - x:xb - x, None]
            wt[ya:yb, xa:xb] += win[ya - y:yb - y, xa - x:xb - x]
    return acc / wt[..., None]
sk = small.shape[1] / W
for side, (a_, b_) in (('w', (0, fw_)), ('e', (W - fe_, W))):
    cols = X < 0 if side == 'w' else X > W
    if not cols.any(): continue
    strip = small[:, int(a_ * sk):int(b_ * sk)]
    q = quilt(strip, C, int(cols.sum()))
    dist = (-X[cols] if side == 'w' else X[cols] - W) * k
    f = np.clip((dist - 30) / 120, 0, 1)[None, :, None]
    far[:, cols] = far[:, cols] * (1 - f) + q * f
# north and south: patches from a band of the map, each from about its own place across (so the sea stays the sea
# and the land the land), the band's rows taken at random
def quilt_ns(band, xs):
    bh, bw = band.shape[:2]; B = int(min(112, bh - 2)); O = B // 4; st = B - O; h, w = C, len(xs)
    acc = np.zeros((h, w, 3), np.float32); wt = np.zeros((h, w), np.float32)
    win = np.outer(np.hanning(B + 2)[1:-1], np.hanning(B + 2)[1:-1]).astype(np.float32) + 1e-3
    for y in range(-O, h, st):
        for x in range(-O, w, st):
            c0 = xs[min(w - 1, max(0, x + B // 2))] - B // 2 + int(rng.integers(-B // 3, B // 3 + 1))
            sx_ = int(np.clip(c0, 0, bw - B)); sy_ = int(rng.integers(0, bh - B + 1))
            b = band[sy_:sy_ + B, sx_:sx_ + B]
            if rng.random() < 0.5: b = b[::-1]
            if rng.random() < 0.5: b = b[:, ::-1]
            ya, xa = max(0, y), max(0, x); yb, xb = min(h, y + B), min(w, x + B)
            acc[ya:yb, xa:xb] += b[ya - y:yb - y, xa - x:xb - x] * win[ya - y:yb - y, xa - x:xb - x, None]
            wt[ya:yb, xa:xb] += win[ya - y:yb - y, xa - x:xb - x]
    return acc / wt[..., None]
inx = (X >= 0) & (X <= W)
xs = np.clip((X[inx] * sk).astype(int), 0, small.shape[1] - 1)
for side in ('n', 's'):
    rows = Y < 0 if side == 'n' else Y > H
    # the band: by default the 220 px along that edge; a map whose edge is built up names open ground instead
    b0, b1 = M.get('band_' + side, (0, 220) if side == 'n' else (H - 220, H))
    band = small[int(b0 * sk):int(b1 * sk)]
    q = quilt_ns(band, xs)
    dist = (-Y if side == 'n' else Y - H) * k
    f = (np.clip((dist - 30) / 120, 0, 1) * rows)[:, None, None]
    sub = far[:, inx]
    far[:, inx] = sub * (1 - f) + q * f
canvas = Image.fromarray(far.clip(0, 255).astype(np.uint8))
canvas = canvas.filter(ImageFilter.GaussianBlur(0.6))
(out / 'tiles' / 'far').mkdir(parents=True, exist_ok=True)
for ty in range(N):
    for tx in range(N):
        canvas.crop((tx * T, ty * T, (tx + 1) * T, (ty + 1) * T)).save(out / 'tiles' / 'far' / f'{tx}_{ty}.jpg', quality=82, optimize=True)
canvas.resize((1024, 1024), Image.LANCZOS).save(out / 'tiles' / 'far' / 'tsd.jpg', quality=80)

# ---- a cleared plot for houses: the flattest light patch of this map's ground, feathered
G = np.asarray(src.convert('L'), np.float32)
best = None
xa, xb = M.get('plot_x', (40, W - 40))
for y in range(40, H - 40, 12):
    for x in range(xa, xb, 12):
        p = G[y - 16:y + 16, x - 16:x + 16]; sc = p.std() - 0.2 * p.mean()
        if best is None or sc < best[0]: best = (sc, x, y)
_, px, py = best
plot = x4.crop(((px - 16) * 4, (py - 16) * 4, (px + 16) * 4, (py + 16) * 4)).resize((256, 256), Image.BICUBIC)
plot = ImageEnhance.Brightness(plot).enhance(1.05)
yy, xx = np.mgrid[0:256, 0:256] / 255.0 * 2 - 1
edge = np.maximum(np.abs(xx), np.abs(yy)) * 0.55 + np.hypot(xx, yy) * 0.45
noise = np.asarray(Image.fromarray((rng.random((16, 16)) * 255).astype(np.uint8)).resize((256, 256), Image.BICUBIC), np.float32) / 255
mask = np.clip((0.95 - edge - (noise - 0.5) * 0.35) / 0.3, 0, 1)
pad = plot.convert('RGBA'); pad.putalpha(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4)))
pad.save(out / 'house_pad.png')

# ---- buildings in the picture: each gets its ruin, cut from the AI-detailed picture itself so it matches the map,
# shown over the map when the building is destroyed: the roof fallen in (darkened, broken into slabs, burnt-out
# holes, cracks, rubble), and around it a margin of rubble and soot that also covers the standing building's shadow.
# A tent burns to the ground; a fuel tank's roof falls into a black pool inside the ring; a ship keeps its hull,
# soot-streaked and holed. Packed into maps/<id>/ruins.webp; map.json 'blds': [x, y, w, h, r, kind, ax, ay, aw, ah,
# ow, oh]: footprint (map px, w along direction r), the atlas rectangle (px), the overlay's size (map px).
def vnoise(h, w, cell):
    g = rng.random((max(2, int(h / cell) + 2), max(2, int(w / cell) + 2)))
    return np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((int(w / cell + 2) * cell, int(h / cell + 2) * cell), Image.BICUBIC), np.float32)[:h, :w] / 255
def blur(a, r):
    k = np.exp(-0.5 * (np.arange(-int(3 * r + 1), int(3 * r + 1) + 1) / r) ** 2); k /= k.sum(); p = len(k) // 2
    a = np.pad(a, p, mode='edge')
    a = np.apply_along_axis(lambda v: np.convolve(v, k, 'valid'), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(v, k, 'valid'), 1, a)
def ruin(x, y, w, h, r, kind):
    S4 = 4
    m = 0 if kind == 'ship' else max(4, 0.5 * w) if kind == 'tank' else min(6, max(3.5, 0.3 * min(w, h)))
    ow, oh = w + 2 * m, h + 2 * m
    W2, H2 = int(round(ow * S4)), int(round(oh * S4))
    R = int(np.hypot(W2, H2) / 2 + 4)
    big = x4.crop((int(x * S4 - R), int(y * S4 - R), int(x * S4 + R), int(y * S4 + R))).rotate(np.degrees(r), resample=Image.BICUBIC)
    a = np.asarray(big.crop((R - W2 // 2, R - H2 // 2, R - W2 // 2 + W2, R - H2 // 2 + H2)), np.float32)
    yy, xx = np.mgrid[0:H2, 0:W2].astype(np.float32)
    lx, ly = (xx + 0.5) / S4 - ow / 2, (yy + 0.5) / S4 - oh / 2
    if kind == 'tank': d = np.hypot(lx, ly) - w / 2
    else:
        ex, ey = np.abs(lx) - w / 2, np.abs(ly) - h / 2
        if kind == 'ship':                                  # a pointed bow and a round stern
            t = np.clip((np.abs(lx) - (w / 2 - h)) / h, 0, 1); ey = np.abs(ly) - h / 2 * np.sqrt(1 - t * t)
        d = np.where((ex > 0) | (ey > 0), np.hypot(np.maximum(ex, 0), np.maximum(ey, 0)), np.maximum(ex, ey))
    lum = a.mean(2)
    hp = lum - blur(lum, 2.5)                               # the picture's own fine detail, kept as texture
    n1, n2 = vnoise(H2, W2, 10), vnoise(H2, W2, 3)
    speck = rng.random((H2, W2))
    foot = d <= 0
    # what is left standing is ragged: the walls broke unevenly, rubble slid out over them
    inside = (d + (n1 - 0.5) * 2.2 + (n2 - 0.5) * 0.8 <= 0) if kind in ('hall', 'tent') else foot
    out = a.copy()
    if kind != 'ship':
        # ground under the margin: the surroundings' colour, without the building's shadow
        ring = (d > 0.5 * m) & (lum > np.percentile(lum[d > 0.5 * m], 40)) if (d > 0.5 * m).any() else ~inside
        g = np.median(a[ring], 0) if ring.any() else a.reshape(-1, 3).mean(0)
        dd = np.maximum(d, 0)
        soot = np.exp(-dd / (m * 0.4)) * (0.6 + 0.6 * n1)
        ground = g[None, None] + hp[..., None] * 1.1 + (n2[..., None] - 0.5) * 14
        ground *= (1 - 0.45 * np.clip(soot, 0, 1))[..., None]
        # rubble thrown out of the walls, thinning outward: chunks of grey concrete, dust lighter than the ground
        dens = 0.5 * np.exp(-dd / (m * 0.3))
        rub = np.clip(blur((speck < dens * (0.4 + n2)).astype(np.float32), 1.1) * 2.2, 0, 1)
        tone = 92 + 50 * n2[..., None] + hp[..., None] * 0.6
        ground = ground * (1 - 0.85 * rub[..., None]) + 0.85 * rub[..., None] * tone * [1.02, 0.98, 0.92]
        out = np.where(inside[..., None], out, ground)
    if kind in ('hall', 'ship'):
        # the roof (deck) broken into slabs
        n = max(6, int(w * h / (28 if kind == 'hall' else 60)))
        sx, sy = rng.uniform(-w / 2, w / 2, n), rng.uniform(-h / 2, h / 2, n)
        dist = np.hypot(lx[..., None] - sx, ly[..., None] - sy)
        c1 = np.argmin(dist, axis=2)
        f = rng.uniform(0.62, 1.0, n) if kind == 'hall' else rng.uniform(0.65, 1.0, n)
        # roof slabs: fallen and tilted, each lit a little differently (soft edges: they lie over each other)
        fl = blur(f[c1], 1.6)
        n3 = vnoise(H2, W2, 2)
        if kind == 'hall':
            # greyed and dusted the colour of the ground around it, mottled by broken concrete
            grey = lum[..., None] * 0.6 + a * 0.4
            roof = (grey * 0.55 + g * 0.45) * fl[..., None] + (n3[..., None] - 0.5) * 34 + hp[..., None] * 0.8
            # burnt through: the dark of the gutted inside, soft-edged, with ash in it
            gut = np.clip(((n1 * 0.6 + vnoise(H2, W2, 5) * 0.4) - 0.6) * 6, 0, 1) * np.clip(-d * 1.2, 0, 1)
            burnt = np.array([46, 41, 36], np.float32) * (0.7 + 0.6 * n3[..., None])
            roof = roof * (1 - gut[..., None]) + burnt * gut[..., None]
            roof *= (1 - 0.25 * np.exp(-(lx / (w * 0.6)) ** 2 - (ly / (h * 0.8)) ** 2) * n1)[..., None]
        else:
            # the deck keeps its colours; soot blown along it and a few burnt-out holds
            roof = a * fl[..., None]
            st = blur(vnoise(H2, W2, 6), 1.5); roof *= (1 - 0.6 * np.clip((st - 0.45) * 3, 0, 1))[..., None]
            gut = np.clip((n1 - 0.68) * 6, 0, 1) * np.clip(-d * 2, 0, 1)
            roof = roof * (1 - gut[..., None]) + gut[..., None] * np.array([30, 27, 24]) * (0.7 + 0.6 * n3[..., None])
        out = np.where(inside[..., None], roof, out)
    elif kind == 'tent':
        # burnt to the ground: charcoal and ash, the frame's ribs across it
        ashk = np.clip(blur((speck < 0.1).astype(np.float32), 0.8) * 2.5, 0, 1)[..., None]
        ash = [34, 31, 28] + ashk * [70, 68, 64] + hp[..., None] * 0.5 + (n2[..., None] - 0.5) * 18
        # what is left of the frame: a few bent ribs across it, broken off here and there
        rib = (np.abs(((lx + w / 2 + (n1 - 0.5) * 1.2) / 2.6) % 1 - 0.5) < 0.06) & (np.abs(ly) < h / 2 - 0.8) & (n2 > 0.42)
        ash = np.where(rib[..., None], ash * 0.4 + np.array([66, 56, 46]) * 0.6, ash)
        out = np.where(inside[..., None], ash, out)
    elif kind == 'tank':
        rr = np.hypot(lx, ly)
        wall = (rr > w / 2 - 1.1) & inside
        pool = np.array([18, 16, 14], np.float32) * (0.8 + 0.5 * n2[..., None]) + hp[..., None] * 0.4
        out = np.where(inside[..., None], np.where(wall[..., None], a.mean(2, keepdims=True) * 0.55 * (0.6 + 0.6 * n2[..., None]), pool), out)
    if kind == 'ship': al = np.clip(-d * S4 + 0.5, 0, 1)
    else: al = np.clip(1 - np.maximum(d, 0) / m + (n1 - 0.5) * 0.6, 0, 1) ** 0.7
    al = np.where(inside, 1, al)
    img = Image.fromarray(np.dstack([np.clip(out, 0, 255), al * 255]).astype(np.uint8), 'RGBA')
    return img, ow, oh
blds = []
if M.get('blds'):
    items = [(b, *ruin(*b)) for b in M['blds']]
    AW, P = 2048, 2
    order = sorted(range(len(items)), key=lambda i: -items[i][1].size[1])
    pos, cx_, cy_, rowh = {}, 0, 0, 0
    for i in order:
        im = items[i][1]
        if cx_ + im.size[0] + P > AW: cx_, cy_, rowh = 0, cy_ + rowh + P, 0
        pos[i] = (cx_, cy_); cx_ += im.size[0] + P; rowh = max(rowh, im.size[1])
    AH = cy_ + rowh
    atlas = Image.new('RGBA', (AW, AH))
    for i, (b, im, ow, oh) in enumerate(items):
        atlas.paste(im, pos[i])
        blds.append([*[round(v, 3) for v in b[:5]], b[5], *pos[i], *im.size, round(ow, 2), round(oh, 2)])
    atlas.save(out / 'ruins.webp', quality=86, method=6)
    print('ruins', len(blds), 'buildings, atlas', AW, 'x', AH)

# ---- colours: the ground's mean (distant flat ground) and a lighter, greyer haze
mean = np.asarray(src, np.float32).reshape(-1, 3).mean(0)
ground = int(mean[0] * 0.8) << 16 | int(mean[1] * 0.8) << 8 | int(mean[2] * 0.8)
hz = mean * 0.55 + np.array([200, 200, 205]) * 0.45
haze = int(hz[0]) << 16 | int(hz[1]) << 8 | int(hz[2])

d = root / 'data' / 'maps' / MID; d.mkdir(parents=True, exist_ok=True)
mis = d / 'missions.json'
m = {'ar': M['ar'], 'en': M['en'], 'w': W, 'h': H, 'road': road, 'far': {'x0': round(x0, 2), 'y0': round(y0, 2), 'size': SIZE, 'n': N},
     'ground': ground, 'haze': haze, 'hover': M['hover'], 'pad': True,
     **({'blds': blds, 'ruinsW': AW, 'ruinsH': AH} if blds else {}), 'missions': json.loads(mis.read_text()) if mis.exists() else []}
(d / 'map.json').write_text(json.dumps(m, ensure_ascii=False))
print('map.json written; plot at', px, py, '; ground', hex(ground), 'haze', hex(haze))
