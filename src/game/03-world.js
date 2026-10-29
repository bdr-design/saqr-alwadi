/* ===================== state ===================== */
const S = {
  dusk: false, wx: 'clear', todPref: 'day',
  phase: 'brief', night: false, sensor: 'eo', frozen: false, soundOn: false, blank: 0, nucT: 50, nucHold: 0,
  zoom: 1, zoomGoal: 1, aim: { x: W0 / 2, y: H0 / 2 }, aimGoal: { x: W0 / 2, y: H0 / 2 },
  view: { x0: 0, y0: 0, x1: W0, y1: H0, w: W0, h: H0, cx: W0 / 2, cy: H0 / 2, R: { x: 1, y: 0 }, D: { x: 0, y: 1 } },
  slew: { x: 0, y: 0 }, dragging: false, rot: null, vel: { x: 0, y: 0 }, free: false,
  sel: null, tracking: false, trackT: 0, quality: 0, armed: false, weapon: 'msl',
  ammo: { msl: 8, rkt: 38, gun: 1200 }, cool: { msl: 0, rkt: 0, gun: 0 },
  burst: 20, qty: 2,
  // the loadout (LOADOUTS), the Hellfires and rockets by kind, the kind selected; the radar's contacts
  load: 'mix', hf: { sal: 4, rf: 4 }, rk: { he: 20, fl: 8, il: 4, gd: 6 }, hfType: 'sal', rkType: 'he', fcr: [], fcrT: 0, fcrAt: -99,
  filter: 'all', t: 0, missionT: 0, shots: 0, flash: 0, expo: 1, expoT: 0,
};
const targets = [], vehicles = [], groups = [], projectiles = [], emitters = [], decals = [], timers = [], houses = [];

