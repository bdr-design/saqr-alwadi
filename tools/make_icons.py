"""The app's icons from the owner's two pictures (assets/originals/icons): the Apple one (1024, no transparency) for the
iOS app, the Google Play one (512) for the Play listing and the Android launcher.

  iOS       ios/SaqrAlwadi/Assets.xcassets/AppIcon.appiconset/icon.png   1024 (Xcode makes the other sizes; iOS rounds it)
  Play      store/graphics/icon-512.png                                  512 as delivered (Play rounds it)
  Android   mipmap-*/ic_launcher.png      the older launchers' square icon, 48 to 192 px
            mipmap-*/ic_launcher_bg.png   Android 8 and up (mipmap-anydpi-v26/ic_launcher.xml): a 108 dp layer the
                                          launcher masks to its own shape, showing the middle 72 dp. The picture at
                                          90 dp in the middle (so some 80% of it shows inside the mask, its two
                                          aircraft and the name with it), the edge the mask cuts away filled with the
                                          same picture enlarged and blurred: nothing drawn, all the owner's picture.

  python3 tools/make_icons.py
"""
import pathlib
from PIL import Image, ImageFilter

root = pathlib.Path(__file__).resolve().parent.parent
src = root / 'assets' / 'originals' / 'icons'
apple = Image.open(src / 'Saqr-AlWadi-Apple-1024.png').convert('RGB')
play = Image.open(src / 'Saqr-AlWadi-GooglePlay-512.png').convert('RGBA')

apple.save(root / 'ios' / 'SaqrAlwadi' / 'Assets.xcassets' / 'AppIcon.appiconset' / 'icon.png', optimize=True)
play.save(root / 'store' / 'graphics' / 'icon-512.png', optimize=True)

res = root / 'android' / 'app' / 'src' / 'main' / 'res'
# (the larger source, the Apple one, for the launcher: the same picture)
for dpi, k in (('mdpi', 1), ('hdpi', 1.5), ('xhdpi', 2), ('xxhdpi', 3), ('xxxhdpi', 4)):
    d = res / ('mipmap-' + dpi)
    apple.resize((round(48 * k),) * 2, Image.LANCZOS).save(d / 'ic_launcher.png', optimize=True)
    n, inner = round(108 * k), round(90 * k)
    bg = apple.resize((n, n), Image.LANCZOS).resize((n * 2, n * 2), Image.LANCZOS).crop((n // 2, n // 2, n // 2 + n, n // 2 + n))
    bg = bg.filter(ImageFilter.GaussianBlur(n / 40))
    bg.paste(apple.resize((inner, inner), Image.LANCZOS), ((n - inner) // 2, (n - inner) // 2))
    bg.save(d / 'ic_launcher_bg.png', optimize=True)
print('icons written')
