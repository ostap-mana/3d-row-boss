/**
 * The outcome card — the fight's verdict, the way the game itself gives it.
 *
 * The game does not stop a fight and put a scoreboard over it. It freezes the
 * frame, flashes, and lays one word inside a thin gold band with a line under it
 * asking to be tapped. That is the whole card, and it is over in three seconds.
 * This is that card.
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
 *   the fight itself   frozen sharp — see `freeze` and the note below
 *   the flash          drawn: one filled rectangle
 *   the band + word    one finished banner per ending — see art/outcomeui.js
 *   the tap line       S_TitleOrnamentLine out of the build, plus type
 *
 * Nineteen kilobytes of new art, and it takes forty-two out: the two result
 * skies this screen used to be set against are gone, because the backdrop is
 * now the fight the player was looking at a frame ago.
 *
 * ## There is no blur on this card
 *
 * There was, and it is off. The backdrop is the frozen frame at the resolution
 * the renderer drew it at — texel for pixel, no downsample, no stretch, no
 * filter. What is behind the verdict is the position the player just won or
 * lost, legible, and that is the whole of the argument: this card freezes the
 * frame instead of painting a sky precisely so the player sees the fight they
 * had, and every bit of softness spends some of that.
 *
 * Two things had to go for it to be sharp, and only one of them was the blur
 * proper. FREEZE_STEPS and FREEZE_LIFT below are the pyramid — halve the still
 * a few times, double it back up, and the linear sampling on the way is the
 * blur — and both are zero, so `freezeFight` runs no passes at all. The second
 * was quieter: the still used to be photographed at one device pixel per CSS
 * pixel and then drawn over a window rendered at two, which is a 2x bilinear
 * stretch and reads as blur whatever the pyramid is set to. See the resolution
 * note in `freezeFight` in main.js.
 *
 * The machinery is left in place rather than deleted, because FREEZE_STEPS is a
 * number that has moved four times. If the word ever stops holding against a
 * sharp board, the knobs are STILL_TINT and SCRIM first — they are what carry
 * the type now — and a halving here third.
 *
 * If a blur is ever wanted back, it is still not a BlurFilter: that is a
 * full-screen shader pass every frame, on the one screen in the creative that
 * runs while the webview is also decoding an end card, and it is the kind of
 * thing that shows up as a dropped frame on exactly the cheap hardware a
 * playable has to survive. The pyramid is the cheap version and it is why it is
 * still here.
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
  VERDICT_ART,
  aimVerdict,
  fitLine,
  fitVerdict,
  lineSprite,
  verdictSprite,
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
 * ZERO — the blur is off, and the card's backdrop is the frozen frame at the
 * size it was taken. `freezeFight` runs no pyramid at all at this value: the
 * loop does not execute, the lift below is clamped to nothing, and the texture
 * the card holds is the photograph.
 *
 * It has been 3, then 2, and is now none. The argument that took it down each
 * time is the same one that finally took it off: what is behind the verdict is
 * supposed to be *the fight the player just had* — that is the entire reason
 * this card freezes the frame instead of painting a sky — and every halving
 * spends some of that. At three it was grey soup. At two the arena was a room
 * again but the board was still mush. At none the player sees the position they
 * lost, which is the most that argument can ask for.
 *
 * What it costs is the thing the blur was doing for the type: a sharp board
 * under a white headline competes with it, and the gems are the busiest, most
 * saturated thing this creative owns. STILL_TINT and SCRIM are now carrying
 * that alone — the tint pulls the gems towards neutral and the scrim darkens
 * the frame top and bottom. If the word ever stops holding against the picture,
 * those two are the knobs, and putting a halving back here is the third.
 *
 * The pyramid itself is left intact in main.js rather than deleted, because
 * this is a number that has moved four times. One is a light blur and costs a
 * quarter-size texture; see FREEZE_LIFT for how the way back up is drawn.
 *
 * Exported because main.js is what takes the still — see `freezeFight` there.
 */
export const FREEZE_STEPS = 0;

