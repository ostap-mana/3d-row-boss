import { Container, Graphics, Sprite, Text, Texture, Rectangle } from "pixi.js";
import {
  DIFFICULTY,
  GEM_COLORS,
  GEM_DARK,
  GEM_LIGHT,
  FONT,
  HEALER,
  HEROES,
  HERO_CRITICAL,
  HERO_HP_FLOOR,
  HERO_MAX_HP,
  HERO_MAX_CHARGE,
} from "../config.js";
import { drawGemShape, gemTexture } from "./gems.js";
import { cardPlate } from "./plates.js";
import {
  ultBorder,
  ultBurst,
  ultLoopTexture,
  ultBurstTexture,
  fitUltBorder,
} from "./ultborder.js";
import {
  barTroughTexture,
  manaPaintTexture,
  hpPaintTexture,
  BAR_INSET,
} from "./cardbars.js";
import { heroBust, heroCardBust, heroRoundel } from "./avatars.js";
import { SPELL_BY_ELEMENT, SPELL_TRAVEL_LAST, spellFrames } from "./spells.js";
import { CROWN_CELL, readyCrownFrames } from "./readyfx.js";
import {
  beamTexture,
  glowTexture,
  gradientTexture,
  sparkTexture,
} from "./textures.js";
import { getRenderer } from "../core/context.js";
import { rndInt } from "../core/rng.js";
import {
  tween,
  tweenValue,
  delay,
  killTweensOf,
  punch,
  Ease,
} from "../core/tween.js";
import { lerpColor } from "../core/color.js";
import { clampWidth, fitFont } from "../ui/text.js";
import * as sfx from "../audio/sfx.js";

const ART = 128;

const HP_GOOD = 0x4ee27a;
const HP_LOW = 0xff3b2f;
const HURT_FLASH = 0xff4a3a;
const DOWN_TINT = 0x6a6270;

const FALL = {
  slump: 0.26,
  drop: 14,
  shrink: 0.9,
  settle: 0.62,
  alpha: 0.5,
  lurch: 0.12,
};

const RISE = {
  over: 1.16,
  up: 0.18,
  back: 0.34,
  flash: 0xd9ffe6,
};

const HEAD_BIAS = 0.34;

const FOOT_SCRIM = [
  [0, "rgba(9,5,16,0)"],
  [0.45, "rgba(9,5,16,0.46)"],
  [1, "rgba(9,5,16,0.93)"],
];
const FOOT_BAND = 0.46;

const SIGIL = { k: 0.32, min: 13, max: 30, gap: 0.085 };

const ULT = {
  alpha: 0.85,
  in: 0.26,
  out: 0.22,
  burst: { grow: 1.06, dur: 0.62, lead: 0, tail: 0.72 },
  flare: { grow: 1.18, rate: 2.6, dur: 0.3, lead: 0 },
};

const sigils = {};

function elementSigil(element) {
  const board = gemTexture(element);
  if (board) return board;
  if (sigils[element]) return sigils[element];

  const ART = 100;
  const PAD = 8;
  const holder = new Graphics();
  holder.rect(-ART / 2 - PAD, -ART / 2 - PAD, ART + PAD * 2, ART + PAD * 2);
  holder.fill({ color: 0xffffff, alpha: 0 });
  drawGemShape(holder, element);

  const tex = getRenderer().generateTexture({
    target: holder,
    resolution: 2,
    antialias: true,
  });
  holder.destroy();
  sigils[element] = tex;
  return tex;
}

let portraitTextures = null;
let cardArtTextures = null;

function initPortraits() {
  if (portraitTextures) return portraitTextures;

  const drawn = HEROES.map((hero) =>
    heroRoundel(hero.element) && heroBust(hero.element)
      ? null
      : drawnPortrait(hero),
  );
  portraitTextures = HEROES.map(
    (hero, i) => heroRoundel(hero.element) || drawn[i],
  );
  cardArtTextures = HEROES.map(
    (hero, i) => heroCardBust(hero.element) || drawn[i],
  );

  return portraitTextures;
}

function drawnPortrait(hero) {
  const renderer = getRenderer();
  const el = hero.element;
  const g = new Graphics();

  g.rect(-ART / 2, -ART / 2, ART, ART);
  g.fill({ color: 0xffffff, alpha: 0 });

  const crest = new Graphics();
  drawGemShape(crest, el);
  crest.scale.set(0.92);
  crest.y = -22;
  crest.alpha = 0.3;

  g.moveTo(-58, 64);
  g.quadraticCurveTo(-48, -4, -20, -24);
  g.lineTo(20, -24);
  g.quadraticCurveTo(48, -4, 58, 64);
  g.closePath();
  g.fill({ color: GEM_DARK[el] });
  g.stroke({ width: 5, color: 0x0d0812, alpha: 0.9 });

  g.moveTo(-58, 64);
  g.quadraticCurveTo(-42, 2, -16, -22);
  g.lineTo(-4, -24);
  g.lineTo(-10, 64);
  g.closePath();
  g.fill({ color: 0x000000, alpha: 0.24 });

  g.moveTo(-30, 12);
  g.lineTo(0, 44);
  g.lineTo(30, 12);
  g.stroke({ width: 6, color: GEM_COLORS[el], alpha: 0.85 });

  g.circle(0, 30, 13);
  g.fill({ color: 0x0b0713, alpha: 0.85 });
  g.circle(0, 30, 13);
  g.stroke({ width: 3.5, color: GEM_LIGHT[el], alpha: 0.9 });
  g.circle(0, 30, 5.5);
  g.fill({ color: GEM_LIGHT[el] });

  g.moveTo(-36, 10);
  g.quadraticCurveTo(-42, -48, -6, -68);
  g.lineTo(4, -70);
  g.quadraticCurveTo(42, -48, 36, 10);
  g.quadraticCurveTo(0, 26, -36, 10);
  g.closePath();
  g.fill({ color: GEM_COLORS[el] });
  g.stroke({ width: 5, color: 0x0d0812, alpha: 0.9 });

  g.moveTo(-34, 2);
  g.quadraticCurveTo(-38, -44, -4, -62);
  g.stroke({ width: 5, color: GEM_LIGHT[el], alpha: 0.75 });

  g.ellipse(0, -12, 23, 27);
  g.fill({ color: 0x0a060e, alpha: 0.97 });

  g.ellipse(-10, -14, 11, 7);
  g.fill({ color: GEM_COLORS[el], alpha: 0.32 });
  g.ellipse(10, -14, 11, 7);
  g.fill({ color: GEM_COLORS[el], alpha: 0.32 });
  g.poly([-17, -17, -4, -14, -17, -9]);
  g.fill({ color: GEM_LIGHT[el] });
  g.poly([17, -17, 4, -14, 17, -9]);
  g.fill({ color: GEM_LIGHT[el] });

  g.moveTo(-54, 42);
  g.quadraticCurveTo(0, 22, 54, 42);
  g.stroke({ width: 6, color: GEM_LIGHT[el], alpha: 0.45 });

  const holder = new Container();
  holder.addChild(crest, g);
  const tex = renderer.generateTexture({
    target: holder,
    resolution: 3,
    antialias: true,
  });
  holder.destroy({ children: true });
  return tex;
}

