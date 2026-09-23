import { Container, Graphics, Sprite } from "pixi.js";
import { OBSIDIAN } from "../config.js";
import { glowTexture } from "./textures.js";
import { getRenderer } from "../core/context.js";
import { tween, Ease } from "../core/tween.js";
import { stream } from "../core/rng.js";

const rand = stream("obsidian");

const ART = 100;
const PAD = 6;
const BODY = 94;

const FOOTPRINT = 0.94;

const TILT = 0.085;

const SLAB = [
  -46, -26, -32, -44, -8, -34, 12, -47, 28, -30, 47, -18, 34, 2, 47, 22, 26, 30,
  14, 47, -10, 36, -26, 47, -38, 28, -47, 6,
];

let blockTex = null;

function drawBlock(g) {
  g.rect(-ART / 2 - PAD, -ART / 2 - PAD, ART + PAD * 2, ART + PAD * 2);
  g.fill({ color: 0xffffff, alpha: 0 });

  g.poly(SLAB.map((v, i) => v + (i % 2 ? 7 : 5)));
  g.fill({ color: 0x000000, alpha: 0.55 });

  g.poly(SLAB);
  g.fill({ color: OBSIDIAN.rock });
  g.poly(SLAB);
  g.stroke({ width: 8, color: 0x0a0610, alpha: 1 });

  g.poly([-46, -26, -32, -44, -8, -34, 12, -47, 6, -16, -26, -8]);
  g.fill({ color: OBSIDIAN.edge, alpha: 0.75 });
  g.poly([28, -30, 47, -18, 34, 2, 12, -8]);
  g.fill({ color: OBSIDIAN.edge, alpha: 0.45 });

  g.moveTo(-46, -26);
  g.lineTo(-32, -44);
  g.lineTo(-8, -34);
  g.lineTo(12, -47);
  g.lineTo(28, -30);
  g.stroke({ width: 5, color: 0xa888b0, alpha: 0.55 });

  const seams = [
    [-30, -6, -8, 6, -14, 30],
    [10, -14, 26, 4, 18, 34],
    [-22, 20, 4, 26],
  ];
  seams.forEach((pts) => {
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke({ width: 9, color: OBSIDIAN.seam, alpha: 0.9 });
    g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.stroke({ width: 3.5, color: OBSIDIAN.seamHot, alpha: 0.95 });
  });
}

export function blockTexture() {
  if (blockTex) return blockTex;
  const g = new Graphics();
  drawBlock(g);
  blockTex = getRenderer().generateTexture({
    target: g,
    resolution: 2,
    antialias: true,
  });
  g.destroy();
  return blockTex;
}

const SPIRE_TOP = 244;
const SPIRE_SPLIT = 104;
const SPIRE_HALF = 56;
const SPIRE_PAD = 10;

const SPIRE_LEFT = [
  [-42, 0],
  [-36, -34],
  [-46, -72],
  [-30, -104],
  [-24, -140],
  [-28, -172],
  [-12, -206],
  [-2, -244],
];

const SPIRE_RIGHT = [
  [10, -204],
  [14, -170],
  [28, -138],
  [22, -104],
  [40, -68],
  [30, -34],
  [38, 0],
];

const SPIRE_CRACK = [
  [-30, -104],
  [-18, -96],
  [-6, -110],
  [6, -100],
  [22, -104],
];

const STUMP_SEAM = [-10, -6, -2, -40, -14, -80, -4, -100];
const TIP_SEAM = [2, -112, -6, -150, 4, -190, -2, -226];

const flat = (pts) => pts.flat();

function strokePath(g, pts, style) {
  g.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
  g.stroke(style);
}

function drawSeam(g, pts) {
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.stroke({ width: 9, color: OBSIDIAN.seam, alpha: 0.9 });
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.stroke({ width: 3.5, color: OBSIDIAN.seamHot, alpha: 0.95 });
}

function drawRock(g, body, lit, dark, seam, outers, ridge) {
  g.poly(flat(body.map(([x, y]) => [x + 5, y + 7])));
  g.fill({ color: 0x000000, alpha: 0.55 });

  g.poly(flat(body));
  g.fill({ color: OBSIDIAN.rock });

  g.poly(flat(lit));
  g.fill({ color: OBSIDIAN.edge, alpha: 0.7 });
  g.poly(flat(dark));
  g.fill({ color: 0x000000, alpha: 0.28 });

  drawSeam(g, seam);

  outers.forEach((pts) =>
    strokePath(g, pts, { width: 8, color: 0x0a0610, alpha: 1 }),
  );
  strokePath(g, SPIRE_CRACK, { width: 4, color: 0x0a0610, alpha: 0.9 });
  strokePath(g, ridge, { width: 5, color: 0xa888b0, alpha: 0.55 });
}

