/* ===================== cockpit ===================== */
// Front seat of the HX-7: the generated cockpit photo (sprites/cockpit_*.webp) with its canopy glass and three displays
// cut out. Behind the glass the GL canvas draws the same world from the gunner's eye; the TEDAC shows the sensor
// video; the two MPDs are 2D canvases (TSD map page, WPN page). CK.t runs 0 (cockpit) .. 1 (sensor fills the screen).
const CK = {
  t: 0, goal: 0, auto: -1, IW: 1672, IH: 941,
  // display areas in cockpit-image pixels (tools/make_cockpit.py), trimmed a pixel inside the cut edge. The ZF-25's
  // large display (618, 492, 436 × 193) is split as its crews set it: the pod's video on the left (T), the TSD on the
  // right (ML); the up-front controller's small screen above it (MR). `cut`: each display's opening in the photo out
  // to the bezel (x0, y0, x1, y1; the screens tools/make_cockpit.py prints), the ZF-25's large one split down the
  // middle; between the picture and the bezel, the display's unlit edge (#frT, #frML, #frMR), or the world behind
  // shows through as a light seam
  T: JET ? { x: 620, y: 494, w: 214, h: 189 } : { x: 649, y: 490, w: 381, h: 162 },
  ML: JET ? { x: 838, y: 494, w: 214, h: 189 } : { x: 301, y: 518, w: 210, h: 202 },
  MR: JET ? { x: 770, y: 400, w: 113, h: 61 } : { x: 1161, y: 520, w: 211, h: 204 },
  cut: JET ? { T: [615, 489, 836, 688], ML: [836, 489, 1057, 688], MR: [766, 396, 887, 465] } : { T: [645, 486, 1034, 656], ML: [298, 515, 514, 723], MR: [1158, 517, 1375, 727] },
  k0: 1, k: 1, left: 0, top: 0, sens: { x: 0, y: 0, w: 1, h: 1 }, mpdT: 0, known: new Set(),
  // the seat view: lean (1 = whole cockpit) and the photo point at the screen centre; the gunner's head in the vibration
  lean: 1, fx: 836, fy: 470.5, kS: 1, shx: 0, shy: 0,
  // the head on its neck: where the gunner wants to look (gx, gy, gl) and how fast he turns there (gw); the head follows
  // with mass (vfx, vfy, vl). The body in the airframe: eye sway (ex, ey photo px), surge toward the panel (el), roll (r).
  gx: 836, gy: 470.5, gl: 1, gw: 14, vfx: 0, vfy: 0, vl: 0,
  ex: 0, ey: 0, el: 0, vex: 0, vey: 0, vel: 0, r: 0, vr: 0,
  acc: { x: 0, y: 0, z: 0 }, pv: null, pvs: 0, pitch0: null,
  A: { x: 0, y: 0 }, kr: 0, win: { x: 0, y: 0, k: 1 },
  page: { L: 'TSD', R: 'WPN' }, tsdXf: { L: null, R: null }, tsd: { sc: 4, map: true, ctr: false, nup: false, rng: true, rte: true, tgt: true, los: true },
  lean0: null, msg: null, lastTap: 0, marks: [],
  // TEDAC symbology on/off and brightness, sensor level; per-MPD knobs; cockpit lighting; page options
  sym: true, symBrt: 1, gain: 1,
  mpd: { L: { brt: 1, vid: 1, mode: 'DAY', pwr: true }, R: { brt: 1, vid: 1, mode: 'DAY', pwr: true } },
  pnl: 1, flood: false, vidSym: true, alt: 'RAD', spd: 'KTS', fuel: 'LB', code: 0, tc: 2,
};
// TEDAC bezel keys (photo pixels) and the two hand grips; what each does is in tedacPress
// (the ZF-25's display is a touch screen: its keys are touch zones along its top and bottom edges)
const lad = (x0, w, n, y) => Array.from({ length: n }, (_, i) => [Math.round(x0 + (i + 0.5) * w / n), y]);
const TKEYS = JET ? { T: lad(620, 214, 5, 501), L: [], R: [], B: lad(620, 214, 5, 676) } : {
  T: [[677, 472], [707, 472], [736, 472], [765, 472], [795, 472], [887, 472], [917, 472], [946, 472], [975, 472], [1004, 472]],
  L: [[621, 505], [621, 520], [621, 547], [621, 575], [621, 603], [621, 631]],
  R: [[1060, 506], [1060, 521], [1060, 548], [1060, 575], [1060, 605], [1060, 633]],
  B: [[707, 667], [736, 667], [765, 667], [795, 667], [887, 667], [917, 667], [946, 667], [975, 667]],
};
// (the ZF-25's: the weapon systems officer's two hand controllers on the side consoles)
const GRIPS = JET ? { L: [130, 600, 262, 820], R: [1410, 590, 1546, 812] } : { L: [605, 650, 690, 800], R: [985, 650, 1075, 800] };   // x0, y0, x1, y1
// The ZF-25's hand controllers, as the real jet's (the officer's HOTAS): the right one's trigger releases, the left
// one's castle tracks. One function to a controller, the two at either side of the cockpit, so a touch never takes
// the wrong one: a touch anywhere on a controller is its button. [x, y, radius, function]: the button the assist
// lights (photo pixels: the right one's red button, the left one's large knurled castle).
const HC = JET ? {
  R: [[1454, 616, 8, 'FIRE']],
  L: [[213, 636, 12, 'TRK']],
} : null;
// The keypad beside the UFC: 4 x 4 backlit keys (photo pixels: the top-left key's face, its size, the steps across and
// down). As the real jet's it is for entering data; here its top-left key raises the iPad, the rest left blank for
// what comes later. Its legends drawn by kpDraw.
// (the night photo is its own picture: its keys sit a little off the day's grid, their glowing faces larger; each
// key's centre there, measured from it)
const KP = { x: 925.7, y: 404.6, w: 9.5, h: 9.2, dx: 18, dy: 17.33, nw: 11.6, nh: 11,
  night: [[926.2, 402.8], [944, 403.2], [962.2, 402.8], [980.2, 403], [926, 419.8], [944, 420.5], [961.8, 419.8], [980.5, 420.2],
    [925.8, 438.2], [943.2, 437.5], [961.5, 437.8], [980.5, 437.2], [925.5, 455.5], [943.5, 456], [961, 455.2], [980.2, 455.2]], keys: [['EFB', '', '', ''], ['', '', '', ''], ['', '', '', ''], ['', '', '', '']] };
