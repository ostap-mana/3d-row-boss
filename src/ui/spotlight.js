import { Container, Graphics } from "pixi.js";
import { SPOTLIGHT } from "../config.js";
import { Ease, killTweensOf, tween } from "../core/tween.js";

const CELL = 48;

export class Spotlight extends Container {
  constructor() {
    super();

    this.scrim = new Graphics();
    this.addChild(this.scrim);

    this.eventMode = "none";

    this.alpha = 0;
    this.visible = false;

    this.layout = null;
    this.hole = null;
    this.drawn = null;
    this.t = 0;
    this.token = 0;
  }

  resize(layout) {
    this.layout = layout;
    this.drawn = null;
    this.redraw();
  }

  aim(box, deep) {
    if (!SPOTLIGHT.on) return;

    const cell = this.layout ? this.layout.board.cell : CELL;
    const pad = box.pad === undefined ? cell * SPOTLIGHT.pad : box.pad;
    const want = {
      x: box.x - pad,
      y: box.y - pad,
      w: box.w + pad * 2,
      h: box.h + pad * 2,
      r: box.r === undefined ? cell * SPOTLIGHT.corner : box.r + pad,
      dim: deep ? SPOTLIGHT.dim : SPOTLIGHT.dimInPlay,
    };

    this.token++;
    killTweensOf(this);

    if (!this.hole || !this.visible) {
      this.hole = want;
      this.visible = true;
      this.redraw();
    } else {
      killTweensOf(this.hole);
      tween(this.hole, want, SPOTLIGHT.travel, { ease: Ease.cubicOut });
    }

    if (this.alpha < 1) tween(this, { alpha: 1 }, SPOTLIGHT.fade);
  }

  hide() {
    if (!this.visible) return;
    const id = ++this.token;
    killTweensOf(this);
    if (this.hole) killTweensOf(this.hole);
    tween(this, { alpha: 0 }, SPOTLIGHT.fade * 0.7).then(() => {
      if (id !== this.token) return;
      this.visible = false;
      this.hole = null;
      this.drawn = null;
      this.scrim.clear();
    });
  }

  update(dt) {
    if (!this.visible) return;
    this.t += dt;
    if (this.moved()) this.redraw();
  }

  moved() {
    const h = this.hole;
    const d = this.drawn;
    if (!h) return false;
    if (!d) return true;
    return (
      d.x !== h.x ||
      d.y !== h.y ||
      d.w !== h.w ||
      d.h !== h.h ||
      d.r !== h.r ||
      d.dim !== h.dim
    );
  }

  redraw() {
    const g = this.scrim;
    g.clear();
    this.drawn = null;

    const layout = this.layout;
    const h = this.hole;
    if (!layout || !h) return;

    const bleed = Math.max(layout.w, layout.h);
    const cell = layout.board.cell || CELL;
    const steps = SPOTLIGHT.featherSteps > 1 ? SPOTLIGHT.featherSteps : 0;
    const step = steps ? (cell * SPOTLIGHT.feather) / steps : 0;

    const path = (target, grow) =>
      target.roundRect(
        h.x - grow,
        h.y - grow,
        h.w + grow * 2,
        h.h + grow * 2,
        Math.max(0, h.r + grow),
      );

    g.rect(-bleed, -bleed, layout.w + bleed * 2, layout.h + bleed * 2);
    g.fill({ color: SPOTLIGHT.color, alpha: h.dim });
    path(g, steps * step);
    g.cut();

    for (let i = 0; i < steps; i++) {
      const k = Math.pow((i + 1) / steps, 1.6);
      path(g, (i + 1) * step);
      g.fill({ color: SPOTLIGHT.color, alpha: h.dim * k });
      path(g, i * step);
      g.cut();
    }

    this.drawn = { ...h };
  }
}
