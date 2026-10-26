// The cockpit trailer, put together: 30 seconds on a 120 BPM grid. A satellite feed opens it (the mission, the target,
// zooming in steps onto the tree line), then the cuts from the recorded shots (tools/trailer/shots.cjs) at 16:9,
// graded for the screen (cool shadows, warm light, the screens' glow blooming, a streak off the brightest lights, a
// vignette, fine grain) and letterboxed to 2.2:1, each cut pushing in a little, the sections joined by a flash or a
// glitch, a beat of black and silence before the blast; the captions in Arabic and English drawn and animated in the
// browser frame by frame; the end card. Sound: the game's own under each cut (HUNTER's call running on under the
// systems), and the score (tools/trailer/score.py) from a cue sheet made here: drone, pulse, hits, whooshes, risers,
// the boom, the braam.
//   node tools/trailer/make.cjs        ->  tests/out/trailer/saqr-trailer.mp4 (1920 x 1080, 30 fps, 30 s)
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..', '..'), OUT = process.env.TRAILER_OUT || path.join(ROOT, 'tests', 'out', 'trailer'), W = 1920, H = 1080, FPS = 30;
const BAR = Math.round((H - W / 2.2) / 2);   // the letterbox bars, top and bottom
const SHOTS = ['k1-seat', 'k2-arm', 'k3-flare', 'k4-lock', 'k5-strike', 'k6-after'];
const BPM = 120;
// The edit: sections, each a few cuts (a shot, from, to: seconds of the shot; or 'black', a length) played one after
// the other; `in` is how the section comes in (glitch, flash, white, black), `sub` how its later cuts do. Captions are on
// the section's own clock. Times given by a mark (the flare lighting, the first blast) are resolved from the
// recording. Every section a whole number of beats:
//   intro 3.5 · dark 3.0 · arm 3.0 · flare 4.0 · lock 3.0 · strike 6.5 · after 2.5 · end card 4.5   = 30 s
const INTRO = 3.5;
const EDIT = m => [
  { name: 'dark', in: 'glitch', cuts: [['k1-seat', 1.0, 4.0]],
    caps: [{ at: 0.2, to: 2.9, tag: '02:14Z  //  VALLEY', ar: 'في عتمة الوادي', en: 'IN THE DARK OF THE VALLEY' }] },
  { name: 'arm', in: 'flash', sub: 'flash', cuts: [['k2-arm', 0.6, 1.6], ['k2-arm', 3.4, 4.4], ['k2-arm', 5.1, 6.1]],
    caps: [{ at: 0.1, to: 2.9, tag: 'A/S ARM  //  WAS RKT  //  LRF', ar: 'تفعيل الأنظمة', en: 'SYSTEMS ONLINE · WEAPONS HOT' }] },
  { name: 'flare', in: 'glitch', cuts: [['k3-flare', 0.4, 1.4], ['k3-flare', m.ignite - 0.5, m.ignite + 2.5]],
    caps: [{ at: 1.6, to: 3.9, tag: 'M257  //  1,000,000 CD', ar: 'أضِئ السماء', en: 'LIGHT UP THE SKY' }] },
  { name: 'lock', in: 'flash', sub: 'glitch', cuts: [['k4-lock', 0.3, 1.3], ['k4-lock', 4.7, 6.7]],
    caps: [{ at: 0.1, to: 2.9, tag: 'IAT  //  LASE CODE A 1688  //  LOBL', ar: 'منصة صواريخ بين الأشجار', en: 'MISSILE LAUNCHER · TREE LINE' }] },
  { name: 'strike', in: 'white', sub: 'black', cuts: [['k5-strike', 0, 1.5], ['black', 0.5], ['k5-strike', m.boom - 1.0, m.boom + 3.5, { z: [1.05, 1.85], cx: 0.5, cy: 0.47 }]], caps: [] },
  { name: 'after', in: 'flash', cuts: [['k6-after', 0.6, 3.1]],
    caps: [{ at: 0.1, to: 2.4, tag: 'BDA  //  TARGET DESTROYED', ar: 'الحرب من داخل القمرة', en: 'THE WAR, FROM THE COCKPIT' }] },
];
const END = 4.5;
const grid = t => Math.round(t * FPS) / FPS;   // (cuts on whole frames)
// the grade: night-blue shadows, warm highlights, contrast; the screens' glow blooming and a thin streak off the
// brightest lights (as a cinema lens would); a vignette, fine moving grain, the bars. GRADE(input, output) is a chain.
const LOOK = `eq=contrast=1.06:saturation=1.05:gamma=1.28:brightness=0.015,colorbalance=rs=-0.04:bs=0.06:rm=-0.01:bm=0.02:rh=0.07:gh=0.03:bh=-0.05`;
const FINISH = `unsharp=5:5:0.35,vignette=angle=PI/6,noise=alls=5:allf=t+u,drawbox=x=0:y=0:w=iw:h=${BAR}:color=black:t=fill,drawbox=x=0:y=ih-${BAR}:w=iw:h=${BAR}:color=black:t=fill`;
const GRADE = (i, o, id) => `[${i}]${LOOK},split=3[${id}a][${id}b][${id}c];` +
  `[${id}b]curves=all='0/0 0.6/0 1/1',gblur=sigma=18,colorchannelmixer=rr=1:gg=0.95:bb=0.85[${id}g];` +
  `[${id}c]curves=all='0/0 0.86/0 1/1',gblur=sigma=70:sigmaV=1.5,colorchannelmixer=rr=0.55:gg=0.8:bb=1.25[${id}s];` +
  `[${id}a][${id}g]blend=all_mode=screen:all_opacity=0.38[${id}d];[${id}d][${id}s]blend=all_mode=screen:all_opacity=0.45,${FINISH}[${o}]`;
