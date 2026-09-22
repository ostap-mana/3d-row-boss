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
const SEAMS = Number(arg("--seams", 0));
const SEAM_SCALE = Number(arg("--seam-scale", 3.4));
const SEED = Number(arg("--seed", 7));
const OUTLINE = Number(arg("--outline", 0.035));
const SEAM_CUT = Number(arg("--seam-cut", 0.72));
const FRAMES = Math.max(1, Math.round(Number(arg("--frames", 1))));

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

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (t) => t * t * (3 - 2 * t);

function hash2(x, y) {
  let h = x * 374761393 + y * 668265263 + SEED * 972897;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smoothstep(x - xi);
  const yf = smoothstep(y - yi);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
}

function fbm(x, y, octaves) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let fx = x;
  let fy = y;
  for (let o = 0; o < octaves; o++) {
    sum += valueNoise(fx, fy) * amp;
    norm += amp;
    amp *= 0.5;
    fx *= 2.03;
    fy *= 2.01;
  }
  return sum / norm;
}

function inside(cell) {
  const d = new Float32Array(CELL * CELL);
  const INF = 1e9;
  for (let i = 0; i < d.length; i++) d[i] = cell[i * 4 + 3] > 140 ? INF : 0;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const i = y * CELL + x;
      if (d[i] === 0) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) v = Math.min(v, d[i - CELL] + 1);
      if (y > 0 && x > 0) v = Math.min(v, d[i - CELL - 1] + 1.4142);
      if (y > 0 && x < CELL - 1) v = Math.min(v, d[i - CELL + 1] + 1.4142);
      d[i] = v;
    }
  }
  for (let y = CELL - 1; y >= 0; y--) {
    for (let x = CELL - 1; x >= 0; x--) {
      const i = y * CELL + x;
      let v = d[i];
      if (x < CELL - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < CELL - 1) v = Math.min(v, d[i + CELL] + 1);
      if (y < CELL - 1 && x < CELL - 1)
        v = Math.min(v, d[i + CELL + 1] + 1.4142);
      if (y < CELL - 1 && x > 0) v = Math.min(v, d[i + CELL - 1] + 1.4142);
      d[i] = v;
    }
  }
  return d;
}

const INK = [0x0a, 0x06, 0x10];
const LIP = [0xa8, 0x88, 0xb0];

function stylize(cell, index, phase) {
  if (SEAMS <= 0) return cell;
  const depth = inside(cell);
  const step = SEAM_SCALE / CELL;
  const drift = index * 13.7 + phase * 0.9;
  const swell = 0.82 + 0.34 * Math.sin(phase * Math.PI * 2);

  let top = CELL;
  let bottom = 0;
  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      if (cell[(y * CELL + x) * 4 + 3] <= 140) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      break;
    }
  }
  const tall = Math.max(1, bottom - top);

  const ink = CELL * OUTLINE;
  const lip = ink + CELL * 0.022;

  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const i = y * CELL + x;
      if (cell[i * 4 + 3] <= 140) continue;

      const down = clamp01((y - top) / tall);
      const nx = x * step + drift;
      const ny = y * step;

      const facet = Math.round(fbm(nx * 0.55, ny * 0.55, 2) * 3) / 3;
      const lit = clamp01(0.82 - down * 0.95 + facet * 0.34);
      let out = ROCK.map((v, k) => v + (EDGE[k] - v) * lit);

      const warp = fbm(nx * 0.7, ny * 0.7, 3);
      const field = fbm(nx + warp * 1.7, ny + warp * 1.7, 4);
      const ridge = 1 - Math.abs(field * 2 - 1);
      const band = clamp01((ridge - SEAM_CUT) / (1 - SEAM_CUT));
      const bedded = smoothstep(clamp01(depth[i] / (CELL * 0.035)));
      const heat = clamp01(Math.pow(band, 2.4) * bedded * SEAMS * swell);
      if (heat > 0.02) {
        const core = clamp01((heat - 0.55) / 0.45);
        const seam = SEAM.map((v, k) => v + (SEAM_HOT[k] - v) * core);
        const k = clamp01(heat);
        out = out.map((v, c) => v + (seam[c] - v) * k);
      }

      if (depth[i] < lip && depth[i] >= ink && down < 0.55) {
        const k = 0.75 * (1 - down / 0.55);
        out = out.map((v, c) => v + (LIP[c] - v) * k);
      }
      if (depth[i] < ink) {
        const k = clamp01(1 - depth[i] / ink);
        out = out.map((v, c) => v + (INK[c] - v) * Math.pow(k, 0.55));
      }

      for (let c = 0; c < 3; c++) {
        cell[i * 4 + c] = Math.max(0, Math.min(255, Math.round(out[c])));
      }
    }
  }
  return cell;
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
      .map((blob, i) => ({
        from: name,
        frames: Array.from({ length: FRAMES }, (_, f) =>
          stylize(cut(rgb, w, h, blob), i, f / FRAMES),
        ),
      })),
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

const cols = FRAMES > 1 ? FRAMES : COLS;
const rows = FRAMES > 1 ? COUNT : Math.ceil(COUNT / COLS);
const sheetW = cols * CELL;
const sheetH = rows * CELL;
const sheet = Buffer.alloc(sheetW * sheetH * 4);

const laid = [];
keep.forEach((chunk) => chunk.frames.forEach((cell) => laid.push({ cell })));

laid.forEach((chunk, i) => {
  const cx = (i % cols) * CELL;
  const cy = Math.floor(i / cols) * CELL;
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
