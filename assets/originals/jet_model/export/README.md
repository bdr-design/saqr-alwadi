# ZF-25 — the game's models (glTF binary)

Built by code, nothing hand-edited: `tools/zf25_spec.py` (the shape's numbers → `../spec.json`) and
`tools/blender_zf25.py` (the model, its paint, these exports). Rebuild:

```
/tmp/bpyenv/bin/python tools/zf25_spec.py
for l in 0 1 2; do LOD=$l <python 3.11 with bpy 4.2> tools/blender_zf25.py --export assets/originals/jet_model/export; done
```

| file | use | detail |
|---|---|---|
| `zf25_lod0.glb` | close (chase camera, the base, cinematics) | full mesh, maps 160 px/m |
| `zf25_lod1.glb` | middle distance | meshes decimated to 40%, maps 64 px/m |
| `zf25_lod2.glb` | far | 12%, maps 28 px/m, no cockpit inside, no small gear parts |

No subdivision is baked in: the game smooths by normals.

## Frame and units

- metres; glTF is **y up**: the nose points **+X**, the left wing **−Z**, up **+Y**
  (the model frame (x fwd, y left, z up) maps to glTF (x, z, −y))
- the origin is mid-length, at the belly's height (gear up)

## Nodes

Every part is its own named node. The ones that move have their origin on their hinge, its local X along the hinge
line (rotate about local X), with `extras` giving `hinge` (two points) and `limits_deg`:

- `aileron_l/r`, `flap_l/r`, `rudder_l/r`, `stab_l/r` (all-moving, pivot through the boom)
- `canopy_hinge` (an empty carrying the canopy glass and its frames; hinged at its back, opens 40°)
- the gear: leg groups, `oleo_*` sliders (stroke 0.3 m), doors; their open/closed angles in `../zf25_meta.json`

Hardpoints are empties named `hp_*` (`kind`: wing, cft, center, pod) at the store's attach point, pointing down.

## Materials

- painted parts: base colour + packed ORM (G roughness, B metal) + normal map, as glTF reads them
- glass: alpha blended (three.js r128 has no transmission), back faces culled
- the intakes' insides, the nozzles, frames, tyres, lights: plain materials

## The rest

`../zf25_meta.json`: the moving parts' hinges and limits, gear, oleos, canopy, hardpoints, the crew's eye points
(for a cockpit camera), the nozzles' exits (for the exhaust effects).

The shape follows the F-15E/EX: its published size (19.43 × 13.05 m, 5.63 m high on its wheels, 5.42 m wheelbase,
2.75 m track), its flight model's wing position, the NASA geometry of its tails, and the owner's photos.
