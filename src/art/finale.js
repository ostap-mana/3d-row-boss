import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import finaleUrl from "../assets/outcome/fireworks.webp";

const SHEET = { cols: 8, cellW: 139, cellH: 123, pad: 1, count: 62 };

export const FINALE_ASPECT = SHEET.cellW / SHEET.cellH;

export const FINALE_FPS = 12.8;

let frames = null;
let loaded = false;

export async function loadFinaleArt() {
  if (loaded) return frames;
  loaded = true;
  try {
    const img = new Image();
    img.src = finaleUrl;
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

export function finaleFrames() {
  return frames;
}
