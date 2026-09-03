/**
 * The hint hand's art — the hand that points at the swap on offer, in the
 * colour of the gem it is pointing at.
 *
 * Six files in `src/assets/hint`, one per element, cut by
 * tools/pack-neon-hand.mjs off the hand-pose sheet at
 * `src/source/hand/image.png`: a neon outline of a hand with the index finger
 * up, the thumb out, a cuff running off the bottom and the element's sigil on
 * the cuff. The sheet's first row draws that hand once in every element colour,
 * and this is all six of them — the frame the lesson puts round a gem and the
 * arrow it points with already come in six (see art/hintmarks.js), and the hand
 * was the last mark still wearing one colour on a board that had six. Its other
 * three rows are the same hand held straight-on, pointing right and pointing
 * down, which no lesson asks for yet.
 *
 * The set is one texture per element and *one* of everything else. The packer
 * composes all six onto a common canvas with their fingertips on a common point,
 * so the aspect and the anchor below are true of every one of them and changing
 * element is a texture swap and nothing else.
 *
 * This is the second time this sheet has been the one cut. It takes the prop
 * back off `hand-v2.png`, a redraw of the same four-by-six grid in a far
 * narrower line — a long straight finger on a thin palm, 94 pixels across where
 * this one is 160 — which is no longer on disk. Before either of them came six
 * cut off the labelled hint sheet at `src/source/hint/hand-sheet.png`, whose
 * section 10.1 held this pose in these six colours and which is still there;
 * before that the single pale hand at `src/assets/board/hint-hand-neon.webp`,
 * packed when none of this was per-element; and before all of it a painted
 * leather gauntlet at `src/assets/board/hint-hand.webp`, now off disk as well —
 * see .deleted-assets.txt — with tools/pack-hand.mjs still pointed at its own
 * source under src/source, which is where any of these can be packed again.
 *
 * No file name moved across any of those swaps, so each of them was the two
 * numbers below and, when the drawing changed shape as this one did, the three
 * in ui/hand.js that say how big the prop stands on a cell. Coming back to this
 * sheet moved all five again: it is a wider, squatter, heavier-lined hand than
 * the one it replaced, which is a different prop on the board and not a recolour
 * of the same one.
 *
 * The pose is the reason this file holds numbers as well as textures. The hand is
 * not centred on what it points at — it hangs below and to the right of it, the
 * way a real hand over a phone does — so the sprite is anchored on the fingertip,
 * and where that is in the picture was measured by the packer rather than
 * guessed. Anchoring on the middle of the art would put a cuff on the gem and
 * the finger somewhere off the top of the board.
 *
 * See ui/hand.js for the demo it plays, and for the drawn hand it falls back to
 * when these never decode.
 */

import { canvasTexture } from "./textures.js";
import { FIRE, WATER, NATURE, LIGHTNING, ARCANE, WIND } from "../config.js";
import handFireUrl from "../assets/hint/hand-fire.webp";
import handWaterUrl from "../assets/hint/hand-water.webp";
import handNatureUrl from "../assets/hint/hand-nature.webp";
import handLightningUrl from "../assets/hint/hand-lightning.webp";
import handArcaneUrl from "../assets/hint/hand-arcane.webp";
import handWindUrl from "../assets/hint/hand-wind.webp";

const HAND_URLS = {
  [FIRE]: handFireUrl,
  [WATER]: handWaterUrl,
  [NATURE]: handNatureUrl,
  [LIGHTNING]: handLightningUrl,
  [ARCANE]: handArcaneUrl,
  [WIND]: handWindUrl,
};

/**
 * The element whose hand stands in for no element at all.
 *
 * Wind's, which is the pale cyan one — the hand the prop wore before any of this
 * was per-element, and the one the sheet itself uses as the neutral hand in its
 * animation and composition sections. So a hand asked to point at a cell with no
 * element on it, which is what Board.typeAt answers for a gem the boss has
 * encased, still looks like the hand this creative has always had.
 */
const NEUTRAL = WIND;

/** Natural size of the packed art — the same for all six. */
export const HAND_ART = { w: 330, h: 454 };

/** How tall the hand stands to the width it is asked for. */
export const HAND_ASPECT = HAND_ART.h / HAND_ART.w;

/**
 * The fingertip, as fractions of the art — the sprite's anchor, and the point
 * the whole prop exists to put on a cell. Measured, not guessed: the thumb
 * sticks out to the left and the cuff hangs down to the right, so no corner or
 * centre of the bounding box is anywhere near it. The packer finds it as the
 * middle of each hand's topmost solid row, lines all six up on it, and prints
 * where it landed.
 */
export const HAND_TIP = { x: 0.2848, y: 0.0441 };

const hands = {};
let arrived = false;

/**
 * Decode all six before the scene is built.
 *
 * Never rejects, and all or nothing: ui/hand.js picks the painted hand or the
 * drawn one once, when it builds the sprite, and a set that answered for three
 * elements and not the other three would leave it holding a texture for some
 * swaps and nothing for others. One failure stands the whole set down and the
 * plain white hand ui/hand.js draws for itself takes over — plainer, but it
 * points at the right cell.
 */
export async function loadHintHand() {
  if (arrived) return;
  try {
    const types = Object.keys(HAND_URLS);
    await Promise.all(
      types.map(async (type) => {
        const img = new Image();
        img.src = HAND_URLS[type];
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        c.getContext("2d").drawImage(img, 0, 0);
        hands[type] = canvasTexture(c);
      }),
    );
    arrived = types.every((type) => hands[type]);
  } catch {
    arrived = false;
  }
}

/**
 * The painted hand for an element, or null when the art never decoded.
 *
 * Anything that is not one of the six — no argument at all, or the -1 Board
 * reports for an encased cell — gets the neutral hand rather than nothing: the
 * caller asking for a colour it cannot have is not a reason to take the prop
 * away.
 *
 * @param {number=} type the element the hand is pointing at
 */
export function hintHandTexture(type) {
  if (!arrived) return null;
  return hands[type] || hands[NEUTRAL];
}
