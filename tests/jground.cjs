// The F-15SA's start on the ground at its base (5.4 km east of the battle): on its stand, engines at idle, the
// officer's iPad up with the tasking (WILCO and UNABLE); WILCO: the call for taxi, the tower, the taxi to the hold
// short of runway 18, the takeoff clearance, the line-up on the threshold, the takeoff, the climb out to the orbit and
// the check-in on station. UNABLE: the jet stays and the sortie ends. The menu's other choice, in the air, starts on
// station. Seat views into tests/out/jground-*.png.
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
  // the calls on the ground, the tower's and the answers, all spoken (data/radio_f15.json, tools/make_radio.py)
  const said = ['f.r.taxi', 't.taxi', 'f.r.taxirb', 'f.r.hold', 't.clear', 'f.r.clear', 'f.r.airborne', 'f.r.wilco', 'f.r.unable', 'f.rtb', 'f.r.inbound', 't.inbound', 'f.r.final', 't.land', 'f.r.land', 't.park', 'f.r.park'], clips = JSON.parse(fs.readFileSync(S + '/data/radio_f15.json', 'utf8')).clips;
  check('the ground calls recorded', said.every(k => clips[k] && clips[k][1] > 0.5), said.filter(k => !clips[k]));
  // (and in Arabic, once the owner's recordings are in: tools/make_radio_ar.py)
  if (fs.existsSync(S + '/data/radio_ar_f15.json')) { const ar = JSON.parse(fs.readFileSync(S + '/data/radio_ar_f15.json', 'utf8')).clips;
    check('and in Arabic', said.every(k => ar[k] && ar[k][1] > 0.5), said.filter(k => !ar[k])); }
  const shot = async (n, wait) => { await page.waitForTimeout(wait || 0); await page.screenshot({ path: `${S}/tests/out/jground-${n}.png` }); };
  const start = id => page.evaluate(id => { const g = window.__saqr; document.querySelectorAll('#mList .mc:not(.camp)')[g.MISSIONS.findIndex(m => m.id === id)].click(); document.querySelector('#btnStart').click(); g.AC.hp = 1e9; }, id);
  const st = () => page.evaluate(() => { const g = window.__saqr, p = g.plane; return { st: g.JX.gs && g.JX.gs.st, mode: p.mode, agl: Math.round(p.alt - 410), kt: Math.round(p.gs / 1.852), hdg: Math.round(p.hdg), x: Math.round(p.x), y: Math.round(p.y), t: Math.round(g.S.missionT), ph: g.JX.P.phase }; });
  // run the world fast until a condition (frames between, so the page draws now and then)
  const until = (cond, max) => page.evaluate(([cond, max]) => new Promise(r => { const g = window.__saqr, f = new Function('g', 'return ' + cond), t0 = g.S.missionT;
    const step = () => { for (let i = 0; i < 60 && !f(g) && g.S.missionT - t0 < max; i++) g.stepSim(0.05); if (f(g) || g.S.missionT - t0 >= max) r(f(g)); else setTimeout(step, 0); }; step(); }), [cond, max]);
  // (ours on the ground held up while the jet is on its way out: the test is of the jet, not of the fight)
  const hold = () => page.evaluate(() => { for (const f of window.__saqr.friends) { f.hp = 1e9; for (const m of f.men || []) m.hp = 1e9; } });
  await start('j_cas'); await hold(); await page.waitForTimeout(2500);
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
  s = await st(); const rw = await page.evaluate(() => window.__saqr.MAP.airbase.runway);
  check('holding short of runway 18, short of its edge', s.kt < 2 && s.x < rw[0] - rw[3] / 2 - 20, s);
  await shot('4-hold', 400);
  check('cleared, lined up and rolling', await until("g.JX.gs.st === 'takeoff' && g.plane.gs > 150", 120));
  s = await st(); check('on the runway\'s centreline, heading south', Math.abs(s.x - rw[0]) < 3 && Math.abs(s.hdg - 180) < 3, s);
  await shot('5-roll', 400);
  check('airborne, gear up, turning for the target', await until("g.JX.gs.st === 'climb'", 120));
  await shot('6-climb', 400);
  const lo = await page.evaluate(() => window.__saqr.JX.P.log.slice(-6));
  console.log('pilot', JSON.stringify(lo));
  check('on station: the check-in', await until("!g.JX.gs && g.AC.log.some(l => /ON STATION/.test(l.en))", 600));
  s = await st(); check('at 15,000 ft, in the orbit', Math.abs(s.agl + 410 - 4572) < 200 && s.mode === 'orbit', s);
  const rl = await page.evaluate(() => window.__saqr.AC.log.map(l => l.en)); console.log('radio', JSON.stringify(rl));
  check('the ground controller heard only once checked in', rl.findIndex(l => /^HUNTER/.test(l)) < 0 || rl.findIndex(l => /^HUNTER/.test(l)) > rl.findIndex(l => /ON STATION/.test(l)));
  // home: the targets down, the result stands; the jet flies back, lands on 18 into the wind, turns off and taxis to its
  // stand, the engines run down; then the end card
  await page.evaluate(() => { const g = window.__saqr; for (const t of g.targets) if (t.alive) g.kill(t); });
  check('the mission over: home first, the card not yet', await until("g.JX.gs && g.JX.gs.home", 5) && await page.evaluate(() => document.querySelector('#ovEnd').hidden));
  check('no weapons off it on the way home', await page.evaluate(() => { const g = window.__saqr; g.S.armed = true; return !g.fireStatePub().ok; }));
  check('on final for 18', await until("g.JX.P.phase === 'final'", 600));
  check('3 km out', await until("g.plane.y > g.MAP.airbase.runway[1] - 3000 / 0.85", 200));
  s = await st(); const gear = await page.evaluate(() => window.__saqr.JX.ac.gearCmd === 1);
  check('3 km out: lined up, on the glide path (some 160 m), the gear down', Math.abs(s.x - rw[0]) * 0.85 < 15 && Math.abs(s.agl - 3300 * Math.tan(2.75 * Math.PI / 180)) < 40 && Math.abs(s.hdg - 180) < 5 && gear, s);
  await shot('7-final', 400);
  check('touchdown', await until("g.JX.ac.o.wow && g.JX.P.mode === 'land'", 200));
  const td = await page.evaluate(() => { const g = window.__saqr, T = g.JX.P.touch; return T && { vs: +T.vs.toFixed(2), kcas: Math.round(T.kcas), along: Math.round(T.along), across: +T.across.toFixed(1) }; });
  check('a fair landing: in the touchdown zone, on the centreline, under 2 m/s down', td && td.along > 100 && td.along < 700 && Math.abs(td.across) < 5 && td.vs > -2, td);
  await shot('8-rollout', 1200);
  check('off the runway at a link, taxiing in', await until("g.JX.gs.st === 'taxiin'", 200));
  check('on its stand, the engines run down', await until("g.JX.gs.st === 'parked'", 600));
  s = await st(); const sd = await page.evaluate(() => window.__saqr.MAP.airbase.taxi.stand);
  check('stopped on the stand', s.kt <= 1 && Math.hypot(s.x - sd[0], s.y - sd[1]) * 0.85 < 6, s);
  check('then the card', await until("g.S.phase === 'end'", 20) && await page.waitForFunction(() => !document.querySelector('#ovEnd').hidden, null, { timeout: 5000 }).then(() => true, () => false));
  const rh = await page.evaluate(() => window.__saqr.AC.log.map(l => l.en)); console.log('radio', JSON.stringify(rh));
  check('the calls home: inbound, final, cleared to land, to parking', ['INBOUND FOR FULL STOP', 'FINAL RUNWAY 18', 'CLEARED TO LAND, SAQR', 'PARKING VIA ALPHA, SAQR'].every(k => rh.some(l => l.includes(k))));
  // the skips: out onto the runway at once (once the tasking is answered), and home onto a 5 km final
  await start('j_cas'); await hold(); await page.waitForTimeout(1500);
  await page.evaluate(() => window.__saqr.efbShow(true)); await page.waitForTimeout(800);
  const wil2 = await page.evaluate(() => { const E = window.__saqr.EFB, h = E.hits.find(h => h.h === 26 && h.y > 100 && h.x > E.W / 2), k = E.box.w / E.W; return { x: E.box.x + (h.x + h.w / 2) * k, y: E.box.y + (h.y + h.h / 2) * k }; });
  await page.mouse.click(wil2.x, wil2.y); await page.waitForTimeout(300);
  const skipBtn = f => page.evaluate(f => { const g = window.__saqr; g.efbDraw(); return g.EFB.hits.some(h => h.fn === g[f]); }, f);
  check('WILCO: SKIP TO RUNWAY on the iPad', await skipBtn('jetSkipOut'));
  await page.evaluate(() => window.__saqr.jetSkipOut()); await page.waitForTimeout(300);
  s = await st(); check('skipped: lined up on 18\'s threshold at once, on its wheels', Math.abs(s.x - rw[0]) * 0.85 < 2 && Math.abs(s.hdg - 180) < 2 && s.agl < 4 && s.y < rw[1] + 120, s);
  check('the clearance and rolling within 15 s', await until("g.JX.gs.st === 'takeoff' && g.plane.gs > 50", 15));
  check('and airborne', await until("g.JX.gs.st === 'climb'", 120));
  await page.evaluate(() => { const g = window.__saqr; for (const t of g.targets) if (t.alive) g.kill(t); });
  check('home: SKIP TO FINAL on the iPad', await until("g.JX.gs && g.JX.gs.home", 5) && await skipBtn('jetSkipHome'));
  await page.evaluate(() => window.__saqr.jetSkipHome()); await page.waitForTimeout(300);
  s = await st(); check('skipped: on a 5 km final, on the glide path', Math.abs(s.x - rw[0]) * 0.85 < 2 && Math.abs(s.agl - 254) < 15 && Math.abs(s.hdg - 180) < 2, s);
  check('and down on 18', await until("g.JX.ac.o.wow && g.JX.P.mode === 'land'", 120));
  const td2 = await page.evaluate(() => { const T = window.__saqr.JX.P.touch; return T && { vs: +T.vs.toFixed(2), along: Math.round(T.along), across: +T.across.toFixed(1) }; });
  check('a fair landing from it', td2 && td2.along > 100 && td2.along < 700 && Math.abs(td2.across) < 5 && td2.vs > -2, td2);
  // home from the orbit high up (descending round the point first): from where on the orbit and how high it may be, a
  // landing in the touchdown zone, stopped on the runway
  for (const [ft, a] of [[15000, 315], [20000, 180], [25000, 0]]) {
    await start('j_cas'); await hold(); await page.waitForTimeout(1200);
    await page.evaluate(([ft, a]) => { const g = window.__saqr, J = g.JX, c = J.c || { x: g.W0 / 2, y: g.H0 / 2 }, r = a * Math.PI / 180;
      const cn = { n: -c.y * 0.85, e: c.x * 0.85 }; J.h = ft * 0.3048;
      J.ac.place({ n: cn.n + Math.cos(r) * 5000, e: cn.e + Math.sin(r) * 5000, h: 410 + J.h, V: 175, psi: r - Math.PI / 2 }); J.gs = null; g.jetOrbit(c); g.efbShow(false);
      for (const t of g.targets) if (t.alive) g.kill(t); }, [ft, a]);
    const ok = await until("g.JX.gs && g.JX.gs.home && g.JX.gs.st === 'taxiin'", 900);
    const r = await page.evaluate(() => { const g = window.__saqr, T = g.JX.P.touch, rw = g.MAP.airbase.runway; return { touch: T && Math.round(T.along), vs: T && +T.vs.toFixed(1), y: Math.round(g.plane.y), end: rw[2] }; });
    check(`home from ${ft} ft, ${a}° round the orbit: down in the touchdown zone, on the runway`, ok && r.touch > 100 && r.touch < 800 && r.vs > -2.5 && r.y < r.end, r);
  }
  // END SORTIE on the iPad: the card at once
  await start('j_cas'); await page.waitForTimeout(1500);
  await page.evaluate(() => { const g = window.__saqr, o = g.JX.ac.o; g.JX.ac.place({ n: o.n - 6000, e: o.e - 3000, h: 410 + 4500, V: 160, psi: 0 }); g.JX.gs = null; g.efbShow(false); for (const t of g.targets) if (t.alive) g.kill(t); });
  check('END SORTIE: the card at once', await until("g.JX.gs && g.JX.gs.home", 5) && await page.evaluate(() => { const g = window.__saqr; g.efbShow(true); g.efbDraw(); return true; }) && await page.evaluate(() => { const E = window.__saqr.EFB; const h = E.hits.find(h => h.fn && h.fn.name === 'jetHomeEnd'); if (h) h.fn(); return !!h; }) && await until("g.S.phase === 'end'", 2));
  // UNABLE: the jet stays, the sortie ends
  await start('j_strike'); await page.waitForTimeout(2500);
  await page.evaluate(() => { const g = window.__saqr; g.efbShow(true); });
  await page.waitForTimeout(800);
  const un = await page.evaluate(() => { const E = window.__saqr.EFB, h = E.hits.filter(h => h.h === 26 && h.y > 100).sort((a, b) => a.x - b.x)[0], k = E.box.w / E.W; return { x: E.box.x + (h.x + h.w / 2) * k, y: E.box.y + (h.y + h.h / 2) * k }; });
  await page.mouse.click(un.x, un.y); await page.waitForTimeout(300);
  await until("g.S.phase === 'end'", 10); await page.waitForTimeout(500);
  s = await st(); check('UNABLE: the sortie over, the jet on its stand', await page.evaluate(() => window.__saqr.S.phase === 'end') && s.agl < 4 && s.kt < 1, s);
  // the menu's other choice: in the air, on station
  check('the menu offers the start: base or air', await page.evaluate(() => !document.querySelector('#optJStart').hidden && document.querySelector('#segJ button[data-j="base"]').classList.contains('on')));
  await page.evaluate(() => document.querySelector('#segJ button[data-j="air"]').click());
  await start('j_cas'); await page.waitForTimeout(1500);
  s = await st(); check('AIR: on station, no ground phase', s.st === null && s.agl > 3000 && s.mode === 'orbit', s);
  check('AIR: the choice kept', await page.evaluate(() => localStorage.getItem('saqr.jstart') === 'air'));
  await page.evaluate(() => document.querySelector('#segJ button[data-j="base"]').click());
  console.log('errors', JSON.stringify(errs));
  check('no page errors', errs.length === 0, errs.length);
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close(); process.exit(fails.length ? 1 : 0);
})();
