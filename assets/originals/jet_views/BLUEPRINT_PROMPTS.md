# ZF-25: صور المخطط (blueprint) لبناء الطيارة مجسمًا

الطيارة بروح الـ F-15 لكن تصميمها خاص باسم ZF-25، بلا شعار ولا علم ولا رقم. من هذه الصور يُبنى مجسم خارج اللعبة، وتُصنع منه صور الطيارة لكل زاوية وميلان، والسلاح قطع منفصلة تُركَّب وتسقط.

## الطريقة
- **`bp_top` معتمدة** (`bp/bp_top.png`، بعد تعديل فتحات الهواء).
- صور الطيارة الأربع: كل صورة في محادثة جديدة، ارفق `bp_top` المعتمدة والصق النص كاملًا.
- السلاح (`w_*`) بلا صورة مرفقة، كل واحد في محادثة جديدة.
- كل المقاسات في النصوص مقيسة من `bp_top` بالبكسل: نسب من طول الطيارة تبدأ من رأس الأنف، حتى تتطابق الصور كلها.

## المقاسات (من `bp_top`)
| | من طول الطيارة | بالأمتار |
|---|---|---|
| الطول | 100% | 19.4 |
| عرض الجناح | 70% | 13.0 |
| الارتفاع الكلي (أسفل البطن إلى رأس الذيل) | 29% | 5.6 |
| القمرة | من 10% إلى 42% | |
| فتحتا الهواء | من 38% إلى 46% | |
| بداية الجناح عند الجسم (الحافة الأمامية) | 45% | |
| طرف الجناح (من الأمام إلى الخلف) | 69% إلى 76% | |
| الحافة الخلفية للجناح (مستقيمة) | 77% | |
| عرض الجسم عند فتحتي الهواء | 22% | 4.3 |
| الذيلان العموديان (القاعدة) | من 78% إلى 98% | |
| الجنيحان الأفقيان | من 84% إلى 99%، عرضهما 65% من عرض الجناح | |
| فوهتا المحرك | تنتهيان عند 100% | |

## `bp_bottom`

```
Keep exactly the same aircraft design as the attached image.
The attached image is the approved strictly orthographic TOP view of the ZF-25. Make the matching strictly orthographic BOTTOM view of the SAME aircraft, as a technical drawing set: the same outline, the same size and the same position in the frame, so that the two images can be laid one over the other. The bottom view is the top view's outline mirrored left to right: nose pointing straight UP the image, centreline exactly vertical in the middle, the nose tip at 3% of the image height and the nozzle ends at 94% of the image height, wingspan 63% of the image width, exactly as in the attached image.
What the underside shows: the flat wide belly of a heavy twin-engine strike fighter; the underside of the two large rectangular intakes on the fuselage sides from 38% to 46% of the aircraft's length (counted from the nose tip), their dark openings facing forward and not visible from below; closed nose-gear doors behind the nose and two closed main-gear doors under the fuselage at the wing roots; four small empty pylons under the wings, two on each side, at about 55% and 72% of each half-span, their front ends at the wing's leading edge; one empty centreline pylon; the underside of the two all-moving tailplanes; the two round nozzles at the tail. Underside in a slightly lighter, plainer grey than the top, weathered, dusty, with panel lines, access panels and rivets. Clean configuration: no weapons, no fuel tanks. Absolutely no markings: no insignia, numbers, letters, text, logos or badges.
Perfectly orthographic, camera at infinity directly below, no perspective at all, the aircraft perfectly level. Photorealistic, real metal and paint, sharp. Soft, even, shadowless light, like a bright overcast day: no harsh shadows, no glare. Background: one flat solid colour, pure magenta #FF00FF, everywhere outside the aircraft, clean sharp edges, no shadow, no gradient, no glow. No text, no labels, no lines. Square 1:1, PNG, the same size as the attached image.
```

## `bp_side`

