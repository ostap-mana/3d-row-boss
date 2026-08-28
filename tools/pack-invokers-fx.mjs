/**
 * Pack Invokers Titan Legacy's particle flipbooks into the sheets this game plays.
 *
 *   node tools/pack-invokers-fx.mjs                 # every id below
 *   node tools/pack-invokers-fx.mjs water claw      # just these
 *   node tools/pack-invokers-fx.mjs --strip         # also write a contact strip
 *
 * Reads `src/source/fx/invokers/*.png`, writes `src/assets/fx/<id>-sheet.webp`,
 * on exactly the grid tools/pack-spells.mjs writes: five columns, ten frames, a
 * 224 cell with two pixels of pad. `art/spells.js` globs that folder and
 * hardcodes the grid, so a sheet appears in the game the moment it is written —
 * which is the whole reason this tool exists rather than a second player.
 *
 * ## What these files are
 *
 * Unity particle flipbooks, and the build labels its own grid in the filename:
 * `T_FX_Electricity_1_1_4x4_A` is four columns by four rows, sixteen frames.
 * That label is the only reliable source for the grid and this tool reads it
 * rather than guessing from the aspect, which is wrong as often as it is right —
 * plenty of them are packed into a 1024x512.
 *
 * ## They arrive with no colour at all
 *
 * Every one of them is a white shape on black. That is not a compression
 * artefact, it is how a particle system uses them: the mask is the shape and the
 * colour comes from the emitter at runtime, so one smoke puff serves a dozen
 * different effects. Nothing in this project tints a sheet — `fx/vfx.js` sets a
 * tint on the lead glow and never on the drawing, because the sheets it was
 * written for are painted clips that carry their own colour — so the colour has
 * to be baked here.
 *
 * `ramp` is what bakes it. The mask drives a two-stop ramp: up to `CORE` of full
 * it reads as the element's own colour, and past that it burns out to white, so
 * the dense middle of a bolt goes hot the way a painted one does instead of
 * staying a flat wash of blue. Multiplied by the mask again at the end, which is
 * what keeps the thin edges dark and stops the whole cell lifting off black.
 *
 * ## Black in, no alpha out
 *
 * Same trade the painted sheets make, for the same reason: these are played with
 * the `add` blend, so the backdrop does not need cutting away, it needs to land
 * on zero. `FLOOR` crushes what the ramp leaves behind — a mask stored as RGB on
 * black still has a few levels of grey in its dead corners, and additive light
 * turns those into a grey square hanging over the arena.
 */

import { execFileSync } from "node:child_process";
import { resolve, dirname, join, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, statSync, readdirSync } from "node:fs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = "src/source/fx/invokers";

/**
 * The grid, copied from tools/pack-spells.mjs rather than imported from it.
 *
 * That file is a script before it is a module -- importing it runs its main
 * body, which looks for the generated clips and exits when they are not on disk
 * -- so taking `COLS` and `COUNT` off it would make this tool depend on a
 * folder it never reads. The numbers are duplicated and the contract is not:
 * art/spells.js hardcodes this same grid a third time, and all three have to
 * agree or a sheet is cut into the wrong cells.
 */
const COLS = 5;
const COUNT = 10;
const CELL = 224;
const PAD = 2;

/** Everything at or under this on a channel is backdrop and becomes zero. */
const FLOOR = 10;

/** Fraction of full mask at which the colour starts burning out to white. */
const CORE = 0.72;

/**
 * How white the very densest pixel is allowed to go.
 *
 * This has to be capped and the first cut of these sheets is why. Half the
 * library is a solid white blob -- a smoke puff is opaque almost everywhere, not
 * a soft gradient -- so a burnout that reaches full white at a full mask turns
 * the whole shape white and the element colour survives only in the feathered
 * rim. Water and lightning came out right and wind, slam and arcane came out as
 * grey clouds with a coloured edge.
 *
 * At 0.5 the densest core is half way to white, which is the hot middle a
 * painted effect has, and every one of them still reads as its own colour from
 * across the screen. The burn is a highlight on the colour, not a replacement
 * for it.
 */
const BURN = 0.5;

/** libwebp quality. 80 is what the painted sheets use. */
const QUALITY = 80;

