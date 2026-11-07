/* ===================== air defence: the threats, the radars, the tracks ===================== */
// The air picture of the air-defence console (07b-airdef.js; docs/AIR_DEFENSE.md). Everything in metres in a frame of
// its own round the battery at the base: x east, y north, z above the ground. What flies (ADS.th): the threats and the
// friends, each on its own law (a drone and a cruise missile flown toward the base, a ballistic missile on its arc from
// apogee, the fighter on its racetrack, a transport coming in to land). What the radars see of them (ADS.tr): tracks,
// each made after two looks, its class worked out from how it flies after three, its identity from that (a missile
// hostile on its profile, a drone suspect till the operator confirms it), from the data link or from IFF; a track not
// seen for two seconds coasted on its last course (dimmed), dropped after twelve. The radars look once a second, as a
// real one's track updates come; the table is sorted then, once. All of it stepped at most a quarter second at a time
// by the console's own loop (adaTick); its objects kept and reused (nothing made in a step but a new track or threat).

// the kinds: the radar cross-section (m²) and its fourth root (the detection range's scale), and how it answers
const ADK = {
  uav: { rcs: 0.05 }, cm: { rcs: 0.1 }, tbm: { rcs: 0.1 },
  cap: { rcs: 5, link: true }, trn: { rcs: 20, iff: true },
};
for (const k in ADK) ADK[k].q = Math.sqrt(Math.sqrt(ADK[k].rcs));
// the classes in words, English and Arabic
const ADS_CLS = { TBM: ['BALLISTIC MISSILE', 'صاروخ باليستي'], CM: ['CRUISE MISSILE', 'صاروخ كروز'], UAV: ['DRONE', 'مسيّرة'], ACFT: ['AIRCRAFT', 'طائرة'], CAP: ['FRIENDLY FIGHTER', 'مقاتلة صديقة'] };
// the radars: the lower tier's (its sector turned by the operator: AD.az ± 60°), the upper tier's (fixed on the
// threat axis, ± 45°, ballistic targets only), the close-in gun's (all round, short); a target's detection range the
// radar's for 1 m² scaled by the fourth root of its cross-section, and no farther than the horizon (the antenna 5 m up,
// 4/3 earth: 4.12 (√5 + √h) km)
const ADR = { lwr: 120e3, upr: 600e3, uprAz: 95, uprHalf: 45, cram: 14e3, half: 60 };
const adHorizon = z => 4120 * (Math.sqrt(5) + Math.sqrt(Math.max(0, z)));
const adBrg = (x, y) => (Math.atan2(x, y) * 180 / Math.PI + 360) % 360;
const adOff = (b, az) => ((b - az + 540) % 360) - 180;
// a track's number as Link 16 gives it: five octal digits
const adTn = n => n.toString(8).padStart(5, '0');
const G0 = 9.81, D2R = Math.PI / 180, TAN3 = Math.tan(3 * Math.PI / 180);

const ADS = { th: [], tr: [], tab: [], tn: 0o2001, look: 0, plan: [], hits: 0, t: 0, eng: [], fly: 0, kills: 0, gun: { t: 0, tr: null, r: 0, said: null } };

