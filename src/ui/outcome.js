/**
 * The outcome card — the fight's verdict, the way the game itself gives it.
 *
 * The game does not stop a fight and put a scoreboard over it. It freezes the
 * frame, blurs it, flashes, and lays one word inside a thin gold band with a
 * line under it asking to be tapped. That is the whole card, and it is over in
 * three seconds. This is that card.
 *
 * It replaced a screen that had a painted plaque, four counted statistics, a
 * row of six hero portraits and two store-styled buttons on it. All of that is
 * gone. It was a decent result *screen* and the wrong thing entirely: the game
 * this is an advert for does not have one there, and a creative that invents a
 * scoreboard the product has never shown is a creative teaching the player
 * something they will not find when they install it.
 *
 * ## What it is made of
 *
 * Four things, and two of them cost nothing:
 *
 *   the fight itself   frozen and blurred — see `freeze` and the note below
 *   the flash          drawn: one filled rectangle
 *   the band + word    S_ScreenTitleBackground out of the build, plus type
 *   the tap line       S_TitleOrnamentLine out of the build, plus type
 *
 * Nineteen kilobytes of new art, and it takes forty-two out: the two result
 * skies this screen used to be set against are gone, because the backdrop is
 * now the fight the player was looking at a frame ago.
 *
 * ## The blur, and why there is no BlurFilter in it
 *
 * The frozen frame is halved three times and drawn back at full size. Linear
 * sampling does the rest — a 49-pixel-wide still stretched across a phone is a
 * gaussian blur in everything but name, and it costs four one-off textures and
 * no per-frame work at all. See FREEZE_STEPS for why it is halved rather than
 * scaled down in one go.
 *
 * A real BlurFilter would be a full-screen shader pass every frame, on the one
 * screen in the creative that runs while the webview is also decoding an end
 * card, and it is the kind of thing that shows up as a dropped frame on exactly
 * the cheap hardware a playable has to survive. The cheap version is also
 * closer to the shipped card, which is blurred heavily rather than softly.
 *
 * ## How it ends
 *
 * A tap anywhere, or the hold running out. There are no buttons on it — the
 * game's own card has none, and the rematch a loss is owed is offered by the end
 * card immediately after this one. See ui/endcard.js.
 */

import { Container, Graphics, Rectangle, Sprite, Text } from "pixi.js";
import { COPY, FONT, FONT_OUTCOME, T } from "../config.js";
import {
  PLATE_FILL,
  PLATE_GOLD,
  fitLine,
  fitPlate,
  lineSprite,
  plateSprite,
} from "../art/outcomeui.js";
import { glowTexture, gradientTexture } from "../art/textures.js";
import { Ease, delay, killTweensOf, tween } from "../core/tween.js";
import * as sfx from "../audio/sfx.js";
import { fitFont } from "./text.js";

/**
 * The wash over the frozen fight.
 *
 * Deliberately not a flat dim. The shipped card leaves the arena readable — the
 * player is meant to still see the fight they just had underneath — and it
 * darkens the top and the bottom of the frame rather than the middle, which is
 * where the band goes. Flat, the same amount of darkening either hides the arena
 * or fails to hold the type.
 */
const SCRIM = [
  [0.0, "rgba(6,5,12,0.9)"],
  [0.3, "rgba(6,5,12,0.62)"],
  [0.62, "rgba(6,5,12,0.68)"],
  [1.0, "rgba(6,5,12,0.94)"],
];

/**
 * The still is tinted as well as dimmed, and the dim on its own is not enough.
 *
 * Blurring a board of saturated gems gives back saturated blobs: the shapes go
 * but the colour does not, and five columns of pure red, green and violet under
 * a white headline is a headline sitting in a fruit bowl. A multiply pulls the
 * whole picture towards this cool grey, which takes the punch out of the gems
 * without touching the arena above them, where the paint is already muted.
 *
 * A tint and not a filter, for the same reason there is no BlurFilter here: it
 * is a vertex colour, it costs nothing, and it works on every device that can
 * draw a sprite at all.
 */
const STILL_TINT = 0x8592ad;

