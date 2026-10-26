// The gunner's hands for the trailer (tools/trailer/rig.cjs puts this in the game's page): the WebXR generic hands
// (assets/hand-*.glb, MIT, Amazon) in sage flight gloves, with the flight suit's sleeves, drawn on a canvas of their own
// over the cockpit. Each hand has a timeline of keyframes on the trailer's clock: the fingertip's point on the cockpit
// photo (photo pixels, so the hand stays on its key as the head moves), its distance off the panel (metres toward the
// eye; 0 touching, below 0 pushing in) and its pose ('point': the index out, the rest curled; 'grip': round the
// TEDAC's hand grip, `sq` the trigger finger squeezing). Off the photo's bottom edge the hand is out of view.
//   window.__hand.reach(side, T, x, y)   the index comes to key (x, y) and presses it at trailer time T
//   window.__hand.grip(side, T, x, y)    the hand takes the grip at (x, y) by T; .squeeze(side, T) pulls the trigger at T;
//                                       .hold(side, T, x, y) is there already
//   window.__hand.away(side, T)          back down out of view, from T
//   window.__hand.frame(vt)              draw for trailer time vt (the rig calls it after each frame)
(function () {
  const g = window.__saqr, CK = g.CK;
  // the photo's projection: pixels per radian at lean 1 (24 mm lens, 53.1° vertical over the photo's 941 rows); the
  // panel's keys about 0.75 m from the eye
  const FOC = CK.IH / 2 / Math.tan(53.1 * Math.PI / 360), PANEL = 0.75;
  const REST = { R: { x: 1420, y: 1260 }, L: { x: 260, y: 1260 } };
  const cv = document.createElement('canvas');
  // (a touch soft: the eye is focused on the panel beyond, and the hand is close)
  cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:2147483000;filter:blur(0.45px)';
  document.body.appendChild(cv);
  const rnd = new THREE.WebGLRenderer({ canvas: cv, alpha: true, antialias: true, premultipliedAlpha: false });
  rnd.setPixelRatio(window.devicePixelRatio || 1); rnd.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(), cam = new THREE.PerspectiveCamera(40, 16 / 9, 0.01, 10);
  // the light in the seat at night: the screens' green glow from in front and below, a dim flood from above, and the
  // valley's light through the canopy (the flare, a blast) as `outside`
  scene.add(new THREE.AmbientLight(0x1c2620, 0.3));
  const glow = new THREE.DirectionalLight(0x5cf08c, 0.9); glow.position.set(0.15, -0.45, -1); scene.add(glow);
  const rim = new THREE.DirectionalLight(0x7dffb0, 0.7); rim.position.set(-0.6, 0.1, -0.8); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x8a9a90, 0.32); fill.position.set(-0.5, 0.9, 0.5); scene.add(fill);
  const outside = new THREE.DirectionalLight(0xfff0d8, 0); outside.position.set(0, 0.8, -1); scene.add(outside);
  // the gloves' knit and the suit's weave: fine noise in the colour
  const weave = (n, a) => { const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d'), d = x.createImageData(n, n);
    for (let i = 0; i < n * n; i++) { const v = 255 - Math.random() * a - ((i % n) % 3 === 0 ? a * 0.4 : 0); d.data[4 * i] = d.data[4 * i + 1] = d.data[4 * i + 2] = v; d.data[4 * i + 3] = 255; }
    x.putImageData(d, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 6); return t; };
  const glove = new THREE.MeshStandardMaterial({ color: 0x6b6853, roughness: 0.95, metalness: 0, skinning: true, map: weave(128, 70) });
  const suit = new THREE.MeshStandardMaterial({ color: 0x40453a, roughness: 0.97, metalness: 0, map: weave(128, 50) });
  const cuff = new THREE.MeshStandardMaterial({ color: 0x3b3f31, roughness: 0.9, metalness: 0 });
  const H = {};
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
  const loader = new THREE.GLTFLoader();
  const load = side => new Promise((ok, bad) => loader.load('/tools/trailer/assets/hand-' + (side === 'R' ? 'right' : 'left') + '.glb', gl => {
    const root = gl.scene, bones = {};
    root.traverse(o => { if (o.isBone) bones[o.name] = o; if (o.isSkinnedMesh) { o.material = glove; o.frustumCulled = false; } });
    // the bones' rest positions and orientations (the skeleton is flat: each joint sits in the armature's space)
    const rest = {}; for (const k in bones) rest[k] = { p: bones[k].position.clone(), q: bones[k].quaternion.clone() };
    const holder = new THREE.Group(); holder.add(root); holder.scale.setScalar(1.03);   // (a glove is a little bigger)
    // the sleeve: from the wrist back down the forearm, a cuff at the glove's edge
    const arm = new THREE.Group();
    const sl = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.05, 0.5, 20, 1, true), suit); sl.position.y = -0.25 - 0.03; arm.add(sl);
    const cf = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.038, 0.035, 20, 1, false), cuff); cf.position.y = -0.02; arm.add(cf);
    scene.add(holder); scene.add(arm);
    H[side] = { side, bones, rest, holder, arm, keys: [], m: side === 'R' ? 1 : -1 };
    ok();
  }, undefined, bad));
  const ready = Promise.all([load('R'), load('L')]);
  // the finger chains, base to tip
  const FING = ['index', 'middle', 'ring', 'pinky'].map(f => ['metacarpal', 'phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map(s => f + '-finger-' + s));
  const THUMB = ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'];
  // curl a chain: each joint turns the rest of the chain about the finger's own side axis, toward the palm
  function curl(h, chain, angles, axis) {
    const R = h.rest, B = h.bones, q = new THREE.Quaternion(), dq = new THREE.Quaternion();
    let base = R[chain[0]].p.clone(); B[chain[0]].position.copy(base); B[chain[0]].quaternion.copy(R[chain[0]].q);
    for (let i = 1; i < chain.length; i++) {
      dq.setFromAxisAngle(axis, angles[i - 1] || 0); q.premultiply(dq);
      const seg = R[chain[i]].p.clone().sub(R[chain[i - 1]].p).applyQuaternion(q);
      base = B[chain[i - 1]].position.clone().add(seg);
      B[chain[i]].position.copy(base); B[chain[i]].quaternion.copy(R[chain[i]].q).premultiply(q);
    }
  }
  // the palm faces -x on the right hand (+x on the left), the fingers run down -y, the little finger at +z
  function pose(h, kind, sq) {
    const m = h.m, side = v3(0, 0, -m);   // (turning about -z bends the right hand's fingers toward -x, the palm)
    for (const k in h.rest) { h.bones[k].position.copy(h.rest[k].p); h.bones[k].quaternion.copy(h.rest[k].q); }
    const D = Math.PI / 180;
    if (kind === 'point') {
      curl(h, FING[0], [0, 6 * D, 8 * D, 6 * D], side);
      for (const c of FING.slice(1)) curl(h, c, [0, 78 * D, 95 * D, 55 * D], side);
      curl(h, THUMB, [28 * D, 32 * D, 18 * D], v3(-1 * m, 0.3, 0).normalize());
    } else {
      const s = sq || 0;
      curl(h, FING[0], [0, (38 + 18 * s) * D, (48 + 22 * s) * D, (30 + 10 * s) * D], side);
      for (const c of FING.slice(1)) curl(h, c, [0, 70 * D, 80 * D, 45 * D], side);
      curl(h, THUMB, [16 * D, 22 * D, 12 * D], v3(-1 * m, 0.3, 0).normalize());
    }
    h.holder.updateMatrixWorld(true);
  }
  // the hand's turn in the eye's frame: the fingers up and forward toward the panel, the back of the hand to the eye,
  // the forearm coming up from below on its own side
  function turn(h, kind) {
    const m = h.m;
    const F = kind === 'point' ? v3(-0.42 * m, 0.6, -0.68).normalize() : v3(-0.35 * m, 0.1, -0.93).normalize();
    let P = kind === 'point' ? v3(0.2 * m, -0.3, -0.93) : v3(-0.85 * m, -0.5, 0.1);
    P.sub(F.clone().multiplyScalar(P.dot(F))).normalize();
    // model axes to the eye's: -y (the fingers) to F, palm (-x right, +x left) to P, z to complete the frame
    const X = P.clone().multiplyScalar(-m), Y = F.clone().negate(), Z = new THREE.Vector3().crossVectors(X, Y);
    return new THREE.Matrix4().makeBasis(X, Y, Z);
  }
  const sm = k => k * k * (3 - 2 * k);
  // the keyframe state at time t: position eased between keys, the pose and squeeze from the key being reached
  function state(h, t) {
    const K = h.keys;
    if (!K.length || t <= K[0].t) return K[0] || { x: REST[h.side].x, y: REST[h.side].y, d: 0.2, pose: 'point', sq: 0 };
    for (let i = 1; i < K.length; i++) if (t < K[i].t) {
      const a = K[i - 1], b = K[i], k = sm((t - a.t) / (b.t - a.t));
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, d: a.d + (b.d - a.d) * k, pose: k < 0.5 ? a.pose : b.pose, sq: a.sq + (b.sq - a.sq) * k };
    }
    return K[K.length - 1];
  }
  function at(h, t) { const s = state(h, t); return { x: s.x, y: s.y, d: s.d, pose: s.pose, sq: s.sq }; }
  function add(side, k) { const h = H[side]; h.keys = h.keys.filter(q => q.t < k.t); h.keys.push(k); }
  const api = {
    ready, H, scene,   // (the scene: to look at the hands in another light while tuning)
    // the index to key (x, y), touching at T: up from wherever it is over 0.6 s, a hover, the press, the lift
    reach(side, T, x, y) {
      const h = H[side], s = at(h, T - 0.62);
      add(side, Object.assign({ t: T - 0.62 }, s));
      add(side, { t: T - 0.12, x, y, d: 0.035, pose: 'point', sq: 0 });
      add(side, { t: T, x, y, d: -0.004, pose: 'point', sq: 0 });
      add(side, { t: T + 0.14, x, y, d: -0.004, pose: 'point', sq: 0 });
      add(side, { t: T + 0.34, x, y, d: 0.03, pose: 'point', sq: 0 });
    },
    grip(side, T, x, y) {
      const h = H[side], s = at(h, T - 0.7);
      add(side, Object.assign({ t: T - 0.7 }, s));
      add(side, { t: T, x, y, d: 0, pose: 'grip', sq: 0 });
    },
    // the hand already on the grip at (x, y) from T (no move)
    hold(side, T, x, y) { H[side].keys = [{ t: T, x, y, d: 0, pose: 'grip', sq: 0 }]; },
    squeeze(side, T) {
      const h = H[side], s = at(h, T - 0.12);
      add(side, Object.assign({ t: T - 0.12 }, s, { sq: 0 }));
      add(side, Object.assign({}, s, { t: T, sq: 1 }));
      add(side, Object.assign({}, s, { t: T + 0.35, sq: 1 }));
      add(side, Object.assign({}, s, { t: T + 0.6, sq: 0 }));
    },
    away(side, T) {
      const h = H[side], s = at(h, T);
      add(side, Object.assign({ t: T }, s));
      add(side, { t: T + 0.7, x: REST[side].x, y: REST[side].y, d: 0.2, pose: s.pose, sq: 0 });
    },
    // more light from outside on the hands, if wanted (0 none)
    light: 0,
    frame(t) {
      const VW = innerWidth, VH = innerHeight;
      if (cv.width !== Math.round(VW * rnd.getPixelRatio())) rnd.setSize(VW, VH, false);
      const k = CK.k, f = k * FOC;
      cam.fov = 2 * Math.atan(VH / 2 / f) * 180 / Math.PI; cam.aspect = VW / VH; cam.updateProjectionMatrix();
      cam.rotation.set(0, 0, -CK.kr);
      // the light from outside: a burning flare overhead, a blast's flash
      const flare = g.illums && g.illums.some(f => f.t > 1.5) ? 0.22 : 0;
      outside.intensity = 1.4 * (api.light + flare + Math.min(1, (g.S.flash || 0) * 1.2));
      for (const side of ['R', 'L']) {
        const h = H[side], s = at(h, t), q = g.ckFromImg({ x: s.x, y: s.y });
        // the fingertip: on the ray through the key's point on the screen, at the panel less its distance off it
        const z = PANEL - s.d, tip = v3((q.x - VW / 2) / f * z, -(q.y - VH / 2) / f * z, -z).applyEuler(cam.rotation);
        pose(h, s.pose, s.sq);
        const M = turn(h, s.pose), sc = h.holder.scale.x;
        const tipName = s.pose === 'point' ? 'index-finger-tip' : 'middle-finger-phalanx-proximal';
        const tl = h.bones[tipName].position.clone().multiplyScalar(sc).applyMatrix4(new THREE.Matrix4().extractRotation(M));
        h.holder.quaternion.setFromRotationMatrix(M);
        h.holder.position.copy(tip).sub(tl);
        // the sleeve from the wrist along the forearm (down and back toward the eye, out to its side)
        const wr = h.bones['wrist'].position.clone().multiplyScalar(sc).applyQuaternion(h.holder.quaternion).add(h.holder.position);
        const fa = s.pose === 'point' ? v3(0.62 * h.m, -0.55, 0.56).normalize() : v3(0.3 * h.m, -0.55, 0.78).normalize();
        h.arm.position.copy(wr); h.arm.quaternion.setFromUnitVectors(v3(0, 1, 0), fa.clone().negate());
        const vis = s.y < CK.IH + 120;
        h.holder.visible = h.arm.visible = vis;
      }
      rnd.render(scene, cam);
    },
  };
  window.__hand = api;
})();
