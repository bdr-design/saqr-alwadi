/* ===================== UI ===================== */
function setWeapon(w) { S.weapon = w; syncUI(); }
function toggleArm() { if (S.phase !== 'play') return; S.armed = !S.armed; Snd.tone(S.armed ? 660 : 440, 0.06); syncUI(); }
function toggleLock() { if (S.tracking) unlock(); else if (S.sel && S.sel.alive) lockOn(S.sel, true); else lockNearest(); }
function toggleFreeze() {
  S.frozen = !S.frozen;
  $('#btnFreeze').classList.toggle('on', S.frozen);
  $('#frzA').style.display = $('#frzB').style.display = S.frozen ? 'none' : '';
  $('#frzP').style.display = S.frozen ? '' : 'none';
  $('#btnFreeze').setAttribute('aria-label', S.frozen ? Lg('استئناف المشهد', 'Resume') : Lg('تجميد المشهد', 'Freeze'));
}
function setNight(n) {
  S.night = n;
  $('#mDay').classList.toggle('on', !n); $('#mNight').classList.toggle('on', n);
  post.uniforms.night.value = n ? 1 : 0; postGrain();
  for (const v of vehicles) placeVehicle(v);
  for (const g of groups) placeGroup(g);
  for (const h of houses) placeHouse(h);
  ckImg.src = CK_IMG + (n ? 'night' : 'day') + '.webp'; $('#glareT').style.display = n ? 'none' : '';
  // displays turned down for night vision goggles (the MPD MODE knobs can change it back)
  for (const m of Object.values(CK.mpd)) if (m.mode !== 'MONO') m.mode = n ? 'NT' : 'DAY';
  applyMpd(); applyPanel(); if (typeof kpDraw === 'function') kpDraw();
  try { localStorage.setItem('saqr.night', n ? '1' : '0'); } catch (_) {}
  applySky();
}
// The evening and the weather. Dusk: the day's light but the sun low in the west, warm and weaker, the shadows long;
// a dust storm: the TV's picture washed out (the thermal far less), the canopy's view into a brown haze. The
// settings' «الوقت» (day, dusk, night) holds where the mission does not say; one set by day may be flown at dusk
const DUSK_SUN = new THREE.Vector3(-0.97, 0.05, 0.07).normalize(), DAY_SUN = new THREE.Vector3(-0.695, -0.487, 0.53);
function applySky() {
  const dusk = S.dusk && !S.night, dk = S.wx === 'dust' ? 1 : 0;
  post.uniforms.dusk.value = winMat.uniforms.dusk.value = dusk ? 1 : 0;
  post.uniforms.dustK.value = winMat.uniforms.dustK.value = dk;
  winMat.uniforms.sunD.value.copy(dusk ? DUSK_SUN : DAY_SUN);
  app.classList.toggle('tDusk', dusk); app.classList.toggle('wDust', !!dk);
  for (const v of vehicles) placeVehicle(v);
  for (const g of groups) placeGroup(g);
  for (const h of houses) placeHouse(h);
}
function setTod(t) {
  S.todPref = t; try { localStorage.setItem('saqr.tod', t); } catch (_) {}
  S.dusk = t === 'dusk'; setNight(t === 'night');
}
function setWx(w) { S.wx = w; try { localStorage.setItem('saqr.wx', w); } catch (_) {} applySky(); }
// the shadows' length with the sun's height: the evening's three times the afternoon's, the moon's a short smudge
const sunLen = () => S.night ? 0.48 : S.dusk ? 2.6 : 1;
function postGrain() { post.uniforms.grain.value = S.sensor !== 'eo' ? 0.034 : S.night ? (JET ? 0.065 : 0.04) : 0.018; }
function setSensor(s) {
  if (s !== S.sensor && S.phase !== 'brief') S.blank = 1;
  S.sensor = s;
  const ir = s === 'eo' ? 0 : s === 'wh' ? 1 : 2;
  post.uniforms.ir.value = ir; postGrain();
  // long-wave infrared sees through dust and most smoke
  smokeL.mesh.material.uniforms.amul.value = ir ? 0.3 : 1;
  $('#sEO').classList.toggle('on', !ir); $('#sIR').classList.toggle('on', !!ir);
  $('#sPol').textContent = s === 'bh' ? 'BHOT' : 'WHOT';
  try { localStorage.setItem('saqr.sensor', s); } catch (_) {}
}
function cycleSensor() { setSensor(S.sensor === 'eo' ? 'wh' : S.sensor === 'wh' ? 'bh' : 'eo'); }
function setSound(on) {
  if (on && !Snd.init()) return;
  S.soundOn = on; Snd.setOn(on);
  $('#btnSound').classList.toggle('on', on);
  $('#sndX').style.display = on ? 'none' : ''; $('#sndW').style.display = on ? '' : 'none';
  $('#btnSound').setAttribute('aria-label', on ? Lg('إيقاف الصوت', 'Sound off') : Lg('تشغيل الصوت', 'Sound on'));
}
const FILTERS = [['all', Lg('الكل', 'All'), 'ALL'], ['vehicle', Lg('مركبات', 'Vehicles'), 'VEH'], ['personnel', Lg('أفراد', 'Troops'), 'PAX']];
document.querySelectorAll('#railL [data-z]').forEach(b => b.addEventListener('click', () => { S.zoomGoal = Number(b.dataset.z); syncUI(); }));
// tapped again, a weapon steps through its kinds: Rumh laser / radar, the rocket warheads
document.querySelectorAll('.wpn').forEach(b => b.addEventListener('click', () => {
  const w = b.dataset.w;
  if (w === S.weapon && w === 'msl') S.hfType = nextType(S.hf, S.hfType); else if (w === S.weapon && w === 'rkt') S.rkType = nextType(S.rk, S.rkType);
  setWeapon(w);
}));
$('#prevT').addEventListener('click', () => cycle(-1));
$('#nextT').addEventListener('click', () => cycle(1));
$('#btnFilter').addEventListener('click', () => {
  const i = (FILTERS.findIndex(f => f[0] === S.filter) + 1) % FILTERS.length;
  S.filter = FILTERS[i][0]; $('#fAr').textContent = FILTERS[i][1]; $('#fEn').textContent = FILTERS[i][2];
  if (S.sel && !matchF(S.sel)) unlock();
});
$('#mDay').addEventListener('click', () => setNight(false));
$('#mNight').addEventListener('click', () => setNight(true));
$('#sEO').addEventListener('click', () => setSensor('eo'));
// tapping the active thermal button flips polarity, as on a real pod
$('#sIR').addEventListener('click', () => setSensor(S.sensor === 'wh' ? 'bh' : S.sensor === 'bh' ? 'wh' : 'wh'));
$('#btnSound').addEventListener('click', () => setSound(!S.soundOn));
$('#btnFreeze').addEventListener('click', toggleFreeze);
$('#btnLock').addEventListener('click', toggleLock);
$('#btnCenter').addEventListener('click', () => { unlock(); S.free = false; S.aimGoal.x = W0 / 2; S.aimGoal.y = H0 / 2; S.zoomGoal = 1; syncUI(); });
$('#btnArm').addEventListener('click', toggleArm);
// the flight mode lives on the aircraft's own keys (TSD / FLT pages, the right console); the TEDAC says what was set
function syncFlight() { CK.msg = { s: { orbit: 'ORBIT', h1: 'HOVER 1', h2: 'HOVER 2', route: 'PATROL', hp: 'FLY TO', base: 'RTB', pad: 'ON PAD', run: 'RUN-IN' }[plane.mode], t: 1.6 }; }
$('#btnCock').addEventListener('click', () => setCockpit(true));

$('#btnFire').addEventListener('click', fire);
$('#btnShot').addEventListener('click', snapshot);
$('#btnShotClose').addEventListener('click', () => { $('#ovShot').hidden = true; });
function setQuality(hi) {
  HIQ = hi; PR = Math.min(window.devicePixelRatio || 1, hi ? 3 : 2); slowT = 0;
  try { localStorage.setItem('saqr.hi', hi ? '1' : '0'); } catch (_) {}
  for (const b of document.querySelectorAll('#segQ button')) b.classList.toggle('on', (b.dataset.q === '1') === hi);
  resize();
}
for (const b of document.querySelectorAll('#segQ button')) b.addEventListener('click', () => setQuality(b.dataset.q === '1'));
// main menu: panels, settings, which mission
const segOn = (id, f) => { for (const b of document.querySelectorAll('#' + id + ' button')) b.classList.toggle('on', f(b)); };
// a mission's card: its kind (by its id), the time of day, where the aircraft starts, a difficulty from what it holds
const MTYPE = [[/_train$/, 'تدريب', '#ffd84a', 'Training'], [/^j_tst/, 'هدف حساس للوقت', '#ff6b7d', 'Time-sensitive'], [/_(sea|land)$/, 'اعتراض بحري', '#5fb8e0', 'Maritime'], [/_armor$/, 'اعتراض رتل', '#ffb35c', 'Interdiction'], [/^j_(strike|night)/, 'ضربة', '#ff8a73', 'Strike'], [/^j_cas/, 'إسناد قوات', '#7fe08f', 'Close support'],
  [/escort/, 'مرافقة', '#7cc8ff', 'Escort'], [/tic|quay/, 'إسناد قوات', '#7fe08f', 'Close support'], [/def/, 'دفاع', '#c79bff', 'Defence'], [/_op$/, 'عملية', '#5fe0d6', 'Operation'],
  [/convoy|night|cross/, 'اعتراض رتل', '#ffb35c', 'Interdiction'], [/custom/, 'مخصّصة', '#d8d8d8', 'Custom'], [/./, 'ضربة', '#ff8a73', 'Strike']];
// a mission's name and briefing in the language chosen (its English name is its code, in capitals)
const mName = m => EN ? (m.custom ? 'CUSTOM' : m.en) : m.ar;
const mDescL = m => EN ? m.desc_en || m.desc : m.desc;
const ICO = { sun: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4"/></svg>',
  moon: '<svg viewBox="0 0 24 24"><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/></svg>' };
