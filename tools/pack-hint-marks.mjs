/**
 * Cut the hint marks off the contact sheet and pack the twelve the lesson wears.
 *
 *   node tools/pack-hint-marks.mjs           # -> src/assets/hint/*.webp
 *
 * The source is `src/source/hint/marks-sheet.png`, a 1254 square handed over as
 * labelled sections of neon UI marks. Two of them are wanted here:
 *
 *   1. РАМКИ (КУТОВІ) — corner brackets, on two rows: the top pair of every
 *      colour on the first row, the bottom pair on the second.
 *   2. СТРІЛКИ (ОДИНАРНІ) — solid arrows.
 *
 * Both sections are laid out as seven evenly pitched columns across the sheet,
 * and that pitch is what the groups are found by. Not by colour: section 2's
 * seven columns run cyan, violet, blue, violet again, red, green, yellow, so a
 * colour does not identify a column — and not by the gaps between shapes
 * either, because the widest gap inside a column (85px, between the two cyan
 * arrows) is wider than the narrowest gap between two columns (87px). The pitch
 * is the one thing about this layout that is regular.
 *
 * A column's colour is read off its first shape rather than its average. The
 * green column in section 2 holds one green arrow and one closer to lime, and
 * the average of the two lands nearer the yellow column's colour than the green
 * one's — which would hand LIGHTNING a green arrow and leave NATURE with none.
 *
 * Nothing here needs an alpha channel, because the sheet has none: it is neon
 * on black, which is `colour x intensity` composited over nothing. Dividing the
 * intensity back out recovers both — the alpha is the brightest channel, and the
 * colour is the pixel scaled until that channel is full — so a glow comes back
 * as a real soft edge instead of as a dark halo. See `key`.
 *
 * The four corners of a colour are then composed into one square, because the
 * only thing ui/coach.js wants is a frame. Four separate sprites per lit gem,
 * three lit gems and a bracket around the run on top of them, is sixteen
 * sprites to place every beat — for a shape whose proportions were the artist's
 * decision and not the game's. That decision is read off section 8 of the same
 * sheet, where the marks are already drawn around an icon: a corner is 0.23 of
 * the frame it sits in, which is CORNER_RATIO.
 *
 * The arrows are packed pointing right, whichever way they were drawn. Only
 * three of the six colours have a horizontal arrow on the sheet at all — blue,
 * violet and yellow are drawn vertical — and ui/coach.js needs all four
 * directions out of every one of them anyway, so it rotates the packed sprite.
 * Finding the head rather than assuming it is what lets one rule cover all six:
 * the head is the end of the long axis where the shape is widest across.
 *
 * ffmpeg is the only dependency, and only to decode and encode.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src/source/hint/marks-sheet.png");
const OUT_DIR = join(ROOT, "src/assets/hint");

/** The sheet is square and this is its side. Everything below is measured on it. */
const SHEET = 1254;

/**
 * The three rows wanted, as fractions of the sheet's height.
 *
 * Fractions rather than pixels so a re-export at another resolution still cuts
 * in the right places, which is the same reason tools/slice-pack.mjs stores its
 * boxes that way. Only the rows are given here; the columns inside them are
 * found.
 */
const ROWS = {
  cornerTop: [0.036, 0.062],
  cornerBottom: [0.103, 0.129],
  arrow: [0.175, 0.213],
};

/** Seven evenly pitched columns across the sheet, in both sections. */
const COLUMNS = 7;

/**
 * The six colours, measured off the sheet's own brightest quartile.
 *
 * `classify` scales both sides until the top channel is full before comparing,
 * so a shape is matched on its hue and not on how bright that shape happens to
 * have been drawn.
 *
 * In element order, which is config.js's: FIRE, WATER, NATURE, LIGHTNING,
 * ARCANE, WIND. The names are the gem art's, so src/assets/hint ends up holding
 * the same six words src/assets/gems does.
 */
const ELEMENTS = [
  { name: "fire", rgb: [0xfd, 0x5d, 0x40] },
  { name: "water", rgb: [0x6e, 0xab, 0xfd] },
  { name: "nature", rgb: [0x8b, 0xdd, 0x3d] },
  { name: "lightning", rgb: [0xfd, 0xeb, 0x50] },
  { name: "arcane", rgb: [0xd6, 0x8e, 0xfb] },
  { name: "wind", rgb: [0xd5, 0xfc, 0xfa] },
];

