/**
 * The animated border a hero card wears while its ultimate can be spent, and
 * the one it plays on the tap that spends it.
 *
 * Two kinds of sheet, both element by element, both laid on the card's own box:
 *
 *   ult-<element>.webp        the **loop**, played for as long as the card is
 *                             charged. Twelve frames ping-ponged on a generated
 *                             sheet; eighteen run straight through on the drawn
 *                             one that ships. Which, and how many, is the
 *                             sheet's shape talking — see SHAPES.
 *   ult-burst-<element>.webp  the **burst**. The same frames played once,
 *                             straight through, on the tap — a rise, a peak
 *                             about two fifths in, and dark by the last, which
 *                             pack-ult-borders.mjs re-times a rising clip into.
 *                             Optional: an element without one spins its loop
 *                             faster instead — see HeroCard.flareUlt. All six
 *                             have one now, so nothing takes that path.
 *
 * The burst is played twice over, at both ends of the hand-off the tap starts:
 * on the card by HeroCard.flareUlt, and then round the medallion the cut-in puts
 * up in its place — see GATE in fx/cutin.js. That second one is the only caller
 * that cannot wear both geometries, which is why `shape` comes back with the
 * frames at all.
 *
 * Where the art comes from: **tools/gen-ult-vfx.mjs**, which computes all twelve
 * sheets rather than generating them, and stamps its particles with the shipped
 * game's own flipbooks out of `src/source/fx/invokers`. Read that file's header
 * for why — four rounds of Wan 2.2 clips were rejected before it, and the whole
 * argument is there. The generated route is still on disk and still decodes:
 * tools/pack-card-auras.mjs for how a clip becomes a border and
 * tools/pack-ult-burst.mjs for the hand-made one, neither of which any shipped
 * sheet has come through since.
 *
 * It is the callout the charged card had been missing since the still one came
 * off. A filled card already prints READY, stands a fifth taller and breathes —
 * see HeroCard.setReady — and all three of those happen *inside* a tile that is
 * one of six in a row at the bottom of the screen. This is the half that happens
 * outside it, and unlike the still halo it stands in for it is the element
 * itself moving: Ricklow's border burns, Selisa's runs, Taranis's crackles.
 * Which is the whole argument for baked sheets over one white still under six
 * tints — a tint gives six colours of the same shape, and what sells an ultimate
 * is that the card is on fire.
 *
 * ## Shapes, and why a sheet is asked rather than told
 *
 * A sheet is not just frames: it is frames plus how far the file reaches outside
 * the card, because that is what turns "a card w by h" into the size the sprite
 * is drawn at. Get it wrong and nothing throws — the border's light lands a few
 * points inside the card, which reads as a glow sitting on the portrait.
 *
 * There are five of those geometries in the build and there is no promise there
 * will not be a sixth. The card-shaped shelf packs a solid line with a narrow
 * margin; the halo-shaped one packs a hairline with a bloom half a card wide;
 * the flare shelf packs the line with the element itself standing off it, in a
 * margin more than twice the border's; and the two drawn ones share that widest
 * margin and differ from each other only in how many frames are in the file. So
 * `SHAPES` holds one entry per
 * geometry — the grid *and* the pads, exactly as the packers print them — and a
 * decoded sheet is matched to its shape **by its own size**. Nothing has to say
 * which shape a file is; the file says.
 *
 * That is also the check. A sheet whose dimensions match no shape is dropped
 * with the rest of the fallback rather than cut on a grid it does not have, so a
 * repack at another cell size shows up as a card with no border rather than as
 * twelve slices of the wrong thing.
 *
 * ## The rest of the contract
 *
 * **The grid never varies inside a shape.** Six to a row everywhere; twelve
 * frames on the generated shapes and eighteen on the drawn one. Hardcoded here
 * as art/spells.js hardcodes pack-spells.mjs's grid, and changed in both places
 * or neither.
 *
 * **No alpha, so every frame goes on with the `add` blend.** The frames are
 * glow on black, the same trade pack-spells.mjs makes: a black backdrop adds
 * nothing, and it is what keeps a set of these affordable at all. A flare loop
 * costs 60–95 kB and a flare burst 25–58 kB, which is 640 kB for the twelve
 * before base64 puts a third on top — against 160 kB for the six border sheets
 * that came before them. That is the price of an effect that leaves the card,
 * and tools/pack-ult-borders.mjs has the sweep it was argued down to.
 *
 * **A glob, not an import per file.** The same reason art/spells.js uses one: a
 * missing import is a build failure, and these arrive one at a time as takes are
 * picked. `import.meta.glob` resolves whatever is on disk when Vite builds, so a
 * half-picked set builds and ships, the elements that have a sheet wear it and
 * the elements that do not are exactly as they were.
 */

