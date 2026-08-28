/**
 * Ultimate cut-in — for whichever hero the player just spent.
 *
 * The single most important beat in the creative: this is where the player is
 * told "the heroes are the power", so it gets the full anime treatment. It used
 * to be Arissa's alone, baked into the constructor; now every card can be tapped,
 * so the portrait, the name, the skill and every colour on screen are swapped
 * by setHero() before the slam.
 *
 * And it is a cut now rather than a tint. The frame it used to hand over was a
 * translucent sticker on the gameplay: the fight went 82% dark, which still left
 * the hero row reading its own names and numbers, the board showing five columns
 * of saturated gem and the coach shouting through the middle of it — and then
 * the speed lines were drawn over the top at a width and a flatness that lifted
 * all of it back and smeared the screen with tan bands. Everything below is
 * aimed at that one fault: the fight goes away, the lockup is the only thing
 * lit, and the streaks are a burst around it rather than a gradient over it.
 */

import { Container, Graphics, Sprite, Text } from "pixi.js";
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
import { glowTexture } from "../art/textures.js";
import { lerpColor } from "../core/color.js";
import { tween, delay, killTweensOf, Ease } from "../core/tween.js";
import * as sfx from "../audio/sfx.js";

/**
 * How far down the fight goes, and what colour the hole is.
 *
 * It was 0.82. Eighteen percent of a lit board is not a backdrop, it is a second
 * composition competing with the first — and the one thing a cut-in has to do is
 * be the only thing on screen. At 0.965 what is left of the fight is a suggestion
 * of where it was, which is all this frame wants from it: the haze below is what
 * keeps the darkness from reading as a black rectangle.
 *
 * The haze has to be kept honest for the same reason. It blends additively over
 * everything, the fight included, so every point of it hands some of the board
 * back — at a quarter it was legibly un-dimming the hero row and the coach's
 * shout through the middle of the frame. It is a breath of the element in the
 * dark, and that is all it is allowed to be.
 */
const DIM = 0.965;
const DIM_COLOR = 0x04030a;

/**
 * The speed-line burst.
 *
 * Rewritten from the wide bands it was. The old set drew 32 shards at up to 3%
 * of the window's width, flat, unblended, and at the same alpha the whole way
 * across — which over a dark frame is not motion, it is a broken gradient, and
 * it was the ugliest thing in the shot. These are many, mostly hair-thin,
 * additive, and weighted so the streaks pile up at the frame's edges and fall to
 * nothing across the middle third where the medallion and the type live. That
 * falloff is the whole difference between a burst and a smear: an anime cut-in
 * is clean where you are meant to look.
 */
const LINES = {
  count: 76,
  /** Horizontal travel over a shard's own height, as a fraction of it. */
  lean: 0.36,
  /** Thinnest and thickest shard, as a fraction of the window's width. */
  thin: 0.0013,
  thick: 0.009,
  /**
   * Alpha at the frame's edge, and how fast it dies inward.
   *
   * Both are quieter than they want to be. Additive streaks are cheap to make
   * bright and the temptation is to let them carry the frame, but they are
   * lighting a dark room, not filling it: at 0.34 and a soft falloff the burst
   * added up to an olive cast over the whole shot, which is a colour nobody
   * chose. The steep exponent is what buys the clean middle third.
   */
  peak: 0.22,
  falloff: 2.5,
  /** Floor, so the middle is quiet rather than empty. */
  base: 0.008,
  /**
   * How far a shard may wander from its slot, in slots.
   *
   * Evenly spaced streaks read as a pattern — a hatch, a moiré, anything but
   * speed. Over a slot and a half of drift they clump and gap, which is what a
   * burst does.
   */
  drift: 1.5,
};

/**
 * How much light the haze is allowed to put back into the frame.
 *
 * In luminance rather than in alpha, and that is the whole point of it. An
 * additive layer's alpha is not what it looks like: at one flat value the six
 * elements came out as six different frames, because lightning's yellow carries
 * near twice the light of fire's orange and almost three times arcane's purple.
 * SELISA's cut-in went olive while RICKLOW's stayed deep — same code, same
 * number, and one of them looking like a mistake. Spend the same light instead
 * and all six read alike.
 */
