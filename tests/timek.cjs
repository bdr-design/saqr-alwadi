// The ZF-25's time compression: the SMS page's TIME key, x2 to begin with, cycles x4, x1, x2; with x4 set, a 2,000 lb bomb's fall runs
// four times as fast (the world, frame by frame), the key boxed while it does, back to its own pace for the last
// seconds of the fall and after; the bomb still arrives on its target. Without a bomb falling the time is its own.
// The frames are run by hand at 30 a second (tools/trailer/rig.cjs), so the pace is exact.
process.env.TRAILER_DSF = '1';
const { open, start, chromium } = require('../tools/trailer/rig.cjs');
(async () => {
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + JSON.stringify(v) : '')); if (!ok) fails.push(w); };
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const { page } = await open(browser, 'theater', 'f15');
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await start(page, 'j_strike');
  await page.evaluate(() => { window.__manual(); window.__T = performance.now(); });
  // n frames at 30 a second: how far the world's clock went, and whether the key showed boxed
  const run = n => page.evaluate(n => { const g = window.__saqr, t0 = g.S.t; let boxed = 0;
    for (let i = 0; i < n; i++) { window.__T += 1000 / 30; window.__step(window.__T); if (g.pageKeys('SMS').on.TIME) boxed++; }
    return { dt: +(g.S.t - t0).toFixed(2), boxed, falling: g.projectiles.filter(p => p.type === 'jdam').length }; }, n);
  const keys = await page.evaluate(() => { const g = window.__saqr, i = g.pageKeys('SMS').L.indexOf('TIME'), out = [];
    g.CK.page.L = 'SMS'; for (let k = 0; k < 3; k++) { g.mpdPress('L', 'L', i); out.push(g.pageKeys('SMS').val.TIME); } return out; });
  check('TIME on the SMS page: x2 to begin with, cycles x4, x1, x2', keys.join() === 'x4,x1,x2', keys);
  await page.evaluate(() => { const g = window.__saqr, i = g.pageKeys('SMS').L.indexOf('TIME'); g.mpdPress('L', 'L', i); });
  const idle = await run(30);
  check('no bomb falling: the time its own pace', Math.abs(idle.dt - 1) < 0.05 && idle.boxed === 0, idle);
  await page.waitForFunction(() => window.__saqr.OBSR.s === 2 || window.__saqr.OBSR.s < 0 || !window.__saqr.OBS_MIME, null, { timeout: 60000 }).catch(() => {});
  // a 2,000 lb GPS on the first target, from the orbit
  const rel = await page.evaluate(() => { const g = window.__saqr, t = g.targets[0]; g.S.ammo.jdam = Math.max(1, g.S.ammo.jdam || 0); g.jetRelease('jdam', t); const p = g.projectiles.find(p => p.type === 'jdam'); return { tti: +p.tti.toFixed(1), id: t.id }; });
  console.log('released', JSON.stringify(rel));
  // (the observer's film, where the browser records: the bomb's first 4.5 s at the world's own pace, for the camera;
  // then fast)
  const film = await page.evaluate(() => !!(window.__saqr.OBSR.rec && window.__saqr.OBSR.rec.film));
  check('the observer\'s film taking the strike (its jet loaded, a format to record in)', film || !(await page.evaluate(() => window.__saqr.OBS_MIME)), film);
  if (film) { const first = await run(30); check('the film taking the release: its first second at its own pace', Math.abs(first.dt - 1) < 0.05, first); await run(120); }
  const fast = await run(30);
  check('the fall at x4: four seconds of it in one, the key boxed', Math.abs(fast.dt - 4) < 0.1 && fast.boxed === 30, fast);
  let k = 0, tail = null;
  while (k++ < 60) { const r = await run(5); if (!r.boxed) { tail = await run(30); break; } }
  check('the last seconds of the fall at its own pace', tail && Math.abs(tail.dt - 1) < 0.05 && tail.boxed === 0, tail);
  for (let i = 0; i < 20 && await page.evaluate(() => window.__saqr.projectiles.some(p => p.type === 'jdam')); i++) await run(60);
  const hit = await page.evaluate(id => { const g = window.__saqr, t = g.targets.find(t => t.id === id); return { alive: t.alive, falling: g.projectiles.filter(p => p.type === 'jdam').length }; }, rel.id);
  check('the bomb arrived on its target', !hit.falling && !hit.alive, hit);
  check('no page errors', !errs.length, errs);
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
