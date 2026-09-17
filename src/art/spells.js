import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import { paced } from "../core/idle.js";
import { FIRE, WATER, NATURE, LIGHTNING, ARCANE, WIND } from "../config.js";

const SHEET = { cols: 5, cell: 228, count: 10 };

export const SPELL_TRAVEL_LAST = 4;

export const SPELL_ASPECT = 1;

export const SPELL_BY_ELEMENT = {
  [FIRE]: "flame",
  [WATER]: "water",
  [NATURE]: "nature",
  [LIGHTNING]: "lightning",
  [ARCANE]: "arcane",
  [WIND]: "wind",
};

export const BOSS_SPELLS = {
  breath: "breath",
  smash: "slam",
  rake: "claw",
  mend: ["mend", "nature"],
};

const FOUND = import.meta.glob(
  [
    "../assets/fx/*-sheet.webp",
    "!../assets/fx/fire-sheet.webp",
    "!../assets/fx/torrent-sheet.webp",
  ],
  {
    eager: true,
    query: "?url",
    import: "default",
  },
);

const urls = {};
for (const path in FOUND) {
  const id = path.slice(path.lastIndexOf("/") + 1).replace("-sheet.webp", "");
  if (id === "fire" || id === "torrent") continue;
  urls[id] = FOUND[path];
}

const frames = {};
let loaded = false;

async function cut(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  const sheet = canvasTexture(c);
  const pitch = Math.round(img.width / SHEET.cols);

  const out = [];
  for (let i = 0; i < SHEET.count; i++) {
    out.push(
      new Texture({
        source: sheet.source,
        frame: new Rectangle(
          (i % SHEET.cols) * pitch,
          Math.floor(i / SHEET.cols) * pitch,
          pitch,
          pitch,
        ),
      }),
    );
  }
  return out;
}

export async function loadSpellArt() {
  if (loaded) return frames;
  loaded = true;
  await paced(
    Object.keys(urls).map((id) => async () => {
      frames[id] = await cut(urls[id]);
    }),
  );
  return frames;
}

export function spellFrames(id) {
  return (id && frames[id]) || null;
}

export function bossSpellFrames(kind) {
  const want = BOSS_SPELLS[kind];
  const list = Array.isArray(want) ? want : [want];
  for (let i = 0; i < list.length; i++) {
    const found = spellFrames(list[i]);
    if (found) return found;
  }
  return null;
}
