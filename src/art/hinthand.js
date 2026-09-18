import { canvasTexture } from "./textures.js";
import { FIRE, WATER, NATURE, LIGHTNING, ARCANE, WIND } from "../config.js";
import handFireUrl from "../assets/hint/hand-fire.webp";
import handWaterUrl from "../assets/hint/hand-water.webp";
import handNatureUrl from "../assets/hint/hand-nature.webp";
import handLightningUrl from "../assets/hint/hand-lightning.webp";
import handArcaneUrl from "../assets/hint/hand-arcane.webp";
import handWindUrl from "../assets/hint/hand-wind.webp";

const HAND_URLS = {
  [FIRE]: handFireUrl,
  [WATER]: handWaterUrl,
  [NATURE]: handNatureUrl,
  [LIGHTNING]: handLightningUrl,
  [ARCANE]: handArcaneUrl,
  [WIND]: handWindUrl,
};

const NEUTRAL = WIND;

const HAND_ART = { w: 330, h: 454 };

export const HAND_ASPECT = HAND_ART.h / HAND_ART.w;

export const HAND_TIP = { x: 0.2848, y: 0.0441 };

const hands = {};
let arrived = false;

export async function loadHintHand() {
  if (arrived) return;
  try {
    const types = Object.keys(HAND_URLS);
    await Promise.all(
      types.map(async (type) => {
        const img = new Image();
        img.src = HAND_URLS[type];
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        c.getContext("2d").drawImage(img, 0, 0);
        hands[type] = canvasTexture(c);
      }),
    );
    arrived = types.every((type) => hands[type]);
  } catch {
    arrived = false;
  }
}

export function hintHandTexture(type) {
  if (!arrived) return null;
  return hands[type] || hands[NEUTRAL];
}
