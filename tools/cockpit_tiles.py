"""The F-15 cockpit photos in four overlapping tiles each, and the prompt for each, for the owner to regenerate at 2x
(docs/ASSETS.md, «القمرة»: the photos are 1672 x 941 and are drawn some 1.7x larger on an iPhone).

  python3 tools/cockpit_tiles.py      # build/cockpit_tiles/{day,night}_{1..4}.png and .txt

Tiles: 940 x 529 of the original (16:9), two by two, overlapping 208 px across and 117 px down; each upscaled 2x
(Lanczos) so the generator keeps the size. 1 top left, 2 top right, 3 bottom left, 4 bottom right; their corners in the
original are TILES. Each prompt: the shared rules, the tile's own contents (where the magenta and green areas are, in
per cent of the tile), and day or night light. These are the prompts the owner was given.

Not written yet: putting the regenerated tiles back together (each found on the original by SIFT then ECC, blended over
the overlaps, the low frequencies from the original as in make_region.py's mosaic()), into a 3344 x 1882 photo for
make_cockpit.py.
"""
import os
import cv2

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'originals', 'cockpit')
OUT = os.path.join(ROOT, 'build', 'cockpit_tiles')
W, H = 940, 529
TILES = {1: (0, 0), 2: (732, 0), 3: (0, 412), 4: (732, 412)}

CROP = {
    1: 'the top-left quarter of the full cockpit image. Flat magenta fills the upper-left two thirds (where the sky is), bounded by the left canopy rail, which runs as a straight diagonal from the bottom-left corner up to the right edge at about 24% of the height. Upper right: the canopy frame arch, and the front ejection seat headrest with two small pointed "horns" on top and a rectangular handle above it; magenta also shows through the arch between the arch and the headrest. Lower right: the top of the instrument panel with a row of knobs and switches, one small flat green rectangle (x 82-94%, y 75-87%), and the top edge of the large flat green display along the bottom (x 66-100%, y 93-100%).',
    2: 'the top-right quarter of the full cockpit image. Flat magenta fills the upper-right two thirds (where the sky is), bounded by the right canopy rail, which runs as a straight diagonal from the bottom-right corner up to the left edge at about 25% of the height. Upper left: the front ejection seat headrest with two small pointed "horns" on top and a rectangular handle above it, and the canopy frame arch curving to the right; magenta also shows through the arch. Lower left: the top of the instrument panel with one small flat green rectangle (x 4-16%, y 75-87%), a keypad of 4 x 4 square keys, two round knobs and a rotary selector, and the top edge of the large flat green display along the bottom (x 0-34%, y 93-100%).',
    3: 'the bottom-left quarter of the full cockpit image. Only a small flat magenta triangle in the top-left corner (along the top edge to about x 40%, and down the left edge to about y 29%), above the left canopy rail. Left: the left side console with the throttle grip (a red button on top), rows of knobs and toggle switches, a red guarded switch, and two small yellow-and-black handles; a hydraulic strut rises diagonally behind it. Right: the left part of the large flat green display (x 66-100%, y 15-52%) in a thick black bezel with screws, and the bottom of the small flat green display at the top (x 82-94%, y 0-9%). Bottom right: a rudder pedal, and the centre control stick grip with a red button. Bottom centre: the top edge of the seat cushion.',
    4: 'the bottom-right quarter of the full cockpit image. Only a small flat magenta triangle in the top-right corner (along the top edge from about x 58%, and down the right edge to about y 30%), above the right canopy rail. Left: the right part of the large flat green display (x 0-34%, y 15-52%) in a thick black bezel with screws, and the bottom of the small flat green display at the top (x 4-16%, y 0-9%). Bottom left: the centre control stick grip with a red button, and a rudder pedal. Right: the right side console with a keypad and many knobs, the right side-stick grip (a red button on top), and a hydraulic strut rising diagonally. Bottom centre: the top edge of the seat cushion.',
}


