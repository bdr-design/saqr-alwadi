/* ===================== aircraft ===================== */
// AH-64 on station. The pilot (back seat) flies; the gunner tells him where: a hover point, an orbit around what the
// sensor is on, a patrol along the road, or any spot tapped on the TSD. The flight is a point mass under the rotor
// disc: the disc tilts to push the aircraft (nose down to speed up, nose up to slow down, bank to the side), within
// attitude limits and with its own lag. Drag grows with the square of the airspeed, and the airspeed is through the
// wind, so the aircraft leans into the wind in the hover and crabs across it in a transit. At speed it turns by
// banking and the nose stays near the flight path (the sideslip allowed shrinks with airspeed); slow, it can sidestep
// and pedal-turn. Radius, speed and height wander a little, as flown by hand; gusts add small pushes and rolls.
// the air base, on a map that has one (the theatre): its pads, runway, apron (tools/make_airbase.py). The aircraft
// starts a mission on a pad, takes off when told where to go, and BASE brings it back to land, rearm and refuel.
const BASE = MAP.base || null, GROUND = 410, EYE = 3.2, ALT_CRUISE = 1250;
const basePad = () => { const q = BASE.pads[BASE.padFree[0]]; return { x: q[0], y: q[1] }; };
const plane = { R: 1600, R0: 1600, alt: 1250, gs: 120, hdg: 0, bank: 0, pitch: 0, nose: 0, track: 0, x: 0, y: 0, vs: 0, tq: 60, load: 1, fuel: 2400,
  // flight mode: 'orbit' (circles plane.oc), 'h1' / 'h2' (holds a hover at a stand-off point), 'hp' (flies to the
  // point picked on the TSD, plane.hp, and hovers there), 'route' (patrols the loop plane.route along the road)
  mode: 'orbit', onOrbit: true, oc: null, hp: null, route: null, ri: 0, vx: 0, vy: 0, ax: 0, ay: 0, tilt: { p: 0, b: 0 },
  // altB: the height the pilot is holding (m above sea level), before the wander and heave of hand flying; padT: time on the pad
  altB: ALT_CRUISE, padT: 0 };
