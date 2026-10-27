"""The ground around the theatre, for the F-15SA's view from altitude (docs/ASSETS.md, «أرض المنطقة»).

  python3 tools/make_region.py      # build/region_inner.png, the game's region.jpg and outer1-3.jpg, and their places

Inputs (assets/originals/terrain/):
  theatre_zoom1.png        the generator's zoom-out around the theatre (1254 px, about 4.4 km)
  theatre_zoom1_x3/c_r.png the same, regenerated at 3x in a 3 x 3 grid (column_row, 1254 px each, about 1.17 m/px)
  theatre_zoom2.png        a zoom-out of theatre_zoom1 (1254 px, about 8.3 km)
  theatre_zoom3.png        a zoom-out of theatre_zoom2 (16.8 km; it came at 4096 px, an upscale of about 2048: kept at 2048)
  theatre_zoom4.png        a zoom-out of theatre_zoom3 (33.5 km; the same)
The theatre itself is maps/theater/tiles/0 (2814 x 2822 px at 0.85 m/px).

1. The nine tiles are laid on their grid. Each was detailed on its own, so their colour drifts a little and their
   seams show: the low frequencies (blur sigma 24 px, about 28 m) are taken from the zoom-out, the detail from the tiles.
2. The theatre is found in the result (SIFT against the zoom-out, refined by ECC on the region, then the nearest turn
   and scale) and put back over the generator's redrawing of it, faded in over its outer 60 px (about 50 m), so the
   playable map stays the game's own pixels; all but its eastern plain (see keep()).
3. The three zoom-outs round it (outer()): each found in the next (SIFT, then ECC), its colour brought to the one inside
   it, and each picture faded at its edge into the next one out, so the game simply stacks them, opaque.
4. For the game: maps/theater/tiles/region.jpg and outer1-3.jpg, and their places in the theatre ('region' and 'outer'
   in data/maps/theater/map.json), and outer_far.jpg, a soft copy of the last one that the game mirrors round it.
Needs opencv-python-headless (pip).
"""
import os
import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TER = os.path.join(ROOT, 'assets', 'originals', 'terrain')
OUT = os.path.join(ROOT, 'build')
MPP = 0.85                                     # the theatre's metres per pixel


def theatre():
    d = os.path.join(ROOT, 'maps', 'theater', 'tiles', '0')
    tiles = {tuple(map(int, f[:-4].split('_'))): cv2.imread(os.path.join(d, f)) for f in os.listdir(d) if f.endswith('.jpg')}
    s = tiles[(0, 0)].shape[1]                     # edge tiles are narrower
    nx, ny = max(k[0] for k in tiles) + 1, max(k[1] for k in tiles) + 1
    im = np.zeros((ny * s, nx * s, 3), np.uint8)
    for (x, y), t in tiles.items(): im[y * s:y * s + t.shape[0], x * s:x * s + t.shape[1]] = t
    return im[:2822, :2814]


def mosaic():
    T = cv2.imread(os.path.join(TER, 'theatre_zoom1_x3', '0_0.png')).shape[0]
    m = np.zeros((3 * T, 3 * T, 3), np.uint8)
    for c in range(3):
        for r in range(3):
            m[r * T:(r + 1) * T, c * T:(c + 1) * T] = cv2.imread(os.path.join(TER, 'theatre_zoom1_x3', f'{c}_{r}.png'))
    z = cv2.imread(os.path.join(TER, 'theatre_zoom1.png'))
    zu = cv2.resize(z, (m.shape[1], m.shape[0]), interpolation=cv2.INTER_CUBIC).astype(np.float32)
    mf = m.astype(np.float32)
    lo = lambda a: cv2.GaussianBlur(a, (0, 0), 24)
    return np.clip(mf - lo(mf) + lo(zu), 0, 255).astype(np.uint8)


