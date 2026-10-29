/* ===================== frame ===================== */
function resize() {
  layoutOrientation();
  VW = Math.max(1, app.clientWidth); VH = Math.max(1, app.clientHeight);
  renderer.setPixelRatio(PR); renderer.setSize(VW, VH, false);
  const w = Math.round(VW * PR), h = Math.round(VH * PR);
  rtA.setSize(w, h); rtL.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); rtE.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1)); rtH.setSize(Math.max(1, w >> 1), Math.max(1, h >> 1));
  post.uniforms.res.value.set(w >> 1, h >> 1); post.uniforms.resA.value.set(w, h);
  hud.width = w; hud.height = h;
  ckResize(); if (JET) efbLayout();
  // layout (untransformed) offsets, so the symbology lines up in the rotated console too
  const rl = $('#railL'), rr = $('#railR'), dk = $('#dock');
  railLx = rl.offsetLeft + rl.offsetWidth + 12; railRx = VW - rr.offsetLeft + 12;
  topInset = Math.max(0, rl.offsetTop - 10); botInset = Math.max(0, VH - (dk.offsetTop + dk.offsetHeight) - 10);
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
let vidT = 0;
const rtClear = new WeakSet();
function pass(rt, scene, empty, camera) {
  if (empty && rtClear.has(rt)) return;
  renderer.setRenderTarget(rt); renderer.clear(); if (!empty) renderer.render(scene, camera || cam);
  if (empty) rtClear.add(rt); else rtClear.delete(rt);
}
function renderFrame(dt) {
  { const v = S.view, ox = v.w * (OVERSCAN - 1) / 2, oy = v.h * (OVERSCAN - 1) / 2; updateTiles(v.x0 - ox, v.y0 - oy, v.x1 + ox, v.y1 + oy); }
  for (const l of LAYERS) l.flush();
  renderer.setClearColor(0x000000, 1);
  // sensor: full-size targets when it fills the screen (or is zooming), small ones while it sits in the TEDAC
  const ck = CK.t < 1, small = CK.t === 0 && CK.lean < 1.25;
  const A = small ? rtAs : rtA, L = small ? rtLs : rtL, E = small ? rtEs : rtE, Hh = small ? rtHs : rtH;
  post.uniforms.tA.value = A.texture; post.uniforms.tL.value = L.texture; post.uniforms.tE.value = E.texture; post.uniforms.tH.value = Hh.texture;
  post.uniforms.resA.value.set(A.width, A.height); post.uniforms.res.value.set(E.width, E.height);
  // (the sensor's video in the TEDAC or on an MPD is drawn 30 times a second, as the real video is; the screen still
  // shows it every frame. Its lights and fire targets are not drawn again while they stay empty)
  const now = performance.now();
  if (!small || now - vidT >= 1000 / 31 || window.__capture) {
    vidT = now;
    renderer.setRenderTarget(A); renderer.clear(); renderer.render(sceneA, cam);
    pass(L, sceneL, lightL.n + coneL.n === 0);
    pass(E, sceneE, fireL.n + glowE.n === 0);
    if (S.sensor !== 'eo') { renderer.setRenderTarget(Hh); renderer.clear(); renderer.render(sceneH, cam); }
  }
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
let last = performance.now(), slowT = 0, uiT = 0, engT = 0, lastDraw = 0, hudBlank = false;
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
const ovStartEl = $('#ovStart'), ovEndEl = $('#ovEnd');
function frame(now) {
  if (ED.open) { last = now; requestAnimationFrame(frame); return; }
  pumpTiles(1);
  // at most 60 frames a second (a 120 Hz screen would only draw each twice), 30 when the phone runs hot, and a dozen
  // behind the menu's dark veil; the tiles keep coming in meanwhile
  const veiled = !BOOTING && (!ovStartEl.hidden || !ovEndEl.hidden), fps = window.__capture ? 1e6 : veiled ? 12 : THERMAL >= 2 ? 31 : 72;
  if (now - lastDraw < 1000 / fps) { requestAnimationFrame(frame); return; }
  lastDraw = now;
  const rdt = Math.min(0.05, (now - last) / 1000); last = now;
  // the world in steps of a frame's time, two or four a frame while the time runs fast (timeK: a bomb's long fall)
  const nk = S.frozen ? 1 : timeK(), dt = S.frozen ? 0 : rdt * nk, sdt = dt / nk;
  for (let k = 0; k < nk; k++) {
    S.t += sdt;
    if (S.phase === 'play') S.missionT += sdt;
    updatePlane(sdt);
    for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= sdt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } }
    let moving = 0; for (const v of vehicles) if (v.alive && !v.escaped && !v.dormant && v.v > 2) moving++;
    DUST_K = Math.min(1, 5 / Math.max(1, moving));
    for (const v of vehicles) driveVehicle(v, sdt);
    for (const g of groups) updateGroup(g, sdt);
    for (const k in S.cool) S.cool[k] = Math.max(0, S.cool[k] - sdt);
    for (const l of LAYERS) l.update(sdt);
    updateProjectiles(sdt);
    for (const v of vehicles) vehicleHeat(v, sdt);
    updateEmitters(sdt);
    if (sdt > 0) updateWar(sdt);
    updateIllum(sdt); fcrUpdate(sdt);
  }
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
  ckUpdate(rdt); if (JET) efbTick(rdt);
  if (S.nucHold > 0) S.nucHold -= rdt; else renderFrame(dt);
  if (tapeReq.length) tapeGrab();
  // the sensor's symbology fades in only as the sensor fills the screen (its canvas is fully transparent up to CK.t
  // 0.35): a full-screen canvas at the screen's resolution is not drawn while nobody can see it
  if (CK.t > 0.35) { drawHud(false); hudBlank = false; } else if (!hudBlank) { hctx.setTransform(1, 0, 0, 1, 0, 0); hctx.clearRect(0, 0, hud.width, hud.height); hudBlank = true; }
  if (CK.t < 1) drawMpds(rdt);
  uiT -= rdt; if (uiT <= 0) { uiT = 0.2; syncDock(); syncLockBtn(); }
  // adaptive resolution keeps older phones smooth
  // (not while loading: the loading work itself is slow, and must not cost the picture its resolution)
  // (nor while the frames are spaced on purpose: behind the menu, or the phone hot)
  // (__capture: tools/trailer, frame by frame. The else was inside this comment: slowT never came down, so a slow
  // frame now and then, over a long sortie, added up to the resolution cut for good)
  if (rdt > 0.026 && !BOOTING && !veiled && THERMAL < 2 && !window.__capture) slowT += rdt; else slowT = Math.max(0, slowT - rdt * 0.5);
  if (slowT > 2 && PR > (HIQ ? 2 : 1)) { PR = Math.max(HIQ ? 2 : 1, PR - 0.25); slowT = 0; resize(); }
  requestAnimationFrame(frame);
}
let lastQ = -1, lastTr = null;
function syncLockBtn() { if (S.quality !== lastQ || S.tracking !== lastTr) { lastQ = S.quality; lastTr = S.tracking; syncUI(); } }

