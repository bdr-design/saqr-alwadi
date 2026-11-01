"""The source pack for an operations area on the Velmora country, for the owner to regenerate at 3x (as Wadi Seren's,
assets/originals/velmora/ops1): the area, 4.41 km square round a site, cut out of the country at 10 m and turned as
the game's country is.

  python3 tools/make_ops_pack.py <c10.npy> <ops dir> <x5> <y5> <kind>
    <x5>, <y5>: the area's centre in level-5 px of the game's country (maps/<id>/country/5, the c10 turned 180 deg)
    <kind>: port | plain | town, which way the generator's prompt leans

writes assets/originals/velmora/<ops dir>/: sheet.jpg (the area with its 3 x 3 grid and the pieces' names),
source/zoom1.png (the whole area, 1254 px, ~3.5 m a pixel), source/x3/<col>_<row>.png (the nine pieces, 1.47 km
each, enlarged to 1254 px), README_AR.md (what to do, the prompt). The generated pieces go back in x3/.
"""
import sys, pathlib
import numpy as np
from PIL import Image, ImageDraw, ImageFont
root = pathlib.Path(__file__).resolve().parent.parent
c10 = np.load(sys.argv[1], mmap_mode='r'); N = c10.shape[0]
ops, x5, y5, kind = sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
S = 441                                                     # the area's side at 10 m (4.41 km, as Seren's)
x0, y0 = x5 - S // 2, y5 - S // 2
# (the game's country is the c10 turned 180 deg: its pixel (x, y) is c10's (N-1-x, N-1-y))
crop = np.ascontiguousarray(c10[N - y0 - S:N - y0, N - x0 - S:N - x0][::-1, ::-1])
out = root / 'assets' / 'originals' / 'velmora' / ops; (out / 'source' / 'x3').mkdir(parents=True, exist_ok=True); (out / 'x3').mkdir(exist_ok=True)
area = Image.fromarray(crop)
area.resize((1254, 1254), Image.LANCZOS).save(out / 'source' / 'zoom1.png')
P = S // 3
for r in range(3):
    for c in range(3):
        area.crop((c * P, r * P, (c + 1) * P, (r + 1) * P)).resize((1254, 1254), Image.BICUBIC).save(out / 'source' / 'x3' / f'{c}_{r}.png')
sh = area.resize((1254, 1254), Image.LANCZOS); d = ImageDraw.Draw(sh)
try: f = ImageFont.truetype(str(root / 'assets' / 'originals' / 'fonts' / 'ibm-plex-sans-arabic-latin-700-normal.woff2'), 40)
except Exception: f = None
for k in (1, 2): d.line([(k * 418, 0), (k * 418, 1254)], fill=(255, 220, 60), width=3); d.line([(0, k * 418), (1254, k * 418)], fill=(255, 220, 60), width=3)
for r in range(3):
    for c in range(3): d.text((c * 418 + 14, r * 418 + 10), f'{c}_{r}', fill=(255, 220, 60), font=f)
sh.save(out / 'sheet.jpg', quality=88)
LEAN = {
 'port': ('a coastal port town on an arid coast: the city blocks of small flat-roofed houses, streets and lanes, the '
          'quay, breakwater and piers, warehouses and container stacks by the port, a few palms; the sea clear '
          'turquoise near the shore and deep blue beyond, small waves', 'small fishing boats only where the attached '
          'image shows a small light speck on the water'),
 'plain': ('a flat arid sandy plain: wind ripples and low dunes in the sand, scattered desert scrub and acacias, small '
           'irrigated fields and farm compounds only where the attached image shows green or dark patches, dirt tracks',
           'no new fields where the attached image is plain sand'),
 'town': ('a rural town in arid highlands: its dense core of small flat-roofed houses and lanes, terraced and irrigated '
          'fields round it, wadis with gravel beds, a dirt airstrip and walled compounds where the attached image shows '
          'them', 'keep the airstrip and the compounds exactly as they are'),
}[kind]
prompt = f"""Use case: photorealistic-natural. Asset type: game terrain tile, true-colour satellite orthophoto.
Re-render the attached image as a sharp, high-resolution true-nadir satellite photograph of the SAME place, about
1.2 m per pixel (the tile is 1.47 km across). Keep EVERYTHING exactly where it is in the attached image: every road,
street, field, building block, shoreline, wadi and light or dark area must stay in the same position, size and shape
(the result must line up with the attached image when laid over it). Only ADD the fine detail a 1 m satellite image
shows: {LEAN[0]}; {LEAN[1]}. Sun from the upper left, short soft shadows toward the lower right. Natural muted colours
matching the attached image; no haze, no clouds, no colour cast.
True orthographic top-down view: no perspective, no horizon, no tilt, no 3D relief rendering.
No text, labels, grid, borders, frame, watermark. No vehicles, no people.
1:1 square, 1254 x 1254."""
(out / 'README_AR.md').write_text(f"""# فيلمورا: منطقة العمليات `{ops}`

منطقة 4.4 × 4.4 كم حول موقع على خريطة فيلمورا، بنفس طريقة وادي سيرين (`ops1`).

## الملفات

- `sheet.jpg`: المنطقة كاملة ومقسومة على الشبكة. اسم كل قطعة `عمود_صف`، تبدأ من فوق يسار.
- `source/zoom1.png`: المنطقة كاملة، 1254 بكسل، حوالي 3.5 م للبكسل.
- `source/x3/0_0.png` إلى `2_2.png`: القطع التسع. كل قطعة 1.47 كم، مكبّرة إلى 1254 بكسل وناعمة، لأن أصلها صورة قمر صناعي بدقة 10 م.

الصور من Sentinel-2 (Copernicus)، مدوّرة 180° مثل خريطة فيلمورا، فالشمس فيها جاية من فوق يسار.

## المطلوب منك

ارفع كل قطعة من `source/x3` على مولّد الصور مع نص الطلب اللي تحت، كل مرة قطعة وحدة، واحفظ الناتج بنفس الاسم في
`assets/originals/velmora/{ops}/x3/` (مثلًا `x3/1_1.png`)، بحجم 1254 × 1254.

المهم إن المولّد **يحافظ على مكان كل شي**، ويضيف تفاصيل بس، لأن القطع تنركّب جنب بعض على صورة الدولة.

```
{prompt}
```
""", encoding='utf8')
print('wrote', out)
