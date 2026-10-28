// The infantry (tools/make_infantry.py, makeGroup): in the valley's troops-in-contact mission, the enemy group calm
// (standing and walking, their shadows from their feet), in a fight (one man kneeling and firing, the rest holding),
// scattered and down after a rocket 26 m off, then hit by one: each man by his distance, the dead left where they
// fell (and warm on the thermal), and our own squad. Shots into tests/out/infantry/ (or the folder given).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..'), OUT = process.argv[2] || S + '/tests/out/infantry';
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + JSON.stringify(v) : '')); if (!ok) fails.push(w); };
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('saqr.map', 'valley'); localStorage.setItem('saqr.ac', 'ah64'); } catch (_) {} });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
  await page.evaluate(() => { const g = window.__saqr, i = g.MISSIONS.findIndex(m => m.id === 'tic'); document.querySelectorAll('#mList .mc:not(.camp)')[i].click(); document.querySelector('#btnStart').click(); });
  await page.waitForTimeout(500);
  await page.evaluate(() => { window.__saqr.toSensor(); window.__saqr.AC.hp = 1e9; });

  const P = {};
  const lookAt = (x, y, z) => page.evaluate(([x, y, z]) => { const g = window.__saqr; g.S.zoom = g.S.zoomGoal = z; g.S.aim.x = g.S.aimGoal.x = x; g.S.aim.y = g.S.aimGoal.y = y; g.S.vel.x = g.S.vel.y = 0; g.S.tracking = false; g.S.free = true; g.S.sel = null; }, [x, y, z]);
  const sensor = s => page.evaluate(s => window.__saqr.setSensor(s), s);
  const shot = async (n, w) => { await page.waitForTimeout(w || 2500); await page.screenshot({ path: OUT + '/' + n + '.png' }); };
  const G = () => page.evaluate(() => { const g = window.__saqr, t = g.groups.find(t => t.side === 'red' && !t.aa); return { x: t.x, y: t.y, fx: t.flee ? t.flee.x : t.x, fy: t.flee ? t.flee.y : t.y }; });
  let p = await G(); await lookAt(p.x, p.y, 12); await shot('1-calm', 3500);
  await page.evaluate(() => { const g = window.__saqr, t = g.groups.find(t => t.side === 'red' && !t.aa), b = g.friends.find(f => f.kind === 'personnel'); for (let k = 0; k < 3; k++) g.timers.push({ t: k * 0.3, fn: () => g.shootBurst(t, b) }); });
  await shot('2-fight', 1200);
  await page.evaluate(() => { const g = window.__saqr, t = g.groups.find(t => t.side === 'red' && !t.aa); t.fightT = 0; for (const m of t.men) m.aimT = 0; g.damageAt(t.x + 26, t.y + 8, 'rkt'); });
  await page.waitForTimeout(6500); p = await G(); await lookAt(p.x, p.y, 12); await shot('3-down', 2500);
  await page.evaluate(() => { const g = window.__saqr, t = g.groups.find(t => t.side === 'red' && !t.aa); const m = t.men.filter(m => m.alive)[0]; g.damageAt(m.x + 4, m.y + 2, 'rkt'); });
  p = await G(); await lookAt(p.x, p.y, 12); await shot('4-hit', 2000);
  const hit = await page.evaluate(() => { const g = window.__saqr, t = g.groups.find(t => t.side === 'red' && !t.aa);
    return { dead: t.men.filter(m => !m.alive).length, shown: t.men.filter(m => !m.alive && m.body.visible && m.pose === 'dead').length, n: t.men.length, hp: t.hp, alive: t.alive, poses: [...new Set(t.men.map(m => m.pose))] }; });
  check('a rocket among them: men down one by one, their bodies left on the ground', hit.dead >= 1 && hit.shown === hit.dead && hit.hp <= (hit.n - hit.dead) * 10, hit);
  await sensor('wh'); await shot('5-whot', 2000); await sensor('eo');
  await page.evaluate(() => { const g = window.__saqr, b = g.friends.find(f => f.kind === 'personnel'); g.S.zoom = g.S.zoomGoal = 12; g.S.aim.x = g.S.aimGoal.x = b.x; g.S.aim.y = g.S.aimGoal.y = b.y; });
  await shot('6-blue', 3000);
  const end = await page.evaluate(() => { const g = window.__saqr, t = g.groups.find(t => t.side === 'red' && !t.aa); g.kill(t); return { alive: t.alive, live: t.men.filter(m => m.alive).length, shown: t.men.filter(m => m.body.visible).length, n: t.men.length }; });
  check('the group down: every man on the ground, none vanished', !end.alive && end.live === 0 && end.shown === end.n, end);
  if (errs.length) check('no page errors', false, errs.join(' | '));
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
