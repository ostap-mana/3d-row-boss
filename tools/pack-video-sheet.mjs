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
  --crop <w:h:x:y>  crop the source before scaling, so a subject adrift in a
                  wide frame fills its cell instead of paying for empty air.
                  The cell's height then follows the crop's aspect.
  --key <hex>     the colour to knock out. Default: sampled from the first
                  frame's top-left pixel.
  --similarity    how far from that colour still counts as background,
                  0..1. Default 0.14. Raise it if green survives around her,
                  lower it if her hair or armour start going transparent.
  --flood         key in a flood from the frame border instead of by colour
                  alone, and unmix the key back out of the soft edge. Use it
                  whenever the subject holds something the key colour — a green
                  drink, a green gem — which a flat colour key eats.
  --range <a:b>   sample between these source frames instead of across the
                  whole clip, so a gesture that happens early is not reduced to
                  two frames of a long hold.
  --pocket <n>    --flood only. How close to the key an enclosed pocket has to
                  average before it counts as backdrop seen through a gap —
                  RGB distance, default 20. It is what tells the hole under a
                  raised arm from the green drink in her hand.
  --despill <px>  --flood only. Width of the band inside the matte edge that
                  gets its green pulled back to the rest of its own colour,
                  which is where screen bounce lives. Default 4, 0 is off.
  --lift <n>      --flood only. How much green that band is still allowed over
                  its own red and blue. Default 8; raise it if something that
                  is genuinely green goes grey at the edge.
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
const cropBox = flag("crop", null);
const range = flag("range", null);
const flood = args.includes("--flood");
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
const [lo, hi] = range ? range.split(":").map(Number) : [0, total - 1];
const picks = [];
for (let i = 0; i < count; i++) {
  picks.push(lo + Math.round((i * (hi - lo)) / Math.max(1, count - 1)));
}
const unique = [...new Set(picks)];
const rows = Math.ceil(unique.length / cols);
const PAD = 2;
const even = (n) => Math.round(n / 2) * 2;
const [cropW, cropH] = cropBox ? cropBox.split(":").map(Number) : [srcW, srcH];
const cellH = even((cellW * cropH) / cropW);

const pick = `select='${unique.map((n) => `eq(n\\,${n})`).join("+")}'`;

const chain = [
  pick,
  "format=rgba",
  ...(flood ? [] : [`colorkey=0x${key}:${similarity}:${blend}`]),
  ...(cropBox ? [`crop=${cropBox}`] : []),
  `scale=${cellW}:${cellH}:flags=lanczos`,
  `tile=${cols}x${rows}:padding=${PAD}:margin=${PAD}:color=#00000000`,
].join(",");

mkdirSync(dirname(out), { recursive: true });

const keyRgb = [0, 2, 4].map((i) => parseInt(key.slice(i, i + 2), 16));
const keyChroma = keyRgb[1] - Math.max(keyRgb[0], keyRgb[2]);
const CUT = keyChroma * (1 - similarity);
const RAMP = Math.max(4, keyChroma * Math.max(blend, 0.3));
const HOLD = CUT - RAMP;
const POCKET_NEAR = Number(flag("pocket", 20));
const DESPILL = Math.round(Number(flag("despill", 4)));
const SPILL_LIFT = Math.round(Number(flag("lift", 8)));

