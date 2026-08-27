/**
 * Pack the doom strip's two paints — the empty track, and the charge in it.
 *
 *   node tools/pack-doom.mjs          # -> src/assets/doom/doom-*.webp
 *   node tools/pack-doom.mjs --png    # keep the intermediate PNGs too
 *
 * The strip used to be drawn rather than painted: two rounded rectangles in
 * ui/hud.js, a near-black track at 0x1c0a12 and a flat 0xffa030 over it. Flat
 * orange next to a painted health bar, on a screen where everything else is
 * art — it read as a placeholder because it was one.
 *
 * Both sources are Invokers Titan Legacy's own HUD, lifted out of the build's
 * Addressables atlases:
 *
 *   track.png  514x36  `S_GameLoading_ProgressBar_Background`. A dark navy body
 *                      between two lit edge lines, ending in a cyan chevron at
 *                      each end. Only the body is packed — see `slab`. The
 *                      chevrons are dropped on purpose: this is a paint and not
 *                      a shape, and the shape it gets poured into is the boss
 *                      bar's own mitre. Two different points on one gauge would
 *                      fight, and the whole argument for the strip is that it
 *                      and the health bar read as one.
 *   fill.png   497x21  `S_TitanMaterFill`. The charge: amber at the left, gold
 *                      through the middle, nearly white at the right.
 *
 * The fill keeps its full width and the track does not, and that difference is
 * the only interesting decision in here. A track has nothing along its length —
 * every column of that navy body is the one before it — so a slab out of the
 * middle stretches to any width and the file is 60 columns instead of 500. The
 * fill has a ramp along its length, and the ramp is the point of it: the strip
 * is poured at the bar's full width and then cropped back to the reading, so a
 * clock at a third shows the amber end and a full one runs all the way out to
 * the pale. Reduce that to a slab and the charge is one flat colour that could
 * have been a tint.
 *
 * Rows are trimmed to the solid band at both ends. An exported sprite feathers
 * its top and bottom row into nothing, and a feathered row poured into a
 * silhouette five points tall is a fifth of the gauge given over to a fade.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const JOBS = [
  {
    src: "src/source/doom/track.png",
    out: "src/assets/doom/doom-track.webp",
    /**
     * A slab out of the middle, because nothing in this body varies along it.
     * Measured rather than assumed — the tool prints how far the widest row
     * strays across the span it kept, and the number to watch is in the log.
     */
    slab: true,
    what: "doom track",
  },
  {
    src: "src/source/doom/fill.png",
    out: "src/assets/doom/doom-fill.webp",
    slab: false,
    /**
     * Keep the ramp, throw away the resolution it was drawn at.
     *
     * The paint is stretched to the bar's baked width — around 950 texture
     * pixels on a phone at 2x — so the 486 columns it arrives with are being
     * magnified either way, and a smooth ramp magnified from 96 columns is the
     * same ramp. Measured against the full-width file resampled to the same bar:
     *
     *   486  6.3 kB  error 0/255   <- what it costs to keep every column
     *   320  4.7 kB  error 3
     *   240  3.3 kB  error 3
     *   160  2.2 kB  error 4
     *    96  1.2 kB  error 4       <- ships
     *    64  0.9 kB  error 5
     *
     * The error stops falling at 160 and the file keeps falling, which is the
     * whole reason to go past it. Four levels of 255 on a gradient nobody is
     * looking at directly is not visible; five kilobytes of a single-file
     * creative is. Lossy at quality 92 lands in the same place for the same
     * bytes and rings on the ramp, so this stays lossless and narrow instead.
     */
    maxWidth: 96,
    what: "doom charge",
  },
];

/** Alpha at or above which a pixel counts as inside the art. */
const SOLID = 128;

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
    { maxBuffer: 1 << 30 },
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
    { input: buf, maxBuffer: 1 << 30 },
  );
}

/* --------------------------------------------------------------------- crop */

/** First and last row in which at least half the columns are solid. */
function solidRows(px, w, h) {
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] >= SOLID) n++;
    if (n > w * 0.5) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  return { top, bottom };
}

/** First and last column that is solid from the top of the band to the bottom. */
function solidCols(px, w, top, bottom) {
  let left = -1;
  let right = -1;
  for (let x = 0; x < w; x++) {
    let all = true;
    for (let y = top; y <= bottom; y++) {
      if (px[(y * w + x) * 4 + 3] < SOLID) {
        all = false;
        break;
      }
    }
    if (all) {
      if (left < 0) left = x;
      right = x;
    }
  }
  return { left, right };
}

