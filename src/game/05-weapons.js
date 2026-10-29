/* ===================== weapons ===================== */
const TOF = { msl: () => slantRange() / 400 + 1.0, rkt: () => slantRange() / 600 + 0.4, gun: () => slantRange() / 700 };
// The loadouts an AH-64E flies, on its four pylons from left outboard to right outboard: M299 Hellfire launchers (four
// rails) and M261 Hydra 70 pods (19 tubes, zoned by warhead). Hellfire: AGM-114R, laser, multi-purpose (sal);
// AGM-114L Longbow, radar, fire and forget (rf). Rockets: M151 HE (he), M255A1 flechette (fl), M257 illumination (il),
// APKWS laser-guided M151 (gd). The gun always has its 1200 rounds.
const LOADOUTS_AH = {
  mix: { ar: 'مختلط', en: 'MIXED', desc: '8 هيلفاير و38 صاروخًا', descEn: '8 Hellfire and 38 rockets', pyl: ['hf', 'rkt', 'rkt', 'hf'], hf: { sal: 4, rf: 4 }, rk: { he: 20, fl: 8, il: 4, gd: 6 } },
  at: { ar: 'ضد الدروع', en: 'ANTI-ARMOR', desc: '16 هيلفاير بلا صواريخ', descEn: '16 Hellfire, no rockets', pyl: ['hf', 'hf', 'hf', 'hf'], hf: { sal: 8, rf: 8 }, rk: { he: 0, fl: 0, il: 0, gd: 0 } },
  cas: { ar: 'إسناد قريب', en: 'CLOSE SUPPORT', desc: '4 هيلفاير و57 صاروخًا', descEn: '4 Hellfire and 57 rockets', pyl: ['rkt', 'rkt', 'rkt', 'hf'], hf: { sal: 4, rf: 0 }, rk: { he: 31, fl: 14, il: 4, gd: 8 } },
};
// The F-15SA's: laser-guided bombs (GBU-12 500 lb, GBU-10 2,000 lb), JDAM (GBU-38 500 lb) and the AGM-65 Maverick,
// with the Sniper pod and two AIM-9X always on (src/f15sa.js STORES: their weights and drag go into the flight model).
// Close support carries two Mavericks on the wing pylons, which its bombs leave free, for what moves too fast for a
// bomb's half minute of fall
const LOADOUTS_J = {
  cas: { ar: 'إسناد قريب', en: 'CLOSE SUPPORT', desc: '4 قنابل ليزر GBU-12 وقنبلتا JDAM وصاروخا مافريك', descEn: '4 GBU-12 laser bombs, 2 JDAMs and 2 Mavericks', n: { lgb: 4, jdam: 2, agm: 2 }, t: { lgb: 'GBU-12', jdam: 'GBU-38', agm: 'AGM-65' } },
  strike: { ar: 'ضربة', en: 'STRIKE', desc: 'قنبلتا ليزر GBU-10 الثقيلة و4 قنابل JDAM', descEn: '2 heavy GBU-10 laser bombs and 4 JDAMs', n: { lgb: 2, jdam: 4, agm: 0 }, t: { lgb: 'GBU-10', jdam: 'GBU-38', agm: 'AGM-65' } },
  standoff: { ar: 'من بعيد', en: 'STAND-OFF', desc: '4 صواريخ مافريك وقنبلتا ليزر', descEn: '4 Mavericks and 2 laser bombs', n: { lgb: 2, jdam: 0, agm: 4 }, t: { lgb: 'GBU-12', jdam: 'GBU-38', agm: 'AGM-65' } },
};
const LOADOUTS = JET ? LOADOUTS_J : LOADOUTS_AH;
const JW = ['lgb', 'jdam', 'agm'];
const WN = w => (LOADOUTS[S.load] || LOADOUTS.cas).t[w];
const heavyW = w => /GBU-(10|31)/.test(WN(w));
const HF_T = { sal: ['SAL', 'AGM-114R'], rf: ['RF', 'AGM-114L'] };
const RK_T = { he: ['HE', 'M151'], fl: ['FLC', 'M255A1'], il: ['ILL', 'M257'], gd: ['GDR', 'APKWS'] };
const sumOf = o => Object.values(o).reduce((a, b) => a + b, 0);
function applyLoadout() {
  if (JET) {
    const L = LOADOUTS[S.load] || LOADOUTS.cas;
    S.ammo = Object.assign({}, L.n); S.cool = { lgb: 0, jdam: 0, agm: 0 };
    if (!S.ammo[S.weapon]) S.weapon = JW.find(w => S.ammo[w]) || 'lgb';
    return;
  }
  const L = LOADOUTS[S.load] || LOADOUTS.mix;
  S.hf = Object.assign({}, L.hf); S.rk = Object.assign({}, L.rk);
  S.ammo.msl = sumOf(S.hf); S.ammo.rkt = sumOf(S.rk);
  if (!S.hf[S.hfType]) S.hfType = nextType(S.hf, S.hfType);
  if (!S.rk[S.rkType]) S.rkType = nextType(S.rk, S.rkType);
  if (!S.ammo[S.weapon]) S.weapon = S.ammo.msl ? 'msl' : S.ammo.rkt ? 'rkt' : 'gun';
}
// the next kind with rounds left, after the one given (the WPN page's type keys; and when one runs out)
function nextType(inv, cur) { const ks = Object.keys(inv), i = ks.indexOf(cur); for (let k = 1; k <= ks.length; k++) { const n = ks[(i + k) % ks.length]; if (inv[n] > 0) return n; } return cur; }
// The Longbow fire control radar over the rotor: a ground scan sweeps 90° ahead of the nose out to 8 km in 2.5 s and
// lists the vehicles in it, moving ones first, then by threat and range. The RF Hellfire goes at them: the locked one
// if the radar has it, else the next to shoot (NTS), and after each launch the next comes up. A contact over 30 s
// old is dropped (the target has moved on).
const FCR_RANGE = 8000, FCR_HALF = Math.PI / 4, FCR_SCAN = 2.5, FCR_AGE = 30;
// (pressed again while it sweeps, it stops)
function fcrScan() { if (S.fcrT > 0) { S.fcrT = 0; S.fcrAt = -99; CK.msg = { s: 'FCR STBY', t: 1.4 }; Snd.tone(700, 0.05); return; } S.fcrT = FCR_SCAN; S.fcrAt = S.missionT; CK.msg = { s: 'FCR SCAN', t: FCR_SCAN }; Snd.tone(1100, 0.05); }
function fcrUpdate(dt) {
  if (S.fcrT > 0 && (S.fcrT -= dt) <= 0) {
    const pg = planeGround(), list = [];
    for (const t of targets) {
      if (t.kind !== 'vehicle' || !t.alive || t.escaped || t.dormant) continue;
      const d = Math.hypot(t.x - pg.x, t.y - pg.y) * MPP, a = Math.abs(wrapA(Math.atan2(t.y - pg.y, t.x - pg.x) - plane.nose));
      if (d <= FCR_RANGE && a <= FCR_HALF) list.push({ t, at: S.missionT, mov: t.v > 1 ? 1 : 0, thr: t.aa || t.vk === 'launcher' ? 2 : gunOf(t) ? 1 : 0, d });
    }
    list.sort((a, b) => (b.mov - a.mov) || (b.thr - a.thr) || (a.d - b.d));
    S.fcr = list; for (const c of list) CK.known.add(c.t);
    CK.msg = { s: 'FCR ' + list.length + ' TGT', t: 2 }; Snd.tone(1500, 0.04);
  }
  if (S.fcr.length) S.fcr = S.fcr.filter(c => c.t.alive && !c.t.escaped && S.missionT - c.at < FCR_AGE);
}
const fcrHas = t => S.fcr.some(c => c.t === t);
function rfTarget() { const s = S.sel; if (s && s.alive && fcrHas(s)) return s; const c = S.fcr.find(c => !c.fired); return c ? c.t : null; }
// The laser spot tracker: looks for a spot lased on the code set on the WPN page (HUNTER lases what he talks on,
// code B 1588), slews the sensor onto it and locks there
function lstSearch() {
  const t = targets.find(t => t.lasedT > 0 && t.alive && !t.escaped && t.lasedCode === CK.code);
  if (!t) { CK.msg = { s: 'LST NO SPOT', t: 1.6 }; Snd.tone(260, 0.09); return; }
  lockOn(t, true); CK.msg = { s: 'LST ' + CODES[CK.code], t: 1.6 };
}
// the fire state's Arabic words, in English (the dock's line; the aircraft's displays show its code)
const FS_EN = { 'جاهز': 'Standby', 'غير مسلّح': 'Safe', 'أهداف الرادار انتهت': 'No radar targets left', 'امسح بالرادار FCR': 'Scan with the FCR',
  'حدّد هدفًا': 'Select a target', 'التتبع ضعيف · قرّب': 'Weak track · zoom in', 'هيلفاير في الطريق': 'Hellfire on its way', 'صواريخ في الطريق': 'Rockets on their way',
  'نفدت الذخيرة': 'Winchester', 'إعادة تلقيم': 'Reloading', 'هيلفاير رادار جاهز': 'Radar Hellfire ready', 'هيلفاير ليزر جاهز': 'Laser Hellfire ready', 'مدفع جاهز': 'Gun ready',
  'صواريخ على الهدف': 'Rockets on the target', 'صواريخ على التصويب': 'Rockets on the aim', 'صواريخ مسامير جاهزة': 'Flechettes ready', 'صاروخ إنارة جاهز': 'Illumination ready',
  'صاروخ موجّه جاهز': 'Guided rocket ready', 'في الطريق': 'On its way', 'مافريك جاهز': 'Maverick ready', 'الطيار يبتعد ليدخل': 'Pilot opening out for the run',
  'في ممر الهجوم': 'On the run', 'حدّد هدفًا وثبّت عليه': 'Select a target and lock it', 'الهدف تحت الدخان · انتظر أو JDAM': 'Target under smoke · wait, or JDAM',
  'خطر قريب · استخدم المافريك': 'Danger close · use the Maverick', 'مدنيون قرب الهدف': 'Civilians near the target', 'تحقق من الهدف: ثبّت وكبّر': 'Identify it: lock and zoom in',
  'بانتظار الإذن': 'Awaiting clearance', 'انتظر': 'Wait', 'قنبلة ليزر جاهزة': 'Laser bomb ready', 'JDAM جاهزة': 'JDAM ready', 'الطيار ينتظر موافقتك': 'The pilot needs your consent',
  'خارج المدى · اطلب الممر': 'Out of range · ask for the run' };
