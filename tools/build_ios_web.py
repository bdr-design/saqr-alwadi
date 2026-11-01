"""Copy the game into the app: the built page, the map tiles, the sprites, three.js itself and the fonts, so the app
runs with no network. Run tools/build.py first.

  python3 tools/build_ios_web.py            ->  ios/web                            (the iOS app)
  python3 tools/build_ios_web.py android    ->  android/game/src/main/assets/web   (the Android app's asset pack)
  python3 tools/build_ios_web.py site       ->  build/site                         (the web site: GitHub Pages or
                                                Cloudflare Pages, .github/workflows/web.yml; with its manifest and icons
                                                so a phone can put it on the home screen, landscape and full screen)
"""
import hashlib, json, pathlib, re, shutil, sys, urllib.request

root = pathlib.Path(__file__).resolve().parent.parent
ARG = sys.argv[1] if sys.argv[1:] else 'ios'
assert ARG in ('ios', 'android', 'site'), 'build_ios_web.py [android|site]'
web = {'ios': root / 'ios' / 'web', 'android': root / 'android' / 'game' / 'src' / 'main' / 'assets' / 'web',
       'site': root / 'build' / 'site'}[ARG]
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
if ARG == 'site':
    # the site's own: the manifest (installed from the browser it opens full screen, landscape) and its icons from the
    # owner's Apple icon (no transparency), the theme colour, and SAQR_SITE (08-ui.js goLand: a phone's browser goes
    # full screen at a mission's start). .nojekyll: GitHub Pages serves every file as it is
    from PIL import Image
    ic = Image.open(root / 'assets' / 'originals' / 'icons' / 'Saqr-AlWadi-Apple-1024.png').convert('RGB')
    (web / 'icons').mkdir()
    for n in (180, 192, 512): ic.resize((n, n), Image.LANCZOS).save(web / 'icons' / f'icon-{n}.png', optimize=True)
    (web / 'manifest.webmanifest').write_text(json.dumps({
        'name': 'صقر الوادي', 'short_name': 'صقر الوادي', 'lang': 'ar', 'dir': 'rtl', 'start_url': './', 'scope': './',
        'display': 'fullscreen', 'orientation': 'landscape', 'background_color': '#000000', 'theme_color': '#000000',
        'icons': [{'src': f'icons/icon-{n}.png', 'sizes': f'{n}x{n}', 'type': 'image/png'} for n in (192, 512)]},
        ensure_ascii=False, indent=1), encoding='utf8')
    (web / '.nojekyll').write_text('')
    head = ('<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icons/icon-180.png">\n'
            '<meta name="theme-color" content="#000000">\n<meta name="mobile-web-app-capable" content="yes">\n'
            '<meta name="apple-mobile-web-app-capable" content="yes">\n'
            '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
            '<script>window.SAQR_SITE = 1;</script>\n')
    # (in the head: a browser takes the manifest and the home screen's tags from there only; the page's title is in its
    # body, where build.py's artifact body puts it)
    assert page.count('</head>') == 1
    page = page.replace('</head>', head + '</head>')
(web / 'index.html').write_text(page, encoding='utf8')
for d in ('tiles', 'sprites', 'models'):          # (models: the ZF-25's GLBs and three's glTF loader)
    if (root / d).exists(): shutil.copytree(root / d, web / d)
# the maps: only those the built page carries (a map still on trial, data/maps/<id>/map.json 'trial', is not in it),
# and the country under each it carries, wherever that lies (Silak's is Seren's pyramid: maps/seren/country, which
# goes with Silak even while Seren itself is on trial)
ship, ctry = [], set()
for f in sorted((root / 'maps').glob('*')):
    mj = root / 'data' / 'maps' / f.name / 'map.json'
    m_ = json.loads(mj.read_text()) if mj.exists() else {}
    if not f.is_dir() or m_.get('trial'): continue
    ship.append(f.name)
    if m_.get('country'): ctry.add(m_['country']['dir'].rstrip('/'))
    shutil.copytree(f, web / 'maps' / f.name, ignore=lambda d, names: ['country'] if pathlib.Path(d) == f else [])
for c in sorted(ctry):
    if (root / c).is_dir(): shutil.copytree(root / c, web / c, dirs_exist_ok=True)
# three.js: the copy the tests use if present, else the same file the page loads
local = root / 'tests' / 'three.min.js'
if local.exists():
    shutil.copy(local, web / 'three.min.js')
else:
    with urllib.request.urlopen(THREE_URL) as r:
        (web / 'three.min.js').write_bytes(r.read())
size = sum(f.stat().st_size for f in web.rglob('*') if f.is_file())
print(f'{web.relative_to(root)}: {sum(1 for f in web.rglob("*") if f.is_file())} files, {size / 1e6:.1f} MB')
