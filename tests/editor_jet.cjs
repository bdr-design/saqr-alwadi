// The mission editor with the F-15SA: the theatre's map, «الافتراضي» brings the theatre's own first mission (not the
// valley's positions), a custom mission keeps the port and the base civilian, and the jet orbits the middle of the
// targets placed. Screenshots into tests/out/edjet/ (or the folder given).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..'), OUT = process.argv[2] || S + '/tests/out/edjet';
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + JSON.stringify(v) : '')); if (!ok) fails.push(w); };
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('saqr.ac', 'f15'); } catch (_) {} });
  const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
  await page.screenshot({ path: OUT + '/0-menu.png' });
  await page.click('#btnEdit'); await page.waitForTimeout(1500); await page.screenshot({ path: OUT + '/1-editor.png' });
  const info = await page.evaluate(() => { const g = window.__saqr; return { map: g.MAP_ID, W0: g.W0, H0: g.H0, items: g.ED.items.length }; });
  check('the editor is on the theatre, empty at first', info.map === 'theater' && info.items === 0, info);
  const scr = (x, y) => page.evaluate(([x, y]) => { const E = window.__saqr.ED; return { x: (x - E.ox) * E.s, y: (y - E.oy) * E.s }; }, [x, y]);
  const place = async (k, x, y) => { await page.click(`#edPal button[data-k="${k}"]`); const p = await scr(x, y); await page.mouse.click(p.x, p.y); await page.waitForTimeout(150); };
  await page.click('#edDefault'); await page.waitForTimeout(400);
  const def = await page.evaluate(() => window.__saqr.ED.items.map(i => [i.t, i.k, Math.round(i.x), Math.round(i.y)]));
  check("«الافتراضي»: the theatre's first mission (its units round the port, not the valley's)", def.length >= 3 && def.every(i => i[3] > 1800), def);
  await page.screenshot({ path: OUT + '/1b-default.png' });
  // «الافتراضي» from a mission at sea: its boats keep their own routes (the escape out of the harbour, the patrol)
  const seaDef = await page.evaluate(() => { const g = window.__saqr, M = g.MISSIONS, i = M.findIndex(m => m.id === 'j_sea'); M.unshift(M.splice(i, 1)[0]);
    const it = g.edDefaultItems(); M.splice(i, 0, M.shift()); return it.filter(x => x.sea).map(x => [x.k, x.path ? x.path.length : 0, !!x.escape, !!x.aim]); });
  check('«الافتراضي» at sea: the boats keep their routes and the rocket boat its target', seaDef.length >= 3 && seaDef.some(b => b[1] > 1 && b[2]) && seaDef.some(b => b[0] === 'rktboat' && b[3]), seaDef);
  await page.click('#edClear'); await page.waitForTimeout(200);
  // boats: on the water only (refused on the land), moored or round a loop that fits the water; the fishing boat civilian
  const wet = await page.evaluate(() => { const g = window.__saqr; return { sea: g.onWater(150, 2400), land: g.onWater(600, 2300), pier: g.onWater(1400, 1400) }; });
  check('the water mask: the sea off the coast, not the land', wet.sea && !wet.land && !wet.pier, wet);
  await place('dhow', 600, 2300);
  check('a boat is not put on the land', (await page.evaluate(() => window.__saqr.ED.items.length)) === 0);
  // (still in hand after the refusal: put down on the water)
  { const p = await scr(150, 2400); await page.mouse.click(p.x, p.y); await page.waitForTimeout(150); }
  await page.click('#edSel button:has-text("يدور")'); await page.waitForTimeout(150);
  await place('fishing', 120, 2600); await place('rktboat', 250, 2200);
  const boats = await page.evaluate(() => window.__saqr.ED.items.map(i => [i.k, !!i.sea, !!i.loop, !!i.civil]));
  check('boats placed: the dhow round its loop, the fishing boat civilian', JSON.stringify(boats) === JSON.stringify([['dhow', true, true, false], ['fishing', true, false, true], ['rktboat', true, false, false]]), boats);
  await page.click('#edPal button[data-k="fac"]'); await page.waitForTimeout(200);
  await page.screenshot({ path: OUT + '/1c-boats.png' });
  await page.click('#edPal button[data-k="fac"]');
  // the rocket boat's target: a point touched on the map
  { const p = await scr(250, 2200); await page.mouse.click(p.x, p.y); await page.waitForTimeout(150); }
  await page.click('#edSel button:has-text("حدد الهدف")'); await page.waitForTimeout(100);
  { const p = await scr(1300, 1500); await page.mouse.click(p.x, p.y); await page.waitForTimeout(150); }
  const aim = await page.evaluate(() => (window.__saqr.ED.items.find(i => i.k === 'rktboat').aim || []).map(Math.round));
  check('the rocket boat aimed at the point touched', aim.length === 2 && Math.hypot(aim[0] - 1300, aim[1] - 1500) < 30, aim);
  await page.screenshot({ path: OUT + '/1d-aim.png' });
  // (the men well clear of the truck, or the touch picks the truck up)
  await place('hilux', 600, 2300); await place('pax', 900, 2150); await place('launcher', 2500, 400);
  await page.screenshot({ path: OUT + '/2-placed.png' });
  const placed = await page.evaluate(() => window.__saqr.ED.items.map(i => [i.k, Math.round(i.x), Math.round(i.y), !!i.civil]));
  console.log('placed', JSON.stringify(placed));
  await page.click('#edStart'); await page.waitForTimeout(3000);
  const st = await page.evaluate(() => { const g = window.__saqr, p = g.plane; return { civil: g.houses.filter(h => h.role === 'civil').length, struct: g.houses.filter(h => h.role === 'struct').length, mission: g.S.mission, phase: g.S.phase, targets: g.targets.map(t => [t.kind, t.vk || '', Math.round(t.x), Math.round(t.y)]), oc: p.oc && [Math.round(p.oc.x), Math.round(p.oc.y)], alt: Math.round(p.alt), load: g.S.load,
    dist: g.targets.map(t => Math.round(Math.hypot(t.x - p.oc.x, t.y - p.oc.y) * g.MPP)) }; });
  check('custom mission: the port and the base civilian', st.civil > 20, st.civil);
  const sea = await page.evaluate(() => { const g = window.__saqr, b = g.vehicles.filter(v => v.mode === 'sea'), at = b.map(v => [v.x, v.y]);
    g.S.frozen = true; for (let i = 0; i < 600; i++) g.stepSim(0.05); g.S.frozen = false;
    return b.map((v, i) => ({ k: v.vk, moved: Math.round(Math.hypot(v.x - at[i][0], v.y - at[i][1]) * g.MPP), wet: g.onWater(v.x, v.y), target: g.targets.includes(v) })); });
  const salvo = await page.evaluate(() => (window.__saqr.vehicles.find(v => v.vk === 'rktboat').aim || []).map(Math.round));
  check('in the mission the rocket boat keeps its target', salvo.length === 2 && Math.hypot(salvo[0] - 1300, salvo[1] - 1500) < 30, salvo);
  check('at sea: the dhow under way round its loop, the moored ones still, all on the water; the fishing boat no target',
    sea.length === 3 && sea.every(b => b.wet) && sea[0].moved > 30 && sea[1].moved < 2 && !sea[1].target && sea[2].target, sea);
  const hs = placed.filter(q => !q[3]), cx = hs.reduce((a, q) => a + q[1], 0) / hs.length, cy = hs.reduce((a, q) => a + q[2], 0) / hs.length;
  check('the jet orbits the middle of the targets placed', st.oc && Math.hypot(st.oc[0] - cx, st.oc[1] - cy) < 5, st.oc);
  await page.screenshot({ path: OUT + '/3-play.png' });
  if (errs.length) check('no page errors', false, errs.join(' | '));
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
