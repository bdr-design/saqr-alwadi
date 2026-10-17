"""Extract the road centreline from the map -> data/road.json.

usage: python3 tools/extract_road.py valley_x4.png [check_dir]

valley_x4.png is the x4 Real-ESRGAN map (tools/upscale.py), not stored in git.
Output: [[x, y], ...] in ORIGINAL map pixels (1672x941), one point every 2 px (= 1.7 m at 0.85 m/px),
running north (top) to south (bottom). The game measures distance along it in metres.

Method: hand-picked coarse points -> Catmull-Rom densify -> each point slides across the road (+-4.5 px)
to the brightest pixel of the dirt track, with a pull toward the centre so it never jumps into the wadi
-> moving-average smooth -> resample at even spacing. With check_dir it also writes two crops with the
line drawn in red for a visual check. To re-route the road, edit COARSE.
"""
import sys, json, pathlib
import numpy as np
from PIL import Image, ImageFilter, ImageDraw
Image.MAX_IMAGE_PIXELS = None
root = pathlib.Path(__file__).resolve().parent.parent
COARSE = [(895, 0), (882, 25), (862, 50), (842, 75), (830, 100), (826, 125), (827, 150), (835, 175), (850, 200), (870, 225),
          (885, 250), (895, 275), (902, 300), (907, 325), (920, 350), (935, 375), (948, 400), (960, 430), (968, 455), (970, 480),
          (966, 500), (960, 520), (948, 537), (935, 550), (918, 567), (900, 585), (886, 603), (875, 625), (871, 650), (872, 675),
          (880, 693), (890, 710), (896, 730), (897, 750), (892, 773), (880, 795), (866, 813), (850, 830), (838, 850), (828, 875),
          (820, 900), (816, 920), (812, 941)]
x4 = sys.argv[1]
L = np.asarray(Image.open(x4).convert('L').filter(ImageFilter.GaussianBlur(3))).astype(np.float32)


def catmull_rom(P, n):
    out = []
    Q = np.vstack([P[0], P, P[-1]])
    for i in range(1, len(Q) - 2):
        p0, p1, p2, p3 = Q[i - 1], Q[i], Q[i + 1], Q[i + 2]
        for t in np.linspace(0, 1, n, endpoint=False):
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
    out.append(P[-1])
    return np.array(out)


D = catmull_rom(np.array(COARSE, float), 6)
offs = np.linspace(-4.5, 4.5, 37)
ref = []
for i, p in enumerate(D):
    t = D[min(i + 1, len(D) - 1)] - D[max(i - 1, 0)]
    t /= np.linalg.norm(t) + 1e-9
    n = np.array([-t[1], t[0]])
    vals = []
    for o in offs:
        x, y = (int(round(c)) for c in (p + n * o) * 4)
        vals.append(L[y, x] if 0 <= x < L.shape[1] and 0 <= y < L.shape[0] else -1)
    ref.append(p + n * offs[int(np.argmax(np.array(vals) - 0.8 * np.abs(offs)))])
R = np.array(ref)
K = 5
Rs = np.array([R[max(0, i - K):min(len(R), i + K + 1)].mean(0) for i in range(len(R))])
Rs[0], Rs[-1] = R[0], R[-1]
s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(Rs, axis=0), axis=1))])
ss = np.arange(0, s[-1], 2.0)
road = [[round(float(x), 2), round(float(y), 2)] for x, y in zip(np.interp(ss, s, Rs[:, 0]), np.interp(ss, s, Rs[:, 1]))]
json.dump(road, open(root / 'data' / 'road.json', 'w'))
print('points', len(road), 'length', round(s[-1]), 'px =', round(s[-1] * 0.85), 'm')
if len(sys.argv) > 2:
    img = Image.open(x4).resize((3344, 1882))
    ImageDraw.Draw(img).line([(x * 2, y * 2) for x, y in road], fill=(255, 0, 0), width=1)
    img.crop((1500, 0, 2100, 1000)).save(pathlib.Path(sys.argv[2]) / 'road_check1.png')
    img.crop((1500, 900, 2100, 1882)).save(pathlib.Path(sys.argv[2]) / 'road_check2.png')
