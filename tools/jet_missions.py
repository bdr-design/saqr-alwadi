"""The ZF-25's own missions on the theatre, into data/maps/theater/missions_f15.json (tools/build.py puts them in
MAPS.theater.jet; the game shows them instead of the Sahm's when the jet is chosen).

  python3 tools/jet_missions.py && python3 tools/build.py

Every mission starts on station (the owner's decision): `jet` is where (c, map pixels), how high (ft), how fast
(KCAS) and how wide (R, m) the first orbit is, and the loadout the menu offers first. The rest is the editor's layout
format (docs/DEVELOPER.md, «المهام والتقييم»), plus:
  - a parked vehicle with `startAt` (s after its layout is built) and `window` (s): a pop-up, time-sensitive target.
    Hidden until then; left alive `window` seconds after it shows, it fires and is gone (counted as escaped).
  - friends (`side: 'blue'`) bring Hunter, the controller on the ground, and his danger-close rule: no clearance for
    a 500 lb bomb within 300 m of them, nor a 2,000 lb one within 500 m (the Barq has no such limit here).
Distances below are map pixels (0.85 m each); the road's `s` is metres from its north end (2,562 m long).
"""
import json, pathlib

root = pathlib.Path(__file__).resolve().parent.parent
OUT = root / 'data' / 'maps' / 'theater' / 'missions_f15.json'

# the port and the base are civilian in every mission; the camp's buildings are struct unless a mission says
PORT = {'t': 'blds', 'role': 'civil', 'area': [300, 1942, 1110, 2202]}
BASE = {'t': 'blds', 'role': 'civil', 'area': [1909.9, 90.6, 3143.3, 2740.5]}
bld = lambda x0, y0, x1, y1, role='hostile': {'t': 'blds', 'role': role, 'area': [x0, y0, x1, y1]}
veh = lambda k, x, y, h=0.0, **o: dict({'t': 'veh', 'k': k, 'x': x, 'y': y, 'h': h, 'move': False}, **o)
pax = lambda x, y, n, **o: dict({'t': 'pax', 'k': 'pax', 'x': x, 'y': y, 'n': n}, **o)
blue = lambda d: dict(d, side='blue')
def convoy(cid, s0, kinds, v, halt=None, wait=None, start=0):
    """kinds down the road from s0 southward, 30 m apart nose to tail; one halt (s, seconds) for the lead"""
    out = []
    for i, k in enumerate(kinds):
        s = s0 - i * 32
        it = {'t': 'veh', 'k': k, 'convoy': cid, 'dir': 1, 's': s, 'spd': v}
        if halt: it.update(haltS=halt + (s - s0), haltFor=wait)
        if start: it['startAt'] = start
        out.append(it)
    return out

# the TIC at the wadi crossing (the desert's): a patrol in the dry riverbed, the ambush from the rocky plateau west.
# Some of the enemy is inside Hunter's danger-close ring for bombs (the Barq's job), the rest outside it.
WADI_BLUE = [blue(veh('mrap', 1042, 1441, 1.25)), blue(veh('mrap', 1022, 1403, 1.25)), blue(pax(1012, 1446, 4)), blue(pax(1057, 1411, 4))]
WADI_RED = [pax(842, 1452, 5),                       # 170 m from the patrol: danger close
            pax(700, 1430, 4),                       # 280 m: danger close for bombs
            veh('hilux', 600, 1500, 0.3),            # 365 m, the 12.7 mm
            veh('lc79', 520, 1380, 0.3),             # 435 m, the twin 23 mm
            pax(640, 1560, 2, aa=2),                 # the shoulder-missile team (the jet is above their reach)
            veh('trench', 800, 1420, 1.3),           # 180 m: a machine gun dug in (danger close: the Barq's)
            veh('mortar', 560, 1480, 1.4)]           # 400 m back on the plateau, ranging on the patrol

# the sea off the port (map px; the harbour's mouth between its two breakwaters' heads at about 195, 2070 and 200, 2120): a dhow running
# weapons out to sea with a fast attack boat beside it, a rocket boat waiting by the reef north, fishing boats about
DHOW_RUN = [[300, 2075], [232, 2094], [180, 2097], [140, 2120], [100, 2250], [60, 2450], [30, 2650], [-80, 2860]]
FAC_RUN = [[335, 2088], [242, 2099], [186, 2101], [150, 2140], [116, 2270], [80, 2470], [52, 2670], [-60, 2880]]
sea = lambda k, path, spd, **o: dict({'t': 'veh', 'k': k, 'path': path, 'spd': spd}, **o)

