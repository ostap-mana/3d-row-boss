/**
 * The painted CTA button — the gold plate under PLAY NOW on the end card.
 *
 * Not the plate the HUD carries: that one is the end card's own painted gem
 * plate at a smaller width — see art/brand.js. This is the gold panel behind
 * it, and the two are separate surfaces because this one is asked for at a far
 * wider spread of aspects than any single bitmap can hold.
 *
 * `src/assets/ui/golden-button.png` is a 698x172 panel: a flat gold field, a four
 * pixel darker rim around it, and a nine pixel corner. Measured off the file
 * rather than guessed, because both of those are the whole look of the thing and
 * both stop reading the moment they are stretched unevenly — the button is asked
 * for at nearly 4:1 on a phone held upright and past 9:1 on one held sideways,
 * which is far too wide a spread to fit one bitmap to.
 *
 * So it is nine-sliced under a uniform scale, the same way the board's frame is
 * — see art/boardframe.js. The rim keeps its weight, the corners stay round at
 * any aspect, and the flat middle takes up all of the slack.
 */

import { NineSliceSprite } from "pixi.js";
import { canvasTexture } from "./textures.js";
import buttonUrl from "../assets/ui/golden-button.png";

/** Natural size of the source art. */
export const BUTTON_ART = { w: 698, h: 172 };

/**
 * Slice that has to contain the whole corner: the nine pixel arc plus the four
 * pixel rim it runs through, with room to spare.
 */
const CORNER = 16;

/**
 * The plate's own colours, sampled out of the file.
 *
 * Exported because the end card draws a stand-in when the bitmap does not
 * decode, and a stand-in that is not the colour of the thing it stands in for
 * is worse than no art at all. The label goes darker than the rim, or the
 * button reads as three golds stacked on each other.
 */
export const BUTTON_FILL = 0xe5bd45;
export const BUTTON_RIM = 0xbd9a28;
export const BUTTON_LABEL = 0x2e1c02;

let buttonTexture = null;

/**
 * Decode the plate before the end card is built.
 *
 * Never rejects: the card falls back to the drawn pill it shipped with, which is
 * plainer but is still a button the player can hit. Every reference to the
 * sprite is guarded for that reason.
 */
export async function loadCtaButton() {
  if (buttonTexture) return buttonTexture;
  try {
    const img = new Image();
    img.src = buttonUrl;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    buttonTexture = canvasTexture(c);
  } catch {
    buttonTexture = null;
  }
  return buttonTexture;
}

/** A nine-sliced button plate, or null when the art never decoded. */
export function ctaButtonSprite() {
  if (!buttonTexture) return null;
  return new NineSliceSprite({
    texture: buttonTexture,
    leftWidth: CORNER,
    rightWidth: CORNER,
    topHeight: CORNER,
    bottomHeight: CORNER,
  });
}

/**
 * Sit the plate in a box of `w` by `h`, centred on its parent's origin — which
 * is where the end card's button container puts its text.
 *
 * The scale is driven by height alone and the width is then asked for in the
 * art's own pixels, so the corner slices land at the same size on both axes.
 * Setting `width` and `height` outright would pin the corners at their file size
 * and give a 46 pixel button the same rim as a 76 pixel one.
 */
export function fitCtaButton(sprite, w, h) {
  const k = Math.max(h, 1) / BUTTON_ART.h;
  sprite.scale.set(k);
  sprite.setSize(Math.max(w / k, CORNER * 2), BUTTON_ART.h);
  sprite.x = -w / 2;
  sprite.y = -h / 2;
}
