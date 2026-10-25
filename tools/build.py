"""Build the game page from src/game.src.html.

  build/artifact.html  page body as published to the Claude artifact (the host adds the html/head skeleton)
  index.html           standalone page; serve the repo root over http and open it
"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'src' / 'game.src.html').read_text(encoding='utf8')
# maps: the valley (data/road.json, tiles/), and any other map in data/maps/<id>/map.json (its road, size, far field,
# colours, hover points, missions), with its tiles in maps/<id>/tiles/
def flat(road): return [round(v, 1) for p in road for v in p]
maps = {'valley': {'ar': 'الوادي', 'en': 'VALLEY', 'w': 1672, 'h': 941, 'dir': '', 'road': flat(json.loads((root / 'data' / 'road.json').read_text())),
                   'far': {'x0': -2706.65, 'y0': -3004.18, 'size': 7058.82, 'n': 4}, 'ground': 0x655d53, 'haze': 0xb7b2a9,
                   'hover': {'h1': {'b': 250, 'd': 1900}, 'h2': {'b': 60, 'd': 2200}}}}
for f in sorted((root / 'data' / 'maps').glob('*/map.json')):
    m = json.loads(f.read_text())
    m['road'] = flat(m['road']); m['dir'] = 'maps/' + f.parent.name + '/'
    maps[f.parent.name] = m
def page(m): return src.replace('__MAPS__', json.dumps(m, ensure_ascii=False, separators=(',', ':')))
body = page(maps)
# the artifact holds at most 512 files: there the Lanczos maps stop at level 2 (x4; level 3 is the same photo at x8),
# so publish maps/<id>/tiles/{0,1,2,far} only. index.html, and so the iOS app, keeps level 3.
web = {k: dict(v, top=2) if v['dir'] else v for k, v in maps.items()}
(root / 'build').mkdir(exist_ok=True)
(root / 'build' / 'artifact.html').write_text(page(web), encoding='utf8')
skeleton = ('<!doctype html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<style>[hidden]{display:none!important}</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>\n')
(root / 'index.html').write_text(skeleton, encoding='utf8')
print('built index.html and build/artifact.html')
