import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "masters/ui/cta-banner.webp");
const OUT = join(ROOT, "src/assets/ui/cta-banner");

const EMPTY = 12;

const WIDTH = 512;

const RIM = 60;

const RIM_RUN = 3;

const LABEL_BAND = 0.72;

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

function barBand(px, w, h) {
  const cover = [];
  let max = 0;
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) if (px[(y * w + x) * 4 + 3] > 128) n++;
    cover.push(n);
    if (n > max) max = n;
  }
  let y0 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    if (cover[y] < max * 0.55) continue;
    if (y0 < 0) y0 = y;
    y1 = y;
  }
  return { y0, y1 };
}

function innerEdge(px, w, h, cx, cy, dx, dy) {
  let dark = 0;
  let x = cx;
  let y = cy;
  let last = dy ? cy : cx;
  while (x >= 0 && y >= 0 && x < w && y < h) {
    const i = (y * w + x) * 4;
    const lit = px[i + 3] > 128 && Math.max(px[i], px[i + 1], px[i + 2]) > RIM;
    if (lit) {
      dark = 0;
      last = dy ? y : x;
    } else if (++dark >= RIM_RUN) {
      break;
    }
    x += dx;
    y += dy;
  }
  return last;
}

function labelBox(px, w, h, band) {
  const cx = Math.round(w / 2);
  const cy = Math.round((band.y0 + band.y1) / 2);

  const top = innerEdge(px, w, h, cx, cy, 0, -1);
  const bottom = innerEdge(px, w, h, cx, cy, 0, 1);
  const half = Math.round(((bottom - top) * LABEL_BAND) / 2);

  let left = 0;
  let right = w - 1;
  for (let y = cy - half; y <= cy + half; y++) {
    left = Math.max(left, innerEdge(px, w, h, cx, y, -1, 0));
    right = Math.min(right, innerEdge(px, w, h, cx, y, 1, 0));
  }
  return { x0: left, y0: cy - half, x1: right, y1: cy + half };
}

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

const info = probe(SOURCE);
const raw = decode(SOURCE);
console.log(`in   masters/ui/cta-banner.webp  ${info.w}x${info.h}`);

const box = inkBox(raw, info.w, info.h);
console.log(
  `     ink   ${box.w}x${box.h} at ${box.x0},${box.y0}` +
    `  (trimmed ${info.w - box.w}x${info.h - box.h})`,
);

const trimmed = crop(raw, info.w, box);
const dh = Math.max(1, Math.round((WIDTH * box.h) / box.w));
const art = resample(trimmed, box.w, box.h, WIDTH, dh);
console.log(
  `     scale ${box.w}x${box.h} -> ${WIDTH}x${dh}` +
    `  (1:${(box.w / WIDTH).toFixed(2)}, aspect ${(WIDTH / dh).toFixed(4)})`,
);

const band = barBand(trimmed, box.w, box.h);
const label = labelBox(trimmed, box.w, box.h, band);
const f = (v, of) => (v / of).toFixed(4);

console.log(`\n     measured on the trimmed art, as fractions of it:`);
console.log(
  `     bar    y ${band.y0}..${band.y1}` +
    `  -> top ${f(band.y0, box.h)}  bottom ${f(band.y1 + 1, box.h)}` +
    `  height ${f(band.y1 - band.y0 + 1, box.h)}`,
);
console.log(
  `     label  x ${label.x0}..${label.x1}  y ${label.y0}..${label.y1}` +
    `  -> w ${f(label.x1 - label.x0 + 1, box.w)}  h ${f(label.y1 - label.y0 + 1, box.h)}`,
);
console.log(
  `     label centre off art centre:` +
    ` x ${(((label.x0 + label.x1 + 1) / 2 - box.w / 2) / box.w).toFixed(4)}` +
    ` y ${(((label.y0 + label.y1 + 1) / 2 - box.h / 2) / box.h).toFixed(4)}`,
);

if (flags.has("--png")) {
  encode(art, WIDTH, dh, `${OUT}.png`);
  console.log(`\nout  ${rel(OUT)}.png`);
}

encode(art, WIDTH, dh, `${OUT}.webp`, [
  "-c:v",
  "libwebp",
  "-lossless",
  "0",
  "-quality",
  "86",
  "-compression_level",
  "6",
  "-preset",
  "drawing",
]);
console.log(`out  ${rel(OUT)}.webp`);

if (flags.has("--guides")) {
  const test = Buffer.from(art);
  const k = WIDTH / box.w;
  const sx = (v) => Math.round(v * k);
  const sy = (v) => Math.round(v * k);
  const dot = (x, y, c) => {
    if (x < 0 || y < 0 || x >= WIDTH || y >= dh) return;
    const i = (y * WIDTH + x) * 4;
    test[i] = c[0];
    test[i + 1] = c[1];
    test[i + 2] = c[2];
    test[i + 3] = 255;
  };
  for (let x = 0; x < WIDTH; x++) {
    dot(x, sy(band.y0), [0, 255, 0]);
    dot(x, sy(band.y1), [0, 255, 0]);
  }
  for (let x = sx(label.x0); x <= sx(label.x1); x++) {
    dot(x, sy(label.y0), [0, 255, 255]);
    dot(x, sy(label.y1), [0, 255, 255]);
  }
  for (let y = sy(label.y0); y <= sy(label.y1); y++) {
    dot(sx(label.x0), y, [0, 255, 255]);
    dot(sx(label.x1), y, [0, 255, 255]);
  }
  encode(test, WIDTH, dh, `${OUT}-guides.png`);
  console.log(`out  ${rel(OUT)}-guides.png`);
}

function rel(p) {
  return p.slice(ROOT.length + 1).replace(/\\/g, "/");
}