function fireState() {
  if (JET) return jetFireState();
  const w = S.weapon, sel = S.sel && S.sel.alive ? S.sel : null, rf = S.hfType === 'rf', rk = S.rkType;
  if (S.phase !== 'play') return { ok: false, ar: 'جاهز', en: 'STANDBY' };
  if (!S.armed) return { ok: false, ar: 'غير مسلّح', en: 'SAFE', warn: true };
  // what the next round needs: a target, and for the laser weapons a medium track (zoom in and hold it)
  const need = () => {
    if (w === 'msl' && rf) return rfTarget() ? null : { ar: S.fcr.length ? 'أهداف الرادار انتهت' : 'امسح بالرادار FCR', en: 'NO FCR TGT' };
    if (w === 'msl' || (w === 'rkt' && rk === 'gd')) {
      if (!sel) return { ar: 'حدّد هدفًا', en: 'NO TGT' };
      if (S.quality < 2) return { ar: 'التتبع ضعيف · قرّب', en: 'TRK WEAK' };
    }
    return null;
  };
  const inflight = projectiles.filter(p => p.type === w && p.tti > 0).sort((a, b) => a.tti - b.tti)[0];
  if (inflight && w !== 'gun') return { ok: S.ammo[w] > 0 && S.cool[w] <= 0 && !need(), ar: w === 'msl' ? 'هيلفاير في الطريق' : 'صواريخ في الطريق', en: 'TTI ' + pad(Math.ceil(inflight.tti), 2) + ' s', live: true };
  if (S.ammo[w] <= 0) return { ok: false, ar: 'نفدت الذخيرة', en: 'WINCHESTER', warn: true };
  const n = need(); if (n) return { ok: false, ar: n.ar, en: n.en, warn: true };
  if (S.cool[w] > 0) return { ok: false, ar: 'إعادة تلقيم', en: 'RELOAD' };
  const label = w === 'msl' ? (rf ? 'هيلفاير رادار جاهز' : 'هيلفاير ليزر جاهز') : w === 'gun' ? 'مدفع جاهز'
    : { he: (sel && S.tracking) ? 'صواريخ على الهدف' : 'صواريخ على التصويب', fl: 'صواريخ مسامير جاهزة', il: 'صاروخ إنارة جاهز', gd: 'صاروخ موجّه جاهز' }[rk];
  return { ok: true, ar: label, en: 'TOF ' + TOF[w]().toFixed(1) + ' s' };
}
function nudge(el) { el.classList.remove('nudge'); void el.offsetWidth; el.classList.add('nudge'); setTimeout(() => el.classList.remove('nudge'), 600); }
function fire() {
  if (JET) { jetFire(); return; }
  const f = fireState();
  if (!f.ok) {
    if (S.phase !== 'play') return;
    nudge($('#dStat')); if (f.en === 'SAFE') nudge($('#btnArm'));
    CK.msg = { s: f.en, t: 1.6 };
    Snd.tone(260, 0.09); return;
  }
  const w = S.weapon;
  if (w === 'msl' && S.hfType === 'sal' && S.sel && S.sel.alive && !S.tracking) lockOn(S.sel, false);
  const sel = S.sel && S.sel.alive && S.tracking ? S.sel : null;
  S.shots++;
  const shot = { hit: false };
  if (w === 'msl') {
    const kind = S.hfType, tg = kind === 'rf' ? rfTarget() : sel;
    S.ammo.msl--; S.hf[kind]--; S.cool.msl = 1.5;
    const tof = TOF.msl();
    projectiles.push({ type: 'msl', seek: kind, target: tg, x: tg.x, y: tg.y, tti: tof, tof, shot, cep: kind === 'rf' ? 1.5 : [7, 7, 2.2, 0.8][S.quality] });
    // fire and forget: the radar missile is on its own, and the sensor moves on to the next to shoot
    if (kind === 'rf') {
      const c = S.fcr.find(c => c.t === tg); if (c) c.fired = true;
      const nx = S.fcr.find(c => !c.fired && c.t.alive);
      if (nx) timers.push({ t: 0.4, fn: () => { if (S.phase === 'play' && nx.t.alive) lockOn(nx.t, true); } });
    }
    if (!S.hf[kind]) S.hfType = nextType(S.hf, kind);
    Snd.launch();
  } else if (w === 'rkt') {
    // Hydra 70: the warhead set on the WPN page. HE and flechette go in the quantity set, aimed at the tracked
    // target's predicted position (or the crosshair); illumination one at a time over the crosshair; APKWS one at a
    // time on the laser
    const wh = S.rkType, one = wh === 'il' || wh === 'gd', n = Math.min(one ? 1 : S.qty, S.rk[wh]);
    S.rk[wh] -= n; S.ammo.rkt -= n; S.cool.rkt = 0.6 + n * 0.12;
    const tof = TOF.rkt();
    const lead = sel && sel.kind === 'vehicle' && wh !== 'il';
    const ax = wh === 'il' ? S.aim.x : sel ? sel.x + (lead ? Math.cos(sel.h) * sel.v * tof * PXM : 0) : S.aim.x;
    const ay = wh === 'il' ? S.aim.y : sel ? sel.y + (lead ? Math.sin(sel.h) * sel.v * tof * PXM : 0) : S.aim.y;
    const cep = wh === 'gd' ? 1 : 6 + slantRange() / 250;
    for (let i = 0; i < n; i++) timers.push({ t: i * 0.12, fn: () => {
      projectiles.push({ type: 'rkt', wh, target: wh === 'gd' ? sel : null, x: ax, y: ay, tti: tof, tof, shot, cep });
      Snd.rocket();
    } });
    if (!S.rk[wh]) S.rkType = nextType(S.rk, wh);
  } else {
    // M230 at 625 rounds a minute, up to the burst limit set on the WPN page
    const n = Math.min(S.burst, S.ammo.gun); S.ammo.gun -= n; S.cool.gun = 0.4 + n * 0.096;
    const tof = TOF.gun();
    for (let i = 0; i < n; i++) timers.push({ t: i * 0.096, fn: () => {
      const tgt = sel && sel.alive ? sel : null;
      const px = tgt ? tgt.x + (tgt.kind === 'vehicle' ? Math.cos(tgt.h) * tgt.v * tof * PXM : 0) : S.aim.x;
      const py = tgt ? tgt.y + (tgt.kind === 'vehicle' ? Math.sin(tgt.h) * tgt.v * tof * PXM : 0) : S.aim.y;
      // the M230's dispersion: about 2.2 mrad (and never under 1.6 m)
      const sd = Math.max(1.6, slantRange() * 0.0022) * PXM;
      projectiles.push({ type: 'gun', target: null, x: px + gauss() * sd, y: py + gauss() * sd, tti: tof, tof, shot });
      Snd.gun();
    } });
  }
  syncUI();
}
function gauss() { return (Math.random() + Math.random() + Math.random() - 1.5) * 1.15; }
/* ===================== the pod's tape ===================== */
// A still of the sensor's picture at each weapon's moments: the release (the jet's bombs), the impact and what it did
// 3.5 s on (the debrief shows 4 s after the last), for the debrief (the real pod records its video; this keeps a frame of each moment). 320 px wide,
// a dozen a sortie at most, each copied from the picture the frame has just drawn: nothing more is drawn for it
const TAPE = [], tapeReq = [], TAPE_MAX = 12;
function tapeMark(en, ar, delay, shot) {
  const f = () => { if ((S.phase === 'play' || S.phase === 'end') && TAPE.length + tapeReq.length < TAPE_MAX) tapeReq.push({ en, ar, t: S.missionT, shot }); };
  if (delay) timers.push({ t: delay, fn: f }); else f();
}
function tapeGrab() {
  const q = tapeReq.shift(), r = CK.t < 1 ? CK.sens : { x: 0, y: 0, w: VW, h: VH }, cv = document.createElement('canvas');
  cv.width = 320; cv.height = Math.round(320 * r.h / r.w);
  try { cv.getContext('2d').drawImage(glCanvas, r.x * PR, r.y * PR, r.w * PR, r.h * PR, 0, 0, cv.width, cv.height); } catch (_) { return; }
  // (the result's caption, now it is known)
  if (q.shot) { q.en = q.shot.hit ? 'HIT' : 'MISS'; q.ar = q.shot.hit ? 'إصابة' : 'لم يُصب'; }
  TAPE.push({ cv, en: q.en, ar: q.ar, t: q.t, ir: S.sensor !== 'eo' });
}
function showTape() {
  const list = $('#eTapeL'); list.replaceChildren(); $('#eTape').hidden = !TAPE.length;
  for (const k of TAPE) {
    const f = document.createElement('figure'), c = document.createElement('figcaption'), b = document.createElement('b');
    b.textContent = pad(Math.floor(k.t / 60), 2) + ':' + pad(Math.floor(k.t % 60), 2) + ' ' + (k.ir ? 'IR' : 'TV');
    const ar = document.createElement('span'); ar.textContent = k.ar; ar.dir = 'rtl';
    c.append(b, ' ' + k.en); if (!EN) c.append(' · ', ar); f.append(k.cv, c);
    f.onclick = () => { try { $('#shotImg').src = k.cv.toDataURL('image/jpeg', 0.92); $('#ovShot').hidden = false; } catch (_) {} };
    list.append(f);
  }
}
// How thick the smoke and dust is over a point, as the pod looks down through it (the sum of the opacity of the puffs
// over it): past about 1 the laser's spot is lost in it. A strike's dust and a burning wreck's smoke cover the
// target for a while, and drift off with the wind
const SMOKE_LOST = 1;
function smokeOver(x, y) {
  let a = 0;
  for (const p of smokeL.parts) {
    const k = p.t / p.life, r = lerp(p.s0, p.s1, layerEase(p, k)) * 0.42, dx = p.x - x, dy = p.y - y;
    if (dx * dx + dy * dy < r * r) a += lerp(p.a0, p.a1, p.fade === 'late' ? Math.max(0, (k - 0.6) / 0.4) : k);
  }
  return a;
}
function updateProjectiles(dt) {
  const pp = planeGround();
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const p = projectiles[i];
    p.tti -= dt;
    if ((p.type === 'msl' && p.seek === 'sal') || p.wh === 'gd' || p.type === 'lgb') {
      // semi-active laser (the Hellfire R, and APKWS): it goes for the spot the TADS lases now (the tracked target,
      // else where the sensor looks). It can still move its impact point about 80 m (the rocket 40) for each second it
      // has left, so a late switch falls short of the new spot; and it lands as tightly as the track is good then
      const lt = S.tracking && S.sel && S.sel.alive && !S.sel.escaped ? S.sel : null, sx = lt ? lt.x : S.aim.x, sy = lt ? lt.y : S.aim.y;
      // the spot under thick smoke: the seeker loses it, and the weapon flies on as it was steered last (a few times a
      // second is enough to know)
      if ((p.smokeT = (p.smokeT || 0) - dt) <= 0) { p.smokeT = 0.25; p.blind = smokeOver(sx, sy) > SMOKE_LOST; if (p.blind) p.wasBlind = true; }
      if (p.blind) p.cep = Math.max(p.cep || 0, p.type === 'lgb' ? 14 : 8);
      else {
        // (a laser-guided bomb: much less agile, but with half a minute of fall it can steer a long way)
        const ex = sx - p.x, ey = sy - p.y, e = Math.hypot(ex, ey), mv = (p.type === 'lgb' ? 2.5 : p.wh === 'gd' ? 40 : 80) * Math.max(p.tti, 0.05) * dt * PXM;
        if (e > 0) { const k = Math.min(1, mv / e); p.x += ex * k; p.y += ey * k; }
        p.cep = p.type === 'lgb' ? (lt ? [12, 9, 3, 1.5][S.quality] : 8) : lt ? (p.wh === 'gd' ? [4, 4, 1.5, 1] : [7, 7, 2.2, 0.8])[S.quality] : 3;
      }
    } else if (p.target && p.target.alive) { p.x = p.target.x; p.y = p.target.y; }   // the radar Hellfire: its own seeker
    const dx = pp.x - p.x, dy = pp.y - p.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
    // terminal phase: the weapon becomes visible for the last instant
    const vis = p.type === 'gun' ? 0.12 : 0.32;
    if (p.tti > 0 && p.tti < vis) {
      const hv = p.type === 'msl' ? 400 : p.type === 'rkt' ? 600 : p.type === 'agm' ? 320 : p.type === 'lgb' || p.type === 'jdam' ? 280 : 650;
      const dist = hv * p.tti * PXM, len = (p.type === 'gun' ? 6 : 9) * PXM;
      const cx = p.x + ux * dist, cy = p.y + uy * dist, rot = Math.atan2(-ux, -uy);
      if (p.type === 'gun') glowE.put(cx, cy, 0.35 * PXM, len, rot, 1, 0.8, 0.5, 0.8, 0);
      else {
        smokeL.put(cx, cy, 0.5 * PXM, len, rot, 0.16, 0.15, 0.14, 0.75, 0);
        // the rocket motor still burns on the way in; the Hellfire's has burnt out
        if (p.type === 'rkt') glowE.put(cx, cy, 0.7 * PXM, len * 0.6, rot, 1, 0.8, 0.5, 0.7, 0);
        else if (S.night) glowE.put(cx, cy, 0.6 * PXM, len * 0.7, rot, 1, 0.85, 0.6, 0.35, 0);
      }
    }
    if (p.tti <= 0) {
      projectiles.splice(i, 1);
      if (p.type === 'msl' || p.type === 'lgb' || p.type === 'jdam' || p.type === 'agm') { tapeMark('IMPACT', 'الوصول', 0.3); tapeMark('', '', 3.5, p.shot || { hit: false }); }
      const a = rand(0, 6.28), r = p.cep ? Math.abs(gauss()) * p.cep * PXM : 0;
      const ix = clamp(p.x + Math.cos(a) * r, 2, W0 - 2), iy = clamp(p.y + Math.sin(a) * r, 2, H0 - 2);
      if (p.type === 'gun') { explode(ix, iy, 0.14, { small: true, noScorch: Math.random() < 0.5 }); damageAt(ix, iy, 'gun', p.shot); }
      else if (p.wh === 'il') { illums.push({ x: p.x, y: p.y, z: 550, t: 0 }); continue; }
      else if (p.wh === 'fl') {
        // the flechettes: the warhead opens short of the target and some 1100 darts strike a long patch of ground
        const ux2 = -ux, uy2 = -uy;
        for (let k = 0; k < 14; k++) { const a2 = rand(-1, 1) * 22, b2 = rand(-1, 1) * 9; explode(ix + (ux2 * a2 - uy2 * b2) * PXM, iy + (uy2 * a2 + ux2 * b2) * PXM, 0.06, { small: true, noScorch: true }); }
        damageAt(ix, iy, 'flc', p.shot);
      }
      else if (p.type === 'lgb' || p.type === 'jdam') { p.ix = ix; p.iy = iy; explode(ix, iy, p.heavy ? 2.4 : 1.7); damageAt(ix, iy, p.heavy ? 'b2000' : 'b500', p.shot); }
      else { explode(ix, iy, p.type === 'rkt' ? 0.55 : p.type === 'agm' ? 1.1 : 1); damageAt(ix, iy, p.type, p.shot); }
      checkEnd();
    }
  }
}

