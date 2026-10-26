// The armament: the three loadouts; the Longbow radar's scan (what is in its 90° ahead, shoot order); the radar
// Hellfire fired with no laser at the next to shoot, which then comes up on the sensor; the laser Hellfire on people;
// APKWS onto the laser; flechettes on a group in the open (and next to nothing on an armoured vehicle); the
// illumination flare's two minutes; the laser spot tracker on HUNTER's code; the WPN page shot (tests/out/wpn-*.png).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errs.push(m.text()); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 180000 });
  const fails = [], check = (w, ok) => { if (!ok) fails.push(w); };
  const start = (id, load) => page.evaluate(([id, load]) => {
    const g = window.__saqr, S = g.S; S.load = load || 'mix'; S.phase = 'brief'; document.querySelector('#ovEnd').hidden = true; document.querySelector('#ovStart').hidden = false;
    const i = g.MISSIONS.findIndex(m => m.id === id); document.querySelector(`#mList button:nth-child(${i + 1})`).click(); document.querySelector('#btnStart').click();
    g.AC.hp = 1e9; for (const f of g.friends) f.hp = 1e9; S.armed = true;
    return { msl: S.ammo.msl, rkt: S.ammo.rkt, gun: S.ammo.gun, hf: { ...S.hf }, rk: { ...S.rk }, w: S.weapon };
  }, [id, load]);
  // how to get a medium-or-better track on a unit: lock, zoom, wait
  const track = `async (g, t) => { const S = g.S; g.lockOn(t, true); S.zoom = S.zoomGoal = 5; for (let i = 0; i < 100 && S.quality < 3; i++) await new Promise(r => setTimeout(r, 100)); return S.quality; }`;

  const lo = {};
  for (const k of ['at', 'mix', 'cas']) lo[k] = await start('convoy', k);
  console.log('loadouts', JSON.stringify(lo));
  check('loadouts', lo.at.msl === 16 && lo.at.rkt === 0 && lo.at.w !== 'rkt' && lo.mix.msl === 8 && lo.mix.rkt === 38 && lo.cas.msl === 4 && lo.cas.rkt === 57 && lo.cas.gun === 1200);

  // the radar and the RF Hellfire
  await start('convoy', 'mix');
  const rf = await page.evaluate(async () => {
    const g = window.__saqr, S = g.S, P = g.plane, wait = ms => new Promise(r => setTimeout(r, ms));
    const before = g.fireStatePub(); S.weapon = 'msl'; S.hfType = 'rf';
    const noScan = g.fireStatePub().en;
    // point the nose at the convoy and scan
    S.frozen = true; const c = g.vehicles.find(v => v.convoy && v.alive); P.nose = P.nose0 = Math.atan2(c.y - P.y, c.x - P.x);
    g.fcrScan(); for (let t = 0; t < 3 && S.fcrT > 0; t += 0.1) g.stepSim(0.1);   // (stops on the scan's last step: same nose)
    const inSector = g.targets.filter(t => t.kind === 'vehicle' && t.alive && !t.dormant && !t.escaped && Math.hypot(t.x - P.x, t.y - P.y) * g.MPP <= 8000 && Math.abs(Math.atan2(Math.sin(Math.atan2(t.y - P.y, t.x - P.x) - P.nose), Math.cos(Math.atan2(t.y - P.y, t.x - P.x) - P.nose))) <= Math.PI / 4).length;
    const n = S.fcr.length, first = S.fcr[0] && S.fcr[0].t, moving = S.fcr.length && S.fcr[0].mov;
    S.sel = null; S.tracking = false; S.frozen = false;
    const ok = g.fireStatePub().ok; g.fire();
    const m = g.projectiles.find(p => p.type === 'msl');
    for (let i = 0; i < 60 && !S.sel; i++) await wait(50);
    const next = S.sel; S.sel = null; S.tracking = false;   // no laser on it at all
    while (g.projectiles.includes(m)) await wait(50);
    return { noScan, n, inSector, moving, ok, seek: m.seek, nextOn: !!next && next !== first, dead: !first.alive, left: S.hf.rf };
  });
  console.log('fcr/rf', JSON.stringify(rf));
  check('RF needs the radar', rf.noScan === 'NO FCR TGT');
  check('FCR lists what is in its sector, moving first', rf.n > 0 && rf.n === rf.inSector && rf.moving === 1);
  check('RF Hellfire: fire and forget at the NTS, then the next comes up', rf.ok && rf.seek === 'rf' && rf.dead && rf.nextOn && rf.left === 3);

  // laser Hellfire on people, APKWS, flechettes, the spot tracker
  await start('tic', 'cas');
  const r2 = await page.evaluate(async (track) => {
    const g = window.__saqr, S = g.S, wait = ms => new Promise(r => setTimeout(r, ms)), tr = eval(track);
    const pax = g.targets.find(t => t.kind === 'personnel' && t.alive);
    S.weapon = 'msl'; S.hfType = 'sal'; await tr(g, pax); const salPax = g.fireStatePub();
    // APKWS onto a vehicle
    const veh = g.targets.find(t => t.kind === 'vehicle' && t.alive); veh.hp = 1e9;
    S.weapon = 'rkt'; S.rkType = 'gd'; await tr(g, veh); const q = S.quality, gd0 = S.rk.gd; g.fire();
    await wait(300); const m = g.projectiles.find(p => p.wh === 'gd'); let last = null;
    while (m && g.projectiles.includes(m)) { last = Math.hypot(m.x - veh.x, m.y - veh.y) * g.MPP; await wait(30); }
    // flechettes on a group: aim at the men, two rockets
    const grp = g.groups.find(gr => gr.side !== 'blue' && gr.men && gr.men.filter(mm => mm.alive !== false).length >= 2) || g.groups[0];
    const u = g.targets.find(t => t.kind === 'personnel' && t.alive && (t.group === grp || t === grp.unit)) || g.targets.find(t => t.kind === 'personnel' && t.alive);
    const hp0 = u.hp; g.damageAt(u.x, u.y, 'flc'); const flcPax = { before: hp0, after: u.hp, alive: u.alive };
    const mrap = g.friends.find(f => f.vk === 'mrap') || null; let flcMrap = null;
    if (mrap) { mrap.hp = 300; g.damageAt(mrap.x, mrap.y, 'flc'); flcMrap = 300 - mrap.hp; }
    // the spot tracker: HUNTER's laser on code B
    S.sel = null; S.tracking = false; const lt = g.targets.find(t => t.alive && t !== pax); lt.lasedT = 20; lt.lasedCode = 1;
    g.CK.code = 0; g.lstSearch(); const wrong = S.sel; g.CK.code = 1; g.lstSearch(); const right = S.sel === lt;
    return { salPax: salPax.ok || salPax.en, q, gdUsed: gd0 - S.rk.gd, gdMiss: last == null ? null : +last.toFixed(1), flcPax, flcMrap, lstWrong: !!wrong, lstRight: right };
  }, track);
  console.log('laser/rockets', JSON.stringify(r2));
  check('laser Hellfire on people', r2.salPax === true);
  check('APKWS rides the laser onto the target', r2.gdUsed === 1 && r2.gdMiss != null && r2.gdMiss < 2);
  check('flechettes kill in the open, barely scratch armour', !r2.flcPax.alive && (r2.flcMrap == null || r2.flcMrap < 5));
  check('LST finds the spot on its code only', !r2.lstWrong && r2.lstRight);

  // the illumination flare at night
  await start('night', 'mix');
  const il = await page.evaluate(async () => {
    const g = window.__saqr, S = g.S, wait = ms => new Promise(r => setTimeout(r, ms));
    S.weapon = 'rkt'; S.rkType = 'il'; const ok = g.fireStatePub().ok; g.fire();
    for (let i = 0; i < 40 && !g.projectiles.some(p => p.wh === 'il'); i++) await wait(50);
    while (g.projectiles.some(p => p.wh === 'il')) await wait(50);
    const lit = g.illums.length, z0 = g.illums[0] && g.illums[0].z;
    S.zoom = S.zoomGoal = 1; S.free = false; S.aimGoal.x = g.illums[0].x; S.aimGoal.y = g.illums[0].y;
    return { ok, lit, z0, left: S.rk.il };
  });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__saqr.toSensor()); await page.waitForTimeout(1200);
  await page.screenshot({ path: `${S}/tests/out/wpn-illum.png` });
  const il2 = await page.evaluate(() => { const g = window.__saqr; g.S.frozen = true; let t = 0; for (; t < 130 && g.illums.length; t += 0.5) g.stepSim(0.5); g.S.frozen = false; return { burnt: Math.round(t) }; });
  console.log('illum', JSON.stringify({ ...il, ...il2 }));
  check('illumination: one flare, about two minutes', il.ok && il.lit === 1 && il.left === 3 && il2.burnt >= 110 && il2.burnt <= 125);

  // the WPN page with each loadout
  for (const k of ['mix', 'at', 'cas']) {
    await start('convoy', k);
    await page.evaluate(() => { const g = window.__saqr; g.setCockpit && g.setCockpit(true); g.CK.page.R = 'WPN'; });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${S}/tests/out/wpn-${k}.png` });
  }
  check('no page errors', !errs.length);
  if (errs.length) console.log(errs.slice(0, 5).join('\n'));
  await browser.close();
  console.log(fails.length ? 'FAIL: ' + fails.join('; ') : 'ALL OK');
  process.exit(fails.length ? 1 : 0);
})();
