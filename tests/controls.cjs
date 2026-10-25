// Every cockpit control: each TEDAC key, each labelled MPD key on every page, the MPD knobs and the console switches,
// pressed by its photo position as a player would, with the state it should change checked after each press
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
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 30000 });
  await page.waitForTimeout(3000);
  await page.click('#btnStart'); await page.waitForTimeout(1200);
  const shot = async (name, wait) => { await page.waitForTimeout(wait || 0); await page.screenshot({ path: `${S}/tests/out/ctl-${name}.png` }); };
  const fails = [];
  const check = (what, ok) => { if (!ok) fails.push(what); };
  // a snapshot of everything a control can change
  const state = () => page.evaluate(() => { const { S, CK, Snd } = window.__saqr; return JSON.stringify({
    w: S.weapon, armed: S.armed, zoom: S.zoomGoal, sensor: S.sensor, track: S.tracking, sel: S.sel && S.sel.id, filter: S.filter, burst: S.burst, qty: S.qty,
    frozen: S.frozen, night: S.night, aim: [Math.round(S.aimGoal.x), Math.round(S.aimGoal.y)], snd: S.soundOn, vol: Snd.vol, tones: Snd.tones, lrf: !!CK.lrf,
    shot: !document.querySelector('#ovShot').hidden, goal: CK.goal, sym: CK.sym, symBrt: CK.symBrt, gain: CK.gain, mpd: CK.mpd, pnl: CK.pnl, flood: CK.flood,
    page: CK.page, tsd: CK.tsd, vidSym: CK.vidSym, fly: window.__saqr.plane.mode, alt: CK.alt, spd: CK.spd, fuel: CK.fuel, code: CK.code }); });
  const at = (bx, by) => page.evaluate(([bx, by]) => { return window.__saqr.ckFromImg({ x: bx, y: by }); }, [bx, by]);
  const tapPhoto = async (bx, by) => { const p = await at(bx, by); await page.mouse.click(p.x, p.y); await page.waitForTimeout(380); };   // past the double-tap window
  const closeShot = async () => { if (await page.evaluate(() => !document.querySelector('#ovShot').hidden)) { await page.click('#btnShotClose'); await page.waitForTimeout(200); } };
  const back = async () => { await closeShot(); await page.evaluate(() => { const g = window.__saqr; if (g.CK.goal !== 0) { g.setCockpit(true); g.CK.t = 0; } g.ckLook(1, g.CK.IW / 2, g.CK.IH / 2, 14, true); }); await page.waitForTimeout(300); };
  // lean in so the small keys are a finger's width apart, as a player on a phone would
  const lean = (l, x, y) => page.evaluate(([l, x, y]) => { const { CK, ckLook } = window.__saqr; CK.lean0 = null; ckLook(l, x, y, 14, true); }, [l, x, y]);

  // ACQ and LOCK take the target nearest the crosshair that is in view: look at the convoy, nothing locked
  const lookAtConvoy = async () => { await page.evaluate(() => { const g = window.__saqr, v = g.vehicles.find(v => v.convoy && v.alive);
    g.S.sel = null; g.S.tracking = false; g.S.free = false; g.S.zoomGoal = g.S.zoom = 1; g.S.aim.x = g.S.aimGoal.x = v.x; g.S.aim.y = g.S.aimGoal.y = v.y; }); await page.waitForTimeout(500); };
  // TEDAC keys
  const { TLAB, TKEYS } = await page.evaluate(() => ({ TLAB: window.__saqr.TLAB, TKEYS: window.__saqr.TKEYS }));
  await page.evaluate(() => { const g = window.__saqr; g.S.armed = false; const v = g.vehicles.find(v => v.convoy && v.alive); g.lockOn(v, true); });
  let n = 0;
  for (const g of ['T', 'L', 'R', 'B']) for (let i = 0; i < TKEYS[g].length; i++) {
    const k = TLAB[g][i]; if (!k) { fails.push('TEDAC ' + g + i + ' has no function'); continue; }
    await back(); await lean(2.4, 840, 570); await page.waitForTimeout(250);
    if (k === 'ACQ' || k === 'LOCK') await lookAtConvoy();
    if (k.startsWith('ZM')) await page.evaluate(() => { window.__saqr.S.zoomGoal = 4; });   // room to zoom both ways
    const a = await state(); await tapPhoto(...TKEYS[g][i]); const b = await state();
    check('TEDAC ' + k + ' changed nothing', a !== b); n++;
    if (k === 'IMG') await closeShot();
  }
  await back(); await lean(2.4, 840, 570); await shot('1-tedac-keys', 400);

  // MPD keys, page by page on both displays
  const { BTN, PAGES } = await page.evaluate(() => ({ BTN: window.__saqr.BTN, PAGES: window.__saqr.PAGES }));
  for (const side of ['L', 'R']) for (let pi = 0; pi < PAGES.length; pi++) {
    if (!PAGES[pi]) { fails.push('MPD top key ' + pi + ' has no page'); continue; }
    await back(); const cx = side === 'L' ? 406 : 1268; await lean(2.6, cx, 625); await page.waitForTimeout(250);
    await tapPhoto(...BTN[side].T[pi]);
    check(side + ' page ' + PAGES[pi], await page.evaluate(([s, p]) => window.__saqr.CK.page[s] === p, [side, PAGES[pi]]));
    const keys = await page.evaluate(p => window.__saqr.pageKeys(p), PAGES[pi]);
    for (const g of ['B', 'L', 'R']) for (let i = 0; i < (keys[g] || []).length; i++) {
      const k = keys[g][i]; if (!k) continue;
      if (k === 'ACQ' || k === 'LOCK') await lookAtConvoy();
      const a = await state(); await tapPhoto(...BTN[side][g][i]); const b = await state();
      check('MPD ' + side + ' ' + PAGES[pi] + ' ' + k + ' changed nothing', a !== b); n++;
    }
    if (side === 'R' && PAGES[pi] === 'TGT') await shot('2-tgt-page', 400);
  }
  // knobs and console switches
  const CN = await page.evaluate(() => window.__saqr.CTRLS.map(c => [c[0], c[1]]));
  for (const [bx, by] of CN) {
    await back(); await lean(2.2, bx, by); await page.waitForTimeout(250);
    const a = await state(); await tapPhoto(bx, by); const b = await state();
    check('control at ' + bx + ',' + by + ' changed nothing', a !== b); n++;
    await closeShot();
  }
  // the tip beside a console switch, the MONO mode and a powered-down display
  await back(); await lean(1.8, 300, 800); await page.waitForTimeout(200); await tapPhoto(181, 862); await shot('3-console-tip', 100);
  await back(); await page.evaluate(() => { const { CK } = window.__saqr; CK.page.L = 'TGT'; CK.page.R = 'TSD'; CK.tsd.nup = true; for (const m of Object.values(CK.mpd)) { m.pwr = true; m.brt = 1; } CK.mpd.R.mode = 'MONO'; window.__saqr.setNight(false); CK.mpdT = 0; });
  await shot('4-seat', 600);
  console.log('controls pressed', n);
  console.log('failures', fails);
  console.log('errors', errs);
  await browser.close();
  if (fails.length || errs.length) process.exit(1);
})();
