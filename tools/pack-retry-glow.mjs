import { execFileSync } from "node:child_process";
import { mkdirSync, statSync, unlinkSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "masters/endcard/retry-glow.png");
const OUT_DIR = join(ROOT, "src/assets/brand");
const OUT = join(OUT_DIR, "retry-glow");

const FLOOR = 6;

const WIDTH = 1024;

const QUALITY = 86;

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
    {
      maxBuffer: 1 << 29,
    },
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

if (!existsSync(SRC)) {
  console.error(`missing source: ${rel(SRC)}`);
  process.exit(1);
}

const flags = new Set(process.argv.slice(2));
const { w: sw, h: sh } = probe(SRC);
const px = decode(SRC);

function groundColour() {
  const ch = [[], [], []];
  const take = (x, y) => {
    const i = (y * sw + x) * 4;
    ch[0].push(px[i]);
    ch[1].push(px[i + 1]);
    ch[2].push(px[i + 2]);
  };
  for (let x = 0; x < sw; x++) {
    take(x, 0);
    take(x, sh - 1);
  }
  for (let y = 0; y < sh; y++) {
    take(0, y);
    take(sw - 1, y);
  }
  return ch.map((c) => {
    c.sort((a, b) => a - b);
    return c[c.length >> 1];
  });
}

const ground = groundColour();

let minX = sw;
let minY = sh;
let maxX = -1;
let maxY = -1;
let lit = 0;
for (let y = 0; y < sh; y++) {
  for (let x = 0; x < sw; x++) {
    const i = (y * sw + x) * 4;
    const r = Math.max(0, px[i] - ground[0]);
    const g = Math.max(0, px[i + 1] - ground[1]);
    const b = Math.max(0, px[i + 2] - ground[2]);
    const a = Math.max(r, g, b);
    if (a < FLOOR) {
      px[i] = 0;
      px[i + 1] = 0;
      px[i + 2] = 0;
      px[i + 3] = 0;
      continue;
    }
    const k = 255 / a;
    px[i] = Math.min(255, Math.round(r * k));
    px[i + 1] = Math.min(255, Math.round(g * k));
    px[i + 2] = Math.min(255, Math.round(b * k));
    px[i + 3] = a;
    lit++;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
}

if (maxX < 0) {
  console.error(
    "nothing above the alpha floor — is the source really glow on black?",
  );
  process.exit(1);
}

const cw = maxX - minX + 1;
const ch = maxY - minY + 1;
const cropped = Buffer.alloc(cw * ch * 4);
for (let y = 0; y < ch; y++) {
  px.copy(
    cropped,
    y * cw * 4,
    ((y + minY) * sw + minX) * 4,
    ((y + minY) * sw + minX + cw) * 4,
  );
}

const tmp = join(OUT_DIR, ".retry-glow-cut.png");
encode(cropped, cw, ch, tmp);

const outH = Math.max(1, Math.round((ch * WIDTH) / cw));
const webp = `${OUT}.webp`;
execFileSync("ffmpeg", [
  "-y",
  "-v",
  "error",
  "-i",
  tmp,
  "-vf",
  `scale=${WIDTH}:${outH}:flags=lanczos`,
  "-c:v",
  "libwebp",
  "-lossless",
  "0",
  "-quality",
  String(QUALITY),
  "-frames:v",
  "1",
  webp,
]);

if (flags.has("--png")) {
  const png = `${OUT}.png`;
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    tmp,
    "-vf",
    `scale=${WIDTH}:${outH}:flags=lanczos`,
    "-frames:v",
    "1",
    png,
  ]);
  console.log(
    `  png    ${rel(png)}  ${WIDTH}x${outH}  ${kb(statSync(png).size)}`,
  );
}

if (flags.has("--proof")) {
  const proof = join(OUT_DIR, "retry-glow-proof.png");
  const [r, g, b] = PROOF_BG;
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}:s=${WIDTH}x${outH + 80}`,
    "-i",
    webp,
    "-filter_complex",
    "[0][1]overlay=(W-w)/2:(H-h)/2",
    "-frames:v",
    "1",
    proof,
  ]);
  console.log(`  proof  ${rel(proof)}`);
}

unlinkSync(tmp);

console.log(`retry-glow`);
console.log(`  source ${rel(SRC)}  ${sw}x${sh}  ${kb(statSync(SRC).size)}`);
console.log(
  `  ground rgb(${ground.join(",")}) — measured off the border and subtracted`,
);
console.log(
  `  trim   ${cw}x${ch}  (${((100 * lit) / (sw * sh)).toFixed(1)}% of the frame is lit)`,
);
console.log(
  `  out    ${rel(webp)}  ${WIDTH}x${outH}  ${kb(statSync(webp).size)}`,
);
