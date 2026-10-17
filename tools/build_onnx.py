# Load Real-ESRGAN x4plus weights without torch and emit an equivalent ONNX graph.
import sys, zipfile, pickle, collections, numpy as np, onnx
from onnx import helper, TensorProto, numpy_helper
pth, out = sys.argv[1], sys.argv[2]
z = zipfile.ZipFile(pth)
prefix = z.namelist()[0].split('/')[0]
DT = {'FloatStorage': np.float32, 'HalfStorage': np.float16, 'LongStorage': np.int64}
def rebuild(storage, offset, size, stride, *a):
    arr, = [storage]
    n = int(np.prod(size)) if size else 1
    return np.lib.stride_tricks.as_strided(arr[offset:], shape=size, strides=[s * arr.itemsize for s in stride]).copy() if size else arr[offset:offset+1].copy()
class U(pickle.Unpickler):
    def find_class(self, mod, name):
        if name == '_rebuild_tensor_v2': return rebuild
        if mod == 'collections' and name == 'OrderedDict': return collections.OrderedDict
        if name.endswith('Storage'): return name
        if mod == 'torch._utils' and name == '_rebuild_parameter': return lambda d, *a: d
        return super().find_class(mod, name)
    def persistent_load(self, pid):
        _, stype, key, loc, numel = pid
        return np.frombuffer(z.read(f'{prefix}/data/{key}'), dtype=DT[stype])
sd = U(z.open(f'{prefix}/data.pkl')).load()
if 'params_ema' in sd: sd = sd['params_ema']
print('tensors', len(sd))
inits, nodes = [], []
cnt = [0]
def nm(p): cnt[0] += 1; return f'{p}_{cnt[0]}'
def conv(x, key):
    w, b = sd[key + '.weight'].astype(np.float32), sd[key + '.bias'].astype(np.float32)
    inits.append(numpy_helper.from_array(w, key + '.w')); inits.append(numpy_helper.from_array(b, key + '.b'))
    o = nm('c'); nodes.append(helper.make_node('Conv', [x, key + '.w', key + '.b'], [o], pads=[1,1,1,1], kernel_shape=[3,3])); return o
def lrelu(x): o = nm('l'); nodes.append(helper.make_node('LeakyRelu', [x], [o], alpha=0.2)); return o
def cat(xs): o = nm('cat'); nodes.append(helper.make_node('Concat', xs, [o], axis=1)); return o
def add(a, b): o = nm('add'); nodes.append(helper.make_node('Add', [a, b], [o])); return o
inits.append(numpy_helper.from_array(np.array(0.2, np.float32), 'k02'))
def scale(a): o = nm('mul'); nodes.append(helper.make_node('Mul', [a, 'k02'], [o])); return o
inits.append(numpy_helper.from_array(np.array([1, 1, 2, 2], np.float32), 'up2'))
def up(x): o = nm('up'); nodes.append(helper.make_node('Resize', [x, '', 'up2'], [o], mode='nearest', nearest_mode='floor', coordinate_transformation_mode='asymmetric')); return o
def rdb(x, p):
    x1 = lrelu(conv(x, p + '.conv1')); x2 = lrelu(conv(cat([x, x1]), p + '.conv2'))
    x3 = lrelu(conv(cat([x, x1, x2]), p + '.conv3')); x4 = lrelu(conv(cat([x, x1, x2, x3]), p + '.conv4'))
    x5 = conv(cat([x, x1, x2, x3, x4]), p + '.conv5'); return add(scale(x5), x)
src = 'input'
if sd['conv_first.weight'].shape[1] == 12:
    # torch pixel_unshuffle(x, 2): (1,C,H,W) -> (1,C*4,H/2,W/2), channel-major
    inits.append(numpy_helper.from_array(np.array([1, 3, -1, 2, 0, 2], np.int64), 'shp6'))
    o1 = nm('rs'); nodes.append(helper.make_node('Reshape', ['input', 'shp6'], [o1]))
    # need H/2 explicitly: use Shape ops
    nodes.pop()
    sh = nm('shape'); nodes.append(helper.make_node('Shape', ['input'], [sh]))
    for nmv, idx in (('hh', 2), ('ww', 3)):
        inits.append(numpy_helper.from_array(np.array([idx], np.int64), 'i' + nmv))
    hv = nm('h'); nodes.append(helper.make_node('Gather', [sh, 'ihh'], [hv], axis=0))
    wv = nm('w'); nodes.append(helper.make_node('Gather', [sh, 'iww'], [wv], axis=0))
    inits.append(numpy_helper.from_array(np.array([2], np.int64), 'two'))
    h2 = nm('h2'); nodes.append(helper.make_node('Div', [hv, 'two'], [h2]))
    w2 = nm('w2'); nodes.append(helper.make_node('Div', [wv, 'two'], [w2]))
    inits.append(numpy_helper.from_array(np.array([1, 3], np.int64), 'pre'))
    s6 = nm('s6'); nodes.append(helper.make_node('Concat', ['pre', h2, 'two', w2, 'two'], [s6], axis=0))
    r6 = nm('r6'); nodes.append(helper.make_node('Reshape', ['input', s6], [r6]))
    tr = nm('tr'); nodes.append(helper.make_node('Transpose', [r6], [tr], perm=[0, 1, 3, 5, 2, 4]))
    inits.append(numpy_helper.from_array(np.array([1, 12], np.int64), 'pre12'))
    s4 = nm('s4'); nodes.append(helper.make_node('Concat', ['pre12', h2, w2], [s4], axis=0))
    src = nm('unsh'); nodes.append(helper.make_node('Reshape', [tr, s4], [src]))
    inits[:] = [t for t in inits if t.name != 'shp6']
feat = conv(src, 'conv_first')
h = feat
nb = len({k.split('.')[1] for k in sd if k.startswith('body.')})
for i in range(nb):
    o = rdb(rdb(rdb(h, f'body.{i}.rdb1'), f'body.{i}.rdb2'), f'body.{i}.rdb3'); h = add(scale(o), h)
feat = add(feat, conv(h, 'conv_body'))
feat = lrelu(conv(up(feat), 'conv_up1')); feat = lrelu(conv(up(feat), 'conv_up2'))
o = conv(lrelu(conv(feat, 'conv_hr')), 'conv_last')
nodes.append(helper.make_node('Identity', [o], ['output']))
g = helper.make_graph(nodes, 'rrdb', [helper.make_tensor_value_info('input', TensorProto.FLOAT, [1, 3, None, None])],
                      [helper.make_tensor_value_info('output', TensorProto.FLOAT, [1, 3, None, None])], inits)
m = helper.make_model(g, opset_imports=[helper.make_opsetid('', 13)]); m.ir_version = 8
onnx.checker.check_model(m); onnx.save(m, out); print('blocks', nb, 'saved', out)
