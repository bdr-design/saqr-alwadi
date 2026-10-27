// The trailer's camera rig: opens the game in a browser of its own, takes its frame loop over (the page's
// requestAnimationFrame is held, and each frame is run by hand at a fixed step), hides the controls, and logs every
// sound the game makes with its time on the trailer's clock, for the sound track (tools/trailer/make.cjs).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const body = fs.readFileSync(ROOT + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(ROOT + '/tests/three.min.js', 'utf8');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
const FPS = 30, VW = 960, VH = 540, DSF = +process.env.TRAILER_DSF || 3;   // (TRAILER_DSF=1: quick looks)
// (ac: 'f15' for the F-15SA's back seat, else the Apache)
async function open(browser, map, ac) {
  const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DSF });
  await ctx.addInitScript(([m, ac]) => {
    try { localStorage.setItem('saqr.map', m); localStorage.setItem('saqr.ac', ac || 'ah64'); localStorage.setItem('saqr.hi', '1'); localStorage.setItem('saqr.sound', '1'); } catch (_) {}
    window.__capture = true;
    // hold the page's frames: until the rig takes over they run on a 16 ms timer, then only when stepped
    const q = []; let manual = false;
    window.requestAnimationFrame = cb => { q.push(cb); return q.length; };
    window.__step = t => { const cbs = q.splice(0); for (const cb of cbs) cb(t); };
    setInterval(() => { if (!manual) window.__step(performance.now()); }, 16);
    window.__manual = () => { manual = true; };
  }, [map, ac]);
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('page error:', e.message));
  page.on('console', m => { if (m.type() === 'log' && m.text().startsWith('cue:')) console.log(m.text()); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(ROOT, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
  // a clean picture: no buttons, no SIM tag; the sensor's own symbology and the cockpit stay
  await page.addStyleTag({ content: '#railL,#railR,#dock,.sim,#btnShot,#btnCenter,#btnCock{display:none!important}' });
  return { ctx, page };
}
// start a mission, then the sound log on the trailer's clock (window.__vt, seconds); `before(mission)` may change the
// mission's layout first
async function start(page, id, setup, before) {
  await page.evaluate(([id, setup, before]) => {
    const g = window.__saqr, S = g.S;
    const i = g.MISSIONS.findIndex(m => m.id === id);
    if (before) (0, eval)('(' + before + ')')(g.MISSIONS[i]); document.querySelector(`#mList button:nth-child(${i + 1})`).click(); document.querySelector('#btnStart').click();
    g.AC.hp = 1e9; for (const f of g.friends) f.hp = 1e9;
    // (the unwrapped functions stay in window.__orig, to replay the log into the sound track)
    window.__vt = 0; const ev = window.__ev = [], Snd = g.Snd, orig = window.__orig = {};
    for (const k of ['launch', 'rocket', 'gun', 'boom', 'impact', 'mws', 'flare', 'crack', 'caution']) { const f = orig[k] = Snd[k].bind(Snd); Snd[k] = (...a) => { ev.push({ t: window.__vt, k, a, s: window.__speed || 1 }); return f(...a); }; }
    const tx = orig.transmit = Snd.transmit.bind(Snd); Snd.transmit = (c, net, bed) => { ev.push({ t: window.__vt, k: 'transmit', c, net, bed }); return tx(c, net, bed); };
    if (setup) (0, eval)('(' + setup + ')')(g);
  }, [id, setup ? setup.toString() : null, before ? before.toString() : null]);
  await page.waitForTimeout(1500);
}
// run the game for `secs` of the trailer, a step a frame; `cue(g, t)` runs in the page before each frame (t: seconds
// into the shot) and may return the game's speed for that frame (1 real time, 0.3 a slow-motion third). Each frame is
// written to dir/%05d.jpg
async function shoot(page, dir, secs, cue, warm) {
  fs.mkdirSync(dir, { recursive: true });
  const n = Math.round(secs * FPS);
  await page.evaluate(() => { window.__manual(); if (window.__T == null) window.__T = performance.now(); });
  // a few frames first so the transitions and tiles settle (not kept)
  for (let i = 0; i < (warm || 0); i++) await page.evaluate(() => { window.__T += 1000 / 30; window.__step(window.__T); });
  for (let i = 0; i < n; i++) {
    await page.evaluate(([i, cue]) => {
      const g = window.__saqr, t = i / 30; window.__vt = (window.__vtBase || 0) + t;
      const r = cue ? (0, eval)('(' + cue + ')')(g, t) : 1, sp = typeof r === 'number' ? r : 1;
      window.__speed = sp; window.__T += sp * 1000 / 30; window.__step(window.__T);
      // a key pressed in a cue keeps its pressed look for a few frames (window.__pn)
      if (window.__pn > 0) { window.__pn--; document.querySelector('#ckPress').classList.add('on'); }
    }, [i, cue ? cue.toString() : null]);
    await page.screenshot({ path: path.join(dir, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 94 });
  }
  await page.evaluate(n => { window.__vtBase = (window.__vtBase || 0) + n / 30; }, n);
}
module.exports = { open, start, shoot, FPS, ROOT, chromium };
