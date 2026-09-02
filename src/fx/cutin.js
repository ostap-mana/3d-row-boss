/**
 * Ultimate cut-in — for whichever hero the player just spent.
 *
 * The single most important beat in the creative: this is where the player is
 * told "the heroes are the power", so it gets the full anime treatment. It used
 * to be Arissa's alone, baked into the constructor; now every card can be tapped,
 * so the portrait, the name, the skill and every colour on screen are swapped
 * by setHero() before the slam.
 *
 * And it is a cut rather than a tint. The frame it used to hand over was a
 * translucent sticker on the gameplay: the fight went 82% dark, which still left
 * the hero row reading its own names and numbers and the board showing five
 * columns of saturated gem. The fight goes away entirely now, the lockup is the
 * only thing lit, and what fills the dark is a burst around the hero rather than
 * a gradient over the board.
 *
 * ## What the frame is made of, and why it is made of that
 *
 * The composition is a **card**, and that is the whole of the redesign. This
 * used to stand a roundel — a circular crop of the hero's face, about a third of
 * the stage — inside the burst sheet that art/ultborder.js packs, and that sheet
 * is a *card border*: a tall rectangle of white-hot rim and bloom, drawn for the
 * tile in the hero row. Hung round a circle it framed nothing. What the player
 * actually saw was an empty glowing rectangle with a small avatar pasted over
 * the middle of it — a picture frame with no picture in it.
 *
 * So the thing inside the border is the thing the border was drawn for: the
 * hero's own card art, edge to edge, at the sheet's own aspect. The bust is a
 * painting of a face and shoulders (see art/avatars.js) and it fills the panel
 * the way it fills the tile in the row. The burst sheet then reads as what it
 * is — the card the player just tapped, blazing — and the cut-in becomes the
 * same object the tap was on, thrown at the camera at ten times the size.
 *
 * Around it:
 *
 *   - **rays**, converging on the panel. Concentrated lines are the oldest
 *     device in this genre and they do one job: point at the subject. The set
 *     before them was 76 *parallel* streaks leaning across the whole window,
 *     which point at nothing and read as scratches on the film.
 *   - **an impact ring** thrown off the panel on the frame it lands, because a
 *     slam with no shockwave is a slide.
 *   - **the lockup**: a kicker, the name, the skill, on a banner sheared to the
 *     same lean as everything else in the frame.
 */

import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import {
  FONT,
  FONT_TITLE,
  GEM_COLORS,
  GEM_DARK,
  GEM_LIGHT,
  HEROES,
  HEALER,
} from "../config.js";
import { heroPortrait } from "../art/heroes.js";
import { heroBust } from "../art/avatars.js";
import { glowTexture } from "../art/textures.js";
import { fitUltBorder, ultBurst, ultBurstTexture } from "../art/ultborder.js";
import { lerpColor } from "../core/color.js";
import { tween, delay, killTweensOf, Ease } from "../core/tween.js";
import * as sfx from "../audio/sfx.js";

/**
 * How far down the fight goes, and what colour the hole is.
 *
 * It was 0.82. Eighteen percent of a lit board is not a backdrop, it is a second
 * composition competing with the first — and the one thing a cut-in has to do is
 * be the only thing on screen. It went from 0.965 to 0.982 with the rays: an
 * additive burst does not brighten what is under it, it lights the air *around*
 * it, so every streak crossing the board silhouetted the gem glyphs still
 * reading through at three and a half percent and the bottom of the frame came
 * out a lit grid. What is left now is a suggestion of where the fight was, which
 * is all this frame wants from it — the haze below is what keeps the darkness
 * from reading as a black rectangle.
 */
const DIM = 0.982;
const DIM_COLOR = 0x04030a;

/**
 * The lean every straight edge in the frame shares.
 *
 * Horizontal travel over a shape's own height, as a fraction of it. The banner
 * is sheared by it, the panel is tilted to match it and the type block is set
 * against it, which is what makes the composition read as one diagonal rather
 * than as three objects at three angles.
 */
const LEAN = 0.34;

/**
 * The panel: the hero's card, at the size a cut-in wants it.
 *
 * `aspect` is the burst sheet's own — 304 by 608, a card — and the bust art is
 * 160 by 328, near enough the same that cover-fitting it is barely a crop. Both
 * of those are facts about files on disk, and the whole point of this number is
 * that the panel agrees with them: a box of any other shape puts a rectangular
 * border round something that is not that rectangle, which is the fault this
 * replaced.
 *
 * `tall` is the share of the stage's height the panel stands, and it is bound by
 * the width as well — in portrait the stage is half as wide as it is tall, and a
 * panel sized off the height alone runs out over both edges.
 *
 * `tilt` is small on purpose. Enough that the panel is a thing thrown into the
 * frame rather than a dialog box centred in it; not so much that the type has to
 * lean with it or the burst border starts reading as crooked.
 */
const PANEL = {
  aspect: 0.5,
  tall: { portrait: 0.44, landscape: 0.72 },
  wide: { portrait: 0.52, landscape: 0.3 },
  tilt: -0.052,
  corner: 0.075,
};

/**
 * The rays: concentrated lines, converging on the panel.
 *
 * Each one is a wedge with its point at `inner` — just outside the panel, so
 * nothing is drawn over the face — and its base out past the corner of the
 * window. Alpha climbs with the radius, so the frame's edges are loud and the
 * air around the hero is clean, which is the difference between a burst and a
 * wash.
 *
 * The angles are jittered by nearly a whole slot. Evenly spaced rays are a
 * sunburst — a wheel, a thing at rest — and what is wanted is the irregular
 * shatter an ink drawing gets from being drawn by hand.
 */
