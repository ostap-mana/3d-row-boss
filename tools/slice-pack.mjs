/**
 * Cut the art contact sheets into individual PNGs.
 *
 *   node tools/slice-pack.mjs                    # every sheet
 *   node tools/slice-pack.mjs progress-bar       # one sheet
 *   node tools/slice-pack.mjs --preview          # overlay the cut boxes at 3x
 *
 * Rectangles are stored as fractions of the sheet, so re-exporting the sheet at
 * another resolution does not invalidate this file — only a change to the
 * *layout* does.
 *
 * The sheet has no alpha channel, so every asset arrives welded to a backdrop:
 * a transparency checkerboard behind the sprites, the sheet's own rock photo
 * behind the UI pieces. `key` names which one, and it is flood-filled back out
 * from the border — which is why grey armour *inside* a sprite, and a frame's
 * dark interior, both survive where a plain colour key would eat them.
 *
 * ffmpeg is the only tool assumed, and only to decode and encode PNG. It is
 * already what the arena background was encoded with.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Every sheet, its measured size, and where each asset sits on it.
 *
 * Boxes are [x0, y0, x1, y1] in sheet pixels, edges inclusive, measured off
 * column and row brightness profiles rather than by eye — which is why the
 * numbers are not round. They are converted to fractions below, so
 * re-exporting a sheet at another resolution costs nothing; only a change to
 * the *layout* invalidates them.
 *
 *   key   which backdrop the asset is welded to, see keyBackdrop()
 *   cut   rock mode: how far above the backdrop the cut sits
 *   ceil  rock mode: an absolute ceiling, where relative-to-backdrop will not do
 */
const SHEETS = {
  "asset-pack": {
    file: "src/source/unused/first-asset=pack/image.png",
    out: "src/source/unused/first-asset=pack/sliced",
    measured: [1024, 205],
    rects: {
      // The sheet's own header, sitting on the rock backdrop rather than on
      // checkerboard. A label, not a game asset — cut anyway, it costs nothing.
      "title-banner": { box: [296, 6, 700, 32], key: "rock" },

      "logo-match-to-attack": { box: [15, 48, 206, 83], key: "checker" },

      "gem-1-nature": { box: [14, 87, 42, 132], key: "checker" },
      "gem-2-fire": { box: [47, 87, 81, 132], key: "checker" },
      "gem-3-fire-red": { box: [87, 87, 120, 132], key: "checker" },
      "gem-4-lightning": { box: [128, 87, 162, 132], key: "checker" },
      "gem-5-arcane": { box: [168, 87, 203, 132], key: "checker" },

      "character-1": { box: [264, 50, 348, 147], key: "checker" },
      "character-2": { box: [357, 50, 437, 147], key: "checker" },
      "character-4": { box: [445, 50, 524, 147], key: "checker" },
      "character-5": { box: [532, 50, 611, 147], key: "checker" },

      // The grey panel the sheet prints behind each frame tops out at 99, and
      // the glowing borders start at 170 — hence one absolute ceiling between
      // the two. The dark interior survives either way: the flood cannot get
      // through a closed border to reach it.
      "frame-1": { box: [622, 49, 698, 125], key: "rock", ceil: 125 },
      "frame-2": { box: [701, 49, 775, 125], key: "rock", ceil: 125 },
      "frame-3": { box: [779, 49, 854, 125], key: "rock", ceil: 125 },
      "frame-4": { box: [857, 49, 934, 125], key: "rock", ceil: 125 },
      "frame-5": { box: [938, 49, 1012, 125], key: "rock", ceil: 125 },

      "frame-hp-1": { box: [621, 126, 699, 150], key: "rock", cut: 8 },
      "frame-hp-2": { box: [700, 126, 776, 150], key: "rock", cut: 8 },
      "frame-hp-3": { box: [778, 126, 855, 150], key: "rock", cut: 8 },
      "frame-hp-4": { box: [856, 126, 935, 150], key: "rock", cut: 8 },
      "frame-hp-5": { box: [937, 126, 1013, 150], key: "rock", cut: 8 },

      "name-1-blank": { box: [14, 176, 98, 195], key: "rock" },
      "name-2-embra-riklov": { box: [117, 176, 210, 195], key: "rock" },
      "name-3-nyx-sorceress": { box: [230, 176, 330, 195], key: "rock" },
      "name-4-thorne-anarosa": { box: [342, 176, 458, 195], key: "rock" },
      "name-5-myst-lectrina": { box: [486, 176, 594, 195], key: "rock" },

      // Full pill, not just the lit part: each bar is a bright fill plus a dark
      // remainder, and cropping to the bright half throws away the empty state.
      "hp-empty": { box: [614, 176, 689, 196], key: "rock", cut: 8 },
      "hp-fill-1": { box: [700, 176, 775, 196], key: "rock", cut: 8 },
      "hp-fill-3": { box: [779, 176, 854, 196], key: "rock", cut: 8 },
      "hp-fill-4": { box: [858, 176, 933, 196], key: "rock", cut: 8 },
      "hp-fill-5": { box: [939, 176, 1013, 196], key: "rock", cut: 8 },
    },
  },

  "socket-tile": {
    file: "src/source/unused/image.png",
    out: "src/source/unused/image-sliced",
    measured: [1024, 799],
    rects: {
      // One asset, cropped wide enough to keep the soft halo the artist baked
      // around the stone rather than clipping it at the tile's own edge.
      "socket-tile": { box: [236, 74, 900, 672], key: "checker-grid" },
    },
  },

  magic: {
    file: "src/source/unused/MAGIC/magic2.png",
    out: "src/source/unused/MAGIC/sliced",
    measured: [1024, 712],
    // Nine icons on a flat white page. Boxes are each icon's own content
    // bounds plus 3px, so nothing is packed with a slab of dead white.
    atlas: { name: "magic-atlas", padding: 2 },
    rects: {
      "magic-1-fire-ember": { box: [26, 0, 245, 225], key: "white" },
      "magic-2-nature-leaf": { box: [373, 13, 540, 227], key: "white" },
      "magic-3-arcane-orb": { box: [674, 21, 872, 222], key: "white" },

      "magic-4-arcane-crystal": { box: [50, 259, 241, 445], key: "white" },
      "magic-5-fire-swirl": { box: [349, 237, 564, 448], key: "white" },
      "magic-6-nature-thorns": { box: [637, 237, 896, 466], key: "white" },

      "magic-7-water-shards": { box: [34, 470, 248, 682], key: "white" },
      "magic-8-arcane-ring": { box: [371, 495, 545, 668], key: "white" },
      "magic-9-gold-orb": { box: [696, 502, 851, 662], key: "white" },
    },
  },

  "progress-bar": {
    file: "src/source/unused/progress-bar.png",
    out: "src/source/unused/progress-bar-sliced",
    measured: [295, 197],
    rects: {
      // Five identical tracks on a flat black backdrop, pitch 39.
      //
      // The unfilled part of a track reads 9-12 against a backdrop of 8, so
      // brightness cannot tell them apart at all — the only thing separating
      // them is the track's own outline, and the flood stopping at it is the
      // entire mechanism here.
      //
      // Which is why the ceiling is 18 and not higher: the green track has the
      // dimmest outline of the five, dipping to 28, and a ceiling of 30 walked
      // straight through it and hollowed the track out.
      "progress-1-orange": { box: [9, 0, 277, 29], key: "rock", ceil: 18 },
      "progress-2-blue": { box: [9, 39, 277, 67], key: "rock", ceil: 18 },
      "progress-3-green": { box: [9, 77, 277, 106], key: "rock", ceil: 18 },
      "progress-4-gold": { box: [9, 117, 277, 146], key: "rock", ceil: 18 },
      "progress-5-purple": { box: [9, 156, 277, 185], key: "rock", ceil: 18 },
    },
  },
};

