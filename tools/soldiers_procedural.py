# Top-down militia fighters rendered from a height field.
# Every body part is a solid with a real height above the ground; a z-buffer resolves what covers what,
# normals come from the height field, and light falls from almost straight above so the sprite can rotate.
# Atlas: 8 variants (columns) x 4 walk frames (rows), 128 px cells; one cell = 1.6 m square.
import math
import numpy as np
from PIL import Image, ImageFilter

SS = 4
CELL = 128
C = CELL * SS
PPM = C / 1.6                                  # px per metre at supersampled scale
LIGHT = np.array([-0.24, -0.30, 0.92]); LIGHT /= np.linalg.norm(LIGHT)
YY, XX = np.mgrid[0:C, 0:C].astype(np.float32)
MX, MY = (XX - C / 2) / PPM, (YY - C / 2) / PPM   # metres, +y toward the back of the figure

def noise(rng, scale, octaves=3):
    acc = np.zeros((C, C), np.float32); amp = 1; tot = 0
    for o in range(octaves):
        k = max(2, int(scale * 2 ** o))
        g = rng.random((k + 1, k + 1)).astype(np.float32)
        acc += amp * np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((C, C), Image.BICUBIC)).astype(np.float32) / 255
        tot += amp; amp *= 0.5
    return acc / tot

