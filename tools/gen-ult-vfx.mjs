/**
 * Draw the ultimate borders and their activation bursts, in arithmetic.
 *
 *   node tools/gen-ult-vfx.mjs                 # all twelve sheets
 *   node tools/gen-ult-vfx.mjs fire water      # just these elements
 *   node tools/gen-ult-vfx.mjs --proof         # + a contact strip per sheet
 *   node tools/gen-ult-vfx.mjs --brushes       # + the particle art it stamps
 *
 * Writes `src/assets/cards/ult-<element>.webp` and `ult-burst-<element>.webp`,
 * eighteen frames on a 6x3 grid, straight from here — no model, no clips, no
 * shelf to judge. ffmpeg encodes the webp and does nothing else; every pixel of
 * the art is computed below.
 *
 * ## Why this exists at all
 *
 * The set this replaces was generated: Wan 2.2 clips composited onto the band
 * around the card by tools/pack-card-auras.mjs, at four rounds of prompts and
 * about three hours of GPU. Read that file's `SHOT_FLARE` and `SHOT_DENSE` for
 * what was tried. Every round arrived as the same thing — *a texture wrapped
 * around a rectangle* — and it kept being rejected for the same reason, which
 * is that a wrapped texture reads as a patterned frame rather than as an
 * effect. The fur on the nature and wind takes was the same failure showing its
 * working.
 *
 * The limit was never the prompt. It is that a video model cannot be told
 * *twelve sparks, this radius, decelerating, and close the loop exactly*. It
 * has no handle for a discrete object, and a border effect is made of discrete
 * objects: sparks that leave the rim and fade, a ring that expands once, a
 * wave that travels. So the four things the rejected sets were missing are all
 * four things arithmetic gives away for free:
 *
 *   **Discrete particles.** A spark here is a position, a velocity and a life,
 *   drawn as a trail. There are as many as are asked for, where they are asked
 *   for. See `emit`.
 *   **An exact loop.** Every periodic term is a function of `f/COUNT`, so frame
 *   twelve meets frame one to the last bit. Which is also why these sheets get
 *   a shape of their own — see the note on the grid.
 *   **Layers.** The line, the travelling wave, the particles, the bloom, and in
 *   a burst the flash, the shockwave and the rays, each composited in turn
 *   instead of one clip standing in for all of them.
 *   **Timing curves.** A burst can have an attack of two frames, a peak, and a
 *   fall that lands on exactly zero. `env` is that, and it is four lines.
 *
 * The elements are separated by **behaviour** before anything else — see
 * `RECIPES`. A spark that rises and gutters is fire because of how it moves; a
 * mote that slides along the rim is water for the same reason. Six palettes of
 * the same motion would be the old failure again in a new tool.
 *
 * ## The second pass: material, and where the light catches
 *
 * The first cut of this file shipped and the note against it was that nothing
 * in it is painted — there was no observed flame, only a model of one, so the
 * six read as *stylised light* rather than as anything with a surface. Four
 * things answer that, and none of them reopens generation.
 *
 *   **Real particle art.** A particle is no longer a radial falloff. It is a
 *   frame of one of the shipped game's own flipbooks — `src/source/fx/invokers`,
 *   pulled out of the Unity build — stamped at a size, a rotation and a frame
 *   the arithmetic still picks. So an ember is a torn lick of flame drawn by an
 *   artist, and it still leaves the rim exactly when it is told to and closes
 *   the loop to the last bit. That is the whole trade this pass makes: the
 *   material comes from the build, the control stays here. See `loadBrush` and
 *   `stamp`.
 *   **A sheen.** One narrow white-gold highlight running the perimeter once a
 *   cycle, over the slow wide elemental wave. Two frequencies is what separates
 *   a lit border from a glowing one — the fast one is the light *catching* on
 *   something, and a surface that catches light has a surface.
 *   **Gold inlay.** The middle third of the line carries a warm thread that
 *   brightens as the sheen passes over it. The build's own frames are gold
 *   filigree with the element set into them, and an effect that is pure element
 *   colour is not wearing the game's jewellery — see
 *   `src/source/prompts.md`'s style block.
 *   **Corners, and a breath.** The four corner arcs sit a little brighter than
 *   the runs, the way every ornamented frame in the build does, and the whole
 *   border swells and settles once a cycle. Both are periodic in `f/COUNT`, so
 *   both are free.
 *
 * The frame count went 12 -> 18 at the same time, which is the one change here
 * that costs bytes. Twelve frames at 7 fps is a 1.7 s lap in eleven visible
 * steps; a textured ember stepped that coarsely strobes, because the eye tracks
 * a shape and cannot track a blob. Eighteen at 10 fps is an 1.8 s lap — the same
 * tempo, half again the steps — and it needs a shape of its own in
 * `src/art/ultborder.js`, which is the `vfx2` entry there.
 *
 * ## The grid, and why these play differently
 *
 * 216x344 cells, six across, eighteen frames — a 1296x1032 sheet. That is a
 * geometry of its own rather than the flare shelf's, and the reason is not the
 * cell size: it is that `src/art/ultborder.js` matches a sheet to its shape by
 * its own dimensions, and a shape carries how the loop is *played*. Every
 * generated set had to be ping-ponged, because a Wan clip has no seam that
 * lines up; these are cyclic by construction, so they run straight through and
 * a wave that travels keeps travelling instead of sloshing back. Giving them
 * their own dimensions is what lets both kinds live in the build at once.
 *
 * Supersampled 3x and area-averaged down, because the card's own line is the
 * one crisp thing in the frame and a 7px line drawn at 1x is a jagged 7px line.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src/assets/cards");
/** `--proof` writes contact strips here, never into the bundle's own folder. */
const PROOF_DIR = join(ROOT, "src/animation/vfx-proof");

/* --------------------------------------------------------------- geometry */

/** The sheet, mirrored by the `vfx2` entry in src/art/ultborder.js. */
const COLS = 6;
const COUNT = 18;
const CELL_W = 216;
const CELL_H = 344;

/**
 * The rate the loop is played back at, carried on the shape in ultborder.js
 * rather than left to that file's default.
 *
 * 18 at 10 is the same 1.8 s lap the 12-at-7 set had, which is the point: the
 * tempo was judged and kept, and what the extra six frames buy is that a
 * *textured* particle no longer jumps a visible distance between two frames.
 * At 7 fps a stamped ember reads as six separate embers.
 */
const FPS = 10;

/**
 * The card's own border line, as its outer rectangle, and the margin round it.
 *
 * 128x256 keeps outline.webp's aspect — 304 by 608 is 0.5, and so is this — and
 * 44 of margin on every side is what the effect flies out into. The pads that
 * come out of it are printed at the end of a run and hardcoded in ultborder.js:
 * a sheet is drawn at the card's size times one plus twice the pad, so the line
 * in the file lands exactly on the line the card draws.
 */
const CARD_W = 128;
const CARD_H = 256;
const MARGIN = 44;
/** 7 of 128 is outline.webp's 7 of 128. The radius likewise. */
const LINE = 7;
const RADIUS = 5;

/** Supersample. The line is why; see the header. */
const SS = 3;
/**
 * libwebp quality. Smooth ramps and black, which webp likes.
 *
 * 82 until the second pass and 72 after it, which is a fifth off the set — 636
 * kB to 507 kB, and about 170 kB off the bundle once base64 has taken its
 * third. It was checked rather than assumed: the two encodes are 38 dB apart
 * and side by side at 3x there is nothing to see, because everything in these
 * frames is either a smooth ramp or black and the one hard edge, the card's
 * line, is the part webp spends its bits on. Half again the frames arrived at
 * this pass and this is where they were paid for.
 */
const QUALITY = 72;

const W = CELL_W * SS;
const H = CELL_H * SS;
const hw = (CARD_W * SS) / 2;
const hh = (CARD_H * SS) / 2;
const rad = RADIUS * SS;
const half = (LINE * SS) / 2;
const cx = W / 2;
const cy = H / 2;
/** How far out the glow and the particles may go before the file runs out. */
const REACH = MARGIN * SS * 0.94;

/**
 * The six, as the colour their light is hottest in and the colour it cools to.
 *
 * `color` is GEM_COLORS from src/config.js, in its order — duplicated here, see
 * any packer for why. `deep` has no counterpart in the game: it is the far end
 * of the falloff, the most saturated and least bright version of the same hue,
 * and it is what stops the glow reading as one flat colour smeared outwards.
 * Picked by eye against each element, and the rule they were picked by is that
 * a deep tone should still be unmistakably the same element in isolation —
 * fire's is a dark red and not a brown, arcane's an indigo and not a navy.
 */
const ELEMENTS = [
  { id: "fire", color: 0xff5a1f, deep: 0xa81200 },
  { id: "water", color: 0x2fa8ff, deep: 0x0c37b4 },
  { id: "nature", color: 0x3fd16a, deep: 0x0d6b2a },
  { id: "lightning", color: 0xffd22e, deep: 0xb85c00 },
  { id: "arcane", color: 0xa855f7, deep: 0x431a96 },
  { id: "wind", color: 0x8ceee2, deep: 0x1d7f92 },
];

/* -------------------------------------------------------------- perimeter */

/*
 * The rounded rectangle walked as eight runs — four straights and four quarter
 * circles — starting at the left end of the top edge and going clockwise.
 *
 * Everything in this file that sits *on* the border is placed by arclength
 * along that walk rather than by angle from the centre. Angle bunches up along
 * the long sides and stretches at the corners, so a wave travelling at a
 * constant rate in angle would visibly slow down and speed up four times a lap.
 */
const runX = 2 * (hw - rad);
const runY = 2 * (hh - rad);
const runArc = (Math.PI / 2) * rad;
const PERIM = 2 * runX + 2 * runY + 4 * runArc;

/**
 * The four corner arcs, as points on that same walk.
 *
 * Every ornamented frame in the build puts its weight in the corners — the
 * filigree thickens there and the gems are set there — and a border that is
 * exactly as bright along the middle of a 256-long run as it is at the turn
 * reads as a tube bent into a rectangle rather than as a frame. Lifting the
 * corners is four numbers and it is most of why this pass looks made.
 *
 * Derived rather than typed: the walk is runX, arc, runY, arc, runX, arc,
 * runY, arc from the left end of the top edge, so an arc's middle is its start
 * plus half its length. Change RADIUS and these follow.
 */
