/**
 * Cut the fire ultimate out of `src/source/fx/fire.png` and pack it into a sheet
 * the game can play.
 *
 *   node tools/pack-fire.mjs              # -> src/assets/fx/fire-sheet.webp
 *   node tools/pack-fire.mjs --contact    # also write a strip to flick through
 *
 * The source is not a sprite sheet. It is a page of fire studies: ten drawings
 * laid out loosely across two rows on a flat slate backdrop, sized to fill the
 * page rather than to register against each other, and close enough together
 * that sparks off one land inside the next. Split on empty rows and columns the
 * way tools/pack-boss.mjs splits its source and the whole page comes back as one
 * frame, because there is no gutter anywhere in it that a spark does not cross.
 *
 * So the boxes below are read off the page by eye. That is the honest way to cut
 * this one, and `--contact` is how they were checked.
 *
 * Two decisions do the rest of the work:
 *
 *   1. No alpha. The backdrop is subtracted rather than cut away, and the sheet
 *      is drawn with the `add` blend — which is what fire wants anyway. Anything
 *      that was backdrop lands on zero and adds nothing; anything brighter keeps
 *      exactly the light it had over it. No flood fill, no matting, no pale
 *      fringe around a flame, and the file has no alpha channel to pay for.
 *      What it costs is the smoke: the dark puffs at the end of the page are
 *      darker than the slate they sit on, so they clamp to nothing and the burn
 *      ends on embers instead of soot.
 *   2. One space, not ten. Every frame is centred in a cell big enough for the
 *      largest of them and kept at its own size, so the growth from a guttering
 *      flame to a detonation is in the sheet rather than something the game has
 *      to animate on top of it.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src/source/fx/fire.png");
const OUT = join(ROOT, "src/assets/fx/fire-sheet");

/** Repo-relative, forward slashes, for the log lines. */
const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");

/**
 * The ten drawings, in source pixels, in the order they play.
 *
 * Top row first — a flame catching, swelling, and stretching into a comet — then
 * the bottom row, which is the same fire arriving: a blaze, the detonation, the
 * shards, and the streaks going out. Boxes are generous on purpose: a cell costs
 * nothing once the backdrop subtracts to black, and a box cropped tight to the
 * flame clips the sparks that sell it.
 */
const FRAMES = [
  { x: 100, y: 140, w: 200, h: 180 },
  { x: 270, y: 85, w: 260, h: 250 },
  { x: 505, y: 10, w: 265, h: 325 },
  { x: 770, y: 5, w: 440, h: 340 },
  { x: 1180, y: 10, w: 548, h: 335 },
  { x: 10, y: 335, w: 460, h: 353 },
  { x: 440, y: 340, w: 380, h: 348 },
  { x: 780, y: 345, w: 430, h: 343 },
  { x: 1120, y: 370, w: 400, h: 318 },
  { x: 1450, y: 420, w: 278, h: 268 },
];

/** Columns in the packed sheet. Five keeps ten frames near square. */
const COLS = 5;

/**
 * How much of the source's resolution to keep.
 *
 * The effect plays about as wide as the boss and is gone in three quarters of a
 * second. Full size buys detail nobody can stop on, at a third again the bytes.
 */
const SCALE = 0.72;

/** Slack around each frame in the cell, so a bilinear sample cannot bleed. */
const PAD = 2;

/**
 * How far in from a box edge the frame ramps out, as a share of the box.
 *
 * The drawings touch. Every box on this page has a neighbour’s sparks in one
 * corner and gives up some of its own to the box beside it, and cut square that
 * shows as a straight vertical seam down the middle of a fireball. Ramped, and
 * played additively, the seam is simply where the light runs out — which is what
 * the edge of a flame looks like anyway.
 */
const FEATHER = 0.09;

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

/* -------------------------------------------------------------------- main */

const info = probe(SOURCE);
const px = decode(SOURCE);
console.log(`in   ${rel(SOURCE)}  ${info.w}x${info.h}`);

/**
 * The backdrop, as the median of the page's own border.
 *
 * Median rather than a corner: the slate carries a soft vignette, so any single
 * sample is a few levels off the rest of it and subtracting that sample leaves
 * the opposite corner glowing.
 */
const edge = [[], [], []];
for (let x = 0; x < info.w; x += 3) {
  for (const y of [0, 1, info.h - 2, info.h - 1]) {
    const i = (y * info.w + x) * 4;
    for (let c = 0; c < 3; c++) edge[c].push(px[i + c]);
  }
}
const bg = edge.map((v) => v.sort((a, b) => a - b)[v.length >> 1]);
// A little over the median, so the vignette's lighter half also lands on zero
// rather than as a grey wash across one side of every cell.
const floor = bg.map((v) => v + 10);
console.log(`     backdrop rgb(${bg.join(", ")}), subtracting ${floor[0]}+`);

