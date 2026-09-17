import { Container, Graphics, Sprite } from "pixi.js";
import {
  GEM_COLORS,
  GEM_DARK,
  GEM_LIGHT,
  FIRE,
  WATER,
  NATURE,
  LIGHTNING,
  ARCANE,
  WIND,
} from "../config.js";
import { glowTexture, canvasTexture } from "./textures.js";
import fireUrl from "../assets/gems/fire.webp";
import waterUrl from "../assets/gems/water.webp";
import earthUrl from "../assets/gems/nature.webp";
import sunUrl from "../assets/gems/lightning.webp";
import moonUrl from "../assets/gems/arcane.webp";
import windUrl from "../assets/gems/wind.webp";

const ART = 100;

const PAD = 8;
const TEX_SPAN = (ART + PAD * 2) / ART;

const GEM_ART = {
  [FIRE]: fireUrl,
  [WATER]: waterUrl,
  [NATURE]: earthUrl,
  [LIGHTNING]: sunUrl,
  [ARCANE]: moonUrl,
  [WIND]: windUrl,
};

const painted = {};

function paddedTexture(img) {
  const span = Math.round(Math.max(img.width, img.height) * TEX_SPAN);
  const c = document.createElement("canvas");
  c.width = span;
  c.height = span;
  const ctx = c.getContext("2d");
  ctx.drawImage(
    img,
    (span - img.width) / 2,
    (span - img.height) / 2,
    img.width,
    img.height,
  );
  return canvasTexture(c);
}

export async function loadGemArt() {
  await Promise.all(
    Object.entries(GEM_ART).map(async ([type, url]) => {
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        painted[type] = paddedTexture(img);
      } catch {}
    }),
  );
}

const SHAPES = [
  {
    path: (g) =>
      g.poly([
        0, -52, 13, -30, 30, -41, 25, -15, 46, -6, 32, 18, 12, 46, 0, 34, -12,
        46, -32, 18, -46, -6, -25, -15, -30, -41, -13, -30,
      ]),
    facet: (g) => g.poly([0, -34, 16, -8, 0, 22, -16, -8]),
  },
  {
    path: (g) => {
      g.moveTo(0, -49);
      g.bezierCurveTo(20, -22, 42, -3, 42, 15);
      g.bezierCurveTo(42, 39, 23, 51, 0, 51);
      g.bezierCurveTo(-23, 51, -42, 39, -42, 15);
      g.bezierCurveTo(-42, -3, -20, -22, 0, -49);
      g.closePath();
    },
    facet: (g) => {
      g.moveTo(-4, -26);
      g.bezierCurveTo(-20, -6, -26, 6, -24, 20);
      g.bezierCurveTo(-34, 4, -26, -14, -4, -26);
      g.closePath();
    },
  },
  {
    path: (g) => {
      g.moveTo(0, -50);
      g.quadraticCurveTo(48, -8, 0, 50);
      g.quadraticCurveTo(-48, -8, 0, -50);
      g.closePath();
    },
    facet: (g) => {
      g.moveTo(0, -40);
      g.quadraticCurveTo(26, -8, 0, 34);
      g.quadraticCurveTo(10, -8, 0, -40);
      g.closePath();
    },
  },
  {
    path: (g) =>
      g.poly([-8, -50, 30, -50, 10, -12, 34, -12, -12, 52, -1, 4, -30, 4]),
    facet: (g) => g.poly([-2, -42, 20, -42, 4, -12, 14, -12, -8, 26, -2, -4]),
  },
  {
    path: (g) => g.poly([0, -50, 44, -26, 44, 26, 0, 50, -44, 26, -44, -26]),
    facet: (g) => g.poly([0, -50, 44, -26, 0, 0, -44, -26]),
  },
  {
    path: (g) => {
      g.moveTo(0, 0);
      g.bezierCurveTo(10, -26, 24, -40, 34, -34);
      g.bezierCurveTo(22, -18, 14, -10, 0, 0);
      g.closePath();
      g.moveTo(0, 0);
      g.bezierCurveTo(17.5, 21.7, 22.6, 40.8, 12.4, 46.4);
      g.bezierCurveTo(4.6, 28.1, 1.7, 17.1, 0, 0);
      g.closePath();
      g.moveTo(0, 0);
      g.bezierCurveTo(-27.5, 4.3, -46.6, -0.8, -46.4, -12.4);
      g.bezierCurveTo(-26.6, -10.1, -15.7, -7.1, 0, 0);
      g.closePath();
    },
    facet: (g) => g.circle(0, 0, 13),
  },
];

export function drawGemShape(g, type, opts) {
  const o = opts || {};
  const color = o.color !== undefined ? o.color : GEM_COLORS[type];
  const dark = o.dark !== undefined ? o.dark : GEM_DARK[type];
  const light = GEM_LIGHT[type];
  const shape = SHAPES[type];

  shape.path(g);
  g.fill({ color });

  shape.path(g);
  g.stroke({ width: 5, color: dark, alpha: 0.95, alignment: 0.5 });

  shape.facet(g);
  g.fill({ color: light, alpha: 0.34 });

  g.ellipse(-13, -20, 9, 6);
  g.fill({ color: 0xffffff, alpha: 0.55 });
}

let gemTextures = null;

export function initGemTextures(renderer) {
  if (gemTextures) return gemTextures;
  gemTextures = SHAPES.map((_, type) => {
    if (painted[type]) return painted[type];

    const g = new Graphics();
    g.rect(-ART / 2 - PAD, -ART / 2 - PAD, ART + PAD * 2, ART + PAD * 2);
    g.fill({ color: 0xffffff, alpha: 0 });
    drawGemShape(g, type);
    const tex = renderer.generateTexture({
      target: g,
      resolution: 2,
      antialias: true,
    });
    g.destroy();
    return tex;
  });
  return gemTextures;
}

export function gemTexture(type) {
  return (gemTextures && gemTextures[type]) || null;
}

export class GemView extends Container {
  constructor(type) {
    super();
    this.type = type;

    this.glow = new Sprite(glowTexture());
    this.glow.anchor.set(0.5);
    this.glow.blendMode = "add";
    this.glow.alpha = 0;
    this.glow.scale.set(0.9);
    this.addChild(this.glow);

    this.sprite = new Sprite(gemTextures[type]);
    this.sprite.anchor.set(0.5);
    this.addChild(this.sprite);

    this.setType(type);
  }

  setType(type) {
    this.type = type;
    this.sprite.texture = gemTextures[type];
    this.glow.tint = GEM_COLORS[type];
  }

  resize(cell) {
    const span = cell * 0.86 * TEX_SPAN;
    this.sprite.setSize(span, span);
    const g = cell * 1.6;
    this.glow.setSize(g, g);
  }
}
