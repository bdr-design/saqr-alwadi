"""Build the game page from src/game.src.html.

  build/artifact.html  page body as published to the Claude artifact (the host adds the html/head skeleton)
  index.html           standalone page; serve the repo root over http and open it
"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
src = (root / 'src' / 'game.src.html').read_text(encoding='utf8')
road = json.loads((root / 'data' / 'road.json').read_text())
body = src.replace('__ROAD__', ','.join(f'{x:.1f},{y:.1f}' for x, y in road))
(root / 'build').mkdir(exist_ok=True)
(root / 'build' / 'artifact.html').write_text(body, encoding='utf8')
skeleton = ('<!doctype html>\n<html lang="ar" dir="rtl">\n<head>\n<meta charset="utf-8">\n'
            '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n'
            '<style>[hidden]{display:none!important}</style>\n</head>\n<body>\n' + body + '\n</body>\n</html>\n')
(root / 'index.html').write_text(skeleton, encoding='utf8')
print('built index.html and build/artifact.html')
