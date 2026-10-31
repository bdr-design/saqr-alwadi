"""An operations area of Velmora as a map: Wadi Seren (assets/originals/velmora/ops1), 4.41 km square.

usage: python3 tools/make_ops.py            ->  maps/seren/tiles/{0,1,far}, tiles/mini.jpg, maps/seren/house_pad.png,
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

Levels: 0 at 0.85 m a map px (the game's scale, MPP) and 1 (x2, 0.42 m), which holds all the picture's detail (about
0.7 m); past it the GPU enlarges level 1 ('top': 1, 'mag': 1), with no stored enlargements. And the whole map in one
2048 px picture ('mini': tiles/mini.jpg, about 2.15 m a pixel), under the tiles: what the sight shows zoomed out, what
the canopy and the menu show (level 0 whole would be 36 tiles).
"""
import json, pathlib, sys, heapq
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance
from scipy import ndimage
root = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / 'tools'))
from mapkit import save_level, far_field, atlas
import cv2
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

# ---- the villages (villages/v<k>_houses.png and v<k>_ruin.png: the owner's houses drawn INTO crops of this very map,
# 200 m at 1024 px, sites.json where each crop lies in `full`; the outer 32 px of each are the map's own): laid back
# into the map, so its houses are part of its picture, as the theatre's warehouses are: only what they changed, as a
# difference (the ground round them keeps the map's own detail). Over-bright roofs are toned down. Each building is found from where the ruin differs from the standing
# picture (one strong core of damage a building; the rest of the damage to the nearest core), and gets, like the
# theatre's buildings, a footprint and its ruin: the ruin picture under that building's own damage, shown when it
# comes down (MAP.blds, maps/<id>/ruins.webp).
VIL = SRC / 'villages'
sites = json.loads((VIL / 'sites.json').read_text()) if (VIL / 'sites.json').exists() else {}
VPATCH, BLDS = [], []
k_map = W / NN                                           # map px a `full` px
def feather(n, edge):
    r = np.minimum(np.arange(n), np.arange(n)[::-1]).astype(np.float32)
    f = np.clip((r - edge * 0.25) / (edge * 0.75), 0, 1); return np.minimum.outer(f, f)
def open_disk(mk, r):
    """opened with a round brush of radius r (OpenCV: the whole-frame scipy opening with a big disk took most of the step)"""
    k = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * r + 1, 2 * r + 1))
    return cv2.morphologyEx(mk.astype(np.uint8), cv2.MORPH_OPEN, k) > 0
