"""The ZF-25 as a model, from the owner's five blueprint pictures (assets/originals/jet_views/bp: bp_top, bp_bottom,
bp_side, bp_front, bp_rear; strictly orthographic, on magenta). Built here, outside the game:

  - shape: the visual hull, what all five outlines allow, on a voxel grid, smoothed, as a mesh (marching cubes);
    each picture is placed by its own outline's extent (length from the top view; span from the top, front and rear;
    height from the side, front and rear, which the generator drew a little apart: the side view's height is taken);
  - colour: the five pictures themselves, at their full size, projected onto the mesh from their own direction and
    blended by how squarely the surface faces each (build/jet/model.json + the pictures, for tools/render_jet.cjs).

  python3 tools/make_jet.py            ->  build/jet/model.bin, model.json, tex_*.png
"""
import json, pathlib
import numpy as np
from PIL import Image
from scipy import ndimage
from skimage import measure

root = pathlib.Path(__file__).resolve().parent.parent
SRC = root / 'assets' / 'originals' / 'jet_views' / 'bp'
OUT = root / 'build' / 'jet'; OUT.mkdir(parents=True, exist_ok=True)
LEN, SPAN = 19.4, 13.0
NX = 640                                         # voxels along the length (3 cm)

def view(name):
    a = np.asarray(Image.open(SRC / f'{name}.png').convert('RGB')).astype(np.float32)
    mg = (a[..., 0] + a[..., 2]) / 2 - a[..., 1]
    m = mg < 150
    # (the canopy is glass the generator drew the magenta through: inside the outline it is aircraft, and its
    # colour the glass's, the magenta tint taken out toward a dark sky-blue grey)
    m = ndimage.binary_fill_holes(ndimage.binary_closing(m, iterations=3))
    # (and at every edge and through the glass, the magenta taken out of the colour: red and blue brought down to
    # green where both stand above it; through the glass, toward a dark sky-blue grey besides)
    ex = np.clip(np.minimum(a[..., 0], a[..., 2]) - a[..., 1], 0, None) * m
    tint = np.clip((ex - 10) / 60, 0, 1)[..., None]
    GLASS[name] = ex > 25
    a[..., 0] -= ex; a[..., 2] -= ex
    glass = np.array([62, 74, 86], np.float32)
    a = a * (1 - 0.8 * tint) + glass * 0.8 * tint
    m = ndimage.binary_opening(m, iterations=1)
    lb, n = ndimage.label(m)
    if n > 1: m = lb == (np.argmax(ndimage.sum(m, lb, range(1, n + 1))) + 1)
    ys, xs = np.nonzero(m)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    # the picture saved with its background cleared (for the renderer), and its outline's box in it: the outline's
    # last pixels (blended with the magenta) let go, and the colour carried outward from the inside, so a sample that
    # falls just past the edge takes the aircraft's colour, not a purple line
    core = ndimage.binary_erosion(m, iterations=2)
    _, (iy, ix) = ndimage.distance_transform_edt(~core, return_indices=True)
    a = a[iy, ix]
    rgba = np.dstack([a, core * 255]).clip(0, 255).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(OUT / f'tex_{name}.png')
    return m, box, a.shape[1], a.shape[0]

GLASS = {}
V = {k: view(k) for k in ['bp_top', 'bp_bottom', 'bp_side', 'bp_front', 'bp_rear']}
def crop(k): m, (x0, y0, x1, y1), _, _ = V[k]; return m[y0:y1, x0:x1]
def fit(mk, shape):
    return np.asarray(Image.fromarray(mk.astype(np.uint8) * 255).resize((shape[1], shape[0]), Image.BILINEAR)) > 127
# the height: from the side view (length is the top view's)
st, ss = crop('bp_top'), crop('bp_side')
HGT = LEN * ss.shape[0] / ss.shape[1]
NY = round(NX * SPAN / LEN); NZ = round(NX * HGT / LEN)
print('model', LEN, 'x', SPAN, 'x', round(HGT, 2), 'm; grid', NX, NY, NZ)
# axes: x nose (0) -> tail, y left wing (0) -> right wing, z top (0) -> bottom
P = fit(st, (NX, NY)) & fit(crop('bp_bottom')[:, ::-1], (NX, NY))       # top: rows = length; bottom mirrored
S = fit(ss, (NZ, NX))                                                       # side (left): rows = height, cols = length, nose left
F = fit(crop('bp_front')[:, ::-1], (NZ, NY))                                # front: its left is the aircraft's right
R = fit(crop('bp_rear'), (NZ, NY))
occ = P[:, :, None] & S.T[:, None, :] & F.T[None, :, :] & R.T[None, :, :]
print('voxels', int(occ.sum()))
# the canopy: a hull of outlines puts the shoulders beside it as high as the canopy (the front view's outline there is
# the tails' and the canopy's together), so the side view's glass lay on them. Above the canopy's sill (where the
# glass starts in the side view) only the canopy's own width stands (the glass's width in the top view)
def bx(k): m, (x0, y0, x1, y1), _, _ = V[k]; return GLASS[k][y0:y1, x0:x1]
gs = fit(bx('bp_side'), (NZ, NX)); gt = fit(bx('bp_top') | (lambda a: (a.mean(2) < 95))(np.asarray(Image.open(SRC / 'bp_top.png').convert('RGB')).astype(np.float32)[V['bp_top'][1][1]:V['bp_top'][1][3], V['bp_top'][1][0]:V['bp_top'][1][2]]), (NX, NY))
# (the glass: the side view's largest piece of it, in the upper part)
# (the glass: in the side view, its tinted pixels closed into one piece, along the canopy's stretch (8% to 45% of the
# length) and in the upper part)
gs1 = ndimage.binary_closing(gs, iterations=4)
gs1 &= (np.arange(NZ)[:, None] < NZ * 0.6) & (np.arange(NX)[None, :] > NX * 0.08) & (np.arange(NX)[None, :] < NX * 0.45)
gs1 = ndimage.binary_fill_holes(gs1)
mid = NY / 2
for x in range(NX):
    zg = np.nonzero(gs1[:, x])[0]
    if zg.size < 3: continue
    sill = zg.max()                                         # the lowest glass (z grows downward), and its frame below it
    yg = np.nonzero(gt[x, int(mid - NY * 0.12):int(mid + NY * 0.12)])[0]
    hw = (np.abs(yg + int(mid - NY * 0.12) - mid).max() + 2) if yg.size else NY * 0.03
    out = np.abs(np.arange(NY) - mid) > hw
    occ[x][np.ix_(out, np.arange(NZ) < sill + 4)] = False
    if x % 40 == 0: print("  x", x, "sill", sill, "of", NZ, "half-width", round(float(hw), 1), "of", NY)
