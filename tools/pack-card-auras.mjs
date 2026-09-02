/**
 * Turn the generated element textures into animated card auras.
 *
 *   node tools/pack-card-auras.mjs             # the halo shape, all 24
 *   node tools/pack-card-auras.mjs --border    # the card the game draws, all 24
 *   node tools/pack-card-auras.mjs --border water    # one element
 *
 * Reads the clips `tools/gen-card-auras.mjs` left in ComfyUI's output folder,
 * writes into `src/animation/<element>/` — or `src/animation/style-border/
 * <element>/` with `--border`:
 *
 *   <element>-v<N>/frame-01.png ...   all 25 frames, masked and coloured
 *   <element>-v<N>-contact.png        all 25 as one grid — the flicker test
 *   <element>-v<N>.webp               the loop, animated, at IDLE_FPS
 *   <element>-v<N>-sheet.webp         12 frames, 6x2, 200px cells
 *
 * Nothing in `src/animation` is imported by the game. It is a shelf: twenty-four
 * takes per style to choose between, laid out the way the build's own sheets are
 * laid out so that choosing one is the whole of the work left.
 *
 * ## Two styles, one set of clips
 *
 * The clips are frame-filling element textures with no shape in them at all, so
 * the shape is entirely this file's, and there are two of them — see `STYLE`.
 * `halo` masks against the soft glow the creative already ships; `--border`
 * draws the sharp rectangle the *game* wears, measured off
 * `assets/cards/outline.webp`. Switching between them costs a repack, not half
 * an hour of GPU.
 *
 * ## The compositing
 *
 * Two steps. The clip decides *where and how much*; the palette decides *what
 * colour*. The model's own colour is thrown away entirely.
 *
 *   band = the style's shape          where the element is allowed to show
 *   g    = lift(luma(texture)) * band the element, animated
 *   a    = max(g, hold)               plus what stays lit regardless
 *   out  = colour * a + white * hot
 *
 * **The mask is the geometry, and it is the game's own** in both styles — the
 * halo from `src/source/cards/aura-sheet.png` by the same crop
 * `pack-card-aura.mjs` makes, the border from the four measurements off
 * `outline.webp`. So an aura lines up with a card because it was always lined up
 * with a card, and no model had a say in it.
 *
 * **The multiply is what makes all four sides equal.** Asked directly for fire
 * around a rectangle, the model puts it along the top and lets it thin out at
 * the bottom, because fire rises and it knows that — see gen-card-auras.mjs. A
 * mask does not know that.
 *
 * **The colour is GEM_COLORS', not the model's.** `colour * a + white * hot` is
 * the element's own entry where the effect is dim and white where it is hot,
 * which is what every aura in the build looks like. Taking only the luminance
 * out of the clip is what makes that possible: this model's fire comes back
 * with green smoke in it and its water comes back teal, and neither is an
 * element in config.js. It is the same trade `pack-card-aura.mjs` makes when it
 * flattens the still aura to white — that one lets the *game* tint at runtime,
 * because one still serves six cards. These are six clips, so the tint is baked
 * and each element gets a shape of its own.
 *
 * ## Black in, no alpha out
 *
 * Same as tools/pack-spells.mjs, for the same reason: these go on with the
 * `add` blend, so the backdrop does not need cutting away — it needs to land on
 * zero. Unlike the spell clips there is no h264 in the way, so the floor is
 * doing almost nothing: the frames come out of the VAE as PNG and the corners
 * measure 1.15 mean, 4 max.
 *
 * ffmpeg decodes and encodes; the arithmetic is here, in the same place and for
 * the same reason as in pack-spells.mjs.
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
import { resolve, dirname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ELEMENTS } from "./gen-card-auras.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AURA_SHEET = join(ROOT, "src/source/cards/aura-sheet.png");
const TMP = join(ROOT, "src/animation/.tmp");

/**
 * Where gen-card-auras.mjs left the clips.
 *
 * ComfyUI's own output folder rather than anywhere in this repo, because that
 * is where its SaveImage node writes and pointing it elsewhere is a per-install
 * setting. Override with COMFYUI_OUTPUT on a machine that keeps it somewhere
 * else.
 */
const CLIPS = join(
  process.env.COMFYUI_OUTPUT ||
    "C:/Users/Yonix/AppData/Local/Comfy-Desktop/ComfyUI-Installs/ComfyUI/ComfyUI/output",
  "aura",
);

/* ----------------------------------------------------------------- the styles */

/**
 * Two shapes for the same clips, and the shape is the whole difference.
 *
 * `halo` is the soft rectangle the creative already ships: the flux glow behind
 * `assets/cards/aura-frame.webp`, a hairline with a wide bloom, at 0.52.
 *
 * `border` is the card the game actually draws — `assets/cards/outline.webp`,
 * which is what every hero card in a screenshot of the build is wearing. It is
 * a different thing to the halo and not a variation on it: 7 source pixels of
 * line at 128 wide, a 5px corner radius that reads as square, an aspect of
 * 0.485, and no bloom at all. Against that, an aura is not the border — it is
 * what hangs *outside* the border, and the border itself stays a solid line in
 * the element's own colour. See `borderMask`.
 *
 * The clips do not care. They are frame-filling textures, so the same
 * twenty-four serve both styles and switching costs a repack, not a regenerate.
 */
const STYLE = process.argv.includes("--flare")
  ? "flare"
  : process.argv.includes("--ribbon")
    ? "ribbon"
    : process.argv.includes("--border")
      ? "border"
      : "halo";

