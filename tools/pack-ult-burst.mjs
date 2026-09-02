/**
 * Pack the hand-made card burst in src/animation/image.png for the game.
 *
 *   node tools/pack-ult-burst.mjs           # -> src/assets/cards/ult-burst-water.webp
 *   node tools/pack-ult-burst.mjs --proof   # + every frame over the card it lands on
 *   node tools/pack-ult-burst.mjs --frames  # + the thirteen registered frames as PNGs
 *   node tools/pack-ult-burst.mjs --png     # -> ult-burst-water.png, lossless
 *
 * This is the animation a card plays on the tap that spends its ultimate — see
 * `flareUlt` in art/heroes.js. It is water only, because the source is one file
 * and the file is one element.
 *
 * ## What the source is, and why it needs a packer of its own
 *
 * `src/animation/image.png` is 1536x1024 RGBA holding thirteen takes of a water
 * card frame: a build, a white-hot peak and a settle. It is not a sprite sheet
 * in any sense the rest of tools/ means the word, and every clause below is
 * about one of the ways it is not:
 *
 *   **Two grids.** Seven frames across the top band at 219px, six across the
 *   bottom at 256. Measured off the alpha's own column profile — the gaps are
 *   real and clean — but there is no one cell size, so ffmpeg's `tile` cannot
 *   read it and neither can the game.
 *
 *   **Every card is a different size and in a different place.** The bottom
 *   row's are half again as large as the top row's, and the aspect wanders with
 *   them. Played as-is the border would swim around the card it is supposed to
 *   be on, so each frame is *registered*: its own border box is measured and
 *   resampled onto a common one. See `register`, which is the whole of this
 *   tool.
 *
 *   **The game's own UI is painted into it.** Every frame carries a green health
 *   bar, a blue charge bar and a water pip in the corner — the card's own
 *   readouts, which the game draws itself from live numbers. Laid over a real
 *   card they would double, at the wrong values, in the wrong place. So
 *   everything inside the frame's line is cut: what ships is the frame and the
 *   light around it, and nothing that pretends to be data.
 *
 * ## What it is turned into
 *
 * The contract the shipped border already holds — see tools/pack-ult-borders.mjs
 * and src/art/ultborder.js. Same canvas, same card box inside it, same cell,
 * same 6x2 grid, so src/art/ultborder.js plays this with the code it already
 * has and `fitUltBorder` lays it out with the pads it already holds.
 *
 * Twelve of the thirteen, evenly spaced, for exactly that reason: a thirteenth
 * frame would cost a second grid in that module for one dropped frame nobody can
 * see missing at 24 fps.
 *
 * Flattened to RGB on black and drawn with the `add` blend, like every other
 * effect sheet in the build. The source is a glassy blue frame on alpha; added,
 * the glass reads as light on the card's own border, which is what it is for —
 * and it costs no alpha channel, which on thirteen frames of glow is most of the
 * file.
 *
 * ffmpeg decodes, resamples and encodes; the measuring and the masking are here.
 */

import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
/**
 * The take sheet, wherever it is sitting.
 *
 * `src/animation/image.png` is where this tool was written against and where a
 * fresh one belongs — beside the shelf, with the rest of the source art. The
 * second path is where the file actually is today, and it is checked rather than
 * asserted for the reason every other measurement here is: a stale path does not
 * throw, it prints "no source" and exits 0, so a repack quietly stops happening
 * and the sheet on disk goes on being whatever it already was.
 */
const SRC = [
  join(ROOT, "src/animation/image.png"),
  join(ROOT, "src/art/image.png"),
].find((p) => existsSync(p));
const OUT_DIR = join(ROOT, "src/assets/cards");
const PROOF_DIR = join(ROOT, "src/animation");
const TMP = join(ROOT, "src/animation/.tmp-burst");

/** Which element's card wears it. The source is water and only water. */
const ELEMENT = "water";

