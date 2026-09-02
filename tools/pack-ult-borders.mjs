/**
 * Take one animated border per element off the shelf and pack it for the game.
 *
 *   node tools/pack-ult-borders.mjs                 # the six picks
 *   node tools/pack-ult-borders.mjs --ribbon        # ...off the ribbon shelf
 *   node tools/pack-ult-borders.mjs fire=3 wind=1   # override a pick
 *   node tools/pack-ult-borders.mjs --proof         # + a composite per element
 *   node tools/pack-ult-borders.mjs --png           # ...as lossless PNG instead
 *   node tools/pack-ult-borders.mjs --burst --halo fire=1
 *                                                   # -> ult-burst-fire.webp
 *
 * The shelf is `src/animation/style-border/<el>/<el>-v<N>/frame-01..25.png`,
 * twenty-four takes written by tools/pack-card-auras.mjs — read that header for
 * how the frames are made and this one for what shipping one costs. Out comes
 *
 *   src/assets/cards/ult-<element>.webp   12 frames, 6x2, CELL_W cells
 *
 * for whichever take `TAKES` names, which is what a charged hero card wears and
 * flares on the tap that spends it — see src/art/ultborder.js.
 *
 * ## Why this is not the shelf's own sheet
 *
 * The shelf already writes a 6x2 sheet per take, and it is the wrong file to
 * ship twice over. It is packed at a 200px cell against a card that is 168
 * device pixels wide at its largest — see CARD in core/layout.js — and at
 * quality 88, which on twenty-four takes is a judging call and on six shipped
 * ones is 130 kB nobody can see. The frames are still on disk, so this cuts its
 * own sheet from them rather than re-encoding an encode: one lossy pass, at the
 * size and the quality the *bundle* wants.
 *
 * That matters here more than anywhere else in tools/. The deliverable is one
 * self-contained index.html with every asset inlined as base64, which costs a
 * third on top of what is on disk — so six of these are the single largest
 * thing any one feature in this repo has ever asked the bundle for. At CELL_W
 * and QUALITY the set is about 160 kB, near enough half what the shelf's own
 * sheets would have cost.
 *
 * ## The contract with src/art/ultborder.js
 *
 * Two halves, and both are printed at the end of a run.
 *
 * **The grid**, which that module hardcodes exactly as art/spells.js hardcodes
 * pack-spells.mjs's. Change COLS, COUNT or the cell here and change it there.
 *
 * **The pads** — how far the file reaches outside the card, as a fraction of
 * the card's own box, which is what turns "a card w by h" into the size the
 * sprite is drawn at. They are *measured*, not asserted: the frames carry a
 * solid element-coloured line at the card's own border and a glow that moves
 * around it, so the min of the twelve frames is the line by itself, and the
 * half-maximum crossings of that are its four outer edges. See `measure`.
 *
 * Measured rather than computed from pack-card-auras.mjs's constants for the
 * reason frameaura.js gives about its own pair: nothing at runtime can detect
 * that they have gone stale. A wrong pad does not throw, it draws the border's
 * light a few points inside the card, which reads as a glow on the portrait.
 * Measuring means a re-pack of the shelf at another margin is caught here, on
 * the six files that shipped, rather than seen later on a phone.
 *
 * ffmpeg decodes and encodes; the arithmetic is here, as everywhere else in
 * this folder.
 */

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ELEMENTS } from "./gen-card-auras.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src/assets/cards");
const TMP = join(ROOT, "src/animation/.tmp-ult");

