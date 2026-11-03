/* ===================== renderer ===================== */
const app = $('#app'), glCanvas = $('#gl'), hud = $('#hud'), hctx = hud.getContext('2d');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false }); }
catch (e) { $('#startAr').textContent = Lg('هذا المتصفح لا يدعم WebGL', 'This browser has no WebGL'); $('#startEn').textContent = 'WEBGL UNAVAILABLE'; return; }
renderer.autoClear = false;
// picture quality: normal (up to 2× pixels, lowered on a slow phone) or high (the screen's full 3×, never below 2×)
let HIQ = false; try { HIQ = localStorage.getItem('saqr.hi') === '1'; } catch (_) {}
let PR = Math.min(window.devicePixelRatio || 1, HIQ ? 3 : 2);
let VW = 1, VH = 1;
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10); cam.position.z = 5;
const sceneA = new THREE.Scene(), sceneL = new THREE.Scene(), sceneE = new THREE.Scene(), sceneH = new THREE.Scene();
// (one fog for good, its density 0 where a pass wants none: put on and taken off the scene each pass, three.js worked
// out every fogged material's shader again each time, twice a frame through the glass and the observer's film)
const SCENE_FOG = sceneA.fog = new THREE.FogExp2(0x000000, 0);
function fogSet(f) { if (f) { SCENE_FOG.color.copy(f.color); SCENE_FOG.density = f.density; } else SCENE_FOG.density = 0; }
const rtOpts = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false };
// A piece of what is on the screen copied without stalling the GPU (WebGL 2): blitted inside the GPU into a small
// texture of its own (the first blit turns it the right way up; halved a step at a time down to the size wanted, each
// step a bilinear blit, so the picture is smoothed as a scaled image is), read into a pixel buffer behind a fence, and
// put onto its canvas a frame or more later (glGrabPoll, each frame; a copy not reported done after four frames read
// anyway). A drawImage off the screen's canvas had made the GPU finish all it had queued first: a frame lost at each
// release and each impact for the strike tape's stills (the owner's phone log, 'grab'). x, y, w, h: device pixels
// from the canvas's top left. False where it cannot be done so (WebGL 1): the caller copies as before
const GRABS = [];
function glGrab(x, y, w, h, cv) {
  const gl = renderer.getContext(); if (!renderer.capabilities.isWebGL2 || gl.isContextLost()) return false;
  const W = cv.width, H = cv.height, CW = renderer.domElement.width, CH = renderer.domElement.height;
  // (the rectangle inside the canvas: rounded at a fractional pixel ratio it could reach a pixel past its edge, and a
  // texel left transparent there)
  const xa = clamp(Math.round(x), 0, CW), xb = clamp(Math.round(x + w), 0, CW), ya = clamp(Math.round(CH - y - h), 0, CH), yb = clamp(Math.round(CH - y), 0, CH);
  if (xb - xa < 1 || yb - ya < 1) return false;
  // (what three thinks is bound, put back after: its own cache of them is not told)
  const dfb = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING), rfb = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING), tb = gl.getParameter(gl.TEXTURE_BINDING_2D);
  const made = [];
  try {
    const sizes = []; let cw = xb - xa, ch = yb - ya;
    while (cw > 2 * W && ch > 2 * H) { cw = Math.round(cw / 2); ch = Math.round(ch / 2); sizes.push([cw, ch]); }
    sizes.push([W, H]);
    let src = null, sx0 = xa, sy0 = ya, sx1 = xb, sy1 = yb, first = true;
    for (const [tw, th] of sizes) {
      const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, tw, th);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, f); gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      made.push([f, t]);
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
      // (the canvas's rows run bottom-up: the first blit fills its target upside down, so every later one, and the read,
      // run top-first)
      if (first) gl.blitFramebuffer(sx0, sy0, sx1, sy1, 0, th, tw, 0, gl.COLOR_BUFFER_BIT, gl.LINEAR);
      else gl.blitFramebuffer(0, 0, sx1, sy1, 0, 0, tw, th, gl.COLOR_BUFFER_BIT, gl.LINEAR);
      first = false; src = f; sx1 = tw; sy1 = th;
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src);
    const b = gl.createBuffer(); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, b); gl.bufferData(gl.PIXEL_PACK_BUFFER, W * H * 4, gl.STREAM_READ);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, 0); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    // (no fence: the context lost meanwhile; the caller copies as before)
    if (!sync) { gl.deleteBuffer(b); return false; }
    GRABS.push({ cv, b, sync, n: 0, W, H }); gl.flush();
    return true;
  } catch (_) { return false; }
  finally {
    // (deleted now: GL keeps them for the copies already asked of them)
    for (const [f, t] of made) { gl.deleteFramebuffer(f); gl.deleteTexture(t); }
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dfb); gl.bindFramebuffer(gl.READ_FRAMEBUFFER, rfb); gl.bindTexture(gl.TEXTURE_2D, tb);
  }
}
// (a context lost meanwhile: the grab dropped, its still left blank; never a throw out of the frame)
function glGrabPoll() {
  const gl = renderer.getContext();
  if (gl.isContextLost()) { GRABS.length = 0; return; }
  for (let i = GRABS.length - 1; i >= 0; i--) {
    const g = GRABS[i]; g.n++;
    try {
      if (gl.getSyncParameter(g.sync, gl.SYNC_STATUS) !== gl.SIGNALED && g.n < 4) continue;
      const img = new ImageData(g.W, g.H), d = img.data; gl.bindBuffer(gl.PIXEL_PACK_BUFFER, g.b); gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, new Uint8Array(d.buffer)); gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      // (opaque, whatever the screen's buffer held in its alpha: an opaque canvas's may not read back as 1 everywhere)
      for (let k = 3; k < d.length; k += 4) d[k] = 255;
      g.cv.getContext('2d').putImageData(img, 0, 0);
      gl.deleteSync(g.sync); gl.deleteBuffer(g.b);
    } catch (_) {}
    GRABS.splice(i, 1);
  }
}
let rtA = new THREE.WebGLRenderTarget(4, 4, rtOpts), rtL = new THREE.WebGLRenderTarget(4, 4, rtOpts), rtE = new THREE.WebGLRenderTarget(4, 4, rtOpts), rtH = new THREE.WebGLRenderTarget(4, 4, rtOpts);