/** Pixels -> fractions, so a config survives a re-export at another size. */
function assetsOf(sheet) {
  const [mw, mh] = sheet.measured;
  return Object.entries(sheet.rects).map(([name, spec]) => {
    const [x0, y0, x1, y1] = spec.box;
    return {
      name,
      key: spec.key || null,
      cut: spec.cut === undefined ? 52 : spec.cut,
      ceil: spec.ceil,
      rect: [x0 / mw, y0 / mh, (x1 - x0 + 1) / mw, (y1 - y0 + 1) / mh],
    };
  });
}

/**
 * Key a subject off a transparency checkerboard by dividing the background
 * back out, rather than thresholding against it.
 *
 * For P = a*F + (1-a)*B with a black-ish foreground, a = 1 - P/B exactly. The
 * catch is B: the squares alternate between two tones, so guessing wrong by one
 * square stamps a 25%-opaque ghost of the checkerboard across the whole image.
 *
 * Modelling the grid as a period and a phase does not survive contact with real
 * art — this tile's squares run 12.50 across but 12.63 down, and the vertical
 * spacing wobbles between 11 and 15 pixels, so no single pair of numbers fits.
 *
 * So the tone is never modelled. Every pixel is measured against the *bright*
 * tone, and then a sliding minimum one square wide picks the lowest estimate in
 * each neighbourhood. Any window that wide contains at least one bright square,
 * and that pixel is the one whose estimate was right — which makes this immune
 * to whatever the grid happens to be doing.
 */
