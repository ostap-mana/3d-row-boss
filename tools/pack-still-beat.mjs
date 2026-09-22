import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `
pack-still-beat — turn one painted VFX still into a ten-frame boss plate.

  node tools/pack-still-beat.mjs --src <png> --out <webp> [options]

  A single painted burst on black is already the whole look; what it has not got
  is a beat. This blows it open and burns it down: every frame is the same art
  pushed a little wider, its core cooling from white through gold to deep red,
  its gain falling away, and the last frames eaten from the middle outward so the
  fire tears into islands instead of shrinking as one lump. The centre stays open
  the whole way, which is what lets a match-3 board read through the hit.

  --grow g      how much wider the last frame sits. Default 0.5.
  --floor n     black point lifted off the source. Default 14.
  --gain g      overall brightness. Default 1.12.
  --hold h      how far into the beat the plate holds full power. Default 0.28.
  --cool c      how hard the late frames drop toward red. Default 0.75.
  --eat e       how much of the middle the late frames lose. Default 0.55.
  --cell N      cell side in the packed sheet. Default 320.
  --strip       also write the sheet as a PNG to look at.
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

const SRC = resolve(ROOT, arg("--src", ""));
const OUT = resolve(ROOT, arg("--out", "src/assets/fx/magma-sheet.webp"));
const STRIP = args.includes("--strip");

const COLS = 5;
const COUNT = 10;
const CELL = num("--cell", 320);
const PAD = 2;
const QUALITY = 82;

const GROW = num("--grow", 0.5);
const FLOOR = num("--floor", 14);
const GAIN = num("--gain", 1.12);
const HOLD = num("--hold", 0.28);
const COOL = num("--cool", 0.75);
const EAT = num("--eat", 0.55);

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
  process.stderr.write(`pack-still-beat: no source at ${SRC}\n`);
  process.exit(1);
}

const info = probe(SRC);
const px = decode(SRC);
const side = Math.min(info.w, info.h);
const ox = ((info.w - side) / 2) | 0;
const oy = ((info.h - side) / 2) | 0;

const pitch = CELL + PAD * 2;
const rows = Math.ceil(COUNT / COLS);
const sheetW = pitch * COLS;
const sheetH = pitch * rows;
const sheet = Buffer.alloc(sheetW * sheetH * 4);
for (let i = 3; i < sheet.length; i += 4) sheet[i] = 255;

for (let f = 0; f < COUNT; f++) {
  const t = f / (COUNT - 1);
  const late = clamp01((t - HOLD) / (1 - HOLD));

  const spread = 1 + GROW * late;
  const gain = GAIN * (1 - late * late * 0.92);
  const cool = 1 - COOL * late;
  const hollow = EAT * late;

  const step = side / (CELL * spread);
  const half = CELL / 2;

  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const sx = ox + side / 2 + (x - half) * step;
      const sy = oy + side / 2 + (y - half) * step;

      let r = 0;
      let g = 0;
      let b = 0;
      if (sx >= 0 && sy >= 0 && sx < info.w && sy < info.h) {
        const s = ((sy | 0) * info.w + (sx | 0)) * 3;
        r = px[s];
        g = px[s + 1];
        b = px[s + 2];
      }

      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const d = Math.sqrt(dx * dx + dy * dy);
      const eaten = hollow > 0 ? clamp01((d - hollow * 0.9) / 0.35) : 1;
      const k = gain * eaten;

      const at =
        ((Math.floor(f / COLS) * pitch + PAD + y) * sheetW +
          (f % COLS) * pitch +
          PAD +
          x) *
        4;

      const lit = Math.max(r, g, b) > FLOOR;
      if (!lit) continue;

      sheet[at] = clamp((r - FLOOR) * k);
      sheet[at + 1] = clamp((g - FLOOR) * k * (0.5 + cool * 0.5));
      sheet[at + 2] = clamp((b - FLOOR) * k * cool);
    }
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

process.stdout.write(
  `still ${basename(SRC)} -> ${COUNT} frames  ${sheetW}x${sheetH}  ` +
    `${(statSync(OUT).size / 1024).toFixed(1)} kB  grow ${GROW}, cool ${COOL}, eat ${EAT}\n`,
);
