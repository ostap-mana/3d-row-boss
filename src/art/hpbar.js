/**
 * The boss health bar's shape.
 *
 * Four files in `src/assets/hp/`, and between them they are the whole bar:
 *
 *   black-bar.webp 972x48  the frame. Flat black at 40% alpha, and the only one
 *                          of the four that is a silhouette rather than a
 *                          colour: nothing in it is coloured, so nothing in it
 *                          can be tinted — black multiplied by any tint is
 *                          still black. It is normalised to an opaque white
 *                          stamp at load, and every layer of the bar is then
 *                          that one stamp, either under a tint or poured full
 *                          of one of the paints below.
 *   dark-red.webp  965x40  the empty gauge, a deep #6a1d1d bevelled dark along
 *                          its long edges. The track used to be a flat tint of
 *                          the stamp; this is the colour the art was drawn in.
 *   red-bar.webp   812x40  the health still standing, #ca3333, bevelled the
 *                          same way.
 *   white-bar.webp  12x40  the health just lost, a swatch of warm white. Twelve
 *                          pixels wide because there is nothing along its
 *                          length to resolve; it is a colour, and it stretches.
 *
 * The frame is eight pixels taller than the track and seven wider — it is drawn
 * behind the bar and stands proud of it on every side, which is where HP_FRAME
 * comes from.
 *
 * Sliced at the bar's own pixel size rather than stretched to it, because the
 * cap is the whole point of the shape: squashing 972x48 into 477x14 would
 * flatten the mitre into a long shallow spike. The cap is drawn at its own
 * aspect and only the flat middle is stretched, so the chevron reads the same on
 * a phone as it does in the file.
 *
 * Each end is measured separately rather than assumed to match the other. This
 * silhouette is square at the left and pointed at the right, which a slicer that
 * takes one cap width for both ends cannot cut: it would either saw the point
 * off the right or invent one at the left.
 */

import { getRenderer } from "../core/context.js";
import { canvasTexture } from "./textures.js";
import barUrl from "../assets/hp/black-bar.webp";
import trackUrl from "../assets/hp/dark-red.webp";
import fillUrl from "../assets/hp/red-bar.webp";
import chipUrl from "../assets/hp/white-bar.webp";

/**
 * How far the frame stands proud of the bar, as a fraction of the bar's height.
 *
 * (48 - 40) / 2 / 40. Read off the two files rather than picked, so the outline
 * around the gauge is as thick as the one the art was drawn with — the HUD grows
 * the silhouette by this much on every side and tints it near-black.
 */
export const HP_FRAME = 0.1;

/** The normalised stamp: white, opaque, plus where each of its mitres ends. */
let stamp = null;

/**
 * The paints, poured into the stamp's silhouette rather than drawn on their own,
 * so each one carries its own colour and still ends in the same mitre as the
 * frame it sits in.
 */
const PAINT_URL = { track: trackUrl, fill: fillUrl, chip: chipUrl };
const paints = {};

/** Alpha at or above which a pixel of the normalised stamp is inside the shape. */
const SOLID = 128;

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/**
 * White out the art and push its alpha back up to opaque.
 *
 * The divisor is read from the middle of the file rather than hardcoded — this
 * silhouette is painted at 40% and the one before it at 66%, and neither number
 * is a decision this module should be carrying.
 */
function normalise(img) {
  const w = img.width;
  const h = img.height;
  const c = makeCanvas(w, h);
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const body = px[((h >> 1) * w + (w >> 1)) * 4 + 3] || 255;
  for (let i = 0; i < px.length; i += 4) {
    px[i] = 255;
    px[i + 1] = 255;
    px[i + 2] = 255;
    px[i + 3] = Math.min(255, Math.round((px[i + 3] * 255) / body));
  }
  ctx.putImageData(data, 0, 0);

  return { canvas: c, w, h, ...caps(px, w, h) };
}

/**
 * How long the mitre at each end is, in source pixels.
 *
 * The shape is at its widest across the middle and at its narrowest along the
 * top, so the horizontal distance between where the two rows start is the run of
 * the mitre on the left, and the distance between where they end is the run on
 * the right. A square end puts both at the same column and measures as nothing,
 * which is exactly what a square end wants: no slice.
 *
 * Row 1 rather than row 0 because the top row of a soft-edged export is a ramp
 * and can miss the threshold along its whole length.
 */
