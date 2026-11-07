// The store's cinematic shots from inside the game, 1920 x 1080 (the frames held and stepped, as tools/store_shots.cjs
// does): the ZF-25's back seat at dusk, its pod on the dhow, a strike on a truck, the camp at night in white hot, the
// iPad with HUNTER's 9-line, the takeoff roll, the HX-7 at dusk. No strike on people (Google Play keeps it out).
//   python3 tools/build.py && python3 tools/build_ios_web.py && node tools/store_cine.cjs <out dir> <ar|en> [scenes]
// then into store/graphics/<lang>/ as 2-cockpit-dusk ... 8-apache-dusk (1-home from tools/store_shots.cjs)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = '/home/user/saqr-alwadi', WEB = path.join(ROOT, 'ios', 'web'), OUT = process.argv[2], LANG = process.argv[3] || 'ar', ONLY = process.argv[4] || '';
const types = { '.html': 'text/html', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function open(browser, ac, map, tod, start) {
  const ctx = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(([lang, ac, map, tod, start]) => {
    try { localStorage.setItem('saqr.lang', lang); localStorage.setItem('saqr.ac', ac); localStorage.setItem('saqr.map', map); localStorage.setItem('saqr.hi', '1'); localStorage.setItem('saqr.jstart', start); localStorage.setItem('saqr.tod', tod); localStorage.setItem('saqr.assist', '0'); } catch (_) {}
    const q = []; let manual = false;
    window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
    window.__step = t => { const cbs = q.splice(0); for (const cb of cbs) cb(t); };
    setInterval(() => { if (!manual) window.__step(performance.now()); }, 16);
    window.__manual = () => { manual = true; window.__T = performance.now(); };
  }, [LANG, ac, map, tod, start]);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = new URL(r.request().url());
    if (u.host !== 'app.local') return r.abort();
    const f = path.join(WEB, decodeURIComponent(u.pathname === '/' ? '/index.html' : u.pathname));
    return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(f)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); });
  await page.goto('https://app.local/index.html#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 180000 });
  await page.evaluate(() => document.fonts.ready); await wait(1000);
  return { ctx, page, errs };
}
const shot = (page, name) => page.screenshot({ path: path.join(OUT, LANG + '-' + name + '.png') });
async function settle(page, n) { await page.evaluate(() => { if (!window.__T) window.__manual(); }); for (let i = 0; i < n; i++) await page.evaluate(() => { window.__T += 1000 / 30; window.__step(window.__T); }); }
async function start(page, id, n) {
  await page.evaluate(id => { const g = window.__saqr, i = g.MISSIONS.findIndex(m => m.id === id); document.querySelector('#nTabs [data-scr="ops"]').click();
    document.querySelectorAll('#mList .mc:not(.camp)')[i].click(); document.querySelector('#nTabs [data-scr="home"]').click(); document.querySelector('#btnStart').click(); }, id);
  await settle(page, n || 300);
}
const quiet = page => page.evaluate(() => { const g = window.__saqr; if (g.EFB.task) g.EFB.task.state = 'wilco'; g.EFB.unseen = 0; g.EFB.chkNew = false; g.S.assist = false; g.efbShow(false); g.AC.hp = 1e9; });
const pod = async (page, find, sensor, zoom) => {
  await page.evaluate(([find, sensor, zoom]) => { const g = window.__saqr, S = g.S, t = eval(find); g.toSensor(); g.setSensor(sensor); S.blank = 0; g.lockOn(t, true); S.zoom = S.zoomGoal = zoom; window.__tgt = t; }, [find, sensor, zoom]);
  await page.addStyleTag({ content: '#railL,#railR,#dock{display:none!important}' });
};
const want = k => !ONLY || ONLY.split(',').includes(k);
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  if (want('dusk')) { // the back seat at dusk over the coast, then the pod on the dhow in the low sun
    const { ctx, page, errs } = await open(browser, 'f15', 'theater', 'dusk', 'air');
    await start(page, 'j_sea'); await quiet(page); await settle(page, 90);
    await shot(page, '1-cockpit-dusk');
    await pod(page, "g.vehicles.find(v => v.vk === 'dhow')", 'eo', 10); await settle(page, 240);
    await shot(page, '2-pod-dhow');
    console.log('dusk', errs); await ctx.close();
  }
  if (want('strike')) { // a laser bomb on a truck at the depots: the fireball in the pod
    const { ctx, page, errs } = await open(browser, 'f15', 'theater', 'day', 'air');
    await start(page, 'j_strike'); await quiet(page);
    await pod(page, "g.targets.find(t => t.alive && t.kind === 'vehicle')", 'eo', 12); await settle(page, 150);
    await page.evaluate(() => { const g = window.__saqr, t = window.__tgt; g.explode(t.x, t.y, 2.4); g.kill(t); });
    await settle(page, 5); await shot(page, '3-strike');
    await settle(page, 4); await shot(page, '3c-strike');
    await settle(page, 30); await shot(page, '3b-strike-smoke');
    console.log('strike', errs); await ctx.close();
  }
  if (want('night')) { // the night camp in the thermal sight, white hot
    const { ctx, page, errs } = await open(browser, 'f15', 'theater', 'night', 'air');
    await start(page, 'j_night'); await quiet(page);
    await pod(page, "g.targets.find(t => t.alive && t.kind === 'vehicle')", 'wh', 9); await settle(page, 150);
    // (a truck of theirs burning beside the one in the sight: the heat in white)
    await page.evaluate(() => { const g = window.__saqr, t = window.__tgt, o = g.targets.filter(u => u.alive && u.kind === 'vehicle' && u !== t).sort((a, b) => Math.hypot(a.x - t.x, a.y - t.y) - Math.hypot(b.x - t.x, b.y - t.y))[0] || t; g.explode(o.x, o.y, 1.6); g.kill(o); });
    await settle(page, 120); await shot(page, '4-night-ir');
    await page.evaluate(() => window.__saqr.setSensor('bh')); await settle(page, 20); await shot(page, '4b-night-bh');
    console.log('night', errs); await ctx.close();
  }
  if (want('efb')) { // the 9-line on the iPad, raised in the back seat
    const { ctx, page, errs } = await open(browser, 'f15', 'theater', 'day', 'air');
    await start(page, 'j_cas'); await page.evaluate(() => { const g = window.__saqr; g.S.assist = false; g.AC.hp = 1e9; g.EFB.tab = 'map'; g.EFB.card = true; g.efbShow(true); });
    await settle(page, 90); await shot(page, '5-ipad');
    console.log('efb', errs); await ctx.close();
  }
  if (want('takeoff')) { // the takeoff roll on runway 18
    const { ctx, page, errs } = await open(browser, 'f15', 'theater', 'day', 'base');
    await start(page, 'j_strike', 150);
    await page.evaluate(() => { const g = window.__saqr, h = g.EFB.hits.find(h => h.cue === 'efb:wilco'); h && h.fn(); g.S.assist = false; });
    await settle(page, 60); await page.evaluate(() => { const g = window.__saqr; g.jetSkipOut(); g.efbShow(false); });
    for (let i = 0; i < 80; i++) { await settle(page, 15); const k = await page.evaluate(() => { const g = window.__saqr; return g.JX.gs ? g.JX.gs.st + ' ' + Math.round(g.JX.ac.o.kcas || 0) : 'x'; }); if (/takeoff (1[2-9]\d|[2-9]\d\d)/.test(k)) break; }
    await shot(page, '6-takeoff');
    console.log('takeoff', errs); await ctx.close();
  }
  if (want('apache')) { // the Sahm over the valley at dusk
    const { ctx, page, errs } = await open(browser, 'ah64', 'valley', 'dusk', 'air');
    await start(page, 'tic'); await page.evaluate(() => { window.__saqr.AC.hp = 1e9; }); await settle(page, 60);
    await shot(page, '7-apache-dusk');
    console.log('apache', errs); await ctx.close();
  }
  await browser.close();
})();
