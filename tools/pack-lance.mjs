import { execFileSync } from "node:child_process";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, statSync } from "node:fs";

const USAGE = `
pack-lance — a moving lance, cut off a green-screen clip into one strip.

  node tools/pack-lance.mjs <id> [options]

  --clip <file>     default masters/fx/clips/<id>-bolt.mp4
  --out <file>      default src/assets/fx/<id>-lance.webp
  --frames <n>      how many frames land on the strip. Default 8.
  --at <n>          source frame the sampling starts on. Default 30.
  --step <n>        source frames between two samples. Default 4.
  --width <px>      one frame's width on the strip. Default 448.
  --cut <n>         greenness at which the backdrop starts, 0..1. Default 0.02.
  --ramp <n>        how far past that it becomes solid. Default 0.07.
  --despill <n>     how hard green is pulled out of what survives. Default 1.
  --lift <n>        green a survivor may keep over its own red and blue. Water
                    is legitimately teal, so this cannot go negative without
                    draining the effect. Default 0.
  --floor <n>       levels taken off every channel after the key, so its
                    leftovers land on zero rather than on a grey wash.
                    Default 18.
  --gain <n>        multiplies what is left. Default 1.
  --pad <px>        kept around the measured content box. Default 10.
  --fade <px>       how far the tail end is ramped to black, in source pixels.
                    The comet is longer than the frame it was generated in, so
                    its tail is cut off square by the frame edge; on the add
                    blend that cut is a lit rectangle with a hard side, and this
                    is what turns it back into a tail. Default 140.
  --quality <n>     webp quality. Default 74.
  --keep-heading    do not mirror.
  --contact         also write a PNG of the strip.

  The still version of this is tools/pack-bolt.mjs and it is the right tool for
  a drawing. This one is for a clip, and it exists because a lance holding one
  frame for the whole of its flight is a decal being moved across the screen:
  the water bolt was generated as a loop with the ribbons turning inside it, and
  that turning is the difference between light that is travelling and a picture
  that is sliding.

  **One strip, not a grid.** Every frame is the same lance at the same size, so
  the cells only ever need walking left to right and the count falls out of the
  image's own width over its height ratio. No rows, no pitch, no contract to
  keep in step with a second file.

  **Nothing loads a strip today.** art/bolts.js used to slice one, and does not
  any more: every element's ult now flies the one white plate in
  src/assets/fx/ult-bolt.webp under its own tint. A strip packed here needs the
  frame walk put back into that module before it will play.

  **The content box is measured once, across every sampled frame, and after the
  key.** Per-frame boxes would breathe: a spark thrown off frame 3 widens that
  cell alone, and the lance then jitters against its own cell edge as it plays.
  The box is the union of all of them, so the lance sits still and only what is
  painted inside it moves.

  **Keyed here, in JS, on raw RGBA**, with the same arithmetic as
  tools/pack-water-ult.mjs — read its header for why teal off a green screen
  needs --lift, and what --floor is protecting. Nothing comes out with an alpha
  channel: these play on the add blend, where black already is transparency.

  Mirrored by default, and each cell is mirrored in place rather than the strip
  being flipped, which would also reverse the order the frames play in. The
  reason for mirroring at all is the one tools/pack-bolt.mjs gives at length:
  the art is drawn head-left and Vfx.ultCast throws it head-first.
`;

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(args.length === 0 ? 1 : 0);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const id = args.find((a) => !a.startsWith("--"));
if (!id) {
  console.error("pack-lance: an id is required, e.g. `water`.");
  process.exit(1);
}

const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const num = (name, fallback) => Number(opt(name, fallback));

const CLIP = resolve(ROOT, opt("clip", `masters/fx/clips/${id}-bolt.mp4`));
const OUT = resolve(ROOT, opt("out", `src/assets/fx/${id}-lance.webp`));
const COUNT = num("frames", 8);
const AT = num("at", 30);
const STEP = num("step", 4);
const WIDTH = num("width", 448);
const CUT = num("cut", 0.02);
const RAMP = num("ramp", 0.07);
const DESPILL = num("despill", 1);
const LIFT = num("lift", 0);
const FLOOR = num("floor", 18);
const GAIN = num("gain", 1);
const PAD = num("pad", 10);
const FADE = num("fade", 140);
const QUALITY = num("quality", 74);
const MIRROR = !args.includes("--keep-heading");

