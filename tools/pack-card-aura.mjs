/**
 * Cut the two card auras off their black backdrop and pack them for the game.
 *
 *   node tools/pack-card-aura.mjs           # -> src/assets/cards/aura-*.webp
 *   node tools/pack-card-aura.mjs --proof   # also composite both over a dark card
 *
 * The sources are two flux-1.1-pro frames in `src/source/cards` — see the Card
 * aura section of src/source/prompts.md for the prompts and the seeds:
 *
 *   aura-sheet.png        672x1408  the standing halo: a hollow portrait
 *                                   rectangle drawn as a white-hot rim with a
 *                                   bloom and a scatter of sparks around it,
 *                                   floating in black with room to bloom into.
 *   aura-burst-sheet.png  672x1408  the ring the tap throws off: the same
 *                                   rectangle with a far denser discharge — the
 *                                   filaments cover the whole border rather than
 *                                   dusting it — and its own glow all but
 *                                   touching the edges of the frame.
 *
 * Both are glows, so this is cut-glow.mjs's problem and not cut-bg.mjs's: every
 * pixel from the core out to the last breath of the falloff is *partly*
 * backdrop, and any threshold that has to call a pixel art or backdrop throws
 * the falloff away. A glow flattened onto black is already its own premultiplied
 * form — `pixel = colour * alpha` — so the alpha is the strongest channel and
 * the colour is the pixel divided back through it. That much is lifted straight
 * out of cut-glow.mjs, which explains it at length.
 *
 * Two things are this packer's own, and both come from what the game does with
 * the result rather than from what is in the file.
 *
 * The colour is thrown away. The recovered hue is not used at all: every pixel
 * comes back white and carries only its alpha, because a hero card tints its
 * aura with the element's own GEM_COLORS at runtime and a tint multiplies. Left
 * alone, one of these sheets is cold blue-white (172,200,211 averaged over its
 * bright pixels) and the other is gold (210,165,97) — the model's taste, twice,
 * and neither is any element in config.js. Tinted, the first would drag every
 * card towards cyan and the second would make WATER's aura green. Flattening to
 * white is what puts the six colours back under the one list that owns them.
 *
 * And the crop is measured off the rim rather than off the art. What the game
 * has to line the asset up with is the card's border, so the packer finds the
 * four sides of the lit rectangle, crops to them plus a fixed margin for the
 * bloom, and prints that margin as a fraction of the rim box — which is the pair
 * of numbers art/frameaura.js holds, and the whole contract between the two
 * files. Cropping to the art's own extent instead would hand the game a box
 * whose relationship to the border depends on how far that particular sheet's
 * sparks happened to fly.
 *
 * The margin is also what keeps the halo's second rectangle out. That sheet came
 * back with a faint ghost frame about 120px outside the real one — a rounded
 * outline at around a quarter of the rim's brightness, which composited over a
 * card would read as a second border floating in the arena. PAD is set inside
 * it: the bloom is spent by 50px (247 at the rim, 8 at 40, 4 by 50) and the
 * ghost starts past 110, so 64 keeps all of the light and none of it.
 *
 * ffmpeg is the only dependency, and only to decode and encode, as everywhere
 * else in this folder.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = join(ROOT, "src/source/cards");
const OUT_DIR = join(ROOT, "src/assets/cards");

/**
 * The two assets, and the one number each of them needs.
 *
 * `pad` is how far outside the lit rectangle the crop reaches, in the source's
 * own pixels, and the two are set by completely different limits.
 *
 * The halo's is set by what is out there to keep or avoid — see the header: its
 * bloom is spent by 50px and its ghost frame starts past 110.
 *
 * The burst's is set by the frame it arrived in. That sheet's rectangle runs
 * from y=21 to y=1384 of 1408, so there are only 21 rows above it; 20 is what
 * can be taken without running off the sheet. It costs nothing, because the
 * burst is not sized to sit on the card the way the halo is — it is thrown
 * outwards past the border and faded out inside half a second, and what carries
 * that is `scale`, not margin baked into the file.
 *
 * `width` is what the packed file is scaled to. The halo renders about 71 points
 * wide on a phone and the burst about 58, which at three device pixels to the
 * point is 213 and 174 — so 200 is a little under for one and a little over for
 * the other, and neither is a size anybody can see the difference of on a glow.
 */
const ASSETS = [
  { src: "aura-sheet.png", out: "aura-frame", pad: 64, width: 200 },
  { src: "aura-burst-sheet.png", out: "aura-burst", pad: 20, width: 200 },
];

