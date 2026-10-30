const $ = s => document.querySelector(s);
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const lerpA = (a, b, t) => a + wrapA(b - a) * t;
const pad = (n, w) => String(Math.max(0, Math.round(n))).padStart(w, '0');

/* ===================== language ===================== */
// The whole game in Arabic or in English («ع | EN» in the menu's top bar, kept in saqr.lang; Arabic unless English was
// chosen), the choice made at load: changing it loads the page again. The aircraft's own displays are in English in
// both, as on the real ones. Lg(ar, en): the text in the language chosen. The page's own text carries its English in
// data-en (the element's whole content), data-en-label (its aria-label) and data-en-alt; in English a sublabel beside it
// that only says the same again in English (the «SIM» under «محاكاة») is hidden.
const LANG = (() => { try { return localStorage.getItem('saqr.lang') === 'en' ? 'en' : 'ar'; } catch (_) { return 'ar'; } })(), EN = LANG === 'en';
const Lg = (ar, en) => EN ? en : ar;
if (EN) {
  const app = $('#app'); app.dir = document.documentElement.dir = 'ltr'; app.lang = document.documentElement.lang = 'en'; app.classList.add('lang-en'); document.title = 'Saqr Al-Wadi';
  const same = (a, b) => a.textContent.trim().toLowerCase() === b.textContent.trim().toLowerCase();
  for (const e of document.querySelectorAll('[data-en]')) { e.innerHTML = e.dataset.en; const n = e.nextElementSibling; if (n && same(e, n)) n.hidden = true; }
  for (const e of document.querySelectorAll('[data-en-label]')) e.setAttribute('aria-label', e.dataset.enLabel);
  for (const e of document.querySelectorAll('[data-en-alt]')) e.alt = e.dataset.enAlt;
}
for (const b of document.querySelectorAll('#segLang button')) {
  b.classList.toggle('on', b.dataset.l === LANG);
  b.addEventListener('click', () => { if (b.dataset.l === LANG) return; try { localStorage.setItem('saqr.lang', b.dataset.l); } catch (_) {} location.reload(); });
}

/* ===================== maps ===================== */
// Each map: its base picture's size, where its tiles are, its road (put in by tools/build.py from data/), its far
// field, the colours of its distant ground and haze, and its two hover points. The map is chosen before the world is
// built: the menu stores the choice and reloads the page (the loading screen then loads that map).
const MAPS = __MAPS__;
// (the ZF-25 flies the theatre only: its ground runs 33 km round it, the other maps are 1.4 km across under a 5 km orbit)
const MAP_ID = (() => { let m = 'valley', ac = ''; try { m = localStorage.getItem('saqr.map') || m; ac = localStorage.getItem('saqr.ac') || ''; } catch (_) {} if (ac === 'f15' && MAPS.theater) return 'theater'; return MAPS[m] ? m : 'valley'; })();
const MAP = MAPS[MAP_ID];
// storage per map: the valley keeps its original keys
const mapKey = k => MAP_ID === 'valley' ? k : k + '.' + MAP_ID;
// a light guard against hand-editing the saved scores and campaign progress in the browser's storage: each guarded
// value is kept with a short checksum of itself and a fixed salt (key + '.k'). A value whose checksum is present but
// wrong is treated as not there; a value with no checksum (an older save) is accepted and gains one on the next save.
// It runs only on save and on the menu's load, so it adds nothing to the game loop. Not real security — the salt is
// in the page — only a stop to casual tampering.
const lsHash = s => { let h = 0x811c9dc5 >>> 0; s = 'sw.v1:' + s; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
function lsGet(k) { try { const v = localStorage.getItem(k); if (v == null) return null; const sig = localStorage.getItem(k + '.k'); return sig != null && sig !== lsHash(v) ? null : v; } catch (_) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); localStorage.setItem(k + '.k', lsHash(v)); } catch (_) {} }
// the aircraft: the HX-7 (the gunner in its front seat) or the ZF-25 (JET: the weapon systems officer in its back
// seat, src/f15sa.js). Like the map, chosen before the world is built: the menu stores it and loads again.
const JET = (() => { let a = 'ah64'; try { a = localStorage.getItem('saqr.ac') || a; } catch (_) {} return a === 'f15' && !!window.F15SA; })();
const CK_IMG = JET ? 'sprites/f15_' : 'sprites/cockpit_';

