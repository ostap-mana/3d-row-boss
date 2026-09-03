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
  bannerHeight,
  bannerSprite,
  fitBanner,
  fitKeyArt,
  fitLogo,
  fitPlayPlate,
  fitRetryLine,
  keyArtSprite,
  logoSprite,
  playHeight,
  playPlateSprite,
  retryLineSprite,
  DEFEAT_ART,
  VICTORY_ART,
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

/**
 * The RETRY divider, measured off the store row it now sits under.
 *
 * Off the badges and not off the PLAY NOW plate, because it is no longer a
 * second button in the plate's column — it is a rule drawn under the bottom of
 * the card, and the bottom of the card is the store row. See RETRY_LINE_ART.
 * Measuring it against the row keeps the rule and the badges locked to each
 * other on every shape the card is solved for; a fraction of the card width
 * would drift apart between a phone and a tablet held sideways.
 *
 * A hair wider than the row rather than flush with it, which is what 1.12 buys.
 * A rule that stops exactly where the badges stop reads as an underline on the
 * third badge; carried a little past both ends it reads as the line the card
 * finishes on. It is clamped to the column either way, so on a screen where the
 * row is already at its cap the rule simply matches it.
 *
 * RETRY_PILL_W and RETRY_H only reach the drawn fallback, which is still a
 * capsule measured off the plate — two thirds of it, as it was before there was
 * any art here at all: a dark pill at the plate's own width beside a painted gem
 * lockup is not a second button, it is the first one with a shadow. The painted
 * path takes its height from its own aspect instead. See fitRetry, which is
 * where the two part.
 */
const RETRY_W = 1.12;
const RETRY_PILL_W = 0.64;
const RETRY_H = 0.56;

/**
 * The retry button's own colours — drawn, not painted.
 *
 * Every other surface on this card is a bitmap out of the packer, and this one
 * deliberately is not: a second painted plate would read as a second offer.
 * A dark pill in the plate's own gold takes the shape of a button without taking
 * the plate's presence, which is the difference between a button beside the CTA
 * and a button competing with it. See PLAY_RIM, which it borrows so the two
 * belong to the same card.
 */
const RETRY_FILL = 0x1a0c2c;
const RETRY_LABEL = 0xffe6a8;

/**
 * How much of the card's width the outcome banner takes, and the most of the
 * picture's hole it is allowed to fill.
 *
 * 0.82 rather than the full width because the banner's own art already carries
 * mist and petals out past the plaque, and a bitmap run edge to edge puts that
 * mist off the side of the screen — which reads as a banner that did not fit
 * rather than as light coming off one.
 *
 * The cap is what makes it safe on a phone held sideways. There the hole the
 * stack leaves is wide and shallow, and 82% of a landscape width is a banner
 * deeper than the hole is: it would cover the painting, the golem and the whole
 * reason the card has a picture on it. Capped at four tenths of the hole, the
 * banner announces the result and the end card still sells the game underneath
 * it.
 *
 * Both share the pair. The two paintings are different shapes — see VICTORY_ART
 * and DEFEAT_ART — but the hole they go in is the same hole, and a defeat plaque
 * given a width of its own would be the only thing on the card that moves when
 * the result changes.
 */
const BANNER_WIDTH = 0.82;
const BANNER_MAX_ROOM = 0.5;

/**
 * How much of the room either side of the banner's centre it may actually use.
 *
 * The banner is centred on `clear.x`, and held sideways that is 78% of the way
 * across the card — the picture's own side of the split, not the middle of the
 * screen. So the widest a *centred* box can be there is twice the gap to the
 * nearer edge, and 0.82 of the card's width is nearly double that: the banner
 * would hang a third of itself off the right of the screen. This is the share of
 * that true available width it takes, leaving a hair of margin so the mist in the
 * art has somewhere to end.
 */
const BANNER_FILL = 0.94;