const RAYS = {
  count: 96,
  /** Where the points sit, in panel heights from the panel's own centre. */
  inner: 0.62,
  /**
   * Widest and narrowest a ray is at the frame's edge, in radians, and how
   * hard the roll between them leans on the narrow end.
   *
   * `taper` is the exponent, and it is the number that decides whether this
   * reads as speed or as a pinwheel. At 1.9 a third of the rays came out fat
   * and the frame was a wheel of solid blue wedges with the hero at the hub;
   * cubed, the fat ones are a handful of accents among ninety hairlines, which
   * is what an inked burst actually looks like.
   */
  fat: 0.021,
  thin: 0.0012,
  taper: 3.2,
  /** Alpha at the outer edge, before the per-ray roll. */
  peak: 0.34,
  /** How hard alpha falls from the outer edge inwards. */
  falloff: 1.7,
  /**
   * How much of a ray's length carries its full alpha, from the outer end in.
   *
   * Each one is drawn twice: a long dim wedge from the point to the edge, and a
   * bright one over its last `hot` of that. Two polys is a gradient, and a
   * gradient along the ray is what keeps the air around the hero clean while
   * the frame's edges stay loud.
   */
  hot: 0.45,
  /** How far a ray may wander from its slot, in slots. */
  drift: 0.9,
  /** Share of them struck in white rather than in the element's colour. */
  white: 0.12,
};

/**
 * How much light the haze is allowed to put back into the frame.
 *
 * In luminance rather than in alpha, and that is the whole point of it. An
 * additive layer's alpha is not what it looks like: at one flat value the six
 * elements came out as six different frames, because lightning's yellow carries
 * near twice the light of fire's orange and almost three times arcane's purple.
 * Spend the same light instead and all six read alike.
 */
const HAZE_LIFT = 0.07;

/**
 * What colour the haze is, given an element.
 *
 * Not the gem's own colour: pulled most of the way to the element's dark, which
 * keeps the hue and takes most of the glare out of it before HAZE_LIFT has to
 * pay for it.
 */
function hazeTint(element) {
  return lerpColor(GEM_COLORS[element], GEM_DARK[element], 0.45);
}

/** The alpha that spends HAZE_LIFT of light at one element's tint. */
function hazeAlpha(element) {
  const c = hazeTint(element);
  const lum =
    (0.2126 * ((c >> 16) & 255) +
      0.7152 * ((c >> 8) & 255) +
      0.0722 * (c & 255)) /
    255;
  return HAZE_LIFT / Math.max(lum, 0.08);
}

/**
 * Where the burst sheet has got to at the end of each beat.
 *
 * Twelve frames of a build, a white-hot peak and a settle, over an arc that is
 * already a slam, a creep and a punch: the border is asked to hit its peak on
 * the frame the panel lands, to drift across the hot frames while the panel
 * creeps in, and to spend the settle being thrown through the camera with
 * everything else. See `gateTo`, which is all three.
 */
const GATE = { land: 0.52, hold: 0.78 };

/**
 * Deterministic scatter.
 *
 * Math.random would re-roll the whole burst on every resize — and resize runs on
 * a hero change, so one cut-in would come out different from the one before it
 * for no reason anybody chose. Hashed off the index instead: scattered, and the
 * same scatter every time.
 */
function jitter(i) {
  const s = Math.sin(i * 12.9898) * 43758.5453;
  return s - Math.floor(s);
}

