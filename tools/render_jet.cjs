// The ZF-25 model (tools/make_jet.py: build/jet) photographed from any angle: its five blueprint pictures projected
// onto it from their own directions, blended by how squarely the surface faces each. Outside the game.
//   node tools/render_jet.cjs <out dir> [az,el,roll ...]     (az 0 behind it, 90 its left side, 180 in front;
//                                                           el degrees below it; roll degrees, right wing down +)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const R = path.resolve(__dirname, '..'), J = R + '/build/jet/', OUT = process.argv[2] || J + 'shots';
const views = (process.argv.slice(3).length ? process.argv.slice(3) : ['30,15,0', '60,30,0', '90,10,0', '120,20,0', '150,15,0', '45,25,35', '100,30,-30', '0,60,0'])
  .map(s => s.split(',').map(Number));
fs.mkdirSync(OUT, { recursive: true });
const html = `<!doctype html><html><body style="margin:0;background:#000"><script src="three.min.js"></script><script>
window.go = async (views, bg) => {
  const meta = await (await fetch('model.json')).json();
  const buf = await (await fetch('model.bin')).arrayBuffer();
  const nv = meta.nv, nf = meta.nf;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(buf, 0, nv * 3), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(buf, nv * 12, nv * 3), 3));
  g.setIndex(new THREE.BufferAttribute(new Uint32Array(buf, nv * 24, nf * 3), 1));
  const ld = new THREE.TextureLoader(), names = ['bp_top', 'bp_bottom', 'bp_side', 'bp_front', 'bp_rear'];
  const tex = await Promise.all(names.map(n => new Promise(ok => ld.load('tex_' + n + '.png', t => { t.anisotropy = 8; ok(t); }))));
  const box = n => { const v = meta.views[n]; return new THREE.Vector4(v.box[0] / v.w, v.box[1] / v.h, (v.box[2] - v.box[0]) / v.w, (v.box[3] - v.box[1]) / v.h); };
  const u = { L: { value: new THREE.Vector3(meta.len, meta.span, meta.hgt) }, sun: { value: new THREE.Vector3(0.35, 0.25, 0.9).normalize() } };
  names.forEach((n, i) => { u['t' + i] = { value: tex[i] }; u['b' + i] = { value: box(n) }; });
  const mat = new THREE.ShaderMaterial({ uniforms: u,
    vertexShader: 'varying vec3 vP, vN; void main(){ vP = position; vN = normal; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: \`precision highp float; uniform vec3 L, sun; uniform sampler2D t0, t1, t2, t3, t4; uniform vec4 b0, b1, b2, b3, b4; varying vec3 vP, vN;
      vec4 tx(sampler2D t, vec4 b, vec2 f){ vec2 p = b.xy + f * b.zw; return texture2D(t, vec2(p.x, 1.0 - p.y)); }
      void main(){
        vec3 n = normalize(vN);
        float ul = (L.x * 0.5 - vP.x) / L.x, ur = (L.y * 0.5 - vP.y) / L.y, vh = (L.z * 0.5 - vP.z) / L.z;
        vec4 c0 = tx(t0, b0, vec2(ur, ul)), c1 = tx(t1, b1, vec2(1.0 - ur, ul)), c2 = tx(t2, b2, vec2(ul, vh)), c3 = tx(t3, b3, vec2(1.0 - ur, vh)), c4 = tx(t4, b4, vec2(ur, vh));
        float w0 = pow(max(n.z, 0.0), 4.0) * c0.a, w1 = pow(max(-n.z, 0.0), 4.0) * c1.a, w2 = pow(abs(n.y), 4.0) * c2.a, w3 = pow(max(n.x, 0.0), 4.0) * c3.a, w4 = pow(max(-n.x, 0.0), 4.0) * c4.a;
        float ws = w0 + w1 + w2 + w3 + w4 + 1e-4;
        vec3 c = (c0.rgb * w0 + c1.rgb * w1 + c2.rgb * w2 + c3.rgb * w3 + c4.rgb * w4) / ws;
        if (ws < 0.002) c = vec3(0.55);
        float sh = 0.72 + 0.38 * max(dot(n, sun), 0.0);
        gl_FragColor = vec4(c * sh, 1.0);
      }\` });
  const mesh = new THREE.Mesh(g, mat);
  const W = 1024, rr = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); rr.setSize(W, W); document.body.appendChild(rr.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(bg); const piv = new THREE.Group(); piv.add(mesh); scene.add(piv);
  const cam = new THREE.PerspectiveCamera(6, 1, 10, 2000); cam.up.set(0, 0, 1);
  const out = [];
  for (const [az, el, roll] of views) {
    piv.rotation.set(roll * Math.PI / 180, 0, 0);
    const a = az * Math.PI / 180, e = el * Math.PI / 180, D = 230;
    cam.position.set(-Math.cos(a) * Math.cos(e) * D, Math.sin(a) * Math.cos(e) * D, -Math.sin(e) * D); cam.lookAt(0, 0, 0);
    rr.render(scene, cam); out.push(rr.domElement.toDataURL('image/png'));
  }
  return out;
};
</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.route('**/*', r => { const u = new URL(r.request().url()); const p = u.pathname.slice(1);
    if (p === '' ) return r.fulfill({ body: html, contentType: 'text/html' });
    if (p === 'three.min.js') return r.fulfill({ body: fs.readFileSync(R + '/tests/three.min.js'), contentType: 'application/javascript' });
    const f = J + p; return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' }); });
  await page.goto('http://jet/');
  const shots = await page.evaluate(([v, bg]) => window.go(v, bg), [views, process.env.BG || '#9fb3c8']);
  shots.forEach((d, i) => fs.writeFileSync(`${OUT}/jet_${views[i].join('_')}.png`, Buffer.from(d.split(',')[1], 'base64')));
  console.log(shots.length, 'shots', errs);
  await browser.close();
})();
