"""The radio's voices: every line the game says on the radio and the intercom, spoken in English by Kokoro-82M (a
neural voice model) and put one after another into sprites/radio.mp3, with their places in data/radio.json (built
into the page). The game plays them through its radio set (Snd.transmit); lines that change (a clock position, a
distance, a direction, a target) are pieces put together at run time.

Speakers: HUNTER the ground controller (am_fenrir, a little fast), the pilot behind on the intercom (am_michael),
OPS (bf_emma) and the ground crew (am_puck).

A second set, the F-15SA's (argument f15, into sprites/radio_f15.mp3 and data/radio_f15.json): its pilot in the front
seat (f., am_michael, on the intercom, and on the radio to HUNTER), HUNTER and OPS working a jet (h.j., o.j.), and the
jet's voice warning system (w., af_bella, dry in the headset). The pilot asks before he takes the jet in on a run
(the owner's decision): 'f.tally' then 'f.ask', and 'f.copyin' or 'f.copyhold' when the officer answers.

Needs, outside the repo (none of it is committed):
  npm pack kokoro-q8-shards kokoro-js      # the model in six pieces (cat them in order), and the voices (*.bin)
  python3 -m venv venv && venv/bin/pip install kokoro-onnx soundfile
  venv/bin/python tools/make_radio.py <kokoro-q8.onnx> <kokoro-js voices dir> [f15]
"""
import json, pathlib, re, subprocess, sys, tempfile
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

root = pathlib.Path(__file__).resolve().parent.parent
model, vdir = sys.argv[1], pathlib.Path(sys.argv[2])
SET = sys.argv[3] if len(sys.argv) > 3 else ''
SPK = {'h': ('am_fenrir', 1.12), 'p': ('am_michael', 1.08), 'o': ('bf_emma', 1.0), 'c': ('am_puck', 1.05),
       'f': ('am_michael', 1.04), 'w': ('af_bella', 1.0)}

