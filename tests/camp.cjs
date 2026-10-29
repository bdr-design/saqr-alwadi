// The campaign (campStart, campEnd, campLayout): its card first in the operations, its briefing; a sortie won moves
// it on, what got away from it (the smugglers' dhow, an SAM-R left standing) is there in the next, on the water or the
// land about its area; a sortie lost is flown again; the scores add up; kept across a reload. Screenshots into
// tests/out/camp-*.png.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2 });
  await ctx.addInitScript(() => { try { localStorage.setItem('saqr.ac', 'f15'); localStorage.setItem('saqr.jstart', 'air'); } catch (_) {} });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + JSON.stringify(v) : '')); if (!ok) fails.push(w); };
  await page.evaluate(() => document.querySelector('#nTabs [data-scr="ops"]').click()); await page.waitForTimeout(400);
  const card = await page.evaluate(() => { const c = document.querySelector('#mList .mc'); return { camp: c.classList.contains('camp'), t: c.textContent }; });
  check('the campaign\'s card first in the operations', card.camp && /حملة صقر الوادي/.test(card.t) && /الطلعة 1\/5/.test(card.t), card);
  await page.evaluate(() => document.querySelector('#mList .mc.camp').click()); await page.waitForTimeout(300);
  const brief = await page.evaluate(() => document.querySelector('#mTitle').textContent + ' | ' + document.querySelector('#mDesc').textContent.slice(0, 80));
  check('its briefing: the first sortie, the strike', /الحملة/.test(brief) && /ضربة المستودعات/.test(brief), brief);
  await page.screenshot({ path: S + '/tests/out/camp-1-menu.png' });
  // sortie 1, won (all targets down)
  const win = () => page.evaluate(() => { const g = window.__saqr; g.AC.hp = 1e9; for (const t of g.targets) if (t.alive && !t.escaped) g.kill(t); });
  await page.evaluate(() => { document.querySelector('#nTabs [data-scr="home"]').click(); document.querySelector('#btnStart').click(); });
  await page.waitForTimeout(800);
  const s1 = await page.evaluate(() => ({ id: window.__saqr.S.camp && window.__saqr.MISSIONS.find(m => m.id === window.__saqr.S.missionId) }));
  await win(); await page.waitForFunction(() => !document.querySelector('#ovEnd').hidden, null, { timeout: 30000 });
  const e1 = await page.evaluate(() => ({ title: document.querySelector('#endTitle').textContent, btn: document.querySelector('#btnAgain').textContent, note: document.querySelector('#stBest').textContent, c: window.__saqr.campLoad() }));
  check('sortie 1 won: the campaign on to 2, its score counted', e1.c.step === 1 && e1.c.score > 0 && /الطلعة التالية/.test(e1.btn) && /مجموع الحملة/.test(e1.note), e1);
  // sortie 2 (the armour, with its SAM-R): the column destroyed, the SAM-R left standing
  await page.evaluate(() => document.querySelector('#btnAgain').click()); await page.waitForTimeout(800);
  const m2 = await page.evaluate(() => ({ id: window.__saqr.targets.some(t => t.vk === 'sa8'), camp: window.__saqr.S.camp }));
  check('sortie 2: the armoured column, its SAM-R there', m2.id && m2.camp, m2);
  await page.evaluate(() => { const g = window.__saqr; g.AC.hp = 1e9; const s = g.targets.find(t => t.vk === 'sa8'); s.escaped = true; for (const t of g.targets) if (t.alive && !t.escaped) g.kill(t); });
  await page.waitForFunction(() => !document.querySelector('#ovEnd').hidden, null, { timeout: 30000 });
  const e2 = await page.evaluate(() => window.__saqr.campLoad());
  check('the SAM-R that got away carried to sortie 3', e2.step === 2 && e2.carry.some(u => u.k === 'sa8' && !u.sea), e2);
  // sortie 3 (the sea): the SAM-R is there on the land; the dhow gets away, the rest down
  await page.evaluate(() => document.querySelector('#btnAgain').click()); await page.waitForTimeout(800);
  const m3 = await page.evaluate(() => { const g = window.__saqr, s = g.targets.find(t => t.vk === 'sa8'); return { sa8: !!s, dry: s ? !g.onWater(s.x, s.y) : null, inMap: s ? s.x > 0 && s.x < g.W0 && s.y > 0 && s.y < g.H0 : null }; });
  check('sortie 3: the SAM-R there, on the land', m3.sa8 && m3.dry && m3.inMap, m3);
  await page.evaluate(() => { const g = window.__saqr; g.AC.hp = 1e9; const d = g.targets.find(t => t.vk === 'dhow'); d.escaped = true; for (const t of g.targets) if (t.alive && !t.escaped) g.kill(t); });
  await page.waitForFunction(() => !document.querySelector('#ovEnd').hidden, null, { timeout: 30000 });
  // sortie 4 (the landing), lost: flown again, with the dhow on the water
  await page.evaluate(() => document.querySelector('#btnAgain').click()); await page.waitForTimeout(800);
  const m4 = await page.evaluate(() => { const g = window.__saqr, d = g.targets.find(t => t.vk === 'dhow'); return { dhow: !!d, wet: d ? g.onWater(d.x, d.y) : null }; });
  check('sortie 4: the dhow that got away is there, on the water', m4.dhow && m4.wet, m4);
  await page.evaluate(() => { const g = window.__saqr; g.AC.hp = 1; g.acHit(50, 'msl'); });
  await page.waitForFunction(() => !document.querySelector('#ovEnd').hidden, null, { timeout: 30000 });
  const e4 = await page.evaluate(() => ({ c: window.__saqr.campLoad(), btn: document.querySelector('#btnAgain').textContent }));
  check('sortie 4 lost: flown again, the campaign where it was', e4.c.step === 3 && /إعادة الطلعة/.test(e4.btn), e4);
  await page.screenshot({ path: S + '/tests/out/camp-2-lost.png' });
  // kept across a reload
  await page.reload(); await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
  const kept = await page.evaluate(() => { document.querySelector('#nTabs [data-scr="ops"]').click(); return { c: window.__saqr.campLoad().step, t: document.querySelector('#mList .mc.camp').textContent }; });
  check('kept across a reload', kept.c === 3 && /الطلعة 4\/5/.test(kept.t), kept);
  check('no page errors', !errs.length, errs);
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
