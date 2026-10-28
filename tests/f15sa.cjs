// The F-15SA flight model (src/f15sa.js) against the published envelope and against the physics it must keep.
// No browser: node tests/f15sa.cjs. Each line prints what was measured and the band it must fall in; the bands are
// the published F-15SA/F-15E/F-15C figures where they exist (docs/DEVELOPER.md, section 17), and plain
// physics elsewhere (a trimmed aircraft stays trimmed, a disturbed one settles, nothing goes through the runway).
const F = require('../src/f15sa.js'), U = F.U;
const fails = [], rows = [];
const check = (what, v, lo, hi, unit) => {
  const ok = Number.isFinite(v) && v >= lo && v <= hi;
  rows.push(`${ok ? 'ok  ' : 'FAIL'} ${what}: ${typeof v === 'number' ? +v.toFixed(3) : v} ${unit || ''}  [${lo} .. ${hi}]`);
  if (!ok) fails.push(what);
};
const DT = 1 / 200;
const mk = (lo, fu, o) => new F(Object.assign({ loadout: lo, fuel: fu }, o || {}));
const placeAt = (ac, hf, v, isM) => { const h = hf * U.FT, a = F.atmos(h, 0); ac.place({ h, V: isM ? v * a.a : F.tasFromCas(v * U.KT, a), psi: 0 }); return ac; };

// ---- atmosphere: ISA tables (T K, p Pa, rho kg/m³)
for (const [h, T, p, r] of [[0, 288.15, 101325, 1.225], [5000, 255.65, 54020, 0.7361], [11000, 216.65, 22632, 0.3639], [15000, 216.65, 12045, 0.19367], [20000, 216.65, 5474.9, 0.08803]]) {
  const a = F.atmos(h * 6356766 / (6356766 - h) * 1, 0);        // geopotential tables
  check(`ISA ${h} m: T`, a.T, T - 0.05, T + 0.05, 'K');
  check(`ISA ${h} m: p`, a.p / p, 0.999, 1.001, '× table');
  check(`ISA ${h} m: rho`, a.rho / r, 0.998, 1.002, '× table');
}
{ const a = F.atmos(0, 0); check('CAS = TAS at sea level', F.casFromTas(150, a), 149.99, 150.01, 'm/s');
  const b = F.atmos(12000, 0); check('CAS→TAS→CAS at 12 km, M 1.6', F.casFromTas(F.tasFromCas(F.casFromTas(1.6 * b.a, b), b), b) / F.casFromTas(1.6 * b.a, b), 0.9999, 1.0001); }

// ---- engines: installed sea-level static thrust, fuel flow, spool times
{ const a = F.atmos(0, 0), e = new F.Engine();
  e.thr = 1; e.n = 1; e.step(0, 0, a); check('F110: military thrust, SLS, installed', e.F / U.LBF, 15500, 17200, 'lbf');
  check('F110: military fuel flow, SLS', e.ff * 3600 / U.LB, 11000, 14000, 'lb/h');
  e.thr = 2; e.ab = 1; e.lit = 1; e.step(0, 0, a); check('F110: maximum thrust, SLS, installed', e.F / U.LBF, 26500, 29500, 'lbf');
  check('F110: maximum fuel flow, SLS', e.ff * 3600 / U.LB, 45000, 62000, 'lb/h');
  const s = new F.Engine(); let t = 0; s.thr = 1; while (s.n < 0.95 && t < 20) { s.step(0.01, 0, a); t += 0.01; }
  check('F110: idle to military (95 %)', t, 3.0, 5.5, 's');
  t = 0; s.thr = 2; const F0 = s.F; while (s.F < F0 * 1.15 && t < 5) { s.step(0.01, 0, a); t += 0.01; }
  check('F110: afterburner lit', t, 0.3, 1.2, 's'); }

