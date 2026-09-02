/**
 * Hero cards.
 *
 * All five act. Every match is a volley the whole row fires — see `strike` and
 * HeroRow.strikeOrder — every card charges off its own colour, and every card
 * has an ultimate the player can spend. The four who used to be silhouettes
 * promising a roster are the roster.
 *
 * And they have faces now: the portrait is the painted bust from src/avatars —
 * see avatars.js — not the drawn cowl, which survives only as the stand-in for
 * a hero whose art is missing.
 */

import { Container, Graphics, Sprite, Text, Rectangle } from "pixi.js";
import {
  DIFFICULTY,
  GEM_COLORS,
  GEM_DARK,
  GEM_LIGHT,
  FONT,
  HEROES,
  HERO_CRITICAL,
  HERO_HP_FLOOR,
  HERO_MAX_HP,
  HERO_MAX_CHARGE,
} from "../config.js";
import { drawGemShape, gemTexture } from "./gems.js";
import { cardPlate } from "./plates.js";
import {
  cardFrameSprite,
  cardFrameRadius,
  cardFrameClip,
  fitCardFrame,
} from "./cardframe.js";
import {
  ultBorder,
  ultBurst,
  ultLoopTexture,
  ultBurstTexture,
  fitUltBorder,
} from "./ultborder.js";
import {
  barTroughTexture,
  manaPaintTexture,
  hpPaintTexture,
  BAR_INSET,
} from "./cardbars.js";
import { heroBust, heroRoundel } from "./avatars.js";
import { glowTexture, gradientTexture } from "./textures.js";
import { getRenderer } from "../core/context.js";
import { tween, tweenValue, delay, killTweensOf, Ease } from "../core/tween.js";
import { lerpColor } from "../core/color.js";
import { fitFont } from "../ui/text.js";
import * as sfx from "../audio/sfx.js";

const ART = 128;

const HP_GOOD = 0x4ee27a;
const HP_LOW = 0xff3b2f;
/** Colour the card flashes through when it eats a hit. */
const HURT_FLASH = 0xff4a3a;
/** Rest tint of a hero who has been knocked out. */
const DOWN_TINT = 0x6a6270;

/**
 * How much of a cover fit's vertical overflow is taken off the bottom rather
 * than shared with the top. 0 centres the bust the way a cover fit does by
 * default; 0.5 puts the top of the art flush with the top of the card.
 *
 * 0.34 keeps a little air over the head — a crown clipped by a millimetre reads
 * worse than one with room, and these six are the roster this creative is
 * selling.
 */
const HEAD_BIAS = 0.34;

/**
 * The wash the card's readouts sit on, and how far up the card it runs.
 *
 * Drawn by the card rather than baked into the bust — see avatars.js, which
 * still lays the hero's own element colour over the bottom of the art. The
 * difference matters: the bust is square and the card is not, so the card
 * cover-fits it and crops whatever runs past the short side. A scrim painted
 * into the art therefore lands wherever the crop leaves it, and on a card wider
 * than it is tall the dark end of it falls off the bottom edge entirely — which
 * is exactly where the name is, and why the name was reading over a chin.
 *
 * There is only one of these now. The card used to carry a second wash across
 * the top to hold a health bar up there, and between the two of them the
 * portrait was fenced in at both ends. Everything the card has to say is said
 * along one edge instead — see `readouts` — so the top of the tile is the hero
 * and nothing else.
 */
const FOOT_SCRIM = [
  [0, "rgba(9,5,16,0)"],
  [0.45, "rgba(9,5,16,0.46)"],
  [1, "rgba(9,5,16,0.93)"],
];
const FOOT_BAND = 0.46;

/**
 * The element sigil every card wears in its top left corner.
 *
 * The card says its element three other ways — the frame's hue, the plate under
 * the art, the wash along the bottom — and all three are colour. Colour alone is
 * a poor thing to hang the one mechanic the row runs on: which gem charges which
 * hero. At card size, in a row of six, the orange one and the gold one are the
 * same card, and a player who cannot tell them apart cannot tell why their match
 * lit the hero it did. The sigil is that reading in a shape.
 *
 * It is the board's own gem and nothing else — see gemTexture. No disc behind
 * it, no ring around it: the gems are opaque roundels that carry their own edge,
 * and at pip size a backing plate and a rim read as two more circles drawn round
 * a circle. What the player is being pointed at is the thing they are matching,
 * so the card shows them exactly that and no ornament of its own.
 *
 *   k, min, max  the pip's box, taken off the card's short side and then held
 *                between the two so it stays a pip on a tall card and stays
 *                legible on a small one.
 *   gap          how far in from the inside of the frame it sits, as a share of
 *                that same short side. Wide, and deliberately: this is the one
 *                number that decides whether the card's top left corner reads
 *                as a corner or as a gem wedged into an arc, and the old 0.05
 *                was the latter.
 */
const SIGIL = { k: 0.32, min: 13, max: 30, gap: 0.085 };

/**
 * The animated border a charged card wears, and the flare it throws when the
 * ultimate is actually spent — see art/ultborder.js, which owns the art and the
 * geometry. These four numbers are only how loudly the card wears it.
 *
 * `alpha` is the one worth arguing about, because the card used to carry light
 * of its own and it was taken off: a wash over the portrait and a halo off the
 * border, breathing on the ready pulse, six of them under a board whose subject
 * is the boss. What comes back here is deliberately not that. It is only on the
 * border, it is only on a card the player can actually spend, and at 0.85 over
 * a sheet that is already hot along its own line the border reads as lit rather
 * than as blooming. Turn it down here if a row with two charged cards in it ever
 * pulls the eye off the fight; there is nothing else to tune.
 *
 * The tap is either of the next two, depending on what art the element has.
 *
 * `burst` is the good one: a sheet of its own — a build, a white-hot peak and a
 * settle — played once, straight through. `lead` is what the cut-in waits for
 * before it takes the screen, and it is the only number here the *fight* can
 * feel: the cut used to land a tenth of a second after the tap, which over a
 * burst would have shown the player its first two frames and then a black
 * rectangle. At `lead` the cut lands on the peak instead. See `flareLead`,
 * which is what the director asks, and Director.castUltimate, which asks it.
 *
 * `flare` is the fallback for the four elements with no burst sheet: `rate`
 * spins the loop's own frames faster and `grow` throws them outwards,
 * which is what the still set needed a second painted file for — see the burst
 * in art/frameaura.js. It keeps the old tenth of a second of lead, because
 * there is no arc in it to wait for.
 */
const ULT = {
  alpha: 0.85,
  in: 0.26,
  out: 0.22,
  burst: { grow: 1.06, dur: 0.62, lead: 0.42, tail: 0.72 },
  flare: { grow: 1.18, rate: 2.6, dur: 0.3, lead: 0.1 },
};

/** element -> drawn-shape fallback, baked at most once each */
const sigils = {};

/**
 * The gem for one element, at pip size.
 *
 * Almost always the board's own texture, handed straight over. The bake below is
 * only reached before initGemTextures has run, which the scene's build order
 * rules out — see main.js — and is kept because a texture this file cannot
 * produce is not a reason for a card to be built without its element on it.
 */
function elementSigil(element) {
  const board = gemTexture(element);
  if (board) return board;
  if (sigils[element]) return sigils[element];

  // The same padded box the board's bakes use, so both kinds size alike.
  const ART = 100;
  const PAD = 8;
  const holder = new Graphics();
  holder.rect(-ART / 2 - PAD, -ART / 2 - PAD, ART + PAD * 2, ART + PAD * 2);
  holder.fill({ color: 0xffffff, alpha: 0 });
  drawGemShape(holder, element);

  const tex = getRenderer().generateTexture({
    target: holder,
    resolution: 2,
    antialias: true,
  });
  holder.destroy();
  sigils[element] = tex;
  return tex;
}

let portraitTextures = null;
let cardArtTextures = null;

/**
 * Bake the six portraits once — roundels for the cut-in and the end card, and
 * the full-bleed card art for the row.
 *
 * Painted busts where src/avatars has one — see avatars.js — and the drawn
 * hooded figure for whoever it does not, which is now nobody: all six elements
 * have art, so the cowl is only reached by a file that fails to decode. The
 * fallback is the same texture in both sets: it was authored to sit inside a
 * card, and there is no second framing of it to bake.
 */
function initPortraits() {
  if (portraitTextures) return portraitTextures;

  const drawn = HEROES.map((hero) =>
    heroRoundel(hero.element) && heroBust(hero.element)
      ? null
      : drawnPortrait(hero),
  );
  portraitTextures = HEROES.map(
    (hero, i) => heroRoundel(hero.element) || drawn[i],
  );
  cardArtTextures = HEROES.map((hero, i) => heroBust(hero.element) || drawn[i]);

  return portraitTextures;
}

/**
 * The old hooded silhouette, still the stand-in for a hero with no bust.
 *
 * Kept whole rather than trimmed to the one element that needs it: a seventh
 * element, or a file that fails to decode, has to land on something.
 */
