/**
 * KOLTMOS — the one thing the player must remember from this creative.
 *
 * The golem is a painting: one render, `src/assets/boss/magmaroth.webp`, in
 * place of the obsidian rig this file used to assemble out of a few dozen
 * polygons and of the eleven-frame sheet that stood in for it before. The drawn
 * rig is still below and still runs the whole fight, for the same reason every
 * other painted surface here keeps its fallback — but it is the understudy, not
 * the act.
 *
 * A still cannot swing an arm or drop a jaw on cue, so the beats that used to be
 * carried by parts are carried by the silhouette and by light: the figure rears,
 * lifts, stretches and slams as one, and the fire the rig used to draw — eyes,
 * maw, molten core — is three additive glows pinned to the three places this
 * render already burns. The wind-up is a fourth, banking up over the beast's
 * jaw, driven by `charge`, a 0..1 the attacks tween like any other property, so
 * the tell the director asks for is the tell the art shows. Every public beat
 * (rise, roar, spit, lavaBreath, smash, hit, enrage, die) and every anchor the
 * director reads (impactPoint, mouthPoint, fistPoint) behaves the same from the
 * outside, whichever art is up.
 *
 * The render is trimmed, downscaled and registered by tools/pack-boss-still.mjs
 * — its stance, its reach and its three lights are all measured or resolved by
 * that tool, because none of them survive a crop and a scale.
 */

import { Container, Graphics, Sprite } from "pixi.js";
import { tween, delay, Ease, tweenValue } from "../core/tween.js";
import { canvasTexture, glowTexture } from "./textures.js";
import { getRenderer } from "../core/context.js";
import { lerpColor } from "../core/color.js";
import { BOSS_ART } from "../core/layout.js";
import * as sfx from "../audio/sfx.js";
import stillUrl from "../assets/boss/magmaroth.webp";

/** Colour the rig settles back to once phase 2 starts. */
const ENRAGED_TINT = 0xffa58c;
/** The same beat on the painting, which burns violet rather than lava-orange. */
const ENRAGED_PAINTED = 0xffa2cd;
const ROCK = 0x2a1b28;
const ROCK_DARK = 0x150d16;
const ROCK_EDGE = 0x4a2f3c;
const LAVA = 0xff6a10;
const LAVA_HOT = 0xffd35a;

/**
 * The painting's own fire, sampled off it.
 *
 * The render burns violet — the runes down the beast's back, the slit eyes, the
 * light in the open jaw — and lava orange added on top of that comes back a
 * muddy pink. The drawn rig below keeps the lava: it is a lava golem.
 */
const RUNE = 0xb43cff;
const RUNE_HOT = 0xff8ae8;

/**
 * The colour of the ground the beast stands on, multiplied under its feet.
 *
 * Blue-black rather than neutral: the deck it lands on is a cloud sea lit from
 * two sides, and a grey shadow on it reads as a smudge on the lens where a cold
 * one reads as the beast blocking the light coming up through the cloud.
 */
const SHADOW_TINT = 0x33304a;

/** How far the render is taken down, and toward what. See buildPainted. */
const ART_GRADE = 0xc6bdd8;

/**
 * The packed render, exactly as tools/pack-boss-still.mjs measured it.
 *
 * `anchor` is the beast's stance — the middle of its feet — and the sprite is
 * hung from that one point. `rise` and `span` are how far the figure reaches
 * above and across it, and are the only numbers the on-screen size comes from.
 */
const STILL = {
  cell: { w: 900, h: 999 },
  anchor: { x: 441, y: 983 },
  rise: 982,
  span: 897,
};

/**
 * Rig units per rendered pixel.
 *
 * Fitted both ways, where the sheet was fitted by height alone. This figure
 * happens to be taller than it is wide and so comes out height-bound anyway,
 * but the width term is what keeps the next piece of boss art from hanging off
 * the sides of a phone the day it is dropped in.
 */
const K = Math.min(BOSS_ART.h / STILL.rise, BOSS_ART.w / STILL.span);

/**
 * Where the golem's feet land in rig space.
 *
 * The drawn rig's own floor, kept to the unit: impactPoint, fistPoint, the rise
 * out of the lava and the mask that clips it there were all tuned against this
 * number, and layout.js has no boss of its own to know about.
 */
const FEET_Y = 189;

/** How tall the painted figure comes out, in rig units. */
const STILL_H = STILL.rise * K;

/**
 * The painted figure's own floor.
 *
 * The same as the drawn rig's whenever the fit came off the height, which is
 * the usual case. A render wide enough to be width-bound comes out shorter than
 * its box, and hanging that off the drawn rig's feet would stand it in the
 * bottom of the band with all the slack above its head; centring the two in one
 * box puts the mass where the layout expects a boss either way.
 */
