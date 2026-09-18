import { execFileSync } from "node:child_process";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";

const USAGE = `
pack-breath — a generated fire mass onto the grid art/spells.js already cuts.

  node tools/pack-breath.mjs [options]

  --take <id>     which fxclip take to pack. Default breath-v5.
  --from <n>      first source frame to sample. Default 1.
  --to <n>        last source frame to sample. Default 15. The tail of a Wan
                  clip drifts into grey haze as the model runs out of prompt,
                  and haze is the one thing an additive plate cannot carry.
  --cell <px>     width of one square cell. Default 384.
  --cols <n>      columns. Default 5, because spells.js cuts 5 by 2.
  --count <n>     cells on the sheet. Default 10.
  --crop <w:h:x:y>  crop each source frame before it is scaled.
  --turn <n>      quarter turns applied to the source before the crop, so the
                  flame's own banding can be laid along the plume instead of
                  across it. Wan gives back a mass with a grain and no
                  direction; which way that grain runs is the difference
                  between fire flowing down a jet and a stack of hoops.
                  Default 0.
  --lift <n>      black point, 0..1. Everything under it goes to zero.
                  Default 0.12.
  --pull <n>      how much of each pixel's own achromatic floor is taken out,
                  0..1. Default 0.45.
  --gain <n>      multiplies what survives. Default 1.3.
  --mouth <n>     half-width of the plume where it leaves the mouth, as a
                  fraction of the cell. Default 0.13.
  --flare <n>     how fast it opens out on the way down. 1 is a straight cone,
                  above 1 holds narrow longer and then flares. Default 1.5.
  --feather <n>   softness of the plume's side, 0..1 of its own half-width.
                  Default 0.45.
  --tail <n>      fraction of the cell over which the far end is ramped out.
                  Default 0.3.
  --lip <n>       fraction of the cell over which it is ramped IN at the mouth.
                  Short and the plate ends in a flat lid where the boss's jaw
                  is; the throat sprite covers the last of it. Default 0.12.
  --bite <n>      exponent on the finished mask. Under 1 it holds the interior
                  at full and spends the whole falloff in the last of the
                  edge, which is what lets the flame's own tongues break the
                  silhouette instead of a clean trapezoid. Default 0.65.
  --quality <n>   webp quality. Default 80.
  --out <file>    default src/assets/fx/breathjet-sheet.webp
  --contact       also write the sheet as a PNG.

  The plate ships as flat RGB with no alpha plane at all. It goes on with the
  add blend, where black already is transparency, and a lossy webp pays for an
  alpha plane in full — carrying the matte would cost more than the picture.

  Two passes matter and both are about what add cannot do.

  The black point comes up because Wan never quite reaches black. A frame that
  sits at 8 or 10 over the whole background is invisible on its own and a
  full-frame grey veil once it is stretched across the board on add, which is
  what the old plate did.

  The plume mask is why this tool exists at all. Wan will paint fire and it
  will not paint a direction — asked for a jet running top to bottom it returns
  a room with a fire in it, three takes running. So it is asked for nothing but
  a churning mass of flame, and the shape is cut here: a silhouette narrow at
  the mouth that opens out on the way down, feathered at its sides and ramped
  out at its far end. Without it the cell is a square of fire with square
  corners, and on the add blend that is not a breath, it is a lit rectangle
  laid over the board.

  The achromatic floor comes out because the model's haze is grey and its fire
  is not. Taking a fraction of min(r,g,b) off every channel deletes the veil
  and the smoke bloom while leaving molten orange almost untouched, and what
  it does take out of the white-hot core is exactly the part that was going to
  clip to white over a board made of bright gems.
`;

const args = process.argv.slice(2);
if (args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(0);
}

const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COMFY = resolve(
  process.env.COMFYUI_ROOT ||
    "C:/Users/Yonix/AppData/Local/Comfy-Desktop/ComfyUI-Installs/ComfyUI/ComfyUI",
);

