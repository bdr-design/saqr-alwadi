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
hw = core.copy()
u = np.linspace(0, 1, 90); xs_ = L * (0.5 - 0.5 * np.cos(np.pi * u)); xs_[0] = 0.04; xs_[-1] = L - 0.25
xs_ = np.unique(np.concatenate([xs_, ix0 + np.array([-0.02, 0.0, 0.05, 0.1, 0.15, 0.2, 0.3])]))
NH = 26
def section(x):
    wc = max(float(np.interp(x, sx, hw)), 0.03); zt = float(np.interp(x, sx, spine)); zb = float(np.interp(x, sx, belly))
    zt = max(zt, zb + 0.06); zc, hh = (zt + zb) / 2, (zt - zb) / 2
    p = float(np.interp(x / L, [0, 0.25, 0.5, 1], [2.0, 2.3, 2.8, 2.6]))
    # the duct: from the mouth, out to the body's width there (the top view's), down to the belly
    yo = 0.0
    if x >= ix0:
        ramp = min((x - ix0) / 0.2, 1.0) ** 0.5            # (a short steep step: the mouth faces forward, a thin lip seen from the side)
        yo = max(float(np.interp(x, sx, body)), wc) * ramp
    zim, him = (zi0 + zi1) / 2, (zi1 - zi0) / 2
    t = np.linspace(0, 1, NH); zz = zc + hh * np.cos(np.pi * t)
    w_core = wc * np.clip(1 - np.abs((zz - zc) / hh) ** p, 0, 1) ** (1 / p)
    if yo > 0:
        # (the duct's height: the mouth's, carried down to the belly and up into the shoulder aft)
        lo = min(zi0, zb + 0.02); hi = zi1 + (zt - 0.15 - zi1) * min(max((x - ix0) / 3.0, 0), 1)
        zm, hm = (lo + hi) / 2, max((hi - lo) / 2, 0.05)
        w_duct = yo * np.clip(1 - np.abs((zz - zm) / hm) ** 6, 0, 1) ** (1 / 6)
        w = (w_core ** 8 + w_duct ** 8) ** (1 / 8)
    else:
        w = w_core
    left = np.stack([np.full(NH, X(x)), w, zz], 1)
    right = np.stack([np.full(NH - 2, X(x)), -w[1:-1][::-1], zz[1:-1][::-1]], 1)
    return np.concatenate([left, right])
v, f = loft([section(x) for x in xs_]); fus = mesh_obj('fuselage', v, f)
# the mouths: the forward-facing faces where the duct swells out of the body, over the mouth's height, dark (the
# inside of the intake); a plane stuck there stood out of the side
mouth_mat_index = []
me = fus.data; npol = len(me.polygons)
cen = np.zeros(npol * 3); me.polygons.foreach_get('center', cen); cen = cen.reshape(-1, 3)
nrm = np.zeros(npol * 3); me.polygons.foreach_get('normal', nrm); nrm = nrm.reshape(-1, 3)
xb = L / 2 - cen[:, 0]
near = (xb > ix0 - 0.05) & (xb < ix0 + 0.25)
mouth = near & (np.abs(cen[:, 1]) > np.interp(xb, sx, core) * 0.9) & (cen[:, 2] > zi0 - 0.05) & (cen[:, 2] < zi1 + 0.1) & (np.abs(nrm[:, 0]) > 0.6)   # (the sign: the loft's faces may face in; the ramp faces forward either way)
mouth_faces = np.nonzero(mouth)[0]
print('intake mouth faces', len(mouth_faces))

# ---- canopy: a raked windscreen (a flat front panel between two side panels, framed), the main canopy over both
# seats (one long bubble, a bow between the seats, rails along its sides), clear tinted glass; under it the cockpit:
# its tub, two ejection seats, two crew, the instrument coamings
from scipy.ndimage import gaussian_filter1d as g1, median_filter
ci = ~np.isnan(csill); cx = sx[ci]; cs = g1(median_filter(csill[ci], 9), 3, mode='nearest'); ct = g1(median_filter(ctop[ci], 9), 3, mode='nearest')
x_ws0, x_ws1 = float(cx[0]), float(cx[0]) + 0.95            # the windscreen: from the canopy's front, 0.95 m long
x_c1 = float(cx[-1])                                         # the canopy's end
sill_at = lambda x: float(np.interp(x, cx, cs)); top_at = lambda x: float(np.interp(x, cx, ct))
w_sill = lambda x: float(np.interp(x, sx, core)) * 0.9
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
box('tub', (X((x_ws0 + x_c1) / 2), 0, zs_mid - 0.15), ((x_c1 - x_ws0) * 0.95, w_sill((x_ws0 + x_c1) / 2) * 1.7, 0.35))
for k, xs_seat in enumerate([x_ws1 + 0.75, x_bow + 0.75]):
    z0 = sill_at(xs_seat) - 0.25
    box(f'seat{k}', (X(xs_seat + 0.25), 0, z0 + 0.55), (0.35, 0.62, 1.0))                     # (its back and headrest)
    box(f'coaming{k}', (X(xs_seat - 0.75), 0, sill_at(xs_seat - 0.75) + 0.05), (0.35, w_sill(xs_seat) * 1.4, 0.18))
    ball(f'helmet{k}', (X(xs_seat - 0.05), 0, sill_at(xs_seat) + 0.62), 0.15, 'helmet')
    box(f'crew{k}', (X(xs_seat - 0.05), 0, sill_at(xs_seat) + 0.25), (0.32, 0.5, 0.45), 'flight_suit')

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
    ss = np.linspace(s_[0], s_[-1], n_sec)
    rings = []
    for k, s in enumerate(ss):
        a = airfoil(t=t_root + (t_tip - t_root) * k / (n_sec - 1))
        l, tr = float(np.interp(s, s_, le)), float(np.interp(s, s_, te)); c = tr - l
        rings.append(place(s, l + a[:, 0] * c, a[:, 1] * c))
    v, f = loft(rings, cap0=True, cap1=True)
    return mesh_obj(name, v, f, subsurf=subsurf)