const CORNER_U = [
  runX + runArc / 2,
  runX + runArc + runY + runArc / 2,
  2 * runX + 2 * runArc + runY + runArc / 2,
  2 * runX + 3 * runArc + 2 * runY + runArc / 2,
].map((d) => d / PERIM);

/** How far either side of a corner the lift reaches, as a fraction of a lap. */
const CORNER_SIGMA = 0.032;

/** How much brighter a corner is than the run it is at the end of, 0..1. */
const CORNER_LIFT = 0.6;

/** The corner weight at `u`: the nearest of four gaussians, wrapped. */
function cornerAt(u) {
  let best = 0;
  for (const c of CORNER_U) {
    let d = Math.abs(u - c);
    if (d > 0.5) d = 1 - d;
    const g = Math.exp(-(d * d) / (2 * CORNER_SIGMA * CORNER_SIGMA));
    if (g > best) best = g;
  }
  return best;
}

/**
 * The point at `u` of the way round, with its outward normal and its tangent.
 *
 * @param {number} u 0..1, wrapped.
 * @returns {[number, number, number, number, number, number]} x, y, nx, ny,
 *   tx, ty — the last pair pointing the way `u` increases.
 */
function pointAt(u) {
  let d = (u - Math.floor(u)) * PERIM;
  const ex = hw - rad;
  const ey = hh - rad;

  if (d < runX) return [cx - ex + d, cy - hh, 0, -1, 1, 0];
  d -= runX;
  if (d < runArc) {
    const a = -Math.PI / 2 + d / rad;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    return [cx + ex + rad * nx, cy - ey + rad * ny, nx, ny, -ny, nx];
  }
  d -= runArc;
  if (d < runY) return [cx + hw, cy - ey + d, 1, 0, 0, 1];
  d -= runY;
  if (d < runArc) {
    const a = d / rad;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    return [cx + ex + rad * nx, cy + ey + rad * ny, nx, ny, -ny, nx];
  }
  d -= runArc;
  if (d < runX) return [cx + ex - d, cy + hh, 0, 1, -1, 0];
  d -= runX;
  if (d < runArc) {
    const a = Math.PI / 2 + d / rad;
    const nx = Math.cos(a);
    const ny = Math.sin(a);
    return [cx - ex + rad * nx, cy + ey + rad * ny, nx, ny, -ny, nx];
  }
  d -= runArc;
  if (d < runY) return [cx - hw, cy + ey - d, -1, 0, 0, -1];
  d -= runY;
  const a = Math.PI + d / rad;
  const nx = Math.cos(a);
  const ny = Math.sin(a);
  return [cx - ex + rad * nx, cy - ey + rad * ny, nx, ny, -ny, nx];
}

/* ------------------------------------------------------- the static fields */

/**
 * Five things every frame needs and none of them move: how much of the card's
 * line is at this pixel, how much of the outward band, how much of the gold
 * thread down the middle of the line, how far round the border the pixel is,
 * and how close it is to a corner.
 *
 * Computed once. The rim pass then touches only the pixels where one of the
 * two masks is non-zero, which is a fifth of the frame.
 */
const lineMask = new Float32Array(W * H);
const bandMask = new Float32Array(W * H);
const inlayMask = new Float32Array(W * H);
const uOf = new Float32Array(W * H);
const cornerOf = new Float32Array(W * H);
const touched = [];

{
  const ex = hw - rad;
  const ey = hh - rad;
  const feather = SS * 0.8;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const qx = ax - ex;
      const qy = ay - ey;
      const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const d = out + Math.min(Math.max(qx, qy), 0) - rad;
      const off = Math.abs(d) - half;
      const i = y * W + x;

      lineMask[i] = Math.min(1, Math.max(0, 0.5 - off / feather));
      // The inlay: the middle third of the line's own width, feathered on both
      // sides so it is a thread laid into the line rather than a second line
      // drawn on top of it. A hard-edged one shows as a seam at this scale.
      inlayMask[i] = Math.min(
        1,
        Math.max(0, (half * 0.34 - Math.abs(d)) / feather + 0.5),
      );
      // Outward: a falloff that reaches zero inside the canvas, so nothing is
      // cut off by the edge of the file. Inward: a short bleed, because a line
      // with the glow stopped dead at it looks pasted on, and no further —
      // everything inside this rectangle is the hero's face.
      bandMask[i] =
        off <= 0
          ? 1
          : d > 0
            ? Math.pow(Math.max(0, 1 - off / REACH), 1.4)
            : Math.exp(-off / (3.5 * SS));

      if (lineMask[i] > 0.002 || bandMask[i] > 0.004) {
        /* Arclength of the nearest point, folded out of one quadrant. */
        let s;
        if (qx > 0 && qy > 0) s = runY / 2 + Math.atan2(qy, qx) * rad;
        else if (qx >= qy) s = ay;
        else s = runY / 2 + runArc + (ex - ax);
        const quad = runY / 2 + runArc + runX / 2;
        let u;
        if (dx >= 0 && dy >= 0) u = s;
        else if (dx < 0 && dy >= 0) u = 2 * quad - s;
        else if (dx < 0) u = 2 * quad + s;
        else u = 4 * quad - s;
        uOf[i] = (u / (4 * quad)) % 1;
        cornerOf[i] = cornerAt(uOf[i]);
        touched.push(i);
      }
    }
  }
}

/* ------------------------------------------------------------------ random */

/** Deterministic, so a re-run is the same sheet. Hashed, never Math.random. */
function rnd(i) {
  const s = Math.sin(i * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/* ----------------------------------------------------------------- brushes */

/**
 * The particle art, taken out of the shipped game's own flipbooks.
 *
 * `src/source/fx/invokers/*.png` are Unity particle sheets pulled from the
 * Invokers Titan Legacy build — white shapes on black or on alpha, no colour of
 * their own, because a particle system tints them at runtime. That is exactly
 * the shape this file wants: the mask is somebody's drawing of a flame lick or
 * a blade or a swirl, and the colour is still the element's.
 *
 * They are loaded here rather than packed into an asset because nothing ships:
 * a brush only ever exists inside a run of this tool, and what ships is the
 * sheet it was stamped into. tools/pack-invokers-fx.mjs is the other reader of
 * this folder and it does ship its output; the two share the filename-grid
 * convention below and nothing else.
 *
 * Each is decoded once and cut to the grid its own filename states, then every
 * cell is box-averaged down to a square mask and put through three fixes that
 * are all load-bearing:
 *
 *   **One normalisation across the whole flipbook**, never per frame. Per frame
 *   would push a nearly-dissipated puff back up to full and the particle would
 *   refuse to die.
 *   **Dead frames dropped.** The tail of one of these is often two or three
 *   cells of almost nothing, and a stamp that lands on one is an invisible
 *   particle — a hole in the effect rather than an ember that has gone out,
 *   because the arithmetic is still spending a slot on it.
 *   **A round window and a recentre.** The cells are square and plenty of these
 *   shapes run to the edge of theirs, which stamps a visible corner; and a
 *   shape whose mass sits off-centre would make the particle wander away from
 *   the point it was placed at. Both are cheap and both are visible when they
 *   are missing.
 */
const BRUSH_DIR = "src/source/fx/invokers";

/** Mask resolution. Nothing is stamped bigger than about 60px supersampled. */
const BRUSH_PX = 96;

/** Everything under this of full is backdrop, and additive light needs it at 0. */
const BRUSH_FLOOR = 0.07;

/** A cell whose own peak is under this of the flipbook's is a dead frame. */
const BRUSH_KEEP = 0.3;

/**
 * How white the densest pixel of a stamp is allowed to go.
 *
 * Capped for the reason tools/pack-invokers-fx.mjs caps its own burnout: half
 * this library is a solid shape rather than a soft gradient, so a burn that
 * reaches full white at a full mask turns the whole ember white and the element
 * survives only in the feathered rim. The burn is a highlight on the colour.
 */
const BRUSH_BURN = 0.55;

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

/**
 * Columns and rows, read off the filename the build gave the texture.
 *
 * `_4x4_A` and `_3x3` and `_4x2` all appear; the grid is the last `NxM` in the
 * name and whatever follows it is a variant tag. Same rule, and the same
 * reasoning, as tools/pack-invokers-fx.mjs: the aspect is wrong as often as it
 * is right, because plenty of them are packed into a 1024x512.
 */
function gridOf(name) {
  const all = [...name.matchAll(/_([1-9])x([1-9])(?![0-9])/g)];
  if (!all.length) throw new Error(`${name}: no NxM grid in the filename`);
  const m = all[all.length - 1];
  return { cols: Number(m[1]), rows: Number(m[2]) };
}

/** Luminance times alpha: the library stores its shapes both ways. */
function maskAt(px, i) {
  const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  return (l * px[i + 3]) / (255 * 255);
}

const brushes = {};

function loadBrush(name) {
  if (brushes[name]) return brushes[name];
  const file = join(ROOT, BRUSH_DIR, `${name}.png`);
  const { w, h } = probe(file);
  const { cols, rows } = gridOf(name);
  const px = execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "rgba", "-"],
    { maxBuffer: 1 << 30 },
  );
  const cw = Math.floor(w / cols);
  const ch = Math.floor(h / rows);

  const cells = [];
  let peak = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const m = new Float32Array(BRUSH_PX * BRUSH_PX);
      for (let y = 0; y < BRUSH_PX; y++) {
        const sy0 = r * ch + Math.floor((y * ch) / BRUSH_PX);
        const sy1 = Math.max(
          sy0 + 1,
          r * ch + Math.floor(((y + 1) * ch) / BRUSH_PX),
        );
        for (let x = 0; x < BRUSH_PX; x++) {
          const sx0 = c * cw + Math.floor((x * cw) / BRUSH_PX);
          const sx1 = Math.max(
            sx0 + 1,
            c * cw + Math.floor(((x + 1) * cw) / BRUSH_PX),
          );
          let sum = 0;
          let n = 0;
          for (let sy = sy0; sy < sy1; sy++) {
            for (let sx = sx0; sx < sx1; sx++) {
              sum += maskAt(px, (sy * w + sx) * 4);
              n++;
            }
          }
          const v = sum / n;
          m[y * BRUSH_PX + x] = v;
          if (v > peak) peak = v;
        }
      }
      cells.push(m);
    }
  }
  if (peak <= 0) throw new Error(`${name}: decoded to nothing`);

  const frames = [];
  for (const m of cells) {
    let hi = 0;
    let sum = 0;
    let mx = 0;
    let my = 0;
    for (let y = 0; y < BRUSH_PX; y++) {
      for (let x = 0; x < BRUSH_PX; x++) {
        const i = y * BRUSH_PX + x;
        // Normalise, crush the backdrop, and window off the square edge in one
        // pass. The window is a smooth roll from 0.84 of the half-width out,
        // which clears every shape in the library that runs to its own border.
        const dx = (x + 0.5) / BRUSH_PX - 0.5;
        const dy = (y + 0.5) / BRUSH_PX - 0.5;
        const q = Math.min(1, Math.hypot(dx, dy) / 0.5);
        // `Math.max(0, ...)` is not belt and braces. At q exactly 1 the ratio
        // comes back as 1.0000000000000002 in binary, the base goes a shade
        // negative, and a fractional power of a negative is NaN — which then
        // ran through the centroid, made the shift NaN, and left every brush a
        // silently empty array, because a typed array ignores a NaN index.
        const win =
          q <= 0.84 ? 1 : Math.pow(Math.max(0, 1 - (q - 0.84) / 0.16), 1.5);
        let v = m[i] / peak;
        v = v <= BRUSH_FLOOR ? 0 : (v - BRUSH_FLOOR) / (1 - BRUSH_FLOOR);
        v *= win;
        m[i] = v;
        if (v > hi) hi = v;
        sum += v;
        mx += v * x;
        my += v * y;
      }
    }
    if (hi < BRUSH_KEEP || !(sum > 0)) continue;

    // Recentre on the mass, to the nearest pixel. Subpixel would be a resample
    // of a mask that is about to be resampled again at stamp time anyway.
    const sx = Math.round(BRUSH_PX / 2 - mx / sum);
    const sy = Math.round(BRUSH_PX / 2 - my / sum);
    if (sx === 0 && sy === 0) {
      frames.push(m);
      continue;
    }
    const out = new Float32Array(BRUSH_PX * BRUSH_PX);
    for (let y = 0; y < BRUSH_PX; y++) {
      const ty = y + sy;
      if (ty < 0 || ty >= BRUSH_PX) continue;
      for (let x = 0; x < BRUSH_PX; x++) {
        const tx = x + sx;
        if (tx < 0 || tx >= BRUSH_PX) continue;
        out[ty * BRUSH_PX + tx] = m[y * BRUSH_PX + x];
      }
    }
    frames.push(out);
  }
  if (!frames.length) throw new Error(`${name}: every cell read as dead`);

  brushes[name] = { name, size: BRUSH_PX, frames };
  return brushes[name];
}

