/* ===================== air defence: the interceptors, the launchers, the close-in gun ===================== */
// The battery's weapons (docs/AIR_DEFENSE.md), on the air picture of 07c-adsim.js: each threat to the system made
// for it (the code turns the wrong one down), integrated fire control (any of the radars' tracks guides any of the
// interceptors: one picture). An engagement is planned at the press: the earliest launch whose intercept falls
// inside the weapon's envelope, and it waits for it (a ballistic missile at 300 km is not met at once); its rounds
// one after another (shoot-shoot two, a launcher's few seconds apart). The intercept a game's reckoning, not a guidance
// law: each interceptor flown along its way to the plan's meeting point, there at the plan's time; the point kept on
// the track's latest radar data while it flies (none while the track coasts: it then flies on to its last aim, and
// misses); there, the kill by the weapon's chance against that class. Shoot-look-shoot looks at the
// outcome and fires once more; on automatic a missed ballistic missile is handed down to the lower tier (a leaker).
// The close-in gun on its own: automatic inside its reach on hostile drones and cruise missiles, a second's burst
// (75 rounds), its self-destructing rounds' flight, then the next. Nothing made in a step: the interceptors a fixed
// pool, an engagement made only at a press or a hand-down.

// the interceptors: top speed (m/s) reached at the end of its boost (s), longest flight (s), the gap between two of a
// salvo (s); its envelope by class: the intercept's distance from the battery and its height, [min, max, min, max] (m);
// its chance to kill at its pass
const ADW = {
  UPR: { v: 2800, tb: 15, tmax: 110, gap: 3, env: { TBM: [0, 200e3, 40e3, 150e3] }, pk: { TBM: 0.9 } },
  HTK: { v: 1700, tb: 6, tmax: 60, gap: 2, env: { TBM: [0, 35e3, 15e3, 36e3], CM: [2e3, 40e3, 20, 20e3], ACFT: [2e3, 40e3, 20, 20e3] }, pk: { TBM: 0.85, CM: 0.9, ACFT: 0.9 } },
  FRG: { v: 1500, tb: 12, tmax: 180, gap: 2, env: { CM: [3e3, 100e3, 20, 20e3], ACFT: [3e3, 160e3, 20, 24e3] }, pk: { CM: 0.75, ACFT: 0.85 } },
};
const ADW_AR = { UPR: 'صاروخ الطبقة العليا', HTK: 'صاروخ اعتراض بالاصطدام', FRG: 'صاروخ اعتراض بالتشظي' };
// the close-in gun: its reach (m), its rounds a burst (a second of 4,500 a minute)
const ADW_GUN_R = 2000, ADW_GUN_N = 75;
// (each: where it is and its velocity (for the air picture's course line), the meeting point it flies to, its age and
// its time of flight (s))
const ADW_MS = Array.from({ length: 16 }, () => ({ on: false, k: '', w: null, e: null, tr: null, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, ax: 0, ay: 0, az: 0, age: 0, tof: 0, dTot: 1, fresh: false }));
// the results, kept so the operator sees what was hit and what got through: each one's mark on the air picture (where,
// its track number, a kill or an impact on the base) and its row under the track table's live ones, some eight seconds;
// six kept, the oldest taken (ADW_RES_T: how long one shows)
const ADW_KX = Array.from({ length: 6 }, () => ({ x: 0, y: 0, t: -1e9, lbl: '', id: '', cls: '', imp: false }));
const ADW_RES_T = 8;
// the hooked track's end seen in the tracking camera (07b adcCam): a kill's flash, or its impact on the base
// (the field opened at the kill to some 45 m across, so the burst and its debris are seen whole; the target's picture and
// what killed it kept for the burst's drawing, 07b adcBoom)
function adwCamResult(tr, imp, how) { const K = AD.camKill, o = tr.th, F = adcFov(tr.x, tr.y, tr.z, adcKind(o)); K.f = F >= ADC_FOV.w ? F : Math.min(ADC_FOV.w, Math.max(F, 45 / (Math.hypot(tr.x, tr.y, tr.z) || 1)));
  K.how = how || ''; K.seed = tr.tn % 997; K.k = ADC_LAST.tn === tr.tn ? ADC_LAST.k : -1; K.rot = ADC_LAST.rot; K.flip = ADC_LAST.flip; K.fx = ADC_LAST.fx; K.dx = ADC_LAST.dx; K.dy = ADC_LAST.dy; K.vs = ADC_LAST.tn === tr.tn ? ADC_LAST.vs : 0; AD.camNext = tr; K.t = ADS.t; K.lbl = tr.lbl; K.cls = tr.cls; K.kc = adcKind(o); K.imp = imp; K.x = o.x; K.y = o.y; K.z = o.z; adcDirty('B'); }
