/**
 * Pack the six heroes' ultimate-activation sprite animations.
 *
 *   node tools/pack-hero-ultimates.mjs           # -> src/assets/sprites/<element>-ultimate.webp
 *   node tools/pack-hero-ultimates.mjs --proof   # also one contact sheet of all six
 *
 * The sources are PixelLab spritesheets in `src/source/sprites`, a `.png` and a
 * `.json` per hero, straight out of the service's own export:
 *
 *   node tools/fetch-hero-ultimates.mjs
 *
 * See the Hero ultimate section of src/source/prompts.md for the character
 * prompts and the action descriptions the animations were generated from.
 *
 * PixelLab's export is a uniform grid — 96x96 cells, nine columns, one row of
 * eight rotations followed by one row per animated direction — and the JSON says
 * which row is which. Both facts matter here: the grid is what makes the sheet
 * addressable at all, and the row table is the only thing that says the fourth
 * row is `west` rather than the fourth compass point in some assumed order.
 * PixelLab emits the animation directions in the order they were requested, so
 * reading them off the JSON is what keeps a re-generated sheet from silently
 * transposing two directions.
 *
 * The rotation row is dropped. It is the character standing still in eight
 * directions, and this creative never shows a hero standing still in eight
 * directions — the cards face the player, the ultimate plays, the card goes back
 * to its portrait. Keeping it would be a third of the file for a state nothing
 * enters.
 *
 * What this actually does to the pixels is one crop, measured once across every
 * frame of every direction and then applied identically to all of them. A 96px
 * cell around a 68px character is mostly empty, and cropping is most of the
 * saving here — but crop each cell to its own content and the character walks
 * around inside the frame as it plays, because the discharge on the last frame
 * is wider than the wind-up on the first and a per-cell crop re-centres on it.
 * One box for the whole hero keeps the pivot where PixelLab put it: the cell
 * centre. That is also why the box is *not* shared across heroes — the six do
 * not have to line up with each other, only with themselves — and why it is
 * padded out to an even width and height, so the centre stays on a whole pixel.
 *
 * WebP lossless, not the quality 88 the painted assets use. These are hard-edged
 * sprites with maybe thirty colours: lossy webp puts ringing around every one of
 * those edges, at 48 pixels tall it is visible, and lossless costs nothing on
 * art this flat — the six sheets come in at a few kB each, against ~110 kB for
 * one painted portrait. Pixel art is the case the painted-asset rule was never
 * about.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(ROOT, "src/source/sprites");
const OUT_DIR = join(ROOT, "src/assets/sprites");

/** The roster's own order, which is the order HEROES is in in config.js. */
const NAMES = ["fire", "water", "nature", "lightning", "arcane", "wind"];

/**
 * A pixel this transparent is backdrop when the crop box is measured.
 *
 * 8 of 255. PixelLab's cells are cut cleanly — the empty margin is a hard zero,
 * not a fade — so this only has to survive a stray dithered edge pixel, and
 * anything higher starts eating the soft outer ring of the fire discharge.
 */
const ALPHA_FLOOR = 8;

/** Pixels left around the measured content on every side. */
const PAD = 1;

/* ------------------------------------------------------------------- ffmpeg */

function decode(file) {
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
    { maxBuffer: 1 << 29 },
  );
}

function encode(buf, w, h, file) {
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
      "-c:v",
      "libwebp",
      "-lossless",
      "1",
      "-pix_fmt",
      "bgra",
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 29 },
  );
}

/* -------------------------------------------------------------------- pixels */

const at = (w, x, y) => (y * w + x) * 4;

/**
 * The tightest box holding every non-transparent pixel of every listed cell,
 * expressed relative to a cell's own origin.
 */
function contentBox(px, sheetW, cells, cell) {
  let x0 = cell.w;
  let y0 = cell.h;
  let x1 = -1;
  let y1 = -1;

  for (const { col, row } of cells) {
    const ox = col * cell.w;
    const oy = row * cell.h;
    for (let y = 0; y < cell.h; y++) {
      for (let x = 0; x < cell.w; x++) {
        if (px[at(sheetW, ox + x, oy + y) + 3] < ALPHA_FLOOR) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }

  if (x1 < 0) throw new Error("every cell is empty");

  x0 = Math.max(0, x0 - PAD);
  y0 = Math.max(0, y0 - PAD);
  x1 = Math.min(cell.w - 1, x1 + PAD);
  y1 = Math.min(cell.h - 1, y1 + PAD);

  // Even dimensions keep the pivot — the cell centre — on a whole pixel.
  let w = x1 - x0 + 1;
  let h = y1 - y0 + 1;
  if (w % 2 && x1 + 1 < cell.w) w++;
  else if (w % 2 && x0 > 0) (x0--, w++);
  if (h % 2 && y1 + 1 < cell.h) h++;
  else if (h % 2 && y0 > 0) (y0--, h++);

  return { x: x0, y: y0, w, h };
}

/** Blit one cell of the source grid into the packed sheet. */
function blit(src, srcW, dst, dstW, from, to, box) {
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const s = at(srcW, from.x + box.x + x, from.y + box.y + y);
      const d = at(dstW, to.x + x, to.y + y);
      dst[d] = src[s];
      dst[d + 1] = src[s + 1];
      dst[d + 2] = src[s + 2];
      dst[d + 3] = src[s + 3];
    }
  }
}