/** What --proof composites onto: the arena at its darkest, as cut-glow uses. */
const PROOF_BG = [26, 18, 34];
/** ...and the card under the aura, which is HeroCard's own `bg` fill. */
const PROOF_CARD = [0x12, 0x0b, 0x1e];
/** FIRE's GEM_COLORS entry, so the proof is tinted the way a card tints. */
const PROOF_TINT = [0xff, 0x6b, 0x3d];

const LOSSY = ["-c:v", "libwebp", "-quality", "92", "-compression_level", "6"];
const LOSSLESS = [
  "-c:v",
  "libwebp",
  "-lossless",
  "1",
  "-compression_level",
  "6",
];

const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
const kb = (n) => `${(n / 1024).toFixed(1)}kB`;

/* --------------------------------------------------------------------- ffmpeg */

function decode(file) {
  const [w, h] = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    file,
  ])
    .toString()
    .trim()
    .split(",")
    .map(Number);

  const px = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
    { maxBuffer: 1 << 30 },
  );
  if (px.length !== w * h * 4) {
    throw new Error(
      `${rel(file)}: decoded ${px.length} bytes, expected ${w * h * 4}`,
    );
  }
  return { w, h, px };
}

function encode(file, w, h, px, args) {
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
    { input: px, maxBuffer: 1 << 30 },
  );
}

/* --------------------------------------------------------------------- pixels */

/** Strongest channel at a pixel — the glow's own alpha, before it was baked. */
const level = (px, i) => Math.max(px[i], px[i + 1], px[i + 2]);

/**
 * The four sides of the lit rectangle.
 *
 * Each side is the brightest column, or row, in its own half of the sheet — and
 * that works because of what the subject is rather than by luck. A hollow
 * rectangle on black has exactly one vertical run of light in its left half and
 * one in its right, and a column drawn through a run sums far higher than one
 * drawn through the bloom beside it or through the sparks off it. Summed over
 * the middle half of the other axis, so the corners — where two sides meet and
 * every sheet is at its brightest — cannot vote for a side of their own.
 *
 * The halo's ghost frame does not survive this either: it is a quarter of the
 * real rim's brightness and it loses its own half of the sheet to it.
 */
function rimBox({ w, h, px }) {
  const cols = new Float64Array(w);
  const rows = new Float64Array(h);
  const y0 = Math.round(h * 0.25);
  const y1 = Math.round(h * 0.75);
  const x0 = Math.round(w * 0.25);
  const x1 = Math.round(w * 0.75);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = level(px, (y * w + x) * 4);
      if (y >= y0 && y < y1) cols[x] += v;
      if (x >= x0 && x < x1) rows[y] += v;
    }
  }

  const peak = (arr, a, b) => {
    let best = -1;
    let at = a;
    for (let i = a; i < b; i++) {
      if (arr[i] > best) {
        best = arr[i];
        at = i;
      }
    }
    return at;
  };

  return {
    left: peak(cols, 0, w >> 1),
    right: peak(cols, w >> 1, w),
    top: peak(rows, 0, h >> 1),
    bottom: peak(rows, h >> 1, h),
  };
}

/**
 * Lift a box out of the sheet as straight white-on-alpha.
 *
 * The alpha is the strongest channel — the premultiplied form undone — and the
 * colour is thrown away rather than divided back out, for the reason the header
 * gives: the game tints this, and the tint is the only opinion about colour that
 * gets to count.
 */
function lift({ w, px }, box) {
  const bw = box.x1 - box.x0;
  const bh = box.y1 - box.y0;
  const out = Buffer.alloc(bw * bh * 4);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const a = level(px, ((y + box.y0) * w + (x + box.x0)) * 4);
      const o = (y * bw + x) * 4;
      out[o] = 255;
      out[o + 1] = 255;
      out[o + 2] = 255;
      out[o + 3] = a;
    }
  }
  return { w: bw, h: bh, px: out };
}

/* ----------------------------------------------------------------------- pack */

