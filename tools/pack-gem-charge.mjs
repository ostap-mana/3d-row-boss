import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, statSync, existsSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = "src/source/fx/invokers";
const OUT = "src/assets/fx/gem-charge.webp";

const HALO_SRC = "T_FX_Circle_11_1.webp";
const CORONA_SRC = "T_FX_Circle_19_1.webp";

const COLS = 5;
const COUNT = 10;
const CELL = 128;
const PAD = 2;
const SUPER = 4;
const FLOOR = 10;
const QUALITY = 80;

const HALO_SCALE = [0.52, 0.62, 0.72, 0.8, 0.87, 0.93, 0.97, 1.0, 1.02, 1.04];
const HALO_LEVEL = [0.14, 0.42, 0.72, 0.94, 1.0, 0.9, 0.72, 0.52, 0.32, 0.14];
const CORONA_SCALE = [
  0.34, 0.48, 0.62, 0.76, 0.88, 0.98, 1.06, 1.12, 1.16, 1.2,
];
const CORONA_LEVEL = [0.1, 0.3, 0.55, 0.78, 0.95, 1.0, 0.82, 0.58, 0.34, 0.14];
const CORONA_TURN = [0, 5, 11, 18, 25, 32, 38, 43, 47, 50];

function probe(file) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0:s=x",
      file,
    ],
    { encoding: "utf8" },
  ).trim();
  const [w, h] = out.split("x");
  return { w: Number(w), h: Number(h) };
}

function decode(file) {
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
    { maxBuffer: 1 << 30 },
  );
}

function encode(buf, w, h, file, args) {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${w}x${h}`,
      "-i",
      "pipe:0",
      ...(args || []),
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 30 },
  );
}

function loadLayer(name) {
  const file = join(ROOT, SRC_DIR, name);
  if (!existsSync(file)) return null;
  const { w, h } = probe(file);
  return { px: decode(file), w, h };
}

function maskAt(layer, u, v) {
  if (u < 0 || v < 0 || u >= layer.w - 1 || v >= layer.h - 1) return 0;
  const x0 = u | 0;
  const y0 = v | 0;
  const fx = u - x0;
  const fy = v - y0;
  let acc = 0;
  for (let dy = 0; dy < 2; dy++) {
    for (let dx = 0; dx < 2; dx++) {
      const i = ((y0 + dy) * layer.w + x0 + dx) * 4;
      const l =
        0.2126 * layer.px[i] +
        0.7152 * layer.px[i + 1] +
        0.0722 * layer.px[i + 2];
      const m = (l * layer.px[i + 3]) / (255 * 255);
      const wx = dx ? fx : 1 - fx;
      const wy = dy ? fy : 1 - fy;
      acc += m * wx * wy;
    }
  }
  return acc;
}

function sample(layer, dx, dy, span, cos, sin) {
  const k = layer.w / span;
  const sx = dx * cos + dy * sin;
  const sy = -dx * sin + dy * cos;
  const m = maskAt(layer, layer.w / 2 + sx * k, layer.h / 2 + sy * k);
  return m * 255 > FLOOR ? m : 0;
}

function paintCell(frame, halo, corona, out, ow, ox, oy) {
  const hSpan = HALO_SCALE[frame] * CELL;
  const hLevel = HALO_LEVEL[frame];
  const cSpan = CORONA_SCALE[frame] * CELL;
  const cLevel = CORONA_LEVEL[frame];
  const turn = (CORONA_TURN[frame] * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const step = 1 / SUPER;
  const taps = SUPER * SUPER;

  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      let sum = 0;
      for (let sy = 0; sy < SUPER; sy++) {
        for (let sx = 0; sx < SUPER; sx++) {
          const dx = x + (sx + 0.5) * step - CELL / 2;
          const dy = y + (sy + 0.5) * step - CELL / 2;
          const h = halo ? sample(halo, dx, dy, hSpan, 1, 0) * hLevel : 0;
          const c = corona
            ? sample(corona, dx, dy, cSpan, cos, sin) * cLevel
            : 0;
          sum += Math.min(1, h + c);
        }
      }
      const v = Math.round((sum / taps) * 255);
      const o = ((oy + y) * ow + ox + x) * 4;
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
      out[o + 3] = 255;
    }
  }
}

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const kb = (file) => (statSync(file).size / 1024).toFixed(1);

const halo = loadLayer(HALO_SRC);
const corona = loadLayer(CORONA_SRC);
if (!halo && !corona) {
  console.log(`nothing to pack — ${SRC_DIR} has neither source`);
  process.exit(0);
}

mkdirSync(join(ROOT, "src/assets/fx"), { recursive: true });

const cellOut = CELL + PAD * 2;
const rows = Math.ceil(COUNT / COLS);
const sheetW = cellOut * COLS;
const sheetH = cellOut * rows;
const sheet = Buffer.alloc(sheetW * sheetH * 4);
for (let i = 3; i < sheet.length; i += 4) sheet[i] = 255;

for (let f = 0; f < COUNT; f++) {
  paintCell(
    f,
    halo,
    corona,
    sheet,
    sheetW,
    (f % COLS) * cellOut + PAD,
    Math.floor(f / COLS) * cellOut + PAD,
  );
}

const out = join(ROOT, OUT);
if (flags.has("--strip")) {
  encode(sheet, sheetW, sheetH, out.replace(/\.webp$/, ".png"));
}
encode(sheet, sheetW, sheetH, out, [
  "-c:v",
  "libwebp",
  "-lossless",
  "0",
  "-quality",
  String(QUALITY),
  "-compression_level",
  "6",
  "-preset",
  "drawing",
]);

console.log(
  `gem-charge  ${halo ? HALO_SRC : "(no halo)"} + ${corona ? CORONA_SRC : "(no corona)"}` +
    `  ${COUNT} frames  ${sheetW}x${sheetH}  ${kb(out).padStart(6)} kB`,
);
