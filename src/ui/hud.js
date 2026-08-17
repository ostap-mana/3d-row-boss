/**
 * Heads-up display: boss health, callouts, damage numbers, install banner.
 *
 * The health bar deliberately carries no numbers — nobody reads
 * "7,500,000 / 10,000,000" in a twenty second creative (spec §7).
 */

import { Container, Graphics, Sprite, Text, Rectangle, Texture } from "pixi.js";
import { BOSS_NAME, COPY, DOOM, FONT } from "../config.js";
import { tween, delay, Ease, killTweensOf } from "../core/tween.js";
import { hpBarShape, hpBarPaint } from "../art/hpbar.js";
import {
  BANNER_BAR_H,
  BANNER_FILL,
  BANNER_LABEL,
  BANNER_LABEL_FILL,
  BANNER_LABEL_STROKE,
  BANNER_RIM,
  bannerHeight,
  ctaBannerSprite,
  fitCtaBanner,
} from "../art/ctabanner.js";
import { fitFont } from "./text.js";
import * as sfx from "../audio/sfx.js";

/**
 * Colours of the four layers the bar is stacked out of.
 *
 * The track used to be 0x2a1020, which over a lava arena at dusk was the arena:
 * the empty half of the gauge did not read at all, so a hit that took a fifth of
 * the boss looked like it took nothing. It has to be dark enough to read as
 * empty and light enough to read as bar.
 */
const BAR_EDGE = 0x0a0510;
const BAR_TRACK = 0x5c3346;
const BAR_CHIP = 0xffe9c9;
const BAR_HOT = 0xff6a10;
const BAR_LOW = 0xff3b1f;

/**
 * Tints the painted fill wears. It arrives red, so the danger state can only
 * deepen it — a tint multiplies, and no tint turns red into orange. The length
 * of the bar is the real signal; this is the second one.
 */
const PAINT_FULL = 0xffffff;
const PAINT_LOW = 0xff8a72;

/**
 * How the white behind the red is timed, as fractions of the hit's own duration.
 *
 * The point of that strip of white is to say how much the hit was worth, and it
 * can only say it while it is open. The red lands at 0.55 of the hit, so the
 * white waits past that before it starts to move at all, and then takes its
 * time. Both are relative to `dur` rather than absolute, which keeps the total
 * where it was — the director awaits setHp, and a slower drain here would push
 * every beat of the storyboard back.
 */
const CHIP_HOLD = 0.75;
const CHIP_DRAIN = 0.7;

/** 2150000 -> "2,150,000" without leaning on locale support. */
export function comma(n) {
  const s = String(Math.max(0, Math.round(n)));
  let out = "";
  for (let i = 0; i < s.length; i++) {
    if (i > 0 && (s.length - i) % 3 === 0) out += ",";
    out += s[i];
  }
  return out;
}

