// Silak port on the Velmora coast, for its approval (a trial map: build/trial.html, tools/build.py --trial): the
// Sahm's and the ZF-25's sorties there: the seat's view once the country's
// tiles are in, the sensor on the first target, and the cost (frame time, draw calls, triangles, the country's tiles,
// the JS heap). Views into tests/out/silak-*.png, the numbers printed.
// python3 tools/build.py --trial && node tests/silak.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.js': 'application/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json' };
const RUNS = [['f15', 'silak', 'j_sk_coast'], ['f15', 'silak', 'j_sk_strip'], ['f15', 'silak', 'j_sk_mole'],
              ['ah64', 'silak', 'sk_tic'], ['ah64', 'silak', 'sk_landing']];
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info'] });
  const fails = [], rows = [];
  for (const [ac, map, id] of RUNS) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(([ac, map]) => { try { localStorage.setItem('saqr.map', map); localStorage.setItem('saqr.ac', ac); localStorage.setItem('saqr.jstart', 'air'); } catch (_) {} }, [ac, map]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errs.push(m.text()); });
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
      if (u.startsWith('http://test/')) { const p = decodeURIComponent(new URL(u).pathname), f = path.join(S, p);
        return fs.existsSync(f) && fs.statSync(f).isFile() ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
      return r.abort(); });
    await page.goto('http://test/build/trial.html#debug');
    await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
    const ok = await page.evaluate(id => { const g = window.__saqr, i = g.MISSIONS.findIndex(m => m.id === id); if (i < 0) return false;
      document.querySelectorAll('#mList .mc:not(.camp)')[i].click(); document.querySelector('#btnStart').click(); g.AC.hp = 1e9; return true; }, id);
    if (!ok) { fails.push(id + ' not offered'); await ctx.close(); continue; }
    await page.waitForTimeout(25000);                      // (the country's tiles in)
    const tag = `${ac}-${map}-${id}`;
    await page.screenshot({ path: `${S}/tests/out/silak-${tag}-seat.png` });
    // the cost, from the game's own frame meter (PERF: its row every 10 s), in the seat
    await page.evaluate(() => window.__saqr.perfShow(true)); await page.waitForTimeout(12500);
    const m = await page.evaluate(() => { const g = window.__saqr, r = g.PERF.log[g.PERF.log.length - 1] || {}, ct = g.ctPub ? g.ctPub() : [];
      return { fps: r.fps, ms: r.ms, work: r.work, draws: r.draws, tris: r.tris, tex: r.tex, heap: r.heap, ct: ct.length, agl: Math.round(g.plane.alt - g.GROUND) }; });
    await page.evaluate(() => window.__saqr.perfShow(false));
    // the sensor full screen on the first target
    await page.evaluate(() => { const g = window.__saqr, v = (g.targets && g.targets[0]) || (g.vehicles && g.vehicles[0]); if (v) { g.S.aim.x = v.x; g.S.aim.y = v.y; } g.setCockpit(false); });
    await page.waitForTimeout(4000);
    await page.screenshot({ path: `${S}/tests/out/silak-${tag}-pod.png` });
    rows.push([tag, m, errs.length]); console.log(tag, JSON.stringify(m), 'errors', errs.length, errs.slice(0, 2));
    if (errs.length) fails.push(tag + ': page errors');
    await ctx.close();
  }
  console.log(fails.length ? 'FAILED: ' + fails.join(', ') : 'all passed');
  await browser.close(); process.exit(fails.length ? 1 : 0);
})();
