// The theatre: the three maps joined, with the air base. Its missions are listed and start on the pad; the crew
// rearms there; told where to go the aircraft lifts straight up, then transitions and climbs to cruise; BASE brings
// it back down a glide path to touch down on the pad. Shots: the seat on the pad, the base from the air, the TSD.
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
  const shot = async (name, wait) => { await page.waitForTimeout(wait || 0); await page.screenshot({ path: `${S}/tests/out/theater-${name}.png` }); };
  const n = await page.evaluate(() => document.querySelectorAll('#mMaps button').length);
  check('four maps to choose from', n === 4);
  await Promise.all([page.waitForNavigation(), page.click('#mMaps button:nth-child(4)')]);
  await page.waitForFunction(() => document.querySelector('#ovLoad').hidden, null, { timeout: 180000 });
  const m = await page.evaluate(() => ({ id: localStorage.getItem('saqr.map'), missions: window.__saqr.MISSIONS.map(m => m.id).join(), w: window.__saqr.W0 }));
  console.log('theatre', JSON.stringify(m));
  check('theatre loaded with its missions', m.id === 'theater' && m.missions === 'th_tic,th_cross,th_port,th_camp,custom' && m.w === 2814);
  await page.click('#mList button:nth-child(1)'); await page.click('#btnStart'); await page.waitForTimeout(800);
  const st = await page.evaluate(() => { const g = window.__saqr, p = g.plane, b = g.MAP.base; return { mode: p.mode, agl: +(p.alt - 410).toFixed(1), pad: Math.hypot(p.x - b.pads[b.padFree[0]][0], p.y - b.pads[b.padFree[0]][1]).toFixed(1), friends: g.friends.length, targets: g.targets.length, inMap: g.targets.every(t => t.x > 0 && t.x < g.W0 && t.y > 0 && t.y < g.H0) }; });
  console.log('start', JSON.stringify(st));
  check('starts on the pad', st.mode === 'pad' && st.agl < 5 && +st.pad < 1 && st.friends === 4 && st.inMap);
  await shot('1-seat-pad', 2500);
  const sim = (secs, fn) => page.evaluate(([secs, fn]) => {
    const g = window.__saqr, p = g.plane, S = g.S, b = g.MAP.base; S.frozen = true; let nan = false, maxH = 0, aglAt5 = null, offAt5 = null;
    const x0 = p.x, y0 = p.y;
    if (fn) (new Function('g', fn))(g);
    for (let t = 0; t < secs; t += 0.05) { g.stepSim(0.05); if (!isFinite(p.x + p.alt)) nan = true; if (aglAt5 == null && t > 5) { aglAt5 = p.alt - 410; offAt5 = Math.hypot(p.x - x0, p.y - y0) * g.MPP; } }
    S.frozen = false;
    return { mode: p.mode, agl: +(p.alt - 410).toFixed(1), gs: +p.gs.toFixed(1), pad: +(Math.hypot(p.x - b.pads[b.padFree[0]][0], p.y - b.pads[b.padFree[0]][1]) * g.MPP).toFixed(1), aglAt5: aglAt5 && +aglAt5.toFixed(1), offAt5: offAt5 && +offAt5.toFixed(1), ammo: { ...S.ammo }, flares: g.AC.flares, phase: S.phase, nan };
  }, [secs, fn]);
  // rearm on the pad
  const r0 = await sim(60, "g.S.ammo.msl = 1; g.S.ammo.rkt = 0; g.AC.flares = 10;");
  console.log('rearm', JSON.stringify(r0));
  check('rearmed on the pad', r0.ammo.msl === 8 && r0.ammo.rkt === 38 && r0.flares === 60 && r0.mode === 'pad');
  // take off for hover 1: straight up first, then away and up to cruise
  const r1 = await sim(200, "g.AC.hp = 1e9; g.friends.forEach(f => { f.hp = 1e9; }); g.setFlight('h1');");
  console.log('take-off', JSON.stringify(r1));
  check('lifts straight up', r1.aglAt5 > 4 && r1.aglAt5 < 16 && r1.offAt5 < 1.5);
  check('at cruise on station', r1.agl > 600 && r1.mode === 'h1');
  await page.evaluate(() => { const g = window.__saqr; g.toSensor(); const b = g.MAP.base; g.S.free = true; g.S.zoomGoal = g.S.zoom = 2; g.S.aimGoal.x = g.S.aim.x = b.pads[b.padFree[0]][0] + 60; g.S.aimGoal.y = g.S.aim.y = b.pads[b.padFree[0]][1]; });
  await shot('2-sensor-base', 3500);
  await page.evaluate(() => { const g = window.__saqr; g.setCockpit(true); g.CK.t = 0; g.CK.page.L = 'TSD'; g.CK.mpdT = 0; });
  // home: down the glide path to the pad
  const r2 = await sim(420, "g.setFlight('base');");
  console.log('home', JSON.stringify(r2));
  check('landed on the pad', r2.mode === 'pad' && r2.pad < 4 && r2.agl < 4 && r2.phase === 'play');
  check('no NaN', !r0.nan && !r1.nan && !r2.nan);
  await shot('3-seat-landed', 2500);
  await page.evaluate(() => { const g = window.__saqr; g.ckLook(2.6, 406, 625, 14, true); });
  await shot('4-tsd', 1200);
  console.log('failures', fails); console.log('errors', errs);
  await browser.close();
  if (fails.length || errs.length) process.exit(1);
})();
