const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage(); const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, p); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: p.endsWith('.png') ? 'image/png' : p.endsWith('.webp') ? 'image/webp' : 'image/jpeg' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 30000 });
  await page.click('#btnStart'); await page.evaluate(() => window.__saqr.toSensor()); await page.waitForTimeout(500);
  const snapTo = (vk, z) => page.evaluate(([vk, z]) => { const g = window.__saqr; const v = g.vehicles.find(v => v.vk === vk && (v.mode !== 'solo' || !v.dormant)); if (!v) return false;
    if (v.dormant) { v.dormant = false; v.body.visible = v.shadow.visible = true; }
    g.lockOn(v, false); g.S.zoom = g.S.zoomGoal = z; g.S.aim.x = g.S.aimGoal.x = v.x; g.S.aim.y = g.S.aimGoal.y = v.y; g.S.vel.x = g.S.vel.y = 0; return true; }, [vk, z]);
  for (const vk of ['hilux', 'mrap', 'cargo', 'lc79', 'suv', 'tanker', 'launcher']) {
    await snapTo(vk, 12); await page.waitForTimeout(2500);
    await page.screenshot({ path: `${S}/tests/out/shot-${vk}.png` });
  }
  await snapTo('mrap', 3.2); await page.evaluate(() => { const g = window.__saqr; const v = g.vehicles.find(v => v.convoy); g.lockOn(v, false); g.S.aim.x = g.S.aimGoal.x = v.x; g.S.aim.y = g.S.aimGoal.y = v.y + 20; });
  await page.waitForTimeout(2500); await page.screenshot({ path: `${S}/tests/out/shot-convoy.png` });
  await page.click('#mNight'); await page.waitForTimeout(2500); await page.screenshot({ path: `${S}/tests/out/shot-night.png` });
  await page.click('#mDay');
  // strike on the tanker
  await snapTo('tanker', 4); await page.click('#btnArm'); await page.waitForTimeout(300);
  await page.evaluate(() => { window.__saqr.S.weapon = 'msl'; window.__saqr.fire(); });
  await page.waitForFunction(() => window.__saqr.projectiles.length === 0, null, { timeout: 120000, polling: 30 });
  await page.waitForTimeout(2600); await page.screenshot({ path: `${S}/tests/out/shot-tanker-hit.png` });
  await page.waitForTimeout(5000); await page.screenshot({ path: `${S}/tests/out/shot-tanker-after.png` });
  console.log('errors', errs);
  await browser.close();
})();
