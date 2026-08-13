/**
 * Hero cards.
 *
 * All five act. Every match is a volley the whole row fires — see `strike` and
 * HeroRow.strikeOrder — every card charges off its own colour, and every card
 * has an ultimate the player can spend. The four who used to be silhouettes
 * promising a roster are the roster.
 *
 * And they have faces now: the portrait is the painted bust from src/avatars —
 * see avatars.js — not the drawn cowl, which survives only as the stand-in for
 * a hero whose art is missing.
 */

import { Container, Graphics, Sprite, Text, Rectangle } from "pixi.js";
import {
  DIFFICULTY,
  GEM_COLORS,
  GEM_DARK,
  GEM_LIGHT,
  FONT,
  HEROES,
  HERO_CRITICAL,
  HERO_HP_FLOOR,
} from "../config.js";
import { drawGemShape } from "./gems.js";
import { cardPlate } from "./plates.js";
import { plaqueSprite, fitPlaque } from "./plaque.js";
import { heroBust, heroRoundel } from "./avatars.js";
import { glowTexture } from "./textures.js";
import { getRenderer } from "../core/context.js";
import { tween, tweenValue, delay, killTweensOf, Ease } from "../core/tween.js";
import { lerpColor } from "../core/color.js";
import { fitFont } from "../ui/text.js";

const ART = 128;

const HP_GOOD = 0x4ee27a;
const HP_LOW = 0xff3b2f;
/** Colour the card flashes through when it eats a hit. */
const HURT_FLASH = 0xff4a3a;
/** Rest tint of a hero who has been knocked out. */
const DOWN_TINT = 0x6a6270;

let portraitTextures = null;
let cardArtTextures = null;

/**
 * Bake the six portraits once — roundels for the cut-in and the end card, and
 * the full-bleed card art for the row.
 *
 * Painted busts where src/avatars has one — see avatars.js — and the drawn
 * hooded figure for whoever it does not, which is now nobody: all six elements
 * have art, so the cowl is only reached by a file that fails to decode. The
 * fallback is the same texture in both sets: it was authored to sit inside a
 * card, and there is no second framing of it to bake.
 */
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
  cardArtTextures = HEROES.map((hero, i) => heroBust(hero.element) || drawn[i]);

  return portraitTextures;
}

/**
 * The old hooded silhouette, still the stand-in for a hero with no bust.
 *
 * Kept whole rather than trimmed to the one element that needs it: a seventh
 * element, or a file that fails to decode, has to land on something.
 */
