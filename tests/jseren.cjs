// The ZF-25 on Wadi Seren (the ops area on the Velmora country; a trial map: build/trial.html, tools/build.py --trial):
// the jet may fly any map with its own missions now (data/maps/seren/missions_f15.json, tools/jet_missions.py); each
// of the three starts on station (no base there), the country under the glass. Seat views into tests/out/jseren-*.png.
// python3 tools/build.py --trial && node tests/jseren.cjs [width height]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const W = +(process.argv[2] || 844), H = +(process.argv[3] || 390);
const types = { '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg', '.js': 'application/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json' };
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('saqr.map', 'seren'); localStorage.setItem('saqr.ac', 'f15'); localStorage.setItem('saqr.jstart', 'air'); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errs.push(m.text()); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = decodeURIComponent(new URL(u).pathname), f = path.join(S, p);
      return fs.existsSync(f) && fs.statSync(f).isFile() ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/build/trial.html#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + (typeof v === 'string' ? v : JSON.stringify(v)) : '')); if (!ok) fails.push(w); };
  const info = await page.evaluate(() => { const g = window.__saqr; return { map: g.MAP_ID, jet: g.JET, missions: g.MISSIONS.map(m => m.id) }; });
  check('the jet on Wadi Seren, its own three missions', ['j_sv_exit','j_sv_compound','j_sv_tst'].every(i => info.missions.includes(i)), info);
  const maps = await page.evaluate(() => [...document.querySelectorAll('#mMaps button')].map(b => b.dataset.m).join());
  check('the menu offers the jet\'s maps: the theatre, Wadi Seren and Silak port', maps.split(',').sort().join() === 'seren,silak,theater', maps);
  for (const id of ['j_sv_exit', 'j_sv_compound', 'j_sv_tst', 'j_cty_tahrin', 'j_cty_zarda']) {
    if (id !== 'j_sv_exit') { await page.goto('http://test/build/trial.html#debug'); await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 }); }
    await page.evaluate(id => { const g = window.__saqr; document.querySelectorAll('#mList .mc:not(.camp)')[g.MISSIONS.findIndex(m => m.id === id)].click(); document.querySelector('#btnStart').click(); g.AC.hp = 1e9; }, id);
    await page.waitForTimeout(9000);
    const st = await page.evaluate(() => { const g = window.__saqr, p = g.plane; const ct = g.ctPub ? g.ctPub() : null;
      return { mode: p.mode, agl: Math.round(p.alt - g.GROUND), x: Math.round(p.x), y: Math.round(p.y), ct: ct && (ct.n !== undefined ? ct.n : (Array.isArray(ct) ? ct.length : Object.keys(ct).length)), units: g.S.units ? g.S.units.length : null }; });
    check(id + ': on station over the country, the country under it', st.mode === 'orbit' && st.agl > 3000, st);
    await page.screenshot({ path: `${S}/tests/out/jseren-${id}.png` });
    // the sensor on the mission's first target, full screen (on the country: 10 m ground, the vehicles sharp)
    await page.evaluate(() => { const g = window.__saqr, v = (g.targets && g.targets[0]) || (g.vehicles && g.vehicles[0]); if (v) { g.S.aim.x = v.x; g.S.aim.y = v.y; } g.setCockpit(false); });
    await page.waitForTimeout(5000); await page.screenshot({ path: `${S}/tests/out/jseren-${id}-pod.png` });
  }
  check('no page errors', errs.length === 0, errs.slice(0, 5));
  console.log(fails.length ? 'FAILED: ' + fails.join(', ') : 'all passed');
  await browser.close(); process.exit(fails.length ? 1 : 0);
})();
