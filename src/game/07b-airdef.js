/* ===================== air defence: the operator's console ===================== */
// The third mode (ADA, 01-core.js; docs/AIR_DEFENSE.md): the player is the operator of an integrated air and missile
// defence centre guarding the air base, in a shut shelter. Everything is done with the console's own controls, drawn
// in its photograph (sprites/console.webp, tools/make_airdef.py): no touch on the displays. Its four displays are
// canvases under the photograph's keyed openings, drawn here only when what they show has changed (a revision count
// each, not a key string built every frame). Behind the menu and in a sortie the world is not stepped or drawn in this
// mode (frame(), 13-main.js): only the console, so nothing else runs.
// (this file sits before 08-ui.js and 10-mission.js: the menu counts its missions as it is built, and they are the
// mode's list there)

// the mode's missions (the menu's cards; the sortie itself is adaStart's)
const ADA_AT = MAP.airbase ? [MAP.airbase.rect[0] + MAP.airbase.rect[2] / 2, MAP.airbase.rect[1] + MAP.airbase.rect[3] / 2] : [MAP.w / 2, MAP.h / 2];
const ADA_MISSIONS = [
  { id: 'ada_night', ar: 'ليلة الاعتراض', en: 'NIGHT OF INTERCEPTS', night: true, ada: true, at: ADA_AT,
    desc: 'هجوم ليلي على القاعدة: مسيّرات، ثم صواريخ كروز، ثم باليستي. وزّع كل هدف على منظومته، وتأكد من الصديق قبل أي رمي.',
    desc_en: 'A night attack on the base: drones, then cruise missiles, then ballistic missiles. Give each target to its system, and make sure of friends before you fire.' },
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
  page: 'lnch', cam: 'ir', pol: 'wh', fov: 'n', rng: 50, az: 95, mode: 0, sys: 3, doc: 1, armed: false, hold: false, cram: true,
  cur: { b: 0, r: 50 }, msg: null, msgQ: [], simMax: 0, tabFirst: 0, tabRows: 6, outOn: false, endAt: 0, endT: 0, camKill: { t: -1e9, lbl: '', cls: '', kc: '', imp: false, x: 0, y: 0, z: 0 }, msgAt: 0, msgHold: 1.6, t: 0, hook: null, cue: '', cueN: 0, inFrame: false,
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
  const m = AD.msg;
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
const ADC_CORN = [-1, -1, 1, -1, 1, 1, -1, 1], ADC_IDW = { HOS: 'HOSTILE', SUS: 'SUSPECT', UNK: 'UNKNOWN', FRD: 'FRIEND' };
// The tracking camera's pictures of the threats (sprites/ada_sky.webp, tools/make_airdef.py sky; from the owner's sky
// sheet): eight in a row of 256 px cells (the drone from above, the side, diving, the front; the cruise missile from
// above and the side; the reentry vehicle; the interceptor), the rows day television, thermal white hot, black hot. Each
// one's length (m) along its picture's longest side, and its picture's size in its cell (px)
const ADC_SKY = ADA ? new Image() : null;
const ADC_FRAG = [0.9, 1.4, 0.6, 1.8, 1.1, 0.7, 1.6, 1.2, 0.5, 1.9, 1.0, 1.3, 0.8, 1.5];   // (the kill's fragments' speeds, their own)
const ADC_SKYL = [3.5, 3.5, 3.5, 2.5, 6, 6, 2.5, 5], ADC_SKYS = [[206, 240], [240, 77], [240, 226], [240, 87], [146, 240], [240, 49], [175, 240], [240, 45]];
// its reach at night on targets this small (m): the thermal's, the day television's (in the dark, little)
// its reach at night by what it looks at (m): the thermal's (a drone's small engine, a cruise missile's hot turbojet,
// the reentry vehicle glowing, an aircraft), the television's (in the dark only what glows, or close)
// (the television a low-light one, as such trackers carry: at night a drone a dark shape to some 3 km)
const ADC_CAMR = { ir: { UAV: 12e3, CM: 18e3, TBM: 45e3, ACFT: 30e3, CAP: 30e3 }, tv: { UAV: 3e3, CM: 4e3, TBM: 45e3, ACFT: 10e3, CAP: 10e3 } };
// (what it is, from the thing itself: the camera sees the object, not the track's class, which comes a few looks later)
const ADC_KC = { uav: 'UAV', cm: 'CM', tbm: 'TBM' }, adcKind = o => ADC_KC[o.k] || 'ACFT';
const adcReach = kc => ADC_CAMR[AD.cam][kc];
// the camera's ground: the skyline's haze, then the ground from the hills down, darkening, for white hot, black hot,
// the television (each: haze, and four bands); the far hills' line (px above the horizon, across the picture)
const ADC_GND = [['#4a4d50', '#3d3f41', '#38393b', '#333435', '#2e2f30'], ['#b8bbbd', '#a6a9ab', '#acafb1', '#b3b5b7', '#b9bbbd'], ['#6a737b', '#262b2f', '#202427', '#1b1e21', '#16191b']];
const ADC_RIDGE = [3, 5, 4, 8, 11, 9, 6, 7, 12, 15, 13, 9, 7, 5, 6, 9, 8, 5, 3, 4, 6, 5, 3, 2, 4];
// the field of view (rad): wide, narrow
const ADC_FOV = { w: 20 * Math.PI / 180, n: 0.4 * Math.PI / 180 };   // (D2R is 07c's, not yet made here)
// the sensor's fixed-pattern grain (a small tile) and a soft round glow (the kill's flash, the reentry vehicle's
// bloom), made once at the first sortie's start; the grain's pattern and the pictures put on B's canvas there too
// (nothing built or first uploaded mid-sortie)
let adcGrain = null, adcGrainPat = null, adcGlow = null, adcGlowW = null, adcGlowK = null;
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
  }
  const c = ADC_CV.B.getContext('2d'); if (!adcGrainPat) adcGrainPat = c.createPattern(adcGrain, 'repeat');
  // (the pictures drawn once, small, onto B as it is sized: their first upload and their scaled-down copies made at the
  // start, not at the first hook; then cleared)
  if (ADC_SKY.complete && ADC_SKY.naturalWidth && ADC_CV.B.width) { c.setTransform(1, 0, 0, 1, 0, 0); for (let i = 0; i < 3; i++) c.drawImage(ADC_SKY, 0, i * 256, 2048, 256, 0, 0, 2048 * 0.04 * (i + 1), 256 * 0.04 * (i + 1)); c.drawImage(adcGlow, 0, 0, 8, 8);
    for (const i of Object.values(ADO_IMG)) if (i.naturalWidth) c.drawImage(i, 0, 0, i.naturalWidth, i.naturalHeight, 0, 0, 40, 20);
    c.clearRect(0, 0, 300, 40); }
}
// the picture: the night sky and, below the horizon where the camera's elevation puts it, the ground; the grain; the
// target where the tracker holds it (the reticle's middle, a pixel's wander), as big as its size and range make it in
// this field of view: a hot point when it is too small to see its shape; its picture by how it is seen (from the side
// as it crosses, foreshortened as it turns toward or away, the drone's front head on and its dive, from below when
// overhead; the reentry vehicle nose along its fall). Its half size on the picture (the tracker's gate fits it), or 0
// when it is beyond the camera's reach
function adcCamView(tr, w, h, ir, X, Y, Z) { const c = adcC; c.save(); c.beginPath(); c.rect(0, 0, w, h); c.clip(); const r = adcCamPic(tr, w, h, ir, X, Y, Z); c.restore(); return r; }
function adcCamPic(tr, w, h, ir, X, Y, Z) {
  // (the picture the whole screen: the bezel keys' names written over its right edge)
  const c = adcC, VW = w, wh = AD.pol === 'wh', cx = w / 2, cy = h / 2 - 6;
  const r3 = Math.hypot(X, Y, Z) || 1, rh = Math.hypot(X, Y), el = Math.atan2(Z, rh), px = VW / ADC_FOV[AD.fov];
  // (the low-light television: the night sky's glow a grey it shows bright, a target a dark shape against it)
  c.fillStyle = ir ? (wh ? '#1b1d20' : '#d2d5d7') : '#4a535b'; c.fillRect(0, 0, VW, h);
  // (the ground below the horizon where the target's elevation puts it: the far hills' ragged line, the sky's haze over
  // the skyline, the ground darkening toward the picture's foot in bands; not a flat block)
  const yH = cy + el * px;
  if (yH < h + 26) {
    // (the haze soft-topped, three thin layers; the hills fixed to the bearing, sliding by as the camera turns)
    const G = ADC_GND[ir ? (wh ? 0 : 1) : 2], N = ADC_RIDGE.length - 1, ox = ((Math.atan2(X, Y) * px) % VW + VW) % VW;
    c.fillStyle = G[0]; c.globalAlpha = 0.15; c.fillRect(0, yH - 26, VW, 26); c.fillRect(0, yH - 17, VW, 17); c.fillRect(0, yH - 9, VW, 9); c.globalAlpha = 1;
    // (its points at the ridge's own places, slid by the bearing: the peaks keep their heights as they pass)
    const st = VW / N, j0 = Math.floor(ox / st);
    c.fillStyle = G[1]; c.beginPath(); c.moveTo(-st, h);
    for (let j = j0 - 1; j <= j0 + N + 1; j++) c.lineTo(j * st - ox, yH - ADC_RIDGE[((j % N) + N) % N]);
    c.lineTo(VW + st, h); c.closePath(); c.fill();
    for (let i = 1; i < 4; i++) { const y = yH + (h - yH) * i / 4; if (y < h) { c.fillStyle = G[1 + i]; c.fillRect(0, y, VW, h - y); } }
  }
  c.fillStyle = adcGrainPat; c.fillRect(0, 0, VW, h);
  if (!tr) return 4;
  const kc = adcKind(tr.th), reach = adcReach(kc); if (r3 > reach) return 0;
  // (a point's heat fading with range: faint near the reach's end)
  const fade = Math.min(1, Math.max(0.35, 1.5 - r3 / reach));
  const jx = cx + (Math.random() - 0.5), jy = cy + (Math.random() - 0.5), row = ir ? (wh ? 1 : 2) : 0;
  const b = Math.atan2(X, Y), v = Math.hypot(tr.vx, tr.vy, tr.vz) || 1, along = (tr.vx * X + tr.vy * Y + tr.vz * Z) / r3 / v;
  const sx = tr.vx * Math.cos(b) - tr.vy * Math.sin(b), sy = -(tr.vz * Math.cos(el) - (tr.vx * Math.sin(b) + tr.vy * Math.cos(b)) * Math.sin(el));
  const fs = Math.max(0.3, Math.sqrt(Math.max(0, 1 - along * along)));
  let k = -1, rot = 0, flip = sx > 0, fx = 1;
  if (kc === 'TBM') { k = 6; flip = false; rot = Math.atan2(sy, sx) - Math.atan2(100, -70); }
  else if (kc === 'UAV') { if (el > 1.05) k = 0, flip = false; else if (tr.vz < -15) k = 2; else if (Math.abs(along) > 0.85) k = 3, flip = false; else k = 1, fx = fs; }
  else if (kc === 'CM') { if (el > 1.05) k = 4, flip = false; else k = 5, fx = fs; }
  const hot = ir ? (wh ? '#ffffff' : '#000000') : k === 6 ? '#e8f0f4' : '#1c2024';   // (the television: a dark point on the sky's glow; the reentry vehicle glowing)
  // (the reentry vehicle glowing from its heat: a bloom round it, white in both cameras)
  if (k === 6 && ADC_SKY.naturalWidth) { const g = Math.max(10, ADC_SKYL[6] / r3 * px * 2.2); c.globalAlpha = 0.7 * fade; c.drawImage(adcGlow, jx - g, jy - g, 2 * g, 2 * g); c.globalAlpha = 1; }
  if (k < 0) {   // (an aircraft: no picture of it; its hot engines, two points, a dim body between, its span some 30 m)
    const s = Math.max(1.5, 30 / r3 * px / 2); c.fillStyle = hot; c.globalAlpha = 0.35; c.fillRect(jx - s, jy - s * 0.12, s * 2, s * 0.24); c.globalAlpha = 1;
    c.beginPath(); c.arc(jx - s * 0.3, jy, Math.max(1.2, s * 0.08), 0, 6.283); c.arc(jx + s * 0.3, jy, Math.max(1.2, s * 0.08), 0, 6.283); c.fill();
    return s;
  }
  if (!ADC_SKY.naturalWidth) return 4;   // (its pictures not loaded: the gate held, nothing drawn)
  const [sw, sh] = ADC_SKYS[k], sc = ADC_SKYL[k] / r3 * px / Math.max(sw, sh);
  // (too small for its shape: its heat a point, with the optics' little bloom round it)
  if (sc * Math.max(sw, sh) < 5) { c.fillStyle = hot; c.globalAlpha = 0.3 * fade; c.beginPath(); c.arc(jx, jy, 4.5, 0, 6.283); c.fill(); c.globalAlpha = fade; c.beginPath(); c.arc(jx, jy, 2.2, 0, 6.283); c.fill(); c.globalAlpha = 1; return 4; }
  c.save(); c.translate(jx, jy); c.rotate(rot); c.scale((flip ? -sc : sc) * fx, sc);
  c.drawImage(ADC_SKY, k * 256 + ((256 - sw) >> 1), row * 256 + ((256 - sh) >> 1), sw, sh, -sw / 2, -sh / 2, sw, sh);
  c.restore();
  // (the drone seen from behind as it goes away: its pusher engine's heat in the middle; head on it is hidden)
  if (k === 3 && along > 0 && ir) { c.fillStyle = hot; c.beginPath(); c.arc(jx, jy - sh * sc * 0.08, Math.max(1.5, sw * sc * 0.06), 0, 6.283); c.fill(); }
  return Math.max(sw * sc * fx, sh * sc) / 2;
}
// B: the tracking camera: thermal or day television, wide or narrow (narrow at the start: on a track, its shape seen
// within some 25 km), on the hooked track (its picture live, drawn at
// each of the console's ticks while it is on one); a kill on it seen there a few seconds (its flash, its fragments);
// with none it stands by
function adcCam() {
  const [, , w, h] = adcBegin('B'), ir = AD.cam === 'ir', ink = ir ? (AD.pol === 'wh' ? '#ffffff' : '#101214') : ADC_G, RX = w - 84, ink2 = ir ? '#ffffff' : ADC_G, tr = AD.hook, K = AD.camKill, kt = ADS.t - K.t;
  if (tr) {
    const r = Math.hypot(tr.x, tr.y), el = Math.atan2(tr.z, r) * 180 / Math.PI, cx = w / 2, cy = h / 2 - 6, c = adcC;
    const seen = adcCamView(tr, w, h, ir, tr.x, tr.y, tr.z), gw = Math.min(150, Math.max(16, seen + 10)), gh = Math.min(110, gw);
    adT(ir ? 'IR   ' + (AD.pol === 'wh' ? 'WHITE HOT' : 'BLACK HOT') : 'TV', ADC_PAD, 20, ink, ADC_FS.body);
    adT(AD.fov === 'w' ? 'WFOV  20°' : 'NFOV  0.4°', RX, 20, ink, ADC_FS.body, 'right');
    // (beyond its reach: no gate, no cross, only the words, its reach for this target and the range)
    if (!seen) { adT('BEYOND CAMERA RANGE (' + Math.round(adcReach(adcKind(tr.th)) / 1000) + ' KM)', cx, cy - 14, ink, ADC_FS.body, 'center'); adT('الهدف أبعد من مدى الكاميرا (' + Math.round(adcReach(adcKind(tr.th)) / 1000) + ' كم)', cx, cy + 14, ink, ADC_FS.ar, 'center', true); }
    if (seen) {
      // (the tracker's gate: its corners round the target, fitted to its size; its cross outside the gate, so nothing
      // lies over what it holds)
      c.strokeStyle = ink; c.lineWidth = 1.5;
      const bw = gw, bh = gh, bt = Math.min(14, bw * 0.4);
      for (let i = 0; i < 8; i += 2) { const sx = ADC_CORN[i], sy = ADC_CORN[i + 1]; c.beginPath(); c.moveTo(cx + sx * bw, cy + sy * (bh - bt)); c.lineTo(cx + sx * bw, cy + sy * bh); c.lineTo(cx + sx * (bw - bt), cy + sy * bh); c.stroke(); }
      c.beginPath(); c.moveTo(cx - bw - 18, cy); c.lineTo(cx - bw - 6, cy); c.moveTo(cx + bw + 6, cy); c.lineTo(cx + bw + 18, cy); c.moveTo(cx, cy - bh - 16); c.lineTo(cx, cy - bh - 5); c.moveTo(cx, cy + bh + 5); c.lineTo(cx, cy + bh + 16);
      c.stroke();
    }
    adT('TN ' + tr.lbl + '   ' + tr.cls + '   ' + ADC_IDW[tr.id], ADC_PAD, h - 38, ink, ADC_FS.body);
    adT('RNG ' + (r / 1000).toFixed(1) + ' KM', ADC_PAD, h - 18, ink, ADC_FS.body);
    adT('AZ ' + adPad(Math.round(adBrg(tr.x, tr.y)) % 360, 3) + '   EL ' + (el >= 0 ? '+' : '') + el.toFixed(1), RX, h - 18, ink, ADC_FS.body, 'right');
    adT('SLEWED', RX, h - 38, ink, ADC_FS.body, 'right');
  } else if (kt >= 0 && kt < 2.5) {
    // (the kill on the hooked track: its flash swelling and fading, its fragments flying out and falling, where the
    // tracker held it)
    const c = adcC, cx = w / 2, cy = h / 2 - 6, f = kt / 2.5;
    adcCamView(null, w, h, ir, K.x, K.y, K.z);
    // (its fireball some 15 m across at its range in this field, swelling and fading to a warm cloud; its fragments at
    // speeds of their own, falling)
    const px = w / ADC_FOV[AD.fov], r3 = Math.hypot(K.x, K.y, K.z) || 1, R0 = Math.min(90, Math.max(8, 15 / r3 * px)), dark = ir && AD.pol !== 'wh', far = r3 > adcReach(K.kc);
    // (beyond the camera's reach: the result said, nothing seen)
    if (!far) {
      c.globalAlpha = f < 0.15 ? 1 : Math.max(0.25, 1 - f); const g = R0 * (0.6 + 1.4 * Math.sqrt(f));
      c.drawImage(dark ? adcGlowK : adcGlow, cx - g, cy - g, 2 * g, 2 * g);
      c.globalAlpha = Math.max(0, 1 - f * 1.2); c.fillStyle = dark ? '#000' : ir ? '#fff' : '#ffe1aa';
      for (let i = 0; i < 14; i++) { const a = i * 2.39996, d = R0 * ADC_FRAG[i] * (0.4 + 2.2 * f); c.fillRect(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.8 + 0.6 * R0 * f * f, 2.5, 2.5); }
      c.globalAlpha = 1;
    }
    adT(AD.fov === 'w' ? 'WFOV  20°' : 'NFOV  0.4°', RX, 20, ink, ADC_FS.body, 'right');
    adT(ir ? 'IR   ' + (AD.pol === 'wh' ? 'WHITE HOT' : 'BLACK HOT') : 'TV', ADC_PAD, 20, ink, ADC_FS.body);
    adT('TN ' + K.lbl + '   ' + K.cls + (K.imp ? '   IMPACT' : '   KILL'), ADC_PAD, h - 38, K.imp ? ADC_R : ink, ADC_FS.body);
    adT(K.imp ? 'سقط على القاعدة' : 'تم تدمير الهدف', ADC_PAD + 300, h - 18, K.imp ? ADC_R : ink, ADC_FS.ar, 'right', true);
  } else {
    adT(ir ? 'IR   ' + (AD.pol === 'wh' ? 'WHITE HOT' : 'BLACK HOT') : 'TV', ADC_PAD, 20, ADC_G, ADC_FS.body);
    adT(AD.fov === 'w' ? 'WFOV  20°' : 'NFOV  0.4°', RX, 20, ADC_G, ADC_FS.body, 'right');
    adT('VIDEO STANDBY', w / 2 - 30, h / 2 - 12, ADC_DIM, ADC_FS.head, 'center', false, 700);
    adT('لا يوجد هدف للتتبع', w / 2 - 30, h / 2 + 14, ADC_MUTE, ADC_FS.ar, 'center', true, 700);
    adT('NO TRACK', ADC_PAD, h - 20, ADC_G, ADC_FS.body);
  }
  // (the bezel keys' names over the picture's right edge: a small dark tab under each, so they read on any picture)
  if (tr || (kt >= 0 && kt < 2.5)) { adcC.fillStyle = 'rgba(4,8,11,0.6)'; for (let i = 0; i < 5; i++) { const y = ADC_RK[i] - ADC_SCR.B[1]; adcC.fillRect(w - (i === 2 || i === 3 ? 58 : i === 4 ? 40 : 34), y - 11, 60, 22); } }
  ['IR', 'TV', 'WFOV', 'NFOV', 'POL'].forEach((s, i) => adT(s, w - 8, ADC_RK[i] - ADC_SCR.B[1], (s === 'IR' && ir) || (s === 'TV' && !ir) || (s === 'WFOV' && AD.fov === 'w') || (s === 'NFOV' && AD.fov === 'n') ? ink2 : ADC_MUTE, ADC_FS.body, 'right'));
}
// C: the tracks, the most pressing first: its number, its identity in words and colour (HOS hostile red, SUS suspect
// orange, UNK unknown yellow, FRD friend blue), its class, range, time to the base, state
const ADC_COLS = [['TN', ADC_PAD, 'left'], ['ID', 70, 'left'], ['CLS', 110, 'left'], ['RNG', 186, 'right'], ['TTI', 236, 'right'], ['ST', -1, 'right']];
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
  [1147, 725, 27, () => adoOpen(), 'OUTSIDE'],
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
  // a second touch on a display: lean in on it (and out again from anywhere)
  const now = performance.now();
  if (AD.zoom) { if (now - AD.tapAt < 350 && AD.tapS === '*') { AD.tapAt = 0; adaZoom(null); } else { AD.tapAt = now; AD.tapS = '*'; } return; }
  const s = Object.keys(ADC_SCR).find(k => { const r = ADC_SCR[k]; return x > r[0] && x < r[0] + r[2] && y > r[1] && y < r[1] + r[3]; });
  if (s && now - AD.tapAt < 350 && AD.tapS === s) { AD.tapAt = 0; adaZoom(s); } else { AD.tapAt = now; AD.tapS = s || ''; }
});

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
// Once the attack is over (the plan run out, no hostile threat left flying, no interceptor in the air, no engagement
// waiting) the command stands the battery down (warning white, all clear) and some seconds on the end card comes up
// over the console: the night's result. The rating by what reached the base first, then by how cleanly it was done
// (interceptors spent per kill); the score kills, less base hits heavily, less the interceptors and the gun's rounds
function adaEndCheck() {
  if (AD.endAt) { if (AD.t >= AD.endAt && $('#ovEnd').hidden) adaEnd(); return; }
  if (ADS.plan.length || ADS.fly || ADS.eng.length || !ADS.nHost) return;
  for (const o of ADS.th) if (o.alive && (o.k === 'uav' || o.k === 'cm' || o.k === 'tbm')) return;
  AD.endAt = AD.t + 7; AD.endT = ADS.t;
  adsSay('CMD', 'ADC: AIR DEFENSE WARNING WHITE, ALL CLEAR', 'قيادة الدفاع الجوي: الإنذار أبيض، زال الخطر', ['q.clear'], 2);
  if (Snd.on && !Snd.idle && Snd.ctx) { Snd.beep(880, 0, 0.18, 0.05); Snd.beep(660, 0.25, 0.3, 0.05); }
}
function adaEnd() {
  if (ADO.on) adoClose();
  const n = ADS.nHost, k = ADS.kills, hits = ADS.hits, ints = AD.lnch.reduce((a, L) => a + L.cap - L.left, 0), rds = ADA_CRAM_RDS - AD.cramRds;
  const per = ints ? (ADS.mKills ? ints / ADS.mKills : Infinity) : k ? 0 : Infinity, rate = hits >= 3 ? ['فشل الدفاع', 'DEFENCE FAILED'] : hits ? ['اختراق محدود', 'LIMITED BREACH'] : per <= 1.2 ? ['دفاع محكم', 'AIRTIGHT'] : ['دفاع ناجح', 'SUCCESSFUL DEFENCE'];
  const score = Math.max(0, k * 100 - hits * 400 - ints * 10 - Math.round(rds / 50));
  const m = Math.floor(AD.endT / 60), s = Math.floor(AD.endT % 60);   // (the night's length to its all clear)
  // (the cards' six cells, their names this seat's)
  const cells = [['stKill', k + '/' + n, 'المدمَّرة', 'Destroyed'], ['stAcc', String(ints), 'صواريخ الاعتراض', 'Interceptors'], ['stCiv', String(hits), 'سقوط على القاعدة', 'Base hits'],
    ['stTime', pad(m, 2) + ':' + pad(s, 2), 'المدة', 'Time'], ['stShots', String(rds), 'طلقات المدفع', 'Gun rounds'], ['stEsc', String(Math.max(0, n - k - hits)), 'غير المحسومة', 'Unresolved']];
  for (const [id, v, ar, en] of cells) { const dd = $('#' + id); dd.textContent = v; dd.nextElementSibling.textContent = Lg(ar, en); }
  $('#stCiv').parentNode.classList.toggle('bad', hits > 0);
  $('#stRate').textContent = EN ? rate[1].charAt(0) + rate[1].slice(1).toLowerCase() : rate[0]; $('#stRateEn').textContent = EN ? 'SCORE' : rate[1]; $('#stScore').textContent = String(score);
  // (the Arabic count as it is said: one, two (the dual), three to ten (plural), eleven on (singular, accusative))
  const nAr = hits === 1 ? 'هدف واحد' : hits === 2 ? 'هدفان' : hits <= 10 ? hits + ' أهداف' : hits + ' هدفًا';
  $('#endText').textContent = hits ? Lg('سقط على القاعدة ' + nAr + '، ودُمّر ' + k + ' من ' + n + '.', hits + ' got through to the base; ' + k + ' of ' + n + ' destroyed.')
    : Lg('صدّت البطارية الهجوم كله: دُمّر ' + k + ' من ' + n + ' بلا سقوط على القاعدة.', 'The battery held the whole attack: ' + k + ' of ' + n + ' destroyed, nothing reached the base.');
  let best = {}; try { best = JSON.parse(lsGet(mapKey('saqr.best')) || '{}'); } catch (_) {}
  const isBest = score > (missionId in best ? best[missionId] : -1e9); if (isBest) { best[missionId] = score; lsSet(mapKey('saqr.best'), JSON.stringify(best)); }
  $('#stBest').textContent = isBest ? Lg('أفضل نتيجة لهذه المهمة', 'Best score for this mission') : Lg('أفضل نتيجة: ', 'Best score: ') + best[missionId];
  const mi = MISSIONS.find(q => q.id === missionId) || {}; $('#endTitle').textContent = Lg('انتهت الليلة · ', 'Night over · ') + mName(mi);
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
  Object.assign(AD, { page: 'lnch', cam: 'ir', pol: 'wh', fov: 'n', rng: 50, az: 95, mode: 0, sys: 3, doc: 1, armed: false, hold: false, cram: true, msg: null, t: 0, zoom: null, cramRds: ADA_CRAM_RDS });
  AD.cur.b = 0; AD.cur.r = 50;
  AD.lnch = ADA_LNCH.map(([n, k, cap]) => ({ n, k, cap, left: cap }));
  adsReset(); AD.cue = ''; adcCue.hidden = true;
  AD.msgQ.length = 0; AD.simMax = 0; AD.camKill.t = -1e9; AD.tabFirst = 0; AD.endAt = 0; adoReset(); AD.msgAt = 0; AD.msgHold = 1.6;
  // (the voice's queues emptied: a quit sortie's lines not heard at the next one's start)
  // (each net's free time kept: a line of the quit sortie still being said is not talked over by the new one's first)
  nets.ics.length = nets.fm.length = 0;
  for (const s of 'ABCDK') adcDirty(s);
}
function adaStart(mi) {
  missionId = mi.id; adaReset();
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
      if (dt > 0 && (!AD.zoom || AD.zoom === 'B') && (AD.hook || ADS.t - AD.camKill.t - dt < 2.5)) adcDirty('B');
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
  if (run) adaTimer = setTimeout(() => { adaTimer = 0; adaWake(); }, 250);
  if (live) adaFrame(dt);
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
