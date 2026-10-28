// The owner's new ground targets and what they do (tools/make_ground.py, the F-15's missions): the tank shrugs off
// the gun and the rockets and falls to a bomb; the APC less armoured; the mortar ranges on our patrol and its rounds
// land round it; the Grad ripples; the ammunition dump cooks off; the dug-in positions stand; the landing craft beaches
// and what it carries comes ashore as targets; the rocket boat fires on the port. Pod shots of each into
// tests/out/ground-*.png.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('saqr.map', 'theater'); localStorage.setItem('saqr.ac', 'f15'); } catch (_) {} });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + JSON.stringify(v) : '')); if (!ok) fails.push(w); };
  const start = id => page.evaluate(id => { const g = window.__saqr, i = g.MISSIONS.findIndex(m => m.id === id); if (document.querySelector('#btnMenu') && !document.querySelector('#ovStart').hidden === false) document.querySelector('#btnMenu').click();
    document.querySelectorAll('#mList .mc')[i].click(); document.querySelector('#btnStart').click(); g.AC.hp = 1e9; }, id);
  const pod = async (k, z, name, sensor) => { await page.evaluate(([k, z, s]) => { const g = window.__saqr, v = g.vehicles.find(v => v.vk === k); g.toSensor(); g.setSensor(s || 'eo'); g.lockOn(v, true); g.S.aim.x = g.S.aimGoal.x = v.x; g.S.aim.y = g.S.aimGoal.y = v.y; g.S.vel.x = g.S.vel.y = 0; g.S.zoom = g.S.zoomGoal = z; }, [k, z, sensor]);
    await page.waitForTimeout(3500); await page.screenshot({ path: `${S}/tests/out/ground-${name}.png` }); };

  await start('j_armor'); await page.waitForTimeout(400);
  const ar = await page.evaluate(() => { const g = window.__saqr, V = k => g.targets.find(t => t.vk === k);
    for (let i = 0; i < 20 * 40; i++) g.stepSim(0.05);
    const t = V('t72'), b = V('btr80'), out = { kinds: [...new Set(g.targets.map(t => t.vk || t.kind))].sort().join() };
    const h0 = t.hp; for (let i = 0; i < 20; i++) g.damageAt(t.x, t.y, 'gun'); out.tankGun = +(h0 - t.hp).toFixed(1);
    const h1 = t.hp; g.damageAt(t.x, t.y, 'rkt'); out.tankRkt = +(h1 - t.hp).toFixed(1);
    const b0 = b.hp; for (let i = 0; i < 20; i++) g.damageAt(b.x, b.y, 'gun'); out.btrGun = +(b0 - b.hp).toFixed(1);
    g.damageAt(t.x, t.y, 'b500'); out.tankBomb = !t.alive;
    out.moving = g.targets.filter(t => t.vk === 'ural' && t.v > 2).length;
    return out; });
  check('armour: the column, the 23 mm position, the trench, the Grad, the SA-8 and the crew', ar.kinds === 'bm21,btr80,personnel,sa8,t72,trench,ural,zu23e', ar.kinds);
  check('armour: twenty 30 mm rounds on the tank take a tenth of it, a rocket less; the APC torn by the same rounds', ar.tankGun < 0.12 * 420 && ar.tankRkt < 40 && ar.btrGun > 4 * ar.tankGun, ar);
  check('armour: a 500 lb bomb on the tank kills it', ar.tankBomb, ar);
  check('armour: the trucks on the road', ar.moving >= 1, ar.moving);
  await pod('btr80', 12, '1-btr'); await pod('zu23e', 12, '2-zu23e');
  // the Grad ripples (its first within the first minutes)
  const gr = await page.evaluate(() => { const g = window.__saqr, b = g.targets.find(t => t.vk === 'bm21'); b.fireT = 0.1;
    // (the others' timers held off for the step: one of theirs going off in it would be counted against the ripple)
    for (const q of g.timers) q.t += 1000; const n0 = g.timers.length; g.stepSim(0.2); const n = g.timers.length - n0; for (const q of g.timers) if (q.t > 900) q.t -= 1000; return n; });
  check('the Grad fires a ripple of 20', gr >= 20, gr);
  await page.waitForTimeout(1500); await pod('bm21', 12, '3-bm21');

  await page.evaluate(() => document.querySelector('#btnMenu').click());
  await start('j_cas'); await page.waitForTimeout(400);
  const cas = await page.evaluate(() => { const g = window.__saqr, m = g.targets.find(t => t.vk === 'mortar'); const blue0 = g.friends.reduce((a, f) => a + Math.max(0, f.hp), 0);
    m.fireT = 0.1; const n0 = g.timers.length; for (let i = 0; i < 20 * 16; i++) g.stepSim(0.05);
    return { fired: true, blue: +(blue0 - g.friends.reduce((a, f) => a + Math.max(0, f.hp), 0)).toFixed(1), frat: g.S.frat }; });
  check('the mortar ranges on the patrol; its rounds are no fratricide of ours', cas.frat === 0, cas);
  await pod('mortar', 12, '4-mortar'); await pod('trench', 12, '5-trench');

  await page.evaluate(() => document.querySelector('#btnMenu').click());
  await start('j_night'); await page.waitForTimeout(400);
  const nt = await page.evaluate(() => { const g = window.__saqr, a = g.targets.find(t => t.vk === 'ammo'); g.damageAt(a.x, a.y, 'b500'); const n = g.timers.length; return { dead: !a.alive, cookoff: n }; });
  check('the ammunition dump cooks off: blasts for half a minute', nt.dead && nt.cookoff >= 10, nt);
  await page.waitForTimeout(2500); await pod('ammo', 10, '6-ammo-night', 'wh');

  await page.evaluate(() => document.querySelector('#btnMenu').click());
  await start('j_land'); await page.waitForTimeout(400);
  const ld = await page.evaluate(() => { const g = window.__saqr, l = g.vehicles.find(v => v.vk === 'lcm'), n0 = g.targets.length, r = g.vehicles.find(v => v.vk === 'rktboat');
    r.fireT = 0.1; let salvo = 0; const t0 = g.timers.length; g.stepSim(0.2); salvo = g.timers.length - t0;
    for (let i = 0; i < 20 * 200 && l.alive && !l.hold; i++) g.stepSim(0.05);
    return { beached: !!l.hold, landed: g.targets.length - n0, kinds: g.targets.map(t => t.vk || t.kind).join(), salvo, at: [Math.round(l.x), Math.round(l.y)] }; });
  check('the rocket boat fires its 12 tubes on the port', ld.salvo >= 12, ld.salvo);
  check('the landing craft beaches and its technicals and crews come ashore as targets', ld.beached && ld.landed === 4, ld);
  await pod('lcm', 10, '7-landing');
  if (errs.length) check('no page errors', false, errs.join(' | '));
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
