"""The ZF-25's shape by a heavy twin-engine strike fighter's real proportions (the owner's call: the F-15's published
size and layout rather than the generated blueprints' drawing), with the ZF-25's own details (fins canted 15 degrees,
its canopy and nose). Writes assets/originals/jet_model/spec.json in the same form as measure.json, for
tools/blender_zf25.py.

Published (USAF/US Navy fact sheets): length 19.43 m, span 13.05 m, height 5.63 m on its wheels, wing area 56.5 m2.
The rest from the type's well-known layout, approximate: leading edge swept 45 degrees, taper about 0.25, the wing
high on the fuselage, rectangular intakes on the shoulders from about 28% of the length, a flat belly, the engines side
by side, tailplanes about 8.6 m across, fins over the engines.
Frame as measure.json: x from the nose tip aft, y to the left +, z up from the belly (gear up).
"""
import json, pathlib
import numpy as np
root = pathlib.Path(__file__).resolve().parent.parent
L, SPAN, AREA = 19.43, 13.05, 56.5
H = 4.43                                   # gear up: the belly to the fins' tips (5.63 on its wheels, the belly 1.2 m off the ground)
f = (np.arange(240) + 0.5) / 240; x = f * L
P = lambda pts: np.interp(f, [p[0] for p in pts], [p[1] for p in pts])
# the nose: a round radome swelling smoothly (a power curve) into the forebody at the windscreen's foot, its axis
# dropping a little, the belly level from about 4.5 m back; the shoulders out at the intakes, the
# aft fuselage over the engines
XW = 0.175                                 # (the windscreen's foot at 3.4 m: the nose and forebody one smooth profile to here)
_u = np.clip(f / XW, 0, 1)
# the nose measured off the owner's straight side photo of the type (scale from the windscreen's foot at 3.44 m): the
# radome round and symmetric about its tip, the tip 0.88 m above the level belly; its radius at each station below
_RX = np.array([0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.44]); _RR = np.array([0, 0.22, 0.37, 0.48, 0.57, 0.63, 0.70, 0.78])
_cf = np.linalg.lstsq(np.stack([np.sqrt(_RX), _RX, _RX ** 2], 1), _RR, rcond=None)[0]   # (a smooth fit: sqrt, linear, square)
def _R(xm): xm = np.clip(xm, 0, None); return _cf[0] * np.sqrt(xm) + _cf[1] * xm + _cf[2] * xm ** 2
ZTIP = 0.90
xm_ = f * L
nhw = _R(np.minimum(xm_, XW * L))
ntop = ZTIP + _R(np.minimum(xm_, XW * L))
_zb_ws = ZTIP - _R(XW * L)                                     # (the belly under the windscreen; it eases down to the level belly by 4.9 m)
_t = np.clip((xm_ - XW * L) / (0.25 * L - XW * L), 0, 1)
nbot = np.where(xm_ <= XW * L, ZTIP - _R(xm_), _zb_ws + (0.02 - _zb_ws) * (3 * _t ** 2 - 2 * _t ** 3) + 0 * _t)
_a = 0.0
fwd = f <= XW
body = np.where(fwd, nhw, P([(XW, 0.78), (0.30, 0.83), (0.34, 2.05), (0.38, 2.2), (0.75, 2.25), (0.82, 2.0), (0.92, 1.55), (1.0, 1.3)]))
core = np.where(fwd, nhw, P([(XW, 0.78), (0.30, 0.83), (0.45, 1.0), (0.6, 1.25), (0.8, 1.6), (0.92, 1.45), (1.0, 1.3)]))
spine = np.where(fwd, ntop, P([(XW, ZTIP + 0.78), (0.407, ZTIP + 1.04), (0.45, 2.02), (0.5, 2.04), (0.75, 1.98), (0.9, 1.76), (1.0, 1.52)]))
belly = np.where(f < 0.25, nbot, P([(0.25, 0.02), (0.88, 0.02), (0.95, 0.18), (1.0, 0.3)]))
# the canopy: its sill along the cockpit's sides (on the deck: the spine), its top over the two seats, 1 m above the
# sill; the windscreen at 3.4 m, the canopy's end at 7.9 m (measured off the owner's side photo of the type)
can = (f >= 0.175) & (f <= 0.407)
sill = np.where(can, P([(0.175, ZTIP + 0.65), (0.365, ZTIP + 0.65), (0.385, ZTIP + 0.78), (0.407, ZTIP + 1.0)]), np.nan)   # (one level line along the cockpit's top, as the owner's photo of the type shows; rising only at the tail to meet the top)
# the canopy's top read off the owner's straight side photo (metres above the tip's line): it rises fast off the
# windscreen's foot and levels out over the rear seat, then falls to its back and the dorsal fairing
_CX = np.array([XW * L, 3.56, 4.01, 4.47, 4.92, 5.37, 5.83, 6.3, 6.8, 7.2, 7.55, 0.407 * L])
_CZ = np.array([0.78, 0.86, 1.15, 1.27, 1.35, 1.40, 1.43, 1.44, 1.39, 1.30, 1.17, 1.04])   # (an arc: its peak between the seats, falling to the spine at its tail)
ctop = np.where(can, ZTIP + np.interp(x, _CX, _CZ), np.nan)
# the wing: area 56.5 m2 over 13.05 m, taper 0.25: root chord (at the centreline) 6.93 m, tip 1.73 m, leading edge 45 deg
lam = 0.25; cr = 2 * AREA / (SPAN * (1 + lam)); ct = cr * lam; semi = SPAN / 2; xle0 = 0.39 * L
wing = [[round(y, 3), round(xle0 + y * np.tan(np.radians(45)), 3), round(xle0 + y * np.tan(np.radians(45)) + cr + (ct - cr) * y / semi, 3)] for y in np.linspace(2.0, semi, 25)]
for q in wing:                             # (the tip clipped: the trailing edge raked in over the last 0.7 m to a 0.9 m tip)
    k = np.clip((q[0] - (semi - 0.7)) / 0.7, 0, 1); q[2] = round(min(q[2], q[2] + (q[1] + 0.9 - q[2]) * k), 3)