/* ---- what flies ---- */
function adsThreat(k, b, km, z) { if (k === 'uav' || k === 'cm' || k === 'tbm') ADS.nHost++; const o = { k, kind: ADK[k], x: Math.sin(b * D2R) * km * 1000, y: Math.cos(b * D2R) * km * 1000, z, vx: 0, vy: 0, vz: 0, alive: true, look: 0, tr: null, t0: ADS.t }; ADS.th.push(o); return o; }
// a drone: in at its height toward the base, and down on it from 4 km
function adsUav(b, km, alt) { const o = adsThreat('uav', b, km, alt); o.v = 50; return o; }
// a cruise missile: low (45 m), out to a dog-leg 30 km from the base, then straight in
function adsCm(b, km, leg) { const o = adsThreat('cm', b, km, 45); o.wp = { x: Math.sin((b + leg) * D2R) * 30e3, y: Math.cos((b + leg) * D2R) * 30e3 }; o.v = 240; return o; }
// a ballistic missile, met at its apogee (z0 up, as a minimum-energy shot's: a quarter of its range; the night's
// short-range ones some 80 km up, coming down near 45° at about 1.7 km/s): its arc to its aim point (within 150 m of
// the base's middle) worked out from where it is and when it lands (T s); no drag (above the thick air for the most of
// its fall)
function adsTbm(b, km, z0, T) {
  const o = adsThreat('tbm', b, km, z0), ax = rand(-150, 150), ay = rand(-150, 150);
  o.T = T; o.p0 = { x: o.x, y: o.y, z: z0, vx: (ax - o.x) / T, vy: (ay - o.y) / T, vz: (G0 * T * T / 2 - z0) / T }; return o;
}
// the fighter on patrol: a racetrack's circle, 15 km across, 45 km out on 100°, at 24,000 ft
function adsCap() { const o = adsThreat('cap', 0, 0, 7300); o.ang = 0; o.v = 210; adsCapAt(o); return o; }
function adsCapAt(o) { const c = 45e3, cx = Math.sin(100 * D2R) * c, cy = Math.cos(100 * D2R) * c, R = 7500;
  o.x = cx + Math.cos(o.ang) * R; o.y = cy + Math.sin(o.ang) * R; o.vx = -Math.sin(o.ang) * o.v; o.vy = Math.cos(o.ang) * o.v; o.vz = 0; }
// a friendly transport coming home (down some four and a half minutes in, as the attack ends): in at 3,000 m, coming down to
// the 3° slope (at most 15 m/s, some 3,000 ft/min) and down it, slowing to its approach speed (some 145 kt) inside 12 km
// (its final approach's fix, some six and a half miles out)
function adsTrn(b, km) { const o = adsThreat('trn', b, km, 3000); o.v = 140; return o; }

// the night's attack (seconds from the start), some four minutes, all of it at the base within it: the drones already
// on their way when the console comes up, seen within seconds; the transport coming home from the south-west, outside
// the lower radar's sector (the gun's radar finds it first, or the operator turns the sector); the cruise missiles low
// from the south-east, seen inside the horizon (some 37 km) within the first minute; the ballistic pair, short-range
// ones (their apogee some 80 km up, 150 km out, two minutes' fall: about Mach 5 at the end), seen at once by the upper
// tier; more drones from the north-west, behind the sector, seen only by the gun's radar at some 7 km; a last swarm
// from the north, behind the sector again. (A drone at 180 km/h is some two and a half minutes from 8 km: where each
// starts sets when it arrives)
const ADS_PLAN = [
  [3, () => { adsUav(68, 8, 900); adsUav(72, 8.5, 1100); adsUav(76, 9, 1000); }],
  [15, () => adsTrn(215, 28)],
  [25, () => { adsCm(128, 42, -20); adsCm(134, 44, -8); }],
  [45, () => { adsTbm(92, 150, 80e3, 128); adsTbm(97, 158, 84e3, 131); }],
  [60, () => { adsUav(298, 7, 800); adsUav(304, 7.5, 1000); }],
  [100, () => { for (let i = 0; i < 4; i++) adsUav(340 + i * 5, 6 + i * 0.7, 700 + i * 150); }],
];