// «3 مهام» … «10 مهام», «11 مهمة»
const nMissions = n => n + (EN ? (n === 1 ? ' mission' : ' missions') : n >= 3 && n <= 10 ? ' مهام' : ' مهمة');
function missionMeta(m) {
  const type = MTYPE.find(([re]) => re.test(m.id));
  const lay = m.layout === undefined && m.custom ? (edLoad() || []) : m.layout || [];
  const n = lay.filter(it => (it.t === 'veh' || it.t === 'pax') && it.side !== 'blue' || it.t === 'house' && it.role === 'hostile').length + (m.layout === null ? 9 : 0);
  const night = m.night == null ? S.night : m.night, hard = night || lay.some(it => it.aa) || (m.phases || []).length;
  // (type: the kind's Arabic name, the key to its picture; typeL, start: as shown)
  return { type: type[1], typeL: Lg(type[1], type[3]), color: type[2], night, start: JET ? Lg('في الجو', 'Airborne') : { pad: Lg('من القاعدة', 'From the pad'), orbit: Lg('مدار', 'Orbit'), h1: Lg('تحويم', 'Hover'), h2: Lg('تحويم', 'Hover') }[m.fly] || Lg('مدار', 'Orbit'),
    lvl: Math.min(3, 1 + (n >= 10 ? 1 : 0) + (n >= 14 || hard ? 1 : 0)) };
}
// The campaign (on the theatre): five sorties in order, a story through them. What gets away from one (a vehicle
// that escaped, the smugglers' dhow) is there again in the next, about its area (a boat on the water), and an SAM-R
// left standing moves with its column; civilians harmed are counted and the next briefing says so. A sortie lost
// (the aircraft down, ours lost) is flown again; the scores add up. Kept per aircraft in localStorage
const CAMP = { f15: ['j_strike', 'j_armor', 'j_sea', 'j_land', 'j_op'], ah64: ['th_tic', 'th_port', 'th_armor', 'th_sea', 'th_op'] };
const CAMP_STORY_EN = ['The start: strike the enemy\'s depots before he moves.', 'The enemy answers: an armoured column comes down the valley.', 'Beaten on land, he smuggles his weapons by sea.', 'He tries a landing on the coast.', 'The last operation, to settle the valley.'];
const CAMP_STORY = ['البداية: ضرب مخازن العدو قبل أن يتحرك.', 'العدو يرد: رتل مدرع ينزل من الوادي.', 'بعد خسارته البرية يهرّب سلاحه بحرًا.', 'يحاول إنزالًا على الساحل.', 'العملية الأخيرة لحسم الوادي.'];
const campKey = () => 'saqr.camp.' + (JET ? 'f15' : 'ah64');
const campIds = () => MAP_ID === 'theater' ? CAMP[JET ? 'f15' : 'ah64'].filter(id => MISSIONS.some(m => m.id === id)) : [];
function campLoad() { try { const c = JSON.parse(lsGet(campKey()) || 'null'); if (c && c.v === 1) return c; } catch (_) {} return { v: 1, step: 0, score: 0, carry: [], civ: 0 }; }
function campSave(c) { lsSet(campKey(), JSON.stringify(c)); }
const campMission = () => { const ids = campIds(), c = campLoad(); return ids.length ? MISSIONS.find(m => m.id === ids[Math.min(c.step, ids.length - 1)]) : null; };
// the units carried over, put about the mission's area: on the land (a vehicle), on the water (a boat)
function campLayout(mi, carry) {
  const lay = (mi.layout || []).map(it => ({ ...it })), c = mi.jet && mi.jet.c ? { x: mi.jet.c[0], y: mi.jet.c[1] } : layoutCentre(lay) || { x: W0 / 2, y: H0 / 2 };
  carry.forEach((u, n) => {
    for (let r = (u.sea ? 150 : 60) * PXM, k = 0; k < 400; k++, r += 3 * PXM) {
      const a = n * 2.4 + k * 0.7, x = c.x + Math.cos(a) * r, y = c.y + Math.sin(a) * r;
      if (x < 30 || y < 30 || x > W0 - 30 || y > H0 - 30 || onWater(x, y) !== !!u.sea) continue;
      lay.push(u.sea ? { t: 'veh', k: u.k, x, y, h: a, sea: true, loop: !!boatLoop(x, y, a), spd: 4 } : { t: 'veh', k: u.k, x, y, h: a, move: false, dir: 1, spd: 9.5 });
      break;
    }
  });
  return lay;
}
function campStart() {
  const c = campLoad(), ids = campIds();
  if (c.step >= ids.length) { campSave(Object.assign(c, { step: 0, score: 0, carry: [], civ: 0 })); }
  const mi = campMission(); if (!mi) return;
  menuMission = 'campaign'; if (JET && mi.jet && LOADOUTS[mi.jet.load]) S.load = mi.jet.load;
  startMission(campLayout(mi, campLoad().carry), mi); S.camp = true;
}
// the sortie over: won (all down or got away, the aircraft and ours whole) moves the campaign on with what got away
function campEnd(sc, won) {
  if (!S.camp) return null;
  const c = campLoad(), ids = campIds();
  if (won) {
    c.score += sc.score; c.civ += S.civHit; c.step++;
    c.carry = targets.filter(t => t.kind === 'vehicle' && !t.civil && (t.escaped || (t.vk === 'sa8' && t.alive))).map(t => ({ k: t.vk, sea: t.mode === 'sea' }));
  }
  campSave(c);
  return { c, n: ids.length, won, last: c.step >= ids.length };
}
// the menu's pictures (sprites/menu): a photograph per kind of mission, per map, the aircraft in flight and in its shelter
const MK_IMG = { 'ضربة': 'k_strike', 'إسناد قوات': 'k_tic', 'اعتراض رتل': 'k_convoy', 'مرافقة': 'k_escort', 'دفاع': 'k_def', 'عملية': 'k_op', 'هدف حساس للوقت': 'k_strike' };
const MAP_IMG = { valley: 'map_wadi', desert: 'map_desert', port: 'map_port', theater: 'map_theater' };
const mImg = k => `url(sprites/menu/${k}.webp)`;
// where a mission happens on its map: the jet's first orbit, else the middle of the enemy it holds (or its convoy's halt)
function missionPoint(m) {
  if (m.jet && m.jet.c) return { x: m.jet.c[0], y: m.jet.c[1] };
  const lay = m.custom ? (edLoad() || []) : m.layout || [];
  let x = 0, y = 0, n = 0;
  for (const it of lay) if (it.x != null && it.side !== 'blue') { x += it.x; y += it.y; n++; }
  if (!n) for (const it of lay) if (it.convoy && it.side !== 'blue') { const q = roadAt(it.haltS != null ? it.haltS : it.s, {}); x += q.x; y += q.y; n++; }
  return n ? { x: x / n, y: y / n } : { x: W0 / 2, y: H0 / 2 };
}
const ICO_W = '<svg viewBox="0 0 36 16"><path d="M2 8c0-3 3-5 9-5h14l6-3v16l-6-3H11C5 13 2 11 2 8z" fill="currentColor"/></svg>';
function syncMenu() {
  segOn('segQ', b => (b.dataset.q === '1') === HIQ);
  segOn('segT', b => b.dataset.t === (S.night ? '1' : S.dusk ? '2' : '0'));
  segOn('segW', b => (b.dataset.w === '1') === (S.wx === 'dust'));
  segOn('segJ', b => (b.dataset.j === 'air') === JX.air); $('#optJStart').hidden = !AB;
  segOn('segC', b => (b.dataset.c === 'eo') === (S.sensor === 'eo'));
  segOn('segS', b => (b.dataset.s === '1') === S.soundPref);
  segOn('segG', b => (b.dataset.g === '1') === S.assist);
  segOn('segR', b => (b.dataset.r === 'ar') === !!S.radioAr);
  // (the choice only once there is an Arabic radio to choose: the owner's own recordings, tools/make_radio_ar.py)
  $('#optRadio').hidden = !RADIO_A && !RADIO_AJ;
  segOn('segL', b => b.dataset.l === S.load);
  segOn('segAC', b => (b.dataset.a === 'f15') === JET);
  $('#mLoadD').textContent = JET ? Lg('TGP-9 وصاروخا AAM-S في كل الحمولات', 'TGP-9 pod and two AAM-S in every loadout') : Lg('المدفع 30 ملم و1,200 طلقة في كل الحمولات', 'The 30 mm gun and 1,200 rounds in every loadout');
  const lay = edLoad(), n = lay ? lay.filter(it => it.t !== 'house' || it.role === 'hostile').length : 0;
  // (the first mission when none is chosen; the jet's comes with its own loadout)
  const camp = campIds().length ? campLoad() : null, campM = camp && campMission();
  if (menuMission === 'campaign' && !campM) menuMission = null;
  if (!menuMission || (menuMission !== 'campaign' && !MISSIONS.some(m => m.id === menuMission)) || (!n && menuMission === 'custom')) { menuMission = MISSIONS[0].id; if (JET && MISSIONS[0].jet && LOADOUTS[MISSIONS[0].jet.load]) S.load = MISSIONS[0].jet.load; }
  let best = {}; try { best = JSON.parse(lsGet(mapKey('saqr.best')) || '{}'); } catch (_) {}
  const list = $('#mList'), keep = list.scrollLeft; list.replaceChildren();
  if (campM) {
    const b = document.createElement('button'), N = campIds().length, done = camp.step >= N;
    b.type = 'button'; b.className = 'mc camp' + (menuMission === 'campaign' ? ' on' : ''); b.style.setProperty('--c', '#ffd84a'); b.style.setProperty('--img', mImg('k_op'));
    b.innerHTML = '<span class="t"><span></span></span><b></b><span class="s"><span class="ms"></span></span>';
    b.querySelector('.t span').textContent = Lg('الحملة', 'Campaign'); b.querySelector('b').textContent = Lg('حملة صقر الوادي', 'SAQR AL-WADI CAMPAIGN');
    b.querySelector('.ms').textContent = done ? Lg('اكتملت · ', 'Complete · ') + camp.score : Lg('الطلعة ', 'Sortie ') + (camp.step + 1) + '/' + N + (camp.score ? ' · ' + camp.score : '');
    b.onclick = () => { menuMission = 'campaign'; const mi = campMission(); if (JET && mi.jet && LOADOUTS[mi.jet.load]) S.load = mi.jet.load; syncMenu(); };
    list.append(b);
  }
  for (const m of MISSIONS) {
    const mm = missionMeta(m), b = document.createElement('button');
    b.type = 'button'; b.className = 'mc' + (m.id === menuMission ? ' on' : ''); b.disabled = m.custom && !n;
    b.style.setProperty('--c', mm.color); b.style.setProperty('--img', mImg(MK_IMG[mm.type] || MAP_IMG[MAP_ID]));
    b.innerHTML = `<span class="t"><span></span>${mm.night ? ICO.moon : ICO.sun}</span><b></b>`
      + `<span class="s"><span class="lvl" data-l="${mm.lvl}" title="${Lg('الصعوبة', 'Difficulty')}"><i></i><i></i><i></i></span>${best[m.id] != null ? '<span class="star"></span>' : '<span class="ms"></span>'}</span>`;
    b.querySelector('.t span').textContent = mm.typeL; b.querySelector('b').textContent = mName(m);
    if (best[m.id] != null) b.querySelector('.star').textContent = '★ ' + best[m.id]; else b.querySelector('.ms').textContent = m.custom ? n + Lg(' أهداف', ' targets') : mm.start;
    b.onclick = () => { menuMission = m.id; if (JET && m.jet && LOADOUTS[m.jet.load]) S.load = m.jet.load; syncMenu(); };
    list.append(b);
  }
  list.scrollLeft = keep;
  $('#mCount').textContent = nMissions(MISSIONS.filter(m => !m.custom).length);
  const inCamp = menuMission === 'campaign', mi = inCamp ? campM : MISSIONS.find(m => m.id === menuMission), mm = missionMeta(mi), mt = $('#mTitle');
  mt.replaceChildren(); const tb = document.createElement('b'); tb.textContent = inCamp ? Lg('الحملة: ', 'Campaign: ') + mName(mi) : mName(mi); const te = document.createElement('i'); te.textContent = inCamp ? 'CAMPAIGN · ' + mi.en : mi.custom ? 'CUSTOM' : mi.en; mt.append(tb); if (!EN) mt.append(te);
  $('#mDesc').textContent = (inCamp ? (camp.step >= campIds().length ? Lg('اكتملت الحملة بمجموع ' + camp.score + '. «ابدأ» يبدأ حملة جديدة. ', 'Campaign complete, ' + camp.score + ' in all. «Start» begins a new one. ') : Lg('الطلعة ' + (camp.step + 1) + ' من ' + campIds().length + ': ' + CAMP_STORY[camp.step] + ' ', 'Sortie ' + (camp.step + 1) + ' of ' + campIds().length + ': ' + CAMP_STORY_EN[camp.step] + ' '))
    + (camp.carry.length ? Lg('من الطلعة السابقة أفلت ' + camp.carry.length + ' (' + camp.carry.map(u => SPR[u.k] ? SPR[u.k].ar : u.k).join('، ') + ') وهم الآن في منطقة هذه. ', camp.carry.length + ' got away last sortie (' + camp.carry.map(u => SPR[u.k] ? SPR[u.k].en : u.k).join(', ') + ') and are in this one\'s area now. ') : '')
    + (camp.civ ? Lg('تنبيه: ' + camp.civ + ' إصابة مدنية في الحملة حتى الآن؛ دقّق قبل الإطلاق. ', 'Warning: ' + camp.civ + ' civilian casualties in the campaign so far; check before you release. ') : '') : '') + mDescL(mi) + ' ';
  if (best[mi.id] != null) { const bb = document.createElement('b'); bb.textContent = Lg('أفضل نتيجة: ', 'Best score: ') + best[mi.id]; $('#mDesc').append(bb); }
  // the briefing's facts, the next-mission tile, the hangar's line
  $('#nBrief').style.setProperty('--c', mm.color); $('#nBTy').textContent = mm.typeL;
  const pill = t => { const e = document.createElement('span'); e.className = 'nPill'; e.textContent = t; return e; };
  const lv = document.createElement('span'); lv.className = 'nPill'; lv.innerHTML = Lg('الصعوبة', 'Difficulty') + ' <span class="lvl" data-l="' + mm.lvl + '"><i></i><i></i><i></i></span>';
  const facts = [pill(mm.start), pill(mm.night ? Lg('ليل', 'Night') : Lg('نهار', 'Day'))];
  if (JET && mi.jet) { const f = pill(Math.round((mi.jet.ft || 15000) / 1000) + 'K ft · ' + Math.round((mi.jet.R || 5000) / 1000) + ' km'); f.style.direction = 'ltr'; facts.push(f); }
  $('#nFacts').replaceChildren(...facts, lv);
  $('#nNextT').textContent = mName(mi); $('#nNext').style.backgroundImage = mImg(MK_IMG[mm.type] || MAP_IMG[MAP_ID]); $('#nNext').style.setProperty('--c', mm.color);
  $('#nNextM').replaceChildren(pill(mm.typeL), pill(mm.start), pill(mm.night ? Lg('ليل', 'Night') : Lg('نهار', 'Day')));
  $('#nLS').textContent = mName(mi) + ' · ' + Lg(LOADOUTS[S.load].ar, LOADOUTS[S.load].en);
  menuMap();
}
// The operations map: the map's own coarse tiles (already loaded for the game), its missions marked on it, moved so the
// chosen one sits right of the briefing; the markers keep their size whatever the map's scale
function menuMap() {
  const box = $('#nMap'), inn = $('#nMapIn'), W = box.clientWidth || VW, H = box.clientHeight || VH;
  if (!inn.childElementCount) {
    inn.style.width = W0 + 'px'; inn.style.height = H0 + 'px';
    const lv = LEVELS[0];
    for (let ty = 0; ty < lv.ny; ty++) for (let tx = 0; tx < lv.nx; tx++) {
      const im = document.createElement('img'); im.alt = ''; im.decoding = 'async'; im.src = MAP.dir + 'tiles/0/' + tx + '_' + ty + '.jpg';
      im.style.left = tx * TILE + 'px'; im.style.top = ty * TILE + 'px'; im.style.width = Math.min(TILE, W0 - tx * TILE) + 'px'; im.style.height = Math.min(TILE, H0 - ty * TILE) + 'px';
      inn.append(im);
    }
  }
  for (const e of inn.querySelectorAll('.nMk')) e.remove();
  const k = Math.max(W / W0, H / H0) * 1.15;
  inn.style.setProperty('--ik', String(1 / k));
  const mk = (x, y, cls, html) => { const e = document.createElement('div'); e.className = 'nMk ' + cls; e.style.left = x + 'px'; e.style.top = y + 'px'; e.innerHTML = html; inn.append(e); return e; };
  if (BASE && MAP.base && !JET) { const a = MAP.base.area; mk((a[0] + a[2]) / 2, (a[1] + a[3]) / 2, 'base', 'FOB'); }
  let sel = null;
  for (const m of MISSIONS) {
    if (m.custom && !(edLoad() || []).length) continue;
    const q = missionPoint(m), mm = missionMeta(m), on = m.id === menuMission;
    // (only the chosen one is named: several missions share a place; a touch on a marker picks it)
    const e = mk(q.x, q.y, on ? 'on' : '', on ? '<i class="r1"></i><div class="d"></div><div class="l"></div>' : '<div class="d"></div>');
    e.style.setProperty('--c', mm.color); if (on) e.querySelector('.l').textContent = mName(m); e.style.zIndex = on ? 2 : 1;
    e.title = mName(m); e.onclick = () => { menuMission = m.id; if (JET && m.jet && LOADOUTS[m.jet.load]) S.load = m.jet.load; syncMenu(); };
    if (on) sel = q;
  }
  sel = sel || { x: W0 / 2, y: H0 / 2 };
  let tx = W * 0.6 - sel.x * k, ty = H * 0.44 - sel.y * k;
  // (the map may leave the screen's edge a little: the chosen place stays clear of the briefing)
  tx = clamp(tx, Math.min(0, W - W0 * k) - W * 0.3, W * 0.3); ty = clamp(ty, Math.min(0, H - H0 * k) - H * 0.2, H * 0.2);
  inn.style.transform = `translate(${tx}px,${ty}px) scale(${k})`;
}
// the menu's screens; their pictures only while the menu shows
let menuScr = 'home';
function menuBg() {
  const on = !$('#ovStart').hidden, ac = JET ? 'f15' : 'ah64', bg = $('#nBg'), vg = $('#nVig');
  const pic = !on ? '' : menuScr === 'home' ? mImg('hero_' + ac) : menuScr === 'arm' ? mImg('hangar_' + ac) : menuScr === 'set' ? mImg('hero_' + ac) : '';
  bg.style.backgroundImage = pic; bg.style.filter = menuScr === 'set' ? 'brightness(0.4) saturate(0.6) blur(3px)' : '';
  bg.style.backgroundPosition = menuScr === 'arm' ? '22% 50%' : '30% 50%';
  vg.style.background = menuScr === 'home' ? 'linear-gradient(to top, rgba(6,8,10,.9) 0%, rgba(6,8,10,.4) 36%, rgba(6,8,10,0) 58%), linear-gradient(to left, rgba(6,8,10,.62) 0%, rgba(6,8,10,0) 48%)'
    : menuScr === 'arm' ? 'linear-gradient(to left, rgba(6,8,10,.8) 0, rgba(6,8,10,.45) 55%, rgba(6,8,10,0) 75%), linear-gradient(to bottom, rgba(6,8,10,.6) 0, rgba(6,8,10,0) 70px)' : menuScr === 'set' ? 'rgba(6,8,10,.3)' : 'none';
  $('#nTArm').style.backgroundImage = on ? mImg('hangar_' + ac) : ''; $('#nTOps').style.backgroundImage = on ? mImg(MAP_IMG[MAP_ID]) : ''; $('#btnEdit').style.backgroundImage = on ? mImg('map_wadi') : '';
  for (const b of document.querySelectorAll('#mMaps button')) b.querySelector('i').style.backgroundImage = on ? mImg(MAP_IMG[b.dataset.m]) : '';
  if (!on) { $('#nNext').style.backgroundImage = ''; for (const b of document.querySelectorAll('#mList .mc')) b.style.removeProperty('--img'); }
}
function showScr(id) {
  menuScr = id;
  for (const e of document.querySelectorAll('#ovStart .nScr')) e.classList.toggle('on', e.dataset.scr === id);
  for (const b of document.querySelectorAll('#nTabs button')) b.classList.toggle('on', b.dataset.scr === id);
  $('#panHow').hidden = true;
  syncMenu(); menuBg();
  // the chosen mission's card in view
  if (id === 'ops') { const o = $('#mList .mc.on'), st = $('#ovStart'); if (o) { o.scrollIntoView({ block: 'nearest', inline: 'center' }); st.scrollTop = st.scrollLeft = 0; app.scrollTop = app.scrollLeft = 0; } }
}
for (const b of document.querySelectorAll('#nTabs button')) b.addEventListener('click', () => showScr(b.dataset.scr));
for (const b of document.querySelectorAll('#ovStart [data-go]')) b.addEventListener('click', () => showScr(b.dataset.go));
$('#btnGo').addEventListener('click', () => $('#btnStart').click());
$('#nRole').textContent = JET ? Lg('ضابط الأسلحة · المقعد الخلفي', 'WEAPON SYSTEMS OFFICER · BACK SEAT') : Lg('المدفعي · المقعد الأمامي', 'GUNNER · FRONT SEAT');
$('#nPitch').textContent = JET ? Lg('إسناد جوي قريب فوق الوادي والصحراء والساحل. القنابل الموجّهة من 15,000 قدم، والطيار يستأذنك قبل كل ممر.', 'Close air support over the valley, the desert and the coast. Guided bombs from 15,000 ft, and the pilot asks you before every run.')
  : Lg('المروحية HX-7 «سهم» فوق الوادي: صواريخ «رمح» وقذائف ومدفع 30 ملم، وكاميرا الاستهداف بين يديك.', 'An HX-7 Sahm over the valley: Rumh missiles, rockets and a 30 mm gun, and the targeting camera in your hands.');