// the two hover points out from the valley centre (metres), west-south-west and north-east of the road; the first a
// little closer, as the road runs east of the centre
const HOVER = MAP.hover;
const hoverPt = k => { const h = HOVER[k], b = h.b * Math.PI / 180; return { x: W0 / 2 + Math.sin(b) * h.d * PXM, y: H0 / 2 - Math.cos(b) * h.d * PXM }; };
const V_ORBIT = 100 / 3.6, V_TRANSIT = 165 / 3.6, V_PATROL = 140 / 3.6;
const PITCH_DN = 0.21, PITCH_UP = 0.17, BANK_MAX = 0.44;   // disc tilt the pilot uses: 12° nose down, 10° up, 25° of bank
const TILT_LAG = 0.45;   // s for the disc (and the airframe under it) to follow the stick
const CD = 4.6e-4;       // drag deceleration per (m/s)² of airspeed: 0.9 m/s² at 160 km/h, top speed near 240 km/h at full tilt
const WIND_MS = { x: WIND.x / PXM, y: WIND.y / PXM };
const NOSE_IN = 0.55;     // rad the nose is yawed inward from the flight path at the start, on the circle
const G = 9.81;
// The vertical envelope with the airspeed through the rotor (m/s). Climb: about 3 m/s straight up from the hover (no
// translational lift), 12 at best climb speed (near 110 km/h); a damaged engine takes from it. Descent: slow with no
// airspeed, under 2 m/s, or the rotor settles into its own downwash (vortex ring state); free above 80 km/h.
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const climbMax = va => (3 + 9 * smooth(4, 30, va)) * (0.4 + 0.3 * (AC.eng[0] + AC.eng[1]));
const sinkMax = va => 1.8 + 8.2 * smooth(7, 22, va);
// coming home: a 10° approach path to the pad; higher than that, a descending orbit around it until on the path
const GLIDE = Math.tan(10 * Math.PI / 180), APPR_R = 700;
const YAW_RATE = 0.3, YAW_ACC = 0.35;   // the nose: up to 17°/s, reached and stopped smoothly (rad/s, rad/s²)
// smooth pseudo-turbulence: a few incommensurate sines per axis
const gust = (t, a, b, c) => Math.sin(t * a) * 0.5 + Math.sin(t * b + 1.3) * 0.3 + Math.sin(t * c + 2.1) * 0.2;
const orbitR = t => plane.R0 + 170 * Math.sin(t * 0.013) + 60 * Math.sin(t * 0.031 + 1);
function orbitPos(t, ang) {
  const R = orbitR(t), c = plane.oc || { x: W0 / 2, y: H0 / 2 };
  return { R, x: c.x + Math.cos(ang) * R * PXM, y: c.y + Math.sin(ang) * R * PXM };
}
// how far the nose may be off the flight path through the air: free in the hover, sideways up to about 45 km/h,
// then less and less: 45° at 80 km/h, 33° at 110, 20° at 165
const slipMax = va => va < 8 ? Math.PI : va < 12 ? Math.PI / 2 : Math.max(0.25, Math.PI / 2 * Math.pow(12 / va, 1.1));
// the patrol: a racetrack along the road, as a pilot flies a road reconnaissance: two straight legs about 600 m out on
// either side of it, parallel to its general line, joined by half circles past its ends (a 600 m radius: an easy turn)
function patrolRoute() {
  const a = Math.atan2(RY[RN - 1] - RY[0], RX[RN - 1] - RX[0]), ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
  let lo = 1e9, hi = -1e9, mx = 0, my = 0;
  for (let i = 0; i < RN; i++) { const along = RX[i] * ux + RY[i] * uy; lo = Math.min(lo, along); hi = Math.max(hi, along); mx += RX[i]; my += RY[i]; }
  mx /= RN; my /= RN;
  const c0 = mx * nx + my * ny, r = 600 * PXM, pts = [], step = 100 * PXM;
  const at = (al, of) => ({ x: ux * al + nx * (c0 + of), y: uy * al + ny * (c0 + of) });
  for (let al = lo; al < hi; al += step) pts.push(at(al, r));
  for (let k = 0; k < 12; k++) { const t = k / 12 * Math.PI; pts.push(at(hi + Math.sin(t) * r, Math.cos(t) * r)); }
  for (let al = hi; al > lo; al -= step) pts.push(at(al, -r));
  for (let k = 0; k < 12; k++) { const t = k / 12 * Math.PI; pts.push(at(lo - Math.sin(t) * r, -Math.cos(t) * r)); }
  return pts;
}
// the gunner's call: o.c, the centre for an orbit (else the one it had); o.p, the point to fly to for 'hp'
function setFlight(m, o) {
  o = o || {};
  // the F-15: an orbit round what the pod is on, or round a point touched on the TSD (flying there first); not
  // before he is on station
  if (JET) {
    if (JX.gs) return;
    if (m === 'orbit') jetOrbit(o.c || plane.oc || { x: W0 / 2, y: H0 / 2 });
    else if (m === 'hp' && o.p) { plane.hp = { x: o.p.x, y: o.p.y }; jetOrbit(o.p, 'hp'); radio('FLYING THERE', 'نتجه للنقطة', 'jet', ['f.fly']); }
    else return;
    if (JX.run) jetAbort(false);
    Snd.tone(m === 'orbit' ? 600 : 860, 0.05); syncFlight(); CK.mpdT = 0; return;
  }
  if (m === 'orbit' && o.c) { plane.oc = { x: clamp(o.c.x, 0, W0), y: clamp(o.c.y, 0, H0) }; plane.onOrbit = false; }
  if (m === 'hp' && o.p) plane.hp = { x: clamp(o.p.x, -1500 * PXM, W0 + 1500 * PXM), y: clamp(o.p.y, -1500 * PXM, H0 + 1500 * PXM) };
  if (m === 'route') { if (!plane.route) plane.route = patrolRoute(); plane.ri = nearestOnRoute(); }
  if (m === 'base' && !BASE) return;
  if (m === 'base') plane.appr = null;
  if (m === plane.mode && !o.c && !o.p) return;
  if (plane.mode === 'pad' && m !== 'pad' && S.phase === 'play') radio('LIFTING', 'نقلع', 'pilot', ['p.lift']);
  if (m === 'base' && plane.mode !== 'pad') radio('RTB', 'راجعين للقاعدة', 'pilot', ['p.rtb']);
  plane.mode = m; if (m !== 'orbit') plane.onOrbit = false;
  Snd.tone(m === 'orbit' ? 600 : 860, 0.05); syncFlight(); CK.mpdT = 0;
}
function nearestOnRoute() {
  const r = plane.route; let best = 0, bd = 1e18;
  r.forEach((p, i) => { const d = Math.hypot(p.x - plane.x, p.y - plane.y); if (d < bd) { bd = d; best = i; } });
  return best;
}
// where the pilot wants to be going: a ground velocity (m/s), and whether he is holding a point
function flightGoal(t) {
  const p = plane, v = Math.hypot(p.vx, p.vy);
  // under fire: the pilot breaks away at speed, then goes back to what he was doing
  if (AC.evade && S.missionT < AC.evade.until && S.phase === 'play' && p.mode !== 'pad' && p.altB - GROUND > 20) return { x: Math.cos(AC.evade.dir) * V_TRANSIT, y: Math.sin(AC.evade.dir) * V_TRANSIT, hold: false };
  // on the pad; lifting off: straight up until clear of the ground, then on as asked
  if (p.mode === 'pad' || (p.altB - GROUND < 15 && p.mode !== 'base' && p.vs >= -0.5 && v < 4)) return { x: -p.vx * 0.5, y: -p.vy * 0.5, hold: true };
  if (p.mode === 'orbit') {
    // the circle as a guidance field: its tangent, plus a pull toward it that fades on arrival, so the aircraft
    // meets it running along it rather than crossing it; far off, it comes in at transit speed
    const c = p.oc || { x: W0 / 2, y: H0 / 2 };
    const rx = p.x - c.x, ry = p.y - c.y, a = Math.atan2(ry, rx), r = Math.hypot(rx, ry) * MPP, Rt = orbitR(t);
    const e = clamp((r - Rt) / 250, -2, 2), fx = -Math.sin(a) - Math.cos(a) * e, fy = Math.cos(a) - Math.sin(a) * e, fm = Math.hypot(fx, fy);
    const vk = V_ORBIT + 4 * Math.sin(t * 0.021 + 0.4) + 1 * Math.sin(t * 0.07);
    const sp = vk + clamp((Math.abs(r - Rt) - 300) / 1000, 0, 1) * (V_TRANSIT - vk);
    const al = (p.vx * -Math.sin(a) + p.vy * Math.cos(a)) / Math.max(v, 1e-3);
    p.onOrbit = Math.abs(r - Rt) < 40 && al > 0.97;
    p.R = r;
    return { x: fx / fm * sp, y: fy / fm * sp, hold: false };
  }
  if (p.mode === 'route') {
    // pure pursuit along the loop: a point some seconds ahead on it
    const R = p.route, n = R.length;
    for (let k = 0; k < 6; k++) { const i1 = (p.ri + 1) % n; if (Math.hypot(R[i1].x - p.x, R[i1].y - p.y) < Math.hypot(R[p.ri].x - p.x, R[p.ri].y - p.y)) p.ri = i1; else break; }
    let need = Math.max(220, v * 6) * PXM, i = p.ri, q = { x: p.x, y: p.y };
    for (let k = 0; k < n && need > 0; k++) { const j = (i + 1) % n, d = Math.hypot(R[j].x - q.x, R[j].y - q.y); if (d >= need) { q = { x: q.x + (R[j].x - q.x) * need / d, y: q.y + (R[j].y - q.y) * need / d }; need = 0; } else { need -= d; q = R[j]; i = j; } }
    const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1;
    return { x: dx / d * V_PATROL, y: dy / d * V_PATROL, hold: false };
  }
  if (p.mode === 'base') {
    // too high for the approach path: around the pad at orbit speed, coming down, until on it; then straight in
    const q = basePad(), d = Math.hypot(q.x - p.x, q.y - p.y) * MPP, above = p.altB - GROUND - EYE - d * GLIDE;
    if (p.appr !== 'final' && (above > 40 || p.appr === 'orbit' && above > 15)) {
      p.appr = 'orbit';
      const rx = p.x - q.x, ry = p.y - q.y, a = Math.atan2(ry, rx), e = clamp((d - APPR_R) / 250, -2, 2);
      const fx = -Math.sin(a) - Math.cos(a) * e, fy = Math.cos(a) - Math.sin(a) * e, fm = Math.hypot(fx, fy);
      return { x: fx / fm * V_ORBIT, y: fy / fm * V_ORBIT, hold: false };
    }
    p.appr = 'final';
  }
  // to a point: as fast as it can still stop on it at 1.2 m/s²; the last stretch a position hold, critically damped
  const h = p.mode === 'hp' ? p.hp : p.mode === 'base' ? basePad() : hoverPt(p.mode);
  const dx = (h.x - p.x) * MPP, dy = (h.y - p.y) * MPP, d = Math.hypot(dx, dy);
  const sp = Math.min(V_TRANSIT, Math.sqrt(2 * 1.2 * d), d * 0.25);
  return { x: d > 0.01 ? dx / d * sp : 0, y: d > 0.01 ? dy / d * sp : 0, hold: d < 60 };
}
function updatePlane(dt) {
  if (JET) { updateJet(dt); return; }
  const t = S.t, p = plane;
  const pvx = p.vx, pvy = p.vy;
  const onPad = p.mode === 'pad';
  if (onPad) { p.vx = p.vy = 0; p.tilt.p *= 0.9; p.tilt.b *= 0.9; }
  if (dt > 0 && !onPad) {
    let w = flightGoal(t);
    const v = Math.hypot(p.vx, p.vy);
    // at speed the pilot turns toward a new direction rather than braking across it: the wanted velocity is swung at
    // most 60° from the present one, so a reversal is flown as a banked turn
    if (v > 15) {
      const aw = Math.atan2(w.y, w.x), av = Math.atan2(p.vy, p.vx), dA = wrapA(aw - av), wm = Math.hypot(w.x, w.y);
      if (Math.abs(dA) > 1.05) { const a = av + Math.sign(dA) * 1.05, m = Math.max(wm, v * 0.85); w = { x: Math.cos(a) * m, y: Math.sin(a) * m, hold: w.hold }; }
    }
    // from low speed he first turns the nose the way he is going: sideways or backwards he flies no faster than the
    // slip the airspeed allows (12 m/s fully sideways)
    p.wantV = Math.hypot(w.x, w.y);
    if (v < 15) {
      const wax = w.x - WIND_MS.x, way = w.y - WIND_MS.y, wa = Math.hypot(wax, way), off = Math.abs(wrapA(Math.atan2(way, wax) - p.nose));
      const vmax = off <= 0.25 ? 1e9 : off >= Math.PI / 2 ? 12 : 12 * Math.pow(Math.PI / 2 / off, 1 / 1.1);
      if (wa > vmax) { const k = vmax / wa; w = { x: WIND_MS.x + wax * k, y: WIND_MS.y + way * k, hold: w.hold }; }
    }
    // the stick: the acceleration asked for (velocity loop 0.8/s), plus what holds the drag through the air
    const vax = p.vx - WIND_MS.x, vay = p.vy - WIND_MS.y, va = Math.hypot(vax, vay);
    const kv = 0.8, cx = (w.x - p.vx) * kv + CD * va * vax, cy = (w.y - p.vy) * kv + CD * va * vay;
    // ... as a disc tilt in the nose's frame, within the attitude limits
    const n = p.nose, fx = Math.cos(n), fy = Math.sin(n), lx = -Math.sin(n), ly = Math.cos(n);
    // a damaged engine leaves less power: less tilt forward, so a lower top speed
    const pwr = 0.4 + 0.3 * (AC.eng[0] + AC.eng[1]);
    const pc = clamp(-Math.atan((cx * fx + cy * fy) / G), -PITCH_DN * pwr, PITCH_UP), bc = clamp(Math.atan((cx * lx + cy * ly) / G), -BANK_MAX, BANK_MAX);
    const k = 1 - Math.exp(-dt / TILT_LAG);
    p.tilt.p += (pc - p.tilt.p) * k; p.tilt.b += (bc - p.tilt.b) * k;
    // the push the tilted disc gives, less the drag; the gust a push on the airframe (the hold leans against it)
    const fa = -Math.tan(p.tilt.p) * G, la = Math.tan(p.tilt.b) * G;
    // (gusts die away near the ground)
    const gq = (w.hold ? 0.25 : 0.35) * clamp((p.altB - GROUND) / 30, 0, 1), gxA = gq * gust(t, 0.3, 0.7, 1.3), gyA = gq * gust(t + 40, 0.4, 0.8, 1.1);
    const axT = fa * fx + la * lx - CD * va * vax + gxA, ayT = fa * fy + la * ly - CD * va * vay + gyA;
    p.gxA = gxA; p.gyA = gyA;
    p.vx += axT * dt; p.vy += ayT * dt;
    p.x += p.vx * dt * PXM; p.y += p.vy * dt * PXM;
    p.hold = w.hold;
  }
  const v = Math.hypot(p.vx, p.vy), vax = p.vx - WIND_MS.x, vay = p.vy - WIND_MS.y, va = Math.hypot(vax, vay);
  if (dt > 0) {
    p.ax = lerp(p.ax, (p.vx - pvx) / dt, 1 - Math.exp(-dt * 3)); p.ay = lerp(p.ay, (p.vy - pvy) / dt, 1 - Math.exp(-dt * 3));
    if (v > 3) {
      const tr = Math.atan2(p.vy, p.vx), om = wrapA(tr - p.track) / dt;
      p.track = tr;
      p.turn = lerp(p.turn || 0, clamp(om, -0.5, 0.5), 1 - Math.exp(-dt * 1.5));
    } else p.turn = lerp(p.turn || 0, 0, 1 - Math.exp(-dt * 1.5));
    p.gs = v * 3.6;
  }
  // the nose: the pilot points it where the gunner works (the locked target, else where the sensor looks), as far as
  // the airspeed lets him fly sideways; in the hover he turns to face it; flying fast to a point, it stays on the path
  const lk = S.sel && S.sel.alive && !S.sel.escaped ? S.sel : S.aim;
  const face = Math.atan2(lk.y - p.y, lk.x - p.x), air = va > 3 ? Math.atan2(vay, vax) : p.track;
  // (how fast he means to go, not only how fast he goes: setting off, the nose swings to the way first)
  const cruise = p.mode === 'orbit' || p.mode === 'route', wv = cruise ? 1 : clamp((Math.max(v, p.wantV || 0) - 4) / 14, 0, 1);
  const sm = slipMax(va);
  let base = cruise ? air + clamp(wrapA(face - air), -sm, sm) : face + wrapA(air - face) * wv;
  base = air + clamp(wrapA(base - air), -sm, sm);
  const wob = cruise ? 1 : 0.3 + 0.7 * wv;
  const want = base + wob * (0.04 * Math.sin(t * 0.05) + 0.01 * gust(t, 0.4, 0.9, 1.6));
  if (p.nose0 == null) p.nose0 = want;
  // on the pad, and in the first metres off it, the nose stays as it was
  // (the yaw rate the pilot wants brings the nose to rest on the mark: never faster than it can still be stopped)
  if (!onPad && p.altB - GROUND > 6 && dt > 0) {
    const err = wrapA(want - p.nose0), rT = Math.sign(err) * Math.min(YAW_RATE, Math.sqrt(2 * YAW_ACC * Math.abs(err) * 0.8));
    p.yawR = (p.yawR || 0) + clamp(rT - (p.yawR || 0), -YAW_ACC * dt, YAW_ACC * dt);
    p.nose0 += p.yawR * dt;
  } else p.yawR = 0;
  p.nose = p.nose0;
  // attitude: the disc's tilt (a little nose-up in the hover), with turbulence growing with airspeed; in the hover the
  // stability augmentation keeps it within a degree
  const tq = clamp(va / 30, 0.35, 1);
  p.bank = p.tilt.b + 0.026 * tq * gust(t, 0.9, 1.7, 3.1);
  // the bank the view settles back from: a steady turn does not leave the picture tilted (the instruments keep the
  // true bank); entering a turn, gusts and transits still roll it
  p.bankSteady = p.bankSteady == null ? p.bank : lerp(p.bankSteady, p.bank, dt > 0 ? 1 - Math.exp(-dt / 4) : 0);
  p.pitch = 0.02 + p.tilt.p + 0.012 * tq * gust(t, 0.7, 1.3, 2.3);
  // what the crew feels sideways: the gust's push across the nose (the disc's own push is along the seat)
  p.side = -Math.sin(p.nose) * (p.gxA || 0) + Math.cos(p.nose) * (p.gyA || 0) + AC.jolt * Math.sin(t * 47);
  const alt0 = p.alt;
  // height: the pilot climbs (10 m/s) or descends (8 m/s, 1.5 in the last 15 m) to the height he wants: cruise with a
  // slow wander; coming home, a glide down with the distance to the pad (20°), then a touchdown on it
  let altT = ALT_CRUISE + 15 * Math.sin(t * 0.017);
  if (onPad) altT = GROUND + EYE;
  else if (p.mode === 'base') {
    // the descending orbit comes down to the path where it turns in; the final follows the path to a low hover over
    // the pad, then sets down
    const q = basePad(), d = Math.hypot(q.x - p.x, q.y - p.y) * MPP;
    altT = p.appr === 'orbit' ? GROUND + EYE + APPR_R * GLIDE : d < 6 && v < 1.5 ? GROUND + EYE : GROUND + EYE + clamp(d * GLIDE, 4, ALT_CRUISE - GROUND);
  }
  if (dt > 0) {
    // (off the pad: a gentle lift to a low hover first, as a pilot checks the aircraft before climbing away)
    const agl = p.altB - GROUND - EYE, vsT = clamp((altT - p.altB) * 0.25, agl < 15 ? -Math.min(1.5, sinkMax(va)) : -Math.min(8, sinkMax(va)), agl < 10 ? 2.5 : Math.min(10, climbMax(va)));
    p.vsB = (p.vsB || 0) + clamp(vsT - (p.vsB || 0), -2 * dt, 2 * dt);
    p.altB = Math.max(GROUND + EYE, p.altB + p.vsB * dt);
    // touchdown on the pad
    if (p.mode === 'base' && p.altB <= GROUND + EYE + 0.05) { p.mode = 'pad'; p.vsB = 0; p.padT = 0; p.vx = p.vy = 0; syncFlight(); radio('TOUCHDOWN', 'هبطنا', 'pilot', ['p.down']); if (S.rtb) checkEnd(); }
  }
  // altitude: the held height, a slow heave in the air (well under a tenth of a g)
  p.alt = p.altB + (onPad ? 0 : 1.0 * gust(t, 0.35, 0.8, 1.3) * clamp((p.altB - GROUND) / 40, 0, 1));
  if (dt > 0) p.vs = lerp(p.vs, (p.alt - alt0) / dt, 1 - Math.exp(-dt * 2));
  p.load = 1 / (Math.cos(p.tilt.b) * Math.cos(p.tilt.p)) + 0.04 * gust(t, 1.1, 2.3, 3.7);
  // hover takes more torque than cruise (no translational lift); fast takes more for the drag
  p.tq = onPad ? 22 + 1.5 * gust(t, 0.6, 1.4, 2.9) : (AC.eng[0] + AC.eng[1] < 2 ? 1.15 : 1) * 56 + (va * 3.6 - 120) * 0.22 + (va < 20 ? (20 - va) * 0.9 : 0) + p.vs * 3.5 + (p.load - 1) * 60 + 1.5 * gust(t, 0.6, 1.4, 2.9);
  p.fuel = Math.max(0, p.fuel - 0.33 * dt);    // about 1200 lb an hour
  // compass heading of the nose, clockwise from north
  p.hdg = ((Math.atan2(Math.cos(p.nose), -Math.sin(p.nose)) * 180 / Math.PI) + 360) % 360;
}
{ const a = 0.7, o = orbitPos(0, a); plane.x = o.x; plane.y = o.y; plane.track = Math.atan2(Math.cos(a), -Math.sin(a)); plane.nose0 = plane.track + NOSE_IN;
  plane.vx = Math.cos(plane.track) * V_ORBIT; plane.vy = Math.sin(plane.track) * V_ORBIT; }
