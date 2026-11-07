// The ZF-25 built piece by piece (tools/make_jet2.py: build/jet2) photographed from any angle and bank, outside the
// game. Each piece takes its colour only from the blueprint pictures that show it, and is lit as painted metal under
// the sun and the sky (the canopy as glass).
//   node tools/render_jet2.cjs <out dir> [az,el,roll[,zoom] ...]   az 0 behind it, 90 its left side, 180 in front;
//   el degrees below it (negative: above); roll degrees, right wing down +.  BG=none for a clear background.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const R = path.resolve(__dirname, '..'), J = R + '/build/jet2/', OUT = process.argv[2] || J + 'shots';
const views = (process.argv.slice(3).length ? process.argv.slice(3) : ['30,15,0', '60,30,0', '90,10,0', '120,20,0', '150,15,0', '45,25,35', '100,30,-30', '0,60,0'])
  .map(s => s.split(',').map(Number));
fs.mkdirSync(OUT, { recursive: true });
const html = `<!doctype html><html><body style="margin:0"><script src="three.min.js"></script><script>
window.go = async (views, bg) => {
  const meta = await (await fetch('pieces.json')).json(), L = meta.len, S = meta.span, H = meta.hgt;
  const ld = new THREE.TextureLoader(), VN = ['bp_top', 'bp_bottom', 'bp_side', 'bp_front', 'bp_rear'], VK = ['top', 'bottom', 'side', 'front', 'rear'];
  const tex = await Promise.all(VN.map(n => new Promise(ok => ld.load('tex_' + n + '.png', t => { t.anisotropy = 8; ok(t); }))));
  const box = n => { const v = meta.views[n]; return new THREE.Vector4(v.box[0] / v.w, v.box[1] / v.h, (v.box[2] - v.box[0]) / v.w, (v.box[3] - v.box[1]) / v.h); };
  const W = 1200, rr = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true }); rr.setSize(W, W); document.body.appendChild(rr.domElement);
  const scene = new THREE.Scene(); if (bg) scene.background = new THREE.Color(bg);
  const piv = new THREE.Group(); scene.add(piv);
  const sun = new THREE.Vector3(0.35, 0.25, 0.9).normalize();
  for (const p of meta.pieces) {
    const buf = await (await fetch(p.name + '.bin')).arrayBuffer();
    const pos = new Float32Array(buf, 0, p.nv * 3).slice(), nrm = new Float32Array(buf, p.nv * 12, p.nv * 3).slice(), idx = new Uint32Array(buf, p.nv * 24, p.nf * 3);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    const u = { L: { value: new THREE.Vector3(L, S, H) }, sun: { value: sun }, use: { value: VK.map(k => p.views.includes(k) ? 1 : 0) }, glass: { value: p.name === 'canopy' ? 1 : 0 } };
    VN.forEach((n, i) => { u['t' + i] = { value: tex[i] }; u['b' + i] = { value: box(n) }; });
    const mat = new THREE.ShaderMaterial({ uniforms: u, side: THREE.DoubleSide,
      // (the pieces are in the blueprint's frame: x from the nose to the tail, y the left wing +, z up from the lowest point)
      vertexShader: 'uniform vec3 L; varying vec3 vP, vN, vW, vWN; void main(){ vP = position; vN = normal; vec3 p = vec3(L.x * 0.5 - position.x, position.y, position.z - L.z * 0.5); vec3 n = vec3(-normal.x, normal.y, normal.z); vec4 w = modelMatrix * vec4(p, 1.0); vW = w.xyz; vWN = normalize(mat3(modelMatrix) * n); gl_Position = projectionMatrix * viewMatrix * w; }',
      fragmentShader: \`precision highp float; uniform vec3 L, sun; uniform float use[5]; uniform float glass; uniform sampler2D t0, t1, t2, t3, t4; uniform vec4 b0, b1, b2, b3, b4; varying vec3 vP, vN, vW, vWN;
        vec4 tx(sampler2D t, vec4 b, vec2 f){ vec2 p = b.xy + f * b.zw; return texture2D(t, vec2(p.x, 1.0 - p.y)); }
        void main(){
          vec3 n = normalize(vN);
          float fx = vP.x / L.x, fyl = (L.y * 0.5 - vP.y) / L.y, fz = (L.z - vP.z) / L.z;
          vec4 c0 = tx(t0, b0, vec2(fyl, fx)), c1 = tx(t1, b1, vec2(1.0 - fyl, fx)), c2 = tx(t2, b2, vec2(fx, fz)), c3 = tx(t3, b3, vec2(1.0 - fyl, fz)), c4 = tx(t4, b4, vec2(fyl, fz));
          float w0 = use[0] * pow(smoothstep(0.15, 1.0, n.z), 2.0) * c0.a, w1 = use[1] * pow(smoothstep(0.15, 1.0, -n.z), 2.0) * c1.a;
          float w2 = use[2] * pow(smoothstep(0.15, 1.0, abs(n.y)), 2.0) * c2.a, w3 = use[3] * pow(smoothstep(0.5, 1.0, -n.x), 2.0) * c3.a, w4 = use[4] * pow(smoothstep(0.5, 1.0, n.x), 2.0) * c4.a;
          float ws = w0 + w1 + w2 + w3 + w4;
          vec3 c = ws > 1e-3 ? (c0.rgb * w0 + c1.rgb * w1 + c2.rgb * w2 + c3.rgb * w3 + c4.rgb * w4) / ws : (use[2] > 0.5 ? c2.rgb : (n.z > 0.0 ? c0.rgb : c1.rgb));
          // lit: the pictures are evenly lit already; the sun and the sky added as paint would take them
          vec3 N = normalize(vWN), V = normalize(cameraPosition - vW); if (dot(N, V) < 0.0) N = -N;
          vec3 Rf = reflect(-V, N);
          vec3 sky = mix(vec3(0.72, 0.68, 0.60), mix(vec3(0.70, 0.80, 0.92), vec3(0.30, 0.48, 0.75), clamp(Rf.z, 0.0, 1.0)), smoothstep(-0.15, 0.1, Rf.z));
          float fr = 0.04 + 0.96 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
          float dif = 0.62 + 0.48 * max(dot(N, sun), 0.0);
          float spec = pow(max(dot(N, normalize(sun + V)), 0.0), 60.0);
          vec3 col = c * dif + sky * fr * 0.35 + vec3(1.0, 0.97, 0.9) * spec * 0.18;
          if (glass > 0.5) col = mix(c * 0.75, sky, clamp(0.25 + fr * 0.9, 0.0, 0.85)) + vec3(1.0) * spec * 0.6;
          gl_FragColor = vec4(col, 1.0);
        }\` });
    piv.add(new THREE.Mesh(g, mat));
  }
  const cam = new THREE.PerspectiveCamera(6, 1, 10, 3000); cam.up.set(0, 0, 1);
  const out = [];
  for (const [az, el, roll, zoom = 1] of views) {
    piv.rotation.set(roll * Math.PI / 180, 0, 0);
    const a = az * Math.PI / 180, e = el * Math.PI / 180, D = L / 2 / Math.tan(3 * Math.PI / 180) * 1.3 / zoom;
    cam.position.set(-Math.cos(a) * Math.cos(e) * D, Math.sin(a) * Math.cos(e) * D, -Math.sin(e) * D); cam.lookAt(0, 0, 0);
    rr.render(scene, cam); out.push(rr.domElement.toDataURL('image/png'));
  }
  return out;
};
</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.route('**/*', r => { const p = new URL(r.request().url()).pathname.slice(1);
    if (p === '') return r.fulfill({ body: html, contentType: 'text/html' });
    if (p === 'three.min.js') return r.fulfill({ body: fs.readFileSync(R + '/tests/three.min.js'), contentType: 'application/javascript' });
    const f = J + p; return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' }); });
  await page.goto('http://jet/');
  const shots = await page.evaluate(([v, bg]) => window.go(v, bg), [views, process.env.BG === 'none' ? null : (process.env.BG || '#9fb3c8')]);
  shots.forEach((d, i) => fs.writeFileSync(`${OUT}/jet_${views[i].join('_')}.png`, Buffer.from(d.split(',')[1], 'base64')));
  console.log(shots.length, 'shots', errs);
  await browser.close();
})();