/* ===================== vehicles ===================== */
// The mission's scope: every mesh a mission puts in the scenes (its vehicles, houses, buildings, men, marker panels,
// scorches) goes in by msAdd, and clearWorld takes them all out and frees their planes and materials (the pictures
// are shared and stay). One place for all of it, so a new kind of thing cannot be forgotten and pile up on the GPU
// mission after mission (as the vehicles' planes did, and then the panels': tests/soak.cjs counts them)
const MS = [];
function msAdd(scene, ...ms) { for (const m of ms) { scene.add(m); MS.push(m); } return ms[0]; }
function msFree() { for (const m of MS) { if (m.parent) m.parent.remove(m); m.geometry.dispose(); m.material.dispose(); } MS.length = 0; }
function addSprite(texture, w, h, order, color, opacity) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthTest: false, depthWrite: false, color: color == null ? 0xffffff : color, opacity: opacity == null ? 1 : opacity }));
  m.renderOrder = order; return msAdd(sceneA, m);
}
const spriteRot = h => Math.atan2(-Math.cos(h), -Math.sin(h));
function makeVehicle(o) {
  const spec = SPR[o.kind];
  const meshH = spec.len * PXM * spec.h / (spec.h - 20), meshW = spec.wid * PXM * spec.w / (spec.w - 20);
  const tint = o.tint || 0xffffff;
  const v = {
    kind: 'vehicle', vk: o.kind, type: spec.ar, en: spec.en, wid: spec.wid,
    len: spec.len, wb: spec.len * 0.58, alive: true, escaped: false, hp: spec.hp, maxHp: spec.hp,
    x: 0, y: 0, h: 0, v: 0, steer: 0, s: 0, idx: 0, lat: 0, latGoal: o.lat || 0, dir: o.dir || 1, vCruise: o.v || 0, acc: 0, brake: 0,
    convoy: o.convoy || null, mode: o.mode, haltS: o.haltS, haltFor: o.haltFor || 0, haltUntil: -1, bypass: null, stuckT: 0, disabled: false,
    lights: o.lights !== false, r: spec.len * PXM * 0.55, dustT: 0, side: o.side === 'blue' ? 'blue' : 'red', gun: VEH_GUN[o.kind] || null,
    shadow: addSprite(T[o.kind + 'S'], meshW, meshH, 20, 0x000000, 0.5),
    body: addSprite(T[o.kind], meshW, meshH, 30, tint, 1),
    heat: new THREE.Mesh(new THREE.PlaneGeometry(meshW, meshH), heatMat(T[o.kind + 'S'])),
    eng: o.mode === 'parked' ? 0 : 0.85, tyre: o.mode === 'parked' ? 0 : 0.7, burn: 0, trackD: 0,
  };
  msAdd(sceneH, v.heat);
  if (o.mode === 'parked') { v.x = o.x; v.y = o.y; v.h = o.h; const p = projectRoad(v.x, v.y, roadIdx(0)); v.idx = p.idx; }
  else if (o.mode === 'sea') {
    // on the water, from waypoint to waypoint (map px); loop: round again; escape: gone past the last one
    v.path = o.path; v.pi = Math.min(1, o.path.length - 1); v.loop = !!o.loop; v.escape = !!o.escape; v.vMax = spec.vMax || 10;
    v.x = o.path[0][0]; v.y = o.path[0][1]; const q = o.path[v.pi]; v.h = o.path.length > 1 ? Math.atan2(q[1] - v.y, q[0] - v.x) : o.h || 0; v.v = v.vCruise;
    v.lights = false; v.tyre = 0;
    if (o.startAt) { v.waitStart = o.startAt; v.body.visible = v.shadow.visible = false; v.dormant = true; }
  } else {
    // laid out before the road's start (a long convoy): it drives in over the edge when its turn comes
    const before = v.dir > 0 ? 1 - o.s : o.s - (ROAD_LEN - 1);
    v.s = before > 0 ? (v.dir > 0 ? 1 : ROAD_LEN - 1) : o.s; v.idx = roadIdx(v.s); roadAt(v.s); v.x = _rp.x; v.y = _rp.y;
    v.h = roadHeading(v.s) + (v.dir < 0 ? Math.PI : 0); v.v = v.vCruise * 0.9;
    const wait = Math.max(o.startAt || 0, before > 0 ? before / Math.max(v.vCruise, 1) : 0);
    if (wait > 0) { v.waitStart = wait; v.body.visible = v.shadow.visible = false; v.dormant = true; }
  }
  placeVehicle(v);
  vehicles.push(v);
  // a civilian (a fishing boat): not a target, and any harm done to it counts against the mission
  if (o.civil) v.civil = true;
  else if (v.side === 'blue') { friends.push(v); markFriend(v); } else targets.push(v);
  return v;
}
function placeVehicle(v) {
  const rot = spriteRot(v.h);
  v.body.position.set(v.x, -v.y, 0); v.body.rotation.z = rot;
  const sh = 1.25 * sunLen() * (SPR[v.vk].emp ? 0.3 : 1) * PXM;
  v.shadow.position.set(v.x + SUN.x * sh, -(v.y + SUN.y * sh), 0); v.shadow.rotation.z = rot;
  v.shadow.material.opacity = (S.night ? 0.18 : 0.5) * (1 - (v.sinkK || 0));
}
// where across the road a vehicle is, from the road's own left to right: lat is to the right of its own way, so a
// vehicle going the other way has it mirrored
const latOn = v => (v.lat + (v.mLat || 0)) * v.dir;
function leaderOf(v) {
  let best = null, gap = 1e9;
  for (const o of vehicles) {
    if (o === v || o.mode === 'parked' || o.dormant || o.escaped) continue;
    if (Math.abs(latOn(o) - latOn(v)) > 3.2) continue;
    if (v.bypass === o) continue;
    const ds = (o.s - v.s) * v.dir;
    if (ds <= 0) continue;
    const g = ds - (o.len + v.len) / 2;
    if (g < gap) { gap = g; best = o; }
  }
  return best ? { o: best, gap } : null;
}
// the road's end is clear for one more to drive in (nothing within its length and a safe gap of the entry)
function entryClear(v) {
  for (const o of vehicles) if (o !== v && o.alive && !o.dormant && !o.escaped && o.mode !== 'parked' && Math.abs(o.s - v.s) < (o.len + v.len) / 2 + 10 && Math.abs(latOn(o) - latOn(v)) < 3.2) return false;
  return true;
}
// oncoming traffic within this distance: both keep right and slow to pass
const MEET = 70;
function oncoming(v) {
  for (const o of vehicles) {
    if (o === v || o.dir === v.dir || !o.alive || o.dormant || o.escaped || o.mode === 'parked') continue;
    const ds = (o.s - v.s) * v.dir;
    if (ds > -(o.len + v.len) / 2 && ds < MEET) return true;
  }
  return false;
}
// A boat: steers for its next waypoint, turning on a circle about twice its length, at its cruise or, alerted (a blast
// near it), at its dash; its wake spreads white behind it. Hit: it burns and drifts to a stop, and after a minute or so
// settles and goes under.
function sail(v, dt) {
  if (v.dormant) { if (S.missionT >= v.waitStart) { v.dormant = false; v.body.visible = v.shadow.visible = true; } else return; }
  if (v.escaped) return;
  if (!v.alive) {
    v.v = Math.max(0, v.v - 1.5 * dt);
    if (v.sinkT == null) v.sinkT = S.t + rand(50, 80);
    const k = clamp((S.t - v.sinkT) / 25, 0, 1);
    v.body.material.opacity = 1 - k; v.sinkK = k;
    if (k >= 1) { v.body.visible = v.shadow.visible = v.heat.visible = false; v.sunk = true; }
  } else {
    const P = v.path, q = P[v.pi], dx = q[0] - v.x, dy = q[1] - v.y, d = Math.hypot(dx, dy) * MPP;
    if (d < Math.max(12, v.len)) {
      if (v.pi < P.length - 1) v.pi++;
      else if (v.loop) v.pi = 0;
      else if (v.escape) { v.escaped = true; v.body.visible = v.shadow.visible = v.heat.visible = false; if (S.sel === v) unlock(); checkEnd(); return; }
      else {
        v.hold = true;
        // a landing craft on the beach: what it carries comes off (the units of its `land`), now targets of their own
        if (v.land) { const items = v.land; v.land = null; buildUnits(items); let id = Math.max(0, ...targets.map(t => t.id || 0)); for (const t of targets) if (t.id == null) t.id = ++id; linkHomes(); syncUI(); }
      }
    }
    const vDes = v.disabled || v.hold ? 0 : v.alert ? v.vMax : v.vCruise;
    v.v += clamp(vDes - v.v, -1.5 * dt, (v.alert ? 2.5 : 1.0) * dt);
    const rate = v.v / Math.max(2 * v.len, 15);
    v.h = wrapA(v.h + clamp(wrapA(Math.atan2(dy, dx) - v.h), -rate * dt, rate * dt));
  }
  v.x += Math.cos(v.h) * v.v * dt * PXM; v.y += Math.sin(v.h) * v.v * dt * PXM;
  // the wake: a patch of white water off the stern every few metres, spreading a little and fading in some seconds;
  // faint behind a slow boat, a long white furrow behind one at its dash
  v.wakeT = (v.wakeT || 0) - v.v * dt;
  if (v.wakeT <= 0 && v.v > 0.8) {
    v.wakeT = clamp(v.len * 0.2, 1.5, 4);
    const fx = Math.cos(v.h), fy = Math.sin(v.h), k = clamp(v.v / 20, 0, 1);
    wakeL.spawn({ x: v.x - fx * v.len * 0.5 * PXM, y: v.y - fy * v.len * 0.5 * PXM, life: 4 + 6 * k, s0: v.wid * 0.8 * PXM, s1: v.wid * (1.6 + 1.6 * k) * PXM, sx: 1.3,
      rot: spriteRot(v.h), a0: 0.18 + 0.4 * k, a1: 0, c0: [0.93, 0.96, 0.97], c1: [0.82, 0.9, 0.92], cell: Math.floor(Math.random() * 4) });
  }
  placeVehicle(v);
}
function driveVehicle(v, dt) {
  if (v.mode === 'sea') { sail(v, dt); return; }
  if (v.dormant) { if (S.missionT >= v.waitStart && entryClear(v)) { v.dormant = false; v.body.visible = v.shadow.visible = true; } else return; }
  if (!v.alive || v.escaped || v.mode === 'parked') return;
  const sp = v.v;
  // meeting a vehicle the other way on the track: pull over to the right, and back after it has passed
  const meet = !v.bypass && oncoming(v);
  v.mLat = (v.mLat || 0) + clamp((meet ? 2.4 : 0) - (v.mLat || 0), -1.3 * dt, 1.3 * dt);
  // pure pursuit toward a look-ahead point on the road (plus lateral offset)
  v.lat += clamp(v.latGoal - v.lat, -1.3 * dt, 1.3 * dt);
  const Ld = clamp(3 + 0.55 * sp, 4.5, 15);
  const sT = v.s + v.dir * Ld;
  const hT = roadHeading(sT) + (v.dir < 0 ? Math.PI : 0);
  roadAt(sT);
  const lt = v.lat + (v.mLat || 0), tx = _rp.x - Math.sin(hT) * lt * PXM, ty = _rp.y + Math.cos(hT) * lt * PXM;
  const alpha = wrapA(Math.atan2(ty - v.y, tx - v.x) - v.h);
  const want = clamp(Math.atan(2 * v.wb * Math.sin(alpha) / Ld), -0.55, 0.55);
  v.steer += clamp(want - v.steer, -1.0 * dt, 1.0 * dt);
  // desired speed: cruise, curves (lateral grip), halts
  let kmax = 0;
  for (const d of [4, 10, 18, 28]) kmax = Math.max(kmax, roadCurv(v.s + v.dir * d));
  const vCurve = Math.sqrt(1.9 / Math.max(kmax, 1e-4));
  let vDes = Math.min(v.vCruise, vCurve, meet ? 6 : 1e9);
  if (v.disabled || v.hold) vDes = 0;
  // IDM car following (leader, wreck or halt line)
  let gap = 1e9, vL = 0;
  const ld = leaderOf(v);
  if (ld) { gap = ld.gap; vL = ld.o.alive ? ld.o.v * (ld.o.dir === v.dir ? 1 : -1) : 0; }
  const a = 1.3, b = 2.4, s0 = 6, Th = v.alert ? 1.0 : 1.7;
  if (v.haltS != null && v.haltUntil !== -2) {
    const gH = (v.haltS - v.s) * v.dir;
    if (gH > -1 && gH + s0 - 0.5 < gap) { gap = Math.max(0.1, gH + s0 - 0.5); vL = 0; }
    if (gH < 1.5 && sp < 0.3) { if (v.haltUntil === -1) v.haltUntil = S.missionT + v.haltFor; if (S.missionT > v.haltUntil && v.haltFor < 900) v.haltUntil = -2; }
  }
  let acc = a * (1 - Math.pow(sp / Math.max(vDes, 0.3), 4));
  if (gap < 200) { const sStar = s0 + sp * Th + sp * (sp - vL) / (2 * Math.sqrt(a * b)); acc -= a * (sStar / Math.max(gap, 0.1)) ** 2; }
  if (vDes < 0.31 && sp < 0.5) acc = Math.min(acc, -sp / Math.max(dt, 0.016));
  acc = clamp(acc, -7.5, a);
  v.brake = acc < -0.6 ? clamp(-acc / 4, 0.25, 1) : 0;
  v.v = Math.max(0, sp + acc * dt);
  v.acc = acc;
  // stuck behind a wreck: pull out and pass it
  if (ld && (!ld.o.alive || ld.o.disabled) && ld.gap < 22 && v.v < 1) { v.stuckT += dt; if (v.stuckT > 2.5 && !v.bypass) { v.bypass = ld.o; v.latGoal = 5.5; } } else v.stuckT = 0;
  if (v.bypass && (v.s - v.bypass.s) * v.dir > 12) { v.bypass = null; v.latGoal = v.restLat || 0; }
  // kinematic bicycle model
  v.h = wrapA(v.h + v.v / v.wb * Math.tan(v.steer) * dt);
  v.x += Math.cos(v.h) * v.v * dt * PXM; v.y += Math.sin(v.h) * v.v * dt * PXM;
  const pr = projectRoad(v.x, v.y, v.idx); v.idx = pr.idx; v.s = pr.s;
  if ((v.dir > 0 && v.s > ROAD_LEN - 2) || (v.dir < 0 && v.s < 2) || v.x < -10 || v.y < -10 || v.x > W0 + 10 || v.y > H0 + 10) {
    v.escaped = true; v.body.visible = v.shadow.visible = false;
    if (S.sel === v) unlock();
    checkEnd();
  }
  // dust off the dirt track. One budget for all of it: the default mission's five moving vehicles; with more on the
  // road each trails thinner dust, and a share of the layer always stays free for the smoke of hits
  if (v.v > 2 && smokeL.parts.length < smokeL.max * 0.6) {
    v.dustT -= dt * v.v * 1.3 * DUST_K;
    if (v.dustT <= 0) {
      v.dustT = 1;
      const fx = Math.cos(v.h), fy = Math.sin(v.h), back = v.len * 0.5 * PXM;
      smokeL.spawn({ x: v.x - fx * back + rand(-0.6, 0.6) * PXM, y: v.y - fy * back + rand(-0.6, 0.6) * PXM, vx: -fx * v.v * 0.25 * PXM, vy: -fy * v.v * 0.25 * PXM,
        wind: 0.8, drag: 0.5, life: rand(3.5, 5.5), s0: 2.6 * PXM, s1: (9 + v.v * 0.7) * PXM, a0: clamp(0.05 + v.v * 0.017, 0, 0.24), a1: 0, c0: [0.66, 0.6, 0.49], c1: [0.72, 0.67, 0.57], vr: rand(-0.3, 0.3) });
    }
  }
  placeVehicle(v);
}
function vehicleLights(v) {
  if (!S.night || S.sensor !== 'eo' || !v.lights || v.escaped || v.dormant) return;
  if (!v.alive || v.mode === 'parked' || v.mode === 'sea') return;
  const fx = Math.cos(v.h), fy = Math.sin(v.h), rx = -fy, ry = fx;
  const half = v.len * 0.5 * PXM, lw = Math.min(1.05, v.wid * 0.33) * PXM, rot = spriteRot(v.h);
  const beamL = 30 * PXM, beamW = 17 * PXM;
  for (const s of [-1, 1]) {
    const lx = v.x + fx * half + rx * lw * s, ly = v.y + fy * half + ry * lw * s;
    coneL.put(lx + fx * beamL * 0.5 + rx * s * 0.9 * PXM, ly + fy * beamL * 0.5 + ry * s * 0.9 * PXM, beamW, beamL, rot, 1, 0.94, 0.84, 0.62, 0);
    glowE.put(lx, ly, 1.4 * PXM, 1.4 * PXM, 0, 1, 0.97, 0.9, 1, 0);
    glowE.put(lx, ly, 5 * PXM, 5 * PXM, 0, 1, 0.9, 0.75, 0.22, 0);
    const tx = v.x - fx * half + rx * lw * s, ty = v.y - fy * half + ry * lw * s, br = 0.45 + v.brake * 0.55;
    glowE.put(tx, ty, (0.9 + v.brake * 0.5) * PXM, (0.9 + v.brake * 0.5) * PXM, 0, 1, 0.12, 0.06, br, 0);
    lightL.put(tx - fx * 1.5 * PXM, ty - fy * 1.5 * PXM, 5 * PXM, 5 * PXM, 0, 0.9, 0.08, 0.04, 0.25 * br, 0);
  }
  lightL.put(v.x + fx * (half + 12 * PXM), v.y + fy * (half + 12 * PXM), 34 * PXM, 34 * PXM, 0, 1, 0.9, 0.76, 0.2, 0);
  lightL.put(v.x, v.y, 12 * PXM, 12 * PXM, 0, 1, 0.9, 0.78, 0.12, 0);
}

