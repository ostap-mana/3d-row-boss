/**
 * Cut the bar sheet into one PNG per colour: the green bar and the blue one.
 *
 *   node tools/slice-bars.mjs                 # -> green.png, blue.png
 *   node tools/slice-bars.mjs --preview       # both cuts on magenta, to look at
 *
 * The source is `src/source/board/bars/sheet.png`: four bars on a flat near-black
 * field, 1113x103 each, green over blue and then the same two again. What comes
 * out is each colour on its own, in the same folder, at the size it was painted,
 * with the field gone — the two files the card's gauges are made of.
 *
 * This is a slicer, not a packer — the distinction matters in this repo. A packer
 * reduces art to the size the game draws it at and encodes it for the bundle,
 * which is what tools/pack-bars.mjs does with these two files. This cuts at full
 * resolution and leaves it as PNG: what it makes is the bars as painted,
 * separated, not something the build is going to inline.
 *
 * THE FIELD IS NOT TRANSPARENT, and that is the one real problem this sheet has.
 * A bar on it is a *picture* of a bar on black: its outermost rows and its four
 * corner arcs are blends of the art and the field, so a slab cut straight out of
 * it carries the field along inside it, and a gauge drawn from that has a dark
 * fringe along its lit edge over the lighter half of a trough.
 *
 * So the field comes off in one pass, and the pass is arithmetic rather than a
 * threshold — see `cutBackdrop`. A blended pixel is `a*C + (1-a)*B` for the bar's
 * colour C, the field's B and some coverage a, so its distance from B is exactly
 * `a` times C's distance from B: measure both distances and the coverage falls
 * out. What is left is the coverage in the alpha and C recovered in the colour,
 * which is a cutout — the bar, on nothing, at full strength. A rounded-rectangle
 * mask cannot do this: it has to be told where the arc is, and every pixel of the
 * blend it calls opaque keeps its share of the field mixed into the colour.
 *
 * Both readings of B and C are taken off the file. B is averaged from the field
 * just outside each band, because a sheet exported at another gamma would make a
 * constant here a lie; C is read from the middle of the row being cut, held
 * REF_INSET rows inside the bar so an edge row is referenced against the art and
 * not against another blend of itself.
 *
 * There is no corner radius written down in here at all, and nothing measures
 * one. The arcs are whatever coverage they turn out to have, which is the point.
 *
 * The sheet carries each bar twice — SHEET_COPIES — and the copies are the same
 * art: sampled end to end they differ by under 2 of 255 on average, which is an
 * encoder's noise and not a variant. So two files come off four bars, the first
 * of each colour, and the copy is measured and printed rather than cut: a sheet
 * whose copies ever stop matching says so in the log instead of quietly losing
 * whichever one came second. A sheet with three bars on it, or five, is a sheet
 * this code has not been told about, and it stops rather than guess which of them
 * are the pair.
 *
 * Written as PNG, which is lossless: gradients and a thin lit rim are exactly
 * what a lossy encoder bands and smears, and these two files are the last
 * full-resolution copy of the bars that anything downstream reads.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src/source/board/bars/sheet.png");

/**
 * Where the cuts land, and what they are called: `<colour>.png`, beside the sheet
 * they came off. Nothing here moves them somewhere tidier — the folder is where
 * the art was put, and it is where the two halves of it stay.
 */
const OUT_DIR = join(ROOT, "src/source/board/bars");

/**
 * The bars the sheet has, in the order it has them, and what each one is called.
 *
 * Named for the colour they were painted rather than the gauge they end up in.
 * Which one is health and which is charge is pack-bars.mjs's business, and the
 * sheet does not know: it has a green bar and a blue one.
 */
const BARS = ["green", "blue"];

/**
 * How many times the sheet repeats the set.
 *
 * Two: green, blue, green, blue. Declared rather than inferred, for the reason
 * the header gives.
 */
const SHEET_COPIES = 2;

/**
 * Saturation above which a pixel is bar rather than field.
 *
 * 40 of 255. The field is #050a10, which spreads under 20; the darkest row of
 * any bar on the sheet spreads more than 100. It is only ever asked about whole
 * rows — see `bands` — so this decides where the bands are, never where an edge
 * is: the edges are cut by coverage, which needs no threshold at all.
 */
const SAT = 40;

/** A row needs this many coloured pixels along it to count as bar. */
const RUN = 100;

/**
 * Rows and columns of field kept around a band, for the cut to feather into.
 *
 * Two. `bands` finds the rows that are unmistakably bar, which leaves out
 * whatever the outermost blend of art and field measures as; if the box stopped
 * there, the cut would begin halfway through the edge it is meant to recover. So
 * the box is opened up until it is standing on field on all four sides, and
 * `cutBackdrop` decides where the art actually starts.
 */
const BAND_PAD = 2;