const STILL_FEET = FEET_Y - (BOSS_ART.h - STILL_H) / 2;

/** Cell-space points the three lights sit on, resolved by the packing tool. */
const LIGHTS = {
  crown: { x: 429, y: 438 },
  maw: { x: 437, y: 510 },
  core: { x: 441, y: 605 },
};

/** Cell space -> rig space. */
const rigX = (cx) => (cx - STILL.anchor.x) * K;
const rigY = (cy) => STILL_FEET - (STILL.anchor.y - cy) * K;

/**
 * Resting y of the node every head beat drives.
 *
 * The drawn rig's head sits here. The painting's head sits a good deal lower —
 * it is a hunched thing with a rider on its shoulders, and what is up at this
 * height on that art is the rider — but this is a pivot, not a part: rocking
 * either figure about a point near the top of its silhouette is the same nod,
 * so every `HEAD_REST + n` below still reads as one.
 */
const HEAD_REST = -178;

/** The painted beast, or null while the render has not decoded. */
let painting = null;

/**
 * Decode the golem before the first frame.
 *
 * Never rejects: a boss that failed to decode falls back to the drawn rig, the
 * same bargain plates, busts and the CTA plate strike. The render is inlined in
 * the bundle, so this is a decode and not a download.
 */
export async function loadBossArt() {
  if (painting) return painting;
  try {
    const img = new Image();
    img.src = stillUrl;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").drawImage(img, 0, 0);
    painting = canvasTexture(c);
  } catch {
    painting = null;
  }
  return painting;
}

let shardTex = null;
function shardTexture() {
  if (shardTex) return shardTex;
  const g = new Graphics();
  g.poly([0, -18, 16, -4, 10, 16, -8, 14, -16, -6]);
  g.fill({ color: 0xffffff });
  shardTex = getRenderer().generateTexture({
    target: g,
    resolution: 2,
    antialias: true,
  });
  g.destroy();
  return shardTex;
}

export class Boss extends Container {
  constructor() {
    super();

    /**
     * Contact shadow, and the one thing a cut-out render cannot do for itself.
     *
     * The art arrives trimmed to its own ink, which means it has no ground
     * under it — hung over a painted cloud deck it does not stand on anything,
     * it is pasted onto something. A soft dark ellipse on the beast's own floor
     * line is what turns those two into each other, and over a backdrop this
     * bright it is also the darkest thing in contact with the silhouette, which
     * is half of why the figure reads at all. See background.js POOL_TINT for
     * the other half — the two were tuned in one pass and against each other.
     *
     * Bottom of the stack and outside `rig`, so the breath cycle does not
     * scale it: a shadow that swells with the chest is a shadow the eye reads
     * as a second creature underneath the first one.
     */
    this.shadow = new Sprite(glowTexture());
    this.shadow.anchor.set(0.5);
    this.shadow.blendMode = "multiply";
    this.shadow.tint = SHADOW_TINT;
    this.shadow.alpha = 0.58;
    this.shadow.setSize(BOSS_ART.w * 0.9, BOSS_ART.h * 0.19);
    this.addChild(this.shadow);

    this.aura = new Sprite(glowTexture());
    this.aura.anchor.set(0.5);
    this.aura.blendMode = "add";
    this.aura.tint = LAVA;
    this.aura.alpha = 0.5;
    this.aura.setSize(760, 620);
    this.addChild(this.aura);

    /** Everything that breathes together. */
    this.rig = new Container();
    this.addChild(this.rig);

    /** Whether the render decoded. False means the drawn rig is on stage. */
    this.painted = !!painting;
    /** How far into a wind-up the golem is, 0..1. */
    this.charge = 0;
    if (this.painted) this.buildPainted();
    else this.buildDrawn();

    // Only now: `feetY` is whichever rig came up, and the two do not agree.
    this.shadow.y = this.feetY - 8;

    this.shards = new Container();
    this.addChild(this.shards);

    this.t = 0;
    this.breath = 1;
    /** Arm swing offset, 0 = idle sway, positive = fists raised. */
    this.swing = 0;
    /** Forward dip of the whole rig, used by the melee slam. */
    this.lunge = 0;
    this.enraged = false;
    this.alive = true;
  }

  /* ---------------------------------------------------------- painted rig */