/** The styles that wear the drawn card rather than the shipped halo. */
const ON_CARD = STYLE !== "halo";
/** The two that unroll the band around the card instead of reading it flat. */
const UNROLLED = STYLE === "ribbon" || STYLE === "flare";

/** How far outside the lit rectangle the crop reaches, in aura-sheet's pixels. */
const PAD = 64;

/* The halo's canvas is the crop's own size; the border's is the card plus room
   for the aura to hang in. 384x688 puts a 288x592 card — 0.486, which is
   outline.webp's 0.485 — inside a 48px margin on every side. */
/**
 * The card is the same 288x592 in every on-card style; what changes is how much
 * room is left round it for the effect to be in.
 *
 * 48 is a border's margin: a solid line with a glow that dies a few dozen
 * pixels out. `flare` is the style for when a border turns out to be too
 * polite — flame that leaves the card rather than clinging to it — and it
 * cannot be done at 48 whatever the compositing does, because there is nowhere
 * for a lick to go. 104 gives the effect more room than the card has line, and
 * it is what sets the sprite's size at runtime: a flare sheet is drawn about
 * 1.72 cards wide where a border sheet is drawn 1.26.
 */
const CARD_MARGIN = STYLE === "flare" ? 104 : 48;
const CARD_W = 288;
const CARD_H = 592;
const W = STYLE === "flare" ? CARD_W + CARD_MARGIN * 2 : 384;
const H = STYLE === "flare" ? CARD_H + CARD_MARGIN * 2 : ON_CARD ? 688 : 736;

/* The card's line and corner inside that canvas. Both from outline.webp. */
/** 7 of outline.webp's 128 pixels of width, which is 15.75 of this canvas's 288. */
const CARD_LINE = 16;
/** 5 of 128, which is why the corners read as square rather than rounded. */
const CARD_RADIUS = 11;
/** How far the aura reaches outside the line before it is gone, in pixels. */
const GLOW_OUT = Number(
  process.env.AURA_GLOW_OUT ?? (STYLE === "flare" ? CARD_MARGIN - 8 : 16),
);
/**
 * And inside it, which is a quarter of that.
 *
 * Not zero: a border with the glow cut dead at the line looks pasted on. Not
 * more, because everything inside this rectangle is the hero's portrait, and an
 * aura that washes over the face is the thing the shipped card carefully does
 * not do.
 */
const GLOW_IN = Number(process.env.AURA_GLOW_IN ?? (STYLE === "flare" ? 6 : 7));

/* ------------------------------------------------------------ the compositing */

/**
 * Everything under this much of the mask is outside the card and becomes zero.
 *
 * The single most important number here, and the reason is the source: the
 * shipped aura still is a hairline with a bloom that never quite reaches zero,
 * so an unfloored mask lets the element haze across the entire frame and the
 * card stops reading as a card. Swept against 0.06 and 0.03 on a fire clip:
 * 0.02 is the one that still kills the haze and keeps the licks that reach past
 * the rim, which are most of what makes this read as an aura rather than a line.
 */
const FLOOR = Number(process.env.AURA_FLOOR ?? 0.02);
/** How far the mask's falloff is pulled up into the band. Below 1 widens it. */
const SPREAD = Number(process.env.AURA_SPREAD ?? 0.3);
/** How tight the hot rim line under the effect is. Higher is thinner. */
const RIM = Number(process.env.AURA_RIM ?? 3.0);
/** How much of the rim line is left where the texture over it is black. */
const RIM_FLOOR = Number(process.env.AURA_RIM_FLOOR ?? 0.8);
/**
 * The lift on the texture before it is masked, and it is doing most of the work.
 *
 * These clips are sparse: a wall of flame is a few bright tongues and a lot of
 * black, and it looks like a wall because it fills the frame. Cut down to a
 * border a few dozen pixels wide, most of what is left is the black, and the
 * aura comes back as an ember or two travelling around an otherwise dead rim. A
 * gamma this low pulls the whole midrange up and turns a sparse texture into a
 * dense one, which is what a border needs.
 *
 * The border style lifts less. Its band is a sixteen-pixel falloff rather than
 * the halo bloom, so the same lift there does not fill a band, it fills the
 * whole margin, and the card comes back sitting on a sheet of fire instead of
 * wearing one.
 */
const TEX_GAMMA = Number(
  process.env.AURA_TEX_GAMMA ??
    // The ribbon lifts less than the border. Its strip is native pixels rather
    // than a frame stretched over a band, so what reaches the composite already
    // has the clip's own contrast in it, and 0.45 there flattens a rim that
    // 0.45 elsewhere fills.
    // `flare` barely lifts. Its mask is value rather than luma — see
    // `intensity` — so a lit lick already arrives near full, and a lift on top
    // of that only drags the black gaps between the licks up into a wash.
    { halo: 0.35, border: 0.45, ribbon: 0.6, flare: 0.9 }[STYLE],
);
/**
 * Where the brightest of each clip is put, and why there is no fixed gain.
 *
 * The twenty-four textures come back at wildly different exposures — a wall of
 * flame fills the histogram, a swarm of spores is nearly black — and a constant
 * multiplier would give four bright auras and twenty dim ones. So each clip is
 * levelled on its own: the 99th percentile of what lands inside the band, taken
 * across every frame at once, is scaled to here. Across every frame and not per
 * frame, because per frame is an auto-exposure, and an auto-exposure on a
 * flickering effect is a flicker of its own.
 */
