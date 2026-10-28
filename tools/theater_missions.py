"""The theatre's missions: the other maps' missions moved to where those maps sit in it, all flown from the air base.

usage: python3 tools/theater_missions.py   (after make_theater.py; writes data/maps/theater/missions.json and puts
the missions into map.json too)

Positions move by each map's offset; a convoy's place along the road (s, haltS: metres from the road's start) moves
by where that map's stretch of road starts in the joined road; building roles by area move with the map. The base's
own buildings are no-strike in every mission. Every mission starts on the pad (fly: 'pad'). Besides the moved ones: a
long convoy escort through the theatre, the base's defence, and an operation in three phases that ends on the pad.
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
       {'t': 'pax', 'k': 'pax', 'x': 1262, 'y': 604, 'n': 2, 'aa': 2},
       {'t': 'veh', 'k': 'trench', 'x': 1112, 'y': 505, 'h': 2.9, 'move': False}, {'t': 'veh', 'k': 'mortar', 'x': 1385, 'y': 560, 'h': 3.0, 'move': False}]
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
    {'id': 'th_wadi', 'ar': 'إسناد عند الوادي', 'en': 'TIC AT THE WADI', 'night': False, 'fly': 'pad',
     'desc': 'من القاعدة غربًا: ' + desert['wadi_tic']['desc'], 'layout': move(desert['wadi_tic']['layout'], 'desert') + [base]},
    {'id': 'th_quay', 'ar': 'تأمين الرصيف', 'en': 'SECURE THE QUAY', 'night': False, 'fly': 'pad',
     'desc': 'من القاعدة جنوبًا: ' + port['quay_tic']['desc'], 'layout': move(port['quay_tic']['layout'], 'port') + [base]},
    {'id': 'th_raid', 'ar': 'اقتحام المعسكر', 'en': 'NIGHT ASSAULT', 'night': True, 'fly': 'pad',
     'desc': 'من القاعدة ليلًا: ' + port['raid']['desc'], 'layout': move(port['raid']['layout'], 'port') + [base]},
]
# the escort through the theatre: a convoy from the top of the desert down past the base, the wadi crossing, the port's
# depot, to the camp road's junction; the desert's ambushes and the port's on the way
s_des, s_port = start_of('desert'), start_of('port')
amb = lambda items, pid: [it for it in move(items, pid) if it.get('ambush')]
fc = [dict(it, convoy='F', s=round(s_des + 100 - 30 * i, 1), haltS=round(s_port + 640 - 30 * i, 1)) for i, it in enumerate(desert['escort']['layout'][:4])]
M.append({'id': 'th_escort', 'ar': 'مرافقة رتل طويل', 'en': 'LONG ESCORT', 'night': False, 'fly': 'pad',
          'desc': 'من القاعدة: رتل إمداد صديق (مدرعتان وشاحنة وصهريج) ينزل من أعلى الصحراء ماراً بالقاعدة وعبور الوادي ومستودعات الميناء حتى تقاطع المعسكر، نحو 1.5 كم. كمائن متوقعة عند العبور وحافة الكثبان وبين الوادي والصخور قرب الميناء. يتوقف تحت النار ويتحرك حين تُسكت المدافع التي تطاله؛ ارجع للقاعدة لإعادة التسليح إن احتجت. تنتهي المهمة حين يصل.',
          'layout': fc + amb(desert['escort']['layout'], 'desert') + amb(port['escort']['layout'], 'port') + move([it for it in port['escort']['layout'] if it.get('t') == 'blds'], 'port') + [base]})
# the base attacked: technicals come down the main road and stop at the junction of the base's road, fighters and a
# 23 mm gun close in on the west fence; the guard holds the gate and the fence; the aircraft scrambles from the pad
gx, gy = th['base']['gate']
j = min(range(len(road)), key=lambda i: abs(road[i][1] - gy) + abs(road[i][0] - gx) * 0.2 if road[i][0] < gx else 1e9)
sj = s[j]
red = [{'t': 'veh', 'k': k, 'convoy': 'R', 'dir': 1, 's': round(sj - 420 - 30 * i, 1), 'spd': 10, 'haltS': round(sj - 40 - 30 * i, 1), 'haltFor': 9999, 'startAt': 25} for i, k in enumerate(['hilux', 'lc79', 'hilux'])]
P = lambda x, y, n, **o: dict({'t': 'pax', 'k': 'pax', 'x': x, 'y': y, 'n': n}, **o)
V = lambda k, x, y, h, **o: dict({'t': 'veh', 'k': k, 'x': x, 'y': y, 'h': h, 'move': False}, **o)
M.append({'id': 'th_def', 'ar': 'الدفاع عن القاعدة', 'en': 'BASE DEFENCE', 'night': False, 'fly': 'pad',
          'desc': 'هجوم على القاعدة: مقاتلون وفنيّ برشاش 12.7 يقتربون من السياج الغربي، ومدفع 23 ملم مزدوج وفريق صواريخ كتف خلفهم، وفنيّات أخرى تنزل على الطريق الرئيسي إلى تقاطع طريق القاعدة. الحراسة تمسك البوابة والسياج. أقلع فورًا من المنصة. مباني القاعدة لنا: لا تُصبها.',
          'layout': [P(2185, 1383, 4, side='blue'), P(2190, 1290, 4, side='blue'), V('mrap', 2200, 1420, 3.14, side='blue'), P(2180, 1650, 3, side='blue'),
                     P(2100, 1300, 5), P(2080, 1460, 4), V('hilux', 2000, 1420, 0.0), V('lc79', 1900, 1250, 0.3), P(1960, 1560, 2, aa=2), P(2120, 1720, 3)] + red + [base]})
# one operation in three phases, north to south, with the radio giving each new tasking once the last is done; rearm
# on the pad between them (BASE); the operation ends back on the pad
units = lambda items: [it for it in items if it.get('t') != 'blds']
M.append({'id': 'th_op', 'ar': 'عملية صقر الوادي', 'en': 'OPERATION SAQR', 'night': False, 'fly': 'pad', 'rtb': True,
          'desc': 'عملية من ثلاث مراحل: (1) إسناد الدورية في الوادي شمالًا، (2) ثم إسناد الدورية عند عبور الوادي في الصحراء، (3) ثم تأمين رصيف الميناء جنوبًا. المهمة التالية تصلك بالراديو حين تُحسم السابقة. أعد التسليح في القاعدة بين المراحل (BASE)، والعملية تنتهي بهبوطك على المنصة.',
          'layout': move(tic, 'valley') + move([it for it in port['quay_tic']['layout'] if it.get('t') == 'blds'], 'port') + [base],
          'phases': [{'en': 'NEW TASKING: TROOPS IN CONTACT AT THE WADI CROSSING', 'ar': 'مهمة جديدة: دورية صديقة تحت النار عند عبور الوادي في الصحراء، توجّه جنوبًا', 'layout': units(move(desert['wadi_tic']['layout'], 'desert'))},
                     {'en': 'NEW TASKING: FRIENDLIES AT THE PORT DEPOT UNDER FIRE', 'ar': 'مهمة جديدة: قوة صديقة في ساحة مستودعات الميناء تحت النار من الرصيف، توجّه جنوبًا', 'layout': units(move(port['quay_tic']['layout'], 'port'))}]})
# the new targets for the Apache too: the armoured column (from the F-15's mission, tools/jet_missions.py), the dhow at
# sea, the landing on the cove; flown from the pad
import importlib.util
spec = importlib.util.spec_from_file_location('jm', root / 'tools' / 'jet_missions.py'); jm = importlib.util.module_from_spec(spec)
import sys as _s; _argv = _s.argv; _s.argv = ['x']; spec.loader.exec_module(jm); _s.argv = _argv
J = {m['id']: m for m in jm.MISSIONS}
for jid, tid, ar, en, pre in [('j_armor', 'th_armor', 'رتل مدرع', 'ARMOUR', 'من القاعدة غربًا ثم شمالًا: '), ('j_sea', 'th_sea', 'اعتراض بحري', 'MARITIME', 'من القاعدة إلى الساحل جنوبًا غربًا: '),
                              ('j_land', 'th_land', 'إنزال بحري', 'LANDING', 'من القاعدة إلى الساحل غربًا: ')]:
    m = J[jid]
    # (without the jet's SA-8: it would bring down a helicopter in the valley before it saw it)
    M.append({'id': tid, 'ar': ar, 'en': en, 'night': m['night'], 'fly': 'pad', 'desc': pre + m['desc'].replace(jm.SA8_NOTE, '').replace('المافريك', 'الهيلفاير').replace('قنبلة الليزر', 'الهيلفاير').replace('القنبلة أو ', ''),
              'layout': [it for it in m['layout'] if it is not jm.BASE and it.get('k') != 'sa8'] + [base]})
(root / 'data' / 'maps' / 'theater' / 'missions.json').write_text(json.dumps(M, ensure_ascii=False, indent=1))
th['missions'] = M
# the hover points: over the valley's western hills (1.2 km north-west of the centre), and east of the coast and the
# camp (1 km south-south-east), both out of the ambush guns' reach
th['hover'] = {'h1': {'b': 314, 'd': 1180}, 'h2': {'b': 160, 'd': 900}}
(root / 'data' / 'maps' / 'theater' / 'map.json').write_text(json.dumps(th, ensure_ascii=False))
print('missions', [m['id'] for m in M], 'road starts', {p: round(start_of(p)) for p in parts})
