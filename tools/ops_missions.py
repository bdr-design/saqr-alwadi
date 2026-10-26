"""Ground-support operations for the desert and the port: troops in contact, a convoy escort, a night assault.

usage: python3 tools/ops_missions.py   (adds or replaces these missions, by id, in data/maps/<id>/missions.json and in
that map's map.json; then theater_missions.py moves them into the theatre)

Friendly units have side 'blue' (marked with a panel by day, a strobe at night). A friendly convoy (convoy: 'F') is
the one the aircraft escorts: it drives from its start to its last halt (haltFor 9999), halts under fire and moves
on once the guns in reach of it are down. ambush: the unit holds its fire, unseen by the friendlies, until one of them
comes within that many metres (or it is shot at); then the ambush around it opens up together.
Places are map px on each map's own picture; s and haltS are metres along that map's road (from its north end).
"""
import json, pathlib
root = pathlib.Path(__file__).resolve().parent.parent

def convoy(s0, dest, dirn, kinds, spd=8.5, gap=30):
    # the leader at s0, the rest behind it; each halts the same distance behind the leader's halt
    return [{'t': 'veh', 'k': k, 'side': 'blue', 'convoy': 'F', 'dir': dirn, 's': s0 - dirn * gap * i, 'spd': spd,
             'haltS': dest - dirn * gap * i, 'haltFor': 9999} for i, k in enumerate(kinds)]
pax = lambda x, y, n, **o: {'t': 'pax', 'k': 'pax', 'x': x, 'y': y, 'n': n, **o}
veh = lambda k, x, y, h, **o: {'t': 'veh', 'k': k, 'x': x, 'y': y, 'h': h, 'move': False, **o}
blue = dict(side='blue')

