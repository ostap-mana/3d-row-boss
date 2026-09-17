import { NineSliceSprite, Sprite } from "pixi.js";
import { canvasTexture } from "./textures.js";
import { FIRE, WATER, NATURE, LIGHTNING, ARCANE, WIND } from "../config.js";
import frameFireUrl from "../assets/hint/frame-fire.webp";
import frameWaterUrl from "../assets/hint/frame-water.webp";
import frameNatureUrl from "../assets/hint/frame-nature.webp";
import frameLightningUrl from "../assets/hint/frame-lightning.webp";
import frameArcaneUrl from "../assets/hint/frame-arcane.webp";
import frameWindUrl from "../assets/hint/frame-wind.webp";
import arrowFireUrl from "../assets/hint/arrow-fire.webp";
import arrowWaterUrl from "../assets/hint/arrow-water.webp";
import arrowNatureUrl from "../assets/hint/arrow-nature.webp";
import arrowLightningUrl from "../assets/hint/arrow-lightning.webp";
import arrowArcaneUrl from "../assets/hint/arrow-arcane.webp";
import arrowWindUrl from "../assets/hint/arrow-wind.webp";

const FRAME_ART = {
  [FIRE]: frameFireUrl,
  [WATER]: frameWaterUrl,
  [NATURE]: frameNatureUrl,
  [LIGHTNING]: frameLightningUrl,
  [ARCANE]: frameArcaneUrl,
  [WIND]: frameWindUrl,
};

const ARROW_ART = {
  [FIRE]: arrowFireUrl,
  [WATER]: arrowWaterUrl,
  [NATURE]: arrowNatureUrl,
  [LIGHTNING]: arrowLightningUrl,
  [ARCANE]: arrowArcaneUrl,
  [WIND]: arrowWindUrl,
};

export const FRAME_SLICE = 0.27;

const frames = {};
const arrows = {};
let arrived = false;

async function texture(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  return canvasTexture(c);
}

export async function loadHintMarks() {
  try {
    const types = Object.keys(FRAME_ART);
    await Promise.all(
      types.map(async (type) => {
        frames[type] = await texture(FRAME_ART[type]);
        arrows[type] = await texture(ARROW_ART[type]);
      }),
    );
    arrived = types.every((type) => frames[type] && arrows[type]);
  } catch {
    arrived = false;
  }
}

export function hintMarksReady(type) {
  if (!arrived) return false;
  if (type === undefined) return true;
  return !!frames[type] && !!arrows[type];
}

export function hintFrameSprite(type) {
  const tex = arrived && frames[type];
  if (!tex) return null;
  const cut = Math.round(tex.width * FRAME_SLICE);
  return new NineSliceSprite({
    texture: tex,
    leftWidth: cut,
    rightWidth: cut,
    topHeight: cut,
    bottomHeight: cut,
  });
}

export function hintArrowSprite(type) {
  const tex = arrived && arrows[type];
  if (!tex) return null;
  const sprite = new Sprite(tex);
  sprite.anchor.set(0.5);
  return sprite;
}
