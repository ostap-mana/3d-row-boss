/**
 * The painted lances the volley throws, one per element.
 *
 * One drawing per element, thrown by `Vfx.ultCast` and by nothing else.
 *
 * The ultimate is the only thing in the fight that gets one. A match fires
 * `Vfx.beam` once per hero left standing and those stay what they always were —
 * art/textures.js's gradient stretched from the card with a white quad down the
 * middle, told apart by a tint. That is the point: spending an ultimate has to
 * look like something a match cannot buy, and a volley throwing the same lances
 * spent the biggest art in the fight every third second. It is a
 * still, not a flipbook — the beam is on screen for about a fifth of a second
 * and a sheet would be four frames nobody sees — and it carries its own core,
 * its own torn edges and its own light, which is the whole reason it is worth
 * the bytes.
 *
 * ## Two things this module is strict about
 *
 * **No tint by default.** The lance is painted in its element's own colour, and
 * a tint in Pixi is a multiply: laying GEM_COLORS over a white-hot core turns
 * the core into the tint and throws away the one part of the drawing that makes
 * it read as hot. `tint` stays here as a field so an element whose art arrives
 * off-palette can be pulled back without a repack, and it is null for anything
 * drawn right.
 *
 * **The aspect is measured, never declared.** `Vfx.ultCast` sizes the lance by
 * its length and takes the height from this, so reading it off the decoded image
 * — one cell of it, for a strip — means a redraw at a different shape needs
 * nothing here changed. tools/pack-bolt.mjs is what
 * crops and mirrors, and its header says why the mirror is not optional.
 *
 * Missing art is not an error. `boltArt` answers null and the element's ultimate
 * falls back to the jet or the sheet it threw before — the same bargain art/streams.js and art/spells.js make,
 * and the reason a half-finished set still ships.
 */

import { ImageSource, Rectangle, Texture } from "pixi.js";
import { ARCANE, FIRE, LIGHTNING, NATURE, WATER, WIND } from "../config.js";
import fireUrl from "../assets/fx/fire-bolt.webp";
import waterUrl from "../assets/fx/water-lance.webp";
import natureUrl from "../assets/fx/nature-bolt.webp";
import lightningUrl from "../assets/fx/lightning-bolt.webp";
import arcaneUrl from "../assets/fx/arcane-bolt.webp";
import windUrl from "../assets/fx/wind-bolt.webp";

/**
 * Four of these are rows off one sheet, src/source/fx/lances.png, cut by
 * tools/pack-bolt.mjs --row, and they hold one frame each.
 *
 * WATER is the one that moves: `cells` says its file is a strip of frames out
 * of tools/pack-lance.mjs, keyed off the green-screen clip the bolt was
 * generated as, and the ribbons turn inside it while it flies. A still lance
 * crossing the arena is a decal being slid; this one is travelling. It costs
 * eight times the bytes of a still, which is why it is a field and not the rule
 * — an element earns a strip by being worth 46 KB.
 *
 * WIND is the odd one out for a different reason. The sheet has a sixth lance,
 * but it is a second violet — a void bolt with dark orbs turning in it — and
 * the roster has only one violet slot. So ARCANE takes the bright violet that
 * matches its own #A855F7 and WIND keeps the pale aqua lance that arrived on
 * its own, which is the colour WIND has on the board. The void row stays in the
 * sheet, unpacked, for whatever wants it.
 */
const ART = {
  [FIRE]: { url: fireUrl, tint: null },
  [WATER]: { url: waterUrl, tint: null, cells: 8 },
  [NATURE]: { url: natureUrl, tint: null },
  [LIGHTNING]: { url: lightningUrl, tint: null },
  [ARCANE]: { url: arcaneUrl, tint: null },
  [WIND]: { url: windUrl, tint: null },
};

let bolts = null;
let loaded = false;

async function cut(entry) {
  const img = new Image();
  img.src = entry.url;
  await img.decode();
  const source = new ImageSource({ resource: img });
  const cells = entry.cells || 1;
  const w = img.width / cells;
  const frames = [];
  for (let i = 0; i < cells; i++) {
    frames.push(
      cells === 1
        ? new Texture({ source })
        : new Texture({
            source,
            frame: new Rectangle(i * w, 0, w, img.height),
          }),
    );
  }
  return { frames, aspect: w / img.height, tint: entry.tint };
}

export async function loadBoltArt() {
  if (loaded) return bolts;
  loaded = true;
  const out = {};
  for (const element of Object.keys(ART)) {
    try {
      out[element] = await cut(ART[element]);
    } catch {
      /* that element keeps the beam it already throws */
    }
  }
  bolts = out;
  return bolts;
}

export function boltArt(element) {
  return (bolts && bolts[element]) || null;
}
