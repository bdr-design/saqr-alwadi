"""The ZF-25 in Blender (bpy, outside the game): its pieces (tools/make_jet2.py: build/jet2) smoothed, each coloured
from the blueprint pictures that show it (per vertex: where each picture falls on it and how much of it), painted
metal and canopy glass, under a real sun and sky (Cycles). Photographed from any angle and bank.

  python3 tools/make_jet2.py && <python 3.11 with bpy> tools/blender_jet.py <out dir> [az,el,roll ...]
  az 0 behind it, 90 its left side, 180 in front; el degrees below it; roll right wing down +
"""
import json, math, pathlib, sys
import numpy as np
import bpy

root = pathlib.Path(__file__).resolve().parent.parent
J = root / 'build' / 'jet2'; OUT = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else J / 'blender'); OUT.mkdir(parents=True, exist_ok=True)
VIEWS = [tuple(map(float, (s + ',1').split(',')[:4])) for s in sys.argv[2:]] or [(30, 15, 0, 1), (60, 30, 0, 1), (90, 10, 0, 1), (120, 20, 0, 1), (150, 15, 0, 1), (45, 25, 35, 1), (100, 30, -30, 1), (0, 60, 0, 1)]
meta = json.loads((J / 'pieces.json').read_text()); L, S, H = meta['len'], meta['span'], meta['hgt']
VK = ['top', 'bottom', 'side', 'front', 'rear']; VN = ['bp_' + k for k in VK]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
imgs = {n: bpy.data.images.load(str(J / f'tex_{n}.png')) for n in VN}

def uv_of(k, P):
    """where a vertex falls in picture k (0..1 across its own picture, v up)"""
    b = meta['views']['bp_' + k]; x0, y0, x1, y1 = b['box']; w, h = b['w'], b['h']
    fx = P[:, 0] / L; fyl = (S / 2 - P[:, 1]) / S; fz = (H - P[:, 2]) / H
    f = {'top': (fyl, fx), 'bottom': (1 - fyl, fx), 'side': (fx, fz), 'front': (1 - fyl, fz), 'rear': (fyl, fz)}[k]
    u = (x0 + f[0] * (x1 - x0)) / w; v = 1 - (y0 + f[1] * (y1 - y0)) / h
    return np.stack([u, v], 1)