const kpXY = k => { for (let r = 0; r < 4; r++) { const c = KP.keys[r].indexOf(k); if (c >= 0) return S.night ? KP.night[r * 4 + c] : [KP.x + c * KP.dx, KP.y + r * KP.dy]; } return null; };
const hcXY = (side, k) => { const b = HC && HC[side].find(b => b[3] === k); return b || null; };
// knobs and switches with no label on the photo: [x, y, hit radius, what it does]; each shows its name and setting when used
const PCT = v => Math.round(v * 100) + '%';
const cyc = (list, v) => list[(list.indexOf(v) + 1) % list.length];
const mpdKnobs = (side, [tl, tr, bl, br]) => {
  const m = () => CK.mpd[side];
  return [
    [...tl, 14, () => { m().brt = cyc([1, 0.75, 0.5, 0.3], m().brt); applyMpd(); return ['BRT ' + PCT(m().brt), 'سطوع']; }],
    [...tr, 14, () => { m().vid = cyc([1, 0.7, 0.4], m().vid); CK.mpdT = 0; return ['VID ' + PCT(m().vid), 'سطوع الفيديو']; }],
    [...bl, 14, () => { m().mode = cyc(['DAY', 'NT', 'MONO'], m().mode); applyMpd(); return ['MODE ' + m().mode, { DAY: 'نهاري', NT: 'ليلي', MONO: 'أحادي اللون' }[m().mode]]; }],
    [...br, 14, () => { m().pwr = !m().pwr; CK.mpdT = 0; return ['PWR ' + (m().pwr ? 'ON' : 'OFF'), m().pwr ? 'تشغيل' : 'إطفاء']; }],
  ];
};
const CTRLS = JET ? [
  // the red-guarded master arm on the left console, and the symbology brightness knob beside it
  [407, 688, 20, () => { toggleArm(); return ['MASTER ARM ' + (S.armed ? 'ARM' : 'SAFE'), S.armed ? 'تسليح' : 'آمن']; }],
  [440, 735, 13, () => { CK.symBrt = cyc([1, 0.7, 0.45], CK.symBrt); return ['SYM BRT ' + PCT(CK.symBrt), 'سطوع الرموز']; }],
] : [
  ...mpdKnobs('L', [[270, 517], [531, 517], [268, 741], [528, 741]]),
  ...mpdKnobs('R', [[1137, 519], [1395, 518], [1138, 740], [1395, 740]]),
  // left console: the red-guarded master arm, the intercom volume, symbology brightness, the tone switch, sim freeze
  [181, 862, 24, () => { toggleArm(); return ['MASTER ARM ' + (S.armed ? 'ARM' : 'SAFE'), S.armed ? 'تسليح' : 'آمن']; }],
  [263, 878, 19, () => { const v = cyc([1, 0.6, 0.3, 0], S.soundOn ? Snd.vol : 0); if (v) { Snd.vol = v; setSound(true); } else setSound(false); return ['ICS VOL ' + (v ? PCT(v) : 'OFF'), 'الصوت']; }],
  [212, 886, 11, () => { CK.symBrt = cyc([1, 0.7, 0.45], CK.symBrt); return ['SYM BRT ' + PCT(CK.symBrt), 'سطوع الرموز']; }],
  [246, 857, 10, () => { Snd.tones = !Snd.tones; return ['TONE ' + (Snd.tones ? 'ON' : 'OFF'), 'نغمات التنبيه']; }],
  [292, 857, 10, () => { toggleFreeze(); return ['SIM FRZ ' + (S.frozen ? 'ON' : 'OFF'), 'تجميد']; }],
  // right console: the day / night lighting mode, panel lights, flood light, and two toggles
  [1398, 845, 24, () => { setNight(!S.night); return ['MODE ' + (S.night ? 'NT' : 'DAY'), S.night ? 'ليلي' : 'نهاري']; }],
  [1436, 905, 17, () => { CK.pnl = cyc([1, 1.35, 0.65], CK.pnl); applyPanel(); return ['PNL LT ' + PCT(CK.pnl), S.night ? 'إضاءة اللوحة' : 'إضاءة اللوحة (ليلًا)']; }],
  [1468, 905, 17, () => { CK.flood = !CK.flood; applyPanel(); return ['FLOOD ' + (CK.flood ? 'ON' : 'OFF'), S.night ? 'الإضاءة العامة' : 'الإضاءة العامة (ليلًا)']; }],
  [1349, 840, 11, () => { setFlight({ orbit: 'h1', h1: 'h2', h2: 'route', route: 'orbit', hp: 'orbit', base: 'h1', pad: 'h1' }[plane.mode]); return [{ orbit: 'ORBIT', h1: 'HOVER 1', h2: 'HOVER 2', route: 'PATROL', hp: 'FLY TO', base: 'RTB', pad: 'ON PAD' }[plane.mode], 'وضع الطيران']; }],
  [1440, 838, 11, () => { setQuality(!HIQ); return ['RES ' + (HIQ ? 'HIGH' : 'NORM'), 'الوضوح']; }],
];
// bezel push buttons of the two MPDs, in photo pixels: top row, bottom row, left column, right column
const BTN = JET ? { L: { T: lad(838, 214, 4, 501), B: lad(838, 214, 6, 676), L: [[843, 545], [843, 575], [843, 605]], R: [[1047, 535], [1047, 565], [1047, 595], [1047, 625]] },
  R: { T: [], B: [], L: [], R: [] } } : {
  L: { T: [[330, 502], [360, 502], [390, 502], [420, 502], [452, 502], [482, 502]], B: [[324, 743], [355, 743], [386, 743], [417, 743], [447, 743], [477, 743]],
       L: [[277, 565], [277, 593], [277, 622], [277, 652], [277, 681]], R: [[529, 565], [529, 593], [529, 622], [529, 652], [529, 681]] },
  R: { T: [[1192, 503], [1222, 503], [1252, 503], [1283, 503], [1313, 503], [1344, 503]], B: [[1192, 745], [1223, 745], [1253, 745], [1284, 745], [1315, 745], [1346, 745]],
       L: [[1140, 567], [1140, 594], [1140, 623], [1140, 652], [1140, 681]], R: [[1397, 568], [1397, 596], [1397, 625], [1397, 653], [1397, 683]] },
};
const IMG_VFOV = 53.1;   // the photo's vertical field of view (24 mm lens on full frame)
const wcam = new THREE.PerspectiveCamera(IMG_VFOV, CK.IW / CK.IH, 40, 60000); wcam.up.set(0, 0, 1);
// desert haze: about a fifth of the light lost over 2 km, most of it by 5 km, so the far field's edge dissolves
const winFog = new THREE.FogExp2(MAP.haze, 2.2e-4 * MPP);
// (the ZF-25 at 15,000 ft is above the dust, which lies in the lowest two kilometres: no fog on the ground for it, but
// winMat's haze, by the path the line of sight runs through that layer: a short one looking down, so the ground is
// clear below, a long one toward the horizon, which the ground fades into a few degrees before it. JET_HAZE: the
// dust's extinction (1/m: some 50 km of visibility, a clear desert day) and its top (m above the sea). As a fog over
// the whole line of sight it hid the ground to 14° under the horizon, the glass showed nothing but sky and dust, and
// level flight looked nose-high)
const JET_DUST = 0xc4b6a0, JET_HAZE = { k: 7.5e-5, top: 2400 };
// (the canopy's world with a depth buffer: the base's upright dressing seen from the ground, baseDress)
let rtW = new THREE.WebGLRenderTarget(4, 4, Object.assign({}, rtOpts, { depthBuffer: !!JET })), rtWE = new THREE.WebGLRenderTarget(4, 4, rtOpts);
// smaller sensor targets while the video only fills the TEDAC
let rtAs = new THREE.WebGLRenderTarget(4, 4, rtOpts), rtLs = new THREE.WebGLRenderTarget(4, 4, rtOpts), rtEs = new THREE.WebGLRenderTarget(4, 4, rtOpts), rtHs = new THREE.WebGLRenderTarget(4, 4, rtOpts);
const winMat = new THREE.ShaderMaterial({
  uniforms: { tA: { value: rtW.texture }, tE: { value: rtWE.texture }, res: { value: new THREE.Vector2(1, 1) }, night: { value: 0 }, time: { value: 0 }, flash: { value: 0 },
    jet: { value: JET ? 1 : 0 }, invVP: { value: new THREE.Matrix4() }, eye: { value: new THREE.Vector3() }, dust: { value: new THREE.Color(JET_DUST) }, dusk: { value: 0 }, dustK: { value: 0 }, sunD: { value: new THREE.Vector3(-0.695, -0.487, 0.53) },
    // the horizon's elevation (rad, the dip from the eye's height) and the dust's optical depth straight down
    hz: { value: -0.038 }, hk: { value: 0.15 },
    // the jet's axes in the world (east, north, up): forward, right wing, up; its canopy is drawn in them
    bF: { value: new THREE.Vector3(0, 1, 0) }, bR: { value: new THREE.Vector3(1, 0, 0) }, bU: { value: new THREE.Vector3(0, 0, 1) } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    precision highp float;
    uniform sampler2D tA, tE; uniform vec2 res; uniform float night, time, flash, jet, hz, hk, dusk, dustK; uniform mat4 invVP; uniform vec3 eye, dust, bF, bR, bU, sunD;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
    void main(){
      vec4 aw = texture2D(tA, vUv);
      vec3 a = aw.rgb, e = texture2D(tE, vUv).rgb;
      vec3 d = vec3(0.0, 0.0, 1.0);
      if (jet > 0.5) {
        // the sky where no ground was drawn: deep blue overhead going pale to the horizon, a glow round the sun
        vec4 w = invVP * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); d = normalize(w.xyz / w.w - eye);
        float el = asin(clamp(d.z, -1.0, 1.0)), eh = el - hz;
        float t1 = exp(-max(eh, 0.0) / 0.22);
        vec3 sky = mix(vec3(0.20, 0.38, 0.69), vec3(0.70, 0.78, 0.87), t1);
        // (the sun: east, north, up. The afternoon's at 235°, 32° up; the evening's low in the west)
        vec3 sun = normalize(sunD); float ang = acos(clamp(dot(d, sun), -1.0, 1.0));
        // (the evening's horizon orange toward the sun, a dusky mauve away from it)
        if (dusk > 0.5) { float tw = dot(normalize(d.xy + 1e-4), normalize(sunD.xy + 1e-4));
          sky = mix(vec3(0.13, 0.22, 0.45), mix(vec3(0.62, 0.55, 0.62), vec3(0.98, 0.62, 0.36), smoothstep(-0.2, 0.9, tw)), t1);
          sky += vec3(1.0, 0.7, 0.4) * (0.6 * exp(-ang / 0.08) + 0.25 * exp(-ang / 0.5)); }
        else sky += vec3(1.0, 0.93, 0.8) * (0.35 * exp(-ang / 0.1) + 0.1 * exp(-ang / 0.6));
        // a dust storm: the sky itself brown-grey, the blue barely there above it
        if (dustK > 0.0) sky = mix(sky, mix(vec3(0.66, 0.58, 0.48), vec3(0.5, 0.52, 0.56), smoothstep(0.0, 0.6, eh)), 0.75 * dustK);
        // by night, before the moonlight below grades it as it grades the ground: dark blue, paler toward the horizon,
        // and the stars of a clear desert night, fixed in the sky as the head turns (a cell of about 0.06° each), most
        // faint and a few bright
        if (night > 0.5) { sky = mix(vec3(0.04, 0.06, 0.14), vec3(0.30, 0.33, 0.42), t1);
          float hs = hash(floor(vec2(atan(d.y, d.x), el) * 900.0)); if (hs > 0.9955 && eh > 0.02) sky += vec3(0.5 + 5.0 * pow((hs - 0.9955) / 0.0045, 4.0)) * smoothstep(0.02, 0.12, eh); }
        // the dust layer's top, seen edge on from above it: the horizon (hz, 2.2° below the level at 15,000 ft) in a
        // soft pale band that thins into the blue over a few degrees; under it the dust
        vec3 band = mix(dust, vec3(0.83, 0.82, 0.80), 0.45);
        vec3 hc = eh < 0.0 ? mix(dust, band, smoothstep(-0.05, 0.0, eh)) : mix(band, sky, smoothstep(0.0, 0.1, eh));
        if (night > 0.5) hc = mix(dust * 0.7, sky, smoothstep(-0.01, 0.05, eh));
        // the ground through the dust: what is left of it after the layer's depth along the line of sight (flat ground,
        // under the horizon only: the flat map runs on past where the earth curves away)
        // (what stands above the eye's level is no flat map past the curve: the base's upright dressing, seen from
        // the ground, keeps its own colours)
        float tr = exp(-hk / max(-d.z, 1e-3)), g = aw.a * (d.z > 0.0 ? 1.0 : smoothstep(0.002, -0.002, eh));
        a = mix(hc, mix(hc, aw.rgb / max(aw.a, 1e-3), tr), g);
        e *= 0.3 + 0.7 * tr;
      }
      vec2 o = 3.0 / res;
      vec3 b = (texture2D(tE, vUv + vec2(o.x, 0.0)).rgb + texture2D(tE, vUv - vec2(o.x, 0.0)).rgb
             +  texture2D(tE, vUv + vec2(0.0, o.y)).rgb + texture2D(tE, vUv - vec2(0.0, o.y)).rgb) * 0.25;
      vec3 col;
      if (night > 0.5) {
        // moonlight: the ground stays readable in dim blue-grey, fires and lights still carry the scene
        float l = dot(a, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(l), a, 0.35) * vec3(0.17, 0.2, 0.28) + 0.008 + e * 1.3 + b * 0.9;
      } else {
        float l = dot(a, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(l), a, 0.9) * 0.97 + 0.025 + e * 0.6 + b * 0.4;
        // the evening's light on the ground: warm and lower (the sky above graded on its own). The jet knows its ground
        // by what was drawn; the Sahm's sky is its haze's colour, so below the horizon by the line of sight
        if (dusk > 0.5) { float gnd = aw.a;
          if (jet < 0.5) { vec4 w = invVP * vec4(vUv * 2.0 - 1.0, 1.0, 1.0); gnd = smoothstep(0.03, -0.02, normalize(w.xyz / w.w - eye).z); }
          col = mix(col, col * vec3(1.02, 0.8, 0.6) * 0.78, gnd); }
      }
      col += flash * vec3(1.0, 0.85, 0.62);
      if (jet < 0.5) {
        col *= vec3(0.97, 0.985, 1.0);   // canopy glass
        col += (hash(vUv * res + floor(time * 24.0)) - 0.5) * 0.012;
      } else {
        // The ZF-25's canopy, with no grain: the picture through it stands still when nothing moves. Its shape: a cylinder
        // along the jet, 0.75 m round a line 0.3 m below the eye, sloping into the windscreen ahead. Where the line of
        // sight crosses it: the angle of incidence for what it mirrors (Fresnel: the more obliquely you look, the more
        // of the cockpit it mirrors, the side glass more than ahead), and a place on it for its smudges
        vec3 v = vec3(dot(d, bF), dot(d, bR), dot(d, bU));
        float qa = max(v.y * v.y + v.z * v.z, 1e-4), qb = v.z * 0.3, t = (-qb + sqrt(max(qb * qb + qa * 0.4725, 0.0))) / qa;
        t = min(t, 1.6 / max(v.x, 0.05));
        vec3 p = v * t, n = normalize(vec3(0.25 * smoothstep(0.6, 0.97, v.x), p.y, p.z + 0.3));
        float fr = 0.04 + 0.96 * pow(1.0 - abs(dot(v, n)), 5.0);
        // what it mirrors: the sunlit grey of the cockpit by day, the dim green of the panel lighting by night
        vec3 refl = night > 0.5 ? vec3(0.010, 0.032, 0.016) : vec3(0.16, 0.165, 0.17) * (0.55 + 0.45 * clamp(bU.z, 0.0, 1.0));
        // (at most a fifth: at half, the windscreen ahead of the pilot, seen edge on from the back seat, was a grey
        // fog over the world; the owner: «احس فيها غباش»)
        col = mix(col, refl, clamp(fr * 0.9, 0.0, 0.22));
        // the dark of the cockpit mirrored in the side glass just above the rails
        float sill = exp(-pow((v.z + 0.04) / 0.13, 2.0)) * smoothstep(0.25, 0.6, abs(v.y));
        col = mix(col, refl * 0.7, 0.2 * sill);
        col *= vec3(0.965, 0.98, 0.975);   // its faint tint
        if (night < 0.5) {
          // toward the sun the acrylic scatters it: a veil of light, and its smudges and fine wear show only there
          vec3 sunW = normalize(vec3(-0.695, -0.487, 0.53)); float sa = acos(clamp(dot(d, sunW), -1.0, 1.0));
          vec2 s = vec2(atan(p.y, p.z + 0.3) * 0.75, p.x);   // metres along the canopy
          float sm = vnoise(s * 9.0) * 0.6 + vnoise(s * 31.0) * 0.4, veil = exp(-sa / 0.6);
          col += vec3(1.0, 0.96, 0.88) * (0.04 * veil + 0.08 * veil * veil * smoothstep(0.4, 0.85, sm));
          // (no mirrored image of the sun itself: from inside, the canopy mirrors the cockpit, and the sunlight it
          // reflects goes outward; what shows of the sun is this veil and the lit smudges)
        }
      }
      gl_FragColor = vec4(col, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const winScene = new THREE.Scene(); winScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), winMat));
const ckEl = $('#cockpit'), ckFrame = $('#ckFrame'), ckImg = $('#ckImg'), mpdL = $('#mpdL'), mpdR = $('#mpdR'), tedacUI = $('#tedacUI');
const tsdImg = new Image(); if (!REGION.length) tsdImg.src = MAP.dir + 'tiles/far/tsd.jpg';
const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
function placeBox(el, r) { el.style.left = r.x + 'px'; el.style.top = r.y + 'px'; el.style.width = r.w + 'px'; el.style.height = r.h + 'px'; }
// a display's unlit edge: its opening to the bezel, bordered in to the picture's box and a pixel over its edge (where
// two smoothed edges meet, a hairline of the world would show between them); the up-front controller's screen is the
// colour of its page
for (const k of ['T', 'ML', 'MR']) {
  const el = $('#fr' + k), r = CK[k], [x0, y0, x1, y1] = CK.cut[k];
  placeBox(el, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  el.style.borderWidth = (r.y - y0 + 1) + 'px ' + (x1 - r.x - r.w + 1) + 'px ' + (y1 - r.y - r.h + 1) + 'px ' + (r.x - x0 + 1) + 'px';
  if (JET && k === 'MR') el.style.borderColor = '#020a05';
}
function ckSizeMpds(k) {
  // MPD canvases at their on-screen resolution (sharper as the gunner leans in), capped for older phones
  for (const [el, r] of [[mpdL, CK.ML], [mpdR, CK.MR]]) {
    placeBox(el, r);
    el.width = Math.min(HIQ ? 1600 : 1000, Math.max(64, Math.round(r.w * k * PR))); el.height = Math.round(el.width * r.h / r.w);
  }
  placeBox($('#glareT'), CK.T); placeBox(tedacUI, CK.T);
  tedacUI.width = Math.min(HIQ ? 2200 : 1400, Math.max(64, Math.round(CK.T.w * k * PR))); tedacUI.height = Math.round(tedacUI.width * CK.T.h / CK.T.w);
  CK.mpdK = k; CK.mpdT = 0;
}
// the head's roll needs some photo beyond the screen's corners: the cover scale leaves room for this much (about 3°)
const ROLL_MAX = 0.05, HEAD_ROLL_SIGN = 1;
const FOC = CK.IH / 2 / Math.tan(IMG_VFOV * Math.PI / 360);   // photo pixels per radian of head turn
const rot = (x, y, r) => { const c = Math.cos(r), n = Math.sin(r); return { x: c * x - n * y, y: n * x + c * y }; };
function ckCover(r) { const c = Math.abs(Math.cos(r)), n = Math.abs(Math.sin(r)); return { w: VW * c + VH * n, h: VW * n + VH * c }; }
function ckClampGaze(o, kS, r, ex, ey) {
  // the photo must cover the screen wherever the head turns: the screen, turned by the head's roll and shifted by the
  // eye's sway, kept inside the photo
  const cv = ckCover(r), m = 4 / kS, hw = cv.w / 2 / kS + m, hh = cv.h / 2 / kS + m, u = rot(-ex, -ey, -r);
  const ux = u.x / kS, uy = u.y / kS;
  o.x = 2 * hw >= CK.IW ? CK.IW / 2 - ux : clamp(o.x, hw - ux, CK.IW - hw - ux);
  o.y = 2 * hh >= CK.IH ? CK.IH / 2 - uy : clamp(o.y, hh - uy, CK.IH - hh - uy);
}
function ckClampFocus() {
  const f = { x: CK.fx, y: CK.fy }; ckClampGaze(f, CK.kS, CK.r, CK.ex * CK.kS, CK.ey * CK.kS); CK.fx = f.x; CK.fy = f.y;
  const g = { x: CK.gx, y: CK.gy }; ckClampGaze(g, CK.k0 * CK.gl, 0, 0, 0); CK.gx = g.x; CK.gy = g.y;
}
// photo <-> screen through the current transform: screen = A + k · R(r) · (photo − photo centre)
function ckFromImg(p) { const v = rot(p.x - CK.IW / 2, p.y - CK.IH / 2, CK.kr); return { x: CK.A.x + CK.k * v.x, y: CK.A.y + CK.k * v.y }; }
function ckToImg(q) { const v = rot((q.x - CK.A.x) / CK.k, (q.y - CK.A.y) / CK.k, -CK.kr); return { x: v.x + CK.IW / 2, y: v.y + CK.IH / 2 }; }
// a style written only when it changes (ckLayout runs every frame; the same values written again each frame still
// had the page restyle the layers they are on)
function setStyle(el, k, v) { const c = el.__st || (el.__st = {}); if (c[k] !== v) { c[k] = v; el.style[k] = v; } }
function ckLayout() {
  // seat: the photo covers the screen (with room for the head's roll and the rotor's shake), scaled by the lean, the gaze
  // point at the screen centre. The eye's sway and surge move the cockpit only; the world outside is far away and moves
  // only when the head turns. Leaning into the TEDAC: scale and place ease until its cover rectangle is the whole screen.
  const cv = ckCover(ROLL_MAX);
  CK.k0 = Math.max(cv.w / CK.IW, cv.h / CK.IH) * 1.012;
  const e = ease(CK.t), le = Math.max(1, CK.lean + CK.el * (1 - e));
  CK.kS = CK.k0 * le;
  const r = CK.r * (1 - e), Ex = CK.ex * CK.kS * (1 - e), Ey = CK.ey * CK.kS * (1 - e);
  const f = { x: CK.fx, y: CK.fy }; ckClampGaze(f, CK.kS, r, Ex, Ey); CK.fx = f.x; CK.fy = f.y;
  const C = { x: CK.IW / 2, y: CK.IH / 2 }, T = CK.T, a = VW / VH, tc = { x: T.x + T.w / 2, y: T.y + T.h / 2 };
  const k1 = T.w / T.h >= a ? VW / T.w : VH / T.h;
  CK.k = CK.kS * Math.pow(k1 / CK.kS, e); CK.kr = r;
  // where the TEDAC centre sits in the seat view, and where it ends up (the screen centre)
  const toTc = rot(tc.x - CK.fx, tc.y - CK.fy, r);
  const seat = { x: VW / 2 + CK.shx + Ex + CK.kS * toTc.x, y: VH / 2 + CK.shy + Ey + CK.kS * toTc.y };
  const tcs = { x: lerp(seat.x, VW / 2, e), y: lerp(seat.y, VH / 2, e) };
  const tv = rot(tc.x - C.x, tc.y - C.y, r);
  CK.A = { x: tcs.x - CK.k * tv.x, y: tcs.y - CK.k * tv.y };
  const o = ckFromImg({ x: 0, y: 0 }); CK.left = o.x; CK.top = o.y;
  // the sensor picture: the cover rectangle of the (turned) TEDAC opening, at the screen's aspect
  const c = Math.abs(Math.cos(r)), n = Math.abs(Math.sin(r)), bw = CK.k * (T.w * c + T.h * n), bh = CK.k * (T.w * n + T.h * c);
  const sw = bw / bh >= a ? bw : bh * a, sh = sw / a;
  CK.sens = { x: tcs.x - sw / 2, y: tcs.y - sh / 2, w: sw, h: sh };
  // the world behind the glass: the same gaze and roll, but not the eye's sway or the lean (no magnification)
  const kW = CK.k / le, fv = rot(CK.fx - C.x, CK.fy - C.y, r), fs = { x: CK.A.x + CK.k * fv.x - Ex, y: CK.A.y + CK.k * fv.y - Ey };
  CK.win = { x: fs.x - kW * fv.x, y: fs.y - kW * fv.y, k: kW };
  setStyle(ckFrame, 'transform', 'translate(' + CK.A.x + 'px,' + CK.A.y + 'px) rotate(' + r + 'rad) scale(' + CK.k + ') translate(' + (-C.x) + 'px,' + (-C.y) + 'px)');
  setStyle(hud, 'transformOrigin', '0 0');
  setStyle(hud, 'transform', CK.t < 1 ? 'translate(' + CK.sens.x + 'px,' + CK.sens.y + 'px) scale(' + (sw / VW) + ')' : '');
  setStyle(hud, 'opacity', CK.t < 1 ? String(clamp((CK.t - 0.35) / 0.45, 0, 1)) : '');
  setStyle(tedacUI, 'opacity', String(clamp(1 - CK.t * 3, 0, 1) * CK.symBrt));
}
function ckShow(on) {
  ckEl.hidden = !on; app.classList.toggle('ck', on); ckEl.classList.toggle('live', on && CK.goal === 0);
}
function setCockpit(inside) {
  CK.goal = inside ? 0 : 1;
  if (!inside && JET) efbShow(false);
  if (inside) { ckShow(true); }
  ckEl.classList.toggle('live', inside);
  Snd.tone(inside ? 520 : 780, 0.04);
}
function ckUpdate(rdt) {
  ckHead(rdt);
  if (CK.msg) { CK.msg.t -= rdt; if (CK.msg.t <= 0) CK.msg = null; }
  const before = CK.t;
  if (CK.t !== CK.goal) CK.t = CK.goal > CK.t ? Math.min(1, CK.t + rdt / 1.6) : Math.max(0, CK.t - rdt / 1.6);
  if (CK.t === 1 && before < 1) { ckShow(false); ckLayout(); }
  if (CK.t === 1) return;
  // the rotor's buzz shakes the whole airframe, head and view together
  // (not the jet: a jet at 15,000 ft does not buzz like a rotor, and the photo shifted a tenth of a pixel each frame was
  // resampled each frame, softening and shimmering it: the owner's «تشويش»)
  const buzz = S.frozen || JET ? 0 : 0.35, sc = CK.kS / Math.max(1e-3, Math.max(VW / CK.IW, VH / CK.IH));
  CK.shx = (Math.random() - 0.5) * buzz * sc; CK.shy = (Math.random() - 0.5) * buzz * sc;
  ckLayout();
  // sharper MPDs when leaning in
  if (CK.t === 0 && Math.abs(CK.kS / (CK.mpdK || 1) - 1) > 0.2) ckSizeMpds(CK.kS);
}
// a damped spring, stepped semi-implicitly: returns [position, velocity]
function spring(x, v, goal, w, z, dt) { v += (w * w * (goal - x) - 2 * z * w * v) * dt; return [x + v * dt, v]; }
const HEAD_K = JET ? { y: 10, z: 3.5, zz: 0.8, x: 0.008 } : { y: 36, z: 6, zz: 0.45, x: 0.03 };
function ckHead(rdt) {
  // The gunner is strapped in; his head sits on a neck. The gaze follows where he wants to look with a head's mass
  // (critically damped, no overshoot). The airframe's accelerations move the body: up-gusts and load push the head
  // down, a slipping gust sways it sideways, braking surges it toward the panel; all on a softer, slightly springy neck.
  // In a bank the head tilts part-way back toward the horizon, and it steadies the gaze against the nose's bobbing.
  if (rdt <= 0) return;
  const air = !S.frozen && S.phase !== 'brief', v = plane.gs / 3.6, A = CK.acc;
  if (CK.pv == null) { CK.pv = v; CK.pvs = plane.vs; CK.pitch0 = plane.pitch; }
  // (in the jet, strapped in under a helmet in a 26-tonne airframe, the head moves less than in the Sahm's open seat
  // and settles without a bounce: the Sahm's gains swung it 85 photo pixels sideways and zoomed the view 12 % on the
  // takeoff run, and bobbed it in the orbit's light turbulence)
  const lp = 1 - Math.exp(-rdt * (JET ? 2.5 : 4)), H = HEAD_K;
  // body-frame accelerations, m/s²: x forward, y right, z up (beyond 1 g)
  // sideways push felt in the seat (the gust's part the rotor is not leaning against)
  // a helicopter's range (a jump in the state, e.g. after a pause, must not throw the head about)
  A.x = lerp(A.x, air ? clamp((v - CK.pv) / rdt, -4, 4) : 0, lp);
  A.y = lerp(A.y, air ? clamp(plane.side || 0, -4, 4) : 0, lp);
  A.z = lerp(A.z, air ? clamp((plane.vs - CK.pvs) / rdt + (plane.load - 1) * G, -4, 4) : 0, lp);
  CK.pv = v; CK.pvs = plane.vs;
  CK.pitch0 = lerp(CK.pitch0, plane.pitch, 1 - Math.exp(-rdt * 0.4));
  const breathe = air ? 1.2 * Math.sin(S.t * 1.45) : 0;
  const steps = Math.min(8, Math.ceil(rdt * 120)), dt = Math.min(rdt, 0.1) / steps;
  for (let i = 0; i < steps; i++) {
    [CK.fx, CK.vfx] = spring(CK.fx, CK.vfx, CK.gx, CK.gw, 1, dt);
    [CK.fy, CK.vfy] = spring(CK.fy, CK.vfy, CK.gy + (air ? 0.6 * (plane.pitch - CK.pitch0) * FOC : 0), CK.gw, 1, dt);
    [CK.lean, CK.vl] = spring(CK.lean, CK.vl, CK.gl, CK.gw, 1, dt);
    // the eye moves against the airframe's acceleration (photo pixels; the cockpit is seen to move the other way)
    [CK.ex, CK.vex] = spring(CK.ex, CK.vex, A.y * H.y, 6, H.zz, dt);
    [CK.ey, CK.vey] = spring(CK.ey, CK.vey, -A.z * H.z + breathe, 6, H.zz, dt);
    [CK.el, CK.vel] = spring(CK.el, CK.vel, -A.x * H.x, 5, 0.6, dt);
    [CK.r, CK.vr] = spring(CK.r, CK.vr, air ? clamp(0.4 * (plane.bank - plane.bankSteady), -ROLL_MAX * 0.9, ROLL_MAX * 0.9) : 0, 3, 0.9, dt);
  }
  CK.lean = clamp(CK.lean, 1, 2.8); CK.r = clamp(CK.r, -ROLL_MAX, ROLL_MAX); CK.el = clamp(CK.el, -0.15, 0.15);
  if (CK.lean0 && Math.abs(CK.lean - CK.gl) < 0.005 && Math.hypot(CK.fx - CK.gx, CK.fy - CK.gy) < 1) CK.lean0 = null;
}
// head moves: a slow glide (double tap), or the fingers' own pace (drag); `now` also puts the head there at once
function ckLook(l, x, y, w, now) {
  CK.gl = clamp(l, 1, 2.8); CK.gx = x; CK.gy = y; CK.gw = w || 14;
  const g = { x, y }; ckClampGaze(g, CK.k0 * CK.gl, 0, 0, 0); CK.gx = g.x; CK.gy = g.y;
  if (now) { CK.lean = CK.gl; CK.fx = CK.gx; CK.fy = CK.gy; CK.vfx = CK.vfy = CK.vl = 0; CK.kS = CK.k0 * CK.lean; }
}
/* ---- seat view input: drag to look around the cockpit, pinch (or wheel) to lean in, tap the bezel keys or the TEDAC ---- */
const ckPtrs = new Map();
let ckG = null;
function ckSetLean(l, q) {
  // keep the photo point under the fingers (or cursor) where it is
  // pinching is direct: the head goes there at once, the cockpit follows the fingers
  const p = ckToImg(q), kS = CK.k0 * clamp(l, 1, 2.8);
  const d = rot(q.x - VW / 2 - CK.shx - CK.ex * kS, q.y - VH / 2 - CK.shy - CK.ey * kS, -CK.kr);
  CK.lean0 = null; ckLook(l, p.x - d.x / kS, p.y - d.y / kS, 14, true);
}
ckEl.addEventListener('pointerdown', e => {
  if (CK.goal !== 0) return;
  try { ckEl.setPointerCapture(e.pointerId); } catch (_) {}
  const q = local(e); ckPtrs.set(e.pointerId, q);
  // event timestamps, not handling time: a busy frame must not turn a double tap into two single ones
  if (ckPtrs.size === 1) ckG = { type: 'tap', x0: q.x, y0: q.y, t0: e.timeStamp, moved: 0, onT: ckInT(ckToImg(q)) };
  else if (ckPtrs.size === 2) { const [a, b] = [...ckPtrs.values()]; ckG = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), l0: CK.lean }; CK.lean0 = null; S.dragging = false; }
});
ckEl.addEventListener('pointermove', e => {
  const p = ckPtrs.get(e.pointerId); if (!p || !ckG) return;
  const q = local(e), dx = q.x - p.x, dy = q.y - p.y; p.x = q.x; p.y = q.y;
  if (ckG.type === 'pinch' && ckPtrs.size >= 2) {
    const [a, b] = [...ckPtrs.values()];
    ckSetLean(ckG.l0 * Math.hypot(a.x - b.x, a.y - b.y) / Math.max(30, ckG.d0), { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  } else if (ckPtrs.size === 1) {
    ckG.moved += Math.hypot(dx, dy);
    if (ckG.moved > 8) {
      ckG.type = 'drag'; CK.lean0 = null;
      if (ckG.onT && S.phase === 'play') { S.dragging = true; panScreen(dx * VW / CK.sens.w, dy * VH / CK.sens.h); }
      else { const d = rot(dx, dy, -CK.kr), k = CK.k0 * CK.gl; ckLook(CK.gl, CK.gx - d.x / k, CK.gy - d.y / k, 16); }
    }
  }
});
function ckEnd(e) {
  if (!ckPtrs.has(e.pointerId)) return;
  const q = local(e); ckPtrs.delete(e.pointerId);
  if (ckG && ckG.type === 'tap' && ckPtrs.size === 0 && e.timeStamp - ckG.t0 < 450) ckTap(q, e.timeStamp);
  if (ckPtrs.size === 0) { if (S.dragging && performance.now() - lastPan > 60) { S.vel.x = S.vel.y = 0; } S.dragging = false; ckG = null; } else ckG = { type: 'drag', moved: 99 };
}
ckEl.addEventListener('pointerup', ckEnd);
ckEl.addEventListener('contextmenu', e => e.preventDefault());
ckEl.addEventListener('pointercancel', ckEnd);
ckEl.addEventListener('wheel', e => { e.preventDefault(); if (CK.goal === 0) ckSetLean(CK.lean * Math.exp(-e.deltaY * 0.0015), local(e)); }, { passive: false });
const ckInT = p => p.x > CK.T.x && p.x < CK.T.x + CK.T.w && p.y > CK.T.y && p.y < CK.T.y + CK.T.h;
function ckTap(q, now) {
  const p = ckToImg(q);
  for (const side of ['L', 'R']) for (const g of ['T', 'B', 'L', 'R']) BTN[side][g].forEach(([bx, by], i) => {
    if (Math.abs(p.x - bx) < 13 && Math.abs(p.y - by) < 13) { ckPressAt(bx, by); mpdPress(side, g, i); p.x = -1e9; }
  });
  for (const g of ['T', 'L', 'R', 'B']) TKEYS[g].forEach(([bx, by], i) => {
    if (Math.abs(p.x - bx) < 13 && Math.abs(p.y - by) < 11) { ckPressAt(bx, by); tedacPress(g, i); p.x = -1e9; }
  });
  for (const [bx, by, r, act] of CTRLS) if (Math.hypot(p.x - bx, p.y - by) < r) { ckPressAt(bx, by); const m = act(); if (m) ckTip(bx, by - r, m); syncUI(); p.x = -1e9; }
  if (JET) {
    // the keypad: the key under the finger (half a step round each)
    const c = Math.round((p.x - KP.x) / KP.dx), r = Math.round((p.y - KP.y) / KP.dy);
    if (c >= 0 && c < 4 && r >= 0 && r < 4 && Math.abs(p.x - KP.x - c * KP.dx) < KP.dx / 2 && Math.abs(p.y - KP.y - r * KP.dy) < KP.dy / 2) { ckPressAt(KP.x + c * KP.dx, KP.y + r * KP.dy); kpPress(KP.keys[r][c]); p.x = -1e9; }
  }
  for (const side of ['L', 'R']) {
    const [x0, y0, x1, y1] = GRIPS[side]; if (!(p.x > x0 && p.x < x1 && p.y > y0 && p.y < y1)) continue;
    if (!JET) { gripPress(side); p.x = -1e9; continue; }
    const b = HC[side][0]; ckPressAt(b[0], b[1]); hcPress(b[3]); p.x = -1e9;
  }
  if (JET && p.x > CK.MR.x && p.x < CK.MR.x + CK.MR.w && p.y > CK.MR.y && p.y < CK.MR.y + CK.MR.h) {
    ckPressAt(p.x, p.y);
    if (JX.ask) jetConsent(p.x < CK.MR.x + CK.MR.w / 2); else setWeapon(JW[(JW.indexOf(S.weapon) + 1) % 3]);
    CK.mpdT = 0; p.x = -1e9;
  }
  // a touch on the TSD's map: the pilot flies there and hovers
  for (const side of ['L', 'R']) {
    const r = side === 'L' ? CK.ML : CK.MR, xf = CK.tsdXf[side];
    if (p.x < -1e8 || CK.page[side] !== 'TSD' || !xf || !CK.mpd[side].pwr || S.phase !== 'play') continue;
    const u = (p.x - r.x) / r.w * xf.W, v = (p.y - r.y) / r.h * xf.H;
    if (u < xf.x0 || u > xf.x1 || v < xf.y0 || v > xf.y1) continue;
    const dx = (u - xf.ox) / xf.s, dy = (v - xf.oy) / xf.s, c = Math.cos(-xf.up), sn = Math.sin(-xf.up);
    setFlight('hp', { p: { x: xf.x + dx * c - dy * sn, y: xf.y + dx * sn + dy * c } }); ckPressAt(p.x, p.y); p.x = -1e9;
  }
  // a cue on the glass: tap it to lock that target (the TADS slews to it)
  if (p.x > -1e8 && !ckInT(p) && S.phase === 'play') {
    let best = null, bd = 26;
    for (const m of CK.marks) { const d = Math.hypot(m.x - q.x, m.y - q.y); if (d < bd) { bd = d; best = m.t; } }
    if (best) { lockOn(best, true); return; }
  }
  if (ckInT(p)) {
    // double tap: lean in to the TEDAC and its grips, or sit back again
    if (now - CK.lastTap < 320) {
      CK.lastTap = 0;
      CK.lean0 = true;
      if (CK.gl > 1.4) ckLook(1, CK.IW / 2, CK.IH / 2, 6); else ckLook(Math.min(2.6, Math.max(VW / (520 * CK.k0), VH / (360 * CK.k0))), 840, 610, 6);
      return;
    }
    CK.lastTap = now;
    // a touch on the video picks the target under it, as the crosshair slewed there would
    if (S.phase === 'play') { const t = pickAt((q.x - CK.sens.x) * VW / CK.sens.w, (q.y - CK.sens.y) * VH / CK.sens.h); if (t) lockOn(t, true); }
  }
}
// (the ZF-25's track is on its left hand controller only: one control to a function)
const TLAB = JET ? { T: ['TV', 'IR', 'W/B', 'SYM', 'FULL'], L: [], R: [], B: ['WIDE', 'NARO', 'ZOOM', 'PREV', 'NEXT'] } : {
  T: ['GUN', 'RKT', 'MSL', 'ACQ', 'IMG', 'A/S', 'BRST', 'QTY', 'FILT', 'RCTR'],
  L: ['ZOOM', 'NFOV', 'MFOV', 'WFOV', 'LRF', 'SYM'],
  R: ['SNSR', 'W/B', 'LOCK', 'NEXT', 'PREV', 'FULL'],
  B: ['◀', '▲', '▼', '▶', 'ZM−', 'ZM+', 'LVL', 'FRZ'],
};
// the slew keys move the sensor as the thumb force controller would: a nudge per press
const SLEW = { '◀': [1, 0], '▶': [-1, 0], '▲': [0, 1], '▼': [0, -1] };
const FOVZ = { ZOOM: 12, NFOV: 4, MFOV: 2, WFOV: 1, WIDE: 1, NARO: 4 };
function tedacPress(g, i) {
  const k = TLAB[g][i]; if (!k) return;
  if (FOVZ[k]) S.zoomGoal = FOVZ[k];
  else if (k === 'GUN' || k === 'RKT' || k === 'MSL') setWeapon({ GUN: 'gun', RKT: 'rkt', MSL: 'msl' }[k]);
  else if (k === 'A/S') toggleArm();
  else if (k === 'FILT') $('#btnFilter').click();
  else if (k === 'RCTR') $('#btnCenter').click();
  else if (k === 'SNSR') setSensor(S.sensor === 'eo' ? 'wh' : 'eo');
  else if (k === 'TV') setSensor('eo');
  else if (k === 'IR') setSensor(S.sensor === 'eo' ? 'wh' : S.sensor);
  else if (k === 'TRK') toggleLock();
  else if (k === 'W/B') { if (S.sensor !== 'eo') setSensor(S.sensor === 'wh' ? 'bh' : 'wh'); }
  else if (k === 'LOCK') toggleLock();
  else if (k === 'NEXT') cycle(1);
  else if (k === 'PREV') cycle(-1);
  else if (k === 'LRF') { CK.lrf = { r: slantRange(), t: 6 }; Snd.tone(1900, 0.04); }
  else if (k === 'ACQ') lockNearest();
  else if (k === 'IMG') snapshot();
  else if (k === 'BRST') { S.burst = cyc(BURSTS, S.burst); CK.msg = { s: 'BURST ' + S.burst, t: 1.4 }; }
  else if (k === 'QTY') { S.qty = cyc(QTYS, S.qty); CK.msg = { s: 'QTY ' + S.qty, t: 1.4 }; }
  else if (k === 'SYM') CK.sym = !CK.sym;
  else if (k === 'FULL') setCockpit(false);
  else if (SLEW[k]) { if (S.phase === 'play') panScreen(SLEW[k][0] * VW * 0.06, SLEW[k][1] * VW * 0.06); }
  else if (k === 'ZM−') S.zoomGoal = clamp(S.zoomGoal / 1.4, 1, 12);
  else if (k === 'ZM+') S.zoomGoal = clamp(S.zoomGoal * 1.4, 1, 12);
  else if (k === 'LVL') { CK.gain = cyc([1, 1.3, 0.75], CK.gain); CK.msg = { s: 'LVL ' + PCT(CK.gain), t: 1.4 }; }
  else if (k === 'FRZ') toggleFreeze();
  CK.mpdT = 0; syncUI();
}
// the keypad's keys and the hand controllers (a blank key does nothing but click)
function kpPress(k) { if (k === 'EFB') efbShow(!EFB.up); CK.mpdT = 0; syncUI(); }
function hcPress(k) { if (k === 'FIRE') fire(); else if (k === 'TRK') toggleLock(); CK.mpdT = 0; syncUI(); }
// the keypad's legends, drawn once (and again by night: the night photo's keys glow with glyphs of their own, each
// face covered in its own colour first): dark on the pale caps by day, the keys' green by night. A canvas eight times
// the photo's pixels over the keypad, so they stay sharp as the officer leans in.
function kpDraw() {
  const el = document.getElementById('kpLeg'); if (!JET || !el) return;
  const s = 8, W = 4 * KP.dx, H = 4 * KP.dy;
  setStyle(el, 'left', (KP.x - KP.dx / 2) + 'px'); setStyle(el, 'top', (KP.y - KP.dy / 2) + 'px'); setStyle(el, 'width', W + 'px'); setStyle(el, 'height', H + 'px');
  el.width = Math.round(W * s); el.height = Math.round(H * s);
  const c = el.getContext('2d'); c.setTransform(s, 0, 0, s, 0, 0); c.clearRect(0, 0, W, H); c.textAlign = 'center'; c.textBaseline = 'middle';
  for (let r = 0; r < 4; r++) for (let i = 0; i < 4; i++) {
    const k = KP.keys[r][i], n = KP.night[r * 4 + i], x = S.night ? n[0] - KP.x + KP.dx / 2 : KP.dx * (i + 0.5), y = S.night ? n[1] - KP.y + KP.dy / 2 : KP.dy * (r + 0.5);
    if (S.night) {
      // the face lit from behind, brighter at its middle, over the photo's own glyph
      const g = c.createRadialGradient(x, y, 0.5, x, y, KP.nw * 0.62); g.addColorStop(0, 'rgb(46, 86, 56)'); g.addColorStop(1, 'rgb(30, 58, 40)');
      c.shadowBlur = 0; c.fillStyle = g; efbRR(c, x - KP.nw / 2, y - KP.nh / 2, KP.nw, KP.nh, 1.2); c.fill();
    }
    if (!k) continue;
    c.font = '700 3px ' + FONT_MONO; const fs = Math.min(3.1, 3 * KP.w * 0.8 / c.measureText(k).width); c.font = '700 ' + fs.toFixed(2) + 'px ' + FONT_MONO;
    if (S.night) { c.fillStyle = '#9dffbe'; c.shadowColor = 'rgba(125, 255, 162, 0.9)'; c.shadowBlur = 1.2 * s; } else { c.fillStyle = 'rgba(26, 29, 32, 0.9)'; c.shadowBlur = 0; }
    c.fillText(k, x, y + 0.15);
  }
}
if (!JET) $('#kpLeg').hidden = true; else kpDraw();
function gripPress(side) {
  // right grip: weapon trigger; left grip: track (lock / unlock)
  const [x0, y0, x1] = GRIPS[side]; ckPressAt((x0 + x1) / 2, y0 + 18);
  if (side === 'R') fire(); else toggleLock();
}
// the TEDAC's own symbology in the seat view (the full-screen HUD is too small to read there)
// the assist's cue on a touch key (a legend on the glass, no button to light): an amber box round the legend, the
// caution colour, as the display boxes an option; the legend itself drawn as ever
function cueBox(c, s, x, y, align, fs, m) {
  const st = c.strokeStyle, lw = c.lineWidth, sb = c.shadowBlur; c.shadowBlur = 0; c.textAlign = align;
  const w = c.measureText(s).width, x0 = align === 'center' ? x - w / 2 : align === 'left' ? x : x - w;
  c.strokeStyle = '#f2d75c'; c.lineWidth = Math.max(1.5, fs * 0.14); c.strokeRect(x0 - m, y - fs * 0.66, w + 2 * m, fs * 1.32);
  c.strokeStyle = st; c.lineWidth = lw; c.shadowBlur = sb;
}
function drawTedac(rdt) {
  const c = tedacUI.getContext('2d'), W = tedacUI.width, H = tedacUI.height, T = CK.T;
  // the page is right-to-left; the avionics text is not
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, W, H); c.direction = 'ltr';
  if (CK.lrf) { CK.lrf.t -= rdt; if (CK.lrf.t <= 0) CK.lrf = null; }
  // (the ZF-25's pod page shares the large display with the TSD: its text the same 10.5 photo pixels as that page's)
  const u = W / (JET ? 230 : 381), fs = Math.round(W / T.w * (JET ? 10.5 : 9)), ink = '#eef1ea';
  const toC = (sx, sy) => { const p = ckToImg({ x: CK.sens.x + sx * CK.sens.w / VW, y: CK.sens.y + sy * CK.sens.h / VH }); return [(p.x - T.x) * W / T.w, (p.y - T.y) * H / T.h]; };
  c.shadowColor = 'rgba(0,0,0,0.9)'; c.shadowBlur = 2 * u; c.strokeStyle = ink; c.fillStyle = ink; c.lineWidth = Math.max(1, 1.1 * u);
  // crosshair
  const [cx, cy] = toC(VW / 2, VH / 2), g = (S.zoom >= 4 ? 18 : 7) * u, a = 30 * u;
  c.beginPath(); c.moveTo(cx - g - a, cy); c.lineTo(cx - g, cy); c.moveTo(cx + g, cy); c.lineTo(cx + g + a, cy);
  c.moveTo(cx, cy - g - a * 0.7); c.lineTo(cx, cy - g); c.moveTo(cx, cy + g); c.lineTo(cx, cy + g + a * 0.7); c.stroke();
  // track gate
  if (S.sel && !S.sel.escaped) {
    const sp = toScreen(S.sel.x, S.sel.y), [x, y] = toC(sp.x, sp.y);
    const sz = Math.max(5 * u, (S.sel.kind !== 'personnel' ? S.sel.len * 0.75 : 3.5) * PXM / S.view.w * VW * CK.sens.w / VW / CK.k * W / T.w);
    if (S.tracking && S.quality >= 3) c.strokeRect(x - sz, y - sz, sz * 2, sz * 2);
    else { const q = Math.max(3 * u, sz * 0.45); c.beginPath(); for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const px = x + ax * sz, py = y + ay * sz; c.moveTo(px - ax * q, py); c.lineTo(px, py); c.lineTo(px, py - ay * q); } if (!S.tracking) c.setLineDash([2 * u, 2 * u]); c.stroke(); c.setLineDash([]); }
  }
  // corner data
  c.font = '600 ' + fs + 'px ' + FONT_MONO; c.textBaseline = 'middle';
  if (CK.sym) {
  const fov = S.zoom >= 7.9 ? 'ZOOM' : S.zoom >= 3.9 ? 'NFOV' : S.zoom >= 1.9 ? 'MFOV' : 'WFOV';
  // data inboard of the key labels, so neither runs into the other. (The ZF-25's pod page is narrow: its field of view
  // shows on the bottom keys, not again here, and the weapon has a line of its own above the track's)
  const top = (JET ? 22 : 30) * u, bot = H - 14 * u, lx = (JET ? 8 : 62) * u, rx = W - (JET ? 8 : 62) * u;
  c.textAlign = 'left'; c.fillText((S.sensor === 'eo' ? (S.night ? 'TV LL' : 'TV') : (JET ? 'IR ' : 'FLIR ') + (S.sensor === 'bh' ? 'BHOT' : 'WHOT')) + (JET ? '  ×' : '  ' + fov + ' ×') + S.zoom.toFixed(1), lx, top);
  c.textAlign = 'right'; c.fillText((CK.lrf ? 'L ' + Math.round(CK.lrf.r) : 'R ' + Math.round(slantRange())) + ' M', rx, top);
  c.textAlign = 'center'; c.fillText(pad(plane.hdg, 3), W / 2, top);
  c.textAlign = 'left'; c.fillStyle = S.quality >= 3 ? '#93f0b4' : S.quality ? '#f3d48a' : ink;
  c.fillText('TRK ' + ['---', 'WEAK', 'MED', 'STRG'][S.quality] + (S.sel ? '  T' + pad(S.sel.id, 2) + (JET && S.sel.pid ? '  PID' : '') : ''), lx, bot - fs * 1.3);
  const f = fireState(), wl = (JET ? WN(S.weapon) : { msl: 'MSL', rkt: 'RKT', gun: 'GUN' }[S.weapon]) + '  ' + (S.armed ? 'ARM' : 'SAFE') + (f.en === 'SAFE' ? '' : '  ' + f.en), wy = bot - fs * (JET ? 2.55 : 1.3);
  c.fillStyle = f.warn ? '#f3d48a' : f.ok ? '#93f0b4' : ink; c.textAlign = 'center';
  c.fillText(wl, W / 2, wy);
  }
  // (a long one smaller, so it stays on the screen)
  if (CK.msg) { c.textAlign = 'center'; c.font = '700 ' + Math.round(fs * 1.4) + 'px ' + FONT_MONO; const mw = c.measureText(CK.msg.s).width; if (mw > W * 0.92) c.font = '700 ' + Math.round(fs * 1.4 * W * 0.92 / mw) + 'px ' + FONT_MONO;
    c.fillStyle = '#f3d48a'; c.fillText(CK.msg.s, W / 2, H * 0.32); c.font = '600 ' + fs + 'px ' + FONT_MONO; }
  // key labels beside their keys, and the grips' functions in the lower corners
  c.fillStyle = ink; c.shadowBlur = 1.5 * u;
  const lab = (s, bx, by, align, on, cue) => {
    if (!s) return;
    const x = (bx - T.x) * W / T.w, y = (by - T.y) * H / T.h;
    c.textAlign = align; c.fillText(s, x, y);
    if (cue && AS.cue === cue) cueBox(c, s, x, y, align, fs, 3 * u);
    if (on) { const w = c.measureText(s).width, x0 = align === 'center' ? x - w / 2 : align === 'left' ? x : x - w; c.strokeRect(x0 - 2 * u, y - fs * 0.62, w + 4 * u, fs * 1.24); }
  };
  const fovOn = { ZOOM: S.zoomGoal === 12, NFOV: S.zoomGoal === 4, MFOV: S.zoomGoal === 2, WFOV: S.zoomGoal === 1 };
  TKEYS.T.forEach(([bx], i) => { const s = TLAB.T[i]; lab(s === 'A/S' ? (S.armed ? 'ARM' : 'SAFE') : s, bx, T.y + 7, 'center', { GUN: S.weapon === 'gun', RKT: S.weapon === 'rkt', MSL: S.weapon === 'msl', TV: S.sensor === 'eo', IR: S.sensor !== 'eo', SYM: !CK.sym }[s] || (s === 'A/S' && S.armed), 'tT:' + s); });
  TKEYS.L.forEach(([, by], i) => lab(TLAB.L[i], T.x + 3, by, 'left', fovOn[TLAB.L[i]] || (TLAB.L[i] === 'LRF' && CK.lrf), 'tL:' + TLAB.L[i]));
  TKEYS.R.forEach(([, by], i) => { const s = TLAB.R[i]; lab(s === 'SNSR' ? (S.sensor === 'eo' ? 'TV' : 'FLIR') : s, T.x + T.w - 3, by, 'right', s === 'LOCK' && S.tracking, 'tR:' + s); });
  TKEYS.L.forEach(([, by], i) => { if (TLAB.L[i] === 'SYM' && !CK.sym) lab('SYM', T.x + 3, by, 'left', true); });
  // the bottom row's keys sit under the glass edge: their labels run along the bottom
  const fovB = { WIDE: S.zoomGoal === 1, NARO: S.zoomGoal === 4, ZOOM: S.zoomGoal === 12, TRK: S.tracking };
  TKEYS.B.forEach(([bx], i) => lab(TLAB.B[i], bx, T.y + T.h - 6, 'center', (TLAB.B[i] === 'FRZ' && S.frozen) || fovB[TLAB.B[i]], 'tB:' + TLAB.B[i]));
  // (the ZF-25's hand controllers are on the side consoles, and its bottom row of keys runs into these corners)
  if (!JET) {
    c.font = '600 ' + Math.round(fs * 0.85) + 'px ' + FONT_MONO; c.globalAlpha = 0.85;
    c.textAlign = 'left'; c.fillText('◣ TRK', 4 * u, H - 5 * u);
    c.textAlign = 'right'; c.fillText('FIRE ◢', W - 4 * u, H - 5 * u);
    if (AS.cue === 'fire') { c.globalAlpha = 1; cueBox(c, 'FIRE ◢', W - 4 * u, H - 5 * u, 'right', fs * 0.85, 2.5 * u); }
  }
  c.globalAlpha = 1; c.shadowBlur = 0;
}
const ckPress = $('#ckPress');
// an unlabelled knob or switch says what it set on the TEDAC, as the aircraft would (no text over the view)
function ckTip(x, y, [en]) { CK.msg = { s: en, t: 1.8 }; }
// MPD knobs: brightness and display mode as a filter on the page; panel and flood lights on the night photo
function applyMpd() {
  for (const [side, el] of [['L', mpdL], ['R', mpdR]]) {
    const m = CK.mpd[side], b = m.brt * (m.mode === 'DAY' ? 1 : 0.6);
    el.style.filter = 'brightness(' + b + ')' + (m.mode === 'MONO' ? ' grayscale(1) sepia(1) hue-rotate(65deg) saturate(2.6)' : '');
  }
  CK.mpdT = 0;
}
function applyPanel() { ckImg.style.filter = S.night ? 'brightness(' + (CK.pnl * (CK.flood ? 1.7 : 1)) + ')' : ''; }
function ckPressAt(x, y) {
  ckPress.style.left = x + 'px'; ckPress.style.top = y + 'px';
  ckPress.classList.add('on'); setTimeout(() => ckPress.classList.remove('on'), 130);
  Snd.click();
}
// (rad: the horizon this much above the rails' meeting point in level flight. The owner chose 4° of four shown
// (-6, 0, 4, 8): at 0 the cockpit still looked raised to him; with 4 more of the ground shows down the sides)
// (JET_TILT: the owner chose 0.6 of three shown, full bank, 0.6 and none)
let JET_EYE = 4 * Math.PI / 180, JET_TILT = 0.6;
// the ZF-25's axes in the world (east, north, up): forward, right wing, up, from its heading, pitch and bank
function jetAxes() {
  const o = JX.ac.o, sp = Math.sin(o.psi), cp = Math.cos(o.psi), st = Math.sin(o.theta), ct = Math.cos(o.theta), sf = Math.sin(o.phi), cf = Math.cos(o.phi);
  const r0x = cp, r0y = -sp, u0x = -sp * st, u0y = -cp * st, u0z = ct;
  return { F: { x: sp * ct, y: cp * ct, z: st }, R: { x: r0x * cf - u0x * sf, y: r0y * cf - u0y * sf, z: -u0z * sf }, U: { x: u0x * cf + r0x * sf, y: u0y * cf + r0y * sf, z: u0z * cf } };
}
// the height the horizon's dip is seen from: above the sea up high (the plain runs out to the sea), above the ground
// itself near it (on the runway the horizon is level with the eye; from the sea's height, 410 m below, it sat 0.65°
// under it, and the ground in that band was cut away as past the earth's curve)
const jetDipH = () => Math.max(plane.alt - GROUND * clamp(1 - (plane.alt - GROUND) / 2000, 0, 1), 1);
function setupWindowCam() {
  // the gunner's eye: at the aircraft, looking along the nose and down; the photo's own projection, moved with its frame
  const pg = planeGround(), agl = (plane.alt - 410) * PXM, aglM = plane.alt - 410;
  // the eye line looks 0.6 rad below the airframe's datum (0.35 sitting on the ground: the apron and the horizon);
  // the airframe's own pitch and bank come on top. Near the ground the near plane comes in, or it would cut it away
  // (the ZF-25's photo: its canopy rails meet 15° above its centre, and there, at the eye's level ahead, is the horizon
  // in level flight: the view follows the flight path's climb or dive (gamma), not the nose's few degrees of angle of
  // attack, and the horizon's dip at altitude is taken up too. With the nose's pitch (3.4-4° in the orbit) and the dip
  // (2.2° at 15,000 ft) the horizon sat 6° under the rails, and level flight still looked nose-high to the owner)
  const P = JET ? 0.262 + JET_EYE + Math.sqrt(2 * jetDipH() / 6.371e6) - (JX.ac ? JX.ac.o.gamma : 0)
    : lerp(0.35, 0.6, clamp((aglM - 3) / 150, 0, 1)) - plane.pitch, m = plane.nose;
  const near = clamp(aglM * 0.4, 0.4, 40) * PXM;
  if (Math.abs(wcam.near - near) > 0.01) wcam.near = near;
  // (the jet's ground out past the horizon, 110 km at 15,000 ft, wherever on the glass: winMat cuts it there)
  if (JET) wcam.far = 2.2 * Math.max(aglM, 50) / Math.sqrt(2 * jetDipH() / 6.371e6) * PXM;
  wcam.position.set(pg.x, -pg.y, agl);
  if (JET && JX.ac) {
    // The ZF-25's eye is fixed to the airframe: it looks Pb below the nose in the aircraft's own frame (Pb: the photo's
    // 15°, the owner's 4°, the dip, and the angle of attack, so the horizon sits as above in level flight), and
    // banks with it: in the turn the horizon tilts, the ground on the low wing comes up into the glass and the
    // high wing's side sees sky, as from any aircraft. JET_TILT of the bank shows; the rest the head takes back
    // (bankView, the bank a second behind). (It was a level camera turning the bank back out within a second or
    // two: in the orbit the world only turned about the vertical under a level horizon, as from a car, and the
    // owner found the turn «زحف»: crawling, not flying.)
    // (the angle of attack only once the wing flies: standing or taxiing it is the angle of a few cm/s of creep, any
    // angle at all, and the view swung to the sky or the apron)
    const o = JX.ac.o, Pb = 0.262 + JET_EYE + Math.sqrt(2 * jetDipH() / 6.371e6) + o.alpha * clamp((o.V - 25) / 25, 0, 1), { F, U } = jetAxes();
    const cP = Math.cos(Pb), sP = Math.sin(Pb);
    wcam.up.set(F.x * sP + U.x * cP, F.y * sP + U.y * cP, F.z * sP + U.z * cP);
    wcam.lookAt(pg.x + (F.x * cP - U.x * sP) * 1000, -pg.y + (F.y * cP - U.y * sP) * 1000, agl + (F.z * cP - U.z * sP) * 1000);
    wcam.rotateZ((1 - JET_TILT) * plane.bankView + HEAD_ROLL_SIGN * CK.kr);
  } else {
    wcam.up.set(0, 0, 1);
    wcam.lookAt(pg.x + Math.cos(m) * Math.cos(P) * 1000, -pg.y - Math.sin(m) * Math.cos(P) * 1000, agl - Math.sin(P) * 1000);
    // the airframe's bank, and the head's own roll (the photo turns with it, about the same centre)
    wcam.rotateZ(-(plane.bank - plane.bankSteady) + HEAD_ROLL_SIGN * CK.kr);
  }
  const W = CK.win;
  wcam.setViewOffset(CK.IW * W.k, CK.IH * W.k, -(W.x - W.k * CK.IW / 2), -(W.y - W.k * CK.IH / 2), VW, VH);
  wcam.updateProjectionMatrix();
}
const _cr = new THREE.Vector3();
// The canopy glass in the cockpit photo, CANOPY (its transparent parts that are not the screens' cut-outs, measured on its
// alpha): the band along the top down to row 375, and the two side windows low on either side. The world outside is
// drawn only inside these, as they fall on the screen this frame (with a margin): in the seat some 45% of the screen,
// and leaned into the TEDAC little or none.
// The ZF-25's bubble: the band across the top and the two wedges down the sides (make_cockpit.py), as three boxes
const CANOPY = JET ? [[0, 0, 1672, 300], [0, 300, 590, 578], [1068, 300, 1672, 578]] : [[0, 0, 1672, 375], [0, 418, 172, 706], [1516, 419, 1672, 719]];
let glassCut = true;   // (off only to check, in tests/perf.cjs, that the cut changes nothing on screen)
function glassRects() {
  if (!glassCut) return [{ x0: 0, y0: 0, x1: VW, y1: VH }];
  const out = [];
  for (const [a, b, c, d] of CANOPY) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const [x, y] of [[a, b], [c, b], [a, d], [c, d]]) { const q = ckFromImg({ x: x * CK.IW / 1672, y: y * CK.IH / 941 }); x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    x0 = clamp(Math.floor(x0 - 4), 0, VW); y0 = clamp(Math.floor(y0 - 4), 0, VH); x1 = clamp(Math.ceil(x1 + 4), 0, VW); y1 = clamp(Math.ceil(y1 + 4), 0, VH);
    if (x1 > x0 && y1 > y0) out.push({ x0, y0, x1, y1 });
  }
  return out;
}
// a screen rectangle (css px, from the top) as a scissor box in a render target of the screen's shape (from the bottom)
function rtScissor(rt, r) {
  const sx = rt.width / VW, sy = rt.height / VH, x0 = Math.floor(r.x0 * sx), x1 = Math.ceil(r.x1 * sx), y0 = Math.floor((VH - r.y1) * sy), y1 = Math.ceil((VH - r.y0) * sy);
  rt.scissor.set(x0, y0, x1 - x0, y1 - y0); rt.scissorTest = true;
}
// a screen rectangle (css px, from the top) as the screen's viewport or scissor box, in whole device pixels: three.js
// takes css px from the bottom, multiplies them by the pixel ratio and rounds down, which at a fractional ratio (the
// adaptive resolution's 2.75, 2.5, 2.25) lost the rectangle's last row or column: a one-pixel seam of nothing along
// the top of the glass and down the side of the TEDAC's video. This covers every device pixel the rectangle touches.
function screenBox(x0, y0, x1, y1) {
  const X0 = Math.floor(x0 * PR), X1 = Math.ceil(x1 * PR), Y0 = Math.floor((VH - y1) * PR), Y1 = Math.ceil((VH - y0) * PR);
  return [(X0 + 0.5) / PR, (Y0 + 0.5) / PR, (X1 - X0 + 0.5) / PR, (Y1 - Y0 + 0.5) / PR];
}
function renderWindow() {
  const rects = glassRects();
  if (!rects.length) return;
  setupWindowCam(); baseDressUpdate();
  // particles stand up toward the eye: the camera's right, made horizontal
  _cr.setFromMatrixColumn(wcam.matrixWorld, 0); _cr.z = 0; _cr.normalize();
  for (const l of [smokeL, fireL, glowE, plumeW, fireW, glowW]) { const u = l.mesh.material.uniforms; u.bill.value = 1; u.camR.value.copy(_cr); }
  plumeW.mesh.visible = fireW.mesh.visible = glowW.mesh.visible = true;
  const hidden = [];
  // the sensor's sharper tiles cover only where it looks: hidden, so the glass shows no patch of them; the whole-map
  // level 0 stays, over the far field (sharper than it, from the same picture)
  const shown = [];
  for (const t of tiles.values()) { if (!t.mesh) continue; if (t.L > 0) { if (t.mesh.visible) { t.mesh.visible = false; hidden.push(t.mesh); } } else if (!t.mesh.visible) { t.mesh.visible = true; shown.push(t.mesh); } }
  farHaze.visible = true; for (const m of REGION_WIN) m.visible = true;
  // (the jet's ground and dust keep their colours by night: winMat's moonlight grades the whole view down, as it
  // does the Sahm's; darkened here too, the tens of kilometres of dust the jet looks through went black)
  winFog.color.setHex(JET ? JET_DUST : S.night ? 0x07080b : S.wx === 'dust' ? 0xa08a6c : S.dusk ? 0xb4a092 : MAP.haze); sceneA.fog = JET ? null : winFog;
  winFog.density = 2.2e-4 * MPP * (S.wx === 'dust' ? 5 : 1);
  // (the jet clears to nothing: the sky is drawn there afterwards)
  renderer.setClearColor(winFog.color, JET ? 0 : 1);
  if (JET) { wcam.updateMatrixWorld(); const u = winMat.uniforms; u.invVP.value.multiplyMatrices(wcam.projectionMatrix, wcam.matrixWorldInverse).invert(); u.eye.value.setFromMatrixPosition(wcam.matrixWorld);
    u.dust.value.setHex(S.wx === 'dust' ? 0x9c8566 : S.dusk ? 0xb8957a : JET_DUST);
    // (a dust storm: some five times the layer's depth, and it stands higher)
    const dk = S.wx === 'dust' ? 1 : 0;
    u.hz.value = -Math.sqrt(2 * jetDipH() / 6.371e6); u.hk.value = JET_HAZE.k * (1 + 4 * dk) * Math.max(0, Math.min(plane.alt, JET_HAZE.top * (1 + dk)) - 410);
    // its axes (east, north, up) from its heading, pitch and bank: the canopy is fixed to it
    const { F, R, U } = jetAxes(); u.bF.value.set(F.x, F.y, F.z); u.bR.value.set(R.x, R.y, R.z); u.bU.value.set(U.x, U.y, U.z); }
  // (the Sahm's evening: its line of sight, to grade the ground below the horizon and not its sky)
  else if (S.dusk && !S.night) { wcam.updateMatrixWorld(); const u = winMat.uniforms; u.invVP.value.multiplyMatrices(wcam.projectionMatrix, wcam.matrixWorldInverse).invert(); u.eye.value.setFromMatrixPosition(wcam.matrixWorld); }
  for (const r of rects) { rtScissor(rtW, r); renderer.setRenderTarget(rtW); renderer.clear(); renderer.render(sceneA, wcam); }
  renderer.setClearColor(0x000000, 1);
  // (fire and flashes: nothing to draw most of the time; then the target is cleared once, whole, and left alone)
  if (fireL.n + glowE.n + fireW.n + glowW.n === 0) { if (!rtClear.has(rtWE)) { rtWE.scissorTest = false; renderer.setRenderTarget(rtWE); renderer.clear(); rtClear.add(rtWE); } }
  else { rtClear.delete(rtWE); for (const r of rects) { rtScissor(rtWE, r); renderer.setRenderTarget(rtWE); renderer.clear(); renderer.render(sceneE, wcam); } }
  for (const l of [smokeL, fireL, glowE]) l.mesh.material.uniforms.bill.value = 0;
  plumeW.mesh.visible = fireW.mesh.visible = glowW.mesh.visible = false;
  sceneA.fog = null; farHaze.visible = false; for (const m of REGION_WIN) m.visible = false;
  // the blast's light on the glass: a short warm wash, strong at night
  winMat.uniforms.flash.value = S.flash * (S.night ? 0.45 : 0.16);
  for (const m of hidden) m.visible = true;
  for (const m of shown) m.visible = false;
  winMat.uniforms.night.value = S.night ? 1 : 0; winMat.uniforms.time.value = S.t;
  renderer.setRenderTarget(null); renderer.setScissorTest(true);
  for (const r of rects) { renderer.setScissor(...screenBox(r.x0, r.y0, r.x1, r.y1)); renderer.clear(); renderer.render(winScene, postCam); }
  renderer.setScissorTest(false);
}
// helmet display cues: a few absolutely placed elements moved by transform (no extra canvas or render pass)
const ihads = $('#ihads'), ihPool = [], _ihv = new THREE.Vector3();
// target symbols by type, as on the Sahm's radar and helmet pages: wheeled vehicle (box on two wheels), armour
// (box with the track ellipse), launcher (box with the missile arc), dismounts (box with the infantry cross);
// the tracked target in the TADS track-gate corners; the sensor's line of sight as an open cross
const IH_SYM = {
  wheel: 'M-6 -4h12v6h-12z M-3.6 4.6h0.1 M3.5 4.6h0.1',
  armor: 'M-6.5 -4.5h13v9h-13z M-3.5 -1.8h7a1.8 1.8 0 0 1 0 3.6h-7a1.8 1.8 0 0 1 0 -3.6z',
  tel: 'M-6 -2.5h12v6.5h-12z M-4.5 -2.5q4.5 -6 9 0',
  pax: 'M-6 -4h12v8h-12z M-6 -4l12 8 M6 -4l-12 8',
  bldg: 'M-6 -2h12v7h-12z M-7.5 -2l7.5 -5.5 7.5 5.5',
  los: 'M-8 0h4.5 M3.5 0h4.5 M0 -8v4.5 M0 3.5v4.5',
  gate: ' M-12 -7v-5h5 M7 -12h5v5 M12 7v5h-5 M-7 12h-5v-5',
  dead: ' M-8 7l16 -14',
  // a friendly position (blue force tracking): a circle round a dot, never touchable
  fr: 'M-6.5 0a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0 -13 0z M-0.6 0h1.2',
};
const ihKind = t => t.kind === 'house' ? 'bldg' : t.kind !== 'vehicle' ? 'pax' : t.vk === 'mrap' ? 'armor' : t.vk === 'launcher' ? 'tel' : 'wheel';
const ihSvg = d => '<svg viewBox="-14 -14 28 28"><path class="gl" d="' + d + '"/><path class="ln" d="' + d + '"/></svg>';
function drawIhads() {
  let n = 0; CK.marks.length = 0; const shown = [];
  const put = (x, y, sym, t) => {
    _ihv.set(x, -y, 0).project(wcam);
    if (_ihv.z > 1 || Math.abs(_ihv.x) > 1.02 || Math.abs(_ihv.y) > 1.02) return;
    const sx = (_ihv.x + 1) / 2 * VW, sy = (1 - _ihv.y) / 2 * VH;
    // only through the glass: not where the TEDAC's opening shows the sensor video
    const ph = ckToImg({ x: sx, y: sy }), T = CK.T;
    if (ph.x > T.x - 8 && ph.x < T.x + T.w + 8 && ph.y > T.y - 8 && ph.y < T.y + T.h + 8) return;
    // still touchable, but declutter: one symbol where targets crowd (the tracked one is drawn first and always kept)
    if (t) CK.marks.push({ t, x: sx, y: sy });
    if (sym !== 'los') { for (const q of shown) if (Math.abs(q.x - sx) < 15 && Math.abs(q.y - sy) < 12) return; shown.push({ x: sx, y: sy }); }
    let d = ihPool[n];
    if (!d) { d = ihPool[n] = document.createElement('div'); ihads.append(d); }
    n++;
    // the shape only changes when the target's state does: rebuild its SVG then, not every frame
    if (d.dataset.sym !== sym) { d.dataset.sym = sym; d.innerHTML = ihSvg(sym.split('+').map(k => IH_SYM[k]).join('')); d.className = sym.includes('dead') ? 'dead' : ''; }
    setStyle(d, 'transform', 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px)'); setStyle(d, 'display', '');
  };
  // seat view only: none while leaning into the TEDAC for the full screen
  if (S.phase !== 'brief' && CK.t === 0) {
    const list = [...targets].sort((a, b) => (b === S.sel) - (a === S.sel) || b.alive - a.alive);
    for (const t of list) {
      if (t.escaped || t.dormant || t.inside || !matchF(t) || (!t.alive && !CK.known.has(t))) continue;
      put(t.x, t.y, ihKind(t) + (t === S.sel ? '+gate' : '') + (t.alive ? '' : '+dead'), t.alive ? t : null);
    }
    for (const f of friends) if (f.alive) put(f.kind === 'vehicle' ? f.x : f.hx, f.kind === 'vehicle' ? f.y : f.hy, 'fr');
    put(S.view.cx, S.view.cy, 'los');
  }
  for (let i = n; i < ihPool.length; i++) setStyle(ihPool[i], 'display', 'none');
}
function ckResize() {
  const q = HIQ ? 1 : 0.75, w = Math.max(1, Math.round(VW * PR * q)), h = Math.max(1, Math.round(VH * PR * q));
  // fire and flashes at the window's own resolution: at half they shrink to nothing a couple of km out
  // (the ZF-25's world behind its glass at 0.6 of the screen's pixels: ground 4 km and more below, through haze, needs no
  // more, and that pass is most of the frame's work: about a third of it now. (At 0.85 low down, on the ground and on
  // the approach, it looked no sharper: the ground there is as sharp as its pictures)
  { const k = JET ? 0.6 : 1, ww = Math.max(1, Math.round(w * k)), hh = Math.max(1, Math.round(h * k)); rtW.setSize(ww, hh); rtWE.setSize(ww, hh); winMat.uniforms.res.value.set(ww >> 1, hh >> 1); }
  ckLayout();
  // the sensor's size while it fills only the TEDAC (the cover rectangle at t = 0)
  const T = CK.T, a = VW / VH, sw = (T.w / T.h >= a ? T.w : T.h * a) * CK.k0, sh = sw / a;
  const ws = Math.max(2, Math.round(sw * PR)), hs = Math.max(2, Math.round(sh * PR));
  rtAs.setSize(ws, hs); rtLs.setSize(Math.max(1, ws >> 1), Math.max(1, hs >> 1)); rtEs.setSize(Math.max(1, ws >> 1), Math.max(1, hs >> 1)); rtHs.setSize(Math.max(1, ws >> 1), Math.max(1, hs >> 1));
  ckSizeMpds(CK.k0 * CK.lean);
}