function adsMove(o, dt) {
  const k = o.k;
  if (k === 'tbm') {
    // (on its arc to the aim point, and there at its time whatever the step: a step does not carry it past the ground)
    const t = Math.min(ADS.t - o.t0, o.T), p = o.p0; o.x = p.x + p.vx * t; o.y = p.y + p.vy * t; o.z = Math.max(0, p.z + p.vz * t - G0 * t * t / 2); o.vx = p.vx; o.vy = p.vy; o.vz = p.vz - G0 * t;
    if (t >= o.T) adsArrive(o);
    return;
  }
  if (k === 'cap') { o.ang += o.v / 7500 * dt; adsCapAt(o); return; }
  const r = Math.hypot(o.x, o.y);
  let tx = 0, ty = 0, tz = o.z;
  if (k === 'cm' && o.wp) { tx = o.wp.x; ty = o.wp.y; if (Math.hypot(o.x - tx, o.y - ty) < o.v * 2) o.wp = null; }
  if (k === 'uav' && r < 4000) tz = 0;                                    // (the drone's dive on the base)
  if (k === 'cm' && r < 1500) tz = 0;
  if (k === 'trn') {
    // (toward the base level, its sink the slope's for its speed, more while it is above the slope)
    if (r < 12e3) o.v = 75;
    const dx = -o.x, dy = -o.y, d = Math.hypot(dx, dy) || 1;
    o.vx = dx / d * o.v; o.vy = dy / d * o.v; o.vz = Math.max(-15, Math.min(0, -o.v * TAN3 + (r * TAN3 - o.z) / 10));
    o.x += o.vx * dt; o.y += o.vy * dt; o.z = Math.max(0, o.z + o.vz * dt);
    if (Math.hypot(o.x, o.y) < 300 && o.z < 60) adsArrive(o);
    return;
  }
  const dx = tx - o.x, dy = ty - o.y, dz = tz - o.z, d = Math.hypot(dx, dy, dz) || 1;
  o.vx = dx / d * o.v; o.vy = dy / d * o.v; o.vz = dz / d * o.v;
  o.x += o.vx * dt; o.y += o.vy * dt; o.z = Math.max(0, o.z + o.vz * dt);
  if (Math.hypot(o.x, o.y) < 300 && o.z < 60) adsArrive(o);
}
// at the base: a hostile one hits it, the transport lands
function adsArrive(o) {
  o.alive = false;
  if (o.k === 'trn') { adsSay('SYS', (o.tr ? 'TN ' + o.tr.lbl + ' ' : '') + 'FRIENDLY AIRCRAFT LANDED', 'الطائرة الصديقة هبطت في القاعدة', ['a.landed']); return; }
  ADS.hits++; if (Snd.on && !Snd.idle && Snd.ctx) Snd.mws();
  // (which one got through: its number on the line, its mark on the base and its row in the table)
  const lbl = o.tr ? o.tr.lbl : '-----', cls = o.tr ? o.tr.cls : o.k === 'uav' ? 'UAV' : o.k === 'cm' ? 'CM' : 'TBM';
  adwMark(o, lbl, o.tr ? o.tr.id : 'HOS', cls, true);
  if (o.tr && AD.hook === o.tr) adwCamResult(o.tr, true);
  adsSay('SYS', 'IMPACT, IMPACT. BASE HIT' + (o.tr ? ', TN ' + lbl : ''), 'سقوط على القاعدة' + (o.tr ? '، الهدف ' + lbl : ''), ['a.impact'], 2);
}

