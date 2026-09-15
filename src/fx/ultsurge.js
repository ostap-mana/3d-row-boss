import { Container, Sprite, Text } from "pixi.js";
import {
  COPY,
  FONT,
  FONT_TITLE,
  GEM_COLORS,
  GEM_LIGHT,
  HEROES,
  ULT_SURGE,
} from "../config.js";
import { CROWN_CELL, readyCrownFrames } from "../art/readyfx.js";
import { glowTexture } from "../art/textures.js";
import { lerpColor } from "../core/color.js";
import { Ease, delay, killTweensOf, tween, tweenValue } from "../core/tween.js";
import { fitFont } from "../ui/text.js";

export class UltSurge extends Container {
  constructor() {
    super();
    this.visible = false;
    this.eventMode = "none";

    this.bloom = new Sprite(glowTexture());
    this.bloom.anchor.set(0.5);
    this.bloom.blendMode = "add";
    this.bloom.alpha = 0;
    this.addChild(this.bloom);

    this.streaks = [0, 1].map(() => {
      const hub = new Container();
      hub.scale.set(0, 1);
      const bar = new Sprite(glowTexture());
      bar.anchor.set(0.5);
      bar.blendMode = "add";
      bar.alpha = 0;
      hub.addChild(bar);
      this.addChild(hub);
      return { hub, bar };
    });

    this.words = new Container();
    this.addChild(this.words);

    this.crown = [];
    for (let i = 0; i < ULT_SURGE.crown.licks; i++) {
      const lick = new Sprite();
      lick.anchor.set(0.5, 1);
      lick.blendMode = "add";
      lick.alpha = 0;
      this.words.addChild(lick);
      this.crown.push(lick);
    }

    this.lickSize = this.crown.map(
      (_, i) => 0.8 + 0.28 * (1 + Math.sin(i * 2.399)),
    );

    this.head = new Text({
      text: "",
      style: {
        fontFamily: FONT_TITLE,
        fontSize: 34,
        fontWeight: "900",
        fill: 0xffffff,
        letterSpacing: 2,
        align: "center",
        dropShadow: {
          color: 0x05030a,
          alpha: 0.78,
          blur: 7,
          distance: 0,
          angle: 0,
        },
      },
    });
    this.head.anchor.set(0.5);
    this.words.addChild(this.head);

    this.kicker = new Text({
      text: COPY.ultSurge,
      style: {
        fontFamily: FONT,
        fontSize: 13,
        fontWeight: "800",
        fill: 0xffffff,
        letterSpacing: 4,
        align: "center",
        dropShadow: {
          color: 0x05030a,
          alpha: 0.9,
          blur: 5,
          distance: 0,
          angle: 0,
        },
      },
    });
    this.kicker.anchor.set(0.5);
    this.words.addChild(this.kicker);

    this.layout = null;
    this.element = -1;
    this.frames = null;
    this.token = 0;
    this.headSize = 34;
    this.lickW = 0;
    this.lickH = 0;
    this.home = 0;
  }

  resize(layout) {
    this.layout = layout;
    this.fit();
  }

  fit() {
    const l = this.layout;
    if (!l) return;
    const cfg = ULT_SURGE;
    const box = l.safeBox;

    const shadow = Math.max(5, 7 * l.ui);
    this.head.style.dropShadow.blur = shadow;
    this.kicker.style.dropShadow.blur = shadow * 0.7;

    let width;
    let size;
    let x;
    let floor;
    let ceil;
    if (l.portrait) {
      width = box.w - 24;
      size = Math.max(
        cfg.head.minSize,
        Math.min(box.w * cfg.head.widthShare, cfg.head.maxSize * l.ui),
      );
      x = box.cx;
      floor = l.board.y + (l.board.size - 5 * l.board.cell) / 2;
      ceil = l.board.y - l.board.size * cfg.climb;
    } else {
      const column = l.board.x - box.x;
      width = column * 0.92;
      size = Math.max(
        cfg.head.minSize - 2,
        Math.min(column * 0.17, (cfg.head.maxSize - 8) * l.ui),
      );
      x = l.boss.x;
      floor = 0;
      ceil = l.boss.floor - l.stage.h * 0.13;
    }

    this.head.scale.set(1);
    this.kicker.scale.set(1);
    this.head.style.letterSpacing = size * cfg.head.spacing;
    this.headSize = fitFont(this.head, width, size);

    const kickSize = Math.max(9, this.headSize * cfg.kicker.size);
    this.kicker.style.letterSpacing = kickSize * cfg.kicker.spacing;
    fitFont(this.kicker, width, kickSize);

    const gap = this.headSize * cfg.kicker.gap;
    const stack = this.kicker.height + gap + this.head.height;
    this.kicker.y = -stack / 2 + this.kicker.height / 2;
    this.head.y = stack / 2 - this.head.height / 2;

    this.words.x = x;
    this.home = floor ? Math.max(floor - stack / 2, ceil) : ceil;
    this.words.y = this.home;

    this.lickH = this.head.height * cfg.crown.height;
    this.lickW = this.lickH * CROWN_CELL.aspect * cfg.crown.narrow;
    const foot = this.head.y - this.head.height * (0.5 - cfg.crown.root);
    const reach = this.head.width * cfg.crown.spread;
    const n = this.crown.length;
    this.crown.forEach((lick, i) => {
      lick.x = (n === 1 ? 0 : i / (n - 1) - 0.5) * reach;
      lick.y = foot;
    });

    this.bloom.x = l.w / 2;
    this.bloom.y = this.home;
    this.bloom.setSize(
      l.w * cfg.bloom.wide,
      Math.min(l.w, l.h) * cfg.bloom.tall,
    );

    const lift = stack / 2 + this.headSize * cfg.streak.gap;
    this.streaks.forEach(({ hub, bar }, i) => {
      hub.x = l.w / 2;
      hub.y = this.home + (i ? lift : -lift);
      bar.setSize(l.w * cfg.streak.wide, this.headSize * cfg.streak.thick);
    });
  }