// thermal signature: engine warms while driving and cools slowly once stopped; a wreck stays hot for minutes
// windscreen, as a fraction of length ahead of centre (glass is opaque to thermal and mirrors the cold sky)
const GLASS = { suv: 0.2, hilux: 0.16, lc79: 0.16, mrap: 0.24, cargo: 0.4, tanker: 0.4, launcher: 0.41 };
function vehicleHeat(v, dt) {
  v.heat.visible = v.body.visible;
  if (v.escaped || v.dormant) return;
  const fx = Math.cos(v.h), fy = Math.sin(v.h), rx = -fy, ry = fx, L = v.len * PXM, Wd = v.wid * PXM;
  if (v.alive) {
    const run = v.mode !== 'parked' && !v.disabled;
    v.eng += ((run ? (v.v > 0.5 ? 1 : 0.75) : 0) - v.eng) * dt / (run ? 40 : 300);
    v.tyre += (clamp(v.v / 10, 0, 1) - v.tyre) * dt / 25;
    // warm tyre tracks pressed into the cold ground fade over half a minute
    v.trackD += v.mode === 'sea' ? 0 : v.v * dt;
    if (v.trackD > 3.5) {
      v.trackD = 0;
      for (const b of [-0.4, 0.4]) heatL.spawn({ x: v.x - fx * L * 0.3 + rx * Wd * b, y: v.y - fy * L * 0.3 + ry * Wd * b, life: 28, s0: 1.1 * PXM, s1: 1.4 * PXM, sx: 3.2, rot: spriteRot(v.h),
        a0: 0.16 * v.tyre * (S.night ? 1 : 0.5), a1: 0, c0: [1, 0, 0], ease: 'lin' });
    }
  } else v.burn = Math.max(0, v.burn - dt / 170);
  if (S.sensor === 'eo') return;
  const rot = spriteRot(v.h);
  v.heat.position.set(v.x, -v.y, 0); v.heat.rotation.z = rot;
  // body: sun-soaked metal by day; by night it radiates to the sky and drops below the ground unless the engine keeps it warm
  const hc = v.heat.material.uniforms.col.value;
  if (!v.alive) hc.set(0.1 + 0.5 * v.burn, 0, 0);
  else if (S.night) hc.set(0.1 * v.eng, 0.14 * (1 - v.eng), 0);
  else hc.set(0.16 + 0.1 * v.eng, 0, 0);
  if (!v.alive) return;
  heatL.put(v.x + fx * L * 0.3, v.y + fy * L * 0.3, Wd * 0.7, L * 0.3, rot, 1, 0, 0, 0.75 * v.eng, 0);
  heatL.put(v.x - fx * L * 0.3 + rx * Wd * 0.3, v.y - fy * L * 0.3 + ry * Wd * 0.3, 0.9 * PXM, 1.6 * PXM, rot, 1, 0, 0, 0.6 * v.eng, 0);
  if (v.tyre > 0.05) for (const a of [-0.32, 0.3]) for (const b of [-0.42, 0.42])
    heatL.put(v.x + fx * L * a + rx * Wd * b, v.y + fy * L * a + ry * Wd * b, 0.8 * PXM, 1.1 * PXM, rot, 1, 0, 0, 0.45 * v.tyre, 0);
  if (SPR[v.vk].emp) return;
  const gf = GLASS[v.vk] || 0.2;
  heatL.put(v.x + fx * L * gf, v.y + fy * L * gf, Wd * 0.75, 1.0 * PXM, rot, 0, 1, 0, S.night ? 0.5 : 0.7, 0);
}
function sceneHeat() {
  if (S.sensor === 'eo') return;
  // people: skin and clothing at body heat; by day the sun-baked ground closes much of the gap. The dead cool, slowly
  // (a body is still plain on the thermal an hour on): to about half in the first few minutes
  const hot = S.night ? 0.62 : 0.3;
  const px = S.view.w / (VW * PR), speck = 3 * px > 1.2 * PXM;
  for (const g of groups) for (const m of g.men) {
    m.heat.material.uniforms.col.value.set(m.alive ? hot : hot * (0.45 + 0.55 * Math.exp(-(S.t - m.deadT) / 240)), 0, 0);
    if (!m.alive || !m.body.visible) continue;
    heatL.put(m.x, m.y, 0.32 * PXM, 0.32 * PXM, 0, 1, 0, 0, S.night ? 0.45 : 0.25, 0);
    // below a couple of pixels a person is still a hot speck
    if (speck) heatL.put(m.x, m.y, 3 * px, 3 * px, 0, 1, 0, 0, S.night ? 0.5 : 0.3, 0);
  }
  for (const h of houses) if (!h.standing) ruinHeat(h);
  // scorched ground from impacts cools over a minute or two
  for (const d of decals) {
    const k = 0.8 * Math.exp(-(S.t - d.userData.t0) / 50);
    if (k > 0.02) heatL.put(d.position.x, -d.position.y, d.scale.x * 0.75, d.scale.y * 0.75, d.rotation.z, 1, 0, 0, k, 0);
  }
}

/* ===================== houses ===================== */
// scenery, not targets. r: the house's turn on the map (rad). It stands on a cleared plot cut from the map's own
// wadi floor; the darkest shadow is where the walls meet the ground, then the roof cast away from the sun by the
// house's height (two copies: a big mission has many houses, each drawn twice a frame, sensor and windscreen).
const SH_STEPS = [0, 0.7], SH_ALPHA = [0.36, 0.3];
// role: 'civil' (no-strike: damaging it costs the mission points) or 'hostile' (a target: destroyed, it is a kill).
function makeHouse(o) {
  const spec = HOUSE[o.kind], mw = spec.wid * PXM * spec.w / (spec.w - 20), mh = spec.len * PXM * spec.h / (spec.h - 20);
  const pd = Math.max(spec.wid, spec.len) * PXM * 1.9;
  const role = o.role === 'hostile' ? 'hostile' : 'civil';
  const hs = { hk: o.kind, x: o.x, y: o.y, r: o.r || 0, spec, role, standing: true, hit: false, hp: 300, maxHp: 300, len: Math.max(spec.wid, spec.len),
    kind: role === 'hostile' ? 'house' : 'civil', type: 'مبنى معادٍ', en: 'BLDG', alive: true, escaped: false,
    pad: addSprite(T.housePad, pd, pd, 14, 0xffffff, 0.9),
    body: addSprite(T[o.kind], mw, mh, 16, 0xffffff, 1),
    shadows: SH_STEPS.map(() => addSprite(T[o.kind + 'S'], mw, mh, 15, 0x000000, 0.2)),
    heat: new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), heatMat(T[o.kind + 'S'])) };
  msAdd(sceneH, hs.heat);
  placeHouse(hs); houses.push(hs); if (role === 'hostile') targets.push(hs); return hs;
}
// (the rubble warm for a few minutes, the embers for longer; it was the whole footprint at up to 0.22, a block on the thermal)
function ruinHeat(h) { const t = S.t - (h.ruinT ?? S.t); h.heat.material.uniforms.col.value.set(0.035 + 0.05 * Math.exp(-t / 150), 0.06 + 0.24 * Math.exp(-t / 300), 0); }
function placeHouse(hs) {
  hs.body.position.set(hs.x, -hs.y, 0); hs.body.rotation.z = -hs.r;
  if (hs.pad) { hs.pad.position.set(hs.x, -hs.y, 0); hs.pad.rotation.z = -hs.r + 0.3; }
  // the sun's shadow reaches as far as the vehicles' does for their height; at night only the contact shade is left
  // a ruin stands lower: its shadow is short
  const L = hs.spec.ht * (hs.standing ? 1 : 0.3) * 0.6 * (S.night ? 0.42 : sunLen()) * PXM;
  hs.shadows.forEach((m, i) => { const f = SH_STEPS[i]; m.position.set(hs.x + SUN.x * L * f, -(hs.y + SUN.y * L * f), 0); m.rotation.z = -hs.r; m.material.opacity = SH_ALPHA[i] * (S.night ? 0.4 : 1); });
  hs.heat.position.set(hs.x, -hs.y, 0); hs.heat.rotation.z = -hs.r;
  // walls and roofs: sun-warmed by day, still giving back the day's heat at night (warmer than the open ground)
  // a ruin: the rubble a little warm, cooling over a few minutes; its fires are the hot spots (they were the whole
  // footprint at half the white, a flat white block on the thermal, and it never cooled)
  if (hs.standing) hs.heat.material.uniforms.col.value.set(S.night ? 0.1 : 0.07, 0, 0); else ruinHeat(hs);
}

