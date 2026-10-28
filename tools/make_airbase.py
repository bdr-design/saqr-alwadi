"""The bases, from the owner's picture of a whole air base (assets/originals/airbase.png, 0.8 m a pixel). airbase():
the F-15's base, the whole picture as its own patch of ground on the region's zoom-out 5.4 km east of the battle
(make_region.py calls it: writes maps/theater/tiles/airbase, levels its plain in outer2.jpg, map.json airbase). fob_place(): the Apache's forward base, the
picture's helicopter apron and buildings cut out and laid in the theatre (make_theater.py calls it). draw() is the
earliest base, drawn from nothing (no longer called):

A military airfield east of the desert, laid out to ICAO / NATO norms at the map's own scale (1 map px = 0.85 m):
a 2000 x 45 m runway 18/36 with paved shoulders, threshold bars, designators, touchdown-zone and aiming-point marks,
centreline and edge lines and the tyre rubber where aircraft touch down; a parallel taxiway 180 m west with five
links, yellow centrelines and runway-holding marks; a concrete apron (5 m slabs) with six Apache pads (25 m TLOF, H)
and jet stands with lead-in lines; hangars, hardened aircraft shelters, the tower, fire station, fuel farm, offices;
a perimeter fence and patrol track, and the access road from the main road to the gate. Parked aircraft: two Apaches
on the pads, two jets on the stands. Sun from the upper left, shadows to the lower right (0.7 m per metre of height).
Returns the buildings (for ruins) and what the game needs: the pads, the runway, the apron, the gate.
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter
M2P = 1 / 0.85                       # map px per metre
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
class Dr(ImageDraw.ImageDraw):
    # boxes given corner to corner in either order (marks drawn mirrored either side of a centreline)
    def _n(self, xy): x0, y0, x1, y1 = xy; return [min(x0, x1), min(y0, y1), max(x0, x1), max(y0, y1)]
    def rectangle(self, xy, *a, **k): super().rectangle(self._n(xy), *a, **k)
    def ellipse(self, xy, *a, **k): super().ellipse(self._n(xy), *a, **k)
    def rounded_rectangle(self, xy, *a, **k): super().rounded_rectangle(self._n(xy), *a, **k)

def draw(img, rng, K, COLA, ABW, H, road):
    W = img.size[0] // K
    S = K * M2P                      # level-2 px per metre
    # the site, in map px
    X0, X1, Y0, Y1 = COLA + 30, COLA + ABW - 30, 150, H - 170
    RCX = COLA + 745                 # runway centreline
    RY0 = 260; RY1 = RY0 + 2000 * M2P
    TCX = RCX - 180 * M2P            # parallel taxiway
    tw = 23 * M2P / 2                # taxiway half width
    # the helicopter apron (six pads) by the hangars, and the jet apron along the taxiway, joined by two taxi lanes
    HA = (COLA + 200, 1150, COLA + 200 + 110 * M2P, 1150 + 175 * M2P)
    JA = (TCX - tw - 72 * M2P, 1130, TCX - tw, 1130 + 400 * M2P)
    LANES = [HA[1] + 32 * M2P, HA[3] - 32 * M2P]
    AP = HA
    GATE = (X0, 1440)
    # the access road: from the main road at about the gate's latitude, east to the gate
    rp = min(road, key=lambda p: abs(p[1] - GATE[1]))
    # ---- work on a region: the site plus the access road
    rx0 = int(rp[0]) - 20; ry0 = Y0 - 60; rx1 = W; ry1 = Y1 + 60
    reg = np.asarray(img.crop((rx0 * K, ry0 * K, rx1 * K, ry1 * K)), np.float32).copy()
    h_, w_ = reg.shape[:2]
    P = lambda x, y: ((x - rx0) * K, (y - ry0) * K)               # map px -> region px
    def mask(): return Image.new('L', (w_, h_), 0)
    def box(m, pad):
        b = m.getbbox()
        if not b: return None
        return (max(0, b[0] - pad), max(0, b[1] - pad), min(w_, b[2] + pad), min(h_, b[3] + pad))
    def lowfreq(hh, ww, cell, amp):
        g = rng.random((hh // cell + 2, ww // cell + 2)).astype(np.float32)
        return (np.asarray(Image.fromarray(g).resize((ww, hh), Image.BICUBIC), np.float32)[..., None] - 0.5) * amp
    def blend(m, tex, alpha=1.0, soft=0.0):
        """lay tex (a colour, or f(h, w, x0, y0) -> h x w x 3 in region px) where the mask m is, feathered by soft"""
        b = box(m, int(soft * 3) + 2)
        if not b: return
        mc = m.crop(b)
        if soft: mc = mc.filter(ImageFilter.GaussianBlur(soft))
        a = np.asarray(mc, np.float32)[..., None] / 255 * alpha
        hh, ww = a.shape[:2]
        t = tex(hh, ww, b[0], b[1]) if callable(tex) else np.array(tex, np.float32)
        sl = reg[b[1]:b[3], b[0]:b[2]]
        sl[:] = sl * (1 - a) + t * a
    def paint(m, col, alpha=1.0, noise=0.0, soft=0.0):
        blend(m, (lambda hh, ww, x0, y0: np.array(col, np.float32) + rng.normal(0, noise, (hh, ww, 1)).astype(np.float32)) if noise else col, alpha, soft)
    # the ground's own fine detail (kept under the grading, faintly under the paving)
    lum = Image.fromarray(reg.mean(2).clip(0, 255).astype(np.uint8))
    hp = np.asarray(lum, np.float32) - np.asarray(lum.filter(ImageFilter.GaussianBlur(6)), np.float32)
    def HP(x0, y0, hh, ww): return hp[y0:y0 + hh, x0:x0 + ww, None]
    # ---- graded ground: scraped and rolled round the aprons and buildings, its edge ragged as a grader leaves it;
    # the rest of the site is left as it was
    m = mask(); d = Dr(m)
    for (a0, b0, a1, b1, pad) in [(*HA, 45), (*JA, 25), (HA[2], LANES[0], JA[0], LANES[1], 20), (HA[0] - 80 * M2P, HA[1] - 70 * M2P, HA[2] + 60 * M2P, HA[3] + 110 * M2P, 15),
                                  (X0, GATE[1] - 25, HA[0], GATE[1] + 25, 0)]:
        d.rectangle([*P(a0 - pad * M2P, b0 - pad * M2P), *P(a1 + pad * M2P, b1 + pad * M2P)], fill=255)
    b = box(m, 200)
    mc = np.asarray(m.crop(b).filter(ImageFilter.GaussianBlur(60)), np.float32) / 255
    mc = mc + (lowfreq(mc.shape[0], mc.shape[1], 70, 1)[..., 0]) * 0.55
    mm = mask(); mm.paste(Image.fromarray((np.clip((mc - 0.45) * 5, 0, 1) * 255).astype(np.uint8)), b[:2])
    blend(mm, lambda hh, ww, x0, y0: np.array([178, 162, 134], np.float32) + HP(x0, y0, hh, ww) * 0.3 + lowfreq(hh, ww, 120, 16), 0.8, soft=8)
    # the runway strip: 150 m wide, graded smoother still
    m = mask(); Dr(m).rectangle([*P(RCX - 75 * M2P, RY0 - 60 * M2P), *P(TCX + 30 * M2P, RY1 + 60 * M2P)], fill=255)
    Dr(m).rectangle([*P(RCX - 75 * M2P, RY0 - 60 * M2P), *P(RCX + 75 * M2P, RY1 + 60 * M2P)], fill=255)
    blend(m, lambda hh, ww, x0, y0: np.array([182, 168, 140], np.float32) + HP(x0, y0, hh, ww) * 0.25 + lowfreq(hh, ww, 100, 14), 0.6, soft=26)
    # ---- perimeter: a dirt patrol track inside a fence
    m = mask(); d = Dr(m)
    d.rounded_rectangle([*P(X0 + 12, Y0 + 12), *P(X1 - 12, Y1 - 12)], radius=50 * K, outline=255, width=int(5 * S))
    paint(m, [168, 150, 120], 0.85, 6, soft=2)
    m = mask(); Dr(m).rounded_rectangle([*P(X0 + 4, Y0 + 4), *P(X1 - 4, Y1 - 4)], radius=56 * K, outline=255, width=3)
    paint(m, [70, 66, 60], 0.55)
    # ---- asphalt: runway (with lighter shoulders), taxiway and links, the base roads, the access road
    asph = lambda shade=0: np.array([66 + shade, 66 + shade, 64 + shade], np.float32)
    def asphalt(m, shade=0, soft=1.2):
        blend(m, lambda hh, ww, x0, y0: asph(shade) + rng.normal(0, 5, (hh, ww, 1)).astype(np.float32) + lowfreq(hh, ww, 90, 14) + HP(x0, y0, hh, ww) * 0.25, 1, soft)
    m = mask(); d = Dr(m)
    d.rectangle([*P(RCX - 30 * M2P, RY0 - 4), *P(RCX + 30 * M2P, RY1 + 4)], fill=255)
    asphalt(m, 22)                                                   # shoulders, older and paler
    m = mask(); d = Dr(m)
    d.rectangle([*P(RCX - 22.5 * M2P, RY0), *P(RCX + 22.5 * M2P, RY1)], fill=255)
    asphalt(m, 0)
    # taxiway, its five links to the runway (at the ends, a third and two thirds, the middle) with fillets
    links = [RY0 + 40 * M2P, RY0 + 600 * M2P, (RY0 + RY1) / 2, RY1 - 600 * M2P, RY1 - 40 * M2P]
    m = mask(); d = Dr(m)
    tw = 23 * M2P / 2
    d.rectangle([*P(TCX - tw, links[0] - tw), *P(TCX + tw, links[-1] + tw)], fill=255)
    for ly in links:
        d.rectangle([*P(TCX - tw, ly - tw), *P(RCX, ly + tw)], fill=255)
        for sx in (TCX + tw, RCX - 22.5 * M2P):
            d.ellipse([*P(sx - 18 * M2P, ly - tw - 18 * M2P), *P(sx + 18 * M2P, ly + tw + 18 * M2P)], fill=255)
    asphalt(m, 6)
    # base roads (7 m): gate east past the hangars' backs, up to the tower and fire station, down to the fuel farm
    m = mask(); d = Dr(m)
    rx_ = HA[0] - 68 * M2P
    for (xa, ya, xb, yb) in [(GATE[0], GATE[1] - 3.5 * M2P, rx_ + 3.5 * M2P, GATE[1] + 3.5 * M2P), (rx_ - 3.5 * M2P, HA[1] - 60 * M2P, rx_ + 3.5 * M2P, HA[3] + 95 * M2P),
                             (rx_, HA[1] - 63.5 * M2P, HA[2] + 50 * M2P, HA[1] - 56.5 * M2P), (rx_, HA[3] + 91.5 * M2P, HA[0] + 90 * M2P, HA[3] + 98.5 * M2P)]:
        d.rectangle([*P(xa, ya), *P(xb, yb)], fill=255)
    asphalt(m, 12)
    # the access road from the main road, a gentle curve, 7 m wide
    m = mask(); d = Dr(m)
    xs = np.linspace(rp[0] + 4, GATE[0], 200); ys = rp[1] + (GATE[1] - rp[1]) * (1 - np.cos(np.linspace(0, np.pi, 200))) / 2 + 18 * np.sin(np.linspace(0, np.pi, 200))
    d.line([P(x, y) for x, y in zip(xs, ys)], fill=255, width=int(7 * S), joint='curve')
    asphalt(m, 10)
    m = mask(); Dr(m).line([P(x, y) for x, y in zip(xs[::3], ys[::3])], fill=255, width=max(2, int(0.15 * S)))
    paint(m, [215, 205, 170], 0.6)
    # ---- concrete: the apron (5 m slabs), pads and shelter aprons
    def concrete(m, shade=0):
        blend(m, lambda hh, ww, x0, y0: np.array([168 + shade, 165 + shade, 156 + shade], np.float32) + rng.normal(0, 3.5, (hh, ww, 1)).astype(np.float32) + lowfreq(hh, ww, 40, 10), 1, 1)
    m = mask(); d = Dr(m)
    d.rectangle([*P(HA[0], HA[1]), *P(HA[2], HA[3])], fill=255)
    d.rectangle([*P(JA[0], JA[1]), *P(JA[2] + 1, JA[3])], fill=255)
    for ly in LANES: d.rectangle([*P(HA[2] - 1, ly - 9 * M2P), *P(JA[0] + 1, ly + 9 * M2P)], fill=255)
    HAS = [(TCX - 95 * M2P, RY0 + 330 * M2P + i * 70 * M2P) for i in range(4)]
    for hx, hy in HAS: d.rectangle([*P(hx - 18 * M2P, hy - 14 * M2P), *P(TCX - tw, hy + 14 * M2P)], fill=255)
    concrete(m)
    # slab joints (5 m), faint and not quite even
    m = mask(); d = Dr(m)
    for (a0, b0, a1, b1) in (HA, JA):
        for x in np.arange(a0, a1, 5 * M2P): d.line([P(x, b0), P(x, b1)], fill=int(rng.uniform(120, 255)), width=1)
        for y in np.arange(b0, b1, 5 * M2P): d.line([P(a0, y), P(a1, y)], fill=int(rng.uniform(120, 255)), width=1)
    paint(m, [118, 114, 106], 0.22)
    # dust blown over the concrete from the edges
    m = mask(); d = Dr(m)
    for (a0, b0, a1, b1) in (HA, JA): d.rectangle([*P(a0, b0), *P(a1, b1)], outline=255, width=int(6 * S))
    paint(m, [176, 160, 132], 0.35, soft=20)
    # ---- runway markings (white): edges, centreline, threshold bars, designators, touchdown zone, aiming points
    m = mask(); d = Dr(m)
    half = 22.5 * M2P
    for s in (-1, 1): d.rectangle([*P(RCX + s * (half - 1.4 * M2P), RY0 + 3), *P(RCX + s * (half - 0.5 * M2P), RY1 - 3)], fill=255)
    y = RY0 + 75 * M2P
    while y < RY1 - 75 * M2P: d.rectangle([*P(RCX - 0.45 * M2P, y), *P(RCX + 0.45 * M2P, y + 30 * M2P)], fill=255); y += 50 * M2P
    for end, sgn in ((RY0, 1), (RY1, -1)):
        for i in range(8):
            for s in (-1, 1):
                x = RCX + s * (3 * M2P + i * 2.4 * M2P)
                ya, yb = end + sgn * 6 * M2P, end + sgn * 36 * M2P
                d.rectangle([*P(x - 0.9 * M2P, min(ya, yb)), *P(x + 0.9 * M2P, max(ya, yb))], fill=255)
        for dist, nb in ((150, 3), (450, 2), (600, 2), (750, 1)):
            for s in (-1, 1):
                for i in range(nb):
                    x = RCX + s * (6 * M2P + i * 3.3 * M2P); yy = end + sgn * dist * M2P
                    d.rectangle([*P(x - 0.9 * M2P, min(yy, yy + sgn * 22.5 * M2P)), *P(x + 0.9 * M2P, max(yy, yy + sgn * 22.5 * M2P))], fill=255)
        for s in (-1, 1):
            yy = end + sgn * 300 * M2P
            d.rectangle([*P(RCX + s * 9 * M2P, min(yy, yy + sgn * 45 * M2P)), *P(RCX + s * 19 * M2P, max(yy, yy + sgn * 45 * M2P))], fill=255)
    # designators, 9 m tall, read from the approach: "36" at the south end, "18" (turned round) at the north end
    fnt = ImageFont.truetype(FONT, int(12 * S))
    for txt, yy, rot in (('36', RY1 - 52 * M2P, 0), ('18', RY0 + 52 * M2P, 180)):
        t = Image.new('L', (int(20 * S), int(14 * S)), 0); Dr(t).text((t.size[0] / 2, t.size[1] / 2), txt, font=fnt, fill=255, anchor='mm')
        t = t.resize((t.size[0], int(t.size[1] * 0.85))).rotate(rot)
        cx_, cy_ = P(RCX, yy); m.paste(255, (int(cx_ - t.size[0] / 2), int(cy_ - t.size[1] / 2)), t)
    paint(m, [236, 236, 230], 0.92, soft=0.6)
    # tyre rubber where aircraft touch down: dark streaks along the centreline
    rub = mask(); d = Dr(rub)
    for end, sgn in ((RY0, 1), (RY1, -1)):
        for i in range(140):
            x = RCX + rng.normal(0, 4.5) * M2P; ya = end + sgn * rng.uniform(150, 650) * M2P; L = rng.uniform(15, 60) * M2P
            d.line([P(x, ya), P(x + rng.normal(0, 0.4) * M2P, ya + sgn * L)], fill=int(rng.uniform(60, 160)), width=int(rng.uniform(0.6, 1.4) * S))
    paint(rub, [26, 26, 26], 0.75, soft=3)
    # ---- taxiway markings (yellow): centrelines, runway-holding positions, apron lanes and stands
    m = mask(); d = Dr(m)
    lw = max(2, int(0.3 * S))
    d.line([P(TCX, links[0]), P(TCX, links[-1])], fill=255, width=lw)
    for ly in links:
        d.line([P(TCX, ly), P(RCX, ly)], fill=255, width=lw)
        hx = RCX - 60 * M2P
        for k_, solid in ((0, True), (0.6, True), (1.5, False), (2.1, False)):
            x = hx - k_ * M2P
            if solid: d.line([P(x, ly - tw), P(x, ly + tw)], fill=255, width=lw)
            else:
                for yy in np.arange(ly - tw, ly + tw, 2.2 * M2P): d.line([P(x, yy), P(x, min(ly + tw, yy + 1.1 * M2P))], fill=255, width=lw)
    for ly in LANES: d.line([P(HA[2] - 14 * M2P, ly), P(TCX, ly)], fill=255, width=lw)
    STANDS = [((JA[0] + JA[2]) / 2 - 6 * M2P, JA[1] + 40 * M2P + i * 64 * M2P) for i in range(6)]
    for sx, sy in STANDS:
        d.line([P(TCX, sy), P(sx - 10 * M2P, sy)], fill=255, width=lw)
        d.line([P(sx - 10 * M2P, sy - 2 * M2P), P(sx - 10 * M2P, sy + 2 * M2P)], fill=255, width=lw * 2)
    # the Apache pads: 25 m concrete squares, a TLOF circle and the H, a yellow edge
    PADS = [(HA[0] + 28 * M2P + (i % 2) * 54 * M2P, HA[1] + 32 * M2P + (i // 2) * 55 * M2P) for i in range(6)]
    # oil and fuel stains where aircraft stand and are serviced; tyre marks on the lanes
    m = mask(); d = Dr(m)
    for cx_, cy_ in PADS + STANDS:
        for _ in range(int(rng.integers(3, 8))):
            ex, ey, r_ = cx_ + rng.normal(0, 3) * M2P, cy_ + rng.normal(0, 3) * M2P, rng.uniform(0.6, 2.4) * M2P
            d.ellipse([*P(ex - r_, ey - r_ * rng.uniform(0.5, 1)), *P(ex + r_, ey + r_ * rng.uniform(0.5, 1))], fill=int(rng.uniform(90, 200)))
    paint(m, [70, 66, 60], 0.55, soft=2.5)
    pm = mask(); dp = Dr(pm)
    for px, py in PADS: dp.rectangle([*P(px - 12.5 * M2P, py - 12.5 * M2P), *P(px + 12.5 * M2P, py + 12.5 * M2P)], fill=255)
    concrete(pm, 14)
    for px, py in PADS:
        d.rectangle([*P(px - 12.5 * M2P, py - 12.5 * M2P), *P(px + 12.5 * M2P, py + 12.5 * M2P)], outline=255, width=lw)
    paint(m, [226, 182, 56], 0.9, soft=0.6)
    m = mask(); d = Dr(m)
    for px, py in PADS:
        d.ellipse([*P(px - 9 * M2P, py - 9 * M2P), *P(px + 9 * M2P, py + 9 * M2P)], outline=255, width=max(3, int(0.5 * S)))
        for s in (-1, 1): d.rectangle([*P(px + s * 2.6 * M2P - 0.5 * M2P, py - 4 * M2P), *P(px + s * 2.6 * M2P + 0.5 * M2P, py + 4 * M2P)], fill=255)
        d.rectangle([*P(px - 2.6 * M2P, py - 0.5 * M2P), *P(px + 2.6 * M2P, py + 0.5 * M2P)], fill=255)
    paint(m, [236, 236, 230], 0.9, soft=0.6)
    # ---- buildings: roofs and their shadows (sun from the upper left)
    blds = []
    def shadow(poly, hgt):
        dx, dy = 0.6 * 0.7 * hgt * M2P, 0.8 * 0.7 * hgt * M2P
        m = mask(); Dr(m).polygon([P(x + dx, y + dy) for x, y in poly], fill=255)
        paint(m, [40, 38, 36], 0.5, soft=2)
    def box_bld(cx, cy, w, l, hgt, roof, ridge=True, kind='hall'):
        poly = [(cx - w / 2, cy - l / 2), (cx + w / 2, cy - l / 2), (cx + w / 2, cy + l / 2), (cx - w / 2, cy + l / 2)]
        shadow(poly, hgt)
        m = mask(); Dr(m).polygon([P(*p) for p in poly], fill=255)
        def tex(hh, ww, x0, y0):
            t = np.array(roof, np.float32) + rng.normal(0, 2.5, (hh, ww, 1)).astype(np.float32)
            if ridge:   # corrugated metal: ribs across, the ridge along, the lit and shaded halves
                yy, xx = np.mgrid[0:hh, 0:ww]
                lx = (xx + x0) / K + rx0 - cx
                t = t + np.where(lx < 0, 9, -9)[..., None] + (np.sin((yy + y0) / (0.9 * S) * np.pi) > 0.6)[..., None] * 6
            return t
        blend(m, tex, 1, 0.8)
        blds.append((cx, cy, w, l, 0, kind))
    # three hangars facing the apron, doors east; the tower; fire station; offices
    for i in range(3): box_bld(HA[0] - 34 * M2P, HA[1] + 30 * M2P + i * 57 * M2P, 46 * M2P, 50 * M2P, 14, [184, 186, 184])
    box_bld(HA[0] + 20 * M2P, HA[1] - 30 * M2P, 10 * M2P, 10 * M2P, 26, [150, 148, 140], ridge=False)       # tower
    box_bld(HA[2] + 34 * M2P, HA[1] - 30 * M2P, 30 * M2P, 18 * M2P, 7, [168, 72, 60], ridge=False)          # fire station
    for i in range(4): box_bld(X0 + 50 * M2P + (i % 2) * 34 * M2P, GATE[1] - 40 * M2P + (i // 2) * 60 * M2P, 26 * M2P, 14 * M2P, 5, [196, 190, 176], ridge=False)
    # hardened shelters: a concrete arch, darker at the sides
    for hx, hy in HAS:
        poly = [(hx - 18 * M2P, hy - 12 * M2P), (hx + 18 * M2P, hy - 12 * M2P), (hx + 18 * M2P, hy + 12 * M2P), (hx - 18 * M2P, hy + 12 * M2P)]
        shadow(poly, 9)
        m = mask(); Dr(m).rounded_rectangle([*P(hx - 18 * M2P, hy - 12 * M2P), *P(hx + 18 * M2P, hy + 12 * M2P)], radius=int(10 * S), fill=255)
        def tex(hh, ww, x0, y0, hy=hy):
            yy = np.mgrid[0:hh, 0:ww][0]; ly = ((yy + y0) / K + ry0 - hy) / (12 * M2P)
            return np.array([150, 146, 136], np.float32) + (-np.abs(ly) * 30 - ly * 14)[..., None] + rng.normal(0, 2, (hh, ww, 1)).astype(np.float32)
        blend(m, tex, 1, 0.8)
        blds.append((hx, hy, 36 * M2P, 24 * M2P, 0, 'hall'))
    # fuel farm: four tanks in a bund
    FX, FY = HA[0] + 40 * M2P, HA[3] + 125 * M2P
    m = mask(); Dr(m).rectangle([*P(FX - 26 * M2P, FY - 26 * M2P), *P(FX + 26 * M2P, FY + 26 * M2P)], outline=255, width=int(2 * S))
    paint(m, [150, 136, 110], 0.7, soft=1)
    for i in range(4):
        tx, ty = FX + (i % 2 - 0.5) * 24 * M2P, FY + (i // 2 - 0.5) * 24 * M2P
        r = 8 * M2P; poly = [(tx + r * np.cos(t), ty + r * np.sin(t)) for t in np.linspace(0, 6.28, 40)]
        shadow(poly, 8)
        m = mask(); Dr(m).ellipse([*P(tx - r, ty - r), *P(tx + r, ty + r)], fill=255)
        def tex(hh, ww, x0, y0, tx=tx, ty=ty):
            yy, xx = np.mgrid[0:hh, 0:ww]; gx_ = ((xx + x0) / K + rx0 - tx) / r; gy_ = ((yy + y0) / K + ry0 - ty) / r
            return np.array([214, 214, 208], np.float32) + (-(gx_ + gy_) * 16)[..., None]
        blend(m, tex, 1, 0.8)
        blds.append((tx, ty, 2 * r, 2 * r, 0, 'tank'))
    # ---- parked aircraft: two Apaches on pads 3 and 4 (rotor tied fore and aft), two jets on the stands
    def apache(px, py):
        m = mask(); d = Dr(m)
        L = 17.7 * M2P
        d.polygon([P(px - 0.6 * M2P, py - L / 2), P(px + 0.6 * M2P, py - L / 2), P(px + 1.1 * M2P, py - 2 * M2P), P(px + 1.0 * M2P, py + 3 * M2P),
                   P(px + 0.35 * M2P, py + L / 2 - 1.5 * M2P), P(px - 0.35 * M2P, py + L / 2 - 1.5 * M2P), P(px - 1.0 * M2P, py + 3 * M2P), P(px - 1.1 * M2P, py - 2 * M2P)], fill=255)
        d.rectangle([*P(px - 3.0 * M2P, py - 0.5 * M2P), *P(px + 3.0 * M2P, py + 0.7 * M2P)], fill=255)            # stub wings
        d.rectangle([*P(px - 1.6 * M2P, py + L / 2 - 2.2 * M2P), *P(px + 1.6 * M2P, py + L / 2 - 1.6 * M2P)], fill=255)  # tailplane
        for t in (0.25, 1.82, 3.4, 4.97):    # blades
            d.line([P(px + np.cos(t) * 0.5 * M2P, py - 1 * M2P + np.sin(t) * 0.5 * M2P), P(px + np.cos(t) * 7.3 * M2P, py - 1 * M2P + np.sin(t) * 7.3 * M2P)], fill=255, width=max(2, int(0.5 * S)))
        sh = m.transform(m.size, Image.AFFINE, (1, 0, -0.6 * 0.7 * 3 * S, 0, 1, -0.8 * 0.7 * 3 * S))
        paint(sh, [36, 34, 32], 0.45, soft=1.5)
        paint(m, [72, 76, 64], 1, 2, soft=0.5)
    def jet(px, py):
        m = mask(); d = Dr(m); L = 19.4 * M2P
        d.polygon([P(px - 13 * M2P / 2 * 0 + 0, py - L / 2), P(px + 1.4 * M2P, py - L / 2 + 5 * M2P), P(px + 1.6 * M2P, py - 1 * M2P), P(px + 6.5 * M2P, py + 3 * M2P),
                   P(px + 6.5 * M2P, py + 5 * M2P), P(px + 1.8 * M2P, py + 5 * M2P), P(px + 1.8 * M2P, py + L / 2 - 3 * M2P), P(px + 4.3 * M2P, py + L / 2 - 0.5 * M2P),
                   P(px + 4.3 * M2P, py + L / 2), P(px - 4.3 * M2P, py + L / 2), P(px - 4.3 * M2P, py + L / 2 - 0.5 * M2P), P(px - 1.8 * M2P, py + L / 2 - 3 * M2P),
                   P(px - 1.8 * M2P, py + 5 * M2P), P(px - 6.5 * M2P, py + 5 * M2P), P(px - 6.5 * M2P, py + 3 * M2P), P(px - 1.6 * M2P, py - 1 * M2P), P(px - 1.4 * M2P, py - L / 2 + 5 * M2P)], fill=255)
        rm = m.rotate(90, center=P(px, py))
        sh = rm.transform(rm.size, Image.AFFINE, (1, 0, -0.6 * 0.7 * 2.5 * S, 0, 1, -0.8 * 0.7 * 2.5 * S))
        paint(sh, [36, 34, 32], 0.45, soft=1.5)
        paint(rm, [128, 132, 136], 1, 2, soft=0.5)
    apache(*PADS[3]); apache(*PADS[4])
    jet(*STANDS[1]); jet(*STANDS[3])
    # ---- back into the picture, a touch softened like the rest of the imagery
    out = Image.fromarray(reg.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.45))
    img.paste(out, (rx0 * K, ry0 * K))
    info = {'pads': [[round(x, 1), round(y, 1)] for x, y in PADS], 'padFree': [0, 1, 2, 5],
            'runway': [round(RCX, 1), round(RY0, 1), round(RY1, 1), round(45 * M2P, 1)], 'apron': [round(v, 1) for v in HA], 'jets': [round(v, 1) for v in JA],
            'gate': [round(v, 1) for v in GATE], 'area': [X0, Y0, X1, Y1], 'heading': -1.5708}
    return {'blds': blds, 'info': info}


# ---- the bases from the owner's picture: assets/originals/airbase.png, the owner's orthophoto of a whole fighter base
# (north up, 2048 x 3072, laid out on the plan given with it at 0.8 m a px: the runway 18/36 2,245 m threshold to
# threshold, the parallel taxiway 178 m west of it). Two things are made from it:
#   - the F-15SA's air base (airbase(), called by tools/make_region.py once it has written the region's pictures): the
#     whole picture, its own patch of ground 5.4 km east of the battle, in a valley there (outer2's), on a plain
#     levelled round it (plain()), its margin graded to that ground's colours and faded into it on a ragged line; in
#     maps/theater/tiles/airbase/ (the six 1024 px quarters of it at full size, and a 1024 x 1536 copy for afar and the
#     map pages), and its places in map.json 'airbase' (the runway, the stand and the taxi out, what stands up on it for
#     the view from the ground);
#   - the Apache's forward operating base in the theatre (fob_place(), from make_theater.py): the helicopter apron and
#     the support buildings beside it, with the west fence and the gate, cut from the same picture, its fence closed
#     round them, laid at its scale on the strip east of the maps where the old base was, with its access road.
PIC_MPX = 0.8
# the F-15's base, in the picture's px
AB_CENTRE = (7711, -506)                       # map px: on outer2's valley floor, 5.4 km east of the theatre's centre
AB_RUNWAY = (1721, 132, 2938, 71)              # centreline x, north (18) and south (36) thresholds, width (57 m)
AB_STAND = (1345, 746, 90)                     # the sixth bay of the east sunshade row, nose east
AB_TAXI = [(1440, 746), (1476, 738), (1499, 712), (1499, 200), (1508, 172), (1535, 158), (1620, 158)]
AB_LINEUP = [(1660, 158), (1700, 162), (1718, 178), (1721, 200), (1721, 222)]
AB_SHADES = [(1060, 553, 1096, 973), (1287, 553, 1321, 973)]           # the two rows of twelve bays (roofs)
AB_BAYS = [553 + 17.5 + 35 * k for k in range(12)]                      # the bays' middles, north to south
AB_HAS = [(1229, y) for y in (1452, 1590, 1724, 1859, 1992, 2127)]      # door middles, doors east
AB_TOWER, AB_FIRE, AB_HANGAR = (1333, 1336), (1272, 1306, 90), (1023, 1283, 0)
AB_OPS = [(451, 618), (453, 692), (604, 710), (468, 931)]               # the support buildings' middles
AB_FENCE = (92, 38, 1954, 3018)                                         # the perimeter fence
# the Apache's forward base, cut from the same picture
FOB_CROP = (60, 560, 960, 1990)
FOB_PADS = [(605, 1612), (703, 1612), (801, 1612), (605, 1748), (703, 1748), (801, 1748),   # the six helipads (an
            (605, 1880), (703, 1880), (801, 1880)]                     # Apache on each); free spots on the apron
FOB_FREE = [6, 7, 8]
FOB_APRON = (525, 1505, 900, 1955)
FOB_GATE = (60, 1497)                          # where the gate road leaves the cut picture, west
FOB_AREA = (106, 580, 912, 1975)               # inside its fence (the picture's west fence, closed round it)
FOB_FENCE_X = 106                              # the west fence's line in the picture
FOB_BLDS = [(468, 931, 113, 68, 'hall'), (451, 618, 78, 33, 'hall'), (604, 710, 91, 34, 'hall')]
FOB_AT = (1854, 789)                           # map px of the cut picture's top left in the theatre

def _grade_lay(img, pic, X, Y, rng, ring_lo=20, ring_hi=320, fade=(30, 150, 170)):
    """lay pic (float RGB) on img (level-2 PIL image) at X, Y (level-2 px), its colours graded to the ground under its
    margin, its edge faded on a ragged line"""
    ph, pw = pic.shape[:2]
    under = np.asarray(img.crop((X, Y, X + pw, Y + ph)), np.float32)
    yy, xx = np.mgrid[0:ph, 0:pw]
    de = np.minimum(np.minimum(xx, pw - 1 - xx), np.minimum(yy, ph - 1 - yy)).astype(np.float32)
    g = rng.random((ph // 160 + 2, pw // 160 + 2)).astype(np.float32)
    nz = np.asarray(Image.fromarray(g).resize((pw, ph), Image.BICUBIC), np.float32) - 0.5
    a = np.clip((de - fade[0] - nz * fade[1]) / fade[2], 0, 1); a = a * a * (3 - 2 * a)
    ring = (de > ring_lo) & (de < ring_hi)
    gain = under[ring].mean(0) / pic[ring].mean(0)
    w = 0.5 + 0.5 * np.clip(1 - (de - 200) / 600, 0, 1)
    pic = pic * (1 + (gain - 1) * w[..., None])
    img.paste(Image.fromarray((under * (1 - a[..., None]) + pic * a[..., None]).clip(0, 255).astype(np.uint8)), (X, Y))
    return gain

def fob_place(img, rng, K, road, src):
    """the Apache's forward base, laid on the theatre's ground at FOB_AT, with the access road from the main road to
    its gate. Returns the buildings (for ruins) and what the game needs: the pads, the apron, the gate, the area"""
    ox, oy = FOB_AT
    f = PIC_MPX * M2P
    A = np.asarray(Image.open(src).convert('RGB'))
    cx0, cy0, cx1, cy1 = FOB_CROP
    c = A[cy0:cy1, cx0:cx1].copy()
    sand0 = np.median(c.reshape(-1, 3), 0).astype(np.uint8)
    # its own fence closed round it: the west fence's run (the picture's, posts and shadows) beyond FOB_AREA cleared,
    # the same run laid north, south (turned: the posts' shadows still fall south-east) and east; the hangar and
    # the runway's link road beyond the east fence cleared
    fx0, fy0, fx1, fy1 = [v - o for v, o in zip(FOB_AREA, (cx0, cy0, cx0, cy0))]
    run = A[600:1440, FOB_FENCE_X - 8:FOB_FENCE_X + 14]          # 840 m of the west fence, 8 px either side of it
    c[:fy0 - 8] = sand0; c[fy1 + 14:] = sand0; c[:, fx1 - 8:] = sand0
    for k in range(fy0, fy1 + 14, 840):
        seg = run[:min(840, fy1 + 14 - k)]; c[k:k + len(seg), fx1 - 8:fx1 + 14] = seg
    L = fx1 + 2 - fx0
    for y in (fy0, fy1): c[y - 8:y + 14, fx0:fx0 + L] = run.transpose(1, 0, 2)[:, :L]
    # the apron's concrete, taken whole (its grey is near the sand's)
    ax0, ay0, ax1, ay1 = FOB_APRON
    apron = Image.new('L', (cx1 - cx0, cy1 - cy0), 0)
    ImageDraw.Draw(apron).rectangle((ax0 - cx0, ay0 - cy0, ax1 - cx0, ay1 - cy0), fill=255)
    pic = Image.fromarray(c)
    pw, ph = round(pic.size[0] * f * K), round(pic.size[1] * f * K)
    pic = np.asarray(pic.resize((pw, ph), Image.LANCZOS), np.float32)
    apron = np.asarray(apron.resize((pw, ph), Image.BILINEAR).filter(ImageFilter.GaussianBlur(2)), np.float32) / 255
    # only what was built is taken: the apron, the buildings, the roads, the fence; its sand (what is near the
    # picture's own sand colour) gives way to the theatre's ground under it, so no edge of the cut shows
    X, Y = ox * K, oy * K
    under = np.asarray(img.crop((X, Y, X + pw, Y + ph)), np.float32)
    sand = np.median(pic.reshape(-1, 3), 0)
    built = np.clip((np.abs(pic - sand).sum(2) - 70) / 50, 0, 1)
    bm = Image.fromarray((built * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(9)).filter(ImageFilter.GaussianBlur(4))
    built = np.maximum(np.asarray(bm, np.float32) / 255, apron)
    yy, xx = np.mgrid[0:ph, 0:pw]
    de = np.minimum(np.minimum(xx, pw - 1 - xx), np.minimum(yy, ph - 1 - yy)).astype(np.float32)
    a = (built * np.clip(de / 40, 0, 1))[..., None]
    # (its colours a little toward the ground's, as the sun and dust have them there)
    gain = under.reshape(-1, 3).mean(0) / sand
    pic = pic * (1 + (gain - 1) * 0.5)
    img.paste(Image.fromarray((under * (1 - a) + pic * a).clip(0, 255).astype(np.uint8)), (X, Y))
    print('forward base', pw, 'x', ph, 'built', round(float(built.mean()), 3), 'gain', gain.round(3))
    M = lambda x, y: (ox + (x - FOB_CROP[0]) * f, oy + (y - FOB_CROP[1]) * f)
    # the access road, 6 m: from the main road at about the gate's latitude, a gentle curve east to the gate
    gx, gy = M(*FOB_GATE)
    rp = min((p for p in road if p[0] < gx), key=lambda p: abs(p[1] - gy) + abs(p[0] - gx) * 0.2)
    rx0, rx1 = int(rp[0]) - 10, int(gx) + 90
    ry0, ry1 = int(min(rp[1], gy)) - 40, int(max(rp[1], gy)) + 40
    reg = np.asarray(img.crop((rx0 * K, ry0 * K, rx1 * K, ry1 * K)), np.float32)
    m = Image.new('L', (reg.shape[1], reg.shape[0]), 0)
    n = 300; s = np.linspace(0, 1, n)
    xs = rp[0] + 3 + (gx + 75 - rp[0] - 3) * s
    ys = rp[1] + (gy - rp[1]) * (1 - np.cos(s * np.pi)) / 2 + 22 * np.sin(3 * np.pi * s) * np.sin(np.pi * s)
    P = [((x - rx0) * K, (y - ry0) * K) for x, y in zip(xs, ys)]
    ImageDraw.Draw(m).line(P, fill=255, width=int(6 * M2P * K), joint='curve')
    ma = np.asarray(m.filter(ImageFilter.GaussianBlur(1.5)), np.float32)[..., None] / 255
    ma = ma * np.clip((np.arange(reg.shape[1])[None, :, None] / K + rx0 - gx - 75) / -25, 0, 1)   # fades into the picture's road
    g = rng.random((reg.shape[0] // 40 + 2, reg.shape[1] // 40 + 2)).astype(np.float32)
    dn = np.asarray(Image.fromarray(g).resize(m.size, Image.BICUBIC), np.float32)[..., None]
    sand = np.clip((reg[..., :1] - reg[..., 2:3] - 55) / 40, 0, 1)
    ma = ma * (1 - sand * np.clip(dn * 2 - 0.6, 0, 1) * 0.9)
    lum = reg.mean(2, keepdims=True)
    tar = np.array([92, 88, 80], np.float32) + (lum - lum.mean()) * 0.12 + rng.normal(0, 4, reg.shape[:2] + (1,)).astype(np.float32)
    reg = reg * (1 - ma) + tar * ma
    m2 = Image.new('L', m.size, 0); ImageDraw.Draw(m2).line(P, fill=255, width=int(10 * M2P * K), joint='curve')
    sh = np.asarray(m2.filter(ImageFilter.GaussianBlur(6)), np.float32)[..., None] / 255 * (1 - ma) * 0.35
    reg = reg * (1 - sh) + np.array([196, 180, 150], np.float32) * sh
    img.paste(Image.fromarray(reg.clip(0, 255).astype(np.uint8)), (rx0 * K, ry0 * K))
    R = lambda v: round(v, 1)
    box = lambda b: [R(v) for v in (*M(b[0], b[1]), *M(b[2], b[3]))]
    blds = [(*M(x, y), w * f, h * f, 0, k) for x, y, w, h, k in FOB_BLDS]
    info = {'pads': [[R(v) for v in M(*p)] for p in FOB_PADS], 'padFree': FOB_FREE, 'apron': box(FOB_APRON),
            'gate': [R(gx), R(gy)], 'area': box(FOB_AREA), 'heading': -1.5708,
            'pic': [ox, oy, R(pw / K), R(ph / K)]}
    return {'blds': blds, 'info': info}

def airbase_info():
    """the F-15's base: where its picture lies (map px) and its places"""
    f = PIC_MPX * M2P; w, h = 2048 * f, 3072 * f
    x0, y0 = AB_CENTRE[0] - w / 2, AB_CENTRE[1] - h / 2
    R = lambda v: round(v, 1)
    M = lambda x, y: [R(x0 + x * f), R(y0 + y * f)]
    rx, ry0, ry1, rw = AB_RUNWAY
    parked = [M(x, y) + [90] for x in (1113, 1340) for y in AB_BAYS if not (x == 1340 and abs(y - AB_STAND[1]) < 10)]
    fx0, fy0, fx1, fy1 = AB_FENCE
    return {'rect': [R(x0), R(y0), R(w), R(h)], 'runway': [M(rx, 0)[0], M(0, ry0)[1], M(0, ry1)[1], R(rw * f)],
            'taxi': {'stand': M(*AB_STAND[:2]) + [AB_STAND[2]], 'path': [M(*p) for p in AB_TAXI], 'lineup': [M(*p) for p in AB_LINEUP]},
            'dress': {'shades': [M(a, b) + M(c, d) for a, b, c, d in AB_SHADES], 'jets': parked, 'has': [M(*p) + [90] for p in AB_HAS],
                      'tower': M(*AB_TOWER), 'fire': M(*AB_FIRE[:2]) + [AB_FIRE[2]], 'hangar': M(*AB_HANGAR[:2]) + [AB_HANGAR[2]],
                      'ops': [M(*p) for p in AB_OPS], 'fence': M(fx0, fy0) + M(fx1, fy1),
                      'edge': [M(rx - rw / 2 - 2, 0)[0], M(rx + rw / 2 + 2, 0)[0], M(0, ry0)[1], M(0, ry1)[1]],
                      'holds': [M(1620, 158), M(1620, 1097), M(1620, 1902), M(1620, 2912)]}}

