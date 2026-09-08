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
/**
 * The slab silhouette's own span, in ART units — see `body` in drawBlock, whose
 * outermost points are -47 and +47.
 *
 * This is the number `resize` has to size against, and sizing against ART
 * instead is what had the blocks crowding their neighbours. The texture is a
 * padded box: ART plus PAD on each side, and the stone fills neither. Scaling
 * the sprite so the *box* came out at a cell put the stone at 0.92 of one,
 * against the 0.86 a gem takes, and two blocks side by side were left six
 * pixels of daylight where two gems get eleven. On the tilt below they touched.
 */
const BODY = 94;

/**
 * What a stone occupies of its cell — GemView.resize in art/gems.js, and the
 * same number the board's own tiles are drawn to (see the inset in board.js).
 *
 * A block encases a gem. It is the same piece on the board as the gem it traps,
 * it sits in the same cell, and it has no business being bigger than one.
 */
const FOOTPRINT = 0.86;

/**
 * How far a block is allowed to sit off square, in radians.
 *
 * The tilt is what keeps a row of blocks from reading as tiling, and it is also
 * the thing that put them on top of each other: a square of side s turned by t
 * bounds s * (cos t + sin t), so the ±0.25 this used to be swelled a slab to
 * 1.21 of its own width — past the cell however it was sized.
 *
 * At 0.085 the bound is 1.086, which puts a turned slab at 0.93 of a cell: off
 * square enough to see, still clear of the four cells around it. Raising this
 * means lowering FOOTPRINT to pay for it.
 */
const TILT = 0.085;

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
    // Sized so the stone lands on FOOTPRINT, not the padded box around it: the
    // sprite carries ART + PAD * 2 of texture for BODY of slab, so the box has
    // to be scaled up by exactly that ratio to leave the stone at a gem's size.
    const span = (cell * FOOTPRINT * (ART + PAD * 2)) / BODY;
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
    this.slab.rotation = (Math.random() - 0.5) * 2 * TILT;
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
