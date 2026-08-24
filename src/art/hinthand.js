/**
 * The hint hand's art — the gauntlet that points at the swap on offer.
 *
 * `src/assets/board/hint-hand.webp` is a 320x459 cutout packed out of a 1254x1254
 * render by tools/pack-hand.mjs: a leather glove with the index finger up, the
 * thumb out, and a plated cuff running off the bottom right.
 *
 * The pose is the whole reason this file holds numbers as well as a texture.
 * The hand is not centred on what it points at — it hangs below and to the
 * right of it, the way a real hand over a phone does — so the sprite is anchored
 * on the fingertip, and where that is in the picture was measured by the packer
 * rather than guessed. Anchoring on the middle of the art would put a leather
 * cuff on the gem and the finger somewhere off the top of the board.
 *
 * See ui/hand.js for the demo it plays, and for the drawn hand it falls back to
 * when this never decodes.
 */

import { canvasTexture } from "./textures.js";
import handUrl from "../assets/board/hint-hand.webp";

/** Natural size of the packed art. */
export const HAND_ART = { w: 320, h: 459 };

/** How tall the hand stands to the width it is asked for. */
export const HAND_ASPECT = HAND_ART.h / HAND_ART.w;

/**
 * The fingertip, as fractions of the art — the sprite's anchor, and the point
 * the whole prop exists to put on a cell. Measured, not guessed: the thumb
 * sticks out to the left and the sleeve hangs down to the right, so no corner or
 * centre of the bounding box is anywhere near it.
 */
export const HAND_TIP = { x: 0.1096, y: 0.0167 };

let handTexture = null;

/**
 * Decode the hand before the scene is built.
 *
 * Never rejects: ui/hand.js draws the plain white hand it shipped with instead,
 * which is plainer but still points at the right cell. Every reference to the
 * texture is guarded for that reason.
 */
export async function loadHintHand() {
  if (handTexture) return handTexture;
  try {
    const img = new Image();
    img.src = handUrl;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    handTexture = canvasTexture(c);
  } catch {
    handTexture = null;
  }
  return handTexture;
}

/** The painted hand, or null when the art never decoded. */
export function hintHandTexture() {
  return handTexture;
}
