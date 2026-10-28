// Ground-support operations on every map. The escort: the friendly convoy drives, the ambushes hold their fire until
// it is close, then it halts under fire and the controller calls the contact; with the guns in reach of it down it
// moves on, and the mission ends when it is in. Troops in contact on the desert and the port, the night assault on the
// camp. In the theatre: the base attacked (technicals down the road to the junction), and the operation in three phases
// (each tasking once the last is done) that ends only back on the pad. The aircraft and the friendlies are made
// unbreakable here: what is tested is the flow, not the fight.
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
  const shot = async (name, wait) => { await page.waitForTimeout(wait || 0); await page.screenshot({ path: `${S}/tests/out/ops-${name}.png` }); };
  const map = async i => {
    await page.evaluate(() => { window.__saqr.S.phase = 'brief'; document.querySelector('#ovEnd').hidden = true; document.querySelector('#ovStart').hidden = false; });
    // (the maps are on the menu's operations tab)
    await page.click('#nTabs [data-scr="ops"]');
    await Promise.all([page.waitForNavigation(), page.click(`#mMaps button:nth-child(${i})`)]);
    await page.waitForFunction(() => document.querySelector('#ovLoad').hidden && !document.querySelector('#btnStart').disabled, null, { timeout: 180000 });
  };
  const start = id => page.evaluate(id => {
    const g = window.__saqr; g.S.phase = 'brief'; document.querySelector('#ovEnd').hidden = true; document.querySelector('#ovStart').hidden = false;
    const i = g.MISSIONS.findIndex(m => m.id === id); document.querySelectorAll('#mList .mc:not(.camp)')[i].click(); document.querySelector('#btnStart').click();
    g.AC.hp = 1e9; for (const f of g.friends) f.hp = 1e9;
    const blue = g.friends, red = g.targets;
    return { id, night: g.S.night, mode: g.plane.mode, blue: blue.length, escort: blue.filter(f => f.escort).length, red: red.length, quiet: red.filter(t => t.ambush && !t.sprung).length,
      aa: red.filter(t => t.aa).length, hostile: g.houses.filter(h => h.role === 'hostile').length, inMap: [...blue, ...red].every(u => u.x > 0 && u.x < g.W0 && u.y > 0 && u.y < g.H0) };
  }, id);
  // the escort run: the pilot (here) takes out whatever has opened up in reach of the convoy once it has been held
  // for a while, until the convoy is in
  const escortRun = () => page.evaluate(() => {
    const g = window.__saqr, S = g.S, esc = g.friends.filter(f => f.escort), lead = esc[0];
    const s0 = lead.s, gun = t => t.kind === 'vehicle' ? ({ hilux: 1500, mrap: 1500, lc79: 2000 }[t.vk] || 0) : 450;
    let held = 0, firstHold = null, holds = 0, was = false, kills = 0, sBefore = null, t = 0;
    for (; t < 1500 && !S.convoyIn && S.phase === 'play'; t += 0.1) {
      g.stepSim(0.1);
      const h = !!lead.hold || esc.some(f => f.hold);
      if (h && !was) { holds++; if (firstHold == null) { firstHold = t; sBefore = lead.s; } }
      was = h; held = h ? held + 0.1 : 0;
      if (held > 15) {
        const hot = g.targets.filter(u => u.alive && u.kind !== 'house' && !(u.ambush && !u.sprung) && esc.some(f => Math.hypot(u.x - f.x, u.y - f.y) * g.MPP < gun(u) * 0.7));
        for (const u of hot) { g.kill(u); kills++; }
        held = 0;
      }
    }
    return { t: Math.round(t), moved: Math.round((sBefore == null ? lead.s : sBefore) - s0), firstHold: firstHold && Math.round(firstHold), holds, kills, tic: g.AC.tic, in: !!S.convoyIn, phase: S.phase,
      text: document.querySelector('#endText').textContent, log: g.AC.log.map(l => l.en).join(' | ') };
  });

  // ---- the valley: the escort
  let st = await start('escort'); console.log(JSON.stringify(st));
  check('valley escort: 4 in the convoy, the ambushes waiting', st.escort === 4 && st.red === 7 && st.quiet === 7 && st.aa === 1 && st.inMap);
  await page.evaluate(() => { const g = window.__saqr; g.toSensor(); g.S.free = true; const v = g.friends[0]; g.S.aimGoal.x = g.S.aim.x = v.x; g.S.aimGoal.y = g.S.aim.y = v.y; g.S.zoomGoal = g.S.zoom = 4; });
  await shot('1-valley-escort', 2500);
  let r = await escortRun(); console.log('valley escort', JSON.stringify(r));
  check('valley escort: drove, held under fire, contact called, arrived', Math.abs(r.moved) > 60 && r.holds >= 1 && r.tic && r.in && r.phase === 'end' && r.text.includes('وصل الرتل'));

  // ---- the desert: troops in contact at the wadi, the escort
  await map(2);
  st = await start('wadi_tic'); console.log(JSON.stringify(st));
  check('desert TIC as described', !st.night && st.blue === 4 && st.escort === 0 && st.red === 6 && st.aa === 1 && st.inMap);
  const tic = await page.evaluate(() => { const g = window.__saqr; for (let i = 0; i < 100; i++) g.stepSim(0.1); return { tic: g.AC.tic, bursts: g.bursts.length + g.tracers.length, firing: g.targets.filter(t => t.engaging).length }; });
  console.log('desert TIC', JSON.stringify(tic));
  check('desert TIC: contact called, the enemy firing', tic.tic && tic.firing > 0);
  st = await start('escort'); console.log(JSON.stringify(st));
  check('desert escort as described', st.escort === 4 && st.quiet === 6 && st.inMap);
  r = await escortRun(); console.log('desert escort', JSON.stringify(r));
  check('desert escort: arrived', r.in && r.tic && r.phase === 'end');

  // ---- the port: the quay, the night assault, the escort north
  await map(3);
  for (const id of ['quay_tic', 'raid', 'escort']) {
    st = await start(id); console.log(JSON.stringify(st));
    if (id === 'quay_tic') check('quay as described', !st.night && st.blue === 4 && st.red === 6 && st.hostile === 0 && st.inMap);
    if (id === 'raid') check('night assault as described', st.night && st.mode === 'h2' && st.blue === 4 && st.red >= 7 && st.hostile >= 2 && st.inMap);
    if (id === 'escort') { check('port escort as described', st.escort === 3 && st.quiet === 5 && st.inMap); r = await escortRun(); console.log('port escort', JSON.stringify(r)); check('port escort: arrived', r.in && r.phase === 'end'); }
  }
  await page.evaluate(() => { const g = window.__saqr; g.startMission(g.MISSIONS.find(m => m.id === 'raid').layout.map(it => ({ ...it })), g.MISSIONS.find(m => m.id === 'raid')); g.setSensor('wh'); g.toSensor(); g.S.free = true; const v = g.friends[0]; g.S.aimGoal.x = g.S.aim.x = v.x - 40; g.S.aimGoal.y = g.S.aim.y = v.y; g.S.zoomGoal = g.S.zoom = 2; for (let i = 0; i < 80; i++) g.stepSim(0.1); });
  await shot('2-port-raid-flir', 2500);

  // ---- the theatre: the base attacked, the long escort, the operation in phases
  await map(4);
  st = await start('th_def'); console.log(JSON.stringify(st));
  check('base defence: the guard, the attackers', st.mode === 'pad' && st.blue === 4 && st.red === 9 && st.inMap);
  const def = await page.evaluate(() => {
    const g = window.__saqr, rc = g.vehicles.filter(v => v.convoy === 'R'), dorm = rc.every(v => v.dormant);
    for (let i = 0; i < 900; i++) g.stepSim(0.1);
    return { dorm, tic: g.AC.tic, rc: rc.map(v => ({ d: !!v.dormant, off: Math.round(v.haltS - v.s), v: +v.v.toFixed(1) })) };
  });
  console.log('base defence', JSON.stringify(def));
  check('base defence: contact at once, technicals come down the road to the junction', def.dorm && def.tic && def.rc.every(v => !v.d && Math.abs(v.off) < 12 && v.v < 0.5));
  await page.evaluate(() => { const g = window.__saqr; g.toSensor(); g.S.free = true; g.S.aimGoal.x = g.S.aim.x = 2080; g.S.aimGoal.y = g.S.aim.y = 1390; g.S.zoomGoal = g.S.zoom = 1; });
  await shot('3-base-defence', 2500);
  st = await start('th_escort'); console.log(JSON.stringify(st));
  check('long escort as described', st.escort === 4 && st.quiet === 11 && st.inMap);
  st = await start('th_op'); console.log(JSON.stringify(st));
  const op = await page.evaluate(() => {
    const g = window.__saqr, S = g.S, out = [];
    g.setFlight('h1');
    for (let k = 0; k < 3; k++) {
      for (const t of g.targets) if (t.alive) g.kill(t);
      for (let i = 0; i < 160; i++) g.stepSim(0.1);
      for (const f of g.friends) f.hp = 1e9;
      out.push({ phaseI: S.phaseI, targets: g.targets.length, open: g.targets.filter(t => t.alive).length, blue: g.friends.length, rtb: !!S.rtb, phase: S.phase });
    }
    // home: on the glide path's last metres over the pad
    g.placePlane('pad'); g.plane.mode = 'base'; g.plane.altB = g.plane.alt = 410 + 3.2 + 4;
    for (let i = 0; i < 200 && S.phase === 'play'; i++) g.stepSim(0.1);
    return { out, phase: S.phase, text: document.querySelector('#endText').textContent };
  });
  console.log('operation', JSON.stringify(op));
  check('operation: three phases, each tasking after the last', op.out[0].phaseI === 1 && op.out[0].open > 0 && op.out[1].phaseI === 2 && op.out[1].open > 0 && op.out[1].targets > op.out[0].targets);
  check('operation: done only back on the pad', op.out[2].rtb && op.out[2].phase === 'play' && op.phase === 'end' && op.text.includes('القاعدة'));
  // back to the valley for the other tests
  await map(1);
  console.log('failures', fails); console.log('errors', errs);
  await browser.close();
  process.exit(fails.length || errs.length ? 1 : 0);
})();
