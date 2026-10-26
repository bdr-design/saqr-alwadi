// The ground war: the troops-in-contact mission. Friendlies (blue) are where they should be, marked, on the TSD and
// the glass; the fight on the ground runs (both sides fire, the controller calls it); the enemy's guns and missile
// team go for the aircraft (tracers, a launch, the warner and flares, the pilot's break); hits damage the aircraft;
// fratricide counts; a shoot-down ends the mission. Shots from the seat with tracers and a missile's trail.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const W = +(process.argv[2] || 844), H = +(process.argv[3] || 390);
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errs.push(m.text()); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, p); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 120000 });
  const fails = [], check = (w, ok) => { if (!ok) fails.push(w); };
  const shot = async (name, wait) => { await page.waitForTimeout(wait || 0); await page.screenshot({ path: `${S}/tests/out/war-${name}.png` }); };
  const i = await page.evaluate(() => window.__saqr.MISSIONS.findIndex(m => m.id === 'tic'));
  check('the mission is listed', i >= 0);
  await page.click(`#mList button:nth-child(${i + 1})`); await page.click('#btnStart'); await page.waitForTimeout(800);
  const st = await page.evaluate(() => { const g = window.__saqr; return { friends: g.friends.length, blueVeh: g.friends.filter(f => f.kind === 'vehicle').length, targets: g.targets.length,
    aa: g.targets.filter(t => t.aa > 0).length, guns: g.targets.filter(t => t.gun || t.vk === 'hilux' || t.vk === 'lc79').length, panels: g.friends.filter(f => f.panel && f.panel.visible).length }; });
  console.log('start', JSON.stringify(st));
  check('friendlies and enemy as laid out', st.friends === 4 && st.blueVeh === 2 && st.targets === 5 && st.aa === 1 && st.panels === 4);
  // run the fight ahead of real time
  const run = secs => page.evaluate(secs => {
    const g = window.__saqr, S = g.S, dt = 0.05; S.frozen = true;
    let rounds = 0, launches = 0, nan = false; const n0 = g.missiles.length;
    for (let t = 0; t < secs; t += dt) { const b = g.bursts.reduce((a, b) => a + b.k, 0), m = g.missiles.length; g.stepSim(dt); rounds += Math.max(0, g.bursts.reduce((a, b) => a + b.k, 0) - b); if (g.missiles.length > m) launches++; if (!isFinite(g.plane.x) || !isFinite(g.AC.hp)) nan = true; if (S.phase !== 'play') break; }
    S.frozen = false;
    return { t: +S.missionT.toFixed(0), tic: g.AC.tic, rounds, launches, flares: g.AC.flares, hp: +g.AC.hp.toFixed(0), hits: g.AC.hits, threats: g.AC.threats.size,
      blueHp: g.friends.map(f => Math.round(f.hp)), blueAlive: g.friends.filter(f => f.alive).length, redAlive: g.targets.filter(t => t.alive).length,
      log: g.AC.log.map(l => l.en), known: g.CK.known.size, phase: S.phase, nan };
  }, secs);
  const r1 = await run(90);
  console.log('90 s', JSON.stringify(r1));
  check('contact called', r1.tic && r1.log.some(l => /TROOPS IN CONTACT/.test(l)));
  check('the controller talks a target on and marks it', r1.log.some(l => /RED SMOKE/.test(l)) && r1.known > 0);
  check('both sides fire', r1.rounds > 50);
  check('the enemy goes for the aircraft', r1.threats > 0 && r1.log.some(l => /TAKING FIRE|MISSILE LAUNCH/.test(l)));
  check('no NaN', !r1.nan);
  // a missile launch: the warner, flares, the break
  const ml = await page.evaluate(() => { const g = window.__saqr, u = g.targets.find(t => t.aa > 0 && t.alive) || g.targets.find(t => t.kind === 'personnel' && t.alive); u.aa = Math.max(u.aa, 1); u.aware = true; const f0 = g.AC.flares; g.launchManpads(u);
    const S = g.S; S.frozen = true; let tgt = 'air', flares = 0, ev = false; for (let t = 0; t < 18; t += 0.05) { g.stepSim(0.05); flares = Math.max(flares, g.flares.length); if (g.AC.evade && S.missionT < g.AC.evade.until) ev = true; if (g.missiles[0]) tgt = g.missiles[0].tgt === 'air' ? 'air' : 'flare'; } S.frozen = false;
    return { used: f0 - g.AC.flares, flares, ev, tgt, left: g.missiles.length, msg: g.AC.log.slice(-2).map(l => l.en) }; });
  console.log('missile', JSON.stringify(ml));
  check('the warner put out flares and the pilot broke', ml.used >= 2 && ml.flares > 0 && ml.ev);
  check('the missile is gone after its flight', ml.left === 0);
  // fratricide: our own Hellfire on a friendly squad
  const fr = await page.evaluate(() => { const g = window.__saqr, f = g.friends.find(f => f.alive && f.kind === 'personnel') || g.friends.find(f => f.alive); g.damageAt(f.x, f.y, 'msl'); return { frat: g.S.frat, fratKill: g.S.fratKill, alive: f.alive }; });
  console.log('fratricide', JSON.stringify(fr));
  check('fratricide counted', fr.frat >= 1);
  // the view from the seat: tracers coming up at us, a missile's trail (real time)
  await page.evaluate(() => { const g = window.__saqr; g.S.sel = null; const u = g.targets.find(t => t.vk === 'lc79'); u.alive = true; g.S.aimGoal.x = g.S.aim.x = u.x; g.S.aimGoal.y = g.S.aim.y = u.y; g.ckLook(1, g.CK.IW / 2, g.CK.IH / 2, 14, true);
    for (let k = 0; k < 4; k++) g.timers.push({ t: k * 0.6, fn: () => g.shootBurst(u, 'air') }); const m = g.targets.find(t => t.aa > 0 && t.alive) || g.targets.find(t => t.kind === 'personnel' && t.alive); m.aa = 1; m.aware = true; g.launchManpads(m); });
  await shot('seat-tracers', 1600);
  await shot('seat-missile', 2200);
  await page.evaluate(() => { const g = window.__saqr; g.CK.page.L = 'TSD'; g.CK.mpdT = 0; g.CK.page.R = 'ENG'; g.ckLook(2.0, 836, 625, 14, true); });
  await shot('mpds', 900);
  await page.evaluate(() => { const g = window.__saqr; g.setCockpit(false); g.S.zoomGoal = g.S.zoom = 4; const f = g.friends.find(f => f.alive) || g.friends[0]; g.S.aimGoal.x = g.S.aim.x = f.x + 60; g.S.aimGoal.y = g.S.aim.y = f.y; });
  await shot('sensor-fight', 2500);
  // shot down: the mission ends
  const down = await page.evaluate(() => { const g = window.__saqr; g.AC.hp = 5; g.acHit(10, 'gun'); return { downed: g.AC.downed, phase: g.S.phase, text: document.querySelector('#endText').textContent }; });
  console.log('shot down', JSON.stringify(down));
  check('a shoot-down ends the mission', down.downed && down.phase === 'end' && /أُسقطت/.test(down.text));
  console.log('failures', fails); console.log('errors', errs);
  await browser.close();
  if (fails.length || errs.length) process.exit(1);
})();