const post = new THREE.ShaderMaterial({
  uniforms: {
    tA: { value: rtA.texture }, tL: { value: rtL.texture }, tE: { value: rtE.texture }, tH: { value: rtH.texture }, hasL: { value: 1 }, hasE: { value: 1 }, ir: { value: 0 }, blank: { value: 0 },
    res: { value: new THREE.Vector2(1, 1) }, resA: { value: new THREE.Vector2(1, 1) }, look: { value: new THREE.Vector2(0, -1) }, zoom: { value: 1 }, night: { value: 0 }, flash: { value: 0 }, expo: { value: 1 }, time: { value: 0 }, grain: { value: 0.018 }, lltv: { value: JET ? 1 : 0 }, dusk: { value: 0 }, dustK: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
  fragmentShader: `
    precision highp float;
    uniform sampler2D tA, tL, tE, tH; uniform vec2 res, resA, look; uniform float night, flash, expo, time, grain, zoom, ir, blank, lltv, dusk, dustK, hasL, hasE;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      // heat shimmer through 1.2 km of warm air, stronger the narrower the field of view
      // oblique line of sight from the orbiting aircraft: near side magnified, far side receding
      vec2 d = vUv - 0.5;
      float f = 1.0 + 0.075 * dot(d, look);
      vec2 uv = 0.5 + d / (f * 1.05);
      float sh = clamp((zoom - 2.0) / 10.0, 0.0, 1.0) * (1.0 - night * 0.6);
      uv += vec2(sin(vUv.y * 23.0 + time * 0.9), cos(vUv.x * 19.0 + time * 0.7)) * 0.00012 * sh;
      // optics: a lens and sensor never resolve a perfectly crisp pixel
      // (the lights' and the fires' targets read only when something was drawn in them (hasL, hasE: most of the day
      // neither), and the visible optics only for the visible pictures: 10 to 15 of the 29 reads a pixel had read nothing)
      vec2 q = 1.15 / resA;
      vec3 a = vec3(0.0);
      if (ir < 0.5) a = texture2D(tA, uv).rgb * 0.36
             + (texture2D(tA, uv + vec2(q.x, 0.0)).rgb + texture2D(tA, uv - vec2(q.x, 0.0)).rgb
             +  texture2D(tA, uv + vec2(0.0, q.y)).rgb + texture2D(tA, uv - vec2(0.0, q.y)).rgb) * 0.16;
      vec3 l = vec3(0.0);
      if (hasL > 0.5) l = texture2D(tL, uv).rgb;
      vec3 e = vec3(0.0), b = vec3(0.0);
      if (hasE > 0.5) {
        e = texture2D(tE, uv).rgb;
        vec2 o = 3.0 / res;
        b = texture2D(tE, vUv + vec2(o.x, 0.0)).rgb + texture2D(tE, vUv - vec2(o.x, 0.0)).rgb
          + texture2D(tE, vUv + vec2(0.0, o.y)).rgb + texture2D(tE, vUv - vec2(0.0, o.y)).rgb
          + texture2D(tE, vUv + o * 1.8).rgb + texture2D(tE, vUv - o * 1.8).rgb
          + texture2D(tE, vUv + vec2(o.x, -o.y) * 1.8).rgb + texture2D(tE, vUv + vec2(-o.x, o.y) * 1.8).rgb;
        b *= 0.125;
      }
      vec3 col;
      if (ir > 0.5) {
        // thermal imager: coarser optics, grey scale, no reflected light
        vec2 q2 = 2.4 / resA;
        vec3 aa = texture2D(tA, uv).rgb * 0.2
                + (texture2D(tA, uv + vec2(q2.x, 0.0)).rgb + texture2D(tA, uv - vec2(q2.x, 0.0)).rgb
                +  texture2D(tA, uv + vec2(0.0, q2.y)).rgb + texture2D(tA, uv - vec2(0.0, q2.y)).rgb) * 0.2;
        float lum = dot(aa, vec3(0.299, 0.587, 0.114));
        // day: sunlit rock and soil run warm, shade and vegetation cool
        // night: a flat, low-contrast scene once the ground has given its heat back to the sky
        float g = night > 0.5 ? 0.34 + (lum - 0.45) * 0.2 : 0.12 + lum * 0.72;
        vec2 hc = texture2D(tH, uv).rg;
        float h = hc.r;
        vec2 o2 = 3.0 / res, o3 = o2 * 0.7071;
        float hw = (texture2D(tH, uv + vec2(o2.x, 0.0)).r + texture2D(tH, uv - vec2(o2.x, 0.0)).r
                 +  texture2D(tH, uv + vec2(0.0, o2.y)).r + texture2D(tH, uv - vec2(0.0, o2.y)).r
                 +  texture2D(tH, uv + o3).r + texture2D(tH, uv - o3).r
                 +  texture2D(tH, uv + vec2(o3.x, -o3.y)).r + texture2D(tH, uv + vec2(-o3.x, o3.y)).r) * 0.125;
        // red channel: sources warmer than the ground; green: surfaces colder (glass and metal mirroring the sky)
        g += h * 0.95 - hc.g * 0.6;
        // detail enhancement leaves a soft dark halo around hot objects, as in real thermal video
        g -= max(hw - h, 0.0) * 0.3;
        g += dot(e, vec3(0.4, 0.4, 0.2)) * 1.0 + dot(b, vec3(0.4, 0.4, 0.2)) * 0.8;
        col = vec3(g);
        col += (hash(vec2(floor(vUv.x * resA.x), 3.7)) - 0.5) * 0.008;
      } else if (night > 0.5 && lltv > 0.5) {
        // the ZF-25's pod at night: its TV with the gain turned up on starlight (low-light), grey and flat, the
        // shadows still dark, and every light flaring; the grain is the gain's (postGrain). (It was the eye's own
        // dark blue night, the men hardly to be seen)
        float lum = dot(a, vec3(0.299, 0.587, 0.114));
        col = vec3(0.045 + lum * 0.4) * vec3(0.97, 1.0, 1.02) + vec3(dot(a * l, vec3(0.333))) * 2.6;
      } else if (night > 0.5) {
        float lum = dot(a, vec3(0.299, 0.587, 0.114));
        vec3 base = mix(vec3(lum), a, 0.3);
        col = base * vec3(0.15, 0.18, 0.26) + a * l * 1.75;
      } else {
        col = a * (1.0 + l * 0.45);
        // atmosphere between the aircraft and the ground: veiling haze, lifted shadows, muted colour
        float lum = dot(col, vec3(0.299, 0.587, 0.114));
        col = mix(vec3(lum), col, 0.8);
        col = mix(col, vec3(0.64, 0.66, 0.68), 0.12 + 0.03 * clamp(1.0 - zoom / 4.0, 0.0, 1.0));
        col = (col - 0.5) * 0.92 + 0.5;
        // the evening: the sun low in the west, its light warm and weaker, the shadows long (placeVehicle and the rest)
        if (dusk > 0.5) { float lu = dot(col, vec3(0.299, 0.587, 0.114)); col = mix(vec3(lu), col, 0.85) * vec3(1.05, 0.84, 0.64) * 0.8; }
      }
      // a dust storm between the pod and the ground: the TV's picture washed into the dust's own colour, its contrast
      // gone; the thermal sees through it better (its longer waves), a little flatter
      if (dustK > 0.0) {
        if (ir < 0.5) { col = mix(col, (night > 0.5 ? vec3(0.22) : vec3(0.63, 0.56, 0.45)), 0.52 * dustK); col = (col - 0.5) * (1.0 - 0.3 * dustK) + 0.5; }
        else col = mix(col, vec3(0.36), 0.25 * dustK);
      }
      if (ir < 0.5) col += e + b * 0.75;
      col *= expo;
      col += flash * vec3(1.0, 0.97, 0.9);
      vec3 over = max(col - 0.85, 0.0);
      col = min(col, vec3(0.85)) + over / (1.0 + over * 1.3);
      if (ir > 1.5) col = 1.0 - min(col, vec3(1.0));
      // switching sensors: the video drops to flat grey for a moment while the new channel settles
      col = mix(col, vec3(0.42), blank);
      col += (hash(vUv * res + floor(time * 12.0) * 7.31) - 0.5) * grain;
      vec2 c = vUv - 0.5; col *= 1.0 - dot(c, c) * 0.32;
      gl_FragColor = vec4(col, 1.0);
    }`,
  depthTest: false, depthWrite: false,
});
const postScene = new THREE.Scene(), postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), post));

