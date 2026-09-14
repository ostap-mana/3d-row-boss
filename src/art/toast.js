import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import toastUrl from "../assets/outcome/toast.webp";

const SHEET = { cols: 5, cellW: 168, cellH: 298, pad: 2, count: 20 };

export const TOAST_ASPECT = SHEET.cellW / SHEET.cellH;
export const TOAST_FPS = 9;
export const TOAST_COUNT = SHEET.count;

let frames = null;
let loaded = false;

export async function loadToastArt() {
  if (loaded) return frames;
  loaded = true;
  try {
    const img = new Image();
    img.src = toastUrl;
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

export function toastFrames() {
  return frames;
}