def prompt(k, night):
    n = night
    mats = ['Panels and consoles: matte dark grey painted aluminium (aviation grey), lightly worn on the edges, ' + ('' if n else 'a few real scuffs, ') + 'very fine paint texture.',
            'Knobs: black anodised metal with fine knurling. Toggle switches: chrome bat handles with metal guards.' + (' Keypad keys: square, dark grey, with crisp edges' + (' and green backlit markings.' if n else '.') if k in (2, 4) else '')]
    if k in (3, 4): mats.append('Grips and sticks: black hard rubber with a fine stipple texture and moulded finger grooves; red and grey buttons with clean, crisp edges.')
    if k in (1, 2): mats += ['Ejection seat headrest: dark olive and dark grey fabric and metal, with visible stitching.',
                             'Canopy frame arch: dark grey painted metal with a row of evenly spaced screws.']
    if k in (3, 4): mats += ['Rudder pedal: brushed steel with horizontal anti-slip ribs.',
                             'Small yellow-and-black handles stay where they are, with the same colours.']
    light = (['Like a professional full-frame DSLR photo: 35 mm lens, f/8, on a tripod with a long exposure, clean with no noise. Tack sharp from front to back, deep depth of field, in focus everywhere.',
              'Exactly the same night lighting as the input: a dark cockpit, the soft green backlighting on the panel legends, keys and knobs in the same places and at the same brightness, the same dark shadows. Do not brighten the image and add no light sources.',
              'Crisp micro detail at 100% zoom where light falls: screw slots, knurling, button edges, panel seams.'] if n else
             ['Like a professional full-frame DSLR photo: 35 mm lens, f/8, ISO 100, on a tripod. Tack sharp from front to back, deep depth of field, in focus everywhere.',
              'The same light as the input: soft daylight from above through the canopy, the same shadows, the same exposure and contrast, neutral white balance.',
              'Crisp micro detail at 100% zoom: individual screw slots, knurling, button edges, panel seams.'])
    li = lambda xs: '\n'.join('- ' + x for x in xs)
    # (the first round came back as the same picture upscaled and smoothed: no finer detail than a Lanczos 2x, the
    # dots still there; so the task now asks for the surfaces redrawn, not the picture enlarged)
    return f"""TASK: Re-render the attached image as a brand-new, ultra-detailed 4K photograph of exactly the same scene. The attached image is a soft, low-resolution, AI-painted crop. Do NOT just upscale, denoise or smooth it: that is not enough. Redraw every surface with new, real photographic micro-detail, as if the same scene were re-shot with a high-resolution camera.

SUBJECT: A crop of a {'night' if n else 'daylight'} photograph taken from the rear seat (weapons officer seat) of an F-15 fighter jet, looking forward over the front seat.{' The cockpit is dark, lit only by soft green panel backlighting.' if n else ''}

THIS CROP: {CROP[k]}

GEOMETRY (must match the input exactly):
- Same framing, camera position, lens and perspective. Do not crop, zoom, pan, rotate, mirror or extend the image.
- Every object keeps its exact position, outline, size and count: every knob, button, switch, switch guard, rivet, screw, panel seam, cable, handle and grip. Do not add, remove, merge, move or redesign anything.
- Straight lines stay straight. Panel edges and display bezels stay perfectly rectangular.

CHROMA KEY AREAS (must stay untouched):
- Every flat magenta area stays 100% flat pure #FF00FF (RGB 255,0,255): no texture, gradient, noise, sky, {'stars, ' if n else ''}clouds, glass, reflection or vignette.
- Every flat green area stays 100% flat pure #00FF00 (RGB 0,255,0): no screen content, glare, reflection, scanlines or texture.
- Their borders stay in exactly the same place, razor sharp: no blur, no halo, no coloured fringe, no magenta or green tint {'or glow ' if n else ''}on the metal next to them.
- {'No magenta anywhere else. The green panel backlighting stays much dimmer and darker than the pure #00FF00 areas.' if n else 'No magenta and no pure green anywhere else in the image.'}

CLEAN-UP (fix these defects of the input):
- Remove all the scattered tiny orange, gold, yellow and pink dots and speckles that cover the metal surfaces. They are artifacts, not details. Keep the real rivets and screw heads, which sit in regular rows along panel edges{', and keep the real green backlit legends and key markings' if n else ''}.
- Remove the crackle, craquelure and random vein patterns on the grips, the seat and the panels; replace them with the realistic materials below.
- No noise, film grain, JPEG blocks, banding, oversharpening halos or smeared "AI painting" texture.

MATERIALS (photorealistic):
{li(mats)}

PHOTO QUALITY:
{li(light)}

DO NOT add: any text, labels, numbers, logos, watermarks, people, hands, sky, {'stars' if n else 'clouds'}, scenery, glass reflections or lens flares.

OUTPUT: 16:9, 4K (3840 x 2160), PNG. More fine detail than the input everywhere, never less.
"""


def main():
    os.makedirs(OUT, exist_ok=True)
    for name in ('day', 'night'):
        im = cv2.imread(os.path.join(SRC, f'f15ex_{name}.png'))
        for k, (x, y) in TILES.items():
            cv2.imwrite(os.path.join(OUT, f'{name}_{k}.png'), cv2.resize(im[y:y + H, x:x + W], (2 * W, 2 * H), interpolation=cv2.INTER_LANCZOS4))
            open(os.path.join(OUT, f'{name}_{k}.txt'), 'w').write(prompt(k, name == 'night'))
    print('build/cockpit_tiles: 8 tiles and their prompts')


if __name__ == '__main__':
    main()
