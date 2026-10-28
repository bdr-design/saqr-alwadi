// The F-15SA's start on the ground at the theatre's base: on its stand, engines at idle, the officer's iPad up with
// the tasking (WILCO and UNABLE); WILCO: the call for taxi, the tower, the taxi to the hold short of runway 18, the
// takeoff clearance, the line-up at the intersection, the takeoff, the climb out to the orbit and the check-in on
// station. UNABLE: the jet stays and the sortie ends. Seat views into tests/out/jground-*.png.
// node tests/jground.cjs [width height]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const W = +(process.argv[2] || 844), H = +(process.argv[3] || 390);
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('saqr.map', 'theater'); localStorage.setItem('saqr.ac', 'f15'); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errs.push(m.text()); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + (typeof v === 'string' ? v : JSON.stringify(v)) : '')); if (!ok) fails.push(w); };
  const shot = async (n, wait) => { await page.waitForTimeout(wait || 0); await page.screenshot({ path: `${S}/tests/out/jground-${n}.png` }); };
  const start = id => page.evaluate(id => { const g = window.__saqr; document.querySelectorAll('#mList .mc:not(.camp)')[g.MISSIONS.findIndex(m => m.id === id)].click(); document.querySelector('#btnStart').click(); g.AC.hp = 1e9; }, id);
  const st = () => page.evaluate(() => { const g = window.__saqr, p = g.plane; return { st: g.JX.gs && g.JX.gs.st, mode: p.mode, agl: Math.round(p.alt - 410), kt: Math.round(p.gs / 1.852), hdg: Math.round(p.hdg), x: Math.round(p.x), y: Math.round(p.y), t: Math.round(g.S.missionT), ph: g.JX.P.phase }; });
  // run the world fast until a condition (frames between, so the page draws now and then)
  const until = (cond, max) => page.evaluate(([cond, max]) => new Promise(r => { const g = window.__saqr, f = new Function('g', 'return ' + cond), t0 = g.S.missionT;
    const step = () => { for (let i = 0; i < 60 && !f(g) && g.S.missionT - t0 < max; i++) g.stepSim(0.05); if (f(g) || g.S.missionT - t0 >= max) r(f(g)); else setTimeout(step, 0); }; step(); }), [cond, max]);
  await start('j_cas'); await page.waitForTimeout(2500);
  let s = await st();
  check('on the stand, on its wheels, nose east', s.st === 'stand' && s.agl < 4 && Math.abs(s.hdg - 90) < 2, s);
  check('the iPad up, the tasking waiting: WILCO and UNABLE', await page.evaluate(() => { const E = window.__saqr.EFB; return E.up && E.task.state === 'pending' && E.hits.filter(h => h.h === 26 && h.y > 100).length === 2; }));
  await shot('1-stand', 600);
  // the iPad down, to look out
  await page.evaluate(() => window.__saqr.efbShow(false)); await shot('2-stand-out', 900);
  await page.evaluate(() => window.__saqr.efbShow(true)); await page.waitForTimeout(800);
  const wil = await page.evaluate(() => { const E = window.__saqr.EFB, h = E.hits.find(h => h.h === 26 && h.y > 100 && h.x > E.W / 2), k = E.box.w / E.W; return { x: E.box.x + (h.x + h.w / 2) * k, y: E.box.y + (h.y + h.h / 2) * k }; });
  await page.mouse.click(wil.x, wil.y); await page.waitForTimeout(300);
  check('WILCO: the call for taxi', await page.evaluate(() => window.__saqr.JX.gs.st === 'call'));
  await page.evaluate(() => window.__saqr.efbShow(false));
  check('cleared to taxi: rolling', await until("g.JX.gs.st === 'taxi' && g.plane.gs > 20", 60));
  await shot('3-taxi', 400);
  s = await st(); check('taxiing at a taxi\'s pace', s.kt > 5 && s.kt < 25, s);
  check('to the hold short', await until("g.JX.gs.st === 'hold'", 200));
  s = await st(); check('holding short of runway 18, short of its edge', s.kt < 2 && s.x < 2878, s);
  await shot('4-hold', 400);
  check('cleared, lined up and rolling', await until("g.JX.gs.st === 'takeoff' && g.plane.gs > 150", 120));
  s = await st(); check('on the runway\'s centreline, heading south', Math.abs(s.x - 2903) < 3 && Math.abs(s.hdg - 180) < 3, s);
  await shot('5-roll', 400);
  check('airborne, gear up, turning for the target', await until("g.JX.gs.st === 'climb'", 120));
  await shot('6-climb', 400);
  const lo = await page.evaluate(() => window.__saqr.JX.P.log.slice(-6));
  console.log('pilot', JSON.stringify(lo));
  check('on station: the check-in', await until("!g.JX.gs && g.AC.log.some(l => /ON STATION/.test(l.en))", 600));
  s = await st(); check('at 15,000 ft, in the orbit', Math.abs(s.agl + 410 - 4572) < 200 && s.mode === 'orbit', s);
  console.log('radio', JSON.stringify(await page.evaluate(() => window.__saqr.AC.log.map(l => Math.round(l.t) + ' ' + l.en))));
  // UNABLE: the jet stays, the sortie ends
  await start('j_strike'); await page.waitForTimeout(2500);
  await page.evaluate(() => { const g = window.__saqr; g.efbShow(true); });
  await page.waitForTimeout(800);
  const un = await page.evaluate(() => { const E = window.__saqr.EFB, h = E.hits.filter(h => h.h === 26 && h.y > 100).sort((a, b) => a.x - b.x)[0], k = E.box.w / E.W; return { x: E.box.x + (h.x + h.w / 2) * k, y: E.box.y + (h.y + h.h / 2) * k }; });
  await page.mouse.click(un.x, un.y); await page.waitForTimeout(300);
  await until("g.S.phase === 'end'", 10); await page.waitForTimeout(500);
  s = await st(); check('UNABLE: the sortie over, the jet on its stand', await page.evaluate(() => window.__saqr.S.phase === 'end') && s.agl < 4 && s.kt < 1, s);
  console.log('errors', JSON.stringify(errs));
  check('no page errors', errs.length === 0, errs.length);
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close(); process.exit(fails.length ? 1 : 0);
})();
