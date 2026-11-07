# فيلمورا: منطقة العمليات `ops3_tahrin`

منطقة 4.4 × 4.4 كم حول موقع على خريطة فيلمورا، بنفس طريقة وادي سيرين (`ops1`).

## الملفات

- `sheet.jpg`: المنطقة كاملة ومقسومة على الشبكة. اسم كل قطعة `عمود_صف`، تبدأ من فوق يسار.
- `source/zoom1.png`: المنطقة كاملة، 1254 بكسل، حوالي 3.5 م للبكسل.
- `source/x3/0_0.png` إلى `2_2.png`: القطع التسع. كل قطعة 1.47 كم، مكبّرة إلى 1254 بكسل وناعمة، لأن أصلها صورة قمر صناعي بدقة 10 م.

الصور من Sentinel-2 (Copernicus)، مدوّرة 180° مثل خريطة فيلمورا، فالشمس فيها جاية من فوق يسار.

## المطلوب منك

ارفع كل قطعة من `source/x3` على مولّد الصور مع نص الطلب اللي تحت، كل مرة قطعة وحدة، واحفظ الناتج بنفس الاسم في
`assets/originals/velmora/ops3_tahrin/x3/` (مثلًا `x3/1_1.png`)، بحجم 1254 × 1254.

المهم إن المولّد **يحافظ على مكان كل شي**، ويضيف تفاصيل بس، لأن القطع تنركّب جنب بعض على صورة الدولة.

```
Use case: photorealistic-natural. Asset type: game terrain tile, true-colour satellite orthophoto.
Re-render the attached image as a sharp, high-resolution true-nadir satellite photograph of the SAME place, about
1.2 m per pixel (the tile is 1.47 km across). Keep EVERYTHING exactly where it is in the attached image: every road,
street, field, building block, shoreline, wadi and light or dark area must stay in the same position, size and shape
(the result must line up with the attached image when laid over it). Only ADD the fine detail a 1 m satellite image
shows: a flat arid sandy plain: wind ripples and low dunes in the sand, scattered desert scrub and acacias, small irrigated fields and farm compounds only where the attached image shows green or dark patches, dirt tracks; no new fields where the attached image is plain sand. Sun from the upper left, short soft shadows toward the lower right. Natural muted colours
matching the attached image; no haze, no clouds, no colour cast.
True orthographic top-down view: no perspective, no horizon, no tilt, no 3D relief rendering.
No text, labels, grid, borders, frame, watermark. No vehicles, no people.
1:1 square, 1254 x 1254.
```
