/**
 * Pack the arena backdrop — the painting the whole match is played over.
 *
 *   node tools/pack-arena.mjs             # -> src/assets/arena-sky.webp
 *   node tools/pack-arena.mjs --png       # keep the intermediate PNG too
 *
 * The source is a 4096x2048 export at 12 MB. Every byte of this build is
 * base64'd into one index.html, so it arrives 4/3 larger again — the raw file is
 * roughly four times the entire shipping budget on its own.
 *
 * Height is the dimension that has to carry it, not width. The layout cover-fits
 * this over the screen with a little overscan, so on a phone held upright a 2:1
 * painting is scaled to the screen's *height* and most of its width is cropped
 * away. 1080 tall matches what the lava arena it replaces already shipped at,
 * which keeps the sharpness the build is used to; the extra width past 16:9 is
 * near-free because it is nothing but sky and cloud, and it is what stops the
 * flanking spires being cropped off on a tablet.
 *
 * No trim pass: this is a full-bleed painting with no alpha in it. There is no
 * ink box to find — it would return the whole file — and the layout aims at the
 * composition's centre, so cropping would move the castle off the axis the
 * board is centred on.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const JOBS = [
  {
    src: "src/letters/5f903a7d5beb76f25b85b3c2c7675f796526e7b9 (1).png",
    out: "src/assets/arena-sky.webp",
    /**
     * Drop the top quarter — the empty blue above the cloud swirl.
     *
     * Not a taste call, a geometry one. The layout pins the painting's cloud
     * line to the boss floor, which sits about 0.42 down a portrait screen,
     * and the fit can only slide the picture by the overscan it has. In the
     * export as delivered the cloud shelf sits at 0.68 of the height, and no
     * affordable amount of overscan can drag a point that low that far up —
     * the fit clamps, and the boss ends up standing in open sky above the
     * clouds. Cutting the top moves the shelf to 0.58 of what is left, which
     * the fit can reach. The swirl survives; only the flat blue above it goes,
     * and that is the strip the HUD scrim covers anyway.
     */
    crop: { top: 0.239 },
    /**
     * Height, not width — height is the dimension a 9:16 screen makes this
     * picture cover, and the wide crop means the sides are thrown away on a
     * phone regardless. 1300 leaves the cloud line about as sharp as the lava
     * arena's shore was, after the larger overscan this reframe needs.
     */
    height: 1300,
    /**
     * Higher than the end card's key art runs at. Smooth sky is exactly where
     * WebP's chroma handling shows its seams — a cloud bank is one long gentle
     * ramp, and banding across it is far more visible than a soft edge on rock
     * ever was. It still lands small: gradients are what this codec is good at.
     */
    quality: 84,
    what: "sky arena",
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

/* ----------------------------------------------------------------- resample */

/**
 * Area-average down to `dw` by `dh`.
 *
 * The same filter the other pack tools use. This one is opaque throughout so
 * the alpha weighting is a no-op, but a box average over every source pixel is
 * the point regardless: a 4096-wide painting reduced by nearest-neighbour would
 * alias the castle's railings into a shimmering mess the moment the layout
 * scales it again.
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

/** Rows `top`..`bottom` (fractions of the height), copied into their own buffer. */
function cropRows(px, w, h, crop) {
  const y0 = Math.round((crop.top || 0) * h);
  const y1 = Math.round((crop.bottom === undefined ? 1 : crop.bottom) * h);
  const ch = y1 - y0;
  const out = Buffer.alloc(w * ch * 4);
  px.copy(out, 0, y0 * w * 4, y1 * w * 4);
  return { px: out, w, h: ch };
}

/* --------------------------------------------------------------------- main */

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const kb = (file) => (statSync(file).size / 1024).toFixed(1);

for (const job of JOBS) {
  const source = join(ROOT, job.src);
  const out = join(ROOT, job.out);

  const info = probe(source);
  const raw = decode(source);

  const src = job.crop
    ? cropRows(raw, info.w, info.h, job.crop)
    : { px: raw, w: info.w, h: info.h };

  const dh = Math.min(job.height, src.h);
  const dw = Math.max(1, Math.round((dh * src.w) / src.h));
  const art =
    dw === src.w && dh === src.h
      ? src.px
      : resample(src.px, src.w, src.h, dw, dh);

  if (flags.has("--png")) encode(art, dw, dh, out.replace(/\.webp$/, ".png"));
  encode(art, dw, dh, out, [
    "-c:v",
    "libwebp",
    "-lossless",
    "0",
    "-quality",
    String(job.quality),
    "-compression_level",
    "6",
    "-preset",
    "photo",
  ]);

  console.log(
    `${job.what.padEnd(12)} ${info.w}x${info.h} -> crop ${src.w}x${src.h}` +
      ` -> ${dw}x${dh}  aspect ${(dw / dh).toFixed(3)}` +
      `   ${kb(source).padStart(8)} kB -> ${kb(out).padStart(7)} kB` +
      `   (about ${((statSync(out).size * 4) / 3 / 1024).toFixed(0)} kB of` +
      ` base64 in dist/index.html)`,
  );
}