/**
 * How many times the still is halved on its way to being the blur.
 *
 * Three, so the frame comes back at an eighth of its own size — on the reference
 * phone a 49 by 106 pixel picture, drawn back across 390 by 844 points.
 *
 * Halved rather than scaled straight down in one step, and that is the whole of
 * why this is a count and not a fraction. One bilinear pass from full size to an
 * eighth samples one pixel in sixty-four and throws the other sixty-three away,
 * which is not a blur, it is aliasing — a gem grid comes back as a crunchy moiré
 * of itself. Halving averages every pixel into the next level down, three times,
 * which is a box pyramid and is what a blur actually is.
 *
 * Two halvings leave the board legible enough to compete with the word over it;
 * four stop the arena reading as an arena at all.
 *
 * Exported because main.js is what takes the still — see `freezeFight` there.
 */
export const FREEZE_STEPS = 3;

/**
 * The band's box: a share of the stage's width, and a share of its height.
 *
 * Wider than the stage upright, on purpose. The plate's art fades to nothing at
 * each end — see art/outcomeui.js — and running it past the edge is what puts
 * that fade off screen and leaves two hairlines crossing the whole frame, which
 * is what the shipped card looks like. Contained inside the stage instead, the
 * card reads as a label parked in the middle of the screen.
 *
 * The height is a share rather than the art's own aspect, and it is the one
 * deliberate stretch in this creative. See art/outcomeui.js for why the art
 * allows it and nothing else does.
 */
const PLATE_W = { portrait: 1.06, landscape: 0.78 };
const PLATE_H = { portrait: 0.145, landscape: 0.22 };

/** Where the band sits down the stage, and where the tap line sits under it. */
const PLATE_Y = { portrait: 0.47, landscape: 0.46 };
const TAP_Y = { portrait: 0.86, landscape: 0.87 };

/** The hairline over the tap line, as a share of the stage's width. */
const LINE_W = { portrait: 0.44, landscape: 0.26 };

/**
 * The flash.
 *
 * `HOLD` is how long it stays at full before it starts leaving, and it is two
 * frames rather than none: a flash that begins fading on the frame it appears is
 * a flash half the phones in the matrix render as one grey frame. `FADE` is the
 * leaving, and it is long enough to read as light rather than as a glitch.
 */
const FLASH_HOLD = 0.04;
const FLASH_FADE = 0.55;

/** A win flashes warm white; a loss flashes hot. */
const FLASH_WIN = 0xfff4d8;
const FLASH_LOSS = 0xffcfc4;

/**
 * How long the card ignores a tap.
 *
 * The gesture that ended the fight can still be in the air — a swipe on the
 * board that landed the killing match, a finger that has not lifted — and a card
 * that took it would flash the word for two frames and cut to the store.
 */
const ARM_AFTER = 0.5;

