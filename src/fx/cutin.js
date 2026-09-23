import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import {
  FONT,
  FONT_TITLE,
  GEM_COLORS,
  GEM_DARK,
  GEM_LIGHT,
  HEROES,
  HEALER,
} from "../config.js";
import { heroPortrait } from "../art/heroes.js";
import { heroBust } from "../art/avatars.js";
import { glowTexture } from "../art/textures.js";
import { fitUltBorder, ultBurst, ultBurstTexture } from "../art/ultborder.js";
import { lerpColor } from "../core/color.js";
import { tween, delay, killTweensOf, Ease } from "../core/tween.js";
import * as sfx from "../audio/sfx.js";

const DIM = 0.982;
const DIM_COLOR = 0x04030a;

const LEAN = 0.34;

const PANEL = {
  aspect: 0.5,
  tall: { portrait: 0.44, landscape: 0.72 },
  wide: { portrait: 0.52, landscape: 0.3 },
  tilt: -0.052,
  corner: 0.075,
};

const RAYS = {
  count: 96,
  inner: 0.62,
  fat: 0.021,
  thin: 0.0012,
  taper: 3.2,
  peak: 0.34,
  falloff: 1.7,
  hot: 0.45,
  drift: 0.9,
  white: 0.12,
};

const HAZE_LIFT = 0.07;

function hazeTint(element) {
  return lerpColor(GEM_COLORS[element], GEM_DARK[element], 0.45);
}

function hazeAlpha(element) {
  const c = hazeTint(element);
  const lum =
    (0.2126 * ((c >> 16) & 255) +
      0.7152 * ((c >> 8) & 255) +
      0.0722 * (c & 255)) /
    255;
  return HAZE_LIFT / Math.max(lum, 0.08);
}

const GATE = { land: 0.52, hold: 0.78 };

