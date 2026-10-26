// The cockpit trailer, put together: the recorded shots (tools/trailer/shots.cjs) at 16:9, graded for the screen
// (cool shadows, warm light, a vignette, fine grain) and letterboxed to 2.2:1, the captions in Arabic and English drawn
// and animated in the browser frame by frame (the game's font, IBM Plex Sans Arabic), the end card, the game's own
// sound for each shot and the music bed (tools/trailer/music.py) under it.
//   node tools/trailer/make.cjs        ->  tests/out/trailer/saqr-trailer.mp4 (1920 x 1080, 30 fps)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = process.env.TRAILER_OUT || path.join(ROOT, 'tests', 'out', 'trailer'), W = 1920, H = 1080, FPS = 30;
const BAR = Math.round((H - W / 2.2) / 2);   // the letterbox bars, top and bottom
const SHOTS = [
  { name: 'k1-seat', secs: 7, caps: [{ at: 1.2, to: 6.6, tag: '02:14Z  //  VALLEY', ar: 'في عتمة الوادي', en: 'IN THE DARK OF THE VALLEY' }] },
  { name: 'k2-arm', secs: 9, caps: [{ at: 0.4, to: 8.6, tag: 'A/S ARM  //  WAS RKT  //  LRF', ar: 'تفعيل الأنظمة', en: 'SYSTEMS ONLINE · WEAPONS HOT' }] },
  { name: 'k3-flare', secs: 9, caps: [{ after: 'ignite', at: 0.5, to: 8.8, tag: 'M257  //  1,000,000 CD', ar: 'أضِئ السماء', en: 'LIGHT UP THE SKY' }] },
  { name: 'k4-lock', secs: 8, caps: [{ at: 0.8, to: 7.6, tag: 'IAT  //  LASE CODE A 1688  //  LOBL', ar: 'منصة صواريخ بين الأشجار', en: 'MISSILE LAUNCHER · TREE LINE' }] },
  { name: 'k5-strike', secs: 12, caps: [] },
  { name: 'k6-after', secs: 7, caps: [{ at: 1.4, to: 6.8, tag: 'BDA  //  TARGET DESTROYED', ar: 'الحرب من داخل القمرة', en: 'THE WAR, FROM THE COCKPIT' }] },
];
const END = 6;
// the grade: night-blue shadows, warm highlights, contrast, a vignette and fine moving grain; then the bars
const GRADE = `eq=contrast=1.06:saturation=1.05:gamma=1.28:brightness=0.015,colorbalance=rs=-0.04:bs=0.06:rm=-0.01:bm=0.02:rh=0.07:gh=0.03:bh=-0.05,unsharp=5:5:0.35,vignette=angle=PI/6,noise=alls=5:allf=t+u,drawbox=x=0:y=0:w=iw:h=${BAR}:color=black:t=fill,drawbox=x=0:y=ih-${BAR}:w=iw:h=${BAR}:color=black:t=fill`;
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });

// the fonts, from npm (cached): the game's IBM Plex Sans Arabic (P), and IBM Plex Mono (M) for the technical lines
function npmFont(dir, pkg) {
  if (!fs.existsSync(path.join(dir, 'package'))) {
    fs.mkdirSync(dir, { recursive: true });
    const meta = JSON.parse(execFileSync('curl', ['-s', 'https://registry.npmjs.org/' + pkg + '/latest']).toString());
    execFileSync('curl', ['-s', '-o', path.join(dir, 'f.tgz'), meta.dist.tarball]); execFileSync('tar', ['xzf', 'f.tgz'], { cwd: dir });
  }
  return name => 'data:font/woff2;base64,' + fs.readFileSync(path.join(dir, 'package', 'files', name)).toString('base64');
}
function font() {
  const f = npmFont(path.join(OUT, 'fonts'), '@fontsource/ibm-plex-sans-arabic'), m = npmFont(path.join(OUT, 'fonts', 'mono'), '@fontsource/ibm-plex-mono');
  // (each subset with its own range: without one, the last face declared would answer for every character)
  const range = { arabic: 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFC,U+200C-200F', latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2122,U+2212' };
  return ['arabic', 'latin'].flatMap(sub => [300, 400, 500, 600, 700].map(w => `@font-face{font-family:P;font-weight:${w};unicode-range:${range[sub]};src:url(${f(`ibm-plex-sans-arabic-${sub}-${w}-normal.woff2`)}) format('woff2');}`)).join('')
    + [400, 500].map(w => `@font-face{font-family:M;font-weight:${w};src:url(${m(`ibm-plex-mono-latin-${w}-normal.woff2`)}) format('woff2');}`).join('');
}
// The captions: a block at the lower right, read from the right (the Arabic first, large; the English under it in
// wide capitals), a thin amber rule standing beside it, and above it the moment's technical line in mono (what the
// gunner has set, as the aircraft names it). The end card: the title in a sight's corner brackets, a light passing
// over it, the line under it, then «قريبًا · COMING SOON» in a frame.
const AMBER = '#e2b062';
const CSS = () => `${font()}
  html,body{margin:0;width:${W}px;height:${H}px;background:transparent;font-family:P;color:#f2efe7;overflow:hidden}
  .scrim{position:absolute;right:-6%;bottom:${BAR - 40}px;width:1250px;height:560px;background:radial-gradient(ellipse at 72% 74%,rgba(0,0,0,.74),rgba(0,0,0,.34) 45%,rgba(0,0,0,0) 70%)}
  .cap{position:absolute;right:150px;bottom:${BAR + 58}px;display:flex;flex-direction:row;align-items:stretch;gap:28px}
  .body{display:flex;flex-direction:column;align-items:flex-end;text-align:right}
  .vbar{width:3px;background:linear-gradient(${AMBER},rgba(226,176,98,.12));box-shadow:0 0 12px rgba(226,176,98,.55);transform-origin:50% 100%}
  .meta{font-family:M;font-weight:500;font-size:16px;letter-spacing:.24em;color:${AMBER};direction:ltr;white-space:pre;margin-bottom:12px;text-shadow:0 0 3px rgba(0,0,0,.95),0 0 10px rgba(226,176,98,.35)}
  .ar{direction:rtl;font-weight:700;font-size:78px;line-height:1.12;text-shadow:0 0 22px rgba(0,0,0,.6),0 3px 14px rgba(0,0,0,.85)}
  .en{direction:ltr;font-weight:500;font-size:20px;letter-spacing:.4em;color:rgba(242,239,231,.86);margin-top:10px;margin-right:-.4em;text-shadow:0 0 3px rgba(0,0,0,.95),0 2px 12px rgba(0,0,0,.95)}
  .end{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
  .end .meta{margin-bottom:34px;padding-left:.24em;font-size:15px}
  .end .box{position:relative;padding:22px 90px 26px}
  .end .c{position:absolute;width:46px;height:46px;border:2px solid rgba(226,176,98,.85);filter:drop-shadow(0 0 6px rgba(226,176,98,.5))}
  .end .tl{left:0;top:0;border-right:0;border-bottom:0} .end .tr{right:0;top:0;border-left:0;border-bottom:0}
  .end .bl{left:0;bottom:0;border-right:0;border-top:0} .end .br{right:0;bottom:0;border-left:0;border-top:0}
  .end .tw{filter:drop-shadow(0 6px 26px rgba(0,0,0,.75))}
  /* (the light is painted only inside the box: room below for the dots under ي) */
  .end .title{direction:rtl;font-weight:700;font-size:156px;line-height:1.1;padding:10px 24px 40px;margin:-10px -24px -22px;color:transparent;-webkit-background-clip:text;background-clip:text;
    background-image:linear-gradient(100deg,#ece8de 0%,#ece8de 42%,#fff7e2 50%,#ece8de 58%,#ece8de 100%);background-size:320% 100%;background-position:100% 0}
  .end .latin{direction:ltr;font-weight:600;font-size:28px;letter-spacing:.62em;color:rgba(242,239,231,.82);margin-top:2px;padding-left:.62em}
  .end .sub{display:flex;align-items:center;gap:22px;margin-top:30px}
  .end .sub .a{direction:rtl;font-weight:500;font-size:30px;color:rgba(242,239,231,.9)}
  .end .sub .d{width:6px;height:6px;background:${AMBER};transform:rotate(45deg)}
  .end .sub .e{direction:ltr;font-weight:500;font-size:17px;letter-spacing:.42em;color:rgba(242,239,231,.75)}
  .end .soon{display:flex;align-items:center;gap:26px;margin-top:46px;padding:12px 40px 14px;border:1px solid rgba(226,176,98,.75);background:rgba(226,176,98,.06)}
  .end .soon .a{direction:rtl;font-weight:700;font-size:54px;color:#f3d293;line-height:1.15;text-shadow:0 0 24px rgba(226,176,98,.4)}
  .end .soon .s{width:1px;height:44px;background:rgba(226,176,98,.6)}
  .end .soon .e{direction:ltr;font-weight:600;font-size:20px;letter-spacing:.5em;color:${AMBER}}
  .end .where{font-weight:500;font-size:22px;color:rgba(242,239,231,.72);margin-top:22px}
  .end .where .e{font-size:15px;letter-spacing:.4em;margin-left:14px}`;

