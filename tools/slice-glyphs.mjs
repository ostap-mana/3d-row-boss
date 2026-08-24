/**
 * Cut a contact sheet of separate shapes into one PNG each, found rather than
 * measured.
 *
 *   node tools/slice-glyphs.mjs src/assets/numbers/image.png 1 2 3 4 5 6 7 8 9
 *   node tools/slice-glyphs.mjs sheet.png --prefix=digit --out=src/assets/numbers
 *   node tools/slice-glyphs.mjs sheet.png --box        # common box, not tight
 *
 * The third slicing tool in here, and the reason it is a third rather than a
 * flag on either of the other two is what it is given to work with.
 *
 * tools/slice-pack.mjs cuts by hand-authored rectangles, stored as fractions of
 * the sheet. That is the right answer when the layout is a decision somebody
 * made and wrote down — re-export the sheet at another resolution and the
 * fractions still hold. It is the wrong answer for a sheet somebody was handed,
 * where the layout is whatever the artist happened to do and typing out nine
 * boxes by eye is nine chances to clip a serif.
 *
 * tools/cut-glow.mjs splits on empty rows, which is all a stack of bars needs.
 * A grid of glyphs has two axes and the columns do not line up between rows —
 * five digits over four, on this sheet — so rows and columns cannot both be
 * found by projection without cutting one of them wrong.
 *
 * So this one finds the shapes themselves: every run of touching pixels is one
 * asset. Nothing about the layout is assumed except that two glyphs do not
 * touch, which is a property of the art rather than of the grid, and it holds
 * for a sheet laid out in rows, in a ring, or thrown down at random.
 *
 * What it does assume is a real alpha channel. This sheet has one — 62% of it is
 * a clean zero — so there is no backdrop to cut and none of cut-bg's or
 * cut-glow's machinery is wanted. What it does need is ALPHA_FULL: the art tops
 * out at 254, so left alone every glyph would render very slightly see-through.
 *
 * ffmpeg is the only dependency, and only to decode and encode PNG.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Alpha at or above which a pixel belongs to a shape.
 *
 * Low, because it decides membership and not opacity. A glyph with a soft edge
 * fades to nothing over two or three pixels, and every one of those pixels is
 * part of the glyph — the number that matters is only how much of the edge gets
 * carried into the crop, and eight is under one level in thirty.
 */
const FLOOR = 8;

/**
 * Alpha the art is normalised so its solid interior reaches.
 *
 * The sheet peaks at 254 rather than 255, over 345,000 pixels of it, which is a
 * quantised export and not a decision anybody made: the digits are meant to be
 * opaque. Scaling by 255/254 rather than clamping keeps the soft edge a ramp
 * instead of pushing its top step flat.
 */
const ALPHA_FULL = 255;

/**
 * Smallest run of touching pixels that is a shape rather than a speck, as a
 * fraction of the sheet's area.
 *
 * A hundredth of a percent. On a 1536x1024 sheet that is 157 pixels, which is
 * three orders of magnitude under the smallest digit here and still well clear
 * of the stray anti-aliased dot a lossy export leaves behind.
 */
const SPECK = 0.0001;

/**
 * How much two shapes have to overlap vertically to be called the same row, as
 * a fraction of the shorter one's height.
 *
 * Half. Digits on one line overlap almost entirely; a 7 and a 4 on separate
 * lines do not overlap at all. Nothing on a sheet like this lands near the
 * boundary, which is why a plain threshold is enough and no clustering is
 * needed.
 */
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

/**
 * Every run of touching pixels on the sheet, as a box and a pixel count.
 *
 * Eight-connected, so a shape joined only corner to corner is still one shape —
 * a diagonal stroke on a soft edge can thin to exactly that, and four-connected
 * labelling would saw a 7 in half at the bend.
 *
 * The frontier is an explicit array rather than recursion. A glyph on this sheet
 * is around sixty thousand pixels and a recursive fill would be sixty thousand
 * frames deep.
 */
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

/**
 * Put the shapes in reading order: rows down the sheet, and left to right
 * within a row.
 *
 * Sorting on y alone would interleave the two lines wherever one glyph sits a
 * few pixels higher than its neighbour — which on this sheet is most of them,
 * because a 7 has no descender and a 9 does.
 */
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

/**
 * Lift one shape out of the sheet, with its alpha pushed up to opaque.
 *
 * `box` overrides the crop, which is how --box gives every glyph the same
 * canvas: the shape keeps its own position inside a taller frame, so the set can
 * be drawn side by side without carrying a table of offsets around.
 */
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

/** Scale the whole sheet's alpha so its strongest pixel lands on opaque. */
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

/* ---------------------------------------------------------------------- run */

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

// The common frame, when --box is on: the tallest shape's height, over the
// highest top and under the lowest bottom, so nothing is clipped and every
// glyph keeps where it sat on the line.
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