def weights(N, use):
    ss = lambda a, b, x: np.clip((x - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((x - a) / (b - a), 0, 1))
    w = np.stack([ss(0.15, 1, N[:, 2]), ss(0.15, 1, -N[:, 2]), ss(0.15, 1, np.abs(N[:, 1])), ss(0.5, 1, -N[:, 0]), ss(0.5, 1, N[:, 0])], 1) ** 2
    w *= np.array([1.0 if k in use else 0.0 for k in VK])
    s = w.sum(1, keepdims=True)
    # (a surface no picture faces: the one it faces most of those allowed)
    fb = np.zeros_like(w); fb[np.arange(len(w)), np.argmax(np.where(np.array([k in use for k in VK]), np.abs(np.stack([N[:, 2], -N[:, 2], np.abs(N[:, 1]), -N[:, 0], N[:, 0]], 1)) + 1, 0), 1)] = 1
    return np.where(s > 1e-3, w / np.maximum(s, 1e-6), fb)

def material(name, use, glass=False):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nd = nt.nodes; ln = nt.links
    bs = nd['Principled BSDF']
    acc = None
    wa = nd.new('ShaderNodeVertexColor'); wa.layer_name = 'WA'; wb = nd.new('ShaderNodeVertexColor'); wb.layer_name = 'WB'
    sa = nd.new('ShaderNodeSeparateColor'); ln.new(wa.outputs['Color'], sa.inputs['Color'])
    sb = nd.new('ShaderNodeSeparateColor'); ln.new(wb.outputs['Color'], sb.inputs['Color'])
    wsock = [sa.outputs[0], sa.outputs[1], sa.outputs[2], sb.outputs[0], sb.outputs[1]]
    for i, k in enumerate(VK):
        if k not in use: continue
        uvn = nd.new('ShaderNodeUVMap'); uvn.uv_map = 'UV_' + k
        tx = nd.new('ShaderNodeTexImage'); tx.image = imgs['bp_' + k]; tx.interpolation = 'Cubic'; tx.extension = 'EXTEND'
        ln.new(uvn.outputs['UV'], tx.inputs['Vector'])
        mul = nd.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs['Factor'].default_value = 1.0
        ln.new(tx.outputs['Color'], mul.inputs[6]); cm = nd.new('ShaderNodeCombineColor')
        for c in range(3): ln.new(wsock[i], cm.inputs[c])
        ln.new(cm.outputs['Color'], mul.inputs[7])
        if acc is None: acc = mul.outputs[2]
        else:
            add = nd.new('ShaderNodeMix'); add.data_type = 'RGBA'; add.blend_type = 'ADD'; add.inputs['Factor'].default_value = 1.0
            ln.new(acc, add.inputs[6]); ln.new(mul.outputs[2], add.inputs[7]); acc = add.outputs[2]
    ln.new(acc, bs.inputs['Base Color'])
    if glass:
        bs.inputs['Roughness'].default_value = 0.05; bs.inputs['Coat Weight'].default_value = 1.0; bs.inputs['Coat Roughness'].default_value = 0.02
        bs.inputs['Specular IOR Level'].default_value = 0.9
    else:
        bs.inputs['Metallic'].default_value = 0.25; bs.inputs['Roughness'].default_value = 0.48
        bs.inputs['Coat Weight'].default_value = 0.15; bs.inputs['Coat Roughness'].default_value = 0.3
    return m

for p in meta['pieces']:
    raw = (J / f"{p['name']}.bin").read_bytes(); nv, nf = p['nv'], p['nf']
    P = np.frombuffer(raw, np.float32, nv * 3).reshape(-1, 3).astype(np.float64)
    N = np.frombuffer(raw, np.float32, nv * 3, nv * 12).reshape(-1, 3).astype(np.float64)
    F = np.frombuffer(raw, np.uint32, nf * 3, nv * 24).reshape(-1, 3)
    me = bpy.data.meshes.new(p['name'])
    # (in Blender's frame: x forward from the middle, y the left wing, z up from the middle)
    Pb = np.stack([L / 2 - P[:, 0], P[:, 1], P[:, 2] - H / 2], 1)
    me.from_pydata(Pb.tolist(), [], F.tolist()); me.update()
    w = weights(N, p['views'])
    for k in VK:
        if k not in p['views']: continue
        uv = uv_of(k, P); layer = me.uv_layers.new(name='UV_' + k)
        li = np.array([l.vertex_index for l in me.loops]); layer.data.foreach_set('uv', uv[li].ravel())
    for nm, cols in (('WA', w[:, :3]), ('WB', np.concatenate([w[:, 3:], np.zeros((nv, 1))], 1))):
        ca = me.color_attributes.new(nm, 'FLOAT_COLOR', 'POINT')
        ca.data.foreach_set('color', np.concatenate([cols, np.ones((nv, 1))], 1).astype(np.float32).ravel())
    me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    ob = bpy.data.objects.new(p['name'], me); scene.collection.objects.link(ob)
    ob.data.materials.append(material(p['name'], p['views'], glass=p['name'] == 'canopy'))
print('pieces in', len(meta['pieces']))

# the sky and the sun
world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
sky = world.node_tree.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(55); sky.sun_rotation = math.radians(35); sky.altitude = 2000; sky.air_density = 1.2; sky.dust_density = 2.0
world.node_tree.links.new(sky.outputs['Color'], world.node_tree.nodes['Background'].inputs['Color'])
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.22
scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = int(__import__('os').environ.get('SAMPLES', 48)); scene.cycles.use_denoising = True
scene.render.resolution_x = scene.render.resolution_y = int(__import__('os').environ.get('RES', 1000)); scene.render.film_transparent = True
scene.view_settings.view_transform = 'AgX'; scene.view_settings.look = 'AgX - Medium High Contrast'
piv = bpy.data.objects.new('piv', None); scene.collection.objects.link(piv)
for ob in list(scene.collection.objects):
    if ob.type == 'MESH': ob.parent = piv
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.lens = 300; cam.data.sensor_width = 36; cam.data.clip_start = 20; cam.data.clip_end = 2000
for az, el, roll, zoom in VIEWS:
    piv.rotation_euler = (math.radians(roll), 0, 0)
    a, e = math.radians(az), math.radians(el); D = L / 2 / math.tan(math.atan(18 / 300)) * 1.3 / zoom
    cam.location = (-math.cos(a) * math.cos(e) * D, math.sin(a) * math.cos(e) * D, -math.sin(e) * D)
    d = -np.array(cam.location); d /= np.linalg.norm(d)
    cam.rotation_euler = __import__('mathutils').Vector(d).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(OUT / (f'jet_{int(az)}_{int(el)}_{int(roll)}' + (f'_z{zoom:g}' if zoom != 1 else '') + '.png'))
    bpy.ops.render.render(write_still=True)
    print('shot', az, el, roll, flush=True)
