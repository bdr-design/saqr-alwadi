/* ===================== the observer's camera ===================== */
/* HUNTER's long lens on the high ground (OBS, the iPad's observer tab): at each of the jet's releases it takes the
   strike from where an observer would stand, 3.5 to 4.5 km from the target on the highest ground round it (the
   country's own heights, elevAt; on the theatre, off the run's side), the jet on its run and away, the weapon all
   the way down, the impact and the smoke for some seconds after. It is drawn as the canopy's world is (the ground,
   the effects, the sky and the dust: winMat's pass, without the glass), from that camera, 640 x 360, 15 times a
   second, and only while a strike is on: nothing is drawn for it the rest of the time. Each frame is copied off the
   screen's canvas at once (as the VID page copies the sensor's video), the camera's own marks burnt in, and recorded
   (MediaRecorder: MP4 where the browser makes it, else WebM). Each strike a clip: played on the iPad or the whole
   screen, saved to the phone (the Photos on an iPhone, the gallery on Android: the apps' own bridges) or shared.
   The jet in it is the ZF-25 itself, in the air (models/zf25_fly3.glb: gear up, its stores). */
const OBS_W = 640, OBS_H = 360, OBS_FPS = 15, OBS_MAX = 6, OBS_REF_FOV = 40;
const OBSR = { rec: null, model: null, s: 0, g: null, jet: null, bomb: null, cam: null, rtA: null, rtE: null, mat: null, scene: null, cv: null, ctx: null, acc: 0 };
const OBS_MIME = (() => { try { if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
  return ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => MediaRecorder.isTypeSupported(t)) || null; } catch (_) { return null; } })();
