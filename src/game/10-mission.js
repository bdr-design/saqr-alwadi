/* ===================== mission flow ===================== */
// Ready missions. layout null is the original convoy mission (scripted halts, the civilian SUV); the others are
// layouts as the editor makes them, plus the time of day and where the aircraft starts.
const conv = (id, dir, s0, haltS, kinds, v) => { let s = s0; return kinds.map((k, i) => { if (i) s -= dir * ((SPR[kinds[i - 1]].len + SPR[k].len) / 2 + 26); return { t: 'veh', k, convoy: id, dir, s, spd: v, haltS: haltS + (s - s0), haltFor: 25 }; }); };
const MISSIONS = MAP_ID !== 'valley' ? [...((JET && MAP.jet) || MAP.missions || []), { id: 'custom', ar: 'المخصّصة', en: 'CUSTOM', custom: true, night: null, fly: 'orbit', desc: 'مهمتك من «تخصيص الأهداف».', desc_en: 'Your own mission, from the target editor.' }] : [
  { id: 'convoy', ar: 'الرتل', en: 'CONVOY', layout: null, night: false, fly: 'orbit',
    desc: 'رتل من أربع مركبات يتجه جنوبًا، ومواقع ثابتة على جانبي الطريق. البيوت مدنية: لا تُصبها.',
    desc_en: 'A four-vehicle column heading south, and fixed positions on both sides of the road. The houses are civilian: do not hit them.' },
  { id: 'compound', ar: 'المجمّع', en: 'COMPOUND', night: false, fly: 'h2',
    desc: 'مجمّع معادٍ على الضفة الشرقية بجانب بيت مدني. دمّر المبنى بالرمح على تتبع جيد، ولا تمس البيت المجاور.',
    desc_en: 'An enemy compound on the east bank next to a civilian house. Destroy the building with the Rumh on a good track, and leave the house next to it untouched.',
    layout: [
      { t: 'house', k: 'house2', x: 1002, y: 334, r: -0.3, role: 'hostile' }, { t: 'house', k: 'house4', x: 968, y: 262, r: 0.45, role: 'civil' }, { t: 'house', k: 'house1', x: 792, y: 198, r: 0.15, role: 'civil' },
      { t: 'pax', k: 'pax', x: 1012, y: 352, n: 4 }, { t: 'pax', k: 'pax', x: 990, y: 318, n: 3 },
      { t: 'veh', k: 'hilux', x: 1024, y: 340, h: 1.2, move: false }, { t: 'veh', k: 'lc79', x: 982, y: 352, h: 2.6, move: false },
      ...conv('A', 1, 120, 470, ['hilux', 'mrap'], 9) ] },
  { id: 'night', ar: 'كمين ليلي', en: 'NIGHT AMBUSH', night: true, fly: 'h1',
    desc: 'ليلًا: رتل إمداد يصعد من الجنوب ويتوقف عند المنعطف، وموقع معادٍ في بيت جنوب الوادي. الحراري يرى ما لا تراه العين.',
    desc_en: 'Night: a supply column comes up from the south and halts at the bend, and an enemy position holds a house south in the valley. The thermal sees what the eye cannot.',
    layout: [
      ...conv('B', -1, 640, 430, ['hilux', 'tanker', 'cargo', 'mrap'], 8.5),
      { t: 'house', k: 'house3', x: 838, y: 708, r: 1.35, role: 'hostile' }, { t: 'pax', k: 'pax', x: 852, y: 722, n: 4 },
      { t: 'house', k: 'house2', x: 1002, y: 334, r: -0.3, role: 'civil' },
      { t: 'veh', k: 'launcher', x: 918, y: 770, h: 2.55, move: false }, { t: 'pax', k: 'pax', x: 905, y: 756, n: 3 } ] },
  { id: 'tic', ar: 'إسناد قوات', en: 'TROOPS IN CONTACT', night: false, fly: 'orbit',
    desc: 'دورية صديقة (مدرعتان ومشاة) تحت النار عند منعطف الطريق، من كمين على المنحدر الشرقي: مقاتلون وخندق رشاش، وفنيّ برشاش 12.7، ومدفع 23 ملم مزدوج يحمي الكمين، وفريق صواريخ كتف، وهاون خلفهم يقصف الدورية. هنتر يوجّهك ويعلّم الأهداف بدخان أحمر. قواتنا معلّمة بلوح برتقالي: لا تُصبها، واحذر النار الموجهة إليك.',
    desc_en: 'A friendly patrol (two armoured vehicles and infantry) is under fire at the bend in the road, from an ambush on the east slope: fighters and a machine-gun trench, a technical with a 12.7 mm gun, a twin 23 mm gun covering the ambush, a MANPADS team, and a mortar behind them shelling the patrol. Hunter talks you on and marks the targets with red smoke. Our troops carry an orange panel: do not hit them, and watch the fire aimed at you.',
    layout: [
      { t: 'veh', k: 'mrap', side: 'blue', x: 966, y: 486, h: 1.62, move: false }, { t: 'veh', k: 'mrap', side: 'blue', x: 961, y: 522, h: 1.8, move: false },
      { t: 'pax', k: 'pax', side: 'blue', x: 944, y: 494, n: 4 }, { t: 'pax', k: 'pax', side: 'blue', x: 938, y: 526, n: 4 },
      { t: 'pax', k: 'pax', x: 1140, y: 470, n: 5 }, { t: 'pax', k: 'pax', x: 1176, y: 548, n: 4 },
      { t: 'veh', k: 'hilux', x: 1226, y: 500, h: 3.0, move: false }, { t: 'veh', k: 'lc79', x: 1330, y: 384, h: 2.4, move: false },
      { t: 'pax', k: 'pax', x: 1262, y: 604, n: 2, aa: 2 },
      { t: 'veh', k: 'trench', x: 1112, y: 505, h: 2.9, move: false }, { t: 'veh', k: 'mortar', x: 1385, y: 560, h: 3.0, move: false } ] },
  { id: 'escort', ar: 'مرافقة رتل', en: 'CONVOY ESCORT', night: false, fly: 'orbit',
    desc: 'رتل إمداد صديق (مدرعتان وشاحنة وصهريج) ينزل جنوبًا عبر الوادي إلى آخر الطريق. الاستخبارات تتوقع كمائن عند المضيق وفي الجنوب. افتح الطريق أمامه: يتوقف تحت النار ويتحرك حين تُسكت المدافع التي تطاله. تنتهي المهمة حين يصل.',
    desc_en: 'A friendly supply column (two armoured vehicles, a truck and a fuel tanker) heads south down the valley to the end of the road. Intelligence expects ambushes at the narrows and in the south. Clear the way: it halts under fire and moves on once the guns that can reach it fall silent. The mission ends when it arrives.',
    // the friendly convoy (it halts under fire; in at its last halt); ambushes hold their fire until it is that close (m)
    layout: [
      ...conv('F', 1, 110, 840, ['mrap', 'cargo', 'tanker', 'mrap'], 8).map(it => ({ ...it, side: 'blue', haltFor: 9999 })),
      { t: 'pax', k: 'pax', x: 1010, y: 330, n: 4, ambush: 150 }, { t: 'pax', k: 'pax', x: 1000, y: 410, n: 3, ambush: 130 },
      { t: 'veh', k: 'hilux', x: 1080, y: 380, h: 2.9, move: false, ambush: 160 }, { t: 'pax', k: 'pax', x: 850, y: 380, n: 3, ambush: 120 },
      { t: 'veh', k: 'lc79', x: 760, y: 650, h: 0.3, move: false, ambush: 150 }, { t: 'pax', k: 'pax', x: 1040, y: 640, n: 2, aa: 2, ambush: 160 },
      { t: 'pax', k: 'pax', x: 960, y: 700, n: 4, ambush: 120 } ] },
  { id: 'custom', ar: 'المخصّصة', en: 'CUSTOM', custom: true, night: null, fly: 'orbit', desc: 'مهمتك من «تخصيص الأهداف».', desc_en: 'Your own mission, from the target editor.' },
];
// put the aircraft on station at once: on a hover point (nose on the valley) or on the circle
function placePlane(mode) {
  if (JET) { jetPlace(); return; }
  plane.mode = mode; plane.oc = null; plane.hp = null; plane.altB = ALT_CRUISE; plane.vsB = 0;
  if (mode === 'pad' && BASE) {
    // on the pad, the rotor turning, nose north
    const q = basePad(); Object.assign(plane, { x: q.x, y: q.y, vx: 0, vy: 0, ax: 0, ay: 0, altB: GROUND + EYE, alt: GROUND + EYE, padT: 0, onOrbit: false });
    plane.tilt.p = plane.tilt.b = 0; plane.nose0 = plane.nose = BASE.heading; plane.track = plane.nose; return;
  }
  if (mode === 'pad') mode = plane.mode = 'orbit';
  if (mode === 'orbit') return;
  const h = hoverPt(mode);
  plane.onOrbit = false; plane.x = h.x; plane.y = h.y; plane.vx = plane.vy = plane.ax = plane.ay = 0; plane.tilt.p = plane.tilt.b = 0;
  plane.nose0 = plane.nose = Math.atan2(H0 / 2 - h.y, W0 / 2 - h.x); plane.track = plane.nose;
}
// the layout the last mission was played with (null: the default mission); "again" replays it. An operation in
// phases: the next phase's units come with its tasking on the radio once the last phase's targets are down; rtb: the
// operation ends on the pad
let missionLayout = null, missionId = 'convoy', missionPhases = [], missionRtb = false;
// a custom mission keeps the map's civilian areas (its port, its base: from the map's missions), so its buildings
// are not fair game; the jet's orbit goes round the middle of the hostile targets placed
function customLayout(items) {
  const civ = [];
  for (const m of MISSIONS) if (m.layout) for (const it of m.layout) if (it.t === 'blds' && it.role === 'civil' && !civ.some(c => JSON.stringify(c.area) === JSON.stringify(it.area))) civ.push({ ...it });
  return [...civ, ...items.filter(it => it.t !== 'blds')];
}
function layoutCentre(items) {
  const h = items.filter(it => (it.t === 'veh' || it.t === 'pax') && it.side !== 'blue' && !it.civil || it.t === 'house' && it.role === 'hostile');
  return h.length ? { x: h.reduce((a, it) => a + it.x, 0) / h.length, y: h.reduce((a, it) => a + it.y, 0) / h.length } : null;
}
function startMission(layout, mi) {
  // (not the campaign's, unless campStart says so after)
  S.camp = false;
  if (mi && mi.custom && layout) layout = customLayout(layout);
  if (layout !== undefined) missionLayout = layout;
  if (mi) {
    missionId = mi.id; missionPhases = mi.phases || []; missionRtb = !!(mi.rtb && BASE) && !JET;
    if (mi.night != null) { S.dusk = !mi.night && S.todPref === 'dusk'; setNight(mi.night); }
    // the jet: where, how high, how fast and how wide the first orbit is
    if (JET) { const j = mi.jet || {}; JX.c = j.c ? { x: j.c[0], y: j.c[1] } : mi.custom && missionLayout ? layoutCentre(missionLayout) : null; JX.h = (j.ft || 15000) * 0.3048; JX.kcas = j.kcas || 300; JX.R = j.R || 5000; }
    placePlane(mi.fly || 'orbit');
  }
  $('#ovStart').hidden = true; $('#ovEnd').hidden = true; menuBg(); $('#eBg').style.backgroundImage = '';
  if (S.soundPref !== false && !S.soundOn) setSound(true); else if (S.soundPref === false && S.soundOn) setSound(false);
  Object.assign(S, { phase: 'play', missionT: 0, shots: 0, hits: 0, armed: false, sel: null, tracking: false, quality: 0, ammo: { msl: 8, rkt: 38, gun: 1200 }, cool: { msl: 0, rkt: 0, gun: 0 }, zoomGoal: 1, fcr: [], fcrT: 0, fcrAt: -99 });
  applyLoadout(); illums.length = 0; TAPE.length = tapeReq.length = 0;
  S.aimGoal.x = W0 / 2; S.aimGoal.y = H0 / 2;
  acReset();
  setupMission(missionLayout); syncUI();
  S.civ = S.civHit = S.hits = 0; S.frat = S.fratKill = S.blueLost = 0;
  Object.assign(S, { phaseI: 0, nextPh: false, rtb: false, convoyIn: false, bingo: false, rtbCall: false, unable: false, home: false });
  CK.known.clear();
  const cur = MISSIONS.find(m => m.id === missionId) || {};
  Object.assign(TR, { on: JET && !!cur.train, i: 0, t: 0, said: false }); trainRing.hidden = true;
  // (on the range the truck first, for the laser bomb, then the tank, for the Barq: their numbers in that order)
  if (TR.on) { targets.sort((a, b) => (a.vk === 't72') - (b.vk === 't72')); targets.forEach((t, i) => { t.id = i + 1; }); }
  // the officer's iPad down, the tasking on it
  // (on the stand: up, the tasking waiting for his answer)
  if (JET) { efbShow(false); efbStart(); if (JX.gs && EFB.task) { EFB.task.state = 'pending'; efbShow(true); } }
  S.stationT = 0;
  if (JET && !cur.train && !JX.gs) jetCheckIn();
}
// the jet checks in on station at its height: to Hunter when ours are on the ground (he hands over the tasking),
// else to Ops (no friendlies: cleared to engage). (Not on the training range: the pilot talks there)
function jetCheckIn() {
  AC.nextTalk = Math.max(AC.nextTalk || 0, S.missionT + 14);
  const ft = clamp(Math.round(JX.h / 304.8 / 5) * 5, 15, 25), hunter = friends.length > 0;
  timers.push({ t: 1.5, fn: () => radio('SAQR 1-1, ON STATION, ANGELS ' + ft, 'صقر 1-1 في الموقع على ' + ft + ' ألف قدم، جاهز للمهمة', 'jetfm', [(hunter ? 'f.r.check.' : 'f.r.ops.') + ft]) });
  timers.push({ t: 8, fn: () => hunter ? radio('HUNTER: TARGETS IN YOUR SYSTEM, REPORT TALLY', 'هنا هنتر، الأهداف في نظامك، أبلغ عند رؤيتها', 'hunter', ['h.j.go'])
    : radio('OPS: TARGETS ON YOUR DATALINK, CLEARED TO ENGAGE', 'هنا العمليات، الأهداف على الربط، لا قوات صديقة، مسموح بالاشتباك', 'ops', ['o.j.go']) });
}
function nextPhase() {
  if (S.phase !== 'play' || S.home) return;
  const ph = missionPhases[S.phaseI++], n0 = targets.length;
  buildUnits(ph.layout); linkHomes();
  const ids = targets.slice(n0).map((_, i) => n0 + i + 1).sort(() => Math.random() - 0.5);
  targets.slice(n0).forEach((t, i) => { t.id = ids[i]; });
  targets.sort((a, b) => a.id - b.id);
  AC.tic = false; S.nextPh = false;
  // the new tasking on the iPad, waiting for him to read it (the UFC says so)
  if (JET) efbTask(targets.slice(n0), true);
  radio(ph.en, ph.ar, 'ops', ['o.ph.' + ph.en.toUpperCase().replace(/[^A-Z]+/g, '_').replace(/^_|_$/g, '')]); syncUI();
}
// score: what each kill is worth, a bonus for accuracy and (all targets down) for speed; escapes and every civilian
// house hit cost points. The rating is the share of the best possible; any civilian damage caps it at «جيد».
const VALUE = t => t.kind === 'house' ? 150 : t.kind === 'personnel' ? 60 : { mrap: 150, launcher: 200, tanker: 120 }[t.vk] || 100;
function scoreMission() {
  let kills = 0, max = 0;
  for (const t of targets) { max += VALUE(t); if (!t.alive) kills += VALUE(t); }
  const all = targets.every(t => !t.alive);
  const acc = S.shots ? Math.round(S.hits / S.shots * 200) : 0;
  // (the jet: from on station; its taxi and climb are not the crew's slowness)
  const speed = all ? Math.max(0, Math.round(300 - (S.missionT - (S.stationT || 0)) / 60 * 25)) : 0;
  const esc = targets.filter(t => t.escaped).length * 50, civ = S.civHit * 250 + S.civ * 250;
  // friendlies: a bonus for bringing them all through, losses and fratricide cost heavily; so does the damage taken
  const blue = friends.length ? (S.blueLost ? -S.blueLost * 250 : 300) : 0, frat = (S.frat || 0) * 300 + (S.fratKill || 0) * 600, dmg = Math.round((100 - AC.hp) * 3);
  const score = Math.max(0, kills + acc + speed - esc - civ + blue - frat - dmg), k = score / (max + 500 + (friends.length ? 300 : 0));
  let r = k >= 0.85 ? ['ممتاز', 'EXCELLENT'] : k >= 0.65 ? ['جيد جدًا', 'VERY GOOD'] : k >= 0.45 ? ['جيد', 'GOOD'] : ['يحتاج تدريبًا', 'TRY AGAIN'];
  if (S.civHit && k >= 0.45) r = ['جيد', 'GOOD'];
  if (AC.downed || S.fratKill) r = ['يحتاج تدريبًا', 'TRY AGAIN'];
  return { score, ar: r[0], en: r[1] };
}
function checkEnd() {
  if (S.phase !== 'play' || S.home) return;
  const open = targets.filter(t => t.alive && !t.escaped).length;
  // (with a base to rearm at, an empty aircraft goes home instead of ending the mission)
  const noAmmo = (!BASE || JET) && Object.values(S.ammo).reduce((a, b) => a + b, 0) === 0 && !projectiles.length;
  const lost = friends.length > 0 && friends.every(f => !f.alive);
  // the jet at its bingo fuel: home it goes, whatever is left
  const bingo = JET && plane.fuel < JET_BINGO, home = JET && (S.rtbCall || S.unable);
  if (bingo && !S.bingo) { S.bingo = true; radio('BINGO FUEL, RETURNING TO BASE', 'وصلنا حد الوقود، راجعين للقاعدة', 'jet', ['f.bingo']); }
  // an escort is done when the convoy is in (the targets down or not); an operation when its last phase is
  const escort = friends.some(f => f.escort);
  let done = escort ? S.convoyIn : open === 0;
  if (done && !AC.downed && S.phaseI < missionPhases.length) {
    if (!S.nextPh) { S.nextPh = true; radio('ALL TARGETS DOWN, STAND BY FOR TASKING', 'حُيِّدت الأهداف، انتظر المهمة التالية', 'ops', ['o.down']); timers.push({ t: 14, fn: nextPhase }); }
    done = false;
  }
  if (done && missionRtb && !(plane.mode === 'pad')) {
    if (!S.rtb) { S.rtb = true; radio('MISSION COMPLETE, RETURN TO BASE', 'أُنجزت العملية، عُد إلى القاعدة', 'ops', ['o.done']); }
    done = false;
  }
  if (done || noAmmo || AC.downed || lost || bingo || home) {
    // (a sortie from the base flies home and lands first, jetHomeStart: the result stands now, the card once it is in)
    S.home = jetHomeOk(); S.phase = S.home ? 'play' : 'end';
    const kia = targets.filter(t => !t.alive).length, esc = targets.filter(t => t.escaped).length;
    $('#stKill').textContent = kia + '/' + targets.length; $('#stEsc').textContent = String(esc); $('#stShots').textContent = String(S.shots);
    const m = Math.floor(S.missionT / 60), s = Math.floor(S.missionT % 60); $('#stTime').textContent = pad(m, 2) + ':' + pad(s, 2);
    $('#endText').textContent = (AC.downed ? Lg('أُسقطت الطائرة.', 'The aircraft was shot down.') : bingo && !done ? Lg('بلغت الطائرة حد الوقود وعادت قبل تحييد كل الأهداف.', 'The aircraft reached bingo fuel and went home before every target was down.') : S.unable ? Lg('اعتذرت عن المهمة، فبقيت الطائرة على الأرض والمهمة رجعت للعمليات.', 'You declined the tasking: the aircraft stayed on the ground, the tasking back to ops.') : home && !done ? Lg('عاد الطاقم بالطائرة إلى القاعدة قبل تحييد كل الأهداف.', 'The crew took the aircraft home before every target was down.') : lost ? Lg('سقطت القوة الصديقة قبل أن يحسم الإسناد المعركة.', 'The friendly force was lost before the support decided the fight.') : S.rtb ? Lg('أُنجزت العملية بمراحلها كلها، وعادت الطائرة إلى القاعدة.', 'The operation is complete in all its phases, and the aircraft is back at the base.') : S.convoyIn ? Lg('وصل الرتل الصديق إلى وجهته' + (open ? '.' : '، وحُيِّدت الأهداف كلها.'), 'The friendly column reached its destination' + (open ? '.' : ', and every target is down.')) : kia === targets.length ? Lg('حُيِّدت الأهداف كلها.', 'Every target is down.') : noAmmo ? Lg('نفدت الذخيرة قبل تحييد كل الأهداف.', 'Out of ammunition before every target was down.') : Lg('انسحبت بعض المركبات خارج منطقة المراقبة.', 'Some vehicles got out of the area.'))
      + (S.fratKill || S.frat ? Lg(' نيران صديقة على قواتنا.', ' Friendly fire on our troops.') : S.blueLost ? Lg(' خسائر صديقة: ' + S.blueLost + '.', ' Friendly losses: ' + S.blueLost + '.') : '') + (AC.hits && !AC.downed ? Lg(' الطائرة أصيبت ' + AC.hits + ' مرة.', ' The aircraft was hit ' + AC.hits + (AC.hits === 1 ? ' time.' : ' times.')) : '');
    const sc = scoreMission(), acc = S.shots ? Math.round(S.hits / S.shots * 100) : 0;
    $('#stScore').textContent = String(sc.score); $('#stRate').textContent = EN ? sc.en.charAt(0) + sc.en.slice(1).toLowerCase() : sc.ar; $('#stRateEn').textContent = EN ? 'SCORE' : sc.en;
    $('#stAcc').textContent = acc + '%'; $('#stCiv').textContent = String(S.civHit);
    $('#stCiv').parentNode.classList.toggle('bad', S.civHit > 0);
    let best = {}; try { best = JSON.parse(localStorage.getItem(mapKey('saqr.best')) || '{}'); } catch (_) {}
    const isBest = sc.score > (best[missionId] || -1e9);
    if (isBest) { best[missionId] = sc.score; try { localStorage.setItem(mapKey('saqr.best'), JSON.stringify(best)); } catch (_) {} }
    const mNm = mName(MISSIONS.find(m => m.id === missionId) || {});
    $('#stBest').textContent = isBest ? Lg('أفضل نتيجة لهذه المهمة', 'Best score for this mission') : Lg('أفضل نتيجة: ', 'Best score: ') + best[missionId];
    $('#endTitle').textContent = Lg('انتهت المهمة · ', 'Mission over · ') + mNm;
    const cp = campEnd(sc, !AC.downed && !lost && (escort ? S.convoyIn : targets.every(t => !t.alive || t.escaped)));
    $('#btnAgain').querySelector('b').textContent = !cp ? Lg('إعادة المهمة', 'Fly it again') : cp.last ? Lg('حملة جديدة', 'New campaign') : cp.won ? Lg('الطلعة التالية', 'Next sortie') : Lg('إعادة الطلعة', 'Fly the sortie again');
    if (cp) {
      $('#endTitle').textContent = (cp.last ? Lg('انتهت الحملة', 'Campaign over') : Lg('الحملة · الطلعة ', 'Campaign · sortie ') + Math.min(cp.c.step + (cp.won ? 0 : 1), cp.n) + '/' + cp.n) + ' · ' + mNm;
      $('#stBest').textContent = Lg('مجموع الحملة: ', 'Campaign total: ') + cp.c.score + (cp.c.carry.length && !cp.last ? Lg(' · أفلت منك ' + cp.c.carry.length + ' وسيظهر في الطلعة التالية', ' · ' + cp.c.carry.length + ' got away and will turn up next sortie') : '') + (cp.c.civ ? Lg(' · إصابات مدنية في الحملة: ', ' · civilian casualties in the campaign: ') + cp.c.civ : '');
    }
    const show = () => { S.phase = 'end'; $('#eBg').style.backgroundImage = mImg('debrief'); showTape(); $('#ovEnd').hidden = false; syncUI(); };
    if (S.home) jetHomeStart(show); else setTimeout(show, 4000);
    syncUI();
  }
}