function drawnPortrait(hero) {
  const renderer = getRenderer();
  const el = hero.element;
  const g = new Graphics();

  g.rect(-ART / 2, -ART / 2, ART, ART);
  g.fill({ color: 0xffffff, alpha: 0 });

  // Element crest, high enough to read behind the cowl
  const crest = new Graphics();
  drawGemShape(crest, el);
  crest.scale.set(0.92);
  crest.y = -22;
  crest.alpha = 0.3;

  // Cloak
  g.moveTo(-58, 64);
  g.quadraticCurveTo(-48, -4, -20, -24);
  g.lineTo(20, -24);
  g.quadraticCurveTo(48, -4, 58, 64);
  g.closePath();
  g.fill({ color: GEM_DARK[el] });
  g.stroke({ width: 5, color: 0x0d0812, alpha: 0.9 });

  // Cloak shading on the left half
  g.moveTo(-58, 64);
  g.quadraticCurveTo(-42, 2, -16, -22);
  g.lineTo(-4, -24);
  g.lineTo(-10, 64);
  g.closePath();
  g.fill({ color: 0x000000, alpha: 0.24 });

  // Collar V
  g.moveTo(-30, 12);
  g.lineTo(0, 44);
  g.lineTo(30, 12);
  g.stroke({ width: 6, color: GEM_COLORS[el], alpha: 0.85 });

  // Chest emblem
  g.circle(0, 30, 13);
  g.fill({ color: 0x0b0713, alpha: 0.85 });
  g.circle(0, 30, 13);
  g.stroke({ width: 3.5, color: GEM_LIGHT[el], alpha: 0.9 });
  g.circle(0, 30, 5.5);
  g.fill({ color: GEM_LIGHT[el] });

  // Hood — pointed cowl rather than a round blob
  g.moveTo(-36, 10);
  g.quadraticCurveTo(-42, -48, -6, -68);
  g.lineTo(4, -70);
  g.quadraticCurveTo(42, -48, 36, 10);
  g.quadraticCurveTo(0, 26, -36, 10);
  g.closePath();
  g.fill({ color: GEM_COLORS[el] });
  g.stroke({ width: 5, color: 0x0d0812, alpha: 0.9 });

  // Hood rim highlight
  g.moveTo(-34, 2);
  g.quadraticCurveTo(-38, -44, -4, -62);
  g.stroke({ width: 5, color: GEM_LIGHT[el], alpha: 0.75 });

  // Face in shadow
  g.ellipse(0, -12, 23, 27);
  g.fill({ color: 0x0a060e, alpha: 0.97 });

  // Eye glow, then the eyes themselves
  g.ellipse(-10, -14, 11, 7);
  g.fill({ color: GEM_COLORS[el], alpha: 0.32 });
  g.ellipse(10, -14, 11, 7);
  g.fill({ color: GEM_COLORS[el], alpha: 0.32 });
  g.poly([-17, -17, -4, -14, -17, -9]);
  g.fill({ color: GEM_LIGHT[el] });
  g.poly([17, -17, 4, -14, 17, -9]);
  g.fill({ color: GEM_LIGHT[el] });

  // Shoulder trim
  g.moveTo(-54, 42);
  g.quadraticCurveTo(0, 22, 54, 42);
  g.stroke({ width: 6, color: GEM_LIGHT[el], alpha: 0.45 });

  const holder = new Container();
  holder.addChild(crest, g);
  const tex = renderer.generateTexture({
    target: holder,
    // Bakes big enough to stay sharp when the cut-in blows it up full screen.
    resolution: 3,
    antialias: true,
  });
  holder.destroy({ children: true });
  return tex;
}

/** Baked roundel for a hero index — shared by the cut-in and the end card. */
export function heroPortrait(index) {
  return initPortraits()[index];
}

/** The same hero's card art: the bust edge to edge, scrim and all. */
function heroCardArt(index) {
  initPortraits();
  return cardArtTextures[index];
}

/**
 * The rim the trough art used to carry, as a fraction of the bar's depth, and
 * the seed for every proportion in the readout stack: the type's air, the space
 * between the two bars, and the weight of the outline on the numbers.
 *
 * The same number as BAR_INSET, which is where it is measured — this is a second
 * name for it rather than a second value, because everything below reads it as a
 * rim rather than as an inset and the arithmetic is unreadable otherwise.
 *
 * Used to, because the gauge is unframed now and the packer drops that rim
 * before it ships the track — see cardbars.js. It stays as the measure the stack
 * is spaced by: it is a proportion off the art either way, and a layout keeps
 * its rhythm whether or not the edge it was taken from is still being drawn.
 */
const BAR_RIM = BAR_INSET;

/**
 * Where the card's readouts sit, measured up from its bottom edge.
 *
 * One stack, not three placements. The name used to sit in the middle of the
 * art, the health bar rode the top edge and the charge bar the bottom, so a tile
 * the size of a thumbnail was fenced at both ends and captioned across the
 * middle. Read up from the bottom they are a caption and two gauges, and the
 * whole top half of the card is the hero.
 *
 * The two gauges are the same width and the same height as each other, and both
 * are wide enough to carry their own numbers. The charge used to be a hairline
 * along the bottom edge at two thirds the health bar's height and a different
 * width again — trim rather than a gauge — on the reasoning that a second,
 * slower number deserved less. It is a gauge: a party screen shows health over
 * charge as a matched pair, and the moment either one has to say `8000 / 8000`
 * the argument for a hairline is over.
 *
 * The foot is what keeps the lower gauge clear of the painted frame rather than
 * merely inside the card. The border is the hero's own colour and so is the
 * charge; with the two touching they read as one thick edge with a bright patch
 * on it.
 *
 * One width for all three. The name used to be fitted to 0.92 of the card while
 * the bars kept to 0.86, which is a difference small enough to look like a
 * mistake rather than a decision: every name longer than ARISSA overhung the
 * gauges under it by a couple of points at each end, and three stacked things at
 * two different widths never settle. `barW` is the measure now, and the name and
 * the READY that replaces it are fitted to it.
 *
 * The gap is two rims deep — see BAR_RIM. At one rim the two bars very nearly
 * touched and read as a single double-height widget with a scratch across the
 * middle of it; at two they are two gauges. Spacing a stack by the weight of the
 * border inside it is the cheapest kind of rhythm there is: nothing in the layout
 * needs a number of its own, and if the trough art is ever redrawn with a deeper
 * rim the whole stack loosens with it.
 *
 * A bar's depth is BAR_SHARE of the card, and a bar with a reading in it is
 * also never shallower than the depth that reading needs — see READOUT_MIN, and
 * readoutDepth, which is the fit below solved for the depth. On anything roomier
 * than a phone the share is the deeper of the two and the stack is proportional
 * to the card it stands on. On a phone the floor is, and that is the whole of
 * this card's difficulty: six cards across a 390 point screen is 56 points each,
 * 8.8% of which is a gauge whose digits stand six points tall.
 *
 * So the floor is paid once rather than twice. The health bar takes it, because
 * health is the number the fight is actually spending. The charge bar keeps its
 * share and says what it has to say without printing anything — it is a bar
 * filling up, the sigil in the card's corner already says whose colour fills it,
 * and the card lights its whole frame and prints READY the moment it is full.
 * A number on it was the third reading on a 56 point card and the one nobody
 * needed.
 *
 * That is nine points of bust on a phone, and it is the difference between a
 * portrait cropped under the eyes and one with a chin in it. Both bars print
 * again the moment the card is deep enough that the share carries them on its
 * own — about 150 points, which is a landscape card or a tablet.
 */
function readouts(w, h) {
  const floor = readoutDepth(READOUT_MIN);
  const share = h * BAR_SHARE;
  const manaReads = share >= floor;
  const hpH = Math.max(floor, share);
  const manaH = manaReads ? hpH : Math.max(2, share);
  const gap = Math.max(1, hpH * BAR_RIM * 2);
  const manaY = h / 2 - Math.max(3, h * 0.07) - manaH;
  return {
    hpH,
    manaH,
    manaReads,
    gap,
    manaY,
    hpY: manaY - gap - hpH,
    barW: w * 0.86,
  };
}

/**
 * A gauge's depth as a share of the card it is on.
 *
 * The proportion the stack is drawn at wherever the card is big enough to have
 * the choice, and the number READOUT_MIN is measured against to find out whether
 * it is.
 */
const BAR_SHARE = 0.088;

/**
 * Hitzone's own metrics, measured off the shipped WOFF2 rather than assumed.
 *
 * Taken from the 400 cut, which is the one that draws here: the readout asks
 * for FONT at weight 700, FONT heads on plain Hitzone, and that family is
 * registered across the whole weight scale — see ui/fonts.js — so 700 lands on
 * the 400 file exactly rather than on Hitzone Med.
 *
 *   cap      how far a digit reaches above the baseline, as a fraction of the
 *            type size. 0.713, against the 0.825 of the Oswald this replaced:
 *            a lower cap, so the rule below draws the numbers about a seventh
 *            larger to fill the same bar to the same depth of ink.
 *   descend  how far one reaches below it. 0.008, which is a hair of overshoot
 *            on the round digits and nothing else: the ink of a line of numerals
 *            is its cap height and no more.
 *   advance  the width of the widest digit, which is `0`. Hitzone's figures are
 *            proportional and not tabular — `1` is nearly a third narrower — so
 *            this is the guard a reading is fitted against and not a promise
 *            that a tick from 999 to 1000 grows by exactly one digit's width.
 *
 * Re-measure if the face or the weight changes; the type sizing below is derived
 * from these and nothing else. These readouts are the one place in the game
 * whose type size is not fitted at runtime but solved from the three numbers
 * here, so a face with its own cap height draws at the last face's size until
 * they are taken again.
 */
