"""The ZF-25's shape by a heavy twin-engine strike fighter's real proportions (the owner's call: the F-15's published
size and layout rather than the generated blueprints' drawing), with the ZF-25's own details (upright fins,
its canopy and nose). Writes assets/originals/jet_model/spec.json in the same form as measure.json, for
tools/blender_zf25.py.

Published (USAF/US Navy fact sheets): length 19.43 m, span 13.05 m, height 5.63 m on its wheels, wing area 56.5 m2.
The rest from the type's well-known layout, approximate: leading edge swept 45 degrees, taper about 0.25, the wing
high on the fuselage, rectangular intakes on the shoulders from about 33% of the length, a flat belly, the engines side
by side, tailplanes about 8.6 m across, fins over the engines.
Frame as measure.json: x from the nose tip aft, y to the left +, z up from the belly (gear up).
"""
import json, pathlib
import numpy as np
root = pathlib.Path(__file__).resolve().parent.parent
L, SPAN, AREA = 19.43, 13.05, 56.5
H = 4.43                                   # gear up: the belly to the fins' tips (5.63 on its wheels, the belly 1.2 m off the ground)
f = (np.arange(240) + 0.5) / 240; x = f * L
def P(pts, m0=None):
    """a smooth curve through the points (monotone cubic, Fritsch-Carlson): no corners at them, no overshoot. m0: the
    slope (per unit of f) to start with, carrying on the curve it joins (limited so it cannot overshoot)"""
    xk = np.array([p[0] for p in pts], float); yk = np.array([p[1] for p in pts], float)
    h = np.diff(xk); assert (h > 0).all(), 'P: the points must run strictly forward'
    d = np.diff(yk) / h; m = np.zeros_like(yk)
    with np.errstate(divide='ignore', invalid='ignore'):
        m[1:-1] = np.where(d[:-1] * d[1:] > 0, (h[:-1] + h[1:]) * 3 / ((2 * h[1:] + h[:-1]) / d[:-1] + (h[1:] + 2 * h[:-1]) / d[1:] + 1e-12), 0.0)
    m[0], m[-1] = d[0], d[-1]
    if m0 is not None: m[0] = float(np.clip(m0, min(0, 3 * d[0]), max(0, 3 * d[0])))
    i = np.clip(np.searchsorted(xk, f) - 1, 0, len(h) - 1); t = np.clip((f - xk[i]) / h[i], 0, 1)
    h00, h10, h01, h11 = 2*t**3 - 3*t**2 + 1, t**3 - 2*t**2 + t, -2*t**3 + 3*t**2, t**3 - t**2
    out = h00 * yk[i] + h10 * h[i] * m[i] + h01 * yk[i + 1] + h11 * h[i] * m[i + 1]
    return np.where(f < xk[0], yk[0], np.where(f > xk[-1], yk[-1], out))
# the nose: a round radome swelling smoothly (a power curve) into the forebody at the windscreen's foot, its axis
# dropping a little, the belly level from about 4.5 m back; the shoulders out at the intakes, the
# aft fuselage over the engines
XW = 0.175                                 # (the windscreen's foot at 3.4 m: the nose and forebody one smooth profile to here)
# the nose measured off the owner's straight side photo of the type (scale from the windscreen's foot, 3.4 m): the
# radome round and symmetric about its tip, the tip 0.90 m above the level belly; its radius at each station below
_RX = np.array([0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.44]); _RR = np.array([0, 0.22, 0.37, 0.48, 0.57, 0.63, 0.70, 0.78])
_cf = np.linalg.lstsq(np.stack([np.sqrt(_RX), _RX, _RX ** 2], 1), _RR, rcond=None)[0]   # (a smooth fit: sqrt, linear, square)
def _R(xm): xm = np.clip(xm, 0, None); return _cf[0] * np.sqrt(xm) + _cf[1] * xm + _cf[2] * xm ** 2
ZTIP = 0.90
xm_ = f * L
_kw = lambda xm: 1 - 0.08 * np.clip((xm - 1.4) / 2.0, 0, 1) ** 2 * (3 - 2 * np.clip((xm - 1.4) / 2.0, 0, 1))   # (the forebody a little narrower than tall from the radome's joint back, as the type's)
nhw = _R(np.minimum(xm_, XW * L)) * _kw(np.minimum(xm_, XW * L))
ntop = ZTIP + _R(np.minimum(xm_, XW * L))
_zb_ws = ZTIP - _R(XW * L)                                     # (the belly under the windscreen; it eases down to the level belly by 4.9 m)
_R0h = float(_R(XW * L)); _R0 = _R0h * float(_kw(XW * L)); _dR = float(_R(XW * L + 0.005) - _R(XW * L - 0.005)) / 0.01   # (the radome's radius and slope where it joins)
_t = np.clip((xm_ - XW * L) / (0.25 * L - XW * L), 0, 1); _dur = 0.25 * L - XW * L
nbot = np.where(xm_ <= XW * L, ZTIP - _R(xm_),       # (on with the radome's own slope, easing level: no corner at the joint)
                (2*_t**3 - 3*_t**2 + 1) * _zb_ws + (_t**3 - 2*_t**2 + _t) * _dur * max(-_dR, 3 * (0.02 - _zb_ws) / _dur) + (3*_t**2 - 2*_t**3) * 0.02)