# the landing: a landing craft with two technicals and their crews from the open sea to the sandy cove north of the
# harbour (about 470, 1925), a patrol boat round it; ashore, what it carries comes off and becomes the target
LCM_RUN = [[-60, 1700], [140, 1770], [300, 1850], [430, 1912]]
LANDED = [veh('hilux', 478, 1930, 1.0), veh('lc79', 462, 1944, 0.6), pax(488, 1946, 5), pax(470, 1918, 3)]

SA8_NOTE = (' ومعه دفاع جوي راداري على الهضبة شرق الطريق، مداه 10 كم يغطي الوادي كله: من مدارك الآن أنت داخله. وسّع المدار '
            '(RAD 10) أو اصعد إلى 25 ألفًا لتخرج منه، واضربه بالبرق من هناك قبل الرتل. وإن أطلق: رقائق وانعطاف.')
MISSIONS = [
    # the first sortie: two old wrecks on the range on the open gravel plain east of the desert road (the base now fills
    # the theatre's east side), nothing that shoots back and no one about; the pilot talks the officer through it (the
    # game's TRAIN steps), the key to press lit on the panel
    {'id': 'j_train', 'ar': 'تدريب: أول طلعة', 'en': 'TRAINING', 'night': False, 'fly': 'orbit', 'train': True,
     'jet': {'c': [1330, 1665], 'ft': 15000, 'kcas': 300, 'R': 5000, 'load': 'cas'},
     'desc': 'طلعتك الأولى في المقعد الخلفي. الطيار يقود ويشرح لك على الإنترفون خطوة خطوة: الحاضنة، والتتبع، والتحقق، '
             'والتسليح، وقنبلة الليزر على شاحنة قديمة في ميدان الرماية، ثم البرق على دبابة معطوبة. الزر المطلوب يضيء في القمرة.',
     'layout': [veh('cargo', 1270, 1680, 0.4), veh('t72', 1395, 1655, 1.2)]},

    {'id': 'j_strike', 'ar': 'ضربة المستودعات', 'en': 'DEPOT STRIKE', 'night': False, 'fly': 'orbit',
     'jet': {'c': [760, 2280], 'ft': 15000, 'kcas': 300, 'R': 5000, 'load': 'strike'},
     'desc': 'ضربة مخطط لها على خمسة أهداف ثابتة بإحداثياتها: مخزن السلاح في ساحة الرصيف (مبانيها عسكرية)، ومستودع الذخيرة '
             'الكبير شمال الميناء (يحتاج قنبلة ثقيلة)، وخزانا الوقود ومبنى القيادة في المعسكر. قنبلة الـ GPS من المدار على كل '
             'إحداثية. السفن وبقية المستودعات ومباني الميناء مدنية: الدقة قبل كل شيء.',
     'layout': [PORT, BASE,
                bld(535, 2025, 625, 2160, 'struct'),  # the quay's yard round the store: military, no civilians in it
                bld(555, 2096, 570, 2111),           # the arms store in it
                bld(865, 1978, 876, 1988),           # the big warehouse north of the port (76 x 22 px), 59 m from the nearest civilian building
                bld(755, 2432, 792, 2454),           # the camp's two fuel tanks
                bld(648, 2450, 706, 2466),           # the camp's headquarters
                pax(905, 2005, 3), veh('hilux', 900, 1960, 1.6), pax(560, 2125, 2), veh('tanker', 800, 2468, 0.0)]},

    {'id': 'j_cas', 'ar': 'إسناد مع هنتر', 'en': 'CAS · HUNTER', 'night': False, 'fly': 'orbit',
     'jet': {'c': [1000, 1440], 'ft': 15000, 'kcas': 300, 'R': 5000, 'load': 'cas'},
     'desc': 'دورية صديقة في الوادي الجاف تحت نار كمين من الهضبة الصخرية غربًا. هنتر يوجّهك ويعلّم بالدخان الأحمر، ولا '
             'يسمح بقنبلة 500 رطل على عدو أقرب من 300 م من قواتنا (والثقيلة 500 م): القريب للبرق. فريق صواريخ كتف '
             'في الكمين، والمدار فوق مداها.',
     'layout': [BASE] + WADI_BLUE + WADI_RED + [{'t': 'house', 'k': 'house2', 'x': 1197, 'y': 1241, 'r': -0.2, 'role': 'civil'}]},

    {'id': 'j_convoy', 'ar': 'اعتراض الرتل', 'en': 'INTERDICTION', 'night': False, 'fly': 'orbit',
     'jet': {'c': [1040, 900], 'ft': 15000, 'kcas': 300, 'R': 5000, 'load': 'standoff'},
     'desc': 'رتل معادٍ من ست مركبات ينزل من الوادي جنوبًا نحو الميناء، ويتوقف قليلًا عند عبور الوادي. إن بلغ الميناء '
             'اختلط بالمدنيين وضاع. الهدف يتحرك: قنبلة الليزر تلاحقه وحاضنتك ثابتة عليه، والبرق للأسرع، وقنبلة الـ GPS '
             'لا تصيب المتحرك.',
     'layout': [PORT, BASE] + convoy('JC', 230, ['hilux', 'lc79', 'cargo', 'tanker', 'mrap', 'hilux'], 8, halt=1330, wait=40, start=15)},

    {'id': 'j_tst', 'ar': 'هدف حساس للوقت', 'en': 'TIME-SENSITIVE', 'night': False, 'fly': 'orbit',
     'jet': {'c': [1050, 1300], 'ft': 15000, 'kcas': 300, 'R': 5000, 'load': 'cas'},
     'desc': 'دورية مسلّحة فوق الصحراء: نقطة تفتيش معادية عند العبور. الاستخبارات تتوقع منصة صواريخ مخبأة في الوادي '
             'شمالًا تخرج للإطلاق: إن ظهرت فأمامك ثلاث دقائق قبل أن تطلق وتعود إلى مخبئها. الأولوية لها.',
     'layout': [PORT, BASE, veh('hilux', 1150, 1300, 2.0), veh('lc79', 1100, 1262, 0.6), pax(1170, 1322, 3),
                veh('launcher', 960, 640, 1.2, startAt=75, window=180)]},

    {'id': 'j_night', 'ar': 'ضربة ليلية على المعسكر', 'en': 'NIGHT STRIKE', 'night': True, 'fly': 'orbit',
     'jet': {'c': [820, 2520], 'ft': 15000, 'kcas': 300, 'R': 5000, 'load': 'cas'},
     'desc': 'ليلًا: قوة صديقة تنتظر شرق المعسكر لتقتحمه بعد ضربتك. الأهداف: منصة الصواريخ، والمدرعة عند البوابة، '
             'والفنيّات، وخزانا الوقود ومبنى القيادة. مدفع 23 ملم وفريق صواريخ كتف في المعسكر: لا تنزل تحت 15,000 قدم. '
             'الحراري يرى الدفء بين المباني، وقواتنا تومض بالأشعة تحت الحمراء.',
     'layout': [PORT, BASE, bld(755, 2432, 792, 2454), bld(648, 2450, 706, 2466),
                veh('launcher', 742, 2550, 1.6), veh('mrap', 832, 2546, 0.0), veh('hilux', 776, 2574, -0.4), veh('lc79', 706, 2588, 2.2),
                pax(722, 2530, 4), pax(764, 2594, 3), pax(690, 2482, 2, aa=2),
                veh('bm21', 778, 2532, 1.6), veh('zu23e', 875, 2505, 0.0), veh('ammo', 720, 2410, 0.0), veh('mortar', 632, 2405, 0.4),
                blue(veh('mrap', 1250, 2560, 3.14)), blue(veh('mrap', 1290, 2564, 3.14)), blue(pax(1240, 2530, 4)), blue(pax(1236, 2590, 4))]},

    {'id': 'j_sea', 'ar': 'اعتراض بحري', 'en': 'MARITIME', 'night': False, 'fly': 'orbit',
     'jet': {'c': [330, 2250], 'ft': 15000, 'kcas': 300, 'R': 5000, 'load': 'cas'},
     'desc': 'قارب داو يهرّب سلاحًا من الميناء إلى عرض البحر، ويرافقه زورق هجوم سريع برشاش 12.7، وزورق صواريخ ينتظر عند '
             'الشعاب شمالًا. حولهم قوارب صيد مدنية: لا تصبها. الداو بطيء وقنبلة الليزر تلاحقه، والبرق للزورق السريع. إن بلغ '
             'الداو عرض البحر ضاع، وإن انفجر شيء قربهما أسرعا.',
     'layout': [PORT, BASE, sea('dhow', DHOW_RUN, 4.5, escape=True, startAt=10), sea('fac', FAC_RUN, 4.5, escape=True, startAt=10),
                sea('rktboat', [[150, 1790]], 0, aim=[640, 2090]), sea('fishing', [[70, 2280], [120, 2330], [90, 2380], [50, 2330]], 2.5, loop=True, civil=True),
                sea('fishing', [[95, 1880], [140, 1910], [120, 1960], [80, 1930]], 2, loop=True, civil=True), sea('fishing', [[40, 2060], [70, 2000]], 1.5, loop=True, civil=True)]},

    # (the column's own air defence: an SAM-R on the plateau east of the road, its 10 km over the whole valley. From the
    # orbit at 5 km and 15,000 ft he is inside it: out to 10 km, or up to 25,000 ft, he is not, and the Barq
    # reaches it from there. The Sahm's version leaves it out, tools/theater_missions.py)
    {'id': 'j_armor', 'ar': 'رتل مدرع', 'en': 'ARMOUR', 'night': False, 'fly': 'orbit',
     'jet': {'c': [1040, 1150], 'ft': 15000, 'kcas': 300, 'R': 5000, 'load': 'standoff'},
     'desc': 'رتل مدرع ينزل من الوادي جنوبًا: دبابتان ومدرعتان وشاحنتا ذخيرة. موقع مدفع 23 ملم '
             'وخندق رشاش يحميان العبور، وراجمة صواريخ خلف الهضبة تقصف المنطقة. الدبابة لا يؤثر فيها إلا القنبلة أو البرق، '
             'والشاحنات أسهل: أوقف الرتل قبل أن يبلغ الميناء.' + SA8_NOTE,
     'layout': [PORT, BASE] + convoy('JA', 380, ['btr80', 't72', 'ural', 'ural', 't72', 'btr80'], 7, start=10) +
               [veh('zu23e', 1095, 1330, 0.5), veh('trench', 965, 1385, 1.2), pax(975, 1398, 3), veh('bm21', 1250, 1180, 2.6), veh('sa8', 1300, 1020, 2.2)]},

    {'id': 'j_land', 'ar': 'إنزال بحري', 'en': 'LANDING', 'night': False, 'fly': 'orbit',
     'jet': {'c': [330, 1950], 'ft': 15000, 'kcas': 300, 'R': 5000, 'load': 'cas'},
     'desc': 'سفينة إنزال معادية تتجه من عرض البحر إلى الخليج الرملي شمال الميناء، عليها فنيّان وطاقمهما، ويحرسها زورق '
             'دورية بمدفع 23 ملم. أوقفها قبل الشاطئ، وإن نزلوا فاضربهم على الرمل قبل أن يتحركوا. زورق صواريخ يقصف الميناء '
             'من الشعاب، وقوارب صيد مدنية قريبة.',
     'layout': [PORT, BASE, sea('lcm', LCM_RUN, 5, land=LANDED, startAt=5), sea('patrol', [[160, 1740], [320, 1800], [260, 1900], [120, 1840]], 7, loop=True),
                sea('rktboat', [[150, 1790]], 0, aim=[640, 2090]), sea('fishing', [[95, 1880], [140, 1910], [120, 1960], [80, 1930]], 2, loop=True, civil=True),
                sea('fishing', [[60, 1640], [110, 1660]], 1.5, loop=True, civil=True)]},

    {'id': 'j_op', 'ar': 'عملية صقر الوادي', 'en': 'OPERATION SAQR', 'night': False, 'fly': 'orbit',
     'jet': {'c': [800, 1900], 'ft': 15000, 'kcas': 300, 'R': 5000, 'load': 'cas'},
     'desc': 'عملية من ثلاث مراحل تصلك بالراديو: (1) ضربة مخزن السلاح على الرصيف وصهريج الإمداد، (2) إسناد الدورية '
             'عند عبور الوادي، (3) هدف حساس للوقت. التالية حين تُحسم السابقة، والذخيرة لا تُعاد: وزّعها.',
     'layout': [PORT, BASE, bld(555, 2096, 570, 2111), veh('tanker', 588, 2074, 0.1), veh('hilux', 470, 2094, 1.5), pax(498, 2114, 3)],
     'phases': [
         {'en': 'TROOPS IN CONTACT AT THE WADI CROSSING', 'ar': 'دورية تحت النار عند عبور الوادي، هنتر على التردد', 'layout': WADI_BLUE + WADI_RED[2:]},
         {'en': 'POP-UP LAUNCHER IN THE VALLEY, PRIORITY', 'ar': 'منصة صواريخ ظهرت في الوادي، الأولوية لها', 'layout': [veh('launcher', 960, 640, 1.2, startAt=10, window=180)]},
     ]},
]

OUT.write_text(json.dumps(MISSIONS, ensure_ascii=False, indent=1) + '\n', encoding='utf8')
print(f'{OUT.relative_to(root)}: {len(MISSIONS)} missions')
