"""The ZF-25 built piece by piece from its five blueprint pictures (assets/originals/jet_views/bp), outside the game.
Each piece has its own shape and takes its colour only from the pictures that show it (tools/render_jet2.cjs):

  fuselage   sections along its length: width from the top view (the fuselage alone: across the wing and the
             tailplanes, its own width carried through), top and bottom from the side view (the canopy and the fins
             left out), each section a superellipse;
  canopy     a bubble on the fuselage, its sill, top and width from the glass in the side and top views;
  wings, tailplanes   the top view's outline beyond the fuselage, an airfoil's thickness, at the side view's height;
  fins       the side view's outline above the rear fuselage, thin, canted outward 15 degrees, either side;
  nozzles    two round cans at the tail.

  python3 tools/make_jet2.py          ->  build/jet2/<piece>.bin + pieces.json + tex_<view>.png
"""
import json, pathlib
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage import measure

root = pathlib.Path(__file__).resolve().parent.parent
SRC = root / 'assets' / 'originals' / 'jet_views' / 'bp'
OUT = root / 'build' / 'jet2'; OUT.mkdir(parents=True, exist_ok=True)
LEN, SPAN = 19.4, 13.0
VOX = 0.025                                           # 2.5 cm

def view(name):
    a = np.asarray(Image.open(SRC / f'{name}.png').convert('RGB')).astype(np.float32)
    mg = (a[..., 0] + a[..., 2]) / 2 - a[..., 1]
    m = ndimage.binary_fill_holes(ndimage.binary_closing(mg < 150, iterations=3))
    lb, n = ndimage.label(m)
    if n > 1: m = lb == (np.argmax(ndimage.sum(m, lb, range(1, n + 1))) + 1)
    ex = np.clip(np.minimum(a[..., 0], a[..., 2]) - a[..., 1], 0, None) * m
    glass = ex > 25
    tint = np.clip((ex - 10) / 60, 0, 1)[..., None]
    a[..., 0] -= ex; a[..., 2] -= ex
    a = a * (1 - 0.8 * tint) + np.array([62, 74, 86], np.float32) * 0.8 * tint
    ys, xs = np.nonzero(m); box = (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)
    core = ndimage.binary_erosion(m, iterations=2)
    _, (iy, ix) = ndimage.distance_transform_edt(~core, return_indices=True)
    Image.fromarray(np.dstack([a[iy, ix], core * 255]).clip(0, 255).astype(np.uint8), 'RGBA').save(OUT / f'tex_{name}.png')
    x0, y0, x1, y1 = box
    return {'m': m[y0:y1, x0:x1], 'g': glass[y0:y1, x0:x1], 'a': a[y0:y1, x0:x1], 'box': box, 'w': a.shape[1], 'h': a.shape[0]}

V = {k: view(k) for k in ['bp_top', 'bp_bottom', 'bp_side', 'bp_front', 'bp_rear']}
top, side = V['bp_top'], V['bp_side']
HGT = LEN * side['m'].shape[0] / side['m'].shape[1]
print('aircraft', LEN, 'x', SPAN, 'x', round(HGT, 2), 'm')
# metres -> picture pixels: top view rows = x (from the nose), cols = y (the left wing at col 0, y = +SPAN/2);
# side view cols = x, rows = height from the top
def top_at(x, y):   # boolean, nearest pixel
    m = top['m']; r = np.clip((x / LEN * m.shape[0]).astype(int), 0, m.shape[0] - 1); c = np.clip(((SPAN / 2 - y) / SPAN * m.shape[1]).astype(int), 0, m.shape[1] - 1)
    return m[r, c]
NXs = side['m'].shape[1]
def side_cols(x): return np.clip((x / LEN * NXs).astype(int), 0, NXs - 1)
pz = lambda rows: HGT - rows * (LEN / NXs)            # side-view row -> height (z up, 0 at the lowest point)

# ---- the fuselage's own profile, station by station
NS = 400; xs = (np.arange(NS) + 0.5) / NS * LEN
tm = top['m']; tc = tm.shape[1] / 2
def central_halfwidth(x):
    r = int(min(x / LEN * tm.shape[0], tm.shape[0] - 1)); row = tm[r]; c = int(tc)
    if not row[c]: return 0.0
    l = c
    while l > 0 and row[l - 1]: l -= 1
    rr = c
    while rr < len(row) - 1 and row[rr + 1]: rr += 1
    return (rr - l + 1) / 2 / tm.shape[1] * SPAN
