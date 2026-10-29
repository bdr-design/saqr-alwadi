"""Build the game page from src/game.src.html (the page: its style and markup) and src/game/*.js (the game's code, in
the order of their names, joined into the page's one script where /*__GAME__*/ stands: one scope, as it was written).

  build/artifact.html  page body as published to the Claude artifact (the host adds the html/head skeleton)
  index.html           standalone page; serve the repo root over http and open it
"""
import base64, json, pathlib, sys
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import mission_check
root = pathlib.Path(__file__).resolve().parent.parent
# the missions first: a fault in one stops the build (tools/mission_check.py)
if (errs := mission_check.check_all()): raise SystemExit('missions:\n' + '\n'.join(errs))
src = (root / 'src' / 'game.src.html').read_text(encoding='utf8')
src = src.replace('/*__GAME__*/\n', ''.join(f.read_text(encoding='utf8') for f in sorted((root / 'src' / 'game').glob('*.js'))))
# maps: the valley (data/road.json, tiles/), and any other map in data/maps/<id>/map.json (its road, size, far field,
# colours, hover points, missions), with its tiles in maps/<id>/tiles/
def flat(road): return [round(v, 1) for p in road for v in p]
maps = {'valley': {'ar': 'الوادي', 'en': 'VALLEY', 'w': 1672, 'h': 941, 'dir': '', 'road': flat(json.loads((root / 'data' / 'road.json').read_text())),
                   'far': {'x0': -2706.65, 'y0': -3004.18, 'size': 7058.82, 'n': 4}, 'ground': 0x655d53, 'haze': 0xb7b2a9,
                   'hover': {'h1': {'b': 250, 'd': 1900}, 'h2': {'b': 60, 'd': 2200}}}}
desc_en = json.loads((root / 'data' / 'missions_en.json').read_text())
for f in sorted((root / 'data' / 'maps').glob('*/map.json')):
    m = json.loads(f.read_text())
    m['road'] = flat(m['road']); m['dir'] = 'maps/' + f.parent.name + '/'
    # the F-15SA's own missions on this map (tools/jet_missions.py), shown instead of the Apache's when it is chosen
    jf = f.parent / 'missions_f15.json'
    if jf.exists(): m['jet'] = json.loads(jf.read_text())
    # where its water is, for the editor's boats (tools/make_water.py): a kilobyte, inline
    wf = root / 'maps' / f.parent.name / 'water.png'
    if wf.exists(): m['water'] = 'data:image/png;base64,' + base64.b64encode(wf.read_bytes()).decode()
    # the missions' briefings in English (data/missions_en.json, by map and id), for the game in English
    for mi in m.get('missions', []) + m.get('jet', []):
        en = desc_en.get(f.parent.name + '/' + mi['id'])
        if en: mi['desc_en'] = en
    maps[f.parent.name] = m
# the radio's recorded lines (tools/make_radio.py): where each is in sprites/radio.mp3
radio_f = root / 'data' / 'radio.json'
radio = radio_f.read_text().strip() if radio_f.exists() else 'null'
# the F-15SA: its flight model and sounds (src/f15sa.js, src/f15snd.js, used when it is the aircraft chosen), and its
# recorded voices (tools/make_radio.py f15)
radio15_f = root / 'data' / 'radio_f15.json'
radio15 = radio15_f.read_text().strip() if radio15_f.exists() else 'null'
# the same in Saudi Arabic, as far as it has been voiced (tools/make_radio_ar.py): sprites/radio_ar.mp3, radio_ar_f15.mp3
ra = {k: (root / 'data' / (k + '.json')) for k in ('radio_ar', 'radio_ar_f15')}
ra = {k: f.read_text().strip() if f.exists() else 'null' for k, f in ra.items()}
# the infantry's poses in their pictures (tools/make_infantry.py)
men = (root / 'data' / 'men.json').read_text().strip()
f15 = (root / 'src' / 'f15sa.js').read_text() + '\n' + (root / 'src' / 'f15snd.js').read_text()
def page(m): return (src.replace('__MAPS__', json.dumps(m, ensure_ascii=False, separators=(',', ':'))).replace('__RADIO__', radio)
                     .replace('__RADIO_F15__', radio15)
                     .replace('__RADIO_AR__', ra['radio_ar']).replace('__RADIO_AR_F15__', ra['radio_ar_f15']).replace('__MEN__', men).replace('/*__F15__*/', f15))
body = page(maps)
# the artifact holds at most 512 files: there every map stops at level 2 (x4; level 3 is that enlarged again), so
# publish tiles/{0,1,2,far} and maps/<id>/tiles/{0,1,2,far} only. index.html, and so the iOS app, keeps level 3.
web = {k: dict(v, top=2) for k, v in maps.items()}
(root / 'build').mkdir(exist_ok=True)
(root / 'build' / 'artifact.html').write_text(page(web), encoding='utf8')
skeleton = ('<!doctype html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<style>[hidden]{display:none!important}</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>\n')
(root / 'index.html').write_text(skeleton, encoding='utf8')
print('built index.html and build/artifact.html')
