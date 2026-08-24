/**
 * Pack the hint hand — the gauntlet that points at the swap the player is
 * being nagged to make.
 *
 *   node tools/cut-bg.mjs src/source/hand/hand.png --trim   # first: give it alpha
 *   node tools/pack-hand.mjs                           # -> src/assets/board/hint-hand.webp
 *   node tools/pack-hand.mjs --png                     # keep the intermediate PNG
 *   node tools/pack-hand.mjs --guides                  # mark the fingertip
 *
 * Two steps because the source arrives as a 1254x1254 render with no alpha
 * channel at all — its transparency is a *picture* of transparency, the
 * editor's checkerboard welded into the pixels. Cutting that is a job of its
 * own and tools/cut-bg.mjs already does it; this reads what that leaves behind.
 *
 * What is left for this tool is size and registration.
 *
 * Size, because the hand is drawn about 60 to 140 points wide on a renderer
 * clamped to resolution 2 — under 290 device pixels at the very worst — and the
 * cut is 721 across. Shipping that would be three times the pixels anybody sees,
 * base64'd into the one file the whole creative has to fit in.
 *
 * Registration, because a hand is not a picture, it is a pointer, and where it
 * points is one pixel in it: the tip of the index finger. The game anchors the
 * sprite there so the fingertip lands on the cell rather than the middle of a
 * leather cuff landing on it. That point cannot be guessed off a bounding box —
 * the thumb sticks out left, the sleeve hangs down right, and the tip is neither
 * — so it is measured here and printed as the fractions art/hinthand.js holds.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src/source/hand/hand-nobg.png");
const OUT = join(ROOT, "src/assets/board/hint-hand");

/** Alpha at or under this is backdrop, not art. */
const EMPTY = 12;

/** Alpha over this is the finger itself rather than its antialiased edge. */
const SOLID = 128;

/**
 * Width to pack at.
 *
 * The hand is sized off the board's cell — `cell * 1.15`, capped at 110 points,
 * and 1.3 times that once the hint turns insistent. 143 points at resolution 2
 * is 286 device pixels, so 320 covers the worst case with a little to spare and
 * nothing to waste. Past it every extra pixel is base64 nobody sees.
 */
const WIDTH = 320;

/**
 * Band at the top of the art the fingertip is found in, as a fraction of the
 * height.
 *
 * The tip is the highest thing in the picture — the finger is what the whole
 * pose is for — so the topmost rows are all fingertip and nothing else. Taking a
 * band rather than the single topmost pixel is what keeps a stray antialiased
 * speck from deciding where the hand points.
 */
const TIP_BAND = 0.03;

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

/* --------------------------------------------------------------------- trim */

/** Tightest box that holds every pixel the eye can see. */
function inkBox(px, w, h) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] <= EMPTY) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The trimmed art, copied out into its own buffer. */
function crop(px, w, box) {
  const out = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const src = ((y + box.y0) * w + box.x0) * 4;
    px.copy(out, y * box.w * 4, src, src + box.w * 4);
  }
  return out;
}

/* ----------------------------------------------------------------- resample */

/**
 * Area-average down to `dw` by `dh`, weighting colour by alpha.
 *
 * Premultiplied, and this is the reduction that needs it most in the build: the
 * cut leaves transparent *black* around the figure, and a straight average over
 * a 2.25:1 box would draw that black into every edge — a dark line around a hand
 * that spends its whole life over a lit board.
 */
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

/* ------------------------------------------------------------------ measure */

/**
 * The point the hand points at, in the packed art's own pixels.
 *
 * The alpha-weighted centre of the fingertip band: the nail is rounded, so its
 * topmost row is a couple of pixels wide and its middle is what the eye reads as
 * the point. Weighting by alpha rather than counting lit pixels keeps the soft
 * edge of the outline from pulling the answer sideways.
 */