/** The tap line's breath, in radians a second. */
const PULSE = 2.6;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class OutcomeScreen extends Container {
  /**
   * @param {() => (import("pixi.js").Texture|null)} freeze a still of the fight
   *   as it stands right now. Supplied by main.js, which is the only thing
   *   holding the renderer and the world container — see `freezeFight` there. A
   *   function rather than a texture because the still has to be taken at the
   *   moment the fight ends, and this card is built thirty seconds earlier.
   *
   * There is no `onContinue` and no `onRetry`. Leaving is what `show` resolving
   * means, and the card has no second control to hang one off: the rematch
   * belongs to the end card, one screen later.
   */
  constructor(freeze) {
    super();
    this.visible = false;
    this.freeze = freeze || (() => null);

    this.layout = null;
    this.defeat = false;
    this.t = 0;
    /** Raised while the intro runs, so a rotation can cut it short. */
    this.introducing = false;
    /** Counts down to the auto-advance. Negative means "not armed". */
    this.hold = -1;
    /** Counts down to the first tap this card will take. See ARM_AFTER. */
    this.arming = -1;
    /** Whoever is waiting on `show`. Resolved exactly once — see `leave`. */
    this.leaving = null;

    /* ------------------------------------------------------------ backdrop */

    /**
     * The still, built on `show` rather than here.
     *
     * There is nothing to freeze at construction: the fight has not been played.
     * The slot is left empty and every method below is written to find it
     * missing, which is also what a device whose renderer refused to hand over a
     * texture gets.
     */
    this.still = null;

    this.scrim = new Sprite(gradientTexture("outcome-scrim", SCRIM));
    this.addChild(this.scrim);

    /**
     * The light behind the word.
     *
     * Additive, gold, pulsing — what is left of the flash once the flash has
     * gone. It is also the whole of the card on a device that could decode
     * neither the plate nor the still.
     */
    this.bloom = new Sprite(glowTexture());
    this.bloom.anchor.set(0.5);
    this.bloom.blendMode = "add";
    this.bloom.tint = PLATE_GOLD;
    this.bloom.alpha = 0;
    this.addChild(this.bloom);

    /* --------------------------------------------------------- the verdict */

    /**
     * A Container around the band and the word, because the intro stamps the
     * pair in on `scale`.
     *
     * In Pixi a Sprite's width *is* its scale, so a plate fitted by `setSize`
     * and then scaled has its fit thrown away, and one scaled and then re-fitted
     * on a rotation snaps to full size mid-flourish. The wrapper separates the
     * two: `resize` sizes what is inside it, the intro scales the box, and
     * neither can undo the other.
     */
    this.card = new Container();
    this.addChild(this.card);

    /** Drawn, and only ever reached when the plate did not decode. */
    this.band = new Graphics();
    this.card.addChild(this.band);

    this.plate = plateSprite();
    if (this.plate) this.card.addChild(this.plate);

    /**
     * The word.
     *
     * White, and the only text in the creative with a face of its own — see
     * FONT_OUTCOME, which asks for Elan ITC Pro first and falls through to
     * Hitzone Med, the cut the build keeps for a name being announced, for as
     * long as no licensed Elan is on disk. Not gold: the band under it is gold,
     * and gold on gold is a word that has to be looked for.
     */
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

    /* -------------------------------------------------------- the tap line */

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
        stroke: { color: 0x0b0714, width: 3, join: "round" },
      },
    });
    this.tapText.anchor.set(0.5);
    this.tap.addChild(this.tapText);
    this.tap.alpha = 0;
    this.addChild(this.tap);

    /* ----------------------------------------------------------- the flash */

    /**
     * Last of all and over everything, because that is what a flash is.
     *
     * A Graphics rather than a Sprite so it is one filled rectangle with no
     * texture behind it, and `eventMode` none so it cannot eat the tap it is
     * drawn over during the half second it is visible.
     */
    this.flash = new Graphics();
    this.flash.eventMode = "none";
    this.flash.alpha = 0;
    this.addChild(this.flash);

    /**
     * The whole card is the button.
     *
     * There is nothing else on it to press, which is the point: the game's own
     * card says tap to continue and means anywhere.
     */
    this.eventMode = "static";
    this.on("pointertap", () => this.leave("tap"));
  }

  /* ---------------------------------------------------------------- layout */

  /**
   * @param {ReturnType<import("../core/layout.js").computeLayout>} layout
   */
  resize(layout) {
    this.layout = layout;
    const { w, h, ui, portrait } = layout;
    const s = layout.stage;
    const key = portrait ? "portrait" : "landscape";

    this.hitArea = new Rectangle(0, 0, w, h);

    // The still covers the window and not the stage: it is a photograph of the
    // whole screen, and it goes back exactly where it was taken from.
    if (this.still) this.still.setSize(w, h);
    this.scrim.setSize(w, h);

    this.flash.clear();
    this.flash.rect(0, 0, w, h);
    this.flash.fill({ color: 0xffffff });

    /* ------------------------------------------------------------- the band */

    const pw = s.w * PLATE_W[key];
    const ph = clamp(s.h * PLATE_H[key], 52 * ui, 150 * ui);
    const cy = s.y + s.h * PLATE_Y[key];

    this.card.position.set(s.cx, cy);

    if (this.plate) {
      fitPlate(this.plate, pw, ph);
      this.band.clear();
    } else {
      this.drawBand(pw, ph);
    }

    // Inside the flat middle of the band, with the hairlines and their chevrons
    // left clear: the plate's ornament reaches about a sixth of the way in from
    // each edge, and a word set across it is a word with a spike through it.
    fitFont(this.word, pw * 0.62, ph * 0.54);
    this.word.position.set(0, 0);

    this.bloom.position.set(s.cx, cy);
    this.bloom.setSize(Math.max(80, pw * 0.8), Math.max(80, ph * 3.4));

    /* --------------------------------------------------------- the tap line */

    const tapY = s.y + s.h * TAP_Y[key] - layout.safe.bottom * 0.5;
    this.tap.position.set(s.cx, tapY);

    const size = fitFont(this.tapText, s.w * 0.7, clamp(14 * ui, 11, 20));
    this.tapText.position.set(0, 0);
    if (this.line) {
      fitLine(this.line, s.w * LINE_W[key]);
      // Above the words rather than under them: the hairline is a lid on the
      // sentence, which is where the shipped card puts it.
      this.line.position.set(0, -size * 1.6);
    }

    // The card just moved. Anything still flying towards where it used to be has
    // to be told, or it will spend the next half second putting it back.
    if (this.introducing) this.settle();
  }

  /**
   * The band, drawn — reached only when the plate did not decode.
   *
   * Two hairlines in the plate's own gold with a navy wash between them, which
   * is the plate reduced to the two things it has to be. No chevron: a drawn
   * ornament that is not the painted one is worse than none at all.
   */
  drawBand(w, h) {
    const t = Math.max(1, h * 0.02);
    this.band.clear();
    this.band.rect(-w / 2, -h / 2, w, h);
    this.band.fill({ color: PLATE_FILL, alpha: 0.72 });
    this.band.rect(-w / 2, -h / 2, w, t);
    this.band.fill({ color: PLATE_GOLD, alpha: 0.9 });
    this.band.rect(-w / 2, h / 2 - t, w, t);
    this.band.fill({ color: PLATE_GOLD, alpha: 0.9 });
  }

  /* ----------------------------------------------------------------- show */

  /**
   * Put the verdict up, and resolve when the player leaves it.
   *
   * @param {"victory"|"defeat"} outcome
   * @returns {Promise<void>} settles when the card is done with. The end card
   *   goes up next — see Director.finish.
   */
  async show(outcome) {
    this.defeat = outcome === "defeat";
    this.word.text = this.defeat ? COPY.outcomeDefeat : COPY.outcomeVictory;

    /**
     * The still, taken now and only now.
     *
     * This is the last frame of the fight, and it has to be captured before this
     * container is made visible or the photograph would have the card in it.
     * `show` runs once per run, so it is taken once.
     */
    if (!this.still) {
      const texture = this.freeze();
      if (texture) {
        this.still = new Sprite(texture);
        this.still.tint = STILL_TINT;
        // Under the scrim, which is index 0 until this arrives.
        this.addChildAt(this.still, 0);
      }
    }

    if (this.layout) this.resize(this.layout);

    /* ----------------------------------------------------------- the intro */

    this.visible = true;
    // No fade on the container: the flash is the transition, and a card that
    // also dissolves in arrives twice.
    this.alpha = 1;
    this.t = 0;
    this.arming = ARM_AFTER;
    this.hold = -1;
    this.introducing = true;

    this.card.alpha = 0;
    this.tap.alpha = 0;
    this.bloom.alpha = 0;
    this.flash.alpha = 1;
    this.flash.tint = this.defeat ? FLASH_LOSS : FLASH_WIN;

    const waiting = new Promise((resolve) => {
      this.leaving = resolve;
    });

    /**
     * The ending's own stinger, on the word rather than on the flash.
     *
     * This used to be `sfx.endcard`, a title sting fired here while the
     * director played the real victory horn a second and a half earlier, back
     * in the fight, under `hud.shout`. Two problems in one: the sound that
     * means "you won" landed on a callout the player reads in passing, and the
     * card — the frame they actually stop on — got the generic one.
     *
     * So the horn moved here and the title sting went with it. `sfx.endcard`
     * still exists and is still used, on the store card that comes after this
     * one; what it is not is the sound of the verdict.
     *
     * The offsets are the gap between when each cut is started and when its
     * weight arrives, against the one moment on this card worth hitting. The
     * word crosses readable at 0.18 s — `card` finishes fading at 0.22 but the
     * flash is over it until then, so the two curves multiplied out put half
     * the word on screen at 0.18. The win's cut reaches half power 0.176 s
     * after it is started and the loss's braam at 0.116, both measured in
     * outcome.mp3 past the head. A win therefore starts here and a loss starts
     * 0.06 later, and the two endings hit the same frame within four
     * milliseconds of each other.
     */
    if (this.defeat) sfx.defeat(0.06);
    else sfx.victory();

    // The flash goes out on its own clock. Everything below arrives inside it,
    // so the word is already standing by the time there is enough of the frame
    // back to see it — which is what makes the card look revealed rather than
    // faded in.
    tween(this.flash, { alpha: 0 }, FLASH_FADE, {
      delay: FLASH_HOLD,
      ease: Ease.cubicOut,
    });

    /**
     * The word lands hard, and it is the only thing on this card that moves.
     *
     * Over-size and settling, which is the one gesture that reads as a verdict
     * rather than as an animation. A wipe is stamped as hard as a win: the
     * player who lost knows they lost, and a card that says it quietly only
     * looks embarrassed about the game it is selling.
     */
    this.card.scale.set(1.22);
    tween(this.card, { alpha: 1 }, 0.16, { delay: 0.06 });
    tween(this.card.scale, { x: 1, y: 1 }, 0.5, {
      delay: 0.06,
      ease: Ease.backOut,
    });
    tween(this.bloom, { alpha: this.defeat ? 0.3 : 0.42 }, 0.5, { delay: 0.1 });

    await delay(0.62);
    if (!this.introducing) return waiting;

    await tween(this.tap, { alpha: 1 }, 0.3);
    if (!this.introducing) return waiting;

    this.introducing = false;
    // The clock starts once the line asking for a tap is up, and not at `show`:
    // a hold measured from the flash is a hold most of which was spent behind it.
    this.hold = T.outcomeHold;
    return waiting;
  }

  /**
   * Cut the intro and put everything where it was going.
   *
   * Reached by a rotation, which re-solves the card under a sequence still
   * animating towards the old one, and by `leave`. Every tween here is an alpha
   * or a scale, and both are just their own final value once there is nobody
   * watching them arrive.
   */
  settle() {
    if (!this.introducing) return;
    this.introducing = false;

    [this.card, this.tap].forEach((el) => {
      killTweensOf(el);
      killTweensOf(el.scale);
      el.alpha = 1;
      el.scale.set(1);
    });
    killTweensOf(this.bloom);
    this.bloom.alpha = this.defeat ? 0.3 : 0.42;
    // The flash is the one thing a rotation must not preserve: it is half a
    // second of white over the whole screen, and finishing it early is the only
    // sensible reading of "there is nobody watching this arrive".
    killTweensOf(this.flash);
    this.flash.alpha = 0;

    if (this.layout) this.resize(this.layout);
    this.hold = T.outcomeHold;
  }

  /**
   * Leave — once.
   *
   * Every way off this card comes through here, and the guard is the point of
   * it: a tap and the hold can fire inside the same frame, and a card that
   * resolved twice would put two end cards up.
   *
   * @param {"tap"|"hold"} how
   */
  leave(how) {
    if (!this.leaving) return;
    if (this.arming > 0) return;

    const resolve = this.leaving;
    this.leaving = null;
    this.settle();
    this.hold = -1;
    // Not on the hold: nobody pressed anything, and a click over a card that
    // moved on by itself is the creative pretending to have been touched.
    if (how !== "hold") sfx.select();

    // Faded, because the end card comes up over this and fades itself in from
    // nothing: for a third of a second the two are one dissolve.
    killTweensOf(this);
    tween(this, { alpha: 0 }, 0.4).then(() => {
      this.visible = false;
    });

    resolve();
  }

  /* ----------------------------------------------------------------- frame */

  update(dt) {
    if (!this.visible) return;
    this.t += dt;

    if (this.arming > 0) this.arming -= dt;
    if (this.introducing) return;

    this.bloom.alpha =
      (this.defeat ? 0.26 : 0.36) + Math.sin(this.t * 1.8) * 0.08;
    // On the text and not on the container, so the fade-out on the way off owns
    // an alpha of its own and the two do not fight over the same number.
    this.tapText.alpha = 0.62 + Math.abs(Math.sin(this.t * PULSE)) * 0.38;

    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold <= 0) this.leave("hold");
    }
  }
}
