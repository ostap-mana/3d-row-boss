/**
 * Cut the CTA banner out of `src/buttons/regenerated.png` and pack it into
 * something a playable ad can actually carry.
 *
 *   node tools/pack-cta-banner.mjs            # -> src/buttons/cta-banner.webp
 *   node tools/pack-cta-banner.mjs --png      # keep an intermediate PNG too
 *   node tools/pack-cta-banner.mjs --guides   # write a proof of the safe box
 *
 * The source is a 2172x724 render: a gem bar in a gold frame, a diamond finial
 * off each end, and a star above and below the middle. Two things are wrong
 * with it as shipped. It is a megabyte, and every byte of this build is inlined
 * as base64 into one index.html — so it would land as 1.4 MB of text for a
 * button drawn about 120 points wide. And a third of its height is empty.
 *
 * So this trims it to its own ink, resamples it down to something near the
 * largest size it is ever asked for, and re-encodes it as WebP.
 *
 * The resample is area-averaged in premultiplied alpha. Straight RGBA is what
 * the file holds and the transparent pixels in it are black, so averaging it
 * as-is would pull a dark fringe around every gold edge in the ornament — the
 * one part of this art that has to stay clean at 120 points.
 *
 * It also measures the thing, because the numbers the game needs cannot be
 * guessed off the file: which band of the art is the bar rather than the stars
 * that poke out over it, and how much of the gem field is flat enough to put a
 * word on. Those print at the end, as the fractions art/ctabanner.js holds.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src/buttons/regenerated.png");
const OUT = join(ROOT, "src/buttons/cta-banner");

/** Alpha at or under this is backdrop, not art. */
const EMPTY = 12;

/**
 * Width to pack at.
 *
 * The banner is drawn at most `BANNER.w * ui` points wide — 240 at the ui cap
 * of 2.0 — on a renderer whose resolution is clamped to 2, so 480 device pixels
 * is the worst case it ever has to fill. 512 covers that with nothing to spare,
 * which is the point: past it every extra pixel is base64 nobody sees.
 */
const WIDTH = 512;

/** Max channel at or under this is the dark rim between the gold and the gem. */
const RIM = 60;

/** Consecutive dark pixels that count as the rim rather than a shadow in the cut. */
const RIM_RUN = 3;

/** Fraction of the gem field's height the label is allowed to use. */
const LABEL_BAND = 0.72;

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
 * Every destination pixel covers a fractional rectangle of the source, and each
 * source pixel in it contributes its own overlap. That is the right filter for
 * a reduction this large — over four to one, where a bilinear tap would simply
 * miss most of the pixels it is meant to be averaging.
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
          // Premultiplied: a transparent black pixel must contribute nothing to
          // the colour, only to the alpha.
          const av = px8(src[i + 3]) * cover;
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

const px8 = (v) => v / 255;
const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

/* ------------------------------------------------------------------ measure */

/**
 * The band of rows that is the bar itself.
 *
 * The stars over and under the middle are part of the silhouette but not part
 * of the plate, and a hit area or a label placed against the full height would
 * be measured against a decoration two hundred pixels wide. Rows that reach
 * most of the way across are the bar; the stars never do.
 */
function barBand(px, w, h) {
  const cover = [];
  let max = 0;
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 128) n++;
    cover.push(n);
    if (n > max) max = n;
  }
  let y0 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    if (cover[y] < max * 0.55) continue;
    if (y0 < 0) y0 = y;
    y1 = y;
  }
  return { y0, y1 };
}

/**
 * Walk out from `(cx, cy)` along one axis until the dark rim, and return the
 * last pixel before it. Everything inside that on both sides is the gem.
 */
function innerEdge(px, w, h, cx, cy, dx, dy) {
  let dark = 0;
  let x = cx;
  let y = cy;
  let last = dy ? cy : cx;
  while (x >= 0 && y >= 0 && x < w && y < h) {
    const i = (y * w + x) * 4;
    const lit = px[i + 3] > 128 && Math.max(px[i], px[i + 1], px[i + 2]) > RIM;
    if (lit) {
      dark = 0;
      last = dy ? y : x;
    } else if (++dark >= RIM_RUN) {
      break;
    }
    x += dx;
    y += dy;
  }
  return last;
}

/**
 * The flat gem field a word can sit on, as a box centred on the art.
 *
 * The field is a stretched hexagon, so its width depends on how tall a box is
 * asked of it: taken at full height it would be the width of the two points,
 * which is nothing. So the height is fixed at a fraction of the field first,
 * and the width is then the narrowest the field gets anywhere in that band.
 */
