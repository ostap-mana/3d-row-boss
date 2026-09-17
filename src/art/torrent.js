import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import torrentUrl from "../assets/fx/torrent-sheet.webp";

const SHEET = {
  cols: 4,
  cellW: 512,
  cellH: 152,
  pad: 2,
  count: 16,
  block: 618,
};

export const TORRENT_ASPECT = SHEET.cellW / SHEET.cellH;

let frames = null;
let loaded = false;

export async function loadTorrentArt() {
  if (loaded) return frames;
  loaded = true;
  try {
    const img = new Image();
    img.src = torrentUrl;
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

export function torrentFrames() {
  return frames;
}
