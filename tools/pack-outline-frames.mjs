/**
 * Cut the thin card outlines apart, key their backdrop out, and pack the six the
 * hero cards wear.
 *
 *   node tools/pack-outline-frames.mjs          # -> src/assets/cards/outline-<colour>.webp
 *   node tools/pack-outline-frames.mjs --png    # keep the intermediate PNGs too
 *   node tools/pack-outline-frames.mjs --proof  # composite all six over a dark card
 *
 * The source is `src/source/cards/outline-sheet.png`: six rounded rectangles in a
 * row — red, blue, green, gold, purple, grey, which is the roster's colour order
 * — drawn as a thin line about four pixels thick with a small radius. It is a
 * flat PNG with no alpha channel at all, so the "empty" middle of every frame is
 * a painted dark navy, and so is the sheet around them. Handed to a Sprite it
 * would arrive as six dark tiles that cover the portrait they are meant to
 * enclose.
 *
 * So the backdrop is keyed rather than cropped. Every pixel gets the alpha its
 * distance from the sheet's own background colour implies, on a ramp between two
 * thresholds, and the ones on the ramp then have that background divided back
 * out of their colour. Two thresholds and not one because the line is
 * antialiased: a hard cut leaves a stair on every corner, and at the size a card
 * is drawn the corner is most of what anyone sees of a frame. The backdrop is
 * measured off the sheet, not assumed — it is the most common colour in it, and
 * the sheet has two dark tones (inside a frame is not quite the tone outside it),
 * which is why the low threshold sits well above the difference between them.
 *
 * All six are then packed to one identical size. They arrive within about 5% of
 * each other — the leftmost carries a little more bleed than the rest — and a
 * card that sized itself off the file would draw one of the six a twentieth
 * heavier than its neighbours in the same row. Normalising costs each frame up
 * to that 5% of squash, which is nothing on a line three pixels wide, and buys
 * one set of nine-slice constants for art/cardframe.js.
 *
 * The border thickness and corner radius are measured on the packed result and
 * printed, because those two numbers are the ones cardframe.js holds: they decide
 * where the nine-slice cuts and what radius the card clips its own art to.
 *
 * This is not the packer for the neon frames the cards wore before — that is
 * tools/slice-frames.mjs and tools/pack-frames.mjs, still there, still pointed at
 * their own sheet, still writing frame-<colour>.webp. Nothing overwrites anything
 * here: switching cardframe.js back to those imports is the whole revert.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src/source/cards/outline-sheet.png");
const OUT_DIR = join(ROOT, "src/assets/cards");

/** Left to right on the sheet, which is the roster's own colour order. */
const NAMES = ["red", "cyan", "green", "orange", "purple", "grey"];

/**
 * The keying ramp, as max-channel distance from the sheet's background.
 *
 * LOW is set well clear of the gap between the sheet's two dark tones — the
 * panel around a frame is about 16 lighter than the middle of one — so neither
 * survives as a haze. HIGH is far under the line's own distance, which is over
 * 100 for every one of the six, so nothing that is actually the frame comes out
 * anything but opaque.
 */
const KEY_LOW = 28;
const KEY_HIGH = 70;

/** Alpha at or over this counts as the line when measuring it. */
const SOLID = 0.6;

/** Alpha at or under this is noise off the render, not art. See denoise. */
const ALPHA_FLOOR = 10;

/** Columns with fewer lit pixels than this are noise between frames, not a frame. */
const MIN_RUN = 4;

/**
 * The height every frame is packed to, and the clear margin around it.
 *
 * Height only, and each frame keeps its own width. The six rectangles on the
 * sheet are all 328 pixels tall to the pixel but run from 153 to 167 wide, and
 * forcing them to one width is what put six different line weights in one row:
 * the wide ones get squashed 9% harder than the narrow ones, and the line is
 * squashed with them. Scaled by height alone every frame takes the same factor,
 * so every line lands at the same weight — and the width is the one dimension a
 * nine-slice does not care about, because the flat middle of the top and bottom
 * runs is stretched to whatever the card asks for anyway.
 *
 * 264 because a card is at most about 117 points tall on the biggest screen this
 * creative runs on, at a renderer clamped to resolution 2 — sharp where it is
 * looked at, and not a byte past it. The margin is two transparent pixels so the
 * reduction has somewhere to put the line's antialiasing instead of smearing it
 * against the edge of the texture.
 */
const BOX_H = 264;
const PAD = 2;

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

/* -------------------------------------------------------------------- pixels */

const at = (w, x, y) => (y * w + x) * 4;

/** The most common colour in the sheet, sampled on a grid. That is the backdrop. */
function backdrop(px, w, h) {
  const seen = new Map();
  for (let y = 0; y < h; y += 3) {
    for (let x = 0; x < w; x += 3) {
      const i = at(w, x, y);
      const key = (px[i] << 16) | (px[i + 1] << 8) | px[i + 2];
      seen.set(key, (seen.get(key) || 0) + 1);
    }
  }
  let best = 0;
  let top = 0;
  for (const [key, n] of seen) {
    if (n > top) {
      top = n;
      best = key;
    }
  }
  return [(best >> 16) & 255, (best >> 8) & 255, best & 255];
}