// the mission list is defined further down: the first one is picked when the menu is first drawn
let menuMission = null;
{
  const ids = Object.keys(MAPS), box = $('#mMaps');
  for (const id of ids) {
    if (JET && id !== MAP_ID) continue;
    const b = document.createElement('button'); b.type = 'button'; b.className = id === MAP_ID ? 'on' : ''; b.dataset.m = id;
    const nm = id === 'valley' ? 5 : ((JET && MAPS[id].jet) || MAPS[id].missions || []).length;
    const t = document.createElement('span'); t.textContent = Lg(MAPS[id].ar, MAPS[id].en); const c = document.createElement('em'); c.textContent = String(nm);
    b.append(document.createElement('i'), t, c); b.setAttribute('aria-label', Lg(MAPS[id].ar + '، ', MAPS[id].en + ', ') + nMissions(nm));
    // another map: the world is built for one map, so store the choice and load again
    b.onclick = () => { if (id === MAP_ID) return; try { localStorage.setItem('saqr.map', id); } catch (_) {} location.reload(); };
    box.append(b);
  }
  // the loadout, kept between missions
  if (JET) S.load = 'cas';
  try { const l = localStorage.getItem(JET ? 'saqr.load15' : 'saqr.load'); if (LOADOUTS[l]) S.load = l; } catch (_) {}
  const seg = $('#segL');
  for (const [k, L] of Object.entries(LOADOUTS)) {
    const b = document.createElement('button'); b.type = 'button'; b.dataset.l = k;
    const ws = JET ? JW.filter(w => L.n[w]).map(w => [L.t[w], L.n[w]]) : [['RM-1', L.hf.sal + L.hf.rf], ['70 mm', sumOf(L.rk)]].filter(w => w[1]);
    b.innerHTML = '<span class="nm"><b></b><small></small></span><span class="ws">' + ws.map(([w, n]) => '<span class="w">' + ICO_W + w + ' ×' + n + '</span>').join('') + '</span>';
    b.querySelector('b').textContent = Lg(L.ar, L.en); b.querySelector('small').textContent = Lg(L.desc, L.descEn);
    b.addEventListener('click', () => { S.load = k; try { localStorage.setItem(JET ? 'saqr.load15' : 'saqr.load', k); } catch (_) {} syncMenu(); });
    seg.append(b);
  }
}
try { S.soundPref = localStorage.getItem('saqr.sound') !== '0'; } catch (_) { S.soundPref = true; }
try { S.assist = localStorage.getItem('saqr.assist') !== '0'; } catch (_) { S.assist = true; }
// the radio's language: the game's own, until it is set apart
try { const r = localStorage.getItem('saqr.radio'); S.radioAr = r ? r === 'ar' : !EN; } catch (_) { S.radioAr = !EN; }
// the aircraft: another one is another world (its cockpit, its sounds), so store the choice and load again
for (const b of document.querySelectorAll('#segAC button')) b.addEventListener('click', () => { if ((b.dataset.a === 'f15') === JET) return; try { localStorage.setItem('saqr.ac', b.dataset.a); } catch (_) {} location.reload(); });
$('#mSub').textContent = 'SAQR AL-WADI · ' + (JET ? 'ZF-25' : 'HX-7'); $('#ldAc').textContent = JET ? 'ZF-25' : 'HX-7'; $('#ldBg').style.backgroundImage = mImg('load_' + (JET ? 'f15' : 'ah64'));
if (JET) {
  // how to play: the back seat of the ZF-25
  $('#panHow ul').innerHTML = [
    '<b>أنت ضابط الأسلحة</b> في المقعد الخلفي، والطيار في الأمام يطير. كل التحكم بأزرار الطائرة نفسها.',
    '<b>الشاشة الكبيرة:</b> يسارها صورة الحاضنة (TGP-9)، ويمينها الصفحات من أزرارها العليا: <code>TSD</code> الخريطة، و<code>SMS</code> الأسلحة، و<code>TGT</code> الأهداف، و<code>ENG</code> المحركان والوقود.',
    '<b>التسليح:</b> <code>A/S</code> في صفحة <code>SMS</code>، ومنها السلاح: <code>LGB</code> قنبلة ليزر، و<code>GPS</code> قنبلة بالإحداثيات، و<code>AGM</code> برق. أو المس شاشة الـ UFC الصغيرة فوقها لتنتقل بين الأسلحة.',
    '<b>الاستهداف:</b> المس الهدف في صورة الحاضنة أو رمزه في الزجاج، واسحب لتحريكها. المقبض الأيسر تثبيت على الهدف، والأيمن الإطلاق.',
    '<b>ممر القنبلة:</b> إذا كان الهدف خارج مدى القنبلة <b>يستأذنك الطيار</b>: المس النصف الأيسر من الـ UFC للموافقة، والأيمن للبقاء في المدار. ثم يدخل ويعدّ (30، 10، 3) ويطلق آليًا.',
    '<b>قنبلة الليزر</b> تحتاج الحاضنة ثابتة على الهدف حتى تصيب (نحو 30 ث من 15,000 قدم)، وتلاحق المتحرك. <b>قنبلة الـ GPS</b> تذهب للإحداثيات وتُطلق من المدار، ولا تصيب ما يتحرك. <b>البرق:</b> الطيار يوجّه المقدمة، وأنت تطلق حين يقول «جاهز».',
    '<b>الطيران:</b> في صفحة <code>TSD</code>: <code>ORBIT</code> مدار حول ما تنظر إليه الحاضنة، و<code>RAD</code> نصف قطر المدار (5 أو 7 أو 10 كم)، و<code>ALT</code> الارتفاع (15 أو 20 أو 25 ألف قدم)، و<code>SPD</code> السرعة. ولمسة على الخريطة: يطير للنقطة ويدور حولها.',
    '<b>الخطر القريب:</b> هنتر لا يسمح بقنبلة 500 رطل على عدو أقرب من 300 م من قواتنا، ولا بالثقيلة أقرب من 500 م: استخدم البرق.',
    '<b>الهدف الطارئ:</b> يصلك باللاسلكي والحاضنة تتجه إليه. له مهلة، وإن لم تضربه أطلق واختفى.',
    '<b>الوقود:</b> عند 4,000 رطل يعود الطيار للقاعدة وتنتهي المهمة.',
    '<b>البيوت والمباني</b> المدنية ممنوع إصابتها، وكل إصابة تخصم من النقاط وتحدّ التقييم بـ«جيد».',
    '<b>تكبير الحاضنة:</b> <code>FULL</code> أعلى صورتها، وزر «القمرة» يرجع. والنظر: اسحب داخل القمرة، وقرّب بإصبعين.',
  ].map(t => '<li>' + t + '</li>').join('');
  if (EN) $('#panHow ul').innerHTML = [
    '<b>You are the weapon systems officer</b> in the back seat; the pilot up front flies. Everything is done with the aircraft\'s own controls.',
    '<b>The large display:</b> the pod\'s picture (TGP-9) on its left, and on its right the pages from its top buttons: <code>TSD</code> the map, <code>SMS</code> the weapons, <code>TGT</code> the targets, <code>ENG</code> the engines and fuel.',
    '<b>Arming:</b> <code>A/S</code> on the <code>SMS</code> page, and there the weapon: <code>LGB</code> laser bomb, <code>GPS</code> GPS-guided bomb, <code>AGM</code> Barq. Or touch the small UFC display above it to step through the weapons.',
    '<b>Targeting:</b> touch the target in the pod\'s picture or its symbol on the glass, and drag to slew the pod. The left grip locks on the target; the right one releases.',
    '<b>The bomb run:</b> if the target is beyond the bomb\'s reach, <b>the pilot asks you</b>: touch the left half of the UFC to agree, the right half to stay in the orbit. He then runs in, counts down (30, 10, 3) and releases automatically.',
    '<b>The laser bomb</b> needs the pod held on the target until it hits (about 30 s from 15,000 ft), and it follows what moves. <b>The GPS bomb</b> goes to its coordinates and is released from the orbit, but cannot hit what moves. <b>The Barq:</b> the pilot points the nose, and you fire when he says «ready».',
    '<b>Flying:</b> on the <code>TSD</code> page: <code>ORBIT</code> circles what the pod is looking at, <code>RAD</code> the orbit\'s radius (5, 7 or 10 km), <code>ALT</code> the altitude (15, 20 or 25 thousand feet), <code>SPD</code> the speed. A touch on the map: he flies to the point and circles it.',
    '<b>Danger close:</b> Hunter will not clear a 500 lb bomb on an enemy closer than 300 m to our troops, nor the heavy one closer than 500 m: use the Barq.',
    '<b>Pop-up targets:</b> they come by radio and the pod slews to them. Each has its window; miss it and it fires and vanishes.',
    '<b>Fuel:</b> at 4,000 lb the pilot heads home and the mission ends.',
    '<b>Civilian houses and buildings</b> must not be hit; every hit costs points and holds the rating to «Good».',
    '<b>Full-screen pod:</b> <code>FULL</code> above its picture; the «Cockpit» button goes back. Looking: drag inside the cockpit, pinch to zoom.',
  ].map(t => '<li>' + t + '</li>').join('');
  // the dock's three weapons are the jet's
  const J = [['lgb', Lg('قنبلة ليزر', 'Laser bomb')], ['jdam', Lg('قنبلة GPS', 'GPS bomb')], ['agm', Lg('برق', 'Barq')]];
  // (its own weapons from the start: the cockpit behind the menu shows them before the first mission)
  S.weapon = 'lgb'; applyLoadout();
  document.querySelectorAll('.wpn').forEach((b, i) => { b.dataset.w = J[i][0]; b.querySelector('b').textContent = J[i][1]; });
  $('#glareT').style.display = 'none';
}
/* ---- the tutorial: shown at the first START of each aircraft (it must be seen or skipped before the first sortie),
   and again from the menu's «?». A step: the cockpit photograph's point it is about [x, y] (photo pixels) and how far
   in [z] (1: the whole cockpit), the control's legend, and its words in both languages (its own switch). ---- */