/* ===================== textures ===================== */
const loader = new THREE.TextureLoader();
// every texture asked for at boot is tracked: the loading screen waits for all of them
const BOOT = { tex: [], done: 0, total: 0 };
function track(url, opts) {
  BOOT.total++;
  const t = loader.load(url, () => { BOOT.done++; }, undefined, () => { BOOT.done++; });
  Object.assign(t, opts); BOOT.tex.push(t); return t;
}
function tex(url) { return track(url, { minFilter: THREE.LinearFilter, generateMipmaps: false }); }
// mipmapped: for sprites that shrink to a few pixels (houses), so they do not sparkle against the map
function texM(url) { return track(url, { minFilter: THREE.LinearMipmapLinearFilter, generateMipmaps: true }); }
const T = {
  suv: tex('sprites/suv.png'), suvB: tex('sprites/suv_burnt.png'), suvS: tex('sprites/suv_shadow.png'),
  cargo: tex('sprites/cargo.png'), cargoB: tex('sprites/cargo_burnt.png'), cargoS: tex('sprites/cargo_shadow.png'),
  tanker: tex('sprites/tanker.png'), tankerB: tex('sprites/tanker_burnt.png'), tankerS: tex('sprites/tanker_shadow.png'),
  hilux: tex('sprites/hilux.png'), hiluxB: tex('sprites/hilux_burnt.png'), hiluxS: tex('sprites/hilux_shadow.png'),
  mrap: tex('sprites/mrap.png'), mrapB: tex('sprites/mrap_burnt.png'), mrapS: tex('sprites/mrap_shadow.png'),
  lc79: tex('sprites/lc79.png'), lc79B: tex('sprites/lc79_burnt.png'), lc79S: tex('sprites/lc79_shadow.png'),
  launcher: tex('sprites/launcher.png'), launcherB: tex('sprites/launcher_burnt.png'), launcherS: tex('sprites/launcher_shadow.png'),
  smoke: tex('sprites/smoke.png'), fire: tex('sprites/fire.png'), glow: tex('sprites/glow.png'), scorch: tex('sprites/scorch.png'),
  cone: tex('sprites/cone.png'),
  // a cleared plot under each house, cut from this map's own flat ground
  housePad: texM(MAP.pad ? MAP.dir + 'house_pad.png' : 'sprites/house_pad.png'),
  // the ruins of the buildings in this map's picture (tools/make_map.py), one atlas
  ruins: MAP.blds ? tex(MAP.dir + 'ruins.webp') : null,
  // the infantry's poses, one picture a side (tools/make_infantry.py), and a standing man's shadow
  men_red: texM('sprites/men_red.webp'), men_blue: texM('sprites/men_blue.webp'), manCast: tex('sprites/man_cast.png'),
};
for (let n = 1; n <= 7; n++) Object.assign(T, { ['house' + n]: texM('sprites/house' + n + '.png'), ['house' + n + 'S']: texM('sprites/house' + n + '_shadow.png'), ['house' + n + 'R']: texM('sprites/house' + n + '_ruin.png') });
for (const k of ['fac', 'rktboat', 'dhow', 'patrol', 'lcm', 'fishing', 't72', 'btr80', 'bm21', 'ural', 'zu23e', 'mortar', 'ammo', 'trench']) Object.assign(T, { [k]: tex('sprites/' + k + '.png'), [k + 'B']: tex('sprites/' + k + '_burnt.png'), [k + 'S']: tex('sprites/' + k + '_shadow.png') });
Object.assign(T, { sa8: T.btr80, sa8B: T.btr80B, sa8S: T.btr80S });
// real footprints incl. mirrors (sprites carry 10 px padding on every side)
const SPR = {
  suv: { w: 170, h: 340, len: 4.9, wid: 2.3, ar: 'جيب مدني', en: 'SUV', hp: 100 },
  cargo: { w: 197, h: 440, len: 7.5, wid: 3.16, ar: 'شاحنة نقل', en: 'TRK', hp: 120 },
  tanker: { w: 159, h: 440, len: 8.5, wid: 2.81, ar: 'صهريج وقود', en: 'FUEL', hp: 90 },
  hilux: { w: 157, h: 340, len: 5.3, wid: 2.28, ar: 'بيك أب فني', en: 'TECH', hp: 100 },
  mrap: { w: 185, h: 340, len: 6.4, wid: 3.3, ar: 'مدرعة', en: 'MRAP', hp: 160 },
  lc79: { w: 156, h: 340, len: 5.2, wid: 2.2, ar: 'دفع رباعي فني', en: 'TECH', hp: 100 },
  launcher: { w: 204, h: 440, len: 10.0, wid: 4.37, ar: 'منصة صواريخ', en: 'TEL', hp: 140 },
  // the owner's ground targets (tools/make_ground.py): armour (ARMOUR) for the tank and the APC; emp: a dug-in position
  // (no engine, no glass, no moving, a low shadow)
  t72: { w: 222, h: 440, len: 9.5, wid: 4.58, ar: 'دبابة', en: 'MBT', hp: 420 },
  btr80: { w: 218, h: 440, len: 7.6, wid: 3.58, ar: 'مدرعة', en: 'APC', hp: 220 },
  // the radar SAM, an SAM-R (Osa): one six-wheeled vehicle with its own search and tracking radars and six missiles
  // (samUpdate). Drawn with the APC's picture until the owner's own (asked for: assets/originals/sa8_prompt.md)
  sa8: { w: 218, h: 440, len: 9.1, wid: 4.28, ar: 'دفاع جوي راداري', en: 'SAM-R', hp: 180 },
  bm21: { w: 189, h: 440, len: 7.4, wid: 2.98, ar: 'راجمة صواريخ', en: 'MRL', hp: 130 },
  ural: { w: 182, h: 440, len: 7.4, wid: 2.86, ar: 'شاحنة عسكرية', en: 'TRUCK', hp: 110 },
  zu23e: { w: 421, h: 440, len: 7.5, wid: 7.15, ar: 'موقع مدفع 23 ملم', en: 'AAG-23 POS', hp: 150, emp: true },
  mortar: { w: 345, h: 340, len: 5.0, wid: 5.07, ar: 'موقع هاون', en: 'MORTAR', hp: 110, emp: true },
  ammo: { w: 438, h: 340, len: 6.5, wid: 8.49, ar: 'مخزن ذخيرة', en: 'AMMO DUMP', hp: 180, emp: true },
  trench: { w: 542, h: 340, len: 6.0, wid: 9.78, ar: 'خندق رشاش', en: 'MG TRENCH', hp: 140, emp: true },
  // the boats (tools/make_boats.py, the owner's pictures): on the water only (mode 'sea'); vMax their dash (m/s)
  fac: { w: 129, h: 340, len: 11.0, wid: 3.73, ar: 'زورق هجوم سريع', en: 'FAC', hp: 110, sea: true, vMax: 22 },
  rktboat: { w: 111, h: 340, len: 12.0, wid: 3.43, ar: 'زورق صواريخ', en: 'RKT BOAT', hp: 110, sea: true, vMax: 20 },
  dhow: { w: 157, h: 440, len: 18.0, wid: 5.89, ar: 'قارب تهريب', en: 'DHOW', hp: 170, sea: true, vMax: 5 },
  patrol: { w: 124, h: 440, len: 16.0, wid: 3.98, ar: 'زورق دورية', en: 'PATROL', hp: 200, sea: true, vMax: 13 },
  lcm: { w: 171, h: 440, len: 25.0, wid: 9.02, ar: 'سفينة إنزال', en: 'LCM', hp: 260, sea: true, vMax: 6 },
  fishing: { w: 124, h: 340, len: 9.0, wid: 2.92, ar: 'قارب صيد', en: 'FISHING', hp: 80, sea: true, vMax: 5 },
};
// houses (tools/make_houses.py, the owner's Velmora houses, straight down): sprite size, real width and depth of the
// sprite's frame (the ruin's rubble in it too), the standing house's own footprint (fw x fl: what a blast is measured
// against), height (m)
const HOUSE = {
  house1: { w: 259, h: 201, wid: 10.8, len: 8.1, fw: 10.0, fl: 7.5, ht: 7.0, ar: 'بيت من طابقين', en: 'Two-storey house' },
  house2: { w: 401, h: 356, wid: 17.1, len: 15.1, fw: 16.0, fl: 14.2, ht: 4.0, ar: 'بيت بحوش', en: 'Courtyard house' },
  house3: { w: 211, h: 162, wid: 8.6, len: 6.4, fw: 8.0, fl: 5.9, ht: 3.5, ar: 'بيت حجري', en: 'Stone house' },
  house4: { w: 491, h: 402, wid: 21.2, len: 17.2, fw: 20.0, fl: 15.7, ht: 4.5, ar: 'مزرعة', en: 'Farm compound' },
  house5: { w: 527, h: 183, wid: 22.8, len: 7.3, fw: 22.0, fl: 6.5, ht: 3.5, ar: 'بيوت متلاصقة', en: 'Row houses' },
  house6: { w: 447, h: 439, wid: 19.2, len: 18.9, fw: 18.0, fl: 17.6, ht: 4.5, ar: 'مجمّع مسوّر', en: 'Walled compound' },
  house7: { w: 303, h: 190, wid: 12.7, len: 7.6, fw: 12.0, fl: 7.3, ht: 5.0, ar: 'مخزن', en: 'Storehouse' },
};

/* ===================== map tiles ===================== */
const LEVELS = [0, 1, 2, 3].map(L => { const w = W0 * 2 ** L, h = H0 * 2 ** L; return { L, nx: Math.ceil(w / TILE), ny: Math.ceil(h / TILE), w, h }; });
// the finest level this build carries: the web page drops level 3 of the Lanczos maps (a file cap), the app keeps it
const TOP_L = MAP.top ?? 3;
const tiles = new Map();
let tilesPending = 0;
function tileKey(L, x, y) { return L + '/' + x + '_' + y; }
function ensureTile(L, tx, ty, onload) {
  const k = tileKey(L, tx, ty);
  let t = tiles.get(k);
  if (t) { t.used = performance.now(); return t; }
  const lv = LEVELS[L], sc = 2 ** L;
  const pw = Math.min(TILE, lv.w - tx * TILE), ph = Math.min(TILE, lv.h - ty * TILE);
  t = { k, L, used: performance.now(), mesh: null, loaded: false, x0: tx * TILE / sc, y0: ty * TILE / sc, w: pw / sc, h: ph / sc };
  tiles.set(k, t);
  tilesPending++;
  decodeTile(MAP.dir + 'tiles/' + k + '.jpg', true).then(tx2 => {
    tilesPending--;
    if (tiles.get(k) !== t) { tileFree(tx2); return; }   // (gone, or asked for afresh since: not this one's)
    // (no mipmaps: the theatre is seen from the orbit, where a tile's pixels are about the screen's; the ZF-25's base,
    // where the canopy looks along the ground, is its own patch with its own: ABP. Mipmapped for that taxi view when the
    // base was in the theatre, the tiles were softer from 15,000 ft and each took longer to upload, a hitch apiece)
    // (enlarged smoothly: a DataTexture, the quartered tiles', is made to enlarge by the nearest texel)
    tx2.minFilter = tx2.magFilter = THREE.LinearFilter; tx2.generateMipmaps = false;
    tx2.wrapS = tx2.wrapT = THREE.ClampToEdgeWrapping;
    tileQueue.push({ t, tx2, L, onload });
  }, () => { tilesPending--; tiles.delete(k); });
  return t;
}
// A JPEG decoded on the main thread, then uploaded, stalls a frame for each 1024 px tile: the hitch when zooming in.
// So tiles are decoded off the main thread (createImageBitmap), and at most one a frame goes to the GPU and the map.
const tileQueue = [];
const bitmaps = typeof createImageBitmap === 'function' && typeof fetch === 'function';
// (quarters: the map's own tiles, sent a quarter a frame by pumpTiles; the country's and the base's whole, as before)
function decodeTile(url, quarters) {
  if (!bitmaps) return new Promise((ok, no) => loader.load(url, ok, undefined, no));
  return fetch(url).then(r => { if (!r.ok) throw new Error(url); return r.blob(); })
    .then(b => createImageBitmap(b, { imageOrientation: 'flipY' }))
    // (cut into quarters off the frame, each sent to the GPU in a frame of its own, tilePart: a whole 1024 px tile
    // sent at once had cost the frame 6-12 ms on the owner's iPhone, a frame lost at each while the sight slewed or
    // zoomed. The texture made empty first, its size the tile's; a small tile in one piece)
    .then(img => { const W = img.width, H = img.height;
      if (!quarters) { const t = new THREE.Texture(img); t.flipY = false; t.needsUpdate = true; return t; }
      const cut = W >= 512 && H >= 512 ? [[0, 0], [W >> 1, 0], [0, H >> 1], [W >> 1, H >> 1]].map(([x, y]) => [x, y, x ? W - x : W >> 1, y ? H - y : H >> 1]) : [[0, 0, W, H]];
      return Promise.allSettled(cut.map(([x, y, w, h]) => createImageBitmap(img, x, y, w, h).then(b => ({ b, x, y }))))
        .then(rs => {
          // (a quarter refused: the whole tile at once, as before, the quarters made let go)
          if (rs.some(r => r.status !== 'fulfilled')) { for (const r of rs) if (r.value) try { r.value.b.close(); } catch (_) {} const t = new THREE.Texture(img); t.flipY = false; t.needsUpdate = true; return t; }
          try { img.close(); } catch (_) {} const t = new THREE.DataTexture(null, W, H, THREE.RGBAFormat); t.parts = rs.map(r => r.value); t.flipY = false; t.needsUpdate = true; return t; }); })
    .catch(() => new Promise((ok, no) => loader.load(url, ok, undefined, no)));
}
// A map whose top stored level already holds all its picture's detail (MAP.mag: Wadi Seren, 0.42 m a pixel from a
// 0.72 m picture) is not stored again enlarged: past that level the GPU enlarges its tiles itself, Catmull-Rom (nine
// bilinear taps), from tiles sharpened for it when built (tools/make_ops.py). Matched against the stored enlargement it
// replaced, 38.7 dB: the same picture to the eye, 71 MB fewer, and fewer tiles held. Only while the sight is zoomed
// past that level (tileCubic); otherwise one plain tap.
const tileCubic = { value: 0 };
const TILE_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }';
const TILE_FS = `precision highp float; uniform sampler2D map; uniform vec2 ts; uniform float cubic; varying vec2 vUv;
  void main(){
    if (cubic < 0.5) { gl_FragColor = texture2D(map, vUv); return; }
    vec2 p = vUv / ts - 0.5, i = floor(p), f = p - i;
    vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f)), w1 = 1.0 + f * f * (-2.5 + 1.5 * f), w2 = f * (0.5 + f * (2.0 - 1.5 * f)), w3 = f * f * (-0.5 + 0.5 * f);
    vec2 w12 = w1 + w2, o12 = w2 / w12;
    vec2 t0 = (i - 0.5) * ts, t12 = (i + 0.5 + o12) * ts, t3 = (i + 2.5) * ts;
    vec4 c = (texture2D(map, vec2(t0.x, t0.y)) * w0.x + texture2D(map, vec2(t12.x, t0.y)) * w12.x + texture2D(map, vec2(t3.x, t0.y)) * w3.x) * w0.y
           + (texture2D(map, vec2(t0.x, t12.y)) * w0.x + texture2D(map, vec2(t12.x, t12.y)) * w12.x + texture2D(map, vec2(t3.x, t12.y)) * w3.x) * w12.y
           + (texture2D(map, vec2(t0.x, t3.y)) * w0.x + texture2D(map, vec2(t12.x, t3.y)) * w12.x + texture2D(map, vec2(t3.x, t3.y)) * w3.x) * w3.y;
    gl_FragColor = vec4(c.rgb, 1.0);
  }`;
