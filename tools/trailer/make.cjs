// The trailer, put together: the recorded shots (tools/trailer/shots.cjs) cut to 9:16 for TikTok / Instagram, the Arabic
// captions and the end card (drawn in the game's own font, IBM Plex Sans Arabic, so the letters join as they should),
// the game's sound for each shot, and the music bed (tools/trailer/music.py) under it.
//   node tools/trailer/make.cjs        ->  tests/out/trailer/saqr-trailer.mp4 (1080 x 1920, 30 fps)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(ROOT, 'tests', 'out', 'trailer'), W = 1080, H = 1920;
const SHOTS = [
  { name: '1-seat', secs: 7, caps: [{ at: 0.7, to: 6.4, big: 'أنت المدفعي', small: 'في المقعد الأمامي للأباتشي AH-64E' }] },
  { name: '2-hellfire', secs: 13, caps: [{ at: 1.6, to: 4.6, big: 'ثبّت على الهدف' }, { at: 5.0, to: 8.4, big: 'وأطلق الهيلفاير' }] },
  { name: '3-thermal', secs: 8, caps: [{ at: 0.5, to: 7.3, big: 'ليلًا', small: 'بالكاميرا الحرارية' }] },
  { name: '4-impact', secs: 11, caps: [{ at: 0.6, to: 5.0, big: 'من داخل القمرة', small: 'كل شاشة حيّة' }] },
  { name: '5-port', secs: 6, caps: [{ at: 0.5, to: 5.5, big: '4 خرائط · 24 مهمة', small: 'من الوادي إلى الميناء' }] },
];
const END = 5;
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });

// the game's font, from npm (cached)
function font() {
  const dir = path.join(OUT, 'fonts');
  if (!fs.existsSync(path.join(dir, 'package'))) {
    fs.mkdirSync(dir, { recursive: true });
    const meta = JSON.parse(execFileSync('curl', ['-s', 'https://registry.npmjs.org/@fontsource/ibm-plex-sans-arabic/latest']).toString());
    execFileSync('curl', ['-s', '-o', path.join(dir, 'f.tgz'), meta.dist.tarball]); execFileSync('tar', ['xzf', 'f.tgz'], { cwd: dir });
  }
  const f = (sub, w) => 'data:font/woff2;base64,' + fs.readFileSync(path.join(dir, 'package', 'files', `ibm-plex-sans-arabic-${sub}-${w}-normal.woff2`)).toString('base64');
  return ['arabic', 'latin'].flatMap(sub => [400, 600, 700].map(w => `@font-face{font-family:P;font-weight:${w};src:url(${f(sub, w)}) format('woff2');}`)).join('');
}
const CSS = () => `${font()}
  html,body{margin:0;width:${W}px;height:${H}px;background:transparent;font-family:P;direction:rtl;color:#fff}
  .cap{position:absolute;left:0;right:0;top:1130px;display:flex;flex-direction:column;align-items:center;gap:14px;text-align:center}
  .bar{width:120px;height:6px;border-radius:3px;background:#f2c94c;box-shadow:0 0 18px rgba(242,201,76,.6)}
  .big{font-weight:700;font-size:112px;line-height:1.1;text-shadow:0 4px 24px rgba(0,0,0,.85),0 0 4px rgba(0,0,0,.9)}
  .small{font-weight:600;font-size:48px;line-height:1.3;color:#f2f2ea;text-shadow:0 3px 16px rgba(0,0,0,.9),0 0 3px rgba(0,0,0,.9);padding:0 70px}
  .end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;text-align:center}
  .sim{display:inline-flex;gap:12px;align-items:center;padding:8px 22px;border-radius:10px;background:rgba(150,30,22,.75);border:2px solid rgba(255,120,104,.85);font-weight:700;font-size:40px;color:#ffd9d3}
  .sim i{font-style:normal;font-weight:600;font-size:30px;letter-spacing:.1em;color:#ffb3a8}
  .title{font-weight:700;font-size:170px;line-height:1.05;text-shadow:0 6px 40px rgba(0,0,0,.8)}
  .latin{font-weight:600;font-size:40px;letter-spacing:.35em;color:rgba(241,242,236,.8);direction:ltr}
  .soon{margin-top:40px;font-weight:700;font-size:96px;color:#f2c94c;text-shadow:0 0 30px rgba(242,201,76,.45)}
  .where{font-weight:600;font-size:52px;color:#f2f2ea}`;

