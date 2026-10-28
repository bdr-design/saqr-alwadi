"""Where the water is on a map, for the mission editor's boats: a mask at a quarter of the map's pixels (about 3.4 m),
white on the water a boat can sail, from the map picture's own sea (bluer than it is red).

  python3 tools/make_water.py       ->  maps/<map>/water.png   (the maps that have a sea: the theatre and the port)

Only the open sea and what joins it (the harbour inside its breakwaters), not the odd blue roof or pool inland; the
piers and the reef's rocks left out; and the shore pulled back some 6 m, so a boat put by the beach is not on it.
"""
import pathlib
import numpy as np
from PIL import Image
from scipy import ndimage

root = pathlib.Path(__file__).resolve().parent.parent
K = 4               # map px a mask px
SHORE = 7           # map px kept off the shore


def picture(m):
    d = root / 'maps' / m / 'tiles' / '0'
    ims = {tuple(map(int, p.stem.split('_'))): Image.open(p).convert('RGB') for p in d.glob('*.jpg')}
    T = ims[(0, 0)].width
    nx = max(i for i, _ in ims) + 1; ny = max(j for _, j in ims) + 1
    W = sum(ims[(i, 0)].width for i in range(nx)); H = sum(ims[(0, j)].height for j in range(ny))
    big = Image.new('RGB', (W, H))
    for (i, j), im in ims.items(): big.paste(im, (i * T, j * T))
    return np.asarray(big).astype(np.int16)


def water(m):
    a = picture(m)
    sea = (a[..., 2] - a[..., 0]) > 18
    # the speckle closed, the one body of water kept, the small islands of land inside it (glints, foam) filled
    # (the picture's edges carried on outward, so the sea running off the map is not eaten back from its edge)
    P = 16
    sea = np.pad(sea, P, mode='edge')
    sea = ndimage.binary_closing(ndimage.binary_opening(sea, iterations=2), iterations=3)
    lab, n = ndimage.label(sea)
    if not n: return None
    sizes = ndimage.sum(sea, lab, range(1, n + 1))
    sea = lab == 1 + int(np.argmax(sizes))
    holes, nh = ndimage.label(~sea)
    hs = ndimage.sum(~sea, holes, range(1, nh + 1))
    for i, s in enumerate(hs):
        if s < 600: sea[holes == i + 1] = True
    sea = ndimage.binary_erosion(sea, iterations=SHORE)[P:-P, P:-P]
    H, W = sea.shape
    q = sea[:H // K * K, :W // K * K].reshape(H // K, K, W // K, K).mean(axis=(1, 3)) > 0.5
    return q, (W, H)


def main():
    for m in ('theater', 'port'):
        q, (W, H) = water(m)
        out = root / 'maps' / m / 'water.png'
        Image.fromarray((q * 255).astype(np.uint8)).convert('1').save(out, optimize=True)
        print(m, f'{W}x{H} ->', f'{q.shape[1]}x{q.shape[0]}', f'{q.mean():.1%} water', out.stat().st_size, 'bytes')


if __name__ == '__main__':
    main()
