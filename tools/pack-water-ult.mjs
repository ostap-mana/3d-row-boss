import { execFileSync } from "node:child_process";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, statSync } from "node:fs";

const USAGE = `
pack-water-ult — Arissa's ABYSSAL TIDE, cut from two green-screen clips.

  node tools/pack-water-ult.mjs [options]

  --flight <file>   clip the travelling comet comes from.
  --blast <file>    clip the impact and the bloom come from.
  --flight-at <n,>  source frame numbers for cells 0..4. Five of them.
  --blast-at <n,>   source frame numbers for cells 5..9. Five of them.
  --flight-crop <w:h:x:y>   square taken out of the flight clip.
  --blast-crop <w:h:x:y>    square taken out of the blast clip.
  --cut <n>         greenness at which the backdrop starts, 0..1. Default 0.02.
  --ramp <n>        how far past that it takes to become solid. Default 0.07.
  --despill <n>     how hard green is pulled back out of what survives, 0..1.
                    Default 1.
  --lift <n>        how much green a survivor is still allowed over its own red
                    and blue. Water is legitimately teal, so this cannot go
                    negative without draining the effect; it is what separates
                    teal from the olive the backdrop leaves behind in anything
                    half transparent. Default 0.
  --floor <n>       levels subtracted from every channel afterwards, to put the
                    key's leftovers on zero rather than on a grey wash.
                    Default 18.
  --gain <n>        multiplies what is left. Default 1.
  --flight-pad <px> black added to the left of the flight clip before it is
                    cropped, so the comet's head is not sitting on the cell
                    edge. Default 90.
  --feather <px>    how far in from each cell edge a FLIGHT frame is ramped to
                    black, in cell pixels. The comet is four times longer than
                    the cell is wide, so a square crop always cuts it somewhere;
                    on the add blend that cut is a lit rectangle with a hard
                    edge, and this is what turns it back into a tail.
                    Default 54.
  --blast-pad <px>  black added on all four sides of the blast clip before it is
                    cropped. The bloom opens to the full height of its frame, so
                    it is given room rather than a ramp: feathering a blast wide
                    enough to matter takes the tips off its own petals.
                    Default 90.
  --blast-feather <px>  the same ramp on the blast cells, only wide enough to
                    take a hard edge off. Default 14.
  --cell <px>       pixels behind one square cell. Default 448, twice what
                    tools/pack-spells.mjs cuts. src/art/spells.js measures the
                    pitch off the image, so this is free to differ from the
                    other eight sheets and only this one pays for it.
  --quality <n>     webp quality. Default 82.
  --out <file>      default src/assets/fx/water-sheet.webp
  --contact         also write a PNG of the sheet, which is the only way to see
                    what the key actually did.

  Two clips because neither one is the whole ultimate. The spell grid in
  src/art/spells.js is ten frames and splits down the middle: 0..4 are the bolt
  in flight, 5..9 are it landing, and the same player drives every mage sheet.
  The comet clip is a loop with no impact in it at all, and the clip that does
  have the impact carries a softer comet, so the halves are cut from the one
  that is better at each.

  The shape is the one tools/pack-spells.mjs enforces and src/art/spells.js
  relies on: five columns, ten frames, square cells. The resolution is not — that
  module reads the pitch off each image — and this sheet is packed at twice the
  228 the other eight carry. It earns it: a mage blast goes on at
  size * ULT_FX.blastScale, most of a phone screen, and off a 224px cell that is
  about eight times up. At that ratio the webp's own blocking in the dark of a
  fading frame arrives as squares of light, because the add blend has nothing to
  hide them behind.

  No alpha — these play on the add blend, where black already is transparency,
  so the key composites onto black and the sheet ships as flat RGB.

  Both cells are square and the game draws them square, without turning them to
  face the path, so the flight crop is taken around the comet's head rather than
  around its whole length: a four-to-one streak squeezed into a square cell is a
  stub, and the trail behind the bolt is thrown by vfx.spell anyway.
`;