const TARGET = Number(process.env.AURA_TARGET ?? 0.95);
/** How far levelling may push a clip, so a black one is not amplified to noise. */
const GAIN_MAX = 6;

/**
 * Where the band is taken to be over, and why only the ribbon needs it said.
 *
 * `borderMask` gives an exponential falloff, which decays and never arrives:
 * forty pixels out from a 16px e-fold it is still 8% lit. Under the other two
 * styles that costs nothing, because what is being multiplied out there is the
 * clip's own black corners. The ribbon has no black corners — every pixel of
 * the canvas reads somewhere in a strip that is bright end to end — so that 8%
 * becomes an even wash across the whole frame, and these sheets are played with
 * the `add` blend. A wash that is barely visible on a contact sheet is a grey
 * rectangle hanging over the arena.
 *
 * So the tail is cut and what is left rescaled: 0.12 of the falloff, which is a
 * touch under 34 pixels of glow, inside the 48 the canvas has to give.
 */
const BAND_FLOOR = Number(
  process.env.AURA_BAND_FLOOR ?? (STYLE === "ribbon" ? 0.12 : 0),
);

/* ------------------------------------------------------------- the ribbon */

/**
 * The strip the `ribbon` style reads instead of the frame, and how it is cut.
 *
 * `border` samples the clip at the pixel it is compositing: the texture and the
 * canvas are the same 384x688, so what lands on the top edge of the card is
 * whatever the model happened to paint along the top of the frame. That is the
 * ceiling on the whole style. A texture is not evenly lit — fire is hot at the
 * bottom because fire rises, and no prompt argues a model all the way out of
 * that — so one edge of the card comes back blown out and the opposite edge
 * comes back dusted. And because a pixel always reads the same place in the
 * texture, nothing ever travels: the border shimmers in place.
 *
 * `ribbon` cuts the link. The band around the card is unrolled into a straight
 * strip — `U` is how far around the perimeter a pixel is, `V` is how far across
 * the band — and the clip is read along *that*, not across the frame. Three
 * things fall out of it, and they are the three the baseline could not do:
 *
 *   **No edge can be dark.** Position around the card no longer means position
 *   in the frame, so there is no bottom for the fire to sink to.
 *
 *   **Light travels.** `SPEED` scrolls the strip along the perimeter frame by
 *   frame, so a bright patch enters at one corner and runs round the card. That
 *   is the thing that reads at the size a card is actually drawn, where 25
 *   pixels of ember detail do not.
 *
 *   **The clip's own axis is put to work.** The strip is the clip *rotated*, so
 *   the texture's vertical is the direction of travel: a clip of flame rising
 *   becomes flame running around the border rather than flame smeared across it.
 *
 * ## The strip is cut, not squeezed
 *
 * The first cut of this resampled the whole frame down to the band — 384 rows
 * of clip averaged into 64 — and it came back smooth. Of course it did: an
 * average of six rows of embers is not embers, it is the mean brightness of
 * embers, and the fire's whole character is in the contrast between a spark and
 * the black beside it. What landed on the card was an even orange rim, cleaner
 * than the baseline and considerably more boring.
 *
 * So nothing is averaged. `SLICE` columns are cropped out of the middle of the
 * frame at native resolution and stood on end, which gives a strip `H` long and
 * `SLICE` across with every pixel the model painted still in it. It uses an
 * eighth of the frame and throws the rest away, and that is the right trade:
 * detail across the band is what the eye reads on a border, and there is no
 * shortage of frames to take it from.
 *
 * One lap is then the clip's own height stretched around a perimeter of about
 * 1750 — see the printout — which is two and a half times. A flame lick lands
 * as a long lick running along the border, which is what it should look like.
 *
 * ## Bristles, and what does not fix them
 *
 * A clip made of small blobs rather than long strands — the runic glyph field,
 * the electric web, the vine mat — comes back as a *furry* border: a dense comb
 * of little spikes standing off it all the way round. It happens because a blob
 * twenty pixels across is half the width of a thirty-nine pixel band, so it
 * cannot read as anything but a tuft, and there is a fresh one every twenty
 * pixels along the rim.
 *
 * Cutting a narrower slice and stretching it across the band was tried and made
 * it worse, which is worth writing down because the reasoning sounds right: a
 * feature stretched to wider than the band should smooth out into a gradient.
 * It does not, because stretching across the band does nothing to how *often*
 * the features come along it. At `SLICE` 16 the spikes were the same comb with
 * longer teeth.
 *
 * What fixes it is the clip. Long strands along the direction of flow come back
 * as long licks; blobs come back as fur, at any slice. See `SHOT_DENSE` in
 * tools/gen-card-auras.mjs for the prompt that asks for the former, and expect
 * to reject takes rather than tune this number.
 */
