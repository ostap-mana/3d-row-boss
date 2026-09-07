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
 * The same wash, on the card nobody wanted.
 *
 * Identical curve — 0.9, 0.62, 0.68, 0.94, at the same four stops — because the
 * composition is not what changed. A loss does not want the arena hidden any
 * more than a win does, and moving the alphas would be this card quietly
 * becoming a different card when the result goes the other way. Only the colour
 * of the darkness moves: rgb(6,5,12), which is a blue-black, becomes an
 * oxblood one.
 *
 * The number is not invented here. `Director.lose` throws a full-screen
 * 0x3a0606 over the fight the instant the party is wiped — near-black, barely a
 * red at all until it is the only thing on the screen — and this card is the
 * next frame after that flash. Continuing its colour is the whole idea: the
 * wipe stains the room, and the verdict is read in the room it stained. Held
 * rather than thrown, so it is dropped to about a third of the flash's weight,
 * and warmed a little towards the floor, where the board the player just lost
 * is lying.
 *
 * Its own cache key, because gradientTexture hands back the first texture ever
 * built under a name and would otherwise give the loss the win's sky.
 */
const SCRIM_LOSS = [
  [0.0, "rgba(24,5,9,0.9)"],
  [0.3, "rgba(30,6,10,0.62)"],
  [0.62, "rgba(36,7,10,0.68)"],
  [1.0, "rgba(44,8,10,0.94)"],
];

/**
 * The red the room is lit by once the fight is lost, and the only thing on this
 * card that is added rather than laid over.
 *
 * A scrim can only ever take light away — it is a dark sheet at an alpha — and a
 * loss told entirely in subtraction is a loss told by turning the brightness
 * down. That is the failure the background's own note names: a multiply left
 * high over dark art gives a black screen with a monster somewhere in it. So the
 * darkness goes oxblood above, and this puts one light back, which is the pair
 * the rest of the build tunes together and never separately.
 *
 * Weighted to the floor on purpose. The board is at the bottom of the frame and
 * the board is what just killed the party; the word is in the middle and the
 * middle is left nearly clear, so the type is read against the darkest, quietest
 * part of the picture rather than through a glow. The lick at the very top is
 * the same light hitting the ceiling of the arena — without it the frame reads
 * as a red bar across the bottom of a black screen rather than as a room.
 *
 * Additive, so it survives being drawn over a still that came back almost black:
 * a normal-blend red over black is a dark red rectangle, and an added one is
 * light in a dark room. Alpha is carried per stop rather than by the sprite so
 * the shape of the light is fixed in the texture and the sprite's own alpha is
 * left free to be the intensity — which is what breathes. See BED_*.
 */
