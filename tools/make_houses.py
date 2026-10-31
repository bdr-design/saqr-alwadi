"""House sprites from the owner's Velmora houses (assets/originals/velmora/houses: h1..h7 and h1_ruin..h7_ruin, 1024 px,
straight down like a satellite picture, sun from the upper left, on a flat magenta ground; manifest.json: each house's
size in metres and where it is in its picture). Each pair, standing and destroyed, is drawn at the same scale and in
the same place, so both are cut to one frame (the ruin's rubble reaches past the walls).

  - cut: the magenta keyed out, soft at the edge, and the magenta taken back out of the edge's colour (unmixed);
  - size: the standing house's longest side is the size in the manifest (metres), the picture scaled to it;
  - detail: taken down to what the sight sees there (DETAIL m a pixel) and back up, so at full zoom a house is about
    as soft as the ground under it, not a sharp drawing laid on a photograph;
  - shadow: the standing house's outline, softened (the game casts it from the house's height and the sun).
Writes sprites/house<n>.png, house<n>_ruin.png, house<n>_shadow.png and prints the HOUSE lines for the game.

  python3 tools/make_houses.py
"""
import json, pathlib
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

root = pathlib.Path(__file__).resolve().parent.parent
SRC = root / 'assets' / 'originals' / 'velmora' / 'houses'
OUT = root / 'sprites'
PAD = 10                 # px of clear edge round each sprite (the game's sizes allow for it)
RES = 0.045              # metres a sprite pixel
DETAIL = 0.2             # metres a pixel of real detail kept
M = np.array([255, 0, 255], np.float32)
# the game's houses: which of the owner's, its name, and how high it stands (m: casts its shadow)
HOUSES = [(1, 'h2', 7.0, 'بيت من طابقين', 'Two-storey house'), (2, 'h3', 4.0, 'بيت بحوش', 'Courtyard house'),
          (3, 'h1', 3.5, 'بيت حجري', 'Stone house'), (4, 'h4', 4.5, 'مزرعة', 'Farm compound'),
          (5, 'h5', 3.5, 'بيوت متلاصقة', 'Row houses'), (6, 'h6', 4.5, 'مجمّع مسوّر', 'Walled compound'),
          (7, 'h7', 5.0, 'مخزن', 'Storehouse')]
man = {p['id']: p for p in json.loads((SRC / 'manifest.json').read_text())['pairs']}

def cut(path):
    a = np.asarray(Image.open(path).convert('RGB'), np.float32)
    # how magenta: red and blue high, green low (the houses' earth colours are near zero or below)
    mg = (a[..., 0] + a[..., 2]) / 2 - a[..., 1]
    alpha = np.clip((215 - mg) / 150, 0, 1)
    # the edge's colour unmixed from the magenta behind it
    k = np.maximum(alpha, 0.08)[..., None]
    rgb = np.clip((a - (1 - k) * M) / k, 0, 255)
    # and what magenta is left in the stones by the edge (the generator's own blending): there only, a few pixels in
    # from the edge (not a rusty roof inside), red and blue brought down where both stand above green
    edge = ndimage.binary_dilation(alpha < 0.98, iterations=4)
    ex = np.clip(np.minimum(rgb[..., 0], rgb[..., 2]) - rgb[..., 1] - 6, 0, None) * edge
    rgb[..., 0] -= ex; rgb[..., 2] -= ex
    return np.clip(rgb, 0, 255), alpha

lines = []
for n, hid, ht, ar, en in HOUSES:
    p = man[hid]
    (r1, a1), (r2, a2) = cut(SRC / f'{hid}.png'), cut(SRC / f'{hid}_ruin.png')
    # one frame for both: what either holds
    ys, xs = np.nonzero((a1 > 0.5) | (a2 > 0.5))
    x0, x1, y0, y1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
    b = p['files'][0]['content_bbox_px_xyxy']
    mpp = max(p['nominal_dimensions_m']) / max(b[2] - b[0], b[3] - b[1])       # metres a source pixel
    W, H = round((x1 - x0) * mpp / RES), round((y1 - y0) * mpp / RES)
    lw, lh = max(8, round((x1 - x0) * mpp / DETAIL)), max(8, round((y1 - y0) * mpp / DETAIL))
    for rgb, al, name in ((r1, a1, f'house{n}'), (r2, a2, f'house{n}_ruin')):
        im = Image.fromarray(np.dstack([rgb, al * 255]).astype(np.uint8)[y0:y1, x0:x1], 'RGBA')
        # (Pillow premultiplies an RGBA image itself while it resizes: done here as well, the edge came out lighter by
        # its own coverage, a pale line round every house)
        q = np.asarray(im.resize((lw, lh), Image.LANCZOS).resize((W, H), Image.BICUBIC), np.float32)
        # the clear pixels take the colour of the nearest house pixel, so the GPU's smaller copies (mipmaps) of the
        # sprite do not darken its edge with the clear black
        a8 = q[..., 3] > 8
        if a8.any():
            _, (iy, ix) = ndimage.distance_transform_edt(~a8, return_indices=True)
            q[..., :3] = np.where(a8[..., None], q[..., :3], q[iy, ix, :3])
        canvas = np.zeros((H + 2 * PAD, W + 2 * PAD, 4), np.float32)
        canvas[..., :3] = np.pad(q[..., :3], ((PAD, PAD), (PAD, PAD), (0, 0)), mode='edge'); canvas[PAD:PAD + H, PAD:PAD + W, 3] = q[..., 3]
        out = Image.fromarray(canvas.clip(0, 255).astype(np.uint8), 'RGBA')
        out.save(OUT / f'{name}.png', optimize=True)
        if name == f'house{n}':
            sh = Image.new('RGBA', out.size, (255, 255, 255, 0)); sh.putalpha(out.getchannel('A').filter(ImageFilter.GaussianBlur(4)))
            sh.save(OUT / f'house{n}_shadow.png', optimize=True)
    # the standing house's own footprint (the frame holds the ruin's rubble too): what a blast is measured against
    fw, fl = (b[2] - b[0]) * mpp, (b[3] - b[1]) * mpp
    lines.append(f"  house{n}: {{ w: {W + 2 * PAD}, h: {H + 2 * PAD}, wid: {W * RES:.1f}, len: {H * RES:.1f}, fw: {fw:.1f}, fl: {fl:.1f}, ht: {ht:.1f}, ar: '{ar}', en: '{en}' }},")
print('\n'.join(lines))