  buildPainted() {
    // Violet, because the art is: an orange aura around a magenta beast reads
    // as a colour mistake rather than as heat.
    this.aura.tint = RUNE;
    // The aura sits behind the figure rather than behind the origin: the mass
    // stands well above its own feet, and a glow centred on the rig's origin
    // would pool around its knees.
    this.aura.y = rigY(STILL.anchor.y - STILL.rise * 0.55);
    this.aura.setSize(STILL.span * K * 1.55, STILL_H * 1.5);

    /**
     * The node every head beat moves. A painting has no neck, so a nod rocks
     * the whole figure about a point near the top of it — which is how
     * something this heavy would move anyway. Everything else hangs off it, so
     * the lights ride the rock instead of sliding around on it.
     */
    const figure = new Container();
    figure.y = HEAD_REST;
    this.rig.addChild(figure);
    this.headNode = figure;

    this.art = this.artSprite();
    /**
     * The render, graded down.
     *
     * The art is lit as a hero card is lit: a cream-white belly and gold plate
     * catching a key light from the front, which is the brightest thing on the
     * screen and reads as a character somebody plays rather than one they
     * fight. Taking it down and cooling it does two jobs at once — the mass
     * goes dark, and the violet fire in the eyes and the jaw, which is additive
     * and so untouched by this, comes forward as the only light the beast has.
     *
     * On `art` and not on the Boss container: `tint` there is spoken for by
     * hit() and enrage(), both of which lerp from plain white and would wipe
     * this out on the first hero swing.
     */
    this.art.tint = ART_GRADE;
    figure.addChild(this.art);

    /**
     * Hit flash: the beast drawn over itself with the `add` blend.
     *
     * The drawn rig flashed by tint, which can only ever take a colour down —
     * on art this dark it barely reads. Adding the render to itself lights the
     * fire it is already full of and leaves the scales where they are, so a hit
     * looks like heat rather than like a lamp.
     */
    this.flash = this.artSprite();
    this.flash.blendMode = "add";
    this.flash.alpha = 0;
    figure.addChild(this.flash);

    // Crown: the slit eyes in the beast's head. Stands in for the drawn eyes,
    // and flickers on the same clock.
    this.eyes = new Container();
    this.eyes.x = rigX(LIGHTS.crown.x);
    this.eyes.y = rigY(LIGHTS.crown.y) - HEAD_REST;
    this.eyes.addChild(this.light(RUNE_HOT, 190, 120, 0.34));
    figure.addChild(this.eyes);

    // Maw: what the roar, the spit and the lava breath open up. On this art
    // that is the jaw right under the eyes, which the render already has hanging
    // open — so it is the one part that needs no persuading.
    this.mouth = new Container();
    this.mouth.x = rigX(LIGHTS.maw.x);
    this.mouth.y = rigY(LIGHTS.maw.y) - HEAD_REST;
    this.mouth.addChild(this.light(RUNE, 170, 130, 0.36));
    figure.addChild(this.mouth);

    // Molten core: the aim point every beam is thrown at, and the one part of
    // the figure that pulses whether or not it is attacking. On this beast it
    // is the chest under the collar, which is also simply where the mass is.
    this.core = new Container();
    this.core.x = rigX(LIGHTS.core.x);
    this.core.y = rigY(LIGHTS.core.y) - HEAD_REST;
    this.coreGlow = this.light(RUNE, 260, 230, 1);
    this.core.addChild(this.coreGlow);
    figure.addChild(this.core);

    /**
     * The wind-up, in place of the six fire frames the sheet used to spend on
     * it. A still cannot gather anything, so `charge` banks this up over the
     * jaw instead: dark at rest, which is what keeps a tell a tell.
     */
    this.gather = new Container();
    this.gather.x = this.mouth.x;
    this.gather.y = this.mouth.y;
    this.gatherGlow = this.light(RUNE_HOT, 300, 260, 0);
    this.gather.addChild(this.gatherGlow);
    figure.addChild(this.gather);

    /** Where impactPoint sends the beams. */
    this.coreY = rigY(LIGHTS.core.y);
    /** Where fistPoint drops the shockwave. */
    this.feetY = STILL_FEET;
    this.enragedTint = ENRAGED_PAINTED;

    /**
     * The render carries its own light, so the glows are a fraction of what
     * they were over the drawn rig. Any more and the beast turns into a violet
     * smear the moment it charges.
     */
    this.glowGain = 0.5;
  }

  /** The render, hung on the beast's feet. */
  artSprite() {
    const s = new Sprite(painting);
    s.anchor.set(STILL.anchor.x / STILL.cell.w, STILL.anchor.y / STILL.cell.h);
    s.setSize(STILL.cell.w * K, STILL.cell.h * K);
    s.y = STILL_FEET - HEAD_REST;
    return s;
  }

  /** A tinted additive glow, sized in rig units. */
  light(tint, w, h, alpha) {
    const g = new Sprite(glowTexture());
    g.anchor.set(0.5);
    g.blendMode = "add";
    g.tint = tint;
    g.alpha = alpha;
    g.setSize(w, h);
    return g;
  }