/**
 * The two bands and how many frames are across each, read off the alpha's
 * column profile: seven clean gaps down the top band, five down the bottom.
 *
 * Hardcoded rather than detected, and then checked: `register` prints every
 * frame's measured box, and a split that landed between two cards shows up as a
 * box with the wrong aspect or as two cards in one cell. Detection would be
 * guessing at a file that is never going to change.
 */
const BANDS = [
  { y0: 56, y1: 456, cols: 7 },
  { y0: 480, y1: 968, cols: 6 },
];

/**
 * The output canvas and the card inside it — pack-card-auras.mjs's `--border`
 * numbers, because the point is to land on the same contract.
 *
 * 384x688 with a 304x608 card at 40,40. src/art/ultborder.js's pads are
 * (384/304 - 1)/2 and (688/608 - 1)/2, which is what it already holds.
 */
const W = 384;
const H = 688;
const CARD = { x: 40, y: 40, w: 304, h: 608 };

/** The grid, mirroring tools/pack-ult-borders.mjs exactly. */
const COLS = 6;
const COUNT = 12;
const CELL_W = 176;
const CELL_H = Math.round((CELL_W * H) / W);
/** libwebp quality, as the border sheets. */
const QUALITY = 80;

/**
 * How the interior is cut, in canvas pixels on top of the measured line.
 *
 * `bite` is taken *inside* the line's inner edge, because the line the art
 * draws is not the line the game draws: the source's glass is thicker than
 * `outline.webp`'s hairline, and cut flush the innermost pixels of glass sat
 * over the top of the portrait. `radius` rounds the cut so the frame's own
 * corners survive it, and `feather` keeps the cut from showing as an edge.
 */
const CUT = { bite: 4, radius: 26, feather: 2.5 };

/**
 * What counts as the frame rather than the glow, and it takes two thresholds
 * because the frame is glass.
 *
 * `SOLID` finds the *box*: the source's bloom is soft and partly transparent
 * while the frame's own rim is near enough opaque, so 200 of 255 is inside the
 * rim everywhere and outside the bloom everywhere, and the bounding box of it is
 * the card's outer edge.
 *
 * `GLASS` finds how far in the frame *goes*, and it has to be much lower.
 * Between the bright rim and the hole where the portrait belongs there is a band
 * of half-transparent glass — highlights, droplets, a lit inner edge — and at
 * 200 that band does not exist: the first pass measured a two pixel frame on
 * art whose frame is twenty, and the interior cut then took the glass with the
 * bars. 60 is above the hole, which is empty, and below the faintest glass.
 */
const SOLID = 200;
const GLASS = 60;

/**
 * How much of a side has to be solid before it counts as that side's line —
 * see `measure`. High enough that a swirl standing beside the frame is not a
 * frame, low enough that the peak frames, where the water crosses the border
 * and breaks it, still measure.
 */
const RUN = 0.6;

const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
const kb = (n) => `${(n / 1024).toFixed(1)}kB`;

const run = (args, opts) =>
  execFileSync("ffmpeg", ["-y", "-v", "error", ...args], opts);

function sizeOf(file) {
  const [w, h] = execFileSync("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "stream=width,height",
    "-of",
    "csv=p=0:s=x",
    file,
  ])
    .toString()
    .trim()
    .split("x")
    .map(Number);
  return { w, h };
}

const decodeRgba = (file, filter) =>
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      ...(filter ? ["-vf", filter] : []),
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-",
    ],
    { maxBuffer: 1 << 28 },
  );

/* ------------------------------------------------------------- the measuring */