import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import { FIRE, WATER, NATURE, LIGHTNING, ARCANE, WIND } from "../config.js";

/**
 * Every geometry a sheet can be packed to, as the packers print them.
 *
 *   border  tools/pack-ult-borders.mjs and tools/pack-ult-burst.mjs: the card
 *           the game draws — a 304x608 card in a 384x688 canvas, cut to 176px
 *           cells. Everything ships on this one except where noted.
 *   halo    the same tool with `--halo`: the shelf's other shape, a hairline
 *           with a bloom, whose margin is nearly three times as wide.
 *   flare   the same tool with `--flare`: the same 304x608 card, in a 496x800
 *           canvas — a margin more than twice the border's, because what hangs
 *           in it is not a falloff but the element itself standing off the
 *           card. Its pads are the widest of the three and its cell is the
 *           shortest, which is not a contradiction: the frame is squarer.
 *   vfx     tools/gen-ult-vfx.mjs, which draws rather than generates. Twelve
 *           frames, and the first shape to carry a `loop`, which is most of why
 *           it needs a shape at all: its frames are cyclic by construction, so
 *           they run straight through where every generated shape has to be
 *           ping-ponged. See `ultLoopTexture`. Superseded and kept, so a sheet
 *           built before the second pass still decodes.
 *   vfx2    the same tool after that pass: the same cell and the same pads,
 *           eighteen frames on three rows, at an `fps` of its own. It is the
 *           set that ships. Half again the frames is what a *textured* particle
 *           needs — the loop is the same length in seconds — and it is the
 *           reason this is a shape rather than an edit to `vfx`: both sizes are
 *           legitimate files and the dimensions are what tell them apart.
 *
 * `w` and `h` are what a sheet of that shape measures, and they are how a file
 * is matched to its shape — see `shapeOf`. Add a shape when a packer prints
 * numbers that are not here; never edit one to fit a file.
 */
const SHAPES = [
  {
    id: "border",
    cols: 6,
    count: 12,
    cellW: 176,
    cellH: 315,
    pad: { x: 0.1316, y: 0.0652 },
  },
  {
    id: "halo",
    cols: 6,
    count: 12,
    cellW: 176,
    cellH: 337,
    pad: { x: 0.3727, y: 0.1891 },
  },
  {
    id: "flare",
    cols: 6,
    count: 12,
    cellW: 176,
    cellH: 284,
    pad: { x: 0.3158, y: 0.1579 },
  },
  {
    id: "vfx",
    cols: 6,
    count: 12,
    cellW: 216,
    cellH: 344,
    pad: { x: 0.3438, y: 0.1719 },
    loop: "cycle",
  },
  {
    id: "vfx2",
    cols: 6,
    count: 18,
    cellW: 216,
    cellH: 344,
    pad: { x: 0.3438, y: 0.1719 },
    loop: "cycle",
    fps: 10,
  },
];

