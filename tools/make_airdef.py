"""The air-defence operator mode's pictures (docs/AIR_DEFENSE.md), cut from the owner's generated originals.

  python3 tools/make_airdef.py      # writes sprites/console.webp and sprites/menu/*_ada.webp, prints the screens

In:  assets/originals/console/console_day.png   the operator's console, its four displays pure green (#00FF00)
     assets/originals/menu/ada_battery_night.png the battery at night (the menu's home, the mission's card)
     assets/originals/menu/ada_battery_dusk.png  the battery at dusk (the hangar, the loading screen)
     assets/originals/ground3d/ada_sky.png       the threats from their sides (2 x 4 panels on magenta: the drone from
                                                 above, the side, diving, the front; the cruise missile from above and
                                                 the side; the ballistic one's reentry vehicle; the interceptor)
Out: sprites/console.webp   the console, its displays keyed out (the game draws them behind it, src/game/07b-airdef.js),
                            the two rotary knobs' printed pointers taken off their caps (the game draws each pointer
                            where its knob is set)
     sprites/menu/hero_ada.webp, hangar_ada.webp (1688 x 780, as the other aircraft's; the hangar's is the loading
                            screen's too), k_ada.webp (640 x 360)
     sprites/ada_sky.webp   the tracking camera's pictures of them (07b-airdef.js adcCam): the eight panels keyed, each
                            in a 256 px cell, in three rows: day television (dimmed for the night), thermal white hot,
                            thermal black hot. The thermal rows from the photograph's own shading (its body a little
                            warmer than the sky) and a hot spot where its motor is (the reentry vehicle hot all over)
Nothing is drawn but the thermal rows' heat: only cut, keyed and sized.
"""
import os
import numpy as np
from PIL import Image
from make_cockpit import key, rects

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ORIG = os.path.join(ROOT, 'assets', 'originals')
OUT = os.path.join(ROOT, 'sprites')

# the knobs' caps, photo px: the top's ellipse (centre, radii) and its printed pointer bar's two ends, measured on the
# original (the bar crosses the cap from its lower left to its rim at the top right; the tick mark past the rim is the
# panel's, and stays)
KNOBS = [((597, 713, 23, 14), (584.5, 724.5), (606.5, 699.5)), ((712, 713, 23, 14), (701.5, 724.5), (720.5, 699.5))]


def unpoint(im):
    """Each knob's printed pointer taken off its cap: the bar's pixels (within 4 px of its line) filled in from round
    them by a harmonic fill (each the mean of its four neighbours, again until it settles), the cap's shading kept."""
    a = np.asarray(im).astype(np.float32)
    for (cx, cy, rx, ry), (ax, ay), (bx, by) in KNOBS:
        x0, y0, x1, y1 = cx - rx - 8, cy - ry - 14, cx + rx + 9, cy + ry + 9
        p = a[y0:y1, x0:x1, :3].copy()
        yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
        dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy
        t = np.clip(((xx - ax) * dx + (yy - ay) * dy) / L2, -0.06, 1.0)
        # (its dark shadow lies along its right: the line taken a pixel that way, and 4 px either side of it)
        m = np.hypot(xx - (ax + t * dx + 0.8), yy - (ay + t * dy + 0.6)) < 4.0
        p[m] = p[~m].mean(0)
        for _ in range(600):
            avg = (np.roll(p, 1, 0) + np.roll(p, -1, 0) + np.roll(p, 1, 1) + np.roll(p, -1, 1)) / 4
            p[m] = avg[m]
        a[y0:y1, x0:x1, :3] = p
        print('knob', (cx, cy), 'pointer px taken off:', int(m.sum()))
    return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8), im.mode)


def console():
    im, grn = key(os.path.join(ORIG, 'console', 'console_day.png'))
    im = unpoint(im)
    im.save(os.path.join(OUT, 'console.webp'), 'WEBP', quality=88, method=6)
    r = rects(grn, np.asarray(im)[..., 3])
    print('console', im.size, 'screens (x, y, w, h):', r, os.path.getsize(os.path.join(OUT, 'console.webp')) // 1024, 'KB')


def cover(src, w, h):
    """The picture cut to w x h about its middle (its own aspect kept: cropped, never stretched)."""
    im = Image.open(src).convert('RGB'); W, H = im.size
    k = max(w / W, h / H); im = im.resize((round(W * k), round(H * k)), Image.LANCZOS)
    x0, y0 = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x0, y0, x0 + w, y0 + h))


