"""The F-15SA's calls with the base's tower in Arabic, spoken by a voice model here (Piper, the Jordanian Arabic voices:
the owner's choice) until the owner's voiced set (assets/originals/radio_ar) has them: the tower (t., ar_JO kareem)
and the pilot's side of it on the ground and home (f.r., ar_JO SA_miro_V2: another man's voice, the tower and the
pilot not one man). Into assets/originals/radio_ar/voices/f15/<key>.wav, as the owner's files go; then
tools/make_radio_ar.py puts them in sprites/radio_ar_f15.mp3. A file the owner has delivered for a key is left as it
is (only the keys here with no file, or with one this made, are written).

Needs, outside the repo (none of it is committed):
  python3 -m venv venv && venv/bin/pip install piper-tts
  the voices (sherpa-onnx's vits-piper-ar_JO-kareem-medium and vits-piper-ar_JO-SA_miro_V2-high, unpacked)
  venv/bin/python tools/make_radio_ar_tts.py <dir with the two voice folders>
"""
import json, pathlib, sys, wave
import numpy as np
from piper import PiperVoice, SynthesisConfig

root = pathlib.Path(__file__).resolve().parent.parent
out = root / 'assets' / 'originals' / 'radio_ar' / 'voices' / 'f15'
models = pathlib.Path(sys.argv[1])
VOICE = {'t': 'vits-piper-ar_JO-kareem-medium', 'f': 'vits-piper-ar_JO-SA_miro_V2-high'}
# the pace of a radio call, quicker than the voices read (the tower's at its own pace took twice the English's time)
PACE = {'t': SynthesisConfig(length_scale=0.62), 'f': SynthesisConfig(length_scale=0.8)}
SR = 24000

# the calls as the game shows them (radio(), src/game.src.html), with their vowels marked for the voice
L = {
    'f.r.wilco': 'صَقْر واحِد واحِد، سَنُنَفِّذ.',
    'f.r.unable': 'صَقْر واحِد واحِد، لا نَسْتَطيع.',
    'f.r.taxi': 'البُرْج، صَقْر واحِد واحِد، جاهْزين لِلسَّحْب.',
    't.taxi': 'صَقْر واحِد واحِد، اسْحَبْ لِلْمَدْرَج واحِد ثَمانْيَة عَبْر أَلْفا، وَوَقِّف قَبْلُه.',
    'f.r.taxirb': 'المَدْرَج واحِد ثَمانْيَة عَبْر أَلْفا، نْوَقِّف قَبْلُه، صَقْر واحِد واحِد.',
    'f.r.hold': 'البُرْج، صَقْر واحِد واحِد، واقْفين قَبْل المَدْرَج واحِد ثَمانْيَة.',
    't.clear': 'صَقْر واحِد واحِد، الرِّياح اثْنين خَمْسِة صِفِر بِسُرْعَة سَبْعَة، المَدْرَج واحِد ثَمانْيَة، مَسْموح بِالإِقْلاع.',
    'f.r.clear': 'مَسْموح بِالإِقْلاع، صَقْر واحِد واحِد.',
    'f.r.airborne': 'صَقْر واحِد واحِد، أَقْلَعْنا.',
    'f.rtb': 'عُلِم، راجْعين لِلْقاعِدَة.',
    'f.r.inbound': 'البُرْج، صَقْر واحِد واحِد، راجْعين لِلْهُبوط.',
    't.inbound': 'صَقْر واحِد واحِد، اقْتِراب مُباشِر لِلْمَدْرَج واحِد ثَمانْيَة، بَلِّغ عَلى النِّهائي.',
    'f.r.final': 'البُرْج، صَقْر واحِد واحِد، عَلى النِّهائي لِلْمَدْرَج واحِد ثَمانْيَة.',
    't.land': 'صَقْر واحِد واحِد، الرِّياح اثْنين خَمْسِة صِفِر بِسُرْعَة سَبْعَة، المَدْرَج واحِد ثَمانْيَة، مَسْموح بِالهُبوط.',
    'f.r.land': 'مَسْموح بِالهُبوط، صَقْر واحِد واحِد.',
    't.park': 'صَقْر واحِد واحِد، انْعَطِف يَمين عِنْد أَوَّل مَمَر، واسْحَب لِلْمَوْقِف عَبْر أَلْفا.',
    'f.r.park': 'يَمين عِنْد أَوَّل مَمَر، لِلْمَوْقِف عَبْر أَلْفا، صَقْر واحِد واحِد.',
}

out.mkdir(parents=True, exist_ok=True)
made = out / '.tts.json'
mine = set(json.loads(made.read_text())) if made.exists() else set()
V = {k: PiperVoice.load(str(next((models / d).glob('*.onnx')))) for k, d in VOICE.items()}
done = []
for key, text in L.items():
    f = out / (key + '.wav')
    if f.exists() and key not in mine: continue          # the owner's
    v = V[key[0]]
    a = np.concatenate([ch.audio_int16_array for ch in v.synthesize(text, syn_config=PACE[key[0]])]).astype(np.float32) / 32768
    sr = v.config.sample_rate
    a = np.interp(np.arange(0, len(a), sr / SR), np.arange(len(a)), a)
    with wave.open(str(f), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(a / (np.abs(a).max() or 1) * 0.9, -1, 1) * 32767).astype(np.int16).tobytes())
    done.append(key)
made.write_text(json.dumps(sorted(mine | set(done))))
print(len(done), 'lines spoken into', out)