export function heroPortrait(index) {
  return initPortraits()[index];
}

function heroCardArt(index) {
  initPortraits();
  return cardArtTextures[index];
}

const BAR_RIM = BAR_INSET;

function readouts(w, h) {
  const floor = readoutDepth(READOUT_MIN);
  const share = h * BAR_SHARE;
  const manaReads = share >= floor;
  const hpH = Math.max(floor, share);
  const manaH = manaReads ? hpH : Math.max(2, share);
  const gap = Math.max(1, hpH * BAR_RIM * 2);
  const manaY = h / 2 - Math.max(3, h * 0.07) - manaH;
  return {
    hpH,
    manaH,
    manaReads,
    gap,
    manaY,
    hpY: manaY - gap - hpH,
    barW: w * 0.86,
  };
}

const BAR_SHARE = 0.088;

const NAME_ROOM = 0.94;

const NAME_FLOOR = 5;

const HITZONE = { cap: 0.713, descend: 0.008, advance: 0.617 };

const READOUT_TYPE = { width: 0.82, track: 0.02 };

const READOUT_MIN = 10.5;

const READOUT_PAIR_MIN = 11;

const LABEL_HOLD = 0.08;

function readoutSize(u) {
  return (u * (1 - BAR_RIM * 3)) / HITZONE.cap;
}

function readoutDepth(size) {
  return (size * HITZONE.cap) / (1 - BAR_RIM * 3);
}

class Gauge extends Container {
  constructor(paint) {
    super();

    this.g = new Graphics();
    this.addChild(this.g);

    const trough = barTroughTexture();
    this.trough = null;
    if (trough) {
      this.trough = new Sprite(trough);
      this.trough.anchor.set(0, 0);
      this.addChild(this.trough);
    }

    this.paint = null;
    if (paint) {
      this.paint = new Sprite(paint);
      this.paint.anchor.set(0, 0);
      this.addChild(this.paint);
    }

    this.label = new Text({
      text: "",
      style: {
        fontFamily: FONT,
        fontSize: 12,
        fontWeight: "700",
        fill: 0xffffff,
        dropShadow: {
          color: 0x0a0714,
          alpha: 0.85,
          blur: 3,
          distance: 0,
          angle: 0,
        },
      },
    });
    this.label.anchor.set(0.5);
    this.addChild(this.label);

    this.top = 0;
    this.barW = 0;
    this.barH = 0;
    this.v = 1;
    this.value = "";
    this.max = "";
    this.fallback = 0xffffff;

    this.pair = true;

    this.reads = true;

    this.shown = null;
    this.labelDue = false;
    this.labelAge = LABEL_HOLD;
    this.labelFitFor = "";
  }

  place(top, barW, barH) {
    this.top = top;
    this.barW = barW;
    this.barH = barH;
    this.shown = null;
    this.labelFitFor = "";
    this.draw();
  }

  read(v, paint, value, max, fallback) {
    this.v = Math.max(0, Math.min(1, v));
    if (paint && this.paint) this.paint.texture = paint;
    this.value = String(value);
    this.max = String(max);
    this.fallback = fallback;
    this.draw();
  }

  tick(dt) {
    this.labelAge += dt;
    if (this.labelDue && this.labelAge >= LABEL_HOLD) this.writeLabel();
  }

  barsChanged() {
    const s = this.shown;
    return (
      !s ||
      s.v !== this.v ||
      s.w !== this.barW ||
      s.h !== this.barH ||
      s.top !== this.top ||
      s.fallback !== this.fallback
    );
  }

  writeLabel() {
    this.labelDue = false;
    this.labelAge = 0;
    const text = this.pair ? `${this.value} / ${this.max}` : this.value;
    if (this.label.text === text && this.labelFitFor) return;
    const h = this.barH;
    const size = readoutSize(h);
    this.label.style.letterSpacing = size * READOUT_TYPE.track;
    this.label.text = text;
    const shape = `${text.length}:${this.barW}:${h}`;
    if (shape !== this.labelFitFor) {
      this.labelFitFor = shape;
      fitFont(this.label, this.barW * READOUT_TYPE.width, size, 4);
    }
    this.label.y = this.top + h / 2;
  }

  pairFits(w, h, max) {
    const size = readoutSize(h);
    this.label.style.letterSpacing = size * READOUT_TYPE.track;
    this.label.text = `${max} / ${max}`;
    return (
      fitFont(this.label, w * READOUT_TYPE.width, size, 1) >= READOUT_PAIR_MIN
    );
  }

  draw() {
    const w = this.barW;
    const h = this.barH;
    if (!w || !h) return;

    if (this.barsChanged()) this.drawBars(w, h);

    this.label.visible = this.reads;
    if (!this.reads) return;

    if (this.labelAge >= LABEL_HOLD) this.writeLabel();
    else this.labelDue = true;
  }