/* ===================== boot ===================== */
ckImg.src = CK_IMG + 'day.webp';
try { const td = localStorage.getItem('saqr.tod') || (localStorage.getItem('saqr.night') === '1' ? 'night' : 'day'); S.todPref = td; S.dusk = td === 'dusk'; if (td === 'night') setNight(true); S.wx = localStorage.getItem('saqr.wx') === 'dust' ? 'dust' : 'clear'; applySky(); const ss = localStorage.getItem('saqr.sensor'); if (ss === 'wh' || ss === 'bh') setSensor(ss); } catch (_) {}
resize();
setupMission();
updateView(0);
ckShow(true);
// base map first, then the start button unlocks
// Loading screen: nothing starts until everything is in: every image (sprites, houses, cockpit day and night, the
// map's base and far tiles), every synthesised sound, the fonts, and the GPU warmed (textures uploaded, every shader
// compiled, one frame drawn in each sensor mode by day and night), so the mission has nothing left to build.
let BOOTING = true;
const need = [[0, 0, 0], [0, 1, 0]];
function bootStage(ar, en, k) { $('#ldStage').textContent = EN ? en.charAt(0) + en.slice(1).toLowerCase() : ar; $('#ldStageEn').textContent = en; $('#ldBar').style.transform = 'scaleX(' + k.toFixed(3) + ')'; $('#ldPct').textContent = Math.round(k * 100) + '%'; }
const until = (cond, onTick, max) => new Promise(ok => { const t0 = performance.now(); const f = () => { onTick && onTick(); if (cond() || performance.now() - t0 > max) ok(); else setTimeout(f, 50); }; f(); });
const decodeImg = src => { const i = new Image(); i.src = src; return (i.decode ? i.decode() : new Promise(r => { i.onload = i.onerror = r; })).catch(() => {}); };
async function boot() {
  // 1) images: the base map, the far field, every sprite, both cockpit photos
  need.forEach(([L, x, y]) => { BOOT.total++; ensureTile(L, x, y, () => { BOOT.done++; }); });
  loadFar();
  const cockpit = Promise.all([CK_IMG + 'day.webp', CK_IMG + 'night.webp', ...(REGION.length ? [] : [MAP.dir + 'tiles/far/tsd.jpg']), ...(JET ? ['sprites/efb.webp'] : [])].map(decodeImg));
  if (JET) $('#efbImg').src = 'sprites/efb.webp';
  await until(() => BOOT.done >= BOOT.total && !tileQueue.length, () => { pumpTiles(4); bootStage('تحميل الخريطة والصور', 'LOADING MAP & IMAGES', 0.4 * BOOT.done / Math.max(1, BOOT.total)); }, 30000);
  await cockpit;
  // 2) sounds, all of them
  Snd.prepare();
  if (Snd.ready) await until(() => Snd.jobsDone >= Snd.jobsTotal, () => bootStage('تجهيز الأصوات', 'BUILDING SOUND', 0.4 + 0.45 * Snd.jobsDone / Math.max(1, Snd.jobsTotal)), 60000);
  // 3) the GPU: upload every texture and compile every material, hidden ones included, then a frame in each mode
  bootStage('تجهيز الرسوميات', 'WARMING GRAPHICS', 0.88);
  await new Promise(r => setTimeout(r, 30));
  for (const t of BOOT.tex) try { renderer.initTexture(t); } catch (_) {}
  for (const [sc, cm] of [[sceneA, cam], [sceneL, cam], [sceneE, cam], [sceneH, cam], [postScene, postCam], [winScene, postCam], [sceneA, wcam]]) {
    const hidden = []; sc.traverse(o => { if (!o.visible) { o.visible = true; hidden.push(o); } });
    try { renderer.compile(sc, cm); } catch (_) {}
    for (const o of hidden) o.visible = false;
  }
  const night = S.night, sensor = S.sensor;
  for (const n of [false, true]) for (const sn of ['eo', 'wh', 'bh']) { S.night = n; S.sensor = sn; post.uniforms.night.value = n ? 1 : 0; post.uniforms.ir.value = sn === 'eo' ? 0 : sn === 'wh' ? 1 : 2; try { renderFrame(0); } catch (_) {} }
  setNight(night); setSensor(sensor);
  await (document.fonts ? document.fonts.ready.catch(() => {}) : 0);
  bootStage('جاهز', 'READY', 1);
  BOOTING = false; slowT = 0;
  const b = $('#btnStart'); b.disabled = false; $('#startAr').textContent = Lg('ابدأ المهمة', 'Start mission'); $('#startEn').textContent = 'START';
  setTimeout(() => { $('#ovLoad').classList.add('done'); setTimeout(() => { $('#ovLoad').hidden = true; $('#ldBg').style.backgroundImage = ''; }, 450); }, 250);
}
Promise.all(['600 12px "IBM Plex Mono"', '600 12px "IBM Plex Sans Arabic"', '600 12px "IBM Plex Sans"'].map(f => document.fonts ? document.fonts.load(f) : 0)).catch(() => {});
if (location.hash === '#debug') window.__saqr = { banksPub: () => [bank, bankJ, bankA, bankAJ].map(b => b.d ? [b.d.length, b.sr, Math.round(b.d.byteLength / 1048576)] : null), EFB, efbShow, efbTask, efbDraw, jetSkipOut, jetSkipHome, tiles, THREE, tilesPub: () => [...tiles.values()].map(t => [t.k, t.loaded, !!(t.mesh && t.mesh.visible)]), get DRESS() { return DRESS; }, MAP, tracers, friends, bursts, missiles, flares, AC, launchManpads, shootBurst, acHit, timers, plumeW, fireW, renderer, explode: (x, y, k) => explode(x, y, k), W0, stepSim, fireStatePub: () => fireState(), S, CK, ED, onWater, boatLoop, jetRelease, timeK, jetOrbit, SAM, TAPE, campLoad, campStart, campIds, TR, TRAIN, tapeMark, setTod, setWx, postU: post.uniforms, smokeOver, SMOKE_LOST_PUB: SMOKE_LOST, sceneA, smokeL, startMission, MISSIONS, scoreMission, kill, damageAt, ruinHouse, alertGroup, placePlane, openEditor, edDefaultItems, houses, groups, setFlight, hoverPt, updatePlane, WIND_MS, W0, H0, MPP, ckFromImg, ckToImg, ckLook, ckLayout, setupWindowCam, wcam, BTN, TKEYS, TLAB, CTRLS, PAGES, pageKeys, GRIPS, toScreenPub: (x, y) => toScreen(x, y), targets, vehicles, projectiles, lockOn, setNight, setSensor, setCockpit, fire, Snd, makeVehicle, plane,
  roadAtPub: s => Object.assign({}, roadAt(s)), setGlassCut: on => { glassCut = on; }, glassRects, PRpub: () => PR, renderFramePub: () => renderFrame(0), setJetEye: v => { JET_EYE = v; }, setJetTilt: v => { JET_TILT = v; }, setPR: p => { PR = p; resize(); }, LOADOUTS, applyLoadout, fcrScan, lstSearch, illums, rfTarget, jtac, radio, radioClip, bank, RADIO, bankA, RADIO_A, tedacPress, gripPress, ckPressAt, mpdPress,
  JX, jetConsent, jetLar, bombFall, jetGuide, JET, jetFireState, jetDanger, checkEnd, MAP_ID,
  toSensor: () => { CK.goal = 1; CK.t = 1; ckShow(false); ckLayout(); } };
