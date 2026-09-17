import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = [
  join(ROOT, "src/animation/image.png"),
  join(ROOT, "src/art/image.png"),
].find((p) => existsSync(p));
const OUT_DIR = join(ROOT, "src/assets/cards");
const PROOF_DIR = join(ROOT, "src/animation");
const TMP = join(ROOT, "src/animation/.tmp-burst");

const ELEMENT = "water";

const BANDS = [
  { y0: 56, y1: 456, cols: 7 },
  { y0: 480, y1: 968, cols: 6 },
];

const W = 384;
const H = 688;
const CARD = { x: 40, y: 40, w: 304, h: 608 };

const COLS = 6;
const COUNT = 12;
const CELL_W = 176;
const CELL_H = Math.round((CELL_W * H) / W);
const QUALITY = 80;

const CUT = { bite: 4, radius: 26, feather: 2.5 };

const SOLID = 200;
const GLASS = 60;

const RUN = 0.6;

const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
const kb = (n) => `${(n / 1024).toFixed(1)}kB`;

const run = (args, opts) =>
  execFileSync("ffmpeg", ["-y", "-v", "error", ...args], opts);

function sizeOf(file) {
  const [w, h] = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0:s=x",
    file,
  ])
    .toString()
    .trim()
    .split("x")
    .map(Number);
  return { w, h };
}

const decodeRgba = (file, filter) =>
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      ...(filter ? ["-vf", filter] : []),
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-",
    ],
    { maxBuffer: 1 << 28 },
  );

function measure(px, sw, cell) {
  const at = (x, y) => px[(y * sw + x) * 4 + 3];
  const scan = (from, to, step, test) => {
    for (let i = from; i !== to; i += step) if (test(i)) return i;
    return null;
  };

  const ys = cell.y0 + Math.round((cell.y1 - cell.y0) * 0.35);
  const ye = cell.y0 + Math.round((cell.y1 - cell.y0) * 0.65);
  const needCol = (ye - ys) * RUN;
  const col = (x) => {
    let n = 0;
    for (let y = ys; y < ye; y++) if (at(x, y) >= SOLID) n++;
    return n;
  };
  const left = scan(cell.x0, cell.x1, 1, (x) => col(x) >= needCol);
  const right = scan(cell.x1 - 1, cell.x0, -1, (x) => col(x) >= needCol);
  if (left === null || right === null || right - left < 40) return null;

  const xs = left + Math.round((right - left) * 0.3);
  const xe = left + Math.round((right - left) * 0.7);
  const needRow = (xe - xs) * RUN;
  const row = (y) => {
    let n = 0;
    for (let x = xs; x < xe; x++) if (at(x, y) >= SOLID) n++;
    return n;
  };
  const top = scan(cell.y0, cell.y1, 1, (y) => row(y) >= needRow);
  const bottom = scan(cell.y1 - 1, cell.y0, -1, (y) => row(y) >= needRow);
  if (top === null || bottom === null || bottom - top < 80) return null;

  const mid = (top + bottom) >> 1;
  let line = 0;
  for (let x = left; x < right; x++) {
    if (at(x, mid) < GLASS) break;
    line++;
  }

  return {
    x: left,
    y: top,
    w: right - left + 1,
    h: bottom - top + 1,
    line: Math.max(2, line),
  };
}

function register(box) {
  const padX = (CARD.x / CARD.w) * box.w;
  const padY = (CARD.y / CARD.h) * box.h;
  return {
    cx: box.x - padX,
    cy: box.y - padY,
    cw: box.w + padX * 2,
    ch: box.h + padY * 2,
  };
}

function interiorMask(inset) {
  const hw = (CARD.w - inset * 2) / 2;
  const hh = (CARD.h - inset * 2) / 2;
  const r = Math.min(CUT.radius, Math.min(hw, hh) - 1);
  const cx = CARD.x + CARD.w / 2;
  const cy = CARD.y + CARD.h / 2;

  const keep = new Float32Array(W * H).fill(1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const qx = Math.abs(x + 0.5 - cx) - (hw - r);
      const qy = Math.abs(y + 0.5 - cy) - (hh - r);
      const d =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
        Math.min(Math.max(qx, qy), 0) -
        r;
      keep[y * W + x] = Math.min(1, Math.max(0, d / CUT.feather + 0.5));
    }
  }
  return keep;
}