// ---- the F-15SA (JET). Its six-degree-of-freedom flight model (src/f15sa.js) and the pilot in its front seat fly
// it; `plane` is fed from the model, so the views, the head, the pages and the war read it as they read the Apache.
// The map's x runs east and its y south; the model's north is -y. On station at 15,000 ft (4.2 km above the ground,
// over the 3.5 km the shoulder missiles reach, MANPADS_ALT) at 300 KCAS, on a 5 km wheel: close in, and a bomb from
// there falls 30 s from some 5.5 km out (from 20,000 ft at 330 KCAS, a 7 km wheel, it was 35 s from 7.4 km, and a
// laser bomb's run took the jet 15 km out); the TSD's RAD, ALT and SPD keys change it. A mission starts on the
// ground at the base where the map has one (jetGround), else on station. The officer in the back seat tells the pilot where: an orbit round what the pod is on, or
// round a point touched on the TSD; and the pilot asks before he takes the jet in on a bomb run (jetRun).
const JX = { ac: null, P: null, acc: 0, c: null, h: 15000 * 0.3048, kcas: 300, R: 5000, dir: -1, ask: null, hold: 0, run: null, fall: [], trk: [], said: {}, gs: null,
  air: (() => { try { return localStorage.getItem('saqr.jstart') === 'air'; } catch (_) { return false; } })() };