function keyCheckerDivide(rgb, w, h, mode) {
  const lum = (i) => (rgb[i] + rgb[i + 1] + rgb[i + 2]) / 3;
  const chromaAt = (i) =>
    Math.max(rgb[i], rgb[i + 1], rgb[i + 2]) -
    Math.min(rgb[i], rgb[i + 1], rgb[i + 2]);
  const neutral = (i) =>
    Math.max(rgb[i], rgb[i + 1], rgb[i + 2]) -
      Math.min(rgb[i], rgb[i + 1], rgb[i + 2]) <=
    14;

  // Bright tone and square size, both off the top strip.
  const strip = Math.min(h, Math.max(8, Math.round(h * 0.05)));
  const hist = new Map();
  for (let y = 0; y < strip; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      if (!neutral(i)) continue;
      const k = Math.round(lum(i));
      hist.set(k, (hist.get(k) || 0) + 1);
    }
  }
  const modes = [...hist.entries()].sort((a, b) => b[1] - a[1]);
  if (!modes.length) return null;
  const hiTone = Math.max(...modes.slice(0, 8).map(([v]) => v));
  if (hiTone < 60) return null;

  // A flat page has one tone and no squares to reason about; a contact sheet
  // has two and a grid. Everything downstream is the same either way.
  const uniform = mode === "white";
  const loTone = uniform
    ? null
    : modes.find(([v]) => Math.abs(v - hiTone) > 20);
  if (!uniform && !loTone) return null;
  const loVal = uniform ? hiTone : loTone[0];
  const mid = (hiTone + loVal) / 2;

  // Square size, from the transitions along a clean row. Only the window width
  // depends on it, so a rough number is plenty — and on a flat page there is
  // no window at all, because there is no alternation to filter out.
  let R = 0;
  if (!uniform) {
    const edges = [];
    let prev = lum(2 * w * 3) > mid;
    for (let k = 1; k < w; k++) {
      const now = lum((2 * w + k) * 3) > mid;
      if (now !== prev) edges.push(k);
      prev = now;
    }
    if (edges.length < 4) return null;
    const square = (edges[edges.length - 1] - edges[0]) / (edges.length - 1);
    if (square < 3 || square > w / 3) return null;
    R = Math.ceil(square * 0.62);
  }

  /**
   * Two independent reasons a pixel cannot be background, kept separate:
   *
   *   dark    it is darker than a bright square. Right for the stone tile, and
   *           the one the tone alternation corrupts — hence the sliding minimum
   *           below.
   *   colour  it has chroma, and the squares never do. Right for the magic
   *           icons, and immune to the alternation, so it is never filtered.
   *
   * Whichever is larger wins. Neither can rescue a near-white part of a subject
   * on a near-white square — that information is simply gone.
   */
  const dark = new Float32Array(w * h);
  const colour = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 3;
    const lo2 = Math.min(rgb[i], rgb[i + 1], rgb[i + 2]);
    const d = 1 - lo2 / hiTone;
    dark[p] = d < 0 ? 0 : d > 1 ? 1 : d;
    const c =
      (Math.max(rgb[i], rgb[i + 1], rgb[i + 2]) - lo2 - CHROMA_FLOOR) /
      (CHROMA_FULL - CHROMA_FLOOR);
    colour[p] = c < 0 ? 0 : c > 1 ? 1 : c;
  }
  const raw = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) raw[p] = Math.max(dark[p], colour[p]);

  // Separable sliding minimum, one square wide. This is what removes the tone
  // alternation: the lowest estimate in the window is the honest one.
  const tmp = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = 1;
      const lo = Math.max(0, x - R);
      const hi2 = Math.min(w - 1, x + R);
      for (let k = lo; k <= hi2; k++) m = Math.min(m, dark[y * w + k]);
      tmp[y * w + x] = m;
    }
  }
  const soft = new Float32Array(w * h);
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let m = 1;
      const lo = Math.max(0, y - R);
      const hi2 = Math.min(h - 1, y + R);
      for (let k = lo; k <= hi2; k++) m = Math.min(m, tmp[k * w + x]);
      // Colour is added back after the filter, never through it: a window
      // reaching into the background would erode a coloured edge to nothing.
      soft[y * w + x] = Math.max(m, colour[y * w + x]);
    }
  }

  // Passability is judged on the *raw* estimate, never the smoothed one: the
  // smoothed value next to the subject is pulled down by the background in its
  // window, and flooding on that would walk straight into the art.
  const STOP = 0.72;
  const FLOOR = 0.06;
  const alpha = new Uint8Array(w * h).fill(255);
  const done = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => {
    const p = y * w + x;
    if (done[p] || raw[p] >= STOP) return;
    done[p] = 1;
    const a = soft[p];
    alpha[p] = a < FLOOR ? 0 : Math.round(a * 255);
    stack.push(p);
  };
  for (let x = 0; x < w; x++) {
    push(x, 0);
    push(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    push(0, y);
    push(w - 1, y);
  }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w,
      y = (p / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }

  // Background the flood could not reach because the art encloses it: the hole
  // through the middle of the arcane ring, the gaps inside the fire swirl.
  // Those really are transparent in the original and have to go, but only as
  // whole pockets — a speck this size is antialiasing, not a hole.
  const POCKET_MIN = 12;
  const pocketSeen = new Uint8Array(w * h);
  for (let p0 = 0; p0 < w * h; p0++) {
    if (done[p0] || pocketSeen[p0] || raw[p0] >= STOP) continue;
    // Full traversal, never bailing at the size limit — a partial walk leaves
    // the rest unvisited and the next start deletes a bite out of the art.
    const pocket = [];
    const work = [p0];
    pocketSeen[p0] = 1;
    while (work.length) {
      const p = work.pop();
      pocket.push(p);
      const x = p % w,
        y = (p / w) | 0;
      const step = (nx, ny) => {
        const q = ny * w + nx;
        if (pocketSeen[q] || done[q] || raw[q] >= STOP) return;
        pocketSeen[q] = 1;
        work.push(q);
      };
      if (x > 0) step(x - 1, y);
      if (x < w - 1) step(x + 1, y);
      if (y > 0) step(x, y - 1);
      if (y < h - 1) step(x, y + 1);
    }
    if (pocket.length < POCKET_MIN) continue;

    // Is it actually backdrop?
    //
    // On a checkerboard a real hole shows both tones alternating; a pale
    // highlight enclosed by the art is one flat value, and clearing those
    // punched the shine out of the ice shards and the gold orb.
    //
    // On a flat page there is no alternation to look for, so the test is
    // purity instead: the page is exactly the backdrop value with no colour in
    // it at all, while a painted white highlight carries a tint. The gold
    // orb's core sits at chroma 7 against a page at chroma 0 — thin, but it is
    // the whole difference between a highlight and a hole.
    let backdropish = 0;
    for (const p of pocket) {
      const i = p * 3;
      const ok = uniform
        ? lum(i) >= hiTone - 2 && chromaAt(i) <= 3
        : Math.abs(lum(i) - loVal) <= 14;
      if (ok) backdropish++;
    }
    // 0.35, well below where a real hole lands. The ring's hole scores 0.55 —
    // dragged down by the rim of pixels the art tinted on its way to opaque —
    // while every painted highlight on this sheet scores 0.00, because being
    // painted it carries a tint and the page does not. With a gap that wide
    // the threshold only has to sit somewhere sane, and 0.55 sat on the line.
    if (backdropish / pocket.length < (uniform ? 0.35 : 0.15)) continue;

    for (const p of pocket) {
      done[p] = 1;
      const a = soft[p];
      alpha[p] = a < FLOOR ? 0 : Math.round(a * 255);
    }
  }

  // A single-subject asset has one blob and nothing else; anything tiny left
  // standing is a speck of dirt the flood could not reach around.
  const SPECKLE_MAX = 120;
  const seen = new Uint8Array(w * h);
  for (let p0 = 0; p0 < w * h; p0++) {
    if (seen[p0] || alpha[p0] === 0) continue;
    // Walk the whole component. Bailing out at the size limit would leave part
    // of a big island unvisited, and the next start inside it would collect a
    // small piece bounded by already-seen pixels and delete a bite out of the
    // art.
    const island = [];
    const work = [p0];
    seen[p0] = 1;
    while (work.length) {
      const p = work.pop();
      island.push(p);
      const x = p % w,
        y = (p / w) | 0;
      const step = (nx, ny) => {
        const q = ny * w + nx;
        if (seen[q] || alpha[q] === 0) return;
        seen[q] = 1;
        work.push(q);
      };
      if (x > 0) step(x - 1, y);
      if (x < w - 1) step(x + 1, y);
      if (y > 0) step(x, y - 1);
      if (y < h - 1) step(x, y + 1);
    }
    if (island.length <= SPECKLE_MAX) {
      for (const p of island) {
        alpha[p] = 0;
        done[p] = 1;
      }
    }
  }

  const out = Buffer.alloc(w * h * 4);
  let clearPixels = 0;
  for (let p = 0; p < w * h; p++) {
    const a = alpha[p];
    const i = p * 3;
    if (done[p] && a > 0) {
      // Divide the square back out. Carrying the raw pixel across would tint
      // every soft edge with the grey it was flattened onto; forcing black
      // instead would be right for the stone's shadow and wrong for a coloured
      // glow, and this is right for both.
      const f = a / 255;
      for (let c = 0; c < 3; c++) {
        const v = (rgb[i + c] - (1 - f) * hiTone) / f;
        out[p * 4 + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    } else if (done[p]) {
      out[p * 4] = 0;
      out[p * 4 + 1] = 0;
      out[p * 4 + 2] = 0;
    } else {
      out[p * 4] = rgb[i];
      out[p * 4 + 1] = rgb[i + 1];
      out[p * 4 + 2] = rgb[i + 2];
    }
    out[p * 4 + 3] = a;
    if (a < 128) clearPixels++;
  }
  return { buf: out, cleared: clearPixels / (w * h) };
}

/** Chroma below this is pure checkerboard; at or above this, pure sprite. */
const CHROMA_FLOOR = 12;
const CHROMA_FULL = 62;

/**
 * Cut an asset's backdrop away and hand back RGBA.
 *
 * Two backdrops live on this sheet and they need opposite tests:
 *
 *   "checker"  the neutral two-tone transparency grid behind the sprites. It
 *              is bright, so a half-blended edge pixel reads as *desaturated*:
 *              alpha comes from how much colour survived, and the grey it was
 *              mixed with is divided back out.
 *   "rock"     the sheet's own dark stone photo behind the UI pieces. It is
 *              nearly black, so a half-blended pixel reads as *dim*: alpha
 *              comes from brightness, and near-black is not worth dividing out.
 *
 * Both flood inwards from the border instead of keying globally, so a colour
 * that also occurs *inside* the art — grey armour, a frame's dark interior —
 * is never cut merely for matching the background.
 */
function keyBackdrop(rgb, w, h, mode, cut, ceil) {
  const chroma = (i) =>
    Math.max(rgb[i], rgb[i + 1], rgb[i + 2]) -
    Math.min(rgb[i], rgb[i + 1], rgb[i + 2]);
  const lum = (i) => (rgb[i] + rgb[i + 1] + rgb[i + 2]) / 3;

  const checker = mode === "checker";

  // The outermost pixels of a sprite panel are its printed border, not the
  // checkerboard, so sample in a little. The UI pieces sit straight on rock.
  const INSET = checker ? 3 : 0;
  const ring = [];
  const note = (x, y) => {
    const i = (y * w + x) * 3;
    if (!checker || chroma(i) <= 16) ring.push(lum(i));
  };
  for (let x = INSET; x < w - INSET; x++) {
    note(x, INSET);
    note(x, h - 1 - INSET);
  }
  for (let y = INSET; y < h - INSET; y++) {
    note(INSET, y);
    note(w - 1 - INSET, y);
  }
  if (ring.length < 16) return null;
  ring.sort((a, b) => a - b);
  const q = (p) => ring[Math.floor(ring.length * p)];

  let lo, hi, ref;
  if (checker) {
    // A band, not two discrete levels: the squares are antialiased into each
    // other, and without the in-between values the fill cannot cross from a
    // light square to a dark one and dies in the first corner it reaches.
    lo = q(0.03) - 14;
    hi = q(0.97) + 14;
    ref = (q(0.03) + q(0.97)) / 2;
  } else {
    // p70, not the maximum or even p90: where the art runs to the crop edge it
    // drags the top of the ring up with it, and one bright name plate touching
    // its own border was enough to lift the threshold over the whole asset.
    //
    // `cut` is per-asset because the sheet is not uniform. The frames need a
    // wide window to clear the grey panel printed behind them; the health bars
    // need a narrow one, because their unfilled remainder sits only ~15 levels
    // above the stone and a wide window swallows it.
    // An absolute ceiling where one is given. The stone's brightness drifts
    // across the sheet (p70 runs 10 to 28) while the grey panel behind the
    // frames does not (65 to 99), so a purely relative cut clears the panel
    // under one frame and leaves a dashed rash around the next.
    hi = ceil === undefined ? q(0.7) + cut : ceil;
    lo = hi - (ceil === undefined ? Math.min(14, Math.max(3, cut / 3)) : 14);
    // Never let the feather reach down into the backdrop itself, or the thing
    // we are removing comes back as a uniform 30%-opaque wash.
    lo = Math.max(lo, q(0.7) + 2);
    ref = q(0.5);
  }

  /** Can the flood travel through this pixel? */
  const passable = (i) => {
    const v = lum(i);
    if (checker) return v >= lo && v <= hi && chroma(i) < CHROMA_FULL;
    return v <= hi;
  };

  /** 0 = pure backdrop, 1 = pure asset. The in-between is the soft edge. */
  const coverage = (i) => {
    if (checker) {
      const c = chroma(i);
      if (c <= CHROMA_FLOOR) return 0;
      return Math.min(1, (c - CHROMA_FLOOR) / (CHROMA_FULL - CHROMA_FLOOR));
    }
    const v = lum(i);
    if (v <= lo) return 0;
    return Math.min(1, (v - lo) / (hi - lo));
  };

  // Walk each edge inwards past the panel chrome to the first line that really
  // is backdrop. Everything outside that rect is contact-sheet furniture.
  const lineHits = (fixed, horizontal) => {
    let n = 0;
    const len = horizontal ? w : h;
    for (let k = 0; k < len; k++) {
      const x = horizontal ? k : fixed;
      const y = horizontal ? fixed : k;
      const i = (y * w + x) * 3;
      if (passable(i) && coverage(i) === 0) n++;
    }
    return n / len;
  };
  let top = 0,
    bottom = h - 1,
    left = 0,
    right = w - 1;
  if (checker) {
    while (top < bottom && lineHits(top, true) < 0.45) top++;
    while (bottom > top && lineHits(bottom, true) < 0.45) bottom--;
    while (left < right && lineHits(left, false) < 0.45) left++;
    while (right > left && lineHits(right, false) < 0.45) right--;
  }

  // 255 = keep. The flood overwrites with the coverage it measured.
  const alpha = new Uint8Array(w * h).fill(255);
  const done = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (y < top || y > bottom || x < left || x > right) {
        const p = y * w + x;
        alpha[p] = 0;
        done[p] = 1;
      }
    }
  }

  const stack = [];
  const push = (x, y) => {
    const p = y * w + x;
    if (done[p]) return;
    if (!passable(p * 3)) return;
    done[p] = 1;
    alpha[p] = Math.round(coverage(p * 3) * 255);
    stack.push(p);
  };
  for (let x = left; x <= right; x++) {
    push(x, top);
    push(x, bottom);
  }
  for (let y = top; y <= bottom; y++) {
    push(left, y);
    push(right, y);
  }
  while (stack.length) {
    const p = stack.pop();
    const x = p % w,
      y = (p / w) | 0;
    if (x > left) push(x - 1, y);
    if (x < right) push(x + 1, y);
    if (y > top) push(x, y - 1);
    if (y < bottom) push(x, y + 1);
  }

  // Second pass: backdrop the flood could not reach because the art encloses
  // it — the gap inside Nyx's staff, the holes between Myst's orbs. Only whole
  // pockets go, so an antialiased speckle inside the art survives.
  //
  // Checkerboard only. On the rock pieces an enclosed dark region is not
  // trapped background, it is the art: a frame's interior and a health bar's
  // unfilled remainder are exactly as dark as the stone behind the sheet, and
  // running this over them punches the middle out of every card.
  const POCKET_MIN = 8;
  const seen = new Uint8Array(w * h);
  for (let p0 = 0; checker && p0 < w * h; p0++) {
    if (done[p0] || seen[p0] || !passable(p0 * 3)) continue;
    const pocket = [];
    const work = [p0];
    seen[p0] = 1;
    while (work.length) {
      const p = work.pop();
      pocket.push(p);
      const x = p % w,
        y = (p / w) | 0;
      const step = (nx, ny) => {
        const qq = ny * w + nx;
        if (seen[qq] || done[qq] || !passable(qq * 3)) return;
        seen[qq] = 1;
        work.push(qq);
      };
      if (x > 0) step(x - 1, y);
      if (x < w - 1) step(x + 1, y);
      if (y > 0) step(x, y - 1);
      if (y < h - 1) step(x, y + 1);
    }
    if (pocket.length >= POCKET_MIN) {
      for (const p of pocket) alpha[p] = Math.round(coverage(p * 3) * 255);
    }
  }

  // Despeckle: the sheet's own label text clips into the top of a crop, and the
  // stone has grains brighter than the cut. Both survive as a dashed rash round
  // the edges.
  //
  // Only islands touching the crop edge go. A small island in the middle is
  // punctuation or a highlight — clearing those cost the title banner the
  // colon out of "ASSET PACK:".
  const SPECKLE_MAX = Math.max(14, Math.round(w * h * 0.0016));
  const MARGIN = 2;
  const visited = new Uint8Array(w * h);
  for (let p0 = 0; p0 < w * h; p0++) {
    if (visited[p0] || alpha[p0] === 0) continue;
    // Walk the whole component, never bailing at the size limit: a partial walk
    // leaves the rest of a big island unvisited, and the next start inside it
    // collects a small piece bounded by already-visited pixels and deletes a
    // bite out of the art.
    const island = [];
    const work = [p0];
    let atEdge = false;
    visited[p0] = 1;
    while (work.length) {
      const p = work.pop();
      island.push(p);
      const x = p % w,
        y = (p / w) | 0;
      if (x < MARGIN || y < MARGIN || x >= w - MARGIN || y >= h - MARGIN) {
        atEdge = true;
      }
      const step = (nx, ny) => {
        const qq = ny * w + nx;
        if (visited[qq] || alpha[qq] === 0) return;
        visited[qq] = 1;
        work.push(qq);
      };
      if (x > 0) step(x - 1, y);
      if (x < w - 1) step(x + 1, y);
      if (y > 0) step(x, y - 1);
      if (y < h - 1) step(x, y + 1);
    }
    if (atEdge && island.length <= SPECKLE_MAX) {
      for (const p of island) alpha[p] = 0;
    }
  }

  const out = Buffer.alloc(w * h * 4);
  let clearPixels = 0;
  for (let p = 0; p < w * h; p++) {
    const a = alpha[p];
    const i = p * 3;
    if (checker && a > 0 && a < 255) {
      // Undo the blend against the grey it was flattened onto, or the edge
      // composites back as a washed-out halo of exactly that grey.
      const f = a / 255;
      for (let c = 0; c < 3; c++) {
        const v = (rgb[i + c] - (1 - f) * ref) / f;
        out[p * 4 + c] = v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
      }
    } else {
      out[p * 4] = rgb[i];
      out[p * 4 + 1] = rgb[i + 1];
      out[p * 4 + 2] = rgb[i + 2];
    }
    out[p * 4 + 3] = a;
    if (a < 128) clearPixels++;
  }
  return { buf: out, cleared: clearPixels / (w * h) };
}

