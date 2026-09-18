import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = {
  trough: join(ROOT, "masters/board/bars/progress-2-blue.png"),
  green: join(ROOT, "masters/board/bars/green.webp"),
  blue: join(ROOT, "masters/board/bars/blue.webp"),
};
const OUT = join(ROOT, "src/assets/board/bar");

const SIZE = {
  trough: { w: 160, h: 16 },
  paint: { w: 160, h: 16 },
};

const PAINTS = [
  { src: "green", name: "hp", also: { name: "hp-low", recolour: 0xff3b2f } },
  { src: "blue", name: "mana" },
];

const EMPTY = 12;

const SOLID = 250;

const BODY_ROW = 0.5;

const END_MARGIN = 2;

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

const LOSSLESS = [
  "-c:v",
  "libwebp",
  "-lossless",
  "1",
  "-compression_level",
  "6",
];

const at = (w, x, y) => (y * w + x) * 4;

function inkBox(px, w, h) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[at(w, x, y) + 3] <= EMPTY) continue;
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
    const src = at(w, box.x0, y + box.y0);
    px.copy(out, y * box.w * 4, src, src + box.w * 4);
  }
  return out;
}

function paintEdge(px, w, h) {
  let last = -1;
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      const i = at(w, x, y);
      const [r, g, b, a] = [px[i], px[i + 1], px[i + 2], px[i + 3]];
      if (a > 100 && b > 90 && b - r > 35 && g > 45) {
        last = x;
        break;
      }
    }
  }
  return last;
}

function rim(px, w, h, x) {
  const lum = (y) => {
    const i = at(w, x, y);
    return (px[i] * 2 + px[i + 1] * 5 + px[i + 2]) / 8;
  };
  let floor = 255;
  for (let y = 0; y < h; y++) floor = Math.min(floor, lum(y));
  const dark = floor + 6;

  let top = 0;
  while (top < h && lum(top) > dark) top++;
  let bottom = 0;
  while (bottom < h && lum(h - 1 - bottom) > dark) bottom++;
  return { top, bottom };
}

function bore(px, w, h, paintTo, edges) {
  const cap = Math.round(h / 2);
  const midFrom = paintTo + END_MARGIN;
  const midTo = w - cap;
  const top = edges.top;
  const oh = h - edges.top - edges.bottom;
  const out = Buffer.alloc(w * oh * 4);

  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < w; x++) {
      const t = x / Math.max(1, w - 1);
      const sx = Math.min(
        w - 1,
        midFrom + Math.round(t * (midTo - midFrom - 1)),
      );
      const s = at(w, sx, y + top);
      const d = (y * w + x) * 4;
      out[d] = px[s];
      out[d + 1] = px[s + 1];
      out[d + 2] = px[s + 2];
      out[d + 3] = px[s + 3];
    }
  }
  return { px: out, w, h: oh };
}

function bodyRows(px, w, h) {
  const opaque = [];
  for (let y = 0; y < h; y++) {
    let n = 0;
    for (let x = 0; x < w; x++) {
      if (px[at(w, x, y) + 3] >= SOLID) n++;
    }
    opaque.push(n);
  }

  const most = Math.max(...opaque);
  let y0 = 0;
  while (y0 < h && opaque[y0] < most * BODY_ROW) y0++;
  let y1 = h - 1;
  while (y1 > y0 && opaque[y1] < most * BODY_ROW) y1--;
  return { y0, y1 };
}

function flatSlab(px, w, h) {
  const box = inkBox(px, w, h);
  const body = bodyRows(px, w, h);
  const solid = (x) => {
    for (let y = body.y0; y <= body.y1; y++) {
      if (px[at(w, x, y) + 3] < SOLID) return false;
    }
    return true;
  };

  let left = box.x0;
  while (left < box.x1 && !solid(left)) left++;
  let right = box.x1;
  while (right > left && !solid(right)) right--;

  left = Math.min(left + END_MARGIN, box.x1);
  right = Math.max(right - END_MARGIN, left);
  return {
    x0: left,
    y0: box.y0,
    w: right - left + 1,
    h: box.h,
    ends: { left: left - box.x0, right: box.x1 - right },
  };
}