function adwMark(o, lbl, id, cls, imp) {
  let k = ADW_KX[0]; for (const q of ADW_KX) if (q.t < k.t) k = q;
  k.x = o.x; k.y = o.y; k.t = ADS.t; k.lbl = lbl; k.id = id; k.cls = cls; k.imp = imp; adcDirty('A'); adcDirty('C');
}
// a free one of the pool, or null
function adwFree() { for (const m of ADW_MS) if (!m.on) return m; return null; }

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
function adwOk(w, tr, tl, tof) {
  const e = w.env[tr.cls]; if (!e) return 0;
  const t = tof === undefined ? adwTof(w, tr, tl) : tof; if (!t) return 0;
  const P = adwAt(tr, tl + t), r = Math.hypot(P.x, P.y, P.z);
  return r >= e[0] && r <= e[1] && P.z >= e[2] && P.z <= e[3] ? t : 0;
}
// the earliest launch from t0 that does, within the next four minutes (in two-second steps), or 0
// (one it cannot catch while it opens from the battery: no later launch will either)
function adwFirst(w, tr, t0) {
  const opening = tr.sx * tr.vx + tr.sy * tr.vy >= 0;
  for (let tl = t0; tl < t0 + 240; tl += 2) { const t = adwTof(w, tr, tl); if (!t && opening) return 0; if (adwOk(w, tr, tl, t)) return tl; }
  return 0;
}
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
  else if (tr.eng) adaSay('SYS', 'TN ' + tr.lbl + ' ALREADY ENGAGED', 'الهدف ' + tr.lbl + ' قيد الاشتباك', false, ['a.engaged']);
  else adwEngage(tr);
}
// the weapon an engage would give it now (the camera's status line): 'GUN', the first missile with rounds and a
// solution, 'NOSOL' when none has one, or '' when the system knob would turn it down (as adwEngage); worked out once a
// second a track (or at once when the knob is turned), not at each drawing
function adwPick(tr) {
  if (tr.pickS === AD.sys && tr.pickN === ADS.nL && ADS.t - tr.pickT < 1) return tr.pick;
  tr.pickS = AD.sys; tr.pickN = ADS.nL; tr.pickT = ADS.t;   // (afresh after any launch: a launcher may be empty now)
  const sys = ADA_SYS[AD.sys], c = tr.cls;
  if (sys === 'CRAM' || (sys === 'AUTO' && c === 'UAV')) return tr.pick = c === 'UAV' || c === 'CM' ? 'GUN' : '';
  if ((sys === 'UPR' && c !== 'TBM') || (sys === 'LWR' && c === 'UAV')) return tr.pick = '';
  const ws = sys === 'UPR' ? ADW_UP : c === 'TBM' ? (sys === 'AUTO' ? ADW_TB : ADW_HT) : ADW_LO;
  for (const k of ws) if (adwLeft(k) && ADW[k].env[c] && adwFirst(ADW[k], tr, ADS.t + 2)) return tr.pick = k;
  return tr.pick = 'NOSOL';
}
const ADW_UP = ['UPR'], ADW_TB = ['UPR', 'HTK'], ADW_HT = ['HTK'], ADW_LO = ['FRG', 'HTK'];
// the system knob's choice, the wrong one turned down: the upper tier ballistic only, the lower not on drones (the
// gun's, and the fighter's), the gun drones and cruise missiles only; automatic, each to its own (a ballistic one to
// the upper tier first, the lower behind it)
function adwEngage(tr) {
  const sys = ADA_SYS[AD.sys], c = tr.cls;
  if (sys === 'CRAM' || (sys === 'AUTO' && c === 'UAV')) {
    if (c !== 'UAV' && c !== 'CM') return adwDeny('CLOSE-IN GUN: DRONES AND CRUISE MISSILES ONLY', 'المدفع القريب للمسيّرات وصواريخ الكروز فقط', 'a.w.gun');
    tr.gun = true; adsChanged();
    adaSay('SYS', 'TN ' + tr.lbl + ' ASSIGNED TO CLOSE-IN GUN', 'الهدف ' + tr.lbl + ' أُسند للمدفع القريب', false, ['a.togun']);
    return;
  }
  if (sys === 'UPR' && c !== 'TBM') return adwDeny('UPPER TIER: BALLISTIC TARGETS ONLY', 'الطبقة العليا للصواريخ الباليستية فقط', 'a.w.upr');
  if (sys === 'LWR' && c === 'UAV') return adwDeny('LOWER TIER: NOT FOR DRONES', 'الطبقة السفلى ليست للمسيّرات؛ المسيّرات للمدفع القريب', 'a.w.lwr');
  adwPlan(tr, sys === 'UPR' ? ADW_UP : c === 'TBM' ? (sys === 'AUTO' ? ADW_TB : ADW_HT) : ADW_LO, true, 0);
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
    if (s > 5) adaSay('SYS', 'TN ' + tr.lbl + lt + ' LAUNCH IN ' + s + ' S', la + 'الإطلاق بعد ' + s + ' ث', !press, [...lk, 'a.planned'], 1);
    else if (press) adaSay('SYS', 'TN ' + tr.lbl + ' LOCKED, ENGAGING', la + 'جارٍ الاشتباك', false, ['a.locked', 'a.engaging']);
    return true;
  }
  // (the assist leaves it out a while only after the operator's own press found nothing to fire: no solution, or no
  // interceptors left)
  if (press) tr.noSol = ADS.t;
  if (rounds) adaSay('SYS', 'TN ' + tr.lbl + ' NO INTERCEPT SOLUTION', 'لا يوجد حل اعتراض للهدف ' + tr.lbl, !press, ['a.nosol'], 1);
  else adaSay('SYS', 'NO INTERCEPTORS REMAINING', 'لا توجد صواريخ اعتراض متبقية', !press, ['a.noammo'], 1);
  return false;
}