```
Keep exactly the same aircraft design as the attached image.
The attached image is the approved strictly orthographic TOP view of the ZF-25. Make the matching strictly orthographic SIDE view (left profile) of the SAME aircraft, as a technical drawing set, with the same proportions measured along its length (all positions below are fractions of the aircraft's length counted from the nose tip):
- Nose pointing to the LEFT. The aircraft's length fills 88% of the image width, centred left to right, the aircraft vertically centred.
- Total height from the lowest point of the belly to the top of the vertical tails is 29% of its length (landing gear up).
- A long pointed nose; the fuselage top line almost straight and level from the canopy to the tail, like a heavy strike fighter.
- The two-seat tandem bubble canopy from 10% to 42% of the length, one long clear canopy with a frame between the two seats, two crew in helmets visible; the canopy top is the highest point of the fuselage.
- The large rectangular, angular engine intake on the side of the fuselage from 38% to 46% of the length, its top edge just below the canopy's rear frame, its lower edge level with the belly; the intake front edge raked forward at the bottom; a long conformal fuel tank blended along the side behind it.
- The high-mounted wing seen edge-on as a thin line on the upper half of the fuselage, from 45% (root leading edge) to 77% (trailing edge).
- Two vertical tails one behind the other (only the nearer one fully seen), their root from 78% to 98% of the length on top of the rear fuselage, their leading edge swept back, rising to the total height above.
- The horizontal tailplane seen edge-on at the bottom of the rear fuselage, from 84% to 99%.
- The two round engine nozzles at the very tail, ending at 100%.
- Empty underwing pylons visible below the wing line; clean configuration, no weapons.
Two-tone low-visibility grey camouflage with soft, low-contrast patches, the same tones as the attached image, weathered and slightly dusty, panel lines and rivets. Absolutely no markings: no insignia, numbers, letters, text, logos or badges.
Perfectly orthographic, camera at infinity exactly side-on, no perspective at all, the aircraft perfectly level. Photorealistic, real metal and paint, sharp. Soft, even, shadowless light, like a bright overcast day: no harsh shadows, no glare. Background: one flat solid colour, pure magenta #FF00FF, everywhere outside the aircraft, clean sharp edges, no shadow, no gradient, no glow. No text, no labels, no lines. Square 1:1, PNG, the same size as the attached image.
```

## `bp_front`

```
Keep exactly the same aircraft design as the attached image.
The attached image is the approved strictly orthographic TOP view of the ZF-25. Make the matching strictly orthographic FRONT view of the SAME aircraft, seen exactly head-on, as a technical drawing set:
- The wingspan fills 88% of the image width, centred. Total height, from the lowest point of the belly to the top of the tails, is 43% of the wingspan. Wings exactly horizontal, landing gear up.
- In the centre: the round tip of the pointed nose with the two-seat canopy rising behind it, the canopy top 20% of the wingspan above the belly.
- On either side of the fuselage below the canopy: the two large rectangular, angular engine intakes, each about 8% of the wingspan wide and 15% of the wingspan tall, their outer edges 16% of the wingspan from the centreline; dark inside, NOT round, no rings, no fans visible; they must not look like exhaust nozzles.
- The fuselage with its conformal tanks is 31% of the wingspan wide at the intakes.
- The high-mounted wings straight out to the left and right at the level of the top of the intakes, thin, with two small empty pylons under each wing at about 55% and 72% of each half-span.
- Behind the wings: the two vertical tails standing on the rear fuselage, their roots 13% of the wingspan either side of the centreline, canted outward by about 15 degrees, reaching the total height; the two horizontal tailplanes straight out below them, spanning 65% of the wingspan.
Clean configuration, no weapons. Two-tone low-visibility grey, the same tones as the attached image, weathered, panel lines. Absolutely no markings: no insignia, numbers, letters, text, logos or badges.
Perfectly orthographic, camera at infinity exactly in front, no perspective at all, left and right perfectly symmetrical. Photorealistic, real metal and paint, sharp. Soft, even, shadowless light, like a bright overcast day: no harsh shadows, no glare. Background: one flat solid colour, pure magenta #FF00FF, everywhere outside the aircraft, clean sharp edges, no shadow, no gradient, no glow. No text, no labels, no lines. Square 1:1, PNG, the same size as the attached image.
```

## `bp_rear`