const away = (px, i, bg) =>
  Math.max(
    Math.abs(px[i] - bg[0]),
    Math.abs(px[i + 1] - bg[1]),
    Math.abs(px[i + 2] - bg[2]),
  );

/**
 * Key the backdrop out: alpha from distance, colour decontaminated.
 *
 * The division is what keeps the line its own colour rather than a version of
 * itself mixed with navy. A pixel that is 40% line and 60% backdrop is stored as
 * the line at 40% alpha, so whatever the card puts behind it shows through the
 * other 60% instead of a painted approximation of the sheet.
 */
function key(px, w, h, bg) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = at(w, x, y);
      const d = away(px, i, bg);
      const a = Math.max(0, Math.min(1, (d - KEY_LOW) / (KEY_HIGH - KEY_LOW)));
      const o = at(w, x, y);
      if (a <= 0) continue;
      for (let c = 0; c < 3; c++) {
        const straight = (px[i + c] - bg[c] * (1 - a)) / a;
        out[o + c] = clamp8(straight);
      }
      out[o + 3] = clamp8(a * 255);
    }
  }
  return out;
}

/** Runs of columns that hold the line, one per frame on the sheet. */
function columnRuns(px, w, h) {
  const runs = [];
  let start = -1;
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) if (px[at(w, x, y) + 3] > SOLID * 255) n++;
    if (n >= MIN_RUN) {
      if (start < 0) start = x;
    } else if (start >= 0) {
      runs.push([start, x - 1]);
      start = -1;
    }
  }
  if (start >= 0) runs.push([start, w - 1]);
  return runs;
}

/**
 * The line's own outer rectangle inside `x0..x1` — pixels that are the line,
 * not the haze around it.
 *
 * Solid rather than any-alpha, and that distinction is the whole difference
 * between six frames that match and six that do not. Some of these six carry a
 * soft glow outside the line: the leftmost is 9% wider that way than its
 * neighbours. Boxed on any-alpha, that glow is measured as part of the frame, so
 * normalising the box scales that frame's line down by 9% against the others —
 * six lines at five different weights in one row, which is exactly what it looked
 * like. Boxed on the line itself, every frame arrives as its own outer rectangle
 * and they all come out of the resample at the same weight.
 */
function lineBox(px, w, h, x0, x1) {
  let y0 = h;
  let y1 = -1;
  let bx0 = x1;
  let bx1 = x0;
  for (let y = 0; y < h; y++) {
    for (let x = x0; x <= x1; x++) {
      if (px[at(w, x, y) + 3] <= SOLID * 255) continue;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
    }
  }
  return { x0: bx0, y0, w: bx1 - bx0 + 1, h: y1 - y0 + 1 };
}

function crop(px, w, box) {
  const out = Buffer.alloc(box.w * box.h * 4);
  for (let y = 0; y < box.h; y++) {
    const src = at(w, box.x0, y + box.y0);
    px.copy(out, y * box.w * 4, src, src + box.w * 4);
  }
  return out;
}

/** Area-average down, weighting colour by alpha. Same filter as the other packers. */
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

/** Lay `art` into a transparent canvas of `w` by `h` at `PAD`, `PAD`. */
function onCanvas(art, aw, ah, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < ah; y++) {
    const src = at(aw, 0, y);
    art.copy(out, at(w, PAD, y + PAD), src, src + aw * 4);
  }
  return out;
}

const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

/* ------------------------------------------------------------------ measure */

/** Thickness of the line at the middle of each edge, in packed pixels. */
function thickness(px, w, h) {
  const solid = (x, y) => px[at(w, x, y) + 3] > SOLID * 255;
  const ymid = Math.round(h / 2);
  const xmid = Math.round(w / 2);

  // Walk in to the line first rather than assuming it starts at PAD: the outer
  // row of a keyed, resampled edge is often a shade under solid, and a measure
  // that starts on it comes back zero.
  let x = 0;
  while (x < w && !solid(x, ymid)) x++;
  let left = 0;
  while (x + left < w && solid(x + left, ymid)) left++;

  let y = 0;
  while (y < h && !solid(xmid, y)) y++;
  let top = 0;
  while (y + top < h && solid(xmid, y + top)) top++;

  return { left, top };
}

/**
 * The corner radius, as the horizontal run the arc takes to flatten out.
 *
 * Read off the art rather than assumed: it is the one number a nine-slice cannot
 * fudge. Cut inside the arc and every corner is stretched into an ellipse.
 */
