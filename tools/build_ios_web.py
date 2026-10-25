"""Copy the game into ios/web for the iOS app: the built page, the map tiles, the sprites, and three.js itself, so the
app runs with no network. Run tools/build.py first.

  python3 tools/build_ios_web.py
"""
import pathlib, shutil, urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
web = root / 'ios' / 'web'
THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'

if web.exists():
    shutil.rmtree(web)
web.mkdir(parents=True)
page = (root / 'index.html').read_text(encoding='utf8')
assert THREE_URL in page, 'index.html no longer loads three.js r128 from cdnjs: update THREE_URL'
(web / 'index.html').write_text(page.replace(THREE_URL, 'three.min.js'), encoding='utf8')
for d in ('tiles', 'sprites'):
    shutil.copytree(root / d, web / d)
# three.js: the copy the tests use if present, else the same file the page loads
local = root / 'tests' / 'three.min.js'
if local.exists():
    shutil.copy(local, web / 'three.min.js')
else:
    with urllib.request.urlopen(THREE_URL) as r:
        (web / 'three.min.js').write_bytes(r.read())
size = sum(f.stat().st_size for f in web.rglob('*') if f.is_file())
print(f'ios/web: {sum(1 for f in web.rglob("*") if f.is_file())} files, {size / 1e6:.1f} MB')