  /* ----------------------------------------------------------- drawn rig */

  buildDrawn() {
    this.armL = this.buildArm(-1);
    this.armR = this.buildArm(1);
    this.rig.addChild(this.armL, this.armR);

    this.body = new Graphics();
    this.drawBody(this.body);
    this.rig.addChild(this.body);

    this.veins = new Graphics();
    this.drawVeins(this.veins);
    this.rig.addChild(this.veins);

    // Molten core: gives the chest a bright focal point and tells the player
    // exactly where every beam is supposed to land.
    this.core = new Container();
    this.core.y = 6;
    this.coreGlow = new Sprite(glowTexture());
    this.coreGlow.anchor.set(0.5);
    this.coreGlow.blendMode = "add";
    this.coreGlow.tint = LAVA_HOT;
    this.coreGlow.setSize(300, 300);
    this.core.addChild(this.coreGlow);

    const coreShape = new Graphics();
    coreShape.poly([0, -54, 46, -20, 34, 40, 0, 62, -34, 40, -46, -20]);
    coreShape.fill({ color: LAVA });
    coreShape.poly([0, -34, 28, -12, 20, 26, 0, 40, -20, 26, -28, -12]);
    coreShape.fill({ color: LAVA_HOT });
    coreShape.poly([0, -18, 14, -6, 10, 14, 0, 22, -10, 14, -14, -6]);
    coreShape.fill({ color: 0xfff4d0 });
    this.core.addChild(coreShape);
    this.rig.addChild(this.core);

    this.headNode = this.buildHead();
    this.headNode.y = HEAD_REST;
    this.rig.addChild(this.headNode);

    this.coreY = 6;
    this.feetY = FEET_Y;
    this.enragedTint = ENRAGED_TINT;
    this.glowGain = 1;
  }

  drawBody(g) {
    g.clear();

    // Shoulder mass
    g.poly([
      -152, -74, -190, 6, -168, 104, -110, 176, 110, 176, 168, 104, 190, 6, 152,
      -74, 66, -118, -66, -118,
    ]);
    g.fill({ color: ROCK });
    g.stroke({ width: 7, color: ROCK_DARK, alpha: 1 });

    // Chest plate — the aim point for every attack
    g.poly([-96, -56, 96, -56, 118, 44, 0, 116, -118, 44]);
    g.fill({ color: 0x37232f });

    // Rock facets
    g.poly([-152, -74, -66, -118, -40, -40, -118, 0]);
    g.fill({ color: ROCK_EDGE, alpha: 0.35 });
    g.poly([152, -74, 66, -118, 40, -40, 118, 0]);
    g.fill({ color: ROCK_EDGE, alpha: 0.22 });
    g.poly([-110, 176, -168, 104, -60, 96, -30, 168]);
    g.fill({ color: 0x000000, alpha: 0.25 });
    g.poly([110, 176, 168, 104, 60, 96, 30, 168]);
    g.fill({ color: 0x000000, alpha: 0.25 });

    // Spikes across the shoulders
    for (let i = -1; i <= 1; i += 2) {
      g.poly([i * 96, -104, i * 150, -172, i * 138, -84]);
      g.fill({ color: 0x3b2533 });
      g.stroke({ width: 5, color: ROCK_DARK });
    }

    // Rim light along the upper silhouette. Without it the golem sinks into
    // the cavern behind it on an OLED phone.
    g.moveTo(-190, 6);
    g.lineTo(-152, -74);
    g.lineTo(-66, -118);
    g.lineTo(66, -118);
    g.lineTo(152, -74);
    g.lineTo(190, 6);
    g.stroke({ width: 7, color: 0xffb27a, alpha: 0.38 });
  }

  drawVeins(g) {
    g.clear();
    // Cracks radiate out of the chest core rather than floating loose on the
    // torso — it reads as one creature instead of a pile of orange marks.
    const lines = [
      [-30, -10, -74, -44, -96, -84],
      [30, -10, 74, -44, 96, -84],
      [-34, 22, -86, 44, -128, 34],
      [34, 22, 86, 44, 128, 34],
      [-18, 48, -44, 104, -34, 156],
      [18, 48, 44, 104, 34, 156],
      [0, 56, 4, 112, -8, 162],
    ];
    lines.forEach((pts) => {
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.stroke({ width: 13, color: LAVA, alpha: 0.8 });
      g.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
      g.stroke({ width: 5, color: LAVA_HOT, alpha: 0.95 });
    });
  }

