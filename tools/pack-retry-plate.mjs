import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src/source/endcard/retry-plate.png");
const OUT_DIR = join(ROOT, "src/assets/brand");
const OUT = join(OUT_DIR, "retry-plate");

const ALPHA_FLOOR = 6;
const WIDTH = 472;
const QUALITY = 90;
const PROOF_BG = [11, 6, 24];

const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`);

function probe(file) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0:s=x",
      file,
    ],
    { encoding: "utf8" },
  ).trim();
  const [w, h] = out.split("x").map(Number);
  return { w, h };
}

function decode(file) {
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
    { maxBuffer: 1 << 29 },
  );
}

function encode(buf, w, h, file, args) {
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
      ...(args || []),
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 29 },
  );
}

function inkBox(px, w, h) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] <= ALPHA_FLOOR) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function crop(px, sw, box) {
  const out = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const from = ((box.y0 + y) * sw + box.x0) * 4;
    px.copy(out, y * box.w * 4, from, from + box.w * 4);
  }
  return out;
}

function scale(px, sw, sh, dw, dh) {
  return execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${sw}x${sh}`,
      "-i",
      "pipe:0",
      "-vf",
      `scale=${dw}:${dh}:flags=lanczos`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-",
    ],
    { input: px, maxBuffer: 1 << 29 },
  );
}

function proof(px, w, h, file) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    const a = px[o + 3] / 255;
    for (let c = 0; c < 3; c++) {
      out[o + c] = Math.round(px[o + c] * a + PROOF_BG[c] * (1 - a));
    }
    out[o + 3] = 255;
  }
  encode(out, w, h, file);
}

const keepPng = process.argv.includes("--png");
const wantProof = process.argv.includes("--proof");

const src = probe(SRC);
const px = decode(SRC);
console.log(
  `source  ${rel(SRC)}  ${src.w}x${src.h}  ${kb(statSync(SRC).size)}`,
);

const box = inkBox(px, src.w, src.h);
console.log(
  `trim    ${box.w}x${box.h} at ${box.x0},${box.y0}  ` +
    `(${src.w - box.w} x ${src.h - box.h} of margin)`,
);

const cropped = crop(px, src.w, box);
const dw = WIDTH;
const dh = Math.round((WIDTH * box.h) / box.w);
const scaled = scale(cropped, box.w, box.h, dw, dh);
console.log(`scale   ${box.w}x${box.h} -> ${dw}x${dh}  (lanczos)`);

const webp = `${OUT}.webp`;
encode(scaled, dw, dh, webp, ["-c:v", "libwebp", "-quality", `${QUALITY}`]);
console.log(`packed  ${rel(webp)}  ${dw}x${dh}  ${kb(statSync(webp).size)}`);

if (keepPng) {
  const png = `${OUT}.png`;
  encode(scaled, dw, dh, png);
  console.log(`png     ${rel(png)}  ${kb(statSync(png).size)}`);
}

if (wantProof) {
  const file = `${OUT}-proof.png`;
  proof(scaled, dw, dh, file);
  console.log(`proof   ${rel(file)}  ${kb(statSync(file).size)}`);
}

console.log(`\nRETRY_PLATE_ART = { w: ${dw}, h: ${dh} };`);