/**
 * `--brushes`: every loaded brush as a strip, into the proof folder.
 *
 * Worth a flag of its own, because every failure mode of the loader above is
 * invisible in the sheet and obvious here. A brush that came back as a row of
 * white squares means the window did not apply; one that wanders means the
 * recentre did not; one with four blank cells means BRUSH_KEEP is too low for
 * that flipbook. All three were real during this pass.
 */
function dumpBrush(brush) {
  const B = brush.size;
  const n = brush.frames.length;
  const out = Buffer.alloc(B * n * B * 3);
  for (let f = 0; f < n; f++) {
    const m = brush.frames[f];
    for (let y = 0; y < B; y++) {
      for (let x = 0; x < B; x++) {
        const v = Math.round(255 * clamp01(m[y * B + x]));
        const j = (y * B * n + f * B + x) * 3;
        out[j] = v;
        out[j + 1] = v;
        out[j + 2] = v;
      }
    }
  }
  mkdirSync(PROOF_DIR, { recursive: true });
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-s",
      `${B * n}x${B}`,
      "-i",
      "pipe:0",
      "-frames:v",
      "1",
      join(PROOF_DIR, `brush-${brush.name}.png`),
    ],
    { input: out, maxBuffer: 1 << 29 },
  );
}

/* ----------------------------------------------------------------- drawing */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * One additive blob of light: the element's colour, with a white-hot core.
 *
 * The core is what makes this read as light rather than as a coloured dot, and
 * it is the same shape every glow in this build has — `colour * a + white * hot`
 * in tools/pack-card-auras.mjs, `ramp` in tools/pack-invokers-fx.mjs. The
 * fourth power is the hot part: it is nothing until the last fifth of the
 * radius, so a dim blob stays the element's colour and a bright one has a white
 * middle without the colour washing out around it.
 */
function splat(buf, px, py, r, amp, cr, cg, cb) {
  if (amp <= 0.0015 || r <= 0.4) return;
  const x0 = Math.max(0, Math.floor(px - r));
  const x1 = Math.min(W - 1, Math.ceil(px + r));
  const y0 = Math.max(0, Math.floor(py - r));
  const y1 = Math.min(H - 1, Math.ceil(py + r));
  const rr = r * r;
  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - py;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - px;
      const q = (dx * dx + dy * dy) / rr;
      if (q >= 1) continue;
      const fall = (1 - q) * (1 - q);
      const hot = fall * fall * fall * fall;
      const j = (y * W + x) * 3;
      buf[j] += amp * (fall * cr + hot);
      buf[j + 1] += amp * (fall * cg + hot);
      buf[j + 2] += amp * (fall * cb + hot);
    }
  }
}

/**
 * One frame of a brush, laid down additively at a size, a rotation and an
 * aspect. The textured answer to `splat`, and what every particle now uses.
 *
 * `ra` is the half-width along the brush's own facing and `rb` across it, which
 * is how a streak is made: wind stamps a wisp at four times the length it has
 * width, aligned to the way it is travelling, and the shape stretches instead
 * of a round blob being smeared by a longer trail. `rot` is where the brush's
 * up-axis points, in world radians.
 *
 * The colour ramp is `splat`'s and deliberately so — colour by the mask, white
 * by a high power of it — except that the power is applied to a mask that is
 * frequently 1.0 across a solid shape, so the burn is capped. See BRUSH_BURN.
 */
function stamp(buf, brush, fi, px, py, ra, rb, rot, amp, cr, cg, cb) {
  if (amp <= 0.0015 || ra <= 0.5 || rb <= 0.5) return;
  const n = brush.frames.length;
  const m = brush.frames[((fi % n) + n) % n];
  const B = brush.size;
  const ext = Math.max(ra, rb) * 1.4143;
  const x0 = Math.max(0, Math.floor(px - ext));
  const x1 = Math.min(W - 1, Math.ceil(px + ext));
  const y0 = Math.max(0, Math.floor(py - ext));
  const y1 = Math.min(H - 1, Math.ceil(py + ext));
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const last = B - 1;

  for (let y = y0; y <= y1; y++) {
    const dy = y + 0.5 - py;
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - px;
      // World offset into the brush's own frame: `along` runs up the shape,
      // `across` runs over it. The brush's up is -y in its image, hence the
      // negation on the row.
      const a = (dx * c + dy * s) / ra;
      const b = (-dx * s + dy * c) / rb;
      if (a <= -1 || a >= 1 || b <= -1 || b >= 1) continue;
      const fx = (b * 0.5 + 0.5) * last;
      const fy = (0.5 - a * 0.5) * last;
      const ix = fx | 0;
      const iy = fy | 0;
      const tx = fx - ix;
      const ty = fy - iy;
      const jx = ix < last ? ix + 1 : ix;
      const jy = iy < last ? iy + 1 : iy;
      const r0 = iy * B;
      const r1 = jy * B;
      const fall =
        m[r0 + ix] * (1 - tx) * (1 - ty) +
        m[r0 + jx] * tx * (1 - ty) +
        m[r1 + ix] * (1 - tx) * ty +
        m[r1 + jx] * tx * ty;
      if (fall <= 0.004) continue;
      const f2 = fall * fall;
      const hot = f2 * f2 * BRUSH_BURN;
      const j = (y * W + x) * 3;
      buf[j] += amp * (fall * cr + hot);
      buf[j + 1] += amp * (fall * cg + hot);
      buf[j + 2] += amp * (fall * cb + hot);
    }
  }
}

/**
 * A stamped particle drawn as where it is and where it has just been.
 *
 * `trail`'s job for textured brushes, and the step count wants to be *lower*
 * than the radial version's: a brush already carries a shape, so four copies of
 * a flame lick behind a flame lick is a smear where four copies of a dot behind
 * a dot was motion. Two or three is the range; the recipes say which.
 */
function streak(
  buf,
  brush,
  fi,
  px,
  py,
  vx,
  vy,
  ra,
  rb,
  rot,
  amp,
  cr,
  cg,
  cb,
  steps,
) {
  for (let k = 0; k < steps; k++) {
    const t = steps === 1 ? 0 : k / steps;
    const w = (1 - t) * (1 - t);
    const k2 = 1 - 0.42 * t;
    stamp(
      buf,
      brush,
      fi,
      px - vx * t,
      py - vy * t,
      ra * k2,
      rb * k2,
      rot,
      amp * w,
      cr,
      cg,
      cb,
    );
  }
}

/** A line of light between two points, as a chain of splats. */
function bolt(buf, x0, y0, x1, y1, r, amp, cr, cg, cb, seed) {
  const n = 9;
  const jitter = Math.hypot(x1 - x0, y1 - y0) * 0.13;
  let px = x0;
  let py = y0;
  for (let k = 1; k <= n; k++) {
    const t = k / n;
    const bend = Math.sin(Math.PI * t) * jitter;
    const qx = x0 + (x1 - x0) * t + (rnd(seed + k) - 0.5) * bend;
    const qy = y0 + (y1 - y0) * t + (rnd(seed + k + 40) - 0.5) * bend;
    const seg = Math.max(2, Math.hypot(qx - px, qy - py));
    const steps = Math.ceil(seg / (r * 0.7));
    for (let m = 0; m < steps; m++) {
      const s = m / steps;
      splat(buf, px + (qx - px) * s, py + (qy - py) * s, r, amp, cr, cg, cb);
    }
    px = qx;
    py = qy;
  }
}

/* --------------------------------------------------------------- the frame */

/**
 * The inlay's colour: antique gold, the build's own metal.
 *
 * Warm and *not* saturated — a real gold highlight is a white with the blue
 * pulled out of it, not a yellow. At 1, 0.84, 0.52 the line reads as lit metal
 * under every one of the six element colours, including yellow lightning, which
 * a more saturated gold turns into a single flat yellow tube.
 */