  buildArm(dir) {
    const arm = new Container();
    const g = new Graphics();

    g.poly([
      dir * 130,
      -70,
      dir * 216,
      -26,
      dir * 250,
      78,
      dir * 196,
      122,
      dir * 150,
      36,
      dir * 120,
      -20,
    ]);
    g.fill({ color: 0x241725 });
    g.stroke({ width: 7, color: ROCK_DARK });

    // Fist
    g.circle(dir * 226, 122, 64);
    g.fill({ color: ROCK });
    g.stroke({ width: 7, color: ROCK_DARK });
    g.circle(dir * 226, 122, 34);
    g.fill({ color: 0x3b2533, alpha: 0.8 });

    // Knuckle heat: a single diagonal crack. Symmetrical marks here read as a
    // second face, which fights the head for attention.
    g.moveTo(dir * 196, 148);
    g.lineTo(dir * 232, 108);
    g.lineTo(dir * 258, 96);
    g.stroke({ width: 8, color: LAVA, alpha: 0.8 });

    arm.addChild(g);
    arm.pivot.set(dir * 130, -70);
    arm.position.set(dir * 130, -70);
    return arm;
  }

  buildHead() {
    const head = new Container();

    const horns = new Graphics();
    for (let i = -1; i <= 1; i += 2) {
      horns.poly([i * 62, -46, i * 128, -128, i * 150, -70, i * 96, -18]);
      horns.fill({ color: 0x4a2f3c });
      horns.stroke({ width: 6, color: ROCK_DARK });
    }
    head.addChild(horns);

    const skull = new Graphics();
    skull.poly([-82, -58, 82, -58, 100, 8, 62, 62, -62, 62, -100, 8]);
    skull.fill({ color: 0x32202d });
    skull.stroke({ width: 7, color: ROCK_DARK });
    // Brow ridge
    skull.poly([-88, -20, 88, -20, 62, 6, -62, 6]);
    skull.fill({ color: 0x1d1220 });
    head.addChild(skull);

    // Eyes
    this.eyes = new Container();
    for (let i = -1; i <= 1; i += 2) {
      const glow = new Sprite(glowTexture());
      glow.anchor.set(0.5);
      glow.blendMode = "add";
      glow.tint = LAVA_HOT;
      glow.setSize(120, 90);
      glow.x = i * 40;
      glow.y = -8;
      this.eyes.addChild(glow);

      const e = new Graphics();
      e.poly([i * 16, -14, i * 62, -4, i * 58, 12, i * 20, 4]);
      e.fill({ color: 0xfff2c0 });
      this.eyes.addChild(e);
    }
    head.addChild(this.eyes);

    this.mouth = new Container();
    this.mouth.y = 34;
    const mglow = new Sprite(glowTexture());
    mglow.anchor.set(0.5);
    mglow.blendMode = "add";
    mglow.tint = LAVA;
    mglow.setSize(190, 120);
    this.mouth.addChild(mglow);

    const jaw = new Graphics();
    jaw.poly([-58, -6, 58, -6, 44, 40, -44, 40]);
    jaw.fill({ color: 0x120a12 });
    // Teeth
    for (let i = 0; i < 5; i++) {
      const x = -48 + i * 24;
      jaw.poly([x, -6, x + 18, -6, x + 9, 16]);
      jaw.fill({ color: 0xf2e2c6 });
    }
    this.mouth.addChild(jaw);
    head.addChild(this.mouth);

    return head;
  }

  /* ------------------------------------------------------------ placement */

  resize(layout) {
    this.scale.set(layout.boss.scale);
    this.homeX = layout.boss.x;
    this.homeY = layout.boss.y;
    this.x = this.homeX;
    this.y = this.homeY;
    this.riseFrom = layout.boss.floor - layout.boss.y + 320 * layout.boss.scale;
  }

  /** The chest: where every hero beam is thrown, and where the core burns. */
  impactPoint() {
    return { x: this.x, y: this.y + this.coreY * this.scale.y };
  }

  /* ------------------------------------------------------------ animation */

  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    const rate = this.enraged ? 3.1 : 1.7;
    const amp = this.enraged ? 0.05 : 0.03;
    const s = Math.sin(this.t * rate);

    this.rig.scale.y = this.breath * (1 + s * amp);
    this.rig.scale.x = this.breath * (1 - s * amp * 0.5);
    this.rig.y = -s * 8 + this.lunge;

