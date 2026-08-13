/**
 * Responsive layout solver.
 *
 * Phones only — the creative is built for a 375x667 iPhone SE as the worst
 * case and scales up from there. Both orientations must survive, so every
 * region is derived from the current viewport instead of being authored once.
 */

import { FRAME_ART, FRAME_OPENING } from "../art/boardframe.js";

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** Natural drawing size of the boss rig, used to fit it into its region. */
export const BOSS_ART = { w: 560, h: 460 };

/**
 * Play grid as a fraction of the board's outer box — the frame's stone border
 * is the rest of it. Read off the art so that `board.cell` here and the cell
 * Board actually lays out can never drift apart.
 */
const GRID_RATIO =
  1 / Math.max(FRAME_ART.w / FRAME_OPENING.w, FRAME_ART.h / FRAME_OPENING.h);

/**
 * Inset of the card band inside the row's box, as fractions of that box.
 *
 * These were the well of the painted tray the row used to stand in, read off its
 * art. The tray is gone and the cards stand on the arena, but the inset stays:
 * it is the margin that holds the row off the bottom of the screen, and the size
 * every card was sized and tuned at.
 */
const BAND = { x: 0.016, y: 0.076, w: 0.968, h: 0.847 };

/** The card band inside a row box. */
function bandInside(row) {
  return {
    x: row.x + row.w * BAND.x,
    y: row.y + row.h * BAND.y,
    w: row.w * BAND.w,
    h: row.h * BAND.h,
  };
}

export function computeLayout(w, h) {
  const portrait = h >= w;
  const ui = clamp(Math.min(w, h) / 375, 0.72, 2.0);

  return portrait ? portraitLayout(w, h, ui) : landscapeLayout(w, h, ui);
}

function portraitLayout(w, h, ui) {
  const pad = 10 * ui;

  const hudH = clamp(h * 0.085, 48, 96);

  // Outer box the hero row is allotted, not the cards themselves: the band
  // inside it is what they get.
  const rowH = clamp(h * 0.125, 66, 132);
  const row = {
    x: pad * 0.5,
    y: h - rowH - pad * 0.5,
    w: w - pad,
    h: rowH,
  };

  // The board is the hero of the screen: as wide as we can afford, but never
  // so tall that the boss gets squeezed out of frame.
  //
  // `size` is the painted frame's outer box, not the grid — the jewelled
  // border takes about 16% of it, so this budget is that much larger than the
  // bare grid needed. The boss pays for it out of the band above.
  const size = Math.min(w - pad * 2, h * 0.5, 560);
  const cell = (size * GRID_RATIO) / 5;
  const boardY = row.y - pad * 0.8 - size;
  const boardX = (w - size) / 2;

  const bossTop = hudH + pad * 0.4;
  const bossH = boardY - bossTop - pad * 0.5;
  const bossW = w * 0.92;
  const bossScale = Math.min(bossW / BOSS_ART.w, bossH / BOSS_ART.h);

  return {
    w,
    h,
    ui,
    portrait: true,
    board: { x: boardX, y: boardY, size, cell },
    boss: {
      x: w / 2,
      y: bossTop + bossH * 0.52,
      scale: bossScale,
      floor: bossTop + bossH,
    },
    cards: { ...bandInside(row), gap: 6 * ui },
    hud: {
      x: pad * 1.6,
      // Leaves room above the bar for the boss name and any notch cutout.
      y: pad * 1.1 + 14 * ui,
      w: w - pad * 3.2,
      h: clamp(h * 0.018, 12, 26),
    },
  };
}

function landscapeLayout(w, h, ui) {
  const pad = 9 * ui;

  const hudH = clamp(h * 0.13, 40, 84);

  // Board hugs the right edge — thumb reach on a held-sideways phone.
  // Same as portrait: this is the frame's outer box, so the grid inside it is
  // roughly 84% of the number.
  const size = Math.min(h - hudH - pad * 2.4, w * 0.5, 520);
  const cell = (size * GRID_RATIO) / 5;
  const boardX = w - size - pad * 1.4;
  const boardY = hudH + (h - hudH - size) / 2;

  const leftW = boardX - pad * 2;

  // The same row as portrait, in the column the board leaves it. It stops half a
  // pad short of the frame, which is the only edge here it must not touch.
  const rowH = clamp(h * 0.19, 54, 116);
  const row = {
    x: pad * 0.5,
    y: h - rowH - pad * 0.5,
    w: boardX - pad,
    h: rowH,
  };

  const bossTop = hudH;
  const bossH = row.y - bossTop - pad;
  const bossScale = Math.min((leftW * 0.98) / BOSS_ART.w, bossH / BOSS_ART.h);

  return {
    w,
    h,
    ui,
    portrait: false,
    board: { x: boardX, y: boardY, size, cell },
    boss: {
      x: pad + leftW / 2,
      y: bossTop + bossH * 0.5,
      scale: bossScale,
      floor: bossTop + bossH,
    },
    cards: { ...bandInside(row), gap: 5 * ui },
    hud: {
      x: pad * 1.4,
      y: pad * 0.9 + 13 * ui,
      w: w * 0.52,
      h: clamp(h * 0.032, 10, 22),
    },
  };
}
