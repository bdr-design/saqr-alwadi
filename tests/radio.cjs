// The radio and the sound across leaving the app. The recorded English voices (sprites/radio.mp3) load and a call is
// put together from its pieces; lines on one net wait their turn; the set's sound is rendered
// offline and measured (FM: nothing under 250 Hz or over 3.5 kHz to speak of; HUNTER's fight in his handset); the
// renders go to tests/out/radio_*.wav. Then leaving and coming back: the app's sleep and wake build a fresh context
// that runs, with the rotor; and a context that dies by itself (clock stopped) is caught and rebuilt.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
const wav = (file, ch, sr) => {
  const n = ch[0].length, b = Buffer.alloc(44 + n * ch.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * ch.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20);
  b.writeUInt16LE(ch.length, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * ch.length * 2, 28); b.writeUInt16LE(ch.length * 2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * ch.length * 2, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch.length; c++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(ch[c][i] * 32767))), 44 + (i * ch.length + c) * 2);
  fs.writeFileSync(file, b);
};
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 })).newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errs.push(m.text()); });
  // the app's handler: a voice of glottal pulses through two formants, in syllables, as long as the text
  await page.addInitScript(() => {
    window.__voiceCalls = [];
    const voice = { postMessage: async m => {
      window.__voiceCalls.push(m);
      const sr = 22050, n = Math.floor(sr * (0.4 + m.text.length * 0.06)), d = new Float32Array(n);
      let y1 = 0, y2 = 0, z1 = 0, z2 = 0, ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / sr, f0 = 120 * m.pitch * (1 + 0.1 * Math.sin(t * 3)); ph += f0 / sr; const pulse = ph >= 1 ? (ph -= 1, 1) : 0;
        const r = (f, bw) => [2 * Math.exp(-Math.PI * bw / sr) * Math.cos(2 * Math.PI * f / sr), -Math.exp(-2 * Math.PI * bw / sr)];
        const [a1, b1] = r(700, 90), [a2, b2] = r(1500 + 400 * Math.sin(t * 7), 110);
        const v = pulse + a1 * y1 + b1 * y2; y2 = y1; y1 = v; const w = pulse + a2 * z1 + b2 * z2; z2 = z1; z1 = w;
        d[i] = (v * 0.02 + w * 0.015) * Math.max(0, Math.sin(Math.PI * t * 4.5)) ** 0.6;
      }
      const u8 = new Uint8Array(d.buffer); let s = ''; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192));
      return { sr, pcm: btoa(s) };
    } };
    window.webkit = { messageHandlers: { voice } };
  });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, p); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 120000 });
  const fails = [], check = (w, ok) => { if (!ok) fails.push(w); };
  const i = await page.evaluate(() => window.__saqr.MISSIONS.findIndex(m => m.id === 'tic'));
  // (the missions are on the menu's operations tab, the start on its home tab)
  await page.click('#nTabs [data-scr="ops"]'); await page.click(`#mList .mc:not(.camp) >> nth=${i}`); await page.click('#nTabs [data-scr="home"]'); await page.click('#btnStart'); await page.waitForTimeout(800);
  await page.evaluate(() => window.__saqr.Snd.ready);
  await page.waitForFunction(() => !!window.__saqr.bank.d, null, { timeout: 60000 });
  const st0 = await page.evaluate(() => { const g = window.__saqr; return { native: g.Snd.native, on: g.Snd.on, state: g.Snd.ctx.state, engine: !!g.Snd.engine }; });
  console.log('start', JSON.stringify(st0));
  check('the app\'s voice is used, the sound runs', st0.native && st0.on && st0.state === 'running' && st0.engine);

  // two lines from HUNTER and one from the pilot: each speaker's voice; HUNTER's second waits for his first.
  // The scene is frozen first and the mission's own calls let through.
  await page.evaluate(() => { window.__saqr.S.frozen = true; });
  await page.waitForTimeout(12000);
  const q = await page.evaluate(async () => {
    window.__voiceCalls.length = 0;
    const g = window.__saqr, Snd = g.Snd, sent = [], t0 = performance.now(), tx = Snd.transmit.bind(Snd);
    Snd.transmit = (clip, net, bed) => { const d = tx(clip, net, bed); sent.push({ net, bed: !!bed, at: performance.now() - t0, d }); return d; };
    g.radio('A', 'a', 'hunter', ['h.call', 'h.t.TECH', 'h.d.300', 'h.dir.NORTHEAST', 'h.mark']); g.radio('B', 'b', 'hunter', ['h.halt']); g.radio('C', 'c', 'pilot', ['p.fire', 'p.clock.3']);
    await new Promise(r => setTimeout(r, 16000));
    Snd.transmit = tx;
    const R = g.RADIO || {}, sum = ids => ids.reduce((a, k) => a + R.clips[k][1], 0);
    return { sent, talkOn: +sum(['h.call', 'h.t.TECH', 'h.d.300', 'h.dir.NORTHEAST', 'h.mark']).toFixed(2), clipLen: +(g.radioClip(['h.call', 'h.t.TECH', 'h.d.300', 'h.dir.NORTHEAST', 'h.mark']).d.length / g.bank.sr).toFixed(2) };
  });
  console.log('nets', JSON.stringify(q));
  const fm = q.sent.filter(s => s.net === 'fm'), ics = q.sent.filter(s => s.net === 'ics');
  check('a call is its pieces, joined', Math.abs(q.clipLen - q.talkOn) < 0.8);
  check('HUNTER on FM with his fight, the pilot on the intercom', fm.length === 2 && fm[0].bed && ics.length === 1 && !ics[0].bed);
  check('the second FM line waits for the first', fm.length === 2 && fm[1].at >= fm[0].at + fm[0].d * 1000);
  check('the intercom does not wait for the radio', ics.length === 1 && ics[0].at < fm[0].at + fm[0].d * 1000);

  // the set, rendered offline: where the energy is, against the rotor
  const R = await page.evaluate(async () => {
    const Snd = window.__saqr.Snd, sr = 44100, out = {};
    const clip = window.__saqr.radioClip(['h.call', 'h.t.TECH', 'h.d.300', 'h.dir.NORTH', 'h.mark']);
    const band = (x, lo, hi) => { // energy share in [lo, hi) Hz, from a plain DFT of 2048-sample frames
      let inB = 0, all = 0; const N = 2048;
      for (let s = 0; s + N < x.length; s += N * 3) for (let k = 1; k < N / 2; k += 3) { let re = 0, im = 0; for (let j = 0; j < N; j++) { const a = 2 * Math.PI * k * j / N, w = x[s + j] * (0.5 - 0.5 * Math.cos(2 * Math.PI * j / N)); re += w * Math.cos(a); im -= w * Math.sin(a); }
        const e = re * re + im * im, f = k * sr / N; all += e; if (f >= lo && f < hi) inB += e; }
      return inB / all; };
    const rms = x => Math.sqrt(x.reduce((a, v) => a + v * v, 0) / x.length);
    for (const [name, net, bed] of [['hunter', 'fm', true], ['ops', 'fm', false], ['pilot', 'ics', false]]) {
      const oc = new OfflineAudioContext(2, sr * 7, sr), keep = [Snd.ctx, Snd.dry, Snd.on];
      Snd.ctx = oc; Snd.dry = oc.destination; Snd.on = true;
      const d = Snd.transmit(clip, net, bed);
      Snd.ctx = keep[0]; Snd.dry = keep[1]; Snd.on = keep[2];
      const buf = await oc.startRendering(), x = buf.getChannelData(0).slice(0, Math.floor((d + 0.1) * sr));
      const mid = x.slice(Math.floor(0.45 * sr), Math.floor((d - 0.4) * sr));   // the voice, not the key or the tail
      out[name] = { d: +d.toFixed(2), low: +band(mid, 0, 250).toFixed(3), lowMid: +band(mid, 150, 290).toFixed(4), high: +band(mid, 3500, 22050).toFixed(3), rms: +rms(mid).toFixed(3), pcm: Array.from(x, v => Math.round(v * 3000) / 3000) };
    }
    const r = Snd.rotorBuf.getChannelData(0); out.rotor = +(rms(r) * 0.42).toFixed(3);
    out.clip = clip.d.length / clip.sr;
    return out;
  });
  for (const k of ['hunter', 'ops', 'pilot']) { wav(`${S}/tests/out/radio_${k}.wav`, [Float32Array.from(R[k].pcm)], 44100); delete R[k].pcm; }
  console.log('set', JSON.stringify(R));
  check('FM: the narrow band', R.ops.low < 0.05 && R.ops.high < 0.08);
  check('HUNTER\'s fight is in his handset, still through the set', R.hunter.rms > R.ops.rms * 0.9 && R.hunter.low < 0.08);
  check('the intercom is wider than the radio', R.pilot.lowMid > R.ops.lowMid * 2);
  check('the transmission outlasts the voice by the key and the tail', R.ops.d > R.clip + 0.3 && R.pilot.d < R.ops.d);
  check('voices heard over the rotor', R.ops.rms > R.rotor * 0.8 && R.pilot.rms > R.rotor * 0.8);

  // leaving the app and coming back: sleep, then wake builds a fresh context that runs
  const life = await page.evaluate(async () => {
    const Snd = window.__saqr.Snd, old = Snd.ctx, wait = ms => new Promise(r => setTimeout(r, ms));
    window.__audioSleep(); await wait(2500);   // inactive but still visible: stays asleep
    const asleep = { stale: Snd.stale, state: old.state, same: Snd.ctx === old };
    window.__audioWake(); await wait(600);
    const t1 = Snd.ctx.currentTime; await wait(500);
    const back = { fresh: Snd.ctx !== old, state: Snd.ctx.state, moving: Snd.ctx.currentTime > t1, engine: !!Snd.engine, oldClosed: old.state === 'closed' };
    // a context that dies on its own: the watch rebuilds it without a touch
    const mid = Snd.ctx; await mid.suspend(); await wait(4200);
    const healed = { fresh: Snd.ctx !== mid, state: Snd.ctx.state };
    // and once it runs again, no further rebuilds
    const now = Snd.ctx; await wait(3500);
    return { asleep, back, healed, steady: Snd.ctx === now };
  });
  console.log('life', JSON.stringify(life));
  check('asleep while away', life.asleep.stale && life.asleep.state === 'suspended' && life.asleep.same);
  check('back: a fresh running context with the rotor', life.back.fresh && life.back.state === 'running' && life.back.moving && life.back.engine && life.back.oldClosed);
  check('a dead context is caught and rebuilt', life.healed.fresh && life.healed.state === 'running');
  check('a running context is left alone', life.steady);
  check('no page errors', !errs.length);
  if (errs.length) console.log(errs.join('\n'));
  await browser.close();
  console.log(fails.length ? 'FAIL: ' + fails.join('; ') : 'ALL OK');
  process.exit(fails.length ? 1 : 0);
})();
