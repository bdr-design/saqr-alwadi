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

def mesh_obj(name, verts, faces, smooth=True, subsurf=2, parent=None):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in verts], [], [tuple(f) for f in faces]); me.update()
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()
    if smooth: me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    if subsurf:
        m = ob.modifiers.new('subsurf', 'SUBSURF'); m.levels = 1; m.render_levels = subsurf
    if parent: ob.parent = parent
    return ob

def loft(rings, cap0=True, cap1=True):
    """rings: list of (n, 3) arrays, same n, closed loops -> quads, the ends closed by fans to their middles"""
    n = len(rings[0]); verts = np.concatenate(rings); faces = []
    for i in range(len(rings) - 1):
        for j in range(n):
            a, b = i * n + j, i * n + (j + 1) % n
            faces.append([a, b, b + n, a + n])
    extra = []
    if cap0:
        c = len(verts) + len(extra); extra.append(rings[0].mean(0))
        faces += [[c, (j + 1) % n, j] for j in range(n)]
    if cap1:
        c = len(verts) + len(extra); extra.append(rings[-1].mean(0)); o = (len(rings) - 1) * n
        faces += [[c, o + j, o + (j + 1) % n] for j in range(n)]
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
u = np.linspace(0, 1, 120); xs_ = 0.05 + (X_END - 0.05) * (0.5 - 0.5 * np.cos(np.pi * u))
IXD = ix0 + 0.45                                             # (the fuselage's ducts begin here, behind the intakes' lips)
xs_ = xs_[(xs_ < IXD - 0.15) | (xs_ > IXD + 0.45)]
xs_ = np.unique(np.concatenate([xs_, IXD + np.array([-0.08, -0.01, 0.0, 0.05, 0.1, 0.18, 0.28, 0.4])]))
SEG = [5, 6, 5, 5, 4, 4, 4]                                  # (points per segment between the 8 anchors, a half)
NA = 2 * sum(SEG)
nz_ = M['nozzles'][0]; ny_, nzc, nr_ = abs(nz_['y']), nz_['z'], nz_['r']
_cx = sx[~np.isnan(csill)]; X_WS0, X_C1 = float(_cx[0]), float(_cx[-1])
DORSAL_H = float(np.interp(X_C1, sx, ctop) - np.interp(X_C1, sx, spine)) - 0.04   # (the fairing's rise at the canopy's back)
SILL_HW = 0.64                                               # (the canopy's half width at its sill)
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
def anchors(x):
    """the eight anchors (y >= 0) from the keel round to the spine"""
    f_ = x / L
    wc = max(float(np.interp(x, sx, core)), 0.02); zt = float(np.interp(x, sx, spine)); zb = float(np.interp(x, sx, belly))
    zt = max(zt, zb + 0.04); zc, hh = (zt + zb) / 2, (zt - zb) / 2
    # round: a superellipse (p 2.1) at fixed angles
    ang = np.radians([-90, -62, -35, 0, 32, 55, 74, 90]); pe = 2 / 2.1
    rnd = np.stack([wc * np.abs(np.cos(ang)) ** pe, zc + hh * np.sign(np.sin(ang)) * np.abs(np.sin(ang)) ** pe], 1)
    # forebody and intakes: a level belly, the ducts' boxes beside the cockpit deck (no ducts ahead of the mouth)
    g = ss_((x - IXD) / 0.2) if x >= IXD else 0.0                      # (the ducts grow out of the body inside the intakes' shells)
    wb = wc + (max(float(np.interp(x, sx, body)), wc) - wc) * g
    zd = zi1 + (zt - 0.1 - zi1) * ss_((x - IXD) / 3.5) if x >= IXD else zt   # (the ducts' tops, rising aft to the deck)
    zd = zt + (min(zd, zt) - zt) * g
    lo = zb + (zi0 - zb) * max(0.0, 1 - (x - IXD) / 1.5) * g          # (the duct's bottom at the mouth, then flush)
    yin = min(wc, max(SILL_HW + 0.12, wc * 0.86))                          # (where the duct's top meets the deck's side)
    # the deck: under the canopy the top is level out to the sill (the canopy sits on it); ahead of the windscreen round
    dk = ss_((x - (X_WS0 - 0.5)) / 0.5) * (1 - ss_((x - (X_C1 - 0.2)) / 0.8))
    ang2 = np.radians([-90, -60, -32, 0, 30, 52, 72, 90]); pf = 2 / 2.6
    fwd = np.stack([wc * np.abs(np.cos(ang2)) ** pf, zc + hh * np.sign(np.sin(ang2)) * np.abs(np.sin(ang2)) ** pf], 1)
    ys_ = min(SILL_HW, wc * 0.8)
    deck = np.array([[wc, zc + hh * 0.45], [wc * 0.93, zt - 0.1], [ys_, zt], [0, zt + 0.01]])
    fwd[4:] = fwd[4:] * (1 - dk) + deck * dk
    # (the underside between the ducts: a channel from behind the mouths, the ducts' bottoms two long tubes into the
    # nacelles, as on the type)
    chan = 0.26 * ss_((x - IXD) / 1.5)
    box = np.array([[0, zb + chan], [min(yi0 + 0.12, wb * 0.6), zb], [wb - 0.16, lo + 0.04], [wb, (lo + zd) / 2 + 0.05],
                    [wb - 0.14, zd], [yin, zd + 0.03], fwd[6], fwd[7]])
    fb = fwd * (1 - g) + box * g
    # aft: two nacelles, a channel between them, a flat shelf out to the booms
    tn = ss_((x - ix1) / (xn - ix1))
    rny, rnz = 0.60, 0.70
    sn = float(np.interp(f_, [0.62, 0.8, 0.95, 1.0], [1.0, 1.0, 0.9, 0.86]))
    zn = nzc + 0.14 * (1 - ss_((f_ - 0.8) / 0.15))
    zsh = min(zn + 0.05, zt - 0.5)                          # (the shelf out to the booms, about level with the nozzles' axes)
    af = np.array([[0, zn - rnz * sn + 0.2], [ny_, zn - rnz * sn], [ny_ + rny * sn * 0.95, zn - 0.12], [wb, zsh + 0.1],
                   [wb - 0.14, zt - 0.16], [wb * 0.5, zt - 0.02], [min(SILL_HW, wb * 0.3), zt], [0, zt + 0.0]])
    # blends: radome -> forebody over 2.4..3.4 m, forebody -> aft over the wing root
    wr = ss_((x - 0.10 * L) / 2.4)
    A = rnd * (1 - wr) + fb * wr
    A = A * (1 - tn) + af * tn
    # the dorsal fairing: from under the canopy's high back, a narrow spine sloping down to the deck over 3.5 m
    hd = DORSAL_H * ss_((x - (X_C1 - 0.6)) / 0.6) * (1 - ss_((x - X_C1) / 3.5))
    if hd > 0:
        A = A.copy(); A[7, 1] += hd; A[6] = [A[6, 0] * (1 - 0.25 * hd / DORSAL_H), A[6, 1] + hd * 0.55]
    return A
