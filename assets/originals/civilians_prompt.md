# ورقة المدنيين (المطلوبة من صاحب المشروع)

صورة واحدة بنفس طريقة ورقتي المشاة (`infantry_red.png` و`infantry_blue.png`) ليقصّها `tools/make_infantry.py` كما يقصّهما:
منظر من الأعلى تمامًا، خلفية وردية صافية `#FF00FF`، شبكة 4 × 2، شخص واحد في وسط كل خانة ورأسه لأعلى الصورة،
بنفس المقاس (رجل واقف نحو ربع ارتفاع الخانة)، بلا ظل على الأرض وبلا نص.

الخانات بالترتيب (من اليسار، الصف الأول ثم الثاني):

1. رجل واقف: ثوب أبيض، وشماغ أحمر وأبيض، وعقال أسود
2. الرجل نفسه يمشي، القدم اليسرى للأمام
3. الرجل نفسه يمشي، القدم اليمنى للأمام
4. رجل جالس على الأرض متربّعًا (ثوب بيج، وغترة بيضاء)
5. رجل يركض هاربًا (ثوب أبيض، وشماغ أحمر)، ذراعاه تتأرجحان
6. رجل ممدّد على ظهره على الأرض، مصاب (ثوب أبيض، وشماغ أحمر)
7. امرأة واقفة بعباءة سوداء وطرحة
8. المرأة نفسها تمشي

## الوصف للمولّد (بالإنجليزية)

```
A sprite sheet for a top-down military simulator, seen from directly overhead (90-degree nadir view, like a drone
camera looking straight down), photorealistic, natural daylight from the upper left, on a flat pure magenta
background (#FF00FF) with no shadows on the ground, no text, no borders. A 4 x 2 grid of equal cells, one person
centred in each cell, every person's head toward the top of the image, all at the same scale (a standing man about a
quarter of the cell's height, seen from above: head, shoulders and the top of the clothing).
Row 1: (1) a Saudi man standing, white thobe, red-and-white shemagh with a black agal; (2) the same man walking, left
foot forward; (3) the same man walking, right foot forward; (4) a man sitting cross-legged on the ground, beige thobe,
white ghutra.
Row 2: (5) a man running away, white thobe, red shemagh, arms swinging; (6) a wounded man lying on his back, white
thobe, red shemagh; (7) a woman standing in a black abaya and black headscarf; (8) the same woman walking.
Unarmed civilians only, no weapons, no military gear. Sharp edges against the magenta, no anti-aliasing halo, no
magenta reflections on the clothing.
```

حين تصل الصورة: تُحفظ في `assets/originals/civilians.png` وتُضاف إلى `SIDES` في `tools/make_infantry.py`.
