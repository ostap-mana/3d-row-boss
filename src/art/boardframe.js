/**
 * The board's frame: the painted plaque, squared up around the play field.
 *
 * It used to be a bitmap of jewelled blue masonry — border *and* field in one
 * 768x736 painting, narrowed from 4:3 by cutting a brick out of each half. That
 * art is gone. The board now wears the same plaque the hero tray does — see
 * art/plaque.js — so the two frames on screen are one frame, and the stonework
 * that used to compete with the gems for attention is a thin gold rule instead.
 *
 * What matters to the layout is unchanged: the grid is hung inside the opening
 * rather than over the frame as a whole, which is the difference between gems
 * sitting on the field and gems sitting on the border.
 */

import { PLAQUE_ART, PLAQUE_WELL, plaqueSprite, fitPlaque } from "./plaque.js";

/**
 * Natural size of the frame — square, and the plaque's own short side.
 *
 * The plaque is nine-sliced, so it has no fixed size of its own to inherit: any
 * square is as natural as any other, and taking the short side is what keeps the
 * rule the weight it is drawn at rather than the weight a 692-wide box would
 * stretch it to.
 */
export const FRAME_ART = { w: PLAQUE_ART.h, h: PLAQUE_ART.h };

/**
 * The play field inside the frame, in the same pixels: the plaque's well, taken
 * off all four sides. Square, unlike the painted frame's opening, so the 4% of
 * uneven scaling Board.fitFrame used to absorb is not needed any more.
 */
export const FRAME_OPENING = {
  x: PLAQUE_WELL.y,
  y: PLAQUE_WELL.y,
  w: FRAME_ART.w - PLAQUE_WELL.y * 2,
  h: FRAME_ART.h - PLAQUE_WELL.y * 2,
};

/**
 * A sprite of the frame, or null when the art never decoded.
 *
 * There is no loader here any more: the plaque is one texture shared with the
 * hero tray, and main.js decodes it once through art/plaque.js. Two loaders over
 * one file would decode it twice and race over which copy the board got.
 */
export function boardFrameSprite() {
  return plaqueSprite();
}

/** Sit the frame in the square box Board.fitFrame worked out for it. */
export function fitBoardFrame(sprite, x, y, size) {
  fitPlaque(sprite, { x, y, w: size, h: size });
}