/* ---- MPD pages: laid out like the HX-7 multipurpose displays, every page live, every labelled key works ---- */
const MPD_G = '#5df08a', MPD_W = '#e9f2ea', MPD_Y = '#f2d75c', MPD_R = '#ff5a4a', MPD_C = '#6fd8f0';
const PAGES = JET ? ['TSD', 'SMS', 'TGT', 'ENG'] : ['TSD', 'WPN', 'FLT', 'ENG', 'TGT', 'VID'];
const CODES = ['A 1688', 'B 1588', 'C 1788'];
const BURSTS = [10, 20, 50, 100], QTYS = [1, 2, 4], SCALES = JET ? [8, 16, 32] : [2, 4, 8];
function pageKeys(page) {
  // labels for the bottom row, left and right columns; `on` = boxed (selected / active)
  const t = CK.tsd;
  if (JET) {
    if (page === 'TSD') return { B: ['SC', 'MAP', 'CTR', 'TGT', 'LOS', 'RTE'], L: ['N-UP', 'RNG'], R: ['ORBIT', 'RAD', 'ALT', 'SPD'],
      on: { MAP: t.map, CTR: t.ctr, TGT: t.tgt, LOS: t.los, RTE: t.rte, 'N-UP': t.nup, RNG: t.rng, ORBIT: plane.mode === 'orbit' },
      val: { SC: t.sc + 'KM', RAD: (JX.R / 1000) + 'KM', ALT: Math.round(JX.h / 304.8) + 'K', SPD: String(JX.kcas) } };
    // TIME: the simulator's own key (the time two or four times as fast while a bomb falls), boxed while it runs fast
    if (page === 'SMS') return { B: ['A/S', 'LGB', 'GPS', 'AGM'], L: ['CODE', 'TIME'], R: [], on: { 'A/S': S.armed, LGB: S.weapon === 'lgb', GPS: S.weapon === 'jdam', AGM: S.weapon === 'agm', TIME: timeK() > 1 }, val: { CODE: CODES[CK.code][0], TIME: 'x' + CK.tc } };
    if (page === 'TGT') return { B: ['', 'FILT', '', '', '', ''], L: ['PREV', 'NEXT'], R: ['LOCK', 'ACQ'], on: { LOCK: S.tracking }, val: {} };
    return { B: [], L: [], R: ['FUEL'], on: {}, val: { FUEL: CK.fuel } };
  }
  const fly = { 'HVR 1': plane.mode === 'h1', 'HVR 2': plane.mode === 'h2', ORBIT: plane.mode === 'orbit', PTRL: plane.mode === 'route', BASE: plane.mode === 'base' || plane.mode === 'pad' };
  if (page === 'TSD') return { B: ['RTE', 'SC', 'MAP', 'CTR', 'TGT', 'LOS'], L: ['N-UP', 'RNG', 'FCR'], R: ['HVR 1', 'HVR 2', 'ORBIT', 'PTRL', ...(BASE ? ['BASE'] : [])], on: { RTE: t.rte, MAP: t.map, CTR: t.ctr, TGT: t.tgt, LOS: t.los, 'N-UP': t.nup, RNG: t.rng, FCR: S.fcrT > 0, ...fly }, val: { SC: t.sc + 'KM' } };
  if (page === 'WPN') return { B: ['A/S', 'GUN', 'MSL', 'RKT', 'LRF', 'ACQ'], L: ['CODE', 'LST', 'FCR'], R: ['BURST', 'QTY', 'HF', 'WHD'],
    on: { 'A/S': S.armed, GUN: S.weapon === 'gun', MSL: S.weapon === 'msl', RKT: S.weapon === 'rkt', LRF: !!CK.lrf, FCR: S.fcrT > 0 },
    val: { CODE: CODES[CK.code][0], BURST: String(S.burst), QTY: String(S.qty), HF: HF_T[S.hfType][0], WHD: RK_T[S.rkType][0] } };
  if (page === 'FLT') return { B: ['', 'SPD', '', '', 'ALT', ''], L: [], R: [], on: {}, val: { SPD: CK.spd, ALT: CK.alt } };
  if (page === 'ENG') return { B: [], L: [], R: ['FUEL'], on: {}, val: { FUEL: CK.fuel } };
  if (page === 'TGT') return { B: ['', 'FILT', '', '', '', ''], L: ['PREV', 'NEXT'], R: ['LOCK', 'ACQ'], on: { LOCK: S.tracking }, val: {} };
  if (page === 'VID') return { B: [], L: [], R: ['SYM'], on: { SYM: CK.vidSym }, val: {} };
  return { B: [], L: [], R: [], on: {}, val: {} };
}
// The time two or four times as fast (the ZF-25's SMS page, TIME: the simulator's key, not the jet's) while one of its
// bombs falls, back to its own pace for the last seconds: a 2,000 lb bomb from 25,000 ft falls the best part of a
// minute, the pod held on the target all the while
// (and the run in: the outbound leg and the turn back, to 15 s from a bomb's release, or a Barq's until it is in its
// zone, the officer's moment at the world's own pace). Twice as fast unless the officer chooses otherwise: at the
// world's pace a laser bomb's run and fall took 100 s from his consent to the impact, most of it the pilot flying out
// for room and the bomb falling, nothing for him to do (the owner: «الاستهداف طويل»). Never the takeoff roll nor the
// final and the landing: those at their own pace, to be watched
const jetRunLong = () => { const r = JX.run; if (!r) return false; if (r.w === 'agm') return !jetLar('agm', r.sel || r.tp0).ok; return r.out || !r.aligned || r.tr == null || r.tr > 15; };
const TK_STILL = new Set(['stand', 'unable', 'parked', 'takeoff', 'app']);
const timeK = () => JET && CK.tc > 1 && S.phase === 'play' && (JX.fall.some(f => f.p.ix == null && f.p.tti > 5) || jetRunLong() || JX.gs && !TK_STILL.has(JX.gs.st)) ? CK.tc : 1;
function mpdPress(side, g, i) {
  const pg = CK.page[side];
  if (g === 'T') { if (PAGES[i]) CK.page[side] = PAGES[i]; }
  else {
    const keys = pageKeys(pg), k = (keys[g] || [])[i];
    const T = CK.tsd, flip = { RTE: 'rte', MAP: 'map', CTR: 'ctr', TGT: 'tgt', LOS: 'los', 'N-UP': 'nup', RNG: 'rng' };
    // ORBIT: circle what the sensor is on (the locked target, else the crosshair); pressed again, re-centre there
    if (k === 'HVR 1') setFlight('h1'); else if (k === 'HVR 2') setFlight('h2'); else if (k === 'PTRL') setFlight('route'); else if (k === 'BASE') setFlight('base');
    else if (k === 'ORBIT') { const c = S.sel && S.sel.alive && !S.sel.escaped ? S.sel : S.aim; setFlight('orbit', { c: { x: c.x, y: c.y } }); }
    if (k === 'FCR') fcrScan();
    // the ZF-25: the orbit's radius, height and speed, and the weapons
    if (JET && pg === 'TSD' && !JX.gs) {
      if (k === 'RAD') { JX.R = cyc([5000, 7000, 10000], JX.R); jetOrbit(plane.oc || S.aim, plane.mode === 'hp' ? 'hp' : 'orbit'); }
      if (k === 'ALT') { JX.h = cyc([15000, 20000, 25000].map(f => f * 0.3048), JX.h); jetOrbit(plane.oc || S.aim, plane.mode === 'hp' ? 'hp' : 'orbit'); radio('ALTITUDE', 'تغيير الارتفاع', 'jet', ['f.alt.' + Math.round(JX.h / 304.8)]); }
      if (k === 'SPD') { JX.kcas = cyc([300, 330, 380], JX.kcas); JX.P.tgt.kcas = JX.kcas; }
    }
    if (JET && pg === 'SMS') {
      if (k === 'A/S') toggleArm();
      if (k === 'LGB' || k === 'GPS' || k === 'AGM') setWeapon({ LGB: 'lgb', GPS: 'jdam', AGM: 'agm' }[k]);
      if (k === 'CODE') CK.code = (CK.code + 1) % CODES.length;
      if (k === 'TIME') CK.tc = cyc([1, 2, 4], CK.tc);
    }
    if (pg === 'TSD') {
      if (k === 'SC') T.sc = cyc(SCALES, T.sc);
      else if (flip[k]) T[flip[k]] = !T[flip[k]];
    } else if (pg === 'WPN') {
      if (k === 'GUN' || k === 'MSL' || k === 'RKT') setWeapon({ GUN: 'gun', MSL: 'msl', RKT: 'rkt' }[k]);
      if (k === 'A/S') toggleArm();
      if (k === 'LRF') tedacPress('L', TLAB.L.indexOf('LRF'));
      if (k === 'ACQ') lockNearest();
      if (k === 'CODE') CK.code = (CK.code + 1) % CODES.length;
      if (k === 'BURST') S.burst = cyc(BURSTS, S.burst);
      if (k === 'QTY') S.qty = cyc(QTYS, S.qty);
      if (k === 'LST') lstSearch();
      if (k === 'HF') { S.hfType = nextType(S.hf, S.hfType); setWeapon('msl'); }
      if (k === 'WHD') { S.rkType = nextType(S.rk, S.rkType); setWeapon('rkt'); }
    } else if (pg === 'FLT') {
      if (k === 'SPD') CK.spd = CK.spd === 'KTS' ? 'KMH' : 'KTS';
      if (k === 'ALT') CK.alt = CK.alt === 'RAD' ? 'BARO' : 'RAD';
    } else if (pg === 'ENG') {
      if (k === 'FUEL') CK.fuel = CK.fuel === 'LB' ? 'KG' : 'LB';
    } else if (pg === 'TGT') {
      if (k === 'PREV') cycle(-1);
      if (k === 'NEXT') cycle(1);
      if (k === 'LOCK') toggleLock();
      if (k === 'ACQ') lockNearest();
      if (k === 'FILT') $('#btnFilter').click();
    } else if (pg === 'VID') {
      if (k === 'SYM') CK.vidSym = !CK.vidSym;
    }
    syncUI();
  }
  CK.mpdT = 0;
}
function mpdFrame(side, el) {
  // black page; returns the drawing context, the free content box, and `labels` (the key labels beside their physical
  // keys) for drawPage to put on top of the page, so a full-screen map runs under them
  const c = el.getContext('2d'), W = el.width, H = el.height, r = side === 'L' ? CK.ML : CK.MR, B = BTN[side], page = CK.page[side];
  c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.direction = 'ltr';
  // (the text 1/18 of an Sahm MPD's width; on the ZF-25's large display 10.5 photo pixels, as the pod's page beside it)
  const fs = Math.round(JET ? W / r.w * 10.5 : W / 18), lw = Math.max(1, W / 260);
  const cx = bx => (bx - r.x) / r.w * W, cy = by => (by - r.y) / r.h * H;
  const keys = pageKeys(page);
  c.font = '600 ' + fs + 'px ' + FONT_MONO; c.textBaseline = 'middle'; c.lineWidth = lw;
  const label = (s, x, y, align, boxed, val) => {
    if (!s) return;
    c.textAlign = align;
    const w = c.measureText(s).width, x0 = align === 'center' ? x - w / 2 : align === 'left' ? x : x - w;
    // a dark backing, so a label stays readable over the map
    c.fillStyle = 'rgba(0, 0, 0, 0.62)'; c.fillRect(x0 - fs * 0.25, y - fs * 0.62, w + fs * 0.5, fs * 1.24 + (val ? fs * 1.15 : 0));
    c.fillStyle = MPD_W; c.fillText(s, x, y);
    if (AS.cue === side + ':' + s) cueBox(c, s, x, y, align, fs, fs * 0.4);
    if (boxed) { c.strokeStyle = MPD_W; c.strokeRect(x0 - fs * 0.25, y - fs * 0.62, w + fs * 0.5, fs * 1.24); }
    if (val) { c.fillStyle = MPD_G; c.fillText(val, x, y + fs * 1.15); }
  };
  const labels = () => {
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.lineWidth = lw; c.setLineDash([]); c.shadowBlur = 0;
    c.font = '600 ' + fs + 'px ' + FONT_MONO; c.textBaseline = 'middle';
    PAGES.forEach((s, i) => label(s, cx(B.T[i][0]), fs * 0.85, 'center', s === page));
    keys.B.forEach((s, i) => label(s, cx(B.B[i][0]), H - fs * 0.85, 'center', keys.on[s], null));
    keys.L.forEach((s, i) => label(s, fs * 0.3, cy(B.L[i][1]), 'left', keys.on[s], keys.val[s]));
    keys.R.forEach((s, i) => label(s, W - fs * 0.3, cy(B.R[i][1]), 'right', keys.on[s], keys.val[s]));
    // a value over a bottom key (e.g. the TSD scale)
    keys.B.forEach((s, i) => { if (keys.val[s]) { const v = keys.val[s], x = cx(B.B[i][0]), w = c.measureText(v).width; c.fillStyle = 'rgba(0, 0, 0, 0.62)'; c.fillRect(x - w / 2 - fs * 0.25, H - fs * 2.67, w + fs * 0.5, fs * 1.24); c.textAlign = 'center'; c.fillStyle = MPD_G; c.fillText(v, x, H - fs * 2.05); } });
    c.restore();
  };
  return { c, W, H, fs, lw, labels, vid: CK.mpd[side].vid, x0: keys.L.length ? W * 0.17 : W * 0.04, x1: keys.R.length ? W * 0.8 : W * 0.96, y0: fs * 1.8, y1: H - fs * 1.8 };
}
function drawPage(side, el) {
  if (JET && side === 'R') { drawUFC(el); return; }
  if (!CK.mpd[side].pwr) { const c = el.getContext('2d'); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#000'; c.fillRect(0, 0, el.width, el.height); return; }
  const f = mpdFrame(side, el), page = CK.page[side];
  if (page === 'TSD') { drawTSD(f); CK.tsdXf[side] = f.xf; } else if (page === 'WPN') drawWPN(f); else if (page === 'SMS') drawSMS(f); else if (page === 'FLT') drawFLT(f); else if (page === 'ENG') (JET ? drawENGJ : drawENG)(f);
  else if (page === 'VID') drawVID(f); else if (page === 'TGT') drawTGT(f);
  f.labels();
}
// the ZF-25's map pages (the TSD, the kneeboard), out to 30 km and more: the canopy's own pictures, the region's photo
// and its zoom-outs, then the soft mirror copies round the last; only those the page shows, from the innermost that
// covers all of it inwards, each drawn whole over the one round it. c is in map pixels, centred on pg; R: the page's
// reach from there, map pixels
function drawRegion(c, pg, R) {
  const near = g => Math.abs(pg.x - g.cx) < g.size / 2 + R && Math.abs(pg.y - g.cy) < g.size / 2 + R;
  let k = REGION.findIndex(({ g, mirror }) => !mirror && Math.abs(pg.x - g.cx) + R < g.size * 0.49 && Math.abs(pg.y - g.cy) + R < g.size * 0.49);
  if (k < 0) k = REGION.length - 1;
  for (; k >= 0; k--) {
    const { g, t, mirror } = REGION[k], im = t.image, z = g.size;
    if (!im || !im.naturalWidth) continue;
    c.save(); c.translate(g.cx, g.cy); c.rotate(-g.rot);
    if (!mirror) { if (near(g)) c.drawImage(im, -z / 2, -z / 2, z, z); }
    else for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const ax = g.cx + (i - 0.5) * z, ay = g.cy + (j - 0.5) * z;
      if (pg.x + R < ax || pg.x - R > ax + z || pg.y + R < ay || pg.y - R > ay + z) continue;
      c.save(); c.translate((i - 0.5) * z + (i & 1 ? z : 0), (j - 0.5) * z + (j & 1 ? z : 0)); c.scale(i & 1 ? -1 : 1, j & 1 ? -1 : 1);
      // (west of the middle copy, its open-sea strip only, as on the canopy)
      if (i < 0 && MAP.outerSea) c.drawImage(im, 0, 0, im.naturalWidth * MAP.outerSea, im.naturalHeight, 0, 0, z, z); else c.drawImage(im, 0, 0, z, z); c.restore();
    }
    c.restore();
  }
  // the ZF-25's air base, its copy for afar
  if (ABP) { const im = ABP.far.image; if (im && im.width && Math.abs(pg.x - ABP.x0 - ABP.w / 2) < ABP.w / 2 + R && Math.abs(pg.y - ABP.y0 - ABP.h / 2) < ABP.h / 2 + R) c.drawImage(im, ABP.x0, ABP.y0, ABP.w, ABP.h); }
}
function drawTSD(f) {
  const { c, W, H } = f;
  const T = CK.tsd, pg = planeGround(), ox = W / 2, oy = T.ctr ? H * 0.5 : H * 0.7;
  // track-up by default; north-up keeps the map still and turns the ownship symbol instead
  const up = T.nup ? 0 : -Math.PI / 2 - plane.nose;
  const s = (oy - f.y0) / (CK.tsd.sc * 500 * PXM);          // the scale is the range across the page: half of it ahead
  // kept for a tap on the page: page pixels back to the map
  f.xf = { ox, oy, up, s, x: pg.x, y: pg.y, W, H, x0: f.x0, x1: f.x1, y0: f.y0, y1: f.y1 };
  // the digital map fills the whole page, under the key labels. Past the edge of the map photo (6 km square) it runs on
  // in mirror copies of itself, which meet the photo seamlessly, so its edge never cuts across the page
  c.save();
  c.save(); c.translate(ox, oy); c.rotate(up); c.scale(s, s); c.translate(-pg.x, -pg.y);
  if (T.map && REGION.length) {
    // (drawn whole, then all dimmed at once, so the photos do not add up where they overlap)
    drawRegion(c, pg, Math.hypot(W, H) / s);
    c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = 'rgba(0, 0, 0, ' + clamp(1 - 0.55 * f.vid, 0, 1).toFixed(3) + ')'; c.fillRect(0, 0, W, H); c.restore();
  } else if (T.map && tsdImg.complete && tsdImg.naturalWidth) {
    c.globalAlpha = 0.55 * f.vid; const z = FAR.size;
    for (const i of [-1, 0, 1]) for (const j of [-1, 0, 1]) {
      c.save(); c.translate(i === 1 ? FAR.x0 + 2 * z : FAR.x0, j === 1 ? FAR.y0 + 2 * z : FAR.y0); c.scale(i ? -1 : 1, j ? -1 : 1);
      c.drawImage(tsdImg, 0, 0, z, z); c.restore();
    }
    c.globalAlpha = 1;
  }
  const u = W / 220, lw = 1 / s * Math.max(1, u);
  c.strokeStyle = MPD_C; c.lineWidth = lw; c.setLineDash([6 / s * u, 5 / s * u]);
  const oc = plane.oc || { x: W0 / 2, y: H0 / 2 };
  c.beginPath(); c.arc(oc.x, oc.y, plane.R0 * PXM, 0, 6.283); c.stroke();
  // the patrol loop, when flying it
  if (plane.mode === 'route' && plane.route) { c.beginPath(); plane.route.forEach((q, i) => i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y)); c.closePath(); c.stroke(); }
  c.setLineDash([]);
  // the point picked to fly to: a diamond, filled once there
  if (plane.mode === 'hp' && plane.hp) { const h = plane.hp, q = 7 / s * u; c.strokeStyle = c.fillStyle = MPD_C; c.lineWidth = lw; c.beginPath(); c.moveTo(h.x, h.y - q); c.lineTo(h.x + q, h.y); c.lineTo(h.x, h.y + q); c.lineTo(h.x - q, h.y); c.closePath(); plane.hold ? c.fill() : c.stroke(); }
  // the two hover points: H1 / H2 boxes, the one held filled
  if (!JET) for (const k of ['h1', 'h2']) { const h = hoverPt(k), q = 9 / s * u; c.strokeStyle = c.fillStyle = MPD_C; c.lineWidth = lw; plane.mode === k ? c.fillRect(h.x - q / 2, h.y - q / 2, q, q) : c.strokeRect(h.x - q / 2, h.y - q / 2, q, q); }
  // the air base: the runway's outline and the pads
  // (the ZF-25's runway; the Sahm's forward base's pads)
  if (AB || BASE) {
    c.strokeStyle = MPD_C; c.lineWidth = lw * 1.4;
    if (AB) { const [rx, ry0, ry1, rw] = AB.runway; c.strokeRect(rx - rw / 2, ry0, rw, ry1 - ry0); }
    else for (const [px, py] of BASE.pads) { const q = 5 / s * u; c.strokeRect(px - q / 2, py - q / 2, q, q); }
    c.lineWidth = lw;
  }
  // friendlies (blue force tracking): always shown; threats that have shot at us, with their reach
  c.lineWidth = lw * 1.4;
  for (const fr of friends) { if (!fr.alive) continue; const q = 6 / s * u; c.strokeStyle = MPD_C; c.beginPath(); c.arc(fr.x, fr.y, q, 0, 6.283); c.stroke(); c.fillStyle = MPD_C; c.fillRect(fr.x - q * 0.25, fr.y - q * 0.25, q * 0.5, q * 0.5); }
  for (const th of AC.threats) {
    if (!th.alive) continue;
    const reach = (th.vk === 'sa8' ? SAM.r : th.aa > 0 ? MANPADS_R : GUNS[th.gun] ? GUNS[th.gun].air : 0) * PXM, q = 7 / s * u;
    c.strokeStyle = MPD_R; c.globalAlpha = 0.9; c.beginPath(); c.moveTo(th.x, th.y - q); c.lineTo(th.x + q, th.y + q * 0.8); c.lineTo(th.x - q, th.y + q * 0.8); c.closePath(); c.stroke();
    if (reach) { c.globalAlpha = 0.45; c.setLineDash([5 / s * u, 5 / s * u]); c.beginPath(); c.arc(th.x, th.y, reach, 0, 6.283); c.stroke(); c.setLineDash([]); }
    c.globalAlpha = 1;
  }
  c.lineWidth = lw;
  // the road, as on the digital map
  if (T.rte) { c.strokeStyle = 'rgba(242, 215, 92, 0.55)'; c.lineWidth = lw; c.beginPath(); for (let i = 0; i < RN; i += 6) i ? c.lineTo(RX[i], RY[i]) : c.moveTo(RX[i], RY[i]); c.stroke(); }
  // TADS line of sight and footprint
  const v = S.view;
  if (T.los) {
  c.strokeStyle = MPD_W; c.globalAlpha = 0.85; c.setLineDash([4 / s * u, 4 / s * u]);
  c.beginPath(); c.moveTo(pg.x, pg.y); c.lineTo(v.cx, v.cy); c.stroke(); c.setLineDash([]);
  const hw = v.w / 2, hh = v.h / 2; c.beginPath();
  [[-1, -1], [1, -1], [1, 1], [-1, 1]].forEach(([a, b], i) => { const x = v.cx + v.R.x * hw * a + v.D.x * hh * b, y = v.cy + v.R.y * hw * a + v.D.y * hh * b; i ? c.lineTo(x, y) : c.moveTo(x, y); });
  c.closePath(); c.stroke(); c.globalAlpha = 1;
  }
  c.restore();
  // targets the crew has locked: diamonds; destroyed: crosses (upright, in page space)
  const rot = up, cr = Math.cos(rot), sr = Math.sin(rot);
  const toTsd = (x, y) => { const dx = (x - pg.x) * s, dy = (y - pg.y) * s; return [ox + dx * cr - dy * sr, oy + dx * sr + dy * cr]; };
  const d = W / 34; c.lineWidth = Math.max(1.2, W / 160);
  for (const t of targets) {
    if (!T.tgt || !CK.known.has(t) || t.escaped) continue;
    const [x, y] = toTsd(t.x, t.y);
    if (!t.alive) { c.strokeStyle = MPD_R; c.beginPath(); c.moveTo(x - d * 0.7, y - d * 0.7); c.lineTo(x + d * 0.7, y + d * 0.7); c.moveTo(x + d * 0.7, y - d * 0.7); c.lineTo(x - d * 0.7, y + d * 0.7); c.stroke(); continue; }
    c.strokeStyle = t === S.sel ? MPD_Y : MPD_R; c.beginPath(); c.moveTo(x, y - d); c.lineTo(x + d, y); c.lineTo(x, y + d); c.lineTo(x - d, y); c.closePath(); c.stroke();
    // a radar contact: its place in the FCR's shoot order, NTS for the next to shoot
    const fi = S.fcr.findIndex(q => q.t === t);
    if (fi >= 0) { c.fillStyle = MPD_C; c.font = '600 ' + Math.round(W / 26) + 'px ' + FONT_MONO; c.textAlign = 'right'; c.textBaseline = 'middle'; c.fillText(rfTarget() === t ? 'NTS' : String(fi + 1), x - d * 1.2, y); }
    if (t === S.sel) { c.fillStyle = MPD_Y; c.font = '600 ' + Math.round(W / 22) + 'px ' + FONT_MONO; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('T' + pad(t.id, 2), x + d * 1.3, y); }
  }
  // the ZF-25's weapons away (its stores management feeds the TSD): from the release point a dashed line to where
  // the weapon will hit, the weapon on it (a dot, the Barq a dart) and its time to impact; the laser bomb's
  // impact where the spot is (where it falls on its own while nothing is lased). Once it has hit, a cross there,
  // fading over 8 s
  if (JET) for (let i = JX.trk.length - 1; i >= 0; i--) {
    const k = JX.trk[i], p = k.p, flying = projectiles.includes(p) && p.tti > 0;
    if (!flying && k.hit == null) k.hit = S.missionT;
    if (k.hit != null && S.missionT - k.hit > 8) { JX.trk.splice(i, 1); continue; }
    const lased = p.type === 'lgb' && p.tgt && S.tracking && S.sel === p.tgt;
    const [ix, iy] = toTsd(k.ix != null ? k.ix : lased ? p.tgt.x : p.x, k.iy != null ? k.iy : lased ? p.tgt.y : p.y);
    if (!flying) {
      if (k.ix == null) { k.ix = lased ? p.tgt.x : p.x; k.iy = lased ? p.tgt.y : p.y; }
      c.globalAlpha = clamp(1 - (S.missionT - k.hit) / 8, 0, 1); c.strokeStyle = MPD_W; c.lineWidth = Math.max(1.4, W / 140);
      c.beginPath(); c.moveTo(ix - d * 0.6, iy - d * 0.6); c.lineTo(ix + d * 0.6, iy + d * 0.6); c.moveTo(ix + d * 0.6, iy - d * 0.6); c.lineTo(ix - d * 0.6, iy + d * 0.6); c.stroke();
      c.globalAlpha = 1; continue;
    }
    const [sx, sy] = toTsd(k.x0, k.y0), fr = clamp(1 - p.tti / p.tof, 0, 1), wx = lerp(sx, ix, fr), wy = lerp(sy, iy, fr);
    c.strokeStyle = MPD_Y; c.lineWidth = Math.max(1, W / 200); c.setLineDash([W / 70, W / 90]);
    c.beginPath(); c.moveTo(wx, wy); c.lineTo(ix, iy); c.stroke(); c.setLineDash([]);
    c.lineWidth = Math.max(1.4, W / 150); c.beginPath(); c.arc(ix, iy, d * 0.7, 0, 6.283); c.moveTo(ix - d, iy); c.lineTo(ix + d, iy); c.moveTo(ix, iy - d); c.lineTo(ix, iy + d); c.stroke();
    c.fillStyle = MPD_W;
    if (p.type === 'agm') { const a = Math.atan2(iy - wy, ix - wx); c.save(); c.translate(wx, wy); c.rotate(a); c.beginPath(); c.moveTo(d * 0.7, 0); c.lineTo(-d * 0.5, -d * 0.35); c.lineTo(-d * 0.5, d * 0.35); c.closePath(); c.fill(); c.restore(); }
    else { c.beginPath(); c.arc(wx, wy, d * 0.3, 0, 6.283); c.fill(); }
    c.fillStyle = MPD_Y; c.font = '600 ' + Math.round(W / 24) + 'px ' + FONT_MONO; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('TOF ' + pad(Math.ceil(p.tti), 2), ix + d * 1.2, iy + d * 1.1);
  }
  // the FCR's ground sector (90°, 8 km) while it scans and a moment after
  if (S.fcrT > 0 || S.missionT - S.fcrAt < FCR_SCAN + 2) {
    const a0 = plane.nose - FCR_HALF, R = FCR_RANGE * PXM * s, p0 = toTsd(planeGround().x, planeGround().y);
    c.save(); c.strokeStyle = c.fillStyle = MPD_C; c.globalAlpha = 0.18; c.beginPath(); c.moveTo(p0[0], p0[1]);
    for (let k = 0; k <= 16; k++) { const a = a0 + k / 16 * FCR_HALF * 2, q = toTsd(planeGround().x + Math.cos(a) * R / s, planeGround().y + Math.sin(a) * R / s); c.lineTo(q[0], q[1]); }
    c.closePath(); c.fill(); c.globalAlpha = 0.6; c.stroke(); c.restore();
  }
  // ownship and a range ring at half the scale
  c.strokeStyle = MPD_W; c.lineWidth = Math.max(1.5, W / 130);
  const k = W / 26;
  c.save(); c.translate(ox, oy); if (T.nup) c.rotate(plane.nose + Math.PI / 2); c.translate(-ox, -oy);
  c.beginPath(); c.moveTo(ox, oy - k * 1.2); c.lineTo(ox, oy + k * 1.3); c.moveTo(ox - k * 1.2, oy - k * 0.2); c.lineTo(ox + k * 1.2, oy - k * 0.2); c.moveTo(ox - k * 0.5, oy + k * 1.3); c.lineTo(ox + k * 0.5, oy + k * 1.3); c.stroke();
  c.restore();
  if (T.rng) { c.globalAlpha = 0.5; c.lineWidth = Math.max(1, W / 260); c.beginPath(); c.arc(ox, oy, T.sc * 250 * PXM * s, T.nup ? 0 : Math.PI * 1.1, T.nup ? 6.283 : Math.PI * 1.9); c.stroke(); c.globalAlpha = 1; }
  c.restore();
  // heading box and flight data
  const fs = f.fs; c.font = '600 ' + fs + 'px ' + FONT_MONO; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = '#000'; c.fillRect(W / 2 - fs * 1.4, fs * 2.0, fs * 2.8, fs * 1.3); c.strokeStyle = MPD_W; c.lineWidth = f.lw; c.strokeRect(W / 2 - fs * 1.4, fs * 2.0, fs * 2.8, fs * 1.3);
  c.fillStyle = MPD_W; c.fillText(T.nup ? 'N UP' : pad(plane.hdg, 3), W / 2, fs * 2.67);
  // speed and height in the lower right, clear of the scale value under SC
  c.font = '500 ' + Math.round(fs * 0.85) + 'px ' + FONT_MONO; c.textAlign = 'right'; c.fillStyle = MPD_G;
  c.fillText('GS ' + Math.round(plane.gs / 1.852), f.x1 - fs * 0.3, f.y1 - fs * 1.6); c.fillText('ALT ' + Math.round((JET ? plane.alt : plane.alt - 410) * 3.281), f.x1 - fs * 0.3, f.y1 - fs * 0.6);
}
function drawWPN(f) {
  const { c, W, H, fs } = f, cx = (f.x0 + f.x1) / 2, lw = Math.max(1.2, W / 170), sw = (f.x1 - f.x0) / W;
  c.lineWidth = lw; c.strokeStyle = MPD_G;
  // HX-7 planform: fuselage, stub wings and the four pylons
  const y0 = H * 0.3, wy = H * 0.52, X = v => W * v * sw;
  c.beginPath();
  c.moveTo(cx, y0); c.lineTo(cx + X(0.04), y0 + H * 0.06); c.lineTo(cx + X(0.045), wy - H * 0.04); c.lineTo(cx + X(0.43), wy - H * 0.02); c.lineTo(cx + X(0.43), wy + H * 0.035);
  c.lineTo(cx + X(0.045), wy + H * 0.05); c.lineTo(cx + X(0.03), H * 0.8); c.lineTo(cx - X(0.03), H * 0.8); c.lineTo(cx - X(0.045), wy + H * 0.05);
  c.lineTo(cx - X(0.43), wy + H * 0.035); c.lineTo(cx - X(0.43), wy - H * 0.02); c.lineTo(cx - X(0.045), wy - H * 0.04); c.lineTo(cx - X(0.04), y0 + H * 0.06); c.closePath(); c.stroke();
  const sel = S.weapon, pyl = (LOADOUTS[S.load] || LOADOUTS.mix).pyl, PX = [-0.34, -0.17, 0.17, 0.34];
  // the four pylons as loaded: Rumh launchers (four rails, filled while loaded) and Hydra pods (with the rockets
  // left in each), the rounds shared out across the stations of a kind
  const share = (kind, total, cap) => { const st = pyl.map((k, i) => k === kind ? i : -1).filter(i => i >= 0), out = {};
    st.forEach((i, n) => { out[i] = Math.min(cap, Math.floor(total / st.length) + (n < total % st.length ? 1 : 0)); }); return out; };
  const hfOn = share('hf', S.ammo.msl, 4), rkOn = share('rkt', S.ammo.rkt, 19);
  pyl.forEach((k, i) => {
    const px = PX[i];
    if (k === 'hf') for (let r = 0; r < 4; r++) {
      const x = cx + X(px) + (r % 2 ? 1 : -1) * X(0.035), y = wy + H * 0.07 + (r < 2 ? 0 : H * 0.11);
      c.strokeStyle = c.fillStyle = sel === 'msl' ? MPD_W : MPD_G;
      c.beginPath(); c.rect(x - X(0.018), y - H * 0.045, X(0.036), H * 0.09); hfOn[i] > r ? c.fill() : c.stroke();
    } else {
      const x = cx + X(px), y = wy + H * 0.13;
      c.strokeStyle = c.fillStyle = sel === 'rkt' ? MPD_W : MPD_G; c.beginPath(); c.arc(x, y, X(0.05), 0, 6.283); c.stroke();
      c.font = '600 ' + Math.round(fs * 0.85) + 'px ' + FONT_MONO; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(rkOn[i]), x, y);
    }
  });
  // what is left of each kind, the one selected boxed
  const inv = (o, T, on, y) => { let x = f.x0; c.font = '500 ' + Math.round(fs * 0.8) + 'px ' + FONT_MONO; c.textAlign = 'left'; c.textBaseline = 'middle';
    for (const k of Object.keys(o)) { const t = T[k][0] + ' ' + o[k], w = c.measureText(t).width; c.fillStyle = o[k] ? (k === on ? MPD_W : MPD_G) : 'rgba(93,240,138,0.35)'; c.fillText(t, x, y);
      if (k === on) { c.strokeStyle = MPD_W; c.lineWidth = 1; c.strokeRect(x - 3, y - fs * 0.55, w + 6, fs * 1.1); } x += w + fs * 0.9; } };
  inv(S.hf, HF_T, sel === 'msl' ? S.hfType : null, f.y1 - fs * 2.1);
  inv(S.rk, RK_T, sel === 'rkt' ? S.rkType : null, f.y1 - fs * 0.8);
  c.fillStyle = sel === 'gun' ? MPD_W : MPD_G; c.font = '600 ' + fs + 'px ' + FONT_MONO; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(S.ammo.gun), cx, y0 - H * 0.045);
  // master arm state, the selected weapon, time of flight of the next round to land
  c.font = '700 ' + Math.round(fs * 1.2) + 'px ' + FONT_MONO; c.fillStyle = S.armed ? MPD_Y : MPD_G; c.textAlign = 'left'; c.fillText(S.armed ? 'ARM' : 'SAFE', f.x0, fs * 2.4);
  c.font = '500 ' + Math.round(fs * 0.85) + 'px ' + FONT_MONO; c.fillStyle = MPD_W; c.textAlign = 'right';
  c.fillText(sel === 'msl' ? 'HF ' + HF_T[S.hfType][0] + ' ' + HF_T[S.hfType][1] : sel === 'rkt' ? 'RKT ' + RK_T[S.rkType][1] : 'GUN 30MM', f.x1, fs * 2.4);
  c.fillStyle = MPD_G;
  if (sel === 'msl' && S.hfType === 'rf') { const nts = rfTarget(); c.fillStyle = S.fcr.length ? MPD_C : MPD_G; c.fillText('FCR ' + S.fcr.length + (nts ? '  NTS T' + pad(nts.id, 2) : ''), f.x1, fs * 3.4); }
  else if (sel === 'msl' || (sel === 'rkt' && S.rkType === 'gd')) c.fillText('CODE ' + CODES[CK.code], f.x1, fs * 3.4);
  if (S.fcrT > 0) { c.fillStyle = MPD_C; c.fillText('FCR SCAN', f.x1, fs * 4.4); }
  const fl = projectiles.filter(p => p.type !== 'gun' && p.tti > 0).sort((a, b) => a.tti - b.tti)[0];
  if (fl) { c.fillStyle = MPD_Y; c.textAlign = 'left'; c.fillText('TOF ' + pad(Math.ceil(fl.tti), 2), f.x0, fs * 3.4); }
}
// ---- the ZF-25's pages: SMS (its stores), ENG (the two F110s), and the up-front controller's small screen
function drawSMS(f) {
  const { c, W, H, fs } = f, cx = (f.x0 + f.x1) / 2, lw = Math.max(1.2, W / 170), X = v => (f.x1 - f.x0) * v;
  c.lineWidth = lw; c.strokeStyle = MPD_G;
  // ZF-25 planform from above: the nose, the big wing with its cropped tips, the twin fins' stabilators. Its heights
  // (0.22 at the nose to 0.82 at the stabilators, of the page) are fitted above the stores' line under it (Y)
  const top = H * 0.22, bot = Math.min(H * 0.82, f.y1 - fs * 1.6), Y = v => top + (v - 0.22) / 0.6 * (bot - top);
  c.beginPath();
  c.moveTo(cx, Y(0.22)); c.lineTo(cx + X(0.04), Y(0.32)); c.lineTo(cx + X(0.06), Y(0.42)); c.lineTo(cx + X(0.42), Y(0.54)); c.lineTo(cx + X(0.42), Y(0.6));
  c.lineTo(cx + X(0.08), Y(0.6)); c.lineTo(cx + X(0.08), Y(0.7)); c.lineTo(cx + X(0.24), Y(0.78)); c.lineTo(cx + X(0.24), Y(0.82)); c.lineTo(cx + X(0.06), Y(0.82));
  c.lineTo(cx - X(0.06), Y(0.82)); c.lineTo(cx - X(0.24), Y(0.82)); c.lineTo(cx - X(0.24), Y(0.78)); c.lineTo(cx - X(0.08), Y(0.7)); c.lineTo(cx - X(0.08), Y(0.6));
  c.lineTo(cx - X(0.42), Y(0.6)); c.lineTo(cx - X(0.42), Y(0.54)); c.lineTo(cx - X(0.06), Y(0.42)); c.lineTo(cx - X(0.04), Y(0.32)); c.closePath(); c.stroke();
  // the stations: the conformal tanks' rows along the fuselage, the wing pylons; each store a box, filled while on
  const at = { LCFT1: [-0.1, 0.42], LCFT2: [-0.1, 0.5], LCFT3: [-0.1, 0.58], RCFT1: [0.1, 0.42], RCFT2: [0.1, 0.5], RCFT3: [0.1, 0.58], W2: [-0.26, 0.56], W2B: [-0.33, 0.58], W8: [0.26, 0.56], W8B: [0.33, 0.58] };
  const on = JX.ac ? JX.ac.stores : {}, L = LOADOUTS[S.load] || LOADOUTS.cas;
  for (const k in at) {
    const st = on[k], w = st && JW.find(q => L.t[q] === st);
    if (!st || !w) continue;
    const [ax, ay] = at[k], x = cx + X(ax);
    c.strokeStyle = c.fillStyle = w === S.weapon ? MPD_W : MPD_G; c.beginPath(); c.rect(x - X(0.018), Y(ay - 0.04), X(0.036), Y(ay + 0.04) - Y(ay - 0.04)); c.fill();
  }
  // what is left of each, the one selected boxed; the arming, the laser code, a bomb's time of fall
  let x = f.x0; c.font = '500 ' + Math.round(fs * 0.8) + 'px ' + FONT_MONO; c.textAlign = 'left'; c.textBaseline = 'middle';
  for (const w of JW) { if (!L.n[w]) continue; const t = L.t[w] + ' ' + S.ammo[w], tw = c.measureText(t).width; c.fillStyle = S.ammo[w] ? (w === S.weapon ? MPD_W : MPD_G) : 'rgba(93,240,138,0.35)'; c.fillText(t, x, f.y1 - fs * 0.8);
    if (w === S.weapon) { c.strokeStyle = MPD_W; c.lineWidth = 1; c.strokeRect(x - 3, f.y1 - fs * 1.35, tw + 6, fs * 1.1); } x += tw + fs * 0.9; }
  c.font = '700 ' + Math.round(fs * 1.2) + 'px ' + FONT_MONO; c.fillStyle = S.armed ? MPD_Y : MPD_G; c.textAlign = 'left'; c.fillText(S.armed ? 'ARM' : 'SAFE', f.x0, fs * 2.4);
  c.font = '500 ' + Math.round(fs * 0.85) + 'px ' + FONT_MONO; c.fillStyle = MPD_W; c.textAlign = 'right';
  c.fillText(WN(S.weapon) + '  ' + jetGuide(), f.x1, fs * 2.4);
  const fl = projectiles.filter(p => JW.includes(p.type) && p.tti > 0).sort((a, b) => a.tti - b.tti)[0];
  if (fl) { c.fillStyle = MPD_Y; c.textAlign = 'left'; c.fillText('TOF ' + pad(Math.ceil(fl.tti), 2), f.x0, fs * 3.5); }
  if (JX.run && JX.run.tr != null && !JX.run.out) { c.fillStyle = MPD_Y; c.textAlign = 'right'; c.fillText('REL ' + pad(Math.max(0, Math.ceil(JX.run.tr)), 2), f.x1, fs * 3.5); }
}
function drawENGJ(f) {
  // the two F110s: core speed, turbine temperature, fuel flow, nozzle; the fuel and the warnings
  const { c, W, H, fs } = f, e = JX.ac ? JX.ac.eng : [{ n: 0.8, ab: 0, ff: 0.6, noz: 0.2 }, { n: 0.8, ab: 0, ff: 0.6, noz: 0.2 }];
  const bars = [['RPM', 60, 105, q => q.n2 || 68 + 31 * q.n, '%'], ['FTIT', 300, 1000, q => 520 + 420 * q.n + 30 * q.ab, '°C'], ['FF', 0, 60, q => q.ff * 7.94, 'K'], ['NOZ', 0, 100, q => (q.noz || 0) * 100, '%']];
  const top = f.y0 + fs * 1.6, bot = H * 0.72, bw = W * 0.04;
  bars.forEach(([name, lo, hi, fn], bi) => {
    const gx = W * (0.12 + bi * 0.2);
    c.font = '600 ' + Math.round(fs * 0.8) + 'px ' + FONT_MONO; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = MPD_W; c.fillText(name, gx + bw * 0.6, f.y0 + fs * 0.6);
    e.forEach((q, ei) => {
      const x = gx + ei * bw * 1.3, val = fn(q), k = clamp((val - lo) / (hi - lo), 0, 1);
      c.strokeStyle = MPD_G; c.lineWidth = f.lw; c.strokeRect(x - bw / 2, top, bw, bot - top);
      c.fillStyle = MPD_G; c.fillRect(x - bw / 2, bot - (bot - top) * k, bw, (bot - top) * k);
      c.font = '500 ' + Math.round(fs * 0.65) + 'px ' + FONT_MONO; c.fillStyle = MPD_W; c.fillText(String(Math.round(val)), x, bot + fs * 0.75);
    });
  });
  c.font = '600 ' + Math.round(fs * 0.85) + 'px ' + FONT_MONO; c.textAlign = 'left'; c.fillStyle = MPD_G;
  c.fillText('FUEL ' + Math.round(CK.fuel === 'LB' ? plane.fuel : plane.fuel * 0.4536) + ' ' + CK.fuel, W * 0.06, H * 0.86);
  c.fillStyle = MPD_W; c.fillText('BINGO 4000', W * 0.06, H * 0.86 + fs * 1.1);
  c.textAlign = 'right'; c.font = '600 ' + Math.round(fs * 0.8) + 'px ' + FONT_MONO;
  AC.warn.slice(-3).forEach((w, i) => { c.fillStyle = /WARNING|OUT/.test(w) ? MPD_R : MPD_Y; c.fillText(w, f.x1 - fs * 0.2, f.y0 + fs * (0.7 + i * 1.05)); });
  c.fillStyle = MPD_G; c.fillText('FLARE ' + AC.flares, f.x1 - fs * 0.2, H * 0.86);
}
const UFC_G = '#7dffa2';
// the selected weapon's guidance, as the UFC and the SMS page give it: the GPS's GPS, the laser bomb's code, the
// Barq's imaging infrared seeker; with its state on the UFC: caged on the boresight, slaved to the pod's line of
// sight while the pod tracks, tracking the target itself once it is in the launch zone
function jetGuide(state) {
  const w = S.weapon, sel = jetSel();
  if (w === 'jdam') return 'GPS';
  if (w === 'lgb') return 'LSR ' + CODES[CK.code].slice(2);
  return state ? 'IIR ' + (!(sel && S.tracking) ? 'CAGE' : jetLar('agm', sel).ok ? 'TRK' : 'SLV') : 'IIR';
}
function drawUFC(el) {
  // the up-front controller: the weapon on its station, its guidance (jetGuide), the orbit; when the pilot asks for
  // the run, his question and the two answers (touch the left half to consent, the right half to hold)
  const c = el.getContext('2d'), W = el.width, H = el.height;
  c.setTransform(1, 0, 0, 1, 0, 0); c.fillStyle = '#020a05'; c.fillRect(0, 0, W, H); c.direction = 'ltr';
  // (a line's two halves never run into each other: the font shrinks for a long one)
  const fs = H / 5.4, font = k => { c.font = '600 ' + (fs * k).toFixed(1) + 'px ' + FONT_MONO; };
  const L = (y, a, b, col) => { font(1); const w = c.measureText(a + (b ? '  ' + b : '')).width; if (w > W * 0.9) font(W * 0.9 / w);
    c.fillStyle = col || UFC_G; c.textAlign = 'left'; c.fillText(a, W * 0.05, y); if (b) { c.textAlign = 'right'; c.fillText(b, W * 0.95, y); } font(1); };
  font(1); c.textBaseline = 'middle';
  if (JX.ask) {
    L(fs * 0.85, 'RUN-IN ?', 'PLT', S.t % 1 < 0.6 ? MPD_Y : UFC_G);
    c.strokeStyle = UFC_G; c.lineWidth = Math.max(1, W / 120);
    c.strokeRect(W * 0.04, fs * 2.0, W * 0.44, fs * 1.5); c.strokeRect(W * 0.52, fs * 2.0, W * 0.44, fs * 1.5);
    c.textAlign = 'center'; c.fillStyle = UFC_G; c.fillText('CNSNT', W * 0.26, fs * 2.78); c.fillText('HOLD', W * 0.74, fs * 2.78);
    // (the assist's cue: the CNSNT half boxed in amber inside its frame)
    if (AS.cue === 'ufc:cnsnt') { c.strokeStyle = MPD_Y; c.lineWidth = Math.max(2, W / 70); c.strokeRect(W * 0.06, fs * 2.13, W * 0.4, fs * 1.24); }
    L(fs * 4.5, WN(S.weapon), S.ammo[S.weapon] + ' LEFT');
    return;
  }
  const f = fireState();
  L(fs * 0.85, WN(S.weapon) + ' ' + S.ammo[S.weapon], S.armed ? 'ARM' : 'SAFE', S.armed ? MPD_Y : UFC_G);
  L(fs * 2.05, jetGuide(true), f.en, f.warn ? MPD_Y : UFC_G);
  // (a tasking not yet read on the iPad: its line in place of the orbit's)
  if (EFB.unseen) L(fs * 3.25, '9-LINE ' + EFB.unseen, 'EFB', MPD_Y);
  else if (EFB.chkNew) L(fs * 3.25, 'CHKLST', 'EFB', MPD_Y);
  else if (JX.gs) L(fs * 3.25, { stand: 'STAND', call: 'STAND', unable: 'STAND', taxi: 'TAXI', hold: 'HOLD SHORT', lineup: 'LINE UP', lined: 'LINE UP', takeoff: 'T/O', climb: 'CLIMB', rtb: 'RTB', down: 'RTB', app: JX.P.phase === 'final' || JX.P.phase === 'flare' ? 'FINAL' : JX.ac.o.wow ? 'ROLLOUT' : 'APPROACH', taxiin: 'TAXI', parked: 'PARKED' }[JX.gs.st], Math.round(JX.h / 0.3048) + 'FT');
  else L(fs * 3.25, (plane.mode === 'run' ? 'RUN-IN' : plane.mode === 'hp' ? 'FLY TO' : 'ORB ' + (JX.R / 1000) + 'K'), Math.round(JX.h / 0.3048) + 'FT');
  L(fs * 4.45, 'GS ' + Math.round(plane.gs / 1.852), 'FU ' + (plane.fuel / 1000).toFixed(1));
}
/* ---- the officer's kneeboard: an iPad mini in his gloved left hand (sprites/efb.webp, tools/make_ground3d.py) ----
   Raised and lowered by the top-left key of the keypad beside the UFC (no legend, no light: the owner knows where it
   is). Its screen is two canvases under the picture's cut-out screen: the map, drawn again only when it is moved or
   zoomed, and the symbols and controls over it, drawn when something on them changes (the own ship twice a second).
   It never acts by itself: the tasking comes by radio and a line on the UFC, the pilot's orders only from a touch on
   it. Lowered, it costs nothing. All in the logical pixels of its screen (EFB.W x EFB.H, about the CSS pixels it
   covers, never fewer than 470 across, so it stays legible on a phone). */