/**
 * Which shelf, and which asset — two flags, and both of them only change where
 * bytes are read from and written to. Everything between is the same work.
 *
 * `--halo` reads `src/animation/<el>/` instead of `src/animation/style-border/
 * <el>/`: the same twenty-four clips under the *other* shape, a hairline with a
 * wide bloom rather than the card's own solid line. It is a different geometry
 * and not a variation on one — a much larger margin round a slightly different
 * rectangle — which is exactly why the pads below are measured per run and why
 * src/art/ultborder.js keeps a pad per sheet rather than one for the set.
 *
 * `--ribbon` reads `src/animation/style-ribbon/<el>/`, which is the same card
 * and the same margin as the default shelf — so the sheets land on
 * ultborder.js's `border` shape and the runtime cannot tell the two apart — but
 * composited by unrolling the band around the card instead of reading the clip
 * where it lies. What that buys is in the header of
 * tools/pack-card-auras.mjs: four sides that cannot be unevenly lit, and light
 * that travels round the card rather than shimmering in place. The pads are
 * still measured per run, and they had better come out near the default
 * shelf's — a ribbon sheet whose glow reaches somewhere else is a repack of
 * that tool at another `AURA_BAND_FLOOR`, not a new geometry.
 *
 * `--burst` writes `ult-burst-<el>.webp`, which the game plays once on the tap
 * that spends the ultimate rather than looping while the card is charged. Same
 * twelve frames, same grid; what differs is which end of art/heroes.js picks it
 * up. See tools/pack-ult-burst.mjs, which packs the same asset for water out of
 * a hand-made sheet.
 *
 * `--png` writes the same grid, at the same cell, as a lossless PNG rather than
 * a webp at QUALITY. Same measurement, same pads, same everything printed at the
 * end of a run — only the encode differs.
 *
 * It is a comparison, not a shipping option, and the two reasons for that are
 * worth having in one place. The **bundle**: these sheets are pure falloff and
 * lossless is where falloff costs most, so a PNG set is several times the webp
 * one before base64 puts another third on top — see the header above on why six
 * of these are already the largest thing any feature here has asked the bundle
 * for. And the **runtime**: src/art/ultborder.js globs `ult-*.webp` and nothing
 * else, so a PNG next to a webp is inert — it is a file to look at, or to open
 * in something that will not read a webp, and shipping one means changing that
 * glob and the id it cuts out of the filename.
 *
 * What it is genuinely good for is judging the encode. QUALITY is argued below
 * off one sweep on one take; a PNG of the same pack is the reference that
 * argument is missing, and banding in a glow is the one artefact a phone shows
 * and a contact sheet does not.
 */
const HALO = process.argv.includes("--halo");
const RIBBON = process.argv.includes("--ribbon");
const FLARE = process.argv.includes("--flare");
const BURST = process.argv.includes("--burst");
const PNG = process.argv.includes("--png");
const SHELF = join(
  ROOT,
  HALO
    ? "src/animation"
    : FLARE
      ? "src/animation/style-flare"
      : RIBBON
        ? "src/animation/style-ribbon"
        : "src/animation/style-border",
);

/**
 * Which take each element ships, off the contact sheets and the loops in
 * src/animation/style-border — the "Pick" step of that folder's README.
 *
 * What every one of them was picked for is evenness. A take is only worth
 * having if the border is lit on all four sides in all twelve cells and the
 * only thing that moves is the effect crawling along it: a card whose left edge
 * goes dark for two frames reads as a rendering fault, not as fire. That rules
 * out more of the twenty-four than any judgement about which fire is prettiest,
 * and it is why three of the six picks are not the take with the most going on:
 *
 *   fire      v1  the even one — the line lit on all four sides in all twelve
 *                 cells, with flame licking up the two lower corners and
 *                 nothing else moving. Asked for by name over v4, which has
 *                 more fire gathered along the bottom edge but pays for it with
 *                 a top edge that is line and not much else for a few frames of
 *                 the cycle
 *   water     v4  a wave crossing the lower half, all four sides held
 *   nature    v4  soft and even. v3 has a white blob welded to the bottom edge
 *   lightning v2  filaments the whole way round. v4 reads as dotted, v1 blows
 *                 out on the left
 *   arcane    v3  even, with wisps. v2 has two bright holes in the left edge
 *   wind      v4  streaks along the sides, quietest of a quiet set
 *
 * Override on the command line to try another — `node tools/pack-ult-borders.mjs
 * water=2` — which repacks that one file and prints its size, so the trade
 * against the bundle is on screen before it is committed.
 */
