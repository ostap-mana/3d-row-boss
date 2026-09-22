import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `
pack-shards — cut painted rock chunks off their black plates into one sheet.

  node tools/pack-shards.mjs [--plates <dir>] [--out <file>]

  Reads every PNG under masters/boss/shards, finds each lit blob on the black
  ground, keys it to its own silhouette and packs the biggest COUNT of them
  into a COLS-wide grid of CELL-pixel cells.
`;

if (process.argv.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const PLATES = resolve(ROOT, arg("--plates", "masters/boss/shards"));
const OUT = resolve(ROOT, arg("--out", "src/assets/boss/shard-sheet.webp"));

const CELL = Number(arg("--cell", 192));
const COLS = 4;
const COUNT = Number(arg("--count", 8));

const PAD = 4;

const FLOOR = 9;

const MIN_AREA = 2400;

const QUALITY = 88;
const GRADE = !process.argv.includes("--raw");

function decode(file) {
  const [w, h] = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    file,
  ])
    .toString()
    .trim()
    .split(",")
    .map(Number);
  const rgb = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { maxBuffer: 1 << 30 },
  );
  return { rgb, w, h };
}

function encode(rgba, w, h, file) {
  mkdirSync(dirname(file), { recursive: true });
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
      "-c:v",
      "libwebp",
      "-q:v",
      String(QUALITY),
      "-compression_level",
      "6",
      "-frames:v",
      "1",
      file,
    ],
    { input: rgba, maxBuffer: 1 << 30 },
  );
}

function mask(rgb, w, h) {
  const out = new Uint8Array(w * h);
  for (let i = 0, p = 0; p < out.length; i += 3, p++) {
    const top = Math.max(rgb[i], rgb[i + 1], rgb[i + 2]);
    if (top >= FLOOR) out[p] = 1;
  }
  return out;
}

function fillHoles(lit, w, h) {
  const outside = new Uint8Array(w * h);
  const stack = [];
  for (let x = 0; x < w; x++) {
    stack.push(x, x + (h - 1) * w);
  }
  for (let y = 0; y < h; y++) {
    stack.push(y * w, y * w + w - 1);
  }
  while (stack.length) {
    const p = stack.pop();
    if (outside[p] || lit[p]) continue;
    outside[p] = 1;
    const x = p % w;
    const y = (p / w) | 0;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (y > 0) stack.push(p - w);
    if (y < h - 1) stack.push(p + w);
  }
  for (let p = 0; p < lit.length; p++) if (!outside[p]) lit[p] = 1;
}

function blobs(lit, w, h) {
  const seen = new Uint8Array(w * h);
  const found = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const at = y * w + x;
      if (seen[at] || !lit[at]) continue;
      const stack = [at];
      seen[at] = 1;
      const cells = [];
      let x0 = x;
      let x1 = x;
      let y0 = y;
      let y1 = y;
      while (stack.length) {
        const p = stack.pop();
        cells.push(p);
        const cx = p % w;
        const cy = (p / w) | 0;
        if (cx < x0) x0 = cx;
        if (cx > x1) x1 = cx;
        if (cy < y0) y0 = cy;
        if (cy > y1) y1 = cy;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const np = ny * w + nx;
            if (seen[np] || !lit[np]) continue;
            seen[np] = 1;
            stack.push(np);
          }
        }
      }
      if (cells.length >= MIN_AREA) {
        found.push({
          x: x0,
          y: y0,
          w: x1 - x0 + 1,
          h: y1 - y0 + 1,
          area: cells.length,
          cells,
        });
      }
    }
  }
  return found;
}

const ROCK = [0x36, 0x29, 0x3f];
const EDGE = [0x60, 0x48, 0x6e];
const SEAM = [0xff, 0x5a, 0x1f];
const SEAM_HOT = [0xff, 0xc2, 0x47];

