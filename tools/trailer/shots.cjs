// The trailer's shots, recorded from the game itself (tools/trailer/rig.cjs). Each session is one page: a map, a
// mission, then one or more shots, each a list of cues on its own clock. Frames go to tests/out/trailer/<shot>/, and
// the shot's sound (everything the game played, put on the shot's clock, with the rotor under it) to <shot>.wav.
//   node tools/trailer/shots.cjs <session>      sessions: seat (shot 1), hellfire (2), night (3), impact (4), port (5)
const fs = require('fs'), path = require('path');
const { open, start, shoot, chromium, ROOT } = require('./rig.cjs');
const OUT = path.join(ROOT, 'tests', 'out', 'trailer');

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
    Object.assign(Snd, { ctx: oc, dry, wet, on: true });
    for (const e of window.__ev.slice()) {
      const t = e.t - t0; if (t < 0 || t > secs - 0.05) continue;
      now = t;
      if (e.k === 'transmit') window.__orig.transmit(e.c, e.net, e.bed); else window.__orig[e.k](...e.a);
    }
    Object.assign(Snd, keep); delete oc.currentTime;
    const b = await oc.startRendering(), L = b.getChannelData(0), R = b.getChannelData(1), out = new Array(L.length * 2);
    for (let i = 0; i < L.length; i++) { out[2 * i] = L[i]; out[2 * i + 1] = R[i]; }
    return { sr, out };
  }, [t0, secs]);
  const { sr, out: pcm2 } = pcm, n = pcm2.length / 2, buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < pcm2.length; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(pcm2[i] * 32767 * 0.8))), 44 + i * 2);
  fs.writeFileSync(path.join(OUT, name + '.wav'), buf);
}
const SESSIONS = {
  // 1: the seat, the convoy below; 2: into the TEDAC, lock the lead vehicle, a Hellfire, its impact
  seat: { map: 'valley', mission: 'convoy', shots: [
    { name: '1-seat', secs: 7, warm: 20, cue: (g, t) => {
      const CK = g.CK;
      if (t === 0) { g.ckLook(1.05, CK.IW * 0.36, CK.IH * 0.40, 14, true); }
      if (Math.abs(t - 1.0) < 1e-6) g.ckLook(1.12, CK.IW * 0.5, CK.IH * 0.5, 6);
      if (Math.abs(t - 1.5) < 1e-6) g.radio('HUNTER: TROOPS IN CONTACT', '', 'hunter', ['h.tic']);
    } },
  ] },
  hellfire: { map: 'valley', mission: 'convoy', shots: [
    { name: '2-hellfire', secs: 13, warm: 20, cue: (g, t) => {
      const S = g.S, v = window.__tgt || (window.__tgt = g.vehicles.find(v => v.convoy && v.alive));
      if (t === 0) { g.setCockpit(false); g.lockOn(v, true); S.weapon = 'msl'; S.hfType = 'sal'; S.armed = true; S.zoomGoal = 2; }
      if (Math.abs(t - 0.4) < 1e-6) g.radio('HUNTER', '', 'hunter', ['h.call', 'h.t.TECH', 'h.d.400', 'h.dir.NORTH', 'h.mark']);
      if (Math.abs(t - 2.0) < 1e-6) S.zoomGoal = 5;
      if (t >= 5 && !window.__fired && g.fireStatePub().ok) { window.__fired = true; g.fire(); }
    } },
  ] },
  // 3: night, the thermal camera on the supply convoy: rockets, then the gun
  night: { map: 'valley', mission: 'night', shots: [
    { name: '3-thermal', secs: 8, warm: 30, cue: (g, t) => {
      const S = g.S, live = g.vehicles.filter(v => v.convoy && v.alive && !v.dormant), v = window.__tgt || (window.__tgt = live[1] || live[0]);
      // (straight onto it: the camera's own glide would take two seconds of the shot)
      if (t === 0) { g.toSensor(); g.setSensor('wh'); g.lockOn(v, true); S.aim.x = S.aimGoal.x = v.x; S.aim.y = S.aimGoal.y = v.y; S.vel.x = S.vel.y = 0; S.zoom = S.zoomGoal = 4; S.armed = true; S.weapon = 'rkt'; S.rkType = 'he'; S.qty = 4; }
      if (t >= 1.2 && !window.__r1 && g.fireStatePub().ok) { window.__r1 = true; g.fire(); }
      if (t >= 3.0 && !window.__g1) { window.__g1 = true; S.weapon = 'gun'; S.burst = 20; S.cool.gun = 0; g.fire(); }
    } },
  ] },
  // 4: from the hover, the nose on the compound: a Hellfire fired from the seat, its blast seen through the canopy
  impact: { map: 'valley', mission: 'compound', shots: [
    { name: '4-impact', secs: 11, warm: 30, cue: (g, t) => {
      const S = g.S, CK = g.CK, v = window.__tgt || (window.__tgt = g.targets.find(u => u.kind === 'vehicle' && u.alive) || g.targets.find(u => u.alive));
      // (the sensor straight onto it, so the track is good and the missile away in the first second and a half)
      if (t === 0) { g.lockOn(v, true); S.aim.x = S.aimGoal.x = v.x; S.aim.y = S.aimGoal.y = v.y; S.vel.x = S.vel.y = 0; S.zoom = S.zoomGoal = 5; S.weapon = 'msl'; S.hfType = 'sal'; S.armed = true; g.ckLook(1.0, CK.IW * 0.5, CK.IH * 0.36, 14, true); }
      if (t >= 0.4 && !window.__fired && g.fireStatePub().ok) { window.__fired = true; g.fire(); }
    } },
  ] },
  // 5: the port: the camera sweeps over the harbour, the ships and the camp
  port: { map: 'port', mission: 'port', shots: [
    { name: '5-port', secs: 6, warm: 30, cue: (g, t) => {
      const S = g.S;
      if (t === 0) { g.toSensor(); g.setSensor('eo'); S.sel = null; S.tracking = false; S.free = false; S.zoom = S.zoomGoal = 1.6; S.aim.x = S.aimGoal.x = g.W0 * 0.22; S.aim.y = S.aimGoal.y = g.H0 * 0.30; S.vel.x = S.vel.y = 0; }
      S.aimGoal.x = g.W0 * (0.22 + 0.06 * t); S.aimGoal.y = g.H0 * (0.30 + 0.03 * t);
    } },
  ] },
};

(async () => {
  const which = process.argv[2], ses = SESSIONS[which];
  if (!ses) { console.log('sessions:', Object.keys(SESSIONS).join(' ')); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const { page } = await open(browser, ses.map);
  await start(page, ses.mission);
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
