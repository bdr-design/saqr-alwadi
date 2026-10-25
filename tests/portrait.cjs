const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, p); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: p.endsWith('.png') ? 'image/png' : p.endsWith('.webp') ? 'image/webp' : 'image/jpeg' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 30000 });
  await page.tap('#btnStart'); await page.evaluate(() => window.__saqr.toSensor()); await page.waitForTimeout(1500);
  // tap the x4 button through the rotated layout, then drag the image
  await page.tap('#railL [data-z="4"]'); await page.waitForTimeout(2000);
  const before = await page.evaluate(() => [window.__saqr.S.zoomGoal, Math.round(window.__saqr.S.aim.x), Math.round(window.__saqr.S.aim.y)]);
  await page.mouse.move(200, 400); await page.mouse.down(); await page.mouse.move(200, 300, { steps: 6 }); await page.mouse.up();
  await page.waitForTimeout(600);
  const after = await page.evaluate(() => [Math.round(window.__saqr.S.aim.x), Math.round(window.__saqr.S.aim.y)]);
  console.log('zoom/aim before', before, 'aim after drag-up-on-screen', after);
  await page.screenshot({ path: `${S}/tests/out/portrait-rot.png` });
  console.log('errors', errs);
  await browser.close();
})();
