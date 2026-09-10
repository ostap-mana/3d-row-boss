import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import { FIRE, WATER, NATURE, LIGHTNING, ARCANE, WIND } from "../config.js";
import fireUrl from "../assets/fx/link-fire.webp";
import waterUrl from "../assets/fx/link-water.webp";
import natureUrl from "../assets/fx/link-nature.webp";
import lightningUrl from "../assets/fx/link-lightning.webp";
import arcaneUrl from "../assets/fx/link-arcane.webp";
import windUrl from "../assets/fx/link-wind.webp";
import nodeUrl from "../assets/fx/link-node.webp";

const RIBBON = { w: 256, h: 96, pad: 2, count: 4 };
const NODE = { w: 128, h: 128, pad: 2, count: 3 };

export const LINK_ASPECT = RIBBON.w / RIBBON.h;
export const LINK_FRAMES = RIBBON.count;

export const NODE_SPARK = 0;
export const NODE_KNOT = 1;
export const NODE_SPLAT = 2;

const RIBBON_ART = {
  [FIRE]: fireUrl,
  [WATER]: waterUrl,
  [NATURE]: natureUrl,
  [LIGHTNING]: lightningUrl,
  [ARCANE]: arcaneUrl,
  [WIND]: windUrl,
};

let ribbons = null;
let nodes = null;
let loaded = false;

async function cutStrip(url, geo) {
  const img = new Image();
  img.src = url;
  await img.decode();

  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  const sheet = canvasTexture(c);

  const out = [];
  for (let i = 0; i < geo.count; i++) {
    out.push(
      new Texture({
        source: sheet.source,
        frame: new Rectangle(
          i * (geo.w + geo.pad * 2) + geo.pad,
          geo.pad,
          geo.w,
          geo.h,
        ),
      }),
    );
  }
  return out;
}

export async function loadLinkArt() {
  if (loaded) return ribbons;
  loaded = true;

  try {
    nodes = await cutStrip(nodeUrl, NODE);
  } catch {
    nodes = null;
  }

  const cut = {};
  await Promise.all(
    Object.entries(RIBBON_ART).map(async ([element, url]) => {
      try {
        cut[element] = await cutStrip(url, RIBBON);
      } catch {
        /* that element keeps the drawn rope */
      }
    }),
  );
  ribbons = Object.keys(cut).length ? cut : null;
  return ribbons;
}

export function linkFrames(element) {
  if (!ribbons) return null;
  return ribbons[element] || null;
}

export function nodeFrame(which) {
  if (!nodes) return null;
  return nodes[which] || null;
}