function drawnPortrait(hero) {
  const renderer = getRenderer();
  const el = hero.element;
  const g = new Graphics();

  g.rect(-ART / 2, -ART / 2, ART, ART);
  g.fill({ color: 0xffffff, alpha: 0 });

  // Element crest, high enough to read behind the cowl
  const crest = new Graphics();
  drawGemShape(crest, el);
  crest.scale.set(0.92);
  crest.y = -22;
  crest.alpha = 0.3;

  // Cloak
  g.moveTo(-58, 64);
  g.quadraticCurveTo(-48, -4, -20, -24);
  g.lineTo(20, -24);
  g.quadraticCurveTo(48, -4, 58, 64);
  g.closePath();
  g.fill({ color: GEM_DARK[el] });
  g.stroke({ width: 5, color: 0x0d0812, alpha: 0.9 });

  // Cloak shading on the left half
  g.moveTo(-58, 64);
  g.quadraticCurveTo(-42, 2, -16, -22);
  g.lineTo(-4, -24);
  g.lineTo(-10, 64);
  g.closePath();
  g.fill({ color: 0x000000, alpha: 0.24 });

  // Collar V
  g.moveTo(-30, 12);
  g.lineTo(0, 44);
  g.lineTo(30, 12);
  g.stroke({ width: 6, color: GEM_COLORS[el], alpha: 0.85 });

  // Chest emblem
  g.circle(0, 30, 13);
  g.fill({ color: 0x0b0713, alpha: 0.85 });
  g.circle(0, 30, 13);
  g.stroke({ width: 3.5, color: GEM_LIGHT[el], alpha: 0.9 });
  g.circle(0, 30, 5.5);
  g.fill({ color: GEM_LIGHT[el] });

  // Hood — pointed cowl rather than a round blob
  g.moveTo(-36, 10);
  g.quadraticCurveTo(-42, -48, -6, -68);
  g.lineTo(4, -70);
  g.quadraticCurveTo(42, -48, 36, 10);
  g.quadraticCurveTo(0, 26, -36, 10);
  g.closePath();
  g.fill({ color: GEM_COLORS[el] });
  g.stroke({ width: 5, color: 0x0d0812, alpha: 0.9 });

  // Hood rim highlight
  g.moveTo(-34, 2);
  g.quadraticCurveTo(-38, -44, -4, -62);
  g.stroke({ width: 5, color: GEM_LIGHT[el], alpha: 0.75 });

  // Face in shadow
  g.ellipse(0, -12, 23, 27);
  g.fill({ color: 0x0a060e, alpha: 0.97 });

  // Eye glow, then the eyes themselves
  g.ellipse(-10, -14, 11, 7);
  g.fill({ color: GEM_COLORS[el], alpha: 0.32 });
  g.ellipse(10, -14, 11, 7);
  g.fill({ color: GEM_COLORS[el], alpha: 0.32 });
  g.poly([-17, -17, -4, -14, -17, -9]);
  g.fill({ color: GEM_LIGHT[el] });
  g.poly([17, -17, 4, -14, 17, -9]);
  g.fill({ color: GEM_LIGHT[el] });

  // Shoulder trim
  g.moveTo(-54, 42);
  g.quadraticCurveTo(0, 22, 54, 42);
  g.stroke({ width: 6, color: GEM_LIGHT[el], alpha: 0.45 });

  const holder = new Container();
  holder.addChild(crest, g);
  const tex = renderer.generateTexture({
    target: holder,
    // Bakes big enough to stay sharp when the cut-in blows it up full screen.
    resolution: 3,
    antialias: true,
  });
  holder.destroy({ children: true });
  return tex;
}

/** Baked roundel for a hero index — shared by the cut-in and the end card. */
export function heroPortrait(index) {
  return initPortraits()[index];
}

/** The same hero's card art: the bust edge to edge, scrim and all. */
function heroCardArt(index) {
  initPortraits();
  return cardArtTextures[index];
}

