import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync, existsSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src/source/heroes/portrait-sheet.webp");
const OUT_DIR = join(ROOT, "src/assets/heroes");

const single = (name) => join(ROOT, `src/source/heroes/portrait-${name}.png`);

const NAMES = ["fire", "water", "nature", "lightning", "arcane", "wind"];

const GAP_LEVEL = 100;

const MARGIN_LEVEL = 100;

const HUNT = 10;

const TRIM = 2;

const TARGET = { w: 160, h: 328 };

const QUALITY = "88";

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

const at = (w, x, y) => (y * w + x) * 4;
const lum = (px, i) => (px[i] * 2 + px[i + 1] * 5 + px[i + 2]) / 8;

function columnPeak(px, w, x, y0, y1) {
  let peak = 0;
  for (let y = y0; y <= y1; y++) peak = Math.max(peak, lum(px, at(w, x, y)));
  return peak;
}

function columnMean(px, w, x, y0, y1) {
  let sum = 0;
  for (let y = y0; y <= y1; y++) sum += lum(px, at(w, x, y));
  return sum / (y1 - y0 + 1);
}

function artRows(px, w, h) {
  const peak = (y) => {
    let p = 0;
    for (let x = 0; x < w; x += 2) p = Math.max(p, lum(px, at(w, x, y)));
    return p;
  };
  let y0 = 0;
  while (y0 < h && peak(y0) < MARGIN_LEVEL) y0++;
  let y1 = h - 1;
  while (y1 > y0 && peak(y1) < MARGIN_LEVEL) y1--;
  return { y0, y1 };
}

