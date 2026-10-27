// The F-15SA trailer's shots, recorded from the game (tools/trailer/rig.cjs): the back seat over the theatre on a calm
// afternoon. One session, five shots on one clock: the seat in the orbit's bank; the head turned to the low wing, the
// coast and the port below; the pod on the big warehouse north of the port, tracking; the 2,000 lb bomb's arrival, in
// slow motion; the seat again, the smoke rising far below. Frames to tests/out/trailer-f15/<shot>/,
// each shot's sound (the game's, on the shot's clock, over the back seat's engines and air) to <shot>.wav.
//   node tools/trailer/f15_shots.cjs        then   node tools/trailer/f15_make.cjs
const fs = require('fs'), path = require('path');
const { open, start, shoot, chromium, ROOT } = require('./rig.cjs');
const OUT = process.env.TRAILER_OUT || path.join(ROOT, 'tests', 'out', 'trailer-f15');

// the shot's sound: the logged events replayed into an offline context on the shot's clock, over the jet's own bed
// (src/f15snd.js: the air on the canopy, the engines' core, the cabin, through the helmet), as the game mixes it at
// 300 knots and 15,000 ft
async function sound(page, name, t0, secs, out) {
  const pcm = await page.evaluate(async ([t0, secs]) => {
    const g = window.__saqr, Snd = g.Snd, F = window.F15Snd, sr = Snd.ctx.sampleRate, oc = new OfflineAudioContext(2, Math.ceil(sr * secs), sr);
    const keep = { ctx: Snd.ctx, dry: Snd.dry, wet: Snd.wet, on: Snd.on };
    const dry = oc.createGain(); dry.connect(oc.destination);
    const wet = oc.createGain(); wet.gain.value = 0.35; const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const conv = oc.createConvolver(); conv.buffer = Snd.ir; wet.connect(lp); lp.connect(conv); conv.connect(oc.destination);
    const helmet = oc.createBiquadFilter(); helmet.type = 'lowpass'; helmet.frequency.value = 2500; helmet.Q.value = 0.6; helmet.connect(dry);
    for (const [buf, gain, f, rate, off] of [[F.bufs.air, 0.3, 1400, 1, 0], [F.bufs.core, 0.28, 20000, 0.95, 2.7], [F.bufs.cabin, 0.05, 20000, 1, 5.1]]) {
      const s = oc.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
      const fl = oc.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = f; const gn = oc.createGain(); gn.gain.value = gain * 0.6;
      s.connect(fl); fl.connect(gn); gn.connect(helmet); s.start(0, off + Math.random() * 3);
    }
    let now = 0; Object.defineProperty(oc, 'currentTime', { configurable: true, get: () => now });
    const playFn = Snd.play, play0 = playFn.bind(Snd);
    Object.assign(Snd, { ctx: oc, dry, wet, on: true });
    for (const e of window.__ev.slice()) {
      const t = e.t - t0; if (t < 0 || t > secs - 0.05) continue;
      now = t;
      Snd.play = (e.s || 1) < 1 ? (buf, gain, delay, w, rate) => play0(buf, gain, delay, w, (rate || 1) * 0.55) : play0;
      if (e.k === 'transmit') window.__orig.transmit(e.c, e.net, e.bed); else window.__orig[e.k](...e.a);
    }
    Snd.play = playFn; Object.assign(Snd, keep); delete oc.currentTime;
    const b = await oc.startRendering(), L = b.getChannelData(0), R = b.getChannelData(1), out = new Array(L.length * 2);
    for (let i = 0; i < L.length; i++) { out[2 * i] = L[i]; out[2 * i + 1] = R[i]; }
    return { sr, out };
  }, [t0, secs]);
  const { sr, out: pcm2 } = pcm, n = pcm2.length / 2, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < pcm2.length; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(pcm2[i] * 32767 * 0.8))), 44 + i * 2);
  fs.writeFileSync(path.join(out || OUT, name + '.wav'), buf);
  const booms = await page.evaluate(([t0, secs]) => window.__ev.filter(e => e.k === 'boom' && e.t >= t0 && e.t < t0 + secs).map(e => +(e.t - t0).toFixed(2)), [t0, secs]);
  fs.writeFileSync(path.join(out || OUT, name + '.json'), JSON.stringify({ booms }));
}

