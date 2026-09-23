import { Rectangle, Sprite, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import { FIRE, WATER, NATURE, LIGHTNING, ARCANE, WIND } from "../config.js";
import ringFireUrl from "../assets/hint/ring-fire.webp";
import ringWaterUrl from "../assets/hint/ring-water.webp";
import ringNatureUrl from "../assets/hint/ring-nature.webp";
import ringLightningUrl from "../assets/hint/ring-lightning.webp";
import ringArcaneUrl from "../assets/hint/ring-arcane.webp";
import ringWindUrl from "../assets/hint/ring-wind.webp";
import linkFireUrl from "../assets/hint/link-fire.webp";
import linkWaterUrl from "../assets/hint/link-water.webp";
import linkNatureUrl from "../assets/hint/link-nature.webp";
import linkLightningUrl from "../assets/hint/link-lightning.webp";
import linkArcaneUrl from "../assets/hint/link-arcane.webp";
import linkWindUrl from "../assets/hint/link-wind.webp";

const RING_ART = {
  [FIRE]: ringFireUrl,
  [WATER]: ringWaterUrl,
  [NATURE]: ringNatureUrl,
  [LIGHTNING]: ringLightningUrl,
  [ARCANE]: ringArcaneUrl,
  [WIND]: ringWindUrl,
};

const LINK_ART = {
  [FIRE]: linkFireUrl,
  [WATER]: linkWaterUrl,
  [NATURE]: linkNatureUrl,
  [LIGHTNING]: linkLightningUrl,
  [ARCANE]: linkArcaneUrl,
  [WIND]: linkWindUrl,
};

export const RING_AT = 0.36;

const LINK_REPEAT = 2;

const rings = {};
const links = {};
let arrived = false;

async function texture(url, repeat) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const copies = repeat || 1;
  const c = document.createElement("canvas");
  c.width = img.width * copies;
  c.height = img.height;
  const ctx = c.getContext("2d");
  for (let i = 0; i < copies; i++) ctx.drawImage(img, i * img.width, 0);
  return canvasTexture(c);
}

export async function loadMatchLink() {
  try {
    const types = Object.keys(RING_ART);
    await Promise.all(
      types.map(async (type) => {
        rings[type] = await texture(RING_ART[type]);
        links[type] = await texture(LINK_ART[type], LINK_REPEAT);
      }),
    );
    arrived = types.every((type) => rings[type] && links[type]);
  } catch {
    arrived = false;
  }
}

export function matchLinkReady(type) {
  if (!arrived) return false;
  if (type === undefined) return true;
  return !!rings[type] && !!links[type];
}

export function ringSprite(type) {
  const tex = arrived && rings[type];
  if (!tex) return null;
  const sprite = new Sprite(tex);
  sprite.anchor.set(0.5);
  sprite.blendMode = "add";
  return sprite;
}

export function linkSprite(type) {
  const strip = arrived && links[type];
  if (!strip) return null;
  const span = strip.width / LINK_REPEAT;
  const window = new Texture({
    source: strip.source,
    frame: new Rectangle(0, 0, span, strip.height),
    dynamic: true,
  });
  const sprite = new Sprite(window);
  sprite.anchor.set(0, 0.5);
  sprite.blendMode = "add";
  return sprite;
}

export function slideLink(sprite, shift) {
  const tex = sprite.texture;
  const span = tex.frame.width;
  tex.frame.x = ((shift % span) + span) % span;
  tex.update();
}
