/**
 * End card — the only screen whose job is conversion.
 *
 * It is the key art, made interactive: the painting of the phone with the party
 * bursting out of it fills the screen, the INVOKERS wordmark sits over the top
 * of it, and the PLAY NOW plate and the three store badges sit along the
 * bottom. All of that art is in art/brand.js.
 *
 * The cast used to be six portraits in rings, laid out in a grid over a drawn
 * sunburst. The painting has the cast in it — that is what the painting is —
 * and roundels on top of it covered the exact part of the picture worth
 * showing. So they are gone, and the sunburst behind them with them: both are
 * still drawn, but only on a device that could not decode the painting, where
 * they are the difference between a plain end card and an empty one.
 *
 * Five tap surfaces: the plate, each of the three badges, and the card itself.
 * The badges are the reason the whole-screen listener is registered on the
 * container and every child that wants its own source string stops the event —
 * a tap on the Google badge must be reported as the Google badge, not swallowed
 * by the backdrop behind it.
 *
 * Two orientations, one stack. Held upright it reads top to bottom, with the
 * painting aimed at the gap left in the middle. Held sideways it splits the way
 * the key art itself is composed: the pitch down the left, the picture on the
 * right.
 */

import { Container, Graphics, Sprite, Text, Rectangle } from "pixi.js";
import {
  COPY,
  FONT,
  FONT_TITLE,
  GEM_COLORS,
  GEM_LIGHT,
  HEALER,
} from "../config.js";
import {
  PLAY_FILL,
  PLAY_LABEL,
  PLAY_LABEL_STROKE,
  PLAY_RIM,
  badgeSprites,
  fitKeyArt,
  fitLogo,
  fitPlayPlate,
  keyArtSprite,
  logoSprite,
  playHeight,
  playPlateSprite,
} from "../art/brand.js";
import { glowTexture, gradientTexture } from "../art/textures.js";
import { tween, delay, killTweensOf, Ease } from "../core/tween.js";
import * as sfx from "../audio/sfx.js";
import { fitFont } from "./text.js";

/**
 * The base wash. Under the painting it is the colour the letterbox can never
 * show; without the painting it is the whole backdrop.
 */
const BACKDROP = [
  [0.0, "#0b0618"],
  [0.5, "#1a0c2c"],
  [1.0, "#3a1030"],
];

/**
 * Darkening over the painting, where type has to read against it.
 *
 * The key art is a lit subject on a dark field, and the field is exactly where
 * the wordmark and the CTA go — but "dark" is not "dark enough", and the smoke
 * moves from near-black to a lilac bright enough to swallow a white headline.
 * These are what make that reliable rather than lucky. The side wash is the
 * landscape one, where the pitch runs down the left of the picture instead of
 * across the top and bottom of it.
 */
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

