import { Container, Text } from "pixi.js";
import { COPY, FONT } from "../config.js";
import { tween } from "../core/tween.js";
import { fitFont } from "./text.js";

const PULSE = 2.6;

export class StartPrompt extends Container {
  constructor() {
    super();

    this.label = new Text({
      text: COPY.start,
      style: {
        fontFamily: FONT,
        fontSize: 22,
        fontWeight: "900",
        fill: 0xfbf1e4,
        letterSpacing: 3,
        dropShadow: {
          color: 0x05030a,
          alpha: 0.85,
          blur: 9,
          distance: 0,
          angle: 0,
        },
        align: "center",
      },
    });
    this.label.anchor.set(0.5);
    this.addChild(this.label);

    this.eventMode = "none";
    this.t = 0;
    this.gone = false;
  }

  resize(layout) {
    const { ui, safeBox } = layout;

    fitFont(this.label, safeBox.w * 0.82, Math.max(15, 23 * ui));
    this.label.x = safeBox.cx;
    this.label.y = safeBox.cy;
  }

  update(dt) {
    if (this.gone || !this.visible) return;
    this.t += dt;
    this.label.alpha = 0.66 + Math.abs(Math.sin(this.t * PULSE)) * 0.34;
  }

  dismiss() {
    if (this.gone) return;
    this.gone = true;
    tween(this, { alpha: 0 }, 0.2).then(() => {
      this.visible = false;
    });
  }

  hide() {
    this.gone = true;
    this.visible = false;
    this.alpha = 0;
  }
}
