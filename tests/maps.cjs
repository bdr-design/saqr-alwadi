// Second map: the menu shows the map picker; choosing the desert reloads into it (its tiles, road, far field,
// missions); each desert mission starts as described; the valley comes back with its own missions and layouts.
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
  // the menu's tabs: the maps and the missions are on «العمليات», the start on «الرئيسية»
  const tab = t => page.click('#nTabs [data-scr="' + t + '"]');
  const errs = [], missing = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errs.push(m.text()); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, decodeURIComponent(p)); if (!fs.existsSync(f)) missing.push(p); if (/^\/maps\/[^/]+\/tiles\/3\//.test(p)) missing.push(p + ' (level 3 is not published)');
      return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  const fails = [], check = (w, ok) => { if (!ok) fails.push(w); };
  const shot = async (n, w) => { await page.waitForTimeout(w || 0); await page.screenshot({ path: `${S}/tests/out/map-${n}.png` }); };
  const loaded = () => page.waitForFunction(() => document.querySelector('#ovLoad').hidden, null, { timeout: 120000 });
  await page.goto('http://test/#debug'); await loaded();
  check('map picker shown', await page.evaluate(() => !document.querySelector('#mMaps').hidden && document.querySelectorAll('#mMaps button').length === 4));
  // to the desert: a reload into the other map
  await Promise.all([page.waitForNavigation(), tab('ops').then(() => page.click('#mMaps button:nth-child(2)'))]);
  await loaded();
  const d = await page.evaluate(() => { const g = window.__saqr; return { id: localStorage.getItem('saqr.map'), w: g.W0, missions: g.MISSIONS.map(m => m.id) }; });
  console.log('desert', JSON.stringify(d));
  check('desert loaded', d.id === 'desert' && d.missions.join() === 'crossing,dunes,wadi_tic,escort,custom');
  await shot('0-menu', 300);
  for (const [i, id] of [[1, 'crossing'], [2, 'dunes']]) {
    await page.evaluate(() => { const g = window.__saqr; g.S.phase = 'brief'; document.querySelector('#ovEnd').hidden = true; document.querySelector('#ovStart').hidden = false; });
    await tab('ops'); await page.click(`#mList .mc:not(.camp) >> nth=${i - 1}`); await tab('home'); await page.click('#btnStart'); await page.waitForTimeout(600);
    const st = await page.evaluate(() => { const g = window.__saqr; return { night: g.S.night, mode: g.plane.mode, targets: g.targets.length, convoy: g.vehicles.filter(v => v.mode === 'convoy').length, hostile: g.houses.filter(h => h.role === 'hostile').length, homes: g.groups.filter(x => x.home).length,
      onRoad: g.vehicles.filter(v => v.mode === 'convoy').every(v => v.x > 700 && v.x < 1060) }; });
    console.log(id, JSON.stringify(st));
    if (id === 'crossing') check('crossing as described', !st.night && st.convoy === 4 && st.hostile === 1 && st.homes === 1 && st.onRoad);
    if (id === 'dunes') check('dunes as described', st.night && st.mode === 'h2' && st.convoy === 3 && st.onRoad);
    await shot('1-' + id, 3000);
    await page.evaluate(() => { const g = window.__saqr; g.toSensor(); g.S.free = false; const v = g.vehicles.find(v => v.mode === 'convoy'); g.S.aimGoal.x = g.S.aim.x = v.x; g.S.aimGoal.y = g.S.aim.y = v.y; g.S.zoomGoal = g.S.zoom = 4; });
    await shot('2-' + id + '-sensor', 3500);
    await page.evaluate(() => { const g = window.__saqr; g.setCockpit(true); g.CK.t = 0; });
  }
  // convoy drives the whole road: 3 minutes of sim, it halts at the wadi and goes on
  const drive = await page.evaluate(() => { const g = window.__saqr; g.startMission(g.MISSIONS[0].layout.map(it => ({ ...it })), g.MISSIONS[0]); const v = g.vehicles.find(v => v.mode === 'convoy'); g.S.frozen = true;
    let minV = 99, halted = false; for (let i = 0; i < 3600; i++) { g.stepSim(0.05); if (i > 400 && v.v < 0.3 && !v.escaped) halted = true; } g.S.frozen = false;
    return { s: Math.round(v.s), escaped: v.escaped, halted }; });
  console.log('convoy run', JSON.stringify(drive));
  check('convoy halts and drives on', drive.halted && (drive.escaped || drive.s > 700));
  // the port and camp map
  await page.evaluate(() => { document.querySelector('#ovStart').hidden = false; });
  await Promise.all([page.waitForNavigation(), tab('ops').then(() => page.click('#mMaps button:nth-child(3)'))]);
  await loaded();
  const pm = await page.evaluate(() => ({ id: localStorage.getItem('saqr.map'), missions: window.__saqr.MISSIONS.map(m => m.id).join() }));
  console.log('port', JSON.stringify(pm));
  check('port loaded', pm.id === 'port' && pm.missions === 'port,camp,quay_tic,raid,escort,custom');
  for (const [i, id] of [[1, 'port'], [2, 'camp']]) {
    await page.evaluate(() => { const g = window.__saqr; g.S.phase = 'brief'; document.querySelector('#ovEnd').hidden = true; document.querySelector('#ovStart').hidden = false; });
    await tab('ops'); await page.click(`#mList .mc:not(.camp) >> nth=${i - 1}`); await tab('home'); await page.click('#btnStart'); await page.waitForTimeout(600);
    const st = await page.evaluate(() => { const g = window.__saqr; return { night: g.S.night, mode: g.plane.mode, targets: g.targets.length, convoy: g.vehicles.filter(v => v.mode === 'convoy').length,
      inMap: g.targets.every(t => t.x > 0 && t.x < g.W0 && t.y > 0 && t.y < 940) }; });
    console.log(id, JSON.stringify(st));
    check(id + ' as described', st.convoy === 3 && st.inMap && st.night === (id === 'camp'));
    await shot('3-' + id, 3000);
    await page.evaluate(() => { const g = window.__saqr; g.toSensor(); g.S.free = false; const v = g.vehicles.find(v => v.mode !== 'convoy'); g.S.aimGoal.x = g.S.aim.x = v.x; g.S.aimGoal.y = g.S.aim.y = v.y; g.S.zoomGoal = g.S.zoom = 4; });
    await shot('4-' + id + '-sensor', 3500);
    // the buildings in the picture: roles from the mission, and they come down
    const waitSim = async dt => { const t0 = await page.evaluate(() => window.__saqr.S.t); await page.waitForFunction(t => window.__saqr.S.t > t, t0 + dt, { timeout: 60000 }); };
    const roles = await page.evaluate(() => { const r = {}; for (const h of window.__saqr.houses) if (h.bld != null) r[h.role] = (r[h.role] || 0) + 1; return r; });
    console.log(id, 'buildings', JSON.stringify(roles));
    check(id + ' buildings', roles.civil === (id === 'port' ? 16 : 17) && roles.hostile === (id === 'port' ? 1 : 3) && roles.struct === 42 - (id === 'port' ? 0 : 3));
    if (id === 'port') {
      // a civilian warehouse: every hit counts, three Rumh missiles bring it down
      const civ = await page.evaluate(async () => { const g = window.__saqr; for (let i = 0; i < 3; i++) g.damageAt(976.8, 177.8, 'msl');
        const h = g.houses.find(h => h.bld != null && Math.abs(h.x - 976.8) < 1); return { civHit: g.S.civHit, civ: g.S.civ, down: !h.standing, shown: h.body.visible }; });
      console.log('civil warehouse', JSON.stringify(civ));
      check('civil warehouse', civ.civHit === 1 && civ.civ === 1 && civ.down && civ.shown);
      await page.evaluate(() => { const g = window.__saqr; g.S.aimGoal.x = g.S.aim.x = 975; g.S.aimGoal.y = g.S.aim.y = 200; g.S.zoomGoal = g.S.zoom = 2; });
      await shot('5-port-warehouse', 2500);
    } else {
      // a fuel tank goes up and takes its neighbour with it; a barracks comes down without counting against the mission
      const r = await page.evaluate(() => { const g = window.__saqr; g.damageAt(765.5, 561.8, 'msl'); g.damageAt(628.8, 668.3, 'msl'); g.damageAt(628.8, 668.3, 'msl');
        const b = g.houses.find(h => h.bld != null && Math.abs(h.x - 628.8) < 1); return { barracks: !b.standing, civ: g.S.civ, civHit: g.S.civHit, kills: g.targets.filter(t => !t.alive).length }; });
      await waitSim(1.5);
      const r2 = await page.evaluate(() => { const g = window.__saqr; return g.houses.filter(h => h.bk === 'tank').map(h => h.standing); });
      console.log('camp strike', JSON.stringify(r), JSON.stringify(r2));
      check('camp buildings', r.barracks && r.civ === 0 && r.civHit === 0 && r2.every(s => !s));
      await page.evaluate(() => { const g = window.__saqr; g.setNight(false); g.S.aimGoal.x = g.S.aim.x = 720; g.S.aimGoal.y = g.S.aim.y = 620; g.S.zoomGoal = g.S.zoom = 2; });
      await shot('5-camp-ruins', 2500);
      await page.evaluate(() => { const g = window.__saqr; g.setCockpit(true); g.CK.t = 0; });
      await shot('6-camp-cockpit', 3000);
    }
    await page.evaluate(() => { const g = window.__saqr; g.setCockpit(true); g.CK.t = 0; });
  }
  // back to the valley
  await page.evaluate(() => { document.querySelector('#ovStart').hidden = false; });
  await page.evaluate(() => { document.querySelector('#ovStart').hidden = false; });
  await Promise.all([page.waitForNavigation(), tab('ops').then(() => page.click('#mMaps button:nth-child(1)'))]);
  await loaded();
  const v = await page.evaluate(() => ({ id: localStorage.getItem('saqr.map'), missions: window.__saqr.MISSIONS.map(m => m.id).join() }));
  console.log('valley', JSON.stringify(v));
  check('valley back', v.id === 'valley' && v.missions.startsWith('convoy,compound,night'));
  console.log('missing files', [...new Set(missing)].filter(p => !p.includes('fonts')));
  check('no missing files', !missing.filter(p => !p.includes('fonts')).length);
  console.log('failures', fails); console.log('errors', errs);
  await browser.close();
  if (fails.length || errs.length) process.exit(1);
})();
