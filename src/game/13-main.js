/* ===================== frame ===================== */
function resize() {
  pfEv('resize'); prNext = 0;   // (a step still waiting gives way to this one)
  layoutOrientation();
  VW = Math.max(1, app.clientWidth); VH = Math.max(1, app.clientHeight);
  renderer.setPixelRatio(PR); renderer.setSize(VW, VH, false);
  const w = Math.round(VW * PR), h = Math.round(VH * PR);
  rtA.setSize(w, h); rtL.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); rtE.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); rtH.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  post.uniforms.res.value.set(w >> 1, h >> 1); post.uniforms.resA.value.set(w, h);
  ckResize(); if (JET) efbLayout();
  // layout (untransformed) offsets, so the symbology lines up in the rotated console too
  const rl = $('#railL'), rr = $('#railR'), dk = $('#dock');
  railLx = rl.offsetLeft + rl.offsetWidth + 12; railRx = VW - rr.offsetLeft + 12;
  topInset = Math.max(0, rl.offsetTop - 10); botInset = Math.max(0, VH - (dk.offsetTop + dk.offsetHeight) - 10);
  hudLayout();   // (its blocks where the rails now are, each drawn again at the next frame, not the next 30th)
}
let ROT = false;
function layoutOrientation() {
  // the sim is landscape only: in a portrait window the whole console is turned on its side
  ROT = window.innerHeight > window.innerWidth;
  app.classList.toggle('rot', ROT);
  app.style.width = ROT ? window.innerHeight + 'px' : '';
  app.style.height = ROT ? window.innerWidth + 'px' : '';
}
window.addEventListener('resize', resize);
if (window.ResizeObserver) new ResizeObserver(resize).observe(app);

// a pass into a target, skipped when it has nothing to draw and the target is already clear from the last time
let vidT = 0, vidFresh = false, vidA = null;   // (vidFresh: the sensor's picture drawn again this frame; the TEDAC's symbology and the MPDs' copy of it follow it)
// (an effect layer with something in the sensor's picture: an instance inside its view's turned box, with its own size
// and the post's glow reach, 12 px, round it. A burning wreck puts a light and a fire glow each frame wherever it is, for
// a minute after each kill: the light and fire passes, and the post's reads of them, had run with all of it out of sight)
function layerSeen(l) {
  if (!l.n) return false;
  const v = S.view, P = l.aPos.array, Sc = l.aScale.array, hw = v.w / 2 * OVERSCAN, hh = v.h / 2 * OVERSCAN, m = 12 * v.w / Math.max(1, VW * PR);
  for (let i = 0; i < l.n; i++) { const dx = P[2 * i] - v.cx, dy = P[2 * i + 1] - v.cy, r = 0.71 * Math.max(Sc[2 * i], Sc[2 * i + 1]) + m;
    if (Math.abs(dx * v.R.x + dy * v.R.y) <= hw + r && Math.abs(dx * v.D.x + dy * v.D.y) <= hh + r) return true; }
  return false;
}
const rtClear = new WeakSet();
function pass(rt, scene, empty, camera) {
  if (empty && rtClear.has(rt)) return;
  renderer.setRenderTarget(rt); renderer.clear(); if (!empty) renderer.render(scene, camera || cam);
  if (empty) rtClear.add(rt); else rtClear.delete(rt);
}
function renderFrame(dt) {
  { const v = S.view, ox = v.w * (OVERSCAN - 1) / 2, oy = v.h * (OVERSCAN - 1) / 2; updateTiles(v.x0 - ox, v.y0 - oy, v.x1 + ox, v.y1 + oy); }
  updateCountry();
  for (const l of LAYERS) l.flush();
  renderer.setClearColor(0x000000, 1);
  // sensor: full-size targets when it fills the screen (or is zooming), small ones while it sits in the TEDAC
  const ck = CK.t < 1, small = CK.t === 0 && CK.lean < 1.25;
  const A = small ? rtAs : rtA, L = small ? rtLs : rtL, E = small ? rtEs : rtE, Hh = small ? rtHs : rtH;
  post.uniforms.tA.value = A.texture; post.uniforms.tL.value = L.texture; post.uniforms.tE.value = E.texture; post.uniforms.tH.value = Hh.texture;
  post.uniforms.resA.value.set(A.width, A.height); post.uniforms.res.value.set(E.width, E.height);
  // (the sensor's video in the TEDAC or on an MPD is drawn 30 times a second, as the real video is; the screen still
  // shows it every frame. Its lights and fire targets are not drawn again while they stay empty)
  // (the 30 a second with half a screen interval's grace: at 1000/31 against a 1 ms clock, a redraw in four had come a
  // frame late, the video stepping 33 and 50 ms. Leaned in, the TEDAC's video at its 30 too: full size every frame
  // there had cost some 2 ms for the same picture. The first frame on a change of target drawn at once: back in the seat
  // after the full screen, the TEDAC had shown its picture from before for a frame)
  const now = performance.now();
  if ((!small && CK.t > 0) || A !== vidA || now - vidT >= 1000 / 30 - rafI / 2 || window.__capture) {
    vidT = now; vidFresh = true; vidA = A;
    renderer.setRenderTarget(A); renderer.clear(); renderer.render(sceneA, cam);
    pass(L, sceneL, !layerSeen(lightL) && !layerSeen(coneL));
    pass(E, sceneE, !layerSeen(fireL) && !layerSeen(glowE));
    if (S.sensor !== 'eo') { renderer.setRenderTarget(Hh); renderer.clear(); renderer.render(sceneH, cam); }
  }
  post.uniforms.hasL.value = rtClear.has(L) ? 0 : 1; post.uniforms.hasE.value = rtClear.has(E) ? 0 : 1;
  if (!ck) { renderer.setRenderTarget(null); renderer.clear(); renderer.render(postScene, postCam); return; }
  // cockpit: the world through the glass, its helmet cues, then the sensor video inside the TEDAC's rectangle
  renderWindow(); drawIhads();
  // (to the screen: with no glass in view, renderWindow drew nothing and left the sensor's last target bound)
  const r = CK.sens;
  renderer.setRenderTarget(null);
  const box = screenBox(r.x, r.y, r.x + r.w, r.y + r.h);
  renderer.setViewport(...box); renderer.setScissor(...box); renderer.setScissorTest(true);
  renderer.render(postScene, postCam);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, VW, VH);
}
let last = performance.now(), slowT = 0, uiT = 0, engT = 0, lastDraw = 0, hudBlank = false, hudT = 0, hudPrev = false;
// The phone's heat, from the iOS app (ProcessInfo.thermalState: 0 nominal, 1 fair, 2 serious, 3 critical). Hot, the
// picture keeps its resolution and draws 30 frames a second; only at critical does high quality also go to 2× pixels,
// until the phone has cooled. (Each change starts the adaptive resolution's count afresh, as a change of quality
// does: a slowness counted before it would take the cooled phone's 3× straight back down.)
let THERMAL = +window.__thermalLevel || 0;
window.__thermal = l => {
  const was = THERMAL; THERMAL = +l || 0;
  if (HIQ && THERMAL >= 3 && PR > 2) { PR = 2; slowT = 0; resize(); }
  else if (HIQ && THERMAL <= 1 && was >= 3) { PR = Math.min(window.devicePixelRatio || 1, 3); slowT = 0; resize(); }
};
// The measuring panel (docs/PLAN.md, stage 4): hidden. Five quick taps on the menu's title open it and close it, and
// it stays as chosen (#perf in the address opens it too). The machine these were made on draws with its processor,
// so what the phone's GPU costs, and how it holds up over half an hour, is read on the phone: the frame's time (the
// interval: a GPU behind shows there), the page's own work in it, the draws and triangles, the textures and planes
// held, the heap where the browser tells it, the resolution, the heat. A line every 10 s is kept (an hour of them,
// across reloads): «نسخ السجل» puts them on the clipboard to be sent.
const PERF = { on: false, el: null, txt: null, taps: [], last: 0, n: 0, sum: 0, work: 0, max: 0, calls: 0, tris: 0, t: 0, logT: 0, saveT: 0, log: [], slow: [], win: {}, nWin: 0, t0: performance.now(),
  h: [0, 0, 0, 0], tight: 0, skipN: 0, postMax: 0, inpSum: 0, gpuMax: 0 };