/** Copy a rectangle out into its own buffer. */
function cut(px, w, x0, x1, y0, y1) {
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    px.copy(
      out,
      y * cw * 4,
      ((y0 + y) * w + x0) * 4,
      ((y0 + y) * w + x1 + 1) * 4,
    );
  }
  return { px: out, w: cw, h: ch };
}

/**
 * The worst any row strays along the span, in levels of 255.
 *
 * This is what says whether a slab is honest. A track whose rows are flat to
 * within a couple of levels stretches to any width and nobody can tell; one
 * that ramps has a picture along its length and must not be reduced to 60
 * columns. Printed rather than asserted — the number belongs in the log next to
 * the decision it justifies.
 */
function lengthwiseSpread(px, w, h) {
  let worst = 0;
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      let lo = 255;
      let hi = 0;
      for (let x = 0; x < w; x++) {
        const v = px[(y * w + x) * 4 + c];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo > worst) worst = hi - lo;
    }
  }
  return worst;
}

/**
 * Area-average down to `dw` columns, keeping every row.
 *
 * The same box filter the other pack tools use. Only the width moves here: the
 * rows are the bevel and there are twenty-one of them for a strip that draws at
 * ten texture pixels, which is already the headroom a 3x screen wants.
 */
function narrow(px, w, h, dw) {
  const out = Buffer.alloc(dw * h * 4);
  const k = w / dw;
  for (let y = 0; y < h; y++) {
    for (let dx = 0; dx < dw; dx++) {
      const fx0 = dx * k;
      const fx1 = fx0 + k;
      const ix0 = Math.floor(fx0);
      const ix1 = Math.min(w - 1, Math.ceil(fx1) - 1);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      for (let x = ix0; x <= ix1; x++) {
        const cover = Math.min(x + 1, fx1) - Math.max(x, fx0);
        if (cover <= 0) continue;
        const i = (y * w + x) * 4;
        const av = (px[i + 3] / 255) * cover;
        r += px[i] * av;
        g += px[i + 1] * av;
        b += px[i + 2] * av;
        a += av;
        area += cover;
      }
      const o = (y * dw + dx) * 4;
      out[o] = a > 0 ? Math.round(r / a) : 0;
      out[o + 1] = a > 0 ? Math.round(g / a) : 0;
      out[o + 2] = a > 0 ? Math.round(b / a) : 0;
      out[o + 3] = area > 0 ? Math.round((a / area) * 255) : 0;
    }
  }
  return out;
}

/* --------------------------------------------------------------------- main */

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const kb = (file) => (statSync(file).size / 1024).toFixed(1);

mkdirSync(join(ROOT, "src/assets/doom"), { recursive: true });

for (const job of JOBS) {
  const source = join(ROOT, job.src);
  const out = join(ROOT, job.out);

  const info = probe(source);
  const raw = decode(source);

  const { top, bottom } = solidRows(raw, info.w, info.h);
  if (top < 0) throw new Error(`${job.src}: nothing solid in it`);
  const { left, right } = solidCols(raw, info.w, top, bottom);
  if (left < 0)
    throw new Error(`${job.src}: no column is solid through the band`);

  let x0 = left;
  let x1 = right;
  if (job.slab) {
    // A slab out of the dead centre, wide enough that the encoder has something
    // to chew on and narrow enough to be worth doing at all.
    const mid = ((left + right) / 2) | 0;
    const half = Math.min(30, ((right - left) / 2) | 0);
    x0 = mid - half;
    x1 = mid + half;
  }

  const art = cut(raw, info.w, x0, x1, top, bottom);
  const spread = lengthwiseSpread(art.px, art.w, art.h);

  if (job.maxWidth && art.w > job.maxWidth) {
    art.px = narrow(art.px, art.w, art.h, job.maxWidth);
    art.w = job.maxWidth;
  }

  if (flags.has("--png")) {
    encode(art.px, art.w, art.h, out.replace(/\.webp$/, ".png"));
  }
  encode(art.px, art.w, art.h, out, [
    "-c:v",
    "libwebp",
    "-lossless",
    "1",
    "-compression_level",
    "6",
  ]);

  console.log(
    `${job.what.padEnd(12)} ${info.w}x${info.h}` +
      ` -> rows ${top}..${bottom}, cols ${x0}..${x1}` +
      ` -> ${art.w}x${art.h}` +
      `   lengthwise spread ${spread}/255` +
      `   ${kb(source).padStart(7)} kB -> ${kb(out).padStart(6)} kB`,
  );
}