const SLICE = Number(process.env.AURA_SLICE ?? 48);
/**
 * The strip, and the one thing `flare` does differently to `ribbon`.
 *
 * Both unroll the band around the card and read the clip along it. They differ
 * in *which way round* the clip is laid on that band, and that decides the
 * whole look:
 *
 *   `ribbon` stands the clip on end — the clip's up runs along the perimeter.
 *   A tall flame lands as a long lick running *around* the card. Tidy, and it
 *   clings to the rim.
 *
 *   `flare` leaves the clip upright — the clip's up runs *outward*, from the
 *   line to the edge of the canvas. The same tall flame now lands as a lick
 *   standing off the card, base on the border and tip out in the margin, which
 *   is what "the effect should leave the card" means once it is a mapping.
 *
 * So flare's strip is the frame's width along the perimeter and its height
 * across the band: 384 of clip stretched round 1740 of rim, which is four and a
 * half times and puts about a dozen licks round the card, and the clip's whole
 * height squeezed into the depth of the band. That squeeze runs along each
 * lick's own length, where the signal is smooth, so it shortens a lick rather
 * than averaging it away — which is precisely what squeezing *across* one did
 * to the first cut of the ribbon.
 *
 * `vflip` is what puts the base at the border: the clip's flames rise toward
 * the top of the frame, and `V` runs 0 inside the card to 1 out past the glow.
 */
const STRIP_W = STYLE === "flare" ? W : H;
const STRIP_H =
  STYLE === "flare" ? Number(process.env.AURA_STRIP_H ?? 176) : SLICE;
/**
 * How much of a flare clip's height is used, measured from the bottom.
 *
 * The whole height flattens too far. A flare clip's licks reach up two thirds
 * of the frame and taper the whole way, and squeezing all 736 rows into the
 * 121 the band is deep is six times — which leaves the licks as thin diagonal
 * scratches rather than as flame.
 *
 * 0.4 keeps the bottom two fifths, where a lick is at its widest, and takes the
 * squeeze down to about twice. That is what buys the licks enough thickness to
 * survive `REPEAT` coming down as well — the two are one decision, and the note
 * on REPEAT has the arithmetic. Together they turn a fringe of fibres into a
 * dozen flames with shape in them. The cost is the tips, which is no cost: they
 * were the part that survived the flattening worst, and the band fades the
 * outer reach anyway.
 *
 * Cropped rather than scaled unevenly because the tips are genuinely not
 * wanted: the band's own falloff already fades the outer reach — see
 * `borderMask` — so a clip that keeps fading after the band has stopped is
 * spending resolution on something that was going to be multiplied by nothing.
 */
const STRIP_TOP = Number(process.env.AURA_STRIP_TOP ?? 0.4);
/**
 * How many times the strip goes round the card, and under `flare` it is the
 * number that decides whether the style works at all.
 *
 * For `ribbon`, one. The strip is the clip stood on end, so it is already a lap
 * long, and a second lap of the same content is a symmetry on the card that
 * nothing in the clip put there.
 *
 * For `flare`, four, and the reason is an aspect ratio rather than a taste.
 * Flare maps the clip's width around the perimeter and its height outward, and
 * those two axes are scaled by wildly different amounts: 384 columns of clip
 * stretched over 1740 pixels of rim is 4.5x wider, while 736 rows squeezed into
 * a 121 pixel band is 6x shorter. Multiply those and a feature in the clip
 * arrives on the card 27 times flatter than it was drawn — so a lick has to be
 * *27 times* taller than it is wide merely to still be taller than it is wide.
 * At `REPEAT` 1 nothing in the library clears that. Fire's licks are about 17
 * to 1, and they landed as arcs running *parallel* to the border: a stack of
 * thin concentric rings round the card, which is the exact opposite of the
 * thing the style is for and looked like a printing fault.
 *
 * Two laps and a `STRIP_TOP` of 0.4 clear it together: the crop takes the
 * outward squeeze from six times to two, two laps take the perimeter stretch
 * from 4.5 to 2.3, and the product falls from 27 to about 5 — which every clip
 * in the library clears with room to spare.
 *
 * Four laps at the full height was tried first. It clears the arithmetic too,
 * and it looks wrong for a different reason: at that stretch the features are
 * so narrow that all six elements arrive as the *same* fringe of fibres, fire
 * indistinguishable from wind but for the tint. Two laps of thick licks is a
 * dozen flames with shape in them. What it costs is the clip coming round
 * twice, which on a churning effect is invisible — the licks are not
 * individually memorable, and `sampleStrip`'s cross-fade blurs each join.
 */
const REPEAT = Number(process.env.AURA_REPEAT ?? (STYLE === "flare" ? 2 : 1));
/**
 * How far the strip scrolls per clip frame, in strip widths.
 *
 * 0.05 over twenty-five frames is a strip and a quarter, which at `REPEAT` 2 is
 * most of the way round the card — and the runtime then ping-pongs it, so the
 * light sweeps round and back rather than round and round. That is deliberate:
 * nothing here is a seamless loop, and art/ultborder.js ping-pongs precisely
 * because it cannot be. A scroll fast enough to be a full circuit would have to
 * run straight through to read as one, and it would cut on the twelfth frame.
 *
 * 0.02 was tried first and is not enough: over the twelve frames that reach the
 * sheet it is an eighth of a lap, which at the size a card is drawn is not a
 * patch of light going anywhere, it is the rim getting slightly brighter.
 */
const SPEED = Number(process.env.AURA_SPEED ?? 0.05);

/* ------------------------------------------------------------- what is written */

/** 7 fps is IDLE_FPS in art/boss.js — the rate the game already plays frames at. */
const FPS = 7;
/** Columns in the contact sheet. */
const CONTACT_COLS = 7;