try { PERF.log = JSON.parse(localStorage.getItem('saqr.perflog') || '[]'); } catch (_) { PERF.log = []; }
try { PERF.slow = JSON.parse(localStorage.getItem('saqr.perfslow') || '[]'); } catch (_) { PERF.slow = []; }
// (saved a minute at a time and when the page goes out of sight, not every 10 s: the save is the page's own work, and
// written down as such, pfEv('log'))
function perfSave() { pfEv('log'); try { localStorage.setItem('saqr.perflog', JSON.stringify(PERF.log)); localStorage.setItem('saqr.perfslow', JSON.stringify(PERF.slow)); } catch (_) {} }
document.addEventListener('visibilitychange', () => { if (document.hidden && PERF.on) perfSave(); });
window.addEventListener('pagehide', () => { if (PERF.on) perfSave(); });
// A frame come late (its interval half as long again as the screen's): the frame before it, the one that ran meanwhile,
// written down: how late this one's turn came after the screen's (late: the page busy between the two, the browser
// clearing its memory or other tasks), the page's work in it and each part's, its draws, what it sent the GPU and what
// happened in it; and the likeliest cause, why. The last 300 kept, with the log
// (judged by the frames drawn, against the interval the game draws at: the cap's in whole screen intervals. A 120 Hz
// screen, its pace lowered and raised by the phone itself, had read hundreds of 'late' frames at 17-20 ms, the game
// steady at 60. The uploads made in this callback, after its turn came, are carried on to the next frame's account)
function pfDrawn(now, fps) {
  const c = PF.c, dT = c.tile - PF.a0, dC = c.ctile - PF.b0, dMs = c.tiles - PF.m0;
  c.tile -= dT; c.ctile -= dC; c.tiles -= dMs;
  const due = Math.max(1, Math.ceil(1000 / fps / rafI - 0.05)) * rafI;
  // (and against the shortest of the last eight drawn intervals: a phone gone to 30 a second in its low-power mode is
  // not late at every frame while rafI climbs slowly to it)
  if (PF.prev) { const dt = now - PF.prev; let lo = 0; for (let i = 0; i < 8; i++) if (PF.iv[i] > 0 && (!lo || PF.iv[i] < lo)) lo = PF.iv[i];
    PF.gap = PF.postEnd ? now - PF.postEnd : -1;
    // (the intervals in the due one's units, 1, 1.5, 2, more; and those whose update began as soon as the last one's
    // commit landed, a sign of a frame dropped though every interval reads right)
    if (PF.ok && dt < 1000) { const k = dt / Math.max(due, lo); PERF.h[k < 1.25 ? 0 : k < 1.75 ? 1 : k < 2.5 ? 2 : 3]++; if (PF.gap >= 0 && PF.gap < 2) PERF.tight++; PERF.postMax = Math.max(PERF.postMax, PF.post); PERF.inpSum += PF.inp; }
    if (PF.ok && dt > 1.5 * Math.max(due, lo) && dt < 1000 && !(S.ffwd > 0)) pfSlow(dt, PF.st - now);
    if (dt < 1000) { PF.iv[PF.ivI] = dt; PF.ivI = (PF.ivI + 1) & 7; } }
  PF.prev = now; PF.ok = false; PF.inp = 0; PF.postEnd = 0; PF.def = PF.defMax = 0; PF.defK = '';
  for (const k in c) c[k] = 0;
  c.tile = dT; c.ctile = dC; c.tiles = dMs;
}
function pfSlow(dt, late) {
  const c = PF.c, r = { t: Math.round((performance.now() - PERF.t0) / 100) / 10, m: S.phase === 'play' ? missionId : S.phase, dt: +dt.toFixed(1), late: +late.toFixed(1), work: +PF.work.toFixed(1),
    pr: PR, heat: THERMAL, draws: PF.draws, tris: PF.tris };
  if (PF.prog) r.prog = PF.prog; if (PF.tex) r.tex = PF.tex; if (PF.geo) r.geo = PF.geo;
  for (const k of PF_SEC) if (c[k] >= 0.5) r[k] = +c[k].toFixed(1);
  for (const k of PF_EV) if (c[k]) r[k] = c[k];
  // (the page's work by its sections, the tiles and the counter's own included; 'other': nothing of the page's own
  // explains it (the GPU behind, the browser, the system))
  let big = null, js = 0; for (const k of PF_SEC) { js += c[k]; if (!big || c[k] > c[big]) big = k; } r.js = +js.toFixed(1);
  r.post = +PF.post.toFixed(1); r.gap = +PF.gap.toFixed(1); if (PF.inp >= 0.5) r.inp = +PF.inp.toFixed(1); r.ri = +rafI.toFixed(1);
  if (PF.def >= 0.5) { r.def = +PF.def.toFixed(1); r.defK = PF.defK; }
  r.why = PF.prog > 0 ? 'shader' : c.grab ? 'grab' : c.vid ? 'vid' : c.resize ? 'resize' : js > 0.7 * rafI ? 'js:' + big : PF.def > 0.5 * rafI ? 'def:' + PF.defK : late > 6 ? 'busy'
    : c.tile || c.ctile || c.abq || PF.tex > 0 ? 'upload' : c.log ? 'log' : c.txt ? 'txt' : c.boom || c.rel ? 'fx'
    : PF.post > 0.5 * rafI ? 'post' : PF.inp > 0.3 * rafI ? 'input' : PF.gap > rafI ? 'wait' : 'other';
  PERF.slow.push(r); if (PERF.slow.length > 300) PERF.slow.splice(0, PERF.slow.length - 300);
  PERF.win[r.why] = (PERF.win[r.why] || 0) + 1; PERF.nWin++;
}
function perfShow(on) {
  PERF.on = PF.on = on; PF.prev = 0; PF.ok = false; PF.progN = PF.texN = PF.geoN = -1; PF.iv.fill(0); try { localStorage.setItem('saqr.perf', on ? '1' : '0'); } catch (_) {}
  if (on && !PERF.el) {
    const el = PERF.el = document.createElement('div'); el.id = 'perf';
    el.style.cssText = 'position:fixed;z-index:99;top:calc(env(safe-area-inset-top) + 4px);left:calc(env(safe-area-inset-left) + 4px);padding:4px 6px;background:rgba(0,0,0,.62);color:#cfe;font:10px/1.35 "IBM Plex Mono",monospace;white-space:pre;pointer-events:none;border-radius:4px;direction:ltr;text-align:left';
    PERF.txt = document.createElement('div'); el.appendChild(PERF.txt);
    const b = document.createElement('button'); b.type = 'button'; b.textContent = Lg('نسخ السجل', 'Copy log');
    b.style.cssText = 'pointer-events:auto;margin-top:3px;font:inherit;color:#cfe;background:#234;border:1px solid #567;border-radius:3px;padding:2px 6px';
    b.addEventListener('click', e => { e.stopPropagation(); const t = JSON.stringify({ ua: navigator.userAgent, dpr: window.devicePixelRatio, log: PERF.log, slow: PERF.slow });
      const done = ok => { b.textContent = ok ? Lg('نُسخ', 'Copied') : Lg('تعذّر النسخ', 'Copy failed'); setTimeout(() => { b.textContent = Lg('نسخ السجل', 'Copy log'); }, 1500); };
      try { navigator.clipboard.writeText(t).then(() => done(true), () => done(false)); } catch (_) { done(false); } });
    // (a test for the phone: the sensor's symbology as it is, without its halo, or not drawn at all, to see in the log
    // what it costs there; written in each 10 s row)
    const hb = document.createElement('button'); hb.type = 'button'; hb.style.cssText = b.style.cssText + ';margin-left:4px'; hb.textContent = 'HUD';
    hb.addEventListener('click', e => { e.stopPropagation(); PERF.hudTest = ((PERF.hudTest || 0) + 1) % 3; hb.textContent = ['HUD', 'HUD no halo', 'HUD off'][PERF.hudTest]; hud._stale = true; });
    el.appendChild(b); el.appendChild(hb); document.body.appendChild(el);
  }
  if (PERF.el) PERF.el.hidden = !on;
  renderer.info.autoReset = !on;   // (on: the counts are the whole frame's, every pass of it)
}
$('.nScr[data-scr="home"] .nTitle h1').addEventListener('click', () => {
  const t = performance.now(); PERF.taps = PERF.taps.filter(x => t - x < 2500); PERF.taps.push(t);
  if (PERF.taps.length >= 5) { PERF.taps = []; perfShow(!PERF.on); }
});
// one frame drawn: its interval and the page's work in it
function perfTick(now, work) {
  const R = renderer.info;
  if (PERF.last) { const dt = now - PERF.last; PERF.n++; PERF.sum += dt; PERF.max = Math.max(PERF.max, dt); PERF.max10 = Math.max(PERF.max10 || 0, dt); PERF.work += work; }
  PERF.last = now; PERF.calls = R.render.calls; PERF.tris = R.render.triangles;
  // (this frame's, for pfSlow: its work, draws, and what it made on the GPU: new programs, textures and buffers)
  { const np = R.programs ? R.programs.length : 0; PF.work = work; PF.draws = R.render.calls; PF.tris = R.render.triangles;
    PF.prog = PF.progN < 0 ? 0 : np - PF.progN; PF.tex = PF.texN < 0 ? 0 : R.memory.textures - PF.texN; PF.geo = PF.geoN < 0 ? 0 : R.memory.geometries - PF.geoN;
    PF.progN = np; PF.texN = R.memory.textures; PF.geoN = R.memory.geometries; }
  R.reset();
  if (now - PERF.t < 1000 || !PERF.n) return;
  const ms = PERF.sum / PERF.n, heap = performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  const row = { t: Math.round((now - PERF.t0) / 1000), fps: +(1000 / ms).toFixed(1), ms: +ms.toFixed(1), max: Math.round(PERF.max), work: +(PERF.work / PERF.n).toFixed(1), draws: PERF.calls, tris: PERF.tris,
    tex: R.memory.textures, geo: R.memory.geometries, heap, pr: PR, heat: THERMAL, m: S.phase === 'play' ? missionId : S.phase, max10: Math.round(PERF.max10 || 0), slow: PERF.nWin, why: PERF.win };
  const mm = Math.floor(row.t / 60), ss = String(row.t % 60).padStart(2, '0');
  const ls = PERF.slow[PERF.slow.length - 1];
  PERF.txt.textContent = `${row.fps} fps  ${row.ms} ms (max ${row.max})  work ${row.work} ms\n${row.draws} draws  ${(row.tris / 1000).toFixed(0)}k tris  ${row.tex} tex  ${row.geo} geo\n` +
    `heap ${heap == null ? '-' : heap + ' MB'}  px ×${PR}  heat ${THERMAL}  ${mm}:${ss}  ${row.m}\n` +
    `late ${PERF.nWin} (10 s)  last ${ls ? ls.dt + ' ms ' + ls.why : '-'}  gpu ${PF.gpu.toFixed(1)}`;
  pfEv('txt');
  if (now - PERF.logT >= 10000) { PERF.logT = now;
    Object.assign(row, { hud: PERF.hudTest || 0, ri: +rafI.toFixed(2), hz: scrHz, h: PERF.h, tight: PERF.tight, skip: PERF.skipN, post: +PERF.postMax.toFixed(1), inp: Math.round(PERF.inpSum), gpu: +PERF.gpuMax.toFixed(1) });
    PERF.h = [0, 0, 0, 0]; PERF.tight = PERF.skipN = PERF.postMax = PERF.inpSum = PERF.gpuMax = 0;
    PERF.log.push(row); if (PERF.log.length > 360) PERF.log.splice(0, PERF.log.length - 360); PERF.win = {}; PERF.nWin = 0; PERF.max10 = 0;
    if (now - PERF.saveT >= 60000) { PERF.saveT = now; PF.saveDue = true; } }
  PERF.t = now; PERF.n = PERF.sum = PERF.work = PERF.max = 0;
}
const ovStartEl = $('#ovStart'), ovEndEl = $('#ovEnd');
// (the last touch, key or wheel: a frozen scene nobody is handling is drawn ten times a second, not sixty)
// (the screen kept awake while a mission is flown, as the apps are asked to (AwakeKeeper, SaqrMedia.awake), or the
// browser by its wake lock; let sleep in the menu, the end card and a pause)
let awake = null, wakeLk = null;
function keepAwake(on) {
  if (on === awake) return; awake = on;
  try { window.webkit.messageHandlers.awake.postMessage(on); } catch (_) {}
  try { if (window.SaqrMedia && SaqrMedia.awake) SaqrMedia.awake(on); } catch (_) {}
  try { if (on && navigator.wakeLock && !inApp && !window.SaqrMedia) navigator.wakeLock.request('screen').then(l => { if (awake && !wakeLk) wakeLk = l; else l.release(); })   /* (two asks in flight: the second let go) */.catch(() => {});
    else if (!on && wakeLk) { wakeLk.release().catch(() => {}); wakeLk = null; } } catch (_) {}
}
// (the browser lets its lock go when the page is hidden: asked again when it is back)
document.addEventListener('visibilitychange', () => { if (!document.hidden && awake) { awake = null; wakeLk = null; } });
let lastIn = 0; for (const ev of ['pointerdown', 'pointermove', 'wheel', 'keydown']) window.addEventListener(ev, () => { lastIn = performance.now(); }, { passive: true, capture: true });
// (rafI: the screen's own interval between frames, as the browser offers them: the median of the last 31 intervals,
// snapped to a screen's rate (120, 90, 60, 30 a second) when it is near one, never shorter than the app's word for it
// (window.__screenHz, the iPhone's: 60, or 30 in its low-power mode). WebKit stamps a frame when its update begins, not
// at the screen's beat, so the intervals scatter round the true one; the old estimate, down at once to the shortest
// seen and up only slowly, settled near 11 ms where the screen's was 16.7: frames due were turned away (a picture shown
// twice), the late-frame record's and the resolution's thresholds doubled)
let stepErr = 0, stillN = 0, rafLast = 0, rafI = 1000 / 60, rafN = 0, upT = 0, upWait = 20, upAt = -1e9, prNext = 0;
let scrHz = +window.__screenHz || 0; window.__screenHzSet = hz => { scrHz = +hz || 0; };
const RAFV = new Float64Array(31), RAFS = new Float64Array(31); let rafVI = 0, rafVN = 0;
function screenI(raw) {
  if (raw > 2 && raw < 60) { RAFV[rafVI] = raw; rafVI = (rafVI + 1) % 31; if (rafVN < 31) rafVN++; }
  let t = 1000 / 60;
  // (the app's word is the screen's pace itself, not a floor: a GPU behind, the page offered every second beat, had
  // read as a 30 Hz screen, and nothing was then late: the resolution never came down, the counter saw none. Without
  // it, the lower quarter of the intervals, not their middle, for the same reason)
  if (scrHz) return 1000 / scrHz;
  if (rafVN === 31) { RAFS.set(RAFV); RAFS.sort(); const m = RAFS[7]; let bd = 1e9;
    for (const hz of [120, 90, 60, 30]) { const d = Math.abs(Math.log(m * hz / 1000)); if (d < bd) { bd = d; t = 1000 / hz; } }
    if (bd > 0.12) t = m; }
  return t;
}
function frame(now) {
  const pf = PF.on; let tq = 0;
  if (pf) { tq = PF.st = performance.now(); PF.a0 = PF.c.tile; PF.b0 = PF.c.ctile; PF.m0 = PF.c.tiles; }
  { const raw = now - rafLast; rafLast = now; rafI = screenI(raw); }
  // (the editor open: this loop only waits for it, four times a second, not at the screen's rate)
  if (ED.open) { last = now; setTimeout(() => requestAnimationFrame(frame), 250); return; }
  // (a tape still's copy read back here, before this frame has asked anything of the GPU: in WebKit the read is a round
  // trip that waits for the GPU process to run what the page has sent; after the drawing that was the whole frame)
  if (GRABS.length) glGrabPoll();
  pumpTiles(1); if (!tileQueue.length) pumpCountry();
  if (pf) tq = pfSec('tiles', tq);
  // at most 60 frames a second (a 120 Hz screen would only draw each twice), 30 when the phone runs hot, and a dozen
  // behind the menu's dark veil; the tiles keep coming in meanwhile
  const veiled = !BOOTING && (!ovStartEl.hidden || !ovEndEl.hidden), still = S.frozen && now - lastIn > 600 && Math.abs(S.zoom - S.zoomGoal) < 0.01 && CK.t === CK.goal
      && Math.hypot(CK.vfx || 0, CK.vfy || 0) < 0.5 && Math.abs(CK.vl || 0) < 0.002 && (!S.vel || Math.hypot(S.vel.x, S.vel.y) < 0.5),   // (and nothing still settling: the head, the lean, the sight)
    fps = window.__capture ? 1e6 : veiled ? 12 : still ? 10 : THERMAL >= 2 ? 31 : 72;
  Snd.setAway(veiled); keepAwake(!BOOTING && !veiled && !S.frozen && S.phase === 'play');
  // (a slow state, behind the menu or a still frozen scene: the rest of its interval waited by the clock, not asked of
  // the screen at its 60 or 120 to be turned away; each of those had still woken the page, some 50 times a second
  // frozen. Half a screen interval's grace: a frame due on the vsync grid had been turned away and the menu ran at 10)
  const slow = (veiled || still) && !window.__capture;
  // (a slow state's grace a whole screen interval: its clock's wait plus the screen's next frame lands within one of the
  // due time; half of one had turned a third of them away, some 18 more wake-ups a second behind the menu)
  // (otherwise the cap counted in the screen's frames: 72 at 60 Hz draws every one, 31 every second one, 72 at 120 Hz
  // every second one; by the clock, a frame begun just after a late one had been turned away, its picture shown twice)
  const per = Math.max(1, Math.round(1000 / fps / rafI)); rafN++;
  if (slow ? now - lastDraw < 1000 / fps - rafI : rafN < per && now - lastDraw < (per - 0.5) * rafI) {
    if (pf) PERF.skipN++;
    if (slow) setTimeout(() => requestAnimationFrame(frame), Math.max(0, 1000 / fps - (now - lastDraw) - rafI)); else requestAnimationFrame(frame); return; }
  lastDraw = now; rafN = 0;
  if (pf) pfDrawn(now, fps);
  // (a resolution step asked for at the end of the last frame, made now, before anything is drawn: made there, after
  // the drawing, it had cleared the canvas and the symbology for that frame, a black picture shown)
  if (prNext) { PR = prNext; resize(); }
  // nothing is drawn behind the loading screen (opaque; boot() draws what it needs itself), but the world runs on as
  // ever (the aircraft is settled in its orbit by the time START is pressed). Drawn there at full rate while the
  // sounds were made in their worker, the frames piled up on the GPU and the warm-up after them waited a second
  // longer (measured), for frames nobody saw
  // (nor behind the menu and the end card: both opaque, the world, the glass and the displays had been drawn a dozen
  // times a second there for nobody)
  // (and a still frozen scene drawn twice on going still, then left as it is until something moves: it had been drawn
  // whole ten times a second, the same picture)
  stillN = still ? stillN + 1 : 0;
  const draw = !BOOTING && !veiled && stillN <= 2 || !!window.__capture;
  const w0 = PERF.on ? performance.now() : 0;
  // (the world's step the screen's own interval, in whole frames, where the stamp lies near one: WebKit's stamps, taken
  // when its update begins, scatter a few ms round the beat, and the world had moved by them, unevenly, at a steady 60;
  // a real drop still steps whole frames. rawDt still judges slowness)
  const rawDt = (now - last) / 1000; last = now;
  // (what a snap gained or lost carried to the next: snapped up after a late start and the short one after taken as it
  // came, the world had run 0.4-1 % fast)
  const rq = rawDt * 1000 + stepErr, nI = Math.round(rq / rafI), snap = nI >= 1 && Math.abs(rq - nI * rafI) < 0.35 * rafI && !window.__capture && rawDt < 1;
  stepErr = snap ? clamp(rq - nI * rafI, -rafI, rafI) : 0;
  const rdt = Math.min(0.05, snap ? nI * rafI / 1000 : rawDt);
  // the world in steps of a frame's time, two or four a frame while the time runs fast (timeK: a bomb's long fall)
  const nk = S.frozen ? 1 : timeK(), dt = S.frozen ? 0 : rdt * nk, sdt = dt / nk;
  // (the quick rearm: the fight runs on for the jet's absence, ten seconds of it a frame, the picture down)
  if (S.ffwd > 0) {
    for (let k = 0; k < 200 && S.ffwd > 0 && S.phase === 'play' && !S.home; k++) {
      const h = 0.05; S.t += h; S.missionT += h; S.ffwd -= h;
      for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= h; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } }
      for (const v of vehicles) driveVehicle(v, h); for (const g of groups) updateGroup(g, h);
      updateProjectiles(h); updateWar(h); popUpdate();
    }
    S.blank = 2;
    if (S.ffwd <= 0 || S.phase !== 'play' || S.home) { S.ffwd = 0; jetBackOnStation(); }
  }
  if (pf) tq = pfSec('sim', tq);
  for (let k = 0; k < nk; k++) {
    S.t += sdt;
    const out = jetOut();
    if (S.phase === 'play' && !out) S.missionT += sdt;
    updatePlane(sdt);
    for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= sdt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } }
    let moving = 0; for (const v of vehicles) if (v.alive && !v.escaped && !v.dormant && v.v > 2) moving++;
    DUST_K = Math.min(1, 5 / Math.max(1, moving));
    if (!out) { for (const v of vehicles) driveVehicle(v, sdt); for (const g of groups) updateGroup(g, sdt); }
    for (const k in S.cool) S.cool[k] = Math.max(0, S.cool[k] - sdt);
    // (the effects not stepped behind the menu and the end card, out of a sortie: drawn by nobody, a third of the
    // dozen ticks' work there; the next mission clears them)
    const fx = !veiled || S.phase === 'play';
    if (fx) for (const l of LAYERS) l.update(sdt);
    updateProjectiles(sdt);
    for (const v of vehicles) vehicleHeat(v, sdt);
    if (fx) updateEmitters(sdt);
    if (sdt > 0 && !out) updateWar(sdt);
    // (the pop-up target: it had been run only in stepSim, the tests' world, never in the game's own frame: the
    // time-sensitive target never showed and its mission never ended)
    if (!out) popUpdate();
    updateIllum(sdt); fcrUpdate(sdt);
  }
  if (pf) tq = pfSec('sim', tq);
  updateView(rdt);
  for (const v of vehicles) vehicleLights(v);
  sceneHeat();
  S.flash *= Math.exp(-rdt * 14);
  S.expoT += rdt; S.expo = lerp(S.expo, 1, 1 - Math.exp(-rdt * 1.6));
  post.uniforms.flash.value = S.flash; post.uniforms.zoom.value = S.zoom;
  if (Snd.on) { engT -= rdt; if (engT <= 0) { engT = 0.25; Snd.engineUpdate(plane); } } post.uniforms.expo.value = S.expo * CK.gain; post.uniforms.time.value = now / 1000;
  S.blank = Math.max(0, S.blank - rdt * 2.2); post.uniforms.blank.value = Math.min(1, S.blank * 1.6);
  // the thermal camera recalibrates itself now and then (NUC): the video holds its last frame for a beat
  if (S.sensor !== 'eo') { S.nucT -= rdt; if (S.nucT <= 0) { S.nucT = rand(55, 110); S.nucHold = 0.35; } }
  // (the cockpit's layout not kept up behind the menu: its styles written ten times a second there for nobody)
  ckUpdate(rdt, nk, !veiled || !!window.__capture);
  if (pf) tq = pfSec('ck', tq);
  if (JET) efbTick(rdt);
  assistUpdate(rdt);
  if (pf) tq = pfSec('efb', tq);
  let drew = false; if (S.nucHold > 0) S.nucHold -= rdt; else if (draw) { renderFrame(dt); drew = true; }
  if (pf) tq = pfSec('render', tq);
  // (the counter on, once a second: a pixel read back right after the drawing, waiting for the GPU to finish this frame's
  // work, its own time; that frame left out of the late ones)
  if (pf && drew && now - PF.gpuAt > 1000) { PF.gpuAt = now; const gl = renderer.getContext(), t = performance.now(); try { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, PF_PX); } catch (_) {}
    PF.gpu = performance.now() - t; PERF.gpuMax = Math.max(PERF.gpuMax, PF.gpu); PF.noLate = true; tq = performance.now(); }
  // (a still only off a frame drawn now: the screen's buffer is cleared once shown, and held through the thermal
  // camera's recalibration; asked again at the next frame drawn)
  if (tapeReq.length && drew) tapeGrab();
  if (pf) tq = pfSec('tape', tq);
  // the sensor's symbology fades in only as the sensor fills the screen (its canvas is fully transparent up to CK.t
  // 0.35): a full-screen canvas at the screen's resolution is not drawn while nobody can see it
  // (the symbology 30 times a second, as the pod's own video: a full-screen canvas, its halos blurred, had been drawn
  // afresh each of 60)
  // (never on two frames running: once one frame came late, 0.03 s had passed at every frame after, the full-screen
  // canvas was drawn at each, and each came late in turn: the owner's phone held at 30 a second for 3 s in the sensor
  // view. Skipping the next, the frame without it can catch up. Not where the frames are spaced 1/30 s on purpose, the
  // phone hot or its screen at 30: there every frame is the symbology's, at 30 as before, not 15)
  hudT += rdt;
  const dueMs = Math.max(1, Math.ceil(1000 / fps / rafI - 0.05)) * rafI;
  { let hd = false;
    if (draw) { if (CK.t > 0.35 && PERF.hudTest !== 2) { if (hudBlank || hud._stale || window.__capture || (hudT >= 0.03 && (!hudPrev || dueMs >= 25))) { hudT = 0; hud._stale = false; drawHud(false); hudBlank = false; hd = true; } } else if (!hudBlank) { hudClear(); hudBlank = true; } }
    if (draw) hudPrev = hd; }
  if (pf) tq = pfSec('hud', tq);
  if (CK.t < 1 && draw) drawMpds(rdt);
  if (pf) tq = pfSec('mpd', tq);
  // (and the jet's bingo looked at as it comes: it had been weighed only when something was hit or got away, so a quiet
  // sky could fly on past it)
  uiT -= rdt; if (uiT <= 0) { uiT = 0.2; syncDock(); syncLockBtn(); if (JET && S.phase === 'play' && !S.bingo && S.winch !== 'flown' && S.winch !== 'quick' && plane.fuel < JET_BINGO) checkEnd(); }
  // adaptive resolution keeps older phones smooth
  // (not while loading: the loading work itself is slow, and must not cost the picture its resolution)
  // (nor while the frames are spaced on purpose: behind the menu, or the phone hot)
  // (__capture: tools/trailer, frame by frame. The else was inside this comment: slowT never came down, so a slow
  // frame now and then, over a long sortie, added up to the resolution cut for good)
  // (the interval a frame is due at: the screen's, in whole numbers of it, no shorter than the cap's)
  const due = dueMs / 1000, slowAt = Math.max(0.026, 1.5 * due), steady = !BOOTING && !veiled && THERMAL < 2 && !window.__capture && !S.frozen;
  // (the interval itself, not the world's step capped at 0.05 s: at a 30 Hz screen the cap had sat on the limit)
  if (rawDt > slowAt && rawDt < 1 && steady) slowT += Math.min(rawDt, 0.1); else slowT = Math.max(0, slowT - rdt * 0.5);
  if (slowT > 2 && PR > (HIQ ? 2 : 1)) { prNext = Math.max(HIQ ? 2 : 1, PR - 0.25); slowT = 0; if (now - upAt < 30000) upWait = Math.min(600, upWait * 2); upT = 0; }
  // (and back up a step after a while with room to spare: it had never come back, a slow minute early in a sortie
  // costing its picture for good. Each time a step up proves too much, the next waits twice as long)
  const prCap = Math.min(window.devicePixelRatio || 1, HIQ ? 3 : 2);
  if (steady && PR < prCap && rdt < due * 1.2 && slowT === 0) upT += rdt; else if (!steady || rawDt > slowAt) upT = 0;
  if (upT > upWait) { prNext = Math.min(prCap, PR + 0.25); upT = 0; upAt = now; }
  if (pf) tq = pfSec('ui', tq);
  if (PERF.on) perfTick(now, performance.now() - w0);
  if (pf) { pfSec('perf', tq); PF.ok = draw && !veiled && !still && !PF.noLate; PF.noLate = false;
    if (draw && PF_MC) { PF.cbEnd = performance.now(); PF_MC.port2.postMessage(0); } }
  // (behind the menu the next frame a dozen to the second by the clock, not asked of the screen at its 60 or 120 to be
  // turned away: each of those had still cost the browser a pass over the page)
  if (slow) setTimeout(() => requestAnimationFrame(frame), Math.max(0, 1000 / fps - rafI)); else requestAnimationFrame(frame);
}
let lastQ = -1, lastTr = null;
function syncLockBtn() { if (S.quality !== lastQ || S.tracking !== lastTr) { lastQ = S.quality; lastTr = S.tracking; syncUI(); } }

