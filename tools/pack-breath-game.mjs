import { execFileSync } from "node:child_process";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";

const USAGE = `
pack-breath-game — the boss's fire breath, filled with the game's own flame.

  node tools/pack-breath-game.mjs [options]

  pack-breath.mjs draws the plume in Grease Pencil. This one keeps the plume
  and swaps the paint for a flipbook straight out of the Invokers build:
  T_FX_Fire_9_1_2x6, twelve frames of a long ragged flame stream, 512 along
  the jet by 170 across. Turned a quarter so the stream points down, its long
  axis lands on the 228 the sheet cuts as a downscale, which is the only
  reason this is worth doing at all — every other flame in the build is a
  round burst that would have to be stretched into a jet and would read as a
  smear. The claw has no such flipbook anywhere in the build, only static
  shader masks, which is why there is no pack-claw-game.

  The plume is built here, not taken: a cone that opens from the mouth, the
  flipbook sampled along it so the fire runs outward instead of sitting still,
  and a ramp that turns the build's greyscale into the orange the rest of the
  beat throws. Additive on black, no matte, because that is what spells.js
  reads for breath.

  --source <name>  flipbook in masters/fx/fire. Default T_FX_Fire_9_1_2x6.
  --cell <px>      square cell. Default 228, what art/spells.js cuts.
  --cols <n>       columns. Default 5.
  --count <n>      frames. Default 10.
  --mouth <n>      half width at the mouth, in cell widths. Default 0.10.
  --flare <n>      how fast the cone opens. 1 is straight, above 1 holds
                   narrow then flares. Default 1.45.
  --reach <n>      how far down the cell the plume runs. Default 0.98.
  --grow <n>       frames spent opening before it is at full reach. Default 3.
  --scroll <n>     how far the flame runs along the jet per frame. Default 0.16.
  --from <n>       first source frame to draw from. Default 0.
  --to <n>         last source frame to draw from. The flipbook burns itself
                   out by its own last frames, and a breath at full blast
                   cannot be made of ash, so the range cycles instead of
                   marching to the end. Default 6.
  --layers <n>     how many scrolled copies are laid over each other. One is
                   the bare flipbook and reads as cut paper; two give the jet
                   a body. Default 2.
  --feather <n>    how soft the cone's own edge is, in cone widths. Default 0.3.
  --lift <n>       black point on the source, 0..1. Default 0.06.
  --gain <n>       multiplies what survives. Default 1.15.
  --out <file>     default: src/assets/fx/breath-sheet.webp
  --quality <n>    webp quality. Default 90.
  --keep-raw       leave the raw rgba sheet next to the output
`;

const args = process.argv.slice(2);
if (args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const num = (name, fallback) => {
  const v = flag(name, null);
  return v === null ? fallback : Number(v);
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rel = (p) =>
  p
    .replace(ROOT + sep, "")
    .split(sep)
    .join("/");

const SOURCE_NAME = flag("source", "T_FX_Fire_9_1_2x6");
const SOURCE = join(ROOT, "masters/fx/fire", SOURCE_NAME + ".png");
const out = resolve(ROOT, flag("out", "src/assets/fx/breath-sheet.webp"));

const CELL = Math.round(num("cell", 228));
const COLS = Math.round(num("cols", 5));
const COUNT = Math.round(num("count", 10));
const ROWS = Math.ceil(COUNT / COLS);

const MOUTH = num("mouth", 0.1);
const FLARE = num("flare", 1.45);
const REACH = num("reach", 0.98);
const GROW = num("grow", 3);
const SCROLL = num("scroll", 0.16);
const LIFT = num("lift", 0.06);
const GAIN = num("gain", 1.15);
const FROM = Math.round(num("from", 0));
const TO = Math.round(num("to", 6));
const LAYERS = Math.max(1, Math.round(num("layers", 2)));
const FEATHER = num("feather", 0.3);
const QUALITY = Math.round(num("quality", 90));

const RAMP = [
  { at: 0.0, rgb: [0, 0, 0] },
  { at: 0.18, rgb: [92, 16, 4] },
  { at: 0.42, rgb: [206, 68, 10] },
  { at: 0.68, rgb: [255, 140, 32] },
  { at: 0.88, rgb: [255, 206, 122] },
  { at: 1.0, rgb: [255, 246, 222] },
];

if (!existsSync(SOURCE)) {
  process.stderr.write(`missing ${rel(SOURCE)}\n`);
  process.exit(1);
}

const grid = SOURCE_NAME.match(/(\d+)x(\d+)(?!.*\d+x\d+)/);
if (!grid) {
  process.stderr.write(`cannot read a grid out of ${SOURCE_NAME}\n`);
  process.exit(1);
}
const SRC_COLS = Number(grid[1]);
const SRC_ROWS = Number(grid[2]);

const ff = (list) => execFileSync("ffmpeg", ["-v", "error", "-y", ...list]);

function sizeOf(file) {
  const text = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    file,
  ])
    .toString()
    .trim();
  const [w, h] = text.split(",").map(Number);
  return { w, h };
}

const src = sizeOf(SOURCE);
const tmp = out.replace(/\.webp$/, ".src.raw");
ff(["-i", SOURCE, "-f", "rawvideo", "-pix_fmt", "rgba", tmp]);
const srcRaw = readFileSync(tmp);
rmSync(tmp, { force: true });

const srcLum = new Float32Array(src.w * src.h);
for (let i = 0; i < src.w * src.h; i++) {
  const a = srcRaw[i * 4 + 3] / 255;
  const l = Math.max(srcRaw[i * 4], srcRaw[i * 4 + 1], srcRaw[i * 4 + 2]) / 255;
  srcLum[i] = l * (a > 0 ? a : 1);
}