// a cut's way in: the push (a quick zoom settling, then a slow creep in), and the transition on its first frames. A
// cut may ask instead for a long eased push from z0 to z1 onto a point (cx, cy: fractions of the picture)
const PUSH = (secs, punch, o) => {
  const n = Math.round(secs * FPS), e = `(1-cos(PI*min(1,on/${n})))/2`;
  const z = o && o.z ? `${o.z[0]}+${o.z[1] - o.z[0]}*${e}` : `1+${punch ? 0.06 : 0}*max(0,1-on/9)+${(0.03 / secs).toFixed(5)}*on/30`;
  const cx = o && o.cx || 0.5, cy = o && o.cy || 0.5;
  return `scale=3840:2160:flags=bicubic,zoompan=z='${z}':d=1:x='iw*${cx}-iw/zoom/2':y='ih*${cy}-ih/zoom/2':s=${W}x${H}:fps=${FPS}`;
};
const TRANS = {
  flash: `fade=t=in:st=0:d=0.16:color=0xFFF4E2`,
  white: `fade=t=in:st=0:d=0.3:color=0xFFFFFF`,
  black: `fade=t=in:st=0:d=0.25:color=black`,
  glitch: `rgbashift=rh=-16:bh=16:gv=4:enable='lt(t,0.12)',noise=alls=45:allf=t:enable='lt(t,0.1)',fade=t=in:st=0:d=0.06:color=black`,
  cut: `null`,
};
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

