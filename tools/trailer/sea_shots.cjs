// The «targeting» film's shots (tools/trailer/sea_make.cjs cuts them), from the F-15SA's back seat and its pod
// (tools/trailer/rig.cjs), in the manner of the first trailer: the seat, then the pod's picture alone (its symbology
// off, nothing over it):
//   day   (the maritime mission)  a1-seat     the seat in the orbit's bank over the sea
//                                 a2-dhow     the weapons dhow out of the harbour, its wake, the pod settling on it
//   night (the camp strike, with a gathering between its buildings; all on the pod's TV, as the first trailer: no thermal)
//                                 b1-seat     the seat in the dark, the pod's night TV of the camp on the left screen
//                                 b2-group    the gathering between the buildings, still, on the pod's night TV
//                                 b3-strike   the 2,000 lb bomb onto the launcher, slowed, on the night TV
//   node tools/trailer/sea_shots.cjs day|night     ->  tests/out/trailer-sea/<shot>/%05d.jpg and <shot>.wav
const fs = require('fs'), path = require('path');
const { open, start, shoot, chromium, ROOT } = require('./rig.cjs');
const { sound } = require('./f15_shots.cjs');
const OUT = process.env.TRAILER_OUT || path.join(ROOT, 'tests', 'out', 'trailer-sea');

const PRE = `window.__EASE = (a, b, t0, t1, t) => { const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0))); return a + (b - a) * (k * k * (3 - 2 * k)); };
  window.__at = (t, s) => Math.abs(t - s) < 1e-6;
  window.__pod = (g, s) => { const S = g.S, CK = g.CK; CK.goal = 1; CK.t = 1; g.toSensor(); g.setSensor(s); S.blank = 0; S.nucT = 999; };
  window.__look = (g, p, z) => { const S = g.S; S.sel = null; S.tracking = false; S.free = false; S.vel.x = S.vel.y = 0; S.aim.x = S.aimGoal.x = p.x; S.aim.y = S.aimGoal.y = p.y; if (z) S.zoom = S.zoomGoal = z; };`;
const SESSIONS = {
  // by day over the sea: the dhow and its escort set off from the harbour's mouth at once (their mission has them
  // leave the quay later)
  day: { mission: 'j_sea', before: m => { for (const it of m.layout) if (it.path && (it.k === 'dhow' || it.k === 'fac')) { it.path = it.path.slice(1); it.startAt = 0; } }, shots: [
    // the seat in the orbit's bank over the sea; Ops on the radio
    { name: 'a1-seat', secs: 7, warm: 150, cue: (g, t) => {
      const CK = g.CK, at = window.__at;
      if (t === 0) g.ckLook(1.0, CK.IW * 0.5, CK.IH * 0.5, 14, true);
      if (at(t, 1.2)) g.radio('OPS', '', 'ops', ['o.j.check']);
    } },
    // the pod on the dhow, the picture alone
    { name: 'a2-dhow', secs: 8, cue: (g, t) => {
      const S = g.S, E = window.__EASE, at = window.__at, d = window.__D || (window.__D = g.vehicles.find(v => v.vk === 'dhow'));
      if (t === 0) { window.__pod(g, 'eo'); window.__look(g, { x: d.x + 20, y: d.y - 12 }, 5); }
      if (at(t, 0.4)) g.lockOn(d, true);
      if (t > 0.4) S.zoom = S.zoomGoal = E(5, 12, 0.4, 7.6, t);
    } },
  ] },
  // the camp at night, a gathering of ten between the headquarters and the fuel tanks; every picture the pod's TV (the
  // owner: «كل شي بصري», as the first trailer; the night kept, on its starlight gain: grey, grainy)
  night: { mission: 'j_night', before: m => { m.layout.push({ t: 'pax', k: 'pax', x: 728, y: 2472, n: 10 }); }, setup: g => { g.timers.length = 0; }, shots: [
    // the seat in the dark, the panel lit; on the left screen the pod's night TV on the camp
    { name: 'b1-seat', secs: 7, warm: 150, cue: (g, t) => {
      const CK = g.CK, S = g.S, G = window.__G || (window.__G = g.groups.find(x => x.men.length === 10));
      if (t === 0) { g.setSensor('eo'); S.blank = 0; window.__look(g, { x: G.x, y: G.y }, 6); g.ckLook(1.12, CK.IW * 0.5, CK.IH * 0.56, 14, true); }
      if (window.__at(t, 2.0)) g.ckLook(1.0, CK.IW * 0.5, CK.IH * 0.5, 1.2);
    } },
    // the gathering between the buildings, still, on the pod's night TV
    { name: 'b2-group', secs: 6, cue: (g, t) => {
      const S = g.S, E = window.__EASE, G = window.__G;
      if (t === 0) { window.__pod(g, 'eo'); window.__look(g, { x: G.x, y: G.y }, 11); G.alert = 0; }
      S.zoom = S.zoomGoal = E(11, 12, 0, 6, t);
    } },
    // the 2,000 lb bomb onto the launcher, slowed, still on the night TV; the field widening as the fire takes
    { name: 'b3-strike', secs: 9, cue: (g, t) => {
      const S = g.S, E = window.__EASE, at = window.__at, L = window.__L || (window.__L = g.targets.find(v => v.vk === 'launcher'));
      if (t === 0) { g.lockOn(L, true); S.zoom = S.zoomGoal = 10; }
      if (window.__hitT != null) S.zoom = S.zoomGoal = E(10, 6, window.__hitT, window.__hitT + 4, S.t);
      if (at(t, 0.5)) g.projectiles.push({ type: 'jdam', heavy: true, target: null, tgt: L, x: L.x, y: L.y, tti: 2.2, tof: 30, shot: { hit: false }, cep: 0 });
      if (window.__hitT == null && t > 0.6 && !g.projectiles.some(p => p.type === 'jdam')) window.__hitT = S.t;
      if (window.__hitT == null) return 1;
      const since = S.t - window.__hitT;
      return since < 2.2 ? 0.3 : Math.min(1, 0.3 + (since - 2.2) * 0.5);
    } },
  ] },
};

(async () => {
  const which = process.argv[2], ses = SESSIONS[which];
  if (!ses) { console.log('sessions:', Object.keys(SESSIONS).join(' ')); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const { page } = await open(browser, 'theater', 'f15');
  // (the pod's picture alone: its symbology off)
  await page.addStyleTag({ content: '#hud{visibility:hidden!important}' });
  // (setup: the mission's own calls at its start left out of the film: the check-in)
  await start(page, ses.mission, ses.setup || null, ses.before);
  await page.evaluate(PRE);
  await page.waitForFunction(() => !!(window.F15Snd && window.F15Snd.bufs && window.F15Snd.bufs.cabin), null, { timeout: 90000 }).catch(() => console.log('engine sound not ready'));
  let t0 = 0;
  for (const s of ses.shots) {
    const t = Date.now();
    await shoot(page, path.join(OUT, s.name), s.secs, s.cue, s.warm);
    await sound(page, s.name, t0, s.secs, OUT);
    t0 += s.secs;
    console.log(s.name, s.secs * 30, 'frames in', Math.round((Date.now() - t) / 1000), 's');
  }
  await browser.close();
})();
