import { execFileSync, spawn, spawnSync } from "node:child_process";
import { resolve, dirname, join, basename, extname } from "node:path";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";

const USAGE = `
pack-figure-clip — a matted clip into one mp4 that carries alpha, with the
subject's own colour left exactly as it was generated.

  node tools/pack-figure-clip.mjs <video> --matte <dir> [options]

  The other two packers both decide what is subject with colour, and both
  paid for it on the win card. pack-alpha-clip multiplies the matte by a
  green key, and a cloak in shadow is the same green as the backdrop, so it
  cut holes through him. pack-green-clip needs no matte at all, but it
  despills everything it keeps — green pulled down to the rest of the pixel —
  and the mage's tome is genuinely green, so it shipped grey.

  Here colour is never asked. The matte is the answer, whole: alpha is what
  MatAnyone said and nothing multiplies it, nothing erodes it. Where alpha is
  1 the pixel ships byte for byte as it was generated, so the tome keeps its
  green and the cloak keeps its black. Only the soft edge is touched, and
  there by unmixing rather than by judging: a pixel that is a of the subject
  over 1-a of the backdrop gives the subject back as (C - (1-a)bg)/a, which
  is the identity at a = 1 and the reason nothing inside the silhouette can
  change.

  A pixel the matte does not hold at all can still be lit, and light does not
  cover anything: it adds. So it ships with the alpha it earned — nothing, for
  a haze — and a colour that is only what the light put there, which a
  premultiplied blend adds straight onto the card. That is the difference
  between a glow and the olive cloud an earlier cut of this card shipped: the
  cloud was backdrop green carried along at the glow's own alpha.

  What a propagated matte cannot hold is what was never attached to the
  subject: a star in mid-flight is its own object, and the halo it throws on
  the backdrop is not an object at all. Outside the silhouette, though, the
  only things in the plate are the backdrop, that light and those stars, so
  the question is no longer what a pixel is but how far it is from a flat
  green nobody has to guess at. Anything warmer than the backdrop ships as
  premultiplied light with an alpha that follows that distance: the haze falls
  away, the trails stay gold and a star, which is nowhere near green, comes
  out whole. --no-light drops it.

  --matte <dir>   directory of matte frames, one per source frame, numbered.
                  White is the subject. Required.
  --cell <px>     width of the output; the picture tile is square and the
                  file is twice as tall. Default 512.
  --crf <n>       x264 quality. Default 23.
  --matte-q <n>   how much coarser the matte tile is coded than the picture,
                  as an x264 ROI quantiser offset. Default 0.2.
  --warm <n>      how much red a pixel outside the silhouette must have over
                  the backdrop before it counts as light at all. Default 8,
                  which keeps the shadow the figure throws on the backdrop out
                  of it.
  --glow <a:b>    how far such a pixel must sit from the backdrop colour, as a
                  distance in rgb, before it is worth keeping, and where it is
                  kept whole. Default 30:150. Distance rather than brightness
                  because a gold star is darker in blue than the green it was
                  lit on, and every test written on brightness alone dropped
                  its shaded half.
  --no-light      keep only what the matte holds.
  --fade <px>     how far in from the top and sides alpha ramps to nothing,
                  in output pixels. Default 0 — a matte that never reaches an
                  edge needs none, and the check prints what it found.
  --range <a:b>   source frames to keep, inclusive. Default: all of them.
  --work <px>     the square side the frames are read and keyed at, before
                  the output is scaled down to --cell. Default: the source's
                  short side, and the matte's own resolution is the one worth
                  asking for — a long clip at 960 is a gigabyte of frames in
                  memory twice over.
  --fps <n>       override the source rate. Default: the source's own.
  --still <file>  also write the last frame as a webp with straight alpha —
                  what the card shows on a webview that will not play the
                  clip.
  --still-width <px>  width of that still. Default: --cell.
  --still-quality <n>  its webp quality. Default 82.
  --out <file>    default: src/assets/outcome/<name>.mp4

  node tools/pack-figure-clip.mjs victory-30.mp4 --matte matte30/pha \\
    --still src/assets/outcome/victory-figure.webp
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
const matteQ = Number(flag("matte-q", 0.2));
const warm = Number(flag("warm", 8));
const glow = String(flag("glow", "30:150")).split(":").map(Number);
const lighting = !args.includes("--no-light");
const fade = Number(flag("fade", 0));
const range = String(flag("range", "")).split(":").map(Number);

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
const side =
  Math.round(Number(flag("work", Math.min(Number(srcW), Number(srcH)))) / 2) *
  2;

const colour = execFileSync(
  "ffmpeg",
  [
    "-v",
    "error",
    "-i",
    input,
    "-vf",
    `scale=${side}:${side}:flags=lanczos`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-",
  ],
  { maxBuffer: 2 * (1 << 30) },
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
    `scale=${side}:${side}:flags=bicubic`,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "gray",
    "-",
  ],
  { maxBuffer: 2 * (1 << 30) },
);

const px = side * side;
const available = Math.min(
  Math.floor(colour.length / (px * 4)),
  Math.floor(alpha.length / px),
);
const first = Number.isFinite(range[0]) ? Math.max(0, range[0]) : 0;
const last = Number.isFinite(range[1])
  ? Math.min(available - 1, range[1])
  : available - 1;
const frames = last - first + 1;
if (frames <= 0) {
  process.stderr.write(`range ${first}:${last} has no frames\n`);
  process.exit(1);
}

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

const out32 = Buffer.alloc(px * 4 * frames);
const stillPath = flag("still", null);
const still = stillPath ? Buffer.alloc(px * 4) : null;
const glowSpan = Math.max(1, glow[1] - glow[0]);
const fadeRows = Math.round((fade * side) / cell);
const rim = { top: 0, left: 0, right: 0, bottom: 0 };
let untouched = 0;
let lit = 0;

for (let f = 0; f < frames; f++) {
  const off = (first + f) * px * 4;
  const moff = (first + f) * px;
  const bg = borderMedian(off);
  const shot = f * px * 4;
  const keeping = still && f === frames - 1;

  for (let i = 0; i < px; i++) {
    const j = off + i * 4;
    const r = colour[j];
    const g = colour[j + 1];
    const b = colour[j + 2];
    const am = alpha[moff + i] / 255;

    let a = am;
    let pr = 0;
    let pg = 0;
    let pb = 0;
    let shining = false;

    if (am >= 1) {
      pr = r;
      pg = g;
      pb = b;
      untouched++;
    } else {
      if (lighting) {
        const dr = r - bg[0];
        const dg = g - bg[1];
        const db = b - bg[2];
        if (dr > warm) {
          shining = true;
          let al = (Math.hypot(dr, dg, db) - glow[0]) / glowSpan;
          al = al < 0 ? 0 : al > 1 ? 1 : al;
          if (al > a) a = al;
          lit++;
        }
      }
      if (a > 0 || shining) {
        pr = clamp8(r - (1 - a) * bg[0]);
        pg = clamp8(g - (1 - a) * bg[1]);
        pb = clamp8(b - (1 - a) * bg[2]);
      }
    }

    if (fadeRows > 0 && (a > 0 || shining)) {
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

    if (a > 0) {
      const x = i % side;
      const y = (i / side) | 0;
      const edged = Math.round(a * 255);
      if (y === 0 && edged > rim.top) rim.top = edged;
      if (y === side - 1 && edged > rim.bottom) rim.bottom = edged;
      if (x === 0 && edged > rim.left) rim.left = edged;
      if (x === side - 1 && edged > rim.right) rim.right = edged;
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
  const stillOut = resolve(stillPath);
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

const held = (100 * untouched) / (px * frames);
const halo = (100 * lit) / (px * frames);

process.stdout.write(
  `${basename(input)}  ${srcW}x${srcH}  +  ${sheet.length} matte  ->  ` +
    `${cell}x${cell * 2} ${frames}f @${fps} crf ${crf} matte +${matteQ}  ` +
    `${(statSync(out).size / 1024).toFixed(1)} kB\n${out}\n` +
    stillNote +
    `opaque and untouched ${held.toFixed(1)}% of pixels, ` +
    `light ${halo.toFixed(2)}%\n` +
    `max alpha on an edge: top ${rim.top}, left ${rim.left}, ` +
    `right ${rim.right}, bottom ${rim.bottom}\n` +
    `\n{ w: ${cell}, h: ${cell}, fps: ${fps}, frames: ${frames} }\n`,
);
