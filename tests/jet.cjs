// The F-15SA in the game: chosen in the menu, on station at 20,000 ft in the theatre, the back seat by day and night,
// the pod full screen, the TSD; the pilot asks for the run, the officer consents on the UFC, the run, the release,
// the bomb's fall and hit; a JDAM and a Maverick; the frame time. Screenshots into tests/out/jet-*.png.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const W = +(process.argv[2] || 844), H = +(process.argv[3] || 390);
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('saqr.map', 'theater'); localStorage.setItem('saqr.ac', 'f15'); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errs.push(m.text()); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + v : '')); if (!ok) fails.push(w); };
  const shot = async (n, wait) => { await page.waitForTimeout(wait || 0); await page.screenshot({ path: `${S}/tests/out/jet-${n}.png` }); };
  await shot('0-menu');
  check('menu shows the F-15SA', await page.evaluate(() => document.querySelector('#mSub').textContent.includes('F-15SA') && document.querySelector('#segAC [data-a="f15"]').classList.contains('on')));
  // the first mission
  await page.evaluate(() => { document.querySelector('#mList button').click(); document.querySelector('#btnStart').click(); const g = window.__saqr; g.AC.hp = 1e9; });
  await page.waitForTimeout(3000);
  const st = await page.evaluate(() => { const p = window.__saqr.plane; return { alt: p.alt, gs: p.gs, mode: p.mode, hdg: p.hdg }; });
  check('on station at 20,000 ft', Math.abs(st.alt - 6096) < 60, Math.round(st.alt) + ' m');
  check('ground speed of a jet (about 400-500 kt)', st.gs / 1.852 > 330 && st.gs / 1.852 < 560, Math.round(st.gs / 1.852) + ' kt');
  check('orbiting', st.mode === 'orbit', st.mode);
  await shot('1-seat-day', 1500);
  // frame cost: the frame loop's own work while in the seat (SwiftShader draws slowly; this times the JS)
  const ms = await page.evaluate(() => new Promise(r => { const g = window.__saqr, t0 = performance.now(); let n = 0; for (let i = 0; i < 200; i++) { g.updatePlane(0.016); n++; } r((performance.now() - t0) / n); }));
  check('the flight model a frame (ms)', ms < 1.5, ms.toFixed(3));
  // the pod on the convoy: lock the nearest vehicle, zoom, arm a laser bomb
  await page.evaluate(() => { const g = window.__saqr, v = g.vehicles.find(v => v.alive && !v.side) || g.targets[0]; g.lockOn(v, true); g.S.zoomGoal = 4; g.S.armed = true; g.S.weapon = 'lgb'; });
  await page.waitForFunction(() => window.__saqr.S.quality >= 2, null, { timeout: 60000, polling: 300 });
  await page.waitForFunction(() => !!window.__saqr.JX.ask, null, { timeout: 30000, polling: 300 });
  check('the pilot asks for the run', true);
  await shot('2-seat-ask', 300);
  // the officer consents: a touch on the UFC's left half
  const p = await page.evaluate(() => { const g = window.__saqr, r = g.CK.MR; return g.ckFromImg({ x: r.x + r.w * 0.25, y: r.y + r.h * 0.5 }); });
  await page.mouse.click(p.x, p.y);
  await page.waitForTimeout(500);
  const run = await page.evaluate(() => { const g = window.__saqr; return { run: !!g.JX.run, mode: g.plane.mode }; });
  check('consent on the UFC starts the run', run.run && run.mode === 'run', run.mode);
  // the run to the release: time is sped up (SwiftShader runs a few frames a second)
  const runIn = () => page.evaluate(() => new Promise(r => { const g = window.__saqr, t0 = performance.now();
    const trace = [];
    const f = () => { for (let i = 0; i < 40 && g.JX.run; i++) { g.stepSim(0.05); if (Math.round(g.S.missionT * 20) % 40 === 0) { const r = g.JX.run, sel = g.S.sel, pl = g.plane; trace.push([g.S.missionT.toFixed(0), r ? (r.out ? 'out' : 'in') : '-', r && r.tr != null ? r.tr.toFixed(1) : '', sel ? (Math.hypot(sel.x - pl.x, sel.y - pl.y) * 0.85).toFixed(0) : '', pl.hdg.toFixed(0), (pl.bank * 57.3).toFixed(0), (pl.alt).toFixed(0), (pl.gs / 1.852).toFixed(0)].join(' ')); } }
      if (!g.JX.run || performance.now() - t0 > 60000) r({ released: g.projectiles.some(p => p.type === 'lgb'), ammo: g.S.ammo.lgb, t: g.S.missionT, trace, log: g.AC.log.map(l => l.t.toFixed(0) + ' ' + l.en) }); else setTimeout(f, 0); }; f(); }));
  let rel = await runIn();
  // the troops on the ground may kill the vehicle first (the pilot: LOST THE TARGET): another one, the same run again
  for (let k = 0; k < 2 && !rel.released && rel.log.some(l => l.includes('LOST THE TARGET')); k++) {
    console.log('(the target died before the release: another)');
    await page.evaluate(() => { const g = window.__saqr, v = g.vehicles.filter(v => v.alive && !v.side && !v.escaped).sort((a, b) => Math.hypot(a.x - g.plane.x, a.y - g.plane.y) - Math.hypot(b.x - g.plane.x, b.y - g.plane.y))[0]; if (v) g.lockOn(v, true); });
    await page.waitForFunction(() => window.__saqr.S.quality >= 2, null, { timeout: 60000, polling: 300 });
    await page.evaluate(() => window.__saqr.jetConsent(true));
    rel = await runIn();
  }
  if (!rel.released) console.log('t run tr dist hdg bank alt kt\n' + rel.trace.join('\n'));
  console.log(rel.log.join('\n'));
  check('released on the point', rel.released && rel.ammo === 3, 'ammo ' + rel.ammo + ' at ' + rel.t.toFixed(0) + ' s');
  await shot('3-after-release', 300);
  const fall = await page.evaluate(() => { const p = window.__saqr.projectiles.find(p => p.type === 'lgb'); return p ? p.tof : 0; });
  check('time of fall from 20,000 ft (25-45 s)', fall > 25 && fall < 45, fall.toFixed(1) + ' s');
  const hit = await page.evaluate(() => new Promise(r => { const g = window.__saqr, t0 = performance.now(), tg = g.S.sel, pr = g.projectiles.find(p => p.type === 'lgb');
    const f = () => { let tr = 0; for (let i = 0; i < 40 && pr.ix == null; i++) { g.stepSim(0.05); tr += g.S.tracking && g.S.sel === tg ? 1 : 0; }
      if (pr.ix != null || performance.now() - t0 > 60000) r({ dead: !!tg && !tg.alive, miss: tg && pr.ix != null ? (Math.hypot(pr.ix - tg.x, pr.iy - tg.y) * g.MPP).toFixed(1) + ' m' : '-', held: g.S.sel === tg && g.S.tracking, q: g.S.quality }); else setTimeout(f, 0); }; f(); }));
  check('the laser bomb hits the tracked vehicle', hit.dead, JSON.stringify(hit));
  await shot('4-seat-impact', 200);
  await page.evaluate(() => window.__saqr.toSensor());
  await shot('5-pod-full', 1500);
  await page.evaluate(() => window.__saqr.setNight(true));
  await page.evaluate(() => window.__saqr.setCockpit(true));
  await shot('6-seat-night', 3500);
  await page.evaluate(() => { window.__saqr.setNight(false); window.__saqr.setSensor('eo'); });
  // a JDAM on the next target: out of its zone from the orbit, the release key asks the pilot in; it goes for the coordinates
  const sim = (until, max) => page.evaluate(([u, m]) => new Promise(r => { const g = window.__saqr, t0 = performance.now(), test = new Function('g', 'return ' + u);
    const f = () => { for (let i = 0; i < 40; i++) { g.stepSim(0.05); if (test(g)) break; } if (test(g) || performance.now() - t0 > m) r(test(g)); else setTimeout(f, 0); }; f(); }), [until, max || 60000]);
  const pick = () => page.evaluate(() => { const g = window.__saqr, v = g.vehicles.filter(v => v.alive && !v.side && !v.escaped).sort((a, b) => Math.hypot(a.x - g.plane.x, a.y - g.plane.y) - Math.hypot(b.x - g.plane.x, b.y - g.plane.y))[0] || g.targets.find(t => t.alive);
    if (!v) return false; g.lockOn(v, true); g.S.zoomGoal = 4; g.S.armed = true; g.__t = v; return true; });
  await sim('!g.JX.run', 30000);
  // the same mission again, fresh, for the JDAM and the Maverick (a 2-3 minute run each: the troops may not last two)
  const restart = () => page.evaluate(() => { const g = window.__saqr, mi = g.MISSIONS[0]; g.startMission(mi.layout ? mi.layout.map(it => ({ ...it })) : null, mi); g.AC.hp = 1e9; });
  await restart(); await page.waitForTimeout(500);
  if (await pick()) {
    await page.evaluate(() => { const g = window.__saqr; g.S.weapon = 'jdam'; g.JX.hold = 0; g.JX.ask = null; g.fire(); });
    check('JDAM: the release key asks the pilot in', await page.evaluate(() => !!window.__saqr.JX.run || window.__saqr.S.ammo.jdam === 1));
    const jr = await sim("!!(g.__jd = g.__jd || g.projectiles.find(p => p.type === 'jdam')) || g.S.phase !== 'play'", 300000) && await page.evaluate(() => !!window.__saqr.__jd);
    check('JDAM released', jr, await page.evaluate(() => { const g = window.__saqr; return 'ammo ' + g.S.ammo.jdam + ', run ' + !!g.JX.run + ', ' + g.AC.log.slice(-3).map(l => l.en).join(' / '); }));
    const jd = jr ? await page.evaluate(() => new Promise(r => { const g = window.__saqr, p = g.__jd, x = p.x, y = p.y;
      const f = () => { for (let i = 0; i < 40 && p.ix == null; i++) g.stepSim(0.05); if (p.ix != null) r(Math.hypot(p.ix - x, p.iy - y) * g.MPP); else setTimeout(f, 0); }; f(); })) : 1e9;
    check('JDAM on its coordinates (m)', jd < 15, jd.toFixed(1));
  } else check('a target for the JDAM', false);
  // a Maverick: the release key asks the pilot to point at it; in range, the officer fires
  await restart(); await page.waitForTimeout(500);
  if (await pick()) {
    await page.evaluate(() => { const g = window.__saqr; g.S.weapon = 'agm'; g.S.cool.agm = 0; g.S.ammo.agm = 4; g.JX.slots.agm = g.JX.slots.agm || []; });   // the CAS load carries no Mavericks: as if the stand-off one
    await page.waitForFunction(() => window.__saqr.S.quality >= 2, null, { timeout: 60000, polling: 300 });
    await page.evaluate(() => window.__saqr.fire());
    const inr = await sim("g.fireStatePub().en.startsWith('IN RNG') || g.S.phase !== 'play'", 300000) && await page.evaluate(() => window.__saqr.fireStatePub().en.startsWith('IN RNG'));
    check('Maverick: in range after the turn in', inr);
    await page.evaluate(() => { const g = window.__saqr; if (!g.projectiles.some(p => p.type === 'agm')) g.fire(); });
    const mv = await page.evaluate(() => { const g = window.__saqr; return { a: g.S.ammo.agm, p: g.projectiles.filter(p => p.type === 'agm').length, f: g.fireStatePub(), run: !!g.JX.run, t: g.S.tracking, sel: !!g.S.sel }; });
    check('Maverick away', mv.a === 3 && mv.p === 1, JSON.stringify(mv));
    await shot('7-maverick', 200);
    const mk = await sim("!g.projectiles.some(p => p.type === 'agm')", 60000);
    check('the Maverick hits', mk && await page.evaluate(() => !window.__saqr.__t.alive));
  } else check('a target for the Maverick', false);
  console.log('errors', errs.slice(0, 5));
  check('no page errors', errs.length === 0, errs.length);
  await browser.close();
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  process.exit(fails.length ? 1 : 0);
})();