(async () => {
  for (const s of SHOTS) if (!fs.existsSync(path.join(OUT, s.name, '00000.jpg')) || !fs.existsSync(path.join(OUT, s.name + '.wav'))) throw new Error('shot not recorded: ' + s.name);
  // captions and the end card as transparent pictures
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const css = CSS();
  const pic = async (file, inner) => { await page.setContent(`<html><head><style>${css}</style></head><body>${inner}</body></html>`); await page.evaluate(() => document.fonts.ready); await page.screenshot({ path: file, omitBackground: true }); };
  const esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  for (const s of SHOTS) for (const [i, c] of s.caps.entries())
    await pic(path.join(OUT, `cap-${s.name}-${i}.png`), `<div class="cap"><div class="bar"></div><div class="big">${esc(c.big)}</div>${c.small ? `<div class="small">${esc(c.small)}</div>` : ''}</div>`);
  await pic(path.join(OUT, 'end.png'), `<div class="end"><span class="sim">محاكاة<i>SIM</i></span><div class="title">صقر الوادي</div><div class="latin">SAQR AL-WADI · AH-64E</div><div class="soon">قريبًا</div><div class="where">على الآيفون</div></div>`);
  await browser.close();

  // each shot: the middle of the frame at 9:16, its captions faded in and out, a quick rise from black
  const parts = [];
  for (const s of SHOTS) {
    const args = ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(OUT, s.name, '%05d.jpg')];
    s.caps.forEach((c, i) => args.push('-loop', '1', '-framerate', '30', '-t', String(s.secs), '-i', path.join(OUT, `cap-${s.name}-${i}.png`)));
    let f = `[0:v]crop=ih*9/16:ih,scale=${W}:${H}:flags=lanczos,fade=t=in:st=0:d=0.25,setsar=1[v0]`;
    s.caps.forEach((c, i) => {
      f += `;[${i + 1}:v]format=rgba,fade=t=in:st=${c.at}:d=0.35:alpha=1,fade=t=out:st=${c.to - 0.35}:d=0.35:alpha=1[c${i}]`;
      f += `;[v${i}][c${i}]overlay=0:0:enable='between(t,${c.at},${c.to})'[v${i + 1}]`;
    });
    const file = path.join(OUT, `part-${s.name}.mp4`);
    run('ffmpeg', [...args, '-filter_complex', f, '-map', `[v${s.caps.length}]`, '-t', String(s.secs), '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', file]);
    parts.push(file);
  }
  // the end card: the last shot's final frame, blurred and darkened, slowly closer; the title fades in
  const last = SHOTS[SHOTS.length - 1], lastFrame = path.join(OUT, last.name, String(last.secs * 30 - 1).padStart(5, '0') + '.jpg');
  const endFile = path.join(OUT, 'part-end.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', '30', '-t', String(END), '-i', lastFrame, '-loop', '1', '-framerate', '30', '-t', String(END), '-i', path.join(OUT, 'end.png'),
    '-filter_complex', `[0:v]crop=ih*9/16:ih,scale=${W * 1.15}:${H * 1.15},zoompan=z='1+0.0008*on':d=1:s=${W}x${H}:fps=30,boxblur=24:2,eq=brightness=-0.22:saturation=0.6,setsar=1[bg];[1:v]format=rgba,fade=t=in:st=0.3:d=0.8:alpha=1[t];[bg][t]overlay=0:0,fade=t=out:st=${END - 0.6}:d=0.6[v]`,
    '-map', '[v]', '-t', String(END), '-r', '30', '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', endFile]);
  parts.push(endFile);
  fs.writeFileSync(path.join(OUT, 'parts.txt'), parts.map(p => `file '${p}'`).join('\n'));
  const video = path.join(OUT, 'video.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'parts.txt'), '-c', 'copy', video]);

  // sound: the shots' own sound one after another, the rotor dying away under the end card; the music bed under it all,
  // with hits on the first frame, the cut to night, and the end card
  const total = SHOTS.reduce((a, s) => a + s.secs, 0) + END;
  let t = 0; const hits = [0];
  for (const s of SHOTS) { if (s.name === '3-thermal') hits.push(t); t += s.secs; }
  hits.push(t);
  const music = path.join(OUT, 'music.wav');
  run('python3', [path.join(__dirname, 'music.py'), music, String(total), ...hits.map(String)]);
  const inputs = SHOTS.flatMap(s => ['-i', path.join(OUT, s.name + '.wav')]);
  const n = SHOTS.length, cat = SHOTS.map((s, i) => `[${i}:a]`).join('') + `concat=n=${n}:v=0:a=1,apad=whole_dur=${total},afade=t=out:st=${total - END}:d=${END - 0.5}[game]`;
  const sound = path.join(OUT, 'sound.wav');
  run('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-i', music, '-filter_complex', `${cat};[${n}:a]volume=0.55[mus];[game][mus]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`, '-map', '[a]', '-ar', '48000', sound]);
  const final = path.join(OUT, 'saqr-trailer.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-i', sound, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final]);
  console.log(final, (fs.statSync(final).size / 1e6).toFixed(1), 'MB,', total, 's');
})();
