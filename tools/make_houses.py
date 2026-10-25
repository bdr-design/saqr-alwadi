"""House sprites from the owner's sheet of four houses (assets/originals/houses_sheet.png).

The renders are three-quarter views; the sensor looks down on the valley like a satellite, so each house keeps only
what is seen from above: its roof (and, for the courtyard house, the yard), stretched back to its true depth. The
background is the black connected to the crop's edge. Writes sprites/house<n>.png and house<n>_shadow.png and prints
the HOUSE lines for src/game.src.html.

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
DUST = np.array([176, 160, 130], np.float32)

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
    alpha = Image.fromarray(np.where(bg, 0, 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    return alpha

lines = []
for H in HOUSES:
    c = sheet.crop(H['box'])
    alpha = cut(c)
    # the same grade as the vehicles: a little less colour and contrast, a little valley dust
    c = ImageEnhance.Color(c).enhance(0.8)
    c = ImageEnhance.Contrast(c).enhance(0.92)
    arr = np.asarray(c, np.float32) * 0.88 + DUST * 0.12
    c = Image.fromarray(arr.clip(0, 255).astype(np.uint8))
    rgba = c.convert('RGBA'); rgba.putalpha(alpha)
    rgba = rgba.crop(rgba.getbbox())
    W, D = rgba.size
    D2 = round(D * H['stretch'])
    # longest side 420 px (as the long vehicles), with the padding the game expects
    k = 400 / max(W, D2)
    rgba = rgba.resize((round(W * k), round(D2 * k)), Image.LANCZOS)
    # as soft as the map photo under it at full zoom: a sensor, not a render
    rgba = rgba.filter(ImageFilter.GaussianBlur(1.6))
    out = Image.new('RGBA', (rgba.width + 2 * PAD, rgba.height + 2 * PAD), (0, 0, 0, 0)); out.alpha_composite(rgba, (PAD, PAD))
    out.save(root / 'sprites' / f'house{H["n"]}.png')
    sh = Image.new('RGBA', out.size, (255, 255, 255, 0)); sh.putalpha(out.getchannel('A').filter(ImageFilter.GaussianBlur(3)))
    sh.save(root / 'sprites' / f'house{H["n"]}_shadow.png')
    depth = H['w'] * rgba.height / rgba.width
    lines.append(f"  house{H['n']}: {{ w: {out.width}, h: {out.height}, wid: {H['w']:.1f}, len: {depth:.1f}, ht: {H['h']:.1f}, ar: '{H['ar']}' }},")
print('\n'.join(lines))
