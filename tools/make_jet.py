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
    a[..., 0] -= ex; a[..., 2] -= ex
    glass = np.array([62, 74, 86], np.float32)
    a = a * (1 - 0.8 * tint) + glass * 0.8 * tint
    m = ndimage.binary_opening(m, iterations=1)
    lb, n = ndimage.label(m)
    if n > 1: m = lb == (np.argmax(ndimage.sum(m, lb, range(1, n + 1))) + 1)
    ys, xs = np.nonzero(m)
    box = (xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)
    # the picture saved with its background cleared (for the renderer), and its outline's box in it
    rgba = np.dstack([a, m * 255]).clip(0, 255).astype(np.uint8)
    Image.fromarray(rgba, 'RGBA').save(OUT / f'tex_{name}.png')
    return m, box, a.shape[1], a.shape[0]

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
# a mesh of its surface: the hull a little smoothed (no voxel steps), at half a voxel
f = ndimage.gaussian_filter(np.pad(occ, 2).astype(np.float32), 0.9)
verts, faces, normals, _ = measure.marching_cubes(f, 0.5, step_size=1)
verts -= 2
# into metres, the aircraft's centre at the origin: x forward (nose +), y left wing +, z up
k = LEN / NX
pos = np.stack([(NX / 2 - verts[:, 0]) * k, (NY / 2 - verts[:, 1]) * k, (NZ / 2 - verts[:, 2]) * k], 1).astype(np.float32)
nrm = np.stack([-normals[:, 0], -normals[:, 1], -normals[:, 2]], 1).astype(np.float32)
print('mesh', len(pos), 'vertices,', len(faces), 'triangles')
(OUT / 'model.bin').write_bytes(pos.tobytes() + nrm.tobytes() + faces.astype(np.uint32).tobytes())
# where each picture's outline lies in it (its box, in its own pixels), so the renderer projects it onto the model
meta = {'len': LEN, 'span': SPAN, 'hgt': round(HGT, 3), 'nv': len(pos), 'nf': len(faces),
        'views': {k: {'box': [int(v) for v in V[k][1]], 'w': V[k][2], 'h': V[k][3]} for k in V}}
(OUT / 'model.json').write_text(json.dumps(meta))
