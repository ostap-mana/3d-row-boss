import argparse
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
FLAT_DIR = os.path.join(ROOT, "masters", "gems")
ORB = os.path.join(ROOT, "masters", "gems", "orb", "sphere.png")
OUT_DIR = os.path.join(ROOT, "src", "assets", "gems")

GEMS = ["fire", "water", "nature", "lightning", "arcane", "wind"]

USAGE = """
pack-gems — give the board gems the volume the flat masks never had.

  python tools/pack-gems.py [--shade 0.85] [--spec 0.55] [--size 128]

  The element glyphs ship in the Invokers build as a white alpha mask, so the
  gems the playable inherited are a flat disc with a symbol punched out of it:
  no bevel, no rim, no highlight. The same build paints real glass spheres for
  its summon orbs, and those carry exactly the light the gems are missing.

  This lifts the sphere's shading and its specular, and lays them over each
  flat gem. The glyph and the element hue are untouched, so nothing about
  which gem is which can drift; only the light changes.

  Twenty-five gems also fill more than half the board, and at full saturation
  they sat level with the painted arena so nothing could come forward. They
  are pulled back here in the same pass.

  --shade <n>  how much of the sphere's modelling to apply. 0 keeps flat.
  --spec <n>   how much of the sphere's highlight to add on top.
  --sat <n>    1 keeps the master's colour, 0.87 takes 13% out.
  --size <n>   output edge in pixels.
"""


def load_rgba(path):
    return np.asarray(Image.open(path).convert("RGBA"), dtype=np.float32) / 255.0


def luminance(rgb):
    return rgb[..., 0] * 0.2126 + rgb[..., 1] * 0.7152 + rgb[..., 2] * 0.0722


def sphere_fields(size, blur):
    img = Image.open(ORB).convert("RGBA").resize((size, size), Image.LANCZOS)
    arr = np.asarray(img, dtype=np.float32) / 255.0
    alpha = arr[..., 3]
    lum = luminance(arr[..., :3])

    inside = alpha > 0.6
    if not inside.any():
        raise SystemExit("orb master has no opaque body")

    mid = float(np.median(lum[inside]))
    shade = np.where(inside, lum / max(mid, 1e-3), 1.0)
    shade = np.clip(shade, 0.35, 1.9)
    shade = np.asarray(
        Image.fromarray((np.clip(shade, 0.0, 2.0) * 127.5).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(size / 13.0)
        ),
        dtype=np.float32,
    ) / 127.5

    hot = np.clip((lum - 0.82) / 0.18, 0.0, 1.0) * inside
    spec = np.asarray(
        Image.fromarray((hot * 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(blur)
        ),
        dtype=np.float32,
    ) / 255.0

    return shade, spec


def main():
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("--shade", type=float, default=0.8)
    ap.add_argument("--spec", type=float, default=0.34)
    ap.add_argument("--sat", type=float, default=0.87)
    ap.add_argument("--size", type=int, default=128)
    ap.add_argument("--help", action="store_true")
    args = ap.parse_args()

    if args.help:
        sys.stdout.write(USAGE)
        return

    shade, spec = sphere_fields(args.size, max(1.0, args.size / 96.0))

    for name in GEMS:
        src = os.path.join(FLAT_DIR, f"{name}.webp")
        if not os.path.exists(src):
            sys.stderr.write(f"no master: {src}\n")
            raise SystemExit(1)

        flat = Image.open(src).convert("RGBA").resize(
            (args.size, args.size), Image.LANCZOS
        )
        arr = np.asarray(flat, dtype=np.float32) / 255.0
        rgb = arr[..., :3]
        alpha = arr[..., 3]

        grey = luminance(rgb)[..., None]
        toned = np.clip(grey + (rgb - grey) * args.sat, 0.0, 1.0)

        lit = toned * (1.0 + (shade[..., None] - 1.0) * args.shade)
        lit = lit + spec[..., None] * args.spec * alpha[..., None]
        lit = np.clip(lit, 0.0, 1.0)

        out = np.concatenate([lit, alpha[..., None]], axis=-1)
        img = Image.fromarray((out * 255).round().astype(np.uint8), mode="RGBA")
        dst = os.path.join(OUT_DIR, f"{name}.webp")
        img.save(dst, "WEBP", quality=88, method=6)
        sys.stdout.write(f"{name.ljust(10)} {os.path.getsize(dst) / 1024:.1f} kB\n")


main()