if (!SRC) {
  console.log("no source: src/animation/image.png (or src/art/image.png)");
  process.exit(0);
}

const wantProof = process.argv.includes("--proof");
const wantFrames = process.argv.includes("--frames");
const wantPng = process.argv.includes("--png");

const { w: sw, h: sh } = sizeOf(SRC);
const px = decodeRgba(SRC);
console.log(`${rel(SRC)}  ${sw}x${sh}`);

mkdirSync(TMP, { recursive: true });

const boxes = [];
for (const band of BANDS) {
  const cw = sw / band.cols;
  for (let i = 0; i < band.cols; i++) {
    const cell = {
      x0: Math.round(i * cw),
      x1: Math.round((i + 1) * cw),
      y0: band.y0,
      y1: Math.min(sh, band.y1),
    };
    const box = measure(px, sw, cell);
    if (!box) {
      console.log(`  cell ${boxes.length + 1}: nothing solid in it, skipped`);
      continue;
    }
    boxes.push(box);
    console.log(
      `  frame ${String(boxes.length).padStart(2)}: ` +
        `${box.w}x${box.h} at ${box.x},${box.y}  ` +
        `aspect ${(box.w / box.h).toFixed(3)}  line ${box.line}`,
    );
  }
}

if (boxes.length < COUNT) {
  console.log(`only ${boxes.length} frames found, need ${COUNT}`);
  process.exit(1);
}

const picks = Array.from({ length: COUNT }, (_, i) =>
  Math.round((i * (boxes.length - 1)) / (COUNT - 1)),
);

const inset =
  Math.min(...picks.map((p) => (boxes[p].line * CARD.w) / boxes[p].w)) +
  CUT.bite;
const keep = interiorMask(inset);
console.log(`interior cut ${inset.toFixed(1)}px in, radius ${CUT.radius}`);

const caged = join(TMP, "caged.png");
{
  const walled = Buffer.from(px);
  const bounds = [];
  for (const band of BANDS) {
    const cw = sw / band.cols;
    for (let i = 0; i < band.cols; i++)
      bounds.push({
        x0: Math.round(i * cw),
        x1: Math.round((i + 1) * cw),
        y0: band.y0,
        y1: Math.min(sh, band.y1),
      });
  }
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const inside = bounds.some(
        (b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1,
      );
      if (!inside) walled[(y * sw + x) * 4 + 3] = 0;
    }
  }
  writeFileSync(join(TMP, "caged.raw"), walled);
  run([
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    `${sw}x${sh}`,
    "-i",
    join(TMP, "caged.raw"),
    caged,
  ]);
}

const frames = [];
picks.forEach((p, n) => {
  const box = boxes[p];
  const { cx, cy, cw, ch } = register(box);
  const x = Math.max(0, Math.round(cx));
  const y = Math.max(0, Math.round(cy));
  const cropW = Math.min(sw - x, Math.round(cw));
  const cropH = Math.min(sh - y, Math.round(ch));

  const cut = join(TMP, `cut-${n}.png`);
  run([
    "-i",
    caged,
    "-vf",
    `crop=${cropW}:${cropH}:${x}:${y},` +
      `pad=${Math.round(cw)}:${Math.round(ch)}:${Math.round(x - cx)}:${Math.round(y - cy)}:color=#00000000,` +
      `scale=${W}:${H}:flags=lanczos`,
    "-frames:v",
    "1",
    cut,
  ]);

  const art = decodeRgba(cut);
  const out = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    const a = (art[i * 4 + 3] / 255) * keep[i];
    out[i * 3] = Math.min(255, art[i * 4] * a) | 0;
    out[i * 3 + 1] = Math.min(255, art[i * 4 + 1] * a) | 0;
    out[i * 3 + 2] = Math.min(255, art[i * 4 + 2] * a) | 0;
  }
  frames.push(out);

  const png = join(TMP, `${String(n + 1).padStart(2, "0")}.png`);
  run(
    [
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-s",
      `${W}x${H}`,
      "-i",
      "pipe:0",
      png,
    ],
    { input: out },
  );
});

