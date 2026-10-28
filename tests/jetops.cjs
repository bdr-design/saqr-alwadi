// The F-15SA's own missions (tools/jet_missions.py): the jet is on the theatre whatever map was chosen, the menu shows
// its six missions (no Apache wording: no pad, no take-off, no landing), each starts on its own orbit with its own
// loadout; Hunter's danger-close rule (a bomb refused near our troops, the Maverick allowed); the pop-up launcher
// (hidden, shows with its coordinates, fires when its time is up); a 2,000 lb bomb brings the big warehouse down;
// bingo fuel ends the mission. Screenshots into tests/out/jetops-*.png.
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
  // (the valley chosen last: the jet must still be on the theatre)
  await ctx.addInitScript(() => { try { localStorage.setItem('saqr.map', 'valley'); localStorage.setItem('saqr.ac', 'f15'); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + (typeof v === 'string' ? v : JSON.stringify(v)) : '')); if (!ok) fails.push(w); };
  const shot = n => page.screenshot({ path: `${S}/tests/out/jetops-${n}.png` });

  // ---- the menu
  const menu = await page.evaluate(() => ({ map: window.__saqr.MAP_ID, maps: document.querySelectorAll('#mMaps button').length,
    ids: window.__saqr.MISSIONS.map(m => m.id), desc: window.__saqr.MISSIONS.map(m => m.desc).join(' '),
    cards: [...document.querySelectorAll('#mList .mc')].map(b => b.querySelector('.t span').textContent) }));
  check('the jet is on the theatre (the valley was chosen)', menu.map === 'theater', menu.map);
  check('one map in the menu', menu.maps === 1, menu.maps);
  check('its nine missions and the custom one', menu.ids.join() === 'j_strike,j_cas,j_convoy,j_tst,j_night,j_sea,j_armor,j_land,j_op,custom', menu.ids.join());
  check('no Apache wording (pad, take-off, landing, base rearm)', !/أقلع|المنصة\b|هبوطك|لإعادة التسليح|من القاعدة/.test(menu.desc));
  check('mission kinds on the cards', menu.cards.join('|') === 'ضربة|إسناد قوات|اعتراض رتل|هدف حساس للوقت|ضربة|اعتراض بحري|اعتراض رتل|اعتراض بحري|عملية|مخصّصة', menu.cards.join('|'));
  await shot('0-menu');

  const start = id => page.evaluate(id => { const g = window.__saqr, i = g.MISSIONS.findIndex(m => m.id === id);
    document.querySelectorAll('#mList .mc')[i].click(); document.querySelector('#btnStart').click(); g.AC.hp = 1e9; }, id);
  const back = () => page.evaluate(() => { document.querySelector('#btnMenu').click(); });

  // ---- each mission: its orbit and its loadout
  for (const [id, load] of [['j_strike', 'strike'], ['j_cas', 'cas'], ['j_convoy', 'standoff'], ['j_tst', 'cas'], ['j_night', 'cas'], ['j_sea', 'cas'], ['j_armor', 'standoff'], ['j_land', 'cas'], ['j_op', 'cas']]) {
    await start(id); await page.waitForTimeout(400);
    const st = await page.evaluate(id => { const g = window.__saqr, m = g.MISSIONS.find(m => m.id === id), p = g.plane, c = m.jet.c;
      return { load: g.S.load, alt: p.alt, d: Math.hypot(p.oc.x - c[0], p.oc.y - c[1]), r: Math.hypot(p.x - c[0], p.y - c[1]) * g.MPP, night: g.S.night, n: g.targets.length }; }, id);
    check(`${id}: on its orbit (15,000 ft, 5 km round its point)`, Math.abs(st.alt - 4572) < 60 && st.d < 1 && Math.abs(st.r - 5000) < 300, st);
    check(`${id}: its loadout`, st.load === load, st.load);
    check(`${id}: targets`, st.n >= 1, st.n);
    if (id === 'j_night') await shot('1-night');
    await back();
  }

  // ---- the strike: five buildings; a 2,000 lb bomb brings the big warehouse down alone, a 500 lb one the store
  await start('j_strike'); await page.waitForTimeout(300);
  const strike = await page.evaluate(() => { const g = window.__saqr, b = g.targets.filter(t => t.kind === 'house');
    const big = b.find(t => t.bld === 45), store = b.find(t => t.bld === 36);
    g.damageAt(big.x, big.y, 'b2000'); g.damageAt(store.x, store.y, 'b500');
    const civ = g.houses.filter(h => h.role === 'civil').length;
    return { n: b.length, big: !big.alive, store: !store.alive, civ, civHit: g.S.civHit }; });
  check('strike: five hostile buildings', strike.n === 5, strike.n);
  check('strike: one 2,000 lb bomb brings the big warehouse down', strike.big);
  check('strike: one 500 lb bomb the arms store', strike.store);
  check('strike: the port and the base civilian, untouched', strike.civ > 10 && strike.civHit === 0, strike);
  await back();

  // ---- CAS: Hunter's danger-close rule
  await start('j_cas'); await page.waitForTimeout(300);
  const cas = await page.evaluate(() => { const g = window.__saqr, near = g.targets.find(t => Math.abs(t.x - 842) < 30 && Math.abs(t.y - 1452) < 30), far = g.targets.find(t => t.vk === 'lc79');
    g.S.armed = true; const out = {};
    g.lockOn(near, true); g.S.weapon = 'lgb'; out.nearLgb = g.jetFireState().en; out.dNear = Math.round(g.jetDanger('lgb', near));
    g.S.weapon = 'agm'; out.nearAgm = g.jetFireState().en;
    g.lockOn(far, true); g.S.weapon = 'lgb'; out.farLgb = g.jetFireState().en; out.dFar = g.jetDanger('lgb', far);
    g.S.weapon = 'jdam'; out.farJdam = g.jetFireState().en;
    g.lockOn(near, true); g.S.weapon = 'lgb'; g.jetConsent(true); out.run = !!g.JX.run;
    return out; });
  check('CAS: a laser bomb 170 m from our troops is refused', cas.nearLgb === 'DANGER CLOSE' && cas.dNear > 120 && cas.dNear < 300, cas);
  check('CAS: the Maverick is not', cas.nearAgm !== 'DANGER CLOSE', cas.nearAgm);
  check('CAS: a bomb 435 m out is cleared', cas.farLgb !== 'DANGER CLOSE' && cas.farJdam !== 'DANGER CLOSE' && cas.dFar === 0, cas);
  check('CAS: no run on a danger-close target, even consented', !cas.run);
  await back();

  // ---- the pop-up launcher
  await start('j_tst'); await page.waitForTimeout(300);
  const sim = (secs) => page.evaluate(s => { const g = window.__saqr; for (let i = 0; i < s * 20; i++) g.stepSim(0.05); }, secs);
  const L = () => page.evaluate(() => { const g = window.__saqr, v = g.vehicles.find(v => v.vk === 'launcher' || v.kind === 'launcher');
    const q = g.toScreenPub(v.x, v.y);
    return { dormant: !!v.dormant, vis: v.body.visible, escaped: v.escaped, alive: v.alive, t: Math.round(g.S.missionT), inView: q.x > 0 && q.x < innerWidth && q.y > 0 && q.y < innerHeight, log: g.AC.log.slice(-2).map(l => l.en) }; });
  let l0 = await L();
  check('TST: the launcher hidden at the start', l0.dormant && !l0.vis, l0);
  await sim(78);
  // (the picture follows in frames, a few a second under SwiftShader)
  await page.waitForFunction(() => { const g = window.__saqr, v = g.vehicles.find(v => v.vk === 'launcher'), q = g.toScreenPub(v.x, v.y); return q.x > 0 && q.x < innerWidth && q.y > 0 && q.y < innerHeight; }, null, { timeout: 60000, polling: 500 }).catch(() => {});
  let l1 = await L();
  check('TST: it shows, the call comes, the pod is slewed onto it', !l1.dormant && l1.vis && l1.inView && l1.log.some(s => /POP-UP/.test(s)), l1);
  await page.evaluate(() => { const g = window.__saqr; g.S.frozen = false; }); await shot('2-tst');
  await sim(190); let l2 = await L();
  check('TST: left alone, it fires and is gone', l2.escaped && !l2.vis && l2.log.some(s => /FIRED/.test(s)), l2);
  await back();

  // ---- the operation: phases come on the radio, no landing at the end
  await start('j_op'); await page.waitForTimeout(300);
  const op = await page.evaluate(() => { const g = window.__saqr; for (const t of g.targets) if (t.alive) g.kill(t);
    for (let i = 0; i < 20 * 16; i++) g.stepSim(0.05);
    const ph2 = { friends: g.friends.length, n: g.targets.filter(t => t.alive).length };
    for (const t of g.targets) if (t.alive) g.kill(t);
    for (let i = 0; i < 20 * 16; i++) g.stepSim(0.05);
    const ph3 = g.targets.filter(t => t.alive).length;
    for (const t of g.targets) if (t.alive) g.kill(t);
    for (let i = 0; i < 20 * 3; i++) g.stepSim(0.05);
    return { ph2, ph3, phase: g.S.phase, end: document.querySelector('#endText').textContent }; });
  check('operation: the second phase brings the patrol and its ambush', op.ph2.friends >= 4 && op.ph2.n >= 3, op.ph2);
  check('operation: the third the launcher', op.ph3 === 1, op.ph3);
  check('operation: over when the last is down, no landing', op.phase === 'end' && !/القاعدة/.test(op.end), op.end);
  await page.waitForTimeout(300);

  // ---- the sea: the dhow leaves the harbour and runs out to sea, its escort beside it; a blast near them and they
  // dash; a fishing boat hit counts as civilian harm; a boat hit burns and goes under
  await back(); await start('j_sea'); await page.waitForTimeout(300);
  const sea = await page.evaluate(() => { const g = window.__saqr, V = k => g.vehicles.find(v => v.vk === k), d = V('dhow'), f = V('fac');
    const out = { targets: g.targets.map(t => t.vk).sort().join(), civil: g.vehicles.filter(v => v.civil).length };
    for (let i = 0; i < 20 * 40; i++) g.stepSim(0.05);
    out.out = d.x < 190 && d.y > 2090; out.v = +d.v.toFixed(1);
    g.damageAt(d.x + 70, d.y, 'b500'); for (let i = 0; i < 20 * 6; i++) g.stepSim(0.05);
    out.dash = +f.v.toFixed(1);
    const c0 = g.S.civHit, fi = g.vehicles.find(v => v.civil); g.damageAt(fi.x, fi.y, 'b500'); out.civHit = g.S.civHit - c0;
    g.damageAt(f.x, f.y, 'b500'); for (let i = 0; i < 20 * 200; i++) g.stepSim(0.05);
    out.facSunk = !f.alive && !!f.sunk; out.dhowEscaped = !!d.escaped;
    return out; });
  check('sea: the dhow, its escort and the rocket boat are the targets; three fishing boats civilian', sea.targets === 'dhow,fac,rktboat' && sea.civil === 3, sea);
  check('sea: the dhow out of the harbour mouth at its cruise', sea.out && Math.abs(sea.v - 4.5) < 0.3, sea);
  check('sea: a blast near, the escort dashes', sea.dash > 15, sea.dash);
  check('sea: a fishing boat hit counts as civilian harm', sea.civHit === 1, sea.civHit);
  check('sea: the escort hit burns and goes under; the dhow left alone gets away', sea.facSunk && sea.dhowEscaped, sea);
  await back();

  // ---- bingo fuel
  await page.evaluate(() => { document.querySelector('#btnAgain').click(); });
  await page.waitForTimeout(300);
  const bingo = await page.evaluate(() => { const g = window.__saqr; g.plane.fuel = 3000; g.checkEnd(); return { phase: g.S.phase, end: document.querySelector('#endText').textContent }; });
  check('bingo fuel ends the mission', bingo.phase === 'end' && /حد الوقود/.test(bingo.end), bingo);

  if (errs.length) check('no page errors', false, errs.join(' | '));
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
