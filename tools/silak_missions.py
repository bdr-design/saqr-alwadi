"""Silak port (maps/silak: the ops area on Velmora's coast, 5188 map px a side, tools/make_ops.py silak): its missions,
the ZF-25's into data/maps/silak/missions_f15.json, the Sahm's into data/maps/silak/missions.json and its map.json.

  python3 tools/silak_missions.py && python3 tools/build.py --trial

The area: an old airstrip north-west (its runway's south end and turning pad about 950, 2050; a walled compound on its
apron about 310, 1910), the coast road from the north (its 'road', 4,226 m: down the west carriageway, round the
roundabout at about 530 m, past a walled compound on its west side at 1,550 m (3,890-4,100, 1,730-1,850), into the town
from 2,350 m), a rock mole on the beach east of the road (its head about 4,870, 1,990, a fisherman's hut on it), the
sea east of that, and the town south and south-east, civilian. No base here: every sortie starts on station.
Places are map px (0.85 m each); the road's s is metres from its north end.
"""
import json, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
D = root / 'data' / 'maps' / 'silak'
veh = lambda k, x, y, h=0.0, **o: dict({'t': 'veh', 'k': k, 'x': x, 'y': y, 'h': h, 'move': False}, **o)
pax = lambda x, y, n, **o: dict({'t': 'pax', 'k': 'pax', 'x': x, 'y': y, 'n': n}, **o)
sea = lambda k, path, spd, **o: dict({'t': 'veh', 'k': k, 'path': path, 'spd': spd}, **o)
blue = lambda d: dict(d, side='blue')
SOUTH = 1.66                                             # (heading down the road by the compound, map px frame)

def convoy(cid, s0, kinds, v, halt=None, wait=None, start=0):
    """kinds down the road from s0 southward, 32 m apart nose to tail; one halt (s, seconds) for the lead"""
    out = []
    for i, k in enumerate(kinds):
        s = s0 - i * 32
        it = {'t': 'veh', 'k': k, 'convoy': cid, 'dir': 1, 's': s, 'spd': v}
        if halt: it.update(haltS=halt + (s - s0), haltFor=wait)
        if start: it['startAt'] = start
        out.append(it)
    return out

# the compound by the coast road: its gate on the south wall, the track from it south (about 4,000, 1,850)
GATE = [veh('hilux', 3995, 1880, 1.6), veh('lc79', 4060, 1872, 3.0), pax(4020, 1890, 3)]
# the mole: a dhow moored on its south side, unloading into trucks on the sand behind it
MOLE = [veh('cargo', 4752, 1945, 0.5), veh('ammo', 4766, 1920, 0.5), veh('tanker', 4738, 1972, 0.5), pax(4790, 1996, 4)]

JET = [
    {'id': 'j_sk_coast', 'ar': 'رتل الطريق الساحلي', 'en': 'COAST ROAD', 'night': False, 'fly': 'orbit',
     'jet': {'c': [3900, 1500], 'ft': 15000, 'kcas': 300, 'R': 5000, 'load': 'standoff'},
     'desc': 'رتل معادٍ من ست مركبات ينزل من الشمال على الطريق الساحلي، يلف الدوّار ويتوقف عند المجمّع المسوّر غرب الطريق '
             'ليلتقي فنيّين عند بوابته، ثم يكمل جنوبًا إلى المدينة. إن دخل المدينة ضاع بين بيوتها، وهي مدنية ومكتظة: أوقفه '
             'قبلها. الهدف يتحرك: قنبلة الليزر تلاحقه، والبرق للأسرع، وقنبلة الـ GPS لا تصيب المتحرك.',
     'layout': convoy('SK', 300, ['hilux', 'lc79', 'cargo', 'tanker', 'mrap', 'hilux'], 9, halt=1554, wait=40, start=15) + GATE},

    {'id': 'j_sk_strip', 'ar': 'مدرج سيلاك القديم', 'en': 'OLD AIRSTRIP', 'night': False, 'fly': 'orbit',
     'jet': {'c': [700, 1900], 'ft': 15000, 'kcas': 300, 'R': 5000, 'load': 'cas'},
     'desc': 'العدو يستعمل المدرج القديم شمال غرب سيلاك: فنيّان ومدفع 23 ملم عند ساحة الدوران في طرفه الجنوبي، ومقاتلون '
             'معهم. الاستخبارات تتوقع منصة صواريخ مخبأة في المجمّع المسوّر على ساحة المدرج تخرج للإطلاق: إن ظهرت فأمامك ثلاث '
             'دقائق قبل أن تطلق وتعود إلى مخبئها. المدينة بعيدة جنوب شرق.',
     'layout': [veh('hilux', 905, 2070, 0.3), veh('lc79', 965, 2045, 2.6), veh('zu23e', 1035, 2010, 0.0), pax(940, 2088, 4),
                veh('cargo', 300, 1930, 0.0), veh('launcher', 322, 1895, 1.6, startAt=60, window=180)]},

    {'id': 'j_sk_mole', 'ar': 'تهريب عند اللسان الصخري', 'en': 'THE MOLE', 'night': False, 'fly': 'orbit',
     'jet': {'c': [4600, 2000], 'ft': 15000, 'kcas': 300, 'R': 5000, 'load': 'strike'},
     'desc': 'قارب داو راسٍ عند اللسان الصخري شرق الطريق الساحلي يفرغ سلاحًا في شاحنتين وصهريج على الرمل، وزورق هجوم سريع '
             'ينتظر في البحر. الكوخ على اللسان لصيّاد، وقوارب الصيد حولهم مدنية: لا تصبها. الشاحنات والداو ثابتة: قنبلة '
             'الـ GPS أو الليزر، والبرق للزورق.',
     'layout': MOLE + [sea('dhow', [[4906, 2040]], 0), sea('fac', [[5010, 1930]], 0),
                       sea('fishing', [[5050, 2280], [5120, 2330], [5080, 2400], [5050, 2350]], 2, loop=True, civil=True),
                       sea('fishing', [[4990, 1560], [5060, 1590], [5030, 1650]], 1.5, loop=True, civil=True)]},
]

