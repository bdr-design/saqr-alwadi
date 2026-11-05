/* ===================== air defence: the interceptors, the launchers, the close-in gun ===================== */
// The battery's weapons (docs/AIR_DEFENSE.md), on the air picture of 07c-adsim.js: each threat to the system made
// for it (the code turns the wrong one down), integrated fire control (any of the radars' tracks guides any of the
// interceptors: one picture). An engagement is planned at the press: the earliest launch whose intercept falls
// inside the weapon's envelope, and it waits for it (a ballistic missile at 300 km is not met at once); its rounds
// one after another (shoot-shoot two, a launcher's few seconds apart); each interceptor guided to where the track will
// be when it gets there, from the radar's data (none while the track coasts: it then flies on to its last aim, and
// misses); the kill at its closest pass, by the weapon's chance against that class. Shoot-look-shoot looks at the
// outcome and fires once more; on automatic a missed ballistic missile is handed down to the lower tier (a leaker).
// The close-in gun on its own: automatic inside its reach on hostile drones and cruise missiles, a second's burst
// (75 rounds), its self-destructing rounds' flight, then the next. Nothing made in a step: the interceptors a fixed
// pool, an engagement made only at a press or a hand-down.

// the interceptors: top speed (m/s) reached at the end of its boost (s), longest flight (s), the gap between two of a
// salvo (s); its envelope by class: the intercept's distance from the battery and its height, [min, max, min, max] (m);
// its chance to kill at its pass
const ADW = {
  UPR: { v: 2800, tb: 15, tmax: 110, gap: 3, env: { TBM: [0, 200e3, 40e3, 150e3] }, pk: { TBM: 0.9 } },
  MSE: { v: 1700, tb: 6, tmax: 60, gap: 2, env: { TBM: [0, 35e3, 15e3, 36e3], CM: [2e3, 40e3, 20, 20e3], ACFT: [2e3, 40e3, 20, 20e3] }, pk: { TBM: 0.85, CM: 0.9, ACFT: 0.9 } },
  GEM: { v: 1500, tb: 12, tmax: 180, gap: 2, env: { CM: [3e3, 100e3, 20, 20e3], ACFT: [3e3, 160e3, 20, 24e3] }, pk: { CM: 0.75, ACFT: 0.85 } },
};
const ADW_AR = { UPR: 'صاروخ الطبقة العليا', MSE: 'صاروخ اعتراض بالاصطدام', GEM: 'صاروخ اعتراض بالتشظي' };
// the close-in gun: its reach (m), its rounds a burst (a second of 4,500 a minute)
const ADW_GUN_R = 2000, ADW_GUN_N = 75;
const ADW_MS = Array.from({ length: 16 }, () => ({ on: false, k: '', w: null, e: null, tr: null, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0, age: 0, tau: 0 }));

// the distance an interceptor has flown at t s: from 15 % of its top speed at launch up to it, evenly, by the end of
// its boost's most (then on at it)
function adwDist(w, t) { const tb = w.tb * 0.85; return w.v * (t < tb ? 0.15 * t + t * t / (2 * w.tb) : 0.15 * tb + tb * tb / (2 * w.tb) + t - tb); }
// where a track will be at the sortie's time T, from the radar's last data (a ballistic one on its arc), into ADW_P
const ADW_P = { x: 0, y: 0, z: 0 };
function adwAt(tr, T) {
  const s = T - tr.seen, P = ADW_P;
  P.x = tr.sx + tr.vx * s; P.y = tr.sy + tr.vy * s; P.z = Math.max(0, tr.sz + tr.vz * s - (tr.cls === 'TBM' ? G0 * s * s / 2 : 0)); return P;
}
// the time of flight to meet the track from a launch at tl (s), or 0 when it cannot catch it within its flight
function adwTof(w, tr, tl) {
  for (let t = 1; t <= w.tmax; t++) {
    const P = adwAt(tr, tl + t);
    if (Math.hypot(P.x, P.y, P.z) > adwDist(w, t)) continue;
    let lo = t - 1, hi = t;
    for (let k = 0; k < 10; k++) { const m = (lo + hi) / 2, Q = adwAt(tr, tl + m); if (Math.hypot(Q.x, Q.y, Q.z) > adwDist(w, m)) lo = m; else hi = m; }
    return hi;
  }
  return 0;
}
// a launch at tl meets the track inside the weapon's envelope: its time of flight, or 0
function adwOk(w, tr, tl) {
  const e = w.env[tr.cls]; if (!e) return 0;
  const t = adwTof(w, tr, tl); if (!t) return 0;
  const P = adwAt(tr, tl + t), r = Math.hypot(P.x, P.y, P.z);
  return r >= e[0] && r <= e[1] && P.z >= e[2] && P.z <= e[3] ? t : 0;
}
// the earliest launch from t0 that does, within the next four minutes (in two-second steps), or 0
function adwFirst(w, tr, t0) { for (let tl = t0; tl < t0 + 240; tl += 2) if (adwOk(w, tr, tl)) return tl; return 0; }
const adwLeft = k => { let n = 0; for (const L of AD.lnch) if (L.k === k) n += L.left; return n; };
// (a salvo's rounds from the launcher of that kind with the most left)
function adwLauncher(k) { let b = null; for (const L of AD.lnch) if (L.k === k && L.left && (!b || L.left > b.left)) b = L; return b; }

