"""The air-defence operator mode's pictures (docs/AIR_DEFENSE.md), cut from the owner's generated originals.

  python3 tools/make_airdef.py      # writes sprites/console.webp and sprites/menu/*_ada.webp, prints the screens

In:  assets/originals/console/console_day.png   the operator's console, its four displays pure green (#00FF00)
     assets/originals/menu/ada_battery_night.png the battery at night (the menu's home, the mission's card)
     assets/originals/menu/ada_battery_dusk.png  the battery at dusk (the hangar, the loading screen)
Out: sprites/console.webp   the console, its displays keyed out (the game draws them behind it, src/game/07b-airdef.js),
                            the two rotary knobs' printed pointers taken off their caps (the game draws each pointer
                            where its knob is set)
     sprites/menu/hero_ada.webp, hangar_ada.webp (1688 x 780, as the other aircraft's; the hangar's is the loading
                            screen's too), k_ada.webp (640 x 360)
Nothing is drawn: only cut, keyed and sized.
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


if __name__ == '__main__':
    console(); menu()
