/* ZF-25 sounds, as the weapon systems officer hears them in the back seat. Rendered sample by sample into buffers
   (like the Sahm's rotor, Snd.renderRotor), then mixed live from the flight model's state. No DOM: it takes an
   AudioContext (or an OfflineAudioContext, as tests/f15snd.cjs renders the previews).

   What the back seat hears at 450 knots and 20,000 ft, through a flight helmet (the ear cups take 20 to 30 dB off
   everything above 1 kHz, little off the lows):
   - the air: the boundary layer over the canopy, a broadband roar that is most of the noise in a fast jet. It grows
     with dynamic pressure and brightens with speed (air);
   - the engines, behind and below: little of the jet noise comes forward; what does is a low rumble through the
     structure and the faint whine of the two F110s' compressors, a few hertz apart, so they beat (core). Pitch
     follows the engines' speed;
   - the cockpit: the air conditioning hissing out of the vents, and the 400 Hz of the aircraft's electrics humming in
     the intercom (cabin);
   - the afterburners: a deep, uneven roar felt more than heard (ab).
   Each is a seamless 8 s loop: every tone has a whole number of cycles in 8 s, and the noise is cross-faded over
   its seam. On the ground a sixth loop joins them: the wheels over the concrete (roll), driven by the ground speed,
   silent in the air. Events: a bomb leaving its rack, a Barq leaving its rail, flares, the radar warning
   receiver, the g-suit filling in a hard turn, the caution tone, and the ground set — the gear running down and up,
   and touchdown (soft or hard) — fired off the flight model's own state (o.wow, o.gear) from update(), so they
   sound whenever the jet lands, takes off or cycles the gear with no caller to wire. A bomb's impact is not heard:
   it falls 7 km away. tests/f15snd.cjs renders a 'ground' preview: a full takeoff and landing, start to stop. */