const toNE = p => ({ n: -p.y * MPP, e: p.x * MPP });
// the loadout on the jet's stations (src/f15sa.js STATIONS): 500 lb bombs along the conformal tanks, the 2,000 lb
// ones and the Mavericks under the wings; the pod under the right intake, two AIM-9X on the wing rails. JX.slots: which
// station each weapon comes off, in order
function jetStations() {
  const L = LOADOUTS[S.load] || LOADOUTS.cas, st = { RIN: 'SNIPER', W2A: 'AIM-9X', W8A: 'AIM-9X' }, slots = { lgb: [], jdam: [], agm: [] };
  const cft = ['LCFT1', 'RCFT1', 'LCFT2', 'RCFT2', 'LCFT3', 'RCFT3'], wing = ['W2', 'W8', 'W2B', 'W8B'];
  for (const w of JW) for (let i = 0; i < L.n[w]; i++) {
    const k = w === 'agm' || /GBU-(10|31)/.test(L.t[w]) ? wing.shift() : cft.shift();
    if (k) { st[k] = L.t[w]; slots[w].push(k); }
  }
  JX.slots = slots; return { cft: true, st };
}
function jetOrbit(c, m) {
  plane.oc = { x: c.x, y: c.y }; plane.mode = m || 'orbit'; plane.R0 = JX.R; plane.onOrbit = false;
  JX.P.set('orbit', { c: toNE(plane.oc), R: JX.R, dir: JX.dir, h: JX.h, kcas: JX.kcas }, Object.assign({ bank: 45 * Math.PI / 180, roll: 30 * Math.PI / 180, nz: 3 }, JET_CREW));
}
function jetPlace() {
  const F = window.F15SA, U = F.U, L = jetStations();
  // (light turbulence, as the day's wind makes it: WIND, 7 knots)
  if (!JX.ac) JX.ac = new F({ loadout: L, fuel: 0.8, groundAt: () => GROUND, turb: 1, w20: Math.hypot(WIND_MS.x, WIND_MS.y) / 0.5144, seed: 7, dT: 15 });
  else { JX.ac.loadout(L, 0.8); for (const e of JX.ac.eng) e.on = true; }
  JX.gs = null; JX.base = jetGroundStart();
  if (JX.base) {
    // on its stand, nose out, the engines at idle, the brakes on, the flaps up
    const s = AB.taxi.stand, p = toNE({ x: s[0], y: s[1] });
    JX.ac.place({ n: p.n, e: p.e, psi: s[2] * Math.PI / 180, onGround: true, flap: 0 });
    JX.P = new F.Pilot(JX.ac); JX.acc = 0; JX.ask = JX.run = null; JX.hold = 0; JX.fall.length = JX.trk.length = 0; JX.said = {};
    JX.gs = { st: 'stand' }; plane.mode = 'ground'; plane.oc = plane.hp = null; plane.R0 = JX.R; plane.bankSteady = plane.bankView = null;
    writePlane(0); return;
  }
  // on the circle round the mission's point (else the map's centre), flying along it (a left-hand orbit: the target on the left)
  const c = JX.c || { x: W0 / 2, y: H0 / 2 }, a = 0.7, cn = toNE(c);
  JX.ac.place({ n: cn.n + Math.cos(a) * JX.R, e: cn.e + Math.sin(a) * JX.R, h: JX.h, V: F.tasFromCas(JX.kcas * U.KT, F.atmos(JX.h, 15)), psi: a - Math.PI / 2 });
  JX.P = new F.Pilot(JX.ac); JX.acc = 0; JX.ask = JX.run = null; JX.hold = 0; JX.fall.length = JX.trk.length = 0; JX.said = {};
  jetOrbit(c); plane.hp = null; plane.bankSteady = plane.bankView = null;
  writePlane(0);
}
// the model's state into `plane`
function writePlane(dt) {
  const o = JX.ac.o, p = plane;
  p.x = o.e * PXM; p.y = -o.n * PXM; p.alt = p.altB = o.h;
  p.vx = o.ve; p.vy = -o.vn; p.gs = o.gs * 3.6; p.track = Math.atan2(p.vy, p.vx);
  p.nose = p.nose0 = o.psi - Math.PI / 2; p.hdg = ((o.psi * 180 / Math.PI) % 360 + 360) % 360;
  p.bank = o.phi; p.pitch = o.theta; p.vs = o.vs; p.load = o.nz; p.side = o.ny * G; p.turn = 0;
  // (the view settles back from a steady bank, as in the Apache: the owner's rule. Quicker than the Apache's 4 s: the
  // orbit's bank works a few degrees up and down all the way round to hold its radius, and at 4 s the horizon was
  // always a few degrees off level)
  p.bankSteady = p.bankSteady == null || !dt ? p.bank : lerp(p.bankSteady, p.bank, 1 - Math.exp(-dt / 1.5));
  // (the bank as the head follows it, a second behind: what of it the head takes back, setupWindowCam)
  p.bankView = p.bankView == null || !dt ? p.bank : lerp(p.bankView, p.bank, 1 - Math.exp(-dt / 1));
  p.fuel = o.fuel / 0.45359237; p.tq = (JX.ac.eng[0].n + JX.ac.eng[1].n) * 50; p.onOrbit = !!JX.P.tgt.onCircle;
}
function updateJet(dt) {
  if (!JX.ac) jetPlace();
  if (dt > 0) {
    // the model at 100 Hz (a few steps a frame: well under a millisecond)
    JX.acc += dt; let n = 0;
    while (JX.acc >= 0.01 && n < 8) { JX.P.fly(0.01); JX.acc -= 0.01; n++; }
    if (JX.acc > 0.05) JX.acc = 0;
    if (JX.gs) jetGround();
    const gk = JX.gs && JX.gs.st, gi = JX.P.phase === 'inbound'; if (gk !== JX.gk || gi !== JX.gi) { JX.gk = gk; JX.gi = gi; EFB.dirty = true; }
    jetDefendEnd();
    if (!AC.def) jetRun(dt);
  }
  writePlane(dt);
}
/* The F-15's start on the ground at its base (map.json airbase.taxi, traced on the base's picture): the engines
   turning at idle on its stand, the officer's iPad up with the tasking. WILCO: the pilot calls for taxi and the tower
   clears him to runway 18; out of the stand, up the parallel taxiway and the link to the hold short; the takeoff
   clearance, onto the runway at its threshold (2,245 m ahead) and the takeoff; climbing out he turns for the target and
   checks in on station there (jetCheckIn). UNABLE: the jet stays on its stand and the sortie is over. Not the
   training sortie (it begins on station, the pilot talking the officer through it), nor where the map has no base;
   nor when the player has chosen to start on station (the menu's F-15 START, JX.air: localStorage saqr.jstart = air;
   the tests too). */
