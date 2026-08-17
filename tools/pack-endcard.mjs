/**
 * Pack the end card's brand art — the wordmark, the PLAY NOW plate and the
 * three store badges — into something a playable ad can actually carry.
 *
 *   node tools/pack-endcard.mjs           # -> src/letters/*.webp
 *   node tools/pack-endcard.mjs --png     # keep intermediate PNGs too
 *
 * The sources are the exports out of the marketing key art, dropped into
 * src/letters as they came off the design file: names with spaces in them,
 * transparent margin all round, and — in the plate's case — 170 kB of PNG for a
 * button drawn about 300 points wide. Every byte of this build is inlined as
 * base64 into one index.html, so that lands as 230 kB of text.
 *
 * So each one is trimmed to its own ink and re-encoded as WebP, under names the
 * code can `import` without quoting a space. The plate goes lossy: it is a
 * painted gem with gradients across it and q88 is indistinguishable from the
 * source at the size it is drawn. The wordmark and the badges go lossless —
 * they are flat colour and small type, which is exactly what lossy smears, and
 * lossless WebP still beats their PNGs.
 *
 * Trimming is the reason this runs at all rather than the files being imported
 * where they lie: the layout centres each of these in a box, and a bitmap with
 * uneven empty margin baked into it centres its margin, not its art.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(ROOT, "src/letters");

/** Alpha at or under this is backdrop, not art. */
const EMPTY = 12;

/**
 * What to pack.
 *
 * `width` is the width to resample to, or 0 to keep the ink at its own size.
 * Only the plate and the key art are worth reducing: the plate is drawn at most
 * `w * 0.8` points wide on a renderer clamped to 2x, so 640 device pixels covers
 * a 320 point button with nothing to spare. The badges are drawn near their own
 * size already and the wordmark is 10 kB either way.
 *
 * `trim: false` for anything full-bleed. The key art is a painting with no
 * transparency in it and nothing to trim to — running the ink box over it would
 * find the whole file, and if a corner ever did fade out, cropping it would move
 * the composition the layout is aimed at.
 */
const JOBS = [
  {
    src: "33a517b4079a7f2088e5dd776a49d0878b17c4a9 (1).png",
    out: "key-art",
    /**
     * The end card cover-fits this over the whole screen, and the tightest
     * crop it has to survive is a phone held upright: a 1.2:1 painting on a
     * 0.46:1 screen is scaled to the screen's height, so the height is the
     * dimension that has to carry it. 1500 wide is 1246 tall, against the 1334
     * device pixels a 667 point screen asks for at 2x — a hair of upscale on
     * the tallest phone and a downscale on every other, for a quarter of the
     * bytes 2x would cost on a picture that spends most of its area in smoke.
     */
    width: 1500,
    mode: "photo",
    quality: 80,
    trim: false,
    what: "key art",
  },
  {
    src: "Button_05.png",
    out: "play-now",
    width: 640,
    mode: "photo",
    what: "PLAY NOW plate",
  },
  {
    src: "Layer_2.png",
    out: "logo-invokers",
    width: 0,
    mode: "flat",
    what: "wordmark",
  },
  {
    src: "Download_on_the_App_Store_Badge_US-UK_RGB_blk_092917 2.png",
    out: "badge-app-store",
    width: 0,
    mode: "flat",
    what: "App Store badge",
  },
  {
    src: "GetItOnGooglePlay_Badge_Web_color_English 2.png",
    out: "badge-google-play",
    width: 0,
    mode: "flat",
    what: "Google Play badge",
  },
  {
    src: "Play_now_on_PC_Mac 3.png",
    out: "badge-pc-mac",
    width: 0,
    mode: "flat",
    what: "PC/Mac badge",
  },
];

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

/**
 * WebP settings per kind of art. `-quality` carries the alpha channel too, and
 * every one of these is a cutout — this is the knob to turn if an edge ever
 * picks up a fringe.
 */
const WEBP = {
  photo: (q) => [
    "-c:v",
    "libwebp",
    "-lossless",
    "0",
    "-quality",
    String(q === undefined ? 88 : q),
    "-compression_level",
    "6",
    "-preset",
    "drawing",
  ],
  flat: () => ["-c:v", "libwebp", "-lossless", "1", "-compression_level", "6"],
};

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
 * The same filter pack-cta-banner.mjs uses, and for the same reason: straight
 * RGBA is what the files hold and their transparent pixels are black, so
 * averaging as-is would pull a dark fringe around every lit edge.
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

/* --------------------------------------------------------------------- main */

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const kb = (file) => (statSync(file).size / 1024).toFixed(1);

let before = 0;
let after = 0;

for (const job of JOBS) {
  const source = join(DIR, job.src);
  const out = join(DIR, job.out);

  const info = probe(source);
  const raw = decode(source);
  const box =
    job.trim === false
      ? { x0: 0, y0: 0, x1: info.w - 1, y1: info.h - 1, w: info.w, h: info.h }
      : inkBox(raw, info.w, info.h);
  const trimmed = job.trim === false ? raw : crop(raw, info.w, box);

  const dw = job.width > 0 ? Math.min(job.width, box.w) : box.w;
  const dh = Math.max(1, Math.round((dw * box.h) / box.w));
  const art =
    dw === box.w && dh === box.h
      ? trimmed
      : resample(trimmed, box.w, box.h, dw, dh);

  if (flags.has("--png")) encode(art, dw, dh, `${out}.png`);
  encode(art, dw, dh, `${out}.webp`, WEBP[job.mode](job.quality));

  before += statSync(source).size;
  after += statSync(`${out}.webp`).size;

  console.log(
    `${job.what.padEnd(18)} ${String(info.w).padStart(4)}x${info.h}` +
      ` -> ${String(dw).padStart(4)}x${dh}` +
      `   ${kb(source).padStart(6)} kB -> ${kb(`${out}.webp`).padStart(6)} kB` +
      `   ${job.out}.webp  (aspect ${(dw / dh).toFixed(4)})`,
  );
}

console.log(
  `\ntotal ${(before / 1024).toFixed(1)} kB -> ${(after / 1024).toFixed(1)} kB` +
    ` — about ${(((before - after) * 4) / 3 / 1024).toFixed(0)} kB off the` +
    ` base64 in dist/index.html.`,
);
