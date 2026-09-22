import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `
pack-boss-fx — cut a generated boss beat into the spell sheet the fight reads.

  node tools/pack-boss-fx.mjs <take> [--out <id>] [--from 0] [--to 1]
                              [--floor 18] [--gain 1.15] [--tail 3]
                              [--round] [--contact]

  Reads the PNG frames the local ComfyUI wrote for <take>, samples ten of them
  out of the window, raises the black point, burns the last cells down to black
  and lays them into the 5-wide 224px grid src/art/spells.js slices.

  The model never dies away on its own: --tail is what stops a plate popping
  off the board when its sprite is destroyed.
`;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src/assets/fx");

const FRAMES = join(
  process.env.COMFYUI_OUTPUT ||
    "C:/Users/Yonix/AppData/Local/Comfy-Desktop/ComfyUI-Installs/ComfyUI/ComfyUI/output",
  "bossfx",
);

const COLS = 5;
const COUNT = 10;
const CELL = 224;
const PAD = 2;
const QUALITY = 80;

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));

if (flags.has("--help")) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const opt = (name, fallback) => {
  const at = args.indexOf("--" + name);
  return at >= 0 && args[at + 1] !== undefined ? args[at + 1] : fallback;
};
const numOpt = (name, fallback) => Number(opt(name, fallback));

const named = args.filter(
  (a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"),
);

const take = named[0];
if (!take) {
  process.stderr.write(USAGE);
  process.exit(1);
}

const out = opt("out", take);
const from = numOpt("from", 0);
const to = numOpt("to", 1);
const floor = numOpt("floor", 18);
const gain = numOpt("gain", 1.15);
const tail = numOpt("tail", 3);
const round = flags.has("--round");

const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

function frames(dir) {
  const pngs = readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .sort();
  if (!pngs.length) throw new Error("no frames in " + dir);

  const [w, h] = execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0",
    join(dir, pngs[0]),
  ])
    .toString()
    .trim()
    .split(",")
    .map(Number);

  const start = pngs[0].replace(/\D+/g, "").replace(/^0+/, "") || "0";
  const rgb = execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-start_number",
      start,
      "-i",
      join(dir, "f_%05d_.png"),
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: 1 << 30 },
  );

  return { rgb, w, h, count: pngs.length };
}

function cell(src, w, h, off, fade) {
  const side = Math.min(w, h);
  const cx = ((w - side) / 2) | 0;
  const cy = ((h - side) / 2) | 0;
  const step = side / CELL;

  const buf = Buffer.alloc(CELL * CELL * 4);
  for (let y = 0; y < CELL; y++) {
    const sy0 = cy + Math.floor(y * step);
    const sy1 = Math.min(cy + side, cy + Math.floor((y + 1) * step));
    for (let x = 0; x < CELL; x++) {
      const sx0 = cx + Math.floor(x * step);
      const sx1 = Math.min(cx + side, cx + Math.floor((x + 1) * step));

      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (let sy = sy0; sy < Math.max(sy1, sy0 + 1); sy++) {
        for (let sx = sx0; sx < Math.max(sx1, sx0 + 1); sx++) {
          const s = off + (sy * w + sx) * 3;
          r += src[s];
          g += src[s + 1];
          b += src[s + 2];
          n++;
        }
      }

      let k = fade;
      if (round) {
        const dx = (x - CELL / 2) / (CELL / 2);
        const dy = (y - CELL / 2) / (CELL / 2);
        const d = Math.sqrt(dx * dx + dy * dy);
        k *= d < 0.86 ? 1 : Math.max(0, 1 - (d - 0.86) / 0.3);
      }

      const o = (y * CELL + x) * 4;
      buf[o] = clamp((r / n - floor) * gain * k);
      buf[o + 1] = clamp((g / n - floor) * gain * k);
      buf[o + 2] = clamp((b / n - floor) * gain * k);
      buf[o + 3] = 255;
    }
  }
  return buf;
}

function encode(buf, w, h, file, args) {
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
      ...args,
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 30 },
  );
}

const dir = join(FRAMES, take);
if (!existsSync(dir)) {
  process.stderr.write(
    `no frames for ${take} under ${FRAMES}\n  have: ${
      existsSync(FRAMES) ? readdirSync(FRAMES).join(", ") : "(nothing)"
    }\n`,
  );
  process.exit(1);
}

const { rgb, w, h, count } = frames(dir);
const frameBytes = w * h * 3;
const first = Math.round(from * (count - 1));
const last = Math.round(to * (count - 1));
if (last - first < COUNT - 1) {
  process.stderr.write(
    `window holds ${last - first + 1} frames, need ${COUNT} — widen --from/--to\n`,
  );
  process.exit(1);
}

const pitch = CELL + PAD * 2;
const rows = Math.ceil(COUNT / COLS);
const sheetW = pitch * COLS;
const sheetH = pitch * rows;
const sheet = Buffer.alloc(sheetW * sheetH * 4);
for (let i = 3; i < sheet.length; i += 4) sheet[i] = 255;

for (let f = 0; f < COUNT; f++) {
  const src = first + Math.round((f * (last - first)) / (COUNT - 1));
  const left = COUNT - 1 - f;
  const fade = left < tail ? Math.pow((left + 0.35) / (tail + 0.35), 1.6) : 1;
  const buf = cell(rgb, w, h, src * frameBytes, fade);

  const ox = (f % COLS) * pitch + PAD;
  const oy = Math.floor(f / COLS) * pitch + PAD;
  for (let y = 0; y < CELL; y++) {
    buf.copy(
      sheet,
      ((oy + y) * sheetW + ox) * 4,
      y * CELL * 4,
      (y + 1) * CELL * 4,
    );
  }
}

const dest = join(OUT_DIR, `${out}-sheet.webp`);
encode(sheet, sheetW, sheetH, dest, [
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

console.log(
  `out  ${rel(dest)}  ${sheetW}x${sheetH}  ${(
    statSync(dest).size / 1024
  ).toFixed(
    1,
  )} kB  frames ${first}-${last} of ${count}, floor ${floor}, gain ${gain}, tail ${tail}`,
);

if (flags.has("--contact")) {
  const test = Buffer.alloc(sheetW * sheetH * 4);
  for (let i = 0; i < sheetW * sheetH; i++) {
    test[i * 4] = Math.min(255, 26 + sheet[i * 4]);
    test[i * 4 + 1] = Math.min(255, 18 + sheet[i * 4 + 1]);
    test[i * 4 + 2] = Math.min(255, 30 + sheet[i * 4 + 2]);
    test[i * 4 + 3] = 255;
  }
  const contact = join(OUT_DIR, `${out}-contact.png`);
  encode(test, sheetW, sheetH, contact, []);
  console.log(`     ${rel(contact)}  (scratch — delete before committing)`);
}