const HITZONE = { cap: 0.713, descend: 0.008, advance: 0.617 };

/**
 * How the numbers are fitted to the bar they sit in.
 *
 * The bar hands the type its size rather than the other way round, and it hands
 * it over through the rim its art was drawn with. Writing that rim as `r` and
 * the bar's depth as `u`: `r = u * BAR_INSET` ran along the top and the bottom,
 * so the bore between them was `u - 2r`. Take half a rim off each side of that
 * bore and what is left is the cap height:
 *
 *     cap = u - 3r
 *
 * which is 0.64 of the bar. The rim is no longer drawn — see BAR_RIM — and the
 * measure it left behind is still the right one: it is the air this type wants
 * over a bar of this depth, and it was never arrived at by tuning. The air over the
 * digits is half the weight of the border above them, and so is the air under —
 * the type's margin is measured off the same file as the edge it stands off, and
 * that is the whole rule. There is no tuned number in it: the type size falls out
 * as `cap / HITZONE.cap`, which is 0.898 of the bar's depth.
 *
 * It was a whole rim each side — `cap = u - 4r`, digits with as much air over
 * them as the border holding them — and on a screen where the numbers are
 * legible at all that is the better setting of the two. On a phone they were not
 * legible at all: the same rule on a 56 point card gives six points of cap, and
 * the half rim it hands back is a fifth of the height of every digit on the row.
 * What is left is still air — a quarter of a rim, once the outline has taken its
 * half — and the outline is doing the job the rest of it was doing, which is
 * holding the ink off the border.
 *
 *   width  of the bar, before fitFont starts shrinking. The reading is the hero's
 *          own number and nothing else — see drawHpBar — so the longest it ever
 *          runs is `8000` at 2.2 em, which lands at two thirds of the bar: it is
 *          never actually shrunk at the sizes the row is drawn at, and it keeps
 *          better than a digit's width of air at each end. This is the guard for
 *          a longer reading, not the thing that sets the type.
 *   track  of the em. Small positive tracking, because tabular figures set solid
 *          at six points close up, and the counters in 8 and 0 are the first
 *          thing to go.
 *
 * There is no vertical correction here, and there were two before. Numerals have
 * no descender — see HITZONE.descend — so a line of them is centred on a box with
 * empty space along one edge, and both earlier attempts were constants tuned to
 * put the ink back on the bar's centre line. Both drifted the moment anything
 * else moved, because what was actually throwing the ink off was the outline: at
 * a fifth of the em it was heavy enough that the padding Pixi reserves for it
 * shifted the box out from under the digits. At half a rim it does not, and the
 * type centres on its own box to the pixel — measured at 0 offset with equal air
 * above and below on both bars. The fix for a fudge factor was to find the thing
 * it was compensating for.
 */
const READOUT_TYPE = { width: 0.82, track: 0.02 };

/**
 * The smallest a gauge's numbers are allowed to be, in points on the glass —
 * which is what every size in this file is, the app running at autoDensity.
 *
 * The one number in the readout stack that is not a proportion, and it is not one
 * on purpose. Everything else here is a share of the card, and a share is exactly
 * the wrong thing for type to be when the card is 56 points wide: six points of
 * cap is sharp on a retina screen and unreadable at arm's length, which is the
 * only distance this thing is ever seen from. So the bar is at least deep enough
 * to carry this size, and the numbers are legible before the layout is tidy.
 *
 * 10.5 sits under the rest of the chrome — the boss's name and the doom strip
 * are set at 11 to 15 points on the same screen — and it is meant to: those are
 * read across a whole screen and this is read inside a bar 48 points wide, on a
 * card the player is looking straight at because they are about to tap it.
 *
 * It was 13, which is a size the chrome elsewhere would be pleased with and this
 * card cannot afford. Every point of type here is a point and a quarter of bar
 * depth, that depth was being paid twice — see readouts, which now pays it once
 * — and the two of them together were spending 42% of a phone card on two bars.
 * The portrait behind them was cropped under the eyes: six heroes, six foreheads.
 * At 10.5 with the charge bar on its own share the bars are 20%, and there is a
 * chin in every card.
 */
const READOUT_MIN = 10.5;

/**
 * The smallest a gauge is allowed to set `3587 / 3587` at before it gives the
 * maximum up and prints the current value on its own.
 *
 * The pair is the reading a party screen wants and the one the mockup asks for:
 * a bar says how much is left, and only the pair says how much that is out of.
 * It costs width — eight digits, a slash and two spaces is about 5.5 em of
 * tabular figures against a little over two for `3587` — and that width is
 * exactly what a phone has not got. Six cards across a 390 point screen leaves a
 * bar 48 points wide, which sets the pair at seven points: not a maximum, a
 * smudge where a maximum used to be. That arithmetic is why the reading was the
 * current value alone everywhere, and it only ever ruled against the pair on a
 * phone — a card 100 points wide carries it at the full size with air to spare.
 *
 * So the pair is asked for first and dropped when it cannot be read. 11 points
 * is the bottom of the chrome elsewhere on the screen — the boss's name and the
 * doom strip run 11 to 15 — and two under READOUT_MIN, because a maximum is the
 * quieter half of a reading and may sit a shade smaller than the number that
 * actually moves. Below it the card keeps the number that changes and lets the
 * paint say the rest: the bar stops where the reading stops, which is the
 * maximum drawn rather than printed.
 */
const READOUT_PAIR_MIN = 11;

/**
 * The fit above, solved each way round: the size a bar of depth `u` carries, and
 * the depth a size of type asks for.
 *
 * Two functions rather than one constant because the two ends of the stack need
 * opposite directions of the same rule. A gauge that has been placed asks what
 * size its numbers come out at; the layout, which has a floor under those numbers
 * and no type to measure, asks how deep a bar has to be to carry them. Written
 * once, so a redrawn trough with a different rim moves both.
 */
function readoutSize(u) {
  return (u * (1 - BAR_RIM * 3)) / HITZONE.cap;
}

function readoutDepth(size) {
  return (size * HITZONE.cap) / (1 - BAR_RIM * 3);
}

/**
 * One gauge on a hero card: a trough, the paint lying in it, and the numbers
 * over the top.
 *
 * Both of a card's gauges are one of these. They were two separate piles of
 * sprites and Graphics calls that did nearly the same thing in nearly the same
 * way — the health bar drew its own trough and filled it with a flat colour, the
 * charge wore the packed trough and a gradient — and the moment the mockup asked
 * for two identical bars, keeping them apart bought nothing but two places to
 * fix every bug.
 *
 * Everything is a sprite except the fallbacks. A trough is a lit rim the card
 * cannot draw and a paint is a bevel, and a Graphics fill takes a colour, not a
 * ramp. Both are anchored top left so a reading grows out of the trough's own
 * left end.
 *
 * Either piece of art can be missing — see cardbars.js, where nothing ever
 * rejects — and then the Graphics underneath draws what the card drew before any
 * of this was art: a dark track, a flat fill, a white gloss band over its top
 * half, and a pale rim around the lot. A plainer gauge, not a missing one. The
 * numbers do not depend on any of it and are always there.
 *
 * Every corner in here is square, drawn and packed alike. The gauge wore a
 * stadium — the trough's bore, the paint lying in it, and the rim over the top
 * all rounded to half the bar's depth — and at the four-odd points a bar is
 * drawn at on a phone, half its depth of radius at each end is most of the bar:
 * a pill with a reading in it rather than a gauge. Squared, the two of them read
 * as the boxes the name plate and the frame around them already are.
 */
class Gauge extends Container {
  constructor(paint) {
    super();

    /** Trough fallback, fill fallback, and the rim — drawn, in that order. */
    this.g = new Graphics();
    this.addChild(this.g);

    const trough = barTroughTexture();
    this.trough = null;
    if (trough) {
      this.trough = new Sprite(trough);
      this.trough.anchor.set(0, 0);
      this.addChild(this.trough);
    }

    this.paint = null;
    if (paint) {
      this.paint = new Sprite(paint);
      this.paint.anchor.set(0, 0);
      this.addChild(this.paint);
    }

    // Over the paint, and white with a dark edge on it, because it has to be
    // read against both: the lit half of the bar and the near-black bore past
    // where the reading stops.
    this.label = new Text({
      text: "",
      style: {
        fontFamily: FONT,
        fontSize: 12,
        fontWeight: "700",
        fill: 0xffffff,
      },
    });
    this.label.anchor.set(0.5);
    this.addChild(this.label);

    /** Geometry from `place`, reading from `read`; `draw` needs both. */
    this.top = 0;
    this.barW = 0;
    this.barH = 0;
    this.v = 1;
    this.value = "";
    this.max = "";
    this.fallback = 0xffffff;

    /**
     * Whether the reading carries its maximum. Owned by the card rather than
     * settled here, so a card's two gauges never disagree — see `pairFits` and
     * READOUT_PAIR_MIN. True until told otherwise: a gauge nobody asked is a
     * gauge on a screen roomy enough that nobody had to.
     */
    this.pair = true;

    /**
     * Whether this gauge prints anything at all.
     *
     * Also the card's to decide, and for the same kind of reason: a phone card
     * has the depth for one legible reading and two bars — see readouts, where
     * the charge gives its digits up so the health can keep them. A gauge that
     * is not reading is still a gauge; it fills, it is bevelled, and it is the
     * one the player watches to know when the hero fires.
     */
    this.reads = true;
  }

