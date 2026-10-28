"""The trailer's score and sound design (tools/trailer/make.cjs mixes it with the game's own sound): built from a cue
sheet of events on the cut's clock, synthesised here (no samples).

  python3 tools/trailer/score.py <cues.json> <out.wav>

cues.json: {"dur": seconds, "bpm": tempo, "events": [{"t": seconds, "k": kind, ...}, ...]}. Kinds:
  drone    t, end          a low D under it all, swelling (two detuned saws and a sub)
  pulse    t, end          the ostinato: a bass synth in eighths, its filter opening, with a kick on the beats
  heart    t, end          a slow heartbeat
  hit      t, size         a taiko-like hit (a pitched-down drum, a click, the room)
  boom     t               the big one: a sub falling away, a torn noise, a long tail
  whoosh   t               a swept noise rushing past, peaking at t (a transition)
  riser    t, end          noise and a climbing tone, tighter and louder, cut dead at end
  swell    t               a reversed bloom that lands at t
  braam    t               the brass-like stack, filter opening then closing
  shimmer  t               a metallic, ringing light (the flare)
  ticks    t, n, gap       UI ticks (text being typed)
  ring     t, dur          the ears ringing after a blast
  drop     t, end          silence: everything that sounds through it is cut (the beat before the blast)
"""
import sys, json, wave
import numpy as np
from scipy import signal

SR = 48000
cues = json.load(open(sys.argv[1])); out = sys.argv[2]
DUR, BPM = float(cues['dur']), float(cues.get('bpm', 120))
N = int(DUR * SR)
rng = np.random.default_rng(11)
mus = np.zeros((N, 2))     # the music: drone, pulse, braams
fx = np.zeros((N, 2))      # the design: hits, whooshes, risers, booms
wet = np.zeros((N, 2))     # sent to the room

def put(buf, t, x, gain=1.0, pan=0.0):
    """add mono or stereo x at time t"""
    i0 = int(t * SR)
    if i0 >= N: return
    if x.ndim == 1: x = np.stack([x * np.sqrt(0.5 * (1 - pan)), x * np.sqrt(0.5 * (1 + pan))], 1) * np.sqrt(2)
    if i0 < 0: x = x[-i0:]; i0 = 0
    n = min(len(x), N - i0); buf[i0:i0 + n] += x[:n] * gain

