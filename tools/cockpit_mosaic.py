"""The F-15 cockpit photo at twice its size, from the four tiles the owner regenerated (tools/cockpit_tiles.py gave
him the tiles and their prompts).

  python3 tools/cockpit_mosaic.py day <dir with day_1.png .. day_4.png>     # -> assets/originals/cockpit/f15ex_day_2x.png
  python3 tools/make_cockpit.py                                             # the overlay, from the 2x photo if there is one

Each tile is put back where it came from on the original enlarged 2x (3344 x 1882): first a homography from SIFT
matches (RANSAC), then refined by ECC on the blurred picture with the chroma-key areas masked out, so nothing in the
cockpit moves (a tile that would move more than a few pixels anywhere is refused). The tiles are blended over their
overlaps with weights that fall to zero at each tile's edge; their low frequencies (exposure, colour) are taken from
the original, so no seam or patch of light shows where the generator lit a tile differently. The magenta glass and the
green screens are set back to pure flat colour where the tiles agree they are.
"""
import os, sys
import cv2
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'originals', 'cockpit')
W, H = 940, 529                                          # a tile in the original (tools/cockpit_tiles.py)
TILES = {1: (0, 0), 2: (732, 0), 3: (0, 412), 4: (732, 412)}
K = 2                                                    # the new photo's scale


def keys(img):
    b, g, r = [img[..., i].astype(np.int32) for i in range(3)]
    mag = (np.minimum(r, b) - g) > 150
    grn = (g - np.maximum(r, b)) > 150
    return mag, grn


def place(tile, ref, x0, y0):
    """the homography taking the tile onto the 2x reference (whole-canvas coordinates)"""
    th, tw = tile.shape[:2]
    S = np.array([[K * W / tw, 0, K * x0], [0, K * H / th, K * y0], [0, 0, 1]], np.float64)
    gt = cv2.cvtColor(tile, cv2.COLOR_BGR2GRAY)
    m = 60                                               # the reference crop, with a margin
    X0, Y0 = max(0, K * x0 - m), max(0, K * y0 - m)
    crop = cv2.cvtColor(ref[Y0:K * (y0 + H) + m, X0:K * (x0 + W) + m], cv2.COLOR_BGR2GRAY)
    mk = lambda im: (~np.logical_or(*keys(im))).astype(np.uint8) * 255
    sift = cv2.SIFT_create(8000)
    ka, da = sift.detectAndCompute(gt, cv2.erode(mk(tile), np.ones((9, 9), np.uint8)))
    kb, db = sift.detectAndCompute(crop, cv2.erode(mk(ref[Y0:K * (y0 + H) + m, X0:K * (x0 + W) + m]), np.ones((9, 9), np.uint8)))
    good = [a for a, b in cv2.BFMatcher().knnMatch(da, db, k=2) if a.distance < 0.75 * b.distance]
    pa = np.float32([ka[g.queryIdx].pt for g in good]); pb = np.float32([kb[g.trainIdx].pt for g in good]) + [X0, Y0]
    Hm, inl = cv2.findHomography(pa, pb, cv2.RANSAC, 3.0)
    # (the matches must agree with where the tile was cut: a homography far from it is a wrong match)
    corners = np.float32([[0, 0], [tw, 0], [0, th], [tw, th]]).reshape(-1, 1, 2)
    off = np.abs(cv2.perspectiveTransform(corners, Hm) - cv2.perspectiveTransform(corners, S)).max()
    if off > 25: raise SystemExit(f'tile at {x0},{y0}: the matches put it {off:.0f} px from where it was cut')
    # ECC on the blurred pictures, the keys masked out, in the tile's own frame warped by the homography
    big = cv2.GaussianBlur(cv2.cvtColor(ref, cv2.COLOR_BGR2GRAY), (0, 0), 1.5).astype(np.float32)
    tg = cv2.GaussianBlur(gt, (0, 0), 1.5).astype(np.float32)
    mask = cv2.erode(mk(tile), np.ones((15, 15), np.uint8))
    try:
        _, Hr = cv2.findTransformECC(tg, big, Hm.astype(np.float32), cv2.MOTION_HOMOGRAPHY,
                                     (cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 200, 1e-6), mask, 5)
        Hm = Hr.astype(np.float64)
    except cv2.error:
        pass
    return Hm, int(inl.sum()), len(good)


def seam(a, b, valid, axis):
    """the least-difference path across an overlap (axis 1: a path running down, through columns; 0: across, through
    rows), as one coordinate per row (column) of the overlap"""
    d = np.abs(cv2.GaussianBlur(a, (0, 0), 1.5).astype(np.float32) - cv2.GaussianBlur(b, (0, 0), 1.5).astype(np.float32)).sum(2)
    d[~valid] = 1e4
    if axis == 0: d = d.T
    n, m = d.shape; C = d.copy(); back = np.zeros((n, m), np.int32)
    for i in range(1, n):
        l = np.r_[1e9, C[i - 1, :-1]]; c = C[i - 1]; r = np.r_[C[i - 1, 1:], 1e9]
        st = np.stack([l, c, r]); k = st.argmin(0); C[i] += st[k, np.arange(m)]; back[i] = np.arange(m) + k - 1
    path = np.zeros(n, np.int32); path[-1] = int(C[-1].argmin())
    for i in range(n - 1, 0, -1): path[i - 1] = back[i, path[i]]
    return path


