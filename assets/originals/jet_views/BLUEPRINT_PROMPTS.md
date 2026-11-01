# ZF-25: صور المخطط (blueprint) لبناء الطيارة مجسمًا

الطيارة بروح الـ F-15 (ذيلان، محركان، جناح عالٍ، مقعدان، فتحتا هواء مستطيلتان على الجانبين) لكن تصميمها خاص باسم ZF-25، بلا شعار ولا علم ولا رقم.
من هذه الصور يُبنى مجسم خارج اللعبة، وتُصنع منه صور الطيارة لكل زاوية وميلان (كاميرا المراقب، الطيارة الواقفة في القاعدة)، والسلاح قطع منفصلة تُركَّب وتسقط.

## الطريقة
- **ولّد `bp_top` أولًا وأرسلها**، وبعد اعتمادها ولّد الباقي، كل صورة في محادثة جديدة: ارفق `bp_top` المعتمدة والصق النص كاملًا (يبدأ بـ `Keep exactly the same aircraft design as the attached image.`).
- السلاح (`w_*`) لا يحتاج صورة مرفقة.
- المقاسات الحقيقية: الطول 19.4 م، عرض الجناح 13.0 م، الارتفاع 5.6 م.

## `bp_top`

```
A strictly orthographic technical top view (plan view) of an original, fictional modern twin-engine two-seat strike fighter called ZF-25, designed for this game: in the spirit of a heavy twin-tail strike fighter but its own design, not a copy of any real aircraft. Long fuselage with a pointed, slightly chined nose; two-seat tandem bubble canopy; large rectangular, angular engine air intakes on each side of the fuselage just behind the cockpit; blended conformal fuel tanks along the fuselage sides; a high-mounted wing with a swept leading edge (about 45 degrees), straight trailing edge and cropped tips; two vertical tails slightly canted outward; all-moving horizontal tailplanes; two engines side by side ending in two round nozzles at the tail. Clean configuration: no weapons, no fuel tanks, only four small empty pylons under the wings. Two-tone low-visibility grey camouflage, weathered and slightly dusty from a desert base, panel lines and access panels visible. Absolutely no markings: no insignia, roundels, flags, numbers, letters, text, logos or badges. Landing gear up.
View: exactly from directly above, camera at infinity, perfectly orthographic, no perspective at all, the aircraft perfectly level, nose pointing straight UP the image, its centreline exactly vertical and centred. Its length fills 88% of the image height.
Photorealistic, real metal and paint, sharp. Soft, even, shadowless light from above, like a bright overcast day: no harsh shadows, no specular glare, no reflections of the sky. Background: one flat solid colour, pure magenta #FF00FF, everywhere outside the aircraft, clean sharp edges, no shadow, no gradient, no glow. No text, no labels, no dimension lines. Square 1:1, 1024 x 1024, PNG.
```

## `bp_bottom`

```
Keep exactly the same aircraft design as the attached image.
A strictly orthographic technical bottom view of that SAME ZF-25 aircraft: the same outline, wing, tails and proportions as the attached top view, now seen from exactly underneath, as if lying on its back above the camera: its underside, the closed landing gear doors, the four empty underwing pylons, the intakes from below, the two round nozzles. Clean configuration, no weapons. Two-tone low-visibility grey, weathered and slightly dusty, panel lines visible. Absolutely no markings, no text.
View: exactly from directly below, camera at infinity, perfectly orthographic, no perspective, the aircraft perfectly level, nose pointing straight UP the image, centreline exactly vertical and centred. Its length fills 88% of the image height, the same size as in the attached image.
Photorealistic, sharp. Soft, even, shadowless light, like a bright overcast day: no harsh shadows, no glare. Background: one flat solid colour, pure magenta #FF00FF, everywhere outside the aircraft, clean sharp edges, no shadow, no gradient, no glow. No text. Square 1:1, 1024 x 1024, PNG.
```

## `bp_side`

```
Keep exactly the same aircraft design as the attached image.
A strictly orthographic technical side view (profile) of that SAME ZF-25 aircraft: its left side, the same fuselage, nose, canopy, intakes, conformal tanks, wing and tails as the attached top view. The two-seat tandem bubble canopy with two crew in helmets; the rectangular intake on the side behind the cockpit; the wing seen edge-on; the two vertical tails one behind the other; the round nozzles at the tail. Clean configuration: no weapons, only the empty underwing pylons. Landing gear up. Two-tone low-visibility grey, weathered and slightly dusty, panel lines visible. Absolutely no markings, no text.
View: exactly from the left side, camera at infinity, perfectly orthographic, no perspective, the aircraft perfectly level, nose pointing to the LEFT of the image, centred. Its length fills 88% of the image width.
Photorealistic, sharp. Soft, even, shadowless light, like a bright overcast day: no harsh shadows, no glare. Background: one flat solid colour, pure magenta #FF00FF, everywhere outside the aircraft, clean sharp edges, no shadow, no gradient, no glow. No text. Square 1:1, 1024 x 1024, PNG.
```

