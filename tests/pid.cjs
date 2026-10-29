// Positive identification before a weapon leaves the ZF-25 (jetPid, jetClear, jetCiv): held wide the target is not
// identified and the release is refused, the pilot asks for a closer look; narrow and tracked for 3 s it is, he
// reports it and HUNTER clears it hot; a civilian close to the target: HUNTER holds, until it has gone; with no one on
// the ground (a strike) it is cleared as identified. Screenshot of the pod page into tests/out/pid-1-cleared.png.
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
  await ctx.addInitScript(() => { try { localStorage.setItem('saqr.ac', 'f15'); localStorage.setItem('saqr.jstart', 'air'); } catch (_) {} });
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
    document.querySelectorAll('#mList .mc:not(.camp)')[i].click(); document.querySelector('#btnStart').click(); g.AC.hp = 1e9; }, id);
  const until = (fn, ms) => page.waitForFunction(fn, null, { timeout: ms || 60000, polling: 200 }).then(() => true).catch(() => false);
  // ---- with HUNTER (close air support): wide, then narrow
  await start('j_cas'); await page.waitForTimeout(600);
  await page.evaluate(() => { const g = window.__saqr, S = g.S, t = g.targets.find(t => t.kind === 'vehicle' && t.alive) || g.targets[0];
    // (the Barq: the troops in contact are within a bomb's danger-close of ours, whichever comes first)
    window.__T0 = t; g.toSensor(); S.weapon = 'agm'; S.armed = true; g.lockOn(t, true); S.zoom = S.zoomGoal = 2; });
  const wide0 = await page.evaluate(() => window.__saqr.fireStatePub().en);
  await until(() => window.__saqr.AC.log.some(l => /ZOOM IN/.test(l.en)), 120000);
  const wide = await page.evaluate(() => ({ pid: !!window.__T0.pid, log: window.__saqr.AC.log.map(l => l.en) }));
  check('held wide: no identification, the release refused (NO PID), the pilot asks for a closer look', wide0 === 'NO PID' && !wide.pid && wide.log.some(s => /ZOOM IN/.test(s)), { wide0, ...wide });
  await page.evaluate(() => { const g = window.__saqr; g.S.zoom = g.S.zoomGoal = 6; });
  const idd = await until(() => window.__T0.pid, 90000);
  const t1 = await page.evaluate(() => ({ cleared: !!window.__T0.cleared, en: window.__saqr.fireStatePub().en }));
  check('narrow and tracked: identified, the pilot reports it, the release waits for HUNTER', idd && !t1.cleared && t1.en === 'CLEARANCE', t1);
  const hot = await until(() => window.__T0.cleared, 90000);
  const t2 = await page.evaluate(() => ({ log: window.__saqr.AC.log.map(l => l.en), en: window.__saqr.fireStatePub().en }));
  check('HUNTER clears it hot, the release no longer held for it', hot && t2.log.some(s => /TALLY TARGET/.test(s)) && t2.log.includes('CLEARED HOT') && !/PID|CLEARANCE/.test(t2.en), t2);
  await page.evaluate(() => { const g = window.__saqr; g.CK.page.L = 'VID'; g.setCockpit(true); g.CK.t = 0; g.ckLook(2.4, g.CK.IW * 0.36, g.CK.IH * 0.66, 14, true); });
  await page.waitForTimeout(1500); await page.screenshot({ path: S + '/tests/out/pid-1-cleared.png' });
  // ---- civilians by the next target: HUNTER holds it
  await page.evaluate(() => { const g = window.__saqr, S = g.S, t = g.targets.find(t => t.alive && t !== window.__T0 && t.kind === 'vehicle') || g.targets.find(t => t.alive && t !== window.__T0);
    window.__T1 = t; window.__C = g.makeVehicle({ kind: 'suv', mode: 'parked', x: t.x + 45 / g.MPP, y: t.y, h: 0, civil: true });
    // (the Barq: the troops in contact are all within a bomb's danger-close of ours; its own reach for civilians 60 m)
    g.toSensor(); S.weapon = 'agm'; g.lockOn(t, true); S.zoom = S.zoomGoal = 6; });
  await until(() => window.__saqr.AC.log.some(l => /CIVILIANS/.test(l.en)), 120000);
  const civ = await page.evaluate(() => ({ cleared: !!window.__T1.cleared, pid: !!window.__T1.pid, en: window.__saqr.fireStatePub().en, log: window.__saqr.AC.log.map(l => l.en).slice(-2) }));
  check('a civilian 45 m from it (the Barq): HUNTER holds, the release refused (CIVILIANS)', !civ.cleared && civ.log.some(s => /HOLD, CIVILIANS/.test(s)) && civ.en === 'CIVILIANS', civ);
  // the car drives off: in 20 s the crew looks again, and it is cleared
  await page.evaluate(() => { const C = window.__C; C.x += 2000; C.y += 2000; });
  const later = await until(() => window.__T1.cleared, 180000);
  check('the civilian gone: identified again and cleared', later);
  // ---- with no one on the ground (the strike): cleared once identified
  await page.evaluate(() => { document.querySelector('#btnMenu').click(); }); await page.waitForTimeout(400);
  await start('j_strike'); await page.waitForTimeout(600);
  await page.evaluate(() => { const g = window.__saqr, S = g.S, t = g.targets[0]; window.__T2 = t; g.toSensor(); g.lockOn(t, true); S.zoom = S.zoomGoal = 6; });
  const strike = await until(() => window.__T2.pid && window.__T2.cleared, 90000);
  const st = await page.evaluate(() => window.__saqr.AC.log.map(l => l.en));
  check('no friendlies: cleared as identified, no tally call', strike && !st.some(s => /TALLY/.test(s)), st);
  check('no page errors', !errs.length, errs);
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
