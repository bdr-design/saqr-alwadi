"""Silak's compound, cut by the join of pieces 2_0 and 2_1 (its top half drawn differently above the line): above the join
the ground just north of it brought down over the cut half, and the south wall's line laid along the join as its north
wall. Run from the repo root; tools/make_ops.py silak pastes compound_fixed.png at (4218, 1536) of the mosaic."""
import numpy as np
from PIL import Image
from scipy import ndimage
src = 'assets/originals/velmora/ops2_silak/fix/compound_src.png'
C = np.asarray(Image.open(src).convert('RGB'), np.float32)
out = C.copy()
# 1. above the join: the cut half and its bright spill replaced by the ground just north of it (112 px up), feathered
#    at the left, right and top, hard at the join where the compound's new north wall stands
x0, x1, y0, y1, up = 352, 648, 398, 512, 114
m = np.zeros(C.shape[:2], np.float32); m[y0:y1, x0:x1] = 1
F = 16
m = ndimage.uniform_filter(m, F)
m[505:512, x0 + F:x1 - F] = 1                      # (full strength along the join itself)
m[512:] = 0
shifted = np.zeros_like(C); shifted[y0 - F:y1] = C[y0 - F - up:y1 - up]
out = out * (1 - m[..., None]) + shifted * m[..., None]
# 2. the north wall: the south wall's own line (its top light edge and shadow) laid along the join
wall = C[627:634, 382:635]
out[509:516, 382:635] = wall
Image.fromarray(out.clip(0, 255).astype(np.uint8)).save('assets/originals/velmora/ops2_silak/fix/compound_fixed.png')