const GOLD = [1, 0.78, 0.34];

/** The standing warmth on the inlay thread. It is always on. */
const INLAY = 0.62;

/** What the sheen adds to the inlay as it passes. This is the one you see. */
const INLAY_SHEEN = 1.5;

/** The sheen striking the whole width of the line, not only the thread. */
const SPEC = 0.9;

/** How much element colour the thread takes out of the line it sits in. */
const INLAY_MIX = 0.62;

/** The corner bead, as a radius in the tool's own card units. */
const BEAD = 5.2;

/**
 * How much of the sheen reaches the outward band, against the line.
 *
 * A quarter, and the first cut had it at one. A highlight is *on a surface*;
 * put the same amplitude into a glow that is then bloomed by `finish` and it
 * arrives as a white bulge hanging off one edge of the card — which read as a
 * rendering fault, not as light, and swamped every particle near it. The band
 * gets enough to say the glint is throwing light, and no more.
 */
const SHEEN_BAND = 0.25;

/**
 * The rim: the card's solid line, plus however much of the outward band the
 * recipe's wave is lighting at each point of the perimeter.
 *
 * The line is on at full whatever else happens — it is the card, not the
 * effect, and in the build it is a solid element colour. `wave` is the effect's
 * own contribution and is the only part that moves.
 */
function rim(buf, cr, cg, cb, lineAmp, glowAmp, wave, sheen, deep) {
  const [dr, dg, db] = deep;
  for (const i of touched) {
    const u = uOf[i];
    const m = wave ? wave(u) : 1;
    const sh = sheen ? sheen(u) : 0;
    const l = lineMask[i] * lineAmp;
    const g =
      bandMask[i] *
      glowAmp *
      (m * (1 + CORNER_LIFT * cornerOf[i]) + sh * SHEEN_BAND);
    /*
     * The gold, and where it comes from.
     *
     * Two terms, both on the inlay thread and neither on the glow: a standing
     * warmth so the line always reads as metal with light in it, and a
     * highlight that runs with the sheen. The second is the one doing the work
     * — a fixed gold line is a yellow line, and what makes a surface look like
     * a surface is a highlight that *moves over* it while the surface stays
     * put. Corners get the standing term at half again, which is where an
     * ornament's gold actually pools.
     */
    const warm =
      inlayMask[i] *
      lineAmp *
      (INLAY * (1 + 0.5 * cornerOf[i]) + INLAY_SHEEN * sh);
    /* The specular: the sheen striking the line itself, not the band. */
    const spec = l * sh * SPEC;
    const gold = warm + spec;
    if (l + g + gold <= 0.002) continue;
    /*
     * White only where the *glow* is genuinely intense, and never much on the
     * line.
     *
     * Two renders were lost to writing this as a power of the total. The line
     * is at full by definition, so any power of it comes out at full too, and
     * the border arrived as a white neon tube with a coloured halo — fire and
     * arcane telling apart only by the haze around them. Splitting the two
     * terms is the whole fix: the line keeps a fifth of a white lift, which
     * reads as lit, and the burn-out is a cube of the glow alone.
     */
    const hot = l * 0.1 + Math.pow(g, 3) * 0.5;
    /*
     * The thread *displaces* the element colour instead of being added over it,
     * and that one word is the difference between an inlay and a yellow smear.
     *
     * Additive light has no way to be darker than what is under it, so gold
     * laid over a line already running at full green arrives as a paler green:
     * every channel went up and the hue barely moved. Taking the element back
     * out of the middle of the line first is what an inlay physically is — the
     * metal is set *into* the run, not painted on it — and it is the only way a
     * warm thread reads at all inside a glow this saturated.
     */
    const keep = 1 - inlayMask[i] * INLAY_MIX;
    /*
     * The glow cools as it leaves the line, and the line does not.
     *
     * One hue across a whole falloff is the signature of a bake: real light off
     * a hot thing is near-white where it is dense and takes its deepest,
     * most saturated version of the colour where it is thin, because that is
     * where the colour has the most material to travel through. Every element
     * carries a `deep` for that end — see ELEMENTS — and the mix is the band's
     * own depth, so nothing has to know where the pixel is.
     *
     * The exponent is where the two tones meet, and it has to be read against
     * the *falloff* rather than against the geometry. Below 1 the deep tone only
     * owns the part of the band that has already faded to nothing, so it tints
     * black and nothing changes on screen — which is what 0.55 did. Above 1 it
     * claims the part that is actually lit, and 1.7 puts the crossover about
     * where the glow is at half strength: hot at the line, deep through the
     * body of the haze, and no boundary anywhere.
     */
    const t = Math.pow(bandMask[i], 1.7);
    const j = i * 3;
    buf[j] += (l * cr + g * (dr + (cr - dr) * t)) * keep + hot + gold * GOLD[0];
    buf[j + 1] +=
      (l * cg + g * (dg + (cg - dg) * t)) * keep + hot + gold * GOLD[1];
    buf[j + 2] +=
      (l * cb + g * (db + (cb - db) * t)) * keep + hot + gold * GOLD[2];
  }
}

/**
 * The four corner beads: a gem set into the frame at every turn.
 *
 * This is the one piece of the border that is *jewellery* rather than effect,
 * and it is here because a lifted corner on its own does not read. The band is
 * bloomed by `finish` and a corner that is only 60% brighter than the run
 * arrives as a slightly fatter patch of the same haze — which was the state of
 * this after the first attempt at corners, and it looked like nothing at all.
 *
 * What reads is a *hard* thing at a soft thing's corner: a small gold bead with
 * a white middle sitting exactly on the line, with the element's own colour
 * washing out of it. Two splats each, four corners, and it is the detail that
 * makes the six look set into the card rather than drawn round it.
 *
 * The bead brightens as the sheen crosses it, which is what a real gem does and
 * is also what stops four fixed dots reading as a static overlay.
 */
function corners(buf, cr, cg, cb, amp, sheen) {
  if (amp <= 0.01) return;
  const r = BEAD * SS;
  const rr = r * r;
  for (const u of CORNER_U) {
    const [px, py] = pointAt(u);
    const sh = sheen ? sheen(u) : 0;
    const a = amp * (1 + 1.1 * sh);
    /* The wash first, so the bead goes on top of its own halo. */
    splat(buf, px, py, 11 * SS, a * 0.3, cr, cg, cb);
    /*
     * The bead itself, written here rather than through `splat`, and the
     * difference is the whole point: `splat` puts a *white* core in everything
     * it draws, and a white core at this amplitude tonemaps to white full stop
     * — which is what the first cut of these was, four white dots where four
     * gems were wanted. The core here is a fifth of that and it is gold too, so
     * what saturates is a warm metal rather than a blown highlight.
     */
    const x0 = Math.max(0, Math.floor(px - r));
    const x1 = Math.min(W - 1, Math.ceil(px + r));
    const y0 = Math.max(0, Math.floor(py - r));
    const y1 = Math.min(H - 1, Math.ceil(py + r));
    for (let y = y0; y <= y1; y++) {
      const dy = y + 0.5 - py;
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - px;
        const q = (dx * dx + dy * dy) / rr;
        if (q >= 1) continue;
        const fall = (1 - q) * (1 - q);
        const k = a * (fall + fall * fall * fall * fall * 0.35);
        const j = (y * W + x) * 3;
        buf[j] += k * GOLD[0];
        buf[j + 1] += k * GOLD[1];
        buf[j + 2] += k * GOLD[2];
      }
    }
  }
}

/**
 * Down to the cell, then bloom, then tonemap.
 *
 * The bloom is done after the downsample rather than before it: a blur is the
 * one operation whose result does not change when it is run at a third of the
 * resolution, and at a third it costs a ninth. Tonemapped with `1 - exp(-x)`
 * rather than clipped, so the places where four sparks and the rim all land on
 * one pixel roll off into white instead of flattening into a hard-edged patch.
 */
function finish(buf) {
  const w = CELL_W;
  const h = CELL_H;
  const lin = new Float32Array(w * h * 3);
  const inv = 1 / (SS * SS);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let sy = 0; sy < SS; sy++) {
        const row = (y * SS + sy) * W;
        for (let sx = 0; sx < SS; sx++) {
          const j = (row + x * SS + sx) * 3;
          r += buf[j];
          g += buf[j + 1];
          b += buf[j + 2];
        }
      }
      const o = (y * w + x) * 3;
      lin[o] = r * inv;
      lin[o + 1] = g * inv;
      lin[o + 2] = b * inv;
    }
  }

  /* Two box passes for the halo, on the bright part only. */
  const R = 7;
  const tmp = new Float32Array(w * h * 3);
  const blur = new Float32Array(w * h * 3);
  const src = new Float32Array(w * h * 3);
  for (let i = 0; i < src.length; i++) {
    src[i] = Math.max(0, lin[i] - 0.22);
  }
  for (let y = 0; y < h; y++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let x = -R; x <= R; x++)
        sum += src[(y * w + Math.max(0, Math.min(w - 1, x))) * 3 + c];
      for (let x = 0; x < w; x++) {
        tmp[(y * w + x) * 3 + c] = sum / (2 * R + 1);
        const add = Math.min(w - 1, x + R + 1);
        const drop = Math.max(0, x - R);
        sum += src[(y * w + add) * 3 + c] - src[(y * w + drop) * 3 + c];
      }
    }
  }
  for (let x = 0; x < w; x++) {
    for (let c = 0; c < 3; c++) {
      let sum = 0;
      for (let y = -R; y <= R; y++)
        sum += tmp[(Math.max(0, Math.min(h - 1, y)) * w + x) * 3 + c];
      for (let y = 0; y < h; y++) {
        blur[(y * w + x) * 3 + c] = sum / (2 * R + 1);
        const add = Math.min(h - 1, y + R + 1);
        const drop = Math.max(0, y - R);
        sum += tmp[(add * w + x) * 3 + c] - tmp[(drop * w + x) * 3 + c];
      }
    }
  }

  const out = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h * 3; i++) {
    const v = lin[i] + blur[i] * 0.85;
    out[i] = Math.round(255 * clamp01(1 - Math.exp(-v * 1.15)));
  }
  return out;
}

/* --------------------------------------------------------------- the loops */

