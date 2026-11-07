# Velmora building sprite prompt set

Generated with the built-in image generation tool. Each intact type was generated independently; each destroyed state used its own intact image as the edit target. Camera/proportion corrections were made with the same tool.

## Common intact specification

Use case: photorealistic-natural. Asset type: isolated game building sprite for Velmora.
A single building seen from DIRECTLY ABOVE, as in a sharp high-resolution satellite photograph: true orthographic nadir view, no perspective, no tilt, no side elevation, no vertical wall faces visible; only roofs, the top surfaces of parapets, roof fixtures and ground INSIDE the compound walls.
Arid mountain village, generic and neutral: walls and roofs of local grey-brown stone and sun-baked mud plaster, weathered, dusty, slightly irregular hand-built edges, small cracks and patches. High detail, sharply resolved stone and plaster textures, natural realism. No decoration, no painted patterns, no white window frames, no arches, no domes, no minarets, no flags, no signs, no text, no religious features.
Lighting: hard midday sun from the upper left; roof edges and parapets lit on their upper-left sides and shaded on their lower-right sides; small shadows from roof fixtures falling toward lower right strictly INSIDE the roof or enclosed courtyard only.
NO shadow cast onto the background or ground outside the outer building/compound outline. No terrain, vegetation, foundation platform or ground patch outside the outer walls.
The building is centered, its longest dimension occupies about 70% of frame width or height, with 15% clear margin on every side along that axis. Plan dimensions define footprint proportions; do not stretch it to a square.
Background: one flat perfectly solid pure magenta #FF00FF everywhere outside the building/compound walls, edge-to-edge, clean crisp cutout edge, no gradient, no glow, no reflection spill, absolutely no cast shadow on magenta.
Square 1:1, exactly 1024 x 1024 pixels, PNG. One isolated asset only. No labels or title, no text including filename.
CRITICAL CAMERA REQUIREMENT: The camera optical axis is exactly vertical 90 degrees to the roof. This is a 2D orthophoto roof footprint, NOT a three-quarter 3D object render. The external front/bottom wall face, exterior doors, vertical exterior masonry courses, side elevations, and fascia must not be visible. At every outer edge, only the horizontal top cap meets magenta directly; there is no visible strip of wall elevation below any roof edge. Make all opposite footprint edges parallel with no perspective convergence.

## Building specifications

### h1

A small one-storey stone house, 8 m x 6 m, flat earthen roof with a low parapet, one square roof hatch, a few stones and a rolled mat on the roof.

### h2

A two-storey stone house, 10 m x 8 m, flat roof with a parapet, a small stair-head room (3 m x 2.5 m) in one corner of the roof, a black plastic water tank, a satellite dish, a washing line. The storey count is metadata: the camera remains exactly vertical with no exterior wall faces visible.

### h3

A courtyard house, 16 m x 14 m: flat-roofed rooms along two sides in an L shape, a walled dirt courtyard filling the rest with a metal gate in the outer wall, one small tree and a water barrel in the yard.

### h4

A farm compound, 20 m x 16 m: a flat-roofed house on one side, a stone-walled animal pen with trampled dirt, a small shed with a rusty corrugated metal roof, hay bales.

### h5

A row of three attached one-storey village houses, 22 m x 7 m in total, each with its own flat roof at slightly different heights and parapets between them, roof hatches, a water tank on one. All three houses form one contiguous long narrow footprint.

### h6

A walled compound, 18 m x 18 m: a flat-roofed building on one side, a large open-sided vehicle shelter with a dusty corrugated metal roof on the other, an empty dirt yard with tyre tracks, a sliding metal gate.

### h7

A small storage building, 12 m x 8 m, with a dusty corrugated metal roof in long sheets, rust streaks, a few sheets weighted with stones, a lean-to on one side.

## Camera correction specification

Use case: precise-object-edit. This image is the EDIT TARGET. Correct ONLY the camera projection from its slightly tilted view into a strict 90-degree directly-down vertical satellite orthophoto. Keep every object in the same plan position, with the same size, proportions, materials, lighting and arrangement. The entire outside vertical wall elevation visible along the bottom edge must disappear behind the top cap. Every exterior wall must appear as a narrow horizontal TOP strip directly touching the magenta, with zero visible front or side wall face. For upper roof rooms, show only their flat roof, never their walls. All cylindrical tanks/barrels should be viewed as circular top discs without a visible cylindrical side. No perspective convergence. No entrance or gate front elevation. Keep the building footprint centered with empty pure #FF00FF magenta, no ground outside, no exterior shadow. Square 1024x1024 PNG. Photorealistic, sharp, not an illustration. NO extra objects or labels.

## Matching destroyed-state edit

Use case: precise-object-edit. Asset type: matching destroyed game building sprite.
The attached image is the sole EDIT TARGET: make the SAME building destroyed by an air strike, seen from exactly the same point directly above.
LOCK the image registration: same canvas dimensions, same camera projection (true vertical nadir, not angled), same footprint width and depth, same outer wall coordinates, same roof plan position, same orientation, same scale and center, no recrop, no zoom, no shifting. Keep surviving perimeter-wall corners precisely where they are in the intact image.
The roof has collapsed into the rooms, broken slabs, beams, masonry and rubble inside the original footprint; walls broken and uneven, dark scorch marks and soot, one burnt black impact hole. Small debris stones can spill a LITTLE outside walls onto magenta, at most a thin fringe; no surrounding dirt or crater ground. Keep outer outline recognisable.
Same upper-left midday lighting. Absolutely no cast shadow onto magenta outside the building. Background is perfectly flat solid pure magenta #FF00FF. No fire, no smoke, no people, no bodies, no weapons, no text. Preserve high-detail photoreal stone/mud/corrugated-metal textures, not cartoon.
View strictly 90 degrees straight down: no outside vertical wall elevation and no perspective. Square 1:1 PNG 1024x1024. One object only.
