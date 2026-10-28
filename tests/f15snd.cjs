// F-15SA sound previews, rendered offline in Chromium from src/f15snd.js, the flight model (src/f15sa.js) and the
// recorded voices (sprites/radio_f15.mp3): what the back seat hears, start to finish, into tests/out/f15_*.wav.
//   cruise:  the orbit at 450 knots, then the afterburners for six seconds, then back to the orbit
//   attack:  check-in, the pilot asks, the run, the release, time of fall, splash, HUNTER's assessment
//   threat:  a radar spike, a missile launch, flares and a hard break, the missile defeated
//   warning: the jet's voice warnings
// The radio chain is the game's (Snd.transmit: FM through the set, the intercom through the helmet microphone).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const OUT = S + '/tests/out'; fs.mkdirSync(OUT, { recursive: true });
const which = process.argv[2] ? process.argv[2].split(',') : ['cruise', 'attack', 'threat', 'warning'];
const page_js = `
const SR = 48000;
async function voices() {
  const meta = await (await fetch('/data/radio_f15.json')).json();
  const raw = await (await fetch('/sprites/radio_f15.mp3')).arrayBuffer();
  const ac = new OfflineAudioContext(1, 1, meta.sr), all = await ac.decodeAudioData(raw), d = all.getChannelData(0);
  const clips = {};
  for (const k in meta.clips) { const [t, l] = meta.clips[k], a = Math.floor(t * all.sampleRate), b = a + Math.floor(l * all.sampleRate);
    const x = d.slice(a, b); let pk = 0; for (const v of x) pk = Math.max(pk, Math.abs(v)); clips[k] = { d: x, sr: all.sampleRate, pk: pk || 1 }; }
  return clips;
}
// the game's radio set (Snd.carrier and Snd.transmit), FM or the intercom, at t0; returns when it ends
function transmit(c, dry, noise, clip, net, t0) {
  const fm = net === 'fm', n = clip.d.length, buf = c.createBuffer(1, n, clip.sr); buf.getChannelData(0).set(clip.d);
  const dur = n / clip.sr, tv = t0 + (fm ? 0.24 : 0.05), tEnd = tv + dur + (fm ? 0.12 : 0.04);
  const mic = c.createGain();
  const v = c.createBufferSource(); v.buffer = buf; const vg = c.createGain(); vg.gain.value = 0.9 / clip.pk; v.connect(vg); vg.connect(mic); v.start(tv);
  const f = (type, fr, q, gain) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = fr; b.Q.value = q; if (gain) b.gain.value = gain; return b; };
  const chain = fm ? [f('highpass', 300, 0.7), f('highpass', 300, 0.7), f('lowpass', 2800, 0.7), f('lowpass', 2800, 0.7), f('peaking', 1800, 1, 6)]
    : [f('highpass', 190, 0.7), f('lowpass', 4600, 0.7), f('peaking', 2600, 0.9, 3)];
  const drive = c.createGain(); drive.gain.value = fm ? 3.2 : 1.6;
  const ws = c.createWaveShaper(); ws.curve = Float32Array.from({ length: 1024 }, (_, i) => Math.tanh((i / 511.5 - 1) * 2.5) / Math.tanh(2.5)); ws.oversample = '2x';
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -26; comp.knee.value = 4; comp.ratio.value = 10; comp.attack.value = 0.002; comp.release.value = 0.1;
  const out = c.createGain(); out.gain.value = fm ? 0.8 : 0.9;
  const post = fm ? [f('highpass', 250, 0.7), f('lowpass', 3300, 0.7), f('lowpass', 3300, 0.7)] : [f('lowpass', 5500, 0.7)];
  [mic, ...chain, drive, ws, comp, ...post, out].reduce((a, b) => (a.connect(b), b)).connect(dry);
  // the carrier: FM key click, hiss, squelch tail; the intercom's hot mic
  const nn = c.createBufferSource(); nn.buffer = noise; nn.loop = true;
  const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = fm ? 2100 : 950; bp.Q.value = fm ? 0.45 : 0.7;
  const g = c.createGain(); g.gain.setValueAtTime(0.0001, t0); nn.connect(bp); bp.connect(g); g.connect(dry); nn.start(t0);
  if (fm) {
    g.gain.exponentialRampToValueAtTime(0.05, t0 + 0.012); g.gain.exponentialRampToValueAtTime(0.012, t0 + 0.12);
    const k = c.createBufferSource(); k.buffer = noise; const kf = c.createBiquadFilter(); kf.type = 'lowpass'; kf.frequency.value = 3200;
    const kg = c.createGain(); kg.gain.setValueAtTime(0.22, t0); kg.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.008);
    k.connect(kf); kf.connect(kg); kg.connect(dry); k.start(t0); k.stop(t0 + 0.02);
    g.gain.setValueAtTime(0.012, tEnd); g.gain.linearRampToValueAtTime(0.13, tEnd + 0.01); g.gain.setValueAtTime(0.13, tEnd + 0.13);
    g.gain.exponentialRampToValueAtTime(0.0001, tEnd + 0.2); bp.frequency.setValueAtTime(3000, tEnd); nn.stop(tEnd + 0.22);
  } else { g.gain.exponentialRampToValueAtTime(0.012, t0 + 0.05); g.gain.setValueAtTime(0.012, tEnd); g.gain.exponentialRampToValueAtTime(0.0001, tEnd + 0.06); nn.stop(tEnd + 0.08); }
  return tEnd + (fm ? 0.2 : 0.06);
}
// the jet's voice warnings: straight into the headset
function warn(c, dry, clip, t0) {
  const buf = c.createBuffer(1, clip.d.length, clip.sr); buf.getChannelData(0).set(clip.d);
  const s = c.createBufferSource(); s.buffer = buf; const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 250;
  const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 4000; const g = c.createGain(); g.gain.value = 0.55 / clip.pk;
  s.connect(hp); hp.connect(lp); lp.connect(g); g.connect(dry); s.start(t0); return t0 + clip.d.length / clip.sr;
}
async function render(name) {
  const clips = await voices();
  const dur = { cruise: 26, attack: 96, threat: 24, warning: 12, ground: 100 }[name];
  const c = new OfflineAudioContext(2, SR * dur, SR);
  const comp = c.createDynamicsCompressor(); comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 3; comp.connect(c.destination);
  const dry = c.createGain(); dry.gain.value = 0.95; dry.connect(comp);
  const noise = c.createBuffer(1, SR * 3, SR); { const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; }
  const snd = F15Snd; snd.bufs = null;
  const m = snd.start(c, dry);
  const U = F15SA.U, ground = name === 'ground';
  // the ground preview starts on the runway with the engines at idle; the rest airborne in the orbit
  const ac = new F15SA({ loadout: 'cas', fuel: ground ? 0.5 : 0.7, turb: 1, seed: 3 });
  const h = 20000 * U.FT;
  const rwy = { n: 0, e: 0, psi: 0, elev: 0 };
  if (ground) ac.place({ psi: 0, onGround: true });
  else ac.place({ n: -8000, e: 0, h, V: F15SA.tasFromCas(330 * U.KT, F15SA.atmos(h, 0)), psi: Math.PI / 2 });
  const P = new F15SA.Pilot(ac);
  if (ground) P.set('takeoff', { rwy, h: 1200, kcas: 300 });
  else P.set('orbit', { c: { n: 0, e: 0 }, R: 7000, dir: -1, h, kcas: 330 }, { bank: 45 * U.D2R, roll: 30 * U.D2R, nz: 3 });
  const rel = { b: snd.renderRelease(c, false), mav: snd.renderMaverick(c), fl: snd.renderFlare(c), gs: snd.renderGSuit(c) };
  const play = (buf, t, g) => { const s = c.createBufferSource(); s.buffer = buf; const gn = c.createGain(); gn.gain.value = g; s.connect(gn); gn.connect(dry); s.start(t); };
  const say = (k, t, net) => clips[k] ? transmit(c, dry, noise, clips[k], net || 'ics', t) : t;
  const ev = [], at = (t, f) => ev.push([t, f]);
  let gsuit = 0;
  if (name === 'cruise') {
    at(9, () => { P.mode = 'direct'; ac.setThrottle(2); ac.fcs.nz = 1.5; ac.fcs.p = 0; });
    at(15, () => { P.set('orbit', { c: { n: 0, e: 0 }, R: 7000, dir: -1, h, kcas: 330 }); });
  } else if (name === 'attack') {
    let t = 1;
    t = say('o.j.check', t, 'fm') + 1.2;
    t = say('f.r.check', t, 'fm') + 0.8;
    t = say('h.j.check', t, 'fm') + 2;
    t = say('f.tally', t) + 2.5;
    // (the officer answers: CONSENT on the UFC)
    t = say('f.copyin', t) + 0.5;
    const tTurn = t;
    at(tTurn, () => P.set('line', { p: { n: 0, e: 0 }, chi: Math.PI, h, kcas: 420 }, { bank: 60 * U.D2R, roll: 60 * U.D2R, nz: 4 }));
    t = say('f.r.in.WEST', t + 8, 'fm') + 0.6;
    t = say('h.j.hot', t, 'fm') + 1.5;
    t = say('f.wings', t) + 3;
    t = say('f.30', t) + 15;
    t = say('f.10', t) + 5;
    const tRel = say('f.count', t) + 0.05;
    play(rel.b, tRel, 0.9);
    say('f.bombs', tRel + 0.5);
    at(tRel + 2, () => P.set('orbit', { c: { n: 0, e: 0 }, R: 7000, dir: -1, h, kcas: 330 }, { bank: 60 * U.D2R, roll: 60 * U.D2R, nz: 4 }));
    say('f.off', tRel + 2.2);
    say('f.r.off', tRel + 4.5, 'fm');
    say('f.tof.30', tRel + 8);
    say('f.lase', tRel + 18);
    say('f.splash', tRel + 30);
    say('h.j.good', tRel + 34, 'fm');
    say('f.shack', tRel + 38.5);
  } else if (name === 'threat') {
    snd.newThreat(c, dry, 1);
    say('f.spike', 1.6); say('f.clock.3', 2.3);
    snd.launch(c, dry, 5, 7);
    say('f.launch', 5.3);
    say('f.flaresL', 6.2);
    for (let k = 0; k < 4; k++) { play(rel.fl, 6.4 + k * 0.35, 0.5); play(rel.fl, 6.55 + k * 0.35, 0.45); }
    at(6.3, () => { P.mode = 'direct'; ac.setThrottle(2); ac.fcs.nz = 6.5; ac.fcs.p = 0; });
    at(6.3, () => { ac.fcs.p = -2.5; }); at(6.8, () => { ac.fcs.p = 0; });
    at(13, () => P.set('orbit', { c: { n: 0, e: 0 }, R: 7000, dir: -1, h, kcas: 330 }));
    say('f.defeat', 13.5);
  } else if (name === 'warning') {
    let t = 0.8;
    for (const k of ['w.alt', 'w.overg', 'w.bingo', 'w.fireL']) { snd.caution(c, dry, t); t = warn(c, dry, clips[k], t + 0.5) + 1.2; }
  } else if (name === 'ground') {
    // a full takeoff (idle run-up, the ground roll, lift-off, gear up), then set up on short final and land
    // (gear down, the glide, the flare, touchdown, the roll-out slowing to a stop): the whole of f15snd's ground set
    at(38, () => { ac.place({ n: -1500, e: 0, h: 86, V: 78, gear: 0, flap: 0, gamma: -2.75 * U.D2R, psi: 0 }); P.set('land', { rwy }); });
  }
  ev.sort((a, b) => a[0] - b[0]);
  // fly: the model at 100 Hz, the mix updated at 20 Hz, the g-suit when the pull passes 3 g
  for (let i = 0, tick = 0; i < dur * 100; i++) {
    const tt = i / 100;
    while (ev.length && ev[0][0] <= tt) ev.shift()[1]();
    if (P.mode === 'direct') ac.step(0.01); else P.fly(0.01);
    if (i % 5 === 0) {
      const o = ac.o; snd.update(c, m, o, ac.eng, tt);
      if (o.nz > 3 && tt > gsuit) { play(rel.gs, tt, Math.min((o.nz - 2.5) * 0.12, 0.45)); gsuit = tt + 1.4; }
    }
  }
  const buf = await c.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1), n = L.length, pcm = new Int16Array(n * 2);
  let pk = 0; for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(L[i]), Math.abs(R[i]));
  const k = pk > 0.98 ? 0.98 / pk : 1;
  for (let i = 0; i < n; i++) { pcm[2 * i] = L[i] * k * 32767; pcm[2 * i + 1] = R[i] * k * 32767; }
  let s = ''; const b8 = new Uint8Array(pcm.buffer); for (let i = 0; i < b8.length; i += 32768) s += String.fromCharCode.apply(null, b8.subarray(i, i + 32768));
  return { b64: btoa(s), pk, sr: SR };
}
`;
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage();
  p.on('pageerror', e => console.log('ERR', e.message)); p.on('console', m => { if (m.type() === 'error') console.log('CONSOLE', m.text()); });
  await p.route('**/*', r => { const u = new URL(r.request().url()); if (u.host !== 'test') return r.abort();
    if (u.pathname === '/') return r.fulfill({ body: '<!doctype html><meta charset=utf-8><body>', contentType: 'text/html' });
    const f = path.join(S, u.pathname); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' }); });
  await p.goto('http://test/');
  await p.addScriptTag({ path: S + '/src/f15sa.js' }); await p.addScriptTag({ path: S + '/src/f15snd.js' }); await p.addScriptTag({ content: page_js });
  for (const name of which) {
    const r = await p.evaluate(n => render(n), name);
    const pcm = Buffer.from(r.b64, 'base64'), hdr = Buffer.alloc(44);
    hdr.write('RIFF', 0); hdr.writeUInt32LE(36 + pcm.length, 4); hdr.write('WAVEfmt ', 8); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20); hdr.writeUInt16LE(2, 22);
    hdr.writeUInt32LE(r.sr, 24); hdr.writeUInt32LE(r.sr * 4, 28); hdr.writeUInt16LE(4, 32); hdr.writeUInt16LE(16, 34); hdr.write('data', 36); hdr.writeUInt32LE(pcm.length, 40);
    fs.writeFileSync(`${OUT}/f15_${name}.wav`, Buffer.concat([hdr, pcm]));
    console.log(name, 'peak', r.pk.toFixed(3), (pcm.length / 4 / r.sr).toFixed(1) + ' s');
  }
  await b.close();
})();