const BORDER_TAKES = {
  fire: 1,
  water: 4,
  nature: 4,
  lightning: 2,
  arcane: 3,
  wind: 4,
};

/**
 * The flare shelf's picks, loop and burst together.
 *
 * That shelf is not a spread of variants to choose between. Each element was
 * prompted for its *own* effect rather than for a variation on a shared one —
 * fire's magma spears, water's foam crests, nature's lashing vines,
 * lightning's forks, arcane's collapsing rune rings, wind's air blades — every
 * one off that hero's named ultimate in src/source/prompts.md, which is what
 * keeps any two of the six from reading as the same thing under a different
 * tint. So a pick here is a loop and the burst cut with it: `SHOT_FLARE` on the
 * odd take, `SHOT_BURST` on the even one, and a re-shoot lands as the next pair.
 *
 * Five of the six ship their first pair. Wind ships its second, and the three
 * that were re-shot are worth writing down because two of the re-shoots lost:
 *
 *   wind       v13  the winner. v11 was a flat teal haze with no shape in it;
 *                   asking for a few big crescent blades instead of many thin
 *                   streaks gave it white-cored blades that read at card size.
 *   nature     v11  kept. v13's few thick vines came round only a handful of
 *                   times, so whole edges went bare and what was left repeated
 *                   visibly. Four laps evened it out and made the repetition
 *                   worse. v11 is fibrous rather than vine-like and it is even.
 *   lightning  v11  kept, and it is the weakest of the set. v13 is far bolder
 *                   and lands as gold *silk* — thick smooth ribbons with no
 *                   black anywhere between them, which is a handsome ornate
 *                   frame and is not electricity. Pushing AURA_TEX_GAMMA to 1.4
 *                   did not open it up: the clip has no gaps to recover. v11
 *                   keeps its black and reads as crackle, quietly.
 *
 * The general lesson, for the next round: this style wants a *middle* number of
 * thick features. Many thin ones read as fur, a few thick ones cannot cover the
 * rim, and neither is fixed by `AURA_REPEAT`.
 */
const flareTakes = () => {
  const loop = {
    fire: 11,
    water: 11,
    nature: 11,
    lightning: 11,
    arcane: 11,
    wind: 13,
  };
  return Object.fromEntries(
    Object.entries(loop).map(([el, v]) => [el, BURST ? v + 1 : v]),
  );
};

const TAKES = FLARE ? flareTakes() : BORDER_TAKES;

/* ------------------------------------------------------------------ the grid */

/**
 * The sheet's grid, mirrored by src/art/ultborder.js. Twelve frames, six to a
 * row, meant to be **ping-ponged**: 0..11,10..1 has no seam by construction,
 * which none of these clips has on its own — Wan was asked for motion, not for
 * a loop.
 *
 * Twelve of the source's twenty-five, evenly spaced, so a sheet holds the whole
 * cycle rather than the first half of it. Exactly the shelf's own twelve, so
 * what plays here is what the contact sheets were judged on.
 */
const COLS = 6;
const COUNT = 12;

/**
 * How wide a cell is packed, and why it is under the shelf's 200.
 *
 * A hero card is at most 168 device pixels wide — 56 points at the layout's own
 * sizing (see CARD in core/layout.js) times a 3x screen — and the card fills
 * 304 of the source frame's 384 columns, so a cell of 176 puts 139 pixels of
 * art across a card that wants 168. Which is a 1.2x upscale of a glow, on the
 * one asset in the build that is *nothing but* falloff: there is no line to
 * soften and no detail to lose, and the bundle keeps a third of the bytes.
 *
 * The height follows the source's own aspect rather than the card's, because
 * the file is the card plus the margin the glow hangs in — see the pads.
 *
 * `--flare` stays at 176 as well, and it is the one number on this shelf that
 * was decided by the bundle rather than by the art.
 *
 * A flare frame is 496x800 rather than 384x688 — the effect is given a 104
 * pixel margin to fly out into instead of 48 — so the card is 58% of the frame
 * where it used to be 75%, and 176 leaves it 102 pixels under the 168 a card
 * asks for. 240 would put 139 there, matching the border shape exactly. Swept
 * across the six, with QUALITY moved to match:
 *
 *   240 at 80   837 kB
 *   192 at 72   476 kB
 *   176 at 68   394 kB
 *
 * and 837 kB is not a trade anyone would take. Six border sheets cost 160 kB,
 * the deliverable is one self-contained index.html, and base64 adds a third on
 * top of whatever is chosen. 176 at 68 was checked at 2x against the 240 pack
 * and holds: the licks keep their shape, the line stays crisp, and there is no
 * banding in the falloff. It is soft where a flare is soft, which is most of it.
 *
 * That is still 394 kB for the set, against the border set's 160, and the
 * difference is honest — a big effect over a big margin is more pixels of
 * detail, and there is no encode that makes it not be.
 */