// The intro: the satellite's infrared feed of the valley, the map zooming in three steps onto the tree line, a grid,
// the feed's own lines typed in the corners, a scan bar, and the target boxed as the last step lands; the mission's
// caption at the lower right as for the cuts.
const INTRO_CSS = `
  .sat{position:absolute;inset:0;overflow:hidden;background:#000}
  .map{position:absolute;left:0;top:0;width:3344px;height:1882px;background-size:3344px 1882px;transform-origin:1830px 1290px;
    filter:grayscale(1) contrast(1.45) brightness(.62) sepia(.28) hue-rotate(92deg) saturate(1.5) blur(.4px)}
  .grid{position:absolute;inset:0;background-image:linear-gradient(rgba(150,255,190,.08) 1px,transparent 1px),linear-gradient(90deg,rgba(150,255,190,.08) 1px,transparent 1px);background-size:120px 120px;background-position:center}
  .lines{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.22) 0 1px,transparent 1px 3px)}
  .bar{position:absolute;left:0;right:0;height:140px;background:linear-gradient(transparent,rgba(170,255,200,.07),transparent)}
  .vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,transparent 45%,rgba(0,0,0,.75) 100%)}
  .hud{position:absolute;inset:${BAR + 34}px 70px;font-family:M;font-size:15px;letter-spacing:.2em;color:#a8f0c0;text-shadow:0 0 6px rgba(120,255,170,.5)}
  .hud .tl{position:absolute;left:0;top:0;white-space:pre} .hud .tr{position:absolute;right:0;top:0;text-align:right;white-space:pre}
  .hud .bl{position:absolute;left:0;bottom:0;white-space:pre}
  .hud .k{position:absolute;width:28px;height:28px;border:1.5px solid rgba(168,240,192,.7)}
  .xh{position:absolute;left:50%;top:50%;width:90px;height:90px;margin:-45px 0 0 -45px}
  .xh:before,.xh:after{content:'';position:absolute;background:rgba(168,240,192,.75)}
  .xh:before{left:44px;top:0;width:1.5px;height:90px} .xh:after{top:44px;left:0;height:1.5px;width:90px}
  .tgt{position:absolute;left:50%;top:50%;width:150px;height:110px;margin:-55px 0 0 -75px;border:2px solid #ffcf7a;box-shadow:0 0 14px rgba(255,190,90,.6)}
  .tgt span{position:absolute;left:0;top:-30px;font-family:M;font-size:14px;letter-spacing:.2em;color:#ffcf7a;white-space:pre}`;

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
    // (one that comes in late is in by the time all go out)
    const lim = out == null ? D : out, t1 = Math.min(t0, lim - 1), t2 = Math.min(t0 + len, lim);
    go(el, [k(0, a), k(t1, a, e), k(Math.max(t1, t2), b), ...tail]);
  }
  for (const el of document.querySelectorAll('.title')) go(el, [k(0, { backgroundPosition: '100% 0' }), k(1700, { backgroundPosition: '100% 0' }, 'cubic-bezier(.4,0,.2,1)'), k(3100, { backgroundPosition: '0% 0' }), k(D, { backgroundPosition: '0% 0' })]);
  for (const x of document.getAnimations()) x.pause();
}`;

// (required from elsewhere, only the design: to look at it over a still)
module.exports = { CSS, ANIM, W, H, BAR };
if (require.main === module) (async () => {
  for (const n of SHOTS) if (!fs.existsSync(path.join(OUT, n, '00000.jpg')) || !fs.existsSync(path.join(OUT, n + '.wav'))) throw new Error('shot not recorded: ' + n);
  // the flare's moment in its shot: where the picture brightens fastest; the Hellfire's arrival: the first big blast
  const ign = +execFileSync('python3', ['-c', `
