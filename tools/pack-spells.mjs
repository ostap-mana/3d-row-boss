/**
 * Cut the clips from `tools/gen-spells.mjs` into sheets the game can play.
 *
 *   node tools/pack-spells.mjs                # every clip on disk
 *   node tools/pack-spells.mjs water slam     # just these
 *   node tools/pack-spells.mjs --contact      # also write a strip to flick through
 *   node tools/pack-spells.mjs water --start 0.9 --span 1.4   # retime one
 *
 * Reads `src/source/fx/clips/<id>.mp4`, writes `src/assets/fx/<id>-sheet.webp`.
 * `src/art/spells.js` picks those up by globbing the folder, so a sheet appears
 * in the game the moment it is written and nothing has to be wired up by hand.
 *
 * ## The one rule every sheet here obeys
 *
 * **Identical geometry.** Same cell, same count, same column order, every time,
 * for every id. `art/spells.js` hardcodes the grid exactly the way `art/fire.js`
 * hardcodes its own, and it can only do that because this tool refuses to vary
 * it. If a clip comes back a different size it is cropped and resampled to the
 * same cell as all the others rather than packed at its own size. The one sheet
 * in the build that does not obey this is the fire ultimate, which was cut off a
 * still by tools/pack-fire.mjs long before any of this existed and keeps its own
 * module and its own grid.
 *
 * ## Black in, no alpha out
 *
 * Same trade as the fire sheet, for the same reason: these are played with the
 * `add` blend, so the backdrop does not need cutting away — it needs to land on
 * zero. The clips are generated on black, so most of that is free. What is not
 * free is the codec: h264 does not leave black alone, and a flat black field
 * comes back as a very dark mush that adds a grey wash over the arena. `FLOOR`
 * below is what clamps that back to nothing, and it is the single most important
 * number in this file.
 *
 * ## Where the time window comes from
 *
 * A five second clip holds about a second and a half worth of usable effect, and
 * which second and a half differs per clip — the model spends a variable run-up
 * before anything happens. So each id carries its own window, read off the clip
 * with `--contact` the same way pack-fire.mjs read its boxes off the page by
 * eye. The defaults below are a starting guess, not a measurement: regenerate a
 * clip and the window almost certainly needs nudging again.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLIPS = join(ROOT, "src/source/fx/clips");
const OUT_DIR = join(ROOT, "src/assets/fx");

/* ------------------------------------------------------------- the grid */

/**
 * The grid, which `src/art/spells.js` mirrors and must be kept in step with.
 *
 * Ten frames in two rows of five. For a mage ultimate the split is down the
 * middle — 0..4 are the bolt in flight, 5..9 are it landing — which is the same
 * shape the fire sheet has, so the player that already exists can drive both.
 */
export const COLS = 5;
export const COUNT = 10;

/**
 * Cell size, and with it the whole of the file-size budget.
 *
 * The build is one self-contained index.html and every byte in `src/assets` is
 * inlined as base64, which costs a further third on top. That is the number to
 * watch: the bundle is already about 1.72 MB, Google and Unity allow 5 MB, and
 * **Meta allows 2 MB**, which is roughly 220 kB of headroom once base64 is paid.
 *
 * Eight sheets at this cell should land inside that. The total is printed at the
 * end of every run for exactly that reason — if it comes back too big, this
 * number and `QUALITY` are the two levers, in that order. Cutting frames is the
 * last resort, because `art/spells.js` hardcodes the count.
 *
 * Nothing here is on screen for more than about three quarters of a second, and
 * most of it is moving fast while it is.
 */
const CELL = 224;

/** Slack around the frame in the cell, so a bilinear sample cannot bleed. */
const PAD = 2;

/**
 * Everything at or under this on a channel is backdrop and becomes zero.
 *
 * Read off the corners of a decoded clip rather than guessed: h264 at 480p
 * leaves black sitting around 8-12 with slow blotches through it, and left in,
 * every cell adds a dim rectangle over the arena that is plainly visible against
 * the dark board. Raised too far and the outer glow of the effect goes with it,
 * which is why `--contact` prints on the arena's own ground colour.
 */
