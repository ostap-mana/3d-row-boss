import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy.ndimage import (
    binary_closing,
    binary_fill_holes,
    gaussian_filter,
    label,
)

USAGE = """
cut-plate-alpha — give an additive plate the alpha it needs to blend normally.

  python tools/cut-plate-alpha.py <sheet.webp> [--cols 5] [--rows 2]
                                  [--floor 0.055] [--quality 86] [--strip]

  The build's burst sheets come out fully opaque: black background, black rock,
  black everywhere the flame is not. Drawn additively the black vanishes, and so
  does the rock with it, so the burst reads as an orange wash over the board
  instead of an explosion with weight in it.

  This cuts each cell's alpha in two parts. Alpha follows luminance, so the
  petal tips keep their soft falloff, and then the small dark islands the flame
  encloses are made opaque, which is what puts the rock back: rock is black like
  the background, and only being enclosed by the flame tells them apart. The
  burst's own hollow centre is far bigger than any chunk, so --hole leaves it
  clear and the board keeps showing through it, as it does in the reference.

  --strip also writes a PNG next to the webp, to look at.
"""

if "--help" in sys.argv:
    print(USAGE)
    raise SystemExit(0)

args = sys.argv[1:]
if not args:
    print(USAGE)
    raise SystemExit(1)


def opt(name, fallback, cast=float):
    if name in args:
        return cast(args[args.index(name) + 1])
    return fallback


SRC = Path(args[0])
COLS = opt("--cols", 5, int)
ROWS = opt("--rows", 2, int)
FLOOR = opt("--floor", 0.055)
QUALITY = opt("--quality", 86, int)
STRIP = "--strip" in args
CLOSE = opt("--close", 5, int)
FEATHER = opt("--feather", 1.1)
KEEP = opt("--keep", 0.02)
HOLE = opt("--hole", 0.012)

sheet = Image.open(SRC).convert("RGBA")
rgb = np.asarray(sheet, dtype=np.float32)[..., :3] / 255.0

cw = sheet.width // COLS
ch = sheet.height // ROWS
alpha = np.zeros((sheet.height, sheet.width), dtype=np.float32)

struct = np.ones((CLOSE, CLOSE), dtype=bool)

for r in range(ROWS):
    for c in range(COLS):
        y0, y1 = r * ch, (r + 1) * ch
        x0, x1 = c * cw, (c + 1) * cw
        cell = rgb[y0:y1, x0:x1]

        lum = cell.max(axis=2)
        lit = lum > FLOOR
        if not lit.any():
            continue

        marks, count = label(lit)
        if count > 1:
            sizes = np.bincount(marks.ravel())
            sizes[0] = 0
            biggest = sizes.argmax()
            keep = sizes >= max(1, sizes[biggest] * KEEP)
            lit = keep[marks]

        closed = binary_closing(lit, structure=struct)
        holes = binary_fill_holes(closed) & ~closed
        marks, count = label(holes)
        rock = np.zeros_like(holes)
        if count:
            sizes = np.bincount(marks.ravel())
            sizes[0] = 0
            small = sizes <= HOLE * lit.size
            rock = small[marks] & holes

        soft = np.clip((lum - FLOOR) / (0.34 - FLOOR), 0.0, 1.0)
        a = np.where(closed | rock, 1.0, soft)
        if FEATHER > 0:
            a = gaussian_filter(a, FEATHER)
        alpha[y0:y1, x0:x1] = np.clip(a, 0.0, 1.0)

out = np.asarray(sheet).copy()
out[..., 3] = np.round(alpha * 255).astype(np.uint8)
cut = Image.fromarray(out, "RGBA")

cut.save(SRC, "WEBP", quality=QUALITY, method=6, exact=True)
if STRIP:
    cut.save(SRC.with_suffix(".png"), "PNG")

covered = float((alpha > 0.5).mean())
clear = float((alpha < 0.02).mean())
print(f"{SRC.name}: {sheet.width}x{sheet.height} {COLS}x{ROWS}")
print(f"  opaque {covered * 100:.1f}%   clear {clear * 100:.1f}%")
print(f"  {SRC.stat().st_size / 1024:.1f} kB")