const take = flag("take", "breath-v5");
const from = Number(flag("from", 1));
const to = Number(flag("to", 15));
const cell = Number(flag("cell", 384));
const cols = Number(flag("cols", 5));
const count = Number(flag("count", 10));
const crop = flag("crop", null);
const turn = Number(flag("turn", 0)) & 3;
const lift = Number(flag("lift", 0.12));
const pull = Number(flag("pull", 0.45));
const gain = Number(flag("gain", 1.3));
const mouth = Number(flag("mouth", 0.1));
const flare = Number(flag("flare", 1.15));
const feather = Number(flag("feather", 0.72));
const tail = Number(flag("tail", 0.3));
const lip = Number(flag("lip", 0.12));
const bite = Number(flag("bite", 0.65));
const quality = Number(flag("quality", 80));
const out = resolve(
  flag("out", join(ROOT, "src/assets/fx/breathjet-sheet.webp")),
);

const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");

const dir = join(COMFY, "output", "fxclip", take);
if (!existsSync(dir)) {
  process.stderr.write(`no frames for ${take} at ${dir}\n`);
  process.exit(1);
}

const frames = readdirSync(dir)
  .filter((f) => f.endsWith(".png"))
  .sort();
const window = frames.slice(from - 1, to);
if (window.length < count) {
  process.stderr.write(
    `${take} has ${window.length} frame(s) in ${from}..${to}, need ${count}\n`,
  );
  process.exit(1);
}

const picked = [];
for (let i = 0; i < count; i++) {
  picked.push(window[Math.round((i * (window.length - 1)) / (count - 1))]);
}

const rows = Math.ceil(count / cols);

function decode(file, w, h) {
  const steps = [];
  for (let i = 0; i < turn; i++) steps.push("transpose=1");
  if (crop) steps.push(`crop=${crop}`);
  steps.push(`scale=${w}:${h}`);
  const filter = steps.join(",");
  return execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      "-vf",
      filter,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: 1 << 28 },
  );
}

const sheetW = cell * cols;
const sheetH = cell * rows;
const sheet = Buffer.alloc(sheetW * sheetH * 3);

picked.forEach((name, i) => {
  const px = decode(join(dir, name), cell, cell);
  const ox = (i % cols) * cell;
  const oy = Math.floor(i / cols) * cell;
  for (let y = 0; y < cell; y++) {
    px.copy(
      sheet,
      ((oy + y) * sheetW + ox) * 3,
      y * cell * 3,
      (y + 1) * cell * 3,
    );
  }
});

const edge = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

const plume = new Float32Array(cell * cell);
for (let y = 0; y < cell; y++) {
  const v = y / (cell - 1);
  const half = mouth + (0.5 - mouth) * Math.pow(v, flare);
  const along = edge(v / lip) * edge((1 - v) / tail);
  for (let x = 0; x < cell; x++) {
    const d = Math.abs(x / (cell - 1) - 0.5) / half;
    plume[y * cell + x] = Math.pow(edge((1 - d) / feather) * along, bite);
  }
}

const low = lift * 255;
const span = 255 - low;
for (let i = 0; i < count; i++) {
  const ox = (i % cols) * cell;
  const oy = Math.floor(i / cols) * cell;
  for (let y = 0; y < cell; y++) {
    for (let x = 0; x < cell; x++) {
      const n = ((oy + y) * sheetW + ox + x) * 3;
      const mask = plume[y * cell + x];
      const cut = Math.min(sheet[n], sheet[n + 1], sheet[n + 2]) * pull;
      for (let k = 0; k < 3; k++) {
        const v = ((sheet[n + k] - cut - low) / span) * gain * mask * 255;
        sheet[n + k] = v < 0 ? 0 : v > 255 ? 255 : v;
      }
    }
  }
}

mkdirSync(dirname(out), { recursive: true });

function encode(file, extra) {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-s",
      `${sheetW}x${sheetH}`,
      "-i",
      "pipe:0",
      ...extra,
      file,
    ],
    { input: sheet, maxBuffer: 1 << 28 },
  );
}

encode(out, [
  "-c:v",
  "libwebp",
  "-lossless",
  "0",
  "-q:v",
  String(quality),
  "-pix_fmt",
  "yuv420p",
]);

if (args.includes("--contact")) {
  encode(out.replace(/\.webp$/, ".png"), []);
}

const kb = (statSync(out).size / 1024).toFixed(1);
process.stdout.write(
  `${rel(out)}  ${sheetW}x${sheetH}  ${cols}x${rows} of ${cell}px  ${kb} kB\n` +
    `frames ${picked[0]} .. ${picked[picked.length - 1]} of ${take}\n`,
);