// a house brought down: the ruin picture, fire and smoke from the rubble, the dust of the collapse; anyone sheltering
// inside dies with it
function ruinHouse(h) {
  if (!h.standing) return;
  h.standing = false; h.alive = false; h.hp = 0; h.burn = 1; h.ruinT = S.t;
  if (h.bld != null) ruinBld(h);
  else {
    h.body.material.map = T[h.hk + 'R']; h.body.material.needsUpdate = true;
    const gp = h.heat.geometry.parameters; h.heat.material.dispose(); h.heat.material = ruinHeatMat(T[h.hk + 'S'], gp.width, gp.height);
    emitters.push({ type: 'wreck', v: h, t: 0, dur: rand(80, 120), fireFor: rand(25, 50), acc: 0, seed: rand(0, 99) });
    timers.push({ t: 0.25, fn: () => explode(h.x, h.y, 1.4, { noScorch: true }) });
  }
  placeHouse(h);
  for (const g of groups) if (g.home === h && g.alive && g.inside) { g.inside = false; kill(g); }
  if (h.role === 'civil') { S.civ++; CK.msg = { s: 'CIV DAMAGE', t: 2.5 }; }
}

/* ===================== buildings in the map's picture ===================== */
// The camp's barracks, tents and fuel tanks, the depot's warehouses, the quay's sheds, the ships: they are in the
// picture itself, so nothing is drawn while they stand. Brought down, the ruin made for each from the picture
// (tools/make_map.py) covers it: the roof fallen in and burnt through, rubble and soot around, the old shadow gone.
// They are houses to the rest of the game (damage, shelter, targets); role as houses, or 'struct': a building that
// is neither this mission's target nor no-strike (a camp's barracks), destroyed without points or penalty.
// MAP.blds[i]: [x, y, w, h, r, kind, atlas x, y, w, h, overlay w, h]; w lies along direction r (map px).
const BLD = { hall: { ht: 6, ar: 'مبنى', en: 'BLDG' }, tent: { ht: 4, hp: 60, ar: 'خيمة', en: 'TENT' }, tank: { ht: 10, hp: 120, ar: 'خزان وقود', en: 'FUEL' }, ship: { ht: 12, hp: 250, ar: 'سفينة', en: 'SHIP' } };
function makeBld(i, role) {
  const [x, y, w, h, r, bk, ax, ay, aw, ah, ow, oh] = MAP.blds[i], spec = BLD[bk];
  const g = new THREE.PlaneGeometry(ow, oh), uv = g.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setXY(k, (ax + uv.getX(k) * aw) / MAP.ruinsW, 1 - (ay + (1 - uv.getY(k)) * ah) / MAP.ruinsH);
  const body = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: T.ruins, transparent: true, depthTest: false, depthWrite: false }));
  body.renderOrder = 15; body.visible = false; msAdd(sceneA, body);
  const heat = new THREE.Mesh(g, ruinHeatMat(T.ruins, ow, oh)); heat.visible = false; msAdd(sceneH, heat);
  // a big building takes more than one Hellfire
  const hp = spec.hp || clamp(w * h * MPP * MPP * 0.6, 150, 600);
  role = role === 'hostile' || role === 'civil' ? role : 'struct';
  const hs = { bld: i, bk, hk: 'bld', x, y, r, w, h, spec, role, standing: true, hit: false, hp, maxHp: hp, len: Math.max(w, h) * MPP,
    kind: role === 'hostile' ? 'house' : role, type: role === 'hostile' && bk === 'hall' ? 'مبنى معادٍ' : spec.ar, en: spec.en, alive: true, escaped: false,
    pad: null, shadows: [], body, heat };
  placeHouse(hs); houses.push(hs); if (role === 'hostile') targets.push(hs); return hs;
}
function ruinBld(h) {
  h.body.visible = h.heat.visible = true;
  // fires along a long building or ship; a fuel tank goes up in a fireball and burns long; a tent is gone quickly
  const L = Math.max(h.w, h.h), n = h.bk === 'hall' || h.bk === 'ship' ? clamp(Math.round(L * MPP / 20), 1, 4) : 1;
  const ax = h.w >= h.h ? { x: Math.cos(h.r), y: Math.sin(h.r) } : { x: -Math.sin(h.r), y: Math.cos(h.r) };
  for (let k = 0; k < n; k++) {
    const f = n === 1 ? 0 : (k / (n - 1) - 0.5) * 0.7 * L;
    emitters.push({ type: 'wreck', v: { x: h.x + ax.x * f, y: h.y + ax.y * f }, t: 0, dur: rand(80, 120) * (h.bk === 'tank' ? 1.6 : 1),
      fireFor: h.bk === 'tank' ? rand(70, 100) : h.bk === 'tent' ? rand(8, 16) : rand(25, 50), acc: 0, seed: rand(0, 99) });
  }
  if (h.bk === 'tank') timers.push({ t: 0.35, fn: () => { explode(h.x, h.y, 2.8); damageAt(h.x, h.y, 'bmb'); } });
  else timers.push({ t: 0.25, fn: () => explode(h.x, h.y, h.bk === 'tent' ? 0.8 : 1.4, { noScorch: true }) });
}
// metres from (x, y) to a house's walls (0 inside): a picture building by its footprint, a house by its size
function houseDist(h, x, y) {
  if (h.bld == null) return Math.max(0, Math.hypot(h.x - x, h.y - y) * MPP - h.len * 0.4);
  const dx = x - h.x, dy = y - h.y, c = Math.cos(h.r), s = Math.sin(h.r);
  return Math.hypot(Math.max(0, Math.abs(dx * c + dy * s) - h.w / 2), Math.max(0, Math.abs(-dx * s + dy * c) - h.h / 2)) * MPP;
}

