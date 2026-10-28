// The radio in Saudi Arabic («اللاسلكي: عربي» in the settings): the Arabic voices (sprites/radio_ar.mp3, as far as the
// owner's batches have come) load only when chosen; a call all of whose pieces are voiced goes in Arabic, one with a
// piece missing goes all in English (no call half in each); back to English, all English. The choice is remembered.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
(async () => {
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + JSON.stringify(v) : '')); if (!ok) fails.push(w); };
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await (await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1 })).newPage();
  const errs = [], got = []; page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', r => { const u = r.request().url();
    if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
    if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' }); got.push(p);
      const f = path.join(S, p); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
    return r.abort(); });
  await page.goto('http://test/#debug');
  await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 120000 });
  const n = await page.evaluate(() => Object.keys((window.__saqr.RADIO_A || { clips: {} }).clips).length);
  check('Arabic lines in the page', n > 0, n);
  // the setting
  await page.click('#nTabs [data-scr="set"]'); await page.click('#segR [data-r="ar"]');
  const set = await page.evaluate(() => ({ on: window.__saqr.S.radioAr, kept: localStorage.getItem('saqr.radio'), boxed: document.querySelector('#segR [data-r="ar"]').classList.contains('on') }));
  check('«عربي» chosen, shown and remembered', set.on && set.kept === 'ar' && set.boxed, set);
  await page.screenshot({ path: S + '/tests/out/radio_ar_settings.png' });
  const i = await page.evaluate(() => window.__saqr.MISSIONS.findIndex(m => m.id === 'tic'));
  await page.click('#nTabs [data-scr="ops"]'); await page.click(`#mList .mc:not(.camp) >> nth=${i}`); await page.click('#nTabs [data-scr="home"]'); await page.click('#btnStart'); await page.waitForTimeout(800);
  await page.waitForFunction(() => !!window.__saqr.bank.d && !!window.__saqr.bankA.d, null, { timeout: 60000 });
  // a call's length tells its language: the Arabic clip's or the English's
  const len = ids => page.evaluate(ids => { const g = window.__saqr, c = g.radioClip(ids); return c ? +(c.d.length / c.sr).toFixed(2) : 0; }, ids);
  const dur = (bank, id) => page.evaluate(([b, id]) => { const R = window.__saqr[b]; return R && R.clips[id] ? R.clips[id][1] : null; }, [bank, id]);
  const arTic = await dur('RADIO_A', 'h.tic'), enTic = await dur('RADIO', 'h.tic'), tic = await len(['h.tic']);
  check('a voiced call in Arabic', Math.abs(tic - arTic) < 0.3 && Math.abs(tic - enTic) > 0.3, { tic, arTic, enTic });
  // HUNTER's report: the type and the distance voiced, the direction not yet: all of it in English
  const ids = ['h.call', 'h.t.TRK', 'h.d.300', 'h.dir.NORTH', 'h.mark'], haveDir = await dur('RADIO_A', 'h.dir.NORTH');
  const rep = await len(ids);
  const enRep = (await Promise.all(ids.map(id => dur('RADIO', id)))).reduce((a, b) => a + b, 0);
  if (haveDir == null) check('a call with a piece not voiced: all of it in English', Math.abs(rep - enRep) < 0.9, { rep, enRep });
  else console.log('(the directions are voiced now: the report goes in Arabic)');
  // back to English
  await page.evaluate(() => { window.__saqr.S.radioAr = false; });
  const en = await len(['h.tic']);
  check('English chosen: the call in English', Math.abs(en - enTic) < 0.3, { en, enTic });
  check('the Arabic voices loaded only once chosen (one request)', got.filter(p => p.endsWith('radio_ar.mp3')).length === 1, got.filter(p => p.includes('radio')));
  check('no page errors', !errs.length, errs);
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
