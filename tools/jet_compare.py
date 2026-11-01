"""How closely the model's orthographic renders (top, side, front, rear) match the owner's blueprint outlines:
each outline cut to its box and scaled to the blueprint's, the overlap (IoU) and an overlay picture (blueprint red,
model green, both yellow).  python3 tools/jet_compare.py <renders dir> <out picture>"""
import sys, pathlib
import numpy as np
from PIL import Image
from scipy import ndimage
root = pathlib.Path(__file__).resolve().parent.parent; BP = root / 'assets' / 'originals' / 'jet_views' / 'bp'
R = pathlib.Path(sys.argv[1])
def bp(n):
    a = np.asarray(Image.open(BP / f'{n}.png').convert('RGB')).astype(np.float32)
    m = ndimage.binary_fill_holes(ndimage.binary_closing(((a[..., 0] + a[..., 2]) / 2 - a[..., 1]) < 150, iterations=3))
    ys, xs = np.nonzero(m); return m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
def rd(f):
    a = np.asarray(Image.open(f).convert('RGBA'))[..., 3] > 100
    ys, xs = np.nonzero(a); return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
pairs = {'bp_top': 'top_0_-90_0.png', 'bp_side': 'side_90_0_0.png', 'bp_front': 'front_180_0_0.png', 'bp_rear': 'rear_0_0_0.png'}
tiles = []
for b, f in pairs.items():
    B = bp(b); m = rd(R / f); best = None
    for k in range(4):
        for fl in (False, True):
            c = np.rot90(m, k); c = c[:, ::-1] if fl else c
            c = np.asarray(Image.fromarray(c.astype(np.uint8) * 255).resize((B.shape[1], B.shape[0]), Image.NEAREST)) > 0
            iou = (c & B).sum() / (c | B).sum()
            # (the aspect too: a model squashed into the blueprint's box would still overlap)
            asp = (m.shape[0] / m.shape[1]) if k % 2 == 0 else (m.shape[1] / m.shape[0])
            if best is None or iou > best[0]: best = (iou, c, asp)
    iou, c, asp = best
    print(f'{b:9s} IoU {iou:.3f}  aspect model {asp:.3f} vs blueprint {B.shape[0] / B.shape[1]:.3f}')
    t = np.zeros(B.shape + (3,), np.uint8); t[B & ~c] = (230, 40, 40); t[c & ~B] = (40, 200, 60); t[B & c] = (235, 215, 60)
    tiles.append(Image.fromarray(t).resize((500, int(500 * B.shape[0] / B.shape[1]))))
H = max(t.height for t in tiles); o = Image.new('RGB', (500 * len(tiles), H), (30, 30, 30))
for i, t in enumerate(tiles): o.paste(t, (i * 500, 0))
o.save(sys.argv[2])
