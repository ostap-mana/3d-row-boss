import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import shardUrl from "../assets/boss/shard-sheet.webp";

const SHEET = { cols: 4, rows: 2, count: 8 };

let frames = null;
let loaded = false;

export async function loadShardArt() {
  if (loaded) return frames;
  loaded = true;
  try {
    const img = new Image();
    img.src = shardUrl;
    await img.decode();

    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    const sheet = canvasTexture(c);

    const cell = Math.round(img.width / SHEET.cols);
    const out = [];
    for (let i = 0; i < SHEET.count; i++) {
      out.push(
        new Texture({
          source: sheet.source,
          frame: new Rectangle(
            (i % SHEET.cols) * cell,
            Math.floor(i / SHEET.cols) * cell,
            cell,
            cell,
          ),
        }),
      );
    }
    frames = out;
  } catch {}
  return frames;
}

export function shardTexture(index) {
  if (!frames) return null;
  return frames[((index % frames.length) + frames.length) % frames.length];
}

export function shardCount() {
  return frames ? frames.length : 0;
}