  setHero(index) {
    const hero = HEROES[index];
    if (!hero) return false;
    const element = hero.element;
    this.head.text = COPY.ultReady.replace("{hero}", hero.name);
    this.kicker.style.fill = lerpColor(GEM_LIGHT[element], 0xffffff, 0.55);
    this.bloom.tint = GEM_COLORS[element];
    const hot = lerpColor(GEM_COLORS[element], GEM_LIGHT[element], 0.34);
    this.streaks.forEach(({ bar }) => {
      bar.tint = GEM_LIGHT[element];
    });
    this.crown.forEach((lick) => {
      lick.tint = hot;
    });
    if (element !== this.element) {
      this.element = element;
      this.frames = null;
    }
    this.fit();
    return true;
  }

  burnCrown(t) {
    if (!this.frames) this.frames = readyCrownFrames(this.element);
    const frames = this.frames;
    if (!frames || !frames.length) return;
    const cfg = ULT_SURGE.crown;
    const n = frames.length;
    const count = this.crown.length;
    this.crown.forEach((lick, i) => {
      const step = t * cfg.fps + (i * n) / count;
      lick.texture = frames[Math.floor(((step % n) + n) % n)];
      const k = this.lickSize[i];
      lick.setSize(this.lickW * k, this.lickH * k);
      if (i % 2) lick.scale.x = -lick.scale.x;
    });
  }

  async play(index) {
    if (!this.layout || !this.setHero(index)) return;
    const cfg = ULT_SURGE;
    const token = ++this.token;

    killTweensOf(this.words);
    killTweensOf(this.words.scale);
    killTweensOf(this.bloom);
    this.streaks.forEach(({ hub, bar }) => {
      killTweensOf(bar);
      killTweensOf(hub.scale);
      bar.alpha = cfg.streak.alpha;
      hub.scale.x = 0;
    });
    this.crown.forEach((lick) => {
      killTweensOf(lick);
      lick.alpha = 0;
    });

    this.visible = true;
    this.words.alpha = 0;
    this.words.y = this.home;
    this.words.scale.set(cfg.from);
    this.bloom.alpha = 0;

    const life = cfg.fadeIn + cfg.hold + cfg.fadeOut;
    tweenValue(0, life, life, (t) => {
      if (token === this.token) this.burnCrown(t);
    });

    this.streaks.forEach(({ hub }, i) => {
      tween(hub.scale, { x: 1 }, cfg.streak.open, {
        ease: Ease.expoOut,
        delay: i * 0.05,
      });
    });
    tween(this.bloom, { alpha: cfg.bloom.alpha }, cfg.fadeIn);
    this.crown.forEach((lick) => {
      tween(lick, { alpha: cfg.crown.alpha }, cfg.fadeIn * 1.6);
    });

    await Promise.all([
      tween(this.words, { alpha: 1 }, cfg.fadeIn),
      tween(this.words.scale, { x: 1, y: 1 }, cfg.settle, {
        ease: Ease.backOut,
      }),
    ]);
    if (token !== this.token) return;

    await delay(cfg.hold);
    if (token !== this.token) return;

    await Promise.all([
      tween(
        this.words,
        { alpha: 0, y: this.home - this.headSize * cfg.rise },
        cfg.fadeOut,
      ),
      tween(this.words.scale, { x: 1.08, y: 1.08 }, cfg.fadeOut),
      tween(this.bloom, { alpha: 0 }, cfg.fadeOut),
      ...this.streaks.map(({ hub, bar }) =>
        Promise.all([
          tween(hub.scale, { x: 0.1 }, cfg.fadeOut, { ease: Ease.quadIn }),
          tween(bar, { alpha: 0 }, cfg.fadeOut),
        ]),
      ),
      ...this.crown.map((lick) => tween(lick, { alpha: 0 }, cfg.fadeOut * 0.7)),
    ]);
    if (token !== this.token) return;
    this.visible = false;
  }

  hide(instant) {
    if (!this.visible) return;
    const token = ++this.token;
    killTweensOf(this.words);
    killTweensOf(this.words.scale);
    killTweensOf(this.bloom);
    this.streaks.forEach(({ hub, bar }) => {
      killTweensOf(bar);
      killTweensOf(hub.scale);
    });
    this.crown.forEach((lick) => killTweensOf(lick));

    if (instant) {
      this.visible = false;
      return;
    }
    const out = ULT_SURGE.fadeOut * 0.5;
    tween(this.words, { alpha: 0 }, out);
    tween(this.bloom, { alpha: 0 }, out);
    this.streaks.forEach(({ bar }) => tween(bar, { alpha: 0 }, out));
    this.crown.forEach((lick) => tween(lick, { alpha: 0 }, out));
    delay(out).then(() => {
      if (token === this.token) this.visible = false;
    });
  }
}
