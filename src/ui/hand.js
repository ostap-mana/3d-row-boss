import { Container, Graphics, Sprite } from "pixi.js";
import { tween, delay, Ease, killTweensOf } from "../core/tween.js";
import { getRenderer } from "../core/context.js";
import { HAND_ASPECT, HAND_TIP, hintHandTexture } from "../art/hinthand.js";

const DRAWN = {
  aspect: 1.55,
  tip: { x: 0.42, y: 0.06 },
  size: { k: 1.15, min: 46, max: 110 },
};

const PAINTED = {
  aspect: HAND_ASPECT,
  tip: HAND_TIP,
  size: { k: 1.45, min: 58, max: 140 },
};

const PRESS = 0.86;

const APPROACH = {
  min: 0.24,
  max: 0.42,
  span: 320,
  entry: { x: 0.5, y: 0.7 },
  fade: 0.55,
  arc: 0.16,
  ceiling: 0.4,
  rise: 1.07,
};

const SHADE = { grow: 1.12, alpha: 0.58 };

let drawnTex = null;
function drawnTexture() {
  if (drawnTex) return drawnTex;
  const g = new Graphics();

  g.roundRect(-26, 4, 56, 62, 22);
  g.fill({ color: 0xf7f2ff });
  g.roundRect(-8, -54, 22, 74, 11);
  g.fill({ color: 0xf7f2ff });
  g.roundRect(-40, 20, 22, 34, 11);
  g.fill({ color: 0xe7dcf5 });
  g.roundRect(-26, 4, 56, 62, 22);
  g.stroke({ width: 5, color: 0x2a1738, alpha: 0.9 });
  g.roundRect(-8, -54, 22, 74, 11);
  g.stroke({ width: 5, color: 0x2a1738, alpha: 0.9 });
  g.circle(3, -44, 7);
  g.fill({ color: 0xffffff, alpha: 0.75 });

  drawnTex = getRenderer().generateTexture({
    target: g,
    resolution: 2,
    antialias: true,
  });
  g.destroy();
  return drawnTex;
}

export class Hand extends Container {
  constructor() {
    super();

    const painted = hintHandTexture();
    const art = painted ? PAINTED : DRAWN;
    this.aspect = art.aspect;
    this.size = art.size;

    const texture = painted || drawnTexture();

    this.shade = new Sprite(texture);
    this.shade.anchor.set(art.tip.x, art.tip.y);
    this.shade.tint = 0x000000;
    this.shade.alpha = SHADE.alpha;
    this.addChild(this.shade);

    this.sprite = new Sprite(texture);
    this.sprite.anchor.set(art.tip.x, art.tip.y);
    this.addChild(this.sprite);

    this.alpha = 0;
    this.visible = false;
    this.token = 0;
    this.held = 0;
    this.urgency = 1;
    this.baseSize = art.size.min;
  }

  resize(layout) {
    const { k, min, max } = this.size;
    this.baseSize = Math.max(min, Math.min(layout.board.cell * k, max));
    this.applySize();
  }

  applySize() {
    killTweensOf(this.sprite);
    killTweensOf(this.shade);
    this.drawAt(1);
  }

  drawAt(scale) {
    const s = this.baseSize * this.urgency * scale;
    this.sprite.setSize(s, s * this.aspect);
    this.shade.setSize(s * SHADE.grow, s * this.aspect * SHADE.grow);
  }

  async approach(id, x, y, fresh = false) {
    killTweensOf(this);

    const entering = fresh || this.alpha <= 0;
    const s = this.baseSize * this.urgency;
    if (entering) {
      this.x = x + s * APPROACH.entry.x;
      this.y = y + s * this.aspect * APPROACH.entry.y;
      this.alpha = 0;
    }

    const span = Math.hypot(x - this.x, y - this.y);
    if (span < 1) {
      this.x = x;
      this.y = y;
      this.drawAt(1);
      if (entering) await tween(this, { alpha: 1 }, APPROACH.min);
      return id === this.token;
    }

    const dur =
      APPROACH.min +
      (APPROACH.max - APPROACH.min) * Math.min(1, span / APPROACH.span);
    const lift = Math.min(span * APPROACH.arc, s * APPROACH.ceiling);

    if (entering) tween(this, { alpha: 1 }, dur * APPROACH.fade);

    await tween(this, { x, y }, dur, {
      ease: entering ? Ease.cubicOut : Ease.cubicInOut,
      onUpdate: (e, t) => {
        const bow = Math.sin(Math.PI * t);
        this.y -= lift * bow;
        this.drawAt(1 + (APPROACH.rise - 1) * bow);
      },
    });
    return id === this.token;
  }

