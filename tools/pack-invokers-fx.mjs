import { execFileSync } from "node:child_process";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, statSync, readdirSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = "src/source/fx/invokers";

const COLS = 5;
const COUNT = 10;
const CELL = 224;
const PAD = 2;

const FLOOR = 10;

const CORE = 0.72;

const BURN = 0.5;

const QUALITY = 80;

const JOBS = [
  {
    id: "flame",
    src: "T_FX_Flipbook_fire_4_1_5x4.webp",
    color: 0xff5a1f,
    what: "embers gathering into a churning ball of fire that collapses — twenty frames, the longest arc in the library",
  },
  {
    id: "water",
    src: "T_FX_Fire_17_1_3x3.webp",
    color: 0x2fa8ff,
    what: "a bead that swells into a hollow crown and breaks into spray — the library's liquid set is all small blobs, and this one is a splash the moment it is blue",
  },
  {
    id: "nature",
    src: "T_FX_Smoke_17_1_4x4.webp",
    color: 0x3fd16a,
    what: "a spike that blooms into a heavy cluster and tears open — a bursting canopy in green, and nothing like water's ring",
  },
  {
    id: "lightning",
    src: "T_FX_Electricity_2_1_4x4.webp",
    color: 0xffd22e,
    what: "a coil of arc light that winds tight, snaps open and scatters — glow-cored rather than the hard-edged web that was here before",
  },
  {
    id: "arcane",
    src: "T_FX_Glow_Flash_17_1_4x2.webp",
    color: 0xa855f7,
    what: "a crown of spikes that drives out and burns back — the only burst in the library that peaks exactly on the landing frame",
  },
  {
    id: "wind",
    src: "T_FX_Smoke_18_1_3x3.webp",
    color: 0x8ceee2,
    what: "a curl that opens into a rolling vortex and tears — a cyclone instead of the puff, which the boss's shock ring already covers",
  },
  {
    id: "breath",
    src: "T_FX_Fire_22_1_4x4.webp",
    color: 0xff7a2a,
    what: "a plume licking up and breaking — the boss's cone",
  },
  {
    id: "slam",
    src: "T_FX_Smoke_4_1_4x4_A.webp",
    color: 0xffb060,
    what: "a heavy billow off the deck — the boss's shock ring",
  },
  {
    id: "claw",
    src: "T_FX_Glow_Flash_11_1_4x4.webp",
    color: 0xff4a3a,
    what: "two crossing streaks that fan and fade — the only rake in the library",
  },
  {
    id: "gem-pop",
    src: "T_FX_Glow_Flash_11_2_4x4.webp",
    color: null,
    cell: 96,
    out: "src/assets/fx/gem-pop.webp",
    what: "a starburst that flashes out on spikes and collapses to a ring",
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

function grid(name) {
  const all = [...name.matchAll(/_([1-9])x([1-9])(?![0-9])/g)];
  if (!all.length) throw new Error(`${name}: no NxM grid in the filename`);
  const m = all[all.length - 1];
  return { cols: Number(m[1]), rows: Number(m[2]) };
}

function mask(px, i) {
  const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  return (l * px[i + 3]) / (255 * 255);
}

function ramp(m, r, g, b) {
  const hot = m <= CORE ? 0 : ((m - CORE) / (1 - CORE)) * BURN;
  const k = m * 255;
  return [
    Math.min(255, Math.round((r + (255 - r) * hot) * m * (k > FLOOR ? 1 : 0))),
    Math.min(255, Math.round((g + (255 - g) * hot) * m * (k > FLOOR ? 1 : 0))),
    Math.min(255, Math.round((b + (255 - b) * hot) * m * (k > FLOOR ? 1 : 0))),
  ];
}

function tile(px, sw, cx, cy, side, color, out, ow, ox, oy, cell) {
  const r = color === null ? 255 : (color >> 16) & 255;
  const g = color === null ? 255 : (color >> 8) & 255;
  const b = color === null ? 255 : color & 255;
  const CELL = cell;

  for (let y = 0; y < CELL; y++) {
    const sy0 = cy + Math.floor((y * side) / CELL);
    const sy1 = Math.max(sy0 + 1, cy + Math.floor(((y + 1) * side) / CELL));
    for (let x = 0; x < CELL; x++) {
      const sx0 = cx + Math.floor((x * side) / CELL);
      const sx1 = Math.max(sx0 + 1, cx + Math.floor(((x + 1) * side) / CELL));

      let sum = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          sum += mask(px, (sy * sw + sx) * 4);
          n++;
        }
      }
      const [cr, cg, cb] = ramp(n ? sum / n : 0, r, g, b);
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

mkdirSync(join(ROOT, "src/assets/fx"), { recursive: true });

const present = new Set(readdirSync(join(ROOT, SRC_DIR)));
const rowsOut = Math.ceil(COUNT / COLS);

for (const job of JOBS) {
  if (only.size && !only.has(job.id)) continue;
  if (!present.has(job.src)) {
    console.log(
      `${job.id.padEnd(10)} skipped — ${SRC_DIR}/${job.src} is not here`,
    );
    continue;
  }

  const source = join(ROOT, SRC_DIR, job.src);
  const out = join(ROOT, job.out || `src/assets/fx/${job.id}-sheet.webp`);
  const cell = job.cell || CELL;
  const cellOut = cell + PAD * 2;

  const info = probe(source);
  const px = decode(source);
  const { cols, rows } = grid(basename(job.src));
  const cw = Math.floor(info.w / cols);
  const ch = Math.floor(info.h / rows);
  const side = Math.min(cw, ch);
  const have = cols * rows;

  const sheetW = cellOut * COLS;
  const sheetH = cellOut * rowsOut;
  const sheet = Buffer.alloc(sheetW * sheetH * 4);
  for (let i = 3; i < sheet.length; i += 4) sheet[i] = 255;

  for (let f = 0; f < COUNT; f++) {
    const s = Math.round((f * (have - 1)) / (COUNT - 1));
    const cx = (s % cols) * cw + ((cw - side) >> 1);
    const cy = Math.floor(s / cols) * ch + ((ch - side) >> 1);
    tile(
      px,
      info.w,
      cx,
      cy,
      side,
      job.color,
      sheet,
      sheetW,
      (f % COLS) * cellOut + PAD,
      Math.floor(f / COLS) * cellOut + PAD,
      cell,
    );
  }

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
    `${job.id.padEnd(10)} ${basename(job.src).padEnd(30)}` +
      ` ${cols}x${rows}=${String(have).padStart(2)} frames -> ${COUNT}` +
      `  ${job.color === null ? "mask  " : "#" + job.color.toString(16).padStart(6, "0")}` +
      `  ${sheetW}x${sheetH}  ${kb(out).padStart(6)} kB`,
  );
}