    if (this.painted) {
      // No arms of its own to raise, so the swing beat comes out of the whole
      // silhouette: the golem rises and stretches to wind up, and rides the
      // same curve back down into the floor.
      this.rig.y -= this.swing * 24;
      this.rig.scale.y *= 1 + this.swing * 0.05;
      // Rocking a 460-unit figure about a point near its crown swings the feet,
      // so the sway is a fraction of the drawn head's — same read, no wobble.
      this.headNode.rotation = Math.sin(this.t * 0.9) * 0.012;
      // The wind-up the sheet used to spend six frames on. Squared, so the
      // first half of a charge stays dark and the tell lands late and hard —
      // and clamped, because the recoveries below overshoot on purpose.
      const c = Math.max(0, Math.min(1, this.charge));
      this.gatherGlow.alpha = c * c * 0.9;
      this.gather.scale.set(0.5 + c * 0.7);
    } else {
      this.headNode.rotation = Math.sin(this.t * 0.9) * 0.03;
      // The idle sway fades out as the arms are driven by an attack, so a
      // raised fist does not keep bobbing as if nothing were happening.
      const sway = 1 - Math.min(1, Math.abs(this.swing) * 3);
      this.armL.rotation = this.swing + Math.sin(this.t * 1.1) * 0.05 * sway;
      this.armR.rotation =
        -this.swing - Math.sin(this.t * 1.1 + 0.6) * 0.05 * sway;
      this.veins.alpha = this.enraged
        ? 0.95 + Math.sin(this.t * 6) * 0.05
        : 0.75 + Math.sin(this.t * 3) * 0.12;
    }

    const flicker = 0.82 + Math.sin(this.t * 9.3) * 0.08;
    this.eyes.alpha = flicker;
    this.aura.alpha =
      ((this.enraged ? 0.75 : 0.45) + Math.sin(this.t * 2.2) * 0.12) *
      this.glowGain;