function probe(file) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-show_entries",
      "stream=width,height,pix_fmt",
      "-of",
      "csv=p=0:s=x",
      file,
    ],
    { encoding: "utf8" },
  ).trim();
  const [w, h, pixFmt] = out.split("x");
  return { w: Number(w), h: Number(h), pixFmt };
}

function decode(file, fmt) {
  return execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", fmt, "-"],
    { maxBuffer: 1 << 28 },
  );
}

function writePng(buf, w, h, fmt, file) {
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      "-f",
      "rawvideo",
      "-pix_fmt",
      fmt,
      "-s",
      `${w}x${h}`,
      "-i",
      "pipe:0",
      "-frames:v",
      "1",
      file,
    ],
    { input: buf },
  );
}

/** Fractional rect -> integer crop box on the actual sheet. */
function box(rect, w, h) {
  const x = Math.round(rect[0] * w);
  const y = Math.round(rect[1] * h);
  return {
    x,
    y,
    w: Math.min(Math.round(rect[2] * w), w - x),
    h: Math.min(Math.round(rect[3] * h), h - y),
  };
}

function crop(sheet, sw, b, bpp) {
  const out = Buffer.alloc(b.w * b.h * bpp);
  for (let row = 0; row < b.h; row++) {
    const from = ((b.y + row) * sw + b.x) * bpp;
    sheet.copy(out, row * b.w * bpp, from, from + b.w * bpp);
  }
  return out;
}