const CELL_W = Number(process.env.ULT_CELL_W ?? 176);

/**
 * libwebp quality. The shelf packs at 88 because it is judging takes; a shipped
 * glow does not need it. Swept on lightning-v2, the heaviest of the six: 88 is
 * 65 kB, 80 is 45 kB, 72 is 37 kB, and 72 is where the falloff starts to band
 * on a phone. 80 is the last one that is free.
 *
 * `--flare` goes to 68, which on a border sheet would band and on a flare sheet
 * does not — there is far less bare falloff in one. A flare frame is mostly
 * effect, and effect hides an encode the way falloff cannot. See CELL_W for the
 * sweep the pair of them came out of.
 */
const QUALITY = Number(process.env.ULT_QUALITY ?? (FLARE ? 68 : 80));

/* ------------------------------------------------------------------- ffmpeg */

const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, "/");
const kb = (n) => `${(n / 1024).toFixed(1)}kB`;

const run = (args, opts) =>
  execFileSync("ffmpeg", ["-y", "-v", "error", ...args], opts);

const decodeGray = (file) =>
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", "gray", "-"],
    { maxBuffer: 1 << 28 },
  );

const decodeRgb = (file, w, h) =>
  execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-i",
      file,
      ...(w ? ["-vf", `scale=${w}:${h}:flags=lanczos`] : []),
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgb24",
      "-",
    ],
    { maxBuffer: 1 << 28 },
  );

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

/* ------------------------------------------------------------ the measurement */

/**
 * Where the card's border sits inside the file, measured off the art.
 *
 * The frames are a solid line on the card's own border plus a glow that moves
 * around it, so the **minimum of the twelve** is the line and the margin it
 * hangs in: whatever the effect lit in one frame is dark in another, and the
 * one thing lit in all twelve is the border itself. That is the whole trick
 * here, and it is what makes this a measurement rather than a guess — a mean
 * would carry the glow's own falloff into the edges it is trying to find.
 *
 * The edges are then the half-maximum crossings of that minimum, walked in from
 * each of the four sides. Half of the peak lands on the outer edge of the line
 * to within a pixel: the line is flat at its peak and its outward falloff is
 * over a few pixels.
 *
 * And each side is taken from a few hundred scan lines rather than the one down
 * the middle, at the **far end** of what they say rather than the average of
 * it. In three of the six takes some of the glow does not move at all — a wave
 * standing off water-v4's left edge in every frame, fire pooling under
 * wind-v4's bottom one — so it survives the minimum, and a scan line walking
 * into it crosses half-maximum out in the glow, six pixels early. Every scan
 * line has the border on it, so no scan can cross *later* than the border's own
 * edge: whatever crosses early is glow, and the edge is the last crossing, not
 * the typical one. Taken at the 90th percentile rather than at the maximum so
 * that one dead line cannot push the edge inwards on its own. Down the middle
 * this measured water 0.014 off the other five, which on a card is the border's
 * light landing two points outside its own line.
 *
 * @returns {{box: {x: number, y: number, w: number, h: number},
 *            pad: {x: number, y: number}}}
 *   the border's outer rectangle in the file, and the margin round it as a
 *   fraction of that rectangle — which is what the sprite is laid out by.
 */
