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

## الإصدار الثاني من الطلب (بعد مراجعة الجولة الأولى)

ملاحظات الجولة الأولى: الصخور تطلع **نقط باهتة متساوية المسافات** كأنها شبكة، والشجيرات بنفس الحجم والتباعد. سفوح `0_1` الداكنة فيها نقش **يشبه القشور**. المولّد زاد الخضرة على الأصل في `0_0` و`1_0`. وفيه خط أفقي واضح بين الصف 1 والصف 2 في العمود الأوسط. القطع `1_2` و`2_0` و`2_1` و`2_2` ما وصلت بدقتها الكاملة، والقطعة `2_1` أفتح من الأصل.

```
Use case: photorealistic-natural. Asset type: game terrain tile, true-colour satellite orthophoto.
Re-render the attached image as a sharp, high-resolution true-nadir satellite photograph of the SAME place, about
1.2 m per pixel (the tile is 1.47 km across). Keep EVERYTHING exactly where it is in the attached image: every ridge,
spur, slope, wadi bed and its banks, every green patch, field, track and light or dark area must stay in the same
position, size and shape (the result must line up with the attached image when laid over it).
Only ADD the fine detail a real 1 m satellite image shows, IRREGULAR and NATURAL:
- rocks and boulders of mixed sizes (1 to 4 m) scattered unevenly, dense on steep slopes and below cliffs, sparse on
  flats; NEVER an evenly spaced pattern of dots, NEVER a grid, NEVER the same mark repeated;
- bare rock outcrops and scree as continuous textured surfaces, not scales or tiles;
- acacia and sidr bushes of varying crown size (2 to 7 m), clustered along the wadi banks and gullies, few and far
  between on the dry slopes, each with a small shadow; NO more vegetation than the attached image shows: where the
  attached image is brown keep it brown;
- gravel and sand bars in the wadi beds, stone terraces only where the attached image is green, narrow footpaths and
  dirt tracks, a few small flat-roofed stone houses only where the attached image shows a small light speck.
Arid Arabian mountains and wadis. Sun from the upper left, short soft shadows toward the lower right. Keep the
attached image's overall brightness and colour exactly (not lighter, not darker, not greener); no haze, no clouds.
The edges of the tile continue straight into the neighbouring tiles: no vignette, no border darkening, no frame.
True orthographic top-down view: no perspective, no horizon, no tilt, no 3D relief rendering.
No text, labels, grid, borders, watermark. No vehicles, no people, no large modern buildings.
1:1 square, 1254 x 1254. PNG.
```

## بعدها

لما تخلص القطع التسع أركّبها على صورة الدولة: أطابق ألوانها وأدمج حدودها وأطابق مكانها مع الأصل. وبعدها أصوّر لك المنطقة من الحاضن ومن القمرة قبل أي اعتماد.

## المصدر

Contains modified Copernicus Sentinel data (2023–2025). Copernicus DEM © DLR e.V. 2010–2014 and © Airbus Defence and
Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA.
