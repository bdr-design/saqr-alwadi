/* ZF-25 flight model: a six-degree-of-freedom rigid body flown through its digital fly-by-wire, as the Royal Saudi Air
   Force's ZF-25 flies. No DOM, no three.js: the game inlines it (tools/build.py), node tests load it with require().

   Frames: the world is flat-earth NED in metres (x north, y east, z down), the body is FRD (x out the nose, y out the
   right wing, z through the floor). Angles in radians, SI units throughout; knots, feet and pounds only at the edges.

   What it is built from (docs/DEVELOPER.md, section 17):
   - geometry, weights, fuel and inertia: published ZF-25E/ZF-25 figures (608 ft² wing, 42.8 ft span, 31,700 lb basic
     empty, 13,123 lb internal fuel, 9,750 lb in the CFTs, 81,000 lb maximum)
   - engines: two GE F110-GE-129 (17,155 lbf dry, 29,500 lbf with afterburner, bypass 0.76), with the installed thrust
     lapse and fuel consumption of a low-bypass mixed-flow afterburning turbofan (Mattingly, Aircraft Engine Design)
   - aerodynamics: lift slope from DATCOM for the 45° swept, aspect-ratio 3 wing with the ZF-25's lifting body, the
     subsonic, transonic and supersonic drag of a twin-engine fighter of this class, loss of leading-edge suction with
     angle of attack, static margin moving aft through Mach 1, store drag by equivalent flat-plate area; stability
     derivatives of the ZF-25 class (NASA flight-extracted values where published)
   - control: stabilators (±differential for roll), ailerons, twin rudders, dorsal speed brake, plain flaps, each through
     an actuator with its rate and travel limits, commanded by a nonlinear dynamic-inversion control law (as modern
     fly-by-wire is): g command with an angle-of-attack and load limiter, roll rate about the velocity vector, sideslip
     held at zero
   - undercarriage: three oleo struts (spring and damper), nosewheel steering, anti-skid brakes; the nozzles can scrape
   - atmosphere: ISA with a temperature offset (the Gulf is hot), gravity falling with height, wind and Dryden
     turbulence (MIL-F-8785C)
   The model is tested against the published envelope in tests/f15sa.cjs. */
