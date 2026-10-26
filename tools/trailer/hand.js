// The gunner's hands for the trailer (tools/trailer/rig.cjs puts this in the game's page): the WebXR generic hands
// (assets/hand-*.glb, MIT, Amazon) dressed as an Army aviator's: sage Nomex flight gloves with goatskin palms and
// fingertip pads, the gloves' long gauntlets over the flight suit's sleeves, the whole arm hung from the shoulder.
// Drawn on a canvas of their own over the cockpit.
//
// Each hand has a timeline of keyframes on the trailer's clock: the fingertip's point on the cockpit photo (photo
// pixels, so it stays on its key as the head moves), its distance off the panel (metres toward the eye; 0 touching,
// below 0 pushing in) and its pose ('point': the index out, the rest curled; 'grip': round the TEDAC's hand grip, `sq`
// the trigger finger squeezing). Between keys the fingertip moves as a hand does: a minimum-jerk path that lifts off
// the panel in an arc; the hand follows that through a spring (the arm's mass: a little overshoot, then it settles),
// shakes with the airframe and lags its accelerations, and the finger's pad gives as it presses. The elbow is solved
// from the shoulder (two-bone IK), so the forearm and sleeve come up from the seat as an arm would.
//   window.__hand.reach(side, T, x, y)   the index comes to key (x, y) and presses it at trailer time T
//   window.__hand.grip(side, T, x, y)    the hand takes the grip at (x, y) by T; .squeeze(side, T) pulls the trigger at T;
//                                        .hold(side, T, x, y) is there already
//   window.__hand.away(side, T)          back down out of view, from T
//   window.__hand.frame(vt)              draw for trailer time vt (the rig calls it after each frame)
(function () {
  const g = window.__saqr, CK = g.CK;
  // the photo's projection: pixels per radian at lean 1 (24 mm lens, 53.1° vertical over the photo's 941 rows); the
  // panel's keys about 0.62 m from the eye (the front seat is close: the TEDAC's keys are some 2 cm apart)
  const FOC = CK.IH / 2 / Math.tan(53.1 * Math.PI / 360), PANEL = 0.62;
  const REST = { R: { x: 1420, y: 1300 }, L: { x: 260, y: 1300 } };
  // the arm, eye-centred metres (x right, y up, z back toward the seat): the shoulders and the bones' lengths
  const SHOULDER = { R: [0.2, -0.3, 0.06], L: [-0.2, -0.3, 0.06] }, UPPER = 0.31, FORE = 0.28;
  const cv = document.createElement('canvas');
  // (a touch soft: the eye is focused on the panel beyond, and the hand is close)
  cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2147483000;filter:blur(0.35px)';
  document.body.appendChild(cv);
  const rnd = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, premultipliedAlpha: false });
  rnd.setPixelRatio(window.devicePixelRatio || 1); rnd.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.01, 10);
  // the light in the seat at night: the screens' green glow from in front and below, their rim from the side, a dim
  // flood from above and behind, and the valley's light through the canopy (a flare, a blast)
  scene.add(new THREE.AmbientLight(0x1c2620, 0.3));
  const glow = new THREE.DirectionalLight(0x5cf08c, 0.9); glow.position.set(0.15, -0.45, -1); scene.add(glow);
  const rim = new THREE.DirectionalLight(0x7dffb0, 0.7); rim.position.set(-0.6, 0.1, -0.8); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x8a9a90, 0.32); fill.position.set(-0.5, 0.9, 0.5); scene.add(fill);
  const outside = new THREE.DirectionalLight(0xfff0d8, 0); outside.position.set(0, 0.8, -1); scene.add(outside);

  /* ---- the cloth ---- */
  const rand = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  // a height field drawn on a canvas, made into a normal map (Nomex knit: fine ribs)
  function normalMap(n, height) {
    const h = new Float32Array(n * n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) h[y * n + x] = height(x, y);
    const c = document.createElement('canvas'); c.width = c.height = n; const x2 = c.getContext('2d'), d = x2.createImageData(n, n);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const hx = h[y * n + (x + 1) % n] - h[y * n + (x + n - 1) % n], hy = h[((y + 1) % n) * n + x] - h[((y + n - 1) % n) * n + x];
      const l = Math.hypot(hx, hy, 1), i = 4 * (y * n + x);
      d.data[i] = (-hx / l * 0.5 + 0.5) * 255; d.data[i + 1] = (-hy / l * 0.5 + 0.5) * 255; d.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; d.data[i + 3] = 255;
    }
    x2.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  const knit = normalMap(256, (x, y) => 0.6 * Math.sin(x * Math.PI / 2) * Math.cos(y * Math.PI / 3) + 0.25 * Math.sin((x + y) * 0.7) + 0.15 * rand());
  knit.repeat.set(14, 14);
  // the glove: one mesh, its colours per vertex (the Nomex back, the leather palm and finger pads, darker seams where
  // they meet), the knit's relief all over
  const glove = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.86, metalness: 0, skinning: true, normalMap: knit, normalScale: new THREE.Vector2(0.55, 0.55) });
  const NOMEX = new THREE.Color(0x58604a), LEATHER = new THREE.Color(0x6a5a46), SEAM = new THREE.Color(0x2c2f25);
  const suitMat = new THREE.MeshStandardMaterial({ color: 0x4c5341, roughness: 0.95, metalness: 0, normalMap: knit, normalScale: new THREE.Vector2(0.4, 0.4) });
  const gauntMat = new THREE.MeshStandardMaterial({ color: 0x58604a, roughness: 0.9, metalness: 0, normalMap: knit, normalScale: new THREE.Vector2(0.5, 0.5) });
  const bandMat = new THREE.MeshStandardMaterial({ color: 0x30342a, roughness: 0.8, metalness: 0 });
  const shadowMat = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0 }); })();
  // a sleeve: a tapered tube (unit length up +y) with the cloth's folds pressed into it
  function tube(r0, r1, folds, seg) {
    const geo = new THREE.CylinderGeometry(r1, r0, 1, 28, seg || 12, true); geo.translate(0, 0.5, 0);
    const p = geo.attributes.position, ph = [rand() * 6, rand() * 6, rand() * 6];
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
      const f = 1 + folds * (0.6 * Math.sin(y * 19 + ph[0] + Math.sin(a * 2 + ph[1]) * 1.5) * Math.max(0, Math.sin(a + ph[2])) + 0.4 * Math.sin(a * 5 + y * 7));
      p.setX(i, x * f); p.setZ(i, z * f);
    }
    geo.computeVertexNormals(); return geo;
  }

  // what the hands go behind: the panel's face (a finger pressing a key goes into it), and the TEDAC's two hand grips
  // (the fingers round a grip pass behind it). Drawn first, into depth only: the cockpit photo shows through.
  const occ = new THREE.MeshBasicMaterial({ colorWrite: false });
  const panel = new THREE.Mesh(new THREE.PlaneGeometry(20, 20), occ); panel.renderOrder = -1; scene.add(panel);
  const GRIP_D = 0.06, GRIP_R = 0.024;   // (the grips stand 6 cm proud of the panel's face)
  const grips = {}; for (const s of ['L', 'R']) { grips[s] = new THREE.Mesh(new THREE.CylinderGeometry(GRIP_R, GRIP_R * 1.15, 1, 20), occ); grips[s].renderOrder = -1; scene.add(grips[s]); }
  const H = {};
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const loader = new THREE.GLTFLoader();
  const load = side => new Promise((ok, bad) => loader.load('/tools/trailer/assets/hand-' + (side === 'R' ? 'right' : 'left') + '.glb', gl => {
    const root = gl.scene, bones = {}, m = side === 'R' ? 1 : -1;
    let mesh = null;
    root.traverse(o => { if (o.isBone) bones[o.name] = o; if (o.isSkinnedMesh) { mesh = o; o.frustumCulled = false; } });
    const rest = {}; for (const k in bones) rest[k] = { p: bones[k].position.clone(), q: bones[k].quaternion.clone() };
    // the glove's colours from the bind pose: the palm (facing -x on the right hand) and the pads near the fingertips
    // in leather, the back in Nomex, a dark seam along the edge between them
    const geo = mesh.geometry, P = geo.attributes.position, N = geo.attributes.normal, col = new Float32Array(P.count * 3);
    const tips = Object.keys(rest).filter(k => k.endsWith('-tip')).map(k => rest[k].p);
    const c = new THREE.Color(), pv = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      pv.set(P.getX(i), P.getY(i), P.getZ(i));
      const palm = -m * N.getX(i), tip = Math.min(...tips.map(q => q.distanceTo(pv)));
      let lea = THREE.MathUtils.smoothstep(palm, 0.05, 0.35);
      lea = Math.max(lea, 1 - THREE.MathUtils.smoothstep(tip, 0.016, 0.022));
      c.copy(NOMEX).lerp(LEATHER, lea);
      c.lerp(SEAM, Math.exp(-Math.pow((lea - 0.5) / 0.12, 2)) * 0.7);
      // a little unevenness in the dye and the wear
      const w = 0.92 + 0.12 * rand(); col[3 * i] = c.r * w; col[3 * i + 1] = c.g * w; col[3 * i + 2] = c.b * w;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    mesh.material = glove;
    const holder = new THREE.Group(); holder.add(root); holder.scale.setScalar(1.04);   // (a glove is a little bigger)
    // the arm: the gauntlet (the glove's long Nomex cuff, its elastic at the wrist), the flight suit's forearm and
    // upper arm
    const gaunt = new THREE.Mesh(tube(0.036, 0.046, 0.05, 6), gauntMat), band = new THREE.Mesh(tube(0.035, 0.036, 0, 2), bandMat);
    const fore = new THREE.Mesh(tube(0.044, 0.055, 0.09, 16), suitMat), upper = new THREE.Mesh(tube(0.055, 0.06, 0.07, 12), suitMat);
    for (const o of [gaunt, band, fore, upper]) scene.add(o);
    const shadow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), shadowMat.clone()); scene.add(shadow);
    scene.add(holder);
    H[side] = { side, m, bones, rest, holder, gaunt, band, fore, upper, shadow, keys: [], tip: null, vel: v3(0, 0, 0), u: null, last: null };
    ok();
  }, undefined, bad));
  const ready = Promise.all([load('R'), load('L')]);

  /* ---- the fingers ---- */
  const FING = ['index', 'middle', 'ring', 'pinky'].map(f => ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map(s => f + '-finger-' + s));
  const THUMB = ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'];
  // curl a chain: each joint turns the rest of the chain about the finger's own side axis, toward the palm (the
  // skeleton is flat: each joint is placed in the armature's space)
  function curl(h, chain, angles, axis) {
    const R = h.rest, B = h.bones, q = new THREE.Quaternion(), dq = new THREE.Quaternion();
    B[chain[0]].position.copy(R[chain[0]].p); B[chain[0]].quaternion.copy(R[chain[0]].q);
    for (let i = 1; i < chain.length; i++) {
      dq.setFromAxisAngle(axis, angles[i - 1] || 0); q.premultiply(dq);
      const seg = R[chain[i]].p.clone().sub(R[chain[i - 1]].p).applyQuaternion(q);
      B[chain[i]].position.copy(B[chain[i - 1]].position).add(seg); B[chain[i]].quaternion.copy(R[chain[i]].q).premultiply(q);
    }
  }
  const D = Math.PI / 180, mix = (a, b, k) => a.map((x, i) => x + (b[i] - x) * k);
  // the hand's shape: w 1 pointing, 0 gripping; sq the trigger finger; load the index pad pressed on a key (the last
  // joint bends back a little under it)
  function pose(h, w, sq, load) {
    const m = h.m, side = v3(0, 0, -m);
    for (const k in h.rest) { h.bones[k].position.copy(h.rest[k].p); h.bones[k].quaternion.copy(h.rest[k].q); }
    // (round the grip a fist, the trigger finger a little looser, the thumb along the top)
    const idxGrip = [0, 58 + 16 * sq, 66 + 18 * sq, 40 + 10 * sq], idxPoint = [0, 6, 8 + 6 * load, 6 - 14 * load];
    curl(h, FING[0], mix(idxGrip, idxPoint, w).map(x => x * D), side);
    for (const c of FING.slice(1)) curl(h, c, mix([0, 86, 98, 62], [0, 80, 96, 55], w).map(x => x * D), side);
    curl(h, THUMB, mix([8, 12, 8], [28, 32, 18], w).map(x => x * D), v3(-1 * m, 0.3, 0).normalize());
  }
  // the hand's turn: the fingers on along the forearm (u, elbow to wrist), bent at the wrist toward the panel to point,
  // or round the grip; the back of the hand up to the eye
  function turn(h, u, w) {
    const m = h.m;
    const Fp = u.clone().add(v3(-0.25 * m, 0.35, -0.75)).normalize(), Fg = u.clone().multiplyScalar(0.5).add(v3(-0.25 * m, 0.25, -0.85)).normalize();
    const F = Fg.clone().lerp(Fp, w).normalize();
    // (round a grip as in a handshake: the palm in toward it, the thumb on top)
    const P = v3(-1 * m, 0.12, 0.05).lerp(v3(0.15 * m, -0.35, -0.92), w);
    P.sub(F.clone().multiplyScalar(P.dot(F))).normalize();
    const X = P.clone().multiplyScalar(-m), Y = F.clone().negate(), Z = new THREE.Vector3().crossVectors(X, Y);
    return new THREE.Matrix4().makeBasis(X, Y, Z);
  }
  // two-bone IK: the elbow from the shoulder S and the wrist W, hanging down and out
  function elbow(h, W) {
    const S = v3(...SHOULDER[h.side]), d0 = W.clone().sub(S), d = Math.min(d0.length(), UPPER + FORE - 1e-3), dir = d0.normalize();
    const a = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d), hh = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
    const pole = v3(0.7 * h.m, -1, 0.15); pole.sub(dir.clone().multiplyScalar(pole.dot(dir))).normalize();
    return { S, E: S.clone().add(dir.clone().multiplyScalar(a)).add(pole.multiplyScalar(hh)) };
  }
  // a tube from a to b
  function span(o, a, b) {
    const d = b.clone().sub(a), l = Math.max(1e-4, d.length());
    o.position.copy(a); o.quaternion.setFromUnitVectors(v3(0, 1, 0), d.divideScalar(l)); o.scale.set(1, l, 1);
  }

  /* ---- the timeline ---- */
  const mj = k => k * k * k * (10 - 15 * k + 6 * k * k);   // minimum jerk
  function state(h, t) {
    const K = h.keys;
    if (!K.length) return { x: REST[h.side].x, y: REST[h.side].y, d: 0.2, w: 1, sq: 0 };
    if (t <= K[0].t) return Object.assign({}, K[0]);
    for (let i = 1; i < K.length; i++) if (t < K[i].t) {
      const a = K[i - 1], b = K[i], k = mj((t - a.t) / (b.t - a.t)), far = Math.hypot(b.x - a.x, b.y - a.y);
      // a long move lifts off the panel on the way (an arc toward the eye)
      const lift = Math.min(0.07, far * 0.00025) * Math.sin(Math.PI * k);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, d: a.d + (b.d - a.d) * k + lift, w: a.w + (b.w - a.w) * k, sq: a.sq + (b.sq - a.sq) * k };
    }
    return Object.assign({}, K[K.length - 1]);
  }
  const W1 = { point: 1, grip: 0 };
  function add(side, k) { const h = H[side]; if (k.pose) { k.w = W1[k.pose]; delete k.pose; } h.keys = h.keys.filter(q => q.t < k.t); h.keys.push(k); }
  const api = {
    ready, H, scene,   // (the scene: to look at the hands in another light while tuning)
    // the index to key (x, y), touching at T: from wherever it is over 0.6 s, the finger straightening on the way, a
    // hover, the press, the lift
    reach(side, T, x, y) {
      const h = H[side];
      add(side, Object.assign({ t: T - 0.62 }, state(h, T - 0.62)));
      add(side, { t: T - 0.14, x, y, d: 0.03, pose: 'point', sq: 0 });
      add(side, { t: T, x, y, d: -0.004, pose: 'point', sq: 0 });
      add(side, { t: T + 0.14, x, y, d: -0.004, pose: 'point', sq: 0 });
      add(side, { t: T + 0.36, x, y, d: 0.028, pose: 'point', sq: 0 });
    },
    grip(side, T, x, y) {
      const h = H[side];
      add(side, Object.assign({ t: T - 0.7 }, state(h, T - 0.7)));
      add(side, { t: T, x, y, d: GRIP_D, pose: 'grip', sq: 0 });
    },
    hold(side, T, x, y) { const h = H[side]; h.keys = [{ t: T, x, y, d: GRIP_D, w: 0, sq: 0 }]; h.tip = null; },
    squeeze(side, T) {
      const h = H[side], s = state(h, T - 0.12);
      add(side, Object.assign({}, s, { t: T - 0.12, sq: 0 }));
      add(side, Object.assign({}, s, { t: T, sq: 1 }));
      add(side, Object.assign({}, s, { t: T + 0.35, sq: 1 }));
      add(side, Object.assign({}, s, { t: T + 0.6, sq: 0 }));
    },
    away(side, T) {
      const h = H[side];
      add(side, Object.assign({ t: T }, state(h, T)));
      add(side, { t: T + 0.7, x: REST[side].x, y: REST[side].y, d: 0.2, w: 1, sq: 0 });
    },
    // more light from outside on the hands, if wanted (0 none)
    light: 0,
    frame(t) {
      const VW = innerWidth, VH = innerHeight;
      if (cv.width !== Math.round(VW * rnd.getPixelRatio())) rnd.setSize(VW, VH, false);
      const f = CK.k * FOC;
      cam.fov = 2 * Math.atan(VH / 2 / f) * 180 / Math.PI; cam.aspect = VW / VH; cam.updateProjectionMatrix();
      cam.rotation.set(0, 0, -CK.kr); cam.updateMatrixWorld();
      // the light from outside: a burning flare overhead, a blast's flash
      const flare = g.illums && g.illums.some(q => q.t > 1.5) ? 0.22 : 0;
      outside.intensity = 1.4 * (api.light + flare + Math.min(1, (g.S.flash || 0) * 1.2));
      for (const side of ['R', 'L']) {
        const h = H[side], s = state(h, t), q = g.ckFromImg({ x: s.x, y: s.y });
        // where the fingertip wants to be: on the ray through the key's point on the screen, off the panel by d
        const z = PANEL - s.d, goal = v3((q.x - VW / 2) / f * z, -(q.y - VH / 2) / f * z, -z).applyQuaternion(cam.quaternion);
        // the arm's mass: a spring after it (stiff, a little under-damped), stepped on the trailer's clock
        const dt = h.last == null ? 0 : t - h.last; h.last = t;
        if (!h.tip || dt <= 0 || dt > 0.25) { h.tip = goal.clone(); h.vel.set(0, 0, 0); }
        else {
          const om = 26, ze = 0.62, n = Math.ceil(dt / 0.004), st = dt / n;
          for (let i = 0; i < n; i++) {
            const acc = goal.clone().sub(h.tip).multiplyScalar(om * om).sub(h.vel.clone().multiplyScalar(2 * ze * om));
            h.vel.addScaledVector(acc, st); h.tip.addScaledVector(h.vel, st);
          }
        }
        // the airframe's shake (a hand on a key or a grip is steadied by it), the lag behind its accelerations
        const free = Math.min(1, Math.max(0, s.d / 0.03)), A = CK.acc || { x: 0, y: 0, z: 0 };
        const shake = v3(Math.sin(t * 23.1 + h.m) * 0.0004 + Math.sin(t * 5.3) * 0.0012 * free, Math.sin(t * 19.3) * 0.0004 + Math.sin(t * 4.1 + 1) * 0.001 * free, 0);
        const lag = v3(-A.y * 0.002, -A.z * 0.003, A.x * 0.002).multiplyScalar(0.3 + 0.7 * free);
        const tip = h.tip.clone().add(shake).add(lag);
        // the pad loads as the key goes in
        const load = Math.min(1, Math.max(0, -s.d / 0.004)) * s.w;
        pose(h, s.w, s.sq, load);
        // the wrist and the forearm, in two passes (the hand's turn follows the forearm, the forearm the wrist)
        // what is placed at the goal: pointing, the index's tip; gripping, the middle of the palm (where the grip runs)
        const sc = h.holder.scale.x, B = h.bones;
        const anchor = s.w > 0.5 ? B['index-finger-tip'].position.clone()
          : B['middle-finger-metacarpal'].position.clone().lerp(B['middle-finger-phalanx-proximal'].position, 0.75).add(v3(-0.026 * h.m, 0, 0));
        let u = h.u || v3(-0.4 * h.m, 0.6, -0.7).normalize(), wr, ik;
        for (let pass = 0; pass < 2; pass++) {
          const M = turn(h, u, s.w), R3 = new THREE.Matrix4().extractRotation(M);
          const tl = anchor.clone().multiplyScalar(sc).applyMatrix4(R3);
          h.holder.quaternion.setFromRotationMatrix(M); h.holder.position.copy(tip).sub(tl);
          wr = h.bones['wrist'].position.clone().multiplyScalar(sc).applyMatrix4(R3).add(h.holder.position);
          ik = elbow(h, wr); u = wr.clone().sub(ik.E).normalize();
        }
        h.u = u;
        // the gauntlet runs 9 cm up the forearm from the wrist; the suit's sleeve on to the elbow and the shoulder
        const bandEnd = wr.clone().addScaledVector(u, -0.012), cuffEnd = wr.clone().addScaledVector(u, -0.09);
        span(h.band, wr.clone().addScaledVector(u, 0.004), bandEnd); span(h.gaunt, bandEnd, cuffEnd);
        span(h.fore, cuffEnd.clone().addScaledVector(u, 0.01), ik.E); span(h.upper, ik.E, ik.S);
        // the hand's shadow on the panel under the fingertip, darker and tighter as it closes
        const near = Math.max(0, 1 - Math.max(0, s.d) / 0.06) * s.w, sp = 0.016 + Math.max(0, s.d) * 0.4;
        h.shadow.material.opacity = 0.45 * near;
        h.shadow.position.copy(goal).addScaledVector(goal.clone().normalize(), 0.001 + s.d); h.shadow.lookAt(0, 0, 0); h.shadow.scale.set(sp * 1.3, sp, 1);
        const vis = s.y < CK.IH + 160;
        for (const o of [h.holder, h.gaunt, h.band, h.fore, h.upper, h.shadow]) o.visible = vis;
      }
      // the occluders where the cockpit has them this frame
      const ray = (x, y, z) => { const q = g.ckFromImg({ x, y }); return v3((q.x - VW / 2) / f * z, -(q.y - VH / 2) / f * z, -z).applyQuaternion(cam.quaternion); };
      panel.position.copy(v3(0, 0, -(PANEL + 0.002)).applyQuaternion(cam.quaternion)); panel.quaternion.copy(cam.quaternion);
      for (const s of ['L', 'R']) { const [x0, y0, x1, y1] = g.GRIPS[s], z = PANEL - GRIP_D; span(grips[s], ray((x0 + x1) / 2, y1, z), ray((x0 + x1) / 2, y0 + 8, z)); }
      rnd.render(scene, cam);
    },
  };
  window.__hand = api;
})();