export class CutIn extends Container {
  constructor() {
    super();
    this.visible = false;

    /** Whose cut-in this currently is. The healer until somebody taps a card. */
    this.index = HEALER;

    this.dim = new Graphics();
    this.addChild(this.dim);

    // The colour in the hole. A frame dimmed this far needs something under the
    // rays or it is a black rectangle with a face on it — this is the element
    // bleeding into the dark, and it is what lets DIM be as high as it is.
    this.haze = new Sprite(glowTexture());
    this.haze.anchor.set(0.5);
    this.haze.blendMode = "add";
    this.haze.tint = hazeTint(HEROES[HEALER].element);
    this.addChild(this.haze);

    /** What the haze rests at for the hero it is currently pointed at. */
    this.hazeRest = hazeAlpha(HEROES[HEALER].element);

    /**
     * The rays, in their own container so they can be spun and thrown.
     *
     * The Graphics inside is drawn around its own origin and the container is
     * moved to the panel's centre, which is what lets `rotation` and `scale`
     * mean "about the focal point" without a matrix anywhere.
     */
    this.rayHub = new Container();
    this.rays = new Graphics();
    this.rays.blendMode = "add";
    this.rayHub.addChild(this.rays);
    this.addChild(this.rayHub);

    /** The bloom the panel stands in. */
    this.glow = new Sprite(glowTexture());
    this.glow.anchor.set(0.5);
    this.glow.blendMode = "add";
    this.glow.tint = GEM_COLORS[HEROES[HEALER].element];
    this.addChild(this.glow);

    /**
     * The panel: the card and everything drawn on it, as one object.
     *
     * A container because the whole thing is thrown through the camera on the
     * punch — it is the container that moves and rotates, and everything inside
     * it stays on its own mark. See `play`, and `reset`, which puts one object
     * back rather than six.
     */
    this.bust = new Container();
    this.addChild(this.bust);

    /**
     * The burst border, first into the panel so the art is drawn over it.
     *
     * The sheet is glow on black and goes on with `add`, so over the top it
     * would put light into the face. Underneath, the panel's own plate keeps the
     * painting exactly as painted and the border is only ever what stands around
     * it — which, the panel being the shape the sheet was packed for, is a rim
     * on the card's own edge with its bloom hanging outside.
     */
    this.gate = new Sprite(Texture.EMPTY);
    this.gate.anchor.set(0.5);
    this.gate.blendMode = "add";
    this.gate.visible = false;
    this.bust.addChild(this.gate);

    /** Which sheet is on the border, or null for a hero with none. */
    this.gateArt = null;
    /** How far through that sheet it is — see `gateTo`. */
    this.gateDriver = { v: 0 };

    /** The dark tile the art is laid on, and the edge it is cut to. */
    this.plateBack = new Graphics();
    this.bust.addChild(this.plateBack);

    this.art = new Sprite(heroBust(HEROES[HEALER].element) || Texture.EMPTY);
    this.art.anchor.set(0.5);
    this.bust.addChild(this.art);

    // The art is a rectangle and the panel has round corners, so the painting is
    // clipped to the panel rather than trusted to end where the tile does.
    this.artMask = new Graphics();
    this.bust.addChild(this.artMask);
    this.art.mask = this.artMask;

    /** The scrim, the rim and the corner ticks, over the art. */
    this.plateFront = new Graphics();
    this.bust.addChild(this.plateFront);

    /** The shockwave the landing throws off. */
    this.ring = new Graphics();
    this.ring.blendMode = "add";
    this.ring.alpha = 0;
    this.addChild(this.ring);

    this.plate = new Graphics();
    this.addChild(this.plate);

    this.kicker = new Text({
      text: "ULTIMATE",
      style: {
        fontFamily: FONT,
        fontSize: 16,
        fontWeight: "800",
        fill: GEM_LIGHT[HEROES[HEALER].element],
        letterSpacing: 6,
      },
    });
    this.kicker.anchor.set(0, 0.5);
    this.addChild(this.kicker);

    this.name = new Text({
      text: HEROES[HEALER].name,
      style: {
        fontFamily: FONT_TITLE,
        fontSize: 44,
        fontWeight: "900",
        fill: 0xffffff,
        letterSpacing: 4,
      },
    });
    this.name.anchor.set(0, 0.5);
    this.addChild(this.name);

    this.skill = new Text({
      text: HEROES[HEALER].skill,
      style: {
        fontFamily: FONT,
        fontSize: 20,
        fontWeight: "800",
        fill: GEM_LIGHT[HEROES[HEALER].element],
        letterSpacing: 2.4,
      },
    });
    this.skill.anchor.set(0, 0.5);
    this.addChild(this.skill);

    // Last child, so it covers the lockup as well as the fight: the wash is the
    // frame the cut-in is cut in on and punched out through. See play().
    this.wash = new Graphics();
    this.wash.alpha = 0;
    this.addChild(this.wash);

    this.layout = null;

    // Where every moving part rests, captured in resize() rather than read off
    // the object at the top of play(). The exit throws the panel and the lockup
    // off their marks, so a play() that took the current position for home would
    // walk them further off screen on every ultimate after the first.
    this.bustHome = 0;
    this.textHome = 0;
    this.bustScale = { x: 1, y: 1 };
    this.glowScale = { x: 1, y: 1 };
    this.ringHome = 1;

    /** Bumped per play, so a cleanup landing late cannot hide the next one. */
    this.playId = 0;

    // The healer's, like every other thing above that is pointed at a hero: this
    // is whose cut-in it is until a player taps a different card. Safe here
    // rather than in the first resize because main.js has already awaited
    // loadUltBorders by the time a CutIn is built.
    this.setGate(HEROES[this.index].element);
  }

  /**
   * Point the border at one element's burst sheet, or at nothing.
   *
   * Every shape but the halo, and the halo is refused for what it *is* rather
   * than for the box it is put on. The other sheets draw a line on the card's
   * own edge with their bloom outside it, so `fitUltBorder` lands them on the
   * panel exactly and the card blazes. The halo draws a ring — on a rectangle
   * twice as tall as it is wide that is an oval hung off the corners, floating
   * clear of the art on the long sides and cropped by the frame on the short
   * ones, which is what wind's cut-in came out as the one time this was let
   * through.
   *
   * A hero with no sheet is not left bare: the panel's own rim and the bloom
   * behind it are drawn in resize() for every hero, and they are the whole of
   * the border for that one.
   */
  setGate(element) {
    const art = ultBurst(element);
    this.gateArt = art && art.shape !== "halo" ? art : null;
    this.gate.visible = !!this.gateArt;
    if (this.gateArt) this.gate.texture = this.gateArt.frames[0];
  }

  /**
   * Point the whole cut-in at one hero.
   *
   * Everything colour-carrying is rebuilt here rather than in the constructor,
   * including the rays, the panel and the banner — those are drawn in resize(),
   * so this re-runs it once the hero has changed.
   */
  setHero(index) {
    const hero = HEROES[index];
    if (!hero) return;

    const changed = this.index !== index;
    this.index = index;
    if (!changed) return;

    // The bust for the panel, and the roundel only for a hero whose card art
    // never decoded — art/avatars.js hands back null for that, and a cut-in with
    // no face in it is worse than one with the small round one.
    this.art.texture = heroBust(hero.element) || heroPortrait(index);
    this.glow.tint = GEM_COLORS[hero.element];
    this.haze.tint = hazeTint(hero.element);
    this.hazeRest = hazeAlpha(hero.element);
    this.name.text = hero.name;
    this.skill.text = hero.skill;
    this.skill.style.fill = GEM_LIGHT[hero.element];
    this.kicker.style.fill = GEM_LIGHT[hero.element];
    this.setGate(hero.element);
    if (this.layout) this.resize(this.layout);
  }