const FLOOR = 16;

/** libwebp quality. 82 is what the fire sheet uses. */
const QUALITY = 80;

/* ------------------------------------------------------------- the windows */

/**
 * Per clip: where the usable effect starts, and how long a slice to take.
 *
 * `gain` multiplies the frame after the floor is subtracted, for the clips that
 * come back underexposed. 1 is untouched.
 */
const DEFAULT_WINDOW = { start: 0.6, span: 1.6, gain: 1 };

const WINDOWS = {
  water: { start: 0.6, span: 1.7 },
  nature: { start: 0.6, span: 1.7 },
  lightning: { start: 0.5, span: 1.5 },
  wind: { start: 0.6, span: 1.7 },
  arcane: { start: 0.6, span: 1.7 },
  breath: { start: 0.7, span: 1.8 },
  slam: { start: 0.5, span: 1.5 },
  claw: { start: 0.5, span: 1.5 },
};

/* ------------------------------------------------------------------- ffmpeg */

/** Repo-relative, forward slashes, for the log lines. */
const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");

function probe(file) {
  const out = execFileSync(
    "ffprobe",
    [
      "-v",
      "error",
      "-select_streams",
      "v:0",
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
 * Decode one window of the clip to raw frames.
 *
 * `-ss` before `-i` so the seek is done on keyframes and the decode is short;
 * the window is a second or two out of five and decoding all of it to pick ten
 * frames would be most of the runtime of this tool.
 */
function decodeWindow(file, start, span) {
  return execFileSync(
    "ffmpeg",
    [
      "-v",
      "error",
      "-ss",
      String(start),
      "-t",
      String(span),
      "-i",
      file,
      "-f",
      "rawvideo",
      "-pix_fmt",
      "rgba",
      "-",
    ],
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
      w + "x" + h,
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

/* --------------------------------------------------------------- the cut */

/**
 * One clip to one sheet.
 *
 * The square crop is taken from the middle of the frame, because every prompt in
 * gen-spells.mjs asks for the effect centred and a clip that ignored that is a
 * clip to regenerate, not one to re-crop. Down to the cell by box filter: a
 * nearest sample on a spark field turns it into confetti that crawls between
 * frames, which is the one artefact the eye catches even at this speed.
 */
function pack(id, file, opts) {
  const win = { ...DEFAULT_WINDOW, ...(WINDOWS[id] || {}), ...opts };
  const info = probe(file);
  const px = decodeWindow(file, win.start, win.span);

  const frameBytes = info.w * info.h * 4;
  const have = Math.floor(px.length / frameBytes);
  if (have < COUNT) {
    throw new Error(
      "window holds " + have + " frames, need " + COUNT + " (widen --span)",
    );
  }

  // The square the effect lives in, centred.
  const side = Math.min(info.w, info.h);
  const cx = ((info.w - side) / 2) | 0;
  const cy = ((info.h - side) / 2) | 0;

  const cell = CELL + PAD * 2;
  const rows = Math.ceil(COUNT / COLS);
  const sheetW = cell * COLS;
  const sheetH = cell * rows;
  const out = Buffer.alloc(sheetW * sheetH * 4);
  for (let i = 3; i < out.length; i += 4) out[i] = 255;

  for (let f = 0; f < COUNT; f++) {
    // Evenly across the window, ends included, so the last frame is the end of
    // the effect and not wherever the modulo happened to land.
    const src = Math.round((f * (have - 1)) / (COUNT - 1));
    const base = src * frameBytes;
    const ox = (f % COLS) * cell + PAD;
    const oy = Math.floor(f / COLS) * cell + PAD;

    for (let y = 0; y < CELL; y++) {
      const sy0 = cy + Math.floor((y * side) / CELL);
      const sy1 = Math.min(cy + side, cy + Math.floor(((y + 1) * side) / CELL));
      for (let x = 0; x < CELL; x++) {
        const sx0 = cx + Math.floor((x * side) / CELL);
        const sx1 = Math.min(
          cx + side,
          cx + Math.floor(((x + 1) * side) / CELL),
        );
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let sy = sy0; sy < Math.max(sy1, sy0 + 1); sy++) {
          for (let sx = sx0; sx < Math.max(sx1, sx0 + 1); sx++) {
            const s = base + (sy * info.w + sx) * 4;
            r += px[s];
            g += px[s + 1];
            b += px[s + 2];
            n++;
          }
        }
        const dst = ((oy + y) * sheetW + ox + x) * 4;
        out[dst] = clamp((r / n - FLOOR) * win.gain);
        out[dst + 1] = clamp((g / n - FLOOR) * win.gain);
        out[dst + 2] = clamp((b / n - FLOOR) * win.gain);
      }
    }
  }

  return { out, sheetW, sheetH, cell, have, win };
}

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));

/* -------------------------------------------------------------------- main */

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));