/* ===================== boot ===================== */
ckImg.src = CK_IMG + 'day.webp';
try { const td = localStorage.getItem('saqr.tod') || (localStorage.getItem('saqr.night') === '1' ? 'night' : 'day'); S.todPref = td; S.dusk = td === 'dusk'; if (td === 'night') setNight(true); S.wx = localStorage.getItem('saqr.wx') === 'dust' ? 'dust' : 'clear'; applySky(); const ss = localStorage.getItem('saqr.sensor'); if (ss === 'wh' || ss === 'bh') { S.sensorPref = ss; setSensor(ss); } } catch (_) {}
resize();
setupMission();
updateView(0);
ckShow(true);
// base map first, then the start button unlocks
// Loading screen: nothing starts until everything is in: every image (sprites, houses, cockpit day and night, the
// map's base and far tiles), every synthesised sound, the fonts, and the GPU warmed (textures uploaded, every shader
// compiled, one frame drawn in each sensor mode by day and night), so the mission has nothing left to build.
let BOOTING = true;
// (the boot's level-0 tiles stay for good, the canopy's map: a big map has its whole picture instead, MAP.mini)
const need = MAP.mini ? [] : [[0, 0, 0], [0, 1, 0]];
// The GPU's context lost and given back (the system's doing, under memory pressure): three.js sends its textures again
// from their pictures, but the map's and the country's tiles let theirs go once on the GPU, so they are all asked for
// afresh (the ground had stayed black for good)
glCanvas.addEventListener('webglcontextrestored', () => {
  for (const m of [tiles, ctTiles]) { for (const t of m.values()) if (t.mesh) { sceneA.remove(t.mesh); t.mesh.material.dispose(); t.mesh.geometry.dispose(); } m.clear(); }
  for (const q of tileQueue) tileFree(q.tx2); for (const q of ctQueue) tileFree(q.tx2); tileQueue.length = ctQueue.length = 0; ctHeld = ctL0 = 0; ctDirty = true; ctSig = '';
  // (the base's near quarters made again: sent in pieces and let go, they hold no picture of their own to send again)
  if (ABP && ABP.near) { for (const m of ABP.near) { sceneA.remove(m); m.material.map.dispose(); m.material.dispose(); m.geometry.dispose(); } for (const [t] of ABP.nearQ || []) tileFree(t); ABP.near = ABP.nearQ = null; }
  need.forEach(([L, x, y]) => { ensureTile(L, x, y).pin = true; });
  GRABS.length = 0; GRAB_CH.clear(); GRAB_PB.length = 0;
});
function bootStage(ar, en, k) { $('#ldStage').textContent = EN ? en.charAt(0) + en.slice(1).toLowerCase() : ar; $('#ldStageEn').textContent = en; $('#ldBar').style.transform = 'scaleX(' + k.toFixed(3) + ')'; $('#ldPct').textContent = Math.round(k * 100) + '%'; }
const until = (cond, onTick, max) => new Promise(ok => { const t0 = performance.now(); const f = () => { onTick && onTick(); if (cond() || performance.now() - t0 > max) ok(); else setTimeout(f, 50); }; f(); });
const decodeImg = src => { const i = new Image(); i.src = src; return (i.decode ? i.decode() : new Promise(r => { i.onload = i.onerror = r; })).catch(() => {}); };
async function boot() {
  // 1) images: the base map, the far field, every sprite, both cockpit photos
  need.forEach(([L, x, y]) => { BOOT.total++; ensureTile(L, x, y, () => { BOOT.done++; }).pin = true; });
  loadFar(); loadMini();
  const cockpit = Promise.all([CK_IMG + 'day.webp', CK_IMG + 'night.webp', ...(REGION.length || MAP.country ? [] : [MAP.dir + 'tiles/far/tsd.jpg'])   /* (as the TSD itself: not on the country) */, ...(JET ? ['sprites/efb.webp'] : [])].map(decodeImg));
  if (JET) $('#efbImg').src = 'sprites/efb.webp';
  // (the country's coarse levels round the start, so the ground beyond the map is there from the first frame)
  // (a tile that failed counts as done: a missing one does not hold the start)
  if (CTRY) await until(() => { updateCountry(); return [...ctTiles.values()].filter(t => t.L <= 3).every(t => t.mesh || t.failed); }, () => { while (ctQueue.length) pumpCountry(); bootStage('تحميل الخريطة والصور', 'LOADING MAP & IMAGES', 0.4); }, 20000);
  await until(() => BOOT.done >= BOOT.total && !tileQueue.length, () => { pumpTiles(16); bootStage('تحميل الخريطة والصور', 'LOADING MAP & IMAGES', 0.4 * BOOT.done / Math.max(1, BOOT.total)); }, 30000);
  await cockpit;
  // 2) sounds, all of them
  Snd.prepare();
  if (Snd.ready) await until(() => Snd.jobsDone >= Snd.jobsTotal, () => bootStage('تجهيز الأصوات', 'BUILDING SOUND', 0.4 + 0.45 * Snd.jobsDone / Math.max(1, Snd.jobsTotal)), 60000);
  // 3) the GPU: upload every texture and compile every material, hidden ones included, then a frame in each mode
  bootStage('تجهيز الرسوميات', 'WARMING GRAPHICS', 0.88);
  await new Promise(r => setTimeout(r, 30));
  for (const t of BOOT.tex) try { renderer.initTexture(t); } catch (_) {}
  // (the enlarging tiles' shader compiled now, not at the first zoom past the top level: a hidden mesh of it, which the
  // compile below makes visible for its turn)
  if (MAP.mag && BOOT.tex[0]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tileMat(BOOT.tex[0], TOP_L, 1024, 1024)); m.visible = false; sceneA.add(m); setTimeout(() => sceneA.remove(m), 0); }
  for (const [sc, cm] of [[sceneA, cam], [sceneL, cam], [sceneE, cam], [sceneH, cam], [postScene, postCam], [winScene, postCam], [sceneA, wcam]]) {
    const hidden = []; sc.traverse(o => { if (!o.visible) { o.visible = true; hidden.push(o); } });
    try { renderer.compile(sc, cm); } catch (_) {}
    for (const o of hidden) o.visible = false;
  }
  const night = S.night, sensor = S.sensor;
  // (and the sensor full screen too: its full-size targets made now, not at the sortie's first look through it)
  const ckT = CK.t;
  for (const n of [false, true]) for (const sn of ['eo', 'wh', 'bh']) { S.night = n; S.sensor = sn; post.uniforms.night.value = n ? 1 : 0; post.uniforms.ir.value = sn === 'eo' ? 0 : sn === 'wh' ? 1 : 2;
    for (const t of [ckT, 1]) { CK.t = t; try { renderFrame(0); } catch (_) {} } }
  CK.t = ckT;
  setNight(night); setSensor(sensor);
  // (the radio's banks cut and packed here, not just after the menu shows: 70-250 ms each on the main thread, the menu's
  // first taps ignored meanwhile); the map pages' pictures decoded now, not at the first look at the TSD
  await until(() => ![bank, bankJ, bankA, bankAJ].some(b => b.loading), () => bootStage('تجهيز الأصوات', 'BUILDING SOUND', 0.97), 15000);
  for (const { t } of REGION) if (t && t.image && t.image.decode) t.image.decode().catch(() => {});
  await (document.fonts ? document.fonts.ready.catch(() => {}) : 0);
  bootStage('جاهز', 'READY', 1);
  BOOTING = false; slowT = 0;
  const b = $('#btnStart'); b.disabled = false; $('#startAr').textContent = Lg('ابدأ المهمة', 'Start mission'); $('#startEn').textContent = 'START';
  setTimeout(() => { $('#ovLoad').classList.add('done'); setTimeout(() => { $('#ovLoad').hidden = true; $('#ldBg').style.backgroundImage = ''; }, 450); }, 250);
}
Promise.all(['600 12px "IBM Plex Mono"', '600 12px "IBM Plex Sans Arabic"', '600 12px "IBM Plex Sans"'].map(f => document.fonts ? document.fonts.load(f) : 0)).catch(() => {});
if (location.hash === '#debug') window.__saqr = { JX, tutShow, GROUND, decodeTile, decodeBitmap, tilePart, tileRows, elevAt, gridEN: (x, y) => MAP.country ? gridEN(x, y) : null, efbGridPub: p => efbGrid(p), efbView, jetFireStatePub: () => jetFireState(), assistKeyPub: () => assistKey(), banksPub: () => [bank, bankJ, bankA, bankAJ].map(b => b.d ? [b.d.length, b.sr, +(b.d.byteLength / 1048576).toFixed(1)] : null), EFB, efbShow, efbNear, efbTask, efbDraw, jetSkipOut, jetSkipHome, tiles, THREE, tilesPub: () => [...tiles.values()].map(t => [t.k, t.loaded, !!(t.mesh && t.mesh.visible)]), ctPub: () => [...ctTiles.values()].map(t => [t.k, !!t.mesh, t.mask]), get DRESS() { return DRESS; }, get ABP() { return ABP; }, MAP, tracers, friends, bursts, missiles, flares, AC, launchManpads, shootBurst, acHit, timers, plumeW, fireW, renderer, explode: (x, y, k) => explode(x, y, k), W0, stepSim, fireStatePub: () => fireState(), S, CK, ED, onWater, boatLoop, jetRelease, timeK, jetOrbit, SAM, TAPE, campLoad, campStart, campIds, TR, TRAIN, tapeMark, setTod, setWx, postU: post.uniforms, smokeOver, SMOKE_LOST_PUB: SMOKE_LOST, sceneA, smokeL, startMission, MISSIONS, scoreMission, kill, damageAt, ruinHouse, alertGroup, placePlane, openEditor, edDefaultItems, houses, groups, setFlight, hoverPt, updatePlane, WIND_MS, W0, H0, MPP, ckFromImg, ckToImg, ckLook, ckLayout, setupWindowCam, wcam, BTN, TKEYS, TLAB, CTRLS, PAGES, pageKeys, GRIPS, toScreenPub: (x, y) => toScreen(x, y), targets, vehicles, projectiles, lockOn, setNight, setSensor, setCockpit, fire, Snd, makeVehicle, plane,
  roadAtPub: s => Object.assign({}, roadAt(s)), setGlassCut: on => { glassCut = on; }, glassRects, PRpub: () => PR, renderFramePub: () => renderFrame(0), setJetEye: v => { JET_EYE = v; }, setJetTilt: v => { JET_TILT = v; }, setPR: p => { PR = p; resize(); }, LOADOUTS, applyLoadout, fcrScan, lstSearch, illums, rfTarget, jtac, radio, radioClip, bank, RADIO, bankA, RADIO_A, bankJ, RADIO_J, bankAJ, RADIO_AJ, tedacPress, gripPress, ckPressAt, mpdPress,
  PERF, perfShow, AS, assistKey, updateView, JX, jetConsent, jetRearm, onWaterPub: (x, y) => onWater(x, y), jetLar, bombFall, jetGuide, JET, jetFireState, jetDanger, checkEnd, MAP_ID,
  toSensor: () => { CK.goal = 1; CK.t = 1; ckShow(false); ckLayout(); } };
