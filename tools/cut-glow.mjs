import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const FLOOR = 2;

const SPLIT = 4;

const PREVIEW_BG = [26, 18, 34];

function decode(file) {
  const dims = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v",
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

  const [w, h] = dims;
  const px = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
    { maxBuffer: 1 << 30 },
  );
  if (px.length !== w * h * 4) {
    throw new Error(`decoded ${px.length} bytes, expected ${w * h * 4}`);
  }
  return { w, h, px };
}

function encode(file, w, h, px) {
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
      "-",
      file,
    ],
    { input: px, maxBuffer: 1 << 30 },
  );
}

function level(px, i) {
  return Math.max(px[i], px[i + 1], px[i + 2]);
}

function bands({ w, h, px }) {
  const on = new Array(h).fill(false);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (level(px, (y * w + x) * 4) > FLOOR) {
        on[y] = true;
        break;
      }
    }
  }

  const out = [];
  let start = -1;
  let blank = 0;
  for (let y = 0; y <= h; y++) {
    if (y < h && on[y]) {
      if (start < 0) start = y;
      blank = 0;
    } else if (start >= 0) {
      blank++;
      if (blank >= SPLIT || y === h) {
        out.push({ y0: start, y1: y - blank });
        start = -1;
        blank = 0;
      }
    }
  }
  return out;
}

function box({ w, px }, band) {
  let x0 = w;
  let x1 = -1;
  for (let y = band.y0; y <= band.y1; y++) {
    for (let x = 0; x < w; x++) {
      if (level(px, (y * w + x) * 4) <= FLOOR) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
  }
  return { ...band, x0, x1 };
}

function lift({ w, px }, b) {
  const bw = b.x1 - b.x0 + 1;
  const bh = b.y1 - b.y0 + 1;
  const out = Buffer.alloc(bw * bh * 4);

  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = ((y + b.y0) * w + (x + b.x0)) * 4;
      const o = (y * bw + x) * 4;
      const a = level(px, i);
      if (a === 0) continue;
      for (let c = 0; c < 3; c++) {
        out[o + c] = Math.min(255, Math.round((px[i + c] * 255) / a));
      }
      out[o + 3] = a;
    }
  }
  return { w: bw, h: bh, px: out };
}

function composite(art) {
  const out = Buffer.alloc(art.px.length);
  for (let i = 0; i < art.px.length; i += 4) {
    const a = art.px[i + 3] / 255;
    for (let c = 0; c < 3; c++) {
      out[i + c] = Math.round(art.px[i + c] * a + PREVIEW_BG[c] * (1 - a));
    }
    out[i + 3] = 255;
  }
  return { ...art, px: out };
}

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith("--"));
const rest = argv.filter((a) => !a.startsWith("--"));
const outIdx = flags.findIndex((f) => f.startsWith("--out"));
const outDir = resolve(
  ROOT,
  outIdx >= 0 ? flags[outIdx].split("=")[1] : "src/assets/ui",
);

const [file, ...names] = rest;
if (!file) {
  console.error(
    "usage: node tools/cut-glow.mjs <sheet.png> <name> [name...] [--out=dir] [--preview]",
  );
  process.exit(1);
}

const sheet = decode(resolve(ROOT, file));
const found = bands(sheet).map((b) => box(sheet, b));
console.log(`${file}: ${sheet.w}x${sheet.h}, ${found.length} bar(s)`);

if (names.length && names.length !== found.length) {
  console.error(
    `refusing to guess: ${found.length} bars found, ${names.length} names given`,
  );
  process.exit(1);
}

found.forEach((b, i) => {
  const art = lift(sheet, b);
  const name = names[i] || `bar-${i + 1}`;
  const out = resolve(outDir, `${name}.png`);
  encode(out, art.w, art.h, art.px);

  let lit = 0;
  for (let p = 3; p < art.px.length; p += 4) if (art.px[p] > 0) lit++;
  console.log(
    `  ${name}.png  ${art.w}x${art.h}  from y ${b.y0}..${b.y1} x ${b.x0}..${b.x1}` +
      `  ${((100 * lit) / (art.w * art.h)).toFixed(0)}% lit`,
  );

  if (flags.includes("--preview")) {
    const pv = composite(art);
    encode(resolve(outDir, `${name}-preview.png`), pv.w, pv.h, pv.px);
  }
});
