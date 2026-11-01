"""The ZF-25 master model in Blender, from its measurements (tools/jet_measure.py: assets/originals/jet_model/
measure.json). Stage 1: the shape (clay). Each piece a clean quad mesh with a subdivision surface:

  fuselage   superellipse sections (rounder at the nose, squarer aft) along the spine and belly lines
  intakes    the boxes either side of the forebody, their mouths raked and recessed
  canopy     a bubble over the sill
  wing, tailplanes, fins   lofts of a symmetric airfoil through the planform's stations
  nozzles    cans with a recess

Frame: x forward (the nose +x), y to the left wing, z up; metres; z 0 the lowest point, x 0 mid-length.

  <python 3.11 with bpy> tools/blender_zf25.py [--render <out dir>] [--blend <file>]
"""
import json, math, pathlib, sys
import numpy as np
import bpy, bmesh
from mathutils import Vector

root = pathlib.Path(__file__).resolve().parent.parent
import os
# (spec.json: the type's real proportions, the owner's choice; measure.json: read off the blueprints)
M = json.loads((root / 'assets' / 'originals' / 'jet_model' / os.environ.get('SHAPE', 'spec.json')).read_text().replace('NaN', 'null'))
L, SPAN, H = M['len'], M['span'], M['hgt']
st = M['stations']; sx = np.array(st['x'])
def prof(k): return np.array([np.nan if v is None else v for v in st[k]], float)
core, body, spine, belly = prof('core_hw'), prof('body_hw'), prof('spine'), prof('belly')
csill, ctop = prof('canopy_sill'), prof('canopy_top')
# (the belly: the side view drew it sagging in the middle, 2.6 m deep there; the owner asked for it slimmer: a
# straight flat belly from under the intakes' mouths to the nozzles, as a heavy strike fighter's, about 2 m deep)
_ib = min(o['z0'] for o in M['intakes']['openings_front']) - 0.1; _nb = min(q['z'] - q['r'] for q in M['nozzles'])
_flat = np.interp(sx / L, [0.0, 0.34, 0.80, 1.0], [-9, _ib, _ib - 0.02, _nb])
if 'source' not in M: belly = np.maximum(belly, _flat)
X = lambda x: L / 2 - x                       # blueprint x (from the nose) -> model x (forward +)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
col = bpy.data.collections.new('ZF-25'); scene.collection.children.link(col)

UVI = {}                                      # (each lofted part's UV layout: its rings' u, v in metres)
def mesh_obj(name, verts, faces, smooth=True, subsurf=2, parent=None, uv=None):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces]); me.update()
    if uv is not None:                                     # (before the normals' fix: flipping a face carries its UVs)
        corners, info = uv
        lay = me.uv_layers.new(name='UVMap'); lay.data.foreach_set('uv', np.array([c for fc in corners for c in fc], float).ravel())
        UVI[name] = info
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    if smooth: me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    if subsurf:
        m = ob.modifiers.new('subsurf', 'SUBSURF'); m.levels = 1; m.render_levels = subsurf
    if parent: ob.parent = parent
    return ob

def loft(rings, cap0=True, cap1=True):
    """rings: list of (n, 3) arrays, same n, closed loops -> quads, the ends closed by fans to their middles. Also lays
    out UVs at true scale (loft.last: the face corners' UVs and the layout): u the distance along the rings' middles, v
    the arc round each ring from its point 0 (the seam), both over the largest, in metres"""
    n = len(rings[0]); verts = np.concatenate(rings); faces = []
    cen = np.array([r.mean(0) for r in rings]); u_ = np.r_[0, np.cumsum(np.linalg.norm(np.diff(cen, axis=0), axis=1))]
    v_ = np.array([np.r_[0, np.cumsum(np.linalg.norm(np.diff(np.vstack([r, r[:1]]), axis=0), axis=1))] for r in rings])   # (n + 1: the seam twice)
    umax, vmax = max(u_[-1], 1e-3), max(v_[:, -1].max(), 1e-3)
    uvc = []
    for i in range(len(rings) - 1):
        for j in range(n):
            a, b = i * n + j, i * n + (j + 1) % n
            faces.append([a, b, b + n, a + n])
            uvc.append([(u_[i] / umax, v_[i, j] / vmax), (u_[i] / umax, v_[i, j + 1] / vmax), (u_[i + 1] / umax, v_[i + 1, j + 1] / vmax), (u_[i + 1] / umax, v_[i + 1, j] / vmax)])
    extra = []
    if cap0:
        c = len(verts) + len(extra); extra.append(rings[0].mean(0))
        faces += [[c, (j + 1) % n, j] for j in range(n)]
    if cap1:
        c = len(verts) + len(extra); extra.append(rings[-1].mean(0)); o = (len(rings) - 1) * n
        faces += [[c, o + j, o + (j + 1) % n] for j in range(n)]
    uvc += [[(0.0, 0.0)] * 3] * (len(faces) - len(uvc))            # (the end caps: one corner of the map, out of sight)
    loft.last = (uvc, {'u': u_, 'v': v_, 'umax': umax, 'vmax': vmax, 'rings': rings})
    return np.concatenate([verts] + ([np.array(extra)] if extra else [])), faces

# ---- fuselage, the intakes part of it: each section the smooth union of the fuselage's own (a superellipse between
# the spine and the belly) and the intake duct beside it (a rounded box from the mouth aft, swelling out over the first
# 0.7 m), so the shoulders run out of the body as one surface, not boxes stuck on
ix0, ix1 = M['intakes']['x0'], M['intakes']['x1']
op = M['intakes']['openings_front'][0]; yi0, yi1 = sorted([op['y0'], op['y1']]); zi0, zi1 = op['z0'], op['z1']
yo_full = M['intakes']['outer_hw']
# Each section is a closed loop through eight anchors a side (keel, bottom, bottom corner, side, shoulder, the duct's
# inner top, the sill, the spine), the same anchors at every station, so the edge loops run unbroken nose to tail (as
# subdivision and UVs want). The anchors' places come from three families blended along the length: the round radome,
# the forebody/intakes (a cockpit deck with the ducts' boxes beside it), the aft body (two engine nacelles side by side,
# a shallow channel between them, a flat shelf out to the tail booms). Between anchors a centripetal Catmull-Rom curve,
# sampled at fixed counts.
X_END = L - 0.9                                              # (the fuselage ends here; the nozzles stand 0.9 m proud)
u = np.linspace(0, 1, 120); xs_ = 0.05 + (X_END - 0.05) * (0.7 * (0.5 - 0.5 * np.cos(np.pi * u)) + 0.3 * u)   # (denser at the ends, never under ~3 cm)
IXD = ix0 + 0.45                                             # (the fuselage's ducts begin here, behind the intakes' lips)
xs_ = xs_[(xs_ < IXD - 0.15) | (xs_ > IXD + 1.05)]
xs_ = np.unique(np.concatenate([xs_, IXD + np.array([-0.08, 0.0, 0.1, 0.2, 0.3, 0.42, 0.55, 0.68, 0.8, 0.92])]))
SEG = [4, 4, 5, 5, 5, 4, 4, 5]                               # (points per segment between the 9 anchors, a half)
NA = 2 * sum(SEG)
AN_ = np.cumsum([0] + SEG)                                   # (the anchors' indices on the +y side)
NODECK = [False]                                             # (sections without the cockpit's deck: the glass is derived from them)
nz_ = M['nozzles'][0]; ny_, nzc, nr_ = abs(nz_['y']), nz_['z'], nz_['r']
_cx = sx[~np.isnan(csill)]; _csill = csill[~np.isnan(csill)]; _ctop = ctop[~np.isnan(csill)]; X_WS0, X_C1 = float(_cx[0]), float(_cx[-1])
HUMP = 0.11                                                  # (the engine humps' rise above the spine line; the valley 2.2 times as deep below it)
SILL_HW = 0.60                                               # (the canopy's half width at its sill)
xn = 0.62 * L                                                # (aft of here the nacelles have the underside)
ss_ = lambda t: float(np.clip(t, 0, 1)) ** 2 * (3 - 2 * float(np.clip(t, 0, 1)))
def catmull(P, counts):
    """closed centripetal Catmull-Rom through P (n, 2), counts[i] points from P[i] (inclusive) toward P[i+1]"""
    n = len(P); out = []
    for i in range(n):
        p0, p1, p2, p3 = P[i - 1], P[i], P[(i + 1) % n], P[(i + 2) % n]
        d = lambda a, b: max(np.linalg.norm(b - a) ** 0.5, 1e-4)
        t0 = 0; t1 = t0 + d(p0, p1); t2 = t1 + d(p1, p2); t3 = t2 + d(p2, p3)
        for t in np.linspace(t1, t2, counts[i], endpoint=False):
            a1 = (t1 - t) / (t1 - t0) * p0 + (t - t0) / (t1 - t0) * p1
            a2 = (t2 - t) / (t2 - t1) * p1 + (t - t1) / (t2 - t1) * p2
            a3 = (t3 - t) / (t3 - t2) * p2 + (t - t2) / (t3 - t2) * p3
            b1 = (t2 - t) / (t2 - t0) * a1 + (t - t0) / (t2 - t0) * a2
            b2 = (t3 - t) / (t3 - t1) * a2 + (t - t1) / (t3 - t1) * a3
            out.append((t2 - t) / (t2 - t1) * b1 + (t - t1) / (t2 - t1) * b2)
    return np.array(out)
def glass_w(x):
    """the glass's half width at its foot, from above (an oval off the owner's photo of the type: narrow at the
    windscreen's foot, fullest over the front seat, a point at its tail)"""
    return float(np.interp(x, [X_WS0, X_WS0 + 0.5, 4.6, 5.6, 6.6, 7.3, X_C1], [0.40, 0.52, 0.60, 0.62, 0.60, 0.42, 0.06]))
def glass_base(x):
    """where the glass stands on the body: at its half width from above (glass_w) on the body's own round section
    (no deck), the highest skin there (the cockpit's top, not a duct's); the rails rise at its back to meet its top.
    Returns (y, z, unit tangent (dy, dz) going up: the body's own slope there, carried on)"""
    nd0, NODECK[0] = NODECK[0], True
    try: h = section(x)[:sum(SEG) + 1, 1:]
    finally: NODECK[0] = nd0
    up = h[AN_[3]:]
    yb = min(glass_w(x), 0.95 * float(up[:, 0].max()))
    zs = float(np.interp(x, _cx, _csill))                    # (the rails: one level line, the body rising to meet it)
    T = np.array([0.55, 1.0]) / np.hypot(0.55, 1.0)          # (the glass swells out above its foot: the type's blister)
    return yb, zs, T
