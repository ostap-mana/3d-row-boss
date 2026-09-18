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

const WHITE_PULL = 0.52;
const BLACK_LIFT = 0.07;
const GAIN = 1.22;

function temper(lit) {
  const span = 255 * (1 - BLACK_LIFT);
  const low = 255 * BLACK_LIFT;
  for (let n = 0; n < lit.length; n += 4) {
    if (lit[n + 3] === 0) continue;
    const r = lit[n];
    const g = lit[n + 1];
    const b = lit[n + 2];
    const cut = Math.min(r, g, b) * WHITE_PULL;
    for (let k = 0; k < 3; k++) {
      const v = ((lit[n + k] - cut - low) / span) * GAIN * 255;
      lit[n + k] = v < 0 ? 0 : v > 255 ? 255 : v;
    }
  }
}

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

export async function loadRakeArt() {
  if (loaded) return frames;
  loaded = true;
  try {
    const img = new Image();
    img.src = rakeUrl;
    await img.decode();

    const { cellW, cellH, pad, block, cols, count } = SHEET;

    const sheet = document.createElement("canvas");
    sheet.width = img.width;
    sheet.height = block;
    const paper = sheet.getContext("2d");

    const cell = document.createElement("canvas");
    cell.width = cellW;
    cell.height = cellH;
    const knife = cell.getContext("2d", { willReadFrequently: true });

    for (let i = 0; i < count; i++) {
      const x = pad + (i % cols) * (cellW + pad);
      const y = pad + Math.floor(i / cols) * (cellH + pad);

      knife.clearRect(0, 0, cellW, cellH);
      knife.drawImage(img, x, y, cellW, cellH, 0, 0, cellW, cellH);
      const paint = knife.getImageData(0, 0, cellW, cellH);

      knife.clearRect(0, 0, cellW, cellH);
      knife.drawImage(img, x, y + block, cellW, cellH, 0, 0, cellW, cellH);
      const matte = knife.getImageData(0, 0, cellW, cellH);

      const lit = paint.data;
      const cover = matte.data;
      for (let n = 0; n < lit.length; n += 4) lit[n + 3] = cover[n];
      temper(lit);
      paper.putImageData(paint, x, y);
    }

    const source = canvasTexture(sheet).source;

    const out = [];
    for (let i = 0; i < count; i++) {
      out.push(
        new Texture({
          source,
          frame: new Rectangle(
            pad + (i % cols) * (cellW + pad),
            pad + Math.floor(i / cols) * (cellH + pad),
            cellW,
            cellH,
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
