// The trailer's shots, recorded from the game itself (tools/trailer/rig.cjs). Each session is one page: a map, a
// mission, then one or more shots, each a list of cues on its own clock. Frames go to tests/out/trailer/<shot>/, and
// the shot's sound (everything the game played, put on the shot's clock, with the rotor under it) to <shot>.wav.
//   node tools/trailer/shots.cjs <session>      sessions: seat (shots 1, 2), flare (3), strike (4, 5, 6)
const fs = require('fs'), path = require('path');
const { open, start, shoot, chromium, ROOT } = require('./rig.cjs');
const OUT = process.env.TRAILER_OUT || path.join(ROOT, 'tests', 'out', 'trailer');   // (TRAILER_OUT: a quick look elsewhere)

// the shot's sound: the logged events replayed into an offline context on the shot's clock
async function sound(page, name, t0, secs) {
  const pcm = await page.evaluate(async ([t0, secs]) => {
    // (at the game's own rate: its reverb's impulse response is a buffer at that rate)
    const g = window.__saqr, Snd = g.Snd, sr = Snd.ctx.sampleRate, oc = new OfflineAudioContext(2, Math.ceil(sr * secs), sr);
    const keep = { ctx: Snd.ctx, dry: Snd.dry, wet: Snd.wet, on: Snd.on };
    const dry = oc.createGain(); dry.connect(oc.destination);
    const wet = oc.createGain(); wet.gain.value = 0.35; const lp = oc.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    const conv = oc.createConvolver(); conv.buffer = Snd.ir; wet.connect(lp); lp.connect(conv); conv.connect(oc.destination);
    // the rotor as heard in the seat, all through
    const rb = oc.createBufferSource(); rb.buffer = Snd.rotorBuf; rb.loop = true; rb.loopStart = 0; const rg = oc.createGain(); rg.gain.value = 0.4; rb.connect(rg); rg.connect(dry); rb.start(0, Math.random() * 7);
    let now = 0; Object.defineProperty(oc, 'currentTime', { configurable: true, get: () => now });
    const playFn = Snd.play, play0 = playFn.bind(Snd);
    Object.assign(Snd, { ctx: oc, dry, wet, on: true });
    for (const e of window.__ev.slice()) {
      const t = e.t - t0; if (t < 0 || t > secs - 0.05) continue;
      now = t;
      // (an explosion in slow motion is heard slowed: deeper and longer)
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
  fs.writeFileSync(path.join(OUT, name + '.wav'), buf);
  const booms = await page.evaluate(([t0, secs]) => window.__ev.filter(e => e.k === 'boom' && e.a[0] >= 0.5 && e.t >= t0 && e.t < t0 + secs).map(e => +(e.t - t0).toFixed(2)), [t0, secs]);
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify({ booms }));
}
// The cockpit cut (16:9): everything from the gunner's seat at night. The valley at 02:00, the systems brought up by
// hand (master arm, the rockets, the laser range finder), an illumination rocket over the tree line south of the road,
// the missile launcher hidden in the trees found and lased on the TEDAC, the Hellfire away (seen leaving through the
// canopy), its arrival in slow motion on the TEDAC, then back out into the seat.
// The launcher and its crew are moved into the grove east of the road (the mission's own layout puts them in the open).
const GROVE = { x: 915, y: 645 };
const BEFORE = m => { for (const it of m.layout) { if (it.k === 'launcher') { it.x = 915; it.y = 645; it.h = 1.0; } if (it.t === 'pax' && it.x === 905) { it.x = 932; it.y = 628; } } };
// in the page: the eased move, a key pressed by hand (its pressed look held a few frames: the game's lasts 0.13 s of
// real time, less than a recorded frame), the TADS straight onto a point, and the TEDAC's leaned-in views
const PRE = `window.__EASE = (a, b, t0, t1, t) => { const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0))); return a + (b - a) * (k * k * (3 - 2 * k)); };
  window.__at = (t, s) => Math.abs(t - s) < 1e-6;
  window.__press = (g, x, y) => { g.ckPressAt(x, y); window.__pn = 6; window.__px = [x, y]; };
  window.__aimAt = (g, p, z) => { const S = g.S; S.sel = null; S.tracking = false; S.free = false; S.vel.x = S.vel.y = 0; S.aim.x = S.aimGoal.x = p.x; S.aim.y = S.aimGoal.y = p.y; if (z) S.zoom = S.zoomGoal = z; };
  window.__arm = () => window.__saqr.CTRLS.find(c => c[0] === 181 && c[1] === 862);`;
const SESSIONS = {
  // 1: the seat in the dark, HUNTER on the radio about a launcher in the trees; 2: the systems brought up by hand
  seat: { map: 'valley', mission: 'night', before: BEFORE, shots: [
    { name: 'k1-seat', secs: 7, warm: 30, cue: (g, t) => {
      const CK = g.CK, at = window.__at;
      if (t === 0) { g.S.armed = false; g.ckLook(1.0, CK.IW * 0.38, CK.IH * 0.42, 14, true); }
      if (at(t, 0.6)) g.ckLook(1.1, CK.IW * 0.5, CK.IH * 0.47, 3.2);
      if (at(t, 1.2)) g.radio('HUNTER', '', 'hunter', ['h.call', 'h.t.TEL', 'h.d.600', 'h.dir.SOUTHEAST', 'h.mark']);
    } },
    { name: 'k2-arm', secs: 9, cue: (g, t) => {
      const CK = g.CK, S = g.S, at = window.__at, K = g.TKEYS;
      // the left console: the red-guarded master arm switch
      if (t === 0) { window.__aimAt(g, { x: 915, y: 645 }, 2); g.ckLook(2.5, 196, 850, 14, true); }
      if (at(t, 0.9)) { const c = window.__arm(); window.__press(g, c[0], c[1]); g.CK.msg = { s: c[3]()[0], t: 1.8 }; }
      // up to the TEDAC's top row: the rockets, the illumination warhead; then the laser range finder
      if (at(t, 2.2)) g.ckLook(2.6, 790, 520, 4.5);
      if (at(t, 3.6)) { window.__press(g, ...K.T[1]); g.tedacPress('T', 1); S.rkType = 'il'; S.qty = 1; g.CK.msg = { s: 'RKT  M257 ILLUM', t: 1.6 }; }
      if (at(t, 5.2)) { window.__press(g, ...K.L[4]); g.tedacPress('L', 4); }
      // and sit back a little: the TEDAC with its grips
      if (at(t, 6.4)) g.ckLook(2.1, 840, 600, 4);
    } },
  ] },
  // 3: on the TEDAC, the trigger; the illumination rocket goes, the flare lights over the trees
  flare: { map: 'valley', mission: 'night', before: BEFORE, setup: g => { g.S.armed = true; g.S.weapon = 'rkt'; g.S.rkType = 'il'; g.S.qty = 1; }, shots: [
    { name: 'k3-flare', secs: 9, warm: 60, cue: (g, t) => {
      const S = g.S, E = window.__EASE, at = window.__at;
      if (t === 0) { window.__aimAt(g, { x: 915, y: 645 }, 1.6); g.ckLook(2.0, 840, 590, 14, true); }
      if (at(t, 0.7)) { const [x0, y0, x1] = g.GRIPS.R; window.__press(g, (x0 + x1) / 2, y0 + 18); g.fire(); }
      g.ckLook(E(2.0, 2.45, 2, 9, t), 840, E(590, 575, 2, 9, t), 3, true);
      S.zoomGoal = S.zoom = E(1.6, 2.2, 3, 9, t);
    } },
  ] },
  // 4: in on the launcher in the trees, locked, the Hellfire selected and lased; 5: the trigger, the missile leaving
  // through the canopy, back onto the TEDAC for its arrival in slow motion; 6: out into the seat over the burning site
  strike: { map: 'valley', mission: 'night', before: BEFORE, setup: g => {
      const S = g.S; S.armed = true; S.weapon = 'rkt'; S.rkType = 'il'; S.qty = 1; S.aim.x = S.aimGoal.x = 915; S.aim.y = S.aimGoal.y = 645; S.free = false; g.fire();
    }, shots: [
    { name: 'k4-lock', secs: 8, warm: 210, cue: (g, t) => {
      const S = g.S, at = window.__at, K = g.TKEYS, L = window.__L || (window.__L = g.targets.find(u => u.vk === 'launcher'));
      if (t === 0) { window.__aimAt(g, L, 2); g.ckLook(2.6, 840, 565, 14, true); L.hp = Math.min(L.hp, 200); }
      if (at(t, 0.6)) { window.__press(g, ...K.R[2]); g.lockOn(L, true); }
      if (at(t, 1.8)) { window.__press(g, ...K.L[1]); g.tedacPress('L', 1); }
      if (at(t, 3.2)) { window.__press(g, ...K.T[2]); g.tedacPress('T', 2); S.hfType = 'sal'; g.CK.msg = { s: 'MSL  SAL  CODE B 1588', t: 2 }; }
      if (at(t, 5.0)) { window.__press(g, ...K.L[4]); g.tedacPress('L', 4); }
      if (at(t, 6.2)) { window.__press(g, ...K.B[5]); S.zoomGoal = 6; }
    } },
    { name: 'k5-strike', secs: 12, cue: (g, t) => {
      const S = g.S, at = window.__at, m = g.projectiles.find(p => p.type === 'msl');
      if (t === 0) { const [x0, y0, x1] = g.GRIPS.R; window.__press(g, (x0 + x1) / 2, y0 + 18); if (g.fireStatePub().ok) g.fire(); else console.log('not ok:', g.fireStatePub().en); }
      // the seat as it goes: the launch through the glass; then back in to watch it arrive
      if (at(t, 0.15)) g.ckLook(1.05, 836, 440, 9);
      if (at(t, 2.4)) g.ckLook(2.75, 840, 560, 6);
      if (m && m.tti > 0.45) return 1;
      if (window.__hitT == null) window.__hitT = S.t;
      const since = S.t - window.__hitT;
      return since < 1.6 ? 0.33 : Math.min(1, 0.33 + (since - 1.6) * 0.9);
    } },
    { name: 'k6-after', secs: 7, cue: (g, t) => {
      const S = g.S, E = window.__EASE, at = window.__at;
      if (t === 0) { S.sel = null; S.tracking = false; S.free = false; }
      S.zoom = S.zoomGoal = E(6, 2.5, 0, 6, t);
      if (at(t, 1.2)) g.ckLook(1.0, g.CK.IW * 0.5, g.CK.IH * 0.46, 2.2);
    } },
  ] },
};

(async () => {
  const which = process.argv[2], ses = SESSIONS[which];
  if (!ses) { console.log('sessions:', Object.keys(SESSIONS).join(' ')); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const { page } = await open(browser, ses.map);
  await start(page, ses.mission, ses.setup, ses.before);
  await page.evaluate(PRE);
  await page.waitForFunction(() => !!window.__saqr.bank.d, null, { timeout: 60000 }).catch(() => console.log('radio voices not loaded'));
  let t0 = 0;
  for (const s of ses.shots) {
    const t = Date.now();
    await shoot(page, path.join(OUT, s.name), s.secs, s.cue, s.warm);
    await sound(page, s.name, t0, s.secs);
    t0 += s.secs;
    console.log(s.name, s.secs * 30, 'frames in', Math.round((Date.now() - t) / 1000), 's');
  }
  await browser.close();
})();
