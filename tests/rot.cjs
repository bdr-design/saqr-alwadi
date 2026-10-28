const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, p); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: p.endsWith('.png') ? 'image/png' : p.endsWith('.webp') ? 'image/webp' : 'image/jpeg' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 120000 });
  await page.tap('#btnStart'); await page.evaluate(() => window.__saqr.toSensor()); await page.waitForTimeout(1500);
  const r1 = await page.evaluate(() => (window.__saqr.S.rot * 180 / Math.PI).toFixed(1));
  await page.screenshot({ path: `${S}/tests/out/rot-a.png` });
  await page.waitForTimeout(6000); const sm = await page.evaluate(() => new Promise(r => { const g = window.__saqr.S, xs = []; let n = 0; const f = () => { xs.push([g.aim.x, g.aim.y]); if (++n < 40) requestAnimationFrame(f); else { let mx = 0; for (let i = 2; i < xs.length; i++) { const ax = xs[i][0] - 2 * xs[i-1][0] + xs[i-2][0], ay = xs[i][1] - 2 * xs[i-1][1] + xs[i-2][1]; mx = Math.max(mx, Math.hypot(ax, ay)); } r(mx.toFixed(3)); } }; requestAnimationFrame(f); })); console.log('max frame-to-frame accel (map px)', sm);
  const r2 = await page.evaluate(() => (window.__saqr.S.rot * 180 / Math.PI).toFixed(1));
  await page.screenshot({ path: `${S}/tests/out/rot-b.png` });
  console.log('rotation deg', r1, '->', r2);
  // fire with a tap while SAFE: should nudge, not crash
  await page.tap('#btnFire');
  // lock a convoy vehicle by tapping it on screen
  const pt = await page.evaluate(() => { const g = window.__saqr; const v = g.vehicles.find(v => v.convoy && v.alive); g.S.zoomGoal = 4; return [v.x, v.y]; });
  await page.waitForTimeout(2500);
  const sp = await page.evaluate(([x, y]) => { const g = window.__saqr; const v = g.vehicles.find(v => v.convoy && v.alive); return [v.x, v.y]; }, pt);
  // project via the page's own transform by locking through the nav button instead of guessing pixels
  await page.tap('#btnFilter'); await page.tap('#nextT'); await page.waitForTimeout(1500);
  console.log('locked', await page.evaluate(() => [window.__saqr.S.tracking, window.__saqr.S.quality, window.__saqr.S.sel && window.__saqr.S.sel.kind]));
  // drag the picture with a finger while locked: lock must hold
  await page.touchscreen.tap(420, 200);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 420, y: 200 }] });
  for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 420 - i * 15, y: 200 + i * 5 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(400);
  console.log('after drag', await page.evaluate(() => [window.__saqr.S.tracking, !!window.__saqr.S.sel, window.__saqr.S.free, Math.round(Math.hypot(window.__saqr.S.vel.x, window.__saqr.S.vel.y))])); await page.waitForTimeout(1500); console.log('coasted to rest', await page.evaluate(() => Math.round(Math.hypot(window.__saqr.S.vel.x, window.__saqr.S.vel.y))));
  await page.tap('#btnArm'); await page.waitForTimeout(200);
  console.log('dock', await page.evaluate(() => document.querySelector('#dAr').textContent + ' | ' + document.querySelector('#dEn').textContent));
  await page.tap('#btnFire'); await page.waitForTimeout(300);
  console.log('in flight', await page.evaluate(() => window.__saqr.projectiles.length));
  await page.waitForFunction(() => window.__saqr.projectiles.length === 0, null, { timeout: 120000, polling: 50 });
  await page.waitForTimeout(1500); await page.screenshot({ path: `${S}/tests/out/rot-hit.png` });
  console.log('kills', await page.evaluate(() => window.__saqr.targets.filter(t => !t.alive).length), 'errors', errs);
  await browser.close();
})();