  /** Where the gauge is and how big, in the card's own coordinates. */
  place(top, barW, barH) {
    this.top = top;
    this.barW = barW;
    this.barH = barH;
    this.draw();
  }

  /**
   * What the gauge reads: a fraction, the paint for that state, the two numbers
   * to print, and the colour to fall back to if there is no paint.
   *
   * Both numbers rather than the finished string, because whether the maximum is
   * printed at all is a question about how wide this bar is and how big its type
   * comes out — see `pairFits`, which answers it, and `draw`, which sets
   * whichever reading the answer allows.
   */
  read(v, paint, value, max, fallback) {
    this.v = Math.max(0, Math.min(1, v));
    if (paint && this.paint) this.paint.texture = paint;
    this.value = String(value);
    this.max = String(max);
    this.fallback = fallback;
    this.draw();
  }

  /**
   * Whether a bar `w` by `h` can set this gauge's longest reading — `max` over
   * `max`, which is the most digits the pair ever carries — at a size a player
   * can read.
   *
   * Measured rather than predicted, and measured on the label itself: the answer
   * comes out of the same face, weight and tracking the reading will be set in,
   * which a width computed off HITZONE.advance cannot promise for the slash and
   * the two spaces around it — the less so now that the figures are proportional
   * and a reading of the same length can run a little wider than this one. The floor goes to fitFont as 1 so what comes back
   * is the size the pair actually wants rather than the size it was allowed, and
   * that is the number READOUT_PAIR_MIN judges.
   *
   * Off the constant maximum rather than the reading in hand, so the answer holds
   * still for the whole fight. Measured off `950 / 8000` the pair fits on a bar
   * that cannot carry `5320 / 8000`, and the gauge would have to change its mind
   * about what it prints in the middle of a drain — which is worse than either
   * reading.
   *
   * It leaves the label where it found it in the only sense that matters: `draw`
   * sets the text and the size on every pass, and one always follows.
   */
  pairFits(w, h, max) {
    const size = readoutSize(h);
    this.label.style.letterSpacing = size * READOUT_TYPE.track;
    this.label.text = `${max} / ${max}`;
    return (
      fitFont(this.label, w * READOUT_TYPE.width, size, 1) >= READOUT_PAIR_MIN
    );
  }

  draw() {
    const w = this.barW;
    const h = this.barH;
    if (!w || !h) return;

    const g = this.g;
    g.clear();

    // Edge to edge, where there is a trough. The paint used to be inset by the
    // trough's own rim so it landed inside the border rather than over it, and
    // there is no border: the trough is a bare track now — see pack-bars.mjs,
    // which drops the rim it was cut for. An inset with nothing to clear is just
    // a dark line drawn round a full bar.
    //
    // The drawn fallback keeps its own inset, because a Graphics track has no
    // shading to tell it from the paint and the only thing separating the two is
    // that gap.
    const rim = h * BAR_RIM;
    const pad = this.trough ? 0 : Math.max(0.6, h * 0.2);
    const bore = h - pad * 2;
    // A hairline at the least, so a hero on their last point of health is still
    // showing something. Never mind the shape of it: with the ends square a
    // sliver reads as a sliver at any width, where the stadium this bar used to
    // wear collapsed into a dot.
    const lit = Math.max((w - pad * 2) * this.v, Math.max(1, rim));

    if (this.trough) {
      this.trough.x = -w / 2;
      this.trough.y = this.top;
      this.trough.setSize(w, h);
    } else {
      g.rect(-w / 2, this.top, w, h);
      g.fill({ color: 0x0b0716, alpha: 0.78 });
    }

    if (this.paint) {
      this.paint.visible = this.v > 0.001;
      this.paint.x = -w / 2 + pad;
      this.paint.y = this.top + pad;
      this.paint.setSize(lit, bore);
    } else if (this.v > 0.001) {
      g.rect(-w / 2 + pad, this.top + pad, lit, bore);
      g.fill({ color: this.fallback });
      g.rect(-w / 2 + pad, this.top + pad, lit, bore * 0.5);
      g.fill({ color: 0xffffff, alpha: 0.26 });
    }

    // No outline over the top. There was a pale one, on the reasoning that the
    // gauge has to be found against two very different backs — a lit face above
    // it and the name's near-black band beside it — and that is what the paint
    // itself is for: a bar of flat green on a card of painted bust is not a
    // thing anyone loses. Against the dark track, the empty half needs no help
    // either. Two borders were being drawn round a shape that reads on its own.

    // A silent gauge stops here, with its trough and its paint drawn and no
    // digits over them — see `reads`, and readouts, which is where a card
    // decides that this one is a bar and not a reading.
    this.label.visible = this.reads;
    if (!this.reads) return;

    // Cap height is the bore less half a rim at each side, and the type size is
    // whatever puts this face's cap there — see READOUT_TYPE for the whole of
    // the reasoning, and readoutSize, which is that rule and nothing else. The
    // outline is half a rim: it exists to hold the digits against both the lit
    // paint and the near-black bore past where the reading stops, and at a full
    // rim it was as heavy as the bar's own border and closed the counters in the
    // 8s.
    const size = readoutSize(h);
    this.label.style.letterSpacing = size * READOUT_TYPE.track;
    this.label.style.stroke = {
      color: 0x0a0714,
      width: Math.max(0.5, rim * 0.5),
      join: "round",
    };
    this.label.text = this.pair ? `${this.value} / ${this.max}` : this.value;
    fitFont(this.label, w * READOUT_TYPE.width, size, 4);
    this.label.y = this.top + h / 2;
  }
}

/**
 * What a charged card stands at, and how far it swings either side of that.
 *
 * Exported because it is the card's own size and something else has to draw
 * round it: the ult lesson puts a frame on a hero the moment they charge, and a
 * frame measured off the layout box would sit inside the card rather than round
 * it — a ready card is a seventh larger than its slot before the pulse is even
 * counted. See Coach.drawCard, which sizes itself off the peak so the card
 * never pokes out of the thing framing it.
 */
export const READY_SCALE = 1.14;
export const READY_SWING = 0.045;