hw = np.array([central_halfwidth(x) for x in xs])
f = xs / LEN
# (across the wing, 44% to 80%, and the tailplanes, from 82%, the fuselage's own width carried through)
def interp(lo, hi, v0, v1): sel = (f >= lo) & (f <= hi); hw[sel] = np.interp(f[sel], [lo, hi], [v0, v1])
interp(0.44, 0.80, hw[np.searchsorted(f, 0.44)], hw[np.searchsorted(f, 0.80)])
interp(0.82, 0.995, hw[np.searchsorted(f, 0.82)], 1.25)
sm, sg = side['m'], side['g']
cols = side_cols(xs)
topz = np.array([pz(np.nonzero(sm[:, c])[0].min()) if sm[:, c].any() else 0 for c in cols])
botz = np.array([pz(np.nonzero(sm[:, c])[0].max()) if sm[:, c].any() else 0 for c in cols])
# the glass, in the side view: closed into one piece along the canopy's stretch, in the upper part
g = ndimage.binary_closing(sg, iterations=4)
g &= (np.arange(sg.shape[0])[:, None] < sg.shape[0] * 0.6) & (np.arange(NXs)[None, :] > NXs * 0.08) & (np.arange(NXs)[None, :] < NXs * 0.45)
g = ndimage.binary_fill_holes(g)
sill = np.array([pz(np.nonzero(g[:, c])[0].max()) if g[:, c].any() else np.nan for c in cols])
cantop = np.array([pz(np.nonzero(g[:, c])[0].min()) if g[:, c].any() else np.nan for c in cols])
has_can = ~np.isnan(sill)
# (under the canopy the fuselage stops at the sill; over the fins, 78% on, the spine carried to the nozzles)
ftop = topz.copy(); ftop[has_can] = sill[has_can]
i78 = np.searchsorted(f, 0.775); sel = f >= 0.775
ftop[sel] = np.interp(f[sel], [0.775, 1.0], [ftop[i78], (topz[i78] + botz[-1]) / 2 + 0.55])
fbot = botz.copy()
# (the belly smoothed: the pylons' tips below it left out)
fbot = ndimage.median_filter(fbot, 9)
print('fuselage max width', round(hw.max() * 2, 2), 'm; depth', round((ftop - fbot).max(), 2), 'm; canopy', round(f[has_can][0], 2), '-', round(f[has_can][-1], 2))

def save(name, verts, normals, faces, views):
    pos = np.asarray(verts, np.float32); nrm = np.asarray(normals, np.float32)
    (OUT / f'{name}.bin').write_bytes(pos.tobytes() + nrm.tobytes() + np.asarray(faces, np.uint32).tobytes())
    return {'name': name, 'nv': len(pos), 'nf': len(faces), 'views': views}

def solid(occ, origin, name, views, sigma=1.0):
    """a voxel solid (x, y, z at VOX) as a smooth mesh, in metres"""
    fld = ndimage.gaussian_filter(np.pad(occ, 2).astype(np.float32), sigma)
    v, fa, nr, _ = measure.marching_cubes(fld, 0.5)
    v = (v - 2) * VOX + np.asarray(origin)
    return save(name, v, -nr, fa, views)

pieces = []
# ---- fuselage: a loft of superellipse sections (round at the nose, squarer aft), 400 stations x 96 round
M = 96; th = np.linspace(0, 2 * np.pi, M, endpoint=False)
pw = np.interp(f, [0, 0.3, 0.5, 1.0], [2.0, 2.6, 3.2, 3.0])
zc = (ftop + fbot) / 2; hh = np.maximum((ftop - fbot) / 2, 0.01); ww = np.maximum(hw, 0.01)
ct, st = np.cos(th), np.sin(th)
P = []
for i in range(NS):
    e = 2 / pw[i]
    y = ww[i] * np.sign(ct) * np.abs(ct) ** e; z = zc[i] + hh[i] * np.sign(st) * np.abs(st) ** e
    P.append(np.stack([np.full(M, xs[i]), y, z], 1))
P = np.stack(P)                                       # NS x M x 3
# (closed at the nose and the tail by a point each)
nose = np.array([[0.0, 0.0, zc[0]]]); tail = np.array([[LEN, 0.0, zc[-1]]])
verts = np.concatenate([nose, P.reshape(-1, 3), tail]); faces = []
idx = lambda i, j: 1 + i * M + (j % M)
for j in range(M): faces.append([0, idx(0, j + 1), idx(0, j)])
for i in range(NS - 1):
    for j in range(M):
        a, b, c, d = idx(i, j), idx(i, j + 1), idx(i + 1, j), idx(i + 1, j + 1)
        faces += [[a, b, d], [a, d, c]]