function grade(r, g, b) {
  if (!GRADE) return [Math.round(r), Math.round(g), Math.round(b)];
  const lit = Math.min(1, (0.2126 * r + 0.7152 * g + 0.0722 * b) / 210);
  const body = lit < 0.42 ? lit / 0.42 : 1;
  const chip = lit < 0.42 ? 0 : (lit - 0.42) / 0.58;

  const base = ROCK.map((v, i) => v + (EDGE[i] - v) * body);
  const hot = SEAM.map((v, i) => v + (SEAM_HOT[i] - v) * Math.pow(chip, 1.6));
  const mix = Math.pow(chip, 0.8);
  return base.map((v, i) =>
    Math.max(0, Math.min(255, Math.round(v + (hot[i] - v) * mix))),
  );
}

function cut(rgb, w, h, blob) {
  const own = new Uint8Array(w * h);
  blob.cells.forEach((p) => (own[p] = 1));

  const span = Math.max(blob.w, blob.h);
  const inner = CELL - PAD * 2;
  const step = span / inner;
  const ox = blob.x + blob.w / 2 - (inner / 2) * step;
  const oy = blob.y + blob.h / 2 - (inner / 2) * step;

  const cell = Buffer.alloc(CELL * CELL * 4);
  for (let cy = 0; cy < inner; cy++) {
    for (let cx = 0; cx < inner; cx++) {
      const sx0 = ox + cx * step;
      const sy0 = oy + cy * step;
      const sx1 = sx0 + step;
      const sy1 = sy0 + step;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let sy = Math.floor(sy0); sy < sy1; sy++) {
        for (let sx = Math.floor(sx0); sx < sx1; sx++) {
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) {
            n++;
            continue;
          }
          const p = sy * w + sx;
          n++;
          if (!own[p]) continue;
          r += rgb[p * 3];
          g += rgb[p * 3 + 1];
          b += rgb[p * 3 + 2];
          a++;
        }
      }
      if (!a) continue;
      const o = ((cy + PAD) * CELL + cx + PAD) * 4;
      const [gr, gg, gb] = grade(r / a, g / a, b / a);
      cell[o] = gr;
      cell[o + 1] = gg;
      cell[o + 2] = gb;
      cell[o + 3] = Math.round((a / n) * 255);
    }
  }
  return cell;
}

const plates = existsSync(PLATES)
  ? readdirSync(PLATES)
      .filter((f) => /\.(png|webp|jpg)$/i.test(f))
      .sort()
  : [];

if (!plates.length) {
  process.stderr.write(`no plates under ${PLATES}\n`);
  process.exit(1);
}

const piles = [];
for (const name of plates) {
  const file = join(PLATES, name);
  const { rgb, w, h } = decode(file);
  const lit = mask(rgb, w, h);
  fillHoles(lit, w, h);
  const found = blobs(lit, w, h);
  process.stdout.write(`${name}: ${found.length} chunks\n`);
  piles.push(
    found
      .sort((a, b) => b.area - a.area)
      .map((blob) => ({ from: name, cell: cut(rgb, w, h, blob) })),
  );
}

const keep = [];
for (let round = 0; keep.length < COUNT; round++) {
  const before = keep.length;
  for (const pile of piles) {
    if (keep.length >= COUNT) break;
    if (pile[round]) keep.push(pile[round]);
  }
  if (keep.length === before) break;
}

if (keep.length < COUNT) {
  process.stderr.write(`only ${keep.length} chunks, wanted ${COUNT}\n`);
  process.exit(1);
}

const rows = Math.ceil(COUNT / COLS);
const sheetW = COLS * CELL;
const sheetH = rows * CELL;
const sheet = Buffer.alloc(sheetW * sheetH * 4);

keep.forEach((chunk, i) => {
  const cx = (i % COLS) * CELL;
  const cy = Math.floor(i / COLS) * CELL;
  for (let y = 0; y < CELL; y++) {
    chunk.cell.copy(
      sheet,
      ((cy + y) * sheetW + cx) * 4,
      y * CELL * 4,
      (y + 1) * CELL * 4,
    );
  }
});

encode(sheet, sheetW, sheetH, OUT);
process.stdout.write(
  `${OUT.slice(ROOT.length + 1)} ${sheetW}x${sheetH} ${COUNT} chunks\n`,
);