fwd = f <= XW
body = np.where(fwd, nhw, P([(XW, _R0), (0.30, 0.74), (0.33, 1.76), (0.39, 1.82), (0.44, 1.97), (0.47, 2.12), (0.75, 2.2), (0.82, 2.0), (0.92, 1.55), (1.0, 1.3)], _dR * L))
core = np.where(fwd, nhw, P([(XW, _R0), (0.30, 0.72), (0.45, 1.0), (0.6, 1.25), (0.8, 1.6), (0.92, 1.45), (1.0, 1.3)], _dR * L))
spine = np.where(fwd, ntop, P([(XW, ZTIP + _R0h), (0.407, ZTIP + 1.04), (0.45, ZTIP + 1.07), (0.5, ZTIP + 1.08), (0.75, 1.98), (0.9, 1.76), (1.0, 1.52)], _dR * L))
belly = np.where(f < 0.25, nbot, P([(0.25, 0.02), (0.88, 0.02), (0.95, 0.18), (1.0, 0.3)]))
# the canopy: its sill along the cockpit's sides (on the deck: the spine), its top over the two seats, about 0.8 m above the
# sill; the windscreen at 3.4 m, the canopy's end at 7.9 m (measured off the owner's side photo of the type)
can = (f >= 0.175) & (f <= 0.407)
sill = np.where(can, P([(0.175, ZTIP + 0.65), (0.365, ZTIP + 0.65), (0.385, ZTIP + 0.78), (0.407, ZTIP + 1.0)]), np.nan)   # (one level line along the cockpit's top, as the owner's photo of the type shows; rising only at the tail to meet the top)
# the canopy's top read off the owner's straight side photo (metres above the tip's line): it rises fast off the
# windscreen's foot and levels out over the rear seat, then falls to its back and the dorsal fairing
_CX = np.array([XW * L, 3.56, 4.01, 4.47, 4.92, 5.37, 5.83, 6.3, 6.8, 7.2, 7.55, 0.407 * L])
_CZ = np.array([0.78, 0.86, 1.15, 1.27, 1.35, 1.40, 1.43, 1.44, 1.39, 1.30, 1.17, 1.04])   # (an arc: its peak between the seats, falling to the spine at its tail)
ctop = np.where(can, ZTIP + np.interp(x, _CX, _CZ), np.nan)
# the wing: area 56.5 m2 over 13.05 m, taper 0.25: root chord (at the centreline) 6.93 m, tip 1.73 m, leading edge 45 deg
lam = 0.25; cr = 2 * AREA / (SPAN * (1 + lam)); ct = cr * lam; semi = SPAN / 2; xle0 = 7.25   # (the root's leading edge half a metre ahead of the canopy's tail: the type's MAC leading edge at ~9.8 m from the nose, its flight model's data)
wing = [[round(y, 3), round(xle0 + y * np.tan(np.radians(45)), 3), round(xle0 + y * np.tan(np.radians(45)) + cr + (ct - cr) * y / semi, 3)] for y in np.linspace(2.0, semi, 25)]
for q in wing:                             # (the tip clipped: the trailing edge raked in over the last 0.7 m to a 0.9 m tip)
    k = np.clip((q[0] - (semi - 0.7)) / 0.7, 0, 1); q[2] = round(min(q[2], q[2] + (q[1] + 0.9 - q[2]) * k), 3)