function tileMat(tx2, L, w, h) {
  if (!MAP.mag || L !== TOP_L) return new THREE.MeshBasicMaterial({ map: tx2, depthTest: false, depthWrite: false });
  const m = new THREE.ShaderMaterial({ uniforms: { map: { value: tx2 }, ts: { value: new THREE.Vector2(1 / w, 1 / h) }, cubic: tileCubic }, vertexShader: TILE_VS, fragmentShader: TILE_FS, depthTest: false, depthWrite: false });
  m.map = tx2; return m;
}
// (a quarter of a tile into its texture; the binding three thinks it has put back)
function tilePart(tx, p) {
  const gl = renderer.getContext(), wt = renderer.properties.get(tx).__webglTexture;
  if (wt) { const tb = gl.getParameter(gl.TEXTURE_BINDING_2D); gl.bindTexture(gl.TEXTURE_2D, wt);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, p.x, p.y, gl.RGBA, gl.UNSIGNED_BYTE, p.b); gl.bindTexture(gl.TEXTURE_2D, tb); }
  try { p.b.close(); } catch (_) {}
}
const tileFree = tx2 => { if (tx2.parts) for (const p of tx2.parts) try { p.b.close(); } catch (_) {} if (tx2.image && tx2.image.close) { try { tx2.image.close(); } catch (_) {} } tx2.dispose(); };
// n: pieces sent to the GPU (a quarter of a tile, or a whole one decoded otherwise)
function pumpTiles(n) {
  for (let i = 0; i < n && tileQueue.length; i++) {
    const q = tileQueue[0], { t, tx2, L, onload } = q;
    if (tiles.get(t.k) !== t) { tileQueue.shift(); tileFree(tx2); i--; continue; }
    // (no longer asked for, a fast slew past it: not sent to the GPU, 4 MB and a stall for a tile out of sight, nor
    // counted against this frame's one; the current view's waited behind them)
    if (!t.pin && t.want != null && t.want < tileFrame - 4) { tileQueue.shift(); tiles.delete(t.k); tileFree(tx2); i--; continue; }
    if (tx2.parts) {
      if (!q.made) { q.made = true; q.k = 0; renderer.initTexture(tx2); }
      tilePart(tx2, tx2.parts[q.k++]); pfEv('tile');
      if (q.k < tx2.parts.length) continue;
      tx2.parts = null; tileQueue.shift();
    } else { tileQueue.shift(); renderer.initTexture(tx2); pfEv('tile'); }
    // on the GPU now: the decoded copy (4 MB a tile) is not needed in memory any more
    if (tx2.image && tx2.image.close) { try { tx2.image.close(); } catch (_) {} }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(t.w, t.h), tileMat(tx2, L, Math.round(t.w * 2 ** L), Math.round(t.h * 2 ** L)));
    m.position.set(t.x0 + t.w / 2, -(t.y0 + t.h / 2), 0);
    m.renderOrder = L;
    sceneA.add(m); t.mesh = m; t.loaded = true;
    onload && onload();
  }
}
function dropTile(t) { if (t.mesh) { sceneA.remove(t.mesh); t.mesh.material.map.dispose(); t.mesh.material.dispose(); t.mesh.geometry.dispose(); } tiles.delete(t.k); }
// (a tile asked for this frame is kept: the ask reaches 12% past the view, and those tiles out of sight, dropped when
// more than 26 were held, were asked for again the next frame. With the ZF-25's pod on its wide field that was a
// 1024 px JPEG fetched, decoded, sent to the GPU and thrown away every frame: most of the phone's heat)
// The map's tiles and, in the ZF-25, its base's six near quarters (ABP.near, 32 MB with their mipmaps, held only near
// the base) share one budget on the GPU: TEX_BUDGET MB. A tile is TILE_MB (1024 px, RGBA, no mipmaps). Past it, the
// tiles not asked for this frame and out of sight go, the longest unused first, to four tiles under it (so not every
// frame). 104 is the 26 tiles that were the only limit; near the base, tiles and quarters together had reached 136.
const TEX_BUDGET = 104, TILE_MB = 4;
let tileFrame = 0;
// (the view is turned, track-up: a tile in the corners of the box round it, outside the picture itself, is neither
// asked for nor drawn. The box alone had asked for 16 tiles where the picture touched 6 to 8, 64 MB held past the
// budget, and drawn them all under it)
function tileInView(x0, y0, w, h, m) {
  const v = S.view, hw = v.w / 2 * OVERSCAN * m, hh = v.h / 2 * OVERSCAN * m, dx = x0 + w / 2 - v.cx, dy = y0 + h / 2 - v.cy;
  return Math.abs(dx * v.R.x + dy * v.R.y) <= hw + (w * Math.abs(v.R.x) + h * Math.abs(v.R.y)) / 2
      && Math.abs(dx * v.D.x + dy * v.D.y) <= hh + (w * Math.abs(v.D.x) + h * Math.abs(v.D.y)) / 2;
}
function updateTiles(vx0, vy0, vx1, vy1) {
  tileFrame++;
  const dppm = (VW * PR) / S.view.w;
  const want0 = Math.ceil(Math.log2(Math.max(dppm, 1)) - 0.25), want = clamp(want0, 0, TOP_L);
  tileCubic.value = MAP.mag && want0 > TOP_L ? 1 : 0;
  // level 0 in view only where it is the finest level the zoom wants (want 0): zoomed in past it, level 1 covers it and
  // it may go. On a map with its whole picture (MAP.mini), only where that picture is twice too coarse for the zoom
  const mini0 = MAP.mini && dppm > 2 * 2048 / W0;
  const offMap = vx1 < 0 || vy1 < 0 || vx0 > W0 || vy0 > H0;   // (the view wholly out on the country: none of the map's tiles)
  for (let L = want === 0 && (!MAP.mini || mini0) ? 0 : 1; L <= want; L++) {
    if (L < want - 1 || offMap) continue;
    const sc = 2 ** L, lv = LEVELS[L];
    const mx = (vx1 - vx0) * 0.12, my = (vy1 - vy0) * 0.12;
    const a = clamp(Math.floor((vx0 - mx) * sc / TILE), 0, lv.nx - 1), b = clamp(Math.floor((vx1 + mx) * sc / TILE), 0, lv.nx - 1);
    const c = clamp(Math.floor((vy0 - my) * sc / TILE), 0, lv.ny - 1), d = clamp(Math.floor((vy1 + my) * sc / TILE), 0, lv.ny - 1);
    for (let y = c; y <= d; y++) for (let x = a; x <= b; x++) if (tileInView(x * TILE / sc, y * TILE / sc, TILE / sc, TILE / sc, 1.06)) ensureTile(L, x, y).want = tileFrame;
  }
  let count = 0;
  for (const t of tiles.values()) {
    // (level 0 the boot's tiles always; others while level 1 is not yet the zoom's, so once it is they may be dropped)
    const vis = t.x0 < vx1 && t.x0 + t.w > vx0 && t.y0 < vy1 && t.y0 + t.h > vy0 && (t.L === 0 || tileInView(t.x0, t.y0, t.w, t.h, 1.06)) && (t.L === 0 ? t.pin || want <= (MAP.mini ? 0 : 1) : t.L <= want + 1);
    if (t.mesh) t.mesh.visible = vis;
    if (vis) t.used = performance.now();
    if (!t.pin) count++;
  }
  const cap = Math.floor((TEX_BUDGET - (ABP && ABP.near ? ABP.nearMB : 0) - ctHeldMB() - (miniMesh ? 21 : 0)) / TILE_MB);
  if (count > cap) {
    // (a few frames' grace for what was asked for: the observer's film asks 24 times a second, the frames come at 60, and
    // its tiles had been dropped between two of its frames and fetched again, some 150 MB sent to the GPU a take)
    const old = [...tiles.values()].filter(t => !t.pin && t.loaded && !(t.want >= tileFrame - 4) && !(t.mesh && t.mesh.visible)).sort((p, q) => p.used - q.used);
    for (let i = 0; i < old.length && count > cap - 4; i++, count--) dropTile(old[i]);
  }
}

