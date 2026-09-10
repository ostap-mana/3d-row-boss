import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src/source/heroes");

const TARGET = { w: 160, h: 328 };
const HEAD = 160;
const EDGE_ROWS = 20;
const FADE = 34;
const FADE_EASE = 1.35;
const GROUND = 0.055;
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

function groundColour(head, w, bottom, rows) {
  let r = 0,
    g = 0,
    b = 0,
    n = 0;
  for (let k = 0; k < rows; k++) {
    for (let x = 0; x < w; x++) {
      const i = ((bottom - k) * w + x) * 4;
      r += head[i];
      g += head[i + 1];
      b += head[i + 2];
      n++;
    }
  }
  return [(r / n) * GROUND, (g / n) * GROUND, (b / n) * GROUND];
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

  const ground = groundColour(head, TARGET.w, HEAD - 1, EDGE_ROWS);

  for (let y = HEAD - FADE; y < HEAD; y++) {
    const t = Math.pow((y - (HEAD - FADE)) / FADE, FADE_EASE);
    for (let x = 0; x < TARGET.w; x++) {
      const o = (y * TARGET.w + x) * 4;
      for (let c = 0; c < 3; c++) {
        out[o + c] = Math.round(out[o + c] * (1 - t) + ground[c] * t);
      }
    }
  }

  for (let y = HEAD; y < TARGET.h; y++) {
    for (let x = 0; x < TARGET.w; x++) {
      const o = (y * TARGET.w + x) * 4;
      out[o] = Math.round(ground[0]);
      out[o + 1] = Math.round(ground[1]);
      out[o + 2] = Math.round(ground[2]);
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
