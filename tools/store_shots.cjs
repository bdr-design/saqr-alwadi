// The store's pictures, from the game as the apps carry it (tools/build_ios_web.py: ios/web, with its own fonts):
// 1920 x 1080 screenshots in each language (the menu, the operations map, the hangar, the F-15SA's cockpit and its
// pod on the smuggling dhow, the Apache's cockpit), the 512 px icon and the 1024 x 500 feature graphic.
//   python3 tools/build.py && python3 tools/build_ios_web.py && node tools/store_shots.cjs   ->  store/graphics/
// (no strike on people in them: Google Play keeps violence out of a listing's pictures)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..'), WEB = path.join(ROOT, 'ios', 'web'), OUT = path.join(ROOT, 'store', 'graphics');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const wait = ms => new Promise(r => setTimeout(r, ms));

async function open(browser, lang, ac, map) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(([lang, ac, map]) => {
    try { localStorage.setItem('saqr.lang', lang); localStorage.setItem('saqr.ac', ac); localStorage.setItem('saqr.map', map); localStorage.setItem('saqr.hi', '1'); localStorage.setItem('saqr.jstart', 'air'); } catch (_) {}
    // the page's frames held, as the trailer's rig holds them (tools/trailer/rig.cjs): run on a timer until a scene is
    // to settle, then a step at a time, so the slow software renderer has every frame drawn and the tiles in
    const q = []; let manual = false;
    window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
    window.__step = t => { const cbs = q.splice(0); for (const cb of cbs) cb(t); };
    setInterval(() => { if (!manual) window.__step(performance.now()); }, 16);
    window.__manual = () => { manual = true; window.__T = performance.now(); };
  }, [lang, ac, map]);
  const page = await ctx.newPage();
  await page.route('**/*', r => { const u = new URL(r.request().url());
    if (u.host !== 'app.local') return r.abort();
    const f = path.join(WEB, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(f)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); });
  await page.goto('https://app.local/index.html#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 180000 });
  await page.evaluate(() => document.fonts.ready);
  await wait(1200);
  return { ctx, page };
}
const shot = (page, lang, name) => page.screenshot({ path: path.join(OUT, lang, name + '.png') });
// n frames, a 30th of a second each
async function settle(page, n) {
  await page.evaluate(() => window.__manual());
  for (let i = 0; i < n; i++) await page.evaluate(() => { window.__T += 1000 / 30; window.__step(window.__T); });
}
const tab = (page, scr) => page.evaluate(s => document.querySelector('#nTabs [data-scr="' + s + '"]').click(), scr);
async function start(page, id) {
  await page.evaluate(id => { const g = window.__saqr, i = g.MISSIONS.findIndex(m => m.id === id); document.querySelector('#nTabs [data-scr="ops"]').click();
    document.querySelectorAll('#mList .mc:not(.camp)')[i].click(); document.querySelector('#nTabs [data-scr="home"]').click(); document.querySelector('#btnStart').click(); }, id);
  await settle(page, 300);   // (ten seconds: the tiles in, the check-in said)
}

(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const lang of ['ar', 'en']) {
    fs.mkdirSync(path.join(OUT, lang), { recursive: true });
    { // the Apache: the menu's home, then its cockpit over the valley
      const { ctx, page } = await open(browser, lang, 'ah64', 'valley');
      await shot(page, lang, '1-home');
      await start(page, 'tic');
      await shot(page, lang, '6-apache');
      await ctx.close();
    }
    { // the F-15SA over the theatre: the operations map, the hangar, the back seat, the pod on the dhow
      const { ctx, page } = await open(browser, lang, 'f15', 'theater');
      await tab(page, 'ops');
      await page.evaluate(() => { const g = window.__saqr, i = g.MISSIONS.findIndex(m => m.id === 'j_sea'); document.querySelectorAll('#mList .mc:not(.camp)')[i].click(); });
      await wait(1500);
      await shot(page, lang, '2-operations');
      await tab(page, 'arm'); await wait(600);
      await shot(page, lang, '3-hangar');
      // (on station, in the air; the iPad lowered: the tasking answered, so neither it nor its key's light shows)
      await start(page, 'j_sea');
      await page.evaluate(() => { const g = window.__saqr; if (g.EFB.task) g.EFB.task.state = 'wilco'; g.EFB.unseen = 0; g.EFB.chkNew = false; g.S.assist = false; g.efbShow(false); });
      await settle(page, 60);
      await shot(page, lang, '4-cockpit');
      await page.evaluate(() => { const g = window.__saqr, S = g.S, CK = g.CK, d = g.vehicles.find(v => v.vk === 'dhow');
        CK.goal = 1; CK.t = 1; g.toSensor(); g.setSensor('eo'); S.blank = 0; g.lockOn(d, true); S.zoom = S.zoomGoal = 10; });
      // (the pod's picture with its symbology alone, as in the trailers: the panel's buttons aside)
      await page.addStyleTag({ content: '#railL,#railR,#dock{display:none!important}' });
      await settle(page, 240);
      await shot(page, lang, '5-pod');
      await ctx.close();
    }
  }
  // the icon (512 px) and the feature graphic (1024 x 500): the F-15SA in flight, the name over its sky
  const page = await (await browser.newContext({ viewport: { width: 1024, height: 500 } })).newPage();
  await page.route('**/*', r => { const u = new URL(r.request().url());
    if (u.host !== 'app.local') return r.abort();
    const f = path.join(WEB, decodeURIComponent(u.pathname));
    return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(f)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); });
  const css = fs.readFileSync(path.join(WEB, 'index.html'), 'utf8').match(/<style>(\/\* cyrillic-ext \*\/[\s\S]*?)<\/style>/)[1];
  fs.writeFileSync(path.join(WEB, 'feature.html'), `<!doctype html><meta charset="utf-8"><style>${css}
    html,body{margin:0;width:1024px;height:500px;overflow:hidden;background:#000}
    .bg{position:absolute;inset:0;background:url(sprites/menu/hero_f15.webp) 30% 50%/cover}
    .v{position:absolute;inset:0;background:linear-gradient(90deg,rgba(0,0,0,0) 30%,rgba(0,0,0,.55) 100%)}
    .t{position:absolute;right:56px;top:50%;transform:translateY(-50%);text-align:right;color:#fff}
    .t b{display:block;font:800 92px/1.15 "Noto Kufi Arabic";direction:rtl}
    .t i{display:block;font:600 22px "IBM Plex Sans Condensed";letter-spacing:.42em;font-style:normal;margin-top:6px;opacity:.85}</style>
    <div class="bg"></div><div class="v"></div><div class="t"><b>صقر الوادي</b><i>SAQR AL-WADI</i></div>`);
  await page.goto('https://app.local/feature.html');
  await page.evaluate(() => document.fonts.ready); await wait(800);
  await page.screenshot({ path: path.join(OUT, 'feature-1024x500.png') });
  fs.unlinkSync(path.join(WEB, 'feature.html'));
  await browser.close();
  console.log('store/graphics: done');
})();
