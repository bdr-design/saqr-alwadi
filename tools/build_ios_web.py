"""Copy the game into the app: the built page, the map tiles, the sprites, three.js itself and the fonts, so the app
runs with no network. Run tools/build.py first.

  python3 tools/build_ios_web.py            ->  ios/web                            (the iOS app)
  python3 tools/build_ios_web.py android    ->  android/game/src/main/assets/web   (the Android app's asset pack)
"""
import hashlib, pathlib, re, shutil, sys, urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
web = root / 'android' / 'game' / 'src' / 'main' / 'assets' / 'web' if sys.argv[1:] == ['android'] else root / 'ios' / 'web'
THREE_URL = 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js'

if web.exists():
    shutil.rmtree(web)
web.mkdir(parents=True)
page = (root / 'index.html').read_text(encoding='utf8')
assert THREE_URL in page, 'index.html no longer loads three.js r128 from cdnjs: update THREE_URL'
page = page.replace(THREE_URL, 'three.min.js')
# the fonts too (Google Fonts' stylesheet and its woff2 files, into fonts/), so the app asks nothing of the network
m = re.search(r'<link rel="stylesheet" href="(https://fonts\.googleapis\.com/css2\?[^"]+)">', page)
assert m, 'index.html no longer loads its fonts from Google Fonts: update build_ios_web.py'
UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
get = lambda u: urllib.request.urlopen(urllib.request.Request(u, headers={'User-Agent': UA})).read()
css = get(m.group(1).replace('&amp;', '&')).decode()
(web / 'fonts').mkdir()
def local(mm):
    u = mm.group(1); name = hashlib.sha1(u.encode()).hexdigest()[:16] + '.woff2'
    if not (web / 'fonts' / name).exists(): (web / 'fonts' / name).write_bytes(get(u))
    return 'url(fonts/' + name + ')'
css = re.sub(r'url\((https://fonts\.gstatic\.com/[^)]+\.woff2)\)', local, css)
assert 'https://' not in css, 'a font left on the network'
page = re.sub(r'<link rel="preconnect" href="https://fonts\.(googleapis|gstatic)\.com"( crossorigin)?>\n', '', page)
page = page.replace(m.group(0), '<style>' + css + '</style>')
(web / 'index.html').write_text(page, encoding='utf8')
for d in ('tiles', 'sprites', 'maps'):
    if (root / d).exists(): shutil.copytree(root / d, web / d)
# three.js: the copy the tests use if present, else the same file the page loads
local = root / 'tests' / 'three.min.js'
if local.exists():
    shutil.copy(local, web / 'three.min.js')
else:
    with urllib.request.urlopen(THREE_URL) as r:
        (web / 'three.min.js').write_bytes(r.read())
size = sum(f.stat().st_size for f in web.rglob('*') if f.is_file())
print(f'{web.relative_to(root)}: {sum(1 for f in web.rglob("*") if f.is_file())} files, {size / 1e6:.1f} MB')
