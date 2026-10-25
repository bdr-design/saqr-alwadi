// renders the Apache cabin sound to tests/out/apache_rotor.wav: 16 s, load rising in a turn and easing off
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' }); const f = path.join(S, p); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  const b64 = await page.evaluate(() => {
    const Snd = window.__saqr.Snd; Snd.init();
    const A = Snd.rotorBuf, B = Snd.slapBuf, sr = A.sampleRate, n = sr * 16, L = A.length;
    const out = new Int16Array(n * 2);
    for (let ch = 0; ch < 2; ch++) {
      const a = A.getChannelData(ch), b = B.getChannelData(ch);
      for (let i = 0; i < n; i++) {
        const t = i / sr, load = 1 + 0.12 * Math.max(0, Math.sin(Math.PI * (t - 4) / 8)) * (t > 4 && t < 12 ? 1 : 0);
        const g = Math.min(0.6, 0.1 + (load - 1) * 2.2), fade = Math.min(1, t / 0.5, (16 - t) / 0.5);
        const v = (a[i % L] + b[i % L] * g) * 0.42 * 1.6 * fade;
        out[i * 2 + ch] = Math.max(-32767, Math.min(32767, Math.round(Math.tanh(v) * 32767)));
      }
    }
    const hdr = new DataView(new ArrayBuffer(44)), w = (o, s) => [...s].forEach((c, i) => hdr.setUint8(o + i, c.charCodeAt(0)));
    w(0, 'RIFF'); hdr.setUint32(4, 36 + out.byteLength, true); w(8, 'WAVE'); w(12, 'fmt '); hdr.setUint32(16, 16, true); hdr.setUint16(20, 1, true); hdr.setUint16(22, 2, true);
    hdr.setUint32(24, sr, true); hdr.setUint32(28, sr * 4, true); hdr.setUint16(32, 4, true); hdr.setUint16(34, 16, true); w(36, 'data'); hdr.setUint32(40, out.byteLength, true);
    const bytes = new Uint8Array(44 + out.byteLength); bytes.set(new Uint8Array(hdr.buffer), 0); bytes.set(new Uint8Array(out.buffer), 44);
    let s = ''; for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 32768));
    return btoa(s);
  });
  fs.writeFileSync(S + '/tests/out/apache_rotor.wav', Buffer.from(b64, 'base64'));
  console.log('wrote', (Buffer.from(b64, 'base64').length / 1e6).toFixed(1), 'MB');
  await browser.close();
})();
