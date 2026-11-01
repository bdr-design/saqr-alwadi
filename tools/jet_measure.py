"""The ZF-25's measurements, read off the owner's five blueprint pictures (assets/originals/jet_views/bp), for the
master model (tools/blender_zf25.py). Everything in metres; x from the nose tip aft, y to the left wing +, z up from
the lowest point of the aircraft (gear up).

  python3 tools/jet_measure.py      ->  assets/originals/jet_model/measure.json (+ measure_check.png: the outlines read)

  fuselage   stations: core half-width (without the intakes), top, bottom (canopy and fins left out), the intakes'
             outer half-width and span along x
  canopy     stations: sill, top, half-width
  wing / tailplane   leading and trailing edge x at each y out to the tip (top view), and their height (side view)
  fin        leading and trailing edge x at each height above its root (side view); root y and cant (front view)
  nozzles    centre y, z, radius (rear view)
"""
import json, pathlib
import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage
from scipy.ndimage import gaussian_filter1d as g1

root = pathlib.Path(__file__).resolve().parent.parent
SRC = root / 'assets' / 'originals' / 'jet_views' / 'bp'; OUT = root / 'assets' / 'originals' / 'jet_model'
LEN, SPAN = 19.4, 13.0

def view(name):
    a = np.asarray(Image.open(SRC / f'{name}.png').convert('RGB')).astype(np.float32)
    mg = (a[..., 0] + a[..., 2]) / 2 - a[..., 1]
    m = ndimage.binary_fill_holes(ndimage.binary_closing(mg < 150, iterations=3))
    lb, n = ndimage.label(m)
    if n > 1: m = lb == (np.argmax(ndimage.sum(m, lb, range(1, n + 1))) + 1)
    ex = np.clip(np.minimum(a[..., 0], a[..., 2]) - a[..., 1], 0, None) * m
    ys, xs = np.nonzero(m); x0, y0, x1, y1 = xs.min(), ys.min(), xs.max() + 1, ys.max() + 1
    return {'m': m[y0:y1, x0:x1], 'glass': (ex > 25)[y0:y1, x0:x1], 'lum': a[y0:y1, x0:x1].mean(2)}
T, Sd, F, Rr = view('bp_top'), view('bp_side'), view('bp_front'), view('bp_rear')
kt = LEN / T['m'].shape[0]                     # metres a top-view pixel (rows along the length)
ks = LEN / Sd['m'].shape[1]                    # metres a side-view pixel
HGT = Sd['m'].shape[0] * ks
kf = SPAN / F['m'].shape[1]                    # metres a front-view pixel
print('aircraft', LEN, SPAN, round(HGT, 3), '| front-view height', round(F['m'].shape[0] * kf, 3), 'rear', round(Rr['m'].shape[0] * SPAN / Rr['m'].shape[1], 3))

def runs(row):
    c = np.nonzero(row)[0]
    return np.split(c, np.nonzero(np.diff(c) > 1)[0] + 1) if c.size else []
tc = T['m'].shape[1] / 2
def central(row):
    for r in runs(row):
        if r[0] <= tc <= r[-1]: return r
    return None

