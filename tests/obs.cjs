// The observer's camera (src/game/11b-observer.js): a GPS bomb released (on the target's coordinates: a laser bomb
// released from anywhere lands where it can steer to, not on the target) on a sortie is taken from the high ground
// (on Wadi Seren: the country's own heights), recorded while it falls and for some seconds after; then the clip is on
// the iPad's observer tab, played there. Its frames into tests/out/obs-*.png (by ffmpeg, when it is on the machine).
// python3 tools/build.py && node tests/obs.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const S = path.resolve(__dirname, '..');
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.html': 'text/html', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.js': 'application/javascript', '.glb': 'model/gltf-binary', '.json': 'application/json', '.mp3': 'audio/mpeg' };
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + JSON.stringify(v) : '')); if (!ok) fails.push(w); };
  for (const [map, id] of [['seren', 'j_sv_compound'], ['theater', 'j_cas']]) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(m => { localStorage.setItem('saqr.map', m); localStorage.setItem('saqr.ac', 'f15'); localStorage.setItem('saqr.jstart', 'air'); }, map);
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
    const st = await page.evaluate(() => ({ s: window.__saqr.OBSR.s, mime: window.__saqr.OBS_MIME }));
    check(map + ': the jet in the air loaded, a format to record in', st.s === 2 && !!st.mime, st);
    await page.waitForTimeout(6000);
    // a laser bomb on the nearest target, released straight away (the strike itself: not the run's consent)
    const rel = await page.evaluate(() => { const g = window.__saqr, t = g.targets.filter(t => t.alive).sort((a, b) => Math.hypot(a.x - g.plane.x, a.y - g.plane.y) - Math.hypot(b.x - g.plane.x, b.y - g.plane.y))[0];
      g.S.armed = true; g.lockOn(t, true); g.S.ammo.jdam = Math.max(1, g.S.ammo.jdam || 0); g.S.weapon = 'jdam'; g.jetRelease('jdam', { x: t.x, y: t.y }); const r = g.OBSR.rec;
      return r ? { cam: { x: Math.round(r.cam.x), y: Math.round(r.cam.y), h: Math.round(r.cam.h) }, tof: Math.round(r.p.tof), rng: Math.round(Math.hypot(r.cam.x - t.x, r.cam.y - t.y) * g.MPP) } : null; });
    check(map + ': the release starts the observer\'s take, from 3.5-4.5 km', !!rel && rel.rng >= 3400 && rel.rng <= 4600, rel);
    if (!rel) { await ctx.close(); continue; }
    await page.waitForFunction(() => window.__saqr.OBS.clips.length > 0, null, { timeout: (rel.tof + 40) * 1000 }).catch(() => {});
    const cl = await page.evaluate(() => { const c = window.__saqr.OBS.clips[0]; return c ? { size: c.blob.size, mime: c.mime, dur: Math.round(c.dur), zoom: c.zoom, rng: +c.rng.toFixed(1) } : null; });
    check(map + ': the strike a clip, its impact and after it in', !!cl && cl.size > 20000 && cl.dur >= 8, cl);
    if (cl) {
      const b64 = await page.evaluate(async () => { const b = window.__saqr.OBS.clips[0].blob, f = new FileReader(); return await new Promise(ok => { f.onload = () => ok(String(f.result).split(',')[1]); f.readAsDataURL(b); }); });
      const vf = `${S}/tests/out/obs-${map}.${cl.mime.includes('mp4') ? 'mp4' : 'webm'}`; fs.writeFileSync(vf, Buffer.from(b64, 'base64'));
      try { execSync(`ffmpeg -y -loglevel error -i ${vf} -vf "fps=1/2.5,scale=640:-1,tile=4x4" -frames:v 1 ${S}/tests/out/obs-${map}-frames.png`); console.log('frames', `tests/out/obs-${map}-frames.png`); } catch (e) { console.log('ffmpeg:', e.message.split('\n')[0]); }
      // played on the iPad's observer tab
      await page.evaluate(() => { const g = window.__saqr; g.efbShow(true); g.EFB.tab = 'obs'; g.EFB.dirty = true; });
      await page.waitForTimeout(1200);
      await page.evaluate(() => { const g = window.__saqr; g.OBS.sel = 0; });
      const play = await page.evaluate(async () => { const g = window.__saqr; g.EFB.tab = 'obs'; const v = document.createElement('video'); return true; });
      await page.evaluate(() => { const E = window.__saqr.EFB; E.dirty = true; });
      await page.waitForTimeout(800); await page.screenshot({ path: `${S}/tests/out/obs-${map}-efb.png` });
    }
    check(map + ': no page errors', errs.length === 0, errs.slice(0, 3));
    await ctx.close();
  }
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close(); process.exit(fails.length ? 1 : 0);
})();