const TUT = JET ? [
  { img: 'sprites/tut/f15_live.webp', iw: 1600, ih: 900, x: 800, y: 450, z: 1, key: 'ZF-25 · WSO',
    ar: ['دورك في الطائرة', '<p><b>أنت ضابط الأسلحة</b> في المقعد الخلفي. الطيار في الأمام يقلع ويطير المدار ويدخل الهجمات ويهبط.</p><p>أنت تختار الهدف، وتتحقق منه، وتسلّح، وتعطي الموافقة، وتوجّه قنبلة الليزر. كل شي <b>بأزرار القمرة نفسها</b>: المسها كما هي في الصورة.</p><p>اسحب داخل القمرة للنظر حولك، وقرّب بإصبعين.</p>'],
    en: ['Your seat', '<p><b>You are the weapon systems officer</b> in the back seat. The pilot up front takes off, flies the orbit, runs in on attacks and lands.</p><p>You pick the target, confirm it, arm, give consent and guide the laser bomb, all <b>with the cockpit\'s own controls</b>: touch them where they are.</p><p>Drag inside the cockpit to look around; pinch to zoom.</p>'] },
  { x: 952, y: 430, z: 2.4, key: 'iPad',
    ar: ['الآيباد', '<p>زر لوحة المفاتيح الصغيرة فوق الشاشة الكبيرة <b>يرفع الآيباد وينزّله</b>، أو اسحبه لتحت.</p><p>عليه <b>المهمة</b>: اضغط <code>سننفّذ</code> لقبولها وتبدأ الطلعة. والخريطة، وقائمة التدقيق، وأوامر الطيار: <code>دُر على الهدف</code>، <code>الارتفاع</code>، و<code>عودة للقاعدة</code> بضغطتين.</p><p>من القاعدة توصل المدار خلال دقيقتين، أو اضغط <code>تخطَّ إلى المدرج</code>.</p>'],
    en: ['The iPad', '<p>The small keypad above the large display <b>raises and lowers the iPad</b>; or drag it down.</p><p>On it, <b>the tasking</b>: touch <code>WILCO</code> to accept it and the sortie starts. Also the map, the checklist and the pilot\'s commands: <code>ORBIT TGT</code>, <code>ANGELS</code>, and <code>RTB</code> with two touches.</p><p>From the base you are on station in two minutes, or touch <code>SKIP TO RUNWAY</code>.</p>'] },
  { x: 954, y: 741, z: 2.4, key: 'NEXT',
    ar: ['الهدف التالي', '<p>المقبض تحت الشاشة الكبيرة على اليمين <b>يوجّه الحاضنة للهدف التالي</b>. كل لمسة هدف.</p><p>صورة الحاضنة في <b>يسار الشاشة الكبيرة</b>، ويمينها الخريطة التكتيكية <code>TSD</code>: الأهداف وموقعك والقنبلة في طريقها ووقتها.</p><p>وتقدر تلمس الهدف في صورة الحاضنة مباشرة، أو تسحب عليها لتحريكها.</p>'],
    en: ['Next target', '<p>The knob below the large display, on the right, <b>puts the pod on the next target</b>, one per touch.</p><p>The pod\'s picture is on the <b>left of the large display</b>; on its right the tactical map, <code>TSD</code>: the targets, your position, a weapon on its way and its time.</p><p>You can also touch a target in the pod\'s picture, or drag on it to slew.</p>'] },
  { x: 213, y: 636, z: 2.2, key: 'TRK',
    ar: ['التتبع', '<p>الزر الكبير في <b>المقبض الأيسر</b> يثبّت الحاضنة على الهدف <code>TRK</code>، ولمسة ثانية تفكّه.</p><p>قوة التتبع أسفل الصورة: <code>WEAK</code> ثم <code>MED</code> ثم <code>STRG</code>. التكبير يقوّيه.</p>'],
    en: ['Track', '<p>The large button on the <b>left hand controller</b> locks the pod on the target, <code>TRK</code>; a second touch lets it go.</p><p>The track\'s strength is at the bottom of the picture: <code>WEAK</code>, <code>MED</code>, <code>STRG</code>. Zooming in strengthens it.</p>'] },
  { x: 714, y: 742, z: 2.4, key: 'ZOOM · PID',
    ar: ['التكبير والتحقق', '<p>المقبض تحت الشاشة الكبيرة على اليسار <b>يكبّر الصورة ويصغّرها</b>.</p><p>للتحقق من الهدف (<code>PID</code>): <b>ثبّت عليه وكبّر</b> وانتظر <b>3 ثوانٍ</b>. بعدها يأتي الإذن: من <b>هنتر</b> إذا قواتنا قريبة، أو من العمليات.</p><p>بلا تحقق وبلا إذن ما ينطلق أي سلاح.</p>'],
    en: ['Zoom and PID', '<p>The knob below the large display, on the left, <b>zooms the picture in and out</b>.</p><p>To identify the target (<code>PID</code>): <b>track it, zoom in</b> and hold for <b>3 seconds</b>. Then comes the clearance: from <b>HUNTER</b> when our troops are near, else from Ops.</p><p>Without PID and clearance no weapon leaves.</p>'] },
  { x: 406, y: 689, z: 2.4, key: 'MASTER ARM',
    ar: ['التسليح', '<p>المفتاح <b>الأحمر المحمي</b> في الكونسول الأيسر: <b>مسلّح أو آمن</b>.</p><p>وهو آمن ما ينطلق شي، والطيار يلغي أي هجمة. رجّعه آمن في طريق العودة.</p>'],
    en: ['Master arm', '<p>The <b>red guarded switch</b> on the left console: <b>ARM or SAFE</b>.</p><p>While it is safe nothing is released and the pilot calls off any run. Put it back to safe on the way home.</p>'] },
  { x: 1105, y: 448, z: 2.4, key: 'LB · GB · AGR',
    ar: ['السلاح', '<p>المقبض يمين الشاشة الكبيرة <b>يدور بين الأسلحة</b>: <code>LB</code> قنبلة ليزر، <code>GB</code> قنبلة GPS، <code>AGR</code> صاروخ البرق.</p><p><b>القنبلة ممنوعة</b> على هدف أقرب من 300 م لقواتنا (500 م للثقيلة) أو قرب المدنيين: استخدم <b>البرق</b>. وإذا خلص البرق يقبل هنتر «الخطر القريب» ويسمح بالقنبلة.</p><p>قنبلة الليزر تلاحق المتحرك، وقنبلة الـ GPS للثابت فقط.</p>'],
    en: ['The weapon', '<p>The knob to the right of the large display <b>steps through the weapons</b>: <code>LB</code> laser bomb, <code>GB</code> GPS bomb, <code>AGR</code> the Barq missile.</p><p><b>No bomb</b> on a target closer than 300 m to our troops (500 m for the heavy one) or near civilians: use the <b>Barq</b>. With no Barq left, HUNTER accepts danger close and clears the bomb.</p><p>The laser bomb follows what moves; the GPS bomb is for what stands still.</p>'] },
  { x: 1454, y: 616, z: 2.2, key: 'FIRE',
    ar: ['الإطلاق', '<p>الزر <b>الأحمر في المقبض الأيمن</b>.</p><p><b>القنابل:</b> لما يقول الطيار «جاهز للدخول بموافقتك» اضغطه، فيدخل ويعدّ ويطلق بنفسه. <b>قنبلة الليزر:</b> خلّ التتبع على الهدف لين تصيب (نحو 25 ث).</p><p><b>البرق:</b> اضغطه ليدخل الطيار، ثم اضغطه ثانية لما يصير «في المدى».</p><p>لمستان سريعتان تُحسبان لمسة وحدة.</p>'],
    en: ['Release', '<p>The <b>red button on the right hand controller</b>.</p><p><b>Bombs:</b> when the pilot says «ready for the run, your call», press it; he runs in, counts down and releases. <b>Laser bomb:</b> keep the track on the target until it hits (about 25 s).</p><p><b>Barq:</b> press it to send him in, then again once it reads «in range».</p><p>Two quick touches count as one.</p>'] },
  { img: 'sprites/tut/f15_live.webp', iw: 1600, ih: 900, x: 688, y: 612, z: 2.6, key: 'ASSIST',
    ar: ['المساعد وسطر الحالة', '<p><b>الزر المطلوب يتوهّج بالكهرماني</b>، خطوة خطوة، ويطفئ لما تنتظر شي ما هو بيدك. تقدر توقفه من الإعدادات.</p><p><b>سطر الحالة</b> أسفل صورة الحاضنة يقول ما ينقص أو ما ينتظر: «ثبّت على هدف»، «بانتظار الإذن»، «في الطريق 18 ث».</p><p>رسائل اللاسلكي فوق الصورة، ووسطها يبقى للهدف.</p>'],
    en: ['The assist and the status line', '<p><b>The control you need glows amber</b>, step by step, and goes dark while you wait on something not in your hands. Turn it off in the settings.</p><p><b>The status line</b> under the pod\'s picture says what is missing or awaited: «NO TGT», «CLEARANCE», «TOF 18 s».</p><p>Radio messages sit at the top of the picture; its middle stays clear for the target.</p>'] },
  { x: 952, y: 430, z: 1.6, key: 'REARM · RTB',
    ar: ['الذخيرة والوقود والعودة', '<p>إذا خلصت الذخيرة والأهداف باقية، يسألك الطيار والآيباد يعرض: <code>تذخير سريع</code> (ترجع للمدار بعد 5 دقائق)، <code>تذخير عادي</code> (تهبط وتتذخّر وتقلع)، أو <code>إنهاء والعودة</code>. والمعركة تكمل وأنت غايب.</p><p>عند <b>4,000 رطل وقود</b> يرجع الطيار للقاعدة.</p><p>المدنيون والبيوت المدنية: كل إصابة تخصم من النقاط.</p>'],
    en: ['Ammunition, fuel and home', '<p>Out of weapons with targets left, the pilot asks and the iPad offers <code>QUICK REARM</code> (back on station in 5 minutes), <code>REARM</code> (land, rearm and take off) or <code>HOME</code>. The fight goes on while you are away.</p><p>At <b>4,000 lb of fuel</b> the pilot heads home.</p><p>Civilians and civilian houses: every hit costs points.</p>'] },
] : [
  { img: 'sprites/tut/ah64_live.webp', iw: 1600, ih: 900, x: 800, y: 450, z: 1, key: 'HX-7 · CPG',
    ar: ['دورك في الطائرة', '<p><b>أنت المدفعي</b> في المقعد الأمامي، والطيار خلفك يطير. كل شي <b>بأزرار القمرة نفسها</b>: المسها كما هي في الصورة.</p><p>اسحب للنظر حول القمرة، وقرّب بإصبعين، ونقرتان على الشاشة الوسطى للانحناء نحوها.</p>'],
    en: ['Your seat', '<p><b>You are the gunner</b> in the front seat; the pilot behind you flies. Everything is done <b>with the cockpit\'s own controls</b>: touch them where they are.</p><p>Drag to look around, pinch to zoom, and double-tap the centre display to lean in to it.</p>'] },
  { img: 'sprites/tut/ah64_live.webp', iw: 1600, ih: 900, x: 805, y: 557, z: 2.2, key: 'TEDAC',
    ar: ['الاستهداف', '<p><b>المس الهدف</b> في الشاشة الوسطى أو رمزه الأخضر في الزجاج، و<b>اسحب</b> على الشاشة لتحريك الكاميرا.</p><p>أزرار يمينها: <code>LOCK</code> تثبيت، و<code>NEXT</code> و<code>PREV</code> الهدف التالي والسابق. ويسارها التكبير <code>ZOOM</code> و<code>NFOV</code>.</p>'],
    en: ['Targeting', '<p><b>Touch the target</b> on the centre display or its green symbol on the glass, and <b>drag</b> on the display to slew the camera.</p><p>Keys on its right: <code>LOCK</code>, <code>NEXT</code> and <code>PREV</code>. On its left the zoom, <code>ZOOM</code> and <code>NFOV</code>.</p>'] },
  { x: 647, y: 725, z: 2.2, key: 'LOCK',
    ar: ['التثبيت', '<p><b>المقبض الأيسر</b> يثبّت على الهدف، ولمسة ثانية تفكّ التثبيت.</p><p>صاروخ الرمح بالليزر يحتاج تتبعًا متوسطًا على الأقل: <b>ثبّت وكبّر</b>، وخلّ التثبيت لين يصيب.</p>'],
    en: ['Lock', '<p>The <b>left grip</b> locks on the target; a second touch lets it go.</p><p>The laser Rumh needs at least a medium track: <b>lock and zoom in</b>, and hold the lock until it hits.</p>'] },
  { img: 'sprites/tut/ah64_live.webp', iw: 1600, ih: 900, x: 680, y: 455, z: 2.6, key: 'GUN · RKT · MSL',
    ar: ['السلاح', '<p>أعلى الشاشة الوسطى: <code>GUN</code> المدفع، و<code>RKT</code> الصواريخ، و<code>MSL</code> الرمح.</p><p><b>رمح الليزر</b> لأي هدف، و<b>رمح الرادار</b> بعد مسح <code>FCR</code> بلا ليزر. ورؤوس الصواريخ من <code>WHD</code>: شديد الانفجار، ومسامير للأفراد، وإنارة ليلًا، وموجّه بالليزر.</p>'],
    en: ['The weapon', '<p>Along the top of the centre display: <code>GUN</code> the cannon, <code>RKT</code> rockets, <code>MSL</code> the Rumh.</p><p>The <b>laser Rumh</b> for any target; the <b>radar Rumh</b> after an <code>FCR</code> scan, no laser. Rocket warheads from <code>WHD</code>: high explosive, flechettes for troops, illumination at night, laser-guided.</p>'] },
  { x: 181, y: 862, z: 2.2, key: 'MASTER ARM',
    ar: ['التسليح', '<p>المفتاح <b>الأحمر</b> يسار الكونسول، أو <code>A/S</code> أعلى الشاشة الوسطى: <b>مسلّح أو آمن</b>.</p><p>وهو آمن ما ينطلق شي.</p>'],
    en: ['Master arm', '<p>The <b>red switch</b> on the left of the console, or <code>A/S</code> along the top of the centre display: <b>ARM or SAFE</b>.</p><p>While it is safe nothing fires.</p>'] },
  { x: 1030, y: 725, z: 2.2, key: 'FIRE',
    ar: ['الإطلاق', '<p><b>المقبض الأيمن</b> يطلق السلاح المختار.</p><p>انتبه للقوات الصديقة والمدنيين: كل إصابة مدنية تخصم من النقاط، والنيران الصديقة أشد.</p>'],
    en: ['Fire', '<p>The <b>right grip</b> fires the chosen weapon.</p><p>Mind our troops and the civilians: every civilian hit costs points, friendly fire far more.</p>'] },
  { x: 1349, y: 840, z: 2.4, key: 'ORBIT · HVR',
    ar: ['وضع الطائرة', '<p>المفتاح في الكونسول الأيمن يغيّر وضع الطيران: <code>ORBIT</code> تدور على المنطقة، و<code>HOVER 1</code> و<code>HOVER 2</code> ثابتة بعيدًا، و<code>PATROL</code> دورية.</p><p>ومن قاعدة الخريطة: إقلاع، وعودة للتذخير، وهبوط.</p>'],
    en: ['Flight mode', '<p>The switch on the right console changes how she flies: <code>ORBIT</code> circles the area, <code>HOVER 1</code> and <code>HOVER 2</code> hold off at a distance, <code>PATROL</code>.</p><p>Where the map has a base: takeoff, back to rearm, and landing.</p>'] },
  { img: 'sprites/tut/ah64_live.webp', iw: 1600, ih: 900, x: 800, y: 450, z: 1, key: 'SCORE',
    ar: ['المهمة والتقييم', '<p><b>المساعد</b> يضيء الزر المطلوب إذا ترددت، ويتوقف من الإعدادات.</p><p>نقاط لكل هدف، ومكافأة للدقة والسرعة، وخصم لما ينسحب وللإصابات المدنية. المبنى المعادي يُهدم بالرمح ومن يحتمي فيه معه.</p>'],
    en: ['The mission and the score', '<p><b>The assist</b> lights the control you need if you hesitate; turn it off in the settings.</p><p>Points for each target, a bonus for accuracy and speed, a penalty for what escapes and for civilian hits. A hostile building comes down to the Rumh, with whoever shelters in it.</p>'] },
];
const TUT_K = 'saqr.tut.' + (JET ? 'f15' : 'ah64');
const tutSeen = () => { if (location.hash === '#debug') return true; try { return localStorage.getItem(TUT_K) === '1'; } catch (_) { return true; } };
const TT = { i: 0, en: EN, done: null };
function tutDraw() {
  const st = TUT[TT.i], el = $('#ovTut'), pic = $('#tPic'), ring = $('#tRing'), L = TT.en ? st.en : st.ar;
  el.classList.toggle('ltr', TT.en); el.dir = TT.en ? 'ltr' : 'rtl';
  $('#tStep').textContent = (TT.en ? 'STEP ' : 'الخطوة ') + (TT.i + 1) + ' / ' + TUT.length;
  $('#tTitle').innerHTML = '<i>' + st.key + '</i>' + L[0]; $('#tText').innerHTML = L[1];
  $('#tLang').textContent = TT.en ? 'ع' : 'EN'; $('#tSkip').textContent = TT.en ? 'Skip' : 'تخطي';
  $('#tPrev').textContent = TT.en ? 'Back' : 'السابق'; $('#tPrev').style.visibility = TT.i ? '' : 'hidden';
  $('#tNext').textContent = TT.i < TUT.length - 1 ? (TT.en ? 'Next' : 'التالي') : (TT.en ? 'Start' : 'ابدأ');
  $('#tDots').innerHTML = TUT.map((_, k) => '<i' + (k === TT.i ? ' class="on"' : '') + '></i>').join('');
  // the photograph magnified on the step's point, kept inside the picture; the control ringed there
  // (the photograph, or for a step about the displays a picture from the game with them lit: the photograph's are dark)
  const IW = st.iw || CK.IW, IH = st.ih || CK.IH, W = pic.clientWidth, H = pic.clientHeight, k0 = Math.max(W / IW, H / IH), k = k0 * st.z, bw = IW * k, bh = IH * k;
  const bx = clamp(W / 2 - st.x * k, W - bw, 0), by = clamp(H / 2 - st.y * k, H - bh, 0);
  pic.style.backgroundImage = 'url(' + (st.img || CK_IMG + 'day.webp') + ')'; pic.style.backgroundSize = bw + 'px ' + bh + 'px'; pic.style.backgroundPosition = bx + 'px ' + by + 'px';
  const rx = bx + st.x * k, ry = by + st.y * k, r = Math.max(26, (st.img ? 22 : 34) * st.z * k0 * 1.6);
  ring.hidden = st.z <= 1; Object.assign(ring.style, { left: rx - r + 'px', top: ry - r + 'px', width: 2 * r + 'px', height: 2 * r + 'px' });
  pic.style.setProperty('--rx', rx + 'px'); pic.style.setProperty('--ry', ry + 'px');
}
function tutShow(done) { TT.i = 0; TT.en = EN; TT.done = done || null; $('#ovTut').hidden = false; tutDraw(); }
function tutClose() { try { localStorage.setItem(TUT_K, '1'); } catch (_) {} $('#ovTut').hidden = true; const f = TT.done; TT.done = null; if (f) f(); }
$('#tNext').addEventListener('click', () => { if (TT.i < TUT.length - 1) { TT.i++; tutDraw(); } else tutClose(); });
$('#tPrev').addEventListener('click', () => { if (TT.i) { TT.i--; tutDraw(); } });
$('#tSkip').addEventListener('click', tutClose);
$('#tLang').addEventListener('click', () => { TT.en = !TT.en; tutDraw(); });
window.addEventListener('resize', () => { if (!$('#ovTut').hidden) tutDraw(); });
for (const b of document.querySelectorAll('#segT button')) b.addEventListener('click', () => { setTod({ 0: 'day', 1: 'night', 2: 'dusk' }[b.dataset.t]); syncMenu(); });
for (const b of document.querySelectorAll('#segW button')) b.addEventListener('click', () => { setWx(b.dataset.w === '1' ? 'dust' : 'clear'); syncMenu(); });
// the ZF-25's start: on the ground at its base (the taxi out and the takeoff), or on station
for (const b of document.querySelectorAll('#segJ button')) b.addEventListener('click', () => { JX.air = b.dataset.j === 'air'; try { localStorage.setItem('saqr.jstart', JX.air ? 'air' : 'base'); } catch (_) {} syncMenu(); });
for (const b of document.querySelectorAll('#segC button')) b.addEventListener('click', () => { setSensor(b.dataset.c); syncMenu(); });
for (const b of document.querySelectorAll('#segG button')) b.addEventListener('click', () => { S.assist = b.dataset.g === '1'; try { localStorage.setItem('saqr.assist', S.assist ? '1' : '0'); } catch (_) {} syncMenu(); });
for (const b of document.querySelectorAll('#segS button')) b.addEventListener('click', () => { S.soundPref = b.dataset.s === '1'; try { localStorage.setItem('saqr.sound', S.soundPref ? '1' : '0'); } catch (_) {} syncMenu(); });
for (const b of document.querySelectorAll('#segR button')) b.addEventListener('click', () => { S.radioAr = b.dataset.r === 'ar'; try { localStorage.setItem('saqr.radio', S.radioAr ? 'ar' : 'en'); } catch (_) {} loadRadio(); syncMenu(); });
$('#btnHow').addEventListener('click', () => tutShow(null));
for (const b of document.querySelectorAll('.mPanel [data-close]')) b.addEventListener('click', () => { $('#panHow').hidden = true; });
function showMenu() {
  $('#ovEnd').hidden = true; $('#eBg').style.backgroundImage = ''; $('#panHow').hidden = true;
  S.phase = 'brief'; setupMission(); setCockpit(true); syncUI(); $('#ovStart').hidden = false; showScr('home');
}
$('#btnMenu').addEventListener('click', showMenu);
for (const b of document.querySelectorAll('#segQ button')) b.classList.toggle('on', (b.dataset.q === '1') === HIQ);
$('#btnStart').addEventListener('click', () => { if (!tutSeen()) { tutShow(() => $('#btnStart').click()); return; } try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (_) {} if (menuMission === 'campaign') { campStart(); return; } S.camp = false; const mi = MISSIONS.find(m => m.id === menuMission); startMission(mi.custom ? edLoad() : mi.layout ? mi.layout.map(it => ({ ...it })) : null, mi); });
$('#btnAgain').addEventListener('click', () => { if (S.camp) campStart(); else startMission(undefined, MISSIONS.find(m => m.id === missionId)); });

