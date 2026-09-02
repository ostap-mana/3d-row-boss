/**
 * Cut the six neon hint hands off the hand-pose sheet.
 *
 *   node tools/pack-neon-hand.mjs      # -> src/assets/hint/hand-*.webp
 *
 * The source is `src/source/hand/image.png` — 1536x1024 of hint-hand art in
 * the same neon-on-black language as the marks sheet, laid out as four rows of
 * six. The rows are poses and the columns are the element colours: finger up
 * with the thumb out, the same finger up straight-on, a fist pointing right, and
 * one pointing down. The columns run wind, arcane, water, fire, nature,
 * lightning, left to right, which is nobody's canonical order — so a column's
 * element is read off its colour rather than its position, the way
 * tools/pack-hint-marks.mjs reads its own.
 *
 * Only the first row is cut. It is the pose the prop has always had — finger up,
 * thumb out, cuff running off the bottom — so the hand ui/hand.js drives is the
 * hand it was driving before, redrawn, and none of the demo it plays has to be
 * rethought around a new gesture. The other three rows are on the sheet for a
 * lesson that points sideways or down and does not exist yet; when it does, they
 * are three more bands of this same cut.
 *
 * Six hands are cut rather than one because the frame round the gem and the
 * arrow off it already come in six (see tools/pack-hint-marks.mjs), so the set
 * is there for a hand that wears the element it is pointing at. ui/hand.js wears
 * all six, one per lesson, and carries a dark rim under the line so a green hand
 * still reads on green gems.
 *
 * This sheet has been the one cut twice, either side of `hand-v2.png` — a redraw
 * of the same four poses in the same six colours in a much narrower line, a long
 * straight finger on a thin palm, which is no longer on disk. Nothing this file
 * reads about a sheet changed across either swap and every number it measures
 * off one did: 94 pixels of hand across and 1.81 times its own width tall going
 * one way, and about 160 across and 1.38 coming back. That is a different prop
 * on the board and not a redraw of the same one, which is why the swap moves
 * ui/hand.js's numbers too and not only this file's output.
 *
 * Both replaced `src/source/hint/hand-sheet.png`, the labelled sheet whose
 * section 10.1 held the six before either of them; it is still on disk, and the
 * git history of this file still holds the cut that read its sections. Before
 * the neon came a painted leather gauntlet, still cut by tools/pack-hand.mjs off
 * its own source.
 *
 * Keying is the marks sheet's, for the same reason: no alpha channel, neon over
 * a near-black backdrop, so the brightest channel is the intensity and dividing
 * it back out recovers the colour that was multiplied by it. See
 * tools/pack-hint-marks.mjs, where the same `key` is explained at length.
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
 * hand, so their crops run 154 to 163 across and 211 to 227 down, and their tips
 * sit anywhere from nothing to eight pixels below the top of their own glow —
 * six sprites with six anchors would mean ui/hand.js re-anchoring and re-sizing
 * every time the element changed, off differences the game has no way to mean
 * anything by. So
 * each hand is composed onto a common canvas at whatever offset puts its own tip
 * on a common point: one aspect, one anchor, and swapping the texture is the
 * whole of changing colour. The canvas is the tightest one that fits all six
 * that way.
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
const SOURCE = join(ROOT, "src/source/hand/image.png");
const OUT_DIR = join(ROOT, "src/assets/hint");

/** The sheet, in pixels: four pose rows by six colour columns. */
const SHEET = { w: 1536, h: 1024 };

/**
 * The first pose row, as fractions of the sheet's height.
 *
 * Wide of the hands on both sides and clear of the second row, which starts at
 * 0.293. The band is a window to search and not a crop: the glow reaches
 * further above the fingertip on some colours than on others, so a window
 * tighter than the gap between the rows would take a halo off one hand and not
 * off the next and put the six on canvases that no longer agree. There is no
 * text on this sheet to keep out of, which is what lets the window be that
 * loose — the MIN_AREA guard below is what decides what counts as a hand.
 *
 * It has to be checked against the sheet and not carried over from the last
 * one, and the failure when it is not is quiet. The window that fitted the
 * previous draw opened at 0.05, which is ten pixels *inside* the top of this
 * row: the six shapes came out the right count, the right colours and plausibly
 * the right size, and every one of them had its fingertip sliced off flat and
 * its anchor sitting on the cut. The tell is HAND_TIP printing y = 0, meaning
 * the topmost solid row of the drawn line and the topmost row of its own glow
 * came out the same row — which no glow does. Row 1 of this sheet runs 41 to
 * 267 of 1024 and the window is eight to ten rows clear of it on both sides.
 */
const BAND = [0.03, 0.285];

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
 * Well under the hands themselves, which key out to between twelve and eighteen
 * thousand pixels on this sheet, and well over any speck the keying lifts off
 * the backdrop. It is the guard that makes the band's edges a matter of
 * clearance rather than of precision.
 *
 * It came down from 2000 for `hand-v2.png`, whose line was thin enough that the
 * smallest hand on it drew barely twice what the floor asked. This sheet has
 * room for either number — its lightest hand clears 1200 ten times over — so it
 * is left where the narrower draw needed it, and there is nothing on either
 * sheet in between the two.
 */
const MIN_AREA = 1200;

/** Alpha at or above which a pixel is the drawn line and not its glow. */
const SOLID = 150;

/** Below this the pixel is the sheet's backdrop. See `key` in pack-hint-marks. */
const FLOOR = 22;

/**
 * Packed at twice the size it is cut at.
 *
 * A hand is about 160 pixels across on this sheet and ui/hand.js asks for up to
 * 140 points of it, which is 420 device pixels on a phone at three to the point.
 * The upscale has to happen somewhere and lanczos here beats the bilinear the
 * GPU would do at draw time, so it is worth doing; but two is enough to clear
 * that 420 and three only buys headroom nothing asks for, at more than twice
 * the bytes — the six webps come out around 200kB at two and 450kB at three.
 *
 * It was three for one draw of this sheet, the narrow one, where a hand was 94
 * pixels across and two would have left the prop being blown up past its own
 * pixels on the widest phone. Two is what served every wider draw before it,
 * and this one is wider again.
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

const alphaAt = (px, x, y) => px[(y * SHEET.w + x) * 4 + 3];

/** Every run of touching pixels in a band, left to right. Gap-tolerant by 3px. */
function shapes(px, y0, y1) {
  const h = y1 - y0 + 1;
  const seen = new Uint8Array(SHEET.w * h);
  const found = [];
  const lit = (x, y) => alphaAt(px, x, y0 + y) > 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < SHEET.w; x++) {
      if (seen[y * SHEET.w + x] || !lit(x, y)) continue;
      const stack = [[x, y]];
      seen[y * SHEET.w + x] = 1;
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
            if (nx < 0 || ny < 0 || nx >= SHEET.w || ny >= h) continue;
            if (seen[ny * SHEET.w + nx] || !lit(nx, ny)) continue;
            seen[ny * SHEET.w + nx] = 1;
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
      const i = (y * SHEET.w + x) * 4;
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

const px = key(decode(SOURCE), SHEET.w, SHEET.h);
const band = BAND.map((f) => Math.round(f * SHEET.h));
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
      const s = ((box.y + y) * SHEET.w + box.x + x) * 4;
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