function preview(sheet, w, h, assets) {
  const zoom = 3;
  const palette = [
    "red",
    "cyan",
    "yellow",
    "lime",
    "orange",
    "magenta",
    "white",
  ];
  const filters = [`scale=${w * zoom}:${h * zoom}:flags=neighbor`];
  assets.forEach((a, i) => {
    const b = box(a.rect, w, h);
    filters.push(
      `drawbox=x=${b.x * zoom}:y=${b.y * zoom}:w=${b.w * zoom}:h=${b.h * zoom}` +
        `:color=${palette[i % palette.length]}@0.85:t=2`,
    );
  });
  const out = resolve(ROOT, sheet.out);
  mkdirSync(out, { recursive: true });
  const file = resolve(out, "_preview.png");
  execFileSync("ffmpeg", [
    "-y",
    "-v",
    "error",
    "-i",
    resolve(ROOT, sheet.file),
    "-vf",
    filters.join(","),
    file,
  ]);
  console.log("  preview ->", file);
}

/**
 * Shelf-pack the sliced frames into one texture plus a TexturePacker JSON,
 * which is the format Pixi's Assets loader reads without any adapter.
 *
 * Frames are placed tallest-first into rows; whatever power-of-two square they
 * first fit into wins. Not the tightest packing there is, but these are nine
 * icons of similar size, where a smarter algorithm would buy nothing.
 */