function fingertip(px, w, h) {
  let top = -1;
  for (let y = 0; y < h && top < 0; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > SOLID) {
        top = y;
        break;
      }
    }
  }
  if (top < 0) return { x: w / 2, y: 0 };

  const band = Math.max(1, Math.round(h * TIP_BAND));
  let sx = 0;
  let sy = 0;
  let wsum = 0;
  for (let y = top; y < Math.min(h, top + band); y++) {
    for (let x = 0; x < w; x++) {
      const a = px[(y * w + x) * 4 + 3];
      if (a <= EMPTY) continue;
      sx += x * a;
      sy += y * a;
      wsum += a;
    }
  }
  return wsum > 0 ? { x: sx / wsum, y: sy / wsum } : { x: w / 2, y: top };
}

/* --------------------------------------------------------------------- main */

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

if (!existsSync(SOURCE)) {
  console.error(
    `missing ${rel(SOURCE)}\n` +
      `run  node tools/cut-bg.mjs src/source/hand/hand.png --trim  first:` +
      ` the render it comes from has a painted checkerboard, not an alpha channel.`,
  );
  process.exit(1);
}

const info = probe(SOURCE);
const raw = decode(SOURCE);
console.log(`in   ${rel(SOURCE)}  ${info.w}x${info.h}`);

const box = inkBox(raw, info.w, info.h);
const trimmed = crop(raw, info.w, box);
console.log(
  `     ink   ${box.w}x${box.h} at ${box.x0},${box.y0}` +
    `  (trimmed ${info.w - box.w}x${info.h - box.h})`,
);

const dw = Math.min(WIDTH, box.w);
const dh = Math.max(1, Math.round((dw * box.h) / box.w));
const art =
  dw === box.w && dh === box.h
    ? trimmed
    : resample(trimmed, box.w, box.h, dw, dh);
console.log(
  `     pack  ${box.w}x${box.h} -> ${dw}x${dh}` +
    `  (1:${(box.w / dw).toFixed(2)}, aspect ${(dh / dw).toFixed(4)} tall)`,
);

const tip = fingertip(art, dw, dh);
console.log(`\n     what art/hinthand.js needs:`);
console.log(`     art    { w: ${dw}, h: ${dh} }`);
console.log(
  `     tip    ${tip.x.toFixed(1)},${tip.y.toFixed(1)} px` +
    `  -> anchor { x: ${(tip.x / dw).toFixed(4)}, y: ${(tip.y / dh).toFixed(4)} }`,
);

if (flags.has("--png")) {
  encode(art, dw, dh, `${OUT}.png`);
  console.log(`\nout  ${rel(OUT)}.png`);
}

// `-quality` carries the alpha channel too, and the alpha here is a cutout with
// a painted outline right up against it — this is the knob to turn if the hand
// ever picks up a fringe over the board.
encode(art, dw, dh, `${OUT}.webp`, [
  "-c:v",
  "libwebp",
  "-lossless",
  "0",
  "-quality",
  "86",
  "-compression_level",
  "6",
  "-preset",
  "drawing",
]);
console.log(
  `out  ${rel(OUT)}.webp  ${(statSync(`${OUT}.webp`).size / 1024).toFixed(1)} kB` +
    `  (about ${((statSync(`${OUT}.webp`).size * 4) / 3 / 1024).toFixed(0)} kB` +
    ` of base64 in dist/index.html)`,
);

/** The measurement, drawn back over the art: a crosshair on the fingertip. */
if (flags.has("--guides")) {
  const test = Buffer.from(art);
  const dot = (x, y) => {
    if (x < 0 || y < 0 || x >= dw || y >= dh) return;
    const i = (y * dw + x) * 4;
    test[i] = 0;
    test[i + 1] = 255;
    test[i + 2] = 255;
    test[i + 3] = 255;
  };
  const cx = Math.round(tip.x);
  const cy = Math.round(tip.y);
  for (let k = -12; k <= 12; k++) {
    dot(cx + k, cy);
    dot(cx, cy + k);
  }
  encode(test, dw, dh, `${OUT}-guides.png`);
  console.log(`out  ${rel(OUT)}-guides.png`);
}

function rel(p) {
  return p.slice(ROOT.length + 1).replace(/\\/g, "/");
}
