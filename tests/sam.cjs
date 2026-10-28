// The radar SAM against the F-15SA (the armour mission's SA-8): its radar on and off; heard by the warning receiver
// and marked on the TSD with its 10 km; inside its reach it tracks and fires; the jet breaks onto the beam and
// dispenses chaff, then goes back to its orbit; defended, most missiles miss, undefended most hit; with the site's
// radar dark the missile flies blind; outside its reach (a 10 km orbit at 25,000 ft) it never fires. Screenshots of
// the launch from the seat and the TSD into tests/out/sam-*.png.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('saqr.ac', 'f15'); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + JSON.stringify(v) : '')); if (!ok) fails.push(w); };
  const start = () => page.evaluate(() => { const g = window.__saqr, i = g.MISSIONS.findIndex(m => m.id === 'j_armor');
    document.querySelectorAll('#mList .mc')[i].click(); document.querySelector('#btnStart').click(); });
  await start(); await page.waitForTimeout(500);
  // first contact: the radar switched on, the jet in its 5 km orbit at 15,000 ft (inside the reach)
  const first = await page.evaluate(() => { const g = window.__saqr, u = g.targets.find(t => t.vk === 'sa8');
    g.AC.hp = 1e9; for (let i = 0; i < 20; i++) g.stepSim(0.05); u.sam.on = true; u.sam.t = 200;
    let launchT = null; for (let i = 0; i < 20 * 30 && launchT == null; i++) { g.stepSim(0.05); if (g.missiles.some(m => m.kind === 'sam')) launchT = g.S.missionT; }
    for (let i = 0; i < 20 * 2.5; i++) g.stepSim(0.05);
    return { threat: g.AC.threats.has(u), known: g.CK.known.has(u), log: g.AC.log.map(l => l.en), launchT, def: !!g.AC.def, mode: g.JX.P.mode, chaff: g.AC.chaff, rds: u.sam.rds }; });
  check('the warner hears it, the pilot calls it, the TSD marks it', first.threat && first.known && first.log.some(s => /^MUD SPIKE, SA-8/.test(s)), first.log);
  check('inside its reach it tracks, then fires', first.launchT != null && first.rds === 5, first);
  check('the jet breaks (onto the beam) and puts out chaff, the call made', first.def && first.mode === 'nav' && first.chaff < 120 && first.log.some(s => /^MISSILE LAUNCH .* CHAFF, BREAKING/.test(s)), first);
  await page.evaluate(() => { const g = window.__saqr; g.CK.page.R = 'TSD'; g.setCockpit(true); g.CK.t = 0; });
  await page.waitForTimeout(1200); await page.screenshot({ path: S + '/tests/out/sam-1-launch.png' });
  const after = await page.evaluate(() => { const g = window.__saqr; g.targets.find(t => t.vk === 'sa8').sam.cool = 999; for (let i = 0; i < 20 * 30; i++) g.stepSim(0.05); return { def: !!g.AC.def, mode: g.JX.P.mode, missiles: g.missiles.length, log: g.AC.log.map(l => l.en).slice(-3) }; });
  check('the missile gone, back to the orbit', !after.def && after.mode === 'orbit' && after.missiles === 0, after);
  // many launches, defended and not: the beam and the chaff are what save the jet
  const odds = await page.evaluate(() => { const g = window.__saqr, u = g.targets.find(t => t.vk === 'sa8'), res = {};
    for (const defend of [true, false]) {
      let hits = 0, n = 0;
      for (let k = 0; k < 20; k++) {
        g.AC.hp = 1e9; g.AC.chaff = defend ? 120 : 0; g.jetOrbit(g.plane.oc); for (let i = 0; i < 20 * 8; i++) g.stepSim(0.05);
        u.sam.on = true; u.sam.t = 200; u.sam.rds = 6; u.sam.cool = 0; u.sam.trk = 8; u.alive = true; u.hp = 1e9;
        const hp0 = g.AC.hp; g.AC.def = null;
        for (let i = 0; i < 20 * 30 && !g.missiles.length; i++) g.stepSim(0.05);
        if (!g.missiles.length) continue;
        const m = g.missiles[0]; n++;
        if (!defend) { m.noDefend = true; }
        for (let i = 0; i < 20 * 26 && g.missiles.includes(m); i++) { if (!defend) { g.AC.def = null; g.jetOrbit(g.plane.oc); } g.stepSim(0.05); }
        // (a hit from the warhead within its 20 m, not the splinters of a near miss)
        if (hp0 - g.AC.hp >= 45) hits++;
        u.sam.cool = 999;
      }
      res[defend ? 'defended' : 'undefended'] = { n, hits };
    }
    return res; });
  console.log('odds', JSON.stringify(odds));
  check('defended (beam and chaff), most missiles miss', odds.defended.n >= 15 && odds.defended.hits / odds.defended.n < 0.35, odds.defended);
  check('undefended, most hit hard (not all: the radar has its error, the fuze its reach)', odds.undefended.n >= 15 && odds.undefended.hits / odds.undefended.n > 0.55 && odds.undefended.hits < odds.undefended.n, odds.undefended);
  // the site's radar goes dark with the missile in the air: it flies on blind and misses
  const blind = await page.evaluate(() => { const g = window.__saqr, u = g.targets.find(t => t.vk === 'sa8');
    g.AC.hp = 1e9; g.AC.chaff = 0; u.sam.on = true; u.sam.t = 200; u.sam.cool = 0; u.sam.trk = 8; u.sam.rds = 6;
    for (let i = 0; i < 40 && !g.missiles.length; i++) g.stepSim(0.05);
    const m = g.missiles[0], h0 = g.AC.hits; if (!m) return null;
    for (let i = 0; i < 20 * 2; i++) g.stepSim(0.05); u.sam.on = false; u.sam.t = 999;
    for (let i = 0; i < 20 * 26 && g.missiles.includes(m); i++) g.stepSim(0.05);
    return { hit: g.AC.hits > h0, gone: !g.missiles.includes(m) }; });
  check('the radar dark: the missile flies blind and misses', blind && blind.gone && !blind.hit, blind);
  // outside its reach: a 10 km orbit at 25,000 ft
  const out = await page.evaluate(() => { const g = window.__saqr, u = g.targets.find(t => t.vk === 'sa8');
    g.JX.R = 10000; g.JX.h = 25000 * 0.3048; g.AC.def = null; g.jetOrbit(u);
    for (let i = 0; i < 20 * 150; i++) g.stepSim(0.05);
    u.sam.on = true; u.sam.t = 999; u.sam.cool = 0; u.sam.rds = 6; const n0 = u.sam.rds; let minR = 1e9;
    for (let i = 0; i < 20 * 120; i++) { g.stepSim(0.05); minR = Math.min(minR, Math.hypot(Math.hypot(u.x - g.plane.x, u.y - g.plane.y) * g.MPP, g.plane.alt - 410)); }
    return { fired: n0 - u.sam.rds, minR: Math.round(minR) }; });
  check('outside its reach (10 km orbit, 25,000 ft) it never fires', out.fired === 0 && out.minR > 10000, out);
  await page.evaluate(() => { const g = window.__saqr; g.ckLook(2.4, g.CK.IW * 0.64, g.CK.IH * 0.66, 14, true); });
  await page.waitForTimeout(1500); await page.screenshot({ path: S + '/tests/out/sam-2-tsd.png' });
  check('no page errors', !errs.length, errs);
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
