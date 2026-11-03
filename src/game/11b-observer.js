/* ===================== the observer's camera ===================== */
/* A camera from another angle, live on the iPad's observer tab (OBS): at each of the jet's strikes a drone's long lens
   (the film's, by default: OBS_FILM) on the jet as it runs in, the weapon coming off and followed down, the impact and
   the smoke for some seconds after. It is drawn as the canopy's world is (the ground, the effects, the sky and the
   dust: winMat's pass, without the glass), from that camera, 24 times a second, and only while the tab is open in
   front of the player (obsWatch): looked away, the drone flies its take on, nothing drawn for it. Nothing is recorded
   or kept. The jet in it is the ZF-25 itself, in the air (models/zf25_fly1.glb: gear up, its stores). */
const OBS_W = 1280, OBS_H = 720, OBS_FPS = 24, OBS_REF_FOV = 40;
// The UAV's: an ISR drone in its orbit round the target, 3.6 km out and 3.6 km up (45 degrees down: the area's
// picture, taken from above, looks as it should from there), at 80 m/s; it stares at the target, its lens stepped
// from wide to narrow as the weapon comes, and the take begins 15 s before the impact
const OBS_UAV = { R: 3600, H: 3600, V: 80, lead: 15 };
// The film's: a camera drone over the target area (1.5 km up, 2.2 km off the jet's line, 1.2 km toward it), its long
// lens on the ZF-25 from 8 s before the release, the weapon coming off and followed down, the impact and its smoke.
// Below the jet's height, so the jet and the falling weapon stand against the sky, and the weapon comes down past the
// drone's own height only in its last seconds, as the lens comes out to the target's ground (some 30 degrees down).
// Filmed, not targeted: no reticle, the picture a camera's
const OBS_FILM = { side: 2200, back: 1200, H: 1500, V: 30, lead: 8 };
// the weapons as they fly: bodies turned from the owner's side views (tools/make_weapons.py: the radius along each,
// px of the picture, its axis row; the picture's own light taken out, <id>_alb.webp) and their fins from the same
// picture; their real length and diameter (m): the 500 lb GPS bomb (GBU-38) or 2,000 lb (GBU-31), the 500 lb laser bomb
// (GBU-12) or 2,000 lb (GBU-10), the Barq (AGM-65's size)
const OBS_WPN = {
  jdam: { L: 2.36, D: 0.273, LH: 3.88, DH: 0.457, prof: {"w":768,"h":160,"cy":81.0,"rmax":62.5,"r":[3.5,13.5,15.5,21.5,27.5,31.5,37.5,41.5,45.5,48.5,51.5,54.5,56.5,58.5,60.5,61.5,61.5,62.5,62.5,62.5,62.5,62.5,61.5,61.5,60.5,58.5,56.5,54.5,52.5,51.5,50.5,48.5,48.5,48.5,47.5,44.5,41.5,38.5,32.5,32.5,32.5,32.5,32.5,32.5,32.5,32.5,29.5,4.5]} },
  lgb: { L: 3.27, D: 0.273, LH: 4.36, DH: 0.457, prof: {"w":768,"h":134,"cy":69.0,"rmax":45.5,"r":[4.5,13.5,13.5,15.5,18.5,23.5,23.5,23.5,23.5,23.5,23.5,23.5,25.5,27.5,30.5,34.5,37.5,40.5,42.5,43.5,45.5,45.5,44.5,44.5,44.5,44.5,44.5,44.5,43.5,41.5,39.5,37.5,36.5,34.5,33.5,28.5,25.5,23.5,22.5,20.5,20.5,20.5,20.5,20.5,20.5,17.8,14.5,0.0]} },
  agm: { L: 2.49, D: 0.305, prof: {"w":768,"h":178,"cy":87.5,"rmax":47.5,"r":[5.5,27.0,31.0,39.5,44.5,46.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,47.5,38.5,9.5]} } };