const jetGroundStart = () => !!(AB && AB.taxi && !JX.air && !(MISSIONS.find(m => m.id === missionId) || {}).train);
const baseNE = ([x, y]) => toNE({ x, y });
// the officer's answer on the iPad, on the stand
function jetTaxi() {
  const g = JX.gs; if (!g || g.st !== 'stand') return;
  g.st = 'call';
  const later = (t, fn) => timers.push({ t, fn: () => { if (JX.gs === g && S.phase === 'play') fn(); } });
  later(3, () => radio('TOWER, SAQR 1-1, READY TO TAXI', 'البرج، صقر 1-1، جاهزين للسحب', 'jetfm', ['f.r.taxi']));
  later(7, () => radio('SAQR 1-1, TAXI RUNWAY 18 VIA ALPHA, HOLD SHORT', 'صقر 1-1، اسحب للمدرج 18 عبر ألفا، وقف قبله', 'twr', ['t.taxi']));
  later(11, () => { radio('RUNWAY 18 VIA ALPHA, HOLD SHORT, SAQR 1-1', 'المدرج 18 عبر ألفا، نوقف قبله، صقر 1-1', 'jetfm', ['f.r.taxirb']);
    g.st = 'taxi'; const o = JX.ac.o; JX.P.set('taxi', { path: [{ n: o.n, e: o.e }, ...AB.taxi.path.map(baseNE)] }); });
}
// lined up on 18's threshold: the takeoff
function jetRoll(g) {
  const tx = AB.taxi, e = baseNE(tx.lineup[tx.lineup.length - 1]);
  g.st = 'takeoff'; JX.P.set('takeoff', { rwy: { n: e.n, e: e.e, psi: Math.PI, elev: GROUND }, h: JX.h, kcas: 350 });
}
/* SKIP on the iPad, once the tasking is answered: the taxi out left out, the jet lined up on 18's threshold at once
   (its engines as they were), the tower's clearance and the readback, and the takeoff. And home: the way back left
   out, the jet on a 5 km final for 18, established on the glide path at its approach speed, gear and flaps down; the
   landing and the taxi in as ever (END SORTIE leaves those out too) */
