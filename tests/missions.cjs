// Missions, buildings, scoring: each ready mission starts as described (time of day, aircraft station, targets);
// in the compound, fighters run into their house and are safe there until a Hellfire brings it down; a rocket on the
// civilian house counts against the mission; the Hellfire refuses a weak track; the end card shows score and rating.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const W = +(process.argv[2] || 844), H = +(process.argv[3] || 390);
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 })).newPage();
  // the menu's tabs: the maps and the missions are on «العمليات», the start on «الرئيسية»
  const tab = t => page.click('#nTabs [data-scr="' + t + '"]');
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errs.push(m.text()); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, p); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => document.querySelector('#ovLoad').hidden, null, { timeout: 120000 });
  const fails = [], check = (w, ok) => { if (!ok) fails.push(w); };
  const shot = async (n, w) => { await page.waitForTimeout(w || 0); await page.screenshot({ path: `${S}/tests/out/mis-${n}.png` }); };
  await shot('0-menu', 300);
  // each mission from the menu
  for (const id of ['convoy', 'compound', 'night']) {
    await page.evaluate(id => { const g = window.__saqr; g.S.phase = 'brief'; document.querySelector('#ovEnd').hidden = true; document.querySelector('#ovStart').hidden = false; }, id);
    const btn = await page.evaluate(id => { const g = window.__saqr; return g.MISSIONS.findIndex(m => m.id === id); }, id);
    await tab('ops'); await page.click(`#mList button:nth-child(${btn + 1})`); await page.waitForTimeout(150);
    await tab('home'); await page.click('#btnStart'); await page.waitForTimeout(600);
    const st = await page.evaluate(() => { const g = window.__saqr; return { night: g.S.night, mode: g.plane.mode, targets: g.targets.length, hostile: g.houses.filter(h => h.role === 'hostile').length, civil: g.houses.filter(h => h.role === 'civil').length, convoy: g.vehicles.filter(v => v.mode === 'convoy').length, homes: g.groups.filter(x => x.home).length }; });
    console.log(id, JSON.stringify(st));
    if (id === 'convoy') check('convoy: day, orbit, 15 targets', !st.night && st.mode === 'orbit' && st.targets === 15 && st.hostile === 0);
    if (id === 'compound') check('compound: hover 2, a hostile house, its fighters', st.mode === 'h2' && st.hostile === 1 && st.civil === 2 && st.homes === 2);
    if (id === 'night') check('night: night, hover 1, a convoy of 4', st.night && st.mode === 'h1' && st.convoy === 4 && st.hostile === 1);
    await shot('1-' + id, 2500);
  }
  // compound: alert the fighters, they run in and are safe there
  await page.evaluate(() => { const g = window.__saqr; g.S.phase = 'brief'; document.querySelector('#ovStart').hidden = false; });
  await tab('ops'); await page.click('#mList button:nth-child(2)'); await tab('home'); await page.click('#btnStart'); await page.waitForTimeout(500);
  const r = await page.evaluate(() => {
    const g = window.__saqr, S = g.S, h = g.houses.find(h => h.role === 'hostile'), civ = g.houses.find(h => h.role === 'civil');
    const step = n => { for (let i = 0; i < n; i++) g.stepSim(0.05); };
    for (const x of g.groups) g.alertGroup(x, h.x + 80, h.y);
    step(300);
    const inside = g.groups.filter(x => x.home && x.inside).length;
    // a rocket on top of the house: fighters inside unharmed, the house still standing
    g.damageAt(h.x, h.y, 'rkt');
    const afterRocket = { house: h.alive, men: g.groups.filter(x => x.home).every(x => x.alive) };
    // the Hellfire needs a medium track
    S.armed = true; S.weapon = 'msl'; g.lockOn(h, true); S.zoom = S.zoomGoal = 1; S.quality = 1;
    const weak = g.fireStatePub();
    // two Hellfires bring it down, and the fighters inside with it
    g.damageAt(h.x, h.y, 'msl'); g.damageAt(h.x, h.y, 'msl');
    const down = { house: h.alive, standing: h.standing, men: g.groups.filter(x => x.home).map(x => x.alive) };
    // a rocket on the civilian house next door
    g.damageAt(civ.x, civ.y, 'rkt');
    return { inside, afterRocket, weak: weak.en, down, civHit: S.civHit, score: g.scoreMission() };
  });
  console.log('compound', JSON.stringify(r));
  check('fighters took cover', r.inside === 2);
  check('cover holds against a rocket', r.afterRocket.house && r.afterRocket.men);
  check('Hellfire refuses a weak track', r.weak === 'TRK WEAK');
  check('house down, fighters inside dead', !r.down.house && !r.down.standing && r.down.men.every(a => !a));
  check('civilian hit counted', r.civHit === 1);
  await shot('2-ruin', 1500);
  await page.evaluate(() => { const g = window.__saqr, h = g.houses.find(h => h.role === 'hostile'); g.toSensor(); g.S.free = false; g.S.sel = null; g.S.tracking = false; g.S.aimGoal.x = g.S.aim.x = h.x; g.S.aimGoal.y = g.S.aim.y = h.y; g.S.zoomGoal = g.S.zoom = 6; });
  await shot('3-ruin-sensor', 3000);
  // end of mission: kill the rest, read the card
  await page.evaluate(() => { const g = window.__saqr; for (const t of g.targets) if (t.alive) g.kill(t); });
  await page.waitForFunction(() => !document.querySelector('#ovEnd').hidden, null, { timeout: 20000 }).catch(() => {});
  const card = await page.evaluate(() => ({ score: document.querySelector('#stScore').textContent, rate: document.querySelector('#stRate').textContent, civ: document.querySelector('#stCiv').textContent, best: document.querySelector('#stBest').textContent, shown: !document.querySelector('#ovEnd').hidden }));
  console.log('end card', JSON.stringify(card));
  check('end card with score and rating', card.shown && +card.score > 0 && card.rate !== '—' && card.civ === '1');
  check('civilian damage caps the rating', card.rate !== 'ممتاز' && card.rate !== 'جيد جدًا');
  await shot('4-end');
  console.log('failures', fails); console.log('errors', errs);
  await browser.close();
  if (fails.length || errs.length) process.exit(1);
})();
