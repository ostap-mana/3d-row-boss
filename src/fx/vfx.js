/**
 * Impact layer: beams, bursts, shockwaves and the screen flash.
 * Everything here is additive sprites — no filters, which keeps the
 * Pixi tree-shake small and old GPUs happy.
 */

import { Container, Graphics, Sprite } from "pixi.js";
import { beamTexture, glowTexture, sparkTexture } from "../art/textures.js";
import { tween, tweenValue, delay, Ease } from "../core/tween.js";
import { rndRange } from "../core/rng.js";
import {
  FIRE_ASPECT,
  FIRE_LEAD,
  FIRE_TRAVEL_LAST,
  fireFrames,
} from "../art/fire.js";
import {
  BOSS_SPELLS,
  SPELL_ASPECT,
  SPELL_BY_ELEMENT,
  SPELL_TRAVEL_LAST,
  spellFrames,
} from "../art/spells.js";
import { FIRE } from "../config.js";

/** Live sprites allowed in the effects field at once. */
const MAX_PARTICLES = 180;

/**
 * One layer of a flame cone, pointing along +x from the origin.
 * Drawn at full length and stretched in from zero by the caller, so the
 * flame reads as something shot out rather than something switched on.
 */
function paintCone(g, len, mouth, spread, color) {
  g.moveTo(0, -mouth / 2);
  g.quadraticCurveTo(len * 0.5, -spread * 0.34, len, -spread / 2);
  g.quadraticCurveTo(len * 1.1, 0, len, spread / 2);
  g.quadraticCurveTo(len * 0.5, spread * 0.34, 0, mouth / 2);
  g.closePath();
  g.fill({ color });
}

export class Vfx extends Container {
  constructor() {
    super();
    this.layout = null;

    this.field = new Container();
    this.addChild(this.field);

    this.flashRect = new Graphics();
    this.flashRect.alpha = 0;
    this.addChild(this.flashRect);
  }

  resize(layout) {
    this.layout = layout;
    this.flashRect.clear();
    this.flashRect.rect(0, 0, layout.w, layout.h);
    this.flashRect.fill({ color: 0xffffff });
  }

  /** Small spray of sparks, used on every gem pop. */
  burst(x, y, color, count, power) {
    // Hard ceiling on live particles. A five-step cascade plus beams can ask
    // for hundreds at once, and on a weak GPU that is where frames go to die.
    const room = MAX_PARTICLES - this.field.children.length;
    if (room <= 0) return;
    const n = Math.min(count || 6, room);
    const p = power || 1;
    for (let i = 0; i < n; i++) {
      const s = new Sprite(sparkTexture());
      s.anchor.set(0.5);
      s.blendMode = "add";
      s.tint = color;
      const size = rndRange(10, 26) * p;
      s.setSize(size, size);
      s.x = x;
      s.y = y;
      this.field.addChild(s);

      const ang = rndRange(0, Math.PI * 2);
      const dist = rndRange(20, 70) * p;
      tween(
        s,
        { x: x + Math.cos(ang) * dist, y: y + Math.sin(ang) * dist },
        0.42,
        { ease: Ease.quadOut },
      );
      tween(s.scale, { x: 0, y: 0 }, 0.42, { ease: Ease.quadIn }).then(() =>
        s.destroy(),
      );
    }
  }

  /** Expanding ring — the punctuation mark on every hit. */
  ring(x, y, color, size, width) {
    const g = new Graphics();
    g.circle(0, 0, 50);
    g.stroke({ width: width || 8, color, alpha: 1 });
    g.x = x;
    g.y = y;
    g.blendMode = "add";
    const target = (size || 200) / 100;
    g.scale.set(0.2);
    this.field.addChild(g);
    tween(g.scale, { x: target, y: target }, 0.45, { ease: Ease.quadOut });
    tween(g, { alpha: 0 }, 0.45).then(() => g.destroy());
  }

