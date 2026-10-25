"""House sprites from the owner's sheet of four houses (assets/originals/houses_sheet.png), made to sit in the map.

The renders are three-quarter views; the sensor looks down on the valley like a satellite, so each house keeps only
what is seen from above: its roof (and, for the courtyard house, the yard), stretched back to its true depth. Then it
is made to belong to the map photo rather than float on it:
  - colour: moved onto the palette of the map's own light ground (measured from the level-2 tiles);
  - detail: taken down to the map photo's resolution (about 0.22 m a pixel) and given the same grain;
  - ground: a cleared plot cut from the map itself (flat wadi floor), feathered, to lie under each house.
Writes sprites/house<n>.png, house<n>_shadow.png and house_pad.png, and prints the HOUSE lines for the game.

  python3 tools/make_houses.py
"""
import pathlib
import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

root = pathlib.Path(__file__).resolve().parent.parent
sheet = Image.open(root / 'assets' / 'originals' / 'houses_sheet.png').convert('RGB')
# x0, x1: the house's width on the sheet; y0, y1: from the back of the roof to the front parapet (or yard wall);
# stretch: back to true depth (the render looks down at about 45°, the courtyard house more steeply);
# w, h: real width and height in metres (h casts the shadow)
HOUSES = [
    dict(n=1, box=(120, 50, 540, 250), stretch=1.42, w=11.0, h=13.0, ar='بيت برجي'),
    dict(n=2, box=(675, 80, 1190, 502), stretch=1.12, w=16.0, h=5.0, ar='بيت بحوش'),
    dict(n=3, box=(112, 636, 512, 788), stretch=1.42, w=10.0, h=8.0, ar='بيت حجري'),
    dict(n=4, box=(622, 656, 1212, 912), stretch=1.42, w=18.0, h=8.0, ar='بيت بفناء'),
]
PAD = 10
MAP_RES = 0.22          # metres per pixel of real detail in the map photo where the player zooms in
PLOT = (806, 140)       # a flat patch of light wadi floor beside the road (map pixels), found by its low texture
rng = np.random.default_rng(7)