export class Hud extends Container {
  constructor(onInstall) {
    super();
    this.onInstall = onInstall;

    /**
     * The bar, in layers, all four of them the same chevron stamp under a
     * different tint — see art/hpbar.js. `bar` is the fallback underneath:
     * without the art it draws the rounded bar the HUD always drew.
     *
     * The two draining layers are cropped by texture frame rather than scaled,
     * so the mitre on the left cap holds its angle while the leading edge stays
     * a clean vertical cut.
     */
    this.bar = new Graphics();
    this.addChild(this.bar);

    this.barEdge = this.addBarLayer(BAR_EDGE, 0.85);
    this.barTrack = this.addBarLayer(BAR_TRACK, 1);
    this.barChip = this.addBarLayer(BAR_CHIP, 0.55);
    this.barFill = this.addBarLayer(BAR_HOT, 1);
    this.barShape = null;

    this.name = new Text({
      text: BOSS_NAME,
      style: {
        fontFamily: FONT,
        fontSize: 16,
        fontWeight: "800",
        fill: 0xffd9a8,
        letterSpacing: 2.4,
      },
    });
    this.name.anchor.set(0, 1);
    this.addChild(this.name);

    /* The doom clock: how long the party has before the cataclysm lands. */
    this.doomBar = new Graphics();
    this.addChild(this.doomBar);

    this.doomLabel = new Text({
      text: COPY.doomLabel + " --",
      style: {
        fontFamily: FONT,
        fontSize: 13,
        fontWeight: "900",
        fill: 0xffb060,
        letterSpacing: 1.6,
      },
    });
    // Right-aligned on the boss name's baseline: the only piece of empty chrome
    // up here, and it keeps the clock out of the INSTALL banner's corner.
    this.doomLabel.anchor.set(1, 1);
    this.doomLabel.alpha = 0;
    this.addChild(this.doomLabel);

    this.doomLeft = 0;
    this.doomTotal = DOOM.seconds;
    this.doomOn = false;

    /* Persistent CTA — the second of the three install surfaces. */
    this.banner = new Container();
    this.banner.alpha = 0;
    this.banner.visible = false;
    // The painted gem banner — see art/ctabanner.js. It holds one aspect, so
    // resize() asks it for a width and lets it name its own height; the end
    // card's CTA keeps the nine-sliced gold plate, which is the only one of the
    // two that can survive being pulled to 9:1 on a phone held sideways.
    this.bannerBg = new Graphics();
    this.banner.addChild(this.bannerBg);
    this.bannerArt = ctaBannerSprite();
    if (this.bannerArt) this.banner.addChild(this.bannerArt);

    this.bannerText = new Text({
      text: COPY.banner,
      style: {
        fontFamily: FONT,
        fontSize: 15,
        fontWeight: "900",
        fill: BANNER_LABEL_FILL,
        letterSpacing: 1.2,
        stroke: { color: BANNER_LABEL_STROKE, width: 3, join: "round" },
      },
    });
    this.bannerText.anchor.set(0.5);
    this.banner.addChild(this.bannerText);
    this.banner.eventMode = "static";
    this.banner.cursor = "pointer";
    this.banner.on("pointertap", () => this.onInstall("banner"));
    this.addChild(this.banner);

    /* Big centre-screen callouts: MATCH TO ATTACK, COMBO x3, VICTORY. */
    this.callout = new Text({
      text: "",
      style: {
        fontFamily: FONT,
        fontSize: 34,
        fontWeight: "900",
        fill: 0xffffff,
        letterSpacing: 2,
        stroke: { color: 0x180a1e, width: 6, join: "round" },
        align: "center",
      },
    });
    this.callout.anchor.set(0.5);
    this.callout.alpha = 0;
    this.addChild(this.callout);

    this.numbers = new Container();
    this.addChild(this.numbers);

    this.hp = 1;
    this.hpShown = 1;
    this.hpChip = 1;
    // Persistent tween holders: a second setHp() must cancel the first one
    // rather than have two tweens writing the same bar every frame.
    this.barDriver = { v: 1 };
    this.chipDriver = { v: 1 };
    this.shoutToken = 0;
    this.t = 0;
    this.layout = null;
  }

  /** One tinted layer of the bar, top-left anchored so a crop grows rightwards. */
  addBarLayer(tint, alpha) {
    const s = new Sprite(Texture.EMPTY);
    s.anchor.set(0, 0);
    s.tint = tint;
    s.alpha = alpha;
    s.visible = false;
    this.addChild(s);
    return s;
  }

