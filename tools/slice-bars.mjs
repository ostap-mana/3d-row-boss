import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src/source/board/bars/sheet.png");

const OUT_DIR = join(ROOT, "src/source/board/bars");

const BARS = ["green", "blue"];

const SHEET_COPIES = 2;

const SAT = 40;

const RUN = 100;

const BAND_PAD = 2;

const REF_INSET = 3;

const COVER = { floor: 0.08, full: 0.85 };

const EMPTY = 12;

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
const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

function saturation(px, w, x, y) {
  const i = at(w, x, y);
  return (
    Math.max(px[i], px[i + 1], px[i + 2]) -
    Math.min(px[i], px[i + 1], px[i + 2])
  );
}

function bands(px, w, h) {
  const runs = [];
  let start = -1;
  for (let y = 0; y < h; y++) {
    let lit = 0;
    for (let x = 0; x < w; x += 2) {
      if (saturation(px, w, x, y) > SAT && ++lit >= RUN) break;
    }
    if (lit >= RUN) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      runs.push([start, y - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, h - 1]);
  return runs;
}

function span(px, w, y) {
  let x0 = 0;
  while (x0 < w && saturation(px, w, x0, y) <= SAT) x0++;
  let x1 = w - 1;
  while (x1 > x0 && saturation(px, w, x1, y) <= SAT) x1--;
  return { x0, x1 };
}

function bandBox(px, w, h, band) {
  const [top, bottom] = band;
  const wide = span(px, w, (top + bottom) >> 1);
  const x0 = Math.max(0, wide.x0 - BAND_PAD);
  const y0 = Math.max(0, top - BAND_PAD);
  const x1 = Math.min(w - 1, wide.x1 + BAND_PAD);
  const y1 = Math.min(h - 1, bottom + BAND_PAD);
  return {
    x0,
    y0,
    x1,
    y1,
    w: x1 - x0 + 1,
    h: y1 - y0 + 1,
    top,
    bottom,
    span: wide,
  };
}

const colourDist = (r, g, b, to) => Math.hypot(r - to[0], g - to[1], b - to[2]);

function fieldColour(px, w, box) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (const y of [box.y0, box.y1]) {
    for (let x = box.x0; x <= box.x1; x += 4) {
      const i = at(w, x, y);
      r += px[i];
      g += px[i + 1];
      b += px[i + 2];
      n++;
    }
  }
  return [r / n, g / n, b / n];
}

function cutBackdrop(px, w, box, field) {
  const out = Buffer.alloc(box.w * box.h * 4);
  const cx = (box.span.x0 + box.span.x1) >> 1;
  let feathered = 0;
  let cleared = 0;

  for (let y = 0; y < box.h; y++) {
    const sy = box.y0 + y;
    const ry = Math.min(
      Math.max(sy, box.top + REF_INSET),
      box.bottom - REF_INSET,
    );
    const ri = at(w, cx, ry);
    const ref = colourDist(px[ri], px[ri + 1], px[ri + 2], field);

    for (let x = 0; x < box.w; x++) {
      const s = at(w, box.x0 + x, sy);
      const raw =
        ref > 0 ? colourDist(px[s], px[s + 1], px[s + 2], field) / ref : 0;
      if (raw <= COVER.floor) {
        cleared++;
        continue;
      }
      const a = raw >= COVER.full ? 1 : raw;
      if (a < 1) feathered++;

      const o = at(box.w, x, y);
      out[o] = clamp8((px[s] - field[0] * (1 - a)) / a);
      out[o + 1] = clamp8((px[s + 1] - field[1] * (1 - a)) / a);
      out[o + 2] = clamp8((px[s + 2] - field[2] * (1 - a)) / a);
      out[o + 3] = clamp8(a * 255);
    }
  }
  return { px: out, feathered, cleared };
}