// ---- trim across the envelope: forces and pitching moment balance, inside the controls' travel
for (const [lo, fu, hf, v, isM] of [['clean', 0.5, 0, 250], ['cas', 1, 1000, 350], ['cas', 0.6, 20000, 0.8, 1], ['strike', 1, 25000, 0.85, 1], ['clean', 0.5, 40000, 1.8, 1], ['cft', 0.6, 45000, 2.0, 1]]) {
  const ac = placeAt(mk(lo, fu), hf, v, isM), r = ac.trimRes;
  check(`trim ${lo} ${hf} ft ${v}${isM ? ' M' : ' kcas'}: residual`, Math.abs(r.resid[0]) + Math.abs(r.resid[1]) + Math.abs(r.resid[2]) * 10, 0, 1e-4);
  check(`trim ${lo} ${hf} ft ${v}${isM ? ' M' : ' kcas'}: alpha`, r.alpha / U.D2R, -1, 14, '°');
}

// ---- envelope: quasi-steady on the model's own aero and engines
const levelMax = (ac, h, thr) => { let best = 0; for (let M = 0.3; M < 3.0; M += 0.01) { const a = F.atmos(h, 0), r = ac.trim(M * a.a, h, 0, 0); if (r.ok && r.thr <= thr + 1e-6) best = M; } return best; };
const psAt = (ac, h, M, thr) => { const a = F.atmos(h, 0), V = M * a.a, r = ac.trim(V, h, 0, 0); if (!r.ok) return -1e9; return (ac.thrustAt(thr, M, a) - ac.thrustAt(r.thr, M, a)) * V / (ac.m * F.gravity(h)); };
const sustained = (ac, h, M) => {
  const a = F.atmos(h, 0), V = M * a.a, q = 0.5 * a.rho * V * V, S = F.GEO.S, W = ac.m * F.gravity(h), T = ac.thrustAt(2, M, a);
  let best = 0;
  const co = (al, de) => F.aero({ alpha: al, beta: 0, M, V, p: 0, q: 0, r: 0, adot: 0, stab: de, dstab: 0, ail: 0, rud: 0, sb: 0, flap: 0, gear: 0, hAGL: 1e4, storeCD: ac.storeCD });
  for (let n = 1; n <= ac.nMax; n += 0.02) {
    let al = 0.1, de = 0;
    for (let it = 0; it < 30; it++) {
      const r = co(al, de), ra = co(al + 1e-5, de), rd = co(al, de + 1e-5), f0 = r.CL * q * S + T * Math.sin(al) - n * W;
      const J = [[(ra.CL - r.CL) * q * S / 1e-5 + T * Math.cos(al), (rd.CL - r.CL) * q * S / 1e-5], [(ra.Cm - r.Cm) / 1e-5, (rd.Cm - r.Cm) / 1e-5]], det = J[0][0] * J[1][1] - J[0][1] * J[1][0];
      al -= (f0 * J[1][1] - J[0][1] * r.Cm) / det; de -= (J[0][0] * r.Cm - J[1][0] * f0) / det;
    }
    const c = co(al, de);
    if (T * Math.cos(al) >= c.CD * q * S && al < 28 * U.D2R) best = F.gravity(h) * Math.sqrt(n * n - 1) / V / U.D2R; else break;
  }
  return best;
};
{ const ac = mk('clean', 0.5);
  check('max level Mach, clean, 36,000 ft', levelMax(ac, 36089 * U.FT, 2), 2.3, 2.6);
  check('max level Mach, clean, 45,000 ft', levelMax(ac, 45000 * U.FT, 2), 2.3, 2.6);
  check('max level Mach, clean, sea level (over the 800 KCAS limit)', levelMax(ac, 0, 2), 1.21, 1.45);
  check('max level Mach, clean, military power, 30,000 ft', levelMax(ac, 30000 * U.FT, 1), 0.95, 1.3);
  check('rate of climb, clean, sea level, M 0.9, afterburner', psAt(ac, 0, 0.9, 2) / U.FT * 60, 50000, 70000, 'ft/min');
  let ceil = 0; for (let hf = 50000; hf <= 70000; hf += 500) { let b = -1e9; for (let M = 1.0; M <= 2.5; M += 0.05) b = Math.max(b, psAt(ac, hf * U.FT, M, 2)); if (b / U.FT * 60 >= 100) ceil = hf; }
  check('service ceiling, clean (100 ft/min)', ceil, 58000, 66000, 'ft');
  let st = 0; for (const M of [0.5, 0.6, 0.7, 0.8]) st = Math.max(st, sustained(ac, 0, M));
  check('best sustained turn, clean, sea level', st, 19, 24, '°/s'); }
{ const ac = mk('cas', 1);
  let st = 0; for (const M of [0.6, 0.7, 0.8, 0.9]) st = Math.max(st, sustained(ac, 0, M));
  check('best sustained turn, CAS load, full fuel, sea level', st, 11, 17, '°/s');
  check('max level Mach, CAS load, 36,000 ft', levelMax(ac, 36089 * U.FT, 2), 1.4, 2.0);
  check('structural g limit at 63,400 lb', ac.nMax, 6.8, 7.4, 'g'); }

