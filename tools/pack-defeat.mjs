/**
 * Trim and pack the DEFEAT banner for the end card.
 *
 *   node tools/pack-defeat.mjs           # -> src/assets/brand/defeat.webp
 *   node tools/pack-defeat.mjs --png     # keep the intermediate PNG too
 *   node tools/pack-defeat.mjs --proof   # composite it over the end card
 *
 * The source is `src/source/endcard/defeat.png`, 2006x784: a black spiked plaque
 * with DEFEAT cut into it in crimson, shards thrown off both ends and a red mist
 * behind the whole thing.
 *
 * ## Why this is not tools/pack-victory.mjs
 *
 * Because there is nothing here to key. That tool exists because its source
 * arrives with *no alpha channel at all* — the banner sits on a picture of the
 * editor's checkerboard, welded into the pixels, and two thirds of the file is
 * backdrop that has to be measured out of it by how far each pixel sits from
 * white. Every constant in it, and the whole premultiplied-against-white
 * division at its centre, is that one problem.
 *
 * This file came out of the generator with its matte already on it:
 *
 *   alpha 0         47.8%   backdrop, already gone
 *   alpha 1..247     7.8%   the mist, the shard edges, the type's antialiasing
 *   alpha 248..255  44.4%   the plaque's own body
 *
 * Handing that to a keyer would be throwing away a matte in order to guess it
 * back, and guessing it worse: the mist here is *red on nothing*, so the
 * `d = 255 - min(r,g,b)` measure that separates ink from white on the victory
 * source has no backdrop to separate it from. So this tool does the two things
 * that are actually left — trim the margin, resample to the width the card draws
 * at — and nothing else.
 *
 * ## The one thing it does change
 *
 * The body comes off the generator at alpha 248..253 rather than 255, which is a
 * 2% transparency nobody can see and every pixel of it is a byte webp has to
 * spend describing a gradient that is not there. SOLID snaps that band shut. It
 * is set at 248 because the band is not a ramp — there is nothing at all between
 * 224 and 248 worth speaking of — so the snap cannot eat any of the mist.
 *
 * ## Trim, and why the aspect is the output
 *
 * The margin is dead weight in a file that gets base64'd into a single-page
 * bundle, and worse, it is a *lie about the art's shape*: the card fits the
 * banner by width and asks it for its own height — see `fitDefeat` in
 * art/brand.js — so a transparent border becomes padding the layout cannot see
 * and cannot remove. Trimmed to the ink, the packed size *is* the drawn box, and
 * DEFEAT_ART is a transcript of what this tool prints.
 *
 * ffmpeg is the only dependency, and only to decode and encode, as everywhere
 * else in this folder.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src/source/endcard/defeat.png");
const OUT_DIR = join(ROOT, "src/assets/brand");
const OUT = join(OUT_DIR, "defeat");

/** Alpha at or under this is not art, and is what the trim measures against. */
const ALPHA_FLOOR = 6;

/** Alpha at or over this is the plaque's body and is snapped shut. See above. */
const SOLID = 248;

/**
 * The packed width, in pixels.
 *
 * The same 1024 the victory banner packs to, and for the same reason: both are
 * laid across the end card's own width — see EndCard.placeBanner — which on the
 * widest screen this creative runs on is about 500 points at a renderer clamped
 * to resolution 2. One number for both, because they are the same object in the
 * same hole and a pair that disagreed on it would be two different stamps.
 */
const WIDTH = 1024;

/** libwebp quality. Painted metal with a mist over it; 84 is invisible. */
const QUALITY = 84;

/** What --proof composites onto: the end card's own backdrop at its darkest. */
const PROOF_BG = [11, 6, 24];

/* ------------------------------------------------------------------- ffmpeg */

