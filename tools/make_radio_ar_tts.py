"""The radio in Saudi Arabic spoken by voice models here, for the lines the owner's own voices
(assets/originals/radio_ar/voices) do not have yet: every line of both sets (tools/make_radio.py's keys), into
assets/originals/radio_ar/voices_tts/<ah64|f15>/<key>.wav; tools/make_radio_ar.py then takes each character's voice
whole from one place (the owner's, once he has all of that character's lines; these until then).

The voices: Piper's Jordanian Arabic (the owner's choice for now, «الأردنية الحين وتنستبدل بعدين»). Their licences do
not allow a game that is sold (voices_tts/LICENSE.md): they are to be replaced before it is. Cast as the English set is
(tools/make_radio.py: a woman for OPS and the voice warnings, men for the rest):
  HUNTER        kareem, raised 3 semitones (formants kept) to the pitch of the owner's HUNTER (Mo, 130 Hz), so he is
                not the tower's man; quicker, as the English HUNTER is
  the pilots    SA_miro_V2 (the Apache's front seat and the F-15's: one man in the English set too)
  the tower, the ground crew   kareem as he is (approved for the tower; the crew is the Apache's base, the tower the
                F-15's: they are never heard in one sortie)
  OPS, warnings SA_dii
The text each reads is tools/radio_ar_voiced.py (vowelled for the model; its phonemes checked here first).

Needs, outside the repo (none of it is committed):
  python3 -m venv venv && venv/bin/pip install piper-tts
  the voices (sherpa-onnx's vits-piper-ar_JO-kareem-medium, -SA_miro_V2-high and -SA_dii-high, unpacked), ffmpeg
  venv/bin/python tools/make_radio_ar_tts.py <dir with the voice folders>          every line
  venv/bin/python tools/make_radio_ar_tts.py <dir> check                           the phonemes only
(every line each time: a character's colour is matched over all his lines)
"""
import json, pathlib, re, subprocess, sys, tempfile, wave
import numpy as np
from piper import PiperVoice, SynthesisConfig

root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'assets' / 'originals' / 'radio_ar' / 'voices_tts'
models = pathlib.Path(sys.argv[1])
args = sys.argv[2:]
g = {}; exec((root / 'tools' / 'radio_ar_voiced.py').read_text(encoding='utf8'), g); V = g['V']
SETS = {'ah64': json.loads((root / 'data' / 'radio.json').read_text())['clips'],
        'f15': json.loads((root / 'data' / 'radio_f15.json').read_text())['clips']}
VOICE = {'kareem': 'vits-piper-ar_JO-kareem-medium', 'miro': 'vits-piper-ar_JO-SA_miro_V2-high', 'dii': 'vits-piper-ar_JO-SA_dii-high'}
# by the key's first letter: the voice, its pace (Piper's length_scale: under 1 is quicker), and semitones up. The
# paces bring the characters to about the same speed (some 4 syllables a second, measured), HUNTER a little quicker
# as in the English; the tower's is the one approved. A line of one or two words is said slower (SHORT): at the
# sentence pace a word alone came out clipped (جِيبْ in 0.15 s)
CAST = {'h': ('kareem', 0.64, 3.0), 'p': ('miro', 0.76, 0), 'f': ('miro', 0.76, 0), 't': ('kareem', 0.62, 0),
        'c': ('kareem', 0.62, 0), 'o': ('dii', 0.78, 0), 'w': ('dii', 0.76, 0)}
SHORT = 1.3
SR = 24000

def check(v):
    """the lines whose phonemes are not as spoken: a case ending or tanween eSpeak put on a word the text closed, a
    pausal ـَهْ read "-ih", a Latin letter. (A linking vowel before the next word's article is as spoken.)"""
    bad = []
    for k in sorted(V):
        t = V[k]; ph = ' | '.join(''.join(p) for p in v.phonemize(t))
        pw = [w.strip(',.!?') for w in re.split(r'[\s|]+', ph) if w.strip(',.!?')]
        fl = ['Latin'] if re.search('[A-Za-z]', t) else []
        for i, w in enumerate(pw):
            w2 = re.sub('[.ˈˌ]', '', w); nxt = re.sub('[.ˈˌ]', '', pw[i + 1]) if i + 1 < len(pw) else ''
            if w2 in ('fauran', 'zaman', 'min') or w2.endswith(('saːʕa', 'dʒːih', 'alaih')): continue
            if w2.endswith(('i', 'a')) and nxt.startswith(('al', 'ʔal', 'ʔa')): continue
            if (re.search(r'[^aiuː][uia]$', w2) and not re.search(r'(ai|au)$', w2)) or re.search(r'[^aiu](un|in|an)$', w2) or w2.endswith('ih'):
                fl.append(w)
        if fl: bad.append((k, t, ph, fl))
    return bad

