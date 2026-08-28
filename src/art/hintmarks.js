/**
 * The lesson's marks — the corner frame it puts round a gem and the arrow it
 * points with.
 *
 * Twelve files in `src/assets/hint`, two per element, cut by
 * tools/pack-hint-marks.mjs off the neon UI sheet at `src/source/hint/marks-sheet.png` —
 * the same sheet the painted gems came off, which is why these sit round them
 * as if they were drawn to. See the packer for how they were found.
 *
 * A frame is a square with four corner brackets in it and nothing in the
 * middle, so it is nine-sliced rather than stretched: the lesson puts one round
 * a single gem and, when the run is made, one round all three at once, and the
 * brackets have to be the same size in both. FRAME_SLICE is where to cut.
 *
 * An arrow is packed pointing right whatever direction it was drawn in, so the
 * four the board needs are one sprite and a rotation.
 *
 * Nothing here throws. Every one of these is a decode that can fail on a
 * WebView that will not take webp, and the lesson is the one thing on screen
 * that has to survive that — so `ready()` says whether the art arrived and
 * ui/coach.js draws its own rings and dart when it did not.
 */

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

/**
 * Where the nine-slice cuts, as a fraction of the frame's side.
 *
 * Just past the widest corner on the sheet, which is what the packer measures
 * and prints. Everything between the cuts is empty, so the strips that stretch
 * carry nothing and a frame round three gems has the same brackets as a frame
 * round one.
 */
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

/**
 * Decode all twelve before the scene is built.
 *
 * Never rejects, and all or nothing: a lesson wearing painted frames round one
 * element and drawn rings round another would look like a bug rather than like
 * a fallback, so one failure stands the whole set down.
 */
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

/**
 * Whether the painted marks are there to be used.
 *
 * With an element, whether they are there *for that element*. The set is all or
 * nothing on decode, but the caller can hand in a type that was never one of
 * the six — Board.typeAt answers -1 for a cell the boss has encased — and the
 * honest answer for that is the same as for a set that never arrived.
 *
 * @param {number=} type the element being asked about, or every one of them
 */
export function hintMarksReady(type) {
  if (!arrived) return false;
  if (type === undefined) return true;
  return !!frames[type] && !!arrows[type];
}

/** A nine-sliced corner frame for an element, or null when the art is absent. */
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

/** An arrow for an element, pointing right, anchored on its middle. */
export function hintArrowSprite(type) {
  const tex = arrived && arrows[type];
  if (!tex) return null;
  const sprite = new Sprite(tex);
  sprite.anchor.set(0.5);
  return sprite;
}