class Fig:
    def __init__(self, rng):
        self.rng = rng
        self.H = np.full((C, C), -1.0, np.float32)
        self.A = np.zeros((C, C, 3), np.float32)

    def _put(self, sel, h, alb):
        cur = self.H[sel]
        win = h > cur
        idx = tuple(a[win] for a in np.nonzero(sel))
        self.H[idx] = h[win]
        self.A[idx] = alb[idx] if alb.ndim == 3 else alb

    def ellipsoid(self, cx, cy, rx, ry, z0, rz, alb, rot=0.0):
        ca, sa = math.cos(rot), math.sin(rot)
        lx = (MX - cx) * ca + (MY - cy) * sa; ly = -(MX - cx) * sa + (MY - cy) * ca
        q = (lx / rx) ** 2 + (ly / ry) ** 2
        sel = q < 1
        h = z0 + rz * np.sqrt(np.clip(1 - q[sel], 0, 1))
        self._put(sel, h, alb)

    def capsule(self, a, b, r, za, zb, alb, flat=0.8):
        ax, ay = a; bx, by = b
        dx, dy = bx - ax, by - ay; L2 = dx * dx + dy * dy or 1e-9
        t = np.clip(((MX - ax) * dx + (MY - ay) * dy) / L2, 0, 1)
        px, py = ax + dx * t, ay + dy * t
        d2 = (MX - px) ** 2 + (MY - py) ** 2
        sel = d2 < r * r
        h = (za + (zb - za) * t[sel]) + np.sqrt(np.clip(r * r - d2[sel], 0, None)) * flat
        self._put(sel, h, alb)

    def box(self, cx, cy, hw, hh, z0, rz, alb, rot=0.0, p=4.0):
        ca, sa = math.cos(rot), math.sin(rot)
        lx = (MX - cx) * ca + (MY - cy) * sa; ly = -(MX - cx) * sa + (MY - cy) * ca
        q = np.abs(lx / hw) ** p + np.abs(ly / hh) ** p
        sel = q < 1
        h = z0 + rz * np.clip(1 - q[sel], 0, 1) ** 0.25
        self._put(sel, h, alb)

    def render(self):
        H = self.H
        cov = (H > -0.5).astype(np.float32)
        Hs = np.where(H > -0.5, H, 0)
        gy, gx = np.gradient(Hs * PPM)
        gx = np.clip(gx, -6, 6); gy = np.clip(gy, -6, 6)
        n = np.dstack([-gx, -gy, np.ones_like(gx)]); n /= np.linalg.norm(n, axis=2, keepdims=True)
        lam = np.clip((n * LIGHT).sum(2), 0, 1)
        blur = np.asarray(Image.fromarray(np.clip(Hs / 2 * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(PPM * 0.035))).astype(np.float32) / 255 * 2
        cav = np.clip(1 - 2.6 * np.clip(blur - Hs, 0, None), 0.55, 1)
        low = 0.8 + 0.2 * np.clip(Hs / 1.5, 0, 1)
        shade = (0.42 + 0.66 * lam) * cav * low
        col = np.clip(self.A * shade[..., None] + self.rng.normal(0, 2.5, (C, C, 1)), 0, 255)
        img = np.dstack([col, cov * 255]).astype(np.uint8)
        return Image.fromarray(img, 'RGBA').resize((CELL, CELL), Image.LANCZOS)

# ---------- materials ----------
def fabric(rng, rgb, wr=0.12):
    n1, n2 = noise(rng, 3), noise(rng, 18, 2)
    v = 1 + (n1 - 0.5) * wr * 2 + (n2 - 0.5) * 0.12
    return np.array(rgb, np.float32)[None, None] * v[..., None]

def camo(rng, cols, scale=7):
    t = np.zeros((C, C, 3), np.float32) + np.array(cols[0], np.float32)
    for i, c in enumerate(cols[1:]):
        n = noise(rng, scale + 2 * i, 2)
        t[n > 0.56 - 0.02 * i] = c
    return t * (1 + (noise(rng, 18, 2)[..., None] - 0.5) * 0.12)

def shemagh(rng, base, mark):
    u, v = (XX + YY) / 9.0, (XX - YY) / 9.0
    lat = (((np.floor(u) + np.floor(v)) % 2) == 0) & ((u % 1) < 0.5)
    t = np.zeros((C, C, 3), np.float32) + np.array(base, np.float32)
    t[lat] = mark
    t = np.asarray(Image.fromarray(t.astype(np.uint8)).filter(ImageFilter.GaussianBlur(1.6))).astype(np.float32)
    return t * (1 + (noise(rng, 6, 2)[..., None] - 0.5) * 0.25)

def wood(rng):
    g = noise(rng, 30, 2)
    return np.array((112, 70, 38), np.float32)[None, None] * (0.85 + 0.3 * g[..., None])

SKIN = (156, 112, 82)
METAL = np.array((44, 44, 44), np.float32)

# ---------- weapons ----------
def along(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)

def ak(f, rear, muz, zr, zm):
    W = wood(f.rng)
    def seg(t0, t1, r, alb):
        f.capsule(along(rear, muz, t0), along(rear, muz, t1), r, zr + (zm - zr) * t0, zr + (zm - zr) * t1, alb, flat=0.6)
    seg(0.00, 0.30, 0.024, W)          # stock
    seg(0.29, 0.58, 0.022, METAL)      # receiver
    seg(0.58, 0.76, 0.020, W)          # handguard
    seg(0.76, 1.00, 0.008, METAL * 0.8)  # barrel
    mx, my = along(rear, muz, 0.52)
    ang = math.atan2(muz[1] - rear[1], muz[0] - rear[0])
    nx, ny = -math.sin(ang), math.cos(ang)
    f.capsule((mx, my), (mx + nx * 0.07 + math.cos(ang) * 0.03, my + ny * 0.07 + math.sin(ang) * 0.03), 0.014, zr - 0.05, zr - 0.08, METAL * 0.9, flat=0.5)

def pkm(f, rear, muz, zr, zm):
    def seg(t0, t1, r, alb):
        f.capsule(along(rear, muz, t0), along(rear, muz, t1), r, zr + (zm - zr) * t0, zr + (zm - zr) * t1, alb, flat=0.6)
    seg(0.00, 0.25, 0.022, METAL * 0.9)
    seg(0.25, 0.55, 0.030, METAL)
    seg(0.55, 1.00, 0.011, METAL * 0.8)
    bx, by = along(rear, muz, 0.42)
    f.box(bx - 0.06, by + 0.02, 0.05, 0.04, zr - 0.15, 0.1, np.array((72, 78, 54), np.float32))

def rpg(f, rear, front, z):
    f.capsule(rear, front, 0.040, z, z, fabric(f.rng, (70, 82, 54), 0.05), flat=0.9)
    hx, hy = front
    ang = math.atan2(front[1] - rear[1], front[0] - rear[0])
    tip = (hx + math.cos(ang) * 0.17, hy + math.sin(ang) * 0.17)
    f.capsule(front, tip, 0.048, z + 0.01, z + 0.01, fabric(f.rng, (86, 90, 70), 0.05), flat=0.9)

# ---------- a fighter ----------
def fighter(v, frame, seed):
    rng = np.random.default_rng(seed)
    f = Fig(rng)
    s = [0.0, 0.22, 0.0, -0.22][frame]
    top = camo(rng, v['camo']) if v.get('camo') else fabric(rng, v['top'])
    trs = fabric(rng, v['trousers'])
    boots = fabric(rng, v['boots'], 0.05)
    # legs and boots (the stride reaches out from under the body)
    for side, st in ((-1, s), (1, -s)):
        hip = (side * 0.10, 0.02); foot = (side * 0.11, -0.02 - st)
        f.capsule(hip, foot, 0.075, 0.85, 0.12, trs)
        f.ellipsoid(foot[0], foot[1] - 0.05, 0.052, 0.13, 0.0, 0.11, boots)
    if v.get('robe'):
        f.ellipsoid(0, 0.02, 0.27, 0.21, 0.25, 0.85, fabric(rng, v['robe'], 0.18))
    if v.get('pack'):
        f.box(0, 0.135, 0.15, 0.085, 1.0, 0.38, fabric(rng, v['pack'], 0.1))
    # torso and shoulders
    f.ellipsoid(0, 0.01, 0.235, 0.135, 1.05, 0.40, top)
    for side in (-1, 1):
        f.ellipsoid(side * 0.19, 0.0, 0.085, 0.095, 1.30, 0.14, top)
    # chest rig: panel, shoulder straps, magazine pouches along the front
    if v.get('vest'):
        vest = fabric(rng, v['vest'], 0.08)
        f.box(0, -0.065, 0.165, 0.06, 1.32, 0.12, vest)
        for side in (-1, 1):
            f.capsule((side * 0.12, -0.07), (side * 0.11, 0.09), 0.03, 1.44, 1.45, vest, flat=0.4)
        for i in range(4):
            f.box(-0.11 + i * 0.073, -0.118, 0.03, 0.026, 1.27, 0.13, vest * 0.9)
    # weapon and arms
    w = v['weapon']
    if w == 'ak':
        rear, muz = (0.15, -0.03), (-0.13, -0.63)
        ak(f, rear, muz, 1.24, 1.02)
        grip, fore = along(rear, muz, 0.36), along(rear, muz, 0.67)
        arms = [((0.20, -0.01), (0.25, -0.13), (grip[0] + 0.01, grip[1] + 0.01)), ((-0.20, -0.01), (-0.20, -0.20), fore)]
    elif w == 'pkm':
        rear, muz = (0.17, 0.08), (-0.08, -0.70)
        pkm(f, rear, muz, 1.05, 0.95)
        grip, fore = along(rear, muz, 0.3), along(rear, muz, 0.58)
        arms = [((0.20, -0.01), (0.25, -0.06), grip), ((-0.20, -0.01), (-0.19, -0.22), fore)]
    elif w == 'rpg':
        rpg(f, (0.16, 0.48), (0.12, -0.42), 1.52)
        arms = [((0.20, -0.01), (0.26, -0.12), (0.15, -0.20)), ((-0.20, -0.01), (-0.10, -0.24), (0.11, -0.34))]
    else:   # rifle slung across the back, arms swinging
        ak(f, (0.17, 0.19), (-0.15, -0.07), 1.47, 1.52)
        sw = [0, 0.10, 0, -0.10][frame]
        arms = [((0.21, 0.0), (0.25, -0.02 - sw), (0.25, -0.07 - sw)), ((-0.21, 0.0), (-0.25, -0.02 + sw), (-0.25, -0.07 + sw))]
    slv = camo(rng, v['camo']) if v.get('camo') else fabric(rng, v['sleeve'])
    hand = fabric(rng, v.get('gloves', SKIN), 0.06)
    for sh, el, hd in arms:
        zs, ze, zh = 1.36, 1.17 if w != 'sling' else 1.0, 1.16 if w != 'sling' else 0.85
        if w == 'rpg': ze, zh = 1.25, 1.42
        f.capsule(sh, el, 0.052, zs, ze, slv)
        f.capsule(el, hd, 0.045, ze, zh, slv)
        f.ellipsoid(hd[0], hd[1], 0.04, 0.045, zh, 0.04, hand)
    # head and headgear
    hg = v['head']
    if hg in ('shemagh_red', 'shemagh_black'):
        tex = shemagh(rng, (226, 220, 206), (160, 34, 32)) if hg == 'shemagh_red' else shemagh(rng, (222, 220, 214), (34, 34, 36))
        f.ellipsoid(0.07, 0.07, 0.085, 0.07, 1.42, 0.12, tex, rot=0.5)
        f.ellipsoid(-0.03, 0.08, 0.07, 0.05, 1.44, 0.1, tex, rot=-0.3)
        f.ellipsoid(0, -0.01, 0.098, 0.112, 1.55, 0.22, tex)
    elif hg == 'turban':
        n = noise(rng, 4, 2)
        bands = np.sin((MX * 0.8 + MY * 0.6) * 260 + np.hypot(MX, MY) * 120) * 0.5 + 0.5
        t = np.array((214, 208, 194), np.float32)[None, None] * (0.9 + 0.08 * bands[..., None]) * (0.95 + 0.1 * n[..., None])
        f.ellipsoid(0, -0.01, 0.112, 0.118, 1.55, 0.22, t)
    elif hg == 'cap':
        f.ellipsoid(0, -0.005, 0.088, 0.10, 1.56, 0.19, fabric(rng, v.get('capcol', (72, 80, 56)), 0.06))
        f.box(0, -0.10, 0.07, 0.045, 1.66, 0.02, fabric(rng, v.get('capcol', (72, 80, 56)), 0.06) * 0.85)
    elif hg == 'balaclava':
        f.ellipsoid(0, -0.005, 0.088, 0.10, 1.55, 0.2, fabric(rng, (34, 34, 36), 0.05))
    else:
        hair = np.array((34, 27, 21), np.float32)[None, None] * (0.8 + 0.4 * noise(rng, 40, 2)[..., None])
        f.ellipsoid(0, -0.005, 0.086, 0.098, 1.55, 0.2, hair)
    return f.render()

VARIANTS = [
    dict(top=(92, 96, 66), sleeve=(92, 96, 66), trousers=(72, 72, 58), boots=(46, 38, 30), vest=(146, 130, 98), weapon='ak', head='shemagh_red'),
    dict(top=(172, 152, 114), sleeve=(172, 152, 114), camo=[(172, 152, 114), (138, 112, 80), (108, 94, 70), (194, 178, 144)], trousers=(150, 130, 100), boots=(98, 78, 54), vest=(118, 102, 74), pack=(110, 94, 68), weapon='ak', head='shemagh_black'),
    dict(top=(38, 38, 40), sleeve=(38, 38, 40), trousers=(34, 34, 36), boots=(22, 22, 22), gloves=(28, 28, 28), vest=(48, 50, 44), weapon='pkm', head='balaclava'),
    dict(top=(178, 164, 132), sleeve=(178, 164, 132), robe=(178, 164, 132), trousers=(178, 164, 132), boots=(72, 58, 42), vest=(84, 90, 62), weapon='sling', head='bare'),
    dict(top=(82, 90, 62), sleeve=(82, 90, 62), camo=[(84, 92, 62), (54, 62, 42), (112, 102, 72), (38, 40, 32)], trousers=(78, 84, 60), boots=(42, 36, 30), weapon='rpg', head='cap', capcol=(70, 78, 54), pack=(88, 92, 66)),
    dict(top=(128, 126, 118), sleeve=(128, 126, 118), robe=(128, 126, 118), trousers=(120, 118, 110), boots=(54, 46, 38), vest=(78, 84, 58), weapon='ak', head='turban'),
    dict(top=(58, 68, 52), sleeve=(58, 68, 52), trousers=(56, 62, 50), boots=(34, 30, 26), vest=(102, 98, 72), weapon='ak', head='shemagh_red', pack=(72, 76, 56)),
    dict(top=(104, 80, 58), sleeve=(104, 80, 58), trousers=(64, 74, 94), boots=(42, 34, 28), weapon='ak', head='shemagh_black'),
]

if __name__ == '__main__':
    import sys
    atlas = Image.new('RGBA', (CELL * 8, CELL * 4), (0, 0, 0, 0))
    for vi, v in enumerate(VARIANTS):
        for fr in range(4):
            atlas.paste(fighter(v, fr, 100 + vi), (vi * CELL, fr * CELL))
    atlas.save(sys.argv[1])
    print('atlas written')
