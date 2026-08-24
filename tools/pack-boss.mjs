/**
 * Cut the boss animation out of `src/source/boss/animation.png` and pack it into a
 * sheet the game can actually play.
 *
 *   node tools/pack-boss.mjs                     # -> src/assets/boss/magmaroth-sheet.webp
 *   node tools/pack-boss.mjs --png               # keep the intermediate PNG too
 *   node tools/pack-boss.mjs --contact           # also write a flicker test
 *
 * The source is not a sprite sheet. It is a picture of one: twenty renders laid
 * out four rows by five, generated rather than authored, and none of the things
 * a sheet has to be. The cells are not a grid — the horizontal pitch wanders
 * between 252 and 282 pixels. The figure is not registered — it drifts twenty
 * pixels down the frame between neighbours and changes size by five percent.
 * The last row of effects is not even separable: the fire jet and the lava blast
 * run through three cells with no gutter between them. Handed to Pixi as a
 * uniform grid it would come out as a golem having a seizure.
 *
 * So this reads the layout out of the pixels instead of assuming one:
 *
 *   1. Bands. Split on rows that are entirely transparent. Those are clean —
 *      the four rows never touch.
 *   2. Frames. Split each band on columns that are entirely transparent, which
 *      is what makes the bad row obvious: it comes back as three runs instead
 *      of five, and the frames taken from it are the ones this tool skips.
 *   3. Register. Every frame is anchored on the stance — the middle of the dark
 *      rock in the bottom fifth of the figure, and the sole under it. Feet are
 *      the one part of a standing golem that means the same thing in every
 *      frame; the body's own bounding box does not, because the fire it holds
 *      grows out to the right and drags the centre with it.
 *   4. Pack. One cell big enough for the widest frame in every direction from
 *      that anchor, so nothing is clipped and every frame shares one anchor —
 *      which is what lets the game swap textures under a single sprite.
 *
 * Output is WebP: the frames are 2 MB of PNG and the deliverable is a single
 * inlined HTML file, where that would arrive as 2.7 MB of base64.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src/source/boss/animation.png");
const OUT = join(ROOT, "src/assets/boss/magmaroth-sheet");

/** Alpha at or under this is backdrop, not art. */
const EMPTY = 40;

/** Alpha over this is the figure itself rather than the glow around it. */
const SOLID = 200;

/** Brightest channel a pixel can have and still be rock rather than fire. */
const ROCK = 120;

/** Fraction of the figure's height that counts as "the stance". */
const STANCE = 0.18;

/** Columns in the packed sheet. Four keeps it near square at eleven frames. */
const COLS = 4;

/**
 * Which renders to keep, as [band, frame] pairs, in the order they play.
 *
 * The bottom band is the idle: five near-identical standing poses that differ
 * only in how the lava is breathing, which is exactly what an idle wants. The
 * charge runs out of the top band into the second one, and stops at the frame
 * before the fireball leaves the hands — the six kept frames build the fire and
 * hold it. What follows in the source is a comet flying off to the right and
 * then a lava field detonating, and the boss in this game throws its lava down
 * at a board underneath it, not sideways past it. Those frames are the game's
 * own VFX to draw, not the golem's to hold.
 */
const IDLE = [
  [3, 0],
  [3, 1],
  [3, 2],
  [3, 3],
  [3, 4],
];
const CHARGE = [
  [0, 2],
  [0, 3],
  [0, 4],
  [1, 0],
  [1, 1],
  [1, 2],
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

/* -------------------------------------------------------------------- split */

/** Runs of true in a flag array, as [start, end] pairs. */
function runs(flags) {
  const out = [];
  let start = -1;
  for (let i = 0; i <= flags.length; i++) {
    if (flags[i]) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      out.push([start, i - 1]);
      start = -1;
    }
  }
  return out;
}

/** The source split into bands of frames, by transparent rows then columns. */
function split(px, w, h) {
  const at = (x, y) => px[(y * w + x) * 4 + 3];

  const rowUsed = [];
  for (let y = 0; y < h; y++) {
    let used = false;
    for (let x = 0; x < w && !used; x++) if (at(x, y) > EMPTY) used = true;
    rowUsed.push(used);
  }

  return runs(rowUsed).map(([y0, y1]) => {
    const colUsed = [];
    for (let x = 0; x < w; x++) {
      let used = false;
      for (let y = y0; y <= y1 && !used; y++) if (at(x, y) > EMPTY) used = true;
      colUsed.push(used);
    }
    // A run a handful of pixels wide is a spark the renderer left behind, not a
    // frame. Everything real here is over two hundred wide.
    const frames = runs(colUsed)
      .filter(([x0, x1]) => x1 - x0 > 32)
      .map(([x0, x1]) => ({ x0, x1, y0, y1 }));
    return { y0, y1, frames };
  });
}

