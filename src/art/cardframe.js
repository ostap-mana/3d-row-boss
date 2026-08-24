/**
 * The frame a hero card wears, one per element.
 *
 * Six thin rounded outlines — a line four pixels thick with a small radius, in
 * the roster's six colours — keyed off a flat sheet by
 * tools/pack-outline-frames.mjs. The sheet had no alpha channel: the middle of
 * every frame was painted the same dark navy as the page behind it, so the
 * packer is what turns six dark tiles into six borders with nothing inside them.
 *
 * All six leave the packer on one grid: a 120x264 border box in a 124x268
 * canvas, the two pixels of margin all round being where the line's own
 * antialiasing lives. A card is neither 124 nor 268 of anything, so the frame is
 * nine-sliced under a uniform scale, the way the board's is (see
 * art/boardframe.js): the line keeps its weight, the corners keep their radius,
 * and the flat middle of each side takes up all of the slack.
 *
 * The card hands its own box to fitCardFrame and gets the frame laid *on* that
 * box, margin hanging outside it. That is the whole contract, and it has not
 * changed: the cards wore a set of thick neon frames on this same contract until
 * these arrived. That art is still in src/assets/cards/frame-<colour>.webp, with
 * tools/slice-frames.mjs and tools/pack-frames.mjs still pointed at its own
 * sheet — swapping the six imports below back is the whole revert.
 */

import { NineSliceSprite } from "pixi.js";
import { FIRE, WATER, NATURE, LIGHTNING, ARCANE, WIND } from "../config.js";
import { canvasTexture } from "./textures.js";
import { getRenderer } from "../core/context.js";
import redUrl from "../assets/cards/outline-red.webp";
import cyanUrl from "../assets/cards/outline-cyan.webp";
import greenUrl from "../assets/cards/outline-green.webp";
import orangeUrl from "../assets/cards/outline-orange.webp";
import purpleUrl from "../assets/cards/outline-purple.webp";
import greyUrl from "../assets/cards/outline-grey.webp";

/**
 * Which frame each element wears.
 *
 * Read off the palette rather than picked by taste: every one of these is the
 * nearest hue on the sheet to that element's own gem colour, which is the thing
 * the card exists to tell the player about. Wind takes the grey because wind is
 * the palest element in the set and grey is what is left — and the two agree.
 */
const ELEMENT_FRAME = {
  [FIRE]: redUrl,
  [WATER]: cyanUrl,
  [NATURE]: greenUrl,
  [LIGHTNING]: orangeUrl,
  [ARCANE]: purpleUrl,
  [WIND]: greyUrl,
};

/**
 * The packed geometry, printed by tools/pack-outline-frames.mjs: how tall the
 * border box is, the margin round it, and the line's own thickness and corner
 * radius inside it.
 *
 * Height only. The six files are 264 tall to the pixel and between 125 and 136
 * wide, because the sheet's rectangles are not all the same width and squashing
 * them to one would have squashed their lines by different amounts with them.
 * Width is the dimension a nine-slice does not have to agree on: the flat middle
 * of the top and bottom runs is stretched to whatever the card asks for.
 */
const BOX_H = 264;
const MARGIN = 2;
const BORDER = 3;
const RADIUS = 4;

/**
 * Slice that has to contain a whole corner: the margin, the arc, the line it is
 * drawn with, and a pixel of slack so the slice line falls on straight edge
 * rather than on the last of the curve.
 */
const CORNER = MARGIN + RADIUS + BORDER + 1;

const textures = {};

/**
 * Decode all six before the first card is built.
 *
 * Never rejects: a card whose frame is missing draws the rounded stroke it
 * shipped with, which is plainer but is still a card with an edge — see
 * drawFrame in art/heroes.js. Every reference to the texture is guarded for that
 * reason.
 */
export async function loadCardFrames() {
  await Promise.all(
    Object.entries(ELEMENT_FRAME).map(async ([element, url]) => {
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        c.getContext("2d").drawImage(img, 0, 0);
        textures[element] = canvasTexture(c);
      } catch {
        /* the drawn stroke stands in */
      }
    }),
  );
}

/** A nine-sliced frame for an element, or null when the art never decoded. */
export function cardFrameSprite(element) {
  const texture = textures[element];
  if (!texture) return null;
  return new NineSliceSprite({
    texture,
    leftWidth: CORNER,
    rightWidth: CORNER,
    topHeight: CORNER,
    bottomHeight: CORNER,
  });
}

/**
 * How hard to scale the art for a card `h` tall — and then rounded so the line
 * lands on whole device pixels.
 *
 * The rounding is the point of this function. A 3 pixel line asked for at 2.7
 * device pixels is drawn as two rows of full colour and one of half, and on a
 * hairline that half row is the difference between an edge and a smudge: the
 * bottom of every card was coming out visibly heavier than the top, because the
 * two edges of a card 117.4 points tall land on opposite sides of a pixel. Whole
 * pixels for the line, and the same number of them on all four sides.
 *
 * Height alone, not the mean of the sides. The frame is a hairline rather than a
 * heavy border, and what matters about a hairline is that it is the same weight
 * on every card in the row — which one number, taken off the one dimension every
 * card in a row shares, is what guarantees.
 */
function frameScale(h) {
  const dpr = getRenderer().resolution;
  const raw = Math.max(h, 1) / BOX_H;
  const px = Math.max(1, Math.round(BORDER * raw * dpr));
  return px / (BORDER * dpr);
}

/**
 * The corner radius the frame's line is drawn at on a card `h` tall.
 *
 * Exported because the card clips its portrait and its plate to its own rounded
 * rectangle, and the two have to be the same rectangle: a portrait rounded
 * harder than the frame around it leaves four transparent bites out of the
 * corners, and one rounded softer pokes out through the border.
 */
export function cardFrameRadius(h) {
  return RADIUS * frameScale(h);
}

/**
 * Lay the frame on the card's box: line on the edge, margin hanging outside it.
 *
 * The size is asked for in the art's own pixels and the scale carries the rest,
 * so the corner slices land at the same size on both axes — the line keeps its
 * weight whatever aspect the card is, and every extra point of width is spent on
 * the flat middle of the top and bottom runs.
 */
export function fitCardFrame(sprite, w, h) {
  const k = frameScale(h);
  const q = 1 / getRenderer().resolution;
  const snap = (v) => Math.round(v / q) * q;

  // Snapped to the device grid, both corners of it. A line is only ever as crisp
  // as the box it is laid on, and half of that box is this offset: the row snaps
  // the card itself — see HeroRow.resize — so these local coordinates are whole
  // pixels off a whole pixel rather than a fraction off a fraction.
  const x = snap(-w / 2 - MARGIN * k);
  const y = snap(-h / 2 - MARGIN * k);
  const right = snap(w / 2 + MARGIN * k);
  const bottom = snap(h / 2 + MARGIN * k);

  sprite.scale.set(k);
  sprite.setSize((right - x) / k, (bottom - y) / k);
  sprite.x = x;
  sprite.y = y;
}
