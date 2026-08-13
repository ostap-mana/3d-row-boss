/**
 * The painted plaque: a near-black panel behind a thin gold rule.
 *
 * The board's frame, and only that — see art/boardframe.js, which squares it up
 * and hangs the grid in it. The hero row used to stand in the same panel at a
 * near five to one aspect; it stands on the arena now.
 *
 * `src/buttons/background-dashboard.png` is a flat 692x144 panel, so the only
 * thing in it that can be got wrong is the rule: four pixels of gold around a
 * ten pixel corner, and both stop reading as a frame the moment they are
 * stretched unevenly. The board is square, which is nowhere near the aspect the
 * bitmap was drawn at — so it is nine-sliced under a uniform scale instead. The
 * rule keeps its weight and the corners stay round at any aspect, and the flat
 * middle takes up all of the slack.
 *
 * The file carries no alpha channel — outside the rounded rule its corners are
 * painted black rather than cut out, which would square both props back off over
 * the arena — so they are clipped away at load.
 */

import { NineSliceSprite } from "pixi.js";
import { canvasTexture } from "./textures.js";
import plaqueUrl from "../buttons/background-dashboard.png";

/** Natural size of the source art. */
export const PLAQUE_ART = { w: 692, h: 144 };

/**
 * The well inside the plaque, measured off the art in its own pixels: the gold
 * rule, plus enough black inside it that whatever is hung in the well is not
 * read as part of the rule. The board's opening derives from this, so the grid
 * and the frame drawn around it can never drift apart.
 */
export const PLAQUE_WELL = { x: 11, y: 11, w: 670, h: 122 };

/** Corner radius of the painted rule, and the slice that has to contain it. */
const RADIUS = 10;
const CORNER = 18;

let plaqueTexture = null;

/**
 * Clip the panel to the radius its own rule is painted at.
 *
 * Without this the corners arrive as opaque black squares outside the gold arc,
 * which is the same problem the card plates have — see art/plates.js — at a
 * different radius: this file's corner is authored in pixels, not as a fraction
 * of the short side.
 */
function clipped(img) {
  const w = img.width;
  const h = img.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  // arcTo rather than roundRect: the creative has to survive old WebViews.
  ctx.beginPath();
  ctx.moveTo(RADIUS, 0);
  ctx.arcTo(w, 0, w, h, RADIUS);
  ctx.arcTo(w, h, 0, h, RADIUS);
  ctx.arcTo(0, h, 0, 0, RADIUS);
  ctx.arcTo(0, 0, w, 0, RADIUS);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, 0, 0);
  return canvasTexture(c);
}

/**
 * Decode the plaque before the first frame is drawn.
 *
 * Never rejects: the board falls back to the panel it drew for itself before any
 * of this art existed, which is plainer but is still a board. Every reference to
 * the sprite is guarded for that reason.
 */
export async function loadPlaque() {
  if (plaqueTexture) return plaqueTexture;
  try {
    const img = new Image();
    img.src = plaqueUrl;
    await img.decode();
    plaqueTexture = clipped(img);
  } catch {
    plaqueTexture = null;
  }
  return plaqueTexture;
}

/** A nine-sliced plaque, or null when the art never decoded. */
export function plaqueSprite() {
  if (!plaqueTexture) return null;
  return new NineSliceSprite({
    texture: plaqueTexture,
    leftWidth: CORNER,
    rightWidth: CORNER,
    topHeight: CORNER,
    bottomHeight: CORNER,
  });
}

/**
 * Sit a plaque in the box it was allotted.
 *
 * The scale is driven by height alone and the width is then asked for in the
 * art's own pixels, so the corner slices land at the same size on both axes: the
 * rule scales with the prop and the extra width is spent entirely on the middle.
 * Setting `width` and `height` outright would pin the corners at their file size
 * — a rule that stayed four pixels whether it was framing a board or a phone.
 */
export function fitPlaque(sprite, box) {
  const k = Math.max(box.h, 1) / PLAQUE_ART.h;
  sprite.scale.set(k);
  sprite.setSize(Math.max(box.w / k, CORNER * 2), PLAQUE_ART.h);
  sprite.x = box.x;
  sprite.y = box.y;
}
