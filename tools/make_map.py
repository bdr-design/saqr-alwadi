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
root = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / 'tools'))
from mapkit import T, save_level as _save, grain as _grain, ruin, atlas, far_field
Image.MAX_IMAGE_PIXELS = None
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
def save_level(img, L, q): _save(img, out / 'tiles' / str(L), q)
def grain(img, s): return _grain(rng, img, s)
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
SIZE = 7058.82; N = 4
# near the edges the map folded outward; further out random patches of that side's own ground (mapkit.far_field):
# 'fold_x' the west and east strips' widths (on a coast the sea runs on to the horizon instead of the land coming
# back across it as a strait, and the road is not repeated beside itself); 'band_n' / 'band_s' the rows north and
# south patches come from, where the edge itself is built up
x0, y0 = far_field(rng, src, SIZE, out / 'tiles' / 'far', M.get('fold_x'), M.get('band_n'), M.get('band_s'), N)

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
blds = []
if M.get('blds'):
    blds, AW, AH = atlas([(b, *ruin(x4, rng, *b)) for b in M['blds']], out / 'ruins.webp')
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
