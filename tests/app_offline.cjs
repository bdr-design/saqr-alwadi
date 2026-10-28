// The game as the apps carry it (tools/build_ios_web.py: ios/web, or the Android app's assets): with the network shut
// off entirely it loads, its fonts are its own (no Google Fonts), three.js is local, and the menu draws in them. A shot
// to tests/out/app-offline.png. Run tools/build.py and tools/build_ios_web.py first.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..'), WEB = process.argv[2] ? path.resolve(process.argv[2]) : path.join(S, 'ios', 'web');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
(async () => {
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + JSON.stringify(v) : '')); if (!ok) fails.push(w); };
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 })).newPage();
  const errs = [], outside = [];
  page.on('pageerror', e => errs.push(e.message));
  // the app's one origin; anything else is the network, refused and noted
  await page.route('**/*', r => { const u = new URL(r.request().url());
    if (u.host !== 'app.local') { outside.push(u.href); return r.abort(); }
    const f = path.join(WEB, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(f)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); });
  await page.goto('https://app.local/index.html');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 180000 });
  await page.waitForTimeout(800);
  const fonts = await page.evaluate(async () => { await document.fonts.ready;
    // (each face loaded from the app's own files: a face that cannot be had loads as nothing)
    const miss = [];
    for (const [f, w, t] of [['IBM Plex Sans Arabic', 700, 'صقر'], ['IBM Plex Sans', 600, 'SAQR'], ['IBM Plex Mono', 500, '1588'], ['Noto Kufi Arabic', 800, 'صقر'], ['IBM Plex Sans Condensed', 600, '15K']])
      if (!(await document.fonts.load(w + ' 16px "' + f + '"', t)).length) miss.push(f);
    return miss; });
  check('loads with no network: nothing asked of it', !outside.length, outside.slice(0, 5));
  check('its fonts all there', !fonts.length, fonts);
  check('three.js is its own', await page.evaluate(() => typeof THREE !== 'undefined'));
  await page.screenshot({ path: S + '/tests/out/app-offline.png' });
  check('no page errors', !errs.length, errs);
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
