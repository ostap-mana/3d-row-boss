import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ELEMENTS } from "./gen-card-auras.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AURA_SHEET = join(ROOT, "masters/cards/aura-sheet.png");
const TMP = join(ROOT, "src/animation/.tmp");

const CLIPS = join(
  process.env.COMFYUI_OUTPUT ||
    "C:/Users/Yonix/AppData/Local/Comfy-Desktop/ComfyUI-Installs/ComfyUI/ComfyUI/output",
  "aura",
);

const STYLE = process.argv.includes("--flare")
  ? "flare"
  : process.argv.includes("--ribbon")
    ? "ribbon"
    : process.argv.includes("--border")
      ? "border"
      : "halo";

const ON_CARD = STYLE !== "halo";
const UNROLLED = STYLE === "ribbon" || STYLE === "flare";

const PAD = 64;

const CARD_MARGIN = STYLE === "flare" ? 104 : 48;
const CARD_W = 288;
const CARD_H = 592;
const W = STYLE === "flare" ? CARD_W + CARD_MARGIN * 2 : 384;
const H = STYLE === "flare" ? CARD_H + CARD_MARGIN * 2 : ON_CARD ? 688 : 736;

const CARD_LINE = 16;
const CARD_RADIUS = 11;
const GLOW_OUT = Number(
  process.env.AURA_GLOW_OUT ?? (STYLE === "flare" ? CARD_MARGIN - 8 : 16),
);
const GLOW_IN = Number(process.env.AURA_GLOW_IN ?? (STYLE === "flare" ? 6 : 7));

const FLOOR = Number(process.env.AURA_FLOOR ?? 0.02);
const SPREAD = Number(process.env.AURA_SPREAD ?? 0.3);
const RIM = Number(process.env.AURA_RIM ?? 3.0);
const RIM_FLOOR = Number(process.env.AURA_RIM_FLOOR ?? 0.8);
const TEX_GAMMA = Number(
  process.env.AURA_TEX_GAMMA ??
    { halo: 0.35, border: 0.45, ribbon: 0.6, flare: 0.9 }[STYLE],
);
const TARGET = Number(process.env.AURA_TARGET ?? 0.95);
const GAIN_MAX = 6;

const BAND_FLOOR = Number(
  process.env.AURA_BAND_FLOOR ?? (STYLE === "ribbon" ? 0.12 : 0),
);

const SLICE = Number(process.env.AURA_SLICE ?? 48);
const STRIP_W = STYLE === "flare" ? W : H;
const STRIP_H =
  STYLE === "flare" ? Number(process.env.AURA_STRIP_H ?? 176) : SLICE;
const STRIP_TOP = Number(process.env.AURA_STRIP_TOP ?? 0.4);
const REPEAT = Number(process.env.AURA_REPEAT ?? (STYLE === "flare" ? 2 : 1));
const SPEED = Number(process.env.AURA_SPEED ?? 0.05);

const FPS = 7;
const CONTACT_COLS = 7;

const COLS = 6;
const COUNT = 12;
const CELL_W = 200;
const CELL_H = Math.round((CELL_W * H) / W);

const OUT_DIR = join(
  ROOT,
  {
    halo: "src/animation",
    border: "src/animation/style-border",
    ribbon: "src/animation/style-ribbon",
    flare: "src/animation/style-flare",
  }[STYLE],
);
const QUALITY = 88;

const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");
const kb = (n) => `${(n / 1024).toFixed(1)}kB`;

const run = (args, opts) =>
  execFileSync("ffmpeg", ["-y", "-v", "error", ...args], opts);

const decode = (file, pix, filter) =>
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
      pix,
      "-",
    ],
    { maxBuffer: 1 << 28 },
  );

const decodeTexture = (file) => decode(file, "rgb24", `scale=${W}:${H}`);

