import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const FLOOR = 8;

const ALPHA_FULL = 255;

const SPECK = 0.0001;

const SAME_ROW = 0.5;

function decode(file) {
  const [w, h] = execFileSync("ffprobe", [
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

function shapes({ w, h, px }) {
  const seen = new Uint8Array(w * h);
  const found = [];
  const min = w * h * SPECK;

  for (let start = 0; start < w * h; start++) {
    if (seen[start] || px[start * 4 + 3] < FLOOR) continue;

    let x0 = w;
    let x1 = -1;
    let y0 = h;
    let y1 = -1;
    let area = 0;

    seen[start] = 1;
    const stack = [start];
    while (stack.length) {
      const p = stack.pop();
      const x = p % w;
      const y = (p - x) / w;
      area++;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const q = ny * w + nx;
          if (seen[q] || px[q * 4 + 3] < FLOOR) continue;
          seen[q] = 1;
          stack.push(q);
        }
      }
    }

    if (area >= min) found.push({ x0, x1, y0, y1, area });
  }
  return found;
}

function readingOrder(found) {
  const rows = [];
  [...found]
    .sort((a, b) => a.y0 - b.y0)
    .forEach((s) => {
      const row = rows.find((r) => {
        const top = Math.max(r.y0, s.y0);
        const bottom = Math.min(r.y1, s.y1);
        const shorter = Math.min(r.y1 - r.y0, s.y1 - s.y0) + 1;
        return (bottom - top + 1) / shorter > SAME_ROW;
      });
      if (row) {
        row.items.push(s);
        row.y0 = Math.min(row.y0, s.y0);
        row.y1 = Math.max(row.y1, s.y1);
      } else {
        rows.push({ y0: s.y0, y1: s.y1, items: [s] });
      }
    });

  return rows.flatMap((r) => r.items.sort((a, b) => a.x0 - b.x0));
}

function lift({ w, px }, s, box) {
  const b = box || s;
  const bw = b.x1 - b.x0 + 1;
  const bh = b.y1 - b.y0 + 1;
  const out = Buffer.alloc(bw * bh * 4);

  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const sx = x + b.x0;
      const sy = y + b.y0;
      if (sx < 0 || sy < 0 || sx >= w) continue;
      const i = (sy * w + sx) * 4;
      const o = (y * bw + x) * 4;
      out[o] = px[i];
      out[o + 1] = px[i + 1];
      out[o + 2] = px[i + 2];
      out[o + 3] = px[i + 3];
    }
  }
  return { w: bw, h: bh, px: out };
}

function normalise(sheet) {
  let peak = 0;
  for (let i = 3; i < sheet.px.length; i += 4) {
    if (sheet.px[i] > peak) peak = sheet.px[i];
  }
  if (!peak || peak >= ALPHA_FULL) return peak;

  const k = ALPHA_FULL / peak;
  for (let i = 3; i < sheet.px.length; i += 4) {
    sheet.px[i] = Math.min(ALPHA_FULL, Math.round(sheet.px[i] * k));
  }
  return peak;
}

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith("--"));
const rest = argv.filter((a) => !a.startsWith("--"));
const flag = (name, fallback) => {
  const f = flags.find((v) => v.startsWith(`--${name}=`));
  return f ? f.split("=").slice(1).join("=") : fallback;
};

const [file, ...names] = rest;
if (!file) {
  console.error(
    "usage: node tools/slice-glyphs.mjs <sheet.png> [name...] " +
      "[--prefix=glyph] [--out=dir] [--box]",
  );
  process.exit(1);
}

const src = resolve(ROOT, file);
const outDir = resolve(ROOT, flag("out", dirname(file)));
const prefix = flag("prefix", "glyph");
const uniform = flags.includes("--box");

const sheet = decode(src);
const peak = normalise(sheet);
const found = readingOrder(shapes(sheet));

console.log(`${file}: ${sheet.w}x${sheet.h}`);
console.log(
  `  alpha peaked at ${peak}` +
    (peak < ALPHA_FULL ? ` — normalised to ${ALPHA_FULL}` : " — left alone"),
);
console.log(`  ${found.length} shape(s) found\n`);

if (names.length && names.length !== found.length) {
  console.error(
    `refusing to guess: ${found.length} shapes found, ${names.length} names given`,
  );
  process.exit(1);
}

const frame = {
  y0: Math.min(...found.map((s) => s.y0)),
  y1: Math.max(...found.map((s) => s.y1)),
};

found.forEach((s, i) => {
  const name = names[i] || `${prefix}-${i + 1}`;
  const box = uniform ? { ...s, y0: frame.y0, y1: frame.y1 } : null;
  const art = lift(sheet, s, box);
  encode(resolve(outDir, `${name}.png`), art.w, art.h, art.px);
  console.log(
    `  ${(name + ".png").padEnd(14)} ${String(art.w).padStart(4)}x${String(art.h).padStart(4)}` +
      `  at ${String(s.x0).padStart(4)},${String(s.y0).padStart(4)}` +
      `  ${s.area.toLocaleString().padStart(8)} px`,
  );
});
