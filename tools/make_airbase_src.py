"""Compose the air base orthophoto (assets/originals/airbase.png) from the owner's two generated images:
  assets/originals/airbase_complex.png  — the facilities and apron (hangars, shelters, helipads, jet stands,
                                           tower, fire station, fuel farm), 2048 x 2048, north up.
  assets/originals/airbase_runway.png   — a runway 18/36 strip with a parallel taxiway, 512 x 2048, north up.

Why two images and a compositor, not one picture: a real 2,000 m runway at a true 45 m width is a 44:1 sliver that
no single generated image gives. So the runway keeps its own thresholds (18 at the north, 36 at the south) and the
plain middle is mirror-tiled to any length we want — the length is one number here, so the base never needs
regenerating to grow (the owner's ask: «خليه مستقبلي»). The complex is laid to its west, a parallel taxiway with
links joins the two.

Output is one orthophoto at PIC_MPX metres a pixel, plus assets/originals/airbase.json with the places the game
needs (runway ends, apron, pads, stands, gate, fence, buildings), measured on the composite. make_airbase.place()
lays the picture on the theatre and reads the sidecar, so changing the layout here needs no code change there.

    python3 tools/make_airbase_src.py            # writes airbase.png (+ .json) and a downscaled preview
"""
import json
import sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = __import__('pathlib').Path(__file__).resolve().parent.parent
ORIG = ROOT / 'assets' / 'originals'
sys.path.insert(0, str(ROOT / 'tools'))
from mapkit import quilt

PIC_MPX = 0.413                       # the composite's scale: metres a pixel (the runway image's own, 45 m / 109 px)
RUNWAY_M = 2000.0                     # the runway, threshold to threshold
MARGIN_M = 120.0                      # graded overrun / stopway past each threshold, before the desert
COMPLEX_W_M = 600.0                   # the facilities complex, laid this wide to its west
mpx = lambda m: m / PIC_MPX           # metres -> composite px

# ---- the runway strip (its own pixels; paved width measured at 109 px = 45 m, so it is used near native scale)
RW = Image.open(ORIG / 'airbase_runway.png').convert('RGB')
rw = np.asarray(RW, np.float32)
RW_H, RW_W = rw.shape[:2]
RW_SCALE = 45.0 / 109.0 / PIC_MPX     # strip px -> composite px (~1.0: the strip is already near the output scale)
# the runway centreline and paved edges on the strip, from the dark asphalt column
dark = rw.mean(2) < 100
colc = dark.sum(0)
xs = np.where(colc > RW_H * 0.6)[0]
RW_CX = (xs.min() + xs.max()) / 2            # centreline, strip px
RW_HALF = (xs.max() - xs.min()) / 2          # paved half width, strip px
# the strip's clean middle (plain runway, no numbers or touchdown bars): mirror-tiled to make the length
CAP_TOP = 860                                # keep 0..CAP_TOP (the 18 threshold, its bars and touchdown zone)
CAP_BOT = RW_H - 820                         # keep CAP_BOT..end (the 36 threshold)
BAND = rw[900:1240]                          # a plain band to tile

def runway_panel(total_px):
    """the strip stretched to total_px tall by mirror-tiling its plain middle, caps kept; returns the panel and the
    centreline x / paved half width in panel px"""
    s = RW_SCALE
    top = rw[:CAP_TOP]; bot = rw[CAP_BOT:]
    need = int(round(total_px / s)) - top.shape[0] - bot.shape[0]     # middle rows wanted, in strip px
    band = BAND; bh = band.shape[0]
    tiles = []
    acc = 0; flip = False
    while acc < need:
        t = band[::-1] if flip else band
        tiles.append(t); acc += bh; flip = not flip
    mid = np.concatenate(tiles, 0)[:need]
    panel = np.concatenate([top, mid, bot], 0)
    img = Image.fromarray(panel.clip(0, 255).astype(np.uint8))
    img = img.resize((int(round(RW_W * s)), total_px), Image.LANCZOS)
    return img, RW_CX * s, RW_HALF * s

# ---- the facilities complex
CX = Image.open(ORIG / 'airbase_complex.png').convert('RGB')
CX_W0 = CX.size[0]
CS = mpx(COMPLEX_W_M) / CX_W0                 # complex px -> composite px
cxw = int(round(CX.size[0] * CS)); cxh = int(round(CX.size[1] * CS))
CXr = CX.resize((cxw, cxh), Image.LANCZOS)
# features measured on the complex image (complex px), turned to composite px when placed
PADS_C = [(1258, 924), (1500, 910), (1258, 1090), (1500, 1095), (1258, 1265), (1500, 1266)]   # six helipads
JETS_C = (720, 820, 820, 1300)                # the jet stands column (x0,y0,x1,y1)
APRON_C = (1150, 800, 1640, 1320)             # the central apron (helipads + stands)
AREA_C = (150, 70, 1980, 1980)                # inside the perimeter fence
GATE_C = (150, 470)                           # the gate on the west fence (the access road enters here)
# buildings for the ruins: hangars (two long canopy rows), shelters (bottom arches), tower, blocks, tanks
BLDS_C = ([(560 + i * 98, 270, 90, 180, 'hall') for i in range(14)] +      # north canopy row
          [(560 + i * 98, 560, 90, 170, 'hall') for i in range(14)] +      # second canopy row
          [(470 + i * 250, 1600, 150, 180, 'hall') for i in range(6)] +    # hardened arch shelters
          [(1680, 300, 220, 220, 'tank'),                                   # fuel farm block
           (560, 760, 80, 80, 'hall'), (380, 900, 180, 140, 'hall'), (380, 1050, 200, 160, 'hall')])  # tower, blocks

