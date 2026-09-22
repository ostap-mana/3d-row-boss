import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, rmSync } from "node:fs";
import { resolve, dirname, basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const USAGE = `
pack-rise-beat — turn one painted VFX still into an eruption that climbs out of
the ground and lands on that still.

  node tools/pack-rise-beat.mjs --src <png> --out <webp> [options]

  pack-still-beat blows a painted burst open and burns it down, which is the
  beat a hit wants. An eruption wants the other half of the arc: nothing, then a
  crack of light at the impact point, then the column stretching up out of it
  until the last cell is the artist's frame untouched.

  Every cell is the same art, sampled about the impact point with two scales —
  a vertical one that extends the column upward and a horizontal one that opens
  the burst out — so no shape is invented and the final frame is the source
  pixel for pixel. Early cells run hot and over-bright, which is the break-out
  flash; by the hold they are the painting.

  --frames n    cells in the sheet. Default 12.
  --cols n      cells per row. Default 4.
  --cell N      cell width. Height follows the source aspect. Default 320.
  --ground g    impact height as a fraction from the top. Default measured.
  --centre c    impact x as a fraction of width. Default measured.
  --start s     vertical scale of the first cell. Default 0.07.
  --open o      horizontal scale of the first cell. Default 0.34.
  --ease e      how hard the climb front-loads. Default 0.62.
  --hold h      fraction of the beat already settled on the still. Default 0.2.
  --flash f     extra gain on the break-out. Default 0.5.
  --heat h      how far the early cells push toward white. Default 0.55.
  --floor n     black point lifted off the source. Default 12.
  --gain g      overall brightness. Default 1.0.
  --preview p   also write an mp4 of the frames at --fps to look at.
  --fps n       preview rate. Default 12.
  --strip       also write the sheet as a PNG.
`;

const args = process.argv.slice(2);
if (args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const num = (name, fallback) => Number(arg(name, fallback));
const has = (name) => args.indexOf(name) >= 0;

const SRC = resolve(ROOT, arg("--src", ""));
const OUT = resolve(ROOT, arg("--out", "src/assets/fx/rise-sheet.webp"));
const PREVIEW = arg("--preview", "");
const STRIP = has("--strip");

const COUNT = num("--frames", 12);
const COLS = num("--cols", 4);
const CELL = num("--cell", 320);
const PAD = 2;
const QUALITY = 82;
const FPS = num("--fps", 12);

const START = num("--start", 0.07);
const OPEN = num("--open", 0.34);
const EASE = num("--ease", 0.62);
const HOLD = num("--hold", 0.2);
const FLASH = num("--flash", 0.5);
const HEAT = num("--heat", 0.55);
const FLOOR = num("--floor", 12);
const GAIN = num("--gain", 1.0);

const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function probe(file) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
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
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { maxBuffer: 1 << 30 },
  );
}

function encode(buf, w, h, file, extra) {
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
      "rgba",
      "-s",
      `${w}x${h}`,
      "-i",
      "pipe:0",
      ...(extra || []),
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 30 },
  );
}

if (!arg("--src", "") || !existsSync(SRC)) {
  process.stderr.write(`pack-rise-beat: no source at ${SRC}\n`);
  process.exit(1);
}

const info = probe(SRC);
const px = decode(SRC);

function impact() {
  let best = 0;
  for (let y = 0; y < info.h; y++) {
    for (let x = 0; x < info.w; x++) {
      const s = (y * info.w + x) * 3;
      const l = Math.max(px[s], px[s + 1], px[s + 2]);
      if (l > best) best = l;
    }
  }
  const cut = best * 0.72;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let y = 0; y < info.h; y++) {
    for (let x = 0; x < info.w; x++) {
      const s = (y * info.w + x) * 3;
      if (Math.max(px[s], px[s + 1], px[s + 2]) < cut) continue;
      sx += x;
      sy += y;
      n++;
    }
  }
  if (!n) return { x: 0.5, y: 0.82 };
  return { x: sx / n / info.w, y: sy / n / info.h };
}

const found = impact();
const CX = num("--centre", found.x) * info.w;
const CY = num("--ground", found.y) * info.h;

const CELL_H = Math.round((CELL * info.h) / info.w / 2) * 2;
const pitchX = CELL + PAD * 2;
const pitchY = CELL_H + PAD * 2;
const rows = Math.ceil(COUNT / COLS);
const sheetW = pitchX * COLS;
const sheetH = pitchY * rows;
const sheet = Buffer.alloc(sheetW * sheetH * 4);
for (let i = 3; i < sheet.length; i += 4) sheet[i] = 255;