/** Gap between store badges, as a fraction of the row's height. */
const BADGE_GAP = 0.28;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class EndCard extends Container {
  constructor(onCta) {
    super();
    this.visible = false;
    this.onCta = onCta;

    this.bg = new Sprite(gradientTexture("endcard", BACKDROP));
    this.addChild(this.bg);

    this.art = keyArtSprite();
    if (this.art) this.addChild(this.art);

    /**
     * The drawn backdrop, and only ever that.
     *
     * A rotating sunburst under a painting is a cheap effect over an expensive
     * one. With the key art present both of these stay switched off; without it
     * they are the end card's only depth.
     */
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
    // Rotated a quarter turn out of the vertical gradient every other wash is
    // cut from, so the landscape column costs no second texture.
    this.sideScrim.anchor.set(0, 0);
    this.sideScrim.angle = -90;
    this.scrims = [this.topScrim, this.bottomScrim, this.sideScrim];
    this.scrims.forEach((s) => {
      s.visible = !!this.art;
      this.addChild(s);
    });

    /* ------------------------------------------------------------- headline */

    // The outcome, above the wordmark and deliberately smaller than it: the
    // fight is what just happened, the game is what is being sold.
    this.outcome = new Text({
      text: COPY.victory,
      style: {
        fontFamily: FONT,
        fontSize: 20,
        fontWeight: "900",
        fill: 0xffe6a8,
        letterSpacing: 4,
        align: "center",
        stroke: { color: 0x1a0620, width: 5, join: "round" },
      },
    });
    this.outcome.anchor.set(0.5);
    this.addChild(this.outcome);

    /**
     * The wordmark, or the drawn headline standing in for it.
     *
     * Both live in the same container so the stack can place one box and not
     * care which of the two is inside it. The headline is only ever reached by
     * a device that could not decode the WebP, and it carries the same words
     * the wordmark does — see COPY.endTitle.
     */
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
        stroke: { color: 0x1a0620, width: 7, join: "round" },
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
        stroke: { color: 0x140720, width: 3, join: "round" },
      },
    });
    this.sub.anchor.set(0.5);
    this.addChild(this.sub);

    /* ----------------------------------------------------------------- cta */

    this.button = new Container();
    /**
     * The painted gem plate — see art/brand.js — over the drawn pill the card
     * shipped with. The pill is still underneath and still drawn whenever the
     * art fails to decode, which is the only case it is reached in.
     */
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
        stroke: { color: PLAY_LABEL_STROKE, width: 4, join: "round" },
      },
    });
    this.buttonText.anchor.set(0.5);
    // The plate has PLAY NOW painted into it. The label is the stand-in's label.
    this.buttonText.visible = !this.plate;
    this.button.addChild(this.buttonText);
    this.addChild(this.button);

    this.badges = new Container();
    this.badgeRow = badgeSprites();
    this.badgeRow.forEach((badge) => {
      badge.sprite.eventMode = "static";
      badge.sprite.cursor = "pointer";
      badge.sprite.on("pointertap", (e) => {
        e.stopPropagation();
        this.onCta(badge.id);
      });
      this.badges.addChild(badge.sprite);
    });
    this.addChild(this.badges);

    // Whole-screen tap target, registered last so it sits on top.
    this.eventMode = "static";
    this.cursor = "pointer";
    this.on("pointertap", () => this.onCta("endcard"));

    this.t = 0;
    this.layout = null;
    this.focus = { x: 0, y: 0 };
    /** True only while the card is flying itself in. See settle(). */
    this.introducing = false;
  }

  /* ------------------------------------------------------------------ fits */

  /**
   * Size the wordmark — or the headline standing in for it — into `maxW`, and
   * report the height it took. The stack places the box this returns; it never
   * asks which of the two is in it.
   */
  fitBrand(maxW, ideal) {
    if (this.logo) return fitLogo(this.logo, maxW);
    this.title.style.stroke = {
      color: 0x1a0620,
      width: Math.max(4, ideal * 0.14),
      join: "round",
    };
    fitFont(this.title, maxW, ideal);
    return this.title.height;
  }

  /**
   * Size the CTA to `bw` and report its height.
   *
   * The height is the plate's aspect either way, including when the plate is
   * missing — the drawn pill is cut to the same shape so that a device which
   * fell back to it gets the same layout, not a second one.
   */
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

  /**
   * Lay the store badges out in a row centred on the container's origin.
   *
   * They are sized by height and never by width: all three arrive 61 pixels
   * tall out of the packer, so one height puts them on the same baseline with
   * their type at the same size, which is the whole reason that row reads as a
   * row. The height is whatever fits `maxW`, capped at `maxH`.
   *
   * @returns {{w: number, h: number}} the box the row ended up occupying
   */
  layoutBadges(maxW, maxH) {
    const row = this.badgeRow;
    if (!row.length) return { w: 0, h: 0 };

    const aspect = row.reduce((sum, b) => sum + b.aspect, 0);
    const units = aspect + BADGE_GAP * (row.length - 1);
    const h = Math.min(maxH, maxW / units);
    const w = h * units;

    let x = -w / 2;
    row.forEach((badge) => {
      const bw = h * badge.aspect;
      badge.sprite.setSize(bw, h);
      badge.sprite.position.set(x + bw / 2, 0);
      x += bw + h * BADGE_GAP;
    });
    return { w, h };
  }

  /** Sit the CTA at `x, y` and hand it its own tap source. */
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

  /**
   * Aim the painting at `fx, fy` and wash the bands the type sits in.
   *
   * `clear` is the band of screen the stack left empty — the picture is aimed
   * at the middle of it, so the phone and the figures land in the hole rather
   * than under the wordmark.
   */
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
      // Anchored top-left and turned a quarter turn anticlockwise: its own
      // width runs up the screen and its own height runs across it, so the
      // gradient starts opaque at x = 0 and clears by x = side.
      this.sideScrim.position.set(0, h);
      this.sideScrim.setSize(h, side);
    }
  }

  /**
   * Point the drawn backdrop at the hole the stack left, and size the glow to
   * it. Only ever reached when the painting is missing — with it there, this is
   * where the picture goes instead.
   */
  aimBackdrop(clear) {
    this.focus = { x: clear.x, y: clear.y };
    this.glow.setSize(
      Math.max(40, this.layout.w * 0.9),
      Math.max(40, (clear.bottom - clear.top) * 1.2),
    );
    this.glow.position.set(this.focus.x, this.focus.y);
  }

  /* ---------------------------------------------------------------- layout */

  resize(layout) {
    this.layout = layout;
    const { w, h } = layout;

    this.bg.setSize(w, h);
    this.hitArea = new Rectangle(0, 0, w, h);

    if (layout.portrait) this.stackPortrait(layout);
    else this.stackLandscape(layout);

    this.drawRays();

    // The stack just moved. Anything still flying towards where it used to be
    // has to be told, or it will spend the next half second putting it back.
    if (this.introducing) this.settle();
  }

  /**
   * Held upright: one column, solved from both ends.
   *
   * The CTA and the store row are placed against the bottom of the screen
   * first and the headline against the top, because those are the two things
   * that must not move. Everything between them is the picture's.
   */
  /**
   * Fit a line of the stack, or take it out of the stack entirely.
   *
   * Returns the height the stack should budget for it: the fitted font size when
   * the line is there, and nothing when it is not. `fitFont` on a hidden Text
   * would hand back a real size for text nobody can see, and every rung below it
   * would be placed around the hole — which is how the defeat card came out with
   * a wordmark floating a headline's worth of air below the top of the screen.
   */
  fitLine(text, avail, size) {
    return text.visible ? fitFont(text, avail, size) : 0;
  }

  stackPortrait(layout) {
    const { w, h, ui } = layout;
    const pad = h * 0.045;

    const badge = this.layoutBadges(Math.min(w * 0.94, 520 * ui), 34 * ui);
    const badgeY = h - pad - badge.h / 2;
    this.badges.position.set(w / 2, badgeY);

    const bw = Math.min(w * 0.82, 430 * ui);
    const bh = this.fitPlay(bw);
    const buttonY = badgeY - badge.h / 2 - Math.max(10, h * 0.024) - bh / 2;
    this.placeButton(w / 2, buttonY, bw, bh);

    const outSize = this.fitLine(
      this.outcome,
      w * 0.86,
      clamp(w * 0.045, 11, 22 * ui),
    );
    if (outSize) this.outcome.position.set(w / 2, h * 0.05 + outSize * 0.7);

    const logoH = this.fitBrand(
      Math.min(w * 0.86, 460 * ui),
      clamp(w * 0.1, 22, 56 * ui),
    );
    // Off the outcome line when there is one, off the top of the screen when
    // there is not — a shade lower than the headline used to start, so the
    // wordmark reads as the top of the card rather than as something that has
    // slid up into the space above it.
    const brandTop = outSize ? this.outcome.y + outSize * 0.8 : h * 0.07;
    this.brand.position.set(w / 2, brandTop + logoH / 2);

    const subSize = this.fitLine(
      this.sub,
      w * 0.86,
      clamp(w * 0.042, 10, 20 * ui),
    );
    if (subSize) {
      this.sub.position.set(w / 2, this.brand.y + logoH / 2 + subSize * 1.2);
    }

    // Where the painting is allowed to start: under whichever of the two is
    // actually the bottom of the type.
    const top = subSize ? this.sub.y + subSize * 0.8 : this.brand.y + logoH / 2;
    const bottom = buttonY - bh / 2 - h * 0.02;
    const clear = {
      x: w / 2,
      y: (top + bottom) / 2,
      top: top + h * 0.05,
      bottom,
    };
    this.placeArt(clear, 0);
    this.aimBackdrop(clear);
  }

  /**
   * Held sideways: the pitch down the left, the picture on the right.
   *
   * The same split the key art is composed on, and the only one that works —
   * stacking a wordmark, a plate and a store row down 375 points of height and
   * still leaving room for the picture leaves every one of them too small.
   */
  stackLandscape(layout) {
    const { w, h, ui } = layout;
    const colW = w * 0.5;
    const cx = w * 0.26;
    const gap = Math.max(8, h * 0.03);

    // Every rung is measured before any of them is placed: the column is
    // centred on the screen as one block, so its height has to be known first.
    const badge = this.layoutBadges(Math.min(colW * 0.94, 460 * ui), 30 * ui);
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

    /**
     * The rungs that are actually on the card, in order, each with the gap it
     * wants under it.
     *
     * Built as a list rather than placed one after another in a straight line of
     * statements, because two of the five are optional now and the height of the
     * block has to be known before any of it is placed — the column is centred
     * on the screen as one thing. The gap total was the literal 2.8, which is
     * the four transitions between five rungs; with a rung missing that was a
     * gap the column reserved and never used.
     */
    const rungs = [];
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
      gap: 0.9,
      place: (y) => this.placeButton(cx, y + bh / 2, bw, bh),
    });
    rungs.push({
      h: badge.h,
      gap: 0,
      place: (y) => this.badges.position.set(cx, y + badge.h / 2),
    });

    // Every rung's height, plus every gap except the one under the last.
    const total = rungs.reduce(
      (sum, r, i) => sum + r.h + (i < rungs.length - 1 ? r.gap * gap : 0),
      0,
    );
    let y = (h - total) / 2;
    rungs.forEach((r, i) => {
      r.place(y);
      y += r.h + (i < rungs.length - 1 ? r.gap * gap : 0);
    });

    // The picture is aimed into the right-hand half and the left is washed down
    // under the column. The top and bottom washes stay on, softened: they are
    // what stops the painting running flat into the edges of the screen.
    //
    // The zoom is what lets that aim land. Held sideways the painting is almost
    // exactly the shape of the screen, so a plain cover fit pins it dead centre
    // and drops the phone straight through the CTA; a fifth of overscan buys
    // enough slack to push the whole composition clear of the column.
    const clear = {
      x: w * 0.78,
      y: h * 0.5,
      top: h * 0.16,
      bottom: h * 0.84,
      zoom: 1.2,
    };
    this.placeArt(clear, w * 0.6);
    this.aimBackdrop(clear);
  }

  /**
   * Sunburst behind the cast, struck from wherever the cast ended up.
   * Nothing to draw when the painting is there — see the constructor.
   */
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

  /**
   * Cut the intro short and leave the card standing on the layout just solved.
   *
   * The card arrives by tweening `y` on half the things in it, and a tween
   * holds the value it was built with. Rotate the phone in the second and a
   * half that takes and the pieces whose tween had already landed move to the
   * new stack while the pieces still in flight are dragged back to the old one
   * — which put the plate across the middle of the picture, over a screen that
   * had been assembled out of two different layouts.
   *
   * So a rotation ends the flourish. A card that simply appears is worth far
   * more than one that animates itself into the wrong shape.
   */
  settle() {
    this.introducing = false;
    killTweensOf(this);
    this.alpha = 1;
    [this.outcome, this.brand, this.sub, this.button, this.badges].forEach(
      (el) => {
        killTweensOf(el);
        el.alpha = 1;
      },
    );
    if (this.art) {
      killTweensOf(this.art.scale);
      this.art.scale.set(this.artScale);
    }
  }

  /**
   * The drawn stand-in, in the plate's own colours.
   *
   * Only reached when the art failed to decode — a device that cannot read the
   * plate's bitmap still gets a button, and it is the one surface in the whole
   * creative that absolutely has to be there.
   */
  drawPill(bw, bh) {
    const g = this.buttonBg;
    const r = bh * 0.22;
    g.roundRect(-bw / 2, -bh / 2, bw, bh, r);
    g.fill({ color: PLAY_FILL });
    // Inset so the gloss follows the plate instead of poking out of its corners.
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

  /* ------------------------------------------------------------------- run */

  /**
   * @param {"victory"|"defeat"} outcome the fight can be lost now, and the
   *   card has to say so — a "COLLECT YOUR HEROES" screen over a party wipe
   *   reads as a bug, and a losing player is the one most worth re-pitching.
   *
   * Only the outcome line and the promise under the wordmark change. The
   * painting, the plate and the badges do not: the pitch is the same pitch
   * whether the golem died or the party did.
   */
  async show(outcome) {
    this.defeat = outcome === "defeat";
    sfx.endcard(this.defeat);

    /**
     * The outcome line and the promise under the wordmark are a win's, and only
     * a win's. On a loss they are not rewritten, they are absent: see COPY,
     * where the two keys that used to carry them have gone.
     *
     * `visible` rather than an empty string, because the stack has to close up
     * behind them. A Text with no text still measures its own font, so every
     * rung under it would be spaced around a gap with nothing in it. See
     * fitLine.
     */
    this.outcome.visible = !this.defeat;
    this.sub.visible = !this.defeat;
    if (!this.defeat) {
      this.outcome.text = COPY.victory;
      this.outcome.style.fill = 0xffe6a8;
      this.sub.text = COPY.endSub;
      this.sub.style.fill = GEM_LIGHT[HEALER];
    }
    // The one thing the card still colours off the result, and it is a wash
    // behind the painting rather than a sentence about it.
    this.glow.tint = this.defeat ? 0xff4a2a : GEM_COLORS[HEALER];
    // Re-solve the stack: every line here is fitted to the screen width, and
    // the defeat copy is a different length from the victory copy.
    if (this.layout) this.resize(this.layout);

    this.visible = true;
    this.alpha = 0;

    const els = [this.outcome, this.brand, this.sub, this.button, this.badges];
    els.forEach((el) => {
      el.alpha = 0;
    });

    // Every await below is followed by the same question, because a rotation
    // anywhere in here hands the whole card to settle() and there is nothing
    // left for this sequence to animate.
    this.introducing = true;

    // The painting pushes in fractionally under the type. Scale and not
    // position, because it is already cover-fitted to the screen and there is
    // no direction it could slide without showing an edge.
    if (this.art) {
      this.artScale = this.art.scale.x;
      this.art.scale.set(this.artScale * 1.06);
      tween(this.art.scale, { x: this.artScale, y: this.artScale }, 1.1, {
        ease: Ease.cubicOut,
      });
    }

    await tween(this, { alpha: 1 }, 0.3);
    if (!this.introducing) return;

    if (this.outcome.visible) {
      const oy = this.outcome.y;
      this.outcome.y = oy - 18;
      tween(this.outcome, { alpha: 1 }, 0.24);
      tween(this.outcome, { y: oy }, 0.36, { ease: Ease.backOut });
    }

    await delay(0.1);
    if (!this.introducing) return;
    const ly = this.brand.y;
    this.brand.y = ly - 26;
    tween(this.brand, { alpha: 1 }, 0.28);
    tween(this.brand, { y: ly }, 0.42, { ease: Ease.backOut });

    await delay(0.12);
    if (!this.introducing) return;
    if (this.sub.visible) tween(this.sub, { alpha: 1 }, 0.28);

    await delay(0.35);
    if (!this.introducing) return;
    const by = this.button.y;
    this.button.y = by + 30;
    tween(this.button, { alpha: 1 }, 0.25);
    await tween(this.button, { y: by }, 0.4, { ease: Ease.backOut });
    if (!this.introducing) return;

    // The badges last, and quietly: they are the reassurance under the CTA, not
    // a second thing competing with it for the tap.
    const gy = this.badges.y;
    this.badges.y = gy + 14;
    tween(this.badges, { alpha: 1 }, 0.3);
    await tween(this.badges, { y: gy }, 0.34, { ease: Ease.cubicOut });
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
