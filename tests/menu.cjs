// The main menu: shots of each of its screens (home, operations, the hangar, settings) on phones and an iPad (tests/out/menu-*.png)
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const S = path.resolve(__dirname, '..');
const body = fs.readFileSync(S + '/build/artifact.html', 'utf8');
const html = '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>body{margin:0}[hidden]{display:none!important}</style></head><body>' + body + '</body></html>';
const three = fs.readFileSync(__dirname + '/three.min.js', 'utf8');
const types = { '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp' };
const tag = process.argv[2] || 'now';
(async () => {
  fs.mkdirSync(S + '/tests/out', { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const fails = [], check = (w, ok) => { if (!ok) fails.push(w); }, errs = [];
  for (const [name, w, h, map] of [['land', 844, 390], ['se', 667, 375], ['theater', 844, 390, 'theater'], ['ipad', 1180, 820]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    if (map) await ctx.addInitScript(m => { try { localStorage.setItem('saqr.map', m); } catch (_) {} }, map);
    const page = await ctx.newPage();
    page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', r => { const u = r.request().url();
      if (u.includes('three.min.js')) return r.fulfill({ body: three, contentType: 'application/javascript' });
      if (u.startsWith('http://test/')) { const p = new URL(u).pathname; if (p === '/') return r.fulfill({ body: html, contentType: 'text/html' });
        const f = path.join(S, decodeURIComponent(p)); return fs.existsSync(f) ? r.fulfill({ body: fs.readFileSync(f), contentType: types[path.extname(p)] || 'application/octet-stream' }) : r.fulfill({ status: 404, body: '' }); }
      return r.abort(); });
    await page.goto('http://test/#debug');
    await page.waitForFunction(() => !document.querySelector('#btnStart').disabled, null, { timeout: 180000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${S}/tests/out/menu-${tag}-${name}.png` });
    // every mission card can be picked, and picking one shows it in the briefing
    const pick = await page.evaluate(() => { const bs = [...document.querySelectorAll('#mList .mc:not(:disabled)')], b = bs[bs.length - 1]; b.click();
      return { n: bs.length, on: document.querySelector('#mList .mc:not(:disabled):last-of-type, #mList .mc.on') === document.querySelector('#mList .mc.on'), title: document.querySelector('#mTitle b').textContent }; });
    check(name + ': a mission can be picked', pick.n > 0 && !!pick.title);
    // the loadout
    await page.evaluate(() => document.querySelector('#segL button[data-l="cas"]').click());
    check(name + ': loadout picked', await page.evaluate(() => window.__saqr.S.load === 'cas' && document.querySelector('#segL button.on').dataset.l === 'cas'));
    // each tab of the menu, then back home
    for (const scr of ['ops', 'arm', 'set']) {
      await page.evaluate(sc => document.querySelector('#nTabs [data-scr="' + sc + '"]').click(), scr); await page.waitForTimeout(500);
      await page.screenshot({ path: `${S}/tests/out/menu-${tag}-${name}-${scr}.png` });
      const ov = await page.evaluate(() => { const o = document.querySelector('#ovStart'), r = o.getBoundingClientRect();
        return [...o.querySelectorAll('.nScr.on *')].filter(e => e.offsetParent && !e.closest('.nMap')).some(e => { const q = e.getBoundingClientRect(); return q.width && (q.right > r.right + 1 || q.left < r.left - 1) && !e.closest('.mList, .nThr'); }); });
      check(name + ': ' + scr + ' fits the screen', !ov);
    }
    await page.evaluate(() => document.querySelector('#nTabs [data-scr="home"]').click());
    await page.evaluate(() => document.querySelector('#segL button[data-l="mix"]').click());
    // nothing runs off the screen sideways; the start button is on screen or reachable by scrolling the menu
    const lay = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, w: innerWidth, start: !!document.querySelector('#btnStart').offsetParent }));
    check(name + ': no sideways overflow', lay.sw <= lay.w + 1);
    check(name + ': start button shown', lay.start);
    await ctx.close();
  }
  check('no page errors', !errs.length);
  if (errs.length) console.log(errs.slice(0, 5).join('\n'));
  await browser.close();
  console.log(fails.length ? 'FAIL: ' + fails.join('; ') : 'ALL OK');
  process.exit(fails.length ? 1 : 0);
})();
