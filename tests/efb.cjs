// The ZF-25 officer's iPad (EFB): raised and lowered by the keypad's top-left key, the tasking on it (a 9-line from
// HUNTER on the close-support sortie), its pages, the pilot's orders from it (fly to a picked point, the height,
// home); a new tasking in an operation's next phase shows on the UFC until it is read; nothing drawn while it is down.
// Screenshots into tests/out/efb-<lang>-*.png. node tests/efb.cjs [width height [ar|en]]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const W = +(process.argv[2] || 844), H = +(process.argv[3] || 390), LANG = process.argv[4] || 'ar';
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
  await ctx.addInitScript(LANG => { try { localStorage.setItem('saqr.map', 'theater'); localStorage.setItem('saqr.ac', 'f15'); localStorage.setItem('saqr.lang', LANG); localStorage.setItem('saqr.jstart', 'air'); } catch (_) {} }, LANG);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED')) errs.push(m.text()); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 240000 });
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + v : '')); if (!ok) fails.push(w); };
  const shot = async (n, wait) => { await page.waitForTimeout(wait || 0); await page.screenshot({ path: `${S}/tests/out/efb-${LANG}-${n}.png` }); };
  const start = id => page.evaluate(id => { const g = window.__saqr; document.querySelectorAll('#mList .mc:not(.camp)')[g.MISSIONS.findIndex(m => m.id === id)].click(); document.querySelector('#btnStart').click(); g.AC.hp = 1e9; }, id);
  // a touch on the screen at a point of the iPad's own screen (its logical pixels)
  const drawn = () => page.waitForFunction(() => !window.__saqr.EFB.dirty, null, { timeout: 10000, polling: 50 });
  const tap = async q => { const p = await page.evaluate(q => { const E = window.__saqr.EFB, k = E.box.w / E.W; return { x: E.box.x + q.x * k, y: E.box.y + q.y * k }; }, q); await page.mouse.click(p.x, p.y); await page.waitForTimeout(150); await drawn(); };
    await start('j_cas'); await page.waitForTimeout(2500);
  check('down at the start, off the page', await page.evaluate(() => !window.__saqr.EFB.up && document.querySelector('#efb').hidden));
  const t = await page.evaluate(() => { const T = window.__saqr.EFB.task; return T && { title: T.title, rows: T.rows, rmk: T.rmk, state: T.state }; });
  check('the CAS sortie: a 9-line from HUNTER, accepted on the ground', t && t.title === (LANG === 'en' ? 'CAS 9-LINE · HUNTER' : 'إسناد قريب \u200e9-LINE · هنتر') && t.rows.length === 9 && t.state === 'wilco', JSON.stringify(t));
  // the key: the keypad's top-left, beside the UFC
  const key = await page.evaluate(() => window.__saqr.ckFromImg({ x: 928, y: 402 }));
  await page.mouse.click(key.x, key.y); await page.waitForTimeout(700);
  check('the key raises it', await page.evaluate(() => window.__saqr.EFB.up && !document.querySelector('#efb').hidden));
  await shot('1-map', 300);
  const box = await page.evaluate(() => { const E = window.__saqr.EFB; return { box: E.box, near: E.boxN, W: E.W, H: E.H }; });
  check('on the knee, smaller than up to the eye', box.box.w < box.near.w * 0.85, Math.round(box.box.w) + ' of ' + Math.round(box.near.w) + ' px');
  check('up to the eye, its screen legible (at least 400 css px across)', box.near.w >= 400, Math.round(box.near.w) + ' px, logical ' + Math.round(box.W));
  // a point picked on the map, and FLY TO
  await tap({ x: box.W * 0.35, y: box.H * 0.62 });
  check('a touch on the map picks a point', await page.evaluate(() => !!window.__saqr.EFB.pick));
  await shot('2-pick', 100);
  await drawn();
  const fly = await page.evaluate(() => { const E = window.__saqr.EFB, h = E.hits.find(h => h.w === 86 && h.y < E.H - 50); return h && { x: h.x + h.w / 2, y: h.y + h.h / 2 }; });
  await tap(fly);
  check('FLY TO: the pilot goes there', await page.evaluate(() => window.__saqr.plane.mode === 'hp' && !window.__saqr.EFB.pick));
  // the pages
  for (const [i, n] of [[1, '9line'], [2, 'ato'], [3, 'chk']]) {
    const q = await page.evaluate(i => { const E = window.__saqr.EFB, h = E.hits.filter(h => h.y === 26)[1 + i]; return { x: h.x + h.w / 2, y: h.y + h.h / 2 }; }, i);
    await tap(q); check('page ' + n, await page.evaluate(() => window.__saqr.EFB.tab) === n);
    await shot('3-' + n, 200);
  }
  const q0 = await page.evaluate(() => { const E = window.__saqr.EFB, h = E.hits.filter(h => h.y === 26)[1]; return { x: h.x + h.w / 2, y: h.y + h.h / 2 }; });
  await tap(q0);
  // the height, from the iPad (the map page drawn again first)
  await page.waitForFunction(() => { const E = window.__saqr.EFB; return E.tab === 'map' && !E.dirty && E.hits.some(h => h.w === 86 && h.y > E.H - 50); }, null, { timeout: 10000 });
  const h0 = await page.evaluate(() => window.__saqr.JX.h);
  const alt = await page.evaluate(() => { const E = window.__saqr.EFB, h = E.hits.find(h => h.w === 86 && h.y > E.H - 50 && h.x < E.W - 100 && h.x > E.W - 200); return { x: h.x + h.w / 2, y: h.y + h.h / 2 }; });
  await tap(alt);
  check('ANGELS: a new height', await page.evaluate(h0 => window.__saqr.JX.h > h0, h0));
  // lowered: the hand drawn down (on a phone it covers the key), and nothing drawn while down
  const grip = await page.evaluate(() => { const r = document.querySelector('.efbGrip').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height * 0.4 }; });
  await page.mouse.move(grip.x, grip.y); await page.mouse.down(); await page.mouse.move(grip.x, grip.y + 50, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(800);
  const cost = await page.evaluate(() => { const E = window.__saqr.EFB; E.dirty = true; return { up: E.up, hidden: document.querySelector('#efb').hidden }; });
  await page.waitForTimeout(300);
  check('lowered by drawing the hand down, taken off the page', !cost.up && cost.hidden);
  check('nothing drawn while down', await page.evaluate(() => window.__saqr.EFB.dirty === true));
  // an operation's next phase: a new tasking, pending, its line on the UFC until read
  await start('j_op'); await page.waitForTimeout(2000);
  await page.evaluate(() => { const g = window.__saqr; g.targets.forEach(t => g.kill(t)); });
  await page.waitForFunction(() => window.__saqr.EFB.unseen === 1, null, { timeout: 60000, polling: 300 }).catch(() => {});
  const ph = await page.evaluate(() => { const E = window.__saqr.EFB; return { unseen: E.unseen, state: E.task && E.task.state }; });
  check('a new tasking: pending, cued on the UFC', ph.unseen === 1 && ph.state === 'pending', JSON.stringify(ph));
  const key2 = await page.evaluate(() => window.__saqr.ckFromImg({ x: 928, y: 402 }));
  await page.mouse.click(key2.x, key2.y); await page.waitForTimeout(700);
  console.log(await page.evaluate(() => { const g = window.__saqr; return JSON.stringify({ up: g.EFB.up, ph: g.S.phase, goal: g.CK.goal, key: g.ckFromImg({ x: 928, y: 402 }), hidden: document.querySelector('#efb').hidden, unseen: g.EFB.unseen }); }), JSON.stringify(key));
  check('raised, the card read', await page.evaluate(() => window.__saqr.EFB.unseen === 0));
  await shot('4-pending', 200);
  await drawn();
  const wil = await page.evaluate(() => { const E = window.__saqr.EFB, h = E.hits.find(h => h.h === 26 && h.y > 100 && h.x > E.W / 2 && h.w > 60 && h.w !== 86); return { x: h.x + h.w / 2, y: h.y + h.h / 2 }; });
  await tap(wil);
  check('WILCO', await page.evaluate(() => window.__saqr.EFB.task.state) === 'wilco');
  // home: RTB, confirmed
  const rtb = async () => { const q = await page.evaluate(() => { const E = window.__saqr.EFB, h = E.hits.filter(h => h.w === 86 && h.y > E.H - 50).pop(); return { x: h.x + h.w / 2, y: h.y + h.h / 2 }; }); await tap(q); };
  await rtb(); check('RTB asks again first', await page.evaluate(() => window.__saqr.EFB.rtbT > 0 && window.__saqr.S.phase === 'play'));
  await rtb(); await page.evaluate(() => { for (let i = 0; i < 160; i++) window.__saqr.stepSim(0.05); }); await page.waitForTimeout(600);
  console.log(await page.evaluate(() => { const g = window.__saqr; return JSON.stringify({ ph: g.S.phase, rtb: g.S.rtbCall, up: g.EFB.up, rtbT: g.EFB.rtbT, mode: g.plane.mode, log: g.AC.log.slice(-3).map(l => l.en) }); }));
  check('confirmed: the sortie ends, home', await page.evaluate(() => window.__saqr.S.phase === 'end' && !window.__saqr.EFB.up));
  console.log('errors', JSON.stringify(errs));
  check('no page errors', errs.length === 0, errs.length);
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close(); process.exit(fails.length ? 1 : 0);
})();
