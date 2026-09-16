import { execFileSync } from "node:child_process";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, statSync } from "node:fs";

const USAGE = `
pack-claw — the boss's claw rake, painted on white, onto the spell grid.

  node tools/pack-claw.mjs [options]

  --start <s>     where the usable effect begins in the clip. Default 0.
  --span <s>      how long a slice to take. Default 2.6.
  --solid <n>     how hard the matte is pushed towards opaque, 1 is the raw
                  distance from the backdrop. Default 1.12.
  --violet        leave the paint the violet it arrived as. Without it the
                  blue-to-magenta band is folded onto the crimson the rake beat
                  already throws, and the gold rims and the cyan fire are left
                  alone.
  --quality <n>   webp quality. Default 80.
  --contact       also write a PNG of the sheet over the arena's own ground,
                  which is the only way to see what the matte actually did.

  Reads src/source/fx/clips/claw.mp4, writes src/assets/fx/claw-sheet.webp,
  on the same grid tools/pack-spells.mjs packs every other sheet to: ten frames,
  five to a row, a 224px cell with 2px of slack. Those four numbers are copied
  here rather than imported, because importing that file runs it.

  The clip is ink on a white page, and the sheet is light on black with no
  alpha, like every other sheet art/spells.js plays. The matte is the distance
  from that page; what it leaves is the paint already multiplied by its own
  cover, which on the add blend is the same picture over a dark arena and costs
  no alpha plane to store.
`;

const args = process.argv.slice(2);
if (args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : Number(args[i + 1]);
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "src/source/fx/clips/claw.mp4");
const OUT_DIR = join(ROOT, "src/assets/fx");
const OUT = join(OUT_DIR, "claw-sheet.webp");

const START = flag("start", 0);
const SPAN = flag("span", 2.6);
const SOLID = flag("solid", 1.12);
const QUALITY = flag("quality", 80);
const VIOLET = args.includes("--violet");

const COLS = 5;
const COUNT = 10;
const CELL = 224;
const PAD = 2;

const BAND = [200, 340];
const CRIMSON = 350;
const SQUEEZE = 0.35;
const GROUND = [26, 18, 30];

const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");
const kb = (n) => (n / 1024).toFixed(1);
const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

if (!existsSync(SRC)) {
  process.stderr.write(`no clip at ${rel(SRC)}\n`);
  process.exit(1);
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
  const [w, h] = out.split("x").map(Number);
  return { w, h };
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
    { input: buf, maxBuffer: 1 << 29 },
  );
}

function backdrop(px, w, h) {
  const read = [
    [2, 2],
    [w - 3, 2],
    [2, h - 3],
    [w - 3, h - 3],
  ].map(([x, y]) => {
    const i = (y * w + x) * 4;
    return Math.min(px[i], px[i + 1], px[i + 2]);
  });
  read.sort((a, b) => a - b);
  return (read[1] + read[2]) / 2;
}

function toCrimson(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (d < 8) return null;

  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  if (h < BAND[0] || h > BAND[1]) return null;

  let turned = CRIMSON + (h - 275) * SQUEEZE;
  turned = ((turned % 360) + 360) % 360;

  const c = d / 255;
  const x = c * (1 - Math.abs(((turned / 60) % 2) - 1));
  const m = min / 255;
  const lit = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][Math.floor(turned / 60) % 6];
  return [(lit[0] + m) * 255, (lit[1] + m) * 255, (lit[2] + m) * 255];
}

const info = probe(SRC);
const px = decodeWindow(SRC, START, SPAN);
const frameBytes = info.w * info.h * 4;
const have = Math.floor(px.length / frameBytes);
if (have < COUNT) {
  process.stderr.write(`window holds ${have} frames, need ${COUNT}\n`);
  process.exit(1);
}

const base = backdrop(px, info.w, info.h);

const band = Math.round((CELL * info.h) / info.w);
const top = Math.round((CELL - band) / 2);
const pitch = CELL + PAD * 2;
const rows = Math.ceil(COUNT / COLS);
const sheetW = pitch * COLS;
const sheetH = pitch * rows;
const sheet = Buffer.alloc(sheetW * sheetH * 4);
for (let i = 3; i < sheet.length; i += 4) sheet[i] = 255;

const kx = info.w / CELL;
const ky = info.h / band;

for (let f = 0; f < COUNT; f++) {
  const src = Math.round((f * (have - 1)) / (COUNT - 1)) * frameBytes;
  const ox = (f % COLS) * pitch + PAD;
  const oy = Math.floor(f / COLS) * pitch + PAD + top;

  for (let y = 0; y < band; y++) {
    const sy0 = Math.floor(y * ky);
    const sy1 = Math.min(info.h, Math.floor((y + 1) * ky));
    for (let x = 0; x < CELL; x++) {
      const sx0 = Math.floor(x * kx);
      const sx1 = Math.min(info.w, Math.floor((x + 1) * kx));

      let pr = 0;
      let pg = 0;
      let pb = 0;
      let pa = 0;
      let n = 0;

      for (let sy = sy0; sy < Math.max(sy1, sy0 + 1); sy++) {
        for (let sx = sx0; sx < Math.max(sx1, sx0 + 1); sx++) {
          const s = src + (sy * info.w + sx) * 4;
          const ink = base - Math.min(px[s], px[s + 1], px[s + 2]);
          const a = Math.max(0, Math.min(1, (ink / base) * SOLID));
          const lift = base * (1 - a);
          pr += px[s] - lift;
          pg += px[s + 1] - lift;
          pb += px[s + 2] - lift;
          pa += a;
          n++;
        }
      }

      const cover = pa / n;
      let paint = [pr / pa, pg / pa, pb / pa];
      if (!VIOLET && pa > 0) {
        paint = toCrimson(paint[0], paint[1], paint[2]) || paint;
      }

      const dst = ((oy + y) * sheetW + ox + x) * 4;
      sheet[dst] = pa > 0 ? clamp8(paint[0] * cover) : 0;
      sheet[dst + 1] = pa > 0 ? clamp8(paint[1] * cover) : 0;
      sheet[dst + 2] = pa > 0 ? clamp8(paint[2] * cover) : 0;
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
  "picture",
  "-pix_fmt",
  "yuv420p",
]);

process.stdout.write(
  `in   ${rel(SRC)}  ${info.w}x${info.h}  ${START}s +${SPAN}s of ${have} frames\n` +
    `     backdrop ${base}, matte x${SOLID}, ` +
    `${VIOLET ? "violet as painted" : "folded onto crimson"}\n` +
    `     ${CELL}px cell, ${band}px of art in it\n` +
    `out  ${rel(OUT)}  ${sheetW}x${sheetH}  ${kb(statSync(OUT).size)} kB\n`,
);

if (args.includes("--contact")) {
  const proof = Buffer.alloc(sheetW * sheetH * 4);
  for (let i = 0; i < sheetW * sheetH; i++) {
    for (let c = 0; c < 3; c++) {
      proof[i * 4 + c] = Math.min(255, GROUND[c] + sheet[i * 4 + c]);
    }
    proof[i * 4 + 3] = 255;
  }
  const file = join(OUT_DIR, "claw-contact.png");
  encode(proof, sheetW, sheetH, file, []);
  process.stdout.write(`     ${rel(file)} — scratch, delete it\n`);
}