def anchors(x):
    """the nine anchors (y >= 0) from the keel round to the spine"""
    f_ = x / L
    wc = max(float(np.interp(x, sx, core)), 0.02); zt = float(np.interp(x, sx, spine)); zb = float(np.interp(x, sx, belly))
    zt = max(zt, zb + 0.04); zc, hh = (zt + zb) / 2, (zt - zb) / 2
    # round: a superellipse (p 2.1) at fixed angles
    ang = np.radians([-90, -76, -62, -35, 0, 32, 55, 74, 90]); pe = 2 / 2.1
    rnd = np.stack([wc * np.abs(np.cos(ang)) ** pe, zc + hh * np.sign(np.sin(ang)) * np.abs(np.sin(ang)) ** pe], 1)
    # forebody and intakes: a level belly, the ducts' boxes beside the cockpit deck (no ducts ahead of the mouth)
    g = ss_((x - IXD) / 0.8) if x >= IXD else 0.0                      # (the ducts grow out of the body inside the intakes' shells)
    wb = wc + (max(float(np.interp(x, sx, body)), wc) - wc) * g
    zd = zi1 + (zt - 0.1 - zi1) * ss_((x - IXD) / 3.5) if x >= IXD else zt   # (the ducts' tops, rising aft to the deck)
    zd = zt + (min(zd, zt) - zt) * g
    lo = zb + (zi0 - zb) * max(0.0, 1 - (x - IXD) / 1.5) * g          # (the duct's bottom at the mouth, then flush)
    yin = min(wc, max(SILL_HW + 0.12, wc * 0.86))                          # (where the duct's top meets the deck's side)
    # the deck: under the canopy the top is level out to the sill (the canopy sits on it); ahead of the windscreen round
    dk = 0.0 if NODECK[0] else _dk(x)   # (the cockpit's top up to the rails from the windscreen's foot)   # (the deck from under the windscreen's back: ahead of it the skin stays round)
    ang2 = np.radians([-90, -75, -60, -32, 0, 30, 52, 72, 90]); pf = 2 / 2.6
    # (the forebody's section egg-shaped, as the type's: fullest a little above mid-height, the lower half rounder and
    # drawn in toward the nose-gear keel)
    pfl = 2 / 2.15; pe_ = np.where(ang2 < 0, pfl, pf)
    ysc = np.where(ang2 < 0, 0.80 + 0.20 * (1 + np.sin(ang2)), 1.0 - 0.24 * np.sin(np.clip(ang2, 0, None)))   # (above, the sides leaning in to the rails: the type's tumblehome)
    zw_ = np.where(ang2 == 0, -0.18 * hh, 0.0)                                         # (its fullest a little below the middle)
    fwd = np.stack([wc * ysc * np.abs(np.cos(ang2)) ** pe_, zc + zw_ + hh * np.sign(np.sin(ang2)) * np.abs(np.sin(ang2)) ** pe_], 1)
    # (the deck: the side runs up to the glass's foot, exactly where the glass leaves it, then a hidden floor under the glass)
    yb_, zs_ = (glass_base(x)[:2]) if dk > 0 else (wc * 0.97, zt)
    deck = np.array([fwd[5], [yb_, zs_], [yb_ * 0.8, zs_], [0, zs_ + 0.01]])   # (the side as the round body's, leaning in, up to the glass's foot)
    fwd[5:] = fwd[5:] * (1 - dk) + deck * dk
    # (the underside between the ducts: a channel from behind the mouths, the ducts' bottoms two long tubes into the
    # nacelles, as on the type)
    chan = 0.26 * ss_((x - IXD) / 1.5)
    yb_ = min(yi0 + 0.12, wb * 0.6)
    box = np.array([[0, zb + chan], [yb_ * 0.5, zb + chan * 0.3], [yb_, zb], [wb - 0.16, lo + 0.04], [wb, (lo + zd) / 2 + 0.05],
                    [wb - 0.14, zd], [yin, zd + 0.03], fwd[7], fwd[8]])
    fb = fwd * (1 - g) + box * g
    # aft: two nacelles, a channel between them, a flat shelf out to the booms
    tn = ss_((x - 12.2) / 2.6)                             # (the intake trunks full width under the CFTs; round nacelles from ahead of the engines' faces, ~14.5 m)
    # (each nacelle round about its engine, closing aft onto the nozzle: radius and axis from the nozzle's)
    ak = 1 - ss_((f_ - 0.8) / 0.15)
    Rn = nr_ * (1.04 + 0.06 * ak) + 0.07 * ak; zn = nzc + 0.08 * ak
    zsh = min(zn + 0.05, zt - 0.5)                          # (the shelf out to the booms, about level with the nozzles' axes)
    # (keel, the nacelle round from inboard to its outboard side, then the fuselage's side out to the booms and the top)
    af = np.array([[0, zn - 0.55 * Rn], [ny_ - 0.5 * Rn, zn - 0.87 * Rn], [ny_, zn - Rn], [ny_ + 0.74 * Rn, zn - 0.68 * Rn],
                   [ny_ + 1.03 * Rn, zn + 0.04], [wb, zt - 0.38], [wb - 0.16, zt - 0.1],   # (the shoulder at the forebody's height: no dip in the blend)
                   [min(SILL_HW, wb * 0.3), zt], [0, zt]])
    # blends: radome -> forebody over 2.4..3.4 m, forebody -> aft over the wing root
    wr = ss_((x - 0.10 * L) / 2.4)
    A = rnd * (1 - wr) + fb * wr
    A = A * (1 - tn) + af * tn
    # the engine humps: from behind the wing's root to the tail, a rounded crest over each engine (y 0.68), the valley
    # between them carrying the dorsal spine (the owner's photo from ahead and above)
    hk = ss_((x - 10.0) / 2.5)                              # (over the engines: from behind the wing's root to the tail)
    if hk > 0:
        A = A.copy(); A[7] = A[7] * (1 - hk) + np.array([0.68, zt + HUMP]) * hk; A[8, 1] -= HUMP * 2.2 * hk
        A[6, 1] -= 0.12 * hk * ss_((x - 12.0) / 1.5)         # (the shoulder a step down beside them once the sides are out: two domes, not a deck)
    # the tail end: two round cans round the nozzles with a slot between them (no flat wall over the nozzles)
    te = ss_((x - 15.6) / (X_END - 15.6))
    if te > 0:
        end = np.array([A[0], A[1], A[2], A[3], [ny_ + 1.03 * Rn, zn + 0.04], [ny_ + 0.80 * Rn, zn + 0.66 * Rn],
                        [ny_ + 0.38 * Rn, zn + 0.97 * Rn], [ny_ - 0.05, zn + Rn], [0, zn + 0.6 * Rn]])
        A = A * (1 - te) + end * te
    return A
def _dk(x): return ss_((x - (X_WS0 - 0.15)) / 0.45) * (1 - ss_((x - (X_C1 - 0.2)) / 0.8))   # (the cockpit deck's weight)
_SMW = np.array([-2, -1, 0, 1, 2]) * 0.15; _SMG = np.exp(-0.5 * (_SMW / 0.18) ** 2); _SMG /= _SMG.sum()
def section(x):
    # (each anchor smoothed along the length over ~0.4 m: the overlapping blends leave no ripple in the skin)
    ks = min(1.0, x / 0.6)                               # (less near the tip, or the clamp there blunts it)
    P = sum(w_ * anchors(min(max(x + d_ * ks, 0.02), L)) for d_, w_ in zip(_SMW, _SMG))
    k_ = 0.0 if NODECK[0] else _dk(x)
    if k_ > 0:                                           # (the deck up to the glass's foot unsmoothed: the rails stay on it)
        P = P.copy(); P[6:] = P[6:] * (1 - k_) + anchors(x)[6:] * k_
    full = np.concatenate([P, P[-2:0:-1] * [-1, 1]])     # (round the far side: spine back down to the keel)
    cnt = SEG + SEG[::-1]
    c = catmull(full, cnt)
    return np.stack([np.full(len(c), X(x)), c[:, 0], c[:, 1]], 1)
v, f = loft([section(x) for x in xs_]); fus = mesh_obj('fuselage', v, f, uv=loft.last)
# the mouths: the forward-facing faces where the duct swells out of the body, over the mouth's height, dark (the
# inside of the intake); a plane stuck there stood out of the side
mouth_mat_index = []
me = fus.data; npol = len(me.polygons)
cen = np.zeros(npol * 3); me.polygons.foreach_get('center', cen); cen = cen.reshape(-1, 3)
nrm = np.zeros(npol * 3); me.polygons.foreach_get('normal', nrm); nrm = nrm.reshape(-1, 3)
xb = L / 2 - cen[:, 0]
near = (xb > IXD - 0.05) & (xb < IXD + 0.25)            # (the ducts' fronts, inside the intakes: dark)
mouth = near & (np.abs(cen[:, 1]) > np.interp(xb, sx, core) * 0.9) & (cen[:, 2] > zi0 - 0.05) & (cen[:, 2] < zi1 - 0.06) & (np.abs(nrm[:, 0]) > 0.6)   # (the sign: the loft's faces may face in; the ramp faces forward either way)
mouth_faces = np.nonzero(mouth)[0]
print('intake mouth faces', len(mouth_faces))

# ---- the intakes, each its own part: a raked rectangular mouth (the top lip 0.35 m ahead of the bottom), a lip 5 cm
# thick, the duct's dark inside down to the compressor face's plug, standing 0.15 m off the fuselage's side (the
# boundary-layer gap), its outer skin running back over the fuselage's duct and ending in a panel joint
intake_dark = []
def rrect(y0, y1, z0, z1, r, k=6):
    """a rounded rectangle (y, z), counter-clockwise from its bottom middle, 4 * (k + 1) + 4 points"""
    pts = []
    cs = [((y1 - r, z0 + r), -90), ((y1 - r, z1 - r), 0), ((y0 + r, z1 - r), 90), ((y0 + r, z0 + r), 180)]
    for (cy, cz), a0 in cs:
        for a in np.radians(np.linspace(a0, a0 + 90, k + 1)): pts.append((cy + r * np.cos(a), cz + r * np.sin(a)))
    return np.array(pts)
RAKE, LIP = 1.0, 0.05                                      # (the type's raked intake: the top lip a metre ahead of the bottom one)
def fus_outer(x, n, start):
    """the fuselage duct's outline outboard of the intake's inner wall (y > yi0), closed along that wall, pushed 1.5 cm
    out, resampled to n points by arc length from the point nearest start, counter-clockwise like rrect"""
    h = section(x)[:sum(SEG) + 1, 1:]
    run = h[h[:, 0] > yi0]
    poly = np.concatenate([run, [[yi0, run[-1, 1]], [yi0, run[0, 1]]]])
    c = poly.mean(0); dv = poly - c; poly = poly + 0.015 * dv / np.linalg.norm(dv, axis=1)[:, None]
    i0 = int(np.argmin(np.linalg.norm(poly - start, axis=1))); poly = np.roll(poly, -i0, 0)
    closed = np.concatenate([poly, poly[:1]]); d = np.r_[0, np.cumsum(np.linalg.norm(np.diff(closed, axis=0), axis=1))]
    q = np.linspace(0, d[-1], n, endpoint=False)
    return np.stack([np.interp(q, d, closed[:, 0]), np.interp(q, d, closed[:, 1])], 1)
for sg, name in ((1, 'intake_l'), (-1, 'intake_r')):
    yo_ = float(np.interp(IXD + 0.6, sx, body)) + 0.015
    out = rrect(yi0, yo_, zi0, zi1, 0.14); inn = rrect(yi0 + LIP, yo_ - LIP, zi0 + LIP, zi1 - LIP, 0.10)
    rk = lambda z: -RAKE * (z - zi0) / (zi1 - zi0)                   # (the rake: the top forward)
    def ring(P, x0, t_rake):
        return np.stack([X(x0 + rk(P[:, 1]) * t_rake), sg * P[:, 0], P[:, 1]], 1)
    x_join = IXD + 1.6; x_full = IXD + 0.8
    # (the outer skin morphs from the mouth's rounded rectangle to the fuselage duct's own outline, 1.5 cm proud, by the
    # time the duct is full: its back edge then ends flush, a panel joint)
    def oring(x):
        w = ss_((x - ix0) / (x_full - ix0)) ** 0.6; P = out * (1 - w) + fus_outer(max(x, x_full), len(out), out[0]) * w   # (quick: the body's square deck corner stays inside it)
        return np.stack([X(x + rk(P[:, 1]) * max(0.0, 1 - (x - ix0) / (x_full - ix0))), sg * P[:, 0], P[:, 1]], 1)
    outer_rings = [oring(x) for x in np.linspace(ix0, x_join, 9)]
    inner_rings = [ring(inn, x, 1 - (x - ix0) / (x_full - ix0)) for x in np.linspace(ix0, IXD - 0.02, 4)]
    # one loop list: the outer skin from the joint forward to the lip, round the lip, the inner wall back to the plug
    rings = outer_rings[::-1] + inner_rings
    v, f = loft(rings, cap0=False, cap1=True); uvc, info = loft.last
    if sg < 0: f = [q[::-1] for q in f]; uvc = [c[::-1] for c in uvc]
    ob = mesh_obj(name, v, f, subsurf=1, uv=(uvc, info))
    n = len(out); n_out = len(outer_rings)
    # (the inside dark: the faces from the lip's inner edge back, and the plug)
    me = ob.data; mi = [0] * len(me.polygons)
    for i, poly in enumerate(me.polygons):
        if min(poly.vertices) >= n_out * n: mi[i] = 1
    intake_dark.append((ob, mi))

# ---- canopy: a raked windscreen (a flat front panel between two side panels, framed), the main canopy over both
# seats (one long bubble, a bow between the seats, rails along its sides), clear tinted glass; under it the cockpit:
# its tub, two ejection seats, two crew, the instrument coamings
from scipy.ndimage import gaussian_filter1d as g1, median_filter
ci = ~np.isnan(csill); cx = sx[ci]; cs = csill[ci]; ct = g1(ctop[ci], 1.0, mode='nearest')   # (the spec's lines are smooth already: no more smoothing, or the windscreen's foot lifts)
x_ws0, x_ws1 = float(cx[0]), float(cx[0]) + 0.9             # the windscreen: from the canopy's front, 0.9 m long, the bubble behind its arch
x_c1 = float(cx[-1])                                         # the canopy's end
sill_at = lambda x: float(np.interp(x, cx, cs)); top_at = lambda x: float(np.interp(x, cx, ct))
w_sill = lambda x: SILL_HW
frames, glass_objs, inner = [], [], []
def skin_top(x):
    """the fuselage's upper skin at x as (y, z) from the spine out to its widest point (y rising: safe to interpolate)"""
    h = section(x)[:sum(SEG) + 1, 1:]; up = h[AN_[4]:][::-1]
    up = up[:int(np.argmax(up[:, 0])) + 1]
    return up[np.concatenate([[True], np.diff(up[:, 0]) > 0])]
