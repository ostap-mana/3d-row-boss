/**
 * Pack the sliced frames into the six textures the hero cards wear.
 *
 *   node tools/slice-frames.mjs          # first: cut the sheet apart
 *   node tools/pack-frames.mjs           # -> src/assets/cards/frame-<colour>.webp
 *   node tools/pack-frames.mjs --png     # keep the intermediate PNGs too
 *
 * The cut-outs are not interchangeable as they arrive, and they have to be: the
 * card asks for a frame by element and must not care which one it gets back.
 * Three of them are a bare 224x224 border and three carry a glow that makes them
 * 256 across, so a card that sized itself off the file would draw the glowing
 * three a tenth smaller than the plain three and hang them a pixel high.
 *
 * So every frame is rebuilt on the same grid here: its border box centred in a
 * canvas with an identical margin all round, whether it has anything to put in
 * that margin or not. What comes out is six files with one geometry — one set
 * of constants in art/cardframe.js, and a glow that lands outside the card's
 * edge instead of eating into it.
 *
 * They are then reduced. A card is at most about 120 points wide on the biggest
 * screen this creative runs on, at a renderer clamped to resolution 2, so the
 * border is never asked for at more than ~240 device pixels — and it is drawn
 * nine-sliced, which means only the corners are ever sampled at their own size.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readdirSync, statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const IN_DIR = join(ROOT, "src/source/cards/frames");
const OUT_DIR = join(ROOT, "src/assets/cards");

/** Alpha over this is the border itself rather than the glow around it. */
const CORE = 200;

/**
 * Margin around the border, in source pixels, and what the border is packed to.
 *
 * 18 because the widest glow on the sheet reaches 16 past the border and two
 * clean pixels keep the reduction from smearing it against the edge. 200 for
 * the border because that is a shade over the 196 device pixels a landscape
 * card's height comes to at resolution 2 — sharp where it is looked at, and not
 * a byte past it.
 */
const PAD = 18;
const CORE_TARGET = 200;

/* ------------------------------------------------------------------- ffmpeg */

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
    { maxBuffer: 1 << 28 },
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
    { input: buf, maxBuffer: 1 << 28 },
  );
}

/* ---------------------------------------------------------------- geometry */

/** Box of the opaque border — the frame without whatever glows around it. */
function coreBox(px, w, h) {
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] < CORE) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/** The border box centred in a canvas with `PAD` of margin on every side. */
function onGrid(px, w, h, core) {
  const outW = core.w + PAD * 2;
  const outH = core.h + PAD * 2;
  const out = Buffer.alloc(outW * outH * 4);

  for (let y = 0; y < outH; y++) {
    const sy = core.y0 - PAD + y;
    if (sy < 0 || sy >= h) continue;
    for (let x = 0; x < outW; x++) {
      const sx = core.x0 - PAD + x;
      if (sx < 0 || sx >= w) continue;
      const s = (sy * w + sx) * 4;
      const d = (y * outW + x) * 4;
      out[d] = px[s];
      out[d + 1] = px[s + 1];
      out[d + 2] = px[s + 2];
      out[d + 3] = px[s + 3];
    }
  }
  return { px: out, w: outW, h: outH };
}

/** How thick the border is, walked in along the core's middle row. */
function borderWidth(px, w, core) {
  const y = Math.round((core.y0 + core.y1) / 2);
  let n = 0;
  for (let x = core.x0; x <= core.x1; x++) {
    if (px[(y * w + x) * 4 + 3] < CORE) break;
    n++;
  }
  return n;
}

/** Corner radius, off the silhouette of the border. */
function cornerRadius(px, w, core) {
  for (let y = core.y0; y <= core.y1; y++) {
    let x = core.x0;
    while (x <= core.x1 && px[(y * w + x) * 4 + 3] < CORE) x++;
    if (x === core.x0) return y - core.y0;
  }
  return 0;
}

/* ----------------------------------------------------------------- resample */

/** Area-average down to `dw` by `dh`, weighting colour by alpha. */
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

/* --------------------------------------------------------------------- main */

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

const files = readdirSync(IN_DIR)
  .filter((f) => /^frame-[a-z0-9-]+\.png$/.test(f) && !f.includes("guides"))
  .sort();

if (!files.length) {
  console.error(
    `nothing in ${rel(IN_DIR)} — run  node tools/slice-frames.mjs  first.`,
  );
  process.exit(1);
}

let bytes = 0;
for (const file of files) {
  const src = join(IN_DIR, file);
  const info = probe(src);
  const raw = decode(src);

  const core = coreBox(raw, info.w, info.h);
  const grid = onGrid(raw, info.w, info.h, core);

  const scale = CORE_TARGET / core.h;
  const dw = Math.round(grid.w * scale);
  const dh = Math.round(grid.h * scale);
  const art = resample(grid.px, grid.w, grid.h, dw, dh);

  const packed = coreBox(art, dw, dh);
  const border = borderWidth(art, dw, packed);
  const radius = cornerRadius(art, dw, packed);

  const out = join(OUT_DIR, file.replace(/\.png$/, ".webp"));
  if (flags.has("--png")) encode(art, dw, dh, out.replace(/\.webp$/, ".png"));
  // Quality high enough for a glow: a neon halo is one long smooth ramp, and
  // banding across it is exactly what a lossy codec does first.
  encode(art, dw, dh, out, [
    "-c:v",
    "libwebp",
    "-lossless",
    "0",
    "-quality",
    "86",
    "-compression_level",
    "6",
    "-preset",
    "picture",
  ]);
  bytes += statSync(out).size;

  console.log(
    `${file.padEnd(20)} ${info.w}x${info.h} -> ${dw}x${dh}` +
      `   frame ${packed.w}x${packed.h} at ${packed.x0},${packed.y0}` +
      `   border ${border}  radius ${radius}` +
      `   ${(statSync(out).size / 1024).toFixed(1).padStart(6)} kB`,
  );
}

console.log(
  `\n${files.length} frames, ${(bytes / 1024).toFixed(1)} kB` +
    `  (about ${((bytes * 4) / 3 / 1024).toFixed(0)} kB of base64 in dist/index.html)`,
);

function rel(p) {
  return p.slice(ROOT.length + 1).replace(/\\/g, "/");
}