# tailplanes: 8.6 m across, root chord 3.0 m, tip 1.15 m, leading edge 50 deg, level with the nozzles' tops
ty0, tsemi, tdog = 1.9, 4.3, 2.75
tx0 = 0.815 * L
def _tle(y): return tx0 + (y - ty0) * np.tan(np.radians(50)) - (0.3 if y >= tdog else 0.0)   # (the dogtooth)
def _tte(y): return tx0 + (y - ty0) * np.tan(np.radians(50)) + 3.0 + (1.15 - 3.0) * (y - ty0) / (tsemi - ty0)
tail = [[round(y, 3), round(_tle(y), 3), round(_tte(y), 3)] for y in sorted(set(list(np.linspace(ty0, tsemi, 12)) + [tdog - 0.02, tdog]))]
# fins: over the engines, root chord 3.9 m, tip 1.2 m, leading edge 38 deg, up to the full height
fz0 = 1.9; fx0 = 0.765 * L
fin = [[round(z, 3), round(fx0 + (z - fz0) * np.tan(np.radians(33)), 3), round(fx0 + (z - fz0) * np.tan(np.radians(33)) + 3.6 + (1.55 - 3.6) * (z - fz0) / (H - 0.12 - fz0), 3)] for z in np.linspace(fz0, H - 0.12, 16)]   # (the cap above, to H)
r = lambda a: [round(float(v), 4) for v in a]
spec = {'units': 'm; x from the nose tip aft, y to the left +, z up from the belly (gear up)', 'source': 'zf25_spec.py: a heavy twin-engine strike fighter\'s proportions',
        'len': L, 'span': SPAN, 'hgt': H,
        'stations': {'x': r(x), 'top_hw': r(body), 'core_hw': r(core), 'body_hw': r(body), 'spine': r(spine), 'belly': r(belly),
                     'canopy_sill': r(sill), 'canopy_top': r(ctop)},
        'intakes': {'x0': round(0.33 * L, 3), 'x1': round(xle0 + 2.2, 3), 'outer_hw': 2.2,
                    'openings_front': [{'y0': 2.12, 'y1': 1.05, 'z0': 0.12, 'z1': 1.55}, {'y0': 1.05, 'y1': 2.12, 'z0': 0.12, 'z1': 1.55}]},
        'wing': {'z': 1.70, 'anhedral_deg': -1.0, 'x_root': [round(xle0, 3), round(xle0 + cr, 3)], 'stations_y_le_te': wing},
        'tailplane': {'z': 1.12, 'dogtooth_y': tdog, 'stations_y_le_te': tail},
        'fin': {'x0': round(fx0, 3), 'root_y': 1.55, 'cant_deg': 0.0, 'stations_z_le_te': fin},
        'nozzles': [{'y': 0.62, 'z': 0.62, 'r': 0.56}, {'y': -0.62, 'z': 0.62, 'r': 0.56}],
        'front_halfwidth_by_z': [[2.6, 0.08], [2.5, 0.42], [2.3, 0.6], [2.05, 0.7], [1.8, 0.76], [1.6, 0.8]]}
out = root / 'assets' / 'originals' / 'jet_model' / 'spec.json'
out.write_text(json.dumps(spec, indent=1).replace('NaN', 'null'))
print('wing root chord', round(cr, 2), 'tip', round(ct, 2), '| wing area check', round((cr + ct) / 2 * SPAN, 1), 'm2 | wrote', out)