NS = 200; fx = (np.arange(NS) + 0.5) / NS; X = fx * LEN
# ---- fuselage outline in the top view (the central run: with the intakes, the wing roots and tailplanes where they join)
hw_all = np.array([(lambda r: (r[-1] - r[0] + 1) / 2 * kt if r is not None else 0)(central(T['m'][min(int(f * T['m'].shape[0]), T['m'].shape[0] - 1)])) for f in fx])
# side view: top and bottom of the outline at each x
sm = Sd['m']; sc = lambda f: min(int(f * sm.shape[1]), sm.shape[1] - 1)
top_z = np.array([HGT - np.nonzero(sm[:, sc(f)])[0].min() * ks if sm[:, sc(f)].any() else np.nan for f in fx])
# (the belly without the pylons: in the side view they hang below it as thin stubs, which set the lowest point there
# and made the fuselage a third deeper than drawn; a horizontal opening 0.8 m wide takes them off)
smb = ndimage.binary_opening(sm, structure=np.ones((1, int(0.8 / ks))))
bot_z = np.array([HGT - np.nonzero(smb[:, sc(f)])[0].max() * ks if smb[:, sc(f)].any() else np.nan for f in fx])
# the glass (side view): sill and top along the canopy's stretch
g = ndimage.binary_closing(Sd['glass'], iterations=4)
g &= (np.arange(sm.shape[0])[:, None] < sm.shape[0] * 0.6) & (np.arange(sm.shape[1])[None, :] > sm.shape[1] * 0.08) & (np.arange(sm.shape[1])[None, :] < sm.shape[1] * 0.46)
g = ndimage.binary_fill_holes(ndimage.binary_opening(g, iterations=2))
sill = np.array([HGT - np.nonzero(g[:, sc(f)])[0].max() * ks if g[:, sc(f)].any() else np.nan for f in fx])
ctop = np.array([HGT - np.nonzero(g[:, sc(f)])[0].min() * ks if g[:, sc(f)].any() else np.nan for f in fx])
can = ~np.isnan(sill)
# where the wing, the tailplanes, the intakes and the fins are along x (fractions of the length, from the pictures)
def first_wide(lo, hi, w):          # first station in [lo, hi] where the top outline is wider than w (m, full width)
    sel = np.nonzero((fx >= lo) & (fx <= hi) & (hw_all * 2 > w))[0]; return float(fx[sel[0]]) if sel.size else None
# the intakes: the step out of the forebody, behind the canopy's front
fore = g1(hw_all, 2)
d = np.gradient(fore); i_step = int(np.argmax(np.where((fx > 0.25) & (fx < 0.45), d, -1)))
intake_x0 = float(fx[i_step]) - 0.02
# the wing root: the top outline grows past the intakes' width again
shoulder = float(np.median(hw_all[(fx > intake_x0 + 0.04) & (fx < intake_x0 + 0.08)]))
wing_x0 = float(fx[np.nonzero((fx > intake_x0 + 0.04) & (hw_all > shoulder + 0.25))[0][0]])
wide = np.nonzero(hw_all > shoulder + 0.25)[0]
seg = np.split(wide, np.nonzero(np.diff(wide) > 1)[0] + 1)
wing_x1 = float(fx[seg[0][-1]]); tp_x0 = float(fx[seg[1][0]]) if len(seg) > 1 else 0.84
print('intakes from', round(intake_x0, 3), '| wing root', round(wing_x0, 3), '-', round(wing_x1, 3), '| tailplane from', round(tp_x0, 3), '| shoulders', round(shoulder * 2, 2), 'm')
# fuselage half-width without the intakes: the forebody carried smoothly to the rear fuselage between the fins
core = hw_all.copy()
rear_w = float(np.median(hw_all[(fx > wing_x1 + 0.01) & (fx < tp_x0 - 0.005)]))
sel = fx >= intake_x0
core[sel] = np.interp(fx[sel], [intake_x0, wing_x0, wing_x1, 0.995], [hw_all[i_step - 3], hw_all[i_step - 3] * 1.12, rear_w * 0.62, 0.85])
# the body with the intakes (what the top view shows between the nose and the wing root, and its carry-through aft)
body = hw_all.copy(); sel = (fx >= wing_x0 - 0.01)
body[sel] = np.interp(fx[sel], [wing_x0 - 0.01, wing_x1 + 0.005, tp_x0 - 0.005, 0.995], [shoulder, rear_w, rear_w, 1.25])
# the spine: under the canopy the sill; over the fins carried to the nozzles
spine = top_z.copy(); spine[can] = sill[can]
fin_x0 = 0.76
i76 = np.searchsorted(fx, fin_x0); sel = fx >= fin_x0
spine[sel] = np.interp(fx[sel], [fin_x0, 1.0], [top_z[i76], (top_z[i76] + bot_z[-2]) / 2 + 0.6])
belly = ndimage.median_filter(bot_z, 7)
sm_ = lambda a: g1(ndimage.median_filter(a, 5), 2.5, mode='nearest')
core, body, spine, belly = sm_(core), sm_(body), sm_(spine), sm_(belly)
# ---- wing and tailplane planform: leading/trailing edge x at each y (top view, the left half)
def planform(x_lo, x_hi, y_from):
    m = T['m']; out = []
    for yy in np.linspace(y_from, SPAN / 2 - 0.02, 40):
        c = int(tc - yy / kt)
        if c < 0: break
        col = np.nonzero(m[int(x_lo / kt):int(x_hi / kt), c])[0]
        if col.size < 2: continue
        out.append([round(float(yy), 3), round(float((col.min() + int(x_lo / kt)) * kt), 3), round(float((col.max() + int(x_lo / kt)) * kt), 3)])
    return out
