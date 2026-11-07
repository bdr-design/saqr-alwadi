# فيلمورا: منطقة العمليات الأولى (وادي سيرين)

منطقة 4.4 × 4.4 كم في **مخرج وادي سيرين** من جبال دراكوس إلى سهل تاهرين، وتشيلها نفس الطريقة اللي سويت بها المسرح الحالي (`terrain/theatre_zoom1_x3`).

## الملفات

- `sheet.jpg`: المنطقة كاملة ومقسومة على الشبكة. اسم كل قطعة `عمود_صف`، تبدأ من فوق يسار.
- `source/zoom1.png`: المنطقة كاملة، 1254 بكسل، حوالي 3.5 م للبكسل.
- `source/x3/0_0.png` إلى `2_2.png`: القطع التسع. كل قطعة 1.47 كم، مكبّرة إلى 1254 بكسل وناعمة، لأن أصلها صورة قمر صناعي بدقة 10 م.

الصور من Sentinel-2 (Copernicus)، وهي مدوّرة 180° مثل خريطة فيلمورا، فالشمس فيها جاية من فوق يسار.

## المطلوب منك

ارفع كل قطعة من `source/x3` على مولّد الصور مع نص الطلب اللي تحت، وكل مرة قطعة وحدة. احفظ الناتج بنفس الاسم في:
`assets/originals/velmora/ops1/x3/` (مثلاً `x3/1_1.png`). الحجم 1254 × 1254.

المهم إن المولّد **يحافظ على مكان كل شي**: الوديان والسلاسل والحقول والطرق. المطلوب منه يضيف تفاصيل بس، ما يغيّر شكل الأرض، لأن القطع تنركّب جنب بعض على صورة الدولة.

القطعة `1_2` تحت فيها بقعة بيضاء ورمادية، والأرجح إنها بحيرة سد أو أرض مالحة. خلّها زي ما هي.

```
Use case: photorealistic-natural. Asset type: game terrain tile, true-colour satellite orthophoto.
Re-render the attached image as a sharp, high-resolution true-nadir satellite photograph of the SAME place, about
1.2 m per pixel (the tile is 1.47 km across). Keep EVERYTHING exactly where it is in the attached image: every ridge,
spur, slope, wadi bed and its banks, every green patch, field, track and light or dark area must stay in the same
position, size and shape (the result must line up with the attached image when laid over it). Only ADD the fine
detail a 1 m satellite image shows: individual rocks and boulders on the slopes, gravel and sand bars in the wadi
beds, single acacia and sidr bushes and small trees with tiny shadows, stone terraces where the attached image is
green, narrow footpaths and dirt tracks, a few small flat-roofed stone houses only where the attached image shows a
small light speck. Arid Arabian mountains and wadis. Sun from the upper left, short soft shadows toward the lower
right. Natural muted colours matching the attached image; no haze, no clouds, no colour cast.
True orthographic top-down view: no perspective, no horizon, no tilt, no 3D relief rendering.
No text, labels, grid, borders, frame, watermark. No vehicles, no people, no large modern buildings.
1:1 square, 1254 x 1254.
```

## بعدها

لما تخلص القطع التسع أركّبها على صورة الدولة: أطابق ألوانها وأدمج حدودها وأطابق مكانها مع الأصل. وبعدها أصوّر لك المنطقة من الحاضن ومن القمرة قبل أي اعتماد.

## المصدر

Contains modified Copernicus Sentinel data (2023–2025). Copernicus DEM © DLR e.V. 2010–2014 and © Airbus Defence and
Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA.
