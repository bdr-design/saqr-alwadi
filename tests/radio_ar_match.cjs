// The radio in Arabic against the English, as heard: every line of both sets, in both languages, through the game's
// own set (Snd.transmit, rendered offline: FM for HUNTER, OPS, the crew and the tower, the intercom for the pilots and
// the warnings, as VOX has them), measured where the voice is. For each character, Arabic against English:
//   loudness (RMS, dB) within 1.5 dB; the energy inside the set's band (250 Hz to 3.5 kHz) as much; the voice's
//   brightness through it (spectral centroid) within a quarter; and every Arabic line within 3 dB of its character's
//   English loudness (none quiet or hot), none clipped by the set harder than the English;
//   every line of both sets voiced in Arabic, so that a call goes all in Arabic.
// Listening: each character's first call, English then Arabic, through the set, into tests/out/radio_ar_vs_en_*.wav,
// and the Arabic talk-on, check-in and tower calls into tests/out/radio_ar_*.wav.
// node tests/radio_ar_match.cjs
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
const SR = 24000;
// (nothing to match until the owner's Arabic recordings are in: tools/make_radio_ar.py writes the set only then)
if (!fs.existsSync(S + '/data/radio_ar.json') && !fs.existsSync(S + '/data/radio_ar_f15.json')) { console.log('no Arabic radio voiced yet: nothing to match'); process.exit(0); }
const wav = (file, x) => { const n = x.length, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(SR, 24); b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, b); };
// a power spectrum of 1024-sample frames (radix-2 FFT, Hann), summed
function spectrum(x) {
  const N = 1024, P = new Float64Array(N / 2), re = new Float64Array(N), im = new Float64Array(N);
  for (let s = 0; s + N <= x.length; s += N / 2) {
    for (let j = 0; j < N; j++) { re[j] = x[s + j] * (0.5 - 0.5 * Math.cos(2 * Math.PI * j / N)); im[j] = 0; }
    for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= N; len <<= 1) { const a = -2 * Math.PI / len;
      for (let i = 0; i < N; i += len) for (let k = 0; k < len / 2; k++) { const c = Math.cos(a * k), sn = Math.sin(a * k), u = i + k, v = u + len / 2;
        const tr = re[v] * c - im[v] * sn, ti = re[v] * sn + im[v] * c; re[v] = re[u] - tr; im[v] = im[u] - ti; re[u] += tr; im[u] += ti; } }
    for (let k = 1; k < N / 2; k++) P[k] += re[k] * re[k] + im[k] * im[k];
  }
  return P;
}
function measure(x) {
  const P = spectrum(x), hz = k => k * SR / 1024; let all = 0, band = 0, c = 0;
  for (let k = 1; k < P.length; k++) { all += P[k]; c += P[k] * hz(k); if (hz(k) >= 250 && hz(k) < 3500) band += P[k]; }
  let ss = 0, hot = 0; for (const v of x) { ss += v * v; if (Math.abs(v) > 0.97) hot++; }
  return { rms: 10 * Math.log10(ss / x.length + 1e-12), band: band / all, centroid: c / all, hot: hot / x.length };
}
const median = a => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : NaN; };
(async () => {
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + (typeof v === 'string' ? v : JSON.stringify(v)) : '')); if (!ok) fails.push(w); };
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport: { width: 844, height: 390 } })).newPage();
  await page.addInitScript(() => { try { localStorage.setItem('saqr.map', 'theater'); localStorage.setItem('saqr.ac', 'f15'); localStorage.setItem('saqr.radio', 'ar'); localStorage.setItem('saqr.sound', '1'); } catch (_) {} });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
  await page.evaluate(() => document.querySelector('#btnStart').click());
  await page.waitForFunction(() => { const g = window.__saqr; return g.bank.d && g.bankJ.d && g.bankA.d && g.bankAJ.d; }, null, { timeout: 120000 });
  // every line of both sets in Arabic
  const cover = await page.evaluate(() => { const g = window.__saqr, miss = [];
    for (const R of [g.RADIO, g.RADIO_J]) for (const k in R.clips) if (!(g.bankA.at[k] || g.bankAJ.at[k])) miss.push(k);
    return { lines: Object.keys(g.RADIO.clips).length + Object.keys(g.RADIO_J.clips).length, miss }; });
  check('every line of both sets voiced in Arabic', !cover.miss.length, cover.miss.length ? cover.miss.slice(0, 12) : cover.lines + ' lines');
  // the net each speaks on (VOX): the key's first letter
  const NET = { h: 'fm', o: 'fm', c: 'fm', t: 'fm', p: 'ics', f: 'ics', w: 'ics' };
  const keys = await page.evaluate(() => { const g = window.__saqr; return [...Object.keys(g.RADIO.clips), ...Object.keys(g.RADIO_J.clips)]; });
  // f.r.: the jet's pilot on the radio, as the game sends them (jetfm)
  const netOf = k => k.startsWith('f.r.') || k === 'f.rtb' ? 'fm' : NET[k[0]];
  // one line through the set, offline, in either language: its voice part (after the key, before the tail)
  const render = (ids, lang, net, bed) => page.evaluate(async ([ids, lang, net, bed, SR]) => {
    const g = window.__saqr, Snd = g.Snd; g.S.radioAr = lang === 'ar';
    const clip = g.radioClip(ids); if (!clip) return null;
    const oc = new OfflineAudioContext(1, Math.ceil(SR * (clip.d.length / clip.sr + 1.2)), SR), keep = [Snd.ctx, Snd.dry, Snd.on];
    Snd.ctx = oc; Snd.dry = oc.destination; Snd.on = true;
    let d; try { d = Snd.transmit(clip, net, bed); } finally { Snd.ctx = keep[0]; Snd.dry = keep[1]; Snd.on = keep[2]; }
    const x = (await oc.startRendering()).getChannelData(0), tv = 0.03 + (net === 'fm' ? 0.24 : 0.05);
    const all = Array.from(x.subarray(0, Math.floor((d + 0.05) * SR)), v => Math.round(v * 30000) / 30000);
    return { all, voice: [Math.floor(tv * SR), Math.floor((tv + clip.d.length / clip.sr) * SR)], dur: clip.d.length / clip.sr };
  }, [ids, lang, net, bed, SR]);
  const by = {};
  for (const k of keys) {
    const net = netOf(k), who = k.startsWith('f.r.') || k === 'f.rtb' ? 'f.r' : k[0];
    const r = {};
    for (const lang of ['en', 'ar']) { const o = await render([k], lang, net, false); r[lang] = o && Object.assign(measure(o.all.slice(o.voice[0], o.voice[1])), { dur: o.dur }); }
    if (!r.en || !r.ar) { check('line rendered in both: ' + k, false); continue; }
    (by[who] = by[who] || []).push({ k, en: r.en, ar: r.ar });
  }
  const NAME = { h: 'HUNTER', o: 'OPS', c: 'crew', t: 'tower', p: 'Sahm pilot', f: 'ZF-25 pilot (intercom)', 'f.r': 'ZF-25 pilot (radio)', w: 'warnings' };
  for (const who in by) {
    const L = by[who], m = (lang, q) => median(L.map(l => l[lang][q]));
    const en = { rms: m('en', 'rms'), band: m('en', 'band'), centroid: m('en', 'centroid'), hot: m('en', 'hot') }, ar = { rms: m('ar', 'rms'), band: m('ar', 'band'), centroid: m('ar', 'centroid'), hot: m('ar', 'hot') };
    const odd = L.filter(l => Math.abs(l.ar.rms - en.rms) > 3).map(l => l.k + ' ' + (l.ar.rms - en.rms).toFixed(1) + ' dB');
    const sum = { n: L.length, rmsEN: +en.rms.toFixed(1), rmsAR: +ar.rms.toFixed(1), bandEN: +en.band.toFixed(3), bandAR: +ar.band.toFixed(3),
      centroidEN: Math.round(en.centroid), centroidAR: Math.round(ar.centroid), hotEN: +en.hot.toFixed(4), hotAR: +ar.hot.toFixed(4), lengthARtoEN: +median(L.map(l => l.ar.dur / l.en.dur)).toFixed(2) };
    console.log(NAME[who].padEnd(22), JSON.stringify(sum));
    check(NAME[who] + ': as loud as the English through the set (within 1.5 dB)', Math.abs(ar.rms - en.rms) <= 1.5, (ar.rms - en.rms).toFixed(2) + ' dB');
    check(NAME[who] + ': in the set\'s band as much as the English', ar.band >= en.band - 0.03, ar.band.toFixed(3) + ' / ' + en.band.toFixed(3));
    check(NAME[who] + ': as bright through the set (centroid within a quarter)', ar.centroid / en.centroid > 0.75 && ar.centroid / en.centroid < 1.25, Math.round(ar.centroid) + ' / ' + Math.round(en.centroid) + ' Hz');
    check(NAME[who] + ': no line quiet or hot (each within 3 dB of the English)', !odd.length, odd.length ? odd : 'all');
    check(NAME[who] + ': clipped no harder than the English', ar.hot <= en.hot + 0.01, ar.hot.toFixed(4) + ' / ' + en.hot.toFixed(4));
  }
  // to listen: each character's first line, English then Arabic, through the set; and whole Arabic calls
  const listen = [['hunter', ['h.call', 'h.t.TECH', 'h.d.300', 'h.dir.NORTHEAST', 'h.mark'], 'fm', true], ['jet_checkin', ['f.r.check.15'], 'fm', false],
    ['ops', ['o.j.go'], 'fm', false], ['tower', ['t.clear'], 'fm', false], ['pilot', ['f.tally'], 'ics', false], ['apache_pilot', ['p.fire', 'p.clock.3'], 'ics', false],
    ['warning', ['w.alt'], 'ics', false], ['jet_hunter', ['h.j.go'], 'fm', true], ['crew', ['c.rearm'], 'fm', false]];
  for (const [name, ids, net, bed] of listen) {
    const en = await render(ids, 'en', net, bed), ar = await render(ids, 'ar', net, bed);
    wav(`${S}/tests/out/radio_ar_vs_en_${name}.wav`, [...en.all, ...new Array(Math.floor(SR * 0.6)).fill(0), ...ar.all]);
    wav(`${S}/tests/out/radio_ar_${name}.wav`, ar.all);
  }
  check('no page errors', !errs.length, errs.slice(0, 3));
  await browser.close();
  console.log(fails.length ? 'FAILED: ' + fails.join('; ') : 'all passed');
  process.exit(fails.length ? 1 : 0);
})();