/**
 * One frame's border box, and how far into it the frame reaches.
 *
 * The box is found as **four long straight runs**, not as the bounding box of
 * everything solid, and the difference is the whole reliability of this tool.
 * The source's water crawls *outside* the frame and is opaque where it does —
 * a swirl standing off the left edge, droplets thrown past the corner — so a
 * bounding box is the box of the splash rather than of the card, and it moves
 * with the splash from frame to frame. Measured that way frame 9 came out 48
 * pixels wider than its own border.
 *
 * A frame's edge is the one thing in the cell that is solid down almost its
 * whole length. So each side is the first column (or row) walking in from the
 * cell's edge that is solid across 60% of the card's middle — the middle
 * because a corner is where two runs meet and neither is a run there. Against
 * the same thirteen frames that gives boxes of one aspect, 0.49 to 0.55, which
 * is what thirteen takes of one card ought to measure.
 *
 * `line` is then how far the art reaches inwards from that edge at mid height,
 * at the glass threshold rather than the solid one. It is not constant across
 * the set and is not meant to be: it runs 11, 14, 26, 34 up to 53 at the peak
 * and back down to 22, which is the effect climbing the frame and is exactly
 * what the caller wants the minimum of.
 */
function measure(px, sw, cell) {
  const at = (x, y) => px[(y * sw + x) * 4 + 3];
  const scan = (from, to, step, test) => {
    for (let i = from; i !== to; i += step) if (test(i)) return i;
    return null;
  };

  // Left and right, off the middle 30% of the band's height.
  const ys = cell.y0 + Math.round((cell.y1 - cell.y0) * 0.35);
  const ye = cell.y0 + Math.round((cell.y1 - cell.y0) * 0.65);
  const needCol = (ye - ys) * RUN;
  const col = (x) => {
    let n = 0;
    for (let y = ys; y < ye; y++) if (at(x, y) >= SOLID) n++;
    return n;
  };
  const left = scan(cell.x0, cell.x1, 1, (x) => col(x) >= needCol);
  const right = scan(cell.x1 - 1, cell.x0, -1, (x) => col(x) >= needCol);
  if (left === null || right === null || right - left < 40) return null;

  // Top and bottom, off the middle 40% of the width just found.
  const xs = left + Math.round((right - left) * 0.3);
  const xe = left + Math.round((right - left) * 0.7);
  const needRow = (xe - xs) * RUN;
  const row = (y) => {
    let n = 0;
    for (let x = xs; x < xe; x++) if (at(x, y) >= SOLID) n++;
    return n;
  };
  const top = scan(cell.y0, cell.y1, 1, (y) => row(y) >= needRow);
  const bottom = scan(cell.y1 - 1, cell.y0, -1, (y) => row(y) >= needRow);
  if (top === null || bottom === null || bottom - top < 80) return null;

  const mid = (top + bottom) >> 1;
  let line = 0;
  for (let x = left; x < right; x++) {
    if (at(x, mid) < GLASS) break;
    line++;
  }

  return {
    x: left,
    y: top,
    w: right - left + 1,
    h: bottom - top + 1,
    line: Math.max(2, line),
  };
}

/* ------------------------------------------------------------ the registering */

/**
 * Resample one frame so its own border box lands on the canvas's card box.
 *
 * A crop and a scale, both in the source's own pixels: the window taken is the
 * frame's box grown by the same fraction of itself that CARD's margin is of
 * CARD, so whatever is outside the frame — all of the bloom this asset is
 * mostly made of — arrives at the same scale as the frame does.
 *
 * Non-uniform, because the source's aspect wanders between takes and the card's
 * does not. A frame stretched by the four percent that costs is a frame whose
 * light sits on the card's border on all four sides, which is the only thing
 * this asset has to get right; held to its own aspect it would sit on the border
 * along two sides and a dozen pixels off it along the other two.
 */
function register(box) {
  const padX = (CARD.x / CARD.w) * box.w;
  const padY = (CARD.y / CARD.h) * box.h;
  return {
    cx: box.x - padX,
    cy: box.y - padY,
    cw: box.w + padX * 2,
    ch: box.h + padY * 2,
  };
}

/**
 * Everything inside the frame's line, gone — see the header. A rounded
 * rectangle rather than a plain one so the frame's corners are not sliced off
 * with it, feathered so the cut is not itself an edge.
 */
