import { canvasTexture } from "./textures.js";
import troughUrl from "../assets/board/bar-trough.webp";
import hpUrl from "../assets/board/bar-hp.webp";
import hpLowUrl from "../assets/board/bar-hp-low.webp";
import manaUrl from "../assets/board/bar-mana.webp";

export const BAR_INSET = 0.12;

const urls = {
  trough: troughUrl,
  hp: hpUrl,
  hpLow: hpLowUrl,
  mana: manaUrl,
};
const textures = {};

export async function loadCardBars() {
  await Promise.all(
    Object.entries(urls).map(async ([key, url]) => {
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        c.getContext("2d").drawImage(img, 0, 0);
        textures[key] = canvasTexture(c);
      } catch {}
    }),
  );
}

export function barTroughTexture() {
  return textures.trough || null;
}

export function manaPaintTexture() {
  return textures.mana || null;
}

export function hpPaintTexture(low) {
  if (!textures.hp || !textures.hpLow) return null;
  return low ? textures.hpLow : textures.hp;
}