function buildAtlas(frames, spec, outDir) {
  const pad = spec.padding === undefined ? 2 : spec.padding;
  const order = [...frames].sort((a, b) => b.h - a.h || b.w - a.w);

  const tryFit = (size) => {
    const placed = [];
    let x = pad,
      y = pad,
      shelf = 0;
    for (const f of order) {
      if (x + f.w + pad > size) {
        x = pad;
        y += shelf + pad;
        shelf = 0;
      }
      if (y + f.h + pad > size) return null;
      placed.push({ ...f, x, y });
      x += f.w + pad;
      shelf = Math.max(shelf, f.h);
    }
    return placed;
  };

  let size = 128;
  let placed = null;
  while (size <= 4096 && !(placed = tryFit(size))) size *= 2;
  if (!placed) throw new Error("atlas: frames do not fit in 4096x4096");

  // Shelves stack downwards, so the last one usually leaves the bottom half of
  // a square canvas empty. Keep the width — the packing depends on it — and cut
  // the height back to the smallest power of two that still holds the rows.
  let used = 0;
  for (const f of placed) used = Math.max(used, f.y + f.h + pad);
  let height = 1;
  while (height < used) height *= 2;

  const canvas = Buffer.alloc(size * height * 4);
  for (const f of placed) {
    for (let row = 0; row < f.h; row++) {
      const from = row * f.w * 4;
      const to = ((f.y + row) * size + f.x) * 4;
      f.buf.copy(canvas, to, from, from + f.w * 4);
    }
  }

  const png = resolve(outDir, `${spec.name}.png`);
  writePng(canvas, size, height, "rgba", png);

  const json = {
    frames: {},
    meta: {
      app: "tools/slice-pack.mjs",
      image: `${spec.name}.png`,
      format: "RGBA8888",
      size: { w: size, h: height },
      scale: "1",
    },
  };
  for (const f of placed) {
    json.frames[`${f.name}.png`] = {
      frame: { x: f.x, y: f.y, w: f.w, h: f.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: f.w, h: f.h },
      sourceSize: { w: f.w, h: f.h },
    };
  }
  writeFileSync(
    resolve(outDir, `${spec.name}.json`),
    JSON.stringify(json, null, 2),
  );
  return { w: size, h: height, count: placed.length, png };
}