/**
 * How far inside a bar the colour a row is cut against is read from.
 *
 * Three rows. The coverage of a blended pixel is its distance from the field over
 * the bar colour's distance from the field, so the bar colour has to be the art —
 * and on the top and bottom rows of a bar, the pixel in hand *is* the blend.
 * Referenced against itself every edge row measures as fully covered and keeps
 * the field mixed into it, which is the fringe this pass exists to remove. Three
 * is past the widest blend on this sheet — the profile is field, one part row,
 * then the lit edge at full strength — and shallow enough that the reference is
 * still that lit edge rather than the body under it.
 */
const REF_INSET = 3;

/**
 * Where the coverage a pixel measures at stops being believed.
 *
 * The ratio in `cutBackdrop` is exact arithmetic on inexact numbers, and both
 * ends of it need a limit that comes off this sheet's own noise:
 *
 *   floor  under 8% is the field disagreeing with its own average. A lossy save
 *          leaves the flat field spread about 10 of 255, against a reference
 *          distance of about 150, so field noise measures at 0.07 and under and
 *          nothing that is actually art comes anywhere near it. Below this the
 *          pixel is cleared outright, because a field left at 5% alpha is not
 *          transparent — it is a grey haze that `inkBox` will count as art.
 *   full   over 85% is the bar disagreeing with its own row. A row varies along
 *          its own length by up to 17 of 255 — pack-bars.mjs prints that number —
 *          which puts the darkest pixel of the lit edge at 0.89 of the reference
 *          taken from the middle of it. Art within that much of the reference is
 *          art, and rounding it to opaque is what keeps a solid bar solid instead
 *          of shipping it at 95% alpha over a dark trough.
 *
 * Between the two the ratio is used as measured: the real blends on this sheet —
 * the outermost row of a bar, the corner arcs — come in at 0.7 and below, well
 * clear of `full`, and they are exactly what this pass is here to recover.
 */
const COVER = { floor: 0.08, full: 0.85 };

/** Alpha at or under this is nothing, not art. */
const EMPTY = 12;

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
const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

/** How far a pixel is from grey — the whole of the bar/field test. */
function saturation(px, w, x, y) {
  const i = at(w, x, y);
  return (
    Math.max(px[i], px[i + 1], px[i + 2]) -
    Math.min(px[i], px[i + 1], px[i + 2])
  );
}

/**
 * The bands of rows the bars occupy, top to bottom.
 *
 * A row is bar if RUN of the pixels along it are coloured. Every row of every bar
 * clears that by an order of magnitude and no row of the field comes near it, so
 * the runs come out clean and there is no gap-hunting to do here of the kind the
 * portrait sheet needs.
 */
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

/** How far the coloured pixels reach along one row. */
function span(px, w, y) {
  let x0 = 0;
  while (x0 < w && saturation(px, w, x0, y) <= SAT) x0++;
  let x1 = w - 1;
  while (x1 > x0 && saturation(px, w, x1, y) <= SAT) x1--;
  return { x0, x1 };
}

/**
 * One band of the sheet, opened up by BAND_PAD so it stands on field all round.
 *
 * `top` and `bottom` come along because the cut needs to know where the art is
 * sure to be — see REF_INSET — and that is the band as found, not the padded box.
 * The span is read off the middle row: the ends are round, so the widest row is
 * the one halfway down.
 */
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

/** Straight-line distance between two colours. */
const colourDist = (r, g, b, to) => Math.hypot(r - to[0], g - to[1], b - to[2]);

/**
 * The colour of the field a band is lying on, averaged off the field itself.
 *
 * Off the outermost rows of the padded box, which BAND_PAD guarantees are field
 * for their whole length. Averaged rather than sampled at a point because a lossy
 * save leaves no two pixels of a flat colour quite equal, and every pixel of the
 * band is about to be measured against this one number.
 */
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

/**
 * The band with its field divided back out: coverage in the alpha, the bar's own
 * colour at full strength in the rest.
 *
 * The arithmetic is in the header. Per row rather than per bar, because a bar is
 * a vertical bevel — the colour it is cut against has to be the colour of the row
 * being cut, or the lit edge measures as under-covered against the body's darker
 * green and comes out of here half transparent.
 */
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

/** Tightest box holding every pixel the eye can see. */
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

/**
 * How far two boxes of the sheet differ, worst channel and mean.
 *
 * Over the smaller of the two where they disagree by a row, because a band found
 * a pixel taller than its twin is the saturation test catching one more blended
 * edge row, not a different bar.
 */
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

/* --------------------------------------------------------------------- main */

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

  // Tight, because the padding was only ever scaffolding for the cut: every
  // pixel of it left `cutBackdrop` cleared, and a file that carries it is a
  // couple of transparent rows taller than the bar it holds.
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

  // The copy of this bar further down the sheet, measured and not cut. See the
  // header: the number is here so a sheet whose copies drift apart says so.
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
  // On magenta, because the whole point of the cut is the alpha: a fringe of the
  // field it came off is invisible against anything dark.
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
