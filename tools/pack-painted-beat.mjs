import { execFileSync } from "node:child_process";
import { resolve, dirname, basename, join } from "node:path";
import { existsSync, mkdirSync, statSync } from "node:fs";

const USAGE = `
pack-painted-beat — a hand-painted flipbook page into the boss's spell grid.

  node tools/pack-painted-beat.mjs --src <png> --out <webp> [options]

  A painted page is not a machine grid. The cells were laid out by hand, so the
  pitch is not the width over the columns; the ink is not centred in its cell;
  and the page is grey, because nobody paints fire on black and can see what
  they are doing. All three have to be measured rather than assumed.

  The grid comes from the gaps. Ink is anything far enough from the page
  colour; project it onto each axis and the empty bands between the runs are
  the gutters, so the cuts go down their middles, and nothing outside a cell's
  own box is ever sampled into it — a page whose drawings lean into their
  neighbours would otherwise hand every frame a piece of the next one. The page itself is subtracted rather than keyed —
  \`max(0, pixel - page)\` — which is the same arithmetic the add blend does at
  draw time and leaves the soft outer glow that a key would chew off.

  Every cell is then drawn into the output at one shared scale, placed by where
  its ink sits inside its own cell, so the beat keeps the growth and the drift
  the painter gave it. The scale is set by the widest frame, which is what
  keeps the peak inside the plate instead of running off it.

  --src <png>     the painted page. Required.
  --out <webp>    where the sheet goes; the id in the file name is what
                  src/art/spells.js globs. Required.
  --cols <n>      columns on the page. Default: whatever the gutters say.
  --rows <n>      rows on the page. Default: the same.
  --take <list>   which cells make the ten, 1-based and in reading order,
                  comma separated. Default: ten spread evenly over the page.
                  This is the edit: a painted page usually opens with two or
                  three cells of the shape gathering, and the plate has 0.46 s
                  to land a hit.
  --cell <px>     output cell. Default 320, plus 2px of pad each side, which is
                  the 324 pitch every other boss sheet ships.
  --floor <n>     how far above the page a pixel must sit to be ink, per
                  channel. Default 10.
  --gain <n>      multiplies the ink once the page is gone. Default 1.
  --margin <n>    fraction of the cell kept clear around the widest frame.
                  Default 0.04.
  --align <what>  what each cell is centred on: \`ink\`, the brightness-weighted
                  centre of its own drawing, or \`cell\`, the middle of the box
                  the gutters cut. Default ink. A painted page usually carries
                  a margin down one side and a wider gap between two of its
                  rows, and both land in the boxes rather than between them, so
                  \`cell\` hands that slop to the plate as a jump halfway
                  through the beat. \`cell\` is right only for a page drawn on a
                  real grid, where where the drawing sits in its cell is the
                  motion.
  --quality <n>   webp quality. Default 80.
  --contact       also write <out>-contact.png: the ten cells laid over the
                  card's own ground, which is the only honest way to read an
                  additive sheet — on white every one of them looks fine.

  node tools/pack-painted-beat.mjs --src masters/fx/painted/rake-page.png \\
    --out src/assets/fx/rake-sheet.webp --take 3,5,6,7,9,10,11,13,14,15 --contact
`;

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(args.length === 0 ? 1 : 0);
}

const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const COLS = 5;
const COUNT = 10;
const PAD = 2;

const src = flag("src", null);
const outArg = flag("out", null);
if (!src || !outArg) {
  process.stderr.write("--src and --out are both required\n");
  process.exit(1);
}
const input = resolve(src);
if (!existsSync(input)) {
  process.stderr.write(`no such file: ${input}\n`);
  process.exit(1);
}
const out = resolve(outArg);

const cell = Math.round(Number(flag("cell", 320)));
const floor = Number(flag("floor", 10));
const gain = Number(flag("gain", 1));
const margin = Number(flag("margin", 0.04));
const quality = String(flag("quality", 80));
const align = String(flag("align", "ink"));
if (align !== "ink" && align !== "cell") {
  process.stderr.write(`--align is ink or cell, not ${align}
`);
  process.exit(1);
}
const wantCols = flag("cols", null) ? Number(flag("cols")) : null;
const wantRows = flag("rows", null) ? Number(flag("rows")) : null;
const take = flag("take", null)
  ? String(flag("take"))
      .split(",")
      .map((n) => Number(n.trim()))
  : null;

