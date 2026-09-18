import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IN_DIR = join(ROOT, "src/source/endcard");
const OUT_DIR = join(ROOT, "src/assets/brand");

const EMPTY = 12;

const JOBS = [
  {
    src: "33a517b4079a7f2088e5dd776a49d0878b17c4a9 (1).png",
    out: "key-art",
    width: 1500,
    mode: "photo",
    quality: 80,
    trim: false,
    what: "key art",
  },
  {
    src: "Button_05.webp",
    out: "play-now",
    width: 640,
    mode: "photo",
    what: "PLAY NOW plate",
  },
  {
    src: "Layer_2.webp",
    out: "logo-invokers",
    width: 0,
    mode: "flat",
    what: "wordmark",
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
    { maxBuffer: 1 << 29 },
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
    { input: buf, maxBuffer: 1 << 29 },
  );
}

const WEBP = {
  photo: (q) => [
    "-c:v",
    "libwebp",
    "-lossless",
    "0",
    "-quality",
    String(q === undefined ? 88 : q),
    "-compression_level",
    "6",
    "-preset",
    "drawing",
  ],
  flat: () => ["-c:v", "libwebp", "-lossless", "1", "-compression_level", "6"],
};

function inkBox(px, w, h) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] <= EMPTY) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function crop(px, w, box) {
  const out = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const src = ((y + box.y0) * w + box.x0) * 4;
    px.copy(out, y * box.w * 4, src, src + box.w * 4);
  }
  return out;
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
          const av = px8(src[i + 3]) * cover;
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

const px8 = (v) => v / 255;
const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));
const kb = (file) => (statSync(file).size / 1024).toFixed(1);

let before = 0;
let after = 0;

for (const job of JOBS) {
  const source = join(IN_DIR, job.src);
  const out = join(OUT_DIR, job.out);

  const info = probe(source);
  const raw = decode(source);
  const box =
    job.trim === false
      ? { x0: 0, y0: 0, x1: info.w - 1, y1: info.h - 1, w: info.w, h: info.h }
      : inkBox(raw, info.w, info.h);
  const trimmed = job.trim === false ? raw : crop(raw, info.w, box);

  const dw = job.width > 0 ? Math.min(job.width, box.w) : box.w;
  const dh = Math.max(1, Math.round((dw * box.h) / box.w));
  const art =
    dw === box.w && dh === box.h
      ? trimmed
      : resample(trimmed, box.w, box.h, dw, dh);

  if (flags.has("--png")) encode(art, dw, dh, `${out}.png`);
  encode(art, dw, dh, `${out}.webp`, WEBP[job.mode](job.quality));

  before += statSync(source).size;
  after += statSync(`${out}.webp`).size;

  console.log(
    `${job.what.padEnd(18)} ${String(info.w).padStart(4)}x${info.h}` +
      ` -> ${String(dw).padStart(4)}x${dh}` +
      `   ${kb(source).padStart(6)} kB -> ${kb(`${out}.webp`).padStart(6)} kB` +
      `   ${job.out}.webp  (aspect ${(dw / dh).toFixed(4)})`,
  );
}

console.log(
  `\ntotal ${(before / 1024).toFixed(1)} kB -> ${(after / 1024).toFixed(1)} kB` +
    ` — about ${(((before - after) * 4) / 3 / 1024).toFixed(0)} kB off the` +
    ` base64 in dist/km3.html.`,
);