/**
 * A travelling pulse train: `n` crests round the border, the pattern shifting
 * by `speed` wavelengths over one cycle — so the crests move `speed / n` of a
 * lap in that time.
 *
 * **`speed` must be a whole number**, and this is the one constraint in the
 * file that cannot be relaxed by eye. The whole reason these sheets get a shape
 * of their own is that they are cyclic and can be played straight through
 * rather than ping-ponged, and the phase here advances by `speed` over the
 * cycle: at anything fractional frame twelve does not meet frame one, and what
 * the player sees is the border jolting once every 1.7 seconds.
 *
 * The first cut had 0.4, 0.85, 0.3, 1.6, -0.5 and 1.9 — every one of them
 * chosen for how the motion looked, every one of them a seam. It did not show
 * on a contact sheet, because a contact sheet has no wrap in it; it showed as
 * the wrap being three times a typical frame-to-frame step when that was
 * finally measured. Hence the throw: a number that looks right and closes
 * nothing is worth failing the run over.
 */
const pulses = (n, speed, sharp, floor) => {
  if (!Number.isInteger(speed)) {
    throw new Error(
      `pulses: speed ${speed} is not whole — the loop would seam`,
    );
  }
  return (u) => (f) =>
    floor +
    (1 - floor) *
      Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * (u * n - f * speed)), sharp);
};

/**
 * The sheen: one narrow highlight running the perimeter `laps` times a cycle.
 *
 * The same constraint `pulses` has and for the same reason — a fractional lap
 * count does not close, and a highlight that jumps a third of the way round
 * between the last frame and the first is the most visible seam in the file,
 * because the eye is already tracking it.
 *
 * `width` is how much of a lap the highlight covers, and it wants to be small:
 * a quarter of a lap is a wave, a twentieth is a glint. The power that gets it
 * there is derived rather than typed, so the two knobs stay independent — set
 * a width and the falloff follows it.
 */
const sheenOf = (laps, width, peak) => {
  if (!Number.isInteger(laps)) {
    throw new Error(`sheenOf: laps ${laps} is not whole — the loop would seam`);
  }
  // cos^k has half-maximum at 2*acos(2^(-1/k))/tau of a period; invert it.
  const k = Math.max(
    1,
    Math.round(Math.log(0.5) / Math.log(Math.cos(Math.PI * width * 0.5) ** 2)),
  );
  const at = (f) => (u) =>
    peak *
    Math.pow(0.5 + 0.5 * Math.cos(2 * Math.PI * (u * laps - f * laps)), k);
  // Hung on the function so `comet` can put its heads exactly where the glints
  // are, without the recipes stating the lap count twice and one of the two
  // going stale. The glint and the comet are meant to be the same object.
  at.laps = laps;
  return at;
};

/**
 * The breath: the whole border swelling and settling once a cycle.
 *
 * A tenth either side, which is under the threshold at which it reads as a
 * pulse and over the one at which it reads as nothing. What it buys is that a
 * charged card is never *static* even at the instant its wave crest is between
 * two corners, which is the frame a screenshot lands on.
 */
const breatheAt = (depth, f) => 1 + depth * Math.cos(2 * Math.PI * (f / COUNT));

/**
 * What each element *does*, which is the only thing separating the six.
 *
 * They share a palette-shaped role in the game and nothing else here: no two of
 * them move the same way, because that is the difference the rejected sets
 * never had. Six tints of one motion is one effect shown six times.
 *
 *   fire       embers leave the rim and rise, guttering as they go
 *   water      beads slide *along* the rim and shed droplets outward
 *   nature     shoots push out of the rim on a slow spiral, and it breathes
 *   lightning  arcs snap between points of the rim, one or two frames each
 *   arcane     glyphs orbit at a fixed rate while shards fall inward
 *   wind       long streaks sweep round fast, tangential and thin
 *
 * ## The fields the second pass added
 *
 * `brush` is which of the build's flipbooks the element's particles are stamped
 * with, and it was picked by playing all seventeen out as a contact sheet and
 * looking, never by the name — half of them are filed under an element they do
 * not read as. `T_FX_Glow_Flash_17_1_4x2` is a rack of upward blades filed under
 * "glow flash", and it is the best plant in the library.
 *
 * `orient` is where the brush's own up-axis points, and it is the field that
 * turns a texture back into a behaviour:
 *
 *   up    fixed up the screen. Fire, because flame stands up whatever edge of
 *         the card it left and a lick rotated to its own velocity reads as
 *         debris being thrown.
 *   out   along the border's outward normal. Nature, so a shoot grows *out of*
 *         the frame rather than drifting past it.
 *   vel   along the way the particle is travelling. Water and wind, which is
 *         what lets `stretch` make a streak instead of a smear.
 *   spin  a fixed angle per particle plus `spin` whole turns over the cycle.
 *         Lightning at 0 turns, because a star has no up; arcane at 1, because
 *         a glyph that turns exactly once closes the loop and reads as orbit.
 *
 * `stretch` is how much longer than wide the stamp is drawn, along that axis.
 * `sheen` and `breathe` are the two new rim terms — see `sheenOf` and
 * `breatheAt`. Sizes went up by about a factor of two against the radial set
 * and counts came down to match: a drawing needs to be big enough to be read as
 * a drawing, and forty of them at that size is soup.
 */
const RECIPES = {
  fire: {
    lineAmp: 1.0,
    glowAmp: 0.75,
    wave: pulses(3, 1, 3.6, 0.3),
    sheen: sheenOf(1, 0.05, 0.85),
    comet: {
      tail: 14,
      len: 0.13,
      out: 0.5,
      up: 0.35,
      size: 9,
      amp: 1.1,
      head: 1.0,
    },
    breathe: 0.1,
    glint: { count: 30, size: 1.9, amp: 1.5, out: 0.55, sharp: 2.2, star: 1.0 },
    brush: "T_FX_Fire_22_1_4x4",
    orient: "up",
    stretch: 1.35,
    count: 44,
    size: [16, 5.5],
    out: 0.55,
    along: 0.05,
    up: 0.45,
    steps: 2,
    amp: 1.45,
    flicker: 0.5,
  },
  water: {
    lineAmp: 1.0,
    glowAmp: 0.7,
    wave: pulses(2, 1, 4.2, 0.27),
    sheen: sheenOf(1, 0.055, 1.0),
    comet: {
      tail: 16,
      len: 0.16,
      out: 0.3,
      up: 0,
      size: 8,
      amp: 1.0,
      head: 1.05,
    },
    breathe: 0.09,
    glint: {
      count: 34,
      size: 1.9,
      amp: 2.1,
      out: 0.35,
      sharp: 2.6,
      star: 1.15,
    },
    brush: "T_FX_Fire_17_1_3x3",
    orient: "vel",
    stretch: 1.15,
    count: 34,
    size: [14, 6],
    out: 0.22,
    along: 0.6,
    up: 0,
    steps: 3,
    amp: 1.3,
    flicker: 0.12,
  },
  nature: {
    lineAmp: 0.95,
    glowAmp: 0.62,
    wave: pulses(1, 1, 1.6, 0.4),
    sheen: sheenOf(1, 0.07, 0.75),
    comet: {
      tail: 12,
      len: 0.1,
      out: 0.55,
      up: 0.1,
      size: 8.5,
      amp: 0.95,
      head: 0.9,
    },
    breathe: 0.13,
    glint: {
      count: 26,
      size: 1.7,
      amp: 1.35,
      out: 0.5,
      sharp: 2.4,
      star: 0.95,
    },
    brush: "T_FX_Glow_Flash_17_1_4x2",
    orient: "out",
    stretch: 1.6,
    count: 30,
    size: [15, 4.5],
    out: 0.66,
    along: 0.24,
    up: 0.12,
    steps: 2,
    amp: 1.2,
    flicker: 0.28,
  },
  lightning: {
    lineAmp: 1.0,
    glowAmp: 0.5,
    wave: pulses(5, 2, 4, 0.18),
    sheen: sheenOf(2, 0.035, 1.2),
    comet: {
      tail: 10,
      len: 0.07,
      out: 0.42,
      up: 0,
      size: 7,
      amp: 1.15,
      head: 1.25,
    },
    breathe: 0.06,
    glint: {
      count: 38,
      size: 1.8,
      amp: 1.85,
      out: 0.45,
      sharp: 3.2,
      star: 1.1,
    },
    brush: "T_FX_Glow_Flash_11_2_4x4",
    orient: "spin",
    spin: 0,
    stretch: 1,
    count: 24,
    size: [12, 3.5],
    out: 0.5,
    along: 0.1,
    up: 0,
    steps: 1,
    amp: 1.35,
    flicker: 0.75,
    arcs: 5,
  },
  arcane: {
    lineAmp: 1.0,
    glowAmp: 0.66,
    wave: pulses(4, -1, 2.5, 0.3),
    sheen: sheenOf(-1, 0.055, 0.9),
    comet: {
      tail: 14,
      len: 0.14,
      out: 0.34,
      up: 0,
      size: 8.5,
      amp: 0.95,
      head: 1.0,
    },
    breathe: 0.11,
    glint: { count: 30, size: 1.9, amp: 1.5, out: 0.4, sharp: 2.4, star: 1.0 },
    brush: "T_FX_Smoke_18_1_3x3",
    orient: "spin",
    spin: 1,
    stretch: 1,
    count: 26,
    size: [14, 7],
    out: 0.36,
    along: 0.95,
    up: 0,
    steps: 2,
    amp: 1.15,
    flicker: 0.08,
    inward: 14,
  },
  wind: {
    lineAmp: 0.95,
    glowAmp: 0.5,
    wave: pulses(3, 2, 3.4, 0.28),
    sheen: sheenOf(2, 0.055, 0.85),
    comet: {
      tail: 18,
      len: 0.2,
      out: 0.26,
      up: 0,
      size: 7,
      amp: 0.85,
      head: 0.95,
    },
    breathe: 0.08,
    glint: { count: 28, size: 1.6, amp: 1.35, out: 0.3, sharp: 2.6, star: 0.9 },
    brush: "T_FX_Fire_3_1_4x3",
    orient: "vel",
    stretch: 2.6,
    count: 32,
    size: [12, 4],
    out: 0.28,
    along: 1.6,
    up: 0,
    steps: 3,
    amp: 0.88,
    flicker: 0.1,
  },
};

