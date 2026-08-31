/**
 * The frame a hero card wears.
 *
 * One rounded outline — a line six pixels thick on a radius of four — keyed off
 * a flat sheet by tools/pack-outline-frames.mjs, fattened there, and tinted per
 * element here. The sheet had no alpha channel: the middle of every frame
 * was painted the same dark navy as the page behind it, so the packer is what
 * turns a dark tile into a border with nothing inside it.
 *
 * One file and a tint, rather than the six painted files this used to import,
 * and both halves of that are the fix for how a row of six cards read.
 *
 * The tint is the important half. The sheet's six rectangles are painted in six
 * colours, and none of them is the colour of the element that wore it: keyed and
 * packed, FIRE's border averaged rgb(147,68,59) against its own gem's
 * rgb(255,90,31), LIGHTNING's came out a dull ochre against a bright yellow gem,
 * and WIND wore a neutral grey beside a pale aqua one. Every card had a border
 * arguing with the sigil in its own corner, and the row read muddy. GEM_COLORS
 * is where an element's colour lives, and the only place it lives, so the art
 * is packed white and the colour comes from there.
 *
 * The single file is the other half. Six rectangles drawn by the same hand are
 * the same drawing six times, and what differed between them was defects: the
 * lines run from 4.19 to 6.11 packed pixels, and the grey — Taranis's — holds
 * its weight worst of the six and comes off the sheet with no corner radius at
 * all. The packer measures all six and keeps the evenest, which is the orange;
 * every card in the row now wears the same line at the same weight, which is
 * the only thing a row of six borders has to get right.
 *
 * A card is not 128 by 264 of anything, so the frame is nine-sliced under a
 * uniform scale, the way the board's is (see art/boardframe.js): the line keeps
 * its weight, the corners keep their radius, and the flat middle of each side
 * takes up all of the slack.
 *
 * The card hands its own box to fitCardFrame and gets the frame laid *on* that
 * box, margin hanging outside it. That is the whole contract, and it has not
 * changed: the cards wore a set of thick neon frames on this same contract until
 * these arrived. The packed neon set has since been swept out of src/assets with
 * the rest of the dead art, but the revert is still cheap and still whole: its
 * master sheet is kept at src/source/cards/frames-sheet.png, and
 * `node tools/slice-frames.mjs` then `node tools/pack-frames.mjs` rebuilds
 * src/assets/cards/frame-<colour>.webp from it. Swap the import below back and
 * the cards are wearing neon again.
 */

import { NineSliceSprite } from "pixi.js";
import { GEM_COLORS } from "../config.js";
import { canvasTexture } from "./textures.js";
import { getRenderer } from "../core/context.js";
import outlineUrl from "../assets/cards/outline.webp";

/**
 * The packed geometry, printed by tools/pack-outline-frames.mjs: how tall the
 * border box is, the margin round it, and the line's own thickness and corner
 * radius inside it.
 *
 * BOX_H is the border box and not the file: the packed frame is 264 tall and the
 * outer edge of its line sits MARGIN in from the top of that, so what the card's
 * own height maps onto is the 260 between them. Getting that wrong is not
 * visible — the frame is laid on the card's box by fitCardFrame whatever the
 * scale is, and all BOX_H decides is how heavy the line and how round the corner
 * come out — but it is the number the packer prints and it should be the number
 * that is here.
 *
 * BORDER is a fraction of a pixel because the line is: it is measured as
 * coverage rather than counted as pixels, which is what let the packer tell six
 * frames apart that all looked three pixels thick. Every use of it here is
 * arithmetic that wants the real weight.
 *
 * These four are a transcript of what the packer printed for the file that is
 * actually imported above, and there is no slack in that. They drifted once —
 * BORDER stood at 2.46 against art whose line measured 4.44 — and every number
 * this file computes went with them: frameScale snapped the grid to a weight
 * the line does not have, so the border was laid down at 0.81 and landed on no
 * whole pixel at all, and the clip below was cut for a line half the thickness
 * of the one drawn over it. Re-run tools/pack-outline-frames.mjs and copy the
 * four numbers it prints; do not adjust one of them by eye.
 */
const BOX_H = 260;
const MARGIN = 2;
const BORDER = 6.11;
const RADIUS = 4;

/**
 * Slice that has to contain a whole corner: the margin, the arc, the line it is
 * drawn with, and a pixel of slack so the slice line falls on straight edge
 * rather than on the last of the curve.
 */
const CORNER = Math.ceil(MARGIN + RADIUS + BORDER) + 1;

let texture = null;