/**
 * Which flipbook plays which effect, and what colour it is baked in.
 *
 * The five element colours are `GEM_COLORS` from src/config.js — the gem the
 * hero charges off is the light his ultimate arrives in, and that was already
 * true of the beam these replace. The boss's three are its own: they are lit by
 * the thing swinging rather than by an element.
 *
 * Sources were picked by playing every flipbook in the build out as a strip and
 * watching the motion, not by name. What they all share is the shape the player
 * needs: something gathering, a peak, and a dissipation — `fx/vfx.js` walks
 * frames 0..4 along the throw and 5..9 where it lands, and a loop or a flat
 * cycle would read as neither half.
 */
const JOBS = [
  {
    id: "water",
    src: "T_FX_Liquid_1_1_3x3.png",
    color: 0x2fa8ff,
    what: "a bead that swells and bursts into droplets",
  },
  {
    id: "nature",
    src: "T_FX_Liquid_7_2_3x3.png",
    color: 0x3fd16a,
    what: "a thicker splat, which reads as sap rather than water once it is green",
  },
  {
    id: "lightning",
    src: "T_FX_Electricity_1_1_4x4_A.png",
    color: 0xffd22e,
    what: "a crackling web that closes and shatters",
  },
  {
    id: "arcane",
    src: "T_FX_Electricity_9_1_4x4.png",
    color: 0xa855f7,
    what: "a single jagged bolt, tighter than the web and better alone in violet",
  },
  {
    id: "wind",
    src: "T_FX_Smoke_15_1_4x4.png",
    color: 0x8ceee2,
    what: "a puff blooming and shearing apart",
  },
  {
    id: "breath",
    src: "T_FX_Fire_22_1_4x4.png",
    color: 0xff7a2a,
    what: "a plume licking up and breaking — the boss's cone",
  },
  {
    id: "slam",
    src: "T_FX_Smoke_4_1_4x4_A.png",
    color: 0xffb060,
    what: "a heavy billow off the deck — the boss's shock ring",
  },
  {
    id: "claw",
    src: "T_FX_Glow_Flash_11_1_4x4.png",
    color: 0xff4a3a,
    what: "two crossing streaks that fan and fade — the only rake in the library",
  },
  {
    /*
     * The gem pop, and the one job here that keeps its mask.
     *
     * `color: null` leaves the flipbook grey, because this one is tinted at
     * runtime and the others cannot be: a spell has one colour and there are
     * six gems, so baking this would be six copies of the same starburst. It
     * pays for the tint with the burnout — a white core multiplied by a tint is
     * the tint, so the hot middle the baked sheets get is gone — and on a mark
     * the size of a gem there was never room to see it.
     *
     * Off the spell grid too, and out from under `art/spells.js`'s glob: the
     * name has no `-sheet` in it precisely so that glob does not find it. A gem
     * is forty points across where an ultimate is four hundred, and a 224 cell
     * for it would be twenty times the pixels the screen ever asks for.
     */
    id: "gem-pop",
    src: "T_FX_Glow_Flash_11_2_4x4.png",
    color: null,
    cell: 96,
    out: "src/assets/fx/gem-pop.webp",
    what: "a starburst that flashes out on spikes and collapses to a ring",
  },
];

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
    { maxBuffer: 1 << 30 },
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
    { input: buf, maxBuffer: 1 << 30 },
  );
}

/* ---------------------------------------------------------------- flipbooks */

/**
 * Columns and rows, read off the filename the build gave the texture.
 *
 * `_4x4_A` and `_3x3` and `_2x6_Projectile` all appear; the grid is the last
 * `NxM` in the name and whatever follows it is a variant tag.
 */
function grid(name) {
  const all = [...name.matchAll(/_([1-9])x([1-9])(?![0-9])/g)];
  if (!all.length) throw new Error(`${name}: no NxM grid in the filename`);
  const m = all[all.length - 1];
  return { cols: Number(m[1]), rows: Number(m[2]) };
}

/**
 * The mask, as one value per pixel.
 *
 * Luminance times alpha, because the library stores these both ways: some
 * carry the shape in an alpha channel over white, some are grey on opaque
 * black, and a couple are both. Multiplying costs nothing on the ones that are
 * only one of the two and gets the other kind right.
 */
function mask(px, i) {
  const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
  return (l * px[i + 3]) / (255 * 255);
}

/** Element colour under the mask, burning out to white through `CORE`. */
function ramp(m, r, g, b) {
  const hot = m <= CORE ? 0 : ((m - CORE) / (1 - CORE)) * BURN;
  const k = m * 255;
  return [
    Math.min(255, Math.round((r + (255 - r) * hot) * m * (k > FLOOR ? 1 : 0))),
    Math.min(255, Math.round((g + (255 - g) * hot) * m * (k > FLOOR ? 1 : 0))),
    Math.min(255, Math.round((b + (255 - b) * hot) * m * (k > FLOOR ? 1 : 0))),
  ];
}

