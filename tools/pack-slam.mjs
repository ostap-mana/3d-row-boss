import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `
pack-slam — paint the boss MAGMA SLAM plate off an Invokers fire flipbook.

  node tools/pack-slam.mjs [--src <png>] [--out <webp>] [--strip]

  The build fire masks are hard black-and-white silhouettes: filled flat they
  pack as one pale blob, which is what the old plate was. This measures how deep
  inside the shape every pixel sits and paints by that depth — a white-hot torn
  rim, gold behind it, magma and crimson under that, and a violet haze in the
  belly that all but vanishes on the additive blend. The late frames cool: their
  ramp tops out at magma and their gain falls, so the wave burns down instead of
  holding white. The source cells are wide and low, so the burst lands letter-
  boxed in the square cell the spell sheet slices, and reads as a shockwave
  running along the ground rather than a cloud over the board.

  --strip also writes the sheet as a PNG next to the webp, to look at.
`;

if (process.argv.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

const SRC = resolve(
  ROOT,
  arg("--src", "masters/fx/fire/T_FX_Fire_9_1_2x6.png"),
);
const OUT = resolve(ROOT, arg("--out", "src/assets/fx/slam-sheet.webp"));
const STRIP = process.argv.includes("--strip");

const COLS = 5;
const COUNT = 10;
const CELL = 320;
const PAD = 2;
const QUALITY = 82;

const RAMP = [
  [0.0, 0x7b2fb0],
  [0.24, 0xa855f7],
  [0.44, 0xff3a5a],
  [0.66, 0xff6a10],
  [0.86, 0xffd35a],
  [1.0, 0xfff2d0],
];

const MARGIN = 22;
const RIM = 15;
const FEATHER = 1.7;
const DEEP = 0.22;
const CURVE = 1.1;
const GLOW = { reach: 7, gain: 0.42, tint: 0xa855f7 };
const COOL = { top: [1, 0.5], gain: [1.3, 0.4], bend: 1.3 };
const FLOOR = 6;

function grid(name) {
  const all = [...name.matchAll(/_([1-9])x([1-9])(?![0-9])/g)];
  if (!all.length) throw new Error(`${name}: no NxM grid in the filename`);
  const m = all[all.length - 1];
  return { cols: Number(m[1]), rows: Number(m[2]) };
}

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
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
    { maxBuffer: 1 << 30 },
  );
}

function encode(buf, w, h, file, args) {
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
      ...(args || []),
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 30 },
  );
}

function chamfer(on, w, h) {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let i = 0; i < d.length; i++) d[i] = on[i] ? INF : 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (d[i] === 0) continue;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + 1);
      if (y > 0) v = Math.min(v, d[i - w] + 1);
      if (y > 0 && x > 0) v = Math.min(v, d[i - w - 1] + 1.4142);
      if (y > 0 && x < w - 1) v = Math.min(v, d[i - w + 1] + 1.4142);
      d[i] = v;
    }
  }
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x;
      let v = d[i];
      if (x < w - 1) v = Math.min(v, d[i + 1] + 1);
      if (y < h - 1) v = Math.min(v, d[i + w] + 1);
      if (y < h - 1 && x < w - 1) v = Math.min(v, d[i + w + 1] + 1.4142);
      if (y < h - 1 && x > 0) v = Math.min(v, d[i + w - 1] + 1.4142);
      d[i] = v;
    }
  }
  return d;
}

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;

function rampAt(t) {
  const k = clamp01(t);
  for (let i = 1; i < RAMP.length; i++) {
    if (k > RAMP[i][0] && i < RAMP.length - 1) continue;
    const [lo, a] = RAMP[i - 1];
    const [hi, b] = RAMP[i];
    const p = hi === lo ? 0 : (k - lo) / (hi - lo);
    return [
      lerp((a >> 16) & 255, (b >> 16) & 255, p),
      lerp((a >> 8) & 255, (b >> 8) & 255, p),
      lerp(a & 255, b & 255, p),
    ];
  }
  return [255, 255, 255];
}

