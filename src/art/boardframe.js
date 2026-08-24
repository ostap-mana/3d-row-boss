/**
 * The board's frame: the panel the play field sits in.
 *
 * It has been five things now, and four of them were paintings. Jewelled blue
 * masonry. The hero tray's gold-ruled plaque, on loan. A gold rule on black of
 * its own. A carved obsidian frame with runes and set gems. Every one of them
 * was a bitmap, and every one of them was the wrong answer to the same question,
 * because the question was never "what should the frame look like" — it was
 * "what should be around the only thing on this screen the player touches".
 *
 * The answer is: nothing. So there is no frame — this file is the sixth version
 * of one and the first that draws no pixels at all. The board is the grid, edge
 * to edge, standing on the arena the same way the hero row does.
 *
 * The fifth version was already down to the least a frame can be: a near-black
 * panel and a warm hairline inside its edge. What it still cost is the only
 * thing on a phone worth arguing about. A rule and its margin are a tenth of the
 * board's width, the board's width is the whole screen, and a tenth of the whole
 * screen is two columns of gem — spent on saying "the play field ends here" to a
 * player who can see where it ends. The frame also fixed the board's box to a
 * square with a border, which is why a full-width board never fit on a short
 * phone: the border had to fit too.
 *
 * What is left of this file is the geometry the rest of the board asks it for.
 * Board.fitFrame and core/layout.js are written against a box with an opening in
 * it, and they still are — the opening is simply the whole box now (INSET 0), so
 * every point of the board's width is grid. Keeping the shape of that contract
 * rather than tearing it out is deliberate: it is the seam a frame comes back
 * along if one is ever wanted, and it is two constants wide.
 *
 * The paintings are all still in src/source/board/concepts, and the packer still
 * works, if a frame with more in it is ever wanted back.
 */

import { Container, Sprite } from "pixi.js";
import { softFieldTexture } from "./textures.js";

/**
 * Nominal size of the board's box and the field inside it.
 *
 * Nothing is drawn at these numbers — they are proportions, and the only reason
 * they are pixels at all is that Board.fitFrame and core/layout.js take a box
 * and an opening. A thousand keeps the arithmetic readable.
 */
export const FRAME_ART = { w: 1000, h: 1000 };

/**
 * Inset of the field inside the box: none.
 *
 * It was 50 — 5% a side, a tenth of the board spent on black — then 34 while
 * there was still a rule for the field to stay clear of. With the rule gone
 * there is nothing to stay clear of, and every point of it goes back to the
 * gems: the grid is the box.
 *
 * Left as a named zero rather than deleted along with the frame. GRID_RATIO in
 * core/layout.js and Board.fitFrame both divide the box by the opening, and both
 * come out as the identity at this value — so a frame, a bevel, or a safe area
 * comes back by raising this one number, and nothing downstream has to be
 * rewritten to notice.
 */
const INSET = 0;

export const FRAME_OPENING = {
  x: INSET,
  y: INSET,
  w: FRAME_ART.w - INSET * 2,
  h: FRAME_ART.h - INSET * 2,
};

/**
 * The field the gems stand on, and how far past them it runs.
 *
 * Not a panel. A panel has an edge and an edge is a frame; this is a darkening
 * of the arena that has no boundary anywhere — see softFieldTexture, which
 * feathers all four sides to nothing. The board is drawn on top of the middle of
 * it, so what is under the gems is flat and what is around them is a fade.
 *
 * It exists because half the arena is a bright sky. With nothing behind them the
 * top two rows of gems sat on lit cloud, and the pale wind gem — a white glyph
 * in a white ring — went from a piece on a board to a smudge on a photograph.
 * 0.92 rather than opaque so the arena still reads through it as depth.
 *
 * The bleed is a tenth of the board a side, which on a phone is the fade running
 * off both edges of the screen — the board is the screen's full width, so there
 * is nothing to see it against. Where the board is narrower than the screen (a
 * tablet, or either landscape) the fade is what stands in for the edge the frame
 * used to draw.
 */
const FIELD = "rgba(9,6,17,0.92)";
const BLEED = 0.1;

/**
 * Kept so the boot sequence does not have to care which kind of frame this is.
 * There is nothing to decode any more; main.js awaits it with the rest and it
 * resolves on the spot.
 */
export async function loadBoardFrame() {
  return null;
}

/**
 * The board's backing.
 *
 * A Container holding the field rather than the field itself, because the two
 * want different boxes: the container's origin is the grid's top left corner,
 * which is what Board.fitFrame reads back to place its gems, while the field
 * hangs out past it on every side. One sprite inside one container keeps both
 * true without the board having to know about the bleed.
 */
export function boardFrameSprite() {
  const c = new Container();
  c.field = new Sprite(
    softFieldTexture("board-field", FIELD, BLEED / (1 + BLEED * 2)),
  );
  c.addChild(c.field);
  return c;
}

/**
 * Sit the backing in the box Board.fitFrame worked out.
 *
 * The container is placed at the box, and the field is inflated past it. The
 * board reads `plate.x` and `plate.y` back to work out where its grid starts — a
 * backing that never told anybody where it was would hang the grid in the top
 * left corner of the screen — and with the opening at zero those two numbers are
 * the grid's origin exactly.
 */
export function fitBoardFrame(c, x, y, w, h) {
  const bx = w * BLEED;
  const by = h * BLEED;

  c.x = x;
  c.y = y;

  c.field.x = -bx;
  c.field.y = -by;
  c.field.setSize(w + bx * 2, h + by * 2);
}
