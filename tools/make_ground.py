"""The new ground targets: the owner's top-down pictures (assets/originals/targets/03-10, generated on black, front up)
cut out as the vehicles are (tools/make_sprites.py: the sprite, its burnt wreck, its shadow), each at its real size.
The length is the picture's height on the ground (front to back; for the emplacements, top to bottom as drawn).

  python3 tools/make_ground.py       ->  sprites/<kind>.png, <kind>_burnt.png, <kind>_shadow.png; copy the printed
                                         w, h and wid into SPR in the game
"""
import numpy as np
from make_sprites import vehicle, ORIG

# kind, file, length (m)
GROUND = [('t72', '03_t72_tank.png', 9.5),            # the hull 6.9 m, the gun over the front
          ('btr80', '04_btr80_apc.png', 7.6),
          ('bm21', '05_bm21_grad.png', 7.4),          # (the picture's tube count is a draft: 40 wanted)
          ('zu23e', '06_zu23_emplacement.png', 7.5),  # the sandbag ring 6 m across, the barrels over its top
          ('mortar', '07_mortar_position.png', 5.0),
          ('ammo', '08_ammunition_dump.png', 6.5),    # 8.5 m across by 6.5
          ('ural', '09_ural_cargo_truck.png', 7.4),
          ('trench', '10_sandbag_trench.png', 6.0)]   # 10 m along its curve, the machine gun over the parapet

if __name__ == '__main__':
    rng = np.random.default_rng(11)
    for kind, f, L in GROUND:
        vehicle(kind, ORIG / 'targets' / f, L, rng)