/* ----------------------------------------------------------------- register */

/**
 * Measure one frame: what it covers, what of that is the figure, and the point
 * the whole sheet will be hung from.
 */
function measure(px, w, box) {
  const at = (x, y) => {
    const i = (y * w + x) * 4;
    return { a: px[i + 3], max: Math.max(px[i], px[i + 1], px[i + 2]) };
  };

  // Everything, glow included: this is what the cell has to be able to hold.
  let cx0 = box.x1;
  let cy0 = box.y1;
  let cx1 = box.x0;
  let cy1 = box.y0;
  // The figure alone: this is what the anchor is measured against.
  let fx0 = box.x1;
  let fy0 = box.y1;
  let fx1 = box.x0;
  let fy1 = box.y0;

  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      const p = at(x, y);
      if (p.a <= EMPTY) continue;
      if (x < cx0) cx0 = x;
      if (x > cx1) cx1 = x;
      if (y < cy0) cy0 = y;
      if (y > cy1) cy1 = y;
      if (p.a <= SOLID) continue;
      if (x < fx0) fx0 = x;
      if (x > fx1) fx1 = x;
      if (y < fy0) fy0 = y;
      if (y > fy1) fy1 = y;
    }
  }

  // The stance: rock, near the floor of the figure. Fire is excluded by
  // brightness — in the charge frames it pours down past the knees, and an
  // anchor that followed it would walk the golem across the screen.
  const from = Math.round(fy1 - (fy1 - fy0) * STANCE);
  let sx0 = fx1;
  let sx1 = fx0;
  let sy1 = from;
  for (let y = from; y <= fy1; y++) {
    for (let x = fx0; x <= fx1; x++) {
      const p = at(x, y);
      if (p.a <= SOLID || p.max > ROCK) continue;
      if (x < sx0) sx0 = x;
      if (x > sx1) sx1 = x;
      if (y > sy1) sy1 = y;
    }
  }
  // A frame with no rock down there at all would be an effect, not the golem.
  const anchor =
    sx1 >= sx0
      ? { x: Math.round((sx0 + sx1) / 2), y: sy1 }
      : { x: Math.round((fx0 + fx1) / 2), y: fy1 };

  return {
    box: { x0: cx0, y0: cy0, x1: cx1, y1: cy1 },
    figure: { x0: fx0, y0: fy0, x1: fx1, y1: fy1 },
    anchor,
  };
}

/* -------------------------------------------------------------------- main */

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

const info = probe(SOURCE);
const px = decode(SOURCE);
console.log(`in   src/source/boss/animation.png  ${info.w}x${info.h}`);

const bands = split(px, info.w, info.h);
bands.forEach((b, i) =>
  console.log(
    `     band ${i}: y ${b.y0}..${b.y1}, ${b.frames.length} frame(s)` +
      (b.frames.length === 5 ? "" : "  <- not five, skipped unless listed"),
  ),
);

const order = [...IDLE, ...CHARGE];
const picked = order.map(([bi, fi], n) => {
  const band = bands[bi];
  if (!band || !band.frames[fi]) {
    throw new Error(`frame [${bi},${fi}] is not in the source`);
  }
  return { n, bi, fi, ...measure(px, info.w, band.frames[fi]) };
});

// The cell has to hold the furthest reach of every frame in each direction from
// its own anchor, or a frame would be clipped the moment it is the widest one.
const reach = picked.reduce(
  (r, f) => ({
    left: Math.max(r.left, f.anchor.x - f.box.x0),
    right: Math.max(r.right, f.box.x1 - f.anchor.x),
    up: Math.max(r.up, f.anchor.y - f.box.y0),
    down: Math.max(r.down, f.box.y1 - f.anchor.y),
  }),
  { left: 0, right: 0, up: 0, down: 0 },
);
// One pixel of margin so a bilinear sample at the edge of a cell cannot reach
// into its neighbour.
const PAD = 1;
const cell = {
  w: reach.left + reach.right + 1 + PAD * 2,
  h: reach.up + reach.down + 1 + PAD * 2,
  ax: reach.left + PAD,
  ay: reach.up + PAD,
};