function interiorMask(inset) {
  const hw = (CARD.w - inset * 2) / 2;
  const hh = (CARD.h - inset * 2) / 2;
  const r = Math.min(CUT.radius, Math.min(hw, hh) - 1);
  const cx = CARD.x + CARD.w / 2;
  const cy = CARD.y + CARD.h / 2;

  const keep = new Float32Array(W * H).fill(1);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const qx = Math.abs(x + 0.5 - cx) - (hw - r);
      const qy = Math.abs(y + 0.5 - cy) - (hh - r);
      const d =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
        Math.min(Math.max(qx, qy), 0) -
        r;
      // d < 0 is inside the cut, and the feather is spent on the way out of it.
      keep[y * W + x] = Math.min(1, Math.max(0, d / CUT.feather + 0.5));
    }
  }
  return keep;
}

/* ------------------------------------------------------------------ the run */

if (!SRC) {
  console.log("no source: src/animation/image.png (or src/art/image.png)");
  process.exit(0);
}

const wantProof = process.argv.includes("--proof");
const wantFrames = process.argv.includes("--frames");
/**
 * Write the sheet as a lossless PNG rather than a webp at QUALITY — the same
 * flag tools/pack-ult-borders.mjs takes, and the header there carries the whole
 * argument: it is a reference to judge the encode against, not a shipping
 * option, because src/art/ultborder.js globs `ult-*.webp` and nothing else.
 *
 * It matters more on this sheet than on the six loops. This one is glass — a
 * blue frame with a white-hot peak in the middle of its twelve — and a peak is
 * where a lossy encode has the least to work with.
 */
const wantPng = process.argv.includes("--png");

const { w: sw, h: sh } = sizeOf(SRC);
const px = decodeRgba(SRC);
console.log(`${rel(SRC)}  ${sw}x${sh}`);

mkdirSync(TMP, { recursive: true });

/* Every cell of both bands, measured and registered. */
const boxes = [];
for (const band of BANDS) {
  const cw = sw / band.cols;
  for (let i = 0; i < band.cols; i++) {
    const cell = {
      x0: Math.round(i * cw),
      x1: Math.round((i + 1) * cw),
      y0: band.y0,
      y1: Math.min(sh, band.y1),
    };
    const box = measure(px, sw, cell);
    if (!box) {
      console.log(`  cell ${boxes.length + 1}: nothing solid in it, skipped`);
      continue;
    }
    boxes.push(box);
    console.log(
      `  frame ${String(boxes.length).padStart(2)}: ` +
        `${box.w}x${box.h} at ${box.x},${box.y}  ` +
        `aspect ${(box.w / box.h).toFixed(3)}  line ${box.line}`,
    );
  }
}

if (boxes.length < COUNT) {
  console.log(`only ${boxes.length} frames found, need ${COUNT}`);
  process.exit(1);
}

/** Twelve of the thirteen, evenly spaced — see the header. */
const picks = Array.from({ length: COUNT }, (_, i) =>
  Math.round((i * (boxes.length - 1)) / (COUNT - 1)),
);

/**
 * The inset the interior is cut at: one number for all twelve, taken as the
 * *thinnest* frame in the set scaled onto the canvas.
 *
 * The thinnest rather than each frame's own, because the cut has to be in the
 * same place in every frame — a cut that breathed with the art would read as the
 * portrait hole pumping — and the thinnest is the one that decides: cut any
 * deeper than the thinnest frame's line and that frame loses its own border.
 */
const inset =
  Math.min(...picks.map((p) => (boxes[p].line * CARD.w) / boxes[p].w)) +
  CUT.bite;
const keep = interiorMask(inset);
console.log(`interior cut ${inset.toFixed(1)}px in, radius ${CUT.radius}`);