/**
 * A corner's size as a fraction of the frame it belongs to.
 *
 * Measured on section 8 of the sheet — the same marks drawn around an icon,
 * which is the artist showing what a finished frame looks like. The first two
 * groups there both come out within a percent of this.
 */
const CORNER_RATIO = 0.23;

/**
 * Everything is packed at twice the size it is cut at.
 *
 * The art is small — a corner is 23 pixels on the sheet — and a phone at three
 * device pixels to the point draws the frame around nine times that area. The
 * upscale has to happen somewhere, and lanczos here beats the bilinear the GPU
 * would do at draw time on exactly the kind of soft ramp this art is made of.
 * It costs almost nothing in the file: these compress as gradients.
 */
const UPSCALE = 2;

/** Below this the pixel is the sheet's backdrop and not a mark. See `key`. */
const FLOOR = 22;

/** Ignore specks: a shape is at least this many pixels. */
const MIN_AREA = 25;

const LOSSY = ["-c:v", "libwebp", "-q:v", "90", "-compression_level", "6"];

/* --------------------------------------------------------------------- io */

function decode(file) {
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { maxBuffer: 1 << 30 },
  );
}

function encode(buf, w, h, file, scale) {
  const filter =
    scale > 1 ? ["-vf", `scale=iw*${scale}:ih*${scale}:flags=lanczos`] : [];
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
      ...filter,
      ...LOSSY,
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 30 },
  );
}

/* ------------------------------------------------------------------ pixels */

/**
 * Recover colour and alpha from neon drawn on black.
 *
 * The sheet has no alpha channel, so a mark's soft edge is stored the only way
 * an opaque image can store one: darker. `colour x intensity` over black is
 * exactly a premultiplied pixel, so the intensity is the brightest channel and
 * dividing it back out gives back the colour that was multiplied by it. A glow
 * pixel at (40, 38, 12) comes out the same yellow as the core at (253, 235, 80),
 * carried at 16% — which is what it is. Keyed on luminance instead it would
 * have come back a muddy olive fading to grey.
 *
 * The gate is the membership half of the job, and the only place a threshold
 * belongs. The sheet's backdrop is not quite black — its section bands run to
 * (8, 8, 16) — so it is ramped out over a short span rather than cut, which
 * would leave a band edge inside a crop as a visible step.
 */
function key(rgb, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let i = 0, o = 0; o < out.length; i += 3, o += 4) {
    const r = rgb[i];
    const g = rgb[i + 1];
    const b = rgb[i + 2];
    const top = Math.max(r, g, b);
    if (top === 0) continue;
    const t = Math.min(1, Math.max(0, (top - FLOOR) / (FLOOR * 0.8)));
    const gate = t * t * (3 - 2 * t);
    if (gate <= 0) continue;
    const k = 255 / top;
    out[o] = Math.min(255, Math.round(r * k));
    out[o + 1] = Math.min(255, Math.round(g * k));
    out[o + 2] = Math.min(255, Math.round(b * k));
    out[o + 3] = Math.round(gate * top);
  }
  return out;
}

const alphaAt = (px, w, x, y) => px[(y * w + x) * 4 + 3];

/** Every run of touching pixels in a band, left to right. Gap-tolerant by 2px. */
function shapes(px, w, y0, y1) {
  const h = y1 - y0 + 1;
  const seen = new Uint8Array(w * h);
  const found = [];
  const lit = (x, y) => alphaAt(px, w, x, y0 + y) > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (seen[y * w + x] || !lit(x, y)) continue;
      const stack = [[x, y]];
      seen[y * w + x] = 1;
      let x0 = x;
      let x1 = x;
      let ya = y;
      let yb = y;
      let n = 0;
      while (stack.length) {
        const [cx, cy] = stack.pop();
        n++;
        if (cx < x0) x0 = cx;
        if (cx > x1) x1 = cx;
        if (cy < ya) ya = cy;
        if (cy > yb) yb = cy;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            if (seen[ny * w + nx] || !lit(nx, ny)) continue;
            seen[ny * w + nx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      if (n >= MIN_AREA) {
        found.push({ x: x0, y: y0 + ya, w: x1 - x0 + 1, h: yb - ya + 1 });
      }
    }
  }
  return found.sort((a, b) => a.x - b.x);
}

