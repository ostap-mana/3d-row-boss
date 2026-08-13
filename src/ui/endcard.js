/**
 * End card — the only screen whose job is conversion.
 * Three tap surfaces: the button, the persistent banner, and the card itself.
 */

import { Container, Graphics, Sprite, Text, Rectangle } from "pixi.js";
import { COPY, FONT, GEM_COLORS, GEM_LIGHT, HEROES, NYX } from "../config.js";
import { heroPortrait } from "../art/heroes.js";
import {
  BUTTON_FILL,
  BUTTON_LABEL,
  BUTTON_RIM,
  ctaButtonSprite,
  fitCtaButton,
} from "../art/button.js";
import { glowTexture, gradientTexture } from "../art/textures.js";
import { tween, delay, Ease } from "../core/tween.js";
import * as sfx from "../audio/sfx.js";
import { fitFont } from "./text.js";

const BACKDROP = [
  [0.0, "#0b0618"],
  [0.5, "#1a0c2c"],
  [1.0, "#3a1030"],
];

/* The CTA's colours live with its art — see art/button.js. */

export class EndCard extends Container {
  constructor(onCta) {
    super();
    this.visible = false;
    this.onCta = onCta;

    this.bg = new Sprite(gradientTexture("endcard", BACKDROP));
    this.addChild(this.bg);

    this.rays = new Graphics();
    this.addChild(this.rays);

    this.glow = new Sprite(glowTexture());
    this.glow.anchor.set(0.5);
    this.glow.blendMode = "add";
    this.glow.tint = GEM_COLORS[NYX];
    this.glow.alpha = 0.45;
    this.addChild(this.glow);

    this.title = new Text({
      text: COPY.endTitle,
      style: {
        fontFamily: FONT,
        fontSize: 40,
        fontWeight: "900",
        fill: 0xffffff,
        letterSpacing: 3,
        align: "center",
        stroke: { color: 0x1a0620, width: 7, join: "round" },
      },
    });
    this.title.anchor.set(0.5);
    this.addChild(this.title);

    this.sub = new Text({
      text: COPY.endSub,
      style: {
        fontFamily: FONT,
        fontSize: 18,
        fontWeight: "800",
        fill: GEM_LIGHT[NYX],
        letterSpacing: 2.4,
        align: "center",
      },
    });
    this.sub.anchor.set(0.5);
    this.addChild(this.sub);

    this.roster = new Container();
    this.addChild(this.roster);
    this.portraits = HEROES.map((hero, i) => {
      const holder = new Container();
      const ring = new Graphics();
      holder.addChild(ring);
      const p = new Sprite(heroPortrait(i));
      p.anchor.set(0.5);
      holder.addChild(p);
      const name = new Text({
        text: hero.name,
        style: {
          fontFamily: FONT,
          fontSize: 12,
          fontWeight: "800",
          fill: i === NYX ? GEM_LIGHT[hero.element] : 0xb9a8d6,
          letterSpacing: 0.8,
        },
      });
      name.anchor.set(0.5, 0);
      holder.addChild(name);
      holder.ring = ring;
      holder.portrait = p;
      holder.nameLabel = name;
      holder.hero = hero;
      this.roster.addChild(holder);
      return holder;
    });

    this.button = new Container();
    /**
     * The painted gold plate — see art/button.js — over the drawn pill the card
     * shipped with. The pill is still underneath and still drawn whenever the
     * art fails to decode, which is the only case it is reached in.
     */
    this.buttonBg = new Graphics();
    this.button.addChild(this.buttonBg);
    this.buttonArt = ctaButtonSprite();
    if (this.buttonArt) this.button.addChild(this.buttonArt);

    this.buttonText = new Text({
      text: COPY.cta,
      style: {
        fontFamily: FONT,
        fontSize: 26,
        fontWeight: "900",
        fill: BUTTON_LABEL,
        letterSpacing: 2,
      },
    });
    this.buttonText.anchor.set(0.5);
    this.button.addChild(this.buttonText);
    this.addChild(this.button);

    // Whole-screen tap target, registered last so it sits on top.
    this.eventMode = "static";
    this.cursor = "pointer";
    this.on("pointertap", () => this.onCta("endcard"));

    this.t = 0;
    this.layout = null;
  }