/**
 * The banner's box when it is a rung of the column rather than a stamp on the
 * picture — which held sideways is now the only thing it is. See stackLandscape.
 *
 * Two numbers because the art has one aspect and the card has two constraints,
 * and either one can be the binding one. BANNER_COL is the share of the column
 * it may span; BANNER_COL_ROOM caps the height at a share of the stage, and on
 * every landscape shape this creative runs on the cap is what actually decides,
 * because a banner 90% of a half-width column wide is a third of the screen
 * deep.
 *
 * 0.26 is set against the wordmark under it rather than against the screen: it
 * lands the plaque a little narrower than INVOKERS is wide, which is the order
 * the card is selling in — the result is what just happened, the game is what is
 * being sold, and the game's name stays the widest thing on the card.
 */
const BANNER_COL = 0.9;
const BANNER_COL_ROOM = 0.3;

/**
 * The banner's cap on the one card that has a fifth rung in the column: the
 * defeat card, which carries the retry button under its plate.
 *
 * A phone held sideways is the tightest box the creative is solved in — 375
 * points of height on the reference device — and the landscape column was
 * already spending nearly all of it on four rungs. Adding a button to it
 * overflows: the block is centred, so an overflow is not a scroll, it is a
 * banner clipped at the top of the screen and a store row clipped at the bottom.
 *
 * The banner pays for it because the banner is the rung with the slack. It is
 * the only one sized by a share of the stage rather than by its own content, and
 * a DEFEAT plaque at a fifth of the height is still the biggest thing in the
 * column and still lands as a stamp. The wordmark, the plate and the badges have
 * no give: two of them are the pitch and the third is the button.
 *
 * Only the landscape column needs this. Upright, the retry button is measured up
 * from the bottom of the screen with the rest of the CTA block, and what it
 * takes comes out of the picture's hole — which has it to give.
 */
