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
M = json.loads((root / 'assets' / 'originals' / 'jet_model' / 'measure.json').read_text().replace('NaN', 'null'))
L, SPAN, H = M['len'], M['span'], M['hgt']
st = M['stations']; sx = np.array(st['x'])
def prof(k): return np.array([np.nan if v is None else v for v in st[k]], float)
core, body, spine, belly = prof('core_hw'), prof('body_hw'), prof('spine'), prof('belly')
csill, ctop = prof('canopy_sill'), prof('canopy_top')
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

# ---- fuselage: sections along its length, denser at the nose and the tail
ix0, ix1 = M['intakes']['x0'], M['intakes']['x1']
hw = body.copy()
sel = (sx >= ix0) & (sx <= ix1 + 1.0)            # (where the intakes stand beside it, its own narrower body)
hw[sel] = np.interp(sx[sel], [ix0, ix1 + 1.0], [np.interp(ix0, sx, core), np.interp(ix1 + 1.0, sx, body)])
u = np.linspace(0, 1, 70); xs_ = L * (0.5 - 0.5 * np.cos(np.pi * u)); xs_[0] = 0.04; xs_[-1] = L - 0.25
NR = 32; th = np.linspace(0, 2 * np.pi, NR, endpoint=False)
rings = []
for x in xs_:
    w = max(float(np.interp(x, sx, hw)), 0.03); zt = float(np.interp(x, sx, spine)); zb = float(np.interp(x, sx, belly))
    zt, zb = max(zt, zb + 0.06), zb; zc, hh = (zt + zb) / 2, (zt - zb) / 2
    p = float(np.interp(x / L, [0, 0.25, 0.5, 1], [2.0, 2.4, 3.0, 2.8]))
    c, s = np.cos(th), np.sin(th)
    rings.append(np.stack([np.full(NR, X(x)), w * np.sign(c) * np.abs(c) ** (2 / p), zc + hh * np.sign(s) * np.abs(s) ** (2 / p)], 1))
v, f = loft(rings); fus = mesh_obj('fuselage', v, f)

# ---- intakes: either side, from their mouth to where they merge with the fuselage at the wing root
op = M['intakes']['openings_front'][0]; yi0, yi1 = sorted([op['y0'], op['y1']]); zi0, zi1 = op['z0'], op['z1']
yo = M['intakes']['outer_hw']
for sgn, name in ((1, 'intake_l'), (-1, 'intake_r')):
    rings = []
    for k, x in enumerate(np.linspace(ix0, ix1 + 1.2, 14)):
        rake = 0.55 * (1 - k / 13) if k == 0 else 0
        t = (x - ix0) / (ix1 + 1.2 - ix0)
        yin = float(np.interp(x, sx, hw)) - 0.05; yout = max(float(np.interp(x, sx, np.array(st['top_hw']))) if 'top_hw' in st else yo, yin + 0.3)
        z0 = zi0 - 0.05; z1 = zi1 + 0.05 * (1 - t)
        # a rounded box: 4 corners, 3 points a side
        pts = []
        for a in np.linspace(0, 1, 4)[:-1]: pts.append([yin + (yout - yin) * a, z1])
        for a in np.linspace(0, 1, 4)[:-1]: pts.append([yout, z1 + (z0 - z1) * a])
        for a in np.linspace(0, 1, 4)[:-1]: pts.append([yout + (yin - yout) * a, z0])
        for a in np.linspace(0, 1, 4)[:-1]: pts.append([yin, z0 + (z1 - z0) * a])
        pts = np.array(pts)
        xr = x + (rake * (pts[:, 1] - z0) / (z1 - z0) if k == 0 else 0)     # (the mouth raked: its top lip forward)
        rings.append(np.stack([X(np.full(len(pts), x) - (0.5 * (pts[:, 1] - z0) / (z1 - z0) if k == 0 else 0)), sgn * pts[:, 0], pts[:, 1]], 1))
    v, f = loft(rings, cap0=False, cap1=True)
    ob = mesh_obj(name, v, f, subsurf=1)
    bev = ob.modifiers.new('bevel', 'BEVEL'); bev.width = 0.05; bev.segments = 2; ob.modifiers.move(1, 0)
    # the mouth: a dark recess just inside it
    ry = (yi0 + yi1) / 2; rw = (yi1 - yi0) / 2; rz = (zi0 + zi1) / 2; rh = (zi1 - zi0) / 2
    bpy.ops.mesh.primitive_plane_add(size=1); mo = bpy.context.active_object; mo.name = name + '_mouth'
    mo.scale = (1, rw * 2 * 0.95, rh * 2 * 0.95); mo.rotation_euler = (0, math.radians(90), 0)
    mo.location = (X(ix0 + 0.6), sgn * ry, rz); bpy.context.collection.objects.unlink(mo); col.objects.link(mo)

