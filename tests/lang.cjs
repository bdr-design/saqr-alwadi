// The game in English («ع | EN» in the menu's top bar): left to right, and no Arabic left showing on any screen of the
// menu (home, operations, the hangar, settings, how to play), in the pod's symbology, the editor or the end card, for
// the Apache in the valley and the F-15SA over the theatre; the choice kept, and back to Arabic. Shots to
// tests/out/lang-<aircraft>-<screen>.png. The language button: Arabic marks it «ع» in the Arabic face, which is its own.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.mp3': 'audio/mpeg' };
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const fails = [], check = (w, ok, v) => { console.log((ok ? 'ok   ' : 'FAIL ') + w + (v !== undefined ? ': ' + JSON.stringify(v) : '')); if (!ok) fails.push(w); };
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  // the Arabic still showing under a node: visible text, aria-labels and titles (the language button's «ع» aside)
  const arabic = sel => window.__arabicIn(sel);
  for (const [ac, map] of [['ah64', 'valley'], ['f15', 'theater']]) {
    const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await ctx.addInitScript(([ac, map]) => {
      try { if (!sessionStorage.getItem('lang.once')) { sessionStorage.setItem('lang.once', '1'); localStorage.setItem('saqr.lang', 'en'); localStorage.setItem('saqr.ac', ac); localStorage.setItem('saqr.map', map); } } catch (_) {}
      window.__arabicIn = sel => {
        const AR = /[؀-ۿ]/, out = [];
        for (const root of document.querySelectorAll(sel)) {
          const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
          for (let n; (n = w.nextNode());) { const e = n.parentElement; if (AR.test(n.data) && e && e.offsetParent !== null && !e.closest('#segLang') && getComputedStyle(e).visibility !== 'hidden') out.push(n.data.trim().slice(0, 40)); }
          for (const e of root.querySelectorAll('[aria-label],[title],[alt]')) for (const a of ['aria-label', 'title', 'alt']) { const v = e.getAttribute(a); if (v && AR.test(v) && !e.closest('#segLang') && e.id !== 'segLang') out.push(a + ': ' + v.slice(0, 40)); }
        }
        return out;
      };
    }, [ac, map]);
    const page = await ctx.newPage(), errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
      if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
        const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
      return r.abort(); });
    await page.goto('http://test/#debug');
    await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 180000 });
    await page.waitForTimeout(800);
    const dir = await page.evaluate(() => ({ dir: document.querySelector('#app').dir, lang: document.documentElement.lang, on: document.querySelector('#segLang .on').dataset.l, title: document.title }));
    check(ac + ': English, left to right, the button showing it', dir.dir === 'ltr' && dir.lang === 'en' && dir.on === 'en' && dir.title === 'Saqr Al-Wadi', dir);
    for (const scr of ['home', 'ops', 'arm', 'set']) {
      await page.evaluate(sc => document.querySelector('#nTabs [data-scr="' + sc + '"]').click(), scr); await page.waitForTimeout(500);
      await page.screenshot({ path: `${S}/tests/out/lang-${ac}-${scr}.png` });
      const left = await page.evaluate(arabic, '#ovStart');
      check(ac + ' ' + scr + ': no Arabic showing', !left.length, left);
    }
    // every mission's card and briefing
    const cards = await page.evaluate(() => { document.querySelector('#nTabs [data-scr="ops"]').click(); const out = [];
      for (const b of document.querySelectorAll('#mList .mc:not(:disabled)')) { b.click(); out.push(...window.__arabicIn('#nBrief'), ...window.__arabicIn('#mList')); }
      return out; });
    check(ac + ': every mission in English', !cards.length, cards.slice(0, 6));
    await page.click('#btnHow'); await page.waitForTimeout(300);
    await page.screenshot({ path: `${S}/tests/out/lang-${ac}-how.png` });
    const how = await page.evaluate(arabic, '#panHow');
    check(ac + ': how to play in English', !how.length, how.slice(0, 4));
    await page.click('#panHow [data-close]');
    // the editor
    await page.evaluate(() => { document.querySelector('#nTabs [data-scr="home"]').click(); document.querySelector('#btnEdit').click(); });
    await page.waitForTimeout(800);
    await page.evaluate(() => { const g = window.__saqr; g.ED.items = g.edDefaultItems(); g.ED.sel = 0; });
    await page.evaluate(() => document.querySelector('#edPal button').click()); await page.waitForTimeout(300);
    await page.screenshot({ path: `${S}/tests/out/lang-${ac}-editor.png` });
    const ed = await page.evaluate(arabic, '#ovEdit');
    check(ac + ': the editor in English', !ed.length, ed.slice(0, 6));
    await page.click('#edBack'); await page.waitForTimeout(500);
    // a mission: the pod's symbology full screen, then its end
    // (an ordinary strike: the escort ends only with its convoy in)
    await page.evaluate(id => { const g = window.__saqr, i = g.MISSIONS.findIndex(m => m.id === id); document.querySelector('#nTabs [data-scr="ops"]').click();
      document.querySelectorAll('#mList .mc:not(.camp)')[i].click(); document.querySelector('#nTabs [data-scr="home"]').click(); document.querySelector('#btnStart').click(); }, ac === 'f15' ? 'j_strike' : 'convoy');
    await page.waitForTimeout(2500);
    await page.evaluate(() => { const g = window.__saqr; g.setCockpit(false); });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${S}/tests/out/lang-${ac}-pod.png` });
    const pod = await page.evaluate(() => window.__arabicIn('#app > :not(.ov)'));
    check(ac + ': the pod and its panels in English', !pod.length, pod.slice(0, 6));
    await page.evaluate(() => { const g = window.__saqr; g.AC.hp = 1e9; for (const t of g.targets) if (t.alive && !t.escaped) g.kill(t); });
    await page.waitForFunction(() => !document.querySelector('#ovEnd').hidden, null, { timeout: 30000 });
    await page.waitForTimeout(500);
    await page.screenshot({ path: `${S}/tests/out/lang-${ac}-end.png` });
    const end = await page.evaluate(arabic, '#ovEnd');
    check(ac + ': the end card in English', !end.length, end.slice(0, 6));
    // back to Arabic: kept, right to left
    if (ac === 'ah64') {
      await page.evaluate(() => { document.querySelector('#btnMenu').click(); });
      await page.waitForTimeout(500);
      await Promise.all([page.waitForNavigation({ timeout: 60000 }), page.click('#segLang [data-l="ar"]')]);
      await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 180000 });
      const back = await page.evaluate(() => ({ dir: document.querySelector('#app').dir, kept: localStorage.getItem('saqr.lang'), tab: document.querySelector('#nTabs [data-scr="home"]').textContent }));
      check('back to Arabic: right to left, kept', back.dir === 'rtl' && back.kept === 'ar' && back.tab.includes('الرئيسية'), back);
    }
    check(ac + ': no page errors', !errs.length, errs);
    await ctx.close();
  }
  console.log(fails.length ? fails.length + ' FAILED' : 'all passed');
  await browser.close();
  process.exit(fails.length ? 1 : 0);
})();