const stepX = info.w / CELL;
const stepY = info.h / CELL_H;

function sample(sx, sy, out) {
  if (sx < 0 || sy < 0 || sx > info.w - 1 || sy > info.h - 1) {
    out[0] = 0;
    out[1] = 0;
    out[2] = 0;
    return;
  }
  const x0 = sx | 0;
  const y0 = sy | 0;
  const x1 = x0 + 1 > info.w - 1 ? x0 : x0 + 1;
  const y1 = y0 + 1 > info.h - 1 ? y0 : y0 + 1;
  const fx = sx - x0;
  const fy = sy - y0;
  const a = (y0 * info.w + x0) * 3;
  const b = (y0 * info.w + x1) * 3;
  const c = (y1 * info.w + x0) * 3;
  const d = (y1 * info.w + x1) * 3;
  for (let k = 0; k < 3; k++) {
    const top = px[a + k] * (1 - fx) + px[b + k] * fx;
    const bot = px[c + k] * (1 - fx) + px[d + k] * fx;
    out[k] = top * (1 - fy) + bot * fy;
  }
}

const rgb = [0, 0, 0];
const frames = [];

for (let f = 0; f < COUNT; f++) {
  const raw = COUNT === 1 ? 1 : f / (COUNT - 1);
  const t = clamp01(raw / (1 - HOLD));
  const k = 1 - Math.pow(1 - t, 1 / EASE);

  const lift = START + (1 - START) * k;
  const open = OPEN + (1 - OPEN) * Math.pow(k, 0.7);
  const early = Math.pow(1 - t, 2);
  const gain = GAIN * (1 + FLASH * early);
  const heat = HEAT * early;

  const cell = Buffer.alloc(CELL * CELL_H * 4);

  for (let y = 0; y < CELL_H; y++) {
    for (let x = 0; x < CELL; x++) {
      const ax = x * stepX;
      const ay = y * stepY;
      const sx = CX + (ax - CX) / open;
      const sy = CY + (ay - CY) / lift;

      sample(sx, sy, rgb);
      const r = rgb[0];
      const g = rgb[1];
      const b = rgb[2];
      if (Math.max(r, g, b) <= FLOOR) continue;

      const rr = (r - FLOOR) * gain;
      const gg = (g - FLOOR) * gain;
      const bb = (b - FLOOR) * gain;
      const top = Math.max(rr, gg, bb);

      const at = (y * CELL + x) * 4;
      cell[at] = clamp(rr + (top - rr) * heat);
      cell[at + 1] = clamp(gg + (top - gg) * heat * 0.85);
      cell[at + 2] = clamp(bb + (top - bb) * heat * 0.7);
    }
  }

  frames.push(cell);

  const ox = (f % COLS) * pitchX + PAD;
  const oy = Math.floor(f / COLS) * pitchY + PAD;
  for (let y = 0; y < CELL_H; y++) {
    const from = y * CELL * 4;
    const to = ((oy + y) * sheetW + ox) * 4;
    cell.copy(sheet, to, from, from + CELL * 4);
  }
}

encode(sheet, sheetW, sheetH, OUT, [
  "-c:v",
  "libwebp",
  "-lossless",
  "0",
  "-quality",
  String(QUALITY),
  "-compression_level",
  "6",
  "-preset",
  "drawing",
]);
if (STRIP) encode(sheet, sheetW, sheetH, OUT.replace(/\.webp$/, ".png"), []);

if (PREVIEW) {
  const dir = join(tmpdir(), `rise-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  frames.forEach((cell, i) => {
    const file = join(dir, `f${String(i).padStart(3, "0")}.png`);
    encode(cell, CELL, CELL_H, file, []);
  });
  const dest = resolve(ROOT, PREVIEW);
  mkdirSync(dirname(dest), { recursive: true });
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-framerate",
    String(FPS),
    "-i",
    join(dir, "f%03d.png"),
    "-vf",
    "scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p",
    "-c:v",
    "libx264",
    "-crf",
    "18",
    dest,
  ]);
  rmSync(dir, { recursive: true, force: true });
}

process.stdout.write(
  `rise ${basename(SRC)} -> ${COUNT} frames  ${sheetW}x${sheetH}  ` +
    `cell ${CELL}x${CELL_H}  impact ${(CX / info.w).toFixed(3)}, ${(CY / info.h).toFixed(3)}  ` +
    `${(statSync(OUT).size / 1024).toFixed(1)} kB\n`,
);
