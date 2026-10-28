// Smoke over the laser's spot (smokeOver): a burning wreck's smoke over the next target, the laser bomb is refused
// (OBSCURED) while it covers it, and one dropped into it loses the spot and falls wide; the smoke thins and drifts off,
// and the target is clear again for the laser.
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
  const start = id => page.evaluate(id => { const g = window.__saqr, i = g.MISSIONS.findIndex(m => m.id === id);
    document.querySelectorAll('#mList .mc')[i].click(); document.querySelector('#btnStart').click(); g.AC.hp = 1e9; }, id);
  await start('j_strike'); await page.waitForTimeout(600);
  const r = await page.evaluate(() => {
    const g = window.__saqr, S = g.S, out = {};
    S.frozen = true;
    // a truck burning 10 m from the next target, upwind of it (as in a column after the first bomb)
    const A = g.makeVehicle({ kind: 'cargo', mode: 'parked', x: 1000, y: 1500, h: 0 }), t = g.makeVehicle({ kind: 'cargo', mode: 'parked', x: 1000 + 10 / g.MPP, y: 1500, h: 0 });
    S.sel = t; S.tracking = true; S.quality = 3; t.pid = t.cleared = true; S.armed = true; S.weapon = 'lgb'; S.ammo.lgb = 4;
    out.clear0 = +g.smokeOver(t.x, t.y).toFixed(2);
    g.kill(A); for (let i = 0; i < 20 * 10; i++) g.stepSim(0.05);
    out.smoke = +g.smokeOver(t.x, t.y).toFixed(2); out.state = g.fireStatePub().en;
    // a laser bomb 25 m off it, 4 s from impact: it should steer onto it, but cannot see the spot
    const drop = (tti) => { const p = { type: 'lgb', heavy: false, target: null, tgt: t, x: t.x + 25 / g.MPP, y: t.y, tti, tof: tti, shot: { hit: false }, cep: 0 }; g.projectiles.push(p); t.hp = 1e9; t.alive = true;
      for (let i = 0; i < 20 * (tti + 1) && g.projectiles.includes(p); i++) { S.sel = t; S.tracking = true; S.quality = 3; g.stepSim(0.05); }
      return { miss: Math.round(Math.hypot(p.ix - t.x, p.iy - t.y) * g.MPP), blind: !!p.wasBlind }; };
    out.blindDrop = drop(4);
    // the fire dies down and the smoke drifts off
    // (it comes and goes as the puffs drift over: clear for 10 s on end)
    let k = 0, ok = 0; while (ok < 20 * 10 && k++ < 20 * 300) { g.stepSim(0.05); ok = g.smokeOver(t.x, t.y) > g.SMOKE_LOST_PUB ? 0 : ok + 1; }
    out.clearAfter = 10 + Math.round(k / 20); out.state2 = g.fireStatePub().en;
    out.seeDrop = drop(6);
    S.frozen = false; return out; });
  console.log(JSON.stringify(r));
  check('a burning wreck by the target covers it: the laser bomb refused (OBSCURED)', r.clear0 < 0.2 && r.smoke > 1 && r.state === 'OBSCURED', r);
  check('a laser bomb into it loses the spot and falls wide', r.blindDrop.blind && r.blindDrop.miss > 15, r.blindDrop);
  check('the smoke thins in a minute or so, the target clear again', r.clearAfter > 20 && r.clearAfter < 200 && r.state2 !== 'OBSCURED', r);
  check('then the laser bomb steers onto it', r.seeDrop.miss < 6, r.seeDrop);
  check('no page errors', !errs.length, errs);
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
