"""The radio in Saudi Arabic: the lines the owner has had voiced (assets/originals/radio_ar/voices/<set>/<key>.wav, by
the keys of tools/make_radio.py, from the script in assets/originals/radio_ar), put one after another as the English
are, into sprites/radio_ar.mp3 (the Apache's set) and sprites/radio_ar_f15.mp3 (the F-15SA's), with their places in
data/radio_ar.json and data/radio_ar_f15.json (built into the page). The game speaks a call in Arabic when the
setting says so and every piece of the call is here; else the whole call in English (tools/make_radio.py). The voices
come in batches: run this again with each.

  python3 tools/make_radio_ar.py
"""
import json, pathlib, subprocess, tempfile, wave
import numpy as np

root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'assets' / 'originals' / 'radio_ar' / 'voices'
SR, GAP = 24000, 0.35


def read(f):
    with wave.open(str(f)) as w:
        assert w.getsampwidth() == 2, f
        a = np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768
        if w.getnchannels() > 1: a = a.reshape(-1, w.getnchannels()).mean(axis=1)
        sr = w.getframerate()
    if sr != SR: a = np.interp(np.arange(0, len(a), sr / SR), np.arange(len(a)), a).astype(np.float32)
    return a


for name, out in (('ah64', 'radio_ar'), ('f15', 'radio_ar_f15')):
    files = sorted((src / name).glob('*.wav')) if (src / name).exists() else []
    js = root / 'data' / (out + '.json')
    if not files:
        js.unlink(missing_ok=True); (root / 'sprites' / (out + '.mp3')).unlink(missing_ok=True)
        print(name, 'none'); continue
    parts, index, t = [], {}, 0.0
    for f in files:
        s = read(f)
        # the voice alone (the delivered files keep about half a second of quiet each side), at the English's level
        on = np.nonzero(np.abs(s) > 0.01)[0]
        s = s[max(0, on[0] - 240): on[-1] + 480] if len(on) else s
        s = s / (np.abs(s).max() or 1) * 0.9
        index[f.stem] = [round(t, 4), round(len(s) / SR, 4)]
        parts += [s, np.zeros(int(GAP * SR), np.float32)]
        t += len(s) / SR + GAP
    with tempfile.TemporaryDirectory() as td:
        wav = pathlib.Path(td) / 'r.wav'
        with wave.open(str(wav), 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
            w.writeframes((np.clip(np.concatenate(parts), -1, 1) * 32767).astype(np.int16).tobytes())
        mp3 = root / 'sprites' / (out + '.mp3')
        subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', str(wav), '-ac', '1', '-ar', str(SR), '-codec:a', 'libmp3lame', '-b:a', '64k', str(mp3)], check=True)
    js.write_text(json.dumps({'sr': SR, 'clips': index}, separators=(',', ':')))
    print(name, len(index), 'lines,', round(t), 's,', mp3.stat().st_size // 1024, 'KB')