def section(x):
    P = anchors(x)
    full = np.concatenate([P, P[-2:0:-1] * [-1, 1]])     # (round the far side: spine back down to the keel)
    cnt = SEG + SEG[::-1]
    c = catmull(full, cnt)
    return np.stack([np.full(len(c), X(x)), c[:, 0], c[:, 1]], 1)
v, f = loft([section(x) for x in xs_]); fus = mesh_obj('fuselage', v, f)
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
RAKE, LIP = 0.35, 0.05
for sg, name in ((1, 'intake_l'), (-1, 'intake_r')):
    yo_ = float(np.interp(IXD + 0.6, sx, body)) + 0.015
    out = rrect(yi0, yo_, zi0, zi1, 0.14); inn = rrect(yi0 + LIP, yo_ - LIP, zi0 + LIP, zi1 - LIP, 0.10)
    rk = lambda z: -RAKE * (z - zi0) / (zi1 - zi0)                   # (the rake: the top forward)
    def ring(P, x0, t_rake):
        return np.stack([X(x0 + rk(P[:, 1]) * t_rake), sg * P[:, 0], P[:, 1]], 1)
    x_join = IXD + 1.0
    outer_rings = [ring(out, x, 1 - (x - ix0) / (x_join - ix0)) for x in np.linspace(ix0, x_join, 6)]
    inner_rings = [ring(inn, x, 1 - (x - ix0) / (x_join - ix0)) for x in np.linspace(ix0, IXD - 0.02, 4)]
    # one loop list: the outer skin from the joint forward to the lip, round the lip, the inner wall back to the plug
    rings = outer_rings[::-1] + inner_rings
    v, f = loft(rings, cap0=False, cap1=True)
    if sg < 0: f = [q[::-1] for q in f]
    ob = mesh_obj(name, v, f, subsurf=1)
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
ci = ~np.isnan(csill); cx = sx[ci]; cs = g1(median_filter(csill[ci], 9), 3, mode='nearest'); ct = g1(median_filter(ctop[ci], 9), 3, mode='nearest')
x_ws0, x_ws1 = float(cx[0]), float(cx[0]) + 0.95            # the windscreen: from the canopy's front, 0.95 m long
x_c1 = float(cx[-1])                                         # the canopy's end
sill_at = lambda x: float(np.interp(x, cx, cs)); top_at = lambda x: float(np.interp(x, cx, ct))
w_sill = lambda x: SILL_HW
frames, glass_objs, inner = [], [], []
def ring_ws(x):
    """the windscreen's section: flat front panel on top, two side panels down to the sill, the corners rounded a little"""
    t = (x - x_ws0) / (x_ws1 - x_ws0); zs = sill_at(x); zt = zs + 0.05 + (top_at(x_ws1) - zs - 0.05) * t ** 0.85
    ws = w_sill(x); wt = ws * (0.45 + 0.15 * t)
    pts = [(ws, zs), (ws * 0.97, zs + (zt - zs) * 0.45), (wt * 1.08, zt - 0.06), (wt, zt), (0, zt + 0.015), (-wt, zt), (-wt * 1.08, zt - 0.06), (-ws * 0.97, zs + (zt - zs) * 0.45), (-ws, zs)]
    return np.array([[X(x), y, z] for y, z in pts])
