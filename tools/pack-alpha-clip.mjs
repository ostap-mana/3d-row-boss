import { execFileSync, spawnSync } from "node:child_process";
import { resolve, dirname, join, basename, extname } from "node:path";
import { existsSync, readdirSync, statSync } from "node:fs";

const USAGE = `
pack-alpha-clip — a clip and its matte into one mp4 that carries alpha.

  node tools/pack-alpha-clip.mjs <video> --matte <dir> [options]

  The sheet packer throws away four frames in five and still pays for a webp
  alpha plane on every one it keeps; pack-clip keeps them all but hands the
  key to the GPU, which can only guess where the edge is and rims the
  silhouette olive. This does neither. It takes a matte somebody already
  solved properly — MatAnyone, one mask, propagated — and ships it as a second
  tile under the picture, so the file is plain h264 that every phone decodes
  in hardware and art/alphavideo.js folds back into one RGBA quad.

  A propagated matte is clean around the outside and blind to the inside: it
  fills the gap under a hood or behind a cloak, and the backdrop sits there in
  full green. So the matte is multiplied by a lenient key before it ships —
  lenient enough that a green ornament on the subject survives and only real
  backdrop goes.

  The picture tile goes out premultiplied: alpha is multiplied into the colour
  before the encode, so the backdrop falls to black at the edge and the
  half-resolution chroma an h264 carries has nothing green left to smear back
  over the silhouette. The shader reads it as premultiplied and hands it
  straight to the normal blend.

  --matte <dir>   directory of matte frames, one per source frame, numbered.
                  White is the subject. Required.
  --cell <px>     width of the output; the picture tile is square and the file
                  is twice as tall. Default 512.
  --crf <n>       x264 quality. Default 23. The matte tile is flat and costs
                  almost nothing; the bits go on the picture.
  --keep <n>      how green a pixel inside the matte may be and still be the
                  subject, 0..1: green minus the larger of red and blue, over
                  green. Measuring it as a fraction rather than a straight
                  difference is what tells the backdrop in shadow — same hue,
                  a third the brightness — from a green ornament on the
                  subject, which is muddier at any brightness. Default 0.24.
  --drop <n>      the fraction at which it is backdrop instead, with a ramp
                  between the two. Default 0.42.
  --floor <n>     the key ignores anything darker than this. Default 16, so
                  near-black shadow, where the fraction is noise, is left to
                  the matte.
  --spill <n>     how much of the green over that dominance is pulled back out
                  of the subject's own colour, 0..1. Default 1. It only ever
                  pulls green down towards the rest of the pixel, so a gold
                  star, which is red-dominant, is left alone — unlike a
                  spillmap despill, which turns it orange.
  --lift <n>      how much green the pull leaves standing over the rest of the
                  pixel. Default 8; raise it if something genuinely green goes
                  grey.
  --fps <n>       override the source rate. Default: the source's own.
  --out <file>    default: src/assets/outcome/<name>.mp4

  node tools/pack-alpha-clip.mjs src/source/outcome/victory-figure.mp4 \\
    --matte .comfy/victory-matte --cell 512
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

const matteDir = flag("matte", null);
if (!matteDir) {
  process.stderr.write("--matte is required\n");
  process.exit(1);
}
const matte = resolve(matteDir);
if (!existsSync(matte)) {
  process.stderr.write(`no such directory: ${matte}\n`);
  process.exit(1);
}

const slug = basename(input, extname(input)).replace(/[^a-z0-9]+/gi, "-");
const out = resolve(
  flag("out", join(ROOT, "src/assets/outcome", `${slug}.mp4`)),
);
const cell = Math.round(Number(flag("cell", 512)) / 2) * 2;
const crf = String(flag("crf", 23));
const keep = Number(flag("keep", 0.24));
const drop = Number(flag("drop", 0.42));
const floor = Number(flag("floor", 16));
const spill = Number(flag("spill", 1));
const lift = Number(flag("lift", 8));

const sheet = readdirSync(matte)
  .filter((name) => /\.(png|jpg|jpeg)$/i.test(name))
  .sort();
if (sheet.length === 0) {
  process.stderr.write(`no matte frames in ${matte}\n`);
  process.exit(1);
}

const run = sheet[0].match(/\d+/);
if (!run) {
  process.stderr.write(`matte frames are not numbered: ${sheet[0]}\n`);
  process.exit(1);
}
const pattern = join(
  matte,
  sheet[0].slice(0, run.index) +
    `%0${run[0].length}d` +
    sheet[0].slice(run.index + run[0].length),
);
const start = String(Number(run[0]));

const probe = execFileSync(
  "ffprobe",
  [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,r_frame_rate",
    "-of",
    "csv=p=0",
    input,
  ],
  { encoding: "utf8" },
).trim();

const [srcW, srcH, rate] = probe.split(",");
const sourceFps = rate.includes("/")
  ? Number(rate.split("/")[0]) / Number(rate.split("/")[1])
  : Number(rate);
const fps = Number(flag("fps", sourceFps));
const side = Math.min(Number(srcW), Number(srcH));

const colour = execFileSync(
  "ffmpeg",
  [
    "-v",
    "error",
    "-i",
    input,
    "-vf",
    `scale=${side}:${side}`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-",
  ],
  { maxBuffer: 1 << 30 },
);

const alpha = execFileSync(
  "ffmpeg",
  [
    "-v",
    "error",
    "-framerate",
    String(fps),
    "-start_number",
    start,
    "-i",
    pattern,
    "-vf",
    `scale=${side}:${side}`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "-",
  ],
  { maxBuffer: 1 << 30 },
);

const px = side * side;
const frames = Math.min(
  Math.floor(colour.length / (px * 4)),
  Math.floor(alpha.length / px),
);
if (frames === 0) {
  process.stderr.write("nothing decoded\n");
  process.exit(1);
}

const ramp = Math.max(1e-4, drop - keep);
for (let f = 0; f < frames; f++) {
  const off = f * px * 4;
  const moff = f * px;
  for (let i = 0; i < px; i++) {
    const j = off + i * 4;
    const r = colour[j];
    const b = colour[j + 2];
    const rest = r > b ? r : b;
    const g = colour[j + 1];
    const over = g - rest;

    let a = alpha[moff + i] / 255;
    if (over > 0 && g >= floor) {
      const tint = over / g;
      if (tint > keep) {
        const cut = (drop - tint) / ramp;
        a *= cut > 0 ? cut : 0;
      }
    }

    const keptGreen =
      over > 0 && spill > 0 ? g + (Math.min(g, rest + lift) - g) * spill : g;

    colour[j] = r * a;
    colour[j + 1] = keptGreen * a;
    colour[j + 2] = b * a;
    colour[j + 3] = a * 255;
  }
}

const done = spawnSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    `${side}x${side}`,
    "-r",
    String(fps),
    "-i",
    "-",
    "-filter_complex",
    [
      `[0:v]scale=${cell}:${cell}:flags=lanczos,format=gbrap,split=2[s1][s2]`,
      `[s1]format=gbrp[rgb]`,
      `[s2]alphaextract,format=gbrp[a]`,
      `[rgb][a]vstack=inputs=2[v]`,
    ].join(";"),
    "-map",
    "[v]",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "veryslow",
    "-profile:v",
    "high",
    "-level",
    "3.1",
    "-crf",
    crf,
    "-r",
    String(fps),
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    out,
  ],
  { input: colour.subarray(0, frames * px * 4), maxBuffer: 1 << 30 },
);

if (done.status !== 0) {
  process.stderr.write(done.stderr?.toString() || "ffmpeg failed\n");
  process.exit(1);
}

process.stdout.write(
  `${basename(input)}  ${srcW}x${srcH}  +  ${sheet.length} matte  ->  ` +
    `${cell}x${cell * 2} ${frames}f @${fps} crf ${crf}  ` +
    `${(statSync(out).size / 1024).toFixed(1)} kB\n${out}\n\n` +
    `{ w: ${cell}, h: ${cell}, fps: ${fps}, frames: ${frames} }\n`,
);
