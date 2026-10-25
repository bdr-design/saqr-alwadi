// Flight modes: from the orbit to hover 1, to hover 2, back onto the orbit. The flight is simulated ahead of real
// time (same code, fixed steps) and checked: it gets there, stops, faces the valley, never jumps, attitude stays sane.
// Then real-time shots from the seat at each hover with the helmet cues on the targets, and the TSD.
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
  await page.waitForTimeout(3000);
  await page.click('#btnStart'); await page.waitForTimeout(800);
  const fails = [];
  // fly ahead of real time: freeze the clock, step the same flight code
  const leg = (mode, secs) => page.evaluate(([mode, secs]) => {
    const g = window.__saqr, p = g.plane, S = g.S, dt = 0.05;
    S.frozen = true; g.setFlight(mode);
    let jump = 0, bank = 0, pitch = [9, -9], t = 0, arrived = null, nan = false;
    for (; t < secs; t += dt) {
      const x = p.x, y = p.y; S.t += dt; g.updatePlane(dt);
      jump = Math.max(jump, Math.hypot(p.x - x, p.y - y) * g.MPP / dt);
      bank = Math.max(bank, Math.abs(p.bank)); pitch[0] = Math.min(pitch[0], p.pitch); pitch[1] = Math.max(pitch[1], p.pitch);
      if ([p.x, p.y, p.nose, p.bank, p.pitch].some(v => !isFinite(v))) nan = true;
      if (mode !== 'orbit' && arrived == null) { const h = g.hoverPt(mode); if (Math.hypot(p.x - h.x, p.y - h.y) * g.MPP < 15 && p.gs < 5) arrived = t; }
      if (mode === 'orbit' && arrived == null && p.onOrbit) arrived = t;
    }
    S.frozen = false;
    const face = Math.atan2(g.H0 / 2 - p.y, g.W0 / 2 - p.x), off = Math.abs(Math.atan2(Math.sin(p.nose - face), Math.cos(p.nose - face)));
    const h = mode !== 'orbit' ? g.hoverPt(mode) : null;
    return { mode, arrived, gs: p.gs, dist: h ? Math.hypot(p.x - h.x, p.y - h.y) * g.MPP : null, noseOffDeg: off * 57.3, maxSpeed: jump * 3.6, maxBankDeg: bank * 57.3, pitchDeg: pitch.map(v => +(v * 57.3).toFixed(1)), nan };
  }, [mode, secs]);
  const report = r => { console.log(JSON.stringify(r, (k, v) => typeof v === 'number' ? +v.toFixed(1) : v)); };
  const shot = async (name, wait) => { await page.waitForTimeout(wait || 0); await page.screenshot({ path: `${S}/tests/out/fly-${name}.png` }); };
  for (const [m, secs] of [['h1', 240], ['h2', 300], ['orbit', 240]]) {
    const r = await leg(m, secs); report(r);
    if (r.nan) fails.push(m + ': NaN');
    if (r.arrived == null) fails.push(m + ': never got there');
    if (r.maxSpeed > 145) fails.push(m + ': flew at ' + r.maxSpeed.toFixed(0) + ' km/h (a jump?)');
    if (r.maxBankDeg > 20) fails.push(m + ': bank ' + r.maxBankDeg.toFixed(0) + '°');
    if (m !== 'orbit' && (r.gs > 5 || r.dist > 15 || r.noseOffDeg > 8)) fails.push(m + ': not holding (gs ' + r.gs.toFixed(1) + ', ' + r.dist.toFixed(0) + ' m off, nose ' + r.noseOffDeg.toFixed(0) + '° off)');
    if (m !== 'orbit') {
      // real time at the hover: the seat view with the helmet cues, then lean toward the TSD
      await page.evaluate(() => { const g = window.__saqr; g.S.filter = 'all'; g.ckLook(1, g.CK.IW / 2, g.CK.IH / 2, 14, true); });
      await shot(m + '-seat', 2500);
      const cues = await page.evaluate(() => window.__saqr.CK.marks.length);
      console.log(m, 'helmet cues on screen', cues);
      if (!cues) fails.push(m + ': no target cues through the glass');
    }
  }
  // tap a cue through the glass: it locks that target
  await page.evaluate(() => { const g = window.__saqr; g.S.frozen = true; g.setFlight('h1'); for (let i = 0; i < 4000; i++) { g.S.t += 0.05; g.updatePlane(0.05); } g.S.frozen = false; g.S.sel = null; g.S.tracking = false; });
  await page.waitForTimeout(1500);
  const m = await page.evaluate(() => { const k = window.__saqr.CK.marks.find(m => m.x > 60 && m.x < innerWidth - 60 && m.y > 40 && m.y < innerHeight * 0.45); return k && { x: k.x, y: k.y, id: k.t.id }; });
  if (!m) fails.push('no cue to tap');
  else { await page.mouse.click(m.x, m.y); await page.waitForTimeout(400); const id = await page.evaluate(() => window.__saqr.S.sel && window.__saqr.S.sel.id); console.log('tapped cue T' + m.id, '-> locked', id); if (id !== m.id) fails.push('tapping a cue did not lock it'); }
  await shot('cue-locked', 600);
  await page.evaluate(() => { const g = window.__saqr; g.CK.page.L = 'TSD'; g.CK.mpd.L.mode = 'MONO'; g.CK.mpdT = 0; g.ckLook(2.6, 406, 625, 14, true); });
  await shot('tsd', 800);
  console.log('failures', fails); console.log('errors', errs);
  await browser.close();
  if (fails.length || errs.length) process.exit(1);
})();