function sliceSheet(name, sheet) {
  const file = resolve(ROOT, sheet.file);
  const { w, h, pixFmt } = probe(file);
  const assets = assetsOf(sheet);

  // An alpha channel that reads 255 everywhere is not transparency, it is a
  // flat export that happens to carry a fourth byte. Only real holes let us
  // skip keying, so test the pixels rather than trusting the pixel format.
  const canCarryAlpha = /a|argb|rgba|bgra|pal8/.test(pixFmt);
  const pixels = decode(file, canCarryAlpha ? "rgba" : "rgb24");
  const bpp = canCarryAlpha ? 4 : 3;
  let realAlpha = false;
  if (canCarryAlpha) {
    for (let p = 0; p < w * h; p++) {
      if (pixels[p * 4 + 3] < 250) {
        realAlpha = true;
        break;
      }
    }
  }

  const [mw, mh] = sheet.measured;
  console.log(
    `${name}: ${w}x${h} ${pixFmt}` +
      (realAlpha
        ? " (real transparency — no keying)"
        : " (opaque — backdrop will be keyed)") +
      (w !== mw || h !== mh
        ? `, measured on ${mw}x${mh} — scaling to fit`
        : ""),
  );

  if (process.argv.includes("--preview")) {
    preview(sheet, w, h, assets);
    assets.forEach((a) => {
      const b = box(a.rect, w, h);
      console.log(`  ${a.name.padEnd(24)} ${b.w}x${b.h} @ ${b.x},${b.y}`);
    });
    return;
  }

  // Overwrite in place rather than wiping the folder: on Windows an open
  // preview holds a handle and the whole run dies on EPERM, and blowing away a
  // directory the artist may have dropped files into is not this tool's call.
  const out = resolve(ROOT, sheet.out);
  mkdirSync(out, { recursive: true });
  const packed = [];

  for (const a of assets) {
    const b = box(a.rect, w, h);
    const data = crop(pixels, w, b, bpp);
    const dest = resolve(out, `${a.name}.png`);
    const size = `${String(b.w).padStart(3)}x${b.h}`;

    if (a.key && !realAlpha) {
      // keyBackdrop wants tightly packed RGB.
      let rgb = data;
      if (bpp === 4) {
        rgb = Buffer.alloc(b.w * b.h * 3);
        for (let p = 0; p < b.w * b.h; p++) {
          rgb[p * 3] = data[p * 4];
          rgb[p * 3 + 1] = data[p * 4 + 1];
          rgb[p * 3 + 2] = data[p * 4 + 2];
        }
      }
      const keyed =
        a.key === "checker-grid" || a.key === "white"
          ? keyCheckerDivide(rgb, b.w, b.h, a.key)
          : keyBackdrop(rgb, b.w, b.h, a.key, a.cut, a.ceil);
      if (keyed) {
        writePng(keyed.buf, b.w, b.h, "rgba", dest);
        packed.push({ name: a.name, w: b.w, h: b.h, buf: keyed.buf });
        console.log(
          `  ${a.name.padEnd(24)} ${size}  keyed, ${(keyed.cleared * 100).toFixed(0)}% cut`,
        );
        continue;
      }
      console.log(
        `  ${a.name.padEnd(24)} ${size}  no backdrop found — kept opaque`,
      );
    }
    writePng(data, b.w, b.h, bpp === 4 ? "rgba" : "rgb24", dest);
    if (bpp === 4) packed.push({ name: a.name, w: b.w, h: b.h, buf: data });
    console.log(
      `  ${a.name.padEnd(24)} ${size}${a.key ? "  source alpha kept" : ""}`,
    );
  }
  console.log(`  ${assets.length} assets -> ${out}`);

  if (sheet.atlas) {
    if (packed.length !== assets.length) {
      console.log(
        `  atlas skipped: ${assets.length - packed.length} frame(s) have no alpha`,
      );
    } else {
      const at = buildAtlas(packed, sheet.atlas, out);
      console.log(
        `  atlas ${sheet.atlas.name}.png ${at.w}x${at.h}, ${at.count} frames (+ .json)`,
      );
    }
  }
}

const wanted = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const names = wanted.length ? wanted : Object.keys(SHEETS);
for (const n of names) {
  if (!SHEETS[n]) {
    console.error(
      `unknown sheet "${n}" — have: ${Object.keys(SHEETS).join(", ")}`,
    );
    continue;
  }
  sliceSheet(n, SHEETS[n]);
}
