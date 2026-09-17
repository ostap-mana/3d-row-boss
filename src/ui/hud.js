import { Container, Graphics, Sprite, Text, Rectangle, Texture } from "pixi.js";
import {
  BOSS_NAME,
  COPY,
  DOOM,
  FONT,
  FONT_DAMAGE,
  FONT_TITLE,
} from "../config.js";
import { tween, delay, Ease, killTweensOf } from "../core/tween.js";
import { lerpColor } from "../core/color.js";
import { hpBarShape, hpBarPaint, HP_FRAME } from "../art/hpbar.js";
import { glowTexture, sheenTexture } from "../art/textures.js";
import { BossCrest, haveBossCrest } from "../art/crest.js";
import {
  PLAY_FILL,
  PLAY_LABEL,
  PLAY_RIM,
  fitLogo,
  fitPlayPlate,
  logoSprite,
  playPlateSprite,
} from "../art/brand.js";
import { fitFont } from "./text.js";
import * as sfx from "../audio/sfx.js";

const BAR_EDGE = 0x0a0510;
const BAR_TRACK = 0x5c3346;
const BAR_CHIP = 0xffe9c9;
const BAR_HOT = 0xff6a10;
const BAR_LOW = 0xff3b1f;

const PAINT_FULL = 0xffffff;

const DOOM_TRACK = 0x1c0a12;
const DOOM_HOT = 0xffa030;
const DOOM_PANIC = 0xff2f1a;
const PAINT_LOW = 0xff8a72;

const CHIP_HOLD = 0.1;
const CHIP_DRAIN = 0.85;

const SHEEN = { sweep: 0.85, period: 3.1, band: 3.2, peak: 0.62, phase: 0 };

const CREST_RISE = 1.65;

const DOOM_SHEEN = {
  sweep: 1.15,
  period: 3.1,
  band: 5,
  peak: 0.42,
  phase: 1.5,
};

const LOW_AT = 0.3;
const THROB = { rate: 7.4, depth: 0.55 };

const HIT_FLASH = { alpha: 0.42, dur: 0.13 };