export class HeroCard extends Container {
  constructor(hero, index) {
    super();
    this.hero = hero;
    this.index = index;
    this.ready = false;
    // Every bar is earned from its own colour now. The healer starts higher and
    // fills faster because she is the one racing the doom clock — see
    // DIFFICULTY.chargeStart against DIFFICULTY.partyChargeStart.
    this.charge = hero.heal
      ? DIFFICULTY.chargeStart
      : DIFFICULTY.partyChargeStart;

    /** Health, 0..1. Authored by the director, never simulated. */
    this.hp = 1;
    this.hpShown = 1;
    this.hpDriver = { v: 1 };
    this.critical = false;
    this.downed = false;

    this.bg = new Graphics();
    this.addChild(this.bg);

    /**
     * Painted plate, over the drawn background and under the art: the busts are
     * cut-outs, so the plate is what shows through wherever the hero does not
     * cover the tile. Null when the art failed to decode, which is why every
     * reference to it is guarded.
     */
    const plate = cardPlate(hero.element);
    this.plate = null;
    if (plate) {
      this.plate = new Sprite(plate.texture);
      this.plate.anchor.set(0.5);
      this.plate.tint = plate.tint;
      this.addChild(this.plate);
    }

    /**
     * The hero, edge to edge.
     *
     * Cover-fitted in resize() and clipped to the card's own corner radius, so
     * the art fills the tile rather than sitting in it: a portrait a third of
     * the card wide read as a placeholder next to the painted plate.
     */
    this.portrait = new Sprite(heroCardArt(index));
    this.portrait.anchor.set(0.5);
    this.artMask = new Graphics();
    this.portrait.mask = this.artMask;
    this.addChild(this.portrait, this.artMask);

    // Over the art, not under it: both are additive and have to wash across the
    // whole card, and the art now covers every pixel the plate used to.
    this.aura = new Sprite(glowTexture());
    this.aura.anchor.set(0.5);
    this.aura.blendMode = "add";
    this.aura.tint = GEM_COLORS[hero.element];
    this.aura.alpha = 0;
    this.addChild(this.aura);

    // Separate from `aura` on purpose: the ready pulse and the hurt flash can
    // overlap on Nyx, and one sprite driven by two owners flickers.
    this.burn = new Sprite(glowTexture());
    this.burn.anchor.set(0.5);
    this.burn.blendMode = "add";
    this.burn.tint = HURT_FLASH;
    this.burn.alpha = 0;
    this.addChild(this.burn);

    this.frame = new Graphics();
    this.addChild(this.frame);

    this.hpBar = new Graphics();
    this.addChild(this.hpBar);

    this.label = new Text({
      text: hero.name,
      style: {
        fontFamily: FONT,
        fontSize: 20,
        fontWeight: "800",
        fill: 0xffffff,
        letterSpacing: 0.5,
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
        // Bright on a dark card: the previous near-black was invisible.
        fill: GEM_LIGHT[hero.element],
        letterSpacing: 0.6,
        stroke: { color: 0x08111f, width: 3, join: "round" },
      },
    });
    this.readyLabel.anchor.set(0.5);
    this.readyLabel.alpha = 0;
    this.addChild(this.readyLabel);

    this.eventMode = "static";
    this.cursor = "pointer";

    this.t = 0;
    this.pulseT = 0;
  }

  resize(w, h) {
    this.cardW = w;
    this.cardH = h;
    this.hitArea = new Rectangle(-w / 2, -h / 2, w, h);

    const el = this.hero.element;
    const r = Math.min(w, h) * 0.18;

    this.bg.clear();
    this.bg.roundRect(-w / 2, -h / 2, w, h, r);
    this.bg.fill({ color: 0x120b1e });
    this.bg.roundRect(-w / 2, -h / 2, w, h * 0.55, r);
    this.bg.fill({ color: GEM_DARK[el], alpha: 0.45 });

    // The plate is baked at the card's own aspect, so this is a fit, not a
    // stretch — landscape cards run a few percent wider and wear it.
    if (this.plate) this.plate.setSize(w, h);

    // Cover, not fit: the bust is square and the card is not, so the long side
    // wins and the mask takes whatever runs past the short one.
    const cover = Math.max(w, h);
    this.portrait.setSize(cover, cover);
    this.portrait.y = 0;

    this.artMask.clear();
    this.artMask.roundRect(-w / 2, -h / 2, w, h, r);
    this.artMask.fill({ color: 0xffffff });

    this.aura.setSize(w * 1.9, h * 1.9);
    this.burn.setSize(w * 2.1, h * 2.1);

    fitFont(this.label, w * 0.92, Math.max(7, Math.min(h * 0.15, w * 0.2)));
    this.label.y = h * 0.34;

    const readySize = Math.max(7, Math.min(h * 0.16, w * 0.21));
    this.readyLabel.style.stroke = {
      color: 0x08111f,
      width: Math.max(2, readySize * 0.22),
      join: "round",
    };
    fitFont(this.readyLabel, w * 0.92, readySize);
    this.readyLabel.y = h * 0.34;

    this.drawFrame();
    this.drawHpBar();
  }