def ring_can(x, k=24):
    zs = sill_at(x); zt = top_at(x); ws = w_sill(x)
    a = np.linspace(0, np.pi, k); e = 2 / 2.4
    return np.stack([np.full(k, X(x)), ws * np.sign(np.cos(a)) * np.abs(np.cos(a)) ** e, zs + (zt - zs) * np.abs(np.sin(a)) ** e], 1)
def shell(name, rings, close_front=False):
    n = len(rings[0]); verts = np.concatenate(rings); faces = []
    for i in range(len(rings) - 1):
        for j in range(n - 1):
            q = i * n + j; faces.append([q, q + 1, q + 1 + n, q + n])
    ob = mesh_obj(name, verts, faces, subsurf=1)
    sol = ob.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.015; sol.offset = 1.0
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
for i in range(1, 9, 1):
    pass
r0 = ring_ws(x_ws1); tube('ws_arch', r0, 0.04)
for j in (2, 6):                                             # (the windscreen's two corner bars)
    tube(f'ws_bar{j}', [ring_ws(x)[j] for x in np.linspace(x_ws0, x_ws1, 6)], 0.03)
x_bow = x_ws1 + (x_c1 - x_ws1) * 0.47
tube('canopy_bow', ring_can(x_bow), 0.035); tube('canopy_front', ring_can(x_ws1 + 0.03), 0.03)
for side in (0, -1):
    tube(f'rail{side}', [ring_can(x)[side] for x in np.linspace(x_ws0, x_c1, 20)], 0.045)
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
box('tub', (X((x_ws0 + x_c1) / 2), 0, zs_mid - 0.3), ((x_c1 - x_ws0) * 0.95, w_sill((x_ws0 + x_c1) / 2) * 1.8, 0.62))
for k, xs_seat in enumerate([x_ws1 + 0.75, x_bow + 0.75]):
    z0 = sill_at(xs_seat) - 0.5                                                              # (the seat pan half a metre under the sill)
    box(f'seat{k}', (X(xs_seat + 0.25), 0, z0 + 0.55), (0.35, 0.62, 1.0))                     # (its back and headrest)
    box(f'coaming{k}', (X(xs_seat - 0.75), 0, sill_at(xs_seat - 0.75) + 0.05), (0.35, w_sill(xs_seat) * 1.4, 0.18))
    ball(f'helmet{k}', (X(xs_seat - 0.05), 0, sill_at(xs_seat) + 0.42), 0.15, 'helmet')
    box(f'crew{k}', (X(xs_seat - 0.05), 0, sill_at(xs_seat) + 0.02), (0.32, 0.5, 0.5), 'flight_suit')

# ---- an airfoil loft through planform stations
def airfoil(nc=28, t=0.05):
    # NACA 00xx, closed loop from the trailing edge over the top and back under (x 0..1)
    b = 0.5 * (1 - np.cos(np.linspace(0, np.pi, nc)))
    yt = 5 * t * (0.2969 * np.sqrt(b) - 0.1260 * b - 0.3516 * b ** 2 + 0.2843 * b ** 3 - 0.1036 * b ** 4)
    up = np.stack([b[::-1], yt[::-1]], 1); lo = np.stack([b[1:-1], -yt[1:-1]], 1)
    return np.concatenate([up, lo])
