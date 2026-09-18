import { execFileSync, spawnSync } from "node:child_process";
import { resolve, dirname, join, basename, extname } from "node:path";
import { existsSync, statSync } from "node:fs";

const USAGE = `
pack-clip — a green-screen clip into one mp4 the GPU keys at runtime.

  node tools/pack-clip.mjs <video> [options]

  The sheet packer throws away everything between its frames; this keeps the
  clip whole and hands the key to fx/chromakey.js, which runs it per pixel on
  the way to the screen. Use it when the gesture is worth all of its frames.

  --crop <w:h:x:y>  crop before anything else, so a subject adrift in a wide
                  frame does not pay for empty air. Even numbers only.
  --grow <px>     how far the backdrop is grown into the subject before it is
                  repainted, in source pixels. Default 3, 0 is off. This is
                  the whole point of the tool: an h264 clip carries its chroma
                  at half resolution, so the two or three pixels either side of
                  the silhouette are a blend of subject and backdrop — and a
                  red subject blended into green reads as neither, survives the
                  key at full alpha, and ships as a bright olive rim. Growing
                  the backdrop over that band throws it away.
  --key <r,g,b>   the colour the backdrop is repainted. Default 0,110,0 — dark,
                  so whatever the encoder blends back across the new edge is
                  dark too, and a dark fringe on a dark card is invisible. It
                  must still clear the shader's cut: green minus the larger of
                  red and blue, over 60.
  --cut <n>       how green a source pixel has to be to count as backdrop,
                  same measure, 0..255. Default 35.
  --crf <n>       x264 quality. Default 28, which on this material is the
                  cheapest number that leaves the silhouette clean.
  --scale <w:h>   resize after the repaint. Rarely worth it: the bits go on the
                  matte edge rather than on the pixel count, so a smaller clip
                  comes back about the same size and softer.
  --out <file>    default: src/assets/outcome/<name>.mp4

  node tools/pack-clip.mjs masters/outcome/retry-raw.mp4 \
    --crop 736:720:248:0 --out src/assets/outcome/spurn.mp4
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

const slug = basename(input, extname(input)).replace(/[^a-z0-9]+/gi, "-");
const out = resolve(
  flag("out", join(ROOT, "src/assets/outcome", `${slug}.mp4`)),
);
const cropBox = flag("crop", null);
const grow = Math.max(0, Math.round(Number(flag("grow", 3))));
const cut = Number(flag("cut", 35));
const crf = String(flag("crf", 28));
const scale = flag("scale", null);
const paint = String(flag("key", "0,110,0")).split(",").map(Number);

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
const fps = rate.includes("/")
  ? Number(rate.split("/")[0]) / Number(rate.split("/")[1])
  : Number(rate);
const [W, H] = cropBox
  ? cropBox.split(":").slice(0, 2).map(Number)
  : [Number(srcW), Number(srcH)];

const raw = execFileSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    input,
    ...(cropBox ? ["-vf", `crop=${cropBox}`] : []),
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-",
  ],
  { maxBuffer: 1 << 30 },
);

const frame = W * H * 4;
const frames = Math.floor(raw.length / frame);
const back = new Uint8Array(W * H);
const near = new Int32Array(W * H);
const grown = new Uint8Array(W * H);
const R = grow;

for (let f = 0; f < frames; f++) {
  const off = f * frame;
  for (let i = 0; i < W * H; i++) {
    const j = off + i * 4;
    back[i] = raw[j + 1] - Math.max(raw[j], raw[j + 2]) > cut ? 1 : 0;
  }
  for (let x = 0; x < W; x++) {
    let d = R + 1;
    for (let y = 0; y < H; y++) {
      d = back[y * W + x] ? 0 : Math.min(R + 1, d + 1);
      near[y * W + x] = d;
    }
    d = R + 1;
    for (let y = H - 1; y >= 0; y--) {
      d = back[y * W + x] ? 0 : Math.min(R + 1, d + 1);
      if (d < near[y * W + x]) near[y * W + x] = d;
    }
  }
  for (let y = 0; y < H; y++) {
    let d = R + 1;
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      d = near[i] === 0 ? 0 : Math.min(R + 1, d + 1);
      grown[i] = Math.min(d, near[i]) <= R ? 1 : 0;
    }
    d = R + 1;
    for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      d = near[i] === 0 ? 0 : Math.min(R + 1, d + 1);
      if (Math.min(d, near[i]) <= R) grown[i] = 1;
    }
  }
  for (let i = 0; i < W * H; i++) {
    if (!grown[i]) continue;
    const j = off + i * 4;
    raw[j] = paint[0];
    raw[j + 1] = paint[1];
    raw[j + 2] = paint[2];
  }
}

spawnSync(
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
    `${W}x${H}`,
    "-r",
    String(fps),
    "-i",
    "-",
    "-an",
    ...(scale ? ["-vf", `scale=${scale}:flags=bicubic`] : []),
    "-c:v",
    "libx264",
    "-preset",
    "veryslow",
    "-crf",
    crf,
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    out,
  ],
  { input: raw.subarray(0, frame * frames), maxBuffer: 1 << 30 },
);

const [outW, outH] = scale ? scale.split(":").map(Number) : [W, H];
process.stdout.write(
  `${basename(input)}  ${srcW}x${srcH}  ->  ${outW}x${outH} ` +
    `${frames}f @${fps}  grow ${R}px  crf ${crf}  ` +
    `${(statSync(out).size / 1024).toFixed(1)} kB\n${out}\n\n` +
    `{ w: ${outW}, h: ${outH} }\n`,
);
