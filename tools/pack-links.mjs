import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, statSync, existsSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = "src/source/fx/links";
const OUT_DIR = "src/assets/fx";

const RIBBON = { w: 256, h: 96 };
const NODE = { w: 128, h: 128 };
const PAD = 2;
const FRAMES = 4;

const FLOOR = 10;
const CORE = 0.72;
const BURN = 0.5;
const QUALITY = 82;

const JOBS = [
  {
    id: "link-fire",
    color: 0xff5a1f,
    what: "flame licking along the run — four of the build's seven fire trails, the three that read as one gesture plus the ragged one",
    frames: [
      { src: "T_FX_Trail_Fire_2_1.png" },
      { src: "T_FX_Trail_Fire_3_1.png" },
      { src: "T_FX_Trail_Fire_4_1.png" },
      { src: "T_FX_Trail_Fire_6_1.png" },
    ],
  },
  {
    id: "link-water",
    color: 0x2fa8ff,
    what: "a liquid rope with beads coming off it — the build's own four-frame cycle, authored as one animation",
    frames: [
      { src: "T_FX_Trail_Liquid_1_1.png" },
      { src: "T_FX_Trail_Liquid_1_2.png" },
      { src: "T_FX_Trail_Liquid_1_3.png" },
      { src: "T_FX_Trail_Liquid_1_4.png" },
    ],
  },
  {
    id: "link-nature",
    color: 0x3fd16a,
    what: "a thorn vine thrown between the stones, thickening to a braid and then lighting up — one thorn, two, three, and the glowing liana last",
    frames: [
      { src: "T_FX_Obj_Liana_2_1_A.png" },
      { src: "T_FX_Obj_Liana_2_2_A.png" },
      { src: "T_FX_Obj_Liana_2_3_A.png" },
      { src: "T_FX_Obj_Liana_3_2.png" },
    ],
  },
  {
    id: "link-lightning",
    color: 0xffd22e,
    what: "a hard jagged arc that breaks up — the top row of the build's 4x4 arc strip, which is one bolt drawn four times and thinning",
    frames: [
      { src: "T_FX_Electricity_15_3_4x4_opt.png", grid: [4, 4], at: [0, 0] },
      { src: "T_FX_Electricity_15_3_4x4_opt.png", grid: [4, 4], at: [1, 0] },
      { src: "T_FX_Electricity_15_3_4x4_opt.png", grid: [4, 4], at: [2, 0] },
      { src: "T_FX_Electricity_15_3_4x4_opt.png", grid: [4, 4], at: [3, 0] },
    ],
  },
  {
    id: "link-arcane",
    color: 0xa855f7,
    what: "a smooth twin filament with a bright knot travelling it — three rows of one strip and one of its sibling, the closest thing in the library to the chain the real game strings across a run",
    frames: [
      { src: "T_FX_Electricity_8_1_3x1.png", grid: [1, 3], at: [0, 0] },
      { src: "T_FX_Electricity_8_1_3x1.png", grid: [1, 3], at: [0, 1] },
      { src: "T_FX_Electricity_8_1_3x1.png", grid: [1, 3], at: [0, 2] },
      { src: "T_FX_Electricity_8_2_3x1.png", grid: [1, 3], at: [0, 1] },
    ],
  },
  {
    id: "link-wind",
    color: 0x8ceee2,
    what: "crossing wisps, then air being cut, then one smooth rope — the build's only wind trail followed by three of its plain ones, which are what it uses for moving air everywhere else",
    frames: [
      { src: "T_FX_Trail_Wind_1_1.png", gain: 1.5 },
      { src: "T_FX_Trail_9_4.png" },
      { src: "T_FX_Trail_9_3.png", gain: 1.2 },
      { src: "T_FX_Trail_3_1.png", gain: 1.6 },
    ],
  },
  {
    id: "link-node",
    color: null,
    cell: NODE,
    count: 3,
    what: "the three flares one link needs: the sparkle that sits on every stone the run touches, the thin cross the travelling knot wears, and the ragged splat it lands on the card as",
    frames: [
      { src: "T_FX_Glow_Glare_1_1.png" },
      { src: "T_FX_Glow_Glare_2_1.png" },
      { src: "T_FX_Glow_Glare_9_1.png" },
    ],
  },
];

function probe(file) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
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