  resize(layout) {
    this.layout = layout;
    const { w, h } = layout;
    const s = layout.stage;
    const el = HEROES[this.index].element;
    const tall = layout.portrait;

    this.dim.clear();
    this.dim.rect(0, 0, w, h);
    this.dim.fill({ color: DIM_COLOR });

    // Across the whole window rather than the stage, unlike the lockup below:
    // the wash is what the screen is handed over on, and one that stopped at
    // the composition's edge would leave a lit letterbox around a white frame.
    this.wash.clear();
    this.wash.rect(0, 0, w, h);
    this.wash.fill({ color: GEM_LIGHT[el] });

    /* --------------------------------------------------------- the panel */

    // Bound by the height and by the width both. In landscape the height runs
    // out first and in portrait the width does, and a panel sized off one of
    // them alone is off the top of one screen or over both edges of the other.
    const ph = Math.min(
      s.h * (tall ? PANEL.tall.portrait : PANEL.tall.landscape),
      (s.w * (tall ? PANEL.wide.portrait : PANEL.wide.landscape)) /
        PANEL.aspect,
    );
    const pw = ph * PANEL.aspect;
    const rad = pw * PANEL.corner;

    this.bust.rotation = PANEL.tilt;
    // Centred in portrait and left of centre in landscape, because the type is
    // underneath it in one and beside it in the other: a card held off-centre
    // with nothing in the space it left is a composition with a hole in it.
    this.bust.x = s.x + s.w * (tall ? 0.47 : 0.26);
    this.bust.y = s.y + s.h * (tall ? 0.36 : 0.47);

    // The tile under the painting, a shade off black in the element's own dark.
    // It is what a hero whose art never decoded is left standing on, and what
    // the corner radius is actually cut out of.
    this.plateBack.clear();
    this.plateBack.roundRect(-pw / 2, -ph / 2, pw, ph, rad);
    this.plateBack.fill({ color: lerpColor(0x05040c, GEM_DARK[el], 0.35) });

    // Cover-fit, biased up. The bust is a head and shoulders and the panel is
    // very nearly its own aspect, so this is a crop of a few points either way —
    // the bias is what makes those points come off the chest rather than off the
    // top of the head.
    const tex = this.art.texture;
    const fit = Math.max(pw / tex.width, ph / tex.height);
    this.art.setSize(tex.width * fit, tex.height * fit);
    this.art.x = 0;
    this.art.y = (ph - tex.height * fit) * 0.28;

    this.artMask.clear();
    this.artMask.roundRect(-pw / 2, -ph / 2, pw, ph, rad);
    this.artMask.fill({ color: 0xffffff });

    this.plateFront.clear();

    // The foot. The painting runs to the bottom edge of the panel and stops
    // dead there, which on a card is hidden under the readouts and here is a
    // straight cut across a pair of shoulders. Four bands of the element's dark,
    // deepening downwards, are a gradient for four polys and no texture to bake.
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      const y = -ph / 2 + ph * (0.62 + t * 0.38);
      this.plateFront.rect(-pw / 2, y, pw, ph * 0.1 + 1);
      this.plateFront.fill({
        color: lerpColor(GEM_DARK[el], 0x03020a, 0.55),
        alpha: 0.16 + t * 0.3,
      });
    }

    // And the rim on the card's own line: dark first so the panel holds its edge
    // wherever a ray runs behind it, the element over that, and a hairline of
    // the light inside both.
    this.plateFront.roundRect(-pw / 2, -ph / 2, pw, ph, rad);
    this.plateFront.stroke({
      width: Math.max(2, pw * 0.035),
      color: 0x07050e,
      alpha: 0.9,
      alignment: 1,
    });
    this.plateFront.roundRect(-pw / 2, -ph / 2, pw, ph, rad);
    this.plateFront.stroke({
      width: Math.max(1.5, pw * 0.018),
      color: GEM_COLORS[el],
      alignment: 0.5,
    });
    this.plateFront.roundRect(
      -pw / 2 + pw * 0.03,
      -ph / 2 + pw * 0.03,
      pw - pw * 0.06,
      ph - pw * 0.06,
      rad * 0.7,
    );
    this.plateFront.stroke({
      width: Math.max(1, pw * 0.008),
      color: GEM_LIGHT[el],
      alpha: 0.5,
    });

    // Corner ticks: the one piece of pure ornament in here. Two short runs at
    // opposite corners, which is what stops the panel reading as a rounded
    // rectangle with a stroke on it.
    const tick = pw * 0.26;
    const inset = pw * 0.09;
    for (const [sx, sy] of [
      [-1, -1],
      [1, 1],
    ]) {
      const x = sx * (pw / 2 - inset);
      const y = sy * (ph / 2 - inset);
      this.plateFront.moveTo(x - sx * 0, y);
      this.plateFront.lineTo(x, y - sy * tick);
      this.plateFront.moveTo(x, y);
      this.plateFront.lineTo(x - sx * tick, y);
      this.plateFront.stroke({
        width: Math.max(2, pw * 0.022),
        color: GEM_LIGHT[el],
        alpha: 0.85,
        cap: "round",
      });
    }