const MEND_FLASH = { alpha: 0.5, dur: 0.4, tint: 0x9fffc4 };

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

    this.bar = new Graphics();
    this.addChild(this.bar);

    this.barEdge = this.addBarLayer(BAR_EDGE, 0.85);
    this.barTrack = this.addBarLayer(BAR_TRACK, 1);
    this.barChip = this.addBarLayer(BAR_CHIP, 0.55);
    this.barFill = this.addBarLayer(BAR_HOT, 1);
    this.barFlash = this.addBarLayer(PAINT_FULL, 0);
    this.barFlash.blendMode = "add";
    this.barShape = null;

    this.barSheen = new Sprite(sheenTexture());
    this.barSheen.blendMode = "add";
    this.barSheen.visible = false;
    this.addChild(this.barSheen);

    this.barTip = new Sprite(glowTexture());
    this.barTip.anchor.set(0.5);
    this.barTip.blendMode = "add";
    this.barTip.visible = false;
    this.addChild(this.barTip);

    this.hpLabel = new Text({
      text: "100%",
      style: {
        fontFamily: FONT,
        fontWeight: "900",
        fontSize: 14,
        fill: 0xffffff,
        dropShadow: {
          color: 0x1a0503,
          alpha: 0.85,
          blur: 4,
          distance: 0,
          angle: 0,
        },
      },
    });
    this.hpLabel.anchor.set(0.5);
    this.addChild(this.hpLabel);

    this.hpPrinted = -1;

    this.name = new Text({
      text: BOSS_NAME,
      style: {
        fontFamily: FONT_TITLE,
        fontSize: 16,
        fontWeight: "800",
        fill: 0xffd9a8,
        letterSpacing: 2.4,
      },
    });
    this.name.anchor.set(0, 1);
    this.addChild(this.name);

    this.doomBar = new Container();
    this.doomPlain = new Graphics();
    this.doomTrack = new Sprite(Texture.EMPTY);
    this.doomFill = new Sprite(Texture.EMPTY);
    this.doomBar.addChild(this.doomPlain, this.doomTrack, this.doomFill);
    this.addChild(this.doomBar);

    this.doomSheen = new Sprite(sheenTexture());
    this.doomSheen.blendMode = "add";
    this.doomSheen.visible = false;
    this.addChild(this.doomSheen);

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
    this.doomLabel.anchor.set(1, 1);
    this.doomLabel.alpha = 0;
    this.addChild(this.doomLabel);

    this.doomLeft = 0;
    this.doomTotal = DOOM.seconds;
    this.doomOn = false;

    this.crest = haveBossCrest() ? new BossCrest() : null;
    if (this.crest) this.addChild(this.crest);

    this.banner = new Container();
    this.banner.alpha = 0;
    this.banner.visible = false;
    this.bannerBg = new Graphics();
    this.banner.addChild(this.bannerBg);
    this.bannerLogo = logoSprite();
    if (this.bannerLogo) this.banner.addChild(this.bannerLogo);
    this.bannerArt = playPlateSprite();
    if (this.bannerArt) this.banner.addChild(this.bannerArt);

    this.bannerText = new Text({
      text: COPY.cta,
      style: {
        fontFamily: FONT,
        fontSize: 15,
        fontWeight: "900",
        fill: PLAY_LABEL,
        letterSpacing: 1.2,
      },
    });
    this.bannerText.anchor.set(0.5);
    this.bannerText.visible = !this.bannerArt;
    this.banner.addChild(this.bannerText);
    this.banner.eventMode = "static";
    this.banner.cursor = "pointer";
    this.banner.on("pointertap", () => this.onInstall("banner"));
    this.addChild(this.banner);

    this.callout = new Text({
      text: "",
      style: {
        fontFamily: FONT,
        fontSize: 34,
        fontWeight: "900",
        fill: 0xffffff,
        letterSpacing: 2,
        align: "center",
        dropShadow: {
          color: 0x05030a,
          alpha: 0.75,
          blur: 7,
          distance: 0,
          angle: 0,
        },
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
    this.barDriver = { v: 1 };
    this.chipDriver = { v: 1 };
    this.shoutToken = 0;
    this.onShout = null;
    this.t = 0;
    this.doomT = 0;
    this.doomHeld = false;
    this.layout = null;
  }

  enrage() {
    if (this.crest) this.crest.enrage();
  }

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

    let inset = 0;
    if (this.crest) {
      const top = y - 3 * ui - 11 * ui;
      const foot = y + h + 3 * ui + Math.max(3, h * 0.32);
      const crestH = (foot - top) * CREST_RISE;
      const crestW = this.crest.resize(crestH);
      this.crest.x = x + crestW / 2;
      this.crest.y = layout.safeBox.y + 2 * ui + crestH / 2;
      inset = crestW + 2 * ui;
    }

    this.barRect = { x: x + inset, y, w: w - inset, h };

    this.name.style.fontSize = Math.max(9, 11 * ui);
    this.name.x = x + inset;
    this.name.y = y - 3 * ui;

    const hpSize = Math.max(9, h * 0.72);
    this.hpLabel.style.fontSize = hpSize;
    this.hpLabel.style.letterSpacing = hpSize * 0.02;
    this.hpLabel.x = this.barRect.x + this.barRect.w / 2;
    this.hpLabel.y = y + h / 2;
    this.hpPrinted = -1;
    this.printHp();

    this.callout.style.dropShadow = {
      color: 0x05030a,
      alpha: 0.75,
      blur: Math.max(5, 7 * ui),
      distance: 0,
      angle: 0,
    };

    if (layout.portrait) {
      const box = layout.safeBox;
      this.calloutWidth = box.w - 24;
      this.calloutSize = Math.max(17, Math.min(box.w * 0.078, 38 * ui));
      this.callout.x = box.cx;
      this.callout.y = layout.board.y;
      this.calloutFloor =
        layout.board.y + (layout.board.size - 5 * layout.board.cell) / 2;
      this.calloutCeil = layout.board.y - layout.board.size * 0.1;
    } else {
      this.calloutFloor = 0;
      const column = layout.board.x - layout.safeBox.x;
      this.calloutWidth = column * 0.92;
      this.calloutSize = Math.max(16, Math.min(column * 0.17, 34 * ui));
      this.callout.x = layout.boss.x;
      this.callout.y = layout.boss.floor - layout.stage.h * 0.13;
    }
    this.callout.style.fontSize = this.calloutSize;

    const { w: bw, stacked, plateW, plateH, logoW, logoH, gap } = layout.banner;
    const contentH = stacked ? logoH + gap + plateH : Math.max(logoH, plateH);
    const top = -contentH / 2;
    const left = -bw / 2;
    const logoX = stacked ? 0 : left + logoW / 2;
    const logoY = stacked ? top + logoH / 2 : 0;
    const plateX = stacked ? 0 : left + logoW + gap + plateW / 2;
    const plateY = stacked ? top + logoH + gap + plateH / 2 : 0;

    if (this.bannerLogo) {
      fitLogo(this.bannerLogo, logoW);
      this.bannerLogo.position.set(logoX, logoY);
    }

    fitFont(this.bannerText, plateW * 0.7, Math.max(12, plateH * 0.42));
    this.bannerText.position.set(plateX, plateY);

    this.bannerBg.clear();
    if (this.bannerArt) {
      fitPlayPlate(this.bannerArt, plateW);
      this.bannerArt.position.set(plateX, plateY);
    } else {
      this.bannerBg.roundRect(
        plateX - plateW / 2,
        plateY - plateH / 2,
        plateW,
        plateH,
        plateH * 0.22,
      );
      this.bannerBg.fill({ color: PLAY_FILL });
      this.bannerBg.stroke({
        width: Math.max(2, plateH * 0.08),
        color: PLAY_RIM,
      });
    }
    const slack = 7 * ui;
    this.banner.hitArea = new Rectangle(
      left - slack,
      top - slack,
      bw + slack * 2,
      contentH + slack * 2,
    );
    this.banner.x = layout.banner.x;
    this.banner.y = layout.banner.y;

    this.doomLabel.style.fontSize = Math.max(9, 11 * ui);
    this.doomLabel.x = x + w;
    this.doomLabel.y = y - 3 * ui;

    this.bakeBar();
    this.drawBar();
    this.bakeDoom();
    this.drawDoom();
  }

  bakeDoom() {
    const { w, h } = this.doomRect();
    this.disposeDoom();

    const track = hpBarPaint(w, h, "doomTrack");
    const fill = hpBarPaint(w, h, "doomFill");
    this.doomShape = track && fill ? { pw: fill.pw, ph: fill.ph } : null;
    if (!this.doomShape) return;

    this.doomBakes = [track.texture, fill.texture];
    this.doomPainted = fill.painted;

    this.doomTrack.texture = track.texture;
    this.doomTrack.tint = track.painted ? PAINT_FULL : DOOM_TRACK;
    this.doomTrack.alpha = track.painted ? 1 : 0.9;

    this.doomFill.texture = new Texture({
      source: fill.texture.source,
      frame: new Rectangle(0, 0, fill.pw, fill.ph),
      dynamic: true,
    });
  }

  disposeDoom() {
    if (this.doomFill.texture && this.doomFill.texture !== Texture.EMPTY) {
      this.doomFill.texture.destroy(false);
    }
    this.doomFill.texture = Texture.EMPTY;
    this.doomTrack.texture = Texture.EMPTY;
    (this.doomBakes || []).forEach((t) => t.destroy(true));
    this.doomBakes = [];
  }

  bakeBar() {
    const { x, y, w, h } = this.barRect;
    this.disposeBar();

    const grow = Math.max(2, h * HP_FRAME);
    const edge = hpBarShape(w + grow * 2, h + grow * 2);
    const shape = hpBarShape(w, h);
    const track = hpBarPaint(w, h, "track");
    const fill = hpBarPaint(w, h, "fill");
    const chip = hpBarPaint(w, h, "chip");
    this.barShape = shape && edge && track && fill && chip ? shape : null;

    const layers = [
      this.barEdge,
      this.barTrack,
      this.barChip,
      this.barFill,
      this.barFlash,
    ];
    if (!this.barShape) {
      layers.forEach((s) => {
        s.visible = false;
      });
      this.barSheen.visible = false;
      this.barTip.visible = false;
      return;
    }
    this.barBakes = [
      edge.texture,
      shape.texture,
      track.texture,
      fill.texture,
      chip.texture,
    ];
    this.barPainted = fill.painted;
    this.barTrack.tint = track.painted ? PAINT_FULL : BAR_TRACK;
    this.barChip.tint = chip.painted ? PAINT_FULL : BAR_CHIP;
    this.barChip.alpha = chip.painted ? 1 : 0.55;
    layers.forEach((s) => {
      s.visible = true;
    });

    this.barEdge.texture = edge.texture;
    this.barEdge.setSize(w + grow * 2, h + grow * 2);
    this.barEdge.x = x - grow;
    this.barEdge.y = y - grow;

    this.barTrack.texture = track.texture;
    this.barTrack.setSize(w, h);
    this.barTrack.x = x;
    this.barTrack.y = y;

    [
      [this.barChip, chip],
      [this.barFill, fill],
      [this.barFlash, shape],
    ].forEach(([s, art]) => {
      s.texture = new Texture({
        source: art.texture.source,
        frame: new Rectangle(0, 0, art.pw, art.ph),
        dynamic: true,
      });
      s.x = x;
      s.y = y;
    });
  }

  disposeBar() {
    [this.barChip, this.barFill, this.barFlash].forEach((s) => {
      if (s.texture && s.texture !== Texture.EMPTY) s.texture.destroy(false);
      s.texture = Texture.EMPTY;
    });
    this.barEdge.texture = Texture.EMPTY;
    this.barTrack.texture = Texture.EMPTY;
    (this.barBakes || []).forEach((t) => t.destroy(true));
    this.barBakes = [];
    this.disposeDoom();
  }

  cropBar(sprite, frac) {
    const { w, h } = this.barRect;
    const f = Math.max(0, Math.min(1, frac));
    sprite.visible = f > 0.001;
    if (!sprite.visible) return;

    const tex = sprite.texture;
    tex.frame.width = Math.max(1, Math.round(this.barShape.pw * f));
    tex.frame.height = this.barShape.ph;
    tex.update();
    sprite.setSize(w * f, h);
  }

  doomRect() {
    const { x, y, w, h } = this.barRect;
    const ui = this.layout ? this.layout.ui : 1;
    return { x, y: y + h + 3 * ui, w, h: Math.max(3, h * 0.32) };
  }

  drawDoom() {
    if (!this.barRect) {
      this.doomBar.visible = false;
      return;
    }
    const { x, y, w, h } = this.doomRect();
    this.doomBar.visible = this.doomOn;
    if (!this.doomOn) return;

    const left = Math.max(0, Math.min(1, this.doomLeft / this.doomTotal));

    if (!this.doomShape) {
      this.doomTrack.visible = false;
      this.doomFill.visible = false;
      this.doomPlain.visible = true;
      const g = this.doomPlain;
      g.clear();
      g.roundRect(x, y, w, h, h / 2);
      g.fill({ color: DOOM_TRACK, alpha: 0.9 });
      if (left > 0.001) {
        g.roundRect(x, y, w * left, h, h / 2);
        g.fill({ color: this.doomPanic() ? DOOM_PANIC : DOOM_HOT });
      }
      return;
    }
    this.doomPlain.visible = false;
    this.doomTrack.visible = true;

    this.doomTrack.setSize(w, h);
    this.doomTrack.x = x;
    this.doomTrack.y = y;

    this.doomFill.visible = left > 0.001;
    if (!this.doomFill.visible) return;

    const tex = this.doomFill.texture;
    tex.frame.width = Math.max(1, Math.round(this.doomShape.pw * left));
    tex.frame.height = this.doomShape.ph;
    tex.update();
    this.doomFill.setSize(w * left, h);
    this.doomFill.x = x;
    this.doomFill.y = y;

    this.doomFill.tint = this.doomPanic()
      ? DOOM_PANIC
      : this.doomPainted
        ? PAINT_FULL
        : DOOM_HOT;
  }

  doomPanic() {
    return this.doomOn && this.doomLeft <= DOOM.panicAt;
  }

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

    const step = Math.round((this.doomLeft / this.doomTotal) * 200);
    if (!wasOn || step !== this.doomStep) {
      this.doomStep = step;
      this.drawDoom();
    }
  }

  holdDoom(on) {
    this.doomHeld = !!on;
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
      this.cropBar(this.barFlash, Math.max(this.hpChip, this.hpShown));
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

  async setHp(value, dur) {
    const d = dur === undefined ? 0.45 : dur;
    const hit = value < this.hpShown - 0.001;
    const mend = value > this.hpShown + 0.001;
    this.hp = value;

    if (hit && this.barShape) {
      killTweensOf(this.barFlash);
      this.barFlash.tint = PAINT_FULL;
      this.barFlash.alpha = HIT_FLASH.alpha;
      tween(this.barFlash, { alpha: 0 }, HIT_FLASH.dur, { ease: Ease.quadOut });
    }
    if (hit && this.crest) this.crest.hit(0.6 + (this.hpShown - value) * 4);

    if (mend && this.barShape) {
      killTweensOf(this.barFlash);
      this.barFlash.tint = MEND_FLASH.tint;
      this.barFlash.alpha = MEND_FLASH.alpha;
      tween(this.barFlash, { alpha: 0 }, MEND_FLASH.dur, {
        ease: Ease.quadOut,
      }).then(() => {
        this.barFlash.tint = PAINT_FULL;
      });
    }

    killTweensOf(this.barDriver);
    killTweensOf(this.chipDriver);
    this.barDriver.v = this.hpShown;
    this.chipDriver.v = this.hpChip;

    const lead = { secs: d * 0.55, wait: 0 };
    const trail = { secs: d * CHIP_DRAIN, wait: d * CHIP_HOLD };
    const bar = mend ? trail : lead;
    const chip = mend ? lead : trail;

    await Promise.all([
      tween(this.barDriver, { v: value }, bar.secs, {
        delay: bar.wait,
        ease: Ease.quadOut,
        onUpdate: () => {
          this.hpShown = this.barDriver.v;
          this.drawBar();
        },
      }),
      tween(this.chipDriver, { v: value }, chip.secs, {
        delay: chip.wait,
        ease: Ease.quadOut,
        onUpdate: () => {
          this.hpChip = this.chipDriver.v;
          this.drawBar();
        },
      }),
    ]);
  }

  async shout(text, hold, opts) {
    const o = opts || {};
    if (this.onShout) this.onShout();
    const token = ++this.shoutToken;
    killTweensOf(this.callout);
    killTweensOf(this.callout.scale);
    this.callout.text = text;
    this.callout.style.fill = o.fill || 0xffffff;
    this.callout.alpha = 0;
    this.callout.scale.set(1);
    fitFont(this.callout, this.calloutWidth || 320, this.calloutSize || 28);
    if (this.calloutFloor) {
      const clear = this.calloutFloor - this.callout.height / 2;
      this.callout.y = Math.max(clear, this.calloutCeil);
    }
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

  hideShout(instant) {
    this.shoutToken++;
    killTweensOf(this.callout);
    if (instant) this.callout.alpha = 0;
    else tween(this.callout, { alpha: 0 }, 0.15);
  }

  damage(value, x, y, tier, opts) {
    const o = opts || {};
    const size = Math.max(
      13,
      (tier === 2 ? 30 : tier === 1 ? 24 : 19) *
        (this.layout ? this.layout.ui : 1),
    );
    const label = new Text({
      text: (o.sign === undefined ? "" : o.sign) + comma(value),
      style: {
        fontFamily: FONT_DAMAGE,
        fontSize: size,
        fontWeight: "900",
        fill: o.fill || (tier === 2 ? 0xffe066 : 0xffffff),
        letterSpacing: 0.5,
        dropShadow: {
          color: 0x1a0308,
          alpha: 0.8,
          blur: Math.max(3, size * 0.22),
          distance: 0,
          angle: 0,
        },
        padding: Math.ceil(size * 0.25),
      },
    });
    label.anchor.set(0.5);
    label.x = x;
    label.y = y;
    if (this.layout) {
      const box = this.layout.safeBox;
      const half = label.width / 2 + 4;
      label.x = Math.min(Math.max(x, box.x + half), box.right - half);
    }
    label.scale.set(tier === 2 ? 1.62 : 1.4, tier === 2 ? 0.46 : 0.58);
    label.rotation = (Math.random() - 0.5) * (tier === 2 ? 0.2 : 0.13);
    this.numbers.addChild(label);

    const rise = 70 + Math.random() * 30;
    let from = y;
    let top = y - rise;
    if (this.callout.alpha > 0.05) {
      const guard = this.callout.y + this.callout.height * 0.6;
      from = Math.max(y, guard + 20);
      top = Math.max(from - rise, guard);
    }
    label.y = from;
    tween(label.scale, { x: 1, y: 1 }, tier === 2 ? 0.46 : 0.34, {
      ease: Ease.elasticOut,
    });
    tween(label, { rotation: 0 }, 0.5, { ease: Ease.elasticOut });
    tween(label, { alpha: 0 }, 0.26, { delay: 0.56 });
    tween(label, { y: top }, 0.85, {
      ease: Ease.expoOut,
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

  sweep(cfg, span, band, t = this.t) {
    if (span < band * 1.5) return null;
    const p = ((t + cfg.phase) % cfg.period) / cfg.sweep;
    if (p > 1) return null;
    return {
      x: p * (span - band),
      alpha: Math.pow(Math.sin(p * Math.PI), 0.7) * cfg.peak,
    };
  }

  printHp() {
    const v = this.hpShown;
    const pct = v <= 0 ? 0 : Math.max(1, Math.floor(v * 100));
    if (pct === this.hpPrinted) return;
    this.hpPrinted = pct;
    this.hpLabel.text = `${pct}%`;
  }

  animateBar() {
    if (!this.barRect || !this.barShape) return;
    const { x, y, w, h } = this.barRect;
    const span = w * this.hpShown;
    const low = this.hpShown < LOW_AT;

    if (span <= h * 0.5) {
      this.barSheen.visible = false;
      this.barTip.visible = false;
      return;
    }

    const band = h * SHEEN.band;
    const s = this.sweep(SHEEN, span, band);
    this.barSheen.visible = !!s;
    if (s) {
      this.barSheen.setSize(band, h);
      this.barSheen.x = x + s.x;
      this.barSheen.y = y;
      this.barSheen.alpha = s.alpha;
    }

    const bloom = h * 3.2;
    this.barTip.visible = true;
    this.barTip.setSize(bloom, bloom);
    this.barTip.x = x + span;
    this.barTip.y = y + h / 2;
    this.barTip.tint = low ? BAR_LOW : BAR_HOT;
    this.barTip.alpha = 0.3 + Math.sin(this.t * 5.2) * 0.09;

    if (low) {
      const beat = (1 + Math.sin(this.t * THROB.rate)) * 0.5 * THROB.depth;
      this.barFill.tint = this.barPainted
        ? lerpColor(PAINT_LOW, PAINT_FULL, beat)
        : lerpColor(BAR_LOW, BAR_HOT, beat);
    }
  }

  animateDoom() {
    if (!this.doomOn || !this.barRect) {
      this.doomSheen.visible = false;
      return;
    }
    const { x, y, w, h } = this.doomRect();
    const left = Math.max(0, Math.min(1, this.doomLeft / this.doomTotal));
    const band = h * DOOM_SHEEN.band;
    const s = this.sweep(DOOM_SHEEN, w * left, band, this.doomT);

    this.doomSheen.visible = !!s;
    if (!s) return;
    this.doomSheen.setSize(band, h);
    this.doomSheen.x = x + s.x;
    this.doomSheen.y = y;
    this.doomSheen.alpha = s.alpha;
  }

  update(dt) {
    this.t += dt;
    if (!this.doomHeld) this.doomT += dt;
    if (this.banner.visible) {
      const p = 1 + Math.sin(this.t * 4.2) * 0.045;
      this.banner.scale.set(p);
    }

    this.printHp();
    if (this.crest) this.crest.update(dt);
    this.animateBar();
    this.animateDoom();

    if (this.doomPanic()) {
      this.doomLabel.scale.set(1 + Math.abs(Math.sin(this.doomT * 6.5)) * 0.12);
      this.doomBar.alpha = 0.74 + Math.abs(Math.sin(this.doomT * 6.5)) * 0.26;
    } else {
      if (this.doomLabel.scale.x !== 1) this.doomLabel.scale.set(1);
      if (this.doomBar.alpha !== 1) this.doomBar.alpha = 1;
    }
  }
}
