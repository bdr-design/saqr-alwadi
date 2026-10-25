// Apache cockpit: seat view day/night, the lean-in to the TEDAC, back out, MPD close-ups
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
  await page.waitForTimeout(4000);                      // far-field tiles
  const shot = async (name, wait) => { await page.waitForTimeout(wait || 0); await page.screenshot({ path: `${S}/tests/out/ck-${name}.png` }); };
  await shot('0-brief');
  await page.click('#btnStart');
  await shot('1-seat-day', 800);
  await shot('2-leaning-in', 2300);
  await shot('3-tedac-full', 2200);
  // pick a target, then sit back to see it on the TSD
  await page.evaluate(() => { const g = window.__saqr; const v = g.vehicles.find(v => v.convoy); g.lockOn(v, true); g.S.zoomGoal = 4; });
  await page.waitForTimeout(1500);
  await page.click('#btnCock');
  await shot('4-seat-tracking', 2600);
  await page.screenshot({ path: `${S}/tests/out/ck-5-mpd-left.png`, clip: await page.evaluate(() => { const r = document.querySelector('#mpdL').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });
  await page.screenshot({ path: `${S}/tests/out/ck-6-mpd-right.png`, clip: await page.evaluate(() => { const r = document.querySelector('#mpdR').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; }) });
  // bezel keys: the screen position of a key from the cockpit layout
  const key = (side, g, i) => page.evaluate(([side, g, i]) => { const { CK, BTN } = window.__saqr; const [bx, by] = BTN[side][g][i]; return { x: CK.left + bx * CK.k, y: CK.top + by * CK.k }; }, [side, g, i]);
  const press = async (side, g, i) => { const p = await key(side, g, i); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250); };
  await press('L', 'T', 2);                 // left MPD -> FLT
  await press('R', 'T', 3);                 // right MPD -> ENG
  await shot('5b-pages-flt-eng', 600);
  await press('L', 'T', 5);                 // left MPD -> VID (TADS repeat)
  await press('R', 'T', 1); await press('R', 'B', 3); await press('R', 'R', 1); await press('R', 'R', 1);   // WPN, RKT, QTY 2 -> 4 -> 1
  console.log('wpn', await page.evaluate(() => [window.__saqr.S.weapon, window.__saqr.S.qty, window.__saqr.CK.page.L, window.__saqr.CK.page.R].join(' ')));
  await shot('5c-pages-vid-wpn', 600);
  // lean in toward the right MPD with the wheel, then look left by dragging
  const r = await key('R', 'T', 3);
  await page.mouse.move(r.x, r.y + 60); for (let i = 0; i < 6; i++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(60); }
  await shot('5d-lean-in', 500);
  await page.mouse.move(W * 0.3, H * 0.5); await page.mouse.down(); await page.mouse.move(W * 0.75, H * 0.62, { steps: 12 }); await page.mouse.up();
  await shot('5e-look-left', 500);
  await page.mouse.move(W / 2, H / 2); for (let i = 0; i < 8; i++) { await page.mouse.wheel(0, 150); await page.waitForTimeout(40); }
  await press('L', 'T', 0); await press('R', 'T', 1); await press('R', 'B', 2);   // back to TSD / WPN, Hellfire
  await page.evaluate(() => window.__saqr.setNight(true)); await shot('7-seat-night', 1500);
  await page.evaluate(() => { const g = window.__saqr; g.S.armed = true; g.S.weapon = 'msl'; g.fire(); });
  await page.waitForFunction(() => window.__saqr.projectiles.length === 0, null, { timeout: 120000, polling: 50 });
  await shot('8-seat-night-strike', 600);
  console.log('errors', errs);
  await browser.close();
})();
