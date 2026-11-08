/* ===================== air defence: the operator's console ===================== */
// The third mode (ADA, 01-core.js; docs/AIR_DEFENSE.md): the player is the operator of an integrated air and missile
// defence centre guarding the air base, in a shut shelter. Everything is done with the console's own controls, drawn
// in its photograph (sprites/console.webp, tools/make_airdef.py); on the displays only a track's touch (its symbol, its
// row, the target in the camera: adaHookAt, adaCamTap). Its four displays are
// canvases under the photograph's keyed openings, drawn here only when what they show has changed (a revision count
// each, not a key string built every frame). Behind the menu and in a sortie the world is not stepped or drawn in this
// mode (frame(), 13-main.js): only the console, so nothing else runs.
// (this file sits before 08-ui.js and 10-mission.js: the menu counts its missions as it is built, and they are the
// mode's list there)

// the mode's missions (the menu's cards; the sortie itself is adaStart's)
const ADA_AT = MAP.airbase ? [MAP.airbase.rect[0] + MAP.airbase.rect[2] / 2, MAP.airbase.rect[1] + MAP.airbase.rect[3] / 2] : [MAP.w / 2, MAP.h / 2];
const ADA_MISSIONS = [
  { id: 'ada_night', ar: 'ليلة الاعتراض', en: 'NIGHT OF INTERCEPTS', night: true, ada: true, at: ADA_AT,
    desc: 'هجوم ليلي على القاعدة، هدف ورا هدف: إذا أسقطته يجي اللي بعده. مسيّرات وصواريخ كروز وباليستي، وطائرة صديقة بينهم. إذا أصاب هدف القاعدة تفشل المهمة.',
    desc_en: 'A night attack on the base, one target at a time: down one and the next comes. Drones, cruise and ballistic missiles, and a friendly aircraft among them. If a target hits the base, the mission fails.' },
  { id: 'ada_day', ar: 'نهار الاعتراض', en: 'DAY OF INTERCEPTS', night: false, ada: true, at: ADA_AT,
    desc: 'الهجوم نفسه في وضح النهار، هدف ورا هدف: الكاميرا البصرية تشوف الأهداف بألوانها ومن أبعد. إذا أصاب هدف القاعدة تفشل المهمة.',
    desc_en: 'The same attack in broad daylight, one target at a time: the television camera sees the targets in colour and from farther. If a target hits the base, the mission fails.' },
];

// the photograph, its pixels: the four displays (the keyed openings, tools/make_airdef.py), the box the screen is fitted
// to (the console itself, the walls beside it shown where the screen is wider), and each display's lean-in box
const ADC_IW = 1846, ADC_IH = 852, ADC_CORE = [340, 84, 1500, 800];
const ADC_SCR = { A: [417, 96, 499, 315], B: [930, 96, 498, 315], C: [594, 430, 322, 195], D: [930, 430, 321, 195] };
const ADC_ZOOM = { A: [352, 90, 922, 418], B: [924, 90, 1494, 418], C: [430, 424, 922, 632], D: [924, 424, 1416, 632] };
// the controls, photo px: the bezel keys beside the two large displays, the two grids beside the small ones, the desk
const ADC_LK = [150, 205, 262, 320, 378], ADC_RK = ADC_LK;
const ADC_LG = [[468, 465], [537, 465], [468, 521], [537, 521], [468, 577], [537, 577]];
const ADC_RG = [[1309, 465], [1378, 465], [1309, 521], [1378, 521], [1309, 577], [1378, 577]];
// the knobs' caps (their printed pointers taken off in the tool; drawn here): centre, the top's radii, and the ticks the
// positions sit on, as angles in the cap's own plane (0 east, counter-clockwise up), measured on the panel's marks
// (the marks' angles from their places round the cap, the panel's foreshortening, 23/14, taken out)
const ADC_KNOB = [{ x: 597, y: 713, rx: 23, ry: 14 }, { x: 712, y: 713, rx: 23, ry: 14 }];
const ADC_TICK = [174, 116, 70, 37];   // (four of the nine marks round each, from the left over the top)
// the panel overlay's box (the grids' lower rows and the desk: its legends and the knobs' pointers, adcPanelArt)
const ADC_OV = [430, 470, 1020, 310];

// the console's state (reset at each sortie)
const AD = {
  on: false, paused: false, k: 1, k0: 1, ox: 0, oy: 0, zoom: null, zt: 0, tapAt: 0, tapS: '',
  rev: { A: 1, B: 1, C: 1, D: 1, K: 1 }, drawn: { A: 0, B: 0, C: 0, D: 0, K: 0 },
  page: 'lnch', cam: 'tv', pol: 'wh', fov: 'n', rng: 50, az: 95, mode: 0, sys: 3, doc: 1, armed: false, hold: false, cram: true, day: false,
  cur: { b: 0, r: 50 }, msg: null, msgQ: [], simMax: 0, tabFirst: 0, tabRows: 6, outOn: false, endAt: 0, endT: 0, camKill: { t: -1e9, lbl: '', cls: '', kc: '', imp: false, x: 0, y: 0, z: 0, f: 0.01, how: '', seed: 0, k: -1, rot: 0, flip: false, fx: 1, dx: 1, dy: 0, vs: 0 }, camAt: 0, camTap: 0, hint: '', msgAt: 0, msgHold: 1.6, t: 0, hook: null, cue: '', cueN: 0, inFrame: false,
  lnch: [],
};
const ADA_RNG = [10, 25, 50, 100, 200], ADA_MODE = ['SURV', 'TBM'], ADA_SYS = ['UPR', 'LWR', 'CRAM', 'AUTO'], ADA_DOC = ['S', 'SS', 'SLS'];
// the battery's launchers: two of the upper tier (8 each), four of the lower (the blast-fragmentation round 4 a
// launcher, the hit-to-kill 12), and the close-in gun's magazine (1,550 rounds)
const ADA_LNCH = [['U1', 'UPR', 8], ['U2', 'UPR', 8], ['P1', 'FRG', 4], ['P2', 'HTK', 12], ['P3', 'HTK', 12], ['P4', 'FRG', 4]];
const ADA_CRAM_RDS = 1550;

const adcEl = $('#adc'), adcFrame = $('#adcFrame'), adcPress = $('#adcPress'), adcOver = $('#adcOver'), adcCue = $('#adcCue');
const ADC_CV = { A: $('#adcA'), B: $('#adcB'), C: $('#adcC'), D: $('#adcD') };
// (a display with something new wakes the console's loop at once: it otherwise waits a quarter second, adaTick)
// (inside the tick's own drawing pass it only counts: that pass draws it, no second frame asked for)
const adcDirty = s => { AD.rev[s]++; if (!AD.inFrame) adaWake(); };
// the displays and the overlay placed in the photograph's pixels once; the aircraft's cockpit and controls not shown at all
for (const s of 'ABCD') { const r = ADC_SCR[s], st = ADC_CV[s].style; st.left = r[0] + 'px'; st.top = r[1] + 'px'; st.width = r[2] + 'px'; st.height = r[3] + 'px'; }
{ const st = adcOver.style; st.left = ADC_OV[0] + 'px'; st.top = ADC_OV[1] + 'px'; st.width = ADC_OV[2] + 'px'; st.height = ADC_OV[3] + 'px'; }
if (ADA) app.classList.add('ada');

/* ---- layout: the console fitted to the screen (its core whole), or leaning in on one display ---- */
function adaLayout() {
  const [x0, y0, x1, y1] = AD.zoom ? ADC_ZOOM[AD.zoom] : ADC_CORE, bw = x1 - x0, bh = y1 - y0;
  const k = Math.min(VW / bw, VH / bh);
  AD.k = k; AD.ox = VW / 2 - (x0 + bw / 2) * k; AD.oy = VH / 2 - (y0 + bh / 2) * k;
  AD.k0 = Math.min(VW / (ADC_CORE[2] - ADC_CORE[0]), VH / (ADC_CORE[3] - ADC_CORE[1]));
  adcFrame.style.transform = `translate(${AD.ox.toFixed(2)}px,${AD.oy.toFixed(2)}px) scale(${k.toFixed(5)})`;
  // (leaning in: the display in view made sharp at once; sitting back: the bigger canvases kept till the glide is
  // over, then made small again)
  if (AD.on && (AD.zoom || !AD.zt)) adaSize();   // (none held before a sortie, behind the menu)
  if (AD.outOn) adoKick();   // (the outside view sized again at once)
}
// The canvases at their size on the screen, each capped for older phones: the display leant in on (and the panel
// overlay, when the lower displays are) at the lean's scale, the others at the seat's; a size change draws it again
function adaSize() {
  const kz = AD.k, k0 = AD.k0, sz = (el, w0, h0, k, cap, s) => {
    const w = Math.min(cap, Math.max(64, Math.round(w0 * k * PR))), h = Math.round(w * h0 / w0);
    if (el.width !== w || el.height !== h) { el.width = w; el.height = h; adcDirty(s); }
  };
  for (const s of 'ABCD') { const r = ADC_SCR[s]; sz(ADC_CV[s], r[2], r[3], AD.zoom === s ? kz : k0, HIQ ? 1800 : 1200, s); }
  sz(adcOver, ADC_OV[2], ADC_OV[3], AD.zoom === 'C' || AD.zoom === 'D' ? kz : k0, HIQ ? 2400 : 1700, 'K');
}
// the canvases let go behind the menu (made again at the next sortie)
function adaFree() { for (const el of [...Object.values(ADC_CV), adcOver]) { el.width = el.height = 0; } }
function adaZoom(s) {
  // (the glide's timer set first: leaning out, adaLayout then leaves the big canvas till the glide is over)
  AD.zoom = s; adcFrame.classList.add('glide'); clearTimeout(AD.zt);
  AD.zt = setTimeout(() => { AD.zt = 0; adcFrame.classList.remove('glide'); if (!AD.zoom) adaSize(); }, 380);
  adaLayout();
}

/* ---- the displays: one look for all four ---- */
const ADC_G = '#5df08a', ADC_W = '#e9f2ea', ADC_Y = '#f2d75c', ADC_R = '#ff5a4a', ADC_O = '#ff9a3c', ADC_B = '#5aa8ff', ADC_DIM = '#4f9a6a', ADC_LINE = 'rgba(93,240,138,0.28)', ADC_MUTE = '#a9bcb0';
const ADC_FS = { head: 17, body: 16, small: 13, ar: 16 }, ADC_PAD = 14;
let adcC = null;
function adT(s, x, y, col, px, al, ar, wt) {
  // (the monospace's heaviest weight 600: a 700 asked of it is made up by the browser, soft and slower)
  const c = adcC; c.font = (ar ? wt || 600 : 600) + ' ' + px + 'px ' + (ar ? FONT_AR : FONT_MONO); c.fillStyle = col;
  c.textAlign = al || 'left'; c.direction = ar ? 'rtl' : 'ltr'; c.fillText(s, x, y);
}
function adRule(y, x0, x1) { const c = adcC; c.strokeStyle = ADC_LINE; c.lineWidth = 1; c.beginPath(); c.moveTo(x0, y + 0.5); c.lineTo(x1, y + 0.5); c.stroke(); }
// a display begun: its canvas cleared and its drawing put in the photo's pixels (its own box's), the screen's black
function adcBegin(s) {
  const el = ADC_CV[s], r = ADC_SCR[s], c = adcC = el.getContext('2d'), k = el.width / r[2];
  c.setTransform(k, 0, 0, k, 0, 0); c.fillStyle = '#04080b'; c.fillRect(0, 0, r[2], r[3]); c.textBaseline = 'middle'; c.lineJoin = 'round';
  return r;
}
// every display's header: its name left, its state right, a rule under them
function adcHead(w, title, state, col) { adT(title, ADC_PAD, 20, ADC_G, ADC_FS.head, 'left', false, 700); if (state) adT(state, w - ADC_PAD, 20, col || ADC_W, ADC_FS.body, 'right'); adRule(36, 0, w); }
const adPad = (n, k) => String(n).padStart(k, '0');

