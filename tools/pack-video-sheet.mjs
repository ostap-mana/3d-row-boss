import { execFileSync } from "node:child_process";
import { resolve, dirname, join, basename, extname } from "node:path";
import { existsSync, mkdirSync, statSync } from "node:fs";

const USAGE = `
pack-video-sheet — a green-screen clip into one sprite sheet.

  node tools/pack-video-sheet.mjs <video> [options]

  --frames <n>    frames to keep, sampled evenly across the clip. Default 24.
  --cols <n>      columns in the grid. Default 6.
  --cell <px>     width of one cell; the height follows the clip's aspect.
                  Default 180.
  --key <hex>     the colour to knock out. Default: sampled from the first
                  frame's top-left pixel.
  --similarity    how far from that colour still counts as background,
                  0..1. Default 0.14. Raise it if green survives around her,
                  lower it if her hair or armour start going transparent.
  --blend         softness of the alpha edge, 0..1. Default 0.02.
  --quality <n>   webp quality. Default 80.
  --out <file>    default: src/assets/fx/<name>.webp
  --strip         also write the PNG next to it.

  node tools/pack-video-sheet.mjs ".vscode/100%.mp4" --frames 24 --cell 180
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

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.slice(1)), "..");
const input = resolve(args[0]);
if (!existsSync(input)) {
  process.stderr.write(`no such file: ${input}\n`);
  process.exit(1);
}

const want = Math.max(1, Math.round(Number(flag("frames", 24))));
const cols = Math.max(1, Math.round(Number(flag("cols", 6))));
const cellW = Math.max(8, Math.round(Number(flag("cell", 180))));
const similarity = Number(flag("similarity", 0.14));
const blend = Number(flag("blend", 0.02));
const quality = Number(flag("quality", 80));
const slug = basename(input, extname(input)).replace(/[^a-z0-9]+/gi, "-");
const out = resolve(flag("out", join(ROOT, "src/assets/fx", `${slug}.webp`)));

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
    "-count_frames",
    "-show_entries",
    "stream=width,height,nb_read_frames",
    "-of",
    "csv=p=0",
    input,
  ],
  { encoding: "utf8" },
).trim();

const [srcW, srcH, total] = probe.split(",").map(Number);
if (!srcW || !srcH || !total) {
  process.stderr.write(`could not read ${input}\n`);
  process.exit(1);
}

const sampleCorner = () => {
  const raw = ffmpeg(
    [
      "-i",
      input,
      "-vf",
      "format=rgb24,crop=1:1:0:0",
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

const key = String(flag("key", sampleCorner())).replace(/^#/, "");

const count = Math.min(want, total);
const picks = [];
for (let i = 0; i < count; i++) {
  picks.push(Math.round((i * (total - 1)) / Math.max(1, count - 1)));
}
const unique = [...new Set(picks)];
const rows = Math.ceil(unique.length / cols);
const even = (n) => Math.round(n / 2) * 2;
const cellH = even((cellW * srcH) / srcW);

const chain = [
  `select='${unique.map((n) => `eq(n\\,${n})`).join("+")}'`,
  "format=rgba",
  `colorkey=0x${key}:${similarity}:${blend}`,
  `scale=${cellW}:${cellH}:flags=lanczos`,
  `tile=${cols}x${rows}:color=#00000000`,
].join(",");

mkdirSync(dirname(out), { recursive: true });

const render = (target, extra = []) =>
  ffmpeg([
    "-y",
    "-i",
    input,
    "-fps_mode",
    "passthrough",
    "-vf",
    chain,
    "-frames:v",
    "1",
    ...extra,
    target,
  ]);

if (args.includes("--strip")) render(out.replace(/\.webp$/, ".png"));
render(out, [
  "-c:v",
  "libwebp",
  "-lossless",
  "0",
  "-quality",
  String(quality),
  "-compression_level",
  "6",
  "-preset",
  "drawing",
]);

const kb = (f) => (statSync(f).size / 1024).toFixed(1);
process.stdout.write(
  `${basename(input)}  ${srcW}x${srcH} ${total}f  ->  ` +
    `${unique.length} frames  ${cols}x${rows} grid of ${cellW}x${cellH}  ` +
    `${cols * cellW}x${rows * cellH}  key #${key}  ${kb(out)} kB\n${out}\n\n` +
    `const SHEET = { cols: ${cols}, cellW: ${cellW}, cellH: ${cellH}, ` +
    `count: ${unique.length} };\n`,
);