  /**
   * Health strip along the top edge of the card.
   *
   * Above the portrait rather than below it: the charge bar already owns the
   * bottom, and two bars stacked on the same edge read as one broken widget.
   */
  drawHpBar() {
    const w = this.cardW;
    const h = this.cardH;
    if (!w) return;

    const g = this.hpBar;
    const barH = Math.max(3, h * 0.07);
    const barW = w * 0.8;
    const y = -h / 2 + barH * 0.9;
    const v = this.hpShown;

    g.clear();
    g.roundRect(-barW / 2, y, barW, barH, barH / 2);
    g.fill({ color: 0x08040e, alpha: 0.9 });

    if (v > 0.001) {
      g.roundRect(-barW / 2, y, barW * v, barH, barH / 2);
      g.fill({ color: v <= HERO_CRITICAL ? HP_LOW : HP_GOOD });
      g.roundRect(-barW / 2, y, barW * v, barH * 0.45, barH / 2);
      g.fill({ color: 0xffffff, alpha: 0.35 });
    }

    g.roundRect(-barW / 2, y, barW, barH, barH / 2);
    g.stroke({ width: Math.max(1, barH * 0.24), color: 0x0d0812, alpha: 0.85 });
  }

  drawFrame() {
    const w = this.cardW;
    const h = this.cardH;
    const el = this.hero.element;
    const r = Math.min(w, h) * 0.18;
    const g = this.frame;

    g.clear();
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.stroke({
      width: this.ready ? Math.max(2.5, w * 0.055) : Math.max(1.5, w * 0.028),
      color: this.ready ? GEM_LIGHT[el] : 0x3a2a52,
      alpha: this.ready ? 1 : 0.9,
    });

    // Charge bar hugging the bottom edge
    const barH = Math.max(3, h * 0.06);
    const barW = w * 0.76;
    const barY = h / 2 - barH * 1.8;
    g.roundRect(-barW / 2, barY, barW, barH, barH / 2);
    g.fill({ color: 0x000000, alpha: 0.55 });
    const fill = this.ready ? 1 : this.charge;
    if (fill > 0) {
      g.roundRect(-barW / 2, barY, barW * fill, barH, barH / 2);
      g.fill({ color: this.ready ? GEM_LIGHT[el] : GEM_COLORS[el] });
    }
  }

  setReady(on) {
    this.ready = on;
    this.drawFrame();
    tween(this.readyLabel, { alpha: on ? 1 : 0 }, 0.2);
    tween(this.label, { alpha: on ? 0 : 1 }, 0.2);
    if (on) {
      this.aura.alpha = 0;
      tween(this.aura, { alpha: 0.55 }, 0.3);
      // Pop first, then hand the scale over to the idle pulse in update().
      tween(this.scale, { x: 1.14, y: 1.14 }, 0.32, {
        ease: Ease.backOut,
      }).then(() => {
        // Restart the phase so the pulse picks up exactly where the pop
        // landed instead of snapping to wherever the sine happens to be.
        this.pulseT = 0;
        this.pulsing = this.ready;
      });
    } else {
      this.pulsing = false;
      tween(this.aura, { alpha: 0 }, 0.3);
      tween(this.scale, { x: 1, y: 1 }, 0.25);
    }
  }

  /**
   * Feed the charge bar.
   * @returns {boolean} true on the frame it fills — the caller owns the callout
   *   that follows, and must not fire it again every time another gem lands.
   */
  addCharge(amount) {
    if (this.ready || this.downed) return false;
    this.charge = Math.min(1, this.charge + amount);
    this.drawFrame();
    if (this.charge < 1) return false;
    this.setReady(true);
    return true;
  }

  /** Charge this card earns per gem of its own colour. */
  chargeRate() {
    return this.hero.heal
      ? DIFFICULTY.chargePerGem
      : DIFFICULTY.partyChargePerGem;
  }

  /**
   * The card takes a swing.
   *
   * Lunges towards the boss and flares its element aura. The motion rides on
   * `pivot` — the same channel `hurt` uses — rather than `position`, so it
   * composes with the row layout, and rather than `scale`, which the ready
   * pulse in update() owns and would overwrite on the next frame.
   *
   * @param {boolean} lead true for the hero whose colour was actually matched
   */
  strike(lead) {
    if (this.downed) return;

    killTweensOf(this.pivot);
    this.pivot.set(0, lead ? 16 : 9);
    tween(this.pivot, { x: 0, y: 0 }, lead ? 0.42 : 0.34, {
      ease: Ease.backOut,
    });

    // A pulsing card is already glowing on its own schedule; a second owner on
    // the same alpha just makes it stutter.
    if (this.pulsing) return;
    killTweensOf(this.aura);
    this.aura.alpha = lead ? 0.95 : 0.55;
    tween(this.aura, { alpha: 0 }, lead ? 0.4 : 0.3);
  }