// (the jet in the air: loaded once the jet is chosen and the browser can record, a third of a megabyte)
function obsInit() {
  if (!JET || !OBS_MIME || OBSR.s) return; OBSR.s = 1;
  const go = () => { try {
    if (!THREE.GLTFLoader) { OBSR.s = -1; return; }
    // (built and its shaders and textures sent to the GPU as soon as it is here, not at the first release: no hitch then)
    new THREE.GLTFLoader().load('models/zf25_fly3.glb', gl => { OBSR.model = gl.scene; zfLambert(OBSR.model); OBSR.s = 2;
      try { obsBuild(); OBSR.g.visible = true; renderer.compile(sceneA, OBSR.cam); OBSR.g.visible = false; } catch (_) {} }, undefined, () => { OBSR.s = -1; });
  } catch (_) { OBSR.s = -1; } };
  if (THREE.GLTFLoader) go(); else { const sc = document.createElement('script'); sc.src = 'models/GLTFLoader.r128.js'; sc.onload = go; sc.onerror = () => { OBSR.s = -1; }; document.head.appendChild(sc); }
}
function obsBuild() {
  if (OBSR.g) return;
  const g = OBSR.g = new THREE.Group(); g.visible = false; sceneA.add(g);
  // the jet: its glTF frame (y up, nose +x) to the world's (z up), its size in map px; placed each frame by its axes
  const j = OBSR.jet = new THREE.Group(), m = OBSR.model.clone(); m.rotation.x = Math.PI / 2; m.scale.setScalar(PXM);
  j.add(m); j.matrixAutoUpdate = false; g.add(j);
  // the weapon on its way: a bomb's olive drab body, the Barq's white (sized for the GBU-31; the 500 lb ones show the same
  // at 4 km)
  const bg = new THREE.CylinderGeometry(0.23 * PXM, 0.23 * PXM, 3.9 * PXM, 10); bg.rotateZ(Math.PI / 2);
  const bm = new THREE.MeshLambertMaterial({ color: 0x4d5040 });
  OBSR.bombs = [0, 1, 2, 3].map(() => { const b = new THREE.Mesh(bg, bm); b.renderOrder = 36; b.visible = false; g.add(b); return b; });
  // their light: the mission's sun (the day's or the evening's, winMat's sunD, set each frame) and the sky, as the
  // parked jets'
  const sun = OBSR.sun = new THREE.DirectionalLight(0xfff1dc, 2.0); sun.position.copy(winMat.uniforms.sunD.value); g.add(sun); g.add(sun.target);
  const sky = new THREE.HemisphereLight(0xcfdcef, 0x9a8a70, 1.0); sky.up.set(0, 0, 1); sky.position.set(0, 0, 1); g.add(sky);
  OBSR.cam = new THREE.PerspectiveCamera(6, OBS_W / OBS_H, 5, 60000); OBSR.cam.up.set(0, 0, 1);
  OBSR.rtA = new THREE.WebGLRenderTarget(OBS_W, OBS_H, Object.assign({}, rtOpts, { depthBuffer: true })); OBSR.rtE = new THREE.WebGLRenderTarget(OBS_W, OBS_H, rtOpts);
  // the canopy's own compositing (the sky where nothing was drawn, the dust layer, the fires' glow), without its glass
  OBSR.mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(winMat.uniforms), vertexShader: winMat.vertexShader, fragmentShader: winMat.fragmentShader, depthTest: false, depthWrite: false });
  const u = OBSR.mat.uniforms; u.tA.value = OBSR.rtA.texture; u.tE.value = OBSR.rtE.texture; u.glass.value = 0; u.jet.value = 1; u.res.value.set(OBS_W, OBS_H);
  OBSR.scene = new THREE.Scene(); OBSR.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), OBSR.mat));
  OBSR.cv = document.createElement('canvas'); OBSR.cv.width = OBS_W; OBSR.cv.height = OBS_H; OBSR.ctx = OBSR.cv.getContext('2d');
}
// where the observer stands: the highest ground on a ring 3.5-4.5 km round the target (dry land, on the country); on the
// theatre (no heights) off the side of the run, on a rise some 40 m up
function obsSpot(tp) {
  const out = (x, y, h) => ({ x, y, h: clamp(h, 2, 450) });
  if (MAP.country && elevAt(tp.x, tp.y) != null) {
    const g0 = elevAt(tp.x, tp.y); let best = null;
    for (let i = 0; i < 24; i++) for (const r of [3500, 4000, 4500]) {
      const a = i * Math.PI / 12, x = tp.x + Math.cos(a) * r * PXM, y = tp.y + Math.sin(a) * r * PXM, e = elevAt(x, y);
      if (e == null || onWater(x, y) || e < 1) continue;
      if (!best || e > best.e) best = { x, y, e };
    }
    if (best) return out(best.x, best.y, best.e - g0 + 2);
  }
  // (no heights: dry land on the map, 4 km off, as near the run's side as there is any; on a rise some 120 m up)
  let best = null;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12, x = tp.x + Math.cos(a) * 4000 * PXM, y = tp.y + Math.sin(a) * 4000 * PXM;
    if (x < 0 || y < 0 || x > W0 || y > H0 || onWater(x, y)) continue;
    const sc = Math.abs(Math.sin(a - plane.track)); if (!best || sc > best.sc) best = { x, y, sc };
  }
  const a = plane.track + Math.PI / 2;
  return best ? out(best.x, best.y, 120) : out(tp.x + Math.cos(a) * 4000 * PXM, tp.y + Math.sin(a) * 4000 * PXM, 120);
}
// a release: the strike taken from now to some seconds after it lands (one at a time: a second weapon while one is
// being taken is in the same clip, which runs on until the last of them has landed)
function obsWpn(p, t) { return { p, x0: plane.x, y0: plane.y, h0: plane.alt - GROUND, t0: t, imp: null }; }
function obsStart(w, p) {
  if (!JET || !OBS_MIME || OBSR.s !== 2) return;
  if (OBSR.rec) { if (OBSR.rec.ws.length < 4) OBSR.rec.ws.push(obsWpn(p, OBSR.rec.t)); return; }
  obsBuild();
  // (round what it is aimed at: a guided weapon's target, the GPS bomb's coordinates; not where a laser bomb would fall
  // on its own, which it steers off)
  const tg = p.tgt && p.type !== 'jdam' ? p.tgt : p, tp = { x: tg.x, y: tg.y }, cam = obsSpot(tp);
  let rec;
  try {
    const st = OBSR.cv.captureStream(0), tr = st.getVideoTracks()[0], manual = !!(tr && tr.requestFrame);
    const s = manual ? st : OBSR.cv.captureStream(OBS_FPS);
    // (1.2 Mb/s: 640 x 360 at 15 a second is clean at that, and six clips of a minute stay some 50 MB, sent whole
    // through the apps' bridges)
    const mr = new MediaRecorder(s, { mimeType: OBS_MIME, videoBitsPerSecond: 1200000 });
    rec = { w, p, tp, cam, mr, tr: manual ? s.getVideoTracks()[0] : null, chunks: [], t: 0, ws: [obsWpn(p, 0)], e: 0,
      look: null, wf: 900, zoom: 1, at: efbClock(true), mime: OBS_MIME };
    mr.ondataavailable = e => { if (e.data && e.data.size) rec.chunks.push(e.data); };
    // (the canvas's streams let go when it stops: the one asked of first too, where the browser could not be given frames)
    mr.onstop = () => { for (const t of st.getTracks().concat(s.getTracks())) try { t.stop(); } catch (_) {} obsDone(rec); };
    mr.start(1000);
  } catch (_) { return; }
  OBSR.rec = rec; OBSR.acc = 1; OBSR.lastT = performance.now();
}
// where the weapon is now: along from the release to where it falls (a bomb's height falling away as its time does
// squared, the Barq's straight down its line)
function obsWeapon(r, ahead) {
  const p = r.p, f = clamp(1 - Math.max(p.tti - (ahead || 0), 0) / Math.max(p.tof, 0.1), 0, 1);
  // (where it will land as it is steered now: the laser bomb's point moves to the spot as it falls)
  return { x: lerp(r.x0, p.x, f), y: lerp(r.y0, p.y, f), h: r.h0 * (p.type === 'agm' ? 1 - f : 1 - f * f), f };
}
// (the take held while the scene is: frozen, or the game out of sight; the recorder paused with it, so the clip has
// no stretch of a still picture in it)
function obsHeld() { return S.frozen || document.hidden; }
document.addEventListener('visibilitychange', () => { const r = OBSR.rec; if (!r) return;
  try { if (document.hidden) { if (r.mr.state === 'recording') r.mr.pause(); } else if (!S.frozen && r.mr.state === 'paused') r.mr.resume(); } catch (_) {} OBSR.lastT = performance.now(); });
