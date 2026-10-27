# صور القائمة والشاشات — قائمة التوليد

صور الواجهة (القائمة، والحظيرة، والتحميل، والخرائط، والمهام، ونهاية المهمة) لتصميم القائمة الجديد. **لا شيء منها في اللعبة بعد**؛ ينتظر موافقة صاحب المشروع على التصميم (`docs/REQUIREMENTS.md`: «التصميم قبل التنفيذ»).

الأصول الكاملة في `assets/originals/menu/`، والنسخ الخفيفة تُصنع منها (انظر «الوزن» آخر الملف).

## شروط كل الصور

- صورة حقيقية، لا رسمة لعبة: عدسة طويلة، وغبار وضباب طبيعي، وضوء الشمس منخفض (الغروب أو العصر) إلا الليلية.
- **بلا أي كتابة أو شعار أو علامة مائية**، وعلامات الطائرة باهتة (low-visibility) بلا أرقام ذيل مقروءة.
- المكان: ساحل البحر الأحمر، جبال صخرية داكنة، أودية جافة، كثبان، شعاب فيروزية. مثل خرائط اللعبة.
- الشاشات الكاملة 21:9 (3360 × 1440 أو أكبر): الموضوع في **الثلث الأيسر**، و**الثلث الأيمن هادئ** (العنوان العربي يُكتب يمينًا).
- البطاقات 16:9 (1920 × 1080): الموضوع في الوسط، وأسفل الصورة هادئ (الاسم يُكتب أسفلها).
- **الـ F-15SA:** مقعدان تحت غطاء واحد، طيار وضابط أسلحة فقط. خزانا وقود ملتصقان بجانبي البدن، وذيلان.
- **الأباتشي AH-64E:** أربع ريش، ورادار Longbow دائري فوق المروحة، والمدفع تحت الأنف، وجناحان قصيران بأربع نقاط تعليق.

أدوات التوليد تخطئ كثيرًا في عدد الطيارين والريش والذيول والأسلحة: تُرفض أي صورة فيها خطأ وتُعاد.

## الحالة

| # | الصورة | المقاس | الملف في `assets/originals/menu/` | الحالة |
|---|---|---|---|---|
| 1 | F-15SA في الجو نهارًا (الرئيسية) | 21:9 | `f15_coast_flight.png` | **يُعاد:** ثلاثة طيارين |
| 2 | أباتشي في الجو نهارًا (الرئيسية) | 21:9 | `ah64_wadi_flight.png` | معتمد |
| 3 | F-15SA في الملجأ (الحظيرة) | 21:9 | `f15_shelter_dusk.png` | معتمد |
| 4 | أباتشي على المنصة (الحظيرة) | 21:9 | `ah64_pad_dusk.png` | معتمد |
| 5 | F-15SA ليلًا (الرئيسية في مهمة ليلية) | 21:9 | `f15_night_flight.png` | مطلوب |
| 6 | أباتشي ليلًا | 21:9 | `ah64_night_flight.png` | مطلوب |
| 7 | تحميل F-15SA | 21:9 | `f15_loading.png` | مطلوب |
| 8 | تحميل الأباتشي | 21:9 | `ah64_loading.png` | مطلوب |
| 9 | خريطة الوادي | 16:9 | `map_valley.png` | مطلوب |
| 10 | خريطة الصحراء | 16:9 | `map_desert.png` | مطلوب |
| 11 | خريطة الميناء والمعسكر | 16:9 | `map_port.png` | مطلوب |
| 12 | المسرح الكامل | 16:9 | `map_theater.png` | مطلوب |
| 13 | مهمة: ضربة | 16:9 | `mt_strike.png` | مطلوب |
| 14 | مهمة: إسناد قوات | 16:9 | `mt_tic.png` | مطلوب |
| 15 | مهمة: اعتراض رتل | 16:9 | `mt_convoy.png` | مطلوب |
| 16 | مهمة: مرافقة | 16:9 | `mt_escort.png` | مطلوب |
| 17 | مهمة: دفاع | 16:9 | `mt_defence.png` | مطلوب |
| 18 | مهمة: عملية | 16:9 | `mt_op.png` | مطلوب |
| 19 | نهاية المهمة | 21:9 | `debrief.png` | مطلوب |