def surface(name, stations, place, t_root, t_tip, n_sec=10, subsurf=2):
    """stations: (s, le, te) along the span; place(s, chord_x, thick) -> 3D points"""
    s_ = np.array([q[0] for q in stations]); le = np.array([q[1] for q in stations]); te = np.array([q[2] for q in stations])
    te = np.maximum(te, le + 0.15)
    # (sections at even spans and at every station, so a dogtooth or a clipped tip keeps its corner)
    ss = np.unique(np.round(np.concatenate([np.linspace(s_[0], s_[-1], n_sec), s_]), 4))
    rings = []
    for k, s in enumerate(ss):
        a = airfoil(t=t_root + (t_tip - t_root) * (s - ss[0]) / (ss[-1] - ss[0]))
        l, tr = float(np.interp(s, s_, le)), float(np.interp(s, s_, te)); c = tr - l
        rings.append(place(s, l + a[:, 0] * c, a[:, 1] * c))
    v, f = loft(rings, cap0=True, cap1=True)
    ob = mesh_obj(name, v, f, subsurf=subsurf)
    # (the trailing edge creased: subdivision keeps it sharp)
    n = len(rings[0]); me = ob.data; te_pairs = {(k * n, (k + 1) * n) for k in range(len(rings) - 1)}
    ev = np.zeros(len(me.edges) * 2, int); me.edges.foreach_get('vertices', ev); ev = ev.reshape(-1, 2)
    cr = me.attributes.new('crease_edge', 'FLOAT', 'EDGE')
    cr.data.foreach_set('value', [1.0 if (min(a, b), max(a, b)) in te_pairs else 0.0 for a, b in ev])
    return ob

wz = M['wing']['z']; ws = [q for q in M['wing']['stations_y_le_te']]
# (the wing's root inside the fuselage, its last station a little short of the tip's rounding)
ws = [[max(ws[0][0] - 0.5, 1.0), ws[0][1] + 0.6, ws[0][2]]] + ws[1:]
for sgn, name in ((1, 'wing_l'), (-1, 'wing_r')):
    an = math.radians(M['wing'].get('anhedral_deg', 0.0))
    surface(name, ws, lambda s, cxs, th, sgn=sgn, an=an: np.stack([X(cxs), np.full(len(cxs), sgn * s), wz + th + (s - 2.2) * math.tan(an)], 1), 0.055, 0.035)
tz = M['tailplane']['z']; ts = M['tailplane']['stations_y_le_te']
for sgn, name in ((1, 'stab_l'), (-1, 'stab_r')):
    surface(name, [[ts[0][0] - 0.6, ts[0][1], ts[0][2]]] + ts[1:], lambda s, cxs, th, sgn=sgn: np.stack([X(cxs), np.full(len(cxs), sgn * s), tz + th], 1), 0.045, 0.03)
fr = M['fin']; fy, cant = fr['root_y'], math.radians(fr['cant_deg']); fz0 = fr['stations_z_le_te'][0][0]
fs = [[fz0 - 0.5, fr['stations_z_le_te'][0][1] - 0.3, fr['stations_z_le_te'][0][2]]] + fr['stations_z_le_te'][1:]
for sgn, name in ((1, 'fin_l'), (-1, 'fin_r')):
    surface(name, fs, lambda s, cxs, th, sgn=sgn: np.stack([X(cxs), sgn * (fy + (s - fz0) * math.tan(cant)) + th * math.cos(cant), np.full(len(cxs), s) - sgn * th * math.sin(cant) * 0], 1), 0.08, 0.03)

# the fins' squared tip caps (the type's antenna fairings)
def clay_box(name, c, size, bevel=0.03):
    bpy.ops.mesh.primitive_cube_add(size=1); ob = bpy.context.active_object; ob.name = name; ob.data.name = name
    ob.scale = size; ob.location = c; bpy.context.collection.objects.unlink(ob); col.objects.link(ob)
    bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = bevel; bv.segments = 3
    ob.data.polygons.foreach_set('use_smooth', [True] * len(ob.data.polygons)); return ob
