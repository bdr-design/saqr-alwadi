// The observer's camera (src/game/11b-observer.js): a drone's live picture of the strike, from another angle, on the
// iPad's observer tab. A GPS bomb's run on the theatre (and on Wadi Seren): the take begins on the run, before the
// release; while the iPad is down nothing is drawn for it (and the world's time is not held for it); the tab open, the
// picture comes, 24 a second; the jet, the bomb's fall, the impact, then the take ends and its targets are let go.
// Nothing is recorded. Its pictures into tests/out/obs-<map>-<n>.png, the iPad into tests/out/obs-<map>-efb.png.
// python3 tools/build.py && node tests/obs.cjs   (OBS_MAP=theater for one map)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.js': 'application/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.mp3': 'audio/mpeg' };
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + JSON.stringify(v) : '')); if (!ok) fails.push(w); };
  for (const [map, id] of [['theater', 'j_cas'], ['seren', 'j_sv_compound']].filter(m => !process.env.OBS_MAP || m[0] === process.env.OBS_MAP)) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(m => { localStorage.setItem('saqr.map', m); localStorage.setItem('saqr.ac', 'f15'); localStorage.setItem('saqr.jstart', 'air'); }, map);
    // (the pictures put onto the camera's canvas counted, and MediaRecorder watched: it must never be made)
    await ctx.addInitScript(() => { window.__put = 0; window.__mr = 0; const pi = CanvasRenderingContext2D.prototype.putImageData;
      CanvasRenderingContext2D.prototype.putImageData = function () { if (this.canvas.width === 1280) window.__put++; return pi.apply(this, arguments); };
      if (window.MediaRecorder) { const M = window.MediaRecorder; window.MediaRecorder = function () { window.__mr++; return new M(...arguments); }; window.MediaRecorder.isTypeSupported = M.isTypeSupported; } });
    const page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errs.push(m.text()); });
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
      if (u.startsWith('http://test/')) { const p = decodeURIComponent(new URL(u).pathname), f = path.join(S, p === '/' ? '/index.html' : p);
        return fs.existsSync(f) && fs.statSync(f).isFile() ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(f)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
      return r.abort(); });
    await page.goto('http://test/#debug');
    await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
    await page.evaluate(id => { const g = window.__saqr, i = g.MISSIONS.findIndex(m => m.id === id); document.querySelectorAll('#mList .mc:not(.camp)')[i].click(); document.querySelector('#btnStart').click(); g.AC.hp = 1e9; }, id);
    await page.waitForFunction(() => window.__saqr.OBSR.s === 2 || window.__saqr.OBSR.s < 0, null, { timeout: 60000 });
    check(map + ': the jet in the air loaded', await page.evaluate(() => window.__saqr.OBSR.s) === 2);
    await page.waitForTimeout(6000);
    // a GPS bomb's run (a target clear of our own troops: the danger-close rule would refuse it)
    const go = await page.evaluate(() => { const g = window.__saqr, fr = t => Math.min(1e9, ...g.friends.filter(f => f.alive).map(f => Math.hypot(f.x - t.x, f.y - t.y) * g.MPP));
      const al = g.targets.filter(t => t.alive), clear = al.filter(t => fr(t) > 650);
      const t = clear.length ? clear.sort((a, b) => Math.hypot(a.x - g.plane.x, a.y - g.plane.y) - Math.hypot(b.x - g.plane.x, b.y - g.plane.y))[0] : al.sort((a, b) => fr(b) - fr(a))[0];
      g.S.armed = true; g.lockOn(t, true); t.pid = true; g.S.ammo.jdam = Math.max(1, g.S.ammo.jdam || 0); g.S.weapon = 'jdam'; g.jetConsent(true); return !!g.JX.run; });
    check(map + ': the run begun', go);
    await page.waitForFunction(() => window.__saqr.OBSR.rec, null, { timeout: 300000 }).catch(() => {});
    const pre = await page.evaluate(() => { const g = window.__saqr, r = g.OBSR.rec; return r ? { film: r.film, ws: r.ws.length, h: Math.round(r.cam.h) } : null; });
    check(map + ': the camera on the run, before the release, the drone 1.5 km up', !!pre && pre.film && pre.ws === 0 && pre.h === 1500, pre);
    // the iPad down: nothing drawn for it
    await page.waitForTimeout(2500);
    const dark = await page.evaluate(() => ({ put: window.__put, shown: window.__saqr.OBSR.shown, watch: window.__saqr.obsWatch() }));
    check(map + ': the iPad down: nothing drawn for the camera', dark.put === 0 && !dark.shown && !dark.watch, dark);
    // up, on its observer tab: the picture, live
    await page.evaluate(() => { const g = window.__saqr; g.efbShow(true); g.EFB.tab = 'obs'; g.EFB.dirty = true; });
    const t0 = Date.now(), p0 = await page.evaluate(() => window.__put);
    await page.waitForTimeout(3000);
    const live = await page.evaluate(() => ({ put: window.__put, shown: window.__saqr.OBSR.shown, watch: window.__saqr.obsWatch() }));
    const rate = (live.put - p0) / ((Date.now() - t0) / 1000);
    // (a few a second at least: the headless GPU here draws the whole game some ten times a second)
    check(map + ': the tab open: the picture comes, live', live.watch && live.shown && live.put - p0 >= 3, { ...live, perS: +rate.toFixed(1) });
    let n = 0;
    const grab = async () => { const b64 = await page.evaluate(() => window.__saqr.OBSR.cv.toDataURL('image/png').split(',')[1]); fs.writeFileSync(`${S}/tests/out/obs-${map}-${n++}.png`, Buffer.from(b64, 'base64')); };
    // (the picture the right way up: the sky (bright, empty of the ground's detail) over the ground, a frame with both)
    await grab(); await page.screenshot({ path: `${S}/tests/out/obs-${map}-efb.png` });
    // the release, the fall, the impact, as they come
    await page.waitForFunction(() => window.__saqr.projectiles.some(p => p.type === 'jdam'), null, { timeout: 300000 }).catch(() => {});
    await page.waitForTimeout(1500); await grab();
    await page.waitForTimeout(4000); await grab();
    await page.waitForFunction(() => !window.__saqr.projectiles.some(p => p.type === 'jdam'), null, { timeout: 300000 }).catch(() => {});
    await page.waitForTimeout(1200); await grab();
    await page.waitForTimeout(3000); await grab(); await page.screenshot({ path: `${S}/tests/out/obs-${map}-efb-impact.png` });
    // down again: no more pictures for it
    await page.evaluate(() => { window.__saqr.efbShow(false); });
    await page.waitForTimeout(600); const p1 = await page.evaluate(() => window.__put); await page.waitForTimeout(2000);
    const off = await page.evaluate(p1 => ({ more: window.__put - p1, watch: window.__saqr.obsWatch() }), p1);
    check(map + ': the iPad down again: nothing more drawn', off.more === 0 && !off.watch, off);
    // the take ends some seconds after the impact, its targets let go
    await page.waitForFunction(() => !window.__saqr.OBSR.rec, null, { timeout: 60000 }).catch(() => {});
    const end = await page.evaluate(() => ({ rec: !!window.__saqr.OBSR.rec, mr: window.__mr }));
    check(map + ': the take over after the impact; nothing recorded', !end.rec && end.mr === 0, end);
    check(map + ': no page errors', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close(); process.exit(fails.length ? 1 : 0);
})();