## `bp_front`

```
Keep exactly the same aircraft design as the attached image.
A strictly orthographic technical front view of that SAME ZF-25 aircraft, seen exactly head-on: the pointed nose in the centre, the two-seat canopy above it, the two large rectangular angular engine intakes on either side of the fuselage below the canopy (dark inside, NOT round, no rings, they must not look like exhaust nozzles), the wings level left and right with the four empty pylons below, the two vertical tails slightly canted outward rising behind. Clean configuration, no weapons. Landing gear up. Two-tone low-visibility grey, weathered, panel lines visible. Absolutely no markings, no text.
View: exactly from the front, camera at infinity, perfectly orthographic, no perspective, the aircraft perfectly level, wings exactly horizontal, centred. Its wingspan fills 88% of the image width.
Photorealistic, sharp. Soft, even, shadowless light, like a bright overcast day: no harsh shadows, no glare. Background: one flat solid colour, pure magenta #FF00FF, everywhere outside the aircraft, clean sharp edges, no shadow, no gradient, no glow. No text. Square 1:1, 1024 x 1024, PNG.
```

## `bp_rear`

```
Keep exactly the same aircraft design as the attached image.
A strictly orthographic technical rear view of that SAME ZF-25 aircraft, seen exactly from behind: the two round engine nozzles side by side in the centre, the two vertical tails slightly canted outward, the all-moving tailplanes, the wings level left and right with the four empty pylons below, the top of the canopy just visible above the fuselage. Clean configuration, no weapons. Landing gear up. Two-tone low-visibility grey, weathered, panel lines visible. Absolutely no markings, no text.
View: exactly from behind, camera at infinity, perfectly orthographic, no perspective, the aircraft perfectly level, wings exactly horizontal, centred. Its wingspan fills 88% of the image width.
Photorealistic, sharp. Soft, even, shadowless light, like a bright overcast day: no harsh shadows, no glare. Background: one flat solid colour, pure magenta #FF00FF, everywhere outside the aircraft, clean sharp edges, no shadow, no gradient, no glow. No text. Square 1:1, 1024 x 1024, PNG.
```

## `w_lgb` (قنبلة الليزر)

```
A strictly orthographic technical side view of a modern 500 lb laser-guided bomb, generic and unbranded: olive-drab bomb body, a laser seeker head on a short ring of small steering canards at the nose, a guidance section, and pop-out tail wings at the rear (shown open), lugs on top for the pylon. Real, weathered, slightly scuffed paint, small yellow band near the nose. Absolutely no text, no numbers, no stencils, no logos.
View: exactly from the side, camera at infinity, perfectly orthographic, no perspective, nose pointing to the LEFT, perfectly horizontal, centred; its length fills 90% of the image width.
Photorealistic, sharp. Soft, even, shadowless light. Background: one flat solid colour, pure magenta #FF00FF, clean sharp edges, no shadow, no gradient. No text. Square 1:1, 1024 x 1024, PNG.
```

## `w_gps` (قنبلة GPS)

```
A strictly orthographic technical side view of a modern 500 lb GPS-guided bomb, generic and unbranded: olive-drab low-drag bomb body with a smooth ogive nose, mid-body strakes along the sides, and a tail guidance kit with four fixed tail fins at the rear, lugs on top for the pylon. Real, weathered, slightly scuffed paint, small yellow band near the nose. Absolutely no text, no numbers, no stencils, no logos.
View: exactly from the side, camera at infinity, perfectly orthographic, no perspective, nose pointing to the LEFT, perfectly horizontal, centred; its length fills 90% of the image width.
Photorealistic, sharp. Soft, even, shadowless light. Background: one flat solid colour, pure magenta #FF00FF, clean sharp edges, no shadow, no gradient. No text. Square 1:1, 1024 x 1024, PNG.
```

## `w_msl` (صاروخ برق)

```
A strictly orthographic technical side view of a modern air-to-ground guided missile, generic and unbranded: a white-grey cylindrical body with a clear dome seeker at the rounded nose, four long narrow cruciform wings along the middle of the body and four small control fins at the tail, a launch rail shoe on top. Real, slightly weathered. Absolutely no text, no numbers, no stencils, no logos.
View: exactly from the side, camera at infinity, perfectly orthographic, no perspective, nose pointing to the LEFT, perfectly horizontal, centred; its length fills 90% of the image width.
Photorealistic, sharp. Soft, even, shadowless light. Background: one flat solid colour, pure magenta #FF00FF, clean sharp edges, no shadow, no gradient. No text. Square 1:1, 1024 x 1024, PNG.
```
