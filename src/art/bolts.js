import { ImageSource, Texture } from "pixi.js";
import { GEM_COLORS, GEM_DARK, GEM_LIGHT } from "../config.js";
import arrowUrl from "../assets/fx/ult-bolt.webp";

let bolts = null;
let loaded = false;

export async function loadBoltArt() {
  if (loaded) return bolts;
  loaded = true;
  try {
    const img = new Image();
    img.src = arrowUrl;
    await img.decode();
    const frames = [
      new Texture({ source: new ImageSource({ resource: img }) }),
    ];
    const aspect = img.width / img.height;
    const out = {};
    GEM_COLORS.forEach((tint, element) => {
      out[element] = {
        frames,
        aspect,
        tint,
        core: GEM_LIGHT[element],
        deep: GEM_DARK[element],
      };
    });
    bolts = out;
  } catch {}
  return bolts;
}

export function boltArt(element) {
  return (bolts && bolts[element]) || null;
}