/**
 * The sprite sheet's grid. Whatever plays it mirrors these — change one, change
 * both, exactly as art/spells.js mirrors pack-spells.mjs.
 *
 * Twelve of the clip's twenty-five, evenly spaced, so the sheet holds the whole
 * cycle rather than a third of it. Nothing here is a seamless loop — Wan was
 * asked for motion, not for a loop — so these are meant to be **ping-ponged**
 * the way art/boss.js ping-pongs its idle: 0..11,10..1 has no seam by
 * construction, whatever the two ends happen to look like.
 *
 * The cell is 200 wide because that is what pack-card-aura.mjs packs the still
 * aura at, and the still aura is what one of these would replace.
 */
const COLS = 6;
const COUNT = 12;
const CELL_W = 200;
const CELL_H = Math.round((CELL_W * H) / W);

/** Where the style's set lands. No two ever share a folder. */
const OUT_DIR = join(
  ROOT,
  {
    halo: "src/animation",
    border: "src/animation/style-border",
    ribbon: "src/animation/style-ribbon",
    flare: "src/animation/style-flare",
  }[STYLE],
);
/** libwebp quality. The spell sheets use 80; a glow can afford a little more. */
const QUALITY = 88;

/* --------------------------------------------------------------------- ffmpeg */

const rel = (p) =>
  p
    .slice(ROOT.length + 1)
    .split(sep)
    .join("/");
const kb = (n) => `${(n / 1024).toFixed(1)}kB`;

const run = (args, opts) =>
  execFileSync("ffmpeg", ["-y", "-v", "error", ...args], opts);

const decode = (file, pix, filter) =>
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
      pix,
      "-",
    ],
    { maxBuffer: 1 << 28 },
  );

/**
 * A clip frame, resized to whatever canvas the style wants.
 *
 * A stretch rather than a crop, and it is free: these are frame-filling
 * textures with no composition in them, so the 25 by 25 pixels of fire this
 * moves are 25 by 25 pixels of fire either way. It is what lets one set of
 * clips serve two card shapes.
 */
const decodeTexture = (file) => decode(file, "rgb24", `scale=${W}:${H}`);

/** The lit rectangle in aura-sheet.png, found the way pack-card-aura finds it. */
function maskFrom(file) {
  const [sw, sh] = execFileSync("ffprobe", [
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

  const raw = decode(file, "gray");
  let x0 = sw,
    y0 = sh,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (raw[y * sw + x] < 128) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const cx = Math.max(0, x0 - PAD);
  const cy = Math.max(0, y0 - PAD);
  const cw = Math.min(sw - cx, x1 - x0 + 1 + PAD * 2);
  const ch = Math.min(sh - cy, y1 - y0 + 1 + PAD * 2);

  mkdirSync(TMP, { recursive: true });
  const out = join(TMP, "mask.png");
  run([
    "-i",
    file,
    "-vf",
    `crop=${cw}:${ch}:${cx}:${cy},scale=${W}:${H}:flags=lanczos,format=gray`,
    "-frames:v",
    "1",
    out,
  ]);
  console.log(
    `mask: rim ${x1 - x0 + 1}x${y1 - y0 + 1} of ${sw}x${sh}, crop ${cw}x${ch} -> ${W}x${H}`,
  );
  return decode(out, "gray");
}

/**
 * The card the game draws, as a distance field rather than as a resampled file.
 *
 * `assets/cards/outline.webp` is 128x264 and this canvas is 384x688, and a
 * three-times upscale of a three-pixel line is a blurred three-pixel line — the
 * one part of this style that has to stay crisp. So the four numbers are
 * measured off that file (see the constants) and the rectangle is drawn here at
 * whatever size is asked for.
 *
 * A signed distance also gives the thing a resampled mask cannot: which side of
 * the line a pixel is on. That is what lets the aura hang outside the card and
 * stop at the portrait, which is the whole look being copied.
 */
function borderMask() {
  const hw = (W - CARD_MARGIN * 2) / 2;
  const hh = (H - CARD_MARGIN * 2) / 2;
  const r = CARD_RADIUS;
  const cx = W / 2;
  const cy = H / 2;
  const half = CARD_LINE / 2;

  const band = new Float32Array(W * H);
  const hold = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      // The standard rounded-box distance: negative inside, positive outside.
      const qx = Math.abs(x + 0.5 - cx) - (hw - r);
      const qy = Math.abs(y + 0.5 - cy) - (hh - r);
      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const d = outside + Math.min(Math.max(qx, qy), 0) - r;

      const off = Math.abs(d) - half;
      const i = y * W + x;
      // A one-pixel feather on the line, so the border is crisp but not jagged.
      hold[i] = Math.min(1, Math.max(0, 0.5 - off));
      /*
       * Outside the line, `flare` falls off to *zero* rather than decaying.
       *
       * An exponential never arrives, and at a border's 16px e-fold over a
       * 48px margin that is nobody's problem — it is down to 8% by the canvas
       * edge and the clip out there is black anyway. At flare's reach it is:
       * 96 pixels of e-fold over a 104 pixel margin is still a third lit where
       * the canvas stops, and these sheets go on with `add`, so a third of the
       * element's colour would ring the card as a hard-edged rectangle exactly
       * where the file runs out.
       *
       * `1 - x^3` rather than a falloff with any real shape to it, because
       * under this style the *clip* is the shape. A flare clip is an elevation
       * of separated licks that taper to their own tips — see `SHOT_FLARE` —
       * and the band's only remaining jobs are to keep the effect inside the
       * canvas and to not end it with an edge. Squared was tried first and
       * swallows the style whole: down to a quarter by half way out, it pins
       * the licks back against the line and leaves the margin black, which is
       * a border again and the one thing this style exists not to be.
       */
      band[i] =
        off <= 0
          ? 1
          : d < 0
            ? Math.exp(-off / GLOW_IN)
            : STYLE === "flare"
              ? 1 - Math.pow(Math.min(1, off / GLOW_OUT), 3)
              : Math.exp(-off / GLOW_OUT);
    }
  }
  console.log(
    `mask: drawn card ${W - CARD_MARGIN * 2}x${H - CARD_MARGIN * 2} ` +
      `line ${CARD_LINE} radius ${CARD_RADIUS} in ${W}x${H}`,
  );
  return { band, hold, hotHold: 0.55 };
}