boot();
syncUI(); showScr('home');
try { if (location.hash === '#perf' || localStorage.getItem('saqr.perf') === '1') perfShow(true); } catch (_) {}
requestAnimationFrame(t => { last = t; frame(t); });
// sound across leaving the app: suspend while away; on return wake (the app rebuilds at once, a browser on the first
// touch), and a check once a second for a context that died anyway
document.addEventListener('visibilitychange', () => { if (document.hidden) Snd.sleep(); else Snd.wake(false); });
window.addEventListener('pagehide', () => Snd.sleep());
window.addEventListener('pageshow', () => Snd.wake(false));
window.addEventListener('focus', () => Snd.wake(false));
for (const ev of ['touchend', 'click', 'keydown']) document.addEventListener(ev, () => Snd.wake(true), true);
// (its check once a second only while the page is shown)
let watchI = setInterval(() => Snd.watch(), 1000);
document.addEventListener('visibilitychange', () => { clearInterval(watchI); if (!document.hidden) watchI = setInterval(() => Snd.watch(), 1000); });
// the iOS app calls these when it leaves and when it is active again (its audio session is back by then)
// (appHeld: from the app's sleep to its wake the page's own returns (visibility, pageshow, focus) leave the sound alone:
// each had built a context at once, before the app's audio session was back, and the app's wake a quarter second on
// built another over it)
window.__audioSleep = () => { Snd.appHeld = true; Snd.sleep(); };
// (rebuilt only after a real sleep: the app also calls this after a screenshot, a screen recording's start and stop, and
// AirPlay, and a whole new sound was built each time, 16-51 ms on the main thread, every voice cut)
window.__audioWake = force => { const slept = Snd.appHeld || !!force; Snd.appHeld = false; if (slept) { Snd.stale = true; Snd.builtAt = 0; Snd.backoff = 1500; } Snd.wake(false); };
// The store (the Android app's Google Play Billing, android/app/.../Store.java, as window.SaqrStore): what the player
// has bought, by product id, kept here too (saqr.owned) so it holds without the network. PAID says what each product
// unlocks; it is empty until the owner settles what is sold, so nothing is locked and the store is not asked.
const PAID = {};
const STORE = { on: !!window.SaqrStore, products: {}, owned: new Set((() => { try { return JSON.parse(localStorage.getItem('saqr.owned') || '[]'); } catch (_) { return []; } })()) };
const owns = id => !PAID[id] || STORE.owned.has(id);
window.__store = ev => {
  if (ev.type === 'products') for (const p of ev.list) STORE.products[p.id] = p;
  else if (ev.type === 'owned') STORE.owned = new Set(ev.ids);
  else if (ev.type === 'bought') STORE.owned.add(ev.id);
  try { localStorage.setItem('saqr.owned', JSON.stringify([...STORE.owned])); } catch (_) {}
  if (S.phase !== 'play') syncMenu();
};
if (STORE.on && Object.keys(PAID).length) window.SaqrStore.start(JSON.stringify(Object.keys(PAID)));
// The system's back (the Android app): an open panel or picture shut, the editor left, the menu taken to its home
// screen, the end card back to the menu; in a mission the scene frozen and let go again (no mission thrown away by a
// stray swipe). Says whether it took it: if not (the menu's home), the app goes to the background
window.__back = () => {
  if (!$('#ovShot').hidden) { $('#ovShot').hidden = true; return true; }
  if (!$('#ovTut').hidden) { $('#ovTut').hidden = true; TT.done = null; return true; }
  if (!$('#panHow').hidden) { $('#panHow').hidden = true; return true; }
  if (!$('#ovEdit').hidden) { $('#edBack').click(); return true; }
  if (!$('#ovEnd').hidden) { showMenu(); return true; }
  if (!$('#ovStart').hidden) { const on = $('#nTabs .on'); if (on && on.dataset.scr !== 'home') { showScr('home'); return true; } return false; }
  if (S.phase === 'play') { toggleFreeze(); return true; }
  return false;
};