/* ---------------------------------------------------------------------- pack */

function pack(name) {
  const png = join(SOURCE_DIR, `${name}-ultimate.png`);
  const meta = join(SOURCE_DIR, `${name}-ultimate.json`);
  if (!existsSync(png) || !existsSync(meta)) {
    console.log(`  ${name.padEnd(9)} no source — run fetch-hero-ultimates.mjs`);
    return null;
  }

  const layout = JSON.parse(readFileSync(meta, "utf8")).spritesheet;
  const cell = { w: layout.cell_size.width, h: layout.cell_size.height };
  const sheetW = layout.sheet_size.width;
  const sheetH = layout.sheet_size.height;

  // The row table is the authority on which row is which direction.
  const rows = layout.rows.filter((r) => r.type === "animation");
  if (!rows.length) {
    // A character exported before its animation finished: rotations only.
    console.log(`  ${name.padEnd(9)} no ultimate in the sheet yet — re-fetch`);
    return null;
  }
  const frames = rows[0].frame_count;
  if (rows.some((r) => r.frame_count !== frames)) {
    throw new Error(`${name}: directions disagree on frame count`);
  }

  const px = decode(png);
  if (px.length !== sheetW * sheetH * 4) {
    throw new Error(`${name}: sheet is not ${sheetW}x${sheetH}`);
  }

  const cells = [];
  for (const r of rows) {
    for (let c = 0; c < frames; c++) cells.push({ col: c, row: r.row });
  }
  const box = contentBox(px, sheetW, cells, cell);

  const outW = box.w * frames;
  const outH = box.h * rows.length;
  const out = Buffer.alloc(outW * outH * 4);
  rows.forEach((r, i) => {
    for (let c = 0; c < frames; c++) {
      blit(
        px,
        sheetW,
        out,
        outW,
        { x: c * cell.w, y: r.row * cell.h },
        { x: c * box.w, y: i * box.h },
        box,
      );
    }
  });

  mkdirSync(OUT_DIR, { recursive: true });
  const file = join(OUT_DIR, `${name}-ultimate.webp`);
  encode(out, outW, outH, file);

  const kb = (statSync(file).size / 1024).toFixed(1);
  const dirs = rows.map((r) => r.direction).join(",");
  console.log(
    `  ${name.padEnd(9)} ${box.w}x${box.h} x ${frames}f x ${rows.length}dir` +
      ` -> ${outW}x${outH}  ${kb} kB  [${dirs}]`,
  );

  return { name, frame: box, frames, directions: rows.map((r) => r.direction) };
}

/* ---------------------------------------------------------------------- main */

console.log("packing hero ultimates");
const packed = NAMES.map(pack).filter(Boolean);

if (!packed.length) {
  console.log("\nnothing packed.");
  process.exit(1);
}

// What art/ultimates.js needs to address a sheet: the cell, and the row order.
console.log("\nfor src/art/ultimates.js:\n");
console.log("const ULTIMATE_SHEETS = {");
for (const p of packed) {
  console.log(
    `  ${p.name}: { w: ${p.frame.w}, h: ${p.frame.h}, frames: ${p.frames},` +
      ` dirs: [${p.directions.map((d) => `"${d}"`).join(", ")}] },`,
  );
}
console.log("};");

if (process.argv.includes("--proof")) {
  const files = packed.map((p) => join(OUT_DIR, `${p.name}-ultimate.webp`));
  const proof = join(SOURCE_DIR, "ultimates-proof.png");

  // vstack refuses inputs of differing width, and the six heroes crop to six
  // different widths, so every sheet is padded out to the widest one first.
  const wide = Math.max(...packed.map((p) => p.frame.w * p.frames));
  const pads = packed
    .map((_, i) => `[${i}:v]pad=${wide}:ih:0:0:0x00000000[p${i}]`)
    .join(";");
  const stack = packed.map((_, i) => `[p${i}]`).join("");

  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    ...files.flatMap((f) => ["-i", f]),
    "-filter_complex",
    `${pads};${stack}vstack=inputs=${files.length}`,
    "-frames:v",
    "1",
    proof,
  ]);
  console.log(`\nproof -> ${proof}`);
}