def plain(om, o, rect):
    """the ground levelled round the base on outer2 (om, at its place o in the theatre): the base wants its 1.9 x 2.9 km
    flat and the valley it lies in is narrower, its ridges reaching in. Under it and 350 to 800 m round it (a ragged
    edge, some 250 m soft) the ground takes the valley floor's colour there (the light ground near, the dark rock left
    out), its own fine grain kept at a third: a levelled plain, the ridges about it as they were"""
    a = np.asarray(om, np.float32); n = a.shape[0]; s = n / o['size']; ox, oy = o['cx'] - o['size'] / 2, o['cy'] - o['size'] / 2
    x0, y0, w, h = rect; mpp = 1 / (s * M2P)                  # metres an outer2 pixel
    m = round(1600 / mpp); u0, v0 = max(0, int((x0 - ox) * s) - m), max(0, int((y0 - oy) * s) - m)
    u1, v1 = min(n, int((x0 + w - ox) * s) + m), min(n, int((y0 + h - oy) * s) + m)
    win = a[v0:v1, u0:u1]; H, W = win.shape[:2]
    yy, xx = np.mgrid[0:H, 0:W]; px, py = (xx + u0) / s + ox, (yy + v0) / s + oy
    d = np.hypot(np.maximum(0, np.maximum(x0 - px, px - x0 - w)), np.maximum(0, np.maximum(y0 - py, py - y0 - h))) / M2P
    g = np.random.default_rng(11).random((H // 6 + 2, W // 6 + 2)).astype(np.float32)
    nz = np.asarray(Image.fromarray(g).resize((W, H), Image.BICUBIC), np.float32)
    al = np.clip((350 + 450 * nz - d) / 250, 0, 1); al = (al * al * (3 - 2 * al))[..., None]
    L = win.mean(2); light = ((L > 125) & (win[..., 2] < win[..., 0])).astype(np.float32)[..., None]
    k = round(600 / mpp) | 1
    from scipy.ndimage import gaussian_filter as blur
    lo = np.dstack([blur(win[..., c] * light[..., 0], k / 2) for c in range(3)]) / (blur(light[..., 0], k / 2)[..., None] + 1e-3)
    fine = win - np.dstack([blur(win[..., c], 1.5) for c in range(3)])
    a[v0:v1, u0:u1] = win * (1 - al) + (lo + fine * 0.35) * al
    return Image.fromarray(a.clip(0, 255).astype(np.uint8))

def airbase(src, outer, tiles_dir):
    """the F-15's base as its own patch of ground on outer2 (the region's 16.6 km zoom-out), on a plain levelled round
    it (plain(): written into outer2.jpg, so make_region.py, which writes outer2.jpg afresh, calls this after): its
    margin graded to that ground's colours and faded into it; the six full-size quarters and the copy for afar, with
    alpha"""
    import json, pathlib
    pic = np.asarray(Image.open(src).convert('RGB'), np.float32)
    info = airbase_info(); x0, y0, w, h = info['rect']
    o = outer[1]; op = pathlib.Path(tiles_dir) / 'outer2.jpg'
    om = plain(Image.open(op).convert('RGB'), o, info['rect']); om.save(op, quality=84); n = om.size[0]
    # outer2 under the patch, at the picture's size (its turn, under half a degree, left out)
    u0, v0 = (x0 - (o['cx'] - o['size'] / 2)) / o['size'] * n, (y0 - (o['cy'] - o['size'] / 2)) / o['size'] * n
    under = np.asarray(om.crop((round(u0), round(v0), round(u0 + w / o['size'] * n), round(v0 + h / o['size'] * n))).resize((2048, 3072), Image.BICUBIC), np.float32)
    rng = np.random.default_rng(5)
    ph, pw = pic.shape[:2]
    yy, xx = np.mgrid[0:ph, 0:pw]
    de = np.minimum(np.minimum(xx, pw - 1 - xx), np.minimum(yy, ph - 1 - yy)).astype(np.float32)
    g = rng.random((ph // 160 + 2, pw // 160 + 2)).astype(np.float32)
    nz = np.asarray(Image.fromarray(g).resize((pw, ph), Image.BICUBIC), np.float32) - 0.5
    # (inside its fence, kept whole; its desert margin graded to the sand sea's and faded into it over some 60 m)
    a = np.clip((de - 8 - nz * 60) / 70, 0, 1); a = a * a * (3 - 2 * a)
    ring = (de > 10) & (de < 60)
    gain = under[ring].mean(0) / pic[ring].mean(0)
    wgt = np.clip(1 - (de - 40) / 400, 0, 1)
    pic = pic * (1 + (gain - 1) * wgt[..., None])
    rgba = np.dstack([pic.clip(0, 255), a * 255]).astype(np.uint8)
    d = pathlib.Path(tiles_dir) / 'airbase'; d.mkdir(parents=True, exist_ok=True)
    im = Image.fromarray(rgba, 'RGBA')
    for ty in range(3):
        for tx in range(2):
            im.crop((tx * 1024, ty * 1024, tx * 1024 + 1024, ty * 1024 + 1024)).save(d / f'{tx}_{ty}.webp', quality=86, method=6)
    im.resize((1024, 1536), Image.LANCZOS).save(d / 'far.webp', quality=86, method=6)
    print('air base patch', info['rect'], 'gain', gain.round(3))
    return info