// far field: 6 x 6 km of terrain around the map (tools/make_farfield.py), under the map tiles.
// Seen through the canopy and at the wide picture's edges; mipmapped so the oblique cockpit view does not shimmer.
const FAR = MAP.far;
const farTiles = [];
let farAsked = false;
function loadFar() {
  // (the ZF-25 has the region's photo and its zoom-outs instead, below)
  // (nor a map with its country round it)
  if (farAsked || (JET && MAP.outer) || MAP.country) return; farAsked = true;
  const s = FAR.size / FAR.n, aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  for (let ty = 0; ty < FAR.n; ty++) for (let tx = 0; tx < FAR.n; tx++) { BOOT.total++; loader.load(MAP.dir + 'tiles/far/' + tx + '_' + ty + '.jpg', t => {
    BOOT.done++; BOOT.tex.push(t);
    t.anisotropy = aniso;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(s, s), new THREE.MeshBasicMaterial({ map: t, depthTest: false, depthWrite: false }));
    m.position.set(FAR.x0 + (tx + 0.5) * s, -(FAR.y0 + (ty + 0.5) * s), 0); m.renderOrder = -1;
    sceneA.add(m); farTiles.push(m);
  }, undefined, () => { BOOT.done++; }); }
}
// The country round an operations area (tools/make_country.py: Velmora, 200 x 200 km of Sentinel-2 at 10 m): in
// place of the far field, a pyramid of 512 px tiles, levels 0 (320 m a pixel) to 5 (10 m), held in rings round the
// aircraft: the finest within 2.5 km, each coarser one twice as far out, the coarsest whole. A tile is drawn as its four
// quarters, and a quarter is left out where the finer tile over it is in, so outside the map the ground is drawn once,
// not once a level. (Under the map itself the country is drawn too, once: the map's own tiles are held only where the
// sight looks, so the country is what fills the rest.) MAP.country: {dir, w (level 5 px), top (5), x0, y0 (map px of
// its corner), k (map px a level-5 px)}.
const CTRY = MAP.country || null, ctTiles = new Map(), ctQueue = [];
const CT_T = 512;
function ctLevel(L) { const s = 2 ** (CTRY.top - L), w = Math.ceil(CTRY.w / s); return { s, w, n: Math.ceil(w / CT_T), k: CTRY.k * s }; }
const CT_LV = CTRY ? [...Array(CTRY.top + 1).keys()].map(ctLevel) : [];
// a quarter's rect (map px), or null where an edge tile is short of it
function ctQuads(L, i, j) {
  const lv = CT_LV[L], q = [], h = CT_T / 2;
  for (let b = 0; b < 2; b++) for (let a = 0; a < 2; a++) {
    const px0 = i * CT_T + a * h, py0 = j * CT_T + b * h, px1 = Math.min(px0 + h, lv.w), py1 = Math.min(py0 + h, lv.w);
    q.push(px1 > px0 && py1 > py0 ? { px0, py0, px1, py1, x0: CTRY.x0 + px0 * lv.k, y0: CTRY.y0 + py0 * lv.k, x1: CTRY.x0 + px1 * lv.k, y1: CTRY.y0 + py1 * lv.k } : null);
  }
  return q;
}
function ctMesh(t, tex) {
  // the four quarters in one geometry; which are drawn is the front of its fixed index (ctShow). A missing quarter's
  // corners sit on the tile's own corner, so the bounds stay the tile's and the camera's culling works
  const pos = [], uv = [], lv = CT_LV[t.L], tw = Math.min(CT_T, lv.w - t.i * CT_T), th = Math.min(CT_T, lv.w - t.j * CT_T), q0 = t.q[0];
  for (const q of t.q) {
    const u0 = q ? (q.px0 - t.i * CT_T) / tw : 0, u1 = q ? (q.px1 - t.i * CT_T) / tw : 0, v0 = q ? 1 - (q.py0 - t.j * CT_T) / th : 0, v1 = q ? 1 - (q.py1 - t.j * CT_T) / th : 0;
    const x0 = (q || q0).x0, x1 = q ? q.x1 : q0.x0, y0 = -(q || q0).y0, y1 = q ? -q.y1 : -q0.y0;
    pos.push(x0, y0, 0, x1, y0, 0, x0, y1, 0, x1, y1, 0); uv.push(u0, v0, u1, v0, u0, v1, u1, v1);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(24), 1)); g.setDrawRange(0, 0);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, depthTest: false, depthWrite: false }));
  m.renderOrder = -3 + 0.1 * t.L; t.mask = -1; return m;
}
function ctShow(t, mask) {
  if (t.mask === mask) return; t.mask = mask;
  const ix = t.mesh.geometry.index, a = ix.array; let n = 0;
  for (let k = 0; k < 4; k++) if (mask & (1 << k)) { const o = k * 4; a[n++] = o; a[n++] = o + 2; a[n++] = o + 1; a[n++] = o + 1; a[n++] = o + 2; a[n++] = o + 3; }
  ix.needsUpdate = true; t.mesh.geometry.setDrawRange(0, n); t.mesh.visible = n > 0;
}
// (the finest level's ring: 2.5 km round the aircraft, a level's tile 5 km across, so at most 2 x 2 of each level are
// held, 22 or so tiles of 1 MB on the GPU in all; at 6 km it was 9 to 16 a level, 65 MB. They count against the map's
// own budget: ctHeldMB)
const CT_R = 2500 * PXM, CT_KEEP = 20000;
const ctFails = new Map();
let ctSig = '', ctDirty = false, ctCheck = 0, ctHeld = 0;
const ctHeldMB = () => Math.ceil(ctHeld);
const ctBoxes = [];
function updateCountry() {
  if (!CTRY) return;
  // the rings, as boxes of tile indices a level: the set of tiles wanted changes only when one of them does
  const c = planeGround(), a = S.aim; ctBoxes.length = 0; let sig = '';
  const box = (L, x, y, r) => { const lv = CT_LV[L], span = CT_T * lv.k;
    const i0 = Math.max(0, Math.floor((x - r - CTRY.x0) / span)), i1 = Math.min(lv.n - 1, Math.floor((x + r - CTRY.x0) / span));
    const j0 = Math.max(0, Math.floor((y - r - CTRY.y0) / span)), j1 = Math.min(lv.n - 1, Math.floor((y + r - CTRY.y0) / span));
    ctBoxes.push(L, i0, i1, j0, j1); sig += i0 + ',' + i1 + ',' + j0 + ',' + j1 + ';'; };
  // (the jet looks over the country from 15,000 ft: its glass sees 5-30 km out, where the 2.5 km rings left the
  // ground at 80 m a pixel; up there every ring 1.6 times wider: ~30 tiles, ~40 MB, against the budget as before)
  const rk = JET ? clamp((plane.alt - GROUND) / 2900, 1, 1.6) : 1;
  for (let L = 0; L <= CTRY.top; L++) box(L, c.x, c.y, L === 0 ? Infinity : CT_R * rk * 2 ** (CTRY.top - L));
  // (where the sight looks, some way off, in the seat's TEDAC too: its own small ring of the finest)
  // (as wide as the sight's view, and a coarser ring round it: far out on the country the view's corners kept level 1)
  const vw_ = baseViewW() / (S.zoom || 1), ra = Math.max(1500 * PXM, Math.hypot(vw_, vw_ * VH / VW) / 2);
  box(CTRY.top, a.x, a.y, ra); box(CTRY.top - 1, a.x, a.y, ra * 2);
  const now = performance.now();
  if (sig !== ctSig) {
    ctSig = sig; ctDirty = true;
    for (const t of ctTiles.values()) t.want = false;
    for (let b = 0; b < ctBoxes.length; b += 5) {
      const L = ctBoxes[b];
      for (let j = ctBoxes[b + 3]; j <= ctBoxes[b + 4]; j++) for (let i = ctBoxes[b + 1]; i <= ctBoxes[b + 2]; i++) {
        const k = L + '/' + i + '_' + j; let t = ctTiles.get(k);
        if (!t) {
          t = { k, L, i, j, q: ctQuads(L, i, j), mesh: null, failed: 0, want: true, since: now };
          ctTiles.set(k, t);
          const tt = t;
          decodeTile(CTRY.dir + k + '.jpg').then(tx2 => {
            // (dropped meanwhile, or dropped and asked for again as a new tile: this one is not wanted)
            if (ctTiles.get(tt.k) !== tt) { if (tx2.image && tx2.image.close) { try { tx2.image.close(); } catch (_) {} } tx2.dispose(); return; }
            // (the 512 px levels mipmapped: seen along the ground through the canopy, unmipped they sparkled; a third more
            // memory each, counted in ctHeld. Edge tiles, short of 512 px, not powers of two: plain)
            const lv = CT_LV[tt.L], mip = tt.L >= 2 && (tt.i + 1) * CT_T <= lv.w && (tt.j + 1) * CT_T <= lv.w; tx2.minFilter = mip ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter; tx2.generateMipmaps = mip; tt.mb = mip ? 4 / 3 : 1;
            tx2.wrapS = tx2.wrapT = THREE.ClampToEdgeWrapping; ctQueue.push({ t: tt, tx2 });
          }, () => { tt.failed = performance.now(); });
        }
        t.want = true;
      }
    }
    for (const t of ctTiles.values()) if (!t.want && !t.gone) t.gone = now; else if (t.want) t.gone = 0;
  }
  // tiles no longer wanted go after a few seconds (a turn in the orbit brings them back); looked at twice a second
  if (now - ctCheck > 500) {
    ctCheck = now;
    for (const t of ctTiles.values()) {
      // (a tile that failed is asked for again after ten seconds, twice at most: a passing network fault is not for the
      // session, and a tile that is not there (off the country's edge, or a pyramid cut short) is not asked for forever)
      const retry = t.failed && now - t.failed > 10000 && (ctFails.get(t.k) || 0) < 2;
      if (retry) ctFails.set(t.k, (ctFails.get(t.k) || 0) + 1);
      if (retry || (!t.want && t.gone && now - t.gone > CT_KEEP)) {
        if (t.mesh) { sceneA.remove(t.mesh); t.mesh.material.map.dispose(); t.mesh.material.dispose(); t.mesh.geometry.dispose(); ctHeld -= t.mb || 1; if (t.L === 0) ctL0--; }
        ctTiles.delete(t.k); ctDirty = true; if (retry) ctSig = '';
      }
    }
  }
  if (!ctDirty) return;
  ctDirty = false;
  // each quarter: drawn unless the finer tile over it is in and wanted
  for (const t of ctTiles.values()) {
    if (!t.mesh) continue;
    let mask = 0;
    for (let n = 0; n < 4; n++) {
      if (!t.q[n]) continue;
      const ch = t.L < CTRY.top && ctTiles.get((t.L + 1) + '/' + (2 * t.i + (n & 1)) + '_' + (2 * t.j + (n >> 1)));
      if (ch && ch.mesh && ch.want) continue;
      mask |= 1 << n;
    }
    ctShow(t, mask);
  }
}
function pumpCountry() {
  const e = ctQueue.shift(); if (!e) return;
  const { t, tx2 } = e;
  if (ctTiles.get(t.k) !== t || !t.want) { if (tx2.image && tx2.image.close) { try { tx2.image.close(); } catch (_) {} } tx2.dispose(); if (ctTiles.get(t.k) === t) ctTiles.delete(t.k); return; }
  renderer.initTexture(tx2); pfEv('ctile'); if (tx2.image && tx2.image.close) { try { tx2.image.close(); } catch (_) {} }
  t.mesh = ctMesh(t, tx2); sceneA.add(t.mesh); ctShow(t, 0); ctHeld += t.mb || 1; ctDirty = true; if (t.L === 0) ctL0++;
}
// the country's coarsest level all in: it covers every view, and the far haze under it need not be drawn
let ctL0 = 0;
const ctWhole = () => !!CTRY && ctL0 === CT_LV[0].n * CT_LV[0].n;
// A big map's whole picture in one image (MAP.mini: Wadi Seren, Silak, 2048 px, about 2.15 m a pixel), under its tiles:
// what a small screen's sight shows zoomed out, and on any screen past the tiles in reach, what the canopy shows of the
// map, and the menu's map. Only the tiles the sight zooms into are loaded over it.
let miniMesh = null;
function loadMini() {
  if (!MAP.mini) return;
  BOOT.total++;
  loader.load(MAP.dir + MAP.mini, t => { BOOT.done++; BOOT.tex.push(t); t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    miniMesh = new THREE.Mesh(new THREE.PlaneGeometry(W0, H0), new THREE.MeshBasicMaterial({ map: t, depthTest: false, depthWrite: false }));
    miniMesh.position.set(W0 / 2, -H0 / 2, 0); miniMesh.renderOrder = -0.6; sceneA.add(miniMesh); }, undefined, () => { BOOT.done++; });
}
// beyond the far field: flat ground in the terrain's mean colour, lost in the haze (cockpit view only)
const farHaze = new THREE.Mesh(new THREE.PlaneGeometry(80000, 80000), new THREE.MeshBasicMaterial({ color: MAP.ground, depthTest: false, depthWrite: false }));
farHaze.position.set(W0 / 2, -H0 / 2, 0); farHaze.renderOrder = MAP.country ? -4 : -2; farHaze.visible = false; sceneA.add(farHaze);
// The ZF-25 sees tens of kilometres. Over the theatre and round it, the region's photo and the generator's three
// zoom-outs of it (tools/make_region.py: 4.4, 8.3, 16.6 and 33 km across), each under the one inside it, all under the
// map; each picture fades at its edge into the next one out, so they are simply stacked, opaque. Past the last, a
// soft copy of it in mirror copies to the horizon, in place of the flat ground (so the sea stays sea). The two
// outermost and the mirror copies are drawn for the canopy only: the pod never looks past 8 km of the theatre.
// (Without the zoom-outs: the far field, then the desert in large soft patches of sand and darker rock, a small noise
// texture made here and repeated every 6 km, in the far field's own colour.)
const REGION = [], REGION_WIN = [];
if (JET) {
  // (16 samples along the slant, not 8: seen from a final at 250 m some 2 km out, a screen pixel runs a dozen of the
  // picture's along the line of sight, and at 8 the dunes ran into streaks; only the most slanted pixels pay for it)
  const aniso = Math.min(16, renderer.capabilities.getMaxAnisotropy());
  [['region', MAP.region], ...(MAP.outer || []).map((g, i) => ['outer' + (i + 1), g])].forEach(([f, g], i) => {
    if (!g) return;
    const t = texM(MAP.dir + 'tiles/' + f + '.jpg'); t.anisotropy = aniso;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(g.size, g.size), new THREE.MeshBasicMaterial({ map: t, depthTest: false, depthWrite: false }));
    // (its turn is in the picture's axes, y down: the same number turns it the other way here, y up)
    m.position.set(g.cx, -g.cy, 0); m.rotation.z = g.rot; m.renderOrder = -0.5 - 0.1 * i; sceneA.add(m);
    if (i >= 2) { m.visible = false; REGION_WIN.push(m); }
    REGION.push({ g, t });
  });
}
if (JET && MAP.outer) {
  // (mirrored nine times across, 350 km: the middle copy, the fifth, is the right way round; the horizon at 25,000 ft
  // is 150 km out, and the ground the haze has not yet taken reaches some 100 km)
  const g = MAP.outer[MAP.outer.length - 1], t = tex(MAP.dir + 'tiles/outer_far.jpg'), nm = 9;
  t.wrapS = t.wrapT = THREE.MirroredRepeatWrapping;
  // (no mipmaps, tex not texM: the picture is soft already, and seen this flat its small levels, the whole picture in
  // a few texels, mixed the land into the sea, a paler band past the last picture's edge)
  // a copy to a segment, its picture by uv in copies (mirrored past each edge); west of the middle copy only the
  // picture's open-sea strip (MAP.outerSea of its width, tools/make_region.py calm_sea), there and back: the sea to
  // the horizon, not the coast mirrored back into it 33 km out
  const geo = new THREE.PlaneGeometry(nm * g.size, nm * g.size, nm, nm), uv = geo.attributes.uv, mid = (nm - 1) / 2, us = MAP.outerSea || 0;
  for (let i = 0; i < uv.count; i++) { const c = i % (nm + 1), r = Math.floor(i / (nm + 1)); uv.setXY(i, us && c < mid ? mid + us * ((mid - c) % 2) : c, nm - r); }
  farHaze.geometry.dispose(); farHaze.geometry = geo;
  farHaze.position.set(g.cx, -g.cy, 0); farHaze.rotation.z = g.rot;
  farHaze.material.map = t; farHaze.material.color.setHex(0xffffff); farHaze.material.needsUpdate = true;
  REGION.push({ g, t, mirror: nm });
} else if (JET) {
  const n = 256, cv = document.createElement('canvas'); cv.width = cv.height = n; const x = cv.getContext('2d'), im = x.createImageData(n, n);
  let sd = 9; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647, oct = [];
  for (let o = 0; o < 5; o++) { const k = 4 << o, g = new Float32Array(k * k); for (let i = 0; i < g.length; i++) g[i] = rnd(); oct.push([k, g]); }
  const at = (k, g, u, v) => { const x0 = Math.floor(u * k), y0 = Math.floor(v * k), fx = u * k - x0, fy = v * k - y0, q = (a, b) => g[((b % k + k) % k) * k + ((a % k + k) % k)], s2 = t => t * t * (3 - 2 * t);
    return lerp(lerp(q(x0, y0), q(x0 + 1, y0), s2(fx)), lerp(q(x0, y0 + 1), q(x0 + 1, y0 + 1), s2(fx)), s2(fy)); };
  const c0 = new THREE.Color(MAP.ground);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let v = 0, w = 0; oct.forEach(([k, g], o) => { const a = 1 / Math.pow(1.8, o); v += at(k, g, i / n, j / n) * a; w += a; }); v = clamp((v / w - 0.5) * 2.2 + 0.5, 0, 1);
    const l = 1.12 - 0.45 * v, p = (j * n + i) * 4;
    im.data[p] = clamp(c0.r * 255 * l, 0, 255); im.data[p + 1] = clamp(c0.g * 255 * l, 0, 255); im.data[p + 2] = clamp(c0.b * 255 * l, 0, 255); im.data[p + 3] = 255;
  }
  x.putImageData(im, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(80000 * MPP / 6000, 80000 * MPP / 6000);
  farHaze.material.map = t; farHaze.material.color.setHex(0xffffff); farHaze.material.needsUpdate = true;
}