  /**
   * Elemental beam from the board to the boss.
   * @returns {Promise<void>} resolves on impact, so damage can land in sync
   */
  async beam(from, to, color, opts) {
    const o = opts || {};
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const thickness = o.thickness || 26;

    const outer = new Sprite(beamTexture());
    outer.anchor.set(0, 0.5);
    outer.blendMode = "add";
    outer.tint = color;
    outer.x = from.x;
    outer.y = from.y;
    outer.rotation = Math.atan2(dy, dx);
    outer.setSize(1, thickness);
    this.field.addChild(outer);

    const core = new Sprite(beamTexture());
    core.anchor.set(0, 0.5);
    core.blendMode = "add";
    core.tint = 0xffffff;
    core.x = from.x;
    core.y = from.y;
    core.rotation = outer.rotation;
    core.setSize(1, thickness * 0.35);
    this.field.addChild(core);

    const muzzle = new Sprite(glowTexture());
    muzzle.anchor.set(0.5);
    muzzle.blendMode = "add";
    muzzle.tint = color;
    muzzle.x = from.x;
    muzzle.y = from.y;
    muzzle.setSize(thickness * 4, thickness * 4);
    this.field.addChild(muzzle);

    const travel = o.travel || 0.16;
    await Promise.all([
      tween(outer, { width: dist }, travel, { ease: Ease.quadIn }),
      tween(core, { width: dist }, travel, { ease: Ease.quadIn }),
      tween(muzzle.scale, { x: 0, y: 0 }, travel + 0.1),
    ]);

    this.impact(to, color, o.impact || 1);

    tween(outer, { alpha: 0 }, 0.22, { delay: 0.05 }).then(() =>
      outer.destroy(),
    );
    tween(core, { alpha: 0 }, 0.18, { delay: 0.05 }).then(() => core.destroy());
    muzzle.destroy();
  }

  /**
   * The painted fireball: Ricklow's ultimate, and the only one in the fight
   * that is a drawing rather than a stack of tinted glows.
   *
   * Ten frames off art/fire.js — five of the comet coming in, five of it
   * landing — and they are played on one sprite rather than assembled out of
   * cones and rings the way every other effect in this file is, because they
   * were painted as one gesture and cutting them apart would only be a way of
   * throwing the drawing away.
   *
   * Resolves the instant it lands, not when it burns out. The director bills
   * the boss, shakes the screen and prints the damage on that frame, and the
   * blast is left running behind all of it — which is why the last five frames
   * are fired and forgotten below rather than awaited.
   *
   * Falls back to `beam` if the sheet never decoded, and keeps the same shape
   * of promise either way so the caller cannot tell the difference.
   */
  async fireball(from, to, color, opts) {
    const frames = fireFrames();
    const o = opts || {};
    if (!frames) return this.beam(from, to, color, { ...o, ...(o.beam || {}) });

    return this.paintedBolt(
      {
        frames,
        aspect: FIRE_ASPECT,
        lead: FIRE_LEAD,
        travelLast: FIRE_TRAVEL_LAST,
      },
      from,
      to,
      color,
      o,
    );
  }

  /**
   * Any mage's ultimate, painted, with one call for all six.
   *
   * Ricklow goes to `fireball` — his is the sheet that was cut off a still, on
   * its own grid, and it stays on its own path. The other five are looked up in
   * `art/spells.js` by element, and an element whose sheet has not been packed
   * yet falls back to `beam`, which is the one every one of them threw before
   * any of this existed.
   *
   * `opts.beam` is what that fallback is given, so the caller can keep the beam
   * tuned the way it always was without knowing whether art exists today.
   */
  async spell(element, from, to, color, opts) {
    const o = opts || {};
    if (element === FIRE) return this.fireball(from, to, color, o);

    const frames = spellFrames(SPELL_BY_ELEMENT[element]);
    if (!frames) return this.beam(from, to, color, { ...o, ...(o.beam || {}) });

    return this.paintedBolt(
      {
        frames,
        aspect: SPELL_ASPECT,
        // No painted heading to correct for: these are cut off clips of an
        // effect gathering in the middle of frame, not of a comet flying in one
        // direction, so turning them would only tip the drawing over.
        lead: null,
        travelLast: SPELL_TRAVEL_LAST,
      },
      from,
      to,
      color,
      o,
    );
  }