  /** Spent: drain the bar and drop back to a normal card. */
  async spend() {
    this.charge = 0;
    this.setReady(false);
    await tween(this.scale, { x: 0.88, y: 0.88 }, 0.1);
    await tween(this.scale, { x: 1, y: 1 }, 0.22, { ease: Ease.backOut });
  }

  /* ------------------------------------------------------------- health */

  /** Rest tint the hurt flash returns to. */
  restTint() {
    return this.downed ? DOWN_TINT : 0xffffff;
  }

  /**
   * How much a hit of `amount` actually takes off.
   *
   * The clamp lives here rather than in the director so the floating number
   * and the bar can never disagree about what the hit was worth.
   */
  lossFor(amount) {
    return Math.max(0, this.hp - Math.max(HERO_HP_FLOOR, this.hp - amount));
  }

  /** Drive the health bar to a value. */
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

  /**
   * Eat a hit: flinch, flash red, drain the bar.
   *
   * The flinch runs on `pivot` rather than `position` so it composes with the
   * ready pulse on `scale` and never fights the row layout.
   */
  async hurt(amount, wait) {
    if (this.downed) return;
    const to = Math.max(HERO_HP_FLOOR, this.hp - amount);
    const kick = this.index % 2 ? 1 : -1;

    if (wait) await delay(wait);

    killTweensOf(this.pivot);
    this.pivot.set(kick * 7, -5);
    tween(this.pivot, { x: 0, y: 0 }, 0.45, { ease: Ease.elasticOut });

    this.burn.alpha = 0.85;
    tween(this.burn, { alpha: 0 }, 0.4);
    tweenValue(0, 1, 0.34, (v) => {
      if (this.destroyed) return;
      this.tint = lerpColor(HURT_FLASH, this.restTint(), v);
    });

    await this.setHp(to, 0.42);
  }

  /** Nyx's tide, or any other pick-me-up: refill and shake off the burns. */
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

  /**
   * Knocked out. Unreachable with the shipped HERO_HP_FLOOR, and deliberately
   * kept working: drop that floor to 0 and the fight can actually be lost.
   */
  down() {
    this.downed = true;
    this.critical = false;
    this.pulsing = false;
    this.setReady(false);
    this.hpBar.alpha = 1;
    tween(this, { alpha: 0.55, rotation: 0.14 }, 0.3);
    tweenValue(0, 1, 0.3, (v) => {
      if (this.destroyed) return;
      this.tint = lerpColor(0xffffff, DOWN_TINT, v);
    });
  }

  revive() {
    if (!this.downed) return;
    this.downed = false;
    tween(this, { alpha: 1, rotation: 0 }, 0.3);
  }

  update(dt) {
    this.t += dt;

    // Blink the strip once a hero is in real trouble — on a card this small
    // the colour change alone is not enough to catch a thumb-height glance.
    if (this.critical) {
      this.hpBar.alpha = 0.55 + Math.abs(Math.sin(this.t * 5.5)) * 0.45;
    } else if (this.hpBar.alpha !== 1) {
      this.hpBar.alpha = 1;
    }

    if (!this.pulsing) return;
    this.pulseT += dt;
    const p = 1 + Math.sin(this.pulseT * 6.5) * 0.045;
    this.scale.set(1.14 * p);
    this.aura.alpha = 0.42 + Math.sin(this.pulseT * 6.5) * 0.18;
  }
}