def lp(x, fc, order=2): return signal.sosfilt(signal.butter(order, min(fc, SR / 2 - 100), 'low', fs=SR, output='sos'), x)
def hp(x, fc, order=2): return signal.sosfilt(signal.butter(order, fc, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi, order=2): return signal.sosfilt(signal.butter(order, [lo, min(hi, SR / 2 - 100)], 'band', fs=SR, output='sos'), x)
def sweep_lp(x, fc):
    """a low-pass whose cutoff moves (fc per sample), run in 5 ms blocks"""
    y = np.empty_like(x); blk = 240; zi = None
    for i in range(0, len(x), blk):
        sos = signal.butter(2, float(np.clip(fc[i], 30, SR / 2 - 200)), 'low', fs=SR, output='sos')
        if zi is None: zi = np.zeros((sos.shape[0], 2))
        y[i:i + blk], zi = signal.sosfilt(sos, x[i:i + blk], zi=zi)
    return y
def sweep_bp(x, fc, q=1.2):
    y = np.empty_like(x); blk = 240; zi = None
    for i in range(0, len(x), blk):
        c = float(np.clip(fc[i], 60, SR / 2 - 3000)); sos = signal.butter(1, [c / (1 + 1 / q), c * (1 + 1 / q)], 'band', fs=SR, output='sos')
        if zi is None: zi = np.zeros((sos.shape[0], 2))
        y[i:i + blk], zi = signal.sosfilt(sos, x[i:i + blk], zi=zi)
    return y
def saw(f, t, ph=0.0):
    p = np.cumsum(np.broadcast_to(f, t.shape) / SR) + ph
    return 2 * (p % 1) - 1
def ar(n, a, d):
    """attack then exponential decay, in seconds"""
    tt = np.arange(n) / SR
    return (1 - np.exp(-tt / max(a, 1e-4))) * np.exp(-tt / d)
def noise(n): return rng.standard_normal(n)

D1, D2, A2, F2 = 36.71, 73.42, 110.0, 87.31

def drone(t0, t1):
    n = int((t1 - t0) * SR); tt = np.arange(n) / SR; k = tt / max(1e-3, t1 - t0)
    x = (saw(D2, tt) + saw(D2 * 1.006, tt, 0.3) + 0.6 * saw(A2 * 0.998, tt, 0.6)) / 2.6
    x = sweep_lp(x, 140 + 500 * k ** 2) + 0.8 * np.sin(2 * np.pi * D1 * tt)
    env = np.clip(tt / 1.5, 0, 1) * np.clip((t1 - t0 - tt) / 0.6, 0, 1) * (0.5 + 0.5 * k ** 1.3)
    put(mus, t0, x * env * 0.32)

def pulse(t0, t1):
    beat = 60 / BPM; step = beat / 2; notes = [D2, D2, D2 * 2, D2, F2, D2, D2 * 2, A2]   # (eighths)
    n_steps = int((t1 - t0) / step + 1e-6)
    for i in range(n_steps):
        t = t0 + i * step; k = (t - t0) / max(1e-3, t1 - t0)
        n = int(step * SR * 0.95); tt = np.arange(n) / SR
        x = saw(notes[i % len(notes)], tt) + saw(notes[i % len(notes)] * 1.004, tt, 0.25)
        x = lp(x, 260 + 1700 * k ** 1.5) * ar(n, 0.004, 0.09 + 0.05 * k)
        put(mus, t, x * (0.22 + 0.12 * k), pan=0.25 if i % 2 else -0.25)
        if i % 2 == 0:   # a kick on each beat, the room's side-chain in it
            m = int(0.35 * SR); tk = np.arange(m) / SR
            f = 48 + 90 * np.exp(-tk / 0.03); kick = np.sin(2 * np.pi * np.cumsum(f) / SR) * ar(m, 0.001, 0.16)
            put(fx, t, kick * (0.45 + 0.3 * k))

def heart(t0, t1):
    t = t0
    while t < t1:
        for dt, g in ((0, 1.0), (0.24, 0.7)):
            m = int(0.3 * SR); tk = np.arange(m) / SR
            x = np.sin(2 * np.pi * np.cumsum(42 + 30 * np.exp(-tk / 0.04)) / SR) * ar(m, 0.004, 0.09)
            put(fx, t + dt, lp(x, 160) * 0.55 * g)
        t += 1.0

def hit(t, size=1.0):
    m = int((0.9 + 0.6 * size) * SR); tk = np.arange(m) / SR
    body = np.sin(2 * np.pi * np.cumsum(45 + 70 * np.exp(-tk / 0.05)) / SR) * ar(m, 0.002, 0.35 + 0.25 * size)
    skin = bp(noise(m), 90, 900) * ar(m, 0.001, 0.08) * 0.8
    click = hp(noise(m), 2500) * ar(m, 0.0005, 0.006) * 0.5
    x = np.tanh((body * 1.4 + skin + click) * (1 + size))
    put(fx, t, x * 0.5 * size); put(wet, t, x * 0.35 * size)

def boom(t):
    m = int(6 * SR); tk = np.arange(m) / SR
    sub = np.sin(2 * np.pi * np.cumsum(28 + 38 * np.exp(-tk / 0.5)) / SR) * ar(m, 0.002, 1.6)
    crack = lp(noise(m), 3000) * ar(m, 0.001, 0.12)
    rumble = lp(noise(m), 180, 4) * ar(m, 0.05, 2.2) * 2.5
    x = np.tanh(sub * 2.2 + crack * 1.3 + rumble)
    put(fx, t, x * 0.85); put(wet, t, x * 0.5)

def whoosh(t, dur=0.9):
    m = int(dur * SR); k = np.arange(m) / m
    peak = 0.72
    fc = np.where(k < peak, 250 + 4200 * (k / peak) ** 2, 4450 - 3600 * ((k - peak) / (1 - peak)))
    x = sweep_bp(noise(m), fc, 1.5) * np.where(k < peak, (k / peak) ** 2.5, np.exp(-(k - peak) / 0.07))
    pan = np.clip(-1 + 2 * k, -1, 1)
    st = np.stack([x * np.sqrt(0.5 * (1 - pan)), x * np.sqrt(0.5 * (1 + pan))], 1) * np.sqrt(2)
    put(fx, t - dur * peak, st * 0.9); put(wet, t - dur * peak, st * 0.25)

def riser(t0, t1):
    m = int((t1 - t0) * SR); k = np.arange(m) / m; tt = np.arange(m) / SR
    nz = hp(noise(m), 300) ; nz = sweep_lp(nz, 600 + 9000 * k ** 2) * k ** 2.4
    tone = (saw(110 * 2 ** (3 * k ** 1.5), tt) + saw(110.6 * 2 ** (3 * k ** 1.5), tt, 0.4)) * 0.5
    tone = sweep_lp(tone, 400 + 5000 * k ** 2) * k ** 2.2
    trem = 0.75 + 0.25 * np.sin(2 * np.pi * np.cumsum(4 + 14 * k) / SR)
    put(fx, t0, (nz * 0.55 + tone * 0.35) * trem)

def swell(t, dur=1.4):
    m = int(dur * SR)
    x = lp(noise(m), 5000) * ar(m, 0.001, 0.5)
    x = signal.fftconvolve(x, IR[:, 0])[:m]
    x = x[::-1] / (np.max(np.abs(x)) + 1e-9)
    put(fx, t - dur, x * 0.45)

def braam(t):
    m = int(5.5 * SR); tt = np.arange(m) / SR
    stack = sum(saw(f, tt, rng.random()) for f in (D1 * 2, D1 * 2 * 1.005, A2 / 2 * 1.003, D2 * 2, D2 * 2 * 0.996, F2 * 2)) / 6
    fc = 120 + 2200 * np.exp(-tt / 0.4) * (1 - np.exp(-tt / 0.03))
    env = (1 - np.exp(-tt / 0.01)) * np.exp(-tt / 1.9)
    sub = np.sin(2 * np.pi * D1 * tt) * np.exp(-tt / 1.4)
    x = np.tanh((sweep_lp(stack, fc) * 1.6 + sub) * env * 1.5)
    put(mus, t, x * 0.7); put(wet, t, x * 0.35)

def shimmer(t):
    m = int(4 * SR); tt = np.arange(m) / SR
    x = sum(np.sin(2 * np.pi * f * tt + rng.random() * 6) * np.exp(-tt / d) for f, d in ((1318, 1.8), (1975, 1.4), (2637, 1.1), (3520, 0.8), (4186, 0.6))) / 4
    x = x * (1 - np.exp(-tt / 0.02))
    put(fx, t, x * 0.18, pan=-0.3); put(wet, t, x * 0.3)

def ticks(t, n=12, gap=0.045):
    for i in range(int(n)):
        m = int(0.025 * SR); tt = np.arange(m) / SR
        f = 1700 + 500 * rng.random()
        put(fx, t + i * gap, np.sin(2 * np.pi * f * tt) * ar(m, 0.0005, 0.006) * 0.12, pan=0.4)

def ring(t, dur=2.5):
    m = int(dur * SR); tt = np.arange(m) / SR
    put(fx, t, np.sin(2 * np.pi * 3700 * tt) * np.exp(-tt / (dur / 3)) * (1 - np.exp(-tt / 0.05)) * 0.05)

# the room: a dark stereo tail, 2.6 s
nIR = int(2.6 * SR); tIR = np.arange(nIR) / SR
IR = np.stack([lp(noise(nIR), 2600) * np.exp(-tIR / 0.7), lp(noise(nIR), 2600) * np.exp(-tIR / 0.7)], 1); IR /= np.abs(IR).sum(0) ** 0.5 * 4

drops = []
for e in sorted(cues['events'], key=lambda e: e['t']):
    k, t = e['k'], float(e['t'])
    if k == 'drone': drone(t, e['end'])
    elif k == 'pulse': pulse(t, e['end'])
    elif k == 'heart': heart(t, e['end'])
    elif k == 'hit': hit(t, e.get('size', 1.0))
    elif k == 'boom': boom(t)
    elif k == 'whoosh': whoosh(t, e.get('dur', 0.9))
    elif k == 'riser': riser(t, e['end'])
    elif k == 'swell': swell(t, e.get('dur', 1.4))
    elif k == 'braam': braam(t)
    elif k == 'shimmer': shimmer(t)
    elif k == 'ticks': ticks(t, e.get('n', 12), e.get('gap', 0.045))
    elif k == 'ring': ring(t, e.get('dur', 2.5))
    elif k == 'drop': drops.append((t, float(e['end'])))

room = np.stack([signal.fftconvolve(wet[:, c], IR[:, c])[:N] for c in range(2)], 1)
mix = mus + fx + room
# the drops: what was sounding is cut dead (a few ms of fade), and stays out until the drop ends
for t0, t1 in drops:
    a, b = int(t0 * SR), int(t1 * SR); f = int(0.006 * SR)
    g = np.ones(N); g[a:b] = 0; g[a - f:a] = np.linspace(1, 0, f); g[b:b + f] = np.linspace(0, 1, f)
    # (whatever starts at the drop's end, the blast, is not faded: it is laid in after)
    mix *= g[:, None]
# the end: out over the last second; a gentle limit
tt = np.arange(N) / SR
mix *= np.clip((DUR - tt) / 1.2, 0, 1)[:, None]
mix = np.tanh(mix * 1.1) / np.tanh(1.1)
with wave.open(out, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((np.clip(mix, -1, 1) * 32000).astype('<i2').tobytes())
print(out, DUR, 's,', len(cues['events']), 'cues')
