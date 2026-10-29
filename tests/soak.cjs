// A long session: every mission of the theatre flown one after another, twice over, then one mission flown for 20
// minutes, in the Apache and in the F-15. What the page holds is read after each: the JavaScript heap (after a full
// collection), the bytes on the GPU (every texture upload and delete is counted: WebGL itself, not three.js's
// tally), three.js's textures, geometries and programs, the objects in the scene, the timers, the map tiles held.
// It fails if any of them grows: from the end of the first round to the end of the second (the first round has
// loaded everything once), and over the long mission from its fifth minute to its twentieth. And if the heap in a
// mission passes HEAP_MAX (docs/PLAN.md, stage 1).
// The page's frames are run by hand, 50 ms of the game each (its longest step), so the time is the game's own and
// not the machine's. node tests/soak.cjs [quick]: 10 s a mission, 6 minutes long, for a look
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
const QUICK = process.argv[2] === 'quick';
const PER = QUICK ? 10 : 30, LONG = QUICK ? 6 : 20, HEAP_MAX = 100;
// what may differ between two looks at the same state: the heap's own noise, and a tile or two in flight
const SLACK = { heap: 4, gpu: 8.5, tex: 2, geo: 4, progs: 0, objs: 12, timers: 4, tiles: 3 };
// counts the bytes of every texture level sent to the GPU, by texture, until it is deleted
function gpuMeter() {
  const live = new Map(); let bytes = 0;
  const bound = new WeakMap();   // the context's texture bound to each unit and target
  const fmtB = { 6408: 4, 6407: 3, 6409: 1, 6410: 2, 6406: 1, 32856: 4, 32849: 3, 33326: 4, 34836: 16, 34842: 8, 33327: 8, 33328: 16 };
  for (const P of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!P) continue; const p = P.prototype;
    const act = p.activeTexture, bind = p.bindTexture, del = p.deleteTexture, img = p.texImage2D, gen = p.generateMipmap, sto = p.texStorage2D;
    const st = gl => { let s = bound.get(gl); if (!s) bound.set(gl, s = { unit: 33984, tex: {} }); return s; };
    const cur = (gl, target) => { const s = st(gl); return s.tex[s.unit + ':' + (target >= 34069 && target <= 34074 ? 34067 : target)]; };
    const put = (t, key, b) => { if (!t) return; let e = live.get(t); if (!e) live.set(t, e = {}); bytes += b - (e[key] || 0); e[key] = b; };
    p.activeTexture = function (u) { st(this).unit = u; return act.call(this, u); };
    p.bindTexture = function (target, t) { st(this).tex[st(this).unit + ':' + target] = t; return bind.call(this, target, t); };
    p.deleteTexture = function (t) { const e = live.get(t); if (e) { for (const k in e) bytes -= e[k]; live.delete(t); } return del.call(this, t); };
    p.texImage2D = function (target, level, ifmt, ...a) {
      let w, h, f;
      if (a.length >= 6) { w = a[0]; h = a[1]; f = a[3]; } else { const src = a[2]; w = src.videoWidth || src.naturalWidth || src.width; h = src.videoHeight || src.naturalHeight || src.height; f = a[0]; }
      put(cur(this, target), target + ':' + level, w * h * (fmtB[ifmt] || fmtB[f] || 4));
      return img.call(this, target, level, ifmt, ...a);
    };
    if (sto) p.texStorage2D = function (target, levels, ifmt, w, h) { put(cur(this, target), target + ':s', w * h * (fmtB[ifmt] || 4) * (levels > 1 ? 4 / 3 : 1)); return sto.call(this, target, levels, ifmt, w, h); };
    p.generateMipmap = function (target) { const t = cur(this, target), e = t && live.get(t); if (e) { const l0 = e[target + ':0'] || 0; put(t, target + ':mips', l0 / 3); } return gen.call(this, target); };
  }
  window.__gpuMB = () => bytes / 1048576;
}
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--enable-precise-memory-info', '--js-flags=--expose-gc', '--autoplay-policy=no-user-gesture-required'] });
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + (typeof v === 'string' ? v : JSON.stringify(v)) : '')); if (!ok) fails.push(w); };
  for (const ac of ['ah64', 'f15']) {
    const ctx = await browser.newContext({ viewport: { width: 640, height: 300 }, deviceScaleFactor: 1 });
    await ctx.addInitScript(ac => {
      try { localStorage.setItem('saqr.map', 'theater'); localStorage.setItem('saqr.ac', ac); localStorage.setItem('saqr.jstart', 'air'); localStorage.setItem('saqr.sound', '1'); localStorage.setItem('saqr.radio', 'ar'); } catch (_) {}
      // the frames: on a timer until the test takes them, then one when stepped
      const q = []; let manual = false;
      window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
      window.__step = t => { const cbs = q.splice(0); for (const cb of cbs) cb(t); };
      setInterval(() => { if (!manual) window.__step(performance.now()); }, 16);
      window.__manual = () => { if (!manual) { manual = true; window.__T = performance.now(); } };
    }, ac);
    await ctx.addInitScript(gpuMeter);
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
      if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
        const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
      return r.abort(); });
    await page.goto('http://test/#debug');
    await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
    const snap = () => page.evaluate(() => { window.gc(); window.gc(); const g = window.__saqr, R = g.renderer; let n = 0; g.sceneA.traverse(() => n++);
      return { heap: +(performance.memory.usedJSHeapSize / 1048576).toFixed(1), gpu: +window.__gpuMB().toFixed(1), tex: R.info.memory.textures, geo: R.info.memory.geometries, progs: R.info.programs.length, objs: n, timers: g.timers.length, tiles: g.tiles.size }; });
    // the game's time, in frames of 50 ms (each drawn)
    const run = secs => page.evaluate(n => { window.__manual(); for (let i = 0; i < n; i++) { window.__T += 50; window.__step(window.__T); } }, Math.round(secs * 20));
    // a mission from its card, the aircraft and the friendlies kept alive (a mission lost early would test less)
    const start = id => page.evaluate(id => { const g = window.__saqr; document.querySelectorAll('#mList .mc:not(.camp)')[g.MISSIONS.findIndex(m => m.id === id)].click(); document.querySelector('#btnStart').click();
      g.AC.hp = 1e9; for (const f of g.friends) f.hp = 1e9; }, id);
    const ids = await page.evaluate(() => window.__saqr.MISSIONS.filter(m => !m.camp).map(m => m.id));
    const t0 = Date.now(); let peak = 0;
    console.log(ac, ids.length, 'missions; at the menu', JSON.stringify(await snap()));
    const ends = [];
    for (let round = 0; round < 2; round++) {
      for (const id of ids) { await start(id); await run(PER); const s = await snap(); peak = Math.max(peak, s.heap); }
      // (back to the menu, as a player would between sessions)
      await page.evaluate(() => document.querySelector('#btnMenu').click()); await run(2);
      const s = await snap(); ends.push(s); console.log(ac, 'round', round + 1, JSON.stringify(s), Math.round((Date.now() - t0) / 1000) + ' s');
    }
    const grew = (a, b) => Object.keys(SLACK).filter(k => b[k] > a[k] + SLACK[k]).map(k => k + ' ' + a[k] + ' → ' + b[k]);
    check(ac + ': nothing grows from one round of all the missions to the next', !grew(...ends).length, grew(...ends).join(', ') || 'flat');
    await start(ids[0]);
    const long = [];
    for (let m = 1; m <= LONG; m++) { await run(60); if (m === 5 || m === LONG || m % 5 === 0) { const s = await snap(); long[m] = s; peak = Math.max(peak, s.heap); console.log(ac, 'long', m, 'min', JSON.stringify(s)); } }
    const lg = grew(long[5], long[LONG]);
    check(ac + `: nothing grows over one mission, from 5 to ${LONG} minutes`, !lg.length, lg.join(', ') || 'flat');
    check(ac + ': the heap in a mission (MB)', peak < HEAP_MAX, peak);
    check(ac + ': no page errors', !errs.length, errs.slice(0, 3));
    await ctx.close();
  }
  console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'all passed');
  await browser.close(); process.exit(fails.length ? 1 : 0);
})();
