/**
 * Pack the arena backdrop — the painting the whole match is played over.
 *
 *   node tools/pack-arena.mjs             # -> src/assets/arena/sky.webp
 *   node tools/pack-arena.mjs --png       # keep the intermediate PNG too
 *
 * Every byte of this build is base64'd into one index.html, so it arrives 4/3
 * larger again — a raw render is several times the entire shipping budget on its
 * own, which is the whole reason this tool exists.
 *
 * Height is the dimension that has to carry it, not width. The layout cover-fits
 * the plate over the screen with a little overscan, so on a phone held upright a
 * landscape painting is scaled to the screen's *height* and most of its width is
 * cropped away. Everything past that is near-free and is what stops the flanking
 * detail being cropped off on a tablet.
 *
 * No trim pass: these are full-bleed paintings with no alpha in them. There is
 * no ink box to find — it would return the whole file — and the layout aims at
 * the composition's centre, so cropping the sides would move the subject off the
 * axis the board is centred on. What does get cut, or added, is at the top and
 * the bottom, and only ever to put the ground line where the layout needs it:
 * see `crop` and `padBottom` in the job.
 *
 * Three paintings have been through here — a 4096x2048 sky castle, a 1254 square
 * demon gate, and the landscape ruins that ship today. The first one's render is
 * no longer on disk: it was 12 MB of the repo for an arena two generations gone,
 * and the prompt it came from is still in src/source/prompts.md, which is the
 * part worth keeping.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const JOBS = [
  {
    /**
     * The ruined city, and the third painting this slot has held: a sky castle,
     * then the demon gate, now a chained gothic sprawl over a fog chasm.
     *
     * Delivered 1024x585 — a landscape crop, which is a shape this slot has not
     * had before and the reason `padBottom` exists below. The gate render was
     * square and the sky castle was 2:1 at 4K; both had height to spare, and
     * this has none. See the note on padBottom for what that costs and how it
     * is paid.
     *
     * Swap back by pointing `src` at gate.png and restoring `crop`/`floor`
     * from the note in each — the two are alternatives, not a sequence.
     */
    src: "src/source/arena/ruins.png",
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
    /**
     * Where the ground line sits in the delivered file, as a fraction of its
     * height, and where it has to sit in the packed one.
     *
     * Measured off the render with guides rather than guessed: the braziers,
     * the base of the central pillar and the front of the fog bank all land on
     * 0.70. `horizon` is the number art/background.js is holding — HORIZON
     * there — and the pair is what padBottom solves for.
     *
     * The gate render had 0.63 and was cut down to 0.50 by cropping the top
     * 26%. That trade is wrong for this art: a landscape file has no height to
     * give away, and the crop would have to be 40% to reach the same place,
     * which is the entire skyline — every spire, every chain — for a floor
     * line. So the correction is made at the other end instead.
     */
    floor: 0.7,
    horizon: 0.5,
    /**
     * Extend the bottom until the ground line lands on `horizon`.
     *
     * The same geometry the crop was doing, from the other side, and it is
     * nearly free here — which is a claim worth showing rather than asserting.
     *
     * The layout cover-fits this by height and slides it so the ground line
     * lands on the boss's floor, which is about 0.42 down the screen. So what
     * the packed file's proportions actually decide is how much of the painting
     * is *above* that line, and everything below it is behind the board, the
     * scrim at 0.84 to 0.95 alpha, and the hero row. Rows added down there are
     * paid for in bytes and in nothing else.
     *
     * The win is resolution. Reaching HORIZON 0.50 by cropping leaves 433 rows
     * to cover a screen the layout then magnifies by OVERSCAN, and on a 390x844
     * phone that is a 2.8x blow-up of which 13% of the width is visible.
     * Padding leaves 819, the same phone draws it at 1.3x, and 30% of the width
     * survives — twice the sharpness and twice the composition, for 234 rows
     * nobody can see.
     *
     * What is in them: each column's own last real pixel, carried down and
     * faded to `floorMix` of itself. Per column rather than one flat band so
     * the rocks and the mist at the bottom edge continue as streaks instead of
     * stopping against a line, and dark because the alternative is inventing
     * foreground detail that the scrim would then have to hide.
     */
    padBottom: true,
    floorMix: 0.22,
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
    quality: 90,
    what: "ruined city",
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

/**
 * Carry the bottom edge down until `floor` sits at `horizon`.
 *
 * Each added row is the file's own last row, smeared sideways and dimmed further
 * the further down it goes — a fade to `mix` of the original, eased so the join at the top of the
 * pad is invisible and the bottom is nearly black. Nothing is invented and
 * nothing is mirrored: a mirror brings recognisable shapes back up the frame
 * upside down, and the one thing this band must not do is draw the eye.
 */
function padRows(px, w, h, job) {
  const target = Math.round((job.floor * h) / job.horizon);
  const pad = target - h;
  if (pad <= 0) return { px, w, h };

  const out = Buffer.alloc(w * target * 4);
  px.copy(out, 0, 0, w * h * 4);

  /**
   * The seed row, smeared sideways first.
   *
   * Carried down raw it is a comb: every column keeps its own colour for 234
   * rows, and a bottom edge that happens to alternate rock and mist becomes a
   * curtain of vertical stripes. A wide horizontal average over it keeps the
   * left-to-right shape of the edge — dark at the sides, the pale chasm in the
   * middle — and throws away everything narrower than the smear, which is
   * exactly the banding.
   */
  const seed = Buffer.alloc(w * 4);
  const reach = Math.max(1, Math.round(w * 0.06));
  const src0 = (h - 1) * w * 4;
  for (let x = 0; x < w; x++) {
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (let k = -reach; k <= reach; k++) {
      const sx = Math.min(w - 1, Math.max(0, x + k));
      const i = src0 + sx * 4;
      r += px[i];
      g += px[i + 1];
      b += px[i + 2];
      n++;
    }
    seed[x * 4] = clamp8(r / n);
    seed[x * 4 + 1] = clamp8(g / n);
    seed[x * 4 + 2] = clamp8(b / n);
    seed[x * 4 + 3] = px[src0 + x * 4 + 3];
  }

  const mix = job.floorMix === undefined ? 0.3 : job.floorMix;

  for (let y = 0; y < pad; y++) {
    // Squared rather than linear: the first rows off the edge stay close to it,
    // which is what makes the seam disappear, and the fall happens lower down
    // where there is nothing left to protect.
    const t = (y + 1) / pad;
    const k = 1 - (1 - mix) * t * t;
    const row = (h + y) * w * 4;
    for (let x = 0; x < w; x++) {
      const s = x * 4;
      const d = row + x * 4;
      out[d] = clamp8(seed[s] * k);
      out[d + 1] = clamp8(seed[s + 1] * k);
      out[d + 2] = clamp8(seed[s + 2] * k);
      out[d + 3] = seed[s + 3];
    }
  }
  return { px: out, w, h: target };
}

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

  let src = job.crop
    ? cropRows(raw, info.w, info.h, job.crop)
    : { px: raw, w: info.w, h: info.h };
  if (job.padBottom) src = padRows(src.px, src.w, src.h, job);

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
    `${job.what.padEnd(12)} ${info.w}x${info.h} -> plate ${src.w}x${src.h}` +
      ` -> ${dw}x${dh}  aspect ${(dw / dh).toFixed(3)}` +
      `   ${kb(source).padStart(8)} kB -> ${kb(out).padStart(7)} kB` +
      `   (about ${((statSync(out).size * 4) / 3 / 1024).toFixed(0)} kB of` +
      ` base64 in dist/index.html)`,
  );
}
