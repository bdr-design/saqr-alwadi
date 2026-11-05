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
  page: 'lnch', cam: 'ir', pol: 'wh', fov: 'w', rng: 100, az: 95, mode: 0, sys: 3, doc: 1, armed: false, hold: false, cram: true,
  cur: { b: 0, r: 50 }, msg: null, msgQ: [], msgAt: 0, t: 0, hook: null, cue: '', cueN: 0, inFrame: false,
  lnch: [],
};
const ADA_RNG = [25, 50, 100, 200], ADA_MODE = ['SURV', 'TBM'], ADA_SYS = ['UPR', 'LWR', 'CRAM', 'AUTO'], ADA_DOC = ['S', 'SS', 'SLS'];
// the battery's launchers: two of the upper tier (8 each), four of the lower (the blast-fragmentation round 4 a
// launcher, the hit-to-kill 12), and the close-in gun's magazine (1,550 rounds)
const ADA_LNCH = [['U1', 'UPR', 8], ['U2', 'UPR', 8], ['P1', 'GEM', 4], ['P2', 'MSE', 12], ['P3', 'MSE', 12], ['P4', 'GEM', 4]];
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
  // (five rings: a whole number of km at every range, 5 to 40)
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
  ADC_LAB.length = 0;
  if (AD.hook) adcTrack(AD.hook, at, cx, cy, R, R0);
  for (const tr of ADS.tr) if (tr !== AD.hook) adcTrack(tr, at, cx, cy, R, R0);
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
    adT(m.src, 78, h - MSG + 17, m.src === 'SYS' ? ADC_Y : m.src === 'CAP' ? ADC_B : ADC_W, ADC_FS.small, 'left', false, 700);
    // (fitted to the window's width: a long line set smaller, to the edge, never past it)
    { c.font = '600 ' + ADC_FS.body + 'px ' + FONT_MONO; const room = w - ADC_PAD - 122, tw = c.measureText(m.en).width;
      adT(m.en, 122, h - MSG + 17, ADC_W, tw > room ? ADC_FS.body * room / tw : ADC_FS.body); }
    adT(m.ar, w - ADC_PAD, h - 17, ADC_MUTE, ADC_FS.ar, 'right', true, 700);
  }
}
const ADC_LAB = [];   // (the air picture's labels placed so far: x, y, width; kept, not made each drawing)
const adcFree = (x, y, wl) => { const L = ADC_LAB; for (let i = 0; i < L.length; i += 3) if (Math.abs(L[i] - x) < (L[i + 2] + wl) / 2 + 2 && Math.abs(L[i + 1] - y) < 13) return false; L.push(x, y, wl); return true; };
const adcIdCol = id => id === 'HOS' ? ADC_R : id === 'SUS' ? ADC_O : id === 'FRD' ? ADC_B : ADC_Y;
function adcTrack(tr, at, cx, cy, R, R0) {
  const c = adcC, r = Math.hypot(tr.x, tr.y) / 1000, off = r > R, d = adOff(adBrg(tr.x, tr.y), AD.az), col = adcIdCol(tr.id);
  let [X, Y] = at(d, Math.min(r, R * 0.985));
  if (Y > cy - 2) Y = cy - 2;                                            // (behind the sector: along the foot)
  // (the course in the display's frame: east and north turned by the sector's azimuth)
  const a = AD.az * D2R, ex = tr.vx * Math.cos(a) - tr.vy * Math.sin(a), ny = tr.vx * Math.sin(a) + tr.vy * Math.cos(a), v = Math.hypot(ex, ny) || 1;
  const L = Math.min(60, Math.max(6, v * 60 / 1000 / R * R0));
  c.globalAlpha = tr.cst ? 0.45 : 1;
  c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); c.moveTo(X, Y - 3); c.lineTo(X + ex / v * L, Y - 3 - ny / v * L); c.stroke();
  adcSym(X, Y, tr.id, col);
  const lt = off ? tr.lbl + ' ' + Math.round(r) + 'KM' : tr.lbl, lw = lt.length * ADC_FS.small * 0.6, ly = Y - 12 < 50 ? Y + 14 : Y - 12;   // (under the symbol at the top edge)
  if (adcFree(X + 12 + lw / 2, ly, lw) || tr === AD.hook) adT(lt, X + 12, ly, col, ADC_FS.small);
  if (tr.pri) adT('P', X - 14, Y - 12, ADC_Y, ADC_FS.small, 'right');
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
// B: the tracking camera: thermal or day television, wide or narrow; on the hooked track (its picture comes with the
// outside view's world: for now its tracking data, live), with none it stands by
function adcCam() {
  const [, , w, h] = adcBegin('B'), ir = AD.cam === 'ir', ink = ir ? '#ffffff' : ADC_G, RX = w - 70, tr = AD.hook;
  adT(ir ? 'IR   ' + (AD.pol === 'wh' ? 'WHITE HOT' : 'BLACK HOT') : 'TV   DAY', ADC_PAD, 20, ink, ADC_FS.body);
  adT(AD.fov === 'w' ? 'WFOV  20°' : 'NFOV  2.1°', RX, 20, ink, ADC_FS.body, 'right');
  if (tr) {
    const r = Math.hypot(tr.x, tr.y), el = Math.atan2(tr.z, r) * 180 / Math.PI, cx = w / 2 - 30, cy = h / 2 - 6, c = adcC;
    c.strokeStyle = ink; c.lineWidth = 1.5;
    for (let i = 0; i < 8; i += 2) { const sx = ADC_CORN[i], sy = ADC_CORN[i + 1]; c.beginPath(); c.moveTo(cx + sx * 70, cy + sy * 28); c.lineTo(cx + sx * 70, cy + sy * 40); c.lineTo(cx + sx * 56, cy + sy * 40); c.stroke(); }
    c.beginPath(); c.moveTo(cx - 14, cy); c.lineTo(cx - 5, cy); c.moveTo(cx + 5, cy); c.lineTo(cx + 14, cy); c.moveTo(cx, cy - 14); c.lineTo(cx, cy - 5); c.moveTo(cx, cy + 5); c.lineTo(cx, cy + 14); c.stroke();
    adT('TN ' + tr.lbl + '   ' + tr.cls + '   ' + ADC_IDW[tr.id], ADC_PAD, h - 38, ink, ADC_FS.body);
    adT('RNG ' + (r / 1000).toFixed(1) + ' KM', ADC_PAD, h - 18, ink, ADC_FS.body);
    adT('AZ ' + adPad(Math.round(adBrg(tr.x, tr.y)) % 360, 3) + '   EL ' + (el >= 0 ? '+' : '') + el.toFixed(1), RX, h - 18, ink, ADC_FS.body, 'right');
    adT('SLEWED', RX, h - 38, ink, ADC_FS.body, 'right');
  } else {
    adT('VIDEO STANDBY', w / 2 - 30, h / 2 - 12, ADC_DIM, ADC_FS.head, 'center', false, 700);
    adT('لا يوجد هدف للتتبع', w / 2 - 30, h / 2 + 14, ADC_MUTE, ADC_FS.ar, 'center', true, 700);
    adT('NO TRACK', ADC_PAD, h - 20, ink, ADC_FS.body);
  }
  ['IR', 'TV', 'WFOV', 'NFOV', 'POL'].forEach((s, i) => adT(s, w - 8, ADC_RK[i] - ADC_SCR.B[1], (s === 'IR' && ir) || (s === 'TV' && !ir) || (s === 'WFOV' && AD.fov === 'w') || (s === 'NFOV' && AD.fov === 'n') ? ink : ADC_MUTE, ADC_FS.body, 'right'));
}
// C: the tracks, the most pressing first
function adcTracks() {
  const [, , w, h] = adcBegin('C'), c = adcC, T = ADS.tab; let nh = 0; for (const t of T) if (t.id === 'HOS') nh++;
  adcHead(w, 'TRACKS', T.length ? nh + ' HOS  ' + T.length + ' TRK' : '0 TRK', nh ? ADC_R : ADC_MUTE);
  const cols = [['TN', ADC_PAD, 'left'], ['CLS', 74, 'left'], ['RNG', 164, 'right'], ['TTI', 220, 'right'], ['ST', w - ADC_PAD, 'right']];
  for (const [s, x, a] of cols) adT(s, x, 52, ADC_DIM, ADC_FS.small, a);
  adRule(62, ADC_PAD, w - ADC_PAD);
  if (!T.length) { adT('NO TRACKS', w / 2, h / 2 + 22, ADC_DIM, ADC_FS.body, 'center'); return; }
  // six rows: the hooked one always among them (the rows scroll to it)
  const ROWS = 6, hi = T.indexOf(AD.hook), first = hi < ROWS ? 0 : hi - ROWS + 1;
  for (let i = first; i < Math.min(T.length, first + ROWS); i++) {
    const tr = T[i], y = 76 + (i - first) * 19, col = adcIdCol(tr.id), tti = tr.tti;
    if (tr === AD.hook) { c.fillStyle = 'rgba(233,242,234,0.14)'; c.fillRect(4, y - 9, w - 8, 18); }
    const st = tr.cst ? 'CST' : tr.id === 'FRD' ? (tr.iff === 'M5' ? 'M5' : 'LINK') : tr.id === 'SUS' ? 'SUS' : tr.iff === 'NR' && tr.id === 'UNK' ? 'NR' : tr.pri ? 'PRI' : tr.src;
    adT(tr.lbl, ADC_PAD, y, col, ADC_FS.body); adT(tr.cls, 74, y, col, ADC_FS.body);
    adT(String(Math.round(Math.hypot(tr.x, tr.y) / 1000)), 164, y, ADC_W, ADC_FS.body, 'right');
    adT(tti ? Math.floor(tti / 60) + ':' + adPad(tti % 60, 2) : '--', 220, y, tti && tti < 60 ? ADC_R : ADC_W, ADC_FS.body, 'right');
    adT(st, w - ADC_PAD, y, tr.pri ? ADC_Y : ADC_W, ADC_FS.body, 'right');
  }
}
// D: the launchers (each one's rounds, a cell a round) or the patrolling fighter's page; the console's settings under them
function adcLnch() {
  const [, , w, h] = adcBegin('D'), c = adcC;
  if (AD.page === 'cap') {
    adcHead(w, 'CAP', 'LINK STANDBY', ADC_MUTE);
    adT('NO FIGHTER ON STATION', w / 2, 90, ADC_DIM, ADC_FS.body, 'center');
    adT('لا توجد دورية مقاتلة', w / 2, 116, ADC_MUTE, ADC_FS.ar, 'center', true, 700);
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
  const st = [['SYS ' + ADA_SYS[AD.sys], ADC_W], ['DOC ' + ADA_DOC[AD.doc], ADC_W], [AD.armed ? 'ARMED' : 'SAFE', AD.armed ? ADC_Y : ADC_MUTE], [AD.hold ? 'HOLD FIRE' : '', ADC_R]];
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
// The message window: one line at a time (the voice will say each in turn). A press's answer shown at once; the air
// picture's own (new tracks, impacts) queued, each held at least 1.6 s, so three born in one look are all read; the
// queue kept short (its oldest let go past four)
function adaSay(src, en, ar, queued) {
  const m = { src, en, ar };
  if (queued && AD.msg && (AD.t - AD.msgAt < 1.6 || AD.msgQ.length)) { AD.msgQ.push(m); if (AD.msgQ.length > 4) AD.msgQ.shift(); return; }
  AD.msg = m; AD.msgAt = AD.t; adcDirty('A');
}
function adaMsgNext() { if (AD.msgQ.length && AD.t - AD.msgAt >= 1.6) { AD.msg = AD.msgQ.shift(); AD.msgAt = AD.t; adcDirty('A'); } }
// the controls: [x, y, radius, what it does, its name (the assist's cue)] in photo px; the radius about half the gap to the next control
const ADC_CTL = [
  // the air picture's keys
  [382, ADC_LK[0], 25, () => { AD.rng = ADA_RNG[Math.min(ADA_RNG.length - 1, ADA_RNG.indexOf(AD.rng) + 1)]; AD.cur.r = Math.min(AD.cur.r, AD.rng); adcDirty('A'); }, 'RNG+'],
  [382, ADC_LK[1], 25, () => { AD.rng = ADA_RNG[Math.max(0, ADA_RNG.indexOf(AD.rng) - 1)]; AD.cur.r = Math.min(AD.cur.r, AD.rng); adcDirty('A'); }, 'RNG-'],
  [382, ADC_LK[2], 25, () => { AD.az = (AD.az + 350) % 360; adcDirty('A'); }, 'AZ<'],
  [382, ADC_LK[3], 25, () => { AD.az = (AD.az + 10) % 360; adcDirty('A'); }, 'AZ>'],
  [382, ADC_LK[4], 25, () => { AD.mode = (AD.mode + 1) % ADA_MODE.length; adaSay('SYS', 'RADAR MODE ' + (AD.mode ? 'BALLISTIC SEARCH' : 'SURVEILLANCE'), AD.mode ? 'الرادار في وضع البحث عن الباليستي' : 'الرادار في وضع المراقبة'); }, 'MODE'],
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
  [ADC_RG[2][0], ADC_RG[2][1], 26, () => adaSay('SYS', 'ALL LAUNCHERS FULL', 'كل القواذف ممتلئة'), 'RLD'],
  [ADC_RG[3][0], ADC_RG[3][1], 26, () => adaSay('SYS', 'BIT PASSED, ALL SYSTEMS GREEN', 'الفحص الذاتي سليم، كل الأنظمة جاهزة'), 'BIT'],
  [ADC_RG[4][0], ADC_RG[4][1], 26, () => { AD.cram = true; adcDirty('D'); adcDirty('K'); adaSay('SYS', 'CLOSE-IN GUN AUTO', 'المدفع القريب على الوضع التلقائي'); }, 'GUNAUTO'],
  [ADC_RG[5][0], ADC_RG[5][1], 26, () => { AD.cram = false; adcDirty('D'); adcDirty('K'); adaSay('SYS', 'CLOSE-IN GUN HOLD', 'المدفع القريب موقوف'); }, 'GUNHOLD'],
  // the desk: hold fire, the system knob, the doctrine knob
  [465, 712, 40, () => { AD.hold = !AD.hold; adcDirty('D'); adcDirty('K'); adaSay('SYS', AD.hold ? 'HOLD FIRE, ALL UNITS' : 'HOLD FIRE CLEARED', AD.hold ? 'إيقاف الرمي لكل الوحدات' : 'رُفع إيقاف الرمي'); }, 'HOLDFIRE'],
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
  [1147, 725, 27, () => adaSay('SYS', 'OUTSIDE CAMERA NOT READY', 'الكاميرا الخارجية غير جاهزة'), 'OUTSIDE'],
  // master arm (the guarded toggle) and engage (under its cover)
  [1238, 708, 36, () => { AD.armed = !AD.armed; adcDirty('D'); adcDirty('K'); adaSay('SYS', AD.armed ? 'MASTER ARM ON' : 'MASTER ARM SAFE', AD.armed ? 'التسليح مفعّل' : 'التسليح موقوف'); }, 'ARM'],
  [1381, 727, 38, () => adsEngage(), 'ENGAGE'],
];
const ADC_BY = Object.fromEntries(ADC_CTL.map(c => [c[4], c]));
// The assist (the menu's setting, as in the aircraft): the next step's control lit, a soft amber light round it that
// flashes on the console's tick (a class), moved only when the step changes (07c-adsim.js adsCue)
function adaCue() {
  const k = S.assist ? adsCue() : '';
  // (the flash on the tick's own beat: lit two ticks of every three, about half a second of each 0.75, the class only
  // written when it turns; no CSS animation keeping the compositor awake between ticks)
  AD.cueN = (AD.cueN + 1) % 3; if (!adcCue.hidden) adcCue.classList.toggle('lit', AD.cueN !== 2);
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
  const q = local(e), x = (q.x - AD.ox) / AD.k, y = (q.y - AD.oy) / AD.k;
  // the control nearest within its reach
  let best = null, bd = Infinity;
  for (const ct of ADC_CTL) { const d = Math.hypot(x - ct[0], y - ct[1]); if (d < ct[2] && d < bd) { bd = d; best = ct; } }
  if (best) { adaPressAt(best[0], best[1]); best[3](); return; }
  // a second touch on a display: lean in on it (and out again from anywhere)
  const now = performance.now();
  if (AD.zoom) { if (now - AD.tapAt < 350 && AD.tapS === '*') { AD.tapAt = 0; adaZoom(null); } else { AD.tapAt = now; AD.tapS = '*'; } return; }
  const s = Object.keys(ADC_SCR).find(k => { const r = ADC_SCR[k]; return x > r[0] && x < r[0] + r[2] && y > r[1] && y < r[1] + r[3]; });
  if (s && now - AD.tapAt < 350 && AD.tapS === s) { AD.tapAt = 0; adaZoom(s); } else { AD.tapAt = now; AD.tapS = s || ''; }
});

/* ---- the sortie ---- */
function adaReset() {
  Object.assign(AD, { page: 'lnch', cam: 'ir', pol: 'wh', fov: 'w', rng: 100, az: 95, mode: 0, sys: 3, doc: 1, armed: false, hold: false, cram: true, msg: null, t: 0, zoom: null, cramRds: ADA_CRAM_RDS });
  AD.cur.b = 0; AD.cur.r = 50;
  AD.lnch = ADA_LNCH.map(([n, k, cap]) => ({ n, k, cap, left: cap }));
  adsReset(); AD.cue = ''; adcCue.hidden = true;
  AD.msgQ.length = 0; AD.msgAt = 0;
  for (const s of 'ABCDK') adcDirty(s);
}
function adaStart(mi) {
  missionId = mi.id; adaReset();
  $('#ovStart').hidden = true; $('#ovEnd').hidden = true; menuBg();
  $('#nMapIn').replaceChildren(); $('#eBg').style.backgroundImage = '';
  if (S.soundPref !== false && !S.soundOn) setSound(true); else if (S.soundPref === false && S.soundOn) setSound(false);
  if (S.frozen) toggleFreeze();
  S.phase = 'play'; AD.on = true; AD.paused = false; adcEl.hidden = false; $('#adcPanel').hidden = true; $('#nMap').style.backgroundImage = '';
  adaSay('SYS', 'IAMD ONLINE, ALL SYSTEMS GREEN', 'المنظومة جاهزة، كل الأنظمة سليمة');
  // (laid out and every display drawn now, at the press: not in the sortie's first frame)
  AD.zoom = null; adaLayout();
  for (const k in ADC_DRAW) { AD.drawn[k] = AD.rev[k]; ADC_DRAW[k](); }
}
function adaStop() { AD.on = false; AD.paused = false; adcEl.hidden = true; AD.zoom = null; clearTimeout(AD.zt); AD.zt = 0; adcFrame.classList.remove('glide'); adaFree(); adaWake(); }
// each tick of a sortie: its time on (not while paused), and the displays whose state changed drawn again (paused too:
// a canvas resized under the pause, by a turn of the phone, is drawn again at once, not left blank till the resume)
function adaFrame(dt) {
  AD.inFrame = true;
  try {
    if (!AD.paused) { AD.t += dt; adsTickSim(dt); adaMsgNext(); adaCue(); }
    for (const s in ADC_DRAW) if (AD.drawn[s] !== AD.rev[s]) { AD.drawn[s] = AD.rev[s]; ADC_DRAW[s](); }
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
  Snd.setAway(veiled); keepAwake(live && !AD.paused);
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
function adaPause(on) { AD.paused = on; $('#adcPanel').hidden = !on; adcCue.classList.add('lit'); Snd.click(); adaWake(); }
function adaBack() { adaPause(!AD.paused); return true; }
$('#adcPause').addEventListener('click', () => adaPause(true));
$('#adcResume').addEventListener('click', () => adaPause(false));
$('#adcQuit').addEventListener('click', () => { Snd.click(); adaStop(); showMenu(); });
// the displays drawn again once a font they use is in (a canvas drawn before keeps its stand-in letters)
if (ADA && document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', () => { if (AD.on) for (const k in ADC_DRAW) adcDirty(k); });
