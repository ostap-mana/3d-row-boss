import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import victoryUrl from "../assets/outcome/victory-figure.webp";
import defeatUrl from "../assets/outcome/defeat-figure.webp";

const SHEETS = {
  victory: {
    url: victoryUrl,
    cols: 7,
    cellW: 300,
    cellH: 300,
    pad: 2,
    count: 28,
  },
  defeat: {
    url: defeatUrl,
    cols: 8,
    cellW: 300,
    cellH: 300,
    pad: 2,
    count: 38,
  },
};

export const FIGURE_ASPECT = SHEETS.victory.cellW / SHEETS.victory.cellH;

const FIGURE_FPS = 9.5;

/**
 * Whether the clips bring their own three stars.
 *
 * Both do, and that is the whole reason they replaced the toast and the empty
 * loss card. The win figure opens a tome and three gold stars climb out of it
 * and settle into the arc stars-victory.webp draws as a still; the loss figure
 * starts from that same held arc and the gold drains out of the three until
 * they are the obsidian set stars-defeat.webp draws. So the card must not also
 * hang those stills over either of them — see `starsUp` in ui/outcome.js.
 *
 * It is exported rather than assumed because the card has to keep working with
 * a clip that has none: the flag is what tells it whether the room above the
 * figure is the figure's or the stars'.
 */
export const FIGURE_CARRIES_STARS = true;

const frames = { victory: null, defeat: null };
let loaded = false;
let clock = -1;

async function cut(sheet) {
  const img = new Image();
  img.src = sheet.url;
  await img.decode();

  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  const source = canvasTexture(c).source;

  const out = [];
  for (let i = 0; i < sheet.count; i++) {
    out.push(
      new Texture({
        source,
        frame: new Rectangle(
          sheet.pad + (i % sheet.cols) * (sheet.cellW + sheet.pad),
          sheet.pad + Math.floor(i / sheet.cols) * (sheet.cellH + sheet.pad),
          sheet.cellW,
          sheet.cellH,
        ),
      }),
    );
  }
  return out;
}

/**
 * Decode both sheets, and never let one take the other with it.
 *
 * Settled separately because the endings are shown separately: a build where
 * only the loss sheet decoded still plays its loss, and the win falls back to
 * the card it had before a figure existed. `fitFigure` reads the set for the
 * ending it is drawing and treats a missing one as "no figure", which is a case
 * the card has always handled.
 */
export async function loadOutcomeFigures() {
  if (loaded) return frames;
  loaded = true;
  for (const key of ["victory", "defeat"]) {
    try {
      frames[key] = await cut(SHEETS[key]);
    } catch {
      frames[key] = null;
    }
  }
  return frames;
}

export function figureTexture(defeat) {
  const set = frames[defeat ? "defeat" : "victory"];
  if (!set) return null;
  if (clock < 0) return set[0];
  const i = Math.floor(clock * FIGURE_FPS);
  return set[i < set.length ? i : set.length - 1];
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