// A: the air picture: the radar's sector heading up from the base, its range rings, the low target's horizon, the
// cursor, and the message window under it (the voice's English line, and its Arabic under it, small)
const ADC_HINT = { src: 'CAM', en: '', ar: '' };
function adcAir() {
  const [, , w, h] = adcBegin('A'), c = adcC, R = AD.rng;
  adcHead(w, 'AIR PICTURE', 'AZ ' + adPad(AD.az, 3) + '   RNG ' + R + ' KM   ' + ADA_MODE[AD.mode]);
  const MSG = 62, cx = w / 2, cy = h - MSG - 12, R0 = cy - 48, half = 60, rad = d => (d - 90) * Math.PI / 180;
  const at = (b, r) => { const a = rad(b); return [cx + Math.cos(a) * r / R * R0, cy + Math.sin(a) * r / R * R0]; };
  c.strokeStyle = ADC_LINE; c.lineWidth = 1;
  // (five rings: a whole number of km at every range, 2 to 40)
  for (let i = 1; i <= 5; i++) { c.beginPath(); c.arc(cx, cy, R0 * i / 5, rad(-half), rad(half)); c.stroke(); }
  for (const d of [-60, -30, 0, 30, 60]) { const [ex, ey] = at(d, R); c.beginPath(); c.moveTo(cx, cy); c.lineTo(ex, ey); c.stroke(); }
  for (let i = 1; i <= 4; i++) { const [tx, ty] = at(half, R * i / 5); adT(String(R * i / 5), tx + 5, ty + 9, ADC_DIM, ADC_FS.small); }
  // the sector's edges, true bearings
  { const [lx, ly] = at(-half, R), [rx, ry] = at(half, R); adT(adPad((AD.az + 300) % 360, 3), lx - 4, ly - 12, ADC_DIM, ADC_FS.small, 'right'); adT(adPad((AD.az + 60) % 360, 3), rx + 4, ry - 12, ADC_DIM, ADC_FS.small, 'left'); }
  // the radar horizon for a target at 50 m (the radar's mast 5 m up, 4/3 earth): 4.12 (√5 + √50) km
  const hz = 4.12 * (Math.sqrt(5) + Math.sqrt(50));
  if (hz < R) { c.setLineDash([5, 6]); c.strokeStyle = 'rgba(242,215,92,0.5)'; c.beginPath(); c.arc(cx, cy, R0 * hz / R, rad(-half), rad(half)); c.stroke(); c.setLineDash([]);
    // (its name on the ring, a third of the way in from the left edge: clear of the bezel keys' legends)
    const [hx, hy] = at(-40, hz); adT('HZN 50 M', hx, hy - 10, 'rgba(242,215,92,0.8)', ADC_FS.small, 'center'); }
  // the defended base
  c.strokeStyle = '#6fd8f0'; c.lineWidth = 1.5; c.strokeRect(cx - 6, cy - 9, 12, 9);
  // the tracks (MIL-STD-2525 air frames, open below: hostile a red chevron, suspect the same in amber, unknown the
  // quatrefoil's top in yellow, friend a blue dome), each with its course line (60 s of its course, up to 60 px: a
  // ballistic one's long, a drone's short) and number (Link 16's, octal); a coasting one dimmed; one beyond the range at
  // the edge with its range; one behind the sector (the upper tier's and the gun's radars see round it) along the
  // picture's foot, where the operator's eye meets it; the hooked one boxed and drawn first (its label never left out:
  // the others' that would lie over a label already drawn are)
  c.save(); c.beginPath(); c.rect(0, 40, w, h - MSG - 40); c.clip();
  // (where each is first; then tracks heaped on one another (as drones closing on the base): two set side by side, each
  // with a thin line to where it truly is; three or more drawn as one group, a ring round its one symbol and its number
  // ×n (each is in the table; a touch on the group hooks them one after another, the hooked one its symbol). Then drawn,
  // the hooked one first)
  ADC_LAB.length = 0; ADC_PT.length = 0; ADC_PXY.length = 0; ADC_TXY.length = 0;
  if (AD.hook) adcAdd(AD.hook, at, cy, R);
  for (const tr of ADS.tr) if (tr !== AD.hook) adcAdd(tr, at, cy, R);
  const U = ADC_USED, Hp = ADC_HEAP, N = ADC_PT.length, HD = ADC_HIDE, CN = ADC_CNT; U.length = HD.length = CN.length = N; U.fill(false); HD.fill(false); CN.fill(0);
  for (let i = 0; i < N; i++) {
    if (U[i]) continue; Hp.length = 0; const xi = ADC_TXY[2 * i], yi = ADC_TXY[2 * i + 1];
    for (let j = i; j < N; j++) if (!U[j] && Math.abs(ADC_TXY[2 * j] - xi) < 14 && Math.abs(ADC_TXY[2 * j + 1] - yi) < 14) { U[j] = true; Hp.push(j); }
    if (Hp.length < 2) continue;
    Hp.sort(adcHeapTn); let mx = 0, my = 0; for (const j of Hp) { mx += ADC_TXY[2 * j]; my += ADC_TXY[2 * j + 1]; } mx /= Hp.length; my /= Hp.length;
    if (Hp.length === 2) { for (let k = 0; k < 2; k++) { const j = Hp[k]; ADC_PXY[2 * j] = mx + (k ? 11 : -11); ADC_PXY[2 * j + 1] = Math.min(cy - 2, my); HD[j] = !k && 'L'; } continue; }
    // (its symbol the hooked one's, else the most threatening's: hostile before suspect, unknown, friend)
    let lead = Hp[0]; for (const j of Hp) if (ADS_RANK[ADC_PT[j].id] < ADS_RANK[ADC_PT[lead].id]) lead = j; for (const j of Hp) if (ADC_PT[j] === AD.hook) lead = j;
    for (const j of Hp) { ADC_PXY[2 * j] = mx; ADC_PXY[2 * j + 1] = Math.min(cy - 2, my); ADC_TXY[2 * j] = mx; ADC_TXY[2 * j + 1] = ADC_PXY[2 * j + 1]; HD[j] = j !== lead; }
    CN[lead] = Hp.length;
  }
  c.lineWidth = 1;
  for (let i = 0; i < N; i++) { const X = ADC_PXY[2 * i], Y = ADC_PXY[2 * i + 1], tx = ADC_TXY[2 * i], ty = ADC_TXY[2 * i + 1]; if (Math.abs(X - tx) + Math.abs(Y - ty) < 2) continue;
    c.strokeStyle = c.fillStyle = adcIdCol(ADC_PT[i].id); c.globalAlpha = 0.55; c.beginPath(); c.moveTo(tx, ty); c.lineTo(X, Y); c.stroke(); c.fillRect(tx - 1.5, ty - 1.5, 3, 3); c.globalAlpha = 1; }
  for (let i = 0; i < N; i++) {
    if (HD[i] === true) continue; const X = ADC_PXY[2 * i], Y = ADC_PXY[2 * i + 1];
    adcTrack(ADC_PT[i], at, cx, cy, R, R0, X, Y, HD[i] === 'L');   // (a pair's left one labelled on its left)
    if (CN[i]) { const col = adcIdCol(ADC_PT[i].id); c.strokeStyle = col; c.lineWidth = 1.2; c.beginPath(); c.arc(X, Y - 3, 15, 0, 6.283); c.stroke(); adT('×' + CN[i], X - 18, Y + 12, ADC_W, ADC_FS.body, 'right'); }
  }
  // the interceptors in the air: a white dot each on its ground track, a short line along its course (inside the range)
  c.strokeStyle = c.fillStyle = ADC_W; c.lineWidth = 1.5;
  for (const m of ADW_MS) {
    if (!m.on) continue; const r = Math.hypot(m.x, m.y) / 1000; if (r > R) continue;
    const [X, Y] = at(adOff(adBrg(m.x, m.y), AD.az), r), a = AD.az * D2R, ex = m.vx * Math.cos(a) - m.vy * Math.sin(a), ny = m.vx * Math.sin(a) + m.vy * Math.cos(a), v = Math.hypot(ex, ny);
    c.beginPath(); c.arc(X, Y, 2.5, 0, Math.PI * 2); c.fill();
    if (v > 1) { c.beginPath(); c.moveTo(X, Y); c.lineTo(X - ex / v * 9, Y + ny / v * 9); c.stroke(); }
  }
  // the results of the last eight seconds: a white cross where each was killed, a red one on the base for each that
  // got through, its track number by it (behind the sector, along the foot as a track is)
  for (const q of ADW_KX) {
    if (ADS.t - q.t > ADW_RES_T) continue; const r = Math.min(Math.hypot(q.x, q.y) / 1000, R * 0.985), dq = adOff(adBrg(q.x, q.y), AD.az);
    let [X, Y] = at(Math.max(-60, Math.min(60, dq)), r); if (Y > cy - 2) Y = cy - 2;
    const col = q.imp ? ADC_R : ADC_W; c.strokeStyle = col; c.lineWidth = 2;
    c.beginPath(); c.moveTo(X - 6, Y - 6); c.lineTo(X + 6, Y + 6); c.moveTo(X + 6, Y - 6); c.lineTo(X - 6, Y + 6); c.stroke();
    adT(q.lbl, X + 10, Y + (Y - 12 < 50 ? 14 : -12), col, ADC_FS.small);
  }
  c.restore();
  // the cursor (the desk's hat moves it)
  { const [ux, uy] = at(AD.cur.b, Math.min(AD.cur.r, R)); c.strokeStyle = ADC_W; c.lineWidth = 1.5; c.beginPath();
    c.moveTo(ux - 11, uy); c.lineTo(ux - 4, uy); c.moveTo(ux + 4, uy); c.lineTo(ux + 11, uy); c.moveTo(ux, uy - 11); c.lineTo(ux, uy - 4); c.moveTo(ux, uy + 4); c.lineTo(ux, uy + 11); c.stroke(); }
  // the bezel keys' legends, each level with its key (the left column)
  ['RNG +', 'RNG -', 'AZ <', 'AZ >', 'MODE'].forEach((s, i) => adT(s, 8, ADC_LK[i] - ADC_SCR.A[1], ADC_W, ADC_FS.body));
  // the message window (its left kept clear for the fifth key's legend)
  adRule(h - MSG, 0, w); c.fillStyle = 'rgba(93,240,138,0.06)'; c.fillRect(0, h - MSG + 1, w, MSG);
  // (no fresh message, a few seconds on: the camera's hint in its place, what the hooked track needs, in Arabic)
  const m = AD.hint && (!AD.msg || (AD.t - AD.msgAt > 5 && !AD.msgQ.length)) ? ADC_HINT : AD.msg;
  if (m === ADC_HINT) { m.en = AD.hook && AD.hook.th.alive ? ADC_ST[0] : ''; m.ar = AD.hint; }
  if (m) {
    adT(m.src, 78, h - MSG + 17, m.src === 'SYS' ? ADC_Y : m.src === 'CAP' ? ADC_B : m.src === 'CMD' ? ADC_G : ADC_W, ADC_FS.small, 'left', false, 700);
    // (fitted to the window's width: a long line set smaller, to the edge, never past it)
    { c.font = '600 ' + ADC_FS.body + 'px ' + FONT_MONO; const room = w - ADC_PAD - 122, tw = c.measureText(m.en).width;
      adT(m.en, 122, h - MSG + 17, ADC_W, tw > room ? ADC_FS.body * room / tw : ADC_FS.body); }
    adT(m.ar, w - ADC_PAD, h - 17, ADC_MUTE, ADC_FS.ar, 'right', true, 700);
  }
}
const ADC_LAB = [];   // (the air picture's labels placed so far: x, y, width; kept, not made each drawing)
const ADC_PT = [], ADC_PXY = [], ADC_TXY = [], ADC_NEAR = [], ADC_ROWS = [], ADC_USED = [], ADC_HEAP = [], ADC_HIDE = [], ADC_CNT = [], adcByTn = (a, b) => a.tn - b.tn, adcHeapTn = (a, b) => ADC_PT[a].tn - ADC_PT[b].tn;   // (and the table's rows as drawn, for a touch on one)   // (where each track was drawn, for a touch on it: kept, not made each drawing)
const adcFree = (x, y, wl) => { const L = ADC_LAB; for (let i = 0; i < L.length; i += 3) if (Math.abs(L[i] - x) < (L[i + 2] + wl) / 2 + 2 && Math.abs(L[i + 1] - y) < 13) return false; L.push(x, y, wl); return true; };
const adcIdCol = id => id === 'HOS' ? ADC_R : id === 'SUS' ? ADC_O : id === 'FRD' ? ADC_B : ADC_Y;
// where a track is on the picture: one outside the sector on its edge on that side, at its own range (its true bearing
// in its label: not on the sector's foot, where it had read as near and in front); one beyond the range at the rim
function adcAdd(tr, at, cy, R) {
  const r = Math.hypot(tr.x, tr.y) / 1000, d0 = adOff(adBrg(tr.x, tr.y), AD.az), d = Math.abs(d0) > 60 ? Math.sign(d0) * 60 : d0;
  const p = at(d, Math.min(r, R * 0.985)), Y = Math.min(p[1], cy - 2);
  ADC_PT.push(tr); ADC_TXY.push(p[0], Y); ADC_PXY.push(p[0], Y);
}
function adcTrack(tr, at, cx, cy, R, R0, X, Y, labL) {
  const c = adcC, r = Math.hypot(tr.x, tr.y) / 1000, off = r > R, d0 = adOff(adBrg(tr.x, tr.y), AD.az), side = Math.abs(d0) > 60, col = adcIdCol(tr.id);
  // (the course in the display's frame: east and north turned by the sector's azimuth)
  const a = AD.az * D2R, ex = tr.vx * Math.cos(a) - tr.vy * Math.sin(a), ny = tr.vx * Math.sin(a) + tr.vy * Math.cos(a), v = Math.hypot(ex, ny) || 1;
  const L = off ? 10 : Math.min(60, Math.max(6, v * 60 / 1000 / R * R0));   // (one beyond the range: a short stub, not a line into the sector)
  c.globalAlpha = tr.cst ? 0.45 : 1;
  c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.moveTo(X, Y - 3); c.lineTo(X + ex / v * L, Y - 3 - ny / v * L); c.stroke();
  adcSym(X, Y, tr.id, col);
  const lt = side ? tr.lbl + ' ' + adPad(Math.round(adBrg(tr.x, tr.y)) % 360, 3) + '°' + (off ? ' ' + Math.round(r) + 'KM' : '') : off ? tr.lbl + ' ' + Math.round(r) + 'KM' : tr.lbl, lw = lt.length * ADC_FS.small * 0.6, ly = Y - 12 < 50 ? Y + 14 : Y - 12;   // (under the symbol at the top edge)
  // (near the display's right edge, the label to the symbol's left: kept on the screen)
  const lx = (labL && X - 12 - lw > 6) || X + 12 + lw > ADC_SCR.A[2] - 6 ? X - 12 - lw : X + 12;
  if (adcFree(lx + lw / 2, ly, lw) || tr === AD.hook) adT(lt, lx, ly, col, ADC_FS.small);
  // (the priority mark on the side the label is not)
  if (tr.pri) { const lft = lx < X; adT('P', lft ? X + 14 : X - 14, Y - 12, ADC_Y, ADC_FS.small, lft ? 'left' : 'right'); }
  c.globalAlpha = 1;
  if (AD.hook === tr) { c.strokeStyle = ADC_W; c.lineWidth = 1.5; c.strokeRect(X - 15, Y - 18, 30, 26); }
}
// a track's symbol: MIL-STD-2525 air frames, open below
function adcSym(X, Y, id, col) {
  const c = adcC, s = 9; c.strokeStyle = col; c.lineWidth = 2; c.beginPath();
  if (id === 'HOS' || id === 'SUS') { c.moveTo(X - s, Y); c.lineTo(X, Y - s); c.lineTo(X + s, Y); }
  else if (id === 'FRD') c.arc(X, Y, s * 0.85, Math.PI, 0);
  else { const q = s / 3;   // (the quatrefoil's upper half: three lobes, open below)
    c.moveTo(X - s, Y); c.arc(X - 2 * q, Y - q * 0.4, q, Math.PI, Math.PI * 1.75); c.arc(X, Y - q * 1.6, q, Math.PI * 1.15, Math.PI * 1.85); c.arc(X + 2 * q, Y - q * 0.4, q, Math.PI * 1.25, 0); }
  c.stroke();
}
const ADC_CORN = [-1, -1, 1, -1, 1, 1, -1, 1];
// The tracking camera's pictures of the threats (sprites/ada_sky.webp, tools/make_airdef.py sky; from the owner's sky
// sheet): eight in a row of 256 px cells (the drone from above, the side, diving, the front; the cruise missile from
// above and the side; the reentry vehicle; the interceptor), the rows the night television, thermal white hot, black hot, the day television in colour. Each
// one's length (m) along its picture's longest side, and its picture's size in its cell (px)
const ADC_SKY = ADA ? new Image() : null;
const ADC_FRAG = [0.9, 1.4, 0.6, 1.8, 1.1, 0.7, 1.6, 1.2, 0.5, 1.9, 1.0, 1.3, 0.8, 1.5];   // (the kill's fragments' speeds, their own)
const ADC_SKYL = [3.5, 3.5, 3.5, 2.5, 6, 6, 2.5, 5], ADC_SKYS = [[206, 240], [240, 77], [240, 226], [240, 87], [146, 240], [240, 49], [175, 240], [240, 45]];
// its reach at night on targets this small (m): the thermal's, the day television's (in the dark, little)
// its reach at night by what it looks at (m): the thermal's (a drone's small engine, a cruise missile's hot turbojet,
// the reentry vehicle glowing, an aircraft), the television's (in the dark only what glows, or close)
// (the television a low-light one, as such trackers carry: at night a drone a dark shape to some 3 km)
// (the television a low-light one, its narrow field 0.1°: at night a drone's dark shape on the sky's glow to some 6 km,
// an aircraft's lights to 20; by day each in its colours, farther)
const ADC_CAMR = { ir: { UAV: 12e3, CM: 18e3, TBM: 45e3, ACFT: 30e3, CAP: 30e3 }, tv: { UAV: 6e3, CM: 8e3, TBM: 45e3, ACFT: 20e3, CAP: 20e3 },
  tvd: { UAV: 10e3, CM: 14e3, TBM: 45e3, ACFT: 35e3, CAP: 35e3 } };
// (what it is, from the thing itself: the camera sees the object, not the track's class, which comes a few looks later)
const ADC_KC = { uav: 'UAV', cm: 'CM', tbm: 'TBM' }, adcKind = o => ADC_KC[o.k] || 'ACFT';
const adcReach = kc => ADC_CAMR[AD.cam === 'ir' ? 'ir' : AD.day ? 'tvd' : 'tv'][kc];
// the camera's ground: the skyline's haze, then the ground from the hills down, darkening, for white hot, black hot,
// the television (each: haze, and four bands); the far hills' line (px above the horizon, across the picture)
const ADC_GND = [['#4a4d50', '#3d3f41', '#38393b', '#333435', '#2e2f30'], ['#b8bbbd', '#a6a9ab', '#acafb1', '#b3b5b7', '#b9bbbd'], ['#6a737b', '#262b2f', '#202427', '#1b1e21', '#16191b'],
  ['#d6dde2', '#9c8c72', '#a39276', '#ab9a7c', '#b3a282']];   // (and by day: the haze pale, the desert's tans, lighter toward the foot)