/**
 * The default rate a loop is played at, and it is the rate it was generated at:
 * tools/pack-card-auras.mjs writes its loops at 7 fps and the takes were judged
 * on them. Faster is not more alive — at 14 the fire stops being fire and reads
 * as a strobe on a border, because twelve frames of a churn are a third of a
 * second of motion whatever they are stepped at.
 *
 * A shape may carry an `fps` of its own and the shipped one does: `vfx2` has
 * half again the frames of everything else and is played at 10, which is the
 * same lap time in more steps rather than a faster border. That number belongs
 * to the sheet, not to this file — see the head of tools/gen-ult-vfx.mjs, which
 * prints it — so it travels with the art through `cut`.
 */
const FPS = 7;

/**
 * Which sheet each element wears. The ids are the shelf's folder names, which
 * are the packers' file names.
 */
const ID_BY_ELEMENT = {
  [FIRE]: "fire",
  [WATER]: "water",
  [NATURE]: "nature",
  [LIGHTNING]: "lightning",
  [ARCANE]: "arcane",
  [WIND]: "wind",
};

/**
 * Whatever sheets Vite found at build time, as id -> inlined data URI. The id
 * carries the role: `water` is a loop, `burst-water` is a burst.
 *
 * `assetsInlineLimit` is set high enough in vite.config.js that these come back
 * as base64 rather than as URLs, which is the whole point: the deliverable is
 * one self-contained file that makes no requests.
 */