  /**
   * A boss swing, painted, played where it lands and left to burn out.
   *
   * Unlike a mage sheet this one has no flight half — nothing throws it — so all
   * ten frames are played straight through in place.
   *
   * It goes on **over** the procedural effect the swing already had, not instead
   * of it. Those effects are sized off the layout: the breath cone has to reach
   * the hero row, the shock ring has to cross the screen, the claw marks have to
   * land along the side the body actually swung to. A painted square dropped in
   * their place would be prettier and would stop the attack reading. Additive
   * light composites, so the sheet is detail laid into a shape that already
   * works.
   *
   * @returns {boolean} whether a sheet was there to play
   */
  bossSwing(kind, at, opts) {
    const frames = spellFrames(BOSS_SPELLS[kind]);
    if (!frames) return false;

    const o = opts || {};
    const size = o.size || 420;
    const base = o.alpha === undefined ? 1 : o.alpha;
    const grow = o.grow === undefined ? 0.25 : o.grow;

    const s = new Sprite(frames[0]);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.x = at.x;
    s.y = at.y;
    s.rotation = o.rotation || 0;
    s.alpha = base;
    this.field.addChild(s);

    tweenValue(0, 1, o.duration || 0.5, (p) => {
      s.texture = frames[Math.min(frames.length - 1, (p * frames.length) | 0)];
      const w = size * (1 + p * grow);
      s.setSize(w, w / SPELL_ASPECT);
      // Only the tail fades, for the same reason the fireball's does: a swing
      // that starts dying on the frame it lands never reads as having landed.
      s.alpha = base * (p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3);
    }).then(() => s.destroy());

    return true;
  }

  /**
   * The player behind every painted attack that travels.
   *
   * Split out of `fireball` when the other five ultimates got sheets of their
   * own: the two differ only in which grid they walk and whether the drawing has
   * a heading to correct for, and that is not enough to justify two copies of
   * the clock, the lead glow and the blast.
   */
  async paintedBolt(art, from, to, color, o) {
    const { frames, aspect, lead: leadAngle, travelLast } = art;
    const size = o.size || 420;
    const travel = o.travel || 0.26;
    const angle = Math.atan2(to.y - from.y, to.x - from.x);

    const s = new Sprite(frames[0]);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.x = from.x;
    s.y = from.y;
    // Turned so the painted comet's own heading becomes the one it is flying.
    s.rotation = leadAngle === null ? 0 : angle - leadAngle;
    this.field.addChild(s);

    // The head of the comet leads its own light, so the glow is not a halo on
    // the sprite: it is the thing the arena is lit by while the ball crosses it.
    const lead = new Sprite(glowTexture());
    lead.anchor.set(0.5);
    lead.blendMode = "add";
    lead.tint = color;
    lead.alpha = 0.5;
    lead.setSize(size * 0.7, size * 0.7);
    this.field.addChild(lead);

    const show = (i, w) => {
      s.texture = frames[i];
      s.setSize(w, w / aspect);
    };

    // Frames rather than a tween on scale: the swell is painted into the sheet,
    // and `tweenValue` is only the clock that walks it.
    await tweenValue(0, 1, travel, (p) => {
      s.x = from.x + (to.x - from.x) * p;
      s.y = from.y + (to.y - from.y) * p;
      lead.x = s.x;
      lead.y = s.y;
      show(
        Math.min(travelLast, Math.floor(p * (travelLast + 1))),
        size * (0.42 + p * 0.28),
      );
    });

    tween(lead, { alpha: 0 }, 0.22).then(() => lead.destroy());

    // The blast stands upright and stays where it landed: the last five frames
    // are drawn as fire going up off a floor, and carrying the comet's rotation
    // into them would tip that floor on its side.
    s.rotation = 0;
    s.x = to.x;
    s.y = to.y;
    const blast = o.blast || 0.52;
    tweenValue(0, 1, blast, (p) => {
      const i = travelLast + 1;
      const n = frames.length - i;
      show(i + Math.min(n - 1, Math.floor(p * n)), size * (1 + p * 0.35));
      // Only the tail fades: an explosion that starts dying on the frame it
      // arrives never reads as having arrived at all.
      s.alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    }).then(() => s.destroy());
  }