// ---- the 6-DOF and its fly-by-wire
const run = (ac, s, fn) => { let o; for (let i = 0; i < s * 200; i++) { fn && fn(i * DT, ac); o = ac.step(DT); } return o; };
{ const ac = placeAt(mk('clean', 0.5), 10000, 400); let pm = 0, b = 0;
  run(ac, 2, (t, a) => { a.fcs.p = 4; a.fcs.nz = 1; pm = Math.max(pm, a.o.p); b = Math.max(b, Math.abs(a.o.beta)); });
  check('roll rate, clean, 400 KCAS, full stick', pm / U.D2R, 180, 210, '°/s');
  check('sideslip in that roll', b / U.D2R, 0, 1.5, '°'); }
{ const ac = placeAt(mk('strike', 0.6), 10000, 400); let pm = 0, b = 0;
  run(ac, 2, (t, a) => { a.fcs.p = 4; a.fcs.nz = 1; pm = Math.max(pm, a.o.p); b = Math.max(b, Math.abs(a.o.beta)); });
  check('roll rate, two GBU-31 on the wings', pm / U.D2R, 90, 150, '°/s');
  check('sideslip in that roll', b / U.D2R, 0, 1.5, '°'); }
{ const ac = placeAt(mk('clean', 0.5), 10000, 450); let nm = 0, t90 = null;
  run(ac, 3, (t, a) => { a.fcs.nz = 9; a.fcs.p = 0; a.setThrottle(2); nm = Math.max(nm, a.o.nz); if (t90 == null && a.o.nz > 8.2) t90 = t; });
  check('9 g pull, clean, 450 KCAS: peak', nm, 8.7, 9.3, 'g');
  check('9 g pull: time to 90 %', t90, 0.3, 1.2, 's'); }
{ const ac = placeAt(mk('clean', 0.5), 10000, 200); let am = 0;
  run(ac, 3, (t, a) => { a.fcs.nz = 9; a.fcs.p = 0; a.setThrottle(2); am = Math.max(am, a.o.alpha); });
  check('full aft stick at 200 KCAS: angle of attack held', am / U.D2R, 22, 29.5, '°'); }
{ const ac = placeAt(mk('cas', 1), 10000, 450); let nm = 0;
  run(ac, 3, (t, a) => { a.fcs.nz = 9; a.fcs.p = 0; nm = Math.max(nm, a.o.nz); });
  check('9 g asked at 63,400 lb: held to the structural limit', nm, 6.6, ac.nMax + 0.2, 'g'); }
for (const [hf, v, isM] of [[1000, 300], [10000, 500], [30000, 0.9, 1], [40000, 1.6, 1], [20000, 220]]) {
  const ac = placeAt(mk('cas', 0.6), hf, v, isM), h0 = ac.o.h; let dh = 0, dp = 0;
  run(ac, 30, (t, a) => { a.fcs.nz = 1; a.fcs.p = 0; dh = Math.max(dh, Math.abs(a.o.h - h0)); dp = Math.max(dp, Math.abs(a.o.phi)); });
  check(`hands off 30 s at ${hf} ft ${v}${isM ? ' M' : ' kcas'}: height`, dh, 0, 80, 'm');
  check(`hands off 30 s at ${hf} ft ${v}${isM ? ' M' : ' kcas'}: bank`, dp / U.D2R, 0, 0.5, '°');
}
{ const ac = placeAt(mk('clean', 0.5), 15000, 350); ac.w[2] = 0.15; let late = 0;
  run(ac, 8, (t, a) => { a.fcs.nz = 1; a.fcs.p = 0; if (t > 4) late = Math.max(late, Math.abs(a.o.beta)); });
  check('yaw kick: sideslip after 4 s', late / U.D2R, 0, 0.15, '°'); }
{ const ac = placeAt(mk('cas', 0.6), 30000, 0.85, 1); const o = run(ac, 5, (t, a) => { a.fcs.nz = 1; a.fcs.p = 0; });
  check('cruise fuel flow, CAS load, M 0.85, 30,000 ft', o.ff * 3600 / U.LB, 5000, 9500, 'lb/h'); }
{ const ac = placeAt(mk('clean', 0.5), 20000, 300), e0 = ac.o.V * ac.o.V / 2 + ac.o.g * ac.o.h;
  for (const e of ac.eng) e.on = false; ac.setThrottle(0);
  const o = run(ac, 60, (t, a) => { a.fcs.nz = 1; a.fcs.p = 0; });
  check('engines out: energy only lost, never gained (glide 60 s)', (o.V * o.V / 2 + o.g * o.h) / e0, 0.5, 1.0); }