function inkBox(px, w, h) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[at(w, x, y) + 3] <= EMPTY) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function crop(px, w, box) {
  const out = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const src = at(w, box.x0, y + box.y0);
    px.copy(out, y * box.w * 4, src, src + box.w * 4);
  }
  return out;
}

function boxDiff(px, w, a, b) {
  const cw = Math.min(a.w, b.w);
  const ch = Math.min(a.h, b.h);
  let worst = 0;
  let sum = 0;
  let n = 0;
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      for (let c = 0; c < 3; c++) {
        const d = Math.abs(
          px[at(w, a.x0 + x, a.y0 + y) + c] - px[at(w, b.x0 + x, b.y0 + y) + c],
        );
        if (d > worst) worst = d;
        sum += d;
        n++;
      }
    }
  }
  return { worst, mean: sum / Math.max(1, n) };
}

const info = probe(SRC);
const sheet = decode(SRC);
console.log(`in   ${rel(SRC)}  ${info.w}x${info.h}  ${kb(statSync(SRC).size)}`);

const rows = bands(sheet, info.w, info.h);
const wanted = BARS.length * SHEET_COPIES;
if (rows.length !== wanted) {
  throw new Error(
    `expected ${wanted} bars on the sheet — ${BARS.length} in ` +
      `${SHEET_COPIES} copies — found ${rows.length}`,
  );
}

const cuts = BARS.map((colour, i) => {
  const band = bandBox(sheet, info.w, info.h, rows[i]);
  const field = fieldColour(sheet, info.w, band);
  const cutout = cutBackdrop(sheet, info.w, band, field);

  const ink = inkBox(cutout.px, band.w, band.h);
  const art = { px: crop(cutout.px, band.w, ink), w: ink.w, h: ink.h };
  const file = join(OUT_DIR, `${colour}.png`);

  encode(art.px, art.w, art.h, file);
  console.log(
    `\nout  ${rel(file)}  ${art.w}x${art.h}  ${kb(statSync(file).size)}`,
  );
  console.log(
    `     band at ${band.span.x0},${band.top}` +
      `  ${band.span.x1 - band.span.x0 + 1}x${band.bottom - band.top + 1}`,
  );
  console.log(
    `     field rgb ${field.map((v) => Math.round(v)).join(",")}` +
      `  -> ${cutout.cleared} px cleared, ${cutout.feathered} feathered`,
  );

  for (let c = 1; c < SHEET_COPIES; c++) {
    const twin = bandBox(sheet, info.w, info.h, rows[i + c * BARS.length]);
    const d = boxDiff(sheet, info.w, band, twin);
    console.log(
      `     copy ${c} at y ${twin.top}: worst ${d.worst}/255, ` +
        `mean ${d.mean.toFixed(2)}  (not cut)`,
    );
  }
  return art;
});

if (process.argv.includes("--preview")) {
  const gap = 12;
  const W = Math.max(...cuts.map((c) => c.w)) + gap * 2;
  const H = cuts.reduce((t, c) => t + c.h + gap, gap);
  const proof = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    proof[i * 4] = 255;
    proof[i * 4 + 2] = 255;
    proof[i * 4 + 3] = 255;
  }
  let oy = gap;
  for (const c of cuts) {
    for (let y = 0; y < c.h; y++) {
      for (let x = 0; x < c.w; x++) {
        const s = at(c.w, x, y);
        const d = at(W, gap + x, oy + y);
        const a = c.px[s + 3] / 255;
        for (let k = 0; k < 3; k++) {
          proof[d + k] = Math.round(proof[d + k] * (1 - a) + c.px[s + k] * a);
        }
      }
    }
    oy += c.h + gap;
  }
  const file = join(OUT_DIR, "_preview.png");
  encode(proof, W, H, file);
  console.log(`\nout  ${rel(file)}  (delete when looked at)`);
}

function kb(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`;
}

function rel(p) {
  return p.slice(ROOT.length + 1).replace(/\\/g, "/");
}
