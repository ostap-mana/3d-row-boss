/**
 * Cut the six neon hint hands off the second contact sheet.
 *
 *   node tools/pack-neon-hand.mjs      # -> src/assets/hint/hand-*.webp
 *
 * The source is `src/source/hint/hand-sheet.png` — a 1254 square of hint-hand art
 * in the same neon-on-black language as the marks sheet, laid out as six labelled
 * sections. Only the first is wanted: `10.1 ОСНОВНІ ІКОНКИ`, six hands with the
 * index finger up, one per element colour.
 *
 * All six are cut, one per element, because the hand was the last thing in the
 * lesson still speaking in one colour while the frame round the gem and the
 * arrow off it already wore the element's — see tools/pack-hint-marks.mjs for
 * those twelve. This file used to cut only the pale hand in the first column, on
 * the reading that the hand is the player's and not an element's, which the
 * sheet's own sections 10.3 and 10.6 support: they draw it pale beside icons of
 * every colour. But the lesson only ever points at one gem at a time, and
 * wearing that gem's colour is what ties the hand to what it is about instead
 * of leaving it a prop that happens to be nearby.
 *
 * A column's element is read off its colour rather than its position, the way
 * pack-hint-marks reads its own: the six are drawn wind, arcane, water, fire,
 * nature, lightning, left to right, which is nobody's canonical order and not
 * one worth writing down twice. The pale first column classifies as WIND — it is
 * the same pale cyan the wind gem is painted in — so wind's hand is the hand the
 * prop already shipped with, and art/hinthand.js hands that one back as the
 * neutral hand for a cell with no element at all.
 *
 * Keying is the marks sheet's, for the same reason: no alpha channel, neon over
 * black, so the brightest channel is the intensity and dividing it back out
 * recovers the colour that was multiplied by it. See tools/pack-hint-marks.mjs,
 * where the same `key` is explained at length.
 *
 * What is different here is that the crop has to carry a measurement out with
 * it. ui/hand.js anchors the sprite on the fingertip, because a hand pointing at
 * a cell is a hand whose *finger* is on the cell and whose wrist hangs off to
 * one side — anchoring on the middle of the picture would put the cuff on the
 * gem. So the tip is found rather than typed: the topmost solid row of the art
 * is the top of the fingertip, and the middle of that row is the point. It is
 * measured against the solid line and not the glow, whose depth above the finger
 * is a different number on every colour.
 *
 * And with six hands it has to come out as *one* measurement. They were drawn by
 * hand, so their crops run 105 to 113 across and their tips sit anywhere from
 * 0.017 to 0.047 down — six sprites with six anchors would mean ui/hand.js
 * re-anchoring and re-sizing every time the element changed, off differences the
 * game has no way to mean anything by. So each hand is composed onto a common
 * canvas at whatever offset puts its own tip on a common point: one aspect, one
 * anchor, and swapping the texture is the whole of changing colour. The canvas
 * is the tightest one that fits all six that way.
 *
 * The numbers it prints are HAND_ART and HAND_TIP in src/art/hinthand.js.
 *
 * ffmpeg is the only dependency, and only to decode and encode.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "src/source/hint/hand-sheet.png");
const OUT_DIR = join(ROOT, "src/assets/hint");

/** The sheet is square and this is its side. */
const SHEET = 1254;

/**
 * Section 10.1's row, as fractions of the sheet's height.
 *
 * It starts below the section's own label and ends before 10.2's, with enough
 * clearance either side for the hands' glow and none for the text — a caption
 * keyed in with the art would be picked up as a shape, and this one sits
 * directly above the hands that are wanted.
 */
const BAND = [0.055, 0.18];

/** Six hands in the row, one per element. */
const COLUMNS = 6;

/**
 * The six colours, as in tools/pack-hint-marks.mjs, where the same six are
 * matched against the marks sheet and where these values come from. In
 * config.js's element order, which is the order the printed list comes out in.
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
 * The smallest thing that can be a hand.
 *
 * Well over any letter of the label above and well under the hands themselves,
 * which run to between five and eight thousand pixels. It is the guard that
 * makes the band's top edge a matter of clearance rather than of precision.
 */
const MIN_AREA = 2000;

/** Alpha at or above which a pixel is the drawn line and not its glow. */
const SOLID = 150;

/** Below this the pixel is the sheet's backdrop. See `key` in pack-hint-marks. */
const FLOOR = 22;

/**
 * Packed at twice the size it is cut at.
 *
 * A hand is 110 pixels across on the sheet and ui/hand.js asks for up to 140
 * points of it, which is 420 device pixels on a phone at three to the point.
 * The upscale has to happen somewhere and lanczos here beats the bilinear the
 * GPU would do at draw time.
 */
const UPSCALE = 2;

const LOSSY = ["-c:v", "libwebp", "-q:v", "90", "-compression_level", "6"];

/* --------------------------------------------------------------------- io */

function decode(file) {
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
    { maxBuffer: 1 << 30 },
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
      "-vf",
      `scale=iw*${UPSCALE}:ih*${UPSCALE}:flags=lanczos`,
      ...LOSSY,
      "-frames:v",
      "1",
      file,
    ],
    { input: buf, maxBuffer: 1 << 30 },
  );
}