  resize(layout) {
    this.layout = layout;
    const { x, y, w, h } = layout.hud;
    const ui = layout.ui;
    // Set up front rather than just before the bake: the banner is placed off
    // the doom strip, and doomRect() is measured from this.
    this.barRect = { x, y, w, h };

    this.name.style.fontSize = Math.max(9, 11 * ui);
    this.name.x = x;
    this.name.y = y - 3 * ui;

    this.callout.style.stroke = {
      color: 0x180a1e,
      width: Math.max(3, 5 * ui),
      join: "round",
    };

    if (layout.portrait) {
      // Sits in the gap between the boss and the board.
      this.calloutWidth = layout.w * 0.94;
      this.calloutSize = Math.max(18, Math.min(layout.w * 0.085, 40 * ui));
      this.callout.x = layout.w / 2;
      this.callout.y = layout.board.y - layout.board.cell * 0.55;
    } else {
      // Landscape has no gap, so the callout lives over the boss column —
      // centring it on screen would put it straight through the health bar.
      this.calloutWidth = layout.board.x * 0.92;
      this.calloutSize = Math.max(16, Math.min(layout.board.x * 0.17, 34 * ui));
      this.callout.x = layout.boss.x;
      this.callout.y = layout.boss.floor - layout.h * 0.13;
    }
    this.callout.style.fontSize = this.calloutSize;

    /**
     * The banner is asked for a width and gives back the height that goes with
     * it — the art holds one aspect (see art/ctabanner.js) and this is where
     * that is honoured.
     *
     * 124 is not arbitrary. The label only gets the flat middle of the gem,
     * which is 0.53 of the art's height, and this is the width at which that
     * band comes out at the 14pt the old drawn pill set its label at. Narrower
     * and the word shrinks with it; there is no slack to take.
     */
    const bw = Math.max(100, 124 * ui);
    const bh = bannerHeight(bw);
    const labelW = bw * BANNER_LABEL.w;
    const labelH = bh * BANNER_LABEL.h;
    // Set before fitting, not after: the rim is part of what the word measures.
    this.bannerText.style.stroke = {
      color: BANNER_LABEL_STROKE,
      width: Math.max(2, labelH * 0.16),
      join: "round",
    };
    fitFont(this.bannerText, labelW, Math.min(labelH * 0.78, 15 * ui));

    this.bannerBg.clear();
    if (this.bannerArt) {
      fitCtaBanner(this.bannerArt, bw);
    } else {
      // Stand-in for a bitmap that never decoded, in the banner's own colours.
      // It draws the bar alone — the finials and the two stars are silhouette,
      // and a plain rectangle out to their reach is not the shape of anything.
      const barH = bh * BANNER_BAR_H;
      this.bannerBg.roundRect(-bw / 2, -barH / 2, bw, barH, barH * 0.26);
      this.bannerBg.fill({ color: BANNER_FILL });
      this.bannerBg.stroke({
        width: Math.max(2, barH * 0.1),
        color: BANNER_RIM,
      });
    }
    // A few pixels of slack around the plate: it is a small target that slides
    // into place, and a near miss on a CTA is a lost install.
    const slack = 7 * ui;
    this.banner.hitArea = new Rectangle(
      -bw / 2 - slack,
      -bh / 2 - slack,
      bw + slack * 2,
      bh + slack * 2,
    );
    // Hung off the bottom of the doom strip rather than off the health bar. The
    // strip runs the full width of the HUD, so it passes under this corner, and
    // the banner breathes at 1.045 in update() — the star on its top edge is
    // what would touch first, so the clearance is measured against that.
    const doom = this.doomRect();
    this.banner.x = layout.w - bw / 2 - 12 * ui;
    this.banner.y = doom.y + doom.h + 3 * ui + (bh / 2) * 1.045;

    this.doomLabel.style.fontSize = Math.max(9, 11 * ui);
    this.doomLabel.x = x + w;
    this.doomLabel.y = y - 3 * ui;

    this.bakeBar();
    this.drawBar();
    this.drawDoom();
  }