wing = planform(wing_x0 * LEN - 0.3, wing_x1 * LEN + 0.6, float(np.interp(0.62, fx, body)))
tail = None   # (after the fins are measured: it starts beyond their roots)
# heights: the wing on the upper part of the fuselage (the side view's thin wing line), the tailplanes level with the nozzles
row_line = None
lumc = Sd['lum'][:, sc(0.62)]; zz = HGT - np.arange(len(lumc)) * ks
# ---- fins (side view): above the spine, leading/trailing edge x at each height
fin = []
for zf in np.linspace(float(np.interp(0.85, fx, spine)) + 0.1, HGT - 0.03, 30):
    r = int((HGT - zf) / ks); row = sm[r, int(fin_x0 * sm.shape[1]):]
    c = np.nonzero(row)[0]
    if c.size < 2: continue
    fin.append([round(float(zf), 3), round(float((c.min() + int(fin_x0 * sm.shape[1])) * ks), 3), round(float((c.max() + int(fin_x0 * sm.shape[1])) * ks), 3)])
# fin root y and cant (front view): the two fins' columns near the top and near their root
fm = F['m']; fH = fm.shape[0] * kf; fcx = fm.shape[1] / 2
def fin_y(zf):
    r = int((fH - zf) / kf); row = fm[min(max(r, 0), fm.shape[0] - 1)]; rr = [q for q in runs(row) if np.mean(q) < fcx]
    return (fcx - np.mean(rr[0])) * kf if rr else None
y_tip = fin_y(fH - 0.15); y_low = fin_y(fH * 0.62)
cant = float(np.degrees(np.arctan2(y_tip - y_low, (fH - 0.15) - fH * 0.62))) if y_tip and y_low else 15.0
fin_root_y = float(y_low - np.tan(np.radians(cant)) * (fH * 0.62 - float(np.interp(0.85, fx, spine))))
print('fins: root y', round(fin_root_y, 2), 'cant', round(cant, 1), 'deg')
tail = planform(tp_x0 * LEN - 0.3, LEN, fin_root_y + 0.45)
# ---- nozzles: their pair's width at the tail in the top view (two cans side by side), their bottom in the side view
def pair_width(row):          # the runs within 1.6 m of the centreline (the two cans, a gap between them or not)
    rr = [r for r in runs(row) if abs(np.mean(r) - tc) * kt < 1.6]
    return (max(r[-1] for r in rr) - min(r[0] for r in rr) + 1) * kt if rr else np.nan
wn = np.nanmedian([pair_width(T['m'][min(int(f * T['m'].shape[0]), T['m'].shape[0] - 1)]) for f in np.linspace(0.975, 0.992, 8)])
rn = wn / 4
bn = np.nanmedian([HGT - np.nonzero(sm[:, sc(f)])[0].max() * ks for f in np.linspace(0.975, 0.99, 6)])
noz = [{'y': round(float(s_ * rn), 3), 'z': round(float(bn + rn), 3), 'r': round(float(rn), 3)} for s_ in (1, -1)]
print('nozzles', noz)
# ---- intakes (front view): the dark openings beside the fuselage
fv = F['lum']; dark = (fv < 60) & fm
lb, n = ndimage.label(ndimage.binary_opening(dark, iterations=2)); inl = []
for i in np.argsort(-ndimage.sum(dark, lb, range(1, n + 1)))[:2]:
    ys, xs = np.nonzero(lb == i + 1)
    inl.append({'y0': round(float(abs(fcx - xs.min()) * kf), 3), 'y1': round(float(abs(fcx - xs.max()) * kf), 3), 'z0': round(float(fH - ys.max() * kf), 3), 'z1': round(float(fH - ys.min() * kf), 3)})
