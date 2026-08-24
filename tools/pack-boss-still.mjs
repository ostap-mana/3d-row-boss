/**
 * Pack the boss out of `src/source/boss/still.png`.
 *
 *   node tools/pack-boss-still.mjs          # -> src/assets/boss/magmaroth.webp
 *   node tools/pack-boss-still.mjs --png    # keep the intermediate PNG too
 *
 * The source is one render of the beast, 1600x1600 and 1.5 MB of PNG, most of
 * which is empty: the figure sits in the middle with three hundred pixels of
 * nothing around it, and the file would arrive in the deliverable as 2 MB of
 * base64 — more than the bundle it is going into. So this trims it to the art,
 * downscales it to what the screen can actually show, and re-encodes as WebP.
 *
 * The other half of the job is measurement. `src/art/boss.js` hangs the figure
 * off its feet, sizes it off its reach, and pins three additive glows to the
 * places the render already burns. None of those numbers survive a crop and a
 * scale, so they are all resolved here, against the source, and printed in the
 * packed cell's own coordinates for that file to carry.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src/source/boss/still.png");
const OUT = join(ROOT, "src/assets/boss/magmaroth");

/** Repo-relative, forward slashes, for the log lines. */
const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");

/**
 * The three lights, in source pixels, read off the render.
 *
 * These are the one thing here that is picked rather than measured, and they
 * have to be: a hot-pixel search finds every rune on the beast's back and the
 * gem on its rider's staff, and averaging those puts the "eyes" somewhere over
 * its shoulder. What the game needs is the three places a fight reads from —
 * the eyes that flicker, the jaw that opens, and the mass every beam is aimed
 * at — and on a figure this specific those are looked at, not found.
 */
const LIGHTS = {
  /** The slit eyes in the beast's head, dead centre of the silhouette. */
  crown: { x: 781, y: 714 },
  /** The open jaw under them: where every glob and every breath leaves. */
  maw: { x: 790, y: 794 },
  /** The chest below the collar — the mass, and so the aim point. */
  core: { x: 795, y: 900 },
};

/** Alpha at or under this is backdrop, not art. */
const EMPTY = 8;

/** Alpha over this is the figure itself rather than the haze around it. */
const SOLID = 200;

/**
 * Share of the figure's width a row has to carry to count as the floor.
 *
 * Low enough to catch the soles, high enough to ignore what hangs past them —
 * on this render a tail tip trails thirty pixels below the feet, and an anchor
 * that took the lowest painted row would stand the beast in mid-air.
 */
const FLOOR_COVER = 0.08;

/** Widest the packed still is ever drawn, with headroom. */
const TARGET_W = 900;

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

/* ------------------------------------------------------------------ measure */

const info = probe(SOURCE);
const px = decode(SOURCE);
const alpha = (x, y) => px[(y * info.w + x) * 4 + 3];

console.log(`in   ${rel(SOURCE)}  ${info.w}x${info.h}`);

// Everything painted, haze included — this is what the cell has to hold. And
// the figure alone, which is what the anchor and the reach are measured
// against: the soft edge around the render is not something the beast stands on.
let x0 = info.w;
let y0 = info.h;
let x1 = -1;
let y1 = -1;
let fx0 = info.w;
let fy0 = info.h;
let fx1 = -1;
let fy1 = -1;
for (let y = 0; y < info.h; y++) {
  for (let x = 0; x < info.w; x++) {
    const a = alpha(x, y);
    if (a <= EMPTY) continue;
    if (x < x0) x0 = x;
    if (x > x1) x1 = x;
    if (y < y0) y0 = y;
    if (y > y1) y1 = y;
    if (a <= SOLID) continue;
    if (x < fx0) fx0 = x;
    if (x > fx1) fx1 = x;
    if (y < fy0) fy0 = y;
    if (y > fy1) fy1 = y;
  }
}
const crop = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };

// The stance. Walk up from the bottom of the figure until a row is carrying
// enough of it to be standing on the floor rather than trailing off it.
const need = Math.max(8, Math.round((fx1 - fx0 + 1) * FLOOR_COVER));
let floor = fy1;
let footL = fx0;
let footR = fx1;
for (let y = fy1; y >= fy0; y--) {
  let n = 0;
  let lo = info.w;
  let hi = -1;
  for (let x = fx0; x <= fx1; x++) {
    if (alpha(x, y) <= SOLID) continue;
    n++;
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  if (n < need) continue;
  floor = y;
  footL = lo;
  footR = hi;
  break;
}
const anchor = { x: Math.round((footL + footR) / 2), y: floor };

/* --------------------------------------------------------------------- pack */

const outW = Math.min(TARGET_W, crop.w);
const outH = Math.round((crop.h * outW) / crop.w);
const k = outW / crop.w;
/** Source point -> packed-cell point. */
const at = (p) => ({
  x: Math.round((p.x - crop.x) * k),
  y: Math.round((p.y - crop.y) * k),
});

function encode(file, args) {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-i",
      SOURCE,
      "-vf",
      `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${outW}:${outH}:flags=lanczos`,
      ...args,
      "-frames:v",
      "1",
      file,
    ],
    { maxBuffer: 1 << 29 },
  );
}

console.log(
  `     trim ${crop.w}x${crop.h} at ${crop.x},${crop.y}` +
    `  (${(100 - (crop.w * crop.h * 100) / (info.w * info.h)).toFixed(0)}% of the canvas was empty)`,
);
console.log(
  `     figure ${fx1 - fx0 + 1}x${fy1 - fy0 + 1}, standing ${footR - footL + 1} wide on row ${floor}`,
);
console.log(
  `\n     cell ${outW}x${outH} — the numbers src/art/boss.js carries:\n`,
);
console.log(`       cell:   { w: ${outW}, h: ${outH} },`);
console.log(`       anchor: ${JSON.stringify(at(anchor))},`);
console.log(`       rise:   ${Math.round((anchor.y - fy0) * k)},`);
console.log(`       span:   ${Math.round((fx1 - fx0 + 1) * k)},`);
console.log(`\n       crown: ${JSON.stringify(at(LIGHTS.crown))},`);
console.log(`       maw:   ${JSON.stringify(at(LIGHTS.maw))},`);
console.log(`       core:  ${JSON.stringify(at(LIGHTS.core))},\n`);

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
if (flags.has("--png")) {
  encode(`${OUT}.png`, []);
  console.log(`out  ${rel(OUT)}.png`);
}

// `-quality` is the colour; the alpha channel rides along at the same setting
// and is what a cutout lives or dies by, so this is the knob to turn if the
// silhouette ever picks up a fringe.
encode(`${OUT}.webp`, [
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
console.log(
  `out  ${rel(OUT)}.webp  ${(statSync(`${OUT}.webp`).size / 1024).toFixed(1)} kB`,
);
