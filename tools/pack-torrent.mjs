import { execFileSync, spawnSync } from "node:child_process";
import { resolve, dirname, basename } from "node:path";
import { existsSync, statSync } from "node:fs";

const USAGE = `
pack-torrent — the water jet clip into one sprite sheet.

  node tools/pack-torrent.mjs <video> [options]

  The clip is painted on a green backdrop that is a smooth vertical gradient
  and uniform across x, so the key is measured per row off a column the jet
  never reaches rather than guessed at as one colour. That is what lets the
  soft edge come back: a pixel part way between the paint and the backdrop is
  read as partial coverage, and the key is unmixed back out of it.

  --frames <n>    frames to keep. Default 16.
  --start <n>     source frame the run begins at. Default 0.
  --step <n>      source frames between kept frames. Default 1, which is what
                  a flowing stream wants: frames sampled across the clip do
                  not carry the water from one to the next, and a jet built
                  out of them churns instead of running.
  --cols <n>      columns in the grid. Default 4.
  --cell <px>     width of one cell. Height follows the crop. Default 512.
  --crop <w:h:x:y>  the window on the source, applied after the flip.
                  Default 1280:380:0:152.
  --probe <a:b>   the column the backdrop is measured in, before the flip.
                  Default 4:22.
  --band <a:b>    rows the jet crosses, so the key under it is interpolated
                  rather than measured. Default 195:490.
  --soft <a:b>    where coverage starts and ends, as a fraction of the
                  backdrop's own green lead. A pixel whose green runs as far
                  ahead of its red and blue as the backdrop's does is backdrop;
                  one whose green has been overtaken is paint. Default
                  0.08:0.94.
  --lift <n>      how much green a pixel may keep over its own red and blue
                  before the despill takes it back. Default 10.
  --flip          mirror the clip, so a jet painted pointing left throws +x.
  --matte         no alpha plane either: the paint ships on top and its
                  coverage below it in grey, in one lossy image, and the two
                  are put back together at decode. libwebp writes an alpha
                  plane losslessly and on a sheet like this it costs three
                  times what the picture does; a matte carried as grey is
                  lossy like everything else. Draws with the normal blend, so
                  the paint keeps its own colour rather than washing out over
                  a lit board.
  --opaque        no alpha plane: the coverage is multiplied into the colour
                  and the sheet ships flat on black, for a flipbook that goes
                  on with the add blend, where black already is transparency.
                  A third of the size, because libwebp writes an alpha plane
                  losslessly and on a sheet like this it costs more than the
                  picture does.
  --quality <n>   webp quality. Default 82.
  --out <file>    default: src/assets/fx/<name>-sheet.webp
  --strip         also write the PNG next to it.
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
const pair = (name, fallback) =>
  String(flag(name, fallback)).split(":").map(Number);

const ROOT = resolve(dirname(new URL(import.meta.url).pathname.slice(1)), "..");
const input = resolve(args[0]);
if (!existsSync(input)) {
  process.stderr.write(`no such file: ${input}\n`);
  process.exit(1);
}

const PAD = 2;
const BS = String.fromCharCode(92);
const want = Number(flag("frames", 16));
const cols = Number(flag("cols", 4));
const cellW = Number(flag("cell", 512));
const quality = Number(flag("quality", 82));
const lift = Number(flag("lift", 10));
const flip = args.includes("--flip");
const opaque = args.includes("--opaque");
const matte = args.includes("--matte");
const [cropW, cropH, cropX, cropY] = pair("crop", "1280:380:0:152");
const [probeA, probeB] = pair("probe", "4:22");
const [bandTop, bandBottom] = pair("band", "195:490");
const [soft0, soft1] = pair("soft", "0.08:0.94");
const out = resolve(
  ROOT,
  flag(
    "out",
    `src/assets/fx/${basename(input).replace(/\.[^.]+$/, "")}-sheet.webp`,
  ),
);

const ffmpeg = (a, opts = {}) =>
  execFileSync("ffmpeg", ["-v", "error", ...a], {
    maxBuffer: 1 << 30,
    ...opts,
  });

const probe = (stream) =>
  execFileSync("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    `stream=${stream}`,
    "-of",
    "default=nw=1:nk=1",
    input,
  ])
    .toString()
    .trim();

const srcW = Number(probe("width"));
const srcH = Number(probe("height"));
const total = Number(probe("nb_frames"));
const start = Number(flag("start", 0));
const step = Math.max(1, Number(flag("step", 1)));

const rgb = (a) => ffmpeg([...a, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"]);

const still = rgb(["-ss", "2.5", "-i", input, "-frames:v", "1"]);
const rowKey = (y) => {
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let x = probeA; x <= probeB; x++) {
    const i = (y * srcW + x) * 3;
    r += still[i];
    g += still[i + 1];
    b += still[i + 2];
    n++;
  }
  return [r / n, g / n, b / n];
};

const measured = new Array(srcH);
for (let y = 0; y < srcH; y++) {
  if (y < bandTop || y > bandBottom) measured[y] = rowKey(y);
}
const key = new Array(srcH);
for (let y = 0; y < srcH; y++) {
  if (!measured[y]) continue;
  let acc = [0, 0, 0],
    n = 0;
  for (let k = -6; k <= 6; k++) {
    const s = measured[y + k];
    if (!s) continue;
    acc[0] += s[0];
    acc[1] += s[1];
    acc[2] += s[2];
    n++;
  }
  key[y] = [acc[0] / n, acc[1] / n, acc[2] / n];
}
const above = key[bandTop - 1];
const below = key[bandBottom + 1];
for (let y = bandTop; y <= bandBottom; y++) {
  const t = (y - bandTop + 1) / (bandBottom - bandTop + 2);
  key[y] = [
    above[0] + (below[0] - above[0]) * t,
    above[1] + (below[1] - above[1]) * t,
    above[2] + (below[2] - above[2]) * t,
  ];
}
for (let y = 0; y < srcH; y++) {
  if (!key[y]) continue;
  key[y][3] = Math.max(1, key[y][1] - Math.max(key[y][0], key[y][2]));
}

const window = `crop=${cropW}:${cropH}:${cropX}:${cropY}`;
const chain = flip ? `hflip,${window}` : window;
const frames = rgb([
  "-i",
  input,
  "-vf",
  `select=gte(n${BS},${start}),framestep=${step},${chain}`,
  "-frames:v",
  String(want),
  "-fps_mode",
  "passthrough",
]);
const cellPixels = cropW * cropH;
const count = Math.min(want, Math.floor(frames.length / (cellPixels * 3)));

const keyAt = (x, y) => {
  const sx = flip ? srcW - 1 - (cropX + x) : cropX + x;
  return { k: key[cropY + y], sx };
};

const rgba = Buffer.alloc(count * cellPixels * 4);
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v);
for (let f = 0; f < count; f++) {
  for (let y = 0; y < cropH; y++) {
    const k = keyAt(0, y).k;
    for (let x = 0; x < cropW; x++) {
      const si = (f * cellPixels + y * cropW + x) * 3;
      const di = (f * cellPixels + y * cropW + x) * 4;
      const r = frames[si],
        g = frames[si + 1],
        b = frames[si + 2];
      const lead = (g - Math.max(r, b)) / k[3];
      let a = (soft1 - lead) / (soft1 - soft0);
      a = a < 0 ? 0 : a > 1 ? 1 : a;
      a = a * a * (3 - 2 * a);
      if (a <= 0) continue;
      let cr = r,
        cg = g,
        cb = b;
      if (a < 1) {
        cr = (r - (1 - a) * k[0]) / a;
        cg = (g - (1 - a) * k[1]) / a;
        cb = (b - (1 - a) * k[2]) / a;
      }
      cr = clamp(cr);
      cg = clamp(cg);
      cb = clamp(cb);
      const roof = Math.max(cr, cb) + lift;
      if (cg > roof) cg = roof;
      rgba[di] = opaque ? Math.round(cr * a) : cr;
      rgba[di + 1] = opaque ? Math.round(cg * a) : cg;
      rgba[di + 2] = opaque ? Math.round(cb * a) : cb;
      rgba[di + 3] = opaque ? 255 : Math.round(a * 255);
    }
  }
}

const rows = Math.ceil(count / cols);
const cellH =
  Math.round((cellW * cropH) / cropW) +
  (Math.round((cellW * cropH) / cropW) % 2);
const render = (target, extra) =>
  spawnSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-y",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${cropW}x${cropH}`,
      "-i",
      "pipe:0",
      ...(matte
        ? [
            "-filter_complex",
            [
              `[0:v]scale=${cellW}:${cellH}:flags=lanczos,`,
              `tile=${cols}x${rows}:padding=${PAD}:margin=${PAD}:color=#00000000,`,
              "format=rgba[s];",
              "[s]split[p][m];",
              "[p]format=rgb24[paint];",
              "[m]format=rgba,alphaextract,format=rgb24[cover];",
              "[paint][cover]vstack",
            ].join(""),
          ]
        : [
            "-vf",
            [
              `scale=${cellW}:${cellH}:flags=lanczos`,
              `tile=${cols}x${rows}:padding=${PAD}:margin=${PAD}:color=#00000000`,
            ].join(","),
          ]),
      "-frames:v",
      "1",
      ...extra,
      target,
    ],
    { input: rgba, maxBuffer: 1 << 30 },
  );

const run = (target, extra) => {
  const r = render(target, extra);
  if (r.status !== 0) {
    process.stderr.write(String(r.stderr || r.error || "ffmpeg failed"));
    process.exit(1);
  }
};

if (args.includes("--strip")) run(out.replace(/\.webp$/, ".png"), []);
run(out, [
  ...(opaque || matte ? ["-pix_fmt", "yuv420p"] : []),
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
  `${basename(input)}  ${srcW}x${srcH} ${total}f  ->  ${count} frames  ` +
    `${cols}x${rows} grid of ${cellW}x${cellH}  ` +
    `${cols * (cellW + PAD) + PAD}x${rows * (cellH + PAD) + PAD}${matte ? " paint over matte" : ""}  ${kb(out)} kB\n${out}\n\n` +
    `const SHEET = { cols: ${cols}, cellW: ${cellW}, cellH: ${cellH}, ` +
    `pad: ${PAD}, count: ${count}` +
    `${matte ? `, block: ${rows * (cellH + PAD) + PAD}` : ""} };\n`,
);
