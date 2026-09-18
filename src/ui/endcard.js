import { Container, Graphics, Sprite, Text, Rectangle } from "pixi.js";
import {
  COPY,
  FONT,
  FONT_OUTCOME,
  FONT_TITLE,
  GEM_COLORS,
  GEM_LIGHT,
  HEALER,
} from "../config.js";
import {
  PLAY_FILL,
  PLAY_LABEL,
  PLAY_RIM,
  bannerHeight,
  bannerSprite,
  fitBanner,
  fitKeyArt,
  fitLogo,
  fitPlayPlate,
  fitRetryPlate,
  keyArtSprite,
  logoSprite,
  playHeight,
  playPlateSprite,
  retryPlateSprite,
  DEFEAT_ART,
  VICTORY_ART,
} from "../art/brand.js";
import { glowTexture, gradientTexture } from "../art/textures.js";
import { tween, delay, killTweensOf, Ease } from "../core/tween.js";
import * as sfx from "../audio/sfx.js";
import { fitFont } from "./text.js";

const BACKDROP = [
  [0.0, "#0b0618"],
  [0.5, "#1a0c2c"],
  [1.0, "#3a1030"],
];

const TOP_SCRIM = [
  [0.0, "rgba(7,4,14,0.95)"],
  [0.5, "rgba(7,4,14,0.58)"],
  [1.0, "rgba(7,4,14,0)"],
];
const BOTTOM_SCRIM = [
  [0.0, "rgba(7,4,14,0)"],
  [0.5, "rgba(7,4,14,0.66)"],
  [1.0, "rgba(7,4,14,0.96)"],
];
const SIDE_SCRIM = [
  [0.0, "rgba(7,4,14,0.92)"],
  [0.55, "rgba(7,4,14,0.5)"],
  [1.0, "rgba(7,4,14,0)"],
];

const RETRY_PLATE_W = 0.64;
const RETRY_PLATE_MAX = 0.22;
const RETRY_PLATE_MAX_PORTRAIT = 0.13;
const RETRY_CLEAR = 0.25;
const RETRY_PILL_W = 0.64;
const RETRY_H = 0.56;
const RETRY_LABEL_W = 0.6;
const RETRY_LABEL_H = 0.4;

const RETRY_FILL = 0x1a0c2c;
const RETRY_LABEL = 0x3a2205;

const BANNER_WIDTH = 0.82;
const BANNER_MAX_ROOM = 0.5;

const BANNER_FILL = 0.94;

const BANNER_COL = 0.9;
const BANNER_COL_ROOM = 0.3;