  /**
   * Rebake the chevron at the size the layout just handed us.
   *
   * Every layer is the same canvas, but the chip and the fill get a Texture each
   * over it: they crop themselves every frame and a frame belongs to a Texture,
   * not to the source it reads from.
   */
  bakeBar() {
    const { x, y, w, h } = this.barRect;
    this.disposeBar();

    // The edge is the same silhouette a couple of pixels proud of the bar on
    // every side, which is how the shape gets an outline that follows its mitre.
    const grow = Math.max(2, h * 0.16);
    const edge = hpBarShape(w + grow * 2, h + grow * 2);
    const shape = hpBarShape(w, h);
    const fill = hpBarPaint(w, h, "fill");
    const chip = hpBarPaint(w, h, "chip");
    this.barShape = shape && edge && fill && chip ? shape : null;

    const layers = [this.barEdge, this.barTrack, this.barChip, this.barFill];
    if (!this.barShape) {
      layers.forEach((s) => {
        s.visible = false;
      });
      return;
    }
    this.barBakes = [edge.texture, shape.texture, fill.texture, chip.texture];
    this.barPainted = fill.painted;
    // The painted chip brings its own warm white, so it needs neither the tint
    // that stood in for it nor the alpha that kept that tint from shouting.
    this.barChip.tint = chip.painted ? PAINT_FULL : BAR_CHIP;
    this.barChip.alpha = chip.painted ? 1 : 0.55;
    layers.forEach((s) => {
      s.visible = true;
    });

    this.barEdge.texture = edge.texture;
    this.barEdge.setSize(w + grow * 2, h + grow * 2);
    this.barEdge.x = x - grow;
    this.barEdge.y = y - grow;

    this.barTrack.texture = shape.texture;
    this.barTrack.setSize(w, h);
    this.barTrack.x = x;
    this.barTrack.y = y;

    // Both draining layers crop themselves, so each needs a Texture of its own
    // over its own bake.
    [
      [this.barChip, chip],
      [this.barFill, fill],
    ].forEach(([s, art]) => {
      s.texture = new Texture({
        source: art.texture.source,
        frame: new Rectangle(0, 0, art.pw, art.ph),
      });
      s.x = x;
      s.y = y;
    });
  }

  /** Drop the previous bake. Rotation can call bakeBar() any number of times. */
  disposeBar() {
    // The cropping textures first: they read a source the bakes own.
    [this.barChip, this.barFill].forEach((s) => {
      if (s.texture && s.texture !== Texture.EMPTY) s.texture.destroy(false);
      s.texture = Texture.EMPTY;
    });
    this.barEdge.texture = Texture.EMPTY;
    this.barTrack.texture = Texture.EMPTY;
    (this.barBakes || []).forEach((t) => t.destroy(true));
    this.barBakes = [];
  }

  /** Show `frac` of a draining layer: crop the frame, then match the size. */
  cropBar(sprite, frac) {
    const { w, h } = this.barRect;
    const f = Math.max(0, Math.min(1, frac));
    sprite.visible = f > 0.001;
    if (!sprite.visible) return;

    const tex = sprite.texture;
    tex.frame.width = Math.max(1, Math.round(this.barShape.pw * f));
    tex.frame.height = this.barShape.ph;
    tex.updateUvs();
    sprite.setSize(w * f, h);
  }

  /**
   * Thin strip under the health bar that drains as the cataclysm charges.
   *
   * Deliberately the same width and corner as the boss bar: the two of them
   * together read as one gauge with two directions — his health going down,
   * his patience running out.
   */
  /**
   * Where the doom strip sits, drawn or not.
   *
   * Two callers: the draw below, and the banner, which shares this corner of
   * the screen and has to clear the strip whether the clock is running yet or
   * not. One formula, so the two cannot drift apart.
   */
  doomRect() {
    const { x, y, w, h } = this.barRect;
    const ui = this.layout ? this.layout.ui : 1;
    return { x, y: y + h + 3 * ui, w, h: Math.max(3, h * 0.32) };
  }

  drawDoom() {
    if (!this.barRect) return;
    const g = this.doomBar;
    const { x, y, w, h } = this.doomRect();
    const r = h / 2;

    g.clear();
    if (!this.doomOn) return;

    g.roundRect(x, y, w, h, r);
    g.fill({ color: 0x1c0a12, alpha: 0.9 });

    const left = Math.max(0, Math.min(1, this.doomLeft / this.doomTotal));
    if (left > 0.001) {
      g.roundRect(x, y, w * left, h, r);
      g.fill({ color: this.doomPanic() ? 0xff2f1a : 0xffa030 });
    }
  }

