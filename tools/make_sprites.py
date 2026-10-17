"""Rebuild every sprite in sprites/ from the photos in assets/originals/ plus procedural effects.

usage: python3 tools/make_sprites.py [out_dir]        (default: sprites/)

Vehicles  vehicle_<kind>.png (top-down photo on a black background) ->
          <kind>.png          cut out, colour-graded to the map, 320 px long (420 px for vehicles of 7 m and more)
          <kind>_burnt.png    same silhouette, charred, soot and rust
          <kind>_shadow.png   blurred white silhouette; the game tints it black and offsets it along the sun
Fighter   fighter_shemagh_ak.png -> fighter1.png, 256 px tall, turned so the face/boots point up (= forward)
Effects   smoke.png (2x2 atlas), fire.png (2x2 atlas), glow.png, scorch.png, cone.png, person.png
Every photo sprite carries 10 px of transparent padding on each side; SPR / FIGHTER in the game source
account for it, so keep P = 10 or update both.
Prints the real width (m) each vehicle gets from its photo aspect: copy w, h and wid into SPR when a photo changes.
"""
import sys, pathlib
from collections import deque
import numpy as np
from PIL import Image, ImageFilter, ImageEnhance

root = pathlib.Path(__file__).resolve().parent.parent
ORIG = root / 'assets' / 'originals'
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'sprites'
out.mkdir(parents=True, exist_ok=True)
P = 10
DUST = np.array([176, 160, 130], np.float32)
# kind, real length in metres (incl. mirrors / bull bar)
VEHICLES = [('suv', 4.9), ('cargo', 7.5), ('tanker', 8.5), ('hilux', 5.3), ('mrap', 6.4), ('lc79', 5.2), ('launcher', 10.0)]


def cutout(path, thr, blur):
    """Background = near-black region connected to the border; dark parts inside the subject survive."""
    im = Image.open(path).convert('RGB')
    mx = np.asarray(im).astype(np.int16).max(2)
    H, W = mx.shape
    bg = np.zeros((H, W), bool)
    q = deque()
    for x in range(W):
        for y in (0, H - 1):
            if mx[y, x] < thr and not bg[y, x]: bg[y, x] = True; q.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if mx[y, x] < thr and not bg[y, x]: bg[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and not bg[ny, nx] and mx[ny, nx] < thr:
                bg[ny, nx] = True; q.append((ny, nx))
    m = Image.fromarray(((~bg) * 255).astype(np.uint8)).filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(blur))
    bb = m.point(lambda v: 255 if v > 60 else 0).getbbox()
    return Image.merge('RGBA', (*im.split(), m)).crop(bb)


def grade(rgb, color, contrast, dust):
    """Match the photo to the sensor picture: muted colour, a little less contrast, a veil of valley dust."""
    rgb = ImageEnhance.Contrast(ImageEnhance.Color(rgb).enhance(color)).enhance(contrast)
    arr = np.asarray(rgb).astype(np.float32) * (1 - dust) + DUST * dust
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8))


def pad(im):
    c = Image.new('RGBA', (im.width + 2 * P, im.height + 2 * P), (0, 0, 0, 0))
    c.paste(im, (P, P), im)
    return c