## الأوصاف

### 1. F-15SA في الجو (إعادة)
```
Photorealistic air-to-air photograph, 21:9 wide. A two-seat F-15SA Strike Eagle in two-tone grey camouflage, banking gently left over a Red Sea desert coastline at golden hour: dark rocky mountains, a dry wadi, sand dunes, turquoise reef far below. Aircraft in the left third of the frame, three-quarter front view from slightly above. Exactly two crew in tandem under ONE single-piece bubble canopy: a pilot in front and a weapons officer behind. No third person, no extra canopy frame. Conformal fuel tanks on the fuselage sides carrying GBU-12 laser-guided bombs, two GBU-38 JDAM on the centreline, AGM-65 Maverick on the wing pylons, AIM-9X on the wing rails, a Sniper targeting pod under the left intake. Low-visibility markings, no readable text, no tail numbers. 200mm lens, natural haze. The right third is calm sky and haze. No logos, no watermark, no lens flare.
```

### 5. F-15SA ليلًا
```
Photorealistic night air-to-air photograph, 21:9 wide. A two-seat F-15SA Strike Eagle in grey camouflage flying level at night over a desert coastline, moonlight on the upper surfaces, faint red and green navigation lights, the dim glow of the cockpit displays on the two crew under one bubble canopy (exactly two crew). Far below: scattered orange lights of a small port and a road, dark sea with moonlight reflection. Aircraft in the left third, three-quarter side view. Conformal tanks with GBU-12 bombs, Sniper pod under the left intake. No afterburner. Low-visibility markings, no readable text. The right third is dark sky with stars. No logos, no watermark.
```

### 6. أباتشي ليلًا
```
Photorealistic night photograph, 21:9 wide. An AH-64E Apache Guardian in desert tan flying low along a dark wadi under moonlight, rotor blades faintly visible in motion, Longbow radar dome on the mast, TADS/PNVS nose turret, M230 30mm gun under the chin, Hellfire launchers on the outer pylons and rocket pods on the inner pylons. Natural moonlight only, cool blue tones, dim cockpit glow, no night-vision green. Helicopter in the left third, three-quarter front view. Low-visibility markings, no readable text. The right third is dark mountains and starry sky. No logos, no watermark.
```

### 7. تحميل F-15SA
```
Photorealistic photograph, 21:9 wide. A two-seat F-15SA Strike Eagle taking off from a desert airbase runway at sunrise, landing gear just retracting, both engines in afterburner with blue-orange flames and heat shimmer, dust on the runway edges, dark rocky mountains behind. Aircraft in the left third, side view from low angle. Exactly two crew under one canopy. Low-visibility markings, no readable text, no tail numbers. The right third is plain warm sky. No logos, no watermark.
```

### 8. تحميل الأباتشي
```
Photorealistic photograph, 21:9 wide. An AH-64E Apache Guardian in desert tan lifting off from a desert helipad at sunrise, rotor wash throwing up a ring of dust, Longbow radar dome on the mast, weapons on the stub wings. Helicopter in the left third, three-quarter front view from ground level. Low-visibility markings, no readable text. The right third is plain sky and distant mountains. No people, no logos, no watermark.
```

### 9. خريطة الوادي
```
Photorealistic aerial photograph, 16:9, from about 1,500 m, looking down at 45 degrees. A narrow dry wadi winding between steep dark rocky mountains, a dirt road along the wadi floor, a few acacia trees and a handful of small mud-brick houses. Late afternoon light, long shadows, slight haze. No vehicles, no people, no text, no watermark.
```

### 10. خريطة الصحراء
```
Photorealistic aerial photograph, 16:9, from about 1,500 m, looking down at 45 degrees. Open desert plain beside a rocky escarpment: orange sand dunes, a dry river crossing with scattered acacia trees, a lone dirt road, a small salt flat. Late afternoon light, long shadows, slight haze. No vehicles, no people, no text, no watermark.
```