/** Box-average one source cell down into a `cell`-square tile of the sheet. */
function tile(px, sw, cx, cy, side, color, out, ow, ox, oy, cell) {
  // A null colour means leave it a mask: white through the ramp, tinted later.
  const r = color === null ? 255 : (color >> 16) & 255;
  const g = color === null ? 255 : (color >> 8) & 255;
  const b = color === null ? 255 : color & 255;
  const CELL = cell;

  for (let y = 0; y < CELL; y++) {
    const sy0 = cy + Math.floor((y * side) / CELL);
    const sy1 = Math.max(sy0 + 1, cy + Math.floor(((y + 1) * side) / CELL));
    for (let x = 0; x < CELL; x++) {
      const sx0 = cx + Math.floor((x * side) / CELL);
      const sx1 = Math.max(sx0 + 1, cx + Math.floor(((x + 1) * side) / CELL));

      let sum = 0;
      let n = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        for (let sx = sx0; sx < sx1; sx++) {
          sum += mask(px, (sy * sw + sx) * 4);
          n++;
        }
      }
      const [cr, cg, cb] = ramp(n ? sum / n : 0, r, g, b);
      const o = ((oy + y) * ow + ox + x) * 4;
      out[o] = cr;
      out[o + 1] = cg;
      out[o + 2] = cb;
      out[o + 3] = 255;
    }
  }
}

/* --------------------------------------------------------------------- main */

const argv = process.argv.slice(2);
const flags = new Set(argv.filter((a) => a.startsWith("--")));
const only = new Set(argv.filter((a) => !a.startsWith("--")));
const kb = (file) => (statSync(file).size / 1024).toFixed(1);

mkdirSync(join(ROOT, "src/assets/fx"), { recursive: true });

const present = new Set(readdirSync(join(ROOT, SRC_DIR)));
const rowsOut = Math.ceil(COUNT / COLS);

for (const job of JOBS) {
  if (only.size && !only.has(job.id)) continue;
  if (!present.has(job.src)) {
    console.log(
      `${job.id.padEnd(10)} skipped — ${SRC_DIR}/${job.src} is not here`,
    );
    continue;
  }

  const source = join(ROOT, SRC_DIR, job.src);
  const out = join(ROOT, job.out || `src/assets/fx/${job.id}-sheet.webp`);
  const cell = job.cell || CELL;
  const cellOut = cell + PAD * 2;

  const info = probe(source);
  const px = decode(source);
  const { cols, rows } = grid(basename(job.src));
  const cw = Math.floor(info.w / cols);
  const ch = Math.floor(info.h / rows);
  const side = Math.min(cw, ch);
  const have = cols * rows;

  const sheetW = cellOut * COLS;
  const sheetH = cellOut * rowsOut;
  const sheet = Buffer.alloc(sheetW * sheetH * 4);
  for (let i = 3; i < sheet.length; i += 4) sheet[i] = 255;

  for (let f = 0; f < COUNT; f++) {
    // Evenly across whatever the flipbook has, first frame to last, the same
    // spread pack-spells.mjs takes across a decoded clip.
    const s = Math.round((f * (have - 1)) / (COUNT - 1));
    // Centred in its cell: a 1024x512 packed 4x2 has square cells, but a couple
    // in the library do not and the sheet's cells are square whatever happens.
    const cx = (s % cols) * cw + ((cw - side) >> 1);
    const cy = Math.floor(s / cols) * ch + ((ch - side) >> 1);
    tile(
      px,
      info.w,
      cx,
      cy,
      side,
      job.color,
      sheet,
      sheetW,
      (f % COLS) * cellOut + PAD,
      Math.floor(f / COLS) * cellOut + PAD,
      cell,
    );
  }

  if (flags.has("--strip")) {
    encode(sheet, sheetW, sheetH, out.replace(/\.webp$/, ".png"));
  }
  encode(sheet, sheetW, sheetH, out, [
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
  ]);

  console.log(
    `${job.id.padEnd(10)} ${basename(job.src).padEnd(30)}` +
      ` ${cols}x${rows}=${String(have).padStart(2)} frames -> ${COUNT}` +
      `  ${job.color === null ? "mask  " : "#" + job.color.toString(16).padStart(6, "0")}` +
      `  ${sheetW}x${sheetH}  ${kb(out).padStart(6)} kB`,
  );
}