const BANNER_COL_ROOM_RETRY = 0.2;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class EndCard extends Container {
  constructor(onCta, onRetry) {
    super();
    this.visible = false;
    this.onCta = onCta;
    this.onRetry = onRetry || null;

    this.bg = new Sprite(gradientTexture("endcard", BACKDROP));
    this.addChild(this.bg);

    this.art = keyArtSprite();
    if (this.art) this.addChild(this.art);

    this.rays = new Graphics();
    this.addChild(this.rays);
    this.glow = new Sprite(glowTexture());
    this.glow.anchor.set(0.5);
    this.glow.blendMode = "add";
    this.glow.tint = GEM_COLORS[HEALER];
    this.glow.alpha = 0.45;
    this.addChild(this.glow);
    this.rays.visible = !this.art;
    this.glow.visible = !this.art;

    this.topScrim = new Sprite(gradientTexture("endcard-top", TOP_SCRIM));
    this.bottomScrim = new Sprite(
      gradientTexture("endcard-bottom", BOTTOM_SCRIM),
    );
    this.sideScrim = new Sprite(gradientTexture("endcard-side", SIDE_SCRIM));
    this.sideScrim.anchor.set(0, 0);
    this.sideScrim.angle = -90;
    this.scrims = [this.topScrim, this.bottomScrim, this.sideScrim];
    this.scrims.forEach((s) => {
      s.visible = !!this.art;
      this.addChild(s);
    });

    this.bannerArt = null;
    this.banner = new Container();
    this.banner.alpha = 0;
    this.banner.visible = false;
    this.addChild(this.banner);

    this.outcome = new Text({
      text: COPY.victory,
      style: {
        fontFamily: FONT,
        fontSize: 20,
        fontWeight: "900",
        fill: 0xffe6a8,
        letterSpacing: 4,
        align: "center",
      },
    });
    this.outcome.anchor.set(0.5);
    this.outcome.visible = false;
    this.addChild(this.outcome);

    this.brand = new Container();
    this.logo = logoSprite();
    this.title = new Text({
      text: COPY.endTitle,
      style: {
        fontFamily: FONT_TITLE,
        fontSize: 40,
        fontWeight: "900",
        fill: 0xffffff,
        letterSpacing: 3,
        align: "center",
      },
    });
    this.title.anchor.set(0.5);
    this.brand.addChild(this.logo || this.title);
    this.addChild(this.brand);

    this.sub = new Text({
      text: COPY.endSub,
      style: {
        fontFamily: FONT,
        fontSize: 18,
        fontWeight: "800",
        fill: GEM_LIGHT[HEALER],
        letterSpacing: 2.4,
        align: "center",
      },
    });
    this.sub.anchor.set(0.5);
    this.sub.visible = false;
    this.addChild(this.sub);

    this.button = new Container();
    this.buttonBg = new Graphics();
    this.button.addChild(this.buttonBg);
    this.plate = playPlateSprite();
    if (this.plate) this.button.addChild(this.plate);

    this.buttonText = new Text({
      text: COPY.cta,
      style: {
        fontFamily: FONT,
        fontSize: 26,
        fontWeight: "900",
        fill: PLAY_LABEL,
        letterSpacing: 2,
      },
    });
    this.buttonText.anchor.set(0.5);
    this.buttonText.visible = !this.plate;
    this.button.addChild(this.buttonText);
    this.addChild(this.button);

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
    this.retry.visible = false;
    this.addChild(this.retry);

    this.eventMode = "static";
    this.cursor = "pointer";
    this.on("pointertap", () => this.onCta("endcard"));

    this.t = 0;
    this.layout = null;
    this.focus = { x: 0, y: 0 };
    this.introducing = false;
  }

  fitBrand(maxW, ideal) {
    if (this.logo) return fitLogo(this.logo, maxW);
    fitFont(this.title, maxW, ideal);
    return this.title.height;
  }

  fitPlay(bw) {
    const bh = playHeight(bw);
    this.buttonBg.clear();
    if (this.plate) {
      fitPlayPlate(this.plate, bw);
    } else {
      this.drawPill(bw, bh);
      fitFont(this.buttonText, bw * 0.7, Math.max(15, bh * 0.42));
    }
    return bh;
  }

  fitRetry(w, bw, bh, maxH) {
    this.retryBg.clear();

    if (this.retryArt) {
      const box = fitRetryPlate(this.retryArt, w, maxH);
      fitFont(
        this.retryText,
        box.w * RETRY_LABEL_W,
        Math.max(12, box.h * RETRY_LABEL_H),
      );
      return box;
    }

    const pw = bw * RETRY_PILL_W;
    const ph = bh * RETRY_H;
    this.drawRetry(pw, ph);
    fitFont(this.retryText, pw * 0.72, Math.max(12, ph * 0.4));
    return { w: pw, h: ph };
  }

  drawRetry(w, h) {
    const g = this.retryBg;
    g.clear();
    const r = h * 0.42;
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.fill({ color: RETRY_FILL, alpha: 0.86 });
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.stroke({ width: Math.max(1.5, h * 0.06), color: PLAY_RIM, alpha: 0.9 });
  }

  retryClear(boxH, artH) {
    return Math.max(12, boxH * 0.03, artH * RETRY_CLEAR);
  }

  placeRetry(x, y, w, h) {
    const hitH = Math.max(h, 44);
    this.retry.position.set(x, y);
    this.retry.hitArea = new Rectangle(-w / 2, -hitH / 2, w, hitH);
    this.retry.eventMode = "static";
    this.retry.cursor = "pointer";
    this.retry.removeAllListeners();
    this.retry.on("pointertap", (e) => {
      e.stopPropagation();
      if (!this.onRetry) return;
      sfx.select();
      this.onRetry();
    });
  }

  placeButton(x, y, bw, bh) {
    this.button.position.set(x, y);
    this.button.hitArea = new Rectangle(-bw / 2, -bh / 2, bw, bh);
    this.button.eventMode = "static";
    this.button.cursor = "pointer";
    this.button.removeAllListeners();
    this.button.on("pointertap", (e) => {
      e.stopPropagation();
      this.onCta("button");
    });
  }

  placeArt(clear, side) {
    const { w, h } = this.layout;
    if (!this.art) return;

    fitKeyArt(this.art, w, h, clear.x, clear.y, clear.zoom);

    this.topScrim.position.set(0, 0);
    this.topScrim.setSize(w, clear.top);
    this.bottomScrim.position.set(0, clear.bottom);
    this.bottomScrim.setSize(w, Math.max(0, h - clear.bottom));

    this.sideScrim.visible = side > 0;
    if (side > 0) {
      this.sideScrim.position.set(0, h);
      this.sideScrim.setSize(h, side);
    }
  }

  aimBackdrop(clear) {
    this.focus = { x: clear.x, y: clear.y };
    this.glow.setSize(
      Math.max(40, this.layout.stage.w * 0.9),
      Math.max(40, (clear.bottom - clear.top) * 1.2),
    );
    this.glow.position.set(this.focus.x, this.focus.y);
  }

  sizeBanner(maxW, maxH) {
    if (!this.bannerArt) return 0;
    let bw = maxW;
    let bh = bannerHeight(this.defeat, bw);
    if (maxH > 0 && bh > maxH) {
      bh = maxH;
      const art = this.defeat ? DEFEAT_ART : VICTORY_ART;
      bw = (bh * art.w) / art.h;
    }
    fitBanner(this.bannerArt, this.defeat, bw);
    return bh;
  }

  placeBanner(clear) {
    if (!this.bannerArt) return;
    const { w } = this.layout;

    const room = Math.max(0, clear.bottom - clear.top);
    const reach = 2 * Math.min(clear.x, w - clear.x) * BANNER_FILL;
    let bw = Math.min(w * BANNER_WIDTH, reach);
    let bh = bannerHeight(this.defeat, bw);
    const cap = room * BANNER_MAX_ROOM;
    if (bh > cap && cap > 0) {
      bh = cap;
      const art = this.defeat ? DEFEAT_ART : VICTORY_ART;
      bw = (bh * art.w) / art.h;
    }

    fitBanner(this.bannerArt, this.defeat, bw);
    this.banner.position.set(clear.x, clear.top + bh * 0.5 + room * 0.04);
  }

  resize(layout) {
    this.layout = layout;
    const { w, h } = layout;

    this.bg.setSize(w, h);
    this.hitArea = new Rectangle(0, 0, w, h);

    if (layout.portrait) this.stackPortrait(layout);
    else this.stackLandscape(layout);

    this.drawRays();

    if (this.introducing) this.settle();
  }

  fitLine(text, avail, size) {
    return text.visible ? fitFont(text, avail, size) : 0;
  }

  stackPortrait(layout) {
    const { ui } = layout;
    const s = layout.safeBox;
    const { w, h } = s;
    const pad = h * 0.045;

    const bw = Math.min(w * 0.64, 330 * ui);
    const bh = this.fitPlay(bw);

    let foot = s.bottom - pad;
    if (this.retry.visible) {
      const r = this.fitRetry(
        bw * RETRY_PLATE_W,
        bw,
        bh,
        h * RETRY_PLATE_MAX_PORTRAIT,
      );
      const ry = foot - r.h / 2;
      this.placeRetry(s.cx, ry, r.w, r.h);
      foot = ry - r.h / 2 - this.retryClear(h, r.h);
    }

    const buttonY = foot - bh / 2;
    this.placeButton(s.cx, buttonY, bw, bh);

    const outSize = this.fitLine(
      this.outcome,
      w * 0.86,
      clamp(w * 0.045, 11, 22 * ui),
    );
    if (outSize) {
      this.outcome.position.set(s.cx, s.y + h * 0.05 + outSize * 0.7);
    }

    const logoH = this.fitBrand(
      Math.min(w * 0.74, 400 * ui),
      clamp(w * 0.086, 20, 48 * ui),
    );
    const brandTop = outSize ? this.outcome.y + outSize * 0.8 : s.y + h * 0.07;
    this.brand.position.set(s.cx, brandTop + logoH / 2);

    const subSize = this.fitLine(
      this.sub,
      w * 0.86,
      clamp(w * 0.042, 10, 20 * ui),
    );
    if (subSize) {
      this.sub.position.set(s.cx, this.brand.y + logoH / 2 + subSize * 1.2);
    }

    const top = subSize ? this.sub.y + subSize * 0.8 : this.brand.y + logoH / 2;
    const bottom = buttonY - bh / 2 - h * 0.02;
    const clear = {
      x: s.cx,
      y: (top + bottom) / 2,
      top: top + h * 0.05,
      bottom,
    };
    this.placeArt(clear, 0);
    this.aimBackdrop(clear);
    this.placeBanner(clear);
  }

  stackLandscape(layout) {
    const { ui } = layout;
    const s = layout.safeBox;
    const { w, h } = s;
    const colW = w * 0.5;
    const cx = s.x + w * 0.26;
    const gap = Math.max(8, h * 0.03);

    const bw = Math.min(colW * 0.86, 380 * ui);
    const bh = this.fitPlay(bw);
    const outSize = this.fitLine(
      this.outcome,
      colW * 0.9,
      clamp(h * 0.055, 10, 20 * ui),
    );
    const logoH = this.fitBrand(
      Math.min(colW * 0.9, 420 * ui),
      clamp(h * 0.11, 20, 48 * ui),
    );
    const subSize = this.fitLine(
      this.sub,
      colW * 0.9,
      clamp(h * 0.05, 9, 18 * ui),
    );
    const retry = this.retry.visible
      ? this.fitRetry(bw * RETRY_PLATE_W, bw, bh, h * RETRY_PLATE_MAX)
      : null;
    const bannerH = this.sizeBanner(
      Math.min(colW * BANNER_COL, 520 * ui),
      h * (retry ? BANNER_COL_ROOM_RETRY : BANNER_COL_ROOM),
    );

    const rungs = [];
    if (bannerH > 0) {
      rungs.push({
        h: bannerH,
        gap: 0.5,
        place: (y) => this.banner.position.set(cx, y + bannerH / 2),
      });
    }
    if (outSize) {
      rungs.push({
        h: outSize,
        gap: 0.5,
        place: (y) => this.outcome.position.set(cx, y + outSize / 2),
      });
    }
    rungs.push({
      h: logoH,
      gap: 0.4,
      place: (y) => this.brand.position.set(cx, y + logoH / 2),
    });
    if (subSize) {
      rungs.push({
        h: subSize,
        gap: 1,
        place: (y) => this.sub.position.set(cx, y + subSize / 2),
      });
    }
    rungs.push({
      h: bh,
      gap: retry ? this.retryClear(h, retry.h) / gap : 0,
      place: (y) => this.placeButton(cx, y + bh / 2, bw, bh),
    });
    if (retry) {
      rungs.push({
        h: retry.h,
        gap: 0,
        place: (y) => this.placeRetry(cx, y + retry.h / 2, retry.w, retry.h),
      });
    }

    const total = rungs.reduce(
      (sum, r, i) => sum + r.h + (i < rungs.length - 1 ? r.gap * gap : 0),
      0,
    );
    let y = s.y + (h - total) / 2;
    rungs.forEach((r, i) => {
      r.place(y);
      y += r.h + (i < rungs.length - 1 ? r.gap * gap : 0);
    });

    const clear = {
      x: s.x + w * 0.78,
      y: s.cy,
      top: s.y + h * 0.16,
      bottom: s.y + h * 0.84,
      zoom: 1.2,
    };
    this.placeArt(clear, s.x + w * 0.6);
    this.aimBackdrop(clear);
  }

  drawRays() {
    if (!this.rays.visible) return;
    const { w, h } = this.layout;
    const len = Math.max(w, h) * 1.2;
    this.rays.clear();
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * 2 * i) / 16;
      const spread = 0.09;
      this.rays.poly([
        this.focus.x,
        this.focus.y,
        this.focus.x + Math.cos(a - spread) * len,
        this.focus.y + Math.sin(a - spread) * len,
        this.focus.x + Math.cos(a + spread) * len,
        this.focus.y + Math.sin(a + spread) * len,
      ]);
      this.rays.fill({ color: this.defeat ? 0xc43f2a : 0x7b3fc4, alpha: 0.07 });
    }
  }

  settle() {
    this.introducing = false;
    killTweensOf(this);
    this.alpha = 1;
    [this.outcome, this.brand, this.sub, this.button, this.retry].forEach(
      (el) => {
        killTweensOf(el);
        el.alpha = 1;
      },
    );
    if (this.bannerArt) {
      killTweensOf(this.banner);
      killTweensOf(this.banner.scale);
      this.banner.alpha = this.banner.visible ? 1 : 0;
      this.banner.scale.set(this.bannerScale || 1);
    }
    if (this.art) {
      killTweensOf(this.art.scale);
      this.art.scale.set(this.artScale);
    }
  }

  drawPill(bw, bh) {
    const g = this.buttonBg;
    const r = bh * 0.22;
    g.roundRect(-bw / 2, -bh / 2, bw, bh, r);
    g.fill({ color: PLAY_FILL });
    const inset = bh * 0.16;
    g.roundRect(
      -bw / 2 + inset,
      -bh / 2 + inset * 0.5,
      bw - inset * 2,
      bh * 0.34,
      r * 0.6,
    );
    g.fill({ color: 0xff9a5a, alpha: 0.35 });
    g.roundRect(-bw / 2, -bh / 2, bw, bh, r);
    g.stroke({ width: Math.max(2, bh * 0.06), color: PLAY_RIM });
  }

  async show(outcome, stamped) {
    this.defeat = outcome === "defeat";
    sfx.endcard(this.defeat);

    if (!this.bannerArt && !stamped) {
      this.bannerArt = bannerSprite(this.defeat);
      if (this.bannerArt) this.banner.addChild(this.bannerArt);
    }
    this.banner.visible = !!this.bannerArt;
    this.glow.tint = this.defeat ? 0xff4a2a : GEM_COLORS[HEALER];
    this.retry.visible = this.defeat && !!this.onRetry;
    if (this.layout) this.resize(this.layout);

    this.visible = true;
    this.alpha = 0;

    const els = [this.outcome, this.brand, this.sub, this.button, this.retry];
    els.forEach((el) => {
      el.alpha = 0;
    });
    this.banner.alpha = 0;

    this.introducing = true;

    if (this.art) {
      this.artScale = this.art.scale.x;
      this.art.scale.set(this.artScale * 1.06);
      tween(this.art.scale, { x: this.artScale, y: this.artScale }, 1.1, {
        ease: Ease.cubicOut,
      });
    }

    await tween(this, { alpha: 1 }, 0.3);
    if (!this.introducing) return;

    if (this.banner.visible) {
      this.bannerScale = 1;
      this.banner.scale.set(1.16);
      sfx.cardTick(0);
      tween(this.banner, { alpha: 1 }, 0.2);
      tween(this.banner.scale, { x: 1, y: 1 }, 0.5, { ease: Ease.backOut });
      await delay(0.14);
      if (!this.introducing) return;
    }

    if (this.outcome.visible) {
      const oy = this.outcome.y;
      this.outcome.y = oy - 18;
      sfx.cardTick(1);
      tween(this.outcome, { alpha: 1 }, 0.24);
      tween(this.outcome, { y: oy }, 0.36, { ease: Ease.backOut });
    }

    await delay(0.1);
    if (!this.introducing) return;
    const ly = this.brand.y;
    this.brand.y = ly - 26;
    sfx.cardTick(2);
    tween(this.brand, { alpha: 1 }, 0.28);
    tween(this.brand, { y: ly }, 0.42, { ease: Ease.backOut });

    await delay(0.12);
    if (!this.introducing) return;
    if (this.sub.visible) {
      sfx.cardTick(3);
      tween(this.sub, { alpha: 1 }, 0.28);
    }

    await delay(0.35);
    if (!this.introducing) return;
    const by = this.button.y;
    this.button.y = by + 30;
    tween(this.button, { alpha: 1 }, 0.25);
    sfx.cardSnap();
    await tween(this.button, { y: by }, 0.4, { ease: Ease.backOut });
    if (!this.introducing) return;

    if (this.retry.visible) {
      const ry = this.retry.y;
      this.retry.y = ry + 8;
      tween(this.retry, { alpha: 1 }, 0.3);
      sfx.cardBack();
      await tween(this.retry, { y: ry }, 0.34, { ease: Ease.cubicOut });
    }
    this.introducing = false;
  }

  update(dt) {
    if (!this.visible) return;
    this.t += dt;
    const p = 1 + Math.sin(this.t * 3.4) * 0.035;
    this.button.scale.set(p);
    if (!this.rays.visible) return;
    this.rays.rotation += dt * 0.04;
    this.rays.pivot.set(this.focus.x, this.focus.y);
    this.rays.position.set(this.focus.x, this.focus.y);
    this.glow.alpha = 0.35 + Math.sin(this.t * 2.2) * 0.12;
  }
}