function recolour(px, w, h, color) {
  const lum = (y) => {
    const i = at(w, 0, y);
    return (px[i] * 2 + px[i + 1] * 5 + px[i + 2]) / 8;
  };
  let mean = 0;
  for (let y = 0; y < h; y++) mean += lum(y);
  mean /= h;

  const base = [(color >> 16) & 255, (color >> 8) & 255, color & 255];
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const k = mean > 0 ? lum(y) / mean : 1;
    for (let x = 0; x < w; x++) {
      const i = at(w, x, y);
      out[i] = clamp8(base[0] * k);
      out[i + 1] = clamp8(base[1] * k);
      out[i + 2] = clamp8(base[2] * k);
      out[i + 3] = px[i + 3];
    }
  }
  return out;
}

function verticalSpread(px, w, h) {
  let worst = 0;
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 4; c++) {
      let lo = 255;
      let hi = 0;
      for (let y = 0; y < h; y++) {
        const v = px[at(w, x, y) + c];
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
      worst = Math.max(worst, hi - lo);
    }
  }
  return worst;
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

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

function write(name, buf, w, h) {
  if (flags.has("--png")) {
    encode(buf, w, h, `${OUT}-${name}.png`);
    console.log(`out  ${rel(OUT)}-${name}.png`);
  }
  encode(buf, w, h, `${OUT}-${name}.webp`, LOSSLESS);
  console.log(
    `out  ${rel(OUT)}-${name}.webp  ${kb(statSync(`${OUT}-${name}.webp`).size)}`,
  );
}

const tInfo = probe(SRC.trough);
const tRaw = decode(SRC.trough);
console.log(
  `in   ${rel(SRC.trough)}  ${tInfo.w}x${tInfo.h}  ${kb(statSync(SRC.trough).size)}`,
);

const band = inkBox(tRaw, tInfo.w, tInfo.h);
const bar = crop(tRaw, tInfo.w, band);
const paintTo = paintEdge(bar, band.w, band.h);
const edges = rim(bar, band.w, band.h, band.w - Math.round(band.h / 2) - 4);
const inset = Math.max(edges.top, edges.bottom) / band.h;
console.log(`     bar   ${band.w}x${band.h} at ${band.x0},${band.y0}`);
console.log(
  `     paint ends at x ${paintTo} of ${band.w}  (cut, middle stretched over it)`,
);
console.log(
  `     rim   ${edges.top} rows top, ${edges.bottom} bottom of ${band.h}` +
    `  (dropped)  -> BAR_INSET ${inset.toFixed(4)}`,
);
const track = bore(bar, band.w, band.h, paintTo, edges);
write(
  "trough",
  resample(track.px, track.w, track.h, SIZE.trough.w, SIZE.trough.h),
  SIZE.trough.w,
  SIZE.trough.h,
);

for (const paint of PAINTS) {
  const file = SRC[paint.src];
  const info = probe(file);
  const raw = decode(file);
  console.log(
    `
in   ${rel(file)}  ${info.w}x${info.h}  ${kb(statSync(file).size)}`,
  );

  const box = flatSlab(raw, info.w, info.h);
  const slab = crop(raw, info.w, box);
  console.log(
    `     ends ${box.ends.left} and ${box.ends.right} columns` +
      `  -> slab ${box.w}x${box.h}`,
  );
  console.log(
    `     horizontal spread ${verticalSpread(transpose(slab, box.w, box.h), box.h, box.w)}/255` +
      `  (0 means every row is one colour, so the length is free)`,
  );

  const { w, h } = SIZE.paint;
  const small = resample(slab, box.w, box.h, w, h);
  for (const cut of [paint, paint.also].filter(Boolean)) {
    const art = cut.recolour ? recolour(small, w, h, cut.recolour) : small;
    write(cut.name, art, w, h);
  }
}

function transpose(px, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      px.copy(out, at(h, y, x), at(w, x, y), at(w, x, y) + 4);
    }
  }
  return out;
}

function kb(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`;
}

function rel(p) {
  return p.slice(ROOT.length + 1).replace(/\\/g, "/");
}