def map_l2(mx, my, w, h):
    """A piece of the map at level 2 (4 px per map pixel)."""
    out = Image.new('RGB', (w * 4, h * 4))
    for ty in range(int(my * 4) // 1024, int((my + h) * 4) // 1024 + 1):
        for tx in range(int(mx * 4) // 1024, int((mx + w) * 4) // 1024 + 1):
            f = root / 'tiles' / '2' / f'{tx}_{ty}.jpg'
            if f.exists(): out.paste(Image.open(f).convert('RGB'), (tx * 1024 - int(mx * 4), ty * 1024 - int(my * 4)))
    return out

def ycc(img): return np.asarray(img.convert('YCbCr'), np.float32)

# the map's light ground (where houses stand): its brightness and colour, from the valley floor tiles
ground = np.concatenate([ycc(Image.open(f)).reshape(-1, 3) for f in sorted((root / 'tiles' / '2').glob('*.jpg'))])
ground = ground[ground[:, 0] > np.percentile(ground[:, 0], 55)]
G_MEAN, G_STD = ground.mean(0), ground.std(0)

def cut(img):
    # background: dark pixels connected to the border (flood fill), so dark parts inside the house stay
    a = np.asarray(img, np.int32)
    dark = a.max(axis=2) < 34
    h, w = dark.shape
    bg = np.zeros_like(dark)
    stack = [(y, x) for x in range(w) for y in (0, h - 1) if dark[y, x]] + [(y, x) for y in range(h) for x in (0, w - 1) if dark[y, x]]
    for y, x in stack: bg[y, x] = True
    while stack:
        y, x = stack.pop()
        for yy, xx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= yy < h and 0 <= xx < w and dark[yy, xx] and not bg[yy, xx]:
                bg[yy, xx] = True; stack.append((yy, xx))
    return Image.fromarray(np.where(bg, 0, 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3))

def to_map_palette(img, alpha):
    # colour transfer onto the map's light ground: its colour cast fully, its brightness most of the way (a house
    # stays a touch lighter than the earth around it), its own contrast kept but softened like the photo's
    a = ycc(img); m = np.asarray(alpha) > 128
    mean, std = a[m].mean(0), a[m].std(0) + 1e-3
    out = a.copy()
    out[..., 0] = (a[..., 0] - mean[0]) * 0.8 + mean[0] * 0.3 + (G_MEAN[0] + 6) * 0.7
    # colour differences shrink toward the ground's (never grow), and fade in the shadows: dark is grey-brown, not blue
    dim = np.clip(a[..., :1] / 130, 0.25, 1)
    for c in (1, 2): out[..., c] = (a[..., c] - mean[c]) * min(G_STD[c] / std[c], 0.7) * dim[..., 0] + G_MEAN[c]
    return Image.fromarray(out.clip(0, 255).astype(np.uint8), 'YCbCr').convert('RGB')

lines = []
for H in HOUSES:
    c = sheet.crop(H['box']); alpha = cut(c)
    c = to_map_palette(c, alpha)
    rgba = c.convert('RGBA'); rgba.putalpha(alpha); rgba = rgba.crop(rgba.getbbox())
    W, D = rgba.size; D2 = round(D * H['stretch'])
    k = 400 / max(W, D2); sw, sd = round(W * k), round(D2 * k)
    rgba = rgba.resize((sw, sd), Image.LANCZOS)
    # down to the map photo's detail and back, with its grain: at full zoom the house is as soft as the ground
    lw = max(8, round(H['w'] / MAP_RES)); ld = max(8, round(lw * sd / sw))
    small = rgba.resize((lw, ld), Image.LANCZOS)
    arr = np.asarray(small, np.float32)
    arr[..., :3] += rng.normal(0, 5.5, arr[..., :3].shape)
    small = Image.fromarray(arr.clip(0, 255).astype(np.uint8), 'RGBA')
    rgba = small.resize((sw, sd), Image.BICUBIC).filter(ImageFilter.GaussianBlur(sw / lw * 0.35))
    out = Image.new('RGBA', (sw + 2 * PAD, sd + 2 * PAD), (0, 0, 0, 0)); out.alpha_composite(rgba, (PAD, PAD))
    out.save(root / 'sprites' / f'house{H["n"]}.png')
    sh = Image.new('RGBA', out.size, (255, 255, 255, 0)); sh.putalpha(out.getchannel('A').filter(ImageFilter.GaussianBlur(5)))
    sh.save(root / 'sprites' / f'house{H["n"]}_shadow.png')
    depth = H['w'] * sd / sw
    lines.append(f"  house{H['n']}: {{ w: {out.width}, h: {out.height}, wid: {H['w']:.1f}, len: {depth:.1f}, ht: {H['h']:.1f}, ar: '{H['ar']}' }},")

# the cleared plot: the map's own flat wadi floor, a little lighter (trodden earth), feathered out at uneven edges
plot = map_l2(PLOT[0] - 16, PLOT[1] - 16, 32, 32).resize((256, 256), Image.BICUBIC)
plot = ImageEnhance.Brightness(plot).enhance(1.06)
yy, xx = np.mgrid[0:256, 0:256] / 255.0 * 2 - 1
edge = np.maximum(np.abs(xx), np.abs(yy)) * 0.55 + np.hypot(xx, yy) * 0.45
noise = np.asarray(Image.fromarray((rng.random((16, 16)) * 255).astype(np.uint8)).resize((256, 256), Image.BICUBIC), np.float32) / 255
mask = np.clip((0.95 - edge - (noise - 0.5) * 0.35) / 0.3, 0, 1)
pad = plot.convert('RGBA'); pad.putalpha(Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(4)))
pad.save(root / 'sprites' / 'house_pad.png')
print('\n'.join(lines))
