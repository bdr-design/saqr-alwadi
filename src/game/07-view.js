/* ===================== camera & view ===================== */
const OVERSCAN = 1.05;
// wide view: the rotating footprint always fits the map, with room left to move the camera around
function baseViewW() { return Math.min(W0, H0) * 0.8 / (OVERSCAN * Math.hypot(1, VH / VW)); }
// keep the footprint inside the map using the picture's current rotation (it turns slowly, so the limit eases)
function clampAim(a, vw, vh) {
  const hw = vw / 2 * OVERSCAN, hh = vh / 2 * OVERSCAN;
  let ex, ey;
  if (S.rot == null) { ex = ey = Math.hypot(hw, hh); }
  else { const c = Math.abs(Math.cos(S.rot)), sn = Math.abs(Math.sin(S.rot)); ex = c * hw + sn * hh + 2; ey = sn * hw + c * hh + 2; }
  a.x = 2 * ex >= W0 ? W0 / 2 : clamp(a.x, ex, W0 - ex);
  a.y = 2 * ey >= H0 ? H0 / 2 : clamp(a.y, ey, H0 - ey);
}
function updateView(dt) {
  S.zoom = lerp(S.zoom, S.zoomGoal, 1 - Math.exp(-dt * 3.2));
  if (Math.abs(S.zoom - S.zoomGoal) < 0.003) S.zoom = S.zoomGoal;
  const vw = baseViewW() / S.zoom, vh = vw * VH / VW;
  const A = S.aim, V = S.vel;
  if (S.dragging) {
    // finger drives the picture directly (see panScreen); nothing to integrate here
  } else if (S.free) {
    // coasting after a flick: velocity bleeds off gently
    const f = Math.exp(-dt * 3.5); V.x *= f; V.y *= f; A.x += V.x * dt; A.y += V.y * dt;
    if (Math.hypot(V.x, V.y) < 0.5) { V.x = V.y = 0; }
    S.aimGoal.x = A.x; S.aimGoal.y = A.y;
  } else {
    // critically damped spring toward the goal, with the target's own velocity fed forward
    let gx = S.aimGoal.x, gy = S.aimGoal.y, fvx = 0, fvy = 0;
    if (S.tracking && S.sel && !S.sel.escaped) {
      gx = S.sel.x; gy = S.sel.y;
      if (S.sel.kind === 'vehicle' && S.sel.alive) { fvx = Math.cos(S.sel.h) * S.sel.v * PXM; fvy = Math.sin(S.sel.h) * S.sel.v * PXM; }
      S.aimGoal.x = gx; S.aimGoal.y = gy;
    }
    const w = 2.0, ex = gx - A.x, ey = gy - A.y;
    V.x += (w * w * ex - 2 * w * (V.x - fvx)) * dt; V.y += (w * w * ey - 2 * w * (V.y - fvy)) * dt;
    A.x += V.x * dt; A.y += V.y * dt;
  }
  const bx = A.x, by = A.y; clampAim(A, vw, vh); if (A.x !== bx) V.x = 0; if (A.y !== by) V.y = 0;
  clampAim(S.aimGoal, vw, vh);
  const cx = A.x, cy = A.y;
  // track-up picture: screen-up follows the line of sight from the aircraft; eased so it never jumps
  const pg = planeGround(), brg = Math.atan2(cx - pg.x, -(cy - pg.y));
  if (S.rot == null) S.rot = brg; else S.rot += wrapA(brg - S.rot) * (1 - Math.exp(-dt * 0.6));
  const sb = Math.sin(S.rot), cb = Math.cos(S.rot);
  const v = S.view; v.w = vw; v.h = vh; v.cx = cx; v.cy = cy;
  v.R.x = cb; v.R.y = sb; v.D.x = -sb; v.D.y = cb;
  const hw = vw / 2 * OVERSCAN, hh = vh / 2 * OVERSCAN, ex2 = Math.abs(cb) * hw + Math.abs(sb) * hh, ey2 = Math.abs(sb) * hw + Math.abs(cb) * hh;
  v.x0 = cx - ex2; v.x1 = cx + ex2; v.y0 = cy - ey2; v.y1 = cy + ey2;
  cam.position.set(cx, -cy, 5); cam.rotation.z = -S.rot;
  cam.left = -hw; cam.right = hw; cam.top = hh; cam.bottom = -hh; cam.updateProjectionMatrix();
  // tracking quality
  if (S.tracking && S.sel && S.sel.alive) {
    S.trackT += dt;
    const off = Math.hypot(S.sel.x - cx, S.sel.y - cy) * MPP;
    let q = S.zoom < 1.9 ? 1 : S.zoom < 3.9 ? 2 : (S.trackT > 1.2 ? 3 : 2);
    if (off > 14) q = 1;
    if (S.sel.kind === 'vehicle' && S.sel.v > 13 && q > 2) q = 2;
    S.quality = q;
  } else { S.quality = 0; S.trackT = 0; }
}
const toScreen = (x, y) => { const v = S.view, k = VW / v.w, rx = x - v.cx, ry = y - v.cy; return { x: VW / 2 + (rx * v.R.x + ry * v.R.y) * k, y: VH / 2 + (rx * v.D.x + ry * v.D.y) * k }; };
const toMap = (sx, sy) => { const v = S.view, k = v.w / VW, dx = (sx - VW / 2) * k, dy = (sy - VH / 2) * k; return { x: v.cx + dx * v.R.x + dy * v.D.x, y: v.cy + dx * v.R.y + dy * v.D.y }; };
// move the picture with the finger; leaving a locked target keeps it selected (LOCK re-acquires it)
let lastPan = 0;
function panScreen(dx, dy) {
  const v = S.view, k = v.w / VW, mx = -(dx * v.R.x + dy * v.D.x) * k, my = -(dx * v.R.y + dy * v.D.y) * k;
  if (S.tracking) { S.tracking = false; syncUI(); }
  S.free = true;
  S.aim.x += mx; S.aim.y += my; S.aimGoal.x = S.aim.x; S.aimGoal.y = S.aim.y;
  const now = performance.now(), dtp = Math.max(8, now - lastPan) / 1000; lastPan = now;
  S.vel.x = lerp(S.vel.x, mx / dtp, 0.5); S.vel.y = lerp(S.vel.y, my / dtp, 0.5);
}