export class HeroRow extends Container {
  constructor(onCardTap) {
    super();
    initPortraits();

    /**
     * The tray, added first so it sits under every card: the same plaque the
     * board is framed in — see art/plaque.js — at the aspect it was drawn at.
     * Null when its art failed to decode, in which case the row stands straight
     * on the arena the way it always did, which is why every reference to it is
     * guarded.
     */
    this.dock = plaqueSprite();
    if (this.dock) this.addChild(this.dock);

    this.cards = HEROES.map((hero, i) => {
      const card = new HeroCard(hero, i);
      card.on("pointertap", () => onCardTap(i, card));
      this.addChild(card);
      return card;
    });
  }

  resize(layout) {
    if (this.dock) fitPlaque(this.dock, layout.dock);

    const { x, y, w, h, gap } = layout.cards;
    const cardW = (w - gap * (this.cards.length - 1)) / this.cards.length;
    this.cards.forEach((card, i) => {
      card.resize(cardW, h);
      card.x = x + cardW / 2 + i * (cardW + gap);
      card.y = y + h / 2;
    });
  }

  update(dt) {
    this.cards.forEach((c) => c.update(dt));
  }

  /** "all", "lowest" or a list of indices -> the cards that eat the full hit. */
  resolveTargets(targets) {
    if (!targets || targets === "all") return this.cards.map((_, i) => i);
    if (targets === "lowest") {
      // Standing heroes only: a golem that keeps punching a body it already
      // dropped is wasting the turn that was supposed to scare the player.
      let pick = -1;
      this.cards.forEach((card, i) => {
        if (card.downed) return;
        if (pick === -1 || card.hp < this.cards[pick].hp) pick = i;
      });
      return pick === -1 ? [] : [pick];
    }
    return targets;
  }

  /** Heroes still standing. Zero of them is the losing condition. */
  aliveCount() {
    return this.cards.reduce((n, card) => n + (card.downed ? 0 : 1), 0);
  }

  /**
   * How much of its damage the party is still landing.
   *
   * This replaces the old per-element lookup, and it had to: when only the
   * matched colour's owner swung, only that hero's death mattered to that
   * match. Now the whole row fires at everything, so the backing is the row's
   * average and every hero lost takes a fifth of the gap between 1 and
   * DIFFICULTY.downedPenalty off every match that follows.
   *
   * Across a run this lands where the old version did — a party one hero down
   * was already losing the penalty on one match in five — but it no longer
   * depends on which colour happens to come up.
   */
  partyPower() {
    if (this.cards.length === 0) return 1;
    const total = this.cards.reduce(
      (sum, card) => sum + (card.downed ? DIFFICULTY.downedPenalty : 1),
      0,
    );
    return total / this.cards.length;
  }

  /**
   * Who fires this volley, and in what order.
   *
   * The hero whose colour the player actually matched leads; everyone else
   * still standing follows in row order. The dead do not fire.
   */
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

  /** Indices of heroes charged and standing — anyone the player could spend. */
  readyCards() {
    const out = [];
    this.cards.forEach((card, i) => {
      if (card.ready && !card.downed) out.push(i);
    });
    return out;
  }

  /** Point on a card the damage number should fly out of. */
  cardPoint(index) {
    const card = this.cards[index];
    return { x: card.x, y: card.y - (card.cardH || 0) * 0.5 };
  }

  /** Whole party back on its feet — the payoff of Nyx's ultimate. */
  async healAll(to) {
    await Promise.all(this.cards.map((card, i) => card.heal(to, i * 0.06)));
  }

  async introIn() {
    // The tray arrives first and on its own, so the cards drop into something
    // rather than materialising alongside it.
    if (this.dock) {
      this.dock.alpha = 0;
      tween(this.dock, { alpha: 1 }, 0.28);
    }
    await Promise.all(
      this.cards.map((card, i) => {
        card.alpha = 0;
        const home = card.y;
        card.y = home + 40;
        return Promise.all([
          tween(card, { alpha: 1 }, 0.25, { delay: i * 0.05 }),
          tween(card, { y: home }, 0.35, {
            delay: i * 0.05,
            ease: Ease.backOut,
          }),
        ]);
      }),
    );
  }
}