function gaps(px, w, y0, y1) {
  const runs = [];
  let start = -1;
  for (let x = 0; x < w; x++) {
    if (columnPeak(px, w, x, y0, y1) < GAP_LEVEL) {
      if (start < 0) start = x;
    } else if (start >= 0) {
      runs.push([start, x - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, w - 1]);
  return runs;
}

function boundaries(px, w, y0, y1, count) {
  const found = gaps(px, w, y0, y1);
  if (found.length < 2) throw new Error("no outer margins on the sheet");

  const left = found[0][1] + 1;
  const right = found[found.length - 1][0] - 1;
  const pitch = (right - left + 1) / count;
  const inner = found.slice(1, -1);

  const cuts = [[left - 1, left - 1]];
  for (let i = 1; i < count; i++) {
    const guess = left + i * pitch;
    const hit = inner.find((r) => r[0] - HUNT <= guess && guess <= r[1] + HUNT);
    if (hit) {
      cuts.push(hit);
      continue;
    }
    let best = Math.round(guess);
    let dark = [Infinity, Infinity];
    for (let x = Math.round(guess) - HUNT; x <= Math.round(guess) + HUNT; x++) {
      if (x <= left || x >= right) continue;
      const score = [
        columnPeak(px, w, x, y0, y1),
        columnMean(px, w, x, y0, y1),
      ];
      if (score[0] < dark[0] || (score[0] === dark[0] && score[1] < dark[1])) {
        dark = score;
        best = x;
      }
    }
    cuts.push([best, best]);
  }
  cuts.push([right + 1, right + 1]);
  return { cuts, pitch };
}

function crop(px, w, x0, y0, cw, ch) {
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    const src = at(w, x0, y + y0);
    px.copy(out, y * cw * 4, src, src + cw * 4);
  }
  return out;
}

function resample(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const kx = sw / dw;
  const ky = sh / dh;

  for (let dy = 0; dy < dh; dy++) {
    const fy0 = dy * ky;
    const fy1 = fy0 + ky;
    const iy0 = Math.floor(fy0);
    const iy1 = Math.min(sh - 1, Math.ceil(fy1) - 1);

    for (let dx = 0; dx < dw; dx++) {
      const fx0 = dx * kx;
      const fx1 = fx0 + kx;
      const ix0 = Math.floor(fx0);
      const ix1 = Math.min(sw - 1, Math.ceil(fx1) - 1);

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;

      for (let y = iy0; y <= iy1; y++) {
        const wy = Math.min(y + 1, fy1) - Math.max(y, fy0);
        if (wy <= 0) continue;
        for (let x = ix0; x <= ix1; x++) {
          const wx = Math.min(x + 1, fx1) - Math.max(x, fx0);
          if (wx <= 0) continue;
          const i = (y * sw + x) * 4;
          const cover = wx * wy;
          const av = (src[i + 3] / 255) * cover;
          r += src[i] * av;
          g += src[i + 1] * av;
          b += src[i + 2] * av;
          a += av;
          area += cover;
        }
      }

      const o = (dy * dw + dx) * 4;
      out[o] = a > 0 ? clamp8(r / a) : 0;
      out[o + 1] = a > 0 ? clamp8(g / a) : 0;
      out[o + 2] = a > 0 ? clamp8(b / a) : 0;
      out[o + 3] = area > 0 ? clamp8((a / area) * 255) : 0;
    }
  }
  return out;
}

const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

const source = {};

for (const name of NAMES) {
  const file = single(name);
  if (!existsSync(file)) continue;
  const info = probe(file);
  source[name] = {
    px: decode(file),
    w: info.w,
    h: info.h,
    note: `${rel(file)} ${info.w}x${info.h}`,
  };
  console.log(
    `in   ${rel(file)}  ${info.w}x${info.h}  ${kb(statSync(file).size)}`,
  );
}

if (NAMES.some((name) => !source[name])) cutSheet();

function cutSheet() {
  const info = probe(SOURCE);
  const sheet = decode(SOURCE);
  console.log(
    `in   ${rel(SOURCE)}  ${info.w}x${info.h}  ${kb(statSync(SOURCE).size)}`,
  );

  const rows = artRows(sheet, info.w, info.h);
  const { cuts, pitch } = boundaries(
    sheet,
    info.w,
    rows.y0,
    rows.y1,
    NAMES.length,
  );
  console.log(
    `     art rows ${rows.y0}..${rows.y1}  cell pitch ${pitch.toFixed(1)}` +
      `  gaps ${cuts.map(([a, b]) => (a === b ? a : `${a}-${b}`)).join(", ")}`,
  );

  NAMES.forEach((name, i) => {
    if (source[name]) return;
    const x0 = cuts[i][1] + 1 + TRIM;
    const x1 = cuts[i + 1][0] - 1 - TRIM;
    const y0 = rows.y0 + TRIM;
    const y1 = rows.y1 - TRIM;
    const w = x1 - x0 + 1;
    const h = y1 - y0 + 1;
    source[name] = {
      px: crop(sheet, info.w, x0, y0, w, h),
      w,
      h,
      note: `sheet cell ${w}x${h} at ${x0},${y0}`,
    };
  });
}

const packed = [];
NAMES.forEach((name) => {
  const art = source[name];

  const cw = Math.min(art.w, Math.round((art.h * TARGET.w) / TARGET.h));
  const ch = Math.min(art.h, Math.round((cw * TARGET.h) / TARGET.w));
  const cx = Math.round((art.w - cw) / 2);
  const cy = Math.round((art.h - ch) / 2);

  const cell = crop(art.px, art.w, cx, cy, cw, ch);
  const out = resample(cell, cw, ch, TARGET.w, TARGET.h);
  const file = join(OUT_DIR, `portrait-${name}`);

  if (flags.has("--png")) encode(out, TARGET.w, TARGET.h, `${file}.png`);
  encode(out, TARGET.w, TARGET.h, `${file}.webp`, [
    "-c:v",
    "libwebp",
    "-quality",
    QUALITY,
    "-compression_level",
    "6",
    "-preset",
    "photo",
  ]);
  packed.push(out);

  console.log(
    `out  ${rel(file)}.webp  ${TARGET.w}x${TARGET.h}` +
      `  ${kb(statSync(`${file}.webp`).size)}` +
      `  (${art.note}, cropped to ${cw}x${ch})`,
  );
});

if (flags.has("--proof")) {
  const gap = 6;
  const W = (TARGET.w + gap) * packed.length + gap;
  const H = TARGET.h + gap * 2;
  const proof = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) proof[i * 4 + 3] = 255;
  packed.forEach((art, n) => {
    const ox = gap + n * (TARGET.w + gap);
    for (let y = 0; y < TARGET.h; y++) {
      const src = at(TARGET.w, 0, y);
      art.copy(proof, at(W, ox, y + gap), src, src + TARGET.w * 4);
    }
  });
  const file = join(OUT_DIR, "portrait-proof.png");
  encode(proof, W, H, file);
  console.log(`out  ${rel(file)}  (delete when looked at)`);
}

function kb(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`;
}

function rel(p) {
  return p.slice(ROOT.length + 1).replace(/\\/g, "/");
}