ftip = fr['stations_z_le_te'][-1]
for sgn, name in ((1, 'fin_cap_l'), (-1, 'fin_cap_r')):
    clay_box(name, (X((ftip[1] + ftip[2]) / 2 + 0.12), sgn * fy, ftip[0] + 0.06), (ftip[2] - ftip[1] + 0.22, 0.12, 0.13), 0.04)
# the tail booms: outboard of the engines, under the fins, carrying the tailplanes' pivots, ending in a point at the
# nozzles' exits
for sgn, name in ((1, 'boom_l'), (-1, 'boom_r')):
    a_ = np.linspace(0, 2 * np.pi, 24, endpoint=False); yb, zb_ = sgn * 1.68, tz + 0.02
    def bring(x, k): return np.stack([np.full(24, X(x)), yb + 0.2 * k * np.cos(a_), zb_ + 0.3 * k * np.sin(a_)], 1)
    xb_ = np.linspace(X_END - 1.6, L - 0.05, 9); kk = np.clip((L - 0.05 - xb_) / 1.3, 0.08, 1.0) ** 0.6
    v, f = loft([bring(x, k) for x, k in zip(xb_, kk)], cap0=True, cap1=True); mesh_obj(name, v, f, subsurf=2)
# the conformal fuel tanks (the strike version's): along the ducts' outer sides under the wing, from behind the intakes
# to the nacelles, a rounded box 0.45 m proud, its ends faired
def cft_ring(x, sg):
    y0 = float(np.interp(x, sx, body)) - 0.1
    k = min(ss_((x - CFT0) / 1.2), 1 - ss_((x - (CFT1 - 1.6)) / 1.6)) * 0.85 + 0.15
    yc, zc_ = y0 + 0.24, 0.9; hw_, hh_ = 0.24 * (0.4 + 0.6 * k), 0.58 * (0.5 + 0.5 * k)
    a_ = np.linspace(0, 2 * np.pi, 28, endpoint=False); pe = 2 / 3.2
    return np.stack([np.full(28, X(x)), sg * (yc + hw_ * np.sign(np.cos(a_)) * np.abs(np.cos(a_)) ** pe), zc_ + hh_ * np.sign(np.sin(a_)) * np.abs(np.sin(a_)) ** pe], 1)
CFT0, CFT1 = IXD + 1.3, 0.71 * L
for sg, name in ((1, 'cft_l'), (-1, 'cft_r')):
    v, f = loft([cft_ring(x, sg) for x in np.linspace(CFT0, CFT1, 22)], cap0=True, cap1=True); mesh_obj(name, v, f, subsurf=2)

# ---- nozzles: cans with a dark recess
for q, name in zip(M['nozzles'], ('nozzle_l', 'nozzle_r')):
    a = np.linspace(0, 2 * np.pi, 32, endpoint=False); r = q['r']
    ring = lambda x, rr: np.stack([np.full(32, X(x)), q['y'] + rr * np.cos(a), q['z'] + rr * np.sin(a)], 1)
    v, f = loft([ring(L - 2.2, r * 1.02), ring(L - 0.6, r), ring(L - 0.05, r * 0.92), ring(L - 0.05, r * 0.82), ring(L - 0.6, r * 0.78)], cap0=False, cap1=True)
    mesh_obj(name, v, f, subsurf=1)

# ---- clay, sun and sky, cameras
clay = bpy.data.materials.new('clay'); clay.use_nodes = True
bs = clay.node_tree.nodes['Principled BSDF']; bs.inputs['Base Color'].default_value = (0.42, 0.44, 0.46, 1); bs.inputs['Roughness'].default_value = 0.55
dark = bpy.data.materials.new('dark'); dark.use_nodes = True; dark.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.02, 0.02, 0.02, 1)
glass = bpy.data.materials.new('glass'); glass.use_nodes = True; gb = glass.node_tree.nodes['Principled BSDF']
gb.inputs['Base Color'].default_value = (0.05, 0.07, 0.09, 1); gb.inputs['Roughness'].default_value = 0.03; gb.inputs['Coat Weight'].default_value = 1
glass.blend_method = 'BLEND'
gb.inputs['Transmission Weight'].default_value = 1.0; gb.inputs['IOR'].default_value = 1.5; gb.inputs['Base Color'].default_value = (0.55, 0.62, 0.66, 1)
gb.inputs['Roughness'].default_value = 0.02
def solid_mat(name, rgb, rough):
    m = bpy.data.materials.new(name); m.use_nodes = True; b_ = m.node_tree.nodes['Principled BSDF']
    b_.inputs['Base Color'].default_value = rgb + (1,); b_.inputs['Roughness'].default_value = rough; return m
