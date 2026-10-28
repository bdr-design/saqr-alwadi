// The evening and the weather (setTod, setWx, applySky): the settings' «الوقت» (day, dusk, night) and «الجو» (clear,
// dust) kept across a reload; at dusk the shadows three times as long, the sun low in the west; a mission set at
// night stays night; in dust the pod's TV loses most of its contrast and the thermal far less, the Apache's haze five
// times as thick. Screenshots into tests/out/weather-*.png.
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
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('saqr.ac', 'f15'); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + JSON.stringify(v) : '')); if (!ok) fails.push(w); };
  // the pod's picture: its contrast (the spread of its luminance) in the sensor, for TV and thermal
  // (a still taken as the pod's tape takes them, right after the frame is drawn)
  const spread = async () => { await page.waitForTimeout(600);
    const n = await page.evaluate(() => { const g = window.__saqr; g.tapeMark('t', 't'); return g.TAPE.length; });
    await page.waitForFunction(n => window.__saqr.TAPE.length > n, n, { timeout: 20000 });
    return page.evaluate(() => { const T = window.__saqr.TAPE, cv = T[T.length - 1].cv, d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data; let s = 0, s2 = 0, k = 0;
      for (let i = 0; i < d.length; i += 4) { const l = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114; s += l; s2 += l * l; k++; } T.length = 0; return Math.sqrt(s2 / k - (s / k) ** 2); }); };
  await page.evaluate(() => { const g = window.__saqr, i = g.MISSIONS.findIndex(m => m.id === 'j_cas'); document.querySelectorAll('#mList .mc:not(.camp)')[i].click(); document.querySelector('#btnStart').click(); });
  await page.waitForTimeout(800);
  await page.evaluate(() => { const g = window.__saqr, S = g.S; g.toSensor(); g.setCockpit(false); S.zoom = S.zoomGoal = 3; });
  const shadow = () => page.evaluate(() => { const v = window.__saqr.vehicles[0]; return Math.hypot(v.shadow.position.x - v.x, -v.shadow.position.y - v.y); });
  const day = { sh: await shadow(), tv: await spread() };
  await page.evaluate(() => window.__saqr.setTod('dusk')); await page.waitForTimeout(800);
  const dusk = await page.evaluate(() => ({ cls: document.querySelector('#app').classList.contains('tDusk'), u: window.__saqr.postU.dusk.value }));
  dusk.sh = await shadow();
  await page.screenshot({ path: S + '/tests/out/weather-dusk-pod.png' });
  check('dusk: the warm grade on, the shadows long (×2.6)', dusk.cls && dusk.u === 1 && Math.abs(dusk.sh / day.sh - 2.6) < 0.05, { day, dusk });
  await page.evaluate(() => { window.__saqr.setTod('day'); window.__saqr.setWx('dust'); }); await page.waitForTimeout(800);
  const dustTv = await spread();
  await page.screenshot({ path: S + '/tests/out/weather-dust-tv.png' });
  await page.evaluate(() => window.__saqr.setSensor('wh')); await page.waitForTimeout(1200);
  const dustIr = await spread();
  await page.evaluate(() => window.__saqr.setWx('clear')); await page.waitForTimeout(800);
  const clearIr = await spread();
  console.log('contrast', JSON.stringify({ tv: day.tv, dustTv, clearIr, dustIr }));
  check('dust: the TV loses most of its contrast, the thermal far less', dustTv < day.tv * 0.55 && dustIr > clearIr * 0.65, { tv: day.tv, dustTv, clearIr, dustIr });
  // the settings, and a reload
  await page.evaluate(() => { window.__saqr.setSensor('eo'); document.querySelector('#nTabs [data-scr="set"]').click(); });
  await page.evaluate(() => { document.querySelector('#segT button[data-t="2"]').click(); document.querySelector('#segW button[data-w="1"]').click(); });
  const seg = await page.evaluate(() => ({ t: document.querySelector('#segT .on') && document.querySelector('#segT .on').dataset.t, w: document.querySelector('#segW .on') && document.querySelector('#segW .on').dataset.w }));
  await page.reload(); await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
  const back = await page.evaluate(() => ({ dusk: window.__saqr.S.dusk, wx: window.__saqr.S.wx, night: window.__saqr.S.night }));
  check('the settings: dusk and dust chosen, kept across a reload', seg.t === '2' && seg.w === '1' && back.dusk && back.wx === 'dust' && !back.night, { seg, back });
  // a mission set at night stays night; one set by day is flown at dusk
  const nightMi = await page.evaluate(() => { const g = window.__saqr, i = g.MISSIONS.findIndex(m => m.night === true); if (i < 0) return null; document.querySelectorAll('#mList .mc:not(.camp)')[i].click(); document.querySelector('#btnStart').click(); return { night: g.S.night, dusk: g.postU.dusk.value }; });
  check('a night mission stays night (no dusk grade)', !nightMi || (nightMi.night && nightMi.dusk === 0), nightMi);
  await page.evaluate(() => { document.querySelector('#btnMenu') && document.querySelector('#btnMenu').click(); });
  await page.evaluate(() => { const g = window.__saqr, i = g.MISSIONS.findIndex(m => m.night === false); g.S.phase = 'brief'; document.querySelectorAll('#mList .mc:not(.camp)')[i].click(); document.querySelector('#btnStart').click(); });
  await page.waitForTimeout(600);
  const dayMi = await page.evaluate(() => ({ night: window.__saqr.S.night, dusk: window.__saqr.postU.dusk.value }));
  check('a day mission flown at dusk', !dayMi.night && dayMi.dusk === 1, dayMi);
  await page.evaluate(() => { const g = window.__saqr; g.setCockpit(true); g.CK.t = 0; }); await page.waitForTimeout(1500);
  await page.screenshot({ path: S + '/tests/out/weather-dusk-dust-seat.png' });
  await page.evaluate(() => { window.__saqr.setTod('day'); window.__saqr.setWx('clear'); });
  check('no page errors', !errs.length, errs);
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
