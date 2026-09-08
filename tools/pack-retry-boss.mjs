/**
 * Trim and pack the RETRY lockup for the end card.
 *
 *   node tools/pack-retry-boss.mjs           # -> src/assets/brand/retry-boss.webp
 *   node tools/pack-retry-boss.mjs --png     # keep the intermediate PNG too
 *   node tools/pack-retry-boss.mjs --proof   # composite it over the end card
 *
 * The source is `src/source/endcard/retry-boss.png`: the beast roaring out of
 * the frame over a banner with RETRY across it, a claw hooked round each end of
 * it and the little shaman riding its shoulders, wrapped in a magenta bloom. It
 * is the defeat card's way out drawn as a piece of the game rather than as a
 * piece of furniture — which is the one thing the two dividers before it could
 * not be.
 *
 * ## What it replaces, and the argument it loses
 *
 * A gold hairline with the word set in a break in the middle — see
 * tools/pack-retry-line.mjs, which still makes it. That rule was chosen so the
 * card would carry exactly one lit lockup, the CTA, and say "or" underneath it
 * without asking for the tap. This is a lit lockup, and stacking it under PLAY
 * NOW is the card making two offers again.
 *
 * It is sized so the CTA still wins on width — see RETRY_BOSS_W in
 * ui/endcard.js, which holds this to about three quarters of the plate above it
 * — but it wins on nothing else, and that is a real cost, taken deliberately.
 * The rule is still on disk and its packer still runs; nothing imports it.
 *
 * ## Not a keyer
 *
 * The same rule as every other packer in this folder: the matte is already on
 * the source, and this tool trims, resamples and encodes.
 *
 * The matte is on the source because a cutter put it there, and which cutter
 * has been a different answer for each of the three deliveries this lockup has
 * had. The first arrived on a sheet of white with the plate's bloom fading into
 * it over forty pixels, and was keyed by `tools/cut-bg.mjs --glow`. The second
 * arrived with an alpha channel drawn by hand and needed nothing. The third —
 * the current one — arrived as 1344x896 of flat dark teal with no alpha at all,
 * and is cut by `tools/cut-dark-bg.mjs`: a bloom over a dark fill is an additive
 * glow, so the alpha is `max(pixel - backdrop)` for everything the border can
 * flood to and solid for the painting the flood cannot reach. Every source is
 * still on disk beside the current one — `retry-boss-v1-*.png`,
 * `retry-boss-v2.png`, `retry-boss-v3-teal.png` — rather than being it.
 *
 * What this file is handed is 1344x896 already carrying that matte: 48.3%
 * clear, 45.4% solid and 6.3% in between. The soft band is wide because most of
 * what surrounds this lockup is bloom rather than edge, which is the one number
 * on the line above worth reading — a cut of this art with a *thin* soft band
 * would be a cut with the glow sawn off. Nothing below keys, thresholds or
 * reconstructs anything, and nothing here may start.
 *
 * ## The width, and why it is not the ornament's
 *
 * 640, and not the divider's 1024. The rule was 85 px deep at 1024 and spent
 * every pixel it had on an edge; this is a painting at about 7:6 drawn some 235
 * points across on a phone — 470 device pixels at a renderer clamped to
 * resolution 2 — so 640 is a third more than it is ever asked for. It is also
 * the width the PLAY NOW plate is packed at, which is the piece of art directly
 * above it on the card.
 *
 * The file is inlined as base64 into a single-file deliverable that is already
 * near four megabytes, so a width nobody can see costs about a third of its own
 * size again in the bundle. See vite.config.js.
 *
 * ffmpeg is the only dependency, and only to decode and encode, as everywhere
 * else in this folder.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src/source/endcard/retry-boss.png");
const OUT_DIR = join(ROOT, "src/assets/brand");
const OUT = join(OUT_DIR, "retry-boss");

/**
 * Alpha at or under this is not art, and is what the trim measures against.
 *
 * Six, which is under a fortieth of an alpha. On the keyed v1 cut this was what
 * made the trim possible at all: the bloom there did not end, it thinned until
 * the encoder's own noise in the white sheet was the larger number, and a box
 * measured against a bare `alpha > 0` came back as very nearly the whole frame.
 * The matte on this source stops properly, so the floor now costs a pixel or
 * two of margin rather than saving several hundred. It stays because the next
 * delivery may not be as clean, and because a stray pixel at alpha 3 in a
 * corner is invisible and still moves the packed box.
 */
const ALPHA_FLOOR = 6;

/** Alpha at or over this is body and is snapped shut. */
const SOLID = 248;

/** The packed width, in pixels. See the note above. */
const WIDTH = 640;

/**
 * libwebp quality.
 *
 * 82, against the ornament's 92. That one was a hairline where a lost pixel is
 * the whole subject; this is a painting with a soft bloom around it and large
 * even fields of obsidian and gold, which is the shape libwebp is good at. 92
 * costs about half as much again in the bundle for a difference nobody can see
 * at 250 points across.
 */
const QUALITY = 82;

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

/* ------------------------------------------------------------------- pixels */

/** The share of the buffer that is fully clear, fully solid, and in between. */
function alphaProfile(px) {
  let clear = 0;
  let solid = 0;
  let soft = 0;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] < 8) clear++;
    else if (px[i] > 247) solid++;
    else soft++;
  }
  const n = px.length / 4;
  const pc = (v) => `${((v / n) * 100).toFixed(1)}%`;
  return `clear ${pc(clear)}  soft ${pc(soft)}  solid ${pc(solid)}`;
}

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

/** Drop the haze under the floor to nothing, so the trim has an edge to find. */
function floorAlpha(px) {
  let hit = 0;
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] > 0 && px[i] <= ALPHA_FLOOR) {
      px[i] = 0;
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
 * The same resampler the rest of this folder uses. The alpha weighting is what
 * keeps the bloom clean here: most of this file's area is a partial pixel, and
 * an unweighted average drags the transparent black beyond the glow into it.
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
console.log(
  `in   ${rel(SRC)}  ${info.w}x${info.h}  ${kb(statSync(SRC).size)}` +
    `\n     ${alphaProfile(px)}`,
);

const snapped = solidify(px);
const hazed = floorAlpha(px);
const box = inkBox(px, info.w, info.h);
const margin = [
  box.x0,
  info.w - (box.x0 + box.w),
  box.y0,
  info.h - (box.y0 + box.h),
];

console.log(
  `     snapped ${snapped} px from alpha >=${SOLID} to opaque` +
    `\n     cleared ${hazed} px of haze at alpha <=${ALPHA_FLOOR}` +
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
    `\n     for art/brand.js:  RETRY_BOSS_ART { w: ${outW}, h: ${outH} }` +
    `   aspect ${(outW / outH).toFixed(3)}`,
);

/**
 * The lockup over the end card's own backdrop, at about the size it is drawn.
 *
 * The failure this pipeline can have is invisible on a checkerboard and obvious
 * on black: the cut it is fed is mostly bloom, and a bloom whose coverage came
 * out a few percent high reads as a pale rectangle of fog around the plate on a
 * card that is nearly black.
 */
if (flags.has("--proof")) {
  const pw = 500;
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
        proof[d + c] = clamp8(small[s + c] * a + proof[d + c] * (1 - a));
      }
    }
  }
  const file = `${OUT}-proof.png`;
  encode(proof, W, H, file);
  console.log(`out  ${rel(file)}  ${W}x${H}`);
}
