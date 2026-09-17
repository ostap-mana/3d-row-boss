import { Sprite } from "pixi.js";
import { canvasTexture } from "./textures.js";
import victoryUrl from "../assets/outcome/victory-band.webp";
import defeatUrl from "../assets/outcome/defeat-band.webp";
import lineUrl from "../assets/outcome/ornament-line.webp";
import starsVictoryUrl from "../assets/outcome/stars-victory.webp";
import starsDefeatUrl from "../assets/outcome/stars-defeat.webp";

export const VERDICT_ART = { w: 816, h: 266 };

export const LINE_ART = { w: 438, h: 29 };

export const STARS_ART = {
  victory: { w: 1230, h: 647 },
  defeat: { w: 1309, h: 775 },
};

export const PLATE_GOLD = 0xf5c65a;

export const PLATE_FILL = 0x101c33;

let victoryTexture = null;
let defeatTexture = null;
let lineTexture = null;
let starsVictoryTexture = null;
let starsDefeatTexture = null;

async function decode(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  return canvasTexture(c);
}

export async function loadOutcomeUi() {
  const into = (url, set) =>
    decode(url)
      .then(set)
      .catch(() => {});
  await Promise.all([
    into(victoryUrl, (t) => {
      victoryTexture = t;
    }),
    into(defeatUrl, (t) => {
      defeatTexture = t;
    }),
    into(lineUrl, (t) => {
      lineTexture = t;
    }),
    into(starsVictoryUrl, (t) => {
      starsVictoryTexture = t;
    }),
    into(starsDefeatUrl, (t) => {
      starsDefeatTexture = t;
    }),
  ]);
}

export function verdictSprite(defeat) {
  return sprite(defeat ? defeatTexture : victoryTexture);
}

export function aimVerdict(s, defeat) {
  const t = defeat ? defeatTexture : victoryTexture;
  if (!t) return false;
  s.texture = t;
  return true;
}

export function lineSprite() {
  return sprite(lineTexture);
}

export function starsSprite(defeat) {
  return sprite(defeat ? starsDefeatTexture : starsVictoryTexture);
}

export function aimStars(s, defeat) {
  const t = defeat ? starsDefeatTexture : starsVictoryTexture;
  if (!t) return false;
  s.texture = t;
  return true;
}

export function fitVerdict(s, w) {
  const h = (w * VERDICT_ART.h) / VERDICT_ART.w;
  s.setSize(w, h);
  return h;
}

export function fitLine(s, w) {
  const h = (w * LINE_ART.h) / LINE_ART.w;
  s.setSize(w, h);
  return h;
}

export function fitStars(s, w, defeat) {
  const art = defeat ? STARS_ART.defeat : STARS_ART.victory;
  const h = (w * art.h) / art.w;
  s.setSize(w, h);
  return h;
}

function sprite(texture) {
  if (!texture) return null;
  const s = new Sprite(texture);
  s.anchor.set(0.5);
  return s;
}
