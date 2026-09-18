import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const JOBS = [
  {
    src: "src/source/arena/islands.webp",
    out: "src/assets/arena/sky.webp",
    floor: 0.76,
    horizon: 0.38,
    padBottom: true,
    floorMix: 0.06,
    height: 1395,
    quality: 90,
    what: "sky islands",
  },
];

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

function resample(src, sw, sh, dw, dh) {
  const out = Buffer.alloc(dw * dh * 4);
  const kx = sw / dw;
  const ky = sh / dh;

  for (let dy = 0; dy < dh; dy++) {
    const fy0 = dy * ky;
    const fy1 = fy0 + ky;
    const iy0 = Math.floor(fy0);
    const iy1 = Math.min(sh - 1, Math.ceil(fy1) - 1);

    for (let dx = 0; dx < dw; dx++) {
      const fx0 = dx * kx;
      const fx1 = fx0 + kx;
      const ix0 = Math.floor(fx0);
      const ix1 = Math.min(sw - 1, Math.ceil(fx1) - 1);

      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let area = 0;

      for (let y = iy0; y <= iy1; y++) {
        const wy = Math.min(y + 1, fy1) - Math.max(y, fy0);
        if (wy <= 0) continue;
        for (let x = ix0; x <= ix1; x++) {
          const wx = Math.min(x + 1, fx1) - Math.max(x, fx0);
          if (wx <= 0) continue;
          const i = (y * sw + x) * 4;
          const cover = wx * wy;
          const av = (src[i + 3] / 255) * cover;
          r += src[i] * av;
          g += src[i + 1] * av;
          b += src[i + 2] * av;
          a += av;
          area += cover;
        }
      }

      const o = (dy * dw + dx) * 4;
      out[o] = a > 0 ? clamp8(r / a) : 0;
      out[o + 1] = a > 0 ? clamp8(g / a) : 0;
      out[o + 2] = a > 0 ? clamp8(b / a) : 0;
      out[o + 3] = area > 0 ? clamp8((a / area) * 255) : 0;
    }
  }
  return out;
}

const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

function padRows(px, w, h, job) {
  const target = Math.round((job.floor * h) / job.horizon);
  const pad = target - h;
  if (pad <= 0) return { px, w, h };

  const out = Buffer.alloc(w * target * 4);
  px.copy(out, 0, 0, w * h * 4);

  const seed = Buffer.alloc(w * 4);
  const reach = Math.max(1, Math.round(w * 0.06));
  const src0 = (h - 1) * w * 4;
  for (let x = 0; x < w; x++) {
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (let k = -reach; k <= reach; k++) {
      const sx = Math.min(w - 1, Math.max(0, x + k));
      const i = src0 + sx * 4;
      r += px[i];
      g += px[i + 1];
      b += px[i + 2];
      n++;
    }
    seed[x * 4] = clamp8(r / n);
    seed[x * 4 + 1] = clamp8(g / n);
    seed[x * 4 + 2] = clamp8(b / n);
    seed[x * 4 + 3] = px[src0 + x * 4 + 3];
  }

  const mix = job.floorMix === undefined ? 0.3 : job.floorMix;

  for (let y = 0; y < pad; y++) {
    const t = (y + 1) / pad;
    const k = 1 - (1 - mix) * t * t;
    const row = (h + y) * w * 4;
    for (let x = 0; x < w; x++) {
      const s = x * 4;
      const d = row + x * 4;
      out[d] = clamp8(seed[s] * k);
      out[d + 1] = clamp8(seed[s + 1] * k);
      out[d + 2] = clamp8(seed[s + 2] * k);
      out[d + 3] = seed[s + 3];
    }
  }
  return { px: out, w, h: target };
}

function cropRows(px, w, h, crop) {
  const y0 = Math.round((crop.top || 0) * h);
  const y1 = Math.round((crop.bottom === undefined ? 1 : crop.bottom) * h);
  const ch = y1 - y0;
  const out = Buffer.alloc(w * ch * 4);
  px.copy(out, 0, y0 * w * 4, y1 * w * 4);
  return { px: out, w, h: ch };
}

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const kb = (file) => (statSync(file).size / 1024).toFixed(1);

for (const job of JOBS) {
  const source = join(ROOT, job.src);
  const out = join(ROOT, job.out);

  const info = probe(source);
  const raw = decode(source);

  let src = job.crop
    ? cropRows(raw, info.w, info.h, job.crop)
    : { px: raw, w: info.w, h: info.h };
  if (job.padBottom) src = padRows(src.px, src.w, src.h, job);

  const dh = Math.min(job.height, src.h);
  const dw = Math.max(1, Math.round((dh * src.w) / src.h));
  const art =
    dw === src.w && dh === src.h
      ? src.px
      : resample(src.px, src.w, src.h, dw, dh);

  if (flags.has("--png")) encode(art, dw, dh, out.replace(/\.webp$/, ".png"));
  encode(art, dw, dh, out, [
    "-c:v",
    "libwebp",
    "-lossless",
    "0",
    "-quality",
    String(job.quality),
    "-compression_level",
    "6",
    "-preset",
    "photo",
  ]);

  console.log(
    `${job.what.padEnd(12)} ${info.w}x${info.h} -> plate ${src.w}x${src.h}` +
      ` -> ${dw}x${dh}  aspect ${(dw / dh).toFixed(3)}` +
      `   ${kb(source).padStart(8)} kB -> ${kb(out).padStart(7)} kB` +
      `   (about ${((statSync(out).size * 4) / 3 / 1024).toFixed(0)} kB of` +
      ` base64 in dist/km3.html)`,
  );
}
