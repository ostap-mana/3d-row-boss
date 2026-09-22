import { execFileSync, spawnSync } from "node:child_process";
import { resolve, dirname, basename, extname, join } from "node:path";
import { existsSync, mkdirSync, statSync } from "node:fs";

const USAGE = `
key-mask — the first-frame mask MatAnyone wants, keyed off the green screen.

  node tools/key-mask.mjs <video or png> [options]

  MatAnyone propagates a mask; it does not find one. The upstream answer is
  SAM2, which is a second model to install and a click to place. On a green
  screen it is not needed: the backdrop is flat, so a flood fill from the
  frame's own edge through everything that looks like backdrop leaves exactly
  the subject behind, holes closed, and that is a better mask than a click
  gives — a cloak in shadow is the same green as the backdrop and no threshold
  saves it, but the fill cannot reach it without crossing the figure.

  Backdrop is two things. Flat green, by hue and by a luma band around the
  frame's own border median. And backdrop with light on it: brighter than the
  backdrop in red and green, with blue left near where it was. That second
  test matters more than it sounds. Without it the fill stops at the glow
  around a gold star and every gap between the stars ships as subject, so
  MatAnyone is handed one blob where there are three stars and a hood, holds
  it, and the pack ships the trapped backdrop as an olive patch. With it the
  fill walks through the glow and the mask hugs each star.

  The mask is guidance, not the matte: MatAnyone dilates it by 10 and erodes
  it by 10 before it reads it, and refines every edge against the picture. So
  it is worth being strict here and generous nowhere.

  --frame <n>     which frame to key. Default 0. Mask the frame where
                  everything is on screen and still looks like itself.
  --tint <n>      green over the larger of red and blue, as a fraction of
                  green, at which a pixel is flat backdrop. Default 0.3.
  --band <lo:hi>  how far a flat-backdrop pixel may sit from the border median
                  in luma, as a pair of factors. Default 0.55:1.6.
  --halo <a:b>    how far the blue channel may sit above the backdrop's own
                  blue, and how far below, for a brighter pixel to be backdrop
                  under gold light rather than something gold. Default 12:26.
                  A gold star takes blue down with it by three times this.
  --out <file>    default: <name>-mask.png beside the source.

  node tools/key-mask.mjs work/defeat30.mp4 --out work/defeat-mask.png
`;

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(args.length === 0 ? 1 : 0);
}

const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const input = resolve(args[0]);
if (!existsSync(input)) {
  process.stderr.write(`no such file: ${input}\n`);
  process.exit(1);
}

const frame = Math.max(0, Math.round(Number(flag("frame", 0))));
const tintCut = Number(flag("tint", 0.3));
const band = String(flag("band", "0.55:1.6")).split(":").map(Number);
const halo = String(flag("halo", "12:26")).split(":").map(Number);
const out = resolve(
  flag(
    "out",
    join(
      dirname(input),
      `${basename(input, extname(input)).replace(/[^a-z0-9]+/gi, "-")}-mask.png`,
    ),
  ),
);

const probe = execFileSync(
  "ffprobe",
  [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    input,
  ],
  { encoding: "utf8" },
).trim();
const [w, h] = probe.split(",").map(Number);

const buf = execFileSync(
  "ffmpeg",
  [
    "-v",
    "error",
    "-i",
    input,
    "-vf",
    `select='eq(n\\,${frame})'`,
    "-vsync",
    "0",
    "-frames:v",
    "1",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-",
  ],
  { maxBuffer: 1 << 28 },
);

const px = w * h;
if (buf.length < px * 3) {
  process.stderr.write(`frame ${frame} is not in ${basename(input)}\n`);
  process.exit(1);
}

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

const edge = Math.max(4, Math.round(Math.min(w, h) * 0.0125));
const ch = [[], [], []];
for (let y = 0; y < h; y++) {
  const rim = y < edge || y >= h - edge;
  for (let x = 0; x < w; x++) {
    if (!rim && x >= edge && x < w - edge) {
      x = w - edge - 1;
      continue;
    }
    const j = (y * w + x) * 3;
    ch[0].push(buf[j]);
    ch[1].push(buf[j + 1]);
    ch[2].push(buf[j + 2]);
  }
}
const bg = ch.map((a) => {
  a.sort((p, q) => p - q);
  return a[a.length >> 1];
});
const bgLuma = luma(bg[0], bg[1], bg[2]);
const lo = bgLuma * band[0];
const hi = bgLuma * band[1];

const open = new Uint8Array(px);
for (let i = 0; i < px; i++) {
  const j = i * 3;
  const r = buf[j];
  const g = buf[j + 1];
  const b = buf[j + 2];
  const rest = r > b ? r : b;
  const tint = g > 0 ? (g - rest) / g : -1;
  const lum = luma(r, g, b);
  const flat = tint > tintCut && lum > lo && lum < hi;
  const under = b - bg[2];
  const lit = r > bg[0] && g > bg[1] && under < halo[0] && under > -halo[1];
  open[i] = flat || lit ? 1 : 0;
}

const reached = new Uint8Array(px);
const stack = new Int32Array(px);
let top = 0;
const push = (i) => {
  if (open[i] && !reached[i]) {
    reached[i] = 1;
    stack[top++] = i;
  }
};
for (let x = 0; x < w; x++) {
  push(x);
  push((h - 1) * w + x);
}
for (let y = 0; y < h; y++) {
  push(y * w);
  push(y * w + w - 1);
}
while (top > 0) {
  const i = stack[--top];
  const x = i % w;
  if (x > 0) push(i - 1);
  if (x < w - 1) push(i + 1);
  if (i >= w) push(i - w);
  if (i < px - w) push(i + w);
}

const mask = Buffer.alloc(px);
let kept = 0;
for (let i = 0; i < px; i++) {
  const on = reached[i] ? 0 : 255;
  mask[i] = on;
  if (on) kept++;
}

mkdirSync(dirname(out), { recursive: true });
const done = spawnSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "-s",
    `${w}x${h}`,
    "-i",
    "-",
    "-frames:v",
    "1",
    out,
  ],
  { input: mask },
);
if (done.status !== 0) {
  process.stderr.write(done.stderr?.toString() || "mask failed\n");
  process.exit(1);
}

process.stdout.write(
  `${basename(input)}  frame ${frame}  ${w}x${h}  backdrop ${bg.join(",")}  ` +
    `subject ${((100 * kept) / px).toFixed(1)}%  ` +
    `${(statSync(out).size / 1024).toFixed(1)} kB\n${out}\n`,
);
