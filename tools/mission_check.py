"""The missions' own check, run by tools/build.py before it builds: a mission is data (data/maps/<id>/map.json and
missions_f15.json), and the game drops what it does not know without a word (buildUnits: a vehicle of an unknown
kind is simply not there), so a slip in a file would lose a target and nobody would see why. Here every mission of
every map is held to what the game reads; the build stops on the first file with a fault, and says where.

What a mission is (the game's reading of it: startMission, placePlane, buildLayout, buildUnits, jetPlace):
  id (unique on its map), ar, en, desc: text; night: true/false; fly: 'orbit', 'pad', or a hover point of the map;
  layout: the units, each one of
    {t: 'veh', k: a vehicle (SPR), x, y on the map, h, ...}   (or on the road: convoy/move with s, or a path)
    {t: 'pax', x, y, n: 1..12, aa, side}
    {t: 'house', k: a house (HOUSE), x, y, r, role: civil/hostile}
    {t: 'blds', role, area: [x0, y0, x1, y1]}                  (the map picture's buildings in that box)
  side 'blue' (ours) or red (the default); phases: [{en, ar, layout}]; jet: {c: [x, y], ft, kcas, R, load}.
  python3 tools/mission_check.py   checks without building
"""
import json, pathlib, re

root = pathlib.Path(__file__).resolve().parent.parent

def keys(js, name):
    """the keys of the game's object literal `const name = {` (one key a line, two spaces in)"""
    m = re.search(r'^const ' + name + r' = \{\n(.*?)^\};', js, re.S | re.M)
    if not m: raise SystemExit('mission_check: no const ' + name + ' in the game')
    return set(re.findall(r'^  (\w+):', m.group(1), re.M))

def game():
    js = ''.join(f.read_text(encoding='utf8') for f in sorted((root / 'src' / 'game').glob('*.js')))
    return {'veh': keys(js, 'SPR'), 'house': keys(js, 'HOUSE'), 'load': keys(js, 'LOADOUTS_J')}

ROLES = {'civil', 'hostile', 'struct'}
SIDES = {'blue', 'red'}

def check_map(mid, m, ms, G):
    """the faults of one map's missions, as 'map/mission: what' lines"""
    errs, ids = [], set()
    W, H, hover = m['w'], m['h'], set((m.get('hover') or {}).keys())
    num = lambda v: isinstance(v, (int, float)) and not isinstance(v, bool)
    def on_map(where, x, y, edge=0):
        if not (num(x) and num(y)): errs.append(f'{where}: x, y must be numbers'); return
        if not (-edge <= x <= W + edge and -edge <= y <= H + edge): errs.append(f'{where}: ({x}, {y}) is off the map ({W} x {H})')
    def units(where, items):
        if not isinstance(items, list): errs.append(f'{where}: layout must be a list'); return
        for i, it in enumerate(items):
            w = f'{where} unit {i + 1}'
            t = it.get('t') if isinstance(it, dict) else None
            if t not in ('veh', 'pax', 'house', 'blds'): errs.append(f'{w}: t must be veh, pax, house or blds, not {t!r}'); continue
            if 'side' in it and it['side'] not in SIDES: errs.append(f'{w}: side {it["side"]!r}')
            if t == 'veh':
                if it.get('k') not in G['veh']: errs.append(f'{w}: no vehicle {it.get("k")!r} in the game'); continue
                if it.get('path') is not None:
                    if not isinstance(it['path'], list) or len(it['path']) < 1: errs.append(f'{w}: path must be a list of points')
                    else:
                        # (a boat's path may come in from the sea beyond the map's edge)
                        for p in it['path']: on_map(w + ' path', *(p[:2] if isinstance(p, list) and len(p) >= 2 else (None, None)), edge=600)
                elif it.get('convoy') or it.get('move'):
                    if 's' in it and not num(it['s']): errs.append(f'{w}: s (along the road) must be a number')
                    if not it.get('convoy') and 'x' in it: on_map(w, it.get('x'), it.get('y'))
                else: on_map(w, it.get('x'), it.get('y'))
                for k in ('h', 'spd', 'haltS', 'haltFor', 'startAt', 'window', 'ambush'):
                    if k in it and not num(it[k]): errs.append(f'{w}: {k} must be a number')
            elif t == 'pax':
                on_map(w, it.get('x'), it.get('y'))
                if not (isinstance(it.get('n'), int) and 1 <= it['n'] <= 12): errs.append(f'{w}: n (men) must be 1 to 12')
                if 'aa' in it and not (isinstance(it['aa'], int) and it['aa'] >= 0): errs.append(f'{w}: aa must be a count')
            elif t == 'house':
                if it.get('k') not in G['house']: errs.append(f'{w}: no house {it.get("k")!r} in the game')
                on_map(w, it.get('x'), it.get('y'))
                if it.get('role', 'civil') not in ('civil', 'hostile'): errs.append(f'{w}: role {it.get("role")!r}')
            else:
                if it.get('role') not in ROLES: errs.append(f'{w}: role {it.get("role")!r}')
                a = it.get('area')
                if a is not None and not (isinstance(a, list) and len(a) == 4 and all(map(num, a)) and a[0] <= a[2] and a[1] <= a[3]):
                    errs.append(f'{w}: area must be [x0, y0, x1, y1]')
    for mi in ms:
        where = f'{mid}/{mi.get("id", "?")}'
        if not isinstance(mi.get('id'), str) or not mi['id']: errs.append(f'{where}: no id'); continue
        if mi['id'] in ids: errs.append(f'{where}: the id is used twice')
        ids.add(mi['id'])
        for k in ('ar', 'en', 'desc'):
            if not isinstance(mi.get(k), str) or not mi[k].strip(): errs.append(f'{where}: {k} must be text')
        if not isinstance(mi.get('night'), bool): errs.append(f'{where}: night must be true or false')
        if mi.get('fly', 'orbit') not in {'orbit', 'pad'} | hover: errs.append(f'{where}: fly {mi.get("fly")!r} (orbit, pad or one of {sorted(hover)})')
        units(where, mi.get('layout'))
        for j, ph in enumerate(mi.get('phases') or []):
            w = f'{where} phase {j + 1}'
            for k in ('ar', 'en'):
                if not isinstance(ph.get(k), str): errs.append(f'{w}: {k} must be text')
            units(w, ph.get('layout'))
        if 'jet' in mi:
            j = mi['jet']
            if 'c' in j:
                if isinstance(j['c'], list) and len(j['c']) == 2: on_map(where + ' jet orbit', *j['c'])
                else: errs.append(f'{where}: jet.c must be [x, y]')
            for k, lo, hi in (('ft', 1000, 40000), ('kcas', 150, 600), ('R', 1000, 20000)):
                if k in j and not (num(j[k]) and lo <= j[k] <= hi): errs.append(f'{where}: jet.{k} must be {lo} to {hi}')
            if 'load' in j and j['load'] not in G['load']: errs.append(f'{where}: jet.load {j["load"]!r} (one of {sorted(G["load"])})')
    return errs

def check_all():
    G, errs = game(), []
    for f in sorted((root / 'data' / 'maps').glob('*/map.json')):
        m = json.loads(f.read_text())
        ms = list(m.get('missions', []))
        jf = f.parent / 'missions_f15.json'
        errs += check_map(f.parent.name, m, ms, G)
        if jf.exists(): errs += check_map(f.parent.name + ' (F-15)', m, json.loads(jf.read_text()), G)
    return errs

if __name__ == '__main__':
    e = check_all()
    print('\n'.join(e) if e else 'missions: all sound')
    raise SystemExit(1 if e else 0)
