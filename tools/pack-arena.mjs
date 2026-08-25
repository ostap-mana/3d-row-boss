/**
 * Pack the arena backdrop — the painting the whole match is played over.
 *
 *   node tools/pack-arena.mjs             # -> src/assets/arena/sky.webp
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
    src: "src/source/arena/gate.png",
    out: "src/assets/arena/sky.webp",
    /**
     * Drop the top quarter — the storm sky, and with it the gate's horns.
     *
     * Not a taste call, a geometry one, and the same one the sky castle this
     * replaced was cut for. The layout pins the painting's floor line to the
     * boss floor, which sits about 0.42 down a portrait screen, and `fitArena`
     * can only slide the picture by the overscan it has. Work the clamp
     * backwards and it gives a hard rule: the pin is only reachable when the
     * floor sits at or above `1 - 0.58/OVERSCAN` of the packed art.
     *
     * In this render the courtyard stone starts at 0.63 of the height, and 0.63
     * needs an overscan of 1.57 — which is a 2.2x blow-up of a 1254px source on
     * a phone, i.e. a painting drawn by the GPU's bilinear filter. Cutting the
     * top 26% moves the floor to 0.50 of what is left, which OVERSCAN 1.25
     * reaches with room to spare.
     *
     * What goes is the horned skull over the gate, and that is worth saying out
     * loud because it is the best thing in the picture. It could not have been
     * shown anyway: a portrait screen has 42% of its height above the boss
     * floor and this art has 63% above its own, so a third of the art above the
     * floor line is unshowable at any crop — and what stands in that space on
     * screen is the boss. The horns lose to the monster, which is the right way
     * round. The pillars, the rune panels and the black doorway all survive,
     * and those are what the beast is actually read against.
     */
    crop: { top: 0.26 },
    /**
     * The crop's own height: no downscale at all, which is as sharp as this
     * source can ever be, and it is not enough.
     *
     * The delivered render is 1254 square — a fifth of the pixels the sky
     * castle export had — so after the crop there are 928 rows to cover a
     * screen the layout then magnifies by OVERSCAN. A 390x844 phone at 2x draws
     * this 2530 device pixels tall, a 2.7x blow-up. That is soft, and no
     * setting in this file fixes it: there are no more pixels in the file.
     *
     * It is survivable here in a way it was not for the sky, and the reason is
     * what the two paintings are made of. A cloud bank is one long gentle ramp
     * and a bilinear stretch across it invents visible seams; cracked stone,
     * banners and firelight are high-frequency noise, and a stretch across
     * those reads as haze rather than as error. Re-run the arena prompt in
     * prompts.md at 4K if this ever has to hold up on a tablet.
     */
    height: 928,
    /**
     * Lower than the sky arena's 84. This picture is stone, ember and shadow
     * rather than one long gradient, so the banding that quality was buying
     * protection from is not a failure mode here — and the source is small
     * enough that every kilobyte of it lands in the bundle magnified.
     */
    quality: 80,
    what: "gate arena",
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