def skin_z(x, y):
    """the fuselage's upper skin height at (x, y): the windscreen and rails sit on it"""
    up = skin_top(x); return float(np.interp(abs(y), up[:, 0], up[:, 1]))
def glass_ring(x, zt=None, k=13):
    """the glass's section, derived from the body's: it leaves the body's side at the rails with the body's own slope (a
    cubic carrying that tangent on) and arches over level at the top; point 0 on the +y foot, round to the -y foot"""
    yb, zs, T = glass_base(x)
    zt = max(top_at(x) if zt is None else zt, zs + 0.03)
    P0, P3 = np.array([yb, zs]), np.array([0.0, zt])
    a = 0.55 * (zt - zs) / max(T[1], 0.25); P1 = P0 + T * a; P2 = P3 + np.array([0.92 * yb, 0.0])   # (a round top)
    t = np.linspace(0, 1, k)[:, None]
    B = (1 - t) ** 3 * P0 + 3 * (1 - t) ** 2 * t * P1 + 3 * (1 - t) * t ** 2 * P2 + t ** 3 * P3
    full = np.concatenate([B, B[-2::-1] * [-1, 1]])
    return np.stack([np.full(len(full), X(x)), full[:, 0], full[:, 1]], 1)
def ring_ws(x):
    """the windscreen: one curved piece of the same derived glass (the type's is one piece), up to the canopy's line"""
    r = glass_ring(x, max(skin_z(x, 0.0) + 0.005, top_at(x)))
    w = ss_((x - x_ws0) / 0.3)                                   # (its front edge on the nose's skin: no slot under the arch)
    if w < 1:
        up = skin_top(x); sk = np.interp(np.abs(r[:, 1]), up[:, 0], up[:, 1]) + 0.005
        r = r.copy(); r[:, 2] = sk + (r[:, 2] - sk) * w
    return r
def ring_can(x, k=13):
    return glass_ring(x, None, k)
def shell(name, rings, close_front=False):
    n = len(rings[0]); verts = np.concatenate(rings); faces = []
    for i in range(len(rings) - 1):
        for j in range(n - 1):
            q = i * n + j; faces.append([q, q + 1, q + 1 + n, q + n])
    ob = mesh_obj(name, verts, faces, subsurf=1)
    sol = ob.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.015; sol.offset = -1.0   # (inward: the outer face on the ring, under the frames)
    return ob
glass_objs.append(shell('windscreen', [ring_ws(x) for x in np.linspace(x_ws0, x_ws1, 8)]))
# (the main canopy: rounded down at its end into the spine)
xc = np.linspace(x_ws1, x_c1, 28)
glass_objs.append(shell('canopy', [ring_can(x) for x in xc]))
# frames: the windscreen's two side bars and its arch, the canopy's front arch, the bow between the seats, the rails
def tube(name, pts, r=0.035):
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 3
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for i, p in enumerate(pts): sp.points[i].co = (p[0], p[1], p[2], 1)
    ob = bpy.data.objects.new(name, cu); col.objects.link(ob); frames.append(ob); return ob
x_bow = x_ws1 + (x_c1 - x_ws1) * 0.47
# the frames: flat bands hugging the glass, as the type's (not round tubes): the windscreen's arch 10 cm wide, the bow
# between the seats 7 cm, the canopy's back 6 cm, and a band 8 cm deep along the glass's foot on each side
def _outward(r):
    """each point's outward normal in its section's plane (away from the section's middle)"""
    d = np.gradient(r[:, 1:], axis=0); n = np.stack([np.zeros(len(r)), d[:, 1], -d[:, 0]], 1)
    n /= np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
    c = np.array([r[0, 0], 0.0, r[:, 2].mean()]); flip = np.sum((r - c) * n, axis=1) < 0; n[flip] *= -1
    return n
def arch_band(name, r, width, t_out=0.026, t_in=0.03):
    n = _outward(r); e = np.array([1.0, 0, 0]) * width / 2
    rings = [np.array([p + q * t_out + e, p + q * t_out - e, p - q * t_in - e, p - q * t_in + e]) for p, q in zip(r, n)]
    v, f = loft(rings, cap0=True, cap1=True); ob = mesh_obj(name, v, f, smooth=False, subsurf=0); ob['mat'] = 'frame'; return ob
def edge_band(name, ringfn, xs, side, h=0.08, t_out=0.026, t_in=0.03):
    rings = []
    for x in xs:
        r = ringfn(x); j, j2 = (0, 2) if side > 0 else (-1, -3)
        b = r[j]; u = r[j2] - b; u /= np.linalg.norm(u); q = _outward(r)[j]
        rings.append(np.array([b + q * t_out, b + q * t_out + u * h, b - q * t_in + u * h, b - q * t_in]))
    v, f = loft(rings, cap0=True, cap1=True); ob = mesh_obj(name, v, f, smooth=False, subsurf=0); ob['mat'] = 'frame'; return ob
arch_band('ws_arch', ring_ws(x_ws1), 0.10)
arch_band('canopy_bow', ring_can(x_bow), 0.07)
for sd, nm in ((1, 'l'), (-1, 'r')):
    edge_band(f'ws_frame_{nm}', ring_ws, np.linspace(x_ws0 + 0.02, x_ws1, 8), sd)
    edge_band(f'canopy_frame_{nm}', ring_can, np.linspace(x_ws1, x_c1, 18), sd)
# the dorsal fairing, as the type's: it starts a metre ahead of the glass's tail and rises over it, so the body takes
# the glass's tail in a round arc (where the two surfaces cross), then slopes down 3.2 m into the spine between the
# engine humps; a rounded hump, its feet buried in the body
xd0, x_d1 = x_c1 - 1.0, 0.80 * L                               # (the type's dorsal spine: from over the glass's tail back between the engines)
zd_peak = top_at(x_c1 - 0.35) + 0.07                           # (just over the glass where it covers it)
_xq = np.linspace(x_c1 - 1.0, x_c1, 201)                        # (where the falling glass crown passes under the dorsal's level)
x_cross = float(_xq[np.argmax([top_at(q) - 0.03 < zd_peak for q in _xq])])
def ring_dorsal(x, k=25):
    """a broad smooth dome laid on the body's own top (the skin plus a cosine bell, so its feet run tangent into the
    skin), as wide as the canopy behind it and narrowing aft into the valley between the engine humps"""
    tf = ss_((x - xd0) / 0.75)
    zsp = float(np.interp(x, sx, spine))
    z_ridge = zsp + 0.14 - 0.19 * ss_((x - 10.0) / 3.0)      # (aft: down between the humps' crests, the type's low centre fairing)
    # (its crown: just under the glass's crown while the glass is higher, then level on behind it, so the glass's tail
    # dives under it at the glass's own gentle slope; no steep front climbing through the glass)
    za = zd_peak + (z_ridge - zd_peak) * ss_((x - (x_c1 - 0.2)) / 3.0)
    zg = max(top_at(min(x, x_c1)) - 0.03, za) if x < x_cross else za
    w_ = ss_((x - (x_cross - 0.25)) / 0.5)
    zt = zg * (1 - w_) + za * w_
    up = skin_top(x); skin = lambda y: np.interp(np.abs(y), up[:, 0], up[:, 1])   # (the body's top, from the spine outward)
    dz = max(zt - float(skin(0.0)), 0.0) * tf * (1 - ss_((x - (x_d1 - 2.2)) / 2.2))   # (its height over the skin, to 0 at its end)
    wf = (0.75 + 0.25 * tf) * (1.05 - 0.40 * ss_((x - x_c1) / (x_d1 - x_c1)))
    wf = min(wf, 0.55 + 0.45 * (1 - ss_((x - 9.0) / 1.5)) - 0.15 * ss_((x - 11.0) / (x_d1 - 11.0)))   # (aft: inside the hump crests, its feet in the valley, narrowing to its end)
    y_ = np.linspace(-wf, wf, k)[::-1]; bell = (0.5 + 0.5 * np.cos(np.pi * y_ / wf)) ** 1.6
    return np.stack([np.full(k, X(x)), y_, skin(y_) + dz * bell - 0.003 - 0.02 * (1 - bell)], 1)
def ring_dorsal_c(x):
    """the dorsal's ring closed 5 cm under the skin (its lid hidden in the body, not a flat deck over the valley)"""
    r = ring_dorsal(x); up = skin_top(x); b = r[-2:0:-1].copy()
    b[:, 2] = np.interp(np.abs(b[:, 1]), up[:, 0], up[:, 1]) - 0.05
    return np.concatenate([r, b])
v, f = loft([ring_dorsal_c(x) for x in np.linspace(xd0, x_d1, 40)], cap0=True, cap1=True)
mesh_obj('dorsal', v, f, subsurf=2, uv=loft.last)
# the cockpit under the glass: a dark tub, the seats, the crew, the coamings
def box(name, c, size, mat='dark'):
    bpy.ops.mesh.primitive_cube_add(size=1); ob = bpy.context.active_object; ob.name = name
    ob.scale = size; ob.location = c; bpy.context.collection.objects.unlink(ob); col.objects.link(ob)
    bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = min(size) * 0.25; bv.segments = 3
    inner.append((ob, mat)); return ob
def ball(name, c, r, mat):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, segments=24, ring_count=12); ob = bpy.context.active_object; ob.name = name
    ob.location = c; bpy.context.collection.objects.unlink(ob); col.objects.link(ob); ob.data.polygons.foreach_set('use_smooth', [True] * len(ob.data.polygons))
    inner.append((ob, mat)); return ob
zs_mid = sill_at((x_ws1 + x_c1) / 2)
_t0 = x_ws0 + 0.75                                           # (the tub from under the windscreen's back: ahead of that the nose is lower than the sill)
box('tub', (X((_t0 + x_c1) / 2), 0, zs_mid - 0.34), ((x_c1 - _t0) * 0.97, w_sill((_t0 + x_c1) / 2) * 1.8, 0.62))
for k, xs_seat in enumerate([x_ws1 + 0.75, x_bow + 0.75]):
    z0 = sill_at(xs_seat) - 0.5                                                              # (the seat pan half a metre under the sill)
    box(f'seat{k}', (X(xs_seat + 0.25), 0, z0 + 0.55), (0.35, 0.62, 1.0))                     # (its back and headrest)
    xc_ = xs_seat - 0.65; box(f'coaming{k}', (X(xc_), 0, min(sill_at(xc_) + 0.05, top_at(xc_) - 0.3)), (0.35, w_sill(xs_seat) * 1.2, 0.16))   # (under the glass)
    ball(f'helmet{k}', (X(xs_seat - 0.05), 0, sill_at(xs_seat) + 0.42), 0.15, 'helmet')
    box(f'crew{k}', (X(xs_seat - 0.05), 0, sill_at(xs_seat) + 0.02), (0.32, 0.5, 0.5), 'flight_suit')

# ---- an airfoil loft through planform stations
def airfoil(nc=28, t=0.05):
    # NACA 00xx, closed loop from the trailing edge over the top and back under (x 0..1)
    b = 0.5 * (1 - np.cos(np.linspace(0, np.pi, nc)))
    yt = 5 * t * (0.2969 * np.sqrt(b) - 0.1260 * b - 0.3516 * b ** 2 + 0.2843 * b ** 3 - 0.1036 * b ** 4)
    up = np.stack([b[::-1], yt[::-1]], 1); lo = np.stack([b[1:-1], -yt[1:-1]], 1)
    return np.concatenate([up, lo])
def yt_naca(x, t):
    return 5 * t * (0.2969 * np.sqrt(x) - 0.1260 * x - 0.3516 * x ** 2 + 0.2843 * x ** 3 - 0.1036 * x ** 4)
def airfoil_part(c0, c1, t, nu=15):
    """the part of a NACA 00xx between chord fractions c0..c1: a closed loop of 2 * nu points, from c1 over the top to
    c0 and back under to c1 (point 0 at c1: the trailing edge when c1 is 1)"""
    b = 0.5 * (1 - np.cos(np.linspace(0, np.pi, nu))); x = c0 + (c1 - c0) * b
    up = np.stack([x[::-1], yt_naca(x[::-1], t)], 1); lo = np.stack([x, -yt_naca(x, t)], 1)
    return np.concatenate([up, lo[1:] if c0 == 0 else lo])   # (a full leading edge: one point there, not two)
