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
import fireUrl from "../elements/fire.png";
import waterUrl from "../elements/water.png";
import earthUrl from "../elements/earth.png";
import sunUrl from "../elements/sun.png";
import moonUrl from "../elements/image.png";
import windUrl from "../elements/wind.png";

/** All shapes are authored in a 100x100 box centred on the origin. */
const ART = 100;

const PAD = 8;
const TEX_SPAN = (ART + PAD * 2) / ART;

/**
 * Painted gems, by element — the flat element roundels from src/elements.
 *
 * Assigned by colour as much as by name: the element colours drive the beams,
 * the pop sparks, the hint glow and the hero cards, so a gem whose art
 * disagrees with its colour makes the whole board fire the wrong hue. That is
 * why the sun disc is LIGHTNING (gold) and the leaf is NATURE (green) even
 * though the file is called earth — the slot each one lands in is the one whose
 * GEM_COLORS entry it already matches.
 *
 * `image.png` is the purple moon-and-star; it carries ARCANE, which is also the
 * element MYST casts VOID ECLIPSE with. It keeps its unhelpful filename because
 * the folder is authored elsewhere — the alias above is where it gets a name.
 *
 * wind.png is the one that brought a sixth element onto the board with it. Its
 * pale aqua is the only colour on the roundel sheet the five slots had no home
 * for, so WIND, SYLPH and a re-authored opening board exist because of it.
 */
const GEM_ART = {
  [FIRE]: fireUrl,
  [WATER]: waterUrl,
  [NATURE]: earthUrl,
  [LIGHTNING]: sunUrl,
  [ARCANE]: moonUrl,
  [WIND]: windUrl,
};

const painted = {};

/**
 * Re-centre a bitmap inside a square that leaves the same margin the drawn
 * gems carry, and hand it back as a texture.
 *
 * The roundels are full-bleed — the disc runs edge to edge of its 128px canvas
 * — while GemView.resize() sizes every gem as if the art filled only the inner
 * ART box of a padded texture. Handed over raw they would each be a sixth
 * bigger than the drawn shapes and crowd their neighbours on a 5x5 board, so
 * the padding the drawn gems get from their bounds anchor is added here
 * instead. Both kinds then answer to the same resize().
 */
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

/**
 * Decode the painted gems before the textures are baked.
 *
 * Never rejects: an element whose bitmap fails to decode falls back to its
 * drawn shape, so the board is always complete even on a WebView that chokes
 * on the file.
 */
export async function loadGemArt() {
  await Promise.all(
    Object.entries(GEM_ART).map(async ([type, url]) => {
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        painted[type] = paddedTexture(img);
      } catch {
        /* drawn shape stands in */
      }
    }),
  );
}

const SHAPES = [
  // Fire — jagged diamond
  {
    path: (g) =>
      g.poly([
        0, -52, 13, -30, 30, -41, 25, -15, 46, -6, 32, 18, 12, 46, 0, 34, -12,
        46, -32, 18, -46, -6, -25, -15, -30, -41, -13, -30,
      ]),
    facet: (g) => g.poly([0, -34, 16, -8, 0, 22, -16, -8]),
  },
  // Water — droplet
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
  // Nature — leaf
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
  // Lightning — bolt
  {
    path: (g) =>
      g.poly([-8, -50, 30, -50, 10, -12, 34, -12, -12, 52, -1, 4, -30, 4]),
    facet: (g) => g.poly([-2, -42, 20, -42, 4, -12, 14, -12, -8, 26, -2, -4]),
  },
  // Arcane — hex crystal
  {
    path: (g) => g.poly([0, -50, 44, -26, 44, 26, 0, 50, -44, 26, -44, -26]),
    facet: (g) => g.poly([0, -50, 44, -26, 0, 0, -44, -26]),
  },
  // Wind — three-blade vortex. The same blade at 0, 120 and 240 degrees, with
  // the rotation baked into the numbers so this reads like every shape above it.
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

/**
 * Paint one gem at art scale into a Graphics.
 * Exported so hero cards can reuse the same silhouettes as element crests.
 */
export function drawGemShape(g, type, opts) {
  const o = opts || {};
  const color = o.color !== undefined ? o.color : GEM_COLORS[type];
  const dark = o.dark !== undefined ? o.dark : GEM_DARK[type];
  const light = GEM_LIGHT[type];
  const shape = SHAPES[type];

  // Body
  shape.path(g);
  g.fill({ color });

  // Rim: darker outside edge gives every gem a readable border on the board.
  shape.path(g);
  g.stroke({ width: 5, color: dark, alpha: 0.95, alignment: 0.5 });

  // Interior facet catches the light
  shape.facet(g);
  g.fill({ color: light, alpha: 0.34 });

  // Specular dot
  g.ellipse(-13, -20, 9, 6);
  g.fill({ color: 0xffffff, alpha: 0.55 });
}

let gemTextures = null;

/**
 * Bake the five gems into textures so the whole board batches into a
 * single draw call instead of 25 tessellated Graphics objects.
 */
export function initGemTextures(renderer) {
  if (gemTextures) return gemTextures;
  gemTextures = SHAPES.map((_, type) => {
    // A painted gem is already a texture and needs no baking.
    if (painted[type]) return painted[type];

    const g = new Graphics();
    // Invisible bounds anchor: keeps every baked gem the same size and stops
    // the rim stroke from being cropped by tight geometry bounds.
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

/**
 * One gem on the board. Holds its own glow so the hint system can light
 * up individual cells without touching the board's own rendering.
 */
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

  /** Fit the gem into a board cell of `cell` pixels. */
  resize(cell) {
    const span = cell * 0.86 * TEX_SPAN;
    this.sprite.setSize(span, span);
    const g = cell * 1.6;
    this.glow.setSize(g, g);
  }
}