  doomPanic() {
    return this.doomOn && this.doomLeft <= DOOM.panicAt;
  }

  /**
   * Drive the clock. Called every frame by the director, which owns the count —
   * the HUD only ever renders what it is told, so a paused fight cannot leave
   * the numbers ticking on their own.
   */
  setDoom(left, total) {
    const wasOn = this.doomOn;
    this.doomOn = true;
    this.doomLeft = Math.max(0, left);
    this.doomTotal = total || DOOM.seconds;

    const text = COPY.doomLabel + " " + Math.ceil(this.doomLeft);
    if (this.doomLabel.text !== text) {
      this.doomLabel.text = text;
      this.doomLabel.style.fill = this.doomPanic() ? 0xff5a3a : 0xffb060;
    }
    if (this.doomLabel.alpha < 1) tween(this.doomLabel, { alpha: 1 }, 0.3);

    // Called every frame, so the bar is only rebuilt when a pixel of it would
    // actually move. A Graphics redraw per frame is the one thing the phones
    // this creative targets cannot afford.
    const step = Math.round((this.doomLeft / this.doomTotal) * 200);
    if (!wasOn || step !== this.doomStep) {
      this.doomStep = step;
      this.drawDoom();
    }
  }

  hideDoom() {
    this.doomOn = false;
    this.doomLabel.alpha = 0;
    this.doomLabel.scale.set(1);
    this.drawDoom();
  }

  drawBar() {
    if (!this.barRect) return;
    const { x, y, w, h } = this.barRect;
    const g = this.bar;
    const r = h / 2;

    if (this.barShape) {
      g.clear();
      this.cropBar(this.barChip, this.hpChip);
      this.cropBar(this.barFill, this.hpShown);
      const low = this.hpShown < 0.3;
      this.barFill.tint = this.barPainted
        ? low
          ? PAINT_LOW
          : PAINT_FULL
        : low
          ? BAR_LOW
          : BAR_HOT;
      return;
    }

    g.clear();
    g.roundRect(x - 2, y - 2, w + 4, h + 4, r + 2);
    g.fill({ color: BAR_EDGE, alpha: 0.85 });

    g.roundRect(x, y, w, h, r);
    g.fill({ color: BAR_TRACK });

    // Chip bar: the white ghost that drains a beat after the real one.
    if (this.hpChip > 0.001) {
      g.roundRect(x, y, w * this.hpChip, h, r);
      g.fill({ color: BAR_CHIP, alpha: 0.55 });
    }

    if (this.hpShown > 0.001) {
      g.roundRect(x, y, w * this.hpShown, h, r);
      g.fill({ color: this.hpShown < 0.3 ? BAR_LOW : BAR_HOT });
      g.roundRect(x, y, w * this.hpShown, h * 0.42, r);
      g.fill({ color: 0xffb257, alpha: 0.55 });
    }

    g.roundRect(x - 2, y - 2, w + 4, h + 4, r + 2);
    g.stroke({ width: Math.max(1.5, h * 0.14), color: 0x6b3a2a, alpha: 0.9 });
  }

  /** Drive the bar to a scripted health value. */
  async setHp(value, dur) {
    const d = dur === undefined ? 0.45 : dur;
    this.hp = value;

    killTweensOf(this.barDriver);
    killTweensOf(this.chipDriver);
    this.barDriver.v = this.hpShown;
    this.chipDriver.v = this.hpChip;

    tween(this.barDriver, { v: value }, d * 0.55, {
      ease: Ease.quadOut,
      onUpdate: () => {
        this.hpShown = this.barDriver.v;
        this.drawBar();
      },
    });
    await tween(this.chipDriver, { v: value }, d * CHIP_DRAIN, {
      delay: d * CHIP_HOLD,
      ease: Ease.quadOut,
      onUpdate: () => {
        this.hpChip = this.chipDriver.v;
        this.drawBar();
      },
    });
  }

