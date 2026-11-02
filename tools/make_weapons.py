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

# ---- for the 3D weapon (src/game/11b-observer.js obsWpnMesh): the body's radius along it, and the picture's own light
# taken out of it. The body: for each column, the opaque run through the axis, half its height; the fins are spikes
# on that, so a running low percentile over 9 % of the length leaves the body. The light: the photo is lit from above
# (a bright band, a dark belly); each row's brightness relative to its column's, averaged over the body, divided out,
# so the game's sun lights it. Both scaled to the real diameter in the game (OBS_WPN). -> <id>.json, <id>_alb.webp
import json
for gid in ('jdam', 'lgb', 'agm'):
    pic = np.asarray(Image.open(out / (gid + '.webp')).convert('RGBA')).astype(np.float32)
    H, W = pic.shape[:2]; a = pic[..., 3] / 255
    op = a > 0.5
    rows = np.arange(H)
    cy = float(np.median([rows[op[:, x]].mean() for x in range(W) if op[:, x].any()]))
    c = int(round(cy)); rad = np.zeros(W)
    for x in range(W):
        if not op[c, x]: continue
        t = c
        while t > 0 and op[t - 1, x]: t -= 1
        b = c
        while b < H - 1 and op[b + 1, x]: b += 1
        rad[x] = max(c - t, b - c) + 0.5
    k = max(3, int(W * 0.045))
    body = np.array([np.percentile(rad[max(0, x - k):x + k + 1], 25) for x in range(W)])
    body = np.minimum(body, rad)
    # (fins that span a long stretch, the tail kit's, are not all taken out by that: a bomb's body narrows both ways
    # from its widest, so from the widest point in its middle half the radius only falls, outward each way)
    # (the Barq is a straight tube with its wings mid-body: its radius is the tube's, the median along it)
    if gid == 'agm': body = np.minimum(body, np.median(body[int(W * 0.1):int(W * 0.9)]))
    m0 = int(W * 0.3) + int(np.argmax(body[int(W * 0.3):int(W * 0.7)]))
    for x in range(m0 + 1, W): body[x] = min(body[x], body[x - 1])
    for x in range(m0 - 1, -1, -1): body[x] = min(body[x], body[x + 1])
    # the light profile: brightness by normalised height in the body, over all columns
    lum = pic[..., :3].mean(axis=2); bins = np.zeros(41); cnt = np.zeros(41)
    for x in range(W):
        r = body[x]
        if r < 3: continue
        ys = np.arange(max(0, int(c - r)), min(H, int(c + r) + 1)); m = lum[ys, x].mean() + 1e-3
        u = np.clip(((ys - cy) / r + 1) / 2 * 40, 0, 40).astype(int)
        np.add.at(bins, u, lum[ys, x] / m); np.add.at(cnt, u, 1)
    prof = np.where(cnt > 0, bins / np.maximum(cnt, 1), 1.0); prof = np.clip(prof, 0.35, 2.5)
    rel = np.clip((((rows - cy)[:, None] / np.maximum(body[None, :], 1)) + 1) / 2 * 40, 0, 40).astype(int)
    f = prof[rel]; inside = np.abs(rows - cy)[:, None] <= body[None, :]
    alb = pic.copy(); alb[..., :3] = np.where(inside[..., None], pic[..., :3] / f[..., None], pic[..., :3])
    Image.fromarray(alb.clip(0, 255).astype(np.uint8)).save(out / (gid + '_alb.webp'), quality=90, alpha_quality=100, method=6)
    n = 48; xs = np.linspace(0, W - 1, n).astype(int)
    json.dump({'w': W, 'h': H, 'cy': round(cy, 1), 'r': [round(float(body[x]), 1) for x in xs], 'rmax': round(float(body.max()), 1)},
              open(out / (gid + '.json'), 'w'))
    print(gid, 'axis row', round(cy, 1), 'body radius max', round(float(body.max()), 1), 'px of', H)