function measure(files) {
  const { w, h } = sizeOf(files[0]);
  const min = new Uint8Array(w * h).fill(255);
  for (const file of files) {
    const g = decodeGray(file);
    for (let i = 0; i < w * h; i++) if (g[i] < min[i]) min[i] = g[i];
  }

  const at = (x, y) => min[y * w + x];
  const high = (v) =>
    v.sort((a, b) => a - b)[Math.min(v.length - 1, Math.floor(v.length * 0.9))];

  /**
   * One side, off every scan line across the middle 60% of it.
   *
   * The middle 60% keeps all four corners out of it — a corner is where a
   * rounded rectangle's two runs meet and neither side's edge is there — and
   * the scan is normalised on its own line's peak so that a dim side is
   * measured against itself rather than against the brightest one.
   *
   * @param {number} n how many scan lines there are to choose from
   * @param {number} m how far a scan may walk in
   * @param {(i: number, j: number) => number} read scan `i`, `j` deep into it
   */
  const side = (n, m, read) => {
    const from = Math.round(n * 0.2);
    const to = Math.round(n * 0.8);
    const crossings = [];
    for (let i = from; i < to; i++) {
      let peak = 0;
      for (let j = 0; j < m; j++) peak = Math.max(peak, read(i, j));
      for (let j = 0; j < m; j++) {
        if (read(i, j) < peak * 0.5) continue;
        crossings.push(j);
        break;
      }
    }
    return crossings.length ? high(crossings) : 0;
  };

  const top = side(w, h, (x, y) => at(x, y));
  const bottom = h - 1 - side(w, h, (x, y) => at(x, h - 1 - y));
  const left = side(h, w, (y, x) => at(x, y));
  const right = w - 1 - side(h, w, (y, x) => at(w - 1 - x, y));

  const box = { x: left, y: top, w: right - left + 1, h: bottom - top + 1 };
  return {
    box,
    pad: { x: (w / box.w - 1) / 2, y: (h / box.h - 1) / 2 },
  };
}

/* ---------------------------------------------------------------- the packing */

/**
 * Where in the rise the burst peaks, as a fraction of its twelve frames.
 *
 * 0.58 puts the peak on frame seven, which leaves five to get dark in. A burst
 * is played straight through and clamped — see `ultBurstTexture` — so frame
 * twelve is what the card is left wearing, and it has to be nothing.
 */
const BURST_PEAK = 0.58;

/**
 * The twelve of the source's frames a sheet is cut from.
 *
 * Evenly, for a loop: twelve of twenty-five spread across the clip, so the
 * sheet holds the whole cycle rather than the first half of it.
 *
 * **A burst is re-timed instead, and it has to be.** Wan builds — the header of
 * tools/gen-card-auras.mjs says so about its seeding, and the burst clips are
 * the receipt: asked in as many words to erupt, peak, and dissipate into black
 * by the end, every one of them instead climbs steadily and is at its loudest
 * on the last frame. Twelve of those spread evenly is a burst that ends at full
 * blast, and since the runtime clamps there, the tap would leave the card lit.
 *
 * So the rise is walked up to `BURST_PEAK` and then back down to the clip's own
 * first frame, which is the darkest thing in it. What comes out is an eruption
 * that arrives, peaks, and recedes — the shapes on the way down are the shapes
 * on the way up, which on a collapsing flame is what receding looks like. The
 * fall is given fewer frames than the rise because that is how fire behaves and
 * because the peak wants to land before the middle of the sheet, where the
 * cut-in's own arc puts the medallion. See GATE in src/fx/cutin.js.
 */
function picks(files) {
  const last = files.length - 1;
  if (!BURST) {
    return Array.from(
      { length: COUNT },
      (_, i) => files[Math.round((i * last) / (COUNT - 1))],
    );
  }
  const up = Math.max(1, Math.round((COUNT - 1) * BURST_PEAK));
  return Array.from({ length: COUNT }, (_, i) =>
    i <= up
      ? files[Math.round((i * last) / up)]
      : files[Math.round(((COUNT - 1 - i) * last) / (COUNT - 1 - up))],
  );
}