  drawBars(w, h) {
    this.shown = { v: this.v, w, h, top: this.top, fallback: this.fallback };

    const rim = h * BAR_RIM;
    const pad = this.trough ? 0 : Math.max(0.6, h * 0.2);
    const bore = h - pad * 2;
    const lit = Math.max((w - pad * 2) * this.v, Math.max(1, rim));

    if (this.trough) {
      this.trough.x = -w / 2;
      this.trough.y = this.top;
      this.trough.setSize(w, h);
    }

    if (this.paint) {
      this.paint.visible = this.v > 0.001;
      this.paint.x = -w / 2 + pad;
      this.paint.y = this.top + pad;
      this.paint.setSize(lit, bore);
    }

    if (this.trough && this.paint) return;

    const g = this.g;
    g.clear();
    if (!this.trough) {
      g.rect(-w / 2, this.top, w, h);
      g.fill({ color: 0x0b0716, alpha: 0.78 });
    }
    if (!this.paint && this.v > 0.001) {
      g.rect(-w / 2 + pad, this.top + pad, lit, bore);
      g.fill({ color: this.fallback });
      g.rect(-w / 2 + pad, this.top + pad, lit, bore * 0.5);
      g.fill({ color: 0xffffff, alpha: 0.26 });
    }
  }
}

export const READY_SCALE = 1.14;
export const READY_SWING = 0.045;

const READY_FX = {
  splash: { size: 2.05, y: -0.13, dur: 0.6, grow: 0.3 },
  rune: { from: 0.86, to: 2.45, dur: 0.5, alpha: 0.95 },
  wash: { w: 2.4, h: 1.75, alpha: 0.85, dur: 0.42 },
  pip: 0.42,
  word: { from: 1.5, dur: 0.44 },
};

const READY_GLOW = {
  crown: {
    licks: 5,
    h: 1.2,
    narrow: 0.62,
    spread: 0.94,
    root: 0.2,
    fps: 13,
    alpha: 0.6,
  },
  comet: {
    every: 2.1,
    dur: 0.66,
    rx: 0.5,
    ry: 0.7,
    head: 0.5,
    trail: 7,
    span: 0.22,
    alpha: 0.95,
  },
  core: { w: 1, h: 1, alpha: 0.16 },
  word: { alpha: 0.8, scale: 1.06, blur: 1.15, pad: 1.6 },
  breath: { rate: 5.6, depth: 0.22, phase: 0.85 },
  flicker: { rate: 14.7, depth: 0.07 },
  swell: 0.42,
  ignite: 1.85,
  ceiling: 1.3,
  type: { stroke: 0.13, blur: 0.55, pad: 1.05 },
};

class HeroCard extends Container {
  constructor(hero, index, opening = false) {
    super();
    this.hero = hero;
    this.index = index;
    this.ready = false;
    this.charge = opening
      ? DIFFICULTY.chargeStart
      : DIFFICULTY.partyChargeStart;

    this.chargeShown = this.charge;
    this.chargeDriver = { v: this.charge };

    this.hp = 1;
    this.hpShown = 1;
    this.hpDriver = { v: 1 };
    this.critical = false;
    this.downed = false;

    this.bg = new Graphics();
    this.addChild(this.bg);

    this.art = new Container();
    this.addChild(this.art);

    const plate = cardPlate(hero.element);
    this.plate = null;
    if (plate) {
      this.plate = new Sprite(plate.texture);
      this.plate.anchor.set(0.5);
      this.plate.tint = plate.tint;
      this.art.addChild(this.plate);
    }

    this.portraitArt = heroCardArt(index);
    this.portraitWindow = new Texture({
      source: this.portraitArt.source,
      frame: this.portraitArt.frame.clone(),
    });
    this.portrait = new Sprite(this.portraitWindow);
    this.portrait.anchor.set(0.5);
    this.art.addChild(this.portrait);

    this.footScrim = new Sprite(gradientTexture("cardFoot", FOOT_SCRIM));
    this.footScrim.anchor.set(0.5, 1);
    this.art.addChild(this.footScrim);

    this.aura = new Sprite(glowTexture());
    this.aura.anchor.set(0.5);
    this.aura.blendMode = "add";
    this.aura.tint = GEM_COLORS[hero.element];
    this.aura.alpha = 0;
    this.addChild(this.aura);

    this.burn = new Sprite(glowTexture());
    this.burn.anchor.set(0.5);
    this.burn.blendMode = "add";
    this.burn.tint = HURT_FLASH;
    this.burn.alpha = 0;
    this.addChild(this.burn);

    this.ultFx = new Container();
    this.addChild(this.ultFx);

    this.readyCrown = [];
    for (let i = 0; i < READY_GLOW.crown.licks; i++) {
      const lick = new Sprite();
      lick.anchor.set(0.5, 1);
      lick.blendMode = "add";
      lick.tint = lerpColor(
        GEM_COLORS[hero.element],
        GEM_LIGHT[hero.element],
        0.34,
      );
      lick.alpha = 0;
      this.addChild(lick);
      this.readyCrown.push(lick);
    }

    this.lickSize = this.readyCrown.map(
      (_, i) => 0.78 + 0.3 * (1 + Math.sin(i * 2.399 + index * 1.7)),
    );

    this.readyCore = new Sprite(glowTexture());
    this.readyCore.anchor.set(0.5);
    this.readyCore.blendMode = "add";
    this.readyCore.tint = GEM_LIGHT[hero.element];
    this.readyCore.alpha = 0;
    this.addChild(this.readyCore);

    this.readyLit = { v: 0 };

    this.ultArt = ultBorder(hero.element);
    this.ultBurstArt = ultBurst(hero.element);
    this.ultShown = this.ultArt || this.ultBurstArt;
    this.ultBorder = null;
    this.ultT = 0;
    this.ultRate = 1;
    this.ultGrow = 1;
    this.ultLit = false;
    this.ultFlaring = false;
    this.ultToken = 0;
    this.ultDriver = { v: 0 };
    if (this.ultShown) {
      this.ultBorder = new Sprite(this.ultShown.frames[0]);
      this.ultBorder.anchor.set(0.5);
      this.ultBorder.blendMode = "add";
      this.ultBorder.alpha = 0;
      this.ultBorder.visible = false;
      this.addChild(this.ultBorder);
    } else {
      this.ultSlot = this.children.length;
    }

    this.hpGauge = new Gauge(hpPaintTexture(false));
    this.addChild(this.hpGauge);

    this.manaGauge = new Gauge(manaPaintTexture());
    this.addChild(this.manaGauge);

    this.sigil = new Sprite(elementSigil(hero.element));
    this.sigil.anchor.set(0.5);
    this.addChild(this.sigil);

    this.label = new Text({
      text: hero.name,
      style: {
        fontFamily: FONT,
        fontSize: 20,
        fontWeight: "800",
        fill: 0xffffff,
        letterSpacing: 0.5,
        dropShadow: {
          color: 0x07040e,
          alpha: 0.85,
          blur: 4,
          distance: 0,
          angle: 0,
        },
      },
    });
    this.label.anchor.set(0.5);
    this.addChild(this.label);

    this.readyLabel = new Text({
      text: "READY",
      style: {
        fontFamily: FONT,
        fontSize: 18,
        fontWeight: "900",
        fill: GEM_LIGHT[hero.element],
        letterSpacing: 0.6,
        stroke: { color: GEM_DARK[hero.element], width: 2, join: "round" },
        dropShadow: {
          color: GEM_COLORS[hero.element],
          alpha: 1,
          blur: 13,
          distance: 0,
          angle: 0,
        },
        padding: 19,
      },
    });
    this.readyLabel.anchor.set(0.5);
    this.readyLabel.alpha = 0;
    this.addChild(this.readyLabel);

    this.readyBloom = new Text({
      text: "READY",
      style: {
        fontFamily: FONT,
        fontSize: 18,
        fontWeight: "900",
        fill: GEM_LIGHT[hero.element],
        letterSpacing: 0.6,
        dropShadow: {
          color: GEM_COLORS[hero.element],
          alpha: 1,
          blur: 21,
          distance: 0,
          angle: 0,
        },
        padding: 29,
      },
    });
    this.readyBloom.anchor.set(0.5);
    this.readyBloom.blendMode = "add";
    this.readyBloom.alpha = 0;
    this.addChild(this.readyBloom);

    this.cometTrail = [];
    for (let i = 0; i < READY_GLOW.comet.trail; i++) {
      const seg = new Sprite(beamTexture());
      seg.anchor.set(0.5);
      seg.blendMode = "add";
      seg.tint = GEM_LIGHT[hero.element];
      seg.alpha = 0;
      this.addChild(seg);
      this.cometTrail.push(seg);
    }

    this.cometHead = new Sprite(sparkTexture());
    this.cometHead.anchor.set(0.5);
    this.cometHead.blendMode = "add";
    this.cometHead.tint = GEM_LIGHT[hero.element];
    this.cometHead.alpha = 0;
    this.addChild(this.cometHead);

    this.eventMode = "static";
    this.cursor = "pointer";

    this.t = 0;
    this.pulseT = 0;
    this.readyFor = 0;
    this.beckonK = { v: 1 };

    this.ready = this.charge >= 1;
    if (this.ready) {
      this.readyLabel.alpha = 1;
      this.label.alpha = 0;
      this.readyLit.v = 1;
      this.pulsing = true;
      this.scale.set(READY_SCALE);
      if (this.ultBorder && this.ultArt) {
        this.ultLit = true;
        this.ultBorder.visible = true;
        this.ultBorder.alpha = ULT.alpha;
      }
    }
  }

