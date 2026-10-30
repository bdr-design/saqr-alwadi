// ZF-25 clay model from docs ZF25_SPEC (metres). Axes: x aft from the nose tip, y left->right (+y right wing), z up.
// three.js is y-up: we build in a group with x=aft, y=up, z=right then view.
function buildZF25(THREE, opt) {
  opt = opt || {};
  const G = new THREE.Group();
  const M = new THREE.MeshStandardMaterial({ color: 0x9aa1a8, roughness: 0.55, metalness: 0.15 });
  const MD = new THREE.MeshStandardMaterial({ color: 0x5d646b, roughness: 0.5, metalness: 0.2 });
  const MG = new THREE.MeshStandardMaterial({ color: 0x3b4650, roughness: 0.08, metalness: 0.7 });
  const MB = new THREE.MeshStandardMaterial({ color: 0x1c1f22, roughness: 0.7 });
  const lerp = (a, b, t) => a + (b - a) * t;
  // fuselage: stations and half-width / half-depth / centre height (z of the axis above the ground)
  const ST = [[0, 0.02, 0.02], [0.6, 0.18, 0.17], [1.6, 0.38, 0.32], [3.2, 0.55, 0.45], [5.0, 0.75, 0.5], [7.0, 0.9, 0.62], [8.5, 1.15, 0.75],
              [9.5, 1.3, 0.8], [15.5, 1.3, 0.8], [17.0, 1.22, 0.62], [17.8, 1.15, 0.5]];
  const ZC = 2.2;
  const hw = x => { for (let i = 1; i < ST.length; i++) if (x <= ST[i][0]) { const t = (x - ST[i - 1][0]) / (ST[i][0] - ST[i - 1][0]); return [lerp(ST[i - 1][1], ST[i][1], t), lerp(ST[i - 1][2], ST[i][2], t)]; } return [ST[ST.length - 1][1], ST[ST.length - 1][2]]; };
  // a lofted tube: rings of oval sections (flat-ish belly from 9 m)
  const NX = 90, NA = 40, pos = [], idx = [];
  for (let i = 0; i <= NX; i++) {
    const x = 17.8 * Math.pow(i / NX, 1.0), [w, h] = hw(x);
    for (let j = 0; j <= NA; j++) {
      const a = j / NA * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
      let zz = s * h; if (s < 0 && x > 8) zz = -h * Math.pow(-s, 0.6);   // fuller, flatter belly over the engines
      pos.push(x, ZC + zz, c * w);
    }
  }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NA; j++) { const a = i * (NA + 1) + j, b = a + NA + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); fg.setIndex(idx); fg.computeVertexNormals();
  G.add(new THREE.Mesh(fg, M));
  // radome darker
  const rd = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), MD); rd.scale.set(0.01, 0.01, 0.01); // (radome tinted via a short ring below)
  // pitot
  const pt = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8), MD); pt.rotation.z = Math.PI / 2; pt.position.set(-0.3, ZC, 0); G.add(pt);
  // canopy: a stretched half-ellipsoid 3.4..7.6, rising 0.85 above the top line, one frame at 5.5
  const can = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), MG);
  can.scale.set(2.15, 0.85, 0.48); can.position.set(5.5, ZC + 0.48, 0); G.add(can);
  const fr = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 24, Math.PI), MD); fr.rotation.y = Math.PI / 2; fr.scale.set(1, 1.3, 0.78); fr.position.set(5.5, ZC + 0.48, 0); G.add(fr);
  // dorsal hump 7.6..16.5
  const hp = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 16), M); hp.scale.set(4.6, 0.42, 0.55); hp.position.set(12.0, ZC + 0.62, 0); G.add(hp);
  // intakes: two round pipes under the belly, faces at 6.0, dia 0.9, centres +-0.55; ducts faired back to 10.5
  for (const s of [-1, 1]) {
    const zc = 0.55 * s, yc = ZC - 0.62 - 0.35;
    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.07, 12, 32), M); lip.rotation.y = Math.PI / 2; lip.position.set(6.0, yc, zc); G.add(lip);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.4, 32), MB); inner.rotation.y = -Math.PI / 2; inner.position.set(6.05, yc, zc); G.add(inner);
    const duct = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.2, 4.5, 24, 1, true), M); duct.rotation.z = -Math.PI / 2 + 0.06; duct.position.set(8.25, yc + 0.12, zc * 0.95); G.add(duct);
  }
  // a flat plate from an outline in the x/z plane (top view), thickness t, at height y
  const plate = (pts, y, t, mat) => {
    const sh = new THREE.Shape(); sh.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) sh.lineTo(p[0], p[1]); sh.closePath();
    const g = new THREE.ExtrudeGeometry(sh, { depth: t, bevelEnabled: true, bevelThickness: t * 0.4, bevelSize: 0.04, bevelSegments: 3 });
    const m = new THREE.Mesh(g, mat); m.rotation.x = Math.PI / 2; m.position.y = y + t / 2; return m;
  };
  for (const s of [-1, 1]) {
    // wing: cropped delta, LE root 7.8 -> tip LE 13.4 at 6.2, TE straight at 15.0
    G.add(plate([[7.8, 1.2 * s], [13.4, 6.2 * s], [15.0, 6.2 * s], [15.0, 1.2 * s]], ZC - 0.05, 0.14, M));
    // tailplane, ending at 17.6
    G.add(plate([[15.6, 1.15 * s], [17.0, 3.5 * s], [17.6, 3.5 * s], [17.6, 1.1 * s]], ZC - 0.02, 0.08, M));
    // fin: side profile on the nacelle at z=1.0, canted 8 deg out
    const sh = new THREE.Shape(); sh.moveTo(14.8, 0); sh.lineTo(16.9, 2.55); sh.quadraticCurveTo(17.4, 2.62, 17.8, 2.55); sh.lineTo(17.6, 0); sh.closePath();
    const fg2 = new THREE.ExtrudeGeometry(sh, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 2 });
    const fin = new THREE.Mesh(fg2, M); const pv = new THREE.Group(); pv.add(fin); fin.position.z = -0.05;
    pv.position.set(0, ZC + 0.75, 1.0 * s); pv.rotation.x = -s * 8 * Math.PI / 180; G.add(pv);
    // nozzle 17.8..19.0, dia 0.9, centres +-0.6
    const nz = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 1.2, 28, 1, true), MD); nz.material.side = THREE.DoubleSide; nz.rotation.z = Math.PI / 2; nz.position.set(18.4, ZC + 0.05, 0.6 * s); G.add(nz);
    const nb = new THREE.Mesh(new THREE.CircleGeometry(0.44, 28), MB); nb.rotation.y = Math.PI / 2; nb.position.set(18.2, ZC + 0.05, 0.6 * s); G.add(nb);
    // pylons and stores
    for (const [yy, kind] of [[2.3, 'bomb'], [3.8, 'bomb'], [5.0, 'msl']]) {
      const xl = lerp(7.8, 13.4, (yy - 1.2) / 5.0) + 0.6;
      const py = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.25, 0.08), MD); py.position.set(xl + 0.9, ZC - 0.2, yy * s); G.add(py);
      const L = kind === 'msl' ? 3.0 : 2.4, R = kind === 'msl' ? 0.09 : 0.18;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, L, 16), kind === 'msl' ? new THREE.MeshStandardMaterial({ color: 0xd8dadc, roughness: 0.4 }) : new THREE.MeshStandardMaterial({ color: 0x55603f, roughness: 0.6 }));
      body.rotation.z = Math.PI / 2; body.position.set(xl + 1.0, ZC - 0.45, yy * s); G.add(body);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(R, R * 2.2, 16), body.material); cone.rotation.z = Math.PI / 2; cone.position.set(xl + 1.0 - L / 2 - R * 1.1, ZC - 0.45, yy * s); G.add(cone);
    }
    if (opt.gear !== false) {
    // main gear
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.0, 10), MD); leg.position.set(11.8, 0.95, 1.6 * s); G.add(leg);
    const wh = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.3, 24), MB); wh.rotation.x = Math.PI / 2; wh.position.set(11.8, 0.45, 1.6 * s); G.add(wh);
    const nw = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 20), MB); nw.rotation.x = Math.PI / 2; nw.position.set(4.0, 0.3, 0.14 * s); G.add(nw);
    }
  }
  if (opt.gear !== false) { const nl = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.3, 10), MD); nl.position.set(4.0, 0.95, 0); G.add(nl); }
  return G;
}
