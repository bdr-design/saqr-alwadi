/* ===================== mission editor (commander mode) ===================== */
// The player lays out the mission on the valley map: vehicles (parked, or driving the road either way), groups of
// fighters, and houses. The layout is kept in localStorage and played by startMission(layout) -> buildLayout.
const ED_KINDS = [
  { t: 'veh', k: 'hilux', en: 'Pickup technical', ar: 'فني بيك أب', img: 'sprites/hilux.png' },
  { t: 'veh', k: 'lc79', en: '4x4 technical', ar: 'فني دفع رباعي', img: 'sprites/lc79.png' },
  { t: 'veh', k: 'mrap', en: 'MRAP', ar: 'مدرعة', img: 'sprites/mrap.png' },
  { t: 'veh', k: 'cargo', en: 'Truck', ar: 'شاحنة', img: 'sprites/cargo.png' },
  { t: 'veh', k: 'tanker', en: 'Fuel tanker', ar: 'صهريج', img: 'sprites/tanker.png' },
  { t: 'veh', k: 'launcher', en: 'Missile launcher', ar: 'منصة صواريخ', img: 'sprites/launcher.png' },
  { t: 'veh', k: 'suv', en: 'Civilian SUV', ar: 'جيب مدني', img: 'sprites/suv.png' },
  { t: 'veh', k: 't72', en: 'Tank', ar: 'دبابة', img: 'sprites/t72.png' },
  { t: 'veh', k: 'btr80', en: 'APC', ar: 'مدرعة', img: 'sprites/btr80.png' },
  { t: 'veh', k: 'bm21', en: 'rocket launcher', ar: 'راجمة صواريخ', img: 'sprites/bm21.png' },
  { t: 'veh', k: 'ural', en: 'Army truck', ar: 'شاحنة عسكرية', img: 'sprites/ural.png' },
  { t: 'veh', k: 'zu23e', en: '23 mm position', ar: 'موقع 23 ملم', img: 'sprites/zu23e.png' },
  { t: 'veh', k: 'mortar', en: 'Mortar position', ar: 'موقع هاون', img: 'sprites/mortar.png' },
  { t: 'veh', k: 'trench', en: 'MG trench', ar: 'خندق رشاش', img: 'sprites/trench.png' },
  { t: 'veh', k: 'ammo', en: 'Ammo dump', ar: 'مخزن ذخيرة', img: 'sprites/ammo.png' },
  // (its own picture to come: assets/originals/sa8_prompt.md)
  { t: 'veh', k: 'sa8', en: 'Radar air defence', ar: 'دفاع جوي راداري', img: 'sprites/btr80.png' },
  // the boats (on a map with a sea): put on the water only; moored, or round a loop
  null,
  { t: 'veh', k: 'fac', sea: true, en: 'Attack craft', ar: 'زورق هجوم', img: 'sprites/fac.png' },
  { t: 'veh', k: 'rktboat', sea: true, en: 'Rocket boat', ar: 'زورق صواريخ', img: 'sprites/rktboat.png' },
  { t: 'veh', k: 'dhow', sea: true, en: 'Smuggling dhow', ar: 'قارب تهريب', img: 'sprites/dhow.png' },
  { t: 'veh', k: 'patrol', sea: true, en: 'Patrol boat', ar: 'زورق دورية', img: 'sprites/patrol.png' },
  { t: 'veh', k: 'lcm', sea: true, en: 'Landing craft', ar: 'سفينة إنزال', img: 'sprites/lcm.png' },
  { t: 'veh', k: 'fishing', sea: true, civil: true, en: 'Fishing boat (civilian)', ar: 'قارب صيد (مدني)', img: 'sprites/fishing.png' },
  null,
  { t: 'pax', k: 'pax', en: 'Fighters', ar: 'أفراد', img: 'sprites/ed_pax_red.png' },
  { t: 'pax', k: 'pax', id: 'aapax', aa: 2, en: 'MANPADS team', ar: 'صواريخ كتف', img: 'sprites/ed_pax_aa.png' },
  null,
  // friendly forces: a squad with its VS-17 panel, an armoured vehicle
  { t: 'pax', k: 'pax', id: 'fpax', side: 'blue', en: 'Friendly troops', ar: 'قوة صديقة', img: 'sprites/ed_pax_blue.png' },
  { t: 'veh', k: 'mrap', id: 'fmrap', side: 'blue', en: 'Friendly MRAP', ar: 'مدرعة صديقة', img: 'sprites/mrap.png' },
  null,
  { t: 'house', k: 'house1', en: 'Tower house', ar: 'بيت برجي', img: 'sprites/house1.png' },
  { t: 'house', k: 'house2', en: 'Walled house', ar: 'بيت بحوش', img: 'sprites/house2.png' },
  { t: 'house', k: 'house3', en: 'Stone house', ar: 'بيت حجري', img: 'sprites/house3.png' },
  { t: 'house', k: 'house4', en: 'Courtyard house', ar: 'بيت بفناء', img: 'sprites/house4.png' },
];
const ED_SPEEDS = [{ v: 6, ar: 'بطيئة', en: 'Slow' }, { v: 9.5, ar: 'عادية', en: 'Normal' }, { v: 14, ar: 'سريعة', en: 'Fast' }];
// a boat's cruise round its loop (m/s; no faster than it can go)
const ED_BOAT_SPEEDS = [{ v: 3, ar: 'بطيء', en: 'Slow' }, { v: 6, ar: 'عادي', en: 'Normal' }, { v: 10, ar: 'سريع', en: 'Fast' }];
const ED_MAX_TARGETS = 40, ED_MAX_HOUSES = 16;
const ED = { open: false, items: [], sel: -1, arm: null, s: 1, ox: 0, oy: 0, imgs: {}, tiles: {}, dirty: true, ptrs: new Map(), g: null };
const edCv = $('#edMap'), edCx = edCv.getContext('2d');
const edImg = src => { let i = ED.imgs[src]; if (!i) { i = ED.imgs[src] = new Image(); i.onload = () => { ED.dirty = true; }; i.src = src; } return i; };
// a palette entry by its id; an item's entry by what it is (kind, side, missiles)
const edKind = id => ED_KINDS.find(k => k && (k.id || k.k) === id);
const edInfo = it => ED_KINDS.find(k => k && k.k === it.k && (k.side || 'red') === (it.side || 'red') && !!k.aa === !!it.aa);
const edTargets = () => ED.items.filter(it => (it.t !== 'house' || it.role === 'hostile') && it.side !== 'blue' && !it.civil).length;
function edRoadNearest(x, y) {
  // the whole road, not just near a hint: a vehicle may be dropped anywhere
  let best = 1e18, s = 0;
  for (let i = 0; i < RN - 1; i++) {
    const ax = RX[i], ay = RY[i], dx = RX[i + 1] - ax, dy = RY[i + 1] - ay, L2 = dx * dx + dy * dy || 1;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1), ex = ax + dx * t - x, ey = ay + dy * t - y, d = ex * ex + ey * ey;
    if (d < best) { best = d; s = lerp(RS[i], RS[i + 1], t); }
  }
  return s;
}
// a moving vehicle sits on the road: its position and heading come from its distance along it
function edSnap(it) {
  if (it.t !== 'veh' || !it.move) return;
  it.s = clamp(edRoadNearest(it.x, it.y), 12, ROAD_LEN - 12);
  const p = roadAt(it.s, { x: 0, y: 0 }); it.x = p.x; it.y = p.y;
  it.h = roadHeading(it.s) + (it.dir < 0 ? Math.PI : 0);
}
function edSave() { try { localStorage.setItem(mapKey('saqr.layout'), JSON.stringify({ v: 1, items: ED.items })); } catch (_) {} }
function edLoad() { try { const o = JSON.parse(localStorage.getItem(mapKey('saqr.layout')) || 'null'); if (o && Array.isArray(o.items)) return o.items; } catch (_) {} return null; }
// the default mission, read back from the world as a layout (its scripted halts are not kept)
// (the map's own first mission, the training sortie passed over: the valley's is built in code, the other maps' are layouts; the theatre's own
// positions, not the valley's, which «الافتراضي» put on every map)
function edDefaultItems() {
  const m0 = MISSIONS.find(m => !m.custom && !/_train$/.test(m.id));
  setupMission(m0 && m0.layout ? m0.layout.map(it => ({ ...it })) : undefined);
  const out = [];
  for (const v of vehicles) {
    // (a mission's boat keeps its own route, its landing party and what it fires at, until it is moved)
    if (v.mode === 'sea') out.push({ t: 'veh', k: v.vk, x: v.path[0][0], y: v.path[0][1], h: v.h, sea: true, path: v.path.map(q => [q[0], q[1]]), loop: v.loop, escape: v.escape, spd: v.vCruise,
      ...(v.waitStart ? { startAt: v.waitStart } : {}), ...(v.land ? { land: v.land } : {}), ...(v.aim ? { aim: v.aim } : {}), ...(v.civil ? { civil: true } : {}) });
    else if (v.mode === 'parked') out.push({ t: 'veh', k: v.vk, x: v.x, y: v.y, h: v.h, move: false, dir: 1, spd: 9.5 });
    else out.push({ t: 'veh', k: v.vk, x: v.x, y: v.y, h: v.h, move: true, dir: v.dir, spd: Math.max(6, Math.round(v.vCruise * 2) / 2), s: v.s });
  }
  for (const g of groups) out.push({ t: 'pax', k: 'pax', x: g.x, y: g.y, n: g.men.length, ...(g.side === 'blue' ? { side: 'blue' } : {}), ...(g.aa ? { aa: g.aa } : {}) });
  for (const h of houses) if (h.bld == null) out.push({ t: 'house', k: h.hk, x: h.x, y: h.y, r: h.r, role: h.role });
  return out;
}
function buildLayout(items) {
  // the map picture's buildings: roles by area ({ t: 'blds', role, area: [x0, y0, x1, y1] }, later ones win), the rest 'struct'
  if (MAP.blds) MAP.blds.forEach((b, i) => {
    let role = 'struct';
    for (const it of items) if (it.t === 'blds' && (!it.area || (b[0] >= it.area[0] && b[0] <= it.area[2] && b[1] >= it.area[1] && b[1] <= it.area[3]))) role = it.role;
    makeBld(i, role);
  });
  buildUnits(items);
  const ids = targets.map((_, i) => i + 1).sort(() => Math.random() - 0.5);
  targets.forEach((t, i) => { t.id = ids[i]; });
  targets.sort((a, b) => a.id - b.id);
}
// the houses, groups and vehicles of a layout. A convoy (either side) keeps station on its leader and halts where
// told: a friendly one is the convoy the aircraft escorts (it halts under fire, arrives at its last halt). ambush (m):
// the unit holds its fire, unseen by the friendlies, until one of them comes that close or it is shot at
function buildUnits(items) {
  for (const it of items) {
    let u = null;
    if (it.t === 'house' && HOUSE[it.k]) makeHouse({ kind: it.k, x: it.x, y: it.y, r: it.r || 0, role: it.role });
    else if (it.t === 'pax') u = makeGroup(it.x, it.y, clamp(it.n | 0, 1, 12), { side: it.side, aa: it.aa });
    else if (it.t === 'veh' && SPR[it.k]) {
      // a boat from the editor: moored where put, or round its loop (boatLoop); a rocket boat's salvo at the nearest of ours
      if (it.sea && !it.path) { const L = it.loop && boatLoop(it.x, it.y, it.h || 0);
        u = makeVehicle({ kind: it.k, mode: 'sea', path: L ? L.path : [[it.x, it.y]], loop: !!L, v: L ? Math.min(it.spd || 6, SPR[it.k].vMax || 10) : 0, h: it.h || 0, civil: it.civil }); u.aim = it.aim || null; }
      else if (it.path) { u = makeVehicle({ kind: it.k, mode: 'sea', path: it.path, loop: it.loop, escape: it.escape, v: it.spd ?? 4, civil: it.civil, startAt: it.startAt, side: it.side }); u.land = it.land || null; u.aim = it.aim || null; }
      else if (it.convoy) u = makeVehicle({ kind: it.k, mode: 'convoy', convoy: it.convoy, s: it.s, dir: it.dir < 0 ? -1 : 1, v: it.spd || 9.5, haltS: it.haltS, haltFor: it.haltFor || 0, side: it.side, startAt: it.startAt });
      else if (it.side === 'blue') u = makeVehicle({ kind: it.k, mode: 'parked', x: it.x, y: it.y, h: it.h || 0, lights: false, side: 'blue' });
      else if (it.move) u = makeVehicle({ kind: it.k, mode: 'solo', s: clamp(it.s != null ? it.s : edRoadNearest(it.x, it.y), 12, ROAD_LEN - 12), dir: it.dir < 0 ? -1 : 1, v: it.spd || 9.5 });
      else u = makeVehicle({ kind: it.k, mode: 'parked', x: it.x, y: it.y, h: it.h || 0, lights: false });
      if (u && u.side === 'blue' && it.convoy) u.escort = true;
      // a pop-up, time-sensitive target (the jet's missions): hidden until startAt (s from now); left alive `window` s
      // after it shows, it fires and is gone (popUpdate). It does not move: it comes out from where it was hidden
      if (u && it.window && u.side !== 'blue' && !it.convoy) { u.pop = { at: S.missionT + (it.startAt || 0), win: it.window }; u.dormant = true; u.body.visible = u.shadow.visible = false; }
    }
    if (u && it.ambush && u.side !== 'blue') { u.ambush = it.ambush; u.sprung = false; }
  }
}

