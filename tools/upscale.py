# Tiled Real-ESRGAN upscale with overlap; usage: upscale.py model.onnx in.png out.png [x,y,w,h | -] [scale 4|2]
import sys, time, numpy as np, onnxruntime as ort
from PIL import Image
model, src, dst = sys.argv[1:4]
im = Image.open(src).convert('RGB')
if len(sys.argv) > 4 and sys.argv[4] != '-': x, y, w, h = map(int, sys.argv[4].split(',')); im = im.crop((x, y, x + w, y + h))
a = np.asarray(im).astype(np.float32) / 255.0
H, W, _ = a.shape
so = ort.SessionOptions(); so.intra_op_num_threads = 4
s = ort.InferenceSession(model, so, providers=['CPUExecutionProvider'])
S = int(sys.argv[5]) if len(sys.argv) > 5 else 4
T, P = (192, 12) if S == 4 else (384, 16)
out = np.zeros((H * S, W * S, 3), np.float32)
t0 = time.time(); tiles = [(ty, tx) for ty in range(0, H, T) for tx in range(0, W, T)]
for i, (ty, tx) in enumerate(tiles):
    y0, x0, y1, x1 = max(0, ty - P), max(0, tx - P), min(H, ty + T + P), min(W, tx + T + P)
    inp = a[y0:y1, x0:x1].transpose(2, 0, 1)[None]
    r = s.run(None, {'input': inp})[0][0].transpose(1, 2, 0)
    oy, ox = (ty - y0) * S, (tx - x0) * S
    th, tw = (min(ty + T, H) - ty) * S, (min(tx + T, W) - tx) * S
    out[ty * S:ty * S + th, tx * S:tx * S + tw] = r[oy:oy + th, ox:ox + tw]
    print(f'tile {i+1}/{len(tiles)} {time.time()-t0:.0f}s', flush=True)
Image.fromarray((np.clip(out, 0, 1) * 255 + 0.5).astype(np.uint8)).save(dst)
print('done', dst, out.shape, f'{time.time()-t0:.0f}s')