def surface(name, stations, place, t_root, t_tip, n_sec=10, subsurf=2, chord=None, breaks=()):
    """stations: (s, le, te) along the span; place(s, chord_x, thick) -> 3D points. chord(s) -> (c0, c1): the part of
    the chord this piece covers there (a control surface, or the fixed part ahead of one); breaks: spans where that
    jumps (a section just either side, so the step stays sharp)"""
    s_ = np.array([q[0] for q in stations]); le = np.array([q[1] for q in stations]); te = np.array([q[2] for q in stations])
    te = np.maximum(te, le + 0.15)
    chord = chord or (lambda s: (0.0, 1.0))
    # (sections at even spans and at every station, so a dogtooth or a clipped tip keeps its corner)
    ss = np.concatenate([np.linspace(s_[0], s_[-1], n_sec), s_] + [[b_ - 0.004, b_ + 0.004] for b_ in breaks])
    ss = np.unique(np.round(ss, 4))
    lim = getattr(chord, 'span', None)
    if lim: ss = np.unique(np.concatenate([ss[(ss > lim[0]) & (ss < lim[1])], lim]))
    rings = []
    for k, s in enumerate(ss):
        c0, c1 = chord(s)
        a = airfoil_part(c0, c1, t_root + (t_tip - t_root) * (s - s_[0]) / (s_[-1] - s_[0]))
        l, tr = float(np.interp(s, s_, le)), float(np.interp(s, s_, te)); c = tr - l
        rings.append(place(s, l + a[:, 0] * c, a[:, 1] * c))
    v, f = loft(rings, cap0=True, cap1=True)
    ob = mesh_obj(name, v, f, subsurf=subsurf, uv=loft.last)
    # (the trailing edge, and a cut chord's ends, creased: subdivision keeps them sharp)
    n = len(rings[0]); me = ob.data; nu = (n + 1) // 2
    cut_le = chord(ss[0])[0] > 0
    cr_pairs = {(k * n + j, (k + 1) * n + j) for k in range(len(rings) - 1) for j in ((0, nu - 1, nu, n - 1) if cut_le else (0, n - 1))}
    ev = np.zeros(len(me.edges) * 2, int); me.edges.foreach_get('vertices', ev); ev = ev.reshape(-1, 2)
    cr = me.attributes.new('crease_edge', 'FLOAT', 'EDGE')
    cr.data.foreach_set('value', [1.0 if (min(a, b), max(a, b)) in cr_pairs else 0.0 for a, b in ev])
    ob['span_le_te'] = [float(ss[0]), float(ss[-1])]
    return ob
def on_hinge(ob, p0, p1, up=(0, 0, 1)):
    """move the object's origin onto a hinge line p0 -> p1 (its local X along the line, Z as near up as it goes), the
    mesh staying where it is: rotating the object about its local X then swings it about the hinge"""
    from mathutils import Matrix
    xa = (Vector(p1) - Vector(p0)).normalized(); za = Vector(up); za = (za - xa * za.dot(xa)).normalized(); ya = za.cross(xa)
    T = Matrix.Translation(Vector(p0)) @ Matrix((xa, ya, za)).transposed().to_4x4()
    ob.data.transform(T.inverted()); ob.matrix_world = T
    ob['hinge'] = [list(map(float, p0)), list(map(float, p1))]
    return ob
class Part:
    """chord(s) for a piece: (c0, c1) inside its span, with the span's limits"""
    def __init__(self, fn, span=None): self.fn, self.span = fn, span
    def __call__(self, s): return self.fn(s)

wz = M['wing']['z']; ws = [q for q in M['wing']['stations_y_le_te']]
# (the wing's root inside the fuselage, its last station a little short of the tip's rounding)
ws = [[max(ws[0][0] - 0.5, 1.0), ws[0][1] + 0.6, ws[0][2]]] + ws[1:]
# the moving surfaces as on the type: a plain flap inboard, an aileron outboard, both the aft quarter of the chord,
# hinged on the 75% line; the fixed wing ahead of them full chord elsewhere
HINGE = 0.75; GAP = 0.0                                     # (no slot: a seam, the surfaces' noses inside the cut)
FLAP = (2.25, 4.05); AIL = (4.15, 5.75)
in_any = lambda s: FLAP[0] <= s <= FLAP[1] or AIL[0] <= s <= AIL[1]
moving = {}
an = math.radians(M['wing'].get('anhedral_deg', 0.0))
for sgn, side in ((1, 'l'), (-1, 'r')):
    place = lambda s, cxs, th, sgn=sgn: np.stack([X(cxs), np.full(len(cxs), sgn * s), wz + th + (s - 2.2) * math.tan(an)], 1)
    surface(f'wing_{side}', ws, place, 0.055, 0.035, chord=Part(lambda s: (0.0, HINGE if in_any(s) else 1.0)), breaks=FLAP + AIL)
    for nm, sp in (('flap', FLAP), ('aileron', AIL)):
        ob = surface(f'{nm}_{side}', ws, place, 0.055 * 0.92, 0.035 * 0.92, n_sec=6, chord=Part(lambda s: (HINGE - 0.01, 1.0), span=(sp[0] + 0.02, sp[1] - 0.02)))
        # (the hinge: along the 75% chord line at mid-thickness, from the inboard end out)
        def hp(s_):
            l, t_ = float(np.interp(s_, [q[0] for q in ws], [q[1] for q in ws])), float(np.interp(s_, [q[0] for q in ws], [q[2] for q in ws]))
            return (X(l + HINGE * (t_ - l)), sgn * s_, wz + (s_ - 2.2) * math.tan(an))
        a_, b_ = (hp(sp[0]), hp(sp[1])) if sgn > 0 else (hp(sp[1]), hp(sp[0]))   # (the axis toward +Y both sides: one sense)
        on_hinge(ob, a_, b_); moving[ob.name] = ob
tz = M['tailplane']['z']; ts = M['tailplane']['stations_y_le_te']
for sgn, name in ((1, 'stab_l'), (-1, 'stab_r')):
    ob = surface(name, ts, lambda s, cxs, th, sgn=sgn: np.stack([X(cxs), np.full(len(cxs), sgn * s), tz + th], 1), 0.045, 0.03)
    xp = ts[0][1] + 0.4 * (ts[0][2] - ts[0][1])                  # (the pivot: 40% of the root chord, through the boom)
    on_hinge(ob, (X(xp), sgn * 1.68, tz), (X(xp), sgn * 1.68 + 1.0, tz)); moving[name] = ob
fr = M['fin']; fy, cant = fr['root_y'], math.radians(fr['cant_deg']); fz0 = fr['stations_z_le_te'][0][0]
fs = [[fz0 - 0.5, fr['stations_z_le_te'][0][1] - 0.3, fr['stations_z_le_te'][0][2]]] + fr['stations_z_le_te'][1:]
RUD = (fz0 + 0.45, H - 0.55); RHINGE = 0.70                      # (the rudder: the aft 30% over the fin's middle)
for sgn, side in ((1, 'l'), (-1, 'r')):
    place = lambda s, cxs, th, sgn=sgn: np.stack([X(cxs), sgn * (fy + (s - fz0) * math.tan(cant)) + th * math.cos(cant), np.full(len(cxs), s)], 1)
    surface(f'fin_{side}', fs, place, 0.08, 0.03, chord=Part(lambda s: (0.0, RHINGE if RUD[0] <= s <= RUD[1] else 1.0)), breaks=RUD)
    ob = surface(f'rudder_{side}', fs, place, 0.08 * 0.92, 0.03 * 0.92, n_sec=6, chord=Part(lambda s: (RHINGE - 0.01, 1.0), span=(RUD[0] + 0.02, RUD[1] - 0.02)))
    def rp(z_):
        l, t_ = float(np.interp(z_, [q[0] for q in fs], [q[1] for q in fs])), float(np.interp(z_, [q[0] for q in fs], [q[2] for q in fs]))
        return (X(l + RHINGE * (t_ - l)), sgn * fy, z_)
    on_hinge(ob, rp(RUD[0]), rp(RUD[1]), up=(-1, 0, 0)); moving[ob.name] = ob

# the fins' squared tip caps (the type's antenna fairings)
def clay_box(name, c, size, bevel=0.03):
    bpy.ops.mesh.primitive_cube_add(size=1); ob = bpy.context.active_object; ob.name = name; ob.data.name = name
    ob.scale = size; ob.location = c; bpy.context.collection.objects.unlink(ob); col.objects.link(ob)
    bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = bevel; bv.segments = 3
    ob.data.polygons.foreach_set('use_smooth', [True] * len(ob.data.polygons)); return ob
ftip = fr['stations_z_le_te'][-1]
for sgn, name in ((1, 'fin_cap_l'), (-1, 'fin_cap_r')):
    clay_box(name, (X((ftip[1] + ftip[2]) / 2 + 0.12), sgn * fy, ftip[0] + 0.02), (ftip[2] - ftip[1] + 0.22, 0.12, 0.16), 0.04)
# the tail booms: outboard of the engines, under the fins, carrying the tailplanes' pivots, ending in a point at the
# nozzles' exits
for sgn, name in ((1, 'boom_l'), (-1, 'boom_r')):
    a_ = np.linspace(0, 2 * np.pi, 24, endpoint=False); yb, zb_ = sgn * 1.68, tz + 0.02
    def bring(x, k): return np.stack([np.full(24, X(x)), yb + 0.2 * k * np.cos(a_), zb_ + 0.3 * k * np.sin(a_)], 1)
    xb_ = np.linspace(14.4, L - 0.05, 16); kk = np.clip((L - 0.05 - xb_) / 1.3, 0.08, 1.0) ** 0.6 * (0.25 + 0.75 * np.array([ss_((x - 14.4) / 1.2) for x in xb_]))
    v, f = loft([bring(x, k) for x, k in zip(xb_, kk)], cap0=True, cap1=True); mesh_obj(name, v, f, subsurf=2, uv=loft.last)
# the conformal fuel tanks (the strike version's): along the ducts' outer sides under the wing, from behind the intakes
# to the nacelles, a rounded box 0.45 m proud, its ends faired
def wing_low(x, y):
    """the wing's lower skin height at (x, |y|) (its loft's own formula; clamped to the chord)"""
    s0, s1 = ws[0][0], ws[-1][0]; s = min(max(abs(y), s0), s1)
    l = float(np.interp(s, [q[0] for q in ws], [q[1] for q in ws])); t = max(float(np.interp(s, [q[0] for q in ws], [q[2] for q in ws])), l + 0.15)
    th = 0.055 + (0.035 - 0.055) * (s - s0) / (s1 - s0); c = min(max((x - l) / (t - l), 0.0), 1.0)
    return wz - yt_naca(c, th) * (t - l) + (s - 2.2) * math.tan(an)
def side_y(h, z):
    """the body's outermost half width at height z, from a half section h (keel -> spine)"""
    ys = [y0 + (y1 - y0) * (z - z0) / (z1 - z0) for (y0, z0), (y1, z1) in zip(h[:-1], h[1:]) if (z0 - z) * (z1 - z) <= 0 and z1 != z0]
    return max(ys) if ys else 0.0
def cft_ring(x, sg):
    y0 = float(np.interp(x, sx, body)) - 0.1
    k = min(ss_((x - CFT0) / 1.2), 1 - ss_((x - (CFT1 - 1.6)) / 1.6)) * 0.85 + 0.15
    yc, zc_ = y0 + 0.24, 0.94; hw_, hh_ = 0.24 * (0.4 + 0.6 * k), 0.60 * (0.5 + 0.5 * k)
    zt_ = zc_ + hh_ + max(0.0, wing_low(x, yc) + 0.03 - (zc_ + 0.60)) * k; zb_ = zc_ - hh_; zc_, hh_ = (zt_ + zb_) / 2, (zt_ - zb_) / 2   # (its top up into the wing's underside)
    a_ = np.linspace(0, 2 * np.pi, 28, endpoint=False); pe = 2 / 3.2
    yy = yc + hw_ * np.sign(np.cos(a_)) * np.abs(np.cos(a_)) ** pe; zz = zc_ + hh_ * np.sign(np.sin(a_)) * np.abs(np.sin(a_)) ** pe
    h = section(x)[:sum(SEG) + 1, 1:]
    yy = np.array([min(y_, side_y(h, z_) - 0.04) if np.cos(a) < 0 else y_ for y_, z_, a in zip(yy, zz, a_)])   # (its inner face on the body's side)
    return np.stack([np.full(28, X(x)), sg * yy, zz], 1)
CFT0, CFT1 = IXD + 1.6, 0.71 * L
for sg, name in ((1, 'cft_l'), (-1, 'cft_r')):
    v, f = loft([cft_ring(x, sg) for x in np.linspace(CFT0, CFT1, 22)], cap0=True, cap1=True); mesh_obj(name, v, f, subsurf=2, uv=loft.last)

