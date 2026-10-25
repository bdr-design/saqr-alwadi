// Mission editor: opens on the default mission, clears, places vehicles (one driving the road), fighters and houses
// by tapping as a player would, edits them, starts the mission and checks the world matches the layout.
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
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errs.push(m.text()); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, p); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 120000 });
  await page.waitForTimeout(1500);
  const fails = [], check = (w, ok) => { if (!ok) fails.push(w); };
  const shot = async (n, w) => { await page.waitForTimeout(w || 0); await page.screenshot({ path: `${S}/tests/out/ed-${n}.png` }); };
  await page.click('#btnEdit'); await shot('0-default', 1500);
  // a first visit opens an empty valley: the default mission's fixed targets are not carried over
  check('opens empty', await page.evaluate(() => window.__saqr.ED.items.length === 0));
  await page.click('#edDefault'); await page.waitForTimeout(200);
  const nDef = await page.evaluate(() => window.__saqr.ED.items.length);
  console.log('default layout items', nDef); check('«الافتراضي» brings the default mission', nDef > 10);
  await page.click('#edClear'); await page.waitForTimeout(200);
  check('start disabled with no targets', await page.evaluate(() => document.querySelector('#edStart').disabled));
  // screen position of a map point in the editor
  const scr = (x, y) => page.evaluate(([x, y]) => { const E = window.__saqr.ED; return { x: (x - E.ox) * E.s, y: (y - E.oy) * E.s }; }, [x, y]);
  // one pick, one placement: the new item is selected and the bar is free again
  const place = async (k, x, y) => { await page.click(`#edPal button[data-k="${k}"]`); const p = await scr(x, y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(150); };
  await place('hilux', 700, 300);
  await place('mrap', 1050, 600);
  await place('pax', 800, 420);
  await place('house1', 640, 180);
  await place('house4', 1100, 780);
  check('placed item selected, bar free', await page.evaluate(() => { const E = window.__saqr.ED; return E.sel === E.items.length - 1 && E.arm === null; }));
  // a placed target can be picked up again, even with something chosen in the bar: tap it while the bar is armed
  await place('suv', 900, 150);
  await page.click('#edPal button[data-k="cargo"]');
  let q = await scr(900, 150); await page.mouse.click(q.x, q.y); await page.waitForTimeout(150);
  check('tap on an item selects it (not a new one)', await page.evaluate(() => { const E = window.__saqr.ED; return E.items.length === 6 && E.items[E.sel] && E.items[E.sel].k === 'suv'; }));
  check('the bar is put down', await page.evaluate(() => window.__saqr.ED.arm === null));
  await page.click('#edSel >> text=حذف'); await page.waitForTimeout(150);
  check('deleted', await page.evaluate(() => !window.__saqr.ED.items.some(i => i.k === 'suv')));
  // the MRAP drives: select it, set it moving, northbound, fast
  let p = await scr(1050, 600); await page.mouse.click(p.x, p.y); await page.waitForTimeout(200);
  await page.click('#edSel >> text=متحركة'); await page.click('#edSel >> text=شمالًا ↑'); await page.click('#edSel >> text=سريعة');
  // drag the hilux somewhere else, rotate it
  p = await scr(700, 300); const p2 = await scr(760, 520);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p2.x, p2.y, { steps: 8 }); await page.mouse.up(); await page.waitForTimeout(200);
  await page.click('#edSel >> text=تدوير ↻');
  // five fighters
  p = await scr(800, 420); await page.mouse.click(p.x, p.y); await page.waitForTimeout(150); await page.click('#edSel >> text=+'); await page.click('#edSel >> text=+');
  await shot('1-layout', 400);
  const lay = await page.evaluate(() => window.__saqr.ED.items);
  console.log(JSON.stringify(lay.map(i => [i.t, i.k, Math.round(i.x), Math.round(i.y), i.move, i.dir, i.spd, i.n])));
  check('5 items', lay.length === 5);
  const mr = lay.find(i => i.k === 'mrap'), hx = lay.find(i => i.k === 'hilux'), px = lay.find(i => i.t === 'pax');
  check('mrap moving north fast on the road', mr && mr.move && mr.dir === -1 && mr.spd === 14 && mr.s > 0);
  check('hilux moved', hx && Math.abs(hx.x - 760) < 6 && Math.abs(hx.y - 520) < 6);
  check('pax 5', px && px.n === 5);
  check('saved', await page.evaluate(() => JSON.parse(localStorage.getItem('saqr.layout')).items.length === 5));
  await page.click('#edStart'); await page.waitForTimeout(2500);
  const w = await page.evaluate(() => { const g = window.__saqr; return { targets: g.targets.length, veh: g.vehicles.map(v => [v.vk, v.mode, v.dir]), pax: g.groups.map(x => x.men.length), houses: g.houses.map(h => h.kind), phase: g.S.phase }; });
  console.log(JSON.stringify(w));
  check('world: 3 targets', w.targets === 3);
  check('world: mrap solo northbound', w.veh.some(v => v[0] === 'mrap' && v[1] === 'solo' && v[2] === -1));
  check('world: hilux parked', w.veh.some(v => v[0] === 'hilux' && v[1] === 'parked'));
  check('world: 2 houses', w.houses.length === 2);
  check('playing', w.phase === 'play');
  await page.evaluate(() => window.__saqr.toSensor());
  await page.evaluate(() => { const g = window.__saqr, h = g.houses[0]; g.S.aimGoal.x = g.S.aim.x = h.x; g.S.aimGoal.y = g.S.aim.y = h.y; g.S.free = false; g.S.zoomGoal = 12; });
  await shot('2-house-sensor', 3500);
  console.log('failures', fails); console.log('errors', errs);
  await browser.close();
  if (fails.length || errs.length) process.exit(1);
})();