  setUrgency(level) {
    this.urgency = level;
    this.applySize();
  }

  setElement(type) {
    const tex = hintHandTexture(type);
    if (!tex) return;
    this.sprite.texture = tex;
    this.shade.texture = tex;
  }

  stop() {
    const id = ++this.token;
    this.held = 0;
    killTweensOf(this);
    killTweensOf(this.sprite);
    killTweensOf(this.shade);
    tween(this, { alpha: 0 }, 0.18).then(() => {
      if (id === this.token) this.visible = false;
    });
  }

  grab(x, y) {
    const id = ++this.token;
    killTweensOf(this);
    killTweensOf(this.sprite);

    this.held = id;
    this.visible = true;
    this.alpha = 1;
    this.x = x;
    this.y = y;
    this.applySize();
    this.press();
  }

  dragTo(x, y) {
    if (!this.held) return;
    this.x = x;
    this.y = y;
  }

  async letGo() {
    const id = this.held;
    if (!id) return;
    this.held = 0;
    await this.release();
    if (id !== this.token) return;
    this.stop();
  }

  swipeLoop(from, to) {
    if (this.held) return;
    const id = ++this.token;
    this.visible = true;
    this.run(id, async () => {
      if (!(await this.approach(id, from.x, from.y))) return;
      if (!(await this.beat(id, this.press()))) return;
      const travel = tween(this, { x: to.x, y: to.y }, 0.42, {
        ease: Ease.cubicInOut,
      });
      if (!(await this.beat(id, travel))) return;
      if (!(await this.beat(id, this.release()))) return;
      if (!(await this.beat(id, tween(this, { alpha: 0 }, 0.2)))) return;
      await this.beat(id, delay(0.3));
    });
  }

  async reach(x, y) {
    if (this.held) return 0;
    const id = ++this.token;
    this.visible = true;
    this.applySize();
    if (!(await this.approach(id, x, y))) return 0;
    await this.press();
    return id === this.token ? id : 0;
  }

  async slideTo(id, x, y, dur) {
    if (id !== this.token) return false;
    await tween(this, { x, y }, dur, { ease: Ease.cubicInOut });
    return id === this.token;
  }

  async leave(id) {
    if (id !== this.token) return;
    await this.release();
    if (id !== this.token) return;
    await tween(this, { alpha: 0 }, 0.2);
    if (id === this.token && this.alpha === 0) this.visible = false;
  }

  tapLoop(at) {
    if (this.held) return;
    const id = ++this.token;
    this.visible = true;
    this.run(id, async () => {
      if (!(await this.approach(id, at.x, at.y, true))) return;
      if (!(await this.beat(id, this.press()))) return;
      if (!(await this.beat(id, delay(0.12)))) return;
      if (!(await this.beat(id, this.release()))) return;
      if (!(await this.beat(id, delay(0.1)))) return;
      if (!(await this.beat(id, this.press()))) return;
      if (!(await this.beat(id, this.release()))) return;
      if (!(await this.beat(id, tween(this, { alpha: 0 }, 0.22)))) return;
      await this.beat(id, delay(0.32));
    });
  }

  async run(id, body) {
    while (id === this.token) {
      await body();
      if (id !== this.token) return;
    }
  }

  async beat(id, job) {
    await job;
    return id === this.token;
  }

  async press() {
    const s = this.baseSize * this.urgency;
    killTweensOf(this.sprite);
    killTweensOf(this.shade);
    tween(
      this.shade,
      {
        width: s * PRESS * SHADE.grow,
        height: s * this.aspect * PRESS * SHADE.grow,
      },
      0.1,
    );
    await tween(
      this.sprite,
      { width: s * PRESS, height: s * this.aspect * PRESS },
      0.1,
    );
  }

  async release() {
    const s = this.baseSize * this.urgency;
    killTweensOf(this.sprite);
    killTweensOf(this.shade);
    tween(
      this.shade,
      { width: s * SHADE.grow, height: s * this.aspect * SHADE.grow },
      0.14,
      { ease: Ease.backOut },
    );
    await tween(this.sprite, { width: s, height: s * this.aspect }, 0.14, {
      ease: Ease.backOut,
    });
  }
}