/**
 * Decode the frame before the first card is built.
 *
 * Never rejects: a card whose frame is missing draws the rounded stroke it
 * shipped with, which is plainer but is still a card with an edge — see
 * drawFrame in art/heroes.js. Every reference to the texture is guarded for that
 * reason.
 */
export async function loadCardFrame() {
  try {
    const img = new Image();
    img.src = outlineUrl;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    texture = canvasTexture(c);
  } catch {
    /* the drawn stroke stands in */
  }
}

/**
 * A nine-sliced frame in an element's own colour, or null when the art never
 * decoded.
 *
 * The tint is applied here rather than by the card, so that which colour a
 * border is stays in the file that owns what a border is. The card only ever
 * asks for its element's frame.
 */
export function cardFrameSprite(element) {
  if (!texture) return null;
  const sprite = new NineSliceSprite({
    texture,
    leftWidth: CORNER,
    rightWidth: CORNER,
    topHeight: CORNER,
    bottomHeight: CORNER,
  });
  sprite.tint = GEM_COLORS[element];
  return sprite;
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
  const px = Math.max(2, Math.round(BORDER * raw * dpr));
  return px / (BORDER * dpr);
}

/**
 * The corner radius the frame's line is drawn at on a card `h` tall.
 *
 * Exported for the card's own background fill, which is the shape the tile cuts
 * out of the arena and has to be the shape the border draws round it.
 */
export function cardFrameRadius(h) {
  return RADIUS * frameScale(h);
}

/**
 * Where the frame's sprite goes for a card `w` by `h`: the box, and the scale
 * the art is laid on it at.
 *
 * Its own function because two things need it and they have to agree to the
 * pixel — the sprite that draws the border, and the mask that keeps the
 * portrait behind it. See cardFrameClip.
 */
function frameBox(w, h) {
  const k = frameScale(h);
  const q = 1 / getRenderer().resolution;
  const snap = (v) => Math.round(v / q) * q;

  // Snapped to the device grid, both corners of it. A line is only ever as crisp
  // as the box it is laid on, and half of that box is this offset: the row snaps
  // the card itself — see HeroRow.resize — so these local coordinates are whole
  // pixels off a whole pixel rather than a fraction off a fraction.
  return {
    k,
    x: snap(-w / 2 - MARGIN * k),
    y: snap(-h / 2 - MARGIN * k),
    right: snap(w / 2 + MARGIN * k),
    bottom: snap(h / 2 + MARGIN * k),
  };
}

/**
 * The rounded rectangle a card has to clip its portrait and its plate to.
 *
 * The card's own silhouette — the same rounded rectangle the background fill is
 * drawn on — held back wherever the frame's snapped box lands inside it. Which
 * is to say the picture fills the card right out to the border, and the border
 * is the only thing that decides where the card ends.
 *
 * It used to stop half the line's width short of that, on the reasoning that the
 * line is drawn over the art anyway so anything given up under it is covered.
 * That reasoning holds along the four straight runs, where the line is opaque.
 * It fails at the four corners, which is where a thin line on a small radius is
 * almost entirely its own antialiasing: sampled down the diagonal the border
 * peaks at 77% there against 97% along a side. So the eighth of a pixel the
 * corners gave up was not covered — it was the dark card fill, showing through a
 * half-transparent corner as a blunt notch between the portrait and its own
 * border, about a pixel and a half deep on every card in the row. Cut to the
 * outer edge instead, whatever shows through a weak corner is the portrait,
 * which is what is supposed to be there.
 *
 * Nothing is given up in exchange, because the edges are still measured off the
 * frame's box and not just off the card's. That was always the point of doing it
 * this way: the four edges are each rounded to the device grid on their own, so
 * the line can land a fraction of a pixel inside the card, and a mask cut on the
 * card's untouched geometry does not move with it — a bust standing half a pixel
 * outside its own border is a bright fringe down one edge of one card in a row of
 * six. Taking whichever of the two edges is further in keeps that guarantee and
 * spends none of the corner on it.
 */
export function cardFrameClip(w, h) {
  const box = frameBox(w, h);
  const edge = MARGIN * box.k;
  const x = Math.max(box.x + edge, -w / 2);
  const y = Math.max(box.y + edge, -h / 2);
  return {
    x,
    y,
    w: Math.min(box.right - edge, w / 2) - x,
    h: Math.min(box.bottom - edge, h / 2) - y,
    r: RADIUS * box.k,
  };
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
  const box = frameBox(w, h);
  sprite.scale.set(box.k);
  sprite.setSize((box.right - box.x) / box.k, (box.bottom - box.y) / box.k);
  sprite.x = box.x;
  sprite.y = box.y;
}