const probe = execFileSync(
  "ffprobe",
  [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    input,
  ],
  { encoding: "utf8" },
).trim();
const [W, H] = probe.split(",").map(Number);

const page = execFileSync(
  "ffmpeg",
  ["-v", "error", "-i", input, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
  { maxBuffer: 1 << 29 },
);

const seen = new Map();
for (let i = 0; i < W * H; i++) {
  const key = (page[i * 3] << 16) | (page[i * 3 + 1] << 8) | page[i * 3 + 2];
  seen.set(key, (seen.get(key) || 0) + 1);
}
let bgKey = 0;
let bgHits = 0;
for (const [key, hits] of seen) {
  if (hits > bgHits) {
    bgHits = hits;
    bgKey = key;
  }
}
const bg = [(bgKey >> 16) & 255, (bgKey >> 8) & 255, bgKey & 255];

const over = (i) => {
  const r = page[i * 3] - bg[0];
  const g = page[i * 3 + 1] - bg[1];
  const b = page[i * 3 + 2] - bg[2];
  return Math.max(r, g, b);
};

const runsOn = (length, other, at) => {
  const lit = new Uint8Array(length);
  for (let a = 0; a < length; a++) {
    for (let b = 0; b < other; b++) {
      if (over(at(a, b)) > floor) {
        lit[a] = 1;
        break;
      }
    }
  }
  const runs = [];
  let start = -1;
  for (let a = 0; a < length; a++) {
    if (lit[a] && start < 0) start = a;
    if (!lit[a] && start >= 0) {
      runs.push([start, a - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, length - 1]);
  return runs;
};

const bounds = (runs, span) => {
  const cuts = [0];
  for (let i = 1; i < runs.length; i++) {
    cuts.push(Math.round((runs[i - 1][1] + runs[i][0]) / 2));
  }
  cuts.push(span);
  return cuts;
};

const colRuns = runsOn(W, H, (x, y) => y * W + x);
const rowRuns = runsOn(H, W, (y, x) => y * W + x);
if (wantCols && colRuns.length !== wantCols) {
  process.stderr.write(
    `asked for ${wantCols} columns, the gutters give ${colRuns.length}\n`,
  );
  process.exit(1);
}
if (wantRows && rowRuns.length !== wantRows) {
  process.stderr.write(
    `asked for ${wantRows} rows, the gutters give ${rowRuns.length}\n`,
  );
  process.exit(1);
}
const cols = colRuns.length;
const rows = rowRuns.length;
const cells = cols * rows;
if (cells < COUNT) {
  process.stderr.write(`the page holds ${cells} cells, the sheet needs 10\n`);
  process.exit(1);
}

const colCut = bounds(colRuns, W);
const rowCut = bounds(rowRuns, H);

const boxes = [];
for (let r = 0; r < rows; r++) {
  for (let c = 0; c < cols; c++) {
    const x0 = colCut[c];
    const x1 = colCut[c + 1];
    const y0 = rowCut[r];
    const y1 = rowCut[r + 1];
    let left = x1;
    let right = x0;
    let top = y1;
    let bottom = y0;
    let sx = 0;
    let sy = 0;
    let mass = 0;
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const ink = over(y * W + x);
        if (ink <= floor) continue;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
        sx += x * ink;
        sy += y * ink;
        mass += ink;
      }
    }
    const lit = right >= left;
    const cx = align === "ink" && mass > 0 ? sx / mass : (x0 + x1) / 2;
    const cy = align === "ink" && mass > 0 ? sy / mass : (y0 + y1) / 2;
    boxes.push({
      x0,
      x1,
      y0,
      y1,
      cx,
      cy,
      lit,
      reach: lit ? Math.max(cx - left, right - cx, cy - top, bottom - cy) : 0,
      wide: lit ? right - left + 1 : 0,
    });
  }
}

const chosen =
  take ||
  Array.from({ length: COUNT }, (_, i) =>
    Math.round(1 + (i * (cells - 1)) / (COUNT - 1)),
  );
if (chosen.length !== COUNT) {
  process.stderr.write(`--take needs ${COUNT} cells, got ${chosen.length}\n`);
  process.exit(1);
}
for (const n of chosen) {
  if (!Number.isInteger(n) || n < 1 || n > cells) {
    process.stderr.write(
      `--take ${n} is not a cell on a ${cols}x${rows} page\n`,
    );
    process.exit(1);
  }
}

const reach = Math.max(...chosen.map((n) => boxes[n - 1].reach));
const scale = ((cell / 2) * (1 - margin)) / reach;

const pitch = cell + PAD * 2;
const sheetW = pitch * COLS;
const sheetH = pitch * Math.ceil(COUNT / COLS);
const sheet = Buffer.alloc(sheetW * sheetH * 3);

const sample = (fx, fy, ch, box) => {
  if (fx < box.x0 || fx > box.x1 - 1 || fy < box.y0 || fy > box.y1 - 1)
    return 0;
  const x = Math.min(W - 1, Math.max(0, fx));
  const y = Math.min(H - 1, Math.max(0, fy));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(W - 1, x0 + 1);
  const y1 = Math.min(H - 1, y0 + 1);
  const ax = x - x0;
  const ay = y - y0;
  const at = (px, py) => page[(py * W + px) * 3 + ch] - bg[ch];
  const top = at(x0, y0) * (1 - ax) + at(x1, y0) * ax;
  const low = at(x0, y1) * (1 - ax) + at(x1, y1) * ax;
  const v = (top * (1 - ay) + low * ay) * gain;
  return v < 0 ? 0 : v > 255 ? 255 : v;
};

chosen.forEach((n, i) => {
  const box = boxes[n - 1];
  const ox = (i % COLS) * pitch + PAD;
  const oy = Math.floor(i / COLS) * pitch + PAD;
  for (let y = 0; y < cell; y++) {
    const sy = box.cy + (y + 0.5 - cell / 2) / scale;
    for (let x = 0; x < cell; x++) {
      const sx = box.cx + (x + 0.5 - cell / 2) / scale;
      const dst = ((oy + y) * sheetW + ox + x) * 3;
      sheet[dst] = sample(sx, sy, 0, box);
      sheet[dst + 1] = sample(sx, sy, 1, box);
      sheet[dst + 2] = sample(sx, sy, 2, box);
    }
  }
});

const write = (buf, file, extra) => {
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
      "rgb24",
      "-s",
      `${sheetW}x${sheetH}`,
      "-i",
      "pipe:0",
      ...(extra || []),
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 29 },
  );
};