if (!existsSync(CLIP)) {
  console.error(`pack-lance: ${CLIP} is not there.`);
  process.exit(1);
}

const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");
const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

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
    CLIP,
  ],
  { encoding: "utf8" },
)
  .trim()
  .split(",");
const W = Number(probe[0]);
const H = Number(probe[1]);

const raw = (n) =>
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      CLIP,
      "-vf",
      `select=eq(n\\,${n})`,
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-",
    ],
    { maxBuffer: 1 << 28 },
  );

function key(r, g, b) {
  const other = Math.max(r, b);
  const chroma = (g - other) / 255;
  const cover = Math.max(0, Math.min(1, (chroma - CUT) / RAMP));
  const keep = 1 - cover;
  if (keep <= 0) return null;
  const pulled = Math.min(g, other + LIFT);
  const gg = g + (pulled - g) * DESPILL;
  return [
    clamp8((r - FLOOR) * keep * GAIN),
    clamp8((gg - FLOOR) * keep * GAIN),
    clamp8((b - FLOOR) * keep * GAIN),
  ];
}

const picks = [];
for (let i = 0; i < COUNT; i++) picks.push(AT + i * STEP);

const keyed = picks.map((n) => {
  const src = raw(n);
  const out = Buffer.alloc(W * H * 3);
  for (let p = 0; p < W * H; p++) {
    const lit = key(src[p * 4], src[p * 4 + 1], src[p * 4 + 2]);
    if (!lit) continue;
    out[p * 3] = lit[0];
    out[p * 3 + 1] = lit[1];
    out[p * 3 + 2] = lit[2];
  }
  return out;
});

let x0 = W;
let y0 = H;
let x1 = -1;
let y1 = -1;
for (const buf of keyed) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = (y * W + x) * 3;
      if (buf[p] + buf[p + 1] + buf[p + 2] < 12) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
}
if (x1 < 0) {
  console.error("pack-lance: the key left nothing — try a lower --cut.");
  process.exit(1);
}

const bx = Math.max(0, x0 - PAD);
const by = Math.max(0, y0 - PAD);
const bw = Math.min(W - bx, x1 - x0 + 1 + PAD * 2);
const bh = Math.min(H - by, y1 - y0 + 1 + PAD * 2);

const stripW = bw * COUNT;
const strip = Buffer.alloc(stripW * bh * 3);
keyed.forEach((buf, i) => {
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const sx = MIRROR ? bw - 1 - x : x;
      const from = ((by + y) * W + (bx + sx)) * 3;
      const to = (y * stripW + i * bw + x) * 3;
      const k = FADE > 0 && x < FADE ? x / FADE : 1;
      strip[to] = buf[from] * k;
      strip[to + 1] = buf[from + 1] * k;
      strip[to + 2] = buf[from + 2] * k;
    }
  }
});

const cellH = Math.max(2, Math.round((WIDTH * bh) / bw / 2) * 2);

mkdirSync(dirname(OUT), { recursive: true });

const encode = (file, extra) =>
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-s",
      `${stripW}x${bh}`,
      "-i",
      "pipe:0",
      "-vf",
      `scale=${WIDTH * COUNT}:${cellH}:flags=area`,
      ...extra,
      "-frames:v",
      "1",
      file,
    ],
    { input: strip, maxBuffer: 1 << 29 },
  );

encode(OUT, [
  "-c:v",
  "libwebp",
  "-lossless",
  "0",
  "-quality",
  String(QUALITY),
  "-pix_fmt",
  "yuv420p",
]);

if (args.includes("--contact"))
  encode(OUT.replace(/\.webp$/, "-contact.png"), []);

console.log(
  `${rel(OUT)}  ${WIDTH * COUNT}x${cellH}  ${COUNT} frames of ${WIDTH}x${cellH}` +
    `  ${(statSync(OUT).size / 1024).toFixed(1)} KB` +
    `  (box ${bw}x${bh} out of ${W}x${H}${MIRROR ? ", mirrored" : ""})`,
);