/**
 * The line's own rectangle, in a flare frame, and the one place on this shelf
 * where the pads are asserted rather than measured.
 *
 * `measure` finds the border by taking the minimum of the twelve frames, on the
 * argument that the effect moves and the line does not, so whatever is lit in
 * all twelve is the line. That argument holds for a border sheet and collapses
 * for a flare one. A flare effect is dense enough to be lit against every inch
 * of the rim in every frame, so the minimum is the line *plus* however much
 * effect never went dark, and the half-maximum crossings of that land out in
 * the effect. Measured that way the six disagreed by 0.22 of a pad — water read
 * 414 wide where nature read 304 — and 0.22 of a pad is the border's light
 * drawn a fifth of a card away from the card.
 *
 * 304 by 608 is not a guess: it is tools/pack-card-auras.mjs's `CARD_W` and
 * `CARD_H` plus its `CARD_LINE`, the line being centred on the card's edge. The
 * numbers are duplicated here for the reason pack-invokers-fx.mjs duplicates
 * the spell grid — importing that file runs it — and the duplication is
 * checked rather than trusted: the measurement still runs, and a drift of more
 * than a pixel or two says the shelf was packed at another margin and prints.
 */
const FLARE_LINE_W = 304;
const FLARE_LINE_H = 608;

/** The asserted flare geometry, with the measurement kept as a check. */
function flareBox(w, h, measured) {
  const box = {
    x: (w - FLARE_LINE_W) / 2,
    y: (h - FLARE_LINE_H) / 2,
    w: FLARE_LINE_W,
    h: FLARE_LINE_H,
  };
  const off = Math.max(
    Math.abs(measured.box.w - FLARE_LINE_W),
    Math.abs(measured.box.h - FLARE_LINE_H),
  );
  return {
    box,
    off,
    pad: { x: (w / box.w - 1) / 2, y: (h / box.h - 1) / 2 },
  };
}

function pack(element, take) {
  const dir = join(SHELF, element, `${element}-v${take}`);
  if (!existsSync(dir)) {
    console.log(`  ${element}: no take v${take} on the shelf, skipped`);
    return null;
  }
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".png"))
    .sort()
    .map((f) => join(dir, f));
  if (files.length < COUNT) {
    console.log(`  ${element}: ${files.length} frames, skipped`);
    return null;
  }

  const chosen = picks(files);
  const { w, h } = sizeOf(chosen[0]);
  const cellH = Math.round((CELL_W * h) / w);
  const measured = measure(chosen);
  const { box, pad, off } = FLARE ? flareBox(w, h, measured) : measured;

  // Through a scratch folder, because ffmpeg tiles a numbered sequence and the
  // twelve are not consecutive in the source.
  const tmp = join(TMP, element);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  chosen.forEach((f, i) =>
    cpSync(f, join(tmp, `${String(i + 1).padStart(2, "0")}.png`)),
  );

  mkdirSync(OUT_DIR, { recursive: true });
  const out = join(
    OUT_DIR,
    `ult-${BURST ? "burst-" : ""}${element}.${PNG ? "png" : "webp"}`,
  );
  run([
    "-i",
    join(tmp, "%02d.png"),
    "-vf",
    `scale=${CELL_W}:${cellH}:flags=lanczos,tile=${COLS}x${COUNT / COLS}`,
    "-frames:v",
    "1",
    // rgb24 on the PNG side, and that is half of what makes it a reference
    // rather than a second copy: libwebp takes the same frames to yuv420p, so
    // the shipped sheet is subsampled chroma as well as lossy — and on a border
    // that is one saturated hue against black, the subsampling is the half of
    // the loss a quality sweep never shows.
    ...(PNG
      ? ["-c:v", "png", "-pix_fmt", "rgb24", "-pred", "mixed"]
      : ["-c:v", "libwebp", "-quality", String(QUALITY)]),
    "-compression_level",
    PNG ? "9" : "6",
    out,
  ]);
  rmSync(tmp, { recursive: true, force: true });

  const size = statSync(out).size;
  console.log(
    `  ${element}-v${take}: border ${box.w}x${box.h} at ${box.x},${box.y} of ` +
      `${w}x${h} -> ${rel(out)} ${COLS}x${COUNT / COLS} ${CELL_W}x${cellH} ${kb(size)}` +
      // Under `--flare` the box is asserted, so what the measurement made of
      // the same frames is worth having on screen: a couple of pixels is the
      // effect sitting on the line, and anything larger says the shelf moved.
      (off === undefined ? "" : `  (measured off by ${off}px)`),
  );
  return { element, take, size, pad, cellH, frames: chosen, box };
}