/** The shipped halo, shaped: a band with a hard edge, and its own hot rim line. */
function haloMask() {
  const mask = maskFrom(AURA_SHEET);
  const band = new Float32Array(W * H);
  const hold = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const m = Math.max(0, mask[i] / 255 - FLOOR) / (1 - FLOOR);
    band[i] = Math.pow(m, SPREAD);
    hold[i] = Math.pow(m, RIM) * RIM_FLOOR;
  }
  return { band, hold, hotHold: 1 };
}

/**
 * `band` is where the element shows and how strongly; `hold` is what stays lit
 * whatever the texture over it is doing.
 *
 * `hotHold` is what separates the two styles at the last step. The halo's rim
 * *is* the effect at its hottest, so it goes to white with everything else and
 * holds at 1. The border's line is not the effect at all — it is the card, and
 * in the build it is a solid element colour — so it holds at 0.55, which leaves
 * it about a tenth white: enough to look lit, not enough to wash the colour out
 * of the one line the eye reads the card by.
 */
const { band, hold, hotHold } = ON_CARD ? borderMask() : haloMask();
if (BAND_FLOOR > 0) {
  for (let i = 0; i < band.length; i++) {
    band[i] = Math.max(0, (band[i] - BAND_FLOOR) / (1 - BAND_FLOOR));
  }
}

/**
 * Where every pixel of the canvas sits on the unrolled band: `U` around the
 * card, `V` across it.
 *
 * `U` is arclength along the rounded rectangle the mask draws, normalised, and
 * it has to be *arclength* rather than anything cheaper. Angle from the centre
 * would bunch up along the long sides and stretch at the corners, so a patch of
 * light travelling at a constant rate in `U` would visibly slow down and speed
 * up four times a lap. So: the outline is walked as four equal quadrants, each
 * one a straight run up to the corner, a quarter circle, and a straight run
 * back — and a pixel is placed by projecting it onto whichever of those three
 * its own offsets put it nearest.
 *
 * `V` is the signed distance across the band, inside the card at 0 and out past
 * the glow at 1, which is what gives the strip's short axis somewhere to go.
 */
function ribbonMap() {
  const hw = (W - CARD_MARGIN * 2) / 2;
  const hh = (H - CARD_MARGIN * 2) / 2;
  const r = CARD_RADIUS;
  const cx = W / 2;
  const cy = H / 2;
  const half = CARD_LINE / 2;

  /* One quadrant of the outline: side, corner arc, side. */
  const sideY = hh - r;
  const sideX = hw - r;
  const arc = (Math.PI / 2) * r;
  const quad = sideY + arc + sideX;

  const span = CARD_LINE + GLOW_IN + GLOW_OUT;
  const U = new Float32Array(W * H);
  const V = new Float32Array(W * H);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const qx = ax - sideX;
      const qy = ay - sideY;

      /* Arclength from the middle of this quadrant's vertical side. */
      let s;
      if (qx > 0 && qy > 0) s = sideY + Math.atan2(qy, qx) * r;
      else if (qx >= qy) s = ay;
      else s = sideY + arc + (sideX - ax);

      /* Folded out to the whole lap, so the four quadrants join up. */
      let u;
      if (dx >= 0 && dy >= 0) u = s;
      else if (dx < 0 && dy >= 0) u = 2 * quad - s;
      else if (dx < 0) u = 2 * quad + s;
      else u = 4 * quad - s;

      const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
      const d = outside + Math.min(Math.max(qx, qy), 0) - r;

      const i = y * W + x;
      U[i] = u / (4 * quad);
      V[i] = Math.min(1, Math.max(0, (d + GLOW_IN + half) / span));
    }
  }
  console.log(
    `ribbon: perimeter ${(4 * quad).toFixed(0)}px, band ${span}px, ` +
      `strip ${STRIP_W}x${STRIP_H} x${REPEAT} at ${SPEED}/frame`,
  );
  return { U, V };
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
/** Rec.601. The clip is a motion field, not a picture. */
const luma = (b, j) =>
  (b[j] * 0.299 + b[j + 1] * 0.587 + b[j + 2] * 0.114) / 255;

/**
 * How bright a pixel of a flare clip counts as, and it is deliberately not
 * luminance.
 *
 * Rec.601 weights red at 0.299, which is right for how bright a colour *looks*
 * and wrong for how much effect is present. A flare clip is saturated red and
 * orange almost everywhere — a flame is — so under luma a fully lit lick reads
 * at a third of a mask and only its white core reads at all. The first cut of
 * this style came back with the licks so dim they were lost beside the card's
 * own line, and the fix was not more lift: it was to stop asking a photometric
 * question. Value — the largest channel — answers the one being asked, which is
 * whether there is any element here, and a saturated red returns a full yes.
 *
 * The other three styles keep luma. They pack clips that were coloured *by* the
 * packer out of a grey mask, or that are judged already, and neither wants
 * changing under it.
 */