/* ===================== selection ===================== */
const matchF = t => S.filter === 'all' || t.kind === S.filter || (S.filter === 'vehicle' && t.kind === 'house');
function lockOn(t, slew) {
  CK.known.add(t);
  S.sel = t; S.tracking = true; S.trackT = 0; S.free = false;
  if (slew) { S.aimGoal.x = t.x; S.aimGoal.y = t.y; }
  Snd.tone(1320, 0.05); syncUI();
}
function unlock() { S.sel = null; S.tracking = false; S.quality = 0; syncUI(); }
function cycle(dir) {
  const list = targets.filter(t => t.alive && !t.escaped && !t.dormant || t.inside && matchF(t));
  if (!list.length) return;
  let i = S.sel ? list.indexOf(S.sel) : -1;
  if (i < 0) i = dir > 0 ? -1 : 0;
  lockOn(list[(i + dir + list.length) % list.length], true);
}
function pickAt(sx, sy) {
  let best = null, bd = 1e9;
  for (const t of targets) {
    if (!t.alive || t.escaped || t.dormant || t.inside) continue;
    const s = toScreen(t.x, t.y);
    const rad = Math.max(22, (t.kind !== 'personnel' ? t.len : 4) * PXM / S.view.w * VW);
    const d = Math.hypot(s.x - sx, s.y - sy);
    if (d < rad && d < bd) { bd = d; best = t; }
  }
  return best;
}
function lockNearest() {
  let best = null, bd = 1e9;
  for (const t of targets) {
    if (!t.alive || t.escaped || t.dormant || t.inside || !matchF(t)) continue;
    const d = Math.hypot(t.x - S.view.cx, t.y - S.view.cy);
    const sc = toScreen(t.x, t.y);
    if (d < bd && sc.x > 0 && sc.x < VW && sc.y > 0 && sc.y < VH) { bd = d; best = t; }
  }
  if (best) lockOn(best, true);
}