T = len(verts) - 1
for j in range(M): faces.append([T, idx(NS - 1, j), idx(NS - 1, j + 1)])
faces = np.array(faces)
# normals: by the faces round each vertex
fn = np.cross(verts[faces[:, 1]] - verts[faces[:, 0]], verts[faces[:, 2]] - verts[faces[:, 0]])
vn = np.zeros_like(verts); [np.add.at(vn, faces[:, k], fn) for k in range(3)]
vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-9
cen = np.array([0, 0, 0]); out = np.einsum('ij,ij->i', vn, verts - np.stack([verts[:, 0], np.zeros(len(verts)), np.interp(verts[:, 0], xs, zc)], 1))
if (out < 0).mean() > 0.5: vn = -vn; faces = faces[:, ::-1]
pieces.append(save('fuselage', verts, vn, faces, ['top', 'bottom', 'side', 'front', 'rear']))

# ---- canopy: a half-ellipse bubble from the sill to the glass top, its width from the top view's glass
tg = top['g'] | (top['a'].mean(2) < 95)
def can_halfwidth(x):
    r = int(min(x / LEN * tm.shape[0], tm.shape[0] - 1)); row = tg[r, int(tc - tm.shape[1] * 0.1):int(tc + tm.shape[1] * 0.1)]
    c = np.nonzero(row)[0]
    return (np.abs(c + int(tc - tm.shape[1] * 0.1) - tc).max() + 1) / tm.shape[1] * SPAN if c.size else 0.0
ci = np.nonzero(has_can)[0]
cx = xs[ci]; cs = sill[ci]; ctp = cantop[ci]
cw = np.array([can_halfwidth(x) for x in cx]); cw = np.minimum(ndimage.median_filter(cw, 7), hw[ci] * 0.9)
cw = np.maximum(cw, 0.15)
Mc = 48; ph = np.linspace(0, np.pi, Mc)
Q = np.stack([np.stack([np.full(Mc, cx[k]), cw[k] * np.cos(ph), cs[k] + (ctp[k] - cs[k]) * np.sin(ph) ** 0.8], 1) for k in range(len(cx))])
nk = len(cx); cverts = Q.reshape(-1, 3); cf = []
for i in range(nk - 1):
    for j in range(Mc - 1):
        a, b, c, d = i * Mc + j, i * Mc + j + 1, (i + 1) * Mc + j, (i + 1) * Mc + j + 1
        cf += [[a, d, b], [a, c, d]]
# (its ends closed: fan to the middle of the first and last sections)
for end, k in ((0, 0), (1, nk - 1)):
    ctr = len(cverts); cverts = np.concatenate([cverts, [[cx[k], 0, cs[k]]]])
    for j in range(Mc - 1): cf.append([ctr, k * Mc + j, k * Mc + j + 1] if end else [ctr, k * Mc + j + 1, k * Mc + j])
cf = np.array(cf)
fn = np.cross(cverts[cf[:, 1]] - cverts[cf[:, 0]], cverts[cf[:, 2]] - cverts[cf[:, 0]])
cn = np.zeros_like(cverts); [np.add.at(cn, cf[:, k], fn) for k in range(3)]; cn /= np.linalg.norm(cn, axis=1, keepdims=True) + 1e-9
if cn[:, 2].mean() < 0: cn = -cn; cf = cf[:, ::-1]
pieces.append(save('canopy', cverts, cn, cf, ['side', 'top', 'front']))
print('canopy', round(cx[0] / LEN, 3), '-', round(cx[-1] / LEN, 3), 'width', round(cw.max() * 2, 2), 'm')

# ---- wings and tailplanes: the top view's outline beyond the fuselage, an airfoil thick, at their height
def plates(x0, x1, zmid, tmax, name):
    nx = int((x1 - x0) / VOX); ny = int(SPAN / VOX); nz = int(tmax * 2 / VOX) + 6
    gx = x0 + (np.arange(nx) + 0.5) * VOX; gy = SPAN / 2 - (np.arange(ny) + 0.5) * VOX
    X, Y = np.meshgrid(gx, gy, indexing='ij')
    inside = top_at(X, Y) & (np.abs(Y) > np.interp(X, xs, hw) - 0.05)
    # chord fraction along x at each point: from the planform's leading to trailing edge on that line of y
    occ = np.zeros((nx, ny, nz), bool)
    zz = (np.arange(nz) - nz / 2 + 0.5) * VOX
    for j in range(ny):
        c = np.nonzero(inside[:, j])[0]
        if c.size < 3: continue
        for seg in np.split(c, np.nonzero(np.diff(c) > 1)[0] + 1):
            s = (np.arange(len(seg)) + 0.5) / len(seg)
            t = tmax * 4 * s * (1 - s) ** 1.2 * 1.3 * (1 - 0.5 * abs(gy[j]) / (SPAN / 2))
            occ[seg, j, :] = np.abs(zz[None, :]) <= t[:, None] / 2 + VOX * 0.5
    return solid(occ, (x0, SPAN / 2 - (ny - 0.5) * VOX, zmid - nz / 2 * VOX), name, ['top', 'bottom'], sigma=0.7)
