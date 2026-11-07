const { chromium } = require('playwright'); const fs = require('fs');
const three = fs.readFileSync('/home/user/saqr-alwadi/tests/three.min.js', 'utf8'), model = fs.readFileSync(__dirname + '/model.js', 'utf8');
const VIEWS = {
  q34: { pos: [-7, 7.5, -10], tgt: [9.5, 2.2, 0.5], fov: 34 },
  side: { pos: [9.5, 2.8, -60], tgt: [9.5, 2.8, 0], ortho: 6.5 },
  top: { pos: [9.5, 60, 0.001], tgt: [9.5, 0, 0], ortho: 7.2 },
  front: { pos: [-60, 2.9, 0], tgt: [0, 2.9, 0], ortho: 4.2 },
  rear: { pos: [70, 3.2, 0], tgt: [0, 3.2, 0], ortho: 4.2 },
  shelter: { pos: [-6, 3.2, -11], tgt: [8.5, 2.2, 0], fov: 40 },
  flight: { pos: [-8, 12, -12], tgt: [9.5, 2.2, 0], fov: 32, gear: false, roll: 0.35, air: true },
  takeoff: { pos: [30, 1.5, -26], tgt: [9.5, 3.4, 0], fov: 30, pitch: -0.17, air: true },
};
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await (await b.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
  p.on('pageerror', e => console.log('ERR', e.message));
  await p.setContent('<html><body style="margin:0;background:#d9dbdd"><canvas id=c width=1600 height=900></canvas></body></html>');
  await p.addScriptTag({ content: three }); await p.addScriptTag({ content: model });
  for (const [n, v] of Object.entries(VIEWS)) {
    await p.evaluate(v => {
      const T = THREE, r = new T.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true, preserveDrawingBuffer: true });
      r.setClearColor(0xd9dbdd); r.shadowMap.enabled = true;
      const s = new T.Scene(); s.add(new T.HemisphereLight(0xffffff, 0x8a8f94, 0.9));
      const d = new T.DirectionalLight(0xffffff, 0.9); d.position.set(-10, 25, -12); d.castShadow = true; d.shadow.mapSize.set(2048, 2048);
      Object.assign(d.shadow.camera, { left: -20, right: 20, top: 20, bottom: -20 }); s.add(d);
      const g = buildZF25(T, { gear: v.gear }); if (v.roll) g.rotation.x = v.roll; if (v.pitch) { g.position.set(9.5, 0, 0); g.rotation.z = v.pitch; g.position.x = 0; } g.traverse(o => { if (o.isMesh) { o.castShadow = true; } }); s.add(g);
      const fl = new T.Mesh(new T.PlaneGeometry(200, 200), new T.ShadowMaterial({ opacity: 0.25 })); fl.rotation.x = -Math.PI / 2; fl.receiveShadow = true; if (!v.air) s.add(fl);
      let cam; if (v.ortho) { const a = 16 / 9; cam = new T.OrthographicCamera(-v.ortho * a, v.ortho * a, v.ortho, -v.ortho, 0.1, 500); } else cam = new T.PerspectiveCamera(v.fov, 16 / 9, 0.1, 500);
      cam.position.set(...v.pos); cam.lookAt(...v.tgt); r.render(s, cam);
    }, v);
    await p.screenshot({ path: __dirname + '/' + n + '.png' });
  }
  await b.close(); console.log('done');
})();
