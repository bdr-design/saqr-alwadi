// The training sortie (j_train), played as the player would: the pilot's step, the key it lights on the panel, a touch
// on that key, the next step; the laser bomb on the truck, the Maverick on the tank, the mission done. Each step's
// ring must sit on the key it names. Screenshots of the rings into tests/out/train-*.png.
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
  await page.evaluate(() => { const g = window.__saqr, i = g.MISSIONS.findIndex(m => m.id === 'j_train');
    document.querySelectorAll('#mList .mc:not(.camp)')[i].click(); document.querySelector('#btnStart').click(); g.AC.hp = 1e9; g.CK.tc = 4; });
  const ids = await page.evaluate(() => window.__saqr.MISSIONS.map(m => m.id).slice(0, 2));
  check('the training first in the jet\'s list', ids[0] === 'j_train', ids);
  const seen = [], shots = new Set();
  for (let n = 0; n < 900; n++) {
    const st = await page.evaluate(() => { const g = window.__saqr, r = document.querySelector('#trainRing'), T = g.TR;
      if (g.S.phase !== 'play') return { end: true, phase: g.S.phase };
      const step = g.TRAIN[T.i]; if (!step) return { i: T.i };
      if (r.hidden) return { i: T.i, k: step.k };
      const x = parseFloat(r.style.left) + parseFloat(r.style.width) / 2, y = parseFloat(r.style.top) + parseFloat(r.style.height) / 2, q = g.ckFromImg({ x, y });
      return { i: T.i, k: step.k, x: q.x, y: q.y, en: step.en }; });
    if (st.end) { seen.push('END'); break; }
    if (st.k && seen[seen.length - 1] !== st.k) seen.push(st.k);
    if (st.x != null) {
      if (!shots.has(st.k)) { shots.add(st.k); await page.screenshot({ path: S + '/tests/out/train-' + st.k.replace('f.', '') + '.png' }); }
      await page.mouse.click(st.x, st.y); await page.waitForTimeout(700);
    } else await page.waitForTimeout(500);
  }
  console.log('steps', seen.join(' '));
  const end = await page.evaluate(() => ({ phase: window.__saqr.S.phase, alive: window.__saqr.targets.filter(t => t.alive).length, log: window.__saqr.AC.log.map(l => l.en) }));
  // (TRK and LGB may be done as they come: NEXT puts the pod on the target tracking it, the laser bomb is selected at the start)
  const order = ['f.t1', 'f.t3', 'f.t4', 'f.t6', 'f.t7', 'f.t8', 'f.t9', 'f.t10', 'f.t11', 'f.t12', 'f.t13'];
  check('every step in order, by its own key, to the end', order.every((k, i) => seen.indexOf(k) >= 0 && (i === 0 || seen.indexOf(k) > seen.indexOf(order[i - 1]))) && seen[seen.length - 1] === 'END', seen);
  check('the truck and the tank down, the mission over', end.phase === 'end' && end.alive === 0, end);
  check('no check-in on the range (the pilot talks)', !end.log.some(s => /ON STATION/.test(s)), end.log);
  check('no page errors', !errs.length, errs);
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
