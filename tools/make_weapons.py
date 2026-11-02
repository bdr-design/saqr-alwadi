"""The weapons' pictures for the observer's film (src/game/11b-observer.js): the owner's side views on green
(assets/originals/weapons) keyed out, the green spill taken off their edges, cropped to the weapon, nose to the left,
and written with their alpha (sprites/weapons/<id>.webp, 768 px long). Each is laid along its weapon as it flies,
turned about its own axis to face the camera.

  python3 tools/make_weapons.py
"""
import pathlib
import numpy as np
from PIL import Image

root = pathlib.Path(__file__).resolve().parent.parent
src, out = root / 'assets' / 'originals' / 'weapons', root / 'sprites' / 'weapons'
out.mkdir(parents=True, exist_ok=True)
# the game's weapon: its picture (the side views only; agm_flight's three-quarter view and the others are kept for later)
USE = {'jdam': 'jdam', 'lgb': 'lgb', 'agm': 'agm_side', 'aam_long': 'aam_long', 'aam_short': 'aam_short'}
LONG = 768

for gid, name in USE.items():
    im = np.asarray(Image.open(src / (name + '.png')).convert('RGB')).astype(np.float32)
    r, g, b = im[..., 0], im[..., 1], im[..., 2]
    # how green over the other two: the screen is (3, 249, 4); the weapons are greys, olive drab and metal
    k = g - np.maximum(r, b)
    a = np.clip(1 - (k - 25) / 70, 0, 1)
    # the spill: green that the edges and the metal took from the screen, brought back to the other two's level
    gn = np.where(g > np.maximum(r, b), np.minimum(g, np.maximum(r, b) * 1.02 + 3), g)
    rgba = np.dstack([r, gn, b, a * 255]).clip(0, 255).astype(np.uint8)
    ys, xs = np.where(a > 0.05)
    pic = Image.fromarray(rgba).crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    w, h = pic.size
    pic = pic.resize((LONG, max(1, round(h * LONG / w))), Image.LANCZOS)
    pic.save(out / (gid + '.webp'), lossless=False, quality=90, alpha_quality=100, method=6)
    print(gid, pic.size, round((out / (gid + '.webp')).stat().st_size / 1024), 'KB')
