/**
 * Pack the hero card's two gauges: the trough, and the paints that go in them.
 *
 *   node tools/pack-bars.mjs          # -> src/assets/board/bar-*.webp
 *   node tools/pack-bars.mjs --png    # keep intermediate PNGs too
 *
 * None of it is drawn. It all existed as art already, and the card used to draw
 * its own versions of all of it: a rounded rectangle at 12% alpha for the
 * trough, and flat fills with a white gloss band over them for the paints.
 * Smudges standing in for files.
 *
 * TROUGH — `src/source/board/bars/progress-2-blue.png`, a ready-made 269x29 bar
 * out of the original asset pack: a lit rim, a near-black interior, and a blue
 * fill already painted into its left third. The rim is what we came for. The
 * baked fill is not, because a reading that is part of the art cannot move — so
 * it is cut off and the bar rebuilt empty out of the flat middle of the end
 * with no paint in it, stretched the whole length.
 *
 * The rim goes too, and so do the two arcs it turned at the ends — see `bore`,
 * which is what is left: a square, borderless, near-black track. The rim is why
 * this file was pointed at this source, and the gauge is better without it. At
 * the four-odd points a card's bar is drawn at, three source rows of border on
 * a twenty-five row bar is a quarter of the gauge given over to an outline, and
 * the paint inset to clear it drew a dark line round a bar that was full. The
 * paints below are cut square to match — nothing in either gauge is rounded, and
 * nothing is framed.
 *
 * PAINTS — `src/assets/my-bard/green.png` and `blue.png`: one bar per file, at the
 * size it was painted, each already on nothing rather than on a field. They are
 * cut off `src/assets/my-bard/image.png` by tools/slice-bars.mjs, which is where
 * the field-removal lives and where the reasoning about it is written down: that
 * sheet's four bars are pictures of bars on black, and the blend along every edge
 * of one has to be divided back out before it can be reduced. Nothing in here has
 * to know that. It gets two cutouts.
 *
 * They replace `pill-sheet.png`, which is no longer read: the pills were glossy
 * in the wrong way — a hard specular band across the top third — and next to the
 * flat frames and plates the rest of a card is built from they read as plastic.
 * These are the gauge the mockup asks for: a lit edge along the top, a long even
 * fall to a dark bottom edge, and nothing else.
 *
 * The ends are found on each cutout's own alpha — see `flatSlab` — so there is no
 * corner radius written down in here at all: the first column opaque from top to
 * bottom is the first one past the arc. The flat middle between them is what gets
 * packed, and both arcs are left on the floor. That is not a shortcut, it is what
 * the art turns out to be: no row of either bar's body varies along its whole
 * length by more than 18 of 255, and the median row varies by 6, so a bar is a
 * vertical bevel and nothing else and sixteen rows of it stretch to any length.
 * The worst this tool prints is larger — 29 on the green and 56 on the blue —
 * because it measures every row of the slab and the two feathered rows at each
 * end are the export's own antialiasing rather than the painting. Nothing is
 * put back at the ends: the slab is packed as it is cut, square, because the
 * trough it lies in is square. It used to leave here with stadium caps, which
 * was right for as long as the bore was round.
 *
 * Three come out of the three files:
 *
 *   bar-hp      the green bar as painted, for a hero who is fine.
 *   bar-hp-low  the same bevel under the card's own HP_LOW red, for one who is
 *               not. The gauge cannot get there by tint — Pixi's tint is a
 *               multiply, and no multiple of a green bar is red — and drawing
 *               the low state instead would give one gauge two looks. So the
 *               green's shading is measured as a ramp against its own mean row
 *               and the red is poured through it, which keeps the bevel and
 *               changes only the hue.
 *   bar-mana    the blue bar, for the charge rule. It replaces a 440x64 swatch
 *               of flat cornflower that used to come from
 *               `src/source/board/mana-bar.png`; that file is no longer read.
 *
 * Everything here is encoded lossless: gradients and thin lit rims are exactly
 * what a lossy encoder bands and smears.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = {
  trough: join(ROOT, "src/source/board/bars/progress-2-blue.png"),
  green: join(ROOT, "src/assets/my-bard/green.png"),
  blue: join(ROOT, "src/assets/my-bard/blue.png"),
};
const OUT = join(ROOT, "src/assets/board/bar");

/**
 * Size to pack each piece at.
 *
 * The rule is `readouts()`: 0.86 of a card wide and 0.035 of it tall, so about
 * 48x4 points on a phone and half again as much in the landscape column, on a
 * renderer clamped to resolution 2. 160 across covers the worst case with a
 * pixel to spare, and past that every pixel is base64 nobody sees.
 *
 * The height is deliberately generous — four times what is drawn. The trough's
 * rim is one source pixel deep after the reduction and has to survive it, and
 * the swatch has nothing along that axis at all, so it rides along for free.
 */
const SIZE = {
  trough: { w: 160, h: 16 },
  paint: { w: 160, h: 16 },
};

/**
 * The paints packed, and what each one becomes.
 *
 * `src` is which of the two cutouts it is read from — the colour the bar was
 * painted, which is all the file knows about itself. `recolour` is the hue poured
 * through that bar's own bevel, see the header; a bar with none is packed once,
 * in the colour it was painted.
 */