function jetSkipOut() {
  const g0 = JX.gs; if (!g0 || g0.home || !['call', 'taxi', 'hold', 'lineup'].includes(g0.st)) return;
  const ac = JX.ac, en = ac.eng.map(e => [e.n, e.thr]), e = baseNE(AB.taxi.lineup[AB.taxi.lineup.length - 1]);
  ac.place({ n: e.n, e: e.e, psi: Math.PI, onGround: true, flap: 0 });
  ac.eng.forEach((x, i) => { x.n = en[i][0]; x.thr = en[i][1]; });
  const g = JX.gs = { st: 'lined' }; JX.P.set('direct'); ac.brake = 1; writePlane(0); EFB.dirty = true;
  const later = (t, fn) => timers.push({ t, fn: () => { if (JX.gs === g && S.phase === 'play') fn(); } });
  later(0.5, () => radio('SAQR 1-1, WIND 250 AT 7, RUNWAY 18, CLEARED FOR TAKEOFF', 'صقر 1-1، الرياح 250 بسرعة 7، المدرج 18، مسموح بالإقلاع', 'twr', ['t.clear']));
  later(6, () => radio('CLEARED FOR TAKEOFF, SAQR 1-1', 'مسموح بالإقلاع، صقر 1-1', 'jetfm', ['f.r.clear']));
  later(8.5, () => jetRoll(g));
}
const jetCanSkipHome = () => { const g = JX.gs; return !!(g && g.home && JX.ac && !JX.ac.o.wow && (g.st === 'rtb' || g.st === 'down' || g.st === 'app' && JX.P.phase === 'inbound')); };
function jetSkipHome() {
  if (!jetCanSkipHome()) return;
  const g = JX.gs, r = g.rwy, d = 5000, GS = 2.75 * Math.PI / 180;
  // (at the approach speed for its weight: from 151 knots, slow, the nose came up to 16 degrees and the throttles ran
  // the speed 25 knots past it)
  const at = { n: r.n + d, e: r.e, h: GROUND + Math.tan(GS) * (d + 300), psi: Math.PI, gamma: -GS, gear: 1, flap: 1 };
  JX.ac.place(Object.assign({ V: 78 }, at)); JX.ac.place(Object.assign({ V: JX.P.vApproach(12.5 * Math.PI / 180) }, at));
  g.st = 'app'; g.skip = true; JX.P.set('land', { rwy: r, faf: 5000, aim: 300, len: (AB.runway[2] - AB.runway[1]) * MPP }); writePlane(0); EFB.dirty = true;
}
function jetUnable() {
  const g = JX.gs; if (!g || g.st !== 'stand') return;
  g.st = 'unable';
  timers.push({ t: 3, fn: () => { if (S.phase !== 'play') return; S.unable = true; checkEnd(); } });
}
// the steps on the ground and the climb out, each when the last is done
function jetGround() {
  const g = JX.gs, P = JX.P, tx = AB.taxi, later = (t, fn) => timers.push({ t, fn: () => { if (JX.gs === g && S.phase === 'play') fn(); } });
  if (g.st === 'taxi' && P.tgt.done) {
    g.st = 'hold'; P.set('direct'); JX.ac.brake = 1;
    later(1.5, () => radio('TOWER, SAQR 1-1, HOLDING SHORT RUNWAY 18', 'البرج، صقر 1-1، واقفين قبل المدرج 18', 'jetfm', ['f.r.hold']));
    later(6, () => radio('SAQR 1-1, WIND 250 AT 7, RUNWAY 18, CLEARED FOR TAKEOFF', 'صقر 1-1، الرياح 250 بسرعة 7، المدرج 18، مسموح بالإقلاع', 'twr', ['t.clear']));
    later(10, () => { radio('CLEARED FOR TAKEOFF, SAQR 1-1', 'مسموح بالإقلاع، صقر 1-1', 'jetfm', ['f.r.clear']);
      g.st = 'lineup'; const o = JX.ac.o; P.set('taxi', { path: [{ n: o.n, e: o.e }, ...tx.lineup.map(baseNE)] }); });
  } else if (g.st === 'lineup' && P.tgt.done) jetRoll(g);
  else if (g.st === 'takeoff' && P.phase === 'climb' && plane.alt - GROUND > 300) {
    // gear and flaps up: round for the target, climbing to the orbit
    g.st = 'climb'; jetOrbit(JX.c || { x: W0 / 2, y: H0 / 2 });
    radio('SAQR 1-1, AIRBORNE', 'صقر 1-1، أقلعنا', 'jetfm', ['f.r.airborne']);
  } else if (g.st === 'climb' && Math.abs(plane.alt - JX.h) < 150 && P.tgt.dist < JX.R * 1.5) {
    JX.gs = null; S.stationT = S.missionT; jetCheckIn();
  } else if (g.home) jetHome(g);
}
/* Home after the sortie, when it was flown from the base (JX.base): once the mission is over (its targets down, the
   crew's RTB, bingo fuel, the fight lost) its result stands (checkEnd makes the end card then) and the pilot takes the
   jet home. To a point 11 km out on runway 18's extended centreline and 2 km to the side he comes from (room to be
   lined up, slowed and configured well before the final), at the glide path's height there (some 1,800 ft) and 250
   knots; the call to the tower on the way; from there the intercept and the straight-in down the 2.75° glide
   path from 5 km (the landing in src/f15sa.js: on-speed, the flare, the nose held up as the brake to 100 knots or
   as long as the runway left allows, the wheel brakes), the clearance to land on final; slowed to taxiing, off the runway at the next link on the right, up
   the parallel taxiway and onto the stand; the engines shut down, and then the end card. The runway is 18, the end
   the wind favours (from 250 at 7 knots, WIND: 70° off it, a 2 knot headwind on 18), as for the takeoff. The TIME
   key hurries it; SKIP TO FINAL and END SORTIE on the iPad. On the way home nothing reaches the jet (acHit, no
   missile break: behind our lines, as on its way out: JX.gs), no new phase or pop-up starts, nor are Hunter or Ops
   heard (the tower's net); once the card is up the flow stops. */