write(sheet, out, [
  "-c:v",
  "libwebp",
  "-lossless",
  "0",
  "-quality",
  quality,
  "-compression_level",
  "6",
  "-preset",
  "picture",
  "-pix_fmt",
  "yuv420p",
]);

let contactNote = "";
if (args.includes("--contact")) {
  const ground = [26, 18, 30];
  const test = Buffer.alloc(sheetW * sheetH * 3);
  for (let i = 0; i < sheetW * sheetH; i++) {
    for (let c = 0; c < 3; c++) {
      test[i * 3 + c] = Math.min(255, ground[c] + sheet[i * 3 + c]);
    }
  }
  const contact = join(
    dirname(out),
    `${basename(out).replace(/\.webp$/, "")}-contact.png`,
  );
  write(test, contact, []);
  contactNote = `contact ${contact}\n`;
}

const dark = (i) => {
  const ox = (i % COLS) * pitch + PAD;
  const oy = Math.floor(i / COLS) * pitch + PAD;
  let sum = 0;
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      const at = ((oy + y) * sheetW + ox + x) * 3;
      sum += Math.max(sheet[at], sheet[at + 1], sheet[at + 2]);
    }
  }
  return sum / (cell * cell);
};

process.stdout.write(
  `${basename(input)}  ${W}x${H}  page ${bg.join(",")}  ` +
    `${cols}x${rows} cells  take ${chosen.join(",")}\n` +
    `${sheetW}x${sheetH}  cell ${cell}+${PAD}  scale ${scale.toFixed(3)}  ` +
    `${(statSync(out).size / 1024).toFixed(1)} kB\n${out}\n` +
    contactNote +
    `ink per cell:   ${Array.from({ length: COUNT }, (_, i) => dark(i).toFixed(1).padStart(5)).join(" ")}\n` +
    `reach per cell: ${chosen.map((n) => boxes[n - 1].reach.toFixed(0).padStart(5)).join(" ")}\n`,
);
