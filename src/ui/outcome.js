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
  PLATE_ART,
  PLATE_FILL,
  PLATE_GOLD,
  PLATE_RULE,
  fitLine,
  fitPlate,
  lineSprite,
  plateSprite,
} from "../art/outcomeui.js";
import { glowTexture, gradientTexture, rampTexture } from "../art/textures.js";
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
 *
 * Neutral, and the same wash on both endings. It was a blue-black on a win and
 * an oxblood on a loss, and the loss also had a red light added under it — a
 * whole room repainted by the result. That was asked off: what is behind the
 * verdict now is the fight, blurred and darkened, and nothing else. The colour
 * of the ending lives on the band and only on the band, which is where the game
 * itself puts it. The alpha curve is untouched, because the composition was
 * never what was wrong with it.
 */
const SCRIM = [
  [0.0, "rgba(8,8,9,0.9)"],
  [0.3, "rgba(8,8,9,0.62)"],
  [0.62, "rgba(8,8,9,0.68)"],
  [1.0, "rgba(8,8,9,0.94)"],
];

/**
 * The still is tinted as well as dimmed, and the dim on its own is not enough.
 *
 * Blurring a board of saturated gems gives back saturated blobs: the shapes go
 * but the colour does not, and five columns of pure red, green and violet under
 * a white headline is a headline sitting in a fruit bowl. A multiply pulls the
 * whole picture towards a neutral grey, which takes the punch out of the gems
 * without touching the arena above them, where the paint is already muted.
 *
 * A tint and not a filter, for the same reason there is no BlurFilter here: it
 * is a vertex colour, it costs nothing, and it works on every device that can
 * draw a sprite at all.
 */
const STILL_TINT = 0x9a9aa0;

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
/**
 * THE VERDICT BAND'S OWN COLOUR, and it is the one thing on this card that the
 * result is allowed to repaint.
 *
 * Read off the shipped game's own outcome windows rather than invented: the
 * band behind VICTORY is a green wash with a brighter green hairline top and
 * bottom, and the one behind DEFEAT is the same shape in dark red. Both fade to
 * nothing at either end, which is why they read as a stroke of colour laid
 * across the plate rather than as a box sitting on it.
 *
 * `fill` is the wash and `edge` the hairline. Exact values off the source:
 * 415.8 x 84.23 at a 2.13 border, which is where BAND_EDGE below comes from —
 * the hairline is 2.5% of the band's height, not a fixed number of points, so
 * it stays a hairline on a tablet and does not disappear on a phone.
 *
 * The plate stays underneath all of it. It is the game's own art and it carries
 * the chevron and the soft ends; this is a coat of paint on it, at 90% so the
 * navy still tells underneath and the band has some depth to it.
 */
const BAND = {
  victory: { fill: 0x266825, edge: 0x43c750 },
  defeat: { fill: 0x6b3030, edge: 0xc74343 },
};
const BAND_EDGE = 2.13 / 84.23;
const BAND_ALPHA = 0.9;

/**
 * How much wider than its word the band is cut.
 *
 * The source is 415.8 across with VICTORY set inside it, which is about half as
 * much band again as there is word — so 1.5, and the fades at either end land
 * in that margin rather than over the type.
 *
 * There is a floor under it in `resize` as well, at two and a half times the
 * band's own height. A four-letter verdict in another language would otherwise
 * come out as a colour swatch rather than a label, and the plate's ornament
 * needs somewhere to sit.
 */
const BAND_PAD = 1.5;

/**
 * How far the colour sits below the plate's own centre line, as a share of the
 * band's height.
 *
 * An optical correction and not a layout one. The verdict is set in capitals
 * and capitals have no descenders, so the glyphs fill the top of their own text
 * box and leave the space at the bottom empty. A band centred on that box is
 * geometrically right and looks high: there is more colour under the word than
 * over it, and the eye reads the strip as having ridden up off the type.
 *
 * ZERO NOW, and the reason is worth keeping rather than the number. The drop
 * went 0.06, then 0.03, then off, because each look at it said the same thing
 * in a smaller voice: the top line wants to be higher. It ends where that
 * argument does — with the colour reaching the gold on both edges and no offset
 * at all between them.
 *
 * What killed it is that the correction was answering the wrong question. The
 * word does sit high in its own box, but the band is not hung off the word — it
 * is hung off the plate, and the plate's two rules are symmetric. Pulling the
 * colour down inside a symmetric frame does not centre it on anything; it just
 * opens a gap above and closes one below.
 *
 * Left in place, at zero, because it is the one knob that can separate the two
 * edges: the drop only ever shortens the band from above, so a positive value
 * lowers the top line and never moves the bottom one.
 */
const BAND_DROP = 0;