/* ===================== personnel ===================== */
// The owner's poses, seen straight down (tools/make_infantry.py: one picture a side, every man facing its top): the
// enemy in shemagh and chest rig, ours in the Saudi Army's desert pattern and helmet. Standing, two walking frames
// (taken in step with the ground he covers), kneeling and prone aiming, dead (ours: wounded on his back); the enemy
// also an RPG and a missile tube on the shoulder. Each man is his own: his pose, his health (the group is a target
// until its last man is down), his body left where he fell, cooling slowly on the thermal. His shadow falls as the
// houses' do (0.6 of his height along SUN): a standing man's a long figure from his feet, the kneeling one's shorter,
// and a man on the ground only his own outline just off him. (It was one picture of a fighter sliding about, a soft
// blot of shade, the whole group one pool of health, and the men vanished when it ran out.)
const MEN = __MEN__;
const MAN_HP = 10, MAN_H = { stand: 1.75, walk1: 1.75, walk2: 1.75, rpg: 1.75, kneel: 1.15, aa: 1.15, prone: 0.3, dead: 0.25 };
// (a man's shadow a little longer than the houses' 0.6: from straight above he covers his own feet and the first half
// metre of it, and at 0.6 only a stub showed past him)
const SUN_K = 0.8, SHADOW_ROT = Math.atan2(-SUN.x, -SUN.y);
const manMat = {}, manFlat = {};
const manCast = new THREE.MeshBasicMaterial({ map: T.manCast, transparent: true, depthTest: false, depthWrite: false, color: 0x000000, opacity: 0.5 });
const manCastGeo = new THREE.PlaneGeometry(1, 1);
for (const side of ['red', 'blue']) {
  manMat[side] = new THREE.MeshBasicMaterial({ map: T['men_' + side], transparent: true, depthTest: false, depthWrite: false });
  manFlat[side] = new THREE.MeshBasicMaterial({ map: T['men_' + side], transparent: true, depthTest: false, depthWrite: false, color: 0x000000, opacity: 0.45 });
}
function makeGroup(x, y, n, o) {
  o = o || {};
  // side 'blue': a friendly squad; aa: shoulder-launched missiles the group carries
  const side = o.side === 'blue' ? 'blue' : 'red';
  const g = { kind: 'personnel', type: o.aa ? 'فريق صواريخ كتف' : 'أفراد', en: o.aa ? 'MANPADS' : 'PAX', alive: true, escaped: false, hp: n * MAN_HP, maxHp: n * MAN_HP, x, y, hx: x, hy: y, r: 3 * PXM, men: [], alert: 0, v: 0, h: 0,
    side, aa: side === 'red' ? o.aa | 0 : 0, fightT: 0, fh: 0 };
  for (let i = 0; i < n; i++) {
    const geo = new THREE.PlaneGeometry(1, 1);
    const m = { ox: rand(-2.5, 2.5) * PXM, oy: rand(-2.5, 2.5) * PXM, x, y, h: rand(0, 6.28), tx: x, ty: y, wait: rand(0, 4), alive: true, hp: MAN_HP, pose: null, step: rand(0, 2), aimT: 0, down: false,
      // the enemy's: the man with the missile tube in a missile team, an RPG in a group of three or more
      kit: side === 'red' ? (o.aa && i === 0 ? 'aa' : !o.aa && n >= 3 && i === 1 ? 'rpg' : null) : null,
      geo, body: new THREE.Mesh(geo, manMat[side]), heat: new THREE.Mesh(geo, heatMat(T['men_' + side])), sh: new THREE.Mesh(manCastGeo, manCast) };
    m.body.renderOrder = 31; m.sh.renderOrder = 21; msAdd(sceneA, m.body, m.sh);
    m.x = x + m.ox; m.y = y + m.oy; m.tx = m.x; m.ty = m.y;
    msAdd(sceneH, m.heat);
    setPose(g, m, 'stand');
    g.men.push(m);
  }
  groups.push(g);
  if (side === 'blue') { friends.push(g); markFriend(g); } else targets.push(g);
  placeGroup(g);
  return g;
}
// a pose: its place in the side's picture (the plane's corners, three.js's order: top left, top right, bottom left,
// bottom right; v up), its size on the ground, and the shadow that goes with it
function setPose(g, m, p) {
  if (m.pose === p) return;
  m.pose = p;
  const A = MEN[g.side], q = A.poses[p], uv = m.geo.attributes.uv;
  const u0 = q[0] / A.w, u1 = q[2] / A.w, v0 = 1 - q[3] / A.h, v1 = 1 - q[1] / A.h;
  uv.setXY(0, u0, v1); uv.setXY(1, u1, v1); uv.setXY(2, u0, v0); uv.setXY(3, u1, v0); uv.needsUpdate = true;
  m.body.scale.set(q[4] * PXM, q[5] * PXM, 1); m.heat.scale.copy(m.body.scale);
  if (MAN_H[p] > 0.5) { m.sh.geometry = manCastGeo; m.sh.material = manCast; } else { m.sh.geometry = m.geo; m.sh.material = manFlat[g.side]; }
}
function placeMan(g, m) {
  const q = MEN[g.side].poses[m.pose], r = m.body.rotation.z = spriteRot(m.h), c = Math.cos(r), sn = Math.sin(r);
  // the picture's centre, from where he stands in it
  const ax = q[6] * PXM, ay = q[7] * PXM, bx = m.x - (ax * c - ay * sn), by = -m.y - (ax * sn + ay * c);
  m.body.position.set(bx, by, 0); m.heat.position.set(bx, by, 0); m.heat.rotation.z = r;
  const k = S.night ? 0.5 : sunLen();
  if (m.sh.geometry === manCastGeo) {
    // from his feet away from the sun
    const L = MAN_H[m.pose] * SUN_K * k * PXM;
    m.sh.scale.set(0.55 * PXM, L, 1); m.sh.rotation.z = SHADOW_ROT;
    m.sh.position.set(m.x + SUN.x * L / 2, -(m.y + SUN.y * L / 2), 0);
  } else {
    m.sh.scale.copy(m.body.scale); m.sh.rotation.z = r;
    m.sh.position.set(bx + SUN.x * 0.12 * k * PXM, by - SUN.y * 0.12 * k * PXM, 0);
  }
}
function placeGroup(g) {
  manCast.opacity = S.night ? 0.15 : 0.5; manFlat.red.opacity = manFlat.blue.opacity = S.night ? 0.12 : 0.45;
  for (const m of g.men) placeMan(g, m);
}
// a man down: his body where he fell (thrown a little from a blast), turned as he fell; it stays
function manDown(g, m, bx, by) {
  if (!m.alive) return;
  m.alive = false; m.hp = 0; m.deadT = S.t; m.aimT = 0;
  if (bx != null) { const dx = m.x - bx, dy = m.y - by, d = Math.hypot(dx, dy) || 1, k = rand(0.4, 1.5) * PXM; m.x += dx / d * k; m.y += dy / d * k; }
  m.h = rand(0, 6.28);
  setPose(g, m, 'dead'); placeMan(g, m);
  g.hp = g.men.reduce((a, x) => a + (x.alive ? x.hp : 0), 0);
}
// damage to the men of a group from a blast at (x, y): each by his own distance from it. Returns whether any was hit
function hurtMen(g, x, y, dmg0, R) {
  let hit = false;
  for (const m of g.men) {
    if (!m.alive || !m.body.visible) continue;
    const d = Math.hypot(m.x - x, m.y - y) * MPP;
    if (d < R) { hit = true; m.hp -= dmg0 * (1 - d / R) * (m.down ? 0.6 : 1); if (m.hp <= 0) manDown(g, m, x, y); }
  }
  g.hp = g.men.reduce((a, m) => a + (m.alive ? m.hp : 0), 0);
  return hit;
}
// a round from the ground war: one man of the group
function hurtMan(g, dmg) {
  const live = g.men.filter(m => m.alive && m.body.visible);
  if (!live.length) return;
  const m = live[Math.floor(Math.random() * live.length)];
  m.hp -= dmg * (m.down ? 0.5 : 1); if (m.hp <= 0) manDown(g, m);
  g.hp = g.men.reduce((a, x) => a + (x.alive ? x.hp : 0), 0);
}
// who fires a burst: a man of the group not running, turned to the target, kneeling (or down on the ground)
function shooter(g, tx, ty, kit) {
  const live = g.men.filter(m => m.alive && m.body.visible && (kit ? m.kit === kit : m.kit !== 'rpg' && m.kit !== 'aa'));
  if (!live.length) return null;
  const m = live[Math.floor(Math.random() * live.length)];
  m.h = Math.atan2(ty - m.y, tx - m.x); m.tx = m.x; m.ty = m.y;
  return m;
}
function updateGroup(g, dt) {
  if (!g.alive) return;
  const live = g.men.filter(m => m.alive);
  if (g.inside) {
    // in cover; after a while they come out and stand around the door again
    g.insideT -= dt;
    if (g.insideT <= 0 || !g.home.alive) {
      g.inside = false; g.shelter = false; g.alert = 0;
      for (const m of live) { m.body.visible = m.sh.visible = m.heat.visible = true; m.x = g.home.x + rand(-2, 2) * PXM; m.y = g.home.y + rand(-2, 2) * PXM; m.tx = m.x; m.ty = m.y; m.wait = rand(2, 6); m.down = false; }
      g.hx = g.home.x + rand(-6, 6) * PXM; g.hy = g.home.y + rand(-6, 6) * PXM;
    }
    return;
  }
  if (g.shelter && g.home && g.home.alive) {
    let all = true;
    for (const m of live) if (Math.hypot(m.x - g.home.x, m.y - g.home.y) * MPP < 2.5) { m.body.visible = m.sh.visible = m.heat.visible = false; } else all = false;
    if (all) { g.inside = true; g.insideT = rand(40, 70); g.x = g.home.x; g.y = g.home.y; if (S.sel === g) unlock(); return; }
  }
  let cx = 0, cy = 0;
  g.alert = Math.max(0, g.alert - dt); g.fightT = Math.max(0, g.fightT - dt);
  if (g.alert <= 0) g.flee = null;
  for (const m of live) {
    m.wait -= dt; m.aimT = Math.max(0, m.aimT - dt);
    // under fire in the open: run, then down on the ground until it passes; in a fight they hold where they are
    if (g.alert <= 0) m.down = false;
    const busy = m.aimT > 0 || m.down || g.fightT > 0;
    if (!busy && m.wait <= 0 && Math.hypot(m.tx - m.x, m.ty - m.y) < 0.3 * PXM) {
      if (g.shelter && g.home && g.home.alive) { m.tx = g.home.x; m.ty = g.home.y; }
      else if (g.alert > 0 && g.flee) { m.tx = g.flee.x + m.ox * 1.8; m.ty = g.flee.y + m.oy * 1.8; }
      else { const a = rand(0, 6.28), r = rand(1, 9) * PXM; m.tx = g.hx + Math.cos(a) * r; m.ty = g.hy + Math.sin(a) * r; m.wait = rand(3, 12); }
    }
    const dx = m.tx - m.x, dy = m.ty - m.y, d = Math.hypot(dx, dy);
    let moving = false;
    if (d > 0.1 * PXM && m.body.visible && !(m.aimT > 0) && !(g.fightT > 0 && !g.alert)) {
      const v = g.alert > 0 || g.shelter ? 3.6 : 1.25, st = Math.min(v * PXM * dt, d);
      m.x += dx / d * st; m.y += dy / d * st; m.h = Math.atan2(dy, dx); moving = true;
      // a step every 0.7 m walking, 1.1 m running: left foot, together, right foot, together
      m.step += st / PXM / (v > 2 ? 1.1 : 0.7) * 2;
    } else if (g.alert > 0 && !g.shelter && d <= 0.1 * PXM) m.down = true;
    if (g.fightT > 0 && !moving && !(m.aimT > 0)) m.h = lerpA(m.h, g.fh, 1 - Math.exp(-dt * 3));
    const aim = m.aimT > 0 || (g.fightT > 0 && !moving);
    setPose(g, m, aim ? (m.kit === 'rpg' ? 'rpg' : m.kit === 'aa' ? 'aa' : m.down ? 'prone' : 'kneel') : moving ? ['walk1', 'stand', 'walk2', 'stand'][Math.floor(m.step) & 3] : m.down ? 'prone' : 'stand');
    cx += m.x; cy += m.y;
  }
  const px = g.x, py = g.y;
  if (live.length) { g.x = cx / live.length; g.y = cy / live.length; }
  g.v = Math.hypot(g.x - px, g.y - py) * MPP / Math.max(dt, 1e-3);
  placeGroup(g);
}
function alertGroup(g, ex, ey) {
  if (g.inside || g.side === 'blue') return;
  // fighters with a house run into it and take cover
  if (g.home && g.home.alive) {
    g.alert = rand(5, 9); g.shelter = true; g.flee = { x: g.home.x, y: g.home.y };
    for (const m of g.men) { m.wait = 0; m.down = false; m.tx = g.home.x + rand(-1, 1) * PXM; m.ty = g.home.y + rand(-1, 1) * PXM; }
    return;
  }
  // in the open: they scatter away from it and go to ground
  // (once: a second blast while they run keeps them going where they were going. Under rifle fire alone, with no
  // blast, they only go to ground where they are)
  const was = g.alert > 0 && g.flee;
  g.alert = rand(6, 11);
  if (was) return;
  const dx = g.x - ex, dy = g.y - ey, d = Math.hypot(dx, dy) || 1;
  g.flee = { x: clamp(g.x + dx / d * rand(15, 30) * PXM, 10, W0 - 10), y: clamp(g.y + dy / d * rand(15, 30) * PXM, 10, H0 - 10) };
  g.hx = g.flee.x; g.hy = g.flee.y;
  for (const m of g.men) { m.wait = 0; m.down = false; m.aimT = 0; m.tx = g.flee.x + m.ox * 1.8; m.ty = g.flee.y + m.oy * 1.8; }
}