// ---- the pilot: takeoff, climb, orbit, landing
const rwy = { n: 0, e: 0, psi: 0, elev: 0 };
const takeoff = (lo, fu, o) => {
  const ac = mk(lo, fu, o); ac.place({ psi: 0, onGround: true });
  const P = new F.Pilot(ac); P.set('takeoff', { rwy, h: 6000, kcas: 350 });
  let lof = null, sc = 0, xt = 0;
  for (let i = 0; i < 200 * 200 && P.mode === 'takeoff'; i++) { const ob = P.fly(DT); if (!lof && !ob.wow && P.phase === 'rotate') lof = { n: ob.n, kcas: ob.kcas }; sc += ac.scrape; if (ob.wow) xt = Math.max(xt, Math.abs(ob.e)); }
  return { ac, P, lof, sc, xt };
};
{ const r = takeoff('cas', 1);
  check('takeoff, CAS load, full fuel (63,400 lb), afterburner: lift-off speed', r.lof.kcas, 160, 200, 'KCAS');
  check('  ground roll', r.lof.n, 450, 750, 'm');
  check('  on the centreline', r.xt, 0, 1.5, 'm');
  check('  nozzles never touch', r.sc, 0, 0);
  check('  climbed to 6,000 m and handed to navigation', r.P.mode === 'nav' ? 1 : 0, 1, 1); }
{ const r = takeoff('clean', 0.5);
  check('takeoff, clean, half fuel, military power: lift-off speed', r.lof.kcas, 135, 170, 'KCAS');
  check('  ground roll', r.lof.n, 300, 600, 'm'); }
{ const wind = { n: 12, e: -14, d: 0 }, ac = mk('cas', 0.7, { wind, turb: 1, seed: 7 }), h = 20000 * U.FT;
  ac.place({ n: -20000, e: 5000, h: h - 1500, V: 200, psi: 0.3 });
  const P = new F.Pilot(ac); P.set('orbit', { c: { n: 0, e: 0 }, R: 8000, dir: 1, h, kcas: 330 }, { bank: 45 * U.D2R, roll: 30 * U.D2R, nz: 3 });
  let er = 0, eh = 0;
  for (let i = 0; i < 200 * 480; i++) { const o = P.fly(DT); if (P.t > 240) { er = Math.max(er, Math.abs(P.tgt.dist - 8000)); eh = Math.max(eh, Math.abs(o.h - h)); } }
  check('orbit 8 km at 20,000 ft, 18 m/s wind, light turbulence: radius error', er, 0, 60, 'm');
  check('  height error', eh, 0, 25, 'm'); }
const land = (lo, fu, o) => {
  const ac = mk(lo, fu, o); ac.place({ n: -16000, e: 900, h: 700, V: 135, psi: 0.1 });
  const P = new F.Pilot(ac); P.set('land', { rwy });
  let sc = 0;
  for (let i = 0; i < 200 * 400 && P.phase !== 'stopped'; i++) { P.fly(DT); sc += ac.scrape; }
  return { ac, P, sc };
};
{ const r = land('cas', 0.3), T = r.P.touch;
  check('landing, CAS load, 47,000 lb: approach speed', r.P.vApp && F.casFromTas(r.P.vApp, F.atmos(0, 0)) / U.KT, 138, 160, 'KCAS');
  check('  touchdown sink rate', T && -T.vs, 0.3, 2.5, 'm/s');
  check('  touchdown past the threshold', T && T.along, 150, 600, 'm');
  check('  nozzles never touch', r.sc, 0, 0);
  check('  stopped', r.P.phase === 'stopped' ? 1 : 0, 1, 1);
  check('  landing roll, touchdown to stop', r.P.stop && r.P.stop.along - T.along, 900, 1700, 'm');
  check('  on the centreline', r.P.stop && Math.abs(r.P.stop.across), 0, 2, 'm'); }
{ const r = land('cas', 0.3, { wind: { n: -4, e: 8, d: 0 }, turb: 1, seed: 3 }), T = r.P.touch;
  check('landing, 8 m/s crosswind and light turbulence: sink rate', T && -T.vs, 0.2, 3.0, 'm/s');
  check('  across at touchdown', T && Math.abs(T.across), 0, 5, 'm');
  check('  stopped on the runway', r.P.stop && Math.abs(r.P.stop.across), 0, 10, 'm'); }

