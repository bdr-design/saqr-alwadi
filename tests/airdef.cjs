// The air-defence operator's console (src/game/07b-airdef.js): chosen from the menu, its sortie started, every control
// pressed by its place in the photograph (what each changes checked), the lean-in on a display and back, the pause and
// back to the menu, the console in a portrait window (turned on its side), and the other two seats still as they were.
// node tests/airdef.cjs [width height]   (screenshots in tests/out/ada-*.png)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const W = +(process.argv[2] || 844), H = +(process.argv[3] || 390);
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.js': 'application/javascript' };
let fails = 0;
const ok = (c, m, v) => { console.log((c ? 'ok   ' : 'FAIL ') + m + (v !== undefined ? ': ' + (typeof v === 'string' ? v : JSON.stringify(v)) : '')); if (!c) fails++; };
async function open(browser, ac, w, h) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await ctx.addInitScript(a => { try { localStorage.setItem('saqr.ac', a); localStorage.setItem('saqr.lang', 'ar'); } catch (_) {}
    // (the page's frame requests counted: the console sleeps between its quarter-second ticks)
    const raf = window.requestAnimationFrame.bind(window); window.__rafN = 0; window.requestAnimationFrame = f => { window.__rafN++; return raf(f); }; }, ac);
  const page = await ctx.newPage();
  const errs = [], urls = []; page.on('request', q => urls.push(q.url())); page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !m.text().includes('ERR_FAILED') && !m.text().includes('404')) errs.push(m.text()); });
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = decodeURIComponent(new URL(u).pathname); if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
      const f = path.join(S, p); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 180000 });
  return { page, ctx, errs, urls };
}
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const { page, ctx, errs, urls } = await open(browser, 'ada', W, H);
  const shot = async (name, wait) => { await page.waitForTimeout(wait || 0); await page.screenshot({ path: `${S}/tests/out/ada-${name}.png` }); };
  // the menu: the third seat chosen, its one map, its mission
  const menu = await page.evaluate(() => ({ ada: window.__saqr.ADA, on: document.querySelector('#segAC button.on').dataset.a, maps: [...document.querySelectorAll('#mMaps button')].map(b => b.dataset.m), map: window.__saqr.MAP_ID,
    cards: [...document.querySelectorAll('#mList .mc b')].map(b => b.textContent), loads: getComputedStyle(document.querySelector('.nLoads')).display, sub: document.querySelector('#mSub').textContent }));
  ok(menu.ada && menu.on === 'ada', 'the air-defence seat chosen', menu.on);
  ok(menu.map === 'theater' && menu.maps.length === 1 && menu.maps[0] === 'theater', 'its map: the theatre only', menu.maps);
  ok(menu.cards.length === 1 && menu.cards[0] === 'ليلة الاعتراض', 'its mission (no custom one: no layout to edit)', menu.cards);
  ok(menu.loads === 'none', 'no loadout to choose');
  ok(menu.sub.includes('IAMD'), 'its name in the menu', menu.sub);
  // none of the world loaded, built or sounded for this seat: no sprites, no tiles, no cockpit photograph, a canvas of a
  // pixel, no engine or rendered sounds, no editor
  // (the operations map's own level-0 pictures excepted: shown in the menu, as for the other seats)
  { const world = urls.filter(u => /\/sprites\/(?!console\.webp|menu\/)|\/tiles\/(?!0\/)|cockpit_|f15_(day|night)/.test(u));
    ok(world.length === 0, 'none of the world\'s pictures fetched', world.slice(0, 5));
    const w = await page.evaluate(() => ({ gl: [document.querySelector('#gl').width, document.querySelector('#gl').height], eng: !!window.__saqr.Snd.engine, jobs: window.__saqr.Snd.jobsTotal, edit: getComputedStyle(document.querySelector('#btnEdit')).display }));
    ok(w.gl[0] <= 2 && w.gl[1] <= 2, 'the world\'s canvas kept at a pixel', w.gl);
    ok(!w.eng && !w.jobs, 'no engine sound, nothing rendered for sound', w);
    ok(w.edit === 'none', 'no target editor'); }
  await shot('0-menu');
  await page.evaluate(() => document.querySelector('#nTabs [data-scr="ops"]').click()); await shot('0b-ops', 600);
  await page.evaluate(() => document.querySelector('#nTabs [data-scr="home"]').click());
  // the sortie
  await page.click('#btnStart');
  await page.waitForFunction(() => window.__saqr.AD.on && !document.querySelector('#adc').hidden, null, { timeout: 20000 });
  await page.waitForTimeout(800);
  const st0 = await page.evaluate(() => { const A = window.__saqr.AD, cv = ['A', 'B', 'C', 'D'].map(s => { const e = document.querySelector('#adc' + s), r = e.getBoundingClientRect(); return [e.width, e.height, Math.round(r.width), Math.round(r.height)]; });
    return { k: A.k, msg: A.msg && A.msg.en, cv, cock: getComputedStyle(document.querySelector('#cockpit')).display, rail: getComputedStyle(document.querySelector('#railR')).display, dock: getComputedStyle(document.querySelector('#dock')).display, img: document.querySelector('#adcImg').naturalWidth }; });
  ok(st0.img === 1846, 'the console photograph loaded', st0.img);
  ok(st0.cock === 'none' && st0.rail === 'none' && st0.dock === 'none', 'no cockpit, rails or dock in this seat');
  ok(st0.msg === 'IAMD ONLINE, ALL SYSTEMS GREEN', 'its first message', st0.msg);
  ok(st0.cv.every(([w, h, cw, ch]) => w >= 64 && Math.abs(w / h - cw / ch) < 0.03 && w >= cw * 1.9), 'the displays sharp at their size on the screen (backing at least 2x their CSS box)', st0.cv);
  // the console's core whole on the screen
  const core = await page.evaluate(() => { const A = window.__saqr.AD; return [340 * A.k + A.ox, 84 * A.k + A.oy, 1500 * A.k + A.ox, 800 * A.k + A.oy]; });
  ok(core[0] > -1 && core[1] > -1 && core[2] < W + 1 && core[3] < H + 1, 'the console\'s core whole on the screen', core.map(Math.round));
  await shot('1-console', 200);
  // press a control by its place in the photograph
  const press = async (x, y) => { const p = await page.evaluate(([x, y]) => { const A = window.__saqr.AD; return { x: x * A.k + A.ox, y: y * A.k + A.oy }; }, [x, y]); await page.mouse.click(p.x, p.y); await page.waitForTimeout(150); };
  const get = () => page.evaluate(() => { const A = window.__saqr.AD; return { rng: A.rng, az: A.az, mode: A.mode, cam: A.cam, fov: A.fov, pol: A.pol, page: A.page, cram: A.cram, sys: A.sys, doc: A.doc, armed: A.armed, hold: A.hold, cur: { ...A.cur }, msg: A.msg && A.msg.en }; });
  await press(382, 150); ok((await get()).rng === 200, 'RNG + : 200 km');
  await press(382, 205); await press(382, 205); ok((await get()).rng === 50, 'RNG - twice: 50 km');
  await press(382, 262); ok((await get()).az === 85, 'AZ < : 085');
  await press(382, 320); await press(382, 320); ok((await get()).az === 105, 'AZ > twice: 105');
  await press(382, 378); { const g = await get(); ok(g.mode === 1 && g.msg === 'RADAR MODE BALLISTIC SEARCH', 'MODE: ballistic search, said', g.msg); }
  await press(1463, 205); ok((await get()).cam === 'tv', 'TV');
  await press(1463, 320); ok((await get()).fov === 'n', 'NFOV');
  await press(1463, 378); ok((await get()).pol === 'wh', 'POL does nothing on TV');
  await press(1463, 150); await press(1463, 378); { const g = await get(); ok(g.cam === 'ir' && g.pol === 'bh', 'IR, then POL: black hot'); }
  await press(1463, 262); ok((await get()).fov === 'w', 'WFOV');
  await press(468, 465); ok((await get()).msg === 'NO TRACKS', 'a tracks key with none: says so');
  await press(1378, 465); ok((await get()).page === 'cap', 'CAP page');
  await press(1309, 465); ok((await get()).page === 'lnch', 'LNCH page');
  await press(1378, 577); { const g = await get(); ok(!g.cram && g.msg === 'CLOSE-IN GUN HOLD', 'GUN HOLD'); }
  await press(1309, 577); ok((await get()).cram, 'GUN AUTO');
  await press(597, 718); ok((await get()).sys === 0, 'SYSTEM knob: AUTO to UPR');
  await press(712, 718); ok((await get()).doc === 2, 'DOCTRINE knob: SS to SLS');
  await press(852, 747); await press(879, 720); { const g = await get(); ok(g.cur.r < 50 && g.cur.b === 4, 'the hat: cursor in and right', g.cur); }
  await press(852, 693); await press(852, 693); ok((await get()).cur.r === 50, 'the hat: cursor out, held at the range ring (50 km)');
  await press(1381, 727); ok((await get()).msg === 'MASTER ARM SAFE', 'ENGAGE while safe: refused');
  await press(1238, 708); ok((await get()).armed, 'ARM');
  await press(465, 712); { const g = await get(); ok(g.hold && g.msg === 'HOLD FIRE, ALL UNITS', 'HOLD FIRE'); }
  await press(1381, 727); ok((await get()).msg === 'HOLD FIRE IN EFFECT', 'ENGAGE under hold fire: refused');
  await shot('2-pressed', 200);
  // a touch on a display's middle does nothing; twice leans in, twice again sits back
  const before = await get();
  await press(660, 250); ok(JSON.stringify(await get()) === JSON.stringify(before), 'one touch on a display: nothing');
  const dbl = async (x, y) => { const p = await page.evaluate(([x, y]) => { const A = window.__saqr.AD; return { x: x * A.k + A.ox, y: y * A.k + A.oy }; }, [x, y]); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120); await page.mouse.click(p.x, p.y); await page.waitForTimeout(600); };
  await dbl(660, 250);
  const z = await page.evaluate(() => { const A = window.__saqr.AD; return { zoom: A.zoom, k: A.k, w: document.querySelector('#adcA').width }; });
  ok(z.zoom === 'A' && z.k > st0.k * 1.4 && z.w > st0.cv[0][0] * 1.4, 'leaned in on the air picture, its canvas sharper', z);
  await shot('3-lean-A');
  await press(382, 150); ok((await get()).rng === 100, 'its keys still work leaned in');
  { const big = await page.evaluate(() => document.querySelector('#adcA').width);
    const p = await page.evaluate(() => { const A = window.__saqr.AD; return { x: 660 * A.k + A.ox, y: 250 * A.k + A.oy }; });
    await page.mouse.click(p.x, p.y); await page.waitForTimeout(120); await page.mouse.click(p.x, p.y); await page.waitForTimeout(60);
    const mid = await page.evaluate(() => [window.__saqr.AD.zoom, document.querySelector('#adcA').width]);
    ok(mid[0] === null && mid[1] === big, 'leaning out: the display kept sharp through the glide', mid);
    await page.waitForTimeout(600); const after = await page.evaluate(() => document.querySelector('#adcA').width);
    ok(after < big, 'and made small again after it', [big, after]); }
  // the console still: its loop wakes a few times a second, not at the screen's rate
  { await page.waitForTimeout(1200); const n0 = await page.evaluate(() => window.__rafN); await page.waitForTimeout(2000); const n = (await page.evaluate(() => window.__rafN)) - n0;
    ok(n >= 4 && n <= 14, 'the still console wakes some 4 times a second (2 s)', n); }
  // a press shows at once (the loop woken, not waiting its quarter second)
  { const t = await page.evaluate(() => { const A = window.__saqr.AD; return A.drawn.A; }); await press(382, 205); const t2 = await page.evaluate(() => window.__saqr.AD.drawn.A); ok(t2 > t, 'a press drawn at once'); await press(382, 150); }
  // the pause, and back to the menu
  await page.click('#adcPause'); ok(await page.evaluate(() => !document.querySelector('#adcPanel').hidden), 'pause panel');
  { const t0 = await page.evaluate(() => window.__saqr.AD.t); await page.waitForTimeout(1200); const t1 = await page.evaluate(() => window.__saqr.AD.t); ok(t1 === t0, 'paused: the sortie\'s time stands still', [t0, t1]);
    const p0 = await get(); await press(382, 150); ok((await get()).rng === p0.rng, 'paused: the console takes no press'); }
  await shot('5-pause');
  // (the window resized under the pause: the displays drawn again at once, not left blank)
  await page.setViewportSize({ width: W - 60, height: H }); await page.waitForTimeout(500);
  ok(await page.evaluate(() => { const A = window.__saqr.AD; return 'ABCDK'.split('').every(s => A.drawn[s] === A.rev[s]); }), 'resized while paused: every display drawn again');
  await page.setViewportSize({ width: W, height: H }); await page.waitForTimeout(300);
  { const t0 = await page.evaluate(() => window.__saqr.AD.t);   await page.click('#adcResume'); ok(await page.evaluate(() => document.querySelector('#adcPanel').hidden), 'resumed'); await page.waitForTimeout(300);
    const t1 = await page.evaluate(() => window.__saqr.AD.t); ok(t1 - t0 < 0.6, 'the time after the pause takes up from where it stood', +(t1 - t0).toFixed(2)); }
  // the system's back (the Android app): opens the pause, and shuts it
  ok(await page.evaluate(() => window.__back() && !document.querySelector('#adcPanel').hidden), 'back: pause');
  ok(await page.evaluate(() => window.__back() && document.querySelector('#adcPanel').hidden), 'back again: resumed');
  await page.click('#adcPause'); await page.click('#adcQuit');
  ok(await page.evaluate(() => document.querySelector('#adc').hidden && !document.querySelector('#ovStart').hidden && !window.__saqr.AD.on), 'back to the menu');
  ok(await page.evaluate(() => ['A', 'B', 'C', 'D'].every(s => document.querySelector('#adc' + s).width === 0) && document.querySelector('#adcOver').width === 0), 'its canvases let go behind the menu');
  // started again: everything as new
  await page.click('#btnStart'); await page.waitForTimeout(500);
  { const g = await get(); ok(g.rng === 100 && g.sys === 3 && !g.armed && !g.hold && g.page === 'lnch', 'a new sortie starts fresh', g); }
  ok(errs.length === 0, 'no page errors', errs);
  await ctx.close();
  // a portrait window: the console turned on its side, its controls still where they are drawn
  { const { page: p2, ctx: c2, errs: e2 } = await open(browser, 'ada', H, W);
    await p2.click('#btnStart'); await p2.waitForTimeout(800);
    const pr = async (x, y) => { const q = await p2.evaluate(([x, y]) => { const A = window.__saqr.AD; return { x: x * A.k + A.ox, y: y * A.k + A.oy }; }, [x, y]); await p2.mouse.click(innerW(q), q.x); await p2.waitForTimeout(150); };
    // (the app turned 90 degrees: its x along the window's height, its y from the window's right edge)
    const innerW = q => H - q.y;
    await pr(382, 150); ok((await p2.evaluate(() => window.__saqr.AD.rng)) === 200, 'portrait: RNG + found by its place');
    await p2.screenshot({ path: `${S}/tests/out/ada-4-portrait.png` });
    ok(e2.length === 0, 'portrait: no page errors', e2); await c2.close(); }
  // the other seats untouched: the menu shows their own name and no console
  for (const ac of ['ah64', 'f15']) {
    const { page: p3, ctx: c3, errs: e3 } = await open(browser, ac, W, H);
    const m = await p3.evaluate(() => ({ ada: window.__saqr.ADA, on: document.querySelector('#segAC button.on').dataset.a, adc: document.querySelector('#adc').hidden, loads: getComputedStyle(document.querySelector('.nLoads')).display }));
    ok(!m.ada && m.on === ac && m.adc && m.loads !== 'none', ac + ': its own seat, no console, its loadouts', m);
    ok(e3.length === 0, ac + ': no page errors', e3); await c3.close();
  }
  await browser.close();
  console.log(fails ? fails + ' failed' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
