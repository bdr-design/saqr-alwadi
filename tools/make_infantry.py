"""The infantry's poses: the owner's two sheets (generated, seen straight down on flat magenta, every man facing the
top) cut into one picture per side, with where each pose is in it and its size on the ground.

  python3 tools/make_infantry.py && python3 tools/build.py

assets/originals/infantry_red.png    the enemy, 4 x 2: stand, walk (left foot), walk (right foot), kneel aiming,
                                     prone aiming, dead, RPG on the shoulder, missile tube on the shoulder
assets/originals/infantry_blue.png   ours (Saudi Army), 3 x 2: stand, walk, walk, kneel aiming, prone aiming, wounded
  -> sprites/men_red.webp, sprites/men_blue.webp   the poses side by side, at 128 px a metre, graded to the map
     sprites/man_cast.png                           a standing man's shadow on the ground, feet at the bottom
     sprites/ed_pax_{red,aa,blue}.png               the editor's palette icons
     data/men.json                                  per side and pose: [x0, y0, x1, y1] in the picture (px), its size
                                                    (m), and where the man stands in it (m from its centre, + = up/forward)
The sheets are upscaled from 1672 x 941, about 480 px a metre (a prone man and his rifle some 1.9 m; the generator
draws the heads large, so the scale is from the whole figure, not the head). Where the man stands: the middle of his
torso (the picture's thin parts, legs and rifle, eroded away), so a walking frame does not jump against the standing one.
"""
import json, pathlib
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

root = pathlib.Path(__file__).resolve().parent.parent
ORIG = root / 'assets' / 'originals'
SHEET_PPM = 480          # sheet px a metre
PPM = 128                # atlas px a metre
PAD = 8                  # (mipmaps: the poses kept apart)
DUST = np.array([176, 160, 130], np.float32)
SIDES = {
    'red': ((4, 2), ['stand', 'walk1', 'walk2', 'kneel', 'prone', 'dead', 'rpg', 'aa']),
    'blue': ((3, 2), ['stand', 'walk1', 'walk2', 'kneel', 'prone', 'dead']),
}


def key(img):
    """alpha from the distance to pure magenta, and the magenta spill taken off the edges"""
    f = np.asarray(img.convert('RGB')).astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    d = np.sqrt((255 - r) ** 2 + g ** 2 + (255 - b) ** 2)
    a = np.clip((d - 60) / 90, 0, 1)
    spill = np.clip(np.minimum(r, b) - g - 10, 0, None) * (1 - a) ** 0.5
    f[..., 0] -= spill; f[..., 2] -= spill
    return np.clip(f, 0, 255), a


def grade(rgb):
    im = Image.fromarray(rgb.astype(np.uint8))
    im = ImageEnhance.Contrast(ImageEnhance.Color(im).enhance(0.85)).enhance(0.94)
    arr = np.asarray(im).astype(np.float32) * 0.92 + DUST * 0.08
    return np.clip(arr, 0, 255)


def cells(side):
    (nc, nr), names = SIDES[side]
    sheet = Image.open(ORIG / f'infantry_{side}.png')
    W, H = sheet.size
    rgb, a = key(sheet)
    out = []
    for i, name in enumerate(names):
        cx, cy = i % nc, i // nc
        x0, x1, y0, y1 = W * cx // nc, W * (cx + 1) // nc, H * cy // nr, H * (cy + 1) // nr
        ca = a[y0:y1, x0:x1]
        # specks the key left: only what is joined to something sizeable
        m = Image.fromarray((ca > 0.5).astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(9))
        lab = np.asarray(m) > 0
        ys, xs = np.nonzero(lab & (ca > 0.1))
        bx0, bx1, by0, by1 = xs.min(), xs.max() + 1, ys.min(), ys.max() + 1
        crgb = grade(rgb[y0:y1, x0:x1][by0:by1, bx0:bx1])
        cal = ca[by0:by1, bx0:bx1] * lab[by0:by1, bx0:bx1]
        # where he stands: the torso, the thin parts eroded away
        core = np.asarray(Image.fromarray((cal > 0.5).astype(np.uint8) * 255).filter(ImageFilter.MinFilter(41))) > 0
        yy, xx = np.nonzero(core) if core.any() else np.nonzero(cal > 0.5)
        ax = (xx.mean() - (bx1 - bx0) / 2) / SHEET_PPM; ay = -(yy.mean() - (by1 - by0) / 2) / SHEET_PPM
        im = Image.fromarray(np.dstack([crgb, cal * 255]).astype(np.uint8), 'RGBA')
        w, h = round(im.width * PPM / SHEET_PPM), round(im.height * PPM / SHEET_PPM)
        out.append((name, im.resize((w, h), Image.LANCZOS), round(ax, 3), round(ay, 3)))
    return out


