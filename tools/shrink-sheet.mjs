import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const args = process.argv.slice(2);

function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
}

const file = args[0];
if (!file || args.includes("--help")) {
  console.log(
    `usage: node tools/shrink-sheet.mjs <asset> --cols N --cell WxH --pad P --count N [--grids N] [--block N] --scale K [--quality Q] [--out path]`,
  );
  process.exit(file ? 0 : 1);
}

const src = resolve(ROOT, file);
const out = resolve(ROOT, flag("out", file));
const cols = Number(flag("cols"));
const [cellW, cellH] = String(flag("cell")).split("x").map(Number);
const pad = Number(flag("pad", 2));
const count = Number(flag("count"));
const grids = Number(flag("grids", 1));
const scale = Number(flag("scale"));
const quality = Number(flag("quality", 82));

const rows = Math.ceil(count / cols);
const block = Number(flag("block", pad + rows * (cellH + pad)));

const odd = (n) => (n % 2 === 0 ? n + 1 : n);
const newW = odd(Math.max(3, Math.round(cellW * scale)));
const newH = odd(Math.max(3, Math.round(cellH * scale)));
const newPad = 1;
const sheetW = cols * (newW + newPad);
const gridH = rows * (newH + newPad);

const probe = execFileSync("ffprobe", [
  "-v",
  "error",
  "-select_streams",
  "v:0",
  "-show_entries",
  "stream=width,height,pix_fmt",
  "-of",
  "csv=p=0",
  src,
])
  .toString()
  .trim()
  .split(",");
const hasAlpha = probe[2].includes("a");

const filters = [];
const tiles = [];
let n = 0;

for (let g = 0; g < grids; g++) {
  const cells = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const label = `t${n++}`;
      if (i < count) {
        const x = pad + c * (cellW + pad);
        const y = g * block + pad + r * (cellH + pad);
        filters.push(
          `[src${g}_${i}]crop=${cellW}:${cellH}:${x}:${y},scale=${newW}:${newH}:flags=lanczos,pad=${newW + newPad}:${newH + newPad}:${newPad}:${newPad}:color=#00000000[${label}]`,
        );
      } else {
        filters.push(
          `color=c=#00000000:s=${newW + newPad}x${newH + newPad}:d=1,format=rgba[${label}]`,
        );
      }
      cells.push(`[${label}]`);
    }
  }
  const layout = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      layout.push(`${c * (newW + newPad)}_${r * (newH + newPad)}`);
    }
  }
  filters.push(
    `${cells.join("")}xstack=inputs=${cells.length}:layout=${layout.join("|")}:fill=#00000000[g${g}]`,
  );
  tiles.push(`[g${g}]`);
}

const splits = [];
for (let g = 0; g < grids; g++) {
  const labels = [];
  for (let i = 0; i < count; i++) labels.push(`[src${g}_${i}]`);
  splits.push(labels);
}
const allLabels = splits.flat();
const head = `[0:v]format=${hasAlpha ? "rgba" : "rgb24"},split=${allLabels.length}${allLabels.join("")}`;

const stacked =
  grids > 1
    ? `${tiles.join("")}vstack=inputs=${grids},pad=${sheetW}:${gridH * grids}:0:0:color=#00000000[outv]`
    : `${tiles[0]}pad=${sheetW}:${gridH}:0:0:color=#00000000[outv]`;

const graph = [head, ...filters, stacked].join(";");

execFileSync(
  "ffmpeg",
  [
    "-v",
    "error",
    "-y",
    "-i",
    src,
    "-filter_complex",
    graph,
    "-map",
    "[outv]",
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    String(quality),
    "-preset",
    "picture",
    "-compression_level",
    "6",
    "-pix_fmt",
    hasAlpha ? "yuva420p" : "yuv420p",
    out,
  ],
  { stdio: ["ignore", "inherit", "inherit"] },
);

const before = Number(flag("was", 0));
const after = statSync(out).size;
console.log(
  `${file}  ${probe[0]}x${probe[1]} -> ${sheetW}x${gridH * grids}  ${(after / 1024).toFixed(0)} kB${before ? ` (was ${(before / 1024).toFixed(0)} kB)` : ""}`,
);
console.log(
  `  geometry: cols ${cols}, cellW ${newW}, cellH ${newH}, pad ${newPad}, count ${count}${grids > 1 ? `, block ${gridH}` : ""}`,
);
