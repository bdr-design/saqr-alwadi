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
  { const world = urls.filter(u => /\/sprites\/(?!console\.webp|menu\/|radio_ada\.mp3|ada_(sky|out|out_lit|smoke)\.webp)|\/tiles\/(?!0\/)|cockpit_|f15_(day|night)/.test(u));
    ok(world.length === 0, 'none of the world\'s pictures fetched', world.slice(0, 5));
    const w = await page.evaluate(() => ({ gl: [document.querySelector('#gl').width, document.querySelector('#gl').height], eng: !!window.__saqr.Snd.engine, jobs: window.__saqr.Snd.jobsTotal, edit: getComputedStyle(document.querySelector('#btnEdit')).display }));
    ok(w.gl[0] <= 2 && w.gl[1] <= 2, 'the world\'s canvas kept at a pixel', w.gl);
    ok(!w.eng && !w.jobs, 'no engine sound, nothing rendered for sound', w);
    ok(w.edit === 'none', 'no target editor');
    // its own voice: the console's bank in, every line the console says made of pieces it has, a line joined
    const v = await page.evaluate(() => { const g = window.__saqr, b = g.banksPub(); const c = g.radioClip(['a.track', 'a.n.0', 'a.n.2', 'a.hooked'], g.bankAd);
      return { ada: b[4], others: b.slice(0, 4).every(x => !x), clip: c ? +(c.d.length / c.sr).toFixed(2) : 0, n: Object.keys(g.RADIO_ADA.clips).length, len: +g.adaVoiceLen(['a.online']).toFixed(2) }; });
    ok(v.ada && v.others && v.clip > 1 && v.n > 40 && v.len > 2, 'its voice bank (and none of the aircraft\'s), a line joined from its pieces', v);
    const src = ['07b-airdef', '07c-adsim', '07d-adwpn'].map(f => fs.readFileSync(S + '/src/game/' + f + '.js', 'utf8')).join('\n'), ids = new Set(Object.keys(await page.evaluate(() => window.__saqr.RADIO_ADA.clips)));
    const used = [...src.matchAll(/'((?:a|q)\.[a-zA-Z.]+)'/g)].map(m => m[1]).filter(k => !/\.$/.test(k)), missing = [...new Set(used)].filter(k => !ids.has(k) && !/^a\.(i|c)\.$/.test(k));
    ok(missing.length === 0, 'every piece the console says is recorded', missing); }
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
  await press(382, 150); ok((await get()).rng === 100, 'RNG + : 100 km');
  await press(382, 205); await press(382, 205); ok((await get()).rng === 25, 'RNG - twice: 25 km');
  await press(382, 262); ok((await get()).az === 85, 'AZ < : 085');
  await press(382, 320); await press(382, 320); ok((await get()).az === 105, 'AZ > twice: 105');
  await press(382, 378); { const g = await get(); ok(g.mode === 1 && g.msg === 'RADAR MODE BALLISTIC SEARCH', 'MODE: ballistic search, said', g.msg); }
  await press(1463, 205); ok((await get()).cam === 'tv', 'TV');
  await press(1463, 320); ok((await get()).fov === 'n', 'NFOV');
  await press(1463, 378); ok((await get()).pol === 'wh', 'POL does nothing on TV');
  await press(1463, 150); await press(1463, 378); { const g = await get(); ok(g.cam === 'ir' && g.pol === 'bh', 'IR, then POL: black hot'); }
  await press(1463, 262); ok((await get()).fov === 'w', 'WFOV');
  await press(468, 465); ok(/NO TRACKS|HOOKED/.test((await get()).msg), 'a tracks key: says there are none, or hooks one');
  await press(1378, 465); ok((await get()).page === 'cap', 'CAP page');
  await press(1309, 465); ok((await get()).page === 'lnch', 'LNCH page');
  await press(1378, 577); { const g = await get(); ok(!g.cram && g.msg === 'CLOSE-IN GUN HOLD', 'GUN HOLD'); }
  await press(1309, 577); ok((await get()).cram, 'GUN AUTO');
  await press(597, 718); ok((await get()).sys === 0, 'SYSTEM knob: AUTO to UPR');
  await press(712, 718); ok((await get()).doc === 2, 'DOCTRINE knob: SS to SLS');
  await press(852, 747); await press(879, 720); { const g = await get(); ok(g.cur.r < 50 && g.cur.b === 4, 'the hat: cursor in and right', g.cur); }
  await press(852, 693); await press(852, 693); ok((await get()).cur.r === 25, 'the hat: cursor out, held at the range ring (25 km)');
  await press(1381, 727); ok((await get()).msg === 'MASTER ARM SAFE', 'ENGAGE while safe: refused');
  await press(1238, 708); ok((await get()).armed, 'ARM');
  await press(465, 712); { const g = await get(); ok(g.hold && g.msg === 'HOLD FIRE, ALL UNITS', 'HOLD FIRE'); }
  await press(1381, 727); ok((await get()).msg === 'HOLD FIRE IN EFFECT', 'ENGAGE under hold fire: refused');
  await shot('2-pressed', 200);
  // the air picture: drones seen within seconds, classified suspect; the assist lights UP; UP hooks the soonest, the
  // camera on it; the transport from the south, unknown till IFF, a friend after it; DROP lets go
  { await page.evaluate(() => window.__saqr.adsHook(null));
    const st = await page.evaluate(() => { const g = window.__saqr; while (g.ADS.t < 12) g.adaFrame(0.25); return { tr: g.ADS.tr.map(t => t.cls + ':' + t.id), cue: g.AD.cue, lit: !document.querySelector('#adcCue').hidden }; });
    ok(st.tr.filter(t => t === 'UAV:SUS').length === 3, 'within 12 s: the three drones tracked, suspect', st.tr);
    ok(st.cue === 'UP' && st.lit, 'the assist lights UP', st);
    await press(468, 465);
    const h = await page.evaluate(() => { const g = window.__saqr, T = g.adsTable(); return { hook: g.AD.hook && g.AD.hook.tn, first: T[0].tn, msg: g.AD.msg.en, drawnB: g.AD.drawn.B === g.AD.rev.B }; });
    ok(h.hook === h.first && /HOOKED/.test(h.msg) && h.drawnB, 'UP: the soonest track hooked, the camera drawn on it', h);
    // a suspect drone: the assist lights CLASS; CLASS confirms it hostile
    { const c1 = await page.evaluate(() => { const g = window.__saqr; g.adaFrame(0); return [g.AD.hook.id, g.AD.cue]; }); ok(c1[0] === 'SUS' && c1[1] === 'CLASS', 'a suspect drone hooked: the assist lights CLASS', c1);
      await press(468, 577); ok((await page.evaluate(() => window.__saqr.AD.hook.id)) === 'HOS', 'CLASS: confirmed hostile'); }
    const tn = await page.evaluate(() => { const g = window.__saqr; for (let k = 0; k < 4000 && !g.ADS.tr.some(t => t.cls === 'ACFT'); k++) g.adaFrame(0.25); if (!g.ADS.tr.some(t => t.cls === 'ACFT')) return { tn: 0, id: 'none', cue: '' }; const t = g.ADS.tr.find(t => t.cls === 'ACFT'); g.adsHook(t, true); return { tn: t.tn, id: t.id, cue: (g.adaFrame(0), g.AD.cue) }; });
    ok(tn.id === 'UNK' && tn.cue === 'IFF', 'the transport: unknown, the assist lights IFF', tn);
    await press(537, 521);
    { const g = await page.evaluate(() => { const t = window.__saqr.AD.hook; return { id: t.id, iff: t.iff, msg: window.__saqr.AD.msg.en }; }); ok(g.id === 'FRD' && g.iff === 'M5', 'IFF: mode 5, a friend', g); }
    await press(537, 577); ok(/TN \d{5} PRIORITY/.test((await get()).msg), 'PRI (the track number Link 16\'s: five octal digits)');
    await press(1027, 725); ok(await page.evaluate(() => !window.__saqr.AD.hook), 'DROP');
    await shot('2b-tracks'); }
  // a touch on a display's middle does nothing; twice leans in, twice again sits back
  const before = await get();
  await press(660, 250); ok(JSON.stringify(await get()) === JSON.stringify(before), 'one touch on a display: nothing');
  const dbl = async (x, y) => { const p = await page.evaluate(([x, y]) => { const A = window.__saqr.AD; return { x: x * A.k + A.ox, y: y * A.k + A.oy }; }, [x, y]); await page.mouse.click(p.x, p.y); await page.waitForTimeout(120); await page.mouse.click(p.x, p.y); await page.waitForTimeout(600); };
  await dbl(660, 250);
  const z = await page.evaluate(() => { const A = window.__saqr.AD; return { zoom: A.zoom, k: A.k, w: document.querySelector('#adcA').width }; });
  ok(z.zoom === 'A' && z.k > st0.k * 1.4 && z.w > st0.cv[0][0] * 1.4, 'leaned in on the air picture, its canvas sharper', z);
  await shot('3-lean-A');
  await press(382, 150); ok((await get()).rng === 50, 'its keys still work leaned in');
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
  { const g = await get(); ok(g.rng === 50 && g.sys === 3 && !g.armed && !g.hold && g.page === 'lnch', 'a new sortie starts fresh', g);
    const a = await page.evaluate(() => { const g = window.__saqr; return { tr: g.ADS.tr.length, tn: g.ADS.tn, t: g.ADS.t < 2, hook: !g.AD.hook, q: g.AD.msgQ.length }; });
    ok(a.tn === 0o2001 && a.t && a.hook && a.q <= 1 && a.tr <= 1, 'its air picture fresh too (the command\'s call waiting its turn)', a); }
  // the weapons (07d-adwpn.js), on this fresh sortie: the wrong system turned down, the gun given the drones, and the
  // night played through by the book (each drone confirmed, each missile engaged on automatic as it is classified),
  // its chances fixed by a seeded random: interceptors away from their launchers, kills, the gun's rounds spent,
  // and the step kept light
  { await page.evaluate(() => { let s = 7; Math.random = () => (s = s * 16807 % 2147483647) / 2147483647; });
    await press(1238, 708);                                                   // (master arm)
    const d = await page.evaluate(() => { const g = window.__saqr; while (g.ADS.t < 14) g.adaFrame(0.25); const t = g.ADS.tr.find(t => t.cls === 'UAV'); g.adsHook(t); return !!t; });
    ok(d, 'a drone in the picture');
    // a touch on the table's first row hooks it; the tracking camera then shows it
    { await page.evaluate(() => window.__saqr.adsHook(null)); await press(700, 506);
      const th = await page.evaluate(() => { const g = window.__saqr, T = g.adsTable(); return { ok: !!g.AD.hook && g.AD.hook === T[0], cls: g.AD.hook && g.AD.hook.cls }; });
      ok(th.ok, 'a touch on the table\'s first row hooks it', th);
      // (hooked: the turret's second's slew, then the gate on it; a second and a half of it, short of the visual ID's three)
      const cam = await page.evaluate(() => { const g = window.__saqr; g.adsHook(g.ADS.tr.find(t => t.cls === 'UAV')); for (let i = 0; i < 7; i++) g.adaFrame(0.25); g.adaFrame(0);
        const el = document.querySelector('#adcB'), k = el.width / 498, cx = Math.round((498 / 2) * k), cy = Math.round((315 / 2 - 6) * k), r = Math.round(3 * k), x2 = el.getContext('2d');
        const d = x2.getImageData(cx - r, cy - r, 2 * r, 2 * r).data, e = x2.getImageData(Math.round(40 * k), Math.round(60 * k), 8, 8).data; let mx = 0, bg = 0; for (let i = 0; i < d.length; i += 4) mx = Math.max(mx, d[i]); for (let i = 0; i < e.length; i += 4) bg = Math.max(bg, e[i]);
        return { mx, bg }; });
      // (narrow field, thermal white hot: the drone, warmer than the cold sky, at the gate's middle (the cross is outside it))
      ok(cam.mx > cam.bg + 50, 'the tracking camera shows the hooked drone (warmer than the sky at the gate\'s middle)', cam); }
    await press(468, 577); await press(1381, 727); ok(/ASSIGNED TO CLOSE-IN GUN/.test((await get()).msg), 'a hostile drone engaged on AUTO: given to the gun');
    await press(597, 718); await press(1381, 727); ok(/UPPER TIER: BALLISTIC TARGETS ONLY/.test((await get()).msg), 'on UPR: turned down');
    await press(597, 718); await press(1381, 727); ok(/LOWER TIER: NOT FOR DRONES/.test((await get()).msg), 'on LWR: turned down');
    await press(597, 718); await press(597, 718); ok((await get()).sys === 3, 'the knob back on AUTO');
    const r = await page.evaluate(() => { const g = window.__saqr, A = g.AD, S = g.ADS, eng = g.ADC_CTL.find(c => c[4] === 'ENGAGE')[3], seen = new Set(), k0 = A.lnch.map(L => L.left), o = { ticks: [], upr: null, low: null, cue: new Set() }; A.simMax = 0;
      while (S.t < 345) {
        for (const t of S.tr) {
          if (t.id === 'SUS') t.id = 'HOS';
          if (t.id === 'HOS' && (t.cls === 'CM' || t.cls === 'TBM') && !t.eng && !t.tried) { t.tried = true; g.adsHook(t); g.adaFrame(0); if (A.cue) o.cue.add(A.cue); eng(); if (t.cls === 'TBM' && !o.upr) o.upr = t.eng && t.eng.k; }
          if (t.cls === 'TBM' && t.eng && t.eng.k === 'HTK') o.low = true;
        }
        const t0 = performance.now(); g.adaFrame(0.25); o.ticks.push(performance.now() - t0);
        if (A.msg) seen.add(A.msg.en.replace(/TN \d{5} ?/, '')); if (A.cue) o.cue.add(A.cue);
      }
      const used = A.lnch.map((L, i) => k0[i] - L.left);
      o.ticks.sort((a, b) => a - b); const pc = q => +o.ticks[Math.floor(q * (o.ticks.length - 1))].toFixed(1);
      return { used, kills: S.kills, hits: S.hits, rds: A.cramRds, fly: S.fly, eng: S.eng.length, upr: o.upr, low: o.low, sim: +A.simMax.toFixed(1), p95: pc(0.95), worst: pc(1), msgs: [...seen], cue: [...o.cue] }; });
    ok(r.upr === 'UPR', 'a ballistic missile engaged on AUTO: the upper tier first', r.upr);
    ok(r.used[0] + r.used[1] >= 2 && r.used[2] + r.used[5] >= 1, 'interceptors away: the upper tier\'s on the ballistic pair, the lower\'s blast-fragmentation on the cruise missiles', r.used);
    ok(r.kills >= 6 && r.rds < 1550, 'kills, and the gun\'s rounds spent on the drones', { kills: r.kills, hits: r.hits, rds: r.rds });
    // (an AWAY still waiting when its splash comes is let go: the result said, not the launch after it)
    ok(r.msgs.some(m => /SPLASH/.test(m)), 'said: splash (and away, when its result had not come first)', r.msgs.filter(m => /AWAY|SPLASH|MISS|LEAKER|GUN/.test(m)));
    ok(r.fly === 0 && r.eng === 0, 'all of it over at the end: none in the air, no engagement left', [r.fly, r.eng]);
    // (the sim's own step timed alone: the whole tick's slowest, its drawing in SwiftShader included, caught a GC or a
    // stall of the software renderer now and then; it is logged, the 95th of the whole tick held to the limit)
    ok(r.sim < 8 && r.p95 < 25, 'each tick light (the air picture\'s step at its slowest; the whole tick, its drawing included, at its 95th; ms)', { sim: r.sim, p95: r.p95, worst: r.worst });
    ok(r.cue.includes('ENGAGE') && r.cue.includes('UP'), 'the assist through it: a hostile missile hooked lights ENGAGE; UP to the next', r.cue);
    await shot('6-weapons');
    // the night over: the command's all clear, then the end card (kills of the threats, base hits, the rating); again
    // from it starts a fresh night
    { const e = await page.evaluate(() => ({ shown: !document.querySelector('#ovEnd').hidden, kill: document.querySelector('#stKill').textContent, hits: document.querySelector('#stCiv').textContent, rate: document.querySelector('#stRate').textContent, all: window.__saqr.AD.endAt > 0 }));
      ok(e.all && e.shown && /^\d+\/\d+$/.test(e.kill) && e.rate.length > 2, 'the night over: all clear, then the end card', e);
      await shot('6b-end-card');
      await page.click('#btnAgain'); await page.waitForTimeout(600);
      ok(await page.evaluate(() => document.querySelector('#ovEnd').hidden && window.__saqr.AD.on && !window.__saqr.AD.endAt), 'again: a fresh night'); }
    // the camera worked by touch, on this fresh night: a touch on its picture takes the most pressing track; the narrow
    // field zooms in on it as the turret slews; a drone locked within its reach a few seconds is identified and declared
    // hostile; a touch then gives it to the gun; a cruise missile's line names the weapon, a touch engages it, and its
    // interceptor's countdown shows
    { await press(1238, 708);
      const z = await page.evaluate(() => { const g = window.__saqr; while (g.ADS.t < 30 && !g.ADS.tr.some(t => t.cls === 'UAV')) g.adaFrame(0.25); g.adsHook(null); g.adaFrame(0); return g.ADS.tr.length; });
      ok(z > 0, 'tracks up, none hooked');
      await press(1179, 247);
      const a = await page.evaluate(() => { const g = window.__saqr, A = g.AD, tr = A.hook; if (!tr) return {}; const f0 = g.adcFov(tr.x, tr.y, tr.z, g.adcKind(tr.th)); for (let i = 0; i < 8; i++) g.adaFrame(0.25); const f1 = g.adcFov(tr.x, tr.y, tr.z, g.adcKind(tr.th)); return { hooked: true, f0: +(f0 * 57.3).toFixed(2), f1: +(f1 * 57.3).toFixed(3) }; });
      ok(a.hooked && a.f0 > 3.5 && a.f1 < a.f0 / 4, 'a touch on the camera hooks the most pressing; the narrow field zooms in as it locks (deg)', a);
      const v = await page.evaluate(() => { const g = window.__saqr, A = g.AD, S = g.ADS, tr = S.tr.find(t => t.cls === 'UAV' && t.id === 'SUS'); if (!tr) return {}; g.adsHook(tr); const t0 = S.t; let said = false;
        while (!tr.vid && S.t - t0 < 240 && !tr.gone) { g.adaFrame(0.25); if (A.msg && /VISUAL ID/.test(A.msg.en)) said = true; }
        for (let i = 0; i < 12 && !said; i++) { g.adaFrame(0.25); if (A.msg && /VISUAL ID/.test(A.msg.en)) said = true; }
        return { vid: !!tr.vid, id: tr.id, km: +(Math.hypot(tr.x, tr.y) / 1000).toFixed(1), said, st: g.ADC_ST[0] }; });
      ok(v.vid && v.id === 'HOS' && v.km <= 12.5 && v.said, 'the drone identified on the camera within its reach, and declared hostile', v);
      await press(1179, 247);
      ok(/ASSIGNED TO CLOSE-IN GUN/.test((await get()).msg), 'a touch on it: given to the gun');
      const m = await page.evaluate(() => { const g = window.__saqr, A = g.AD, S = g.ADS; let tr = null;
        while (S.t < 200 && !(tr = S.tr.find(t => t.cls === 'CM' && !t.eng && Math.hypot(t.x, t.y) > 15e3))) g.adaFrame(0.25);
        if (!tr) return {}; g.adsHook(tr); for (let i = 0; i < 6; i++) g.adaFrame(0.25); return { st: g.ADC_ST[0] }; });
      ok(/TOUCH TARGET: FRG/.test(m.st), 'a cruise missile hooked: its line names the weapon AUTO gives it', m);
      await press(1179, 247);
      const i = await page.evaluate(() => { const g = window.__saqr, A = g.AD, S = g.ADS, tr = A.hook; let st = '', seen = 0;
        for (let k = 0; k < 400 && tr && !tr.gone; k++) { g.adaFrame(0.25); if (/INTERCEPT/.test(g.ADC_ST[0])) { st = g.ADC_ST[0]; if (g.ADW_MS.some(m => m.on && m.tr === tr)) seen++; if (seen > 6) break; } }
        return { eng: !!(tr && tr.eng), st, seen }; });
      ok(i.st && i.seen > 0, 'a touch engages it: its interceptor on the way, the countdown on the camera', i);
      await shot('6c-camera-intercept'); }
    // the outside camera: OUTSIDE opens it over the whole console (its canvas sized), a launch drawn on it, a touch
    // anywhere back (its canvas let go)
    await press(1147, 725);
    const o1 = await page.evaluate(() => { const g = window.__saqr; g.adoLaunch('HTK', 30000, -20000, 9000); return { on: g.ADO.on, w: document.querySelector('#ado').width, shown: !document.querySelector('#ado').hidden }; });
    ok(o1.on && o1.w > 100 && o1.shown, 'OUTSIDE: the outside camera over the console', o1);
    await shot('7-outside', 600);
    await page.mouse.click(W / 2, H / 2); await page.waitForTimeout(200);
    const o2 = await page.evaluate(() => ({ on: window.__saqr.ADO.on, w: document.querySelector('#ado').width, hidden: document.querySelector('#ado').hidden }));
    ok(!o2.on && o2.w === 0 && o2.hidden, 'a touch on it: back to the console, its canvas let go', o2); }
  ok(errs.length === 0, 'no page errors', errs);
  await ctx.close();
  // a portrait window: the console turned on its side, its controls still where they are drawn
  { const { page: p2, ctx: c2, errs: e2 } = await open(browser, 'ada', H, W);
    await p2.click('#btnStart'); await p2.waitForTimeout(800);
    const pr = async (x, y) => { const q = await p2.evaluate(([x, y]) => { const A = window.__saqr.AD; return { x: x * A.k + A.ox, y: y * A.k + A.oy }; }, [x, y]); await p2.mouse.click(innerW(q), q.x); await p2.waitForTimeout(150); };
    // (the app turned 90 degrees: its x along the window's height, its y from the window's right edge)
    const innerW = q => H - q.y;
    await pr(382, 150); ok((await p2.evaluate(() => window.__saqr.AD.rng)) === 100, 'portrait: RNG + found by its place');
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