boot();
syncUI(); showScr('home');
requestAnimationFrame(t => { last = t; frame(t); });
// sound across leaving the app: suspend while away; on return wake (the app rebuilds at once, a browser on the first
// touch), and a check once a second for a context that died anyway
document.addEventListener('visibilitychange', () => { if (document.hidden) Snd.sleep(); else Snd.wake(false); });
window.addEventListener('pagehide', () => Snd.sleep());
window.addEventListener('pageshow', () => Snd.wake(false));
window.addEventListener('focus', () => Snd.wake(false));
for (const ev of ['touchend', 'click', 'keydown']) document.addEventListener(ev, () => Snd.wake(true), true);
setInterval(() => Snd.watch(), 1000);
// the iOS app calls these when it leaves and when it is active again (its audio session is back by then)
window.__audioSleep = () => Snd.sleep();
window.__audioWake = () => { Snd.stale = true; Snd.builtAt = 0; Snd.backoff = 1500; Snd.wake(false); };
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
  if (!$('#panHow').hidden) { $('#panHow').hidden = true; return true; }
  if (!$('#ovEdit').hidden) { $('#edBack').click(); return true; }
  if (!$('#ovEnd').hidden) { showMenu(); return true; }
  if (!$('#ovStart').hidden) { const on = $('#nTabs .on'); if (on && on.dataset.scr !== 'home') { showScr('home'); return true; } return false; }
  if (S.phase === 'play') { toggleFreeze(); return true; }
  return false;
};
