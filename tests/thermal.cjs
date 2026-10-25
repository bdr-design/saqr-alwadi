// thermal sensor: EO vs WHOT/BHOT, day and night, convoy, personnel and a strike
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
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
  const shot = async (name, wait) => { await page.waitForTimeout(wait || 2500); await page.screenshot({ path: `${S}/tests/out/ir-${name}.png` }); };
  const look = (sel, z, dy) => page.evaluate(([sel, z, dy]) => { const g = window.__saqr; const t = sel === 'convoy' ? g.vehicles.find(v => v.convoy) : sel === 'pax' ? g.targets.find(t => t.kind === 'personnel') : g.vehicles.find(v => v.vk === sel);
    g.lockOn(t, false); g.S.zoom = g.S.zoomGoal = z; g.S.aim.x = g.S.aimGoal.x = t.x; g.S.aim.y = g.S.aimGoal.y = t.y + (dy || 0); g.S.vel.x = g.S.vel.y = 0; }, [sel, z, dy]);
  const sensor = s => page.evaluate(s => window.__saqr.setSensor(s), s);
  const night = n => page.evaluate(n => window.__saqr.setNight(n), n);
  // wide
  await shot('1-wide-eo', 1500);
  await sensor('wh'); await shot('2-wide-whot-day');
  // convoy
  await look('convoy', 4, -25); await shot('3-convoy-whot-day');
  await night(true); await shot('4-convoy-whot-night');
  await sensor('bh'); await shot('5-convoy-bhot-night');
  await sensor('eo'); await shot('5b-convoy-lltv-night');
  // parked vehicle at night: engine cold, metal colder than the ground
  await sensor('wh'); await look('launcher', 8); await shot('5c-launcher-whot-night');
  await sensor('eo'); await shot('5d-launcher-lltv-night');
  // personnel close up
  await sensor('wh'); await look('pax', 12); await shot('6-pax-whot-night');
  await night(false); await shot('7-pax-whot-day');
  // strike at night
  await night(true); await look('convoy', 6, 0); await page.click('#btnArm'); await page.waitForTimeout(300);
  await page.evaluate(() => { window.__saqr.S.weapon = 'msl'; window.__saqr.fire(); });
  await page.waitForFunction(() => window.__saqr.projectiles.length === 0, null, { timeout: 120000, polling: 30 });
  await shot('8-strike-whot', 300);
  await shot('9-strike-whot-6s', 6000);
  await sensor('bh'); await shot('10-strike-bhot', 1200);
  console.log('errors', errs);
  await browser.close();
})();
