# أصوات اللاسلكي العربي المولّدة: تراخيصها

هذه الملفات مولّدة بنماذج صوت Piper الأردنية (`tools/make_radio_ar_tts.py`)، **للتجربة فقط**. صاحب المشروع اختارها «الحين وتنستبدل بعدين». **لا تصلح للعبة تُباع:** تُستبدل قبل البيع بأصوات مرخّصة تجاريًا. الطريقة: تُسجَّل أسطر كل شخصية كاملة في `assets/originals/radio_ar/voices/<ah64|f15>/`، و`tools/make_radio_ar.py` يأخذ صوت الشخصية من هناك تلقائيًا متى اكتملت أسطرها.

| النموذج | من يتكلم به في اللعبة | الترخيص |
|---|---|---|
| `ar_JO-SA_miro_V2-high` (OpenVoiceOS، `phoonnx_ar-SA_miro_espeak_V2`، مدرّب على `TigreGotico/tts-train-synthetic-miro_ar-diacritics`) | الطياران (الأباتشي والـ F-15) | CC BY-NC-SA 4.0: غير تجاري، مع ذكر المصدر، والمشتقات بالترخيص نفسه |
| `ar_JO-SA_dii-high` (OpenVoiceOS، `phoonnx_ar-SA_dii_espeak`) | العمليات، والتحذيرات الصوتية | CC BY-NC-SA 4.0 |
| `ar_JO-kareem-medium` (rhasspy/piper-voices؛ بياناته من `github.com/AliMokhammad/arabicttstrain`) | الصياد (مرفوع 3 أنصاف نغمات)، والبرج، والطاقم الأرضي | بطاقة النموذج تحيل لرابط البيانات ولا تذكر ترخيصًا، فلا يُفترض أنه يسمح بالبيع |

ذكر المصدر هنا فقط، لا في اللعبة (طلب صاحب المشروع): هذه الأصوات للتجربة، وتُستبدل قبل أي نشر.

What these are: the Saudi Arabic radio lines spoken by Piper's Jordanian Arabic voices, for trial only. SA_miro_V2 and
SA_dii are CC BY-NC-SA 4.0 (non-commercial, attribution, share-alike); kareem's data names no licence. Replace them
before the game is sold: the owner's recordings in assets/originals/radio_ar/voices take over a character's voice once
all of that character's lines are there (tools/make_radio_ar.py).