const PRE = `window.__EASE = (a, b, t0, t1, t) => { const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0))); return a + (b - a) * (k * k * (3 - 2 * k)); };
  window.__at = (t, s) => Math.abs(t - s) < 1e-6;
  window.__W = () => window.__saqr.targets.find(t => t.bld === 45);`;
const SHOTS = [
  // the seat: the orbit's bank, the coast on the low wing; Ops on the radio
  { name: 'f1-seat', secs: 8, warm: 240, cue: (g, t) => {
    const CK = g.CK, at = window.__at;
    if (t === 0) { g.S.armed = false; g.ckLook(1.0, CK.IW * 0.5, CK.IH * 0.5, 14, true); }
    if (at(t, 1.5)) g.radio('OPS', '', 'ops', ['o.j.check']);
  } },
  // the head turns slowly to the low wing: the coast, the port far below
  { name: 'f2-look', secs: 7, cue: (g, t) => {
    const CK = g.CK, at = window.__at;
    if (at(t, 0.4)) g.ckLook(1.45, CK.IW * 0.17, CK.IH * 0.42, 1.6);
  } },
  // the pod, full screen, on the warehouse: slewed there, tracked, the field narrowing
  { name: 'f3-pod', secs: 7, cue: (g, t) => {
    const S = g.S, CK = g.CK, E = window.__EASE, at = window.__at, W = window.__W();
    if (t === 0) { g.ckLook(1.0, CK.IW * 0.5, CK.IH * 0.5, 14, true); CK.goal = 1; CK.t = 1; g.toSensor(); S.sensor = 'eo'; g.setSensor('eo'); S.blank = 0;
      S.sel = null; S.tracking = false; S.free = false; S.vel.x = S.vel.y = 0; S.aim.x = S.aimGoal.x = W.x + 40; S.aim.y = S.aimGoal.y = W.y + 30; S.zoom = S.zoomGoal = 2; }
    if (at(t, 1.2)) g.lockOn(W, true);
    if (t > 1.5) S.zoom = S.zoomGoal = E(2, 5, 1.5, 6.5, t);
  } },
  // the bomb's last seconds and its arrival, slowed: the fireball, the dust ring, the smoke climbing
  { name: 'f4-impact', secs: 8, cue: (g, t) => {
    const S = g.S, at = window.__at, W = window.__W();
    if (t === 0) S.zoom = S.zoomGoal = 5;
    if (at(t, 0.8)) g.projectiles.push({ type: 'jdam', heavy: true, target: null, tgt: W, x: W.x, y: W.y, tti: 2.0, tof: 30, shot: { hit: false }, cep: 0 });
    if (window.__hitT == null && g.projectiles.length === 0 && t > 1) window.__hitT = S.t;
    if (window.__hitT == null) return 1;
    const since = S.t - window.__hitT;
    return since < 1.8 ? 0.35 : Math.min(1, 0.35 + (since - 1.8) * 0.6);
  } },
  // the seat again, the smoke rising over the port far below; the head comes back to the front
  { name: 'f5-after', secs: 8, cue: (g, t) => {
    const CK = g.CK, at = window.__at;
    if (t === 0) { g.setSensor('eo'); g.S.blank = 0; g.setCockpit(true); CK.goal = 0; CK.t = 0; g.ckLook(1.4, CK.IW * 0.18, CK.IH * 0.44, 14, true); }
    if (at(t, 3.0)) g.ckLook(1.0, CK.IW * 0.5, CK.IH * 0.5, 1.2);
  } },
];

// (its sound recorder is shared with tools/trailer/sea_shots.cjs)
module.exports = { sound };
if (require.main === module) (async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const { page } = await open(browser, 'theater', 'f15');
  await start(page, 'j_strike', g => { g.setNight(false); });
  await page.evaluate(PRE);
  await page.waitForFunction(() => !!window.__saqr.Snd.ctx && !!(window.F15Snd && window.F15Snd.bufs && window.F15Snd.bufs.cabin), null, { timeout: 90000 }).catch(() => console.log('engine sound not ready'));
  let t0 = 0;
  for (const s of SHOTS) {
    const t = Date.now();
    await shoot(page, path.join(OUT, s.name), s.secs, s.cue, s.warm);
    await sound(page, s.name, t0, s.secs);
    t0 += s.secs;
    console.log(s.name, s.secs * 30, 'frames in', Math.round((Date.now() - t) / 1000), 's');
  }
  await browser.close();
})();
