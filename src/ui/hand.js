/**
 * Tutorial hand.
 *
 * Anti-stall device first, tutorial second: it appears after 0.8s of silence,
 * grows insistent at 2.5s, and the director plays the move itself at 6s.
 */

import { Container, Graphics, Sprite } from "pixi.js";
import { tween, delay, Ease } from "../core/tween.js";
import { getRenderer } from "../core/context.js";

let handTex = null;
function handTexture() {
  if (handTex) return handTex;
  const g = new Graphics();

  // Palm
  g.roundRect(-26, 4, 56, 62, 22);
  g.fill({ color: 0xf7f2ff });
  // Index finger
  g.roundRect(-8, -54, 22, 74, 11);
  g.fill({ color: 0xf7f2ff });
  // Thumb
  g.roundRect(-40, 20, 22, 34, 11);
  g.fill({ color: 0xe7dcf5 });
  // Outline pass
  g.roundRect(-26, 4, 56, 62, 22);
  g.stroke({ width: 5, color: 0x2a1738, alpha: 0.9 });
  g.roundRect(-8, -54, 22, 74, 11);
  g.stroke({ width: 5, color: 0x2a1738, alpha: 0.9 });
  // Fingertip highlight
  g.circle(3, -44, 7);
  g.fill({ color: 0xffffff, alpha: 0.75 });

  handTex = getRenderer().generateTexture({
    target: g,
    resolution: 2,
    antialias: true,
  });
  g.destroy();
  return handTex;
}

export class Hand extends Container {
  constructor() {
    super();

    this.ripple = new Graphics();
    this.ripple.circle(0, 0, 26);
    this.ripple.stroke({ width: 5, color: 0xffffff, alpha: 0.9 });
    this.ripple.alpha = 0;
    this.addChild(this.ripple);

    this.sprite = new Sprite(handTexture());
    // Anchor on the fingertip so the hand points at the exact cell.
    this.sprite.anchor.set(0.42, 0.06);
    this.addChild(this.sprite);

    this.alpha = 0;
    this.visible = false;
    this.token = 0;
    this.urgency = 1;
    this.baseSize = 74;
  }

  resize(layout) {
    this.baseSize = Math.max(46, Math.min(layout.board.cell * 1.15, 110));
    this.applySize();
  }

  applySize() {
    const s = this.baseSize * this.urgency;
    this.sprite.setSize(s, s * 1.55);
    this.ripple.scale.set((s / 74) * this.urgency);
  }

  setUrgency(level) {
    this.urgency = level;
    this.applySize();
  }

  stop() {
    this.token++;
    tween(this, { alpha: 0 }, 0.18).then(() => {
      if (this.alpha === 0) this.visible = false;
    });
  }

  /** Loop a swipe demo between two points until stopped. */
  swipeLoop(from, to) {
    const id = ++this.token;
    this.visible = true;
    this.run(id, async () => {
      this.x = from.x;
      this.y = from.y;
      this.alpha = 0;
      await tween(this, { alpha: 1 }, 0.18);
      await this.press();
      await tween(this, { x: to.x, y: to.y }, 0.42, {
        ease: Ease.cubicInOut,
      });
      await this.release();
      await tween(this, { alpha: 0 }, 0.2);
      await delay(0.3);
    });
  }

  /** Loop a tap demo on one point until stopped. */
  tapLoop(at) {
    const id = ++this.token;
    this.visible = true;
    this.run(id, async () => {
      this.x = at.x;
      this.y = at.y;
      this.alpha = 0;
      await tween(this, { alpha: 1 }, 0.18);
      await this.press();
      await delay(0.12);
      await this.release();
      await delay(0.1);
      await this.press();
      await this.release();
      await tween(this, { alpha: 0 }, 0.22);
      await delay(0.32);
    });
  }

  async run(id, body) {
    while (id === this.token) {
      await body();
      if (id !== this.token) return;
    }
  }

  async press() {
    this.ripple.alpha = 0.9;
    this.ripple.scale.set(0.4 * this.urgency);
    tween(
      this.ripple.scale,
      { x: 1.5 * this.urgency, y: 1.5 * this.urgency },
      0.4,
    );
    tween(this.ripple, { alpha: 0 }, 0.4);
    await tween(
      this.sprite.scale,
      {
        x: this.sprite.scale.x * 0.86,
        y: this.sprite.scale.y * 0.86,
      },
      0.1,
    );
  }

  async release() {
    const s = this.baseSize * this.urgency;
    await tween(this.sprite, { width: s, height: s * 1.55 }, 0.14, {
      ease: Ease.backOut,
    });
  }
}