  adoptUltArt() {
    if (this.ultBorder || this.ultSlot === undefined) return;

    const art = ultBorder(this.hero.element);
    const burst = ultBurst(this.hero.element);
    if (!art && !burst) return;

    this.ultArt = art;
    this.ultBurstArt = burst;
    this.ultShown = art || burst;

    this.ultBorder = new Sprite(this.ultShown.frames[0]);
    this.ultBorder.anchor.set(0.5);
    this.ultBorder.blendMode = "add";
    this.ultBorder.alpha = 0;
    this.ultBorder.visible = false;
    this.addChildAt(this.ultBorder, this.ultSlot);
    this.ultSlot = undefined;

    if (this.cardW) {
      fitUltBorder(
        this.ultBorder,
        this.ultShown,
        this.cardW,
        this.cardH,
        this.ultGrow,
      );
    }

    if (this.ready && !this.ultFlaring) this.lightUlt();
  }

  resize(w, h) {
    this.cardW = w;
    this.cardH = h;
    this.hitArea = new Rectangle(-w / 2, -h / 2, w, h);

    const el = this.hero.element;
    const clip = { x: -w / 2, y: -h / 2, w, h };

    this.bg.clear();
    this.bg.rect(-w / 2, -h / 2, w, h);
    this.bg.fill({ color: 0x120b1e });
    this.bg.rect(-w / 2, -h / 2, w, h * 0.55);
    this.bg.fill({ color: GEM_DARK[el], alpha: 0.45 });

    if (this.plate) this.plate.setSize(w, h);

    this.cropPortrait(w, h);

    const stack = readouts(w, h);
    const nameSize = Math.max(7, Math.min(h * 0.145, w * 0.2));
    const nameY = stack.hpY - stack.gap - nameSize * 0.5;
    this.footScrim.setSize(
      w,
      Math.min(h, Math.max(h * FOOT_BAND, h / 2 - nameY + nameSize * 0.8)),
    );
    this.footScrim.y = h / 2;

    this.aura.setSize(w * 1.9, h * 1.9);
    this.burn.setSize(w * 2.1, h * 2.1);

    if (this.ultBorder)
      fitUltBorder(this.ultBorder, this.ultShown, w, h, this.ultGrow);

    const sig = Math.max(
      SIGIL.min,
      Math.min(Math.min(w, h) * SIGIL.k, SIGIL.max),
    );
    this.sigil.setSize(sig, sig);

    const pad = Math.max(2.5, Math.min(w, h) * SIGIL.gap);
    this.sigil.x = clip.x + sig / 2 + pad;
    this.sigil.y = clip.y + sig / 2 + pad;

    const nameRoom = w * NAME_ROOM;
    fitFont(this.label, nameRoom, nameSize, NAME_FLOOR);
    clampWidth(this.label, nameRoom);
    this.label.y = nameY;

    const readySize = Math.max(7, Math.min(h * 0.16, w * 0.21));
    this.readyLabel.y = nameY;
    this.dressReady(fitFont(this.readyLabel, stack.barW, readySize));

    const { barW, hpH, manaH, manaReads, hpY, manaY } = stack;
    const pair = this.hpGauge.pairFits(barW, hpH, HERO_MAX_HP);
    this.hpGauge.pair = pair;
    this.manaGauge.pair = pair;
    this.manaGauge.reads = manaReads;

    this.hpGauge.place(hpY, barW, hpH);
    this.manaGauge.place(manaY, barW, manaH);

    this.drawHpBar();
    this.drawCharge();
  }