/**
 * Where a particle's brush points, in world radians.
 *
 * The four cases are `RECIPES`'s `orient` field and the note there says which
 * element takes which and why. Every one of them is periodic in `life`, which
 * is the only property this has to have: a rotation that drifted would not
 * close the loop, and the seam would be a border full of particles snapping
 * back to an angle they had a fifth of a second ago.
 */
function facing(R, k, life, nx, ny, vx, vy) {
  if (R.orient === "up") return -Math.PI / 2;
  if (R.orient === "out") return Math.atan2(ny, nx);
  if (R.orient === "vel") return Math.atan2(vy, vx);
  return rnd(k * 11 + 3) * Math.PI * 2 + (R.spin || 0) * life * Math.PI * 2;
}

/**
 * The glitter: small hard points twinkling on and just off the line, and a
 * four-point star on the brightest of them.
 *
 * Everything else in this file is one size class — a particle is roughly a
 * third of the margin across, because that is what it takes for a *drawing* to
 * be read as a drawing. That gives an effect made entirely of medium things,
 * and an effect made entirely of medium things reads as busy rather than as
 * rich however good the medium things are. This is the small class: two pixels,
 * no texture, on for a fifth of its life and off for the rest.
 *
 * It is deliberately not stamped. A texture at two pixels is a two-pixel blur —
 * there is nothing in a flipbook cell that survives being drawn that small, and
 * what is wanted here is not material but *specular*: the hard, sourceless
 * points that come off anything wet, faceted or on fire, and that a bloom turns
 * into stars. `splat`'s white core, which the corner beads had to be written
 * around, is exactly right for it.
 *
 * The star is four short spikes and it is the whole reason this layer earns its
 * place at the size the effect is played. A charged card is about 85 CSS px
 * wide; a two-pixel mote on it is under a pixel and would be nothing. A mote
 * with spikes is a cross four or five pixels across, and a cross is a shape the
 * eye picks out of a haze at any scale — the same reason a lens flare is drawn
 * rather than simulated in every game that has one.
 *
 * `scale` is what the burst turns it down by as its own arc runs out. The loop
 * passes nothing and gets 1.
 */
function glints(buf, R, cr, cg, cb, phase, breath, scale) {
  const G = R.glint;
  if (!G) return;
  const k0 = scale === undefined ? 1 : scale;
  if (k0 <= 0.02) return;
  const step = Math.floor(phase * COUNT);
  for (let k = 0; k < G.count; k++) {
    const u = rnd(k * 17 + 5);
    const life = (phase + rnd(k * 17 + 6)) % 1;
    const [px, py, nx, ny] = pointAt(u);
    const d = REACH * G.out * life;
    const x = px + nx * d;
    const y = py + ny * d;
    /*
     * On for a short part of its life and off for the rest, and the part it is
     * on for is different for every mote because the phase offset above is.
     * The power is what makes it a twinkle rather than a fade: at 1 the whole
     * layer breathes together and reads as the glow getting brighter, at 3 each
     * point is a separate event.
     */
    const tw = Math.pow(Math.sin(Math.PI * life), G.sharp);
    // Re-hashed every frame, so a mote is never at exactly the same brightness
    // twice running. Quantised on the frame index, so it closes with the loop.
    const fl = 0.3 + 0.7 * rnd(k * 23 + step * 7);
    const amp = G.amp * tw * fl * breath * k0;
    if (amp < 0.02) continue;
    const r = G.size * (1 - 0.3 * life) * SS;
    splat(buf, x, y, r, amp, cr, cg, cb);
    if (amp <= G.star) continue;
    const len = r * 3.8;
    const rr = r * 0.42;
    const a = (amp - G.star) * 0.9;
    for (let m = 1; m <= 4; m++) {
      const t = m / 4;
      const w = a * (1 - t) * (1 - t);
      splat(buf, x + len * t, y, rr, w, cr, cg, cb);
      splat(buf, x - len * t, y, rr, w, cr, cg, cb);
      splat(buf, x, y + len * t, rr, w, cr, cg, cb);
      splat(buf, x, y - len * t, rr, w, cr, cg, cb);
    }
  }
}

/**
 * The comet: a hot head running the border with the element streaming off it.
 *
 * This is the layer that made the effect read at the size it is actually
 * played. A charged card is about 85 CSS px wide on a phone, so the whole
 * margin the border flies into is under thirty pixels and one ember is nine —
 * which is plenty *in a proof sheet at 1:1* and close to nothing in a row of
 * six tiles at the bottom of a fight. Thirty small things scattered evenly
 * around a rectangle average out to a haze at that scale. One big bright thing
 * that visibly *travels* does not, at any scale, because motion survives
 * downsampling in a way that detail does not.
 *
 * It is deliberately the same object as the sheen. The glint on the line and
 * the head of the comet sit at the same `u` and share a lap count — read off
 * `sheen.laps` rather than restated — so what the border reads as is one light
 * running round the frame, catching on the metal as it goes and throwing the
 * element off behind it. Two separate travelling highlights at two rates would
 * be the same amount of drawing and half the legibility.
 *
 * ## Why the tail is a comb and not a simulation
 *
 * Every particle here sits at a *fixed* lag behind the head and a fixed
 * distance out, so the whole tail is one rigid shape rotating round the
 * perimeter. That is not a shortcut around a particle system, it is the only
 * shape that closes: the head advances `laps` whole turns over the cycle, so a
 * comb rigidly attached to it is in exactly its starting position at frame
 * COUNT. A tail whose particles had lives of their own would need those lives
 * to be periodic too, and the comb is what that reduces to.
 *
 * The jitter is what keeps it from looking rigid. It is hashed off the
 * particle index — fixed for the life of the sheet, different for every
 * particle — so the tail is a ragged plume that happens to be rigid rather than
 * a row of dots on an arc.
 */
function comet(buf, R, f, cr, cg, cb, breath) {
  if (!R.comet) return;
  const C = R.comet;
  const laps = R.sheen.laps;
  const n = Math.abs(laps);
  const cycle = f / COUNT;
  const brush = R.art;
  const nb = brush.frames.length;
  const [dr, dg, db] = R.deep;

  for (let j = 0; j < n; j++) {
    /* One head per glint. `laps` may be negative — arcane runs backwards — and
       the head has to run the way its own glint does, so the sign rides along
       instead of being taken off with Math.abs. */
    const head = cycle * laps + j / n;

    for (let i = 0; i < C.tail; i++) {
      const t = (i + 1) / C.tail;
      /* Lag grows as a square, so the tail bunches up behind the head and
         thins out at the far end — which is what a trail looks like and what
         an even spacing conspicuously does not. */
      const lag = C.len * t * t * Math.sign(laps);
      const u = head - lag;
      const [px, py, nx, ny, tx, ty] = pointAt(u);
      const side = (rnd(i * 7 + j * 31 + 3) - 0.5) * 2;
      const out = REACH * C.out * t * (0.55 + 0.45 * rnd(i * 5 + 11));
      const x = px + nx * out + tx * out * side * 0.35;
      const y = py + ny * out + ty * out * side * 0.35 - out * C.up;
      /* Pointed the way the head went, so the plume lies along the border
         instead of standing off it — except where the recipe says otherwise,
         which is fire, whose embers stand up wherever they are. */
      const rot =
        R.orient === "up" ? -Math.PI / 2 : Math.atan2(-ty * laps, -tx * laps);
      const r = C.size * (1 - 0.6 * t) * SS;
      const amp = C.amp * Math.pow(1 - t, 1.35) * breath;
      /* The plume cools down its length for the same reason a particle cools
         over its life: the head is the hot end and the far end of a trail is
         where the colour is deepest. */
      const cool = 1 - 0.7 * t;
      stamp(
        buf,
        brush,
        Math.floor(t * nb) + i * 3 + j * 5,
        x,
        y,
        r * R.stretch,
        r,
        rot,
        amp,
        dr + (cr - dr) * cool,
        dg + (cg - dg) * cool,
        db + (cb - db) * cool,
      );
    }

    /*
     * The head last and on top: a hot core in the element's colour with a wash
     * under it, sitting a little outside the line so it reads as light coming
     * off the border rather than a bead sitting in it — the corners already own
     * that shape. `splat` rather than `stamp` on purpose: the head is the one
     * thing here that should have no texture at all, because a texture at this
     * brightness tonemaps to a white blob with a ragged edge, and what sells a
     * comet is a clean hot point with the ragged part behind it.
     */
    const [hx, hy, hnx, hny] = pointAt(head);
    const d = REACH * 0.1;
    const px = hx + hnx * d;
    const py = hy + hny * d;
    splat(buf, px, py, C.size * 1.9 * SS, C.head * 0.3 * breath, cr, cg, cb);
    splat(buf, px, py, C.size * 0.45 * SS, C.head * 1.6 * breath, cr, cg, cb);
  }
}

/**
 * Every particle of a loop, at frame `f` of `COUNT`.
 *
 * A particle is a fixed slot on the rim plus a phase, so its life runs 0..1
 * once per cycle and the set of them is identical at the last frame and the
 * first — which is the whole reason these sheets can be played straight
 * through. Where it goes is the recipe's three velocities: out along the
 * border's own normal, along the border's tangent, and up the screen. Fire uses
 * the third because flame rises whatever edge it is on; water uses the second
 * because a bead runs along a rim; wind uses it hard.
 *
 * What it *is* is a frame of the recipe's brush, and that frame advances with
 * the particle's own life — so an ember is not one drawing being translated
 * across the band, it is a flipbook playing while it travels. `life` runs the
 * whole flipbook exactly once per lap, which keeps that periodic too.
 */
