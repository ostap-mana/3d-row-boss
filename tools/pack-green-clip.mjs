import { execFileSync, spawn, spawnSync } from "node:child_process";
import { resolve, dirname, join, basename, extname } from "node:path";
import { existsSync, mkdirSync, statSync } from "node:fs";

const USAGE = `
pack-green-clip — a green-screen clip into one mp4 that carries alpha, with
no matte to hand it.

  node tools/pack-green-clip.mjs <video> [options]

  pack-alpha-clip takes a matte somebody solved elsewhere. On the win card
  that matte cost more than it paid: MatAnyone held the glow around the stars
  at alpha 1, so backdrop green with gold mixed into it shipped as an olive
  cloud, and the lenient key the matte was multiplied by ate the mage's own
  dark cloak into ribbons. Both are the same mistake — asking colour alone to
  say what is subject, when the backdrop, the cloak and the tome are all the
  same green.

  This keys the clip on its own and answers the question with shape instead.
  Three passes:

  what is certainly backdrop — flat green inside a luma band around the
  frame's own border median, or backdrop with warm light on it, which is
  brighter than the backdrop in every channel and puts almost nothing into
  blue;

  what is subject — everything a flood fill from the frame edge cannot reach
  through that. A cloak in shadow is the same colour as the backdrop and no
  threshold saves it; it survives here because the fill cannot get to it
  without crossing the mage. Holes close for the same reason, so nothing
  ships torn;

  and what is light — the glow around the stars and the trails they fly on,
  which are neither. They ship as premultiplied light: the colour is what the
  light added over the backdrop and the alpha follows how bright it is, so
  the diffuse haze falls to nothing and only the cores stay. Over the card's
  dark ground that reads as gold rather than as the green it was lit on.

  --range <a:b>   source frames to keep, inclusive. Default: all of them.
  --cell <px>     width of the output; the picture tile is square and the
                  file is twice as tall. Default 512.
  --crf <n>       x264 quality. Default 23.
  --matte-q <n>   how much coarser the matte tile is coded than the picture,
                  as an x264 ROI quantiser offset. Default 0.2.
  --tint <n>      green over the larger of red and blue, as a fraction of
                  green, at which a pixel is flat backdrop. Default 0.3.
  --band <lo:hi>  how far a flat-backdrop pixel may sit from the border
                  median in luma, as a pair of factors. Default 0.55:1.6 —
                  wide enough for the backdrop's own falloff, tight enough
                  that a cloak at a fifth of its brightness is not it.
  --gold <n>      how much blue a warm light may add over the backdrop, as a
                  fraction of what it adds to green. Default 0.45. A gold
                  star is under it; the mage's white robe is not, which is
                  what keeps the test off the subject.
  --glow <a:b>    the luminance the added light needs before it is worth
                  keeping, and where it is kept whole. Default 46:96. Below
                  the floor is the haze that made the card look dirty.
  --erode <n>     pixels taken off the silhouette before it ships, so the
                  green-contaminated ring at the edge goes. Default 1.
  --fade <px>     how far in from the top and sides alpha ramps to nothing,
                  in output pixels. Default 14. A trail that leaves the top
                  of the generation is cut flat by the frame and reads as a
                  slice across the card; this dissolves it instead. The
                  bottom is left alone — that edge is where the figure stands
                  in the plate.
  --lift <n>      how much green the despill leaves standing over the rest of
                  a subject pixel. Default 8.
  --fps <n>       override the source rate. Default: the source's own.
  --still <file>  also write the last frame as a webp with straight alpha —
                  what the card shows on a webview that will not play the
                  clip.
  --still-width <px>  width of that still. Default: --cell.
  --still-quality <n>  its webp quality. Default 82.
  --out <file>    default: src/assets/outcome/<name>.mp4

  node tools/pack-green-clip.mjs masters/outcome/victory-figure.mp4 \\
    --range 24:172 --still src/assets/outcome/victory-figure.webp
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
const cell = Math.round(Number(flag("cell", 512)) / 2) * 2;
const crf = String(flag("crf", 23));
const matteQ = Number(flag("matte-q", 0.2));
const tintCut = Number(flag("tint", 0.3));
const band = String(flag("band", "0.55:1.6")).split(":").map(Number);
const gold = Number(flag("gold", 0.45));
const glow = String(flag("glow", "46:96")).split(":").map(Number);
const erode = Number(flag("erode", 1));
const fade = Number(flag("fade", 14));
const lift = Number(flag("lift", 8));
const range = String(flag("range", "")).split(":").map(Number);

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

const px = side * side;
const available = Math.floor(colour.length / (px * 4));
const first = Number.isFinite(range[0]) ? Math.max(0, range[0]) : 0;
const last = Number.isFinite(range[1])
  ? Math.min(available - 1, range[1])
  : available - 1;
const frames = last - first + 1;
if (frames <= 0) {
  process.stderr.write(`range ${first}:${last} has no frames\n`);
  process.exit(1);
}

const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);

function borderMedian(off) {
  const edge = Math.max(4, Math.round(side * 0.0125));
  const ch = [[], [], []];
  for (let y = 0; y < side; y++) {
    const rim = y < edge || y >= side - edge;
    for (let x = 0; x < side; x++) {
      if (!rim && x >= edge && x < side - edge) {
        x = side - edge - 1;
        continue;
      }
      const i = off + (y * side + x) * 4;
      ch[0].push(colour[i]);
      ch[1].push(colour[i + 1]);
      ch[2].push(colour[i + 2]);
    }
  }
  return ch.map((a) => {
    a.sort((p, q) => p - q);
    return a[a.length >> 1];
  });
}

const open = new Uint8Array(px);
const warmth = new Uint8Array(px);
const reached = new Uint8Array(px);
const stack = new Int32Array(px);
let keep = new Uint8Array(px);
let next = new Uint8Array(px);
const out32 = Buffer.alloc(px * 4 * frames);
const still = flag("still", null) ? Buffer.alloc(px * 4) : null;

const glowSpan = Math.max(1, glow[1] - glow[0]);
const fadeRows = Math.round((fade * side) / cell);

for (let f = 0; f < frames; f++) {
  const off = (first + f) * px * 4;
  const bg = borderMedian(off);
  const bgLuma = luma(bg[0], bg[1], bg[2]);
  const lo = bgLuma * band[0];
  const hi = bgLuma * band[1];

  for (let i = 0; i < px; i++) {
    const j = off + i * 4;
    const r = colour[j];
    const g = colour[j + 1];
    const b = colour[j + 2];
    const rest = r > b ? r : b;
    const tint = g > 0 ? (g - rest) / g : -1;
    const lum = luma(r, g, b);
    const flat = tint > tintCut && lum > lo && lum < hi;

    const dr = r - bg[0];
    const dg = g - bg[1];
    const db = b - bg[2];
    const warm = dr > -6 && dg > 6 && db > -6 && db < gold * dg;

    warmth[i] = warm ? 1 : 0;
    open[i] = flat || warm ? 1 : 0;
    reached[i] = 0;
  }

  let top = 0;
  const push = (i) => {
    if (open[i] && !reached[i]) {
      reached[i] = 1;
      stack[top++] = i;
    }
  };
  for (let x = 0; x < side; x++) {
    push(x);
    push((side - 1) * side + x);
  }
  for (let y = 0; y < side; y++) {
    push(y * side);
    push(y * side + side - 1);
  }
  while (top > 0) {
    const i = stack[--top];
    const x = i % side;
    if (x > 0) push(i - 1);
    if (x < side - 1) push(i + 1);
    if (i >= side) push(i - side);
    if (i < px - side) push(i + side);
  }

  for (let i = 0; i < px; i++) keep[i] = reached[i] ? 0 : 1;

  for (let pass = 0; pass < erode; pass++) {
    next.fill(0);
    for (let y = 1; y < side - 1; y++) {
      for (let x = 1; x < side - 1; x++) {
        const i = y * side + x;
        if (!keep[i]) continue;
        next[i] =
          keep[i - 1] && keep[i + 1] && keep[i - side] && keep[i + side]
            ? 1
            : 0;
      }
    }
    const swap = keep;
    keep = next;
    next = swap;
  }

  const shot = f * px * 4;
  const keeping = still && f === frames - 1;

  for (let i = 0; i < px; i++) {
    const j = off + i * 4;
    const r = colour[j];
    const g = colour[j + 1];
    const b = colour[j + 2];

    let a = 0;
    let pr = 0;
    let pg = 0;
    let pb = 0;

    if (keep[i]) {
      const rest = r > b ? r : b;
      a = 1;
      pr = r;
      pg = g > rest ? Math.min(g, rest + lift) : g;
      pb = b;
    } else if (warmth[i]) {
      const lit = luma(r - bg[0], g - bg[1], b - bg[2]);
      a = (lit - glow[0]) / glowSpan;
      a = a < 0 ? 0 : a > 1 ? 1 : a;
      const under = 1 - a;
      pr = clamp8(r - under * bg[0]);
      pg = clamp8(g - under * bg[1]);
      pb = clamp8(b - under * bg[2]);
    }

    if (a > 0 && fadeRows > 0) {
      const x = i % side;
      const y = (i / side) | 0;
      const near = Math.min(y, x, side - 1 - x);
      if (near < fadeRows) {
        const k = near / fadeRows;
        a *= k;
        pr *= k;
        pg *= k;
        pb *= k;
      }
    }

    out32[shot + i * 4] = pr;
    out32[shot + i * 4 + 1] = pg;
    out32[shot + i * 4 + 2] = pb;
    out32[shot + i * 4 + 3] = a * 255;
    if (keeping) {
      still[i * 4] = a > 0 ? clamp8(pr / a) : 0;
      still[i * 4 + 1] = a > 0 ? clamp8(pg / a) : 0;
      still[i * 4 + 2] = a > 0 ? clamp8(pb / a) : 0;
      still[i * 4 + 3] = a * 255;
    }
  }
}

mkdirSync(dirname(out), { recursive: true });

const encode = spawn(
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
      `[rgb][a]vstack=inputs=2[stack]`,
      `[stack]addroi=x=0:y=${cell}:w=${cell}:h=${cell}:qoffset=${matteQ}[v]`,
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
  { stdio: ["pipe", "inherit", "inherit"] },
);

const poured = new Promise((ok, fail) => {
  encode.on("error", fail);
  encode.on("close", (code) =>
    code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`)),
  );
  encode.stdin.on("error", () => {});
  let at = 0;
  const chunk = 1 << 23;
  const pour = () => {
    while (at < out32.length) {
      const end = Math.min(out32.length, at + chunk);
      const room = encode.stdin.write(out32.subarray(at, end));
      at = end;
      if (!room) return;
    }
    encode.stdin.end();
  };
  encode.stdin.on("drain", pour);
  pour();
});

