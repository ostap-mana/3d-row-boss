import { Container, Sprite } from "pixi.js";
import {
  fitUltBorder,
  ultBorder,
  ultBurst,
  ultBurstTexture,
  ultLoopTexture,
} from "../art/ultborder.js";
import { ULT_RIM } from "../config.js";
import { Ease, killTweensOf, tween, tweenValue } from "../core/tween.js";

export class UltRim extends Container {
  constructor() {
    super();

    this.loop = new Sprite();
    this.loop.anchor.set(0.5);
    this.loop.blendMode = "add";
    this.loop.alpha = 0;
    this.loop.visible = false;
    this.addChild(this.loop);

    this.flash = new Sprite();
    this.flash.anchor.set(0.5);
    this.flash.blendMode = "add";
    this.flash.alpha = 0;
    this.flash.visible = false;
    this.addChild(this.flash);

    this.eventMode = "none";

    this.layout = null;
    this.element = -1;
    this.art = null;
    this.t = 0;
    this.lit = false;
    this.token = 0;
    this.fade = 0;
    this.level = { v: 0 };
  }

  resize(layout) {
    this.layout = layout;
    this.x = layout.w / 2;
    this.y = layout.h / 2;
    this.fit();
  }

  box() {
    const l = this.layout;
    const inset = Math.min(l.w, l.h) * ULT_RIM.inset;
    return {
      w: l.w - inset * 2 - (l.safe.left + l.safe.right),
      h: l.h - inset * 2 - (l.safe.top + l.safe.bottom),
      dx: (l.safe.left - l.safe.right) / 2,
      dy: (l.safe.top - l.safe.bottom) / 2,
    };
  }

  fit() {
    if (!this.layout) return;
    const b = this.box();
    if (this.art) {
      fitUltBorder(this.loop, this.art, b.w, b.h);
      this.loop.x = b.dx;
      this.loop.y = b.dy;
    }
    if (this.burstArt) {
      fitUltBorder(this.flash, this.burstArt, b.w, b.h, ULT_RIM.burstGrow);
      this.flash.x = b.dx;
      this.flash.y = b.dy;
    }
  }

  arm(element) {
    if (this.lit && element === this.element) return false;
    const art = ultBorder(element);
    if (!art) return false;

    const swap = this.lit && element !== this.element;
    this.lit = true;
    this.element = element;
    this.art = art;
    this.burstArt = ultBurst(element);
    this.loop.texture = art.frames[0];
    this.loop.visible = true;
    this.fit();

    killTweensOf(this.level);
    tween(this.level, { v: 1 }, swap ? ULT_RIM.swap : ULT_RIM.in);
    this.burst();
    return !swap;
  }

  burst() {
    if (!this.burstArt || !this.layout) return;
    const id = ++this.token;
    killTweensOf(this.flash);
    this.flash.texture = ultBurstTexture(this.burstArt, 0);
    this.flash.visible = true;
    this.flash.alpha = 1;
    this.fit();

    tweenValue(0, 1, ULT_RIM.burstDur, (p) => {
      if (id !== this.token) return;
      this.flash.texture = ultBurstTexture(this.burstArt, p);
      this.flash.alpha =
        p < ULT_RIM.burstTail
          ? 1
          : 1 - (p - ULT_RIM.burstTail) / (1 - ULT_RIM.burstTail);
    }).then(() => {
      if (id !== this.token) return;
      this.flash.visible = false;
      this.flash.alpha = 0;
    });
  }

  disarm() {
    if (!this.lit) return;
    this.lit = false;
    this.element = -1;
    killTweensOf(this.level);
    tween(this.level, { v: 0 }, ULT_RIM.out, { ease: Ease.quadIn }).then(() => {
      if (this.lit) return;
      this.loop.visible = false;
      this.art = null;
    });
  }

  update(dt) {
    this.t += dt;
    if (!this.art || !this.loop.visible) return;
    this.loop.texture = ultLoopTexture(this.art, this.t, ULT_RIM.rate);
    const breath =
      1 -
      ULT_RIM.breath.depth *
        (0.5 + 0.5 * Math.cos(this.t * ULT_RIM.breath.rate));
    this.loop.alpha = ULT_RIM.alpha * this.level.v * breath;
  }
}
