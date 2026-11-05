# WIP: air-defence piece 4 (interceptors, launchers, close-in gun)

Written in session_01MLonhoSGLVoNDLxmLSRf4D, whose shell and agents were then blocked by the auto-mode safety check:
**nothing here has been built, tested or reviewed.** `src/game/07d-adwpn.js` on this branch is the whole new file.
The other files' changes are below, as exact replacements (find the OLD text, put the NEW in its place), against
`5b4570d` (the main branch's last sound commit). After applying them: delete this file, then

1. regenerate the voice: `python3 tools/make_radio.py <kokoro-q8.onnx> <voices dir> ada` (new keys below);
2. `python3 tools/build.py`, `node tests/airdef.cjs` (alone), then `tests/cockpit.cjs` and `tests/jetops.cjs`;
3. the reviews (HANDOFF rules): a bug reviewer, the heaviness reviewer, a realism reviewer; apply what is confirmed;
4. screenshots to the owner; commit to `claude/f15-cockpit-clarity-fyvgd7` and push.

The owner's report that drove the timing change: the missiles took too long to arrive, there was no lock or
interception, and they wanted to see them on the radar. Hence: the night shortened to ~4 minutes, a "Track locked"
at ENGAGE, the interceptors drawn on the air picture.

Known things to check in review: `adwFirst` cost at a press (~120 launch times x up to tmax tof steps x 10
bisection); `ADW_MS.find` closure in `adwStep`; whether `adsTodo` cues are right with the gun held / disarmed;
the TBM's lower-tier window (MSE envelope 15-36 km altitude, <=35 km) against the new short-range TBMs.

## Status, session 2 (session_01MLonhsyCnsBFmW9yYbYP3e): applied, voiced, built, tested once; its shell then blocked again

- Every replacement below applied cleanly (each OLD found exactly once) on `claude/f15-cockpit-clarity-fyvgd7` in that
  session's container (the DEVELOPER.md part not yet). **Not committed** (no shell left to commit with): apply them again.
- Tools: Kokoro from npm (`npm pack kokoro-q8-shards kokoro-js`; the six parts joined in order, sha256 `fbae9257...a1478`
  as its README gives; `python3 -m venv venv && venv/bin/pip install kokoro-onnx soundfile`), then
  `venv/bin/python tools/make_radio.py <kokoro-q8.onnx> <js/package/voices> ada`: 70 lines, 102 s, 496 KB, some 45 s.
  `tests/three.min.js`: cdnjs refused by the proxy, so `npm pack three@0.128.0` and its `package/build/three.min.js`.
  `npm install --no-save terser` for the minified build.
- `node tests/airdef.cjs`: everything passed but one, `each tick light` at 27.7 ms (limit 25). Split by a diagnostic:
  the sim's step (`adsTickSim`) at most 1.6 ms all night; the spike a single drawing tick (39-50 ms, once, near t 254 s
  with nothing happening): a GC or SwiftShader stall, not the weapons. Make that check time the sim's step (or a
  percentile of the whole tick).
