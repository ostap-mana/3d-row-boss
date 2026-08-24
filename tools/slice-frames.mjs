/**
 * Cut the frame sheet into one file per frame.
 *
 *   node tools/slice-frames.mjs             # -> src/source/cards/frames/frame-<colour>.png
 *   node tools/slice-frames.mjs --guides    # also mark what was measured
 *
 * The sheet is `src/source/cards/frames-sheet.png`: six rounded frames in a row, transparent inside and
 * out, three of them wearing a coloured glow. Six pictures welded into one file
 * is not something a game can use — every frame has to be its own texture — so
 * this cuts them apart and measures each one on the way out.
 *
 * The cut cannot be made on empty columns, which is the obvious way and the
 * wrong one here. The three plain frames are separated by clean gaps, but the
 * glow on the last three reaches about fourteen pixels past the border and the
 * gap between them is thirty, so their halos meet in the middle: split on
 * emptiness and the purple, orange and red frames come out as one 761-pixel
 * picture with three frames in it.
 *
 * So the split is made on the *solid* ink — the border itself, which is opaque,
 * where a glow never is — and each frame is then grown back out to take its own
 * halo with it, stopping at the midpoint between neighbours so that no pixel is
 * claimed twice. What lands on disk is a frame plus every soft pixel that
 * belongs to it, trimmed of everything else.
 *
 * It also prints what a nine-slice of each would need — border thickness and
 * corner radius, measured rather than guessed — because that is the number the
 * game will want the moment one of these is put around anything.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src/source/cards/frames-sheet.png");
const OUT_DIR = join(ROOT, "src/source/cards/frames");

/** Alpha at or under this is backdrop, not art. */
const EMPTY = 8;

/** Alpha over this is the border itself rather than the glow around it. */
const CORE = 200;

/** Columns of core ink narrower than this are noise, not a frame. */
const MIN_RUN = 8;

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
    { maxBuffer: 1 << 28 },
  );
}

function writePng(buf, w, h, file) {
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
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 28 },
  );
}

/* ---------------------------------------------------------------- geometry */

/** Runs of columns that hold opaque border, with the gaps between them dropped. */
function coreRuns(px, w, h) {
  const runs = [];
  let start = -1;
  for (let x = 0; x <= w; x++) {
    let lit = false;
    for (let y = 0; y < h && !lit; y++) {
      if (px[(y * w + x) * 4 + 3] >= CORE) lit = true;
    }
    if (lit && start < 0) start = x;
    if (!lit && start >= 0) {
      if (x - start >= MIN_RUN) runs.push({ x0: start, x1: x - 1 });
      start = -1;
    }
  }
  return runs;
}

/**
 * The box a frame owns: its border, plus its glow, minus anybody else's.
 *
 * Grown outward one column at a time and stopped by whichever comes first — a
 * column with nothing in it, or the halfway line to the next frame's core. The
 * halfway line is what keeps two touching halos apart; on this sheet they touch
 * with fifteen pixels to spare either side, so nothing real is ever cut.
 */
function claim(px, w, h, run, prev, next) {
  const left = prev ? Math.floor((prev.x1 + run.x0) / 2) : 0;
  const right = next ? Math.ceil((run.x1 + next.x0) / 2) : w - 1;

  const columnEmpty = (x) => {
    for (let y = 0; y < h; y++)
      if (px[(y * w + x) * 4 + 3] > EMPTY) return false;
    return true;
  };
  const rowEmpty = (y, x0, x1) => {
    for (let x = x0; x <= x1; x++)
      if (px[(y * w + x) * 4 + 3] > EMPTY) return false;
    return true;
  };

  let x0 = run.x0;
  let x1 = run.x1;
  while (x0 > left && !columnEmpty(x0 - 1)) x0--;
  while (x1 < right && !columnEmpty(x1 + 1)) x1++;

  let y0 = 0;
  let y1 = h - 1;
  while (y0 < y1 && rowEmpty(y0, x0, x1)) y0++;
  while (y1 > y0 && rowEmpty(y1, x0, x1)) y1--;

  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The cut-out, copied into its own buffer. */
function crop(px, w, box) {
  const out = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const src = ((y + box.y0) * w + box.x0) * 4;
    px.copy(out, y * box.w * 4, src, src + box.w * 4);
  }
  return out;
}

/* ----------------------------------------------------------------- measure */

/** Box of the opaque border inside a cut-out — the frame without its halo. */
function coreBox(px, w, h) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] < CORE) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** How thick the border is, walked in from the middle of the core's left edge. */
function borderWidth(px, w, core) {
  const y = Math.round((core.y0 + core.y1) / 2);
  let n = 0;
  for (let x = core.x0; x <= core.x1; x++) {
    if (px[(y * w + x) * 4 + 3] < CORE) break;
    n++;
  }
  return n;
}

/**
 * Corner radius, off the silhouette: walk down the core's left edge until the
 * first lit pixel in a row stops moving. That is where the arc has finished
 * turning and the side has gone straight.
 */