// in the page: the reveals, as Web Animations over the caption's whole length D (ms), so each frame is set by its time.
// Each [data-in] element comes in at its own moment: 'reveal' wipes in from the right (the Arabic reads that way),
// sharpening from a blur; 'type' is typed out from the left; 'vgrow' the rule stands up; 'frame' the brackets close in;
// 'pop' the frame comes up; the rest rise and tighten their letter spacing. The title's light passes over it after.
// All go out together in the last half second, to the right (but the end card, which the video fades out).
const ANIM = `(D, end) => {
  const at = ms => Math.max(0, Math.min(1, ms / D)), ease = 'cubic-bezier(.2,.7,.1,1)';
  const out = end ? null : D - 520;
  const k = (ms, o, e) => Object.assign({ offset: at(ms), easing: e || ease }, o);
  const go = (el, frames) => el.animate(frames, { duration: D, fill: 'both' });
  for (const s of document.querySelectorAll('.scrim')) go(s, [k(0, { opacity: 0 }), k(450, { opacity: 1 }), ...(out == null ? [k(D, { opacity: 1 })] : [k(out, { opacity: 1 }), k(D, { opacity: 0 })])]);
  for (const el of document.querySelectorAll('[data-in]')) {
    const t0 = +el.dataset.in, kind = el.dataset.kind, cs = getComputedStyle(el), ls = parseFloat(cs.letterSpacing) || 0;
    let a, b, len = 800, e = ease;
    // (the clip reaches past the line box above and below: the dots of ق and ي stand outside it)
    if (kind === 'reveal') { a = { opacity: 1, filter: 'blur(14px)', transform: 'translateX(-18px)', clipPath: 'inset(-45% -8% -45% 100%)' }; b = { opacity: 1, filter: 'blur(0px)', transform: 'translateX(0px)', clipPath: 'inset(-45% -8% -45% -8%)' }; len = 900; }
    else if (kind === 'type') { const n = el.textContent.length; a = { opacity: 1, clipPath: 'inset(-40% 100% -40% 0)' }; b = { opacity: 1, clipPath: 'inset(-40% 0% -40% 0)' }; len = n * 28; e = 'steps(' + n + ', end)'; }
    else if (kind === 'vgrow') { a = { opacity: 0, transform: 'scaleY(0)' }; b = { opacity: 1, transform: 'scaleY(1)' }; len = 700; }
    else if (kind === 'frame') { a = { opacity: 0, transform: 'scale(1.18)' }; b = { opacity: 1, transform: 'scale(1)' }; len = 1000; }
    else if (kind === 'pop') { a = { opacity: 0, transform: 'translateY(14px) scale(.96)' }; b = { opacity: 1, transform: 'translateY(0px) scale(1)' }; len = 700; }
    else { a = { opacity: 0, filter: 'blur(6px)', transform: 'translateY(10px)', letterSpacing: (ls * 1.7) + 'px' }; b = { opacity: 1, filter: 'blur(0px)', transform: 'translateY(0px)', letterSpacing: ls + 'px' }; }
    // (every frame names the same properties: one left out would be eased in over the whole length instead)
    for (const f of [a, b]) { f.filter = f.filter || 'blur(0px)'; f.transform = f.transform || 'translateX(0px)'; }
    const gone = Object.assign({}, b, { opacity: 0, filter: 'blur(6px)', transform: b.transform + ' translateX(28px)' });
    const tail = out == null ? [k(D, b)] : [k(out, b), k(D, gone)];
    go(el, [k(0, a), k(t0, a, e), k(t0 + len, b), ...tail]);
  }
  for (const el of document.querySelectorAll('.title')) go(el, [k(0, { backgroundPosition: '100% 0' }), k(1700, { backgroundPosition: '100% 0' }, 'cubic-bezier(.4,0,.2,1)'), k(3100, { backgroundPosition: '0% 0' }), k(D, { backgroundPosition: '0% 0' })]);
  for (const x of document.getAnimations()) x.pause();
}`;

