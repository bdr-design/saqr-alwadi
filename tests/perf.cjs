// The work saved in high quality, and that it costs nothing on screen. The world outside is drawn only inside the
// canopy's glass: a frame drawn with that cut and one drawn without are the same wherever the cockpit photo lets
// anything through (the TEDAC's live video aside), in the seat and leaned into a corner; how much of the screen is drawn. The sensor's
// symbology canvas is left blank in the seat and drawn in full screen. The phone's heat: at critical, high quality goes
// to 2× pixels and comes back when it cools.
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
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3 });
  await ctx.addInitScript(() => { try { localStorage.setItem('saqr.hi', '1'); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 180000 });
  const fails = [], check = (w, ok) => { if (!ok) fails.push(w); };
  await page.evaluate(() => document.querySelector('#btnStart').click());
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.__saqr.S.frozen = true; });
  // the same frame drawn twice in one go, the cut on and off: the GL picture wherever the cockpit photo is not opaque
  // (the glass, the screens' cut-outs) must be the same, the TEDAC's live video aside. In the seat, and leaned hard
  // into a corner (where the low side windows show)
  const compare = () => page.evaluate(async () => {
    const g = window.__saqr, cv = g.renderer.domElement, sens = g.CK.sens, k = cv.width / innerWidth;
    // the photo's alpha where it lies on the screen
    const im = document.querySelector('#ckImg'), pc = document.createElement('canvas'); pc.width = im.naturalWidth; pc.height = im.naturalHeight;
    const px = pc.getContext('2d'); px.drawImage(im, 0, 0); const alpha = px.getImageData(0, 0, pc.width, pc.height).data;
    const grab = on => { g.setGlassCut(on); g.renderFramePub(); const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; };
    const rects = g.glassRects(), A = grab(true), B = grab(false); g.setGlassCut(true);
    let n = 0, tot = 0, area = 0;
    for (const r of rects) area += (r.x1 - r.x0) * (r.y1 - r.y0);
    for (let y = 0; y < cv.height; y += 2) for (let x = 0; x < cv.width; x += 2) {
      const cx = x / k, cy = y / k; if (cx >= sens.x - 3 && cx <= sens.x + sens.w + 3 && cy >= sens.y - 3 && cy <= sens.y + sens.h + 3) continue;
      const q = g.ckToImg({ x: cx, y: cy }), ix = Math.round(q.x), iy = Math.round(q.y);
      // (the side screens' cut-outs are under their own canvases: nothing of the GL picture shows there)
      const mpd = [g.CK.ML, g.CK.MR].some(m => ix > m.x - 8 && ix < m.x + m.w + 8 && iy > m.y - 8 && iy < m.y + m.h + 8);
      const see = !mpd && (ix < 0 || iy < 0 || ix >= pc.width || iy >= pc.height || alpha[(iy * pc.width + ix) * 4 + 3] < 250);
      if (!see) continue;
      const i = (y * cv.width + x) * 4; tot++;
      if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 3) n++;
    }
    return { rects: rects.length, drawn: +(area / innerWidth / innerHeight * 100).toFixed(1), differ: n, checked: tot, pr: g.PRpub() };
  });
  const seat = await compare();
  console.log('seat', JSON.stringify(seat));
  check('seat: the cut changes nothing that can be seen', seat.differ === 0 && seat.checked > 10000);
  check('seat: about half the screen or less is drawn for the world outside', seat.drawn < 55);
  const W = 844, H = 390, drag = async (dx, dy) => { await page.mouse.move(W / 2, H * 0.25); await page.mouse.down(); await page.mouse.move(W / 2 + dx, H * 0.25 + dy, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(400); };
  await page.evaluate(() => { const g = window.__saqr; g.S.frozen = false; g.ckLook(2.2, g.CK.IW / 2, g.CK.IH / 2, 14, true); });
  for (const [dx, dy] of [[-2000, -2000], [2000, 0], [0, 2000], [-2000, 0], [2000, -2000]]) await drag(dx, dy);
  await page.waitForTimeout(600);
  const corner = await compare();
  console.log('leaned into the lower left', JSON.stringify(corner));
  check('corner: the cut changes nothing that can be seen', corner.differ === 0 && corner.checked > 10000);
  await page.screenshot({ path: S + '/tests/out/perf-corner.png' });
  // the sensor's symbology: blank in the seat, drawn in full screen
  const hudPx = () => page.evaluate(() => { const c = document.querySelector('#hud'), d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 3; i < d.length; i += 4 * 97) if (d[i] > 0) n++; return n; });
  await page.waitForTimeout(800);
  const hudSeat = await hudPx();
  await page.evaluate(() => window.__saqr.toSensor()); await page.waitForTimeout(1500);
  const hudFull = await hudPx();
  console.log('hud', JSON.stringify({ hudSeat, hudFull }));
  check('symbology not drawn in the seat, drawn full screen', hudSeat === 0 && hudFull > 0);
  // heat
  const heat = await page.evaluate(async () => { const g = window.__saqr, w = ms => new Promise(r => setTimeout(r, ms)), p0 = g.PRpub();
    window.__thermal(2); await w(300); const p2 = g.PRpub(); window.__thermal(3); await w(300); const p3 = g.PRpub(); window.__thermal(0); await w(300); return { p0, p2, p3, back: g.PRpub() }; });
  console.log('heat', JSON.stringify(heat));
  check('heat: serious keeps the pixels, critical drops to 2x, cool brings back the full 3x', heat.p2 === heat.p0 && heat.p3 === 2 && heat.back === 3);
  check('no page errors', !errs.length);
  if (errs.length) console.log(errs.slice(0, 5).join('\n'));
  await browser.close();
  console.log(fails.length ? 'FAIL: ' + fails.join('; ') : 'ALL OK');
  process.exit(fails.length ? 1 : 0);
})();