function syncUI() {
  document.querySelectorAll('#railL [data-z]').forEach(b => b.classList.toggle('on', Math.abs(Number(b.dataset.z) - S.zoomGoal) < 0.05));
  document.querySelectorAll('.wpn').forEach(b => b.classList.toggle('on', b.dataset.w === S.weapon));
  if (JET) { $('#amMsl').textContent = WN('lgb') + ' ' + (S.ammo.lgb || 0); $('#amRkt').textContent = WN('jdam') + ' ' + (S.ammo.jdam || 0); $('#amGun').textContent = WN('agm') + ' ' + (S.ammo.agm || 0); }
  else { $('#amMsl').textContent = HF_T[S.hfType][0] + ' ' + S.hf[S.hfType] + '/' + S.ammo.msl; $('#amRkt').textContent = RK_T[S.rkType][0] + ' ' + S.rk[S.rkType] + '/' + S.ammo.rkt; $('#amGun').textContent = 'GUN ' + S.ammo.gun; }
  $('#tIdx').textContent = (S.sel ? pad(S.sel.id, 2) : '··') + '/' + targets.length;
  const lk = $('#btnLock');
  lk.classList.toggle('weak', S.tracking && S.quality < 3); lk.classList.toggle('strong', S.tracking && S.quality >= 3);
  $('#lockAr').textContent = S.tracking ? Lg('فك التثبيت', 'Unlock') : Lg('تثبيت', 'Lock'); $('#lockEn').textContent = S.tracking ? 'UNLOCK' : 'LOCK';
  $('#btnArm').classList.toggle('on', S.armed);
  $('#armAr').textContent = S.armed ? Lg('مسلّح', 'Armed') : Lg('تسليح', 'Arm'); $('#armEn').textContent = S.armed ? 'ARMED' : 'ARM';
  syncDock();
}
let lastDock = '';
function syncDock() {
  const f = fireState(), key = f.ar + f.en + f.ok + !!f.warn + !!f.live;
  if (key === lastDock) return; lastDock = key;
  $('#dAr').textContent = EN ? FS_EN[f.ar] || f.en : f.ar; $('#dEn').textContent = EN && (FS_EN[f.ar] || '').toUpperCase() === f.en ? '' : f.en;
  $('#dStat').className = 'dstat' + (f.warn ? ' warn' : '') + (f.live ? ' live' : '');
  $('#btnFire').classList.toggle('off', !f.ok);
}

