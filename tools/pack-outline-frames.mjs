/**
 * Key the card outline off its backdrop and pack the one the hero cards wear.
 *
 *   node tools/pack-outline-frames.mjs          # -> src/assets/cards/outline.webp
 *   node tools/pack-outline-frames.mjs --png    # keep the intermediate PNG too
 *   node tools/pack-outline-frames.mjs --proof  # composite it in all six colours
 *
 * The source is `src/source/cards/outline-sheet.png`: six rounded rectangles in a
 * row — red, blue, green, gold, purple, grey, which is the roster's colour order
 * — drawn as a thin line about three pixels thick with a small radius. It is a
 * flat PNG with no alpha channel at all, so the "empty" middle of every frame is
 * a painted dark navy, and so is the sheet around them. Handed to a Sprite it
 * would arrive as six dark tiles that cover the portrait they are meant to
 * enclose.
 *
 * So the backdrop is keyed rather than cropped. Every pixel gets the alpha its
 * distance from the sheet's own background colour implies, and the colour is
 * then thrown away: what is written is white at that alpha, and the card tints
 * it with the element's own GEM_COLORS at runtime.
 *
 * Both of those are the fix for what the six baked files did to a row of cards,
 * and both are worth spelling out, because the sheet looks fine and the cards
 * did not.
 *
 * The colour is thrown away for the reason tools/pack-card-aura.mjs throws its
 * own away: the six element colours live in GEM_COLORS and nowhere else. What
 * came off this sheet was a *seventh* opinion and a muddy one — the keyed red
 * averaged rgb(147,68,59) against FIRE's own rgb(255,90,31), the gold came out
 * rgb(169,141,71) against LIGHTNING's rgb(255,210,46), and wind's frame was a
 * neutral grey next to a pale aqua gem. Every card in the row wore a border that
 * disagreed with the sigil in its own corner. White under a tint is what puts
 * the six colours back under the one list that owns them.
 *
 * And one rectangle is packed rather than all six. They are the same drawing six
 * times, and the differences between them are all defects: measured as coverage
 * rather than as pixels — see `profile`, which is the measurement that settles
 * this — the six lines run from 2.02 to 3.12 source pixels, and the worst of
 * them, the grey, is 2.29 down its sides and 1.44 across its top and bottom.
 * That is a border that visibly gives out at the ends, and it was Taranis's.
 * Six files meant six weights in one row; one file means the row is one row.
 *
 * Which one is picked is a measurement and not a taste: the frame whose line
 * holds the most even weight all the way round, which is the gold. It is also
 * the closest of the six to the card's own aspect, which is worth nothing to a
 * nine-slice and is a pleasant coincidence.
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
const OUT = join(OUT_DIR, "outline");

/** Left to right on the sheet, which is the roster's own colour order. */
const NAMES = ["red", "cyan", "green", "orange", "purple", "grey"];

/**
 * Where the keying ramp starts, as max-channel distance from the backdrop.
 *
 * Set well clear of the gap between the sheet's two dark tones — the panel
 * around a frame is about 16 lighter than the middle of one — so neither
 * survives as a haze.
 *
 * Where it *ends* is measured per frame rather than fixed, and that is the
 * second half of why the packed frames came out dark. A fixed ceiling low enough
 * to make the dimmest of the six solid — the purple line is only 112 away from
 * the backdrop, the gold is 182 — calls every pixel over it fully opaque,
 * including the half-covered ones along both edges of a line three pixels wide.
 * Two of those three pixels are then stored as opaque navy-blended colour, which
 * is a dark line with a dark fringe rather than a bright line with a soft one.
 * Ramped to the line's own distance instead, coverage comes back as coverage.
 */
const KEY_LOW = 28;

/**
 * Which distance counts as the line itself, as a quantile of the lit pixels in
 * one frame. Not the maximum: a single hot pixel off the render would set the
 * ceiling for the whole frame and dim everything under it.
 */
const LINE_Q = 0.98;

/** Alpha at or over this counts as the line when measuring it. */
const SOLID = 0.6;

/** Alpha at or under this is noise off the render, not art. See denoise. */
const ALPHA_FLOOR = 10;

/** Columns with fewer lit pixels than this are noise between frames, not a frame. */
const MIN_RUN = 4;

/** Distance at which a column counts as holding a line, when splitting the sheet. */
const RUN_LEVEL = 70;

/**
 * The height the frame is packed to, and the clear margin around it.
 *
 * 264 because a card is at most about 117 points tall on the biggest screen this
 * creative runs on, at a renderer clamped to resolution 2 — sharp where it is
 * looked at, and not a byte past it. The margin is two transparent pixels so the
 * reduction has somewhere to put the line's antialiasing instead of smearing it
 * against the edge of the texture.
 *
 * Width is whatever the chosen rectangle's own aspect asks for. It is the one
 * dimension a nine-slice does not care about: the flat middle of the top and
 * bottom runs is stretched to whatever the card asks for anyway.
 */