def menu():
    night, dusk = os.path.join(ORIG, 'menu', 'ada_battery_night.png'), os.path.join(ORIG, 'menu', 'ada_battery_dusk.png')
    for name, src, w, h in (('hero_ada', night, 1688, 780), ('hangar_ada', dusk, 1688, 780), ('k_ada', night, 640, 360)):
        p = os.path.join(OUT, 'menu', name + '.webp'); cover(src, w, h).save(p, 'WEBP', quality=75, method=6)
        print(name, os.path.getsize(p) // 1024, 'KB')


# the sky sheet's panels: its motor's place on the cropped picture (u, v from its top left; None: none seen) and how
# hot the body is (0-1 over the sky)
# (the night sky is cold to a thermal camera: a body at the air's warmth stands out from it, mid grey, the motor white)
# (the drone head on: its pusher engine hidden behind it, none drawn; the game adds it seen from behind. The reentry
# vehicle hot all over)
SKY = [((0.5, 0.95), 0.5), ((0.93, 0.5), 0.5), ((0.86, 0.1), 0.5), (None, 0.45),
       ((0.5, 0.98), 0.52), ((0.98, 0.5), 0.52), ((0.1, 0.92), 0.88), ((0.99, 0.5), 0.55)]
CELL = 256


def sky():
    im = Image.open(os.path.join(ORIG, 'ground3d', 'ada_sky.png')).convert('RGB'); W, H = im.size; pw, ph = W // 4, H // 2
    rows = [Image.new('RGBA', (CELL * 8, CELL), (0, 0, 0, 0)) for _ in range(3)]
    sizes = []
    for i, (hp, warm) in enumerate(SKY):
        r, c = divmod(i, 4)
        p = np.asarray(im.crop((c * pw + 4, r * ph + 4, (c + 1) * pw - 4, (r + 1) * ph - 4))).astype(np.float32)
        k = np.clip(((p[..., 0] - p[..., 1]) + (p[..., 2] - p[..., 1]) - 120) / 90, 0, 1)
        ys, xs = np.where(k < 0.5); p, k = p[ys.min():ys.max() + 1, xs.min():xs.max() + 1], k[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
        g = np.minimum(p[..., 0], np.maximum(p[..., 1], np.minimum(p[..., 0], p[..., 2]) * 0.6))   # (the magenta's spill)
        p[..., 0] = np.where(k > 0.02, np.minimum(p[..., 0], g + 20), p[..., 0]); p[..., 2] = np.where(k > 0.02, np.minimum(p[..., 2], g + 20), p[..., 2])
        h, w = k.shape; s = (CELL - 16) / max(w, h); nw, nh = max(1, round(w * s)), max(1, round(h * s))
        al = (1 - k) * 255
        lum = (p[..., 0] * 0.3 + p[..., 1] * 0.59 + p[..., 2] * 0.11) / 255
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        hot = np.exp(-(((xx - hp[0] * w) ** 2 + (yy - hp[1] * h) ** 2) / (0.07 * max(w, h)) ** 2)) if hp else 0 * xx
        th = np.clip(warm + 0.18 * lum + 0.85 * hot, 0, 1) * 255
        tv = p * (0.16 if i != 6 else 0.9)   # (the television at night: a dim shape close in; the reentry vehicle glows)
        ox, oy = i * CELL + (CELL - nw) // 2, (CELL - nh) // 2
        for row, rgb in zip(rows, (tv, np.repeat(th[..., None], 3, 2), np.repeat(255 - th[..., None], 3, 2))):
            a = np.dstack([rgb, al]).clip(0, 255).astype(np.uint8)
            row.alpha_composite(Image.fromarray(a, 'RGBA').resize((nw, nh), Image.LANCZOS), (ox, oy))
        sizes.append((nw, nh))
    out = Image.new('RGBA', (CELL * 8, CELL * 3), (0, 0, 0, 0))
    for j, row in enumerate(rows): out.alpha_composite(row, (0, j * CELL))
    q = os.path.join(OUT, 'ada_sky.webp'); out.save(q, 'WEBP', quality=82, method=6)
    print('ada_sky', out.size, os.path.getsize(q) // 1024, 'KB', 'sizes (w, h):', sizes)


if __name__ == '__main__':
    import sys
    if sys.argv[1:] == ['sky']: sky()
    else: console(); menu(); sky()