function emit(buf, R, f, cr, cg, cb, breath) {
  const cycle = f / COUNT;
  const brush = R.art;
  const nb = brush.frames.length;
  const br = breath === undefined ? 1 : breath;
  const [dr, dg, db] = R.deep;
  for (let k = 0; k < R.count; k++) {
    const u = rnd(k * 3 + 1);
    const life = (cycle + rnd(k * 3 + 2)) % 1;
    const [px, py, nx, ny, tx, ty] = pointAt(u + R.along * 0.06 * life);
    const ease = 1 - Math.pow(1 - life, 2);
    const dist = ease * REACH;
    const x = px + nx * dist * R.out + tx * dist * R.along;
    const y = py + ny * dist * R.out + ty * dist * R.along - dist * R.up;
    // The step this particle takes in one frame, which is what a trail has to
    // be as long as. A tenth of the reach was the first guess and drew a
    // two-pixel smudge; 2.2 of the reach over COUNT is the distance `ease`
    // actually covers per frame around the middle of a life.
    const step = (REACH * 2.2) / COUNT;
    const vx = nx * step * R.out + tx * step * R.along;
    const vy = ny * step * R.out + ty * step * R.along - step * R.up;
    const fl = 1 - R.flicker * rnd(k * 7 + Math.floor(cycle * COUNT) * 13);
    const rb = (R.size[0] + (R.size[1] - R.size[0]) * life) * SS;
    const amp = R.amp * Math.pow(1 - life, 1.5) * fl * br;
    // `k * 5` so two particles born at the same instant are not the same
    // drawing: the phase through the flipbook is shared, the entry point is not.
    const fi = Math.floor(life * nb) + k * 5;
    const rot = facing(R, k, life, nx, ny, vx, vy);
    // A particle cools as it goes, the way the glow cools as it leaves the line
    // — see the note in `rim`. An ember that is the same colour at the top of
    // its arc as it was on the rim is a decal being moved, not something
    // burning; four fifths of the way to `deep` by the end of a life is what
    // reads as one.
    const cool = 1 - 0.8 * life;
    streak(
      buf,
      brush,
      fi,
      x,
      y,
      vx,
      vy,
      rb * R.stretch,
      rb,
      rot,
      amp,
      dr + (cr - dr) * cool,
      dg + (cg - dg) * cool,
      db + (cb - db) * cool,
      R.steps,
    );
  }

  /* Lightning's own layer: short arcs across the rim, alive for one frame, and
     a stamped flash where each one earths itself. The bolt stays a chain of
     radial splats — an arc is the one thing in the file that genuinely is a
     line of light and not an object, so a texture on it would only blur it. */
  if (R.arcs) {
    for (let k = 0; k < R.arcs; k++) {
      const seed = f * 97 + k * 31;
      if (rnd(seed) > 0.72) continue;
      const u0 = rnd(seed + 1);
      const u1 = u0 + 0.02 + rnd(seed + 2) * 0.04;
      const [x0, y0, n0x, n0y] = pointAt(u0);
      const [x1, y1, n1x, n1y] = pointAt(u1);
      const lift = REACH * (0.16 + rnd(seed + 3) * 0.26);
      const ax = x0 + n0x * lift * 0.3;
      const ay = y0 + n0y * lift * 0.3;
      const bx = x1 + n1x * lift;
      const by = y1 + n1y * lift;
      bolt(buf, ax, ay, bx, by, 1.5 * SS, 0.7, cr, cg, cb, seed);
      const fr = Math.floor(rnd(seed + 5) * nb);
      stamp(buf, brush, fr, ax, ay, 7 * SS, 7 * SS, 0, 0.85 * br, cr, cg, cb);
      stamp(
        buf,
        brush,
        fr + 3,
        bx,
        by,
        5 * SS,
        5 * SS,
        0,
        0.6 * br,
        cr,
        cg,
        cb,
      );
    }
  }

  /* Arcane's own layer: shards falling in from outside, the one motion in the
     set that goes the wrong way. VOID ECLIPSE collapses inward — see
     src/source/prompts.md — so its border should too. */
  if (R.inward) {
    for (let k = 0; k < R.inward; k++) {
      const u = rnd(k * 5 + 11);
      const life = (cycle + rnd(k * 5 + 12)) % 1;
      const [px, py, nx, ny] = pointAt(u);
      const d = (1 - life) * REACH;
      const amp = 0.55 * Math.sin(Math.PI * life) * br;
      // Pointing the way it falls, which is inwards: the negated normal.
      streak(
        buf,
        brush,
        Math.floor(life * nb) + k * 7,
        px + nx * d,
        py + ny * d,
        nx * REACH * 0.14,
        ny * REACH * 0.14,
        4.6 * SS,
        3.4 * SS,
        Math.atan2(-ny, -nx),
        amp,
        cr,
        cg,
        cb,
        3,
      );
    }
  }
}

/* -------------------------------------------------------------- the bursts */

/**
 * How much of the sheet is spent winding up before the tap lands, in frames.
 *
 * Two of eighteen, which at the 0.62 s the card plays a burst over is about
 * seventy milliseconds — four frames of a 60 Hz screen. That is enough to read
 * as *anticipation* and short enough that the tap still feels instant, and it
 * is the one beat every hand-animated impact has and the first cut of this file
 * did not: the light gathers, and then it goes.
 *
 * It costs nothing downstream. `ULT.burst.lead` in art/heroes.js is 0.42 of a
 * 0.62 s burst, so the cut-in still takes the screen long after the flash.
 */
const GATHER = 2 / COUNT;

/**
 * The envelope a burst is played through: a wind-up, a short attack, then a
 * fall that lands on exactly nothing.
 *
 * `art/ultborder.js` clamps a burst on its last frame, so the last frame is what
 * the card is left wearing — and after the tap the ultimate is spent, so it has
 * to be zero. The generated set could not do this at all: Wan builds from a
 * cold seed and peaks on its final frame, which is why
 * tools/pack-ult-borders.mjs had to grow a re-timer that walks a rising clip
 * back down. Here the shape is simply stated.
 */
function env(p) {
  if (p < GATHER) return 0.28 + 0.34 * (p / GATHER);
  const q = (p - GATHER) / (1 - GATHER);
  const attack = 0.1;
  if (q < attack) return 0.62 + 0.38 * Math.pow(q / attack, 0.6);
  return Math.pow(1 - (q - attack) / (1 - attack), 1.7);
}

/**
 * The star the corners throw on the peak, shared by all six.
 *
 * `T_FX_Glow_Flash_11_2` is the build's own radial flare — a hot middle with
 * rays coming off it — and it is the one shape in the library that reads as
 * *an impact* rather than as a substance. Four of them, one per corner, over
 * the fifth of the arc around the peak. This is the single cheapest thing in
 * the file that makes a tap feel like it hit something, because the corners are
 * where the eye already is: see CORNER_U.
 */
const FLASH_BRUSH = "T_FX_Glow_Flash_11_2_4x4";

/**
 * One frame of a burst: a wind-up, a flash, a shockwave, rays, corner stars
 * and a spray of the element's own particles, over the rim.
 *
 * The layers peak at different times on purpose. The gather is gone before the
 * flash starts, the flash is gone three frames later, the ring is fastest at
 * the start and decelerates, the rays hold through the middle, and the spray
 * outlives all of it — which is the shape of every impact effect there is, and
 * none of it survives being asked of a video model in one prompt.
 */