/**
 * The sheet again, with every cell walled off from its neighbours.
 *
 * A frame's window is its own box plus a margin for the bloom, and in the bottom
 * band that margin reaches into the next cell — where the next card's bloom is,
 * a hand's width of blue standing down one side of a frame it does not belong
 * to. The cells do not overlap; only the light does. So the source is copied
 * once with everything outside each cell's own column cleared, and the windows
 * are cut from that: a frame gets all of its own bloom and none of anybody
 * else's.
 */
const caged = join(TMP, "caged.png");
{
  const walled = Buffer.from(px);
  const bounds = [];
  for (const band of BANDS) {
    const cw = sw / band.cols;
    for (let i = 0; i < band.cols; i++)
      bounds.push({
        x0: Math.round(i * cw),
        x1: Math.round((i + 1) * cw),
        y0: band.y0,
        y1: Math.min(sh, band.y1),
      });
  }
  // Anything not inside some cell is another cell's spill or the gap between
  // bands, and neither is wanted in anybody's margin.
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const inside = bounds.some(
        (b) => x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1,
      );
      if (!inside) walled[(y * sw + x) * 4 + 3] = 0;
    }
  }
  writeFileSync(join(TMP, "caged.raw"), walled);
  run([
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgba",
    "-s",
    `${sw}x${sh}`,
    "-i",
    join(TMP, "caged.raw"),
    caged,
  ]);
}

/* Each pick: crop and scale in ffmpeg, then mask and flatten here. */
const frames = [];
picks.forEach((p, n) => {
  const box = boxes[p];
  const { cx, cy, cw, ch } = register(box);
  // Clamped to the sheet, and the clamp is padded back in below: a frame at the
  // edge of the file has less bloom room than the canvas wants, and cropping
  // outside the source is an ffmpeg error rather than transparent pixels.
  const x = Math.max(0, Math.round(cx));
  const y = Math.max(0, Math.round(cy));
  const cropW = Math.min(sw - x, Math.round(cw));
  const cropH = Math.min(sh - y, Math.round(ch));

  const cut = join(TMP, `cut-${n}.png`);
  run([
    "-i",
    caged,
    "-vf",
    `crop=${cropW}:${cropH}:${x}:${y},` +
      `pad=${Math.round(cw)}:${Math.round(ch)}:${Math.round(x - cx)}:${Math.round(y - cy)}:color=#00000000,` +
      `scale=${W}:${H}:flags=lanczos`,
    "-frames:v",
    "1",
    cut,
  ]);

  const art = decodeRgba(cut);
  const out = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    // Straight alpha in, premultiplied out: the sheet is drawn with `add`, so
    // what a pixel contributes is its colour times how much of it there is.
    const a = (art[i * 4 + 3] / 255) * keep[i];
    out[i * 3] = Math.min(255, art[i * 4] * a) | 0;
    out[i * 3 + 1] = Math.min(255, art[i * 4 + 1] * a) | 0;
    out[i * 3 + 2] = Math.min(255, art[i * 4 + 2] * a) | 0;
  }
  frames.push(out);

  const png = join(TMP, `${String(n + 1).padStart(2, "0")}.png`);
  run(
    [
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-s",
      `${W}x${H}`,
      "-i",
      "pipe:0",
      png,
    ],
    { input: out },
  );
});

mkdirSync(OUT_DIR, { recursive: true });
const sheet = join(OUT_DIR, `ult-burst-${ELEMENT}.${wantPng ? "png" : "webp"}`);
run([
  "-i",
  join(TMP, "%02d.png"),
  "-vf",
  `scale=${CELL_W}:${CELL_H}:flags=lanczos,tile=${COLS}x${COUNT / COLS}`,
  "-frames:v",
  "1",
  // rgb24 on the PNG side: libwebp takes the same frames to yuv420p, so the
  // shipped sheet carries subsampled chroma as well as the lossy pass, and on
  // one saturated hue against black that is half of the loss.
  ...(wantPng
    ? ["-c:v", "png", "-pix_fmt", "rgb24", "-pred", "mixed"]
    : ["-c:v", "libwebp", "-quality", String(QUALITY)]),
  "-compression_level",
  wantPng ? "9" : "6",
  sheet,
]);
console.log(
  `${rel(sheet)}  ${COLS}x${COUNT / COLS} ${CELL_W}x${CELL_H} ` +
    `${kb(statSync(sheet).size)}`,
);

