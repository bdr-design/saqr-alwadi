// «Targeting», the first trailer's film again (tools/trailer/f15_shots.cjs: the same seat, the same pod and its
// symbology, the same calm afternoon, everything to the eye) on other targets: a smuggling dhow leaving the harbour,
// clear on the pod, and a missile launcher on the shore with a gathering round it, which the 2,000 lb bomb takes.
// One session, six shots on one clock:
//   t1-seat    the seat in the orbit's bank over the sea; Ops on the radio
//   t2-look    the head turned to the low wing, the coast and the sea below
//   t3-boat    the pod on the dhow under way, tracked, the field narrowing
//   t4-launch  the pod on the launcher and the men round it, tracked, the field narrowing
//   t5-impact  the bomb's arrival on the launcher, slowed
//   t6-after   the seat again, the smoke rising over the shore far below; the head coming back to the front
//   node tools/trailer/target_shots.cjs [preview]   ->  tests/out/trailer-target/<shot>/%05d.jpg and <shot>.wav
//   (preview: the pod on the boat and on the launcher, a frame each, to place them)
const fs = require('fs'), path = require('path');
const { open, start, shoot, chromium, ROOT } = require('./rig.cjs');
const { sound } = require('./f15_shots.cjs');
const OUT = process.env.TRAILER_OUT || path.join(ROOT, 'tests', 'out', 'trailer-target');

// the launcher on the shore south of the port, a gathering of ten round it
const before = m => {
  // the escort and the rocket boat left out (the dhow alone at sea, the fishing boats about it); the dhow off from the
  // harbour's mouth at once
  m.layout = m.layout.filter(it => it.k !== 'fac' && it.k !== 'rktboat');
  for (const it of m.layout) if (it.k === 'dhow') { it.path = it.path.slice(1); it.startAt = 0; delete it.escape; }
  m.layout.push({ t: 'veh', k: 'launcher', x: 575, y: 2335, h: 1.9, move: false },
    { t: 'pax', k: 'pax', x: 566, y: 2327, n: 5 }, { t: 'pax', k: 'pax', x: 586, y: 2345, n: 5 });
};
const PRE = `window.__EASE = (a, b, t0, t1, t) => { const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0))); return a + (b - a) * (k * k * (3 - 2 * k)); };
  window.__at = (t, s) => Math.abs(t - s) < 1e-6;
  window.__D = () => window.__saqr.vehicles.find(v => v.vk === 'dhow');
  window.__L = () => window.__saqr.targets.find(v => v.vk === 'launcher');
  // (the gathering stands still till the bomb: no alarm before it)
  window.__calm = g => { const L = window.__L(); for (const G of g.groups) if (Math.hypot(G.x - L.x, G.y - L.y) < 60) G.alert = 0; };
  // the pod, full screen, as the first trailer's: slewed near the target, the field wide
  window.__pod = (g, p, z) => { const S = g.S, CK = g.CK; g.ckLook(1.0, CK.IW * 0.5, CK.IH * 0.5, 14, true); CK.goal = 1; CK.t = 1; g.toSensor(); S.sensor = 'eo'; g.setSensor('eo'); S.blank = 0;
    S.sel = null; S.tracking = false; S.free = false; S.vel.x = S.vel.y = 0; S.aim.x = S.aimGoal.x = p.x; S.aim.y = S.aimGoal.y = p.y; S.zoom = S.zoomGoal = z; };`;