  /**
   * Centre-screen shout. Resolves once it has faded out again.
   *
   * Token-guarded: the boss counterattack lands close behind the lava callout,
   * and without this the older shout's fade-out would erase the newer one.
   */
  async shout(text, hold, opts) {
    const o = opts || {};
    const token = ++this.shoutToken;
    killTweensOf(this.callout);
    killTweensOf(this.callout.scale);
    this.callout.text = text;
    this.callout.style.fill = o.fill || 0xffffff;
    this.callout.alpha = 0;
    fitFont(this.callout, this.calloutWidth || 320, this.calloutSize || 28);
    // Modest overshoot: a long headline popping in at 1.6x spills off a 375pt
    // screen for a couple of frames.
    this.callout.scale.set(o.from || 1.25);
    await Promise.all([
      tween(this.callout, { alpha: 1 }, 0.14),
      tween(this.callout.scale, { x: 1, y: 1 }, 0.28, { ease: Ease.backOut }),
    ]);
    if (token !== this.shoutToken) return;
    await delay(hold === undefined ? 0.6 : hold);
    if (token !== this.shoutToken) return;
    await Promise.all([
      tween(this.callout, { alpha: 0 }, 0.22),
      tween(this.callout.scale, { x: 1.18, y: 1.18 }, 0.22),
    ]);
  }

  hideShout() {
    this.shoutToken++;
    killTweensOf(this.callout);
    tween(this.callout, { alpha: 0 }, 0.15);
  }

  /**
   * Damage number flying off whatever just got hit.
   * @param {object} [opts] `sign` and `fill` — hero damage comes through here
   *   as a red "-N" so the two directions of damage never read the same.
   */
  damage(value, x, y, tier, opts) {
    const o = opts || {};
    const size = Math.max(
      13,
      (tier === 2 ? 30 : tier === 1 ? 24 : 19) *
        (this.layout ? this.layout.ui : 1),
    );
    const label = new Text({
      text: (o.sign || "+") + comma(value),
      style: {
        fontFamily: FONT,
        fontSize: size,
        fontWeight: "900",
        fill: o.fill || (tier === 2 ? 0xffe066 : 0xffffff),
        letterSpacing: 0.5,
        stroke: {
          color: 0x2b0a12,
          width: Math.max(3, size * 0.18),
          join: "round",
        },
      },
    });
    label.anchor.set(0.5);
    label.x = x;
    label.y = y;
    // Numbers over the outer hero cards start half off screen otherwise.
    if (this.layout) {
      const half = label.width / 2 + 4;
      label.x = Math.min(Math.max(x, half), this.layout.w - half);
    }
    label.scale.set(0.4);
    this.numbers.addChild(label);

    tween(label.scale, { x: 1, y: 1 }, 0.22, { ease: Ease.backOut });
    tween(label, { alpha: 0 }, 0.3, { delay: 0.5 });
    // Destroy on the longest tween, never before one that is still writing.
    tween(label, { y: y - 70 - Math.random() * 30 }, 0.85, {
      ease: Ease.quadOut,
    }).then(() => label.destroy());
  }

  showBanner() {
    if (this.banner.visible) return;
    this.banner.visible = true;
    sfx.banner();
    const home = this.banner.y;
    this.banner.y = home - 30;
    tween(this.banner, { alpha: 1 }, 0.3);
    tween(this.banner, { y: home }, 0.45, { ease: Ease.backOut });
  }

  update(dt) {
    this.t += dt;
    if (this.banner.visible) {
      const p = 1 + Math.sin(this.t * 4.2) * 0.045;
      this.banner.scale.set(p);
    }
    // The clock only twitches inside the panic window. A permanently pulsing
    // number up in the chrome is noise the player learns to stop seeing.
    if (this.doomPanic()) {
      this.doomLabel.scale.set(1 + Math.abs(Math.sin(this.t * 6.5)) * 0.12);
    } else if (this.doomLabel.scale.x !== 1) {
      this.doomLabel.scale.set(1);
    }
  }
}