export class HeroCard extends Container {
  constructor(hero, index) {
    super();
    this.hero = hero;
    this.index = index;
    this.ready = false;
    // Every bar is earned from its own colour now. The healer starts higher and
    // fills faster because she is the one racing the doom clock — see
    // DIFFICULTY.chargeStart against DIFFICULTY.partyChargeStart.
    this.charge = hero.heal
      ? DIFFICULTY.chargeStart
      : DIFFICULTY.partyChargeStart;

    /**
     * What the charge rule is showing, and the object that walks it there.
     *
     * The rule used to be drawn straight off `charge`, and `charge` is fed a
     * gem at a time by the director — so a cascade that landed four gems of a
     * colour stepped its owner's rule four times in four frames. The number was
     * right and the movement was a stutter. Health has been driven this way
     * since it was simulated; this is the same treatment for the other gauge.
     */
    this.chargeShown = this.charge;
    this.chargeDriver = { v: this.charge };

    /** Health, 0..1. Authored by the director, never simulated. */
    this.hp = 1;
    this.hpShown = 1;
    this.hpDriver = { v: 1 };
    this.critical = false;
    this.downed = false;

    this.bg = new Graphics();
    this.addChild(this.bg);

    /**
     * The hero, edge to edge.
     *
     * Cover-fitted in resize() and clipped to the frame's own rounded rectangle,
     * so the art fills the tile rather than sitting in it: a portrait a third of
     * the card wide read as a placeholder next to the painted plate.
     */
    this.art = new Container();
    this.addChild(this.art);

    /**
     * Painted plate, over the drawn background and under the bust: the busts are
     * cut-outs, so the plate is what shows through wherever the hero does not
     * cover the tile. Null when the art failed to decode, which is why every
     * reference to it is guarded.
     *
     * Inside `art` so that it is clipped with the bust rather than beside it.
     * The plate is a square sprite laid over the whole card and two of the three
     * are opaque to their own corners, so unclipped it put four square dark
     * nubs outside the border's four rounded ones — the card sticking out past
     * its own frame, on every hero wearing the blue plate or the violet.
     */
    const plate = cardPlate(hero.element);
    this.plate = null;
    if (plate) {
      this.plate = new Sprite(plate.texture);
      this.plate.anchor.set(0.5);
      this.plate.tint = plate.tint;
      this.art.addChild(this.plate);
    }

    this.portrait = new Sprite(heroCardArt(index));
    this.portrait.anchor.set(0.5);
    this.art.addChild(this.portrait);

    // Anchored on the edges they hug, so resize only has to say how deep they
    // run. Both are clipped with the bust: a square-cornered wash over a rounded
    // tile shows as two dark nubs at the corners the frame is meant to round.
    this.footScrim = new Sprite(gradientTexture("cardFoot", FOOT_SCRIM));
    this.footScrim.anchor.set(0.5, 1);
    this.art.addChild(this.footScrim);

    this.artMask = new Graphics();
    this.addChild(this.artMask);
    this.art.mask = this.artMask;

    // Over the art, not under it: both are additive and have to wash across the
    // whole card, and the art now covers every pixel the plate used to.
    this.aura = new Sprite(glowTexture());
    this.aura.anchor.set(0.5);
    this.aura.blendMode = "add";
    this.aura.tint = GEM_COLORS[hero.element];
    this.aura.alpha = 0;
    this.addChild(this.aura);

    // Separate from `aura` on purpose: the ready pulse and the hurt flash can
    // overlap on Arissa, and one sprite driven by two owners flickers.
    this.burn = new Sprite(glowTexture());
    this.burn.anchor.set(0.5);
    this.burn.blendMode = "add";
    this.burn.tint = HURT_FLASH;
    this.burn.alpha = 0;
    this.addChild(this.burn);

    /**
     * The painted frame in the hero's own colour — see art/cardframe.js. Above
     * the art and the strike flash, because it is the card's edge: those wash
     * over the portrait, not over the border that holds it.
     */
    this.frameArt = cardFrameSprite(hero.element);
    if (this.frameArt) this.addChild(this.frameArt);

    /**
     * The animated border, over the painted one and under everything the card
     * says in words.
     *
     * Over the frame because it is the frame's own light: the drawn line is what
     * the file's own line is baked on top of — see the pads in art/ultborder.js
     * — and laid underneath it the border would be a glow with a flat outline
     * ruled through the middle of it. Under the gauges, the sigil and the two
     * captions because those are inside the tile and this is the edge of it.
     *
     * Null for an element whose sheet has not been packed, which is the whole of
     * the fallback: that card is the card it was before this existed. Every
     * reference is guarded for that reason, `update` included.
     */
    this.ultArt = ultBorder(hero.element);
    this.ultBurstArt = ultBurst(hero.element);
    /**
     * Which of the two the sprite is currently wearing, because the sprite is
     * *sized* by it. The two sheets need not be the same shape — water's burst
     * came in on the card's own geometry and fire's came off the halo shelf,
     * whose margin is nearly three times as wide — so switching sheets is a
     * texture and a re-fit, never a texture alone. See fitUltBorder.
     */
    this.ultShown = this.ultArt || this.ultBurstArt;
    this.ultBorder = null;
    /** The loop's own clock, its rate, and how far the tap has thrown it. */
    this.ultT = 0;
    this.ultRate = 1;
    this.ultGrow = 1;
    /** Whether the loop is stepping, and whether the tap owns the sprite. */
    this.ultLit = false;
    this.ultFlaring = false;
    /** Which pass of the border owns the sprite — see dimUlt for what for. */
    this.ultToken = 0;
    /** The tap's 0..1, on its own object so killTweensOf can reach it. */
    this.ultDriver = { v: 0 };
    if (this.ultShown) {
      this.ultBorder = new Sprite(this.ultShown.frames[0]);
      this.ultBorder.anchor.set(0.5);
      this.ultBorder.blendMode = "add";
      this.ultBorder.alpha = 0;
      this.ultBorder.visible = false;
      this.addChild(this.ultBorder);
    }

    // Still here with the art in place: it draws the charge rule, and the
    // rounded stroke it used to draw for the whole card is the fallback for a
    // device that could not decode the frame.
    this.frame = new Graphics();
    this.addChild(this.frame);

    /**
     * The two gauges, health over charge — see the Gauge above, which is the
     * whole of what either one is.
     *
     * Over `frame` rather than inside it: they carry sprites and type, and a
     * Graphics object holds neither. Separate objects rather than one pair,
     * because the health gauge blinks on its own — see `update` — and the charge
     * has no business dimming with it.
     */
    this.hpGauge = new Gauge(hpPaintTexture(false));
    this.addChild(this.hpGauge);

    this.manaGauge = new Gauge(manaPaintTexture());
    this.addChild(this.manaGauge);

    /**
     * The element sigil, over the frame rather than under it: it sits in the
     * corner of the card, and tucked beneath the art it would be a gem half
     * eaten by a neon edge.
     */
    this.sigil = new Sprite(elementSigil(hero.element));
    this.sigil.anchor.set(0.5);
    this.addChild(this.sigil);

    this.label = new Text({
      text: hero.name,
      style: {
        fontFamily: FONT,
        fontSize: 20,
        fontWeight: "800",
        fill: 0xffffff,
        letterSpacing: 0.5,
      },
    });
    this.label.anchor.set(0.5);
    this.addChild(this.label);

    this.readyLabel = new Text({
      text: "READY",
      style: {
        fontFamily: FONT,
        fontSize: 18,
        fontWeight: "900",
        // Bright on a dark card: the previous near-black was invisible.
        fill: GEM_LIGHT[hero.element],
        letterSpacing: 0.6,
        stroke: { color: 0x08111f, width: 3, join: "round" },
      },
    });
    this.readyLabel.anchor.set(0.5);
    this.readyLabel.alpha = 0;
    this.addChild(this.readyLabel);

    this.eventMode = "static";
    this.cursor = "pointer";

    this.t = 0;
    this.pulseT = 0;

    /**
     * A hero can be dealt already charged — see DIFFICULTY.chargeStart.
     *
     * `ready` is otherwise only ever set by addCharge crossing the line, and
     * everything that goes with it is set by setReady on the same frame: the
     * caption swaps to READY, the card stands taller and starts breathing. A
     * card dealt at the top had the full bar and none of that — a hero the
     * director agreed was spendable, drawn as an ordinary card, which is what
     * left the opening demo with nothing it was willing to point at.
     *
     * The same state is put on here, minus the two things setReady does that
     * only make sense as *events*: the charge sound, which would fire into a
     * page the player has not touched yet and which the audio unlock would
     * swallow anyway, and the pop, which is a card *arriving* at full rather
     * than one that started there. The frame and the charge rule are not drawn
     * here either — resize() draws both, and a card has no size until it runs.
     */
    this.ready = this.charge >= 1;
    if (this.ready) {
      this.readyLabel.alpha = 1;
      this.label.alpha = 0;
      this.pulsing = true;
      this.scale.set(READY_SCALE);
      // Lit rather than fading in, for the same reason the pop is skipped: this
      // card did not arrive at full, it started there. Its size is resize()'s,
      // like the frame's and the charge rule's.
      if (this.ultBorder && this.ultArt) {
        this.ultLit = true;
        this.ultBorder.visible = true;
        this.ultBorder.alpha = ULT.alpha;
      }
    }
  }