function labelBox(px, w, h, band) {
  const cx = Math.round(w / 2);
  const cy = Math.round((band.y0 + band.y1) / 2);

  const top = innerEdge(px, w, h, cx, cy, 0, -1);
  const bottom = innerEdge(px, w, h, cx, cy, 0, 1);
  const half = Math.round(((bottom - top) * LABEL_BAND) / 2);

  let left = 0;
  let right = w - 1;
  for (let y = cy - half; y <= cy + half; y++) {
    left = Math.max(left, innerEdge(px, w, h, cx, y, -1, 0));
    right = Math.min(right, innerEdge(px, w, h, cx, y, 1, 0));
  }
  return { x0: left, y0: cy - half, x1: right, y1: cy + half };
}

/* --------------------------------------------------------------------- main */

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

const info = probe(SOURCE);
const raw = decode(SOURCE);
console.log(`in   src/buttons/regenerated.png  ${info.w}x${info.h}`);

const box = inkBox(raw, info.w, info.h);
console.log(
  `     ink   ${box.w}x${box.h} at ${box.x0},${box.y0}` +
    `  (trimmed ${info.w - box.w}x${info.h - box.h})`,
);

const trimmed = crop(raw, info.w, box);
const dh = Math.max(1, Math.round((WIDTH * box.h) / box.w));
const art = resample(trimmed, box.w, box.h, WIDTH, dh);
console.log(
  `     scale ${box.w}x${box.h} -> ${WIDTH}x${dh}` +
    `  (1:${(box.w / WIDTH).toFixed(2)}, aspect ${(WIDTH / dh).toFixed(4)})`,
);

// Measured on the trimmed source, not on the pack. The rim the walk looks for
// is fifteen pixels of near-black up there and three after the reduction, and
// three pixels of it survive the resample as a smear the walk reads straight
// through. The scale is uniform, so the fractions are the same either way.
const band = barBand(trimmed, box.w, box.h);
const label = labelBox(trimmed, box.w, box.h, band);
const f = (v, of) => (v / of).toFixed(4);

console.log(`\n     measured on the trimmed art, as fractions of it:`);
console.log(
  `     bar    y ${band.y0}..${band.y1}` +
    `  -> top ${f(band.y0, box.h)}  bottom ${f(band.y1 + 1, box.h)}` +
    `  height ${f(band.y1 - band.y0 + 1, box.h)}`,
);
console.log(
  `     label  x ${label.x0}..${label.x1}  y ${label.y0}..${label.y1}` +
    `  -> w ${f(label.x1 - label.x0 + 1, box.w)}  h ${f(label.y1 - label.y0 + 1, box.h)}`,
);
console.log(
  `     label centre off art centre:` +
    ` x ${(((label.x0 + label.x1 + 1) / 2 - box.w / 2) / box.w).toFixed(4)}` +
    ` y ${(((label.y0 + label.y1 + 1) / 2 - box.h / 2) / box.h).toFixed(4)}`,
);

if (flags.has("--png")) {
  encode(art, WIDTH, dh, `${OUT}.png`);
  console.log(`\nout  ${rel(OUT)}.png`);
}

// `-quality` carries the alpha channel too, and the alpha here is a cutout with
// filigree in it — this is the knob to turn if the gold ever picks up a fringe.
encode(art, WIDTH, dh, `${OUT}.webp`, [
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
console.log(`out  ${rel(OUT)}.webp`);

/**
 * The measurement, drawn back over the art: the bar band in green, the label
 * box in cyan. If the box is not sitting flat on the gem, it is visible here.
 */
if (flags.has("--guides")) {
  const test = Buffer.from(art);
  const k = WIDTH / box.w;
  const sx = (v) => Math.round(v * k);
  const sy = (v) => Math.round(v * k);
  const dot = (x, y, c) => {
    if (x < 0 || y < 0 || x >= WIDTH || y >= dh) return;
    const i = (y * WIDTH + x) * 4;
    test[i] = c[0];
    test[i + 1] = c[1];
    test[i + 2] = c[2];
    test[i + 3] = 255;
  };
  for (let x = 0; x < WIDTH; x++) {
    dot(x, sy(band.y0), [0, 255, 0]);
    dot(x, sy(band.y1), [0, 255, 0]);
  }
  for (let x = sx(label.x0); x <= sx(label.x1); x++) {
    dot(x, sy(label.y0), [0, 255, 255]);
    dot(x, sy(label.y1), [0, 255, 255]);
  }
  for (let y = sy(label.y0); y <= sy(label.y1); y++) {
    dot(sx(label.x0), y, [0, 255, 255]);
    dot(sx(label.x1), y, [0, 255, 255]);
  }
  encode(test, WIDTH, dh, `${OUT}-guides.png`);
  console.log(`out  ${rel(OUT)}-guides.png`);
}

function rel(p) {
  return p.slice(ROOT.length + 1).replace(/\\/g, "/");
}
