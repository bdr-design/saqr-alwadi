// What the Android app asks of the page: the system's back (window.__back: a panel shut, the menu's home, the editor
// left, a mission paused and let go; at the menu's home not taken, so the app goes to the background) and the store's
// answers (window.__store: what is owned kept in saqr.owned, so it holds without the network). With nothing sold yet
// (PAID empty) the store is not asked, and nothing is locked.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
(async () => {
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + JSON.stringify(v) : '')); if (!ok) fails.push(w); };
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
  // the app's bridge, as the Android app puts it there: its calls noted
  await ctx.addInitScript(() => { window.__calls = []; window.SaqrStore = { start: j => __calls.push(['start', j]), buy: id => __calls.push(['buy', id]), restore: () => __calls.push(['restore']) }; });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, p); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 120000 });
  const back = () => page.evaluate(() => window.__back());
  const scr = () => page.evaluate(() => document.querySelector('#nTabs .on').dataset.scr);
  await page.click('#nTabs [data-scr="ops"]');
  check('back on a menu screen: taken, to the home screen', (await back()) === true && (await scr()) === 'home');
  check('back at the home screen: not taken (the app goes to the background)', (await back()) === false);
  await page.click('#btnHow'); check('back with how-to-play open: shut', (await back()) === true && await page.evaluate(() => document.querySelector('#panHow').hidden));
  await page.click('#btnEdit'); await page.waitForTimeout(500);
  check('back in the editor: left for the menu', (await back()) === true && await page.evaluate(() => document.querySelector('#ovEdit').hidden && !document.querySelector('#ovStart').hidden));
  await page.click('#btnStart'); await page.waitForTimeout(1500);
  const p1 = await page.evaluate(() => { const r = window.__back(); return { r, frozen: window.__saqr.S.frozen }; });
  const p2 = await page.evaluate(() => { const r = window.__back(); return { r, frozen: window.__saqr.S.frozen }; });
  check('back in a mission: paused, then let go (no mission thrown away)', p1.r && p1.frozen && p2.r && !p2.frozen, [p1, p2]);
  // the store: nothing sold yet, so not asked; what it reports kept
  check('nothing sold yet: the store not asked', !(await page.evaluate(() => window.__calls.length)));
  const kept = await page.evaluate(() => { window.__store({ type: 'owned', ids: ['f15sa'] }); window.__store({ type: 'bought', id: 'campaign' }); return JSON.parse(localStorage.getItem('saqr.owned')); });
  check('what the store reports owned is kept (saqr.owned)', kept.includes('f15sa') && kept.includes('campaign'), kept);
  check('no page errors', !errs.length, errs);
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
