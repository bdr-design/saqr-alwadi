// Flight and ground physics, as measured against the real thing. The aircraft: from the pad it climbs no faster than
// a hover allows (about 3 m/s) until it has airspeed, and sets off with the nose the way it goes, not sideways; coming
// home it never sinks fast without airspeed (vortex ring state): a descending orbit, a 10° final, a slow set-down;
// the nose turns with a bounded yaw acceleration. The Hellfire goes where the laser is at impact: kept on the target it
// hits it, moved early it follows the spot, moved at the last instant it cannot. Ground: two vehicles meeting on the
// track keep right and pass; a convoy laid out past the road's end drives in one by one; a convoy keeps its speed to
// the road's end.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const fails = [], check = (w, ok) => { if (!ok) fails.push(w); }, errs = [];
  const open = async mapId => {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 } });
    await ctx.addInitScript(m => { try { localStorage.setItem('saqr.map', m); } catch (_) {} }, mapId);
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
      if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
        const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
      return r.abort(); });
    await page.goto('http://test/#debug');
    await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 180000 });
    return { ctx, page };
  };
  const start = (page, id) => page.evaluate(id => {
    const g = window.__saqr, S = g.S; S.phase = 'brief'; document.querySelector('#ovEnd').hidden = true; document.querySelector('#ovStart').hidden = false;
    const i = g.MISSIONS.findIndex(m => m.id === id); document.querySelector(`#mList button:nth-child(${i + 1})`).click(); document.querySelector('#btnStart').click();
    g.AC.hp = 1e9; for (const f of g.friends) f.hp = 1e9;
  }, id);

  // ---- the theatre: off the pad and back onto it
  if (!process.env.SKIP_TH) { const { ctx, page } = await open("theater");
    await start(page, 'th_tic');
    const r = await page.evaluate(() => {
      const g = window.__saqr, S = g.S, P = g.plane, dt = 0.1, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
      S.frozen = true;
      const va = () => Math.hypot(P.vx - g.WIND_MS.x, P.vy - g.WIND_MS.y), agl = () => P.altB - 410;
      let climbSlow = 0, slip = 0, sinkSlow = 0, t = 0, yawAcc = 0, yr = 0;
      g.setFlight('h1');
      for (; t < 60; t += dt) { g.stepSim(dt); if (va() < 8 && agl() > 12) climbSlow = Math.max(climbSlow, P.vsB);
        if (va() > 15) slip = Math.max(slip, Math.abs(wrap(P.nose - Math.atan2(P.vy - g.WIND_MS.y, P.vx - g.WIND_MS.x))) * 57.3);
        yawAcc = Math.max(yawAcc, Math.abs((P.yawR || 0) - yr) / dt); yr = P.yawR || 0; }
      for (; t < 200; t += dt) g.stepSim(dt);
      g.setFlight('base');
      const t0 = t; let orbit = false, touch = null;
      for (; t < t0 + 500 && P.mode !== 'pad'; t += dt) { g.stepSim(dt); if (P.appr === 'orbit') orbit = true; if (va() < 8 && agl() > 5) sinkSlow = Math.min(sinkSlow, P.vsB); }
      if (P.mode === 'pad') touch = Math.round(t - t0);
      S.frozen = false;
      return { climbSlow: +climbSlow.toFixed(1), slip: Math.round(slip), yawAcc: +yawAcc.toFixed(2), orbit, sinkSlow: +sinkSlow.toFixed(1), touch, mode: P.mode };
    });
    console.log('theatre', JSON.stringify(r));
    check('slow climb off the pad', r.climbSlow <= 3.6);
    check('sets off nose first', r.slip <= 75);
    check('yaw acceleration bounded', r.yawAcc <= 0.36);
    check('home: descending orbit, no fast sink without airspeed, on the pad', r.orbit && r.sinkSlow >= -2 && r.touch != null && r.mode === 'pad');
    await ctx.close(); }

  // ---- the valley: the Hellfire and the laser; traffic both ways; a convoy to the road's end
  { const { ctx, page } = await open('valley');
    await start(page, 'compound');
    const shoot = (move, at) => page.evaluate(async ([move, at]) => {
      const g = window.__saqr, S = g.S, wait = ms => new Promise(r => setTimeout(r, ms));
      const tg = g.targets.filter(t => t.kind === 'vehicle' && t.alive && t.mode === 'parked')[0];
      tg.hp = 1e9; S.armed = true; S.weapon = 'msl'; S.ammo.msl = 8; S.cool.msl = 0;
      g.lockOn(tg, true); S.zoom = S.zoomGoal = 5;
      for (let i = 0; i < 100 && S.quality < 3; i++) await wait(100);
      const q = S.quality, fs = g.fireStatePub(); g.fire();
      const m = g.projectiles.find(p => p.type === 'msl');
      if (!m) return { q, fs }; let last = { x: m.x, y: m.y }, moved = null;
      const spot = { x: tg.x + 160 / g.MPP, y: tg.y };
      while (g.projectiles.includes(m)) {
        if (move && !moved && m.tti < at) { moved = +m.tti.toFixed(1); S.sel = null; S.tracking = false; S.free = false; S.aimGoal.x = S.aim.x = spot.x; S.aimGoal.y = S.aim.y = spot.y; S.vel.x = S.vel.y = 0; }
        last = { x: m.x, y: m.y }; await wait(30);
      }
      return { q, moved, toTarget: Math.round(Math.hypot(last.x - tg.x, last.y - tg.y) * g.MPP), toSpot: Math.round(Math.hypot(last.x - spot.x, last.y - spot.y) * g.MPP) };
    }, [move, at]);
    const kept = await shoot(false), early = await shoot(true, 1e9), late = await shoot(true, 0.4);
    console.log('hellfire', JSON.stringify({ kept, early, late }));
    check('laser kept on: hits the target', kept.q >= 2 && kept.toTarget <= 2);
    check('laser moved early: follows the spot', early.toSpot <= 2);
    check('laser moved at the last instant: cannot reach the spot', late.toSpot > 100);

    await start(page, 'tic');
    const tw = await page.evaluate(() => {
      const g = window.__saqr, S = g.S, dt = 0.1; S.frozen = true;
      const a = g.makeVehicle({ kind: 'hilux', mode: 'convoy', s: 300, dir: 1, v: 9 }), b = g.makeVehicle({ kind: 'cargo', mode: 'convoy', s: 470, dir: -1, v: 9 });
      let minD = 1e9, still = 0, side = 0;
      for (let t = 0; t < 40; t += dt) { g.stepSim(dt); const d = Math.hypot(a.x - b.x, a.y - b.y) * g.MPP; minD = Math.min(minD, d); if (a.v < 0.3 || b.v < 0.3) still += dt; side = Math.max(side, a.mLat || 0); }
      const passed = a.s > b.s; S.frozen = false;
      return { passed, minD: +minD.toFixed(1), still: +still.toFixed(1), side: +side.toFixed(1) };
    });
    console.log('two ways', JSON.stringify(tw));
    check('meeting vehicles keep right and pass', tw.passed && tw.minD > 3 && tw.still < 1 && tw.side > 2);

    await start(page, 'convoy');
    const end = await page.evaluate(() => {
      const g = window.__saqr, S = g.S, dt = 0.1; S.frozen = true;
      const lead = g.vehicles.find(v => v.mode === 'convoy' && v.dir > 0); let vEnd = 0;
      for (let t = 0; t < 400 && !lead.escaped; t += dt) { g.stepSim(dt); if (!lead.escaped) vEnd = lead.v; }
      S.frozen = false; return { escaped: lead.escaped, vEnd: +vEnd.toFixed(1), cruise: lead.vCruise };
    });
    console.log('road end', JSON.stringify(end));
    check('a convoy keeps its speed to the road\'s end', end.escaped && end.vEnd > end.cruise * 0.8);
    await ctx.close(); }

  // ---- the port: a convoy laid out past the road's end drives in one by one
  { const { ctx, page } = await open('port');
    await start(page, 'camp');
    const r = await page.evaluate(() => {
      const g = window.__saqr, S = g.S, dt = 0.1; S.frozen = true;
      const vs = g.vehicles.filter(v => v.convoy), dorm0 = vs.filter(v => v.dormant).length;
      let minD = 1e9;
      for (let t = 0; t < 60; t += dt) { g.stepSim(dt);
        for (let i = 0; i < vs.length; i++) for (let j = i + 1; j < vs.length; j++) { const A = vs[i], B = vs[j]; if (A.dormant || B.dormant || A.escaped || B.escaped) continue; minD = Math.min(minD, Math.hypot(A.x - B.x, A.y - B.y) * g.MPP); } }
      S.frozen = false; return { n: vs.length, dorm0, entered: vs.filter(v => !v.dormant).length, minD: +minD.toFixed(1) };
    });
    console.log('entry', JSON.stringify(r));
    check('a long convoy drives in one by one', r.dorm0 > 0 && r.entered === r.n && r.minD > 6);
    await ctx.close(); }

  check('no page errors', !errs.length);
  if (errs.length) console.log(errs.slice(0, 5).join('\n'));
  await browser.close();
  console.log(fails.length ? 'FAIL: ' + fails.join('; ') : 'ALL OK');
  process.exit(fails.length ? 1 : 0);
})();
