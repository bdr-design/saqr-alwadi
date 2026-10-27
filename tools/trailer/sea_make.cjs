// «Targeting», 20 seconds cut like a film from the F-15SA's pod (tools/trailer/sea_shots.cjs): the weapons dhow
// leaving the harbour by day, the launcher hidden in the camp at night on the thermal, the gathering between its
// buildings, the bomb's arrival slowed. Wide-screen (2.39:1 bars), graded, a quiet reticle drawn over the pod's
// picture, long dissolves; «صقر الوادي» half-transparent inside the picture at the start and again at the end; the
// score calm (a drone, soft swells at the cuts, one deep hit and the blast), under the jet's own sound.
//   node tools/trailer/sea_make.cjs        ->  tests/out/trailer-sea/saqr-film.mp4 (1920 x 1080, 30 fps, 20 s)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { CSS } = require('./make.cjs');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = process.env.TRAILER_OUT || path.join(ROOT, 'tests', 'out', 'trailer-sea'), W = 1920, H = 1080, FPS = 30;
const grid = t => Math.round(t * FPS) / FPS;
const TOTAL = 20, XF = 1.0, BAR = Math.round((H - W / 2.39) / 2);
// the takes: shot, from, to (s of the shot); the slow push over each (z0 to z1 onto cx, cy). The night shots were
// recorded at three times the pixels, so the push can go in closer to the men than the pod's own 12× without softening
const TAKES = m => [
  { shot: 'd1-dhow', from: 1.2, to: 7.8, z: [1.0, 1.12] },
  { shot: 'n1-launcher', from: 0.8, to: 5.6, z: [1.25, 1.45] },
  { shot: 'n2-group', from: 0.4, to: 5.4, z: [1.55, 1.75] },
  { shot: 'n3-strike', from: Math.max(0, m.boom - 1.6), to: Math.min(8.9, m.boom + 4.6), z: [1.2, 1.35] },
];
const LOOK = `eq=contrast=1.1:saturation=1.02:gamma=1.15:brightness=0.0,colorbalance=rs=-0.03:bs=0.05:rh=0.04:gh=0.01:bh=-0.03`;
const GRADE = (i, o, id) => `[${i}]${LOOK},split=2[${id}a][${id}b];[${id}b]curves=all='0/0 0.62/0 1/1',gblur=sigma=14[${id}g];` +
  `[${id}a][${id}g]blend=all_mode=screen:all_opacity=0.22,unsharp=5:5:0.25,vignette=angle=PI/6,noise=alls=4:allf=t+u[${o}]`;
const PUSH = (secs, t) => {
  const n = Math.round(secs * FPS), k = `min(1,max(0,on/${n}))`, z = `${t.z[0]}+${(t.z[1] - t.z[0]).toFixed(3)}*(1-cos(PI*${k}))/2`;
  return `scale=3840:2160:flags=lanczos,zoompan=z='${z}':d=1:x='iw*${t.cx || 0.5}-iw/zoom/2':y='ih*${t.cy || 0.5}-ih/zoom/2':s=${W}x${H}:fps=${FPS}`;
};
const run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'ignore', 'inherit'] });

// stills drawn in a browser: the reticle (thin, quiet: a centre cross with a gap, four corner marks) and the title
const RETICLE = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" style="position:absolute;inset:0"><g stroke="rgba(235,240,232,0.55)" stroke-width="1.6" fill="none">
  <path d="M${W / 2 - 90} ${H / 2}H${W / 2 - 22}M${W / 2 + 22} ${H / 2}H${W / 2 + 90}M${W / 2} ${H / 2 - 90}V${H / 2 - 22}M${W / 2} ${H / 2 + 22}V${H / 2 + 90}"/>
  <path d="M${W / 2 - 150} ${H / 2 - 110}v-22h22M${W / 2 + 150} ${H / 2 - 110}v-22h-22M${W / 2 - 150} ${H / 2 + 110}v22h22M${W / 2 + 150} ${H / 2 + 110}v22h-22"/></g></svg>`;
const TITLE = `<div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center">
  <div style="direction:rtl;font-family:P;font-weight:700;font-size:210px;line-height:1.1;color:#fff;letter-spacing:.02em">صقر الوادي</div>
  <div style="direction:ltr;font-family:P;font-weight:600;font-size:30px;letter-spacing:.8em;padding-left:.8em;color:#fff;margin-top:6px">SAQR AL-WADI</div></div>`;
async function stills() {
  const browser = await chromium.launch(), page = await browser.newPage({ viewport: { width: W, height: H } });
  for (const [name, body] of [['reticle', RETICLE], ['title', TITLE]]) {
    await page.setContent(`<html><head><style>${CSS()} html,body{background:transparent!important}</style></head><body>${body}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: path.join(OUT, name + '.png'), omitBackground: true });
  }
  await browser.close();
}