def place(core, reg):
    # coarse: SIFT between the theatre and the zoom-out, both near 3.5 m/px (big shapes match there; the generator
    # redrew the fine texture); then fine: ECC on the region at half size, an affine started from the coarse answer
    z = cv2.imread(os.path.join(TER, 'theatre_zoom1.png'))
    f0 = MPP / 3.51
    g1 = cv2.cvtColor(cv2.resize(core, None, fx=f0, fy=f0, interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    g2 = cv2.cvtColor(z, cv2.COLOR_BGR2GRAY)
    sift = cv2.SIFT_create(8000)
    k1, d1 = sift.detectAndCompute(g1, None); k2, d2 = sift.detectAndCompute(g2, None)
    good = [a for a, b in cv2.BFMatcher().knnMatch(d1, d2, k=2) if a.distance < 0.75 * b.distance]
    src = np.float32([k1[a.queryIdx].pt for a in good]) / f0
    dst = np.float32([k2[a.trainIdx].pt for a in good]) * (reg.shape[1] / z.shape[1])
    M, inl = cv2.estimateAffinePartial2D(src, dst, method=cv2.RANSAC, ransacReprojThreshold=12)
    # fine
    h = 0.5
    S = np.array([[h, 0, 0], [0, h, 0], [0, 0, 1]])
    Mh = (S @ np.vstack([M, [0, 0, 1]]))[:2].astype(np.float32)
    rg = cv2.cvtColor(cv2.resize(reg, None, fx=h, fy=h, interpolation=cv2.INTER_AREA), cv2.COLOR_BGR2GRAY)
    cg = cv2.cvtColor(core, cv2.COLOR_BGR2GRAY)
    tpl = cv2.warpAffine(cg, Mh, (rg.shape[1], rg.shape[0]))
    mask = cv2.warpAffine(np.full(cg.shape, 255, np.uint8), Mh, (rg.shape[1], rg.shape[0]))
    blur = lambda a: cv2.GaussianBlur(a.astype(np.float32), (0, 0), 3)
    D = np.eye(2, 3, dtype=np.float32)
    try:
        _, D = cv2.findTransformECC(blur(tpl), blur(rg), D, cv2.MOTION_AFFINE, (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), mask, 5)
        # D takes the template's pixels (the warped theatre) to the input's (the region): theatre -> region is Mh, then D
        Mh = (np.vstack([D, [0, 0, 1]]) @ np.vstack([Mh, [0, 0, 1]]))[:2]
    except cv2.error as e:
        print('ECC did not converge, keeping the coarse fit:', e)
    M = (np.linalg.inv(S) @ np.vstack([Mh, [0, 0, 1]]))[:2]
    # the game lays the region as a turned square: the nearest turn and scale, about the theatre's centre, so the
    # theatre pasted into it lands on the game's own map tiles
    p, q = (M[0, 0] + M[1, 1]) / 2, (M[1, 0] - M[0, 1]) / 2
    c = np.array([core.shape[1] / 2, core.shape[0] / 2, 1.0])
    A = np.array([[p, -q], [q, p]])
    M = np.hstack([A, (M @ c - A @ c[:2])[:, None]])
    return M, int(inl.sum()), len(good)


def keep(core):
    """How much of the theatre to keep (0..1, in its own pixels). Its edges fade over 60 px. Its eastern band from
    x ≈ 1820 is the quilted gravel plain make_theater.py made to carry the air base: next to the generator's real
    plain it reads as a flat grey rectangle, so the region's own terrain takes it, on a wavy line (±40 px) faded over
    100 px, except the air base (inside its fence, and 20 px past it) and its access road. Returns (keep, plain): plain
    is 1 where what is kept is the base on the plain, whose colour is then brought to the region's."""
    H, W = core.shape[:2]
    inside = np.zeros((H, W), np.uint8); inside[1:-1, 1:-1] = 255
    edge = np.clip(cv2.distanceTransform(inside, cv2.DIST_L2, 5) / 60, 0, 1)
    y = np.arange(H)[:, None]; x = np.arange(W)[None, :]
    line = 1820 + 28 * np.sin(y / 170.0) + 12 * np.sin(y / 47.0 + 1.3)
    west = np.clip((line - x) / 100 + 0.5, 0, 1)
    base = np.zeros((H, W), np.uint8); cv2.rectangle(base, (2162 - 20, 942 - 20), (2476 + 20, 1826 + 20), 255, -1)
    # the access road: the darkest line (asphalt) in the band it crosses the plain in, column by column
    g = cv2.GaussianBlur(cv2.cvtColor(core, cv2.COLOR_BGR2GRAY), (0, 0), 1.5).astype(np.float32)
    for xx in range(1700, 2170):
        yy = 1330 + int(np.argmin(g[1330:1430, xx]))
        cv2.line(base, (xx, yy - 9), (xx, yy + 9), 255, 1)
    base = np.clip(cv2.GaussianBlur(base.astype(np.float32) / 255, (0, 0), 4) * 1.6, 0, 1)
    return (edge * np.maximum(west, base)).astype(np.float32), (1 - west).astype(np.float32)

H3 = lambda M: np.vstack([M, [0, 0, 1]])


def similar(a, b):
    """Where a lies in b, a zoom-out of it: a's pixels -> b's, a turn, a scale and a shift. SIFT + RANSAC; then ECC on
    b's frame at half and at full size refines the turn and the shift (the scale stays SIFT's)."""
    sift = cv2.SIFT_create(10000)
    ga, gb = (cv2.cvtColor(x, cv2.COLOR_BGR2GRAY) for x in (a, b))
    k1, d1 = sift.detectAndCompute(ga, None); k2, d2 = sift.detectAndCompute(gb, None)
    good = [p for p, q in cv2.BFMatcher().knnMatch(d1, d2, k=2) if p.distance < 0.75 * q.distance]
    M, inl = cv2.estimateAffinePartial2D(np.float32([k1[p.queryIdx].pt for p in good]), np.float32([k2[p.trainIdx].pt for p in good]),
                                         method=cv2.RANSAC, ransacReprojThreshold=4, maxIters=20000)
    blur = lambda x: cv2.GaussianBlur(x.astype(np.float32), (0, 0), 2)
    for h in (0.5, 1.0):
        S = np.diag([h, h, 1.0]); Mh = (S @ H3(M))[:2].astype(np.float32)
        gs = cv2.resize(gb, None, fx=h, fy=h, interpolation=cv2.INTER_AREA) if h < 1 else gb
        tpl = cv2.warpAffine(ga, Mh, gs.shape[::-1], flags=cv2.INTER_AREA)
        mask = cv2.erode(cv2.warpAffine(np.full(ga.shape, 255, np.uint8), Mh, gs.shape[::-1]), np.ones((9, 9), np.uint8))
        _, D = cv2.findTransformECC(blur(tpl), blur(gs), np.eye(2, 3, dtype=np.float32), cv2.MOTION_EUCLIDEAN,
                                    (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 300, 1e-7), mask, 5)
        M = (np.linalg.inv(S) @ H3(D) @ H3(Mh))[:2]           # (D takes the template's pixels to b's)
    return M, int(inl.sum()), len(good)


def down(a, P, shape):
    """a seen in another picture's pixels (P: a's pixels -> its), smoothed first where it shrinks"""
    k = np.hypot(P[0, 0], P[1, 0])
    if k < 1: a = cv2.GaussianBlur(a, (0, 0), 0.5 / k)
    return cv2.warpAffine(a, P, (shape[1], shape[0]), flags=cv2.INTER_LINEAR)


def fade(n, band):
    """0 at a square picture's edge to 1 at band px in, smoothly"""
    i = np.arange(n, dtype=np.float32)
    d = np.minimum(i, n - 1 - i)
    t = np.clip(np.minimum(d[:, None], d[None, :]) / band, 0, 1)
    return (t * t * (3 - 2 * t))[..., None]


def outer(reg, M):
    """The three zoom-outs round the region: their pixels -> the theatre's (T), their colour brought to the picture
    inside each, and each picture's edge faded into the next one out; the last one's into a soft copy of itself (blur
    sigma 3 % of its side, about 1 km), which the game lays round it in mirror copies out to the horizon, so the sea
    stays sea and the land land. reg: the region (build/region_inner.png); M: the theatre's pixels -> reg's.
    Returns the four pictures (reg first), their T, and the soft copy."""
    z = [cv2.imread(os.path.join(TER, f'theatre_zoom{i}.png')) for i in (1, 2, 3, 4)]
    # reg is theatre_zoom1 at 3x: zoom1's pixel x is reg's 3x + 1 (cv2.resize's pixel centres)
    Z2R = np.array([[3.0, 0, 1], [0, 3.0, 1]])
    L, T, P = [reg], [cv2.invertAffineTransform(M)], [None]
    for i in range(3):
        Mi, ni, ng = similar(z[i], z[i + 1])
        Pk = (H3(Mi) @ H3(cv2.invertAffineTransform(Z2R)))[:2] if i == 0 else Mi      # the picture inside -> this one
        L.append(z[i + 1]); P.append(Pk); T.append((H3(T[-1]) @ np.linalg.inv(H3(Pk)))[:2])
        sk = np.hypot(T[-1][0, 0], T[-1][1, 0])
        print(f'theatre_zoom{i + 2}: {ni}/{ng} matches in it of theatre_zoom{i + 1}; {z[i + 1].shape[1] * sk * MPP / 1000:.1f} km across, '
              f'{sk * MPP:.1f} m/px, turned {np.degrees(np.arctan2(T[-1][1, 0], T[-1][0, 0])):+.2f}°')
    # colour: each zoom-out's mean and spread, channel by channel, to the picture inside it, where they overlap
    for k in range(1, 4):
        a = down(L[k - 1], P[k], L[k].shape)
        m = cv2.erode(down(np.full(L[k - 1].shape[:2], 255, np.uint8), P[k], L[k].shape), np.ones((9, 9), np.uint8)) > 0
        A, B = a[m].astype(np.float32), L[k][m].astype(np.float32)
        L[k] = np.clip((L[k] - B.mean(0)) * (A.std(0) / B.std(0)) + A.mean(0), 0, 255).astype(np.uint8)
    # edges, from the outside in: the last picture's outer 12 % into its soft copy (blurred with mirrored borders, as
    # the game mirrors it); each one inside, its outer 8 % into the one round it (seen in its pixels), so at its very
    # edge it is that picture
    n = L[3].shape[0]; f = fade(n, 0.12 * n)
    soft = cv2.GaussianBlur(L[3].astype(np.float32), (0, 0), 0.03 * n, borderType=cv2.BORDER_REFLECT)
    L[3] = np.clip(L[3] * f + soft * (1 - f), 0, 255).astype(np.uint8)
    for k in (2, 1, 0):
        n = L[k].shape[0]; f = fade(n, 0.08 * n)
        up = cv2.warpAffine(L[k + 1], P[k + 1], (n, n), flags=cv2.INTER_CUBIC | cv2.WARP_INVERSE_MAP)
        L[k] = np.clip(L[k] * f + up * (1 - f), 0, 255).astype(np.uint8)
    return L, T, np.clip(soft, 0, 255).astype(np.uint8)


def placeof(T, n):
    """where a picture of n px lies in the theatre (T: its pixels -> the theatre's): its centre, its side, its turn
    (radians, image axes: the theatre's to its)"""
    c = T @ np.array([(n - 1) / 2, (n - 1) / 2, 1.0])
    return {'cx': round(float(c[0]), 1), 'cy': round(float(c[1]), 1), 'size': round(float(n * np.hypot(T[0, 0], T[1, 0])), 1),
            'rot': round(float(-np.arctan2(T[1, 0], T[0, 0])), 5)}


def main():
    os.makedirs(OUT, exist_ok=True)
    reg, core = mosaic(), theatre()
    M, ni, ng = place(core, reg)
    s, rot = np.hypot(M[0, 0], M[1, 0]), np.degrees(np.arctan2(M[1, 0], M[0, 0]))
    print(f'theatre in the region: {ni}/{ng} matches, scale {s:.4f} ({MPP / s:.3f} m/px), rotation {rot:.2f}°, origin {M[:, 2].round(1)}')
    H, W = reg.shape[:2]
    warp = cv2.warpAffine(core, M, (W, H), flags=cv2.INTER_LANCZOS4)
    k, plain = keep(core)
    a = cv2.warpAffine(k, M, (W, H))[..., None]
    pl = cv2.warpAffine(plain, M, (W, H))[..., None]
    # the base on the plain: its ground's colour (blurred over 80 px) taken to the region's there
    lo = lambda x: cv2.GaussianBlur(x, (0, 0), 80)
    wf = warp.astype(np.float32)
    wf = wf + pl * (lo(reg.astype(np.float32)) - lo(wf))
    out = np.clip(wf * a + reg * (1 - a), 0, 255).astype(np.uint8)
    cv2.imwrite(os.path.join(OUT, 'region_inner.png'), out)
    print('region', W, 'x', H, 'px,', f'{W * MPP / s / 1000:.2f} km across; build/region_inner.png')
    L, T, soft = outer(out, M)
    # for the game (the F-15SA's view through the canopy and its TSD), and where each lies in the theatre's pixels:
    #   region.jpg  1536 px (2.9 m/px; from 15,000 ft the glass shows some 5 m a screen pixel)
    #   outer1.jpg  1254 px (6.6 m/px, as it came), outer2.jpg and outer3.jpg 1536 px (11 and 22 m/px: seen from 8 km
    #   and 16 km on, where a screen pixel spans some 10 and 20 m across the view)
    #   outer_far.jpg  the last one's soft copy, 256 px: mirrored round it to the horizon
    tiles = os.path.join(ROOT, 'maps', 'theater', 'tiles')
    for k, (name, n) in enumerate((('region', 1536), ('outer1', 1254), ('outer2', 1536), ('outer3', 1536))):
        cv2.imwrite(os.path.join(tiles, name + '.jpg'), cv2.resize(L[k], (n, n), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 84])
    cv2.imwrite(os.path.join(tiles, 'outer_far.jpg'), cv2.resize(soft, (256, 256), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 90])
    mj = os.path.join(ROOT, 'data', 'maps', 'theater', 'map.json')
    import json
    m = json.load(open(mj))
    m['region'] = placeof(T[0], W)
    m['outer'] = [placeof(T[k], L[k].shape[0]) for k in (1, 2, 3)]
    json.dump(m, open(mj, 'w'), ensure_ascii=False)
    print('in the theatre: region', m['region'], '; outer', m['outer'])

if __name__ == '__main__':
    main()
