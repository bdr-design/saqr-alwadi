"""Build a second (or further) map from one top-down image: tiles, road, far field, TSD picture, house plot, colours.

usage: python3 tools/make_map.py desert

Reads assets/originals/<id>_map.png and the road's rough course (COARSE below); writes maps/<id>/tiles/** and
maps/<id>/house_pad.png, and data/maps/<id>/map.json (size, road, far field, colours, hover points), which
tools/build.py puts into the game. Missions for the map are in data/maps/<id>/missions.json (merged in here).

The valley was enlarged with Real-ESRGAN (tools/upscale.py). Here the levels are a Lanczos enlargement with a light
unsharp mask and sensor grain, so the deepest zoom is softer than the valley's; with the ONNX model at hand, feed
its x4/x8 outputs to tools/make_tiles.py instead.
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
                   hover={'h1': {'b': 250, 'd': 1900}, 'h2': {'b': 60, 'd': 2200}}, plot_x=(620, 1150), coarse_dx=2),
}
M = MAPS[MID]
src = Image.open(root / 'assets' / 'originals' / f'{MID}_map.png').convert('RGB')
W, H = src.size
out = root / 'maps' / MID
rng = np.random.default_rng(3)

# ---- tiles: levels 0..3 (x1..x8), 1024 px tiles
T = 1024
def save_level(img, L, q):
    d = out / 'tiles' / str(L); d.mkdir(parents=True, exist_ok=True)
    w, h = img.size
    for ty in range((h + T - 1) // T):
        for tx in range((w + T - 1) // T):
            img.crop((tx * T, ty * T, min(w, (tx + 1) * T), min(h, (ty + 1) * T))).save(d / f'{tx}_{ty}.jpg', quality=q, optimize=True)
def grain(img, s):
    a = np.asarray(img, np.float32); a += rng.normal(0, s, a.shape[:2])[..., None]
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))
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
wid = 14                                                   # about the track's width, in x2 pixels
mean = box(g2, 3, wid); var = box(g2 * g2, 3, wid) - mean ** 2
score = mean - 1.5 * np.sqrt(np.maximum(var, 0))
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

# ---- far field: 6 km around the map, the map itself mirrored outward (seams meet without a cut), softened with
# distance, 4 x 4 tiles of 1024 px; and the TSD's whole-area picture
SIZE = 7058.82; N = 4; C = N * T; k = C / SIZE
x0, y0 = W / 2 - SIZE / 2, H / 2 - SIZE / 2
small = src.resize((round(W * k), round(H * k)), Image.LANCZOS)
fw, fh = small.size
canvas = Image.new('RGB', (C, C))
ox, oy = round(-x0 * k), round(-y0 * k)
for j in range(-6, 7):
    for i in range(-6, 7):
        t = small
        if i % 2: t = t.transpose(Image.FLIP_LEFT_RIGHT)
        if j % 2: t = t.transpose(Image.FLIP_TOP_BOTTOM)
        px, py = ox + i * fw, oy + j * fh
        if px > C or py > C or px + fw < 0 or py + fh < 0: continue
        canvas.paste(t, (px, py))
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

# ---- colours: the ground's mean (distant flat ground) and a lighter, greyer haze
mean = np.asarray(src, np.float32).reshape(-1, 3).mean(0)
ground = int(mean[0] * 0.8) << 16 | int(mean[1] * 0.8) << 8 | int(mean[2] * 0.8)
hz = mean * 0.55 + np.array([200, 200, 205]) * 0.45
haze = int(hz[0]) << 16 | int(hz[1]) << 8 | int(hz[2])

d = root / 'data' / 'maps' / MID; d.mkdir(parents=True, exist_ok=True)
mis = d / 'missions.json'
m = {'ar': M['ar'], 'en': M['en'], 'w': W, 'h': H, 'road': road, 'far': {'x0': round(x0, 2), 'y0': round(y0, 2), 'size': SIZE, 'n': N},
     'ground': ground, 'haze': haze, 'hover': M['hover'], 'pad': True, 'missions': json.loads(mis.read_text()) if mis.exists() else []}
(d / 'map.json').write_text(json.dumps(m, ensure_ascii=False))
print('map.json written; plot at', px, py, '; ground', hex(ground), 'haze', hex(haze))
