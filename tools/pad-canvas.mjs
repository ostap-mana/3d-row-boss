import { execFileSync } from "node:child_process";
import { resolve, dirname, join, basename, extname } from "node:path";
import { existsSync } from "node:fs";

const USAGE = `
pad-canvas — grow the canvas around an image so the subject reads smaller.

  node tools/pad-canvas.mjs <image> [options]

  --fill <0..1>   how much of the new frame the old image fills. Default 0.45,
                  so the subject ends up a little under half the frame.
  --square        make the result 1:1, sized off the longer side.
  --color <hex>   padding colour, e.g. 00b140. Default: sampled from the
                  image's own top-left pixel, so it matches the backdrop.
  --top <0..n>    share of the padding put above rather than centred. 0.5 is
                  centred, 0.7 puts most of the new room over the subject's
                  head. Default 0.5.
  --out <file>    output path. Default: <name>-padded.png next to the input.

  node tools/pad-canvas.mjs shot.png --square --fill 0.4 --top 0.65
`;

const args = process.argv.slice(2);
if (args.length === 0 || args.includes("--help")) {
  process.stdout.write(USAGE);
  process.exit(args.length === 0 ? 1 : 0);
}

const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};

const input = resolve(args[0]);
if (!existsSync(input)) {
  process.stderr.write(`no such file: ${input}\n`);
  process.exit(1);
}

const fill = Math.min(0.95, Math.max(0.1, Number(flag("fill", 0.45))));
const topShare = Math.min(1, Math.max(0, Number(flag("top", 0.5))));
const square = args.includes("--square");
const out = resolve(
  flag(
    "out",
    join(dirname(input), `${basename(input, extname(input))}-padded.png`),
  ),
);

const ffmpeg = (params, opts) =>
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", ...params], {
    maxBuffer: 1 << 28,
    ...opts,
  });

const probe = execFileSync(
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
    input,
  ],
  { encoding: "utf8" },
).trim();

const [srcW, srcH] = probe.split(",").map(Number);
if (!srcW || !srcH) {
  process.stderr.write(`could not read dimensions from ${input}\n`);
  process.exit(1);
}

const sampleCorner = () => {
  const raw = ffmpeg(
    [
      "-i",
      input,
      "-vf",
      "crop=1:1:0:0",
      "-frames:v",
      "1",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { encoding: "buffer" },
  );
  return [...raw.subarray(0, 3)]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
};

const color = String(flag("color", sampleCorner())).replace(/^#/, "");

const even = (n) => Math.round(n / 2) * 2;
let dstW = even(srcW / fill);
let dstH = even(srcH / fill);
if (square) {
  const side = Math.max(dstW, dstH);
  dstW = side;
  dstH = side;
}

const x = even((dstW - srcW) / 2);
const y = even((dstH - srcH) * topShare);

ffmpeg([
  "-y",
  "-i",
  input,
  "-vf",
  `pad=${dstW}:${dstH}:${x}:${y}:0x${color}`,
  "-frames:v",
  "1",
  out,
]);

const pct = (n) => `${Math.round(n * 100)}%`;
process.stdout.write(
  `${srcW}x${srcH} -> ${dstW}x${dstH}  pad #${color}  ` +
    `old image now fills ${pct(srcW / dstW)} of the width, ` +
    `${pct(srcH / dstH)} of the height\n${out}\n`,
);