/** The colour a shape is drawn in: its brightest quartile. */
function hue(px, w, box) {
  const bright = [];
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] < 120) continue;
      bright.push([px[i + 3], px[i], px[i + 1], px[i + 2]]);
    }
  }
  if (!bright.length) return [0, 0, 0];
  bright.sort((a, b) => b[0] - a[0]);
  const take = bright.slice(0, Math.max(1, Math.floor(bright.length * 0.25)));
  const sum = [0, 0, 0];
  for (const p of take) {
    sum[0] += p[1];
    sum[1] += p[2];
    sum[2] += p[3];
  }
  return sum.map((v) => Math.round(v / take.length));
}

const full = (rgb) => {
  const k = 255 / Math.max(1, Math.max(...rgb));
  return rgb.map((v) => v * k);
};

/** Nearest of the six, compared at full brightness so only the hue decides. */
function classify(rgb) {
  const a = full(rgb);
  let best = null;
  let near = Infinity;
  for (const el of ELEMENTS) {
    const b = full(el.rgb);
    const d = Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    if (d < near) {
      near = d;
      best = el.name;
    }
  }
  return best;
}

/**
 * One row of the sheet as its seven columns, keyed by the element each is for.
 *
 * A column is claimed by the first element it classifies to, so the duplicate
 * green in section 1 and the second violet in section 2 are simply passed over:
 * every element ends up with the leftmost column drawn in its colour.
 */
function columns(px, w, band) {
  const [a, b] = band;
  const found = shapes(px, w, Math.round(a * SHEET), Math.round(b * SHEET));
  const pitch = SHEET / COLUMNS;
  const cols = Array.from({ length: COLUMNS }, () => []);
  for (const box of found) {
    const i = Math.min(COLUMNS - 1, Math.floor((box.x + box.w / 2) / pitch));
    cols[i].push(box);
  }
  const byElement = {};
  for (const col of cols) {
    if (!col.length) continue;
    const name = classify(hue(px, w, col[0]));
    if (!byElement[name]) byElement[name] = col;
  }
  return byElement;
}

/* ------------------------------------------------------------------ canvas */

function blit(src, sw, box, dst, dw, dx, dy) {
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const s = ((box.y + y) * sw + box.x + x) * 4;
      if (!src[s + 3]) continue;
      const d = ((dy + y) * dw + dx + x) * 4;
      if (src[s + 3] <= dst[d + 3]) continue;
      dst[d] = src[s];
      dst[d + 1] = src[s + 1];
      dst[d + 2] = src[s + 2];
      dst[d + 3] = src[s + 3];
    }
  }
}

/**
 * Which end of the long axis the head is on.
 *
 * The widest slice across an arrow is the base of its head, and it is the only
 * feature that is in a different place depending on which way the arrow points:
 * a shaft is the same width everywhere and a tip is the same point either way.
 * So the answer is which half of the long axis the widest slice falls in.
 *
 * Comparing the two ends instead — how this read before — gets every one of
 * these six backwards. The head end's outer fifth is mostly the tip, which
 * tapers to nothing, while the tail end's outer fifth is full shaft the whole
 * way; averaged over a fifth the tail is the wider of the two, so every arrow
 * came out mirrored.
 */
function heading(px, w, box) {
  const horizontal = box.w >= box.h;
  const span = horizontal ? box.w : box.h;
  const len = horizontal ? box.h : box.w;
  const across = (i) => {
    let n = 0;
    for (let j = 0; j < len; j++) {
      const x = horizontal ? box.x + i : box.x + j;
      const y = horizontal ? box.y + j : box.y + i;
      if (px[(y * w + x) * 4 + 3] > 90) n++;
    }
    return n;
  };
  let widest = 0;
  let at = 0;
  for (let i = 0; i < span; i++) {
    const n = across(i);
    if (n > widest) {
      widest = n;
      at = i;
    }
  }
  const forward = at >= span / 2;
  if (horizontal) return forward ? "right" : "left";
  return forward ? "down" : "up";
}

/** Rotate an RGBA buffer a quarter turn clockwise. */
function turn(src, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const d = (x * h + (h - 1 - y)) * 4;
      src.copy(out, d, s, s + 4);
    }
  }
  return { px: out, w: h, h: w };
}

/* -------------------------------------------------------------------- main */