# ---- nozzles: cans with a dark recess
for q, name in zip(M['nozzles'], ('nozzle_l', 'nozzle_r')):
    a = np.linspace(0, 2 * np.pi, 32, endpoint=False); r = q['r']
    ring = lambda x, rr: np.stack([np.full(32, X(x)), q['y'] + rr * np.cos(a), q['z'] + rr * np.sin(a)], 1)
    v, f = loft([ring(L - 2.2, r * 1.02), ring(L - 0.6, r), ring(L - 0.05, r * 0.92), ring(L - 0.05, r * 0.82), ring(L - 0.6, r * 0.78)], cap0=False, cap1=True)
    mesh_obj(name, v, f, subsurf=1)

# ---- stage 2: the landing gear (the type's layout: the nose leg under the front cockpit, the mains under the ducts,
# 5.4 m wheelbase, 2.75 m track, the jet 0.68 m higher on its wheels), the gear bays, the pylons and named hardpoints,
# the canopy's hinge, the root of the hierarchy and the metadata for the game
G_Z = -(5.63 - H)                                           # (the ground under the wheels, gear down: 1.2 m under the belly, as on the type)
def belly_at(x, y):
    """the fuselage's lowest skin at (x, y): the lower half of the section there"""
    h = section(x)[:sum(SEG) + 1, 1:]; lo_ = h[h[:, 1] < (h[:, 1].max() + h[:, 1].min()) / 2]
    lo_ = lo_[np.argsort(lo_[:, 0])]; return float(np.interp(abs(y), lo_[:, 0], lo_[:, 1]))
def cyl(name, p0, p1, r, mat='strut', verts=20):
    p0, p1 = Vector(p0), Vector(p1); d = p1 - p0
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=d.length); ob = bpy.context.active_object
    ob.name = name; ob.data.name = name; ob.location = (p0 + p1) / 2; ob.rotation_euler = d.to_track_quat('Z', 'Y').to_euler()
    bpy.context.collection.objects.unlink(ob); col.objects.link(ob); ob['mat'] = mat
    ob.data.polygons.foreach_set('use_smooth', [True] * len(ob.data.polygons)); return ob
def wheel(name, c, r, w):
    bpy.ops.mesh.primitive_torus_add(major_radius=r - w * 0.42, minor_radius=w * 0.5, major_segments=40, minor_segments=14)
    t_ = bpy.context.active_object; t_.name = name; t_.data.name = name; t_.location = c; t_.rotation_euler = (math.pi / 2, 0, 0)
    t_.scale = (1, 1, 0.92); bpy.context.collection.objects.unlink(t_); col.objects.link(t_); t_['mat'] = 'tire'
    t_.data.polygons.foreach_set('use_smooth', [True] * len(t_.data.polygons))
    hub = cyl(name + '_hub', (c[0], c[1] - w * 0.3, c[2]), (c[0], c[1] + w * 0.3, c[2]), r - w * 0.75, 'strut', 24)
    return t_, hub
def plate(name, c, size, mat='clay'):
    ob = clay_box(name, c, size, 0.01); ob['mat'] = mat; return ob
def group(name, loc, axis_to, members, props):
    """an empty on a hinge (at loc, its local X toward axis_to) carrying members: rotating it about X swings them"""
    from mathutils import Matrix
    e = bpy.data.objects.new(name, None); e.empty_display_size = 0.3; col.objects.link(e)
    xa = (Vector(axis_to) - Vector(loc)).normalized(); za = Vector((0, 0, 1)); za = (za - xa * za.dot(xa)).normalized()
    if za.length < 1e-6: za = Vector((1, 0, 0))
    ya = za.cross(xa); e.matrix_world = Matrix.Translation(Vector(loc)) @ Matrix((xa, ya, za)).transposed().to_4x4()
    for m in members: m.parent = e; m.matrix_parent_inverse = e.matrix_world.inverted()
    for k, v in props.items(): e[k] = v
    e['hinge'] = [list(map(float, loc)), list(map(float, axis_to))]
    return e
gear = {}
sliders = {}
STROKE = 0.3                                                # (the oleos' stroke: on the ground compressed, in the air out by this)
def slider(name, loc, members):
    """an empty at loc carrying the leg's sliding part (the oleo, the links, the wheel): it moves down by STROKE in the air"""
    e = bpy.data.objects.new(name, None); e.empty_display_size = 0.2; e.location = loc; col.objects.link(e)
    bpy.context.view_layer.update()
    for m in members: m.parent = e; m.matrix_parent_inverse = e.matrix_world.inverted()
    e['kind'] = 'oleo'; e['stroke_m'] = STROKE; sliders[name] = e; return e
# the main legs: from the duct's underside straight down to the axle, a trailing link to the wheel, the outer door on
# the leg, a bay door hinged at the fuselage's side; they fold forward into the bay (90 deg about a lateral axis)
XM, YM, XNG = 10.35, 1.37, 4.95
for sg, side in ((1, 'l'), (-1, 'r')):
    zt_ = belly_at(XM, YM); rw, ww = 0.44, 0.26
    ax = (X(XM + 0.25), sg * (YM + 0.12), G_Z + rw)
    sl = [cyl(f'main_oleo_{side}', (X(XM), sg * YM, G_Z + rw + 0.75), (X(XM), sg * YM, G_Z + rw + 0.2), 0.125),
          cyl(f'main_torque_{side}', (X(XM - 0.02), sg * YM, G_Z + rw + 0.62), (X(XM - 0.2), sg * YM, G_Z + rw + 0.4), 0.03),
          cyl(f'main_link_{side}', (X(XM), sg * YM, G_Z + rw + 0.22), ax, 0.075),
          cyl(f'main_axle_{side}', ax, (ax[0], sg * (YM + 0.12 + 0.02), ax[2]), 0.05)]
    sl += list(wheel(f'main_wheel_{side}', (ax[0], sg * (YM + 0.12), ax[2]), rw, ww))
    parts = [cyl(f'main_strut_{side}', (X(XM), sg * YM, zt_ + 0.05), (X(XM), sg * YM, G_Z + rw + 0.45), 0.10),
             cyl(f'main_brace_{side}', (X(XM + 0.95), sg * YM, zt_ + 0.03), (X(XM), sg * YM, (zt_ + G_Z + rw) / 2 + 0.15), 0.055),   # (the drag brace, forward to the fuselage)
             slider(f'oleo_main_{side}', (X(XM), sg * YM, G_Z + rw + 0.45), sl)]
    # (the door on the leg: its upper half, the leg showing below as on the type)
    parts.append(plate(f'main_leg_door_{side}', (X(XM - 0.1), sg * (YM - 0.16), zt_ - (zt_ - G_Z - rw) * 0.24), (1.05, 0.025, (zt_ - G_Z - rw) * 0.44)))
    gear[f'main_{side}'] = group(f'gear_main_{side}', (X(XM), sg * YM, zt_ + 0.05), (X(XM), sg * (YM + 1), zt_ + 0.05), parts,
                                 {'kind': 'gear', 'retract_deg': -90.0, 'note': 'positive about local X folds the leg aft; the type folds forward: -90'})
    bay = plate(f'bay_main_{side}', (X(XM - 0.55), sg * YM, zt_ - 0.012), (1.6, 0.62, 0.03), 'bay')
    door = plate(f'door_main_{side}', (X(XM - 0.55), sg * (YM + 0.33), zt_ - 0.32), (1.6, 0.02, 0.62))
    gear[f'door_main_{side}'] = group(f'door_main_hinge_{side}', (X(XM + 0.25), sg * (YM + 0.33), zt_), (X(XM - 1.35), sg * (YM + 0.33), zt_), [door],
                                      {'kind': 'door', 'open_deg': 0.0, 'closed_deg': 90.0 * sg})
# the nose leg: under the front cockpit, folding forward, two doors
zn_ = belly_at(XNG, 0.0); rn_, wn_ = 0.28, 0.18
nax = (X(XNG - 0.12), 0.0, G_Z + rn_)
sl = [cyl('nose_oleo', (X(XNG - 0.05), 0, G_Z + rn_ + 0.7), (X(XNG - 0.1), 0, G_Z + rn_ + 0.05), 0.1),
      cyl('nose_fork', (X(XNG - 0.1), 0, G_Z + rn_ + 0.12), nax, 0.05)] + list(wheel('nose_wheel', nax, rn_, wn_))
parts = [cyl('nose_strut', (X(XNG), 0, zn_ + 0.05), (X(XNG - 0.05), 0, G_Z + rn_ + 0.5), 0.085),
         cyl('nose_brace', (X(XNG + 0.75), 0, zn_ + 0.02), (X(XNG - 0.02), 0, (zn_ + G_Z + rn_) / 2 + 0.1), 0.045),
         cyl('taxi_light', (X(XNG - 0.02), 0.0, G_Z + rn_ + 0.85), (X(XNG - 0.2), 0.0, G_Z + rn_ + 0.85), 0.05, 'lamp'),
         slider('oleo_nose', (X(XNG - 0.05), 0, G_Z + rn_ + 0.5), sl)]
gear['nose'] = group('gear_nose', (X(XNG), 0, zn_ + 0.05), (X(XNG), 1, zn_ + 0.05), parts, {'kind': 'gear', 'retract_deg': 90.0})
plate('bay_nose', (X(XNG - 0.55), 0, zn_ - 0.012), (1.4, 0.4, 0.03), 'bay')
for sg, side in ((1, 'l'), (-1, 'r')):
    d_ = plate(f'door_nose_{side}', (X(XNG - 0.55), sg * 0.2, zn_ - 0.25), (1.4, 0.02, 0.48))
    gear[f'door_nose_{side}'] = group(f'door_nose_hinge_{side}', (X(XNG + 0.15), sg * 0.21, zn_), (X(XNG - 1.25), sg * 0.21, zn_), [d_],
                                      {'kind': 'door', 'open_deg': 0.0, 'closed_deg': 90.0 * sg})
# pylons: one under each wing (the type's stations 2 and 8), one on the centreline in the channel, three stubs along
# each tank's lower edge (tangential carriage); each with a named hardpoint (an empty at the store's attach point)
hardpoints = {}
def hardpoint(name, loc, kind):
    e = bpy.data.objects.new(name, None); e.empty_display_type = 'SINGLE_ARROW'; e.empty_display_size = 0.5
    e.location = loc; e.rotation_euler = (math.pi, 0, 0); col.objects.link(e); e['kind'] = kind
    hardpoints[name] = {'pos': list(map(float, loc)), 'kind': kind}; return e
YP = 3.3
wle = lambda y: float(np.interp(y, [q[0] for q in ws], [q[1] for q in ws])); wte = lambda y: float(np.interp(y, [q[0] for q in ws], [q[2] for q in ws]))
for sg, side in ((1, 'l'), (-1, 'r')):
    l_, t_ = wle(YP), wte(YP); zl = wz - 0.04 * (t_ - l_) * 0.5 + (YP - 2.2) * math.tan(an)
    plate(f'pylon_wing_{side}', (X(l_ + 0.42 * (t_ - l_)), sg * YP, zl - 0.18), (min(2.4, (t_ - l_) * 0.62), 0.12, 0.44))   # (its top in the wing, clear of the flap)
    hardpoint(f'hp_wing_{side}', (X(l_ + 0.45 * (t_ - l_)), sg * YP, zl - 0.4), 'wing')
    for k, xc_ in enumerate((CFT0 + 1.55, CFT0 + 2.65, CFT0 + 3.75)):
        r_ = cft_ring(xc_, sg); yl_ = float(np.abs(r_[:, 1]).mean()) + 0.12
        def under(xq):                                      # (the tank's underside height at the stub's y)
            q = cft_ring(xq, sg); lo_ = q[q[:, 2] < q[:, 2].mean()]; o = np.argsort(np.abs(lo_[:, 1]))
            return float(np.interp(yl_, np.abs(lo_[o, 1]), lo_[o, 2]))
        ztop = max(under(xc_ - 0.45), under(xc_), under(xc_ + 0.45)) + 0.02; zl_ = float(r_[:, 2].min())
        plate(f'pylon_cft_{side}{k + 1}', (X(xc_), sg * yl_, (ztop + zl_ - 0.13) / 2), (0.9, 0.1, ztop - (zl_ - 0.13)))
        hardpoint(f'hp_cft_{side}{k + 1}', (X(xc_), sg * yl_, zl_ - 0.13), 'cft')