  dressReady(size) {
    const el = this.hero.element;
    const t = READY_GLOW.type;

    this.readyLabel.style.stroke = {
      color: GEM_DARK[el],
      width: Math.max(1, size * t.stroke),
      join: "round",
    };
    this.readyLabel.style.dropShadow = {
      color: GEM_COLORS[el],
      alpha: 1,
      blur: size * t.blur,
      distance: 0,
      angle: 0,
    };
    this.readyLabel.style.padding = size * t.pad;

    const word = READY_GLOW.word;
    this.readyBloom.style.fontSize = size;
    this.readyBloom.style.dropShadow = {
      color: GEM_COLORS[el],
      alpha: 1,
      blur: size * word.blur,
      distance: 0,
      angle: 0,
    };
    this.readyBloom.style.padding = size * word.pad;
    this.readyBloom.y = this.readyLabel.y;

    const wordW = this.readyLabel.width / (this.readyLabel.scale.x || 1);
    const wordH = this.readyLabel.height / (this.readyLabel.scale.y || 1);

    this.coreW = wordW * READY_GLOW.core.w;
    this.coreH = wordH * READY_GLOW.core.h;
    this.readyCore.setSize(this.coreW, this.coreH);
    this.readyCore.y = this.readyLabel.y;

    const crown = READY_GLOW.crown;
    this.lickH = wordH * crown.h;
    this.lickW = this.lickH * CROWN_CELL.aspect * crown.narrow;
    const foot = this.readyLabel.y - wordH * (0.5 - crown.root);
    const n = this.readyCrown.length;
    for (let i = 0; i < n; i++) {
      const lick = this.readyCrown[i];
      lick.x = (n === 1 ? 0 : i / (n - 1) - 0.5) * wordW * crown.spread;
      lick.y = foot;
    }

    const comet = READY_GLOW.comet;
    this.cometRx = wordW * comet.rx;
    this.cometRy = wordH * comet.ry;
    this.cometHeadSize = wordH * comet.head;
    this.cometTrailW = wordH * 0.19;
  }

  cropPortrait(w, h) {
    const art = this.portraitArt;
    const cover = Math.max(w / art.width, h / art.height);
    const aw = art.width * cover;
    const ah = art.height * cover;
    const shift = (ah - h) * HEAD_BIAS;
    const frame = this.portraitWindow.frame;
    frame.x = art.frame.x + (aw - w) / 2 / cover;
    frame.y = art.frame.y + ((ah - h) / 2 - shift) / cover;
    frame.width = w / cover;
    frame.height = h / cover;
    this.portraitWindow.update();
    this.portrait.setSize(w, h);
    this.portrait.x = 0;
    this.portrait.y = 0;
  }

  drawHpBar() {
    if (!this.cardW) return;
    const v = this.hpShown;
    const low = v <= HERO_CRITICAL;
    this.hpGauge.read(
      v,
      hpPaintTexture(low),
      Math.round(v * HERO_MAX_HP),
      HERO_MAX_HP,
      low ? HP_LOW : HP_GOOD,
    );
  }

  drawCharge() {
    if (!this.cardW) return;
    const v = this.chargeShown;
    this.manaGauge.read(
      v,
      manaPaintTexture(),
      Math.round(v * HERO_MAX_CHARGE),
      HERO_MAX_CHARGE,
      this.ready ? GEM_LIGHT[this.hero.element] : GEM_COLORS[this.hero.element],
    );
  }

  flareReady() {
    if (!this.cardW) return;

    this.washElement();
    this.throwRune();
    this.splashElement();

    punch(this.sigil, READY_FX.pip, 0.5, { base: this.sigil.scale.x });

    killTweensOf(this.readyLit);
    this.readyLit.v = READY_GLOW.ignite;
    tween(this.readyLit, { v: 1 }, 0.55, { ease: Ease.quadOut });

    killTweensOf(this.readyLabel.scale);
    this.readyLabel.scale.set(READY_FX.word.from);
    tween(this.readyLabel.scale, { x: 1, y: 1 }, READY_FX.word.dur, {
      ease: Ease.backOut,
    });
  }

  washElement() {
    const s = new Sprite(glowTexture());
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = GEM_LIGHT[this.hero.element];
    s.y = this.cardH * READY_FX.splash.y;
    this.ultFx.addChild(s);

    const { w, h, alpha, dur } = READY_FX.wash;
    tweenValue(0, 1, dur, (p) => {
      const k = 1 + p * 0.3;
      s.setSize(this.cardW * w * k, this.cardH * h * k);
      s.alpha = alpha * (1 - p) * (1 - p);
    }).then(() => s.destroy());
  }

  throwRune() {
    const tex = gemTexture(this.hero.element);
    if (!tex || !this.cardW) return false;

    const s = new Sprite(tex);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.y = this.cardH * READY_FX.splash.y;
    this.ultFx.addChild(s);

    const { from, to, dur, alpha } = READY_FX.rune;
    tweenValue(0, 1, dur, (p) => {
      const e = 1 - (1 - p) * (1 - p);
      const d = this.cardW * (from + (to - from) * e);
      s.setSize(d, d);
      s.alpha = alpha * (1 - p) * (1 - p);
    }).then(() => s.destroy());

    return true;
  }