// the point 11 km out: at the glide path's own height there (2.75°, its aim 300 m in: some 540 m; at 3,000 ft he had
// to dive for it from the point and landed hard and long). (From 9 km at 300 knots he reached the final approach fix
// at 210 knots, and slowed on the glide path itself)
const HOME_H = Math.tan(2.75 * Math.PI / 180) * 11300;
const jetHomeOk = () => !!(JET && JX.base && AB && AB.taxi.links && !AC.downed && !S.unable && JX.ac && !JX.ac.o.wow);
function jetHomeStart(show) {
  if (JX.run) jetAbort(false); JX.ask = null; AC.def = null;
  const rw = AB.runway, thr = toNE({ x: rw[0], y: rw[1] }), side = JX.ac.o.e < thr.e ? -1 : 1;
  const g = JX.gs = { st: 'rtb', home: true, show, rwy: { n: thr.n, e: thr.e, psi: Math.PI, elev: GROUND } };
  plane.mode = 'home'; plane.oc = plane.hp = null;
  g.entry = { n: thr.n + 11000, e: thr.e + side * 2000 };
  JX.P.set('nav', { point: g.entry, h: GROUND + HOME_H, kcas: 250 }, { bank: 45 * Math.PI / 180, roll: 30 * Math.PI / 180, nz: 3, vs: 25, nzMin: 0.75 });
  const later = (t, fn) => timers.push({ t, fn: () => { if (JX.gs === g && S.phase === 'play') fn(); } });
  if (!S.rtbCall && !S.bingo) later(1.5, () => radio('COPY, RETURNING TO BASE', 'علم، راجعين للقاعدة', 'jet', ['f.rtb']));
  later(8, () => !g.skip && radio('TOWER, SAQR 1-1, INBOUND FOR FULL STOP', 'البرج، صقر 1-1، راجعين للهبوط', 'jetfm', ['f.r.inbound']));
  later(12, () => !g.skip && radio('SAQR 1-1, STRAIGHT-IN RUNWAY 18, REPORT FINAL', 'صقر 1-1، اقتراب مباشر للمدرج 18، أبلغ على النهائي', 'twr', ['t.inbound']));
  g.later = later;
}
function jetHome(g) {
  if (S.phase !== 'play') return;
  const P = JX.P, o = JX.ac.o, later = g.later;
  // still high at the point (from 25,000 ft it is more than the way home allows at 5,000 ft a minute): round it, down
  // to the point's height
  if (g.st === 'rtb' && P.tgt.dist < 2500 && o.h - GROUND > HOME_H + 250) { g.st = 'down'; P.set('orbit', { c: g.entry, R: 3000, dir: JX.dir, h: GROUND + HOME_H, kcas: 250 }); }
  // (down: back to the point, and in from it as from straight in. Handed to the landing on the circle's southbound
  // leg, 3 to 6 km off the centreline, he landed 3 to 5 km down the 2.2 km runway)
  else if (g.st === 'down' && o.h - GROUND < HOME_H + 150) { g.st = 'rtb'; P.set('nav', { point: g.entry, h: GROUND + HOME_H, kcas: 250 }); }
  else if (g.st === 'rtb' && P.tgt.dist < 2500) {
    g.st = 'app'; P.set('land', { rwy: g.rwy, faf: 5000, aim: 300, len: (AB.runway[2] - AB.runway[1]) * MPP });
  } else if (g.st === 'app') {
    if (P.phase === 'final' && !g.fin) {
      g.fin = true;
      radio('TOWER, SAQR 1-1, FINAL RUNWAY 18', 'البرج، صقر 1-1، على النهائي للمدرج 18', 'jetfm', ['f.r.final']);
      later(4, () => radio('SAQR 1-1, WIND 250 AT 7, RUNWAY 18, CLEARED TO LAND', 'صقر 1-1، الرياح 250 بسرعة 7، المدرج 18، مسموح بالهبوط', 'twr', ['t.land']));
      later(8.5, () => radio('CLEARED TO LAND, SAQR 1-1', 'مسموح بالهبوط، صقر 1-1', 'jetfm', ['f.r.land']));
    }
    if ((P.phase === 'brake' || P.phase === 'derotate') && o.gs < 30 * 0.5144 && !g.park) {
      g.park = true;
      radio('SAQR 1-1, TURN RIGHT NEXT TAXIWAY, TAXI TO PARKING VIA ALPHA', 'صقر 1-1، انعطف يمين عند أول ممر، واسحب للموقف عبر ألفا', 'twr', ['t.park']);
      later(5, () => radio('RIGHT NEXT TAXIWAY, PARKING VIA ALPHA, SAQR 1-1', 'يمين عند أول ممر، للموقف عبر ألفا، صقر 1-1', 'jetfm', ['f.r.park']));
    }
    // slowed to taxiing (or stopped): off the runway at the next link ahead on the right (60 m on at least, to slow
    // and turn in), across to the parallel taxiway, up it to the stand. Past the last one: turned about on the runway
    // (to the right, round a 12 m circle), back up it and off at that link to the left
    if (P.phase === 'stopped' || P.phase === 'brake' && o.gs < 9) {
      const tx = AB.taxi, rx = AB.runway[0], m = 1 / MPP, ahead = tx.links.filter(y => y > plane.y + 60 * m), here = { x: plane.x, y: plane.y };
      let yl, path;
      if (ahead.length) { yl = ahead[0]; path = [here, { x: rx, y: yl - 35 * m }, { x: rx - 22 * m, y: yl }]; }
      else {
        const R = 12 * m, cx = rx - R; yl = tx.links[tx.links.length - 1];
        path = [here, ...[30, 60, 90, 120, 150, 180].map(a => ({ x: cx + R * Math.cos(a * Math.PI / 180), y: plane.y + R * Math.sin(a * Math.PI / 180) })),
          { x: rx - 2 * R, y: Math.min(plane.y - 10 * m, yl + 25 * m) }, { x: rx - 2 * R - 18 * m, y: yl }];
      }
      path.push({ x: tx.hold, y: yl }, { x: tx.twy + 22 * m, y: yl }, { x: tx.twy, y: yl - 22 * m }, ...tx.park.map(([x, y]) => ({ x, y })));
      g.st = 'taxiin'; JX.ac.flapCmd = 0; JX.ac.brake = 0; P.set('taxi', { path: path.map(toNE) });
    }
  } else if (g.st === 'taxiin' && P.tgt.done) {
    // on the stand: the engines run down, and the card
    g.st = 'parked'; JX.ac.brake = 1; for (const e of JX.ac.eng) e.on = false;
    later(6, () => jetHomeEnd());
  }
}
// the sortie's end card, the jet home (or the officer has had enough: END SORTIE on the iPad)
function jetHomeEnd() { const g = JX.gs; if (!g || !g.home || !g.show) return; const f = g.show; g.show = null; f(); }
/* The F-15's air base (map.json airbase, tools/make_airbase.py: the owner's picture of the whole base): its own patch
   of ground 5.4 km east of the battle, on a plain levelled for it in the region's zoom-out. Afar a 512 x 768 copy
   (3.2 m a pixel: from the orbit the base is some 250 screen pixels; it was 1024 x 1536, 8 MB held all sortie long);
   its six full-size quarters (0.8 m) once the jet is within 6 km of it and under 2,000 m, let go past 7 km or 2,300 m
   (some 30 MB on the GPU while held). Mipmapped and filtered for the slant. */
const AB = JET ? MAP.airbase || null : null;
const ABP = (() => {
  if (!AB) return null;
  const [x0, y0, w, h] = AB.rect, aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const mesh = (t, x, y, ww, hh, order) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(ww, hh), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthTest: false, depthWrite: false }));
    m.position.set(x + ww / 2, -(y + hh / 2), 0); m.renderOrder = order; sceneA.add(m); return m; };
  const far = texM(MAP.dir + 'tiles/airbase/far.webp'); far.anisotropy = aniso;
  return { far, farM: mesh(far, x0, y0, w, h, -0.45), near: null, mesh, aniso, x0, y0, w, h };
})();
function abUpdate() {
  if (!ABP) return;
  const d = Math.hypot(plane.x - ABP.x0 - ABP.w / 2, plane.y - ABP.y0 - ABP.h / 2) * MPP, h = plane.alt - GROUND;
  const near = ABP.near ? d < 7000 && h < 2300 : d < 6000 && h < 2000;
  if (near && !ABP.near) {
    ABP.near = []; ABP.nearMB = 0;   // (what they hold on the GPU, mipmaps and all: the map tiles' budget, updateTiles)
    for (let ty = 0; ty < 3; ty++) for (let tx = 0; tx < 2; tx++) {
      const t = loader.load(MAP.dir + 'tiles/airbase/' + tx + '_' + ty + '.webp', t => { if (ABP.near) ABP.nearMB += t.image.width * t.image.height * 4 * 4 / 3 / 1048576; });
      t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = ABP.aniso;
      const q = ABP.w / 2; ABP.near.push(ABP.mesh(t, ABP.x0 + tx * q, ABP.y0 + ty * q, q, q, -0.44));
    }
  } else if (!near && ABP.near) {
    for (const m of ABP.near) { sceneA.remove(m); m.material.map.dispose(); m.material.dispose(); m.geometry.dispose(); }
    ABP.near = null;
  }
}
/* The base from the ground (the F-15's taxi out and takeoff), over its picture, which is all the air sees of it:
   upright panels of the owner's pictures (sprites/ground3d, tools/make_ground3d.py) where map.json airbase.dress puts
   them, at their real sizes. Turned to the eye each frame: the parked F-15s (each in the one of its eight pictures
   nearest the side it is seen from, 28 px a metre: the side 19.4 m long), the tower, the hangar, the fire station,
   the operations buildings, the fuel truck and the tug. Standing as they are: the sunshades' sides and ends (8.5 m),
   the shelters' doors, sides and backs, the perimeter fence, T-walls between the shelters, the runway's edge lights
   every 60 m, the hold-short signs, and the desert's bushes and trees where the picture shows them, the standing
   ones in a few merged meshes.
   Only below 300 m over the ground within 6 km of it; above or away, nothing is drawn. */