wz = M['wing']['z']; ws = [q for q in M['wing']['stations_y_le_te']]
# (the wing's root inside the fuselage, its last station a little short of the tip's rounding)
ws = [[max(ws[0][0] - 0.5, 1.0), ws[0][1] + 0.6, ws[0][2]]] + ws[1:-1]
for sgn, name in ((1, 'wing_l'), (-1, 'wing_r')):
    an = math.radians(M['wing'].get('anhedral_deg', 0.0))
    surface(name, ws, lambda s, cxs, th, sgn=sgn, an=an: np.stack([X(cxs), np.full(len(cxs), sgn * s), wz + th + (s - 2.2) * math.tan(an)], 1), 0.055, 0.035)
tz = M['tailplane']['z']; ts = M['tailplane']['stations_y_le_te']
for sgn, name in ((1, 'stab_l'), (-1, 'stab_r')):
    surface(name, [[ts[0][0] - 0.6, ts[0][1], ts[0][2]]] + ts[:-1], lambda s, cxs, th, sgn=sgn: np.stack([X(cxs), np.full(len(cxs), sgn * s), tz + th], 1), 0.045, 0.03)
fr = M['fin']; fy, cant = fr['root_y'], math.radians(fr['cant_deg']); fz0 = fr['stations_z_le_te'][0][0]
fs = [[fz0 - 0.5, fr['stations_z_le_te'][0][1] - 0.3, fr['stations_z_le_te'][0][2]]] + fr['stations_z_le_te'][:-1]
for sgn, name in ((1, 'fin_l'), (-1, 'fin_r')):
    surface(name, fs, lambda s, cxs, th, sgn=sgn: np.stack([X(cxs), sgn * (fy + (s - fz0) * math.tan(cant)) + th * math.cos(cant), np.full(len(cxs), s) - sgn * th * math.sin(cant) * 0], 1), 0.08, 0.03)

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
    if ob is fus:                                              # (the intake mouths: the second material, dark)
        ob.data.materials.append(dark); mi = np.zeros(len(ob.data.polygons), int); mi[mouth_faces] = 1
        ob.data.polygons.foreach_set('material_index', mi.tolist())
world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
sky = world.node_tree.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(50); sky.sun_rotation = math.radians(30)
world.node_tree.links.new(sky.outputs['Color'], world.node_tree.nodes['Background'].inputs['Color'])
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.3
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
    if os.environ.get('SHOTS') == 'canopy': shots = [(60, -20, 0, 'c'), (120, -15, 0, 'c'), (90, -3, 0, 'c'), (160, -10, 0, 'c'), (30, 15, 0, 'p'), (120, 20, 0, 'p')]
    for az, el, roll, kind in shots:
        piv.rotation_euler = (math.radians(roll), 0, 0)
        a, e = math.radians(az), math.radians(el)
        if kind == 'p':
            cam.data.type = 'PERSP'; cam.data.lens = 300; cam.data.sensor_width = 36; D = 250
        elif kind == 'c':                                      # (close on the cockpit)
            cam.data.type = 'PERSP'; cam.data.lens = 300; cam.data.sensor_width = 36; D = 95
        else:
            cam.data.type = 'ORTHO'; cam.data.ortho_scale = L * 1.05; D = 200
        d = Vector((-math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), -math.sin(e)))
        tgt = Vector((X(5.6), 0, 2.0)) if kind == 'c' else Vector((0, 0, zc))
        cam.location = d * D + tgt
        up = 'Y' if kind != 'top' else 'Y'
        cam.rotation_euler = (-d).to_track_quat('-Z', up).to_euler()   # (looking along -d, at the target)
        if kind == 'top': cam.rotation_euler = (0, 0, math.radians(90))
        scene.render.filepath = str(out / f'{kind}_{az}_{el}_{roll}.png'); bpy.ops.render.render(write_still=True); print('shot', kind, az, el, flush=True)