def vehicles():
    rng = np.random.default_rng(5)
    for kind, L in VEHICLES:
        fig = cutout(ORIG / f'vehicle_{kind}.png', 24, 1.0)
        w, h = fig.size
        TH = 320 if L < 7 else 420
        TW = round(w * TH / h)
        a = fig.getchannel('A')
        body = Image.merge('RGBA', (*grade(fig.convert('RGB'), 0.8, 0.92, 0.12).split(), a)).resize((TW, TH), Image.LANCZOS)
        pad(body).save(out / f'{kind}.png')
        # burnt wreck: charred, soot-streaked, rust, paint gone; same silhouette
        g = np.asarray(body.convert('L')).astype(np.float32)
        soot = np.asarray(Image.fromarray((rng.random(g.shape) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(5))).astype(np.float32) / 255
        ch = g * 0.22 + 6 + (soot - 0.5) * 24
        rust = np.clip((soot - 0.55) * 4, 0, 1)[..., None] * np.array([46, 20, 6], np.float32)
        burnt = np.clip(np.stack([ch * 1.07, ch * 0.98, ch * 0.9], -1) + rust + rng.normal(0, 5, g.shape + (1,)), 0, 255).astype(np.uint8)
        ba = np.asarray(body.getchannel('A')).astype(np.float32) * np.clip(0.8 + 0.4 * rng.random(g.shape), 0, 1)
        ba = Image.fromarray(ba.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6))
        pad(Image.merge('RGBA', (*Image.fromarray(burnt).split(), ba))).save(out / f'{kind}_burnt.png')
        sh = body.getchannel('A').filter(ImageFilter.GaussianBlur(6))
        pad(Image.merge('RGBA', (Image.new('L', body.size, 255),) * 3 + (sh,))).save(out / f'{kind}_shadow.png')
        print(f"{kind:9s} SPR w: {TW + 2 * P}, h: {TH + 2 * P}, len: {L}, wid: {round(L * w / h, 2)}")


def fighter():
    fig = cutout(ORIG / 'fighter_shemagh_ak.png', 22, 1.2).rotate(180)
    w, h = fig.size
    a = fig.getchannel('A')
    TH = 256
    TW = round(w * TH / h)
    body = Image.merge('RGBA', (*grade(fig.convert('RGB'), 0.82, 0.93, 0.1).split(), a)).resize((TW, TH), Image.LANCZOS)
    pad(body).save(out / 'fighter1.png')
    print(f"fighter1  {TW + 2 * P}x{TH + 2 * P} (FIGHTER = {{ w: 0.607 * {TW + 2 * P} / {TW}, h: 0.80 * {TH + 2 * P} / {TH} }})")


def fbm(n, octaves, seed, gain):
    r = np.random.default_rng(seed)
    acc = np.zeros((n, n)); amp = 1; tot = 0
    for o in range(octaves):
        k = 2 ** (o + 2)
        g = r.random((k + 1, k + 1))
        acc += amp * np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((n, n), Image.BICUBIC)) / 255
        tot += amp; amp *= gain
    return acc / tot