const HAZE_LIFT = 0.045;

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

    /** Whose cut-in this currently is. the healer until somebody taps another card. */
    this.index = HEALER;

    this.dim = new Graphics();
    this.addChild(this.dim);

    // The colour in the hole. A frame dimmed this far needs something under the
    // streaks or it is a black rectangle with a face on it — this is the element
    // bleeding into the dark, and it is what lets DIM be as high as it is.
    this.haze = new Sprite(glowTexture());
    this.haze.anchor.set(0.5);
    this.haze.blendMode = "add";
    this.haze.tint = hazeTint(HEROES[HEALER].element);
    this.addChild(this.haze);

    /** What the haze rests at for the hero it is currently pointed at. */
    this.hazeRest = hazeAlpha(HEROES[HEALER].element);

    this.lines = new Graphics();
    this.lines.blendMode = "add";
    this.addChild(this.lines);

    this.glow = new Sprite(glowTexture());
    this.glow.anchor.set(0.5);
    this.glow.blendMode = "add";
    this.glow.tint = GEM_COLORS[HEROES[HEALER].element];
    this.addChild(this.glow);

    /**
     * The medallion: the roundel and everything drawn around it, as one object.
     *
     * A container rather than a bare sprite, because the portrait is not a bare
     * portrait any more. The roundel arrives as a circle with a dark hairline on
     * it — see art/avatars.js — and a circle with a hairline dropped onto a lit
     * frame reads as a pasted avatar. The collar, the rings and the arcs are what
     * make it a medallion, and they have to travel with it: the whole thing is
     * thrown through the camera on the punch, so it is the container that moves
     * and everything inside it that stays put.
     */
    this.bust = new Container();
    this.addChild(this.bust);

    this.collar = new Graphics();
    this.bust.addChild(this.collar);

    this.portrait = new Sprite(heroPortrait(HEALER));
    this.portrait.anchor.set(0.5);
    this.bust.addChild(this.portrait);

    this.rings = new Graphics();
    this.bust.addChild(this.rings);

    this.plate = new Graphics();
    this.addChild(this.plate);

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
    // the object at the top of play(). The exit throws the medallion and the
    // lockup off their marks, so a play() that took the current position for
    // home would walk them further off screen on every ultimate after the first.
    this.bustHome = 0;
    this.textHome = 0;
    this.bustScale = { x: 1, y: 1 };
    this.glowScale = { x: 1, y: 1 };

    /** Bumped per play, so a cleanup landing late cannot hide the next one. */
    this.playId = 0;
  }

  /**
   * Point the whole cut-in at one hero.
   *
   * Everything colour-carrying is rebuilt here rather than in the constructor,
   * including the speed lines, the rings and the name plate — those are drawn in
   * resize(), so this re-runs it once the hero has changed.
   */
  setHero(index) {
    const hero = HEROES[index];
    if (!hero) return;

    const changed = this.index !== index;
    this.index = index;
    if (!changed) return;

    this.portrait.texture = heroPortrait(index);
    this.glow.tint = GEM_COLORS[hero.element];
    this.haze.tint = hazeTint(hero.element);
    this.hazeRest = hazeAlpha(hero.element);
    this.name.text = hero.name;
    this.skill.text = hero.skill;
    this.skill.style.fill = GEM_LIGHT[hero.element];
    if (this.layout) this.resize(this.layout);
  }

  resize(layout) {
    this.layout = layout;
    const { w, h } = layout;
    const el = HEROES[this.index].element;

    this.dim.clear();
    this.dim.rect(0, 0, w, h);
    this.dim.fill({ color: DIM_COLOR });

    // Across the whole window rather than the stage, unlike the lockup below:
    // the wash is what the screen is handed over on, and one that stopped at
    // the composition's edge would leave a lit letterbox around a white frame.
    this.wash.clear();
    this.wash.rect(0, 0, w, h);
    this.wash.fill({ color: GEM_LIGHT[el] });

    /* --------------------------------------------------------- the burst */

    // A shard's alpha is judged at its own mid-height, because that is where it
    // passes the thing it must not cross: the medallion and the type both sit on
    // the composition's middle band.
    const cx = w * 0.5;
    const travel = h * 1.4 * LINES.lean;
    const span = w + travel * 2;

    this.lines.clear();
    for (let i = 0; i < LINES.count; i++) {
      const x = -travel + span * ((i + jitter(i) * LINES.drift) / LINES.count);
      const wdt =
        w * (LINES.thin + (LINES.thick - LINES.thin) * jitter(i + 31) ** 2.4);
      const d = Math.min(1, Math.abs(x - travel * 0.5 - cx) / (w * 0.5));
      // A few white ones among the element's own, and only out where the burst
      // is already bright: a white hair through the middle of a coloured frame
      // is a scratch on the film.
      const white = jitter(i + 53) > 0.8 && d > 0.45;
      const alpha =
        (white ? 0.4 : LINES.peak) * d ** LINES.falloff + LINES.base;

      this.lines.poly([
        x,
        -h * 0.2,
        x + wdt,
        -h * 0.2,
        x - travel,
        h * 1.2,
        x - travel - wdt,
        h * 1.2,
      ]);
      this.lines.fill({
        color: white
          ? 0xffffff
          : lerpColor(GEM_COLORS[el], GEM_LIGHT[el], jitter(i + 11) * 0.55),
        alpha,
      });
    }

    // The dim, the haze and the burst above are the window's — they are what
    // makes the rest of the screen go away. Everything from here down is the
    // lockup itself, and it is sized and placed on the stage, so on a desktop
    // the medallion comes in at the size it was drawn at over the middle of the
    // arena rather than filling a monitor.
    const s = layout.stage;

    // Bigger than the window on purpose: the falloff is most of a radial's area,
    // and what this is for is a colour cast behind the lockup rather than a
    // visible blob anywhere in the frame. Centred on the medallion, so what
    // little of it can be read is a hero standing in their own light.
    this.haze.setSize(w * 1.35, h * 1.6);

    /* ----------------------------------------------------- the medallion */

    // A shade off what it was, and bound by the width in portrait rather than by
    // the height. The old diameter put the circle's bottom edge through the hero
    // row it is drawn over — a portrait resting on six cards — and on a 375 the
    // rings ran off the left edge of the screen, because the diameter is the
    // roundel's and the collar, the rim and the arcs are all drawn outside it —
    // about a ninth of the radius past its edge. The narrower fit and the mark
    // further in are for them rather than for the picture.
    const size = Math.min(
      s.h * (layout.portrait ? 0.42 : 0.47),
      s.w * (layout.portrait ? 0.62 : 0.66),
    );
    const r = size / 2;
    this.portrait.setSize(size, size);
    this.bust.x = s.x + s.w * (layout.portrait ? 0.4 : 0.27);
    this.bust.y = s.y + s.h * (layout.portrait ? 0.42 : 0.44);

    // The dark collar under the roundel. Wider than the art, so the medallion
    // has an edge of its own wherever a streak runs behind it.
    this.collar.clear();
    this.collar.circle(0, 0, r * 1.075);
    this.collar.fill({ color: lerpColor(GEM_DARK[el], 0x000000, 0.55) });

    // Rings, outside in: a dark rim that holds the edge against a bright streak,
    // the element's own band, and a hairline just inside the art to lift the face
    // off it. Then two arcs — the one piece of pure ornament in here, and what
    // stops the whole thing reading as a circle with a stroke on it.
    this.rings.clear();
    this.rings.circle(0, 0, r * 1.055);
    this.rings.stroke({ width: r * 0.06, color: 0x07050e, alpha: 0.92 });
    this.rings.circle(0, 0, r * 1.015);
    this.rings.stroke({ width: r * 0.032, color: GEM_COLORS[el] });
    this.rings.circle(0, 0, r * 0.976);
    this.rings.stroke({ width: r * 0.013, color: GEM_LIGHT[el], alpha: 0.75 });

    // The arcs. moveTo first, and it is not optional: an arc picks up wherever
    // the path was left, so without it the two of them are joined to the last
    // circle by a chord straight across the hero's face.
    const arcR = r * 1.115;
    for (const [a0, a1] of [
      [-2.16, -1.16],
      [1.16, 2.16],
    ]) {
      this.rings.moveTo(Math.cos(a0) * arcR, Math.sin(a0) * arcR);
      this.rings.arc(0, 0, arcR, a0, a1);
      this.rings.stroke({
        width: r * 0.042,
        color: GEM_LIGHT[el],
        alpha: 0.8,
        cap: "round",
      });
    }

    this.glow.setSize(size * 2.2, size * 2.2);
    this.glow.x = this.bust.x;
    this.glow.y = this.bust.y;
    this.haze.x = this.bust.x;
    this.haze.y = this.bust.y;

    /* ---------------------------------------------------------- the type */

    const fs = Math.max(22, Math.min(s.w * 0.105, 54 * layout.ui));
    this.name.style.fontSize = fs;
    this.name.style.letterSpacing = fs * 0.085;
    // The banner is not what makes the type readable: the burst runs behind it
    // on the way in and the wash comes up under it on the way out. Both are
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

    const textX = s.x + s.w * (layout.portrait ? 0.15 : 0.5);
    this.name.x = textX;
    this.name.y = s.y + s.h * (layout.portrait ? 0.72 : 0.44);
    this.skill.x = textX;
    this.skill.y = this.name.y + fs * 0.74;

    // The marks play() throws everything off, and puts everything back on.
    this.bustHome = this.bust.x;
    this.textHome = textX;
    this.bustScale = { x: this.bust.scale.x, y: this.bust.scale.y };
    this.glowScale = { x: this.glow.scale.x, y: this.glow.scale.y };

    /**
     * The banner.
     *
     * Sheared to the same angle as the burst, both ends, so it belongs to the
     * frame instead of sitting on it. The old plate was an upright navy
     * rectangle at 0.85 alpha: a hard vertical chop across the board with gems
     * showing through it, in a colour that had nothing to do with the hero whose
     * name was on it.
     *
     * Two things replace it, and neither is the obvious fix. The obvious fix is
     * to paint the plate in the element's own dark, and it is wrong: GEM_DARK
     * for lightning is a dark yellow, and a dark yellow slab under gold type is
     * mud. So the ground stays a near-black with the element only breathed into
     * it, and the hero's colour is carried by the things that can be saturated
     * without dirtying anything — the accent, the rules, the skill.
     *
     * And it stops where the type stops. It used to run out to the composition's
     * edge, which on a name as short as SELISA is two thirds of a bar with
     * nothing on it. What runs to the edge now is a hairline off the banner's
     * shoulder: the lockup keeps the full width it was composed for, and only
     * the part with words on it is a plate.
     */
    const top = this.name.y - fs * 0.72;
    const bot = this.skill.y + fs * 0.54;
    const bh = bot - top;
    const shear = bh * LINES.lean;
    const left = textX - fs * 0.66;
    // Both edges lean the way the streaks do: bottom to the left of top. `t` is
    // the fraction of the banner's depth, 0 at the top edge and 1 at the bottom.
    const leanAt = (t) => shear * (0.5 - t);
    const yAt = (t) => top + bh * t;
    const lAt = (t) => left + leanAt(t);

    // Where the far edge has to be, measured off the type rather than budgeted:
    // the roster's names run from SELISA to RICKLOW, and a plate cut for the
    // longest of them is a plate with a hole in it for every other hero.
    //
    // Off both lines, and each at its own depth, because the edge leans. The
    // skill sits three quarters of the way down the banner, where the lean has
    // already taken a fifth of the shear off the corner — measure the plate on
    // the name alone and the last letter of STORM VERDICT hangs over the edge.
    const clearing = (width, y) =>
      textX + width + fs * 0.8 + shear * 0.5 - leanAt((y - top) / bh);
    const right = Math.min(
      s.right,
      Math.max(
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
      const t0 = 0.52;
      const t1 = t0 + Math.max(1, fs * 0.05) / bh;
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
    const barW = fs * 0.2;
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
    killTweensOf(this.lines);
    killTweensOf(this.glow);
    killTweensOf(this.glow.scale);
    killTweensOf(this.bust);
    killTweensOf(this.bust.scale);
    killTweensOf(this.plate);
    killTweensOf(this.name);
    killTweensOf(this.skill);

    this.alpha = 1;
    this.dim.alpha = 0;
    this.wash.alpha = 0;
    this.haze.alpha = 0;
    this.lines.x = 0;
    this.lines.alpha = 0;
    this.glow.alpha = 0;
    this.glow.scale.set(this.glowScale.x, this.glowScale.y);
    this.bust.alpha = 1;
    this.bust.x = this.bustHome;
    this.bust.scale.set(this.bustScale.x, this.bustScale.y);
    this.plate.alpha = 1;
    this.plate.x = 0;
    this.name.alpha = 1;
    this.name.x = this.textHome;
    this.skill.alpha = 1;
    this.skill.x = this.textHome;
  }

  /**
   * Cut in, hold, punch out.
   *
   * The exit is the point of the whole thing. It used to be eight cross-fades
   * running out together, which handed the director an empty screen and a beat
   * of dead air before the blast it fires next — the loudest move in the fight
   * arriving after its own build-up had already dissolved.
   *
   * Now it is a hit: the medallion recoils, is thrown through the camera, the
   * lockup is blown off the other way, and the wash takes the screen in the
   * hero's colour. play() resolves *on* that wash, while it is still up, so the
   * strike and the sweep the director fires next play underneath it — the board
   * is uncovered already exploding rather than waiting to be told to.
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

    // A cut, not a dissolve. The dim and the lines are simply there on the
    // first frame and the wash covers the two frames it takes the eye to catch
    // up: fading a black rectangle up over the fight was the softest moment in
    // the loudest beat of the creative.
    this.dim.alpha = DIM;
    this.lines.alpha = 1;
    this.haze.alpha = this.hazeRest;
    this.wash.alpha = 0.94;

    this.bust.x = homeX - w * 0.45;
    this.name.x = textHome + w * 0.5;
    this.skill.x = textHome + w * 0.7;
    this.plate.x = w;

    tween(this.wash, { alpha: 0 }, 0.2, { ease: Ease.quadOut });

    await Promise.all([
      tween(this.bust, { x: homeX }, 0.32, { ease: Ease.expoOut }),
      tween(this.glow, { alpha: 0.66 }, 0.3),
      tween(this.plate, { x: 0 }, 0.28, { ease: Ease.expoOut }),
      tween(this.name, { x: textHome }, 0.34, { ease: Ease.expoOut }),
      tween(this.skill, { x: textHome }, 0.4, { ease: Ease.expoOut }),
    ]);
    if (this.playId !== token) return;

    // The hold is not a freeze: the lines drift and the medallion creeps in, so
    // the punch below starts from something that was already moving.
    tween(this.lines, { x: -w * 0.12 }, 0.55, { ease: Ease.quadOut });
    tween(this.bust.scale, { x: bs.x * 1.05, y: bs.y * 1.05 }, 0.4, {
      ease: Ease.quadOut,
    });
    await delay(0.34);
    if (this.playId !== token) return;

    // Two frames back. The recoil is what sells the throw forward.
    await Promise.all([
      tween(this.bust.scale, { x: bs.x * 0.98, y: bs.y * 0.98 }, 0.09, {
        ease: Ease.quadOut,
      }),
      tween(this.bust, { x: homeX - w * 0.02 }, 0.09, {
        ease: Ease.quadOut,
      }),
    ]);
    if (this.playId !== token) return;

    // The punch. Everything leaves on the same beat and in opposite directions,
    // accelerating rather than easing out, so it reads as one hit instead of
    // four elements politely excusing themselves.
    tween(this.bust.scale, { x: bs.x * 1.5, y: bs.y * 1.5 }, 0.26, {
      ease: Ease.quadIn,
    });
    tween(this.bust, { x: homeX + w * 0.06 }, 0.26, { ease: Ease.quadIn });
    tween(this.bust, { alpha: 0 }, 0.16, { delay: 0.1 });
    tween(this.glow.scale, { x: gs.x * 1.8, y: gs.y * 1.8 }, 0.24, {
      ease: Ease.quadIn,
    });
    tween(this.glow, { alpha: 0 }, 0.22, { delay: 0.06 });
    tween(this.lines, { x: -w * 0.75 }, 0.26, { ease: Ease.quadIn });
    tween(this.lines, { alpha: 0 }, 0.2, { delay: 0.06 });
    tween(this.haze, { alpha: 0 }, 0.22, { delay: 0.04 });
    tween(this.plate, { x: w }, 0.2, { ease: Ease.backIn });
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
    this.lines.alpha = 0;
    this.bust.alpha = 0;
    this.glow.alpha = 0;
    this.plate.alpha = 0;
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
