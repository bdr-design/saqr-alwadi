// The night trailer, put together: the recorded shots (tools/trailer/shots.cjs) cut to 9:16 for TikTok / Instagram and
// graded for the screen (cool shadows, warm light, a vignette, fine grain), the captions in Arabic and English drawn and
// animated in the browser frame by frame (the game's font, IBM Plex Sans Arabic), the end card, the game's own sound for
// each shot and the music bed (tools/trailer/music.py) under it.
//   node tools/trailer/make.cjs        ->  tests/out/trailer/saqr-trailer.mp4 (1080 x 1920, 30 fps)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = path.join(ROOT, 'tests', 'out', 'trailer'), W = 1080, H = 1920, FPS = 30;
const SHOTS = [
  { name: 'n1-cockpit', secs: 6, caps: [{ at: 1.0, to: 5.6, tag: '02:14 · VALLEY', ar: 'في عتمة الوادي', en: 'IN THE DARK OF THE VALLEY' }] },
  { name: 'n2-convoy', secs: 7, caps: [{ at: 1.2, to: 6.4, ar: 'يتحركون في الظلام', en: 'THEY MOVE UNDER COVER OF NIGHT' }] },
  { name: 'n3-flare', secs: 9, caps: [{ after: 'ignite', at: 0.5, to: 8.8, ar: 'أضِئ السماء', en: 'LIGHT UP THE SKY' }] },
  { name: 'n4-lock', secs: 6, caps: [{ at: 0.5, to: 5.5, tag: 'LASER · CODE B 1588', ar: 'منصة الصواريخ', en: 'MISSILE LAUNCHER · LOCKED' }] },
  { name: 'n5-impact', secs: 9, caps: [] },
  { name: 'n6-after', secs: 6, caps: [{ at: 1.0, to: 5.7, ar: 'أنت المدفعي', en: 'YOU ARE THE GUNNER' }] },
];
const END = 6;
// the grade: night-blue shadows, warm highlights, contrast, a vignette and fine moving grain; the cockpit a touch lighter
const GRADE = cockpit => `eq=contrast=1.12:saturation=${cockpit ? 1.0 : 0.92}:gamma=${cockpit ? 1.08 : 1.04},colorbalance=rs=-0.04:bs=0.06:rm=-0.01:bm=0.02:rh=0.07:gh=0.03:bh=-0.05,unsharp=5:5:0.35,vignette=angle=PI/4.6,noise=alls=6:allf=t+u`;
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
  return ['arabic', 'latin'].flatMap(sub => [400, 500, 600, 700].map(w => `@font-face{font-family:P;font-weight:${w};src:url(${f(sub, w)}) format('woff2');}`)).join('');
}
const CSS = () => `${font()}
  html,body{margin:0;width:${W}px;height:${H}px;background:transparent;font-family:P;color:#f4f1ea;overflow:hidden}
  .scrim{position:absolute;left:-20%;right:-20%;top:1010px;height:560px;background:radial-gradient(closest-side,rgba(0,0,0,.62),rgba(0,0,0,0))}
  .cap{position:absolute;left:0;right:0;top:1120px;display:flex;flex-direction:column;align-items:center;text-align:center}
  .tag{font-weight:600;font-size:26px;letter-spacing:.35em;color:#e9b45a;direction:ltr;margin-bottom:22px;text-shadow:0 0 12px rgba(233,180,90,.5)}
  .ar{direction:rtl;font-weight:700;font-size:122px;line-height:1.12;text-shadow:0 0 30px rgba(0,0,0,.6),0 4px 18px rgba(0,0,0,.8)}
  .line{height:3px;width:180px;margin:26px 0 22px;background:linear-gradient(90deg,rgba(233,180,90,0),#e9b45a 25%,#f6d48f 50%,#e9b45a 75%,rgba(233,180,90,0));box-shadow:0 0 14px rgba(233,180,90,.7)}
  .en{direction:ltr;font-weight:500;font-size:34px;letter-spacing:.42em;color:rgba(244,241,234,.92);text-shadow:0 2px 12px rgba(0,0,0,.9);padding-left:.42em}
  .end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
  .end .kick{direction:ltr;font-weight:600;font-size:26px;letter-spacing:.5em;color:#e9b45a;padding-left:.5em}
  .end .kickar{direction:rtl;font-weight:500;font-size:34px;color:rgba(244,241,234,.85);margin-top:10px}
  .end .title{direction:rtl;font-weight:700;font-size:200px;line-height:1.05;margin-top:60px;text-shadow:0 0 50px rgba(233,180,90,.18),0 6px 30px rgba(0,0,0,.7)}
  .end .latin{direction:ltr;font-weight:600;font-size:42px;letter-spacing:.55em;color:rgba(244,241,234,.85);padding-left:.55em;margin-top:6px}
  .end .line{width:260px;margin:64px 0 54px}
  .end .soon{direction:rtl;font-weight:700;font-size:108px;color:#f6d48f;text-shadow:0 0 36px rgba(233,180,90,.45)}
  .end .soonen{direction:ltr;font-weight:600;font-size:36px;letter-spacing:.5em;color:#e9b45a;padding-left:.5em;margin-top:8px}
  .end .where{direction:rtl;font-weight:500;font-size:44px;color:rgba(244,241,234,.9);margin-top:58px}
  .end .whereen{direction:ltr;font-weight:500;font-size:28px;letter-spacing:.4em;color:rgba(244,241,234,.7);padding-left:.4em;margin-top:8px}`;

