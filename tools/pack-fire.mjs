import { execFileSync } from "node:child_process";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "masters/fx/fire.png");
const OUT = join(ROOT, "src/assets/fx/fire-sheet");

const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");

const FRAMES = [
  { x: 100, y: 140, w: 200, h: 180 },
  { x: 270, y: 85, w: 260, h: 250 },
  { x: 505, y: 10, w: 265, h: 325 },
  { x: 770, y: 5, w: 440, h: 340 },
  { x: 1180, y: 10, w: 548, h: 335 },
  { x: 10, y: 335, w: 460, h: 353 },
  { x: 440, y: 340, w: 380, h: 348 },
  { x: 780, y: 345, w: 430, h: 343 },
  { x: 1120, y: 370, w: 400, h: 318 },
  { x: 1450, y: 420, w: 278, h: 268 },
];

const COLS = 5;

const SCALE = 0.72;

const PAD = 2;

const FEATHER = 0.09;

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
    { maxBuffer: 1 << 29 },
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
    { input: buf, maxBuffer: 1 << 29 },
  );
}

const info = probe(SOURCE);
const px = decode(SOURCE);
console.log(`in   ${rel(SOURCE)}  ${info.w}x${info.h}`);

const edge = [[], [], []];
for (let x = 0; x < info.w; x += 3) {
  for (const y of [0, 1, info.h - 2, info.h - 1]) {
    const i = (y * info.w + x) * 4;
    for (let c = 0; c < 3; c++) edge[c].push(px[i + c]);
  }
}
const bg = edge.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
const floor = bg.map((v) => v + 10);
console.log(`     backdrop rgb(${bg.join(", ")}), subtracting ${floor[0]}+`);

const cell = {
  w: Math.round(Math.max(...FRAMES.map((f) => f.w)) * SCALE) + PAD * 2,
  h: Math.round(Math.max(...FRAMES.map((f) => f.h)) * SCALE) + PAD * 2,
};
const rows = Math.ceil(FRAMES.length / COLS);
const sheetW = cell.w * COLS;
const sheetH = cell.h * rows;
const out = Buffer.alloc(sheetW * sheetH * 4);
for (let i = 3; i < out.length; i += 4) out[i] = 255;

function ramp(i, span) {
  const band = span * FEATHER;
  const t = Math.min(i + 0.5, span - 0.5 - i) / band;
  if (t >= 1) return 1;
  if (t <= 0) return 0;
  return t * t * (3 - 2 * t);
}

FRAMES.forEach((f, i) => {
  const fw = Math.round(f.w * SCALE);
  const fh = Math.round(f.h * SCALE);
  const ox = (i % COLS) * cell.w + Math.round((cell.w - fw) / 2);
  const oy = Math.floor(i / COLS) * cell.h + Math.round((cell.h - fh) / 2);
  for (let y = 0; y < fh; y++) {
    const sy0 = f.y + Math.floor((y * f.h) / fh);
    const sy1 = Math.min(f.y + f.h, f.y + Math.floor(((y + 1) * f.h) / fh));
    for (let x = 0; x < fw; x++) {
      const sx0 = f.x + Math.floor((x * f.w) / fw);
      const sx1 = Math.min(f.x + f.w, f.x + Math.floor(((x + 1) * f.w) / fw));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = sy0; sy < Math.max(sy1, sy0 + 1); sy++) {
        for (let sx = sx0; sx < Math.max(sx1, sx0 + 1); sx++) {
          const s = (sy * info.w + sx) * 4;
          r += px[s];
          g += px[s + 1];
          b += px[s + 2];
          n++;
        }
      }
      const k = ramp(x, fw) * ramp(y, fh);
      const dst = ((oy + y) * sheetW + ox + x) * 4;
      out[dst] = Math.max(0, Math.round((r / n - floor[0]) * k));
      out[dst + 1] = Math.max(0, Math.round((g / n - floor[1]) * k));
      out[dst + 2] = Math.max(0, Math.round((b / n - floor[2]) * k));
    }
  }
});

console.log(
  `\n     ${FRAMES.length} frames, cell ${cell.w}x${cell.h}, sheet ${sheetW}x${sheetH}\n`,
);
console.log(`       cols:  ${COLS},`);
console.log(`       cell:  { w: ${cell.w}, h: ${cell.h} },`);
console.log(`       count: ${FRAMES.length},\n`);

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

encode(out, sheetW, sheetH, `${OUT}.webp`, [
  "-c:v",
  "libwebp",
  "-lossless",
  "0",
  "-quality",
  "82",
  "-compression_level",
  "6",
  "-preset",
  "picture",
  "-pix_fmt",
  "yuv420p",
]);
console.log(
  `out  ${rel(OUT)}.webp  ${(statSync(`${OUT}.webp`).size / 1024).toFixed(1)} kB`,
);

if (flags.has("--contact")) {
  const test = Buffer.alloc(sheetW * sheetH * 4);
  for (let i = 0; i < sheetW * sheetH; i++) {
    test[i * 4] = 26;
    test[i * 4 + 1] = 18;
    test[i * 4 + 2] = 30;
    test[i * 4 + 3] = 255;
  }
  for (let i = 0; i < sheetW * sheetH; i++) {
    for (let c = 0; c < 3; c++) {
      test[i * 4 + c] = Math.min(255, test[i * 4 + c] + out[i * 4 + c]);
    }
  }
  encode(test, sheetW, sheetH, `${OUT}-contact.png`);
  console.log(`out  ${rel(OUT)}-contact.png`);
}