def place_complex_features(ox, oy):
    M = lambda x, y: (ox + x * CS, oy + y * CS)
    B = lambda b: [*M(b[0], b[1]), *M(b[2], b[3])]
    return {
        'pads': [list(M(*p)) for p in PADS_C],
        'jets': B(JETS_C), 'apron': B(APRON_C), 'area': B(AREA_C), 'gate': list(M(*GATE_C)),
        'blds': [(*M(x, y), w * CS, h * CS, k) for (x, y, w, h, k) in BLDS_C],
    }

def compose():
    runway_px = int(round(mpx(RUNWAY_M)))
    panel_px = int(round(mpx(RUNWAY_M + 2 * MARGIN_M)))
    panel, pcx, phalf = runway_panel(panel_px)
    pw, ph = panel.size
    # canvas: the complex to the west, the runway strip to the east, a taxiway between
    gap = int(round(mpx(70)))                 # the lane between the complex's east taxiway and the runway taxiway
    W = cxw + gap + pw
    H = ph
    cy = (H - cxh) // 2                        # the complex beside the runway's midfield
    cx = 0
    rx = cxw + gap                             # the runway panel's west edge on the canvas
    # ---- desert ground under it all: feathered random patches of the strip's own desert margins (quilt), so it reads
    # as one natural plain, no tiling pattern
    rng = np.random.default_rng(7)
    src = np.concatenate([rw[:, 6:150], rw[:, RW_W - 150:RW_W - 6]], 1)   # the runway image's two desert sides
    canvas = quilt(rng, src, None, None, H, W, B=220)
    bg = Image.fromarray(canvas.clip(0, 255).astype(np.uint8))

    def feather(dst, src_img, X, Y, edge=60):
        a = np.asarray(src_img, np.float32); h, w = a.shape[:2]
        yy, xx = np.mgrid[0:h, 0:w]
        de = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)).astype(np.float32)
        al = np.clip(de / edge, 0, 1)[..., None]
        sl = dst[Y:Y + h, X:X + w]
        sl[:] = sl * (1 - al) + a * al

    # a parallel taxiway the length of the runway, 180 m west of the centreline, with links, drawn on the desert
    rwcx = rx + pcx                            # runway centreline on the canvas
    tcx = rwcx - mpx(180)                      # taxiway centreline
    draw = ImageDraw.Draw(bg)
    asph = (70, 70, 68)
    tw = mpx(23) / 2
    y0 = cy + cxh * 0.0;
    ty0, ty1 = (H - runway_px) / 2, (H + runway_px) / 2
    draw.rectangle([tcx - tw, ty0, tcx + tw, ty1], fill=asph)
    for ly in np.linspace(ty0 + mpx(60), ty1 - mpx(60), 5):
        draw.rectangle([tcx - tw, ly - tw, rwcx, ly + tw], fill=asph)
    # the lane from the complex's east taxiway to the taxiway, at the midfield
    draw.rectangle([cx + cxw - mpx(30), H / 2 - tw, tcx + tw, H / 2 + tw], fill=asph)
    canvas = np.asarray(bg, np.float32)

    feather(canvas, CXr, cx, cy, edge=50)
    feather(canvas, panel, rx, 0, edge=40)

    out = Image.fromarray(canvas.clip(0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.4))
    out.save(ORIG / 'airbase.png')
    out.resize((W // 4, H // 4), Image.LANCZOS).save(ROOT / 'tests' / 'out' / 'airbase_preview.png')

    # ---- the places the game needs, in composite px
    feats = place_complex_features(cx, cy)
    info = {
        'PIC_MPX': PIC_MPX, 'size': [W, H],
        'runway': [round(rwcx, 1), round(ty0, 1), round(ty1, 1), round(2 * phalf, 1)],
        'pads': [[round(x, 1), round(y, 1)] for x, y in feats['pads']], 'padFree': [1, 2, 4, 5],
        'apron': [round(v, 1) for v in feats['apron']], 'jets': [round(v, 1) for v in feats['jets']],
        'area': [round(v, 1) for v in feats['area']], 'gate': [round(v, 1) for v in feats['gate']],
        'blds': [[round(x, 1), round(y, 1), round(w, 1), round(h, 1), k] for (x, y, w, h, k) in feats['blds']],
        'taxiway': [round(tcx, 1), round(ty0, 1), round(ty1, 1)],
    }
    (ORIG / 'airbase.json').write_text(json.dumps(info, ensure_ascii=False, indent=1))
    print(f'airbase.png {W} x {H} px  ({W * PIC_MPX:.0f} x {H * PIC_MPX:.0f} m)  runway {RUNWAY_M:.0f} m')
    print('preview -> tests/out/airbase_preview.png')

if __name__ == '__main__':
    (ROOT / 'tests' / 'out').mkdir(parents=True, exist_ok=True)
    compose()