function pack(asset) {
  const src = join(SRC_DIR, asset.src);
  const sheet = decode(src);
  const rim = rimBox(sheet);
  const rw = rim.right - rim.left;
  const rh = rim.bottom - rim.top;

  // Clamped, because the burst's rectangle very nearly touches the top of its
  // own sheet — and a crop that ran off it would shift the rim off centre in the
  // packed file, which is the one thing the fractions below cannot express.
  const box = {
    x0: Math.max(0, rim.left - asset.pad),
    y0: Math.max(0, rim.top - asset.pad),
    x1: Math.min(sheet.w, rim.right + asset.pad),
    y1: Math.min(sheet.h, rim.bottom + asset.pad),
  };
  const cut = lift(sheet, box);

  // Even, so the halves the game centres on land on whole pixels.
  const outW = asset.width - (asset.width % 2);
  const outH = Math.round((cut.h * outW) / cut.w / 2) * 2;
  const file = join(OUT_DIR, `${asset.out}.webp`);
  encode(file, cut.w, cut.h, cut.px, [
    "-vf",
    `scale=${outW}:${outH}:flags=lanczos`,
    ...LOSSY,
  ]);

  // The pair art/frameaura.js holds. Taken off the crop that was actually made
  // rather than off `pad`, so a clamped side reports what it got.
  const padX = (rim.left - box.x0 + (box.x1 - rim.right)) / 2 / rw;
  const padY = (rim.top - box.y0 + (box.y1 - rim.bottom)) / 2 / rh;

  console.log(
    `${asset.src}  ${sheet.w}x${sheet.h}\n` +
      `  rim    ${rw}x${rh} at ${rim.left},${rim.top}` +
      `  aspect ${(rw / rh).toFixed(3)}\n` +
      `  crop   ${cut.w}x${cut.h} at ${box.x0},${box.y0}\n` +
      `  out    ${rel(file)}  ${outW}x${outH}  ${kb(statSync(file).size)}\n` +
      `  PAD_X ${padX.toFixed(4)}   PAD_Y ${padY.toFixed(4)}` +
      `   <- art/frameaura.js`,
  );

  return { asset, cut, rim, box, padX, padY };
}

/* ---------------------------------------------------------------------- proof */

/**
 * Composite a packed aura the way the game does, and write it big enough to see.
 *
 * Not decoration: this is the only check that the rim actually lands on the
 * card's border. The fractions above are arithmetic on a measurement, and a
 * measurement that found the wrong rectangle would print a perfectly plausible
 * pair of numbers. Laid over a card at the card's own proportions, a rim that is
 * off is off in a way nobody has to measure.
 *
 * Sampled nearest and scaled up 3x, which is a proof rather than a render.
 */
function proof(packed) {
  const CARD_W = 59 * 3;
  const CARD_H = Math.round((59 / 0.48) * 3);
  const W = Math.round(CARD_W * 2.2);
  const H = Math.round(CARD_H * 1.7);
  const px = Buffer.alloc(W * H * 4);

  for (let i = 0; i < W * H; i++) {
    px[i * 4] = PROOF_BG[0];
    px[i * 4 + 1] = PROOF_BG[1];
    px[i * 4 + 2] = PROOF_BG[2];
    px[i * 4 + 3] = 255;
  }

  // The card, where HeroRow would put it.
  const cx = (W - CARD_W) / 2;
  const cy = (H - CARD_H) / 2;
  for (let y = 0; y < CARD_H; y++) {
    for (let x = 0; x < CARD_W; x++) {
      const o = ((y + cy) * W + (x + cx)) * 4;
      px[o] = PROOF_CARD[0];
      px[o + 1] = PROOF_CARD[1];
      px[o + 2] = PROOF_CARD[2];
    }
  }

  // The aura over it, sized so the rim box lands on the card box exactly —
  // which is fitCardAura's whole job, done here in four lines.
  const aw = CARD_W * (1 + 2 * packed.padX);
  const ah = CARD_H * (1 + 2 * packed.padY);
  const ax = cx - CARD_W * packed.padX;
  const ay = cy - CARD_H * packed.padY;

  for (let y = 0; y < ah; y++) {
    for (let x = 0; x < aw; x++) {
      const dx = Math.round(x + ax);
      const dy = Math.round(y + ay);
      if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
      const sx = Math.min(
        packed.cut.w - 1,
        Math.floor((x / aw) * packed.cut.w),
      );
      const sy = Math.min(
        packed.cut.h - 1,
        Math.floor((y / ah) * packed.cut.h),
      );
      const a = packed.cut.px[(sy * packed.cut.w + sx) * 4 + 3] / 255;
      if (a <= 0) continue;
      const o = (dy * W + dx) * 4;
      // Additive, through the tint, which is exactly what the sprite does.
      for (let c = 0; c < 3; c++) {
        px[o + c] = Math.min(255, px[o + c] + PROOF_TINT[c] * a);
      }
    }
  }

  const file = join(SRC_DIR, `${packed.asset.out}-proof.png`);
  encode(file, W, H, px, LOSSLESS);
  console.log(`  proof  ${rel(file)}  ${W}x${H}`);
}

const wantProof = process.argv.includes("--proof");
for (const asset of ASSETS) {
  const packed = pack(asset);
  if (wantProof) proof(packed);
}