/* ===================== particle layers (one draw call each) ===================== */
// Particles are flat on the ground for the sensor, which looks straight down. Through the canopy (bill = 1) the same
// particles stand upright facing the eye (right = the camera's horizontal right, up = world up), sit on the ground
// (lifted by lift × their height) and rise to their height aZ: smoke columns, fireballs and dust are seen side-on.
const LAYER_VS = `
  attribute vec2 aPos; attribute vec2 aScale; attribute float aRot; attribute vec4 aColor; attribute float aCell; attribute float aZ;
  uniform float cells, bill, lift, bsz; uniform vec3 camR; varying vec2 vUv; varying vec4 vColor;
  void main(){
    // side-on, a plume is a volume: its billowing body reads larger than the footprint the sensor sees from above
    vec2 p = position.xy * aScale * (bill > 0.5 ? bsz : 1.0); float c = cos(aRot), s = sin(aRot);
    p = vec2(c * p.x - s * p.y, s * p.x + c * p.y);
    vec3 w = bill > 0.5
      ? vec3(aPos.x, -aPos.y, aZ + lift * aScale.y * bsz) + camR * p.x + vec3(0.0, 0.0, p.y)
      : vec3(vec2(aPos.x, -aPos.y) + p, 0.0);
    gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
    float cx = mod(aCell, cells), cy = floor(aCell / cells);
    vUv = (uv + vec2(cx, cells - 1.0 - cy)) / cells; vColor = aColor;
  }`;
