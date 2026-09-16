import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import rakeUrl from "../assets/fx/claw-rake.webp";

const SHEET = {
  cols: 4,
  cellW: 640,
  cellH: 377,
  pad: 2,
  count: 12,
  block: 1139,
};

const FRAME_HOLD = [1, 1, 1, 1, 1, 1, 2.6, 2.6, 2.6, 2.6, 4, 4];

export const RAKE_ASPECT = SHEET.cellW / SHEET.cellH;

const FRAME_ENDS = (() => {
  const total = FRAME_HOLD.reduce((a, b) => a + b, 0);
  let t = 0;
  return FRAME_HOLD.map((hold) => (t += hold) / total);
})();

export function rakeFrameAt(p) {
  for (let i = 0; i < FRAME_ENDS.length; i++) if (p < FRAME_ENDS[i]) return i;
  return FRAME_ENDS.length - 1;
}

let frames = null;
let loaded = false;

/**
 * The sheet arrives as two grids stacked in one image with no alpha channel —
 * the paint on top, its matte below in grey — and is put back together here.
 * See tools/pack-claw.mjs: an alpha plane is written losslessly by libwebp and
 * on this sheet costs more than the picture, so carrying the matte as grey is
 * what pays for the cell being big enough to hold up on a phone.
 *
 * Both halves are drawn into one canvas rather than the whole image into one
 * twice as tall, which is eleven megabytes of RGBA saved at the one moment
 * this is decoded.
 */
export async function loadRakeArt() {
  if (loaded) return frames;
  loaded = true;
  try {
    const img = new Image();
    img.src = rakeUrl;
    await img.decode();

    const w = img.width;
    const h = SHEET.block;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d", { willReadFrequently: true });

    ctx.drawImage(img, 0, 0, w, h, 0, 0, w, h);
    const paint = ctx.getImageData(0, 0, w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, h, w, h, 0, 0, w, h);
    const matte = ctx.getImageData(0, 0, w, h);

    const lit = paint.data;
    const cover = matte.data;
    for (let i = 0; i < lit.length; i += 4) lit[i + 3] = cover[i];
    ctx.putImageData(paint, 0, 0);
    const sheet = canvasTexture(c);

    const out = [];
    for (let i = 0; i < SHEET.count; i++) {
      out.push(
        new Texture({
          source: sheet.source,
          frame: new Rectangle(
            SHEET.pad + (i % SHEET.cols) * (SHEET.cellW + SHEET.pad),
            SHEET.pad + Math.floor(i / SHEET.cols) * (SHEET.cellH + SHEET.pad),
            SHEET.cellW,
            SHEET.cellH,
          ),
        }),
      );
    }
    frames = out;
  } catch {
    frames = null;
  }
  return frames;
}

export function rakeFrames() {
  return frames;
}
