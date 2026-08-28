/**
 * Both gauges on a hero card: the trough, and the paints that go in them.
 *
 * None of it is drawn here. It is all packed by tools/pack-bars.mjs, which is
 * where the reasoning about sizes lives:
 *
 *   bar-trough.webp  160x16  the empty track: the near-black interior of one
 *                            of the ready-made bars in the original asset pack,
 *                            with its baked-in fill cut off. Square and bare —
 *                            the source's two arcs and the rim between them are
 *                            all dropped by the packer, so this is an interior
 *                            and not a frame. It stretches: there is nothing
 *                            along its length.
 *   bar-hp.webp      160x16  the health paint: a green bevel, lit along its top
 *                            row and falling to a dark bottom edge.
 *   bar-hp-low.webp  160x16  the same bevel in the card's own critical red, for
 *                            a hero in trouble. A second file rather than a tint
 *                            because Pixi tints by multiplying, and no multiple
 *                            of green is red.
 *   bar-mana.webp    160x16  the charge paint, the same bevel in blue.
 *
 * All three paints stretch: each is the flat middle of a bar drawn on nothing —
 * `src/source/board/bars/green.png` and `blue.png`, one bar per file
 * with its own alpha — and there is nothing along such a bar's length to hold
 * still: no row of either varies end to end by more than the noise the export
 * was saved with. They leave the packer square, ends included, and a card lays
 * them over the track edge to edge: there is no rim left to sit inside of. See
 * pack-bars.mjs, which used to round both ends off and no longer does.
 *
 * The gloss is gone from all three as of those two files. They were cut from
 * `pill-sheet.png`, whose bars carry a hard specular band across the top third;
 * against the flat frames and plates the rest of a card is built from, that read
 * as plastic. Same bevel, same stretch, a lit top edge instead of a highlight.
 */

import { canvasTexture } from "./textures.js";
import troughUrl from "../assets/board/bar-trough.webp";
import hpUrl from "../assets/board/bar-hp.webp";
import hpLowUrl from "../assets/board/bar-hp-low.webp";
import manaUrl from "../assets/board/bar-mana.webp";

/**
 * How deep the rim ran on the bar the trough was cut from, as a fraction of its
 * height. Measured by the packer off the art — 3 rows of 25 — and printed by it.
 *
 * The rim itself is not shipped any more; this is what is left of it, and it is
 * the seed for every proportion in a card's readout stack — the space between
 * the two gauges, the air over the digits, the weight of their outline. See
 * BAR_RIM in heroes.js, which is this number under the name the layout reads it
 * by. The paint is no longer inset by it, or by anything: nothing frames a gauge.
 */
export const BAR_INSET = 0.12;

const urls = {
  trough: troughUrl,
  hp: hpUrl,
  hpLow: hpLowUrl,
  mana: manaUrl,
};
const textures = {};

/**
 * Decode all of it before the first card is built.
 *
 * Never rejects, and each piece stands alone: with no trough a card draws the
 * faint rounded track it always did, and with no paint it fills that track
 * itself — flat colour and a white gloss band, which is what both gauges were
 * before any of this was art. Any of it missing is a plainer gauge, not a
 * missing one.
 */
export async function loadCardBars() {
  await Promise.all(
    Object.entries(urls).map(async ([key, url]) => {
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        c.getContext("2d").drawImage(img, 0, 0);
        textures[key] = canvasTexture(c);
      } catch {
        /* the card draws its own */
      }
    }),
  );
}

/** The trough the rule sits in, or null when it never decoded. */
export function barTroughTexture() {
  return textures.trough || null;
}

/** The mana paint, or null when it never decoded. */
export function manaPaintTexture() {
  return textures.mana || null;
}

/**
 * The health paint at the state asked for, or null when it never decoded.
 *
 * One entry point for both bakes rather than one each, because the card swaps
 * between them on a threshold it already knows — see HERO_CRITICAL — and a
 * gauge that has the healthy paint but not the critical one would go blank at
 * exactly the moment it matters most. Missing either gives up both.
 */
export function hpPaintTexture(low) {
  if (!textures.hp || !textures.hpLow) return null;
  return low ? textures.hpLow : textures.hp;
}
