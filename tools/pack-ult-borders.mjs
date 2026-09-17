import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ELEMENTS } from "./gen-card-auras.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src/assets/cards");
const TMP = join(ROOT, "src/animation/.tmp-ult");

const HALO = process.argv.includes("--halo");
const RIBBON = process.argv.includes("--ribbon");
const FLARE = process.argv.includes("--flare");
const BURST = process.argv.includes("--burst");
const PNG = process.argv.includes("--png");
const SHELF = join(
  ROOT,
  HALO
    ? "src/animation"
    : FLARE
      ? "src/animation/style-flare"
      : RIBBON
        ? "src/animation/style-ribbon"
        : "src/animation/style-border",
);

const BORDER_TAKES = {
  fire: 1,
  water: 4,
  nature: 4,
  lightning: 2,
  arcane: 3,
  wind: 4,
};

const flareTakes = () => {
  const loop = {
    fire: 11,
    water: 11,
    nature: 11,
    lightning: 11,
    arcane: 11,
    wind: 13,
  };
  return Object.fromEntries(
    Object.entries(loop).map(([el, v]) => [el, BURST ? v + 1 : v]),
  );
};

const TAKES = FLARE ? flareTakes() : BORDER_TAKES;

const COLS = 6;
const COUNT = 12;

const CELL_W = Number(process.env.ULT_CELL_W ?? 176);

const QUALITY = Number(process.env.ULT_QUALITY ?? (FLARE ? 68 : 80));

const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
const kb = (n) => `${(n / 1024).toFixed(1)}kB`;

const run = (args, opts) =>
  execFileSync("ffmpeg", ["-y", "-v", "error", ...args], opts);

const decodeGray = (file) =>
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "gray", "-"],
    { maxBuffer: 1 << 28 },
  );

const decodeRgb = (file, w, h) =>
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      ...(w ? ["-vf", `scale=${w}:${h}:flags=lanczos`] : []),
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: 1 << 28 },
  );

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

function measure(files) {
  const { w, h } = sizeOf(files[0]);
  const min = new Uint8Array(w * h).fill(255);
  for (const file of files) {
    const g = decodeGray(file);
    for (let i = 0; i < w * h; i++) if (g[i] < min[i]) min[i] = g[i];
  }

  const at = (x, y) => min[y * w + x];
  const high = (v) =>
    v.sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * 0.9))];

  const side = (n, m, read) => {
    const from = Math.round(n * 0.2);
    const to = Math.round(n * 0.8);
    const crossings = [];
    for (let i = from; i < to; i++) {
      let peak = 0;
      for (let j = 0; j < m; j++) peak = Math.max(peak, read(i, j));
      for (let j = 0; j < m; j++) {
        if (read(i, j) < peak * 0.5) continue;
        crossings.push(j);
        break;
      }
    }
    return crossings.length ? high(crossings) : 0;
  };

  const top = side(w, h, (x, y) => at(x, y));
  const bottom = h - 1 - side(w, h, (x, y) => at(x, h - 1 - y));
  const left = side(h, w, (y, x) => at(x, y));
  const right = w - 1 - side(h, w, (y, x) => at(w - 1 - x, y));

  const box = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  return {
    box,
    pad: { x: (w / box.w - 1) / 2, y: (h / box.h - 1) / 2 },
  };
}

const BURST_PEAK = 0.58;

function picks(files) {
  const last = files.length - 1;
  if (!BURST) {
    return Array.from(
      { length: COUNT },
      (_, i) => files[Math.round((i * last) / (COUNT - 1))],
    );
  }
  const up = Math.max(1, Math.round((COUNT - 1) * BURST_PEAK));
  return Array.from({ length: COUNT }, (_, i) =>
    i <= up
      ? files[Math.round((i * last) / up)]
      : files[Math.round(((COUNT - 1 - i) * last) / (COUNT - 1 - up))],
  );
}

const FLARE_LINE_W = 304;
const FLARE_LINE_H = 608;

function flareBox(w, h, measured) {
  const box = {
    x: (w - FLARE_LINE_W) / 2,
    y: (h - FLARE_LINE_H) / 2,
    w: FLARE_LINE_W,
    h: FLARE_LINE_H,
  };
  const off = Math.max(
    Math.abs(measured.box.w - FLARE_LINE_W),
    Math.abs(measured.box.h - FLARE_LINE_H),
  );
  return {
    box,
    off,
    pad: { x: (w / box.w - 1) / 2, y: (h / box.h - 1) / 2 },
  };
}

function pack(element, take) {
  const dir = join(SHELF, element, `${element}-v${take}`);
  if (!existsSync(dir)) {
    console.log(`  ${element}: no take v${take} on the shelf, skipped`);
    return null;
  }
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .sort()
    .map((f) => join(dir, f));
  if (files.length < COUNT) {
    console.log(`  ${element}: ${files.length} frames, skipped`);
    return null;
  }

  const chosen = picks(files);
  const { w, h } = sizeOf(chosen[0]);
  const cellH = Math.round((CELL_W * h) / w);
  const measured = measure(chosen);
  const { box, pad, off } = FLARE ? flareBox(w, h, measured) : measured;

  const tmp = join(TMP, element);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  chosen.forEach((f, i) =>
    cpSync(f, join(tmp, `${String(i + 1).padStart(2, "0")}.png`)),
  );

  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(
    OUT_DIR,
    `ult-${BURST ? "burst-" : ""}${element}.${PNG ? "png" : "webp"}`,
  );
  run([
    "-i",
    join(tmp, "%02d.png"),
    "-vf",
    `scale=${CELL_W}:${cellH}:flags=lanczos,tile=${COLS}x${COUNT / COLS}`,
    "-frames:v",
    "1",
    ...(PNG
      ? ["-c:v", "png", "-pix_fmt", "rgb24", "-pred", "mixed"]
      : ["-c:v", "libwebp", "-quality", String(QUALITY)]),
    "-compression_level",
    PNG ? "9" : "6",
    out,
  ]);
  rmSync(tmp, { recursive: true, force: true });

  const size = statSync(out).size;
  console.log(
    `  ${element}-v${take}: border ${box.w}x${box.h} at ${box.x},${box.y} of ` +
      `${w}x${h} -> ${rel(out)} ${COLS}x${COUNT / COLS} ${CELL_W}x${cellH} ${kb(size)}` +
      (off === undefined ? "" : `  (measured off by ${off}px)`),
  );
  return { element, take, size, pad, cellH, frames: chosen, box };
}