OPS = {
    'desert': [
        {'id': 'wadi_tic', 'ar': 'إسناد عند الوادي', 'en': 'TIC AT THE WADI', 'night': False, 'fly': 'orbit',
         'desc': 'دورية صديقة (مدرعتان ومشاة) عبرت الوادي الجاف فتعرضت لكمين من الهضبة الصخرية غربًا: مقاتلون، وفنيّ برشاش 12.7، ومدفع 23 ملم مزدوج على الحافة، وفريق صواريخ كتف، ومقاتلون بين أشجار الضفة الشرقية. هنتر يعلّم الأهداف بدخان أحمر. البيت شمال شرق مدني.',
         'layout': [veh('mrap', 905, 500, 1.25, **blue), veh('mrap', 885, 462, 1.25, **blue), pax(875, 505, 4, **blue), pax(920, 470, 4, **blue),
                    pax(700, 560, 5), pax(660, 470, 4), veh('hilux', 620, 520, 0.3), veh('lc79', 540, 430, 0.3), pax(600, 620, 2, aa=2), pax(1010, 460, 3),
                    {'t': 'house', 'k': 'house2', 'x': 1060, 'y': 300, 'r': -0.2, 'role': 'civil'}]},
        {'id': 'escort', 'ar': 'مرافقة رتل', 'en': 'CONVOY ESCORT', 'night': False, 'fly': 'orbit',
         'desc': 'رتل إمداد صديق (مدرعتان وشاحنة وصهريج) ينزل جنوبًا عبر الوادي الجاف إلى آخر الطريق. الاستخبارات تتوقع كمائن عند العبور وحافة الكثبان. افتح الطريق أمامه: يتوقف تحت النار ويتحرك حين تُسكت المدافع التي تطاله. تنتهي المهمة حين يصل.',
         'layout': convoy(110, 820, 1, ['mrap', 'cargo', 'tanker', 'mrap']) + [
                    pax(990, 450, 4, ambush=140), veh('hilux', 1040, 420, 2.6, ambush=180), pax(760, 470, 3, ambush=150),
                    veh('lc79', 1220, 600, 2.8, ambush=250), pax(1150, 560, 2, aa=2, ambush=220), pax(900, 760, 3, ambush=150)]},
    ],
    'port': [
        {'id': 'quay_tic', 'ar': 'تأمين الرصيف', 'en': 'SECURE THE QUAY', 'night': False, 'fly': 'orbit',
         'desc': 'قوة صديقة دخلت ساحة المستودعات وتتعرض لنيران من الرصيف غربها: مقاتلون بين الحاويات، وفنيّ برشاش 12.7، ومدفع 23 ملم مزدوج على طريق الرصيف، وفريق صواريخ كتف. السفن والمستودعات والمباني كلها مدنية: الدقة قبل كل شيء.',
         'layout': [veh('mrap', 790, 250, 3.14, **blue), veh('mrap', 800, 180, 3.14, **blue), pax(775, 215, 4, **blue), pax(765, 280, 4, **blue),
                    pax(520, 240, 5), pax(470, 200, 4), veh('hilux', 560, 190, 0.0), veh('lc79', 600, 290, 0.0), pax(420, 300, 2, aa=2), pax(640, 230, 3),
                    {'t': 'blds', 'role': 'civil', 'area': [300, 60, 1110, 320]}]},
        {'id': 'raid', 'ar': 'اقتحام المعسكر', 'en': 'NIGHT ASSAULT', 'night': True, 'fly': 'h2',
         'desc': 'ليلًا: قوة صديقة تقتحم المعسكر من بوابته الشرقية وتلقى مقاومة: مدرّعة برشاش عند البوابة، وفنيّات ومدفع 23 ملم مزدوج داخل المعسكر، ومقاتلون بين الثكنات، وفريق صواريخ كتف. قواتنا تومض بالأشعة تحت الحمراء: يراها الحراري. مبنى القيادة وخزانا الوقود أهداف.',
         'layout': [veh('mrap', 900, 676, 3.14, **blue), veh('mrap', 940, 680, 3.14, **blue), pax(880, 650, 4, **blue), pax(875, 705, 4, **blue),
                    pax(780, 650, 5), pax(760, 700, 4), veh('mrap', 832, 664, 0.0), veh('lc79', 706, 706, 2.2), veh('hilux', 776, 692, -0.4),
                    veh('launcher', 742, 668, 1.6), pax(690, 600, 2, aa=2),
                    {'t': 'blds', 'role': 'civil', 'area': [300, 60, 1110, 320]},
                    {'t': 'blds', 'role': 'hostile', 'area': [755, 550, 792, 572]}, {'t': 'blds', 'role': 'hostile', 'area': [648, 568, 706, 584]}]},
        {'id': 'escort', 'ar': 'مرافقة رتل', 'en': 'CONVOY ESCORT', 'night': False, 'fly': 'orbit',
         'desc': 'رتل صديق (مدرعتان وشاحنة) يصعد شمالًا من الجنوب إلى ساحة المستودعات، على طريق يمر بين الوادي والصخور. كمائن متوقعة على الجانبين. يتوقف تحت النار ويتحرك حين تُسكت المدافع التي تطاله؛ تنتهي المهمة حين يصل.',
         'layout': convoy(740, 240, -1, ['mrap', 'cargo', 'mrap']) + [
                    pax(1110, 560, 4, ambush=120), veh('hilux', 1150, 430, 3.6, ambush=130), veh('lc79', 1270, 650, 3.4, ambush=250),
                    pax(930, 470, 3, ambush=160), pax(1200, 520, 2, aa=2, ambush=180),
                    {'t': 'blds', 'role': 'civil', 'area': [300, 60, 1110, 320]}]},
    ],
}
# shoulder-launched missiles at the night missions too
AA = {'desert': {'dunes': pax(1150, 660, 2, aa=2)}, 'port': {'camp': pax(640, 640, 2, aa=2)}}

for mid, ops in OPS.items():
    f = root / 'data' / 'maps' / mid / 'missions.json'
    ms = json.loads(f.read_text())
    for mi in ms:
        a = AA[mid].get(mi['id'])
        if a and a not in mi['layout']: mi['layout'].insert(next((i for i, it in enumerate(mi['layout']) if it.get('t') == 'blds'), len(mi['layout'])), a)
    ids = [m['id'] for m in ops]
    ms = [m for m in ms if m['id'] not in ids] + ops
    f.write_text(json.dumps(ms, ensure_ascii=False, indent=1))
    mf = root / 'data' / 'maps' / mid / 'map.json'
    mp = json.loads(mf.read_text()); mp['missions'] = ms; mf.write_text(json.dumps(mp, ensure_ascii=False))
    print(mid, [m['id'] for m in ms])