def join(a, b, wa, wb, axis, lo, hi, F=24):
    """b over a beyond the seam found between lo and hi (columns for axis 1, rows for axis 0), feathered F px"""
    sl = (slice(None), slice(lo, hi)) if axis == 1 else (slice(lo, hi), slice(None))
    valid = (wa[sl] > 0.5) & (wb[sl] > 0.5)
    p = seam(a[sl], b[sl], valid, axis) + lo
    n = a.shape[0] if axis == 1 else a.shape[1]
    coord = np.arange(a.shape[1])[None, :] if axis == 1 else np.arange(a.shape[0])[:, None]
    pos = p[:, None] if axis == 1 else p[None, :]
    t = np.clip((coord - pos + F) / (2 * F), 0, 1)       # 0 on a's side, 1 on b's
    t = np.where(wb > 0.5, t, 0); t = np.where(wa > 0.5, t, 1)
    return a * (1 - t[..., None]) + b * t[..., None], np.maximum(wa, wb)


def despeckle(img, keep):
    """the generator's stray dots on the metal: small, compact, strongly orange, red or pink specks (not the gold or grey
    screw heads, which sit in rows), painted over from around them"""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    h, s_, v = hsv[..., 0].astype(int), hsv[..., 1].astype(int), hsv[..., 2].astype(int)
    m = (((h < 16) | (h > 150)) & (s_ > 120) & (v > 70) & keep).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(m, connectivity=8)
    a, w, hh = st[:, 4], st[:, 2], st[:, 3]
    ok = (a >= 2) & (a <= 60) & (np.maximum(w, hh) <= 14); ok[0] = False
    dots = ok[lab].astype(np.uint8)
    dots = cv2.dilate(dots, np.ones((3, 3), np.uint8))
    return cv2.inpaint(img, dots * 255, 3, cv2.INPAINT_TELEA), int(ok.sum())


def main():
    name, tdir = sys.argv[1], sys.argv[2]
    clean = '--clean' in sys.argv
    orig = cv2.imread(os.path.join(SRC, f'f15ex_{name}.png'))
    ref = cv2.resize(orig, (orig.shape[1] * K, orig.shape[0] * K), interpolation=cv2.INTER_LANCZOS4)
    Hh, Ww = ref.shape[:2]
    T = {}
    for k, (x0, y0) in TILES.items():
        tile = cv2.imread(os.path.join(tdir, f'{name}_{k}.png'))
        Hm, nin, ng = place(tile, ref, x0, y0)
        th, tw = tile.shape[:2]
        img = cv2.warpPerspective(tile, Hm, (Ww, Hh), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REFLECT).astype(np.float32)
        w = cv2.warpPerspective(np.ones((th, tw), np.float32), Hm, (Ww, Hh), flags=cv2.INTER_LINEAR)
        w = cv2.erode((w > 0.99).astype(np.uint8), np.ones((5, 5), np.uint8)).astype(np.float32)
        T[k] = (img, w)
        c = cv2.perspectiveTransform(np.float32([[0, 0], [tw, th]]).reshape(-1, 1, 2), Hm).reshape(-1)
        print(f'tile {k}: {nin}/{ng} matches, corners at {c.round(1)} (cut at {K * x0},{K * y0} .. {K * (x0 + W)},{K * (y0 + H)})')
    # the two top tiles, the two bottom ones, then top over bottom, each along its seam inside the overlap
    xo0, xo1 = K * 732 + 20, K * 940 - 20; yo0, yo1 = K * 412 + 20, K * 529 - 20
    top, wt = join(*T[1][:1], *T[2][:1], T[1][1], T[2][1], 1, xo0, xo1)
    bot, wb = join(*T[3][:1], *T[4][:1], T[3][1], T[4][1], 1, xo0, xo1)
    out, cov = join(top, bot, wt, wb, 0, yo0, yo1)
    # (a tile the generator drew a little smaller leaves a sliver at the picture's edge: the original there)
    cov = cv2.GaussianBlur(cov.astype(np.float32), (0, 0), 3)[..., None]
    out = out * cov + ref.astype(np.float32) * (1 - cov)
    print(f'{int((cov[..., 0] < 0.5).sum())} pixels at the edge from the original')
    mag, grn = keys(np.clip(out, 0, 255).astype(np.uint8))
    # the low frequencies from the original (outside the keys: a normalised blur, so the flat colours do not bleed in)
    metal = (~(mag | grn)).astype(np.float64)
    blur = lambda a: cv2.GaussianBlur(a, (0, 0), 24)
    nb = blur(metal) + 1e-6
    lo_o = np.dstack([blur(ref[..., i].astype(np.float64) * metal) for i in range(3)]) / nb[..., None]
    lo_n = np.dstack([blur(out[..., i].astype(np.float64) * metal) for i in range(3)]) / nb[..., None]
    out = np.clip(out + (lo_o - lo_n) * metal[..., None], 0, 255).astype(np.uint8)
    if clean:
        keep = cv2.erode(metal.astype(np.uint8), np.ones((9, 9), np.uint8)) > 0
        out, nd = despeckle(out, keep); print(f'{nd} stray dots painted over')
    # (a hairline where tiles meet in the flat colours, or the original's ringing at the edge: closed over)
    close = lambda m: cv2.morphologyEx(m.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((7, 7), np.uint8)) > 0
    mag, grn = close(mag), close(grn) & ~close(mag)
    out[mag] = (255, 0, 255); out[grn] = (0, 255, 0)
    dst = os.path.join(SRC, f'f15ex_{name}_2x.png')
    cv2.imwrite(dst, out)
    print(dst, f'{Ww} x {Hh}')


if __name__ == '__main__':
    main()
