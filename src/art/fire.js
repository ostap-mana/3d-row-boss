/**
 * Ricklow's ultimate, as ten painted frames.
 *
 * `src/assets/fx/fire-sheet.webp` — a 5x2 grid cut by tools/pack-fire.mjs off a
 * page of fire studies that was never a sprite sheet. Read that tool's header
 * for what had to be done to it; what matters here is the one thing it decided
 * that this file has to honour.
 *
 * The sheet has no alpha. Its backdrop was subtracted rather than cut away, so
 * every frame is fire on black and **must** be drawn with the `add` blend. Drawn
 * normally it arrives as a flame in a black box.
 *
 * Frames 0..4 are the fireball coming in; 5..9 are it landing. Every frame sits
 * centred in its own cell at its own size, so the swell from a guttering flame
 * to a detonation is in the art and not in a scale tween on top of it.
 */

import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import sheetUrl from "../assets/fx/fire-sheet.webp";

/** The grid, exactly as tools/pack-fire.mjs packed it. */
const SHEET = { cols: 5, cell: { w: 399, h: 258 }, count: 10 };

/** Where the fireball ends and the blast begins. */
export const FIRE_TRAVEL_LAST = 4;

/** The cell's aspect, which is the only shape the game needs from the sheet. */
export const FIRE_ASPECT = SHEET.cell.w / SHEET.cell.h;

/**
 * Which way the painted comet is already flying.
 *
 * Its head is at the bottom left and its tail runs off to the top right, so the
 * drawing travels down and to the left — 135 degrees. Every use of it turns by
 * the difference between this and where it is actually going, or the fireball
 * arrives at the boss tail first.
 */
export const FIRE_LEAD = (135 * Math.PI) / 180;

let frames = null;

/**
 * Decode the sheet before the first frame.
 *
 * Never rejects: without it `fireFrames()` returns null and the fire hero's
 * ultimate falls back to the beam every other hero throws, which is where it
 * started.
 *
 * Every frame is a window onto one texture rather than a texture of its own, so
 * swapping frames costs nothing at render time — the batch never breaks.
 */
export async function loadFireArt() {
  if (frames) return frames;
  try {
    const img = new Image();
    img.src = sheetUrl;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    const sheet = canvasTexture(c);

    const cut = [];
    for (let i = 0; i < SHEET.count; i++) {
      cut.push(
        new Texture({
          source: sheet.source,
          frame: new Rectangle(
            (i % SHEET.cols) * SHEET.cell.w,
            Math.floor(i / SHEET.cols) * SHEET.cell.h,
            SHEET.cell.w,
            SHEET.cell.h,
          ),
        }),
      );
    }
    frames = cut;
  } catch {
    frames = null;
  }
  return frames;
}

/** The ten frames, or null if the sheet never arrived. */
export function fireFrames() {
  return frames;
}
