/**
 * Obsidian blocks — the boss's answer to the player.
 *
 * A block encases the gem sitting in that cell: the gem cannot be swapped and
 * cannot match while it is trapped. Clearing a match next to the block cracks
 * it open. Blocks never move, which is why the lava script only ever stacks
 * them from the bottom of a column upward.
 */

import { Container, Graphics, Sprite } from "pixi.js";
import { OBSIDIAN } from "../config.js";
import { glowTexture } from "./textures.js";
import { getRenderer } from "../core/context.js";
import { tween, Ease } from "../core/tween.js";

const ART = 100;
const PAD = 6;
const TEX_SPAN = (ART + PAD * 2) / ART;

let blockTex = null;

/** Craggy slab with heat still glowing in the cracks. */
function drawBlock(g) {
  g.rect(-ART / 2 - PAD, -ART / 2 - PAD, ART + PAD * 2, ART + PAD * 2);
  g.fill({ color: 0xffffff, alpha: 0 });

  // Slab silhouette — deliberately irregular so it never reads as a UI panel.
  const body = [
    -44, -38, -18, -46, 16, -44, 42, -34, 46, -6, 40, 26, 20, 44, -14, 47, -40,
    38, -47, 8,
  ];
  g.poly(body);
  g.fill({ color: OBSIDIAN.rock });
  g.poly(body);
  g.stroke({ width: 6, color: 0x0a0610, alpha: 0.95 });

  // Upper facets catching light
  g.poly([-44, -38, -18, -46, 16, -44, 4, -18, -26, -12]);
  g.fill({ color: OBSIDIAN.edge, alpha: 0.75 });
  g.poly([42, -34, 46, -6, 24, 6, 10, -20]);
  g.fill({ color: OBSIDIAN.edge, alpha: 0.45 });

  // Lit top edge — makes the slab read as raised stone rather than a hole
  g.moveTo(-44, -38);
  g.lineTo(-18, -46);
  g.lineTo(16, -44);
  g.lineTo(42, -34);
  g.stroke({ width: 5, color: 0xa888b0, alpha: 0.55 });

  // Molten seams
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

    this.t = Math.random() * 6;
  }

  resize(cell) {
    const span = cell * 0.98 * TEX_SPAN;
    this.slab.setSize(span, span);
    this.heat.setSize(cell * 1.5, cell * 1.5);
  }

  update(dt) {
    this.t += dt;
    this.heat.alpha = 0.32 + Math.sin(this.t * 2.4) * 0.16;
  }

  /** Slam into existence where the lava landed. */
  async form() {
    this.scale.set(0.2);
    this.alpha = 0;
    this.slab.rotation = (Math.random() - 0.5) * 0.5;
    await Promise.all([
      tween(this, { alpha: 1 }, 0.14),
      tween(this.scale, { x: 1, y: 1 }, 0.34, { ease: Ease.backOut }),
    ]);
  }

  /** Crack apart when a match lands next door. */
  async shatter() {
    await tween(this.scale, { x: 1.22, y: 1.22 }, 0.09);
    await Promise.all([
      tween(this.scale, { x: 0.1, y: 0.1 }, 0.2, { ease: Ease.backIn }),
      tween(this, { alpha: 0 }, 0.2),
    ]);
  }
}