/* ---- what the radars see ---- */
function adsSeen(o) {
  if (o.kind.link) return 'LINK';                                           // (the fighter: on the data link)
  const r = Math.hypot(o.x, o.y);
  if (r > adHorizon(o.z)) return null;
  const b = adBrg(o.x, o.y), q = o.kind.q, tbm = o.z > 12e3 || Math.hypot(o.vx, o.vy, o.vz) > 900;
  if (tbm && r < ADR.upr * q && Math.abs(adOff(b, ADR.uprAz)) <= ADR.uprHalf) return 'UPR';
  const f = AD.mode ? (tbm ? 1.4 : 0.7) : (tbm ? 0.6 : 1);               // (MODE: the lower radar's search, for ballistic or for the air)
  if (r < ADR.lwr * q * f && Math.abs(adOff(b, AD.az)) <= ADR.half) return 'LWR';
  if (r < ADR.cram * q) return 'CRAM';
  return null;
}
// a track's class from how it flies (after three looks): a ballistic one by its speed, a drone by its slowness, a
// cruise missile by its speed low down; the rest aircraft
function adsClassOf(tr) {
  const v = Math.hypot(tr.vx, tr.vy, tr.vz);
  if (tr.th.kind.link) return 'CAP';
  if (v > 800) return 'TBM';
  if (v < 62) return 'UAV';   // (a drone's 50 m/s: not the transport on its approach, 75)
  if (tr.z < 300 && v < 340) return 'CM';
  return 'ACFT';
}
// a track's time to the base (s) on its own course, 0 when it is not closing
function adsTti(tr) { const r = Math.hypot(tr.x, tr.y), rd = (tr.x * tr.vx + tr.y * tr.vy) / (r || 1); return rd < -1 ? Math.round(r / -rd) : 0; }
// the table's order: hostile, then suspect (each by time to the base, the soonest first, the priority ones before), then
// unknown, then friends; sorted once a look and on a change of identity or priority, not at each drawing
const ADS_RANK = { HOS: 0, SUS: 1, UNK: 2, FRD: 3 };
const adsCmp = (a, b) => ADS_RANK[a.id] - ADS_RANK[b.id] || (b.pri - a.pri) || ((a.tti || 1e9) - (b.tti || 1e9)) || a.tn - b.tn;
function adsSort() { const T = ADS.tab; T.length = 0; for (const tr of ADS.tr) T.push(tr); T.sort(adsCmp); }
function adsLook() {
  const now = ADS.t; let born = 0, tbm = 0;
  for (const o of ADS.th) {
    if (!o.alive) continue;
    const src = adsSeen(o);
    if (src) {
      o.look++;
      if (!o.tr && o.look >= 2) {
        const tr = o.tr = { tn: ADS.tn, lbl: adTn(ADS.tn), th: o, src, born: now, seen: now, cls: '---', id: o.kind.link ? 'FRD' : 'UNK', iff: '', pri: false, cst: false,
          x: o.x, y: o.y, z: o.z, vx: o.vx, vy: o.vy, vz: o.vz, tti: 0, n: 0 };
        ADS.tn++; ADS.tr.push(tr);
        if (!o.kind.link) born++;
      }
      if (o.tr) { const tr = o.tr; tr.src = src; tr.seen = now; tr.cst = false; tr.x = tr.sx = o.x; tr.y = tr.sy = o.y; tr.z = tr.sz = o.z; tr.vx = o.vx; tr.vy = o.vy; tr.vz = o.vz; tr.n++;
        if (tr.n === 3 && adsClassify(tr)) tbm++; }
    } else o.look = 0;
  }
  // tracks unseen: coasted on their last course after two seconds, dropped after twelve; a track whose threat hit or
  // landed let go at once
  for (let i = ADS.tr.length - 1; i >= 0; i--) {
    const tr = ADS.tr[i], gone = !tr.th.alive, age = now - tr.seen;
    if (!gone && age < 2) { tr.tti = adsTti(tr); continue; }
    if (!gone && age < 12) { tr.cst = true; tr.x = tr.sx + tr.vx * age; tr.y = tr.sy + tr.vy * age; tr.z = Math.max(0, tr.sz + tr.vz * age); tr.tti = adsTti(tr); continue; }
    if (!gone) adsSay('SYS', 'TN ' + tr.lbl + ' TRACK DROPPED', 'أُسقط الهدف ' + tr.lbl + ' من الصورة', ['a.track', 'a.lost']);
    adsLetGo(tr);
  }
  adsSort();
  // (one alert a look however many tracks are born in it: three drones at once had stacked three alerts' oscillators)
  if (Snd.on && !Snd.idle && Snd.ctx) { if (tbm) Snd.caution(); else if (born) { Snd.beep(1320, 0, 0.09, 0.05); Snd.beep(1320, 0.16, 0.09, 0.05); } }
  adcDirty('A'); adcDirty('C'); if (AD.hook) adcDirty('B'); if (AD.page === 'cap') adcDirty('D');   // (the fighter's page fresh at each look)
}
// classified (true when a ballistic one: its own alert): a missile hostile on its profile; a drone suspect (a light
// aircraft flies as slow) till the operator confirms it; an aircraft unknown till it answers IFF or is declared
function adsClassify(tr) {
  tr.cls = adsClassOf(tr);
  if (tr.cls === 'TBM' || tr.cls === 'CM') tr.id = 'HOS';
  else if (tr.cls === 'UAV') tr.id = 'SUS';
  if (tr.cls === 'CAP' || tr.id === 'FRD') return false;
  const b = adPad(Math.round(adBrg(tr.x, tr.y)) % 360, 3), km = Math.round(Math.hypot(tr.x, tr.y) / 1000), w = ADS_CLS[tr.cls];
  const idw = tr.id === 'HOS' ? ['', ''] : tr.id === 'SUS' ? ['SUSPECT ', ' مشتبه'] : ['UNKNOWN ', ' مجهولة'];
  // (said short, as a voice system says it: new track, its identity and class and its bearing a digit at a time; its
  // number and range on the screen)
  adsSay('SYS', 'TN ' + tr.lbl + '  ' + idw[0] + w[0] + '  BRG ' + b + '  ' + km + ' KM', 'هدف ' + tr.lbl + ': ' + w[1] + idw[1] + '، الاتجاه ' + b + '، على بعد ' + km + ' كم',
    ['a.new', 'a.i.' + tr.id, 'a.c.' + tr.cls, 'a.brg', ...adDig(b)], tr.cls === 'TBM' || tr.cls === 'CM' ? 2 : 1);
  // (the first ballistic one: the command's warning to all stations)
  if (tr.cls === 'TBM' && !ADS.tbmCall) { ADS.tbmCall = true; adsSay('CMD', 'ADC: BALLISTIC LAUNCH DETECTED, TAKE COVER', 'قيادة الدفاع الجوي: رُصد إطلاق باليستي، احتموا', ['q.tbm'], 2); }
  return tr.cls === 'TBM';
}
// a track let go of the picture (dropped, or its threat gone): marked so (an interceptor on it flies on blind)
function adsLetGo(tr) { const i = ADS.tr.indexOf(tr); if (i >= 0) ADS.tr.splice(i, 1); tr.gone = true; tr.th.tr = null; if (AD.hook === tr) adsHook(null); }
// the table as the display shows it (sorted at the last look or change)
const adsTable = () => ADS.tab;
// (the sim's own messages wait their turn in the window, by their weight (pr: 0 news, a drone's or an aircraft's new
// track; 1 a weapon's: away, the gun, a plan; 2 a missile's new track, an impact, a kill, a miss, a leaker, the ballistic
// warning); a press's answer is shown at once)
const adsSay = (src, en, ar, say, pr) => adaSay(src, en, ar, true, say, pr);