  resize(layout) {
    this.layout = layout;
    const { w, h } = layout;
    const ui = layout.ui;

    this.bg.setSize(w, h);
    this.hitArea = new Rectangle(0, 0, w, h);

    this.rays.clear();
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 * i) / 16;
      const spread = 0.09;
      const len = Math.max(w, h);
      this.rays.poly([
        w / 2,
        h * 0.42,
        w / 2 + Math.cos(a - spread) * len,
        h * 0.42 + Math.sin(a - spread) * len,
        w / 2 + Math.cos(a + spread) * len,
        h * 0.42 + Math.sin(a + spread) * len,
      ]);
      this.rays.fill({ color: this.defeat ? 0xc43f2a : 0x7b3fc4, alpha: 0.07 });
    }

    // The end card is a vertical stack solved top-down: a fixed-fraction
    // layout puts the title through the roster the moment the screen is short.
    const idealTitle = Math.max(
      20,
      layout.portrait
        ? Math.min(w * 0.16, 62 * ui)
        : Math.min(w * 0.085, h * 0.15),
    );
    this.title.style.stroke = {
      color: 0x1a0620,
      width: Math.max(4, idealTitle * 0.14),
      join: "round",
    };
    const titleSize = fitFont(this.title, w * 0.9, idealTitle);
    this.title.x = w / 2;
    this.title.y = h * 0.055 + this.title.height / 2;

    const subSize = fitFont(this.sub, w * 0.9, Math.max(11, titleSize * 0.34));
    this.sub.x = w / 2;
    this.sub.y = this.title.y + this.title.height / 2 + subSize * 0.9;

    // Button first — the roster then takes whatever vertical room is left.
    const bw = Math.min(w * 0.78, 420 * ui);
    const bh = Math.max(46, Math.min(h * 0.12, 76 * ui));
    const buttonY = h - bh / 2 - h * 0.07;

    // Roster strip
    const count = this.portraits.length;
    const stripW = Math.min(w * 0.98, h * 1.6);
    const slot = stripW / count;
    const rosterTop = this.sub.y + subSize * 0.9;
    const rosterRoom = Math.max(40, buttonY - bh / 2 - h * 0.05 - rosterTop);
    const size = Math.min(slot * 0.94, rosterRoom * 0.74);
    const labelH = size * 0.24;
    const cy = rosterTop + (rosterRoom - size - labelH) / 2 + size / 2;

    this.portraits.forEach((holder, i) => {
      holder.portrait.setSize(size, size);
      const featured = i === NYX;
      holder.scale.set(featured ? 1.16 : 1);
      holder.x = w / 2 - stripW / 2 + slot * (i + 0.5);
      holder.y = cy;

      fitFont(holder.nameLabel, slot * 0.98, Math.max(8, size * 0.17));
      holder.nameLabel.y = size * 0.54;

      const r = size * 0.5;
      holder.ring.clear();
      holder.ring.circle(0, 0, r * 1.02);
      holder.ring.fill({ color: 0x120a22, alpha: 0.9 });
      holder.ring.circle(0, 0, r * 1.02);
      holder.ring.stroke({
        width: Math.max(2, size * 0.05),
        color: featured ? GEM_LIGHT[holder.hero.element] : 0x4a3168,
        alpha: featured ? 1 : 0.8,
      });
    });

    this.glow.setSize(stripW * 0.9, size * 3);
    this.glow.x = w / 2;
    this.glow.y = cy;

    fitFont(this.buttonText, bw * 0.8, Math.max(15, bh * 0.42));
    this.buttonBg.clear();
    if (this.buttonArt) {
      fitCtaButton(this.buttonArt, bw, bh);
    } else {
      this.drawPill(bw, bh);
    }
    this.button.x = w / 2;
    this.button.y = buttonY;
    this.button.hitArea = new Rectangle(-bw / 2, -bh / 2, bw, bh);
    this.button.eventMode = "static";
    this.button.cursor = "pointer";
    this.button.removeAllListeners();
    this.button.on("pointertap", (e) => {
      e.stopPropagation();
      this.onCta("button");
    });
  }

  /**
   * The drawn stand-in, in the plate's own gold.
   *
   * Only reached when the art failed to decode — a device that cannot read the
   * button's bitmap still gets a button, and it is the one surface in the whole
   * creative that absolutely has to be there. It follows the plate's corner
   * rather than the pill's, so the fallback is the same shape as the real thing.
   */
  drawPill(bw, bh) {
    const g = this.buttonBg;
    const r = bh * 0.22;
    g.roundRect(-bw / 2, -bh / 2, bw, bh, r);
    g.fill({ color: BUTTON_FILL });
    // Inset so the gloss follows the plate instead of poking out of its corners.
    const inset = bh * 0.16;
    g.roundRect(
      -bw / 2 + inset,
      -bh / 2 + inset * 0.5,
      bw - inset * 2,
      bh * 0.34,
      r * 0.6,
    );
    g.fill({ color: 0xfff0b0, alpha: 0.35 });
    g.roundRect(-bw / 2, -bh / 2, bw, bh, r);
    g.stroke({ width: Math.max(2, bh * 0.06), color: BUTTON_RIM });
  }

  /**
   * @param {"victory"|"defeat"} outcome the fight can be lost now, and the
   *   card has to say so — a "COLLECT YOUR HEROES" screen over a party wipe
   *   reads as a bug, and a losing player is the one most worth re-pitching.
   */
  async show(outcome) {
    this.defeat = outcome === "defeat";
    sfx.endcard(this.defeat);
    this.title.text = this.defeat ? COPY.defeatTitle : COPY.endTitle;
    this.sub.text = this.defeat ? COPY.defeatSub : COPY.endSub;
    this.sub.style.fill = this.defeat ? 0xffa892 : GEM_LIGHT[NYX];
    this.buttonText.text = this.defeat ? COPY.defeatCta : COPY.cta;
    this.glow.tint = this.defeat ? 0xff4a2a : GEM_COLORS[NYX];
    // Re-solve the stack: every headline here is fitted to the screen width,
    // and the defeat copy is a different length from the victory copy.
    if (this.layout) this.resize(this.layout);

    this.visible = true;
    this.alpha = 0;

    const els = [this.title, this.sub, this.button];
    els.forEach((el) => {
      el.alpha = 0;
    });
    this.portraits.forEach((p) => {
      p.alpha = 0;
    });

    await tween(this, { alpha: 1 }, 0.3);

    tween(this.title, { alpha: 1 }, 0.28);
    const ty = this.title.y;
    this.title.y = ty - 26;
    tween(this.title, { y: ty }, 0.42, { ease: Ease.backOut });

    await delay(0.12);
    tween(this.sub, { alpha: 1 }, 0.28);

    this.portraits.forEach((p, i) => {
      const base = i === NYX ? 1.16 : 1;
      p.scale.set(base * 0.6);
      tween(p, { alpha: 1 }, 0.2, { delay: 0.05 * i });
      tween(p.scale, { x: base, y: base }, 0.36, {
        delay: 0.05 * i,
        ease: Ease.backOut,
      });
    });

    await delay(0.35);
    const by = this.button.y;
    this.button.y = by + 30;
    tween(this.button, { alpha: 1 }, 0.25);
    await tween(this.button, { y: by }, 0.4, { ease: Ease.backOut });
  }

  update(dt) {
    if (!this.visible) return;
    this.t += dt;
    const p = 1 + Math.sin(this.t * 3.4) * 0.035;
    this.button.scale.set(p);
    this.rays.rotation += dt * 0.04;
    this.rays.pivot.set(
      this.layout ? this.layout.w / 2 : 0,
      this.layout ? this.layout.h * 0.42 : 0,
    );
    this.rays.position.set(
      this.layout ? this.layout.w / 2 : 0,
      this.layout ? this.layout.h * 0.42 : 0,
    );
    this.glow.alpha = 0.35 + Math.sin(this.t * 2.2) * 0.12;
  }
}