ONES = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split()
TENS = 'x x twenty thirty forty fifty sixty seventy eighty ninety'.split()
def words(n):
    if n < 20: return ONES[n]
    if n < 100: return TENS[n // 10] + ('' if n % 10 == 0 else '-' + ONES[n % 10])
    if n < 1000: return ONES[n // 100] + ' hundred' + ('' if n % 100 == 0 else ' ' + words(n % 100))
    return words(n // 1000) + ' thousand' + ('' if n % 1000 == 0 else ' ' + words(n % 1000))

L = {
    # HUNTER
    'h.tic': 'Saqr, Hunter. Troops in contact! Requesting immediate close air support, over.',
    'h.ff': "Cease fire, cease fire! You're hitting friendlies!",
    'h.ffkill': 'Cease fire! Cease fire! Friendly down!',
    'h.cas': 'Saqr, Hunter. We have casualties. We need that support now, over.',
    'h.halt': 'Saqr, Hunter. Convoy is halted, taking fire, over.',
    'h.move': 'Saqr, Hunter. Road is clear, convoy is moving, over.',
    'h.in': 'Saqr, Hunter. Convoy is at destination. Thanks for the cover, out.',
    'h.call': 'Saqr, Hunter.',
    'h.mark': 'Marked with red smoke, laser one five eight eight. Over.',
    # the pilot
    'p.fire': 'Taking fire,', 'p.msl': 'Missile launch,', 'p.break': 'Flares! Breaking!',
    'p.hit': "We're hit hard. She's getting heavy.", 'p.mayday': 'Mayday, mayday, mayday! Saqr is going down!',
    'p.lift': 'Saqr, lifting.', 'p.rtb': 'Returning to base.', 'p.down': 'Touchdown.',
    # the ground crew, OPS
    'c.rearm': 'Saqr, ground crew. Starting rearm and refuel.', 'c.ready': "Saqr, you're rearmed and refueled. Area is clear.",
    'o.down': 'Saqr, Ops. All targets down. Stand by for new tasking.', 'o.done': 'Saqr, Ops. Mission complete. Return to base, out.',
}
for k, t in {'TECH': 'Technical,', 'MRAP': 'Armored vehicle,', 'TRK': 'Truck,', 'FUEL': 'Fuel truck,', 'TEL': 'Rocket launcher,', 'SUV': 'SUV,', 'PAX': 'Enemy dismounts,'}.items():
    L['h.t.' + k] = t
for d in list(range(50, 1001, 50)) + list(range(1100, 3001, 100)):
    L['h.d.%d' % d] = words(d) + ' meters'
for k in ['NORTH', 'NORTHEAST', 'EAST', 'SOUTHEAST', 'SOUTH', 'SOUTHWEST', 'WEST', 'NORTHWEST']:
    L['h.dir.' + k] = re.sub(r'^(NORTH|SOUTH)(EAST|WEST)$', r'\1-\2', k).lower() + ' of my position.'
for n in range(1, 13):
    L['p.clock.%d' % n] = ONES[n] + " o'clock!"
# OPS' taskings for the phases of an operation, from the maps' missions
slug = lambda s: re.sub(r'[^A-Z]+', '_', s.upper()).strip('_')
for f in sorted((root / 'data' / 'maps').glob('*/map.json')):
    for mi in json.loads(f.read_text()).get('missions', []):
        for ph in mi.get('phases', []):
            what = re.sub(r'^NEW TASKING:\s*', '', ph['en']).lower()
            L['o.ph.' + slug(ph['en'])] = 'Saqr, Ops. New tasking: ' + what + '. Proceed when ready, over.'

# ---- the F-15SA's set
F = {
    # on the intercom: the pilot asks before the run, then flies it and calls it
    'f.fence': 'Fence in. Master arm on, pod is yours.',
    'f.tally': 'Got the target in the pod. Ready for the run, your call.',
    'f.ask': 'Want me to take it in?',
    'f.copyin': 'Copy, turning in.',
    'f.copyhold': 'Copy, staying in the orbit.',
    'f.wings': 'Wings level. Steering is good.',
    'f.min': 'One minute.', 'f.30': 'Thirty seconds.', 'f.10': 'Ten seconds.',
    'f.inrange': 'In range.',
    'f.count': 'Release in three, two, one.',
    'f.bombs': 'Bombs away.', 'f.bomb': 'Bomb away.', 'f.rifle': 'Rifle.',
    'f.off': 'Off target, coming left.',
    'f.lase': 'Start lasing.', 'f.laser': 'Laser on.',
    'f.splash': 'Splash.', 'f.shack': 'Shack! Good hit.',
    'f.long': 'Missed long.', 'f.short': 'Missed short.',
    'f.again': 'Want another pass?',
    'f.abort': 'Abort, abort. Coming off dry.',
    'f.lost': 'Lost the target. Aborting the run.',
    'f.joker': 'Joker fuel. A couple more passes.',
    'f.bingo': "That's bingo. We're heading home.",
    'f.spike': 'Spike,',
    'f.launch': 'Missile launch!', 'f.flaresL': 'Flares! Breaking left!', 'f.flaresR': 'Flares! Breaking right!',
    'f.defeat': 'Missile defeated. Back to the orbit.',
    # the radar SAM (an SA-8): its radar heard, the break against its missile, and its end
    # positive identification before release: a closer look asked for, the target reported, civilians by it
    'f.pid': "Can't confirm it yet. Zoom in, give me a closer look.", 'f.civ': 'Civilians in the target area. Aborting.',
    'f.r.tally': 'Hunter, Saqr one-one. Tally target.',
    'h.j.civ': 'Saqr one-one, Hunter. Hold, hold. Civilians near the target.',
    'f.sa8': 'Mud spike, SA-8,', 'f.chaffL': 'Chaff! Breaking left!', 'f.chaffR': 'Chaff! Breaking right!', 'f.samdown': 'SA-8 is down.',
    'f.alt.15': 'Descending to one five thousand.', 'f.alt.20': 'Leveling at two zero thousand.', 'f.alt.25': 'Climbing to two five thousand.',
    'f.fly': 'Copy, heading for the point.', 'f.orbit': 'Setting up the orbit.',
    # the pilot on the radio
    # checking in on arrival, at the orbit's height: to Hunter when ours are on the ground, else to Ops
    **{f'f.r.check.{ft}': f'Hunter, Saqr one-one. On station, angels {w}, ready for tasking, over.' for ft, w in ((15, 'one five'), (20, 'two zero'), (25, 'two five'))},
    **{f'f.r.ops.{ft}': f'Ops, Saqr one-one. On station, angels {w}, ready for tasking, over.' for ft, w in ((15, 'one five'), (20, 'two zero'), (25, 'two five'))},
    'f.r.off': 'Saqr one-one, off.',
    # HUNTER working the jet
    'h.j.check': 'Saqr one-one, Hunter. Good copy. Target is a vehicle convoy on the main road, grid in your system. Report tally, over.',
    'h.j.go': 'Saqr one-one, Hunter. Good copy. Targets are in your system. Report tally, over.',
    'h.j.hot': 'Saqr one-one, cleared hot.',
    'h.j.cont': 'Saqr one-one, continue.',
    'h.j.abort': 'Abort, abort, abort!',
    'h.j.good': 'Good hits. Target destroyed.',
    'h.j.miss': 'Miss. Re-attack approved.',
    'h.j.ff': 'Check fire, check fire! Friendlies in the area!',
    # OPS
    'o.j.check': 'Saqr one-one, Ops. Proceed to the area and contact Hunter.',
    'o.j.go': 'Saqr one-one, Ops. Good copy. Targets on your datalink, no friendlies in the area. Cleared to engage.',
    'o.j.rtb': 'Saqr one-one, Ops. Mission complete. Return to base, out.',
    # the jet's own missions (tools/jet_missions.py): Hunter's danger-close refusal, the pop-up launcher, the
    # operation's phases (their keys from the phase's English, as nextPhase makes them)
    'h.dc': 'Saqr one-one, Hunter. Danger close, that is too close to us. Not cleared for the bomb. Use the Maverick.',
    'o.tst': 'Saqr one-one, Ops. Pop-up target. A missile launcher in the valley, priority. Three minutes to launch. Coordinates on your datalink.',
    'o.tst1': 'Saqr one-one, Ops. One minute to launch.',
    'o.tstfire': 'Saqr one-one, Ops. The launcher has fired.',
    'o.ph.TROOPS_IN_CONTACT_AT_THE_WADI_CROSSING': 'Saqr one-one, Ops. New tasking. Troops in contact at the wadi crossing. Contact Hunter.',
    'o.ph.POP_UP_LAUNCHER_IN_THE_VALLEY_PRIORITY': 'Saqr one-one, Ops. New tasking. Pop-up launcher in the valley, priority.',
    # the jet's voice warnings
    'w.alt': 'Altitude, altitude.', 'w.bingo': 'Bingo fuel.', 'w.overg': 'Over G.',
    'w.fireL': 'Warning. Engine fire left.', 'w.fireR': 'Warning. Engine fire right.',
}
for n in range(1, 13):
    F['f.clock.%d' % n] = ONES[n] + " o'clock!"
for d in ['NORTH', 'NORTHEAST', 'EAST', 'SOUTHEAST', 'SOUTH', 'SOUTHWEST', 'WEST', 'NORTHWEST']:
    F['f.r.in.' + d] = 'Saqr one-one, in from the ' + re.sub(r'^(NORTH|SOUTH)(EAST|WEST)$', r'\1\2', d).lower() + '.'
for s in range(10, 61, 2):
    F['f.tof.%d' % s] = 'Time of fall, ' + words(s) + '.'
if SET == 'f15': L = F

V = {}
for name in {v for v, _ in SPK.values()}:
    V[name] = np.fromfile(vdir / (name + '.bin'), dtype=np.float32).reshape(-1, 1, 256)
with tempfile.TemporaryDirectory() as td:
    vz = pathlib.Path(td) / 'voices.npz'; np.savez(vz, **V)
    k = Kokoro(model, str(vz))
    SR, GAP = 24000, 0.35
    parts, index, t = [], {}, 0.0
    for key, text in L.items():
        voice, speed = SPK[key[0]]
        s, sr = k.create(text, voice=voice, speed=speed, lang='en-us')
        assert sr == SR
        s = np.asarray(s, dtype=np.float32)
        on = np.nonzero(np.abs(s) > 0.01)[0]
        s = s[max(0, on[0] - 240): on[-1] + 480] if len(on) else s
        s = s / (np.abs(s).max() or 1) * 0.9
        index[key] = [round(t, 4), round(len(s) / SR, 4)]
        parts += [s, np.zeros(int(GAP * SR), np.float32)]
        t += len(s) / SR + GAP
    wav = pathlib.Path(td) / 'radio.wav'
    sf.write(wav, np.concatenate(parts), SR)
    out = root / 'sprites' / ('radio_f15.mp3' if SET == 'f15' else 'radio.mp3')
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(wav), '-ac', '1', '-ar', str(SR), '-codec:a', 'libmp3lame', '-b:a', '64k', str(out)], check=True)
(root / 'data' / ('radio_f15.json' if SET == 'f15' else 'radio.json')).write_text(json.dumps({'sr': SR, 'clips': index}, separators=(',', ':')))
print(len(index), 'lines,', round(t), 's,', out.stat().st_size // 1024, 'KB')