function cornerRadius(px, w, h) {
  const solid = (x, y) => px[at(w, x, y) + 3] > SOLID * 255;

  let top = 0;
  while (top < h && !solid(Math.round(w / 2), top)) top++;
  let left = 0;
  while (left < w && !solid(left, Math.round(h / 2))) left++;

  for (let x = left; x < w; x++) {
    let ymin = -1;
    for (let y = 0; y < h; y++) {
      if (solid(x, y)) {
        ymin = y;
        break;
      }
    }
    if (ymin >= 0 && ymin <= top) return x - left;
  }
  return 0;
}

/**
 * Zero the faintest alpha.
 *
 * The sheet is a flat render with a little noise in it, and a ramp that starts at
 * KEY_LOW turns that noise into a field of 1s and 2s across the whole middle of
 * every frame. Invisible, and it costs more to compress than the line does: the
 * six files come down by about a third with it gone.
 */
function denoise(px, floor) {
  for (let i = 3; i < px.length; i += 4) {
    if (px[i] <= floor) {
      px[i] = 0;
      px[i - 1] = 0;
      px[i - 2] = 0;
      px[i - 3] = 0;
    }
  }
  return px;
}

/* --------------------------------------------------------------------- main */

const flags = new Set(process.argv.slice(2).filter((a) => a.startsWith("--")));

const info = probe(SOURCE);
const sheet = decode(SOURCE);
const bg = backdrop(sheet, info.w, info.h);
console.log(
  `in   ${rel(SOURCE)}  ${info.w}x${info.h}  ${kb(statSync(SOURCE).size)}`,
);
console.log(
  `     backdrop rgb(${bg.join(",")}), keyed on a ${KEY_LOW}..${KEY_HIGH} ramp`,
);

const keyed = key(sheet, info.w, info.h, bg);
const runs = columnRuns(keyed, info.w, info.h);
console.log(`     ${runs.length} frames on the sheet`);
if (runs.length !== NAMES.length) {
  throw new Error(`expected ${NAMES.length} frames, found ${runs.length}`);
}

const packed = [];
runs.forEach(([x0, x1], i) => {
  const box = lineBox(keyed, info.w, info.h, x0, x1);
  const scale = (BOX_H - PAD * 2) / box.h;
  const aw = Math.round(box.w * scale);
  const ah = BOX_H - PAD * 2;
  const cw = aw + PAD * 2;
  const art = resample(crop(keyed, info.w, box), box.w, box.h, aw, ah);
  const out = denoise(onCanvas(art, aw, ah, cw, BOX_H), ALPHA_FLOOR);
  const t = thickness(out, cw, BOX_H);
  const corner = cornerRadius(out, cw, BOX_H);
  const name = NAMES[i];
  const file = join(OUT_DIR, `outline-${name}`);

  if (flags.has("--png")) encode(out, cw, BOX_H, `${file}.png`);
  encode(out, cw, BOX_H, `${file}.webp`, LOSSLESS);
  packed.push({ name, out, t, corner, w: cw });

  console.log(
    `out  ${rel(file)}.webp  ${cw}x${BOX_H}` +
      `  ${kb(statSync(`${file}.webp`).size)}` +
      `  line ${t.left}x${t.top}  radius ${corner}` +
      `  (from ${box.w}x${box.h} at ${box.x0},${box.y0}, 1:${(1 / scale).toFixed(2)})`,
  );
});

const line = Math.max(...packed.map((p) => Math.max(p.t.left, p.t.top)));
const corner = Math.max(...packed.map((p) => p.corner));
console.log(
  `\n     for art/cardframe.js:  BOX_H ${BOX_H}  MARGIN ${PAD}` +
    `  BORDER ${line}  RADIUS ${corner}  CORNER ${corner + line + PAD + 1}`,
);

/**
 * All six over a dark tile, at the size a card actually draws them. This is the
 * only check that matters: a line keyed a shade too hard survives every
 * measurement above and still reads as a dotted edge on a phone.
 */
if (flags.has("--proof")) {
  const gap = 8;
  const W = packed.reduce((n, p) => n + p.w + gap, gap);
  const H = BOX_H + gap * 2;
  const proof = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    proof[i * 4] = 26;
    proof[i * 4 + 1] = 18;
    proof[i * 4 + 2] = 40;
    proof[i * 4 + 3] = 255;
  }
  let ox = gap;
  packed.forEach((p) => {
    for (let y = 0; y < BOX_H; y++) {
      for (let x = 0; x < p.w; x++) {
        const s = at(p.w, x, y);
        const a = p.out[s + 3] / 255;
        if (a === 0) continue;
        const d = at(W, ox + x, gap + y);
        for (let c = 0; c < 3; c++) {
          proof[d + c] = clamp8(p.out[s + c] * a + proof[d + c] * (1 - a));
        }
      }
    }
    ox += p.w + gap;
  });
  const file = join(OUT_DIR, "outline-proof.png");
  encode(proof, W, H, file);
  console.log(`out  ${rel(file)}  (delete when looked at)`);
}

function kb(n) {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} kB`;
}

function rel(p) {
  return p.slice(ROOT.length + 1).replace(/\\/g, "/");
}