print('canopy cut', int(occ.sum()))
# the hull of outlines alone is square in section (a box where the fuselage is round): each section rounded within
# its own extents, a superellipse touching the outline at its widest and tallest. For each voxel: where it lies
# across its own run of aircraft along the span (u) and along the height (v), kept if |u|^p + |v|^p <= 1
def runs(o, ax):
    # each voxel's run along axis ax: its start and end index
    o = np.moveaxis(o, ax, -1); n = o.shape[-1]; idx = np.arange(n)
    st = np.where(o & ~np.concatenate([np.zeros_like(o[..., :1]), o[..., :-1]], -1), idx, -1)
    st = np.maximum.accumulate(st, axis=-1)
    en = np.where(o & ~np.concatenate([o[..., 1:], np.zeros_like(o[..., :1])], -1), idx, n + 1)
    en = np.flip(np.minimum.accumulate(np.flip(en, -1), axis=-1), -1)
    return np.moveaxis(st, -1, ax), np.moveaxis(en, -1, ax)
PW = 2.6
ys0, ys1 = runs(occ, 1); zs0, zs1 = runs(occ, 2)
iy = np.arange(NY)[None, :, None]; iz = np.arange(NZ)[None, None, :]
u = (iy - (ys0 + ys1) / 2) / np.maximum((ys1 - ys0 + 1) / 2, 0.5)
v = (iz - (zs0 + zs1) / 2) / np.maximum((zs1 - zs0 + 1) / 2, 0.5)
occ &= np.abs(u) ** PW + np.abs(v) ** PW <= 1.0
del ys0, ys1, zs0, zs1, u, v
print('rounded', int(occ.sum()))
# a mesh of its surface: the hull a little smoothed (no voxel steps), at half a voxel
f = ndimage.gaussian_filter(np.pad(occ, 2).astype(np.float32), 1.3)
verts, faces, normals, _ = measure.marching_cubes(f, 0.5, step_size=1)
verts -= 2
# which picture sees each vertex: a picture shows only the aircraft's outermost surface from its side (the side
# view shows the canopy, not the shoulders below it that a hull of outlines puts beside it): a vertex takes a picture's
# colour only where it is within a voxel and a half of the first surface that picture's direction meets
def first(o, ax, rev=False):
    o = np.flip(o, ax) if rev else o
    d = np.where(o.any(ax), o.argmax(ax), o.shape[ax]).astype(np.float32)
    return (o.shape[ax] - 1 - d) if rev else d
vx, vy, vz = verts[:, 0], verts[:, 1], verts[:, 2]
ix = np.clip(np.round(vx).astype(int), 0, NX - 1); iy = np.clip(np.round(vy).astype(int), 0, NY - 1); iz = np.clip(np.round(vz).astype(int), 0, NZ - 1)
T = 1.5
vis = np.stack([
    vz <= first(occ, 2)[ix, iy] + T,                  # top (z 0 is the top)
    vz >= first(occ, 2, True)[ix, iy] - T,            # bottom
    (vy <= first(occ, 1)[ix, iz] + T) | (vy >= first(occ, 1, True)[ix, iz] - T),   # either side
    vx <= first(occ, 0)[iy, iz] + T,                  # front (x 0 is the nose)
    vx >= first(occ, 0, True)[iy, iz] - T], 1).astype(np.float32)   # rear
print('seen by', vis.mean(0).round(2))
# into metres, the aircraft's centre at the origin: x forward (nose +), y left wing +, z up
k = LEN / NX
pos = np.stack([(NX / 2 - verts[:, 0]) * k, (NY / 2 - verts[:, 1]) * k, (NZ / 2 - verts[:, 2]) * k], 1).astype(np.float32)
nrm = np.stack([-normals[:, 0], -normals[:, 1], -normals[:, 2]], 1).astype(np.float32)
print('mesh', len(pos), 'vertices,', len(faces), 'triangles')
(OUT / 'model.bin').write_bytes(pos.tobytes() + nrm.tobytes() + vis.tobytes() + faces.astype(np.uint32).tobytes())
# where each picture's outline lies in it (its box, in its own pixels), so the renderer projects it onto the model
meta = {'len': LEN, 'span': SPAN, 'hgt': round(HGT, 3), 'nv': len(pos), 'nf': len(faces),
        'views': {k: {'box': [int(v) for v in V[k][1]], 'w': V[k][2], 'h': V[k][3]} for k in V}}
(OUT / 'model.json').write_text(json.dumps(meta))