(async () => {
  const shots = ['d1-dhow', 'n1-launcher', 'n2-group', 'n3-strike'];
  for (const n of shots) if (!fs.existsSync(path.join(OUT, n, '00000.jpg')) || !fs.existsSync(path.join(OUT, n + '.wav'))) throw new Error('shot not recorded: ' + n);
  const booms = JSON.parse(fs.readFileSync(path.join(OUT, 'n3-strike.json'), 'utf8')).booms;
  const marks = { boom: grid(booms.length ? booms[0] : 2.7) };
  const takes = TAKES(marks).map(t => Object.assign(t, { from: grid(t.from), to: grid(t.to) }));
  // the first take takes up the slack: the whole is 20 s, the takes overlapping by the dissolves
  const rest = takes.slice(1).reduce((x, t) => x + t.to - t.from, 0);
  takes[0].to = grid(takes[0].from + TOTAL + XF * (takes.length - 1) - rest);
  let t0 = 0; for (const t of takes) { t.secs = t.to - t.from; t.at = t0; t0 += t.secs - XF; }
  const tBoom = takes[3].at + marks.boom - takes[3].from;
  console.log('takes', takes.map(t => t.secs.toFixed(1)).join(' '), '; the blast at', tBoom.toFixed(2));
  await stills();

  const enc = ['-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p'];
  const files = takes.map((t, i) => {
    const file = path.join(OUT, `take-${i}.mp4`);
    if (process.env.TRAILER_REUSE && fs.existsSync(file)) return file;
    run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-start_number', String(Math.round(t.from * FPS)), '-i', path.join(OUT, t.shot, '%05d.jpg'), '-i', path.join(OUT, 'reticle.png'),
      '-filter_complex', `[0:v]trim=end_frame=${Math.round(t.secs * FPS)},setpts=PTS-STARTPTS,${PUSH(t.secs, t)},setsar=1[p];` + GRADE('p', 'g', 'g') + `;[g][1:v]overlay=0:0[v]`,
      '-map', '[v]', ...enc, file]);
    return file;
  });
  // the takes dissolved one into the next; the title in the picture at the start and the end, half transparent;
  // the bars; up from black and down to it
  let f = '', prev = '0:v', off = 0;
  for (let i = 1; i < files.length; i++) { off += takes[i - 1].secs - XF; f += `[${prev}][${i}:v]xfade=transition=fade:duration=${XF}:offset=${off.toFixed(3)}[x${i}];`; prev = `x${i}`; }
  const n = files.length, T1 = [0.8, 4.4], T2 = [TOTAL - 4.2, TOTAL - 0.6];
  f += `[${n}:v]format=rgba,colorchannelmixer=aa=0.42,fade=t=in:st=${T1[0]}:d=1.6:alpha=1,fade=t=out:st=${T1[1] - 1.4}:d=1.4:alpha=1[ta];`;
  f += `[${n + 1}:v]format=rgba,colorchannelmixer=aa=0.42,fade=t=in:st=${T2[0]}:d=1.8:alpha=1[tb];`;
  f += `[${prev}][ta]overlay=0:0:shortest=1[o1];[o1][tb]overlay=0:0:shortest=1,drawbox=x=0:y=0:w=iw:h=${BAR}:color=black:t=fill,drawbox=x=0:y=ih-${BAR}:w=iw:h=${BAR}:color=black:t=fill,` +
    `fade=t=in:st=0:d=1.2,fade=t=out:st=${TOTAL - 1.4}:d=1.4,format=yuv420p[v]`;
  const video = path.join(OUT, 'video.mp4'), title = path.join(OUT, 'title.png');
  run('ffmpeg', ['-y', '-loglevel', 'error', ...files.flatMap(x => ['-i', x]), '-loop', '1', '-t', String(TOTAL), '-i', title, '-loop', '1', '-t', String(TOTAL), '-i', title,
    '-filter_complex', f, '-map', '[v]', '-t', String(TOTAL), ...enc, video]);

  // the score: calm
  const ev = [{ t: 0, k: 'drone', end: TOTAL }, ...takes.slice(1).map(t => ({ t: t.at + XF / 2, k: 'swell' })),
    { t: tBoom - 0.35, k: 'drop', end: tBoom }, { t: tBoom, k: 'hit', size: 0.9 }, { t: tBoom, k: 'boom' }, { t: T2[0] + 0.6, k: 'swell' }];
  const cueFile = path.join(OUT, 'cues.json'), score = path.join(OUT, 'score.wav');
  fs.writeFileSync(cueFile, JSON.stringify({ dur: TOTAL, bpm: 70, events: ev }, null, 1));
  run('python3', [path.join(__dirname, 'score.py'), cueFile, score]);
  // the game's sound under it, crossfaded with the picture
  const fmt = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
  let af = takes.map((t, i) => `[${i}:a]${fmt},atrim=start=${t.from}:end=${t.to},asetpts=PTS-STARTPTS[a${i}]`).join(';'), ap = 'a0';
  for (let i = 1; i < takes.length; i++) { af += `;[${ap}][a${i}]acrossfade=d=${XF}:c1=tri:c2=tri[ac${i}]`; ap = `ac${i}`; }
  af += `;[${ap}]apad=whole_dur=${TOTAL},afade=t=in:d=1.2,afade=t=out:st=${TOTAL - 1.6}:d=1.6,volume=0.6[game]`;
  const sound = path.join(OUT, 'sound.wav');
  run('ffmpeg', ['-y', '-loglevel', 'error', ...takes.flatMap(t => ['-i', path.join(OUT, t.shot + '.wav')]), '-i', score,
    '-filter_complex', `${af};[${takes.length}:a]${fmt}[sc];[game][sc]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=14[a]`, '-map', '[a]', '-ar', '48000', sound]);
  const final = path.join(OUT, 'saqr-film.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-i', sound, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-t', String(TOTAL), '-movflags', '+faststart', final]);
  console.log(final, (fs.statSync(final).size / 1e6).toFixed(1), 'MB');
})();
