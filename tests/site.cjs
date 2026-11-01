// The web site (python3 tools/build.py && python3 tools/build_ios_web.py site -> build/site): served as GitHub Pages or
// Cloudflare Pages would, from a folder under the host (a project site's /saqr-alwadi/), on a phone. It asks nothing of
// any other host (fonts, three.js, maps all its own), carries its manifest and icons, and a mission on each shipped map
// runs with no page errors; the start asks the browser for full screen (goLand). node tests/site.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const SITE = path.resolve(__dirname, '..', 'build', 'site'), BASE = 'http://test/saqr-alwadi/';
const types = { '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.js': 'application/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = [], away = [], missing = [];
  page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED') && !m.text().includes('404')) errs.push(m.text()); });
  await page.route('**/*', r => { const u = r.request().url();
    if (!u.startsWith(BASE)) { away.push(u); return r.abort(); }
    let p = decodeURIComponent(new URL(u).pathname).slice('/saqr-alwadi/'.length); if (p === '' || p.endsWith('/')) p += 'index.html';
    const f = path.join(SITE, p);
    if (fs.existsSync(f) && fs.statSync(f).isFile()) return r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' });
    missing.push(p); return r.fulfill({ status: 404, body: '' }); });
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + JSON.stringify(v) : '')); if (!ok) fails.push(w); };
  let nav = 0;  // (a fresh query each time: the hash alone would not load the page again)
  const open = async () => { await page.goto(BASE + '?n=' + (nav++) + '#debug'); await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 }); };
  await open();
  const head = await page.evaluate(async () => { const l = document.querySelector('link[rel=manifest]'); const m = l && await (await fetch(l.href)).json();
    const ok = async s => (await fetch(s)).ok;
    return { site: window.SAQR_SITE, m: m && { display: m.display, orientation: m.orientation, icons: m.icons.length, start: m.start_url },
      icons: m ? await Promise.all(m.icons.map(i => ok(new URL(i.src, l.href)))) : [], touch: await ok(document.querySelector('link[rel=apple-touch-icon]').href) }; });
  check('the manifest: full screen, landscape, two icons there, starting where the site is', head.site === 1 && head.m && head.m.display === 'fullscreen' && head.m.orientation === 'landscape' && head.m.start === './' && head.icons.length === 2 && head.icons.every(Boolean) && head.touch, head);
  const maps = await page.evaluate(() => [...document.querySelectorAll('#mMaps button')].map(b => b.dataset.m));
  check('the menu offers the shipped maps', maps.length >= 3, maps);
  for (const m of maps) for (const ac of ['f15', 'ah64']) {
    await page.evaluate(([m, ac]) => { try { localStorage.setItem('saqr.map', m); localStorage.setItem('saqr.ac', ac); localStorage.setItem('saqr.jstart', 'air'); localStorage.setItem('saqr.tut', '1'); } catch (_) {} }, [m, ac]);
    await open();
    const n0 = errs.length;
    const r = await page.evaluate(() => { const g = window.__saqr; const c = document.querySelector('#mList .mc:not(.camp)'); if (!c) return null; c.click();
      window.__fs = 0; const rf = Element.prototype.requestFullscreen; Element.prototype.requestFullscreen = function (o) { window.__fs++; return rf.call(this, o); };
      document.querySelector('#btnStart').click(); return { map: g.MAP_ID, jet: g.JET }; });
    if (!r) { check(m + '/' + ac + ': a mission to start', false); continue; }
    await page.waitForTimeout(8000);
    const st = await page.evaluate(() => ({ phase: window.__saqr.S.phase, fs: window.__fs, tut: !document.querySelector('#ovTut').hidden }));
    check(`${m}/${ac}: the mission runs on its map (the jet where it flies), full screen asked, no page errors`, st.phase === 'play' && r.map === m && st.fs >= 1 && errs.length === n0, { ...r, ...st, errs: errs.slice(n0, n0 + 3) });
  }
  check('nothing asked of any other host', away.length === 0, away.slice(0, 5));
  check('nothing the page asks for is missing', missing.length === 0, missing.slice(0, 8));
  await browser.close();
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed'); process.exit(fails.length ? 1 : 0);
})();
