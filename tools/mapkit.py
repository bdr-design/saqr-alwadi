"""Shared by the map tools (make_map.py, make_theater.py): tile pyramids, sensor grain, the ruins of the buildings
in a map's picture and their atlas, and patch synthesis for ground beyond a picture's edge (far field, gaps)."""
import numpy as np
from PIL import Image, ImageFilter
Image.MAX_IMAGE_PIXELS = None
T = 1024
def save_level(img, d, q):
    d.mkdir(parents=True, exist_ok=True)
    w, h = img.size
    for ty in range((h + T - 1) // T):
        for tx in range((w + T - 1) // T):
            img.crop((tx * T, ty * T, min(w, (tx + 1) * T), min(h, (ty + 1) * T))).save(d / f'{tx}_{ty}.jpg', quality=q, optimize=True)
def grain(rng, img, s):
    a = np.asarray(img, np.float32); a += rng.normal(0, s, a.shape[:2])[..., None]
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))
def vnoise(rng, h, w, cell):
    g = rng.random((max(2, int(h / cell) + 2), max(2, int(w / cell) + 2)))
    return np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((int(w / cell + 2) * cell, int(h / cell + 2) * cell), Image.BICUBIC), np.float32)[:h, :w] / 255
def blur(a, r):
    k = np.exp(-0.5 * (np.arange(-int(3 * r + 1), int(3 * r + 1) + 1) / r) ** 2); k /= k.sum(); p = len(k) // 2
    a = np.pad(a, p, mode='edge')
    a = np.apply_along_axis(lambda v: np.convolve(v, k, 'valid'), 0, a)
    return np.apply_along_axis(lambda v: np.convolve(v, k, 'valid'), 1, a)
# a building's ruin, cut from the AI-detailed picture (x4: the map at 4 px per map px) so it matches the map: see
# make_map.py for what each kind looks like. Returns the RGBA overlay and its size in map px.
def ruin(x4, rng, x, y, w, h, r, kind):
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
    n1, n2 = vnoise(rng, H2, W2, 10), vnoise(rng, H2, W2, 3)
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
        n3 = vnoise(rng, H2, W2, 2)
        if kind == 'hall':
            # greyed and dusted the colour of the ground around it, mottled by broken concrete
            grey = lum[..., None] * 0.6 + a * 0.4
            roof = (grey * 0.55 + g * 0.45) * fl[..., None] + (n3[..., None] - 0.5) * 34 + hp[..., None] * 0.8
            # burnt through: the dark of the gutted inside, soft-edged, with ash in it
            gut = np.clip(((n1 * 0.6 + vnoise(rng, H2, W2, 5) * 0.4) - 0.6) * 6, 0, 1) * np.clip(-d * 1.2, 0, 1)
            burnt = np.array([46, 41, 36], np.float32) * (0.7 + 0.6 * n3[..., None])
            roof = roof * (1 - gut[..., None]) + burnt * gut[..., None]
            roof *= (1 - 0.25 * np.exp(-(lx / (w * 0.6)) ** 2 - (ly / (h * 0.8)) ** 2) * n1)[..., None]
        else:
            # the deck keeps its colours; soot blown along it and a few burnt-out holds
            roof = a * fl[..., None]
            st = blur(vnoise(rng, H2, W2, 6), 1.5); roof *= (1 - 0.6 * np.clip((st - 0.45) * 3, 0, 1))[..., None]
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
def atlas(items, path):
    """items: [(b, img, ow, oh)] -> packed atlas saved at path; returns the bld rows and the atlas size"""
    AW, P = 2048, 2
    order = sorted(range(len(items)), key=lambda i: -items[i][1].size[1])
    pos, cx_, cy_, rowh = {}, 0, 0, 0
    for i in order:
        im = items[i][1]
        if cx_ + im.size[0] + P > AW: cx_, cy_, rowh = 0, cy_ + rowh + P, 0
        pos[i] = (cx_, cy_); cx_ += im.size[0] + P; rowh = max(rowh, im.size[1])
    AH = cy_ + rowh
    at = Image.new('RGBA', (AW, AH)); rows = []
    for i, (b, im, ow, oh) in enumerate(items):
        at.paste(im, pos[i])
        rows.append([*[round(v, 3) for v in b[:5]], b[5], *pos[i], *im.size, round(ow, 2), round(oh, 2)])
    at.save(path, quality=86, method=6)
    return rows, AW, AH