const BOX_H = 264;
const PAD = 2;

/**
 * How much fatter the packed line is drawn than the sheet drew it, in source
 * pixels across both of its edges.
 *
 * The sheet's line is a hairline — a shade over three source pixels, which is
 * two device pixels by the time a card is 117 points tall on a screen at
 * resolution 2 — and two pixels of a colour is an edge that states where a card
 * stops without ever reading as a frame around one. Six of them in a row read as
 * six tiles with a rule drawn round them.
 *
 * So the line is fattened here rather than scaled up there. The alternative was
 * to lay the same art on the card at a larger scale, and that is the thing this
 * pipeline exists to avoid: a hairline asked for at 1.4x its own size is an
 * upsample, and the crisp edge the keying was careful to preserve comes back
 * soft on exactly the pixels that show it. Grown before the reduction, the extra
 * weight is real coverage in the file, and the frame is drawn at its own size
 * the way it always was.
 *
 * Two things set it, and the corners set it first. A rounded corner drawn in a
 * hairline is almost entirely its own antialiasing: at 1.2 the packed art held
 * 0.97 alpha down a straight run and only 0.82 through the arc, so the border
 * stayed shut along its sides and came open at all four corners, with the hero's
 * own square corner showing through the curve. Measured off a real render
 * against the element's own GEM_COLORS, the worst corner pixel sat 90 units off
 * that colour at 1.2 and 35 at 2.8. Anything under about 2.8 is a border with
 * holes in it, whatever weight is wanted.
 *
 * Weight sets the rest of it, and weight moves in steps rather than smoothly,
 * because frameScale rounds the line onto whole device pixels — see
 * art/cardframe.js. On the card this creative draws at its largest, 2.8 and 3.6
 * both come out five device pixels and look identical; 4.4 and 5.2 both come out
 * six. So the choice inside a step is which value lands the art nearest its own
 * scale: 5.2 packs a 6.11 pixel line that is drawn at k 0.98, near enough one to
 * one that nothing is resampled, where 4.4's 5.58 would be stretched 7% to reach
 * the same six pixels. Pick the step first, then the value that sits in the
 * middle of it.
 *
 * Whatever this is set to, re-run this tool and copy the four numbers it prints
 * into art/cardframe.js. They were allowed to drift apart once — the constant
 * there said 2.46 against art that measured 4.44 — and every number that file
 * computes went wrong with them.
 */
const GROW = 5.2;

/** Directions sampled around the disc when fattening. See fatten. */
const GROW_STEPS = 24;

/** What --proof tints the frame with: GEM_COLORS from src/config.js. */
const GEM_COLORS = [0xff5a1f, 0x2fa8ff, 0x3fd16a, 0xffd22e, 0xa855f7, 0x8ceee2];

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

