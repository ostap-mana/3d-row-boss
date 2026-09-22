import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `
check-sheet-geometry — fail the build when a sprite sheet and the module that
slices it disagree.

  node tools/check-sheet-geometry.mjs

  Several modules cut their frames with absolute pixel coordinates. Resize the
  art without editing those numbers and nothing throws: the slices simply land
  somewhere else and the effect renders as confetti. This reads the constants
  back out of each module, works out the rectangle of the last frame, and
  checks it still fits inside the asset.
`;

if (process.argv.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const A = join(ROOT, "src/assets");

function source(rel) {
  return readFileSync(join(ROOT, "src", rel), "utf8");
}

function num(text, key, where) {
  const m = text.match(new RegExp(`\\b${key}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`));
  if (!m) throw new Error(`${where}: could not read ${key}`);
  return Number(m[1]);
}

function size(rel) {
  const file = join(A, rel);
  if (!existsSync(file)) throw new Error(`missing asset: ${rel}`);
  const [w, h] = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
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
  return { w, h };
}

const checks = [];

function grid(label, rel, g) {
  const { w, h } = size(rel);
  const rows = Math.ceil(g.count / g.cols);
  const right = g.pad + (g.cols - 1) * (g.cellW + g.pad) + g.cellW;
  const bottom =
    (g.block || 0) + g.pad + (rows - 1) * (g.cellH + g.pad) + g.cellH;
  checks.push({
    label,
    rel,
    ok: right <= w && bottom <= h,
    want: `${right}x${bottom}`,
    got: `${w}x${h}`,
  });
}

{
  const s = source("art/streams.js");
  const blocks = s.split(/\n\s{4}(?=cols:)/).slice(1);
  const files = ["fx/torrent-sheet.webp", "fx/fire-lance.webp"];
  blocks.slice(0, 2).forEach((block, i) => {
    grid(`streams.js #${i + 1}`, files[i], {
      cols: num(block, "cols", "streams.js"),
      cellW: num(block, "cellW", "streams.js"),
      cellH: num(block, "cellH", "streams.js"),
      pad: num(block, "pad", "streams.js"),
      count: num(block, "count", "streams.js"),
      block: num(block, "block", "streams.js"),
    });
  });
}

{
  const s = source("art/fire.js");
  const cell = s.match(/cell:\s*\{\s*w:\s*(\d+),\s*h:\s*(\d+)/);
  if (!cell) throw new Error("fire.js: could not read cell");
  grid("fire.js", "fx/fire-sheet.webp", {
    cols: num(s, "cols", "fire.js"),
    cellW: Number(cell[1]),
    cellH: Number(cell[2]),
    pad: 0,
    count: num(s, "count", "fire.js"),
    block: 0,
  });
}

for (const [mod, rel] of [
  ["art/gemcharge.js", "fx/gem-charge.webp"],
  ["art/gempop.js", "fx/gem-pop.webp"],
]) {
  const s = source(mod);
  const cell = num(s, "cell", mod);
  grid(mod.split("/").pop(), rel, {
    cols: num(s, "cols", mod),
    cellW: cell,
    cellH: cell,
    pad: 0,
    count: num(s, "count", mod),
    block: 0,
  });
}

{
  const s = source("art/readyfx.js");
  const m = s.match(
    /CROWN_CELL\s*=\s*\{\s*w:\s*(\d+),\s*h:\s*(\d+),\s*cols:\s*(\d+)/,
  );
  if (!m) throw new Error("readyfx.js: could not read CROWN_CELL");
  const want = Number(m[1]) * Number(m[3]);
  for (const f of readdirSync(join(A, "fx"))) {
    if (!/^ready-/.test(f)) continue;
    const { w, h } = size(`fx/${f}`);
    checks.push({
      label: "readyfx.js",
      rel: `fx/${f}`,
      ok: w === want && h % Number(m[2]) === 0,
      want: `${want} wide, height a multiple of ${m[2]}`,
      got: `${w}x${h}`,
    });
  }
}

{
  const s = source("art/ultborder.js");
  const shapes = [
    ...s.matchAll(
      /cols:\s*(\d+),\s*count:\s*(\d+),\s*cellW:\s*(\d+),\s*cellH:\s*(\d+)/g,
    ),
  ].map((m) => ({
    cols: Number(m[1]),
    count: Number(m[2]),
    cellW: Number(m[3]),
    cellH: Number(m[4]),
  }));
  if (shapes.length === 0) throw new Error("ultborder.js: no SHAPES found");
  for (const f of readdirSync(join(A, "cards"))) {
    if (!/^ult-/.test(f)) continue;
    const { w, h } = size(`cards/${f}`);
    const hit = shapes.find(
      (sh) => sh.cellW * sh.cols === w && sh.cellH * (sh.count / sh.cols) === h,
    );
    checks.push({
      label: "ultborder.js",
      rel: `cards/${f}`,
      ok: !!hit,
      want: shapes
        .map((sh) => `${sh.cellW * sh.cols}x${sh.cellH * (sh.count / sh.cols)}`)
        .join(" or "),
      got: `${w}x${h}`,
    });
  }
}

{
  const s = source("art/spells.js");
  const cols = num(s, "cols", "spells.js");
  for (const f of readdirSync(join(A, "fx"))) {
    if (!/-sheet\.webp$/.test(f)) continue;
    if (f === "fire-sheet.webp" || f === "torrent-sheet.webp") continue;
    const { w, h } = size(`fx/${f}`);
    const pitch = Math.round(w / cols);
    const rows = Math.ceil(num(s, "count", "spells.js") / cols);
    checks.push({
      label: "spells.js",
      rel: `fx/${f}`,
      ok: pitch * cols <= w && pitch * rows <= h,
      want: `${pitch * cols}x${pitch * rows} at pitch ${pitch}`,
      got: `${w}x${h}`,
    });
  }
}

const bad = checks.filter((c) => !c.ok);
for (const c of bad) {
  process.stderr.write(
    `${c.rel}: ${c.label} needs ${c.want}, asset is ${c.got}\n`,
  );
}
if (bad.length > 0) {
  process.stderr.write(
    `\n${bad.length} of ${checks.length} sheets no longer match the module that slices them.\n` +
      `Repack with tools/shrink-sheet.mjs and paste the geometry it prints into that module.\n`,
  );
  process.exit(1);
}
process.stdout.write(`sheet geometry: ${checks.length} assets match\n`);
