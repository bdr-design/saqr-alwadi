// The gunner's head: looks to the far corners, leans in and out, flicks, in strong gusts with the head rolled to its
// limit, and checks every frame that the photo still covers the whole screen. Prints how far the body actually moves.
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
  await page.click('#btnStart'); await page.waitForTimeout(1000);
  const shot = async (name, wait) => { await page.waitForTimeout(wait || 0); await page.screenshot({ path: `${S}/tests/out/head-${name}.png` }); };
  // every animation frame: the four screen corners must map inside the photo; also the body's motion range
  await page.evaluate(() => {
    const g = window.__saqr, CK = g.CK; window.__head = { worst: 1e9, n: 0, ex: [0, 0], ey: [0, 0], r: [0, 0], el: [0, 0] };
    const loop = () => {
      const h = window.__head;
      if (CK.t === 0 && !document.querySelector('#cockpit').hidden) {
        for (const q of [{ x: 0, y: 0 }, { x: innerWidth, y: 0 }, { x: 0, y: innerHeight }, { x: innerWidth, y: innerHeight }]) {
          const p = g.ckToImg(q); h.worst = Math.min(h.worst, p.x, p.y, CK.IW - p.x, CK.IH - p.y);
        }
        h.n++;
        for (const k of ['ex', 'ey', 'r', 'el']) { h[k][0] = Math.min(h[k][0], CK[k]); h[k][1] = Math.max(h[k][1], CK[k]); }
      }
      requestAnimationFrame(loop);
    };
    loop();
  });
  await shot('0-seat', 300);
  // natural flight for a while: how much the body moves
  await page.waitForTimeout(6000);
  const calm = await page.evaluate(() => JSON.parse(JSON.stringify(window.__head)));
  // look hard into each corner of the cockpit by dragging, at two leans
  const drag = async (dx, dy) => { await page.mouse.move(W / 2, H * 0.25); await page.mouse.down(); await page.mouse.move(W / 2 + dx, H * 0.25 + dy, { steps: 6 }); await page.mouse.up(); await page.waitForTimeout(500); };
  for (const l of [1, 2.2]) {
    await page.evaluate(l => { const g = window.__saqr; g.ckLook(l, g.CK.IW / 2, g.CK.IH / 2, 14, true); }, l);
    for (const [dx, dy] of [[-2000, -2000], [2000, 0], [0, 2000], [-2000, 0], [2000, -2000]]) await drag(dx, dy);
    if (l > 1) await shot('1-corner-leaned', 200);
  }
  // pinch-like wheel lean in and out fast, while the airframe is thrown about and the head rolled to its limit
  await page.evaluate(() => { const g = window.__saqr; g.ckLook(1, g.CK.IW / 2, g.CK.IH / 2, 14, true); g.CK.r = 0.05; g.CK.ex = 25; g.CK.ey = -25; g.CK.el = -0.3; });
  for (let i = 0; i < 10; i++) { await page.mouse.move(W * (i % 2 ? 0.1 : 0.9), H * (i % 3 ? 0.1 : 0.9)); await page.mouse.wheel(0, i % 2 ? 400 : -400); await page.waitForTimeout(120); }
  await page.waitForTimeout(800);
  // a double tap glide to the TEDAC and back
  const tc = await page.evaluate(() => { const g = window.__saqr; return g.ckFromImg({ x: g.CK.T.x + 30, y: g.CK.T.y + 30 }); });
  await page.evaluate(() => { const g = window.__saqr; g.ckLook(1, g.CK.IW / 2, g.CK.IH / 2, 14, true); });
  await page.waitForTimeout(400);
  const tc2 = await page.evaluate(() => { const g = window.__saqr; return g.ckFromImg({ x: g.CK.T.x + 30, y: g.CK.T.y + 30 }); });
  await page.mouse.dblclick(tc2.x, tc2.y);
  // mid-glide: the head is on its way, not there yet
  await page.waitForTimeout(150); const mid = await page.evaluate(() => window.__saqr.CK.lean);
  await page.waitForFunction(() => window.__saqr.CK.lean > 1.6 && !window.__saqr.CK.lean0, null, { timeout: 60000 });
  await shot('2-glide-tedac', 200);
  const h = await page.evaluate(() => window.__head);
  console.log('frames checked', h.n, 'worst corner margin (photo px)', h.worst.toFixed(1));
  const rng = (o, k, s) => (o[k][0] * s).toFixed(1) + '..' + (o[k][1] * s).toFixed(1);
  console.log('calm flight: sway x', rng(calm, 'ex', 1), 'y', rng(calm, 'ey', 1), 'photo px; roll', rng(calm, 'r', 57.3), 'deg; surge', rng(calm, 'el', 1));
  console.log('glide lean 150 ms after the double tap', mid.toFixed(2));
  console.log('errors', errs);
  await browser.close();
  if (h.worst < 0 || errs.length) process.exit(1);
})();