# tailplanes: 8.6 m across, root chord 3.0 m, tip 1.15 m, leading edge 50 deg, level with the nozzles' tops
ty0, tsemi, tdog = 1.9, 4.3, 2.75
tx0 = 15.38                                # (the stabilators' tips the aftmost point, at the overall length)
def _tle(y): return tx0 + (y - ty0) * np.tan(np.radians(50)) - (0.3 if y >= tdog else 0.0)   # (the dogtooth)
def _tte(y): return tx0 + (y - ty0) * np.tan(np.radians(50)) + 3.4 + (1.16 - 3.4) * (y - ty0) / (tsemi - ty0)   # (taper 0.34, as NASA's F-15 geometry)
tail = [[round(y, 3), round(_tle(y), 3), round(_tte(y), 3)] for y in sorted(set(list(np.linspace(ty0, tsemi, 12)) + [tdog - 0.02, tdog]))]
# fins: over the engines, measured off the owner's side photo of the type (pose-solved): leading edge 35 deg, upright trailing edge
fz0 = 1.9; fx0 = 15.22; FTE = 17.90                     # (the type's: leading edge 35 deg, the trailing edge upright at 17.9 m, tip chord ~1 m)
fin = [[round(z, 3), round(fx0 + (z - fz0) * np.tan(np.radians(35)), 3), FTE] for z in np.linspace(fz0, H - 0.12, 16)]   # (the tip pods above, to H)
r = lambda a: [round(float(v), 4) for v in a]
spec = {'units': 'm; x from the nose tip aft, y to the left +, z up from the belly (gear up)', 'source': 'zf25_spec.py: a heavy twin-engine strike fighter\'s proportions',
        'len': L, 'span': SPAN, 'hgt': H,
        'stations': {'x': r(x), 'top_hw': r(body), 'core_hw': r(core), 'body_hw': r(body), 'spine': r(spine), 'belly': r(belly),
                     'canopy_sill': r(sill), 'canopy_top': r(ctop)},
        'intakes': {'x0': round(0.33 * L, 3), 'x1': round(xle0 + 2.2, 3), 'outer_hw': 1.8,
                    'openings_front': [{'y0': 1.78, 'y1': 0.86, 'z0': 0.12, 'z1': 1.55}, {'y0': 0.86, 'y1': 1.78, 'z0': 0.12, 'z1': 1.55}]},   # (the mouths the type's: ~0.9 m wide, a hand's breadth off the forebody, the trunks widening aft to the wing's root)
        'wing': {'z': 1.70, 'anhedral_deg': -1.0, 'x_root': [round(xle0, 3), round(xle0 + cr, 3)], 'stations_y_le_te': wing},
        'tailplane': {'z': 1.12, 'dogtooth_y': tdog, 'stations_y_le_te': tail},
        'fin': {'x0': round(fx0, 3), 'root_y': 1.68, 'cant_deg': 0.0, 'stations_z_le_te': fin},
        'nozzles': [{'y': 0.62, 'z': 0.62, 'r': 0.56}, {'y': -0.62, 'z': 0.62, 'r': 0.56}],
        'front_halfwidth_by_z': [[2.6, 0.08], [2.5, 0.42], [2.3, 0.6], [2.05, 0.7], [1.8, 0.76], [1.6, 0.8]]}
out = root / 'assets' / 'originals' / 'jet_model' / 'spec.json'
out.write_text(json.dumps(spec, indent=1).replace('NaN', 'null'))
print('wing root chord', round(cr, 2), 'tip', round(ct, 2), '| wing area check', round((cr + ct) / 2 * SPAN, 1), 'm2 | wrote', out)