function maskFrom(file) {
  const [sw, sh] = execFileSync("ffprobe", [
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

  const raw = decode(file, "gray");
  let x0 = sw,
    y0 = sh,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (raw[y * sw + x] < 128) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const cx = Math.max(0, x0 - PAD);
  const cy = Math.max(0, y0 - PAD);
  const cw = Math.min(sw - cx, x1 - x0 + 1 + PAD * 2);
  const ch = Math.min(sh - cy, y1 - y0 + 1 + PAD * 2);

  mkdirSync(TMP, { recursive: true });
  const out = join(TMP, "mask.png");
  run([
    "-i",
    file,
    "-vf",
    `crop=${cw}:${ch}:${cx}:${cy},scale=${W}:${H}:flags=lanczos,format=gray`,
    "-frames:v",
    "1",
    out,
  ]);
  console.log(
    `mask: rim ${x1 - x0 + 1}x${y1 - y0 + 1} of ${sw}x${sh}, crop ${cw}x${ch} -> ${W}x${H}`,
  );
  return decode(out, "gray");
}

function borderMask() {
  const hw = (W - CARD_MARGIN * 2) / 2;
  const hh = (H - CARD_MARGIN * 2) / 2;
  const r = CARD_RADIUS;
  const cx = W / 2;
  const cy = H / 2;
  const half = CARD_LINE / 2;

  const band = new Float32Array(W * H);
  const hold = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const qx = Math.abs(x + 0.5 - cx) - (hw - r);
      const qy = Math.abs(y + 0.5 - cy) - (hh - r);
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const d = outside + Math.min(Math.max(qx, qy), 0) - r;

      const off = Math.abs(d) - half;
      const i = y * W + x;
      hold[i] = Math.min(1, Math.max(0, 0.5 - off));
      band[i] =
        off <= 0
          ? 1
          : d < 0
            ? Math.exp(-off / GLOW_IN)
            : STYLE === "flare"
              ? 1 - Math.pow(Math.min(1, off / GLOW_OUT), 3)
              : Math.exp(-off / GLOW_OUT);
    }
  }
  console.log(
    `mask: drawn card ${W - CARD_MARGIN * 2}x${H - CARD_MARGIN * 2} ` +
      `line ${CARD_LINE} radius ${CARD_RADIUS} in ${W}x${H}`,
  );
  return { band, hold, hotHold: 0.55 };
}

function haloMask() {
  const mask = maskFrom(AURA_SHEET);
  const band = new Float32Array(W * H);
  const hold = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const m = Math.max(0, mask[i] / 255 - FLOOR) / (1 - FLOOR);
    band[i] = Math.pow(m, SPREAD);
    hold[i] = Math.pow(m, RIM) * RIM_FLOOR;
  }
  return { band, hold, hotHold: 1 };
}

const { band, hold, hotHold } = ON_CARD ? borderMask() : haloMask();
if (BAND_FLOOR > 0) {
  for (let i = 0; i < band.length; i++) {
    band[i] = Math.max(0, (band[i] - BAND_FLOOR) / (1 - BAND_FLOOR));
  }
}

function ribbonMap() {
  const hw = (W - CARD_MARGIN * 2) / 2;
  const hh = (H - CARD_MARGIN * 2) / 2;
  const r = CARD_RADIUS;
  const cx = W / 2;
  const cy = H / 2;
  const half = CARD_LINE / 2;

  const sideY = hh - r;
  const sideX = hw - r;
  const arc = (Math.PI / 2) * r;
  const quad = sideY + arc + sideX;

  const span = CARD_LINE + GLOW_IN + GLOW_OUT;
  const U = new Float32Array(W * H);
  const V = new Float32Array(W * H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const qx = ax - sideX;
      const qy = ay - sideY;

      let s;
      if (qx > 0 && qy > 0) s = sideY + Math.atan2(qy, qx) * r;
      else if (qx >= qy) s = ay;
      else s = sideY + arc + (sideX - ax);

      let u;
      if (dx >= 0 && dy >= 0) u = s;
      else if (dx < 0 && dy >= 0) u = 2 * quad - s;
      else if (dx < 0) u = 2 * quad + s;
      else u = 4 * quad - s;

      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const d = outside + Math.min(Math.max(qx, qy), 0) - r;

      const i = y * W + x;
      U[i] = u / (4 * quad);
      V[i] = Math.min(1, Math.max(0, (d + GLOW_IN + half) / span));
    }
  }
  console.log(
    `ribbon: perimeter ${(4 * quad).toFixed(0)}px, band ${span}px, ` +
      `strip ${STRIP_W}x${STRIP_H} x${REPEAT} at ${SPEED}/frame`,
  );
  return { U, V };
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
const luma = (b, j) =>
  (b[j] * 0.299 + b[j + 1] * 0.587 + b[j + 2] * 0.114) / 255;