/* ===================== mission setup ===================== */
function clearWorld() {
  msFree();
  friends.length = missiles.length = flares.length = bursts.length = tracers.length = 0;
  S.civ = 0; S.civHit = 0; S.hits = 0;
  houses.length = 0;
  vehicles.length = groups.length = targets.length = projectiles.length = emitters.length = decals.length = timers.length = 0;
  LAYERS.forEach(l => l.clear());
}
function linkHomes() {
  // fighters near a hostile house belong to it (they shelter there when the shooting starts)
  for (const g of groups) { let best = null, bd = 35; for (const h of houses) { if (h.role !== 'hostile') continue; const d = Math.hypot(h.x - g.x, h.y - g.y) * MPP; if (d < bd) { bd = d; best = h; } } g.home = best; }
}
function setupMission(layout) {
  clearWorld();
  if (layout) { buildLayout(layout); linkHomes(); return; }
  // convoy southbound from the top of the valley; halts at the bend, then pushes on
  const kinds = ['hilux', 'mrap', 'cargo', 'lc79'];
  let sPos = 150;
  kinds.forEach((k, i) => { if (i) sPos -= (SPR[kinds[i - 1]].len + SPR[k].len) / 2 + 26; makeVehicle({ kind: k, mode: 'convoy', convoy: 'A', s: sPos, dir: 1, v: 9.5, haltS: 548 - (150 - sPos) }); });
  // a civilian SUV coming up from the south, pulls over and waits by the road
  const solo = makeVehicle({ kind: 'suv', mode: 'solo', s: ROAD_LEN - 8, dir: -1, v: 8, haltS: 700, haltFor: 9999, startAt: 22 });
  solo.restLat = 5; solo.latGoal = 0;
  timers.push({ t: 35, fn: () => { solo.latGoal = 5; } });
  // stationary: fuel tanker, missile launcher (fixed site), armoured vehicle in the dry riverbed
  makeVehicle({ kind: 'tanker', mode: 'parked', x: 846, y: 224, h: -0.45, lights: false });
  makeVehicle({ kind: 'launcher', mode: 'parked', x: 918, y: 770, h: 2.55, lights: false });
  makeVehicle({ kind: 'mrap', mode: 'parked', x: 988, y: 520, h: 1.75, lights: false });
  // a hamlet off the road: the owner's four houses
  // on the flat light ground of the valley floor, off the road: two together on the east bank, one up the west fan, one south
  [['house1', 792, 198, 0.15], ['house2', 1002, 334, -0.3], ['house4', 968, 262, 0.45], ['house3', 838, 708, 1.35]].forEach(([kind, x, y, r]) => makeHouse({ kind, x, y, r }));
  // personnel
  [[826, 238, 3], [851, 214, 2], [978, 532, 3], [905, 756, 4], [880, 640, 2], [866, 122, 3], [931, 690, 2]].forEach(([x, y, n]) => makeGroup(x, y, n));
  // shuffle target numbers
  const ids = targets.map((_, i) => i + 1).sort(() => Math.random() - 0.5);
  targets.forEach((t, i) => { t.id = ids[i]; });
  targets.sort((a, b) => a.id - b.id);
}