const BED_LOSS = [
  [0.0, "rgba(158,30,22,0.34)"],
  [0.36, "rgba(120,20,18,0.09)"],
  [0.66, "rgba(150,24,18,0.16)"],
  [1.0, "rgba(206,40,26,0.62)"],
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
 * The same still, on a loss.
 *
 * The cool grey above is a colour-killer: it pulls a board of saturated gems
 * towards neutral so a white headline is not sitting in a fruit bowl. This does
 * the same job in the other direction — the blue and the green come out of the
 * picture, the red is left in — so the photograph of the fight is not a fight
 * any more, it is the memory of one, lit by whatever is still burning.
 *
 * Kept at roughly the grey's own weight rather than deepened. A tint multiplies,
 * so every point taken off here is light taken off the arena as well, and the
 * still is already the darkest thing on the card: 0xb0 of red against the grey's
 * 0x85 is a picture that is warmer without being dimmer, which is the whole
 * trick. The green and the blue go to about two-thirds of their cool values,
 * which is far enough to kill the violet and cyan gems and not so far that the
 * heroes' armour turns into a silhouette.
 */
const STILL_TINT_LOSS = 0xac8076;

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

/**
 * A win flashes warm white; a loss flashes hot.
 *
 * The loss's is redder than it was — 0xffcfc4 was a blush, and a blush over a
 * card that is now lit oxblood underneath read as the flash and the room
 * disagreeing about what had happened. Still nearly white at the top of its
 * curve, because this flash's job is to hide the cut and hand back a card that
 * is already standing; a red flash is an effect, and there is one of those on
 * the screen before this. What it does now is leave warm as it goes, so the
 * last thing the fade puts down is the colour the room keeps.
 */
const FLASH_WIN = 0xfff4d8;
const FLASH_LOSS = 0xffb5a4;

/**
 * The light behind the word, on a loss.
 *
 * Gold is the win's, and it is the creative's own gold — PLATE_GOLD, the band's
 * own colour, which is why the bloom reads as the band glowing rather than as a
 * lamp behind it. A wipe cannot have that: the one warm light left on this card
 * would be announcing something.
 *
 * So it goes to the ember the rest of the loss is lit by. Not the crimson of the
 * bed below — a saturated red directly behind white type is a halo, and the word
 * has to stay the hardest edge on the screen — but a burnt orange sitting
 * between the band's gold and the floor's red, which is what a gold plate looks
 * like with a fire under it. The same family the end card puts behind its own
 * defeat art, one screen later.
 */
const BLOOM_LOSS = 0xc9502a;

/**
 * The bed's intensity: what it settles at, how far it breathes either side, and
 * how fast.
 *
 * The breath is the point of the whole layer. A still red is a colour; a red
 * that swells and falls is a room with something in it, and it is the only thing
 * on this card that moves once the word has landed. It is deliberately slower
 * than everything else on screen — 0.9 radians a second against the bloom's 1.8
 * and the tap line's 2.6 — because the two fast pulses are alive and this one is
 * meant to read as the fight going out. Around seven seconds a cycle, on a card
 * held for T.outcomeHold: the player sees it swell once, which is enough to
 * notice and not enough to look like a loop.
 *
 * The swing is 0.05 against a centre of 0.55, so the floor moves by about a
 * tenth of its own strength. Wider and the card pumps; narrower and it may as
 * well be a constant on the phones this is judged on.
 */
const BED_BASE = 0.3;
const BED_SWING = 0.045;
const BED_BREATH = 0.9;

/**
 * The one hit, and where it lands.
 *
 * `sfx.defeat` is started at 0.06 and its braam reaches half power 0.116 s after
 * that — see the note in `show`, which is where those two numbers were measured
 * against each other. This puts the light on the same frame: the horn hits, the
 * room goes up in red, and then it falls back to the bed over the second that
 * follows and stays there. It is the only moment on the card where the backdrop
 * is louder than the word, and it is over before the word has finished settling.
 *
 * A win has no equivalent and does not want one. Its horn is answered by the
 * gold bloom behind the band, which is a light on the verdict; this is a light
 * on the room, and the difference is the difference between the two endings.
 */
const BED_HIT = 0.9;
const BED_HIT_AT = 0.176;

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
     * The loss's light, built on both endings and paid for by neither.
     *
     * Two cached textures and a sprite at alpha zero is nothing — the gradient
     * is four pixels wide — and building it here rather than on a loss is what
     * keeps `show` free of a branch that adds a child mid-flight. A win never
     * raises its alpha, and a sprite at alpha zero is skipped by the renderer.
     *
     * Directly over the scrim and under everything else: the light is in the
     * room, so it is above the darkness that made the room and below the band,
     * the word, the tap line and the flash. The still goes in under both with
     * `addChildAt(_, 0)` on `show`, which cannot disturb this.
     */
    this.bed = new Sprite(gradientTexture("outcome-bed-loss", BED_LOSS));
    this.bed.blendMode = "add";
    this.bed.eventMode = "none";
    this.bed.alpha = 0;
    this.addChild(this.bed);

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
    // The band and the tap line are fractions of a box from one end of it to
    // the other, so the box is the stage less the cutouts — see safeStage in
    // core/layout.js. The still and the scrim under them are not: they are a
    // photograph of the whole screen and go back where they were taken from.
    const s = layout.safeBox;
    const key = portrait ? "portrait" : "landscape";

    this.hitArea = new Rectangle(0, 0, w, h);

    // The still covers the window and not the stage: it is a photograph of the
    // whole screen, and it goes back exactly where it was taken from.
    if (this.still) this.still.setSize(w, h);
    this.scrim.setSize(w, h);
    // The same box as the scrim, for the same reason: the light and the dark are
    // one wash over the photograph, and a bed measured off the stage would leave
    // the room lit to the notch and black past it.
    this.bed.setSize(w, h);

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

    // Straight off the box now. This used to carry half the bottom inset as a
    // correction of its own, which is the sort of term that appears when the
    // box a fraction is taken of is the wrong box: TAP_Y is 0.86 of the screen
    // the player can see, and the box it is measured in already ends where the
    // home indicator starts.
    const tapY = s.y + s.h * TAP_Y[key];
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
     * The room the verdict is read in, and the only place the result is allowed
     * to change this card's colour.
     *
     * The word is white on both endings — it is the one word in the creative
     * with a face of its own, and a coloured verdict is a verdict competing with
     * the band it is set in. What carries the loss is everything behind it: the
     * darkness goes oxblood, the photograph of the fight goes from cool to
     * burnt, and the light behind the band stops being gold. See SCRIM_LOSS,
     * STILL_TINT_LOSS and BLOOM_LOSS, and the bed below them.
     *
     * Set here rather than in the constructor because this is the first moment
     * the result is known, and re-set on every `show` rather than once because
     * the texture swap has to survive a card that is shown, left, and shown
     * again by a rematch.
     */
    this.scrim.texture = this.defeat
      ? gradientTexture("outcome-scrim-loss", SCRIM_LOSS)
      : gradientTexture("outcome-scrim", SCRIM);
    this.bloom.tint = this.defeat ? BLOOM_LOSS : PLATE_GOLD;

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
        // Under the scrim, which is index 0 until this arrives.
        this.addChildAt(this.still, 0);
      }
    }
    // Outside the block above, so a rematch that comes back to a still taken on
    // the first run still gets the tint its own result asks for.
    if (this.still)
      this.still.tint = this.defeat ? STILL_TINT_LOSS : STILL_TINT;

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
    this.bed.alpha = 0;
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

    /**
     * The room lights, once, on the horn — and then does not stop being lit.
     *
     * Two tweens rather than one because a hit and a bed are different events
     * that happen to share a number: the first is the braam made visible and is
     * over in a tenth of a second, the second is what the card looks like for
     * the rest of its life. Chained by the second's delay rather than by an
     * await, so a rotation landing between them finds both already queued and
     * `settle` can kill the pair together.
     *
     * The bed lands on BED_BASE exactly, which is the centre `update` breathes
     * around — see BED_SWING. Anything else and the first frame after the intro
     * would be a step, which is the wart the gold bloom already has and is not
     * an argument for a second one.
     */
    if (this.defeat) {
      tween(this.bed, { alpha: BED_HIT }, 0.1, {
        delay: BED_HIT_AT,
        ease: Ease.cubicOut,
      });
      tween(this.bed, { alpha: BED_BASE }, 0.9, {
        delay: BED_HIT_AT + 0.1,
        ease: Ease.cubicOut,
      });
    }

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
    // Both of the bed's tweens, and then the value they were going to arrive at.
    // A rotation that landed between the hit and the fall would otherwise leave
    // the room at full brightness for the rest of the card.
    killTweensOf(this.bed);
    this.bed.alpha = this.defeat ? BED_BASE : 0;
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
    // The room breathing, and the loss's only moving part. Guarded rather than
    // multiplied out because a win's bed is at zero and should cost nothing at
    // all, not a sine and a write every frame.
    if (this.defeat) {
      this.bed.alpha = BED_BASE + Math.sin(this.t * BED_BREATH) * BED_SWING;
    }
    // On the text and not on the container, so the fade-out on the way off owns
    // an alpha of its own and the two do not fight over the same number.
    this.tapText.alpha = 0.62 + Math.abs(Math.sin(this.t * PULSE)) * 0.38;

    if (this.hold > 0) {
      this.hold -= dt;
      if (this.hold <= 0) this.leave("hold");
    }
  }
}
