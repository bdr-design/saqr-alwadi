// The pod's tape (tapeMark, tapeGrab, showTape): a strike's moments (the release, the impact, the result) kept as
// stills of the pod's picture and shown on the debrief, captioned; a still opened large on a touch. Screenshots of
// the debrief into tests/out/tape-*.png.
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
  const start = id => page.evaluate(id => { const g = window.__saqr, i = g.MISSIONS.findIndex(m => m.id === id);
    document.querySelectorAll('#mList .mc:not(.camp)')[i].click(); document.querySelector('#btnStart').click(); g.AC.hp = 1e9; }, id);
  await start('j_strike'); await page.waitForTimeout(600);
  // the pod on the big warehouse, a 2,000 lb bomb on it (its fall cut short); the rest of the targets then brought down
  await page.evaluate(() => { const g = window.__saqr, S = g.S, CK = g.CK, t = g.targets.find(t => t.bld === 45) || g.targets[0]; window.__W = t;
    g.setNight(false); CK.goal = 1; CK.t = 1; g.toSensor(); g.setSensor('eo'); S.blank = 0; g.lockOn(t, true); S.zoom = S.zoomGoal = 4; S.ammo.jdam = 2; S.weapon = 'jdam'; });
  await page.waitForTimeout(1500);
  await page.evaluate(() => { const g = window.__saqr; g.jetRelease('jdam', window.__W); g.projectiles[g.projectiles.length - 1].tti = 4; });
  await page.waitForFunction(() => window.__saqr.TAPE.length >= 3, null, { timeout: 180000 }).catch(() => {});
  const mid = await page.evaluate(() => window.__saqr.TAPE.map(k => k.en));
  check('the release, the impact and the result kept', mid.length === 3 && /^REL/.test(mid[0]) && mid[1] === 'IMPACT' && (mid[2] === 'HIT' || mid[2] === 'MISS'), mid);
  await page.evaluate(() => { const g = window.__saqr; for (const t of g.targets) if (t.alive) g.kill(t); });
  await page.waitForFunction(() => !document.querySelector('#ovEnd').hidden, null, { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(600);
  const end = await page.evaluate(() => ({ shown: !document.querySelector('#ovEnd').hidden, tape: !document.querySelector('#eTape').hidden, figs: document.querySelectorAll('#eTape figure').length,
    caps: [...document.querySelectorAll('#eTape figcaption')].map(c => c.textContent), w: (document.querySelector('#eTape canvas') || {}).width }));
  check('the debrief shows the tape, captioned', end.shown && end.tape && end.figs === 3 && end.caps.every(c => /^\d\d:\d\d (TV|IR) /.test(c)) && end.w === 320, end);
  await page.screenshot({ path: S + '/tests/out/tape-debrief.png' });
  await page.evaluate(() => document.querySelectorAll('#eTape figure')[1].click()); await page.waitForTimeout(400);
  const big = await page.evaluate(() => ({ open: !document.querySelector('#ovShot').hidden, src: (document.querySelector('#shotImg').src || '').slice(0, 15) }));
  check('a still opened large on a touch', big.open && big.src === 'data:image/jpeg', big);
  await page.screenshot({ path: S + '/tests/out/tape-still.png' });
  check('no page errors', !errs.length, errs);
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
