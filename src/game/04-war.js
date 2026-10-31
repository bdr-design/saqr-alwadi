/* ===================== the ground war ===================== */
// Friendly forces (side 'blue': squads, an armoured vehicle) and the enemy around them fight on the ground with what
// they carry. The enemy's heavy guns and shoulder-launched missiles also go for the aircraft once they know it is
// there: shot at or near a blast, or seeing it overhead (sooner when it hovers close). Friendlies are marked as they
// would be: an orange VS-17 panel by day, an infrared strobe at night (seen on the thermal), and blue force tracking
// on the TSD. Their ground controller (HUNTER) calls the fight on the radio and marks targets with red smoke.
const friends = [], missiles = [], flares = [], bursts = [], tracers = [];
// the weapons: reach against the aircraft and the ground (m), rounds a burst, rounds a second, damage a hit does to
// the aircraft (of 100) and to a unit on the ground, chance a round hits the aircraft at 1 km (falls with the square of
// the range; a moving aircraft is harder to hit, a hovering one easier)
const GUNS = {
  dshk: { air: 1800, gnd: 1500, burst: [6, 12], rps: 10, dmg: [5, 9], gdmg: 10, p1k: 0.02, ar: 'رشاش 12.7 ملم', en: 'HMG-12' },
  zu23: { air: 2500, gnd: 2000, burst: [20, 40], rps: 26, dmg: [8, 14], gdmg: 16, p1k: 0.012, ar: 'مدفع 23 ملم مزدوج', en: 'AAG-23' },
  rifle: { air: 0, gnd: 450, burst: [3, 8], rps: 8, dmg: [0, 0], gdmg: 4, p1k: 0 },
  kpvt: { air: 2000, gnd: 2000, burst: [5, 10], rps: 10, dmg: [6, 11], gdmg: 14, p1k: 0.022, ar: 'رشاش 14.5 ملم', en: 'HMG-14' },
  pkm: { air: 1000, gnd: 1000, burst: [8, 16], rps: 11, dmg: [2, 5], gdmg: 6, p1k: 0.012, ar: 'رشاش متوسط', en: 'MMG' },
};
const VEH_GUN = { hilux: 'dshk', mrap: 'dshk', lc79: 'zu23', fac: 'dshk', patrol: 'zu23', t72: 'dshk', btr80: 'kpvt', zu23e: 'zu23', trench: 'pkm' };
// what each weapon does against armour (damage ×): the tank shrugs off the gun, the rockets and the darts, the APC
// less so; the Rumh, the Barq and the bombs are made for them
const ARMOUR = { t72: { gun: 0.03, rkt: 0.2, flc: 0.005, cook: 0.1, rifle: 0, dshk: 0, kpvt: 0.05, zu23: 0.1, pkm: 0 },
  btr80: { gun: 0.4, rkt: 0.65, flc: 0.04, rifle: 0, dshk: 0.3, kpvt: 0.4, pkm: 0 },
  sa8: { gun: 0.5, rkt: 0.7, flc: 0.05, rifle: 0, dshk: 0.3, kpvt: 0.5, pkm: 0 } };