def effects():
    N = 128
    yy, xx = np.mgrid[0:N, 0:N]
    cx = (xx - N / 2 + 0.5) / (N / 2); cy = (yy - N / 2 + 0.5) / (N / 2); rr = np.sqrt(cx ** 2 + cy ** 2)
    # smoke atlas 2x2: overlapping billows (cauliflower edge), lit from the upper left
    atlas = np.zeros((256, 256, 4), np.float32)
    for i in range(4):
        d = fbm(N, 6, 10 + i, 0.6)
        blob = np.zeros((N, N)); rg = np.random.default_rng(40 + i)
        for _ in range(7):
            bx, by, br = rg.uniform(-0.35, 0.35), rg.uniform(-0.35, 0.35), rg.uniform(0.35, 0.6)
            blob = np.maximum(blob, np.clip(1 - np.sqrt((cx - bx) ** 2 + (cy - by) ** 2) / br, 0, 1))
        dens = np.clip((blob ** 0.8) * (0.55 + 0.8 * d) - 0.18, 0, 1)
        dens = np.asarray(Image.fromarray((dens * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.0))).astype(np.float32) / 255
        gy, gx = np.gradient(dens)
        light = np.clip(0.78 + (gx * 0.7 + gy * 0.7) * -7.0, 0.42, 1.18)
        tile = np.zeros((N, N, 4)); tile[..., :3] = (light * (0.9 + 0.1 * d))[..., None] * 255; tile[..., 3] = np.clip(dens * 1.7, 0, 1) * 255
        atlas[(i // 2) * N:(i // 2 + 1) * N, (i % 2) * N:(i % 2 + 1) * N] = tile
    Image.fromarray(np.clip(atlas, 0, 255).astype(np.uint8), 'RGBA').save(out / 'smoke.png')
    # fire atlas 2x2: noisy hot core
    atlas = np.zeros((256, 256, 4), np.float32)
    for i in range(4):
        d = fbm(N, 4, 30 + i, 0.55); core = np.clip(1 - rr, 0, 1)
        v = np.clip(core ** 1.2 * (0.55 + 0.9 * d), 0, 1)
        tile = np.zeros((N, N, 4)); tile[..., 0] = 255; tile[..., 1] = np.clip(v * 1.15, 0, 1) * 235
        tile[..., 2] = np.clip(v ** 2 * 1.2, 0, 1) * 190; tile[..., 3] = np.clip(v ** 1.5 * 1.4, 0, 1) * 255
        atlas[(i // 2) * N:(i // 2 + 1) * N, (i % 2) * N:(i % 2 + 1) * N] = tile
    Image.fromarray(np.clip(atlas, 0, 255).astype(np.uint8), 'RGBA').save(out / 'fire.png')
    # glow: soft round spot (lights, flashes, sparks)
    t = np.zeros((N, N, 4)); t[..., :3] = 255; t[..., 3] = np.clip(1 - rr, 0, 1) ** 2.2 * 255
    Image.fromarray(t.astype(np.uint8), 'RGBA').save(out / 'glow.png')
    # scorch decal left on the ground by a blast
    d = fbm(N, 5, 51, 0.55); streak = 0.5 + 0.5 * np.sin(np.arctan2(cy, cx) * 9 + d * 6)
    v = np.clip(1 - rr * (0.85 + 0.35 * d + 0.15 * streak), 0, 1)
    t = np.zeros((N, N, 4)); t[..., 0] = 22; t[..., 1] = 19; t[..., 2] = 16; t[..., 3] = np.clip(v * 1.6, 0, 1) ** 1.1 * 235
    Image.fromarray(t.astype(np.uint8), 'RGBA').filter(ImageFilter.GaussianBlur(1)).save(out / 'scorch.png')
    # headlight cone: apex at the bottom centre, spreading upward, wide and soft
    W, H = 64, 128
    yy2, xx2 = np.mgrid[0:H, 0:W]; u = (xx2 - W / 2 + 0.5) / (W / 2); v = 1 - (yy2 + 0.5) / H
    lat = np.clip(1 - np.abs(u) / (0.18 + 0.82 * v), 0, 1) ** 1.1
    fall = np.clip(1 - v, 0, 1) ** 1.3 * np.clip(v * 8, 0, 1)
    t = np.zeros((H, W, 4)); t[..., 0] = 255; t[..., 1] = 242; t[..., 2] = 218; t[..., 3] = np.clip(lat * fall * 1.1, 0, 1) * 255
    Image.fromarray(t.astype(np.uint8), 'RGBA').filter(ImageFilter.GaussianBlur(2.5)).save(out / 'cone.png')
    # person blob: used only as the fighters' shadow shape
    S = 32; yy3, xx3 = np.mgrid[0:S, 0:S]; px = xx3 - S / 2 + 0.5; py = yy3 - S / 2 + 0.5
    sh = ((px / 8.5) ** 2 + (py / 5.0) ** 2) <= 1; head = (px ** 2 + (py + 0.5) ** 2) <= 3.4 ** 2
    t = np.zeros((S, S, 4)); t[sh] = [200, 200, 200, 255]; t[head] = [255, 255, 255, 255]
    Image.fromarray(t.astype(np.uint8), 'RGBA').filter(ImageFilter.GaussianBlur(0.6)).save(out / 'person.png')


vehicles()
fighter()
effects()
print('sprites written to', out)
