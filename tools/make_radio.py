"""The radio's voices: every line the game says on the radio and the intercom, spoken in English by Kokoro-82M (a
neural voice model) and put one after another into sprites/radio.mp3, with their places in data/radio.json (built
into the page). The game plays them through its radio set (Snd.transmit); lines that change (a clock position, a
distance, a direction, a target) are pieces put together at run time.

Speakers: HUNTER the ground controller (am_fenrir, a little fast), the pilot behind on the intercom (am_michael),
OPS (bf_emma) and the ground crew (am_puck).

Needs, outside the repo (none of it is committed):
  npm pack kokoro-q8-shards kokoro-js      # the model in six pieces (cat them in order), and the voices (*.bin)
  python3 -m venv venv && venv/bin/pip install kokoro-onnx soundfile
  venv/bin/python tools/make_radio.py <kokoro-q8.onnx> <kokoro-js voices dir>
"""
import json, pathlib, re, subprocess, sys, tempfile
import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

root = pathlib.Path(__file__).resolve().parent.parent
model, vdir = sys.argv[1], pathlib.Path(sys.argv[2])
SPK = {'h': ('am_fenrir', 1.12), 'p': ('am_michael', 1.08), 'o': ('bf_emma', 1.0), 'c': ('am_puck', 1.05)}

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

V = {}
for name, _ in SPK.values():
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
    out = root / 'sprites' / 'radio.mp3'
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(wav), '-ac', '1', '-ar', str(SR), '-codec:a', 'libmp3lame', '-b:a', '64k', str(out)], check=True)
(root / 'data' / 'radio.json').write_text(json.dumps({'sr': SR, 'clips': index}, separators=(',', ':')))
print(len(index), 'lines,', round(t), 's,', out.stat().st_size // 1024, 'KB')