function burstFrame(buf, R, f, cr, cg, cb) {
  const p = f / (COUNT - 1);
  const e = env(p);
  /* Progress through the wind-up, and progress after it. Every layer below the
     rim is keyed off `q`, so adding or removing gather frames re-times the
     whole burst by moving one constant. */
  const g = clamp01(p / GATHER);
  const q = clamp01((p - GATHER) / (1 - GATHER));
  const brush = R.art;
  const nb = brush.frames.length;

  /*
   * The rim through the burst: lit at the start because the card *was* charged,
   * flared by the envelope, and gone by the last frame.
   *
   * Gone matters more than it looks. `ultBurstTexture` clamps on the last
   * frame, so whatever is drawn there is what the card wears until something
   * else takes the sprite away — and by then the ultimate is spent and the
   * border has no business being lit. The first cut held the line at half and
   * left every card that had fired glowing.
   *
   * The sheen here is not a travelling glint but the whole thread at once: the
   * gold floods on the wind-up and drains over the arc, so the inlay reads as
   * the thing being discharged rather than as an ornament the effect happens
   * next to.
   */
  const fade = 1 - Math.pow(q, 1.3);
  const sheenNow = p < GATHER ? 0.25 + 0.75 * g : 1.05 * Math.pow(1 - q, 2);
  rim(
    buf,
    cr,
    cg,
    cb,
    fade * (0.7 + 0.9 * e),
    fade * (0.3 + 1.1 * e),
    null,
    () => sheenNow,
    R.deep,
  );
  /* The beads survive the tap and go out with the line, so the frame the card
     is left clamped on has nothing lit on it at all. */
  corners(buf, cr, cg, cb, fade * (0.6 + 0.8 * e), () => sheenNow);

  /*
   * The wind-up: the element rushing *in* to the rim from the whole band.
   *
   * The same brush the loop uses, pointed inwards and moving fast, so the two
   * frames read as the border inhaling. It has to be over by the flash — a
   * particle still travelling inwards while the shockwave leaves is two effects
   * arguing — so it is drawn only while `p < GATHER`, and nothing else is.
   */
  if (p < GATHER) {
    for (let k = 0; k < 26; k++) {
      const u = rnd(k * 9 + 71);
      const [px, py, nx, ny] = pointAt(u);
      const d = REACH * (1 - g) * (0.55 + rnd(k * 9 + 72) * 0.55);
      const size = R.size[0] * 0.85 * SS;
      streak(
        buf,
        brush,
        Math.floor(g * nb) + k * 3,
        px + nx * d,
        py + ny * d,
        nx * REACH * 0.3,
        ny * REACH * 0.3,
        size * R.stretch,
        size,
        Math.atan2(-ny, -nx),
        0.5 + 0.5 * g,
        cr,
        cg,
        cb,
        3,
      );
    }
    return;
  }

  /* The flash: the whole band, white, for the first two frames after the tap. */
  const flash = Math.exp(-q * 16);
  if (flash > 0.004) {
    for (const i of touched) {
      const a = bandMask[i] * flash * 1.5;
      const j = i * 3;
      buf[j] += a;
      buf[j + 1] += a;
      buf[j + 2] += a;
    }
  }

  /*
   * The corner stars: four flares, biggest and hottest on the frame the flash
   * is on, gone within a fifth of the arc.
   *
   * Drawn in a near-white rather than in the element, which is the one place in
   * the file that is deliberate about *not* being the element's colour: the
   * peak of an impact is over-exposure, and over-exposure has no hue. The
   * colour comes back immediately in the spray.
   */
  const starAmp = 1.35 * Math.pow(Math.max(0, 1 - q / 0.22), 1.6);
  if (starAmp > 0.01) {
    const flashArt = loadBrush(FLASH_BRUSH);
    for (let k = 0; k < CORNER_U.length; k++) {
      const [px, py, nx, ny] = pointAt(CORNER_U[k]);
      const r = (16 + 26 * Math.min(1, q / 0.22)) * SS;
      stamp(
        buf,
        flashArt,
        k * 3 + Math.floor(q * 6),
        px + nx * REACH * 0.12,
        py + ny * REACH * 0.12,
        r,
        r,
        Math.atan2(ny, nx),
        starAmp,
        0.55 + 0.45 * cr,
        0.55 + 0.45 * cg,
        0.55 + 0.45 * cb,
      );
    }
  }

  /*
   * The shockwave, and it is over long before the rest of the burst is.
   *
   * A wave that lingers stops being a wave: held at a tenth of its amplitude
   * out at the edge of the band it arrives as a thin hard-edged *box* standing
   * off the card for the back half of the sheet, which reads as a rendering
   * fault rather than as an impact. Gone by 55% of the arc, and never further
   * out than four fifths of the reach so the band still has somewhere to fade
   * it. The sparks are what carry the tail.
   */
  const ringAt = 1 - Math.pow(1 - Math.min(1, q / 0.5), 2.2);
  const ringAmp = 1.7 * Math.pow(1 - Math.min(1, q / 0.55), 1.5);
  if (ringAmp > 0.01) {
    /*
     * Densely enough that the splats overlap, and it has to be checked against
     * the splat radius rather than eyeballed. At 220 the samples sat 10 pixels
     * apart with a 10 pixel radius, so the shockwave arrived as a *dotted*
     * rectangle standing off the card — beads, not a wave. 560 puts them four
     * apart, which overlaps twice over even where the ring has expanded and
     * its own perimeter has grown.
     */
    const n = 560;
    for (let k = 0; k < n; k++) {
      const [px, py, nx, ny] = pointAt(k / n);
      const d = ringAt * REACH * 0.8;
      splat(
        buf,
        px + nx * d,
        py + ny * d,
        3.2 * SS,
        ringAmp * 0.55,
        cr,
        cg,
        cb,
      );
    }
  }

  /* Rays: a dozen spokes standing off the rim through the middle of the arc. */
  const rayAmp = 0.8 * Math.sin(Math.PI * clamp01(q / 0.8)) * e;
  if (rayAmp > 0.01) {
    for (let k = 0; k < 14; k++) {
      const u = k / 14 + 0.013;
      const [px, py, nx, ny] = pointAt(u);
      const len = REACH * (0.55 + rnd(k + 3) * 0.5) * ringAt;
      const steps = 12;
      for (let m = 0; m < steps; m++) {
        const t = m / steps;
        splat(
          buf,
          px + nx * len * t,
          py + ny * len * t,
          (2.4 - 1.6 * t) * SS,
          rayAmp * (1 - t) * 0.3,
          cr,
          cg,
          cb,
        );
      }
    }
  }

  /*
   * The spray: the element's own particles, thrown out and slowing, stamped
   * with the same brush the loop uses.
   *
   * This is what carries the element through the tail — the flash and the stars
   * are hue-less on purpose, so the frames after them have to be unmistakably
   * fire or water or wind, and a torn lick of flame tumbling outwards says that
   * in one frame where a coloured dot needs four.
   */
  const spray = Math.round(R.count * 1.7);
  for (let k = 0; k < spray; k++) {
    const u = rnd(k * 3 + 5);
    const [px, py, nx, ny, tx, ty] = pointAt(u);
    const speed = 0.5 + rnd(k * 3 + 6) * 0.9;
    const t = clamp01((q - rnd(k * 3 + 7) * 0.12) / 0.9);
    if (t <= 0) continue;
    const ease = 1 - Math.pow(1 - t, 2.4);
    const d = ease * REACH * speed;
    const side = (rnd(k * 3 + 8) - 0.5) * 0.7;
    const x = px + nx * d + tx * d * side;
    const y = py + ny * d + ty * d * side - d * R.up * 0.6;
    const vx = nx * REACH * 0.16 * speed;
    const vy = ny * REACH * 0.16 * speed;
    const rb = (R.size[0] * 1.1 - (R.size[0] - R.size[1]) * t) * SS;
    // Tumbling: two whole turns over the throw, which needs no seam because a
    // burst is played once. It is the difference between debris and a decal —
    // except for fire, which stands up the way it does in the loop.
    const rot =
      R.orient === "up"
        ? -Math.PI / 2
        : Math.atan2(vy, vx) + rnd(k * 3 + 9) * 6.283 + t * 12.566;
    streak(
      buf,
      brush,
      Math.floor(t * nb) + k * 5,
      x,
      y,
      vx,
      vy,
      rb * R.stretch,
      rb,
      rot,
      0.95 * Math.pow(1 - t, 1.3),
      cr,
      cg,
      cb,
      R.steps + 1,
    );
  }

  /* And the glitter over all of it, fading with the arc. It is the last layer
     still moving once the spray has gone dark, which is what stops a burst
     ending on a cut rather than on a settle. */
  glints(buf, R, cr, cg, cb, q, 1, Math.pow(1 - q, 1.1) * 1.5);
}

/* --------------------------------------------------------------------- io */

function encode(sheet, w, h, file, proof) {
  const args = [
    "-y",
    "-v",
    "error",
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    `${w}x${h}`,
    "-i",
    "pipe:0",
    "-frames:v",
    "1",
  ];
  if (proof) {
    mkdirSync(PROOF_DIR, { recursive: true });
    const png = join(
      PROOF_DIR,
      file.slice(file.lastIndexOf("ult-")).replace(/\.webp$/, ".png"),
    );
    execFileSync("ffmpeg", [...args, png], {
      input: sheet,
      maxBuffer: 1 << 29,
    });
  }
  execFileSync(
    "ffmpeg",
    [
      ...args.slice(0, -2),
      "-c:v",
      "libwebp",
      "-lossless",
      "0",
      "-quality",
      String(QUALITY),
      "-compression_level",
      "6",
      "-preset",
      "drawing",
      "-frames:v",
      "1",
      file,
    ],
    { input: sheet, maxBuffer: 1 << 29 },
  );
}

/** Twelve frames of one sheet, laid 6x2. */
function sheetOf(draw, R, color) {
  const cr = ((color >> 16) & 255) / 255;
  const cg = ((color >> 8) & 255) / 255;
  const cb = (color & 255) / 255;
  const rows = COUNT / COLS;
  const sw = CELL_W * COLS;
  const sh = CELL_H * rows;
  const sheet = Buffer.alloc(sw * sh * 3);
  const buf = new Float32Array(W * H * 3);

  for (let f = 0; f < COUNT; f++) {
    buf.fill(0);
    draw(buf, R, f, cr, cg, cb);
    const cell = finish(buf);
    const ox = (f % COLS) * CELL_W;
    const oy = Math.floor(f / COLS) * CELL_H;
    for (let y = 0; y < CELL_H; y++) {
      cell.copy(
        sheet,
        ((oy + y) * sw + ox) * 3,
        y * CELL_W * 3,
        (y + 1) * CELL_W * 3,
      );
    }
  }
  return { sheet, sw, sh };
}

/* -------------------------------------------------------------------- main */

const argv = process.argv.slice(2);
const proof = argv.includes("--proof");
const dumpBrushes = argv.includes("--brushes");
const only = new Set(argv.filter((a) => !a.startsWith("--")));
const kb = (f) => (statSync(f).size / 1024).toFixed(1);

mkdirSync(OUT_DIR, { recursive: true });

/**
 * One frame of a loop: the rim under its wave and its sheen, then the
 * particles, both swelling with the breath.
 *
 * The breath is on the *glow* and on the particles and never on the line — the
 * line is the card's own border and a card that changes size is a card with a
 * layout bug, however slight. What breathes is the light coming off it.
 */
const loopDraw = (buf, R, f, cr, cg, cb) => {
  const breath = breatheAt(R.breathe, f);
  rim(
    buf,
    cr,
    cg,
    cb,
    R.lineAmp,
    R.glowAmp * breath,
    (u) => R.wave(u)(f / COUNT),
    R.sheen(f / COUNT),
    R.deep,
  );
  corners(buf, cr, cg, cb, R.lineAmp * 0.85 * breath, R.sheen(f / COUNT));
  emit(buf, R, f, cr, cg, cb, breath);
  comet(buf, R, f, cr, cg, cb, breath);
  glints(buf, R, cr, cg, cb, f / COUNT, breath);
};

let total = 0;
console.log(
  `${COLS}x${COUNT / COLS} of ${CELL_W}x${CELL_H}, ${SS}x supersampled`,
);
for (const { id, color, deep } of ELEMENTS) {
  if (only.size && !only.has(id)) continue;
  const R = RECIPES[id];
  // Decoded here rather than at the top of the file so a run for one element
  // pays for one flipbook, and so a missing source names the element it broke.
  R.art = loadBrush(R.brush);
  R.deep = [
    ((deep >> 16) & 255) / 255,
    ((deep >> 8) & 255) / 255,
    (deep & 255) / 255,
  ];
  if (dumpBrushes) dumpBrush(R.art);
  for (const [what, draw] of [
    ["", loopDraw],
    ["burst-", burstFrame],
  ]) {
    const t0 = Date.now();
    const { sheet, sw, sh } = sheetOf(draw, R, color);
    const out = join(OUT_DIR, `ult-${what}${id}.webp`);
    encode(sheet, sw, sh, out, proof);
    total += statSync(out).size;
    console.log(
      `  ult-${what}${id}`.padEnd(24) +
        `${sw}x${sh}  ${kb(out).padStart(6)} kB  ${((Date.now() - t0) / 1000).toFixed(1)}s`,
    );
  }
}

console.log(`\n${(total / 1024).toFixed(1)} kB of sheets`);
console.log(
  `\nsrc/art/ultborder.js: cols ${COLS}, count ${COUNT}, ` +
    `cell ${CELL_W}x${CELL_H}, fps ${FPS}\n` +
    `  padX ${((CELL_W / CARD_W - 1) / 2).toFixed(4)}  ` +
    `padY ${((CELL_H / CARD_H - 1) / 2).toFixed(4)}  cycle (not ping-pong)\n` +
    `  sheet ${CELL_W * COLS}x${(CELL_H * COUNT) / COLS}`,
);