zk_ = belly_at(11.0, 0.0)
plate('pylon_center', (X(11.0), 0, zk_ - 0.12), (2.4, 0.14, 0.3)); hardpoint('hp_center', (X(11.0), 0, zk_ - 0.27), 'center')
# the canopy: hinged at its back, opening upward (its glass and the bow move; the windscreen, its frames and the
# rails stay)
can_obs = [o for o in col.objects if o.name in ('canopy', 'canopy_bow', 'canopy_frame_l', 'canopy_frame_r')]
canopy_hinge = group('canopy_hinge', (X(x_c1 - 0.45), 0.5, top_at(x_c1 - 0.45) - 0.08), (X(x_c1 - 0.45), -0.5, top_at(x_c1 - 0.45) - 0.08), can_obs,   # (at its back, by its foot: the front lifts, as the type's)
                     {'kind': 'canopy', 'open_deg': 40.0})
# the root: every part under it; the metadata beside the model
root_e = bpy.data.objects.new('ZF-25', None); col.objects.link(root_e)
for ob in list(col.objects):
    if ob is not root_e and ob.parent is None: ob.parent = root_e
LIMITS = {'flap': (-45, 0), 'aileron': (-20, 20), 'stab': (-29, 15), 'rudder': (-30, 30)}
meta = {'frame': 'Blender: metres, +X forward (the nose), +Y left, +Z up; z 0 the belly gear up; the ground at gear_down_ground_z',
        'length': L, 'span': SPAN, 'gear_down_ground_z': G_Z,
        'moving': {n: {'hinge': [[float(v) for v in r_] for r_ in o['hinge']], 'limits_deg': LIMITS[n.rsplit('_', 1)[0]],
                       'sense': 'positive about local X: trailing edge up (flap/aileron/stab), trailing edge to the right (rudder)'} for n, o in moving.items()},
        'gear': {n: {'hinge': [[float(v) for v in r_] for r_ in e['hinge']], **{k: e[k] for k in e.keys() if k not in ('hinge',)}} for n, e in gear.items()},
        'oleos': {n: {'pos': list(map(float, e.matrix_world.translation)), 'stroke_m': STROKE, 'axis': 'world down'} for n, e in sliders.items()},
        'canopy': {'hinge': [[float(v) for v in r_] for r_ in canopy_hinge['hinge']], 'open_deg': 40.0},
        'hardpoints': hardpoints,
        'eyes': {'front': [X(x_ws1 + 0.53), 0.0, sill_at(x_ws1 + 0.7) + 0.42], 'rear': [X(x_bow + 0.53), 0.0, sill_at(x_bow + 0.7) + 0.42]},
        'nozzles': [{'exit': [X(L), q['y'], q['z']], 'r': q['r']} for q in M['nozzles']],
        'gltf': {'files': ['export/zf25_lod0.glb (close: ~55k triangles, maps 160 px/m)', 'export/zf25_lod1.glb (middle: ~27k, 64 px/m)',
                           'export/zf25_lod2.glb (far: ~10k, 28 px/m, no cockpit inside, no small gear parts)'],
                 'frame': 'glTF is y up: a point (x, y, z) above sits at (x, z, -y) there: the nose +X, the left wing -Z, up +Y',
                 'nodes': 'every part a named node; the moving ones with their origin on the hinge and its local X along it (extras: hinge, limits)'}}
(root / 'assets' / 'originals' / 'jet_model' / 'zf25_meta.json').write_text(json.dumps(meta, indent=1, default=float))

# ---- stage 3: paint. Each lofted part's maps drawn in its own true-scale UV space (tools/zf25_paint.py): the
# fuselage's panel lines along its anchors and at its frames, its access panels, the radome, the bare titanium round
# the engines; the wings' and tails' spars, ribs and walkways. The textures go to build/zf25/tex (made again each run)
sys.path.insert(0, str(root / 'tools')); import zf25_paint as zp
EXPORT_LOD = int(os.environ['LOD']) if '--export' in sys.argv and 'LOD' in os.environ else None
TEX = root / 'build' / 'zf25' / ('tex' if EXPORT_LOD is None else f'tex_lod{EXPORT_LOD}'); TEX.mkdir(parents=True, exist_ok=True)
PPM = float(os.environ.get('TEX_PPM', 220 if EXPORT_LOD is None else (160, 64, 28)[EXPORT_LOD]))   # (pixels a metre: the master, or the game's LODs)
def tsize(umax, vmax):
    r = lambda m: int(min(4096, max(256, math.ceil(m * PPM / 128) * 128)))
    return r(umax), r(vmax)
def vat(info, i, j):
    """v (metres) on ring i at index j (fractional)"""
    vv = info['v'][int(i)]; return float(np.interp(j, np.arange(len(vv)), vv))
def ring_poly(info, i, j0, j1, k=12):
    return [(info['u'][int(i)], vat(info, i, j)) for j in np.linspace(j0, j1, k)]
def along(info, j, i0, i1):
    return [(info['u'][i], vat(info, i, j)) for i in range(i0, i1 + 1)]
painted = {}
# the fuselage
fi = UVI['fuselage']; nR = len(xs_); NAf = NA
ix_of = lambda x: int(np.clip(np.searchsorted(xs_, x), 0, nR - 1))
AN = np.cumsum([0] + SEG)                                    # (the anchors' indices on the +y side; the other side NA - j)
cmds = []
i_rad = ix_of(2.35)
cmds.append(('fill', [(fi['u'][i], 0) for i in range(0, i_rad + 1)] + [(fi['u'][i], fi['v'][i, -1]) for i in range(i_rad, -1, -1)],
             (0.345, 0.36, 0.37), 0.45, 0.0))               # (the radome: a shade lighter, smoother)
for jj in ((AN[1], AN[5]), (NAf - AN[5], NAf - AN[1])):     # (bare titanium round the engines, the last 3 m)
    i0, i1 = ix_of(15.6), nR - 1
    pts = along(fi, jj[0], i0, i1) + [(fi['u'][i], vat(fi, i, jj[1])) for i in range(i1, i0 - 1, -1)]
    cmds.append(('fill', pts, (0.43, 0.41, 0.38), 0.38, 0.85))
for x_ in (2.35, 3.3, 4.35, 5.5, 6.45, 7.4, 8.3, 9.25, 10.2, 11.1, 12.0, 12.95, 13.9, 14.85, 15.6, 16.6, 17.6):   # (frames)
    i = ix_of(x_); cmds.append(('line', ring_poly(fi, i, 0, NAf, 60), x_ > 2.4))
for j in (AN[2], AN[4], AN[5], AN[7]):                      # (along the anchors: bottom, side, shoulder, sill)
    for jj in (j, NAf - j): cmds.append(('line', along(fi, jj, i_rad, nR - 1), True))
cmds.append(('line', along(fi, AN[8], ix_of(X_C1 + 0.2), nR - 1), True))   # (the spine aft of the canopy)
for x0, x1, j0, j1 in ((2.7, 3.9, 13.5, 17.0), (5.7, 6.3, 19.0, 22.0), (7.0, 8.1, 9.5, 12.5), (8.6, 9.6, 9.5, 12.5),
                       (11.2, 12.4, 19.0, 22.0), (13.2, 14.5, 14.0, 17.0), (16.1, 17.1, 9.0, 12.0), (4.5, 5.3, 2.0, 6.0)):
    for side in (1, -1):
        a, b = (j0, j1) if side > 0 else (NAf - j1, NAf - j0)
        i0, i1 = ix_of(x0), ix_of(x1)
        cmds.append(('panel', along(fi, a, i0, i1) + [(fi['u'][i], vat(fi, i, b)) for i in range(i1, i0 - 1, -1)]))
# markings that need no livery decision: the ejection-seat warning triangles under the sill by each seat (red), the
# formation-light strips (the pale green electroluminescent panels) on the forebody's sides and by the fins
RED, FORM = (0.62, 0.10, 0.08), (0.70, 0.80, 0.50)
def tri(i, j, size):
    u_, v_ = fi['u'][i], vat(fi, i, j); return [(u_ - size * 0.5, v_ - size * 0.43), (u_ + size * 0.5, v_ - size * 0.43), (u_, v_ + size * 0.43)]
def strip(x0, x1, j, h):
    i0, i1 = ix_of(x0), ix_of(x1); vv = lambda i: vat(fi, i, j)
    return [(fi['u'][i], vv(i) - h / 2) for i in range(i0, i1 + 1)] + [(fi['u'][i], vv(i) + h / 2) for i in range(i1, i0 - 1, -1)]
for side in (1, -1):
    J = lambda j: j if side > 0 else NAf - j
    for xs_seat in (x_ws1 + 0.55, x_bow + 0.55):
        cmds.append(('fill', tri(ix_of(xs_seat), J(AN[7] - 2.2), 0.2), RED, 0.5, 0.0))
    cmds.append(('fill', strip(X_WS0 - 0.9, X_WS0 - 0.25, J(AN[5] + 1.5), 0.08), FORM, 0.35, 0.0))
    cmds.append(('fill', strip(15.0, 15.7, J(AN[5] - 1.0), 0.08), FORM, 0.35, 0.0))
# the game's name on the forebody's sides under the front cockpit, as on its icon, in the game's own type (IBM Plex Sans
# Arabic Bold) and a low-visibility dark grey as the type's markings are
LOWVIS = (0.19, 0.20, 0.21)
name_img = zp.text_decal('صقر الوادي', root / 'assets' / 'originals' / 'fonts' / 'ibm-plex-sans-arabic-arabic-700-normal.woff2', LOWVIS)
for side in (1, -1):
    i_n = ix_of(X_WS0 + 0.55); j_n = AN[4] - 1.2
    # (on the right side v counts on from the far side, so it drifts with the section's girth: follow that ring index)
    vsh = None if side > 0 else (lambda u_, j_=NAf - j_n: float(np.interp(u_, fi['u'], [vat(fi, i, j_) for i in range(nR)])))
    cmds.append(('decal', name_img, (fi['u'][i_n], vat(fi, i_n, j_n if side > 0 else NAf - j_n)), 1.35, side < 0, vsh))
painted['fuselage'] = zp.paint('fuselage', tsize(fi['umax'], fi['vmax']), fi['umax'], fi['vmax'], cmds, TEX, seed=1)
# the wings, tails and their moving surfaces: spars and ribs on both skins, a walkway by the wing root
def frac_idx(info, i, f, upper=True):
    """the index on ring i where the chord fraction is f, on the upper or lower skin"""
    r = info['rings'][i]; n = len(r); nu = (n + 1) // 2; xs = r[:, 0]
    le, te = xs.max(), xs.min(); fr_ = (le - xs) / max(le - te, 1e-6)
    idx = np.arange(0, nu) if upper else np.arange(nu - 1, n)
    fr2 = fr_[idx]; o_ = np.argsort(fr2); return float(np.interp(f, fr2[o_], idx[o_]))
def skin_cmds(name, spars, rib_step, walk=None):
    info = UVI[name]; nr = len(info['u']); out = []
    for up in (True, False):
        for f in spars:
            out.append(('line', [(info['u'][i], vat(info, i, frac_idx(info, i, f, up))) for i in range(nr)], True))
        uu = info['u']
        for ur in np.arange(rib_step, uu[-1] - 0.1, rib_step):
            i = int(np.searchsorted(uu, ur)); a, b = frac_idx(info, i, spars[0], up), frac_idx(info, i, spars[-1], up)
            out.append(('line', ring_poly(info, i, min(a, b), max(a, b), 10), True))
    if walk:
        u0, u1, f0, f1 = walk; i0, i1 = int(np.searchsorted(info['u'], u0)), int(np.searchsorted(info['u'], u1))
        pts = [(info['u'][i], vat(info, i, frac_idx(info, i, f0))) for i in range(i0, i1 + 1)] + \
              [(info['u'][i], vat(info, i, frac_idx(info, i, f1))) for i in range(i1, i0 - 1, -1)]
        out.insert(0, ('fill', pts, (0.24, 0.25, 0.26), 0.9, 0.0))
    return out
for nm in [n for n in UVI if n.split('_')[0] in ('wing', 'stab', 'fin', 'flap', 'aileron', 'rudder')]:
    info = UVI[nm]; kind = nm.split('_')[0]
    sp = {'wing': (0.12, 0.42, 0.70), 'stab': (0.15, 0.6), 'fin': (0.15, 0.62), 'flap': (0.1, 0.9), 'aileron': (0.1, 0.9), 'rudder': (0.1, 0.9)}[kind]
    cm = skin_cmds(nm, sp, 0.6 if kind in ('wing', 'stab', 'fin') else 0.5, walk=(0.4, 1.6, 0.15, 0.55) if kind == 'wing' else None)
    if kind == 'fin':                                        # (the fins' formation strips, high up, both skins)
        for up in (True, False):
            i0, i1 = int(np.searchsorted(info['u'], 1.55)), int(np.searchsorted(info['u'], 1.65))
            pts = [(info['u'][i], vat(info, i, frac_idx(info, i, 0.30, up))) for i in range(i0, i1 + 1)] + \
                  [(info['u'][i], vat(info, i, frac_idx(info, i, 0.62, up))) for i in range(i1, i0 - 1, -1)]
            cm.insert(0, ('fill', pts, FORM, 0.35, 0.0))
    painted[nm] = zp.paint(nm, tsize(info['umax'], info['vmax']), info['umax'], info['vmax'], cm, TEX, seed=hash(nm) % 1000, aft='-v')
