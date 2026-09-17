import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import { FIRE, WATER, NATURE, LIGHTNING, ARCANE, WIND } from "../config.js";

export const CROWN_CELL = { w: 112, h: 128, cols: 4, aspect: 112 / 128 };

const ID_BY_ELEMENT = {
  [FIRE]: "fire",
  [WATER]: "water",
  [NATURE]: "nature",
  [LIGHTNING]: "lightning",
  [ARCANE]: "arcane",
  [WIND]: "wind",
};

const FOUND = import.meta.glob("../assets/fx/ready-*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

const urls = {};
for (const path in FOUND) {
  const id = path.slice(path.lastIndexOf("/ready-") + 7).replace(".webp", "");
  urls[id] = FOUND[path];
}

const sheets = {};
let loaded = false;

export function readyCrownFrames(element) {
  return sheets[ID_BY_ELEMENT[element]] || null;
}

async function cut(url) {
  const img = new Image();
  img.src = url;
  await img.decode();

  const rows = Math.round(img.height / CROWN_CELL.h);
  if (rows < 1 || img.width !== CROWN_CELL.cols * CROWN_CELL.w) return null;

  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  const sheet = canvasTexture(c);

  const out = [];
  for (let i = 0; i < rows * CROWN_CELL.cols; i++) {
    out.push(
      new Texture({
        source: sheet.source,
        frame: new Rectangle(
          (i % CROWN_CELL.cols) * CROWN_CELL.w,
          Math.floor(i / CROWN_CELL.cols) * CROWN_CELL.h,
          CROWN_CELL.w,
          CROWN_CELL.h,
        ),
      }),
    );
  }
  return out;
}

export async function loadReadyCrowns() {
  if (loaded) return;
  loaded = true;
  for (const id of Object.keys(urls)) {
    try {
      const art = await cut(urls[id]);
      if (art) sheets[id] = art;
    } catch {}
  }
}
