import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import shardUrl from "../assets/boss/shard-sheet.webp";
import boulderUrl from "../assets/boss/boulder-sheet.webp";

const SHEETS = [
  { url: shardUrl, cols: 4, rows: 2, frames: 1, into: "shards" },
  { url: boulderUrl, cols: 4, rows: 4, frames: 4, into: "boulders" },
];

const cut = {};
let loaded = false;

async function slice(sheet) {
  const img = new Image();
  img.src = sheet.url;
  await img.decode();

  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  const source = canvasTexture(c).source;

  const cell = Math.round(img.width / sheet.cols);
  const out = [];
  for (let row = 0; row < sheet.rows; row++) {
    const run = [];
    for (let col = 0; col < sheet.cols; col++) {
      run.push(
        new Texture({
          source,
          frame: new Rectangle(col * cell, row * cell, cell, cell),
        }),
      );
    }
    if (sheet.frames > 1) out.push(run);
    else run.forEach((tex) => out.push([tex]));
  }
  return out;
}

export async function loadShardArt() {
  if (loaded) return cut;
  loaded = true;
  for (const sheet of SHEETS) {
    try {
      cut[sheet.into] = await slice(sheet);
    } catch {}
  }
  return cut;
}

function pick(list, index) {
  if (!list || !list.length) return null;
  return list[((index % list.length) + list.length) % list.length];
}

export function shardTexture(index) {
  const run = pick(cut.shards, index);
  return run ? run[0] : null;
}

export function boulderFrames(index) {
  return pick(cut.boulders, index) || pick(cut.shards, index);
}
