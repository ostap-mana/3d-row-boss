import { execFileSync, spawnSync } from "node:child_process";
import { resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, statSync } from "node:fs";

const USAGE = `
pack-bolt — a painted lance, cut off a still and pointed the way beams fly.

  node tools/pack-bolt.mjs <id> [options]

  --src <file>      default src/source/fx/<id>-arrow.png
  --out <file>      default src/assets/fx/<id>-bolt.webp
  --limit <n>       luma at or below which a pixel counts as backdrop while the
                    content box is measured, 0..255. Default 4.
  --pad <px>        kept around that box, so the faint end of the tail is not
                    cut off square. Default 8.
  --width <px>      the packed width. Default 768.
  --quality <n>     webp quality. Default 78.
  --keep-heading    do not mirror. Only for art already drawn head-first to the
                    right.

  One frame, no grid, no alpha.

  **No alpha** because src/fx/vfx.js draws this on the add blend, the same as
  every other effect sheet in the build: the black it is painted on adds
  nothing, so it is already transparency and a matte would only be bytes.

  **Mirrored by default**, which is the one thing here that is not a setting for
  taste. Vfx.beam anchors a lance at the hero's card and grows it toward the
  boss, so the texture's +x end is the end that arrives. Art generated off the
  prompts in src/source/fx/bolt-prompts.md is drawn head-left, tail streaming
  right — the way a bolt is drawn when it is flying at the reader — and dropped
  in unmirrored it fires the arrowhead back into the hero's own face.

  **Cropped to content first.** These arrive as a wide black frame with a band
  of light across the middle, and the black costs bytes in the webp and pixels
  in the atlas without ever being drawn. The crop is measured with ffmpeg's own
  cropdetect rather than guessed, and --pad is what keeps the measurement from
  clipping the tail where it fades into the ground.

  The aspect is not written anywhere: src/art/bolts.js measures it off the
  decoded image, so a wider or narrower redraw needs no code change.
`;

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(args.length === 0 ? 1 : 0);
}

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const id = args.find((a) => !a.startsWith("--"));
if (!id) {
  console.error("pack-bolt: an id is required, e.g. `water`.");
  process.exit(1);
}

const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const num = (name, fallback) => Number(opt(name, fallback));

const SRC = resolve(ROOT, opt("src", `src/source/fx/${id}-arrow.png`));
const OUT = resolve(ROOT, opt("out", `src/assets/fx/${id}-bolt.webp`));
const LIMIT = num("limit", 4);
const PAD = num("pad", 8);
const WIDTH = num("width", 768);
const QUALITY = num("quality", 78);
const MIRROR = !args.includes("--keep-heading");

if (!existsSync(SRC)) {
  console.error(`pack-bolt: ${SRC} is not there.`);
  process.exit(1);
}

const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");

const ffmpeg = (a) =>
  execFileSync("ffmpeg", a, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

/** ffmpeg reports a crop only once it has a few frames to compare, so the still
 *  is looped into three of them and the last report is read back. */
function contentBox() {
  const run = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-loop",
      "1",
      "-i",
      SRC,
      "-vf",
      `cropdetect=mode=black:limit=${LIMIT}:round=2`,
      "-frames:v",
      "3",
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8" },
  );
  const log = String(run.stderr || "");
  const found = [...log.matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].pop();
  if (!found) return null;
  const [, w, h, x, y] = found.map(Number);
  return { w, h, x, y };
}

const size = () => {
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
      "csv=p=0",
      SRC,
    ],
    { encoding: "utf8" },
  )
    .trim()
    .split(",");
  return { w: Number(out[0]), h: Number(out[1]) };
};

const full = size();
const box = contentBox() || { w: full.w, h: full.h, x: 0, y: 0 };

const x = Math.max(0, box.x - PAD);
const y = Math.max(0, box.y - PAD);
const w = Math.min(full.w - x, box.w + PAD * 2);
const h = Math.min(full.h - y, box.h + PAD * 2);

const chain = [`crop=${w}:${h}:${x}:${y}`];
if (MIRROR) chain.push("hflip");
chain.push(`scale=${WIDTH}:-2:flags=lanczos`);

mkdirSync(dirname(OUT), { recursive: true });
ffmpeg([
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-i",
  SRC,
  "-vf",
  chain.join(","),
  "-pix_fmt",
  "yuv420p",
  "-c:v",
  "libwebp",
  "-lossless",
  "0",
  "-quality",
  String(QUALITY),
  "-frames:v",
  "1",
  OUT,
]);

const packed = Math.round((WIDTH * h) / w);
console.log(
  `${rel(OUT)}  ${WIDTH}x${packed}  ${(statSync(OUT).size / 1024).toFixed(1)} KB` +
    `  (cut ${w}x${h} out of ${full.w}x${full.h}${MIRROR ? ", mirrored" : ""})`,
);
