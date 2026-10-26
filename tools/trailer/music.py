"""The trailer's music bed (tools/trailer/make.cjs mixes it under the game's own sound): a low drone that swells
toward the end, a noise riser into the last cut, and deep brass-like hits ("braams") at the given times.

  python3 tools/trailer/music.py <out.wav> <seconds> <hit time> [<hit time> ...]
"""
import sys, wave
import numpy as np

out, dur, hits = sys.argv[1], float(sys.argv[2]), [float(x) for x in sys.argv[3:]]
SR = 48000
n = int(dur * SR); t = np.arange(n) / SR
rng = np.random.default_rng(7)

def onepole(x, fc):
    """low-pass, fc in Hz (a number or an array per sample)"""
    a = 1 - np.exp(-2 * np.pi * np.broadcast_to(np.asarray(fc, float), x.shape) / SR)
    y = np.empty_like(x); acc = 0.0
    for i in range(len(x)):
        acc += a[i] * (x[i] - acc); y[i] = acc
    return y

# drone: two detuned low tones and their octave, breathing slowly, swelling toward the end
swell = 0.35 + 0.65 * np.clip(t / dur, 0, 1) ** 1.6
drone = (np.sin(2 * np.pi * 43.65 * t) + 0.8 * np.sin(2 * np.pi * 43.9 * t + 1) + 0.35 * np.sin(2 * np.pi * 87.3 * t)) * (0.75 + 0.25 * np.sin(2 * np.pi * 0.11 * t))
drone = drone * swell * 0.16
# riser: noise opening up over the 4 s before the last hit
riser = np.zeros(n)
if hits:
    end = hits[-1]; a, b = int(max(0, end - 4) * SR), int(end * SR)
    if b > a:
        k = np.linspace(0, 1, b - a)
        noise = rng.standard_normal(b - a)
        riser[a:b] = onepole(noise, 200 + 5000 * k ** 2) * k ** 2.2 * 0.22
# braams: a stack of detuned saws, the filter opening then closing, a long tail
braam = np.zeros(n)
for h in hits:
    i0 = int(h * SR); L = min(n - i0, int(4.5 * SR))
    if L <= 0: continue
    tt = np.arange(L) / SR
    saw = lambda f: 2 * ((tt * f) % 1) - 1
    stack = sum(saw(f) for f in (43.65, 43.9, 65.4, 87.3, 87.9, 130.8)) / 6
    fc = 120 + 1400 * np.exp(-tt / 0.35) * (1 - np.exp(-tt / 0.02))
    env = (1 - np.exp(-tt / 0.015)) * np.exp(-tt / 1.6)
    sub = np.sin(2 * np.pi * 36 * tt) * np.exp(-tt / 1.2)
    braam[i0:i0 + L] += onepole(stack, fc) * env * 0.9 + sub * 0.55 * env
mix = drone + riser + braam
# fade in and out, then a soft limit
mix *= np.clip(t / 1.2, 0, 1) * np.clip((dur - t) / 1.5, 0, 1)
mix = np.tanh(mix * 1.2) / np.tanh(1.2)
st = np.stack([mix, np.roll(mix, int(0.011 * SR))], 1)
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(st, -1, 1) * 32000).astype('<i2').tobytes())
print(out, dur, 's,', len(hits), 'hits')