function knockOut(px, w, h) {
  const n = w * h;
  const alpha = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = px[i * 4 + 1] - Math.max(px[i * 4], px[i * 4 + 2]);
    alpha[i] = d >= CUT ? 0 : d <= HOLD ? 1 : (CUT - d) / RAMP;
  }

  const seen = new Uint8Array(n);
  const stack = [];
  const reach = (i) => {
    if (!seen[i] && alpha[i] < 1) {
      seen[i] = 1;
      stack.push(i);
    }
  };
  for (let x = 0; x < w; x++) {
    reach(x);
    reach((h - 1) * w + x);
  }
  for (let y = 0; y < h; y++) {
    reach(y * w);
    reach(y * w + w - 1);
  }
  while (stack.length) {
    const i = stack.pop();
    const x = i % w;
    if (x > 0) reach(i - 1);
    if (x < w - 1) reach(i + 1);
    if (i >= w) reach(i - w);
    if (i < n - w) reach(i + w);
  }

  const taken = new Uint8Array(n);
  for (let start = 0; start < n; start++) {
    if (seen[start] || taken[start] || alpha[start] >= 1) continue;
    const cell = [start];
    taken[start] = 1;
    let head = 0;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    while (head < cell.length) {
      const i = cell[head++];
      sr += px[i * 4];
      sg += px[i * 4 + 1];
      sb += px[i * 4 + 2];
      const x = i % w;
      const nb = [
        x > 0 ? i - 1 : -1,
        x < w - 1 ? i + 1 : -1,
        i >= w ? i - w : -1,
        i < n - w ? i + w : -1,
      ];
      for (const j of nb) {
        if (j < 0 || taken[j] || seen[j] || alpha[j] >= 1) continue;
        taken[j] = 1;
        cell.push(j);
      }
    }
    const dr = sr / cell.length - keyRgb[0];
    const dg = sg / cell.length - keyRgb[1];
    const db = sb / cell.length - keyRgb[2];
    if (Math.sqrt(dr * dr + dg * dg + db * db) > POCKET_NEAR) continue;
    for (const i of cell) seen[i] = 1;
  }

  const band = new Uint8Array(n);
  if (DESPILL > 0) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (seen[i] ? alpha[i] >= 1 : true) continue;
        for (let dy = -DESPILL; dy <= DESPILL; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -DESPILL; dx <= DESPILL; dx++) {
            const xx = x + dx;
            if (xx < 0 || xx >= w) continue;
            band[yy * w + xx] = 1;
          }
        }
      }
    }
  }

  for (let i = 0; i < n; i++) {
    const a = seen[i] ? alpha[i] : 1;
    if (a <= 0) {
      px[i * 4] = 0;
      px[i * 4 + 1] = 0;
      px[i * 4 + 2] = 0;
      px[i * 4 + 3] = 0;
      continue;
    }
    if (a < 1) {
      for (let c = 0; c < 3; c++) {
        const v = (px[i * 4 + c] - (1 - a) * keyRgb[c]) / a;
        px[i * 4 + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    }
    if (band[i]) {
      const lid = Math.max(px[i * 4], px[i * 4 + 2]) + SPILL_LIFT;
      if (px[i * 4 + 1] > lid) px[i * 4 + 1] = lid;
    }
    px[i * 4 + 3] = Math.round(a * 255);
  }
}

const floodFrames = () => {
  const [cw, ch, cx, cy] = cropBox
    ? cropBox.split(":").map(Number)
    : [srcW, srcH, 0, 0];
  const raw = ffmpeg([
    "-i",
    input,
    "-fps_mode",
    "passthrough",
    "-vf",
    [pick, "format=rgba", `crop=${cw}:${ch}:${cx}:${cy}`].join(","),
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-",
  ]);
  const step = cw * ch * 4;
  for (let i = 0; i + step <= raw.length; i += step) {
    knockOut(raw.subarray(i, i + step), cw, ch);
  }
  return { raw, cw, ch };
};

const render = (target, extra = []) => {
  if (!flood) {
    return ffmpeg([
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
  }
  const { raw, cw, ch } = keyed;
  return ffmpeg(
    [
      "-y",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${cw}x${ch}`,
      "-i",
      "pipe:0",
      "-vf",
      [
        `scale=${cellW}:${cellH}:flags=lanczos`,
        `tile=${cols}x${rows}:padding=${PAD}:margin=${PAD}:color=#00000000`,
      ].join(","),
      "-frames:v",
      "1",
      ...extra,
      target,
    ],
    { input: raw },
  );
};

const keyed = flood ? floodFrames() : null;

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
    `${cols * (cellW + PAD) + PAD}x${rows * (cellH + PAD) + PAD}  ` +
    `key #${key}  ${kb(out)} kB\n${out}\n\n` +
    `const SHEET = { cols: ${cols}, cellW: ${cellW}, cellH: ${cellH}, ` +
    `pad: ${PAD}, count: ${unique.length} };\n`,
);