for nm in [n for n in UVI if n.startswith(('cft_', 'boom_'))]:
    info = UVI[nm]; nr = len(info['u']); n_ = len(info['rings'][0])
    cm = [('line', ring_poly(info, i, 0, n_, 30), True) for i in range(2, nr - 2, 4)] + [('line', along(info, j, 1, nr - 2), True) for j in (n_ // 4, 3 * n_ // 4)]
    painted[nm] = zp.paint(nm, tsize(info['umax'], info['vmax']), info['umax'], info['vmax'], cm, TEX, seed=hash(nm) % 1000)
print('painted', len(painted), 'parts')

# ---- clay, sun and sky, cameras
clay = bpy.data.materials.new('clay'); clay.use_nodes = True
bs = clay.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value = (0.42, 0.44, 0.46, 1); bs.inputs['Roughness'].default_value = 0.55
dark = bpy.data.materials.new('dark'); dark.use_nodes = True; dark.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.02, 0.02, 0.02, 1)
glass = bpy.data.materials.new('glass'); glass.use_nodes = True; gb = glass.node_tree.nodes['Principled BSDF']
gb.inputs['Base Color'].default_value = (0.05, 0.07, 0.09, 1); gb.inputs['Roughness'].default_value = 0.03; gb.inputs['Coat Weight'].default_value = 1
glass.blend_method = 'BLEND'; glass.use_backface_culling = True   # (two layers seen through, not four)
gb.inputs['Transmission Weight'].default_value = 1.0; gb.inputs['IOR'].default_value = 1.5; gb.inputs['Base Color'].default_value = (0.55, 0.62, 0.66, 1)
gb.inputs['Roughness'].default_value = 0.02
if EXPORT_LOD is not None:                                   # (the game's three.js has no transmission: tinted, see-through glass by alpha)
    gb.inputs['Transmission Weight'].default_value = 0.0; gb.inputs['Base Color'].default_value = (0.10, 0.13, 0.15, 1)
    gb.inputs['Alpha'].default_value = 0.32; gb.inputs['Metallic'].default_value = 0.0; gb.inputs['Roughness'].default_value = 0.05
def solid_mat(name, rgb, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True; b_ = m.node_tree.nodes['Principled BSDF']
    b_.inputs['Base Color'].default_value = rgb + (1,); b_.inputs['Roughness'].default_value = rough; return m
mats = {'dark': solid_mat('cockpit', (0.03, 0.03, 0.035), 0.7), 'helmet': solid_mat('helmet', (0.55, 0.56, 0.5), 0.45),
        'flight_suit': solid_mat('suit', (0.17, 0.19, 0.12), 0.85), 'frame': solid_mat('frame', (0.035, 0.037, 0.04), 0.55),
        'tire': solid_mat('tire', (0.025, 0.025, 0.025), 0.9), 'strut': solid_mat('strut', (0.62, 0.63, 0.64), 0.35),
        'bay': solid_mat('bay', (0.30, 0.31, 0.30), 0.7), 'lamp': solid_mat('lamp', (0.9, 0.9, 0.85), 0.2)}
def painted_mat(name):
    m = bpy.data.materials.new('paint_' + name); m.use_nodes = True; nt = m.node_tree; b_ = nt.nodes['Principled BSDF']
    def img(k, srgb):
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(str(painted[name][k])); t.interpolation = 'Linear'
        if not srgb: t.image.colorspace_settings.name = 'Non-Color'
        return t
    nt.links.new(img('base', True).outputs['Color'], b_.inputs['Base Color'])
    if EXPORT_LOD is None:
        nt.links.new(img('rough', False).outputs['Color'], b_.inputs['Roughness'])
        nt.links.new(img('metal', False).outputs['Color'], b_.inputs['Metallic'])
    else:                                                    # (for glTF: one packed image, G roughness and B metal, as the exporter reads it)
        sep = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(img('orm', False).outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], b_.inputs['Roughness']); nt.links.new(sep.outputs['Blue'], b_.inputs['Metallic'])
    nm_ = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(img('normal', False).outputs['Color'], nm_.inputs['Color'])
    nt.links.new(nm_.outputs['Normal'], b_.inputs['Normal'])
    return m
def proc_mat(name, rgb, rough, metal=0.0, scale=40.0, var=0.08):
    """a paint or metal without its own maps: a little mottling by noise"""
    rgb = tuple(((c + 0.055) / 1.055) ** 2.4 for c in rgb)   # (sRGB as drawn on the maps -> the shader's linear)
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b_ = nt.nodes['Principled BSDF']
    if EXPORT_LOD is not None:                              # (for glTF: a plain colour, no node noise)
        b_.inputs['Base Color'].default_value = rgb + (1,); b_.inputs['Roughness'].default_value = rough; b_.inputs['Metallic'].default_value = metal; return m
    nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = scale
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = tuple(c * (1 - var) for c in rgb) + (1,); mix.inputs['B'].default_value = tuple(min(1, c * (1 + var)) for c in rgb) + (1,)
    nt.links.new(nz.outputs['Fac'], mix.inputs['Factor']); nt.links.new(mix.outputs['Result'], b_.inputs['Base Color'])
    b_.inputs['Roughness'].default_value = rough; b_.inputs['Metallic'].default_value = metal; return m
mats['paint'] = proc_mat('paint', zp.GREY, 0.6)
def duct_mat():
    """the intake's inside: painted light grey as on the type, darkening with depth (ambient occlusion)"""
    m = bpy.data.materials.new('duct'); m.use_nodes = True; nt = m.node_tree; b_ = nt.nodes['Principled BSDF']
    if EXPORT_LOD is not None:
        b_.inputs['Base Color'].default_value = (0.08, 0.08, 0.085, 1); b_.inputs['Roughness'].default_value = 0.7; return m
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.6; ao.samples = 8
    mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'
    mix.inputs['A'].default_value = (0.01, 0.01, 0.012, 1); mix.inputs['B'].default_value = (0.62, 0.63, 0.63, 1)
    cr = nt.nodes.new('ShaderNodeMapRange'); cr.inputs['From Min'].default_value = 0.35; cr.inputs['From Max'].default_value = 0.95
    nt.links.new(ao.outputs['AO'], cr.inputs['Value']); nt.links.new(cr.outputs['Result'], mix.inputs['Factor'])
    nt.links.new(mix.outputs['Result'], b_.inputs['Base Color']); b_.inputs['Roughness'].default_value = 0.6; return m
mats['duct'] = duct_mat()
mats['nozzle'] = proc_mat('nozzle', (0.36, 0.33, 0.30), 0.42, 0.9, 25, 0.15)
mats['strut'] = proc_mat('strut_paint', (0.78, 0.79, 0.80), 0.45, 0.0, 30, 0.04)       # (the gear legs and wheel hubs: white, as on the type)
mats['bay'] = proc_mat('bay_paint', (0.78, 0.79, 0.80), 0.6, 0.0, 30, 0.06)
inner_names = {o.name: m for o, m in inner}
for ob in col.objects:
    if ob.type not in ('MESH', 'CURVE'): continue
    tag = ob.get('mat')
    m = (glass if ob.name in ('canopy', 'windscreen') else dark if ob.name.endswith('_mouth') else mats['frame'] if ob in frames
         else mats[inner_names[ob.name]] if ob.name in inner_names else mats[tag] if tag in mats
         else painted_mat(ob.name) if ob.name in painted else mats['nozzle'] if ob.name.startswith('nozzle') else mats['paint'])
    ob.data.materials.append(m)
    for ib, mi_ in intake_dark:
        if ob is ib: ob.data.materials.append(mats['duct']); ob.data.polygons.foreach_set('material_index', mi_)
    if ob is fus:                                              # (the intake mouths: the second material, dark)
        ob.data.materials.append(dark); mi = np.zeros(len(ob.data.polygons), int); mi[mouth_faces] = 1
        ob.data.polygons.foreach_set('material_index', mi.tolist())
world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
sky = world.node_tree.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(float(os.environ.get('SUN_EL', 50))); sky.sun_rotation = math.radians(float(os.environ.get('SUN_ROT', 30)))
world.node_tree.links.new(sky.outputs['Color'], world.node_tree.nodes['Background'].inputs['Color'])
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.3
_fill = bpy.data.lights.new('ground_bounce', 'SUN'); _fill.energy = float(os.environ.get('FILL', 0.6)); _fill.color = (0.85, 0.78, 0.66)
_fo = bpy.data.objects.new('ground_bounce', _fill); _fo.rotation_euler = (math.radians(180), 0, 0); scene.collection.objects.link(_fo)
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.use_denoising = True
scene.view_settings.view_transform = 'AgX'; scene.view_settings.exposure = float(os.environ.get('EXPOSURE', -2.2))
scene.render.film_transparent = True
args = sys.argv[1:]
if '--export' in args:
    # ---- stage 4: the game's glTF (GLB) at one level of detail, no subdivision (the game smooths by normals): LOD 0
    # close (the maps at 160 px/m, all of it), 1 middle (decimated to 40%, 64 px/m), 2 far (12%, 28 px/m, no cockpit
    # inside, no small gear parts). Hinges, hardpoints and the rest ride along as each node's extras; zf25_meta.json beside it.
    lod = EXPORT_LOD or 0
    out = pathlib.Path(args[args.index('--export') + 1]); out.mkdir(parents=True, exist_ok=True)
    bpy.data.objects.remove(_fo)                                # (the render's fill light)
    small = ('main_torque', 'main_axle', 'main_brace', 'nose_brace', 'taxi_light', 'bay_', 'canopy_bow')
    for ob in list(col.objects):
        if lod == 2 and (ob.name in inner_names or ob.name.startswith(small)):
            bpy.data.objects.remove(ob); continue
        for md in list(ob.modifiers):                           # (the game smooths by normals: no subdivision; the far ones decimated)
            if md.type == 'SUBSURF': ob.modifiers.remove(md)
        if lod and ob.type == 'MESH' and len(ob.data.polygons) > 120 and ob.name != 'dorsal':   # (the dorsal lies on the skin: decimated apart they fight)
            dc = ob.modifiers.new('decimate', 'DECIMATE'); dc.ratio = (1.0, 0.4, 0.12)[lod]
    # (the frame tubes are curves: as meshes, lighter far off)
    for ob in [o_ for o_ in col.objects if o_.type == 'CURVE']:
        ob.data.bevel_resolution = 2 if lod == 0 else 1; ob.data.resolution_u = 2
    bpy.ops.object.select_all(action='DESELECT')
    for ob in [o_ for o_ in col.objects if o_.type == 'CURVE']:
        ob.select_set(True); bpy.context.view_layer.objects.active = ob
    if bpy.context.selected_objects: bpy.ops.object.convert(target='MESH')
    fp = out / f'zf25_lod{lod}.glb'
    bpy.ops.export_scene.gltf(filepath=str(fp), export_format='GLB', export_apply=True, export_image_format='JPEG',
                              export_jpeg_quality=88, export_yup=True, export_extras=True, export_cameras=False,
                              export_lights=False, use_selection=False)
    print('exported', fp, round(fp.stat().st_size / 1e6, 2), 'MB')
    sys.stdout.flush(); os._exit(0)                          # (bpy's teardown can crash after a heavy export: the file is written)
if '--fit' in args:
    # ---- the camera pose of an owner's photo: search the view (az, el, bank) whose silhouette matches the photo's (sky
    # segmented out), each compared after a 2-D fit (centroid, principal axis, size); writes the best to a json
    from PIL import Image
    ph_path, out_json = args[args.index('--fit') + 1], args[args.index('--fit') + 2]
    a_ = np.asarray(Image.open(ph_path).convert('RGB')).astype(float)
    phm = ~((a_[..., 2] - a_[..., 0] > 40) & (a_[..., 2] > 150))
    def moments(m):
        ys, xs = np.nonzero(m); c = np.array([xs.mean(), ys.mean()]); d = np.stack([xs - c[0], ys - c[1]])
        ev, evec = np.linalg.eigh(d @ d.T / len(xs)); v = evec[:, 1]
        return c, math.atan2(v[1], v[0]), math.sqrt(ev[1]), math.sqrt(len(xs))
    pc, pa, ps, parea = moments(phm); H_, W_ = phm.shape
    for ob in col.objects:
        if ob.name.startswith(('main_', 'nose_', 'door_', 'bay_', 'gear_', 'oleo_', 'taxi_', 'pylon_')): ob.hide_render = True
    scene.render.engine = 'CYCLES'; scene.cycles.samples = 1; scene.cycles.use_denoising = False; scene.cycles.max_bounces = 0
    scene.render.film_transparent = True; scene.render.resolution_x = scene.render.resolution_y = 240
    for m_ in bpy.data.materials: m_.use_nodes = False           # (outlines only: no shading work)
    piv = bpy.data.objects.new('piv', None); col.objects.link(piv)
    for ob in col.objects:
        if ob is not piv and ob.parent is None: ob.parent = piv
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); col.objects.link(cam); scene.camera = cam
    cam.data.type = 'ORTHO'; cam.data.ortho_scale = L * 1.15; cam.data.clip_start = 1; cam.data.clip_end = 1000
    tmp = str(root / 'build' / 'zf25' / '_fit.png')
    def mask_at(az, el, roll):
        piv.rotation_euler = (math.radians(roll), 0, 0)
        a, e = math.radians(az), math.radians(el)
        d = Vector((-math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), -math.sin(e)))
        cam.location = d * 200 + Vector((0, 0, H / 2)); cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = tmp; bpy.ops.render.render(write_still=True)
        return np.asarray(Image.open(tmp))[..., 3] > 128
    def score(m):
        if m.sum() < 50: return 0.0, None
        c, ang, sd, ar = moments(m); best = (0.0, None)
        for flip in (0.0, math.pi):
            rot = pa - ang + flip; k = parea / ar
            # (the render's mask moved onto the photo: rotate about its centroid, scale, shift to the photo's centroid)
            ca, sa = math.cos(rot), math.sin(rot)
            inv = np.array([[ca, sa], [-sa, ca]]) / k
            ys, xs = np.mgrid[0:H_:2, 0:W_:2]; q = np.stack([xs - pc[0], ys - pc[1]])
            src = np.einsum('ij,jhw->ihw', inv, q); sx_ = (src[0] + c[0]).round().astype(int); sy_ = (src[1] + c[1]).round().astype(int)
            ok = (sx_ >= 0) & (sx_ < m.shape[1]) & (sy_ >= 0) & (sy_ < m.shape[0])
            mm = np.zeros(sx_.shape, bool); mm[ok] = m[sy_[ok], sx_[ok]]
            pm = phm[0:H_:2, 0:W_:2]; iou = (mm & pm).sum() / max((mm | pm).sum(), 1)
            if iou > best[0]: best = (iou, (rot, k))
        return best
    results = []
    ELS = [int(v) for v in os.environ.get('FIT_EL', '-85,-75,-65,-55,-45,-35,-25').split(',')]
    AZS = [int(v) for v in os.environ.get('FIT_AZ', '45,60,75,90,105,120,135,150,165').split(',')]
    grid = [(az, el, rl) for az in AZS for el in ELS for rl in range(-60, 61, 20)]   # (FIT_EL positive: seen from below)
    for az, el, rl in grid:
        iou, tf = score(mask_at(az, el, rl)); results.append((iou, az, el, rl))
    results.sort(reverse=True); print('coarse best', results[:5], flush=True)
    for it, step in enumerate((6, 3, 1.5)):                    # (refine round the best)
        _, a0, e0, r0 = results[0]
        for da in (-step, 0, step):
            for de in (-step, 0, step):
                for dr in (-step * 1.5, 0, step * 1.5):
                    iou, tf = score(mask_at(a0 + da, e0 + de, r0 + dr)); results.append((iou, a0 + da, e0 + de, r0 + dr))
        results.sort(reverse=True); print('refine', step, results[0], flush=True)
    iou, az, el, rl = results[0]; _, tf = score(mask_at(az, el, rl))
    if tf is None: tf = (0.0, 1.0)                           # (nothing matched at all)
    json.dump({'iou': iou, 'az': az, 'el': el, 'roll': rl, 'rot2d': tf[0], 'scale2d': tf[1]}, open(out_json, 'w'), indent=1)
    print('fit', iou, az, el, rl, flush=True); sys.stdout.flush(); os._exit(0)
