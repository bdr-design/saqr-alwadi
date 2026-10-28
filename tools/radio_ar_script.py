"""The radio in Saudi Arabic, for the owner to have voiced (people or a voice model): every line of tools/make_radio.py's
two sets, its Arabic from tools/radio_ar_lines.py, by speaker, with how to record them.

  python3 tools/radio_ar_script.py    ->  assets/originals/radio_ar/README.md and lines.csv
"""
import json, pathlib, re, csv
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'tools/make_radio.py').read_text()
body = src[src.index('ONES = '):src.index("if SET == 'f15': L = F")]
g = {'root': root, 're': re, 'json': json, 'pathlib': pathlib}
exec(body, g)
exec((root / 'tools/radio_ar_lines.py').read_text(), g)
AR = g['AR']; APA, JET = g['L'], g['F']
SP = {'h': 'الصياد', 'p': 'طيار الأباتشي', 'o': 'العمليات', 'c': 'الطاقم الأرضي', 'f': 'طيار الـ F-15', 'w': 'صوت التحذير'}
rows = []
for set_, D in (('ah64', APA), ('f15', JET)):
  for k, en in D.items():
    assert k in AR, (set_, k)
    sp = 'طيار الـ F-15' if set_ == 'f15' and k[0] == 'f' else SP[k[0]]
    rows.append((set_, k, sp, AR[k], en))
extra = set(AR) - {r[1] for r in rows}
assert not extra, extra
print(len(rows), 'lines')
dst = root / 'assets/originals/radio_ar'; dst.mkdir(exist_ok=True)
with open(dst / 'lines.csv', 'w', newline='', encoding='utf-8-sig') as f:
  w = csv.writer(f); w.writerow(['set', 'file', 'speaker', 'arabic', 'english'])
  for s, k, sp, ar, en in rows: w.writerow([s, f'{s}/{k}.wav', sp, ar, en])
VO = [
 ('الصياد', 'المراقب الجوي الأرضي (JTAC) مع القوات على الأرض. رجل بين ٣٠ و٤٠ سنة، لهجة نجدية. صوته مشدود وسريع شوي، كأنه في معركة ويسمع الرمي حوله. يكلّم الأباتشي والـ F-15 كلهم.'),
 ('طيار الأباتشي', 'الطيار في المقعد الأمامي، يكلّمك على الاتصال الداخلي. رجل، هادي ومركّز، وصوته يرتفع بس مع الصواريخ والإصابة.'),
 ('طيار الـ F-15', 'الطيار في المقعد الأمامي للـ F-15SA، يكلّمك وأنت ضابط الأسلحة خلفه. رجل، احترافي وهادي جدًا، وكلامه قصير. وفي التدريب يتكلم مثل مدرّب صبور.'),
 ('العمليات', 'مركز العمليات. رجل، رسمي وهادي، كأنه يقرأ أوامر من غرفة العمليات.'),
 ('الطاقم الأرضي', 'فني التذخير في القاعدة. رجل، عادي ومرتاح.'),
 ('صوت التحذير', 'صوت الطائرة الآلي في السماعة. امرأة، جاف وثابت، بلا مشاعر.'),
]
out = ['# أصوات اللاسلكي بالسعودي', '',
 'كل الأسطر اللي تقولها اللعبة على اللاسلكي والاتصال الداخلي، بالسعودي، لتنضاف خيارًا جنب الإنجليزي («اللاسلكي: English / عربي» في الإعدادات).',
 'الجدول نفسه في `lines.csv` (يفتح في Excel)، ومنه تقدر تولّدها دفعة وحدة لو استخدمت مولّد أصوات.', '',
 '## المتكلمين (٦ أصوات)', '']
for n, d in VO:
  c = sum(1 for r in rows if r[2] == n)
  out.append(f'- **{n}** ({c} سطر): {d}')
out += ['', '## طريقة التسجيل', '',
 '- كل سطر في ملف لحاله، واسمه بالضبط مثل عمود «الملف» (مثلًا `ah64/h.tic.wav`)، في مجلدين: `ah64` و`f15`.',
 '- صوت نظيف وجاف: بلا مؤثر لاسلكي، وبلا موسيقى، وبلا صدى. اللعبة تضيف صوت اللاسلكي بنفسها.',
 '- WAV أو MP3، وأي جودة من ٢٤ كيلوهرتز وفوق. نص ثانية سكوت قبل وبعد يكفي، وأنا أقصّ الباقي.',
 '- **الأسطر اللي تنتهي بفاصلة (،) قطع تنركّب ورا بعض**، مثلًا: «سيارة مسلّحة،» + «ثلاثمية متر،» + «شمال موقعي.» تصير جملة وحدة. سجّلها بنبرة مكمّلة (ما تنزل في آخرها)، وبنفس السرعة والقوة.',
 '- الأزرار (NEXT وTRACK وZOOM وSMS وA S وL G B وA G M) تنقال بالإنجليزي مثل ما هي مكتوبة على الشاشات.',
 '- «حوّل» في آخر النداء معناها أنتظر ردك، و«انتهى» يعني ما أنتظر رد.', '']
for setn, title in (('ah64', 'الأباتشي'), ('f15', 'الـ F-15SA')):
  out += [f'## {title}', '']
  for n, _ in VO:
    rs = [r for r in rows if r[0] == setn and r[2] == n]
    if not rs: continue
    out += [f'### {n} ({len(rs)})', '', '| الملف | السطر | بالإنجليزي |', '|---|---|---|']
    for s, k, sp, ar, en in rs: out.append(f'| `{s}/{k}.wav` | {ar} | {en} |')
    out.append('')
(dst / 'README.md').write_text('\n'.join(out))