(function (root) {
'use strict';
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lpA = (fc, sr) => 1 - Math.exp(-2 * Math.PI * fc / sr);
const rng = seed => { let s = seed >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };

// a stereo loop of L seconds from gen(i, t, ch, rnd) -> sample, cross-faded over X seconds so it has no seam, and
// normalised to peak 1
function loop(ctx, L, X, seed, gen) {
  const sr = ctx.sampleRate, n = Math.floor(L * sr), xn = Math.floor(X * sr), out = ctx.createBuffer(2, n, sr);
  for (let ch = 0; ch < 2; ch++) {
    const rnd = rng(seed * 7 + ch * 1013), st = {}, x = new Float32Array(n + xn);
    for (let i = 0; i < n + xn; i++) x[i] = gen(i, i / sr, ch, rnd, st);
    const o = out.getChannelData(ch);
    for (let i = 0; i < n; i++) o[i] = x[i];
    for (let i = 0; i < xn; i++) { const a = i / xn; o[i] = x[i] * a + x[n + i] * (1 - a); }
  }
  let pk = 0; for (let ch = 0; ch < 2; ch++) for (const v of out.getChannelData(ch)) pk = Math.max(pk, Math.abs(v));
  for (let ch = 0; ch < 2; ch++) { const o = out.getChannelData(ch); for (let i = 0; i < n; i++) o[i] /= pk || 1; }
  return out;
}

const F15Snd = {
  // the boundary layer over the canopy: pink-ish noise, the bulk between 150 and 900 Hz, a slow unsteadiness
  // (the flow is not steady over the bubble canopy), the highs taken off by the helmet
  renderAir(ctx) {
    const sr = ctx.sampleRate, a1 = lpA(900, sr), a2 = lpA(150, sr), aH = lpA(2200, sr);
    return loop(ctx, 8, 0.4, 11, (i, t, ch, rnd, s) => {
      const w = rnd() * 2 - 1;
      s.b = ((s.b || 0) + 0.02 * w) / 1.02;                             // brown
      s.l1 = (s.l1 || 0) + a1 * (w - (s.l1 || 0));                     // low-passed white
      s.l2 = (s.l2 || 0) + a2 * (s.l1 - (s.l2 || 0));
      const band = s.l1 - s.l2 * 0.85;                                   // 150..900 Hz, most of it
      const v = band * 1.4 + s.b * 2.2;
      s.h = (s.h || 0) + aH * (v - (s.h || 0));                         // the helmet
      const unsteady = 1 + 0.08 * Math.sin(2 * Math.PI * 0.375 * t + ch) + 0.05 * Math.sin(2 * Math.PI * 1.125 * t + 2 * ch);
      return s.h * unsteady;
    });
  },
  // the two F110s through the structure: a low rumble (40 to 140 Hz) and the compressors' whine, one engine at
  // 3,250 Hz and the other at 3,251.5 Hz (1.5 Hz apart: the slow beat of twin engines not quite matched), with their
  // second harmonics, faint through the helmet. At the loop's playback rate 1 the engines are at military power.
  renderCore(ctx) {
    const sr = ctx.sampleRate, aL = lpA(140, sr), aL0 = lpA(40, sr), aH = lpA(2800, sr);
    const W = 2 * Math.PI, f1 = 3250, f2 = 3251.5;
    return loop(ctx, 8, 0.3, 23, (i, t, ch, rnd, s) => {
      const w = rnd() * 2 - 1;
      s.b = ((s.b || 0) + 0.03 * w) / 1.03;
      s.l = (s.l || 0) + aL * (s.b - (s.l || 0)); s.l0 = (s.l0 || 0) + aL0 * (s.b - (s.l0 || 0));
      const rumble = (s.l - s.l0 * 0.6) * 6;
      const whine = Math.sin(W * f1 * t) * (ch ? 0.8 : 1) + Math.sin(W * f2 * t + 1) * (ch ? 1 : 0.8)
        + 0.3 * Math.sin(W * 2 * f1 * t + 0.4) + 0.3 * Math.sin(W * 2 * f2 * t + 2.1);
      s.h = (s.h || 0) + aH * (whine - (s.h || 0));
      // the shaft's own low tone (about 120 Hz) under the rumble
      const shaft = Math.sin(W * 120 * t) * 0.25 + Math.sin(W * 240 * t + 0.3) * 0.1;
      return rumble + s.h * 0.05 + shaft * 0.35;
    });
  },
  // the cockpit itself: the air conditioning out of the vents (a hiss, 2 to 6 kHz, through the helmet much reduced)
  // and the 400 Hz of the aircraft's AC electrics in the intercom (with 800 and 1,200 Hz)
  renderCabin(ctx) {
    const sr = ctx.sampleRate, aHi = lpA(6000, sr), aLo = lpA(2000, sr), W = 2 * Math.PI;
    return loop(ctx, 8, 0.3, 37, (i, t, ch, rnd, s) => {
      const w = rnd() * 2 - 1;
      s.a = (s.a || 0) + aHi * (w - (s.a || 0)); s.b = (s.b || 0) + aLo * (s.a - (s.b || 0));
      const hiss = (s.a - s.b) * 0.5;
      const hum = Math.sin(W * 400 * t) + 0.35 * Math.sin(W * 800 * t + 0.5) + 0.2 * Math.sin(W * 1200 * t + 1.3);
      return hiss + hum * 0.06;
    });
  },
  // the wheels on the runway: the three olestruts carry the tyres over the concrete, a low broad rumble (the texture
  // of the surface and the slabs' joints passing) felt up through the gear and the seat. A loop driven by the
  // ground speed (update: its gain and its rate), silent in the air. The joints give it a faint periodic knock.
  renderRoll(ctx) {
    const sr = ctx.sampleRate, aL = lpA(120, sr), aL0 = lpA(45, sr), aH = lpA(260, sr);
    return loop(ctx, 6, 0.4, 29, (i, t, ch, rnd, s) => {
      const w = rnd() * 2 - 1;
      s.l = (s.l || 0) + aL * (w - (s.l || 0));                         // the surface's roar, low
      s.l0 = (s.l0 || 0) + aL0 * (s.l - (s.l0 || 0));
      const rough = s.l - s.l0 * 0.7;                                    // 45..120 Hz
      // the slabs' joints: a soft knock a few times a second (two tones a little apart, nose and mains)
      const knock = (Math.sin(2 * Math.PI * 3.1 * t + ch) + Math.sin(2 * Math.PI * 4.3 * t)) ;
      const v = rough * 2.4 + Math.max(0, knock) * rough * 1.6;
      s.h = (s.h || 0) + aH * (v - (s.h || 0));
      return s.h;
    });
  },
  // the main gear touching down: the tyres meet the runway, a thump up the struts and a short chirp of rubber as
  // they spin up, a puff of smoke. hard: a firmer arrival (a higher sink rate), a louder thump and a sharper chirp.
  renderTouchdown(ctx, hard) {
    const sr = ctx.sampleRate, n = Math.floor(sr * 0.7), out = ctx.createBuffer(2, n, sr), W = 2 * Math.PI;
    const thF = hard ? 70 : 55, chF = hard ? 2200 : 1600, thG = hard ? 1.6 : 1.0;
    for (let ch = 0; ch < 2; ch++) {
      const x = out.getChannelData(ch), rnd = rng(201 + ch + (hard ? 7 : 0));
      let a = 0, b = 0, th = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = rnd() * 2 - 1;
        // the thump: a damped low thud through the airframe
        th = Math.sin(W * thF * t) * Math.exp(-t / (hard ? 0.09 : 0.12));
        // the chirp: a burst of band-passed noise as the tyres spin up, 20 ms in, dying fast
        a += lpA(chF, sr) * (w - a); b += lpA(chF * 0.4, sr) * (a - b);
        const chirp = (a - b) * Math.max(0, Math.min(1, (t - 0.02) / 0.01)) * Math.exp(-Math.max(0, t - 0.02) / 0.07);
        x[i] = Math.tanh((th * thG * 1.6 + chirp * 2.2) * (ch === 0 ? 1 : 0.9));
      }
    }
    return out;
  },
  // the landing gear running out or up: the hydraulic motor's whirr for a couple of seconds, the doors' airflow, and
  // the clunk of the struts locking (down) or the bay closing (up). down: a down-lock at the end; else the doors shut.
  renderGear(ctx, down) {
    const sr = ctx.sampleRate, n = Math.floor(sr * 2.4), out = ctx.createBuffer(2, n, sr), W = 2 * Math.PI, lock = down ? 1.9 : 2.1;
    for (let ch = 0; ch < 2; ch++) {
      const x = out.getChannelData(ch), rnd = rng(221 + ch); let a = 0, b = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = rnd() * 2 - 1;
        // the hydraulic motor: a buzzing tone (about 90 Hz) with noise, on while the gear travels (0.1..lock)
        const run = t > 0.1 && t < lock ? 1 : 0;
        const motor = (Math.sin(W * 90 * t) * 0.6 + Math.sin(W * 180 * t) * 0.2) * run;
        a += lpA(1800, sr) * (w - a); b += lpA(500, sr) * (a - b);        // the doors' airflow hiss
        const hiss = (a - b) * run * 0.5;
        // the clunk at the end: a sharp low knock
        const ct = t - lock, clunk = ct > 0 ? Math.sin(W * 60 * ct) * Math.exp(-ct / 0.05) * 1.8 : 0;
        x[i] = Math.tanh((motor * 0.5 + hiss * 1.4 + clunk) * (ch === 0 ? 1 : 0.95));
      }
    }
    return out;
  },
  // the afterburners: deep (25 to 90 Hz), uneven, with a crackle; from the cockpit felt in the seat more than heard
  renderAB(ctx) {
    const sr = ctx.sampleRate, a1 = lpA(90, sr), a0 = lpA(25, sr), aC = lpA(700, sr);
    return loop(ctx, 8, 0.4, 51, (i, t, ch, rnd, s) => {
      const w = rnd() * 2 - 1;
      s.b = ((s.b || 0) + 0.04 * w) / 1.04;
      s.l = (s.l || 0) + a1 * (s.b - (s.l || 0)); s.l0 = (s.l0 || 0) + a0 * (s.b - (s.l0 || 0));
      // crackle: sparse sharp pops, darkened
      const pop = rnd() < 0.0016 ? (rnd() * 2 - 1) * 3 : 0;
      s.c = (s.c || 0) + aC * (pop - (s.c || 0)); s.ce = (s.ce || 0) * 0.995 + s.c * 0.4;
      return (s.l - s.l0 * 0.4) * 8 + s.ce * 0.6;
    });
  },

  // live mix. bus: where it goes (the game's dry bus). Returns the nodes update() drives.
  start(ctx, bus) {
    // the helmet's ear cups over all of it: two second-order low-passes, about -24 dB an octave above 2.5 kHz
    const helmet = ctx.createBiquadFilter(); helmet.type = 'lowpass'; helmet.frequency.value = 2500; helmet.Q.value = 0.6;
    const helmet2 = ctx.createBiquadFilter(); helmet2.type = 'lowpass'; helmet2.frequency.value = 3200; helmet2.Q.value = 0.6;
    helmet.connect(helmet2); helmet2.connect(bus);
    const mk = (buf, g) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 20000;
      const gn = ctx.createGain(); gn.gain.value = g;
      s.connect(f); f.connect(gn); gn.connect(helmet); return { s, f, g: gn };
    };
    if (!this.bufs) this.bufs = { air: this.renderAir(ctx), core: this.renderCore(ctx), cabin: this.renderCabin(ctx), ab: this.renderAB(ctx) };
    if (!this.bufs.roll) this.bufs.roll = this.renderRoll(ctx);
    // the ground events, rendered once and kept: touchdown (soft/hard), the gear running down and up
    if (!this.bufs.touch) this.bufs.touch = [this.renderTouchdown(ctx, false), this.renderTouchdown(ctx, true)];
    if (!this.bufs.gear) this.bufs.gear = [this.renderGear(ctx, false), this.renderGear(ctx, true)];
    const b = this.bufs, m = { air: mk(b.air, 0), core: mk(b.core, 0), cabin: mk(b.cabin, 0.05), ab: mk(b.ab, 0), roll: mk(b.roll, 0) };
    m.ev = helmet;   // the ground events go to the same ear cups as the rest of the cockpit
    const t0 = ctx.currentTime + 0.02;
    // each loop from its own offset, so their seams never line up
    m.air.s.start(t0, 0); m.core.s.start(t0, 2.7); m.cabin.s.start(t0, 5.1); m.ab.s.start(t0, 1.3); m.roll.s.start(t0, 0.9);
    return m;
  },
  // a rendered event buffer played once into a bus, at gain g from time t
  fire(ctx, bus, buf, g, t) {
    if (!buf) return;
    const s = ctx.createBufferSource(); s.buffer = buf;
    const gn = ctx.createGain(); gn.gain.value = g;
    s.connect(gn); gn.connect(bus); s.start(t || ctx.currentTime);
  },
  // o: the flight model's derived data (F15SA.update: qb dynamic pressure Pa, M, V) and the engines (n 0..1, ab 0..1)
  update(ctx, m, o, eng, at) {
    const t = at != null ? at : ctx.currentTime;
    // the air: about 6 dB for each doubling of dynamic pressure, brighter as it rises (a low-pass opening up)
    const q = Math.max(o.qb, 1), qref = 50000;                          // 50 kPa: 450 KTAS at 20,000 ft is about 46 kPa
    m.air.g.gain.setTargetAtTime(clamp(0.55 * Math.sqrt(q / qref), 0, 0.9), t, 0.4);
    m.air.f.frequency.setTargetAtTime(clamp(500 + 1700 * Math.sqrt(q / qref), 400, 4000), t, 0.4);
    // the engines: the whine's pitch with the core's speed (idle 68 % to military 100 %), louder with power
    const n = (eng[0].n + eng[1].n) / 2, ab = (eng[0].ab + eng[1].ab) / 2;
    m.core.s.playbackRate.setTargetAtTime(0.68 + 0.32 * n, t, 0.5);
    m.core.g.gain.setTargetAtTime(0.10 + 0.22 * n, t, 0.5);
    m.ab.g.gain.setTargetAtTime(0.75 * ab, t, 0.3);
    // the wheels on the runway: only with weight on them (o.wow), rising with the ground speed and the joints passing
    // faster (the loop's rate); nothing in the air. Fades quickly so lift-off and touchdown are clean
    if (m.roll) { const V = o.wow ? Math.max(0, o.V || 0) : 0, s = Math.min(1, V / 80);
      m.roll.g.gain.setTargetAtTime(0.5 * s * s, t, 0.08);
      m.roll.s.playbackRate.setTargetAtTime(0.75 + 0.9 * s, t, 0.12); }
    // the ground events, fired off the model's own state so they sound whenever the jet lands, rolls out or cycles
    // the gear — with no caller to wire. m.ev is the cockpit bus; m.wow0/m.gc0 remember the last frame.
    if (m.ev && this.bufs) {
      // touchdown: weight comes onto the wheels (the rising edge of o.wow). Hard above ~2.2 m/s of sink (o.vs < 0 down)
      if (m.wow0 === false && o.wow) this.fire(ctx, m.ev, this.bufs.touch[(o.vs != null && o.vs < -2.2) ? 1 : 0], 0.85, t);
      m.wow0 = !!o.wow;
      // the gear: one throw of the motor and a clunk each time the command crosses the half-way — out (down) or up
      const gc = o.gearCmd != null ? o.gearCmd : o.gear;
      if (gc != null) {
        if (m.gc0 != null && m.gc0 < 0.5 && gc >= 0.5) this.fire(ctx, m.ev, this.bufs.gear[1], 0.7, t);        // running down
        else if (m.gc0 != null && m.gc0 >= 0.5 && gc < 0.5) this.fire(ctx, m.ev, this.bufs.gear[0], 0.7, t);   // coming up
        m.gc0 = gc;
      }
    }
  },

  // ---- events, each a short buffer rendered once
  // A bomb off its rack: the ejector cartridges fire and two pistons push it clear: a hard low thud through the
  // airframe, a metallic clank of the hooks, and the jet lightening (a soft rush as it settles). heavy: a 2,000 lb bomb.
  renderRelease(ctx, heavy) {
    const sr = ctx.sampleRate, n = Math.floor(sr * 0.9), out = ctx.createBuffer(2, n, sr), W = 2 * Math.PI;
    for (let ch = 0; ch < 2; ch++) {
      const x = out.getChannelData(ch), rnd = rng(71 + ch + (heavy ? 9 : 0));
      let y1 = 0, y2 = 0, yk = 0, yk2 = 0;
      const aT = lpA(heavy ? 160 : 220, sr), aK = lpA(2600, sr), aK0 = lpA(700, sr);
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = rnd() * 2 - 1;
        y1 += aT * (w - y1); y2 += aT * (y1 - y2);
        const thud = (Math.sin(W * (heavy ? 52 : 68) * t) * 0.8 + y2 * 3) * (1 - Math.exp(-t / 0.002)) * Math.exp(-t / (heavy ? 0.12 : 0.08));
        yk += aK * (w - yk); yk2 += aK0 * (yk - yk2);
        const clankT = t - 0.012;
        const clank = clankT > 0 ? ((yk - yk2) * 1.2 + Math.sin(W * 1730 * t) * 0.3 + Math.sin(W * 2390 * t) * 0.2) * Math.exp(-clankT / 0.03) : 0;
        const rush = t > 0.05 ? y1 * 0.6 * Math.exp(-(t - 0.05) / 0.35) * (1 - Math.exp(-(t - 0.05) / 0.05)) : 0;
        x[i] = Math.tanh(thud * 1.6 + clank * 0.5 + rush);
      }
    }
    return out;
  },
  // A Barq off its rail under the wing: the motor lights with a bang and roars past the canopy, fading in 1.5 s
  renderMaverick(ctx) {
    const sr = ctx.sampleRate, n = Math.floor(sr * 2.2), out = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const x = out.getChannelData(ch), rnd = rng(91 + ch);
      let a = 0, b = 0, c = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = rnd() * 2 - 1;
        const fc = 1800 * Math.exp(-t / 0.6) + 250;                      // darker as it goes
        a += lpA(fc, sr) * (w - a); b += lpA(fc * 0.25, sr) * (a - b); c = ((c || 0) + 0.03 * w) / 1.03;
        const env = (1 - Math.exp(-t / 0.01)) * Math.exp(-t / 0.55);
        const bang = t < 0.04 ? w * Math.exp(-t / 0.006) * 1.5 : 0;
        // it passes the left side first (station 2 on the left wing in the standoff load)
        const pan = ch === 0 ? 1 : 0.7 + 0.3 * Math.min(t / 0.4, 1);
        x[i] = Math.tanh(((a - b) * 2.2 + c * 3) * env * pan + bang);
      }
    }
    return out;
  },
  // The flare dispensers: each cartridge a sharp pop and a thump in the tail, heard faintly forward
  renderFlare(ctx) {
    const sr = ctx.sampleRate, n = Math.floor(sr * 0.25), out = ctx.createBuffer(2, n, sr), W = 2 * Math.PI;
    for (let ch = 0; ch < 2; ch++) {
      const x = out.getChannelData(ch), rnd = rng(131 + ch); let a = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = rnd() * 2 - 1; a += lpA(1200, sr) * (w - a);
        x[i] = Math.tanh((a * 2.5 * Math.exp(-t / 0.012) + Math.sin(W * 85 * t) * Math.exp(-t / 0.05)) * 1.3);
      }
    }
    return out;
  },
  // The g-suit valve filling the bladders in a hard turn: a hiss swelling with the g
  renderGSuit(ctx) {
    const sr = ctx.sampleRate, n = Math.floor(sr * 1.6), out = ctx.createBuffer(2, n, sr);
    for (let ch = 0; ch < 2; ch++) {
      const x = out.getChannelData(ch), rnd = rng(151 + ch); let a = 0, b = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, w = rnd() * 2 - 1; a += lpA(3500, sr) * (w - a); b += lpA(700, sr) * (a - b);
        x[i] = (a - b) * (1 - Math.exp(-t / 0.08)) * Math.exp(-Math.max(0, t - 0.6) / 0.35);
      }
    }
    return out;
  },

  // the radar warning receiver (ALR-56C class) in the headset: tones, generated live
  // newThreat: three short beeps; launch: the missile-launch warble (two tones alternating 8 times a second) until
  // stopped; caution: the caution tone before the voice warning
  tone(ctx, bus, f, t0, d, g, type) {
    const o = ctx.createOscillator(), gn = ctx.createGain(); o.type = type || 'square'; o.frequency.value = f;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 3500;     // through the headset
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(g, t0 + 0.005);
    gn.gain.setValueAtTime(g, t0 + d - 0.01); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + d);
    o.connect(lp); lp.connect(gn); gn.connect(bus); o.start(t0); o.stop(t0 + d + 0.02);
  },
  newThreat(ctx, bus, t0) { for (let k = 0; k < 3; k++) this.tone(ctx, bus, 1250, t0 + k * 0.16, 0.09, 0.05); },
  launch(ctx, bus, t0, dur) {
    const o = ctx.createOscillator(), gn = ctx.createGain(), lp = ctx.createBiquadFilter(); o.type = 'square';
    for (let t = 0; t < dur; t += 0.125) { o.frequency.setValueAtTime(980, t0 + t); o.frequency.setValueAtTime(1470, t0 + t + 0.0625); }
    lp.type = 'lowpass'; lp.frequency.value = 3500;
    gn.gain.setValueAtTime(0.0001, t0); gn.gain.exponentialRampToValueAtTime(0.045, t0 + 0.01);
    gn.gain.setValueAtTime(0.045, t0 + dur - 0.02); gn.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(lp); lp.connect(gn); gn.connect(bus); o.start(t0); o.stop(t0 + dur + 0.02);
  },
  caution(ctx, bus, t0) { this.tone(ctx, bus, 880, t0, 0.18, 0.04, 'sine'); this.tone(ctx, bus, 660, t0 + 0.2, 0.25, 0.04, 'sine'); },
};

root.F15Snd = F15Snd;
if (typeof module !== 'undefined' && module.exports) module.exports = F15Snd;
})(typeof window !== 'undefined' ? window : globalThis);
