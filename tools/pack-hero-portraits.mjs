/**
 * Cut the six hero portraits out of one sheet and pack them.
 *
 *   node tools/pack-hero-portraits.mjs          # -> src/assets/heroes/portrait-<element>.webp
 *   node tools/pack-hero-portraits.mjs --png    # keep the intermediate PNGs too
 *   node tools/pack-hero-portraits.mjs --proof  # one strip of all six as packed
 *
 * There are two ways in. A hero with a file of their own at
 * `src/source/heroes/portrait-<element>.png` is packed straight from it and the
 * sheet is never consulted for that cell — which is how a portrait gets replaced
 * one at a time, at whatever size it was painted, without a repaint of the other
 * five. Everyone else is cut out of the sheet, and the sheet is only decoded if
 * somebody still needs it.
 *
 * The sheet is `src/source/heroes/portrait-sheet.png`: six portraits in a row,
 * left to right in the roster's own order, each in its own cell — head and
 * shoulders against the backdrop it was painted on, with a dark gap between the
 * cells and a dark margin above and below them.
 *
 * The gaps are the "background" this removes: what lands on disk is six files
 * with one portrait each and none of the sheet's own furniture. The backdrop
 * *inside* a cell is left alone, and that is a decision rather than an omission —
 * it is painted art, blended into hair and shoulder edges, and no threshold
 * separates it from the figure without eating them. Cutting the figures out is a
 * matting job, not a keying job.
 *
 * Finding the gaps is the only real work here. They are not black: the darkest
 * of them averages about 20 of 255 and the brightest about 60, which is also
 * what a shadowed shoulder inside a cell can average. So a column is judged on
 * its *brightest* pixel rather than its average — a gap has no bright pixel
 * anywhere down it, and every cell has a lit face or a gold pauldron somewhere.
 * That finds five of the six gaps outright; the one it misses is missed because
 * the crown in the third cell reaches its edge. So the pitch is measured off the
 * gaps that were found, the missing boundary is predicted from it, and the
 * darkest column within a few pixels of the prediction is taken as the gap. It
 * lands within two pixels of where the eye puts it.
 *
 * They are then packed at the size the sheet actually holds — about 160 by 328 —
 * and not a pixel more. The card cover-fits a portrait into a tile at most 117
 * points tall on a renderer clamped to resolution 2, so 328 is already more rows
 * than the biggest phone ever samples. WebP at 88 rather than lossless: these are
 * paintings with soft gradients, they are six of the largest assets in a build
 * that inlines every byte as base64, and the previous set of busts cost about
 * 120 kB each as PNG.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync, existsSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src/source/heroes/portrait-sheet.png");
const OUT_DIR = join(ROOT, "src/assets/heroes");

/** Where a hero's own file lives, if they have one. */
const single = (name) => join(ROOT, `src/source/heroes/portrait-${name}.png`);

/** Left to right on the sheet, which is the order HEROES is in. */
const NAMES = ["fire", "water", "nature", "lightning", "arcane", "wind"];

/**
 * A column with no pixel brighter than this is a gap between cells, not a cell.
 *
 * 100 of 255. Every cell has something lit in it somewhere down its height — a
 * cheekbone, a gold rim, a glowing eye — and the gaps top out around 60.
 */
const GAP_LEVEL = 100;

/** A row with nothing brighter than GAP_LEVEL is the sheet's own margin. */
const MARGIN_LEVEL = 100;

/** How far either side of a predicted boundary to look for the actual gap. */
const HUNT = 10;

/** Pixels shaved off each side of a cell, so no gap's dark blend rides along. */
const TRIM = 2;

/** What each portrait is packed to. */
const TARGET = { w: 160, h: 328 };

/** WebP quality. Paintings, not line art: lossless would triple the bytes. */
const QUALITY = "88";

/* ------------------------------------------------------------------- ffmpeg */

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

/* -------------------------------------------------------------------- pixels */

const at = (w, x, y) => (y * w + x) * 4;
const lum = (px, i) => (px[i] * 2 + px[i + 1] * 5 + px[i + 2]) / 8;

/** Brightest pixel down one column, between `y0` and `y1`. */
function columnPeak(px, w, x, y0, y1) {
  let peak = 0;
  for (let y = y0; y <= y1; y++) peak = Math.max(peak, lum(px, at(w, x, y)));
  return peak;
}

/** Mean brightness down one column — how a gap is picked out of near-gaps. */
function columnMean(px, w, x, y0, y1) {
  let sum = 0;
  for (let y = y0; y <= y1; y++) sum += lum(px, at(w, x, y));
  return sum / (y1 - y0 + 1);
}

/** The band of rows that is art rather than the sheet's margin. */
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

/** Runs of columns with nothing lit down them: the gaps, and the outer margins. */
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

/**
 * The seven boundaries between and around six cells: two margins and five gaps.
 *
 * A gap that was found is used as it was found — its whole run, so the cell on
 * either side is cut at the edge of the gap rather than at the middle of it. Only
 * the ones that are missing are predicted, and one always is: a cell whose art
 * runs bright to its own edge leaves no unlit column to give itself away. The
 * pitch between the two outer margins says where a missing boundary has to be,
 * and the darkest column within HUNT of there is taken as the gap.
 *
 * Darkest by peak first and mean as the tiebreak, in that order and not the other
 * way round. Judged on the mean alone the hunt walks off the gap and onto a
 * neighbouring column of shadowed cloak, which averages lower than a gap that is
 * merely dark grey — and a cut two pixels inside a cell leaves a black band down
 * one edge of the portrait, which is exactly what it did.
 */
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

/** Area-average down, weighting colour by alpha. Same filter as the other packers. */
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

/* --------------------------------------------------------------------- main */

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

/**
 * Every hero's art at full size, before any packing: `{px, w, h, note}`.
 *
 * A hero with a file of their own is read from it. Whoever is left is cut out of
 * the sheet — and the sheet is only probed and decoded if somebody is left, so a
 * roster that has been fully repainted one portrait at a time no longer needs it
 * on disk at all.
 */
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

/** Fill in everyone who did not bring their own file. */
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

  // Cropped to the target's aspect before the resample, not squashed into it.
  // The sheet's cells run from 154 to 174 wide over the same 324 rows, and the
  // single files come in at whatever they were painted at, so scaling each one
  // straight into a single box would draw one face 9% narrower than another in
  // the same row. Taken off the middle, because that is where a portrait's
  // subject is.
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