  resize(w, h) {
    this.cardW = w;
    this.cardH = h;
    this.hitArea = new Rectangle(-w / 2, -h / 2, w, h);

    const el = this.hero.element;
    // The card's corner is the frame's corner: the fill, the portrait, the plate
    // and the border are all one rounded rectangle or the corners show it. `r`
    // rounds the fill and `clip` is where the art stops, and they are now the
    // same rectangle to the pixel — see cardFrameClip, which is where the two
    // were reconciled and why they had to be.
    const r = this.frameArt ? cardFrameRadius(h) : Math.min(w, h) * 0.18;
    const clip = this.frameArt
      ? cardFrameClip(w, h)
      : { x: -w / 2, y: -h / 2, w, h, r };

    if (this.frameArt) fitCardFrame(this.frameArt, w, h);

    this.bg.clear();
    this.bg.roundRect(-w / 2, -h / 2, w, h, r);
    this.bg.fill({ color: 0x120b1e });
    this.bg.roundRect(-w / 2, -h / 2, w, h * 0.55, r);
    this.bg.fill({ color: GEM_DARK[el], alpha: 0.45 });

    // The plate is baked at the card's own aspect, so this is a fit, not a
    // stretch — landscape cards run a few percent wider and wear it.
    if (this.plate) this.plate.setSize(w, h);

    // Cover, not fit, and off the art's own aspect rather than off an assumption
    // that it is square. The portraits are 160x328 — near enough the card's own
    // proportion that this fit is close to one to one — but the drawn stand-in a
    // hero falls back to is square, and a fit hard-coded for either one crops or
    // stretches the other.
    //
    // What runs past the tile is not split evenly. Centring takes the same amount
    // off the top and the bottom — off the top being the crown of a helmet, the
    // top of a hairline, the point of an ear, which is the half of a portrait
    // that says who it is. The bottom is a collarbone. So the overflow is pushed
    // down: most of the crop comes off the chest and the head stays in the card.
    const art = this.portrait.texture;
    const cover = Math.max(w / art.width, h / art.height);
    const aw = art.width * cover;
    const ah = art.height * cover;
    this.portrait.setSize(aw, ah);
    this.portrait.y = (ah - h) * HEAD_BIAS;

    // The wash the readouts are read against, measured off them rather than
    // authored: deep enough to clear the top of the name, or FOOT_BAND of the
    // card, whichever is more. The constant on its own was exactly enough for the
    // shallower stack this card used to carry, and the moment the bars got deep
    // enough to read — see READOUT_MIN — it left the name standing on a
    // collarbone. The gradient stretches, so a deeper band is a longer fade
    // rather than a darker one.
    const stack = readouts(w, h);
    const nameSize = Math.max(7, Math.min(h * 0.145, w * 0.2));
    const nameY = stack.hpY - stack.gap - nameSize * 0.5;
    this.footScrim.setSize(
      w,
      Math.max(h * FOOT_BAND, h / 2 - nameY + nameSize * 0.8),
    );
    this.footScrim.y = h / 2;

    this.artMask.clear();
    this.artMask.roundRect(clip.x, clip.y, clip.w, clip.h, clip.r);
    this.artMask.fill({ color: 0xffffff });

    this.aura.setSize(w * 1.9, h * 1.9);
    this.burn.setSize(w * 2.1, h * 2.1);

    // Laid on the card's own box, margin hanging outside it — the same contract
    // the frame above is laid on. Sized by whichever sheet is on the sprite, and
    // `ultGrow` is carried through so a resize landing inside the tap does not
    // snap the throw back to the card.
    if (this.ultBorder)
      fitUltBorder(this.ultBorder, this.ultShown, w, h, this.ultGrow);

    // Off the short side, so the pip is the same size on a card held either way.
    // The gem carries the board's own padding inside its texture, so the circle
    // that lands on the card is a little smaller than the box asked for here.
    const sig = Math.max(
      SIGIL.min,
      Math.min(Math.min(w, h) * SIGIL.k, SIGIL.max),
    );
    this.sigil.setSize(sig, sig);

    // Sat in from the inside of the border rather than in from the card's box,
    // and by a gap wide enough that the corner is allowed to be a corner.
    //
    // Both halves of that are the same complaint. The pip was laid out against
    // `-w / 2`, which is the *outer* edge of the frame, so the line and its
    // radius were spent out of the gem's own clearance and the arc had a roundel
    // sitting in it. Measured off `clip` — the rounded rectangle the border
    // draws round, see cardFrameClip — the gap is the gap whatever the frame is
    // doing at that size, and the widened SIGIL.gap is what makes it read as
    // one: the top left corner is now frame and card, with the gem beginning
    // after both.
    const pad = Math.max(2.5, Math.min(w, h) * SIGIL.gap);
    this.sigil.x = clip.x + sig / 2 + pad;
    this.sigil.y = clip.y + sig / 2 + pad;

    // Sat on the stack rather than placed at a fraction of the card: the name
    // is the top of the block, so it moves with whatever is under it. Solved up
    // with the foot scrim, which is cut to reach past it.
    this.label.style.stroke = {
      color: 0x07040e,
      width: Math.max(1.2, nameSize * 0.16),
      join: "round",
    };
    fitFont(this.label, stack.barW, nameSize);
    this.label.y = nameY;

    const readySize = Math.max(7, Math.min(h * 0.16, w * 0.21));
    this.readyLabel.style.stroke = {
      color: 0x08111f,
      width: Math.max(2, readySize * 0.22),
      join: "round",
    };
    fitFont(this.readyLabel, stack.barW, readySize);
    this.readyLabel.y = nameY;

    const { barW, hpH, manaH, manaReads, hpY, manaY } = stack;
    // Both gauges print their maximums or neither does, and the health bar is the
    // one that decides: `8000 / 8000` is the longer of the two readings, so any
    // bar that carries it carries `120 / 120` as well. Two gauges the same size
    // settling it apart would put a narrow card in the one state that reads worse
    // than either — a matched pair with one half saying what it is out of and the
    // other half not.
    //
    // Still measured on the health bar, and on a phone that is the only bar it
    // is deciding for: the charge is silent there and has no maximum to keep or
    // drop. Handed to it anyway rather than guarded, because the card that goes
    // back to printing both — see readouts — is the card where the two have to
    // agree again, and one assignment is cheaper than one condition.
    const pair = this.hpGauge.pairFits(barW, hpH, HERO_MAX_HP);
    this.hpGauge.pair = pair;
    this.manaGauge.pair = pair;
    this.manaGauge.reads = manaReads;

    this.hpGauge.place(hpY, barW, hpH);
    this.manaGauge.place(manaY, barW, manaH);

    this.drawFrame();
    this.drawHpBar();
    this.drawCharge();
  }

  /**
   * Health, directly under the name: the gauge's reading and its numbers.
   *
   * It used to ride the top edge, which put a lit green bar across every hero's
   * brow. It is the card's one real gauge, so it belongs with the other thing
   * the card says in words — see `readouts`.
   *
   * Green while the hero is fine, red once they are not, and two textures rather
   * than one under a tint for the reason cardbars.js gives. The numbers are the
   * simulated health rounded to whole points, which is what the fight is
   * actually spending — see HERO_MAX_HP.
   *
   * The reading is `5320 / 8000` wherever the pair can be read, and the current
   * value alone where it cannot. Both numbers go over rather than a string: the
   * gauge measures its own bar and picks — see READOUT_PAIR_MIN for which way and
   * why, and `resize`, where the pick is made once for this bar and the charge's
   * together. Where the pair is dropped, what the maximum was there to say the
   * bar still says: the paint stops where the reading stops.
   */
  drawHpBar() {
    if (!this.cardW) return;
    const v = this.hpShown;
    const low = v <= HERO_CRITICAL;
    this.hpGauge.read(
      v,
      hpPaintTexture(low),
      Math.round(v * HERO_MAX_HP),
      HERO_MAX_HP,
      low ? HP_LOW : HP_GOOD,
    );
  }

  /**
   * Charge, under the health: the same gauge, the same numbers treatment.
   *
   * The lit part is mana blue on every card rather than the hero's own colour.
   * Which gem charges which hero is the sigil's job, and a second reading of the
   * same fact in the same hue only made the bar look like more frame. The
   * fallback colour is still the element's, because with no paint to lay in it
   * the bar has nothing else to say whose it is.
   *
   * The number is the fraction shown at the scale the card counts in — see
   * HERO_MAX_CHARGE, which nothing in the simulation reads — over that scale,
   * `77 / 120`. It is the shorter pair of the two and would fit on cards where
   * the health's does not, and it is deliberately not allowed to: the gauges are
   * a matched pair, and they keep or drop the maximum together on the health
   * bar's measurement. See `resize`.
   */
  drawCharge() {
    if (!this.cardW) return;
    const v = this.chargeShown;
    this.manaGauge.read(
      v,
      manaPaintTexture(),
      Math.round(v * HERO_MAX_CHARGE),
      HERO_MAX_CHARGE,
      this.ready ? GEM_LIGHT[this.hero.element] : GEM_COLORS[this.hero.element],
    );
  }

  drawFrame() {
    const w = this.cardW;
    const h = this.cardH;
    const el = this.hero.element;
    const g = this.frame;

    g.clear();
    if (!this.frameArt) {
      // No art: the drawn edge the card shipped with, which says the same thing
      // in one stroke — thicker and in the element's colour once charged.
      const r = Math.min(w, h) * 0.18;
      g.roundRect(-w / 2, -h / 2, w, h, r);
      g.stroke({
        width: this.ready ? Math.max(2.5, w * 0.055) : Math.max(1.5, w * 0.028),
        color: this.ready ? GEM_LIGHT[el] : 0x3a2a52,
        alpha: this.ready ? 1 : 0.9,
      });
    }

    // The charge is the other gauge's business now — see drawCharge. It lived
    // here while it was a rule drawn along the frame's own edge, and a bar with
    // numbers in it is not trim on a border.
  }

  setReady(on) {
    this.ready = on;
    this.drawFrame();
    // The charge's fallback colour brightens with `ready`, so it is redrawn from
    // here as well as from its own tween.
    this.drawCharge();
    tween(this.readyLabel, { alpha: on ? 1 : 0 }, 0.2);
    tween(this.label, { alpha: on ? 0 : 1 }, 0.2);
    // A charged card carries no light of its own. It says READY, it stands
    // taller and it breathes on its own scale — the halo off the border, the
    // ring the tap threw and the wash over the portrait are all gone, and what
    // is left is read against the arena instead of through a bloom.
    if (on) {
      sfx.charged(this.hero.element);
      // The one light a charged card carries, and it is on the border rather
      // than over the portrait — see ULT and art/ultborder.js. It needs no
      // breath of its own: the sprite is a child of the card, so the ready pulse
      // below already swells the border with everything else on the tile.
      this.lightUlt();
      // Pop first, then hand the scale over to the idle pulse in update().
      tween(this.scale, { x: READY_SCALE, y: READY_SCALE }, 0.32, {
        ease: Ease.backOut,
      }).then(() => {
        // Restart the phase so the pulse picks up exactly where the pop
        // landed instead of snapping to wherever the sine happens to be.
        this.pulseT = 0;
        this.pulsing = this.ready;
      });
    } else {
      this.pulsing = false;
      this.dimUlt();
      tween(this.scale, { x: 1, y: 1 }, 0.25);
    }
  }

  /* ------------------------------------------------------ the animated border */

  /**
   * Light the border and start it moving.
   *
   * The clock is not reset. Twelve frames ping-ponged is three seconds of cycle
   * and a card can charge, be spent and charge again inside that, so a border
   * that restarted from frame one every time would put the same two frames of
   * fire under every callout in the fight. Where the loop happens to be is
   * nobody's business but its own.
   */
  lightUlt() {
    const s = this.ultBorder;
    if (!s || !this.ultArt) return;
    // Whatever the last tap threw is over: this card is charged again.
    this.ultToken++;
    killTweensOf(this.ultDriver);
    killTweensOf(s);
    this.ultFlaring = false;
    this.ultRate = 1;
    this.ultGrow = 1;
    this.ultLit = true;
    this.wearUlt(this.ultArt);
    s.visible = true;
    tween(s, { alpha: ULT.alpha }, ULT.in);
  }

