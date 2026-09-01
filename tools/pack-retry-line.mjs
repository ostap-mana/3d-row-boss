/**
 * Trim and pack the RETRY divider for the end card.
 *
 *   node tools/pack-retry-line.mjs           # -> src/assets/brand/retry-line.webp
 *   node tools/pack-retry-line.mjs --png     # keep the intermediate PNG too
 *   node tools/pack-retry-line.mjs --proof   # composite it over the end card
 *
 * The source is `src/source/endcard/retry-line.png`, 2048x682: a chromed
 * hairline running the full width with a faceted violet gem finial off each
 * end, breaking in the middle around a crest gem and the words "RETRY" set
 * under a circular-arrow glyph. It is the same divider vocabulary as
 * `S_TitleOrnamentLine` on the outcome screen — see art/outcomeui.js — with a
 * label sitting in the break rather than a plain notch.
 *
 * It replaces the blue gem plate `tools/pack-retry.mjs` packs. That plate was a
 * second painted button under the PLAY NOW plate, and two lit gem lockups in one
 * column is the card offering two things at the same volume; the whole point of
 * the defeat card is that the store is the offer and the rematch is the way out.
 * A divider under the store row says "or" without asking for the tap. The old
 * plate and its packer stay on disk — nothing imports them any more.
 *
 * ## Not a keyer
 *
 * Same as pack-retry.mjs and for the same reason: the matte arrived on the
 * source, the backdrop is alpha 0 over rgb 0,0,0, and any ramp over "distance
 * from white" reads that as maximum ink and hands back a black rectangle. This
 * trims and resamples and does nothing else, and nothing here may become a
 * keyer.
 *
 * ## Trim, and why the aspect is the output
 *
 * A third of this file's height is transparent margin above and below the rule.
 * The card fits this by width and asks it for its own height — see
 * `retryLineHeight` in art/brand.js — so a transparent border becomes padding
 * the layout cannot see and cannot remove, and on a rule this thin the padding
 * would be several times the art. Trimmed to the ink, the packed size *is* the
 * drawn box, and RETRY_LINE_ART is a transcript of what this tool prints.
 *
 * ffmpeg is the only dependency, and only to decode and encode, as everywhere
 * else in this folder.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src/source/endcard/retry-line.png");
const OUT_DIR = join(ROOT, "src/assets/brand");
const OUT = join(OUT_DIR, "retry-line");

/** Alpha at or under this is not art, and is what the trim measures against. */
const ALPHA_FLOOR = 6;

/** Alpha at or over this is body and is snapped shut. */
const SOLID = 248;

/**
 * The packed width, in pixels.
 *
 * 1024, which is the outcome screen's own ornament budget rather than the
 * buttons' 640, and the shape is the argument: this is a rule about eight
 * points deep drawn across most of the column, so every one of its pixels is an
 * edge. Halve the width and the hairline spends half a pixel on itself, which
 * is the difference between a bright chromed line and a grey smear — the one
 * failure mode a thin ornament has. The widest the card draws it is about 520
 * points, or 1040 device pixels at a renderer clamped to resolution 2.
 */
const WIDTH = 1024;

/** libwebp quality. Chrome hairlines and two small gems; 92, as the ornament. */
const QUALITY = 92;

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
 * The same resampler the rest of this folder uses, and on this cut the alpha
 * weighting matters more than anywhere else: the art is a hairline on nothing,
 * so nearly every pixel in it is a partial one, and an unweighted average drags
 * the transparent black around the rule straight into the rule.
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
    `\n     for art/brand.js:  RETRY_LINE_ART { w: ${outW}, h: ${outH} }` +
    `   aspect ${(outW / outH).toFixed(3)}`,
);

/**
 * The divider over the end card's own backdrop, at the size it is drawn.
 *
 * Worth looking at because the failure this tool can have is invisible on a
 * checkerboard and obvious on black: a chromed hairline is light grey, the card
 * under it is near-black, and a resample that loses half a pixel of the rule
 * turns a bright edge into a smudge that reads as a compression artefact.
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

  const file = join(OUT_DIR, "retry-line-proof.png");
  encode(proof, W, H, file);
  console.log(`out  ${rel(file)}  (delete when looked at)`);
}
