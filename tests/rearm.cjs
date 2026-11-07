// The ZF-25 out of weapons with targets left (checkEnd): the pilot asks, the iPad offers QUICK REARM, REARM (flown)
// and HOME in its three places, the assist leading to them. QUICK: some 5 minutes of the fight run on with the
// picture down, the jet back in its orbit with its load; HOME: the sortie over. Touched on the iPad as the officer would.
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
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + JSON.stringify(v) : '')); if (!ok) fails.push(w); };
  const run = async how => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
    await ctx.addInitScript(() => { try { localStorage.setItem('saqr.ac', 'f15'); localStorage.setItem('saqr.jstart', 'air'); } catch (_) {} });
    const page = await ctx.newPage();
    const errs = []; page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
      if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
        const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
      return r.abort(); });
    await page.goto('http://test/#debug');
    await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
    await page.evaluate(() => { const g = window.__saqr, i = g.MISSIONS.findIndex(m => m.id === 'j_strike'); document.querySelectorAll('#mList .mc:not(.camp)')[i].click(); document.querySelector('#btnStart').click(); g.AC.hp = 1e9; });
    await page.waitForTimeout(4000);
    // out of weapons, one target down by the last of them
    const a = await page.evaluate(() => { const g = window.__saqr; for (const k in g.S.ammo) g.S.ammo[k] = 0; g.kill(g.targets.find(t => t.alive)); return { winch: g.S.winch, phase: g.S.phase, home: g.S.home, cue: g.assistKeyPub(), left: g.targets.filter(t => t.alive).length }; });
    check(how + ': out of weapons, targets left: the choice asked, the sortie not over', a.winch === 'ask' && a.phase === 'play' && !a.home && a.left > 0, a);
    check(how + ': the assist leads to the iPad', a.cue === 'ck:EFB', a.cue);
    await page.evaluate(() => window.__saqr.efbShow(true)); await page.waitForTimeout(1600);
    const cue = await page.evaluate(() => window.__saqr.assistKeyPub());
    check(how + ': the iPad up, the assist on QUICK REARM', cue === 'efb:rearm', cue);
    // the button by its place (the three commands at the bottom: 1st QUICK, 3rd HOME)
    const at = await page.evaluate(i => { const E = window.__saqr.EFB, W = E.W, H = E.H, cw = 86, cx = W - 10 - 3 * (cw + 4) - 4, x = cx + 4 + i * (cw + 4) + cw / 2, y = H - 40 + 13;
      const r = document.querySelector('#app').getBoundingClientRect(), b = E.box, k = E.W / b.w; return { x: r.left + b.x + x / k, y: r.top + b.y + y / k }; }, how === 'quick' ? 0 : 2);
    await page.waitForTimeout(700); await page.mouse.click(at.x, at.y);
    if (how === 'quick') {
      const t0 = await page.evaluate(() => window.__saqr.S.missionT);
      await page.waitForFunction(() => window.__saqr.S.winch === null, null, { timeout: 120000 }).catch(() => {});
      await page.waitForTimeout(1500);
      const b = await page.evaluate(t0 => { const g = window.__saqr; return { winch: g.S.winch, gs: g.JX.gs, ammo: Object.values(g.S.ammo).reduce((a, b) => a + b, 0), dt: Math.round(g.S.missionT - t0), phase: g.S.phase, orbit: g.plane.mode, efb: g.EFB.up }; }, t0);
      check('quick: back on station with its load, some 5 minutes of the fight gone by', b.winch === null && !b.gs && b.ammo > 0 && b.dt >= 295 && b.dt < 330 && b.phase === 'play', b);
    } else {
      await page.waitForTimeout(8000);
      const b = await page.evaluate(() => { const g = window.__saqr; return { winch: g.S.winch, home: g.S.home, phase: g.S.phase, rtb: g.S.rtbCall }; });
      check('home: the sortie over', b.winch === 'end' && (b.phase === 'end' || b.home), b);
    }
    check(how + ': no page errors', !errs.length, errs);
    await ctx.close();
  };
  await run('quick'); await run('home');
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