  /**
   * Put one of the two sheets on the sprite, texture and size together.
   *
   * Its own two lines because they cannot be separated: the sheets are not
   * guaranteed to share a geometry, so a texture swap without the re-fit under
   * it lays fire's burst — a hairline in a bloom half a card wide — on the box
   * cut for a solid line with a 13% margin, and the light lands a tenth of a
   * card inside the border.
   */
  wearUlt(art) {
    this.ultShown = art;
    this.ultBorder.texture = art.frames[0];
    if (this.cardW)
      fitUltBorder(this.ultBorder, art, this.cardW, this.cardH, this.ultGrow);
  }

  /**
   * Take it off: spent, knocked down, or drained by anything else that clears
   * `ready`.
   *
   * A no-op while the tap's flare is running, and that is the whole reason these
   * are three methods rather than one flag. `spend` flares and then immediately
   * clears `ready`, which comes back through here — and two owners on one alpha
   * do not cooperate: updateTweens walks its list backwards, so of two tweens on
   * the same property the one added *first* is written last and wins. The fade
   * would therefore have beaten the flare it was added on top of, and the tap
   * would have thrown a border that was already going out.
   */
  dimUlt(dur) {
    const s = this.ultBorder;
    if (!s || this.ultFlaring) return;
    const id = ++this.ultToken;
    killTweensOf(s);
    tween(s, { alpha: 0 }, dur === undefined ? ULT.out : dur).then(() => {
      // The token, not the alpha. A killed tween still resolves — that is the
      // engine's contract, so nothing awaiting one can deadlock — so a card that
      // charged again mid-fade lands here anyway, and reading the alpha would
      // hide the border it has just lit out from under it.
      if (id !== this.ultToken) return;
      s.visible = false;
      this.ultLit = false;
    });
  }

  /**
   * The tap that spends the ultimate: the border thrown outwards and spun.
   *
   * One driver rather than three tweens, because the three have to agree on
   * where they are: the size is written through fitUltBorder — a Sprite's width
   * *is* its scale in Pixi, so this cannot be a scale tween — the alpha rides
   * the same curve, and the rate falls back to 1 across it so that the frames
   * slow as the light goes rather than stopping with it.
   *
   * Fired and forgotten. `spend` is awaited by the director and its own beats
   * are the card's punch and its draining bar; a border still burning out is not
   * something the fight should be waiting on.
   */
  flareUlt() {
    const s = this.ultBorder;
    if (!s) return;
    const id = ++this.ultToken;
    killTweensOf(this.ultDriver);
    killTweensOf(s);
    this.ultFlaring = true;
    s.visible = true;
    s.alpha = 1;
    this.ultDriver.v = 0;
    this.ultGrow = 1;

    const burst = this.ultBurstArt;
    const beat = burst ? ULT.burst : ULT.flare;
    // The burst is driven frame by frame from here, so the loop in `update` has
    // to keep its hands off the texture; the spin *is* the loop, faster.
    this.ultLit = !burst;
    if (burst) this.wearUlt(burst);

    tween(this.ultDriver, { v: 1 }, beat.dur, {
      // Linear through a burst and eased out of a spin. A sheet whose
      // frames are a build and a peak has its own timing in it, and an ease
      // over the top of that is a second opinion about when the peak is.
      ease: burst ? Ease.linear : Ease.quadOut,
      onUpdate: () => {
        const p = this.ultDriver.v;
        this.ultGrow = 1 + (beat.grow - 1) * p;
        if (burst) {
          s.texture = ultBurstTexture(burst, p);
          // Only the tail fades, for the same reason Vfx.bossSwing's does: an
          // effect that starts dying on the frame it lands never reads as
          // having landed.
          s.alpha = p < beat.tail ? 1 : 1 - (p - beat.tail) / (1 - beat.tail);
        } else {
          this.ultRate = beat.rate + (1 - beat.rate) * p;
          s.alpha = 1 - p;
        }
        if (this.cardW)
          fitUltBorder(s, this.ultShown, this.cardW, this.cardH, this.ultGrow);
      },
    }).then(() => {
      // A card charged again inside the tap owns the sprite — same reason the
      // fade above checks the token rather than what it can see.
      if (id !== this.ultToken) return;
      this.ultFlaring = false;
      this.ultLit = false;
      this.ultRate = 1;
      this.ultGrow = 1;
      s.visible = false;
      s.alpha = 0;
      // Back on the loop, so the next charge lights the sheet it should and at
      // the size that sheet wants.
      if (this.ultArt) this.wearUlt(this.ultArt);
    });
  }

  /**
   * How long the tap's own animation wants before the cut-in takes the screen.
   *
   * Asked rather than assumed, because the answer is per hero: an element with a
   * burst sheet has an arc to show and wants the cut to land on its peak, and
   * one without has a tenth of a second of flare and wants the cut immediately,
   * exactly as the fight ran before any of this art existed. See
   * Director.castUltimate, which awaits it, and ULT.
   */
  flareLead() {
    return (this.ultBurstArt && this.ultBorder ? ULT.burst : ULT.flare).lead;
  }

  /**
   * Feed the charge bar.
   * @returns {boolean} true on the frame it fills — the caller owns the callout
   *   that follows, and must not fire it again every time another gem lands.
   */
  addCharge(amount) {
    if (this.ready || this.downed) return false;
    this.charge = Math.min(1, this.charge + amount);
    this.driveCharge(this.charge);
    if (this.charge < 1) return false;
    this.setReady(true);
    return true;
  }

  /**
   * Walk the rule to a value instead of cutting to it.
   *
   * Faster filling than draining on purpose. Filling is feedback — it answers a
   * match the player just made, and an answer three tenths of a second late is
   * not an answer. Draining is the card standing down after an ultimate, which
   * has the cut-in and the whole party's volley over it and can afford to take
   * its time.
   */
  driveCharge(value, dur) {
    killTweensOf(this.chargeDriver);
    this.chargeDriver.v = this.chargeShown;
    return tween(
      this.chargeDriver,
      { v: value },
      dur === undefined ? 0.3 : dur,
      {
        ease: Ease.quadOut,
        onUpdate: () => {
          this.chargeShown = this.chargeDriver.v;
          this.drawCharge();
        },
      },
    );
  }

  /** Charge this card earns per gem of its own colour. */
  chargeRate() {
    return this.hero.heal
      ? DIFFICULTY.chargePerGem
      : DIFFICULTY.partyChargePerGem;
  }

  /**
   * The card takes a swing.
   *
   * Lunges towards the boss and flares its element aura. The motion rides on
   * `pivot` — the same channel `hurt` uses — rather than `position`, so it
   * composes with the row layout, and rather than `scale`, which the ready
   * pulse in update() owns and would overwrite on the next frame.
   *
   * @param {boolean} lead true for the hero whose colour was actually matched
   */
  strike(lead) {
    if (this.downed) return;
    sfx.heroStrike(this.hero.element, lead);

    killTweensOf(this.pivot);
    this.pivot.set(0, lead ? 16 : 9);
    tween(this.pivot, { x: 0, y: 0 }, lead ? 0.42 : 0.34, {
      ease: Ease.backOut,
    });

    // A pulsing card is already glowing on its own schedule; a second owner on
    // the same alpha just makes it stutter.
    if (this.pulsing) return;
    killTweensOf(this.aura);
    this.aura.alpha = lead ? 0.95 : 0.55;
    tween(this.aura, { alpha: 0 }, lead ? 0.4 : 0.3);
  }

  /** Spent: drain the bar and drop back to a normal card. */
  async spend() {
    this.charge = 0;
    // Before setReady, which is what clears `ready` and would otherwise fade the
    // border out from under the flare — see dimUlt, which stands aside for it.
    this.flareUlt();
    this.driveCharge(0, 0.5);
    this.setReady(false);
    await tween(this.scale, { x: 0.88, y: 0.88 }, 0.1);
    await tween(this.scale, { x: 1, y: 1 }, 0.22, { ease: Ease.backOut });
  }

  /* ------------------------------------------------------------- health */

  /** Rest tint the hurt flash returns to. */
  restTint() {
    return this.downed ? DOWN_TINT : 0xffffff;
  }

  /**
   * How much a hit of `amount` actually takes off.
   *
   * The clamp lives here rather than in the director so the floating number
   * and the bar can never disagree about what the hit was worth.
   */
  lossFor(amount) {
    return Math.max(0, this.hp - Math.max(HERO_HP_FLOOR, this.hp - amount));
  }

  /** Drive the health bar to a value. */
  async setHp(value, dur, wait) {
    this.hp = value;
    this.critical = value <= HERO_CRITICAL && !this.downed;

    killTweensOf(this.hpDriver);
    this.hpDriver.v = this.hpShown;
    await tween(this.hpDriver, { v: value }, dur === undefined ? 0.4 : dur, {
      delay: wait || 0,
      ease: Ease.quadOut,
      onUpdate: () => {
        this.hpShown = this.hpDriver.v;
        this.drawHpBar();
      },
    });
    if (this.hp <= 0.001 && !this.downed) this.down();
  }