const value = (b, j) => Math.max(b[j], b[j + 1], b[j + 2]) / 255;

/**
 * Which of the two the style reads its strip through — and `flare` reads both,
 * because it is asking two different questions of the same pixel.
 *
 * *Is there any element here* decides where colour goes, and value answers it:
 * a saturated red lick is entirely present. *Is it white-hot* decides where the
 * colour burns out, and only luma answers that: value alone would say a pure
 * red is as hot as a white core, and the first cut with it came back a pale
 * pink border with the element washed out of it.
 *
 * So the mask comes off `value` and the burn off `luma`, and the element keeps
 * its colour everywhere except where the clip really did go white.
 */
const intensity = STYLE === "flare" ? value : luma;
const HOT_MEASURE = STYLE === "flare" ? luma : null;

/** Computed once: the ribbon style reads every frame through this. */
const ribbon = UNROLLED ? ribbonMap() : null;

/**
 * A clip frame as the ribbon's strip: rotated a quarter turn, then squeezed.
 *
 * The crop takes `SLICE` columns from the middle of the frame and `transpose=2`
 * stands them on end, so the clip's vertical axis runs along the strip — and
 * therefore around the card. A clip of flame rising becomes flame running round
 * the border rather than flame smeared across it, which is the whole reason the
 * rotation is here and not just a convenience of aspect.
 */
const decodeStrip = (file) =>
  decode(
    file,
    "rgb24",
    STYLE === "flare"
      ? `crop=iw:ih*${STRIP_TOP}:0:ih*${1 - STRIP_TOP},` +
          `scale=${STRIP_W}:${STRIP_H},vflip`
      : `scale=${W}:${H},crop=${SLICE}:${H}:${(W - SLICE) >> 1}:0,transpose=2`,
  );

/** One tap into a strip, by fraction across and fraction down. */
function tap(strip, f, v, measure) {
  const x = Math.min(STRIP_W - 1, (f * STRIP_W) | 0);
  const y = Math.min(STRIP_H - 1, (v * STRIP_H) | 0);
  return measure(strip, (y * STRIP_W + x) * 3);
}

/**
 * The strip, read at `u` around the card, wrapped so there is no seam.
 *
 * A strip cut from a clip does not tile: its left edge and its right edge are
 * unrelated, and scrolled round a border that join arrives as a bright notch
 * travelling with the light. So every tap is two taps — the strip, and the
 * strip half a width along — cross-faded on a weight that falls to zero exactly
 * at the join. Where the weight is zero the two agree by construction, so the
 * wrap is continuous; where it is a half the frame is a blend of two parts of
 * the same churn, which on a glow is more churn and on nothing else.
 *
 * Mirroring would also have removed the seam and was not used: it makes the
 * scroll turn around at the fold, so the light converges on two points of the
 * card instead of running round it, which is the one thing this style is for.
 */
function sampleStrip(strip, u, v, measure) {
  const m = measure || intensity;
  const f = u - Math.floor(u);
  const g = f < 0.5 ? f + 0.5 : f - 0.5;
  const w = 1 - Math.abs(2 * f - 1);
  return w * tap(strip, f, v, m) + (1 - w) * tap(strip, g, v, m);
}

/** The strip set's 99th percentile, as a gain. The band's own `levelOf`. */
function levelOfStrip(strips) {
  const bins = new Uint32Array(256);
  let counted = 0;
  for (const strip of strips) {
    for (let i = 0; i < STRIP_W * STRIP_H; i++) {
      bins[Math.min(255, (intensity(strip, i * 3) * 255) | 0)]++;
      counted++;
    }
  }
  let seen = 0;
  let p = 255;
  for (let v = 255; v >= 0; v--) {
    seen += bins[v];
    if (seen >= counted * 0.01) {
      p = v;
      break;
    }
  }
  return Math.max(1, Math.min(GAIN_MAX, TARGET / Math.max(1 / 255, p / 255)));
}

/** The whole clip's 99th percentile inside the band, as a gain. See TARGET. */
function levelOf(textures) {
  const bins = new Uint32Array(256);
  let counted = 0;
  for (const tex of textures) {
    for (let i = 0; i < W * H; i++) {
      if (band[i] < 0.3) continue;
      bins[Math.min(255, (luma(tex, i * 3) * 255) | 0)]++;
      counted++;
    }
  }
  if (!counted) return 1;
  let seen = 0;
  let p = 255;
  for (let v = 255; v >= 0; v--) {
    seen += bins[v];
    if (seen >= counted * 0.01) {
      p = v;
      break;
    }
  }
  return Math.max(1, Math.min(GAIN_MAX, TARGET / Math.max(1 / 255, p / 255)));
}

/* ------------------------------------------------------------------- per clip */