/* ---- the operator's hand on the tracks ---- */
function adsHook(tr, say) {
  if (tr !== AD.hook) AD.camAt = ADS.t;   // (the camera slews to it afresh, 07b adcFov)
  AD.hook = tr; adcDirty('A'); adcDirty('B'); adcDirty('C');
  if (tr && say) adaSay('SYS', 'TN ' + tr.lbl + ' HOOKED', 'تم تحديد الهدف ' + tr.lbl, false, ['a.track', 'a.hooked']);
}
// UP / DOWN: to the next track (that way in the table) that still needs the operator (adsTodo: the assist's own
// test), the most pressing first; with none left, simply the next
function adsStep(d) {
  const T = ADS.tab; if (!T.length) { adaSay('SYS', 'NO TRACKS', 'لا توجد أهداف', false, ['a.notracks']); return; }
  // (none hooked, or the hooked one dealt with: the most pressing that still needs the operator, from the table's top)
  if (!AD.hook || !adsTodo(AD.hook)) { const t = T.find(t => t !== AD.hook && adsTodo(t)); if (t) { adsHook(t, true); return; } }
  const i = T.indexOf(AD.hook), n = T.length, s0 = i < 0 ? -d : i;
  for (let k = 1; k <= n; k++) { const t = T[((s0 + d * k) % n + n) % n]; if (t !== AD.hook && adsTodo(t)) { adsHook(t, true); return; } }
  adsHook(T[i < 0 ? 0 : (i + d + n) % n], true);
}
// the track nearest the cursor where the display draws it (in the sector's own frame, heading up: one past the range at
// its edge, one behind the sector along the foot), within a twelfth of the range
function adsHookCursor() {
  const R = AD.rng * 1000, cb = AD.cur.b * D2R, cx = Math.sin(cb) * AD.cur.r * 1000, cy = Math.cos(cb) * AD.cur.r * 1000;
  let best = null, bd = R / 12;
  // (each where the display draws it: one outside the sector on its edge, at its range)
  for (const tr of ADS.tr) { const o = adOff(adBrg(tr.x, tr.y), AD.az), b = Math.max(-60, Math.min(60, o)) * D2R, r = Math.min(Math.hypot(tr.x, tr.y), R * 0.985), d = Math.hypot(Math.sin(b) * r - cx, Math.cos(b) * r - cy); if (d < bd) { bd = d; best = tr; } }
  if (best) adsHook(best, true); else adaSay('SYS', 'NO TRACK UNDER CURSOR', 'لا يوجد هدف تحت المؤشر', false, ['a.nocur']);
}
function adsDrop() { if (!AD.hook) { adaSay('SYS', 'NO TRACK HOOKED', 'لا يوجد هدف محدد', false, ['a.notrack']); return; } const n = AD.hook.lbl; adsHook(null); adaSay('SYS', 'TN ' + n + ' DROPPED', 'أُلغي تحديد الهدف ' + n, false, ['a.track', 'a.dropped']); }
const adsNone = () => { if (AD.hook) return false; adaSay('SYS', 'NO TRACK HOOKED', 'لا يوجد هدف محدد', false, ['a.notrack']); return true; };
const adsChanged = () => { adsSort(); adcDirty('A'); adcDirty('B'); adcDirty('C'); };
// IFF: the hooked track asked; a friend's transponder answers (mode 5), a missile or a drone never does
function adsIff() {
  if (adsNone()) return; const tr = AD.hook;
  if (tr.th.kind.link) { adaSay('SYS', 'TN ' + tr.lbl + ' FRIEND ON LINK', 'الهدف ' + tr.lbl + ' صديق على شبكة الربط', false, ['a.track', 'a.link']); return; }
  if (tr.th.kind.iff && tr.th.alive) { tr.id = 'FRD'; tr.iff = 'M5'; adaSay('SYS', 'TN ' + tr.lbl + ' IFF MODE 5 VALID, FRIEND', 'الهدف ' + tr.lbl + ' رد على التعريف: صديق', false, ['a.iff.f']); }
  else { tr.iff = 'NR'; adaSay('SYS', 'TN ' + tr.lbl + ' IFF NO REPLY', 'الهدف ' + tr.lbl + ' لم يرد على التعريف', false, ['a.iff.nr']); }
  adsChanged();
}
// declaring: a suspect drone confirmed hostile (and back); an unknown aircraft that did not answer IFF declared hostile
// (and back); a missile's identity and a friend's are not the operator's to change
function adsClass() {
  if (adsNone()) return; const tr = AD.hook;
  if (tr.id === 'FRD' || tr.cls === 'TBM' || tr.cls === 'CM' || tr.cls === '---') { adaSay('SYS', 'TN ' + tr.lbl + ' IDENTITY FIXED', 'هوية الهدف ' + tr.lbl + ' ثابتة', false, ['a.track', 'a.fixed']); return; }
  if (tr.cls === 'UAV') tr.id = tr.id === 'HOS' ? 'SUS' : 'HOS';
  else if (tr.iff !== 'NR') { adaSay('SYS', 'INTERROGATE FIRST', 'اسأل التعريف أولًا', false, ['a.interr']); return; }
  else tr.id = tr.id === 'HOS' ? 'UNK' : 'HOS';
  adaSay('SYS', 'TN ' + tr.lbl + (tr.id === 'HOS' ? ' DECLARED HOSTILE' : tr.id === 'SUS' ? ' BACK TO SUSPECT' : ' BACK TO UNKNOWN'),
    tr.id === 'HOS' ? 'الهدف ' + tr.lbl + ' أُعلن معاديًا' : tr.id === 'SUS' ? 'الهدف ' + tr.lbl + ' رجع مشتبهًا' : 'الهدف ' + tr.lbl + ' رجع مجهولًا', false, ['a.track', tr.id === 'HOS' ? 'a.decl' : tr.id === 'SUS' ? 'a.b.sus' : 'a.b.unk']);
  adsChanged();
}
function adsPri() { if (adsNone()) return; const tr = AD.hook; tr.pri = !tr.pri; adsChanged(); adaSay('SYS', 'TN ' + tr.lbl + (tr.pri ? ' PRIORITY' : ' PRIORITY CLEARED'), tr.pri ? 'الهدف ' + tr.lbl + ' أولوية' : 'أُلغيت أولوية الهدف ' + tr.lbl, false, ['a.track', tr.pri ? 'a.pri' : 'a.pricl']); }
// (engaging: 07d-adwpn.js)

