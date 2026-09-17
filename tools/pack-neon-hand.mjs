import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src/source/hand/image.png");
const OUT_DIR = join(ROOT, "src/assets/hint");

const SHEET = { w: 1536, h: 1024 };

const BAND = [0.03, 0.285];

const COLUMNS = 6;

const ELEMENTS = [
  { name: "fire", rgb: [0xfd, 0x5d, 0x40] },
  { name: "water", rgb: [0x6e, 0xab, 0xfd] },
  { name: "nature", rgb: [0x8b, 0xdd, 0x3d] },
  { name: "lightning", rgb: [0xfd, 0xeb, 0x50] },
  { name: "arcane", rgb: [0xd6, 0x8e, 0xfb] },
  { name: "wind", rgb: [0xd5, 0xfc, 0xfa] },
];

const MIN_AREA = 1200;

const SOLID = 150;

const FLOOR = 22;

const UPSCALE = 2;

const LOSSY = ["-c:v", "libwebp", "-q:v", "90", "-compression_level", "6"];

function decode(file) {
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { maxBuffer: 1 << 30 },
  );
}

function encode(buf, w, h, file) {
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
      "-vf",
      `scale=iw*${UPSCALE}:ih*${UPSCALE}:flags=lanczos`,
      ...LOSSY,
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 30 },
  );
}

function key(rgb, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0, o = 0; o < out.length; i += 3, o += 4) {
    const r = rgb[i];
    const g = rgb[i + 1];
    const b = rgb[i + 2];
    const top = Math.max(r, g, b);
    if (top === 0) continue;
    const t = Math.min(1, Math.max(0, (top - FLOOR) / (FLOOR * 0.8)));
    const gate = t * t * (3 - 2 * t);
    if (gate <= 0) continue;
    const k = 255 / top;
    out[o] = Math.min(255, Math.round(r * k));
    out[o + 1] = Math.min(255, Math.round(g * k));
    out[o + 2] = Math.min(255, Math.round(b * k));
    out[o + 3] = Math.round(gate * top);
  }
  return out;
}

const alphaAt = (px, x, y) => px[(y * SHEET.w + x) * 4 + 3];

function shapes(px, y0, y1) {
  const h = y1 - y0 + 1;
  const seen = new Uint8Array(SHEET.w * h);
  const found = [];
  const lit = (x, y) => alphaAt(px, x, y0 + y) > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < SHEET.w; x++) {
      if (seen[y * SHEET.w + x] || !lit(x, y)) continue;
      const stack = [[x, y]];
      seen[y * SHEET.w + x] = 1;
      let x0 = x;
      let x1 = x;
      let ya = y;
      let yb = y;
      let n = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        n++;
        if (cx < x0) x0 = cx;
        if (cx > x1) x1 = cx;
        if (cy < ya) ya = cy;
        if (cy > yb) yb = cy;
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= SHEET.w || ny >= h) continue;
            if (seen[ny * SHEET.w + nx] || !lit(nx, ny)) continue;
            seen[ny * SHEET.w + nx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      if (n >= MIN_AREA) {
        found.push({ x: x0, y: y0 + ya, w: x1 - x0 + 1, h: yb - ya + 1, n });
      }
    }
  }
  return found.sort((a, b) => a.x - b.x);
}

function hue(px, box) {
  const bright = [];
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * SHEET.w + x) * 4;
      if (px[i + 3] < 120) continue;
      bright.push([px[i + 3], px[i], px[i + 1], px[i + 2]]);
    }
  }
  if (!bright.length) return [0, 0, 0];
  bright.sort((a, b) => b[0] - a[0]);
  const take = bright.slice(0, Math.max(1, Math.floor(bright.length * 0.25)));
  const sum = [0, 0, 0];
  for (const p of take) {
    sum[0] += p[1];
    sum[1] += p[2];
    sum[2] += p[3];
  }
  return sum.map((v) => Math.round(v / take.length));
}

const full = (rgb) => {
  const k = 255 / Math.max(1, Math.max(...rgb));
  return rgb.map((v) => v * k);
};

function classify(rgb) {
  const a = full(rgb);
  let best = null;
  let near = Infinity;
  for (const el of ELEMENTS) {
    const b = full(el.rgb);
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (d < near) {
      near = d;
      best = el.name;
    }
  }
  return best;
}

function fingertip(px, box) {
  for (let y = box.y; y < box.y + box.h; y++) {
    let first = -1;
    let last = -1;
    for (let x = box.x; x < box.x + box.w; x++) {
      if (alphaAt(px, x, y) < SOLID) continue;
      if (first < 0) first = x;
      last = x;
    }
    if (first < 0) continue;
    return { x: (first + last) / 2, y };
  }
  throw new Error("no solid pixel in the hand: nothing to anchor on");
}

const px = key(decode(SOURCE), SHEET.w, SHEET.h);
const band = BAND.map((f) => Math.round(f * SHEET.h));
const found = shapes(px, band[0], band[1]);
if (found.length !== COLUMNS) {
  throw new Error(
    `${found.length} shapes in rows ${band[0]}-${band[1]}, expected ${COLUMNS}`,
  );
}

const hands = new Map();
for (const box of found) {
  const name = classify(hue(px, box));
  if (hands.has(name)) {
    throw new Error(`two hands classified as ${name}: the palette has moved`);
  }
  hands.set(name, { box, tip: fingertip(px, box) });
}
const missing = ELEMENTS.filter((el) => !hands.has(el.name)).map(
  (el) => el.name,
);
if (missing.length) throw new Error(`no hand for ${missing.join(", ")}`);

const reach = (pick) => Math.ceil(Math.max(...[...hands.values()].map(pick)));
const left = reach(({ box, tip }) => tip.x - box.x);
const right = reach(({ box, tip }) => box.x + box.w - tip.x);
const top = reach(({ box, tip }) => tip.y - box.y);
const bottom = reach(({ box, tip }) => box.y + box.h - tip.y);
const W = left + right;
const H = top + bottom;

mkdirSync(OUT_DIR, { recursive: true });
const kb = (n) => `${(n / 1024).toFixed(1)}kB`;
let total = 0;

for (const el of ELEMENTS) {
  const { box, tip } = hands.get(el.name);
  const dx = left - Math.round(tip.x - box.x);
  const dy = top - Math.round(tip.y - box.y);
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const s = ((box.y + y) * SHEET.w + box.x + x) * 4;
      px.copy(out, ((dy + y) * W + dx + x) * 4, s, s + 4);
    }
  }
  const file = join(OUT_DIR, `hand-${el.name}.webp`);
  encode(out, W, H, file);
  const size = statSync(file).size;
  total += size;
  console.log(
    `${el.name.padEnd(10)} cut ${box.w}x${box.h} at ` +
      `${String(box.x).padStart(4)},${box.y}  placed +${dx},+${dy}  ` +
      `${kb(size).padStart(7)}`,
  );
}

console.log(
  `\n6 files, ${kb(total)} total, ${W * UPSCALE}x${H * UPSCALE} each`,
);
console.log(`\nsrc/art/hinthand.js:`);
console.log(`  HAND_ART = { w: ${W * UPSCALE}, h: ${H * UPSCALE} }`);
console.log(
  `  HAND_TIP = { x: ${(left / W).toFixed(4)}, y: ${(top / H).toFixed(4)} }`,
);