def quilt(rng, src, rows, cols, h, w, B=112, jit=None):
    """Ground laid in feathered random patches of src (turned over at random). rows / cols: for each output row /
    column, the source row / column its patch is centred on (None: anywhere), so a patch comes from about its own
    place where that matters (the sea stays the sea)."""
    sh_, sw_ = src.shape[:2]; B = int(min(B, sh_ - 2, sw_ - 2)); O = B // 4; st = B - O; jit = B // 3 if jit is None else jit
    acc = np.zeros((h, w, 3), np.float32); wt = np.zeros((h, w), np.float32)
    win = np.outer(np.hanning(B + 2)[1:-1], np.hanning(B + 2)[1:-1]).astype(np.float32) + 1e-3
    for y in range(-O, h, st):
        for x in range(-O, w, st):
            if rows is None: sy_ = int(rng.integers(0, sh_ - B + 1))
            else: sy_ = int(np.clip(rows[min(h - 1, max(0, y + B // 2))] - B // 2 + rng.integers(-jit, jit + 1), 0, sh_ - B))
            if cols is None: sx_ = int(rng.integers(0, sw_ - B + 1))
            else: sx_ = int(np.clip(cols[min(w - 1, max(0, x + B // 2))] - B // 2 + rng.integers(-jit, jit + 1), 0, sw_ - B))
            b = src[sy_:sy_ + B, sx_:sx_ + B]
            if rng.random() < 0.5: b = b[::-1]
            if rng.random() < 0.5: b = b[:, ::-1]
            ya, xa = max(0, y), max(0, x); yb, xb = min(h, y + B), min(w, x + B)
            acc[ya:yb, xa:xb] += b[ya - y:yb - y, xa - x:xb - x] * win[ya - y:yb - y, xa - x:xb - x, None]
            wt[ya:yb, xa:xb] += win[ya - y:yb - y, xa - x:xb - x]
    return acc / wt[..., None]
def fold(v, a, b):
    L = b - a; t = np.mod(v - a, 2 * L); return a + np.where(t < L, t, 2 * L - t)
def far_field(rng, src, SIZE, out, fold_x=None, band_n=None, band_s=None, N=4, ew_rows=None):
    """The far field around a map: SIZE map px square centred on it, N x N tiles of T px in out/, and tsd.jpg.
    Near the edges the map folded outward (seams meet without a cut); further out random patches of the ground along
    that edge (fold_x: the west and east strips' widths; band_n / band_s: the rows to take north and south from),
    from anywhere along that edge, or with ew_rows (a jitter, small px) from about the same rows east and west (a map
    whose sides change down its length: a coast in the south only). Returns x0, y0."""
    W, H = src.size; C = N * T; k = C / SIZE
    x0, y0 = W / 2 - SIZE / 2, H / 2 - SIZE / 2
    small = np.asarray(src.resize((round(W * k), round(H * k)), Image.LANCZOS), np.float32)
    X = x0 + (np.arange(C) + 0.5) / k; Y = y0 + (np.arange(C) + 0.5) / k
    fw_, fe_ = fold_x or (W, W)
    sx = np.where(X < 0, fold(X, 0, fw_), np.where(X > W, fold(X, W - fe_, W), X)); sy = fold(Y, 0, H)
    ix = np.clip((sx * k).astype(int), 0, small.shape[1] - 1); iy = np.clip((sy * k).astype(int), 0, small.shape[0] - 1)
    far = small[iy[:, None], ix[None, :]]
    sk = small.shape[1] / W
    # west and east: patches from the strip along that edge
    for side, (a_, b_) in (('w', (0, fw_)), ('e', (W - fe_, W))):
        cols = X < 0 if side == 'w' else X > W
        if not cols.any(): continue
        strip = small[:, int(a_ * sk):int(b_ * sk)]
        q = quilt(rng, strip, iy if ew_rows else None, None, C, int(cols.sum()), jit=ew_rows)
        dist = (-X[cols] if side == 'w' else X[cols] - W) * k
        f = np.clip((dist - 30) / 120, 0, 1)[None, :, None]
        far[:, cols] = far[:, cols] * (1 - f) + q * f
    # north and south: patches from a band of rows, each from about its own place across
    inx = (X >= 0) & (X <= W)
    xs = np.clip((X[inx] * sk).astype(int), 0, small.shape[1] - 1)
    for side in ('n', 's'):
        rows = Y < 0 if side == 'n' else Y > H
        b0, b1 = (band_n if side == 'n' else band_s) or ((0, 220) if side == 'n' else (H - 220, H))
        band = small[int(b0 * sk):int(b1 * sk)]
        q = quilt(rng, band, None, xs, C, len(xs))
        dist = (-Y if side == 'n' else Y - H) * k
        f = (np.clip((dist - 30) / 120, 0, 1) * rows)[:, None, None]
        far[:, inx] = far[:, inx] * (1 - f) + q * f
    canvas = Image.fromarray(far.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
    out.mkdir(parents=True, exist_ok=True)
    for ty in range(N):
        for tx in range(N):
            canvas.crop((tx * T, ty * T, (tx + 1) * T, (ty + 1) * T)).save(out / f'{tx}_{ty}.jpg', quality=82, optimize=True)
    canvas.resize((1024, 1024), Image.LANCZOS).save(out / 'tsd.jpg', quality=80)
    return x0, y0
