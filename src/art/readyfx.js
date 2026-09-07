/**
 * The crowns that burn off a charged card's READY caption — one flipbook per
 * element, cut by tools/pack-ready-crown.mjs out of the shipped game's own
 * effects. Read that file's head for which source is which element and why.
 *
 * ## An element is a shape before it is a colour
 *
 * There was one white fire here, tinted six ways, and that is the trade
 * art/ultborder.js argues against at length: six copies of one silhouette is a
 * palette, not a roster. Blue fire is fire. So each hero's caption now wears its
 * own motion — a lick, a splash, a leaf-shaped boil, a bolt, a wisp, a gust —
 * and the tint sits on top of that rather than doing all of the work.
 *
 * ## The contract
 *
 * **One grid for all six.** Four columns, a 112x128 cell, whatever the source's
 * own grid was. The frame count is *not* fixed and is not written down: it comes
 * off the file's own height, so the eight-frame bolt and the sixteen-frame
 * splash both just play. See CROWN_CELL, which the packer prints and this file
 * hardcodes, exactly as art/spells.js hardcodes its own packer's grid.
 *
 * **Every effect stands on the floor of its cell**, fitted rather than
 * stretched. That is the packer's fourth rule and it is what lets a card treat
 * six different shapes as one thing: whatever is in the file, its feet are on
 * the bottom edge — which is where the caption is. It is also why the sprites
 * are anchored (0.5, 1) and not centred.
 *
 * **No alpha, so every frame goes on with the `add` blend.** Same trade as
 * every other sheet in src/assets/fx.
 *
 * ## Loading
 *
 * A glob rather than six imports, for the reason art/spells.js gives about its
 * own: a missing import is a build failure, and these arrive a file at a time as
 * picks are made. Whatever is on disk at build time ships, an element with no
 * sheet burns on its glow alone, and nothing has to be commented out.
 *
 * Decoded with the essential set rather than the deferred one, unlike every
 * other flipbook in the creative, for one reason: a hero can be dealt already
 * charged — see DIFFICULTY.chargeStart — so this is art the *first frame* can
 * need, and a caption that catches fire two seconds after the fight opens is a
 * caption the player watched fail to. It costs 67 kB and a megapixel and a half
 * to make that impossible.
 */

import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import { FIRE, WATER, NATURE, LIGHTNING, ARCANE, WIND } from "../config.js";

/**
 * The cell every element is packed to, exactly as tools/pack-ready-crown.mjs
 * prints it. Changed in both places or neither.
 *
 * `aspect` is one cell, wide over tall, and it is exported because the card
 * sizes its crown off the caption's height and has to get the width from
 * somewhere that is not a guess.
 */
export const CROWN_CELL = { w: 112, h: 128, cols: 4, aspect: 112 / 128 };

/** The packer's file names, which are the ids the elements are keyed by. */
const ID_BY_ELEMENT = {
  [FIRE]: "fire",
  [WATER]: "water",
  [NATURE]: "nature",
  [LIGHTNING]: "lightning",
  [ARCANE]: "arcane",
  [WIND]: "wind",
};

/**
 * Whatever sheets Vite found at build time, as id -> inlined data URI.
 *
 * `assetsInlineLimit` is set high enough in vite.config.js that these come back
 * as base64 rather than URLs, which is the whole point: the deliverable is one
 * self-contained file that makes no requests.
 */
const FOUND = import.meta.glob("../assets/fx/ready-*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

const urls = {};
for (const path in FOUND) {
  const id = path.slice(path.lastIndexOf("/ready-") + 7).replace(".webp", "");
  urls[id] = FOUND[path];
}

/** id -> its frames. Only holds what actually decoded. */
const sheets = {};
let loaded = false;

/**
 * The frames one element's caption burns, or null if that sheet never arrived.
 *
 * Asked for, never pushed: a card calls this every frame it is lit and takes
 * null for an answer, which is the same bargain art/spells.js offers. How many
 * frames come back is the sheet's business — the bolt is eight and the rest are
 * sixteen — so a caller loops on the array's own length.
 */
export function readyCrownFrames(element) {
  return sheets[ID_BY_ELEMENT[element]] || null;
}

/**
 * Cut one sheet into its frames.
 *
 * The count comes off the image: four to a row, and as many rows as the file is
 * tall. Every frame is a window onto one texture rather than a texture of its
 * own, so five licks stepping through a sheet cost nothing at render time — the
 * batch never breaks, which across six cards is the difference between a free
 * effect and two dozen draw calls a frame.
 */
async function cut(url) {
  const img = new Image();
  img.src = url;
  await img.decode();

  const rows = Math.round(img.height / CROWN_CELL.h);
  if (rows < 1 || img.width !== CROWN_CELL.cols * CROWN_CELL.w) return null;

  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  const sheet = canvasTexture(c);

  const out = [];
  for (let i = 0; i < rows * CROWN_CELL.cols; i++) {
    out.push(
      new Texture({
        source: sheet.source,
        frame: new Rectangle(
          (i % CROWN_CELL.cols) * CROWN_CELL.w,
          Math.floor(i / CROWN_CELL.cols) * CROWN_CELL.h,
          CROWN_CELL.w,
          CROWN_CELL.h,
        ),
      }),
    );
  }
  return out;
}

/**
 * Decode every sheet that shipped.
 *
 * Never rejects, and one bad sheet never takes the others with it: an id that
 * fails to decode is simply absent, and its hero's caption is the caption it was
 * before this file existed — lit, but not alight.
 *
 * One after another rather than all at once, and with no frame waits between
 * them: this is on the path of the opening frame, so it can afford neither six
 * simultaneous canvas draws nor core/idle.js's pacing — a queue that waits on
 * requestAnimationFrame never finishes in a tab that is loaded hidden, and
 * everything below this in main.js would be waiting on it.
 */
export async function loadReadyCrowns() {
  if (loaded) return;
  loaded = true;
  for (const id of Object.keys(urls)) {
    try {
      const art = await cut(urls[id]);
      if (art) sheets[id] = art;
    } catch {
      /* the fallback for this element stands; see the header */
    }
  }
}