/**
 * How many of those halvings are undone again before the card is handed the
 * still.
 *
 * ZERO, because FREEZE_STEPS is: there is nothing to climb back up from, and
 * `freezeFight` clamps this to the number of halvings that actually happened.
 * Everything below is about what this is for when the blur is switched back on
 * — put a halving in above and put a 1 here with it.
 *
 * This is the other half of the backdrop's fix, and it is the half that was not
 * a matter of taste. A small still handed straight to a full screen sprite is
 * one bilinear stretch, and a bilinear stretch is a tent filter as wide as the
 * stretch: blow a picture up eight times in one pass and every source texel
 * arrives as a diamond with a hard crease along its edges, which the eye reads
 * as blocks and not as blur. That is what this card's backdrop was — not too
 * blurred so much as badly *drawn* — and no amount of tuning FREEZE_STEPS fixes
 * it, because the lattice is a property of the last stretch whatever is being
 * stretched. Doubling in steps runs the tent over a picture that has already had
 * one, and tents stacked on tents converge on a gaussian.
 *
 * One and not two, so the texture the card keeps is a quarter of the pixels a
 * full size one would be. The last doubling still happens on screen, and by then
 * it is a 2x on a picture with no half-size detail left in it to break — which
 * is exactly what was not true of the 8x. Lifting the whole way is the honest
 * version and costs a full screen texture held for the life of the card to look
 * the same.
 *
 * Never more than FREEZE_STEPS: there is nothing above the size it was taken at
 * to climb back to. `freezeFight` clamps it.
 */
export const FREEZE_LIFT = 0;

/**
 * THE FALLBACK BAND'S COLOUR, and that is now all this pair is for.
 *
 * Read off the shipped game's own outcome windows rather than invented: the band
 * behind VICTORY is a green wash with a brighter green hairline top and bottom,
 * and the one behind DEFEAT is the same shape in dark red. `fill` is the wash
 * and `edge` the hairline.
 *
 * These used to be paint on the screen. The card built its verdict out of the
 * game's title plate with three tinted gradient sprites laid inside its
 * hairlines, and this was the one thing the result was allowed to repaint. The
 * banners in art/outcomeui.js are finished art — plate, wash, both hairlines,
 * both chevrons and the word, in one bitmap — so there is nothing left on screen
 * for a tint to reach.
 *
 * What still reads them is the band the card draws for itself when no banner
 * decoded, and drawing that in the ending's colour rather than in plain navy is
 * worth the two lines: a device that cannot read a webp still gets green under
 * VICTORY and red under DEFEAT. See drawBand.
 *
 * Both values are the source hues scaled until their luminance matches — green
 * carries most of its own, so 0x43c750 came out at 162 on the 709 curve against
 * the red's 95, and the two endings landed at visibly different weights.
 */
const BAND = {
  victory: { fill: 0x1b4a1a, edge: 0x27752f },
  defeat: { fill: 0x6b3030, edge: 0xc74343 },
};

/**
 * The coloured hairline's thickness, as a share of the band's height.
 *
 * Off the source: 415.8 by 84.23 at a 2.13 border. A share and not a fixed
 * number of points, so it stays a hairline on a tablet and does not vanish on a
 * phone.
 */
const BAND_EDGE = 2.13 / 84.23;
const BAND_ALPHA = 0.9;

/**
 * The banner's width, as a share of the safe box — and the ceiling on the
 * height that width implies.
 *
 * Width is the only thing there is left to choose. The banner is 3.068:1 with
 * the word painted inside it, and art/outcomeui.js gives it no licence to be
 * anything else: it takes a width and gives back its own height. See
 * VERDICT_ART and `fitVerdict`.
 *
 * The plate this replaced was 11.24:1 and was pulled into whatever box the card
 * handed it — 1.06 of the stage upright, deliberately wider than the screen, so
 * its fades ran off both edges and left two hairlines crossing the frame. That
 * does not carry over. Run a banner past the edge and it loses a chevron and
 * then the word, so it is contained instead: 0.92 upright leaves a margin for
 * the fades to die in, which is what the art is drawn to do.
 *
 * The height is a cap and not a target, and upright it never bites — 0.92 of a
 * 390-point phone comes back 117 points tall against a cap of 117, which is the
 * height the stretched plate was given and is not a coincidence. Laid on its
 * side the stage is wide and short, and a band at 0.92 of it would be a third of
 * the screen; past the cap the width is taken back off the height, so the aspect
 * survives and the band gets smaller instead of squarer.
 */