/* ===================== effects ===================== */
const scorchGeo = new THREE.PlaneGeometry(1, 1);
function addScorch(x, y, r) {
  const m = new THREE.Mesh(scorchGeo, new THREE.MeshBasicMaterial({ map: T.scorch, transparent: true, depthTest: false, depthWrite: false, opacity: 0.9 }));
  m.scale.set(r * 2, r * 2 * rand(0.85, 1.1), 1); m.position.set(x, -y, 0); m.rotation.z = rand(0, 6.28); m.renderOrder = 10; m.userData.t0 = S.t;
  msAdd(sceneA, m); decals.push(m);
  if (decals.length > 30) { const o = decals.shift(); sceneA.remove(o); o.material.dispose(); }
}
// An explosion as the pod sees it from above, in the order a real one goes (strike footage): the flash, and the
// fireball, its size the explosive's (some 8 m across for a Hellfire's, 17 m a 500 lb bomb's), white then orange and
// gone dark inside half a second; the shock lifting a ring of fine dust that races out and stops in a third of a
// second; the soil thrown out of the crater in jets, dark streaks radiating from it; the debris falling back; then the
// cloud of soot and soil, dark at first, billowing and drifting downwind as it pales. On the thermal: the gas
// white-hot for a second, the young cloud warm for a few, and the burning fragments scattered round it, hot specks
// cooling over half a minute; the crater itself cools over a minute or two (sceneHeat). k: the blast's size (a
// Hellfire's 1). All of it particles in the layers already drawn: no draw call added.
const rotAlong = (vx, vy) => Math.atan2(-vx, -vy);   // (a particle's long axis along its motion)
function explode(x, y, k, opt) {
  opt = opt || {};
  const m = PXM, q = Math.sqrt(k);
  if (!opt.small) {
    glowE.spawn({ x, y, life: 0.1 + 0.05 * k, s0: 14 * k * m, s1: 26 * k * m, a0: 1, a1: 0, c0: [1, 0.97, 0.9], cell: 0, rot: 0, ease: 'lin' });
    S.flash = Math.max(S.flash, clamp(0.22 * k, 0.12, 0.55));
    S.expo = Math.min(S.expo, 1 - 0.18 * Math.min(k, 2)); S.expoT = 0;
  }
  // the fireball
  const nF = Math.round(4 + 4 * k);
  for (let i = 0; i < nF; i++) {
    const a = rand(0, 6.28), sp = rand(6, 16) * k * m;
    fireL.spawn({ x: x + rand(-1, 1) * 1.5 * k * m, y: y + rand(-1, 1) * 1.5 * k * m, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 6,
      life: rand(0.18, 0.4) * (0.6 + 0.4 * k), s0: 3 * k * m, s1: rand(9, 13) * k * m, a0: 1, a1: 0, c0: [1, 0.95, 0.82], c1: [0.45, 0.1, 0.02], vr: rand(-1.5, 1.5) });
  }
  // fragments flying out hot
  for (let i = 0; i < 8 + 6 * k; i++) {
    const a = rand(0, 6.28), sp = rand(28, 75) * m * q;
    glowE.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 2.2, life: rand(0.25, 0.6), s0: 0.9 * m, s1: 0.4 * m, a0: 1, a1: 0, c0: [1, 0.7, 0.35], cell: 0 });
  }
  // its light on the ground about it: plain at night; by day the sun's own light all but drowns it
  lightL.spawn({ x, y, life: 0.9 + 0.3 * k, s0: 130 * q * m, s1: 150 * q * m, a0: S.night ? 1.3 : 0.35, a1: 0, c0: [1, 0.74, 0.46], cell: 0, rot: 0, ease: 'lin' });
  // the shock's ring of fine dust, lighter than the ground (it catches the sun), each puff an arc of it
  const nR = Math.round(18 + 8 * k);
  for (let i = 0; i < nR; i++) {
    const a = (i / nR) * 6.283 + rand(-0.12, 0.12), sp = rand(110, 150) * q * m, vx = Math.cos(a) * sp, vy = Math.sin(a) * sp;
    smokeL.spawn({ x: x + Math.cos(a) * 2 * m, y: y + Math.sin(a) * 2 * m, vx, vy, drag: 6, wind: 0.2, rot: rotAlong(vx, vy), sx: 0.55,
      life: rand(1.4, 2.4) * q, s0: 2 * k * m, s1: rand(8, 11) * k * m, a0: 0.72, a1: 0, c0: [0.86, 0.8, 0.68], c1: [0.8, 0.75, 0.66] });
  }
  if (k >= 0.3) {
    // the crater's jets: a line of soil each, its long puffs along the throw
    const nJ = Math.round(6 + 4 * k);
    for (let j = 0; j < nJ; j++) {
      const a = (j / nJ) * 6.283 + rand(-0.3, 0.3), v = rand(30, 60) * q * m;
      for (const f of [0.45, 0.7, 1]) {
        const vx = Math.cos(a) * v * f, vy = Math.sin(a) * v * f;
        smokeL.spawn({ x, y, vx, vy, drag: 2.2, wind: 0.3, rot: rotAlong(vx, vy), sx: 2.6, life: rand(2.5, 4) * q, s0: 1.2 * k * m, s1: rand(3.5, 5) * k * m,
          a0: 1.2, a1: 0, c0: [0.44, 0.38, 0.3], c1: [0.68, 0.63, 0.54] });
      }
    }
  }
  // debris thrown out, falling back
  if (!opt.small || k > 0.25) for (let i = 0; i < 8 + 8 * k; i++) {
    const a = rand(0, 6.28), sp = rand(8, 38) * m;
    smokeL.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, z: 0.1, vz: rand(6, 24), grav: true, drag: 0.2,
      life: rand(5, 9), s0: rand(0.5, 1.2) * m, s1: rand(0.5, 1.2) * m, a0: 0.95, a1: 0, fade: 'late', c0: [0.09, 0.085, 0.08], vr: rand(-6, 6) });
  }
  // the thermal's own picture of it
  heatL.spawn({ x, y, life: 1.2 + 0.6 * k, s0: 16 * k * m, s1: 30 * k * m, a0: 1.6, a1: 0, c0: [1, 0, 0], ease: 'lin' });
  if (k >= 0.3) {
    heatL.spawn({ x, y, wind: 1, life: 4 + 2 * k, s0: 14 * k * m, s1: 34 * k * m, a0: 0.7, a1: 0, c0: [1, 0, 0] });
    for (let i = 0; i < 4 + 6 * k; i++) {
      const a = rand(0, 6.28), sp = rand(15, 45) * q * m, s0 = rand(2, 3.2) * m;
      heatL.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: rand(12, 40), s0, s1: s0 * 0.8, a0: rand(0.6, 1), a1: 0, c0: [1, 0, 0] });
    }
  }
  // (opacities over 1 fill in the puffs' soft edges: a young cloud is dense, and thins as it fades)
  // the cloud: soot and soil bursting out of the crater, most of its width within the second, then fed by the column.
  // Half of it the explosive's black soot, the core; half the ground's own dust, flung further, its top bright in the
  // sun: one shows on light ground, the other on dark
  if (k >= 0.3) {
    for (let i = 0; i < 10 + 4 * k; i++) {
      const dust = i % 2 === 1, a = rand(0, 6.28), sp = (dust ? rand(16, 28) : rand(6, 16)) * q * m, g = dust ? rand(0.84, 0.94) : rand(0.12, 0.19);
      smokeL.spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, wind: 0.8, ease: 'burst', life: rand(5, 8) * q, s0: 3 * k * m, s1: rand(18, 24) * q * m,
        a0: dust ? 1.3 : 1.8, a1: 0, c0: [g, g * 0.93, g * 0.82], c1: [0.6, 0.57, 0.51], vr: rand(-0.3, 0.3), rise: 6 * q, riseT: 3 });
    }
    emitters.push({ type: 'column', x, y, k, t: 0, dur: 4 + 3 * k, acc: 0 });
  }
  windowBlast(x, y, k);
  if (!opt.noScorch) addScorch(x, y, (k < 0.4 ? 3.5 : 7.5 * k) * m);
  Snd.boom(k, opt.small);
}
function updateEmitters(dt) {
  for (let i = emitters.length - 1; i >= 0; i--) {
    const e = emitters[i]; e.t += dt;
    if (e.t > e.dur) { emitters.splice(i, 1); continue; }
    const m = PXM;
    if (e.type === 'column') {
      e.acc += dt * (e.t < 1.5 ? 20 + 8 * e.k : 11 + 4 * e.k) * (1 - e.t / e.dur * 0.7);
      while (e.acc >= 1) {
        e.acc -= 1;
        const young = e.t < 1.0, g = young ? rand(0.18, 0.26) : rand(0.32, 0.42);
        const out = young ? rand(4, 10) : rand(1, 3);
        const a = rand(0, 6.28);
        smokeL.spawn({ x: e.x + rand(-1.5, 1.5) * e.k * m, y: e.y + rand(-1.5, 1.5) * e.k * m, vx: Math.cos(a) * out * m, vy: Math.sin(a) * out * m, wind: young ? 1.2 : 2.0, drag: 0.35,
          life: rand(8, 12), s0: rand(2.5, 4.5) * e.k * m, s1: rand(13, 21) * Math.sqrt(e.k) * m, a0: young ? 0.8 : 0.55, a1: 0, c0: [g, g * 0.92, g * 0.82], c1: [0.6, 0.56, 0.5], vr: rand(-0.3, 0.3), fadeIn: 0.2, rise: (young ? rand(9, 14) : rand(4, 7)) * Math.sqrt(e.k), riseT: 5 });
      }
    } else if (e.type === 'wreck') {
      windowWreck(e, dt);
      const v = e.v;
      const life = 1 - e.t / e.dur;
      e.acc += dt * 6 * life;
      while (e.acc >= 1) {
        e.acc -= 1;
        const g = rand(0.08, 0.14);
        smokeL.spawn({ x: v.x + rand(-1, 1) * m, y: v.y + rand(-1, 1) * m, vx: 0, vy: 0, wind: 2.0, drag: 0.1, life: rand(7, 10), s0: 1.8 * m, s1: rand(10, 16) * m,
          a0: 0.5 * life + 0.12, a1: 0, c0: [g, g, g * 0.95], c1: [0.42, 0.41, 0.39], vr: rand(-0.25, 0.25), fadeIn: 0.3, rise: rand(3, 5), riseT: 8 });
        if (e.t < e.fireFor && Math.random() < 0.85) fireL.spawn({ x: v.x + rand(-1.4, 1.4) * m, y: v.y + rand(-2, 2) * m, vx: WIND.x * 0.3, vy: WIND.y * 0.3, life: rand(0.35, 0.7),
          s0: rand(1.2, 2.2) * m, s1: rand(2.5, 4) * m, a0: 0.95, a1: 0, c0: [1, 0.78, 0.45], c1: [0.8, 0.22, 0.04], rise: rand(2, 4), riseT: 0.4 });
      }
      if (e.t < e.fireFor) {
        const f = 0.75 + 0.25 * Math.sin(S.t * 23 + e.seed) * Math.sin(S.t * 7.3);
        lightL.put(v.x, v.y, 40 * m, 40 * m, 0, 1, 0.62, 0.3, 0.55 * f, 0);
        glowE.put(v.x, v.y, 7 * m, 7 * m, 0, 1, 0.55, 0.2, 0.22 * f, 0);
      }
    }
  }
}

