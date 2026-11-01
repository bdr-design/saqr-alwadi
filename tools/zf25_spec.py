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
H = 4.95                                   # gear up: the belly to the fins' tips (5.63 on its wheels)
f = (np.arange(240) + 0.5) / 240; x = f * L
P = lambda pts: np.interp(f, [p[0] for p in pts], [p[1] for p in pts])
# the nose an ogive to the cockpit, the shoulders out at the intakes, the aft fuselage over the engines
nose = 0.84 * np.sqrt(np.clip(1 - (1 - np.clip(f / 0.17, 0, 1)) ** 2, 0, 1))
body = np.where(f < 0.17, nose, P([(0.17, 0.84), (0.27, 0.88), (0.31, 2.05), (0.36, 2.2), (0.75, 2.25), (0.82, 2.0), (0.92, 1.55), (1.0, 1.3)]))
core = np.where(f < 0.17, nose, P([(0.17, 0.84), (0.27, 0.88), (0.45, 1.0), (0.6, 1.25), (0.8, 1.6), (0.92, 1.45), (1.0, 1.3)]))
spine = P([(0.0, 0.98), (0.06, 1.22), (0.12, 1.45), (0.16, 1.62), (0.42, 1.80), (0.46, 1.96), (0.75, 1.92), (0.9, 1.72), (1.0, 1.52)])
belly = P([(0.0, 0.98), (0.05, 0.62), (0.12, 0.34), (0.2, 0.16), (0.28, 0.02), (0.88, 0.02), (0.95, 0.18), (1.0, 0.3)])
# the canopy: its sill along the cockpit's sides, its top over the two seats
can = (f >= 0.16) & (f <= 0.43)
sill = np.where(can, P([(0.16, 1.62), (0.43, 1.80)]), np.nan)
ctop = np.where(can, P([(0.16, 1.64), (0.21, 2.35), (0.27, 2.58), (0.36, 2.55), (0.43, 1.95)]), np.nan)
# the wing: area 56.5 m2 over 13.05 m, taper 0.25: root chord (at the centreline) 6.93 m, tip 1.73 m, leading edge 45 deg
lam = 0.25; cr = 2 * AREA / (SPAN * (1 + lam)); ct = cr * lam; semi = SPAN / 2; xle0 = 0.39 * L
wing = [[round(y, 3), round(xle0 + y * np.tan(np.radians(45)), 3), round(xle0 + y * np.tan(np.radians(45)) + cr + (ct - cr) * y / semi, 3)] for y in np.linspace(2.0, semi - 0.05, 24)]
# tailplanes: 8.6 m across, root chord 3.0 m, tip 1.15 m, leading edge 50 deg, level with the nozzles' tops
ty0, tsemi = 1.9, 4.3
tail = [[round(y, 3), round(0.80 * L + (y - ty0) * np.tan(np.radians(50)), 3), round(0.80 * L + (y - ty0) * np.tan(np.radians(50)) + 3.0 + (1.15 - 3.0) * (y - ty0) / (tsemi - ty0), 3)] for y in np.linspace(ty0, tsemi, 16)]
# fins: over the engines, root chord 3.9 m, tip 1.2 m, leading edge 38 deg, up to the full height
fz0 = 1.9; fx0 = 0.765 * L
fin = [[round(z, 3), round(fx0 + (z - fz0) * np.tan(np.radians(38)), 3), round(fx0 + (z - fz0) * np.tan(np.radians(38)) + 3.9 + (1.2 - 3.9) * (z - fz0) / (H - fz0), 3)] for z in np.linspace(fz0, H - 0.02, 16)]
r = lambda a: [round(float(v), 4) for v in a]
spec = {'units': 'm; x from the nose tip aft, y to the left +, z up from the belly (gear up)', 'source': 'zf25_spec.py: a heavy twin-engine strike fighter\'s proportions',
        'len': L, 'span': SPAN, 'hgt': H,
        'stations': {'x': r(x), 'top_hw': r(body), 'core_hw': r(core), 'body_hw': r(body), 'spine': r(spine), 'belly': r(belly),
                     'canopy_sill': r(sill), 'canopy_top': r(ctop)},
        'intakes': {'x0': round(0.285 * L, 3), 'x1': round(xle0 + 2.2, 3), 'outer_hw': 2.2,
                    'openings_front': [{'y0': 2.12, 'y1': 1.05, 'z0': 0.12, 'z1': 1.55}, {'y0': 1.05, 'y1': 2.12, 'z0': 0.12, 'z1': 1.55}]},
        'wing': {'z': 1.48, 'anhedral_deg': -1.0, 'x_root': [round(xle0, 3), round(xle0 + cr, 3)], 'stations_y_le_te': wing},
        'tailplane': {'z': 1.12, 'stations_y_le_te': tail},
        'fin': {'x0': round(fx0, 3), 'root_y': 1.55, 'cant_deg': 15.0, 'stations_z_le_te': fin},
        'nozzles': [{'y': 0.62, 'z': 0.62, 'r': 0.56}, {'y': -0.62, 'z': 0.62, 'r': 0.56}],
        'front_halfwidth_by_z': [[2.6, 0.08], [2.5, 0.42], [2.3, 0.6], [2.05, 0.7], [1.8, 0.76], [1.6, 0.8]]}
out = root / 'assets' / 'originals' / 'jet_model' / 'spec.json'
out.write_text(json.dumps(spec, indent=1).replace('NaN', 'null'))
print('wing root chord', round(cr, 2), 'tip', round(ct, 2), '| wing area check', round((cr + ct) / 2 * SPAN, 1), 'm2 | wrote', out)