  /** Flash + ring + sparks where a beam lands. */
  impact(at, color, power) {
    const p = power || 1;
    const flash = new Sprite(glowTexture());
    flash.anchor.set(0.5);
    flash.blendMode = "add";
    flash.tint = 0xffffff;
    flash.x = at.x;
    flash.y = at.y;
    const size = 160 * p;
    flash.setSize(size, size);
    this.field.addChild(flash);
    tween(flash.scale, { x: flash.scale.x * 2.2, y: flash.scale.y * 2.2 }, 0.3);
    tween(flash, { alpha: 0 }, 0.3).then(() => flash.destroy());

    this.ring(at.x, at.y, color, 260 * p, 10 * p);
    this.burst(at.x, at.y, color, Math.round(10 * p), 1.4 * p);
  }

  /** Full-screen colour wash. */
  async flash(color, alpha, dur) {
    this.flashRect.tint = color === undefined ? 0xffffff : color;
    this.flashRect.alpha = alpha === undefined ? 0.9 : alpha;
    await tween(this.flashRect, { alpha: 0 }, dur || 0.5, {
      ease: Ease.quadOut,
    });
  }

  /**
   * Arcing glob of lava, boss mouth to board cell.
   * Resolves on landing so the obsidian can form on impact.
   */
  async lob(from, to, color, opts) {
    const o = opts || {};
    const dur = o.duration || 0.5;

    const glob = new Sprite(glowTexture());
    glob.anchor.set(0.5);
    glob.blendMode = "add";
    glob.tint = color;
    const size = o.size || 54;
    glob.setSize(size, size);
    glob.x = from.x;
    glob.y = from.y;
    this.field.addChild(glob);

    const core = new Graphics();
    core.circle(0, 0, size * 0.22);
    core.fill({ color: 0xfff0c0 });
    core.x = from.x;
    core.y = from.y;
    this.field.addChild(core);

    // Height of the arc, well above both endpoints so it reads as thrown.
    const peak = Math.min(from.y, to.y) - (o.arc || 140);

    await tweenValue(
      0,
      1,
      dur,
      (t) => {
        const x = from.x + (to.x - from.x) * t;
        // Quadratic Bezier through the peak.
        const inv = 1 - t;
        const y = inv * inv * from.y + 2 * inv * t * peak + t * t * to.y;
        glob.x = x;
        glob.y = y;
        core.x = x;
        core.y = y;
        core.rotation += 0.4;
      },
      { delay: o.delay || 0, ease: Ease.linear },
    );

    this.burst(to.x, to.y, color, 9, 1.3);
    this.ring(to.x, to.y, color, 130, 6);
    glob.destroy();
    core.destroy();
  }