const LAYER_FS = `
  precision mediump float; uniform sampler2D map; uniform float amul; varying vec2 vUv; varying vec4 vColor;
  void main(){ vec4 t = texture2D(map, vUv); gl_FragColor = vec4(t.rgb * vColor.rgb, t.a * vColor.a * amul); }`;
// a particle's growth over its life: eased out (cubic), linear, or a burst (most of its size at once, as a blast cloud)
const layerEase = (p, k) => p.ease === 'lin' ? k : p.ease === 'burst' ? 1 - Math.pow(1 - k, 6) : 1 - (1 - k) * (1 - k) * (1 - k);
// A particle of one shape: every field update reads, set in one order. Spawned as dozens of object literals each with
// its own fields, every read in the update had gone the slow generic way and every number written a new box: 0.9 ms
// and some 490 kB a frame in a fight, measured (0.36 ms and nothing so)
class Part { constructor(p) { this.t = 0; this.life = p.life; this.x = p.x; this.y = p.y; this.z = p.z || 0; this.vx = p.vx; this.vy = p.vy; this.vz = p.vz || 0;
  this.grav = !!p.grav; this.rise = p.rise || 0; this.riseT = p.riseT || 0; this.wind = p.wind || 0; this.drag = p.drag; this.rot = p.rot; this.vr = p.vr;
  this.s0 = p.s0; this.s1 = p.s1; this.sx = p.sx; this.a0 = p.a0; this.a1 = p.a1; this.fadeIn = p.fadeIn || 0; this.fade = p.fade || ''; this.fix = !!p.fix;
  this.ease = p.ease || ''; this.cell = p.cell; this.c0 = p.c0; this.c1 = p.c1; this.mark = !!p.mark; } }