const OBSR = { mode: 'film', rec: null, model: null, s: 0, g: null, jet: null, bombs: null, grain: null, cam: null, rtA: null, rtE: null, mat: null, scene: null, cv: null, ctx: null, acc: 0, shown: false };
// (the jet in the air: loaded once the jet is chosen, a third of a megabyte)
function obsInit() {
  if (!JET || OBSR.s) return; OBSR.s = 1;
  const go = () => { try {
    if (!THREE.GLTFLoader) { OBSR.s = -1; return; }
    // (built and its shaders and textures sent to the GPU as soon as it is here, not at the first release: no hitch then)
    // (the detailed one, LOD 1, 37k triangles, its own paint, normal and roughness maps: seen close through the film's
    // long lens; lit as metal is, by the sun and the sky and the desert round it, obsPBR)
    new THREE.GLTFLoader().load('models/zf25_fly1.glb', gl => { OBSR.model = gl.scene; obsPBR(OBSR.model); OBSR.s = 2;
      // (the enlarged tiles' shader as the film's pass makes it, its lights in the key: one kept hidden in the film's group
      // for good, compiled with the rest; it had been made at each take and freed with its last tile after it)
      try { obsBuild(); if (MAP.mag && !OBSR.tileKeep) { const m = OBSR.tileKeep = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), tileMat(new THREE.DataTexture(new Uint8Array(4), 1, 1), TOP_L, 1024, 1024)); m.visible = false; OBSR.g.add(m); }
        OBSR.g.visible = true; fogSet(OBSR.fog); renderer.compile(sceneA, OBSR.cam); fogSet(null); const tx = new Set(); OBSR.model.traverse(o => { if (o.isMesh) for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (o.material[k]) tx.add(o.material[k]); }); for (const t of tx) renderer.initTexture(t); } catch (_) {} finally { fogSet(null); if (OBSR.g) OBSR.g.visible = false; } obsWarmWpn(); }, undefined, () => { OBSR.s = -1; });
  } catch (_) { OBSR.s = -1; } };
  OBSR.tex = {}; const tl = new THREE.TextureLoader();
  for (const k in OBS_WPN) tl.load('sprites/weapons/' + k + '_alb.webp', t => { t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; OBSR.tex[k] = t; obsWarmWpn(); });
  if (THREE.GLTFLoader) go(); else { const sc = document.createElement('script'); sc.src = 'models/GLTFLoader.r128.js'; sc.onload = go; sc.onerror = () => { OBSR.s = -1; }; document.head.appendChild(sc); }
}
// (the weapons' two shaders, the fins' and the body's, compiled once the jet and a weapon's picture are here, as the
// jet's are: made at the first take's first frame they had cost a hitch of a tenth of a second or more on the run-in;
// the same two serve every weapon)
function obsWarmWpn() {
  if (OBSR.s !== 2 || OBSR.wwarm || !OBSR.g) return;
  const k = Object.keys(OBS_WPN).find(q => OBSR.tex[q]), parts = k && obsWpnParts(k, false); if (!parts) return;
  OBSR.wwarm = true;
  try { const a = new THREE.Mesh(parts.body, parts.bmat), b = new THREE.Mesh(parts.fin, parts.mat), vis = OBSR.g.visible;
    OBSR.g.add(a, b); OBSR.g.visible = true; fogSet(OBSR.fog); renderer.compile(sceneA, OBSR.cam);
    fogSet(null); OBSR.g.remove(a, b); OBSR.g.visible = vis; for (const q in OBSR.tex) renderer.initTexture(OBSR.tex[q]); } catch (_) { fogSet(null); }
}
// The jet's paint as metal and paint are: the glTF's own physical materials kept (zfLambert, for the parked ones, drops
// them for a flat diffuse), with the light of the sky above, the horizon's haze and the desert below reflected in them
// (a small prefiltered environment, made once), the sun's highlight; written out as sRGB as the game's pictures are
function obsPBR(root) {
  const sc = new THREE.Scene(), g = new THREE.SphereGeometry(10, 32, 16), col = [], pos = g.attributes.position, c = new THREE.Color();
  const zen = new THREE.Color(0.13, 0.25, 0.52), hor = new THREE.Color(0.62, 0.68, 0.76), gnd = new THREE.Color(0.36, 0.29, 0.20);
  for (let i = 0; i < pos.count; i++) { const z = pos.getZ(i) / 10; if (z >= 0) c.copy(hor).lerp(zen, Math.pow(z, 0.6)); else c.copy(hor).lerp(gnd, Math.min(1, -z * 4)); col.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  sc.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const pm = new THREE.PMREMGenerator(renderer); OBSR.env = pm.fromScene(sc, 0).texture; pm.dispose(); g.dispose();
  root.traverse(o => { if (!o.isMesh) return; const m = o.material;
    o.renderOrder = m.transparent ? 37 : 36; if (m.__obs) return; m.__obs = true;
    m.envMap = OBSR.env; m.envMapIntensity = 1.0; m.depthWrite = !m.transparent; m.transparent = true;
    // (the canopy: its glass reflecting as glass does, the crew behind it dark; the gunship-grey paint flat, not glossy)
    if (m.name === 'glass') { m.opacity = 0.7; m.envMapIntensity = 2.0; }
    if (/^paint/.test(m.name)) m.roughness = Math.max(m.roughness, 0.72);
    if (m.name === 'helmet') m.color.multiplyScalar(0.55);
    obsLook(m); });
}
// (a material of the film's: its light kept from clipping in the 8-bit picture (a soft shoulder over 0.8), written
// out as sRGB as the game's pictures are, and the air between it and the lens growing with the distance as air does,
// 1 - e^-βd, not the squared fog's: some 13 % at 3 km, 20 % at 5)
function obsLook(m) {
  m.onBeforeCompile = sh => { sh.fragmentShader = sh.fragmentShader
    .replace('#include <encodings_fragment>', 'vec3 c_ = gl_FragColor.rgb; vec3 o_ = max(c_ - 0.8, 0.0); c_ = min(c_, 0.8) + o_ / (1.0 + 5.0 * o_); gl_FragColor = LinearTosRGB( vec4(c_, gl_FragColor.a) );')
    .replace('#include <fog_fragment>', '#ifdef USE_FOG\n gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, 1.0 - exp( - fogDensity * fogDepth ) );\n#endif'); };
  m.customProgramCacheKey = () => 'obs-look'; m.needsUpdate = true;
}
function obsBuild() {
  if (OBSR.g) return;
  const g = OBSR.g = new THREE.Group(); g.visible = false; sceneA.add(g);
  // the jet: its glTF frame (y up, nose +x) to the world's (z up), its size in map px; placed each frame by its axes
  const j = OBSR.jet = new THREE.Group(), m = OBSR.model.clone(); m.rotation.x = Math.PI / 2; m.scale.setScalar(PXM);
  j.add(m); j.matrixAutoUpdate = false; g.add(j);
  // (the model's own 2,000 lb bombs: hidden; the jet carries what its loadout gives it, below)
  OBSR.gbu = ['store_gbu31_l', 'store_gbu31_r'].map(n => m.getObjectByName(n)).filter(Boolean); for (const n of OBSR.gbu) n.visible = false;
  // the loadout on the jet as it is loaded now (JX.slots: each weapon's station, taken off as it is released): the
  // same bodies as the falling weapons, under the model's hardpoints (zf25_meta.json, x forward, y left, z up, m), in
  // the glTF's own frame (x, z, -y); the second Barq on each wing pylon's inner shoulder
  OBSR.storeG = new THREE.Group(); m.add(OBSR.storeG);
  // the weapons on their way (up to four in a take): each a body turned from the owner's picture and its fins, lit as
  // the jet is (obsWpnParts), along its path and with its lugs up; the Barq's motor burning behind it for its burn;
  // and the smear the camera's shutter makes of one that moves across the picture
  const pg = new THREE.PlaneGeometry(1, 1), uv = pg.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
  OBSR.pg = pg;
  const sc = document.createElement('canvas'); sc.width = 64; sc.height = 16; const sx = sc.getContext('2d'), sgr = sx.createLinearGradient(0, 0, 0, 16);
  sgr.addColorStop(0, 'rgba(255,255,255,0)'); sgr.addColorStop(0.5, 'rgba(255,255,255,1)'); sgr.addColorStop(1, 'rgba(255,255,255,0)'); sx.fillStyle = sgr; sx.fillRect(0, 0, 64, 16);
  const sgr2 = sx.createLinearGradient(0, 0, 64, 0); sgr2.addColorStop(0, 'rgba(0,0,0,1)'); sgr2.addColorStop(0.15, 'rgba(0,0,0,0)'); sgr2.addColorStop(0.85, 'rgba(0,0,0,0)'); sgr2.addColorStop(1, 'rgba(0,0,0,1)');
  sx.globalCompositeOperation = 'destination-out'; sx.fillStyle = sgr2; sx.fillRect(0, 0, 64, 16);
  const smat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sc), transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 0.45 }); obsLook(smat);
  OBSR.bombs = [0, 1, 2, 3].map(() => { const b = new THREE.Group(); b.matrixAutoUpdate = false; b.visible = false; g.add(b);
    const sm = smat.clone(); obsLook(sm); b.streak = new THREE.Mesh(pg, sm); b.streak.matrixAutoUpdate = false; b.streak.renderOrder = 35; b.streak.visible = false; g.add(b.streak); return b; });
  const fc = document.createElement('canvas'); fc.width = 128; fc.height = 32; const fx = fc.getContext('2d'), fgr = fx.createLinearGradient(0, 0, 128, 0);
  fgr.addColorStop(0, 'rgba(255,120,30,0)'); fgr.addColorStop(0.55, 'rgba(255,170,70,0.7)'); fgr.addColorStop(0.9, 'rgba(255,245,215,1)'); fgr.addColorStop(1, 'rgba(255,255,240,0.6)');
  fx.fillStyle = fgr; fx.fillRect(0, 0, 128, 32); const fm = fx.getImageData(0, 0, 128, 32);
  for (let y = 0; y < 32; y++) for (let x2 = 0; x2 < 128; x2++) fm.data[(y * 128 + x2) * 4 + 3] *= Math.max(0, 1 - Math.abs(y - 15.5) / 16 * (1.6 - x2 / 128));
  fx.putImageData(fm, 0, 0);
  OBSR.plume = new THREE.Mesh(pg, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(fc), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  OBSR.plume.matrixAutoUpdate = false; OBSR.plume.renderOrder = 37; OBSR.plume.visible = false; g.add(OBSR.plume);
  // their light: the mission's sun (the day's or the evening's, winMat's sunD, set each frame) and the sky, as the
  // parked jets'
  const sun = OBSR.sun = new THREE.DirectionalLight(0xfff1dc, 2.6); sun.position.copy(winMat.uniforms.sunD.value); g.add(sun); g.add(sun.target);
  const sky = new THREE.HemisphereLight(0xcfdcef, 0x9a8a70, 0.55); sky.up.set(0, 0, 1); sky.position.set(0, 0, 1); g.add(sky);
  // (the air between the lens and what is aloft: the jet and the weapons some kilometres off take the haze's colour,
  // more the further; with the composite's own dust over the eye, some a fifth at 5 km; the ground's is the canopy pass's)
  OBSR.fog = new THREE.FogExp2(0xaebfd2, 3.0e-5 * MPP);   // (obsLook: 1 - e^-βd, β 3e-5 /m: 9 % at 3 km, 14 % at 5, 26 % at 10)
  OBSR.cam = new THREE.PerspectiveCamera(6, OBS_W / OBS_H, 5, 60000); OBSR.cam.up.set(0, 0, 1);
  // (its edges smoothed: four samples a pixel where the GPU has WebGL 2, so a jet against the sky is not stepped)
  // (a 24-bit depth: three r128 gives depth alone 16 bits, a step of some 190 m at 5 km, the whole jet in one: its parts
  // drawn in their file's order, the crew and the stores through the skin; with the stencil it is DEPTH24_STENCIL8)
  const ao = Object.assign({}, rtOpts, { depthBuffer: true, stencilBuffer: true });
  OBSR.rtA = renderer.capabilities.isWebGL2 && THREE.WebGLMultisampleRenderTarget ? Object.assign(new THREE.WebGLMultisampleRenderTarget(OBS_W, OBS_H, ao), { samples: 4 }) : new THREE.WebGLRenderTarget(OBS_W, OBS_H, ao);
  OBSR.rtE = new THREE.WebGLRenderTarget(OBS_W, OBS_H, rtOpts);
  // the canopy's own compositing (the sky where nothing was drawn, the dust layer, the fires' glow), without its glass
  OBSR.mat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(winMat.uniforms), vertexShader: winMat.vertexShader, fragmentShader: winMat.fragmentShader, depthTest: false, depthWrite: false });
  const u = OBSR.mat.uniforms; u.tA.value = OBSR.rtA.texture; u.tE.value = OBSR.rtE.texture; u.glass.value = 0; u.jet.value = 1; u.res.value.set(OBS_W, OBS_H);
  OBSR.scene = new THREE.Scene(); OBSR.scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), OBSR.mat));
  // (WebGL 2: the picture finished in a target of its own and read back without waiting for it, obsRead. Copied off the
  // screen's canvas into the 2D one, it had made the GPU finish all it had queued first, at each of the film's 24
  // frames a second: the iPhone's 60 down to some 42 for the whole take, its resolution cut to 2.25 to no avail)
  // (its plane's picture upside down, the rows as a read back gives them: the 2D canvas's top first)
  if (renderer.capabilities.isWebGL2) { const pf = new THREE.PlaneGeometry(2, 2), uv = pf.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
    OBSR.sceneF = new THREE.Scene(); OBSR.sceneF.add(new THREE.Mesh(pf, OBSR.mat)); OBSR.rtF = new THREE.WebGLRenderTarget(OBS_W, OBS_H, rtOpts); }
  OBSR.cv = document.createElement('canvas'); OBSR.cv.width = OBS_W; OBSR.cv.height = OBS_H; OBSR.ctx = OBSR.cv.getContext('2d');
}
// where the observer stands: the highest ground on a ring 3.5-4.5 km round the target (dry land, on the country); on the
// theatre (no heights) off the side of the run, on a rise some 40 m up
function obsSpot(tp) {
  const out = (x, y, h) => ({ x, y, h: clamp(h, 2, 450) });
  if (MAP.country && elevAt(tp.x, tp.y) != null) {
    const g0 = elevAt(tp.x, tp.y); let best = null;
    for (let i = 0; i < 24; i++) for (const r of [3500, 4000, 4500]) {
      const a = i * Math.PI / 12, x = tp.x + Math.cos(a) * r * PXM, y = tp.y + Math.sin(a) * r * PXM, e = elevAt(x, y);
      if (e == null || onWater(x, y) || e < 1) continue;
      if (!best || e > best.e) best = { x, y, e };
    }
    if (best) return out(best.x, best.y, best.e - g0 + 2);
  }
  // (no heights: dry land on the map, 4 km off, as near the run's side as there is any; on a rise some 120 m up)
  let best = null;
  for (let i = 0; i < 24; i++) {
    const a = i * Math.PI / 12, x = tp.x + Math.cos(a) * 4000 * PXM, y = tp.y + Math.sin(a) * 4000 * PXM;
    if (x < 0 || y < 0 || x > W0 || y > H0 || onWater(x, y)) continue;
    const sc = Math.abs(Math.sin(a - plane.track)); if (!best || sc > best.sc) best = { x, y, sc };
  }
  const a = plane.track + Math.PI / 2;
  return best ? out(best.x, best.y, 120) : out(tp.x + Math.cos(a) * 4000 * PXM, tp.y + Math.sin(a) * 4000 * PXM, 120);
}
// a release: the strike taken from now to some seconds after it lands (one at a time: a second weapon while one is
// being taken is in the same take, which runs on until the last of them has landed)
// The weapon's own path from the jet: it leaves at the jet's speed along its track, from the pylon (1.5 m under it).
// A bomb's fall is the game's own (bombFall's drag and air, integrated here every 0.1 s); where it is guided, the
// difference between where that fall would land and where the weapon is steered to grows in as the square of the
// time (none at the release, all at the end); a GPS bomb that glides further than it falls is the same fall taken
// over its longer time. The Barq comes off along the jet's line and turns onto its target, slow off the rail and fast
// at the end
function obsWpn(p, t) {
  const tg = p.tgt && p.type !== 'jdam' ? p.tgt : p;
  const e = { p, tp: { x: tg.x, y: tg.y }, x0: plane.x, y0: plane.y, h0: Math.max(plane.alt - GROUND - 1.5, 1), t0: t, imp: null, chi: plane.track, v0: Math.max(plane.gs / 3.6, 50) };
  if (p.type !== 'agm') {
    const heavy = !!p.heavy, m = heavy ? 934 : 277, A = Math.PI * Math.pow(heavy ? 0.457 : 0.273, 2) / 4, k = 0.5 * 0.3 * A / m, dt = 0.1;
    let x = 0, z = e.h0, vx = e.v0, vz = -Math.round(plane.vs || 0); const X = [0], Z = [z];   // (the jet's climb at the release, as bombFall)
    while (z > 0 && X.length < 1300) {
      const rho = 1.225 * Math.exp(-(z + GROUND) / 8500), V = Math.hypot(vx, vz);
      vx -= rho * k * V * vx * dt; vz += (G - rho * k * V * vz) * dt; x += vx * dt; z -= vz * dt; X.push(x); Z.push(Math.max(z, 0));
    }
    e.X = X; e.Z = Z; e.T = (X.length - 1) * dt; e.bx = e.x0 + Math.cos(e.chi) * x * PXM; e.by = e.y0 + Math.sin(e.chi) * x * PXM;
  }
  return e;
}
// (the film's weapon: its parts, made once a kind: the body turned from the radius along the picture, the picture
// laid round it (its top at the top); the fins two crossed cards of the same picture (their body inside the body); in
// metres, nose +x, top +y)
const OBS_HP = { LCFT1: [-0.297, 2.344, 0.21], RCFT1: [-0.297, -2.344, 0.21], LCFT2: [-1.397, 2.367, 0.21], RCFT2: [-1.397, -2.367, 0.21], LCFT3: [-2.497, 2.248, 0.21], RCFT3: [-2.497, -2.248, 0.21], W2: [-2.77, 3.3, 1.195], W8: [-2.77, -3.3, 1.195] };
OBS_HP.W2B = [OBS_HP.W2[0], OBS_HP.W2[1] - 0.55, OBS_HP.W2[2]]; OBS_HP.W8B = [OBS_HP.W8[0], OBS_HP.W8[1] + 0.55, OBS_HP.W8[2]];
// (the conformal tanks' stations, 1.1 m apart along the lower row, hold no two 3.3 m bombs in tandem: the first and the
// third on the lower row, moved out fore and aft to clear each other; the second on the outer row above, hp_cft_l5)
OBS_HP.LCFT1[0] += 0.6; OBS_HP.RCFT1[0] += 0.6; OBS_HP.LCFT3[0] -= 0.6; OBS_HP.RCFT3[0] -= 0.6;
OBS_HP.LCFT2 = [-1.397, 2.547, 0.81]; OBS_HP.RCFT2 = [-1.397, -2.547, 0.81];
function obsStores() {
  if (!OBSR.storeG || !JX.slots) return;
  const sig = S.load + JSON.stringify(JX.slots); if (sig === OBSR.storeSig) return;
  const g = OBSR.storeG; g.clear(); let ok = true;
  for (const w of JW) for (const k of JX.slots[w]) {
    const h = OBS_HP[k], hv = heavyW(w), parts = obsWpnParts(w, hv); if (!h) continue; if (!parts) { ok = false; continue; }
    const d = OBS_WPN[w], r = (hv && d.DH ? d.DH : d.D) / 2, s = new THREE.Group(); s.position.set(h[0], h[2] - 0.03 - r, -h[1]);
    for (const geo of [parts.body, parts.fin, parts.fin2]) { const ms = new THREE.Mesh(geo, geo === parts.body ? parts.bmat : parts.mat); ms.renderOrder = 36; s.add(ms); }
    g.add(s);
  }
  OBSR.storeSig = ok ? sig : null;
}
function obsWpnParts(k, heavy) {
  const d = OBS_WPN[k], tex = OBSR.tex[k]; if (!d || !tex || !OBSR.pg) return null; const key = k + (heavy && d.LH ? 'H' : '');
  const c = OBSR.wm || (OBSR.wm = {}); if (c[key]) return c[key];
  const P = d.prof, L = heavy && d.LH ? d.LH : d.L, D = heavy && d.DH ? d.DH : d.D, sx = L / P.w, sv = D / 2 / P.rmax, n = P.r.length, M = 16;
  const pos = [], uv = [], idx = [];
  for (let i = 0; i < n; i++) { const px = i / (n - 1) * (P.w - 1), x = L / 2 - px * sx, r = Math.max(P.r[i], 0.5) * sv;
    for (let j = 0; j <= M; j++) { const ph = j / M * 2 * Math.PI, cy = Math.cos(ph);
      pos.push(x, r * cy, r * Math.sin(ph)); uv.push(px / P.w, 1 - (P.cy - Math.max(P.r[i] - 1.5, 0) * cy) / P.h); } }   // (1.5 px in from the picture's edge)
  for (let i = 0; i < n - 1; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, b = a + M + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const body = new THREE.BufferGeometry(); body.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); body.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); body.setIndex(idx); body.computeVertexNormals();
  const fin = OBSR.pg.clone(); fin.scale(L, P.h * sv, 1); fin.translate(0, (P.h / 2 - P.cy) * sv * -1, 0);
  // (the fins in an X, as bombs and missiles carry them)
  fin.rotateX(Math.PI / 4); const fin2 = fin.clone(); fin2.rotateX(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, metalness: 0.15, envMap: OBSR.env, envMapIntensity: 0.8, alphaTest: 0.5, side: THREE.DoubleSide }); obsLook(mat);
  // (the body its own material, solid: the picture's alpha only cuts the fins)
  const bmat = mat.clone(); bmat.alphaTest = 0; bmat.side = THREE.FrontSide; obsLook(bmat);
  return (c[key] = { key, body, fin, fin2, mat, bmat, L });
}
function obsStart(w, p) {
  if (!JET || OBSR.s !== 2 || !OBSR.rec && THERMAL >= 3) return;
  if (OBSR.rec) { const r = OBSR.rec; if (!r.ws.length) { r.w = w; r.p = p; } if (r.ws.length < 4) r.ws.push(obsWpn(p, r.t)); return; }   // (a fifth in one take is not followed)
  const tg = p.tgt && p.type !== 'jdam' ? p.tgt : p;
  obsBegin(w, p, { x: tg.x, y: tg.y });
}
// a take begun: at a release (the hill's, the UAV's), or for the film 8 s before it, on the run (no weapon yet: p null)
function obsBegin(w, p, tp) {
  obsBuild();
  // (round what it is aimed at: a guided weapon's target, the GPS bomb's coordinates; not where a laser bomb would fall
  // on its own, which it steers off)
  const uav = OBSR.mode === 'uav', film = OBSR.mode === 'film';
  // (the UAV's orbit begins abeam the jet's run, so it sees the bomb come in from the side; the film's drone abeam the
  // jet's line to the target, toward the jet, so the jet comes across its picture and the weapon falls in front of it)
  let cam;
  if (uav) cam = { cx: tp.x, cy: tp.y, a: plane.track + Math.PI / 2, x: tp.x, y: tp.y, h: OBS_UAV.H };
  else if (film) { const a = Math.atan2(plane.y - tp.y, plane.x - tp.x), sd = Math.cos(a + Math.PI / 2), sn = Math.sin(a + Math.PI / 2);
    const x = tp.x + (sd * OBS_FILM.side + Math.cos(a) * OBS_FILM.back) * PXM, y = tp.y + (sn * OBS_FILM.side + Math.sin(a) * OBS_FILM.back) * PXM;
    cam = { cx: tp.x, cy: tp.y, R: Math.hypot(x - tp.x, y - tp.y), a: Math.atan2(y - tp.y, x - tp.x), x, y, h: OBS_FILM.H }; }
  else cam = obsSpot(tp);
  const rec = { w, p, tp, cam, uav, film, run: film && !p ? JX.run : null, live: !uav, t0: 0, t: 0, ws: p ? [obsWpn(p, 0)] : [], e: 0,
    look: null, wf: 900, zoom: 1, at: efbClock(true) };
  rec.lastS = S.t; rec.hist = [];
  OBSR.rec = rec; OBSR.acc = 1; OBSR.lastT = performance.now();
}
// (the film's: seconds (real) until the jet's run comes to its release, or null while it cannot be told)
function obsToRel(run) {
  const sel = run.sel && run.sel.alive ? run.sel : null, tp = sel ? { x: sel.x, y: sel.y } : run.tp0, lar = jetLar(run.w, tp), v = Math.max(plane.gs / 3.6, 50);
  let t = null;
  if (run.w === 'agm') t = lar.ok ? 0 : Math.abs(wrapA(Math.atan2(tp.y - plane.y, tp.x - plane.x) - plane.track)) < 0.5 ? Math.max(0, (Math.hypot(lar.d, plane.alt - GROUND) - JET_AGM.lock) / v) : null;
  else if (run.w === 'jdam') t = Math.abs(wrapA(Math.atan2(tp.y - plane.y, tp.x - plane.x) - plane.track)) < 1.05 ? Math.max(0, (lar.d - lar.b.x * 1.6) / v) : null;
  else t = Math.abs(lar.cross) < 1500 && lar.along > 0 && lar.tr > -2 ? Math.max(0, lar.tr) : null;
  return t;   // (in the world's seconds: the take holds the world to its pace from its start, obsRealTime)
}
// where the weapon is now: along from the release to where it falls (a bomb's height falling away as its time does
// squared, the Barq's straight down its line)
function obsWeapon(e, ahead) {
  const p = e.p, tof = Math.max(p.tof, 0.1), tau = clamp(tof - p.tti + (ahead || 0), 0, tof), f = tau / tof;
  if (p.type === 'agm' || !e.X) {
    const u = 0.7 * f + 0.3 * f * f, a = (1 - u) * (1 - u), b = 2 * u * (1 - u), c = u * u;
    const c1x = e.x0 + Math.cos(e.chi) * 300 * PXM, c1y = e.y0 + Math.sin(e.chi) * 300 * PXM, c1h = e.h0 - 25;
    return { x: a * e.x0 + b * c1x + c * p.x, y: a * e.y0 + b * c1y + c * p.y, h: a * e.h0 + b * c1h, f };
  }
  const tb = Math.min(f * e.T, e.T), i = Math.min(Math.floor(tb / 0.1), e.X.length - 2), w = clamp(tb / 0.1 - i, 0, 1);
  // (the laser bomb steers only in its last 20 s: the difference grows in from there)
  const sf = p.type === 'lgb' ? clamp((tau - Math.max(tof - 20, 0)) / Math.min(20, tof), 0, 1) : f;
  const X = lerp(e.X[i], e.X[i + 1], w), Z = lerp(e.Z[i], e.Z[i + 1], w), s = sf * sf;
  return { x: e.x0 + Math.cos(e.chi) * X * PXM + (p.x - e.bx) * s, y: e.y0 + Math.sin(e.chi) * X * PXM + (p.y - e.by) * s, h: Z, f };
}
// A live picture is the world's own pace: the time's compression (timeK, ×2/×4 while a bomb falls) would show the bomb
// falling two or four times as fast. So while the player watches the camera on a strike, the world runs at its pace;
// looked away, the compression is as it is set
function obsRealTime() { const r = OBSR.rec; return !!(r && r.film && obsWatch()); }
// (the take held while the scene is: frozen, or the game out of sight)
function obsHeld() { return S.frozen || document.hidden; }
document.addEventListener('visibilitychange', () => { OBSR.lastT = performance.now(); });
// (drawn only while someone looks at it: the iPad up on its observer tab, the game in sight)
function obsWatch() { return JET && EFB.up && EFB.tab === 'obs' && !document.hidden; }
// a take ended now (a new sortie, the menu): never carried into the next mission's
function obsEnd() { if (OBSR.rec) obsStop(); }
function obsTick() {
  // (not when the phone is at its hottest, critical: the take's extra picture is a third more of the GPU's work)
  if (!OBSR.rec && OBSR.mode === 'film' && JET && OBSR.s === 2 && S.phase === 'play' && JX.run && JX.run !== OBSR.lastRun && !obsHeld() && THERMAL < 3) {
    const tr = obsToRel(JX.run);
    if (tr != null && tr < OBS_FILM.lead) { OBSR.lastRun = JX.run; const sel = JX.run.sel; obsBegin(JX.run.w, null, sel && sel.alive ? { x: sel.x, y: sel.y } : JX.run.tp0); }
  }
  const r = OBSR.rec; if (!r) return;
  // (in the world's time: the take's clock is the simulation's, so the picture and its marks keep the world's pace; it
  // stands while the world is frozen)
  // (and a clock of the machine's: the frames are drawn 24 times a real second whatever the world's pace (the hill's
  // and the UAV's takes run through the time's compression))
  const rdt = clamp(S.t - r.lastS, 0, 0.5); r.lastS = S.t;
  const now = performance.now(), wdt = Math.min((now - (OBSR.lastT || now)) / 1000, 0.25); OBSR.lastT = now;
  // (on into the end card: the last target's strike ends the mission at its impact, and the take had stopped on that
  // frame, before the blast; it ends by its own rules, or when a new sortie or the menu begins, obsEnd)
  if (S.phase !== 'play' && S.phase !== 'end') { obsEnd(); return; }
  if (obsHeld()) return;
  r.t += rdt; r.wall = (r.wall || 0) + wdt; OBSR.acc += wdt;
  // (the film's run broken off before its release, or too long in coming: the take over)
  if (!r.ws.length && ((r.run && JX.run !== r.run) || r.t > 40)) { obsStop(); return; }
  for (const e of r.ws) if (e.imp == null && e.p.tti <= 0) { e.imp = r.t;
    // (how far the blast is from the drone: its sound and its shock arrive that many 343ths of a second later)
    const ix = e.p.ix != null ? e.p.ix : e.p.x, iy = e.p.iy != null ? e.p.iy : e.p.y; e.dB = Math.hypot(Math.hypot(ix - r.cam.x, iy - r.cam.y) * MPP, r.cam.h); }
  // (the one followed: the latest to land for 2.5 s after it lands, its blast in the picture; else the first still on
  // its way; when all are down, the last to land)
  const down = r.ws.filter(e => e.imp != null), last = down.length ? down.reduce((a, e) => e.imp > a.imp ? e : a) : null;
  const fall = last && r.t - last.imp < 2.5 ? null : r.ws.find(e => e.imp == null);
  // (a safety stop in real seconds besides: a slow machine's take runs long)
  if ((r.ws.length && !fall && !r.ws.some(e => e.imp == null) && r.t - last.imp > (r.film ? Math.max(8, (last.dB || 0) / 343 + 5) : 8)) || r.wall > (r.uav || r.film ? 180 : 90)) { obsStop(); return; }
  // (the UAV's take from 15 s before the first impact: until then it waits, nothing drawn)
  if (!r.live) { if (fall && fall.p.tti / Math.max(timeK(), 1) > OBS_UAV.lead) return; r.live = true; r.t0 = r.t; OBSR.acc = 1; }
  // (nobody looking: nothing followed, nothing drawn, no old picture kept for the iPad; looked at again, the lens is
  // on its subject at once)
  if (r.film && !obsRealTime()) { r.gap = true; OBSR.shown = false; obsReadDrop(); return; }
  if (r.gap) { r.gap = false; r.jump = true; OBSR.acc = 1; }
  if (OBSR.acc < 1 / OBS_FPS) return;
  const dt = Math.min(OBSR.acc, 0.25); OBSR.acc = 0; r.fdt = dt;
  // what the lens is on: the jet and its weapon to begin with, then the weapon down, then where it struck; how wide
  // (m across the picture), as the observer zooms
  const jp = { x: plane.x, y: plane.y, h: plane.alt - GROUND };
  let want, wf;
  if (r.film) {
    // The drone's slow drift round the target. The lens as an operator's on a stabilised gimbal: the jet held (55 m
    // across); at the release it stays on the jet, the bomb dropping out of the bottom of the picture (it falls 20 m in
    // 2 s); then it is found again, wide (380 m), and followed (180 m: some 30 px of bomb), never exactly: the gimbal
    // goes where the weapon was a moment ago (0.15 s: the tracker's own lag) and its rate builds as it closes (a rate
    // loop, ω 4/s), so the weapon lags off centre and smears as it moves across the picture; then a cut to the target's
    // ground (220 m) for its last seconds, the impact and the smoke (out to 320 m). A hand's small random wander on it
    const c = r.cam, a = c.a + OBS_FILM.V / (c.R * MPP) * r.t; c.x = c.cx + Math.cos(a) * c.R; c.y = c.cy + Math.sin(a) * c.R;
    // (pf: how much of the target's own motion over the lag the tracker leads by: the jet, steady, fully; the falling
    // weapon, half: it lags off centre as real footage shows it)
    let tg, lag = 0.1, wn = 5, pf = 1;
    if (!r.ws.length) { tg = jp; wf = 55; }
    else if (fall) {
      const b = obsWeapon(fall), p = fall.p, ts = r.t - fall.t0;
      const el = Math.atan2(b.h - r.cam.h, Math.max(Math.hypot(b.x - r.cam.x, b.y - r.cam.y) * MPP, 1));
      if (!fall.cut && (p.tti < 3.5 || (el < 0.05 && ts > 4))) { fall.cut = true; r.jump = true; }
      if (fall.cut) { tg = { x: p.x, y: p.y, h: 2 }; wf = 220; wn = 3; }
      else if (ts < 1.8) { tg = jp; wf = 55; }
      else if (ts < 3.2) { tg = b; wf = 380; lag = 0.3; wn = 3; pf = 0.3; }
      else { tg = b; wf = 120; lag = 0.15; wn = 4; pf = 0.5; }
    } else { const p = last.p; tg = { x: p.ix != null ? p.ix : p.x, y: p.iy != null ? p.iy : p.y, h: 20 }; wf = lerp(220, 320, clamp((r.t - last.imp) / 8, 0, 1)); wn = 2; }
    // (the target's track, metres: what the gimbal goes for is where it was the lag ago)
    // (a cut, or a new subject: the gimbal's memory of the old one cleared)
    const H = r.hist, tgN = tg === jp ? 'jet' : fall ? (fall.cut ? 'gnd' : 'w' + r.ws.indexOf(fall)) : 'gnd';
    if (r.jump || r.tgN !== tgN) { H.length = 0; r.tgN = tgN; }
    H.push({ t: r.t, x: tg.x * MPP, y: tg.y * MPP, h: tg.h }); while (H.length > 2 && H[1].t < r.t - 0.6) H.shift();
    let q = H[H.length - 1], qi = H.length - 1;
    for (let i = H.length - 1; i > 0; i--) if (H[i - 1].t <= r.t - lag) { const u = clamp((r.t - lag - H[i - 1].t) / Math.max(H[i].t - H[i - 1].t, 1e-3), 0, 1), A = H[i - 1], B = H[i]; q = { x: lerp(A.x, B.x, u), y: lerp(A.y, B.y, u), h: lerp(A.h, B.h, u) }; qi = i; break; }
    // (led by the motion it had then: an autotracker's rate aiding)
    if (qi > 0 && pf > 0) { const A = H[qi - 1], B = H[qi], dd = Math.max(B.t - A.t, 1e-3); q = { x: q.x + (B.x - A.x) / dd * lag * pf, y: q.y + (B.y - A.y) / dd * lag * pf, h: q.h + (B.h - A.h) / dd * lag * pf }; }
    const K = r.trk;
    if (!K || r.jump) {
      // (a cut, or the start: on it at once, at its rate)
      // (its rate the subject's own: the weapon's along its path, the jet's along its track, the ground's none)
      let v = { x: 0, y: 0, h: 0 };
      if (tg === jp) { const g = Math.max(plane.gs / 3.6, 0); v = { x: Math.cos(plane.track) * g, y: Math.sin(plane.track) * g, h: 0 }; }
      else if (fall && !fall.cut) { const a = obsWeapon(fall), b2 = obsWeapon(fall, 0.05); v = { x: (b2.x - a.x) * MPP / 0.05, y: (b2.y - a.y) * MPP / 0.05, h: (b2.h - a.h) / 0.05 }; }
      if (K) { r.cutT = r.t; r.pVP = null; for (const e of r.ws) delete e.pP; }   // (a cut: exposure and focus settle again, obsFilmLook; no smear across it)
      r.trk = { x: q.x, y: q.y, h: q.h, vx: v.x, vy: v.y, vh: v.h }; r.wf = wf; r.jump = false;
    } else for (let st = dt; st > 1e-6; st -= 0.02) { const h = Math.min(0.02, st);
      for (const k of ['x', 'y', 'h']) { const err = q[k] - K[k]; K['v' + k] += wn * wn * err * h; K[k] += (K['v' + k] + 2 * wn * err) * h; } }
    // (the hand: a slow random wander, some 0.4 % of the picture)
    const nz = r.nz || (r.nz = { x: 0, y: 0, h: 0 }), sg = Math.max(r.wf, 40) * 0.004, ga = () => (Math.random() + Math.random() + Math.random() - 1.5) * 2;
    for (const k of ['x', 'y', 'h']) nz[k] += -nz[k] * dt / 0.6 + sg * Math.sqrt(dt / 0.6) * ga();
    // (the blast's shock reaching the drone, its distance's 343ths of a second after the flash: the picture shaken,
    // dying away in some half a second; and its sound then)
    let sh = 0;
    for (const e of r.ws) { if (e.imp == null || e.dB == null) continue; const ta = e.imp + e.dB / 343;
      if (r.t >= ta) sh += Math.exp(-(r.t - ta) / 0.25) * (e.p.heavy ? 1.6 : 1); }
    const sj = sh * r.wf * 0.012, T = r.trk;
    r.look = { x: (T.x + nz.x + (Math.random() - 0.5) * sj) / MPP, y: (T.y + nz.y + (Math.random() - 0.5) * sj) / MPP, h: T.h + nz.h + (Math.random() - 0.5) * sj };
    // (a step of the zoom: the lens's focus breathes for a moment)
    if (Math.abs(wf - (r.wfT || wf)) / Math.max(r.wfT || wf, 1) > 0.3) r.focT = r.t; r.wfT = wf;
    r.wf += (wf - r.wf) * (1 - Math.exp(-dt / 0.35));
    r.foc = (fall || last || { tp: r.tp }).tp;
    obsRender(r, jp);
    return;
  }
  if (r.uav) {
    // its orbit; the lens on the target, then on the blast; wide (600 m across) until the last 9 s, narrow (180 m),
    // out to 340 m once the smoke stands; the gimbal's own small wander
    const c = r.cam, a = c.a + OBS_UAV.V / OBS_UAV.R * r.t; c.x = c.cx - Math.cos(a) * OBS_UAV.R * PXM; c.y = c.cy - Math.sin(a) * OBS_UAV.R * PXM; c.hdg = a + Math.PI / 2;
    const on = fall || last, p = on.p;
    if (fall) { const left = p.tti / Math.max(timeK(), 1); want = { x: on.tp.x, y: on.tp.y, h: 0 }; wf = left > 9 ? 600 : 180; }
    else { want = { x: p.ix != null ? p.ix : p.x, y: p.iy != null ? p.iy : p.y, h: 0 }; wf = r.t - last.imp < 2.5 ? 180 : 340; }
    const j = r.wf * PXM * 0.004, t = r.t;
    want.x += j * (Math.sin(t * 1.3 + 0.7) + 0.6 * Math.sin(t * 3.1 + 2.1)); want.y += j * (Math.sin(t * 1.1 + 1.9) + 0.6 * Math.sin(t * 2.7 + 0.3));
    const on2 = on; if (on2 !== r.on) { r.on = on2; r.sw = r.t; r.from = r.look; r.foc = on2.tp; }
    const sw = r.from ? clamp((r.t - r.sw) / 1, 0, 1) : 1, ss = sw * sw * (3 - 2 * sw);
    r.look = sw < 1 ? { x: lerp(r.from.x, want.x, ss), y: lerp(r.from.y, want.y, ss), h: lerp(r.from.h, want.h, ss) } : want;
    if (r.wf === 900) r.wf = wf;
    r.wf += (wf - r.wf) * (1 - Math.exp(-dt / 0.35));
    obsRender(r, jp);
    return;
  }
  // (the jet close for its first seconds, some 120 m across: the weapon coming off it; then the weapon followed down,
  // 70 m across; its last seconds the lens comes out to the target's ground, 260 m, so the impact is in the picture)
  if (fall) {
    const b = obsWeapon(fall), p = fall.p;
    // (real seconds to impact: the fall may run compressed. Once the lens has begun to come out it does not go back in:
    // the compression lets go at 5 s, and the same seconds left would read longer then)
    const left = p.tti / Math.max(timeK(), 1);
    if (fall !== r.cur) { r.cur = fall; r.e = 0; }
    const k = clamp((r.t - fall.t0 - 3) / 2, 0, 1), e = r.e = Math.max(r.e, clamp((4 - left) / 2.5, 0, 1));
    want = { x: lerp(lerp(jp.x, b.x, k), p.x, e), y: lerp(lerp(jp.y, b.y, k), p.y, e), h: lerp(lerp(jp.h, b.h, k), 15, e) };
    wf = lerp(lerp(120, 70, k), 260, e);
  } else { const p = last.p; want = { x: p.ix != null ? p.ix : p.x, y: p.iy != null ? p.iy : p.y, h: 25 }; wf = lerp(260, 380, clamp((r.t - last.imp) / 8, 0, 1)); }
  // (on the jet and the falling weapon without a lag: some 300 m/s at 70 m across leaves the picture in a quarter second;
  // the hand's ease is in the blends from one to the next, and from one weapon to the next: a second's swing over)
  const on = fall || last;
  if (on !== r.on) { r.on = on; r.sw = r.t; r.from = r.look; r.foc = on.tp; }
  const sw = r.from ? clamp((r.t - r.sw) / 1, 0, 1) : 1, ss = sw * sw * (3 - 2 * sw);
  r.look = sw < 1 ? { x: lerp(r.from.x, want.x, ss), y: lerp(r.from.y, want.y, ss), h: lerp(r.from.h, want.h, ss) } : want;
  r.wf += (wf - r.wf) * (1 - Math.exp(-dt / 0.6));
  obsRender(r, jp);
}
function obsRender(r, jp) {
  // (nobody looking: nothing drawn, no smear carried across to the next picture, and the iPad shown no old one when it
  // is looked at again: the copies asked of the GPU dropped)
  if (!obsWatch()) { r.pVP = null; for (const e of r.ws) delete e.pP; OBSR.shown = false; obsReadDrop(); return; }
  const c = OBSR.cam, cx = r.cam.x, cy = r.cam.y, ch = r.cam.h, D = Math.max(Math.hypot(Math.hypot(r.look.x - cx, r.look.y - cy) * MPP, r.look.h - ch), 50);
  const fov = clamp(2 * Math.atan(r.wf * OBS_H / OBS_W / 2 / D) * 180 / Math.PI, 0.25, 30);
  // (the near plane from the subject's distance: nothing in so narrow a picture is nearer than half of it, the ground
  // being at or past the camera's height; with 24 bits a step under a millimetre at 5 km)
  c.fov = fov; c.near = clamp(0.5 * Math.min(D, Math.max(ch, 1)), 2, 1000) * PXM; c.far = 60000; c.updateProjectionMatrix(); r.zoom = Math.round(OBS_REF_FOV / fov);
  c.position.set(cx, -cy, ch * PXM); c.lookAt(r.look.x, -r.look.y, r.look.h * PXM); c.updateMatrixWorld();
  // the jet where it is, as it is (its axes: east, north, up), and the weapon until it lands
  if (JX.ac) { const { F, R, U } = jetAxes(), m = OBSR.jet.matrix;
    m.makeBasis(new THREE.Vector3(F.x, F.y, F.z), new THREE.Vector3(-R.x, -R.y, -R.z), new THREE.Vector3(U.x, U.y, U.z)).setPosition(jp.x, -jp.y, jp.h * PXM); OBSR.jet.matrixWorldNeedsUpdate = true; }
  OBSR.plume.visible = false;
  const cp = new THREE.Vector3(cx, -cy, ch * PXM), cR = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 0), cU = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 1);
  const pxW = 2 * Math.tan(fov * Math.PI / 360) / OBS_H, up = new THREE.Vector3(0, 0, 1), light = S.night ? 0.25 : S.dusk ? 0.8 : 1;
  obsStores();
  // (every weapon's material, the jet's loadout and the falling ones alike, lit as the jet is by night and evening)
  if (OBSR.wm) { const ek = S.night ? 0.12 : S.dusk ? 0.7 : 1.0; for (const k in OBSR.wm) { const w_ = OBSR.wm[k]; for (const mt of [w_.mat, w_.bmat]) { mt.color.setScalar(light); mt.envMapIntensity = 0.8 * ek; } } }
  OBSR.bombs.forEach((m, i) => { const e = r.ws[i], parts = e && e.imp == null ? obsWpnParts(e.p.type, e.p.heavy) : null;
    m.visible = !!parts; m.streak.visible = false; if (!parts) return;
    if (m.key !== parts.key) { m.key = parts.key; m.clear(); for (const g_ of [parts.body, parts.fin, parts.fin2]) { const ms = new THREE.Mesh(g_, g_ === parts.body ? parts.bmat : parts.mat); ms.renderOrder = 36; m.add(ms); } }

    // (along its path: where it is now to where it is a tenth of a second on; its lugs up)
    const b = obsWeapon(e), nb = obsWeapon(e, 0.1), P = new THREE.Vector3(b.x, -b.y, b.h * PXM);
    const A = new THREE.Vector3(nb.x - b.x, -(nb.y - b.y), (nb.h - b.h) * PXM); if (A.lengthSq() < 1e-9) A.set(Math.cos(e.chi), -Math.sin(e.chi), 0); A.normalize();
    const Y = up.clone().addScaledVector(A, -up.dot(A)); if (Y.lengthSq() < 1e-6) Y.copy(cU); Y.normalize(); const Z = new THREE.Vector3().crossVectors(A, Y);
    // (the air over hot ground between: it wavers some 0.7 px, a few times a second)
    const Dw = cp.distanceTo(P), px = Dw * pxW;
    if (!e.sh || Math.abs(r.t - e.shT) > 0.1) { e.shT = r.t; e.sh = [(Math.random() - 0.5) * 1.4, (Math.random() - 0.5) * 1.4]; }
    const Ps = P.clone().addScaledVector(cR, e.sh[0] * px).addScaledVector(cU, e.sh[1] * px);
    m.matrix.makeBasis(A.clone().multiplyScalar(PXM), Y.clone().multiplyScalar(PXM), Z.clone().multiplyScalar(PXM)).setPosition(Ps); m.matrixWorldNeedsUpdate = true;
    // (the shutter's smear: how far it moved across the picture since the last frame, the picture's own motion with it,
    // half of that in a 1/48 s exposure at 24 frames a second; drawn as a soft streak along the motion, behind it)
    if (e.pP && r.pVP) {
      const now = P.clone().project(c), was = e.pP.clone().applyMatrix4(r.pVP), dx = (now.x - was.x) * OBS_W / 2, dy = (now.y - was.y) * OBS_H / 2;
      const k = 0.5 * (1 / OBS_FPS) / Math.max(r.fdt || 1 / OBS_FPS, 1 / OBS_FPS), bx = dx * k, by = dy * k, bl = Math.hypot(bx, by);
      if (bl > 1.5) {
        const B = cR.clone().multiplyScalar(bx * px).addScaledVector(cU, by * px), Bn = B.clone().normalize(), V = cp.clone().sub(P).normalize(), N = new THREE.Vector3().crossVectors(V, Bn).normalize();
        const len = B.length() + parts.L * PXM, wid = (OBS_WPN[e.p.type].D || 0.3) * 1.4 * PXM, st = m.streak;
        st.matrix.makeBasis(Bn.multiplyScalar(len), N.multiplyScalar(wid), V).setPosition(Ps.clone().addScaledVector(B, -0.5)); st.matrixWorldNeedsUpdate = true;
        st.material.color.setRGB(0.42 * light, 0.43 * light, 0.38 * light); st.material.opacity = clamp(0.25 + 6 / bl, 0.25, 0.6); st.visible = true;
      }
    }
    e.pP = P.clone();
    // (the Barq's motor burns some 3.5 s off the rail)
    if (e.p.type === 'agm' && !OBSR.plume.visible && e.p.tof - e.p.tti < 3.5) { const pl = OBSR.plume, L = parts.L * PXM, nV = cp.clone().sub(P).normalize(), Yp = new THREE.Vector3().crossVectors(nV, A).normalize();
      pl.visible = true; pl.matrix.makeBasis(A.clone().multiplyScalar(4.5 * PXM), Yp.multiplyScalar(0.9 * PXM), nV).setPosition(Ps.clone().addScaledVector(A, -(L / 2 + 2.25 * PXM))); pl.matrixWorldNeedsUpdate = true; } });
  r.pVP = new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse);
  OBSR.sun.position.copy(winMat.uniforms.sunD.value); OBSR.sun.intensity = S.night ? 0.12 : S.dusk ? 1.7 : 2.6;
  // (walked only when the time of day changes it: it had walked the whole model 24 times a second)
  if (OBSR.env && OBSR.ek !== (S.night ? 0.12 : S.dusk ? 0.7 : 1.0)) { const ek = OBSR.ek = S.night ? 0.12 : S.dusk ? 0.7 : 1.0; OBSR.model.traverse(o => { if (o.isMesh) { const mt = o.material; if (mt.__env == null) mt.__env = mt.envMapIntensity; mt.envMapIntensity = mt.__env * ek; } }); }
  // the world as the canopy draws it, from here: the effects facing this camera, the far ground and the region round it
  const cr = new THREE.Vector3().setFromMatrixColumn(c.matrixWorld, 0); cr.z = 0; cr.normalize();
  for (const l of [smokeL, fireL, glowE, plumeW, fireW, glowW]) { const u = l.mesh.material.uniforms; u.bill.value = 1; u.camR.value.copy(cr); }
  plumeW.mesh.visible = fireW.mesh.visible = glowW.mesh.visible = true;
  farHaze.visible = !ctWhole(); if (MAP.country) { const rp = 6000 / MPP; farHaze.position.set(Math.round(cx / rp) * rp, -Math.round(cy / rp) * rp, 0); }
  for (const m of REGION_WIN) m.visible = true;
  // (the ground as the canopy has it: the sensor's sharper tiles cover only where it looks, so they are hidden and the
  // whole-map level 0 shown, then each put back as it was)
  const hid = [], shw = [];
  // (where the lens's line meets the ground, and how wide the picture is there: the film's lens on a weapon in the air
  // has the ground behind it)
  let gl = null;
  if (r.uav || r.film) { const dz = r.look.h - ch; if (r.look.h < 200) gl = { x: r.look.x, y: r.look.y, wf: r.wf };
    else if (dz < -1) { const k = ch / -dz, gx = cx + (r.look.x - cx) * k, gy = cy + (r.look.y - cy) * k; gl = { x: gx, y: gy, wf: r.wf * k }; } }
  if (gl && gl.wf < 2500) {
    // (the UAV's ground: the area's own sharper tiles round where it looks, as fine as its lens wants, asked for and
    // kept while it looks; level 0 under them everywhere)
    const Lw = clamp(Math.ceil(Math.log2(MPP * OBS_W / gl.wf)), 1, TOP_L), rad = 1.0 * gl.wf * PXM, lx = gl.x, ly = gl.y, now = performance.now();
    for (let L = Math.max(1, Lw - 1); L <= Lw; L++) {
      const sc = 2 ** L, lv = LEVELS[L], rr = rad * (L < Lw ? 2 : 1);
      if (lx + rr < 0 || ly + rr < 0 || lx - rr > W0 || ly - rr > H0) continue;
      const a = clamp(Math.floor((lx - rr) * sc / TILE), 0, lv.nx - 1), b = clamp(Math.floor((lx + rr) * sc / TILE), 0, lv.nx - 1);
      const c0 = clamp(Math.floor((ly - rr) * sc / TILE), 0, lv.ny - 1), d = clamp(Math.floor((ly + rr) * sc / TILE), 0, lv.ny - 1);
      for (let ty = c0; ty <= d; ty++) for (let tx = a; tx <= b; tx++) { const t = ensureTile(L, tx, ty); t.want = tileFrame; t.used = now; }
    }
    const R2 = rad * 2.2;
    for (const t of tiles.values()) { if (!t.mesh) continue;
      const v = t.L === 0 ? !miniMesh : t.L <= Math.min(Lw + 1, TOP_L) && t.x0 < lx + R2 && t.x0 + t.w > lx - R2 && t.y0 < ly + R2 && t.y0 + t.h > ly - R2;
      if (v !== t.mesh.visible) { t.mesh.visible = v; (v ? shw : hid).push(t.mesh); } }
  } else
  for (const t of tiles.values()) { if (!t.mesh) continue; if (t.L > 0 || miniMesh) { if (t.mesh.visible) { t.mesh.visible = false; hid.push(t.mesh); } } else if (!t.mesh.visible) { t.mesh.visible = true; shw.push(t.mesh); } }
  fogSet(r.film || r.uav ? OBSR.fog : null); OBSR.g.visible = true;
  renderer.setClearColor(0x000000, 0);
  renderer.setRenderTarget(OBSR.rtA);
  // (made with its depth and stencil, it keeps them; the four samples' resolve then copies the colour alone: three
  // r128 resolves whatever the flags say at each frame, some 18 MB of depth and stencil a frame the film never reads)
  if (OBSR.rtA.isWebGLMultisampleRenderTarget && OBSR.rtA.depthBuffer) OBSR.rtA.depthBuffer = OBSR.rtA.stencilBuffer = false;
  renderer.clear(); renderer.render(sceneA, c);
  OBSR.g.visible = false; fogSet(null);
  renderer.setClearColor(0x000000, 1);
  renderer.setRenderTarget(OBSR.rtE); renderer.clear(); if (fireL.n + glowE.n + fireW.n + glowW.n) renderer.render(sceneE, c);
  for (const l of [smokeL, fireL, glowE]) l.mesh.material.uniforms.bill.value = 0;
  plumeW.mesh.visible = fireW.mesh.visible = glowW.mesh.visible = false; farHaze.visible = false; for (const m of REGION_WIN) m.visible = false;
  for (const m of hid) m.visible = true; for (const m of shw) m.visible = false;
  // the sky, the dust and the light, as winMat's: its dust from here (a short path down from the hill, the layer's
  // depth over it looking up at the jet), no glass
  const u = OBSR.mat.uniforms, w = winMat.uniforms;
  // (the night and the blast's light from the scene itself: winMat's are set only when the canopy is drawn, and the
  // sensor may fill the screen)
  for (const k of ['dusk', 'dustK']) u[k].value = w[k].value; u.sunD.value.copy(w.sunD.value); u.time.value = S.t;
  u.night.value = S.night ? 1 : 0; u.flash.value = S.flash * (S.night ? 0.45 : 0.16);
  u.dust.value.setHex(S.wx === 'dust' ? 0x9c8566 : S.dusk ? 0xb8957a : JET_DUST);
  u.invVP.value.multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse).invert(); u.eye.value.setFromMatrixPosition(c.matrixWorld);
  const dk = S.wx === 'dust' ? 1 : 0;
  u.hz.value = -Math.sqrt(2 * Math.max(ch, 1) / 6.371e6);
  // (the dust's depth under the eye: the hill's path along the ground; the UAV over the layer, as the jet)
  u.hk.value = JET_HAZE.k * (1 + 4 * dk) * (r.uav || r.film ? Math.max(0, Math.min(ch, JET_HAZE.top * (1 + dk) - 410)) : Math.max(ch, 1));
  u.hkUp.value = JET_HAZE.k * (1 + 4 * dk) * Math.max(0, (JET_HAZE.top - 410) * (1 + dk) - ch);
  // (WebGL 1) onto the screen's canvas, in its corner, copied off at once, then the corner cleared for the frame's own
  // drawing (at its full size always: where the canvas is smaller than the picture (a phone's, or its resolution cut while it
  // cools) the picture is drawn in pieces, each moved into the canvas's corner and copied to its place; nothing is
  // drawn smaller and enlarged)
  const cv = renderer.domElement, x = OBSR.ctx, cw = cv.width, chh = cv.height, vp = v => (v + 0.5) / PR;
  // (WebGL 2: the last frame's picture, read back by now, onto the 2D canvas, and this one asked for; the iPad's
  // picture a 24th of a second behind the world, its marks this frame's. None ready: the iPad keeps the one it has)
  if (OBSR.rtF) { if (!obsRead(r)) return; }
  else {
  renderer.setRenderTarget(null); renderer.setScissorTest(true);
  for (let oy = 0; oy < OBS_H; oy += chh) for (let ox = 0; ox < OBS_W; ox += cw) {
    const tw = Math.min(cw, OBS_W - ox), th = Math.min(chh, OBS_H - oy);
    renderer.setViewport(vp(-ox), vp(-oy), vp(OBS_W), vp(OBS_H)); renderer.setScissor(0, 0, vp(tw), vp(th));
    renderer.clear(); renderer.render(OBSR.scene, postCam);
    x.drawImage(cv, 0, chh - th, tw, th, ox, OBS_H - oy - th, tw, th);
  }
  renderer.setScissor(0, 0, vp(Math.min(cw, OBS_W)), vp(Math.min(chh, OBS_H))); renderer.clear(); renderer.setScissorTest(false); renderer.setViewport(0, 0, VW, VH);
  }
  OBSR.shown = true; EFB.dirty = true;   // (a new picture for the iPad)
  if (r.uav) { obsUavMarks(r, x, c); return; }
  if (r.film) { obsFilmLook(r, x); return; }
  // the camera's own marks (in Latin, as it writes them): live, its zoom and range to the target, the time
  const tp = r.foc || r.tp, rng = Math.hypot(tp.x - cx, tp.y - cy) * MPP / 1000, brg = Math.round((Math.atan2(tp.x - cx, -(tp.y - cy)) * 180 / Math.PI + 360) % 360);
  r.rng = rng; r.brg = brg;
  x.save(); x.font = '600 15px ui-monospace, Menlo, monospace'; x.shadowColor = 'rgba(0,0,0,0.8)'; x.shadowBlur = 3; x.fillStyle = '#ff4b4b';
  x.beginPath(); x.arc(18, 20, 5, 0, 6.283); x.fill(); x.fillStyle = '#fff'; x.textBaseline = 'middle';
  x.fillText('LIVE  OBS 1', 30, 20); x.textAlign = 'right'; x.fillText(efbClock(true), OBS_W - 14, 20);
  x.textAlign = 'left'; x.fillText('×' + r.zoom + '   ' + rng.toFixed(1) + ' KM   ' + String(brg).padStart(3, '0') + '°', 14, OBS_H - 18);
  x.restore();
}
// The UAV's picture as its camera gives it: the colour a little flat, the sensor's grain, the lens's darker corners;
// and the video's own marks (as a drone's full-motion video carries them, in Latin): the reticle, the sensor and its
// field of view, live, the time to the second, its slant range, height and heading, where it looks
function obsUavMarks(r, x, c) {
  const W = OBS_W, H = OBS_H;
  if (!OBSR.grain) obsUavMarks.init(x);
  x.save();
  x.globalCompositeOperation = 'saturation'; x.globalAlpha = S.night ? 1 : 0.32; x.fillStyle = '#808080'; x.fillRect(0, 0, W, H);
  x.globalCompositeOperation = 'overlay'; x.globalAlpha = 0.13; x.translate(-Math.random() * 256, -Math.random() * 256); x.fillStyle = OBSR.gpat; x.fillRect(0, 0, W + 256, H + 256);
  x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.fillStyle = OBSR.vig; x.fillRect(0, 0, W, H);
  // the reticle: a cross open at its middle, the corners of the narrow field
  x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.shadowColor = 'rgba(0,0,0,0.9)'; x.shadowBlur = 2;
  const cx = W / 2, cy = H / 2; x.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { x.moveTo(cx + dx * 12, cy + dy * 12); x.lineTo(cx + dx * 46, cy + dy * 46); }
  const bw = W * 0.16, bh = H * 0.16, k = 16;
  for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { const px = cx + sx * bw, py = cy + sy * bh; x.moveTo(px - sx * k, py); x.lineTo(px, py); x.lineTo(px, py - sy * k); }
  x.stroke();
  // the marks
  const sl = Math.hypot(Math.hypot(r.look.x - r.cam.x, r.look.y - r.cam.y) * MPP, r.cam.h), alt = Math.round((r.cam.h + GROUND) * 3.281 / 10) * 10;
  const hdg = Math.round(((r.cam.hdg || 0) * 180 / Math.PI + 90 + 720) % 360), az = Math.round((Math.atan2(r.look.x - r.cam.x, -(r.look.y - r.cam.y)) * 180 / Math.PI + 360) % 360);
  const el = Math.round(-Math.atan2(r.cam.h, Math.hypot(r.look.x - r.cam.x, r.look.y - r.cam.y) * MPP) * 180 / Math.PI);
  const z = efbClock(true), sec = String(Math.floor(S.missionT % 60)).padStart(2, '0'), zt = z.slice(0, 2) + ':' + z.slice(2, 4) + ':' + sec + 'Z';
  x.font = '600 17px ui-monospace, Menlo, monospace'; x.fillStyle = '#fff'; x.textBaseline = 'middle';
  x.fillText('UAV-1   ' + (S.night ? 'IR WHT' : 'EO') + '   ' + (r.wf > 450 ? 'WFOV' : 'NFOV'), 18, 24);
  x.fillStyle = '#ff4040'; x.beginPath(); x.arc(24, 50, 5, 0, 6.283); x.fill(); x.fillStyle = '#fff'; x.fillText('LIVE', 36, 50);
  x.textAlign = 'right'; x.fillText(zt, W - 18, 24);
  x.fillText('SLR ' + (sl / 1000).toFixed(2) + ' KM', W - 18, H - 50); x.fillText('AZ ' + String(az).padStart(3, '0') + '  EL ' + el, W - 18, H - 24);
  x.textAlign = 'left'; x.fillText('ALT ' + alt + ' FT   HDG ' + String(hdg).padStart(3, '0'), 18, H - 50);
  x.fillText('TGT ' + efbGrid({ x: r.look.x, y: r.look.y }), 18, H - 24);
  x.restore();
  r.rng = sl / 1000; r.brg = az; r.zoom = Math.round(OBS_W * 0.3 / Math.max(r.wf, 1)) || 1;
}
// The film's picture: a camera's, not a sensor's: the corners a little dark, the colour as it is; only
// the live feed's own small mark and its running time
function obsFilmLook(r, x) {
  const W = OBS_W, H = OBS_H;
  if (!OBSR.grain) obsUavMarks.init(x);
  // (the camera's own adjusting: after a cut from the sky to the ground its exposure, set for the bright sky, leaves
  // the ground dark for a moment and comes up in some 0.6 s; after a cut or a step of the zoom its focus hunts, soft
  // for some 0.35 s)
  const ce = r.cutT != null ? r.t - r.cutT : 9, fe = Math.min(ce, r.focT != null ? r.t - r.focT : 9);
  if (fe < 0.35) { const sm = OBSR.blur || (OBSR.blur = Object.assign(document.createElement('canvas'), { width: W / 4, height: H / 4 })), sx = sm.getContext('2d');
    sx.drawImage(x.canvas, 0, 0, W / 4, H / 4); x.save(); x.globalAlpha = 0.85 * (1 - fe / 0.35); x.imageSmoothingEnabled = true; x.drawImage(sm, 0, 0, W, H); x.restore(); }
  if (ce < 0.8) { x.save(); x.globalAlpha = 0.28 * Math.exp(-ce / 0.25); x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.restore(); }
  x.save();
  // (a long lens through kilometres of desert air: its veil lifts the blacks and pales the sky a little)
  // (no grain: a film camera's is finer than the video's own, and a grain that changes every frame costs the encoder
  // the picture's detail; no veil either: the sky's haze is the composite's own (winMat, the observer's paler sky), so
  // the dark jet keeps its edge against it in the video's luminance; the corners only a little darker)
  x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1; x.drawImage(OBSR.vig3 || (OBSR.vig3 = (() => { const v = document.createElement('canvas'); v.width = W; v.height = H; const q = v.getContext('2d'); q.globalAlpha = 0.3; q.fillStyle = OBSR.vig; q.fillRect(0, 0, W, H); return v; })()), 0, 0);
  x.globalAlpha = 0.85; x.font = '600 15px ui-monospace, Menlo, monospace'; x.textBaseline = 'middle'; x.shadowColor = 'rgba(0,0,0,0.7)'; x.shadowBlur = 2;
  x.fillStyle = '#ff3b3b'; x.beginPath(); x.arc(22, 22, 5, 0, 6.283); x.fill(); x.fillStyle = '#fff'; x.fillText('LIVE', 33, 22);
  const t = Math.max(0, r.t - (r.t0 || 0)), f = Math.floor(t * 24) % 24;
  x.textAlign = 'right'; x.fillText('00:' + pad(Math.floor(t / 60), 2) + ':' + pad(Math.floor(t % 60), 2) + ':' + pad(f, 2), W - 18, H - 22);
  x.restore();
  const az = Math.round((Math.atan2(r.look.x - r.cam.x, -(r.look.y - r.cam.y)) * 180 / Math.PI + 360) % 360);
  r.rng = Math.hypot(Math.hypot(r.look.x - r.cam.x, r.look.y - r.cam.y) * MPP, r.cam.h - r.look.h) / 1000; r.brg = az; r.zoom = Math.round(OBS_W * 0.3 / Math.max(r.wf, 1)) || 1;
}
obsUavMarks.init = x => { const W = OBS_W, H = OBS_H, g = OBSR.grain = document.createElement('canvas'); g.width = g.height = 256; const gx = g.getContext('2d'), im = gx.createImageData(256, 256);
  for (let i = 0; i < im.data.length; i += 4) { const v = 128 + (Math.random() + Math.random() + Math.random() - 1.5) * 90; im.data[i] = im.data[i + 1] = im.data[i + 2] = v; im.data[i + 3] = 255; }
  gx.putImageData(im, 0, 0); OBSR.gpat = x.createPattern(g, 'repeat');
  const vg = x.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.62); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.42)'); OBSR.vig = vg; };