// view: map pixels <-> canvas pixels (CSS px)
const edToMap = q => ({ x: q.x / ED.s + ED.ox, y: q.y / ED.s + ED.oy });
const edToScr = (x, y) => ({ x: (x - ED.ox) * ED.s, y: (y - ED.oy) * ED.s });
function edFit() {
  const top = 50, bot = 74, s = Math.min(VW / W0, (VH - top - bot) / H0);
  ED.s = s; ED.ox = W0 / 2 - VW / 2 / s; ED.oy = H0 / 2 - (top + (VH - top - bot) / 2) / s;
}
function edZoom(f, q) {
  const p = edToMap(q), s = clamp(ED.s * f, Math.min(VW / W0, VH / H0) * 0.8, 8);
  ED.s = s; ED.ox = p.x - q.x / s; ED.oy = p.y - q.y / s; ED.dirty = true;
}
// on-screen size of an item, never too small to see and touch
function edSize(it) {
  if (it.t === 'house') { const h = HOUSE[it.k]; return { w: Math.max(18, h.wid * PXM * ED.s), l: Math.max(18 * h.len / h.wid, h.len * PXM * ED.s) }; }
  if (it.t === 'pax') return { w: 16, l: 16 };
  const v = SPR[it.k], k = Math.max(1, 20 / (v.len * PXM * ED.s));
  return { w: v.wid * PXM * ED.s * k, l: v.len * PXM * ED.s * k };
}
function edHit(q) {
  let best = -1, bd = 1e9;
  ED.items.forEach((it, i) => { const p = edToScr(it.x, it.y), z = edSize(it), r = Math.max(16, Math.max(z.w, z.l) / 2 + 4), d = Math.hypot(p.x - q.x, p.y - q.y); if (d < r && d < bd) { bd = d; best = i; } });
  return best;
}
function edDraw() {
  ED.dirty = false;
  const W = edCv.width, H = edCv.height, k = W / VW, c = edCx;
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#0d0f0e'; c.fillRect(0, 0, W, H);
  c.setTransform(k, 0, 0, k, 0, 0);
  // the valley photo: the coarse level as a base, then the level that suits the zoom where it has arrived
  const drawLevel = L => {
    const lv = LEVELS[L], sc = 2 ** L;
    for (let ty = 0; ty < lv.ny; ty++) for (let tx = 0; tx < lv.nx; tx++) {
      const x0 = tx * TILE / sc, y0 = ty * TILE / sc, w = Math.min(TILE, lv.w - tx * TILE) / sc, h = Math.min(TILE, lv.h - ty * TILE) / sc;
      const a = edToScr(x0, y0); if (a.x > VW || a.y > VH || a.x + w * ED.s < 0 || a.y + h * ED.s < 0) continue;
      const key = L + '/' + tx + '_' + ty; let im = ED.tiles[key];
      if (!im) { im = ED.tiles[key] = new Image(); im.onload = () => { ED.dirty = true; }; im.src = MAP.dir + 'tiles/' + key + '.jpg'; }
      if (im.complete && im.naturalWidth) c.drawImage(im, a.x, a.y, w * ED.s + 0.5, h * ED.s + 0.5);
    }
  };
  drawLevel(0);
  // placing needs no more than level 2; and only the most recent two dozen tiles are kept (each is 4 MB decoded)
  const L = clamp(Math.ceil(Math.log2(ED.s * k)), 0, 2); if (L > 0) drawLevel(L);
  const keys = Object.keys(ED.tiles).filter(x => x[0] !== '0');
  if (keys.length > 24) for (const x of keys.slice(0, keys.length - 24)) { ED.tiles[x].src = ''; delete ED.tiles[x]; }
  // the road, for vehicles that drive
  c.strokeStyle = 'rgba(255, 216, 74, 0.45)'; c.lineWidth = 1.5; c.setLineDash([6, 5]); c.beginPath();
  for (let i = 0; i < RN; i += 3) { const p = edToScr(RX[i], RY[i]); i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); }
  c.stroke(); c.setLineDash([]);
  // the water, shown while a boat is to be put down
  const arm = ED.arm && edKind(ED.arm);
  if (arm && arm.sea && WATER.img) {
    if (!ED.waterCv) { const w = ED.waterCv = document.createElement('canvas'); w.width = WATER.w; w.height = WATER.h; const x = w.getContext('2d'), d = x.createImageData(WATER.w, WATER.h);
      for (let i = 0; i < WATER.a.length; i++) if (WATER.a[i]) { d.data[i * 4] = 110; d.data[i * 4 + 1] = 220; d.data[i * 4 + 2] = 255; d.data[i * 4 + 3] = 105; }
      x.putImageData(d, 0, 0); }
    const a = edToScr(0, 0); c.imageSmoothingEnabled = true; c.drawImage(ED.waterCv, a.x, a.y, W0 * ED.s, H0 * ED.s);
  }
  // a boat's loop
  c.strokeStyle = 'rgba(124, 200, 255, 0.7)'; c.lineWidth = 1.5; c.setLineDash([5, 4]);
  for (const it of ED.items) {
    // a mission's own route
    if (it.sea && it.path) { c.beginPath(); it.path.forEach((q, i) => { const o = edToScr(q[0], q[1]); i ? c.lineTo(o.x, o.y) : c.moveTo(o.x, o.y); }); if (it.loop) c.closePath(); c.stroke(); continue; }
    const L = it.sea && it.loop && boatLoop(it.x, it.y, it.h || 0); if (!L) continue;
    const o = edToScr(L.cx, L.cy); c.beginPath(); c.arc(o.x, o.y, L.r * ED.s, 0, 6.283); c.stroke(); }
  // a rocket boat's target: a line to a cross
  c.strokeStyle = 'rgba(255, 107, 90, 0.85)';
  for (const it of ED.items) { if (!it.aim) continue; const a = edToScr(it.x, it.y), b = edToScr(it.aim[0], it.aim[1]);
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.arc(b.x, b.y, 7, 0, 6.283); c.moveTo(b.x - 11, b.y); c.lineTo(b.x + 11, b.y); c.moveTo(b.x, b.y - 11); c.lineTo(b.x, b.y + 11); c.stroke(); c.setLineDash([5, 4]); }
  c.setLineDash([]);
  ED.items.forEach((it, i) => {
    const p = edToScr(it.x, it.y), z = edSize(it), info = edInfo(it), img = edImg(info.img), on = i === ED.sel;
    c.save(); c.translate(p.x, p.y);
    if (it.t === 'pax') {
      const col = it.side === 'blue' ? '#6fd8f0' : it.aa ? '#ffb347' : '#ff6b5a';
      for (let j = 0; j < (it.n || 3); j++) { const a = j * 2.4, r = j ? 5 : 0; c.fillStyle = col; c.beginPath(); c.arc(Math.cos(a) * r, Math.sin(a) * r, 2.6, 0, 6.283); c.fill(); }
      c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, 10, 0, 6.283); c.stroke();
      if (it.aa) { c.beginPath(); c.moveTo(0, -16); c.lineTo(4, -10); c.lineTo(-4, -10); c.closePath(); c.fillStyle = col; c.fill(); }
    } else {
      c.rotate(it.t === 'house' ? it.r || 0 : (it.h || 0) + Math.PI / 2);
      if (img.complete && img.naturalWidth) c.drawImage(img, -z.w / 2, -z.l / 2, z.w, z.l);
      if (it.t === 'house') { c.strokeStyle = it.role === 'hostile' ? '#ff6b5a' : 'rgba(124, 200, 255, 0.8)'; c.lineWidth = 1.5; c.setLineDash(it.role === 'hostile' ? [] : [4, 3]); c.strokeRect(-z.w / 2 - 3, -z.l / 2 - 3, z.w + 6, z.l + 6); c.setLineDash([]); }
      if (it.t === 'veh') { c.strokeStyle = it.side === 'blue' ? '#6fd8f0' : it.civil ? '#e8e8e8' : it.move || it.loop ? '#7cc8ff' : '#ff6b5a'; c.lineWidth = it.side === 'blue' ? 2.5 : 1.5; c.strokeRect(-z.w / 2 - 2, -z.l / 2 - 2, z.w + 4, z.l + 4);
        // driving: an arrow out of the front
        if (it.move || it.loop) { c.fillStyle = '#7cc8ff'; c.beginPath(); c.moveTo(0, -z.l / 2 - 12); c.lineTo(-5, -z.l / 2 - 4); c.lineTo(5, -z.l / 2 - 4); c.fill(); } }
    }
    c.restore();
    if (on) { c.strokeStyle = '#ffd84a'; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, Math.max(z.w, z.l) / 2 + 9, 0, 6.283); c.stroke(); }
  });
}
function edUi() {
  const n = edTargets(), nh = ED.items.filter(it => it.t === 'house' && it.role !== 'hostile').length;
  const nf = ED.items.filter(it => it.side === 'blue').length;
  $('#edCount').textContent = EN ? n + (n === 1 ? ' target · ' : ' targets · ') + nh + (nh === 1 ? ' civilian house' : ' civilian houses') + (nf ? ' · ' + nf + ' friendly' : '') : n + ' هدف · ' + nh + ' بيت مدني' + (nf ? ' · ' + nf + ' صديقة' : '');
  $('#edStart').disabled = n === 0;
  for (const b of document.querySelectorAll('#edPal button')) b.classList.toggle('on', ED.arm === b.dataset.k);
  $('#edHint').textContent = ED.msg || (ED.arm ? Lg('المس الخريطة لوضع: ' + edKind(ED.arm).ar, 'Touch the map to place: ' + edKind(ED.arm).en) : ED.sel >= 0 ? Lg('اسحبه لتحريكه، أو احذفه من اللوحة', 'Drag it to move it, or delete it from the panel') : n || ED.items.length ? Lg('المس أي عنصر لتحريكه أو حذفه', 'Touch anything to move or delete it') : Lg('اختر من الشريط ثم المس الخريطة', 'Pick from the bar, then touch the map'));
  $('#edHint').hidden = !$('#edHint').textContent;
  const box = $('#edSel'), it = ED.items[ED.sel];
  box.hidden = !it; if (!it) return;
  const btn = (txt, fn, on) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'edBtn' + (on ? ' on' : ''); b.textContent = txt; b.onclick = () => { fn(); edSave(); ED.dirty = true; edUi(); }; return b; };
  const row = (...els) => { const r = document.createElement('div'); r.className = 'row'; r.append(...els); return r; };
  box.replaceChildren();
  const name = document.createElement('div'); name.textContent = Lg(edInfo(it).ar, edInfo(it).en); box.append(name);
  // (friendlies and dug-in positions stand where they are put: only turned)
  if (it.t === 'veh' && (it.side === 'blue' || SPR[it.k].emp)) box.append(row(btn(Lg('تدوير ↻', 'Turn ↻'), () => { it.h = (it.h || 0) + Math.PI / 4; })));
  else if (it.sea) {
    // moored, or round a loop ahead of its bow (turned to set which way; a loop the water has no room for: moored), or
    // a mission's own route (from «الافتراضي», until it is set otherwise or moved)
    const route = !!it.path, mode = m => { delete it.path; it.loop = m; };
    box.append(row(btn(Lg('واقف', 'Moored'), () => mode(false), !route && !it.loop),
      btn(Lg('يدور', 'Circling'), () => { mode(true); it.spd = Math.min(it.spd || 6, 10); if (!boatLoop(it.x, it.y, it.h || 0)) { it.loop = false; edMsg(Lg('لا يتسع الماء لدورة هنا', 'No room on the water for a loop here')); } }, !route && it.loop)));
    if (route) box.append(row(btn(Lg('مسار المهمة', 'Mission route'), () => {}, true)));
    else {
      if (it.loop) box.append(row(...ED_BOAT_SPEEDS.map(sp => btn(Lg(sp.ar, sp.en), () => { it.spd = sp.v; }, it.spd === sp.v))));
      box.append(row(btn(Lg('تدوير ↻', 'Turn ↻'), () => { it.h = (it.h || 0) + Math.PI / 4; if (it.loop && !boatLoop(it.x, it.y, it.h)) it.loop = false; })));
    }
    // the rocket boat's salvo: at the nearest of ours, or at a point touched on the map
    if (it.k === 'rktboat') box.append(row(btn(Lg('أقرب قواتنا', 'Nearest of ours'), () => { delete it.aim; ED.aimFor = null; }, !it.aim && ED.aimFor !== it),
      btn(Lg('حدد الهدف', 'Set the target'), () => { ED.aimFor = it; ED.msg = Lg('المس الخريطة لهدف الزورق', 'Touch the map for the boat\'s target'); }, !!it.aim || ED.aimFor === it)));
  }
  else if (it.t === 'veh') {
    box.append(row(btn(Lg('واقفة', 'Parked'), () => { it.move = false; }, !it.move), btn(Lg('متحركة', 'Moving'), () => { it.move = true; it.dir = it.dir || 1; it.spd = it.spd || 9.5; edSnap(it); }, it.move)));
    if (it.move) {
      box.append(row(btn(Lg('جنوبًا ↓', 'South ↓'), () => { it.dir = 1; edSnap(it); }, it.dir > 0), btn(Lg('شمالًا ↑', 'North ↑'), () => { it.dir = -1; edSnap(it); }, it.dir < 0)));
      box.append(row(...ED_SPEEDS.map(sp => btn(Lg(sp.ar, sp.en), () => { it.spd = sp.v; }, it.spd === sp.v))));
    } else box.append(row(btn(Lg('تدوير ↻', 'Turn ↻'), () => { it.h = (it.h || 0) + Math.PI / 4; })));
  } else if (it.t === 'pax') {
    const cnt = document.createElement('span'); cnt.textContent = (it.n || 3) + Lg(' أفراد', ' troops');
    box.append(row(btn('−', () => { it.n = Math.max(1, (it.n || 3) - 1); }), cnt, btn('+', () => { it.n = Math.min(8, (it.n || 3) + 1); })));
  } else {
    // a house is civilian (no-strike) unless marked hostile (a target)
    box.append(row(btn(Lg('مدني', 'Civilian'), () => { it.role = 'civil'; }, it.role !== 'hostile'), btn(Lg('معادٍ', 'Hostile'), () => { it.role = 'hostile'; }, it.role === 'hostile')));
    box.append(row(btn(Lg('تدوير ↻', 'Turn ↻'), () => { it.r = (it.r || 0) + Math.PI / 4; })));
  }
  box.append(row(btn(Lg('حذف', 'Delete'), () => { ED.items.splice(ED.sel, 1); ED.sel = -1; })));
}
// a word under the map, until the next touch
function edMsg(t) { ED.msg = t; $('#edHint').textContent = t; $('#edHint').hidden = false; }
function edResize() {
  edCv.width = Math.round(VW * Math.min(PR, 2)); edCv.height = Math.round(VH * Math.min(PR, 2)); ED.dirty = true;
}
function edLoop() { if (!ED.open) return; if (ED.dirty) edDraw(); requestAnimationFrame(edLoop); }
function openEditor() {
  // the player's own layout if there is one; otherwise an empty valley (the default mission's targets are not carried
  // over; «الافتراضي» brings them in on purpose)
  ED.items = edLoad() || []; ED.sel = -1; ED.arm = null;
  ED.open = true; $('#ovStart').hidden = true; $('#ovEdit').hidden = false;
  edResize(); edFit(); edUi(); edLoop();
}
function closeEditor(start) {
  edSave(); ED.open = false; $('#ovEdit').hidden = true;
  // the editor's map pictures are hundreds of MB decoded on a phone: let them all go before the mission
  for (const x in ED.tiles) ED.tiles[x].src = '';
  ED.tiles = {}; edCv.width = edCv.height = 1;
  if (start) { menuMission = 'custom'; startMission(ED.items.map(it => ({ ...it })), MISSIONS.find(m => m.id === 'custom')); }
  else { setupMission(); $('#ovStart').hidden = false; showScr('home'); }
}
// palette
{
  const pal = $('#edPal');
  for (const k of ED_KINDS) {
    if (!k) { if (pal.lastChild && pal.lastChild.className !== 'sep') { const sp = document.createElement('div'); sp.className = 'sep'; pal.append(sp); } continue; }
    if (k.sea && !MAP.water) continue;
    const b = document.createElement('button'); b.type = 'button'; b.dataset.k = k.id || k.k;
    const im = document.createElement('img'); im.src = k.img; im.alt = ''; const t = document.createElement('span'); t.textContent = Lg(k.ar, k.en);
    b.append(im, t); b.onclick = () => { const id = k.id || k.k; ED.msg = ''; ED.arm = ED.arm === id ? null : id; ED.dirty = true; edUi(); };
    pal.append(b);
  }
}
$('#btnEdit').addEventListener('click', openEditor);
$('#edBack').addEventListener('click', () => closeEditor(false));
$('#edStart').addEventListener('click', () => { try { screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (_) {} closeEditor(true); });
$('#edDefault').addEventListener('click', () => { ED.items = edDefaultItems(); ED.sel = -1; edSave(); ED.dirty = true; edUi(); });
$('#edClear').addEventListener('click', () => { ED.items = []; ED.sel = -1; edSave(); ED.dirty = true; edUi(); });
// map: tap to place or select, drag an item to move it, drag the map to pan, pinch or wheel to zoom
edCv.addEventListener('pointerdown', e => {
  try { edCv.setPointerCapture(e.pointerId); } catch (_) {}
  const q = local(e); ED.ptrs.set(e.pointerId, q); ED.msg = '';
  if (ED.ptrs.size === 2) { const [a, b] = [...ED.ptrs.values()]; ED.g = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) }; return; }
  const hit = edHit(q);
  ED.g = { type: 'tap', q0: q, hit, moved: 0 };
});
edCv.addEventListener('pointermove', e => {
  const p = ED.ptrs.get(e.pointerId); if (!p || !ED.g) return;
  const q = local(e), dx = q.x - p.x, dy = q.y - p.y; p.x = q.x; p.y = q.y;
  if (ED.g.type === 'pinch' && ED.ptrs.size >= 2) {
    const [a, b] = [...ED.ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    edZoom(d / Math.max(20, ED.g.d), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); ED.g.d = d; return;
  }
  ED.g.moved += Math.hypot(dx, dy);
  if (ED.g.moved < 6) return;
  if (ED.g.hit >= 0) {
    const it = ED.items[ED.g.hit], m = edToMap(q), x = clamp(m.x, 6, W0 - 6), y = clamp(m.y, 6, H0 - 6);
    // (a boat only as far as the water goes; its loop dropped where there is no room for it)
    if (!it.sea || onWater(x, y)) { it.x = x; it.y = y; edSnap(it); if (it.path) { delete it.path; it.loop = false; } if (it.loop && !boatLoop(x, y, it.h || 0)) it.loop = false; }
    ED.sel = ED.g.hit;
  } else { ED.ox -= dx / ED.s; ED.oy -= dy / ED.s; }
  ED.dirty = true;
});
function edEnd(e) {
  if (!ED.ptrs.has(e.pointerId)) return;
  const q = local(e); ED.ptrs.delete(e.pointerId);
  const g = ED.g; if (ED.ptrs.size) return; ED.g = null;
  if (!g || g.type !== 'tap') return;
  if (g.moved >= 6) { if (g.hit >= 0) { edSave(); edUi(); } return; }
  // the rocket boat waiting for its target: this touch is it
  if (ED.aimFor && ED.items.includes(ED.aimFor)) { const m = edToMap(q); ED.aimFor.aim = [clamp(m.x, 0, W0), clamp(m.y, 0, H0)]; ED.sel = ED.items.indexOf(ED.aimFor); ED.aimFor = null; edSave(); ED.dirty = true; edUi(); return; }
  ED.aimFor = null;
  // an item under the finger is picked up (and what was chosen in the bar is put down)
  if (g.hit >= 0) { ED.sel = g.hit; ED.arm = null; }
  else if (ED.arm) {
    const k = edKind(ED.arm), m = edToMap(q);
    if (m.x < 6 || m.y < 6 || m.x > W0 - 6 || m.y > H0 - 6) return;
    if (k.t === 'house' ? ED.items.filter(i => i.t === 'house').length >= ED_MAX_HOUSES : k.side === 'blue' ? ED.items.filter(i => i.side === 'blue').length >= 8 : (!k.civil && edTargets() >= ED_MAX_TARGETS)) { edMsg(Lg('وصلت للحد الأقصى', 'That is the most there can be')); return; }
    if (k.sea && !onWater(m.x, m.y)) { edMsg(Lg('القوارب على الماء فقط', 'Boats go on the water only')); return; }
    const it = k.sea ? { t: 'veh', k: k.k, x: m.x, y: m.y, h: -Math.PI / 2, sea: true, loop: false, spd: 6, ...(k.civil ? { civil: true } : {}) } :
      k.t === 'veh' ? { t: 'veh', k: k.k, x: m.x, y: m.y, h: -Math.PI / 2, move: false, dir: 1, spd: 9.5 } : k.t === 'pax' ? { t: 'pax', k: 'pax', x: m.x, y: m.y, n: k.side === 'blue' ? 4 : k.aa ? 2 : 3 } : { t: 'house', k: k.k, x: m.x, y: m.y, r: 0 };
    if (k.side) it.side = k.side; if (k.aa) it.aa = k.aa;
    // placed and selected: drag it, or delete it, straight away; pick from the bar again for another
    ED.items.push(it); ED.sel = ED.items.length - 1; ED.arm = null; edSave();
  } else ED.sel = -1;
  ED.dirty = true; edUi();
}
edCv.addEventListener('pointerup', edEnd);
edCv.addEventListener('pointercancel', edEnd);
edCv.addEventListener('wheel', e => { e.preventDefault(); edZoom(Math.exp(-e.deltaY * 0.0015), local(e)); }, { passive: false });
window.addEventListener('resize', () => { if (ED.open) { edResize(); edUi(); } });

// the world without drawing it, for the tests: the same steps the frame takes
function stepSim(dt) {
  const out = jetOut();
  S.t += dt; if (S.phase === 'play' && !out) S.missionT += dt;
  updatePlane(dt);
  for (let i = timers.length - 1; i >= 0; i--) { timers[i].t -= dt; if (timers[i].t <= 0) { const f = timers[i].fn; timers.splice(i, 1); f(); } }
  if (!out) { for (const v of vehicles) driveVehicle(v, dt); for (const g of groups) updateGroup(g, dt); }
  for (const l of LAYERS) l.update(dt);
  updateProjectiles(dt); updateEmitters(dt); if (!out) updateWar(dt); updateIllum(dt); fcrUpdate(dt); popUpdate();
}
// The pop-up target: it shows (its coordinates come over the radio and the pod is slewed to them), a minute's warning,
// and if it still stands when its time is up it fires: a launch's flash and smoke, and it is gone back into hiding
function popUpdate() {
  if (S.phase !== 'play' || S.home) return;
  for (const v of vehicles) {
    const p = v.pop; if (!p || !v.alive || v.escaped) continue;
    if (v.dormant) {
      if (S.missionT < p.at) continue;
      v.dormant = false; v.body.visible = v.shadow.visible = true; p.end = S.missionT + p.win;
      // the pod slewed to its coordinates and tracking it, zoomed in (unless the officer is tracking something else).
      // (Only a tracked target keeps the picture on it: at the widest view the footprint is held inside the map, which
      // pulled a bare slew to a place near the map's edge back toward the middle)
      if (!S.tracking) { lockOn(v, true); S.zoomGoal = Math.max(S.zoomGoal, 3); syncUI(); }
      radio('POP-UP TARGET, MISSILE LAUNCHER, PRIORITY. ' + Math.round(p.win / 60) + ' MINUTES TO LAUNCH', 'هدف طارئ: منصة صواريخ خرجت للإطلاق، الأولوية لها. أمامك ' + Math.round(p.win / 60) + ' دقائق، والإحداثيات في الحاضنة', 'ops', ['o.tst']);
      syncUI(); continue;
    }
    if (!p.warned && S.missionT > p.end - 60) { p.warned = true; radio('ONE MINUTE TO LAUNCH', 'دقيقة على الإطلاق', 'ops', ['o.tst1']); }
    if (S.missionT >= p.end && !p.fired) {
      p.fired = true;
      smokeL.spawn({ x: v.x, y: v.y, wind: 1, life: 14, s0: 6 * PXM, s1: 40 * PXM, a0: 0.7, a1: 0, c0: [0.86, 0.84, 0.8] });
      glowE.spawn({ x: v.x, y: v.y, life: 0.6, s0: 14 * PXM, s1: 4 * PXM, a0: 1, a1: 0, c0: [1, 0.85, 0.5], rot: 0, ease: 'lin' });
      radio('THE LAUNCHER HAS FIRED', 'المنصة أطلقت', 'ops', ['o.tstfire']);
      timers.push({ t: 8, fn: () => { if (!v.alive || v.escaped) return; v.escaped = true; v.body.visible = v.shadow.visible = false; if (S.sel === v) unlock(); checkEnd(); } });
    }
  }
}
