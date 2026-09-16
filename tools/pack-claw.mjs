import { execFileSync } from "node:child_process";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, statSync } from "node:fs";

const USAGE = `
pack-claw — the boss's claw rake clip onto its own flipbook grid.

  node tools/pack-claw.mjs [options]

  --at <s,s,...>  source timestamps to keep, in seconds. Default is the swing:
                  six frames of the gashes tearing open at the clip's own 24fps,
                  four of the gold-and-cyan flare washing through, two of it
                  burning down. The clip holds still either side of the flare
                  and neither hold is sampled — vfx.claw sits on a frame for as
                  long as it wants instead, which costs nothing. The tear is the
                  only part sampled at full rate, because it is the only part
                  that moves fast enough to strobe; every frame dropped
                  elsewhere is spent on the size of the ones that are kept.
  --cell <px>     width of one cell. The height follows the crop's aspect, so
                  nothing is letterboxed. Default 640, which is about half the
                  device pixels this is drawn across on a 2x phone. It used to
                  be 300, which was a three-and-a-half times upscale on screen
                  and looked exactly as soft as that sounds.
  --cols <n>      columns in the grid. Default 4.
  --spread <n>    how many pixels the paint is pushed out past its own matte,
                  into the part of the cell nothing is drawn on. Nothing there
                  is ever seen — the alpha is zero — but the colour still has to
                  go somewhere, and if it goes to black then 4:2:0 chroma drags
                  that black back in under every soft edge as a dark fringe.
                  Default 12.
  --solid <n>     how hard the matte is pushed towards opaque, 1 is the raw
                  distance from the page. Default 1.45.
  --gain <n>      multiplies the recovered paint. Above 1 the gold rims and the
                  cyan clip hot while the dark bodies of the gashes barely
                  move, which is the point. Default 1.18.
  --bleed <n>     fraction of the crop kept as margin around the ink. Default
                  0.04.
  --floor <n>     how solid a pixel must be to count as ink when the crop is
                  measured, 0 to 1. Well above zero on purpose: the page is not
                  perfectly white and its grain answers any honest matte, so a
                  low floor returns the whole frame. Default 0.45.
  --crimson       fold the blue-to-magenta band onto the 0xff3a5a the rest of
                  the beat throws. Without it the paint stays the violet and
                  gold it arrived as, which is what the clip is.
  --quality <n>   webp quality. Default 86.
  --contact       also write a PNG of the sheet over the arena's own ground,
                  which is the only way to see what the matte actually did.

  Reads src/source/fx/clips/claw.mp4, writes src/assets/fx/claw-rake.webp on
  the grid src/art/rake.js cuts, and prints that grid so it can be pasted back.

  The clip is paint on a white page: three gashes whose bodies are near-black
  violet and whose rims are hot gold, with cyan washing through the middle of
  the beat. The drawing plays on the normal blend and carries a matte, because
  those bodies are darker than the arena behind them and an additive sheet can
  only ever brighten — played as light on black the drawing lost every dark it
  had and arrived as a pale smear. The matte is the distance from the page,
  lifted where the colour is saturated enough to be paint whatever its
  luminance says. vfx.claw lays a second copy on add over the top, which finds
  only the gold and the cyan because the dark bodies have nothing to give.

  The matte is not an alpha plane. It is a second grid of the same cells in
  grey, stacked under the colour in one image that has no alpha at all, and
  art/rake.js puts the two back together on a canvas at load. libwebp writes an
  alpha plane losslessly whatever --quality says, so on a sheet like this one
  it costs more than the picture it mattes; carrying it as grey instead makes
  the whole file lossy and buys back roughly double the resolution for the same
  bytes, which on a flipbook stretched across a phone is the only thing that
  actually shows. Grey also lands in luma, which 4:2:0 keeps at full rate — the
  matte comes back sharper this way than the colour it cuts.

  The crop is the union of every kept frame's ink. On this clip that is almost
  the whole page — the drawing fills its frame — so the crop buys nothing here
  and only trims the margin. It stays because the next clip may not be drawn
  that way.
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
  0, 0.042, 0.084, 0.125, 0.167, 0.209, 1.04, 1.21, 1.38, 1.58, 1.9, 2.2,
];

const at = (() => {
  const i = args.indexOf("--at");
  if (i === -1) return SWING;
  return args[i + 1]
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
})();

const CELL_W = flag("cell", 640);
const COLS = flag("cols", 4);
const SOLID = flag("solid", 1.45);
const GAIN = flag("gain", 1.18);
const BLEED = flag("bleed", 0.04);
const FLOOR = flag("floor", 0.45);
const QUALITY = flag("quality", 86);
const SPREAD = flag("spread", 12);
const CRIMSON_FOLD = args.includes("--crimson");
const PAD = 2;

const PROBE_W = 320;
const SAT_LIFT = 0.9;
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
const even = (n) => n - (n % 2);

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

function frameAt(file, t, w, h, crop) {
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
      `${crop ? `crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},` : ""}scale=${w}:${h}:flags=area`,
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

function coverOf(r, g, b, base) {
  const min = Math.min(r, g, b);
  const max = Math.max(r, g, b);
  const ink = (base - min) / base;
  const sat = max > 0 ? ((max - min) / max) * SAT_LIFT : 0;
  return Math.max(0, Math.min(1, Math.max(ink, sat) * SOLID));
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
const probeH = Math.round((PROBE_W * info.h) / info.w);

const bases = [];
let x0 = PROBE_W;
let y0 = probeH;
let x1 = -1;
let y1 = -1;

for (let f = 0; f < at.length; f++) {
  const px = frameAt(SRC, at[f], PROBE_W, probeH);
  if (px.length < PROBE_W * probeH * 4) {
    process.stderr.write(`no frame at ${at[f]}s\n`);
    process.exit(1);
  }
  const base = page(px, PROBE_W, probeH);
  bases.push(base);
  for (let y = 0; y < probeH; y++) {
    for (let x = 0; x < PROBE_W; x++) {
      const s = (y * PROBE_W + x) * 4;
      if (coverOf(px[s], px[s + 1], px[s + 2], base) < FLOOR) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
}

if (x1 < 0) {
  process.stderr.write("the kept frames are all page — nothing to pack\n");
  process.exit(1);
}

const scale = info.w / PROBE_W;
const margin = Math.round((x1 - x0 + 1) * BLEED * scale);
const cropX = Math.max(0, Math.round(x0 * scale) - margin);
const cropY = Math.max(0, Math.round(y0 * scale) - margin);
const crop = {
  x: even(cropX),
  y: even(cropY),
  w: even(
    Math.min(info.w - cropX, Math.round((x1 - x0 + 1) * scale) + margin * 2),
  ),
  h: even(
    Math.min(info.h - cropY, Math.round((y1 - y0 + 1) * scale) + margin * 2),
  ),
};

const cellH = Math.round((CELL_W * crop.h) / crop.w);
const rows = Math.ceil(at.length / COLS);
const sheetW = PAD + COLS * (CELL_W + PAD);
const block = PAD + rows * (cellH + PAD);
const sheetH = block * 2;
const sheet = Buffer.alloc(sheetW * sheetH * 4);
for (let i = 3; i < sheet.length; i += 4) sheet[i] = 255;

const paintedAt = new Uint8Array(sheetW * block);

for (let f = 0; f < at.length; f++) {
  const px = frameAt(SRC, at[f], CELL_W, cellH, crop);
  if (px.length < CELL_W * cellH * 4) {
    process.stderr.write(`no frame at ${at[f]}s\n`);
    process.exit(1);
  }
  const base = bases[f];
  const ox = PAD + (f % COLS) * (CELL_W + PAD);
  const oy = PAD + Math.floor(f / COLS) * (cellH + PAD);

  for (let y = 0; y < cellH; y++) {
    for (let x = 0; x < CELL_W; x++) {
      const s = (y * CELL_W + x) * 4;
      const cover = coverOf(px[s], px[s + 1], px[s + 2], base);
      const at2 = (oy + y) * sheetW + ox + x;
      const dst = at2 * 4;
      const matte = (at2 + block * sheetW) * 4;

      const grey = clamp8(cover * 255);
      sheet[matte] = grey;
      sheet[matte + 1] = grey;
      sheet[matte + 2] = grey;
      if (cover <= 0) continue;

      const lift = base * (1 - cover);
      let paint = [
        (px[s] - lift) / cover,
        (px[s + 1] - lift) / cover,
        (px[s + 2] - lift) / cover,
      ];
      if (CRIMSON_FOLD) {
        paint = toCrimson(paint[0], paint[1], paint[2]) || paint;
      }

      sheet[dst] = clamp8(paint[0] * GAIN);
      sheet[dst + 1] = clamp8(paint[1] * GAIN);
      sheet[dst + 2] = clamp8(paint[2] * GAIN);
      paintedAt[at2] = 1;
    }
  }
}

for (let pass = 0; pass < SPREAD; pass++) {
  const grown = [];
  for (let y = 0; y < block; y++) {
    for (let x = 0; x < sheetW; x++) {
      const i = y * sheetW + x;
      if (paintedAt[i]) continue;
      let r = 0;
      let g = 0;
      let b = 0;
      let n = 0;
      for (const [dx, dy] of [
        [-1, 0],
        [1, 0],
        [0, -1],
        [0, 1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= sheetW || ny >= block) continue;
        const j = ny * sheetW + nx;
        if (paintedAt[j] !== 1) continue;
        r += sheet[j * 4];
        g += sheet[j * 4 + 1];
        b += sheet[j * 4 + 2];
        n++;
      }
      if (!n) continue;
      grown.push(i, r / n, g / n, b / n);
    }
  }
  if (!grown.length) break;
  for (let k = 0; k < grown.length; k += 4) {
    const i = grown[k];
    sheet[i * 4] = clamp8(grown[k + 1]);
    sheet[i * 4 + 1] = clamp8(grown[k + 2]);
    sheet[i * 4 + 2] = clamp8(grown[k + 3]);
    paintedAt[i] = 2;
  }
  for (let i = 0; i < paintedAt.length; i++)
    if (paintedAt[i] === 2) paintedAt[i] = 1;
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
    `     crop ${crop.w}x${crop.h} at ${crop.x},${crop.y} — ` +
    `${((crop.w * crop.h * 100) / (info.w * info.h)) | 0}% of the page\n` +
    `     matte x${SOLID}, paint x${GAIN}, ` +
    `${CRIMSON_FOLD ? "folded onto crimson" : "violet as painted"}\n` +
    `out  ${rel(OUT)}  ${sheetW}x${sheetH}  ${kb(statSync(OUT).size)} kB ` +
    `(colour over matte)\n` +
    `     src/art/rake.js grid: ` +
    `{ cols: ${COLS}, cellW: ${CELL_W}, cellH: ${cellH}, pad: ${PAD}, ` +
    `count: ${at.length}, block: ${block} }\n`,
);

if (args.includes("--contact")) {
  const proof = Buffer.alloc(sheetW * block * 4);
  for (let i = 0; i < sheetW * block; i++) {
    const a = sheet[(i + block * sheetW) * 4] / 255;
    for (let c = 0; c < 3; c++) {
      proof[i * 4 + c] = clamp8(GROUND[c] * (1 - a) + sheet[i * 4 + c] * a);
    }
    proof[i * 4 + 3] = 255;
  }
  const file = join(OUT_DIR, "claw-contact.png");
  encode(proof, sheetW, block, file, []);
  process.stdout.write(`     ${rel(file)} — scratch, delete it\n`);
}
