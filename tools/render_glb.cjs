// A bought or licensed aircraft model (glTF, e.g. the ZF-25's: assets/originals/jet_model) photographed from any
// angle and bank, outside the game: its own materials, a sunlit sky round it, landing gear up.
//   node tools/render_glb.cjs <model dir with scene.gltf> <out dir> [az,el,roll[,zoom] ...]
//   az 0 behind it (it flies away), 90 its left side, 180 in front; el degrees below it; roll right wing down +
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const R = path.resolve(__dirname, '..'), M = path.resolve(process.argv[2]) + '/', OUT = process.argv[3];
const views = (process.argv.slice(4).length ? process.argv.slice(4) : ['30,15,0', '60,30,0', '90,10,0', '120,20,0', '150,15,0', '45,25,35', '100,30,-30', '0,60,0'])
  .map(s => s.split(',').map(Number));
fs.mkdirSync(OUT, { recursive: true });
const html = `<!doctype html><html><body style="margin:0"><script src="/three.min.js"></script><script src="/GLTFLoader.js"></script><script>
window.go = async (views, bg, hide) => {
  const gltf = await new Promise((ok, no) => new THREE.GLTFLoader().load('/m/scene.gltf', ok, undefined, no));
  const root = gltf.scene;
  root.traverse(o => { if (hide.some(h => (o.name || '').toLowerCase().startsWith(h))) o.visible = false; });
  // its size and middle; the nose along +x, the left wing along +y, up +z (glTF: y up; this model's nose is +z)
  const W = 1200, rr = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
  rr.setSize(W, W); rr.outputEncoding = THREE.sRGBEncoding; rr.toneMapping = THREE.ACESFilmicToneMapping; rr.toneMappingExposure = 1.0; rr.physicallyCorrectLights = true;
  document.body.appendChild(rr.domElement);
  const scene = new THREE.Scene(); if (bg) scene.background = new THREE.Color(bg);
  // the sky as its surroundings (reflections on the metal): blue above, the haze at the horizon, the ground below
  const env = new THREE.Scene(), sg = new THREE.SphereGeometry(50, 32, 16), cols = [];
  for (let i = 0; i < sg.attributes.position.count; i++) { const y = sg.attributes.position.getY(i) / 50;
    const c = y > 0 ? new THREE.Color(0x9fc0e0).lerp(new THREE.Color(0x3d6fb0), y) : new THREE.Color(0xb8ad98).lerp(new THREE.Color(0x6b5f4c), -y); cols.push(c.r, c.g, c.b); }
  sg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  env.add(new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const sunS = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(30, 28, 24) })); sunS.position.set(20, 40, 15); env.add(sunS);
  const pm = new THREE.PMREMGenerator(rr); scene.environment = pm.fromScene(env, 0.02).texture;
  const sun = new THREE.DirectionalLight(0xfff4e0, 3.2); sun.position.set(20, 40, 15); scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x8a7a60, 0.6));
  const holder = new THREE.Group(), piv = new THREE.Group(); scene.add(holder); holder.add(piv); piv.add(root);
  // (glTF y up: the holder turns it so z is up for the camera maths below)
  // (glTF is y up; this model is already y up, its nose toward +z)
  const box = new THREE.Box3().setFromObject(root), ctr = box.getCenter(new THREE.Vector3()), sz = box.getSize(new THREE.Vector3());
  root.position.sub(ctr);
  const cam = new THREE.PerspectiveCamera(6, 1, 1, 5000); cam.up.set(0, 1, 0);
  const out = [], L = Math.max(sz.x, sz.z);
  for (const [az, el, roll, zoom = 1] of views) {
    // in the holder's frame (y up, nose +z): roll about the nose axis
    piv.rotation.set(0, 0, -roll * Math.PI / 180);
    const a = az * Math.PI / 180, e = el * Math.PI / 180, D = L / 2 / Math.tan(3 * Math.PI / 180) * 1.25 / zoom;
    // behind it is -z; its left side (+x in this model, the pilot's left) at az 90; below is -y
    cam.position.set(Math.sin(a) * Math.cos(e) * D, -Math.sin(e) * D, -Math.cos(a) * Math.cos(e) * D); cam.lookAt(0, 0, 0);
    rr.render(scene, cam); out.push(rr.domElement.toDataURL('image/png'));
  }
  return { out, size: [sz.x, sz.y, sz.z] };
};
</script></body></html>`;
(async () => {
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.route('**/*', r => { const p = decodeURIComponent(new URL(r.request().url()).pathname);
    if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
    if (p === '/three.min.js') return r.fulfill({ body: fs.readFileSync(R + '/tests/three.min.js'), contentType: 'application/javascript' });
    if (p === '/GLTFLoader.js') return r.fulfill({ body: fs.readFileSync(R + '/tools/vendor/GLTFLoader.r128.js'), contentType: 'application/javascript' });
    const f = M + p.replace(/^\/m\//, ''); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f) }) : r.fulfill({ status: 404, body: '' }); });
  await page.goto('http://glb/');
  const res = await page.evaluate(([v, bg, h]) => window.go(v, bg, h), [views, process.env.BG === 'none' ? null : (process.env.BG || '#9fb3c8'), (process.env.HIDE || 'wheel').split(',')]);
  res.out.forEach((d, i) => fs.writeFileSync(`${OUT}/v_${views[i].join('_')}.png`, Buffer.from(d.split(',')[1], 'base64')));
  console.log(res.out.length, 'shots; model size (m)', res.size.map(v => v.toFixed(2)).join(' x '), errs);
  await browser.close();
})();