const FOUND = import.meta.glob("../assets/cards/ult-*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

const urls = {};
for (const path in FOUND) {
  const id = path
    .slice(path.lastIndexOf("/") + 1)
    .replace(/^ult-|\.webp$/g, "");
  urls[id] = FOUND[path];
}

/** id -> { frames, pad, shape }. Only holds what decoded onto a known shape. */
const sheets = {};
let loaded = false;

/** The shape a decoded sheet is on, by its own size, or null if it is on none. */
function shapeOf(w, h) {
  return (
    SHAPES.find(
      (s) => s.cellW * s.cols === w && s.cellH * (s.count / s.cols) === h,
    ) || null
  );
}

/**
 * Cut one sheet into its frames.
 *
 * Every frame is a window onto one texture rather than a texture of its own, so
 * stepping the animation costs nothing at render time — the batch never breaks,
 * which on six cards each stepping their own border is the difference between a
 * free effect and six draw calls a frame.
 */
async function cut(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const shape = shapeOf(img.width, img.height);
  if (!shape) return null;

  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  const sheet = canvasTexture(c);

  const frames = [];
  for (let i = 0; i < shape.count; i++) {
    frames.push(
      new Texture({
        source: sheet.source,
        frame: new Rectangle(
          (i % shape.cols) * shape.cellW,
          Math.floor(i / shape.cols) * shape.cellH,
          shape.cellW,
          shape.cellH,
        ),
      }),
    );
  }
  // `loop` and `fps` come along because `ultLoopTexture` needs them and the
  // caller does not: a card asks for its border and plays it, without knowing
  // that one of the shapes on disk is a true cycle and the rest have to be
  // ping-ponged, or that one of them was drawn at a rate of its own.
  return {
    frames,
    pad: shape.pad,
    shape: shape.id,
    loop: shape.loop,
    fps: shape.fps,
  };
}

/**
 * Decode every sheet that shipped, before the first card is built.
 *
 * Never rejects, and one bad sheet never takes the others with it: an id that
 * fails to decode is simply absent, and its card is the card it was before this
 * existed — READY, taller, breathing, and no light on the border. That fallback
 * is the normal case for any element whose take has not been picked yet, not an
 * error path.
 */
export async function loadUltBorders() {
  if (loaded) return;
  loaded = true;
  await Promise.all(
    Object.keys(urls).map(async (id) => {
      try {
        const art = await cut(urls[id]);
        if (art) sheets[id] = art;
      } catch {
        // Left out of `sheets`, which is exactly how the caller asks.
      }
    }),
  );
}

/**
 * The loop for one element, as the frames and the pads they are laid out by, or
 * null if that sheet never arrived.
 *
 * Handed over as one object rather than as frames the caller then has to find
 * the margins for, exactly as art/frameaura.js hands over its still: which pads
 * are right depends on which sheet came back, and a card using one shape's
 * numbers on another shape's art would draw the border a tenth of a card inside
 * its own edge.
 */
export function ultBorder(element) {
  return sheets[ID_BY_ELEMENT[element]] || null;
}

/**
 * The burst for one element, or null — most elements have none.
 *
 * It carries the id of the shape it decoded onto, because not every caller can
 * wear every shape. A card lays a burst on its own rectangle and either geometry
 * lands on it; the cut-in hangs one round a medallion — see GATE in
 * fx/cutin.js — and at that size the halo's hairline-in-a-bloom, composed for a
 * card's margin, is a smear rather than a border. A caller that cares reads
 * `shape`; one that does not, like HeroCard.flareUlt, goes on not knowing there
 * is more than one.
 */
export function ultBurst(element) {
  return sheets[`burst-${ID_BY_ELEMENT[element]}`] || null;
}

/**
 * The frame a loop that has been running for `t` seconds is on — cycled if its
 * shape says the sheet is a true loop, ping-ponged otherwise.
 *
 * **Ping-pong** is 0..11 and back down to 1. It is what every *generated* shape
 * needs, because a Wan clip has no seam that lines up: played straight through
 * there is a visible cut between the last frame and the first, and ping-ponging
 * has no seam by construction whatever the two ends look like.
 *
 * It also costs something, and on the drawn sheets the cost is the whole point
 * of the effect. Ping-pong runs time backwards for half the cycle, so anything
 * that *travels* travels back: a wave going round the card turns into a wave
 * sloshing between two corners, embers fall back into the rim they rose from.
 * `tools/gen-ult-vfx.mjs` writes frames that are periodic to the last bit —
 * every term in them is a function of `f/12` — so those play 0..11 and round
 * again, and the light keeps going the way it set off.
 *
 * Which shape a sheet is on decides it, and nothing else has to know: a shape
 * with `loop: "cycle"` is a true loop, the absence of the field means ping-pong.
 *
 * @param {number} rate a multiplier on FPS — see HeroCard.flareUlt, which spins
 *   the loop faster for an element that has no burst sheet of its own.
 */
export function ultLoopTexture(art, t, rate) {
  const n = art.frames.length;
  const fps = art.fps === undefined ? FPS : art.fps;
  const step = Math.floor(t * fps * (rate === undefined ? 1 : rate));
  if (art.loop === "cycle") return art.frames[((step % n) + n) % n];
  const span = n * 2 - 2;
  const i = ((step % span) + span) % span;
  return art.frames[i < n ? i : span - i];
}

/**
 * The frame a burst is on `p` of the way through, played once and clamped.
 *
 * Straight through rather than ping-ponged, because a burst is not a loop: the
 * the frames are a build, a peak and a settle, and run backwards afterwards
 * they would be a second, quieter burst nobody asked for.
 */
export function ultBurstTexture(art, p) {
  const n = art.frames.length;
  return art.frames[Math.max(0, Math.min(n - 1, Math.floor(p * n)))];
}

/**
 * Lay a sheet's frame on a card `w` by `h`, centred on the card's own origin.
 *
 * `grow` is the flare's expansion and nothing else touches it. A size rather
 * than a `scale` for the reason frameaura.js gives about the burst it used to
 * lay the same way: a Sprite's width *is* its scale in Pixi, so a sprite sized
 * here and then scaled would have this size thrown away on the next frame.
 */
export function fitUltBorder(sprite, art, w, h, grow) {
  const k = grow === undefined ? 1 : grow;
  sprite.setSize(w * (1 + 2 * art.pad.x) * k, h * (1 + 2 * art.pad.y) * k);
}