- **The real fault, the owner's "no interception": the interceptors miss.** Their passes logged (seed 7, the test's
  play-through): UPR on a TBM 104-498 m; GEM on a CM 55-98 m; MSE on a TBM 359-737 m; MSE on a CM 0-6 m (the only
  kills). The kill needs under 50 m. Both TBMs hit the base after 4 UPR and 4 MSE; the CMs fell to MSE after 4 GEM missed.
  - Cause 1: `adwFly`'s time to go is floored (`Math.max(0.5, m.tau - dt)`, then `Math.max(0.25, ...)` in the
    iteration): in the last steps it aims at where the target will be a quarter second on, ahead of the meeting. Floor
    it near zero. And guard `dt <= 0` (a sortie's first tick is dt 0: `rx = .../dt`, NaN, passed only by luck).
  - Cause 2: MSE on a TBM: the first pass over 2 km (so never judged), then it turns and chases from behind (relative
    speed at the logged pass 71-128 m/s). Check the planned intercept against the flown path; judge the first pass
    whatever its distance (a miss), not only under 2 km.
- **The messages lag the events:** SPLASH shown some 19 s after the kill, IMPACT some 10 s after; AWAY lines dropped
  (the queue holds 4, each held its voice's length). Needs priorities (impact, splash, leaker, the ballistic call first)
  and stale lines let go.
- Left in that tree for the diagnostic: `ADW_MS, adsTickSim, ADC_DRAW` added to the `#debug` export (`13-main.js` 494).
- Then as above: cockpit, jetops (each alone), the three reviews, screenshots, commit and push (without this file).

## Status, session 3 (session_01MLonhrW96ZXG4ZiSy8qj68)

- Every replacement above applied again (each OLD found exactly once) and committed here with `07d-adwpn.js`; the voice
  regenerated (70 lines); built and minified (terser from outside the repo: a copy of `tools/minjs.cjs` beside it).
  The DEVELOPER.md part not yet (to be written for the final behaviour).
- That session's reply on the interceptors' accuracy was stopped by the safety classifier: the guidance work (items 1
  and 2 above) not to be redone that way. Waiting on the owner: a game-level resolution instead (the interceptor drawn
  to the plan's meeting point, the outcome by the weapon's chance there), or leave it.
- Still to do either way: the `dt <= 0` guard, the messages' priorities and stale lines let go, the tick check timing
  the sim's step, the docs, the tests, the bug and heaviness reviews, screenshots, then the working branch.

---

## src/game/07c-adsim.js

OLD
```js
const ADS = { th: [], tr: [], tab: [], tn: 0o2001, look: 0, plan: [], hits: 0, t: 0 };
```
NEW
```js
const ADS = { th: [], tr: [], tab: [], tn: 0o2001, look: 0, plan: [], hits: 0, t: 0, eng: [], fly: 0, kills: 0, gun: { t: 0, tr: null, r: 0, said: null } };
```

OLD
```js
// a cruise missile: low (45 m), out to a dog-leg 50 km from the base, then straight in
function adsCm(b, km, leg) { const o = adsThreat('cm', b, km, 45); o.wp = { x: Math.sin((b + leg) * D2R) * 50e3, y: Math.cos((b + leg) * D2R) * 50e3 }; o.v = 240; return o; }
// a ballistic missile, met at its apogee (a minimum-energy shot of some 600 km: about 150 km up, coming down near 45° at
// 2.4 km/s): its arc to its aim point (within 150 m of the base's middle) worked out from where it is and when it lands
// (T s); no drag (above the thick air for the most of its fall)
```
NEW
```js
// a cruise missile: low (45 m), out to a dog-leg 30 km from the base, then straight in
function adsCm(b, km, leg) { const o = adsThreat('cm', b, km, 45); o.wp = { x: Math.sin((b + leg) * D2R) * 30e3, y: Math.cos((b + leg) * D2R) * 30e3 }; o.v = 240; return o; }
// a ballistic missile, met at its apogee (z0 up, as a minimum-energy shot's: a quarter of its range; the night's
// short-range ones some 80 km up, coming down near 45° at about 1.7 km/s): its arc to its aim point (within 150 m of
// the base's middle) worked out from where it is and when it lands (T s); no drag (above the thick air for the most of
// its fall)
```

OLD: the comment block above `const ADS_PLAN` and the array itself. NEW:
```js
// the night's attack (seconds from the start), some four minutes, all of it at the base within it: the drones already
// on their way when the console comes up, seen within seconds; the transport coming home from the south-west, outside
// the lower radar's sector (the gun's radar finds it first, or the operator turns the sector); the cruise missiles low
// from the south-east, seen inside the horizon (some 37 km) within the first minute; the ballistic pair, short-range
// ones (their apogee some 80 km up, 150 km out, two minutes' fall: about Mach 5 at the end), seen at once by the upper
// tier; more drones from the north-west, behind the sector, seen only by the gun's radar at some 7 km; a last swarm
// from the north, behind the sector again. (A drone at 180 km/h is some two and a half minutes from 8 km: where each
// starts sets when it arrives)
const ADS_PLAN = [
  [3, () => { adsUav(68, 8, 900); adsUav(72, 8.5, 1100); adsUav(76, 9, 1000); }],
  [15, () => adsTrn(215, 40)],
  [25, () => { adsCm(128, 42, -20); adsCm(134, 44, -8); }],
  [45, () => { adsTbm(92, 150, 80e3, 128); adsTbm(97, 158, 84e3, 131); }],
  [60, () => { adsUav(298, 7, 800); adsUav(304, 7.5, 1000); }],
  [100, () => { for (let i = 0; i < 4; i++) adsUav(340 + i * 5, 6 + i * 0.7, 700 + i * 150); }],
];
```

In `adsLook`, OLD
```js
    if (AD.hook === tr) adsHook(null);
    tr.th.tr = null; ADS.tr.splice(i, 1);
  }
```
NEW
```js
    adsLetGo(tr);
  }
```

OLD `// the table as the display shows it` NEW (inserted before it):
```js
// a track let go of the picture (dropped, or its threat gone): marked so (an interceptor on it flies on blind)
function adsLetGo(tr) { const i = ADS.tr.indexOf(tr); if (i >= 0) ADS.tr.splice(i, 1); tr.gone = true; tr.th.tr = null; if (AD.hook === tr) adsHook(null); }
```

The whole old `adsEngage` with its comment (`// engaging comes with the interceptors ...` through its closing `}`):
replaced by the one line `// (engaging: 07d-adwpn.js)` (07d's `adsEngage` is the one).

In `adsReset`: `ADS.plan = ADS_PLAN.slice(); AD.hook = null; adsCap(); }` becomes
`ADS.plan = ADS_PLAN.slice(); AD.hook = null; adwReset(); adsCap(); }`.

In `adsTickSim`, after `for (const o of ADS.th) if (o.alive) adsMove(o, dt);` add the line `  adwStep(dt); adwGun(dt);`.

The assist's cue: the comment and `function adsCue() {...}` replaced by
```js
// the assist's cue: the next step's control (07b-airdef.js lights it): a track still to deal with and none hooked
// (or the one hooked dealt with), the table's step; an unknown aircraft hooked, IFF, and declare it if it did not
// answer; a suspect drone hooked, confirm it; a hostile hooked, master arm and hold fire let go, then the system knob if
// it is on one that would turn it down, and engage. A hostile is dealt with once engaged, or a drone or a cruise missile
// given to the gun (and any drone with the gun on auto: it is the gun's), all of it only while armed and free to fire;
// a drone with the gun held, the gun's auto
const adsTodo = t => t.id !== 'FRD' && !(t.id === 'HOS' && AD.armed && !AD.hold && (t.eng || (AD.cram && (t.gun || t.cls === 'UAV'))));
function adsCue() {
  if (!ADS.tr.length) return '';
  const tr = AD.hook;
  if (!tr || !adsTodo(tr)) { for (const t of ADS.tr) if (t !== tr && adsTodo(t)) return 'UP'; return ''; }
  if (tr.id === 'UNK' && tr.cls === 'ACFT') return tr.iff ? 'CLASS' : 'IFF';
  if (tr.id === 'SUS') return 'CLASS';
  if (tr.id !== 'HOS') return '';
  if (!AD.armed) return 'ARM';
  if (AD.hold) return 'HOLDFIRE';
  if (tr.cls === 'UAV') return 'GUNAUTO';
  const sys = ADA_SYS[AD.sys];
  if ((sys === 'UPR' && tr.cls !== 'TBM') || (sys === 'CRAM' && tr.cls !== 'UAV' && tr.cls !== 'CM')) return 'SYSTEM';
  return 'ENGAGE';
}
```

## src/game/07b-airdef.js

The RLD control, OLD
```js
  [ADC_RG[2][0], ADC_RG[2][1], 26, () => adaSay('SYS', 'ALL LAUNCHERS FULL', 'كل القواذف ممتلئة', false, ['a.full']), 'RLD'],
```
NEW
```js
  // (reload: a crew at the launchers with a crane, some half an hour a launcher: not under a red warning)
  [ADC_RG[2][0], ADC_RG[2][1], 26, () => AD.lnch.every(L => L.left === L.cap) ? adaSay('SYS', 'ALL LAUNCHERS FULL', 'كل القواذف ممتلئة', false, ['a.full'])
    : adaSay('SYS', 'NO RELOAD UNDER AIR DEFENSE WARNING RED', 'لا تعبئة تحت الإنذار الأحمر', false, ['a.norld']), 'RLD'],
```

In `adcAir`, OLD
```js
  for (const tr of ADS.tr) if (tr !== AD.hook) adcTrack(tr, at, cx, cy, R, R0);
  c.restore();
```
NEW
```js
  for (const tr of ADS.tr) if (tr !== AD.hook) adcTrack(tr, at, cx, cy, R, R0);
  // the interceptors in the air: a white dot each on its ground track, a short line along its course (inside the range)
  c.strokeStyle = c.fillStyle = ADC_W; c.lineWidth = 1.5;
  for (const m of ADW_MS) {
    if (!m.on) continue; const r = Math.hypot(m.x, m.y) / 1000; if (r > R) continue;
    const [X, Y] = at(adOff(adBrg(m.x, m.y), AD.az), r), a = AD.az * D2R, ex = m.vx * Math.cos(a) - m.vy * Math.sin(a), ny = m.vx * Math.sin(a) + m.vy * Math.cos(a), v = Math.hypot(ex, ny);
    c.beginPath(); c.arc(X, Y, 2.5, 0, Math.PI * 2); c.fill();
    if (v > 1) { c.beginPath(); c.moveTo(X, Y); c.lineTo(X - ex / v * 9, Y + ny / v * 9); c.stroke(); }
  }
  c.restore();
```

In `adcTracks`, OLD `    const st = tr.cst ? 'CST' : tr.id === 'FRD'` NEW
```js
    // (its engagement first: its rounds in the air, planned, or given to the gun)
    const st = tr.eng ? (tr.eng.fly ? 'ENG' : 'PLN') : tr.gun ? 'GUN' : tr.cst ? 'CST' : tr.id === 'FRD'
```

In `adcLnch`, the settings line's array gets a fifth entry: after `[AD.hold ? 'HOLD FIRE' : '', ADC_R]` add
`,\n    [ADS.fly ? ADS.fly + ' IN FLT' : '', ADC_G]` (before the closing `];`).

## tools/make_radio.py (the `A` dict, before `'a.i.HOS'`)

```python
    # the weapons (07d-adwpn.js)
    'a.locked': 'Track locked.', 'a.engaging': 'Engaging.', 'a.planned': 'Engagement planned.', 'a.engaged': 'Track already engaged.',
    'a.away': 'Missile away.', 'a.splash': 'Splash. Target destroyed.', 'a.miss': 'Miss. Target still active.', 'a.leaker': 'Leaker, leaker!',
    'a.nosol': 'No intercept solution.', 'a.noammo': 'No interceptors remaining.',
    'a.w.upr': 'Upper tier. Ballistic targets only.', 'a.w.lwr': 'Lower tier. Not for drones.', 'a.w.gun': 'Close-in gun. Drones and cruise missiles only.',
    'a.togun': 'Assigned to close-in gun.', 'a.guneng': 'Close-in gun engaging.', 'a.gunout': 'Close-in gun, Winchester.',
    'a.norld': 'No reload. Air defense warning red.',
```

## tests/airdef.cjs

The voice-keys check reads the three files: replace
`const src = require('fs').readFileSync(S + '/src/game/07b-airdef.js', 'utf8') + require('fs').readFileSync(S + '/src/game/07c-adsim.js', 'utf8'), ids`
with
`const src = ['07b-airdef', '07c-adsim', '07d-adwpn'].map(f => fs.readFileSync(S + '/src/game/' + f + '.js', 'utf8')).join('\n'), ids`.

After the "its air picture fresh too" check (the restarted sortie), before `ok(errs.length === 0, 'no page errors', errs);`:
```js
  // the weapons (07d-adwpn.js), on this fresh sortie: the wrong system turned down, the gun given the drones, and the
  // night played through by the book (each drone confirmed, each missile engaged on automatic as it is classified),
  // its chances fixed by a seeded random: interceptors away from their launchers, kills, the gun's rounds spent,
  // and the step kept light
  { await page.evaluate(() => { let s = 7; Math.random = () => (s = s * 16807 % 2147483647) / 2147483647; });
    await press(1238, 708);                                                   // (master arm)
    const d = await page.evaluate(() => { const g = window.__saqr; while (g.ADS.t < 14) g.adaFrame(0.25); const t = g.ADS.tr.find(t => t.cls === 'UAV'); g.adsHook(t); return !!t; });
    ok(d, 'a drone in the picture');
    await press(468, 577); await press(1381, 727); ok(/ASSIGNED TO CLOSE-IN GUN/.test((await get()).msg), 'a hostile drone engaged on AUTO: given to the gun');
    await press(597, 718); await press(1381, 727); ok(/UPPER TIER: BALLISTIC TARGETS ONLY/.test((await get()).msg), 'on UPR: turned down');
    await press(597, 718); await press(1381, 727); ok(/LOWER TIER: NOT FOR DRONES/.test((await get()).msg), 'on LWR: turned down');
    await press(597, 718); await press(597, 718); ok((await get()).sys === 3, 'the knob back on AUTO');
    const r = await page.evaluate(() => { const g = window.__saqr, A = g.AD, S = g.ADS, eng = g.ADC_CTL.find(c => c[4] === 'ENGAGE')[3], seen = new Set(), k0 = A.lnch.map(L => L.left), o = { worst: 0, upr: null, low: null, cue: new Set() };
      while (S.t < 345) {
        for (const t of S.tr) {
          if (t.id === 'SUS') t.id = 'HOS';
          if (t.id === 'HOS' && (t.cls === 'CM' || t.cls === 'TBM') && !t.eng && !t.tried) { t.tried = true; g.adsHook(t); eng(); if (t.cls === 'TBM' && !o.upr) o.upr = t.eng && t.eng.k; }
          if (t.cls === 'TBM' && t.eng && t.eng.k === 'MSE') o.low = true;
        }
        const t0 = performance.now(); g.adaFrame(0.25); o.worst = Math.max(o.worst, performance.now() - t0);
        if (A.msg) seen.add(A.msg.en.replace(/TN \d{5} ?/, '')); if (A.cue) o.cue.add(A.cue);
      }
      const used = A.lnch.map((L, i) => k0[i] - L.left);
      return { used, kills: S.kills, hits: S.hits, rds: A.cramRds, fly: S.fly, eng: S.eng.length, upr: o.upr, low: o.low, worst: +o.worst.toFixed(1), msgs: [...seen], cue: [...o.cue] }; });
    ok(r.upr === 'UPR', 'a ballistic missile engaged on AUTO: the upper tier first', r.upr);
    ok(r.used[0] + r.used[1] >= 2 && r.used[2] + r.used[5] >= 1, 'interceptors away: the upper tier\'s on the ballistic pair, the lower\'s blast-fragmentation on the cruise missiles', r.used);
    ok(r.kills >= 6 && r.rds < 1550, 'kills, and the gun\'s rounds spent on the drones', { kills: r.kills, hits: r.hits, rds: r.rds });
    ok(r.msgs.some(m => /SPLASH/.test(m)) && r.msgs.some(m => /AWAY/.test(m)), 'said: away, splash', r.msgs.filter(m => /AWAY|SPLASH|MISS|LEAKER|GUN/.test(m)));
    ok(r.fly === 0 && r.eng === 0, 'all of it over at the end: none in the air, no engagement left', [r.fly, r.eng]);
    ok(r.worst < 25, 'each tick light (the slowest, its drawing included, ms)', r.worst);
    ok(r.cue.includes('ENGAGE') || r.cue.includes('UP'), 'the assist through it', r.cue);
    await shot('6-weapons'); }
```

## docs/DEVELOPER.md

- The module table, after the `07b-airdef.js` row, two rows:
  `| \`07c-adsim.js\` | \`air defence: the threats, the radars, the tracks\` | صورة الجو: التهديدات وطيرانها، الرادارات، المسارات وهويتها، المساعد |` and
  `| \`07d-adwpn.js\` | \`air defence: the interceptors, the launchers, the close-in gun\` | صواريخ الاعتراض والقواذف والمدفع القريب: خطة الاشتباك، التوجيه، الإصابة |`.
- §١٨, the threats bullet: the cruise missile's dog-leg 30 km (was 50); the ballistic one short-range (apogee ~80 km at
  150 km, ~45° and ~1.7 km/s at the end; was ~150 km and 2.4 km/s); `ADS_PLAN` some four minutes, every threat at the
  base within it.
- §١٨, a new bullet before the voice bullet, on the weapons: ENGAGE locks first ("Track locked"), then the plan
  (`adwPlan` -> `adwFirst` -> `adwOk` -> `adwTof`, the boost curve `adwDist`); the three interceptors and their
  envelopes (`ADW`); the system knob's refusals and `AUTO`'s allocation; the doctrine S / SS / SLS; guidance from the
  radar's data (blind when coasting); the kill at the closest pass under 50 m by its chance; the leaker hand-down;
  integrated fire control; the gun (GUN AUTO and armed, nearest hostile drone or cruise missile within 2 km, 75-round
  bursts); the fixed pool `ADW_MS` (16); the shelter's sounds made live (`adwSnd`); no reload under a red warning.
