import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import popUrl from "../assets/fx/gem-pop.webp";

const SHEET = { cols: 5, cell: 100, count: 10 };

export const POP_ASPECT = 1;

let frames = null;
let loaded = false;

export async function loadGemPopArt() {
  if (loaded) return frames;
  loaded = true;
  try {
    const img = new Image();
    img.src = popUrl;
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
            (i % SHEET.cols) * SHEET.cell,
            Math.floor(i / SHEET.cols) * SHEET.cell,
            SHEET.cell,
            SHEET.cell,
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

export function popFrames() {
  return frames;
}