    const pulse = Math.sin(this.t * (this.enraged ? 7 : 3.6));
    const coreBase = this.enraged ? 1.22 : 1;
    this.core.scale.set(coreBase * (1 + pulse * 0.05));
    this.coreGlow.alpha =
      ((this.enraged ? 0.85 : 0.6) + pulse * 0.2) * this.glowGain;
  }

  async rise() {
    this.y = this.homeY + this.riseFrom;
    this.alpha = 1;
    sfx.bossRise();
    await tween(this, { y: this.homeY }, 0.95, { ease: Ease.cubicOut });
  }

  async roar() {
    sfx.bossRoar();
    await Promise.all([
      tween(this.mouth.scale, { y: 2.1 }, 0.16, { ease: Ease.backOut }),
      // Barely off the floor: a roar is the jaw opening up, not the throw that
      // comes after it.
      tween(this, { breath: 1.1, charge: 0.3 }, 0.16),
      tween(this.headNode, { y: HEAD_REST - 18 }, 0.16),
    ]);
    await delay(0.34);
    await Promise.all([
      tween(this.mouth.scale, { y: 1 }, 0.3, { ease: Ease.quadOut }),
      tween(this, { breath: 1, charge: 0 }, 0.3),
      tween(this.headNode, { y: HEAD_REST }, 0.3),
    ]);
  }

  /** Where lava globs leave the boss: the mouth. */
  mouthPoint() {
    return {
      x: this.x + this.mouth.x * this.scale.x,
      y: this.y + (this.headNode.y + this.mouth.y) * this.scale.y,
    };
  }

  /** Wind up and spit: the tell before obsidian lands on the board. */
  async spit() {
    sfx.bossSpit();
    await Promise.all([
      tween(this, { breath: 0.9, charge: 0.6 }, 0.18, { ease: Ease.quadOut }),
      tween(this.headNode, { y: HEAD_REST + 14 }, 0.18),
    ]);
    // All the way up on the throw itself: the fire is at its biggest the
    // instant the glob leaves, which is the instant before the board is hit.
    await Promise.all([
      tween(this.mouth.scale, { y: 2.4 }, 0.12, { ease: Ease.backOut }),
      tween(this, { breath: 1.12, charge: 1 }, 0.12),
      tween(this.headNode, { y: HEAD_REST - 8 }, 0.12),
    ]);
    tween(this.mouth.scale, { y: 1 }, 0.34, { delay: 0.18 });
    tween(this, { breath: 1 }, 0.3, { delay: 0.18 });
    tween(this, { charge: 0 }, 0.26, { delay: 0.2 });
    tween(this.headNode, { y: HEAD_REST }, 0.3, { delay: 0.18 });
  }

  /**
   * Lava breath: rear back, then lunge forward with the jaw wide open.
   *
   * Resolves on the frame the mouth is fully open — the caller starts the
   * flame there — and closes it again on its own `hold` seconds later, the
   * same fire-and-forget recovery `spit()` uses.
   */
  async lavaBreath(hold) {
    const h = hold === undefined ? 0.55 : hold;

    // Inhale: pull the head back, jaw shut, everything winds up.
    await Promise.all([
      tween(this, { breath: 0.88, lunge: -10, charge: 0.8 }, 0.24, {
        ease: Ease.quadOut,
      }),
      tween(this.headNode, { y: HEAD_REST - 28 }, 0.24),
      tween(this.mouth.scale, { y: 0.55 }, 0.24),
    ]);
    // Scheduled on the exhale, not the inhale: the hiss has to arrive with the
    // jaw opening, and it is the longest sound in the rotation.
    sfx.bossBreath(h);

    // Exhale: throw the head forward and open up.
    await Promise.all([
      tween(this, { breath: 1.14, lunge: 18, charge: 1 }, 0.14, {
        ease: Ease.backOut,
      }),
      tween(this.headNode, { y: HEAD_REST + 20 }, 0.14, { ease: Ease.backOut }),
      tween(this.mouth.scale, { x: 1.35, y: 3.2 }, 0.14, {
        ease: Ease.backOut,
      }),
    ]);

    // The furnace stays open for as long as the flame is out, and shuts with it.
    tween(this.mouth.scale, { x: 1, y: 1 }, 0.32, { delay: h });
    tween(this, { breath: 1, lunge: 0 }, 0.36, { delay: h });
    tween(this, { charge: 0 }, 0.3, { delay: h });
    tween(this.headNode, { y: HEAD_REST }, 0.36, { delay: h });
  }

  /** Where the fists land when the boss slams the floor. */
  fistPoint() {
    return { x: this.x, y: this.y + this.feetY * this.scale.y };
  }

  /**
   * Magma slam: both fists overhead, then down into the floor.
   * Resolves on the frame of impact so the shockwave and the damage go out
   * together; the rig springs back on its own afterwards.
   */
  async smash() {
    await Promise.all([
      // Half a charge and no further: this attack ends with the fists in the
      // floor, not with fire held out in front of the jaw. Half is enough to
      // light the beast up, which is all the tell needs to be.
      tween(
        this,
        { swing: 1.05, breath: 1.08, lunge: -14, charge: 0.4 },
        0.28,
        {
          ease: Ease.quadOut,
        },
      ),
      tween(this.headNode, { y: HEAD_REST - 20 }, 0.28),
    ]);
    // A held frame at the top: the tell that tells the player it is coming.
    await delay(0.12);

    await Promise.all([
      tween(this, { swing: -0.52, breath: 0.84, lunge: 30 }, 0.11, {
        ease: Ease.quadIn,
      }),
      tween(this.headNode, { y: HEAD_REST + 30 }, 0.11, { ease: Ease.quadIn }),
      tween(this.mouth.scale, { y: 2.2 }, 0.11, { ease: Ease.backOut }),
    ]);

    sfx.bossSmash();
    this.spawnShards(10, 0.9);
    tween(this, { swing: 0, breath: 1, lunge: 0 }, 0.55, {
      delay: 0.14,
      ease: Ease.elasticOut,
    });
    // Its own tween, and not an elastic one: the recovery above overshoots, and
    // a charge that rang past zero would light the beast back up.
    tween(this, { charge: 0 }, 0.2, { ease: Ease.quadOut });
    tween(this.headNode, { y: HEAD_REST }, 0.4, { delay: 0.14 });
    tween(this.mouth.scale, { y: 1 }, 0.34, { delay: 0.14 });
  }

  /**
   * The rake — three claws across the air, and the only beat here that repeats.
   *
   * Asked for by name: something the beast visibly *does* on the moments the
   * screen shakes, instead of the screen shaking at a monster that is standing
   * still. Every other attack on this rig is a wind-up and a release aimed at
   * something — the board, the row, the floor. This one is aimed at the player,
   * costs nothing to play twice in a row, and is short enough to drop into a
   * gap the other three cannot fit in.
   *
   * A painting has no arm to swing, so the swipe is the whole silhouette
   * whipping across its own axis: back and twisted away on the wind-up, then
   * through and past centre on the release, with the head thrown forward and
   * the jaw open on the frame the claws would land. `rig.rotation` rather than
   * `headNode.rotation` because update() owns the latter every frame — a tween
   * on it is a tween that gets overwritten before it draws.
   *
   * Returns the side it swung to, so the caller can lay its claw marks along
   * the same diagonal the body just travelled instead of guessing.
   */
  async rake(side) {
    const dir =
      side === undefined ? (Math.random() < 0.5 ? -1 : 1) : side < 0 ? -1 : 1;

    // The roar is on the wind-up, not the release. A roar landing with the
    // claws is a sound effect; a roar landing a quarter second before them is
    // the reason the player flinches.
    sfx.bossRoar();
    await Promise.all([
      tween(this, { breath: 0.9, lunge: -12, charge: 0.75 }, 0.26, {
        ease: Ease.quadOut,
      }),
      tween(this.rig, { x: -dir * 26, rotation: -dir * 0.07 }, 0.26, {
        ease: Ease.quadOut,
      }),
      tween(this.headNode, { y: HEAD_REST - 22 }, 0.26),
    ]);
    // The held frame at the top of the wind-up, same as smash(): the tell that
    // tells the player it is coming.
    await delay(0.1);
    if (!this.alive) return dir;

    sfx.bossSmash();
    await Promise.all([
      tween(this, { breath: 1.12, lunge: 26, charge: 1 }, 0.1, {
        ease: Ease.quadIn,
      }),
      tween(this.rig, { x: dir * 34, rotation: dir * 0.09 }, 0.1, {
        ease: Ease.quadIn,
      }),
      tween(this.headNode, { y: HEAD_REST + 22 }, 0.1, { ease: Ease.quadIn }),
      tween(this.mouth.scale, { y: 2.3 }, 0.1, { ease: Ease.backOut }),
    ]);
    this.spawnShards(7, 0.8);

    // Fire and forget from here, the same recovery every other beat runs — and
    // `charge` on its own tween for the same reason smash() splits it out: the
    // elastic overshoot above rings past zero, and a charge that rang past zero
    // would light the beast straight back up.
    tween(this, { breath: 1, lunge: 0 }, 0.5, {
      delay: 0.08,
      ease: Ease.elasticOut,
    });
    tween(this.rig, { x: 0, rotation: 0 }, 0.46, {
      delay: 0.08,
      ease: Ease.elasticOut,
    });
    tween(this, { charge: 0 }, 0.22, { ease: Ease.quadOut });
    tween(this.headNode, { y: HEAD_REST }, 0.38, { delay: 0.08 });
    tween(this.mouth.scale, { y: 1 }, 0.32, { delay: 0.1 });

    return dir;
  }

  /** Reaction to taking a hit: flinch, flash, spit rock chips. */
  hit(power) {
    const p = power || 1;
    sfx.bossHit(p);
    const rest = this.enraged ? this.enragedTint : 0xffffff;
    tweenValue(0, 1, 0.3, (v) => {
      this.tint = lerpColor(0xfff0e0, rest, v);
    });
    if (this.flash) {
      this.flash.alpha = Math.min(0.6, 0.34 * p);
      tween(this.flash, { alpha: 0 }, 0.3, { ease: Ease.quadOut });
    }

    const dir = Math.random() < 0.5 ? -1 : 1;
    this.rig.x = dir * 16 * p;
    tween(this.rig, { x: 0 }, 0.4, { ease: Ease.elasticOut });
    this.spawnShards(9 * p, 1);
  }

  spawnShards(count, spread) {
    const tex = shardTexture();
    for (let i = 0; i < count; i++) {
      const s = new Sprite(tex);
      s.anchor.set(0.5);
      s.tint = i % 3 === 0 ? LAVA : ROCK_EDGE;
      const size = 14 + Math.random() * 26;
      s.setSize(size, size);
      s.x = (Math.random() - 0.5) * 200;
      s.y = (Math.random() - 0.5) * 160;
      this.shards.addChild(s);

      const ang = Math.random() * Math.PI * 2;
      const dist = (90 + Math.random() * 220) * spread;
      tween(
        s,
        {
          x: s.x + Math.cos(ang) * dist,
          y: s.y + Math.sin(ang) * dist + 140 * spread,
          rotation: (Math.random() - 0.5) * 9,
          alpha: 0,
        },
        0.55 + Math.random() * 0.35,
        { ease: Ease.quadOut },
      ).then(() => s.destroy());
    }
  }

  enrage() {
    this.enraged = true;
    sfx.bossEnrage();
    this.aura.tint = this.painted ? 0xff2a6a : 0xff2a06;
    tweenValue(0, 1, 0.5, (v) => {
      this.tint = lerpColor(0xffffff, this.enragedTint, v);
    });
    this.spawnShards(14, 1.2);
  }

  /** Collapse into rubble. */
  async die() {
    this.alive = false;
    sfx.bossDie();
    this.spawnShards(30, 1.8);
    await Promise.all([
      tween(this.aura, { alpha: 1 }, 0.2),
      tween(this.aura.scale, { x: 2.4, y: 2.4 }, 0.5, { ease: Ease.quadOut }),
      tween(this.rig.scale, { x: 1.16, y: 0.84 }, 0.28, {
        ease: Ease.backOut,
      }),
    ]);
    this.spawnShards(26, 2.2);
    await Promise.all([
      tween(this.rig, { alpha: 0 }, 0.35),
      tween(this.rig.scale, { x: 0.6, y: 0.4 }, 0.4, { ease: Ease.quadIn }),
      tween(this.aura, { alpha: 0 }, 0.5),
      // Nothing left standing, so nothing left casting one.
      tween(this.shadow, { alpha: 0 }, 0.4),
    ]);
  }
}