  /**
   * Eat a hit: flinch, flash red, drain the bar.
   *
   * The flinch runs on `pivot` rather than `position` so it composes with the
   * ready pulse on `scale` and never fights the row layout.
   */
  async hurt(amount, wait) {
    if (this.downed) return;
    const to = Math.max(HERO_HP_FLOOR, this.hp - amount);
    const kick = this.index % 2 ? 1 : -1;

    if (wait) await delay(wait);
    sfx.heroHurt();

    killTweensOf(this.pivot);
    this.pivot.set(kick * 7, -5);
    tween(this.pivot, { x: 0, y: 0 }, 0.45, { ease: Ease.elasticOut });

    this.burn.alpha = 0.85;
    tween(this.burn, { alpha: 0 }, 0.4);
    tweenValue(0, 1, 0.34, (v) => {
      if (this.destroyed) return;
      this.tint = lerpColor(HURT_FLASH, this.restTint(), v);
    });

    await this.setHp(to, 0.42);
  }

  /** Arissa's tide, or any other pick-me-up: refill and shake off the burns. */
  async heal(to, wait) {
    const target = Math.min(1, Math.max(this.hp, to));
    if (this.downed) this.revive();
    if (target <= this.hp) return;

    tweenValue(0, 1, 0.4, (v) => {
      if (this.destroyed) return;
      this.tint = lerpColor(GEM_LIGHT[this.hero.element], 0xffffff, v);
    });
    tween(this.scale, { x: 1.1, y: 1.1 }, 0.14, { delay: wait || 0 }).then(() =>
      tween(this.scale, { x: 1, y: 1 }, 0.28, { ease: Ease.backOut }),
    );
    await this.setHp(target, 0.5, wait);
  }

  /**
   * Knocked out. Unreachable with the shipped HERO_HP_FLOOR, and deliberately
   * kept working: drop that floor to 0 and the fight can actually be lost.
   */
  down() {
    this.downed = true;
    sfx.heroDown();
    this.critical = false;
    this.pulsing = false;
    this.setReady(false);
    this.hpGauge.alpha = 1;
    tween(this, { alpha: 0.55, rotation: 0.14 }, 0.3);
    tweenValue(0, 1, 0.3, (v) => {
      if (this.destroyed) return;
      this.tint = lerpColor(0xffffff, DOWN_TINT, v);
    });
  }

  revive() {
    if (!this.downed) return;
    this.downed = false;
    tween(this, { alpha: 1, rotation: 0 }, 0.3);
  }

  update(dt) {
    this.t += dt;

    // The border's flipbook, stepped only while there is one lit. A window onto
    // one texture per frame — see art/ultborder.js — so this is an assignment
    // and not a texture swap: six cards stepping their own borders stay in the
    // same batch as everything else on the card.
    if (this.ultLit && this.ultBorder && this.ultShown === this.ultArt) {
      this.ultT += dt;
      this.ultBorder.texture = ultLoopTexture(
        this.ultArt,
        this.ultT,
        this.ultRate,
      );
    }

    // Blink the strip once a hero is in real trouble — on a card this small
    // the colour change alone is not enough to catch a thumb-height glance.
    if (this.critical) {
      this.hpGauge.alpha = 0.55 + Math.abs(Math.sin(this.t * 5.5)) * 0.45;
    } else if (this.hpGauge.alpha !== 1) {
      this.hpGauge.alpha = 1;
    }

    if (!this.pulsing) return;
    this.pulseT += dt;
    const beat = Math.sin(this.pulseT * 6.5);
    // Scale is the whole of the beat now. The card used to breathe in light
    // as well — a wash over the portrait and a halo off the border — and both
    // are gone: six cards blooming under the board was the brightest thing on a
    // screen whose subject is the boss.
    this.scale.set(READY_SCALE * (1 + beat * READY_SWING));
  }
}

export class HeroRow extends Container {
  constructor(onCardTap) {
    super();
    initPortraits();

    // No tray under the row: the cards stand straight on the arena, each one
    // framed by its own plate.
    this.cards = HEROES.map((hero, i) => {
      const card = new HeroCard(hero, i);
      card.on("pointertap", () => onCardTap(i, card));
      this.addChild(card);
      return card;
    });
  }

  /**
   * Lay the row out on whole device pixels.
   *
   * The band the layout hands over is honest arithmetic on a viewport — six cards
   * and five gaps out of whatever is left after the gutters — and it lands
   * wherever it lands: 56.33 wide, 117.42 tall, starting at x 8.5. Nothing about
   * a portrait minds that. The frame around it does. Its line is three source
   * pixels asked for at about a pixel and a half, so an edge half a pixel off the
   * grid is drawn across two rows at half strength each, and a card whose top
   * edge rounds one way while its bottom rounds the other wears a frame that is
   * visibly heavier along the bottom.
   *
   * So the card is snapped here rather than corrected there. Sizes go to an even
   * number of device pixels, because the card is drawn from its own centre and
   * half of an odd number is not a pixel; positions go to the nearest pixel. The
   * gaps absorb what the rounding takes, which is under a pixel per card and
   * nothing anybody can see — unlike the frame, which is the thing this is for.
   */
  resize(layout) {
    const { x, y, w, h, gap } = layout.cards;
    const q = 1 / getRenderer().resolution;
    const snap = (v) => Math.round(v / q) * q;
    const even = (v) => Math.max(q * 2, Math.floor(v / (q * 2)) * q * 2);

    const cardW = even((w - gap * (this.cards.length - 1)) / this.cards.length);
    const cardH = even(h);
    this.cards.forEach((card, i) => {
      card.resize(cardW, cardH);
      card.x = snap(x + cardW / 2 + i * (cardW + gap));
      card.y = snap(y + cardH / 2);
    });
  }

  update(dt) {
    this.cards.forEach((c) => c.update(dt));
  }

  /** "all", "lowest" or a list of indices -> the cards that eat the full hit. */
  resolveTargets(targets) {
    if (!targets || targets === "all") return this.cards.map((_, i) => i);
    if (targets === "lowest") {
      // Standing heroes only: a golem that keeps punching a body it already
      // dropped is wasting the turn that was supposed to scare the player.
      let pick = -1;
      this.cards.forEach((card, i) => {
        if (card.downed) return;
        if (pick === -1 || card.hp < this.cards[pick].hp) pick = i;
      });
      return pick === -1 ? [] : [pick];
    }
    return targets;
  }

  /** Heroes still standing. Zero of them is the losing condition. */
  aliveCount() {
    return this.cards.reduce((n, card) => n + (card.downed ? 0 : 1), 0);
  }

  /**
   * How much of its damage the party is still landing.
   *
   * This replaces the old per-element lookup, and it had to: when only the
   * matched colour's owner swung, only that hero's death mattered to that
   * match. Now the whole row fires at everything, so the backing is the row's
   * average and every hero lost takes a fifth of the gap between 1 and
   * DIFFICULTY.downedPenalty off every match that follows.
   *
   * Across a run this lands where the old version did — a party one hero down
   * was already losing the penalty on one match in five — but it no longer
   * depends on which colour happens to come up.
   */
  partyPower() {
    if (this.cards.length === 0) return 1;
    const total = this.cards.reduce(
      (sum, card) => sum + (card.downed ? DIFFICULTY.downedPenalty : 1),
      0,
    );
    return total / this.cards.length;
  }

  /**
   * Who fires this volley, and in what order.
   *
   * The hero whose colour the player actually matched leads; everyone else
   * still standing follows in row order. The dead do not fire.
   */
  strikeOrder(leadElement) {
    const lead = [];
    const rest = [];
    this.cards.forEach((card, i) => {
      if (card.downed) return;
      if (card.hero.element === leadElement) lead.push(i);
      else rest.push(i);
    });
    return lead.concat(rest);
  }

  /** Indices of heroes charged and standing — anyone the player could spend. */
  readyCards() {
    const out = [];
    this.cards.forEach((card, i) => {
      if (card.ready && !card.downed) out.push(i);
    });
    return out;
  }

  /** Point on a card the damage number should fly out of. */
  cardPoint(index) {
    const card = this.cards[index];
    return { x: card.x, y: card.y - (card.cardH || 0) * 0.5 };
  }

  /** Whole party back on its feet — the payoff of Arissa's ultimate. */
  async healAll(to) {
    // Sung by the row, not by the cards: the tide reaches all six of them and
    // six copies of the same chime is a chord nobody wrote.
    sfx.heal();
    await Promise.all(this.cards.map((card, i) => card.heal(to, i * 0.06)));
  }

  /**
   * The row comes up as one.
   *
   * The cards used to be dealt in, 0.05s apart, which put the sixth of them a
   * quarter of a second behind the first. That is a nice enough flourish on its
   * own and the wrong one here: the opening is meant to land as a single shot,
   * so a party that arrives in six instalments is six more things appearing
   * after the thing before them.
   *
   * One clock for the row and one for the shot around it: the length comes from
   * the caller — T.introIn, the same number the boss, the board and the HUD are
   * given — and the fade and the lift are both handed it, so a card is not done
   * appearing before it is done arriving. The fade eases out, which is what
   * keeps a longer span from reading as a card left hanging half transparent:
   * it is legible early and simply finishes on cue.
   */
  async introIn(seconds) {
    const d = seconds === undefined ? 0.35 : seconds;
    await Promise.all(
      this.cards.map((card) => {
        card.alpha = 0;
        const home = card.y;
        card.y = home + 40;
        return Promise.all([
          tween(card, { alpha: 1 }, d, { ease: Ease.quadOut }),
          tween(card, { y: home }, d, { ease: Ease.backOut }),
        ]);
      }),
    );
  }
}