function cornerRadius(px, w, core) {
  for (let y = core.y0; y <= core.y1; y++) {
    let x = core.x0;
    while (x <= core.x1 && px[(y * w + x) * 4 + 3] < CORE) x++;
    if (x === core.x0) return y - core.y0;
  }
  return 0;
}

/**
 * A name for the frame, taken off its own border rather than its position.
 *
 * Position would be the easy way and a trap: re-export the sheet with the
 * frames in another order and every file silently swaps contents with its
 * neighbour. The colour is the thing that identifies these — it is the only
 * difference between them.
 */
function colourName(px, w, h) {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < w * h; i++) {
    const a = px[i * 4 + 3];
    if (a < CORE) continue;
    r += px[i * 4];
    g += px[i * 4 + 1];
    b += px[i * 4 + 2];
    n++;
  }
  if (!n) return { name: "empty", hex: "000000" };
  r = Math.round(r / n);
  g = Math.round(g / n);
  b = Math.round(b / n);

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  let hue = 0;
  if (max !== min) {
    if (max === r) hue = (60 * (g - b)) / (max - min) + (g < b ? 360 : 0);
    else if (max === g) hue = (60 * (b - r)) / (max - min) + 120;
    else hue = (60 * (r - g)) / (max - min) + 240;
  }

  const hex = [r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("");
  if (sat < 0.15) return { name: max > 200 ? "white" : "grey", hex };
  const bands = [
    [15, "red"],
    [45, "orange"],
    [70, "yellow"],
    [165, "green"],
    [200, "cyan"],
    [250, "blue"],
    [290, "purple"],
    [345, "magenta"],
  ];
  const band = bands.find((entry) => hue < entry[0]);
  return { name: band ? band[1] : "red", hex };
}

/* --------------------------------------------------------------------- main */

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

const info = probe(SOURCE);
const sheet = decode(SOURCE);
console.log(`in   ${rel(SOURCE)}  ${info.w}x${info.h}`);

const runs = coreRuns(sheet, info.w, info.h);
console.log(
  `     ${runs.length} frames on the sheet, cut on their borders:` +
    ` ${runs.map((r) => `${r.x0}..${r.x1}`).join("  ")}\n`,
);

mkdirSync(OUT_DIR, { recursive: true });

const taken = new Map();
runs.forEach((run, i) => {
  const box = claim(sheet, info.w, info.h, run, runs[i - 1], runs[i + 1]);
  const art = crop(sheet, info.w, box);
  const colour = colourName(art, box.w, box.h);

  // Two frames of the same colour would otherwise overwrite each other.
  const seen = (taken.get(colour.name) || 0) + 1;
  taken.set(colour.name, seen);
  const slug = seen > 1 ? `${colour.name}-${seen}` : colour.name;
  const file = join(OUT_DIR, `frame-${slug}.png`);

  writePng(art, box.w, box.h, file);

  const core = coreBox(art, box.w, box.h);
  const border = borderWidth(art, box.w, core);
  const radius = cornerRadius(art, box.w, core);
  const glow = {
    l: core.x0,
    r: box.w - 1 - core.x1,
    t: core.y0,
    b: box.h - 1 - core.y1,
  };

  console.log(
    `out  ${rel(file).padEnd(30)} ${String(box.w).padStart(4)}x${box.h}` +
      `  #${colour.hex}  ${(statSync(file).size / 1024).toFixed(1).padStart(6)} kB`,
  );
  console.log(
    `     frame ${core.w}x${core.h} at ${core.x0},${core.y0}` +
      `   border ${border}px   radius ${radius}px` +
      `   nine-slice corner >= ${radius + border}`,
  );
  console.log(
    `     glow  left ${glow.l}  right ${glow.r}  top ${glow.t}  bottom ${glow.b}` +
      `${glow.l + glow.r + glow.t + glow.b === 0 ? "  (none)" : ""}`,
  );

  if (flags.has("--guides")) {
    const test = Buffer.from(art);
    const dot = (x, y, c) => {
      if (x < 0 || y < 0 || x >= box.w || y >= box.h) return;
      const o = (y * box.w + x) * 4;
      test[o] = c[0];
      test[o + 1] = c[1];
      test[o + 2] = c[2];
      test[o + 3] = 255;
    };
    for (let x = 0; x < box.w; x++) {
      dot(x, core.y0, [0, 255, 255]);
      dot(x, core.y1, [0, 255, 255]);
    }
    for (let y = 0; y < box.h; y++) {
      dot(core.x0, y, [0, 255, 255]);
      dot(core.x1, y, [0, 255, 255]);
    }
    const slice = radius + border;
    for (let k = 0; k < slice; k++) {
      dot(core.x0 + slice, core.y0 + k, [0, 255, 0]);
      dot(core.x0 + k, core.y0 + slice, [0, 255, 0]);
    }
    writePng(test, box.w, box.h, join(OUT_DIR, `frame-${slug}-guides.png`));
  }
});

function rel(p) {
  return p.slice(ROOT.length + 1).replace(/\\/g, "/");
}