const SHOTS = [
  { name: 't1-seat', secs: 8, warm: 240, cue: (g, t) => {
    const CK = g.CK, at = window.__at; window.__calm(g);
    if (t === 0) { g.S.armed = false; g.ckLook(1.0, CK.IW * 0.5, CK.IH * 0.5, 14, true); }
    if (at(t, 1.5)) g.radio('OPS', '', 'ops', ['o.j.check']);
  } },
  { name: 't2-look', secs: 7, cue: (g, t) => {
    const CK = g.CK, at = window.__at; window.__calm(g);
    if (at(t, 0.4)) g.ckLook(1.45, CK.IW * 0.17, CK.IH * 0.42, 1.6);
  } },
  { name: 't3-boat', secs: 7, cue: (g, t) => {
    const S = g.S, E = window.__EASE, at = window.__at, d = window.__D(); window.__calm(g);
    if (t === 0) window.__pod(g, { x: d.x + 30, y: d.y - 20 }, 3);
    if (at(t, 1.2)) g.lockOn(d, true);
    if (t > 1.5) S.zoom = S.zoomGoal = E(3, 10, 1.5, 6.5, t);
  } },
  { name: 't4-launch', secs: 7, cue: (g, t) => {
    const S = g.S, E = window.__EASE, at = window.__at, L = window.__L(); window.__calm(g);
    if (t === 0) window.__pod(g, { x: L.x + 35, y: L.y + 25 }, 3);
    if (at(t, 1.2)) g.lockOn(L, true);
    if (t > 1.5) S.zoom = S.zoomGoal = E(3, 10, 1.5, 6.5, t);
  } },
  // the bomb's last seconds and its arrival, slowed: the fireball, the dust ring, the smoke climbing; the field
  // widening as the fire takes
  { name: 't5-impact', secs: 8, cue: (g, t) => {
    const S = g.S, E = window.__EASE, at = window.__at, L = window.__L();
    if (window.__hitT == null) window.__calm(g);
    if (t === 0) S.zoom = S.zoomGoal = 8;
    if (at(t, 0.8)) g.projectiles.push({ type: 'jdam', heavy: true, target: null, tgt: L, x: L.x, y: L.y, tti: 2.0, tof: 30, shot: { hit: false }, cep: 0 });
    if (window.__hitT == null && t > 1 && !g.projectiles.some(p => p.type === 'jdam')) window.__hitT = S.t;
    if (window.__hitT == null) return 1;
    S.zoom = S.zoomGoal = E(8, 5, window.__hitT, window.__hitT + 3, S.t);
    const since = S.t - window.__hitT;
    return since < 1.8 ? 0.35 : Math.min(1, 0.35 + (since - 1.8) * 0.6);
  } },
  { name: 't6-after', secs: 8, cue: (g, t) => {
    const CK = g.CK, at = window.__at;
    if (t === 0) { g.setSensor('eo'); g.S.blank = 0; g.setCockpit(true); CK.goal = 0; CK.t = 0; g.ckLook(1.4, CK.IW * 0.18, CK.IH * 0.44, 14, true); }
    if (at(t, 3.0)) g.ckLook(1.0, CK.IW * 0.5, CK.IH * 0.5, 1.2);
  } },
];

(async () => {
  const preview = process.argv[2] === 'preview';
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const { page } = await open(browser, 'theater', 'f15');
  // (the mission's own calls at its start left out: the check-in)
  await start(page, 'j_sea', g => { g.setNight(false); g.setTod('day'); g.setWx('clear'); g.timers.length = 0; }, before);
  await page.evaluate(PRE);
  if (preview) {
    const wet = await page.evaluate(() => { const g = window.__saqr, L = window.__L(); return { launcherWet: g.onWater(L.x, L.y), men: g.groups.filter(G => Math.hypot(G.x - L.x, G.y - L.y) < 60).map(G => G.men.length) }; });
    console.log(JSON.stringify(wet));
    // (each held a second on its target at the shot's last field)
    for (const k of ['D', 'L']) await shoot(page, path.join(OUT, 'preview-' + k), 1, new Function('g', 't', `const v = window.__${k}(); window.__calm(g);
      if (t === 0) { window.__pod(g, { x: v.x, y: v.y }, 10); g.lockOn(v, true); }`), 60);
    await browser.close(); return;
  }
  await page.waitForFunction(() => !!window.__saqr.Snd.ctx && !!(window.F15Snd && window.F15Snd.bufs && window.F15Snd.bufs.cabin), null, { timeout: 90000 }).catch(() => console.log('engine sound not ready'));
  let t0 = 0;
  for (const s of SHOTS) {
    const t = Date.now();
    await shoot(page, path.join(OUT, s.name), s.secs, s.cue, s.warm);
    await sound(page, s.name, t0, s.secs, OUT);
    t0 += s.secs;
    console.log(s.name, s.secs * 30, 'frames in', Math.round((Date.now() - t) / 1000), 's');
  }
  await browser.close();
})();
