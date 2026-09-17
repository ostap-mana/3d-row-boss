import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import figureUrl from "../assets/outcome/victory-figure.webp";

const SHEET = { cols: 7, cellW: 300, cellH: 300, pad: 2, count: 28 };

export const FIGURE_ASPECT = SHEET.cellW / SHEET.cellH;

const FIGURE_FPS = 9.5;

/**
 * Whether the clip brings its own three stars.
 *
 * It does, and that is the whole reason this one replaced the toast: the figure
 * opens a tome and three gold stars climb out of it, spin, and settle into the
 * same arc src/assets/outcome/stars-victory.webp draws as a still. So the card
 * must not also hang that still above him — see `starsUp` in ui/outcome.js,
 * which drops the painted set on a win and leaves it on a loss, where there is
 * no figure to carry anything.
 *
 * It is exported rather than assumed because the card has to keep working with
 * a clip that has none: the flag is what tells it whether the room above the
 * figure is the figure's or the stars'.
 */
export const FIGURE_CARRIES_STARS = true;

let frames = null;
let loaded = false;
let clock = -1;

export async function loadOutcomeFigures() {
  if (loaded) return frames;
  loaded = true;
  try {
    const img = new Image();
    img.src = figureUrl;
    await img.decode();

    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    const sheet = canvasTexture(c);

    const out = [];
    for (let i = 0; i < SHEET.count; i++) {
      out.push(
        new Texture({
          source: sheet.source,
          frame: new Rectangle(
            SHEET.pad + (i % SHEET.cols) * (SHEET.cellW + SHEET.pad),
            SHEET.pad + Math.floor(i / SHEET.cols) * (SHEET.cellH + SHEET.pad),
            SHEET.cellW,
            SHEET.cellH,
          ),
        }),
      );
    }
    frames = out;
  } catch {
    frames = null;
  }
  return frames;
}

export function figureTexture() {
  if (!frames) return null;
  if (clock < 0) return frames[0];
  const i = Math.floor(clock * FIGURE_FPS);
  return frames[i < frames.length ? i : frames.length - 1];
}

export function stepFigure(dt) {
  if (clock >= 0) clock += dt;
}

export function startFigure() {
  clock = 0;
}

export function stopFigure() {
  clock = -1;
}
