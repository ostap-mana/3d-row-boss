/**
 * The boss health bar's shape.
 *
 * `src/buttons/progress.png` is a 926x48 silhouette — a long bar with mitred
 * chevron caps — painted flat black at 60% alpha. Nothing in it is coloured, so
 * nothing in it can be tinted: black multiplied by any tint is still black. It
 * is normalised to an opaque white stamp at load, and every layer of the bar is
 * then that one stamp under a different tint.
 *
 * Three-sliced at the bar's own pixel size rather than stretched to it, because
 * the caps are the whole point of the shape: squashing 926x48 into 477x14 would
 * flatten the mitre into a long shallow spike. The caps are drawn at their own
 * aspect and only the flat middle is stretched, so the chevron reads the same on
 * a phone as it does in the file.
 */

import { getRenderer } from "../core/context.js";
import { canvasTexture } from "./textures.js";
import barUrl from "../buttons/progress.png";
import fillUrl from "../buttons/red-line.png";
import chipUrl from "../buttons/white-hp.png";

/** The normalised stamp: white, opaque, plus where its mitre ends. */
let stamp = null;

/**
 * The paints, poured into the stamp's silhouette rather than drawn on their own,
 * so each one carries its own colour and still ends in the same mitre as the
 * track it sits in.
 *
 *   fill  `red-line.png` — an 812x40 red bar, bevelled dark on all four edges.
 *   chip  `white-hp.png` — a 12x40 swatch of flat warm white, the health just
 *         lost. Twelve pixels wide because there is nothing along its length to
 *         resolve; it is a colour, and it stretches.
 */
const PAINT_URL = { fill: fillUrl, chip: chipUrl };
const paints = {};

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

/**
 * White out the art and push its alpha back up to opaque.
 *
 * The divisor is read from the middle of the file rather than hardcoded, so
 * dropping in a darker or lighter silhouette still lands on a clean stamp.
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

  // Where the mitre meets the full-height body: the first pixel of the top row
  // the shape actually covers.
  let cap = 0;
  for (let x = 0; x < w; x++) {
    if (px[(w + x) * 4 + 3] > 128) {
      cap = x;
      break;
    }
  }

  return { canvas: c, cap: cap || Math.round(h / 2), w, h };
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
 * @param {"fill"|"chip"} kind
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

/** Three-slice the stamp onto a fresh canvas of `w` x `h` CSS pixels. */
function bake(w, h) {
  if (!stamp || w <= 1 || h <= 1) return null;

  const res = Math.min(getRenderer().resolution || 1, 2);
  const pw = Math.max(2, Math.round(w * res));
  const ph = Math.max(2, Math.round(h * res));
  // Uniform: the mitre is only 45 degrees for as long as both axes agree.
  const cap = Math.min(
    Math.round(stamp.cap * (ph / stamp.h)),
    Math.floor(pw / 2),
  );

  const canvas = makeCanvas(pw, ph);
  const ctx = canvas.getContext("2d");
  const mid = stamp.w - stamp.cap * 2;
  ctx.drawImage(stamp.canvas, 0, 0, stamp.cap, stamp.h, 0, 0, cap, ph);
  ctx.drawImage(
    stamp.canvas,
    stamp.cap,
    0,
    mid,
    stamp.h,
    cap,
    0,
    pw - cap * 2,
    ph,
  );
  ctx.drawImage(
    stamp.canvas,
    stamp.w - stamp.cap,
    0,
    stamp.cap,
    stamp.h,
    pw - cap,
    0,
    cap,
    ph,
  );

  return { canvas, pw, ph };
}