  splashElement() {
    const frames = spellFrames(SPELL_BY_ELEMENT[this.hero.element]);
    if (!frames || !this.cardW) return false;
    const blast = frames.slice(SPELL_TRAVEL_LAST + 1);
    if (!blast.length) return false;

    const s = new Sprite(blast[0]);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.y = this.cardH * READY_FX.splash.y;
    this.ultFx.addChild(s);

    const size = this.cardW * READY_FX.splash.size;
    tweenValue(0, 1, READY_FX.splash.dur, (p) => {
      s.texture = blast[Math.min(blast.length - 1, (p * blast.length) | 0)];
      const d = size * (1 + p * READY_FX.splash.grow);
      s.setSize(d, d);
      s.alpha = p < 0.72 ? 1 : 1 - (p - 0.72) / 0.28;
    }).then(() => s.destroy());

    return true;
  }

  setReady(on) {
    this.ready = on;
    this.drawCharge();
    tween(this.readyLabel, { alpha: on ? 1 : 0 }, 0.2);
    tween(this.label, { alpha: on ? 0 : 1 }, 0.2);
    killTweensOf(this.readyLit);
    tween(this.readyLit, { v: on ? 1 : 0 }, on ? 0.22 : 0.2);
    if (on) {
      sfx.charged(this.hero.element);
      this.flareReady();
      this.lightUlt();
      tween(this.scale, { x: READY_SCALE, y: READY_SCALE }, 0.32, {
        ease: Ease.backOut,
      }).then(() => {
        this.pulseT = 0;
        this.pulsing = this.ready;
      });
    } else {
      this.pulsing = false;
      this.dimUlt();
      tween(this.scale, { x: 1, y: 1 }, 0.25);
    }
  }

  lightUlt() {
    const s = this.ultBorder;
    if (!s || !this.ultArt) return;
    this.ultToken++;
    killTweensOf(this.ultDriver);
    killTweensOf(s);
    this.ultFlaring = false;
    this.ultRate = 1;
    this.ultGrow = 1;
    this.ultLit = true;
    this.wearUlt(this.ultArt);
    s.visible = true;
    tween(s, { alpha: ULT.alpha }, ULT.in);
  }

  wearUlt(art) {
    this.ultShown = art;
    this.ultBorder.texture = art.frames[0];
    if (this.cardW)
      fitUltBorder(this.ultBorder, art, this.cardW, this.cardH, this.ultGrow);
  }

  dimUlt(dur) {
    const s = this.ultBorder;
    if (!s || this.ultFlaring) return;
    const id = ++this.ultToken;
    killTweensOf(s);
    tween(s, { alpha: 0 }, dur === undefined ? ULT.out : dur).then(() => {
      if (id !== this.ultToken) return;
      s.visible = false;
      this.ultLit = false;
    });
  }

  flareUlt() {
    const s = this.ultBorder;
    if (!s) return;
    const id = ++this.ultToken;
    killTweensOf(this.ultDriver);
    killTweensOf(s);
    this.ultFlaring = true;
    s.visible = true;
    s.alpha = 1;
    this.ultDriver.v = 0;
    this.ultGrow = 1;

    const burst = this.ultBurstArt;
    const beat = burst ? ULT.burst : ULT.flare;
    this.ultLit = !burst;
    if (burst) this.wearUlt(burst);

    tween(this.ultDriver, { v: 1 }, beat.dur, {
      ease: burst ? Ease.linear : Ease.quadOut,
      onUpdate: () => {
        const p = this.ultDriver.v;
        this.ultGrow = 1 + (beat.grow - 1) * p;
        if (burst) {
          s.texture = ultBurstTexture(burst, p);
          s.alpha = p < beat.tail ? 1 : 1 - (p - beat.tail) / (1 - beat.tail);
        } else {
          this.ultRate = beat.rate + (1 - beat.rate) * p;
          s.alpha = 1 - p;
        }
        if (this.cardW)
          fitUltBorder(s, this.ultShown, this.cardW, this.cardH, this.ultGrow);
      },
    }).then(() => {
      if (id !== this.ultToken) return;
      this.ultFlaring = false;
      this.ultLit = false;
      this.ultRate = 1;
      this.ultGrow = 1;
      s.visible = false;
      s.alpha = 0;
      if (this.ultArt) this.wearUlt(this.ultArt);
    });
  }

  flareLead() {
    return (this.ultBurstArt && this.ultBorder ? ULT.burst : ULT.flare).lead;
  }

  addCharge(amount) {
    if (this.ready || this.downed) return false;
    this.charge = Math.min(1, this.charge + amount);
    this.driveCharge(this.charge);
    if (this.charge < 1) return false;
    this.setReady(true);
    return true;
  }

  driveCharge(value, dur) {
    killTweensOf(this.chargeDriver);
    this.chargeDriver.v = this.chargeShown;
    return tween(
      this.chargeDriver,
      { v: value },
      dur === undefined ? 0.3 : dur,
      {
        ease: Ease.quadOut,
        onUpdate: () => {
          this.chargeShown = this.chargeDriver.v;
          this.drawCharge();
        },
      },
    );
  }

  chargeRate() {
    return this.hero.heal
      ? DIFFICULTY.chargePerGem
      : DIFFICULTY.partyChargePerGem;
  }

  strike(lead) {
    if (this.downed) return;
    sfx.heroStrike(this.hero.element, lead);

    killTweensOf(this.pivot);
    this.pivot.set(0, lead ? 16 : 9);
    tween(this.pivot, { x: 0, y: 0 }, lead ? 0.42 : 0.34, {
      ease: Ease.backOut,
    });

    if (!this.pulsing) {
      punch(this, lead ? 0.13 : 0.06, lead ? 0.42 : 0.32, { axis: "y" });
    }

    if (this.pulsing) return;
    killTweensOf(this.aura);
    this.aura.alpha = lead ? 0.95 : 0.55;
    tween(this.aura, { alpha: 0 }, lead ? 0.4 : 0.3);
  }

  async spend() {
    this.charge = 0;
    this.flareUlt();
    this.driveCharge(0, 0.5);
    this.setReady(false);
    await tween(this.scale, { x: 0.88, y: 0.88 }, 0.1);
    await tween(this.scale, { x: 1, y: 1 }, 0.22, { ease: Ease.backOut });
  }

  restTint() {
    return this.downed ? DOWN_TINT : 0xffffff;
  }