/* ---- the operator's engage ---- */
const adwDeny = (en, ar, say) => adaSay('SYS', en, ar, false, [say]);
function adsEngage() {
  const tr = AD.hook;
  if (!AD.armed) adaSay('SYS', 'MASTER ARM SAFE', 'التسليح موقوف', false, ['a.armsafe']);
  else if (AD.hold) adaSay('SYS', 'HOLD FIRE IN EFFECT', 'إيقاف الرمي مفعّل', false, ['a.holdin']);
  else if (!tr) adaSay('SYS', 'NO TRACK HOOKED', 'لا يوجد هدف محدد', false, ['a.notrack']);
  else if (tr.id !== 'HOS') adaSay('SYS', 'TN ' + tr.lbl + ' NOT HOSTILE, ENGAGE DENIED', 'الهدف ' + tr.lbl + ' غير معادٍ، الرمي مرفوض', false, ['a.denied']);
  else if (tr.eng) adaSay('SYS', 'TN ' + tr.lbl + ' ALREADY ENGAGED', 'الهدف ' + tr.lbl + ' عليه اشتباك', false, ['a.engaged']);
  else adwEngage(tr);
}
// the system knob's choice, the wrong one turned down: the upper tier ballistic only, the lower not on drones (the
// gun's, and the fighter's), the gun drones and cruise missiles only; automatic, each to its own (a ballistic one to
// the upper tier first, the lower behind it)
function adwEngage(tr) {
  const sys = ADA_SYS[AD.sys], c = tr.cls;
  if (sys === 'CRAM' || (sys === 'AUTO' && c === 'UAV')) {
    if (c !== 'UAV' && c !== 'CM') return adwDeny('CLOSE-IN GUN: DRONES AND CRUISE MISSILES ONLY', 'المدفع القريب للمسيّرات والكروز فقط', 'a.w.gun');
    tr.gun = true; adsChanged();
    adaSay('SYS', 'TN ' + tr.lbl + ' ASSIGNED TO CLOSE-IN GUN', 'الهدف ' + tr.lbl + ' أُسند للمدفع القريب', false, ['a.togun']);
    return;
  }
  if (sys === 'UPR' && c !== 'TBM') return adwDeny('UPPER TIER: BALLISTIC TARGETS ONLY', 'الطبقة العليا للصواريخ الباليستية فقط', 'a.w.upr');
  if (sys === 'LWR' && c === 'UAV') return adwDeny('LOWER TIER: NOT FOR DRONES', 'الطبقة السفلى ليست للمسيّرات: المدفع القريب لها', 'a.w.lwr');
  adwPlan(tr, sys === 'UPR' ? ['UPR'] : c === 'TBM' ? (sys === 'AUTO' ? ['UPR', 'MSE'] : ['MSE']) : ['GEM', 'MSE'], true, 0);
}
// an engagement planned on the first of the weapons with rounds and a solution: its launch time, its rounds (the
// doctrine's: one, two, or one and a look); the rest kept to hand down to. False when none can
function adwPlan(tr, ws, press, again) {
  let rounds = false;
  for (let i = 0; i < ws.length; i++) {
    const k = ws[i], w = ADW[k]; if (!adwLeft(k)) continue; rounds = true;
    const tl = adwFirst(w, tr, ADS.t + 2); if (!tl) continue;
    const e = { tr, k, ws: ws.slice(i + 1), n: AD.doc === 1 ? 2 : 1, at: tl, fly: 0, shots: 0, look: AD.doc === 2 && !again, again };
    tr.eng = e; ADS.eng.push(e); adsChanged();
    // (at the press the fire-control radar locked on it first: said so, then the plan)
    const s = Math.round(tl - ADS.t), lk = press ? ['a.locked'] : [], lt = press ? ' LOCKED,' : '', la = (press ? 'تم الإقفال على الهدف ' : 'خطة اشتباك على الهدف ') + tr.lbl + '، ';
    if (s > 5) adaSay('SYS', 'TN ' + tr.lbl + lt + ' LAUNCH IN ' + s + ' S', la + 'الإطلاق بعد ' + s + ' ث', !press, [...lk, 'a.planned']);
    else if (press) adaSay('SYS', 'TN ' + tr.lbl + ' LOCKED, ENGAGING', la + 'اشتباك', false, ['a.locked', 'a.engaging']);
    return true;
  }
  if (rounds) adaSay('SYS', 'TN ' + tr.lbl + ' NO INTERCEPT SOLUTION', 'لا يوجد حل اعتراض للهدف ' + tr.lbl, !press, ['a.nosol']);
  else adaSay('SYS', 'NO INTERCEPTORS REMAINING', 'لا توجد صواريخ اعتراض متبقية', !press, ['a.noammo']);
  return false;
}

