import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import toastUrl from "../assets/outcome/toast.webp";
import spurnUrl from "../assets/outcome/spurn.webp";

const SHEET = { cols: 5, cellW: 320, cellH: 206, pad: 2, count: 20 };

export const TOAST_ASPECT = SHEET.cellW / SHEET.cellH;
export const TOAST_FPS = 9;
export const TOAST_COUNT = SHEET.count;

let toast = null;
let spurn = null;
let loaded = false;

async function cutSheet(url) {
  try {
    const img = new Image();
    img.src = url;
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
    return out;
  } catch {
    return null;
  }
}

export async function loadToastArt() {
  if (loaded) return toast;
  loaded = true;
  [toast, spurn] = await Promise.all([cutSheet(toastUrl), cutSheet(spurnUrl)]);
  return toast;
}

export function toastFrames() {
  return toast;
}

export function spurnFrames() {
  return spurn;
}
