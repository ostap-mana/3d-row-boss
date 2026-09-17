import { getRenderer } from "../core/context.js";
import { canvasTexture } from "./textures.js";
import barUrl from "../assets/hp/black-bar.webp";
import trackUrl from "../assets/hp/dark-red.webp";
import fillUrl from "../assets/hp/red-bar.webp";
import chipUrl from "../assets/hp/white-bar.webp";
import doomTrackUrl from "../assets/doom/doom-track.webp";
import doomFillUrl from "../assets/doom/doom-fill.webp";

export const HP_FRAME = 0.1;

let stamp = null;

const PAINT_URL = {
  track: trackUrl,
  fill: fillUrl,
  chip: chipUrl,
  doomTrack: doomTrackUrl,
  doomFill: doomFillUrl,
};
const paints = {};

const SOLID = 128;

function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

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
      } catch {}
    }),
  );
}

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

export function hpBarPaint(w, h, kind) {
  const baked = bake(w, h);
  if (!baked) return null;
  const paint = paints[kind];
  if (paint) {
    const ctx = baked.canvas.getContext("2d");
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

function bake(w, h) {
  if (!stamp || w <= 1 || h <= 1) return null;

  const res = Math.min(getRenderer().resolution || 1, 2);
  const pw = Math.max(2, Math.round(w * res));
  const ph = Math.max(2, Math.round(h * res));

  const k = ph / stamp.h;
  let left = Math.round(stamp.left * k);
  let right = Math.round(stamp.right * k);
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