/* ---- the step ---- */
function adwStep(dt) {
  for (let i = ADS.eng.length - 1; i >= 0; i--) {
    const e = ADS.eng[i], tr = e.tr;
    // (its target gone: killed, landed on the base, or dropped from the picture; its rounds in the air let go)
    if (tr.gone || !tr.th.alive) { if (!e.fly) adwEnd(e); continue; }
    // (its launch time come with master arm safe or hold fire on: said once, heavy, so the operator knows it waits on him)
    const why = !AD.armed ? 'safe' : AD.hold ? 'hold' : ''; if (!why) e.held = false;   // (released: a later hold is said afresh)
    if (e.n && ADS.t >= e.at && why && e.held !== why) { e.held = why; const h = why === 'hold';
      adsSay('SYS', 'TN ' + tr.lbl + ' LAUNCH HELD, ' + (h ? 'HOLD FIRE' : 'MASTER ARM SAFE'), 'الإطلاق على الهدف ' + tr.lbl + ' معلّق: ' + (h ? 'إيقاف الرمي مفعّل' : 'التسليح موقوف'), [h ? 'a.holdin' : 'a.armsafe'], 2); }
    if (e.n && ADS.t >= e.at && AD.armed && !AD.hold) {
      const w = ADW[e.k], L = adwLauncher(e.k), m = L && adwFree();
      if (!L) e.n = 0;                                                   // (its launchers empty)
      else if (tr.cst || !m) e.at = ADS.t + 0.5;                          // (no radar data, or no channel free: it waits)
      else { const t = adwOk(w, tr, ADS.t); if (t) { adwFire(e, L, m, t); e.n--; e.at = ADS.t + w.gap; } else { const tl = adwFirst(w, tr, ADS.t + 1); if (tl) e.at = tl; else e.n = 0; } }
    }
    if (!e.n && !e.fly) adwEnd(e);
  }
  // (a step of no time, as a tick's first or a press's own drawing, moves none of them)
  if (dt > 0) for (const m of ADW_MS) { if (m.on) adwFly(m, dt); } else for (const m of ADW_MS) m.fresh = false;
}
// (its meeting point and time the plan's: t s on, where the track will be then)
function adwFire(e, L, m, t) {
  L.left--; e.fly++; e.shots++; ADS.fly++; ADS.nL++; e.held = false;   // (a later round held again is said again)
  const P = adwAt(e.tr, ADS.t + t);
  m.on = true; m.k = e.k; m.w = ADW[e.k]; m.e = e; m.tr = e.tr; m.x = m.y = 0; m.z = 8; m.vx = m.vy = m.vz = 0;
  m.ax = P.x; m.ay = P.y; m.az = P.z; m.age = 0; m.tof = t; m.dTot = adwDist(m.w, t) || 1; m.fresh = true;
  adwSnd('launch', e.k); adcDirty('D'); adcDirty('C'); adoLaunch(e.k, P.x, P.y, P.z);
  // (said once an engagement, at its first round, and heavy: it is heard, not lost behind the new tracks)
  if (e.shots === 1) adsSay('SYS', 'TN ' + e.tr.lbl + '  ' + e.k + ' AWAY', 'أُطلق ' + ADW_AR[e.k] + ' نحو الهدف ' + e.tr.lbl, ['a.away'], 2);
}
// an engagement over: killed, or its rounds spent: a look and once more (shoot-look-shoot), the next tier (a leaker),
// or left for the operator (the engage lit again)
function adwEnd(e) {
  const i = ADS.eng.indexOf(e); if (i >= 0) ADS.eng.splice(i, 1);
  const tr = e.tr; if (tr.eng === e) tr.eng = null;
  if (tr.gone || !tr.th.alive) return;
  // (its rounds missed: said now, as heavy as a splash so the two keep the order they came in; the track's lighter lines
  // still waiting let go)
  if (e.miss) { tr.missAt = ADS.t; adaForget(tr.lbl); adsSay('SYS', 'TN ' + tr.lbl + ' MISS', 'الصاروخ أخطأ الهدف ' + tr.lbl, ['a.miss'], 2); }
  if (e.look && e.shots && adwPlan(tr, [e.k, ...e.ws], false, e.again + 1)) return;
  // (handed down without a press only as automatic does it: a ballistic one, the upper tier's leaker, to the lower)
  if (e.ws.length && tr.cls === 'TBM' && ADA_SYS[AD.sys] === 'AUTO') {
    if (e.shots) adsSay('SYS', 'LEAKER, LEAKER. TN ' + tr.lbl, 'الهدف ' + tr.lbl + ' اخترق الطبقة العليا', ['a.leaker'], 2);
    if (adwPlan(tr, e.ws, false, e.again)) return;
  }
  adsChanged();
}
// an interceptor's step, the game's reckoning: along the straight way from the battery to its meeting point, as far
// as its boost's speed has taken it (adwDist: there at the plan's time); the point moved with the track's latest radar
// data (a cruise missile past its dog-leg, a ballistic one on its arc), left where it was while the track coasts or is
// gone. At its time: no data, a miss; else the kill by the weapon's chance there
function adwFly(m, dt) {
  const w = m.w, tr = m.tr, o = tr.th, blind = tr.cst || tr.gone;
  if (!o.alive) { adwGone(m); return; }
  // (not aged in the step it was fired in: there at its time, not a step early)
  if (m.fresh) { m.fresh = false; return; }
  m.age += dt;
  if (!blind) { const P = adwAt(tr, ADS.t - m.age + m.tof); m.ax = P.x; m.ay = P.y; m.az = P.z; }
  const f = Math.min(1, adwDist(w, Math.min(m.age, m.tof)) / m.dTot), x = m.ax * f, y = m.ay * f, z = 8 + (m.az - 8) * f;
  if (dt > 0) { m.vx = (x - m.x) / dt; m.vy = (y - m.y) / dt; m.vz = (z - m.z) / dt; }
  m.x = x; m.y = y; m.z = z;
  if (m.age < m.tof) return;
  if (!blind && Math.random() < (w.pk[tr.cls] || 0)) { const k = m.k; adwGone(m); adwKill(tr, false, k); return; }
  // (a miss called at the engagement's end (adwEnd), once its rounds are all through, as a crew calls the result: not
  // "miss" before the other's splash or launch)
  m.e.miss = true; adwGone(m);
}
// an engagement in the track table: 'I 12' its first round's seconds to the intercept, 'L 34' to its launch
function adwStatus(e) {
  if (!e.fly) return !e.n ? 'ENG' : !AD.armed ? 'SAFE' : AD.hold ? 'HOLD' : 'L ' + Math.max(0, Math.round(e.at - ADS.t));
  let s = 1e9; for (const m of ADW_MS) if (m.on && m.e === e && m.tof - m.age < s) s = m.tof - m.age;
  return 'I ' + Math.max(0, Math.round(s));
}
function adwGone(m) { m.on = false; ADS.fly--; if (m.e) m.e.fly--; m.e = m.tr = null; adcDirty('D'); }
// a threat killed: let go of the picture, its engagement's other rounds destroyed in the air, a near one's blast heard
// through the shelter's walls (at the speed of sound)
function adwKill(tr, gun, k) {
  const o = tr.th, r = Math.hypot(o.x, o.y, o.z); o.alive = false; ADS.kills++; if (!gun) ADS.mKills++;
  for (const m of ADW_MS) if (m.on && m.tr === tr) adwGone(m);
  if (tr.eng) adwEnd(tr.eng);
  // (the hooked one: its kill seen in the tracking camera, where the tracker held it)
  if (AD.hook === tr) adwCamResult(tr, false, gun ? 'gun' : k);
  adsLetGo(tr); adsChanged();
  adwMark(o, tr.lbl, tr.id, tr.cls, false); adoKill(o);
  if (r < (AD.outOn ? 12000 : 6000)) adwSnd('blast', r, r / 340);
  adaForget(tr.lbl);
  adsSay('SYS', 'TN ' + tr.lbl + ' SPLASH' + (gun ? ', GUN KILL' : ''), 'تم تدمير الهدف ' + tr.lbl + (gun ? ' بالمدفع القريب' : ''), ['a.splash'], 2);
}
// the close-in gun: on its own, inside its reach, on the nearest hostile drone or cruise missile (one given to it
// first); a burst, then its rounds' flight (about a second a kilometre), then the kill by its chance (better on a slow
// drone, and nearer), and the next. (its rounds self-destruct: none falls on the base)
function adwGun(dt) {
  const G = ADS.gun; G.t -= dt; if (G.t > 0) return;
  if (G.tr) {
    const tr = G.tr; G.tr = null; G.t = 0.2;
    // (a burst's chance: a slow drone's high and best close in; a cruise missile's lower)
    if (!tr.gone && tr.th.alive && Math.random() < (tr.cls === 'UAV' ? 0.9 : 0.6) - (tr.cls === 'UAV' ? 0.25 : 0.25) * G.r / ADW_GUN_R) adwKill(tr, true);
    return;
  }
  if (!AD.cram || !AD.armed || AD.hold || AD.cramRds <= 0) return;
  // (a suspect drone inside 3 km: the gun waits on the operator's word, said once)
  for (const tr of ADS.tr) if (tr.id === 'SUS' && tr.cls === 'UAV' && !tr.susSaid && Math.hypot(tr.th.x, tr.th.y) < 3000) { tr.susSaid = true;
    adsSay('SYS', 'TN ' + tr.lbl + ' SUSPECT DRONE INSIDE 3 KM, CONFIRM HOSTILE FOR THE GUN', 'الهدف ' + tr.lbl + ' مسيّرة مشتبهة داخل 3 كم: أكّدها معادية ليرميها المدفع', ['a.track', 'a.i.SUS', 'a.c.UAV'], 2); }
  let best = null, bd = Infinity;
  for (const tr of ADS.tr) {
    if (tr.id !== 'HOS' || tr.cst || !tr.th.alive || (tr.cls !== 'UAV' && tr.cls !== 'CM')) continue;
    const o = tr.th, r = Math.hypot(o.x, o.y, o.z), s = r - (tr.gun ? 1000 : 0);
    if (r < ADW_GUN_R && s < bd) { bd = s; best = tr; }
  }
  if (!best) return;
  const n = Math.min(AD.cramRds, ADW_GUN_N), o = best.th;
  AD.cramRds -= n; G.tr = best; G.r = Math.hypot(o.x, o.y, o.z); G.t = n / ADW_GUN_N + G.r / 1000; adcDirty('D');
  adwSnd('gun', n / ADW_GUN_N);
  if (G.said !== best) { G.said = best; adsSay('SYS', 'TN ' + best.lbl + ' CLOSE-IN GUN ENGAGING', 'المدفع القريب يشتبك مع الهدف ' + best.lbl, ['a.guneng'], 1); }
  if (AD.cramRds <= 0) adsSay('SYS', 'CLOSE-IN GUN WINCHESTER', 'نفدت ذخيرة المدفع القريب', ['a.gunout'], 1);
}
// The battery's world heard through the shelter's walls, low and dull: an interceptor's launch (its roar rising, then
// going), the close-in gun's burst (d s; its 75 rounds a second the buzz in it), a near blast (dly s after the kill:
// its sound's way to the shelter). Made live from the sound's noise, a few nodes each, let go at their end
function adwSnd(kind, d, dly) {
  // (not with the sound suspended, as by an interruption on the phone: made then, all of them had started at once on its return)
  const S = Snd; if (!S.on || S.idle || !S.ctx || S.ctx.state !== 'running') return;
  const c = S.ctx, t0 = c.currentTime + (dly || 0), s = c.createBufferSource(); s.buffer = S.noise; s.loop = true;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; const g = c.createGain(); g.gain.value = 0;
  s.connect(f); f.connect(g);
  let end, out = g;
  // (watching the outside camera: its own microphone, the battery heard as it is out there: a launch's crack and roar
  // close by (the upper tier's a far rumble, its sound some seconds on its way), the gun's ripping burst, a near kill's
  // boom; in the shelter all of it low and dull through the walls)
  const outside = AD.outOn, far = kind === 'blast' ? Math.min(1, 1500 / Math.max(1, d)) : 1;
  if (kind === 'launch' && outside && d === 'UPR') {
    const t1 = t0 + 8; end = t1 + 5; s.lead = 8; f.frequency.setValueAtTime(260, t1); f.frequency.exponentialRampToValueAtTime(90, end);
    g.gain.setValueAtTime(0.0001, t1); g.gain.exponentialRampToValueAtTime(0.16, t1 + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, end);
  } else if (kind === 'launch' && outside) {
    end = t0 + 5.5; f.frequency.setValueAtTime(5000, t0); f.frequency.exponentialRampToValueAtTime(1400, t0 + 0.5); f.frequency.exponentialRampToValueAtTime(260, end);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.55, t0 + 0.03); g.gain.exponentialRampToValueAtTime(0.3, t0 + 0.6); g.gain.exponentialRampToValueAtTime(0.0001, end);
  } else if (kind === 'launch') {
    end = t0 + 4; f.frequency.setValueAtTime(160, t0); f.frequency.linearRampToValueAtTime(420, t0 + 0.4); f.frequency.exponentialRampToValueAtTime(140, end);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.25); g.gain.exponentialRampToValueAtTime(0.0001, end);
  } else if (kind === 'gun') {
    // (the buzz: after the envelope, a gain swung between nothing and full at the rounds' rate by a square wave, so it
    // fades with the burst)
    const gv = outside ? 0.24 : 0.11; end = t0 + d + 0.15; f.frequency.value = outside ? 1800 : 650; f.Q.value = 0.7;
    g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(gv, t0 + 0.03); g.gain.setValueAtTime(gv, t0 + d); g.gain.linearRampToValueAtTime(0.0001, end);
    const am = c.createGain(), o = c.createOscillator(), og = c.createGain(); am.gain.value = 0.5; o.type = 'square'; o.frequency.value = 75; og.gain.value = 0.5;
    o.connect(og); og.connect(am.gain); g.connect(am); o.start(t0); o.stop(end + 0.05); out = am;
  } else {
    // (fainter and duller the farther it is)
    const f0 = (outside ? 1100 : 260) * Math.min(1, 3000 / Math.max(1, d)); end = t0 + (outside ? 3 : 1.8); f.frequency.setValueAtTime(Math.max(80, f0), t0); f.frequency.exponentialRampToValueAtTime(50, end);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(Math.max(0.001, (outside ? 0.55 : 0.3) * far), t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, end);
  }
  // (the outside camera's sounds through its own bus, let fall silent the moment the view is closed: a far kill's boom
  // still on its way, or the upper tier's rumble, not then heard loud in the shelter)
  out.connect(outside ? adoBus(c) : S.dry); s.start(t0 + (s.lead || 0), Math.random() * 2); s.stop(end + 0.05);
}
let adoBusN = null;
function adoBus(c) {
  if (!adoBusN || adoBusN.context !== c) { adoBusN = c.createGain(); adoBusN.connect(Snd.dry); }
  return adoBusN;
}
// (opened: the bus up again at once, for what is heard from now on)
function adoBusOn() { if (Snd.ctx) { const b = adoBus(Snd.ctx), t = Snd.ctx.currentTime; b.gain.cancelScheduledValues(t); b.gain.setValueAtTime(1, t); } }
function adoBusOff() { if (adoBusN && Snd.ctx && adoBusN.context === Snd.ctx) { const t = Snd.ctx.currentTime; adoBusN.gain.cancelScheduledValues(t); adoBusN.gain.setTargetAtTime(0, t, 0.05); }
}
function adwReset() { for (const q of ADW_KX) q.t = -1e9; ADS.eng.length = 0; ADS.fly = 0; ADS.nL = 0; ADS.kills = 0; ADS.mKills = 0; for (const m of ADW_MS) { m.on = false; m.e = m.tr = null; } Object.assign(ADS.gun, { t: 0, tr: null, r: 0, said: null }); }