function spireFrame(g, top, bottom) {
  g.rect(
    -SPIRE_HALF - SPIRE_PAD,
    top - SPIRE_PAD,
    SPIRE_HALF * 2 + SPIRE_PAD * 2,
    bottom - top + SPIRE_PAD * 2,
  );
  g.fill({ color: 0xffffff, alpha: 0 });
}

function drawStump(g) {
  spireFrame(g, -SPIRE_SPLIT, 0);
  const left = SPIRE_LEFT.slice(0, 4);
  const right = SPIRE_RIGHT.slice(3);
  drawRock(
    g,
    left.concat(SPIRE_CRACK.slice(1, -1), right),
    left.concat([
      [-8, -92],
      [-4, -44],
      [-10, 0],
    ]),
    right.concat([
      [22, 0],
      [14, -40],
      [8, -90],
    ]),
    STUMP_SEAM,
    [left, right],
    left.slice(1),
  );
}

function drawTip(g) {
  spireFrame(g, -SPIRE_TOP, -SPIRE_SPLIT);
  const left = SPIRE_LEFT.slice(3);
  const right = SPIRE_RIGHT.slice(0, 4);
  drawRock(
    g,
    left.concat(right, SPIRE_CRACK.slice(1, -1).reverse()),
    left.concat([
      [-2, -200],
      [-8, -160],
      [-12, -120],
    ]),
    right.concat([
      [6, -112],
      [4, -150],
      [2, -190],
    ]),
    TIP_SEAM,
    [left.concat(right)],
    left.slice(1),
  );
}

let spireTex = null;

export function spireArt() {
  if (spireTex) return spireTex;
  const make = (draw) => {
    const g = new Graphics();
    draw(g);
    const tex = getRenderer().generateTexture({
      target: g,
      resolution: 2,
      antialias: true,
    });
    g.destroy();
    return tex;
  };
  spireTex = {
    stump: make(drawStump),
    tip: make(drawTip),
    unit: SPIRE_TOP,
    split: SPIRE_SPLIT,
    pad: SPIRE_PAD,
    frameW: (SPIRE_HALF + SPIRE_PAD) * 2,
    stumpH: SPIRE_SPLIT + SPIRE_PAD * 2,
    tipH: SPIRE_TOP - SPIRE_SPLIT + SPIRE_PAD * 2,
    crackX: (SPIRE_CRACK[0][0] + SPIRE_CRACK[SPIRE_CRACK.length - 1][0]) / 2,
    crackW: SPIRE_CRACK[SPIRE_CRACK.length - 1][0] - SPIRE_CRACK[0][0],
  };
  return spireTex;
}

export class ObsidianView extends Container {
  constructor() {
    super();

    this.heat = new Sprite(glowTexture());
    this.heat.anchor.set(0.5);
    this.heat.blendMode = "add";
    this.heat.tint = OBSIDIAN.seam;
    this.heat.alpha = 0.4;
    this.addChild(this.heat);

    this.slab = new Sprite(blockTexture());
    this.slab.anchor.set(0.5);
    this.addChild(this.slab);

    this.armor = 0;
    this.t = rand() * 6;
  }

  setArmor(layers) {
    this.armor = Math.max(0, Math.round(layers || 0));
  }

  resize(cell) {
    const span = (cell * FOOTPRINT * (ART + PAD * 2)) / BODY;
    this.slab.setSize(span, span);
    this.heat.setSize(cell * 1.5, cell * 1.5);
  }

  update(dt) {
    this.t += dt;
    this.heat.alpha = 0.32 + Math.sin(this.t * 2.4) * 0.16;
  }

  async form() {
    this.scale.set(0.2);
    this.alpha = 0;
    this.slab.rotation = (rand() - 0.5) * 2 * TILT;
    await Promise.all([
      tween(this, { alpha: 1 }, 0.14),
      tween(this.scale, { x: 1, y: 1 }, 0.34, { ease: Ease.backOut }),
    ]);
  }

  chip() {
    if (this.armor <= 0) return false;
    this.setArmor(this.armor - 1);
    return true;
  }

  async shatter() {
    await tween(this.scale, { x: 1.22, y: 1.22 }, 0.09);
    await Promise.all([
      tween(this.scale, { x: 0.1, y: 0.1 }, 0.2, { ease: Ease.backIn }),
      tween(this, { alpha: 0 }, 0.2),
    ]);
  }
}