const args = process.argv.slice(2);
if (args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const num = (name, fallback) => {
  const v = opt(name, null);
  return v === null ? fallback : Number(v);
};
const list = (name, fallback) => {
  const v = opt(name, null);
  if (v === null) return fallback;
  return v
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
};
const box = (name, fallback) => {
  const v = opt(name, null);
  if (v === null) return fallback;
  const [w, h, x, y] = v.split(":").map(Number);
  return { w, h, x, y };
};

const FLIGHT = resolve(ROOT, opt("flight", "video/masters/fx/water-bolt.mp4"));
const BLAST = resolve(ROOT, opt("blast", "video/masters/fx/water-blast.mp4"));
const OUT = resolve(ROOT, opt("out", "src/assets/fx/water-sheet.webp"));

const FLIGHT_AT = list("flight-at", [40, 44, 48, 52, 56]);
const BLAST_AT = list("blast-at", [60, 63, 66, 70, 75]);
const FLIGHT_CROP = box("flight-crop", { w: 620, h: 620, x: 0, y: 50 });
const FLIGHT_PAD = num("flight-pad", 90);
const FEATHER = num("feather", 54);
const BLAST_PAD = num("blast-pad", 90);
const BLAST_FEATHER = num("blast-feather", 14);
const BLAST_CROP = box("blast-crop", {
  w: 834 + BLAST_PAD * 2,
  h: 834 + BLAST_PAD * 2,
  x: 139,
  y: 0,
});

const CUT = num("cut", 0.02);
const RAMP = num("ramp", 0.07);
const DESPILL = num("despill", 1);
const LIFT = num("lift", 0);
const FLOOR = num("floor", 18);
const GAIN = num("gain", 1);
const QUALITY = num("quality", 82);

const COLS = 5;
const COUNT = 10;
const PITCH = num("cell", 448);
const PAD = Math.max(2, Math.round(PITCH / 112));
const CELL = PITCH - PAD * 2;

const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");
const kb = (n) => (n / 1024).toFixed(1);
const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

for (const [what, file] of [
  ["flight", FLIGHT],
  ["blast", BLAST],
]) {
  if (!existsSync(file)) {
    process.stderr.write(`no ${what} clip at ${rel(file)}\n`);
    process.exit(1);
  }
}
if (FLIGHT_AT.length !== 5 || BLAST_AT.length !== 5) {
  process.stderr.write("--flight-at and --blast-at want five frames each\n");
  process.exit(1);
}

function frameAt(file, n, crop, padLeft, padAll) {
  const l = (padLeft || 0) + (padAll || 0);
  const t = padAll || 0;
  const pad =
    l || t ? `pad=iw+${l + (padAll || 0)}:ih+${t * 2}:${l}:${t}:black,` : "";
  return execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      "-vf",
      `select='eq(n\\,${n})',${pad}crop=${crop.w}:${crop.h}:${crop.x}:${crop.y},scale=${CELL}:${CELL}:flags=area`,
      "-frames:v",
      "1",
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

function key(r, g, b) {
  const other = Math.max(r, b);
  const chroma = (g - other) / 255;
  const cover = Math.max(0, Math.min(1, (chroma - CUT) / RAMP));
  const keep = 1 - cover;
  if (keep <= 0) return [0, 0, 0];
  const pulled = Math.min(g, other + LIFT);
  const gg = g + (pulled - g) * DESPILL;
  return [
    (r - FLOOR) * keep * GAIN,
    (gg - FLOOR) * keep * GAIN,
    (b - FLOOR) * keep * GAIN,
  ];
}

const rows = Math.ceil(COUNT / COLS);
const sheetW = PITCH * COLS;
const sheetH = PITCH * rows;
const sheet = Buffer.alloc(sheetW * sheetH * 4);
for (let i = 3; i < sheet.length; i += 4) sheet[i] = 255;

const plan = [
  ...FLIGHT_AT.map((n) => ({
    file: FLIGHT,
    n,
    crop: FLIGHT_CROP,
    padLeft: FLIGHT_PAD,
    padAll: 0,
    feather: FEATHER,
  })),
  ...BLAST_AT.map((n) => ({
    file: BLAST,
    n,
    crop: BLAST_CROP,
    padLeft: 0,
    padAll: BLAST_PAD,
    feather: BLAST_FEATHER,
  })),
];

const edge = (x, y, feather) => {
  if (feather <= 0) return 1;
  const d = Math.min(x, y, CELL - 1 - x, CELL - 1 - y);
  return d >= feather ? 1 : d / feather;
};

for (let f = 0; f < plan.length; f++) {
  const { file, n, crop, padLeft, padAll, feather } = plan[f];
  const px = frameAt(file, n, crop, padLeft, padAll);
  if (px.length < CELL * CELL * 4) {
    process.stderr.write(`no frame ${n} in ${rel(file)}\n`);
    process.exit(1);
  }
  const ox = (f % COLS) * PITCH + PAD;
  const oy = Math.floor(f / COLS) * PITCH + PAD;

  for (let y = 0; y < CELL; y++) {
    for (let x = 0; x < CELL; x++) {
      const s = (y * CELL + x) * 4;
      const lit = key(px[s], px[s + 1], px[s + 2]);
      const fade = edge(x, y, feather);
      const dst = ((oy + y) * sheetW + ox + x) * 4;
      sheet[dst] = clamp8(lit[0] * fade);
      sheet[dst + 1] = clamp8(lit[1] * fade);
      sheet[dst + 2] = clamp8(lit[2] * fade);
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
  `flight ${rel(FLIGHT)}  frames ${FLIGHT_AT.join(", ")}  ` +
    `crop ${FLIGHT_CROP.w}x${FLIGHT_CROP.h} at ${FLIGHT_CROP.x},${FLIGHT_CROP.y}\n` +
    `blast  ${rel(BLAST)}  frames ${BLAST_AT.join(", ")}  ` +
    `crop ${BLAST_CROP.w}x${BLAST_CROP.h} at ${BLAST_CROP.x},${BLAST_CROP.y}\n` +
    `key    cut ${CUT}, ramp ${RAMP}, despill ${DESPILL}, lift ${LIFT}, ` +
    `feather ${FEATHER}|${BLAST_FEATHER}, pad ${FLIGHT_PAD}|${BLAST_PAD}, ` +
    `floor ${FLOOR}, gain ${GAIN}\n` +
    `out    ${rel(OUT)}  ${sheetW}x${sheetH}  ${kb(statSync(OUT).size)} kB\n`,
);

if (args.includes("--contact")) {
  const file = join(ROOT, "src/assets/fx/water-contact.png");
  encode(sheet, sheetW, sheetH, file, []);
  process.stdout.write(`       ${rel(file)} — scratch, delete it\n`);
}
