// The settings' About bar and the Android app's leave question (src/game/08-ui.js, 13-main.js __back; the testers'
// report): the two documents read inside the game in both languages (their text the store's own pages', no link in
// them), rate, share and contact sent to the app's bridge (window.SaqrApp, faked here), hidden where there is no way
// (the web: no store to rate); the system's back at the menu's home asks before leaving, back again stays, Exit
// leaves; the settings still fit a phone's screen without scrolling.
// node tests/about.cjs   (screenshots in tests/out/about-*.png)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.json': 'application/json', '.mp3': 'audio/mpeg', '.glb': 'model/gltf-binary', '.js': 'application/javascript' };
let fails = 0;
const ok = (c, m, v) => { console.log((c ? 'ok   ' : 'FAIL ') + m + (v !== undefined ? ': ' + (typeof v === 'string' ? v : JSON.stringify(v)) : '')); if (!c) fails++; };
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const [lang, app, w, h] of [['ar', true, 844, 390], ['en', true, 844, 390], ['ar', false, 844, 390], ['ar', true, 667, 375]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
    await ctx.addInitScript(([lang, app]) => { try { localStorage.setItem('saqr.ac', 'f15'); localStorage.setItem('saqr.lang', lang); } catch (_) {}
      if (app) { window.__calls = []; window.SaqrApp = { rate: () => window.__calls.push('rate'), share: t => window.__calls.push('share:' + t), mail: (a, s) => window.__calls.push('mail:' + a), exit: () => window.__calls.push('exit') }; } }, [lang, app]);
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
      if (u.startsWith('http://test/')) { const p = decodeURIComponent(new URL(u).pathname); if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
        const f = path.join(S, p); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
      return r.abort(); });
    await page.goto('http://test/#debug');
    await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 180000 });
    const tag = lang + (app ? '-app' : '-web') + '-' + w, en = lang === 'en';
    await page.click('#nTabs [data-scr="set"]'); await page.waitForTimeout(400);
    const fit = await page.evaluate(() => { const p = document.querySelector('#panSet'); return [p.scrollHeight, p.clientHeight]; });
    ok(fit[0] <= fit[1], tag + ': the settings fit the screen with the About bar (no scrolling)', fit);
    await page.screenshot({ path: `${S}/tests/out/about-${tag}-set.png` });
    const vis = await page.evaluate(() => [...document.querySelectorAll('.nLinks button')].map(b => !b.hidden));
    ok(JSON.stringify(vis) === JSON.stringify(app ? [true, true, true, true, true] : [false, false, false, true, true]), tag + ': rate, share and contact only where there is a way (a bare web page has none); the two documents always', vis);
    for (const k of ['privacy', 'terms']) {
      await page.click(`.nLinks [data-doc="${k}"]`); await page.waitForTimeout(250);
      const d = await page.evaluate(() => ({ shown: !document.querySelector('#panDoc').hidden, t: document.querySelector('#docTitle').textContent, n: document.querySelector('#docBody').textContent.length, a: document.querySelectorAll('#docBody a').length, mail: document.querySelector('#docBody').textContent.includes('info@badrix.com'), ar: /[؀-ۿ]/.test(document.querySelector('#docBody p').textContent) }));
      ok(d.shown && d.n > 500 && d.a === 0 && d.mail && d.ar === !en && d.t === (k === 'privacy' ? (en ? 'Privacy policy' : 'سياسة الخصوصية') : (en ? 'Terms of use' : 'شروط الاستخدام')), tag + ': the ' + k + ' document in the game, in its language, its contact plain text', d);
      if (k === 'terms') await page.screenshot({ path: `${S}/tests/out/about-${tag}-terms.png` });
      if (k === 'privacy') await page.click('#docX');
    }
    // (the title bar stays in reach while the document scrolls; another tab shuts the document, as it shuts How to play)
    const st = await page.evaluate(() => { const p = document.querySelector('#panDoc'); p.scrollTop = 400; const r = document.querySelector('#docX').getBoundingClientRect(), pr = p.getBoundingClientRect(); return [p.scrollTop, Math.round(r.top - pr.top), document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2).id]; });
    ok(st[0] > 100 && st[1] >= 0 && st[1] < 30 && st[2] === 'docX', tag + ': the document scrolled, its close button still at the top and in reach', st);
    await page.screenshot({ path: `${S}/tests/out/about-${tag}-scroll.png` });
    await page.click('#nTabs [data-scr="home"]'); await page.waitForTimeout(150);
    ok(await page.evaluate(() => document.querySelector('#panDoc').hidden), tag + ': another tab shuts the document');
    await page.click('#nTabs [data-scr="set"]'); await page.waitForTimeout(150);
    await page.click('.nLinks [data-doc="terms"]'); await page.waitForTimeout(150);
    ok(await page.evaluate(() => document.querySelector('#panDoc').scrollTop === 0), tag + ': a document opened again starts at its top');
    ok(await page.evaluate(() => window.__back() === true && document.querySelector('#panDoc').hidden), tag + ': back shuts the document');
    if (app) {
      await page.click('#btnRate'); await page.click('#btnShare'); await page.click('#btnMail');
      const b = await page.evaluate(() => { const o = {}; o.home = [window.__back(), document.querySelector('#nTabs .on').dataset.scr]; o.ask = [window.__back(), !document.querySelector('#xPanel').hidden]; return o; });
      ok(b.home[0] === true && b.home[1] === 'home' && b.ask[0] === true && b.ask[1], tag + ': back to the menu\'s home, then back again asks before leaving', b);
      await page.waitForTimeout(150); await page.screenshot({ path: `${S}/tests/out/about-${tag}-leave.png` });
      ok(await page.evaluate(() => window.__back() === true && document.querySelector('#xPanel').hidden) && !(await page.evaluate(() => window.__calls)).includes('exit'), tag + ': back again stays (nothing left)');
      // (while the game still loads the question is not asked: it would sit under the loading screen)
      const ld = await page.evaluate(() => { const l = document.querySelector('#ovLoad'), was = l.hidden; l.hidden = false; const r = [window.__back(), document.querySelector('#xPanel').hidden]; l.hidden = was; return r; });
      ok(ld[0] === false && ld[1], tag + ': back while the game loads is the system\'s (no question under the loading screen)', ld);
      await page.evaluate(() => window.__back()); await page.click('#xStay');
      ok(await page.evaluate(() => document.querySelector('#xPanel').hidden && !window.__calls.includes('exit')), tag + ': Keep playing stays');
      await page.evaluate(() => window.__back()); await page.click('#xExit');
      const calls = await page.evaluate(() => window.__calls);
      ok(calls[0] === 'rate' && /^share:.+\nhttps:\/\/play\.google\.com\/store\/apps\/details\?id=com\.bdr\.saqralwadi$/.test(calls[1]) && calls[2] === 'mail:info@badrix.com' && calls[3] === 'exit' && calls.length === 4, tag + ': rate, share (its line and the store\'s link), mail and exit sent to the app, each once', calls);
    } else {
      const r = await page.evaluate(() => { window.__back(); return [window.__back(), document.querySelector('#xPanel').hidden]; });
      ok(r[0] === false && r[1], tag + ': outside the Android app the system keeps its own back at the home (no question)', r);
    }
    ok(errs.length === 0, tag + ': no page errors', errs);
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? fails + ' failed' : 'all passed'); process.exit(fails ? 1 : 0);
})();
