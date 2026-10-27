"""The region around the theatre, for the F-15SA's view from altitude (docs/ASSETS.md, «أرض المنطقة»).

  python3 tools/make_region.py      # build/region_inner.png and the theatre's place in it

Inputs (assets/originals/terrain/):
  theatre_zoom1.png        the generator's zoom-out around the theatre (1254 px, about 4.4 km)
  theatre_zoom1_x3/c_r.png the same, regenerated at 3x in a 3 x 3 grid (column_row, 1254 px each, about 1.17 m/px)
The theatre itself is maps/theater/tiles/0 (2814 x 2822 px at 0.85 m/px).

1. The nine tiles are laid on their grid. Each was detailed on its own, so their colour drifts a little and their
   seams show: the low frequencies (blur sigma 24 px, about 28 m) are taken from the zoom-out, the detail from the tiles.
2. The theatre is found in the result (SIFT against the zoom-out, refined by ECC on the region: an affine) and put back
   over the generator's redrawing of it, faded in over its outer 60 px (about 50 m), so the playable map stays the
   game's own pixels; all but its eastern plain (see keep()).
3. For the game: maps/theater/tiles/region.jpg (2048 px) and its place in the theatre ('region' in data/maps/theater/map.json).
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
        # D maps the region to the warped theatre: theatre -> region is Mh followed by D's inverse
        Di = cv2.invertAffineTransform(D)
        Mh = (np.vstack([Di, [0, 0, 1]]) @ np.vstack([Mh, [0, 0, 1]]))[:2]
    except cv2.error as e:
        print('ECC did not converge, keeping the coarse fit:', e)
    M = (np.linalg.inv(S) @ np.vstack([Mh, [0, 0, 1]]))[:2]
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
    # for the game (the F-15SA's view through the canopy and its TSD): 1536 px (2.9 m/px; from 20,000 ft the glass
    # shows some 6 m a screen pixel), and where it lies in the theatre's pixels: its centre, its side, its turn
    # (radians, image axes), into data/maps/theater/map.json
    cv2.imwrite(os.path.join(ROOT, 'maps', 'theater', 'tiles', 'region.jpg'), cv2.resize(out, (1536, 1536), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 84])
    Mi = cv2.invertAffineTransform(M)
    c = Mi @ np.array([W / 2, H / 2, 1.0])
    mj = os.path.join(ROOT, 'data', 'maps', 'theater', 'map.json')
    import json
    m = json.load(open(mj))
    m['region'] = {'cx': round(float(c[0]), 1), 'cy': round(float(c[1]), 1), 'size': round(float(W / s), 1), 'rot': round(float(np.arctan2(M[1, 0], M[0, 0])), 5)}
    json.dump(m, open(mj, 'w'), ensure_ascii=False)
    print('region in the theatre:', m['region'], '; maps/theater/tiles/region.jpg')


if __name__ == '__main__':
    main()