/* ----------------------------------------------------------------- the proof */

/** What the proof composites onto: the arena at its darkest. */
const PROOF_BG = [26, 18, 34];
/** ...and HeroCard's own `bg` fill under the portrait. */
const PROOF_CARD = [18, 11, 30];
/** The card, in points, at the aspect core/layout.js holds every card to. */
const PROOF_CARD_W = 168;
const PROOF_ASPECT = 0.48;
/** art/cardframe.js's line and radius, and the height they are measured at. */
const FRAME_BOX_H = 260;
const FRAME_BORDER = 6.11;
const FRAME_RADIUS = 4;

/**
 * The card as the game draws it, with one frame of the border laid on it.
 *
 * The point of it is the one thing that cannot be checked by reading the pads:
 * whether the line baked into the file lands on the line the game draws. So the
 * card under it is not a mock-up — it is HeroCard's own fill, at the layout's
 * own aspect, with art/cardframe.js's border drawn at that file's own weight
 * and radius, and the aura sized by exactly the arithmetic fitUltBorder does.
 * If the two lines are one line, the pads are right.
 *
 * The border is drawn from a signed distance rather than nine-sliced off
 * outline.webp, the way tools/pack-card-auras.mjs draws the same rectangle: a
 * proof needs the geometry the slice produces, not the slice.
 */
function proof(packed) {
  const cardW = PROOF_CARD_W;
  const cardH = Math.round(cardW / PROOF_ASPECT);
  const k = cardH / FRAME_BOX_H;
  const auraW = Math.round(cardW * (1 + 2 * packed.pad.x));
  const auraH = Math.round(cardH * (1 + 2 * packed.pad.y));
  const W = auraW + 48;
  const H = auraH + 48;

  const px = new Float32Array(W * H * 3);
  for (let i = 0; i < W * H; i++)
    for (let c = 0; c < 3; c++) px[i * 3 + c] = PROOF_BG[c];

  // The card: its fill, then its border, both on the rounded rectangle the
  // frame's own radius describes.
  const hw = cardW / 2;
  const hh = cardH / 2;
  const r = FRAME_RADIUS * k;
  const line = FRAME_BORDER * k;
  const colour = ELEMENTS.find((e) => e.id === packed.element).color;
  const tint = [(colour >> 16) & 255, (colour >> 8) & 255, colour & 255];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const qx = Math.abs(x + 0.5 - W / 2) - (hw - r);
      const qy = Math.abs(y + 0.5 - H / 2) - (hh - r);
      const d =
        Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
        Math.min(Math.max(qx, qy), 0) -
        r;
      const i = (y * W + x) * 3;
      // Inside the card, and then inside the border's own run of it.
      const inside = Math.min(1, Math.max(0, 0.5 - d));
      const onLine = Math.min(
        1,
        Math.max(0, 0.5 - Math.abs(d + line / 2) + line / 2),
      );
      for (let c = 0; c < 3; c++) {
        const fill = PROOF_CARD[c] * inside + px[i + c] * (1 - inside);
        px[i + c] = tint[c] * onLine + fill * (1 - onLine);
      }
    }
  }

  // And the aura over it, added, exactly as the card adds it.
  const frame = packed.frames[Math.floor(COUNT / 3)];
  const art = decodeRgb(frame, auraW, auraH);
  const ox = ((W - auraW) / 2) | 0;
  const oy = ((H - auraH) / 2) | 0;
  for (let y = 0; y < auraH; y++) {
    for (let x = 0; x < auraW; x++) {
      const s = (y * auraW + x) * 3;
      const d = ((y + oy) * W + (x + ox)) * 3;
      for (let c = 0; c < 3; c++)
        px[d + c] = Math.min(255, px[d + c] + art[s + c]);
    }
  }

  const buf = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H * 3; i++) buf[i] = px[i] | 0;
  const file = join(SHELF, `${packed.element}-ult-proof.png`);
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
      file,
    ],
    { input: buf },
  );
  console.log(`  proof  ${rel(file)}  ${W}x${H}`);
}