### 11. خريطة الميناء والمعسكر
```
Photorealistic aerial photograph, 16:9, from about 1,500 m, looking down at 45 degrees. A small Red Sea port: two concrete quays with a few cargo ships, rows of containers, warehouses, fuel tanks; just inland a walled military camp with barracks and a parade ground; turquoise reef and deep blue sea on the left. Late afternoon light, slight haze. No text, no logos, no watermark.
```

### 12. المسرح الكامل
```
Photorealistic aerial photograph, 16:9, from about 6,000 m, looking down at 35 degrees. A wide view of a Red Sea coast: turquoise reefs and a small port on the left, dark rocky mountains with a winding wadi in the middle, orange dunes, and a desert airbase with a single runway and shelters on a gravel plain on the right. Golden hour, haze over the far mountains. No text, no logos, no watermark.
```

### 13–18. أنواع المهام
كلها: `Photorealistic photograph, 16:9, desert Red Sea region, late afternoon light, slight haze, no readable text, no logos, no watermark.` ثم:
- **ضربة:** `A precision strike seen from a distant hill: a fireball and black smoke column rising from a walled compound in a dry valley, debris in the air.`
- **إسناد قوات:** `Friendly soldiers in desert uniform taking cover behind an armoured vehicle on a rocky slope, firing toward a ridge, red smoke marking the enemy position, an attack helicopter silhouette in the far sky.` (لا وجوه واضحة)
- **اعتراض رتل:** `A column of four pickup trucks and an old tanker driving along a dusty desert road through a wadi, seen from high above through a slight haze, as from an aircraft's targeting camera.`
- **مرافقة:** `A friendly supply convoy of two armoured vehicles, a cargo truck and a fuel tanker driving along a desert road below dark mountains, dust trailing behind, an attack helicopter flying above and ahead of it.`
- **دفاع:** `The perimeter fence and watchtower of a desert airbase at dusk, floodlights on, a runway and aircraft shelters behind, distant smoke on the ridge beyond the fence.`
- **عملية:** `A large-scale view at dusk: an attack helicopter and a fighter jet crossing a desert coastline toward distant smoke over a port, the mountains dark behind.`

### 19. نهاية المهمة
```
Photorealistic photograph, 21:9 wide. Dusk over a desert valley after a battle: a thin grey smoke column rising straight up from a burnt-out truck far away, the sun just set behind dark mountains, calm. The burnt vehicle in the left third, small. The right third is calm sky. No people, no text, no watermark.
```

## الوزن («بدون ثقل»)

- **النسخ الخفيفة:** WebP بجودة نحو 75.
  - الشاشات الكاملة: 1688 × 780 (ضعف شاشة الآيفون بالعرض، 844 × 390)، نحو 100–150 ك.ب. لكل صورة.
  - البطاقات: 640 × 360، نحو 25–40 ك.ب.
  - المجموع كله نحو 1.5 م.ب.، أقل من صورة قمرة واحدة.
- **التحميل:**
  - لا تُحمّل مع اللعبة. تُحمّل بعد اكتمال تحميل المهمة الأولى، وصور الطائرة المختارة فقط (نحو 0.5 م.ب.).
  - صور البطاقات تُحمّل حين تظهر.
- **الذاكرة:**
  - الصورة الكاملة مفكوكة نحو 5 م.ب. في ذاكرة الجوال، فلا تبقى أكثر من ثلاث صور مفكوكة معًا.
  - حين تبدأ المهمة تُفرَّغ صور القائمة كلها، فلا تأخذ شيئًا أثناء الطيران.
- **الرسم:** الخلفية ثابتة وحركتها البطيئة بـ CSS فقط، والزجاج المصنفر في القائمة وحدها، وخلفها اللعبة متوقفة على 12 إطارًا.
- **الرابط المنشور:** نحو 19 ملفًا جديدًا فوق نحو 420، تحت حد 512.