const cell = {
  w: Math.round(Math.max(...FRAMES.map((f) => f.w)) * SCALE) + PAD * 2,
  h: Math.round(Math.max(...FRAMES.map((f) => f.h)) * SCALE) + PAD * 2,
};
const rows = Math.ceil(FRAMES.length / COLS);
const sheetW = cell.w * COLS;
const sheetH = cell.h * rows;
const out = Buffer.alloc(sheetW * sheetH * 4);
for (let i = 3; i < out.length; i += 4) out[i] = 255;

/** 0 at a box edge, 1 once FEATHER of the way in, smooth between. */
function ramp(i, span) {
  const band = span * FEATHER;
  const t = Math.min(i + 0.5, span - 0.5 - i) / band;
  if (t >= 1) return 1;
  if (t <= 0) return 0;
  return t * t * (3 - 2 * t);
}

FRAMES.forEach((f, i) => {
  const fw = Math.round(f.w * SCALE);
  const fh = Math.round(f.h * SCALE);
  const ox = (i % COLS) * cell.w + Math.round((cell.w - fw) / 2);
  const oy = Math.floor(i / COLS) * cell.h + Math.round((cell.h - fh) / 2);
  for (let y = 0; y < fh; y++) {
    // Box filter down to the packed size: a nearest sample on art this fine
    // turns the spark field into aliased confetti that crawls between frames.
    const sy0 = f.y + Math.floor((y * f.h) / fh);
    const sy1 = Math.min(f.y + f.h, f.y + Math.floor(((y + 1) * f.h) / fh));
    for (let x = 0; x < fw; x++) {
      const sx0 = f.x + Math.floor((x * f.w) / fw);
      const sx1 = Math.min(f.x + f.w, f.x + Math.floor(((x + 1) * f.w) / fw));
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = sy0; sy < Math.max(sy1, sy0 + 1); sy++) {
        for (let sx = sx0; sx < Math.max(sx1, sx0 + 1); sx++) {
          const s = (sy * info.w + sx) * 4;
          r += px[s];
          g += px[s + 1];
          b += px[s + 2];
          n++;
        }
      }
      const k = ramp(x, fw) * ramp(y, fh);
      const dst = ((oy + y) * sheetW + ox + x) * 4;
      out[dst] = Math.max(0, Math.round((r / n - floor[0]) * k));
      out[dst + 1] = Math.max(0, Math.round((g / n - floor[1]) * k));
      out[dst + 2] = Math.max(0, Math.round((b / n - floor[2]) * k));
    }
  }
});

console.log(
  `\n     ${FRAMES.length} frames, cell ${cell.w}x${cell.h}, sheet ${sheetW}x${sheetH}\n`,
);
console.log(`       cols:  ${COLS},`);
console.log(`       cell:  { w: ${cell.w}, h: ${cell.h} },`);
console.log(`       count: ${FRAMES.length},\n`);

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

// No alpha in, no alpha out: the sheet is played additively, so the channel
// would be a flat 255 across a megapixel for nothing.
encode(out, sheetW, sheetH, `${OUT}.webp`, [
  "-c:v",
  "libwebp",
  "-lossless",
  "0",
  "-quality",
  "82",
  "-compression_level",
  "6",
  "-preset",
  "picture",
  "-pix_fmt",
  "yuv420p",
]);
console.log(
  `out  ${rel(OUT)}.webp  ${(statSync(`${OUT}.webp`).size / 1024).toFixed(1)} kB`,
);

// The cut, frame by frame, on the ground it will be played over. If a box is
// wrong it is wrong here — clipped sparks, a neighbour's flame in the corner.
if (flags.has("--contact")) {
  const test = Buffer.alloc(sheetW * sheetH * 4);
  for (let i = 0; i < sheetW * sheetH; i++) {
    test[i * 4] = 26;
    test[i * 4 + 1] = 18;
    test[i * 4 + 2] = 30;
    test[i * 4 + 3] = 255;
  }
  for (let i = 0; i < sheetW * sheetH; i++) {
    for (let c = 0; c < 3; c++) {
      test[i * 4 + c] = Math.min(255, test[i * 4 + c] + out[i * 4 + c]);
    }
  }
  encode(test, sheetW, sheetH, `${OUT}-contact.png`);
  console.log(`out  ${rel(OUT)}-contact.png`);
}