print('intake openings', inl)
# ---- heights the front and rear views give directly: the wing (its lower surface level across the span, the upper
# coming down with its thickness), the tailplanes (the higher thin line behind it), the canopy's width by height
def lines(v):
    m = v['m']; k = SPAN / m.shape[1]; Hh = m.shape[0] * k; cx = m.shape[1] / 2; wing, tail = [], []
    for y in np.linspace(3.0, 6.2, 9):
        col = np.nonzero(m[:, int(cx - y / k)])[0]; rr = runs(np.isin(np.arange(m.shape[0]), col))
        segs = sorted([(Hh - r[-1] * k, Hh - r[0] * k) for r in rr], key=lambda q: q[0])
        if segs: wing.append((y, segs[0][0], segs[0][1]))
        if len(segs) > 1 and y < 4.2 and segs[1][1] < Hh * 0.55: tail.append((y, segs[1][0], segs[1][1]))   # (not a fin's tip)
    return wing, tail, Hh
wf, tf, Hf = lines(F); wr, trr, Hr = lines(Rr)
# (the two views drawn a little apart in height: each scaled to the side view's height)
wing_mid = lambda w, Hh: [(y, (lo + hi) / 2 * HGT / Hh) for y, lo, hi in w]
wm = np.array(wing_mid(wf, Hf) + wing_mid(wr, Hr))
slope, icpt = np.polyfit(wm[:, 0], wm[:, 1], 1)
wing_z = float(icpt + slope * 2.2); anhedral = float(np.degrees(np.arctan(slope)))
tail_z = float(np.mean([(lo + hi) / 2 * HGT / Hf for _, lo, hi in tf] + [(lo + hi) / 2 * HGT / Hr for _, lo, hi in trr]))
wing_t = float(np.median([(hi - lo) * HGT / Hf for _, lo, hi in wf[:3]]))
print('wing z at the root', round(wing_z, 2), 'anhedral', round(anhedral, 2), 'deg, seen thickness', round(wing_t, 2), '| tailplane z', round(tail_z, 2))
fm_ = F['m']; kf_ = SPAN / fm_.shape[1]; cxf = fm_.shape[1] / 2; can_w = []
for z in np.linspace(HGT - 0.05, HGT * 0.45, 40):
    r = int((Hf - z * Hf / HGT) / kf_); r = min(max(r, 0), fm_.shape[0] - 1)
    cen = [q for q in runs(fm_[r]) if q[0] <= cxf <= q[-1]]
    if cen: can_w.append([round(float(z), 3), round(float((cen[0][-1] - cen[0][0] + 1) / 2 * kf_), 3)])
st = lambda a: [round(float(v), 4) for v in a]
meas = {'units': 'm; x from the nose tip aft, y to the left +, z up from the lowest point', 'len': LEN, 'span': SPAN, 'hgt': round(HGT, 4),
        'stations': {'x': st(X), 'top_hw': st(g1(hw_all, 1.5)), 'core_hw': st(core), 'body_hw': st(body), 'spine': st(spine), 'belly': st(belly),
                     'canopy_sill': st(np.where(can, sill, np.nan)), 'canopy_top': st(np.where(can, ctop, np.nan))},
        'intakes': {'x0': round(intake_x0 * LEN, 3), 'x1': round(wing_x0 * LEN, 3), 'outer_hw': round(shoulder, 3), 'openings_front': inl},
        'wing': {'z': round(wing_z, 3), 'anhedral_deg': round(anhedral, 2), 'seen_thickness': round(wing_t, 3), 'x_root': [round(wing_x0 * LEN, 3), round(wing_x1 * LEN, 3)], 'stations_y_le_te': wing},
        'tailplane': {'z': round(tail_z, 3), 'stations_y_le_te': tail},
        'fin': {'x0': round(fin_x0 * LEN, 3), 'root_y': round(fin_root_y, 3), 'cant_deg': round(cant, 1), 'stations_z_le_te': fin},
        'nozzles': noz, 'front_halfwidth_by_z': can_w}
(OUT / 'measure.json').write_text(json.dumps(meas, indent=1, allow_nan=True))
print('wrote', OUT / 'measure.json', '| wing stations', len(wing), 'tail', len(tail), 'fin', len(fin))
