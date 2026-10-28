# صورة الدفاع الجوي SA-8 (المطلوبة من صاحب المشروع)

صورة واحدة بنفس طريقة صور الأهداف في `targets/` (03–16)، تُحفظ باسم `targets/17_sa8_osa.png`، ثم:
`tools/make_ground.py` (يُضاف لها سطر `('sa8', '17_sa8_osa.png', 9.1)`) وتُحذف في اللعبة استعارة صورة الـ BTR-80
(`Object.assign(T, { sa8: T.btr80, ... })`).

```
Use case: photorealistic-natural. Asset type: isolated top-down game vehicle sprite.
Photorealistic orthographic top-down photograph, true nadir straight down from directly above, of a SINGLE 9K33 Osa
(SA-8 Gecko) self-propelled surface-to-air missile vehicle in faded desert tan, worn and dusty. Front at the TOP of
the image. Accurate details: boat-shaped amphibious six-wheeled hull (SIX large wheels, three visible at each side),
the large rotating turret on the rear two-thirds carrying the folded rectangular search radar antenna on its top, the
round tracking radar dish at the turret front between two side groups of THREE missile containers (SIX in all,
pointing forward), cab windows at the front, engine grilles. True proportions: 9.1 m long, 2.8 m wide.
Correct top-down geometry with no perspective or horizon, no visible front vertical face.
Lit by sun from upper left; self-shading only on the vehicle. Isolated on perfectly flat pure black RGB(0,0,0)
background. Entire vehicle centered inside frame with wide black margin on ALL sides; nothing touching edges.
1:1 SQUARE, requested 1254 x 1254. No ground, no cast/contact shadow on background, no text, markings, logo,
watermark, no other objects.
```
