// The F-15SA's back seat, still and sharp: the cockpit photo does not move between two frames when nothing moves (no
// shake re-sampling it a fraction of a pixel each frame), the glass adds no crawling grain; screenshots by day and night,
// looking ahead and toward the sun, for the eye: tests/out/glass-<prefix>-*.png
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const PFX = process.argv[2] || 'now';
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 3 });
  await ctx.addInitScript(() => { try { localStorage.setItem('saqr.map', 'theater'); localStorage.setItem('saqr.ac', 'f15'); localStorage.setItem('saqr.hi', '1'); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + v : '')); if (!ok) fails.push(w); };
  const shot = async n => page.screenshot({ path: `${S}/tests/out/glass-${PFX}-${n}.png` });
  await page.evaluate(() => { document.querySelector('#mList button').click(); document.querySelector('#btnStart').click(); window.__saqr.AC.hp = 1e9; });
  await page.waitForTimeout(4000);
  // the photo's place on the screen over a few frames, the aircraft flying (the head's own springs settled on a level orbit)
  const drift = await page.evaluate(() => new Promise(r => { const g = window.__saqr, xs = []; let n = 0;
    const f = () => { xs.push([g.CK.shx, g.CK.shy]); if (++n < 12) requestAnimationFrame(f); else r(xs); }; requestAnimationFrame(f); }));
  const sh = Math.max(...drift.map(([x, y]) => Math.hypot(x, y)));
  check('no shake re-samples the photo each frame (px)', sh < 1e-6, sh.toFixed(3));
  await page.evaluate(() => { window.__saqr.S.frozen = true; });
  await page.waitForTimeout(800);
  await shot('day');
  // the grain: two still frames are the same on the glass
  const same = await page.evaluate(async () => { const g = window.__saqr, cv = g.renderer.domElement;
    const grab = () => { g.S.t += 0.05; g.renderFramePub(); const c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height; c.getContext('2d').drawImage(cv, 0, 0); return c.getContext('2d').getImageData(0, 0, c.width, c.height).data; };
    const A = grab(), B = grab(); let n = 0; for (let i = 0; i < A.length; i += 16) if (Math.abs(A[i] - B[i]) > 1) n++; return n; });
  check('no crawling grain on the glass (pixels that change in a still frame)', same === 0, same);
  // looking toward the sun: the afternoon sun at 235°, 32° up; turn the orbit so it stands ahead and left
  await page.evaluate(() => { const g = window.__saqr; g.S.frozen = false; });
  await page.waitForFunction(() => { const h = window.__saqr.plane.hdg; return Math.abs(((h - 245 + 540) % 360) - 180) < 12; }, null, { timeout: 120000, polling: 200 }).catch(() => console.log('(the orbit did not bring the sun ahead)'));
  await page.evaluate(() => { window.__saqr.S.frozen = true; });
  await page.waitForTimeout(800);
  await shot('sun');
  await page.evaluate(() => { const g = window.__saqr; g.S.frozen = false; g.setNight(true); });
  await page.waitForTimeout(3000);
  await page.evaluate(() => { window.__saqr.S.frozen = true; });
  await page.waitForTimeout(800);
  await shot('night');
  if (errs.length) check('no page errors', false, errs.join(' | '));
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