const VERDICT_W = { portrait: 0.92, landscape: 0.46 };
const VERDICT_H = { portrait: 0.15, landscape: 0.24 };

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

    /** Drawn, and only ever reached when no banner decoded. See drawBand. */
    this.band = new Graphics();
    this.card.addChild(this.band);

    /**
     * The verdict, whole, in one bitmap.
     *
     * Plate, wash, both hairlines, both chevrons and the word — see
     * art/outcomeui.js. One sprite built on the win and re-aimed on a loss,
     * because a rematch can show this card twice and swapping a texture is free
     * where adding and removing a child mid-flight is a thing that can go wrong.
     *
     * What it replaced was four pieces held in register: the game's title plate
     * stretched into a box, three tinted gradient sprites laid inside its
     * hairlines to make the ending's colour, and the verdict set in type over
     * the lot — each of them re-solved against the others on every aspect ratio
     * a phone has. A finished bitmap has no registration problem, and the
     * arithmetic that used to be `resize` went with it.
     */
    this.verdict = verdictSprite(false);
    if (this.verdict) this.card.addChild(this.verdict);

    /** Whether the banner is showing the ending it was asked for. See `aim`. */
    this.painted = false;

    /**
     * The word, set in type — and normally not on screen at all.
     *
     * The banner has the verdict painted into it, in the face the artist set it
     * in, so this is hidden the moment one decodes. What it is for is the device
     * that could read none of them: the drawn band needs something to say, and a
     * card that came up as a coloured stripe with no word on it is worse than no
     * card at all. `aim` is what raises and lowers it.
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
    // Both of the above exist now, so the card can be told which of the two it
    // is showing. A layout can arrive before `show` does.
    this.aim();

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

    const cy = s.y + s.h * PLATE_Y[key];
    this.card.position.set(s.cx, cy);

    /**
     * WIDTH IS THE ONLY THING THIS DECIDES, and that is the whole of the band's
     * layout now.
     *
     * The banner is finished art with the word painted inside it, so it takes a
     * width and gives back the height its own aspect implies — see VERDICT_ART
     * and `fitVerdict`. What stood here was the arithmetic of holding four
     * pieces registered against each other inside a stretched plate: an aspect
     * to protect the chevron's right angle, a ceiling to keep the chevron on
     * screen, a horizontal stretch to run the gold further out, and an inset
     * derived off the plate's own hairline so the colour met the gold and did
     * not cross it. None of it survives the art being one bitmap, and none of it
     * is missed.
     *
     * The cap is the one thing that can still take the width off its own share.
     * See VERDICT_H — it is landscape that needs it.
     */
    const cap = clamp(s.h * VERDICT_H[key], 52 * ui, 150 * ui);
    let pw = s.w * VERDICT_W[key];
    let ph = (pw * VERDICT_ART.h) / VERDICT_ART.w;
    if (ph > cap) {
      ph = cap;
      pw = (ph * VERDICT_ART.w) / VERDICT_ART.h;
    }

    if (this.painted) {
      // Taken back off `fitVerdict` rather than trusted: `ph` above and the
      // height the art module works out are the same division done in two files,
      // and the bloom below is hung off whichever one actually drew.
      ph = fitVerdict(this.verdict, pw);
      this.verdict.position.set(0, 0);
      this.band.clear();
    } else {
      // Nothing decoded for this ending. The card draws its own band, and the
      // word — painted into the art, and hidden whenever there is art — is the
      // type that goes in it. See drawBand and `aim`.
      this.drawBand(pw, ph);
      fitFont(this.word, pw * 0.62, ph * 0.54);
      this.word.position.set(0, 0);
    }

    // Off the word's own extent inside the banner rather than off the whole of
    // it: the bloom is a lamp behind the verdict, and a banner fades to nothing
    // at both ends — a glow measured off the full width would be a wash across
    // the frame instead of a light behind one word.
    this.bloom.position.set(s.cx, cy);
    this.bloom.setSize(Math.max(80, pw * 0.62), Math.max(80, ph * 3.4));

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
   * Point the banner at the ending, and record whether there was one.
   *
   * Called from `show`, once the result is known, and from the constructor so
   * that a card laid out before it is shown is never a banner waiting to be told
   * what it is.
   *
   * `painted` is what the layout reads. False means nothing decoded for *this*
   * ending and the card falls back to its own drawn band with its own type — a
   * per-ending answer and not a per-device one, since a build can ship a victory
   * banner that decodes and a defeat one that does not. So it is asked again on
   * every show rather than settled once here.
   */
  aim() {
    this.painted = this.verdict ? aimVerdict(this.verdict, this.defeat) : false;
    if (this.verdict) this.verdict.visible = this.painted;
    this.word.visible = !this.painted;
  }

  /**
   * The band, drawn — reached only when no banner decoded.
   *
   * The banner reduced to the three things it cannot do without: the plate's
   * navy, the ending's wash with its own hairline bounding it, and the gold rule
   * over each edge. No chevron and no serif — a drawn ornament that is not the
   * painted one is worse than none at all, and the word over this is the card's
   * own type. See `aim`.
   */
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
    this.aim();

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