/**
 * The plate's own proportion, and the widest the card will let it get.
 *
 * The chevron is the reason this exists. It is drawn on the centre of each
 * hairline at a right angle, and a right angle only survives if the bitmap is
 * carrying its own aspect: at 6.74:1 against the art's 7.87:1 — which is what a
 * box-fitted plate came out at in a landscape window — the two arms close from
 * 90 degrees to about 81, and it reads as a spike rather than as an ornament.
 *
 * So the width is taken from the height rather than from the stage, and the
 * plate is drawn at PLATE_ART's ratio whatever box it is handed. The header of
 * art/outcomeui.js licenses a vertical stretch on this bitmap and it is right
 * that nothing between the hairlines suffers from one — but the ornament sits
 * *on* a hairline, and that is what the licence did not cover.
 *
 * `PLATE_MAX_W` is the one thing that can still take the aspect away, and it is
 * there to keep the ornament on screen. The chevron sits about a sixth in from
 * each end, so at 1.35 screens wide it lands just inside the frame; past that
 * the plate would be all hairline and the card would lose the ornament
 * altogether. A tall narrow phone is where that bites — the box wants a band
 * three and a half times as wide as it is tall and the art is nearly eight — and
 * there the plate is still squeezed, just by a good deal less than it was.
 */
const PLATE_ASPECT = PLATE_ART.w / PLATE_ART.h;
const PLATE_MAX_W = 1.35;

/**
 * A little past the art's own ratio, so the gold runs further out.
 *
 * The aspect above is what keeps the chevron at the right angle it is drawn at,
 * and this is a deliberate few per cent off it — asked for, and worth writing
 * the cost down: stretching the plate horizontally *opens* the ornament rather
 * than closing it, so 1.06 takes the arms from 90 degrees to about 93. That is
 * inside the noise where the squeeze this replaced was not — it had them at 81,
 * which reads as a spike.
 *
 * What it buys is the hairline reaching nearer the frame's edge, which is what
 * the shipped card looks like. Past about 1.15 the angle starts reading as a
 * flat vee and the ornament stops being one, so that is the ceiling on this.
 */
const PLATE_STRETCH = 1.06;

/**
 * How far the colour is held clear of the gold's inner edge.
 *
 * The inset itself is not a taste decision and is not written here: it comes
 * off PLATE_RULE, which is where the hairline actually is in the bitmap —
 * 13.2% in, plus half of the line's own four-pixel thickness. Everything above
 * that is the frame; the colour starts below it.
 *
 * This is the only part of it that is a judgement: the daylight left between
 * the gold and the colour. Zero, so the two meet — the wash begins on the row
 * the hairline ends on, and the frame reads as one piece rather than as a
 * coloured strip parked inside a gold one.
 *
 * Zero is flush and not overlapping, which is the whole point of deriving the
 * inset instead of guessing it: PLATE_RULE.at is the line's centre and half its
 * thickness is added on, so this starts at the line's inner boundary exactly.
 * The band overhung the gold on both edges for several revisions because the
 * inset was a flat tenth — a number picked by eye, against a line nobody had
 * measured. Raise this if a seam ever needs opening; leave the derivation alone.
 */
const BAND_CLEAR = 0;

/**
 * Where the wash fades in and out along the band.
 *
 * The source's gradient runs transparent, opaque, opaque, transparent, and the
 * only thing left to choose is how much of each end the fade eats. An eighth,
 * which is enough that the ends are gone before the plate's own ornament starts
 * and not so much that the middle stops reading as flat.
 */