function jitter(i) {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export class CutIn extends Container {
  constructor() {
    super();
    this.visible = false;

    this.index = HEALER;

    this.dim = new Graphics();
    this.addChild(this.dim);

    this.haze = new Sprite(glowTexture());
    this.haze.anchor.set(0.5);
    this.haze.blendMode = "add";
    this.haze.tint = hazeTint(HEROES[HEALER].element);
    this.addChild(this.haze);

    this.hazeRest = hazeAlpha(HEROES[HEALER].element);

    this.rayHub = new Container();
    this.rays = new Graphics();
    this.rays.blendMode = "add";
    this.rayHub.addChild(this.rays);
    this.addChild(this.rayHub);

    this.glow = new Sprite(glowTexture());
    this.glow.anchor.set(0.5);
    this.glow.blendMode = "add";
    this.glow.tint = GEM_COLORS[HEROES[HEALER].element];
    this.addChild(this.glow);

    this.bust = new Container();
    this.addChild(this.bust);

    this.gate = new Sprite(Texture.EMPTY);
    this.gate.anchor.set(0.5);
    this.gate.blendMode = "add";
    this.gate.visible = false;
    this.bust.addChild(this.gate);

    this.gateArt = null;
    this.gateDriver = { v: 0 };

    this.plateBack = new Graphics();
    this.bust.addChild(this.plateBack);

    this.art = new Sprite(heroBust(HEROES[HEALER].element) || Texture.EMPTY);
    this.art.anchor.set(0.5);
    this.bust.addChild(this.art);

    this.artMask = new Graphics();
    this.bust.addChild(this.artMask);
    this.art.mask = this.artMask;

    this.plateFront = new Graphics();
    this.bust.addChild(this.plateFront);

    this.ring = new Graphics();
    this.ring.blendMode = "add";
    this.ring.alpha = 0;
    this.addChild(this.ring);

    this.plate = new Graphics();
    this.addChild(this.plate);

    this.kicker = new Text({
      text: "ULTIMATE",
      style: {
        fontFamily: FONT,
        fontSize: 16,
        fontWeight: "800",
        fill: GEM_LIGHT[HEROES[HEALER].element],
        letterSpacing: 6,
      },
    });
    this.kicker.anchor.set(0, 0.5);
    this.addChild(this.kicker);

    this.name = new Text({
      text: HEROES[HEALER].name,
      style: {
        fontFamily: FONT_TITLE,
        fontSize: 44,
        fontWeight: "900",
        fill: 0xffffff,
        letterSpacing: 4,
      },
    });
    this.name.anchor.set(0, 0.5);
    this.addChild(this.name);

    this.skill = new Text({
      text: HEROES[HEALER].skill,
      style: {
        fontFamily: FONT,
        fontSize: 20,
        fontWeight: "800",
        fill: GEM_LIGHT[HEROES[HEALER].element],
        letterSpacing: 2.4,
      },
    });
    this.skill.anchor.set(0, 0.5);
    this.addChild(this.skill);

    this.wash = new Graphics();
    this.wash.alpha = 0;
    this.addChild(this.wash);

    this.layout = null;

    this.bustHome = 0;
    this.textHome = 0;
    this.bustScale = { x: 1, y: 1 };
    this.glowScale = { x: 1, y: 1 };
    this.ringHome = 1;

    this.playId = 0;
    this.freed = null;

    this.setGate(HEROES[this.index].element);
  }

  adoptUltArt() {
    this.setGate(HEROES[this.index].element);
    if (this.layout) this.resize(this.layout);
  }

  setGate(element) {
    const art = ultBurst(element);
    this.gateArt = art && art.shape !== "halo" ? art : null;
    this.gate.visible = !!this.gateArt;
    if (this.gateArt) this.gate.texture = this.gateArt.frames[0];
  }

  setHero(index) {
    const hero = HEROES[index];
    if (!hero) return;

    const changed = this.index !== index;
    this.index = index;
    if (!changed) return;

    this.art.texture = heroBust(hero.element) || heroPortrait(index);
    this.glow.tint = GEM_COLORS[hero.element];
    this.haze.tint = hazeTint(hero.element);
    this.hazeRest = hazeAlpha(hero.element);
    this.name.text = hero.name;
    this.skill.text = hero.skill;
    this.skill.style.fill = GEM_LIGHT[hero.element];
    this.kicker.style.fill = GEM_LIGHT[hero.element];
    this.setGate(hero.element);
    if (this.layout) this.resize(this.layout);
  }

  resize(layout) {
    this.layout = layout;
    const { w, h } = layout;
    const s = layout.safeBox;
    const el = HEROES[this.index].element;
    const tall = layout.portrait;

    this.dim.clear();
    this.dim.rect(0, 0, w, h);
    this.dim.fill({ color: DIM_COLOR });

    this.wash.clear();
    this.wash.rect(0, 0, w, h);
    this.wash.fill({ color: GEM_LIGHT[el] });

    const ph = Math.min(
      s.h * (tall ? PANEL.tall.portrait : PANEL.tall.landscape),
      (s.w * (tall ? PANEL.wide.portrait : PANEL.wide.landscape)) /
        PANEL.aspect,
    );
    const pw = ph * PANEL.aspect;
    const rad = pw * PANEL.corner;

    this.bust.rotation = PANEL.tilt;
    this.bust.x = s.x + s.w * (tall ? 0.47 : 0.26);
    this.bust.y = s.y + s.h * (tall ? 0.36 : 0.47);

    this.plateBack.clear();
    this.plateBack.roundRect(-pw / 2, -ph / 2, pw, ph, rad);
    this.plateBack.fill({ color: lerpColor(0x05040c, GEM_DARK[el], 0.35) });

    const tex = this.art.texture;
    const fit = Math.max(pw / tex.width, ph / tex.height);
    this.art.setSize(tex.width * fit, tex.height * fit);
    this.art.x = 0;
    this.art.y = (ph - tex.height * fit) * 0.28;

    this.artMask.clear();
    this.artMask.roundRect(-pw / 2, -ph / 2, pw, ph, rad);
    this.artMask.fill({ color: 0xffffff });

    this.plateFront.clear();

    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      const y = -ph / 2 + ph * (0.62 + t * 0.38);
      this.plateFront.rect(-pw / 2, y, pw, ph * 0.1 + 1);
      this.plateFront.fill({
        color: lerpColor(GEM_DARK[el], 0x03020a, 0.55),
        alpha: 0.16 + t * 0.3,
      });
    }

    this.plateFront.roundRect(-pw / 2, -ph / 2, pw, ph, rad);
    this.plateFront.stroke({
      width: Math.max(2, pw * 0.035),
      color: 0x07050e,
      alpha: 0.9,
      alignment: 1,
    });
    if (!this.gateArt) {
      this.plateFront.roundRect(-pw / 2, -ph / 2, pw, ph, rad);
      this.plateFront.stroke({
        width: Math.max(1.5, pw * 0.018),
        color: GEM_COLORS[el],
        alignment: 0.5,
      });
      this.plateFront.roundRect(
        -pw / 2 + pw * 0.03,
        -ph / 2 + pw * 0.03,
        pw - pw * 0.06,
        ph - pw * 0.06,
        rad * 0.7,
      );
      this.plateFront.stroke({
        width: Math.max(1, pw * 0.008),
        color: GEM_LIGHT[el],
        alpha: 0.5,
      });

      const tick = pw * 0.26;
      const inset = pw * 0.09;
      for (const [sx, sy] of [
        [-1, -1],
        [1, 1],
      ]) {
        const x = sx * (pw / 2 - inset);
        const y = sy * (ph / 2 - inset);
        this.plateFront.moveTo(x - sx * 0, y);
        this.plateFront.lineTo(x, y - sy * tick);
        this.plateFront.moveTo(x, y);
        this.plateFront.lineTo(x - sx * tick, y);
        this.plateFront.stroke({
          width: Math.max(2, pw * 0.022),
          color: GEM_LIGHT[el],
          alpha: 0.85,
          cap: "round",
        });
      }
    }

    if (this.gateArt) fitUltBorder(this.gate, this.gateArt, pw, ph);

    this.glow.setSize(pw * 3.4, ph * 1.9);
    this.glow.x = this.bust.x;
    this.glow.y = this.bust.y;
    this.haze.x = this.bust.x;
    this.haze.y = this.bust.y;
    this.haze.setSize(w * 1.45, h * 1.7);

    const reach =
      Math.hypot(
        Math.max(this.bust.x, w - this.bust.x),
        Math.max(this.bust.y, h - this.bust.y),
      ) * 1.05;
    const r0 = ph * RAYS.inner;

    this.rayHub.x = this.bust.x;
    this.rayHub.y = this.bust.y;
    this.rays.clear();
    for (let i = 0; i < RAYS.count; i++) {
      const a =
        ((i + jitter(i) * RAYS.drift) / RAYS.count) * Math.PI * 2 + PANEL.tilt;
      const white = jitter(i + 53) < RAYS.white;
      const hw = Math.min(
        RAYS.thin + (RAYS.fat - RAYS.thin) * jitter(i + 17) ** RAYS.taper,
        white ? RAYS.fat * 0.16 : RAYS.fat,
      );
      const alpha =
        (white ? RAYS.peak * 1.5 : RAYS.peak) *
        (0.35 + jitter(i + 91) * 0.65) ** RAYS.falloff;
      const color = white
        ? 0xffffff
        : lerpColor(GEM_COLORS[el], GEM_LIGHT[el], jitter(i + 11) * 0.6);

      const wedge = (t0, k) => {
        const rin = r0 + (reach - r0) * t0;
        const win = hw * (0.06 + t0 * 0.94);
        this.rays.poly([
          Math.cos(a - win) * rin,
          Math.sin(a - win) * rin,
          Math.cos(a + win) * rin,
          Math.sin(a + win) * rin,
          Math.cos(a + hw) * reach,
          Math.sin(a + hw) * reach,
          Math.cos(a - hw) * reach,
          Math.sin(a - hw) * reach,
        ]);
        this.rays.fill({ color, alpha: alpha * k });
      };

      wedge(0, 0.45);
      wedge(1 - RAYS.hot, 0.75);
    }

    this.ringHome = ph * 0.5;
    this.ring.clear();
    this.ring.circle(0, 0, this.ringHome);
    this.ring.stroke({
      width: Math.max(2, ph * 0.012),
      color: GEM_LIGHT[el],
      alpha: 0.9,
    });
    this.ring.circle(0, 0, this.ringHome * 0.92);
    this.ring.stroke({ width: Math.max(1, ph * 0.005), color: 0xffffff });
    this.ring.x = this.bust.x;
    this.ring.y = this.bust.y;

    const fs = Math.max(
      22,
      Math.min(s.w * (tall ? 0.13 : 0.105), 54 * layout.ui),
    );
    this.name.style.fontSize = fs;
    this.name.style.letterSpacing = fs * 0.085;
    this.name.style.dropShadow = {
      color: 0x03020a,
      alpha: 0.85,
      blur: fs * 0.22,
      distance: 0,
      angle: 0,
    };
    this.skill.style.fontSize = fs * 0.4;
    this.skill.style.letterSpacing = fs * 0.06;
    this.skill.style.dropShadow = {
      color: 0x03020a,
      alpha: 0.8,
      blur: fs * 0.1,
      distance: 0,
      angle: 0,
    };
    this.kicker.style.fontSize = fs * 0.26;
    this.kicker.style.letterSpacing = fs * 0.17;

    const textX = s.x + s.w * (tall ? 0.15 : 0.47);
    const midY = s.y + s.h * (tall ? 0.74 : 0.47);
    this.kicker.x = textX;
    this.kicker.y = midY - fs * 0.78;
    this.name.x = textX;
    this.name.y = midY;
    this.skill.x = textX;
    this.skill.y = midY + fs * 0.62;

    this.bust.scale.set(1, 1);
    this.bustHome = this.bust.x;
    this.textHome = textX;
    this.bustScale = { x: 1, y: 1 };
    this.glowScale = { x: this.glow.scale.x, y: this.glow.scale.y };

    const top = this.kicker.y - fs * 0.34;
    const bot = this.skill.y + fs * 0.42;
    const bh = bot - top;
    const shear = bh * LEAN;
    const left = textX - fs * 0.66;
    const leanAt = (t) => shear * (0.5 - t);
    const yAt = (t) => top + bh * t;
    const lAt = (t) => left + leanAt(t);

    const clearing = (width, y) =>
      textX + width + fs * 0.8 + shear * 0.5 - leanAt((y - top) / bh);
    const right = Math.min(
      s.right,
      Math.max(
        clearing(this.kicker.width, this.kicker.y),
        clearing(this.name.width, this.name.y),
        clearing(this.skill.width, this.skill.y),
      ),
    );
    const rAt = (t) => right - shear * 0.5 + leanAt(t);
    const band = (t0, t1) => [
      lAt(t0),
      yAt(t0),
      rAt(t0),
      yAt(t0),
      rAt(t1),
      yAt(t1),
      lAt(t1),
      yAt(t1),
    ];

    this.plate.clear();

    if (right < s.right - fs * 0.2) {
      const t0 = 0.5;
      const t1 = t0 + Math.max(1, fs * 0.045) / bh;
      this.plate.poly([
        rAt(t0) - fs * 0.4,
        yAt(t0),
        s.right,
        yAt(t0),
        s.right,
        yAt(t1),
        rAt(t1) - fs * 0.4,
        yAt(t1),
      ]);
      this.plate.fill({ color: GEM_COLORS[el], alpha: 0.42 });
    }

    this.plate.poly(band(0, 1));
    this.plate.fill({
      color: lerpColor(0x0a0716, GEM_DARK[el], 0.2),
      alpha: 0.97,
    });
    this.plate.poly(band(0.45, 1));
    this.plate.fill({ color: 0x000000, alpha: 0.3 });

    const rule = Math.max(1, fs * 0.035) / bh;
    this.plate.poly(band(0, rule));
    this.plate.fill({ color: GEM_LIGHT[el], alpha: 0.55 });
    this.plate.poly(band(1 - rule * 0.7, 1));
    this.plate.fill({ color: GEM_COLORS[el], alpha: 0.35 });

    const barW = fs * 0.22;
    const bar = (a, b) => [
      lAt(0) + barW * a,
      yAt(0),
      lAt(0) + barW * b,
      yAt(0),
      lAt(1) + barW * b,
      yAt(1),
      lAt(1) + barW * a,
      yAt(1),
    ];
    this.plate.poly(bar(0, 1));
    this.plate.fill({ color: GEM_COLORS[el] });
    this.plate.poly(bar(0.3, 0.72));
    this.plate.fill({ color: GEM_LIGHT[el] });
  }

  reset() {
    killTweensOf(this.dim);
    killTweensOf(this.wash);
    killTweensOf(this.haze);
    killTweensOf(this.rayHub);
    killTweensOf(this.rayHub.scale);
    killTweensOf(this.rays);
    killTweensOf(this.glow);
    killTweensOf(this.glow.scale);
    killTweensOf(this.bust);
    killTweensOf(this.bust.scale);
    killTweensOf(this.ring);
    killTweensOf(this.ring.scale);
    killTweensOf(this.gateDriver);
    killTweensOf(this.plate);
    killTweensOf(this.kicker);
    killTweensOf(this.name);
    killTweensOf(this.skill);

    this.alpha = 1;
    this.dim.alpha = 0;
    this.wash.alpha = 0;
    this.haze.alpha = 0;
    this.rayHub.rotation = 0;
    this.rayHub.scale.set(1);
    this.rays.alpha = 0;
    this.glow.alpha = 0;
    this.glow.scale.set(this.glowScale.x, this.glowScale.y);
    this.bust.alpha = 1;
    this.bust.x = this.bustHome;
    this.bust.rotation = PANEL.tilt;
    this.bust.scale.set(this.bustScale.x, this.bustScale.y);
    this.ring.alpha = 0;
    this.ring.scale.set(1);
    this.gateDriver.v = 0;
    if (this.gateArt) this.gate.texture = this.gateArt.frames[0];
    this.plate.alpha = 1;
    this.plate.x = 0;
    this.kicker.alpha = 1;
    this.kicker.x = this.textHome;
    this.name.alpha = 1;
    this.name.x = this.textHome;
    this.skill.alpha = 1;
    this.skill.x = this.textHome;
  }

  gateTo(v, dur, ease) {
    if (!this.gateArt) return Promise.resolve();
    return tween(this.gateDriver, { v }, dur, {
      ease,
      onUpdate: () => {
        this.gate.texture = ultBurstTexture(this.gateArt, this.gateDriver.v);
      },
    });
  }

  hold(index) {
    return new Promise((reached) => this.play(index, reached));
  }

  release() {
    const go = this.freed;
    this.freed = null;
    if (go) go();
    return !!go;
  }

  hide() {
    this.playId++;
    this.release();
    this.visible = false;
    this.reset();
    return true;
  }

  async play(index, reached) {
    if (index !== undefined) this.setHero(index);
    const { w } = this.layout.stage;
    const token = ++this.playId;

    this.release();
    this.reset();
    this.visible = true;
    sfx.ultCutin(HEROES[this.index].element);

    const homeX = this.bustHome;
    const textHome = this.textHome;
    const bs = this.bustScale;
    const gs = this.glowScale;

    this.dim.alpha = DIM;
    this.rays.alpha = 1;
    this.haze.alpha = this.hazeRest;
    this.wash.alpha = 0.94;

    this.rayHub.scale.set(1.35);
    this.rayHub.rotation = -0.16;
    this.bust.x = homeX - w * 0.45;
    this.bust.scale.set(bs.x * 1.14, bs.y * 1.14);
    this.kicker.x = textHome + w * 0.34;
    this.name.x = textHome + w * 0.5;
    this.skill.x = textHome + w * 0.7;
    this.plate.x = w;

    tween(this.wash, { alpha: 0 }, 0.2, { ease: Ease.quadOut });

    tween(this.rayHub.scale, { x: 1, y: 1 }, 0.42, { ease: Ease.expoOut });
    tween(this.rayHub, { rotation: 0 }, 0.5, { ease: Ease.expoOut });

    await Promise.all([
      tween(this.bust, { x: homeX }, 0.32, { ease: Ease.expoOut }),
      tween(this.bust.scale, { x: bs.x, y: bs.y }, 0.36, {
        ease: Ease.expoOut,
      }),
      tween(this.glow, { alpha: 0.7 }, 0.3),
      tween(this.plate, { x: 0 }, 0.28, { ease: Ease.expoOut }),
      tween(this.kicker, { x: textHome }, 0.3, { ease: Ease.expoOut }),
      tween(this.name, { x: textHome }, 0.34, { ease: Ease.expoOut }),
      tween(this.skill, { x: textHome }, 0.4, { ease: Ease.expoOut }),
      this.gateTo(GATE.land, 0.32, Ease.linear),
    ]);
    if (this.playId !== token) return;

    this.ring.alpha = 0.85;
    this.ring.scale.set(0.75);
    tween(this.ring.scale, { x: 2.6, y: 2.6 }, 0.42, { ease: Ease.quadOut });
    tween(this.ring, { alpha: 0 }, 0.38, { ease: Ease.quadOut });

    tween(this.rayHub, { rotation: 0.05 }, 0.62, {
      ease: Ease.quadOut,
      delay: 0.12,
    });
    tween(this.bust.scale, { x: bs.x * 1.05, y: bs.y * 1.05 }, 0.45, {
      ease: Ease.quadOut,
    });
    this.gateTo(GATE.hold, 0.43, Ease.linear);
    await delay(0.34);
    if (this.playId !== token) return;

    if (reached) {
      reached();
      await new Promise((resolve) => {
        this.freed = resolve;
      });
      if (this.playId !== token) return;
    }

    await Promise.all([
      tween(this.bust.scale, { x: bs.x * 0.98, y: bs.y * 0.98 }, 0.09, {
        ease: Ease.quadOut,
      }),
      tween(this.bust, { x: homeX - w * 0.02 }, 0.09, { ease: Ease.quadOut }),
    ]);
    if (this.playId !== token) return;

    tween(this.bust.scale, { x: bs.x * 1.55, y: bs.y * 1.55 }, 0.26, {
      ease: Ease.quadIn,
    });
    tween(this.bust, { x: homeX + w * 0.06 }, 0.26, { ease: Ease.quadIn });
    tween(this.bust, { rotation: PANEL.tilt * 2.4 }, 0.26, {
      ease: Ease.quadIn,
    });
    tween(this.bust, { alpha: 0 }, 0.16, { delay: 0.1 });
    this.gateTo(1, 0.26, Ease.linear);
    tween(this.glow.scale, { x: gs.x * 1.8, y: gs.y * 1.8 }, 0.24, {
      ease: Ease.quadIn,
    });
    tween(this.glow, { alpha: 0 }, 0.22, { delay: 0.06 });
    tween(this.rayHub.scale, { x: 2.4, y: 2.4 }, 0.26, { ease: Ease.quadIn });
    tween(this.rayHub, { rotation: 0.16 }, 0.26, { ease: Ease.quadIn });
    tween(this.rays, { alpha: 0 }, 0.22, { delay: 0.06 });
    tween(this.haze, { alpha: 0 }, 0.22, { delay: 0.04 });
    tween(this.plate, { x: w }, 0.2, { ease: Ease.backIn });
    tween(this.kicker, { x: textHome + w * 0.4 }, 0.18, { ease: Ease.backIn });
    tween(this.name, { x: textHome + w * 0.55 }, 0.2, { ease: Ease.backIn });
    tween(this.skill, { x: textHome + w * 0.75 }, 0.22, { ease: Ease.backIn });
    tween(this.dim, { alpha: 0 }, 0.24, { delay: 0.05 });

    await tween(this.wash, { alpha: 1 }, 0.17, { ease: Ease.quadIn });
    if (this.playId !== token) return;

    this.dim.alpha = 0;
    this.haze.alpha = 0;
    this.rays.alpha = 0;
    this.bust.alpha = 0;
    this.glow.alpha = 0;
    this.ring.alpha = 0;
    this.plate.alpha = 0;
    this.kicker.alpha = 0;
    this.name.alpha = 0;
    this.skill.alpha = 0;

    tween(this.wash, { alpha: 0 }, 0.32, { ease: Ease.quadOut }).then(() => {
      if (this.playId !== token) return;
      this.visible = false;
      this.reset();
    });
  }
}
