import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src/source/heroes");

const TARGET = { w: 160, h: 328 };
const HEAD = 160;
const TORSO_REACH = 62;
const TORSO_EASE = 0.72;
const DUSK_FLOOR = 0.06;
const DUSK_FALL = 3.8;
const BLUR_MAX = 6;
const BORDER_LEVEL = 10;
const BORDER_HUNT = 6;

const MAP = [
  ["tools/image-5.png", "fire"],
  ["tools/image-3.png", "water"],
  ["tools/image-1.png", "nature"],
  ["tools/image-4.png", "wind"],
  ["tools/image-2.png", "arcane"],
  ["tools/image.png", "lightning"],
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

function encode(px, w, h, file) {
  execFileSync(
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
      `${w}x${h}`,
      "-i",
      "-",
      file,
    ],
    { input: px, maxBuffer: 1 << 29 },
  );
}

function areaScale(px, w, h, tw, th) {
  const out = Buffer.alloc(tw * th * 4);
  const sx = w / tw;
  const sy = h / th;
  for (let y = 0; y < th; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < tw; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let r = 0,
        g = 0,
        b = 0,
        a = 0,
        n = 0;
      for (let yy = y0; yy < y1 && yy < h; yy++) {
        for (let xx = x0; xx < x1 && xx < w; xx++) {
          const i = (yy * w + xx) * 4;
          r += px[i];
          g += px[i + 1];
          b += px[i + 2];
          a += px[i + 3];
          n++;
        }
      }
      const o = (y * tw + x) * 4;
      out[o] = Math.round(r / n);
      out[o + 1] = Math.round(g / n);
      out[o + 2] = Math.round(b / n);
      out[o + 3] = Math.round(a / n);
    }
  }
  return out;
}

function rowBlur(head, w, y, radius) {
  const row = [];
  for (let x = 0; x < w; x++) {
    let r = 0,
      g = 0,
      b = 0,
      n = 0;
    for (let k = -radius; k <= radius; k++) {
      const sx = Math.min(w - 1, Math.max(0, x + k));
      const i = (y * w + sx) * 4;
      r += head[i];
      g += head[i + 1];
      b += head[i + 2];
      n++;
    }
    row.push([r / n, g / n, b / n]);
  }
  return row;
}

function litRows(px, w, h) {
  let last = h - 1;
  while (last > h - 1 - BORDER_HUNT) {
    let sum = 0;
    for (let x = 0; x < w; x++) {
      const i = (last * w + x) * 4;
      sum += px[i] + px[i + 1] + px[i + 2];
    }
    if (sum / (w * 3) > BORDER_LEVEL) break;
    last--;
  }
  return last + 1;
}

function bust(file) {
  const info = probe(file);
  const src = decode(file);
  const lit = litRows(src, info.w, info.h);
  const head = areaScale(src, info.w, lit, TARGET.w, HEAD);

  const out = Buffer.alloc(TARGET.w * TARGET.h * 4);
  head.copy(out, 0);

  const torso = TARGET.h - HEAD;
  for (let y = HEAD; y < TARGET.h; y++) {
    const t = (y - HEAD) / torso;
    const srcY = HEAD - 1 - Math.round(TORSO_REACH * Math.pow(t, TORSO_EASE));
    const dusk = DUSK_FLOOR + (1 - DUSK_FLOOR) * Math.pow(1 - t, DUSK_FALL);
    const row = rowBlur(head, TARGET.w, srcY, Math.round(1 + BLUR_MAX * t));
    for (let x = 0; x < TARGET.w; x++) {
      const o = (y * TARGET.w + x) * 4;
      const c = row[x];
      out[o] = Math.round(c[0] * dusk);
      out[o + 1] = Math.round(c[1] * dusk);
      out[o + 2] = Math.round(c[2] * dusk);
      out[o + 3] = 255;
    }
  }
  return { out, info };
}

if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

MAP.forEach(([rel, name]) => {
  const file = join(ROOT, rel);
  if (!existsSync(file)) {
    console.log(`skip ${rel} — not found`);
    return;
  }
  const { out, info } = bust(file);
  const dest = join(OUT_DIR, `portrait-${name}.png`);
  encode(out, TARGET.w, TARGET.h, dest);
  console.log(
    `${rel}  ${info.w}x${info.h}  ->  src/source/heroes/portrait-${name}.png  ${TARGET.w}x${TARGET.h}`,
  );
});