const rows = Math.ceil(picked.length / COLS);
const sheetW = cell.w * COLS;
const sheetH = cell.h * rows;
const out = Buffer.alloc(sheetW * sheetH * 4);

picked.forEach((f, i) => {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const ox = col * cell.w + cell.ax - f.anchor.x;
  const oy = row * cell.h + cell.ay - f.anchor.y;
  for (let y = f.box.y0; y <= f.box.y1; y++) {
    const dy = y + oy;
    for (let x = f.box.x0; x <= f.box.x1; x++) {
      const dx = x + ox;
      const src = (y * info.w + x) * 4;
      const dst = (dy * sheetW + dx) * 4;
      out[dst] = px[src];
      out[dst + 1] = px[src + 1];
      out[dst + 2] = px[src + 2];
      out[dst + 3] = px[src + 3];
    }
  }
});

console.log(
  `\n     ${picked.length} frames, cell ${cell.w}x${cell.h}, anchor ${cell.ax},${cell.ay}, sheet ${sheetW}x${sheetH}`,
);
picked.forEach((f, i) => {
  const fig = f.figure;
  console.log(
    `     #${String(i).padStart(2)} band ${f.bi} frame ${f.fi}` +
      `  figure ${fig.x1 - fig.x0 + 1}x${fig.y1 - fig.y0 + 1}` +
      `  anchor ${f.anchor.x},${f.anchor.y}` +
      `  rise ${f.anchor.y - fig.y0}`,
  );
});

// How much a frame actually differs from the one before it, once registered.
// A sheet whose neighbours are identical is a still image with extra steps, and
// this is the number that says whether the idle is worth playing at all.
for (let i = 1; i < picked.length; i++) {
  let diff = 0;
  const a = (i - 1) % COLS;
  const b = i % COLS;
  const ra = Math.floor((i - 1) / COLS);
  const rb = Math.floor(i / COLS);
  for (let y = 0; y < cell.h; y++) {
    for (let x = 0; x < cell.w; x++) {
      const pa = ((ra * cell.h + y) * sheetW + a * cell.w + x) * 4;
      const pb = ((rb * cell.h + y) * sheetW + b * cell.w + x) * 4;
      diff +=
        Math.abs(out[pa] - out[pb]) +
        Math.abs(out[pa + 1] - out[pb + 1]) +
        Math.abs(out[pa + 2] - out[pb + 2]) +
        Math.abs(out[pa + 3] - out[pb + 3]);
    }
  }
  console.log(
    `     #${i - 1}->#${i} mean delta ${(diff / (cell.w * cell.h * 4)).toFixed(1)}`,
  );
}

if (flags.has("--png")) {
  encode(out, sheetW, sheetH, `${OUT}.png`);
  console.log(`out  ${OUT.slice(ROOT.length + 1).replace(/\\/g, "/")}.png`);
}

// `-quality` is the colour; the alpha channel rides along at the same setting
// and is what a cutout lives or dies by, so this is the knob to turn if the
// silhouette ever picks up a fringe.
encode(out, sheetW, sheetH, `${OUT}.webp`, [
  "-c:v",
  "libwebp",
  "-lossless",
  "0",
  "-quality",
  "88",
  "-compression_level",
  "6",
  "-preset",
  "drawing",
]);
console.log(`out  ${OUT.slice(ROOT.length + 1).replace(/\\/g, "/")}.webp`);

// Every frame stacked on top of the others: if the registration is off, the
// golem in this image has four outlines.
if (flags.has("--contact")) {
  const test = Buffer.alloc(cell.w * cell.h * 4);
  picked.forEach((f, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    for (let y = 0; y < cell.h; y++) {
      for (let x = 0; x < cell.w; x++) {
        const s = ((row * cell.h + y) * sheetW + col * cell.w + x) * 4;
        const d = (y * cell.w + x) * 4;
        const k = 1 / picked.length;
        for (let c = 0; c < 4; c++) test[d + c] += Math.round(out[s + c] * k);
      }
    }
  });
  encode(test, cell.w, cell.h, `${OUT}-stack.png`);
  console.log(
    `out  ${OUT.slice(ROOT.length + 1).replace(/\\/g, "/")}-stack.png`,
  );
}
