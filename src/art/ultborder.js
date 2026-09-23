import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import { paced } from "../core/idle.js";
import { FIRE, WATER, NATURE, LIGHTNING, ARCANE, WIND } from "../config.js";

const SHAPES = [
  {
    id: "border",
    cols: 6,
    count: 12,
    cellW: 176,
    cellH: 315,
    pad: { x: 0.1423, y: 0.1275 },
  },
  {
    id: "halo",
    cols: 6,
    count: 12,
    cellW: 176,
    cellH: 337,
    pad: { x: 0.3727, y: 0.1891 },
  },
  {
    id: "flare",
    cols: 6,
    count: 12,
    cellW: 176,
    cellH: 284,
    pad: { x: 0.3158, y: 0.1579 },
  },
  {
    id: "vfx",
    cols: 6,
    count: 12,
    cellW: 216,
    cellH: 344,
    pad: { x: 0.3438, y: 0.1719 },
    loop: "cycle",
  },
  {
    id: "vfx2",
    cols: 6,
    count: 18,
    cellW: 216,
    cellH: 344,
    pad: { x: 0.3438, y: 0.1719 },
    loop: "cycle",
    fps: 10,
  },
  {
    id: "vfx2-slim",
    cols: 6,
    count: 18,
    cellW: 134,
    cellH: 214,
    pad: { x: 0.3438, y: 0.1719 },
    loop: "cycle",
    fps: 10,
  },
  {
    id: "cutin",
    cols: 3,
    count: 6,
    cellW: 432,
    cellH: 688,
    pad: { x: 0.3438, y: 0.1719 },
    loop: "cycle",
    fps: 10,
  },
];

const FPS = 7;

const ID_BY_ELEMENT = {
  [FIRE]: "fire",
  [WATER]: "water",
  [NATURE]: "nature",
  [LIGHTNING]: "lightning",
  [ARCANE]: "arcane",
  [WIND]: "wind",
};

const FOUND = import.meta.glob("../assets/cards/ult-*.webp", {
  eager: true,
  query: "?url",
  import: "default",
});

const urls = {};
for (const path in FOUND) {
  const id = path
    .slice(path.lastIndexOf("/") + 1)
    .replace(/^ult-|\.webp$/g, "");
  urls[id] = FOUND[path];
}

const sheets = {};
let loaded = false;

function shapeOf(w, h) {
  return (
    SHAPES.find(
      (s) => s.cellW * s.cols === w && s.cellH * (s.count / s.cols) === h,
    ) || null
  );
}

async function cut(url) {
  const img = new Image();
  img.src = url;
  await img.decode();
  const shape = shapeOf(img.width, img.height);
  if (!shape) return null;

  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  const sheet = canvasTexture(c);

  const frames = [];
  for (let i = 0; i < shape.count; i++) {
    frames.push(
      new Texture({
        source: sheet.source,
        frame: new Rectangle(
          (i % shape.cols) * shape.cellW,
          Math.floor(i / shape.cols) * shape.cellH,
          shape.cellW,
          shape.cellH,
        ),
      }),
    );
  }
  return {
    frames,
    pad: shape.pad,
    shape: shape.id,
    loop: shape.loop,
    fps: shape.fps,
  };
}

export async function loadUltBorders() {
  if (loaded) return;
  loaded = true;
  await paced(
    Object.keys(urls).map((id) => async () => {
      const art = await cut(urls[id]);
      if (art) sheets[id] = art;
    }),
  );
}

export function ultBorder(element) {
  return sheets[ID_BY_ELEMENT[element]] || null;
}

export function ultBurst(element) {
  return sheets[`burst-${ID_BY_ELEMENT[element]}`] || null;
}

export function ultCutin(element) {
  return sheets[`cutin-${ID_BY_ELEMENT[element]}`] || null;
}

export function ultLoopTexture(art, t, rate) {
  const n = art.frames.length;
  const fps = art.fps === undefined ? FPS : art.fps;
  const step = Math.floor(t * fps * (rate === undefined ? 1 : rate));
  if (art.loop === "cycle") return art.frames[((step % n) + n) % n];
  const span = n * 2 - 2;
  const i = ((step % span) + span) % span;
  return art.frames[i < n ? i : span - i];
}

export function ultBurstTexture(art, p) {
  const n = art.frames.length;
  return art.frames[Math.max(0, Math.min(n - 1, Math.floor(p * n)))];
}

export function fitUltBorder(sprite, art, w, h, grow) {
  const k = grow === undefined ? 1 : grow;
  sprite.setSize(w * (1 + 2 * art.pad.x) * k, h * (1 + 2 * art.pad.y) * k);
}