/* ------------------------------------------------------------------ pixels */

/** Colour and alpha out of neon drawn on black. See tools/pack-hint-marks.mjs. */
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

const alphaAt = (px, x, y) => px[(y * SHEET + x) * 4 + 3];

/** Every run of touching pixels in a band, left to right. Gap-tolerant by 3px. */
function shapes(px, y0, y1) {
  const h = y1 - y0 + 1;
  const seen = new Uint8Array(SHEET * h);
  const found = [];
  const lit = (x, y) => alphaAt(px, x, y0 + y) > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < SHEET; x++) {
      if (seen[y * SHEET + x] || !lit(x, y)) continue;
      const stack = [[x, y]];
      seen[y * SHEET + x] = 1;
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
        for (let dy = -3; dy <= 3; dy++) {
          for (let dx = -3; dx <= 3; dx++) {
            const nx = cx + dx;
            const ny = cy + dy;
            if (nx < 0 || ny < 0 || nx >= SHEET || ny >= h) continue;
            if (seen[ny * SHEET + nx] || !lit(nx, ny)) continue;
            seen[ny * SHEET + nx] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      if (n >= MIN_AREA) {
        found.push({ x: x0, y: y0 + ya, w: x1 - x0 + 1, h: yb - ya + 1, n });
      }
    }
  }
  return found.sort((a, b) => a.x - b.x);
}

/** The colour a shape is drawn in: its brightest quartile. */
function hue(px, box) {
  const bright = [];
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * SHEET + x) * 4;
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
 * The fingertip of one hand, in sheet pixels: the middle of its topmost solid
 * row.
 */
function fingertip(px, box) {
  for (let y = box.y; y < box.y + box.h; y++) {
    let first = -1;
    let last = -1;
    for (let x = box.x; x < box.x + box.w; x++) {
      if (alphaAt(px, x, y) < SOLID) continue;
      if (first < 0) first = x;
      last = x;
    }
    if (first < 0) continue;
    return { x: (first + last) / 2, y };
  }
  throw new Error("no solid pixel in the hand: nothing to anchor on");
}

/* -------------------------------------------------------------------- main */

const px = key(decode(SOURCE), SHEET, SHEET);
const band = BAND.map((f) => Math.round(f * SHEET));
const found = shapes(px, band[0], band[1]);
if (found.length !== COLUMNS) {
  throw new Error(
    `${found.length} shapes in rows ${band[0]}-${band[1]}, expected ${COLUMNS}`,
  );
}

// One hand per element, claimed by colour. Every element has to end up with
// exactly one: two columns landing on the same name means the sheet has been
// re-exported against a palette these six no longer match, and packing five
// hands and calling it done would leave one element wearing another's.
const hands = new Map();
for (const box of found) {
  const name = classify(hue(px, box));
  if (hands.has(name)) {
    throw new Error(`two hands classified as ${name}: the palette has moved`);
  }
  hands.set(name, { box, tip: fingertip(px, box) });
}
const missing = ELEMENTS.filter((el) => !hands.has(el.name)).map(
  (el) => el.name,
);
if (missing.length) throw new Error(`no hand for ${missing.join(", ")}`);

// The common canvas: room for the furthest any of the six reaches from its own
// tip, in each of the four directions. Every hand's tip then lands on the same
// point of it, which is what lets art/hinthand.js hold one anchor for all six.
const reach = (pick) => Math.ceil(Math.max(...[...hands.values()].map(pick)));
const left = reach(({ box, tip }) => tip.x - box.x);
const right = reach(({ box, tip }) => box.x + box.w - tip.x);
const top = reach(({ box, tip }) => tip.y - box.y);
const bottom = reach(({ box, tip }) => box.y + box.h - tip.y);
const W = left + right;
const H = top + bottom;

mkdirSync(OUT_DIR, { recursive: true });
const kb = (n) => `${(n / 1024).toFixed(1)}kB`;
let total = 0;

for (const el of ELEMENTS) {
  const { box, tip } = hands.get(el.name);
  const dx = left - Math.round(tip.x - box.x);
  const dy = top - Math.round(tip.y - box.y);
  const out = Buffer.alloc(W * H * 4);
  for (let y = 0; y < box.h; y++) {
    for (let x = 0; x < box.w; x++) {
      const s = ((box.y + y) * SHEET + box.x + x) * 4;
      px.copy(out, ((dy + y) * W + dx + x) * 4, s, s + 4);
    }
  }
  const file = join(OUT_DIR, `hand-${el.name}.webp`);
  encode(out, W, H, file);
  const size = statSync(file).size;
  total += size;
  console.log(
    `${el.name.padEnd(10)} cut ${box.w}x${box.h} at ` +
      `${String(box.x).padStart(4)},${box.y}  placed +${dx},+${dy}  ` +
      `${kb(size).padStart(7)}`,
  );
}

console.log(
  `\n6 files, ${kb(total)} total, ${W * UPSCALE}x${H * UPSCALE} each`,
);
console.log(`\nsrc/art/hinthand.js:`);
console.log(`  HAND_ART = { w: ${W * UPSCALE}, h: ${H * UPSCALE} }`);
console.log(
  `  HAND_TIP = { x: ${(left / W).toFixed(4)}, y: ${(top / H).toFixed(4)} }`,
);