  /**
   * Sustained cone of flame — the boss breathing over the hero row.
   * Resolves once the fire has died down, so the director can hold the beat.
   */
  async cone(from, to, color, opts) {
    const o = opts || {};
    const hold = o.hold === undefined ? 0.5 : o.hold;
    const spread = o.spread || 180;
    const mouth = o.mouth || 34;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.max(1, Math.sqrt(dx * dx + dy * dy));

    const flame = new Container();
    flame.x = from.x;
    flame.y = from.y;
    flame.rotation = Math.atan2(dy, dx);
    this.field.addChild(flame);

    // Three nested cones instead of a gradient: the same trick the gems use,
    // and it costs nothing on a phone GPU.
    //
    // The alphas are low on purpose. This fire crosses the whole board on its
    // way to the hero row, and anything brighter turns the gems into a white
    // smear for half a second — the player has to still be able to read the
    // board they are about to play on.
    const spec = [
      [len, mouth, spread, color, 0.26],
      [len * 0.9, mouth * 0.62, spread * 0.6, 0xffb03d, 0.18],
      [len * 0.58, mouth * 0.3, spread * 0.32, 0xfff2c0, 0.32],
    ];
    const layers = spec.map((s) => {
      const g = new Graphics();
      paintCone(g, s[0], s[1], s[2], s[3]);
      g.blendMode = "add";
      g.alpha = s[4];
      flame.addChild(g);
      return g;
    });

    // Shoot out along its own axis; the width comes in a touch behind.
    flame.scale.set(0.05, 0.5);
    await Promise.all([
      tween(flame.scale, { x: 1 }, 0.15, { ease: Ease.quadOut }),
      tween(flame.scale, { y: 1 }, 0.2, { ease: Ease.backOut }),
    ]);

    // Embers keep falling on the target for as long as the flame is held.
    const embers = (async () => {
      const steps = Math.max(1, Math.round(hold / 0.09));
      for (let i = 0; i < steps; i++) {
        if (flame.destroyed) return;
        this.burst(
          to.x + rndRange(-spread * 0.45, spread * 0.45),
          to.y + rndRange(-spread * 0.16, spread * 0.16),
          i % 2 ? 0xffb03d : color,
          3,
          1.15,
        );
        await delay(0.09);
      }
    })();

    // Flicker: a flame that holds a steady alpha reads as a plastic triangle.
    await tweenValue(
      0,
      hold,
      hold,
      (t) => {
        layers[0].alpha = spec[0][4] * (0.84 + Math.sin(t * 47) * 0.16);
        layers[1].alpha = spec[1][4] * (0.8 + Math.sin(t * 61 + 1.3) * 0.2);
        layers[2].alpha = spec[2][4] * (0.78 + Math.sin(t * 73 + 2.6) * 0.22);
        flame.scale.y = 1 + Math.sin(t * 31) * 0.07;
      },
      { ease: Ease.linear },
    );

    await Promise.all([
      tween(flame, { alpha: 0 }, 0.22),
      tween(flame.scale, { x: 0.7, y: 0.6 }, 0.22, { ease: Ease.quadIn }),
      embers,
    ]);
    flame.destroy({ children: true });
  }

  /**
   * Flattened ring hugging the floor — the fists landing.
   * Perspective ring rather than the round one `ring()` draws, so it reads as
   * something spreading across the ground instead of out of the screen.
   */
  shock(x, y, color, opts) {
    const o = opts || {};
    const g = new Graphics();
    g.circle(0, 0, 50);
    g.stroke({ width: o.width || 12, color, alpha: 1 });
    g.x = x;
    g.y = y;
    g.blendMode = "add";
    g.scale.set(0.15, 0.05);
    this.field.addChild(g);

    const target = (o.size || 420) / 100;
    const dur = o.duration || 0.5;
    tween(g.scale, { x: target, y: target * (o.flat || 0.3) }, dur, {
      ease: Ease.quadOut,
    });
    tween(g, { alpha: 0 }, dur).then(() => g.destroy());
  }

