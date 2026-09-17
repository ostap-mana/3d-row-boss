import { execFileSync } from "node:child_process";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IN = join(ROOT, "src/source/ui");
const OUT = join(ROOT, "src/assets/ui");

const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");

const EMPTY = 8;

const FADE = 0.2;

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

function encode(buf, w, h, file) {
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
      "-c:v",
      "libwebp",
      "-lossless",
      "0",
      "-quality",
      "90",
      "-compression_level",
      "6",
      "-preset",
      "drawing",
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 29 },
  );
}

function load(name) {
  const file = join(IN, name);
  const { w, h } = probe(file);
  const px = decode(file);
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
  const cut = { w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const out = Buffer.alloc(cut.w * cut.h * 4);
  for (let y = 0; y < cut.h; y++) {
    for (let x = 0; x < cut.w; x++) {
      const s = ((y + y0) * w + x + x0) * 4;
      const d = (y * cut.w + x) * 4;
      out[d] = px[s];
      out[d + 1] = px[s + 1];
      out[d + 2] = px[s + 2];
      out[d + 3] = px[s + 3];
    }
  }
  console.log(
    `in   ${rel(file)}  ${w}x${h}` +
      (cut.w === w && cut.h === h ? "" : ` -> trimmed ${cut.w}x${cut.h}`),
  );
  return { px: out, ...cut };
}

const frame = load("boss-crest-frame.png");
const face = load("boss-crest-face.png");

const plate = Buffer.alloc(frame.w * frame.h * 4);
let filled = 0;
for (let y = 0; y < frame.h; y++) {
  let lo = -1;
  let hi = -1;
  for (let x = 0; x < frame.w; x++) {
    if (frame.px[(y * frame.w + x) * 4 + 3] <= EMPTY) continue;
    if (lo < 0) lo = x;
    hi = x;
  }
  if (lo < 0) continue;
  for (let x = lo; x <= hi; x++) {
    const d = (y * frame.w + x) * 4;
    plate[d] = 255;
    plate[d + 1] = 255;
    plate[d + 2] = 255;
    plate[d + 3] = 255;
    filled++;
  }
}

const from = Math.round(face.h * (1 - FADE));
for (let y = from; y < face.h; y++) {
  const t = 1 - (y - from) / (face.h - from);
  const k = t * t;
  for (let x = 0; x < face.w; x++) {
    const i = (y * face.w + x) * 4;
    face.px[i + 3] = Math.round(face.px[i + 3] * k);
  }
}

encode(frame.px, frame.w, frame.h, join(OUT, "boss-crest-frame.webp"));
encode(plate, frame.w, frame.h, join(OUT, "boss-crest-plate.webp"));
encode(face.px, face.w, face.h, join(OUT, "boss-crest-face.webp"));

console.log(
  `\n     plate ${frame.w}x${frame.h}, ${((filled * 100) / (frame.w * frame.h)).toFixed(0)}% of the cell filled`,
);
console.log(
  `     face  ${face.w}x${face.h}, bottom ${Math.round(FADE * 100)}% faded\n`,
);
for (const n of ["frame", "plate", "face"]) {
  const f = join(OUT, `boss-crest-${n}.webp`);
  console.log(`out  ${rel(f)}  ${(statSync(f).size / 1024).toFixed(1)} kB`);
}