const rgb = decode(SOURCE);
const px = key(rgb, SHEET, SHEET);

const top = columns(px, SHEET, ROWS.cornerTop);
const bottom = columns(px, SHEET, ROWS.cornerBottom);
const arrows = columns(px, SHEET, ROWS.arrow);

mkdirSync(OUT_DIR, { recursive: true });
const kb = (n) => `${(n / 1024).toFixed(1)}kB`;
const written = [];

const cut = ELEMENTS.map((el) => {
  const up = top[el.name];
  const down = bottom[el.name];
  const arrow = arrows[el.name];
  if (!up || up.length < 2 || !down || down.length < 2 || !arrow) {
    throw new Error(`${el.name}: sheet is missing a corner pair or an arrow`);
  }
  return { el, corners: [up[0], up[1], down[0], down[1]], arrow: arrow[0] };
});

/**
 * One frame size for all six, off the average corner.
 *
 * Sizing each frame to its own corners looked reasonable and was not: the crop
 * runs to where the glow reaches, and the glow does not reach equally far on
 * every colour — the six came out between 124 and 150 across, so the same frame
 * drawn at the same size on the board would have shown brackets a fifth larger
 * on a fire gem than on a water one. Cut to a common square they keep whatever
 * difference the art really has and lose the difference the crop invented.
 */
const SIDE = Math.round(
  cut.reduce(
    (sum, { corners }) =>
      sum + corners.reduce((s, c) => s + (c.w + c.h) / 2, 0) / corners.length,
    0,
  ) /
    cut.length /
    CORNER_RATIO,
);

for (const { el, corners, arrow: box } of cut) {
  // The frame. The corners sit flush in the four corners of the square, so what
  // lines up between them is the outer edge of each one's glow — which is the
  // edge anybody actually sees. Their solid brackets differ by a pixel or two
  // behind it.
  const [tl, tr, bl, br] = corners;
  const side = SIDE;
  const frame = Buffer.alloc(side * side * 4);
  blit(px, SHEET, tl, frame, side, 0, 0);
  blit(px, SHEET, tr, frame, side, side - tr.w, 0);
  blit(px, SHEET, bl, frame, side, 0, side - bl.h);
  blit(px, SHEET, br, frame, side, side - br.w, side - br.h);
  const framePath = join(OUT_DIR, `frame-${el.name}.webp`);
  encode(frame, side, side, framePath, UPSCALE);

  // The arrow, turned to point right.
  let shape = Buffer.alloc(box.w * box.h * 4);
  blit(px, SHEET, box, shape, box.w, 0, 0);
  let aw = box.w;
  let ah = box.h;
  const points = heading(px, SHEET, box);
  const turns = { right: 0, down: 3, left: 2, up: 1 }[points];
  for (let i = 0; i < turns; i++) {
    const t = turn(shape, aw, ah);
    shape = t.px;
    aw = t.w;
    ah = t.h;
  }
  const arrowPath = join(OUT_DIR, `arrow-${el.name}.webp`);
  encode(shape, aw, ah, arrowPath, UPSCALE);

  written.push({ el: el.name, side, aw, ah, points, framePath, arrowPath });
}

// Where art/hintmarks.js has to cut its nine-slice: past the widest corner on
// the sheet, so the strips it stretches between them are empty. Printed rather
// than assumed, because a corner's crop runs to wherever its glow fades out and
// that is not a number anybody can read off the art by eye.
const slice =
  Math.max(
    ...cut.flatMap(({ corners }) => corners.flatMap((c) => [c.w, c.h])),
  ) / SIDE;

let total = 0;
for (const r of written) {
  const a = statSync(r.framePath).size;
  const b = statSync(r.arrowPath).size;
  total += a + b;
  console.log(
    `${r.el.padEnd(10)} frame ${String(r.side * UPSCALE).padStart(3)}px ` +
      `${kb(a).padStart(7)}   arrow ${r.aw * UPSCALE}x${r.ah * UPSCALE} ` +
      `${kb(b).padStart(7)}  (drawn ${r.points})`,
  );
}
console.log(`\n12 files, ${kb(total)} total`);
console.log(
  `frame ${SIDE * UPSCALE}px square, nine-slice past ${(slice * 100).toFixed(1)}%` +
    ` of it — FRAME_SLICE in src/art/hintmarks.js`,
);
