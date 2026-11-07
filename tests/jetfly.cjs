// The ZF-25 as the game flies it (src/game.src.html: jetPlace, jetOrbit, the TSD's ALT / SPD / RAD keys, the run-in
// at JET_LIM): the close-support load, 80 % fuel, ISA+15, light turbulence, the ground at 410 m. No browser:
// node tests/jetfly.cjs. Each line prints what was measured and the band a strike crew flies it in.
const F = require('../src/f15sa.js'), U = F.U, D2R = Math.PI / 180;
const fails = [], check = (what, v, lo, hi, unit) => {
  const ok = Number.isFinite(v) && v >= lo && v <= hi;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}: ${+v.toFixed(2)} ${unit || ''}  [${lo} .. ${hi}]`);
  if (!ok) fails.push(what);
};
const FT = U.FT, FPM = 1 / FT * 60, DT = 0.01, GROUND = 410;
// the game's settings (keep with src/game.src.html)
const CREW = { vs: 18, nzMin: 0.75 };   // JET_CREW
const ORBIT_LIM = Object.assign({ bank: 45 * D2R, roll: 30 * D2R, nz: 3 }, CREW), RUN_LIM = Object.assign({ bank: 60 * D2R, roll: 60 * D2R, nz: 4 }, CREW);
const ST = { RIN: 'TGP-9', W2A: 'AAM-S', W8A: 'AAM-S', LCFT1: 'LB-5', RCFT1: 'LB-5', LCFT2: 'LB-5', RCFT2: 'LB-5', LCFT3: 'GB-5', RCFT3: 'GB-5', W2: 'AGR-6', W8: 'AGR-6' };
function jet(hFt, kcas) {
  const ac = new F({ loadout: { cft: true, st: ST }, fuel: 0.8, groundAt: () => GROUND, turb: 1, seed: 7, dT: 15 });
  const h = hFt * FT, a = 0.7, R = 5000;
  ac.place({ n: Math.cos(a) * R, e: Math.sin(a) * R, h, V: F.tasFromCas(kcas * U.KT, F.atmos(h, 15)), psi: a - Math.PI / 2 });
  const P = new F.Pilot(ac);
  const orbit = (hFt2, kcas2, R2) => P.set('orbit', { c: { n: 0, e: 0 }, R: R2 || R, dir: -1, h: hFt2 * FT, kcas: kcas2 }, ORBIT_LIM);
  orbit(hFt, kcas);
  return { ac, P, orbit };
}
// fly for t seconds, recording
function fly(J, t, rec) { for (let i = 0; i < t / DT; i++) { J.P.fly(DT); rec && rec(J.ac.o, i * DT); } }

// ---- on station: 15,000 ft, 300 KCAS, the 5 km wheel
{
  const J = jet(15000, 300); fly(J, 60);
  let hMin = 1e9, hMax = -1e9, vMin = 1e9, vMax = -1e9, bMax = 0, nzMax = 0;
  fly(J, 180, o => { hMin = Math.min(hMin, o.h); hMax = Math.max(hMax, o.h); vMin = Math.min(vMin, o.kcas); vMax = Math.max(vMax, o.kcas); bMax = Math.max(bMax, Math.abs(o.phi)); nzMax = Math.max(nzMax, o.nz); });
  check('orbit 15,000 ft: height band', (hMax - hMin) / FT, 0, 150, 'ft');
  check('orbit: airspeed band', vMax - vMin, 0, 12, 'kt');
  check('orbit: bank', bMax / D2R, 25, 45, '°');
  check('orbit: g', nzMax, 1.1, 1.6, 'g');
  // (no published figure for an orbit at 40° of bank with this load: the model's cruise check is 7,350 lb/h clean at
  // M 0.85 and 30,000 ft; the turn's induced drag and the stores add to it. Some 2 h on station from a full jet)
  check('orbit: fuel flow', J.ac.eng.reduce((s, e) => s + e.ff, 0) * 3600 / U.LB, 6000, 11000, 'lb/h');
}
// ---- a new height on the ALT key: how fast and how cleanly
function heightChange(h0, h1) {
  const J = jet(h0, 300); fly(J, 40);
  J.orbit(h1, 300);
  let vsMax = 0, t50 = null, over = 0, vMin = 1e9, vMax = -1e9, thMax = 0, gMin = 9;
  const up = h1 > h0;
  fly(J, 400, (o, t) => {
    vsMax = Math.max(vsMax, Math.abs(o.vs)); vMin = Math.min(vMin, o.kcas); vMax = Math.max(vMax, o.kcas); thMax = Math.max(thMax, Math.abs(o.gamma)); gMin = Math.min(gMin, o.nz);
    const e = (o.h - h1 * FT) / FT;
    if (t50 == null && Math.abs(e) < 50) t50 = t;
    if (t50 != null) over = Math.max(over, up ? e : -e);
  });
  return { vsMax: vsMax * FPM, t50, over, dv: Math.max(300 - vMin, vMax - 300), path: thMax / D2R, gMin };
}
for (const [h0, h1, what] of [[15000, 20000, 'climb 15,000 → 20,000 ft'], [20000, 25000, 'climb 20,000 → 25,000 ft'], [25000, 15000, 'descent 25,000 → 15,000 ft'], [20000, 15000, 'descent 20,000 → 15,000 ft']]) {
  const r = heightChange(h0, h1), dh = Math.abs(h1 - h0);
  console.log(`  ${what}: ${Math.round(r.vsMax)} ft/min at most, there in ${r.t50 && r.t50.toFixed(0)} s, ${r.over.toFixed(0)} ft past, airspeed ±${r.dv.toFixed(0)} kt, path ${r.path.toFixed(1)}°, ${r.gMin.toFixed(2)} g least`);
  check(what + ': rate', r.vsMax, 1500, 4500, 'ft/min');
  check(what + ': time', r.t50 == null ? 1e9 : r.t50, dh / 4500 * 60, dh / 1500 * 60 + 30, 's');
  check(what + ': overshoot', r.over, 0, 100, 'ft');
  check(what + ': airspeed held', r.dv, 0, 15, 'kt');
  check(what + ': least g (no push over)', r.gMin, 0.6, 1.2, 'g');
}
// ---- a new airspeed on the SPD key
function speedChange(v0, v1) {
  const J = jet(15000, v0); fly(J, 40);
  J.P.tgt.kcas = v1;
  let t5 = null, over = 0, hMin = 1e9, hMax = -1e9, ab = 0;
  fly(J, 200, (o, t) => {
    hMin = Math.min(hMin, o.h); hMax = Math.max(hMax, o.h); ab = Math.max(ab, J.ac.eng[0].thr);
    const e = o.kcas - v1;
    if (t5 == null && Math.abs(e) < 5) t5 = t;
    if (t5 != null) over = Math.max(over, v1 > v0 ? e : -e);
  });
  return { t5, over, dh: (hMax - hMin) / FT, ab };
}
for (const [v0, v1] of [[300, 330], [330, 380], [380, 300]]) {
  const r = speedChange(v0, v1);
  console.log(`  speed ${v0} → ${v1} KCAS: there in ${r.t5 && r.t5.toFixed(0)} s, ${r.over.toFixed(1)} kt past, height band ${r.dh.toFixed(0)} ft, throttle ${r.ab.toFixed(2)}`);
  check(`speed ${v0} → ${v1}: time`, r.t5 == null ? 1e9 : r.t5, 3, v1 > v0 ? 90 : 60, 's');
  check(`speed ${v0} → ${v1}: overshoot`, r.over, 0, 6, 'kt');
  check(`speed ${v0} → ${v1}: height held`, r.dh, 0, 150, 'ft');
  check(`speed ${v0} → ${v1}: no afterburner`, r.ab, 0, 1, '');
}
// ---- the run-in turn: 60° off the orbit at the run's bank, then wings level
{
  const J = jet(15000, 300); fly(J, 60);
  const chi = J.ac.o.track + 60 * D2R;
  J.P.set('nav', { chi, h: 15000 * FT, kcas: 300 }, RUN_LIM);
  let hMin = 1e9, hMax = -1e9, nz = 0, vMin = 1e9, t = 0, tl = null;
  fly(J, 60, (q, tt) => { hMin = Math.min(hMin, q.h); hMax = Math.max(hMax, q.h); nz = Math.max(nz, q.nz); vMin = Math.min(vMin, q.kcas); if (tl == null && Math.abs(F.wrapA ? F.wrapA(q.track - chi) : Math.atan2(Math.sin(q.track - chi), Math.cos(q.track - chi))) < 2 * D2R && Math.abs(q.phi) < 5 * D2R) tl = tt; });
  check('run-in turn: height band', (hMax - hMin) / FT, 0, 150, 'ft');
  check('run-in turn: g (60° of bank is 2 g level)', nz, 1.8, 2.6, 'g');
  check('run-in turn: least airspeed', vMin, 280, 305, 'kt');
  check('run-in turn: rolled out on the course', tl == null ? 1e9 : tl, 5, 25, 's');
}
console.log(fails.length ? `${fails.length} FAILED: ${fails.join('; ')}` : 'all passed');
process.exit(fails.length ? 1 : 0);
