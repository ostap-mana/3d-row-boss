import { ImageSource, Rectangle, Texture } from "pixi.js";
import { ARCANE, FIRE, LIGHTNING, NATURE, WATER, WIND } from "../config.js";
import fireUrl from "../assets/fx/fire-bolt.webp";
import waterUrl from "../assets/fx/water-lance.webp";
import natureUrl from "../assets/fx/nature-bolt.webp";
import lightningUrl from "../assets/fx/lightning-bolt.webp";
import arcaneUrl from "../assets/fx/arcane-bolt.webp";
import windUrl from "../assets/fx/wind-bolt.webp";

const ART = {
  [FIRE]: { url: fireUrl, tint: null },
  [WATER]: { url: waterUrl, tint: null, cells: 8 },
  [NATURE]: { url: natureUrl, tint: null },
  [LIGHTNING]: { url: lightningUrl, tint: null },
  [ARCANE]: { url: arcaneUrl, tint: null },
  [WIND]: { url: windUrl, tint: null },
};

let bolts = null;
let loaded = false;

async function cut(entry) {
  const img = new Image();
  img.src = entry.url;
  await img.decode();
  const source = new ImageSource({ resource: img });
  const cells = entry.cells || 1;
  const w = img.width / cells;
  const frames = [];
  for (let i = 0; i < cells; i++) {
    frames.push(
      cells === 1
        ? new Texture({ source })
        : new Texture({
            source,
            frame: new Rectangle(i * w, 0, w, img.height),
          }),
    );
  }
  return { frames, aspect: w / img.height, tint: entry.tint };
}

export async function loadBoltArt() {
  if (loaded) return bolts;
  loaded = true;
  const out = {};
  for (const element of Object.keys(ART)) {
    try {
      out[element] = await cut(ART[element]);
    } catch {}
  }
  bolts = out;
  return bolts;
}

export function boltArt(element) {
  return (bolts && bolts[element]) || null;
}