    // The burst border, on the card's own line. `fitUltBorder` grows the sprite
    // by whatever margin the sheet was packed with, so the rim lands on the edge
    // and the bloom hangs outside it — the same call the hero row makes, on the
    // same shape, which is the whole reason this reads as that card.
    if (this.gateArt) fitUltBorder(this.gate, this.gateArt, pw, ph);

    this.glow.setSize(pw * 3.4, ph * 1.9);
    this.glow.x = this.bust.x;
    this.glow.y = this.bust.y;
    this.haze.x = this.bust.x;
    this.haze.y = this.bust.y;
    // Bigger than the window on purpose: the falloff is most of a radial's area,
    // and what this is for is a colour cast behind the lockup rather than a
    // visible blob anywhere in the frame.
    this.haze.setSize(w * 1.45, h * 1.7);

    /* ---------------------------------------------------------- the rays */

    // Everything past the far corner of the window from the focal point, so no
    // ray ends inside the frame whatever shape the window is.
    const reach =
      Math.hypot(
        Math.max(this.bust.x, w - this.bust.x),
        Math.max(this.bust.y, h - this.bust.y),
      ) * 1.05;
    const r0 = ph * RAYS.inner;

    this.rayHub.x = this.bust.x;
    this.rayHub.y = this.bust.y;
    this.rays.clear();
    for (let i = 0; i < RAYS.count; i++) {
      const a =
        ((i + jitter(i) * RAYS.drift) / RAYS.count) * Math.PI * 2 + PANEL.tilt;
      const white = jitter(i + 53) < RAYS.white;
      // The white ones are struck thin whatever the roll says. They are the
      // brightest thing in the burst and a fat one is not a highlight, it is a
      // grey slab lying across the corner of the frame.
      const hw = Math.min(
        RAYS.thin + (RAYS.fat - RAYS.thin) * jitter(i + 17) ** RAYS.taper,
        white ? RAYS.fat * 0.16 : RAYS.fat,
      );
      const alpha =
        (white ? RAYS.peak * 1.5 : RAYS.peak) *
        (0.35 + jitter(i + 91) * 0.65) ** RAYS.falloff;
      const color = white
        ? 0xffffff
        : lerpColor(GEM_COLORS[el], GEM_LIGHT[el], jitter(i + 11) * 0.6);

      /**
       * One wedge, from `t0` of the way out to the frame's edge.
       *
       * The inner end is a point rather than a stub — a wedge that starts wide
       * is a slice of pie, and what is wanted is a line that arrives — so the
       * half-width is scaled by how far along the ray the end sits.
       */
      const wedge = (t0, k) => {
        const rin = r0 + (reach - r0) * t0;
        const win = hw * (0.06 + t0 * 0.94);
        this.rays.poly([
          Math.cos(a - win) * rin,
          Math.sin(a - win) * rin,
          Math.cos(a + win) * rin,
          Math.sin(a + win) * rin,
          Math.cos(a + hw) * reach,
          Math.sin(a + hw) * reach,
          Math.cos(a - hw) * reach,
          Math.sin(a - hw) * reach,
        ]);
        this.rays.fill({ color, alpha: alpha * k });
      };

      wedge(0, 0.45);
      wedge(1 - RAYS.hot, 0.75);
    }

    // The shockwave, drawn once at rest size and thrown by scale.
    this.ringHome = ph * 0.5;
    this.ring.clear();
    this.ring.circle(0, 0, this.ringHome);
    this.ring.stroke({
      width: Math.max(2, ph * 0.012),
      color: GEM_LIGHT[el],
      alpha: 0.9,
    });
    this.ring.circle(0, 0, this.ringHome * 0.92);
    this.ring.stroke({ width: Math.max(1, ph * 0.005), color: 0xffffff });
    this.ring.x = this.bust.x;
    this.ring.y = this.bust.y;

    /* ---------------------------------------------------------- the type */

    const fs = Math.max(
      22,
      Math.min(s.w * (tall ? 0.13 : 0.105), 54 * layout.ui),
    );
    this.name.style.fontSize = fs;
    this.name.style.letterSpacing = fs * 0.085;
    // The banner is not what makes the type readable: the rays run behind it on
    // the way in and the wash comes up under it on the way out. Both are
    // answered here rather than by hoping the plate stays put.
    this.name.style.stroke = {
      color: 0x0a0512,
      width: fs * 0.07,
      join: "round",
    };
    this.name.style.dropShadow = {
      color: 0x03020a,
      alpha: 0.7,
      blur: fs * 0.22,
      distance: 0,
      angle: 0,
    };
    this.skill.style.fontSize = fs * 0.4;
    this.skill.style.letterSpacing = fs * 0.06;
    this.skill.style.stroke = {
      color: 0x0a0512,
      width: fs * 0.04,
      join: "round",
    };
    this.skill.style.dropShadow = {
      color: 0x03020a,
      alpha: 0.6,
      blur: fs * 0.1,
      distance: 0,
      angle: 0,
    };
    this.kicker.style.fontSize = fs * 0.26;
    this.kicker.style.letterSpacing = fs * 0.17;

    // Far enough in that the banner's sheared bottom-left corner and the accent
    // bar on it both clear the edge: the plate leans left as it goes down, so a
    // block set flush to the margin bleeds its own head off the screen.
    const textX = s.x + s.w * (tall ? 0.15 : 0.47);
    const midY = s.y + s.h * (tall ? 0.74 : 0.47);
    this.kicker.x = textX;
    this.kicker.y = midY - fs * 0.78;
    this.name.x = textX;
    this.name.y = midY;
    this.skill.x = textX;
    this.skill.y = midY + fs * 0.62;

