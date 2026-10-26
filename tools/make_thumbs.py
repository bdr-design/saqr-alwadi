"""Map thumbnails for the main menu: each map's level-0 tiles put together, cut to 16:9 around the middle of the map
and made small (sprites/map_<id>.jpg, 480 x 270).

  python3 tools/make_thumbs.py
"""
import json, pathlib
from PIL import Image

root = pathlib.Path(__file__).resolve().parent.parent
maps = {'valley': root / 'tiles'}
for d in sorted((root / 'maps').iterdir()):
    if (d / 'tiles' / '0').is_dir():
        maps[d.name] = d / 'tiles'
W, H = 480, 270
for mid, tiles in maps.items():
    files = sorted((tiles / '0').glob('*_*.jpg'))
    xs = [int(f.stem.split('_')[0]) for f in files]; ys = [int(f.stem.split('_')[1]) for f in files]
    full = Image.new('RGB', ((max(xs) + 1) * 1024, (max(ys) + 1) * 1024))
    for f, x, y in zip(files, xs, ys):
        full.paste(Image.open(f).convert('RGB'), (x * 1024, y * 1024))
    bbox = full.getbbox() or (0, 0, *full.size)          # the tiles' black padding past the map's edge is cut off
    full = full.crop(bbox)
    fw, fh = full.size
    cw, ch = (fw, round(fw * H / W)) if fw / fh < W / H else (round(fh * W / H), fh)
    cw, ch = min(cw, fw), min(ch, fh)
    x0, y0 = (fw - cw) // 2, (fh - ch) // 2
    out = full.crop((x0, y0, x0 + cw, y0 + ch)).resize((W, H), Image.LANCZOS)
    path = root / 'sprites' / f'map_{mid}.jpg'
    out.save(path, quality=78, optimize=True, progressive=True)
    print(path.relative_to(root), out.size, path.stat().st_size // 1024, 'KB')