if '--blend' in args:
    bpy.ops.wm.save_as_mainfile(filepath=str(pathlib.Path(args[args.index('--blend') + 1]).resolve()))
    print('saved blend')
if '--render' in args:
    out = pathlib.Path(args[args.index('--render') + 1]); out.mkdir(parents=True, exist_ok=True)
    import os
    scene.cycles.samples = int(os.environ.get('SAMPLES', 32)); scene.render.resolution_x = scene.render.resolution_y = int(os.environ.get('RES', 900))
    if os.environ.get('POSE'):                                 # (the moving parts deflected, to show they work)
        for n, o_ in moving.items():
            k_ = n.rsplit('_', 1)[0]; sd = 1 if n.endswith('_l') else -1
            o_.rotation_euler.rotate_axis('X', math.radians({'flap': -30, 'aileron': 15 * sd, 'stab': -8, 'rudder': 20}[k_]))
        canopy_hinge.rotation_euler.rotate_axis('X', math.radians(40))
        from mathutils import Matrix
        bpy.context.view_layer.update()
        for e in sliders.values(): e.matrix_world = Matrix.Translation((0, 0, -STROKE)) @ e.matrix_world   # (in the air)
    if os.environ.get('NOGEAR'):                               # (gear up: the legs, wheels, open doors and bays out of the render)
        for ob in col.objects:
            if ob.name.startswith(('main_', 'nose_', 'door_', 'bay_', 'gear_', 'oleo_', 'taxi_')): ob.hide_render = True
    piv = bpy.data.objects.new('piv', None); col.objects.link(piv)
    for ob in col.objects:
        if ob is not piv and ob.parent is None: ob.parent = piv
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); col.objects.link(cam); scene.camera = cam
    cam.data.clip_start = 5; cam.data.clip_end = 3000
    zc = H / 2
    shots = [(30, 15, 0, 'p'), (90, 10, 0, 'p'), (120, 20, 0, 'p'), (45, 25, 35, 'p'), (150, 15, 0, 'p'), (60, -30, 0, 'p'),
             (0, -90, 0, 'top'), (90, 0, 0, 'side'), (180, 0, 0, 'front'), (0, 0, 0, 'rear')]
    import os
    if os.environ.get('SHOTS') == 'belly': shots = [(30, 55, 0, 'p'), (150, 55, 0, 'p'), (90, 40, 0, 'p'), (0, 89, 0, 'p')]
    if os.environ.get('SHOTS') == 'gear': shots = [(60, 6, 0, 'g'), (140, 4, 0, 'g'), (100, 25, 180, 'g'), (20, 10, 0, 'g')]
    if os.environ.get('SHOTS') == 'nose2': shots = [(150, 12, 0, 'n'), (90, 0, 0, 'n'), (130, -10, 0, 'n'), (180, -32, 0, 'q')]
    if os.environ.get('SHOTS') == 'marks': shots = [(90, 0, 0, 'n'), (270, 0, 0, 'n'), (120, -10, 0, 'n'), (240, -10, 0, 'n')]
    if os.environ.get('SHOTS') == 'side': shots = [(90, 0, 0, 'side')]
    if os.environ.get('SHOTS') == 'canrear': shots = [(0, -18, 0, 'c'), (25, -22, 0, 'c'), (55, -12, 0, 'c'), (0, -45, 0, 'c')]
    if os.environ.get('SHOTS') == 'canclose': shots = [(90, -4, 0, 'k'), (130, -14, 0, 'k'), (60, -14, 0, 'k'), (160, -20, 0, 'k')]
    if os.environ.get('SHOTS') == 'match': shots = [(88, -6, 0, 'k'), (180, -32, 0, 'q'), (180, -62, 0, 'k'), (150, -25, 0, 'k'), (78, 10, 0, 'k')]
    if os.environ.get('SHOTS') == 'tail': shots = [(30, -25, 0, 'k'), (0, -40, 0, 'k'), (88, -6, 0, 'k'), (60, -12, 0, 'k')]
    if os.environ.get('SHOTS') == 'aft': shots = [(15, -20, 0, 't'), (0, 0, 0, 't'), (40, -35, 0, 't'), (80, -8, 0, 't')]
    if os.environ.get('SHOTS') == 'topcmp': shots = [(110, -58, -20, 'p'), (90, -89, 0, 'p')]
    if os.environ.get('SHOTS') == 'back': shots = [(0, -89, 0, 'top'), (20, -35, 0, 'p'), (160, -35, 0, 'p'), (90, -20, 0, 'p')]
    if os.environ.get('SHOTS') == 'junction': shots = [(0, -40, 0, 'r'), (35, -30, 0, 'r'), (325, -30, 0, 'r'), (90, -25, 0, 'r')]
    if os.environ.get('SHOTS') == 'fitcand': shots = [tuple(float(v) for v in c.split(',')) + ('f',) for c in os.environ.get('FIT_CANDS', '103.5,-33.5,-42.25;105,-55,-20;120,-55,-20').split(';')]
    if os.environ.get('SHOTS') == 'photo': shots = [(180, -32, 0, 'q'), (165, -28, 0, 'q'), (95, -5, 0, 'p'), (120, -12, 0, 'p')]
    if os.environ.get('SHOTS') == 'nose': shots = [(180, 0, 0, 'n'), (155, 4, 0, 'n'), (125, 8, 0, 'n'), (90, 0, 0, 'n'), (180, 25, 0, 'n'), (160, -15, 0, 'n')]
    if os.environ.get('SHOTS') == 'intake': shots = [(150, -5, 0, 'i'), (125, -12, 0, 'i'), (170, 8, 0, 'i'), (100, 0, 0, 'i')]
    if os.environ.get('SHOTS') == 'canopy': shots = [(60, -20, 0, 'c'), (120, -15, 0, 'c'), (90, -3, 0, 'c'), (160, -10, 0, 'c'), (30, 15, 0, 'p'), (120, 20, 0, 'p')]
    for az, el, roll, kind in shots:
        piv.rotation_euler = (math.radians(roll), 0, 0)
        a, e = math.radians(az), math.radians(el)
        if kind == 'p':
            cam.data.type = 'PERSP'; cam.data.lens = 300; cam.data.sensor_width = 36; D = 250
        elif kind == 'g':
            cam.data.type = 'PERSP'; cam.data.lens = 300; cam.data.sensor_width = 36; D = 85
        elif kind == 'f':                                      # (as the photo fit: orthographic, the same framing)
            cam.data.type = 'ORTHO'; cam.data.ortho_scale = L * 1.15; D = 200
        elif kind == 'r':                                      # (close on the canopy's back and the body behind it)
            cam.data.type = 'PERSP'; cam.data.lens = 300; cam.data.sensor_width = 36; D = 75
        elif kind == 't':                                      # (close on the tail end: the nacelles, booms, fins)
            cam.data.type = 'PERSP'; cam.data.lens = 300; cam.data.sensor_width = 36; D = 90
        elif kind == 'k':                                      # (very close on the canopy)
            cam.data.type = 'PERSP'; cam.data.lens = 300; cam.data.sensor_width = 36; D = 55
        elif kind == 'q':                                      # (as the owner's photo: from ahead and above)
            cam.data.type = 'PERSP'; cam.data.lens = 300; cam.data.sensor_width = 36; D = 160
        elif kind in ('c', 'i', 'g', 'n'):                     # (close on the cockpit, the intake, the gear, the nose)
            cam.data.type = 'PERSP'; cam.data.lens = 300; cam.data.sensor_width = 36; D = 95
        else:
            cam.data.type = 'ORTHO'; cam.data.ortho_scale = L * 1.05; D = 200
        d = Vector((-math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), -math.sin(e)))
        tgt = (Vector((X((X_WS0 + X_C1) / 2), 0, 2.0)) if kind == 'c' else Vector((X(ix0 + 0.4), 1.5, 0.9)) if kind == 'i' else Vector((X(8.0), 0, -0.3)) if kind == 'g' else Vector((X(3.2), 0, 1.0)) if kind == 'n' else Vector((X(8.0), 0, 1.2)) if kind == 'q' else Vector((X((X_WS0 + X_C1) / 2), 0, 1.9)) if kind == 'k' else Vector((X(X_C1 + 1.2), 0, 1.9)) if kind == 'r' else Vector((X(16.8), 0, 1.3)) if kind == 't' else Vector((0, 0, zc)))
        cam.location = d * D + tgt
        up = 'Y' if kind != 'top' else 'Y'
        cam.rotation_euler = (-d).to_track_quat('-Z', up).to_euler()   # (looking along -d, at the target)
        if kind == 'top': cam.rotation_euler = (0, 0, math.radians(90))
        scene.render.filepath = str(out / f'{kind}_{az}_{el}_{roll}.png'); bpy.ops.render.render(write_still=True); print('shot', kind, az, el, flush=True)
