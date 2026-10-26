// The trailer's shots, recorded from the game itself (tools/trailer/rig.cjs). Each session is one page: a map, a
// mission, then one or more shots, each a list of cues on its own clock. Frames go to tests/out/trailer/<shot>/, and
// the shot's sound (everything the game played, put on the shot's clock, with the rotor under it) to <shot>.wav.
//   node tools/trailer/shots.cjs <session>      sessions: dark (shots 1, 2), flare (3), strike (4, 5, 6)
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
// the camera's moves are eased: a value going from a to b over [t0, t1] seconds of the shot
const EASE = `(a, b, t0, t1, t) => { const k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0))); return a + (b - a) * (k * k * (3 - 2 * k)); }`;
// The night cut: the valley at 02:00, the TV camera (EO), the missile launcher south of the road. Shot 3 onwards has
// the illumination flare burning over the launcher site: the third and fourth sessions light it in their warm-up.
const SITE = { x: 905, y: 745 };
const SESSIONS = {
  // 1: the cockpit at night, the screens glowing, HUNTER on the radio about the launcher; 2: the convoy's lights below
  dark: { map: 'valley', mission: 'night', shots: [
    { name: 'n1-cockpit', secs: 6, warm: 20, cue: (g, t) => {
      const CK = g.CK, E = eval(window.__EASE);
      if (t === 0) g.ckLook(1.0, CK.IW * 0.42, CK.IH * 0.40, 14, true);
      if (Math.abs(t - 0.8) < 1e-6) g.ckLook(1.08, CK.IW * 0.5, CK.IH * 0.47, 5);
      if (Math.abs(t - 1.2) < 1e-6) g.radio('HUNTER', '', 'hunter', ['h.call', 'h.t.TEL', 'h.d.600', 'h.dir.SOUTHEAST', 'h.mark']);
    } },
    { name: 'n2-convoy', secs: 7, cue: (g, t) => {
      const S = g.S, E = eval(window.__EASE), v = window.__lead || (window.__lead = g.vehicles.find(v => v.convoy && v.alive && !v.dormant));
      if (t === 0) { g.toSensor(); g.setSensor('eo'); document.querySelector('#hud').style.visibility = 'hidden'; S.sel = null; S.tracking = false; S.free = false; S.vel.x = S.vel.y = 0; S.aim.x = v.x; S.aim.y = v.y - 60; }
      S.aimGoal.x = v.x; S.aimGoal.y = v.y; S.zoom = S.zoomGoal = E(1.5, 2.6, 0, 7, t);
    } },
  ] },
  // 3: wide on the launcher site in the dark; the illumination rocket goes up, the flare lights and the valley appears
  flare: { map: 'valley', mission: 'night', shots: [
    { name: 'n3-flare', secs: 9, warm: 20, cue: (g, t) => {
      const S = g.S, E = eval(window.__EASE);
      if (t === 0) { g.toSensor(); g.setSensor('eo'); document.querySelector('#hud').style.visibility = 'hidden'; S.sel = null; S.tracking = false; S.free = false; S.vel.x = S.vel.y = 0; S.aim.x = S.aimGoal.x = 905; S.aim.y = S.aimGoal.y = 745; S.armed = true; S.weapon = 'rkt'; S.rkType = 'il'; }
      if (Math.abs(t - 0.3) < 1e-6) g.fire();
      S.zoom = S.zoomGoal = E(1.25, 1.55, 0, 9, t); S.aimGoal.x = E(905, 912, 0, 9, t); S.aimGoal.y = E(745, 758, 0, 9, t);
    } },
  ] },
  // 4: under the flare, in on the launcher, the track, the Hellfire away; 5: its arrival in slow motion, the launcher's
  // own blast after it; 6: back out over the burning site
  strike: { map: 'valley', mission: 'night', setup: (g) => {
      const S = g.S; S.armed = true; S.weapon = 'rkt'; S.rkType = 'il'; S.aim.x = S.aimGoal.x = 905; S.aim.y = S.aimGoal.y = 745; S.free = false; g.fire();
    }, shots: [
    { name: 'n4-lock', secs: 6, warm: 200, cue: (g, t) => {
      const S = g.S, E = eval(window.__EASE), L = window.__L || (window.__L = g.targets.find(u => u.vk === 'launcher'));
      if (t === 0) { g.toSensor(); g.setSensor('eo'); document.querySelector('#hud').style.visibility = 'visible'; g.lockOn(L, true); S.weapon = 'msl'; S.hfType = 'sal'; S.armed = true; L.hp = Math.min(L.hp, 200); }
      S.zoom = S.zoomGoal = E(1.6, 4.5, 0, 1.8, t);
      if (t >= 2.4 && !window.__fired && g.fireStatePub().ok) { window.__fired = true; g.fire(); }
    } },
    { name: 'n5-impact', secs: 9, cue: (g, t) => {
      const S = g.S, m = g.projectiles.find(p => p.type === 'msl');
      // real time while it flies; a third of it from just before it arrives until the launcher's own blast has bloomed
      if (m && m.tti > 0.45) return 1;
      if (window.__hitT == null) window.__hitT = S.t;
      const since = S.t - window.__hitT;
      if (since > 0.15) document.querySelector('#hud').style.visibility = 'hidden';
      return since < 1.6 ? 0.33 : Math.min(1, 0.33 + (since - 1.6) * 0.9);
    } },
    { name: 'n6-after', secs: 6, cue: (g, t) => {
      const S = g.S, E = eval(window.__EASE);
      if (t === 0) { S.sel = null; S.tracking = false; S.free = false; }
      S.zoom = S.zoomGoal = E(4.5, 1.7, 0, 6, t);
    } },
  ] },
};

(async () => {
  const which = process.argv[2], ses = SESSIONS[which];
  if (!ses) { console.log('sessions:', Object.keys(SESSIONS).join(' ')); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const { page } = await open(browser, ses.map);
  await start(page, ses.mission, ses.setup);
  await page.evaluate(e => { window.__EASE = e; }, EASE);
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
