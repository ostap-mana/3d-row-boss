import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "masters/board/frame-nobg.png");
const OUT = join(ROOT, "src/assets/board/frame");

const EMPTY = 12;

const HEIGHT = 680;

const FIELD = 90;

const SOLID = 128;

const RUN = 4;

const SHADOW_SPREAD = 14;
const SHADOW_LO = 70;
const SHADOW_HI = 215;

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

function clean(px) {
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] > EMPTY) continue;
    px[i] = 0;
    px[i + 1] = 0;
    px[i + 2] = 0;
    px[i + 3] = 0;
  }
}

function unshadow(px, w, h) {
  let cleared = 0;
  for (let i = 0; i < w * h; i++) {
    const o = i * 4;
    if (px[o + 3] <= EMPTY) continue;
    const max = Math.max(px[o], px[o + 1], px[o + 2]);
    const min = Math.min(px[o], px[o + 1], px[o + 2]);
    if (max - min > SHADOW_SPREAD) continue;
    const lum = 0.2126 * px[o] + 0.7152 * px[o + 1] + 0.0722 * px[o + 2];
    if (lum < SHADOW_LO || lum > SHADOW_HI) continue;
    px[o] = 0;
    px[o + 1] = 0;
    px[o + 2] = 0;
    px[o + 3] = 0;
    cleared++;
  }
  return cleared;
}

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

function opening(px, w, h) {
  const lum = (i) => 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  const cx = Math.round(w / 2);
  const cy = Math.round(h / 2);

  const walk = (dx, dy) => {
    let x = cx;
    let y = cy;
    let lit = 0;
    let last = dy ? cy : cx;
    while (x > 0 && y > 0 && x < w - 1 && y < h - 1) {
      const i = (y * w + x) * 4;
      if (px[i + 3] < SOLID || lum(i) > FIELD) {
        if (++lit >= RUN) return last;
      } else {
        lit = 0;
        last = dy ? y : x;
      }
      x += dx;
      y += dy;
    }
    return last;
  };

  const x0 = walk(-1, 0);
  const x1 = walk(1, 0);
  const y0 = walk(0, -1);
  const y1 = walk(0, 1);
  return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

const info = probe(SOURCE);
const raw = decode(SOURCE);
console.log(`in   ${rel(SOURCE)}  ${info.w}x${info.h}`);

clean(raw);
const shadow = unshadow(raw, info.w, info.h);
const box = inkBox(raw, info.w, info.h);
console.log(`     shadow ${shadow} px cleared`);
console.log(
  `     ink   ${box.w}x${box.h} at ${box.x0},${box.y0}` +
    `  (trimmed ${info.w - box.w}x${info.h - box.h})`,
);

const trimmed = crop(raw, info.w, box);
const dh = Math.min(HEIGHT, box.h);
const dw = Math.max(1, Math.round((dh * box.w) / box.h));
const art =
  dw === box.w && dh === box.h
    ? trimmed
    : resample(trimmed, box.w, box.h, dw, dh);
console.log(
  `     pack  ${box.w}x${box.h} -> ${dw}x${dh}` +
    `  (1:${(box.w / dw).toFixed(2)}, aspect ${(dw / dh).toFixed(4)})`,
);

const open = opening(art, dw, dh);

console.log(`\n     what art/boardframe.js needs, in packed pixels:`);
console.log(`     art     { w: ${dw}, h: ${dh} }`);
console.log(
  `     opening { x: ${open.x}, y: ${open.y}, w: ${open.w}, h: ${open.h} }` +
    `   — ${((open.w / dw) * 100).toFixed(1)}% of the width,` +
    ` ${((open.h / dh) * 100).toFixed(1)}% of the height`,
);
console.log(
  `     border  left ${open.x}  right ${dw - open.x - open.w}` +
    `  top ${open.y}  bottom ${dh - open.y - open.h}`,
);

if (flags.has("--png")) {
  encode(art, dw, dh, `${OUT}.png`);
  console.log(`\nout  ${rel(OUT)}.png`);
}

encode(art, dw, dh, `${OUT}.webp`, [
  "-c:v",
  "libwebp",
  "-lossless",
  "0",
  "-quality",
  "78",
  "-compression_level",
  "6",
  "-preset",
  "picture",
]);
console.log(
  `out  ${rel(OUT)}.webp  ${kb(`${OUT}.webp`)} kB` +
    `  (about ${((statSync(`${OUT}.webp`).size * 4) / 3 / 1024).toFixed(0)} kB` +
    ` of base64 in dist/km5.html)`,
);

if (flags.has("--guides")) {
  const test = Buffer.from(art);
  const dot = (x, y) => {
    if (x < 0 || y < 0 || x >= dw || y >= dh) return;
    const i = (y * dw + x) * 4;
    test[i] = 0;
    test[i + 1] = 255;
    test[i + 2] = 255;
    test[i + 3] = 255;
  };
  for (let x = open.x; x < open.x + open.w; x++) {
    dot(x, open.y);
    dot(x, open.y + open.h - 1);
  }
  for (let y = open.y; y < open.y + open.h; y++) {
    dot(open.x, y);
    dot(open.x + open.w - 1, y);
  }
  encode(test, dw, dh, `${OUT}-guides.png`);
  console.log(`out  ${rel(OUT)}-guides.png`);
}

function kb(file) {
  return (statSync(file).size / 1024).toFixed(1);
}

function rel(p) {
  return p.slice(ROOT.length + 1).replace(/\\/g, "/");
}
