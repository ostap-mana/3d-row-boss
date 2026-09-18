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

function blockTexture() {
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