// in the page: the reveals, as Web Animations over the caption's whole length D (ms), so each frame is set by its time.
// Each [data-in] element comes in at its own moment: 'reveal' wipes in from the right (the Arabic reads that way),
// sharpening from a blur; 'grow' draws the gold line out; the rest rise and tighten their letter spacing. All go out
// together in the last half second (but the end card, which the video fades out).
const ANIM = `(D, end) => {
  const at = ms => Math.max(0, Math.min(1, ms / D)), ease = 'cubic-bezier(.2,.7,.1,1)';
  const out = end ? null : D - 550;
  const k = (ms, o) => Object.assign({ offset: at(ms), easing: ease }, o);
  const go = (el, frames) => el.animate(frames, { duration: D, fill: 'both' });
  const gone = { opacity: 0, filter: 'blur(8px)', transform: 'translateY(-12px)' };
  for (const s of document.querySelectorAll('.scrim')) go(s, [k(0, { opacity: 0 }), k(500, { opacity: 1 }), ...(out == null ? [k(D, { opacity: 1 })] : [k(out, { opacity: 1 }), k(D, { opacity: 0 })])]);
  for (const el of document.querySelectorAll('[data-in]')) {
    const t0 = +el.dataset.in, kind = el.dataset.kind, cs = getComputedStyle(el), ls = parseFloat(cs.letterSpacing) || 0;
    let a, b;
    if (kind === 'reveal') { a = { opacity: 1, filter: 'blur(14px)', transform: 'translateY(16px)', clipPath: 'inset(0 0 0 100%)' }; b = { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0px)', clipPath: 'inset(0 0 0 0%)' }; }
    else if (kind === 'grow') { a = { opacity: 0, width: '0px' }; b = { opacity: 1, width: cs.width }; }
    else { a = { opacity: 0, filter: 'blur(6px)', transform: 'translateY(12px)', letterSpacing: (ls * 1.7) + 'px' }; b = { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0px)', letterSpacing: ls + 'px' }; }
    const tail = out == null ? [k(D, b)] : [k(out, b), k(D, Object.assign({}, b, gone))];
    go(el, [k(0, a), k(t0, a), k(t0 + (kind === 'grow' ? 650 : 800), b), ...tail]);
  }
  for (const x of document.getAnimations()) x.pause();
}`;