# ---- canopy: a bubble over the sill, its width a share of the fuselage's there
ci = ~np.isnan(csill); cx = sx[ci]; cs = csill[ci]; ct = ctop[ci]
from scipy.ndimage import gaussian_filter1d as g1, median_filter
cs = g1(median_filter(cs, 9), 3, mode='nearest'); ct = g1(median_filter(ct, 9), 3, mode='nearest')
NC = 24; rings = []
for k, x in enumerate(np.linspace(cx[0], cx[-1], 30)):
    e = math.sin(min(k, 29 - k) / 6 * math.pi / 2) if min(k, 29 - k) < 6 else 1.0
    s0 = float(np.interp(x, cx, cs)); t0 = s0 + (float(np.interp(x, cx, ct)) - s0) * max(e, 0.05) ** 0.6
    a = np.linspace(0, np.pi, NC)
    # (its section: the front view's half-width at each height above the sill, scaled to this station's height)
    zz = s0 - 0.08 + (t0 - s0 + 0.08) * np.sin(a)
    fw = np.array(M['front_halfwidth_by_z']); top_f = fw[:, 0].max(); base_w = float(np.interp(s0, fw[::-1, 0], fw[::-1, 1]))
    hz = np.interp(top_f - (t0 - zz) * (top_f - s0) / max(t0 - s0, 0.05), fw[::-1, 0], fw[::-1, 1])
    w = np.minimum(np.minimum(hz, base_w), float(np.interp(x, sx, hw)) * 0.88) * max(e, 0.2) ** 0.5
    rings.append(np.stack([np.full(NC, X(x)), np.sign(np.cos(a)) * np.minimum(np.abs(np.cos(a)) * w.max(), w), zz], 1))
# (open loops: the canopy is a half shell; closed against the fuselage by its own sill below)
n = NC; verts = np.concatenate(rings); faces = []
for i in range(len(rings) - 1):
    for j in range(n - 1):
        a = i * n + j; faces.append([a, a + 1, a + 1 + n, a + n])
can = mesh_obj('canopy', verts, faces, subsurf=2)
sol = can.modifiers.new('thick', 'SOLIDIFY'); sol.thickness = 0.02

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
for ob in col.objects:
    ob.data.materials.append(glass if ob.name == 'canopy' else dark if ob.name.endswith('_mouth') else clay)
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
    for az, el, roll, kind in shots:
        piv.rotation_euler = (math.radians(roll), 0, 0)
        a, e = math.radians(az), math.radians(el)
        if kind == 'p':
            cam.data.type = 'PERSP'; cam.data.lens = 300; cam.data.sensor_width = 36; D = 250
        else:
            cam.data.type = 'ORTHO'; cam.data.ortho_scale = L * 1.05; D = 200
        d = Vector((-math.cos(a) * math.cos(e), math.sin(a) * math.cos(e), -math.sin(e)))
        cam.location = d * D + Vector((0, 0, zc))
        up = 'Y' if kind != 'top' else 'Y'
        cam.rotation_euler = (-d).to_track_quat('-Z', up).to_euler()
        if kind == 'top': cam.rotation_euler = (0, 0, math.radians(90))
        scene.render.filepath = str(out / f'{kind}_{az}_{el}_{roll}.png'); bpy.ops.render.render(write_still=True); print('shot', kind, az, el, flush=True)
