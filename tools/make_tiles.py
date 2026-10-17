"""Rebuild the map tile pyramid (tiles/<level>/<x>_<y>.jpg, 1024 px tiles, levels 0..3 = x1..x8).

Inputs:
  assets/originals/valley_map.png   original map (1672x941)
  valley_x4_raw.png / valley_x8_raw.png  Real-ESRGAN outputs (tools/upscale.py), not stored in git (too large)
The AI detail is blended half-and-half with a plain enlargement and softened, so the map reads like a real
sensor image rather than an over-sharpened illustration.
"""
import os, sys
from PIL import Image, ImageFilter
Image.MAX_IMAGE_PIXELS = None
orig_p, x4_p, x8_p, out = sys.argv[1:5]
orig = Image.open(orig_p).convert('RGB')
T = 1024
def save_level(img, L, q):
    d = f'{out}/{L}'; os.makedirs(d, exist_ok=True); W, H = img.size
    for ty in range((H + T - 1) // T):
        for tx in range((W + T - 1) // T):
            img.crop((tx * T, ty * T, min(W, (tx + 1) * T), min(H, (ty + 1) * T))).save(f'{d}/{tx}_{ty}.jpg', quality=q, optimize=True)
x8 = Image.open(x8_p).convert('RGB')
save_level(Image.blend(x8, orig.resize(x8.size, Image.BICUBIC), 0.5).filter(ImageFilter.GaussianBlur(1.1)), 3, 78)
del x8
l2 = Image.open(x4_p).convert('RGB')
l2 = Image.blend(l2, orig.resize(l2.size, Image.BICUBIC), 0.45).filter(ImageFilter.GaussianBlur(0.6))
save_level(l2, 2, 82)
save_level(l2.resize((3344, 1882), Image.LANCZOS), 1, 85)
save_level(Image.blend(orig, l2.resize((1672, 941), Image.LANCZOS), 0.5), 0, 88)