import sys, glob
from PIL import Image, ImageStat
fs = sorted(glob.glob(sys.argv[1] + '/*.jpg')); v = [ImageStat.Stat(Image.open(f).convert('L').resize((96, 54)).crop((30, 14, 66, 40))).mean[0] for f in fs]
d = [v[i + 6] - v[i] for i in range(len(v) - 6)]; print(d.index(max(d)) / 30)`, path.join(OUT, 'k3-flare')]).toString().trim();
  const booms = JSON.parse(fs.readFileSync(path.join(OUT, 'k5-strike.json'))).booms;
  const marks = { ignite: grid(ign), boom: grid(booms.length ? booms[0] : 6.2) };
  console.log('the flare lights', marks.ignite, 's into its shot; the blast', marks.boom, 's into its');
  const edit = EDIT(marks), len = c => c[0] === 'black' ? c[1] : c[2] - c[1];
  let t0 = INTRO;
  for (const sec of edit) {
    sec.cuts = sec.cuts.map(c => c[0] === 'black' ? c : [c[0], grid(c[1]), grid(c[2]), c[3]]);
    sec.secs = sec.cuts.reduce((x, c) => x + len(c), 0); sec.t = t0;
    let u = t0; sec.at = sec.cuts.map(c => { const v = u; u += len(c); return v; }); t0 += sec.secs;
  }
  const tEnd = t0, total = tEnd + END;
  // where a moment of a shot falls in the cut
  const at = (n, t) => { for (const sec of edit) for (const [i, c] of sec.cuts.entries()) if (c[0] === n && t >= c[1] && t <= c[2]) return sec.at[i] + t - c[1]; return null; };

  // the satellite's picture: the valley's level-1 tiles as one image
  const mapImg = path.join(OUT, 'intro-map.jpg');
  if (!fs.existsSync(mapImg)) execFileSync('python3', ['-c', `
import sys
from PIL import Image
im = Image.new('RGB', (3344, 1882))
for x in range(4):
  for y in range(2): im.paste(Image.open(f'${ROOT}/tiles/1/{x}_{y}.jpg'), (x * 1024, y * 1024))