function mask(px, i) {
  const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  return (l * px[i + 3]) / (255 * 255);
}

function ramp(m, r, g, b) {
  const hot = m <= CORE ? 0 : ((m - CORE) / (1 - CORE)) * BURN;
  const live = m * 255 > FLOOR ? 1 : 0;
  return [
    Math.min(255, Math.round((r + (255 - r) * hot) * m * live)),
    Math.min(255, Math.round((g + (255 - g) * hot) * m * live)),
    Math.min(255, Math.round((b + (255 - b) * hot) * m * live)),
  ];
}

function sourceRect(info, frame) {
  if (frame.rect) {
    const [x, y, w, h] = frame.rect;
    return { x, y, w, h };
  }
  const [cols, rows] = frame.grid || [1, 1];
  const [col, row] = frame.at || [0, 0];
  const w = Math.floor(info.w / cols);
  const h = Math.floor(info.h / rows);
  return { x: col * w, y: row * h, w, h };
}

function stretch(px, sw, rect, color, gain, out, ow, ox, oy, cell) {
  const r = color === null ? 255 : (color >> 16) & 255;
  const g = color === null ? 255 : (color >> 8) & 255;
  const b = color === null ? 255 : color & 255;

  for (let y = 0; y < cell.h; y++) {
    const sy0 = rect.y + Math.floor((y * rect.h) / cell.h);
    const sy1 = Math.max(
      sy0 + 1,
      rect.y + Math.floor(((y + 1) * rect.h) / cell.h),
    );
    for (let x = 0; x < cell.w; x++) {
      const sx0 = rect.x + Math.floor((x * rect.w) / cell.w);
      const sx1 = Math.max(
        sx0 + 1,
        rect.x + Math.floor(((x + 1) * rect.w) / cell.w),
      );

      let sum = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          sum += mask(px, (sy * sw + sx) * 4);
          n++;
        }
      }
      const m = n ? Math.min(1, (sum / n) * gain) : 0;
      const [cr, cg, cb] = ramp(m, r, g, b);
      const o = ((oy + y) * ow + ox + x) * 4;
      out[o] = cr;
      out[o + 1] = cg;
      out[o + 2] = cb;
      out[o + 3] = 255;
    }
  }
}

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const only = new Set(argv.filter((a) => !a.startsWith("--")));
const kb = (file) => (statSync(file).size / 1024).toFixed(1);

mkdirSync(join(ROOT, OUT_DIR), { recursive: true });

for (const job of JOBS) {
  if (only.size && !only.has(job.id)) continue;

  const cell = job.cell || RIBBON;
  const count = job.count || FRAMES;
  const cellW = cell.w + PAD * 2;
  const cellH = cell.h + PAD * 2;
  const sheetW = cellW * count;
  const sheetH = cellH;

  const missing = job.frames
    .slice(0, count)
    .map((f) => f.src)
    .filter((s) => !existsSync(join(ROOT, SRC_DIR, s)));
  if (missing.length) {
    console.log(`${job.id.padEnd(14)} skipped — missing ${missing.join(", ")}`);
    continue;
  }

  const sheet = Buffer.alloc(sheetW * sheetH * 4);
  for (let i = 3; i < sheet.length; i += 4) sheet[i] = 255;

  const cache = new Map();
  job.frames.slice(0, count).forEach((frame, f) => {
    const file = join(ROOT, SRC_DIR, frame.src);
    if (!cache.has(frame.src)) {
      cache.set(frame.src, { info: probe(file), px: decode(file) });
    }
    const { info, px } = cache.get(frame.src);
    stretch(
      px,
      info.w,
      sourceRect(info, frame),
      job.color,
      frame.gain || 1,
      sheet,
      sheetW,
      f * cellW + PAD,
      PAD,
      cell,
    );
  });

  const out = join(ROOT, OUT_DIR, `${job.id}.webp`);
  if (flags.has("--strip")) {
    encode(sheet, sheetW, sheetH, out.replace(/\.webp$/, ".png"));
  }
  encode(sheet, sheetW, sheetH, out, [
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

  console.log(
    `${job.id.padEnd(14)} ${count} frames` +
      `  ${job.color === null ? "mask   " : "#" + job.color.toString(16).padStart(6, "0")}` +
      `  ${sheetW}x${sheetH}  ${kb(out).padStart(6)} kB`,
  );
}
