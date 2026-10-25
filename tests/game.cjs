const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const [,, W, H, NAME] = process.argv;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' || (m.type() === 'warning' && !/GPU stall|swiftshader|GroupMarker/.test(m.text()))) errs.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await page.route('**/*', r => {
    const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) {
      const p = new URL(u).pathname;
      if (p === '/' ) return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, p);
      if (fs.existsSync(f)) return r.fulfill({ body: fs.readFileSync(f), contentType: p.endsWith('.png') ? 'image/png' : p.endsWith('.webp') ? 'image/webp' : 'image/jpeg' });
      return r.fulfill({ status: 404, body: '' });
    }
    return r.abort();
  });
  const shot = n => page.screenshot({ path: `${S}/tests/out/${NAME}-${n}.png` });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 120000 });
  await page.waitForTimeout(800); await shot('0-brief');
  await page.click('#btnStart'); await page.evaluate(() => window.__saqr.toSensor()); await page.waitForTimeout(2500); await shot('1-wide'); console.log('snd', await page.evaluate(() => { const B = window.__saqr.Snd.bank; if (!B) return 'no bank'; const r = {}; for (const k in B) { const b = B[k][0], d = b.getChannelData(0); let pk = 0, nan = 0, rms = 0; for (let i = 0; i < d.length; i++) { if (!isFinite(d[i])) nan++; pk = Math.max(pk, Math.abs(d[i])); rms += d[i]*d[i]; } r[k] = [b.duration.toFixed(2), pk.toFixed(2), Math.sqrt(rms/d.length).toFixed(3), nan]; } return JSON.stringify(r); }));
  // lock the convoy's MRAP and zoom in
  await page.evaluate(() => { const g = window.__saqr; const v = g.vehicles.find(v => v.convoy && v.vk === 'mrap'); g.lockOn(v, true); g.S.zoomGoal = 12; });
  await page.waitForTimeout(3500); await shot('2-zoom12'); console.log('engine', await page.evaluate(() => !!window.__saqr.Snd.engine)); console.log('aimErr', await page.evaluate(() => { const g = window.__saqr; return [Math.round(g.S.aim.x - g.S.sel.x), Math.round(g.S.aim.y - g.S.sel.y), g.S.zoom.toFixed(2)]; }));
  const st = await page.evaluate(() => { const g = window.__saqr; return { q: g.S.quality, v: g.vehicles.map(v => [v.vk, Math.round(v.s), +v.v.toFixed(1), Math.round(v.lat*10)/10]) }; });
  console.log('state', JSON.stringify(st));
  await page.click('#btnArm'); await page.waitForTimeout(300);
  console.log('dock', await page.evaluate(() => document.querySelector('#dAr').textContent + ' | ' + document.querySelector('#dEn').textContent + ' | fire disabled=' + document.querySelector('#btnFire').disabled));
  await page.click('#btnFire');
  // wait for terminal phase, then capture the sequence
  await page.waitForFunction(() => { const p = window.__saqr.projectiles[0]; return !p || p.tti < 0.25; }, null, { timeout: 120000, polling: 16 });
  await shot('3-terminal');
  await page.waitForFunction(() => window.__saqr.projectiles.length === 0, null, { timeout: 20000, polling: 16 });
  await shot('4-impact');
  await page.waitForTimeout(1200); await shot('5-after1s');
  await page.waitForTimeout(5000); await shot('6-after6s');
  await page.evaluate(() => { window.__saqr.S.zoomGoal = 4; }); await page.waitForTimeout(2500); await shot('7-x4');
  await page.click('#mNight'); await page.evaluate(() => { const g = window.__saqr; const v = g.vehicles.find(v => v.convoy && v.alive); g.lockOn(v, true); g.S.zoomGoal = 4; });
  await page.waitForTimeout(3000); await shot('8-night');
  const st2 = await page.evaluate(() => { const g = window.__saqr; return { kills: g.targets.filter(t => !t.alive).length, v: g.vehicles.map(v => [v.vk, v.alive, Math.round(v.s), +v.v.toFixed(1), Math.round(v.lat*10)/10, !!v.bypass]) }; });
  console.log('after', JSON.stringify(st2));
  const fps = await page.evaluate(() => new Promise(r => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < 2000 ? requestAnimationFrame(f) : r(n / 2); }; requestAnimationFrame(f); }));
  console.log('fps(sw)', fps, 'errors', errs.slice(0, 10));
  await browser.close();
})();
