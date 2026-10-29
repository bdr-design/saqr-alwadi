/* ===================== sound (WebAudio, synthesised) ===================== */
const Snd = {
  ctx: null, master: null, wet: null, dry: null, on: false, noise: null, bank: null,
  // The rotor, the blasts and the shots are synthesised sample by sample: seconds of audio each. Doing all of it
  // when the mission starts froze the screen there, so prepare() builds it while the menu is up, one piece per tick.
  // The context starts suspended (no user gesture yet) and setOn resumes it.
  init() { if (!this.ctx) this.prepare(); return !!this.ctx; },
  prepare() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    let c; try { c = this.ctx = new AC(); } catch (_) { return; }
    const len = c.sampleRate * 3, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    // short valley reverb used only as a light glue on top of the rendered sounds
    const irLen = Math.floor(c.sampleRate * 2.5), ir = this.ir = c.createBuffer(2, irLen, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const x = ir.getChannelData(ch); for (let i = 0; i < irLen; i++) x[i] = (Math.random() * 2 - 1) * Math.exp(-i / c.sampleRate * 2.4) * 0.3; }
    this.graph();
    this.bank = { msl: [], bmb: [], small: [], hit: [], shot: [] };
    // the order things are first heard: the rotor, then the gun and the Hellfire, then the rest
    const jobs = JET ? [() => { F15Snd.bufs = { air: F15Snd.renderAir(c), core: F15Snd.renderCore(c) }; },
      () => { Object.assign(F15Snd.bufs, { cabin: F15Snd.renderCabin(c), ab: F15Snd.renderAB(c) }); this.engine = this.makeEngine(); },
      () => { this.rel = [F15Snd.renderRelease(c, false), F15Snd.renderRelease(c, true)]; this.mav = F15Snd.renderMaverick(c); }]
      : [() => { this.rotorBuf = this.renderRotor(false); }, () => { this.slapBuf = this.renderRotor(true); this.engine = this.makeEngine(); }];
    for (let i = 0; i < 4; i++) jobs.push(() => this.bank.shot.push(this.renderShot(51 + i)));
    for (let i = 0; i < 3; i++) jobs.push(() => this.bank.msl.push(this.renderBoom(1, 11 + i)), () => this.bank.hit.push(this.renderBoom(0.1, 41 + i)), () => this.bank.small.push(this.renderBoom(0.3, 31 + i)));
    for (let i = 0; i < 2; i++) jobs.push(() => this.bank.bmb.push(this.renderBoom(2.2, 21 + i)));
    jobs.push(() => loadRadio());   // the radio's recorded voices
    this.jobsTotal = jobs.length; this.jobsDone = 0;
    let fin; this.ready = new Promise(r => { fin = r; });
    // while the loading screen is up the steps run back to back; nothing is left for the mission
    const step = () => { const j = jobs.shift(); if (!j) { fin(); return; } j(); this.jobsDone++; setTimeout(step, BOOTING ? 0 : 40); };
    setTimeout(step, 0);
  },
  // the playback chain of the current context: compressor, master, reverb, wind, and the rotor once it is rendered.
  // The rendered sounds (AudioBuffers) belong to no context, so a fresh context reuses them as they are.
  graph() {
    const c = this.ctx, buf = this.noise, ir = this.ir;
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 3; comp.attack.value = 0.002; comp.release.value = 0.25; comp.connect(c.destination);
    this.master = c.createGain(); this.master.gain.value = 0; this.master.connect(comp);
    const conv = c.createConvolver(); conv.buffer = ir;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
    this.wet = c.createGain(); this.wet.gain.value = 0.35; this.wet.connect(lp); lp.connect(conv); conv.connect(this.master);
    this.dry = c.createGain(); this.dry.connect(this.master);
    this.engine = (JET ? F15Snd.bufs && F15Snd.bufs.ab : this.slapBuf) ? this.makeEngine() : null;
    if (JET) return;   // (at 15,000 ft there is no valley wind to hear)
    // ambience: wind through the valley
    const wn = c.createBufferSource(); wn.buffer = buf; wn.loop = true;
    const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 280;
    const wg = c.createGain(); wg.gain.value = 0.015;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.07; const lg = c.createGain(); lg.gain.value = 0.025; lfo.connect(lg); lg.connect(wg.gain); lfo.start();
    wn.connect(wf); wf.connect(wg); wg.connect(this.dry); wn.start();
  },
  // Leaving the app: iOS interrupts the audio context, and a context brought back from an interruption can stay silent
  // while it reads 'running' (WebKit). So after any trip away a fresh context is built with the same sounds: at once in
  // the iOS app (it plays without a touch), on the first touch in a browser. watch() catches a context that died
  // anyway: its clock stops, or it is no longer running.
  // Rebuilds without a touch back off (1.5 s doubling to 30 s) while a new context keeps dying, as during a call.
  // Asleep (held) from leaving until the next wake: the app can be inactive and still visible (Control Center).
  stale: false, held: false, native: inApp, builtAt: 0, lastT: -1, backoff: 1500,
  sleep() { this.held = true; if (!this.ctx) return; this.stale = true; this.ctx.suspend().catch(() => {}); },
  wake(touch) {
    if (!this.ctx || !this.on || document.hidden) return;
    this.held = false;
    if ((touch || this.native) && (this.stale || this.ctx.state !== 'running')) {
      if (!touch && performance.now() - this.builtAt < this.backoff) return;   // the last one is still starting
      if (!touch) this.backoff = Math.min(30000, this.backoff * 2);
      this.stale = false; this.rebuild(); return;
    }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
  },
  watch() {
    if (!this.ctx || !this.on || this.held || document.hidden || performance.now() - this.builtAt < 1500) { this.lastT = -1; return; }
    const t = this.ctx.currentTime, was = this.lastT;
    if (this.ctx.state !== 'running' || t === was) { this.lastT = -1; this.stale = true; this.wake(false); return; }
    if (was >= 0) this.backoff = 1500;   // its clock has moved: alive
    this.lastT = t;
  },
  rebuild() {
    const AC = window.AudioContext || window.webkitAudioContext, old = this.ctx;
    try { this.ctx = new AC(); } catch (_) { return; }
    this.builtAt = performance.now(); this.lastT = -1;
    this.graph(); this.setOn(this.on);
    try { old.close(); } catch (_) {}
  },
  // Distant blast heard across a valley: an air-pressure pulse, a low body, a long rolling rumble
  // with irregular swells, and slap-back echoes off the ridges. Air absorption removes most highs.
  renderBoom(k, seed) {
    const c = this.ctx, sr = c.sampleRate, small = k < 0.5;
    const dur = small ? 1.6 + k * 3 : 4.8 + 1.4 * k, N = Math.floor(dur * sr);
    const out = c.createBuffer(2, N, sr);
    let s = seed * 9301 + 49297; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const lpA = fc => 1 - Math.exp(-2 * Math.PI * fc / sr);
    const td = 0.006 + 0.005 * k;                       // positive-phase duration of the pulse
    const swells = Array.from({ length: 6 }, () => [0.5 + rnd() * 2.6, rnd() * 6.28, 0.3 + rnd() * 0.7]);
    const echoes = small ? [[0.42, 0.25]] : [[0.38 + rnd() * 0.1, 0.42], [0.95 + rnd() * 0.2, 0.3], [1.7 + rnd() * 0.3, 0.2], [2.6 + rnd() * 0.4, 0.12]];
    for (let ch = 0; ch < 2; ch++) {
      const x = out.getChannelData(ch);
      let brownA = 0, brownB = 0, yB = 0, yR = 0, yP = 0, yP2 = 0;
      const aBody = lpA(small ? 900 : 520), aRum = lpA(small ? 220 : 110), aPulse = lpA(small ? 1400 : 420);
      const tauB = (small ? 0.12 : 0.32) + 0.12 * k, tauR = (small ? 0.35 : 1.5) + 0.5 * k;
      for (let i = 0; i < N; i++) {
        const t = i / sr;
        // Friedlander pulse, then low-passed
        const p = t < td * 4 ? (1 - t / td) * Math.exp(-2.2 * t / td) : 0;
        yP += aPulse * (p - yP); yP2 += aPulse * (yP - yP2);
        brownA = (brownA + 0.02 * (rnd() * 2 - 1)) / 1.02; brownB = (brownB + 0.02 * (rnd() * 2 - 1)) / 1.02;
        yB += aBody * (brownA * 3.2 - yB);
        yR += aRum * (brownB * 3.6 - yR);
        const envB = (1 - Math.exp(-t / 0.003)) * Math.exp(-t / tauB);
        let am = 0; for (const [f, ph, g] of swells) am += g * (0.5 + 0.5 * Math.sin(2 * Math.PI * f * t + ph + ch));
        const envR = (1 - Math.exp(-t / 0.05)) * Math.exp(-t / tauR) * (0.45 + 0.55 * am / 3);
        x[i] = yP2 * 2.8 + yB * envB * 1.25 + yR * envR * (small ? 0.6 : 1.1);
      }
      // ridge echoes: delayed, softer, darker copies of the opening second
      const src = Float32Array.from(x.subarray(0, Math.min(N, Math.floor(sr * 0.9))));
      for (const [dl, g] of echoes) {
        const off = Math.floor((dl + ch * 0.017) * sr); let y = 0; const a = lpA(260);
        for (let i = 0; i < src.length && off + i < N; i++) { y += a * (src[i] - y); x[off + i] += y * g; }
      }
      let peak = 0; for (let i = 0; i < N; i++) { x[i] = Math.tanh(x[i] * 1.4); peak = Math.max(peak, Math.abs(x[i])); }
      const fadeN = Math.floor(sr * 0.3);
      for (let i = 0; i < N; i++) { x[i] /= peak || 1; if (i > N - fadeN) x[i] *= (N - i) / fadeN; }
    }
    return out;
  },
  // One heavy machine-gun report: muzzle blast with a hard edge, low chest thump, bolt clack,
  // and a short slap off the hillside.
  renderShot(seed) {
    const c = this.ctx, sr = c.sampleRate, N = Math.floor(sr * 0.75), out = c.createBuffer(2, N, sr);
    let s = seed * 7919 + 104729; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
    const lpA = fc => 1 - Math.exp(-2 * Math.PI * fc / sr);
    for (let ch = 0; ch < 2; ch++) {
      const x = out.getChannelData(ch);
      let yN = 0, yN2 = 0, hp = 0, yT = 0, br = 0, phase = rnd() * 6;
      const td = 0.0018 + rnd() * 0.0006;
      for (let i = 0; i < N; i++) {
        const t = i / sr;
        const p = t < td * 5 ? (1 - t / td) * Math.exp(-2 * t / td) : 0;
        const w = rnd() * 2 - 1;
        yN += lpA(2600) * (w - yN); yN2 += lpA(2600) * (yN - yN2);
        const crack = (yN2 - hp); hp += lpA(500) * (yN2 - hp);
        br = (br + 0.03 * w) / 1.03; yT += lpA(700) * (br * 4 - yT);
        const envC = Math.exp(-t / 0.012), envT = (1 - Math.exp(-t / 0.002)) * Math.exp(-t / 0.07);
        const thump = Math.sin(2 * Math.PI * (88 + 30 * Math.exp(-t / 0.02)) * t + phase) * Math.exp(-t / 0.045);
        const clack = t > 0.028 && t < 0.036 ? (rnd() * 2 - 1) * Math.exp(-(t - 0.028) / 0.002) * 0.25 : 0;
        const tail = t > 0.04 ? yT * Math.exp(-(t - 0.04) / 0.22) * 0.35 : 0;
        x[i] = p * 1.6 + crack * envC * 1.8 + yT * envT * 1.1 + thump * 0.9 + clack + tail;
      }
      const off = Math.floor((0.21 + ch * 0.012) * sr); let y = 0;
      for (let i = 0; i + off < N && i < sr * 0.2; i++) { y += lpA(900) * (x[i] - y); x[off + i] += y * 0.28; }
      let peak = 0; for (let i = 0; i < N; i++) { x[i] = Math.tanh(x[i] * 1.8); peak = Math.max(peak, Math.abs(x[i])); }
      for (let i = 0; i < N; i++) x[i] /= peak || 1;
    }
    return out;
  },
  // AH-64 heard from the front seat, rendered once into seamless 8 s loops (every tone has a whole number of cycles in 8 s):
  //  main rotor: 4 blades at 289 rpm -> 19.25 blade passes a second: a low thump and a broadband "whop" each pass,
  //    with a 1/rev unevenness (no two blades track exactly alike);
  //  tail rotor: 4 blades at about 1400 rpm -> 93.5 Hz buzz, its harmonics, beating against the main rotor's wake;
  //  main transmission gear mesh and the two T700 turbines: thin tones that leak through the canopy;
  //  all of it through the cabin and the helmet: low end swollen, the highs rolled off.
  // A second loop holds only the blade slap, which grows with load (turns, gusts, pull-ups).
  renderRotor(slapOnly) {
    const c = this.ctx, sr = c.sampleRate, L = 8, pre = 0.6, X = 0.25, N = Math.floor((pre + L + X) * sr);
    const out = c.createBuffer(2, Math.floor(L * sr), sr);
    let seed = slapOnly ? 777 : 333; const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
    const lpA = fc => 1 - Math.exp(-2 * Math.PI * fc / sr);
    const BPF = 19.25, TR = 93.5;
    const blade = [[0, 1.0], [0.0004, 0.94], [-0.0003, 1.05], [0.0002, 0.97]];   // [timing error s, strength] per blade
    for (let ch = 0; ch < 2; ch++) {
      const x = new Float32Array(N);
      let brown = 0, yW = 0, yW2 = 0, yT = 0, yLo = 0, yBody = 0, yHi = 0, yHi2 = 0;
      const aW = lpA(650), aT = lpA(1300), aLo = lpA(70), aBody = lpA(190), aHi = lpA(2600);
      for (let i = 0; i < N; i++) {
        const t = i / sr - pre;
        // phase within the blade pass, with each blade's small error
        const k = Math.floor((t + 100) * BPF), bl = blade[((k % 4) + 4) % 4];
        const tp = (t + 100) - k / BPF - bl[0];
        const w = rnd() * 2 - 1;
        brown = (brown + 0.02 * w) / 1.02;
        yW += aW * (w - yW); yW2 += aW * (yW - yW2);
        // thump: a short low pressure pulse as the blade passes over the canopy
        const thump = tp > 0 && tp < 0.03 ? Math.sin(Math.PI * tp / 0.03) ** 2 * bl[1] : 0;
        // whop: band-limited noise, sharp attack, quick decay
        const env = tp > 0 ? Math.exp(-tp / (slapOnly ? 0.009 : 0.016)) * (1 - Math.exp(-tp / 0.0015)) : 0;
        let v;
        if (slapOnly) {
          v = yW2 * env * 3.4 * bl[1] + thump * 0.25;
        } else {
          const tail = TR * t * 2 * Math.PI;
          const wake = 0.75 + 0.25 * Math.cos(2 * Math.PI * BPF * t);
          const tr = (Math.sin(tail) + 0.55 * Math.sin(2 * tail + 0.4) + 0.3 * Math.sin(3 * tail + 1.1) + 0.15 * Math.sin(5 * tail + 0.2)) * wake;
          yT += aT * (w * (0.6 + 0.4 * Math.sin(tail)) - yT);
          const gear = Math.sin(2 * Math.PI * 1180 * t) * (0.8 + 0.2 * Math.sin(2 * Math.PI * 4.8125 * t)) + 0.35 * Math.sin(2 * Math.PI * 2360 * t + 0.7);
          const turb = Math.sin(2 * Math.PI * 4021.25 * t) + 0.8 * Math.sin(2 * Math.PI * 4027.5 * t + ch);
          v = thump * 0.55 + yW2 * env * 4.2 + tr * 0.6 + yT * 0.6 + brown * 0.45 + yW * 0.16 + gear * 0.07 + turb * 0.016;
        }
        // cabin: swollen low end, highs rolled off by the canopy and the helmet's ear cups
        yLo += aLo * (v - yLo); yBody += aBody * (v - yBody); yHi += aHi * (v - yHi); yHi2 += aHi * (yHi - yHi2);
        x[i] = yHi2 * 1.0 + yBody * 0.2 + yLo * 0.2;
      }
      // drop the warm-up, then fold the extra tail over the head so the loop has no seam
      const o = out.getChannelData(ch), s0 = Math.floor(pre * sr), Ln = o.length, Xn = Math.floor(X * sr);
      for (let i = 0; i < Ln; i++) o[i] = x[s0 + i];
      for (let i = 0; i < Xn; i++) { const a = i / Xn; o[i] = o[i] * a + x[s0 + Ln + i] * (1 - a); }
      let peak = 0; for (let i = 0; i < Ln; i++) peak = Math.max(peak, Math.abs(o[i]));
      for (let i = 0; i < Ln; i++) o[i] = Math.tanh(o[i] / (peak || 1) * 1.2) / Math.tanh(1.2);
    }
    return out;
  },
  makeEngine() {
    // the F-15's back seat (src/f15snd.js), mixed live from the flight model
    if (JET) { const bus = this.ctx.createGain(); bus.gain.value = 0.6; bus.connect(this.dry); return { jet: F15Snd.start(this.ctx, bus) }; }
    const c = this.ctx, bus = c.createGain(); bus.gain.value = 0.42; bus.connect(this.dry);
    const base = c.createBufferSource(); base.buffer = this.rotorBuf; base.loop = true;
    const slap = c.createBufferSource(); slap.buffer = this.slapBuf; slap.loop = true;
    const sg = c.createGain(); sg.gain.value = 0.12;
    base.connect(bus); slap.connect(sg); sg.connect(bus);
    // airflow over the canopy grows with speed
    const air = c.createBufferSource(); air.buffer = this.noise; air.loop = true;
    const af = c.createBiquadFilter(); af.type = 'bandpass'; af.frequency.value = 420; af.Q.value = 0.5;
    const ag = c.createGain(); ag.gain.value = 0.03; air.connect(af); af.connect(ag); ag.connect(bus);
    const t0 = c.currentTime + 0.05; base.start(t0); slap.start(t0); air.start();
    return { base, slap, sg, ag, af, bus };
  },
  engineUpdate(p) {
    if (!this.engine) return;
    if (JET) { if (JX.ac) F15Snd.update(this.ctx, this.engine.jet, JX.ac.o, JX.ac.eng); return; }
    const e = this.engine, t = this.ctx.currentTime;
    // rotor speed is governed at 100 %: it sags a hair under load and recovers
    const nr = 1 - (p.load - 1) * 0.02;
    e.base.playbackRate.setTargetAtTime(nr, t, 0.6); e.slap.playbackRate.setTargetAtTime(nr, t, 0.6);
    e.sg.gain.setTargetAtTime(clamp(0.1 + (p.load - 1) * 2.2 + Math.max(0, -p.vs) * 0.04, 0.06, 0.6), t, 0.3);
    e.ag.gain.setTargetAtTime(0.02 + p.gs / 120 * 0.015, t, 0.8);
    e.af.frequency.setTargetAtTime(360 + p.gs * 0.8, t, 0.8);
  },
  click() {
    if (!this.on || !this.tones) return;
    const c = this.ctx, t0 = c.currentTime, s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400; f.Q.value = 1.5;
    const g = c.createGain(); g.gain.setValueAtTime(0.16, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.025);
    s.connect(f); f.connect(g); g.connect(this.dry); s.start(t0, Math.random() * 2); s.stop(t0 + 0.04);
  },
  play(buf, gain, delay, wet, rate) {
    if (!buf) return;   // still being prepared
    const c = this.ctx, src = c.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate || 1;
    const g = c.createGain(); g.gain.value = gain; src.connect(g); g.connect(this.dry);
    if (wet) { const w = c.createGain(); w.gain.value = wet; g.connect(w); w.connect(this.wet); }
    src.start(c.currentTime + (delay || 0));
  },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  vol: 1, tones: true,
  // (switched on after a trip away while it was off, the menu's case: a fresh context, not the interrupted one resumed,
  // which on the iPhone can read 'running' and stay silent)
  setOn(on) { this.on = on; if (!this.ctx) return; if (on && this.stale && !document.hidden) { this.stale = false; this.held = false; this.rebuild(); return; }
    if (on && this.ctx.state !== 'running') this.ctx.resume().catch(() => {}); this.master.gain.setTargetAtTime(on ? 0.95 * this.vol : 0, this.ctx.currentTime, 0.1); },
  boom(k, small) {
    // (from the jet, kilometres up and away, a blast is seen, not heard)
    if (!this.on || JET) return;
    if (k < 0.2) this.play(this.pick(this.bank.hit), 0.32, 0.05, 0.1, 0.92 + Math.random() * 0.16);
    else if (k < 0.5) this.play(this.pick(this.bank.small), 0.6, 0.08, 0.15, 0.9 + Math.random() * 0.2);
    else if (k < 1.5) this.play(this.pick(this.bank.msl), 1.0, 0.16, 0.2, 0.94 + Math.random() * 0.1);
    else this.play(this.pick(this.bank.bmb), 1.0, 0.2, 0.25, 0.9 + Math.random() * 0.08);
  },
  launch() {
    if (!this.on) return;
    const c = this.ctx, t0 = c.currentTime, s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 0.8; f.frequency.setValueAtTime(220, t0); f.frequency.exponentialRampToValueAtTime(900, t0 + 0.5); f.frequency.exponentialRampToValueAtTime(300, t0 + 2.2);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 2.4);
    s.connect(f); f.connect(g); g.connect(this.dry); s.start(t0, Math.random()); s.stop(t0 + 2.5);
  },
  rocket() {
    if (!this.on) return;
    const c = this.ctx, t0 = c.currentTime, s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.1; f.frequency.setValueAtTime(700, t0); f.frequency.exponentialRampToValueAtTime(260, t0 + 0.9);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.1);
    s.connect(f); f.connect(g); g.connect(this.dry); s.start(t0, Math.random() * 2); s.stop(t0 + 1.2);
  },
  jetRel(heavy) { if (this.on && this.rel) this.play(this.rel[heavy ? 1 : 0], 0.9, 0); },
  jetMav() { if (this.on && this.mav) this.play(this.mav, 0.8, 0); },
  gun() { if (!this.on) return; this.play(this.pick(this.bank.shot), 0.5 + Math.random() * 0.12, Math.random() * 0.006, 0.18, 0.96 + Math.random() * 0.08); },
  // The set around a voice, from t0. FM: the click of the key, then the carrier's hiss (quiet under a strong signal),
  // and when he lets go the squelch tail, a burst of open noise. Intercom: the helmet microphone's hot noise only.
  // Returns close(t).
  carrier(net, t0) {
    const c = this.ctx, fm = net === 'fm';
    const n = c.createBufferSource(); n.buffer = this.noise; n.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fm ? 2100 : 950; bp.Q.value = fm ? 0.45 : 0.7;
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0);
    n.connect(bp); bp.connect(g); g.connect(this.dry); n.start(t0, Math.random() * 2);
    if (fm) {
      g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.012, t0 + 0.12);
      const k = c.createBufferSource(); k.buffer = this.noise; const kf = c.createBiquadFilter(); kf.type = 'lowpass'; kf.frequency.value = 3200;
      const kg = c.createGain(); kg.gain.setValueAtTime(0.22, t0); kg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.008);
      k.connect(kf); kf.connect(kg); kg.connect(this.dry); k.start(t0, Math.random() * 2); k.stop(t0 + 0.02);
    } else g.gain.exponentialRampToValueAtTime(0.012, t0 + 0.05);
    return t => {
      t = Math.max(t, c.currentTime);
      if (fm) {
        g.gain.setValueAtTime(0.012, t); g.gain.linearRampToValueAtTime(0.13, t + 0.01); g.gain.setValueAtTime(0.13, t + 0.13);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2); bp.frequency.setValueAtTime(3000, t); bp.Q.setValueAtTime(0.25, t);
        n.stop(t + 0.22);
      } else { g.gain.setValueAtTime(0.012, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06); n.stop(t + 0.08); }
    };
  },
  // One transmission of a rendered voice. FM: the voice and what is around the speaker go into his handset, then
  // through the set: a narrow band (300 to 2.8 kHz), a presence peak, clipped and squeezed flat. HUNTER's handset hears
  // his fight: wind across it, rifles near him, a heavier gun and a blast further off. Intercom: the helmet
  // microphone, wider and only lightly driven. Returns how long it takes.
  transmit(clip, net, bed) {
    if (!this.on || !this.ctx) return 0;
    const c = this.ctx, fm = net === 'fm', t0 = c.currentTime + 0.03, n = clip.d.length;
    const buf = c.createBuffer(1, n, clip.sr); buf.getChannelData(0).set(clip.d);
    const dur = n / clip.sr, tv = t0 + (fm ? 0.24 : 0.05), tEnd = tv + dur + (fm ? 0.12 : 0.04);
    const mic = c.createGain();
    const v = c.createBufferSource(); v.buffer = buf; const vg = c.createGain(); vg.gain.value = 0.9 / clip.pk;
    v.connect(vg); vg.connect(mic); v.start(tv);
    if (bed) {
      const w = c.createBufferSource(); w.buffer = this.noise; w.loop = true;
      const wf = c.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 420;
      const wg = c.createGain(); wg.gain.setValueAtTime(0.0001, t0);
      for (let t = t0 + 0.05; t < tEnd - 0.05; t += 0.15 + Math.random() * 0.3) wg.gain.linearRampToValueAtTime(0.04 + Math.random() ** 2 * 0.4, t);   // gusts
      wg.gain.linearRampToValueAtTime(0.0001, tEnd);
      w.connect(wf); wf.connect(wg); wg.connect(mic); w.start(t0, Math.random() * 2); w.stop(tEnd + 0.02);
      const shot = (t, g, rate) => { const b = this.pick(this.bank.shot); if (!b || t >= tEnd) return; const s = c.createBufferSource(); s.buffer = b; s.playbackRate.value = rate;
        const sg = c.createGain(); sg.gain.value = g; s.connect(sg); sg.connect(mic); s.start(t); s.stop(Math.min(tEnd, t + 0.5)); };
      for (let t = t0 + Math.random() * 0.5; t < tEnd; t += 0.5 + Math.random() * 1.3) {
        const near = Math.random() < 0.6, k = near ? 2 + Math.floor(Math.random() * 4) : 3 + Math.floor(Math.random() * 6);
        for (let i = 0; i < k; i++) shot(t + i * (near ? 0.11 + Math.random() * 0.05 : 0.085), near ? 0.5 + Math.random() * 0.25 : 0.14, near ? 1.25 + Math.random() * 0.2 : 0.8);
      }
      const bb = this.pick(this.bank.small); if (bb && Math.random() < 0.5) { const s = c.createBufferSource(); s.buffer = bb; const sg = c.createGain(); sg.gain.value = 0.3; s.connect(sg); sg.connect(mic); s.start(t0 + Math.random() * dur); s.stop(tEnd); }
    }
    const f = (type, fr, q, gain) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = fr; b.Q.value = q; if (gain) b.gain.value = gain; return b; };
    const chain = fm ? [f('highpass', 300, 0.7), f('highpass', 300, 0.7), f('lowpass', 2800, 0.7), f('lowpass', 2800, 0.7), f('peaking', 1800, 1, 6)]
      : [f('highpass', 190, 0.7), f('lowpass', 4600, 0.7), f('peaking', 2600, 0.9, 3)];
    const drive = c.createGain(); drive.gain.value = fm ? 3.2 : 1.6;
    const ws = c.createWaveShaper(); ws.curve = this.clipCurve || (this.clipCurve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh((i / 511.5 - 1) * 2.5) / Math.tanh(2.5))); ws.oversample = '2x';
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -26; comp.knee.value = 4; comp.ratio.value = 10; comp.attack.value = 0.002; comp.release.value = 0.1;
    const out = c.createGain(); out.gain.value = 1;
    // the receiver's own audio band, after the clipping
    const post = fm ? [f('highpass', 250, 0.7), f('lowpass', 3300, 0.7), f('lowpass', 3300, 0.7)] : [f('lowpass', 5500, 0.7)];
    [mic, ...chain, drive, ws, comp, ...post, out].reduce((a, b) => (a.connect(b), b)).connect(this.dry);
    this.carrier(net, t0)(tEnd);
    return tEnd + (fm ? 0.2 : 0.06) - c.currentTime;
  },
  // a round striking the airframe (a missile's blast for a big one); the caution chime; a round
  // cracking past; the missile warner's tone; flares popping out
  burst(f0, f1, q, d, g0, type) {
    if (!this.on) return;
    const c = this.ctx, t0 = c.currentTime, s = c.createBufferSource(); s.buffer = this.noise;
    const f = c.createBiquadFilter(); f.type = type || 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + d);
    const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(g0, t0 + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    s.connect(f); f.connect(g); g.connect(this.dry); s.start(t0, Math.random() * 2); s.stop(t0 + d + 0.05);
  },
  beep(f, t, d, g0, type) {
    const c = this.ctx, t0 = c.currentTime + t, o = c.createOscillator(), g = c.createGain(); o.type = type || 'square'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(g0, t0 + 0.01); g.gain.setValueAtTime(g0, t0 + d - 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(g); g.connect(this.dry); o.start(t0); o.stop(t0 + d + 0.02);
  },
  impact(big) { if (!this.on) return; this.play(this.pick(big ? this.bank.msl : this.bank.hit), big ? 1 : 0.7, 0, 0.1, big ? 1.1 : 1.6); this.burst(900, 300, 3, 0.25, 0.25); },
  caution() { if (!this.on) return; for (let i = 0; i < 3; i++) this.beep(1050, i * 0.32, 0.18, 0.05); },
  crack() { if (!this.on) return; this.burst(4000, 2500, 0.6, 0.04, 0.12, 'highpass'); },
  mws() { if (!this.on) return; for (let i = 0; i < 6; i++) this.beep(i % 2 ? 750 : 1250, i * 0.18, 0.16, 0.06); },
  // the radar warning receiver: a new radar's tone, and the launch warble (the jet's own, src/f15snd.js)
  rwrNew() { if (!this.on) return; if (JET && window.F15Snd) F15Snd.newThreat(this.ctx, this.dry, this.ctx.currentTime); else this.caution(); },
  rwrLaunch(d) { if (!this.on) return; if (JET && window.F15Snd) F15Snd.launch(this.ctx, this.dry, this.ctx.currentTime, d); else this.mws(); },
  flare() { if (!this.on) return; this.burst(500, 200, 1, 0.09, 0.2, 'lowpass'); },
  tone(f, d) { if (!this.on || !this.tones) return; const c = this.ctx, t0 = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.04, t0 + 0.005); g.gain.exponentialRampToValueAtTime(0.0001, t0 + d); o.connect(g); g.connect(this.dry); o.start(t0); o.stop(t0 + d + 0.02); },
};