function paint(px, sw, x0, y0, cw, ch, cool, rim, scale, pad) {
  const w = cw + pad * 2;
  const h = ch + pad * 2;
  const on = new Uint8Array(w * h);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      const s = ((y0 + y) * sw + x0 + x) * 4;
      const l = 0.2126 * px[s] + 0.7152 * px[s + 1] + 0.0722 * px[s + 2];
      on[(y + pad) * w + x + pad] = (l * px[s + 3]) / 255 > 110 ? 1 : 0;
    }
  }

  const off = new Uint8Array(w * h);
  for (let i = 0; i < on.length; i++) off[i] = on[i] ? 0 : 1;

  const dIn = chamfer(on, w, h);
  const dOut = chamfer(off, w, h);

  const gr = (GLOW.tint >> 16) & 255;
  const gg = (GLOW.tint >> 8) & 255;
  const gb = GLOW.tint & 255;

  const out = new Float32Array(w * h * 3);
  for (let i = 0; i < on.length; i++) {
    const inside = on[i] === 1;
    const signed = inside ? dIn[i] : -dOut[i];
    const cov = clamp01(0.5 + signed / FEATHER);

    if (cov > 0.002) {
      const heat = clamp01(1 - (inside ? dIn[i] : 0) / rim);
      const [r, g, b] = rampAt(heat * cool.top);
      const v = (DEEP + (1 - DEEP) * Math.pow(heat, CURVE)) * cool.gain * cov;
      out[i * 3] = r * v;
      out[i * 3 + 1] = g * v;
      out[i * 3 + 2] = b * v;
    }

    if (!inside) {
      const k =
        GLOW.gain * Math.exp(-dOut[i] / (GLOW.reach * scale)) * cool.gain;
      out[i * 3] += gr * k;
      out[i * 3 + 1] += gg * k;
      out[i * 3 + 2] += gb * k;
    }
  }
  return { out, w, h };
}

function blit(src, w, h, dst, dw, ox, oy, tw, th) {
  for (let y = 0; y < th; y++) {
    const sy0 = Math.floor((y * h) / th);
    const sy1 = Math.max(sy0 + 1, Math.floor(((y + 1) * h) / th));
    for (let x = 0; x < tw; x++) {
      const sx0 = Math.floor((x * w) / tw);
      const sx1 = Math.max(sx0 + 1, Math.floor(((x + 1) * w) / tw));

      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          const s = (sy * w + sx) * 3;
          r += src[s];
          g += src[s + 1];
          b += src[s + 2];
          n++;
        }
      }
      r /= n;
      g /= n;
      b /= n;
      const lit = Math.max(r, g, b) > FLOOR;
      const o = ((oy + y) * dw + ox + x) * 4;
      dst[o] = lit ? Math.min(255, Math.round(r)) : 0;
      dst[o + 1] = lit ? Math.min(255, Math.round(g)) : 0;
      dst[o + 2] = lit ? Math.min(255, Math.round(b)) : 0;
      dst[o + 3] = 255;
    }
  }
}

if (!existsSync(SRC)) {
  process.stderr.write(`pack-slam: ${SRC} is not here\n`);
  process.exit(1);
}

mkdirSync(dirname(OUT), { recursive: true });

const info = probe(SRC);
const px = decode(SRC);
const { cols, rows } = grid(basename(SRC));
const cw = Math.floor(info.w / cols);
const ch = Math.floor(info.h / rows);
const have = cols * rows;

const cellOut = CELL + PAD * 2;
const sheetRows = Math.ceil(COUNT / COLS);
const sheetW = cellOut * COLS;
const sheetH = cellOut * sheetRows;
const sheet = Buffer.alloc(sheetW * sheetH * 4);
for (let i = 3; i < sheet.length; i += 4) sheet[i] = 255;

const scale = cw / CELL;
const pad = Math.round(MARGIN * scale);
const padW = cw + pad * 2;
const padH = ch + pad * 2;
const bandH = Math.round((CELL * padH) / padW);
const bandY = Math.round((CELL - bandH) / 2);

for (let f = 0; f < COUNT; f++) {
  const s = Math.round((f * (have - 1)) / (COUNT - 1));
  const t = Math.pow(f / (COUNT - 1), COOL.bend);
  const cool = {
    top: lerp(COOL.top[0], COOL.top[1], t),
    gain: lerp(COOL.gain[0], COOL.gain[1], t),
  };

  const lit = paint(
    px,
    info.w,
    (s % cols) * cw,
    Math.floor(s / cols) * ch,
    cw,
    ch,
    cool,
    RIM * scale,
    scale,
    pad,
  );

  blit(
    lit.out,
    lit.w,
    lit.h,
    sheet,
    sheetW,
    (f % COLS) * cellOut + PAD,
    Math.floor(f / COLS) * cellOut + PAD + bandY,
    CELL,
    bandH,
  );
}

if (STRIP) encode(sheet, sheetW, sheetH, OUT.replace(/\.webp$/, ".png"));

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

const kb = (statSync(OUT).size / 1024).toFixed(1);
process.stdout.write(
  `slam  ${basename(SRC)}  ${cols}x${rows}=${have} frames -> ${COUNT}` +
    `  band ${CELL}x${bandH} in ${CELL}  ${sheetW}x${sheetH}  ${kb} kB\n`,
);