try {
  await poured;
} catch (e) {
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
}

let stillNote = "";
if (still) {
  const stillOut = resolve(flag("still", ""));
  const stillW = Math.round(Number(flag("still-width", cell)));
  mkdirSync(dirname(stillOut), { recursive: true });
  const shot = spawnSync(
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
      "-i",
      "-",
      "-vf",
      `scale=${stillW}:${stillW}:flags=lanczos`,
      "-frames:v",
      "1",
      "-c:v",
      "libwebp",
      "-quality",
      String(flag("still-quality", 82)),
      stillOut,
    ],
    { input: still },
  );
  if (shot.status !== 0) {
    process.stderr.write(shot.stderr?.toString() || "still failed\n");
    process.exit(1);
  }
  stillNote = `still ${stillW}px  ${(statSync(stillOut).size / 1024).toFixed(1)} kB\n${stillOut}\n`;
}

process.stdout.write(
  `${basename(input)}  ${srcW}x${srcH}  frames ${first}-${last}  ->  ` +
    `${cell}x${cell * 2} ${frames}f @${fps} crf ${crf} matte +${matteQ}  ` +
    `${(statSync(out).size / 1024).toFixed(1)} kB\n${out}\n` +
    stillNote +
    `\n{ w: ${cell}, h: ${cell}, fps: ${fps}, frames: ${frames} }\n`,
);