// ---- the F-15SA's attack. A bomb falls on its own from the release (bombFall: a point mass with drag, from the jet's
// height and speed); the laser bomb then steers for the spot the pod lases, the JDAM flies to the coordinates it was
// given at release, the Maverick homes on the target it was locked on. Each has its launch zone (jetLar). Out of it,
// the release key asks the pilot to take the jet in: he does it only with the officer's consent (the owner's
// decision), flies out first if too close, turns in, calls the time to release, and the system releases on the point.
const _bf = new Map();
function bombFall(h, v, heavy) {
  const key = (heavy ? 'H' : 'L') + Math.round(h / 25) + '_' + Math.round(v / 2);
  let r = _bf.get(key); if (r) return r;
  // a 500 lb class bomb with its kit: 277 kg, 0.27 m across, drag coefficient 0.3; a 2,000 lb one: 934 kg, 0.46 m
  const m = heavy ? 934 : 277, A = Math.PI * Math.pow(heavy ? 0.457 : 0.273, 2) / 4, k = 0.5 * 0.3 * A / m, dt = 0.1;
  let x = 0, z = h, vx = v, vz = 0, t = 0;
  while (z > 0 && t < 120) {
    const rho = 1.225 * Math.exp(-(z + GROUND) / 8500), V = Math.hypot(vx, vz);
    vx -= rho * k * V * vx * dt; vz += (G - rho * k * V * vz) * dt; x += vx * dt; z -= vz * dt; t += dt;
  }
  r = { x, t }; if (_bf.size > 400) _bf.clear(); _bf.set(key, r); return r;
}
// the launch zone: a laser bomb within 700 m short and 1 km long of where it would fall, and 700 m either side; a JDAM
// (it glides and steers itself to the coordinates) from about half to one and a half times its fall's range, as far
// as 60° off the track, so it can go from the orbit; a Maverick from 1.5 to 14 km, within 45° of the nose
// The Maverick (AGM-65D/G, an imaging infrared seeker): the seeker locks on a vehicle from some 9 km (slant) and
// the missile is fired with the nose within 45° of the target; the pilot comes off at 3 km to keep clear of it and
// what guards it. From the orbit (5 km out, the target off the wing; 6.6 km slant from 15,000 ft, inside the lock) he
// turns toward it and holds it 35° off the nose: in the zone within seconds, and closing at 0.8 of his speed, some
// 15 s in it before 3 km (pointed straight at it, the nose came on at 3.7 km: six seconds to fire; going out first
// to 9.5 km, the whole run took near two minutes: the owner's «ياخذ وقت طويل جدًا»). Closer than 4 km, he goes out to
// 7 km first.
const JET_AGM = { lock: 9000, turn: 7000, off: 3000, near: 4000, offset: 35 * Math.PI / 180 };
function jetLar(w, tp) {
  const dx = (tp.x - plane.x) * MPP, dy = (tp.y - plane.y) * MPP, d = Math.hypot(dx, dy), off = wrapA(Math.atan2(dy, dx) - plane.track);
  if (w === 'agm') { const sl = Math.hypot(d, plane.alt - GROUND); return { ok: sl < JET_AGM.lock && sl > 1500 && Math.abs(off) < 0.8, d, tof: sl / 320 + 1 }; }
  const v = Math.max(plane.gs / 3.6, 50), b = bombFall(plane.alt - GROUND, v, heavyW(w)), along = d * Math.cos(off), cross = d * Math.sin(off);
  const ok = w === 'jdam' ? d > b.x * 0.45 && d < b.x * 1.6 && Math.abs(off) < 1.05 : along > b.x - 700 && along < b.x + 1000 && Math.abs(cross) < 700 && Math.abs(off) < 0.6;
  return { ok, d, b, along, cross, tr: (along - b.x) / v, tof: b.t };
}
const jetSel = () => S.sel && S.sel.alive && !S.sel.escaped ? S.sel : null;
// Hunter's danger-close rule: no clearance for a bomb this close to our troops (m): a 500 lb bomb's fragments carry
// some hundreds of metres. The Maverick's small warhead is the weapon for what is that close. The nearest friendly
// (m) when inside it, else 0
const JET_DC = { b500: 300, b2000: 500 };
function jetDanger(w, tp) {
  if (w === 'agm' || !tp) return 0;
  let d = 1e9; for (const f of friends) if (f.alive) d = Math.min(d, Math.hypot(f.x - tp.x, f.y - tp.y) * MPP);
  return d < (heavyW(w) ? JET_DC.b2000 : JET_DC.b500) ? d : 0;
}
// Positive identification: the target held tracked in the pod's narrow field (×4 and in) for 3 s; the crew has looked
// at it, not at a shape. No run is offered and no weapon leaves before it. Then the clearance: with ours on the
// ground the pilot reports it and HUNTER clears it hot (or holds it: civilians within the weapon's reach of it); with
// none, it is cleared as identified. Civilians come close afterwards: no release (jetCiv)
const PID_T = 3, PID_ZOOM = 4;
// (m) how near a civilian may be: the Maverick's small warhead, a 500 lb bomb's and a 2,000 lb bomb's fragments
const JET_CIV = { agm: 60, b500: 300, b2000: 500 };
function jetCiv(w, tp) {
  if (!tp) return 0;
  const R = w === 'agm' ? JET_CIV.agm : heavyW(w) ? JET_CIV.b2000 : JET_CIV.b500; let d = 1e9;
  for (const v of vehicles) if (v.civil && v.alive && !v.dormant && !v.escaped && !v.sunk) d = Math.min(d, Math.hypot(v.x - tp.x, v.y - tp.y) * MPP);
  for (const g of groups) if (g.side === 'civ' && g.men.some(m => m.alive)) d = Math.min(d, Math.hypot(g.x - tp.x, g.y - tp.y) * MPP);
  return d < R ? d : 0;
}
// ---- the training sortie (j_train) ----
// The pilot talks the officer through his first attack, a step at a time on the intercom; the key to press next
// pulses on the aircraft's own panel (#trainRing), no words over the view (the pod page's message line shows the key,
// as the pilot's other calls show there). A step waits for what it asks, and is said again after 25 s of nothing.
// A missed bomb: round again from the trigger
const trainRing = $('#trainRing'), TR = { on: false, i: 0, t: 0 };
const tkXY = (g, k) => { const i = TLAB[g].indexOf(k); return i >= 0 ? TKEYS[g][i] : null; };
function mkXY(side, k) {
  if (PAGES.includes(k)) return BTN[side].T[PAGES.indexOf(k)] || null;
  const K = pageKeys(CK.page[side]);
  for (const g of ['B', 'L', 'R']) { const i = (K[g] || []).indexOf(k); if (i >= 0) return BTN[side][g][i] || null; }
  return null;
}
const TRIGGER = { grip: 'R' }, TRACK = { grip: 'L' };
const TRAIN = [
  { k: 'f.t1', en: 'PRESS NEXT', key: () => tkXY('B', 'NEXT'), done: () => !!jetSel(), wait: () => S.missionT > 3 },
  { k: 'f.t2', en: 'PRESS TRK', key: () => TRACK, done: () => S.tracking },
  { k: 'f.t3', en: 'PRESS ZOOM', key: () => tkXY('B', 'ZOOM'), done: () => jetSel() && jetSel().pid },
  { k: 'f.t4', en: 'SMS: A/S', key: () => CK.page.L === 'SMS' ? mkXY('L', 'A/S') : mkXY('L', 'SMS'), done: () => S.armed },
  { k: 'f.t5', en: 'SMS: LGB', key: () => CK.page.L === 'SMS' ? mkXY('L', 'LGB') : mkXY('L', 'SMS'), done: () => S.weapon === 'lgb' },
  { k: 'f.t6', en: 'TRIGGER', key: () => TRIGGER, done: () => !!JX.run },
  { k: 'f.t7', en: 'KEEP IT TRACKED', key: () => null, done: () => JX.fall.length > 0 },
  { k: 'f.t8', en: 'KEEP LASING', key: () => null, done: () => !JX.fall.length && !projectiles.some(p => p.type === 'lgb'), miss: true },
  { k: 'f.t9', en: 'NEXT · TRK · ZOOM', key: () => !jetSel() ? tkXY('B', 'NEXT') : !S.tracking ? TRACK : tkXY('B', 'ZOOM'), done: () => jetSel() && jetSel().pid },
  { k: 'f.t10', en: 'SMS: AGM', key: () => CK.page.L === 'SMS' ? mkXY('L', 'AGM') : mkXY('L', 'SMS'), done: () => S.weapon === 'agm' },
  { k: 'f.t11', en: 'TRIGGER', key: () => TRIGGER, done: () => (JX.run && JX.run.w === 'agm') || projectiles.some(p => p.type === 'agm') },
  { k: 'f.t12', en: 'IN RANGE · TRIGGER', key: () => TRIGGER, done: () => projectiles.some(p => p.type === 'agm'), wait: () => jetSel() && jetLar('agm', jetSel()).ok },
  { k: 'f.t13', en: 'GOOD KILL', key: () => null, done: () => false, wait: () => targets.every(t => !t.alive) },
];
function trainSay(st) { radio(st.en, 'التدريب', 'jet', [st.k]); TR.t = 0; }
function trainUpdate(dt) {
  if (!TR.on || S.phase !== 'play') { trainRing.hidden = true; return; }
  const st = TRAIN[TR.i];
  if (!st) { trainRing.hidden = true; return; }
  // (a step that waits for its moment: said, and shown, only then)
  if (st.wait && !st.wait()) { trainRing.hidden = true; return; }
  if (!TR.said) { TR.said = true; trainSay(st); }
  TR.t += dt; if (TR.t > 25) trainSay(st);
  if (st.done()) {
    // the laser bomb missed: the truck still stands; round again from the trigger
    if (st.miss && jetSel() && jetSel().alive) { TR.i = TRAIN.findIndex(s => s.k === 'f.t6'); radio('MISSED, AGAIN', 'التدريب', 'jet', ['f.tmiss']); TR.said = true; TR.t = 0; return; }
    TR.i++; TR.said = false;
  }
  const k = st.key(), show = k && CK.t < 0.5;
  trainRing.hidden = !show;
  if (show) {
    const g = k.grip ? GRIPS[k.grip] : null, w = g ? g[2] - g[0] : 30, h = g ? g[3] - g[1] : 30, x = g ? g[0] : k[0] - 15, y = g ? g[1] : k[1] - 15;
    trainRing.classList.toggle('grip', !!g);
    setStyle(trainRing, 'left', x + 'px'); setStyle(trainRing, 'top', y + 'px'); setStyle(trainRing, 'width', w + 'px'); setStyle(trainRing, 'height', h + 'px');
  }
}
// ---- the assist («المساعد» in the settings, on unless turned off) ----
// The control the next step needs is cued once the officer has paused on that step for ASSIST_T s (an officer who
// knows the way never sees it), flashing. In the F-15 a real button lights: the iPad's key on the keypad backlit
// amber, a hand controller's button (the left's track, the right's release) ringed in light; a key on the touch
// displays (the pod page's, the SMS page's, the UFC's consent) gets an amber box round its legend, as a display
// boxes an option, the legend as it is; on the iPad its button a ring. The Apache's: the box round the TEDAC key's legend and
// round the grip's FIRE. From the stand on: the tasking's WILCO, a new tasking to read, the pilot's request for the
// run, the attack's controls, the Maverick's release on the run, the track held while a laser bomb falls; nothing
// while the pilot taxies, flies or lands. No words, no arrows; one control at a time, nothing while the training
// sortie leads (it has its own ring). Worked out a quarter of a second at a time, in the seat only: the light one
// element moved when the cue changes, the boxes drawn by the displays' own redraws (AS.cue).
const AS = { t: 0, idle: 0, sig: '', on: false, bt: 0, cue: '' }, ASSIST_T = 4;
// the light on a real button: a keypad key's face backlit, a hand controller's button ringed in light (photo pixels)
const assistLens = $('#assistLens');
function assistAt(cue) {
  if (!JET || !cue) return null;
  if (cue.startsWith('kp:')) { const p = kpXY(cue.slice(3)), w = S.night ? KP.nw : KP.w, h = S.night ? KP.nh : KP.h; return p && [p[0] - w / 2, p[1] - h / 2, w, h, false]; }
  if (cue.startsWith('hc:')) { const b = hcXY(cue[3], cue.slice(5)); return b && [b[0] - b[2] - 1.5, b[1] - b[2] - 1.5, 2 * b[2] + 3, 2 * b[2] + 3, true]; }
  return null;
}
// F-15: the weapon to use on this target: the one chosen if it may go, else the first that may (the Maverick first:
// it may where a bomb may not)
function assistJetW(sel) {
  const may = w => S.ammo[w] > 0 && !jetDanger(w, sel) && !jetCiv(w, sel) && !(w === 'lgb' && smokeOver(sel.x, sel.y) > SMOKE_LOST);
  return may(S.weapon) ? S.weapon : ['agm', 'lgb', 'jdam'].find(may) || null;
}
// the control the next step needs: in the F-15 'kp:<key>' on the keypad, 'hc:<L|R>:<button>' on a hand controller,
// '<L|R>:<key>' on a display, 'efb:<button>' on the iPad; the Apache's 't<row>:<key>' on the TEDAC, 'fire' at the
// grip; null when none is the officer's to press
const tkCue = (g, k) => TLAB[g].includes(k) ? 't' + g + ':' + k : null;
function assistKey() {
  if (S.phase !== 'play' || CK.t >= 0.5 || TR.on || AC.downed) return null;
  const sel = S.sel && S.sel.alive && !S.sel.escaped ? S.sel : null;
  if (JET) {
    // the tasking to answer (on the stand, or a new one in the air): the iPad up (its key on the keypad), then WILCO
    const t = EFB.task;
    if (t && t.state === 'pending') return EFB.up ? 'efb:wilco' : 'kp:EFB';
    // a new checklist for the phase: the iPad up, on it
    if (EFB.chkNew) return !EFB.up ? 'kp:EFB' : EFB.tab !== 'chk' ? 'efb:chk' : null;
    // the master arm safe where the checklist wants it: on the way home, on the ground
    if (S.armed && JX.gs && (JX.gs.home || JX.ac && JX.ac.o.wow)) return CK.page.L === 'SMS' ? 'L:A/S' : 'L:SMS';
    // the pilot taxies, takes off, climbs out, flies home and lands: none of it the officer's to press
    if (JX.gs) return null;
    // a new tasking on the UFC, not yet read: the iPad
    if (EFB.unseen && !EFB.up) return 'kp:EFB';
    // the pilot asks for the run: the consent, on the iPad if it is up, else on the keypad
    if (JX.ask) return EFB.up ? 'efb:runin' : 'ufc:cnsnt';
    // a laser bomb falling: the spot held on the target to the end
    if (JX.fall.length) return JX.fall.some(f => f.p.type === 'lgb') && !S.tracking && sel ? 'hc:L:TRK' : null;
    // on the run the pilot drops the bombs; the Maverick is the officer's to fire, once it is in its zone
    if (JX.run) return JX.run.w === 'agm' && jetFireState().ok ? 'hc:R:FIRE' : null;
    if (!targets.some(t => t.alive && !t.escaped && !t.dormant)) return null;
    if (!sel) return tkCue('B', 'NEXT');
    if (!S.tracking) return 'hc:L:TRK';
    if (!sel.pid) return S.zoom < PID_ZOOM - 0.05 ? tkCue('B', 'ZOOM') : null;   // (else the look: hold it)
    if (!sel.cleared) return null;                                              // (HUNTER's to give)
    const w = assistJetW(sel); if (!w) return null;
    // the master mode and the weapon on the SMS page (the touch display, as the real jet's)
    if (!S.armed || S.weapon !== w) return CK.page.L === 'SMS' ? 'L:' + (!S.armed ? 'A/S' : { lgb: 'LGB', jdam: 'JDAM', agm: 'AGM' }[w]) : 'L:SMS';
    return jetFireState().ok ? 'hc:R:FIRE' : null;
  }
  if (!targets.some(t => t.alive && !t.escaped && !t.dormant)) return null;
  if (!S.armed) return tkCue('T', 'A/S');
  if (S.ammo[S.weapon] <= 0) { const w = ['msl', 'rkt', 'gun'].find(w => S.ammo[w] > 0); return w ? tkCue('T', { msl: 'MSL', rkt: 'RKT', gun: 'GUN' }[w]) : null; }
  if (S.weapon === 'msl' && S.hfType === 'rf') return fireState().ok ? 'fire' : null;   // (the radar's own targets)
  if (!sel) return tkCue('R', 'NEXT');
  if (!S.tracking) return tkCue('R', 'LOCK');
  if ((S.weapon === 'msl' || S.rkType === 'gd') && S.quality < 2 && S.zoom < 4) return tkCue('L', 'NFOV');
  return fireState().ok ? 'fire' : null;
}
// (the flash: reversed 0.5 s of every 0.8, from the moment it shows)
function assistUpdate(dt) {
  if (!S.assist) { AS.on = false; AS.sig = AS.cue = ''; return; }
  AS.t += dt;
  if (AS.t >= 0.25) {
    const k = assistKey() || '';
    if (k !== AS.sig) { AS.sig = k; AS.idle = 0; }
    else if (k) AS.idle += AS.t;
    AS.t = 0;
    const show = !!k && AS.idle >= ASSIST_T;
    if (show && !AS.on) AS.bt = 0;
    AS.on = show;
  }
  AS.bt = (AS.bt + dt) % 0.8;
  const cue = AS.on && AS.bt < 0.5 ? AS.sig : '';
  if (cue !== AS.cue) {
    AS.cue = cue;
    // (the iPad draws only when something on it changes; the button's light is lit and dark with the flash)
    if (AS.sig.startsWith('efb:')) EFB.dirty = true;
    assistLens.classList.toggle('lit', !!cue);
  }
  // the light moved to its button when the step changes, shown while the cue is on
  const at = AS.on ? assistAt(AS.sig) : null;
  if (at) { setStyle(assistLens, 'left', at[0] + 'px'); setStyle(assistLens, 'top', at[1] + 'px'); setStyle(assistLens, 'width', at[2] + 'px'); setStyle(assistLens, 'height', at[3] + 'px'); assistLens.classList.toggle('ring', at[4]); assistLens.classList.toggle('nt', S.night && !at[4]); }
  if (!at !== assistLens.hidden) assistLens.hidden = !at;
}
function jetPid(dt) {
  const t = jetSel();
  // (held by HUNTER for civilians: a look again after 20 s)
  if (!t || t.civHold && S.missionT - t.civHold < 20) return;
  if (!t.pid) {
    if (S.tracking && S.quality >= 2 && S.zoom >= PID_ZOOM - 0.05) { t.pidT = (t.pidT || 0) + dt; if (t.pidT >= PID_T) { t.pid = true; CK.mpdT = 0; jetClear(t); } }
    // held wide a while: the pilot asks for a closer look
    else if (S.tracking && !t.pidAsk && (t.trkT = (t.trkT || 0) + dt) > 6) { t.pidAsk = true; radio("CAN'T CONFIRM IT, ZOOM IN", 'ما أقدر أأكده، كبّر عليه', 'jet', ['f.pid']); }
  }
}
function jetClear(t) {
  if (!friends.some(f => f.alive)) { t.cleared = true; return; }
  radio('SAQR 1-1, TALLY TARGET', 'صقر 1-1، الهدف مرئي', 'jetfm', ['f.r.tally']);
  timers.push({ t: 4, fn: () => {
    if (S.phase !== 'play' || !t.alive) return;
    if (jetCiv(S.weapon, t)) { t.civHold = S.missionT; radio('HUNTER: HOLD, CIVILIANS NEAR THE TARGET', 'هنا هنتر: انتظر، مدنيون قرب الهدف', 'hunter', ['h.j.civ']); t.pid = false; t.pidT = 0; }
    else { t.cleared = true; CK.mpdT = 0; radio('CLEARED HOT', 'مسموح بالإطلاق', 'hunter', ['h.j.hot']); }
  } });
}
function jetFireState() {
  const w = S.weapon;
  if (S.phase !== 'play' || JX.gs) return { ok: false, ar: 'جاهز', en: 'STANDBY' };
  if (!S.armed) return { ok: false, ar: 'غير مسلّح', en: 'SAFE', warn: true };
  const fall = projectiles.filter(p => p.type === w && p.tti > 0).sort((a, b) => a.tti - b.tti)[0];
  if (S.ammo[w] <= 0) return fall ? { ok: false, ar: 'في الطريق', en: 'TOF ' + pad(Math.ceil(fall.tti), 2) + ' s', live: true } : { ok: false, ar: 'نفدت الذخيرة', en: 'WINCHESTER', warn: true };
  if (JX.run && JX.run.w === 'agm' && w === 'agm' && jetSel() && S.tracking && jetLar('agm', jetSel()).ok) return { ok: true, ar: 'مافريك جاهز', en: 'IN RNG  TOF ' + Math.round(jetLar('agm', jetSel()).tof) + ' s' };
  if (JX.run) return { ok: false, ar: JX.run.out ? 'الطيار يبتعد ليدخل' : 'في ممر الهجوم', en: !JX.run.out && JX.run.tr != null ? 'REL ' + pad(Math.max(0, Math.ceil(JX.run.tr)), 2) + ' s' : 'RUN-IN', live: true };
  const sel = jetSel();
  if ((w === 'lgb' || w === 'agm') && !(sel && S.tracking)) return { ok: false, ar: 'حدّد هدفًا وثبّت عليه', en: 'NO TGT', warn: true };
  // (the laser bomb into smoke: it would lose the spot; wait for it to drift off, or the JDAM, which needs none)
  if (w === 'lgb' && smokeOver(sel.x, sel.y) > SMOKE_LOST) return { ok: false, ar: 'الهدف تحت الدخان · انتظر أو JDAM', en: 'OBSCURED', warn: true };
  if (jetDanger(w, sel || S.aim)) return { ok: false, ar: 'خطر قريب · استخدم المافريك', en: 'DANGER CLOSE', warn: true };
  if (jetCiv(w, sel || S.aim)) return { ok: false, ar: 'مدنيون قرب الهدف', en: 'CIVILIANS', warn: true };
  if (sel && !sel.pid) return { ok: false, ar: 'تحقق من الهدف: ثبّت وكبّر', en: 'NO PID', warn: true };
  if (sel && !sel.cleared) return { ok: false, ar: 'بانتظار الإذن', en: 'CLEARANCE', live: true };
  if (S.cool[w] > 0) return { ok: false, ar: 'انتظر', en: 'WAIT' };
  const lar = jetLar(w, sel || S.aim);
  if (lar.ok) return { ok: true, ar: { lgb: 'قنبلة ليزر جاهزة', jdam: 'JDAM جاهزة', agm: 'مافريك جاهز' }[w], en: 'IN RNG  TOF ' + Math.round(lar.tof) + ' s' };
  // out of its zone: the release key asks the pilot to take the jet in
  return { ok: true, ar: JX.ask ? 'الطيار ينتظر موافقتك' : 'خارج المدى · اطلب الممر', en: JX.ask ? 'CONSENT?' : 'OUT OF RNG', warn: !!JX.ask };
}
function jetFire() {
  const f = jetFireState();
  if (f.en === 'DANGER CLOSE' && S.missionT - (JX.dcT || -99) > 10) { JX.dcT = S.missionT; const d = jetDanger(S.weapon, jetSel() || S.aim);
    radio('HUNTER: DANGER CLOSE, ' + Math.round(d / 10) * 10 + ' METRES FROM US, NOT CLEARED. MAVERICK IT', 'هنا هنتر: قريب جدًا منا، ' + Math.round(d / 10) * 10 + ' متر، غير مسموح بالقنبلة. استخدم المافريك', 'hunter', ['h.dc']); }
  if (!f.ok) { if (S.phase !== 'play') return; nudge($('#dStat')); if (f.en === 'SAFE') nudge($('#btnArm')); CK.msg = { s: f.en, t: 1.6 }; Snd.tone(260, 0.09); return; }
  const w = S.weapon, tp = jetSel() || S.aim;
  if (!jetLar(w, tp).ok) { jetConsent(true); return; }
  jetRelease(w, tp);
}
function jetRelease(w, tp) {
  const sel = jetSel(), lar = jetLar(w, tp), shot = { hit: false };
  S.ammo[w]--; S.cool[w] = w === 'agm' ? 1.5 : 0.8; S.shots++;
  tapeMark('REL ' + WN(w), 'إطلاق');
  const k = JX.slots[w].shift(); if (k) JX.ac.release(k);
  if (w === 'agm') {
    if (JX.run) { JX.run = null; jetOrbit(sel); }
    const p = { type: 'agm', target: sel, tgt: sel, x: sel.x, y: sel.y, tti: lar.tof, tof: lar.tof, shot, cep: 1.5 };
    projectiles.push(p); JX.trk.push({ p, x0: plane.x, y0: plane.y, w });
    Snd.jetMav(); radio('RIFLE', 'أُطلق المافريك', 'jet', ['f.rifle']);
  } else {
    // where it would fall on its own; the laser bomb steers from there, the JDAM goes for the coordinates
    const heavy = heavyW(w), b = bombFall(plane.alt - GROUND, Math.max(plane.gs / 3.6, 50), heavy);
    const bx = plane.x + Math.cos(plane.track) * b.x * PXM, by = plane.y + Math.sin(plane.track) * b.x * PXM;
    const p = { type: w, heavy, target: null, tgt: sel, x: w === 'jdam' ? tp.x : bx, y: w === 'jdam' ? tp.y : by, tti: b.t, tof: b.t, shot, cep: w === 'jdam' ? 4 : 0 };
    projectiles.push(p); JX.fall.push({ p, said: {}, tp: { x: tp.x, y: tp.y }, chi: plane.track }); JX.trk.push({ p, x0: plane.x, y0: plane.y, w });
    Snd.jetRel(heavy); radio('BOMB AWAY', 'القنبلة انطلقت', 'jet', ['f.bomb']);
  }
  syncUI();
}
// the officer's answer to the pilot (the UFC, or the release key while he waits)
function jetConsent(yes) {
  if (JX.gs) return;
  const w = S.weapon, tp = jetSel() || S.aim;
  JX.ask = null; CK.mpdT = 0;
  if (!yes) { JX.hold = 30; radio('STAYING IN THE ORBIT', 'باقين في المدار', 'jet', ['f.copyhold']); return; }
  if (JX.run || S.ammo[w] <= 0 || jetDanger(w, tp)) return;
  radio('TURNING IN', 'ندخل', 'jet', ['f.copyin']);
  // the Maverick: he points the nose at it and closes into its range; the officer fires
  if (w === 'agm') { JX.run = { w, sel: jetSel(), tp0: { x: tp.x, y: tp.y }, out: false, tr: null }; plane.mode = 'run';
    if (Math.hypot(tp.x - plane.x, tp.y - plane.y) * MPP < JET_AGM.near) { JX.run.out = true; jetOutbound(tp, Math.max(plane.gs / 3.6, 50)); } else jetTurnIn(tp); return; }
  const v = Math.max(plane.gs / 3.6, 50), b = bombFall(plane.alt - GROUND, v, heavyW(w)), d = Math.hypot(tp.x - plane.x, tp.y - plane.y) * MPP;
  plane.mode = 'run';
  // the JDAM from the wheel: a short turn toward the target and the release wings level (inside its least range, he
  // first flies on out of it)
  if (w === 'jdam') { JX.run = { w, sel: jetSel(), tp0: { x: tp.x, y: tp.y }, out: true, tr: null }; if (!jetWheel(tp, v, b)) jetExtend(); return; }
  // the laser bomb: room for the straight run after the turn in, or he goes out for it
  JX.run = { w, sel: jetSel(), tp0: { x: tp.x, y: tp.y }, out: jetRollout(tp, v) < jetRoom(b, v), tr: null };
  if (JX.run.out) jetOutbound(tp, v); else jetTurnIn(tp);
}
// The run at the orbit's own speed (faster, his turns would be wider and the run longer). A laser bomb wants 4 s
// wings level before the release, the pod steady on the target: the room he needs ahead at the roll-out is where it
// falls and that straight run.
// (a new height on station at about 3,800 ft/min, never pushing below 0.75 g: left to the model's own limits he
// climbed at 7,400 ft/min and dived at 9,500, pushing to -0.5 g in the orbit, tests/jetfly.cjs)
const JET_CREW = { vs: 18, nzMin: 0.75 };
// the fuel (lb) at which the jet must leave for home: some 100 nm and a reserve
const JET_BINGO = 4000;
// (a laser bomb wants the jet steady for the release, a few seconds, not more: the laser does its work in the bomb's
// last seconds, and 10 s sent him out on a long outbound leg from the 5 km orbit)
const JET_BANK = 60 * Math.PI / 180, JET_LIM = Object.assign({ bank: JET_BANK, roll: JET_BANK, nz: 4 }, JET_CREW), JET_WL = 4;
const jetRoom = (b, v) => b.x + v * JET_WL;
// how far ahead the target would lie (m) were he to turn toward it now at the run's bank: the tangent to it from his
// turn circle, 0 while it lies inside that circle
function jetRollout(tp, v) {
  const R = v * v / (G * Math.tan(JET_BANK)) * PXM, nx = -Math.sin(plane.track), ny = Math.cos(plane.track);
  const s = Math.sign(nx * (tp.x - plane.x) + ny * (tp.y - plane.y)) || 1, dc = Math.hypot(tp.x - plane.x - s * nx * R, tp.y - plane.y - s * ny * R);
  return dc > R ? Math.sqrt(dc * dc - R * R) * MPP : 0;
}
// Too close for the laser bomb's run: out from the target down a line parallel to the attack axis, offset to the
// side he is turning to by about the width of his turn, so the turn back puts him on the axis with the straight run
// to the release.
function jetOutbound(tp, v) {
  const r = JX.run, ux = plane.x - tp.x, uy = plane.y - tp.y, l = Math.hypot(ux, uy) || 1, R = v * v / (G * Math.tan(JET_BANK));
  r.u = { x: ux / l, y: uy / l };
  const nx = -r.u.y, ny = r.u.x, side = Math.sign(nx * plane.vx + ny * plane.vy) || 1, o = 1.7 * R * PXM * side;
  const far = { x: tp.x + r.u.x * 60000 * PXM + nx * o, y: tp.y + r.u.y * 60000 * PXM + ny * o };
  JX.P.set('line', { p: toNE(far), chi: Math.atan2(r.u.x, -r.u.y), h: JX.h, kcas: JX.kcas }, JET_LIM);
}
// too close for the JDAM: on along his track, out of its least range
function jetExtend() {
  const far = { x: plane.x + Math.cos(plane.track) * 60000 * PXM, y: plane.y + Math.sin(plane.track) * 60000 * PXM };
  JX.P.set('line', { p: toNE(far), chi: Math.atan2(Math.cos(plane.track), -Math.sin(plane.track)), h: JX.h, kcas: JX.kcas }, JET_LIM);
}
function jetCall(tp) {
  const [dk, dar] = dirOf(plane.x - tp.x, plane.y - tp.y);
  radio('IN FROM THE ' + dk, 'ندخل من ال' + dar, 'jetfm', ['f.r.in.' + dk]);
}
function jetTurnIn(tp) {
  const r = JX.run; r.out = false;
  if (r.w === 'agm') JX.P.set('nav', { chi: jetAgmCourse(tp), h: JX.h, kcas: JX.kcas }, JET_LIM);
  else JX.P.set('line', { p: toNE(tp), chi: Math.atan2(tp.x - plane.x, plane.y - tp.y), h: JX.h, kcas: JX.kcas }, JET_LIM);
  jetCall(tp);
}
// the Maverick's run: the target held 35° off the nose, on the side it lies (the least turn)
function jetAgmCourse(tp) {
  const brg = Math.atan2(tp.x - plane.x, plane.y - tp.y), trk = Math.atan2(Math.cos(plane.track), -Math.sin(plane.track));
  return brg - Math.sign(wrapA(brg - trk) || 1) * JET_AGM.offset;
}
// the JDAM's turn: the least turn toward the target (at the run's bank) after which it lies within 35° of the nose,
// worked out on his turn circle (from the orbit, about 60°); then the heading held and the release once the wings
// are level. false if no turn leaves it out of its least range: then he flies on first
function jetWheel(tp, v, b) {
  const R = v * v / (G * Math.tan(JET_BANK)), c = Math.cos(plane.track), sn = Math.sin(plane.track);
  const dx = (tp.x - plane.x) * MPP, dy = (tp.y - plane.y) * MPP, a = dx * c + dy * sn, q = -dx * sn + dy * c, s = Math.sign(q) || 1;
  let D = -1;
  for (let k = 0; k <= 90; k++) { const t = k * Math.PI / 90, ax = a - R * Math.sin(t), qy = q - s * R * (1 - Math.cos(t));
    if (Math.abs(wrapA(Math.atan2(qy, ax) - s * t)) <= 0.6) { if (Math.hypot(ax, qy) >= 0.5 * b.x) D = t; break; } }
  if (D < 0) return false;
  const r = JX.run, chi = plane.track + s * D; r.out = false; r.turnT = 0;
  JX.P.set('nav', { chi: Math.atan2(Math.cos(chi), -Math.sin(chi)), h: JX.h, kcas: JX.kcas }, JET_LIM);
  jetCall(tp);
  return true;
}
// off the target: back to the orbit round it
function jetOff(tp) {
  jetOrbit(tp);
  timers.push({ t: 1.6, fn: () => radio('OFF TARGET', 'خرجنا من الهدف', 'jet', ['f.off']) });
  timers.push({ t: 4, fn: () => radio('SAQR 1-1, OFF', 'صقر 1-1، خارج', 'jetfm', ['f.r.off']) });
}
function jetCivAbort() { radio('CIVILIANS IN THE TARGET AREA, ABORTING', 'مدنيون في منطقة الهدف، نلغي', 'jet', ['f.civ']); jetAbort(false); JX.hold = 20; }
function jetAbort(say, why) {
  const r = JX.run; JX.run = null;
  if (say) radio(why === 'lost' ? 'LOST THE TARGET, ABORTING' : 'ABORT, COMING OFF DRY', why === 'lost' ? 'فقدنا الهدف، نلغي' : 'إلغاء، نخرج بلا إطلاق', 'jet', [why === 'lost' ? 'f.lost' : 'f.abort']);
  if (r) jetOrbit(r.sel && r.sel.alive ? r.sel : r.tp0);
}
function jetRun(dt) {
  // (not before he is on station: on the ground and climbing out, no runs)
  if (S.phase !== 'play' || JX.gs) { JX.ask = null; return; }
  JX.hold = Math.max(0, JX.hold - dt);
  const w = S.weapon, sel = jetSel(), bomb = w === 'lgb' || w === 'jdam';
  // the pilot offers the run: armed, a bomb selected, the target held in the pod, out of its zone
  jetPid(dt); trainUpdate(dt);
  if (!JX.run && !JX.ask && !JX.hold && S.armed && bomb && S.ammo[w] > 0 && sel && sel.pid && sel.cleared && S.tracking && S.quality >= 2 && !jetLar(w, sel).ok && !jetDanger(w, sel) && !jetCiv(w, sel) && !(w === 'lgb' && smokeOver(sel.x, sel.y) > SMOKE_LOST)) {
    JX.ask = { t: S.missionT, again: false }; CK.mpdT = 0;
    radio('READY FOR THE RUN, YOUR CALL', 'الهدف في الحاضنة، جاهز للدخول بموافقتك', 'jet', ['f.tally']);
  }
  if (JX.ask) {
    if (!S.armed || !bomb || !sel) { JX.ask = null; CK.mpdT = 0; }
    else if (!JX.ask.again && S.missionT - JX.ask.t > 20) { JX.ask.again = true; radio('WANT ME TO TAKE IT IN?', 'أدخل؟', 'jet', ['f.ask']); }
  }
  const r = JX.run;
  if (r) {
    if (r.sel && (!r.sel.alive || r.sel.escaped)) { jetAbort(true, 'lost'); return; }
    if (!S.armed) { jetAbort(true); return; }
    const tp = r.sel || r.tp0, v = Math.max(plane.gs / 3.6, 50), b = bombFall(plane.alt - GROUND, v, heavyW(r.w));
    if (r.w === 'jdam') {
      const lar = jetLar('jdam', tp);
      if (r.out) { if (lar.d >= 0.75 * b.x) jetWheel(tp, v, b); return; }
      r.turnT += dt; r.tr = lar.ok ? 0 : null;
      if (lar.ok && Math.abs(plane.bank) < 0.26) { if (jetCiv('jdam', tp)) { jetCivAbort(); return; } JX.run = null; jetRelease('jdam', tp); jetOff(tp); }
      else if (r.turnT > 45 || lar.d < 0.45 * b.x) jetAbort(true);
      return;
    }
    if (r.out) { if (((plane.x - tp.x) * r.u.x + (plane.y - tp.y) * r.u.y) * MPP > (r.w === 'agm' ? JET_AGM.turn : jetRoom(b, v))) jetTurnIn(tp); return; }
    JX.P.tgt.p = toNE(tp);   // a moving target: the line runs through where it is now
    if (r.w === 'agm') {
      JX.P.tgt.chi = jetAgmCourse(tp);
      // inside its least range, or out of missiles: he comes off
      if (Math.hypot(tp.x - plane.x, tp.y - plane.y) * MPP < JET_AGM.off || S.ammo.agm <= 0) jetAbort(S.ammo.agm > 0);
      return;
    }
    // coming round and on the run, the pilot points at the target; the last 12 s he holds the line he is on
    if (!r.aligned || r.tr == null || r.tr > 12) JX.P.tgt.chi = Math.atan2(tp.x - plane.x, plane.y - tp.y);
    const lar = jetLar(r.w, tp);
    // turning in: no countdown until the nose is on the target (within 20°) and it lies ahead
    if (!r.aligned) { r.turnT = (r.turnT || 0) + dt;
      if (lar.along > 0 && Math.abs(lar.cross) < lar.along * 0.36) r.aligned = true;
      else { if (r.turnT > 90) jetAbort(true); return; } }
    r.tr = lar.tr;
    if (r.tr < 31 && r.tr > 24 && !r.s30) { r.s30 = 1; radio('30 SECONDS', 'ثلاثين ثانية', 'jet', ['f.30']); }
    if (r.tr < 11 && r.tr > 6 && !r.s10) { r.s10 = 1; radio('10 SECONDS', 'عشر ثوان', 'jet', ['f.10']); }
    if (r.tr < 3.4 && r.tr > 0 && !r.s3) { r.s3 = 1; radio('RELEASE IN 3', 'الإطلاق بعد ثلاث', 'jet', ['f.count']); }
    if (r.tr <= 0 && lar.ok) { if (jetCiv(r.w, tp)) { jetCivAbort(); return; } JX.run = null; jetRelease(r.w, tp); jetOff(tp); }
    else if (lar.along < b.x - 700) jetAbort(true);
  }
  // bombs falling: the time of fall, the laser if it is not on, splash, and what it did
  for (let i = JX.fall.length - 1; i >= 0; i--) {
    const f = JX.fall[i], p = f.p;
    if (!f.said.tof && p.tof - p.tti > 6) { f.said.tof = 1; const n = clamp(Math.round(p.tti / 2) * 2, 10, 60); radio('TIME OF FALL ' + n, 'زمن السقوط ' + n, 'jet', ['f.tof.' + n]); }
    if (p.type === 'lgb' && !f.said.lase && p.tti < 12 && !S.tracking) { f.said.lase = 1; radio('START LASING', 'شغّل الليزر', 'jet', ['f.lase']); }
    if (p.type === 'lgb' && p.wasBlind && !f.said.smoke) { f.said.smoke = 1; radio('SMOKE OVER THE TARGET, LOST THE SPOT', 'دخان فوق الهدف، فقدنا بقعة الليزر', 'jet', ['f.smoke']); }
    if (!f.said.splash && p.tti < 0.6) { f.said.splash = 1; radio('SPLASH', 'وصلت', 'jet', ['f.splash']); }
    if (p.ix != null) { JX.fall.splice(i, 1); timers.push({ t: 2.8, fn: () => jetBDA(f) }); }
  }
}
// what the bomb did, as the pilot sees it on his repeat of the pod (and HUNTER, when he is there)
function jetBDA(f) {
  if (S.phase !== 'play') return;
  const t = f.p.tgt;
  if (t && !t.alive) { radio('SHACK, GOOD HIT', 'إصابة مباشرة', 'jet', ['f.shack']); if (friends.length) timers.push({ t: 3, fn: () => radio('GOOD HITS, TARGET DESTROYED', 'إصابة جيدة، الهدف دُمّر', 'hunter', ['h.j.good']) }); return; }
  if (!t) return;
  const along = (f.p.ix - t.x) * Math.cos(f.chi) + (f.p.iy - t.y) * Math.sin(f.chi);
  radio(along > 0 ? 'MISSED LONG' : 'MISSED SHORT', along > 0 ? 'سقطت أبعد' : 'سقطت أقرب', 'jet', [along > 0 ? 'f.long' : 'f.short']);
  timers.push({ t: 2.5, fn: () => radio('ANOTHER PASS?', 'مرة ثانية؟', 'jet', ['f.again']) });
}