function caps(px, w, h) {
  const edge = (y, from, step) => {
    for (let x = from; x >= 0 && x < w; x += step) {
      if (px[(y * w + x) * 4 + 3] >= SOLID) return x;
    }
    return -1;
  };

  const row = Math.min(1, h - 1);
  const mid = h >> 1;
  const shoulder = { l: edge(row, 0, 1), r: edge(row, w - 1, -1) };
  const tip = { l: edge(mid, 0, 1), r: edge(mid, w - 1, -1) };
  if (shoulder.l < 0 || tip.l < 0) return { left: 0, right: 0 };

  return {
    left: Math.max(0, shoulder.l - tip.l),
    right: Math.max(0, tip.r - shoulder.r),
  };
}

/**
 * Decode the silhouette before the HUD lays itself out.
 *
 * Never rejects: without it the HUD keeps drawing the rounded bar it always
 * drew, which is why every reference to the shape is guarded.
 */
export async function loadHpBarArt() {
  try {
    const img = new Image();
    img.src = barUrl;
    await img.decode();
    stamp = normalise(img);
  } catch {
    stamp = null;
  }
  await Promise.all(
    Object.entries(PAINT_URL).map(async ([kind, url]) => {
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        paints[kind] = img;
      } catch {
        /* that layer falls back to a flat tint of the stamp */
      }
    }),
  );
}

/**
 * Bake the stamp to a bar of `w` x `h` CSS pixels.
 *
 * @returns {{texture: import("pixi.js").Texture, pw: number, ph: number}|null}
 *   `pw`/`ph` are the baked size in texture pixels — the caller crops the fill
 *   by frame, and a frame is in texture space, not CSS space.
 */
export function hpBarShape(w, h) {
  const baked = bake(w, h);
  return (
    baked && {
      texture: canvasTexture(baked.canvas),
      pw: baked.pw,
      ph: baked.ph,
    }
  );
}

/**
 * The same silhouette, poured full of one of the paints.
 *
 * Falls back to the plain white stamp when that paint is missing, so the caller
 * gets a tintable layer either way and only has to know whether it got the paint
 * — `painted` — to pick the tint that suits.
 *
 * @param {"track"|"fill"|"chip"} kind
 */
export function hpBarPaint(w, h, kind) {
  const baked = bake(w, h);
  if (!baked) return null;
  const paint = paints[kind];
  if (paint) {
    const ctx = baked.canvas.getContext("2d");
    // source-in: the stamp's alpha decides where the paint lands, so the layer
    // inherits the mitre for free.
    ctx.globalCompositeOperation = "source-in";
    ctx.drawImage(paint, 0, 0, baked.pw, baked.ph);
    ctx.globalCompositeOperation = "source-over";
  }
  return {
    texture: canvasTexture(baked.canvas),
    pw: baked.pw,
    ph: baked.ph,
    painted: !!paint,
  };
}

/** Slice the stamp onto a fresh canvas of `w` x `h` CSS pixels. */
function bake(w, h) {
  if (!stamp || w <= 1 || h <= 1) return null;

  const res = Math.min(getRenderer().resolution || 1, 2);
  const pw = Math.max(2, Math.round(w * res));
  const ph = Math.max(2, Math.round(h * res));

  // Uniform: a mitre only holds its angle for as long as both axes agree.
  const k = ph / stamp.h;
  let left = Math.round(stamp.left * k);
  let right = Math.round(stamp.right * k);
  // The flat middle has to survive, however short the bar is asked to be, or the
  // two caps meet and overdraw each other.
  if (left + right > pw - 2) {
    const squeeze = (pw - 2) / (left + right);
    left = Math.floor(left * squeeze);
    right = Math.floor(right * squeeze);
  }

  const canvas = makeCanvas(pw, ph);
  const ctx = canvas.getContext("2d");
  const mid = stamp.w - stamp.left - stamp.right;

  if (left > 0) {
    ctx.drawImage(stamp.canvas, 0, 0, stamp.left, stamp.h, 0, 0, left, ph);
  }
  ctx.drawImage(
    stamp.canvas,
    stamp.left,
    0,
    mid,
    stamp.h,
    left,
    0,
    pw - left - right,
    ph,
  );
  if (right > 0) {
    ctx.drawImage(
      stamp.canvas,
      stamp.w - stamp.right,
      0,
      stamp.right,
      stamp.h,
      pw - right,
      0,
      right,
      ph,
    );
  }

  return { canvas, pw, ph };
}