```
Keep exactly the same aircraft design as the attached image.
The attached image is the approved strictly orthographic TOP view of the ZF-25. Make the matching strictly orthographic REAR view of the SAME aircraft, seen exactly from behind, as a technical drawing set:
- The wingspan fills 88% of the image width, centred. Total height, from the lowest point of the belly to the top of the tails, is 43% of the wingspan. Wings exactly horizontal, landing gear up.
- In the centre: the two round engine nozzles side by side, touching, each about 9% of the wingspan across, their centres 5% of the wingspan either side of the centreline, dark inside with the nozzle petals visible.
- The rear fuselage around and above them, 34% of the wingspan wide; the top of the canopy just visible above the fuselage in the middle.
- The two vertical tails standing on the rear fuselage, their roots 13% of the wingspan either side of the centreline, canted outward by about 15 degrees, reaching the total height.
- The two all-moving horizontal tailplanes straight out to the sides at the level of the nozzles, spanning 65% of the wingspan.
- The high-mounted wings straight out to the left and right above them, thin, with two small empty pylons under each wing at about 55% and 72% of each half-span.
Clean configuration, no weapons. Two-tone low-visibility grey, the same tones as the attached image, weathered, heat-stained metal around the nozzles, panel lines. Absolutely no markings: no insignia, numbers, letters, text, logos or badges.
Perfectly orthographic, camera at infinity exactly behind, no perspective at all, left and right perfectly symmetrical. Photorealistic, real metal and paint, sharp. Soft, even, shadowless light, like a bright overcast day: no harsh shadows, no glare. Background: one flat solid colour, pure magenta #FF00FF, everywhere outside the aircraft, clean sharp edges, no shadow, no gradient, no glow. No text, no labels, no lines. Square 1:1, PNG, the same size as the attached image.
```

## `w_lgb` (قنبلة الليزر LB-5، 500 رطل)

```
A strictly orthographic technical side view of a modern 500 lb laser-guided bomb, generic and unbranded, as a technical drawing: 3.3 m long, body 0.27 m across (the body's diameter is 8% of its length).
From nose to tail: a laser seeker head with a small glass window at the very front; a short ring with four small movable steering canards just behind it; the guidance section; the olive-drab streamlined bomb body with two suspension lugs on top 0.36 m apart at its middle; at the rear a tail kit with four folding wings shown OPEN, each about 0.4 m long, swept back, seen two from the side (one up, one down).
Real, weathered, slightly scuffed olive-drab paint, a small yellow band near the nose. Absolutely no text, no numbers, no stencils, no logos.
View: exactly from the side, camera at infinity, perfectly orthographic, no perspective, nose pointing to the LEFT, perfectly horizontal, centred; its length fills 90% of the image width.
Photorealistic, sharp. Soft, even, shadowless light, like a bright overcast day. Background: one flat solid colour, pure magenta #FF00FF, clean sharp edges, no shadow, no gradient. No text, no labels, no lines. Square 1:1, 1024 x 1024, PNG.
```

## `w_gps` (قنبلة GPS من نوع GB-5، 500 رطل)

```
A strictly orthographic technical side view of a modern 500 lb GPS-guided bomb, generic and unbranded, as a technical drawing: 2.4 m long, body 0.27 m across (the body's diameter is 11% of its length).
From nose to tail: a smooth pointed ogive nose; the olive-drab low-drag bomb body with two suspension lugs on top 0.36 m apart at its middle; a narrow strake running along each side of the middle of the body; at the rear a grey tail guidance kit with four fixed swept tail fins, about 0.3 m long each, seen two from the side (one up, one down).
Real, weathered, slightly scuffed paint, a small yellow band near the nose. Absolutely no text, no numbers, no stencils, no logos.
View: exactly from the side, camera at infinity, perfectly orthographic, no perspective, nose pointing to the LEFT, perfectly horizontal, centred; its length fills 90% of the image width.
Photorealistic, sharp. Soft, even, shadowless light, like a bright overcast day. Background: one flat solid colour, pure magenta #FF00FF, clean sharp edges, no shadow, no gradient. No text, no labels, no lines. Square 1:1, 1024 x 1024, PNG.
```

## `w_msl` (صاروخ برق)

```
A strictly orthographic technical side view of a modern air-to-ground guided missile, generic and unbranded, as a technical drawing: 2.5 m long, body 0.3 m across (the body's diameter is 12% of its length).
From nose to tail: a rounded nose with a clear glass dome seeker; a white-grey cylindrical body of the same diameter all along; four long, narrow, low cruciform wings along the middle half of the body, each standing out about 0.2 m, seen two from the side (one up, one down); four small swept control fins at the very tail; a launch rail shoe on top of the body at its middle.
Real, slightly weathered paint, a thin brown band near the middle. Absolutely no text, no numbers, no stencils, no logos.
View: exactly from the side, camera at infinity, perfectly orthographic, no perspective, nose pointing to the LEFT, perfectly horizontal, centred; its length fills 90% of the image width.
Photorealistic, sharp. Soft, even, shadowless light, like a bright overcast day. Background: one flat solid colour, pure magenta #FF00FF, clean sharp edges, no shadow, no gradient. No text, no labels, no lines. Square 1:1, 1024 x 1024, PNG.
```