/* ---- the step ---- */
function adwStep(dt) {
  for (let i = ADS.eng.length - 1; i >= 0; i--) {
    const e = ADS.eng[i], tr = e.tr;
    // (its target gone: killed, landed on the base, or dropped from the picture; its rounds in the air let go)
    if (tr.gone || !tr.th.alive) { if (!e.fly) adwEnd(e); continue; }
    if (e.n && ADS.t >= e.at && AD.armed && !AD.hold) {
      const w = ADW[e.k], L = adwLauncher(e.k), m = L && ADW_MS.find(q => !q.on);
      if (!L) e.n = 0;                                                   // (its launchers empty)
      else if (tr.cst || !m) e.at = ADS.t + 0.5;                          // (no radar data, or no channel free: it waits)
      else { const t = adwOk(w, tr, ADS.t); if (t) { adwFire(e, L, m, t); e.n--; e.at = ADS.t + w.gap; } else { const tl = adwFirst(w, tr, ADS.t + 1); if (tl) e.at = tl; else e.n = 0; } }
    }
    if (!e.n && !e.fly) adwEnd(e);
  }
  for (const m of ADW_MS) if (m.on) adwFly(m, dt);
}
function adwFire(e, L, m, t) {
  L.left--; e.fly++; e.shots++; ADS.fly++;
  Object.assign(m, { on: true, k: e.k, w: ADW[e.k], e, tr: e.tr, x: 0, y: 0, z: 8, vx: 0, vy: 0, vz: 0, age: 0, tau: t });
  const P = adwAt(e.tr, ADS.t + t); m.ax = P.x; m.ay = P.y; m.az = P.z;
  Snd.shelter('launch'); adcDirty('D'); adcDirty('C');
  adsSay('SYS', 'TN ' + e.tr.lbl + '  ' + e.k + ' AWAY', 'انطلق ' + ADW_AR[e.k] + ' على الهدف ' + e.tr.lbl, ['a.away']);
}
// an engagement over: killed, or its rounds spent: a look and once more (shoot-look-shoot), the next tier (a leaker),
// or left for the operator (the engage lit again)
function adwEnd(e) {
  const i = ADS.eng.indexOf(e); if (i >= 0) ADS.eng.splice(i, 1);
  const tr = e.tr; if (tr.eng === e) tr.eng = null;
  if (tr.gone || !tr.th.alive) return;
  if (e.look && e.shots && adwPlan(tr, [e.k, ...e.ws], false, e.again + 1)) return;
  if (e.ws.length) {
    if (tr.cls === 'TBM' && e.shots) adsSay('SYS', 'LEAKER, LEAKER. TN ' + tr.lbl, 'الهدف ' + tr.lbl + ' عبر الطبقة العليا', ['a.leaker']);
    if (adwPlan(tr, e.ws, false, e.again)) return;
  }
  adsChanged();
}
// an interceptor's step: guided to where the track will be when it gets there (from the radar's data; with the track
// coasting or gone, on to its last aim), its speed its boost's; its pass on the threat itself found in the step (the
// two closest on their straight steps), the kill there by its chance; spent at the end of its flight
function adwFly(m, dt) {
  const w = m.w, tr = m.tr, o = tr.th, blind = tr.cst || tr.gone;
  if (!o.alive) { adwGone(m); return; }
  m.age += dt;
  if (!blind) {
    let tau = Math.max(0.5, m.tau - dt);
    for (let k = 0; k < 4; k++) {
      const P = adwAt(tr, ADS.t + tau), d = Math.hypot(P.x - m.x, P.y - m.y, P.z - m.z), fl = adwDist(w, m.age + tau) - adwDist(w, m.age);
      tau = Math.max(0.25, tau * d / (fl || 1));
    }
    const P = adwAt(tr, ADS.t + tau); m.tau = tau; m.ax = P.x; m.ay = P.y; m.az = P.z;
  }
  const v = w.v * Math.min(1, 0.15 + m.age / w.tb), dx = m.ax - m.x, dy = m.ay - m.y, dz = m.az - m.z, d = Math.hypot(dx, dy, dz) || 1;
  m.vx = dx / d * v; m.vy = dy / d * v; m.vz = dz / d * v;
  // (the pass: the relative motion over the step, the threat's start taken back along its velocity)
  const x0 = m.x - (o.x - o.vx * dt), y0 = m.y - (o.y - o.vy * dt), z0 = m.z - (o.z - o.vz * dt);
  m.x += m.vx * dt; m.y += m.vy * dt; m.z = Math.max(0, m.z + m.vz * dt);
  const rx = (m.x - o.x - x0) / dt, ry = (m.y - o.y - y0) / dt, rz = (m.z - o.z - z0) / dt, rr = rx * rx + ry * ry + rz * rz || 1;
  const tm = Math.max(0, Math.min(dt, -(x0 * rx + y0 * ry + z0 * rz) / rr)), miss = Math.hypot(x0 + rx * tm, y0 + ry * tm, z0 + rz * tm);
  // (past its closest, near it (or with no data: it can do no better): killed within its lethal reach, by its chance;
  // else spent. Far off and opening, as in its slow first seconds behind a crossing one, it flies on, guided)
  if (tm < dt && m.age > 1 && (miss < 2000 || blind)) {
    if (!blind && miss < 50 && Math.random() < (w.pk[tr.cls] || 0)) { adwGone(m); adwKill(tr); return; }
    adwGone(m); adsSay('SYS', 'TN ' + tr.lbl + ' MISS', 'الصاروخ أخطأ الهدف ' + tr.lbl, ['a.miss']); return;
  }
  if (m.age > w.tmax) { adwGone(m); adsSay('SYS', 'TN ' + tr.lbl + ' MISS', 'الصاروخ أخطأ الهدف ' + tr.lbl, ['a.miss']); }
}
function adwGone(m) { m.on = false; ADS.fly--; if (m.e) m.e.fly--; m.e = m.tr = null; adcDirty('D'); }
// a threat killed: let go of the picture, its engagement's other rounds destroyed in the air, a near one's blast heard
// through the shelter's walls (at the speed of sound)
function adwKill(tr, gun) {
  const o = tr.th, r = Math.hypot(o.x, o.y, o.z); o.alive = false; ADS.kills++;
  for (const m of ADW_MS) if (m.on && m.tr === tr) adwGone(m);
  if (tr.eng) adwEnd(tr.eng);
  adsLetGo(tr); adsChanged();
  if (r < 6000) Snd.shelter('blast', 0, r / 340);
  adsSay('SYS', 'TN ' + tr.lbl + ' SPLASH' + (gun ? ', GUN KILL' : ''), 'تم تدمير الهدف ' + tr.lbl + (gun ? ' بالمدفع القريب' : ''), ['a.splash']);
}
// the close-in gun: on its own, inside its reach, on the nearest hostile drone or cruise missile (one given to it
// first); a burst, then its rounds' flight (about a second a kilometre), then the kill by its chance (better on a slow
// drone, and nearer), and the next. (its rounds self-destruct: none falls on the base)
function adwGun(dt) {
  const G = ADS.gun; G.t -= dt; if (G.t > 0) return;
  if (G.tr) {
    const tr = G.tr; G.tr = null; G.t = 0.2;
    if (!tr.gone && tr.th.alive && Math.random() < (tr.cls === 'UAV' ? 0.8 : 0.5) - (tr.cls === 'UAV' ? 0.3 : 0.2) * G.r / ADW_GUN_R) adwKill(tr, true);
    return;
  }
  if (!AD.cram || !AD.armed || AD.hold || AD.cramRds <= 0) return;
  let best = null, bd = Infinity;
  for (const tr of ADS.tr) {
    if (tr.id !== 'HOS' || tr.cst || (tr.cls !== 'UAV' && tr.cls !== 'CM')) continue;
    const o = tr.th, r = Math.hypot(o.x, o.y, o.z), s = r - (tr.gun ? 1000 : 0);
    if (r < ADW_GUN_R && s < bd) { bd = s; best = tr; }
  }
  if (!best) return;
  const n = Math.min(AD.cramRds, ADW_GUN_N), o = best.th;
  AD.cramRds -= n; G.tr = best; G.r = Math.hypot(o.x, o.y, o.z); G.t = n / ADW_GUN_N + G.r / 1000; adcDirty('D');
  Snd.shelter('gun', n / ADW_GUN_N);
  if (G.said !== best) { G.said = best; adsSay('SYS', 'TN ' + best.lbl + ' CLOSE-IN GUN ENGAGING', 'المدفع القريب يشتبك مع الهدف ' + best.lbl, ['a.guneng']); }
  if (AD.cramRds <= 0) adsSay('SYS', 'CLOSE-IN GUN WINCHESTER', 'نفدت ذخيرة المدفع القريب', ['a.gunout']);
}
function adwReset() { ADS.eng.length = 0; ADS.fly = 0; ADS.kills = 0; for (const m of ADW_MS) { m.on = false; m.e = m.tr = null; } Object.assign(ADS.gun, { t: 0, tr: null, r: 0, said: null }); }