SAHM = [
    {'id': 'sk_tic', 'ar': 'إسناد عند المجمّع', 'en': 'TIC AT THE COMPOUND', 'night': False, 'fly': 'h1',
     'desc': 'دورية صديقة (مدرعتان ومشاة) على الطريق الساحلي جنوب المجمّع المسوّر تتعرض لنيران منه: مقاتلون في ساحته، '
             'وفنيّ برشاش 12.7 عند بوابته، وفريق صواريخ كتف غربه. هنتر على التردد. المدينة جنوبًا والبيوت على الشاطئ مدنية.',
     'layout': [blue(veh('mrap', 4142, 1960, SOUTH - 3.14)), blue(veh('mrap', 4133, 2020, SOUTH - 3.14)),
                blue(pax(4165, 1985, 4)), blue(pax(4110, 2000, 4)),
                pax(3950, 1810, 5), pax(4060, 1800, 4), veh('hilux', 3995, 1880, 1.0), veh('lc79', 3900, 1880, 0.4),
                pax(3860, 1860, 2, aa=2)]},

    {'id': 'sk_landing', 'ar': 'إنزال على الشاطئ', 'en': 'BEACH LANDING', 'night': False, 'fly': 'h2',
     'desc': 'سفينة إنزال معادية تتجه من البحر إلى الخليج الصغير جنوب اللسان الصخري، عليها فنيّان وطاقمهما، ويحرسها زورق '
             'دورية. أوقفها قبل الشاطئ، وإن نزلوا فاضربهم على الرمل قبل أن يبلغوا الطريق. قوارب الصيد قريبة ومدنية.',
     'layout': [sea('lcm', [[5170, 2330], [5060, 2220], [4960, 2140], [4905, 2105]], 5, startAt=5,
                    land=[veh('hilux', 4850, 2100, 2.6), veh('lc79', 4838, 2122, 2.4), pax(4858, 2124, 5), pax(4846, 2088, 3)]),
                sea('patrol', [[5000, 2020], [5110, 2070], [5080, 2170], [4990, 2120]], 7, loop=True),
                sea('fishing', [[4990, 1560], [5060, 1590], [5030, 1650]], 1.5, loop=True, civil=True)]},
]

(D / 'missions_f15.json').write_text(json.dumps(JET, ensure_ascii=False, indent=1) + '\n', encoding='utf8')
(D / 'missions.json').write_text(json.dumps(SAHM, ensure_ascii=False, indent=1) + '\n', encoding='utf8')
mp = json.loads((D / 'map.json').read_text()); mp['missions'] = SAHM
(D / 'map.json').write_text(json.dumps(mp, ensure_ascii=False))
print(f'silak: {len(JET)} jet missions, {len(SAHM)} for the Sahm')