def segment(Hh, Rr, hi=40, lo=18, core_min=700, min_area=1500):
    d = cv2.GaussianBlur(np.abs(Rr - Hh).mean(2), (0, 0), 2)
    low = ndimage.binary_fill_holes(ndimage.binary_closing(ndimage.binary_opening(d > lo, iterations=2), iterations=3))
    cl, n = ndimage.label(ndimage.binary_opening(d > hi, iterations=5))
    for i, sz in enumerate(ndimage.sum(cl > 0, cl, range(1, n + 1))):
        if sz < core_min: cl[cl == i + 1] = 0
    # each core's damage grown out from it downhill in strength (a watershed: the strongest damage next to a building
    # joins it first), through the damage only: where two buildings' damage meets, the weakest line between them, so a
    # house beside a walled yard does not take the yard's corner wall as the nearest core did. What no core reaches,
    # to the nearest core.
    # (in bands of damage 12 apart, and within a band by distance, first come first joined: inside one house's strong
    # damage two cores meet half way, as the nearest core had it, a terrace's houses parted at their walls)
    lab = cl.copy(); H_, W_ = lab.shape; dq = (d // 12).astype(np.int32); cnt = 0
    heap = []
    for y, x in zip(*np.nonzero(ndimage.binary_dilation(lab > 0) & (lab == 0) & low)): heapq.heappush(heap, (-dq[y, x], cnt, y, x)); cnt += 1
    while heap:
        _, _, y, x = heapq.heappop(heap)
        if lab[y, x]: continue
        nb = lab[max(y - 1, 0):y + 2, max(x - 1, 0):x + 2]; nb = nb[nb > 0]
        if not nb.size: continue
        lab[y, x] = np.bincount(nb).argmax()                 # (a tie to the most of its labelled neighbours)
        for yy, xx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
            if 0 <= yy < H_ and 0 <= xx < W_ and not lab[yy, xx] and low[yy, xx]: heapq.heappush(heap, (-dq[yy, xx], cnt, yy, xx)); cnt += 1
    _, (iy, ix) = ndimage.distance_transform_edt(cl == 0, return_indices=True)
    lab = np.where(low & (lab == 0), cl[iy, ix], lab)
    ll, nn = ndimage.label(low)
    # (one small piece of damage is one building, however many cores it has: a house with two was two buildings)
    for j in range(1, nn + 1):
        pj = ll == j
        if pj.sum() < 25000 and len(set(np.unique(lab[pj])) - {0}) > 1: lab[pj] = lab[pj][lab[pj] > 0].min()
    for i in [i for i in np.unique(lab) if i]:
        mm = lab == i
        if mm.sum() >= min_area: continue
        ring = ndimage.binary_dilation(mm, iterations=3) & ~mm & (lab > 0)
        lab[mm] = np.bincount(lab[ring]).argmax() if ring.any() else 0
    split = [lab == i for i in np.unique(lab) if i and (lab == i).sum() >= min_area]
    whole = [ll == i for i in range(1, nn + 1) if (ll == i).sum() >= 400]
    out = split if len(split) >= len(whole) else whole
    # each building only its own body: the far specks of damage the nearest-core rule gave it are left out (they
    # stretched and turned its footprint over its neighbours)
    def body(mk):
        lb, n2 = ndimage.label(mk)
        if n2 <= 1: return mk
        sz = ndimage.sum(mk, lb, range(1, n2 + 1)); big = sz.max()
        return np.isin(lb, [i + 1 for i, z in enumerate(sz) if z >= 0.2 * big])
    out = [body(mk) for mk in out]
    # and a long arm of one building's damage reaching along its neighbour (the corner of a yard's wall the flood
    # gave the house beside it): what a round brush, as wide as the building's body outlives, does not reach (a house's
    # own corners are under the 600 px a piece must be), where it lies against another building, given to that one
    if len(out) > 1:
        lab2 = np.zeros(out[0].shape, np.int32)
        for i, mk in enumerate(out): lab2[mk] = i + 1
        for i, mk in enumerate(out):
            for f_ in (0.3, 0.22, 0.15):                          # (a brush the building's body outlives)
                op = open_disk(mk, max(6, int(np.sqrt(mk.sum()) * f_)))
                if op.sum() >= 0.6 * mk.sum(): break
            arm, na = ndimage.label(mk & ~op)
            for j in range(1, na + 1):
                aj = arm == j
                if aj.sum() < 600: continue
                ring = ndimage.binary_dilation(aj) & ~aj
                nb = lab2[ring & ~mk]; nb = nb[nb > 0]
                # (an arm, not half a house: it lies along the neighbour more than along its own body)
                if nb.size and nb.size > (ring & op).sum(): lab2[aj] = np.bincount(nb).argmax()
        # what an arm's move cut off from its building goes to the building it touches most (none: it stays)
        for i in range(len(out)):
            mi = lab2 == i + 1; lb, n2 = ndimage.label(mi)
            if n2 <= 1: continue
            sz = ndimage.sum(mi, lb, range(1, n2 + 1))
            for q in np.nonzero(sz < 0.2 * sz.max())[0]:
                fq = lb == q + 1; nb = lab2[ndimage.binary_dilation(fq) & ~fq]; nb = nb[(nb > 0) & (nb != i + 1)]
                if nb.size: lab2[fq] = np.bincount(nb).argmax()
        out = [lab2 == i + 1 for i in range(len(out)) if (lab2 == i + 1).any()]
    # a piece that is not a building (a breach in a wall with its yard's rubble: thin, little of its box filled; or
    # a wall's corner by a building, too small for a house) goes with the nearest building, which brings it down
    # (a big piece is a building whatever its shape, a yard's wall with it; a small hut standing apart, compact, is one)
    keep, extra = [], []
    for mk in out:
        ys, xs = np.nonzero(mk); (_, _), (rw, rh), _ = cv2.minAreaRect(np.stack([xs, ys], 1).astype(np.float32))
        n_, fill, asp = mk.sum(), mk.sum() / max(rw * rh, 1), min(rw, rh) / max(rw, rh, 1)
        apart = not any((ndimage.binary_dilation(mk, iterations=15) & o).any() for o in out if o is not mk)
        ok = n_ >= 5000 or (fill > 0.5 and asp > 0.3 and (n_ >= 2000 or (apart and fill > 0.6 and asp > 0.6)))
        (keep if ok else extra).append(mk)
    if keep:
        cen = [np.array(ndimage.center_of_mass(mk)) for mk in keep]
        for mk in extra:
            c = np.array(ndimage.center_of_mass(mk)); i = int(np.argmin([np.hypot(*(c - q)) for q in cen])); keep[i] = keep[i] | mk
    return keep or out
def orient(mk, Hg, roofs=None, strong=None):
    """a building's turn from the straight edges of its walls in the standing picture (the damage's own outline
    gave square buildings an arbitrary turn), and its body's box at that turn, in the 1024 px picture"""
    m = ndimage.binary_dilation(mk, iterations=2)
    gx, gy = cv2.Sobel(Hg, cv2.CV_32F, 1, 0, ksize=3), cv2.Sobel(Hg, cv2.CV_32F, 0, 1, ksize=3)
    mag = np.hypot(gx, gy)[m]; th = (np.degrees(np.arctan2(gy, gx))[m]) % 90
    hist = np.bincount(np.round(th).astype(int) % 90, weights=mag, minlength=90)
    hist = np.convolve(np.r_[hist[-3:], hist, hist[:3]], np.ones(7) / 7, 'valid')
    r = np.radians(float(np.argmax(hist)))
    c, s_ = np.cos(r), np.sin(r)
    # the box of the building's body (what a round brush reaches: not a lobe of rubble beside it, which stretched the
    # box over the house next door); of the roof where the owner drew one (the standing house itself, not the rubble
    # its fall throws round it), if it holds the building's strongest damage (not a new wall by an old house); where
    # the house was in the map already, of the damage
    sg = mk if strong is None or not (strong & mk).any() else strong & mk
    base = mk
    if roofs is not None:
        roof = ndimage.binary_fill_holes(ndimage.binary_closing(mk & roofs, iterations=2)) & mk   # (holes: roof the ground's colour)
        roof = ndimage.binary_opening(roof, iterations=2)
        if roof.sum() > 0.25 * mk.sum() and (roof & sg).sum() >= 0.5 * sg.sum(): base = roof
    bd = base
    for f_ in (0.2, 0.12, 0.06):                             # (a brush the body outlives: a long thin house too)
        op = open_disk(base, max(3, int(np.sqrt(base.sum()) * f_)))
        if op.sum() >= 0.5 * base.sum(): bd = op; break
    lb, nl = ndimage.label(bd)
    if nl > 1:
        # (the pieces with the building's strong damage: a house's annex with its own crater stays, a wall's corner
        # folded in goes)
        st_ = ndimage.sum(sg, lb, range(1, nl + 1))
        bd = np.isin(lb, [i + 1 for i, z in enumerate(st_) if z >= 0.25 * st_.max()])
    ys, xs = np.nonzero(bd); u, v = xs * c + ys * s_, -xs * s_ + ys * c
    u0, u1, v0, v1 = u.min(), u.max(), v.min(), v.max(); uc, vc = (u0 + u1) / 2, (v0 + v1) / 2
    return uc * c - vc * s_, uc * s_ + vc * c, u1 - u0 + 1, v1 - v0 + 1, r
def reach(mk, cx, cy, r):
    """how wide and long all a building's damage reaches about its box's middle (the ruin's overlay)"""
    c, s_ = np.cos(r), np.sin(r); ys, xs = np.nonzero(mk)
    U, V = (xs - cx) * c + (ys - cy) * s_, -(xs - cx) * s_ + (ys - cy) * c
    return 2 * np.abs(U).max() + 1, 2 * np.abs(V).max() + 1
full0 = full; fa = np.asarray(full, np.float32).copy()
for key, st in sites.items():
    fh, fr, fv = VIL / f'{key}_houses.png', VIL / f'{key}_ruin.png', VIL / f'{key}.png'
    if not (fh.exists() and fr.exists() and fv.exists()): continue
    Hh = np.asarray(Image.open(fh).convert('RGB'), np.float32); Rr = np.asarray(Image.open(fr).convert('RGB'), np.float32)
    Vv = np.asarray(Image.open(fv).convert('RGB'), np.float32)
    masks = segment(Hh, Rr)
    # what the owner's picture changed (the houses and what goes with them): only that goes into the map, as a
    # difference, so the ground round the houses keeps the map's own detail and colour
    edit = cv2.GaussianBlur((cv2.GaussianBlur(np.abs(Hh - Vv).mean(2), (0, 0), 2) > 10).astype(np.float32), (0, 0), 6)
    edit = np.clip(edit * 1.6, 0, 1) * feather(1024, 32)
    # over-bright roofs toned down to the brightest ground round them, where the picture was changed only
    Hh0 = Hh; lum = Hh.mean(2, keepdims=True); hi = np.percentile(Vv.mean(2), 99.5)
    Hh = np.where((lum > hi) & (edit[..., None] > 0.05), hi + (Hh - hi) * 0.4, Hh)
    dH = (Hh - Vv) * edit[..., None]
    S0, x0s, y0s = st['size'], st['x0'], st['y0']
    def small(a, n): return np.dstack([np.asarray(Image.fromarray(a[..., c].astype(np.float32), 'F').resize((n, n), Image.LANCZOS)) for c in range(3)])
    fa[y0s:y0s + S0, x0s:x0s + S0] += small(dH, S0)
    VPATCH.append((x0s, y0s, S0, dH))
    # each building: footprint (map px), its ruin at 4 px a map px
    sm = S0 * k_map; S4 = round(sm * 4); Hg = Hh.mean(2).astype(np.float32)
    strong = cv2.GaussianBlur(np.abs(Rr - Hh0).mean(2), (0, 0), 2) > 40        # (segment's cores)
    roofs = cv2.GaussianBlur(np.abs(Hh - Vv).mean(2), (0, 0), 2) > 25
    R4 = Image.fromarray(Rr.clip(0, 255).astype(np.uint8)).resize((S4, S4), Image.LANCZOS)
    boxes = [orient(mk, Hg, roofs, strong) for mk in masks]
    # a lobe of one building's damage curled round its neighbour (its rubble, as the flood reached it): what lies
    # nearer another building's box than its own, and well off its own, goes with that one (its ruin shows it)
    if len(masks) > 1:
        dist = []
        for cx, cy, rw, rh, r in boxes:
            bx = np.zeros(masks[0].shape, np.uint8)
            cv2.fillConvexPoly(bx, cv2.boxPoints(((cx, cy), (rw, rh), np.degrees(r))).astype(np.int32), 1)
            dist.append(ndimage.distance_transform_edt(bx == 0))
        dist = np.stack(dist); near = dist.argmin(0); own = np.full(masks[0].shape, -1, np.int32)
        for i, mk in enumerate(masks): own[mk] = i
        dO = np.take_along_axis(dist, np.maximum(own, 0)[None], 0)[0]; dN = dist.min(0)
        mv = (own >= 0) & (own != near) & (dO > 8) & (dN < dO - 4)
        masks = [(mk & ~mv) | (mv & (near == i)) for i, mk in enumerate(masks)]
    for mk, (cx, cy, rw, rh, r) in zip(masks, boxes):
        dw, dh = reach(mk, cx, cy, r)
        kk = sm / 1024                                          # 1024 px -> map px
        mx, my = (x0s + cx * S0 / 1024) * k_map, (y0s + cy * S0 / 1024) * k_map
        bw, bh = rw * kk * 0.85, rh * kk * 0.85                 # (the box takes in the walls' shadow, the damage's edge)
        ow, oh = dw * kk + 7, dh * kk + 7                       # (the ruin's soft edge reaches some 3 map px past it)
        m4 = Image.fromarray((ndimage.binary_dilation(mk, iterations=4) * 255).astype(np.uint8)).resize((S4, S4), Image.BILINEAR).filter(ImageFilter.GaussianBlur(3))
        rgba = R4.convert('RGBA'); rgba.putalpha(m4)
        # (an even width and length at 4 px a map px, so the crop's middle is the box's, not half a pixel off)
        W2, H2 = 2 * max(2, round(ow * 2)), 2 * max(2, round(oh * 2)); ow, oh = W2 / 4, H2 / 4; Rh = int(np.hypot(W2, H2) / 2 + 4)
        c4x, c4y = cx * S4 / 1024, cy * S4 / 1024
        big = rgba.crop((round(c4x - Rh), round(c4y - Rh), round(c4x - Rh) + 2 * Rh, round(c4y - Rh) + 2 * Rh)).rotate(np.degrees(r), resample=Image.BICUBIC)
        ov = big.crop((Rh - W2 // 2, Rh - H2 // 2, Rh - W2 // 2 + W2, Rh - H2 // 2 + H2))
        BLDS.append(([mx, my, bw, bh, float(r), 'hall'], ov, ow, oh))
    print('village', key, len(masks), 'buildings')
full = Image.fromarray(fa.clip(0, 255).astype(np.uint8)); del fa
full.resize((2048, 2048), Image.LANCZOS).save(SRC / 'preview' / 'seren_merged_2048.jpg', quality=88)

# ---- levels 0 and 1 (1024 px tiles). Level 1 (0.42 m a pixel) holds all the picture's detail (0.72 m): it is not
# stored again enlarged (it was level 2, 71 MB of the same picture larger). Past it the GPU enlarges level 1 itself
# (src/game/02-render.js, tileMat: Catmull-Rom), and level 1 is sharpened here for that, as level 2 was: matched
# against the stored level 2, 38.7 dB, the same picture to the eye. 'mag': 1 tells the game to.
src = full.resize((W, H), Image.LANCZOS)
save_level(src, out / 'tiles' / '0', 88)
full.resize((2048, 2048), Image.LANCZOS).save(out / 'tiles' / 'mini.jpg', quality=88, optimize=True)
# (level 1 from the map before the villages, and the villages put in again at its own 0.42 m from the owner's
# pictures, not from the 0.72 m map picture: from the merged map they were in twice, roofs burnt white, shadows black)
L1 = full0.resize((W * 2, H * 2), Image.LANCZOS); del full0
la = np.array(L1, np.float32); k1 = W * 2 / NN
for x0s, y0s, S0, dH in VPATCH:
    n1 = round(S0 * k1); X, Y = round(x0s * k1), round(y0s * k1)
    la[Y:Y + n1, X:X + n1] += np.dstack([np.asarray(Image.fromarray(dH[..., c].astype(np.float32), 'F').resize((n1, n1), Image.LANCZOS)) for c in range(3)])
L1 = Image.fromarray(la.clip(0, 255).astype(np.uint8)); del la
save_level(L1.filter(ImageFilter.UnsharpMask(radius=1.0, percent=45, threshold=2)), out / 'tiles' / '1', 85)

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

# ---- far field (some 3 km round the area each way, the area folded outward, then patches of its own ground) and the
# TSD picture: the web page's ground beyond the map (it has no country), and the cockpit map screen's picture
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
m = {'ar': 'وادي سيرين', 'en': 'WADI SEREN', 'trial': True, 'top': 1, 'mag': 1, 'mini': 'tiles/mini.jpg', 'w': W, 'h': H, 'road': road,
     'far': {'x0': round(fx0, 2), 'y0': round(fy0, 2), 'size': SIZE, 'n': 4}, 'ground': ground, 'haze': haze,
     'hover': {'h1': {'b': 250, 'd': 1500}, 'h2': {'b': 150, 'd': 1500}}, 'pad': True,
     'missions': json.loads(mis.read_text()) if mis.exists() else []}
if BLDS:
    rows, AW, AH = atlas(BLDS, out / 'ruins.webp')
    m.update({'blds': rows, 'ruinsW': AW, 'ruinsH': AH})
    print('buildings', len(rows), 'ruins atlas', AW, 'x', AH)
# (what other tools put in, the country's place by tools/make_country.py, is kept)
prev = dd / 'map.json'
if prev.exists():
    # (only what other tools put in is carried over: the country's place (tools/make_country.py), and the trial mark
    # once the owner has taken it off; everything else is this tool's, as written above)
    old = json.loads(prev.read_text())
    if 'country' in old: m['country'] = old['country']
    if not old.get('trial'): m.pop('trial', None)
(dd / 'map.json').write_text(json.dumps(m, ensure_ascii=False))
print('map', W, 'x', H, 'map px; plot at', px, py, '; ground', hex(ground), 'haze', hex(haze))
