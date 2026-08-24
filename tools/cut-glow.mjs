/**
 * Cut a sheet of glowing bars off its black backdrop, one asset per bar.
 *
 *   node tools/cut-glow.mjs src/source/ui/bar-sheet.png hp-strip doom-strip
 *   node tools/cut-glow.mjs sheet.png a b --out=src/assets/ui --preview
 *
 * A different problem from tools/cut-bg.mjs, and the reason that tool cannot be
 * pointed at this. cut-bg cuts a *subject* off a light checkerboard: it decides
 * per pixel whether it is looking at backdrop or at art, floods in from the
 * border so a white highlight inside the subject is not punched through, and
 * feathers the two-pixel boundary where they blend.
 *
 * A neon bar on black has no boundary to feather and no inside to protect. It is
 * a glow, which means every pixel from the core out to the last visible breath of
 * it is *partly* backdrop — that is what a glow is. Asked which side of the line
 * those pixels fall on, the honest answer is both, and any threshold that has to
 * pick one throws the falloff away and leaves a bar with a hard edge and a halo
 * sawn off around it.
 *
 * But black is not an arbitrary backdrop. A glow over black is exactly what a
 * glow composited *additively* looks like, so the sheet is already the premulti-
 * plied form of the asset that is wanted:
 *
 *   pixel = colour * alpha  +  black * (1 - alpha)  =  colour * alpha
 *
 * which inverts. `alpha = max(r,g,b)` — the channel the glow has most of, and
 * the only one that can be trusted to reach full at the core — and the colour is
 * the pixel divided back through it. No threshold, no flood, no feather: every
 * pixel keeps the alpha it always had and the recovered file composites over any
 * background the same way the sheet composited over its own.
 *
 * What is thresholded is only where one bar ends and the next begins, and that
 * is measured rather than assumed — see bands() and box().
 *
 * ffmpeg is the only dependency, and only to decode and encode PNG, which is
 * what tools/cut-bg.mjs and tools/slice-pack.mjs already assume.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Signal floor, out of 255, for deciding where a bar is.
 *
 * Two, not zero. The sheet is 82% pure black and everything above zero on it is
 * either glow or the encoder's ringing around glow, so this is only ever asking
 * "did anything happen in this row" — and at two, one stray level of noise is
 * not a bar and the outermost breath of a real glow still is.
 *
 * It sets the crop, never the alpha. A pixel below this inside a bar's own box
 * keeps whatever alpha it has, which for a glow's tail is the point.
 */
const FLOOR = 2;

/** Empty rows that have to separate two bars for them to count as two. */
const SPLIT = 4;

/** What --preview composites onto: the HUD's own arena at its darkest. */
const PREVIEW_BG = [26, 18, 34];

function decode(file) {
  const dims = execFileSync("ffprobe", [
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

  const [w, h] = dims;
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

/** Strongest channel at a pixel — the glow's own alpha, before it was baked. */
function level(px, i) {
  return Math.max(px[i], px[i + 1], px[i + 2]);
}

/**
 * Runs of rows that have anything in them, top to bottom.
 *
 * Runs closer together than SPLIT are joined: a bar with a gap in its own glow
 * is still one bar, and the sheet's two are fifteen empty rows apart.
 */
function bands({ w, h, px }) {
  const on = new Array(h).fill(false);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (level(px, (y * w + x) * 4) > FLOOR) {
        on[y] = true;
        break;
      }
    }
  }

  const out = [];
  let start = -1;
  let blank = 0;
  for (let y = 0; y <= h; y++) {
    if (y < h && on[y]) {
      if (start < 0) start = y;
      blank = 0;
    } else if (start >= 0) {
      blank++;
      if (blank >= SPLIT || y === h) {
        out.push({ y0: start, y1: y - blank });
        start = -1;
        blank = 0;
      }
    }
  }
  return out;
}

/** Tighten a band's box on the horizontal axis too. */
function box({ w, px }, band) {
  let x0 = w;
  let x1 = -1;
  for (let y = band.y0; y <= band.y1; y++) {
    for (let x = 0; x < w; x++) {
      if (level(px, (y * w + x) * 4) <= FLOOR) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
    }
  }
  return { ...band, x0, x1 };
}

/**
 * Lift one box out of the sheet, dividing the backdrop back out of it.
 *
 * The alpha is the strongest channel and the colour is the pixel over that
 * alpha, which is the premultiplied form undone. A core pixel comes back
 * unchanged, because its strongest channel was already full; a pixel a tenth of
 * the way down the falloff comes back at the same hue with a tenth of the alpha,
 * which is what it was drawn as before it was flattened onto black.
 */
function lift({ w, px }, b) {
  const bw = b.x1 - b.x0 + 1;
  const bh = b.y1 - b.y0 + 1;
  const out = Buffer.alloc(bw * bh * 4);

  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = ((y + b.y0) * w + (x + b.x0)) * 4;
      const o = (y * bw + x) * 4;
      const a = level(px, i);
      if (a === 0) continue;
      // Rounded, then clamped: the division is exact at the core and can land a
      // level over 255 on a tail pixel the encoder rounded up.
      for (let c = 0; c < 3; c++) {
        out[o + c] = Math.min(255, Math.round((px[i + c] * 255) / a));
      }
      out[o + 3] = a;
    }
  }
  return { w: bw, h: bh, px: out };
}

/** Flatten a cutout back onto a flat colour, to eyeball what was recovered. */
function composite(art) {
  const out = Buffer.alloc(art.px.length);
  for (let i = 0; i < art.px.length; i += 4) {
    const a = art.px[i + 3] / 255;
    for (let c = 0; c < 3; c++) {
      out[i + c] = Math.round(art.px[i + c] * a + PREVIEW_BG[c] * (1 - a));
    }
    out[i + 3] = 255;
  }
  return { ...art, px: out };
}

/* ---------------------------------------------------------------------- run */

const argv = process.argv.slice(2);
const flags = argv.filter((a) => a.startsWith("--"));
const rest = argv.filter((a) => !a.startsWith("--"));
const outIdx = flags.findIndex((f) => f.startsWith("--out"));
const outDir = resolve(
  ROOT,
  outIdx >= 0 ? flags[outIdx].split("=")[1] : "src/assets/ui",
);

const [file, ...names] = rest;
if (!file) {
  console.error(
    "usage: node tools/cut-glow.mjs <sheet.png> <name> [name...] [--out=dir] [--preview]",
  );
  process.exit(1);
}

const sheet = decode(resolve(ROOT, file));
const found = bands(sheet).map((b) => box(sheet, b));
console.log(`${file}: ${sheet.w}x${sheet.h}, ${found.length} bar(s)`);

if (names.length && names.length !== found.length) {
  console.error(
    `refusing to guess: ${found.length} bars found, ${names.length} names given`,
  );
  process.exit(1);
}

found.forEach((b, i) => {
  const art = lift(sheet, b);
  const name = names[i] || `bar-${i + 1}`;
  const out = resolve(outDir, `${name}.png`);
  encode(out, art.w, art.h, art.px);

  // How much of the box is actually glow, as a sanity read on the cut.
  let lit = 0;
  for (let p = 3; p < art.px.length; p += 4) if (art.px[p] > 0) lit++;
  console.log(
    `  ${name}.png  ${art.w}x${art.h}  from y ${b.y0}..${b.y1} x ${b.x0}..${b.x1}` +
      `  ${((100 * lit) / (art.w * art.h)).toFixed(0)}% lit`,
  );

  if (flags.includes("--preview")) {
    const pv = composite(art);
    encode(resolve(outDir, `${name}-preview.png`), pv.w, pv.h, pv.px);
  }
});