const PAINTS = [
  { src: "green", name: "hp", also: { name: "hp-low", recolour: 0xff3b2f } },
  { src: "blue", name: "mana" },
];

/** Alpha at or under this is nothing, not art. */
const EMPTY = 12;

/** Alpha at or over this is the body of the bar rather than its rounded end. */
const SOLID = 250;

/**
 * How much of the fullest row a row has to match to count as the bar's body.
 *
 * Half. `bodyRows` is separating two things that are nowhere near each other —
 * the rows opaque for the bar's whole flat length, about 1090 columns of these
 * cutouts, and the two feathered rows at each end which are opaque for none of
 * it — so anything between 0 and 1 picks the same rows, and half says that
 * without pretending to a precision the measurement does not have.
 */
const BODY_ROW = 0.5;

/**
 * Columns dropped past each rounded end, on top of the arc itself.
 *
 * Two. The slab is about to be stretched the whole length of a gauge, so a single
 * half-covered column left at one end of it is a ghost along the entire bar — and
 * the arcs here are cut by coverage, which puts a feathered column at exactly the
 * place `SOLID` stops looking.
 */
const END_MARGIN = 2;

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

/** Tightest box holding every pixel the eye can see. */
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

/**
 * Rightmost column with paint in it.
 *
 * Blue rather than "brighter than the interior": the interior is near-black and
 * so is the shadow under the fill's cap, but nothing in the empty half of this
 * bar is blue. The glow the fill throws past its own edge is caught by the same
 * test, which is what we want — it is paint too, and it has to go.
 */
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

/**
 * How many rows of rim there are top and bottom, read off a column that is all
 * trough. The interior is the darkest thing in the bar, so the rim is however
 * many rows it takes to get down to it.
 */
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

/**
 * The bar, rebuilt with no paint in it and no border on it: the bore, and
 * nothing else.
 *
 * Two things are cut away here, and both of them are the same instruction —
 * this is a track, not a frame.
 *
 * Along the length: the paint is cut at `paintTo` and the source's own arc is
 * left on the floor at the other end, and what is between them is stretched over
 * the whole width. Both ends used to be that arc, the right one as drawn and the
 * left one mirrored off it, so the bar wore half its own height of rounding at
 * each end.
 *
 * Across it: `edges` are dropped, which is the lit rim the source was cut for in
 * the first place. It read as a frame — at the depth a card's gauge is drawn, a
 * three-row border on a twenty-five-row bar is a quarter of the gauge spent on
 * an outline, and the paint sitting inside it left a dark line all the way round
 * a full bar. What is left is the interior: near-black, with the shallow fall
 * from top to bottom that the art has and a flat fill does not.
 */
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

/**
 * Which rows of a cutout are the bar's body rather than its feathered edges.
 *
 * The top and bottom rows of one of these bars are part coverage, and that is the
 * art: the lit edge and the dark one, recovered from a blend with the field the
 * sheet was painted on, neither of them opaque anywhere along its length. So a
 * column cannot be asked whether it is opaque from the top of the ink box to the
 * bottom of it — none is. `flatSlab` asked exactly that, and with no column ever
 * answering yes it walked its left edge all the way to its right one and packed
 * the single half-covered column at the tip of the arc. Both gauges shipped as a
 * 2%-alpha haze: sprites in place, textures decoded, nothing on screen.
 *
 * The body is measured rather than trimmed by a written-down count of rows: a row
 * is body if it is opaque over BODY_ROW of the length the fullest row manages. On
 * these cutouts that is rows 2 to 102 of 105 — two feathered rows fall off each
 * end and everything between them is opaque for the bar's whole flat middle.
 */
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

/**
 * The flat middle of a cutout: its ink box, less the rounded ends.
 *
 * Three measurements and no constants but the margin. The ink box is every pixel
 * the eye can see, which on a cutout is the bar and only the bar; the body is
 * which rows of it are asked about; the ends are wherever the alpha stops being
 * solid down that body, which is the corner arc and only the arc. A bar with
 * square ends measures as having none and keeps its whole length.
 *
 * Nothing comes off the top or the bottom, and nothing needs to: the row that was
 * a blend of the lit edge and the field left the slicer as the lit edge at the
 * coverage it actually has. Dropping it would throw away the brightest row of the
 * bevel, which is the one row of it a gauge four points deep really shows. It is
 * left out of the arc test and kept in the slab.
 */
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

/**
 * The same bevel in another hue.
 *
 * Every row is scaled to the ramp its own luminance makes against the slab's
 * mean row, and the new colour is put through that ramp. So the row that was
 * average stays exactly the colour asked for, the lit row above it comes out as
 * far above that as the source's was above its own mean, and the dark edge as
 * far below — the bevel is the source's, measured rather than invented, and only
 * the hue is new.
 *
 * Channels clip rather than desaturating together. HP_LOW is already almost pure
 * red, so its top rows have nowhere to go but white-ward in green and blue,
 * which is what a lit edge on a red bar looks like anyway.
 */
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

/** The widest a single column varies down its own length, over every column. */
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

const clamp8 = (v) => Math.max(0, Math.min(255, Math.round(v)));

/* --------------------------------------------------------------------- main */

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

/* ---- the trough the rule sits in ---- */

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

/* ---- the paints, one cutout per colour ---- */

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

/** Rows for columns, so `verticalSpread` can be asked about the other axis. */
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