const BAND_RAMP = [
  [0, "rgba(255,255,255,0)"],
  [0.14, "rgba(255,255,255,1)"],
  [0.86, "rgba(255,255,255,1)"],
  [1, "rgba(255,255,255,0)"],
];

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
     * The verdict's own colour, laid over the plate — see BAND.
     *
     * Three sprites and not one nine-slice, because the wash and the two
     * hairlines fade along the same curve but are three different heights, and
     * a single stretched bitmap would have had to carry the hairline positions
     * baked into it — which is the one thing that cannot survive a band whose
     * height is a fraction of the screen.
     *
     * White art, tinted. A tint on white is exact, so the hexes read off the
     * game land on screen as themselves rather than as themselves multiplied by
     * whatever the texture happened to be.
     *
     * Above the plate and below the word: it is paint on the plate, and the
     * word is the hardest edge on the card and stays on top of everything.
     */
    const ramp = rampTexture("outcome-band", BAND_RAMP);
    this.bandWash = new Sprite(ramp);
    this.bandTop = new Sprite(ramp);
    this.bandBottom = new Sprite(ramp);
    this.bandParts = [this.bandWash, this.bandTop, this.bandBottom];
    this.bandParts.forEach((s) => {
      s.anchor.set(0.5);
      s.alpha = BAND_ALPHA;
      this.card.addChild(s);
    });
    this.paintBand();

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

    this.flash.clear();
    this.flash.rect(0, 0, w, h);
    this.flash.fill({ color: 0xffffff });

    /* ------------------------------------------------------------- the band */

    const room = s.w * PLATE_W[key];
    const ph = clamp(s.h * PLATE_H[key], 52 * ui, 150 * ui);
    const cy = s.y + s.h * PLATE_Y[key];

    this.card.position.set(s.cx, cy);

    fitFont(this.word, room * 0.62, ph * 0.54);
    this.word.position.set(0, 0);

    /**
     * THE PLATE KEEPS ITS OWN WIDTH, and this is the line that has to be read
     * before either of the two below it is touched.
     *
     * art/outcomeui.js gives this bitmap one licence and one only: it may be
     * stretched *vertically*. Everything between its two hairlines is a flat
     * vertical gradient, so pulling it taller distorts nothing. Its width is a
     * different matter — the gold chevron sits on the centre of each hairline,
     * and squeezing the plate horizontally squeezes the chevron with it, which
     * closes an ornament drawn at a right angle into a spike. It was cut to the
     * word's width for one revision and that is exactly what happened to it.
     *
     * So the plate is the frame, drawn at its own proportion — see
     * PLATE_ASPECT, which is where the chevron's right angle is protected — and
     * it is the *colour* that is cut to the word, inside the frame, which is
     * where it was asked to be. `room` is no longer the plate's width; it is
     * only the ceiling on the type.
     */
    const pw = Math.min(ph * PLATE_ASPECT * PLATE_STRETCH, s.w * PLATE_MAX_W);

    if (this.plate) {
      fitPlate(this.plate, pw, ph);
      this.band.clear();
    } else {
      this.drawBand(pw, ph);
    }

    /**
     * The verdict's colour, inside the frame the plate draws.
     *
     * Two insets, and they are different jobs. Across, the wash is the length of
     * the word and a half — see BAND_PAD — so it reads as a label around the
     * verdict rather than as a stripe across the screen. Down, it stops clear of
     * the plate's own gold hairlines, so the frame is still a frame: the gold
     * runs the full width above and below the colour, and the two chevrons on it
     * stay uncovered and undistorted.
     *
     * The coloured hairlines therefore bound the wash and not the plate. Gold
     * outside, the ending's colour inside.
     */
    const edge = Math.max(1, ph * BAND_EDGE);
    // The gold's inner edge, off the art — see PLATE_RULE — and the daylight
    // under it. Symmetric, because the plate's two rules are.
    const clear = ph * (PLATE_RULE.at + PLATE_RULE.thick / 2 + BAND_CLEAR);
    const head = clear;
    const foot = clear;
    const bw = clamp(this.word.width * BAND_PAD, ph * 2.4, pw);

    /**
     * The drop is taken off the top and never added to the bottom.
     *
     * BAND_DROP used to move all three sprites down together, which is the
     * obvious reading of "put it lower" and the wrong one: the bottom hairline
     * went with them and crossed the plate's gold, so the colour hung out of the
     * frame it is supposed to sit in. The bottom is the edge that cannot move.
     *
     * So the band is shortened from above instead. Its floor stays where the
     * inset put it, its ceiling comes down by the drop, and what is left is a
     * strip whose weight sits low in the frame — which is what the eye was
     * asking for. The gap above the colour is now about twice the gap below it,
     * and both are gold.
     */
    const drop = ph * BAND_DROP;
    const top = head + drop;
    const bh = Math.max(edge * 4, ph - top - foot);
    // Half the difference, because the two edges are inset by different amounts.
    const mid = (top - foot) / 2;

    this.bandWash.setSize(bw, bh);
    this.bandWash.y = mid;
    this.bandTop.setSize(bw, edge);
    this.bandTop.y = mid - bh / 2 + edge / 2;
    this.bandBottom.setSize(bw, edge);
    this.bandBottom.y = mid + bh / 2 - edge / 2;

    // Off the colour and not off the plate. The bloom is the light behind the
    // verdict, and the plate is now as wide as its own art wants to be rather
    // than as wide as the card — a glow measured off it would be a wash across
    // the whole frame instead of a lamp behind one word.
    this.bloom.position.set(s.cx, cy);
    this.bloom.setSize(Math.max(80, bw * 1.15), Math.max(80, ph * 3.4));

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
   * Put the verdict's colour on the band. See BAND.
   *
   * Called from `show`, once the result is known, and from the constructor so
   * that a card laid out before it is shown is never a white band waiting to be
   * told what it is.
   */
  paintBand() {
    const c = BAND[this.defeat ? "defeat" : "victory"];
    this.bandWash.tint = c.fill;
    this.bandTop.tint = c.edge;
    this.bandBottom.tint = c.edge;
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
    this.paintBand();

    /**
     * The room the verdict is read in, and the only place the result is allowed
     * to change this card's colour.
     *
     * The word is white on both endings — it is the one word in the creative
     * with a face of its own, and a coloured verdict is a verdict competing with
     * the band it is set in. What used to carry the loss was everything behind
     * it: the darkness went oxblood, the photograph of the fight went from cool
     * to burnt, and a red light was added under the whole frame.
     *
     * None of that is here any more. The room is the fight, blurred and
     * darkened, and it is the same room whichever way the fight went — see
     * SCRIM. The result is told by the band's colour and by the light behind
     * it, and by nothing else on the card.
     *
     * Set here rather than in the constructor because this is the first moment
     * the result is known, and re-set on every `show` rather than once because
     * a card can be shown, left, and shown again by a rematch.
     */
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
    if (this.still) this.still.tint = STILL_TINT;

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