const value = (b, j) => Math.max(b[j], b[j + 1], b[j + 2]) / 255;

const intensity = STYLE === "flare" ? value : luma;
const HOT_MEASURE = STYLE === "flare" ? luma : null;

const ribbon = UNROLLED ? ribbonMap() : null;

const decodeStrip = (file) =>
  decode(
    file,
    "rgb24",
    STYLE === "flare"
      ? `crop=iw:ih*${STRIP_TOP}:0:ih*${1 - STRIP_TOP},` +
          `scale=${STRIP_W}:${STRIP_H},vflip`
      : `scale=${W}:${H},crop=${SLICE}:${H}:${(W - SLICE) >> 1}:0,transpose=2`,
  );

function tap(strip, f, v, measure) {
  const x = Math.min(STRIP_W - 1, (f * STRIP_W) | 0);
  const y = Math.min(STRIP_H - 1, (v * STRIP_H) | 0);
  return measure(strip, (y * STRIP_W + x) * 3);
}

function sampleStrip(strip, u, v, measure) {
  const m = measure || intensity;
  const f = u - Math.floor(u);
  const g = f < 0.5 ? f + 0.5 : f - 0.5;
  const w = 1 - Math.abs(2 * f - 1);
  return w * tap(strip, f, v, m) + (1 - w) * tap(strip, g, v, m);
}

function levelOfStrip(strips) {
  const bins = new Uint32Array(256);
  let counted = 0;
  for (const strip of strips) {
    for (let i = 0; i < STRIP_W * STRIP_H; i++) {
      bins[Math.min(255, (intensity(strip, i * 3) * 255) | 0)]++;
      counted++;
    }
  }
  let seen = 0;
  let p = 255;
  for (let v = 255; v >= 0; v--) {
    seen += bins[v];
    if (seen >= counted * 0.01) {
      p = v;
      break;
    }
  }
  return Math.max(1, Math.min(GAIN_MAX, TARGET / Math.max(1 / 255, p / 255)));
}

function levelOf(textures) {
  const bins = new Uint32Array(256);
  let counted = 0;
  for (const tex of textures) {
    for (let i = 0; i < W * H; i++) {
      if (band[i] < 0.3) continue;
      bins[Math.min(255, (luma(tex, i * 3) * 255) | 0)]++;
      counted++;
    }
  }
  if (!counted) return 1;
  let seen = 0;
  let p = 255;
  for (let v = 255; v >= 0; v--) {
    seen += bins[v];
    if (seen >= counted * 0.01) {
      p = v;
      break;
    }
  }
  return Math.max(1, Math.min(GAIN_MAX, TARGET / Math.max(1 / 255, p / 255)));
}