/* ===================== world constants ===================== */
const MPP = 0.85;                 // metres per map pixel (original image)
const W0 = MAP.w, H0 = MAP.h, TILE = 1024;
const PXM = 1 / MPP;              // map pixels per metre
const SUN = { x: 0.6, y: 0.8 };   // shadows fall to the lower right
const WIND = { x: 3.4 * PXM, y: -1.1 * PXM };
// where a boat may sail (tools/make_water.py: a quarter of the map's pixels, the shore kept off); none on a map with no sea
const WATER = { w: 0, h: 0, k: 0, a: null };
if (MAP.water) { const im = new Image(); im.onload = () => {
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d'); x.drawImage(im, 0, 0);
  const d = x.getImageData(0, 0, im.width, im.height).data, a = new Uint8Array(im.width * im.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4] > 127 ? 1 : 0;
  Object.assign(WATER, { w: im.width, h: im.height, k: im.width / W0, a, img: im });
}; im.src = MAP.water; }
const onWater = (x, y) => { if (!WATER.a) return false; const i = Math.floor(x * WATER.k), j = Math.floor(y * WATER.k); return i >= 0 && j >= 0 && i < WATER.w && j < WATER.h && WATER.a[j * WATER.w + i] === 1; };
// a boat's patrol: a circle through where it is, ahead along its heading, to whichever side it fits the water (the
// widest that does, some 250 m down to 45); its waypoints from the next one round back to the start
function boatLoop(x, y, h) {
  for (const R of [250, 180, 120, 70, 45]) for (const s of [1, -1]) {
    const r = R * PXM, cx = x + r * Math.cos(h + s * Math.PI / 2), cy = y + r * Math.sin(h + s * Math.PI / 2), a0 = Math.atan2(y - cy, x - cx);
    let ok = true;
    for (let k = 1; k < 24 && ok; k++) { const a = a0 + s * k * Math.PI / 12; ok = onWater(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
    if (!ok) continue;
    const path = [[x, y]];
    for (let k = 1; k < 12; k++) { const a = a0 + s * k * Math.PI / 6; path.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); }
    return { cx, cy, r, path };
  }
  return null;
}

/* ===================== road ===================== */
const ROAD = MAP.road;
const RN = ROAD.length / 2;
const RX = new Float32Array(RN), RY = new Float32Array(RN), RS = new Float32Array(RN);
for (let i = 0; i < RN; i++) { RX[i] = ROAD[2 * i]; RY[i] = ROAD[2 * i + 1]; if (i) RS[i] = RS[i - 1] + Math.hypot(RX[i] - RX[i - 1], RY[i] - RY[i - 1]) * MPP; }
const ROAD_LEN = RS[RN - 1];
const _rp = { x: 0, y: 0 };
function roadIdx(s) { let lo = 0, hi = RN - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (RS[m] <= s) lo = m; else hi = m; } return lo; }
function roadAt(s, out) {
  out = out || _rp; s = clamp(s, 0, ROAD_LEN);
  const i = Math.min(roadIdx(s), RN - 2), t = (s - RS[i]) / Math.max(1e-6, RS[i + 1] - RS[i]);
  out.x = lerp(RX[i], RX[i + 1], t); out.y = lerp(RY[i], RY[i + 1], t); return out;
}
const _ra = { x: 0, y: 0 }, _rb = { x: 0, y: 0 };
// (sampled inside the road: past its ends the two points would meet and read as a hairpin)
function roadHeading(s) { s = clamp(s, 2, ROAD_LEN - 2); roadAt(s - 2, _ra); roadAt(s + 2, _rb); return Math.atan2(_rb.y - _ra.y, _rb.x - _ra.x); }
function roadCurv(s) { return Math.abs(wrapA(roadHeading(s + 4) - roadHeading(s - 4))) / 8; }
function projectRoad(x, y, hint) {
  let best = 1e9, bi = hint, bt = 0;
  const lo = Math.max(0, hint - 40), hi = Math.min(RN - 2, hint + 40);
  for (let i = lo; i <= hi; i++) {
    const ax = RX[i], ay = RY[i], dx = RX[i + 1] - ax, dy = RY[i + 1] - ay, L2 = dx * dx + dy * dy || 1;
    const t = clamp(((x - ax) * dx + (y - ay) * dy) / L2, 0, 1);
    const ex = ax + dx * t - x, ey = ay + dy * t - y, d = ex * ex + ey * ey;
    if (d < best) { best = d; bi = i; bt = t; }
  }
  return { idx: bi, s: lerp(RS[bi], RS[bi + 1], bt) };
}

