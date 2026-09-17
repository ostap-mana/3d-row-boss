import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import sheetUrl from "../assets/fx/fire-sheet.webp";

const SHEET = { cols: 5, cell: { w: 399, h: 258 }, count: 10 };

export const FIRE_TRAVEL_LAST = 4;

export const FIRE_ASPECT = SHEET.cell.w / SHEET.cell.h;

export const FIRE_LEAD = (135 * Math.PI) / 180;

let frames = null;

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

export function fireFrames() {
  return frames;
}