  /**
   * Three claws opening the air where the boss just swung.
   *
   * Drawn rather than painted, for the reason everything in this file is: it is
   * zero kilobytes, it is sharp on any screen, and — the part that matters here
   * — it can be aimed. The rake picks a side at random every time it plays, and
   * marks baked into a sprite would have to be mirrored, which puts the light
   * on the wrong side of the gash half the time.
   *
   * Each gash is a tapered lens, widest a third of the way along and nothing at
   * either end, because that is the shape a claw leaves and a rounded rectangle
   * is not. They open one after another rather than together: three lines that
   * arrive on the same frame read as a graphic laid over the screen, and three
   * that arrive forty milliseconds apart read as one hand going through.
   */
  claw(x, y, color, opts) {
    const o = opts || {};
    const dir = (o.dir || 1) < 0 ? -1 : 1;
    const len = o.len || 460;
    const gap = o.gap || 62;

    const marks = new Container();
    marks.x = x;
    marks.y = y;
    // Down and across, mirrored onto whichever side the body travelled.
    marks.rotation = (o.angle === undefined ? 0.5 : o.angle) * dir;
    this.field.addChild(marks);

    // The heat behind the cut. Without it the gashes are three bright lines on
    // a dark screen; with it they are three lines torn in something.
    const heat = new Sprite(glowTexture());
    heat.anchor.set(0.5);
    heat.blendMode = "add";
    heat.tint = color;
    heat.alpha = 0;
    heat.setSize(len * 1.1, gap * 4);
    marks.addChild(heat);
    tween(heat, { alpha: 0.5 }, 0.08).then(() =>
      tween(heat, { alpha: 0 }, 0.34),
    );

    // Sized off the gap rather than in pixels: `gap` is handed down from the
    // layout, and a gash measured in constants is a hairline on a tablet and a
    // bar on a small phone.
    const thick = gap * 0.42;
    const core = o.core || 0xffd9e2;

    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * gap;
      // The middle claw runs longest and cuts deepest — a hand is not a comb.
      const mid = i === 1;
      const l = len * (mid ? 1 : 0.84);
      const bow = l * 0.13;

      const gash = new Graphics();
      // Two passes, and the second is what makes this read as a cut rather
      // than as a stripe: a wide soft body in the attack's colour, and a thin
      // white-hot line down the middle of it. One pass at either width is a
      // ribbon; the pair is an edge with heat coming off it.
      for (const [k, tone] of [
        [1, color],
        [0.34, core],
      ]) {
        const wide = thick * (mid ? 1.5 : 1) * k;
        gash.moveTo(-l / 2, off);
        gash.quadraticCurveTo(0, off - bow - wide, l / 2, off);
        gash.quadraticCurveTo(0, off - bow + wide, -l / 2, off);
        gash.fill({ color: tone });
      }
      gash.blendMode = "add";
      gash.scale.x = 0.05;
      marks.addChild(gash);

      tween(gash.scale, { x: 1 }, 0.09, {
        delay: i * 0.04,
        ease: Ease.quadOut,
      });
      // Held before it goes. At 0.12 the third claw was fading before the
      // first had finished opening, and what the eye caught was a flicker.
      tween(gash, { alpha: 0 }, 0.42, { delay: 0.2 + i * 0.04 });
    }

    delay(0.75).then(() => marks.destroy({ children: true }));
  }

  /**
   * Band of force rolling down the screen, boss floor to hero row.
   * This is what connects a golem at the top of the screen to the cards at
   * the bottom — without it the heroes just lose health for no visible reason.
   */
  async wave(fromY, toY, color, opts) {
    if (!this.layout) return;
    const o = opts || {};

    const band = new Sprite(glowTexture());
    band.anchor.set(0.5);
    band.blendMode = "add";
    band.tint = color;
    band.setSize(this.layout.w * 1.4, o.thickness || 130);
    band.x = this.layout.w / 2;
    band.y = fromY;
    band.alpha = 0.95;
    this.field.addChild(band);

    await tween(band, { y: toY }, o.duration || 0.24, { ease: Ease.quadIn });
    tween(band, { alpha: 0 }, 0.2).then(() => band.destroy());
  }

  /** Sweeping wall of energy used by the ultimate. */
  async sweep(color) {
    if (!this.layout) return;
    const { w, h } = this.layout;
    const band = new Graphics();
    band.rect(0, 0, w * 0.22, h * 1.4);
    band.fill({ color });
    band.blendMode = "add";
    band.alpha = 0.85;
    band.x = -w * 0.3;
    band.y = -h * 0.2;
    band.skew.x = -0.24;
    this.field.addChild(band);
    await tween(band, { x: w * 1.15 }, 0.5, { ease: Ease.quadInOut });
    tween(band, { alpha: 0 }, 0.2).then(() => band.destroy());
  }
}