// (built the first time it is needed, not at the start: nothing of it is loaded for a sortie begun in the air)
let DRESS = null;
const T3C = new Map();
function dressBuild() {
  const d = AB && AB.dress; if (!d) return null;
  const g = new THREE.Group(); g.visible = false; sceneA.add(g);
  const M = m => m * PXM, ord = 35, T3 = n => T3C.get(n) || T3C.set(n, texM('sprites/ground3d/' + n + '.webp')).get(n);
  // (their edges blended, not cut: soft as the pictures have them; the nearly clear left out, so what is behind shows)
  const mat = t => new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.08, side: THREE.DoubleSide });
  // the standing panels of one picture, merged into one mesh: each from (x0, y0) to (x1, y1) map px, h metres high,
  // the picture repeated every `rep` metres along it (0: once)
  const merged = (t, walls) => {
    const P = [], U = [], I = [];
    for (const [x0, y0, x1, y1, h, rep] of walls) {
      const L = Math.hypot(x1 - x0, y1 - y0), r = rep ? L * MPP / rep : 1, k = P.length / 3;
      P.push(x0, -y0, 0, x1, -y1, 0, x1, -y1, M(h), x0, -y0, M(h)); U.push(0, 0, r, 0, r, 1, 0, 1); I.push(k, k + 1, k + 2, k, k + 2, k + 3);
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); geo.setIndex(I);
    const m = new THREE.Mesh(geo, mat(t)); m.renderOrder = ord; g.add(m); return m;
  };
  const rep = t => { t.wrapS = THREE.RepeatWrapping; return t; };
  // a standing thing seen alike from all round (a bush, a tree, a light): two crossed panels, w x h metres
  const cross = (x, y, w, h) => { const a = M(w) / 2; return [[x - a, y, x + a, y, h, 0], [x, y - a, x, y + a, h, 0]]; };
  // the sunshades: the long sides in the side picture (three bays, about 37 m), the ends in the end picture
  const sides = [], ends = [];
  for (const [x0, y0, x1, y1] of d.shades) { sides.push([x0, y0, x0, y1, 8.5, 36.7], [x1, y0, x1, y1, 8.5, 36.7]); ends.push([x0, y0, x1, y0, 8.5, 0], [x0, y1, x1, y1, 8.5, 0]); }
  merged(rep(T3('sunshade_side')), sides); merged(T3('sunshade_end'), ends);
  // the shelters: the door's face east, its back the same, the sides in the side picture (45 m long); T-walls between
  const HW = 27, HL = 45, doors = [], hs = [], tw = [];
  for (const [x, y] of d.has) {
    const a = M(HW) / 2, b = M(HL);
    doors.push([x, y - a, x, y + a, HW * 231 / 512, 0], [x - b, y - a, x - b, y + a, HW * 231 / 512, 0]);
    hs.push([x - b, y - a, x, y - a, HL * 84 / 407, 0], [x - b, y + a, x, y + a, HL * 84 / 407, 0]);
  }
  for (let i = 0; i + 1 < d.has.length; i++) { const [x, y] = d.has[i], ym = (y + d.has[i + 1][1]) / 2; tw.push([x - M(4), ym - M(3.7), x - M(4), ym + M(3.7), 3.6, 0]); }
  merged(T3('has_front'), doors); merged(T3('has_side'), hs); merged(T3('twalls'), tw);
  // the perimeter fence: 3 m, the picture every 6.4 m
  { const [x0, y0, x1, y1] = d.fence; merged(rep(T3('fence')), [[x0, y0, x1, y0, 3, 6.4], [x1, y0, x1, y1, 3, 6.4], [x1, y1, x0, y1, 3, 6.4], [x0, y1, x0, y0, 3, 6.4]]); }
  // the runway's edge lights every 60 m, both sides; the hold-short signs by each link, facing the way in
  { const [ex0, ex1, ey0, ey1] = d.edge, L = []; for (let y = ey0; y <= ey1; y += M(60)) for (const x of [ex0, ex1]) L.push(...cross(x, y, 0.45, 0.6)); merged(T3('light_edge'), L); }
  merged(T3('sign_taxi'), d.holds.map(([x, y]) => [x, y - M(18), x, y - M(18) - M(1.8), 1.2, 0]));
  // the desert's bushes and trees, each where the picture shows one (map.json airbase.dress.flora, from the picture:
  // none on the paving or by it), as wide as its crown there (the blob less its shadow), a tree's crown up high
  { const B = [], A = [];
    for (const [x, y, across, tree] of d.flora || []) { const w = Math.max(0.8, across * 0.8); if (tree) A.push(...cross(x, y, w, w * 0.9)); else B.push(...cross(x, y, w, Math.max(0.6, w * 0.75))); }
    merged(T3('bush'), B); merged(T3('acacia'), A); }
  // turned to the eye: the parked jets (eight pictures), and the base's buildings and vehicles (one each)
  const views = [0, 45, 90, 135, 180, 225, 270, 315].map(a => mat(T3('f15_' + pad(a, 3))));
  const board = (x, y, m, wm, hm) => { const b = new THREE.Mesh(new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0).rotateX(Math.PI / 2), m);
    b.position.set(x, -y, 0); b.renderOrder = ord; if (wm) b.scale.set(M(wm), 1, M(hm)); g.add(b); return b; };
  const jets = d.jets.map(([x, y, h]) => ({ m: board(x, y, views[0]), x, y, h: h * Math.PI / 180, k: -1 }));
  const one = (n, x, y, wm, hm) => ({ m: board(x, y, mat(T3(n)), wm, hm), x, y });
  const boards = [one('tower', d.tower[0], d.tower[1], 7.4, 25), one('hangar_front', d.hangar[0], d.hangar[1], 75, 23.5), one('fire_front', d.fire[0], d.fire[1], 25, 12.7),
    ...d.ops.map(([x, y], i) => { const o = one('ops_side', x, y, 60, 14.4); if (i % 2) o.m.scale.x *= -1; return o; }),   // (every other one mirrored: not four alike)
    one('tanker', d.shades[1][2] + M(55), d.shades[1][1] + M(70), 10, 3.4), one('tug', d.shades[1][2] + M(50), d.shades[1][1] + M(190), 5, 1.5)];
  return { g, jets, views, boards };
}
function baseDressUpdate() {
  abUpdate();
  if (!AB || !AB.dress) return;
  const [x0, y0, w, h] = AB.rect;
  const on = plane.alt - GROUND < 300 && CK.t < 1 && Math.hypot(plane.x - x0 - w / 2, plane.y - y0 - h / 2) * MPP < 6000;
  if (on && !DRESS) DRESS = dressBuild();
  if (!DRESS) return;
  DRESS.g.visible = on; if (!on) return;
  const e = wcam.position, turn = o => { o.m.rotation.z = Math.atan2(e.x - o.x, -(e.y + o.y)); };
  for (const j of DRESS.jets) {
    // where the eye is from the jet, clockwise from its nose; the picture for that side, the panel turned to the eye
    const b = Math.atan2(e.x - j.x, e.y + j.y), rel = ((j.h - b) % 6.2832 + 6.2832) % 6.2832, k = Math.round(rel / 0.7854) % 8;
    if (k !== j.k) { const im = DRESS.views[k].map.image; j.k = im && im.width ? k : -1; j.m.material = DRESS.views[k]; j.m.scale.set((im && im.width || 400) / 28 * PXM, 1, 192 / 28 * PXM); }
    turn(j);
  }
  for (const o of DRESS.boards) turn(o);
}
function planeGround() { return { x: plane.x, y: plane.y }; }
function slantRange() { const p = planeGround(); const h = Math.hypot(p.x - S.aim.x, p.y - S.aim.y) * MPP; return Math.hypot(h, plane.alt - 410); }

