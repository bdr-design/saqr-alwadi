"""The naval targets: the owner's top-down boats (assets/originals/targets/11-16, generated on black, bow up, no water)
cut out as the vehicles are (tools/make_sprites.py: the sprite, its burnt wreck, its shadow), each at its real length.

  python3 tools/make_boats.py        ->  sprites/<kind>.png, <kind>_burnt.png, <kind>_shadow.png; copy the printed
                                         w, h and wid into SPR in the game
"""
import numpy as np
from make_sprites import vehicle, ORIG

# kind, file, real length (m)
BOATS = [('fac', '11_fast_attack_boat.png', 11.0), ('rktboat', '12_rocket_speedboat.png', 12.0), ('dhow', '13_wooden_dhow.png', 18.0),
         ('patrol', '14_patrol_boat.png', 16.0), ('lcm', '15_landing_craft.png', 25.0), ('fishing', '16_civilian_fishing_boat.png', 9.0)]

if __name__ == '__main__':
    rng = np.random.default_rng(7)
    for kind, f, L in BOATS:
        vehicle(kind, ORIG / 'targets' / f, L, rng, TH=420 if L >= 15 else 320)