const armourOf = (u, w) => ARMOUR[u.vk] && ARMOUR[u.vk][w] != null ? ARMOUR[u.vk][w] : 1;
const MANPADS_R = 4500, MANPADS_ALT = 3500;
// the aircraft's own state in the fight: damage (100 = whole), the two engines, flares left, the missile warner
const AC = { hp: 100, eng: [1, 1], flares: 60, chaff: 120, warn: [], downed: false, hits: 0, jolt: 0, evade: null, threats: new Set(), tic: false, lastCall: -99, log: [] };
const gndAgl = () => plane.alt - 410;
function acReset() { Object.assign(AC, { hp: 100, eng: [1, 1], flares: 60, chaff: JET ? 120 : 30, def: null, warn: [], downed: false, hits: 0, jolt: 0, evade: null, tic: false, lastCall: -99, log: [] }); AC.threats.clear(); }
// the panel friendlies lay out, and the strobe they switch on at night
const VS17 = (() => { const c = document.createElement('canvas'); c.width = 32; c.height = 12; const x = c.getContext('2d'); x.fillStyle = '#f2632a'; x.fillRect(0, 0, 32, 12); const t = new THREE.CanvasTexture(c); t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; return t; })();
function markFriend(u) {
  u.panel = addSprite(VS17, 2.0 * PXM, 0.7 * PXM, 33, 0xffffff, 0.92);
  u.panel.rotation.z = rand(0, 3.14);
  placePanel(u);
}
function placePanel(u) {
  if (!u.panel) return;
  if (u.kind === 'vehicle') { u.panel.position.set(u.x, -u.y, 0); u.panel.rotation.z = spriteRot(u.h) + Math.PI / 2; }
  else u.panel.position.set(u.hx + 3 * PXM, -(u.hy + 2 * PXM), 0);
  u.panel.visible = u.alive && !u.escaped && !u.dormant && !S.night;
}
// The radio and the intercom, in English as on a real net. Who speaks picks the set: HUNTER (the ground controller,
// his fight behind him), OPS and the ground crew on the FM radio; the pilot behind on the intercom. The line shows on
// the TEDAC at once; the voice waits its turn on its net. The voices are recorded (tools/make_radio.py: Kokoro-82M) into
// sprites/radio.mp3; RADIO.clips says where each piece is, and a call is its pieces one after another (a clock
// position, a distance, a direction…), played through the set (Snd.transmit).
const RADIO = __RADIO__;
// the ZF-25's own lines (sprites/radio_f15.mp3): its pilot ('jet' on the intercom, 'jetfm' on the radio to HUNTER),
// HUNTER and OPS working a jet, its voice warnings. In the jet the Sahm pilot's lines become his where there is one.
const RADIO_J = JET ? __RADIO_F15__ : null;
// the same calls in Saudi Arabic (tools/make_radio_ar.py: the owner's voices, coming in batches), when «اللاسلكي» in
// the settings says so: a call goes in Arabic only when every piece of it has been voiced, else all of it in English
const RADIO_A = __RADIO_AR__, RADIO_AJ = JET ? __RADIO_AR_F15__ : null;
const VOX = { hunter: { net: 'fm', bed: true }, ops: { net: 'fm' }, crew: { net: 'fm' }, pilot: { net: 'ics' }, jet: { net: 'ics' }, jetfm: { net: 'fm' }, twr: { net: 'fm' } };
const PJ = { 'p.msl': 'f.launch', 'p.break': 'f.flaresL' };
// in the iOS app (its message handler is there): the sound can be rebuilt without a touch
const inApp = (() => { try { return !!window.webkit.messageHandlers.voice; } catch (_) { return false; } })();
// A bank is kept as its lines only, at the rate they were recorded (24 kHz) in 16-bit samples: d holds them one after
// another, at[id] = [where, how long, peak]. Decoded at the context's rate as 32-bit numbers, with the silence between
// lines, the four took 119 MB; so, 27.5. Each line is cut out when the bank comes (its margin, then trimmed to the
// voice and a little either side), as a call used to cut it every time.
const bank = { d: null, sr: 0 }, bankJ = { d: null, sr: 0 }, bankA = { d: null, sr: 0 }, bankAJ = { d: null, sr: 0 };
const BANK_SR = 24000;
function loadBank(b, url, R) {
  if (b.d || b.loading || !Snd.ctx) return;
  b.loading = true;
  const x = new XMLHttpRequest(); x.open('GET', url); x.responseType = 'arraybuffer';
  const fail = () => { b.loading = false; };
  // at the recording's own rate when the browser can (no resampling, half the samples); else at the context's
  const decode = (raw, ok) => { let o = null; try { o = new OfflineAudioContext(1, 1, BANK_SR); } catch (_) {}
    const ctx = o || Snd.ctx, again = o && raw.slice(0);
    try { ctx.decodeAudioData(raw, ok, () => o ? Snd.ctx.decodeAudioData(again, ok, fail) : fail()); } catch (_) { fail(); } };
  x.onload = () => { if (!x.response || x.status >= 400) { fail(); return; }
    decode(x.response, a => { const f = a.getChannelData(0), sr = a.sampleRate, at = {}, cut = [];
      let n = 0;
      for (const id in R.clips) {
        const c = R.clips[id];
        let s = Math.max(0, Math.floor((c[0] - 0.12) * sr)), e = Math.min(f.length, Math.ceil((c[0] + c[1] + 0.12) * sr));
        while (s < e && Math.abs(f[s]) < 0.012) s++;
        while (e > s && Math.abs(f[e - 1]) < 0.012) e--;
        if (e - s < sr * 0.05) continue;
        s = Math.max(0, s - Math.floor(sr * 0.01)); e = Math.min(f.length, e + Math.floor(sr * 0.02));
        let pk = 0; for (let i = s; i < e; i++) pk = Math.max(pk, Math.abs(f[i]));
        at[id] = [n, e - s, pk]; cut.push([s, e]); n += e - s;
      }
      const d = new Int16Array(n); let o = 0;
      for (const [s, e] of cut) for (let i = s; i < e; i++) { const v = f[i]; d[o++] = v >= 1 ? 32767 : v <= -1 ? -32767 : Math.round(v * 32767); }
      b.at = at; b.sr = sr; b.d = d; b.loading = false; }); };
  x.onerror = fail;
  x.send();
}
function loadRadio() {
  if (RADIO) loadBank(bank, 'sprites/radio.mp3', RADIO); if (RADIO_J) loadBank(bankJ, 'sprites/radio_f15.mp3', RADIO_J);
  // (the Arabic only when chosen)
  if (S.radioAr) { if (RADIO_A) loadBank(bankA, 'sprites/radio_ar.mp3', RADIO_A); if (RADIO_AJ) loadBank(bankAJ, 'sprites/radio_ar_f15.mp3', RADIO_AJ); }
}
// one call: its pieces out of the banks, joined with short gaps
function radioClip(ids) {
  if (!ids || !ids.length) return null;
  let sr = 0, n = 0, pk = 0; const out = [];
  const arHas = id => (bankAJ.d && bankAJ.at[id]) || (bankA.d && bankA.at[id]);
  const [BJ, BR] = S.radioAr && ids.every(arHas) ? [bankAJ, bankA] : [bankJ, bank];
  for (const id of ids) {
    // the jet's own bank first, then the shared one
    const B = BJ.d && BJ.at[id] ? BJ : BR.d && BR.at[id] ? BR : null; if (!B) continue;
    if (out.length) { if (B.sr !== sr) continue; n += Math.floor(sr * 0.07); }
    const c = B.at[id]; sr = B.sr; pk = Math.max(pk, c[2]);
    out.push([B.d, c[0], c[1], n]); n += c[1];
  }
  if (!out.length || !pk) return null;
  const d = new Float32Array(n);
  for (const [src, s, len, o] of out) for (let i = 0; i < len; i++) d[o + i] = src[s + i] / 32767;
  return { sr, d, pk };
}
const nets = { fm: [], ics: [] }, netFree = { fm: 0, ics: 0 };   // the lines waiting on each net; when it is free (ms)
// en: the line on the TEDAC; ar: the log; who: the speaker; say: the recorded pieces spoken
function radio(en, ar, who, say) {
  // (the ground controller's net is not heard from the base: a jet on the ground or climbing out is on the tower's;
  // it comes up on his once it checks in)
  if (JET && JX.gs && (who === 'hunter' || JX.gs.home && who === 'ops')) return;
  if (JET && say) { if (who === 'pilot') who = 'jet'; say = say.map(k => PJ[k] || k.replace(/^p\.clock\./, 'f.clock.')); }
  CK.msg = { s: en, ar, t: 4 }; AC.log.push({ t: S.missionT, en, ar }); if (AC.log.length > 12) AC.log.shift();
  if (!S.soundOn) return;
  const p = VOX[who] || VOX.hunter, c = radioClip(say);
  if (!c) return;
  const q = nets[p.net];
  if (q.length > 2) q.shift();   // a backlog is old news
  q.push({ c, p, at: performance.now() }); pumpNet(p.net);
}
function pumpNet(net) {
  const q = nets[net], now = performance.now();
  while (q.length && now - q[0].at > 12000) q.shift();
  if (!q.length || now < netFree[net]) return;
  const it = q.shift(), dur = Snd.transmit(it.c, net, it.p.bed);
  netFree[net] = now + (dur + 0.4) * 1000;
  setTimeout(() => pumpNet(net), (dur + 0.45) * 1000);
}
const clockOf = (x, y) => { const a = wrapA(Math.atan2(y - plane.y, x - plane.x) - plane.nose); return ((Math.round(a / (Math.PI / 6)) + 12) % 12) || 12; };
const DIR8 = [['EAST', 'شرق'], ['SOUTHEAST', 'جنوب شرق'], ['SOUTH', 'جنوب'], ['SOUTHWEST', 'جنوب غرب'], ['WEST', 'غرب'], ['NORTHWEST', 'شمال غرب'], ['NORTH', 'شمال'], ['NORTHEAST', 'شمال شرق']];
const dirOf = (dx, dy) => DIR8[((Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) % 8) + 8) % 8];
const slantTo = u => Math.hypot(Math.hypot(u.x - plane.x, u.y - plane.y) * MPP, gndAgl());
// one shot at the aircraft has hit: damage, the jolt in the seat, the warnings
function acHit(dmg, what) {
  if (AC.downed || S.phase !== 'play' || S.home) return;
  AC.hp = Math.max(0, AC.hp - dmg); AC.hits++; AC.jolt = what === 'msl' ? 6 : 2.5;
  S.flash = Math.max(S.flash, what === 'msl' ? 0.6 : 0.2);
  Snd.impact(what === 'msl');
  const warn = w => { if (!AC.warn.includes(w)) { AC.warn.push(w); Snd.caution(); } };
  if (what === 'msl' || Math.random() < 0.25) { const e = Math.random() < 0.5 ? 0 : 1; AC.eng[e] = Math.max(0, AC.eng[e] - (what === 'msl' ? 0.7 : 0.35)); warn(AC.eng[e] <= 0 ? 'ENG ' + (e + 1) + ' OUT' : 'ENG ' + (e + 1) + ' CHIP'); }
  if (Math.random() < 0.2) warn('HYD PRESS');
  if (AC.hp < 60) warn('MASTER CAUTION');
  if (AC.hp < 30) { warn('MASTER WARNING'); if (!AC.rtbCalled) { AC.rtbCalled = true; radio('BADLY HIT', 'انصبنا إصابة بالغة، الطائرة ثقيلة', 'pilot', ['p.hit']); } }
  CK.msg = { s: what === 'msl' ? 'MISSILE HIT' : 'HIT', t: 2 };
  if (AC.hp <= 0) shotDown();
}
function shotDown() {
  AC.downed = true; S.flash = 1;
  radio('MAYDAY MAYDAY', 'ماي داي، ماي داي، صقر يسقط، صقر يسقط', 'pilot', ['p.mayday']);
  checkEnd();
}
// the pilot's reaction to fire: a hard break away across the line of fire, at speed, then back to what he was doing
function evade(x, y, secs) {
  if (AC.evade && S.missionT < AC.evade.until - 1) return;
  const a = Math.atan2(plane.y - y, plane.x - x), side = Math.sign(wrapA(Math.atan2(plane.vy, plane.vx) - a)) || 1;
  AC.evade = { until: S.missionT + secs, dir: a + side * 1.2 };
}
// what the enemy knows: once aware of the aircraft it stays aware
function aware(u, dt) {
  if (u.aware) return true;
  if ((u.alert && u.alert !== 0) || u.fleeing || AC.tic) { u.aware = true; return true; }
  const r = slantTo(u);
  if (r < 3000) {
    const slow = plane.gs < 40 ? 2 : 1, dark = S.night ? 0.5 : 1;
    if (Math.random() < dt / 30 * slow * dark * (3000 / r)) u.aware = true;
  }
  return u.aware;
}
function gunOf(u) { return u.kind === 'vehicle' ? VEH_GUN[u.vk] : u.kind === 'personnel' ? 'rifle' : null; }
function enemiesOf(u) { return u.side === 'blue' ? targets.filter(t => t.alive && !t.escaped && !t.dormant && !t.inside && t.kind !== 'house' && !quiet(t)) : friends.filter(f => f.alive && !f.escaped && !f.dormant); }
// an ambush not yet sprung: holds its fire and is not seen by the friendlies
const quiet = u => u.ambush && !u.sprung;
function springAmbush(u) {
  u.sprung = true;
  // the ambush around it opens up together
  for (const t of targets) if (quiet(t) && Math.hypot(t.x - u.x, t.y - u.y) * MPP < 150) t.sprung = true;
}
// a burst: rounds out at the gun's rate, each with its tracer; against the aircraft a hit is rolled per round
function shootBurst(u, tgt) {
  const g = GUNS[u.gun], n = Math.round(rand(g.burst[0], g.burst[1]));
  // a group's burst is one man's: he turns to it and fires kneeling (or from the ground), the rest hold and face it
  const m = u.kind === 'personnel' ? shooter(u, tgt === 'air' ? plane.x : tgt.x, tgt === 'air' ? plane.y : tgt.y) : null;
  if (m) { m.aimT = n / g.rps + 1.5; u.fightT = 8; u.fh = m.h; }
  bursts.push({ u, tgt, n, k: 0, acc: 0, rps: g.rps, m });
  u.fireT = n / g.rps + (u.gun === 'rifle' ? rand(1.5, 4) : rand(3, 7));
  if (tgt === 'air' && !u.firedAir) {
    u.firedAir = true; AC.threats.add(u);
    if (S.missionT - AC.lastCall > 6) { AC.lastCall = S.missionT; radio('TAKING FIRE ' + clockOf(u.x, u.y) + " O'CLOCK", 'إطلاق نار علينا، الساعة ' + clockOf(u.x, u.y), 'pilot', ['p.fire', 'p.clock.' + clockOf(u.x, u.y)]); }
    evade(u.x, u.y, 6);
  }
}
function round(b) {
  const u = b.u, g = GUNS[u.gun];
  if (!u.alive || b.m && !b.m.alive) return;
  // (from the man firing, for a group)
  const ox = b.m ? b.m.x : u.x, oy = b.m ? b.m.y : u.y;
  // the muzzle: a flash the sensor sees (and the thermal, hot)
  glowE.spawn({ x: ox + rand(-0.5, 0.5) * PXM, y: oy + rand(-0.5, 0.5) * PXM, life: 0.06, s0: (u.gun === 'rifle' ? 0.8 : 1.6) * PXM, s1: 0.6 * PXM, a0: 0.9, a1: 0, c0: [1, 0.85, 0.5], rot: 0, ease: 'lin' });
  if (S.sensor !== 'eo') heatL.spawn({ x: ox, y: oy, life: 0.08, s0: 1.2 * PXM, s1: 0.6 * PXM, a0: 0.9, a1: 0, c0: [1, 0, 0], ease: 'lin' });
  if (b.tgt === 'air') {
    // aimed at where the aircraft will be, with the gunner's error: tracers rise past the canopy
    const r = slantTo(u), tof = r / 820, z = gndAgl();
    const err = (8 + r * 0.012) * (1 + plane.gs / 200);
    const ax = plane.x + plane.vx * tof * PXM + gauss() * err * PXM, ay = plane.y + plane.vy * tof * PXM + gauss() * err * PXM, az = z + gauss() * err;
    if (b.k % (u.gun === 'zu23' ? 2 : 3) === 0) {
      const life = tof * 1.35;
      tracers.push({ x: ox, y: oy, z: 2, vx: (ax - ox) / tof, vy: (ay - oy) / tof, vz: (az - 2) / tof, t: 0, life });
      glowE.spawn({ x: ox, y: oy, vx: (ax - ox) / tof, vy: (ay - oy) / tof, life: Math.min(life, 0.5), s0: 0.4 * PXM, s1: 0.4 * PXM, sx: 6, rot: Math.atan2(-(ax - ox), -(ay - oy)), a0: 0.9, a1: 0.3, c0: [1, 0.6, 0.25], ease: 'lin' });
    }
    const mob = plane.gs < 20 ? 1.6 : 1 / (1 + plane.gs / 110), ev = AC.evade && S.missionT < AC.evade.until ? 0.5 : 1;
    const p = g.p1k * (1000 / Math.max(r, 300)) ** 2 * mob * ev;
    timers.push({ t: tof, fn: () => { if (Math.random() < p) acHit(rand(g.dmg[0], g.dmg[1]), 'gun'); else if (Math.random() < 0.08) Snd.crack(); } });
    return;
  }
  // against the ground: the tracer along the ground, dust where the rounds land, now and then a casualty
  const t = b.tgt; if (!t.alive) return;
  const d = Math.hypot(t.x - ox, t.y - oy), tof = d * MPP / 750, sp = (u.gun === 'rifle' ? 2.5 : 4) * PXM;
  const ix = t.x + gauss() * sp, iy = t.y + gauss() * sp;
  if (u.gun !== 'rifle' || b.k % 3 === 0) glowE.spawn({ x: ox, y: oy, vx: (ix - ox) / tof, vy: (iy - oy) / tof, life: tof, s0: 0.3 * PXM, s1: 0.3 * PXM, sx: 7, rot: Math.atan2(-(ix - ox), -(iy - oy)), a0: 0.85, a1: 0.6, c0: u.side === 'blue' ? [1, 0.35, 0.25] : [0.6, 1, 0.45], ease: 'lin' });
  timers.push({ t: tof, fn: () => {
    if (b.k % 2 === 0) smokeL.spawn({ x: ix, y: iy, wind: 0.6, life: rand(1.2, 2), s0: 0.6 * PXM, s1: rand(2, 3.5) * PXM, a0: 0.4, a1: 0, c0: [0.62, 0.56, 0.46], c1: [0.7, 0.66, 0.58] });
    if (!t.alive) return;
    // armour shrugs off rifles; friendlies fight to hold the enemy down more than to kill, and are in cover behind
    // their vehicles: a squad lasts a few minutes under the ambush, time for the aircraft to settle it (BLUE_K: the
    // jet's longer while)
    const armour = t.kind === 'vehicle' ? (ARMOUR[t.vk] ? armourOf(t, u.gun) : u.gun === 'rifle' || u.gun === 'pkm' ? 0 : t.vk === 'mrap' ? 0.35 : 1) : 1;
    const ph = (u.gun === 'rifle' ? 0.04 : 0.05) * (u.side === 'blue' ? 0.08 : t.kind === 'personnel' ? 0.3 : 1) * (t.side === 'blue' ? BLUE_K : 1);
    if (Math.random() < ph * armour) {
      if (t.kind === 'personnel') hurtMan(t, g.gdmg); else t.hp -= g.gdmg;
      if (t.side !== 'blue') t.alert = Math.max(t.alert || 0, 5);
      if (t.kind === 'personnel' ? !t.men.some(m => m.alive) : t.hp <= 0) (t.side === 'blue' ? killFriend(t) : kill(t));
    }
  } });
}
// a shoulder-launched missile: boosts to ~580 m/s, steers for the aircraft (or a flare it has fallen for); the
// warner hears the launch, calls it and puts out flares; the pilot breaks
function launchManpads(u) {
  u.aa--; u.aaT = rand(35, 60);
  // the man with the tube stands up on one knee and turns to the aircraft
  const sm = u.kind === 'personnel' ? shooter(u, plane.x, plane.y, 'aa') || shooter(u, plane.x, plane.y) : null;
  if (sm) { sm.aimT = 4; u.fightT = Math.max(u.fightT, 4); }
  const lx = sm ? sm.x : u.x, ly = sm ? sm.y : u.y;
  const m = { x: lx, y: ly, z: 2, v: 25, hd: Math.atan2(plane.y - ly, plane.x - lx), el: 0.9, t: 0, tgt: 'air', trail: 0, src: u };
  missiles.push(m); AC.threats.add(u);
  smokeL.spawn({ x: lx, y: ly, wind: 1, life: 6, s0: 2 * PXM, s1: 9 * PXM, a0: 0.6, a1: 0, c0: [0.85, 0.84, 0.82] });
  glowE.spawn({ x: lx, y: ly, life: 0.25, s0: 4 * PXM, s1: 1 * PXM, a0: 1, a1: 0, c0: [1, 0.9, 0.6], rot: 0, ease: 'lin' });
  timers.push({ t: 0.4, fn: () => {
    if (S.phase !== 'play' || AC.downed) return;
    Snd.mws(); CK.msg = { s: 'MISSILE LAUNCH ' + clockOf(u.x, u.y), t: 3 };
    radio('MISSILE LAUNCH ' + clockOf(u.x, u.y) + " O'CLOCK, BREAK", 'صاروخ! صاروخ! الساعة ' + clockOf(u.x, u.y) + '، مشاعل، أنعطف', 'pilot', ['p.msl', 'p.clock.' + clockOf(u.x, u.y), 'p.break']);
    evade(u.x, u.y, 8);
    // the flare programme: pairs every half second
    for (let i = 0; i < 4; i++) timers.push({ t: i * 0.5, fn: () => dropFlares(m) });
  } });
}
function dropFlares(m) {
  if (AC.flares <= 0 || AC.downed) return;
  AC.flares -= 2; Snd.flare();
  for (const s of [-1, 1]) {
    const f = { x: plane.x - Math.sin(plane.nose) * s * 4 * PXM, y: plane.y + Math.cos(plane.nose) * s * 4 * PXM, z: gndAgl() - 3, vx: plane.vx * PXM * 0.6 - Math.sin(plane.nose) * s * 18 * PXM, vy: plane.vy * PXM * 0.6 + Math.cos(plane.nose) * s * 18 * PXM, vz: -8, t: 0 };
    flares.push(f);
    // a missile looking at it may take it for the aircraft (better while the aircraft breaks away)
    if (m.tgt === 'air' && Math.random() < 0.3 + (AC.evade && S.missionT < AC.evade.until ? 0.08 : 0)) m.tgt = f;
  }
}
/* ===================== the radar SAM ===================== */
// An SAM-R (Osa): its search radar sees the aircraft some 30 km out, and it can engage out to 10 km and up to 12 km
// high (none closer than 1.5 km). Its radar is not always on: on for a minute or so, then dark a while (EMCON), so
// it is not found and killed by its emissions. While it radiates the warning receiver hears it (the new-threat
// tone; the first time the pilot calls it, and the TSD marks it with its ring). Inside its reach it tracks for some
// seconds, then fires: a missile at about 800 m/s, steered by the site's radar to where the aircraft will be (it
// flies blind, ballistic, once that radar goes dark or the site is hit). The jet breaks to put it on the beam (the
// radar's doppler notch) and dispenses chaff; each bundle while beaming may draw the radar off. Six missiles.
const SAM = { det: 30000, r: 10000, rMin: 1500, alt: 12000 };
function samUpdate(u, dt) {
  const s = u.sam || (u.sam = { on: false, t: rand(4, 15), trk: 0, rds: 6, cool: 0, seen: false });
  s.t -= dt; s.cool -= dt;
  if (s.t <= 0) { s.on = !s.on; s.t = s.on ? rand(55, 95) : rand(20, 45); s.trk = 0; s.heard = false; }
  // the radars' power: the engine runs while they radiate (and so it shows on the thermal)
  if (s.on) u.eng = Math.min(1, u.eng + dt / 30);
  if (!s.on || AC.downed) return;
  const r = slantTo(u);
  if (r > SAM.det) return;
  if (!s.heard) { s.heard = true; Snd.rwrNew(); }
  if (!s.seen) { s.seen = true; AC.threats.add(u); CK.known.add(u);
    radio('MUD SPIKE, SAM, ' + clockOf(u.x, u.y) + " O'CLOCK", 'إنذار رادار، دفاع جوي، الساعة ' + clockOf(u.x, u.y), 'jet', ['f.sa8', 'f.clock.' + clockOf(u.x, u.y)]); }
  const inside = r < SAM.r && r > SAM.rMin && gndAgl() < SAM.alt && !JX.gs;
  s.trk = inside ? s.trk + dt : 0;
  if (s.trk > 7 && s.cool <= 0 && s.rds > 0 && !missiles.some(m => m.src === u)) launchSam(u);
}
function launchSam(u) {
  const s = u.sam; s.rds--; s.cool = rand(25, 40); s.trk = 0;
  const m = { kind: 'sam', x: u.x, y: u.y, z: 3, v: 60, hd: Math.atan2(plane.y - u.y, plane.x - u.x), el: 1.1, t: 0, tgt: 'air', trail: 0, src: u };
  missiles.push(m);
  // off the rail: the flash, the booster's smoke billowing round the vehicle (the pod sees it), the thermal's flare
  glowE.spawn({ x: u.x, y: u.y, life: 0.35, s0: 9 * PXM, s1: 2 * PXM, a0: 1, a1: 0, c0: [1, 0.9, 0.65], rot: 0, ease: 'lin' });
  for (let k = 0; k < 6; k++) smokeL.spawn({ x: u.x + rand(-4, 4) * PXM, y: u.y + rand(-4, 4) * PXM, wind: 1, life: rand(8, 14), s0: 4 * PXM, s1: rand(16, 26) * PXM, a0: 0.6, a1: 0, c0: [0.88, 0.87, 0.85], c1: [0.78, 0.77, 0.75] });
  if (S.sensor !== 'eo') heatL.spawn({ x: u.x, y: u.y, life: 2, s0: 6 * PXM, s1: 12 * PXM, a0: 1, a1: 0, c0: [1, 0, 0], ease: 'lin' });
  timers.push({ t: 0.6, fn: () => {
    if (S.phase !== 'play' || AC.downed || !missiles.includes(m)) return;
    const c = clockOf(u.x, u.y), side = samSide(u);
    Snd.rwrLaunch(6); CK.msg = { s: 'SAM LAUNCH ' + c, t: 3 };
    radio('MISSILE LAUNCH ' + c + " O'CLOCK, CHAFF, BREAKING " + (side > 0 ? 'RIGHT' : 'LEFT'), 'إطلاق صاروخ، الساعة ' + c + '، رقائق، ننعطف ' + (side > 0 ? 'يمينًا' : 'يسارًا'),
      'jet', ['f.launch', 'f.clock.' + c, side > 0 ? 'f.chaffR' : 'f.chaffL']);
    if (JET) jetDefend(u, m, side); else evade(u.x, u.y, 10);
    // the chaff programme: ten bundles, one every 0.7 s, through the turn onto the beam and along it
    for (let i = 0; i < 10; i++) timers.push({ t: 0.4 + i * 0.7, fn: () => dropChaff(m) });
  } });
}
// which way to break: the turn that puts the site on the beam soonest (+1 right, -1 left)
function samSide(u) {
  const b = Math.atan2(u.y - plane.y, u.x - plane.x), tr = Math.atan2(plane.vy, plane.vx);
  return wrapA(b - tr) > 0 ? -1 : 1;
}
// a bundle of chaff: a cloud of foil blooming behind the aircraft. The radar may take it for the aircraft, the more
// so the more the aircraft is on its beam (the doppler notch: across its line of sight it moves no faster than the
// cloud)
function dropChaff(m) {
  if (AC.chaff <= 0 || AC.downed || !missiles.includes(m) || m.tgt !== 'air') return;
  AC.chaff--; Snd.flare();
  const c = { x: plane.x - plane.vx * 0.3 * PXM, y: plane.y - plane.vy * 0.3 * PXM, z: gndAgl(), vx: WIND.x, vy: WIND.y, vz: -2, t: 0, chaff: true };
  for (let k = 0; k < 3; k++) plumeW.spawn({ x: c.x + rand(-6, 6) * PXM, y: c.y + rand(-6, 6) * PXM, z: c.z, wind: 0.5, life: rand(2.5, 4), s0: 4 * PXM, s1: rand(14, 22) * PXM, a0: 0.28, a1: 0, c0: [0.82, 0.83, 0.85], fix: true });
  // (the beam to the site's radar, which guides it, not to the missile)
  const los = Math.atan2(plane.y - m.src.y, plane.x - m.src.x), beam = Math.abs(Math.sin(Math.atan2(plane.vy, plane.vx) - los));
  if (Math.random() < 0.05 + 0.3 * beam * beam) m.tgt = c;
}
// the jet's break: hard round onto the beam, faster, wings back level on it until the missile is gone; then back to
// the orbit (or the run, abandoned: the pilot does not press a run under a missile)
function jetDefend(u, m, side) {
  if (JX.gs) return;   // (on the ground, climbing out or on the way home: behind our lines)
  if (JX.run) jetAbort(false);
  JX.ask = null;
  const b = Math.atan2(u.y - plane.y, u.x - plane.x), chi = b - side * Math.PI / 2;
  AC.def = { m, u, until: S.missionT + 12 };
  JX.P.set('nav', { chi: Math.atan2(Math.cos(chi), -Math.sin(chi)), h: JX.h, kcas: Math.min(JX.kcas + 90, 470) }, Object.assign({ bank: 80 * Math.PI / 180, roll: 3, nz: 6.5 }, JET_CREW));
}
function jetDefendEnd() {
  const d = AC.def; if (!d || missiles.includes(d.m) || S.missionT < d.until) return;
  AC.def = null;
  if (S.phase !== 'play' || AC.downed || JX.gs) return;
  if (!d.hit) radio('MISSILE DEFEATED, BACK TO THE ORBIT', 'تفادينا الصاروخ، نرجع للمدار', 'jet', ['f.defeat']);
  jetOrbit(plane.oc || S.aim);
}
// a point of light in the canopy view: sized to a fixed angle (rad) at its distance from the eye
function glare(x, y, z, ang, c, a) {
  const d = Math.hypot((x - plane.x) * MPP, (y - plane.y) * MPP, z - gndAgl()), s = Math.max(0.6, d * ang) * PXM;
  glowW.put(x, y, s, s, 0, c[0], c[1], c[2], a, 0, z * PXM);
  glowW.put(x, y, s * 0.35, s * 0.35, 0, 1, 1, 0.9, a, 0, z * PXM);
}
// M257 illumination: the flare lights some 550 m over the aim point and burns two minutes under its parachute, coming
// down at 4.5 m/s and drifting with the wind; a million candela: at night it lights about a kilometre of ground for
// the TV camera, and is a white star in the canopy and a hot speck on the thermal
const illums = [];
function updateIllum(dt) {
  for (let i = illums.length - 1; i >= 0; i--) {
    const f = illums[i]; f.t += dt; f.z -= 4.5 * dt; f.x += WIND.x * dt; f.y += WIND.y * dt;
    if (f.t > 120 || f.z < 20) { illums.splice(i, 1); continue; }
    const k = Math.min(1, f.t / 1.5) * Math.min(1, (120 - f.t) / 8) * (0.88 + 0.12 * Math.sin(f.t * 23) * Math.sin(f.t * 7.3)), R = (900 + f.z * 0.4) * PXM;
    if (S.night) lightL.put(f.x, f.y, R, R, 0, 1, 0.9, 0.74, 0.5 * k, 0);
    glowE.put(f.x, f.y, 3 * PXM, 3 * PXM, 0, 1, 1, 0.95, k, 0);
    if (S.sensor !== 'eo') heatL.put(f.x, f.y, 2 * PXM, 2 * PXM, 0, 1, 0, 0, k, 0);
    glare(f.x, f.y, f.z, 0.012, [1, 0.97, 0.9], k);
  }
}
function updateMissiles(dt) {
  for (let i = missiles.length - 1; i >= 0; i--) {
    const m = missiles[i]; m.t += dt;
    const sam = m.kind === 'sam';
    if (m.tgt.chaff) { const c = m.tgt; c.t += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt; }
    let tg = m.tgt === 'air' ? { x: plane.x, y: plane.y, z: gndAgl() } : m.tgt;
    // the SAM: boost to ~800 m/s in 3.5 s, then coasting; steered by the site to where the aircraft will be when it
    // gets there, while the site lives and radiates. The shoulder missile: motor for 6 s, its seeker on the heat
    if (sam) {
      m.v = m.t < 3.5 ? Math.min(820, m.v + 230 * dt) : Math.max(250, m.v - 18 * dt);
      // (the radar's own error at that range: some 15 m, so not every one comes within its fuze's reach)
      if (!m.err) m.err = { x: gauss() * 11, y: gauss() * 11, z: gauss() * 8 };
      if (m.tgt === 'air') { const go = Math.hypot((tg.x - m.x) * MPP, (tg.y - m.y) * MPP, tg.z - m.z) / Math.max(m.v, 100);
        tg = { x: tg.x + (plane.vx * go + m.err.x) * PXM, y: tg.y + (plane.vy * go + m.err.y) * PXM, z: tg.z + m.err.z }; }
    } else m.v = m.t < 6 ? Math.min(580, m.v + 160 * dt) : Math.max(150, m.v - 25 * dt);
    const guided = !sam || (m.src.alive && m.src.sam.on);
    const dx = (tg.x - m.x) * MPP, dy = (tg.y - m.y) * MPP, dz = tg.z - m.z, dh = Math.hypot(dx, dy), d = Math.hypot(dh, dz);
    const wr = (sam ? 260 : 180) / Math.max(m.v, 50) * dt;
    if (guided) { m.hd += clamp(wrapA(Math.atan2(dy, dx) - m.hd), -wr, wr); m.el += clamp(Math.atan2(dz, dh) - m.el, -wr, wr); }
    else m.el -= 9.8 / Math.max(m.v, 50) * dt;
    const ch = Math.cos(m.el);
    m.x += Math.cos(m.hd) * ch * m.v * dt * PXM; m.y += Math.sin(m.hd) * ch * m.v * dt * PXM; m.z += Math.sin(m.el) * m.v * dt;
    // the smoke trail it leaves, and its motor's glare (seen through the glass)
    m.trail += dt;
    // (the SAM's motor burns 3.5 s and leaves a thick column; then it coasts, a trail no more)
    while (m.trail > 0.04) { m.trail -= 0.04; if (!sam || m.t < 3.5) plumeW.spawn({ x: m.x, y: m.y, z: m.z, wind: 0.4, life: rand(8, 12) * (sam ? 1.6 : 1), s0: (sam ? 8 : 5) * PXM, s1: rand(16, 24) * (sam ? 1.5 : 1) * PXM, a0: 0.75, a1: 0, c0: [0.93, 0.92, 0.9], c1: [0.82, 0.82, 0.8], fix: true, fade: 'late' }); }
    if (m.t < (sam ? 3.5 : 6)) glare(m.x, m.y, m.z, sam ? 0.022 : 0.016, [1, 0.85, 0.6], 1);
    if (m.z < 150) glowE.put(m.x, m.y, 1.2 * PXM, 1.2 * PXM, 0, 1, 0.9, 0.7, 0.8, 0);
    // (the SAM's proximity fuze: its warhead goes off within some 20 m of the aircraft, or as it passes it)
    const dA = sam && m.tgt === 'air' ? Math.hypot((plane.x - m.x) * MPP, (plane.y - m.y) * MPP, gndAgl() - m.z) : d;
    if (sam && m.tgt === 'air') { if (m.dA != null && dA > m.dA && m.dA < 80) m.pass = true; m.dA = Math.min(m.dA ?? 1e9, dA); }
    if ((sam ? dA < 20 || m.pass : d < 9) || m.t > (sam ? 24 : 16) || m.z < 0) {
      missiles.splice(i, 1);
      fireW.spawn({ x: m.x, y: m.y, z: m.z, life: 0.35, s0: 10 * PXM, s1: 18 * PXM, a0: 1, a1: 0, c0: [1, 0.8, 0.45], fix: true, rot: 0, ease: 'lin' });
      for (let k = 0; k < 5; k++) plumeW.spawn({ x: m.x + rand(-3, 3) * PXM, y: m.y + rand(-3, 3) * PXM, z: m.z, wind: 0.6, life: rand(4, 6), s0: 4 * PXM, s1: rand(12, 18) * PXM, a0: 0.6, a1: 0, c0: [0.25, 0.24, 0.23], c1: [0.55, 0.54, 0.52], fix: true });
      if (sam && m.tgt === 'air' && m.dA < 20) { acHit(rand(45, 80), 'msl'); if (AC.def && AC.def.m === m) AC.def.hit = true; }
      else if (sam && m.tgt === 'air' && m.dA < 45) acHit(rand(10, 25), 'gun');
      else if (d < 9 && m.tgt === 'air') acHit(rand(40, 70), 'msl');
      else if (m.tgt === 'air' && d < 40) acHit(rand(8, 20), 'gun');
    }
  }
  // tracers coming up at us: a glare of about the same apparent size near or far (a point of light), with a short
  // streak behind it; seen only through the glass
  for (let i = tracers.length - 1; i >= 0; i--) {
    const q = tracers[i]; q.t += dt;
    if (q.t > q.life) { tracers.splice(i, 1); continue; }
    q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
    glare(q.x, q.y, q.z, 0.011, [1, 0.55, 0.2], 1);
    for (let k = 1; k <= 3; k++) glare(q.x - q.vx * 0.012 * k, q.y - q.vy * 0.012 * k, q.z - q.vz * 0.012 * k, 0.008, [1, 0.45, 0.15], 0.6 - k * 0.15);
  }
  // flares: burning white-hot as they fall, a few seconds each
  for (let i = flares.length - 1; i >= 0; i--) {
    const f = flares[i]; f.t += dt;
    f.vz -= 9.8 * dt * 0.4; f.x += f.vx * dt; f.y += f.vy * dt; f.z = Math.max(0, f.z + f.vz * dt);
    if (f.t > 4.5 || f.z <= 0) { flares.splice(i, 1); continue; }
    const a = 1 - f.t / 4.5;
    glare(f.x, f.y, f.z, 0.02, [1, 0.95, 0.82], a);
    plumeW.spawn({ x: f.x, y: f.y, z: f.z, life: 2.5, s0: 1.5 * PXM, s1: 5 * PXM, a0: 0.35 * a, a1: 0, c0: [0.92, 0.92, 0.9], fix: true });
    S.flash = Math.max(S.flash, 0.06 * a);
  }
}
// ground controller: the first contact, then a target talk-on now and then, the worst threat to his men marked
function jtac() {
  // (not to a jet still on the ground or climbing out: his talk-on comes once it has checked in)
  if (JX.gs) return;
  const blue = friends.filter(f => f.alive); if (!blue.length) return;
  const red = targets.filter(t => t.alive && !t.escaped && t.kind !== 'house' && gunOf(t) && t.engaging);
  if (!red.length) return;
  const f = blue[0], t = red.sort((a, b) => (GUNS[b.gun].gdmg - GUNS[a.gun].gdmg) || Math.hypot(a.x - f.x, a.y - f.y) - Math.hypot(b.x - f.x, b.y - f.y))[0];
  const d = Math.round(Math.hypot(t.x - f.x, t.y - f.y) * MPP / 50) * 50, [en, ar] = dirOf(t.x - f.x, t.y - f.y);
  const what = t.kind === 'vehicle' ? [t.en, t.type] : ['PAX', 'مقاتلون'];
  radio('HUNTER: ' + what[0] + ' ' + d + 'M ' + en + ', RED SMOKE, LASER 1588', 'صقر، هنا هنتر، ' + what[1] + '، ' + d + ' متر ' + ar + ' موقعنا، معلَّم بدخان أحمر وليزر 1588، حوّل', 'hunter',
    ['h.call', 'h.t.' + what[0], 'h.d.' + (d <= 1000 ? Math.max(50, d) : Math.min(3000, Math.round(d / 100) * 100)), 'h.dir.' + en, 'h.mark']);
  CK.known.add(t); t.smokeT = 45; t.lasedT = 45; t.lasedCode = 1;
}
function killFriend(f, byUs) {
  if (!f.alive) return;
  kill(f);
  S.blueLost++; if (byUs) S.fratKill++;
  if (f.panel) f.panel.visible = false;
  radio(byUs ? 'CEASE FIRE, FRIENDLY HIT' : 'HUNTER: CASUALTIES', byUs ? 'أوقف النار! أوقف النار! أصبت قواتنا' : 'صقر، هنا هنتر، عندنا إصابات، نحتاج الإسناد الآن، حوّل', 'hunter', [byUs ? 'h.ffkill' : 'h.cas']);
}
// on the pad: the ground crew rearms, refuels and patches the aircraft (a few minutes for a full turn-round)
function rearm(dt) {
  const was = S.ammo.msl + S.ammo.rkt + S.ammo.gun + AC.flares + Math.round(plane.fuel) + Math.round(AC.hp);
  plane.reload = (plane.reload || 0) + dt;
  // back to the loadout: a Rumh every 4 s, rockets 4 a second, kind by kind
  const L = LOADOUTS[S.load] || LOADOUTS.mix;
  if (plane.reload >= 4) { plane.reload = 0; const k = Object.keys(L.hf).find(k => S.hf[k] < L.hf[k]); if (k) S.hf[k]++; }
  let r = Math.ceil(4 * dt); for (const k of Object.keys(L.rk)) { const a = Math.min(r, L.rk[k] - S.rk[k]); if (a > 0) { S.rk[k] += a; r -= a; } }
  S.ammo.msl = sumOf(S.hf); S.ammo.rkt = sumOf(S.rk); S.ammo.gun = Math.min(1200, S.ammo.gun + Math.ceil(60 * dt));
  AC.flares = Math.min(60, AC.flares + Math.ceil(3 * dt)); plane.fuel = Math.min(2400, plane.fuel + 30 * dt);
  AC.hp = Math.min(100, AC.hp + 1.2 * dt); AC.eng = AC.eng.map(e => Math.min(1, e + 0.012 * dt));
  if (AC.hp >= 100 && AC.eng.every(e => e >= 1)) AC.warn.length = 0;
  const now = S.ammo.msl + S.ammo.rkt + S.ammo.gun + AC.flares + Math.round(plane.fuel) + Math.round(AC.hp);
  if (now > was && !plane.rearming) { plane.rearming = true; radio('REARMING', 'صقر، هنا الطاقم الأرضي، نبدأ التذخير والتزويد بالوقود', 'crew', ['c.rearm']); }
  if (now === was && plane.rearming) { plane.rearming = false; radio('READY', 'صقر، الطائرة جاهزة، المنطقة خالية', 'crew', ['c.ready']); }
  syncUI();
}
// Indirect fire on our troops: the mortar (a round every 14-22 s while ours are within its 3 km, 12 s in the air,
// some 20 m off at first, closer as it adjusts) and the Grad (a ripple of rockets every two or three minutes, half a
// second apart: off the rails in fire and smoke, coming down round our troops, most of them wide). Their blasts hurt
// whom they land near; none of it is the aircraft's doing (no fratricide counted).
// Ours hold out the longer under a jet: its attack takes a minute or more (the run, the bomb's fall) where the
// Apache's takes seconds, and the squad that lasted the helicopter's few minutes was overrun by the jet's second
// bomb (three missions of nine played from the base lost on it, measured): the enemy's fire tells on them a quarter
// (at a third the CAS's squad lasted 8.5 minutes, four of its seven down)
const BLUE_K = JET ? 0.25 : 1;
function enemyBlast(x, y, k, R, dmg) {
  explode(x, y, k, { small: k < 1, noScorch: k < 0.8 });
  dmg *= BLUE_K;
  for (const f of friends) {
    if (!f.alive || f.dormant) continue;
    if (f.kind === 'personnel') { hurtMen(f, x, y, dmg, R); if (!f.men.some(m => m.alive)) killFriend(f); }
    else { const d = Math.max(0, Math.hypot(f.x - x, f.y - y) * MPP - f.len * 0.35); if (d < R) { f.hp -= dmg * (1 - d / R) * (f.vk === 'mrap' ? 0.3 : 1); if (f.hp <= 0) killFriend(f); } }
  }
}
function indirect(u, dt) {
  const blue = friends.filter(f => f.alive && !f.dormant);
  const near = blue.map(f => ({ f, d: Math.hypot(f.x - u.x, f.y - u.y) * MPP })).sort((a, b) => a.d - b.d)[0];
  u.fireT = (u.fireT == null ? rand(8, 20) : u.fireT) - dt;
  if (u.fireT > 0) return;
  const fx = Math.cos(u.h), fy = Math.sin(u.h);
  if (u.vk === 'mortar') {
    if (!near || near.d > 3000) { u.fireT = 5; return; }
    u.fireT = rand(14, 22); u.adj = Math.max(6, (u.adj || 26) * 0.8);
    glowE.spawn({ x: u.x, y: u.y, life: 0.08, s0: 1.5 * PXM, s1: 0.6 * PXM, a0: 1, a1: 0, c0: [1, 0.85, 0.5], rot: 0, ease: 'lin' });
    smokeL.spawn({ x: u.x, y: u.y, wind: 1, life: rand(3, 5), s0: 1 * PXM, s1: rand(4, 6) * PXM, a0: 0.45, a1: 0, c0: [0.8, 0.78, 0.74], c1: [0.7, 0.68, 0.64] });
    if (S.sensor !== 'eo') heatL.spawn({ x: u.x, y: u.y, life: 0.3, s0: 1.4 * PXM, s1: 0.8 * PXM, a0: 0.9, a1: 0, c0: [1, 0, 0], ease: 'lin' });
    const f = near.f, x = f.x + gauss() * u.adj * PXM, y = f.y + gauss() * u.adj * PXM;
    timers.push({ t: 12, fn: () => { if (S.phase === 'play') enemyBlast(x, y, 0.7, 14, 60); } });
    return;
  }
  // the Grad: a ripple of 20 (half its tubes), toward ours if there are any within its 20 km, else down range; the
  // rocket boat: its 12 tubes at what it is set on (`aim`: the port), else (the editor's) at the nearest of ours
  // within its 20 km, from its deck
  if (u.vk === 'rktboat' && (u.dormant || u.v > 1)) { u.fireT = 5; return; }
  const boat = u.vk === 'rktboat', nR = boat ? 12 : 20, aim = boat && (u.aim || (near && near.d < 20000 ? [near.f.x, near.f.y] : null));
  if (boat && !aim) { u.fireT = 5; return; }
  u.fireT = boat ? rand(70, 110) : rand(120, 180);
  if (boat) { u.h = Math.atan2(aim[1] - u.y, aim[0] - u.x); placeVehicle(u); }
  const ax = Math.cos(u.h), ay = Math.sin(u.h);
  for (let i = 0; i < nR; i++) timers.push({ t: i * 0.5, fn: () => {
    if (!u.alive || S.phase !== 'play') return;
    if (boat) {
      glowE.spawn({ x: u.x, y: u.y, vx: ax * 240 * PXM, vy: ay * 240 * PXM, life: 1.2, s0: 0.7 * PXM, s1: 0.4 * PXM, sx: 8, rot: spriteRot(u.h) + Math.PI / 2, a0: 1, a1: 0.2, c0: [1, 0.8, 0.45], ease: 'lin' });
      smokeL.spawn({ x: u.x, y: u.y, wind: 1, life: rand(6, 9), s0: 2 * PXM, s1: rand(9, 13) * PXM, a0: 0.5, a1: 0, c0: [0.86, 0.85, 0.83], c1: [0.75, 0.74, 0.72] });
      const x = aim[0] + gauss() * 60 * PXM, y = aim[1] + gauss() * 60 * PXM, tof = 4 + Math.hypot(aim[0] - u.x, aim[1] - u.y) * MPP / 600;
      timers.push({ t: tof, fn: () => { if (S.phase === 'play') enemyBlast(x, y, 0.8, 20, 80); } });
      return;
    }
    glowE.spawn({ x: u.x + fx * u.len * 0.3 * PXM, y: u.y + fy * u.len * 0.3 * PXM, vx: fx * 260 * PXM, vy: fy * 260 * PXM, life: 1.4, s0: 0.8 * PXM, s1: 0.5 * PXM, sx: 8, rot: spriteRot(u.h) + Math.PI / 2, a0: 1, a1: 0.2, c0: [1, 0.8, 0.45], ease: 'lin' });
    smokeL.spawn({ x: u.x + fx * u.len * 0.4 * PXM, y: u.y + fy * u.len * 0.4 * PXM, wind: 1, life: rand(8, 12), s0: 3 * PXM, s1: rand(12, 18) * PXM, a0: 0.55, a1: 0, c0: [0.86, 0.85, 0.83], c1: [0.75, 0.74, 0.72] });
    if (S.sensor !== 'eo') heatL.spawn({ x: u.x, y: u.y, life: 1.2, s0: 3 * PXM, s1: 6 * PXM, a0: 0.8, a1: 0, c0: [1, 0, 0], ease: 'lin' });
    if (near && near.d < 20000) { const f = near.f, x = f.x + gauss() * 120 * PXM, y = f.y + gauss() * 120 * PXM, tof = 8 + near.d / 700;
      timers.push({ t: tof, fn: () => { if (S.phase === 'play') enemyBlast(x, y, 0.9, 25, 90); } }); }
  } });
}
function updateWar(dt) {
  AC.jolt *= Math.exp(-dt * 6);
  if (S.phase !== 'play') return;
  if (plane.mode === 'pad' && BASE) { plane.padT += dt; if (plane.padT > 6) rearm(dt); } else plane.rearming = false;
  const blue = friends.filter(f => f.alive);
  for (const f of friends) placePanel(f);
  // first contact: the controller calls it, and the enemy now knows aircraft will come
  if (blue.length && !AC.tic) {
    const near = targets.some(t => t.alive && t.kind !== 'house' && !quiet(t) && gunOf(t) && blue.some(f => !f.dormant && Math.hypot(t.x - f.x, t.y - f.y) * MPP < GUNS[gunOf(t)].gnd));
    if (near && S.missionT > (JET ? 14 : 2)) { AC.tic = true; radio('HUNTER: TROOPS IN CONTACT', 'صقر، صقر، هنا هنتر، قواتنا تحت النار، نطلب إسنادًا جويًا فورًا، حوّل', 'hunter', ['h.tic']); timers.push({ t: 9, fn: jtac }); AC.nextTalk = S.missionT + 50; }
  }
  if (AC.tic && S.missionT > AC.nextTalk && !JX.gs) { AC.nextTalk = S.missionT + 50; jtac(); }
  // every armed unit on both sides
  for (const u of [...targets, ...friends]) {
    if (!u.alive || u.escaped || u.dormant || u.inside || u.kind === 'house') continue;
    if (quiet(u)) { if (u.alert || friends.some(f => f.alive && !f.dormant && Math.hypot(f.x - u.x, f.y - u.y) * MPP < u.ambush)) springAmbush(u); else continue; }
    if (u.vk === 'mortar' || u.vk === 'bm21' || u.vk === 'rktboat') { if (dt > 0) indirect(u, dt); continue; }
    if (u.vk === 'sa8') { if (dt > 0 && u.side !== 'blue') samUpdate(u, dt); continue; }
    if (!u.gun) u.gun = gunOf(u); if (!u.gun) continue;
    if (u.fireT == null) u.fireT = rand(1, 5);
    // the strobe a friendly switches on at night, a blink a second (only the thermal sees it)
    if (u.side === 'blue' && S.night && S.sensor !== 'eo' && (S.t + u.x * 0.01) % 1 < 0.12) heatL.put(u.kind === 'vehicle' ? u.x : u.hx, u.kind === 'vehicle' ? u.y : u.hy, 1.6 * PXM, 1.6 * PXM, 0, 1, 0, 0, 1, 0);
    // a target marked by the controller: red smoke drifting off it
    if (u.lasedT > 0) u.lasedT -= dt;
    if (u.smokeT > 0) { u.smokeT -= dt; if (Math.random() < dt * 4) smokeL.spawn({ x: u.x + rand(-2, 2) * PXM, y: u.y + rand(-2, 2) * PXM, wind: 1.6, life: rand(9, 14), s0: 2 * PXM, s1: rand(12, 18) * PXM, a0: 0.55, a1: 0, c0: [0.75, 0.16, 0.12], c1: [0.7, 0.42, 0.4], rise: 3, riseT: 6, mark: true }); }
    const isRed = u.side !== 'blue';
    if (isRed && u.aa > 0) {
      // the missile team: launches when it has the aircraft in reach
      u.aaT = (u.aaT == null ? rand(4, 10) : u.aaT) - dt;
      // (not the jet taxiing out and climbing away from its base: the base stands behind our lines, the theatre
      // drawn close to it only to fit the map)
      if (aware(u, dt) && u.aaT <= 0 && slantTo(u) < MANPADS_R && gndAgl() < MANPADS_ALT && gndAgl() > 30 && !JX.gs) launchManpads(u);
    }
    u.fireT -= dt;
    if (u.fireT > 0) continue;
    const g = GUNS[u.gun];
    // a gun that can reach the aircraft, aware of it, takes it on (more often than the troops in front of it)
    // (an aircraft on the ground or skimming it is masked by the terrain: nobody can take it on)
    const air = isRed && g.air > 0 && gndAgl() > 30 && !JX.gs && aware(u, dt) && slantTo(u) < g.air;
    let tgt = null, bd = g.gnd / MPP;
    // riflemen go for people and soft vehicles rather than armour they cannot hurt
    for (const e of enemiesOf(u)) { const d = Math.hypot(e.x - u.x, e.y - u.y) * (u.gun === 'rifle' && e.vk === 'mrap' ? 3 : 1); if (d < bd) { bd = d; tgt = e; } }
    // the enemy fires on friendlies; friendlies fire on what is in contact with them
    if (air && (!tgt || Math.random() < 0.6)) { shootBurst(u, 'air'); u.engaging = true; }
    else if (tgt && (isRed || AC.tic)) { shootBurst(u, tgt); if (isRed) u.engaging = true; }
    else u.fireT = rand(1, 3);
  }
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]; b.acc += dt * b.rps;
    while (b.acc >= 1 && b.k < b.n) { b.acc -= 1; round(b); b.k++; }
    if (b.k >= b.n || !b.u.alive) bursts.splice(i, 1);
  }
  convoyWatch();
  updateMissiles(dt);
}
// the escorted convoy: halts as one while a gun that has opened up is in reach of it, moves on once they are dealt
// with; arrives at its last halt (or off the map's end)
function convoyWatch() {
  const esc = friends.filter(f => f.escort && f.alive && !f.dormant);
  if (!esc.length) return;
  const hot = targets.some(t => t.alive && !t.escaped && t.kind !== 'house' && !quiet(t) && gunOf(t) && esc.some(f => Math.hypot(t.x - f.x, t.y - f.y) * MPP < GUNS[gunOf(t)].gnd * 0.7));
  const was = esc[0].hold;
  for (const f of esc) {
    f.hold = hot && !f.arrived;
    if (!f.arrived && (f.escaped || (f.haltS != null && f.haltFor >= 900 && Math.abs(f.haltS - f.s) < 4 && f.v < 0.5))) f.arrived = true;
  }
  if (hot && !was && !esc.every(f => f.arrived)) radio('HUNTER: CONVOY HALTED, TAKING FIRE', 'صقر، هنا هنتر، الرتل متوقف تحت النار، حوّل', 'hunter', ['h.halt']);
  if (!hot && was) radio('HUNTER: CONVOY MOVING', 'صقر، هنا هنتر، الطريق آمن، الرتل يتحرك، حوّل', 'hunter', ['h.move']);
  if (!S.convoyIn && esc.every(f => f.arrived)) { S.convoyIn = true; radio('HUNTER: CONVOY AT DESTINATION', 'صقر، هنا هنتر، وصل الرتل، شكرًا على الإسناد، انتهى', 'hunter', ['h.in']); checkEnd(); }
}