def speak(v, text, ls, semis):
    if len(re.findall(r'[^\s،.!?؟]+', text)) <= 2: ls *= SHORT
    a = np.concatenate([ch.audio_int16_array for ch in v.synthesize(text, syn_config=SynthesisConfig(length_scale=ls))])
    with tempfile.TemporaryDirectory() as td:
        src = pathlib.Path(td) / 's.wav'
        with wave.open(str(src), 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(v.config.sample_rate); w.writeframes(a.tobytes())
        # (the pitch shift, then to 24 kHz, as floats: the peak is set after, so nothing clips)
        af = (f'rubberband=pitch={2 ** (semis / 12):.5f}:formant=preserved:pitchq=quality,' if semis else '') + f'aresample={SR}:resampler=soxr'
        raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', str(src), '-af', af, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    return np.frombuffer(raw, np.float32).astype(np.float64)

# The voices' colour matched to the English set's, character by character, so that through the game's radio they sound
# alike (tests/radio_ar_match.cjs measured them darker: a centroid of 700 Hz through the set against 1,000): the long-
# term spectrum of the character's English lines (sprites/radio*.mp3) over that of his Arabic ones, in third octaves
# from 100 Hz to 10 kHz, smoothed over each band and its neighbours, as a gain within 9 dB (its level over 300 Hz to
# 3 kHz left as it is; under 250 Hz never raised: below the set's band, rumble), made a linear-phase filter and
# applied to each Arabic line
NFFT = 2048
def ltas(clips):
    P = np.zeros(NFFT // 2 + 1); w = np.hanning(NFFT)
    for x in clips:
        fr = [x[i:i + NFFT] * w for i in range(0, len(x) - NFFT, NFFT // 2)]
        if not fr: continue
        F = np.abs(np.fft.rfft(np.array(fr), axis=1)) ** 2; e = F.sum(axis=1)
        P += F[e > e.max() * 1e-3].sum(axis=0)      # (the voice, not the quiet between words)
    return P
def thirds(P):
    hz = np.fft.rfftfreq(NFFT, 1 / SR); c = 1000 * 2 ** (np.arange(-10, 11) / 3)      # 100 Hz .. 10 kHz
    return c, np.array([P[(hz >= f / 2 ** (1 / 6)) & (hz < f * 2 ** (1 / 6))].sum() + 1e-20 for f in c])
def matcher(en, ar):
    c, E = thirds(ltas(en)); _, A = thirds(ltas(ar))
    g = 10 * np.log10(E / E.sum()) - 10 * np.log10(A / A.sum())
    g = np.convolve(np.pad(g, 1, mode='edge'), [0.25, 0.5, 0.25], mode='valid')
    mid = (c >= 300) & (c <= 3000); g = np.clip(g - g[mid].mean(), -9, 9)
    g[c < 250] = np.minimum(g[c < 250], 0)
    hz = np.fft.rfftfreq(2048, 1 / SR)
    gain = 10 ** (np.interp(np.log2(np.maximum(hz, 20)), np.log2(c), g, left=min(g[0], 0)) / 20)
    h = np.fft.fftshift(np.fft.irfft(gain)) * np.hanning(2048)
    return lambda x: np.convolve(x, h, mode='same'), dict(zip(np.round(c).astype(int).tolist(), np.round(g, 1).tolist()))
def english(clips, mp3):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', str(root / 'sprites' / mp3), '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], check=True, capture_output=True).stdout
    a = np.frombuffer(raw, np.float32).astype(np.float64)
    return {k: a[int(t * SR): int((t + d) * SR)] for k, (t, d) in clips.items()}
def who(key): return key[0]

loaded = {}
def voice(name):
    if name not in loaded: loaded[name] = PiperVoice.load(str(next((models / VOICE[name]).glob('*.onnx'))))
    return loaded[name]

bad = check(voice('kareem'))
for k, t, ph, fl in bad: print('NOT AS SPOKEN', k, t, '\n   ', ph, '\n   ', fl)
if bad or args[:1] == ['check']:
    print(len(V), 'lines,', len(bad), 'not as spoken'); sys.exit(1 if bad else 0)
EN = {**english(SETS['ah64'], 'radio.mp3'), **english(SETS['f15'], 'radio_f15.mp3')}
AR = {}
for name, clips in SETS.items():
    for key in sorted(clips):
        if key not in V: raise SystemExit('no Arabic for ' + key)
        vn, ls, semis = CAST[key[0]]
        AR[key] = (name, speak(voice(vn), V[key], ls, semis))
for c in sorted({who(k) for k in AR}):
    ks = [k for k in AR if who(k) == c]
    f, g = matcher([EN[k] for k in ks], [AR[k][1] for k in ks])
    print(c, 'gain by third octave (dB):', g)
    for k in ks:
        name, x = AR[k]; x = f(x); x = x / (np.abs(x).max() or 1) * 0.9
        (out / name).mkdir(parents=True, exist_ok=True)
        with wave.open(str(out / name / (k + '.wav')), 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(np.round(x * 32767).astype(np.int16).tobytes())
print(len(AR), 'lines spoken into', out)
