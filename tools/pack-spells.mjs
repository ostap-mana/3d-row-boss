import { execFileSync } from "node:child_process";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLIPS = join(ROOT, "src/source/fx/clips");
const OUT_DIR = join(ROOT, "src/assets/fx");

export const COLS = 5;
export const COUNT = 10;

const CELL = 224;

const PAD = 2;

const FLOOR = 16;

const QUALITY = 80;

const DEFAULT_WINDOW = { start: 0.6, span: 1.6, gain: 1 };

const WINDOWS = {
  water: { start: 0.6, span: 1.7 },
  nature: { start: 0.6, span: 1.7 },
  lightning: { start: 0.5, span: 1.5 },
  wind: { start: 0.6, span: 1.7 },
  arcane: { start: 0.6, span: 1.7 },
  breath: { start: 0.7, span: 1.8 },
  slam: { start: 0.5, span: 1.5 },
  claw: { start: 0.5, span: 1.5 },
};

const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");

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

function decodeWindow(file, start, span) {
  return execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      String(start),
      "-t",
      String(span),
      "-i",
      file,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-",
    ],
    { maxBuffer: 1 << 29 },
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
      w + "x" + h,
      "-i",
      "pipe:0",
      ...(args || []),
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 29 },
  );
}

function pack(id, file, opts) {
  const win = { ...DEFAULT_WINDOW, ...(WINDOWS[id] || {}), ...opts };
  const info = probe(file);
  const px = decodeWindow(file, win.start, win.span);

  const frameBytes = info.w * info.h * 4;
  const have = Math.floor(px.length / frameBytes);
  if (have < COUNT) {
    throw new Error(
      "window holds " + have + " frames, need " + COUNT + " (widen --span)",
    );
  }

  const side = Math.min(info.w, info.h);
  const cx = ((info.w - side) / 2) | 0;
  const cy = ((info.h - side) / 2) | 0;

  const cell = CELL + PAD * 2;
  const rows = Math.ceil(COUNT / COLS);
  const sheetW = cell * COLS;
  const sheetH = cell * rows;
  const out = Buffer.alloc(sheetW * sheetH * 4);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;

  for (let f = 0; f < COUNT; f++) {
    const src = Math.round((f * (have - 1)) / (COUNT - 1));
    const base = src * frameBytes;
    const ox = (f % COLS) * cell + PAD;
    const oy = Math.floor(f / COLS) * cell + PAD;

    for (let y = 0; y < CELL; y++) {
      const sy0 = cy + Math.floor((y * side) / CELL);
      const sy1 = Math.min(cy + side, cy + Math.floor(((y + 1) * side) / CELL));
      for (let x = 0; x < CELL; x++) {
        const sx0 = cx + Math.floor((x * side) / CELL);
        const sx1 = Math.min(
          cx + side,
          cx + Math.floor(((x + 1) * side) / CELL),
        );
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let sy = sy0; sy < Math.max(sy1, sy0 + 1); sy++) {
          for (let sx = sx0; sx < Math.max(sx1, sx0 + 1); sx++) {
            const s = base + (sy * info.w + sx) * 4;
            r += px[s];
            g += px[s + 1];
            b += px[s + 2];
            n++;
          }
        }
        const dst = ((oy + y) * sheetW + ox + x) * 4;
        out[dst] = clamp((r / n - FLOOR) * win.gain);
        out[dst + 1] = clamp((g / n - FLOOR) * win.gain);
        out[dst + 2] = clamp((b / n - FLOOR) * win.gain);
      }
    }
  }

  return { out, sheetW, sheetH, cell, have, win };
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));

const opts = {};
for (const key of ["start", "span", "gain"]) {
  const at = args.indexOf("--" + key);
  if (at >= 0 && args[at + 1]) opts[key] = Number(args[at + 1]);
}
const named = args.filter(
  (a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"),
);

if (!existsSync(CLIPS)) {
  console.error(
    "no clips at " + rel(CLIPS) + " — run tools/gen-spells.mjs first.",
  );
  process.exit(1);
}

const onDisk = readdirSync(CLIPS)
  .filter((f) => f.endsWith(".mp4"))
  .map((f) => f.slice(0, -4));

const unknown = named.filter((n) => !onDisk.includes(n));
if (unknown.length) {
  console.error(
    "no clip for: " +
      unknown.join(", ") +
      "\n  on disk: " +
      (onDisk.join(", ") || "(nothing)"),
  );
  process.exit(1);
}

const wanted = named.length ? named : onDisk;
if (!wanted.length) {
  console.error("no clips at " + rel(CLIPS) + " — run tools/gen-spells.mjs.");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
console.log(
  "grid   " + COUNT + " frames, " + COLS + " cols, cell " + CELL + "px\n",
);

let total = 0;
for (const id of wanted) {
  const file = join(CLIPS, id + ".mp4");
  try {
    const { out, sheetW, sheetH, have, win } = pack(id, file, opts);
    const dest = join(OUT_DIR, id + "-sheet.webp");

    encode(out, sheetW, sheetH, dest, [
      "-c:v",
      "libwebp",
      "-lossless",
      "0",
      "-quality",
      String(QUALITY),
      "-compression_level",
      "6",
      "-preset",
      "picture",
      "-pix_fmt",
      "yuv420p",
    ]);
    const kb = statSync(dest).size / 1024;
    total += kb;
    console.log(
      "out  " +
        id.padEnd(10) +
        rel(dest).padEnd(34) +
        kb.toFixed(1) +
        " kB   " +
        sheetW +
        "x" +
        sheetH +
        "   " +
        win.start +
        "s +" +
        win.span +
        "s of " +
        have +
        " frames",
    );

    if (flags.has("--contact")) {
      const test = Buffer.alloc(sheetW * sheetH * 4);
      for (let i = 0; i < sheetW * sheetH; i++) {
        test[i * 4] = 26;
        test[i * 4 + 1] = 18;
        test[i * 4 + 2] = 30;
        test[i * 4 + 3] = 255;
        for (let c = 0; c < 3; c++) {
          test[i * 4 + c] = Math.min(255, test[i * 4 + c] + out[i * 4 + c]);
        }
      }
      const contact = join(OUT_DIR, id + "-contact.png");
      encode(test, sheetW, sheetH, contact, []);
      console.log("     " + rel(contact));
    }
  } catch (err) {
    console.log("FAIL " + id.padEnd(10) + err.message);
  }
}

console.log("\n     " + total.toFixed(1) + " kB of sheets in total");
if (flags.has("--contact")) {
  console.log(
    "     contact sheets are scratch — delete them before committing.",
  );
}