const ADC_RIDGE = [3, 5, 4, 8, 11, 9, 6, 7, 12, 15, 13, 9, 7, 5, 6, 9, 8, 5, 3, 4, 6, 5, 3, 2, 4];
// the field of view (rad): wide; narrow is the tracker's own zoom (adcFov)   (D2R is 07c's, not yet made here)
const ADC_FOV = { w: 20 * Math.PI / 180 };
// The narrow field zoomed by the tracker itself, as such cameras do: the target made some quarter of the picture's
// width, between the electronic zoom's end (0.1°) and 4°. At a new hook it opens at 4° and closes in over a second and
// a half as the tracker takes the target: the first second the turret slewing (the target sliding in to the middle,
// no gate), then the gate on it (the lock). Three seconds after the hook (two locked) within the camera's reach, the operator's
// visual identification (adcVid). Each kind's length (m) for the zoom
const ADC_ZMIN = 0.1 * Math.PI / 180, ADC_ZMAX = 4 * Math.PI / 180, ADC_SLEW = 1, ADC_ZIN = 1.5, ADC_VID = 3;
const ADC_LEN = { UAV: 3.5, CM: 6, TBM: 2.5, ACFT: 30 };
function adcFov(X, Y, Z, kc) {
  if (AD.fov === 'w') return ADC_FOV.w;
  const tg = Math.min(ADC_ZMAX, Math.max(ADC_ZMIN, ADC_LEN[kc] * 4 / (Math.hypot(X, Y, Z) || 1)));
  const f = Math.min(1, Math.max(0, (ADS.t - AD.camAt) / ADC_ZIN)), e = f * f * (3 - 2 * f);
  return Math.exp(Math.log(ADC_ZMAX) + (Math.log(tg) - Math.log(ADC_ZMAX)) * e);
}
// (the slew: where the target is off the middle as the turret comes onto it, from a side of its own, easing in)
const ADC_OFS = { x: 0, y: 0 };
function adcSlew(tr, w, h) {
  const f = Math.min(1, Math.max(0, (ADS.t - AD.camAt) / ADC_SLEW)), k = (1 - f) * (1 - f);
  ADC_OFS.x = k * w * (tr.tn & 1 ? 0.36 : -0.36); ADC_OFS.y = k * h * 0.22 * ((tr.tn % 3) - 1); return f >= 1;
}
// the sensor's fixed-pattern grain (a small tile) and a soft round glow (the kill's flash, the reentry vehicle's
// bloom), made once at the first sortie's start; the grain's pattern and the pictures put on B's canvas there too
// (nothing built or first uploaded mid-sortie)
let adcGrain = null, adcGrainPat = null, adcGlow = null, adcGlowW = null, adcGlowK = null, adcFire = null, adcPuffD = null, adcPuffL = null, adcPuffM = null, adcCore = null, adcCoreK = null, adcFireC = null;
function adcGrainMake() {
  if (!adcGrain) {
    const n = adcGrain = document.createElement('canvas'); n.width = n.height = 96;
    const g = n.getContext('2d'), d = g.createImageData(96, 96);
    for (let i = 0; i < d.data.length; i += 4) { const v = Math.random() * 255; d.data[i] = d.data[i + 1] = d.data[i + 2] = v; d.data[i + 3] = 26; }
    g.putImageData(d, 0, 0);
    const q = adcGlow = document.createElement('canvas'); q.width = q.height = 64; const gq = q.getContext('2d'), gr = gq.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); gq.fillStyle = gr; gq.fillRect(0, 0, 64, 64);
    // (the same glow black, for black hot)
    const kq = adcGlowK = document.createElement('canvas'); kq.width = kq.height = 64; const gk = kq.getContext('2d'), grk = gk.createRadialGradient(32, 32, 0, 32, 32, 32);
    grk.addColorStop(0, 'rgba(0,0,0,1)'); grk.addColorStop(0.25, 'rgba(0,0,0,0.8)'); grk.addColorStop(1, 'rgba(0,0,0,0)'); gk.fillStyle = grk; gk.fillRect(0, 0, 64, 64);
    // (and a motor's flame: a hot yellow-white heart in an orange glow, longer than wide)
    const p = adcGlowW = document.createElement('canvas'); p.width = 64; p.height = 96; const gp = p.getContext('2d'), gw = gp.createRadialGradient(32, 40, 0, 32, 48, 34);
    gw.addColorStop(0, 'rgba(255,248,220,1)'); gw.addColorStop(0.18, 'rgba(255,214,140,0.95)'); gw.addColorStop(0.5, 'rgba(255,140,50,0.45)'); gw.addColorStop(1, 'rgba(255,90,20,0)');
    gp.fillStyle = gw; gp.fillRect(0, 0, 64, 96);
    // (a fireball's glow: a white-yellow heart, orange, a dull red edge; and a smoke puff, dark and light)
    const fq = adcFire = document.createElement('canvas'); fq.width = fq.height = 64; const gf = fq.getContext('2d'), gff = gf.createRadialGradient(32, 32, 0, 32, 32, 32);
    gff.addColorStop(0, 'rgba(255,250,225,1)'); gff.addColorStop(0.22, 'rgba(255,210,110,0.95)'); gff.addColorStop(0.55, 'rgba(240,110,30,0.6)'); gff.addColorStop(1, 'rgba(120,30,10,0)'); gf.fillStyle = gff; gf.fillRect(0, 0, 64, 64);
    const puff = (col) => { const q = document.createElement('canvas'); q.width = q.height = 64; const g = q.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, col + '0.85)'); gr.addColorStop(0.6, col + '0.45)'); gr.addColorStop(1, col + '0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return q; };
    adcPuffD = puff('rgba(38,40,43,'); adcPuffL = puff('rgba(200,200,198,'); adcPuffM = puff('rgba(92,94,97,');
    // (the fireball's hard heart, as a camera clips it: white to some 0.45 of its radius, gone by 0.75; black for black
    // hot; and the day's, its flame's colours)
    const core = (st) => { const q = document.createElement('canvas'); q.width = q.height = 64; const g = q.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      for (const [o, cl] of st) gr.addColorStop(o, cl); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return q; };
    adcCore = core([[0, 'rgba(255,255,250,1)'], [0.45, 'rgba(250,250,240,1)'], [0.75, 'rgba(240,240,232,0)'], [1, 'rgba(240,240,232,0)']]);
    adcCoreK = core([[0, 'rgba(0,0,0,1)'], [0.45, 'rgba(0,0,0,1)'], [0.75, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,0)']]);
    adcFireC = core([[0, 'rgba(255,250,228,1)'], [0.35, 'rgba(255,214,120,1)'], [0.6, 'rgba(240,120,30,0.75)'], [0.8, 'rgba(150,40,10,0)'], [1, 'rgba(150,40,10,0)']]);
  }
  const c = ADC_CV.B.getContext('2d'); if (!adcGrainPat) adcGrainPat = c.createPattern(adcGrain, 'repeat');
  // (the pictures drawn once, small, onto B as it is sized: their first upload and their scaled-down copies made at the
  // start, not at the first hook; then cleared)
  if (ADC_SKY.complete && ADC_SKY.naturalWidth && ADC_CV.B.width) { c.setTransform(1, 0, 0, 1, 0, 0); for (let i = 0; i < 4; i++) c.drawImage(ADC_SKY, 0, i * 256, 2048, 256, 0, 0, 2048 * 0.04 * (i + 1), 256 * 0.04 * (i + 1)); c.drawImage(adcGlow, 0, 0, 8, 8);
    for (const i of Object.values(ADO_IMG)) if (i.naturalWidth) c.drawImage(i, 0, 0, i.naturalWidth, i.naturalHeight, 0, 0, 40, 20);
    c.clearRect(0, 0, 300, 40); }
}
// the picture: the night sky and, below the horizon where the camera's elevation puts it, the ground; the grain; the
// target where the tracker holds it (the reticle's middle, a pixel's wander), as big as its size and range make it in
// this field of view: a hot point when it is too small to see its shape; its picture by how it is seen (from the side
// as it crosses, foreshortened as it turns toward or away, the drone's front head on and its dive, from below when
// overhead; the reentry vehicle nose along its fall). Its half size on the picture (the tracker's gate fits it), or 0
// when it is beyond the camera's reach
// (F the field's width (rad); the interceptors flying at the hooked one drawn over it, in the same clip)
// the television's sky at an elevation (rad): its colour, from the horizon's glow (or haze) up
function adcSkyTV(e) {
  const d = AD.day, k = Math.exp(-Math.max(0, e) / (d ? 0.25 : 0.12)), A = d ? ADC_SKYD : ADC_SKYN;
  return 'rgb(' + Math.round(A[0] + (A[3] - A[0]) * k) + ',' + Math.round(A[1] + (A[4] - A[1]) * k) + ',' + Math.round(A[2] + (A[5] - A[2]) * k) + ')';
}
const ADC_SKYN = [36, 42, 48, 98, 108, 117], ADC_SKYD = [92, 128, 168, 214, 214, 206];   // (the desert's: a pale blue, a warm dusty haze)   // (overhead's, then the horizon's)
function adcCamView(tr, w, h, ir, X, Y, Z, F) { const c = adcC; c.save(); c.beginPath(); c.rect(0, 0, w, h); c.clip(); const r = adcCamPic(tr, w, h, ir, X, Y, Z, F); if (tr) adcMsl(tr, w, h, ir, F); c.restore(); return r; }
function adcCamPic(tr, w, h, ir, X, Y, Z, F) {
  // (the picture the whole screen: the bezel keys' names written over its right edge)
  const c = adcC, VW = w, wh = AD.pol === 'wh', cx = w / 2 + ADC_OFS.x, cy = h / 2 - 6 + ADC_OFS.y;
  const r3 = Math.hypot(X, Y, Z) || 1, rh = Math.hypot(X, Y), el = Math.atan2(Z, rh), px = VW / F;
  // (the low-light television: the night sky's glow a grey it shows bright toward the horizon (the towns' light under the
  // clouds), darker overhead, a target a dark shape against it; by day the sky's blue, pale with haze at the horizon)
  if (ir) c.fillStyle = wh ? '#1b1d20' : '#d2d5d7';
  else { const g = c.createLinearGradient(0, 0, 0, h); for (let i = 0; i <= 2; i++) g.addColorStop(i / 2, adcSkyTV(el + (cy - h * i / 2) / px)); c.fillStyle = g; }
  c.fillRect(0, 0, VW, h);
  // (the ground below the horizon where the target's elevation puts it: the far hills' ragged line, the sky's haze over
  // the skyline, the ground darkening toward the picture's foot in bands; not a flat block)
  const yH = cy + el * px;
  if (yH < h + 26) {
    // (the haze soft-topped, three thin layers; the hills fixed to the bearing, sliding by as the camera turns)
    const G = ADC_GND[ir ? (wh ? 0 : 1) : AD.day ? 3 : 2], N = ADC_RIDGE.length - 1, ox = ((Math.atan2(X, Y) * px) % VW + VW) % VW;
    c.fillStyle = G[0]; c.globalAlpha = 0.15; c.fillRect(0, yH - 26, VW, 26); c.fillRect(0, yH - 17, VW, 17); c.fillRect(0, yH - 9, VW, 9); c.globalAlpha = 1;
    // (its points at the ridge's own places, slid by the bearing: the peaks keep their heights as they pass)
    const st = VW / N, j0 = Math.floor(ox / st);
    c.fillStyle = G[1]; c.beginPath(); c.moveTo(-st, h);
    for (let j = j0 - 1; j <= j0 + N + 1; j++) c.lineTo(j * st - ox, yH - ADC_RIDGE[((j % N) + N) % N]);
    c.lineTo(VW + st, h); c.closePath(); c.fill();
    for (let i = 1; i < 4; i++) { const y = yH + (h - yH) * i / 4; if (y < h) { c.fillStyle = G[1 + i]; c.fillRect(0, y, VW, h - y); } }
  }
  // (the sensor's noise: the thermal's fixed pattern still; the low-light television's moving frame to frame, strong at
  // night, little by day)
  if (ir) { c.fillStyle = adcGrainPat; c.fillRect(0, 0, VW, h); }
  else { const ox = (Math.random() * 96) | 0, oy = (Math.random() * 96) | 0; c.save(); c.translate(-ox, -oy); c.fillStyle = adcGrainPat;
    c.globalAlpha = AD.day ? 0.6 : 1; c.fillRect(ox, oy, VW, h); if (!AD.day) c.fillRect(ox, oy, VW, h); c.restore(); }
  if (!tr) return 4;
  ADC_LAST.k = -1; ADC_LAST.vs = 0; ADC_LAST.dx = 1; ADC_LAST.dy = 0; ADC_LAST.tn = tr.tn;   // (whose picture it is: a kill on another not drawn with it)
  const kc = adcKind(tr.th), reach = adcReach(kc); if (r3 > reach) return 0;
  // (a point's heat fading with range: faint near the reach's end)
  const fade = Math.min(1, Math.max(0.35, 1.5 - r3 / reach));
  const jx = cx + (Math.random() - 0.5), jy = cy + (Math.random() - 0.5), row = ir ? (wh ? 1 : 2) : AD.day ? 3 : 0;
  const b = Math.atan2(X, Y), v = Math.hypot(tr.vx, tr.vy, tr.vz) || 1, along = (tr.vx * X + tr.vy * Y + tr.vz * Z) / r3 / v;
  const sx = tr.vx * Math.cos(b) - tr.vy * Math.sin(b), sy = -(tr.vz * Math.cos(el) - (tr.vx * Math.sin(b) + tr.vy * Math.cos(b)) * Math.sin(el));
  const fs = Math.max(0.3, Math.sqrt(Math.max(0, 1 - along * along))), vs = Math.hypot(sx, sy) || 1;
  ADC_LAST.dx = sx / vs; ADC_LAST.dy = sy / vs; ADC_LAST.vs = Math.hypot(sx, sy);   // (its way across the picture, for its kill)
  let k = -1, rot = 0, flip = sx > 0, fx = 1;
  if (kc === 'TBM') { k = 6; flip = false; rot = Math.atan2(sy, sx) - Math.atan2(100, -70); }
  else if (kc === 'UAV') { if (el > 1.05) k = 0, flip = false; else if (tr.vz < -15) k = 2; else if (Math.abs(along) > 0.85) k = 3, flip = false; else k = 1, fx = fs; }
  else if (kc === 'CM') { if (el > 1.05) k = 4, flip = false; else k = 5, fx = fs; }
  const hot = ir ? (wh ? '#ffffff' : '#000000') : k === 6 && !AD.day ? '#e8f0f4' : '#1c2024';   // (the television: a dark point on the sky's glow; the reentry vehicle glowing)
  // (the reentry vehicle glowing from its heat: a bloom round it, hot-coloured: white, or dark in black hot)
  if (k === 6 && ADC_SKY.naturalWidth && (ir || !AD.day)) { const g = Math.min(36, Math.max(10, ADC_SKYL[6] / r3 * px * 1.3)); c.globalAlpha = 0.7 * fade; c.drawImage(ir && !wh ? adcGlowK : adcGlow, jx - g, jy - g, 2 * g, 2 * g); c.globalAlpha = 1; }
  if (k < 0) {   // (an aircraft: no picture of it; its hot engines, two points, a dim body between, its span some 30 m)
    const s = Math.max(1.5, 30 / r3 * px / 2); c.fillStyle = hot; c.globalAlpha = 0.35; c.fillRect(jx - s, jy - s * 0.12, s * 2, s * 0.24); c.globalAlpha = 1;
    c.beginPath(); c.arc(jx - s * 0.3, jy, Math.max(1.2, s * 0.08), 0, 6.283); c.arc(jx + s * 0.3, jy, Math.max(1.2, s * 0.08), 0, 6.283); c.fill();
    // (the television at night: its lights at the wing tips and the strobe's flash, a second apart; the low-light camera
    // has no colour, so its red and green two pale points)
    if (!ir && !AD.day) { const q = Math.max(1.6, s * 0.05); c.fillStyle = '#d4d6d0'; c.beginPath(); c.arc(jx - s, jy, q, 0, 6.283); c.arc(jx + s, jy, q, 0, 6.283); c.fill();
      if (ADS.t % 1.2 < 0.3) { c.globalAlpha = 0.8; c.drawImage(adcGlow, jx - 7, jy - 7, 14, 14); c.globalAlpha = 1; } }
    return s;
  }
  if (!ADC_SKY.naturalWidth) return 4;   // (its pictures not loaded: the gate held, nothing drawn)
  const [sw, sh] = ADC_SKYS[k], sc = ADC_SKYL[k] / r3 * px / Math.max(sw, sh);
  // (too small for its shape: its heat a point, with the optics' little bloom round it)
  if (sc * Math.max(sw, sh) < 5) { c.fillStyle = hot; c.globalAlpha = 0.3 * fade; c.beginPath(); c.arc(jx, jy, 4.5, 0, 6.283); c.fill(); c.globalAlpha = fade; c.beginPath(); c.arc(jx, jy, 2.2, 0, 6.283); c.fill(); c.globalAlpha = 1; return 4; }
  ADC_LAST.k = k; ADC_LAST.rot = rot; ADC_LAST.flip = flip; ADC_LAST.fx = fx;   // (its kill breaks this picture up: adcBoom)
  c.save(); c.translate(jx, jy); c.rotate(rot); c.scale((flip ? -sc : sc) * fx, sc);
  c.drawImage(ADC_SKY, k * 256 + ((256 - sw) >> 1), row * 256 + ((256 - sh) >> 1), sw, sh, -sw / 2, -sh / 2, sw, sh);
  c.restore();
  // (the drone seen from behind as it goes away: its pusher engine's heat in the middle; head on it is hidden)
  if (k === 3 && along > 0 && ir) { c.fillStyle = hot; c.beginPath(); c.arc(jx, jy - sh * sc * 0.08, Math.max(1.5, sw * sc * 0.06), 0, 6.283); c.fill(); }
  return Math.max(sw * sc * fx, sh * sc) / 2;
}
// the interceptors flying at the hooked track, where they are in the picture (their bearing and elevation off the
// target's, the battery the camera's own place): the motor's flame seen from behind as it climbs away (an orange-white
// glow in the television, white or black in the thermal), its body's heat after the boost, a short streak behind;
// coming in from the side to the target, or nearly on it when the target comes straight at the base
function adcMsl(tr, w, h, ir, F) {
  const c = adcC, px = w / F, cx = w / 2 + ADC_OFS.x, cy = h / 2 - 6 + ADC_OFS.y, dark = ir && AD.pol !== 'wh';
  const bt = Math.atan2(tr.x, tr.y), et = Math.atan2(tr.z, Math.hypot(tr.x, tr.y)), ce = Math.cos(et);
  const at = (x, y, z, o) => { let d = Math.atan2(x, y) - bt; d -= Math.round(d / 6.2832) * 6.2832; o[0] = cx + d * ce * px; o[1] = cy - (Math.atan2(z, Math.hypot(x, y)) - et) * px; return o; };
  const P = ADC_MP, Q = ADC_MQ;
  for (const m of ADW_MS) {
    if (!m.on || m.tr !== tr || Math.hypot(m.x, m.y) < 60) continue;
    at(m.x, m.y, m.z, P); at(m.x - m.vx * 0.4, m.y - m.vy * 0.4, m.z - m.vz * 0.4, Q);
    if (P[0] < -40 || P[0] > w + 40 || P[1] < -40 || P[1] > h + 40) continue;
    const burn = m.age < m.w.tb, g = burn ? 9 : 4;
    // (by day its motor's white smoke the trail, wider)
    c.strokeStyle = dark ? 'rgba(0,0,0,0.45)' : ir ? 'rgba(255,255,255,0.45)' : AD.day ? 'rgba(236,238,240,0.75)' : 'rgba(235,235,228,0.5)'; c.lineWidth = AD.day && !ir ? (burn ? 4 : 2) : burn ? 2.5 : 1.5;
    c.beginPath(); c.moveTo(Q[0], Q[1]); c.lineTo(P[0], P[1]); c.stroke();
    c.drawImage(dark ? adcGlowK : ir || !AD.day ? adcGlow : adcGlowW, P[0] - g, P[1] - g, 2 * g, 2 * g);   // (seen from behind: round; white in the night's low light)
  }
}
const ADC_LAST = { tn: -1, k: -1, rot: 0, flip: false, fx: 1, dx: 1, dy: 0, vs: 0 }, ADC_KT = 3.5;
const ADC_MP = [0, 0], ADC_MQ = [0, 0], ADC_GATE = [249, 151.5, 90, 70];   // (B's middle, till it is drawn on a track)
// The camera's symbology, as a tracker's video carries it: short English codes in one ink, white with a dark halo so it
// reads on any picture (thermal either way, the television), no boxes and no sentences; a code the operator acts on by
// touching the target shown inverse (dark on a white block). Its meaning in Arabic goes to the message window (AD.hint)
function adS(s, x, y, al, inv, px) {
  const c = adcC; c.font = '600 ' + (px || 15) + 'px ' + FONT_MONO; c.textAlign = al || 'left'; c.direction = 'ltr';
  if (inv) { const tw = c.measureText(s).width, x0 = al === 'center' ? x - tw / 2 : al === 'right' ? x - tw : x;
    c.fillStyle = '#eef3ef'; c.fillRect(x0 - 5, y - 10, tw + 10, 20); c.fillStyle = '#06090b'; c.fillText(s, x, y + 0.5); return; }
  // (its halo dark enough for the day's pale sky)
  c.lineWidth = 4; c.strokeStyle = 'rgba(0,0,0,0.8)'; c.strokeText(s, x, y); c.fillStyle = '#eef3ef'; c.fillText(s, x, y);
}
const adcFovTxt = F => F >= ADC_FOV.w ? 'WFOV 20.0' : 'NFOV ' + (F * 57.2958).toFixed(F < 0.0175 ? 2 : 1);
const adcSens = () => AD.cam === 'ir' ? (AD.pol === 'wh' ? 'IR WHOT' : 'IR BHOT') : 'TV';
// what the camera has made of it, by the thing itself (its shape, not the radar's class)
const ADC_VIDW = { uav: 'UAV', cm: 'CM', tbm: 'RV', trn: 'TPT', cap: 'FTR' };
// The status code: what is next for the hooked track and with what (the weapon ENGAGE would give it now), then its
// launch and time to intercept, the gun, or its miss; [code, its Arabic meaning, inverse when a touch on the target does it]
const ADC_ST = ['', '', false];
const ADC_WAR = { UPR: 'الطبقة العليا', FRG: 'صاروخ التشظي', HTK: 'صاروخ الاصطدام', GUN: 'المدفع القريب' };
function adcCamState(tr) {
  const S = ADC_ST, set = (en, ar, inv) => { S[0] = en; S[1] = 'الهدف ' + tr.lbl + ': ' + ar; S[2] = !!inv; }, e = tr.eng;
  if (tr.id === 'FRD') return set('FRD  NO ENG', 'صديق، ممنوع الرمي');
  if (e) {
    const s = adwStatus(e), n = s.slice(2);
    if (s[0] === 'I') return set(e.k + '  TTI ' + adPad(n, 2), ADC_WAR[e.k] + '، الاعتراض بعد ' + n + ' ث');
    if (s === 'SAFE' || s === 'HOLD') return set(e.k + '  HELD', 'الإطلاق معلّق: ' + (s === 'SAFE' ? 'التسليح موقوف' : 'إيقاف الرمي مفعّل'));
    if (s[0] === 'L') return set(e.k + '  TTL ' + adPad(n, 2), ADC_WAR[e.k] + '، الإطلاق بعد ' + n + ' ث');
    return set(e.k + '  ENG', ADC_WAR[e.k] + '، قيد الاشتباك');
  }
  if (ADS.gun.tr === tr) return set('GUN  FIRING', 'المدفع القريب يرمي');
  // (identifying only while the camera can: in the narrow field, within its reach; else the operator's word)
  if (tr.id === 'SUS') { const idg = !tr.vid && AD.fov === 'n' && Math.hypot(tr.x, tr.y, tr.z) <= adcReach(adcKind(tr.th));
    // (the visual identification once locked: slewing, simply a suspect)
    return idg ? set(ADS.t - AD.camAt < ADC_SLEW ? 'SUS' : 'SUS  VID', 'مشتبه، جارٍ التعرّف البصري') : set('SUS  DECL', 'مشتبه، المس الهدف تعلنه معاديًا', true); }
  if (tr.cls === '---') return set('CLSFY', 'جارٍ التصنيف');
  if (tr.id === 'UNK') return tr.iff ? set('NO RESP  DECL', 'ما رد على التعريف، المس الهدف تعلنه معاديًا', true) : set('UNK  INTG', 'مجهول، المس الهدف تسأل التعريف', true);
  if (!AD.armed) return set('ARM SAFE', 'التسليح موقوف، شغّل ARM');
  if (AD.hold) return set('HOLD FIRE', 'إيقاف الرمي مفعّل');
  if (tr.missAt && ADS.t - tr.missAt < 5) return set('MISS  REENG', 'أخطأ، المس الهدف ترمي مرة ثانية', true);
  // (a hostile drone the gun's whatever the knob says, as the assist has it (adsCue))
  // (and one given to the gun stays the gun's, whatever the knob is turned to after)
  const k = tr.cls === 'UAV' || (tr.gun && AD.cramRds > 0) ? 'GUN' : adwPick(tr);
  if (!k) return set('SYS INVALID', 'المنظومة المختارة ما ترميه، غيّر SYSTEM');
  if (k === 'NOSOL') return set('NO SOLN', 'ما فيه حل اعتراض له');
  if (k === 'GUN') return AD.cramRds <= 0 ? set('GUN EMPTY', 'نفدت ذخيرة المدفع') : !AD.cram ? set('GUN HOLD', 'المدفع موقوف، اضغط GUN AUTO')
    : tr.gun || tr.cls === 'UAV' ? set('GUN AUTO <2KM', 'للمدفع القريب، يرمي داخل 2 كم') : set('GUN  RDY', 'المس الهدف يرميه المدفع القريب', true);
  return set(k + '  RDY', 'المس الهدف للرمي بـ' + ADC_WAR[k], true);
}
// (the hint in the message window: written when it changes, the window drawn again then)
function adcHint(s) { if (AD.hint !== s) { AD.hint = s; adcDirty('A'); } }
// the operator's visual identification: the hooked track locked a while within the camera's reach, in the narrow field;
// a suspect drone seen to be one declared hostile then (the camera the rules' positive identification), the rest only
// marked (an aircraft still answers IFF: its shape does not make it a friend)
function adcVid() {
  const tr = AD.hook;
  if (!tr || tr.vid || tr.gone || tr.cls === '---' || AD.fov !== 'n' || ADS.t - AD.camAt < ADC_VID || !tr.th.alive) return;
  if (Math.hypot(tr.x, tr.y, tr.z) > adcReach(adcKind(tr.th))) return;
  tr.vid = true; adcDirty('B');
  if (tr.id === 'SUS' && tr.cls === 'UAV' && tr.th.k === 'uav') {
    tr.id = 'HOS'; adsChanged();
    adsSay('SYS', 'TN ' + tr.lbl + ' VISUAL ID DRONE, DECLARED HOSTILE', 'الهدف ' + tr.lbl + ': تعرّف بصري على مسيّرة، أُعلن معاديًا', ['a.track', 'a.c.UAV', 'a.decl'], 1);
  }
}
// The camera free (nothing hooked, no kill playing in it): it takes the next target that needs the operator by itself,
// as it comes (the night's targets one at a time: the first, and each after the one before is down), not one the
// operator has dropped
function adcCamStep() {
  adcVid();
  if (AD.endAt) return;   // (the night over: nothing to move on to)
  if (AD.hook || ADS.t - AD.camKill.t < ADC_KT) return;
  // (taken silently: the new track's own line, or a press's answer, left in the window, not wiped by a 'hooked')
  const t = ADS.tab.find(t => !t.dropped && adsTodo(t)); if (t) adsHook(t);
}
// The kill as the camera sees it, in metres at its range (the field opened at the kill to some 45 m across, adwCamResult):
// a flash over the picture; the fireball swelling and cooling; a fragmentation warhead's or the gun's spray of hot
// fragments; the target's picture broken in two, the halves tumbling and falling burning, a smoke trail behind each;
// a scatter of debris, some burning; and smoke puffs swelling, rising a little and drifting, last of all. On the base
// (an impact) a ground burst: the fireball on the ground, the smoke rising higher. Each part's spread its own, from a
// hash of the track's number (the same kill drawn the same each frame). The thermal shows heat (white hot, or dark in
// black hot), the smoke faint; the television the fire's colours, the smoke dark
const adcHash = (i, s) => { const x = Math.sin(i * 127.1 + s * 311.7) * 43758.5453; return x - Math.floor(x); };
function adcBoom(w, h, ir, K, t, far) {
  // (its scale held to some 30 m across the picture at the least: close in, an impact by the base, not a fireball
  // a thousand pixels wide)
  const c = adcC, u = Math.min(w / 30, w / K.f / (Math.hypot(K.x, K.y, K.z) || 1)), cx = w / 2, cy = h / 2 - 6, wh = AD.pol === 'wh', bh = ir && !wh, sd = K.seed, imp = K.imp;
  // (the low-light television at night has no colour: its fire as white as the thermal's; by day the fire's own colours)
  const mono = ir || !AD.day, glow = bh ? adcGlowK : mono ? adcGlow : adcFire, core = bh ? adcCoreK : mono ? adcCore : adcFireC, hot = bh ? '0,0,0' : mono ? '240,240,232' : '255,200,120';
  // (the target's way across the picture and its speed across it: the burst carried along it, stretched by it)
  // (on the base nothing carries on along its way: a ballistic one's fall would take its cloud below the picture)
  const dx = K.dx, dy = K.dy, V = K.imp ? 0 : K.vs, st = 1 + 0.8 * Math.min(1, V / 200), ang = Math.atan2(dy, dx);
  const mv = tt => 0.03 * V * (1 - Math.exp(-tt / 0.1));   // (m: what the debris keeps of the target's speed, lost in a tenth)
  // the camera's own gain at the burst (night television, thermal white hot): the picture round the white blob dipped
  // dark, and back over some 0.4 s (the television by day no dip: its sky as bright as the fire)
  if ((ir ? wh : !AD.day) && t < 0.4) {   // (the thermal's sky dark by day too)
    c.globalAlpha = 0.5 * (1 - t / 0.4); c.fillStyle = '#000'; c.fillRect(0, 0, w, h); }
  // smoke behind the fire: a ragged cloud of small puffs, each thrown its own way (along the target's way more), swelling,
  // rising a little and drifting; its darkness thinning as it spreads, and let go over the burst's last 0.6 s. By day
  // its top lit by the sun; in the thermal hot at first (a warm glow in it, rising), then near the air's own heat
  if (!far) {
    const puff = ir ? adcPuffM : adcPuffD, nP = imp ? 26 : 24, ca = Math.cos(ang), sa = Math.sin(ang);
    for (let i = 0; i < nP; i++) {
      const t0 = 0.08 + 0.3 * adcHash(i, sd), tt = t - t0; if (tt <= 0) continue;
      const a = adcHash(i + 9, sd) * 6.283, d = (0.8 + 6 * adcHash(i + 19, sd)) * (1 - Math.exp(-tt * 2.5)), sz = 0.35 + 0.55 * adcHash(i + 29, sd);
      const ox = Math.cos(a) * d, oy = Math.sin(a) * d * 0.75, al = (ox * ca + oy * sa) * st + mv(tt) * 0.5, ac = -ox * sa + oy * ca;   // (along the way, and across it)
      const R0 = sz * 1.4, R = R0 + sz * (imp ? 6 : 4.5) * Math.sqrt(tt / ADC_KT);
      const x = cx + (al * ca - ac * sa + (0.8 + 1.2 * adcHash(i + 39, sd)) * tt) * u, y = cy + (al * sa + ac * ca - (imp ? 3.2 : 0.6 + adcHash(i + 49, sd)) * tt - (imp ? i * 0.5 : 0)) * u;
      const A = Math.min(1, tt * 3) * Math.pow(R0 / R, 0.7) * Math.min(1, (ADC_KT - t) / 0.6) * (ir ? 0.35 : 0.6), Rp = R * u;   // (let go over the last 0.6 s, not cut)
      c.globalAlpha = A; c.drawImage(puff, x - Rp, y - Rp, 2 * Rp, 2 * Rp);
      if (!ir && AD.day) { c.globalAlpha = A * 0.25; c.drawImage(adcPuffL, x - Rp * 0.8, y - Rp * 1.05, 1.6 * Rp, 1.6 * Rp); }
    }
    if (ir) { const g = 6 * u, f = 0.6 * Math.exp(-t / 0.6); c.globalAlpha = f; c.drawImage(glow, cx - g, cy - g - 2 * t * u, 2 * g, 2 * g); }
  }
  // the fireball: a hard white heart (clipped, as a camera shows it) and a short halo, in two or three lobes, stretched
  // along the target's way; the television's flame short (some 0.2 s, then smoke), the thermal's hot gas glowing longer.
  // A hit to kill's flash brighter and shorter
  { const htk = K.how === 'HTK', R = (1.2 + (imp ? 6 : 3) * (1 - Math.exp(-t / 0.15))) * u, f = Math.exp(-t / (ir ? 0.9 : 0.2) * (htk ? 1.6 : 1));
    c.save(); c.translate(cx, cy - (imp ? R * 0.5 : 0)); c.rotate(ang); c.scale(st, 1);
    for (let l = 0; l < 3; l++) { const la = adcHash(l + 230, sd) * 6.283, lo = l ? 0.35 * R : 0, lr = (l ? 0.75 : 1) * R;
      c.globalAlpha = Math.min(1, f * (htk && t < 0.05 ? 1.5 : 1.15)); c.drawImage(core, Math.cos(la) * lo - lr * 1.25, Math.sin(la) * lo - lr * 1.25, lr * 2.5, lr * 2.5); }
    c.restore(); }
  // the fragments: too fast and small to be seen in flight (some 1,500 m/s: across this picture in a fiftieth); where they
  // strike the target, a frame of sparkles round it; the gun's rounds a few flashes on it over a few tenths; none by a hit
  // to kill
  if (K.how === 'FRG' && t < 0.06) { c.globalAlpha = 1; c.fillStyle = 'rgb(' + hot + ')';
    for (let i = 0; i < 9; i++) { const a = adcHash(i + 40, sd) * 6.283, r = 2 * adcHash(i + 70, sd) * u; c.fillRect(cx + Math.cos(a) * r - 1, cy + Math.sin(a) * r - 1, 2, 2); } }
  if (K.how === 'gun') for (let i = 0; i < 4; i++) { const ti = i * 0.09 - t; if (ti > 0 || ti < -0.05) continue;
    const a = adcHash(i + 60, sd) * 6.283, r = 1.5 * adcHash(i + 65, sd) * u, g = 4; c.globalAlpha = 1; c.drawImage(glow, cx + Math.cos(a) * r - g, cy + Math.sin(a) * r - g, 2 * g, 2 * g); }
  // the target broken (not on the base: there it is gone in the blast): its nose two fifths, its tail the rest, tumbling
  // down along its way; only the tail (its engine, its fuel) burning, a smoke trail behind it
  if (!imp && !far && K.k >= 0 && ADC_SKY.naturalWidth) {
    const k = K.k, [sw, sh] = ADC_SKYS[k], sc = ADC_SKYL[k] * u / Math.max(sw, sh), row = ir ? (wh ? 1 : 2) : AD.day ? 3 : 0, sx0 = k * 256 + ((256 - sw) >> 1), sy0 = row * 256 + ((256 - sh) >> 1);
    const ax = Math.cos(K.rot) * (K.flip ? -1 : 1), ay = Math.sin(K.rot), cut = Math.round(sw * 0.4), puff = ir ? adcPuffM : adcPuffD;
    for (let j = 0; j < 2; j++) {
      const sg = j ? 1 : -1, sp = 2 + 3 * adcHash(j + 90, sd), up = 1 + 3 * adcHash(j + 95, sd), burn = j === 1;
      const P = tt => [cx + (ax * sg * sp * tt + dx * mv(tt) + 1.2 * tt) * u, cy + (ay * sg * sp * tt + dy * mv(tt) - up * tt + 4.9 * tt * tt) * u];
      if (burn) for (let q = 1; q <= 5; q++) { const tq = t - q * 0.15; if (tq <= 0) break; const [x, y] = P(tq), R = (0.5 + 0.45 * q) * u;
        c.globalAlpha = 0.4 * (1 - q / 6); c.drawImage(puff, x - R, y - R, 2 * R, 2 * R); }
      const [x, y] = P(t), w0 = j ? sw - cut : cut; c.globalAlpha = 1;
      c.save(); c.translate(x, y); c.rotate(K.rot + sg * (1.5 + 2 * adcHash(j + 99, sd)) * t); c.scale((K.flip ? -sc : sc) * K.fx, sc);
      c.drawImage(ADC_SKY, sx0 + (j ? cut : 0), sy0, w0, sh, j ? cut - sw / 2 : -sw / 2, -sh / 2, w0, sh); c.restore();   // (each where it was in the whole: no jump at the break)
      if (burn) { const g = Math.max(2, 0.5 * u) * (1 - 0.6 * t / ADC_KT); c.globalAlpha = 0.85; c.drawImage(glow, x - g, y - g, 2 * g, 2 * g); }
    }
  }
  // the debris: flung out (most of it on along the target's way when it crosses the picture faster than 30 m/s: not on
  // the base, head on, or its way unknown), and falling; the burning pieces hot points with a streak of the camera's
  // exposure (a frame's at night, none by day), longer-lived in the thermal (the metal still hot after its flame); the
  // rest dark specks
  const exp = ir ? 0.03 : AD.day ? 0 : 0.04, life0 = ir ? 1.5 : 1;
  for (let i = 0; i < 22; i++) {
    const a = i < 13 && V > 30 ? ang + (adcHash(i + 120, sd) - 0.5) * 1.6 : adcHash(i + 120, sd) * 6.283, v = 5 + 22 * adcHash(i + 150, sd), burn = adcHash(i + 180, sd) < 0.45;
    const fx = tt => cx + (Math.cos(a) * v * tt + dx * mv(tt) + 1.2 * tt) * u, fy = tt => cy + (Math.sin(a) * v * 0.8 * tt + dy * mv(tt) - (imp ? 6 : 0) * tt + 4.9 * tt * tt) * u;
    const x = fx(t), y = imp ? Math.min(fy(t), cy + 0.5 * u) : fy(t); if (x < -8 || x > w + 8 || y > h + 8) continue;   // (on the base: down to the ground, not through it)
    if (burn) { const life = 1 - t / ((1.4 + 1.6 * adcHash(i + 210, sd)) * life0); if (life <= 0) continue;
      c.globalAlpha = life;
      if (exp) { c.strokeStyle = 'rgb(' + hot + ')'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(fx(Math.max(0, t - exp)), imp ? Math.min(fy(Math.max(0, t - exp)), cy + 0.5 * u) : fy(Math.max(0, t - exp))); c.lineTo(x, y); c.stroke(); }
      if (mono) { const g = 2 + 1.4 * life; c.drawImage(glow, x - g, y - g, 2 * g, 2 * g); } else { c.fillStyle = '#ffb048'; c.fillRect(x - 1.2, y - 1.2, 2.4, 2.4); } }   // (by day a burning piece a small bright point)
    else if (!far) { c.globalAlpha = Math.max(0, 1 - t / ADC_KT); c.fillStyle = ir ? (wh ? '#8a8a8a' : '#6a6a6a') : AD.day ? '#15181a' : '#202326'; c.fillRect(x - 1, y - 1, 2, 2); }
  }
  c.globalAlpha = 1;
}
// B: the tracking camera: thermal or day television, wide or narrow (narrow at the start: on a track, its shape seen
// within some 25 km), on the hooked track (its picture live, drawn at
// each of the console's ticks while it is on one); a kill on it seen there a few seconds (its flash, its fragments);
// with none it stands by
function adcCam() {
  // (the hooked one already down, held till the radar's next look: its result shown, not a live line on it)
  const [, , w, h] = adcBegin('B'), ir = AD.cam === 'ir', ink = ir ? (AD.pol === 'wh' ? '#ffffff' : '#101214') : '#eef3ef', RX = w - 84, ink2 = ir ? '#ffffff' : ADC_G, K = AD.camKill, kt = ADS.t - K.t, tr = AD.hook && AD.hook.th.alive ? AD.hook : null;
  if (tr) {
    const r = Math.hypot(tr.x, tr.y), el = Math.atan2(tr.z, r) * 180 / Math.PI, c = adcC, kc = adcKind(tr.th), F = adcFov(tr.x, tr.y, tr.z, kc);
    const on = adcSlew(tr, w, h), cx = w / 2, cy = h / 2 - 6;
    const seen = adcCamView(tr, w, h, ir, tr.x, tr.y, tr.z, F), gw = Math.min(150, Math.max(16, seen + 10)), gh = Math.min(60, gw);
    ADC_OFS.x = ADC_OFS.y = 0;
    adS(adcSens(), ADC_PAD, 20); adS(adcFovTxt(F), RX, 20, 'right');
    c.strokeStyle = ink; c.lineWidth = 1.5;
    // (where a touch counts as on the target: the gate and a margin; slewing or beyond reach, round the middle)
    ADC_GATE[0] = cx; ADC_GATE[1] = cy; ADC_GATE[2] = seen && on ? gw + 24 : 90; ADC_GATE[3] = seen && on ? gh + 24 : 70;
    if (seen && on) {
      // (the tracker's gate: its corners round the target, fitted to its size; its cross outside the gate, so nothing
      // lies over what it holds)
      const bw = gw, bh = gh, bt = Math.min(14, bw * 0.4);
      for (let i = 0; i < 8; i += 2) { const sx = ADC_CORN[i], sy = ADC_CORN[i + 1]; c.beginPath(); c.moveTo(cx + sx * bw, cy + sy * (bh - bt)); c.lineTo(cx + sx * bw, cy + sy * bh); c.lineTo(cx + sx * (bw - bt), cy + sy * bh); c.stroke(); }
      c.beginPath(); c.moveTo(cx - bw - 18, cy); c.lineTo(cx - bw - 6, cy); c.moveTo(cx + bw + 6, cy); c.lineTo(cx + bw + 18, cy); c.moveTo(cx, cy - bh - 16); c.lineTo(cx, cy - bh - 5); c.moveTo(cx, cy + bh + 5); c.lineTo(cx, cy + bh + 16);
      c.stroke();
    } else {
      // (slewing, or beyond the camera's reach (the radar's cue): the boresight's open cross only)
      c.beginPath(); c.moveTo(cx - 40, cy); c.lineTo(cx - 12, cy); c.moveTo(cx + 12, cy); c.lineTo(cx + 40, cy); c.moveTo(cx, cy - 34); c.lineTo(cx, cy - 10); c.moveTo(cx, cy + 10); c.lineTo(cx, cy + 34); c.stroke();
    }
    // (what is next for it, and with what: the line the operator reads before touching the target)
    adcCamState(tr); adS(ADC_ST[0], w / 2 - 30, 46, 'center', ADC_ST[2], 16); adcHint(AD.endAt ? '' : ADC_ST[1]);   // (none once the night is over)
    // (its class as the camera has seen it, once identified)
    adS('TN ' + tr.lbl + '  ' + (tr.vid ? ADC_VIDW[tr.th.k] : tr.cls) + '  ' + tr.id, ADC_PAD, h - 38);
    adS('RNG ' + (r / 1000).toFixed(1) + 'KM', ADC_PAD, h - 18);
    adS('AZ ' + adPad(Math.round(adBrg(tr.x, tr.y)) % 360, 3) + '  EL ' + (el >= 0 ? '+' : '') + el.toFixed(1), RX, h - 18, 'right');
    adS(!on ? 'SLEW' : seen ? 'TRK' : 'RDR CUE', RX, h - 38, 'right');
  } else if (kt >= 0 && kt < ADC_KT) {
    // (the kill on the hooked track: its flash swelling and fading, its fragments flying out and falling, where the
    // tracker held it)
    adcCamView(null, w, h, ir, K.x, K.y, K.z, K.f);
    // (beyond the camera's reach for the target's shape the burst still seen: its light and heat carry far, not its
    // pieces or its smoke)
    adcBoom(w, h, ir, K, kt, Math.hypot(K.x, K.y, K.z) > adcReach(K.kc));
    adS(adcSens(), ADC_PAD, 20); adS(adcFovTxt(K.f), RX, 20, 'right');
    adS('TN ' + K.lbl + '  ' + K.cls, ADC_PAD, h - 38);
    // (the result in the status code's place, and that the camera takes the next one after it)
    // (the next promised only when there is one and the night goes on)
    const nx = !AD.endAt && !ADS.failed && ADS.seqI < ADS_SEQ.length;   // (another of the night's to come)
    adS(K.imp ? 'IMPACT' : 'KILL', w / 2 - 30, 46, 'center', false, 16);
    // (the tracker coasting on where it was a second, its boresight still drawn, then searching; the next target said in
    // the message window)
    { const c = adcC, cx = w / 2, cy = h / 2 - 6, kr = Math.hypot(K.x, K.y), kel = Math.atan2(K.z, kr) * 57.2958; c.strokeStyle = ink; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(cx - 40, cy); c.lineTo(cx - 12, cy); c.moveTo(cx + 12, cy); c.lineTo(cx + 40, cy); c.moveTo(cx, cy - 34); c.lineTo(cx, cy - 10); c.moveTo(cx, cy + 10); c.lineTo(cx, cy + 34); c.stroke();
      adS(kt < 1 ? 'COAST' : 'SRCH', RX, h - 38, 'right'); adS('AZ ' + adPad(Math.round(adBrg(K.x, K.y)) % 360, 3) + '  EL ' + (kel >= 0 ? '+' : '') + kel.toFixed(1), RX, h - 18, 'right'); }
    adcHint('الهدف ' + K.lbl + ': ' + (K.imp ? 'سقط على القاعدة' : 'تم تدميره') + (nx ? '، والكاميرا تنتقل للي بعده' : ''));
  } else {
    adT(adcSens(), ADC_PAD, 20, ADC_G, ADC_FS.body);
    adT(AD.fov === 'w' ? 'WFOV 20.0' : 'NFOV AUTO', RX, 20, ADC_G, ADC_FS.body, 'right');
    adT('STBY', w / 2 - 30, h / 2 - 6, ADC_DIM, ADC_FS.head, 'center', false, 700);
    adT('NO TRK', ADC_PAD, h - 20, ADC_G, ADC_FS.body);
    // (with tracks up: a touch here takes the most pressing one; said in the message window)
    adcHint(!AD.endAt && ADS.tab.some(adsTodo) ? 'المس الكاميرا تتبع أهم هدف' : '');   // (only when one needs the operator)
  }
  // (the bezel keys' names over the picture's right edge: a small dark tab under each, so they read on any picture)
  if (tr || (kt >= 0 && kt < ADC_KT)) { adcC.fillStyle = 'rgba(4,8,11,0.6)'; for (let i = 0; i < 5; i++) { const y = ADC_RK[i] - ADC_SCR.B[1]; adcC.fillRect(w - (i === 2 || i === 3 ? 58 : i === 4 ? 40 : 34), y - 11, 60, 22); } }
  ['IR', 'TV', 'WFOV', 'NFOV', 'POL'].forEach((s, i) => adT(s, w - 8, ADC_RK[i] - ADC_SCR.B[1], (s === 'IR' && ir) || (s === 'TV' && !ir) || (s === 'WFOV' && AD.fov === 'w') || (s === 'NFOV' && AD.fov === 'n') ? ink2 : ADC_MUTE, ADC_FS.body, 'right'));
}
// C: the tracks, the most pressing first: its number, its identity in words and colour (HOS hostile red, SUS suspect
// orange, UNK unknown yellow, FRD friend blue), its class, range, time to the base, state
const ADC_COLS = [['TN', ADC_PAD, 'left'], ['ID', 70, 'left'], ['CLS', 110, 'left'], ['RNG', 186, 'right'], ['TTG', 236, 'right'], ['ST', -1, 'right']];
function adcTracks() {
  // (its state the night's score so far: kills, and those that got through to the base)
  const [, , w, h] = adcBegin('C'), c = adcC, T = ADS.tab; let nh = 0; for (const t of T) if (t.id === 'HOS') nh++;
  adcHead(w, 'TRACKS', 'KILL ' + ADS.kills + '  LEAK ' + ADS.hits + '  ' + nh + ' HOS', ADS.hits ? ADC_R : nh ? ADC_Y : ADC_MUTE);
  for (const [s, x, a] of ADC_COLS) adT(s, x === -1 ? w - ADC_PAD : x, 52, ADC_DIM, ADC_FS.small, a);
  adRule(62, ADC_PAD, w - ADC_PAD);
  // six rows: the live tracks (the hooked one always among them: the rows scroll to it), and under them the results of
  // the last seconds, dimmed: KILL, or IMPACT in red (up to two rows kept for them however many tracks are live)
  let nr = 0; for (const q of ADW_KX) if (ADS.t - q.t <= ADW_RES_T) nr++;
  // (the rows the most pressing first; the hooked one, when lower, pinned as the last row, the hostiles above it kept)
  const ROWS = Math.max(4, 6 - Math.min(2, nr)), hi = T.indexOf(AD.hook); ADC_ROWS.length = 0;
  if (hi < ROWS) { for (let i = 0; i < Math.min(T.length, ROWS); i++) ADC_ROWS.push(T[i]); }
  else { for (let i = 0; i < ROWS - 1; i++) ADC_ROWS.push(T[i]); ADC_ROWS.push(AD.hook); }
  AD.tabFirst = 0; AD.tabRows = ADC_ROWS.length;
  let n = ADC_ROWS.length;
  if (T.length > n) adT('+' + (T.length - n) + ' ▾', w - ADC_PAD, h - 9, ADC_MUTE, ADC_FS.small, 'right');
  for (const q of ADW_KX) {
    if (n >= 6 || ADS.t - q.t > ADW_RES_T) continue; const y = 76 + n * 19; n++;
    c.globalAlpha = 0.7; adT(q.lbl, ADC_PAD, y, ADC_MUTE, ADC_FS.body); adT(q.id, 70, y, ADC_MUTE, ADC_FS.body); adT(q.cls, 110, y, ADC_MUTE, ADC_FS.body);
    c.globalAlpha = 1; adT(q.imp ? 'IMPACT' : 'KILL', w - ADC_PAD, y, q.imp ? ADC_R : ADC_G, ADC_FS.body, 'right');
  }
  if (!n) { adT('NO TRACKS', w / 2, h / 2 + 22, ADC_DIM, ADC_FS.body, 'center'); return; }
  for (let i = 0; i < ADC_ROWS.length; i++) {
    const tr = ADC_ROWS[i], y = 76 + i * 19, col = adcIdCol(tr.id), tti = tr.id === 'FRD' ? 0 : tr.tti;
    if (tr === AD.hook) { c.fillStyle = 'rgba(233,242,234,0.14)'; c.fillRect(4, y - 9, w - 8, 18); }
    // (its engagement first, counted down as the table is drawn again at each look: its first round's seconds to the
    // intercept (I), or to the launch while it waits (L); or given to the gun)
    // (its state, not the radar that sees it: engaged (L / I / SAFE / HOLD), the gun's, coasting, a friend's answer,
    // suspect, unknown (IFF to ask, or no reply), or nothing yet)
    const st = tr.eng ? adwStatus(tr.eng) : (tr.gun || (tr.id === 'HOS' && tr.cls === 'UAV' && AD.cram)) && AD.armed && !AD.hold && AD.cramRds > 0 ? 'GUN' : tr.cst ? 'CST' : tr.id === 'FRD' ? (tr.iff === 'M5' ? 'M5' : 'LINK') : tr.id === 'SUS' ? 'SUS' : tr.id === 'UNK' ? (tr.iff === 'NR' ? 'NR' : 'IFF?') : tr.pri ? 'PRI' : '—';
    adT(tr.lbl, ADC_PAD, y, col, ADC_FS.body); adT(tr.id, 70, y, col, ADC_FS.body); adT(tr.cls, 110, y, col, ADC_FS.body);
    adT(String(Math.round(Math.hypot(tr.x, tr.y) / 1000)), 186, y, ADC_W, ADC_FS.body, 'right');
    adT(tti ? (tti >= 600 ? '>10' : Math.floor(tti / 60) + ':' + adPad(tti % 60, 2)) : '--', 236, y, tti && tti < 60 ? ADC_R : ADC_W, ADC_FS.body, 'right');
    adT(st, w - ADC_PAD, y, tr.pri || tr.eng ? ADC_Y : ADC_W, ADC_FS.body, 'right');
  }
}
// D: the launchers (each one's rounds, a cell a round) or the patrolling fighter's page; the console's settings under them
function adcLnch() {
  const [, , w, h] = adcBegin('D'), c = adcC;
  if (AD.page === 'cap') {
    // (the fighter on its racetrack, on the data link: where it is, its height; its tasking not yet for the operator)
    const f = ADS.th.find(o => o.k === 'cap' && o.alive);
    adcHead(w, 'CAP', f ? 'LINK' : 'NO LINK', f ? ADC_B : ADC_MUTE);
    if (f) { const b = adPad(Math.round(adBrg(f.x, f.y)) % 360, 3), r = Math.round(Math.hypot(f.x, f.y) / 1000);
      adT('VIPER 1   F-15 ON STATION', ADC_PAD, 62, ADC_B, ADC_FS.body); adT('BRG ' + b + '   ' + r + ' KM   FL' + Math.round(f.z * 3.281 / 100), ADC_PAD, 86, ADC_W, ADC_FS.body);
      adT('دورية مقاتلة صديقة في موقعها', w - ADC_PAD, 116, ADC_MUTE, ADC_FS.ar, 'right', true, 700); adT('TASKING: NOT AVAILABLE', ADC_PAD, 146, ADC_DIM, ADC_FS.small); }
    else adT('NO FIGHTER ON STATION', w / 2, 90, ADC_DIM, ADC_FS.body, 'center');
  } else {
    adcHead(w, 'LAUNCHERS', 'CRAM ' + AD.cramRds + ' RDS', AD.cram ? ADC_W : ADC_Y);
    AD.lnch.forEach((L, i) => {
      const y = 54 + i * 21, X0 = 86, avail = w - X0 - 70, gap = 3, cw = (avail - gap * (L.cap - 1)) / L.cap;
      adT(L.n, ADC_PAD, y, ADC_W, ADC_FS.body); adT(L.k, 44, y, ADC_DIM, ADC_FS.small);
      for (let j = 0; j < L.cap; j++) { c.fillStyle = j < L.left ? ADC_G : '#1b2a21'; c.fillRect(X0 + j * (cw + gap), y - 6, cw, 12); }
      adT(L.left + '/' + L.cap, w - ADC_PAD, y, L.left ? ADC_W : ADC_R, ADC_FS.body, 'right');
    });
  }
  // the settings line: the system and doctrine knobs, master arm, hold fire, the gun's own mode
  adRule(h - 26, 0, w);
  const st = [['SYS ' + ADA_SYS[AD.sys], ADC_W], ['DOC ' + ADA_DOC[AD.doc], ADC_W], [AD.armed ? 'ARMED' : 'SAFE', AD.armed ? ADC_Y : ADC_MUTE], [AD.hold ? 'HOLD FIRE' : '', ADC_R],
    [ADS.fly ? ADS.fly + ' IN FLT' : '', ADC_G]];
  let x = ADC_PAD; for (const [s, col] of st) { if (!s) continue; adT(s, x, h - 12, col, ADC_FS.small, 'left', false, 700); x += c.measureText(s).width + 16; }
}
// The panel's legends and the knobs' pointers, on one canvas over the grids and the desk (ADC_OV): each control's
// name engraved under it, backlit where it is on (hold fire red, master arm amber, the page and the gun's mode white),
// each knob's settings round it, the one it is on lit; and each knob's pointer, a bright bar with its shadow from the
// cap's middle out to the mark of its setting (the photograph's printed pointers taken off in the tool)
const ADC_LEG = { lg: [['UP', 'DOWN'], ['HOOK', 'IFF'], ['CLASS', 'PRI']], rg: [['LNCH', 'CAP'], ['RLD', 'BIT'], ['GUN AUTO', 'GUN HOLD']] };
function adcPanelArt() {
  const el = adcOver, c = adcC = el.getContext('2d'), k = el.width / ADC_OV[2];
  c.setTransform(k, 0, 0, k, -ADC_OV[0] * k, -ADC_OV[1] * k); c.clearRect(ADC_OV[0], ADC_OV[1], ADC_OV[2], ADC_OV[3]); c.textBaseline = 'middle';
  const OFF = 'rgba(206,210,214,0.62)', ON = '#f4f6f7';
  const eng = (s, x, y, col) => { adT(s, x, y, col || OFF, 12, 'center', false, 700); };
  ADC_LEG.lg.forEach((row, i) => row.forEach((s, j) => eng(s, ADC_LG[i * 2 + j][0], ADC_LG[i * 2 + j][1] + 28)));
  const rgOn = [AD.page === 'lnch', AD.page === 'cap', false, false, AD.cram, !AD.cram];
  ADC_LEG.rg.forEach((row, i) => row.forEach((s, j) => eng(s, ADC_RG[i * 2 + j][0], ADC_RG[i * 2 + j][1] + 28, rgOn[i * 2 + j] ? ON : OFF)));
  eng('HOLD FIRE', 465, 758, AD.hold ? ADC_R : OFF);
  eng('SYSTEM', 597, 756); eng('DOCTRINE', 712, 756);
  eng('CURSOR', 852, 770);
  ['SELECT', 'DROP', 'TASK CAP', 'OUTSIDE'].forEach((s, i) => eng(s, 967 + i * 60, 757));
  eng('ARM', 1238, 760, AD.armed ? ADC_Y : OFF); eng('ENGAGE', 1381, 767, AD.armed && !AD.hold ? ADC_R : OFF);
  // each knob's settings at its marks, out past them (the panel's foreshortening kept), the one it is on lit
  ADC_KNOB.forEach((n, i) => {
    const names = i ? ADA_DOC : ADA_SYS, at = i ? AD.doc : AD.sys;
    names.forEach((s, j) => { const a = ADC_TICK[i ? j + 1 : j] * Math.PI / 180; adT(s, n.x + Math.cos(a) * 48, n.y - Math.sin(a) * 33, j === at ? ON : 'rgba(206,210,214,0.45)', 11, 'center', false, 700); });
    const a = ADC_TICK[i ? at + 1 : at] * Math.PI / 180, ex = n.x + Math.cos(a) * n.rx * 0.92, ey = n.y - Math.sin(a) * n.ry * 0.92;
    const bx = n.x - Math.cos(a) * n.rx * 0.5, by = n.y + Math.sin(a) * n.ry * 0.5;
    c.lineCap = 'round';
    c.strokeStyle = 'rgba(0,0,0,0.55)'; c.lineWidth = 4.2; c.beginPath(); c.moveTo(bx + 1, by + 1.2); c.lineTo(ex + 1, ey + 1.2); c.stroke();
    c.strokeStyle = '#e8eaec'; c.lineWidth = 2.6; c.beginPath(); c.moveTo(bx, by); c.lineTo(ex, ey); c.stroke();
  });
}
const ADC_DRAW = { A: adcAir, B: adcCam, C: adcTracks, D: adcLnch, K: adcPanelArt };

/* ---- the controls ---- */
// The message window: one line at a time (say: its recorded pieces, sprites/radio_ada.mp3, voiced on its own way:
// adaVoice). A press's answer shown at once; the air picture's own (new tracks, impacts, kills, the command's calls)
// queued, each held 1.8 s, long enough to read. The queue by weight (pr, adsSay): a heavier line goes before the lighter
// ones waiting (an impact or a kill not left behind a string of new drones), in turn among its own, and a heavy one over
// a lighter one on show at once; kept short (past six, the lightest, oldest let go); and a line gone stale while it
// waited let go at its turn (news after 6 s, a weapon's after 12: an impact or a kill always said)
const ADA_STALE = [6, 12, 1e9];
function adaSay(src, en, ar, queued, say, pr) {
  const m = { src, en, ar, say, pr: pr || 0, at: AD.t }, Q = AD.msgQ;
  // (a heavy line over a lighter one on show: in the window at once, its voice after the line being said; the lighter
  // one's time cut short. Heavy behind heavy waits its turn, each read in full)
  if (queued && m.pr === 2 && AD.msg && (AD.msg.pr || 0) < 2 && !(Q.length && Q[0].pr === 2) && !(AD.msg.press && AD.t - AD.msgAt < 1.8)) { adaShow(m, false); return; }
  if (queued && AD.msg && (AD.t - AD.msgAt < AD.msgHold || Q.length)) {
    let i = Q.length; while (i && Q[i - 1].pr < m.pr) i--; Q.splice(i, 0, m);
    if (Q.length > 6) { let k = Q.length - 1; for (let j = k - 1; j >= 0; j--) if (Q[j].pr <= Q[k].pr) k = j; Q.splice(k, 1); }
    return;
  }
  adaShow(m, !queued);
}
// (the hold: the line's saying as the net will take it (what is still on it, the line, the radio's lead-in and tail and
// the gap after), or 1.6 s with no voice to wait for; a press's answer shown at once never cuts short the line still
// being said: the window's next waits for that too)
// a track's lighter lines still waiting let go, its kill or miss about to be said: its "away" or "engaging" not said
// after the result
function adaForget(lbl) { const Q = AD.msgQ, k = 'TN ' + lbl + ' '; for (let i = Q.length - 1; i >= 0; i--) if (Q[i].pr < 2 && Q[i].en.startsWith(k)) Q.splice(i, 1); }
// (the words and the voice apart: a line is in the window long enough to read (1.8 s) and the next follows, never
// waiting on the voice, which goes its own way behind (adaVoice: by weight, its stale lines let go))
// (a waiting LAUNCH HELD let go once arm or hold fire is changed: no longer true, or said again by the step if it is)
// (its waiting voice let go too; an engagement whose line was let go unseen free to say it again, with the reason as
// it then stands (adwStep))
function adaForgetHeld() {
  const Q = AD.msgQ;
  for (let i = Q.length - 1; i >= 0; i--) if (Q[i].en.indexOf('LAUNCH HELD') >= 0) { for (const e of ADS.eng) if (Q[i].en.startsWith('TN ' + e.tr.lbl + ' ')) e.held = false; Q.splice(i, 1); }
  const q = nets.ics; for (let i = q.length - 1; i >= 0; i--) if (q[i].held) q.splice(i, 1);
}
function adaShow(m, press) {
  const net = m.src === 'CMD' ? 'fm' : 'ics', voiced = m.say && S.soundOn && bankAd.d && !Snd.idle;
  m.press = !!press; AD.msg = m; AD.msgAt = AD.t; AD.msgHold = 1.8; adcDirty('A');
  if (voiced) adaVoice(m.say, net, press, m.pr || 0);
}
function adaMsgNext() {
  const Q = AD.msgQ; if (!Q.length || AD.t - AD.msgAt < AD.msgHold) return;
  while (Q.length && AD.t - Q[0].at > ADA_STALE[Q[0].pr]) Q.shift();
  if (Q.length) adaShow(Q.shift());
}
// The voice: the console's voice system dry in the headset (the intercom's net), the command on the radio (its own
// net, the radio's band); a line's pieces joined and its sound built just after the frame (radioClip, Snd.transmit)
const ADA_VOX = { ics: { net: 'ics' }, fm: { net: 'fm' } };
function adaVoiceLen(say) { let t = 0; if (say && RADIO_ADA) for (const k of say) { const c = RADIO_ADA.clips[k]; if (c) t += c[1] + 0.07; } return t; }
// (queued by its pieces, joined at its turn (pumpNet); a press's answer replaces the presses' answers still waiting, the
// newest the one that matters; the queue's push and pump just after the frame)
// (by weight in the net's queue: a press's answer first (the newest only), then the heavy, then the rest, each in turn;
// three waiting at most, the lightest oldest let go; a news line's voice stale after 6 s, a weapon's after 9, a heavy
// one's after 15)
const ADA_VTTL = [6000, 9000, 15000, 4000];
function adaVoice(say, net, press, pr) {
  setTimeout(() => pfDef('radio', () => { const q = nets[net], w = press ? 3 : pr;
    if (press) for (let i = q.length - 1; i >= 0; i--) if (q[i].press) q.splice(i, 1);
    const it = { say, bank: bankAd, press, w, ttl: ADA_VTTL[w], p: ADA_VOX[net], at: performance.now(), held: !press && (say[0] === 'a.armsafe' || say[0] === 'a.holdin') };
    let i = q.length; while (i && (q[i - 1].w || 0) < w) i--; q.splice(i, 0, it);
    if (q.length > 3) { let k = q.length - 1; for (let j = k - 1; j >= 0; j--) if ((q[j].w || 0) <= (q[k].w || 0)) k = j; q.splice(k, 1); }
    pumpNet(net); }), 0);
}
// a number said a digit at a time, as on the net ('niner' for 9)
const adDig = s => { const o = []; for (const ch of s) if (ch >= '0' && ch <= '9') o.push('a.n.' + ch); return o; };
// the controls: [x, y, radius, what it does, its name (the assist's cue)] in photo px; the radius about half the gap to the next control
const ADC_CTL = [
  // the air picture's keys
  [382, ADC_LK[0], 25, () => { AD.rng = ADA_RNG[Math.min(ADA_RNG.length - 1, ADA_RNG.indexOf(AD.rng) + 1)]; AD.cur.r = Math.min(AD.cur.r, AD.rng); adcDirty('A'); }, 'RNG+'],
  [382, ADC_LK[1], 25, () => { AD.rng = ADA_RNG[Math.max(0, ADA_RNG.indexOf(AD.rng) - 1)]; AD.cur.r = Math.min(AD.cur.r, AD.rng); adcDirty('A'); }, 'RNG-'],
  [382, ADC_LK[2], 25, () => { AD.az = (AD.az + 350) % 360; adcDirty('A'); }, 'AZ<'],
  [382, ADC_LK[3], 25, () => { AD.az = (AD.az + 10) % 360; adcDirty('A'); }, 'AZ>'],
  [382, ADC_LK[4], 25, () => { AD.mode = (AD.mode + 1) % ADA_MODE.length; adaSay('SYS', 'RADAR MODE ' + (AD.mode ? 'BALLISTIC SEARCH' : 'SURVEILLANCE'), AD.mode ? 'الرادار في وضع البحث عن الباليستي' : 'الرادار في وضع المراقبة', false, [AD.mode ? 'a.mode.tbm' : 'a.mode.surv']); }, 'MODE'],
  // the camera's keys
  [1463, ADC_RK[0], 25, () => { AD.cam = 'ir'; adcDirty('B'); }, 'IR'],
  [1463, ADC_RK[1], 25, () => { AD.cam = 'tv'; adcDirty('B'); }, 'TV'],
  [1463, ADC_RK[2], 25, () => { AD.fov = 'w'; adcDirty('B'); }, 'WFOV'],
  [1463, ADC_RK[3], 25, () => { AD.fov = 'n'; adcDirty('B'); }, 'NFOV'],
  [1463, ADC_RK[4], 25, () => { if (AD.cam === 'ir') { AD.pol = AD.pol === 'wh' ? 'bh' : 'wh'; adcDirty('B'); } }, 'POL'],
  // the tracks' grid (07c-adsim.js): the hook up and down the table, hook under the cursor, interrogate, declare, priority
  [ADC_LG[0][0], ADC_LG[0][1], 26, () => adsStep(-1), 'UP'],
  [ADC_LG[1][0], ADC_LG[1][1], 26, () => adsStep(1), 'DOWN'],
  [ADC_LG[2][0], ADC_LG[2][1], 26, () => adsHookCursor(), 'HOOK'],
  [ADC_LG[3][0], ADC_LG[3][1], 26, () => adsIff(), 'IFF'],
  [ADC_LG[4][0], ADC_LG[4][1], 26, () => adsClass(), 'CLASS'],
  [ADC_LG[5][0], ADC_LG[5][1], 26, () => adsPri(), 'PRI'],
  // the launchers' grid: the launchers' page, the fighter's, reload, built-in test, the gun's auto, the gun's hold
  [ADC_RG[0][0], ADC_RG[0][1], 26, () => { AD.page = 'lnch'; adcDirty('D'); adcDirty('K'); }, 'LNCH'],
  [ADC_RG[1][0], ADC_RG[1][1], 26, () => { AD.page = 'cap'; adcDirty('D'); adcDirty('K'); }, 'CAP'],
  // (reload: a crew at the launchers with a crane, some half an hour a launcher: not under a red warning)
  [ADC_RG[2][0], ADC_RG[2][1], 26, () => AD.lnch.every(L => L.left === L.cap) ? adaSay('SYS', 'ALL LAUNCHERS FULL', 'كل القواذف ممتلئة', false, ['a.full'])
    : adaSay('SYS', 'NO RELOAD UNDER AIR DEFENSE WARNING RED', 'لا تعبئة تحت الإنذار الأحمر', false, ['a.norld']), 'RLD'],
  [ADC_RG[3][0], ADC_RG[3][1], 26, () => adaSay('SYS', 'BIT PASSED, ALL SYSTEMS GREEN', 'الفحص الذاتي سليم، كل الأنظمة جاهزة', false, ['a.bit']), 'BIT'],
  [ADC_RG[4][0], ADC_RG[4][1], 26, () => { AD.cram = true; adcDirty('D'); adcDirty('K'); adaSay('SYS', 'CLOSE-IN GUN AUTO', 'المدفع القريب على الوضع التلقائي', false, ['a.gunauto']); }, 'GUNAUTO'],
  [ADC_RG[5][0], ADC_RG[5][1], 26, () => { AD.cram = false; adcDirty('D'); adcDirty('K'); adaSay('SYS', 'CLOSE-IN GUN HOLD', 'المدفع القريب موقوف', false, ['a.gunhold']); }, 'GUNHOLD'],
  // the desk: hold fire, the system knob, the doctrine knob
  [465, 712, 40, () => { AD.hold = !AD.hold; adaForgetHeld(); adcDirty('D'); adcDirty('K'); adaSay('SYS', AD.hold ? 'HOLD FIRE, ALL UNITS' : 'HOLD FIRE CLEARED', AD.hold ? 'إيقاف الرمي لكل الوحدات' : 'رُفع إيقاف الرمي', false, [AD.hold ? 'a.hold' : 'a.holdcl']); }, 'HOLDFIRE'],
  [597, 718, 42, () => { AD.sys = (AD.sys + 1) % ADA_SYS.length; adcDirty('D'); adcDirty('K'); }, 'SYSTEM'],
  [712, 718, 42, () => { AD.doc = (AD.doc + 1) % ADA_DOC.length; adcDirty('D'); adcDirty('K'); }, 'DOCTRINE'],
  // the hat: the cursor up (out), down (in), left, right; its middle: hook under the cursor
  [852, 693, 15, () => { AD.cur.r = Math.min(AD.rng, AD.cur.r + AD.rng / 20); adcDirty('A'); }, 'HAT^'],
  [852, 747, 15, () => { AD.cur.r = Math.max(0, AD.cur.r - AD.rng / 20); adcDirty('A'); }, 'HATv'],
  [825, 720, 15, () => { AD.cur.b = Math.max(-60, AD.cur.b - 4); adcDirty('A'); }, 'HAT<'],
  [879, 720, 15, () => { AD.cur.b = Math.min(60, AD.cur.b + 4); adcDirty('A'); }, 'HAT>'],
  [852, 720, 11, () => adsHookCursor(), 'HAT'],
  // select (hook under the cursor), drop the hook, task the fighter, the outside camera
  [967, 725, 27, () => adsHookCursor(), 'SELECT'],
  [1027, 725, 27, () => adsDrop(), 'DROP'],
  [1087, 725, 27, () => adaSay('SYS', 'NO FIGHTER TASKING YET', 'تكليف الدورية غير متاح بعد'), 'TASKCAP'],
  // (the outside camera's picture a night one: by day it is not offered)
  [1147, 725, 27, () => AD.day ? adaSay('SYS', 'OUTSIDE CAMERA: NIGHT VIEW ONLY', 'الكاميرا الخارجية ليلية فقط', false, []) : adoOpen(), 'OUTSIDE'],
  // master arm (the guarded toggle) and engage (under its cover)
  [1238, 708, 36, () => { AD.armed = !AD.armed; adaForgetHeld(); adcDirty('D'); adcDirty('K'); adaSay('SYS', AD.armed ? 'MASTER ARM ON' : 'MASTER ARM SAFE', AD.armed ? 'التسليح مفعّل' : 'التسليح موقوف', false, [AD.armed ? 'a.armon' : 'a.armsafe']); }, 'ARM'],
  [1381, 727, 38, () => adsEngage(), 'ENGAGE'],
];
const ADC_BY = Object.fromEntries(ADC_CTL.map(c => [c[4], c]));
// The assist (the menu's setting, as in the aircraft): the next step's control lit, a soft amber light round it that
// flashes on the console's tick (a class), moved only when the step changes (07c-adsim.js adsCue)
function adaCue() {
  const k = S.assist ? adsCue() : '';
  // (the flash on the tick's own beat: lit two ticks of every three, about half a second of each 0.75, the class only
  // written when it turns; no CSS animation keeping the compositor awake between ticks)
  AD.cueN = (AD.cueN + 1) % 3; if (!adcCue.hidden) adcCue.classList.toggle('lit', AD.cueN !== 2);   // (its off beat dim, not dark: CSS)
  if (k === AD.cue) return; AD.cue = k;
  const ct = k && ADC_BY[k]; adcCue.hidden = !ct; if (ct) adcCue.classList.add('lit');   // (shown lit at once, not left dark from its last flash)
  if (ct) { const d = Math.round(ct[2] * 2.6); Object.assign(adcCue.style, { left: ct[0] - d / 2 + 'px', top: ct[1] - d / 2 + 'px', width: d + 'px', height: d + 'px' }); }
}
function adaPressAt(x, y) {
  adcPress.style.left = x + 'px'; adcPress.style.top = y + 'px';
  adcPress.classList.add('on'); setTimeout(() => adcPress.classList.remove('on'), 130);
  Snd.click();
}
adcEl.addEventListener('pointerdown', e => {
  if (!AD.on || !e.isPrimary || AD.paused || e.target.closest('#adcPause, #adcPanel')) return;
  e.preventDefault();
  if (ADO.on) { adoClose(); Snd.click(); return; }   // (the outside view: a touch anywhere back to the console)
  const q = local(e), x = (q.x - AD.ox) / AD.k, y = (q.y - AD.oy) / AD.k;
  // the control nearest within its reach
  let best = null, bd = Infinity;
  for (const ct of ADC_CTL) { const d = Math.hypot(x - ct[0], y - ct[1]); if (d < ct[2] && d < bd) { bd = d; best = ct; } }
  if (best) { adaPressAt(best[0], best[1]); best[3](); return; }
  // a touch on a track: on the air picture its symbol (within some 28 px), on the table its row: hooked (and a second
  // touch there leans in on the display, as on any)
  if ((!AD.zoom || AD.zoom === 'A' || AD.zoom === 'C') && adaHookAt(x, y)) { AD.tapAt = 0; return; }
  // a touch on the camera's picture: the target's next step (07b adaCamTap)
  if ((!AD.zoom || AD.zoom === 'B') && adaCamTap(x, y)) { AD.tapAt = 0; return; }
  // a second touch on a display: lean in on it (and out again from anywhere)
  const now = performance.now();
  if (AD.zoom) { if (now - AD.tapAt < 350 && AD.tapS === '*') { AD.tapAt = 0; adaZoom(null); } else { AD.tapAt = now; AD.tapS = '*'; } return; }
  const s = Object.keys(ADC_SCR).find(k => { const r = ADC_SCR[k]; return x > r[0] && x < r[0] + r[2] && y > r[1] && y < r[1] + r[3]; });
  if (s && now - AD.tapAt < 350 && AD.tapS === s) { AD.tapAt = 0; adaZoom(s); } else { AD.tapAt = now; AD.tapS = s || ''; }
});

// The camera worked by touch, the operator's eyes on the target: on the picture (not its edges, where the keys' names
// are) a touch does the hooked track's next step, as its status line says: IFF, declare, or engage (its answer said as
// a press's: refused while safe, held, or not hostile); with none hooked, the most pressing track taken
function adaCamTap(x, y) {
  const B = ADC_SCR.B, tr = AD.hook;
  if (x < B[0] + 40 || x > B[0] + B[2] - 80 || y < B[1] + 30 || y > B[1] + B[3] - 46) return false;
  // (with a track hooked, only a touch on it: elsewhere on the picture the touch is the lean-in's, as on any display;
  // a second within 0.4 s let go, so a quick double touch never declares and fires at once)
  if (tr && (Math.abs(x - B[0] - ADC_GATE[0]) > ADC_GATE[2] || Math.abs(y - B[1] - ADC_GATE[1]) > ADC_GATE[3])) return false;
  const now = performance.now(); if (now - AD.camTap < 400) return true; AD.camTap = now;
  // (taken but nothing done while the turret still slews onto it, or once it is down: the operator acts on what he sees)
  if (tr && (ADS.t - AD.camAt < ADC_SLEW || !tr.th.alive)) return true;
  adaPressAt(x, y);
  if (!tr) { const t = ADS.tab.find(adsTodo) || ADS.tab[0]; if (t) adsHook(t, true); else adaSay('SYS', 'NO TRACKS', 'لا توجد أهداف', false, ['a.notracks']); return true; }
  if (tr.id === 'UNK' && tr.cls === 'ACFT' && !tr.iff) adsIff();
  else if ((tr.id === 'UNK' && tr.cls === 'ACFT') || tr.id === 'SUS') adsClass();
  else adsEngage();
  return true;
}
function adaHookAt(x, y) {
  const A = ADC_SCR.A, C = ADC_SCR.C;
  if (x > A[0] && x < A[0] + A[2] && y > A[1] && y < A[1] + A[3]) {
    // (the nearest within reach; touched again where several lie heaped, the next of them after the one hooked)
    let best = null, bd = 28, hk = -1; const near = ADC_NEAR; near.length = 0;
    for (let i = 0; i < ADC_PT.length; i++) { const d = Math.hypot(x - A[0] - ADC_PXY[2 * i], y - A[1] - ADC_PXY[2 * i + 1] + 4); if (d < 28 && !ADC_PT[i].gone) { near.push(ADC_PT[i]); if (ADC_PT[i] === AD.hook) hk = near.length - 1; } if (d < bd) { bd = d; best = ADC_PT[i]; } }
    near.sort(adcByTn); hk = near.indexOf(AD.hook);   // (in a fixed order, so touches step through them all)
    if (hk >= 0 && near.length > 1) best = near[(hk + 1) % near.length];
    if (best && best !== AD.hook && !best.gone) { Snd.click(); adsHook(best, true); return true; }
  } else if (x > C[0] && x < C[0] + C[2] && y > C[1] + 66 && y < C[1] + C[3]) {
    const row = Math.floor((y - C[1] - 66.5) / 19), tr = row >= 0 && row < ADC_ROWS.length ? ADC_ROWS[row] : null;
    if (tr && tr !== AD.hook && !tr.gone) { Snd.click(); adsHook(tr, true); return true; }
  }
}

/* ---- the night's end ---- */
// Once the attack is over (its targets all come and down, no hostile threat left flying, no interceptor in the air, no engagement
// waiting) the command stands the battery down (warning white, all clear) and some seconds on the end card comes up
// over the console: the night's result. The rating by what reached the base first, then by how cleanly it was done
// (interceptors spent per kill); the score kills, less base hits heavily, less the interceptors and the gun's rounds
function adaEndCheck() {
  if (AD.endAt) { if (AD.t >= AD.endAt && $('#ovEnd').hidden) adaEnd(); return; }
  // (a hostile on the base: the mission failed, its end card a few seconds on, the impact seen first)
  if (ADS.failed) { AD.endAt = AD.t + 5; AD.endT = ADS.t; adcDirty('B'); adsSay('CMD', 'ADC: BASE HIT, MISSION FAILED', 'قيادة الدفاع الجوي: أُصيبت القاعدة، فشلت المهمة', [], 2); return; }
  if (ADS.cur || ADS.seqI < ADS_SEQ.length || ADS.fly || ADS.eng.length) return;
  for (const o of ADS.th) if (o.alive && (o.k === 'uav' || o.k === 'cm' || o.k === 'tbm')) return;
  AD.endAt = AD.t + 7; AD.endT = ADS.t; adcDirty('B');   // (the camera's hint let go with it)
  adsSay('CMD', 'ADC: AIR DEFENSE WARNING WHITE, ALL CLEAR', 'قيادة الدفاع الجوي: الإنذار أبيض، زال الخطر', ['q.clear'], 2);
  if (Snd.on && !Snd.idle && Snd.ctx) { Snd.beep(880, 0, 0.18, 0.05); Snd.beep(660, 0.25, 0.3, 0.05); }
}
function adaEnd() {
  if (ADO.on) adoClose();
  const n = ADS_NHOST, k = ADS.kills, hits = ADS.hits, ints = AD.lnch.reduce((a, L) => a + L.cap - L.left, 0), rds = ADA_CRAM_RDS - AD.cramRds;
  const per = ints ? (ADS.mKills ? ints / ADS.mKills : Infinity) : k ? 0 : Infinity, rate = hits ? ['فشلت المهمة', 'MISSION FAILED'] : per <= 1.2 ? ['دفاع محكم', 'AIRTIGHT'] : ['دفاع ناجح', 'SUCCESSFUL DEFENCE'];
  const score = Math.max(0, k * 100 - hits * 400 - ints * 10 - Math.round(rds / 50));
  const m = Math.floor(AD.endT / 60), s = Math.floor(AD.endT % 60);   // (the night's length to its all clear)
  // (the cards' six cells, their names this seat's)
  const cells = [['stKill', k + '/' + n, 'المدمَّرة', 'Destroyed'], ['stAcc', String(ints), 'صواريخ الاعتراض', 'Interceptors'], ['stCiv', String(hits), 'سقوط على القاعدة', 'Base hits'],
  // (unresolved: of those that came; on a failure the rest never did)
    ['stTime', pad(m, 2) + ':' + pad(s, 2), 'المدة', 'Time'], ['stShots', String(rds), 'طلقات المدفع', 'Gun rounds'], ['stEsc', String(Math.max(0, ADS.nCame - k - hits)), 'غير المحسومة', 'Unresolved']];
  for (const [id, v, ar, en] of cells) { const dd = $('#' + id); dd.textContent = v; dd.nextElementSibling.textContent = Lg(ar, en); }
  $('#stCiv').parentNode.classList.toggle('bad', hits > 0);
  $('#stRate').textContent = EN ? rate[1].charAt(0) + rate[1].slice(1).toLowerCase() : rate[0]; $('#stRateEn').textContent = EN ? 'SCORE' : rate[1]; $('#stScore').textContent = String(score);
  $('#endText').textContent = hits ? Lg('هدف أصاب القاعدة ففشلت المهمة؛ دُمّر قبله ' + k + ' من ' + n + '.', 'A target hit the base and the mission failed; ' + k + ' of ' + n + ' destroyed before it.')
    : Lg('صدّت البطارية الهجوم كله: دُمّر ' + k + ' من ' + n + ' بلا سقوط على القاعدة.', 'The battery held the whole attack: ' + k + ' of ' + n + ' destroyed, nothing reached the base.');
  let best = {}; try { best = JSON.parse(lsGet(mapKey('saqr.best')) || '{}'); } catch (_) {}
  const isBest = score > 0 && score > (best[missionId] || 0);   // (as the other seats': no best for a 0) if (isBest) { best[missionId] = score; lsSet(mapKey('saqr.best'), JSON.stringify(best)); }
  $('#stBest').textContent = isBest ? Lg('أفضل نتيجة لهذه المهمة', 'Best score for this mission') : best[missionId] ? Lg('أفضل نتيجة: ', 'Best score: ') + best[missionId] : '';
  const mi = MISSIONS.find(q => q.id === missionId) || {}; $('#endTitle').textContent = (hits ? Lg('فشلت المهمة · ', 'Mission failed · ') : AD.day ? Lg('انتهى النهار · ', 'Day over · ') : Lg('انتهت الليلة · ', 'Night over · ')) + mName(mi);
  $('#btnAgain').querySelector('b').textContent = Lg('إعادة المهمة', 'Defend it again');
  $('#eBg').style.backgroundImage = mImg('hero_ada'); $('#eTape').hidden = true;
  S.phase = 'end'; $('#ovEnd').hidden = false; adaWake();
}

/* ---- the outside camera (OUTSIDE) ---- */
// A fixed camera on the battery at night, the whole screen, no text on it (docs/AIR_DEFENSE.md, piece 7): the owner's
// night picture of a lower-tier launcher in its valley as the plate (sprites/ada_out.webp, tools/make_airdef.py
// outside: its own intercept streak painted out), and drawn on it only what moves: each lower-tier launch from the
// launcher in view (its flash lighting the launcher and the ground: the plate lit by the flash, ada_out_lit.webp,
// crossfaded in; its cloud boiling out round the launcher's foot, lit from within at first, ada_smoke.webp; the
// motor's flame leaving along the canister and turning toward its meeting point, accelerating, its short lit trail;
// gone dark when it burns out, seconds on), the upper tier's launches far off behind the hills to the right (a glow on
// the skyline, a flame rising), and the kills it can see (within 40 km, above the skyline, inside its field: a small
// flash and falling embers). Opened by OUTSIDE, closed by a touch anywhere or the system's back; drawn only while open,
// every frame while something moves, else not at all; its canvas let go when closed. Nothing heard of its own: the
// operator is in the shelter (the launches' dull roar through its walls, adwSnd)
const ADO_IMG = ADA ? { plate: new Image(), lit: new Image(), smoke: new Image() } : null;
// the plate's size; the canister tops of the launcher in view, and the way they point (rad, right of straight up); the
// camera's heading (its middle, true degrees), its pixels a degree, the skyline's height at the elevation's zero; the
// upper tier's site on the far skyline
const ADO_W = 1600, ADO_H = 687, ADO_MX = 251, ADO_MY = 368, ADO_TILT = 28 * Math.PI / 180, ADO_HDG = 95, ADO_PXD = 26.7, ADO_HZ = 440, ADO_UX = 1300, ADO_UY = 452;
const ADO = { on: false, raf: 0, tmo: 0,
  fl: Array.from({ length: 10 }, () => ({ on: false, gone: false, t0: 0, up: false, tb: 6, tx: 0, ty: 0 })),
  sm: Array.from({ length: 8 }, () => ({ on: false, t0: 0 })), kx: Array.from({ length: 4 }, () => ({ on: false, t0: 0, x: 0, y: 0, r: 4 })) };
const adoEl = $('#ado');
// a world point (m, round the battery) on the view: its bearing off the heading and its elevation, at the view's scale
function adoAt(x, y, z, out) { out[0] = ADO_W / 2 + adOff(adBrg(x, y), ADO_HDG) * ADO_PXD; out[1] = ADO_HZ - Math.atan2(z, Math.hypot(x, y)) * 57.2958 * ADO_PXD; return out; }
const ADO_P = [0, 0];
// (its clock the sortie's own, between ticks carried on by the real time since the last: still while paused)
const adoNow = () => AD.t + (adaLast && !AD.paused ? Math.min(0.6, (performance.now() - adaLast) / 1000) : 0);
function adoReset() { for (const A of [ADO.fl, ADO.sm, ADO.kx]) for (const q of A) q.on = false; }
const adoSlot = A => { let b = A[0]; for (const q of A) { if (!q.on) return q; if (q.t0 < b.t0) b = q; } return b; };
// a launch (07d adwFire): its kind's tier and burn, its meeting point on the view
function adoLaunch(k, mx, my, mz) {
  const f = adoSlot(ADO.fl), now = adoNow(); adoAt(mx, my, mz, ADO_P);
  f.on = true; f.gone = false; f.t0 = now; f.up = k === 'UPR'; f.tb = ADW[k].tb; f.tx = ADO_P[0]; f.ty = Math.min(ADO_HZ - 40, ADO_P[1]);
  if (!f.up) { const s = adoSlot(ADO.sm); s.on = true; s.t0 = now; }
  adoKick();
}
// a kill it may see (07d adwKill)
function adoKill(o) {
  const r = Math.hypot(o.x, o.y, o.z); adoAt(o.x, o.y, o.z, ADO_P);
  if (r > 40e3 || ADO_P[1] > ADO_HZ - 4 || ADO_P[1] < 0 || ADO_P[0] < 0 || ADO_P[0] > ADO_W) return;
  const q = adoSlot(ADO.kx); q.on = true; q.t0 = adoNow(); q.x = ADO_P[0]; q.y = ADO_P[1]; q.r = Math.min(40, Math.max(3, 15 / r * 57.2958 * ADO_PXD)); adoKick();
}
function adoOpen() {
  if (ADO.on) return;
  if (!ADO_IMG.plate.naturalWidth || !ADO_IMG.lit.naturalWidth || !ADO_IMG.smoke.naturalWidth) { adaSay('SYS', 'OUTSIDE CAMERA FAIL', 'الكاميرا الخارجية لا تعمل'); return; }
  ADO.on = AD.outOn = true; adoBusOn(); adoEl.hidden = false; adoSize(); adoKick();
}
function adoClose() { adoBusOff(); ADO.on = AD.outOn = false; adoEl.hidden = true; adoEl.width = adoEl.height = 0; cancelAnimationFrame(ADO.raf); ADO.raf = 0; for (const s in ADC_DRAW) adcDirty(s); }
function adoSize() { const w = Math.min(ADO_W, Math.round(VW * PR)), h = Math.round(w * VH / VW); if (adoEl.width !== w || adoEl.height !== h) { adoEl.width = w; adoEl.height = h; } }
const adoKick = () => { if (ADO.on && !ADO.raf) ADO.raf = requestAnimationFrame(adoDraw); };
function adoDraw() {
  ADO.raf = 0; if (!ADO.on) return; adoSize();
  // (cover the screen; on a narrower one the crop kept toward the launcher's side)
  const c = adoEl.getContext('2d'), cw = adoEl.width, ch = adoEl.height, k = Math.max(cw / ADO_W, ch / ADO_H), now = adoNow();
  c.setTransform(k, 0, 0, k, (cw - ADO_W * k) * 0.3, (ch - ADO_H * k) / 2);
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.drawImage(ADO_IMG.plate, 0, 0, ADO_W, ADO_H);
  let flash = 0, live = false;
  for (const f of ADO.fl) { if (!f.on || f.up) continue; const t = now - f.t0; if (t > f.tb + 2) { f.on = false; continue; } live = true;
    flash = Math.max(flash, t < 0.12 ? t / 0.12 : Math.exp(-(t - 0.12) / 0.5) * (0.85 + 0.15 * Math.sin(t * 47))); }
  if (flash > 0.01) { c.globalAlpha = Math.min(1, flash); c.drawImage(ADO_IMG.lit, 0, 0, ADO_W, ADO_H); }
  // the clouds: grey, swelling and drifting a little right, thinning over twelve seconds; lit from within while the flash lasts
  for (const s of ADO.sm) { if (!s.on) continue; const t = now - s.t0; if (t > 14) { s.on = false; continue; }
    const g = 1 + 0.6 * Math.min(1, t / 6), a = Math.min(1, t / 0.35) * Math.max(0, 1 - t / 14), w = 560 * g, h = 280 * g, x = 240 + t * 6 - w / 2, y = 610 - h * 0.78;
    c.globalAlpha = a * 0.9; c.drawImage(ADO_IMG.smoke, 0, 0, 512, 256, x, y, w, h);
    if (flash > 0.02) { c.globalAlpha = Math.min(1, flash) * a; c.drawImage(ADO_IMG.smoke, 0, 256, 512, 256, x, y, w, h); }
    // (and the exhaust's cloud out of the canister's top, rising and spreading as it cools)
    const g2 = 0.35 + 0.5 * Math.min(1, t / 4), w2 = 420 * g2, h2 = 240 * g2, x2 = ADO_MX + 20 + t * 4 - w2 / 2, y2 = ADO_MY - 10 - t * 7 - h2 * 0.75, a2 = Math.min(1, t / 0.25) * Math.max(0, 1 - t / 9) * 0.75;
    c.globalAlpha = a2; c.drawImage(ADO_IMG.smoke, 0, 0, 512, 256, x2, y2, w2, h2);
    if (flash > 0.02) { c.globalAlpha = Math.min(1, flash) * a2; c.drawImage(ADO_IMG.smoke, 0, 256, 512, 256, x2, y2, w2, h2); } }
  // the flames: out along the canister, turning toward the meeting point, faster and faster; dark at burnout
  c.globalCompositeOperation = 'lighter';
  for (const f of ADO.fl) {
    if (!f.on) continue; const t = now - f.t0; if (t > f.tb + 2) { f.on = false; continue; } if (f.gone) continue;
    // (out of the canister fast: some 45 m from the camera, a real one is out of the picture inside a second or two)
    const x0 = f.up ? ADO_UX : ADO_MX, y0 = f.up ? ADO_UY : ADO_MY, d = f.up ? 9 * t * t + 6 * t : 100 * t * t + 210 * t;
    let ax = f.up ? Math.sin(0.12) : Math.sin(ADO_TILT), ay = f.up ? -Math.cos(0.12) : -Math.cos(ADO_TILT);
    const bx = f.tx - x0, by = f.ty - y0, bl = Math.hypot(bx, by) || 1, u = Math.min(1, t / 3) * 0.7;
    ax = ax * (1 - u) + bx / bl * u; ay = ay * (1 - u) + by / bl * u; const al = Math.hypot(ax, ay) || 1; ax /= al; ay /= al;
    const x = x0 + ax * d, y = y0 + ay * d, burn = t < f.tb ? 1 : Math.max(0, 1 - (t - f.tb) / 0.6);
    // (gone from the picture, past its meeting point on it, or burnt out: nothing more of it)
    // (the flame only: its launch's flash and cloud go on by their own time)
    if (y < -60 || x < -60 || x > ADO_W + 60 || burn <= 0 || d > bl + 40) { if (t > 0.5) f.gone = true; continue; } live = true;
    const sz = f.up ? 5 : Math.max(4, 26 * 300 / (300 + d)), L = Math.min(d, sz * 7);
    // (its smoke lit by its flame just behind it, fading back along its way in five steps; then the flame, its long
    // axis along its way, an orange glow round a hot heart)
    c.strokeStyle = '#ffcf98'; c.lineCap = 'round';
    for (let i = 0; i < 5; i++) { c.globalAlpha = 0.5 * burn * (1 - i / 5); c.lineWidth = Math.max(1.2, sz * (0.34 - i * 0.04)); c.beginPath(); c.moveTo(x - ax * L * i / 5, y - ay * L * i / 5); c.lineTo(x - ax * L * (i + 1) / 5, y - ay * L * (i + 1) / 5); c.stroke(); }
    c.save(); c.translate(x, y); c.rotate(Math.atan2(ay, ax) + Math.PI / 2); c.globalAlpha = burn;
    c.drawImage(adcGlowW, -sz * 1.6, -sz * 1.2, sz * 3.2, sz * 4.8); c.drawImage(adcGlow, -sz * 0.45, -sz * 0.45, sz * 0.9, sz * 0.9); c.restore();
    if (f.up && t < 1.5) { c.globalAlpha = 0.5 * (1 - t / 1.5); c.drawImage(adcGlow, ADO_UX - 60, ADO_UY - 40, 120, 80); }
  }
  // the kills it sees: a small flash, its embers falling
  for (const q of ADO.kx) {
    if (!q.on) continue; const t = now - q.t0; if (t > 2.2) { q.on = false; continue; } live = true;
    c.globalAlpha = t < 0.08 ? 1 : Math.max(0, 1 - t / 1.4); const g = q.r * (1 + 2 * Math.sqrt(t)); c.drawImage(adcGlow, q.x - g, q.y - g, 2 * g, 2 * g);
    c.globalAlpha = Math.max(0, 1 - t / 2.2); c.fillStyle = '#ffb070';
    for (let i = 0; i < 10; i++) { const a = i * 2.39996, dd = q.r * ADC_FRAG[i] * (0.5 + 2.5 * t); c.fillRect(q.x + Math.cos(a) * dd, q.y + Math.sin(a) * dd * 0.7 + 0.33 * q.r * t * t, 1.6, 1.6); }
  }
  c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  // (on every frame while a flame, a flash or a kill moves; a cloud alone, slow, some 20 times a second; still while paused)
  if (AD.paused) return;
  if (live || flash > 0.01) { adoKick(); return; } for (const q of ADO.sm) if (q.on) { if (!ADO.tmo) ADO.tmo = setTimeout(() => { ADO.tmo = 0; adoKick(); }, 50); return; }
}

/* ---- the sortie ---- */
function adaReset() {
  Object.assign(AD, { page: 'lnch', cam: 'tv', pol: 'wh', fov: 'n', rng: 50, az: 95, mode: 0, sys: 3, doc: 1, armed: false, hold: false, cram: true, msg: null, t: 0, zoom: null, cramRds: ADA_CRAM_RDS });
  AD.cur.b = 0; AD.cur.r = 50;
  AD.lnch = ADA_LNCH.map(([n, k, cap]) => ({ n, k, cap, left: cap }));
  adsReset(); AD.cue = ''; adcCue.hidden = true;
  AD.msgQ.length = 0; AD.simMax = 0; AD.camKill.t = -1e9; AD.camAt = 0; AD.hint = ''; AD.tabFirst = 0; AD.endAt = 0; adoReset(); AD.msgAt = 0; AD.msgHold = 1.6;
  // (the voice's queues emptied: a quit sortie's lines not heard at the next one's start)
  // (each net's free time kept: a line of the quit sortie still being said is not talked over by the new one's first)
  nets.ics.length = nets.fm.length = 0;
  for (const s of 'ABCDK') adcDirty(s);
}
function adaStart(mi) {
  missionId = mi.id; adaReset(); AD.day = mi.night === false;   // (the day mission: the television's sky and targets in colour)
  $('#ovStart').hidden = true; $('#ovEnd').hidden = true; menuBg();
  $('#nMapIn').replaceChildren(); $('#eBg').style.backgroundImage = '';
  if (S.soundPref !== false && !S.soundOn) setSound(true); else if (S.soundPref === false && S.soundOn) setSound(false);
  if (S.soundOn && !bankAd.d) loadRadio();   // (the voice, not loaded at boot with the sound off then)
  if (S.frozen) toggleFreeze();
  // (the sound back now, not at the next tick: the context suspended behind the menu, its first line had gone unheard)
  Snd.setAway(false);
  S.phase = 'play'; AD.on = true; AD.paused = false; adcEl.hidden = false; $('#adcPanel').hidden = true; $('#nMap').style.backgroundImage = '';
  adaSay('SYS', 'IAMD ONLINE, ALL SYSTEMS GREEN', 'المنظومة جاهزة، كل الأنظمة سليمة', false, ['a.online']);
  // (and the command on the radio, its warning and its orders, once the console is up)
  adaSay('CMD', 'ADC: AIR DEFENSE WARNING RED, WEAPONS TIGHT', 'قيادة الدفاع الجوي: إنذار دفاع جوي أحمر، الرمي مقيّد', true, ['q.start']);
  // (laid out and every display drawn now, at the press: not in the sortie's first frame)
  AD.zoom = null; adaLayout(); adcGrainMake();
  for (const k in ADC_DRAW) { AD.drawn[k] = AD.rev[k]; ADC_DRAW[k](); }
}
function adaStop() { if (ADO.on) adoClose(); AD.on = false; AD.paused = false; adcEl.hidden = true; AD.zoom = null; clearTimeout(AD.zt); AD.zt = 0; adcFrame.classList.remove('glide'); adaFree(); adaWake(); }
// each tick of a sortie: its time on (not while paused), and the displays whose state changed drawn again (paused too:
// a canvas resized under the pause, by a turn of the phone, is drawn again at once, not left blank till the resume)
function adaFrame(dt) {
  AD.inFrame = true;
  try {
    // (the air picture's step timed: its slowest this sortie kept, for the tests and the counter's reader)
    if (!AD.paused) { AD.t += dt; const t0 = performance.now(); adsTickSim(dt); const ms = performance.now() - t0; if (ms > AD.simMax) AD.simMax = ms; adaMsgNext(); adaCue();
      // (the tracking camera live at each tick while it is on a track or showing a kill)
      // (and once more at the first tick past a kill's flash: its end drawn, not left standing)
      if (dt > 0 && (!AD.zoom || AD.zoom === 'B') && (AD.hook || ADS.t - AD.camKill.t - dt < ADC_KT)) adcDirty('B');
      // (the first tick past a kill's end drawn whatever display is leant in on: its hint in the message window let go)
      else if (dt > 0 && ADS.t - AD.camKill.t >= ADC_KT && ADS.t - AD.camKill.t - dt < ADC_KT) adcDirty('B');
      adaEndCheck(); }
    // (not while the outside view covers them: drawn at the first tick after it closes)
    if (!ADO.on) for (const s in ADC_DRAW) if (AD.drawn[s] !== AD.rev[s]) { AD.drawn[s] = AD.rev[s]; ADC_DRAW[s](); }
  } finally { AD.inFrame = false; }
}
// The console's loop (frame() hands each callback here in this mode): in a sortie it is woken four times a second by
// the clock (the air picture's steps, the radars' looks once a second, the assist's flash), and at once by anything
// that changes a display (adcDirty).
// Behind the menu and paused it sleeps outright (woken by the sortie's start, the pause's end, the way back to the
// menu): the screen let sleep, and behind the menu the sound turned down. Paused, the sortie's time stands still.
// (an end card for this mode, when there is one, must wake it too: its veil is read here)
let adaLast = 0, adaTimer = 0, adaReq = 0;
function adaTick(now) {
  adaReq = 0; clearTimeout(adaTimer); adaTimer = 0;
  const veiled = BOOTING || !ovStartEl.hidden || !ovEndEl.hidden, live = AD.on && !veiled;
  // (paused: the sound turned down too, as behind the menu; the screen let sleep)
  Snd.setAway(veiled || AD.paused); keepAwake(live && !AD.paused);
  // (the time between ticks as it came, up to a second and a half: capped at the tick's own quarter, each quiet tick had lost a
  // few ms to the timer's slack, the sortie's clock some 2-7 % slow)
  // (none counted across a sleep: the first tick after the pause or the menu starts the time afresh)
  const run = live && !AD.paused, dt = run && adaLast ? Math.min(1.5, (now - adaLast) / 1000) : 0; adaLast = run ? now : 0;
  // (the next tick asked before the drawing: a drawing that threw does not stop the loop)
  // (a kill playing in the camera: the ticks some 30 a second till it is over, so the burst moves smoothly; else four)
  // (asked again after the step when a kill came in it: its flash's first tenths not left to the quarter second)
  const boom = () => ADS.t - AD.camKill.t < ADC_KT && !(AD.hook && AD.hook.th.alive) && !ADO.on && (!AD.zoom || AD.zoom === 'B'), b0 = boom();
  if (run) adaTimer = setTimeout(() => { adaTimer = 0; adaWake(); }, b0 ? 33 : 250);
  if (live) adaFrame(dt);
  if (run && !b0 && boom() && adaTimer) { clearTimeout(adaTimer); adaTimer = setTimeout(() => { adaTimer = 0; adaWake(); }, 33); }
  // (the counter's record: its interval not counted across a sleep, and its minute's save made here, the frame's own
  // after-frame message not sent in this mode)
  if (PERF.on) { if (!run) PERF.last = 0; perfTick(now, performance.now() - now); if (PF.saveDue) { PF.saveDue = false; perfSave(); } }
}
function adaWake() { if (!ADA || adaReq) return; clearTimeout(adaTimer); adaTimer = 0; adaReq = requestAnimationFrame(frame); }
// the pause: the sortie held (its time stands still), back to it or to the menu; the system's back opens and shuts it
// (paused, the assist's light held lit, not caught dark mid-flash)
// (the sound back before the resume's click: still away from the pause, it had gone unheard)
function adaPause(on) { AD.paused = on; if (!on && AD.outOn) setTimeout(adoKick, 0); $('#adcPanel').hidden = !on; adcCue.classList.add('lit'); if (!on) Snd.setAway(false); Snd.click(); adaWake(); }
function adaBack() { if (ADO.on && !AD.paused) { adoClose(); return true; } adaPause(!AD.paused); return true; }
$('#adcPause').addEventListener('click', () => adaPause(true));
$('#adcResume').addEventListener('click', () => adaPause(false));
$('#adcQuit').addEventListener('click', () => { Snd.setAway(false); Snd.click(); adaStop(); showMenu(); });
// the displays drawn again once a font they use is in (a canvas drawn before keeps its stand-in letters)
if (ADA && document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { if (AD.on) for (const k in ADC_DRAW) adcDirty(k); });
