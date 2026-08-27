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
 * Five paintings have been through here — a 4096x2048 sky castle, a 1254 square
 * demon gate, the landscape ruins, the fire rift, and the storm citadel that
 * ships today. The first one's render is no longer on disk: it was 12 MB of the
 * repo for an arena three generations gone, and the prompt it came from is still
 * in src/source/prompts.md, which is the part worth keeping.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const JOBS = [
  {
    /**
     * The sky islands, and the sixth painting this slot has held: a sky castle,
     * the demon gate, the chained gothic city, the burning rift, the storm
     * citadel, now a chain of floating islands under a mint sky.
     *
     * The first plate here that did not arrive as a render. It is
     * `T_CAM_Lobby_Background_01`, lifted out of the Invokers Titan Legacy
     * build at 4096x2048 and area-averaged to 2048x1024 on the way in: the
     * packed plate is 1395 on its long side, and ten megabytes of source in the
     * repo would have bought nothing but the repo.
     *
     * One thing about it has to be said plainly, because every number below and
     * half of art/background.js turns on it: this painting is lit for a lobby,
     * not for a boss. Measured the way every plate before it was — the centre
     * third, the 0.22 of the frame directly behind the beast's mass — it comes
     * in at 157 mean luminance against the storm citadel's 53. Three times the
     * light, in the one band where light is the enemy.
     *
     * No choice of `floor` answers that. The same measurement taken at every
     * ground line this picture offers, from 0.45 through 0.76, runs between
     * 2.0x and 3.0x the plate it replaces, because the middle of this painting
     * is open mist from edge to edge. What answers it is POOL_ALPHA in
     * art/background.js — the layer that darkens where the silhouette is rather
     * than darkening the picture — and the numbers there moved with this swap.
     * GRADE_ALPHA moved the other way, and for the opposite reason: this frame
     * is dark at the top where the last four were bright.
     *
     * Swap back by pointing `src` at storm.png with `crop: { bottom: 0.9636 }`,
     * `floor` 0.872 and `height` 1395; at rift.png with `floor` 0.73,
     * `floorMix` 0.16 and `height` 1191; at ruins.png with `floor` 0.7; or at
     * gate.png with `crop: { top: 0.26 }`, `floor` 0.5 and `padBottom` off.
     * The six are alternatives and not a sequence, and the grade in
     * art/background.js has to travel back with any of them.
     */
    src: "src/source/arena/islands.png",
    out: "src/assets/arena/sky.webp",
    /**
     * No `crop`. This one arrives clean — no letterbox, no black rows at either
     * edge, measured at 53.6 across the top six rows and 183 across the bottom
     * six — which is the first plate in three not to need one, and the reason
     * every fraction below is a fraction of all 1024 delivered rows.
     */
    /**
     * Where the ground line sits in the file, and where it has to land.
     *
     * Measured on the centre third, which is the only part a portrait phone
     * shows: the big foreground island's flat top runs from 0.69 to about 0.75,
     * and its front lip — where the green stops and the rock underside starts —
     * crosses at 0.76. That is the last line in this picture a golem could
     * stand on. Everything under it is the island's own belly and then cloud.
     *
     * `horizon` is unchanged at 0.38 and has to be: it is the number
     * art/background.js holds as HORIZON, and the pair is what padBottom
     * solves for. Change one and the other is wrong.
     */
    floor: 0.76,
    horizon: 0.38,
    /**
     * Extend the bottom until the ground line lands on `horizon`.
     *
     * 0.76 of 1024 over 0.38 is 2048 exactly, so the pad is the length of the
     * picture over again: 1024 invented rows under 1024 real ones, the largest
     * share this slot has ever run. It is affordable for the reason the storm's
     * 787 rows were — everything below the ground line is behind the board, the
     * scrim at 0.84 to 0.95 alpha and the hero row, and a horizontal smear is
     * the cheapest thing WebP encodes.
     *
     * `floorMix` is the one number this plate could not inherit. Every painting
     * before it ended on something dark: the storm's dim blue rock at 39.5, the
     * rift's lit lava at 44, and 0.22 of either is nothing. This one ends on
     * open cloud at 183 — the brightest edge any plate has handed the smear —
     * and 0.22 of that is a band at 40 held under the entire board. 0.06 puts
     * the far end at 11 and leaves the join at the top exactly as invisible,
     * because hiding the join is what the squared curve does and the mix only
     * says where the fall ends.
     */
    padBottom: true,
    floorMix: 0.06,
    /**
     * The storm's height kept. What changed is the shape.
     *
     * `floor` over `horizon` squares this plate off — 2048 rows against 2048
     * columns, where the storm packed 1024 against 1395 — so at `height` 1395
     * the width follows the aspect to 1395 as well, and this is the first plate
     * in three that is genuinely resampled rather than packed at its delivered
     * size. Both are wanted here: the source is a 4096-wide texture rather than
     * a render cut to fit, so there is real detail to average down into, and a
     * third more pixels than the storm plate is bought back by what is in them.
     * Most of the extra third is smear.
     *
     * Height is the dimension the layout scales by, so 1395 is the number that
     * holds sharpness on a portrait phone and the width is what keeps the
     * flanking islands on a tablet. Track `horizon` if it ever moves: the pad
     * solves to `floor * srcH / horizon` and this caps it, so a value above
     * 2048 would be an upscale of the pad and nothing else.
     */
    height: 1395,
    /**
     * Unchanged from the storm plate at first cut, and re-measured after: this
     * painting is mist and long smooth ramps almost everywhere, which is the
     * one thing WebP's 8x8 blocks show their edges in, and it is squarer than
     * anything packed here before. See the run log for what it came out at.
     */
    quality: 90,
    what: "sky islands",
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
