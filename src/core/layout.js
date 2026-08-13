/**
 * Responsive layout solver.
 *
 * Phones only — the creative is built for a 375x667 iPhone SE as the worst
 * case and scales up from there. Both orientations must survive, so every
 * region is derived from the current viewport instead of being authored once.
 */

import { FRAME_ART, FRAME_OPENING } from "../art/boardframe.js";
import { PLAQUE_ART, PLAQUE_WELL } from "../art/plaque.js";

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
 * The hero tray's well as fractions of its outer box — read off the art the same
 * way GRID_RATIO is, so the band the cards get and the panel drawn behind them
 * can never drift apart.
 */
const WELL = {
  x: PLAQUE_WELL.x / PLAQUE_ART.w,
  y: PLAQUE_WELL.y / PLAQUE_ART.h,
  w: PLAQUE_WELL.w / PLAQUE_ART.w,
  h: PLAQUE_WELL.h / PLAQUE_ART.h,
};

/** The card band inside a tray box. */
function wellInside(dock) {
  return {
    x: dock.x + dock.w * WELL.x,
    y: dock.y + dock.h * WELL.y,
    w: dock.w * WELL.w,
    h: dock.h * WELL.h,
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

  // Outer box of the painted tray the hero row stands in, not the row itself:
  // the well inside it is what the cards get. It runs wider and sits lower than
  // the bare band used to — the tray's own rule is what holds the row off the
  // screen edge now, so most of the margin outside it would be spent twice.
  const dockH = clamp(h * 0.125, 66, 132);
  const dock = {
    x: pad * 0.5,
    y: h - dockH - pad * 0.5,
    w: w - pad,
    h: dockH,
  };

  // The board is the hero of the screen: as wide as we can afford, but never
  // so tall that the boss gets squeezed out of frame.
  //
  // `size` is the painted frame's outer box, not the grid — the jewelled
  // border takes about 16% of it, so this budget is that much larger than the
  // bare grid needed. The boss pays for it out of the band above.
  const size = Math.min(w - pad * 2, h * 0.5, 560);
  const cell = (size * GRID_RATIO) / 5;
  const boardY = dock.y - pad * 0.8 - size;
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
    dock,
    cards: { ...wellInside(dock), gap: 6 * ui },
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

  // The same tray as portrait, in the column the board leaves it. It spends the
  // margin the bare card band used to keep on either side and stops half a pad
  // short of the frame, which is the only edge here it must not touch.
  const dockH = clamp(h * 0.19, 54, 116);
  const dock = {
    x: pad * 0.5,
    y: h - dockH - pad * 0.5,
    w: boardX - pad,
    h: dockH,
  };

  const bossTop = hudH;
  const bossH = dock.y - bossTop - pad;
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
    dock,
    cards: { ...wellInside(dock), gap: 5 * ui },
    hud: {
      x: pad * 1.4,
      y: pad * 0.9 + 13 * ui,
      w: w * 0.52,
      h: clamp(h * 0.032, 10, 22),
    },
  };
}