  lossFor(amount) {
    return Math.max(0, this.hp - Math.max(HERO_HP_FLOOR, this.hp - amount));
  }

  async setHp(value, dur, wait) {
    this.hp = value;
    this.critical = value <= HERO_CRITICAL && !this.downed;

    killTweensOf(this.hpDriver);
    this.hpDriver.v = this.hpShown;
    await tween(this.hpDriver, { v: value }, dur === undefined ? 0.4 : dur, {
      delay: wait || 0,
      ease: Ease.quadOut,
      onUpdate: () => {
        this.hpShown = this.hpDriver.v;
        this.drawHpBar();
      },
    });
    if (this.hp <= 0.001 && !this.downed) this.down();
  }

  async hurt(amount, wait) {
    if (this.downed) return;
    const to = Math.max(HERO_HP_FLOOR, this.hp - amount);
    const kick = this.index % 2 ? 1 : -1;

    if (wait) await delay(wait);
    sfx.heroHurt();

    const bite = Math.max(0.55, Math.min(1.8, amount / 0.12));

    killTweensOf(this.pivot);
    this.pivot.set(kick * 8 * bite, -9 * bite);
    tween(this.pivot, { x: 0, y: 0 }, 0.45, { ease: Ease.elasticOut });

    if (!this.pulsing) punch(this, 0.12 * bite, 0.46, { axis: "x" });

    this.burn.alpha = Math.min(1, 0.85 * bite);
    tween(this.burn, { alpha: 0 }, 0.4);
    tweenValue(0, 1, 0.34, (v) => {
      if (this.destroyed) return;
      this.tint = lerpColor(HURT_FLASH, this.restTint(), v);
    });

    await this.setHp(to, 0.42);
  }

  async heal(to, wait) {
    const target = Math.min(1, Math.max(this.hp, to));
    if (this.downed) this.revive();
    if (target <= this.hp) return;

    tweenValue(0, 1, 0.4, (v) => {
      if (this.destroyed) return;
      this.tint = lerpColor(GEM_LIGHT[this.hero.element], 0xffffff, v);
    });
    tween(this.scale, { x: 1.1, y: 1.1 }, 0.14, { delay: wait || 0 }).then(() =>
      tween(this.scale, { x: 1, y: 1 }, 0.28, { ease: Ease.backOut }),
    );
    await this.setHp(target, 0.5, wait);
  }

  down() {
    this.downed = true;
    sfx.heroDown();
    this.critical = false;
    this.pulsing = false;
    this.setReady(false);
    this.hpGauge.alpha = 1;

    const lean = this.index % 2 ? 1 : -1;
    killTweensOf(this.pivot);
    killTweensOf(this.scale);

    this.burn.alpha = 0.6;
    tween(this.burn, { alpha: 0 }, FALL.settle);

    this.pivot.set(0, -FALL.lurch * FALL.drop);
    tween(this.pivot, { x: lean * 3, y: FALL.drop }, FALL.settle, {
      ease: Ease.quadIn,
    });
    tween(
      this,
      { alpha: FALL.alpha, rotation: lean * FALL.slump },
      FALL.settle,
    );
    tween(this.scale, { x: FALL.shrink, y: FALL.shrink * 0.94 }, FALL.settle, {
      ease: Ease.quadOut,
    });
    tweenValue(0, 1, FALL.settle, (v) => {
      if (this.destroyed) return;
      this.tint = lerpColor(HURT_FLASH, DOWN_TINT, Ease.quadOut(v));
    });
  }

  revive() {
    if (!this.downed) return;
    this.downed = false;

    killTweensOf(this.pivot);
    killTweensOf(this.scale);

    tween(this, { alpha: 1, rotation: 0 }, RISE.back, { ease: Ease.backOut });
    tween(this.pivot, { x: 0, y: 0 }, RISE.back, { ease: Ease.backOut });
    tween(this.scale, { x: RISE.over, y: RISE.over }, RISE.up).then(() =>
      tween(this.scale, { x: 1, y: 1 }, RISE.back, { ease: Ease.backOut }),
    );
    tweenValue(0, 1, RISE.back + RISE.up, (v) => {
      if (this.destroyed) return;
      this.tint = lerpColor(RISE.flash, this.restTint(), Ease.quadOut(v));
    });
  }

  update(dt) {
    this.t += dt;
    this.hpGauge.tick(dt);
    this.manaGauge.tick(dt);

    if (this.ultLit && this.ultBorder && this.ultShown === this.ultArt) {
      this.ultT += dt;
      this.ultBorder.texture = ultLoopTexture(
        this.ultArt,
        this.ultT,
        this.ultRate,
      );
    }

    if (this.critical) {
      this.hpGauge.alpha = 0.55 + Math.abs(Math.sin(this.t * 5.5)) * 0.45;
    } else if (this.hpGauge.alpha !== 1) {
      this.hpGauge.alpha = 1;
    }

    this.lightReady();

    if (!this.pulsing) {
      this.readyFor = 0;
      return;
    }
    this.readyFor += dt;
    this.pulseT += dt;
    const beat = Math.sin(this.pulseT * 6.5);
    this.scale.set(READY_SCALE * (1 + beat * READY_SWING) * this.beckonK.v);
  }

  beckon(amount) {
    killTweensOf(this.beckonK);
    this.beckonK.v = 1 + amount;
    tween(this.beckonK, { v: 1 }, 0.42, { ease: Ease.elasticOut });
  }

