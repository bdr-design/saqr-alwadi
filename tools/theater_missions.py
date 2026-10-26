"""The theatre's missions: the other maps' missions moved to where those maps sit in it, all flown from the air base.

usage: python3 tools/theater_missions.py   (after make_theater.py; writes data/maps/theater/missions.json and puts
the missions into map.json too)

Positions move by each map's offset; a convoy's place along the road (s, haltS: metres from the road's start) moves
by where that map's stretch of road starts in the joined road; building roles by area move with the map. The base's
own buildings are no-strike in every mission. Every mission starts on the pad (fly: 'pad').
"""
import json, math, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
th = json.loads((root / 'data' / 'maps' / 'theater' / 'map.json').read_text())
parts = th['parts']; road = th['road']; MPP = 0.85
# where each map's stretch of road starts along the joined road (m): at the point nearest that map's first road point
s = [0.0]
for i in range(1, len(road)): s.append(s[-1] + math.hypot(road[i][0] - road[i - 1][0], road[i][1] - road[i - 1][1]) * MPP)
def start_of(pid):
    first = json.loads((root / 'data' / 'road.json').read_text())[0] if pid == 'valley' else json.loads((root / 'data' / 'maps' / pid / 'map.json').read_text())['road'][0]
    ox, oy = parts[pid]; fx, fy = first[0] + ox, first[1] + oy
    i = min(range(len(road)), key=lambda i: (road[i][0] - fx) ** 2 + (road[i][1] - fy) ** 2)
    return s[i]
def move(items, pid):
    ox, oy = parts[pid]; s0 = start_of(pid); out = []
    for it in items:
        it = dict(it)
        if 'x' in it: it['x'] = round(it['x'] + ox, 1); it['y'] = round(it['y'] + oy, 1)
        if it.get('convoy'):
            it['convoy'] = pid[0].upper() + it['convoy']; it['s'] = round(it['s'] + s0, 1)
            if it.get('haltS') is not None: it['haltS'] = round(it['haltS'] + s0, 1)
        if it.get('t') == 'blds' and it.get('area'): a = it['area']; it['area'] = [a[0] + ox, a[1] + oy, a[2] + ox, a[3] + oy]
        out.append(it)
    return out
base = {'t': 'blds', 'role': 'civil', 'area': th['base']['area']}
# the valley's troops-in-contact mission (in the game's code there; the same layout)
tic = [{'t': 'veh', 'k': 'mrap', 'side': 'blue', 'x': 966, 'y': 486, 'h': 1.62, 'move': False}, {'t': 'veh', 'k': 'mrap', 'side': 'blue', 'x': 961, 'y': 522, 'h': 1.8, 'move': False},
       {'t': 'pax', 'k': 'pax', 'side': 'blue', 'x': 944, 'y': 494, 'n': 4}, {'t': 'pax', 'k': 'pax', 'side': 'blue', 'x': 938, 'y': 526, 'n': 4},
       {'t': 'pax', 'k': 'pax', 'x': 1140, 'y': 470, 'n': 5}, {'t': 'pax', 'k': 'pax', 'x': 1176, 'y': 548, 'n': 4},
       {'t': 'veh', 'k': 'hilux', 'x': 1226, 'y': 500, 'h': 3.0, 'move': False}, {'t': 'veh', 'k': 'lc79', 'x': 1330, 'y': 384, 'h': 2.4, 'move': False},
       {'t': 'pax', 'k': 'pax', 'x': 1262, 'y': 604, 'n': 2, 'aa': 2}]
desert = {m['id']: m for m in json.loads((root / 'data' / 'maps' / 'desert' / 'missions.json').read_text())}
port = {m['id']: m for m in json.loads((root / 'data' / 'maps' / 'port' / 'missions.json').read_text())}
M = [
    {'id': 'th_tic', 'ar': 'إسناد من القاعدة', 'en': 'TIC FROM BASE', 'night': False, 'fly': 'pad',
     'desc': 'من القاعدة: دورية صديقة تحت النار في الوادي شمالًا، على بعد نحو 1.5 كم. أقلع واتجه شمالًا، ونسّق مع هنتر. ارجع للقاعدة (BASE) لإعادة التسليح.',
     'layout': move(tic, 'valley') + [base]},
    {'id': 'th_cross', 'ar': 'عبور الوادي', 'en': 'WADI CROSSING', 'night': False, 'fly': 'pad',
     'desc': 'من القاعدة: ' + desert['crossing']['desc'], 'layout': move(desert['crossing']['layout'], 'desert') + [base]},
    {'id': 'th_port', 'ar': 'غارة الميناء', 'en': 'PORT RAID', 'night': False, 'fly': 'pad',
     'desc': 'من القاعدة جنوبًا إلى الساحل: ' + port['port']['desc'], 'layout': move(port['port']['layout'], 'port') + [base]},
    {'id': 'th_camp', 'ar': 'ضربة المعسكر', 'en': 'CAMP STRIKE', 'night': True, 'fly': 'pad',
     'desc': 'من القاعدة ليلًا: ' + port['camp']['desc'], 'layout': move(port['camp']['layout'], 'port') + [base]},
]
(root / 'data' / 'maps' / 'theater' / 'missions.json').write_text(json.dumps(M, ensure_ascii=False, indent=1))
th['missions'] = M
# the hover points: over the valley's western hills (1.2 km north-west of the centre), and east of the coast and the
# camp (1 km south-south-east), both out of the ambush guns' reach
th['hover'] = {'h1': {'b': 314, 'd': 1180}, 'h2': {'b': 160, 'd': 900}}
(root / 'data' / 'maps' / 'theater' / 'map.json').write_text(json.dumps(th, ensure_ascii=False))
print('missions', [m['id'] for m in M], 'road starts', {p: round(start_of(p)) for p in parts})