const PROOF_BG = [26, 18, 34];
const PROOF_CARD = [18, 11, 30];
const PROOF_CARD_W = 168;
const PROOF_ASPECT = 0.48;
const FRAME_BOX_H = 260;
const FRAME_BORDER = 6.11;
const FRAME_RADIUS = 4;

function proof(packed) {
  const cardW = PROOF_CARD_W;
  const cardH = Math.round(cardW / PROOF_ASPECT);
  const k = cardH / FRAME_BOX_H;
  const auraW = Math.round(cardW * (1 + 2 * packed.pad.x));
  const auraH = Math.round(cardH * (1 + 2 * packed.pad.y));
  const W = auraW + 48;
  const H = auraH + 48;

  const px = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++)
    for (let c = 0; c < 3; c++) px[i * 3 + c] = PROOF_BG[c];

  const hw = cardW / 2;
  const hh = cardH / 2;
  const r = FRAME_RADIUS * k;
  const line = FRAME_BORDER * k;
  const colour = ELEMENTS.find((e) => e.id === packed.element).color;
  const tint = [(colour >> 16) & 255, (colour >> 8) & 255, colour & 255];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const qx = Math.abs(x + 0.5 - W / 2) - (hw - r);
      const qy = Math.abs(y + 0.5 - H / 2) - (hh - r);
      const d =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
        Math.min(Math.max(qx, qy), 0) -
        r;
      const i = (y * W + x) * 3;
      const inside = Math.min(1, Math.max(0, 0.5 - d));
      const onLine = Math.min(
        1,
        Math.max(0, 0.5 - Math.abs(d + line / 2) + line / 2),
      );
      for (let c = 0; c < 3; c++) {
        const fill = PROOF_CARD[c] * inside + px[i + c] * (1 - inside);
        px[i + c] = tint[c] * onLine + fill * (1 - onLine);
      }
    }
  }

  const frame = packed.frames[Math.floor(COUNT / 3)];
  const art = decodeRgb(frame, auraW, auraH);
  const ox = ((W - auraW) / 2) | 0;
  const oy = ((H - auraH) / 2) | 0;
  for (let y = 0; y < auraH; y++) {
    for (let x = 0; x < auraW; x++) {
      const s = (y * auraW + x) * 3;
      const d = ((y + oy) * W + (x + ox)) * 3;
      for (let c = 0; c < 3; c++)
        px[d + c] = Math.min(255, px[d + c] + art[s + c]);
    }
  }

  const buf = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H * 3; i++) buf[i] = px[i] | 0;
  const file = join(SHELF, `${packed.element}-ult-proof.png`);
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
      file,
    ],
    { input: buf },
  );
  console.log(`  proof  ${rel(file)}  ${W}x${H}`);
}

if (!existsSync(SHELF)) {
  console.log(`nothing on the shelf: ${rel(SHELF)}`);
  console.log(
    "run: node tools/gen-card-auras.mjs && node tools/pack-card-auras.mjs --border",
  );
  process.exit(0);
}

const wantProof = process.argv.includes("--proof");

const only = [];
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--")) continue;
  const [id, take] = arg.split("=");
  if (!(id in TAKES)) {
    console.log(`unknown element: ${id}`);
    process.exit(1);
  }
  if (take) TAKES[id] = Number(take);
  only.push(id);
}

const order = ELEMENTS.map((e) => e.id).filter(
  (id) => id in TAKES && (!only.length || only.includes(id)),
);
console.log(`${order.length} border(s):`);

const packed = [];
for (const id of order) {
  const one = pack(id, TAKES[id]);
  if (one) packed.push(one);
}
rmSync(TMP, { recursive: true, force: true });
if (wantProof) for (const one of packed) proof(one);

const total = packed.reduce((n, p) => n + p.size, 0);
console.log(`${kb(total)} of sheets in ${rel(OUT_DIR)}`);

if (!packed.length) process.exit(0);

const spread = (axis) =>
  Math.max(...packed.map((p) => p.pad[axis])) -
  Math.min(...packed.map((p) => p.pad[axis]));
const mean = (axis) =>
  packed.reduce((n, p) => n + p.pad[axis], 0) / packed.length;
console.log(
  `\nsrc/art/ultborder.js: cols ${COLS}, count ${COUNT}, ` +
    `cell ${CELL_W}x${packed[0].cellH}`,
);
console.log(
  `  padX ${mean("x").toFixed(4)}  padY ${mean("y").toFixed(4)}` +
    (Math.max(spread("x"), spread("y")) > 0.004
      ? `  — WARNING: the six disagree by ` +
        `${spread("x").toFixed(4)}/${spread("y").toFixed(4)}; one of these takes` +
        ` was packed against another margin`
      : ""),
);
