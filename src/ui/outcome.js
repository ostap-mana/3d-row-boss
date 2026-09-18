import { Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
import { COPY, FONT, FONT_OUTCOME, T } from "../config.js";
import {
  PLATE_FILL,
  PLATE_GOLD,
  VERDICT_ART,
  aimStars,
  aimVerdict,
  fitLine,
  fitStars,
  fitVerdict,
  lineSprite,
  starsSprite,
  verdictSprite,
} from "../art/outcomeui.js";
import {
  PLAY_ART,
  PLAY_FILL,
  PLAY_LABEL,
  PLAY_RIM,
  fitRetryPlate,
  playHeight,
  playPlateSprite,
  retryPlateSprite,
} from "../art/brand.js";
import { glowTexture, gradientTexture } from "../art/textures.js";
import {
  FigureView,
  FIGURE_ASPECT,
  FIGURE_CARRIES_STARS,
} from "../art/figures.js";
import { Ease, delay, killTweensOf, tween } from "../core/tween.js";
import * as sfx from "../audio/sfx.js";
import { fitFont } from "./text.js";

const SCRIM = {
  portrait: [
    [0.0, "rgba(8,8,9,0.88)"],
    [0.16, "rgba(8,8,9,0.44)"],
    [0.34, "rgba(8,8,9,0.54)"],
    [0.45, "rgba(8,8,9,0.87)"],
    [0.8, "rgba(8,8,9,0.89)"],
    [0.9, "rgba(8,8,9,0.7)"],
    [1.0, "rgba(8,8,9,0.84)"],
  ],
  landscape: [
    [0.0, "rgba(8,8,9,0.88)"],
    [0.13, "rgba(8,8,9,0.5)"],
    [0.26, "rgba(8,8,9,0.64)"],
    [0.44, "rgba(8,8,9,0.84)"],
    [0.64, "rgba(8,8,9,0.87)"],
    [0.82, "rgba(8,8,9,0.76)"],
    [1.0, "rgba(8,8,9,0.88)"],
  ],
};

function scrimTexture(key) {
  return gradientTexture(`outcome-scrim-${key}`, SCRIM[key]);
}

const STILL_TINT = 0x8a8a92;

export const FREEZE_STEPS = 0;

export const FREEZE_LIFT = 0;

const BAND = {
  victory: { fill: 0x1b4a1a, edge: 0x27752f },
  defeat: { fill: 0x6b3030, edge: 0xc74343 },
};

const BAND_EDGE = 2.13 / 84.23;
const BAND_ALPHA = 0.9;

const VERDICT_W = { portrait: 1.0, landscape: 0.52 };
const VERDICT_H = { portrait: 0.2, landscape: 0.28 };

const PLATE_Y = { portrait: 0.47, landscape: 0.46 };
const FIGURE_H = { portrait: 0.33, landscape: 0.4 };
const FIGURE_W = { portrait: 0.92, landscape: 0.46 };

const FIGURE_STARS_H = { portrait: 0.48, landscape: 0.37 };
const FIGURE_STARS_W = { portrait: 0.92, landscape: 0.46 };

const FIGURE_STARS_SINK = { portrait: 0.3, landscape: 0.34 };
const FIGURE_SINK = 0.04;

const CONTROL_DROP = {
  win: { portrait: 0.82, landscape: 0.62 },
  loss: { portrait: 0.12, landscape: 0.12 },
};
const TAP_Y = { portrait: 0.86, landscape: 0.87 };

const LINE_W = { portrait: 0.44, landscape: 0.26 };

const STARS_W = 0.42;
const STARS_AIR = 10;

const STARS_MIN_W = 0.21;

const RETRY_W = { portrait: 0.68, landscape: 0.34 };
const RETRY_MAX = { portrait: 0.26, landscape: 0.3 };

const PLAY_W = { portrait: 1, landscape: 0.54 };

const PLATE_EDGE_AIR = 6;

const PLAY_BEAT = { rate: 1.15, kick: 0.062, attack: 0.12, decay: 6.5 };

const RETRY_AIR = 12;

const RETRY_LABEL_W = 0.6;
const RETRY_LABEL_H = 0.4;

const RETRY_PILL = { w: 0.42, h: 0.075 };
const RETRY_FILL = 0x1a0c2c;
const RETRY_LABEL = 0x3a2205;

const FLASH_HOLD = 0.04;
const FLASH_FADE = 0.55;

const FLASH_WIN = 0xfff4d8;
const FLASH_LOSS = 0xffb5a4;

const BLOOM_LOSS = 0xc9502a;

const UNFURL = {
  slitW: 0.34,
  slitH: 0.015,
  widen: 0.34,
  openAt: 0.12,
  open: 0.5,
};
const BLOOM_FLARE = 1.75;

const ARM_AFTER = 0.5;

const PULSE = 2.6;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class OutcomeScreen extends Container {
  constructor(freeze, onRetry, onCta) {
    super();
    this.visible = false;
    this.freeze = freeze || (() => null);
    this.onRetry = onRetry || null;
    this.onCta = onCta || null;
    this.terminal = false;

    this.layout = null;
    this.defeat = false;
    this.t = 0;
    this.introducing = false;
    this.hold = -1;
    this.arming = -1;
    this.leaving = null;

    this.still = null;
    this.stillAt = null;
    this.stale = false;

    this.scrim = new Sprite(scrimTexture("portrait"));
    this.addChild(this.scrim);

    this.bloom = new Sprite(glowTexture());
    this.bloom.anchor.set(0.5);
    this.bloom.blendMode = "add";
    this.bloom.tint = PLATE_GOLD;
    this.bloom.alpha = 0;
    this.addChild(this.bloom);

    this.figure = new FigureView();
    this.figure.visible = false;
    this.figure.alpha = 0;
    this.addChild(this.figure);
    this.figureH = 0;

    this.stars = starsSprite(false);
    if (this.stars) {
      this.stars.alpha = 0;
      this.stars.eventMode = "none";
      this.addChild(this.stars);
    }

    this.card = new Container();
    this.addChild(this.card);

    this.band = new Graphics();
    this.card.addChild(this.band);

    this.verdict = verdictSprite(false);
    if (this.verdict) this.card.addChild(this.verdict);

    this.painted = false;

    this.starsPainted = false;

    this.starsFit = false;

    this.figureCarries = false;

    this.word = new Text({
      text: COPY.outcomeVictory,
      style: {
        fontFamily: FONT_OUTCOME,
        fontSize: 46,
        fontWeight: "900",
        fill: 0xffffff,
        letterSpacing: 6,
        align: "center",
        dropShadow: {
          color: 0x06040c,
          alpha: 0.85,
          blur: 10,
          distance: 2,
          angle: Math.PI / 2,
        },
      },
    });
    this.word.anchor.set(0.5);
    this.card.addChild(this.word);
    this.aim();

    this.tap = new Container();
    this.line = lineSprite();
    if (this.line) this.tap.addChild(this.line);
    this.tapText = new Text({
      text: COPY.tapContinue,
      style: {
        fontFamily: FONT,
        fontSize: 14,
        fontWeight: "700",
        fill: 0xf2e6cf,
        letterSpacing: 2.6,
        align: "center",
      },
    });
    this.tapText.anchor.set(0.5);
    this.tap.addChild(this.tapText);
    this.tap.alpha = 0;
    this.addChild(this.tap);

    this.retry = new Container();
    this.retryBg = new Graphics();
    this.retry.addChild(this.retryBg);
    this.retryArt = retryPlateSprite();
    if (this.retryArt) this.retry.addChild(this.retryArt);
    this.retryText = new Text({
      text: COPY.retry,
      style: {
        fontFamily: FONT_OUTCOME,
        fontSize: 20,
        fontWeight: "700",
        fill: RETRY_LABEL,
        letterSpacing: 2.4,
      },
    });
    this.retryText.anchor.set(0.5);
    this.retryText.visible = true;
    this.retry.addChild(this.retryText);

    this.playArt = playPlateSprite();
    if (this.playArt) {
      this.playArt.visible = false;
      this.retry.addChild(this.playArt);
    }
    this.playText = new Text({
      text: COPY.cta,
      style: {
        fontFamily: FONT,
        fontSize: 26,
        fontWeight: "900",
        fill: PLAY_LABEL,
        letterSpacing: 2,
      },
    });
    this.playText.anchor.set(0.5);
    this.playText.visible = false;
    this.retry.addChild(this.playText);
    this.retry.visible = false;
    this.retry.alpha = 0;
    this.retry.eventMode = "static";
    this.retry.cursor = "pointer";
    this.retry.on("pointertap", (e) => {
      e.stopPropagation();
      if (this.arming > 0) return;
      if (this.defeat) {
        if (!this.onRetry) return;
        sfx.select();
        this.onRetry();
        return;
      }
      if (this.onCta) this.onCta("outcome");
    });
    this.addChild(this.retry);

    this.flash = new Graphics();
    this.flash.eventMode = "none";
    this.flash.alpha = 0;
    this.addChild(this.flash);

    this.eventMode = "static";
    this.on("pointertap", () => this.leave("tap"));
  }

  resize(layout) {
    this.layout = layout;
    const { w, h, ui, portrait } = layout;
    const s = layout.safeBox;
    const key = portrait ? "portrait" : "landscape";

    this.hitArea = new Rectangle(0, 0, w, h);

    if (this.still) this.reframe(w, h);
    this.scrim.texture = scrimTexture(key);
    this.scrim.setSize(w, h);

    this.flash.clear();
    this.flash.rect(0, 0, w, h);
    this.flash.fill({ color: 0xffffff });

    const cy = s.y + s.h * PLATE_Y[key];
    this.card.position.set(s.cx, cy);

    const cap = clamp(s.h * VERDICT_H[key], 52 * ui, 176 * ui);
    let pw = s.w * VERDICT_W[key];
    let ph = (pw * VERDICT_ART.h) / VERDICT_ART.w;
    if (ph > cap) {
      ph = cap;
      pw = (ph * VERDICT_ART.w) / VERDICT_ART.h;
    }

    if (this.painted) {
      ph = fitVerdict(this.verdict, pw);
      this.verdict.position.set(0, 0);
      this.band.clear();
    } else {
      this.drawBand(pw, ph);
      fitFont(this.word, pw * 0.62, ph * 0.54);
      this.word.position.set(0, 0);
    }

    const figureDown = FIGURE_CARRIES_STARS ? FIGURE_STARS_H : FIGURE_H;
    const figureAcross = FIGURE_CARRIES_STARS ? FIGURE_STARS_W : FIGURE_W;

    const roomTop = layout.banner.y + layout.banner.h / 2 + STARS_AIR * ui;
    const figureFoot =
      cy + ph * (FIGURE_CARRIES_STARS ? FIGURE_STARS_SINK[key] : FIGURE_SINK);
    this.figureH = Math.min(
      s.h * figureDown[key],
      (s.w * figureAcross[key]) / FIGURE_ASPECT,
      Math.max(0, figureFoot - roomTop),
    );
    this.figure.position.set(s.cx, figureFoot);
    const figureUp = this.fitFigure();

    if (this.stars) {
      const air = STARS_AIR * ui;
      const stoodOn = figureUp ? this.figure.y - this.figureH : cy - ph / 2;
      const ceiling = layout.banner.y + layout.banner.h / 2 + air;
      let starsW = s.w * STARS_W;
      let starsH = fitStars(this.stars, starsW, this.defeat);
      const room = stoodOn - air - ceiling;
      if (starsH > room) {
        starsW = room > 0 ? (starsW * room) / starsH : 0;
        starsH = fitStars(this.stars, starsW, this.defeat);
      }
      this.starsFit = starsW >= s.w * STARS_MIN_W;
      this.stars.position.set(s.cx, stoodOn - air - starsH / 2);
      this.stars.visible = this.starsUp();
    }

    this.bloom.position.set(s.cx, cy);
    this.bloom.setSize(Math.max(80, pw * 0.62), Math.max(80, ph * 3.4));

    const tapY = s.y + s.h * TAP_Y[key];
    this.tap.position.set(s.cx, tapY);

    const size = fitFont(this.tapText, s.w * 0.7, clamp(14 * ui, 11, 20));
    this.tapText.position.set(0, 0);
    if (this.line) {
      fitLine(this.line, s.w * LINE_W[key]);
      this.line.position.set(0, -size * 1.6);
    }

    const b = layout.board;
    const retryX = b.x + b.size / 2;

    const air = RETRY_AIR * ui;
    const rowLeft = layout.cards.x;
    const rowRight = rowLeft + layout.cards.w;
    const overRow = retryX > rowLeft && retryX < rowRight;
    const roof = cy + ph / 2 + air;
    const sill = (overRow ? layout.cards.y : s.bottom) - air;
    const room = Math.max(44 * ui, sill - roof);

    const reachAcross = Math.min(retryX - s.x, s.x + s.w - retryX);
    const beating = this.defeat ? 1 : 1 + PLAY_BEAT.kick;
    const offered = Math.min(
      s.w * (this.defeat ? RETRY_W[key] : PLAY_W[key]),
      Math.max(44 * ui, ((reachAcross - PLATE_EDGE_AIR * ui) * 2) / beating),
    );
    const box = this.fitRetry(
      offered,
      Math.min(clamp(s.h * RETRY_MAX[key], 40 * ui, 340 * ui), room),
      ui,
    );
    const reach = Math.max(roof + box.h / 2, sill - box.h / 2);
    this.retry.position.set(
      retryX,
      clamp(
        roof + (sill - roof) * CONTROL_DROP[this.defeat ? "loss" : "win"][key],
        roof + box.h / 2,
        reach,
      ),
    );
    const hitH = Math.max(box.h, 44);
    this.retry.hitArea = new Rectangle(-box.w / 2, -hitH / 2, box.w, hitH);

    if (this.introducing) this.settle();
  }

  fitFigure() {
    return this.figure.fit(this.defeat, this.figureH);
  }

  reframe(w, h) {
    const at = this.stillAt;
    if (!at || (at.w === w && at.h === h)) {
      this.still.position.set(0, 0);
      this.still.setSize(w, h);
      return;
    }

    const k = Math.max(w / at.w, h / at.h);
    const fw = at.w * k;
    const fh = at.h * k;
    this.still.position.set((w - fw) / 2, (h - fh) / 2);
    this.still.setSize(fw, fh);
    this.stale = true;
  }

  rephotograph() {
    this.stale = false;
    if (!this.still || !this.layout) return;
    const fresh = this.freeze();
    if (!fresh) return;

    const old = this.still.texture;
    this.still.texture = fresh;
    this.still.tint = STILL_TINT;
    this.stillAt = { w: this.layout.w, h: this.layout.h };
    this.still.position.set(0, 0);
    this.still.setSize(this.layout.w, this.layout.h);
    if (old && old !== fresh) {
      try {
        old.destroy(true);
      } catch {}
    }
  }

  fitRetry(w, maxH, ui) {
    this.retryBg.clear();
    if (!this.defeat && this.playArt) {
      let pw = w;
      let ph = playHeight(pw);
      if (maxH > 0 && ph > maxH) {
        ph = maxH;
        pw = (ph * PLAY_ART.w) / PLAY_ART.h;
      }
      this.playArt.setSize(pw, ph);
      return { w: pw, h: ph };
    }
    if (!this.defeat) {
      const sb = this.layout.safeBox;
      const pw = sb.w * RETRY_PILL.w;
      const ph = clamp(sb.h * RETRY_PILL.h, 34 * ui, 64 * ui);
      const r = ph * 0.42;
      this.retryBg.roundRect(-pw / 2, -ph / 2, pw, ph, r);
      this.retryBg.fill({ color: PLAY_FILL, alpha: 0.92 });
      this.retryBg.roundRect(-pw / 2, -ph / 2, pw, ph, r);
      this.retryBg.stroke({
        width: Math.max(1.5, ph * 0.06),
        color: PLAY_RIM,
        alpha: 0.95,
      });
      fitFont(this.playText, pw * 0.72, Math.max(12, ph * 0.4));
      this.playText.position.set(0, 0);
      return { w: pw, h: ph };
    }
    if (this.retryArt) {
      const box = fitRetryPlate(this.retryArt, w, maxH);
      fitFont(
        this.retryText,
        box.w * RETRY_LABEL_W,
        Math.max(12, box.h * RETRY_LABEL_H),
      );
      this.retryText.position.set(0, 0);
      return box;
    }

    const s = this.layout.safeBox;
    const pw = s.w * RETRY_PILL.w;
    const ph = clamp(s.h * RETRY_PILL.h, 34 * ui, 64 * ui);
    const r = ph * 0.42;
    const g = this.retryBg;
    g.roundRect(-pw / 2, -ph / 2, pw, ph, r);
    g.fill({ color: RETRY_FILL, alpha: 0.86 });
    g.roundRect(-pw / 2, -ph / 2, pw, ph, r);
    g.stroke({ width: Math.max(1.5, ph * 0.06), color: PLAY_RIM, alpha: 0.9 });
    fitFont(this.retryText, pw * 0.72, Math.max(12, ph * 0.4));
    this.retryText.position.set(0, 0);
    return { w: pw, h: ph };
  }

  terminalFor(outcome) {
    return outcome === "defeat" ? !!this.onRetry : true;
  }

  starsUp() {
    if (this.figureCarries) return false;
    return !!(
      this.starsPainted &&
      this.starsFit &&
      this.layout &&
      this.layout.portrait
    );
  }

  aim() {
    this.painted = this.verdict ? aimVerdict(this.verdict, this.defeat) : false;
    if (this.verdict) this.verdict.visible = this.painted;
    this.word.visible = !this.painted;
    this.starsPainted = this.stars ? aimStars(this.stars, this.defeat) : false;
    this.figureCarries = FIGURE_CARRIES_STARS && this.figure.has(this.defeat);
    if (this.stars) this.stars.visible = this.starsUp();
  }

  drawBand(w, h) {
    const c = BAND[this.defeat ? "defeat" : "victory"];
    const gold = Math.max(1, h * 0.02);
    const edge = Math.max(1, h * BAND_EDGE);
    this.band.clear();
    this.band.rect(-w / 2, -h / 2, w, h);
    this.band.fill({ color: PLATE_FILL, alpha: 0.72 });
    this.band.rect(-w / 2, -h / 2 + gold, w, h - gold * 2);
    this.band.fill({ color: c.fill, alpha: BAND_ALPHA });
    this.band.rect(-w / 2, -h / 2 + gold, w, edge);
    this.band.fill({ color: c.edge, alpha: BAND_ALPHA });
    this.band.rect(-w / 2, h / 2 - gold - edge, w, edge);
    this.band.fill({ color: c.edge, alpha: BAND_ALPHA });
    this.band.rect(-w / 2, -h / 2, w, gold);
    this.band.fill({ color: PLATE_GOLD, alpha: 0.9 });
    this.band.rect(-w / 2, h / 2 - gold, w, gold);
    this.band.fill({ color: PLATE_GOLD, alpha: 0.9 });
  }

  async show(outcome) {
    this.defeat = outcome === "defeat";
    this.terminal = this.terminalFor(outcome);
    this.word.text = this.defeat ? COPY.outcomeDefeat : COPY.outcomeVictory;
    this.aim();

    this.figure.visible = this.fitFigure();
    if (this.figure.visible) this.figure.start(this.defeat);

    this.retry.visible = this.terminal;
    this.tap.visible = false;
    if (this.retryArt) this.retryArt.visible = this.defeat;
    this.retryText.visible = this.defeat;
    if (this.playArt) this.playArt.visible = !this.defeat;
    this.playText.visible = !this.defeat && !this.playArt;

    this.bloom.tint = this.defeat ? BLOOM_LOSS : PLATE_GOLD;

    if (!this.still) {
      const texture = this.freeze();
      if (texture) {
        this.still = new Sprite(texture);
        this.stillAt = this.layout
          ? { w: this.layout.w, h: this.layout.h }
          : null;
        this.addChildAt(this.still, 0);
      }
    }
    if (this.still) this.still.tint = STILL_TINT;

    if (this.layout) this.resize(this.layout);

    this.visible = true;
    this.alpha = 1;
    this.t = 0;
    this.arming = ARM_AFTER;
    this.hold = -1;
    this.introducing = true;

    this.card.alpha = 0;
    this.tap.alpha = 0;
    this.retry.alpha = 0;
    this.retry.scale.set(1);
    this.bloom.alpha = 0;
    this.flash.alpha = 1;
    this.flash.tint = this.defeat ? FLASH_LOSS : FLASH_WIN;

    const waiting = new Promise((resolve) => {
      this.leaving = resolve;
    });
    const done = this.terminal ? Promise.resolve() : waiting;

    if (this.defeat) sfx.defeat(0.06);
    else sfx.victory();

    tween(this.flash, { alpha: 0 }, FLASH_FADE, {
      delay: FLASH_HOLD,
      ease: Ease.cubicOut,
    });

    this.card.scale.set(UNFURL.slitW, UNFURL.slitH);
    tween(this.card, { alpha: 1 }, 0.16, { delay: 0.06 });
    tween(this.card.scale, { x: 1 }, UNFURL.widen, { ease: Ease.expoOut });
    tween(this.card.scale, { y: 1 }, UNFURL.open, {
      delay: UNFURL.openAt,
      ease: Ease.backOut,
    });

    const lamp = this.defeat ? 0.3 : 0.42;
    tween(this.bloom, { alpha: lamp * BLOOM_FLARE }, 0.18, {
      ease: Ease.expoOut,
    }).then(() => {
      if (!this.introducing) return;
      tween(this.bloom, { alpha: lamp }, 0.42, { ease: Ease.cubicOut });
    });

    if (this.figure.visible)
      tween(this.figure, { alpha: 1 }, 0.4, { delay: 0.1 });
    if (this.starsUp()) tween(this.stars, { alpha: 1 }, 0.3, { delay: 0.5 });

    await delay(0.72);
    if (!this.introducing) return done;

    await tween(this.terminal ? this.retry : this.tap, { alpha: 1 }, 0.3);
    if (!this.introducing) return done;

    this.introducing = false;
    this.hold = this.terminal ? -1 : T.outcomeHold;
    return done;
  }

  settle() {
    if (!this.introducing) return;
    this.introducing = false;

    if (this.figure.visible) {
      killTweensOf(this.figure);
      this.figure.alpha = 1;
    }
    if (this.starsUp()) {
      killTweensOf(this.stars);
      this.stars.alpha = 1;
    }
    [this.card, this.tap, this.retry].forEach((el) => {
      killTweensOf(el);
      killTweensOf(el.scale);
      el.alpha = 1;
      el.scale.set(1);
    });
    killTweensOf(this.bloom);
    this.bloom.alpha = this.defeat ? 0.3 : 0.42;
    killTweensOf(this.flash);
    this.flash.alpha = 0;

    if (this.layout) this.resize(this.layout);
    this.hold = this.terminal ? -1 : T.outcomeHold;
  }

  leave(how) {
    if (!this.leaving) return;
    if (this.arming > 0) return;
    if (this.terminal) return;

    const resolve = this.leaving;
    this.leaving = null;
    this.settle();
    this.hold = -1;
    if (how !== "hold") sfx.select();

    killTweensOf(this);
    tween(this, { alpha: 0 }, 0.4).then(() => {
      this.visible = false;
      this.figure.reset();
    });

    resolve();
  }

  update(dt) {
    if (!this.visible) return;
    if (this.stale) this.rephotograph();
    this.t += dt;

    if (this.arming > 0) this.arming -= dt;
    if (this.introducing) return;

    this.bloom.alpha =
      (this.defeat ? 0.26 : 0.36) + Math.sin(this.t * 1.8) * 0.08;

    if (!this.defeat) {
      const phase = (this.t * PLAY_BEAT.rate) % 1;
      const beat =
        phase < PLAY_BEAT.attack
          ? phase / PLAY_BEAT.attack
          : Math.exp(-(phase - PLAY_BEAT.attack) * PLAY_BEAT.decay);
      this.retry.scale.set(1 + PLAY_BEAT.kick * beat);
    }
    this.tapText.alpha = 0.62 + Math.abs(Math.sin(this.t * PULSE)) * 0.38;

    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold <= 0) this.leave("hold");
    }
  }
}
