import { FIRE, WATER, NATURE, LIGHTNING, ARCANE, WIND } from "../config.js";
import { canvasTexture } from "./textures.js";
import blueUrl from "../assets/cards/plate-blue.webp";
import goldUrl from "../assets/cards/plate-gold.webp";
import violetUrl from "../assets/cards/plate-violet.webp";

const CARD_PLATE = {
  [FIRE]: { url: goldUrl, tint: 0xffb08a },
  [WATER]: { url: blueUrl, tint: 0x7fb4ff },
  [NATURE]: { url: blueUrl, tint: 0x9ef0a0 },
  [LIGHTNING]: { url: goldUrl, tint: 0xffffff },
  [ARCANE]: { url: violetUrl, tint: 0xdcb0ff },
  [WIND]: { url: blueUrl, tint: 0xffffff },
};

const plates = {};

function plateTexture(img) {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  return canvasTexture(c);
}

export async function loadCardPlates() {
  const urls = [...new Set(Object.values(CARD_PLATE).map((p) => p.url))];
  await Promise.all(
    urls.map(async (url) => {
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        plates[url] = plateTexture(img);
      } catch {}
    }),
  );
}

export function cardPlate(element) {
  const spec = CARD_PLATE[element];
  const texture = spec && plates[spec.url];
  return texture ? { texture, tint: spec.tint } : null;
}