function obsTick() {
  const r = OBSR.rec; if (!r) return;
  // (in real time: the clip plays as it was seen, whatever the sim's time compression)
  const now = performance.now(), rdt = Math.min((now - OBSR.lastT) / 1000, 0.25); OBSR.lastT = now;
  if (S.phase !== 'play') { OBSR.rec = null; try { r.mr.stop(); } catch (_) {} return; }
  if (obsHeld()) { try { if (r.mr.state === 'recording') r.mr.pause(); } catch (_) {} return; }
  try { if (r.mr.state === 'paused') r.mr.resume(); } catch (_) {}
  r.t += rdt; OBSR.acc += rdt;
  for (const e of r.ws) if (e.imp == null && e.p.tti <= 0) e.imp = r.t;
  // (the one followed: the first still on its way; when all are down, the last to land)
  const fall = r.ws.find(e => e.imp == null), last = fall ? null : r.ws.reduce((a, e) => e.imp > a.imp ? e : a);
  if ((last && r.t - last.imp > 8) || r.t > 90) { OBSR.rec = null; try { r.mr.stop(); } catch (_) {} return; }
  if (OBSR.acc < 1 / OBS_FPS) return;
  const dt = Math.min(OBSR.acc, 0.25); OBSR.acc = 0;
  // what the lens is on: the jet and its weapon to begin with, then the weapon down, then where it struck; how wide
  // (m across the picture), as the observer zooms
  const jp = { x: plane.x, y: plane.y, h: plane.alt - GROUND };
  let want, wf;
  // (the jet close for its first seconds, some 120 m across: the weapon coming off it; then the weapon followed down,
  // 70 m across; its last seconds the lens comes out to the target's ground, 260 m, so the impact is in the picture)
  if (fall) {
    const b = obsWeapon(fall), p = fall.p;
    // (real seconds to impact: the fall may run compressed. Once the lens has begun to come out it does not go back in:
    // the compression lets go at 5 s, and the same seconds left would read longer then)
    const left = p.tti / Math.max(timeK(), 1);
    if (fall !== r.cur) { r.cur = fall; r.e = 0; }
    const k = clamp((r.t - fall.t0 - 3) / 2, 0, 1), e = r.e = Math.max(r.e, clamp((4 - left) / 2.5, 0, 1));
    want = { x: lerp(lerp(jp.x, b.x, k), p.x, e), y: lerp(lerp(jp.y, b.y, k), p.y, e), h: lerp(lerp(jp.h, b.h, k), 15, e) };
    wf = lerp(lerp(120, 70, k), 260, e);
  } else { const p = last.p; want = { x: p.ix != null ? p.ix : p.x, y: p.iy != null ? p.iy : p.y, h: 25 }; wf = lerp(260, 380, clamp((r.t - last.imp) / 8, 0, 1)); }
  // (on the jet and the falling weapon without a lag: some 300 m/s at 70 m across leaves the picture in a quarter second;
  // the hand's ease is in the blends from one to the next)
  r.look = want;
  r.wf += (wf - r.wf) * (1 - Math.exp(-dt / 0.6));
  obsRender(r, jp);
}
function obsRender(r, jp) {
  const c = OBSR.cam, cx = r.cam.x, cy = r.cam.y, ch = r.cam.h, D = Math.max(Math.hypot(Math.hypot(r.look.x - cx, r.look.y - cy) * MPP, r.look.h - ch), 50);
  const fov = clamp(2 * Math.atan(r.wf * OBS_H / OBS_W / 2 / D) * 180 / Math.PI, 0.6, 30);
  c.fov = fov; c.near = 2 * PXM; c.far = 60000; c.updateProjectionMatrix(); r.zoom = Math.round(OBS_REF_FOV / fov);
  c.position.set(cx, -cy, ch * PXM); c.lookAt(r.look.x, -r.look.y, r.look.h * PXM); c.updateMatrixWorld();
  // the jet where it is, as it is (its axes: east, north, up), and the weapon until it lands
  if (JX.ac) { const { F, R, U } = jetAxes(), m = OBSR.jet.matrix;
    m.makeBasis(new THREE.Vector3(F.x, F.y, F.z), new THREE.Vector3(-R.x, -R.y, -R.z), new THREE.Vector3(U.x, U.y, U.z)).setPosition(jp.x, -jp.y, jp.h * PXM); OBSR.jet.matrixWorldNeedsUpdate = true; }
  OBSR.bombs.forEach((m, i) => { const e = r.ws[i]; m.visible = !!e && e.imp == null; if (!m.visible) return;
    const b = obsWeapon(e), nb = obsWeapon(e, 0.2);
    m.position.set(b.x, -b.y, b.h * PXM); m.lookAt(nb.x, -nb.y, nb.h * PXM); m.rotateY(-Math.PI / 2); });
  OBSR.sun.position.copy(winMat.uniforms.sunD.value);
  // the world as the canopy draws it, from here: the effects facing this camera, the far ground and the region round it
  const cr = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 0); cr.z = 0; cr.normalize();
  for (const l of [smokeL, fireL, glowE, plumeW, fireW, glowW]) { const u = l.mesh.material.uniforms; u.bill.value = 1; u.camR.value.copy(cr); }
  plumeW.mesh.visible = fireW.mesh.visible = glowW.mesh.visible = true;
  farHaze.visible = !ctWhole(); if (MAP.country) { const rp = 6000 / MPP; farHaze.position.set(Math.round(cx / rp) * rp, -Math.round(cy / rp) * rp, 0); }
  for (const m of REGION_WIN) m.visible = true;
  // (the ground as the canopy has it: the sensor's sharper tiles cover only where it looks, so they are hidden and the
  // whole-map level 0 shown, then each put back as it was)
  const hid = [], shw = [];
  for (const t of tiles.values()) { if (!t.mesh) continue; if (t.L > 0 || miniMesh) { if (t.mesh.visible) { t.mesh.visible = false; hid.push(t.mesh); } } else if (!t.mesh.visible) { t.mesh.visible = true; shw.push(t.mesh); } }
  sceneA.fog = null; OBSR.g.visible = true;
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(OBSR.rtA); renderer.clear(); renderer.render(sceneA, c);
  OBSR.g.visible = false;
  renderer.setClearColor(0x000000, 1);
  renderer.setRenderTarget(OBSR.rtE); renderer.clear(); if (fireL.n + glowE.n + fireW.n + glowW.n) renderer.render(sceneE, c);
  for (const l of [smokeL, fireL, glowE]) l.mesh.material.uniforms.bill.value = 0;
  plumeW.mesh.visible = fireW.mesh.visible = glowW.mesh.visible = false; farHaze.visible = false; for (const m of REGION_WIN) m.visible = false;
  for (const m of hid) m.visible = true; for (const m of shw) m.visible = false;
  // the sky, the dust and the light, as winMat's: its dust from here (a short path down from the hill, the layer's
  // depth over it looking up at the jet), no glass
  const u = OBSR.mat.uniforms, w = winMat.uniforms;
  // (the night and the blast's light from the scene itself: winMat's are set only when the canopy is drawn, and the
  // sensor may fill the screen)
  for (const k of ['dusk', 'dustK']) u[k].value = w[k].value; u.sunD.value.copy(w.sunD.value); u.time.value = S.t;
  u.night.value = S.night ? 1 : 0; u.flash.value = S.flash * (S.night ? 0.45 : 0.16);
  u.dust.value.setHex(S.wx === 'dust' ? 0x9c8566 : S.dusk ? 0xb8957a : JET_DUST);
  u.invVP.value.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse).invert(); u.eye.value.setFromMatrixPosition(c.matrixWorld);
  const dk = S.wx === 'dust' ? 1 : 0;
  u.hz.value = -Math.sqrt(2 * Math.max(ch, 1) / 6.371e6); u.hk.value = JET_HAZE.k * (1 + 4 * dk) * Math.max(ch, 1);
  u.hkUp.value = JET_HAZE.k * (1 + 4 * dk) * Math.max(0, (JET_HAZE.top - 410) * (1 + dk) - ch);
  // onto the screen's canvas, in its corner, copied off at once, then the corner cleared for the frame's own drawing
  const cv = renderer.domElement, bx = (OBS_W + 0.5) / PR, by = (OBS_H + 0.5) / PR;
  renderer.setRenderTarget(null); renderer.setViewport(0, 0, bx, by); renderer.setScissor(0, 0, bx, by); renderer.setScissorTest(true);
  renderer.clear(); renderer.render(OBSR.scene, postCam);
  const x = OBSR.ctx; x.drawImage(cv, 0, cv.height - OBS_H, OBS_W, OBS_H, 0, 0, OBS_W, OBS_H);
  renderer.clear(); renderer.setScissorTest(false); renderer.setViewport(0, 0, VW, VH);
  // the camera's own marks (in Latin, as it writes them): recording, its zoom and range to the target, the time
  const rng = Math.hypot(r.tp.x - cx, r.tp.y - cy) * MPP / 1000, brg = Math.round((Math.atan2(r.tp.x - cx, -(r.tp.y - cy)) * 180 / Math.PI + 360) % 360);
  r.rng = rng; r.brg = brg;
  x.save(); x.font = '600 15px ui-monospace, Menlo, monospace'; x.shadowColor = 'rgba(0,0,0,0.8)'; x.shadowBlur = 3; x.fillStyle = '#ff4b4b';
  x.beginPath(); x.arc(18, 20, 5, 0, 6.283); x.fill(); x.fillStyle = '#fff'; x.textBaseline = 'middle';
  x.fillText('REC  OBS 1', 30, 20); x.textAlign = 'right'; x.fillText(efbClock(true), OBS_W - 14, 20);
  x.textAlign = 'left'; x.fillText('×' + r.zoom + '   ' + rng.toFixed(1) + ' KM   ' + String(brg).padStart(3, '0') + '°', 14, OBS_H - 18);
  x.restore();
  if (r.tr) r.tr.requestFrame();
}
// a strike taken: its clip on the iPad (the newest first; six kept)
function obsDone(r) {
  if (!r.chunks.length) return;
  const blob = new Blob(r.chunks, { type: r.mime.split(';')[0] });
  OBS.clips.unshift({ blob, url: URL.createObjectURL(blob), w: WN(r.w), at: r.at, hit: r.ws.some(e => e.p.shot && e.p.shot.hit), rng: r.rng || 4, brg: r.brg || 0, zoom: r.zoom || 1, dur: Math.max(1, r.t), mime: r.mime.split(';')[0] });
  while (OBS.clips.length > OBS_MAX) { const o = OBS.clips.pop(); URL.revokeObjectURL(o.url); }
  OBS.sel = 0; OBS.t = 0; OBS.play = false; obsVideo(); EFB.dirty = true;
}
// the clip being played: a video element of its own, drawn onto the iPad's screen (and shown whole for the full screen)
function obsVideo() {
  const cl = OBS.clips[OBS.sel]; if (!cl) return;
  if (!OBS.vid) { const v = OBS.vid = document.createElement('video'); v.muted = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.preload = 'auto';
    v.addEventListener('ended', () => { OBS.play = false; EFB.dirty = true; }); }
  if (OBS.vid.src !== cl.url) OBS.vid.src = cl.url;
}
function obsPlay(on) {
  obsVideo(); const v = OBS.vid; if (!v) return;
  OBS.play = on; if (on) { if (v.ended) v.currentTime = 0; const q = v.play(); if (q && q.catch) q.catch(() => { OBS.play = false; }); } else v.pause();
  EFB.dirty = true;
}
// the whole screen: the clip with the player's own controls, a close button
function obsFull() {
  const cl = OBS.clips[OBS.sel]; if (!cl) return;
  obsPlay(false);
  const o = document.createElement('div'); o.id = 'obsFull';
  o.style.cssText = 'position:fixed;inset:0;z-index:9000;background:#000;display:flex;align-items:center;justify-content:center';
  const v = document.createElement('video'); v.src = cl.url; v.controls = true; v.autoplay = true; v.playsInline = true; v.setAttribute('playsinline', ''); v.muted = true;
  v.style.cssText = 'max-width:100%;max-height:100%';
  const x = document.createElement('button'); x.type = 'button'; x.textContent = '✕'; x.setAttribute('aria-label', Lg('إغلاق', 'Close'));
  x.style.cssText = 'position:absolute;top:calc(env(safe-area-inset-top) + 12px);right:calc(env(safe-area-inset-right) + 12px);width:44px;height:44px;border-radius:22px;border:0;background:rgba(255,255,255,0.18);color:#fff;font-size:20px';
  x.onclick = () => o.remove(); o.append(v, x); document.body.append(o);
}
// to the phone: the apps' bridges (the iPhone's Photos and its share sheet: webkit.messageHandlers.video; Android's
// gallery and its share: window.SaqrMedia), else the browser's own share of the file, or a download
function obsName(cl) { return 'saqr-strike-' + cl.at.replace(/\D/g, '') + '-' + Date.now().toString(36) + (cl.mime.includes('mp4') ? '.mp4' : '.webm'); }
function obsB64(blob) { return new Promise((ok, no) => { const f = new FileReader(); f.onload = () => ok(String(f.result).split(',')[1]); f.onerror = no; f.readAsDataURL(blob); }); }
function obsToast(ar, en) { CK.msg = { s: Lg(ar, en), t: 2.5 }; EFB.toast = { s: Lg(ar, en), t: performance.now() }; EFB.dirty = true; }
async function obsKeep(act) {
  const cl = OBS.clips[OBS.sel]; if (!cl) return;
  const name = obsName(cl), ios = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.video, and = window.SaqrMedia;
  try {
    if (ios) { const r = await ios.postMessage({ b64: await obsB64(cl.blob), mime: cl.mime, name, act }); if (act === 'save') obsToast(r === 'saved' ? 'حُفظ في الصور' : 'لم يُحفظ', r === 'saved' ? 'SAVED TO PHOTOS' : 'NOT SAVED'); return; }
    if (and) { and[act](await obsB64(cl.blob), cl.mime, name); return; }
    const file = new File([cl.blob], name, { type: cl.mime });
    if (act === 'share' && navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return; }
    const a = document.createElement('a'); a.href = cl.url; a.download = name; document.body.append(a); a.click(); a.remove();
    obsToast('حُفظ في التنزيلات', 'DOWNLOADED');
  } catch (e) { if (!e || e.name !== 'AbortError') obsToast('تعذّر', 'FAILED'); }
}
// (Android's answer: {type: 'saved' | 'shared' | 'perm' | 'error'})
window.__media = m => { if (!m) return; if (m.type === 'saved') obsToast('حُفظ في المعرض', 'SAVED TO GALLERY'); else if (m.type === 'perm') obsToast('اسمح بالحفظ ثم أعد المحاولة', 'ALLOW STORAGE, THEN AGAIN'); else if (m.type === 'error') obsToast('تعذّر الحفظ', 'NOT SAVED'); };