mkdirSync(OUT_DIR, { recursive: true });
const sheet = join(OUT_DIR, `ult-burst-${ELEMENT}.${wantPng ? "png" : "webp"}`);
run([
  "-i",
  join(TMP, "%02d.png"),
  "-vf",
  `scale=${CELL_W}:${CELL_H}:flags=lanczos,tile=${COLS}x${COUNT / COLS}`,
  "-frames:v",
  "1",
  ...(wantPng
    ? ["-c:v", "png", "-pix_fmt", "rgb24", "-pred", "mixed"]
    : ["-c:v", "libwebp", "-quality", String(QUALITY)]),
  "-compression_level",
  wantPng ? "9" : "6",
  sheet,
]);
console.log(
  `${rel(sheet)}  ${COLS}x${COUNT / COLS} ${CELL_W}x${CELL_H} ` +
    `${kb(statSync(sheet).size)}`,
);

if (wantFrames) {
  const contact = join(PROOF_DIR, `ult-burst-${ELEMENT}-contact.png`);
  run([
    "-i",
    join(TMP, "%02d.png"),
    "-vf",
    `scale=192:344,tile=6x2`,
    "-frames:v",
    "1",
    contact,
  ]);
  console.log(`  frames ${rel(contact)}`);
}

if (wantProof) {
  const cardW = 168;
  const cardH = Math.round(cardW / 0.48);
  const k = cardH / 260;
  const line = 6.11 * k;
  const auraW = Math.round((cardW * W) / CARD.w);
  const auraH = Math.round((cardH * H) / CARD.h);
  const bg = [26, 18, 34];
  const fill = [18, 11, 30];
  const tint = [0x2f, 0xa8, 0xff];

  const cells = [];
  for (const out of frames) {
    const px2 = Buffer.alloc(auraW * auraH * 3);
    run(
      [
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        `${W}x${H}`,
        "-i",
        "pipe:0",
        "-vf",
        `scale=${auraW}:${auraH}:flags=lanczos`,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        join(TMP, "aura.raw"),
      ],
      { input: out },
    );
    const art = readFileSync(join(TMP, "aura.raw"));
    for (let y = 0; y < auraH; y++) {
      for (let x = 0; x < auraW; x++) {
        const i = (y * auraW + x) * 3;
        const qx = Math.abs(x + 0.5 - auraW / 2) - (cardW / 2 - 4 * k);
        const qy = Math.abs(y + 0.5 - auraH / 2) - (cardH / 2 - 4 * k);
        const d =
          Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
          Math.min(Math.max(qx, qy), 0) -
          4 * k;
        const inside = Math.min(1, Math.max(0, 0.5 - d));
        const onLine = Math.min(
          1,
          Math.max(0, 0.5 - Math.abs(d + line / 2) + line / 2),
        );
        for (let c = 0; c < 3; c++) {
          const base = fill[c] * inside + bg[c] * (1 - inside);
          const card = tint[c] * onLine + base * (1 - onLine);
          px2[i + c] = Math.min(255, card + art[i + c]) | 0;
        }
      }
    }
    cells.push(px2);
  }

  const gw = auraW * 6;
  const gh = auraH * 2;
  const grid = Buffer.alloc(gw * gh * 3);
  cells.forEach((cell, n) => {
    const ox = (n % 6) * auraW;
    const oy = Math.floor(n / 6) * auraH;
    for (let y = 0; y < auraH; y++)
      cell.copy(
        grid,
        ((y + oy) * gw + ox) * 3,
        y * auraW * 3,
        (y + 1) * auraW * 3,
      );
  });
  const file = join(PROOF_DIR, `ult-burst-${ELEMENT}-proof.png`);
  writeFileSync(join(TMP, "grid.raw"), grid);
  run([
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    `${gw}x${gh}`,
    "-i",
    join(TMP, "grid.raw"),
    file,
  ]);
  console.log(`  proof  ${rel(file)}  ${gw}x${gh}`);
}

rmSync(TMP, { recursive: true, force: true });
