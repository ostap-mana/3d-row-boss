import { Rectangle, Texture } from "pixi.js";
import { canvasTexture } from "./textures.js";
import { FIRE, WATER } from "../config.js";
import waterUrl from "../assets/fx/torrent-sheet.webp";
import fireUrl from "../assets/fx/fire-lance.webp";

const SHEETS = {
  [WATER]: {
    url: waterUrl,
    cols: 4,
    cellW: 512,
    cellH: 152,
    pad: 2,
    count: 16,
    block: 618,
    blend: "normal",
  },
  [FIRE]: {
    url: fireUrl,
    cols: 4,
    cellW: 512,
    cellH: 160,
    pad: 2,
    count: 16,
    block: 0,
    blend: "add",
  },
};

let streams = null;
let loaded = false;

function windows(sheet, source) {
  const out = [];
  for (let i = 0; i < sheet.count; i++) {
    out.push(
      new Texture({
        source,
        frame: new Rectangle(
          sheet.pad + (i % sheet.cols) * (sheet.cellW + sheet.pad),
          sheet.pad + Math.floor(i / sheet.cols) * (sheet.cellH + sheet.pad),
          sheet.cellW,
          sheet.cellH,
        ),
      }),
    );
  }
  return out;
}

async function cut(sheet) {
  const img = new Image();
  img.src = sheet.url;
  await img.decode();

  const w = img.width;
  const h = sheet.block || img.height;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });

  if (sheet.block) {
    ctx.drawImage(img, 0, 0, w, h, 0, 0, w, h);
    const paint = ctx.getImageData(0, 0, w, h);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, h, w, h, 0, 0, w, h);
    const matte = ctx.getImageData(0, 0, w, h);
    const lit = paint.data;
    const cover = matte.data;
    for (let i = 0; i < lit.length; i += 4) lit[i + 3] = cover[i];
    ctx.putImageData(paint, 0, 0);
  } else {
    ctx.drawImage(img, 0, 0);
  }

  return {
    frames: windows(sheet, canvasTexture(c).source),
    aspect: sheet.cellW / sheet.cellH,
    blend: sheet.blend,
  };
}

export async function loadStreamArt() {
  if (loaded) return streams;
  loaded = true;
  const out = {};
  for (const element of Object.keys(SHEETS)) {
    try {
      out[element] = await cut(SHEETS[element]);
    } catch {
      /* that element throws whatever it threw before */
    }
  }
  streams = out;
  return streams;
}

export function streamArt(element) {
  return (streams && streams[element]) || null;
}
