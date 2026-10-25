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
  await shot('2-still-in-seat', 4000);     // no forced lean-in: the gunner stays in the seat
  console.log('after 4.8 s CK.t =', await page.evaluate(() => window.__saqr.CK.t));
  // TEDAC keys and grips, by their photo positions
  const tk = (g, i) => page.evaluate(([g, i]) => { const { TKEYS, ckFromImg } = window.__saqr; const [x, y] = TKEYS[g][i]; return ckFromImg({ x, y }); }, [g, i]);
  const tpress = async (g, i) => { const p = await tk(g, i); await page.mouse.click(p.x, p.y); await page.waitForTimeout(250); };
  // double-tap the TEDAC: lean in to it and its grips
  const tc = await page.evaluate(() => { const { CK, ckFromImg } = window.__saqr; return ckFromImg({ x: CK.T.x + 20, y: CK.T.y + 20 }); });
  await page.mouse.dblclick(tc.x, tc.y);
  await page.waitForFunction(() => window.__saqr.CK.lean > 1.6 && !window.__saqr.CK.lean0, null, { timeout: 60000 }); await shot('2b-lean-tedac', 300);
  // target the convoy from the seat: NFOV, slew by dragging on the video, tap the vehicle, LOCK with the left grip
  await tpress('L', 1);
  // SwiftShader runs a few frames a second here: wait on the sensor itself, not the clock
  await page.evaluate(() => { const g = window.__saqr; g.S.free = false; });
  await page.waitForFunction(() => { const g = window.__saqr, v = g.vehicles.find(v => v.convoy); g.S.aimGoal.x = v.x + 15; g.S.aimGoal.y = v.y; return Math.hypot(g.S.aim.x - v.x - 15, g.S.aim.y - v.y) < 22 && Math.abs(g.S.zoom - 4) < 0.1; }, null, { timeout: 120000, polling: 200 });
  const vp = await page.evaluate(() => { const g = window.__saqr, v = g.vehicles.find(v => v.convoy), s = g.toScreenPub(v.x, v.y), r = g.CK.sens; return { x: r.x + s.x * r.w / innerWidth, y: r.y + s.y * r.h / innerHeight }; });
  await page.mouse.click(vp.x, vp.y); await page.waitForTimeout(400);
  console.log('picked from seat:', await page.evaluate(() => { const S = window.__saqr.S; return S.sel ? S.sel.vk + ' tracking=' + S.tracking : 'none'; }));
  await tpress('T', 2); await tpress('T', 5);                       // MSL, ARM
  await shot('2c-seat-tracking', 1800);
  const grip = await page.evaluate(() => { const { GRIPS, ckFromImg } = window.__saqr; const [x0, y0, x1] = GRIPS.R; return ckFromImg({ x: (x0 + x1) / 2, y: y0 + 40 }); });
  await page.mouse.click(grip.x, grip.y);
  console.log('fired from right grip:', await page.evaluate(() => window.__saqr.projectiles.length));
  await shot('2d-seat-fired', 1200);
  await page.waitForFunction(() => window.__saqr.projectiles.length === 0, null, { timeout: 120000, polling: 50 });
  await shot('2e-seat-impact', 1500);
  // optional full screen and back
  await page.click('#btnTedac'); await shot('3-tedac-full', 2200);
  await page.evaluate(() => { const g = window.__saqr; g.S.armed = false; const v = g.vehicles.find(v => v.convoy && v.alive); if (v) g.lockOn(v, true); g.S.zoomGoal = 4; });
  await page.waitForTimeout(800);
  await page.click('#btnCock');
  await shot('4-seat-tracking', 2600);
  await page.evaluate(() => { const { CK, ckLook } = window.__saqr; ckLook(1, CK.IW / 2, CK.IH / 2, 14, true); });
  // bezel keys: the screen position of a key from the cockpit layout
  const key = (side, g, i) => page.evaluate(([side, g, i]) => { const { BTN, ckFromImg } = window.__saqr; const [x, y] = BTN[side][g][i]; return ckFromImg({ x, y }); }, [side, g, i]);
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
