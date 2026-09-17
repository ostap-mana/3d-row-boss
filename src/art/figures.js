import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import victoryUrl from "../assets/outcome/victory-figure.webp";
import defeatUrl from "../assets/outcome/defeat-figure.webp";

const SHEETS = {
  victory: {
    url: victoryUrl,
    cols: 7,
    cellW: 187,
    cellH: 187,
    pad: 1,
    count: 28,
  },
  defeat: {
    url: defeatUrl,
    cols: 8,
    cellW: 187,
    cellH: 187,
    pad: 1,
    count: 38,
  },
};

export const FIGURE_ASPECT = SHEETS.victory.cellW / SHEETS.victory.cellH;

const FIGURE_FPS = 9.5;

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