# (the wing's height: the side view's thin line, about the upper third of the fuselage there)
wz = float(np.interp(0.62, f, ftop - (ftop - fbot) * 0.28))
pieces.append(plates(0.40 * LEN, 0.80 * LEN, wz, 0.32, 'wing'))
tz = float(np.interp(0.92, f, (ftop + fbot) / 2))
pieces.append(plates(0.82 * LEN, LEN, tz, 0.16, 'tailplane'))

# ---- fins: the side view's outline above the spine, from 76%, 12 cm thick, canted outward 15 degrees
fx0 = 0.76 * LEN; nx = int((LEN - fx0) / VOX); hz = int(HGT / VOX)
fin = np.zeros((nx, hz), bool)
for i in range(nx):
    x = fx0 + (i + 0.5) * VOX; c = side_cols(np.array([x]))[0]
    col = np.nonzero(sm[:, c])[0]
    if col.size:
        zt = pz(col.min()); zs = float(np.interp(x, xs, ftop)) - 0.05
        k = (np.arange(hz) + 0.5) * VOX; fin[i] = (k <= zt) & (k >= zs)
fin = ndimage.binary_opening(fin, iterations=2)
for sgn, name in ((1, 'fin_l'), (-1, 'fin_r')):
    root_y = sgn * 1.65; ny = int(1.6 / VOX); occ = np.zeros((nx, ny, hz), bool)
    yy = root_y + (np.arange(ny) - ny / 2 + 0.5) * VOX
    for kz in range(hz):
        z = (kz + 0.5) * VOX; zr = float(np.interp(0.9, f, ftop))
        yc = root_y + sgn * np.tan(np.radians(15)) * max(z - zr, 0)
        occ[:, :, kz] = fin[:, kz][:, None] & (np.abs(yy[None, :] - yc) <= 0.06)
    pieces.append(solid(occ, (fx0, yy[0], 0), name, ['side'], sigma=0.7))

# ---- nozzles: two cans at the tail, their centres 0.65 m apart, 1.1 m across
nzl = []
for sgn, name in ((1, 'nozzle_l'), (-1, 'nozzle_r')):
    n = 64; a = np.linspace(0, 2 * np.pi, n, endpoint=False); r0, r1 = 0.58, 0.52; L0 = 0.92 * LEN
    zc0 = float(np.interp(0.97, f, (ftop + fbot) / 2)) - 0.1
    ring = lambda x, r: np.stack([np.full(n, x), sgn * 0.62 + r * np.cos(a), zc0 + r * np.sin(a)], 1)
    vv = np.concatenate([ring(L0, r0), ring(LEN + 0.15, r1), ring(LEN + 0.15, r1 * 0.8), ring(LEN - 0.3, r1 * 0.75)])
    ff = []
    for k in range(3):
        for j in range(n):
            p, q = k * n + j, k * n + (j + 1) % n; ff += [[p, q, q + n], [p, q + n, p + n]]
    ff = np.array(ff)
    fn = np.cross(vv[ff[:, 1]] - vv[ff[:, 0]], vv[ff[:, 2]] - vv[ff[:, 0]]); vn = np.zeros_like(vv); [np.add.at(vn, ff[:, k], fn) for k in range(3)]
    vn /= np.linalg.norm(vn, axis=1, keepdims=True) + 1e-9
    pieces.append(save(name, vv, vn, ff, ['rear', 'side', 'top', 'bottom']))

meta = {'len': LEN, 'span': SPAN, 'hgt': round(HGT, 3), 'pieces': pieces,
        'views': {k: {'box': list(V[k]['box']), 'w': V[k]['w'], 'h': V[k]['h']} for k in V}}
(OUT / 'pieces.json').write_text(json.dumps(meta))
print('pieces', [(p['name'], p['nv']) for p in pieces])