/* ===================== HUD (sensor symbology, drawn so snapshots include it) ===================== */
const FONT_AR = '"IBM Plex Sans Arabic", "IBM Plex Sans", system-ui, sans-serif';
const FONT_MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';
let railLx = 86, railRx = 94;
function txt(s, x, y, font, color, align, dir) {
  const c = hctx; c.font = font; c.fillStyle = color || '#f1f2ec'; c.textAlign = align || 'left'; c.direction = dir || 'ltr';
  c.fillText(s, x, y);
}
function stat(xR, y, ar, en, val, unit, color) {
  // Arabic label with its code above a value, right-aligned to xR; returns the block width
  const c = hctx;
  const lab = EN ? en : ar + ' ' + en;
  c.font = '500 9px ' + FONT_AR; const wl = c.measureText(lab).width;
  txt(lab, xR, y, '500 9px ' + FONT_AR, 'rgba(241,242,236,0.72)', 'right', EN ? 'ltr' : 'rtl');
  let wu = 0;
  if (unit) { c.font = '400 9px ' + FONT_MONO; wu = c.measureText(' ' + unit).width; txt(' ' + unit, xR, y + 15, '400 9px ' + FONT_MONO, '#f1f2ec', 'right'); }
  const vf = color ? '600 12px ' + FONT_AR : '600 14px ' + FONT_MONO;
  c.font = vf; const wv = c.measureText(val).width;
  txt(val, xR - wu, y + 15, vf, color || '#f1f2ec', 'right', color && !EN ? 'rtl' : 'ltr');
  return Math.max(wl, wv + wu);
}
function drawHud(forShot) {
  const c = hctx, W = VW, H = VH;
  c.setTransform(PR, 0, 0, PR, 0, 0); c.clearRect(0, 0, W, H);
  c.shadowColor = 'rgba(0,0,0,0.85)'; c.shadowBlur = S.sensor === 'bh' ? 4 : 3; c.lineJoin = 'miter';
  if (S.sensor === 'bh') c.shadowColor = '#000';
  const ink = S.night ? '#e9ebe4' : '#f1f2ec';
  c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = 1.1;
  const cx = W / 2, cy = H / 2;
  // reticle
  const g = S.zoom >= 4 ? 40 : 12, arm = S.zoom >= 4 ? 80 : 58;
  c.beginPath();
  c.moveTo(cx - g - arm, cy); c.lineTo(cx - g, cy); c.moveTo(cx + g, cy); c.lineTo(cx + g + arm, cy);
  c.moveTo(cx, cy - g - arm * 0.75); c.lineTo(cx, cy - g); c.moveTo(cx, cy + g); c.lineTo(cx, cy + g + arm * 0.75);
  const e1 = g + arm + 20, e2 = g + arm + 40;
  c.moveTo(cx - e1, cy - 4); c.lineTo(cx - e1, cy + 4); c.moveTo(cx + e1, cy - 4); c.lineTo(cx + e1, cy + 4);
  c.moveTo(cx - e2, cy - 2); c.lineTo(cx - e2, cy + 2); c.moveTo(cx + e2, cy - 2); c.lineTo(cx + e2, cy + 2);
  const v1 = g + arm * 0.75 + 20; c.moveTo(cx - 4, cy - v1); c.lineTo(cx + 4, cy - v1); c.moveTo(cx - 4, cy + v1); c.lineTo(cx + 4, cy + v1);
  c.stroke();
  // track gate
  if (S.sel && (S.sel.alive || !S.sel.escaped) && !S.sel.escaped) {
    const s = toScreen(S.sel.x, S.sel.y);
    const size = Math.max(9, (S.sel.kind !== 'personnel' ? S.sel.len * 0.75 : 3.5) * PXM / S.view.w * W);
    c.lineWidth = S.quality >= 3 ? 1.5 : 1.2;
    if (s.x > -40 && s.x < W + 40 && s.y > -40 && s.y < H + 40) {
      if (S.tracking && S.quality >= 3) c.strokeRect(s.x - size, s.y - size, size * 2, size * 2);
      else {
        const q = Math.max(4, size * 0.45);
        c.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const x = s.x + sx * size, y = s.y + sy * size;
          c.moveTo(x - sx * q, y); c.lineTo(x, y); c.lineTo(x, y - sy * q);
        }
        if (!S.tracking) c.setLineDash([3, 3]);
        c.stroke(); c.setLineDash([]);
      }
    }
    c.lineWidth = 1.1;
  }
  // heading tape
  const tw = 160, tx = cx - tw / 2, ty = 26 + topInset, hdg = plane.hdg, pxd = tw / 70;
  c.beginPath(); c.moveTo(tx, ty); c.lineTo(tx + tw, ty);
  for (let d = Math.ceil((hdg - 35) / 5) * 5; d <= hdg + 35; d += 5) {
    const x = cx + (d - hdg) * pxd, major = ((d % 10) + 10) % 10 === 0;
    c.moveTo(x, ty); c.lineTo(x, ty - (major ? 5 : 3));
    if (major) { c.save(); txt(pad((((d % 360) + 360) % 360) / 10, 2), x, ty - 8, '500 9px ' + FONT_MONO, ink, 'center'); c.restore(); }
  }
  c.stroke();
  c.beginPath(); c.moveTo(cx, ty + 3); c.lineTo(cx - 4, ty + 9); c.lineTo(cx + 4, ty + 9); c.closePath(); c.fill();
  txt(pad(hdg, 3) + '°', cx, ty + 22, '600 11px ' + FONT_MONO, ink, 'center');
  const now = new Date();
  const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  txt(pad(now.getUTCHours(), 2) + ':' + pad(now.getUTCMinutes(), 2) + ':' + pad(now.getUTCSeconds(), 2) + 'Z · ' + pad(now.getUTCDate(), 2) + ' ' + MON[now.getUTCMonth()], cx, ty + 34, '400 9px ' + FONT_MONO, 'rgba(241,242,236,0.75)', 'center');
  // top-left: sensor mode
  const fov = S.zoom >= 7.9 ? ['NFOV', 'ضيق'] : S.zoom >= 1.9 ? ['MFOV', 'متوسط'] : ['WFOV', 'واسع'];
  if (EN) fov.reverse()[0] = '';
  const lx = railLx, y0 = 18 + topInset;
  const irOn = S.sensor !== 'eo';
  let sCode = irOn ? 'IR' : S.night ? 'LLTV' : 'EO', sAr = irOn ? 'حراري' : S.night ? 'ليلي' : 'بصري';
  if (EN) [sCode, sAr] = ['', sCode];
  c.font = '600 9px ' + FONT_AR; const w1 = c.measureText(sCode).width;
  txt(sCode, lx, y0, '600 9px ' + FONT_AR, 'rgba(241,242,236,0.7)');
  txt(sAr, lx + w1 + 6, y0, '600 12px ' + FONT_AR, ink, 'left', EN ? 'ltr' : 'rtl');
  if (irOn) { c.font = '600 12px ' + FONT_AR; const wa = c.measureText(sAr).width; txt(S.sensor === 'bh' ? 'BHOT' : 'WHOT', lx + w1 + wa + 12, y0, '600 10px ' + FONT_MONO, ink); }
  c.font = '600 9px ' + FONT_AR; const w2 = c.measureText(fov[0]).width;
  txt(fov[0], lx, y0 + 16, '600 9px ' + FONT_AR, 'rgba(241,242,236,0.7)');
  c.font = '500 11px ' + FONT_AR; const w3 = c.measureText(fov[1]).width;
  txt(fov[1], lx + w2 + 6, y0 + 16, '500 11px ' + FONT_AR, ink, 'left', EN ? 'ltr' : 'rtl');
  txt('×' + S.zoom.toFixed(1), lx + w2 + w3 + 12, y0 + 16, '600 11px ' + FONT_MONO, ink);
  // top-right: aircraft
  let xr = W - railRx;
  xr -= stat(xr, y0 - 6, 'الاتجاه', 'HDG', pad(hdg, 3) + '°') + 16;
  xr -= JET ? stat(xr, y0 - 6, 'الارتفاع', 'ALT', String(Math.round(plane.alt / 0.3048 / 10) * 10), 'ft') + 16 : stat(xr, y0 - 6, 'الارتفاع', 'ALT', String(Math.round(plane.alt)), 'm') + 16;
  JET ? stat(xr, y0 - 6, 'السرعة', 'GS', String(Math.round(plane.gs / 1.852)), 'kt') : stat(xr, y0 - 6, 'السرعة', 'GS', String(Math.round(plane.gs)), 'km/h');
  // bottom-left: target point
  const yb = H - 14 - botInset;
  const east = 41000 + Math.round(S.view.cx * MPP), north = 8000 + Math.round((H0 - S.view.cy) * MPP);
  const elev = 405 + Math.round(Math.abs(S.view.cx - roadAt(clamp(S.view.cy / H0 * ROAD_LEN, 0, ROAD_LEN)).x) * 0.12);
  txt(Lg('الهدف TGT', 'TGT'), lx, yb - 30, '500 9px ' + FONT_AR, 'rgba(241,242,236,0.72)', 'left', EN ? 'ltr' : 'rtl');
  txt(pad(east, 5) + ' ' + pad(north, 5), lx, yb - 15, '600 11.5px ' + FONT_MONO, ink);
  txt('ELEV ' + elev + ' m', lx, yb - 1, '400 9.5px ' + FONT_MONO, 'rgba(241,242,236,0.8)');
  // bottom-right: range & track
  const qTxt = (EN ? ['—', 'POOR', 'FAIR', 'GOOD'] : ['—', 'ضعيف', 'متوسط', 'قوي'])[S.quality], qCol = [ink, '#f3d48a', '#f3d48a', '#93f0b4'][S.quality];
  const xb = W - railRx;
  stat(xb, yb - 26, 'التتبع', 'TRK', qTxt, null, qCol);
  stat(xb, yb - 64, 'المدى المائل', 'SR', String(Math.round(slantRange())), 'm');
  // gimbal indicator
  const gx = W - railRx - 13, gy = yb - 104;
  c.lineWidth = 1; c.strokeRect(gx - 13, gy - 13, 26, 26);
  c.globalAlpha = 0.35; c.beginPath(); c.moveTo(gx, gy - 13); c.lineTo(gx, gy + 13); c.moveTo(gx - 13, gy); c.lineTo(gx + 13, gy); c.stroke(); c.globalAlpha = 1;
  const pg = planeGround(), brg = Math.atan2(S.view.cx - pg.x, -(S.view.cy - pg.y)), rel = wrapA(brg - plane.hdg * Math.PI / 180);
  c.beginPath(); c.arc(gx + Math.sin(rel) * 9, gy - Math.cos(rel) * 9, 2, 0, 6.283); c.fill();
  { const nx = -S.view.R.y, ny = -S.view.D.y, px2 = -ny, py2 = nx, tipx = gx + nx * 26, tipy = gy + ny * 26;
    c.beginPath(); c.moveTo(gx + nx * 16, gy + ny * 16); c.lineTo(tipx, tipy); c.stroke();
    c.beginPath(); c.moveTo(tipx, tipy); c.lineTo(tipx - nx * 6 + px2 * 3, tipy - ny * 6 + py2 * 3); c.lineTo(tipx - nx * 6 - px2 * 3, tipy - ny * 6 - py2 * 3); c.closePath(); c.fill();
    txt('N', gx + nx * 35, gy + ny * 35 + 3.5, '600 9px ' + FONT_MONO, ink, 'center'); }
  if (S.frozen) txt(Lg('مجمّد · FROZEN', 'FROZEN'), cx, cy + 120, '600 11px ' + FONT_AR, '#f3d48a', 'center', EN ? 'ltr' : 'rtl');
  if (forShot) {
    c.shadowBlur = 0;
    c.fillStyle = 'rgba(150,30,22,0.75)'; c.fillRect(railLx - 76, 10 + topInset, 64, 24);
    txt(Lg('محاكاة SIM', 'SIM'), railLx - 44, 26 + topInset, '700 11px ' + FONT_AR, '#ffd9d3', 'center', EN ? 'ltr' : 'rtl');
  }
  c.shadowBlur = 0;
}
let topInset = 0, botInset = 0;

/* ===================== snapshot ===================== */
function snapshot() {
  renderFrame(0);
  drawHud(true);
  const out = document.createElement('canvas'); out.width = glCanvas.width; out.height = glCanvas.height;
  const x = out.getContext('2d'); x.drawImage(glCanvas, 0, 0); x.drawImage(hud, 0, 0, out.width, out.height);
  try { $('#shotImg').src = out.toDataURL('image/jpeg', 0.9); $('#ovShot').hidden = false; } catch (_) {}
  // (drawn for the picture: in the seat the next frame clears it again; it stayed over the cockpit)
  hudBlank = false;
  Snd.tone(1500, 0.03);
}

