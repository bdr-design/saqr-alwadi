// The F-15SA trailer, made as the cockpit trailer is (tools/trailer/make.cjs): 30 seconds of long, calm takes from the
// recorded shots (tools/trailer/f15_shots.cjs), each easing slowly in, dissolving one into the next; no words over
// the picture; then the title. Calmer than the Apache's: no pulse and no riser, a low drone and soft swells under the
// jet's own sound, one deep hit for the bomb's arrival, the title on a slow swell.
//   node tools/trailer/f15_make.cjs        ->  tests/out/trailer-f15/saqr-f15.mp4 (1920 x 1080, 30 fps, 30 s)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = process.env.TRAILER_OUT || path.join(ROOT, 'tests', 'out', 'trailer-f15'), W = 1920, H = 1080, FPS = 30;
const SHOTS = ['f1-seat', 'f2-look', 'f3-pod', 'f4-impact', 'f5-after'];
const grid = t => Math.round(t * FPS) / FPS;   // (on whole frames)
// The takes (a shot, from, to: seconds of the shot), and how the camera eases in over each (z0 to z1 onto cx, cy:
// fractions of the picture). The bomb's moment is from the recording.
//   the seat in the orbit's bank · the head to the low wing, the coast below · the pod on the warehouse, tracking ·
//   the arrival, slowed · the seat again, the head coming back to the front
const TAKES = m => [
  { shot: 'f1-seat', from: 0.5, to: 7.5, z: [1.0, 1.05] },
  { shot: 'f2-look', from: 0.2, to: 6.6, z: [1.0, 1.04] },
  { shot: 'f3-pod', from: 0.6, to: 6.6, z: [1.0, 1.06] },
  { shot: 'f4-impact', from: Math.max(0, m.boom - 2.4), to: Math.min(7.9, m.boom + 3.6), z: [1.0, 1.12], cy: 0.5 },
  { shot: 'f5-after', from: 0.5, to: 7.6, z: [1.04, 1.0] },
];
const XF = 1.1;      // the dissolves, seconds (long and soft)
const END = 5.5;     // the title card (it comes up out of black)
const TOTAL = 30;
// the grade: deep and clean, a touch cool in the shadows and warm in the lights; the screens' glow blooming softly;
// a light vignette and fine grain
const LOOK = `eq=contrast=1.08:saturation=1.06:gamma=1.22:brightness=0.01,colorbalance=rs=-0.03:bs=0.05:rh=0.05:gh=0.02:bh=-0.03`;
const GRADE = (i, o, id) => `[${i}]${LOOK},split=2[${id}a][${id}b];[${id}b]curves=all='0/0 0.6/0 1/1',gblur=sigma=16[${id}g];` +
  `[${id}a][${id}g]blend=all_mode=screen:all_opacity=0.28,unsharp=5:5:0.3,vignette=angle=PI/7,noise=alls=3:allf=t+u[${o}]`;
// the camera easing in over a take: from z0 to z1, the move itself eased (from fraction e0 to e1 of the take)
const PUSH = (secs, t) => {
  const n = Math.round(secs * FPS), [e0, e1] = t.ease || [0, 1], k = `min(1,max(0,(on/${n}-${e0})/${e1 - e0}))`;
  const z = `${t.z[0]}+${(t.z[1] - t.z[0]).toFixed(3)}*(1-cos(PI*${k}))/2`;
  return `scale=3840:2160:flags=bicubic,zoompan=z='${z}':d=1:x='iw*${t.cx || 0.5}-iw/zoom/2':y='ih*${t.cy || 0.5}-ih/zoom/2':s=${W}x${H}:fps=${FPS}`;
};
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });

// the game's font, from npm (cached)
function font() {
  const dir = path.join(OUT, 'fonts');
  if (!fs.existsSync(path.join(dir, 'package'))) {
    fs.mkdirSync(dir, { recursive: true });
    const meta = JSON.parse(execFileSync('curl', ['-s', 'https://registry.npmjs.org/@fontsource/ibm-plex-sans-arabic/latest']).toString());
    execFileSync('curl', ['-s', '-o', path.join(dir, 'f.tgz'), meta.dist.tarball]); execFileSync('tar', ['xzf', 'f.tgz'], { cwd: dir });
  }
  const f = name => 'data:font/woff2;base64,' + fs.readFileSync(path.join(dir, 'package', 'files', name)).toString('base64');
  // (each subset with its own range: without one, the last face declared would answer for every character)
  const range = { arabic: 'U+0600-06FF,U+0750-077F,U+08A0-08FF,U+FB50-FDFF,U+FE70-FEFC,U+200C-200F', latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02C6,U+02DA,U+02DC,U+2000-206F,U+2122,U+2212' };
  return ['arabic', 'latin'].flatMap(sub => [400, 500, 600, 700].map(w => `@font-face{font-family:P;font-weight:${w};unicode-range:${range[sub]};src:url(${f(`ibm-plex-sans-arabic-${sub}-${w}-normal.woff2`)}) format('woff2');}`)).join('');
}
// The title card, on black: the name large, in brushed steel, a slow light across it; the Latin name under it in wide
// capitals; the line; then «قريبًا · COMING SOON» and where.
const CSS = () => `${font()}
  html,body{margin:0;width:${W}px;height:${H}px;background:#000;font-family:P;color:#eef0f2;overflow:hidden}
  .card{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
  .glow{position:absolute;left:50%;top:44%;width:1300px;height:520px;margin:-260px 0 0 -650px;background:radial-gradient(closest-side,rgba(150,175,200,.16),rgba(0,0,0,0))}
  .title{direction:rtl;font-weight:700;font-size:220px;line-height:1.1;padding:0 30px 110px;margin-bottom:-78px;color:transparent;-webkit-background-clip:text;background-clip:text;
    background-image:linear-gradient(100deg,rgba(255,255,255,0) 40%,rgba(255,255,255,.95) 50%,rgba(255,255,255,0) 60%),linear-gradient(180deg,#ffffff 0%,#e3e7ec 48%,#9aa3ad 100%);
    background-size:300% 100%,100% 100%;background-position:100% 0,0 0;filter:drop-shadow(0 10px 40px rgba(0,0,0,.8))}
  .latin{direction:ltr;font-weight:600;font-size:34px;letter-spacing:.78em;padding-left:.78em;color:#c4cad2;margin-top:6px}
  .rule{width:340px;height:1px;margin:44px 0 36px;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.55),rgba(255,255,255,0))}
  .sub{display:flex;align-items:center;gap:26px}
  .sub .a{direction:rtl;font-weight:500;font-size:34px;color:#dfe3e8}
  .sub .e{direction:ltr;font-weight:500;font-size:19px;letter-spacing:.5em;color:#aeb5bd}
  .sub .d{width:5px;height:5px;border-radius:50%;background:#aeb5bd}
  .soon{margin-top:64px;display:flex;align-items:baseline;gap:26px}
  .soon .a{direction:rtl;font-weight:700;font-size:58px;color:#fff}
  .soon .e{direction:ltr;font-weight:600;font-size:22px;letter-spacing:.55em;color:#d6dbe1}
  .where{margin-top:16px;font-weight:500;font-size:22px;color:#8f969e}
  .where .e{font-size:15px;letter-spacing:.42em;margin-left:16px}`;
// in the page: each [data-in] element comes up at its moment (ms), the title out of a soft blur and a little closer,
// the rest rising; the light passes over the title once. Set frame by frame by time.
const ANIM = `D => {
  const at = ms => Math.max(0, Math.min(1, ms / D)), ease = 'cubic-bezier(.22,.6,.12,1)';
  const k = (ms, o) => Object.assign({ offset: at(ms), easing: ease }, o);
  for (const el of document.querySelectorAll('[data-in]')) {
    const t0 = +el.dataset.in, big = el.classList.contains('title'), len = big ? 1600 : 1000;
    const a = { opacity: 0, filter: big ? 'blur(14px) drop-shadow(0 10px 40px rgba(0,0,0,.8))' : 'blur(4px)', transform: big ? 'scale(1.06)' : 'translateY(14px)' };
    const b = { opacity: 1, filter: big ? 'blur(0px) drop-shadow(0 10px 40px rgba(0,0,0,.8))' : 'blur(0px)', transform: big ? 'scale(1)' : 'translateY(0px)' };
    el.animate([k(0, a), k(t0, a), k(Math.min(D, t0 + len), b), k(D, b)], { duration: D, fill: 'both' });
  }
  const t = document.querySelector('.title');
  t.animate([k(0, { backgroundPosition: '100% 0, 0 0' }), k(1500, { backgroundPosition: '100% 0, 0 0' }), k(3300, { backgroundPosition: '0% 0, 0 0' }), k(D, { backgroundPosition: '0% 0, 0 0' })], { duration: D, fill: 'both' });
  document.querySelector('.glow').animate([k(0, { opacity: 0 }), k(1200, { opacity: 1 }), k(D, { opacity: 1 })], { duration: D, fill: 'both' });
  for (const x of document.getAnimations()) x.pause();
}`;
const CARD = `<div class="glow"></div><div class="card"><div class="title" data-in="250">صقر الوادي</div><div class="latin" data-in="1100">SAQR AL-WADI</div>
  <div class="rule" data-in="1500"></div><div class="sub" data-in="1700"><span class="a">إف-15 إس إيه · المقعد الخلفي</span><span class="d"></span><span class="e">F-15SA · BACK SEAT</span></div>
  <div class="soon" data-in="2500"><span class="a">قريبًا</span><span class="e">COMING SOON</span></div><div class="where" data-in="2900">على الآيفون<span class="e">ON iPHONE</span></div></div>`;

// (required from elsewhere, only the design: to look at it over a still)
module.exports = { CSS, ANIM, CARD, W, H };
if (require.main === module) (async () => {
  for (const n of SHOTS) if (!fs.existsSync(path.join(OUT, n, '00000.jpg')) || !fs.existsSync(path.join(OUT, n + '.wav'))) throw new Error('shot not recorded: ' + n);
  // the bomb's arrival: the first blast in its shot
  const booms = JSON.parse(fs.readFileSync(path.join(OUT, 'f4-impact.json'), 'utf8')).booms;
  const marks = { boom: grid(booms.length ? booms[0] : 2.8) };
  const takes = TAKES(marks).map(t => Object.assign(t, { from: grid(t.from), to: grid(t.to) }));
  // the first take takes up the slack, so the whole is 30 s: the takes overlap by the dissolves, the card too
  const rest = takes.slice(1).reduce((x, t) => x + t.to - t.from, 0), first = TOTAL - END + XF * takes.length - rest;
  takes[0].to = grid(takes[0].from + first);
  let t0 = 0; for (const t of takes) { t.secs = t.to - t.from; t.at = t0; t0 += t.secs - XF; }
  const tCard = t0;   // where the card begins (the last take's dissolve into it)
  const at = (n, s) => { const t = takes.find(t => t.shot === n && s >= t.from && s <= t.to); return t ? t.at + s - t.from : null; };
  console.log('the blast', marks.boom, 's into its shot; takes', takes.map(t => t.secs.toFixed(1)).join(' '), '; card at', tCard.toFixed(2));

  // the title card, frame by frame
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const cardDir = path.join(OUT, 'card'); fs.rmSync(cardDir, { recursive: true, force: true }); fs.mkdirSync(cardDir, { recursive: true });
  await page.setContent(`<html><head><style>${CSS()}</style></head><body>${CARD}</body></html>`);
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(([f, D]) => (0, eval)('(' + f + ')')(D), [ANIM, Math.round(END * 1000)]);
  for (let i = 0, n = Math.round(END * FPS); i < n; i++) {
    await page.evaluate(ms => { for (const a of document.getAnimations()) a.currentTime = ms; }, i * 1000 / FPS);
    await page.screenshot({ path: path.join(cardDir, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 95 });
  }
  await browser.close();

  // each take: eased in, graded; then all dissolved one into the next, and into the card, the whole up from black
  const enc = ['-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '15', '-pix_fmt', 'yuv420p'];
  const files = takes.map((t, i) => {
    const file = path.join(OUT, `take-${i}.mp4`);
    // (TRAILER_REUSE=1: keep the takes already made, to try the card or the sound again)
    if (process.env.TRAILER_REUSE && fs.existsSync(file)) return file;
    run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-start_number', String(Math.round(t.from * FPS)), '-i', path.join(OUT, t.shot, '%05d.jpg'),
      '-filter_complex', `[0:v]trim=end_frame=${Math.round(t.secs * FPS)},setpts=PTS-STARTPTS,${PUSH(t.secs, t)},setsar=1[p];` + GRADE('p', 'v', 'g'),
      '-map', '[v]', ...enc, file]);
    return file;
  });
  const card = path.join(OUT, 'take-card.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(cardDir, '%05d.jpg'), '-vf', 'noise=alls=2:allf=t+u,fade=t=out:st=' + (END - 0.7) + ':d=0.7,setsar=1', ...enc, card]);
  files.push(card);
  const lens = [...takes.map(t => t.secs), END];
  let f = '', prev = '0:v', off = 0;
  for (let i = 1; i < files.length; i++) {
    off += lens[i - 1] - XF;
    // (into the card through black: the last take goes down, the title comes up)
    f += `[${prev}][${i}:v]xfade=transition=${i === files.length - 1 ? 'fadeblack' : 'fade'}:duration=${i === files.length - 1 ? 1.2 : XF}:offset=${off.toFixed(3)}[x${i}];`;
    prev = `x${i}`;
  }
  f += `[${prev}]fade=t=in:st=0:d=1.2,format=yuv420p[v]`;
  const video = path.join(OUT, 'video.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap(x => ['-i', x]), '-filter_complex', f, '-map', '[v]', '-t', String(TOTAL), ...enc, video]);

  // the score's cue sheet
  const tBoom = at('f4-impact', marks.boom);
  const ev = [{ t: 0, k: 'drone', end: TOTAL },
    ...takes.slice(1).map(t => ({ t: t.at + XF / 2, k: 'swell' })),
    { t: tBoom - 0.4, k: 'drop', end: tBoom }, { t: tBoom, k: 'hit', size: 1.0 }, { t: tBoom, k: 'boom' },
    { t: tCard + 1.0, k: 'swell' }, { t: tCard + 1.2, k: 'shimmer' }];
  const cueFile = path.join(OUT, 'cues.json'), score = path.join(OUT, 'score.wav');
  fs.writeFileSync(cueFile, JSON.stringify({ dur: TOTAL, bpm: 80, events: ev }, null, 1));
  run('python3', [path.join(__dirname, 'score.py'), cueFile, score]);

  // the game's sound: each take's own stretch, crossfaded as the picture is; quiet under the card; ducked for the
  // breath before the blast (the slowed blast itself comes back with it)
  const fmt = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
  let af = takes.map((t, i) => `[${i}:a]${fmt},atrim=start=${t.from}:end=${t.to},asetpts=PTS-STARTPTS[a${i}]`).join(';'), ap = 'a0';
  for (let i = 1; i < takes.length; i++) { af += `;[${ap}][a${i}]acrossfade=d=${XF}:c1=tri:c2=tri[ac${i}]`; ap = `ac${i}`; }
  af += `;[${ap}]apad=whole_dur=${TOTAL},volume='if(between(t,${(tBoom - 0.5).toFixed(3)},${(tBoom - 0.04).toFixed(3)}),0.05,1)':eval=frame,afade=t=in:d=1.2,afade=t=out:st=${tCard.toFixed(3)}:d=1.5,volume=0.7[game]`;
  const sound = path.join(OUT, 'sound.wav');
  run('ffmpeg', ['-y', '-loglevel', 'error', ...takes.flatMap(t => ['-i', path.join(OUT, t.shot + '.wav')]), '-i', score,
    '-filter_complex', `${af};[${takes.length}:a]${fmt}[sc];[game][sc]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.2:LRA=16[a]`, '-map', '[a]', '-ar', '48000', sound]);
  const final = path.join(OUT, 'saqr-f15.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-i', sound, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-t', String(TOTAL), '-movflags', '+faststart', final]);
  console.log(final, (fs.statSync(final).size / 1e6).toFixed(1), 'MB');
})();