// (required from elsewhere, only the design: to look at it over a still)
module.exports = { CSS, ANIM, W, H, BAR };
if (require.main === module) (async () => {
  for (const s of SHOTS) if (!fs.existsSync(path.join(OUT, s.name, '00000.jpg')) || !fs.existsSync(path.join(OUT, s.name + '.wav'))) throw new Error('shot not recorded: ' + s.name);
  // the flare's moment in its shot: where the picture brightens fastest
  const ign = +execFileSync('python3', ['-c', `
import sys, glob
from PIL import Image, ImageStat
fs = sorted(glob.glob(sys.argv[1] + '/*.jpg')); v = [ImageStat.Stat(Image.open(f).convert('L').resize((96, 54)).crop((30, 14, 66, 40))).mean[0] for f in fs]
d = [v[i + 6] - v[i] for i in range(len(v) - 6)]; print(d.index(max(d)) / 30)`, path.join(OUT, 'k3-flare')]).toString().trim();
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
    await frames(path.join(OUT, `cap-${s.name}-${i}`), `<div class="scrim"></div><div class="cap"><div class="body">${c.tag ? `<div class="meta" data-in="250" data-kind="type">${esc(c.tag)}</div>` : ''}<div class="ar" data-in="380" data-kind="reveal">${esc(c.ar)}</div><div class="en" data-in="900">${esc(c.en)}</div></div><div class="vbar" data-in="0" data-kind="vgrow"></div></div>`, c.to - c.at);
  }
  await frames(path.join(OUT, 'cap-end'), `<div class="end"><div class="meta" data-in="150" data-kind="type">AH-64E  //  CPG  //  NIGHT</div>
    <div class="box"><span class="c tl" data-in="300" data-kind="frame"></span><span class="c tr" data-in="300" data-kind="frame"></span><span class="c bl" data-in="300" data-kind="frame"></span><span class="c br" data-in="300" data-kind="frame"></span>
      <div class="tw"><div class="title" data-in="550" data-kind="reveal">صقر الوادي</div></div><div class="latin" data-in="1150">SAQR AL-WADI</div></div>
    <div class="sub" data-in="1600"><span class="a">محاكاة طيران وحرب</span><span class="d"></span><span class="e">FLIGHT &amp; COMBAT SIMULATOR</span></div>
    <div class="soon" data-in="2400" data-kind="pop"><span class="a">قريبًا</span><span class="s"></span><span class="e">COMING SOON</span></div>
    <div class="where" data-in="3000">على الآيفون<span class="e">ON iPHONE</span></div></div>`, END, true);
  await browser.close();

  // each shot: graded and letterboxed, its captions laid over from their moment, a short rise from black
  const parts = [];
  for (const s of SHOTS) {
    const args = ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(OUT, s.name, '%05d.jpg')];
    s.caps.forEach((c, i) => args.push('-framerate', String(FPS), '-itsoffset', String(c.at), '-i', path.join(OUT, `cap-${s.name}-${i}`, '%05d.png')));
    let f = `[0:v]scale=${W}:${H}:flags=lanczos,${GRADE},fade=t=in:st=0:d=0.3,setsar=1[v0]`;
    s.caps.forEach((c, i) => { f += `;[v${i}][${i + 1}:v]overlay=0:0:eof_action=pass[v${i + 1}]`; });
    const file = path.join(OUT, `part-${s.name}.mp4`);
    run('ffmpeg', [...args, '-filter_complex', f, '-map', `[v${s.caps.length}]`, '-t', String(s.secs), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', file]);
    parts.push(file);
  }
  // the end card over the last shot's final frame, blurred, darkened, slowly closer
  const last = SHOTS[SHOTS.length - 1], lastFrame = path.join(OUT, last.name, String(last.secs * FPS - 1).padStart(5, '0') + '.jpg');
  const endFile = path.join(OUT, 'part-end.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', String(FPS), '-t', String(END), '-i', lastFrame, '-framerate', String(FPS), '-i', path.join(OUT, 'cap-end', '%05d.png'),
    '-filter_complex', `[0:v]scale=${Math.round(W * 1.15)}:${Math.round(H * 1.15)},zoompan=z='1+0.0007*on':d=1:s=${W}x${H}:fps=${FPS},boxblur=26:2,eq=brightness=-0.28:saturation=0.7,${GRADE},fade=t=in:st=0:d=0.5,setsar=1[bg];[bg][1:v]overlay=0:0,fade=t=out:st=${END - 0.8}:d=0.8[v]`,
    '-map', '[v]', '-t', String(END), '-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p', endFile]);
  parts.push(endFile);
  fs.writeFileSync(path.join(OUT, 'parts.txt'), parts.map(p => `file '${p}'`).join('\n'));
  const video = path.join(OUT, 'video.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'parts.txt'), '-c', 'copy', video]);

  // sound: the shots' own sound one after another (dying away under the end card), the music bed under it all with hits
  // on the first frame, the flare lighting, the Hellfire's arrival and the end card
  const total = SHOTS.reduce((a, s) => a + s.secs, 0) + END, start = {};
  let t = 0; for (const s of SHOTS) { start[s.name] = t; t += s.secs; }
  const hits = [0, start['k3-flare'] + marks.ignite];
  try { const b = JSON.parse(fs.readFileSync(path.join(OUT, 'k5-strike.json'))).booms; if (b.length) hits.push(start['k5-strike'] + b[0]); } catch (_) {}
  hits.push(t);
  const music = path.join(OUT, 'music.wav');
  run('python3', [path.join(__dirname, 'music.py'), music, String(total), ...hits.map(h => h.toFixed(2))]);
  const n = SHOTS.length, cat = SHOTS.map((s, i) => `[${i}:a]`).join('') + `concat=n=${n}:v=0:a=1,apad=whole_dur=${total},afade=t=out:st=${total - END}:d=${END - 0.5}[game]`;
  const sound = path.join(OUT, 'sound.wav');
  run('ffmpeg', ['-y', '-loglevel', 'error', ...SHOTS.flatMap(s => ['-i', path.join(OUT, s.name + '.wav')]), '-i', music,
    '-filter_complex', `${cat};[${n}:a]volume=0.6[mus];[game][mus]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11[a]`, '-map', '[a]', '-ar', '48000', sound]);
  const final = path.join(OUT, 'saqr-trailer.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-i', sound, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', final]);
  console.log(final, (fs.statSync(final).size / 1e6).toFixed(1), 'MB,', total, 's; hits at', hits.map(h => h.toFixed(1)).join(' '));
})();