function pack(dir, colour) {
  const [element, take] = dir.split("-v");
  const src = join(CLIPS, dir);
  const frames = readdirSync(src)
    .filter((f) => f.endsWith(".png"))
    .sort();
  if (frames.length < COUNT) {
    console.log(`  ${dir}: ${frames.length} frames, skipped`);
    return 0;
  }

  const c = [
    ((colour >> 16) & 255) / 255,
    ((colour >> 8) & 255) / 255,
    (colour & 255) / 255,
  ];

  const textures = frames.map((f) =>
    ribbon ? decodeStrip(join(src, f)) : decodeTexture(join(src, f)),
  );
  const gain = ribbon ? levelOfStrip(textures) : levelOf(textures);

  const out = Buffer.alloc(frames.length * W * H * 3);
  textures.forEach((tex, n) => {
    const base = n * W * H * 3;
    for (let i = 0; i < W * H; i++) {
      const j = i * 3;
      const u = ribbon ? ribbon.U[i] * REPEAT + n * SPEED : 0;
      const t = ribbon ? sampleStrip(tex, u, ribbon.V[i]) : luma(tex, j);
      let g = Math.pow(t * gain, TEX_GAMMA) * band[i];
      if (g > 1) g = 1;
      let gh = g;
      if (HOT_MEASURE) {
        gh =
          Math.pow(
            sampleStrip(tex, u, ribbon.V[i], HOT_MEASURE) * gain,
            TEX_GAMMA,
          ) * band[i];
        if (gh > 1) gh = 1;
      }
      const a = Math.max(g, hold[i]);
      const h = Math.max(gh, hotHold * hold[i]);
      const hot = h * h * h * h;
      out[base + j] = clamp255(255 * (a * c[0] + hot * (1 - c[0])));
      out[base + j + 1] = clamp255(255 * (a * c[1] + hot * (1 - c[1])));
      out[base + j + 2] = clamp255(255 * (a * c[2] + hot * (1 - c[2])));
    }
  });

  const elementDir = join(OUT_DIR, element);
  const frameDir = join(elementDir, `${element}-v${take}`);
  rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });
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
      join(frameDir, "frame-%02d.png"),
    ],
    { input: out, maxBuffer: 1 << 29 },
  );

  const glob = join(frameDir, "frame-%02d.png");
  run([
    "-i",
    glob,
    "-vf",
    `tile=${CONTACT_COLS}x${Math.ceil(frames.length / CONTACT_COLS)}`,
    "-frames:v",
    "1",
    join(elementDir, `${element}-v${take}-contact.png`),
  ]);
  run([
    "-framerate",
    String(FPS),
    "-i",
    glob,
    "-c:v",
    "libwebp_anim",
    "-loop",
    "0",
    "-quality",
    String(QUALITY),
    "-compression_level",
    "6",
    join(elementDir, `${element}-v${take}.webp`),
  ]);

  const picks = Array.from({ length: COUNT }, (_, i) =>
    Math.round((i * (frames.length - 1)) / (COUNT - 1)),
  );
  const tmp = join(TMP, dir);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  picks.forEach((p, i) =>
    cpSync(
      join(frameDir, `frame-${String(p + 1).padStart(2, "0")}.png`),
      join(tmp, `${String(i + 1).padStart(2, "0")}.png`),
    ),
  );
  const sheet = join(elementDir, `${element}-v${take}-sheet.webp`);
  run([
    "-i",
    join(tmp, "%02d.png"),
    "-vf",
    `scale=${CELL_W}:${CELL_H}:flags=lanczos,tile=${COLS}x${COUNT / COLS}`,
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    String(QUALITY),
    "-compression_level",
    "6",
    sheet,
  ]);
  rmSync(tmp, { recursive: true, force: true });

  const size = statSync(sheet).size;
  console.log(
    `  ${dir}: ${frames.length} frames, level x${gain.toFixed(2)} -> ` +
      `${rel(frameDir)}/ + sheet ${COLS}x${COUNT / COLS} ${kb(size)}`,
  );
  return size;
}

const only = process.argv.slice(2).find((a) => !a.startsWith("--")) || "";
if (!existsSync(CLIPS)) {
  console.log(`nothing generated yet: ${CLIPS}`);
  console.log("run: node tools/gen-card-auras.mjs");
  process.exit(0);
}

const colours = Object.fromEntries(ELEMENTS.map((e) => [e.id, e.color]));
const dirs = readdirSync(CLIPS)
  .filter((d) => /^[a-z]+-v[0-9]+$/.test(d))
  .filter((d) => colours[d.split("-v")[0]] !== undefined)
  .filter((d) => !only || d === only || d.startsWith(only + "-v"))
  .sort();

console.log(`${dirs.length} variant(s):`);
let total = 0;
for (const dir of dirs) total += pack(dir, colours[dir.split("-v")[0]]);
rmSync(TMP, { recursive: true, force: true });
console.log(`${kb(total)} of sheets in ${rel(OUT_DIR)}`);