function pack(dir, colour) {
  const [element, take] = dir.split("-v");
  const src = join(CLIPS, dir);
  const frames = readdirSync(src)
    .filter((f) => f.endsWith(".png"))
    .sort();
  if (frames.length < COUNT) {
    console.log(`  ${dir}: ${frames.length} frames, skipped`);
    return 0;
  }

  const c = [
    ((colour >> 16) & 255) / 255,
    ((colour >> 8) & 255) / 255,
    (colour & 255) / 255,
  ];

  const textures = frames.map((f) =>
    ribbon ? decodeStrip(join(src, f)) : decodeTexture(join(src, f)),
  );
  const gain = ribbon ? levelOfStrip(textures) : levelOf(textures);

  const out = Buffer.alloc(frames.length * W * H * 3);
  textures.forEach((tex, n) => {
    const base = n * W * H * 3;
    for (let i = 0; i < W * H; i++) {
      const j = i * 3;
      // Where in the clip this pixel reads from. The two styles differ here and
      // nowhere else: `border` reads the pixel under it, `ribbon` reads the
      // strip at this pixel's own distance around the card, scrolled by frame.
      const u = ribbon ? ribbon.U[i] * REPEAT + n * SPEED : 0;
      const t = ribbon ? sampleStrip(tex, u, ribbon.V[i]) : luma(tex, j);
      // The animated part, then the part that is lit whatever it is doing.
      let g = Math.pow(t * gain, TEX_GAMMA) * band[i];
      if (g > 1) g = 1;
      // How white this pixel burns. The same number as `g` everywhere except
      // under `flare`, which measures presence and heat separately — see
      // HOT_MEASURE.
      let gh = g;
      if (HOT_MEASURE) {
        gh =
          Math.pow(
            sampleStrip(tex, u, ribbon.V[i], HOT_MEASURE) * gain,
            TEX_GAMMA,
          ) * band[i];
        if (gh > 1) gh = 1;
      }
      const a = Math.max(g, hold[i]);
      const h = Math.max(gh, hotHold * hold[i]);
      const hot = h * h * h * h;
      out[base + j] = clamp255(255 * (a * c[0] + hot * (1 - c[0])));
      out[base + j + 1] = clamp255(255 * (a * c[1] + hot * (1 - c[1])));
      out[base + j + 2] = clamp255(255 * (a * c[2] + hot * (1 - c[2])));
    }
  });

  const elementDir = join(OUT_DIR, element);
  const frameDir = join(elementDir, `${element}-v${take}`);
  rmSync(frameDir, { recursive: true, force: true });
  mkdirSync(frameDir, { recursive: true });
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
      join(frameDir, "frame-%02d.png"),
    ],
    { input: out, maxBuffer: 1 << 29 },
  );

  const glob = join(frameDir, "frame-%02d.png");
  run([
    "-i",
    glob,
    "-vf",
    `tile=${CONTACT_COLS}x${Math.ceil(frames.length / CONTACT_COLS)}`,
    "-frames:v",
    "1",
    join(elementDir, `${element}-v${take}-contact.png`),
  ]);
  run([
    "-framerate",
    String(FPS),
    "-i",
    glob,
    "-c:v",
    "libwebp_anim",
    "-loop",
    "0",
    "-quality",
    String(QUALITY),
    "-compression_level",
    "6",
    join(elementDir, `${element}-v${take}.webp`),
  ]);

  // The sheet: twelve frames laid out through a scratch folder, because ffmpeg
  // tiles a numbered sequence and the twelve are not consecutive.
  const picks = Array.from({ length: COUNT }, (_, i) =>
    Math.round((i * (frames.length - 1)) / (COUNT - 1)),
  );
  const tmp = join(TMP, dir);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  picks.forEach((p, i) =>
    cpSync(
      join(frameDir, `frame-${String(p + 1).padStart(2, "0")}.png`),
      join(tmp, `${String(i + 1).padStart(2, "0")}.png`),
    ),
  );
  const sheet = join(elementDir, `${element}-v${take}-sheet.webp`);
  run([
    "-i",
    join(tmp, "%02d.png"),
    "-vf",
    `scale=${CELL_W}:${CELL_H}:flags=lanczos,tile=${COLS}x${COUNT / COLS}`,
    "-frames:v",
    "1",
    "-c:v",
    "libwebp",
    "-quality",
    String(QUALITY),
    "-compression_level",
    "6",
    sheet,
  ]);
  rmSync(tmp, { recursive: true, force: true });

  const size = statSync(sheet).size;
  console.log(
    `  ${dir}: ${frames.length} frames, level x${gain.toFixed(2)} -> ` +
      `${rel(frameDir)}/ + sheet ${COLS}x${COUNT / COLS} ${kb(size)}`,
  );
  return size;
}

/* ------------------------------------------------------------------- the run */

const only = process.argv.slice(2).find((a) => !a.startsWith("--")) || "";
if (!existsSync(CLIPS)) {
  console.log(`nothing generated yet: ${CLIPS}`);
  console.log("run: node tools/gen-card-auras.mjs");
  process.exit(0);
}

const colours = Object.fromEntries(ELEMENTS.map((e) => [e.id, e.color]));
const dirs = readdirSync(CLIPS)
  .filter((d) => /^[a-z]+-v[0-9]+$/.test(d))
  .filter((d) => colours[d.split("-v")[0]] !== undefined)
  // An element (`fire`, all its takes) or one take (`fire-v5`), so a single
  // clip can be judged the minute it lands rather than after its whole set.
  .filter((d) => !only || d === only || d.startsWith(only + "-v"))
  .sort();

console.log(`${dirs.length} variant(s):`);
let total = 0;
for (const dir of dirs) total += pack(dir, colours[dir.split("-v")[0]]);
rmSync(TMP, { recursive: true, force: true });
console.log(`${kb(total)} of sheets in ${rel(OUT_DIR)}`);
