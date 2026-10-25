"""Far-field terrain around the playable map: a 6 x 6 km ground image seen through the Apache canopy.

  python3 tools/make_farfield.py            # writes tiles/far/<x>_<y>.jpg (4 x 4 tiles, 1024 px, mipmappable) and tiles/far/tsd.jpg
  python3 tools/make_farfield.py --keep     # also keeps build/farfield_6km.png for inspection

Inputs (assets/originals/):
  valley_map.png            the playable map; stays untouched, pixel for pixel, at the centre
  terrain/zoomout_a.png     an AI "zoom out" of the valley: the original sits inside it at 0.605 scale
  terrain/zoomout_b/c.png   further top-down samples in the same style
  terrain/nadir_d.png       a strictly overhead sample (about 2 m per pixel)

Steps:
  1. put the original map back into zoomout_a (the generator redraws the centre; we keep ours)
  2. lay the samples around it on a 1.5 m/px canvas, colour-matched, Laplacian-blended along wandering seams.
     Samples are only ever transposed, never mirrored, so shadows keep falling to the lower right.
  3. the main road: pieces slide sideways until their roads meet; two joints that still broke are painted in
  4. cut into tiles
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
Image.MAX_IMAGE_PIXELS = None
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
O = os.path.join(ROOT, 'assets', 'originals')

MPP = 1.5                  # canvas metres per pixel
N = 4000                   # canvas side: 6 km
CORE_MPP = 0.85            # original map metres per pixel
# where the original map sits inside zoomout_a (found by normalised cross-correlation over scale and position)
ZA_SCALE, ZA_X, ZA_Y = 0.605, 338, 153
rng = np.random.default_rng(7)


def step1_core():
    big = Image.open(f'{O}/terrain/zoomout_a.png').convert('RGB')
    src = Image.open(f'{O}/valley_map.png').convert('RGB')
    f = 1 / ZA_SCALE
    W, H = round(big.width * f), round(big.height * f)
    bg = np.asarray(big.resize((W, H), Image.LANCZOS)).astype(np.float32)
    ox, oy = round(ZA_X * f), round(ZA_Y * f)
    S = np.asarray(src).astype(np.float32)
    reg = bg[oy:oy + src.height, ox:ox + src.width]
    bg = (bg - reg.mean((0, 1))) / reg.std((0, 1)) * S.std((0, 1)) + S.mean((0, 1))
    F = 70
    yy = np.minimum(np.arange(src.height), src.height - 1 - np.arange(src.height))[:, None]
    xx = np.minimum(np.arange(src.width), src.width - 1 - np.arange(src.width))[None, :]
    m = np.clip(np.minimum(yy, xx) / F, 0, 1); m = m * m * (3 - 2 * m)
    out = bg.copy()
    out[oy:oy + src.height, ox:ox + src.width] = S * m[..., None] + bg[oy:oy + src.height, ox:ox + src.width] * (1 - m[..., None])
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8)), ox, oy


def load(im, mpp, transpose=False):
    if isinstance(im, str): im = Image.open(im)
    im = im.convert('RGB')
    if transpose: im = im.transpose(Image.TRANSPOSE)   # keeps shadows falling to the lower right
    f = mpp / MPP
    return np.asarray(im.resize((round(im.width * f), round(im.height * f)), Image.LANCZOS)).astype(np.float32), f


def down(a):
    h, w = a.shape[:2]; a = a[:h // 2 * 2, :w // 2 * 2]
    return (a[0::2, 0::2] + a[1::2, 0::2] + a[0::2, 1::2] + a[1::2, 1::2]) / 4


def up(a, shape):
    return np.stack([np.asarray(Image.fromarray(a[..., c]).resize((shape[1], shape[0]), Image.BILINEAR)) for c in range(a.shape[2])], -1)


def lap_blend(A, B, M, levels=6):
    ga, gb, gm = [A], [B], [M]
    for _ in range(levels): ga.append(down(ga[-1])); gb.append(down(gb[-1])); gm.append(down(gm[-1]))
    out = ga[-1] * (1 - gm[-1]) + gb[-1] * gm[-1]
    for i in range(levels - 1, -1, -1):
        la = ga[i] - up(ga[i + 1], ga[i].shape); lb = gb[i] - up(gb[i + 1], gb[i].shape)
        out = up(out, ga[i].shape) + la * (1 - gm[i]) + lb * gm[i]
    return out


def noisy_mask(h, w, feather):
    # soft rectangle whose edge wanders, so seams never run straight
    yy = np.minimum(np.arange(h), h - 1 - np.arange(h))[:, None].astype(np.float32)
    xx = np.minimum(np.arange(w), w - 1 - np.arange(w))[None, :].astype(np.float32)
    n = rng.normal(0, 1, (max(2, h // 64), max(2, w // 64))).astype(np.float32)
    n = np.asarray(Image.fromarray(n).resize((w, h), Image.BICUBIC)) * feather * 0.45
    return np.clip((np.minimum(yy, xx) + n - feather * 0.6) / (feather * 0.8), 0, 1)


canvas = np.zeros((N, N, 3), np.float32); cov = np.zeros((N, N), np.float32)


def paint(img, x, y, feather=140):
    h, w = img.shape[:2]
    x0, y0 = max(0, x), max(0, y); x1, y1 = min(N, x + w), min(N, y + h)
    if x1 <= x0 or y1 <= y0: return
    sub = img[y0 - y:y1 - y, x0 - x:x1 - x]
    m = noisy_mask(h, w, feather)[y0 - y:y1 - y, x0 - x:x1 - x]
    m = np.where(cov[y0:y1, x0:x1] > 0, m, 1.0)   # empty canvas: take the whole patch outright
    A = np.where(cov[y0:y1, x0:x1, None] > 0, canvas[y0:y1, x0:x1], sub)
    canvas[y0:y1, x0:x1] = lap_blend(A, sub, m[..., None])
    cov[y0:y1, x0:x1] = np.maximum(cov[y0:y1, x0:x1], m)


def ridge(a):
    # light, warm, thin: the dirt road. Horizontal box mean, since the road runs roughly north-south
    v = a @ np.array([0.299, 0.587, 0.114], np.float32) + 1.5 * (a[..., 0] - a[..., 2])
    c = np.cumsum(np.pad(v, ((0, 0), (16, 15)), mode='edge'), 1)
    return np.maximum(v - (c[:, 31:] - c[:, :-31]) / 31 - 8, 0)


def slide(U, xu, yu, L, xl, yl, move_upper, xg, span=140):
    # slide one piece sideways until the road features in the overlap band agree
    r0, r1 = max(yu, yl), min(yu + U.shape[0], yl + L.shape[0])
    RU = ridge(U[r0 - yu:r1 - yu]); RL = ridge(L[r0 - yl:r1 - yl]); best = (-1, xg)
    for x in range(xg - span, xg + span + 1, 2):
        au, al = (x, xl) if move_upper else (xu, x)
        a0, a1 = max(au, al), min(au + U.shape[1], al + L.shape[1])
        if a1 - a0 < 400: continue
        v = float((RU[:, a0 - au:a1 - au] * RL[:, a0 - al:a1 - al]).sum()) / (a1 - a0)
        if v > best[0]: best = (v, x)
    return best[1]


def hermite(a, ta, b, tb):
    L = b[1] - a[1]; n = int(abs(L)) * 4; pts = []
    for i in range(n + 1):
        t = i / n; h00 = 2*t**3 - 3*t**2 + 1; h10 = t**3 - 2*t**2 + t; h01 = -2*t**3 + 3*t**2; h11 = t**3 - t**2
        pts.append((h00*a[0] + h10*ta*L + h01*b[0] + h11*tb*L, a[1] + L*t))
    return np.array(pts)


def paint_road(img, a, ta, b, tb):
    P = hermite(a, ta, b, tb)
    def sample(p):
        x, y = int(round(p[0])), int(round(p[1])); patch = img[y - 2:y + 3, x - 2:x + 3].reshape(-1, 3)
        return patch[np.argsort(patch.sum(1))[-8:]].mean(0)
    ca, cb = sample(a), sample(b)
    x0, x1 = int(P[:, 0].min()) - 8, int(P[:, 0].max()) + 9; y0, y1 = int(P[:, 1].min()) - 8, int(P[:, 1].max()) + 9
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    d = np.full(yy.shape, 1e9, np.float32); tpar = np.zeros(yy.shape, np.float32)
    for i, (px, py) in enumerate(P[::2]):
        dd = (xx - px) ** 2 + (yy - py) ** 2; m = dd < d; d[m] = dd[m]; tpar[m] = i * 2 / (len(P) - 1)
    d = np.sqrt(d)
    # dirt track ~5 m wide: solid core, soft dusty shoulders, faint darker wheel ruts, ground texture showing through
    w = 2.1 + 0.25 * np.sin(tpar * 37.0)
    alpha = np.clip((w + 1.3 - d) / 1.3, 0, 1) * 0.92
    rut = 1 - 0.07 * np.exp(-((d - 0.9) ** 2) / 0.15)
    col = (ca[None, None] * (1 - tpar[..., None]) + cb[None, None] * tpar[..., None]) * rut[..., None]
    sub = img[y0:y1, x0:x1]
    grain = (sub.mean(2, keepdims=True) - sub.mean()) / max(1.0, sub.mean()) * 0.25 + 1
    img[y0:y1, x0:x1] = sub * (1 - alpha[..., None]) + col * grain * alpha[..., None]


def main():
    core_im, cox, coy = step1_core()
    core, fc = load(core_im, CORE_MPP)
    ref_mean, ref_std = core.reshape(-1, 3).mean(0), core.reshape(-1, 3).std(0)
    match = lambda a: (a - a.reshape(-1, 3).mean(0)) / a.reshape(-1, 3).std(0) * ref_std + ref_mean
    T = f'{O}/terrain/'
    v1, f1 = load(T + 'zoomout_a.png', 1.4); v2, f2 = load(T + 'zoomout_b.png', 1.5); v3, f3 = load(T + 'zoomout_c.png', 1.5); s5, f5 = load(T + 'nadir_d.png', 2.0)
    v1t, _ = load(T + 'zoomout_a.png', 1.4, True); v2t, _ = load(T + 'zoomout_b.png', 1.5, True); v3t, _ = load(T + 'zoomout_c.png', 1.5, True); s5t, _ = load(T + 'nadir_d.png', 2.0, True)
    v1, v2, v3, s5, v1t, v2t, v3t, s5t = map(match, (v1, v2, v3, s5, v1t, v2t, v3t, s5t))
    # base fill: a loose grid, then extra patches between cells, then whatever is still empty
    base = [v2t, s5t, v1t, s5, v3t, v1, v3t, v2t, s5t]
    for i, (gy, gx) in enumerate([(r, c) for r in range(3) for c in range(3)]):
        img = base[i]; h, w = img.shape[:2]
        paint(img, int((gx + 0.5) * N / 3 - w / 2 + rng.integers(-120, 120)), int((gy + 0.5) * N / 3 - h / 2 + rng.integers(-120, 120)), 220)
    for img, cx, cy in [(v1t, 700, 2000), (v2t, 3300, 2000), (s5t, 2000, 700), (v3t, 2000, 3300)]:
        h, w = img.shape[:2]; paint(img, cx - w // 2, cy - h // 2, 220)
    pool = [v1t, s5, v2t, v3t, s5t, v1]
    for it in range(60):
        ys, xs = np.nonzero(cov[::16, ::16] == 0)
        if not len(ys): break
        j = rng.integers(len(ys)); img = pool[it % len(pool)]; h, w = img.shape[:2]
        paint(img, int(xs[j] * 16 - w / 2 + rng.integers(-150, 150)), int(ys[j] * 16 - h / 2 + rng.integers(-150, 150)), 220)
    # the road corridor, north and south of the core
    ch, cw = core.shape[:2]; cx0, cy0 = (N - cw) // 2, (N - ch) // 2
    road_top = cx0 + 1543 * fc; road_bot = cx0 + 1404 * fc; ov = 170
    y3 = int(cy0 + ov - v3.shape[0]); x3 = slide(v3, 0, y3, core, cx0, cy0, True, int(road_top - 874 * f3)); paint(v3, x3, y3)
    y1 = int(y3 + ov - v1.shape[0]); x1 = slide(v1, 0, y1, v3, x3, y3, True, int(x3 + 828 * f3 - 876 * f1)); paint(v1, x1, y1)
    y2 = int(cy0 + ch - ov); x2 = slide(core, cx0, cy0, v2, 0, y2, False, int(road_bot - 917 * f2)); paint(v2, x2, y2)
    y5 = int(y2 + v2.shape[0] - ov); x5 = slide(v2, x2, y2, s5, 0, y5, False, int(x2 + 873 * f2 - 671 * f5)); paint(s5, x5, y5)
    paint(core, cx0, cy0, 90)
    img = canvas
    # two joints where the road still broke: hand-picked ends on the canvas, the south end on the core's own road
    road = json.load(open(os.path.join(ROOT, 'data', 'road.json')))
    tocv = lambda p: (cx0 + (cox + p[0]) * fc, cy0 + (coy + p[1]) * fc)
    bx, by = tocv(road[20]); b2 = tocv(road[24])
    paint_road(img, (2093, 1560), 0.3, (bx, by), (b2[0] - bx) / (b2[1] - by))
    paint_road(img, (2028, 760), 0.35, (2096, 930), -0.15)
    out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    if '--keep' in sys.argv:
        os.makedirs(os.path.join(ROOT, 'build'), exist_ok=True); out.save(os.path.join(ROOT, 'build', 'farfield_6km.png'))
    # 4 x 4 tiles of 1000 canvas px, resampled to 1024 so the GPU can mipmap them for the oblique cockpit view
    d = os.path.join(ROOT, 'tiles', 'far'); os.makedirs(d, exist_ok=True)
    for ty in range(4):
        for tx in range(4):
            out.crop((tx * 1000, ty * 1000, tx * 1000 + 1000, ty * 1000 + 1000)).resize((1024, 1024), Image.LANCZOS).save(f'{d}/{tx}_{ty}.jpg', quality=80, optimize=True)
    # whole area at low resolution: imagery underlay for the tactical situation display (TSD) page
    out.resize((1024, 1024), Image.LANCZOS).save(f'{d}/tsd.jpg', quality=82, optimize=True)
    # where the original map's (0,0) lands, for the game: canvas px -> map px is 1 / fc
    print('FAR origin (map px) x0 = %.2f, y0 = %.2f, size = %.2f map px' % (-(cx0 + cox * fc) / fc, -(cy0 + coy * fc) / fc, N / fc))


if __name__ == '__main__':
    main()
