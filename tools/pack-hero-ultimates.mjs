import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, existsSync, mkdirSync, statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_DIR = join(ROOT, "masters/sprites");
const OUT_DIR = join(ROOT, "src/assets/sprites");

const NAMES = ["fire", "water", "nature", "lightning", "arcane", "wind"];

const ALPHA_FLOOR = 8;

const PAD = 1;

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

const at = (w, x, y) => (y * w + x) * 4;

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

  let w = x1 - x0 + 1;
  let h = y1 - y0 + 1;
  if (w % 2 && x1 + 1 < cell.w) w++;
  else if (w % 2 && x0 > 0) (x0--, w++);
  if (h % 2 && y1 + 1 < cell.h) h++;
  else if (h % 2 && y0 > 0) (y0--, h++);

  return { x: x0, y: y0, w, h };
}

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

  const rows = layout.rows.filter((r) => r.type === "animation");
  if (!rows.length) {
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

console.log("packing hero ultimates");
const packed = NAMES.map(pack).filter(Boolean);

if (!packed.length) {
  console.log("\nnothing packed.");
  process.exit(1);
}

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