/** `--start 0.9` style overrides, which only make sense on a single id. */
const opts = {};
for (const key of ["start", "span", "gain"]) {
  const at = args.indexOf("--" + key);
  if (at >= 0 && args[at + 1]) opts[key] = Number(args[at + 1]);
}
const named = args.filter(
  (a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"),
);

if (!existsSync(CLIPS)) {
  console.error(
    "no clips at " + rel(CLIPS) + " — run tools/gen-spells.mjs first.",
  );
  process.exit(1);
}

const onDisk = readdirSync(CLIPS)
  .filter((f) => f.endsWith(".mp4"))
  .map((f) => f.slice(0, -4));

const unknown = named.filter((n) => !onDisk.includes(n));
if (unknown.length) {
  console.error(
    "no clip for: " +
      unknown.join(", ") +
      "\n  on disk: " +
      (onDisk.join(", ") || "(nothing)"),
  );
  process.exit(1);
}

const wanted = named.length ? named : onDisk;
if (!wanted.length) {
  console.error("no clips at " + rel(CLIPS) + " — run tools/gen-spells.mjs.");
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });
console.log(
  "grid   " + COUNT + " frames, " + COLS + " cols, cell " + CELL + "px\n",
);

let total = 0;
for (const id of wanted) {
  const file = join(CLIPS, id + ".mp4");
  try {
    const { out, sheetW, sheetH, have, win } = pack(id, file, opts);
    const dest = join(OUT_DIR, id + "-sheet.webp");

    // No alpha in, no alpha out: played additively, so the channel would be a
    // flat 255 across half a megapixel for nothing.
    encode(out, sheetW, sheetH, dest, [
      "-c:v",
      "libwebp",
      "-lossless",
      "0",
      "-quality",
      String(QUALITY),
      "-compression_level",
      "6",
      "-preset",
      "picture",
      "-pix_fmt",
      "yuv420p",
    ]);
    const kb = statSync(dest).size / 1024;
    total += kb;
    console.log(
      "out  " +
        id.padEnd(10) +
        rel(dest).padEnd(34) +
        kb.toFixed(1) +
        " kB   " +
        sheetW +
        "x" +
        sheetH +
        "   " +
        win.start +
        "s +" +
        win.span +
        "s of " +
        have +
        " frames",
    );

    // The cut, frame by frame, on the ground it will be played over. A window
    // that opens too early reads here as two or three dead cells at the front.
    if (flags.has("--contact")) {
      const test = Buffer.alloc(sheetW * sheetH * 4);
      for (let i = 0; i < sheetW * sheetH; i++) {
        test[i * 4] = 26;
        test[i * 4 + 1] = 18;
        test[i * 4 + 2] = 30;
        test[i * 4 + 3] = 255;
        for (let c = 0; c < 3; c++) {
          test[i * 4 + c] = Math.min(255, test[i * 4 + c] + out[i * 4 + c]);
        }
      }
      const contact = join(OUT_DIR, id + "-contact.png");
      encode(test, sheetW, sheetH, contact, []);
      console.log("     " + rel(contact));
    }
  } catch (err) {
    console.log("FAIL " + id.padEnd(10) + err.message);
  }
}

console.log("\n     " + total.toFixed(1) + " kB of sheets in total");
if (flags.has("--contact")) {
  console.log(
    "     contact sheets are scratch — delete them before committing.",
  );
}