def atlas(side, cs):
    # one row, in order
    W = sum(im.width + 2 * PAD for _, im, _, _ in cs); H = max(im.height for _, im, _, _ in cs) + 2 * PAD
    at = Image.new('RGBA', (W, H), (0, 0, 0, 0)); poses = {}; x = 0
    for name, im, ax, ay in cs:
        at.paste(im, (x + PAD, PAD))
        poses[name] = [x + PAD, PAD, x + PAD + im.width, PAD + im.height, round(im.width / PPM, 3), round(im.height / PPM, 3), ax, ay]
        x += im.width + 2 * PAD
    at.save(root / 'sprites' / f'men_{side}.webp', quality=88, method=6)
    return {'w': W, 'h': H, 'poses': poses}


def cast():
    """a standing man's shadow, 0.6 m across, 1.8 m from the feet (bottom) to the head (top)"""
    W, H = 48, 144; m = W / 0.6
    yy, xx = np.mgrid[0:H, 0:W]; x = (xx + 0.5 - W / 2) / m; y = (H - yy - 0.5) / m
    legs = ((np.abs(x - 0.07) < 0.06) | (np.abs(x + 0.07) < 0.06)) & (y < 0.85) & (y > 0)
    torso = (np.abs(x) < 0.19 * np.clip((y - 0.8) / 0.12, 0.6, 1)) & (y >= 0.8) & (y < 1.42)
    arms = (np.abs(x) < 0.25) & (y > 1.0) & (y < 1.38)
    rifle = (np.abs(x - 0.22 + (y - 1.0) * 0.25) < 0.03) & (y > 0.75) & (y < 1.4)
    head = ((x / 0.1) ** 2 + ((y - 1.55) / 0.12) ** 2) <= 1
    a = Image.fromarray(((legs | torso | arms | rifle | head) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7))
    Image.merge('RGBA', (Image.new('L', (W, H), 255),) * 3 + (a,)).save(root / 'sprites' / 'man_cast.png')


def main():
    data = {}
    for side in SIDES:
        data[side] = atlas(side, cells(side))
        p = data[side]['poses']
        print(side, f"{data[side]['w']}x{data[side]['h']}", ', '.join(f'{k} {v[4]}x{v[5]} m' for k, v in p.items()),
              (root / 'sprites' / f'men_{side}.webp').stat().st_size // 1024, 'KB')
    cast()
    # the editor's palette: a man of each kind, standing (the missile team's with its tube), 96 px tall
    for name, side, pose in (('red', 'red', 'stand'), ('aa', 'red', 'aa'), ('blue', 'blue', 'stand')):
        A = Image.open(root / 'sprites' / f'men_{side}.webp'); q = data[side]['poses'][pose]
        im = A.crop(tuple(q[:4])); im = im.resize((round(im.width * 96 / im.height), 96), Image.LANCZOS)
        im.save(root / 'sprites' / f'ed_pax_{name}.png')
    (root / 'data' / 'men.json').write_text(json.dumps(data, separators=(',', ':')) + '\n')


if __name__ == '__main__':
    main()
