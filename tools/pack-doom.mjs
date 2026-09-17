import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const JOBS = [
  {
    src: "src/source/doom/track.png",
    out: "src/assets/doom/doom-track.webp",
    slab: true,
    what: "doom track",
  },
  {
    src: "src/source/doom/fill.png",
    out: "src/assets/doom/doom-fill.webp",
    slab: false,
    maxWidth: 96,
    what: "doom charge",
  },
];

const SOLID = 128;

function probe(file) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=width,height",
      "-of",
      "csv=p=0:s=x",
      file,
    ],
    { encoding: "utf8" },
  ).trim();
  const [w, h] = out.split("x");
  return { w: Number(w), h: Number(h) };
}

function decode(file) {
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
    { maxBuffer: 1 << 30 },
  );
}

function encode(buf, w, h, file, args) {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-s",
      `${w}x${h}`,
      "-i",
      "pipe:0",
      ...(args || []),
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 30 },
  );
}

function solidRows(px, w, h) {
  let top = -1;
  let bottom = -1;
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] >= SOLID) n++;
    if (n > w * 0.5) {
      if (top < 0) top = y;
      bottom = y;
    }
  }
  return { top, bottom };
}

function solidCols(px, w, top, bottom) {
  let left = -1;
  let right = -1;
  for (let x = 0; x < w; x++) {
    let all = true;
    for (let y = top; y <= bottom; y++) {
      if (px[(y * w + x) * 4 + 3] < SOLID) {
        all = false;
        break;
      }
    }
    if (all) {
      if (left < 0) left = x;
      right = x;
    }
  }
  return { left, right };
}

function cut(px, w, x0, x1, y0, y1) {
  const cw = x1 - x0 + 1;
  const ch = y1 - y0 + 1;
  const out = Buffer.alloc(cw * ch * 4);
  for (let y = 0; y < ch; y++) {
    px.copy(
      out,
      y * cw * 4,
      ((y0 + y) * w + x0) * 4,
      ((y0 + y) * w + x1 + 1) * 4,
    );
  }
  return { px: out, w: cw, h: ch };
}

function lengthwiseSpread(px, w, h) {
  let worst = 0;
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      let lo = 255;
      let hi = 0;
      for (let x = 0; x < w; x++) {
        const v = px[(y * w + x) * 4 + c];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      if (hi - lo > worst) worst = hi - lo;
    }
  }
  return worst;
}

function narrow(px, w, h, dw) {
  const out = Buffer.alloc(dw * h * 4);
  const k = w / dw;
  for (let y = 0; y < h; y++) {
    for (let dx = 0; dx < dw; dx++) {
      const fx0 = dx * k;
      const fx1 = fx0 + k;
      const ix0 = Math.floor(fx0);
      const ix1 = Math.min(w - 1, Math.ceil(fx1) - 1);
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;
      for (let x = ix0; x <= ix1; x++) {
        const cover = Math.min(x + 1, fx1) - Math.max(x, fx0);
        if (cover <= 0) continue;
        const i = (y * w + x) * 4;
        const av = (px[i + 3] / 255) * cover;
        r += px[i] * av;
        g += px[i + 1] * av;
        b += px[i + 2] * av;
        a += av;
        area += cover;
      }
      const o = (y * dw + dx) * 4;
      out[o] = a > 0 ? Math.round(r / a) : 0;
      out[o + 1] = a > 0 ? Math.round(g / a) : 0;
      out[o + 2] = a > 0 ? Math.round(b / a) : 0;
      out[o + 3] = area > 0 ? Math.round((a / area) * 255) : 0;
    }
  }
  return out;
}

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const kb = (file) => (statSync(file).size / 1024).toFixed(1);

mkdirSync(join(ROOT, "src/assets/doom"), { recursive: true });

for (const job of JOBS) {
  const source = join(ROOT, job.src);
  const out = join(ROOT, job.out);

  const info = probe(source);
  const raw = decode(source);

  const { top, bottom } = solidRows(raw, info.w, info.h);
  if (top < 0) throw new Error(`${job.src}: nothing solid in it`);
  const { left, right } = solidCols(raw, info.w, top, bottom);
  if (left < 0)
    throw new Error(`${job.src}: no column is solid through the band`);

  let x0 = left;
  let x1 = right;
  if (job.slab) {
    const mid = ((left + right) / 2) | 0;
    const half = Math.min(30, ((right - left) / 2) | 0);
    x0 = mid - half;
    x1 = mid + half;
  }

  const art = cut(raw, info.w, x0, x1, top, bottom);
  const spread = lengthwiseSpread(art.px, art.w, art.h);

  if (job.maxWidth && art.w > job.maxWidth) {
    art.px = narrow(art.px, art.w, art.h, job.maxWidth);
    art.w = job.maxWidth;
  }

  if (flags.has("--png")) {
    encode(art.px, art.w, art.h, out.replace(/\.webp$/, ".png"));
  }
  encode(art.px, art.w, art.h, out, [
    "-c:v",
    "libwebp",
    "-lossless",
    "1",
    "-compression_level",
    "6",
  ]);

  console.log(
    `${job.what.padEnd(12)} ${info.w}x${info.h}` +
      ` -> rows ${top}..${bottom}, cols ${x0}..${x1}` +
      ` -> ${art.w}x${art.h}` +
      `   lengthwise spread ${spread}/255` +
      `   ${kb(source).padStart(7)} kB -> ${kb(out).padStart(6)} kB`,
  );
}