const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`);
const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

function probe(file) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0:s=x",
      file,
    ],
    { encoding: "utf8" },
  ).trim();
  const [w, h] = out.split("x").map(Number);
  return { w, h };
}

function decode(file) {
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
    { maxBuffer: 1 << 29 },
  );
}

function encode(buf, w, h, file, args) {
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

/** Snap the near-solid band to fully opaque. Returns how many pixels moved. */
function solidify(px) {
  let hit = 0;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] >= SOLID && px[i] !== 255) {
      px[i] = 255;
      hit++;
    }
  }
  return hit;
}

/** The box the art actually occupies, ignoring anything at the alpha floor. */
function inkBox(px, w, h) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] <= ALPHA_FLOOR) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Box-average `box` down to `dw` by `dh`, weighting colour by alpha.
 *
 * The same resampler tools/pack-victory.mjs uses, and the weighting is the whole
 * of why it is written out rather than handed to ffmpeg's scaler: colour has to
 * be averaged *premultiplied* or the fully transparent pixels around a shard
 * drag their own colour into its edge. Every partial pixel in this file is a
 * shard edge or a wisp of mist, so that is most of what there is to get wrong.
 */
function resample(src, sw, sh, box, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const kx = box.w / dw;
  const ky = box.h / dh;

  for (let dy = 0; dy < dh; dy++) {
    const fy0 = box.y0 + dy * ky;
    const fy1 = fy0 + ky;
    const iy0 = Math.floor(fy0);
    const iy1 = Math.min(sh - 1, Math.ceil(fy1) - 1);

    for (let dx = 0; dx < dw; dx++) {
      const fx0 = box.x0 + dx * kx;
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

/* ---------------------------------------------------------------------- run */

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

const info = probe(SRC);
const px = decode(SRC);
console.log(`in   ${rel(SRC)}  ${info.w}x${info.h}  ${kb(statSync(SRC).size)}`);

const snapped = solidify(px);
const box = inkBox(px, info.w, info.h);
const margin = [
  box.x0,
  info.w - (box.x0 + box.w),
  box.y0,
  info.h - (box.y0 + box.h),
];

console.log(
  `     snapped ${snapped} px from alpha >=${SOLID} to opaque` +
    `\n     ink box ${box.w}x${box.h} at ${box.x0},${box.y0}` +
    `  (trimmed l/r/t/b ${margin.join("/")})`,
);

const outW = WIDTH;
const outH = Math.round((box.h * WIDTH) / box.w);
const art = resample(px, info.w, info.h, box, outW, outH);

if (flags.has("--png")) encode(art, outW, outH, `${OUT}.png`);
encode(art, outW, outH, `${OUT}.webp`, [
  "-c:v",
  "libwebp",
  "-quality",
  String(QUALITY),
  "-compression_level",
  "6",
]);

console.log(
  `\nout  ${rel(OUT)}.webp  ${outW}x${outH}  ${kb(statSync(`${OUT}.webp`).size)}` +
    `\n     for art/brand.js:  DEFEAT_ART { w: ${outW}, h: ${outH} }` +
    `   aspect ${(outW / outH).toFixed(3)}`,
);

/**
 * The banner over the end card's own backdrop, at the size it is drawn.
 *
 * Worth looking at even though nothing here is keyed: the mist is red light on a
 * near-black card, and light that reads as a soft halo over white can read as a
 * dirty smear over black. This is the only place that question gets answered.
 */
if (flags.has("--proof")) {
  const pw = 520;
  const ph = Math.round((outH * pw) / outW);
  const pad = 40;
  const W = pw + pad * 2;
  const H = ph + pad * 2;
  const proof = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    proof[i * 4] = PROOF_BG[0];
    proof[i * 4 + 1] = PROOF_BG[1];
    proof[i * 4 + 2] = PROOF_BG[2];
    proof[i * 4 + 3] = 255;
  }

  const small = resample(
    art,
    outW,
    outH,
    { x0: 0, y0: 0, w: outW, h: outH },
    pw,
    ph,
  );
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const s = (y * pw + x) * 4;
      const d = ((y + pad) * W + x + pad) * 4;
      const a = small[s + 3] / 255;
      for (let c = 0; c < 3; c++) {
        proof[d + c] = clamp8(proof[d + c] * (1 - a) + small[s + c] * a);
      }
    }
  }

  const file = join(OUT_DIR, "defeat-proof.png");
  encode(proof, W, H, file);
  console.log(`out  ${rel(file)}  (delete when looked at)`);
}