/** Runs of columns that hold a line, one per frame on the sheet. */
function columnRuns(px, w, h, bg) {
  const runs = [];
  let start = -1;
  for (let x = 0; x < w; x++) {
    let n = 0;
    for (let y = 0; y < h; y++) if (away(px, at(w, x, y), bg) > RUN_LEVEL) n++;
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

/** How far from the backdrop this frame's own line stands. See LINE_Q. */
function lineLevel(px, w, h, bg, x0, x1) {
  const lit = [];
  for (let y = 0; y < h; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = away(px, at(w, x, y), bg);
      if (d > KEY_LOW) lit.push(d);
    }
  }
  lit.sort((a, b) => a - b);
  return lit[Math.floor(lit.length * LINE_Q)] || KEY_LOW + 1;
}

/**
 * Key one frame's columns out of the sheet as straight white-on-alpha.
 *
 * The whole sheet's width is kept so the boxing below can go on addressing
 * pixels in the sheet's own coordinates; everything outside `x0..x1` is left
 * transparent.
 */
function key(px, w, h, bg, x0, x1, level) {
  const out = Buffer.alloc(w * h * 4);
  const span = Math.max(1, level - KEY_LOW);
  for (let y = 0; y < h; y++) {
    for (let x = x0; x <= x1; x++) {
      const i = at(w, x, y);
      const a = Math.max(0, Math.min(1, (away(px, i, bg) - KEY_LOW) / span));
      if (a <= 0) continue;
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = clamp8(a * 255);
    }
  }
  return out;
}

/**
 * Grow the keyed line outward by half of GROW on every side.
 *
 * A dilation and not a blur, and on the alpha channel alone: every pixel takes
 * the strongest alpha found on a disc of that radius around it, sampled
 * bilinearly so the radius can be a fraction of a pixel. On a straight run that
 * slides each of the line's two edges out by the radius and leaves the ramp
 * between them exactly as steep as it was — the line gets thicker, not softer,
 * which is the whole difference between this and asking the card to draw it
 * bigger. On a corner it walks the arc outward and keeps it an arc.
 *
 * Read from `px` and written to a copy, because a dilation that reads its own
 * output smears along whichever axis it happens to run in.
 *
 * The span comes back widened by the reach, since a line grown outward now
 * stands a pixel further out than the column run that found it. Handing the old
 * span to lineBox would clip the new outer edge off the left and right of the
 * frame and pack a border that is fatter on two sides than on the other two —
 * the exact defect this packer picks its master to avoid.
 */
function fatten(px, w, h, x0, x1) {
  const r = GROW / 2;
  if (r <= 0) return { px, x0, x1 };

  const reach = Math.ceil(r);
  const lo = Math.max(0, x0 - reach);
  const hi = Math.min(w - 1, x1 + reach);
  const out = Buffer.from(px);

  /** Alpha at a fractional point, bilinear, zero off the sheet. */
  const alpha = (fx, fy) => {
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    let acc = 0;
    for (let dy = 0; dy <= 1; dy++) {
      for (let dx = 0; dx <= 1; dx++) {
        const sx = ix + dx;
        const sy = iy + dy;
        if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
        acc += px[at(w, sx, sy) + 3] * (dx ? tx : 1 - tx) * (dy ? ty : 1 - ty);
      }
    }
    return acc;
  };

  for (let y = 0; y < h; y++) {
    for (let x = lo; x <= hi; x++) {
      const i = at(w, x, y);
      let a = px[i + 3];
      for (let s = 0; s < GROW_STEPS; s++) {
        const t = (s / GROW_STEPS) * Math.PI * 2;
        const v = alpha(x + Math.cos(t) * r, y + Math.sin(t) * r);
        if (v > a) a = v;
      }
      if (a <= 0) continue;
      out[i] = 255;
      out[i + 1] = 255;
      out[i + 2] = 255;
      out[i + 3] = clamp8(a);
    }
  }
  return { px: out, x0: lo, x1: hi };
}

/**
 * The line's own outer rectangle inside `x0..x1` — pixels that are the line,
 * not the haze around it.
 *
 * Solid rather than any-alpha. Some of these six carry a soft glow outside the
 * line: the leftmost is 9% wider that way. Boxed on any-alpha, that glow is
 * measured as part of the frame and the line is scaled down against it; boxed on
 * the line itself, the box is the rectangle the card has to lay on its own edge.
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

/**
 * The line's weight all the way round, as coverage rather than as pixels.
 *
 * Coverage — the alpha down a 16 pixel slice through the line, summed — is the
 * measurement that made the difference between these six legible. Counted as
 * solid pixels they are three of them each and indistinguishable; summed as
 * coverage the grey's top and bottom are 1.44 against its own sides' 2.29 and
 * the gold's 2.95 against 3.20, which is the difference between a border that
 * gives out at the ends and one that does not.
 *
 * Returned with the spread as well as the mean, because the spread is what picks
 * the master: what a row of six cards needs is not the heaviest line, it is the
 * one that is the same weight on all four of its sides.
 */
const REACH = 16;

function profile(px, w, h, box) {
  const alpha = (x, y) => px[at(w, x, y) + 3] / 255;
  const inset = (n) => Math.round(n * 0.12);
  const runs = [];

  for (let y = box.y0 + inset(box.h); y < box.y0 + box.h - inset(box.h); y++) {
    let left = 0;
    let right = 0;
    for (let i = 0; i < REACH; i++) {
      left += alpha(box.x0 + i, y);
      right += alpha(box.x0 + box.w - 1 - i, y);
    }
    runs.push(left, right);
  }
  for (let x = box.x0 + inset(box.w); x < box.x0 + box.w - inset(box.w); x++) {
    let top = 0;
    let bottom = 0;
    for (let i = 0; i < REACH; i++) {
      top += alpha(x, box.y0 + i);
      bottom += alpha(x, box.y0 + box.h - 1 - i);
    }
    runs.push(top, bottom);
  }

  const mean = runs.reduce((a, b) => a + b, 0) / runs.length;
  const sd = Math.sqrt(
    runs.reduce((a, b) => a + (b - mean) ** 2, 0) / runs.length,
  );
  return { mean, sd };
}

/**
 * The corner radius, as the horizontal run the arc takes to flatten out.
 *
 * Read off the art rather than assumed: it is the one number a nine-slice cannot
 * fudge, and the card clips its own portrait to it — see cardFrameRadius. Cut
 * inside the arc and every corner is stretched into an ellipse; clip outside it
 * and the portrait pokes through its own border.
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
 * the frame. Invisible, and it costs more to compress than the line does.
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
console.log(`     backdrop rgb(${bg.join(",")}), ramp from ${KEY_LOW}`);

const runs = columnRuns(sheet, info.w, info.h, bg);
if (runs.length !== NAMES.length) {
  throw new Error(`expected ${NAMES.length} frames, found ${runs.length}`);
}

/**
 * Pack all six, measure all six, keep one. The five that lose cost a second of
 * work and are the only reason the one that wins is a choice rather than a
 * guess — and the table they print is the record of it.
 */
const cut = runs.map(([x0, x1], i) => {
  const level = lineLevel(sheet, info.w, info.h, bg, x0, x1);
  const keyed = fatten(
    key(sheet, info.w, info.h, bg, x0, x1, level),
    info.w,
    info.h,
    x0,
    x1,
  );
  const box = lineBox(keyed.px, info.w, info.h, keyed.x0, keyed.x1);
  const scale = (BOX_H - PAD * 2) / box.h;
  const aw = Math.round(box.w * scale);
  const ah = BOX_H - PAD * 2;
  const cw = aw + PAD * 2;
  const art = resample(crop(keyed.px, info.w, box), box.w, box.h, aw, ah);
  const out = denoise(onCanvas(art, aw, ah, cw, BOX_H), ALPHA_FLOOR);
  const line = profile(out, cw, BOX_H, {
    x0: PAD,
    y0: PAD,
    w: aw,
    h: BOX_H - PAD * 2,
  });
  return {
    name: NAMES[i],
    out,
    w: cw,
    level,
    line,
    radius: cornerRadius(out, cw, BOX_H),
    aspect: box.w / box.h,
  };
});

for (const f of cut) {
  console.log(
    `     ${f.name.padEnd(7)} line ${f.level.toString().padStart(3)} off the backdrop` +
      `  weight ${f.line.mean.toFixed(2)}px  spread ${f.line.sd.toFixed(3)}` +
      `  radius ${f.radius}  ${f.w}x${BOX_H}`,
  );
}

// The evenest line in the set. See the header: the spread is the defect that
// shows on a card, and the mean is not.
const master = cut.reduce((a, b) => (b.line.sd < a.line.sd ? b : a));

if (flags.has("--png")) encode(master.out, master.w, BOX_H, `${OUT}.png`);
encode(master.out, master.w, BOX_H, `${OUT}.webp`, LOSSLESS);

console.log(
  `\nout  ${rel(OUT)}.webp  ${master.w}x${BOX_H}  ${kb(statSync(`${OUT}.webp`).size)}` +
    `  <- the ${master.name}, evenest of the six`,
);
console.log(
  `\n     for art/cardframe.js:  BOX_H ${BOX_H - PAD * 2}  MARGIN ${PAD}` +
    `  BORDER ${master.line.mean.toFixed(2)}  RADIUS ${master.radius}`,
);

/**
 * The packed frame in all six colours over a dark tile, at the size a card
 * actually draws it. This is the only check that matters: a line keyed a shade
 * too hard survives every measurement above and still reads as a dotted edge on
 * a phone, and a white master that is right is right in six colours at once.
 */
if (flags.has("--proof")) {
  const gap = 8;
  const W = (master.w + gap) * NAMES.length + gap;
  const H = BOX_H + gap * 2;
  const proof = Buffer.alloc(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    proof[i * 4] = 26;
    proof[i * 4 + 1] = 18;
    proof[i * 4 + 2] = 40;
    proof[i * 4 + 3] = 255;
  }
  // HeroCard's own `bg` fill, so the proof is a card and not a line on a page.
  const CARD = [0x12, 0x0b, 0x1e];
  let ox = gap;
  GEM_COLORS.forEach((tint) => {
    const rgb = [(tint >> 16) & 255, (tint >> 8) & 255, tint & 255];
    for (let y = PAD; y < BOX_H - PAD; y++) {
      for (let x = PAD; x < master.w - PAD; x++) {
        const d = at(W, ox + x, gap + y);
        for (let c = 0; c < 3; c++) proof[d + c] = CARD[c];
      }
    }
    for (let y = 0; y < BOX_H; y++) {
      for (let x = 0; x < master.w; x++) {
        const a = master.out[at(master.w, x, y) + 3] / 255;
        if (a === 0) continue;
        const d = at(W, ox + x, gap + y);
        for (let c = 0; c < 3; c++) {
          proof[d + c] = clamp8(rgb[c] * a + proof[d + c] * (1 - a));
        }
      }
    }
    ox += master.w + gap;
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