mats = {'dark': solid_mat('cockpit', (0.03, 0.03, 0.035), 0.7), 'helmet': solid_mat('helmet', (0.55, 0.56, 0.5), 0.45),
        'flight_suit': solid_mat('suit', (0.17, 0.19, 0.12), 0.85), 'frame': solid_mat('frame', (0.12, 0.13, 0.14), 0.5)}
inner_names = {o.name: m for o, m in inner}
for ob in col.objects:
    if ob.type not in ('MESH', 'CURVE'): continue
    m = (glass if ob.name in ('canopy', 'windscreen') else dark if ob.name.endswith('_mouth') else mats['frame'] if ob in frames
         else mats[inner_names[ob.name]] if ob.name in inner_names else clay)
    ob.data.materials.append(m)
    for ib, mi_ in intake_dark:
        if ob is ib: ob.data.materials.append(dark); ob.data.polygons.foreach_set('material_index', mi_)
    if ob is fus:                                              # (the intake mouths: the second material, dark)
        ob.data.materials.append(dark); mi = np.zeros(len(ob.data.polygons), int); mi[mouth_faces] = 1
        ob.data.polygons.foreach_set('material_index', mi.tolist())
world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
sky = world.node_tree.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(50); sky.sun_rotation = math.radians(30)
world.node_tree.links.new(sky.outputs['Color'], world.node_tree.nodes['Background'].inputs['Color'])
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.3
_fill = bpy.data.lights.new('ground_bounce', 'SUN'); _fill.energy = float(os.environ.get('FILL', 0.6)); _fill.color = (0.85, 0.78, 0.66)
_fo = bpy.data.objects.new('ground_bounce', _fill); _fo.rotation_euler = (math.radians(180), 0, 0); scene.collection.objects.link(_fo)
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.use_denoising = True
scene.view_settings.view_transform = 'AgX'; scene.view_settings.exposure = -1.0
scene.render.film_transparent = True
args = sys.argv[1:]
if '--blend' in args:
    bpy.ops.wm.save_as_mainfile(filepath=str(pathlib.Path(args[args.index('--blend') + 1]).resolve()))
    print('saved blend')
if '--render' in args:
    out = pathlib.Path(args[args.index('--render') + 1]); out.mkdir(parents=True, exist_ok=True)
    import os
    scene.cycles.samples = int(os.environ.get('SAMPLES', 32)); scene.render.resolution_x = scene.render.resolution_y = int(os.environ.get('RES', 900))
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
    if os.environ.get('SHOTS') == 'intake': shots = [(150, -5, 0, 'i'), (125, -12, 0, 'i'), (170, 8, 0, 'i'), (100, 0, 0, 'i')]
    if os.environ.get('SHOTS') == 'canopy': shots = [(60, -20, 0, 'c'), (120, -15, 0, 'c'), (90, -3, 0, 'c'), (160, -10, 0, 'c'), (30, 15, 0, 'p'), (120, 20, 0, 'p')]
    for az, el, roll, kind in shots:
        piv.rotation_euler = (math.radians(roll), 0, 0)
        a, e = math.radians(az), math.radians(el)
        if kind == 'p':
            cam.data.type = 'PERSP'; cam.data.lens = 300; cam.data.sensor_width = 36; D = 250
        elif kind in ('c', 'i'):                               # (close on the cockpit, on the intake)
            cam.data.type = 'PERSP'; cam.data.lens = 300; cam.data.sensor_width = 36; D = 95
        else:
            cam.data.type = 'ORTHO'; cam.data.ortho_scale = L * 1.05; D = 200
        d = Vector((-math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), -math.sin(e)))
        tgt = (Vector((X((X_WS0 + X_C1) / 2), 0, 2.0)) if kind == 'c' else Vector((X(ix0 + 0.4), 1.5, 0.9)) if kind == 'i' else Vector((0, 0, zc)))
        cam.location = d * D + tgt
        up = 'Y' if kind != 'top' else 'Y'
        cam.rotation_euler = (-d).to_track_quat('-Z', up).to_euler()   # (looking along -d, at the target)
        if kind == 'top': cam.rotation_euler = (0, 0, math.radians(90))
        scene.render.filepath = str(out / f'{kind}_{az}_{el}_{roll}.png'); bpy.ops.render.render(write_still=True); print('shot', kind, az, el, flush=True)