const EFB_IMG = { w: 1510, h: 901, scr: [372, 51, 1459, 760] }, EFB_LAP = 0.78;
const EFB = { up: false, tab: 'map', dirty: true, mapDirty: true, cx: 0, cy: 0, mpp: 8, pick: null, card: true, task: null, unseen: 0, chkPh: null, chkNew: false, chkT: 0, rtbT: 0,
  hits: [], ptrs: new Map(), g: null, ownT: 0, W: 748, H: 488, box: null, boxN: null, boxL: null, near: false };
const efbEl = $('#efb'), efbMap = $('#efbMap'), efbUI = $('#efbUI'), efbGrips = [...efbEl.querySelectorAll('.efbGrip')];
const EFB_AMB = '#ffb020', EFB_CY = '#7fe0ff', EFB_RED = '#ff4b4b', EFB_BLU = '#4aa3ff', EFB_GLS = 'rgba(16, 18, 21, 0.74)';
const EFB_FONT = '"IBM Plex Sans Condensed", "IBM Plex Sans Arabic", "IBM Plex Sans", system-ui, sans-serif';
// in the game's language (Arabic mirrored: labels on the right); the codes, grids and call signs stay as they are sent
const EFB_SEP = Lg('، ', ', '), EFB_R = !EN, EFB_9L = '\u200e9-LINE';
function efbLayout() {
  // the hand from the screen's bottom-left corner, its sleeve out past both edges; half the screen's height, but its
  // screen at least 400 px across (a phone) and the whole picture never taller than the screen
  const h = Math.min(VH, Math.max(VH * 0.5, 400 * EFB_IMG.h / (EFB_IMG.scr[2] - EFB_IMG.scr[0]))), k = h / EFB_IMG.h;
  efbEl.style.width = Math.round(EFB_IMG.w * k) + 'px'; efbEl.style.height = Math.round(h) + 'px';
  const [x0, y0, x1, y1] = EFB_IMG.scr, b = { x: x0 * k - 1, y: VH - h + y0 * k - 1, w: (x1 - x0) * k + 2, h: (y1 - y0) * k + 2 };
  for (const el of [efbMap, efbUI]) { el.style.left = (x0 * k - 1) + 'px'; el.style.top = (y0 * k - 1) + 'px'; el.style.width = b.w + 'px'; el.style.height = b.h + 'px'; }
  EFB.W = Math.min(760, Math.max(470, b.w)); EFB.H = EFB.W * b.h / b.w;
  // Held on the knee it is that much smaller and a little in from the edge (efbEl's lap transform, about its bottom-left
  // corner); brought up to the eye, the size laid out here. EFB.box: its screen where it is, for the touches.
  const s = EFB_LAP, tx = Math.round(VW * 0.03);
  efbEl.style.setProperty('--lap-x', tx + 'px'); efbEl.style.setProperty('--lap-s', s);
  EFB.boxN = b; EFB.boxL = { x: tx + b.x * s, y: VH + (b.y - VH) * s, w: b.w * s, h: b.h * s }; EFB.box = EFB.near ? EFB.boxN : EFB.boxL;
  // (the glove below its top, left of the screen; the bezel under the screen)
  [[0, 150, x0, EFB_IMG.h], [x0, y1, EFB_IMG.w, EFB_IMG.h - 90]].forEach(([a, c, d, e], i) => { const g = efbGrips[i]; g.style.left = a * k + 'px'; g.style.top = c * k + 'px'; g.style.width = (d - a) * k + 'px'; g.style.height = (e - c) * k + 'px'; });
  const bw = Math.min(1700, Math.round(b.w * PR));
  for (const el of [efbMap, efbUI]) { el.width = bw; el.height = Math.round(bw * b.h / b.w); }
  EFB.mapDirty = EFB.dirty = true;
}
function efbShow(on) {
  if (on && (!JET || S.phase !== 'play')) return;
  // (shown first, lowered, then raised a frame later: raised in the frame it is shown, it was simply there, no swing)
  EFB.up = on;
  if (on) { efbEl.style.transform = ''; efbEl.style.transition = ''; }
  if (on && efbEl.hidden) { efbEl.hidden = false; void efbEl.offsetWidth; requestAnimationFrame(() => { if (EFB.up) efbEl.classList.add('up'); }); }
  else efbEl.classList.toggle('up', on);
  // (raised to the knee; lowered, it is held near no longer)
  if (!on) efbNear(false);
  // (a new checklist for the phase, and no tasking waiting for an answer: it opens on that)
  if (on && EFB.chkNew && !(EFB.task && EFB.task.state === 'pending') && !EFB.unseen) EFB.tab = 'chk';
  if (on) { EFB.mapDirty = EFB.dirty = true; EFB.pick = null; if (EFB.tab === 'map' && EFB.card || EFB.tab === '9line') EFB.unseen = 0; CK.mpdT = 0; }
  // (lowered and out of sight, it is taken off the page: nothing of it is composited). It is hidden when the slide-down
  // actually ends (transitionend), not after a fixed wait, so a slow frame never cuts it off mid-slide with a sliver
  // still on screen; a longer timeout is only a fallback if no transitionend fires.
  clearTimeout(EFB.hideT); efbEl.removeEventListener('transitionend', EFB.hideH);
  if (!on) {
    EFB.hideH = e => { if (e && e.propertyName && e.propertyName !== 'transform') return; clearTimeout(EFB.hideT); efbEl.removeEventListener('transitionend', EFB.hideH); if (!EFB.up) efbEl.hidden = true; };
    efbEl.addEventListener('transitionend', EFB.hideH);
    EFB.hideT = setTimeout(EFB.hideH, 900);
  }
}
// brought up to the eye to read, or back to the knee (a tap on the hand or the bezel)
function efbNear(on) { EFB.near = on; efbEl.classList.toggle('near', on); if (EFB.boxN) EFB.box = on ? EFB.boxN : EFB.boxL; }
// map pixels <-> the screen's logical pixels
const efbTo = (x, y) => ({ x: (x - EFB.cx) * MPP / EFB.mpp + EFB.W / 2, y: (y - EFB.cy) * MPP / EFB.mpp + EFB.H / 2 });
const efbFrom = q => ({ x: EFB.cx + (q.x - EFB.W / 2) * EFB.mpp / MPP, y: EFB.cy + (q.y - EFB.H / 2) * EFB.mpp / MPP });
function efbView(c, span) { EFB.cx = c.x; EFB.cy = c.y; EFB.mpp = clamp(span / EFB.W, 1.5, 80); EFB.mapDirty = EFB.dirty = true; }
// a grid reference on the map (MGRS, to 100 m): its square fixed, the digits from the map's own metres
function efbGrid(p) {
  const e = Math.floor(((p.x * MPP + 41200) % 100000 + 100000) % 100000 / 100), n = Math.floor(((87300 - p.y * MPP) % 100000 + 100000) % 100000 / 100);
  return '38R KR ' + pad(e, 3) + ' ' + pad(n, 3);
}
const EFB_DIRS = EN ? ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] : ['شمال', 'شمال شرق', 'شرق', 'جنوب شرق', 'جنوب', 'جنوب غرب', 'غرب', 'شمال غرب'];
const efbDir = (dx, dy) => EFB_DIRS[Math.round(Math.atan2(dx, -dy) / (Math.PI / 4) + 8) % 8];
const efbBrg = (dx, dy) => pad(Math.round((Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360) || 360, 3);
// the tasking: a 9-line from HUNTER when ours are on the ground, else the strike tasking from Ops; what the targets
// were when it was passed (they are not tracked on it), its threats and restrictions. ts: the targets it is about
function efbTask(ts, pending) {
  const mi = MISSIONS.find(m => m.id === missionId) || {}, i = Math.max(0, MISSIONS.indexOf(mi));
  const tg = ts.filter(t => t.alive && !t.escaped && t.side !== 'blue');
  if (!tg.length) return;
  const c = { x: tg.reduce((a, t) => a + t.x, 0) / tg.length, y: tg.reduce((a, t) => a + t.y, 0) / tg.length };
  const r = Math.max(300 * PXM, ...tg.map(t => Math.hypot(t.x - c.x, t.y - c.y) + 120 * PXM));
  // the IP: 5 nm out toward home (the base, else the north)
  const hm = AB ? { x: AB.runway[0], y: (AB.runway[1] + AB.runway[2]) / 2 } : { x: c.x, y: c.y - 1 };
  const hl = Math.hypot(hm.x - c.x, hm.y - c.y) || 1, ip = { x: c.x + (hm.x - c.x) / hl * 9260 * PXM, y: c.y + (hm.y - c.y) / hl * 9260 * PXM };
  const ipN = ['RAVEN', 'FALCON', 'OSPREY', 'KESTREL', 'HARRIER', 'MERLIN', 'BUZZARD', 'SHRIKE', 'CONDOR', 'TALON'][i % 10];
  // what is there, by kind; the threats among it
  const n = {}; for (const t of tg) { const k = t.kind === 'personnel' ? (t.en === 'MANPADS' ? Lg('صواريخ كتف', 'MANPADS') : Lg('أفراد', 'PAX')) : Lg(t.type, t.en || 'VEH'); n[k] = (n[k] || 0) + (t.kind === 'personnel' ? t.men.length : 1); }
  const kinds = Object.entries(n).sort((a, b) => b[1] - a[1]), dk = kinds.slice(0, 3).map(([k, v]) => v + ' ' + k).join(EFB_SEP).length > 30 ? 2 : 3, desc = kinds.slice(0, dk).map(([k, v]) => v + ' ' + k).join(EFB_SEP) + (kinds.length > dk ? ' +' + (kinds.length - dk) : '');
  const thr = [...new Set(tg.map(t => t.vk === 'sa8' ? 'SAM-R' : t.en === 'MANPADS' ? Lg('صواريخ كتف', 'MANPADS') : t.vk === 'zu23e' ? 'AAG-23' : t.gun === 'dshk' || t.gun === 'kpvt' ? Lg('مضادات أرضية', 'AAA') : '').filter(Boolean))];
  const fr = friends.filter(f => f.alive), near = fr.map(f => ({ f, d: Math.hypot(f.x - c.x, f.y - c.y) })).sort((a, b) => a.d - b.d)[0];
  const ft = Math.round(GROUND * 3.2808 / 10) * 10, dx = c.x - ip.x, dy = c.y - ip.y;
  const hunter = fr.length > 0, egress = efbDir(ip.x - c.x, ip.y - c.y);
  const dc = near && tg.some(t => fr.some(f => Math.hypot(f.x - t.x, f.y - t.y) * MPP < 600));
  const rmk = [dc ? Lg('خطر قريب', 'DANGER CLOSE') : '', ...thr, Lg('ليزر ', 'LSR ') + CODES[CK.code].slice(2), hunter ? '' : Lg('لا قوات صديقة، مسموح بالاشتباك', 'NO FRIENDLIES, CLEARED TO ENGAGE')].filter(Boolean).join(' · ');
  const nm = (Math.hypot(dx, dy) * MPP / 1852).toFixed(1) + Lg(' ميل', ' NM'), el = ft.toLocaleString('en-US') + Lg(' قدم', ' FT MSL'), none = Lg('لا يوجد', 'NONE'), eg = egress + Lg(' إلى ', ' TO ') + ipN;
  const rows = hunter ? [
    [Lg('نقطة البدء', 'IP/BP'), 'IP ' + ipN], [Lg('الاتجاه', 'HDG'), efbBrg(dx, dy) + '°' + (near ? Lg(' · إزاحة ', ' · OFFSET ') + efbDir(-(near.f.x - c.x), -(near.f.y - c.y)) : '')], [Lg('المسافة', 'DIST'), nm],
    [Lg('الارتفاع', 'ELEV'), el], [Lg('الوصف', 'DESC'), desc], [Lg('الموقع', 'LOC'), efbGrid(c)], [Lg('التعليم', 'MARK'), none],
    [Lg('الصديق', 'FRND'), near ? efbDir(near.f.x - c.x, near.f.y - c.y) + ' ' + Math.round(near.d * MPP / 50) * 50 + Lg(' م', ' M') : none], [Lg('الخروج', 'EGRESS'), eg]]
    : [[Lg('المهمة', 'MSN'), EN ? (mi.en || 'STRIKE').split(' · ')[0] : mi.ar || 'ضربة'], [Lg('الهدف', 'TGT'), desc], [Lg('الموقع', 'LOC'), efbGrid(c)], [Lg('الارتفاع', 'ELEV'), el],
      [Lg('نقطة البدء', 'IP'), ipN + ' · ' + efbBrg(dx, dy) + '° ' + nm], [Lg('وقت الضرب', 'TOT'), Lg('فورًا', 'ASAP')], [Lg('الخروج', 'EGRESS'), eg]];
  const type = hunter ? 'CAS' : (mi.en || '').indexOf('INTERDICTION') >= 0 ? 'AI' : 'STRIKE';
  EFB.task = { title: hunter ? Lg('إسناد قريب ' + EFB_9L + ' · هنتر', 'CAS 9-LINE · HUNTER') : Lg('مهمة · العمليات', 'TASKING · OPS'), nine: hunter, rows, rmk, c, r, ip, ipN, tg: tg.map(t => ({ t, x: t.x, y: t.y })),
    msn: 4101 + i, type: EN ? type : { CAS: 'إسناد', AI: 'اعتراض', STRIKE: 'ضربة' }[type], at: efbClock(true), state: pending ? 'pending' : 'wilco' };
  if (pending) EFB.unseen = 1;
  EFB.dirty = true; CK.mpdT = 0;
}
// the local time on the officer's iPad: the sortie's start (by the light) and the mission's clock; Zulu is 3 h behind
function efbClock(z) {
  const m = ((S.night ? 23 * 60 + 10 : S.dusk ? 18 * 60 + 5 : 14 * 60 + 20) + Math.floor(S.missionT / 60) - (z ? 180 : 0) + 1440) % 1440;
  return pad(Math.floor(m / 60), 2) + (z ? '' : ':') + pad(m % 60, 2) + (z ? 'Z' : '');
}
function efbStart() {
  EFB.tab = 'map'; EFB.card = true; EFB.chkPh = null; EFB.chkNew = false; EFB.pick = null; EFB.rtbT = 0; EFB.unseen = 0; EFB.task = null;
  efbTask(targets, false);
  // (the target area and the own ship, in the part of the map the card leaves open, left of it)
  const t = EFB.task, sp = t ? Math.max(6000, 2.4 * Math.hypot(t.c.x - plane.x, t.c.y - plane.y) * MPP) : 8000;
  efbView(t ? { x: (t.c.x + plane.x) / 2 + 0.2 * sp * PXM, y: (t.c.y + plane.y) / 2 } : plane, sp);
}
function efbTick(rdt) {
  if (!EFB.up) return;
  if (S.phase !== 'play') { efbShow(false); return; }
  EFB.ownT -= rdt; if (EFB.ownT <= 0) { EFB.ownT = 0.5; EFB.dirty = true; }
  if (EFB.rtbT > 0) { EFB.rtbT -= rdt; if (EFB.rtbT <= 0) EFB.dirty = true; }
  if (EFB.mapDirty) { EFB.mapDirty = false; efbDrawMap(); }
  if (EFB.dirty) { EFB.dirty = false; efbDraw(); }
}
function efbCtx(el) { const c = el.getContext('2d'), k = el.width / EFB.W; c.setTransform(k, 0, 0, k, 0, 0); c.direction = EFB_R ? 'rtl' : 'ltr'; return c; }
function efbDrawMap() {
  const c = efbCtx(efbMap), W = EFB.W, H = EFB.H, s = MPP / EFB.mpp;
  c.fillStyle = '#0b0d0e'; c.fillRect(0, 0, W, H);
  c.save(); c.translate(W / 2, H / 2); c.scale(s, s); c.translate(-EFB.cx, -EFB.cy);
  drawRegion(c, { x: EFB.cx, y: EFB.cy }, Math.hypot(W, H) / 2 / s);
  c.restore();
  c.fillStyle = 'rgba(0, 0, 0, 0.14)'; c.fillRect(0, 0, W, H);
  // the 500 m grid (1 km, 2 km, zoomed out)
  const g = EFB.mpp > 22 ? 2000 : EFB.mpp > 11 ? 1000 : 500, a = efbFrom({ x: 0, y: 0 }), b = efbFrom({ x: W, y: H });
  c.strokeStyle = 'rgba(255, 255, 255, 0.16)'; c.lineWidth = 1; c.beginPath();
  for (let m = Math.ceil(a.x * MPP / g) * g; m < b.x * MPP; m += g) { const x = efbTo(m * PXM, 0).x; c.moveTo(x, 0); c.lineTo(x, H); }
  for (let m = Math.ceil(a.y * MPP / g) * g; m < b.y * MPP; m += g) { const y = efbTo(0, m * PXM).y; c.moveTo(0, y); c.lineTo(W, y); }
  c.stroke();
}
function efbRR(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function efbGlass(c, x, y, w, h, r) { efbRR(c, x, y, w, h, r); c.fillStyle = EFB_GLS; c.fill(); c.strokeStyle = 'rgba(255, 255, 255, 0.14)'; c.lineWidth = 1; c.stroke(); }
function efbFont(c, px, wt) { c.font = (wt || 600) + ' ' + px.toFixed(1) + 'px ' + EFB_FONT; }
// a text kept inside its width: the font shrinks for a long one
function efbText(c, s, x, y, w, px, wt) { efbFont(c, px, wt); const m = c.measureText(s).width; if (m > w) efbFont(c, px * w / m, wt); c.fillText(s, x, y); efbFont(c, px, wt); }
// a label on the map, outlined so it reads on any ground
function efbLabel(c, s, x, y, col, al) { efbFont(c, 10.5, 600); c.textAlign = al || 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(0, 0, 0, 0.85)'; c.strokeText(s, x, y); c.fillStyle = col; c.fillText(s, x, y); }
function efbBtn(c, x, y, w, h, s, o) {
  o = o || {}; efbRR(c, x, y, w, h, o.r || 8);
  c.fillStyle = o.bg || 'rgba(255, 255, 255, 0.12)'; c.fill(); if (!o.bg) { c.strokeStyle = 'rgba(255, 255, 255, 0.18)'; c.lineWidth = 1; c.stroke(); }
  c.fillStyle = o.off ? 'rgba(230, 235, 239, 0.35)' : o.col || '#eef2f5'; c.textAlign = 'center'; c.textBaseline = 'middle';
  efbText(c, s, x + w / 2, y + h / 2 + 0.5, w - 8, o.px || 11.5, 700);
  // (the assist's cue: an amber ring round the button, flashing, as an iPad marks the next step)
  if (o.cue && AS.cue === o.cue) { efbRR(c, x - 3, y - 3, w + 6, h + 6, (o.r || 8) + 3); c.strokeStyle = EFB_AMB; c.lineWidth = 2.5; c.stroke(); }
  if (o.fn && !o.off) EFB.hits.push({ x, y, w, h, fn: o.fn });
}
function efbDraw() {
  const c = efbCtx(efbUI), W = EFB.W, H = EFB.H, t = EFB.task; EFB.hits = [];
  c.clearRect(0, 0, W, H); c.textBaseline = 'middle'; c.lineJoin = 'round';
  // (the other pages: the map behind them dimmed, the page on a sheet of glass)
  if (EFB.tab !== 'map') { c.fillStyle = 'rgba(8, 10, 12, 0.82)'; c.fillRect(0, 0, W, H); }
  else efbSymbols(c);
  // status bar
  c.fillStyle = 'rgba(0, 0, 0, 0.45)'; c.fillRect(0, 0, W, 20);
  efbFont(c, 11, 600); c.fillStyle = '#fff'; c.textAlign = 'left'; c.fillText(efbClock(), 12, 10.5);
  c.textAlign = 'right'; c.fillText('✈  ' + Math.max(12, 87 - Math.floor(S.missionT / 400)) + '%', W - 40, 10.5);
  c.strokeStyle = '#fff'; c.lineWidth = 1.3; efbRR(c, W - 34, 5.5, 21, 10, 2.5); c.stroke(); c.fillStyle = '#fff'; c.fillRect(W - 32, 7.5, 14, 6);
  // the ATO pill, the pages
  const st = efbState(t);
  const ato = Lg('أمر المهام ي1 · ', 'ATO D1 · ') + (t ? t.msn + ' ' + t.type + ' · ' : '');
  // (in Arabic it reads from the right: the state at its left end)
  efbFont(c, 11, 600); const aw = c.measureText(ato).width + c.measureText(st).width + 20, wa = c.measureText(ato).width, ws = c.measureText(st).width;
  efbGlass(c, 10, 26, aw, 24, 10); c.textAlign = 'left'; c.fillStyle = '#eef2f5'; c.fillText(ato, EFB_R ? 20 + ws : 20, 38.5); c.fillStyle = EFB_AMB; c.fillText(st, EFB_R ? 20 : 20 + wa, 38.5);
  EFB.hits.push({ x: 10, y: 26, w: aw, h: 24, fn: () => { EFB.tab = 'ato'; } });
  const tabs = [['map', Lg('الخريطة', 'MAP')], ['9line', t && !t.nine ? Lg('المهمة', 'TASK') : EFB_9L], ['ato', Lg('أمر المهام', 'ATO')], ['chk', Lg('التشيك', 'CHKLST')]], tw = Math.min(78, (W - aw - 40) / 4 - 2), sx = Math.max(aw + 22, W / 2 - tw * 2 - 3);
  efbGlass(c, sx, 26, tw * 4 + 6, 24, 10);
  tabs.forEach(([k, s], i) => {
    const x = sx + 3 + i * tw;
    if (EFB.tab === k) { efbRR(c, x, 29, tw, 18, 7); c.fillStyle = 'rgba(255, 255, 255, 0.18)'; c.fill(); }
    c.fillStyle = EFB.tab === k ? '#fff' : '#c3ccd3'; c.textAlign = 'center'; efbText(c, s, x + tw / 2 - (k === '9line' && EFB.unseen ? 7 : 0), 38.5, tw - 6, 11, 700);
    if (k === '9line' && EFB.unseen) { c.fillStyle = EFB_AMB; efbRR(c, x + tw - 17, 32, 13, 12, 6); c.fill(); c.fillStyle = '#111'; efbFont(c, 9.5, 700); c.fillText('1', x + tw - 10.5, 38.5); }
    if (k === 'chk' && EFB.chkNew) { c.fillStyle = EFB_AMB; c.beginPath(); c.arc(x + tw - 7, 33, 3.5, 0, 6.283); c.fill(); }
    if (k === 'chk' && AS.cue === 'efb:chk') { efbRR(c, x - 2, 27, tw + 4, 22, 9); c.strokeStyle = EFB_AMB; c.lineWidth = 2; c.stroke(); }
    EFB.hits.push({ x, y: 26, w: tw, h: 24, fn: () => { EFB.tab = k; if (k === '9line') EFB.unseen = 0; if (k === 'map') EFB.pick = null; } });
  });
  if (EFB.tab === 'map') efbMapChrome(c);
  else if (EFB.tab === '9line') efbPage9(c);
  else if (EFB.tab === 'ato') efbPageAto(c);
  else efbPageChk(c);
}
const efbState = t => !t ? Lg('لا مهمة', 'NO TASKING') : t.state === 'pending' ? Lg('بانتظار الرد', 'PENDING') : t.state === 'unable' ? Lg('اعتذرنا', 'UNABLE') : Lg('نشطة', 'ACTIVE');
function efbSymbols(c) {
  const t = EFB.task, W = EFB.W, H = EFB.H, s = MPP / EFB.mpp;
  c.lineWidth = 1.4;
  if (t) {
    // the target area, the run in from the IP, the targets as passed (crossed out once down)
    const a = efbTo(t.c.x, t.c.y), ip = efbTo(t.ip.x, t.ip.y), r = t.r * s;
    c.setLineDash([6, 4]); c.beginPath(); c.arc(a.x, a.y, r, 0, 6.283); c.fillStyle = 'rgba(255, 176, 32, 0.07)'; c.fill(); c.strokeStyle = EFB_AMB; c.stroke();
    const l = Math.hypot(a.x - ip.x, a.y - ip.y) || 1, ex = a.x - (a.x - ip.x) / l * (r + 6), ey = a.y - (a.y - ip.y) / l * (r + 6);
    c.strokeStyle = EFB_CY; c.lineWidth = 2; c.setLineDash([8, 5]); c.beginPath(); c.moveTo(ip.x, ip.y); c.lineTo(ex, ey); c.stroke(); c.setLineDash([]);
    const ang = Math.atan2(ey - ip.y, ex - ip.x); c.fillStyle = EFB_CY; c.beginPath(); c.moveTo(ex, ey); c.lineTo(ex - 9 * Math.cos(ang - 0.4), ey - 9 * Math.sin(ang - 0.4)); c.lineTo(ex - 9 * Math.cos(ang + 0.4), ey - 9 * Math.sin(ang + 0.4)); c.fill();
    c.beginPath(); c.moveTo(ip.x, ip.y - 9); c.lineTo(ip.x + 8, ip.y + 6); c.lineTo(ip.x - 8, ip.y + 6); c.closePath(); c.stroke(); efbLabel(c, 'IP ' + t.ipN, ip.x, ip.y + 18, EFB_CY);
    for (const { t: u, x, y } of t.tg) {
      const q = efbTo(x, y); c.beginPath(); c.moveTo(q.x, q.y - 7); c.lineTo(q.x + 7, q.y); c.lineTo(q.x, q.y + 7); c.lineTo(q.x - 7, q.y); c.closePath();
      c.fillStyle = u.alive ? 'rgba(255, 75, 75, 0.92)' : 'rgba(120, 120, 120, 0.7)'; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 1.1; c.stroke();
      if (!u.alive) { c.beginPath(); c.moveTo(q.x - 6, q.y - 6); c.lineTo(q.x + 6, q.y + 6); c.moveTo(q.x + 6, q.y - 6); c.lineTo(q.x - 6, q.y + 6); c.strokeStyle = '#111'; c.lineWidth = 1.6; c.stroke(); }
      // the threats among them, with their reach
      const reach = u.vk === 'sa8' ? SAM.r : u.en === 'MANPADS' ? MANPADS_R : 0;
      if (reach && u.alive) { c.setLineDash([4, 4]); c.strokeStyle = 'rgba(255, 75, 75, 0.7)'; c.lineWidth = 1.2; c.beginPath(); c.arc(q.x, q.y, reach * PXM * s, 0, 6.283); c.stroke(); c.setLineDash([]); }
    }
  }
  // friendlies on the datalink: the frame (a rectangle, blue), crossed for foot, an oval in it for armour
  for (const f of friends) {
    if (!f.alive) continue; const q = efbTo(f.x, f.y);
    c.fillStyle = 'rgba(74, 163, 255, 0.92)'; c.fillRect(q.x - 10, q.y - 7, 20, 14); c.strokeStyle = '#fff'; c.lineWidth = 1.1; c.strokeRect(q.x - 10, q.y - 7, 20, 14);
    c.beginPath(); if (f.kind === 'personnel') { c.moveTo(q.x - 10, q.y - 7); c.lineTo(q.x + 10, q.y + 7); c.moveTo(q.x + 10, q.y - 7); c.lineTo(q.x - 10, q.y + 7); } else c.ellipse(q.x, q.y, 6.5, 3.5, 0, 0, 6.283); c.stroke();
  }
  if (t && t.nine && friends.some(f => f.alive)) { const f = friends.find(f => f.alive), q = efbTo(f.x, f.y); efbLabel(c, Lg('هنتر', 'HUNTER'), q.x, q.y + 17, '#9fd0ff'); }
  // what the pilot is flying: his orbit, or the point he is going to
  if (plane.oc && JX.R) {
    const o = efbTo(plane.oc.x, plane.oc.y); c.setLineDash([3, 5]); c.strokeStyle = 'rgba(255, 255, 255, 0.55)'; c.lineWidth = 1.2;
    c.beginPath(); c.arc(o.x, o.y, JX.R * PXM * s, 0, 6.283); c.stroke(); c.setLineDash([]);
  }
  if (plane.mode === 'hp' && plane.hp) { const q = efbTo(plane.hp.x, plane.hp.y); c.strokeStyle = '#fff'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(q.x, q.y - 7); c.lineTo(q.x + 7, q.y); c.lineTo(q.x, q.y + 7); c.lineTo(q.x - 7, q.y); c.closePath(); c.stroke(); }
  // the own ship
  const p = efbTo(plane.x, plane.y);
  c.save(); c.translate(p.x, p.y); c.rotate(plane.track + Math.PI / 2);
  c.beginPath(); c.moveTo(0, -10); c.lineTo(7, 8); c.lineTo(0, 4); c.lineTo(-7, 8); c.closePath(); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = '#000'; c.lineWidth = 1; c.stroke(); c.restore();
  efbLabel(c, Lg('صقر 1-1', 'SAQR 1-1'), p.x + 12, p.y + 4, '#fff', 'left');
  // a point picked on the map
  if (EFB.pick) { const q = efbTo(EFB.pick.x, EFB.pick.y); c.strokeStyle = EFB_CY; c.lineWidth = 1.6; c.beginPath(); c.arc(q.x, q.y, 8, 0, 6.283); c.moveTo(q.x - 13, q.y); c.lineTo(q.x - 4, q.y); c.moveTo(q.x + 4, q.y); c.lineTo(q.x + 13, q.y); c.moveTo(q.x, q.y - 13); c.lineTo(q.x, q.y - 4); c.moveTo(q.x, q.y + 4); c.lineTo(q.x, q.y + 13); c.stroke(); }
}
function efbMapChrome(c) {
  const W = EFB.W, H = EFB.H, t = EFB.task;
  // north, the tools, the scale
  efbGlass(c, 12, 58, 30, 30, 15); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(27, 63); c.lineTo(33, 77); c.lineTo(27, 73); c.lineTo(21, 77); c.closePath(); c.fill(); efbFont(c, 7.5, 700); c.textAlign = 'center'; c.fillText('N', 27, 83);
  const ty = 98, tools = [['+', () => efbZoom(1 / 1.6)], ['−', () => efbZoom(1.6)], ['◎', () => efbView(plane, EFB.mpp * EFB.W)], ['⌖', () => t && efbView(t.c, EFB.mpp * EFB.W)]];
  efbGlass(c, 10, ty, 34, tools.length * 31 + 8, 12);
  tools.forEach(([s, fn], i) => { const y = ty + 4 + i * 31 + (i > 1 ? 4 : 0); c.fillStyle = '#eef2f5'; efbFont(c, 15, 700); c.textAlign = 'center'; c.fillText(s, 27, y + 14); EFB.hits.push({ x: 10, y, w: 34, h: 29, fn }); });
  c.strokeStyle = 'rgba(255, 255, 255, 0.15)'; c.beginPath(); c.moveTo(16, ty + 66); c.lineTo(38, ty + 66); c.stroke();
  const sm = EFB.mpp > 22 ? 2000 : EFB.mpp > 11 ? 1000 : 500, sl = sm / EFB.mpp;
  c.strokeStyle = '#000'; c.lineWidth = 5; c.beginPath(); c.moveTo(14, H - 14); c.lineTo(14 + sl, H - 14); c.stroke();
  c.strokeStyle = '#fff'; c.lineWidth = 3; c.stroke(); efbLabel(c, sm >= 1000 ? sm / 1000 + Lg(' كم', ' KM') : sm + Lg(' م', ' M'), 14 + sl / 2, H - 25, '#fff');
  // a picked point: the pilot's order for it
  if (EFB.pick && !JX.gs) {
    const q = efbTo(EFB.pick.x, EFB.pick.y), bw = 128, x = clamp(q.x - bw / 2, 50, W - bw - 8), y = clamp(q.y - 52, 56, H - 80);
    efbGlass(c, x, y, bw, 34, 10);
    efbBtn(c, x + 4, y + 4, 86, 26, Lg('اتجه هنا', 'FLY TO'), { bg: '#2c7fb8', fn: () => { setFlight('hp', { p: EFB.pick }); EFB.pick = null; } });
    efbBtn(c, x + 94, y + 4, 30, 26, '✕', { fn: () => { EFB.pick = null; } });
  }
  // the pilot's orders, bottom right (not while a tasking waits for the answer: that first)
  // (on the ground going out, and on the way home: the skips; home, the end of the sortie there and then)
  if (JX.gs) {
    const b = [], g = JX.gs;
    if (!g.home && ['call', 'taxi', 'hold', 'lineup'].includes(g.st)) b.push([Lg('تخطَّ إلى المدرج', 'SKIP TO RUNWAY'), jetSkipOut, '#2c7fb8']);
    if (jetCanSkipHome()) b.push([Lg('تخطَّ إلى النهائي', 'SKIP TO FINAL'), jetSkipHome, '#2c7fb8']);
    if (g.home && g.show) b.push([Lg('إنهاء الطلعة', 'END SORTIE'), jetHomeEnd, '#b8472c']);
    const bw = 132, x0 = W - 18 - b.length * (bw + 4) - 4;
    if (b.length) { efbGlass(c, x0, H - 44, b.length * (bw + 4) + 4, 34, 11); b.forEach(([s, fn, bg], i) => efbBtn(c, x0 + 4 + i * (bw + 4), H - 40, bw, 26, s, { bg, fn, px: 11 })); }
  }
  if (t && t.state === 'pending' || JX.gs) { if (t) efbCard(c); return; }
  const cmds = JX.ask ? [[Lg('ادخل', 'RUN-IN'), () => jetConsent(true), '#2e9b5e', false, 'efb:runin'], [Lg('انتظر', 'HOLD'), () => jetConsent(false)]]
    : [[Lg('دُر على الهدف', 'ORBIT TGT'), () => { if (t) { setFlight('orbit', { c: t.c }); radio('FLYING THERE', 'نتجه للنقطة', 'jet', ['f.fly']); } }, null, !t], [Lg('ارتفاع ' + Math.round(JX.h / 304.8) + ' ألف', 'ANGELS ' + Math.round(JX.h / 304.8)), efbAlt], [EFB.rtbT > 0 ? Lg('تأكيد العودة', 'CONFIRM RTB') : Lg('عودة للقاعدة', 'RTB'), efbRtb, EFB.rtbT > 0 ? '#b8452c' : null]];
  const cw = 86, cx = W - 10 - cmds.length * (cw + 4) - 4, cy = H - 44;
  efbGlass(c, cx, cy, cmds.length * (cw + 4) + 4, 34, 11);
  cmds.forEach(([s, fn, bg, off, cue], i) => efbBtn(c, cx + 4 + i * (cw + 4), cy + 4, cw, 26, s, { bg, off, fn, px: 11, cue }));
  if (t) efbCard(c);
}
function efbZoom(k, q) {
  q = q || { x: EFB.W / 2, y: EFB.H / 2 }; const a = efbFrom(q);
  EFB.mpp = clamp(EFB.mpp * k, 1.5, 80); const b = efbFrom(q); EFB.cx += a.x - b.x; EFB.cy += a.y - b.y; EFB.mapDirty = EFB.dirty = true;
}
function efbAlt() { JX.h = cyc([15000, 20000, 25000].map(f => f * 0.3048), JX.h); jetOrbit(plane.oc || S.aim, plane.mode === 'hp' ? 'hp' : 'orbit'); radio('ALTITUDE', 'تغيير الارتفاع', 'jet', ['f.alt.' + Math.round(JX.h / 304.8)]); }
// home, on a second touch (the first asks again): the pilot turns for the base and the sortie ends
function efbRtb() {
  if (EFB.rtbT <= 0) { EFB.rtbT = 4; return; }
  EFB.rtbT = 0; if (JX.run) jetAbort(false); JX.ask = null;
  radio('COPY, RETURNING TO BASE', 'علم، راجعين للقاعدة', 'jet', ['f.rtb']);
  if (AB) jetOrbit({ x: AB.runway[0], y: (AB.runway[1] + AB.runway[2]) / 2 }, 'hp');
  timers.push({ t: 6, fn: () => { S.rtbCall = true; checkEnd(); } });
}
// the tasking card: top right on the map, its leader to the target area; touched on its title it folds away. X(u):
// u in from the card's start side (its right, in Arabic)
function efbCard(c) {
  const W = EFB.W, t = EFB.task, cw = Math.min(250, Math.max(200, W * 0.4)), x = W - cw - 10, y = 58, lh = EFB.H < 340 ? 12.6 : 13.6;
  const X = u => EFB_R ? x + cw - u : x + u, A = EFB_R ? 'right' : 'left', B = EFB_R ? 'left' : 'right';
  if (!EFB.card) {
    const s = t.title + (EFB_R ? '  ◂' : '  ▸'); efbFont(c, 11.5, 700); const w = c.measureText(s).width + 24;
    efbGlass(c, W - w - 10, y, w, 26, 10); c.fillStyle = EFB_AMB; c.textAlign = 'center'; c.fillText(s, W - 10 - w / 2, y + 13.5);
    EFB.hits.push({ x: W - w - 10, y, w, h: 26, fn: () => { EFB.card = true; EFB.unseen = 0; } });
    return;
  }
  // (a value too long for its line goes on two, split at a comma)
  const vw = cw - 92; efbFont(c, 10.8, 500);
  const vals = t.rows.map(([, v]) => { if (c.measureText(v).width <= vw || v.indexOf(EFB_SEP) < 0) return [v]; const p = v.split(EFB_SEP); let i = p.length - 1;
    while (i > 1 && c.measureText(p.slice(0, i).join(EFB_SEP) + EFB_SEP).width > vw) i--; return [p.slice(0, i).join(EFB_SEP) + EFB_SEP.trim(), p.slice(i).join(EFB_SEP)]; });
  const n = vals.reduce((a, v) => a + v.length, 0), pend = t.state === 'pending', h = 30 + n * lh + 34 + (pend ? 36 : 4);
  // the leader line first, under the card
  const a = efbTo(t.c.x, t.c.y), r = t.r * MPP / EFB.mpp, l = Math.hypot(x - a.x, y + h * 0.4 - a.y) || 1;
  c.strokeStyle = EFB_AMB; c.lineWidth = 1.4; c.beginPath(); c.moveTo(a.x + (x - a.x) / l * r, a.y + (y + h * 0.4 - a.y) / l * r); c.lineTo(x, y + h * 0.4); c.stroke();
  efbGlass(c, x, y, cw, h, 14);
  c.textAlign = A; c.fillStyle = EFB_AMB; efbText(c, t.title, X(12), y + 16, cw - 70, 12.5, 700);
  c.textAlign = B; c.fillStyle = '#a7b1b9'; efbFont(c, 10, 600); c.fillText(t.at, X(cw - 12), y + 16);
  EFB.hits.push({ x, y, w: cw, h: 28, fn: () => { EFB.card = false; } });
  let ry = y + 34;
  t.rows.forEach(([k], i) => {
    c.textAlign = A;
    if (t.nine) { c.fillStyle = '#8f9aa3'; efbFont(c, 10.5, 700); c.fillText(String(i + 1), X(12), ry); }
    c.fillStyle = '#8f9aa3'; efbFont(c, 10.5, 500); c.fillText(k, X(t.nine ? 26 : 12), ry);
    for (const v of vals[i]) { c.fillStyle = '#eef2f5'; efbText(c, v, X(80), ry, vw, 10.8, 500); ry += lh; }
  });
  // remarks, wrapped to two lines
  c.fillStyle = '#ffcf70'; efbFont(c, 10.2, 600); ry += 4; const words = t.rmk.split(' '), ln = [''];
  for (const w of words) { const s = ln[ln.length - 1] ? ln[ln.length - 1] + ' ' + w : w; if (c.measureText(s).width > cw - 24 && ln[ln.length - 1]) ln.push(w); else ln[ln.length - 1] = s; }
  ln.slice(0, 2).forEach((s, i) => c.fillText(s, X(12), ry + i * 13));
  if (pend) {
    // (in the air, WILCO only: UNABLE is answered on the ground, before the takeoff)
    const by = y + h - 34, gnd = efbGround(), bw = gnd ? (cw - 30) * 0.56 : cw - 24;
    efbBtn(c, EFB_R ? x + cw - 12 - bw : x + 12, by, bw, 26, Lg('سننفّذ', 'WILCO'), { bg: '#2e9b5e', fn: () => efbAnswer(true), cue: 'efb:wilco' });
    if (gnd) efbBtn(c, EFB_R ? x + 12 : x + 18 + bw, by, cw - 30 - bw, 26, Lg('لا نستطيع', 'UNABLE'), { fn: () => efbAnswer(false) });
  }
}
// the officer's answer to a tasking (a new one in the air: WILCO only; UNABLE belongs on the ground, before the
// takeoff)
const efbGround = () => !!(JX.ac && JX.ac.o.wow);
function efbAnswer(yes) {
  const t = EFB.task; if (!t || t.state !== 'pending') return;
  t.state = yes ? 'wilco' : 'unable'; EFB.unseen = 0; CK.mpdT = 0;
  if (JX.gs && JX.gs.st === 'stand') (yes ? jetTaxi : jetUnable)();
  radio(yes ? 'SAQR 1-1, WILCO' : 'SAQR 1-1, UNABLE', yes ? 'صقر 1-1، سننفّذ' : 'صقر 1-1، لا نستطيع', 'jetfm', [yes ? 'f.r.wilco' : 'f.r.unable']);
}
// a page on its sheet of glass; p.X(u): u in from its start side (the right, in Arabic), p.A / p.B: the alignments
function efbPage(c, title) {
  const W = EFB.W, H = EFB.H; efbGlass(c, 14, 58, W - 28, H - 70, 14);
  const p = { x: 28, y: 96, w: W - 56, A: EFB_R ? 'right' : 'left', B: EFB_R ? 'left' : 'right' }; p.X = u => EFB_R ? p.x + p.w - u : p.x + u;
  c.textAlign = p.A; c.fillStyle = EFB_AMB; efbFont(c, 13, 700); c.fillText(title, p.X(0), 76);
  return p;
}
function efbPage9(c) {
  const t = EFB.task; if (!t) { efbPage(c, efbState(t)); return; }
  const p = efbPage(c, t.title + ' · ' + t.msn), lh = Math.min(20, (EFB.H - 170) / t.rows.length), fz = Math.min(13.5, lh * 0.82);
  c.textAlign = p.B; c.fillStyle = '#a7b1b9'; efbFont(c, 11, 600); c.fillText(Lg('وصلت ', 'RCVD ') + t.at, p.X(p.w), 76);
  t.rows.forEach(([k, v], i) => {
    const y = p.y + i * lh; c.textAlign = p.A;
    if (t.nine) { c.fillStyle = '#8f9aa3'; efbFont(c, fz, 700); c.fillText(String(i + 1), p.X(0), y); }
    c.fillStyle = '#8f9aa3'; efbFont(c, fz * 0.93, 500); c.fillText(k, p.X(t.nine ? 20 : 0), y);
    c.fillStyle = '#eef2f5'; efbText(c, v, p.X(110), y, p.w - 110, fz, 600);
    c.strokeStyle = 'rgba(255, 255, 255, 0.07)'; c.lineWidth = 1; c.beginPath(); c.moveTo(p.x, y + lh / 2); c.lineTo(p.x + p.w, y + lh / 2); c.stroke();
  });
  c.fillStyle = '#ffcf70'; c.textAlign = p.A; efbText(c, t.rmk, p.X(0), p.y + t.rows.length * lh + 6, p.w, 12, 600);
  if (t.state === 'pending') {
    const by = EFB.H - 52, bw = Math.min(180, p.w / 2 - 6);
    efbBtn(c, EFB_R ? p.x + p.w - bw : p.x, by, bw, 30, Lg('سننفّذ', 'WILCO'), { bg: '#2e9b5e', fn: () => efbAnswer(true), px: 13, cue: 'efb:wilco' });
    if (efbGround()) efbBtn(c, EFB_R ? p.x + p.w - 2 * bw - 12 : p.x + bw + 12, by, bw, 30, Lg('لا نستطيع', 'UNABLE'), { fn: () => efbAnswer(false), px: 13 });
  } else { c.fillStyle = t.state === 'unable' ? EFB_RED : '#5fd08a'; efbFont(c, 12, 700); c.fillText(t.state === 'unable' ? Lg('اعتذرنا', 'UNABLE') : Lg('سننفّذ', 'WILCO'), p.X(0), EFB.H - 36); }
}
function efbPageAto(c) {
  const p = efbPage(c, Lg('أمر المهام الجوية · اليوم 1', 'AIR TASKING ORDER · DAY 1')), t = EFB.task, col = [0, 52, 150, 330].map(u => u * p.w / 440);
  c.fillStyle = '#8f9aa3'; efbFont(c, 10.5, 700); c.textAlign = p.A;
  [Lg('المهمة', 'MSN'), Lg('النوع', 'TYPE'), Lg('منطقة الهدف', 'TGT AREA'), Lg('الحالة', 'STATUS')].forEach((s, i) => c.fillText(s, p.X(col[i]), p.y));
  const lh = Math.min(22, (EFB.H - 170) / MISSIONS.length);
  MISSIONS.forEach((m, i) => {
    const y = p.y + 20 + i * lh, cur = m.id === missionId, j = m.jet && m.jet.c ? { x: m.jet.c[0], y: m.jet.c[1] } : null, wt = cur ? 700 : 500;
    if (cur) { c.fillStyle = 'rgba(255, 176, 32, 0.12)'; c.fillRect(p.x - 8, y - lh / 2, p.w + 16, lh); }
    c.fillStyle = cur ? '#fff' : '#c3ccd3'; efbFont(c, 11.5, wt);
    c.fillText(String(4101 + i), p.X(col[0]), y); efbText(c, EN ? (m.en || '').split(' · ')[0] : m.ar || '', p.X(col[1]), y, col[2] - col[1] - 6, 11.5, wt);
    efbFont(c, 11.5, wt); c.fillText(j ? efbGrid(j) : '—', p.X(col[2]), y);
    c.fillStyle = cur ? EFB_AMB : '#6f7a83'; c.fillText(cur ? efbState(t) : Lg('مخططة', 'PLANNED'), p.X(col[3]), y);
  });
}
/* The officer's checklists, the phase's own (the back seat's part of the ZF-25E's: before taxi, before takeoff, the
   attack, fence out on the way home, before landing, after landing), each item ticked by the jet's own state, as he
   would check it by looking: nothing to tick by hand. A new one for the phase (not the attack's: that one is his
   reference on station) is flagged till he has it in front of him: a dot on its tab, a line on the UFC, the iPad's
   key lit by the assist, and the iPad opens on it. What is his to do on it (the master arm safe for the way home and
   the landing) the assist shows on the SMS page. [label, value, state; ar then en] */
const efbArm = () => !S.armed, efbJet = () => JX.ac || { gearCmd: 0, flapCmd: 0, sbCmd: 0, eng: [] };
const EFB_CHKS = {
  taxi: { t: ['قبل السحب', 'BEFORE TAXI'], due: true, items: [
    [['المهمة', 'TASKING'], ['مقبولة', 'WILCO'], () => !!EFB.task && EFB.task.state === 'wilco'],
    [['التسليح الرئيسي', 'MASTER ARM'], ['آمن', 'SAFE'], efbArm],
    [['كود الليزر', 'LASER CODE'], () => CODES[CK.code].slice(2), () => true],
    [['الحاضنة', 'TGP'], ['جاهزة', 'STBY'], () => true]] },
  takeoff: { t: ['قبل الإقلاع', 'BEFORE TAKEOFF'], due: true, items: [
    [['التسليح الرئيسي', 'MASTER ARM'], ['آمن', 'SAFE'], efbArm],
    [['الإذن بالإقلاع', 'TAKEOFF CLEARANCE'], ['مستلم', 'RECEIVED'], () => !!JX.gs && ['lineup', 'lined', 'takeoff'].includes(JX.gs.st)],
    [['المقعد', 'SEAT'], ['مسلّح', 'ARMED'], () => true]] },
  attack: { t: ['تشيك الهجوم', 'ATTACK CHECK'], items: [
    [['التسليح الرئيسي', 'MASTER ARM'], ['تسليح', 'ARM'], () => S.armed],
    [['السلاح', 'WEAPON'], () => WN(S.weapon), () => S.ammo[S.weapon] > 0],
    [['كود الليزر', 'LASER CODE'], () => CODES[CK.code].slice(2), () => true],
    [['الحاضنة', 'TGP'], ['تتبّع · تحقّق', 'TRACK · PID'], () => !!(S.tracking && S.sel && S.sel.pid)],
    [['الإذن', 'CLEARANCE'], ['مسموح بالإطلاق', 'CLEARED HOT'], () => !!(S.sel && S.sel.cleared)],
    [['الدخول', 'RUN-IN'], ['موافقة من الـ UFC', 'CONSENT ON UFC'], () => !!JX.run]] },
  out: { t: ['الخروج من المنطقة', 'FENCE OUT'], due: true, items: [
    [['التسليح الرئيسي', 'MASTER ARM'], ['آمن', 'SAFE'], efbArm],
    [['الحاضنة', 'TGP'], ['مخزّنة', 'STOW'], () => !S.tracking],
    [['الذخيرة', 'STORES'], () => JW.map(w => WN(w) + ' ' + S.ammo[w]).join(' · '), () => true]] },
  land: { t: ['قبل الهبوط', 'BEFORE LANDING'], due: true, items: [
    [['العجلات', 'GEAR'], ['نازلة · 3 أخضر', 'DOWN · 3 GREEN'], () => efbJet().gearCmd === 1],
    [['القلابات', 'FLAPS'], ['نازلة', 'DOWN'], () => efbJet().flapCmd === 1],
    [['كابح الهواء', 'SPEED BRAKE'], ['مغلق', 'IN'], () => !efbJet().sbCmd],
    [['التسليح الرئيسي', 'MASTER ARM'], ['آمن', 'SAFE'], efbArm],
    [['الإذن بالهبوط', 'LANDING CLEARANCE'], ['مستلم', 'RECEIVED'], () => !!(JX.gs && JX.gs.clr)]] },
  after: { t: ['بعد الهبوط', 'AFTER LANDING'], due: true, items: [
    [['القلابات', 'FLAPS'], ['مرفوعة', 'UP'], () => !efbJet().flapCmd],
    [['كابح الهواء', 'SPEED BRAKE'], ['مغلق', 'IN'], () => !efbJet().sbCmd],
    [['التسليح الرئيسي', 'MASTER ARM'], ['آمن', 'SAFE'], efbArm],
    [['المحركات', 'ENGINES'], ['مطفأة على الموقف', 'OFF ON STAND'], () => efbJet().eng.length > 0 && efbJet().eng.every(e => !e.on)]] },
};
// the phase's list: on the stand, out to the runway, on station (the climb to it too), home, on final, back on the ground
function efbChkPhase() {
  const g = JX.gs; if (!JET || S.phase !== 'play') return null;
  if (!g) return 'attack';
  if (g.home) return g.st === 'app' ? (JX.ac && JX.ac.o.wow ? 'after' : 'land') : g.st === 'taxiin' || g.st === 'parked' ? 'after' : 'out';
  return g.st === 'stand' || g.st === 'unable' ? 'taxi' : g.st === 'climb' ? 'attack' : 'takeoff';
}
// (from the jet's loop when its phase moves on: a new list flagged till it is seen)
function efbChkUpdate() {
  const ph = efbChkPhase(); if (ph === EFB.chkPh) return;
  EFB.chkPh = ph; EFB.chkNew = !!(ph && EFB_CHKS[ph].due); EFB.dirty = true; CK.mpdT = 0;
}
function efbPageChk(c) {
  const L = EFB_CHKS[EFB.chkPh || 'attack'], p = efbPage(c, Lg(...L.t)), lh = Math.min(30, (EFB.H - 130) / L.items.length);
  EFB.chkNew = false;
  L.items.forEach(([k, v, ok], i) => {
    const y = p.y + 4 + i * lh, on = ok(), bx = EFB_R ? p.x + p.w - 16 : p.x, vs = typeof v === 'function' ? v() : Lg(...v);
    c.strokeStyle = on ? '#5fd08a' : 'rgba(255, 255, 255, 0.45)'; c.lineWidth = 1.5; efbRR(c, bx, y - 8, 16, 16, 4); c.stroke();
    if (on) { c.beginPath(); c.moveTo(bx + 4, y); c.lineTo(bx + 7, y + 4); c.lineTo(bx + 13, y - 4); c.stroke(); }
    c.textAlign = p.A; c.fillStyle = on ? '#8f9aa3' : '#eef2f5'; efbFont(c, 13, 600); c.fillText(Lg(...k), p.X(28), y);
    c.textAlign = p.B; c.fillStyle = on ? '#5fd08a' : EFB_AMB; c.fillText(vs, p.X(p.w), y);
  });
}
/* ---- touches on it: a tap on its controls, or on the map to pick a point; a drag moves the map, a pinch zooms ---- */
const efbAt = e => { const q = local(e), b = EFB.box, k = EFB.W / b.w; return { x: (q.x - b.x) * k, y: (q.y - b.y) * k }; };
const efbHit = q => EFB.hits.slice().reverse().find(h => q.x >= h.x && q.x <= h.x + h.w && q.y >= h.y && q.y <= h.y + h.h);
efbUI.addEventListener('pointerdown', e => {
  if (!EFB.up) return; e.stopPropagation();
  try { efbUI.setPointerCapture(e.pointerId); } catch (_) {}
  const q = efbAt(e); EFB.ptrs.set(e.pointerId, q);
  if (EFB.ptrs.size === 1) EFB.g = { type: 'tap', q0: q, moved: 0, t0: e.timeStamp, hit: efbHit(q) };
  else if (EFB.ptrs.size === 2 && EFB.tab === 'map') { const [a, b] = [...EFB.ptrs.values()]; EFB.g = { type: 'pinch', d: Math.hypot(a.x - b.x, a.y - b.y) }; }
});
efbUI.addEventListener('pointermove', e => {
  const p = EFB.ptrs.get(e.pointerId); if (!p || !EFB.g) return;
  const q = efbAt(e), dx = q.x - p.x, dy = q.y - p.y; p.x = q.x; p.y = q.y;
  if (EFB.g.type === 'pinch' && EFB.ptrs.size >= 2) {
    const [a, b] = [...EFB.ptrs.values()], d = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
    efbZoom(EFB.g.d / d, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }); EFB.g.d = d;
  } else if (EFB.ptrs.size === 1 && EFB.tab === 'map') {
    EFB.g.moved += Math.hypot(dx, dy);
    if (EFB.g.moved > 7) { EFB.g.type = 'pan'; EFB.cx -= dx * EFB.mpp / MPP; EFB.cy -= dy * EFB.mpp / MPP; EFB.mapDirty = EFB.dirty = true; }
  }
});
function efbEnd(e) {
  if (!EFB.ptrs.has(e.pointerId)) return;
  const q = efbAt(e); EFB.ptrs.delete(e.pointerId);
  const g = EFB.g;
  if (g && g.type === 'tap' && EFB.ptrs.size === 0 && e.type === 'pointerup') {
    Snd.tone(1400, 0.015);
    if (g.hit) g.hit.fn(); else if (EFB.tab === 'map') EFB.pick = efbFrom(q);
    EFB.dirty = true;
  }
  if (EFB.ptrs.size === 0) EFB.g = null; else EFB.g = { type: 'pan', moved: 99 };
}
efbUI.addEventListener('pointerup', efbEnd);
efbUI.addEventListener('pointercancel', efbEnd);
efbUI.addEventListener('contextmenu', e => e.preventDefault());
// the hand or the bezel: tapped, the iPad is brought up to the eye or back to the knee; drawn down, it follows the
// finger at once (an inline transform over its place, the compositor's work alone) and, let go far enough or with a
// flick, goes on down from there at the finger's speed; short of that it settles back
const efbBase = () => EFB.near ? '' : 'translateX(var(--lap-x, 0px)) scale(var(--lap-s, 1))';
function efbLet(g, down) {
  const d = g.d || 0, rest = Math.max(60, efbEl.offsetHeight * (EFB.near ? 1 : EFB_LAP) * 1.32 - d), v = Math.max(0.6, g.v || 0);
  efbEl.style.transition = down ? `transform ${clamp(rest / v / 1000, 0.12, 0.3).toFixed(3)}s cubic-bezier(0.3, 0.5, 0.6, 1)` : 'transform 0.25s cubic-bezier(0.2, 0.85, 0.25, 1)';
  efbEl.style.transform = '';
  if (down) efbShow(false);
  clearTimeout(g.tT); g.tT = setTimeout(() => { if (g.y0 == null) efbEl.style.transition = ''; }, 380);
}
for (const g of efbGrips) {
  g.addEventListener('pointerdown', e => { e.stopPropagation(); try { g.setPointerCapture(e.pointerId); } catch (_) {} g.y0 = local(e).y; g.mv = 0; g.d = 0; g.v = 0; g.t = e.timeStamp; g.drag = false; });
  g.addEventListener('pointermove', e => {
    if (g.y0 == null || !EFB.up) return;
    const d = local(e).y - g.y0; g.mv = Math.max(g.mv, Math.abs(d));
    if (!g.drag && d > 6) { g.drag = true; efbEl.style.transition = 'none'; }
    if (!g.drag) return;
    // (its speed over the last moves, px/ms, for the flick; pushed up it gives only a little)
    const dd = d > 0 ? d : d * 0.2, dt = Math.max(1, e.timeStamp - g.t);
    g.v = 0.6 * g.v + 0.4 * (dd - g.d) / dt; g.d = dd; g.t = e.timeStamp;
    efbEl.style.transform = `translateY(${dd.toFixed(1)}px) ` + efbBase();
  });
  g.addEventListener('pointerup', () => {
    if (g.y0 == null) return; g.y0 = null;
    if (g.drag) efbLet(g, EFB.up && (g.d > 40 || g.v > 0.35));
    else if (g.mv < 8 && EFB.up) { efbNear(!EFB.near); Snd.click(); }
  });
  g.addEventListener('pointercancel', () => { if (g.y0 == null) return; g.y0 = null; if (g.drag) efbLet(g, false); });
}
efbUI.addEventListener('wheel', e => { e.preventDefault(); if (EFB.up && EFB.tab === 'map') efbZoom(Math.exp(e.deltaY * 0.0015), efbAt(e)); }, { passive: false });
function drawFLT(f) {
  // flight page: horizon and pitch ladder, bank scale, heading, airspeed (kt), radar altitude (ft), vertical speed (ft/min)
  const { c, W, H, fs } = f, cx = W / 2, cy = H * 0.52, R = Math.min(W, H) * 0.3;
  const ppd = R / 20;                                // pixels per degree of pitch
  const bank = plane.bank, pitch = plane.pitch * 180 / Math.PI;
  c.save(); c.beginPath(); c.arc(cx, cy, R, 0, 6.283); c.clip();
  c.translate(cx, cy); c.rotate(-bank);
  c.strokeStyle = MPD_G; c.lineWidth = Math.max(1.4, W / 170);
  c.beginPath(); c.moveTo(-R * 1.5, pitch * ppd); c.lineTo(R * 1.5, pitch * ppd); c.stroke();
  c.font = '500 ' + Math.round(fs * 0.7) + 'px ' + FONT_MONO; c.fillStyle = MPD_G; c.textBaseline = 'middle';
  for (const d of [-20, -10, -5, 5, 10, 20]) {
    const y = (pitch - d) * ppd, w = Math.abs(d) % 10 ? R * 0.18 : R * 0.32;
    c.setLineDash(d < 0 ? [R * 0.05, R * 0.04] : []); c.beginPath(); c.moveTo(-w, y); c.lineTo(w, y); c.stroke(); c.setLineDash([]);
    if (!(Math.abs(d) % 10)) { c.textAlign = 'left'; c.fillText(String(Math.abs(d)), w + 3, y); }
  }
  c.restore();
  // fixed aircraft symbol and the bank scale with its pointer
  c.strokeStyle = MPD_W; c.lineWidth = Math.max(2, W / 120);
  c.beginPath(); c.moveTo(cx - R * 0.45, cy); c.lineTo(cx - R * 0.15, cy); c.lineTo(cx - R * 0.08, cy + R * 0.08); c.moveTo(cx + R * 0.45, cy); c.lineTo(cx + R * 0.15, cy); c.lineTo(cx + R * 0.08, cy + R * 0.08); c.stroke();
  c.lineWidth = Math.max(1.2, W / 200); c.strokeStyle = MPD_G;
  for (const a of [-30, -20, -10, 0, 10, 20, 30]) { const r = a * Math.PI / 180 - Math.PI / 2, l = a % 30 ? 0.08 : 0.14; c.beginPath(); c.moveTo(cx + Math.cos(r) * R, cy + Math.sin(r) * R); c.lineTo(cx + Math.cos(r) * R * (1 + l), cy + Math.sin(r) * R * (1 + l)); c.stroke(); }
  { const r = -bank - Math.PI / 2; c.fillStyle = MPD_W; c.beginPath(); c.moveTo(cx + Math.cos(r) * R * 0.97, cy + Math.sin(r) * R * 0.97); c.lineTo(cx + Math.cos(r - 0.06) * R * 0.85, cy + Math.sin(r - 0.06) * R * 0.85); c.lineTo(cx + Math.cos(r + 0.06) * R * 0.85, cy + Math.sin(r + 0.06) * R * 0.85); c.fill(); }
  // numbers
  c.font = '600 ' + fs + 'px ' + FONT_MONO; c.textBaseline = 'middle';
  const box = (txt, x, y, align) => { c.textAlign = align; const w = c.measureText(txt).width, x0 = align === 'left' ? x : x - w; c.strokeStyle = MPD_W; c.lineWidth = f.lw; c.strokeRect(x0 - fs * 0.3, y - fs * 0.7, w + fs * 0.6, fs * 1.4); c.fillStyle = MPD_W; c.fillText(txt, x, y); };
  box(String(Math.round(CK.spd === 'KTS' ? plane.gs / 1.852 : plane.gs)), W * 0.06, cy, 'left');
  box(String(Math.round((CK.alt === 'RAD' ? plane.alt - 410 : plane.alt) * 3.281)), W * 0.94, cy, 'right');
  c.font = '500 ' + Math.round(fs * 0.75) + 'px ' + FONT_MONO; c.fillStyle = MPD_G;
  c.textAlign = 'left'; c.fillText(CK.spd === 'KTS' ? 'KTS' : 'KM/H', W * 0.06, cy + fs * 1.3);
  c.textAlign = 'right'; c.fillText(CK.alt === 'RAD' ? 'R ALT' : 'B ALT', W * 0.94, cy + fs * 1.3); c.fillText((plane.vs >= 0 ? '+' : '') + Math.round(plane.vs * 196.85) + ' FPM', W * 0.94, cy + fs * 2.4);
  c.textAlign = 'center'; c.font = '600 ' + fs + 'px ' + FONT_MONO; c.fillStyle = MPD_W; c.fillText(pad(plane.hdg, 3), cx, f.y0 + fs * 0.5);
  c.font = '500 ' + Math.round(fs * 0.75) + 'px ' + FONT_MONO; c.fillStyle = MPD_G; c.fillText('TRQ ' + Math.round(plane.tq) + '%', cx, f.y1 - fs * 0.4);
}
function drawENG(f) {
  // engine page: torque, turbine gas temperature and gas generator speed for both T700s, rotor speed, fuel
  const { c, W, H, fs } = f;
  const tq = plane.tq, eng = [[tq - 0.6, 0], [tq + 0.7, 6]];
  const bars = [['TQ', 0, 120, v => v, '%'], ['TGT', 0, 900, v => 610 + (v - 56) * 4.2, '°C'], ['NG', 60, 110, v => 92.5 + (v - 56) * 0.14, '%']];
  const top = f.y0 + fs * 1.6, bot = H * 0.74, bw = W * 0.05;
  bars.forEach(([name, lo, hi, fn, unit], bi) => {
    const gx = W * (0.15 + bi * 0.27);
    c.font = '600 ' + Math.round(fs * 0.85) + 'px ' + FONT_MONO; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = MPD_W; c.fillText(name, gx + bw * 0.6, f.y0 + fs * 0.6);
    eng.forEach(([v, dt], ei) => {
      const x = gx + ei * bw * 1.3, val = fn(v) + dt, k = clamp((val - lo) / (hi - lo), 0, 1);
      c.strokeStyle = MPD_G; c.lineWidth = f.lw; c.strokeRect(x - bw / 2, top, bw, bot - top);
      c.fillStyle = MPD_G; c.fillRect(x - bw / 2, bot - (bot - top) * k, bw, (bot - top) * k);
      c.font = '500 ' + Math.round(fs * 0.7) + 'px ' + FONT_MONO; c.fillStyle = MPD_W; c.fillText(String(Math.round(val)), x, bot + fs * 0.75);
    });
  });
  c.font = '600 ' + Math.round(fs * 0.85) + 'px ' + FONT_MONO; c.textAlign = 'left'; c.fillStyle = MPD_W;
  const nr = 101 - (plane.load - 1) * 2;
  c.fillText('NR ' + nr.toFixed(0) + '%   NP 101%', W * 0.06, H * 0.84);
  c.fillStyle = MPD_G; c.fillText('FUEL ' + Math.round(CK.fuel === 'LB' ? plane.fuel : plane.fuel * 0.4536) + ' ' + CK.fuel, W * 0.06, H * 0.84 + fs * 1.1);
  c.textAlign = 'right'; c.fillText('OIL 62 PSI', W * 0.8, H * 0.84 + fs * 1.1);
  // the warnings from damage, and the flares left
  c.textAlign = 'right'; c.font = '600 ' + Math.round(fs * 0.8) + 'px ' + FONT_MONO;
  AC.warn.slice(-4).forEach((w, i) => { c.fillStyle = /WARNING|OUT/.test(w) ? MPD_R : MPD_Y; c.fillText(w, f.x1 - fs * 0.2, f.y0 + fs * (0.7 + i * 1.05)); });
  c.fillStyle = MPD_G; c.fillText('FLARE ' + AC.flares, f.x1 - fs * 0.2, H * 0.84 - fs * 1.2);
}
function drawTGT(f) {
  // target list: what the TADS can be cued to (the filter applies), nearest first; the tracked one highlighted
  const { c, W, fs } = f, pg = planeGround();
  const list = targets.filter(t => !t.escaped && !t.dormant && matchF(t))
    .map(t => ({ t, r: Math.hypot(t.x - pg.x, t.y - pg.y) * MPP / 1000 })).sort((a, b) => (b.t.alive - a.t.alive) || a.r - b.r);
  const x0 = f.x0 + fs * 0.4, x1 = f.x1 - fs * 0.4, row = fs * 1.25, rows = Math.floor((f.y1 - f.y0 - row * 1.6) / row);
  c.font = '600 ' + Math.round(fs * 0.8) + 'px ' + FONT_MONO; c.textBaseline = 'middle';
  c.fillStyle = MPD_G; c.textAlign = 'left'; c.fillText('TGT  TYPE', x0, f.y0 + row * 0.6);
  c.textAlign = 'right'; c.fillText(S.filter === 'all' ? 'ALL' : S.filter === 'vehicle' ? 'VEH' : 'PAX', x1, f.y0 + row * 0.6);
  list.slice(0, rows).forEach(({ t, r }, i) => {
    const y = f.y0 + row * (1.8 + i), on = t === S.sel;
    if (on) { c.strokeStyle = MPD_Y; c.lineWidth = f.lw; c.strokeRect(x0 - fs * 0.25, y - row * 0.45, x1 - x0 + fs * 0.5, row * 0.9); }
    c.fillStyle = !t.alive ? MPD_R : on ? MPD_Y : MPD_W;
    c.textAlign = 'left'; c.fillText('T' + pad(t.id, 2) + '  ' + t.en, x0, y);
    c.textAlign = 'right'; c.fillText(t.alive ? r.toFixed(1) + ' KM' : 'KILL', x1, y);
  });
  if (list.length > rows) { c.fillStyle = MPD_G; c.textAlign = 'center'; c.fillText('+' + (list.length - rows), (x0 + x1) / 2, f.y1 - fs * 0.2); }
}
let vidPending = false;
function drawVID(f) {
  // TADS video repeated on the MPD: copied from the GL canvas right after it is drawn (see frame)
  f.c.font = '600 ' + f.fs + 'px ' + FONT_MONO; f.c.textAlign = 'center'; f.c.fillStyle = MPD_G; f.c.fillText('TADS', f.W / 2, f.y1 - f.fs * 0.2);
  vidPending = true;
}
function copyVID() {
  for (const [side, el] of [['L', mpdL], ['R', mpdR]]) {
    if (CK.page[side] !== 'VID' || !CK.mpd[side].pwr) continue;
    const c = el.getContext('2d'), W = el.width, H = el.height, fs = Math.round(W / 18);
    const r = CK.sens, a = r.w / r.h, bw = W * 0.92, bh = bw / a, x = (W - bw) / 2, y = Math.max(fs * 1.8, (H - bh) / 2);
    try {
      c.globalAlpha = CK.mpd[side].vid; c.fillStyle = '#000'; c.fillRect(x, y, bw, bh);
      c.drawImage(glCanvas, r.x * PR, r.y * PR, r.w * PR, r.h * PR, x, y, bw, bh); c.globalAlpha = 1;
      if (CK.vidSym) c.drawImage(hud, 0, 0, hud.width, hud.height, x, y, bw, bh);
    } catch (_) {}
  }
}
function drawMpds(rdt) {
  if (CK.t < 0.34) drawTedac(rdt);
  CK.mpdT -= rdt;
  // (the ZF-25's moving map 20 times a second: at 700 km/h and track-up, 7 a second turned and slid it in steps)
  if (CK.mpdT <= 0) { CK.mpdT = JET ? 0.05 : 0.15; vidPending = false; drawPage('L', mpdL); drawPage('R', mpdR); }
  if (CK.page.L === 'VID' || CK.page.R === 'VID') copyVID();
}