{ const ac = placeAt(mk('cas', 0.6), 18000, 420), P = new F.Pilot(ac), h = 20000 * U.FT;
  ac.pos[1] = 2500;                                                        // starts 2.5 km off the line
  P.set('line', { p: { n: 40000, e: 0 }, chi: 0, h, kcas: 400 });
  let o; for (let i = 0; i < 200 * 150 && !(P.tgt.togo < 0); i++) o = P.fly(DT);
  check('attack run down a line: across at the point', Math.abs(P.tgt.across), 0, 15, 'm');
  check('  height at the point', Math.abs(o.h - h), 0, 15, 'm');
  check('  wings level', Math.abs(o.phi) / U.D2R, 0, 2, '°'); }
// the turn in to a run, as in the game: heavy (strike load, 80 % fuel, ISA+15), off the 330 KCAS orbit at 20,000 ft
// onto a line behind him at 380 KCAS, 60° of bank, military power. He holds his height and lets the speed come
// more slowly (he used to dive 400 m for it)
{ const h = 20000 * U.FT, ac = mk('strike', 0.8, { dT: 15, turb: 1, seed: 7 }), D = U.D2R;
  ac.place({ n: 7000, e: 0, h, V: F.tasFromCas(330 * U.KT, F.atmos(h, 15)), psi: -Math.PI / 2 });
  const P = new F.Pilot(ac);
  P.set('orbit', { c: { n: 0, e: 0 }, R: 7000, dir: -1, h, kcas: 330 }, { bank: 45 * D, roll: 30 * D, nz: 3 });
  for (let i = 0; i < 200 * 60; i++) P.fly(DT);
  const chi = ac.o.track + Math.PI, p = { n: ac.o.n + Math.cos(chi) * 60000, e: ac.o.e + Math.sin(chi) * 60000 };
  P.set('line', { p, chi, h, kcas: 380 }, { bank: 60 * D, roll: 60 * D, nz: 4 });
  let dh = 0, bank = 0, t375 = null, ab = 0;
  for (let i = 0; i < 200 * 90; i++) { const o = P.fly(DT); dh = Math.max(dh, Math.abs(o.h - h)); bank = Math.max(bank, Math.abs(o.phi)); if (t375 == null && o.kcas > 375) t375 = i * DT; if (ac.eng[0].thr > 1) ab++; }
  check('turn in to the run, strike load, 60° bank, 330 to 380 KCAS: height kept', dh, 0, 30, 'm');
  check('  banked to', bank / D, 58, 64, '°');
  check('  375 KCAS reached', t375, 20, 70, 's');
  check('  no afterburner', ab, 0, 0);
  // and back to the orbit's 330 KCAS, the throttles at idle: no climb to shed the speed
  P.set('orbit', { c: { n: ac.o.n + 7000, e: ac.o.e }, R: 7000, dir: -1, h, kcas: 330 }, { bank: 45 * D, roll: 30 * D, nz: 3 });
  dh = 0; for (let i = 0; i < 200 * 60; i++) { const o = P.fly(DT); dh = Math.max(dh, Math.abs(o.h - h)); }
  check('  back to 330 KCAS in the orbit: height kept', dh, 0, 30, 'm');
  check('  speed', ac.o.kcas, 320, 340, 'KCAS');
  // both engines out holding 20,000 ft: he keeps the height only while the wing has speed to spare, then glides
  for (const e of ac.eng) e.on = false;
  let kMin = 1e9; for (let i = 0; i < 200 * 120; i++) { const o = P.fly(DT); kMin = Math.min(kMin, o.kcas); }
  check('  both engines out: the speed he keeps gliding', kMin, 225, 340, 'KCAS');
  check('  and descending', h - ac.o.h, 300, 5000, 'm'); }
{ const a = takeoff('cas', 1), b = takeoff('cas', 1, { dT: 25 });
  check('takeoff on an ISA+25 day (a Saudi summer): ground roll against a standard day', b.lof.n / a.lof.n, 1.1, 1.5, '×'); }
{ const ac = placeAt(mk('strike', 0.7), 20000, 450); let dn = 0;
  run(ac, 2, (t, a) => { a.fcs.nz = 1; a.fcs.p = 0; });
  const m0 = ac.m; ac.release('W2'); ac.release('W8');
  check('two GBU-31 released: lighter by', m0 - ac.m, 1867, 1869, 'kg');
  run(ac, 6, (t, a) => { a.fcs.nz = 1; a.fcs.p = 0; dn = Math.max(dn, Math.abs(a.o.nz - 1)); });
  check('  the jump in g the flight controls let through', dn, 0, 0.3, 'g'); }

