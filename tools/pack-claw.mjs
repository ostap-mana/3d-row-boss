import { execFileSync } from "node:child_process";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, statSync } from "node:fs";

const USAGE = `
pack-claw — the boss's claw rake clip onto its own flipbook grid.

  node tools/pack-claw.mjs [options]

  --at <s,s,...>  source timestamps to keep, in seconds. Default is the swing:
                  four frames of the gashes tearing open at the clip's own
                  24fps, six of the flare, two of it burning down. The clip
                  holds still for three quarters of a second between the tear
                  and the flare and that hold is never sampled — the beat this
                  plays on is half a second long.
  --cell <px>     width of one cell. The height follows the clip's aspect, so
                  nothing is letterboxed. Default 384.
  --cols <n>      columns in the grid. Default 4.
  --solid <n>     how hard the matte is pushed towards opaque, 1 is the raw
                  distance from the page. Default 1.12.
  --crimson       fold the blue-to-magenta band onto the 0xff3a5a the rest of
                  the beat throws. Without it the paint stays the violet and
                  gold it arrived as, which is what the clip is.
  --quality <n>   webp quality. Default 82.
  --contact       also write a PNG of the sheet over the arena's own ground,
                  which is the only way to see what the matte actually did.

  Reads src/source/fx/clips/claw.mp4, writes src/assets/fx/claw-rake.webp on
  the grid src/art/rake.js cuts — its own, not the square one every spell sheet
  shares, because this drawing is 16:9 and a square cell spends half of itself
  on empty page.

  The clip is ink on a white page, and the sheet is light on black with no
  alpha, like every sheet the add blend plays. The matte is the distance from
  that page; what it leaves is the paint already multiplied by its own cover,
  which on that blend is the same picture over a dark arena and costs no alpha
  plane to store — libwebp writes alpha losslessly, so the plane would cost
  more than the picture.
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
const OUT = join(OUT_DIR, "claw-rake.webp");

const SWING = [
  0, 0.042, 0.084, 0.125, 1.1, 1.23, 1.35, 1.48, 1.6, 1.73, 1.98, 2.4,
];

const at = (() => {
  const i = args.indexOf("--at");
  if (i === -1) return SWING;
  return args[i + 1]
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
})();

const CELL_W = flag("cell", 384);
const COLS = flag("cols", 4);
const SOLID = flag("solid", 1.12);
const QUALITY = flag("quality", 82);
const CRIMSON_FOLD = args.includes("--crimson");
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

function frameAt(file, t, w, h) {
  return execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      String(t),
      "-i",
      file,
      "-frames:v",
      "1",
      "-vf",
      `scale=${w}:${h}:flags=area`,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-",
    ],
    { maxBuffer: 1 << 28 },
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

function page(px, w, h) {
  const edge = [];
  for (let x = 0; x < w; x++) {
    for (const y of [0, h - 1]) {
      const i = (y * w + x) * 4;
      edge.push(Math.min(px[i], px[i + 1], px[i + 2]));
    }
  }
  for (let y = 0; y < h; y++) {
    for (const x of [0, w - 1]) {
      const i = (y * w + x) * 4;
      edge.push(Math.min(px[i], px[i + 1], px[i + 2]));
    }
  }
  edge.sort((a, b) => a - b);
  return edge[edge.length >> 1];
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
const cellH = Math.round((CELL_W * info.h) / info.w);
const rows = Math.ceil(at.length / COLS);
const sheetW = PAD + COLS * (CELL_W + PAD);
const sheetH = PAD + rows * (cellH + PAD);
const sheet = Buffer.alloc(sheetW * sheetH * 4);
for (let i = 3; i < sheet.length; i += 4) sheet[i] = 255;

for (let f = 0; f < at.length; f++) {
  const px = frameAt(SRC, at[f], CELL_W, cellH);
  if (px.length < CELL_W * cellH * 4) {
    process.stderr.write(`no frame at ${at[f]}s\n`);
    process.exit(1);
  }
  const base = page(px, CELL_W, cellH);
  const ox = PAD + (f % COLS) * (CELL_W + PAD);
  const oy = PAD + Math.floor(f / COLS) * (cellH + PAD);

  for (let y = 0; y < cellH; y++) {
    for (let x = 0; x < CELL_W; x++) {
      const s = (y * CELL_W + x) * 4;
      const ink = base - Math.min(px[s], px[s + 1], px[s + 2]);
      const cover = Math.max(0, Math.min(1, (ink / base) * SOLID));
      const lift = base * (1 - cover);

      let paint = [px[s] - lift, px[s + 1] - lift, px[s + 2] - lift];
      if (cover > 0) {
        paint = paint.map((v) => v / cover);
        if (CRIMSON_FOLD) {
          paint = toCrimson(paint[0], paint[1], paint[2]) || paint;
        }
      }

      const dst = ((oy + y) * sheetW + ox + x) * 4;
      sheet[dst] = cover > 0 ? clamp8(paint[0] * cover) : 0;
      sheet[dst + 1] = cover > 0 ? clamp8(paint[1] * cover) : 0;
      sheet[dst + 2] = cover > 0 ? clamp8(paint[2] * cover) : 0;
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
  `in   ${rel(SRC)}  ${info.w}x${info.h}  ${at.length} frames: ${at.join(", ")}\n` +
    `     matte x${SOLID}, ` +
    `${CRIMSON_FOLD ? "folded onto crimson" : "violet as painted"}\n` +
    `     ${CELL_W}x${cellH} cell, ${COLS}x${rows} grid\n` +
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