im.save(sys.argv[1], quality=90)`, mapImg]);

  // the captions, the intro and the end card, frame by frame (the captions and the card transparent)
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const css = CSS() + INTRO_CSS, esc = t => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const capHTML = c => `<div class="scrim"></div><div class="cap"><div class="body">${c.tag ? `<div class="meta" data-in="200" data-kind="type">${esc(c.tag)}</div>` : ''}<div class="ar" data-in="300" data-kind="reveal">${esc(c.ar)}</div><div class="en" data-in="750">${esc(c.en)}</div></div><div class="vbar" data-in="0" data-kind="vgrow"></div></div>`;
  const frames = async (dir, inner, secs, o = {}) => {
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    await page.setContent(`<html><head><style>${css}</style></head><body>${inner}</body></html>`);
    await page.evaluate(() => document.fonts.ready);
    if (o.img) await page.evaluate(() => new Promise(r => { const i = new Image(); i.onload = r; i.src = document.querySelector('.map').style.backgroundImage.slice(5, -2); }));
    await page.evaluate(([f, D, end]) => (0, eval)('(' + f + ')')(D, end), [ANIM, Math.round(secs * 1000), !!o.end]);
    if (o.extra) await page.evaluate(([f, D]) => (0, eval)('(' + f + ')')(D), [o.extra, Math.round(secs * 1000)]);
    for (let i = 0, n = Math.round(secs * FPS); i < n; i++) {
      await page.evaluate(ms => { for (const a of document.getAnimations()) a.currentTime = ms; }, i * 1000 / FPS);
      await page.screenshot(o.opaque ? { path: path.join(dir, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 95 } : { path: path.join(dir, String(i).padStart(5, '0') + '.png'), omitBackground: true });
    }
  };
  for (const sec of edit) for (const [i, c] of sec.caps.entries()) await frames(path.join(OUT, `cap-${sec.name}-${i}`), capHTML(c), c.to - c.at);
  const mapURL = 'data:image/jpeg;base64,' + fs.readFileSync(mapImg).toString('base64');
  const k = (x, y, b) => `<span class="k" style="${x}:0;${y}:0;border-${b[0]}:0;border-${b[1]}:0"></span>`;
  await frames(path.join(OUT, 'intro'), `<div class="sat"><div class="map" style="left:${W / 2 - 1830}px;top:${H / 2 - 1290}px;background-image:url('${mapURL}')"></div><div class="grid"></div><div class="lines"></div><div class="bar"></div><div class="vig"></div>
    <div class="xh"></div><div class="tgt" data-in="2350" data-kind="frame"><span>TEL  //  PRIORITY 1</span></div>
    <div class="hud">${k('left', 'top', ['right', 'bottom'])}${k('right', 'top', ['left', 'bottom'])}${k('left', 'bottom', ['right', 'top'])}${k('right', 'bottom', ['left', 'top'])}
      <div class="tl" data-in="150" data-kind="type">SAT-7  //  IR  //  02:14:07Z</div><div class="tr" data-in="500" data-kind="type">TASKING  HUNTER 2-1</div>
      <div class="bl" data-in="1300" data-kind="type">GRID 41778 08322   ELEV 407 M</div></div></div>
    ${capHTML({ tag: 'MISSION 03', ar: 'كمين ليلي', en: 'NIGHT AMBUSH · DESTROY THE LAUNCHER' })}`, INTRO, { opaque: true, img: true,
    // the map's three steps in, the scan bar going down the feed
    extra: `D => {
      const s = [[0, .62], [550, .62], [950, 1.25], [1350, 1.25], [1750, 2.2], [2150, 2.2], [2550, 3.4], [D, 3.55]];
      document.querySelector('.map').animate(s.map(([t, z]) => ({ offset: t / D, transform: 'scale(' + z + ')', easing: 'cubic-bezier(.6,0,.2,1)' })), { duration: D, fill: 'both' });
      document.querySelector('.bar').animate([{ transform: 'translateY(-160px)' }, { transform: 'translateY(${H}px)' }], { duration: 1500, iterations: Infinity });
      document.querySelector('.tgt').animate([{ opacity: 1 }, { opacity: .35 }, { opacity: 1 }], { duration: 260, delay: 2600, iterations: Infinity });
      for (const x of document.getAnimations()) x.pause();
    }` });
  await frames(path.join(OUT, 'cap-end'), `<div class="end"><div class="meta" data-in="100" data-kind="type">AH-64E  //  CPG  //  NIGHT</div>
    <div class="box"><span class="c tl" data-in="200" data-kind="frame"></span><span class="c tr" data-in="200" data-kind="frame"></span><span class="c bl" data-in="200" data-kind="frame"></span><span class="c br" data-in="200" data-kind="frame"></span>
      <div class="tw"><div class="title" data-in="300" data-kind="reveal">صقر الوادي</div></div><div class="latin" data-in="800">SAQR AL-WADI</div></div>
    <div class="sub" data-in="1150"><span class="a">محاكاة طيران وحرب</span><span class="d"></span><span class="e">FLIGHT &amp; COMBAT SIMULATOR</span></div>
    <div class="soon" data-in="1800" data-kind="pop"><span class="a">قريبًا</span><span class="s"></span><span class="e">COMING SOON</span></div>
    <div class="where" data-in="2300">على الآيفون<span class="e">ON iPHONE</span></div></div>`, END, { end: true });
  await browser.close();

  const enc = ['-r', String(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '16', '-pix_fmt', 'yuv420p'];
  const parts = [];
  // the intro: grain and the bars over the feed
  const introFile = path.join(OUT, 'part-intro.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(OUT, 'intro', '%05d.jpg'), '-vf', `${FINISH},fade=t=in:st=0:d=0.4,setsar=1`, '-t', String(INTRO), ...enc, introFile]);
  parts.push(introFile);
  // each section: its cuts pushed in, graded, each brought in by its transition, joined; its captions laid over
  for (const sec of edit) {
    const args = ['-y', '-loglevel', 'error'];
    sec.cuts.forEach(c => c[0] === 'black' ? args.push('-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${FPS}:d=${c[1]}`)
      : args.push('-framerate', String(FPS), '-start_number', String(Math.round(c[1] * FPS)), '-i', path.join(OUT, c[0], '%05d.jpg')));
    const nc = sec.cuts.length;
    sec.caps.forEach((c, i) => args.push('-framerate', String(FPS), '-itsoffset', String(c.at), '-i', path.join(OUT, `cap-${sec.name}-${i}`, '%05d.png')));
    const f = sec.cuts.map((c, i) => {
      const tr = TRANS[i === 0 ? sec.in : sec.sub || 'cut'];
      if (c[0] === 'black') return `[${i}:v]format=yuv420p,setsar=1[c${i}]`;
      return `[${i}:v]trim=end_frame=${Math.round(len(c) * FPS)},setpts=PTS-STARTPTS,${PUSH(len(c), i === 0 || (sec.sub && sec.sub !== 'cut'), c[3])},setsar=1[p${i}];` + GRADE(`p${i}`, `g${i}`, `x${i}`) + `;[g${i}]${tr},format=yuv420p[c${i}]`;
    });
    let g = f.join(';') + `;${sec.cuts.map((_, i) => `[c${i}]`).join('')}concat=n=${nc}:v=1:a=0[v0]`;
    sec.caps.forEach((c, i) => { g += `;[v${i}][${nc + i}:v]overlay=0:0:eof_action=pass[v${i + 1}]`; });
    const file = path.join(OUT, `part-${sec.name}.mp4`);
    run('ffmpeg', [...args, '-filter_complex', g, '-map', `[v${sec.caps.length}]`, '-t', sec.secs.toFixed(3), ...enc, file]);
    parts.push(file);
  }
  // the end card over the last cut's final frame, blurred, darkened, slowly closer
  const lastCut = edit[edit.length - 1].cuts.slice(-1)[0], lastFrame = path.join(OUT, lastCut[0], String(Math.round(lastCut[2] * FPS) - 1).padStart(5, '0') + '.jpg');
  const endFile = path.join(OUT, 'part-end.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-loop', '1', '-framerate', String(FPS), '-t', String(END), '-i', lastFrame, '-framerate', String(FPS), '-i', path.join(OUT, 'cap-end', '%05d.png'),
    '-filter_complex', `[0:v]scale=${Math.round(W * 1.15)}:${Math.round(H * 1.15)},zoompan=z='1+0.0008*on':d=1:s=${W}x${H}:fps=${FPS},boxblur=26:2,eq=brightness=-0.3:saturation=0.7,${LOOK},${FINISH},fade=t=in:st=0:d=0.12:color=white,setsar=1[bg];[bg][1:v]overlay=0:0,fade=t=out:st=${END - 0.6}:d=0.6[v]`,
    '-map', '[v]', '-t', String(END), ...enc, endFile]);
  parts.push(endFile);
  fs.writeFileSync(path.join(OUT, 'parts.txt'), parts.map(p => `file '${p}'`).join('\n'));
  const video = path.join(OUT, 'video.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'parts.txt'), '-c', 'copy', video]);

  // the score's cue sheet, on the cut's clock
  const S = Object.fromEntries(edit.map(sec => [sec.name, sec])), drop = (() => { const s = S.strike, i = s.cuts.findIndex(c => c[0] === 'black'); return [s.at[i], s.at[i] + s.cuts[i][1]]; })();
  const tIgn = at('k3-flare', marks.ignite), tBoom = at('k5-strike', marks.boom);
  const sizes = { dark: 0.8, arm: 1.0, flare: 0.9, lock: 0.9, strike: 1.3, after: 0.6 };
  const ev = [{ t: 0, k: 'drone', end: total }, { t: 0, k: 'heart', end: INTRO },
    { t: 0.15, k: 'ticks', n: 18 }, { t: 0.5, k: 'ticks', n: 14 }, { t: 1.3, k: 'ticks', n: 20 }, { t: 2.4, k: 'ticks', n: 6, gap: 0.08 },
    ...[0.95, 1.75, 2.55].flatMap(t => [{ t, k: 'whoosh', dur: 0.45 }, { t, k: 'hit', size: 0.3 }])];
  for (const sec of edit) {
    ev.push({ t: sec.t, k: 'whoosh' }, { t: sec.t, k: 'hit', size: sizes[sec.name] || 0.8 });
    sec.cuts.forEach((c, i) => { if (i && c[0] !== 'black' && sec.sub !== 'black') ev.push({ t: sec.at[i], k: 'hit', size: 0.45 }); });
  }
  ev.push({ t: S.arm.t, k: 'pulse', end: drop[0] }, { t: tIgn, k: 'shimmer' }, { t: tIgn, k: 'hit', size: 1.0 },
    { t: S.strike.t - 2, k: 'riser', end: S.strike.t }, { t: S.strike.t, k: 'braam' },
    { t: drop[0], k: 'drop', end: drop[1] }, { t: tBoom, k: 'swell', dur: tBoom - drop[1] }, { t: tBoom, k: 'boom' }, { t: tBoom + 0.1, k: 'ring', dur: 2.6 },
    { t: tEnd - 1.5, k: 'riser', end: tEnd }, { t: tEnd, k: 'swell', dur: 1.2 }, { t: tEnd, k: 'braam' }, { t: tEnd, k: 'hit', size: 1.5 });
  const cueFile = path.join(OUT, 'cues.json'), score = path.join(OUT, 'score.wav');
  fs.writeFileSync(cueFile, JSON.stringify({ dur: total, bpm: BPM, events: ev }, null, 1));
  run('python3', [path.join(__dirname, 'score.py'), cueFile, score]);

  // the game's sound: nothing under the feed, each cut's own stretch of its shot (silence for the black), HUNTER's call
  // running on under the systems (its band only: the radio, not a second rotor), the rotor dying away under the card
  const ins = [...new Set(edit.flatMap(sec => sec.cuts.filter(c => c[0] !== 'black').map(c => c[0])))], idx = n => ins.indexOf(n);
  const fmt = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
  const segs = [`anullsrc=r=48000:cl=stereo,atrim=duration=${INTRO},${fmt}[a0]`];
  let ni = 1;
  for (const sec of edit) for (const c of sec.cuts) {
    segs.push(c[0] === 'black' ? `anullsrc=r=48000:cl=stereo,atrim=duration=${c[1]},${fmt}[a${ni}]`
      : `[${idx(c[0])}:a]${fmt},atrim=start=${c[1]}:end=${c[2]},asetpts=PTS-STARTPTS,afade=t=in:d=0.012,afade=t=out:st=${(len(c) - 0.012).toFixed(3)}:d=0.012[a${ni}]`);
    ni++;
  }
  const d0 = S.dark.cuts[0], lFrom = d0[2], lTo = d0[2] + 3.0;
  let af = segs.join(';') + `;${Array.from({ length: ni }, (_, i) => `[a${i}]`).join('')}concat=n=${ni}:v=0:a=1[cat]`;
  af += `;[${idx('k1-seat')}:a]${fmt},atrim=start=${lFrom}:end=${lTo},asetpts=PTS-STARTPTS,highpass=f=380,lowpass=f=3600,afade=t=out:st=2.4:d=0.6,adelay=${Math.round(S.arm.t * 1000)}|${Math.round(S.arm.t * 1000)}[lc]`;
  af += `;[cat][lc]amix=inputs=2:duration=first:normalize=0,apad=whole_dur=${total},afade=t=out:st=${tEnd}:d=${END - 0.5},volume=0.62[game]`;
  const sound = path.join(OUT, 'sound.wav');
  run('ffmpeg', ['-y', '-loglevel', 'error', ...ins.flatMap(n => ['-i', path.join(OUT, n + '.wav')]), '-i', score,
    '-filter_complex', `${af};[${ins.length}:a]${fmt}[sc];[game][sc]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-14:TP=-1.2:LRA=14[a]`, '-map', '[a]', '-ar', '48000', sound]);
  const final = path.join(OUT, 'saqr-trailer.mp4');
  run('ffmpeg', ['-y', '-loglevel', 'error', '-i', video, '-i', sound, '-map', '0:v', '-map', '1:a', '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '256k', '-shortest', '-movflags', '+faststart', final]);
  console.log(final, (fs.statSync(final).size / 1e6).toFixed(1), 'MB,', total.toFixed(2), 's');
})();