const BANNER_COL_ROOM_RETRY = 0.2;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class EndCard extends Container {
  /**
   * @param {(source: string) => void} onCta where every tap on this card goes.
   * @param {() => void} [onRetry] play it again — see `retry` below. Optional,
   *   and the button is not built into the card when it is missing: a RETRY that
   *   does nothing is worse than no RETRY at all.
   */
  constructor(onCta, onRetry) {
    super();
    this.visible = false;
    this.onCta = onCta;
    this.onRetry = onRetry || null;

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

    /**
     * The outcome banner — VICTORY on a win, DEFEAT on a wipe.
     *
     * On the second plane, and that is the whole placement decision. It goes in
     * above the painting and the two washes over it, so it is read against a
     * darkened backdrop rather than against whatever the key art happens to have
     * behind it, and *under* everything the card is selling with — the wordmark,
     * the promise, the plate, the badges — all of which are added after it and
     * therefore draw over it.
     *
     * It is also placed off the stack rather than in it: `placeBanner` lays it
     * in `clear`, the hole the stack leaves for the picture, so it can never
     * collide with a rung. That is what lets a banner this big go on a card whose
     * layout was solved without it — see stackPortrait, which is intricate and
     * which this does not touch.
     *
     * Absent only if the bitmap never decoded. Which of the two paintings goes
     * in is not known here — the card is built long before the fight ends — so
     * the box is made now, at the depth it has to be at, and `show` fills it
     * once there is a result to fill it with.
     *
     * A Container around the bitmap, and not the bitmap itself, because the
     * intro stamps it in on `scale`. In Pixi a Sprite's width *is* its scale, so
     * a sprite fitted by `setSize` and then given a scale has the fit thrown
     * away — and one given a scale and then re-fitted on the next rotation snaps
     * to full size mid-flourish. The wrapper separates the two: `placeBanner`
     * sizes the art inside it, the intro scales the box around it, and neither
     * can undo the other.
     */
    this.bannerArt = null;
    this.banner = new Container();
    this.banner.alpha = 0;
    this.banner.visible = false;
    this.addChild(this.banner);

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
    // Off, and never turned on — see `show`. The Text stays because the stack
    // solver counts it; `fitLine` reads `visible` and gives back nothing for a
    // line that is not there, so the rungs under it close up rather than being
    // spaced around a hole.
    this.outcome.visible = false;
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
    // Off with the outcome line above it, and for the same reason.
    this.sub.visible = false;
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

    /* --------------------------------------------------------------- retry */

    /**
     * RETRY, and only ever on a wipe.
     *
     * At the very bottom of the card on both layouts — under the store row,
     * which is itself under the plate. The order on this card is the pitch
     * first and the rematch last, and a control above the CTA is the first thing
     * a thumb reaches on a phone.
     *
     * It sat directly under the plate for as long as it was a plate itself, and
     * moving it below the badges is the same decision as changing the art: a
     * button in the CTA's own column is part of the offer, and a rule ruled
     * across the foot of the card is the way out of it. Nothing above it moves
     * — the stack is still solved from the bottom edge, and this is now the rung
     * that edge holds. See stackPortrait.
     *
     * Built here and hidden, the way the outcome line and the promise are —
     * `show` is the first moment the result is known, and the stack reads
     * `visible` to decide whether there is a rung there at all. See fitLine,
     * which is the same rule for the two Texts.
     *
     * It is also the one hole in the card's whole-screen tap target. Every other
     * pixel of this screen is a store click — see the listener at the end of the
     * constructor — and this stops the event so a tap asking for another fight
     * is not answered with the App Store. That hole is the cost of the feature,
     * and putting it at the foot of the card is what keeps it cheap: it is the
     * one band of this screen a thumb reaching for the pitch never crosses.
     */
    this.retry = new Container();
    this.retryBg = new Graphics();
    this.retry.addChild(this.retryBg);

    /**
     * The painted divider, when it decoded — see art/brand.js.
     *
     * Added over the drawn pill and under the type, which is the same order the
     * CTA button above uses and for the same reason: exactly one of the two is
     * ever drawn, and which one is decided once in fitRetry rather than checked
     * everywhere. With the ornament there the pill is left empty and the word is
     * already in the art; without it, the pill and the word are the button.
     */
    this.retryArt = retryLineSprite();
    if (this.retryArt) this.retry.addChild(this.retryArt);
    this.retryText = new Text({
      text: COPY.retry,
      style: {
        fontFamily: FONT,
        fontSize: 20,
        fontWeight: "900",
        fill: RETRY_LABEL,
        letterSpacing: 2.4,
        stroke: { color: 0x140720, width: 3, join: "round" },
      },
    });
    this.retryText.anchor.set(0.5);
    // Painted plates carry their own word. The Text stays built either way so
    // that a device which could not decode the bitmap still has a button with
    // RETRY on it — see COPY.retry, which exists for exactly that reader.
    this.retryText.visible = !this.retryArt;
    this.retry.addChild(this.retryText);
    this.retry.visible = false;
    this.addChild(this.retry);

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
   * Size the retry control and report the box it took.
   *
   * Two widths in, because the two paths are measured off two different things
   * and always were: `w` is what the painted rule spans — the store row's width
   * carried a little past both ends, see RETRY_W — and `bw`/`bh` are the CTA
   * plate's box, which is all the drawn pill has ever been sized against. Both
   * callers have both numbers by the time they get here: portrait lays the
   * badges and the plate out before it solves the foot of the column, and
   * landscape measures every rung before it places any of them.
   *
   * @returns {{w: number, h: number}}
   */
  fitRetry(w, bw, bh) {
    this.retryBg.clear();

    // Painted, the height is the art's and not the card's. RETRY_H is the drawn
    // pill's own proportion — a flat capsule at about 3:1 — and the ornament is
    // a rule at 12.05; asked for the pill's box it would come out four times
    // too deep, with the gems at each end stretched into eggs. So width is what
    // the card decides and height is what the art answers, which is how every
    // other piece of brand art on this screen is sized.
    if (this.retryArt) {
      const h = fitRetryLine(this.retryArt, w);
      return { w, h };
    }

    const pw = bw * RETRY_PILL_W;
    const ph = bh * RETRY_H;
    this.drawRetry(pw, ph);
    fitFont(this.retryText, pw * 0.72, Math.max(12, ph * 0.4));
    return { w: pw, h: ph };
  }

  /**
   * The pill itself: the card's own backdrop colour, rimmed in the plate's gold.
   *
   * A fill and not a hollow outline. The card behind it is a painting, and an
   * outline over a painting is a word with a lit golem showing through the
   * middle of it — legible on the shot it was designed against and nowhere else.
   */
  drawRetry(w, h) {
    const g = this.retryBg;
    g.clear();
    const r = h * 0.42;
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.fill({ color: RETRY_FILL, alpha: 0.86 });
    g.roundRect(-w / 2, -h / 2, w, h, r);
    g.stroke({ width: Math.max(1.5, h * 0.06), color: PLAY_RIM, alpha: 0.9 });
  }

  /**
   * Sit the retry button at `x, y` and give it the one listener on this card
   * that does not lead to a store.
   *
   * `stopPropagation` for the same reason the badges have it and for a much
   * louder one: the container behind this is a full-screen CTA, so without it
   * every tap on RETRY would open the store *and* restart the fight.
   *
   * The target is deeper than the art, and that is the price of drawing this as
   * a rule. The ornament is about a tenth as tall as it is wide — on a phone it
   * stands eight or nine points deep — and a strip that thin is a control only a
   * mouse can hit. So the box is grown around it to a thumb's worth of height,
   * centred on the rule, and never narrower than the 44 points a touch target
   * has to be. It stays inside the card's bottom margin: this is the last rung,
   * and the padding it takes comes out of the gap under the store row.
   */
  placeRetry(x, y, w, h) {
    const hitH = Math.max(h * 1.3, 44);
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
      Math.max(40, this.layout.stage.w * 0.9),
      Math.max(40, (clear.bottom - clear.top) * 1.2),
    );
    this.glow.position.set(this.focus.x, this.focus.y);
  }

  /**
   * Size the banner into a box and hand back the height it took.
   *
   * Split out of placeBanner because the column needs the height *before* it
   * knows where anything goes — the block is centred as one thing, so every
   * rung is measured first and placed second. See stackLandscape, and fitPlay
   * and fitBrand, which are the same shape of function for the same reason.
   *
   * Width first and height as the cap, which is the same order placeBanner
   * uses: width is the one dimension a card of any shape can offer a painted
   * bitmap, and the cap is what stops the plaque from eating the column.
   */
  sizeBanner(maxW, maxH) {
    if (!this.bannerArt) return 0;
    let bw = maxW;
    let bh = bannerHeight(this.defeat, bw);
    if (maxH > 0 && bh > maxH) {
      bh = maxH;
      // Back to a width through the aspect of whichever painting is up — the
      // two are not the same shape.
      const art = this.defeat ? DEFEAT_ART : VICTORY_ART;
      bw = (bh * art.w) / art.h;
    }
    fitBanner(this.bannerArt, this.defeat, bw);
    return bh;
  }

  /**
   * Lay the banner in the hole the stack left for the picture.
   *
   * Width first, because the banner is a painted bitmap at a fixed aspect and
   * width is the one dimension a card of any shape can offer it — the height
   * follows, the way every other piece of brand art on this card works.
   *
   * Then clamped by the height of `clear`, which is what stops it from covering
   * the picture it is supposed to sit in front of: on a phone held sideways the
   * hole is wide and shallow, and a banner sized purely by width would fill it
   * top to bottom and there would be no end card left behind the win.
   *
   * Placed against the *top* of the hole rather than its middle. The painting's
   * own subject sits low and central, and the banner is an announcement over it,
   * not a label across it.
   */
  placeBanner(clear) {
    if (!this.bannerArt) return;
    const { w } = this.layout;

    const room = Math.max(0, clear.bottom - clear.top);
    // The widest centred box that fits either side of where it is centred — see
    // BANNER_FILL. Portrait this is the whole card and the fraction below wins;
    // landscape it is the picture's own column and this wins.
    const reach = 2 * Math.min(clear.x, w - clear.x) * BANNER_FILL;
    let bw = Math.min(w * BANNER_WIDTH, reach);
    let bh = bannerHeight(this.defeat, bw);
    const cap = room * BANNER_MAX_ROOM;
    if (bh > cap && cap > 0) {
      bh = cap;
      // Back to a width through the aspect of whichever painting is up: the two
      // are not the same shape, and the cap is the one place a height is the
      // number that was decided.
      const art = this.defeat ? DEFEAT_ART : VICTORY_ART;
      bw = (bh * art.w) / art.h;
    }

    fitBanner(this.bannerArt, this.defeat, bw);
    this.banner.position.set(clear.x, clear.top + bh * 0.5 + room * 0.04);
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
    const { ui } = layout;
    /**
     * The column keeps to the safe box; the painting behind it does not.
     *
     * See core/layout.js. The card is the one screen in the creative that is
     * genuinely full-bleed — the key art fills whatever it is given — but the
     * type and the CTA on top of it are a stack, and a stack solved off a
     * desktop window is a wordmark stretched across a metre of monitor with a
     * store row a foot below it. So the picture gets the window and the stack
     * gets the same box the fight was played in, less the cutouts.
     *
     * The cutouts are the half that was missing, and this column is where they
     * cost the most in the creative. Every rung down here is a fraction of `h`
     * measured from one end of the box or the other — the outcome line a
     * twentieth from the top, the badges a pad up from the bottom — so on a
     * notched phone the verdict was set under the camera and the store row
     * under the home indicator, with the RETRY rule, which is a tap target,
     * sitting on the gesture bar that swipes the browser away. Solved in the
     * safe box every one of those fractions means what it says.
     */
    const s = layout.safeBox;
    const { w, h } = s;
    const pad = h * 0.045;

    const badge = this.layoutBadges(Math.min(w * 0.94, 520 * ui), 34 * ui);
    const bw = Math.min(w * 0.82, 430 * ui);
    const bh = this.fitPlay(bw);

    /**
     * The foot of the column, solved upward from the bottom edge.
     *
     * `foot` is the running underside: the bottom margin on a win, and on a
     * wipe the underside of the RETRY rule, which is the rung that now holds
     * that edge. Written as one running number rather than as two branches so
     * the badges and the CTA above them are each placed by one line whichever
     * card is up — the bottom of this column is the one edge that must not move,
     * and everything down here is measured up from it.
     *
     * The rule is clamped to the same width the store row was allowed, so on a
     * narrow phone where the badges are already spanning the card the two come
     * out flush instead of the rule hanging off the sides.
     */
    let foot = s.bottom - pad;
    if (this.retry.visible) {
      const r = this.fitRetry(Math.min(badge.w * RETRY_W, w * 0.94), bw, bh);
      const ry = foot - r.h / 2;
      this.placeRetry(s.cx, ry, r.w, r.h);
      foot = ry - r.h / 2 - Math.max(12, h * 0.03);
    }

    const badgeY = foot - badge.h / 2;
    this.badges.position.set(s.cx, badgeY);

    const buttonY = badgeY - badge.h / 2 - Math.max(10, h * 0.024) - bh / 2;
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
      Math.min(w * 0.86, 460 * ui),
      clamp(w * 0.1, 22, 56 * ui),
    );
    // Off the outcome line when there is one, off the top of the screen when
    // there is not — a shade lower than the headline used to start, so the
    // wordmark reads as the top of the card rather than as something that has
    // slid up into the space above it.
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

    // Where the painting is allowed to start: under whichever of the two is
    // actually the bottom of the type.
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

  /**
   * Held sideways: the pitch down the left, the picture on the right.
   *
   * The same split the key art is composed on, and the only one that works —
   * stacking a wordmark, a plate and a store row down 375 points of height and
   * still leaving room for the picture leaves every one of them too small.
   */
  stackLandscape(layout) {
    const { ui } = layout;
    // The same split as upright, on the same box — see stackPortrait. Sideways
    // the box matters for a different edge: the cutout is on a long side here,
    // so it is the pitch column's own left edge that the notch was standing in.
    const s = layout.safeBox;
    const { w, h } = s;
    const colW = w * 0.5;
    const cx = s.x + w * 0.26;
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
    // Measured here with the rest of the column and placed below as a rung of
    // it — one more optional rung, on exactly the terms the other two are on.
    // Off the badge row's width, clamped to the column, exactly as upright.
    const retry = this.retry.visible
      ? this.fitRetry(Math.min(badge.w * RETRY_W, colW * 0.94), bw, bh)
      : null;
    const bannerH = this.sizeBanner(
      Math.min(colW * BANNER_COL, 520 * ui),
      h * (retry ? BANNER_COL_ROOM_RETRY : BANNER_COL_ROOM),
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
    /**
     * The banner, at the top of the column — over the wordmark rather than over
     * the picture.
     *
     * It is a rung here and a free-standing stamp in portrait, and that is the
     * shape of the two layouts rather than an inconsistency. Upright, the column
     * is the whole width and the picture's hole is a wide band under it with
     * nothing else in it, so the banner has that band to itself. Held sideways
     * there is no such band: the picture is a *column* beside the pitch, filled
     * top to bottom with the phone and the four figures bursting out of it, and
     * a plaque laid across the middle of that covered the one thing the card has
     * a picture for.
     *
     * A rung and not a hand-placed sprite above the block, because the block is
     * centred on the screen as one thing. Measured in with the rest of it, the
     * column re-centres around the banner and the banner can never land on the
     * wordmark — which a free y coordinate at the top of the stage would do on
     * the first short window it met.
     */
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
      gap: 0.9,
      place: (y) => this.placeButton(cx, y + bh / 2, bw, bh),
    });
    rungs.push({
      h: badge.h,
      // A full gap under the row when the rule follows it, so the rule reads as
      // the line the card finishes on rather than as an underline on the badges.
      gap: retry ? 0.9 : 0,
      place: (y) => this.badges.position.set(cx, y + badge.h / 2),
    });
    if (retry) {
      rungs.push({
        h: retry.h,
        gap: 0,
        place: (y) => this.placeRetry(cx, y + retry.h / 2, retry.w, retry.h),
      });
    }

    // Every rung's height, plus every gap except the one under the last.
    const total = rungs.reduce(
      (sum, r, i) => sum + r.h + (i < rungs.length - 1 ? r.gap * gap : 0),
      0,
    );
    let y = s.y + (h - total) / 2;
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
      x: s.x + w * 0.78,
      y: s.cy,
      top: s.y + h * 0.16,
      bottom: s.y + h * 0.84,
      zoom: 1.2,
    };
    // The wash runs from the window's own left edge to the right of the column,
    // which is where the column ends and not where the stage does.
    this.placeArt(clear, s.x + w * 0.6);
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
    [
      this.outcome,
      this.brand,
      this.sub,
      this.button,
      this.retry,
      this.badges,
    ].forEach((el) => {
      killTweensOf(el);
      el.alpha = 1;
    });
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
  /**
   * @param {"victory"|"defeat"} outcome
   * @param {boolean} [stamped] the verdict has already been announced, on the
   *   screen before this one — see ui/outcome.js. The banner is then left off
   *   the card entirely: a second stamp is the creative telling the player
   *   something they have just spent five seconds reading, and the card has a
   *   pitch to make instead. The sting is not gated on it — see `show`.
   *
   *   The stack closes up behind it on its own. Upright the banner was never a
   *   rung — `placeBanner` lays it in the hole the picture is aimed into and
   *   returns on a card with no banner art — and held sideways `sizeBanner`
   *   gives back nothing, so the rung is simply not in the column. See
   *   stackLandscape.
   */
  async show(outcome, stamped) {
    this.defeat = outcome === "defeat";
    // The card arrives on the game's own title sting, stamped or not.
    //
    // This was gated on `stamped`, and since the director stamps every card it
    // builds the gate meant the sting never fired at all: the last screen of
    // the creative came up under the lobby theme with nothing on it but the
    // part-by-part clicks below, which is a card appearing rather than a card
    // landing. The repeat argument holds for the *banner* — a second VICTORY in
    // paint is the creative repeating itself, and that is still left off below
    // — but it was never an argument for the biggest arrival in the spot having
    // no sound of its own. The stinger on the screen before is the verdict;
    // this is the pitch showing up, and they are not the same event.
    sfx.endcard(this.defeat);

    /**
     * Neither the outcome line nor the promise under the wordmark is set here
     * any more, because neither is on the card: VICTORY over the wordmark and
     * COLLECT YOUR HEROES under it are both gone, on a win as well as on a loss.
     *
     * They were a win's and only a win's — the defeat card already dropped them
     * — and dropping them from both is the end of the same argument the defeat
     * card settled: the card is the wordmark, the painting, the plate and the
     * badges, and nothing on it discusses the result. The fight has already said
     * it out loud by the time the card is up — the outcome card stamps the
     * verdict one screen earlier, and that is the only place it is said. See
     * ui/outcome.js.
     *
     * `visible` rather than empty strings — set false where the two are built —
     * because the stack has to close up behind them. A Text with no text still
     * measures its own font, so every rung under it would be spaced around a gap
     * with nothing in it. See fitLine.
     */
    // The banner is the one exception to the paragraph above: the card says
    // nothing about the result in *type*, and it now says it in paint — either
    // way, because there are two paintings. Built here rather than in the
    // constructor because this is the first moment the result is known, and
    // added to a box that was put at the right depth back then; `show` runs once
    // per session, so the sprite is made once.
    if (!this.bannerArt && !stamped) {
      this.bannerArt = bannerSprite(this.defeat);
      if (this.bannerArt) this.banner.addChild(this.bannerArt);
    }
    this.banner.visible = !!this.bannerArt;
    // The one thing the card still colours off the result, and it is a wash
    // behind the painting rather than a sentence about it.
    this.glow.tint = this.defeat ? 0xff4a2a : GEM_COLORS[HEALER];
    /**
     * The other thing the result decides, and the only one that is a control.
     *
     * A wipe gets the fight back; a win has nothing to try again, and putting
     * RETRY on a victory card would be asking somebody who just beat the boss
     * whether they would like to beat it again instead of installing the game.
     *
     * `onRetry` in the test as well, because there are hosts this card is built
     * for that have no run to restart — see the constructor. Set before the
     * resize below, which is where the stack reads it.
     */
    this.retry.visible = this.defeat && !!this.onRetry;
    // Re-solve the stack: every line here is fitted to the screen width, and
    // the defeat copy is a different length from the victory copy.
    if (this.layout) this.resize(this.layout);

    this.visible = true;
    this.alpha = 0;

    const els = [
      this.outcome,
      this.brand,
      this.sub,
      this.button,
      this.retry,
      this.badges,
    ];
    els.forEach((el) => {
      el.alpha = 0;
    });
    this.banner.alpha = 0;

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

    /**
     * The banner lands before anything else on the card, and it lands hard.
     *
     * Everything below this arrives on a fade and a short slide, because
     * everything below this is the pitch and a pitch that bangs in is a pitch
     * nobody trusts. The banner is not the pitch — it is the verdict on the
     * fight the player just had, and it is the only thing on the card that has
     * earned a stamp. So it comes in over-size and settles, which is the one
     * gesture the rest of the card never makes. A wipe is stamped as hard as a
     * win: the player who lost knows they lost, and a card that says it quietly
     * only looks like it is embarrassed about the game it is selling.
     *
     * `scale` and not `position`: it is centred in the picture's hole, and there
     * is no direction it could slide from without crossing a rung of the stack.
     */
    if (this.banner.visible) {
      this.bannerScale = 1;
      this.banner.scale.set(1.16);
      tween(this.banner, { alpha: 1 }, 0.2);
      tween(this.banner.scale, { x: 1, y: 1 }, 0.5, { ease: Ease.backOut });
      await delay(0.14);
      if (!this.introducing) return;
    }

    /**
     * The card assembles in silence, and the sting is the whole of its sound.
     *
     * Every part of this used to fire one: a rung counter walking a ladder of
     * clicks, then a cut per part — a whoosh on the logo, a clack and a sheen on
     * the plate, a click on the store row, a tick on the way out — then one cut
     * repeated on all of them. All three were answering the same question the
     * wrong way round. The card had gone quiet because the title sting was gated
     * off behind `stamped`, and what it wanted back was the sting, not a
     * substitute assembled out of UI clicks.
     *
     * The sting is back and ungated — see `show` — and it is the only sound the
     * card has. It fires once as the card arrives under the wordmark and then
     * once per part down the stack the player is being sold: the plate, the
     * store row, the way out. The same cut every time.
     *
     * That is the whole of the mix, and the sameness is the point. Three
     * attempts at this gave each part a sound of its own — a ladder of clicks,
     * then a cut per part, then one cut per part — and each time what the screen
     * ended up sounding like was several unrelated noises inside two seconds
     * rather than one thing being put in front of somebody. One cut, landing
     * where a part lands, reads as the card being dealt out.
     *
     * They overlap, and are meant to: the cut runs 1.6 seconds and the parts are
     * a third of a second apart, so each hit lands inside the tail of the one
     * before it. That is a sting being struck four times, not four stings.
     */
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
    if (this.sub.visible) {
      tween(this.sub, { alpha: 1 }, 0.28);
    }

    await delay(0.35);
    if (!this.introducing) return;
    const by = this.button.y;
    this.button.y = by + 30;
    tween(this.button, { alpha: 1 }, 0.25);
    // The plate, on the sting the card itself arrived on — and the first of the
    // three hits down the stack, about 570 ms behind the card's own.
    sfx.endcard(this.defeat);
    await tween(this.button, { y: by }, 0.4, { ease: Ease.backOut });
    if (!this.introducing) return;

    // The badges after the CTA: they are the reassurance under it, not a second
    // thing competing with it for the tap.
    const gy = this.badges.y;
    this.badges.y = gy + 14;
    tween(this.badges, { alpha: 1 }, 0.3);
    sfx.endcard(this.defeat);
    await tween(this.badges, { y: gy }, 0.34, { ease: Ease.cubicOut });
    if (!this.introducing) return;

    /**
     * The rematch last of all.
     *
     * Order is the argument here as much as size is. The plate lands first and
     * lands hardest, the store row settles under it, and only then does the way
     * out draw itself in — so the card offers the game and then, at the bottom,
     * mentions the fight, rather than putting the two up together and letting
     * the player pick which one the screen was about.
     *
     * A fade with barely any slide under it, which is what a rule can do and a
     * button cannot: it is eight points deep, so a 22-point drop on it is not an
     * entrance, it is a line that fell over. See placeRetry.
     */
    if (this.retry.visible) {
      const ry = this.retry.y;
      this.retry.y = ry + 8;
      tween(this.retry, { alpha: 1 }, 0.3);
      sfx.endcard(this.defeat);
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
