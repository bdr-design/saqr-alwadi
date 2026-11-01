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
# measured along the type's axis (nose tip to nozzles) off the owner's side photo, its canopy 4.4 m long for the scale:
# at the windscreen the forebody 1.24 m deep, its top 0.87 m above the tip's line and its belly 0.37 m below; the tip a
# third of the way up; the top a convex curve up to the windscreen, the lower line straighter
ZTIP = 0.55
nhw = 0.78 * (1 - (1 - _u) ** 2.2)
_a = 0.55                                  # (the top still rising at the windscreen, about 8 deg, so the windscreen carries the line on)
ntop = ZTIP + (1.42 - ZTIP) * ((1 - _a) * (1 - (1 - _u) ** 1.6) + _a * _u)
_u2 = np.clip(f / 0.25, 0, 1)
nbot = 0.02 + (ZTIP - 0.02) * (1 - _u2) ** 1.15            # (one near-straight line from the tip down to the level belly at 4.9 m: 0.18 at the windscreen)
fwd = f <= XW
body = np.where(fwd, nhw, P([(XW, 0.78), (0.30, 0.83), (0.34, 2.05), (0.38, 2.2), (0.75, 2.25), (0.82, 2.0), (0.92, 1.55), (1.0, 1.3)]))
core = np.where(fwd, nhw, P([(XW, 0.78), (0.30, 0.83), (0.45, 1.0), (0.6, 1.25), (0.8, 1.6), (0.92, 1.45), (1.0, 1.3)]))
spine = np.where(fwd, ntop, P([(XW, 1.42), (0.407, 1.68), (0.45, 1.90), (0.5, 1.96), (0.75, 1.92), (0.9, 1.72), (1.0, 1.52)]))
belly = np.where(f < 0.25, nbot, P([(0.25, 0.02), (0.88, 0.02), (0.95, 0.18), (1.0, 0.3)]))
# the canopy: its sill along the cockpit's sides (on the deck: the spine), its top over the two seats, 1 m above the
# sill; the windscreen at 3.4 m, the canopy's end at 7.9 m (measured off the owner's side photo of the type)
can = (f >= 0.175) & (f <= 0.407)
sill = np.where(can, P([(0.175, 1.42), (0.407, 1.68)]), np.nan)
# the canopy's top: one smooth curve carried on from the nose's top line (the same height and slope at the windscreen's
# foot), rising gradually to its peak over the rear seat, then easing down to its high back
_xw, _zw = XW * L, 1.42; _sw = (1.42 - ZTIP) * _a / (XW * L)          # (the nose's top: height and slope there)
_xp, _zp = 6.2, 2.30; _xe, _ze = 0.407 * L, 2.12
def _ctop(x):
    if x <= _xp:                                         # (cubic Hermite: from the nose's tangent to a level peak)
        t = (x - _xw) / (_xp - _xw); h = _xp - _xw
        return (2 * t**3 - 3 * t**2 + 1) * _zw + (t**3 - 2 * t**2 + t) * h * _sw + (-2 * t**3 + 3 * t**2) * _zp
    t = (x - _xp) / (_xe - _xp); return _zp + (_ze - _zp) * (1 - np.cos(np.pi * min(t, 1))) / 2
ctop = np.where(can, np.array([_ctop(v) for v in x]), np.nan)
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
