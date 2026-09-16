import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import rakeUrl from "../assets/fx/claw-rake.webp";

const SHEET = { cols: 4, cellW: 384, cellH: 216, pad: 2, count: 12 };

export const RAKE_ASPECT = SHEET.cellW / SHEET.cellH;

let frames = null;
let loaded = false;

export async function loadRakeArt() {
  if (loaded) return frames;
  loaded = true;
  try {
    const img = new Image();
    img.src = rakeUrl;
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

export function rakeFrames() {
  return frames;
}