if (wantFrames) {
  const contact = join(PROOF_DIR, `ult-burst-${ELEMENT}-contact.png`);
  run([
    "-i",
    join(TMP, "%02d.png"),
    "-vf",
    `scale=192:344,tile=6x2`,
    "-frames:v",
    "1",
    contact,
  ]);
  console.log(`  frames ${rel(contact)}`);
}

/* ---------------------------------------------------------------- the proof */

/**
 * Every frame over the card the game draws, at the size the game draws it.
 *
 * The same composite tools/pack-ult-borders.mjs makes and for the same reason:
 * the one thing the pads cannot be read off a number for is whether the light
 * lands on the border. Here it also shows the cut — the bars and the pip painted
 * into the source have to be gone, and the frame's own corners have to have
 * survived their going.
 */
if (wantProof) {
  const cardW = 168;
  const cardH = Math.round(cardW / 0.48);
  const k = cardH / 260;
  const line = 6.11 * k;
  const auraW = Math.round((cardW * W) / CARD.w);
  const auraH = Math.round((cardH * H) / CARD.h);
  const bg = [26, 18, 34];
  const fill = [18, 11, 30];
  const tint = [0x2f, 0xa8, 0xff];

  const cells = [];
  for (const out of frames) {
    const px2 = Buffer.alloc(auraW * auraH * 3);
    run(
      [
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        `${W}x${H}`,
        "-i",
        "pipe:0",
        "-vf",
        `scale=${auraW}:${auraH}:flags=lanczos`,
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        join(TMP, "aura.raw"),
      ],
      { input: out },
    );
    const art = readFileSync(join(TMP, "aura.raw"));
    for (let y = 0; y < auraH; y++) {
      for (let x = 0; x < auraW; x++) {
        const i = (y * auraW + x) * 3;
        const qx = Math.abs(x + 0.5 - auraW / 2) - (cardW / 2 - 4 * k);
        const qy = Math.abs(y + 0.5 - auraH / 2) - (cardH / 2 - 4 * k);
        const d =
          Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
          Math.min(Math.max(qx, qy), 0) -
          4 * k;
        const inside = Math.min(1, Math.max(0, 0.5 - d));
        const onLine = Math.min(
          1,
          Math.max(0, 0.5 - Math.abs(d + line / 2) + line / 2),
        );
        for (let c = 0; c < 3; c++) {
          const base = fill[c] * inside + bg[c] * (1 - inside);
          const card = tint[c] * onLine + base * (1 - onLine);
          px2[i + c] = Math.min(255, card + art[i + c]) | 0;
        }
      }
    }
    cells.push(px2);
  }

  // Twelve cells side by side, two rows of six, laid out here rather than by
  // ffmpeg because they are already raw.
  const gw = auraW * 6;
  const gh = auraH * 2;
  const grid = Buffer.alloc(gw * gh * 3);
  cells.forEach((cell, n) => {
    const ox = (n % 6) * auraW;
    const oy = Math.floor(n / 6) * auraH;
    for (let y = 0; y < auraH; y++)
      cell.copy(
        grid,
        ((y + oy) * gw + ox) * 3,
        y * auraW * 3,
        (y + 1) * auraW * 3,
      );
  });
  const file = join(PROOF_DIR, `ult-burst-${ELEMENT}-proof.png`);
  writeFileSync(join(TMP, "grid.raw"), grid);
  run([
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    "-s",
    `${gw}x${gh}`,
    "-i",
    join(TMP, "grid.raw"),
    file,
  ]);
  console.log(`  proof  ${rel(file)}  ${gw}x${gh}`);
}

rmSync(TMP, { recursive: true, force: true });