class Layer {
  constructor(scene, texture, max, blending, cells, order) {
    this.max = max; this.parts = []; this.tr = 0; this.cells = cells || 1; this.n = 0; this.sent = -1;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = this.geo = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position); g.setAttribute('uv', base.attributes.uv);
    const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = mk(2); this.aScale = mk(2); this.aRot = mk(1); this.aColor = mk(4); this.aCell = mk(1); this.aZ = mk(1);
    g.setAttribute('aZ', this.aZ);
    g.setAttribute('aPos', this.aPos); g.setAttribute('aScale', this.aScale); g.setAttribute('aRot', this.aRot); g.setAttribute('aColor', this.aColor); g.setAttribute('aCell', this.aCell);
    g.instanceCount = 0;
    const mat = new THREE.ShaderMaterial({ uniforms: { map: { value: texture }, cells: { value: cells || 1 }, amul: { value: 1 }, bill: { value: 0 }, lift: { value: 0.45 }, bsz: { value: 1 }, camR: { value: new THREE.Vector3(1, 0, 0) } }, vertexShader: LAYER_VS, fragmentShader: LAYER_FS, transparent: true, depthTest: false, depthWrite: false, blending });
    this.mesh = new THREE.Mesh(g, mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = order || 0; scene.add(this.mesh);
  }
  spawn(p) {
    if (this.parts.length >= this.max - 40) return null;
    p.t = 0; p.vx = p.vx || 0; p.vy = p.vy || 0; p.rot = p.rot == null ? Math.random() * 6.283 : p.rot; p.vr = p.vr || 0;
    p.sx = p.sx || 1; p.cell = this.cells === 1 ? 0 : p.cell == null ? Math.floor(Math.random() * 4) : p.cell; p.a1 = p.a1 || 0; p.drag = p.drag || 0;
    if (!p.c1) p.c1 = p.c0;
    p = new Part(p); this.parts.push(p); return p;
  }
  begin() { this.tr = 0; }
  put(x, y, w, h, rot, r, g, b, a, cell, z) {
    const i = this.n; if (i >= this.max) return; this.n++;
    this.aZ.array[i] = z || 0;
    this.aPos.array[2 * i] = x; this.aPos.array[2 * i + 1] = y;
    this.aScale.array[2 * i] = w; this.aScale.array[2 * i + 1] = h;
    this.aRot.array[i] = rot; this.aCell.array[i] = cell || 0;
    const c = this.aColor.array; c[4 * i] = r; c[4 * i + 1] = g; c[4 * i + 2] = b; c[4 * i + 3] = a;
  }
  update(dt) {
    this.n = 0;
    const P = this.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) { P[i] = P[P.length - 1]; P.pop(); continue; }
      if (p.grav) { p.vz -= 9.8 * dt; p.z += p.vz * dt; if (p.z <= 0) { p.z = 0; p.vz = 0; p.vx *= 0.2; p.vy *= 0.2; p.grav = false; } }
      else if (p.vz) p.z = (p.z || 0) + p.vz * dt;
      // buoyant smoke and fire climb, slowing as they cool: height (m) = rise · τ · (1 − e^(−t/τ))
      const zr = p.rise ? p.rise * (p.riseT || 6) * (1 - Math.exp(-p.t / (p.riseT || 6))) : 0;
      if (p.wind) { p.vx += (WIND.x * p.wind - p.vx) * 0.6 * dt; p.vy += (WIND.y * p.wind - p.vy) * 0.6 * dt; }
      const dr = Math.max(0, 1 - p.drag * dt); p.vx *= dr; p.vy *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      let s = lerp(p.s0, p.s1, layerEase(p, k));
      if (p.z && !p.fix) s *= 1 + p.z / 30;
      let a = lerp(p.a0, p.a1, p.fade === 'late' ? Math.max(0, (k - 0.6) / 0.4) : k);
      if (p.fadeIn && p.t < p.fadeIn) a *= p.t / p.fadeIn;
      const c0 = p.c0, c1 = p.c1;
      this.put(p.x, p.y, s, s * p.sx, p.rot, lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k), a, p.cell, ((p.z || 0) + zr) * PXM);
    }
  }
  // (only the instances in use go to the GPU, and nothing when the layer was and stays empty: every layer sent its
  // whole buffer each frame, some 250 kB a frame for nine layers mostly empty)
  flush() {
    this.geo.instanceCount = this.n;
    this.mesh.material.visible = this.n > 0;   // (an empty layer no draw call at all: three.js still issued one of nothing)
    if (this.n === 0 && this.sent === 0) return;
    for (const a of [this.aPos, this.aScale, this.aRot, this.aColor, this.aCell, this.aZ]) { a.updateRange.offset = 0; a.updateRange.count = this.n * a.itemSize; a.needsUpdate = true; }
    this.sent = this.n;
  }
  clear() { this.parts.length = 0; }
}
const smokeL = new Layer(sceneA, T.smoke, 700, THREE.NormalBlending, 2, 40);
let DUST_K = 1;
const fireL = new Layer(sceneE, T.fire, 260, THREE.AdditiveBlending, 2, 1);
const glowE = new Layer(sceneE, T.glow, 260, THREE.AdditiveBlending, 1, 2);
const lightL = new Layer(sceneL, T.glow, 120, THREE.AdditiveBlending, 1, 1);
// The canopy view's own blast: what an explosion looks like from the side, a couple of km out. The sensor's
// effects are made for looking straight down; these two layers are drawn only through the glass (upright, rising).
const plumeW = new Layer(sceneA, T.smoke, 400, THREE.NormalBlending, 2, 41);   // (400: several blasts, their rings, a marker's smoke and the wrecks at once)
const fireW = new Layer(sceneE, T.fire, 120, THREE.AdditiveBlending, 2, 3);
// points of light through the glass (tracers, flares, a missile's motor): a hard glow, no flame shape
const glowW = new Layer(sceneE, T.glow, 400, THREE.AdditiveBlending, 1, 4);
for (const l of [plumeW, fireW, glowW]) { l.mesh.visible = false; l.mesh.material.uniforms.bill.value = 1; l.mesh.material.uniforms.lift.value = 0.4; }
// Sizes are what a real blast does, not the sensor's small top-down puffs: a Rumh's flash and fireball tens of
// metres across, its dust and smoke 50-70 m wide and climbing past 100 m within ten seconds, leaning downwind.
function windowBlast(x, y, k) {
  const m = PXM, q = Math.sqrt(k);
  if (k < 0.2) {
    // a 30 mm round: a spark and a puff of dust
    fireW.spawn({ x, y, life: 0.14, s0: 8 * m, s1: 10 * m, a0: 1, a1: 0, c0: [1, 0.9, 0.7], cell: 0, rot: 0, ease: 'lin' });
    for (let i = 0; i < 2; i++) plumeW.spawn({ x: x + rand(-1, 1) * m, y: y + rand(-1, 1) * m, wind: 0.6, life: rand(2, 3), s0: 4 * m, s1: rand(12, 16) * m, a0: 0.75, a1: 0, c0: [0.62, 0.56, 0.46], c1: [0.72, 0.68, 0.6], rise: 4, riseT: 1.2 });
    return;
  }
  // the flash (a few frames: a cased bomb's is over in well under a tenth of a second), then the fireball, short and
  // low, dull orange going to soot within half a second (the detonation's products burn out fast; no lingering ball)
  fireW.spawn({ x, y, life: 0.08, s0: 30 * q * m, s1: 42 * q * m, a0: 1, a1: 0, c0: [1, 0.96, 0.85], cell: 0, rot: 0, ease: 'lin' });
  for (let i = 0; i < 6; i++) fireW.spawn({ x: x + rand(-4, 4) * q * m, y: y + rand(-4, 4) * q * m, life: rand(0.35, 0.6) * (0.6 + 0.4 * q), s0: 10 * q * m, s1: rand(20, 28) * q * m,
    a0: 1, a1: 0, c0: [1, 0.78, 0.45], c1: [0.35, 0.12, 0.04], rise: rand(8, 15) * q, riseT: 0.5, vr: rand(-1, 1) });
  // the dust dome thrown up by the blast, then climbing and leaning downwind
  for (let i = 0; i < 12; i++) plumeW.spawn({ x: x + rand(-10, 10) * q * m, y: y + rand(-10, 10) * q * m, wind: 0.9, drag: 0.4, life: rand(9, 14), s0: 18 * q * m, s1: rand(55, 70) * q * m,
    a0: 0.85, a1: 0, c0: [0.7, 0.63, 0.52], c1: [0.76, 0.71, 0.62], rise: rand(10, 20) * q, riseT: 5, vr: rand(-0.2, 0.2) });
  // the explosive's dark smoke at the core, climbing highest
  for (let i = 0; i < 7; i++) plumeW.spawn({ x: x + rand(-5, 5) * q * m, y: y + rand(-5, 5) * q * m, wind: 1.0, drag: 0.3, life: rand(10, 15), s0: 14 * q * m, s1: rand(45, 60) * q * m,
    a0: 0.85, a1: 0, c0: [0.16, 0.14, 0.12], c1: [0.46, 0.44, 0.41], rise: rand(18, 28) * q, riseT: 6, vr: rand(-0.2, 0.2) });
  // a low skirt of dust running out along the ground
  for (let i = 0; i < 10; i++) { const a = rand(0, 6.28); plumeW.spawn({ x: x + Math.cos(a) * 8 * q * m, y: y + Math.sin(a) * 8 * q * m, vx: Math.cos(a) * 18 * q * m, vy: Math.sin(a) * 18 * q * m, drag: 1.5, wind: 0.5,
    life: rand(4, 6), s0: 12 * q * m, s1: rand(35, 50) * q * m, sx: 0.4, a0: 0.75, a1: 0, c0: [0.66, 0.6, 0.5], c1: [0.74, 0.7, 0.62], rise: 1, riseT: 2 }); }
  // (last: when the layer is full it is the ring that waits, not the core's smoke)
  // the shock running out over the ground: a fast low ring of dust, hundreds of metres a second, gone in under a second
  for (let i = 0; i < 14; i++) { const a = i / 14 * 6.283 + rand(-0.15, 0.15), sp = rand(150, 250) * q * m;
    plumeW.spawn({ x: x + Math.cos(a) * 4 * q * m, y: y + Math.sin(a) * 4 * q * m, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, drag: 3, life: 0.8, s0: 6 * q * m, s1: rand(20, 30) * q * m, sx: 0.35,
      a0: 0.6, a1: 0, c0: [0.74, 0.68, 0.57], c1: [0.78, 0.74, 0.66], rise: 0.5, riseT: 1 }); }
}
// a burning wreck as seen through the glass: a column of dark smoke climbing a couple of hundred metres and bending
// downwind, and the flames at its foot
function windowWreck(e, dt) {
  const v = e.v, life = 1 - e.t / e.dur;
  e.accW = (e.accW || 0) + dt * 1.4 * life;
  while (e.accW >= 1) {
    e.accW -= 1;
    const g = rand(0.1, 0.17);
    plumeW.spawn({ x: v.x + rand(-2, 2) * PXM, y: v.y + rand(-2, 2) * PXM, wind: 2.2, drag: 0.1, life: rand(14, 20), s0: 10 * PXM, s1: rand(40, 60) * PXM,
      a0: 0.6 * life + 0.15, a1: 0, c0: [g, g * 0.95, g * 0.9], c1: [0.45, 0.44, 0.42], rise: rand(9, 13), riseT: 20, vr: rand(-0.2, 0.2), fadeIn: 0.4 });
    if (e.t < e.fireFor) fireW.spawn({ x: v.x + rand(-2, 2) * PXM, y: v.y + rand(-2, 2) * PXM, life: rand(0.7, 1.1), s0: 6 * PXM, s1: rand(12, 18) * PXM, a0: 0.9, a1: 0, c0: [1, 0.72, 0.38], c1: [0.7, 0.2, 0.04], rise: 6, riseT: 0.6 });
  }
}
const coneL = new Layer(sceneL, T.cone, 60, THREE.AdditiveBlending, 1, 2);
const heatL = new Layer(sceneH, T.glow, 900, THREE.AdditiveBlending, 1, 1);
// thermal silhouette: the sprite's alpha only, written as (hot, cold) into the heat target
function heatMat(map) {
  return new THREE.ShaderMaterial({ uniforms: { map: { value: map }, col: { value: new THREE.Vector3(0, 0, 0) } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'precision mediump float; uniform sampler2D map; uniform vec3 col; varying vec2 vUv; void main(){ gl_FragColor = vec4(col, texture2D(map, vUv).a); }',
    transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
}
// a ruin on the thermal: the rubble hardly warmer than the ground about it, its embers the hot spots (a few patches
// across the footprint, each ruin its own); col.x the rubble, col.y the embers, both cooling (ruinHeat). w, h: the
// plane's size, for where on it a fragment is (its uv may be into an atlas)
// (fw, fh: the building's own footprint, when the overlay reaches past it with rubble: the hot spots are placed and
// sized in the footprint's frame, so they stay on the building, not on the clear corners of a long overlay)
function ruinHeatMat(map, w, h, fw = w, fh = h) {
  return new THREE.ShaderMaterial({ uniforms: { map: { value: map }, col: { value: new THREE.Vector3(0, 0, 0) }, sz: { value: new THREE.Vector2(w, h) }, sd: { value: new THREE.Vector2(Math.random(), Math.random()) }, fs: { value: new THREE.Vector2(Math.min(1, fw / w), Math.min(1, fh / h)) } },
    vertexShader: 'uniform vec2 sz; varying vec2 vUv, vP; void main(){ vUv = uv; vP = position.xy / sz + 0.5; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: 'precision mediump float; uniform sampler2D map; uniform vec3 col; uniform vec2 sd, fs; varying vec2 vUv, vP; void main(){ float s = 0.0;' +
      ' for (int i = 1; i <= 5; i++) { vec2 f = fract(sd + vec2(0.618, 0.382) * float(i)); vec2 c = 0.5 + (0.6 * f - 0.3) * fs; float r = 0.07 + 0.06 * fract(f.x * 7.31 + sd.y); vec2 d = (vP - c) / fs; s += exp(-dot(d, d) / (r * r)); }' +
      ' gl_FragColor = vec4(col.x + col.y * min(s, 1.0), 0.0, 0.0, texture2D(map, vUv).a); }',
    transparent: true, blending: THREE.AdditiveBlending, depthTest: false, depthWrite: false });
}
// the boats' wakes: white water spreading behind them, flat on the sea in the canopy too (not among the layers that
// stand up toward the eye), under the boats and their shadows
const wakeL = new Layer(sceneA, T.smoke, 500, THREE.NormalBlending, 2, 19);
const LAYERS = [smokeL, fireL, glowE, lightL, coneL, heatL, plumeW, fireW, glowW, wakeL];