/* ---- the step ---- */
function adsReset() { ADS.tbmCall = false; ADS.nHost = 0; ADS.th.length = ADS.tr.length = ADS.tab.length = 0; ADS.tn = 0o2001; ADS.look = 0; ADS.hits = 0; ADS.t = 0; ADS.plan = ADS_PLAN.slice(); AD.hook = null; adwReset(); adsCap(); }
function adsTickSim(dt) {
  // (in quarter seconds at most: a step after a slow tick split, so nothing jumps past the base's 300 m)
  while (dt > 0.25) { adsTickSim(0.25); dt -= 0.25; }
  ADS.t += dt;
  while (ADS.plan.length && ADS.plan[0][0] <= ADS.t) ADS.plan.shift()[1]();
  for (const o of ADS.th) if (o.alive) adsMove(o, dt);
  adwStep(dt); adwGun(dt); adcCamStep();
  // (the dead let go once no track holds them)
  for (let i = ADS.th.length - 1; i >= 0; i--) if (!ADS.th[i].alive && !ADS.th[i].tr) ADS.th.splice(i, 1);
  ADS.look += dt; if (ADS.look >= 1) { ADS.look -= 1; adsLook(); }
}
// the assist's cue: the next step's control (07b-airdef.js lights it): a track still to deal with and none hooked
// (or the one hooked dealt with), the table's step; an unknown aircraft hooked, IFF, and declare it if it did not
// answer; a suspect drone hooked, confirm it; a hostile hooked, master arm and hold fire let go, then the system knob if
// it is on one that would turn it down, and engage. A hostile is dealt with once engaged, or a drone or a cruise missile
// given to the gun (and any drone with the gun on auto: it is the gun's), all of it only while armed and free to fire;
// a drone with the gun held, the gun's auto
// (a hostile drone with the gun out of rounds: nothing left to do for it, nothing else is for drones)
// (not one still unclassified (a second's wait), nor one the weapons found no solution for in the last 15 s)
const adsTodo = t => t.id !== 'FRD' && t.cls !== '---' && !(t.noSol && ADS.t - t.noSol < 15) && !(t.id === 'HOS' && t.cls === 'UAV' && AD.cramRds <= 0) && !(t.id === 'HOS' && AD.armed && !AD.hold && (t.eng || (AD.cram && AD.cramRds > 0 && (t.gun || t.cls === 'UAV'))));
function adsCue() {
  if (!ADS.tr.length) return '';
  const tr = AD.hook;
  if (!tr || !adsTodo(tr)) { for (const t of ADS.tr) if (t !== tr && adsTodo(t)) return 'UP'; return ''; }
  if (tr.id === 'UNK' && tr.cls === 'ACFT') return tr.iff ? 'CLASS' : 'IFF';
  if (tr.id === 'SUS') return 'CLASS';
  if (tr.id !== 'HOS') return '';
  if (!AD.armed) return 'ARM';
  if (AD.hold) return 'HOLDFIRE';
  // (a drone, or one given to the gun while the gun is held: the gun's auto)
  if (tr.cls === 'UAV' || (tr.gun && !AD.cram && AD.cramRds > 0)) return 'GUNAUTO';
  const sys = ADA_SYS[AD.sys];
  if ((sys === 'UPR' && tr.cls !== 'TBM') || (sys === 'CRAM' && tr.cls !== 'UAV' && tr.cls !== 'CM')) return 'SYSTEM';
  return 'ENGAGE';
}
