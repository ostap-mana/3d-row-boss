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
  neighbours would otherwise hand every frame a piece of the next one. The page
  itself is subtracted rather than keyed — \`max(0, pixel - page)\` — which is
  the same arithmetic the add blend does at draw time, and it leaves the soft
  outer glow that a key would chew off.

  Every cell is then drawn into the output at one shared scale, placed by where
  its ink sits inside its own cell, so the beat keeps the growth and the drift
  the painter gave it. The scale is set by the widest frame, which is what
  keeps the peak inside the plate instead of running off it.

  --src <png>     the painted page. Required.
  --out <webp>    where the sheet goes; the id in the file name is what
                  src/art/spells.js globs. Required.
  --cols <n>      columns on the page. Default: whatever the gutters say.
  --rows <n>      rows on the page. Default: the same.
  --frames <n>    how many cells the sheet holds. Default 10, which is what
                  every other spell sheet holds; src/art/spells.js counts the
                  rows off the file, so more of them is only a taller sheet and
                  a smoother beat. 15 is three rows.
  --take <list>   which cells make the sheet, 1-based and in reading order,
                  comma separated. Default: --frames of them spread evenly over
                  the page. This is the edit. Spreading skips cells, and every
                  skip is a jump the eye catches at 30 fps — a run of
                  consecutive cells is what looks smooth, and the edit is then
                  where the run starts and ends.
  --cell <px>     output cell. Default 320, plus 2px of pad each side, which is
                  the 324 pitch every other boss sheet ships.
  --floor <n>     how far above the page a pixel must sit to be ink, per
                  channel. Default 10.
  --gain <n>      multiplies the ink once the page is gone. Default 1.
  --margin <n>    fraction of the cell kept clear around the widest frame.
                  Default 0.04.
  --align <what>  what each cell is centred on: \`ink\`, the brightness-weighted
                  centre of its own drawing, \`cell\`, the middle of the box the
                  gutters cut, or \`ground\`, the point the drawing stands on —
                  the lowest ink in the cell, and across the band above it the
                  brightness-weighted x. Default ink. \`ground\` is for a beat
                  that comes out of the floor rather than detonating in the air:
                  what must not move between frames is the impact point, and it
                  is the one feature a rising column keeps. It is the only mode
                  that does not put the anchor in the middle of the output cell
                  — see \`--ground\`. A painted page usually carries
                  margin down one side and a wider gap between two of its
                  rows, and both land in the boxes rather than between them, so
                  \`cell\` hands that slop to the plate as a jump halfway
                  through the beat. \`cell\` is right only for a page drawn on a
                  real grid, where where the drawing sits in its cell is the
                  motion.
  --ground <f>    where the anchor sits in the output cell, top to bottom.
                  Default 0.5, or 0.92 with \`--align ground\`, which leaves the
                  rest of the cell above the impact point for the column to
                  climb into. Every pixel below it is empty and still costs
                  file, so keep it low.
  --smooth <n>    play the beat as <n> frames instead of as the cells taken,
                  with the ones in between made by motion compensation rather
                  than by blending. A painted page is as many frames as the
                  painter drew, and a beat slow enough to read is usually more
                  than that; cross-fading two paintings only dissolves one into
                  the other, which is what the plate already does at draw time,
                  so the frames have to be real. Pick a multiple of 5 — the
                  sheet is cut five to a row and an empty cell is a beat that
                  stops early.
  --alpha <n>     carry an alpha channel, cut from the ink itself: a pixel is
                  clear at the ink floor and solid <n> above it. Off by
                  default, which is right for a plate the game adds — black is
                  already nothing there. A plate the game draws normally needs
                  this, and needs it soft: fire has no edge, and a hard cut
                  around it reads as a sticker. 70 matches the painted still.
  --quality <n>   webp quality. Default 80.
  --contact       also write <out>-contact.png: every cell laid over the
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

const COUNT = Math.round(Number(flag("frames", 10)));
const cell = Math.round(Number(flag("cell", 320)));
const floor = Number(flag("floor", 10));
const gain = Number(flag("gain", 1));
const margin = Number(flag("margin", 0.04));
const quality = String(flag("quality", 80));
const alphaKnee = flag("alpha", null) ? Number(flag("alpha")) : 0;
const smooth = flag("smooth", null) ? Math.round(Number(flag("smooth"))) : 0;
const CH = alphaKnee ? 4 : 3;
const align = String(flag("align", "ink"));
if (align !== "ink" && align !== "cell" && align !== "ground") {
  process.stderr.write(`--align is ink, cell or ground, not ${align}