  lightReady() {
    const lit = this.readyLit.v;
    if (!this.cardW || (lit <= 0 && this.readyCore.alpha === 0)) return;

    const g = READY_GLOW;
    const ph = this.index * g.breath.phase;
    const breath = 0.5 + 0.5 * Math.sin(this.t * g.breath.rate + ph);
    const flick = Math.sin(this.t * g.flicker.rate + ph * 1.7);
    const heat = Math.max(
      0,
      Math.min(
        g.ceiling,
        lit *
          (1 -
            g.breath.depth +
            g.breath.depth * breath +
            g.flicker.depth * flick),
      ),
    );

    this.readyCore.alpha = Math.min(1, g.core.alpha * heat);
    this.readyBloom.alpha = Math.min(1, g.word.alpha * heat);

    const swell = Math.min(1, 1 + (heat - 1) * g.swell);
    this.readyCore.setSize(this.coreW * swell, this.coreH * swell);

    const flame = this.crownArt();
    if (flame) {
      const c = g.crown;
      const n = flame.length;
      const count = this.readyCrown.length;
      for (let i = 0; i < count; i++) {
        const lick = this.readyCrown[i];
        const step = this.t * c.fps + (i * n) / count + ph * 2.3;
        lick.texture = flame[Math.floor(((step % n) + n) % n)];
        const k = this.lickSize[i] * swell;
        lick.setSize(this.lickW * k, this.lickH * k);
        if (i % 2) lick.scale.x = -lick.scale.x;
        lick.alpha = Math.min(1, c.alpha * heat);
      }
    }

    this.sweepComet(heat);

    this.readyBloom.scale.set(
      this.readyLabel.scale.x * g.word.scale,
      this.readyLabel.scale.y * g.word.scale,
    );
  }

  crownArt() {
    if (!this.crownFrames) {
      this.crownFrames = readyCrownFrames(this.hero.element);
    }
    return this.crownFrames;
  }

  sweepComet(heat) {
    const c = READY_GLOW.comet;
    const clock = this.t + this.index * 0.41;
    const p = (clock % c.every) / c.dur;

    if (p > 1) {
      if (this.cometHead.alpha !== 0) {
        this.cometHead.alpha = 0;
        for (const seg of this.cometTrail) seg.alpha = 0;
      }
      return;
    }

    const fade = Math.max(0, Math.min(1, p / 0.14, (1 - p) / 0.24));
    const lit = c.alpha * fade * heat;

    const head = Math.PI * (1 - 2 * p);
    const step = (c.span * 2 * Math.PI) / c.trail;
    const at = (a) => [
      Math.cos(a) * this.cometRx,
      this.readyLabel.y + Math.sin(a) * this.cometRy,
    ];

    const h = at(head);
    this.cometHead.position.set(h[0], h[1]);
    this.cometHead.setSize(this.cometHeadSize, this.cometHeadSize);
    this.cometHead.alpha = Math.min(1, lit);

    for (let k = 0; k < this.cometTrail.length; k++) {
      const a = at(head + k * step);
      const b = at(head + (k + 1) * step);
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const taper = 1 - k / this.cometTrail.length;
      const seg = this.cometTrail[k];
      seg.position.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
      seg.setSize(this.cometTrailW * taper, Math.hypot(dx, dy) * 1.25);
      seg.rotation = Math.atan2(dy, dx) + Math.PI / 2;
      seg.alpha = Math.min(1, lit * taper * taper);
    }
  }
}

function rollOpeningHero() {
  return DIFFICULTY.randomOpeningHero ? rndInt(HEROES.length) : HEALER;
}

export class HeroRow extends Container {
  constructor(onCardTap) {
    super();
    initPortraits();

    this.opening = rollOpeningHero();

    this.cards = HEROES.map((hero, i) => {
      const card = new HeroCard(hero, i, i === this.opening);
      card.on("pointertap", () => onCardTap(i, card));
      this.addChild(card);
      return card;
    });
  }

  resize(layout) {
    const { x, y, w, h, gap } = layout.cards;
    const q = 1 / getRenderer().resolution;
    const snap = (v) => Math.round(v / q) * q;
    const even = (v) => Math.max(q * 2, Math.floor(v / (q * 2)) * q * 2);

    const cardW = even((w - gap * (this.cards.length - 1)) / this.cards.length);
    const cardH = even(h);
    this.cards.forEach((card, i) => {
      card.resize(cardW, cardH);
      card.x = snap(x + cardW / 2 + i * (cardW + gap));
      card.y = snap(y + cardH / 2);
    });
  }

  update(dt) {
    this.cards.forEach((c) => c.update(dt));
  }

  leadCharged() {
    let pick = -1;
    this.cards.forEach((card, i) => {
      if (!card.ready || card.downed || !card.pulsing) return;
      if (pick === -1 || card.readyFor > this.cards[pick].readyFor) pick = i;
    });
    return pick;
  }

  adoptUltArt() {
    this.cards.forEach((c) => c.adoptUltArt());
  }

  resolveTargets(targets) {
    if (!targets || targets === "all") return this.cards.map((_, i) => i);
    if (targets === "lowest") {
      let pick = -1;
      this.cards.forEach((card, i) => {
        if (card.downed) return;
        if (pick === -1 || card.hp < this.cards[pick].hp) pick = i;
      });
      return pick === -1 ? [] : [pick];
    }
    return targets;
  }

  aliveCount() {
    return this.cards.reduce((n, card) => n + (card.downed ? 0 : 1), 0);
  }

  partyPower() {
    if (this.cards.length === 0) return 1;
    const total = this.cards.reduce(
      (sum, card) => sum + (card.downed ? DIFFICULTY.downedPenalty : 1),
      0,
    );
    return total / this.cards.length;
  }

  strikeOrder(leadElement) {
    const lead = [];
    const rest = [];
    this.cards.forEach((card, i) => {
      if (card.downed) return;
      if (card.hero.element === leadElement) lead.push(i);
      else rest.push(i);
    });
    return lead.concat(rest);
  }

  readyCards() {
    const out = [];
    this.cards.forEach((card, i) => {
      if (card.ready && !card.downed) out.push(i);
    });
    return out;
  }

  cardPoint(index) {
    const card = this.cards[index];
    return { x: card.x, y: card.y - (card.cardH || 0) * 0.5 };
  }

  async healAll(to) {
    sfx.heal();
    await Promise.all(this.cards.map((card, i) => card.heal(to, i * 0.06)));
  }

  async introIn(seconds) {
    const d = seconds === undefined ? 0.35 : seconds;
    await Promise.all(
      this.cards.map((card) => {
        card.alpha = 0;
        const home = card.y;
        card.y = home + 40;
        return Promise.all([
          tween(card, { alpha: 1 }, d, { ease: Ease.quadOut }),
          tween(card, { y: home }, d, { ease: Ease.backOut }),
        ]);
      }),
    );
  }
}
