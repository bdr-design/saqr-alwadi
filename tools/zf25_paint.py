"""ZF-25 paint (stage 3): textures drawn by code in each part's own UV space, which tools/blender_zf25.py lays out at
true scale (u along the part in metres, v round its section in metres from the seam). So every panel line, rivet row
and access panel is placed in metres on the real skin, and one drawing makes three maps:

  base colour   the type's single grey (FS 36118 "gunship grey"), a lighter radome, bare titanium round the engines,
                grime and streaks drawn aft by the airflow, the panel lines a shade darker
  roughness     matt paint, the lines and grime rougher, worn edges smoother
  normal        from a height map: the panel lines recessed, the rivets' heads raised a hair

Commands (metric u, v):  ('line', pts, rivets)   ('panel', pts)   ('fill', pts, rgb, rough, metal)   ('stripe', pts, rgb, width_m)
                          ('decal', rgba_image, (u, v), width_m, rotate_180)
"""
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

GREY = (0.31, 0.325, 0.34)             # FS 36118 "gunship grey", sRGB 0..1
LINE_DARK = 0.72                       # (a panel line's colour: the base times this)


def _noise(h, w, rng, scales=((8, 0.5), (32, 0.3), (128, 0.2))):
    """smooth value noise 0..1, a sum of upsampled random grids"""
    out = np.zeros((h, w), np.float32)
    for s, a in scales:
        g = rng.random((max(2, h // s), max(2, w // s))).astype(np.float32)
        out += a * np.asarray(Image.fromarray((g * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC), np.float32) / 255
    out -= out.min(); out /= max(out.max(), 1e-6)
    return out


def paint(name, size, umax, vmax, cmds, out_dir, seed=0, base=GREY, aft='+u', px_line=2):
    """draw the part's maps. size (W, H) pixels for (umax, vmax) metres; aft: which way the airflow runs in u ('+u' when
    u grows aft, as on the fuselage) for the streaks. Returns the three file paths."""
    W, H = size
    sx, sy = W / umax, H / vmax
    P = lambda pts: [(float(u) * sx, H - float(v) * sy) for u, v in pts]
    rng = np.random.default_rng(seed)
    hgt = Image.new('L', (W, H), 128); dh = ImageDraw.Draw(hgt)          # height: 128 flat, lower recessed
    lin = Image.new('L', (W, H), 0); dl = ImageDraw.Draw(lin)            # 255 on panel lines
    col = Image.new('RGB', (W, H)); dc = ImageDraw.Draw(col)
    rough = Image.new('L', (W, H), 150); dr = ImageDraw.Draw(rough)
    metal = Image.new('L', (W, H), 0); dm = ImageDraw.Draw(metal)
    c255 = lambda c: tuple(int(round(min(max(v, 0), 1) * 255)) for v in c)
    dc.rectangle([0, 0, W, H], fill=c255(base))
    # fills first (radome, titanium, walkways), then lines and rivets over them
    for c in cmds:
        if c[0] == 'fill':
            pts, rgb, rg, mt = P(c[1]), c[2], c[3], c[4]
            dc.polygon(pts, fill=c255(rgb)); dr.polygon(pts, fill=int(rg * 255)); dm.polygon(pts, fill=int(mt * 255))
    for c in cmds:                                          # (decals: an RGBA image centred at (u, v), its width in metres)
        if c[0] == 'decal':
            img, (uc, vc), wm, flip = c[1], c[2], c[3], c[4]
            wp = max(2, int(wm * sx)); hp = max(2, int(wm * img.height / img.width * sy))
            d = img.resize((wp, hp), Image.LANCZOS)
            if flip: d = d.rotate(180)
            x0_, y0_ = int(uc * sx - wp / 2), int(H - vc * sy - hp / 2)
            vsh = c[5] if len(c) > 5 else None                 # (v offset (m) by u: where v round the section drifts along the part)
            if vsh is None: col.paste(d, (x0_, y0_), d)
            else:
                for k in range(0, wp, 2):
                    st_ = d.crop((k, 0, min(k + 2, wp), hp)); dv = vsh((x0_ + k) / sx) - vsh(uc)
                    col.paste(st_, (x0_ + k, int(y0_ - dv * sy)), st_)
    for c in cmds:
        if c[0] == 'stripe':
            dc.line(P(c[1]), fill=c255(c[2]), width=max(1, int(c[3] * sx)))
    riv = []
    for c in cmds:
        if c[0] in ('line', 'panel'):
            pts = P(c[1] + ([c[1][0]] if c[0] == 'panel' else []))
            if len(pts) < 2: continue
            dl.line(pts, fill=255, width=px_line); dh.line(pts, fill=60, width=px_line)
            if c[0] == 'panel' or (len(c) > 2 and c[2]):
                riv.append(c[1] + ([c[1][0]] if c[0] == 'panel' else []))
    # rivets: a row each side of a line, 1.2 cm off, every 4 cm (screws round panels every 6 cm)
    rr = max(1.0, 0.004 * sx)
    for pts in riv:
        q = np.array(pts, float)
        seg = np.diff(q, axis=0); ln = np.linalg.norm(seg, axis=1)
        for (a, b), L, d in zip(zip(q[:-1], q[1:]), ln, seg):
            if L < 1e-6: continue
            n_ = np.array([-d[1], d[0]]) / L
            for t in np.arange(0.02, L, 0.04):
                for off in (0.012, -0.012):
                    u, v = a + d * (t / L) + n_ * off
                    x, y = u * sx, H - v * sy
                    dh.ellipse([x - rr, y - rr, x + rr, y + rr], fill=150)
    # weathering: low-frequency grime, finer mottling, streaks aft from the panel lines
    hgt_a = np.asarray(hgt, np.float32) / 255; lin_a = np.asarray(lin, np.float32) / 255
    g1 = _noise(H, W, rng); g2 = _noise(H, W, rng, ((4, 0.6), (16, 0.4)))
    st = Image.fromarray((lin_a * 255).astype(np.uint8))
    k = max(3, int(0.25 * sx))                                          # (streaks ~25 cm aft of each line)
    st = np.asarray(st.filter(ImageFilter.BoxBlur(1)), np.float32) / 255
    sh = np.zeros_like(st)
    for i in range(1, k, max(1, k // 12)):
        sh = np.maximum(sh, np.roll(st, i if aft == '+u' else -i, axis=1) * (1 - i / k))
    colr = np.asarray(col, np.float32) / 255
    shade = (1 - 0.10 * (g1 - 0.5) - 0.04 * (g2 - 0.5)) * (1 - 0.10 * sh) * (1 - (1 - LINE_DARK) * lin_a)
    colr = np.clip(colr * shade[..., None], 0, 1)
    rgh = np.asarray(rough, np.float32) / 255 + 0.06 * (g2 - 0.5) + 0.12 * lin_a + 0.05 * sh
    rgh = np.clip(rgh, 0.15, 0.95)
    # normal from height (recessed lines, raised rivets), in tangent space
    hb = np.asarray(Image.fromarray((hgt_a * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 255
    gy, gx = np.gradient(hb); s = 2.5
    nx, ny, nz = -gx * s, gy * s, np.ones_like(hb)
    nrm = np.stack([nx, ny, nz], -1); nrm /= np.linalg.norm(nrm, axis=-1, keepdims=True)
    out = {}
    for k_, arr in (('base', (colr * 255).astype(np.uint8)), ('rough', (rgh * 255).astype(np.uint8)),
                    ('normal', ((nrm * 0.5 + 0.5) * 255).astype(np.uint8)), ('metal', np.asarray(metal))):
        p = out_dir / f'{name}_{k_}.png'; Image.fromarray(arr).save(p); out[k_] = p
    return out


def text_decal(text, font_path, rgb, px=240, rtl=True):
    """a line of text (Arabic shaped right to left) as an RGBA image cropped to its ink"""
    f = ImageFont.truetype(str(font_path), px, layout_engine=ImageFont.Layout.RAQM)
    im = Image.new('RGBA', (px * (len(text) + 2), px * 2), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    d.text((px // 2, px // 4), text, font=f, fill=tuple(int(c * 255) for c in rgb) + (255,),
           **({'direction': 'rtl', 'language': 'ar'} if rtl else {}))
    return im.crop(im.getbbox())