`);
  process.exit(1);
}
const groundAt = Number(flag("ground", align === "ground" ? 0.92 : 0.5));
const BAND = 0.18;
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
    let cx = (x0 + x1) / 2;
    let cy = (y0 + y1) / 2;
    if (align === "ink" && mass > 0) {
      cx = sx / mass;
      cy = sy / mass;
    }
    if (align === "ground" && lit) {
      const sill = Math.max(y0, bottom - Math.round((y1 - y0) * BAND));
      let bx = 0;
      let bmass = 0;
      for (let y = sill; y <= bottom; y++) {
        for (let x = x0; x < x1; x++) {
          const ink = over(y * W + x);
          if (ink <= floor) continue;
          bx += x * ink;
          bmass += ink;
        }
      }
      cx = bmass > 0 ? bx / bmass : (left + right) / 2;
      cy = bottom;
    }
    boxes.push({
      x0,
      x1,
      y0,
      y1,
      cx,
      cy,
      lit,
      up: lit ? cy - top : 0,
      down: lit ? bottom - cy : 0,
      side: lit ? Math.max(cx - left, right - cx) : 0,
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

const room = (span, far) => (far > 0 ? (span * (1 - margin)) / far : Infinity);
const anchorY = cell * groundAt;
const scale = Math.min(
  room(cell / 2, Math.max(...chosen.map((n) => boxes[n - 1].side))),
  room(anchorY, Math.max(...chosen.map((n) => boxes[n - 1].up))),
  room(cell - anchorY, Math.max(...chosen.map((n) => boxes[n - 1].down))),
);

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

const drawn = chosen.map((n) => {
  const box = boxes[n - 1];
  const buf = Buffer.alloc(cell * cell * 3);
  for (let y = 0; y < cell; y++) {
    const sy = box.cy + (y + 0.5 - anchorY) / scale;
    for (let x = 0; x < cell; x++) {
      const sx = box.cx + (x + 0.5 - cell / 2) / scale;
      const dst = (y * cell + x) * 3;
      buf[dst] = sample(sx, sy, 0, box);
      buf[dst + 1] = sample(sx, sy, 1, box);
      buf[dst + 2] = sample(sx, sy, 2, box);
    }
  }
  return buf;
});

const TAIL = 3;

const tween = (cells, want) => {
  const span = cell * cell * 3;
  const fed = cells.concat(Array(TAIL).fill(cells[cells.length - 1]));
  const out = execFileSync(
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
      `${cell}x${cell}`,
      "-r",
      String(cells.length - 1),
      "-i",
      "pipe:0",
      "-vf",
      `minterpolate=fps=${want - 1}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1`,
      "-frames:v",
      String(want + TAIL),
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { input: Buffer.concat(fed), maxBuffer: 1 << 30 },
  );
  const held = Math.floor(out.length / span);
  if (held < want) {
    process.stderr.write(
      `--smooth ${want} came back as ${held} frames; raise --smooth or drop a cell
`,
    );
    process.exit(1);
  }
  return Array.from({ length: want }, (_, i) =>
    out.subarray(i * span, (i + 1) * span),
  );
};

const played = smooth && smooth !== drawn.length ? tween(drawn, smooth) : drawn;

const pitch = cell + PAD * 2;
const sheetW = pitch * COLS;
const sheetH = pitch * Math.ceil(played.length / COLS);
const sheet = Buffer.alloc(sheetW * sheetH * CH);

played.forEach((buf, i) => {
  const ox = (i % COLS) * pitch + PAD;
  const oy = Math.floor(i / COLS) * pitch + PAD;
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      const src = (y * cell + x) * 3;
      const dst = ((oy + y) * sheetW + ox + x) * CH;
      const r = buf[src];
      const g = buf[src + 1];
      const b = buf[src + 2];
      sheet[dst] = r;
      sheet[dst + 1] = g;
      sheet[dst + 2] = b;
      if (alphaKnee) {
        const ink = (Math.max(r, g, b) - floor) / alphaKnee;
        sheet[dst + 3] = ink < 0 ? 0 : ink > 1 ? 255 : ink * 255;
      }
    }
  }
});

const write = (buf, file, extra, channels) => {
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
      (channels || CH) === 4 ? "rgba" : "rgb24",
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
  alphaKnee ? "yuva420p" : "yuv420p",
]);

let contactNote = "";
if (args.includes("--contact")) {
  const ground = [26, 18, 30];
  const test = Buffer.alloc(sheetW * sheetH * 3);
  for (let i = 0; i < sheetW * sheetH; i++) {
    const a = alphaKnee ? sheet[i * CH + 3] / 255 : 1;
    for (let c = 0; c < 3; c++) {
      const ink = sheet[i * CH + c];
      test[i * 3 + c] = alphaKnee
        ? Math.min(255, ground[c] * (1 - a) + ink * a)
        : Math.min(255, ground[c] + ink);
    }
  }
  const contact = join(
    dirname(out),
    `${basename(out).replace(/\.webp$/, "")}-contact.png`,
  );
  write(test, contact, [], 3);
  contactNote = `contact ${contact}\n`;
}

const dark = (i) => {
  const ox = (i % COLS) * pitch + PAD;
  const oy = Math.floor(i / COLS) * pitch + PAD;
  let sum = 0;
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      const at = ((oy + y) * sheetW + ox + x) * CH;
      sum += Math.max(sheet[at], sheet[at + 1], sheet[at + 2]);
    }
  }
  return sum / (cell * cell);
};

process.stdout.write(
  `${basename(input)}  ${W}x${H}  page ${bg.join(",")}  ` +
    `${cols}x${rows} cells  take ${chosen.join(",")}  played ${played.length}\n` +
    `${sheetW}x${sheetH}  cell ${cell}+${PAD}  ${align} ${groundAt}  ` +
    `scale ${scale.toFixed(3)}  ` +
    `${(statSync(out).size / 1024).toFixed(1)} kB\n${out}\n` +
    contactNote +
    `ink per cell:   ${Array.from({ length: played.length }, (_, i) => dark(i).toFixed(1).padStart(5)).join(" ")}\n` +
    `reach per cell: ${chosen.map((n) => boxes[n - 1].reach.toFixed(0).padStart(5)).join(" ")}\n`,
);
