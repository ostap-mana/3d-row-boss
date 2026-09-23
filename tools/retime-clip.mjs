import { execFileSync, spawn, spawnSync } from "node:child_process";
import { resolve, dirname, join, basename, extname } from "node:path";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";

const USAGE = `
retime-clip — a generated clip with its stutter taken out, at screen rate.

  node tools/retime-clip.mjs <video> [options]

  A video model does not hand back even motion. It writes four frames per
  latent step, so every fourth frame jumps about 1.5x as far as its
  neighbours, and where the model had nothing to say it repeats a frame
  outright — dark-star.mp4 holds still for 39 of its 120 steps. Played back
  the clip reads as a pulse and a stall, which is what "jerky" is, and no
  amount of frame rate fixes it because the unevenness is in the content.

  So this measures how far the picture actually travels between each pair of
  frames, works out when each frame would have to be shown for that travel to
  be even, and throws away the slow half of that correction — the part that is
  the performance rather than the artefact. A held beat stays held and a flash
  stays instant; only the four-frame ripple and the repeats go.

  Then it resamples. The clip is interpolated to --dense with motion
  compensation, and the frames the corrected timing asks for are picked out of
  that, at --fps. 60 is the point: 24 fps on a 60 Hz screen shows each frame
  for two refreshes and then three, which is its own judder on top of
  everything else.

  --range <a:b>   source frames to keep, inclusive. Generated clips usually
                  open on a transition and close on a held frame; both are
                  dead weight in a three-second card.
  --fps <n>       output rate. Default 60.
  --dense <n>     the rate the motion-compensated pass runs at before the
                  corrected frames are picked out of it; it sets how finely a
                  frame can be nudged. Default 120.
  --size <px>     square side to work at. Default: the source's short side.
  --straighten <n>  how much of the correction to apply, 0..1. Default 1.
                  0 leaves the timing alone and only changes the rate, which
                  is the comparison worth making before believing any of this.
  --window <n>    how slow a swing counts as the performance and is left
                  alone, in source frames. Default 9.
  --search <n>    motion search radius for the interpolation. Default 32.
  --out <file>    default: <name>-smooth.mp4 beside the source.

  node tools/retime-clip.mjs video/masters/victory-figure.mp4 --range 24:172
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

const probe = execFileSync(
  "ffprobe",
  [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,r_frame_rate,nb_frames",
    "-of",
    "csv=p=0",
    input,
  ],
  { encoding: "utf8" },
).trim();

const [srcW, srcH, rate, countRaw] = probe.split(",");
const srcFps = rate.includes("/")
  ? Number(rate.split("/")[0]) / Number(rate.split("/")[1])
  : Number(rate);
const total = Number(countRaw);

const side = Math.round(Number(flag("size", Math.min(srcW, srcH))) / 2) * 2;
const outFps = Number(flag("fps", 60));
const dense = Number(flag("dense", 120));
const straighten = Number(flag("straighten", 1));
const window = Math.max(1, Math.round(Number(flag("window", 9))));
const search = Number(flag("search", 32));

const span = flag("range", null);
const first = span ? Number(span.split(":")[0]) : 0;
const last = span ? Number(span.split(":")[1]) : total - 1;
const n = last - first + 1;
if (n < 4) {
  process.stderr.write("need at least four frames\n");
  process.exit(1);
}

const out = resolve(
  flag(
    "out",
    join(
      dirname(input),
      `${basename(input, extname(input)).replace(/[^a-z0-9]+/gi, "-")}-smooth.mp4`,
    ),
  ),
);

const work = join(tmpdir(), `retime-${process.pid}`);
mkdirSync(work, { recursive: true });
const trimmed = join(work, "trimmed.mp4");
const denseFile = join(work, "dense.mp4");

const run = (label, list) => {
  const done = spawnSync("ffmpeg", list, { encoding: "utf8" });
  if (done.status !== 0) {
    process.stderr.write(`${label} failed\n${done.stderr || ""}`);
    process.exit(1);
  }
};

run("trim", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-i",
  input,
  "-vf",
  `select='between(n\\,${first}\\,${last})',setpts=N/${srcFps}/TB,scale=${side}:${side}:flags=lanczos`,
  "-r",
  String(srcFps),
  "-an",
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  "-qp",
  "0",
  "-pix_fmt",
  "yuv444p",
  trimmed,
]);

const MEASURE = 192;
const gray = execFileSync(
  "ffmpeg",
  [
    "-v",
    "error",
    "-i",
    trimmed,
    "-vf",
    `scale=${MEASURE}:${MEASURE}`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "-",
  ],
  { maxBuffer: 1 << 29 },
);

const cell = MEASURE * MEASURE;
const have = Math.floor(gray.length / cell);
const travel = new Float64Array(have);
for (let f = 1; f < have; f++) {
  let sum = 0;
  const a = (f - 1) * cell;
  const b = f * cell;
  for (let i = 0; i < cell; i++) sum += Math.abs(gray[b + i] - gray[a + i]);
  travel[f] = sum / cell;
}

const arc = new Float64Array(have);
for (let f = 1; f < have; f++) arc[f] = arc[f - 1] + travel[f];
const reach = arc[have - 1];

const at = (target) => {
  if (reach <= 0) return 0;
  let lo = 0;
  let hi = have - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arc[mid] < target) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return 0;
  const step = arc[lo] - arc[lo - 1];
  return step > 0 ? lo - 1 + (target - arc[lo - 1]) / step : lo;
};

const drift = new Float64Array(have);
for (let k = 0; k < have; k++) {
  drift[k] = at((reach * k) / (have - 1)) - k;
}

const slow = new Float64Array(have);
const reachBack = (window - 1) >> 1;
for (let k = 0; k < have; k++) {
  let sum = 0;
  let seen = 0;
  for (let j = k - reachBack; j <= k + reachBack; j++) {
    const c = j < 0 ? 0 : j >= have ? have - 1 : j;
    sum += drift[c];
    seen++;
  }
  slow[k] = sum / seen;
}

const place = new Float64Array(have);
let climb = 0;
for (let k = 0; k < have; k++) {
  const want = k + straighten * (drift[k] - slow[k]);
  climb = Math.max(climb, Math.min(have - 1, want));
  place[k] = climb;
}

run("interpolate", [
  "-hide_banner",
  "-loglevel",
  "error",
  "-y",
  "-i",
  trimmed,
  "-vf",
  `minterpolate=fps=${dense}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1:search_param=${search}`,
  "-an",
  "-c:v",
  "libx264",
  "-preset",
  "ultrafast",
  "-qp",
  "0",
  "-pix_fmt",
  "yuv444p",
  denseFile,
]);

const denseCount = Number(
  execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-count_frames",
      "-show_entries",
      "stream=nb_read_frames",
      "-of",
      "csv=p=0",
      denseFile,
    ],
    { encoding: "utf8" },
  ).trim(),
);

const frames = Math.max(2, Math.round(((have - 1) / srcFps) * outFps) + 1);
const wanted = [];
for (let j = 0; j < frames; j++) {
  const t = ((have - 1) * j) / (frames - 1);
  const k = Math.floor(t);
  const mix = t - k;
  const x =
    k >= have - 1
      ? place[have - 1]
      : place[k] + (place[k + 1] - place[k]) * mix;
  const index = Math.round((x / (have - 1)) * (denseCount - 1));
  wanted.push(Math.max(0, Math.min(denseCount - 1, index)));
}

const bytes = side * side * 3;
const reader = spawn(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-i",
    denseFile,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-",
  ],
  { stdio: ["ignore", "pipe", "inherit"] },
);

const writer = spawn(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    `${side}x${side}`,
    "-r",
    String(outFps),
    "-i",
    "-",
    "-an",
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-qp",
    "0",
    "-pix_fmt",
    "yuv444p",
    out,
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);

let held = Buffer.alloc(0);
let index = 0;
let cursor = 0;
let written = 0;

await new Promise((finish, fail) => {
  writer.on("error", fail);
  reader.on("error", fail);
  reader.stdout.on("data", (chunk) => {
    held = held.length ? Buffer.concat([held, chunk]) : chunk;
    while (held.length >= bytes) {
      const frame = held.subarray(0, bytes);
      while (cursor < wanted.length && wanted[cursor] === index) {
        writer.stdin.write(Buffer.from(frame));
        written++;
        cursor++;
      }
      held = held.subarray(bytes);
      index++;
    }
  });
  reader.stdout.on("end", () => {
    while (cursor < wanted.length) {
      cursor++;
      written++;
      if (index > 0) writer.stdin.write(Buffer.alloc(bytes));
    }
    writer.stdin.end();
  });
  writer.on("close", () => finish());
});

const moved = place.reduce((sum, v, k) => sum + Math.abs(v - k), 0) / have;
process.stdout.write(
  `${basename(input)}  ${srcW}x${srcH} ${total}f @${srcFps}  keep ${first}-${last}  ->  ` +
    `${side}x${side} ${written}f @${outFps}  dense ${denseCount}f  ` +
    `nudged ${moved.toFixed(2)} frames on average  ` +
    `${(statSync(out).size / 1024 / 1024).toFixed(1)} MB\n${out}\n`,
);