// ---- taxiing: out of the stand, a right angle onto the taxiway and back, a stop; then a takeoff run begun 3 m and
// 2° off the centreline holds it (the nosewheel's bite grows with the speed: fixed gains swung it off near 70 knots)
{ const ac = mk('cas', 0.8); ac.place({ n: 0, e: 0, psi: 90 * U.D2R, onGround: true });
  const P = new F.Pilot(ac), path = [{ n: 0, e: 0 }, { n: 0, e: 150 }, { n: -60, e: 170 }, { n: -60, e: 320 }];
  P.set('taxi', { path }); let t = 0, mx = 0, vmax = 0;
  while (!P.tgt.done && t < 200) { P.fly(DT); t += DT; mx = Math.max(mx, Math.abs(P.tgt.across)); vmax = Math.max(vmax, ac.o.gs); }
  check('taxi: off the path at most (cutting a square corner)', mx, 0, 3, 'm');
  check('taxi: top speed', vmax / U.KT, 15, 22, 'kt');
  check('taxi: stops at the end', Math.hypot(ac.o.n + 60, ac.o.e - 320), 0, 6, 'm');
  check('taxi: 330 m, stand to stop', t, 30, 70, 's'); }
{ const ac = mk('cas', 0.8); ac.place({ n: 0, e: 3, psi: 2 * U.D2R, onGround: true });
  const P = new F.Pilot(ac), rwy = { n: 0, e: 0, psi: 0, elev: 0 }; P.set('takeoff', { rwy, h: 1500, kcas: 350 });
  let t = 0, mx = 0; while (ac.o.wow && t < 60 || t < 5) { P.fly(DT); t += DT; mx = Math.max(mx, Math.abs(F.rwyFrame(rwy, ac.o).across)); }
  check('takeoff begun 3 m and 2° off: furthest from the centreline', mx, 0, 4, 'm');
  check('  and airborne', ac.o.wow ? 0 : 1, 1, 1); }

// ---- repeatable, and fast enough for a phone
{ const a = takeoff('cas', 1, { turb: 1, seed: 5 }), b = takeoff('cas', 1, { turb: 1, seed: 5 });
  check('same seed, same flight', Math.abs(a.ac.o.n - b.ac.o.n) + Math.abs(a.ac.o.h - b.ac.o.h), 0, 0); }
{ const ac = placeAt(mk('cas', 0.6), 20000, 330), P = new F.Pilot(ac); P.set('orbit', { c: { n: 0, e: 0 }, R: 8000, dir: 1, h: 20000 * U.FT, kcas: 330 });
  const t0 = process.hrtime.bigint(); for (let i = 0; i < 20000; i++) P.fly(DT); const s = Number(process.hrtime.bigint() - t0) / 1e9;
  check('steps per second (RK4 + control + pilot)', 20000 / s, 20000, 1e9, '/s'); }

console.log(rows.join('\n'));
console.log(fails.length ? `\n${fails.length} FAILED` : `\nall ${rows.length} passed`);
process.exit(fails.length ? 1 : 0);
