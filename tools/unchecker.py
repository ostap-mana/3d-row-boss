import sys

import numpy as np
from PIL import Image

USAGE = """
unchecker — recover a transparent PNG from a screenshot of one.

  python tools/unchecker.py --src <screenshot.png> --out <art.png>

  Art arrives as a screenshot of a transparent PNG often enough that keying the
  checkerboard by threshold has been tried and it flattens every soft edge. The
  backdrop here is known exactly instead: two greys on a square grid, so the
  pitch, origin and parity are fitted off the border strips and every pixel gets
  its own backdrop value.

  A cell of one phase and its neighbours of the other differ by
  (1 - alpha) * (light - dark), which gives alpha per cell without touching the
  art's own detail; the unmultiply then runs per pixel. What survives that is
  suppressed by colour: the checker is neutral and dim, the art is saturated or
  bright, so a neutral dim residue goes to black.

  Writes <out> as straight RGBA and <out>-onblack.png premultiplied, which is
  what an additive FX packer reads.

  --sat s     saturation a pixel needs to be kept. Default 11.
  --lift l    luma that keeps a desaturated pixel anyway. Default 105.
"""

args = sys.argv[1:]
if "--help" in args or not args:
    sys.stdout.write(USAGE)
    raise SystemExit(0)


def arg(name, fallback=None):
    i = args.index(name) if name in args else -1
    return args[i + 1] if i >= 0 and i + 1 < len(args) else fallback


SRC = arg("--src")
DST = arg("--out")
SAT = float(arg("--sat", 11.0))
LIFT = float(arg("--lift", 105.0))

if not SRC or not DST:
    sys.stderr.write("unchecker: need --src and --out\n")
    raise SystemExit(1)

a = np.asarray(Image.open(SRC).convert("RGB")).astype(np.float64)
H, W, _ = a.shape
lum = a.mean(axis=2)

border = np.concatenate(
    [lum[0:6, :].ravel(), lum[-6:, :].ravel(), lum[:, 0:6].ravel(), lum[:, -6:].ravel()]
)
neutral = border[(border > 40) & (border < 130)]
dark = float(np.percentile(neutral, 20))
light = float(np.percentile(neutral, 80))
mid = (dark + light) / 2.0


def transitions(profile):
    out = []
    for i in range(1, len(profile)):
        p0, p1 = profile[i - 1], profile[i]
        if (p0 - mid) * (p1 - mid) < 0 and abs(p1 - p0) > 8:
            out.append(i - 1 + (mid - p0) / (p1 - p0))
    return np.array(out)


def circular_origin(ts, pitch):
    ang = 2 * np.pi * (ts % pitch) / pitch
    m = np.arctan2(np.sin(ang).mean(), np.cos(ang).mean())
    return (m / (2 * np.pi)) * pitch % pitch


strip_top = lum[0:6, :].mean(axis=0)
t_top = transitions(strip_top)
gaps = np.diff(t_top)
usable = gaps[(gaps > 6) & (gaps < 40)]
if usable.size < 3:
    sys.stderr.write("unchecker: no checkerboard along the top edge\n")
    raise SystemExit(1)
pitch = float(np.median(usable))
x0 = circular_origin(t_top, pitch)

first = t_top[t_top > pitch]
strip_left = lum[:, int(first[0]) + 3 : int(first[1]) - 2].mean(axis=1)
y0 = circular_origin(transitions(strip_left), pitch)

xs = np.arange(W, dtype=np.float64)
ys = np.arange(H, dtype=np.float64)
u = (xs - x0) / pitch
v = (ys - y0) / pitch
ui = np.floor(u).astype(np.int64)
vi = np.floor(v).astype(np.int64)
parity = (ui[None, :] + vi[:, None]) & 1

p0 = lum[0:6, :][parity[0:6, :] == 0].mean()
p1 = lum[0:6, :][parity[0:6, :] == 1].mean()
is_light = parity == (0 if p0 > p1 else 1)

fx = u - np.floor(u)
fy = v - np.floor(v)
edge = np.minimum(
    np.minimum(fx, 1 - fx)[None, :] * pitch, np.minimum(fy, 1 - fy)[:, None] * pitch
)
soft = np.clip(edge / 0.7, 0, 1)
checker = np.where(is_light, light, dark) * (0.5 + 0.5 * soft) + np.where(
    is_light, dark, light
) * (0.5 - 0.5 * soft)

cu = (ui - ui.min())[None, :].repeat(H, 0)
cv = (vi - vi.min())[:, None].repeat(W, 1)
nu = int(cu.max()) + 1
nv = int(cv.max()) + 1
inner = soft > 0.9


def cell_mean(mask):
    s = np.zeros((nv, nu))
    c = np.zeros((nv, nu))
    np.add.at(s, (cv[mask], cu[mask]), lum[mask])
    np.add.at(c, (cv[mask], cu[mask]), 1.0)
    return np.where(c > 4, s / np.maximum(c, 1), np.nan)


def fill(m):
    out = m.copy()
    for _ in range(4):
        pad = np.pad(out, 1, constant_values=np.nan)
        stack = np.stack(
            [pad[0:-2, 1:-1], pad[2:, 1:-1], pad[1:-1, 0:-2], pad[1:-1, 2:]]
        )
        with np.errstate(invalid="ignore"):
            out = np.where(np.isnan(out), np.nanmean(stack, axis=0), out)
    return np.nan_to_num(out, nan=float(np.nanmean(m)))


la = fill(cell_mean(inner & is_light))
lb = fill(cell_mean(inner & ~is_light))
beta = np.clip((la - lb) / (light - dark), 0.0, 1.0)
pad = np.pad(beta, 1, mode="edge")
beta = (pad[0:-2, 1:-1] + pad[2:, 1:-1] + pad[1:-1, 0:-2] + pad[1:-1, 2:] + 2 * beta) / 6
bpx = beta[cv, cu]

out = np.clip(a - (bpx * checker)[:, :, None], 0, 255)

plain = (a.max(axis=2) - a.min(axis=2) <= 9) & (lum > dark - 9) & (lum < light + 9)
out = out * (~plain)[:, :, None]

sat = out.max(axis=2) - out.min(axis=2)
keep = np.clip(
    np.maximum((sat - SAT) / 16.0, (out.mean(axis=2) - LIFT) / 45.0), 0.0, 1.0
)
out = out * keep[:, :, None]
alpha = np.clip((1.0 - bpx) * keep * (~plain), 0, 1)

rgba = np.zeros((H, W, 4), dtype=np.uint8)
rgba[:, :, :3] = (
    np.where(alpha[:, :, None] > 0.004, out / np.maximum(alpha, 0.004)[:, :, None], 0)
    .clip(0, 255)
    .astype(np.uint8)
)
rgba[:, :, 3] = (alpha * 255).astype(np.uint8)
Image.fromarray(rgba, "RGBA").save(DST)
Image.fromarray(out.astype(np.uint8), "RGB").save(DST.replace(".png", "-onblack.png"))

sys.stdout.write(
    f"unchecker {W}x{H}  pitch {pitch:.2f}  greys {dark:.0f}/{light:.0f}  "
    f"opaque {float((alpha > 0.95).mean()):.3f}  clear {float((alpha < 0.05).mean()):.3f}\n"
)