/* ===================== input ===================== */
const ptrs = new Map();
let gest = null;
const local = e => ROT ? { x: e.clientY, y: window.innerWidth - e.clientX } : { x: e.clientX, y: e.clientY };
glCanvas.style.touchAction = 'none';
hud.style.pointerEvents = 'none';
glCanvas.addEventListener('pointerdown', e => {
  try { glCanvas.setPointerCapture(e.pointerId); } catch (_) {}
  if (e.isPrimary) { ptrs.clear(); gest = null; S.vel.x = S.vel.y = 0; }
  const q = local(e); ptrs.set(e.pointerId, q);
  if (ptrs.size === 1) gest = { type: 'tap', x0: q.x, y0: q.y, t0: performance.now(), moved: 0 };
  else if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; gest = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), z0: S.zoomGoal }; }
});
glCanvas.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const q = local(e), dx = q.x - p.x, dy = q.y - p.y; p.x = q.x; p.y = q.y;
  if (!gest) return;
  if (gest.type === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    S.zoomGoal = clamp(gest.z0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(30, gest.d0), 1, 12); S.zoom = S.zoomGoal; syncUI();
  } else if (ptrs.size === 1 && gest.type !== 'pinch') {
    gest.moved += Math.hypot(dx, dy);
    if (gest.moved > 8) {
      gest.type = 'drag'; S.dragging = true;
      panScreen(dx, dy);
    }
  }
});
function endPtr(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  if (gest && gest.type === 'tap' && ptrs.size === 0 && performance.now() - gest.t0 < 450 && S.phase === 'play') {
    const q = local(e), t = pickAt(q.x, q.y);
    if (t) lockOn(t, true);
  }
  if (ptrs.size === 0) { if (S.dragging && performance.now() - lastPan > 60) { S.vel.x = S.vel.y = 0; } gest = null; S.dragging = false; } else gest = { type: 'drag', moved: 99 };
}
glCanvas.addEventListener('pointerup', endPtr);
glCanvas.addEventListener('pointercancel', endPtr);
glCanvas.addEventListener('lostpointercapture', endPtr);
glCanvas.addEventListener('wheel', e => { e.preventDefault(); S.zoomGoal = clamp(S.zoomGoal * Math.exp(-e.deltaY * 0.0015), 1, 12); syncUI(); }, { passive: false });
window.addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey || S.phase !== 'play') return;
  const k = e.key.toLowerCase(), st = S.view.w * 0.06;
  const map = {
    arrowleft: () => panScreen(VW * 0.06, 0), arrowright: () => panScreen(-VW * 0.06, 0),
    arrowup: () => panScreen(0, VW * 0.06), arrowdown: () => panScreen(0, -VW * 0.06),
    '+': () => S.zoomGoal = clamp(S.zoomGoal * 1.4, 1, 12), '=': () => S.zoomGoal = clamp(S.zoomGoal * 1.4, 1, 12), '-': () => S.zoomGoal = clamp(S.zoomGoal / 1.4, 1, 12),
    ' ': fire, a: toggleArm, b: () => cycle(-1), l: toggleLock, v: () => setNight(!S.night), i: cycleSensor, c: () => setCockpit(CK.goal === 1), p: toggleFreeze,
    h: () => JET ? setFlight('orbit', { c: jetSel() || S.aim }) : setFlight({ orbit: 'h1', h1: 'h2', h2: 'route', route: 'orbit', hp: 'orbit', base: 'h1', pad: 'h1' }[plane.mode]),
    '1': () => setWeapon(JET ? 'lgb' : 'msl'), '2': () => setWeapon(JET ? 'jdam' : 'rkt'), '3': () => setWeapon(JET ? 'agm' : 'gun'),
    // (the jet: Y / N answer the pilot)
    y: () => { if (JET && JX.ask) jetConsent(true); }, n: () => { if (JET && JX.ask) jetConsent(false); else cycle(1); },
  };
  if (map[k]) { e.preventDefault(); map[k](); syncUI(); }
});