/* ===================== damage ===================== */
function damageAt(x, y, kind, shot) {
  // [damage at the centre, radius m]: Hellfire, one Hydra 70 rocket, a 30 mm HEDP round; bmb = a big secondary blast;
  // flc = one flechette rocket's patch of darts: deadly to people in the open, little to a vehicle, nothing to walls
  // (b500, b2000: the F-15's 500 lb and 2,000 lb bombs; the 2,000 lb one carries five times the explosive, and brings
  // down the biggest warehouse alone)
  // (agm: the Maverick's 136 kg warhead, a tank's end in one; the Hellfire's 9 kg takes two)
  const spec = { msl: [260, 18], agm: [480, 20], rkt: [150, 12], bmb: [420, 40], gun: [55, 4], cook: [30, 6], flc: [90, 30], b500: [380, 30], b2000: [800, 50] }[kind];
  const wall = { msl: 1, agm: 1, bmb: 1, rkt: 0.35, gun: 0.08, cook: 0.2, flc: 0.02, b500: 1, b2000: 1 }[kind], armour = { msl: 1, agm: 1, bmb: 1, rkt: 0.5, gun: 0.15, cook: 0.2, flc: 0.03, b500: 1, b2000: 1 }[kind];
  const onVeh = u => kind !== 'flc' ? 1 : u.vk === 'mrap' || u.vk === 'tanker' ? 0.03 : 0.25;
  for (const t of targets) {
    // fighters sheltering inside a house are safe until the house comes down
    if (!t.alive || t.escaped || t.dormant || t.inside) continue;
    // buildings are walls and slabs: rockets and the gun do far less to them than a Hellfire
    // people: each man by his own distance from it
    if (t.kind === 'personnel') {
      if (hurtMen(t, x, y, spec[0], spec[1])) { if (shot && !shot.hit) { shot.hit = true; S.hits++; } if (!t.men.some(m => m.alive)) kill(t); }
      continue;
    }
    const d = t.kind === 'house' ? houseDist(t, x, y) : Math.max(0, Math.hypot(t.x - x, t.y - y) * MPP - t.len * 0.35);
    if (d < spec[1]) {
      const dmg = spec[0] * (1 - d / spec[1]) * (t.kind === 'house' ? wall : t.kind === 'vehicle' ? onVeh(t) * armourOf(t, kind) : 1);
      t.hp -= dmg;
      if (shot && !shot.hit) { shot.hit = true; S.hits++; }
      if (t.kind === 'vehicle' && t.hp < t.maxHp * 0.45) t.disabled = true;
      if (t.hp <= 0) kill(t);
    }
  }
  // our own fire on friendlies: every hit is fratricide, counted heavily
  for (const f of friends) {
    if (!f.alive) continue;
    if (f.kind === 'personnel') {
      if (hurtMen(f, x, y, spec[0], spec[1])) {
        if (!f.fratHit) { f.fratHit = true; S.frat++; if (f.men.some(m => m.alive)) radio('CEASE FIRE', 'أوقف النار! أوقف النار! النار على قواتنا', 'hunter', ['h.ff']); }
        if (!f.men.some(m => m.alive)) killFriend(f, true);
      }
      continue;
    }
    const d = Math.max(0, Math.hypot(f.x - x, f.y - y) * MPP - f.len * 0.35);
    if (d < spec[1]) {
      f.hp -= spec[0] * (1 - d / spec[1]) * (f.vk === 'mrap' ? armour : f.kind === 'vehicle' ? onVeh(f) : 1);
      if (!f.fratHit) { f.fratHit = true; S.frat++; if (f.hp > 0) radio('CEASE FIRE', 'أوقف النار! أوقف النار! النار على قواتنا', 'hunter', ['h.ff']); }
      if (f.hp <= 0) killFriend(f, true);
    }
  }
  // civilian boats: any harm counts against the mission, as a civilian house does
  for (const v of vehicles) {
    if (!v.civil || !v.alive || v.dormant) continue;
    const d = Math.max(0, Math.hypot(v.x - x, v.y - y) * MPP - v.len * 0.35);
    if (d < spec[1]) {
      v.hp -= spec[0] * (1 - d / spec[1]);
      if (!v.civHit) { v.civHit = true; S.civHit++; CK.msg = { s: 'CIV DAMAGE', t: 2.5 }; }
      if (v.hp <= 0) kill(v);
    }
    if (d < 400) v.alert = true;
  }
  // civilian houses: any damage is counted against the mission; enough of it brings one down. Other buildings
  // that are not targets come down too, without counting
  for (const h of houses) {
    if ((h.role !== 'civil' && h.role !== 'struct') || !h.standing) continue;
    const d = houseDist(h, x, y);
    if (d < spec[1]) {
      h.hp -= spec[0] * (1 - d / spec[1]) * wall;
      if (h.role === 'civil' && !h.hit) { h.hit = true; S.civHit++; }
      if (h.hp <= 0) ruinHouse(h);
    }
  }
  for (const t of targets) {
    if (!t.alive || t.escaped) continue;
    const d = Math.hypot(t.x - x, t.y - y) * MPP;
    if (t.kind === 'personnel' && d < (kind === 'gun' ? 60 : 220)) alertGroup(t, x, y);
    if (t.kind === 'vehicle' && t.convoy && d < 260 && kind !== 'cook') alertConvoy(t.convoy);
    if (t.kind === 'vehicle' && t.mode === 'sea' && d < 400) t.alert = true;
    if (t.kind === 'vehicle' && t.mode === 'solo' && d < 220 && !t.fleeing) { t.fleeing = true; t.haltS = null; t.latGoal = 0; t.vCruise = 13; t.alert = true; }
  }
}
function alertConvoy(id) {
  for (const v of vehicles) if (v.convoy === id && v.side !== 'blue' && v.alive && !v.alert) { v.alert = true; v.vCruise = 14; v.haltS = null; }
}
function kill(t) {
  if (t.kind === 'house') { ruinHouse(t); if (S.sel === t) timers.push({ t: 2.5, fn: () => { if (S.sel === t) unlock(); } }); syncUI(); checkEnd(); return; }
  t.alive = false; t.hp = 0;
  if (t.kind === 'vehicle') {
    t.body.material.map = T[t.vk + 'B']; t.body.material.color.setHex(0xffffff); t.body.material.needsUpdate = true;
    t.v = 0; t.disabled = true; t.burn = 1;
    emitters.push({ type: 'wreck', v: t, t: 0, dur: rand(70, 110), fireFor: rand(35, 70), acc: 0, seed: rand(0, 99) });
    // the SAM gone: its missiles cook off, the warner falls silent, and the pilot says so
    if (t.vk === 'sa8') { AC.threats.delete(t); if (t.sam && t.sam.seen) timers.push({ t: 3, fn: () => radio('SA-8 IS DOWN', 'دُمّر الدفاع الجوي SA-8', 'jet', ['f.samdown']) }); }
    if (t.vk === 'mrap' || t.vk === 'launcher' || t.vk === 'sa8') for (let i = 0; i < 3 + Math.floor(Math.random() * 3); i++) timers.push({ t: rand(2, 14), fn: () => { explode(t.x + rand(-1, 1) * PXM, t.y + rand(-1, 1) * PXM, 0.3, { small: true, noScorch: true }); } });
    // fuel and missile propellant go up a moment after the hit
    if (t.vk === 'tanker') timers.push({ t: 0.45, fn: () => { explode(t.x, t.y, 2.6); damageAt(t.x, t.y, 'bmb'); } });
    if (t.vk === 'launcher' || t.vk === 'bm21') timers.push({ t: 0.7, fn: () => { explode(t.x + rand(-2, 2) * PXM, t.y + rand(-2, 2) * PXM, 2.3); damageAt(t.x, t.y, 'bmb'); } });
    // the ammunition dump cooks off: blast after blast for half a minute, rounds and rockets thrown out of it
    if (t.vk === 'ammo') { timers.push({ t: 0.5, fn: () => { explode(t.x, t.y, 2.6); damageAt(t.x, t.y, 'bmb'); } });
      for (let i = 0; i < 12; i++) timers.push({ t: rand(1.5, 30), fn: () => explode(t.x + rand(-5, 5) * PXM, t.y + rand(-4, 4) * PXM, rand(0.4, 1.3), { small: true, noScorch: true }) }); }
  } else {
    // (the men still standing go down where they are; those inside a house that came down stay under it)
    for (const m of t.men) if (m.alive) { if (m.body.visible) manDown(t, m); else { m.alive = false; m.hp = 0; } }
  }
  if (S.sel === t) timers.push({ t: 2.5, fn: () => { if (S.sel === t) unlock(); } });
  syncUI();
  checkEnd();
}