// The picture back from the GPU without stalling it (WebGL 2): each of the camera's frames composited into rtF and copied
// into one of two pixel buffers; the copy asked for at its last frame, 1/24 s and two or more of the game's frames ago,
// long done, is what goes onto the 2D canvas. No fence: in WebKit a fence, and each look at it, is a round trip that
// waits for the GPU process to run the whole frame just sent. True when a picture was put there
function obsRead(r) {
  const gl = renderer.getContext(), R = OBSR.rb || (OBSR.rb = { i: 0, bufs: null, img: new ImageData(OBS_W, OBS_H) });
  if (!R.bufs) { R.px = new Uint8Array(R.img.data.buffer);
    R.bufs = [0, 1].map(() => { const b = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b); gl.bufferData(gl.PIXEL_PACK_BUFFER, OBS_W * OBS_H * 4, gl.STREAM_READ); return { b, full: false, take: null }; });
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null); }
  const o = R.bufs[R.i ^ 1], b = R.bufs[R.i]; let got = false;
  if (o.full && o.take === r) {
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, o.b); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, R.px); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    OBSR.ctx.putImageData(R.img, 0, 0); got = true; }
  o.full = false; R.i ^= 1;
  renderer.setRenderTarget(OBSR.rtF); renderer.clear(); renderer.render(OBSR.sceneF, postCam);
  gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b.b); gl.readPixels(0, 0, OBS_W, OBS_H, gl.RGBA, gl.UNSIGNED_BYTE, 0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  b.full = true; b.take = r; gl.flush();
  renderer.setRenderTarget(null);
  return got;
}
function obsReadDrop() {
  const R = OBSR.rb; if (!R || !R.bufs) return;
  for (const b of R.bufs) b.full = false;
}
// (its buffers let go between takes, as the targets are, and dropped without a call after a lost context: their names
// are the old context's)
function obsReadFree(lost) {
  const R = OBSR.rb; if (!R || !R.bufs) return;
  if (!lost) { const gl = renderer.getContext(); for (const b of R.bufs) gl.deleteBuffer(b.b); }
  R.bufs = null;
}
// a take over: its picture's targets let go (some 30 MB of the GPU's at 1280 x 720 with four samples; made again at
// the next), the iPad's picture with them
function obsStop() {
  OBSR.rec = null; OBSR.shown = false; EFB.dirty = true;
  if (OBSR.rtA) { OBSR.rtA.depthBuffer = OBSR.rtA.stencilBuffer = true; OBSR.rtA.dispose(); OBSR.rtE.dispose(); if (OBSR.rtF) OBSR.rtF.dispose(); obsReadFree(false); }   // (made afresh, with its depth, at the next take)
}