const CELL_W = src.w / SRC_COLS;
const CELL_H = src.h / SRC_ROWS;
const SRC_FRAMES = SRC_COLS * SRC_ROWS;

function sampleCell(frame, along, across) {
  if (along < 0 || along > 1 || across < 0 || across > 1) return 0;
  const col = frame % SRC_COLS;
  const row = Math.floor(frame / SRC_COLS);
  const x = (col + along) * CELL_W;
  const y = (row + across) * CELL_H;
  const x0 = Math.min(src.w - 1, Math.max(0, Math.floor(x)));
  const y0 = Math.min(src.h - 1, Math.max(0, Math.floor(y)));
  const x1 = Math.min(src.w - 1, x0 + 1);
  const y1 = Math.min(src.h - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const a = srcLum[y0 * src.w + x0];
  const b = srcLum[y0 * src.w + x1];
  const c = srcLum[y1 * src.w + x0];
  const d = srcLum[y1 * src.w + x1];
  return (
    a * (1 - fx) * (1 - fy) +
    b * fx * (1 - fy) +
    c * (1 - fx) * fy +
    d * fx * fy
  );
}

function ramp(t) {
  const v = Math.min(1, Math.max(0, t));
  for (let i = 1; i < RAMP.length; i++) {
    if (v <= RAMP[i].at) {
      const a = RAMP[i - 1];
      const b = RAMP[i];
      const k = (v - a.at) / (b.at - a.at);
      return [
        a.rgb[0] + (b.rgb[0] - a.rgb[0]) * k,
        a.rgb[1] + (b.rgb[1] - a.rgb[1]) * k,
        a.rgb[2] + (b.rgb[2] - a.rgb[2]) * k,
      ];
    }
  }
  return RAMP[RAMP.length - 1].rgb;
}

const smooth = (a, b, x) => {
  if (a === b) return x < a ? 0 : 1;
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const sheetW = COLS * CELL;
const sheetH = ROWS * CELL;
const sheet = new Uint8ClampedArray(sheetW * sheetH * 4);
for (let i = 0; i < sheetW * sheetH; i++) sheet[i * 4 + 3] = 255;

let lit = 0;

for (let f = 0; f < COUNT; f++) {
  const open = Math.min(1, (f + 1) / (GROW + 1));
  const reach = REACH * smooth(0, 1, open);
  const span = Math.max(1, Math.min(SRC_FRAMES - 1, TO) - FROM + 1);
  const scroll = f * SCROLL;

  const atX = (f % COLS) * CELL;
  const atY = Math.floor(f / COLS) * CELL;

  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const py = y / (CELL - 1);
      const px = x / (CELL - 1) - 0.5;

      if (py > reach) continue;

      const run = reach <= 0 ? 0 : py / reach;
      const half = MOUTH + (0.5 - MOUTH) * Math.pow(run, FLARE);
      const across = px / half;
      if (across < -1 || across > 1) continue;

      let m = 0;
      for (let k = 0; k < LAYERS; k++) {
        const lane = k / LAYERS;
        const frame = FROM + ((f + k * 2) % span);
        const along = run * 0.85 + scroll + lane * 0.5;
        const wrapped = along - Math.floor(along);
        const skew = (across + 1) / 2 + lane * 0.27;
        const hit = sampleCell(frame, wrapped, skew - Math.floor(skew));
        m = Math.max(m, hit * (k === 0 ? 1 : 0.8));
      }

      const sides = 1 - smooth(1 - FEATHER, 1.02, Math.abs(across));
      const tip = 1 - smooth(0.7, 1.0, run);
      const throat = smooth(0, 0.16, run);

      let v = (m - LIFT) / (1 - LIFT);
      v = v <= 0 ? 0 : v * GAIN * sides * tip * (0.45 + 0.55 * throat);
      if (v <= 0.004) continue;

      const [r, g, b] = ramp(Math.min(1, v));
      const n = ((atY + y) * sheetW + atX + x) * 4;
      sheet[n] = Math.max(sheet[n], r);
      sheet[n + 1] = Math.max(sheet[n + 1], g);
      sheet[n + 2] = Math.max(sheet[n + 2], b);
      lit++;
    }
  }
}

const rawFile = out.replace(/\.webp$/, ".raw");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  rawFile,
  Buffer.from(sheet.buffer, sheet.byteOffset, sheet.length),
);

ff([
  "-f",
  "rawvideo",
  "-pix_fmt",
  "rgba",
  "-s",
  `${sheetW}x${sheetH}`,
  "-i",
  rawFile,
  "-frames:v",
  "1",
  "-c:v",
  "libwebp",
  "-lossless",
  "0",
  "-q:v",
  String(QUALITY),
  out,
]);

if (!args.includes("--keep-raw")) rmSync(rawFile, { force: true });

process.stdout.write(
  [
    `breath -> ${rel(out)}`,
    `  ${SOURCE_NAME} out of the build · ${SRC_COLS}x${SRC_ROWS} of ${Math.round(CELL_W)}x${Math.round(CELL_H)} · ${SRC_FRAMES} frames`,
    `  ${sheetW} x ${sheetH} · ${COLS} by ${ROWS} of ${CELL} · ${COUNT} frames`,
    `  ${(statSync(out).size / 1024).toFixed(1)} kB · ${((lit / (COUNT * CELL * CELL)) * 100).toFixed(1)}% of the cells is lit`,
    "",
    "  art/spells.js expects",
    `    cols: ${COLS}, cell: ${CELL}, count: ${COUNT}`,
    "",
  ].join("\n"),
);