(async () => {
  for (const s of SHOTS) if (!fs.existsSync(path.join(OUT, s.name, '00000.jpg')) || !fs.existsSync(path.join(OUT, s.name + '.wav'))) throw new Error('shot not recorded: ' + s.name);
  // the flare's moment in its shot: where the picture brightens fastest
  const ign = +execFileSync('python3', ['-c', `
import sys, glob
from PIL import Image, ImageStat
fs = sorted(glob.glob(sys.argv[1] + '/*.jpg')); v = [ImageStat.Stat(Image.open(f).convert('L').resize((96, 54))).mean[0] for f in fs]
d = [v[i + 6] - v[i] for i in range(len(v) - 6)]; print(d.index(max(d)) / 30)`, path.join(OUT, 'n3-flare')]).toString().trim();
  const marks = { ignite: ign };
  console.log('the flare lights', ign, 's into its shot');

  // the captions and the end card, frame by frame, transparent
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const css = CSS(), esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const frames = async (dir, inner, secs, end) => {
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    await page.setContent(`<html><head><style>${css}</style></head><body>${inner}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(([f, D, end]) => (0, eval)('(' + f + ')')(D, end), [ANIM, Math.round(secs * 1000), !!end]);
    for (let i = 0, n = Math.round(secs * FPS); i < n; i++) {
      await page.evaluate(ms => { for (const a of document.getAnimations()) a.currentTime = ms; }, i * 1000 / FPS);
      await page.screenshot({ path: path.join(dir, String(i).padStart(5, '0') + '.png'), omitBackground: true });
    }
  };
  for (const s of SHOTS) for (const [i, c] of s.caps.entries()) {
    if (c.after) { c.at += marks[c.after]; c.to = Math.min(s.secs - 0.2, Math.max(c.to, c.at + 2.6)); }
    await frames(path.join(OUT, `cap-${s.name}-${i}`), `<div class="scrim"></div><div class="cap">${c.tag ? `<div class="tag" data-in="0">${esc(c.tag)}</div>` : ''}<div class="ar" data-in="150" data-kind="reveal">${esc(c.ar)}</div><div class="line" data-in="550" data-kind="grow"></div><div class="en" data-in="700">${esc(c.en)}</div></div>`, c.to - c.at);
  }
  await frames(path.join(OUT, 'cap-end'), `<div class="end"><div class="kick" data-in="200">AH-64E · GUNNER SIMULATOR</div><div class="kickar" data-in="350">محاكاة مدفعي الأباتشي</div><div class="title" data-in="700" data-kind="reveal">صقر الوادي</div><div class="latin" data-in="1200">SAQR AL-WADI</div><div class="line" data-in="1600" data-kind="grow"></div><div class="soon" data-in="2000" data-kind="reveal">قريبًا</div><div class="soonen" data-in="2400">COMING SOON</div><div class="where" data-in="2900">على الآيفون</div><div class="whereen" data-in="3100">ON iPHONE</div></div>`, END, true);
  await browser.close();

  // each shot: the middle at 9:16, graded, its captions laid over from their moment, a short rise from black
  const parts = [];
  for (const s of SHOTS) {
    const args = ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(OUT, s.name, '%05d.jpg')];
    s.caps.forEach((c, i) => args.push('-framerate', String(FPS), '-itsoffset', String(c.at), '-i', path.join(OUT, `cap-${s.name}-${i}`, '%05d.png')));
    let f = `[0:v]crop=ih*9/16:ih,scale=${W}:${H}:flags=lanczos,${GRADE(s.name.includes('cockpit'))},fade=t=in:st=0:d=0.3,setsar=1[v0]`;
    s.caps.forEach((c, i) => { f += `;[v${i}][${i + 1}:v]overlay=0:0:eof_action=pass[v${i + 1}]`; });
    const file = path.join(OUT, `part-${s.name}.mp4`);
    run('ffmpeg', [...args, '-filter_complex', f, '-map', `[v${s.caps.length}]`, '-t', String(s.secs), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', file]);
    parts.push(file);
  }
  // the end card over the last shot's final frame, blurred, darkened, slowly closer
  const last = SHOTS[SHOTS.length - 1], lastFrame = path.join(OUT, last.name, String(last.secs * FPS - 1).padStart(5, '0') + '.jpg');
  const endFile = path.join(OUT, 'part-end.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', String(FPS), '-t', String(END), '-i', lastFrame, '-framerate', String(FPS), '-i', path.join(OUT, 'cap-end', '%05d.png'),
    '-filter_complex', `[0:v]crop=ih*9/16:ih,scale=${Math.round(W * 1.15)}:${Math.round(H * 1.15)},zoompan=z='1+0.0007*on':d=1:s=${W}x${H}:fps=${FPS},boxblur=26:2,eq=brightness=-0.28:saturation=0.7,${GRADE(false)},fade=t=in:st=0:d=0.5,setsar=1[bg];[bg][1:v]overlay=0:0,fade=t=out:st=${END - 0.8}:d=0.8[v]`,
    '-map', '[v]', '-t', String(END), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', endFile]);
  parts.push(endFile);
  fs.writeFileSync(path.join(OUT, 'parts.txt'), parts.map(p => `file '${p}'`).join('\n'));
  const video = path.join(OUT, 'video.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'parts.txt'), '-c', 'copy', video]);

  // sound: the shots' own sound one after another (dying away under the end card), the music bed under it all with hits
  // on the first frame, the flare lighting, the Hellfire's arrival and the end card
  const total = SHOTS.reduce((a, s) => a + s.secs, 0) + END, start = {};
  let t = 0; for (const s of SHOTS) { start[s.name] = t; t += s.secs; }
  const hits = [0, start['n3-flare'] + marks.ignite];
  try { const b = JSON.parse(fs.readFileSync(path.join(OUT, 'n5-impact.json'))).booms; if (b.length) hits.push(start['n5-impact'] + b[0]); } catch (_) {}
  hits.push(t);
  const music = path.join(OUT, 'music.wav');
  run('python3', [path.join(__dirname, 'music.py'), music, String(total), ...hits.map(h => h.toFixed(2))]);
  const n = SHOTS.length, cat = SHOTS.map((s, i) => `[${i}:a]`).join('') + `concat=n=${n}:v=0:a=1,apad=whole_dur=${total},afade=t=out:st=${total - END}:d=${END - 0.5}[game]`;
  const sound = path.join(OUT, 'sound.wav');
  run('ffmpeg', ['-y', '-loglevel', 'error', ...SHOTS.flatMap(s => ['-i', path.join(OUT, s.name + '.wav')]), '-i', music,
    '-filter_complex', `${cat};[${n}:a]volume=0.6[mus];[game][mus]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`, '-map', '[a]', '-ar', '48000', sound]);
  const final = path.join(OUT, 'saqr-trailer.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-i', sound, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final]);
  console.log(final, (fs.statSync(final).size / 1e6).toFixed(1), 'MB,', total, 's; hits at', hits.map(h => h.toFixed(1)).join(' '));
})();