/* ------------------------------------------------------------------- the run */

if (!existsSync(SHELF)) {
  console.log(`nothing on the shelf: ${rel(SHELF)}`);
  console.log(
    "run: node tools/gen-card-auras.mjs && node tools/pack-card-auras.mjs --border",
  );
  process.exit(0);
}

const wantProof = process.argv.includes("--proof");

/**
 * Any element named on the command line narrows the run to it, with or without
 * a take — `water` repacks water's pick, `water=2` repacks it from take 2. The
 * shelf's own packer takes an element the same way, and the reason is the same:
 * these are ffmpeg runs over hundreds of PNGs, and picking a take is a loop of
 * repacking one file and looking at it.
 */
const only = [];
for (const arg of process.argv.slice(2)) {
  if (arg.startsWith("--")) continue;
  const [id, take] = arg.split("=");
  if (!(id in TAKES)) {
    console.log(`unknown element: ${id}`);
    process.exit(1);
  }
  if (take) TAKES[id] = Number(take);
  only.push(id);
}

// In config.js's own order, which is the order every table in the game is in.
const order = ELEMENTS.map((e) => e.id).filter(
  (id) => id in TAKES && (!only.length || only.includes(id)),
);
console.log(`${order.length} border(s):`);

const packed = [];
for (const id of order) {
  const one = pack(id, TAKES[id]);
  if (one) packed.push(one);
}
rmSync(TMP, { recursive: true, force: true });
if (wantProof) for (const one of packed) proof(one);

const total = packed.reduce((n, p) => n + p.size, 0);
console.log(`${kb(total)} of sheets in ${rel(OUT_DIR)}`);

if (!packed.length) process.exit(0);

// The transcript src/art/ultborder.js holds. One pair for all six files, so a
// set whose takes disagree about where the border sits is a set that cannot be
// laid out by one module — which is worth saying loudly rather than averaging.
//
// Some disagreement is the measurement rather than the art: the six masks are
// one mask, but a take with glow pooling under its bottom edge in every frame
// measures a pixel or two tall even at the 90th percentile. A pixel of 688 is
// 0.0007 of a pad, which on a card is a third of a point — so the threshold is
// set above that noise and below anything that would land the light off the
// line. A real disagreement is tens of pixels: a shelf repacked at another
// CARD_MARGIN, or a file from the halo folder in with the border set.
const spread = (axis) =>
  Math.max(...packed.map((p) => p.pad[axis])) -
  Math.min(...packed.map((p) => p.pad[axis]));
const mean = (axis) =>
  packed.reduce((n, p) => n + p.pad[axis], 0) / packed.length;
console.log(
  `\nsrc/art/ultborder.js: cols ${COLS}, count ${COUNT}, ` +
    `cell ${CELL_W}x${packed[0].cellH}`,
);
console.log(
  `  padX ${mean("x").toFixed(4)}  padY ${mean("y").toFixed(4)}` +
    (Math.max(spread("x"), spread("y")) > 0.004
      ? `  — WARNING: the six disagree by ` +
        `${spread("x").toFixed(4)}/${spread("y").toFixed(4)}; one of these takes` +
        ` was packed against another margin`
      : ""),
);