    /*
     * The marks play() throws everything off, and puts everything back on.
     *
     * The panel's rest scale is *asserted* here rather than read off the panel,
     * and that is a bug fix rather than a tidy-up. resize() runs on a hero
     * change, setHero() runs at the top of play(), and play() starts before the
     * last one has finished putting itself away — so reading the live scale
     * captured whatever the previous punch was in the middle of. 1.5 became the
     * new rest, the next punch took it to 1.5 again from there, and by the
     * fourth ultimate in a row the card was twice the height of the screen with
     * the hero's face bled off all four edges. Nothing in this function scales
     * the panel — its size is the geometry drawn above — so the rest scale is
     * one, always, and saying so is what makes it true.
     *
     * The glow needs no such help: setSize() above rewrites its scale outright
     * from the texture, so what is captured is already the rest value however
     * the last punch left it.
     */
    this.bust.scale.set(1, 1);
    this.bustHome = this.bust.x;
    this.textHome = textX;
    this.bustScale = { x: 1, y: 1 };
    this.glowScale = { x: this.glow.scale.x, y: this.glow.scale.y };

    /* ------------------------------------------------------- the banner */

    /**
     * The banner.
     *
     * Sheared to the same lean as the rest of the frame, both ends, so it
     * belongs to the composition instead of sitting on it. The ground stays a
     * near-black with the element only breathed into it — GEM_DARK for lightning
     * is a dark yellow, and a dark yellow slab under gold type is mud — and the
     * hero's colour is carried by the things that can be saturated without
     * dirtying anything: the accent, the rules and the skill.
     *
     * And it stops where the type stops. What runs to the composition's edge is
     * a hairline off the banner's shoulder: the lockup keeps the full width it
     * was composed for, and only the part with words on it is a plate.
     */
    const top = this.kicker.y - fs * 0.34;
    const bot = this.skill.y + fs * 0.42;
    const bh = bot - top;
    const shear = bh * LEAN;
    const left = textX - fs * 0.66;
    // Both edges lean the way the rays do: bottom to the left of top. `t` is the
    // fraction of the banner's depth, 0 at the top edge and 1 at the bottom.
    const leanAt = (t) => shear * (0.5 - t);
    const yAt = (t) => top + bh * t;
    const lAt = (t) => left + leanAt(t);

    // Where the far edge has to be, measured off the type rather than budgeted:
    // the roster's names run from SELISA to RICKLOW, and a plate cut for the
    // longest of them is a plate with a hole in it for every other hero. Off all
    // three lines, each at its own depth, because the edge leans.
    const clearing = (width, y) =>
      textX + width + fs * 0.8 + shear * 0.5 - leanAt((y - top) / bh);
    const right = Math.min(
      s.right,
      Math.max(
        clearing(this.kicker.width, this.kicker.y),
        clearing(this.name.width, this.name.y),
        clearing(this.skill.width, this.skill.y),
      ),
    );
    const rAt = (t) => right - shear * 0.5 + leanAt(t);
    /** The full-width slice of the banner between two depths. */
    const band = (t0, t1) => [
      lAt(t0),
      yAt(t0),
      rAt(t0),
      yAt(t0),
      rAt(t1),
      yAt(t1),
      lAt(t1),
      yAt(t1),
    ];

    this.plate.clear();

    // The hairline out to the edge, under the plate so the plate's own shoulder
    // finishes it. Drawn first for that reason and for no other.
    if (right < s.right - fs * 0.2) {
      const t0 = 0.5;
      const t1 = t0 + Math.max(1, fs * 0.045) / bh;
      this.plate.poly([
        rAt(t0) - fs * 0.4,
        yAt(t0),
        s.right,
        yAt(t0),
        s.right,
        yAt(t1),
        rAt(t1) - fs * 0.4,
        yAt(t1),
      ]);
      this.plate.fill({ color: GEM_COLORS[el], alpha: 0.42 });
    }

    this.plate.poly(band(0, 1));
    this.plate.fill({
      color: lerpColor(0x0a0716, GEM_DARK[el], 0.2),
      alpha: 0.97,
    });
    // Bottom half a shade deeper: a gradient's worth of depth for one more poly
    // and no texture to bake.
    this.plate.poly(band(0.45, 1));
    this.plate.fill({ color: 0x000000, alpha: 0.3 });

    const rule = Math.max(1, fs * 0.035) / bh;
    this.plate.poly(band(0, rule));
    this.plate.fill({ color: GEM_LIGHT[el], alpha: 0.55 });
    this.plate.poly(band(1 - rule * 0.7, 1));
    this.plate.fill({ color: GEM_COLORS[el], alpha: 0.35 });