(function (root) {
'use strict';

const G0 = 9.80665, RE = 6356766, RGAS = 287.053, GAM = 1.4;
const FT = 0.3048, LB = 0.45359237, LBF = 4.4482216, KT = 0.5144444, SLUGFT2 = 1.3558179, D2R = Math.PI / 180;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// piecewise-linear table lookup: xs ascending, ys the values
const tab = (xs, ys, x) => {
  if (x <= xs[0]) return ys[0];
  const n = xs.length - 1; if (x >= xs[n]) return ys[n];
  let i = 1; while (xs[i] < x) i++;
  return ys[i - 1] + (ys[i] - ys[i - 1]) * (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
};
const wrapA = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };

/* ===== atmosphere: ISA (troposphere, tropopause, lower stratosphere) + dT, geopotential height ===== */
function atmos(h, dT) {
  dT = dT || 0;
  const hg = RE * h / (RE + h);                                 // geopotential height
  let Ts, p;
  if (hg < 11000) { Ts = 288.15 - 0.0065 * hg; p = 101325 * Math.pow(Ts / 288.15, G0 / (0.0065 * RGAS)); }
  else if (hg < 20000) { Ts = 216.65; p = 22632.06 * Math.exp(-G0 * (hg - 11000) / (RGAS * 216.65)); }
  else { Ts = 216.65 + 0.001 * (hg - 20000); p = 5474.889 * Math.pow(Ts / 216.65, -G0 / (0.001 * RGAS)); }
  const T = Ts + dT, rho = p / (RGAS * T), a = Math.sqrt(GAM * RGAS * T);
  return { T, p, rho, a, theta: T / 288.15, delta: p / 101325, sigma: rho / 1.225 };
}
const gravity = h => G0 * Math.pow(RE / (RE + h), 2);
// calibrated airspeed from true airspeed (subsonic and supersonic pitot, Rayleigh)
function casFromTas(V, at) {
  const M = V / at.a;
  let qc;
  if (M < 1) qc = at.p * (Math.pow(1 + 0.2 * M * M, 3.5) - 1);
  else qc = at.p * (166.92158 * Math.pow(M, 7) / Math.pow(7 * M * M - 1, 2.5) - 1);
  return 340.294 * Math.sqrt(5 * (Math.pow(qc / 101325 + 1, 2 / 7) - 1));
}
function tasFromCas(Vc, at) {
  const qc = 101325 * (Math.pow(1 + 0.2 * Math.pow(Vc / 340.294, 2), 3.5) - 1);
  let M = Math.sqrt(5 * (Math.pow(qc / at.p + 1, 2 / 7) - 1));
  if (M > 1) for (let i = 0; i < 8; i++) M = 0.88128485 * Math.sqrt((qc / at.p + 1) * Math.pow(1 - 1 / (7 * M * M), 2.5));
  return M * at.a;
}

/* ===== the airframe ===== */
const GEO = {
  S: 608 * FT * FT,            // 56.48 m² wing reference area
  b: 42.83 * FT,               // 13.05 m span
  c: 15.95 * FT,               // 4.86 m mean aerodynamic chord
  A: 42.83 * 42.83 / 608,      // aspect ratio 3.02
  sweepLE: 45 * D2R, taper: 0.25,
  wingH: 2.2,                  // wing above the ground on the wheels (ground effect)
  len: 63.75 * FT,             // 19.43 m long
};
GEO.tanHalf = Math.tan(GEO.sweepLE) - 4 / GEO.A * 0.5 * (1 - GEO.taper) / (1 + GEO.taper);   // half-chord sweep

// lift slope per radian: DATCOM for the wing (subsonic), linear supersonic theory above Mach 1.2, blended between;
// the ZF-25's broad lifting fuselage and inlets add about 30 % (its body carries much of the lift)
function liftSlope(M) {
  const A = GEO.A, k = 0.95, t2 = GEO.tanHalf * GEO.tanHalf;
  const sub = m => { const b2 = Math.max(1 - m * m, 0.04); return 2 * Math.PI * A / (2 + Math.sqrt(4 + A * A * b2 / (k * k) * (1 + t2 / b2))); };
  const sup = m => { const be = Math.sqrt(m * m - 1); return 4 / be * (1 - 1 / (2 * A * be)); };
  let w;
  if (M <= 0.9) w = sub(M);
  else if (M >= 1.2) w = sup(M);
  else { const t = smooth(0.9, 1.2, M); w = lerp(sub(0.9) * (1 + (M - 0.9) * 0.6), sup(1.2), t); }
  return w * 1.30;
}

// zero-lift drag of the airframe alone (no stores), referred to the wing area: the subsonic plateau, the transonic
// rise from M 0.85 (drag divergence ≈ 0.92), the peak just past Mach 1, the slow supersonic fall
const CD0_M = [0, 0.6, 0.8, 0.86, 0.9, 0.95, 1.0, 1.05, 1.1, 1.2, 1.4, 1.6, 1.8, 2.0, 2.2, 2.5];
const CD0_V = [0.0205, 0.0205, 0.0212, 0.0222, 0.0245, 0.0310, 0.0395, 0.0440, 0.0452, 0.0450, 0.0428, 0.0402, 0.0378, 0.0358, 0.0340, 0.0320];
// store drag (and every pylon's) rises through Mach 1 like the airframe's: the factor on its subsonic value
const SD_M = [0, 0.8, 0.9, 1.0, 1.1, 1.4, 2.0], SD_V = [1, 1, 1.1, 1.6, 1.8, 1.6, 1.4];

// Oswald efficiency of the attached-flow polar (Raymer for a 45° leading edge, less for the fuselage)
const E_OSW = 0.80;

// static margin (fraction of the chord the aerodynamic centre sits behind the centre of gravity): a little stable
// subsonic, the centre moves aft through Mach 1 as on every swept wing (the fly-by-wire hides it from the crew)
const SM_M = [0, 0.8, 0.9, 1.0, 1.1, 1.3, 2.0, 2.5], SM_V = [0.045, 0.05, 0.07, 0.12, 0.16, 0.18, 0.17, 0.16];

// the all-moving tail's lift slope falls supersonically like the wing's
const tailEff = M => M < 0.9 ? 1 + 0.25 * M * M : M < 1.2 ? lerp(1.2, 0.95, (M - 0.9) / 0.3) : 0.95 * Math.sqrt(0.44) / Math.sqrt(M * M - 1) * 1.0;

/* surfaces: travel (rad) and rate (rad/s) of their actuators
   stab: symmetric stabilator, + trailing edge down; 15° down, 29° up (the ZF-25's), 46°/s
   dstab: differential stabilator for roll, ±10° within the stabs' own travel
   ail: ailerons ±20°, 80°/s; rud: twin rudders ±30°, 80°/s
   sb: dorsal speed brake 0..1 (45°), 3 s; flap: plain flaps 0..1 (30°), 4 s; gear 0..1, 7 s */
const SURF = {
  stab: { lo: -29 * D2R, hi: 15 * D2R, rate: 46 * D2R, tau: 0.05 },
  dstab: { lo: -10 * D2R, hi: 10 * D2R, rate: 46 * D2R, tau: 0.05 },
  ail: { lo: -20 * D2R, hi: 20 * D2R, rate: 80 * D2R, tau: 0.04 },
  rud: { lo: -30 * D2R, hi: 30 * D2R, rate: 80 * D2R, tau: 0.04 },
};

// the aerodynamic coefficients at a flight condition. x: { alpha, beta, M, p, q, r (body, rad/s), V, adot, stab, dstab,
// ail, rud, sb, flap, gear, hAGL, storeCD }
function aero(x) {
  const { alpha: a, beta: b, M, V } = x;
  const Vs = Math.max(V, 20);
  const CLa = liftSlope(M);
  // lift: linear to the break (15° subsonic, less transonic and supersonic), rounding over to CLmax about 20° later,
  // a gentle fall past it (the ZF-25 has no sharp stall; the flight controls keep it below 30°)
  const aB = (15 - 6 * smooth(0.6, 1.0, M)) * D2R, aM = aB + (20 - 6 * smooth(0.6, 1.2, M)) * D2R;
  const CL0 = 0.035 * (1 - smooth(0.9, 1.3, M));               // conical camber
  const sa = Math.sign(a), aa = Math.abs(a);
  let CLw;
  if (aa <= aB) CLw = CLa * aa;
  else if (aa <= aM) { const d = aa - aB; CLw = CLa * aB + CLa * d - CLa / (2 * (aM - aB)) * d * d; }
  else { const CLmx = CLa * aB + CLa * (aM - aB) / 2; CLw = CLmx - 0.9 * (aa - aM) * (aa - aM); }
  CLw = CL0 + sa * CLw;
  // flaps: +0.20 at the same angle of attack (plain flaps at 30°), gone above 15°
  const flapCL = 0.20 * x.flap * (1 - smooth(10 * D2R, 20 * D2R, aa));
  // ground effect on lift (more) and on induced drag (less): Wieselsberger's factor
  const hb = Math.max(x.hAGL + GEO.wingH, 0.5) / GEO.b, ge = Math.pow(16 * hb, 2) / (1 + Math.pow(16 * hb, 2));
  const geCL = 1 + 0.08 * (1 - smooth(0.05, 0.6, hb));
  // the tail's lift: CLδ ≈ CLα,t·η·St/S = 2.5·0.9·111/608 per radian
  const te = tailEff(M), CLde = 0.41 * te;
  const CL = (CLw + flapCL) * geCL + CLde * x.stab;

  // drag: zero-lift + stores + gear, flaps, brake, and the lift's: attached flow K·CL² (leading-edge suction) giving way
  // to CL·tanα (none) with angle of attack and above Mach 1
  const Kat = 1 / (Math.PI * E_OSW * GEO.A);
  const Knos = 1 / CLa;
  const fsep = Math.max(smooth(8 * D2R, 24 * D2R, aa), smooth(0.85, 1.15, M));
  const CLl = CLw + flapCL;
  const CDi = ((1 - fsep) * Kat * CLl * CLl + fsep * Math.abs(CLl * Math.tan(Math.min(aa, 1.3)))) * ge;
  const CD0 = tab(CD0_M, CD0_V, M) + x.storeCD * tab(SD_M, SD_V, M);
  const CDsurf = 0.018 * x.gear + 0.016 * x.flap + 0.035 * x.sb * (1 - smooth(20 * D2R, 30 * D2R, aa)) + 0.05 * x.stab * x.stab + 0.02 * (x.ail * x.ail + x.dstab * x.dstab) + 0.03 * x.rud * x.rud;
  const CDb = 0.5 * b * b;                                       // sideslip
  const CD = CD0 + CDi + CDsurf + CDb;

  // side force
  const CY = -0.9 * b + 0.15 * x.rud;

  // pitching moment about the centre of gravity: static margin times the wing-body lift, the tail, pitch damping,
  // the flaps (nose down), the brake (nose up), ground effect (nose down)
  const SM = tab(SM_M, SM_V, M);
  const c2v = GEO.c / (2 * Vs), b2v = GEO.b / (2 * Vs);
  const Cm0 = 0.005;
  const Cmde = -0.52 * te;                                      // CLδ·(tail arm/chord 1.27)
  const Cmq = -5.5 * (0.6 + 0.4 * te), Cmad = -1.6;
  const CmDeep = aa > aM ? -0.25 * (aa - aM) * sa : 0;        // nose-down past CLmax (pitch break recovery)
  const Cm = Cm0 - SM * (CLw + flapCL) + Cmde * x.stab + c2v * (Cmq * x.q + Cmad * x.adot) - 0.03 * x.flap + 0.008 * x.sb - 0.02 * (1 - ge) + CmDeep;

  // rolling: dihedral effect growing with lift, damping falling with angle of attack, yaw-rate coupling, the ailerons
  // and differential stabs (both weaker transonic), a little from the rudders
  const rollEff = M < 0.85 ? 1 : M < 1.1 ? lerp(1, 0.65, (M - 0.85) / 0.25) : 0.65 * Math.sqrt(0.46) / Math.sqrt(Math.max(M * M - 1, 0.21));
  const Clb = -0.05 - 0.10 * Math.min(Math.abs(CLw), 1.4);
  const Clp = -0.30 * (1 - 0.5 * smooth(15 * D2R, 35 * D2R, aa));
  const Clr = 0.05 + 0.25 * CLw;
  const Clda = 0.055 * rollEff * (1 - 0.6 * smooth(15 * D2R, 35 * D2R, aa)), Cldd = 0.06 * rollEff * te, Cldr = 0.012;
  const Cl = Clb * b + Clda * x.ail + Cldd * x.dstab + Cldr * x.rud + b2v * (Clp * x.p + Clr * x.r);

  // yawing: weathercock stability from the twin fins (falls at high angle of attack and supersonic), yaw damping,
  // adverse yaw from rolling and from the ailerons, the rudders
  const finEff = te * (1 - 0.6 * smooth(20 * D2R, 40 * D2R, aa));
  const Cnb = 0.12 * finEff, Cnr = -0.35 * (0.7 + 0.3 * finEff), Cnp = -CLw / 8;
  const Cnda = -0.005, Cndr = -0.075 * finEff, Cndd = 0.004;
  const Cn = Cnb * b + Cnda * x.ail + Cndd * x.dstab + Cndr * x.rud + b2v * (Cnp * x.p + Cnr * x.r);

  return { CL, CD, CY, Cl, Cm, Cn, CLa, SM, Clda, Cldd, Cldr, Cnda, Cndd, Cndr, Cmde, CLde, CLw, ge, aB, aM };
}

/* ===== the engines: two F110-GE-129 ===== */
// sea-level static, installed (inlet recovery, bleed and nozzle losses take about 6 %)
const ENG = {
  mil: 17155 * LBF * 0.94, max: 29500 * LBF * 0.94, idle: 0.055,
  TR: 1.20,                       // throttle ratio: above it the turbine temperature limit takes thrust away
  sfcMil: 0.76, sfcMax: 1.95,     // lb/lbf/h at sea level static
};
// thrust lapse with height and Mach: Mattingly's low-bypass mixed-flow turbofan (good at altitude and high Mach, where
// the turbine temperature limits), capped low down where the engine is held to its pressure and speed limits instead
// (the dense-air ram rise flattens: about 1.05 of static thrust at sea level, Mach 0.9). The dry (military) line is
// 0.58 of maximum, as the F110's own ratio, and gives out sooner with ram temperature.
function mattingly(M, at) {
  const t0 = at.theta * (1 + 0.2 * M * M), d0 = at.delta * Math.pow(1 + 0.2 * M * M, 3.5);
  let k = 1 - 0.3 * (t0 - 1) - 0.1 * Math.sqrt(M);
  if (t0 > ENG.TR) k -= 1.5 * (t0 - ENG.TR) / t0;
  return { t0, d0, k };
}
// density's share of the cap: σ^0.72 in the troposphere, straight σ above the tropopause (the cold air no longer helps);
// on a day hotter than standard the turbine temperature limit takes a further 0.9 % per 1 % of θ (a Gulf summer, ISA+25,
// about 8 % at the same density)
const capSig = (s, th) => (s > 0.2971 ? Math.pow(s, 0.72) : Math.pow(0.2971, 0.72) * s / 0.2971) * (1 - 0.9 * Math.max(th - 1, 0));
function lapse(M, at) {
  const { d0, k } = mattingly(M, at);
  const cap = capSig(at.sigma, at.theta) * (1 - 0.13 * M + 0.21 * M * M) * 1.05;
  return Math.max(Math.min(d0 * k, cap), 0);
}
function lapseMil(M, at) {
  const { t0, d0, k } = mattingly(M, at);
  const cap = capSig(at.sigma, at.theta) * (1 - 0.2 * M + 0.3 * M * M);
  return Math.max(Math.min(d0 * (k - (t0 > 1 ? 0.4 * (t0 - 1) : 0)), cap), 0);
}
// one engine. Its throttle 0..1 idle to military, 1..2 the afterburner. The core (n: 0 idle .. 1 military) spools with
// the F110's acceleration (idle to military in about 4 s, slower from idle), the afterburner lights in 0.4 s once the
// core is at military and modulates in 1.5 s.
function Engine() { this.thr = 0; this.n = 0; this.ab = 0; this.lit = 0; this.F = 0; this.ff = 0; this.on = true; }
Engine.prototype.step = function (dt, M, at) {
  const want = this.on ? this.thr : 0;
  const nCmd = clamp(want, 0, 1), abCmd = this.on ? clamp(want - 1, 0, 1) : 0;
  const up = 0.12 + 0.35 * this.n, dn = 0.45;
  this.n += clamp(nCmd - this.n, -dn * dt, up * dt);
  if (abCmd > 0 && this.n > 0.97) this.lit = Math.min(this.lit + dt / 0.4, 1); else if (abCmd <= 0) this.lit = 0;
  const abT = this.lit >= 1 ? abCmd : 0;
  this.ab += clamp(abT - this.ab, -dt / 0.8, dt / 1.5);
  if (this.lit < 1 && abCmd <= 0) this.ab = Math.max(this.ab - dt / 0.8, 0);
  const Fmil = ENG.mil * lapseMil(M, at), Fmax = ENG.max * lapse(M, at);
  // idle: a little gross thrust, less net with ram drag
  const Fidle = ENG.mil * ENG.idle * at.delta * Math.max(1 - 0.9 * M, -0.3);
  const Fdry = lerp(Fidle, Fmil, Math.pow(this.n, 1.25));
  // the afterburner: minimum reheat is a step of about 15 % of the way from military to maximum
  const Fab = this.ab > 0 || this.lit >= 1 ? lerp(Fmil + 0.15 * (Fmax - Fmil), Fmax, this.ab) : 0;
  this.F = this.on ? Math.max(Fab, Fdry) : Math.min(Fdry, 0);
  // fuel: TSFC times thrust (Mattingly's Mach and temperature trend on the F110's sea-level values); part power a
  // little worse per pound than military, the afterburner far worse
  const st = Math.sqrt(at.theta);
  const sfcMil = ENG.sfcMil / 0.9 * (0.9 + 0.30 * M) * st, sfcMax = ENG.sfcMax / 1.6 * (1.6 + 0.27 * M) * st;
  const sfc = Fab > Fdry ? lerp(sfcMil * 1.6, sfcMax, this.ab) : sfcMil * (1 + 0.25 * Math.pow(1 - this.n, 2));
  const idleFF = 1100 * LB / 3600 * Math.max(at.delta, 0.2);   // kg/s, about 1,100 lb/h at idle at sea level
  this.ff = this.on ? Math.max(sfc * Math.max(this.F, 0) / LBF * LB / 3600, idleFF) : 0;     // kg/s
  this.n2 = this.on ? 68 + 31 * this.n + (this.ab > 0 ? 1 : 0) : Math.max((this.n2 || 0) - 8 * dt, 0);
  this.noz = this.ab > 0 || this.lit >= 1 ? 0.35 + 0.65 * this.ab : 0.25 * (1 - this.n);  // nozzle opening 0..1
};

/* ===== weights and stores ===== */
const MASS = {
  empty: 31700 * LB,                // basic empty, ZF-25E
  crew: 2 * 105,                    // two crew, flight gear
  gun: 512 * 0.26 + 130,            // M61A1 20 mm: 512 rounds, the gun and feed's useful load
  intFuel: 13123 * LB,              // internal
  cftFuel: 9750 * LB,               // conformal tanks, both
  cftEmpty: 2 * 1050 * LB,          // the CFTs themselves
  max: 81000 * LB,
  // inertia of the basic airframe (ZF-25, slug·ft² in the public data), at the weight it was given for
  Ixx: 28700 * SLUGFT2, Iyy: 165100 * SLUGFT2, Izz: 187900 * SLUGFT2, Ixz: 520 * SLUGFT2, Iref: 40000 * LB,
};
// stores: mass (kg), drag counts on the wing area (×1e-4, with their rack), where they hang (y off the centreline, m)
const STORES = {
  'LB-5': { kg: 277, cd: 10, name: 'LB-5', kind: 'lgb' },
  'LB-20': { kg: 944, cd: 19, name: 'LB-20', kind: 'lgb' },
  'LB-20P': { kg: 1050, cd: 22, name: 'LB-20P', kind: 'lgb' },
  'GB-5': { kg: 253, cd: 9, name: 'GB-5', kind: 'jdam' },
  'GB-20': { kg: 934, cd: 17, name: 'GB-20', kind: 'jdam' },
  'GB-5L': { kg: 255, cd: 9, name: 'GB-5L', kind: 'jdam' },
  'AGR-6': { kg: 304, cd: 12, name: 'AGR-6 Barq', kind: 'agm' },
  'ASM-L': { kg: 675, cd: 22, name: 'ASM-L', kind: 'agm' },
  'AAM-S': { kg: 85, cd: 4, name: 'AAM-S', kind: 'aam' },
  'AAM-M': { kg: 157, cd: 6, name: 'AAM-MC', kind: 'aam' },
  'TGP-9': { kg: 202, cd: 10, name: 'TGP-9', kind: 'pod' },
  'TANK610': { kg: 170, cd: 25, name: '610 gal tank', kind: 'tank', fuel: 610 * 6.7 * LB },   // kg empty; its fuel is in fuel
};
// stations: CFT tangential rows (on the fuselage sides, no pylon drag), the wing pylons 2 and 8 with their rails, the
// centreline 5, the pod stations under the inlets
const STATIONS = {
  LCFT1: 1.55, LCFT2: 1.55, LCFT3: 1.55, RCFT1: -1.55, RCFT2: -1.55, RCFT3: -1.55,
  W2: 3.05, W2A: 3.6, W2B: 2.5, W8: -3.05, W8A: -3.6, W8B: -2.5, C5: 0, LIN: 1.0, RIN: -1.0,
};
const PYLON_CD = 6, PYLON_KG = 140;
// loadouts: name → { cft: bool, stations: { station: store } }
const LOADOUTS = {
  clean: { cft: false, st: {} },
  cft: { cft: true, st: {} },
  // a typical ZF-25 close air support load: Sniper, 4 LB-5 on the CFTs, 2 GB-5, 2 AAM-S, 2 AAM-M
  cas: { cft: true, st: { RIN: 'TGP-9', LCFT1: 'LB-5', LCFT2: 'LB-5', RCFT1: 'LB-5', RCFT2: 'LB-5', LCFT3: 'GB-5', RCFT3: 'GB-5', W2A: 'AAM-S', W8A: 'AAM-S', W2B: 'AAM-M', W8B: 'AAM-M' } },
  // heavy strike: Sniper, 2 GB-20 on the wings, 4 GB-5 on the CFTs, 2 AAM-S
  strike: { cft: true, st: { RIN: 'TGP-9', W2: 'GB-20', W8: 'GB-20', LCFT1: 'GB-5', LCFT2: 'GB-5', RCFT1: 'GB-5', RCFT2: 'GB-5', W2A: 'AAM-S', W8A: 'AAM-S' } },
  // stand-off: Sniper, 2 SLAM-ER, 2 Barq, 2 AAM-S, 2 AAM-M
  standoff: { cft: true, st: { RIN: 'TGP-9', W2: 'ASM-L', W8: 'ASM-L', LCFT1: 'AGR-6', RCFT1: 'AGR-6', W2A: 'AAM-S', W8A: 'AAM-S', W2B: 'AAM-M', W8B: 'AAM-M' } },
};

/* ===== the aircraft ===== */
function F15SA(opt) {
  opt = opt || {};
  this.dT = opt.dT != null ? opt.dT : 0;                 // ISA deviation, K
  this.groundAt = opt.groundAt || (() => 0);              // terrain height (m above sea level) at (north, east)
  this.wind = opt.wind || { n: 0, e: 0, d: 0 };           // steady wind (m/s, the air's velocity, NED)
  this.turb = opt.turb != null ? opt.turb : 0;            // turbulence: 0 none, 1 light, 2 moderate
  this.w20 = opt.w20 != null ? opt.w20 : null;           // the wind at 20 ft (knots) the low-altitude turbulence scales with
  this.seed = opt.seed || 1;
  this.eng = [new Engine(), new Engine()];
  // surfaces: commanded and actual
  this.cmd = { stab: 0, dstab: 0, ail: 0, rud: 0 };
  this.srf = { stab: 0, dstab: 0, ail: 0, rud: 0 };
  this.sb = 0; this.sbCmd = 0; this.flap = 0; this.flapCmd = 0; this.gear = 0; this.gearCmd = 0;
  this.brake = 0; this.steer = 0; this.nws = true;
  this.loadout(opt.loadout || 'cas', opt.fuel != null ? opt.fuel : 1);
  // state: position NED, attitude quaternion (body → NED), body velocity, body rates
  this.pos = [0, 0, 0]; this.quat = [1, 0, 0, 0]; this.vel = [0, 0, 0]; this.w = [0, 0, 0];
  this.t = 0; this.adot = 0;
  this.tg = [0, 0, 0]; this.tgA = [0, 0, 0]; this.rng = this.seed;
  // the flight control computer's state
  this.fcs = { nz: 1, p: 0, beta: 0, mode: 'nz', theta: 0, pInt: 0, nzInt: 0 };
  this.gearPts = [
    // name, body position (m from the centre of gravity), spring N/m, damper N·s/m, wheel?
    { n: 'nose', r: [4.9, 0, 2.0], k: 150e3, c: 26e3, wheel: true, steer: true, brake: false, mu: 0 },
    { n: 'left', r: [-0.55, -1.375, 2.0], k: 430e3, c: 85e3, wheel: true, brake: true, mu: 0 },
    { n: 'right', r: [-0.55, 1.375, 2.0], k: 430e3, c: 85e3, wheel: true, brake: true, mu: 0 },
    // the nozzles: they touch at about 15° nose up on the compressed main struts
    { n: 'tailL', r: [-7.7, -0.6, -0.1], k: 600e3, c: 60e3, wheel: false },
    { n: 'tailR', r: [-7.7, 0.6, -0.1], k: 600e3, c: 60e3, wheel: false },
    { n: 'belly', r: [0, 0, 1.2], k: 900e3, c: 120e3, wheel: false },
  ];
  this.update();
}

F15SA.prototype.loadout = function (name, fuelFrac) {
  const L = typeof name === 'string' ? LOADOUTS[name] : name;
  this.cft = !!L.cft;
  this.stores = Object.assign({}, L.st);
  this.fuelCap = MASS.intFuel + (this.cft ? MASS.cftFuel : 0);
  this.fuel = this.fuelCap * clamp(fuelFrac, 0, 1);
  for (const k in this.stores) { const s = STORES[this.stores[k]]; if (s.fuel) { this.fuelCap += s.fuel; this.fuel += s.fuel * clamp(fuelFrac, 0, 1); } }
  this.massProps();
};
F15SA.prototype.release = function (station) {
  const s = this.stores[station]; if (!s) return null;
  delete this.stores[station]; this.massProps(); return s;
};
// mass, inertia and store drag from what is on board
F15SA.prototype.massProps = function () {
  let m = MASS.empty + MASS.crew + MASS.gun + (this.cft ? MASS.cftEmpty : 0) + this.fuel, cd = this.cft ? 12 : 0;
  let Ixx = 0, Izz = 0;
  const pylons = {};
  for (const k in this.stores) {
    const s = STORES[this.stores[k]], y = STATIONS[k] || 0;
    // tangential carriage on the CFTs (no rack, in the fuselage's shadow) has about 60 % of a pylon store's drag
    m += s.kg; cd += s.cd * (/CFT/.test(k) ? 0.6 : 1);
    Ixx += s.kg * (y * y + 1.0); Izz += s.kg * (y * y + 2.0);
    if (/^W[28]/.test(k)) pylons[k.slice(0, 2)] = 1;
  }
  // a wing pylon stays on once fitted, loaded or not
  const np = Object.keys(pylons).length;
  m += np * PYLON_KG; cd += np * PYLON_CD;
  // fuel: internal in the wings (Ixx) and fuselage; CFT fuel along the sides
  const wingFuel = Math.min(this.fuel, 2 * 1800 * LB);
  Ixx += wingFuel * 9 + (this.cft ? Math.min(Math.max(this.fuel - MASS.intFuel, 0), MASS.cftFuel) * 2.4 : 0);
  Izz += wingFuel * 9;
  const s = m / MASS.Iref;
  this.m = m; this.storeCD = cd * 1e-4;
  this.I = { xx: MASS.Ixx * (0.75 + 0.25 * s) + Ixx * 0.5, yy: MASS.Iyy * (0.8 + 0.2 * s), zz: MASS.Izz * (0.8 + 0.2 * s) + Izz * 0.5, xz: MASS.Ixz };
  const I = this.I, det = I.xx * I.zz - I.xz * I.xz;
  this.Iinv = { xx: I.zz / det, zz: I.xx / det, xz: I.xz / det };
  // the structural limit: +9 g up to 50,000 lb, then the same load (n·W) above it (+7.3 g at 61,500 lb)
  this.nMax = Math.min(9, 9 * 50000 * LB / m); this.nMin = -3;
};

// rotation matrix body → NED from the quaternion
function dcm(q) {
  const [a, b, c, d] = q;
  return [
    a * a + b * b - c * c - d * d, 2 * (b * c - a * d), 2 * (b * d + a * c),
    2 * (b * c + a * d), a * a - b * b + c * c - d * d, 2 * (c * d - a * b),
    2 * (b * d - a * c), 2 * (c * d + a * b), a * a - b * b - c * c + d * d,
  ];
}
const mulv = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
const mulvT = (R, v) => [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function quatFromEuler(psi, th, ph) {
  const cy = Math.cos(psi / 2), sy = Math.sin(psi / 2), cp = Math.cos(th / 2), sp = Math.sin(th / 2), cr = Math.cos(ph / 2), sr = Math.sin(ph / 2);
  return [cr * cp * cy + sr * sp * sy, sr * cp * cy - cr * sp * sy, cr * sp * cy + sr * cp * sy, cr * cp * sy - sr * sp * cy];
}
function eulerFromQuat(q) {
  const [a, b, c, d] = q;
  const ph = Math.atan2(2 * (a * b + c * d), 1 - 2 * (b * b + c * c));
  const th = Math.asin(clamp(2 * (a * c - d * b), -1, 1));
  const psi = Math.atan2(2 * (a * d + b * c), 1 - 2 * (c * c + d * d));
  return { psi, th, ph };
}

// place the aircraft: north, east, height (m above sea level), heading, true airspeed (m/s), flight-path angle, bank;
// trimmed for that flight, or on its wheels when onGround
F15SA.prototype.place = function (o) {
  const h = o.h != null ? o.h : this.groundAt(o.n || 0, o.e || 0) + 1.75;
  this.pos = [o.n || 0, o.e || 0, -h];
  if (o.onGround) {
    this.quat = quatFromEuler(o.psi || 0, 0, 0); this.vel = [0, 0, 0]; this.w = [0, 0, 0];
    this.gear = this.gearCmd = 1; this.flap = this.flapCmd = o.flap != null ? o.flap : 1;
    for (const e of this.eng) { e.thr = 0; e.n = 0; e.ab = 0; e.lit = 0; }
    this.fcs.mode = 'ground'; this.brake = 1;
    // settle onto the struts
    for (let i = 0; i < 400; i++) this.step(1 / 200, true);
    this.brake = o.brake != null ? o.brake : 1;
  } else {
    this.gear = this.gearCmd = o.gear || 0; this.flap = this.flapCmd = o.flap || 0;
    const tr = this.trim(o.V, h, o.gamma || 0, o.psi || 0);
    this.trimRes = tr;
  }
  this.update();
};

// trim for steady wings-level flight at true airspeed V, height h, flight-path angle gamma: solve angle of attack,
// stabilator and throttle so the forces and the pitching moment balance (Newton iteration), and set the jet in it
F15SA.prototype.trim = function (V, h, gamma, psi) {
  const at = atmos(h, this.dT), M = V / at.a, q = 0.5 * at.rho * V * V, S = GEO.S, W = this.m * gravity(h);
  let a = 0.05, de = 0, thr = 0.7;
  const resid = (a, de, thr) => {
    const c = aero({ alpha: a, beta: 0, M, V, p: 0, q: 0, r: 0, adot: 0, stab: de, dstab: 0, ail: 0, rud: 0, sb: this.sb, flap: this.flap, gear: this.gear, hAGL: 1000, storeCD: this.storeCD });
    const T = this.thrustAt(thr, M, at);
    const L = c.CL * q * S, D = c.CD * q * S;
    // along and normal to the flight path
    const fx = T * Math.cos(a) - D - W * Math.sin(gamma);
    const fz = L + T * Math.sin(a) - W * Math.cos(gamma);
    return [fx / W, fz / W, c.Cm];
  };
  for (let it = 0; it < 60; it++) {
    const r = resid(a, de, thr), h1 = 1e-5;
    const J = [], x = [a, de, thr];
    for (let j = 0; j < 3; j++) { const xp = x.slice(); xp[j] += h1; const rp = resid(xp[0], xp[1], xp[2]); J.push([(rp[0] - r[0]) / h1, (rp[1] - r[1]) / h1, (rp[2] - r[2]) / h1]); }
    // solve J^T dx = -r (J stored by column)
    const A = [[J[0][0], J[1][0], J[2][0]], [J[0][1], J[1][1], J[2][1]], [J[0][2], J[1][2], J[2][2]]];
    const dx = solve3(A, [-r[0], -r[1], -r[2]]);
    if (!dx) break;
    a += clamp(dx[0], -0.05, 0.05); de += clamp(dx[1], -0.05, 0.05); thr += clamp(dx[2], -0.3, 0.3);
    a = clamp(a, -0.2, 0.6); de = clamp(de, SURF.stab.lo, SURF.stab.hi); thr = clamp(thr, 0, 2);
    if (Math.abs(r[0]) + Math.abs(r[1]) + Math.abs(r[2]) < 1e-9) break;
  }
  const r = resid(a, de, thr), ok = Math.abs(r[0]) < 1e-4 && Math.abs(r[1]) < 1e-4 && Math.abs(r[2]) < 1e-5 && thr <= 2 && thr >= 0;
  const th = gamma + a;
  this.quat = quatFromEuler(psi, th, 0);
  this.vel = [V * Math.cos(a), 0, V * Math.sin(a)];
  // add the wind: body velocity is inertial
  const R = dcm(this.quat), wb = mulvT(R, [this.wind.n, this.wind.e, this.wind.d]);
  this.vel = [this.vel[0] + wb[0], this.vel[1] + wb[1], this.vel[2] + wb[2]];
  this.w = [0, 0, 0];
  this.srf.stab = this.cmd.stab = de;
  for (const e of this.eng) { e.thr = thr; e.n = Math.min(thr, 1); e.ab = Math.max(thr - 1, 0); e.lit = thr > 1 ? 1 : 0; }
  this.fcs.mode = 'nz'; this.fcs.nz = Math.cos(gamma); this.fcs.nzF = Math.cos(gamma); this.fcs.p = 0; this.fcs.nzInt = 0;
  return { ok, alpha: a, stab: de, thr, M, resid: r };
};
function solve3(A, b) {
  const m = A.map((r, i) => [...r, b[i]]);
  for (let i = 0; i < 3; i++) {
    let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
    if (Math.abs(m[p][i]) < 1e-14) return null;
    [m[i], m[p]] = [m[p], m[i]];
    for (let k = i + 1; k < 3; k++) { const f = m[k][i] / m[i][i]; for (let j = i; j < 4; j++) m[k][j] -= f * m[i][j]; }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) { let s = m[i][3]; for (let j = i + 1; j < 3; j++) s -= m[i][j] * x[j]; x[i] = s / m[i][i]; }
  return x;
}
// steady thrust of both engines at a throttle setting (for trim)
F15SA.prototype.thrustAt = function (thr, M, at) {
  const e = new Engine(); e.thr = thr; e.n = Math.min(thr, 1); e.ab = Math.max(thr - 1, 0); e.lit = thr > 1 ? 1 : 0;
  e.step(0, M, at); return 2 * e.F;
};

/* ===== turbulence: Dryden (MIL-F-8785C), first-order shaping of white noise on each axis ===== */
F15SA.prototype.rand = function () {
  // Box-Muller on a small LCG, so a run repeats exactly
  const u = () => { this.rng = (this.rng * 1664525 + 1013904223) >>> 0; return (this.rng + 0.5) / 4294967296; };
  return Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
};
F15SA.prototype.turbStep = function (dt, hAGL, V) {
  if (!this.turb || dt <= 0) { this.tg = [0, 0, 0]; this.tgA = [0, 0, 0]; return; }
  const hf = Math.max(hAGL / FT, 10);
  // σ: light 1 m/s, moderate 2 m/s near the ground (the w-component); lengths and the u/v intensities by the spec's
  // low-altitude model below 1,000 ft, 1,750 ft lengths above 2,000 ft
  // (the spec's light and moderate winds at 20 ft, or the day's own: light turbulence over a runway in a 7 knot wind
  // is a gentle stir, not the 15 knot case's, which rocked a jet on its takeoff run 2° each way)
  const w20 = (this.w20 != null ? Math.max(this.w20, 3) * (this.turb === 1 ? 1 : 2) : this.turb === 1 ? 15 : 30) * KT;
  let Lu, Lw, su, sw;
  if (hf < 1000) { Lw = hf * FT; Lu = hf / Math.pow(0.177 + 0.000823 * hf, 1.2) * FT; sw = 0.1 * w20; su = sw / Math.pow(0.177 + 0.000823 * hf, 0.4); }
  else { Lu = Lw = 1750 * FT; const s = (this.turb === 1 ? 1.0 : 2.0) * (this.w20 != null ? Math.max(this.w20, 3) / 15 : 1) * (hf < 2000 ? 1 : Math.max(1 - (hf - 2000) / 40000, 0.3)); su = sw = s; }
  const Vs = Math.max(V, 30);
  const step = (x, L, s) => { const a = Math.exp(-Vs * dt / L); return a * x + s * Math.sqrt(1 - a * a) * this.rand(); };
  this.tg = [step(this.tg[0], Lu, su), step(this.tg[1], Lu, su), step(this.tg[2], Lw, sw)];
  // what the airframe feels: the gust averaged over its 19.4 m length (a gust shorter than the jet does not meet all of
  // it at once; at runway height the spec's lengths are a few metres, and they rocked it on its wheels)
  const k = Math.min(1, Vs * dt / GEO.len); for (let i = 0; i < 3; i++) this.tgA[i] += (this.tg[i] - this.tgA[i]) * k;
};

/* ===== equations of motion ===== */
// forces and moments in body axes at state s = { pos, quat, vel, w }
F15SA.prototype.forces = function (s, out) {
  const R = dcm(s.quat), h = -s.pos[2];
  const at = atmos(h, this.dT), g = gravity(h);
  // air-relative velocity: inertial minus wind (steady + gusts, the gusts in body axes)
  const wb = mulvT(R, [this.wind.n, this.wind.e, this.wind.d]);
  const ua = s.vel[0] - wb[0] - this.tgA[0], va = s.vel[1] - wb[1] - this.tgA[1], wa = s.vel[2] - wb[2] - this.tgA[2];
  const V = Math.max(Math.hypot(ua, va, wa), 0.1);
  const alpha = Math.atan2(wa, ua), beta = Math.asin(clamp(va / V, -1, 1)), M = V / at.a, qb = 0.5 * at.rho * V * V;
  const hAGL = h - this.groundAt(s.pos[0], s.pos[1]) - 1.75;
  const c = aero({ alpha, beta, M, V, p: s.w[0], q: s.w[1], r: s.w[2], adot: this.adot, stab: this.srf.stab, dstab: this.srf.dstab, ail: this.srf.ail, rud: this.srf.rud, sb: this.sb, flap: this.flap, gear: this.gear, hAGL, storeCD: this.storeCD });
  const S = GEO.S, ca = Math.cos(alpha), sa = Math.sin(alpha), cb = Math.cos(beta), sbt = Math.sin(beta);
  const L = c.CL * qb * S, D = c.CD * qb * S, Y = c.CY * qb * S;
  // wind axes into body axes
  let Fx = -D * ca * cb + L * sa, Fy = -D * sbt + Y, Fz = -D * sa * cb - L * ca;
  const T = this.eng[0].F + this.eng[1].F;
  Fx += T;
  // the engines 1.25 m apart: thrust difference yaws
  let Nm = (this.eng[0].F - this.eng[1].F) * 0.625;
  let Lm = c.Cl * qb * S * GEO.b, Mm = c.Cm * qb * S * GEO.c; Nm += c.Cn * qb * S * GEO.b;
  // weight
  const gb = mulvT(R, [0, 0, this.m * g]);
  Fx += gb[0]; Fy += gb[1]; Fz += gb[2];
  // the undercarriage and anything else touching the ground
  let wow = 0;
  const gnd = this.groundAt(s.pos[0], s.pos[1]);
  for (const gp of this.gearPts) {
    if (gp.wheel && this.gear < 0.99) { gp.load = 0; continue; }
    const pw = mulv(R, gp.r), zc = s.pos[2] + pw[2];          // contact point's z (down)
    const pen = zc + gnd;                                     // how far below the ground
    if (pen <= 0) { gp.load = 0; continue; }
    const vp = mulv(R, cross(s.w, gp.r));
    const vI = mulv(R, s.vel);
    const vc = [vI[0] + vp[0], vI[1] + vp[1], vI[2] + vp[2]];  // the point's velocity (NED)
    let N = gp.k * pen + gp.c * vc[2];
    if (N <= 0) { gp.load = 0; continue; }
    gp.load = N; if (gp.wheel) wow++;
    // the wheel's heading on the ground: body x projected, the nosewheel turned by its steering
    const fwdB = gp.steer && this.nws ? [Math.cos(this.steer), Math.sin(this.steer), 0] : [1, 0, 0];
    const fw = mulv(R, fwdB); const fl = Math.hypot(fw[0], fw[1]) || 1; const ex = [fw[0] / fl, fw[1] / fl], ey = [-ex[1], ex[0]];
    const vx = vc[0] * ex[0] + vc[1] * ex[1], vy = vc[0] * ey[0] + vc[1] * ey[1];
    let fxg, fyg;
    if (gp.wheel) {
      // rolling resistance and the anti-skid brakes along the wheel (0.45 on dry concrete, held below the skid);
      // the tyre's side force saturates with slip velocity
      const mu = 0.015 + (gp.brake ? 0.45 * this.brake : 0);
      fxg = -mu * N * Math.tanh(vx / 0.3);
      fyg = -0.7 * N * Math.tanh(vy / 0.6);
    } else {
      fxg = -0.45 * N * Math.tanh(vx / 0.3); fyg = -0.45 * N * Math.tanh(vy / 0.3);   // metal on concrete
    }
    const FN = [fxg * ex[0] + fyg * ey[0], fxg * ex[1] + fyg * ey[1], -N];
    const Fb = mulvT(R, FN);
    Fx += Fb[0]; Fy += Fb[1]; Fz += Fb[2];
    const mo = cross(gp.r, Fb); Lm += mo[0]; Mm += mo[1]; Nm += mo[2];
    if (!gp.wheel) this.scrape = (this.scrape || 0) + 1;
  }
  if (out) Object.assign(out, { at, g, V, alpha, beta, M, qb, c, hAGL, wow, T, L, D, Fa: [Fx - gb[0], Fy - gb[1], Fz - gb[2]], R });
  return { F: [Fx, Fy, Fz], Mo: [Lm, Mm, Nm] };
};

F15SA.prototype.deriv = function (s) {
  const { F, Mo } = this.forces(s), m = this.m, I = this.I, Ii = this.Iinv;
  const [u, v, w] = s.vel, [p, q, r] = s.w;
  const du = F[0] / m + r * v - q * w, dv = F[1] / m + p * w - r * u, dw = F[2] / m + q * u - p * v;
  // Euler's equations with the xz product of inertia
  const Lr = Mo[0] - (I.zz - I.yy) * q * r + I.xz * p * q;
  const Nr = Mo[2] - (I.yy - I.xx) * p * q - I.xz * q * r;
  const dp = Ii.xx * Lr + Ii.xz * Nr, dr = Ii.xz * Lr + Ii.zz * Nr;
  const dq = (Mo[1] - (I.xx - I.zz) * p * r - I.xz * (p * p - r * r)) / I.yy;
  const R = dcm(s.quat), dpos = mulv(R, s.vel);
  const [a, b, c, d] = s.quat;
  const dqt = [0.5 * (-b * p - c * q - d * r), 0.5 * (a * p + c * r - d * q), 0.5 * (a * q - b * r + d * p), 0.5 * (a * r + b * q - c * p)];
  return { pos: dpos, quat: dqt, vel: [du, dv, dw], w: [dp, dq, dr] };
};
const addS = (s, d, h) => ({ pos: s.pos.map((x, i) => x + d.pos[i] * h), quat: s.quat.map((x, i) => x + d.quat[i] * h), vel: s.vel.map((x, i) => x + d.vel[i] * h), w: s.w.map((x, i) => x + d.w[i] * h) });

// one integration step (RK4) with the actuators, engines, fuel and the flight control law updated first
F15SA.prototype.step = function (dt, settle) {
  const o = this.o || this.update();
  if (!settle) {
    this.turbStep(dt, o.hAGL, o.V);
    this.flightControl(dt, o);
    for (const e of this.eng) e.step(dt, o.M, o.at);
    // fuel: the engines draw it; the tanks feed them until they are dry
    const burn = (this.eng[0].ff + this.eng[1].ff) * dt;
    this.fuel = Math.max(this.fuel - burn, 0);
    if (this.fuel <= 0) for (const e of this.eng) e.on = false;
    this.mtick = (this.mtick || 0) + dt; if (this.mtick > 1) { this.mtick = 0; this.massProps(); }
    // gear, flaps, speed brake travel; the flaps blow up above 250 KCAS (the ZF-25's automatic retraction)
    this.gear += clamp(this.gearCmd - this.gear, -dt / 7, dt / 7);
    const fl = o.kcas > 250 ? 0 : this.flapCmd;
    this.flap += clamp(fl - this.flap, -dt / 4, dt / 4);
    this.sb += clamp(this.sbCmd - this.sb, -dt / 2.5, dt / 3);
  }
  // actuators: first-order lag with rate and travel limits
  for (const k in SURF) {
    const A = SURF[k], c = clamp(this.cmd[k], A.lo, A.hi);
    const want = this.srf[k] + (c - this.srf[k]) * Math.min(dt / A.tau, 1);
    this.srf[k] = clamp(this.srf[k] + clamp(want - this.srf[k], -A.rate * dt, A.rate * dt), A.lo, A.hi);
  }
  // the stabilators share their travel: symmetric plus differential stays within each one's limits
  const sL = this.srf.stab + this.srf.dstab, sR = this.srf.stab - this.srf.dstab;
  if (sL > SURF.stab.hi || sR > SURF.stab.hi || sL < SURF.stab.lo || sR < SURF.stab.lo) {
    const room = Math.min(SURF.stab.hi - this.srf.stab, this.srf.stab - SURF.stab.lo);
    this.srf.dstab = clamp(this.srf.dstab, -Math.max(room, 0), Math.max(room, 0));
  }
  const s0 = { pos: this.pos, quat: this.quat, vel: this.vel, w: this.w };
  this.scrape = 0;
  const k1 = this.deriv(s0), k2 = this.deriv(addS(s0, k1, dt / 2)), k3 = this.deriv(addS(s0, k2, dt / 2)), k4 = this.deriv(addS(s0, k3, dt));
  const comb = (key) => s0[key].map((x, i) => x + dt / 6 * (k1[key][i] + 2 * k2[key][i] + 2 * k3[key][i] + k4[key][i]));
  this.pos = comb('pos'); this.vel = comb('vel'); this.w = comb('w');
  const q = comb('quat'), qn = Math.hypot(q[0], q[1], q[2], q[3]); this.quat = q.map(x => x / qn);
  this.t += dt;
  const prevA = o.alpha;
  this.update();
  if (dt > 0) this.adot = lerp(this.adot, (this.o.alpha - prevA) / dt, Math.min(dt * 30, 1));
  return this.o;
};

// the derived flight data the crew, the game and the pilot read
F15SA.prototype.update = function () {
  const o = {};
  const s = { pos: this.pos, quat: this.quat, vel: this.vel, w: this.w };
  const { F } = this.forces(s, o);
  const e = eulerFromQuat(this.quat);
  const vI = mulv(o.R, this.vel);
  o.psi = e.psi; o.theta = e.th; o.phi = e.ph;
  o.h = -this.pos[2]; o.n = this.pos[0]; o.e = this.pos[1];
  o.vn = vI[0]; o.ve = vI[1]; o.vd = vI[2];
  o.gs = Math.hypot(vI[0], vI[1]); o.track = Math.atan2(vI[1], vI[0]); o.vs = -vI[2];
  o.gamma = Math.asin(clamp(-vI[2] / Math.max(Math.hypot(vI[0], vI[1], vI[2]), 0.1), -1, 1));
  o.tas = o.V; o.cas = o.V > 1 ? casFromTas(o.V, o.at) : 0; o.kcas = o.cas / KT; o.ktas = o.V / KT;
  // load factor the crew feel (specific force along body -z, in g) and the accelerometer's x and y
  o.nz = -o.Fa[2] / (this.m * G0); o.nx = o.Fa[0] / (this.m * G0); o.ny = o.Fa[1] / (this.m * G0);
  o.p = this.w[0]; o.q = this.w[1]; o.r = this.w[2];
  o.fuel = this.fuel; o.mass = this.m; o.ff = this.eng[0].ff + this.eng[1].ff;
  o.wow = o.wow > 0; o.weight = this.m * o.g;
  o.gear = this.gear; o.gearCmd = this.gearCmd;   // the undercarriage: where it is (0 up, 1 down) and where it is told to be
  this.o = o;
  return o;
};

/* ===== the flight control law (ZF-25 digital fly-by-wire) =====
   Inputs: fcs.nz (g, body), fcs.p (roll rate about the velocity vector, rad/s), the sideslip held at 0. In 'theta'
   mode (on the runway, rotating) the pitch attitude fcs.theta is commanded instead of g.
   Dynamic inversion: the wanted body angular accelerations are turned into the surface positions that give them,
   with the model's own derivatives; the surfaces' travel and rate limits keep what is asked physical. */
F15SA.prototype.flightControl = function (dt, o) {
  const f = this.fcs, c = o.c, I = this.I, qS = o.qb * GEO.S, V = Math.max(o.V, 30);
  const p = this.w[0], q = this.w[1], r = this.w[2];
  if (f.mode === 'ground' && o.kcas < 60) { this.cmd.stab = 0; this.cmd.dstab = 0; this.cmd.ail = 0; this.cmd.rud = 0; return; }
  // ---- pitch
  let qCmd;
  const aLim = (o.M < 0.9 ? 28 : lerp(28, 20, smooth(0.9, 1.4, o.M))) * D2R;
  if (f.mode === 'theta' || f.mode === 'ground') {
    // the attitude: a pitch rate toward it; on the wheels the struts take part of the moment the stab makes, so the
    // stick goes on coming back (or forward) until the attitude moves: an integrator on the attitude error
    const eth = wrapA((f.theta || 0) - o.theta);
    f.thInt = o.wow ? clamp((f.thInt || 0) + eth * dt, -0.08, 0.08) : (f.thInt || 0) * Math.exp(-dt);
    qCmd = clamp(2.0 * eth + 1.5 * f.thInt, -0.11, 0.11);
    f.nzF = o.nz; f.nzInt = 0;
  } else {
    f.thInt = 0;
    // g command, limited by the structure and by what the wing can give at the angle-of-attack limit; shaped by a
    // 0.12 s prefilter (no overshoot past the limit), a slow integrator (held while the error is large) removing the
    // steady error
    const cLim = aero({ alpha: aLim, beta: 0, M: o.M, V: o.V, p: 0, q: 0, r: 0, adot: 0, stab: 0, dstab: 0, ail: 0, rud: 0, sb: 0, flap: this.flap, gear: this.gear, hAGL: o.hAGL, storeCD: 0 });
    const nzAv = Math.max(cLim.CL * o.qb * GEO.S / (this.m * o.g), 1);
    const nzc = clamp(f.nz, this.nMin, Math.min(this.nMax, nzAv));
    f.nzF = f.nzF == null ? nzc : f.nzF + (nzc - f.nzF) * Math.min(dt / 0.12, 1);
    const cphi = Math.cos(o.phi), cth = Math.cos(o.theta);
    const ff = G0 / V * (f.nzF - cth * cphi);
    const en = f.nzF - o.nz;
    if (Math.abs(en) < 0.3) f.nzInt = clamp(f.nzInt + en * dt * 0.8, -1.5, 1.5);
    qCmd = clamp(ff + G0 / V * (1.6 * en + f.nzInt), -0.6, 0.6);
    // the angle-of-attack limiter, with lead on the pitch rate: from 1.5° short of the limit the pull is taken away
    const over = o.alpha + 0.2 * q - (aLim - 1.5 * D2R);
    if (over > 0) qCmd = Math.min(qCmd, G0 / V * (1 - cth * cphi) - 4.0 * over);
    const under = (-10 * D2R) - (o.alpha + 0.25 * q); if (under > 0) qCmd = Math.max(qCmd, 4.0 * under);
  }
  const qdot = 6.0 * (qCmd - q);
  // the moment that gives it, and the stab that makes that moment
  const Mreq = I.yy * qdot + (I.xx - I.zz) * p * r + I.xz * (p * p - r * r);
  const Cmreq = Mreq / (qS * GEO.c + 1);
  const Cm0 = c.Cm - c.Cmde * this.srf.stab;                 // the moment without the stab
  if (qS > 2000) this.cmd.stab = (Cmreq - Cm0) / c.Cmde; else this.cmd.stab = clamp(-qdot * 0.3, SURF.stab.lo, SURF.stab.hi);
  // ---- roll and yaw: roll about the velocity vector at the commanded rate, the sideslip and yaw rate as a coordinated
  // turn needs them
  const pmax = this.rollLimit(o);
  const ps = clamp(f.p, -pmax, pmax);
  const ca = Math.cos(o.alpha), sa = Math.sin(o.alpha);
  // in stability axes the sideslip changes as β' = (g·cosθ·sinφ + side force/m)/V − r_s: so the stability-axis yaw rate
  // that keeps it at zero is that, plus a feedback nose-into-it; rolling about the velocity vector is p_s. Into body
  // axes: p = p_s·cosα − r_s·sinα, r = p_s·sinα + r_s·cosα. On the wheels the yaw rate is the pilot's (his feet steer
  // down the runway).
  const rs = (G0 * Math.cos(o.theta) * Math.sin(o.phi) + o.Fa[1] / this.m) / V + 3.0 * o.beta;
  const pB = ps * ca - rs * sa;
  const rB = o.wow ? (f.r || 0) : ps * sa + rs * ca;
  const pdot = 5.0 * (pB - p), rdot = 5.0 * (rB - r);        // the same bandwidth, so yaw keeps step with roll
  const Lreq = I.xx * pdot - I.xz * rdot + (I.zz - I.yy) * q * r - I.xz * p * q;
  const Nreq = I.zz * rdot - I.xz * pdot + (I.yy - I.xx) * p * q + I.xz * q * r;
  const qSb = qS * GEO.b + 1;
  const Clr = Lreq / qSb, Cnr = Nreq / qSb;
  // what the surfaces must add to the airframe's own moments; the ailerons and differential stabs move together
  const Cl0 = c.Cl - (c.Clda * this.srf.ail + c.Cldd * this.srf.dstab + c.Cldr * this.srf.rud);
  const Cn0 = c.Cn - (c.Cnda * this.srf.ail + c.Cndd * this.srf.dstab + c.Cndr * this.srf.rud);
  const kd = 0.5;                                                      // differential stab per aileron
  const a11 = c.Clda + kd * c.Cldd, a12 = c.Cldr, a21 = c.Cnda + kd * c.Cndd, a22 = c.Cndr;
  const det = a11 * a22 - a12 * a21;
  if (qS > 2000 && Math.abs(det) > 1e-8) {
    const bl = Clr - Cl0, bn = Cnr - Cn0;
    const ail = (bl * a22 - a12 * bn) / det, rud = (a11 * bn - a21 * bl) / det;
    this.cmd.ail = ail; this.cmd.dstab = ail * kd; this.cmd.rud = rud;
  } else { this.cmd.ail = 0; this.cmd.dstab = 0; this.cmd.rud = 0; }
  // on all three wheels the tyres hold the yaw, not the fin: the feet put in rudder as a pilot does, by how far the
  // yaw rate is off what he wants, with the nosewheel; the stick near the middle (on the mains only, the nose up, the
  // fin is all there is against a crosswind: the inversion as in the air) (inverting the airframe's moments alone there,
  // the struts and tyres left out, asked for full rudder and aileron each way as they came alive at 60 knots, and a
  // takeoff run begun a degree off the centreline swung off the runway)
  if (o.wow && this.gearPts[0].load > 0) { this.cmd.rud = clamp(0.6 * (rB - r) + this.steer * 0.3, -0.5, 0.5); this.cmd.ail = clamp(0.4 * (pB - p), -0.2, 0.2); this.cmd.dstab = this.cmd.ail * kd; }
};
// the roll-rate limit of the control law: 200°/s clean at high dynamic pressure, less with wing stores and at high
// angle of attack, less again in the landing configuration
F15SA.prototype.rollLimit = function (o) {
  let lim = 200 * D2R;
  let wingStores = 0; for (const k in this.stores) if (/^W/.test(k)) wingStores += STORES[this.stores[k]].kg;
  lim *= 1 - clamp(wingStores / 4000, 0, 0.45);
  lim *= 1 - 0.6 * smooth(15 * D2R, 28 * D2R, o.alpha);
  if (this.gear > 0.5) lim = Math.min(lim, 90 * D2R);
  return lim;
};

/* ===== controls the pilot works ===== */
F15SA.prototype.setThrottle = function (t) { for (const e of this.eng) e.thr = clamp(t, 0, 2); };

/* ===== the pilot in the front seat =====
   He flies the jet through its controls only (stick: g and roll rate into the fly-by-wire; throttles; gear, flaps,
   speed brake, brakes, nosewheel steering), the way a pilot flies: attitude and flight path inside, heading, height
   and speed outside. Modes: 'nav' (a height, a speed, a course or a point), 'orbit' (a circle over the ground,
   whatever the wind), 'line' (an attack run down a line to a point), 'taxi' (along a path on the ground), 'takeoff'
   and 'land' (a runway), 'direct' (the caller works the controls). */
function Pilot(ac) {
  this.ac = ac; this.mode = 'direct'; this.phase = ''; this.tgt = {};
  this.thrI = 0.6; this.nzPrev = 1; this.t = 0; this.tPhase = 0;
  // how hard he flies: bank and roll rate, g. A strike crew in an orbit flies smoothly; in a break he pulls.
  this.lim = { bank: 45 * D2R, roll: 45 * D2R, nz: 4, nzMin: -0.5, onset: 3, vs: 60 };
  this.log = [];
}
Pilot.prototype.set = function (mode, tgt, lim) {
  this.mode = mode; this.tgt = Object.assign({}, tgt || {}); this.phase = ''; this.tPhase = 0;
  if (lim) Object.assign(this.lim, lim);
  const o = this.ac.o;
  this.thrI = clamp(this.ac.eng[0].thr, 0, 2); this.nzPrev = o ? o.nz : 1;
  if (mode !== 'takeoff' && mode !== 'land' && mode !== 'taxi' && this.ac.fcs.mode !== 'nz' && !(o && o.wow)) this.ac.fcs.mode = 'nz';
};
Pilot.prototype.go = function (phase) { this.phase = phase; this.tPhase = 0; this.log.push([+this.t.toFixed(2), phase]); };

// --- inner loops
// roll to a bank angle: as fast as he allows himself, easing in so he stops on it
Pilot.prototype.rollTo = function (phiC) {
  const o = this.ac.o, e = wrapA(phiC - o.phi), ea = Math.abs(e);
  this.ac.fcs.p = Math.sign(e) * Math.min(this.lim.roll, Math.sqrt(2 * 2.5 * ea) * 0.85, 3.0 * ea);
};
// a flight-path angle, with the wings where they are: the g that bends the path, over the bank
Pilot.prototype.pathTo = function (gC, k) {
  const ac = this.ac, o = ac.o, V = Math.max(o.V, 40);
  const cph = Math.max(Math.cos(o.phi), 0.2);
  let nz = (Math.cos(o.gamma) + V / G0 * (k || 0.9) * (gC - o.gamma)) / cph;
  nz = clamp(nz, this.lim.nzMin, Math.min(this.lim.nz, ac.nMax));
  this.nzSet(nz);
};
Pilot.prototype.nzSet = function (nz) {
  const d = this.lim.onset * this.dt;
  nz = clamp(nz, this.nzPrev - d, this.nzPrev + d);
  this.nzPrev = nz; this.ac.fcs.mode = 'nz'; this.ac.fcs.nz = nz;
};
// a course over the ground: a turn rate toward it, as a bank
Pilot.prototype.courseTo = function (chiC, ff) {
  const o = this.ac.o, e = wrapA(chiC - o.track), gs = Math.max(o.gs, 40);
  const rate = clamp(0.35 * e, -0.5, 0.5);
  const phi = clamp(Math.atan(gs * rate / G0) + (ff || 0), -this.lim.bank, this.lim.bank);
  this.rollTo(phi);
};
// height and speed together, the way a pilot shares them between stick and throttle (total energy control): the
// throttles set how fast the energy grows (climb rate plus acceleration), the stick how it is shared; when the
// throttles are at their stop (military, or the afterburner if allowed; or idle) the stick keeps the speed and the
// height gives way
Pilot.prototype.energyTo = function (hC, o2, vsMax) {
  const ac = this.ac, o = ac.o, V = Math.max(o.V, 40), dt = this.dt;
  const vMax = vsMax || this.lim.vs;
  const vsD = clamp(0.12 * (hC - o.h), -vMax, vMax);
  let eV;
  if (o2.mach) eV = (o2.mach - o.M) * o.at.a; else eV = (o2.kcas * KT - o.cas) * (o.V / Math.max(o.cas, 30));
  const aD = clamp(0.12 * eV, -3, 3);
  this.accel();
  const gD = Math.asin(clamp(vsD / V, -0.9, 0.9));
  const eD = gD + aD / G0, eN = o.gamma + this.vdot / G0;
  const top = o2.ab ? 2 : 1;
  this.thrI = clamp(this.thrI + 1.2 * (eD - eN) * dt * 3, 0, top);
  let thr = clamp(this.thrI + 2.5 * (eD - eN), 0, top);
  if (thr > 1 && thr < 1.02) thr = 1;
  ac.setThrottle(thr);
  // the stick: the path he wants, unless the throttles cannot give the energy for it at this speed. Holding a height
  // (within 150 m of it) he keeps it and lets the speed come or go more slowly, as a crew does in a hard turn heavy;
  // on a climb or a descent, or with the wing near its limit (the angle of attack up, the airspeed low), the height
  // gives way to the speed
  let gC = gD;
  const hold = 1 - smooth(150, 300, Math.abs(hC - o.h));
  if (this.thrI >= top - 1e-3 && eD > eN) {
    const wing = Math.max(smooth(12 * D2R, 16 * D2R, o.alpha), 1 - smooth(240 * KT, 280 * KT, o.cas));
    gC = lerp(Math.min(gD, eN - aD / G0 + 0.5 * (gD - o.gamma)), gD, hold * (1 - wing));
  } else if (this.thrI <= 1e-3 && eD < eN) gC = lerp(Math.max(gD, eN - aD / G0 + 0.5 * (gD - o.gamma)), gD, hold);
  this.pathTo(gC);
  this.ec = { vsD, aD, eD, eN, gC };
};
// the acceleration along the path, from the accelerometers (smoothed over 0.5 s): this.vdot
Pilot.prototype.accel = function () {
  const ac = this.ac, o = ac.o;
  const vdot = (o.Fa[0] * Math.cos(o.alpha) * Math.cos(o.beta) + o.Fa[1] * Math.sin(o.beta) + o.Fa[2] * Math.sin(o.alpha) * Math.cos(o.beta)) / ac.m - o.g * Math.sin(o.gamma);
  this.vdot = this.vdot == null ? vdot : lerp(this.vdot, vdot, Math.min(this.dt * 2, 1));
};
// down a path at an airspeed (true, m/s), the way he flies a final: the stick holds the path (gC), the throttles the
// energy (the path plus the acceleration the speed wants), as energyTo. On the speed alone (speedTo) the throttles
// came late: the speed ran 25 knots past the approach speed and back, the nose swinging 6 to 16 degrees for a minute
// (the owner: the landing «فيه مشاكل»)
Pilot.prototype.pathAt = function (gC, vT) {
  const ac = this.ac, o = ac.o, dt = this.dt;
  this.accel();
  const aD = clamp(0.15 * (vT - o.V), -1.5, 1.5), eD = gC + aD / G0, eN = o.gamma + this.vdot / G0;
  this.thrI = clamp(this.thrI + 3.6 * (eD - eN) * dt, 0, 1);
  ac.setThrottle(clamp(this.thrI + 2.5 * (eD - eN), 0, 1));
  // (half the stick's usual gain toward the path: slow, the jet answers late, and at the full gain the nose swung
  // 7 to 14 degrees on final; at half it holds within a degree of 9.5, the glide path within 2 m)
  this.pathTo(gC, 0.45);
};
// airspeed (calibrated, m/s) or Mach on the throttles alone: a PI loop, afterburner only if allowed
Pilot.prototype.speedTo = function (o2) {
  const ac = this.ac, o = ac.o;
  let err;
  if (o2.mach) err = (o2.mach - o.M) * o.at.a; else err = (o2.kcas * KT - o.cas) * (o.V / Math.max(o.cas, 30));
  const top = o2.ab ? 2 : 1;
  this.thrI = clamp(this.thrI + err * 0.01 * this.dt, 0, top);
  let thr = clamp(this.thrI + 0.03 * err, 0, top);
  // the afterburner below its minimum step is not a setting: hold military until more is needed
  if (thr > 1 && thr < 1.02) thr = 1;
  ac.setThrottle(thr);
};

// --- the runway, in its own frame: along from the threshold, across (+ right of the centreline)
const rwyFrame = (rw, o) => {
  const dn = o.n - rw.n, de = o.e - rw.e, c = Math.cos(rw.psi), s = Math.sin(rw.psi);
  return { along: dn * c + de * s, across: -dn * s + de * c, dpsi: wrapA(o.psi - rw.psi), dtrk: wrapA(o.track - rw.psi) };
};
Pilot.prototype.wheelHeight = function () {
  const ac = this.ac, o = ac.o;
  return o.h - ac.groundAt(o.n, o.e) - (0.55 * Math.sin(o.theta) + 2.0 * Math.cos(o.theta) * Math.cos(o.phi) + 1.375 * Math.abs(Math.sin(o.phi)));
};
// nosewheel steering and rudder down the centreline: he looks down the runway to a point on the centreline, further
// the faster he goes (3 s ahead), and steers onto the arc that meets it (the feet: rudder through the flight
// controls, the nosewheel while it is down). (Fixed gains on the heading and the drift, the nosewheel's bite growing
// with the speed, swung a run begun a degree off the line off the runway near 70 knots)
Pilot.prototype.steerCentre = function (rw) {
  const ac = this.ac, o = ac.o, f = rwyFrame(rw, o), V = Math.max(o.gs, 3);
  const Ld = clamp(4 * V, 20, 260), al = clamp(-Math.atan2(f.across, Ld) - f.dpsi, -0.5, 0.5);
  const lim = lerp(15, 3, clamp(o.kcas / 100, 0, 1)) * D2R;
  ac.steer = clamp(Math.atan(2 * Math.sin(al) * 5.45 / Ld), -lim, lim);
  ac.fcs.r = clamp(2 * V * Math.sin(al) / Ld, -0.12, 0.12);
};

// what the jet lifts off at: CL at the 12° takeoff attitude on the wheels with the flaps down
Pilot.prototype.vLiftoff = function () {
  const ac = this.ac, o = ac.o;
  const c = aero({ alpha: 12 * D2R, beta: 0, M: 0.25, V: 90, p: 0, q: 0, r: 0, adot: 0, stab: -8 * D2R, dstab: 0, ail: 0, rud: 0, sb: 0, flap: ac.flap, gear: 1, hAGL: 0, storeCD: ac.storeCD });
  return Math.sqrt(2 * ac.m * o.g / (o.at.rho * GEO.S * c.CL));
};
// approach speed (true, m/s) at the on-speed angle of attack
Pilot.prototype.vApproach = function (alphaOn) {
  const ac = this.ac, o = ac.o;
  const c = aero({ alpha: alphaOn, beta: 0, M: 0.22, V: 75, p: 0, q: 0, r: 0, adot: 0, stab: -4 * D2R, dstab: 0, ail: 0, rud: 0, sb: 0, flap: 1, gear: 1, hAGL: 100, storeCD: ac.storeCD });
  return Math.sqrt(2 * ac.m * o.g * Math.cos(2.75 * D2R) / (o.at.rho * GEO.S * c.CL));
};

Pilot.prototype.fly = function (dt) {
  this.dt = dt; this.t += dt; this.tPhase += dt;
  const ac = this.ac, o = ac.o, T = this.tgt;
  switch (this.mode) {
    case 'nav': {
      if (T.point) {
        const chi = Math.atan2(T.point.e - o.e, T.point.n - o.n);
        this.courseTo(chi);
        T.dist = Math.hypot(T.point.e - o.e, T.point.n - o.n);
      } else this.courseTo(T.chi != null ? T.chi : o.track);
      this.energyTo(T.h != null ? T.h : o.h, T);
      ac.sbCmd = T.sb || 0;
      break;
    }
    case 'orbit': {
      // a vector field onto the circle: the tangent, turned in by how far off it he is; the bank a circle over the
      // ground needs at this ground speed fed forward, so the wind does not draw it out
      const dn = o.n - T.c.n, de = o.e - T.c.e, d = Math.hypot(dn, de), brg = Math.atan2(de, dn), dir = T.dir || 1;
      const off = (d - T.R) / T.R;
      const chi = brg + dir * (Math.PI / 2 + Math.atan(2.0 * off));
      const ffon = 1 - smooth(0.3, 0.8, Math.abs(off));
      const ff = dir * Math.atan(o.gs * o.gs / (G0 * T.R)) * ffon;
      const e = wrapA(chi - o.track), gs = Math.max(o.gs, 40);
      const phi = clamp(ff + Math.atan(gs * clamp(0.4 * e, -0.5, 0.5) / G0), -this.lim.bank, this.lim.bank);
      this.rollTo(phi);
      this.energyTo(T.h, T);
      T.dist = d; T.onCircle = Math.abs(d - T.R) < 0.05 * T.R;
      break;
    }
    case 'line': {
      // down a line to a point (the run-in to a release): cross-track error steered out
      const c = Math.cos(T.chi), s = Math.sin(T.chi), dn = o.n - T.p.n, de = o.e - T.p.e;
      const along = dn * c + de * s, across = -dn * s + de * c;
      const chi = T.chi - Math.atan(across / 1500);
      this.courseTo(chi);
      this.energyTo(T.h, T);
      T.togo = -along; T.across = across;
      break;
    }
    case 'taxi': this.flyTaxi(); break;
    case 'takeoff': this.flyTakeoff(); break;
    case 'land': this.flyLanding(); break;
    default: break;
  }
  return ac.step(dt);
};

/* Taxiing along a path (T.path: points {n, e}, the first where he starts): about 20 knots on the straights, slower
   into a turn (8 knots for a right angle) and down to a stop at the path's end (T.done once stopped there). His feet
   steer the nosewheel after a point a little way ahead on the path (pure pursuit: the arc through it from the main
   wheels), his hand holds the speed on the throttles, riding the brakes where idle thrust is too much. */
const TAXI = { v: 20 * KT, vTurn: 8 * KT, dec: 0.7, wb: 5.45, steer: 50 * D2R };
Pilot.prototype.flyTaxi = function () {
  const ac = this.ac, o = ac.o, T = this.tgt, P = T.path, dt = this.dt;
  ac.fcs.mode = 'ground'; ac.fcs.theta = 0; ac.fcs.p = 0; ac.fcs.r = 0; ac.gearCmd = 1; ac.sbCmd = 0;
  if (T.i == null) { T.i = 0; this.thrI = 0; }
  // where he is along the path: the segment he is on, how far along it
  const seg = i => { const a = P[i], b = P[i + 1], dn = b.n - a.n, de = b.e - a.e, l = Math.hypot(dn, de) || 1e-6; return { a, dn: dn / l, de: de / l, l }; };
  let g = seg(T.i), u = (o.n - g.a.n) * g.dn + (o.e - g.a.e) * g.de;
  while (u > g.l && T.i < P.length - 2) { T.i++; g = seg(T.i); u = (o.n - g.a.n) * g.dn + (o.e - g.a.e) * g.de; }
  T.across = -(o.n - g.a.n) * g.de + (o.e - g.a.e) * g.dn;
  // along the path from there: the point to steer at, the heading change to come, the distance left
  const L = clamp(5 + 1.0 * o.gs, 7, 18);
  let left = 0, turn = 0, aim = null;
  for (let i = T.i, s0 = clamp(u, 0, g.l); i < P.length - 1; i++, s0 = 0) {
    const h = seg(i), rest = h.l - s0;
    if (!aim && left + rest >= L) { const k = s0 + L - left; aim = { n: h.a.n + h.dn * k, e: h.a.e + h.de * k }; }
    if (i > T.i && left < 45) turn = Math.max(turn, Math.abs(wrapA(Math.atan2(h.de, h.dn) - Math.atan2(g.de, g.dn))));
    left += rest;
  }
  if (!aim) { const b = P[P.length - 1]; aim = { n: b.n + g.dn * L, e: b.e + g.de * L }; }
  T.left = left;
  // the speed: the straight's, the turn's, what stops him at the end
  const vTurn = lerp(T.v || TAXI.v, TAXI.vTurn, clamp(turn / (Math.PI / 2), 0, 1));
  const vGo = Math.min(T.v || TAXI.v, vTurn, T.stop === false ? 1e9 : Math.sqrt(2 * TAXI.dec * Math.max(left - 1, 0)));
  // the nosewheel: the arc from the main wheels through the aim point
  const al = wrapA(Math.atan2(aim.e - o.e, aim.n - o.n) - o.psi), Ld = Math.max(Math.hypot(aim.e - o.e, aim.n - o.n), 3);
  const lim = lerp(TAXI.steer, 10 * D2R, clamp((o.gs - 6) / 10, 0, 1));
  ac.steer = clamp(Math.atan(2 * Math.sin(al) * TAXI.wb / Ld), -lim, lim);
  // throttles and brakes
  const e = vGo - o.gs;
  this.thrI = clamp(this.thrI + 0.04 * e * dt, 0, 0.35);
  ac.setThrottle(e > 0 ? clamp(this.thrI + 0.06 * e, 0, 0.45) : 0);
  ac.brake = e < -0.4 ? clamp(-0.25 * (e + 0.4), 0, 1) : 0;
  if (left < 1.5 && o.gs < 0.6 && T.stop !== false) { ac.brake = 1; ac.setThrottle(0); this.thrI = 0; T.done = true; }
};

Pilot.prototype.flyTakeoff = function () {
  const ac = this.ac, o = ac.o, T = this.tgt, rw = T.rwy;
  if (!this.phase) {
    this.go('runup'); ac.flapCmd = 1; ac.gearCmd = 1; ac.brake = 1; ac.fcs.mode = 'ground'; ac.fcs.theta = 0;
    this.useAB = T.ab != null ? T.ab : ac.m > 25000;
    this.vr = this.vLiftoff() - 12 * KT;
  }
  switch (this.phase) {
    case 'runup':
      // the run-up against the brakes to 80 % (the engines checked), not full power: the nose would sit down 2° on the
      // struts and throw up as much when let go; then the brakes eased off over a second and a half as the throttles go
      // up (military, then the afterburner)
      ac.setThrottle(0.8); ac.brake = 1;
      if (ac.eng[0].n > 0.8 * 0.97 && this.tPhase > 2) this.go('roll');
      break;
    case 'roll': {
      const k = Math.min(1, this.tPhase / 1.5);
      ac.setThrottle(this.useAB && this.tPhase > 1.5 ? 2 : 0.8 + 0.2 * k); ac.brake = 1 - k;
      this.steerCentre(rw);
      ac.fcs.mode = 'ground'; ac.fcs.theta = 0; ac.fcs.p = 0;
      if (o.V >= this.vr) { this.go('rotate'); this.thC = 0; }
      break;
    }
    case 'rotate':
      // back stick to the takeoff attitude at 5°/s (the nozzles touch at 15°), fly it off
      this.thC = Math.min(this.thC + 5 * D2R * this.dt, 12 * D2R);
      ac.fcs.mode = 'theta'; ac.fcs.theta = this.thC; ac.fcs.p = 3 * (0 - o.phi);
      this.steerCentre(rw);
      if (!o.wow && this.wheelHeight() > 3) { this.go('airborne'); ac.gearCmd = 0; ac.steer = 0; this.nzPrev = o.nz; }
      break;
    case 'airborne':
      // hold the attitude while the speed builds, wings level on the runway heading; then the climb
      ac.fcs.mode = 'theta'; ac.fcs.theta = 12 * D2R;
      this.rollTo(0);
      ac.fcs.mode = 'theta';
      if (o.kcas > 200) ac.flapCmd = 0;
      if (o.kcas > 220) { this.go('climb'); this.nzPrev = o.nz; }
      break;
    case 'climb': {
      this.courseTo(T.chi != null ? T.chi : rw.psi);
      // afterburner out at 300 knots, then the climb at 350 knots in military
      if (o.kcas > 300) this.useAB = false;
      ac.flapCmd = 0;
      this.energyTo(T.h || 3000, { kcas: T.kcas || 350, ab: this.useAB }, T.vs || 100);
      if (Math.abs((T.h || 3000) - o.h) < 30) { this.go('done'); this.set('nav', { h: T.h || 3000, kcas: T.kcas || 350, chi: T.chi != null ? T.chi : rw.psi }); }
      break;
    }
  }
};

Pilot.prototype.flyLanding = function () {
  const ac = this.ac, o = ac.o, T = this.tgt, rw = T.rwy, f = rwyFrame(rw, o);
  const GS = (T.gs || 2.75) * D2R, aim = T.aim != null ? T.aim : 300;      // glide path, aim point past the threshold
  const elev = rw.elev, faf = T.faf || 12000;
  const alphaOn = (T.alphaOn || 12.5) * D2R;
  if (!this.phase) { this.go(f.along < -faf ? 'inbound' : 'final'); }
  const gpH = elev + Math.tan(GS) * (aim - f.along);       // the glide path's height here
  switch (this.phase) {
    case 'inbound': {
      // the extended centreline at the final approach fix's height, slowed and configured before the fix, as a pilot
      // flies it: 210 knots, then 3.5 km before the fix (or once that slow) the gear and the flaps and the approach
      // speed, the speed brake out while he is still fast. (At 250 knots to the fix he slowed on the glide path
      // itself, 260 knots down to 160 in the first two kilometres of the final)
      const chi = rw.psi - Math.atan(f.across / 1500);
      this.courseTo(chi);
      this.vApp = this.vApproach(alphaOn);
      const vA = casFromTas(this.vApp, o.at) / KT, cfg = f.along > -faf - 3500 || o.kcas < 215;
      if (cfg) { ac.gearCmd = 1; ac.flapCmd = 1; }
      ac.sbCmd = o.kcas > (cfg ? vA + 12 : 225) ? 1 : 0;
      this.energyTo(elev + Math.tan(GS) * (aim + faf), { kcas: cfg ? vA : 210 }, 40);
      if (f.along > -faf - 500) { this.go('final'); ac.gearCmd = 1; ac.flapCmd = 1; ac.sbCmd = 0; }
      break;
    }
    case 'final': {
      ac.gearCmd = 1; ac.flapCmd = 1; ac.sbCmd = 0;
      // line up: the cross-track error, gently
      const chi = rw.psi - Math.atan(f.across / Math.max(800, -f.along * 0.25));
      this.lim.bank = 30 * D2R;
      this.courseTo(chi);
      // the glide path: down it at its angle, the height error flown out (0.25/s), at the on-speed angle of attack's
      // speed (pathAt)
      const V = Math.max(o.V, 40), vsC = -V * Math.sin(GS) + clamp(0.25 * (gpH - o.h), -4, 4);
      this.vApp = this.vApproach(alphaOn);
      this.pathAt(Math.min(Math.asin(clamp(vsC / V, -0.3, 0.3)), 0), this.vApp);
      if (this.wheelHeight() < 15) this.go('flare');
      // (on its wheels before the flare, a gust or a hard final: the touchdown all the same)
      if (o.wow) { this.go('aerobrake'); this.touch = { t: this.t, vs: o.vs, kcas: o.kcas, along: f.along, across: f.across, theta: o.theta }; ac.setThrottle(0); ac.sbCmd = 1; this.thC = o.theta; this.thF = null; }
      break;
    }
    case 'flare': {
      const hw = this.wheelHeight();
      const chi = rw.psi - Math.atan(f.across / 600);
      this.courseTo(chi);
      // as a pilot flares, from 15 m: the nose raised as the sink rate wants it (toward about 1 m/s at the wheels),
      // never past 13° (the nozzles touch at 15°), on the attitude itself; the throttles holding the approach speed
      // against the drag of the flare to 2 m, then eased off to idle. (By g, with the power off from 5 m, the nose came
      // up to 16° and he floated 5 s, touching down at 15.7°; with the power frozen at the flare's start a heavy jet
      // ran out of nose at 13° and touched at 2 m/s)
      if (this.thF == null) { this.thC = o.theta; this.thF = ac.eng[0].thr; }
      const vsC = -Math.max(0.9, 0.28 * hw);
      this.thC = clamp(this.thC + clamp(3 * (vsC - o.vs), -5, 5) * D2R * this.dt, o.theta - 2 * D2R, 13 * D2R);
      const p = ac.fcs.p; ac.fcs.mode = 'theta'; ac.fcs.theta = this.thC; ac.fcs.p = p;
      if (hw > 2) { this.speedTo({ kcas: casFromTas(this.vApp, o.at) / KT }); this.thF = ac.eng[0].thr; }
      else ac.setThrottle(this.thF * clamp((hw - 0.5) / 1.5, 0, 1));
      if (o.wow) { this.go('aerobrake'); this.touch = { t: this.t, vs: o.vs, kcas: o.kcas, along: f.along, across: f.across, theta: o.theta }; ac.setThrottle(0); ac.sbCmd = 1; this.thC = o.theta; this.thF = null; }
      break;
    }
    case 'aerobrake': {
      // the ZF-25's aerodynamic braking: the nose held up near 12° (the wing is the brake) until 100 knots, idle, the
      // speed brake out; then the nose lowered. On a runway of a given length (T.len, from the threshold) no longer
      // than what is left allows: the nose down (some 5 s) and the wheel brakes (a third of a g; taken here as a
      // quarter) with 250 m to spare. (A heavy jet held it to 100 knots for 1,500 m, and ran off a 2,245 m runway)
      ac.setThrottle(0); ac.sbCmd = 1;
      this.thC = Math.min(this.thC + 2 * D2R * this.dt, 12 * D2R);
      ac.fcs.mode = 'theta'; ac.fcs.theta = this.thC; ac.fcs.p = 3 * (0 - o.phi);
      this.steerCentre(rw); ac.steer = 0;
      const short = T.len && T.len - f.along < o.gs * 5 + o.gs * o.gs / (2 * 2.5) + 250;
      if (o.kcas < 100 || short) this.go('derotate');
      break;
    }
    case 'derotate': {
      ac.setThrottle(0);
      this.thC = Math.max(this.thC - 2.5 * D2R * this.dt, 0);
      ac.fcs.mode = 'ground'; ac.fcs.theta = this.thC; ac.fcs.p = 0;
      this.steerCentre(rw); ac.steer = 0;
      const nose = ac.gearPts[0].load > 0;
      if (nose) { this.go('brake'); }
      break;
    }
    case 'brake': {
      ac.setThrottle(0); ac.fcs.mode = 'ground'; ac.fcs.theta = 0;
      ac.brake = 1;
      this.steerCentre(rw);
      if (o.gs < 1) { this.go('stopped'); ac.sbCmd = 0; this.stop = { along: f.along, across: f.across }; }
      break;
    }
    case 'stopped': ac.brake = 1; ac.setThrottle(0); break;
  }
};
F15SA.Pilot = Pilot; F15SA.rwyFrame = rwyFrame;

root.F15SA = F15SA;
F15SA.atmos = atmos; F15SA.aero = aero; F15SA.Engine = Engine; F15SA.lapse = lapse; F15SA.lapseMil = lapseMil;
F15SA.casFromTas = casFromTas; F15SA.tasFromCas = tasFromCas; F15SA.gravity = gravity;
F15SA.GEO = GEO; F15SA.MASS = MASS; F15SA.ENG = ENG; F15SA.STORES = STORES; F15SA.LOADOUTS = LOADOUTS; F15SA.STATIONS = STATIONS; F15SA.SURF = SURF;
F15SA.quatFromEuler = quatFromEuler; F15SA.eulerFromQuat = eulerFromQuat; F15SA.dcm = dcm; F15SA.wrapA = wrapA; F15SA.clamp = clamp; F15SA.smooth = smooth;
F15SA.U = { FT, LB, LBF, KT, D2R, G0 };
if (typeof module !== 'undefined' && module.exports) module.exports = F15SA;
})(typeof window !== 'undefined' ? window : globalThis);