    // The accent at the head of the banner: the element's colour with a lighter
    // core, so the eye is handed on to the name rather than kept by the bar.
    const barW = fs * 0.22;
    const bar = (a, b) => [
      lAt(0) + barW * a,
      yAt(0),
      lAt(0) + barW * b,
      yAt(0),
      lAt(1) + barW * b,
      yAt(1),
      lAt(1) + barW * a,
      yAt(1),
    ];
    this.plate.poly(bar(0, 1));
    this.plate.fill({ color: GEM_COLORS[el] });
    this.plate.poly(bar(0.3, 0.72));
    this.plate.fill({ color: GEM_LIGHT[el] });
  }

  /** Put every moving part back on its mark, whatever the last punch left. */
  reset() {
    killTweensOf(this.dim);
    killTweensOf(this.wash);
    killTweensOf(this.haze);
    killTweensOf(this.rayHub);
    killTweensOf(this.rayHub.scale);
    killTweensOf(this.rays);
    killTweensOf(this.glow);
    killTweensOf(this.glow.scale);
    killTweensOf(this.bust);
    killTweensOf(this.bust.scale);
    killTweensOf(this.ring);
    killTweensOf(this.ring.scale);
    killTweensOf(this.gateDriver);
    killTweensOf(this.plate);
    killTweensOf(this.kicker);
    killTweensOf(this.name);
    killTweensOf(this.skill);

    this.alpha = 1;
    this.dim.alpha = 0;
    this.wash.alpha = 0;
    this.haze.alpha = 0;
    this.rayHub.rotation = 0;
    this.rayHub.scale.set(1);
    this.rays.alpha = 0;
    this.glow.alpha = 0;
    this.glow.scale.set(this.glowScale.x, this.glowScale.y);
    this.bust.alpha = 1;
    this.bust.x = this.bustHome;
    this.bust.rotation = PANEL.tilt;
    this.bust.scale.set(this.bustScale.x, this.bustScale.y);
    this.ring.alpha = 0;
    this.ring.scale.set(1);
    this.gateDriver.v = 0;
    if (this.gateArt) this.gate.texture = this.gateArt.frames[0];
    this.plate.alpha = 1;
    this.plate.x = 0;
    this.kicker.alpha = 1;
    this.kicker.x = this.textHome;
    this.name.alpha = 1;
    this.name.x = this.textHome;
    this.skill.alpha = 1;
    this.skill.x = this.textHome;
  }

  /**
   * Step the border to `v` of the way through its burst, over `dur`.
   *
   * A tween on one number with the texture written out of its onUpdate, exactly
   * as HeroCard.flareUlt drives the same sheet on the card, and for the same
   * reason: a sheet is not something a frame counter can keep in step with an
   * arc that is three beats of different lengths, and the driver is the one
   * thing both ends of a beat can be read off. Resolves immediately for a hero
   * with no sheet, so play() can await it in line with everything else.
   */
  gateTo(v, dur, ease) {
    if (!this.gateArt) return Promise.resolve();
    return tween(this.gateDriver, { v }, dur, {
      ease,
      onUpdate: () => {
        this.gate.texture = ultBurstTexture(this.gateArt, this.gateDriver.v);
      },
    });
  }

  /**
   * Cut in, hold, punch out.
   *
   * The exit is the point of the whole thing. It used to be eight cross-fades
   * running out together, which handed the director an empty screen and a beat
   * of dead air before the blast it fires next — the loudest move in the fight
   * arriving after its own build-up had already dissolved.
   *
   * Now it is a hit: the panel recoils, is thrown through the camera, the lockup
   * is blown off the other way, and the wash takes the screen in the hero's
   * colour. play() resolves *on* that wash, while it is still up, so the strike
   * and the sweep the director fires next play underneath it — the board is
   * uncovered already exploding rather than waiting to be told to.
   */
  async play(index) {
    if (index !== undefined) this.setHero(index);
    // Every offset below is a distance travelled, and the distance is the
    // composition's width rather than the window's.
    const { w } = this.layout.stage;
    const token = ++this.playId;

    this.reset();
    this.visible = true;
    sfx.ultCutin(HEROES[this.index].element);

    const homeX = this.bustHome;
    const textHome = this.textHome;
    const bs = this.bustScale;
    const gs = this.glowScale;

    // A cut, not a dissolve. The dim and the rays are simply there on the first
    // frame and the wash covers the two frames it takes the eye to catch up:
    // fading a black rectangle up over the fight was the softest moment in the
    // loudest beat of the creative.
    this.dim.alpha = DIM;
    this.rays.alpha = 1;
    this.haze.alpha = this.hazeRest;
    this.wash.alpha = 0.94;

    // The rays arrive thrown open and wound back, so the burst is still closing
    // on the hero as the hero lands. Half a slot of spin is all it takes — any
    // more and the frame reads as a spinning wheel rather than as a hit.
    this.rayHub.scale.set(1.35);
    this.rayHub.rotation = -0.16;
    this.bust.x = homeX - w * 0.45;
    this.bust.scale.set(bs.x * 1.14, bs.y * 1.14);
    this.kicker.x = textHome + w * 0.34;
    this.name.x = textHome + w * 0.5;
    this.skill.x = textHome + w * 0.7;
    this.plate.x = w;

    tween(this.wash, { alpha: 0 }, 0.2, { ease: Ease.quadOut });

    // The burst closes on its own clock and is deliberately not awaited: it is
    // still settling as the panel lands and for a beat after, which is what
    // makes the landing the moment rather than the end of four tweens finishing
    // together. Awaiting them stretched the entry to half a second and pushed
    // every beat after it out with it.
    tween(this.rayHub.scale, { x: 1, y: 1 }, 0.42, { ease: Ease.expoOut });
    tween(this.rayHub, { rotation: 0 }, 0.5, { ease: Ease.expoOut });

    await Promise.all([
      tween(this.bust, { x: homeX }, 0.32, { ease: Ease.expoOut }),
      tween(this.bust.scale, { x: bs.x, y: bs.y }, 0.36, {
        ease: Ease.expoOut,
      }),
      tween(this.glow, { alpha: 0.7 }, 0.3),
      tween(this.plate, { x: 0 }, 0.28, { ease: Ease.expoOut }),
      tween(this.kicker, { x: textHome }, 0.3, { ease: Ease.expoOut }),
      tween(this.name, { x: textHome }, 0.34, { ease: Ease.expoOut }),
      tween(this.skill, { x: textHome }, 0.4, { ease: Ease.expoOut }),
      // Linear, alone among these: the build is in the frames the sheet was
      // packed with, and an ease over the top of it is a second opinion about
      // where the peak is. Same argument ULT.burst makes on the card.
      this.gateTo(GATE.land, 0.32, Ease.linear),
    ]);
    if (this.playId !== token) return;

    // The shockwave, on the frame the panel lands and gone in a quarter second.
    // It is thrown from the panel's own centre at the panel's own size, which is
    // what makes it read as the card hitting the glass rather than as a ring
    // that happened to be there.
    this.ring.alpha = 0.85;
    this.ring.scale.set(0.75);
    tween(this.ring.scale, { x: 2.6, y: 2.6 }, 0.42, { ease: Ease.quadOut });
    tween(this.ring, { alpha: 0 }, 0.38, { ease: Ease.quadOut });

    // The hold is not a freeze: the rays turn and the panel creeps in, so the punch below starts from something that was already
    // moving.
    tween(this.rayHub, { rotation: 0.05 }, 0.62, {
      ease: Ease.quadOut,
      delay: 0.12,
    });
    tween(this.bust.scale, { x: bs.x * 1.05, y: bs.y * 1.05 }, 0.45, {
      ease: Ease.quadOut,
    });
    // Across the hold and the recoil both, so the border is still moving into
    // the frame the punch throws it out on rather than sitting on one for a beat
    // and a half. Roughly the seven frames a second the sheet was timed to.
    this.gateTo(GATE.hold, 0.43, Ease.linear);
    await delay(0.34);
    if (this.playId !== token) return;

    // Two frames back. The recoil is what sells the throw forward.
    await Promise.all([
      tween(this.bust.scale, { x: bs.x * 0.98, y: bs.y * 0.98 }, 0.09, {
        ease: Ease.quadOut,
      }),
      tween(this.bust, { x: homeX - w * 0.02 }, 0.09, { ease: Ease.quadOut }),
    ]);
    if (this.playId !== token) return;

    // The punch. Everything leaves on the same beat and in opposite directions,
    // accelerating rather than easing out, so it reads as one hit instead of
    // four elements politely excusing themselves.
    tween(this.bust.scale, { x: bs.x * 1.55, y: bs.y * 1.55 }, 0.26, {
      ease: Ease.quadIn,
    });
    tween(this.bust, { x: homeX + w * 0.06 }, 0.26, { ease: Ease.quadIn });
    tween(this.bust, { rotation: PANEL.tilt * 2.4 }, 0.26, {
      ease: Ease.quadIn,
    });
    tween(this.bust, { alpha: 0 }, 0.16, { delay: 0.1 });
    // The settle, spent being thrown through the camera. The last frames of the
    // sheet are the light going out of the border, which on the card is the
    // whole tail of the tap and here is a thing nobody has time to look at —
    // which is the point: it leaves with the panel instead of before it.
    this.gateTo(1, 0.26, Ease.linear);
    tween(this.glow.scale, { x: gs.x * 1.8, y: gs.y * 1.8 }, 0.24, {
      ease: Ease.quadIn,
    });
    tween(this.glow, { alpha: 0 }, 0.22, { delay: 0.06 });
    // The rays go with it, blown outward rather than faded: the burst is thrown
    // through the camera on the same frame the hero is.
    tween(this.rayHub.scale, { x: 2.4, y: 2.4 }, 0.26, { ease: Ease.quadIn });
    tween(this.rayHub, { rotation: 0.16 }, 0.26, { ease: Ease.quadIn });
    tween(this.rays, { alpha: 0 }, 0.22, { delay: 0.06 });
    tween(this.haze, { alpha: 0 }, 0.22, { delay: 0.04 });
    tween(this.plate, { x: w }, 0.2, { ease: Ease.backIn });
    tween(this.kicker, { x: textHome + w * 0.4 }, 0.18, { ease: Ease.backIn });
    tween(this.name, { x: textHome + w * 0.55 }, 0.2, { ease: Ease.backIn });
    tween(this.skill, { x: textHome + w * 0.75 }, 0.22, { ease: Ease.backIn });
    tween(this.dim, { alpha: 0 }, 0.24, { delay: 0.05 });

    await tween(this.wash, { alpha: 1 }, 0.17, { ease: Ease.quadIn });
    if (this.playId !== token) return;

    // Handed over on the wash. What is under it is put away rather than tweened
    // out, because none of it can be seen — and the wash itself is left running,
    // which is the whole trick: the caller gets the screen back one frame after
    // the hit, not a third of a second after the last fade.
    this.dim.alpha = 0;
    this.haze.alpha = 0;
    this.rays.alpha = 0;
    this.bust.alpha = 0;
    this.glow.alpha = 0;
    this.ring.alpha = 0;
    this.plate.alpha = 0;
    this.kicker.alpha = 0;
    this.name.alpha = 0;
    this.skill.alpha = 0;

    tween(this.wash, { alpha: 0 }, 0.32, { ease: Ease.quadOut }).then(() => {
      // A cut-in that started while this was falling owns the screen now.
      if (this.playId !== token) return;
      this.visible = false;
      this.reset();
    });
  }
}
