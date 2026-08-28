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
 * The render is not hung on the stage as a sprite. A sprite has two numbers to
 * act with — position and scale — and a beast animated out of those two does
 * the only thing they can do: it slides, and it pumps. So the painting is
 * stretched over a deformable grid instead, and every beat is written as a pose:
 * a jaw that opens, arms that go up and come down, a spine that leans at the
 * camera and twists away from it, a chest that swells off its own planted feet.
 *
 * See ANATOMY. The beast's parts are not cut out of the art, they are *weights*
 * over it, measured off the silhouette of the packed cell; and `place()` is the
 * one function that turns a pose plus those weights into where a pixel goes.
 *
 * Two things worth knowing before changing anything here:
 *
 *   - Nothing rotates. `rotation` on a rectangle of art is the tell of a cheap
 *     2D rig — it turns the beast and the ground it stands on together — so a
 *     twist is a real twist, the top of the figure travelling while the feet
 *     stay put, and it lives in `place()` with everything else.
 *   - The three lights, and every anchor the director reads (impactPoint,
 *     mouthPoint, fistPoint), run through the *same* warp as the art. When the
 *     jaw drops, the fire in it drops with it, and the globs the director lobs
 *     leave from where the mouth actually is on that frame.
 *
 * Every public beat (rise, roar, spit, lavaBreath, smash, rake, hit, enrage,
 * die) behaves the same from the outside whichever art is up: a beat tweens the
 * pose, and update() spends that pose on whichever rig came up — the mesh, or
 * the drawn golem's own joints.
 *
 * The render is trimmed, downscaled and registered by tools/pack-boss-still.mjs
 * — its stance, its reach and its three lights are all measured or resolved by
 * that tool, because none of them survive a crop and a scale.
 */

import { Container, Graphics, Mesh, PlaneGeometry, Sprite } from "pixi.js";
import { tween, delay, Ease, tweenValue, killTweensOf } from "../core/tween.js";
import { canvasTexture, glowTexture, sparkTexture } from "./textures.js";
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
 * `anchor` is the beast's stance — the middle of its feet — and the whole rig
 * is built out from that one point. `rise` and `span` are how far the figure
 * reaches above and across it, and are the only numbers the on-screen size
 * comes from.
 */
const STILL = {
  cell: { w: 900, h: 999 },
  anchor: { x: 441, y: 983 },
  rise: 982,
  span: 897,
};

/** Shorthands: `place()` reads these on every vertex of every frame. */
const AX = STILL.anchor.x;
const AY = STILL.anchor.y;
const RISE = STILL.rise;
const SPAN_H = STILL.span / 2;

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

/**
 * Resting y of the drawn golem's head. Painted, the head is a weight rather
 * than a node — see ANATOMY.head — and this number does not apply to it.
 */
const HEAD_REST = -178;

/* ---------------------------------------------------------------- shaping */

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

/** Hermite ramp from a to b. Works with a > b, which reads as a ramp down. */
const ramp = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** 1 at `c`, 0 at `c +/- r`, smooth in between. */
const bell = (v, c, r) => {
  const t = clamp01(1 - Math.abs(v - c) / r);
  return t * t * (3 - 2 * t);
};

/**
 * The beast's body, as weights over the render rather than cuts through it.
 *
 * Every number here was read off the silhouette of the packed cell — 900x999,
 * feet at y 983 — rather than guessed. The arms hang clear of the torso from
 * y 500 down, in their own columns outside |u| 0.55, and end in claws by y 800;
 * the hood and face occupy y 250..560; the jaw's dark cavity runs y 455..545;
 * the belly sits under the collar around y 620; the rider tops out by y 250 and
 * is gone by y 330.
 *
 * `u` is signed distance from the spine, 1 at the edge of the figure's reach.
 * `y` is a cell row. Both are what `place()` is handed.
 *
 * A weight is how much of a pose channel a pixel takes, so overlapping weights
 * are the point rather than a problem: the shoulder is a fifth of an arm and a
 * tenth of a head, and it moves like one.
 */
const ANATOMY = {
  /**
   * The two arms. Zero at the shoulder and one at the wrist, so a raise swings
   * from the joint instead of sliding the whole limb up the screen; and gone
   * again by y 900, or the legs would come along with the fists.
   *
   * The widths here are a budget rather than a taste call — see the note above
   * `place()`. A weight that goes 0 to 1 across 400 rows can carry a 190-pixel
   * lift; the same weight across 100 rows folds the mesh through itself.
   */
  arm: (u, y) =>
    ramp(0.36, 0.8, Math.abs(u)) * ramp(230, 640, y) * (1 - ramp(670, 920, y)),
  /** Hood, face and horns: everything that nods. */
  head: (u, y) => bell(y, 420, 220) * (1 - ramp(0.42, 0.8, Math.abs(u))),
  /**
   * The lower jaw, and the throat it drags down with it.
   *
   * Deliberately much softer than the cavity it opens: the mouth is eighty
   * rows tall and a weight that tight would tear the face open rather than
   * unhinge it. The drop is spread from the brow to the collar instead, which
   * is also how a jaw this size would actually move.
   */
  jaw: (u, y) =>
    ramp(435, 560, y) *
    (1 - ramp(560, 715, y)) *
    (1 - ramp(0.16, 0.44, Math.abs(u))),
  /** The belly under the collar, which is what actually breathes. */
  chest: (u, y) => bell(y, 620, 140) * (1 - ramp(0.3, 0.72, Math.abs(u))),
  /** The rider on its shoulders, who is along for all of this. */
  rider: (u, y) => bell(y, 120, 215) * (1 - ramp(0.55, 1, Math.abs(u))),
  /** One at the soles: what stops the feet sliding when the body leans. */
  foot: (u, y) => ramp(820, 985, y),
};

/**
 * Where a pixel of the render goes this frame.
 *
 * The single source of truth for the painted rig's shape — the mesh runs every
 * vertex through it, and the three lights and every anchor the director reads
 * run their one point through it. That shared path is the whole reason the fire
 * stays in the mouth when the mouth moves.
 *
 * Vertical work is a scale about the floor line (AY), so no amount of
 * breathing, crouching or rearing ever lifts the beast off the deck. Horizontal
 * offsets are collected into `dx` and damped by the foot weight on the way out,
 * for the same reason from the other side: a lean that slid the soles across
 * the cloud would read as ice rather than as weight.
 *
 * Written to take scalars and fill `out` in place, because it is called five
 * hundred times a frame and must never allocate.
 */
function place(
  fy,
  un,
  wArm,
  wHead,
  wJaw,
  wChest,
  wRider,
  wFoot,
  cx,
  cy,
  P,
  out,
) {
  const fy2 = fy * fy;

  let y = AY - (AY - cy) * P.vs;
  let dx = 0;

  // The travelling wave, and the term that does the most work in this file. A
  // slab of muscle does not stop when the skeleton under it does: it carries on
  // and catches up, later the further it is from the ground. Every impact sets
  // `wob` and lets it ring down, so the follow-through comes for free.
  if (P.wob !== 0) {
    y += Math.sin(P.wobT * 16.5 - fy * 5.4) * fy * 15 * P.wob;
    dx += Math.sin(P.wobT * 13 - fy * 4.1) * fy * 11 * P.wob;
  }

  // Lean: the mass coming at the camera, top leading. Front-on, "forward" can
  // only read as down-screen and bigger, so `vs`/`hs` carry the size and this
  // carries the drop.
  y += P.lean * (0.22 + 0.78 * fy);

  // Twist: the top of the figure travels across while the near side
  // foreshortens, which is a turn.
  if (P.twist !== 0) dx += P.twist * (fy2 * 52 - un * fy * 30);

  // The wind-up shake, and the enrage's permanent hum.
  if (P.tremor !== 0) dx += Math.sin(P.t * 41 + fy * 8.3) * fy * P.tremor;

  if (wArm !== 0) {
    y += P.armY * wArm;
    dx += (un < 0 ? -P.armX : P.armX) * wArm;
  }
  if (wHead !== 0) {
    y += P.headY * wHead;
    dx += P.headX * wHead;
  }
  if (wRider !== 0) {
    y += P.riderY * wRider;
    dx += P.riderX * wRider;
  }
  if (wJaw !== 0) {
    y += P.jaw * 46 * wJaw;
    dx += un * P.jaw * 30 * wJaw;
  }
  if (wChest !== 0) dx += un * P.chest * wChest;

  // The soles are the last thing allowed to move: both the sideways offsets
  // and the horizontal scale are damped out to nearly nothing at the floor, so
  // a lean, a twist or a crouch bends the beast over its feet instead of
  // skating them across the cloud it is standing on.
  const damp = 1 - 0.85 * wFoot;
  out.x = AX + (cx - AX) * (1 + (P.hs - 1) * (1 - 0.45 * wFoot)) + dx * damp;
  out.y = y;
}

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

/**
 * Debris, embers and dust, on a hand-run clock rather than on tweens.
 *
 * A tweened particle travels in a straight line between two keys, which is why
 * the rock chips this replaces looked thrown rather than knocked loose. These
 * are integrated — gravity, drag, spin — so a chip arcs and a spark rises and
 * slows. It also means they stop dead with the rest of the beast during a
 * hit-stop, which anything running off the global tween clock would not.
 */
class Bits extends Container {
  constructor() {
    super();
    this.live = [];
  }

  /**
   * Put one particle in the air.
   *
   * `spawn` and not `emit`: Container already has an `emit`, it is what
   * addChild calls to announce a child, and a method of that name here calls
   * itself through pixi forever.
   *
   * @param {object} o `vx`/`vy` in units per second, `g` gravity, `drag` per
   *   second, `life` seconds, `grow` end scale, `flat` y-squash of the sprite.
   */
  spawn(tex, o) {
    const s = new Sprite(tex);
    s.anchor.set(0.5);
    s.blendMode = o.blend || "normal";
    s.tint = o.tint;
    s.alpha = o.alpha === undefined ? 1 : o.alpha;
    s.x = o.x;
    s.y = o.y;
    s.setSize(o.size, o.size);
    if (o.flat) s.scale.y *= o.flat;
    s.rotation = o.rotation || 0;
    this.addChild(s);
    this.live.push({
      s,
      vx: o.vx,
      vy: o.vy,
      g: o.g || 0,
      drag: o.drag === undefined ? 0.6 : o.drag,
      vr: o.spin || 0,
      t: 0,
      life: o.life,
      a0: s.alpha,
      sx: s.scale.x,
      sy: s.scale.y,
      grow: o.grow === undefined ? 1 : o.grow,
    });
    return s;
  }

  update(dt) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.t += dt;
      const k = p.t / p.life;
      if (k >= 1) {
        this.live.splice(i, 1);
        p.s.destroy();
        continue;
      }
      const d = 1 - Math.min(1, p.drag * dt);
      p.vx *= d;
      p.vy = p.vy * d + p.g * dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.rotation += p.vr * dt;
      // Held for the first third, then out. A chip that starts fading on the
      // frame it is struck never reads as having been struck.
      p.s.alpha = p.a0 * (k < 0.35 ? 1 : 1 - (k - 0.35) / 0.65);
      if (p.grow !== 1) {
        const g = 1 + (p.grow - 1) * k;
        p.s.scale.set(p.sx * g, p.sy * g);
      }
    }
  }
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
     * Bottom of the stack and outside `rig`, so the breath cycle does not scale
     * it: a shadow that swells with the chest is a shadow the eye reads as a
     * second creature underneath the first one. It does answer the beats that
     * move the beast's weight around, and only those — see update().
     */
    this.shadow = new Sprite(glowTexture());
    this.shadow.anchor.set(0.5);
    this.shadow.blendMode = "multiply";
    this.shadow.tint = SHADOW_TINT;
    this.shadow.alpha = 0.58;
    this.shadow.setSize(BOSS_ART.w * 0.9, BOSS_ART.h * 0.19);
    this.shadowBase = { x: this.shadow.scale.x, y: this.shadow.scale.y };
    this.addChild(this.shadow);

    this.aura = new Sprite(glowTexture());
    this.aura.anchor.set(0.5);
    this.aura.blendMode = "add";
    this.aura.tint = LAVA;
    this.aura.alpha = 0.5;
    this.aura.setSize(760, 620);
    this.addChild(this.aura);

    /** Everything that moves as the beast. */
    this.rig = new Container();
    this.addChild(this.rig);

    /**
     * The pose, and the whole interface between the beats and the art.
     *
     * Displacements are in the render's own pixels; scales are multipliers.
     * Every beat below is a tween on this object and nothing else, which is
     * what lets one beat read the same on the mesh and on the drawn golem, and
     * what lets die() cancel a half-finished attack with one call.
     */
    this.pose = {
      /** Vertical scale of the body about its own feet. */
      breath: 1,
      /** Arms: +1 overhead, -1 driven into the floor. */
      swing: 0,
      /** Down-screen travel of the mass, top leading. Reads as forward. */
      lean: 0,
      /** Lateral turn about the spine, -1..1. */
      twist: 0,
      /** Jaw, 0 shut and 1 wide. */
      jaw: 0,
      /** Head offset, in render pixels. */
      headY: 0,
      headX: 0,
      /** How far into a wind-up the golem is, 0..1. Drives the fire. */
      charge: 0,
      /** Knees buckling, 0..1. Only death uses it. */
      crouch: 0,
      /** Whole-beast recoil from a hit, in rig units. */
      shove: 0,
      /** Amplitude of the travelling jiggle; rings down on its own. */
      wob: 0,
      /** That wave's own clock, so a fresh impact restarts its phase. */
      wobT: 0,
    };

    /** Scratch handed to place(); reused so the warp never allocates. */
    this.P = {
      vs: 1,
      hs: 1,
      lean: 0,
      twist: 0,
      jaw: 0,
      headY: 0,
      headX: 0,
      riderY: 0,
      riderX: 0,
      armY: 0,
      armX: 0,
      chest: 0,
      tremor: 0,
      wob: 0,
      wobT: 0,
      t: 0,
    };
    this.pt = { x: 0, y: 0 };

    /** Whether the render decoded. False means the drawn rig is on stage. */
    this.painted = !!painting;
    if (this.painted) this.buildPainted();
    else this.buildDrawn();

    // Only now: `feetY` is whichever rig came up, and the two do not agree.
    this.shadow.y = this.feetY - 8;

    this.bits = new Bits();
    this.addChild(this.bits);

    this.t = 0;
    /** Seconds of hit-stop left. See hit(). */
    this.hold = 0;
    /** The ember emitter's fractional debt, so a slow rate still emits. */
    this.emberDebt = 0;
    this.enraged = false;
    this.alive = true;
  }

  /* ---------------------------------------------------------- painted rig */

  buildPainted() {
    // Violet, because the art is: an orange aura around a magenta beast reads
    // as a colour mistake rather than as heat.
    this.aura.tint = RUNE;
    this.auraHome = this.rigY(AY - RISE * 0.55);
    this.aura.y = this.auraHome;
    this.aura.setSize(STILL.span * K * 1.55, STILL_H * 1.5);

    /**
     * The grid the render is stretched over.
     *
     * 19 by 25 is picked from both ends. Below it the jaw — an eighty-pixel
     * band of a thousand-pixel cell — has no vertices of its own to open with,
     * and the mouth creases instead of dropping. Above it nothing improves: the
     * warp is smooth and the texture is not that sharp. It is also comfortably
     * past the hundred vertices at which pixi stops batching a mesh on the CPU
     * and hands the buffer straight to the GPU — which is what this wants,
     * because the buffer is rewritten every frame.
     *
     * Vertex positions are the render's own cell coordinates, so the mesh's own
     * transform *is* cell space -> rig space and nothing converts twice.
     */
    this.geo = new PlaneGeometry({
      width: STILL.cell.w,
      height: STILL.cell.h,
      verticesX: 19,
      verticesY: 25,
    });
    this.rest = Float32Array.from(this.geo.positions);
    this.bakeWeights();

    this.art = new Mesh({ geometry: this.geo, texture: painting });
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
    this.art.scale.set(K);
    this.art.x = -AX * K;
    this.art.y = STILL_FEET - AY * K;
    this.rig.addChild(this.art);

    /**
     * Hit flash: the beast drawn over itself with the `add` blend.
     *
     * The drawn rig flashed by tint, which can only ever take a colour down —
     * on art this dark it barely reads. Adding the render to itself lights the
     * fire it is already full of and leaves the scales where they are, so a hit
     * looks like heat rather than like a lamp. On the same geometry object as
     * the body, so one buffer upload drives both and the flash can never lag a
     * frame behind the thing it is lighting.
     */
    this.flash = new Mesh({ geometry: this.geo, texture: painting });
    this.flash.blendMode = "add";
    this.flash.alpha = 0;
    this.flash.scale.set(K);
    this.flash.x = this.art.x;
    this.flash.y = this.art.y;
    this.rig.addChild(this.flash);

    // The three places this render already burns. Positioned every frame off
    // the warp rather than pinned once, so they ride the pose instead of
    // sliding around on top of it.
    /**
     * The three lights, and a warning about their size.
     *
     * These were three times this bright and half again this big, and what that
     * bought was a beast with no face: additive violet over a render that is
     * already lit violet is not a highlight, it is an eraser, and the fanged
     * head this art is built around came out as a pink smear across the middle
     * of the silhouette. A jaw cannot read as opening if the jaw cannot be seen.
     *
     * So they sit at a suggestion of bloom at rest and are *driven* — by
     * `charge`, by `jaw`, by the core's own pulse — which also means the
     * difference between this beast idling and this beast winding up is now
     * something the eye can measure. The fire in the render does the rest.
     */
    this.eyes = new Container();
    this.eyes.addChild(this.light(RUNE_HOT, 150, 86, 0.15));
    this.rig.addChild(this.eyes);

    this.mouth = new Container();
    this.mouth.addChild(this.light(RUNE, 140, 104, 0.14));
    this.rig.addChild(this.mouth);

    this.core = new Container();
    this.coreGlow = this.light(RUNE, 180, 150, 1);
    this.core.addChild(this.coreGlow);
    this.rig.addChild(this.core);

    /**
     * The wind-up, in place of the six fire frames the sheet used to spend on
     * it. `charge` banks this up in front of the jaw: dark at rest, which is
     * what keeps a tell a tell.
     */
    this.gather = new Container();
    this.gatherGlow = this.light(RUNE_HOT, 250, 210, 0);
    this.gather.addChild(this.gatherGlow);
    this.rig.addChild(this.gather);

    /** Where fistPoint drops the shockwave. */
    this.feetY = STILL_FEET;
    this.enragedTint = ENRAGED_PAINTED;
    this.ember = RUNE_HOT;

    /**
     * The render carries its own light, so the glows are a fraction of what
     * they were over the drawn rig. Any more and the beast turns into a violet
     * smear the moment it charges.
     */
    this.glowGain = 0.5;

    // One warp on the resting pose, so the first frame drawn is a beast
    // standing rather than a flat rectangle of art snapping into shape — and
    // so impactPoint() has somewhere to point before the first update.
    this.applyPose();
    this.placeLights();
    this.gather.position.set(this.mouth.x, this.mouth.y);
  }

  /**
   * Resolve ANATOMY once per vertex, into flat arrays.
   *
   * The weights are a property of the art, not of the frame: they never change
   * after this. Baking them is what keeps the per-frame cost of the warp down
   * to a dozen multiply-adds a vertex.
   */
  bakeWeights() {
    const n = this.rest.length / 2;
    const W = {
      n,
      fy: new Float32Array(n),
      un: new Float32Array(n),
      arm: new Float32Array(n),
      head: new Float32Array(n),
      jaw: new Float32Array(n),
      chest: new Float32Array(n),
      rider: new Float32Array(n),
      foot: new Float32Array(n),
    };
    for (let i = 0; i < n; i++) {
      const cx = this.rest[i * 2];
      const cy = this.rest[i * 2 + 1];
      const un = (cx - AX) / SPAN_H;
      W.fy[i] = clamp01((AY - cy) / RISE);
      W.un[i] = un;
      W.arm[i] = ANATOMY.arm(un, cy);
      W.head[i] = ANATOMY.head(un, cy);
      W.jaw[i] = ANATOMY.jaw(un, cy);
      W.chest[i] = ANATOMY.chest(un, cy);
      W.rider[i] = ANATOMY.rider(un, cy);
      W.foot[i] = ANATOMY.foot(un, cy);
    }
    this.W = W;
  }

  /** Push the frame's pose through every vertex of the mesh. */
  applyPose() {
    const W = this.W;
    const pos = this.geo.positions;
    const rest = this.rest;
    const P = this.P;
    const out = this.pt;
    for (let i = 0; i < W.n; i++) {
      const j = i * 2;
      place(
        W.fy[i],
        W.un[i],
        W.arm[i],
        W.head[i],
        W.jaw[i],
        W.chest[i],
        W.rider[i],
        W.foot[i],
        rest[j],
        rest[j + 1],
        P,
        out,
      );
      pos[j] = out.x;
      pos[j + 1] = out.y;
    }
    this.geo.buffers[0].update();
  }

  /** Warp one cell-space point through the frame's pose, into rig units. */
  warpToRig(cx, cy, out) {
    const un = (cx - AX) / SPAN_H;
    place(
      clamp01((AY - cy) / RISE),
      un,
      ANATOMY.arm(un, cy),
      ANATOMY.head(un, cy),
      ANATOMY.jaw(un, cy),
      ANATOMY.chest(un, cy),
      ANATOMY.rider(un, cy),
      ANATOMY.foot(un, cy),
      cx,
      cy,
      this.P,
      out,
    );
    out.x = (out.x - AX) * K;
    out.y = STILL_FEET - (AY - out.y) * K;
    return out;
  }

  /** Cell row -> rig y, undeformed. */
  rigY(cy) {
    return STILL_FEET - (AY - cy) * K;
  }

  /** Put the eyes, the jaw and the core back where the warp left them. */
  placeLights() {
    const p = this.pt;
    this.warpToRig(LIGHTS.crown.x, LIGHTS.crown.y, p);
    this.eyes.position.set(p.x, p.y);
    this.warpToRig(LIGHTS.maw.x, LIGHTS.maw.y, p);
    this.mouth.position.set(p.x, p.y);
    this.warpToRig(LIGHTS.core.x, LIGHTS.core.y, p);
    this.core.position.set(p.x, p.y);
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
    this.ember = LAVA_HOT;
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

  /** Rig-space point -> the space the director works in. */
  toStage(px, py) {
    return {
      x: this.x + (this.rig.x + px) * this.scale.x,
      y: this.y + (this.rig.y + py) * this.scale.y,
    };
  }

  /** The chest: where every hero beam is thrown, and where the core burns. */
  impactPoint() {
    if (!this.painted) return this.toStage(0, this.coreY);
    return this.toStage(this.core.x, this.core.y);
  }

  /** Where lava globs leave the boss: the mouth, wherever the pose put it. */
  mouthPoint() {
    if (!this.painted) {
      return this.toStage(this.mouth.x, this.headNode.y + this.mouth.y);
    }
    return this.toStage(this.mouth.x, this.mouth.y);
  }

  /** Where the fists land when the boss slams the floor. */
  fistPoint() {
    return this.toStage(0, this.feetY);
  }

  /* ------------------------------------------------------------ animation */

  update(dt) {
    // Hit-stop. Everything the beast owns stops together, which is the only
    // reason it reads as a stop rather than as a dropped frame.
    if (this.hold > 0) {
      this.hold -= dt;
      return;
    }
    // Once the collapse has finished there is nothing left to warp; the debris
    // it threw on the way down is still in the air, though.
    if (!this.alive && this.rig.alpha <= 0.002) {
      this.bits.update(dt);
      return;
    }

    this.t += dt;
    const pose = this.pose;

    // The jiggle rings down here rather than on a tween, so any beat can set it
    // and walk away, and two impacts in a row add up instead of the second
    // cancelling the first.
    pose.wobT += dt;
    if (pose.wob > 0.0005) pose.wob *= Math.exp(-dt * 3.4);
    else pose.wob = 0;

    const rate = this.enraged ? 2.9 : 1.55;
    /**
     * Two frequencies, deliberately incommensurate.
     *
     * One sine is a machine: at this rate the eye picks the loop up inside four
     * seconds and the beast stops being alive. Beating a slower wave against it
     * costs one more Math.sin and buys a cycle nobody can count.
     */
    const bob =
      Math.sin(this.t * rate) * 0.62 +
      Math.sin(this.t * rate * 0.41 + 1.7) * 0.38;
    const amp = this.enraged ? 0.042 : 0.026;

    if (this.painted) this.updatePainted(dt, bob, amp, rate);
    else this.updateDrawn(bob, amp, rate);

    this.rig.x = pose.shove;

    const flicker = 0.82 + Math.sin(this.t * 9.3) * 0.08;
    // A blink, on a cycle long enough not to read as a tic: the slit eyes
    // gutter almost out for a tenth of a second and come back.
    const blinkT = (this.t * 0.31) % 1;
    const blink = blinkT > 0.94 ? 1 - Math.sin((blinkT - 0.94) * 62) * 0.8 : 1;
    this.eyes.alpha = flicker * blink * (1 + pose.charge * 1.9);
    this.aura.alpha =
      ((this.enraged ? 0.75 : 0.45) +
        Math.sin(this.t * 2.2) * 0.12 +
        pose.charge * 0.35) *
      this.glowGain;

    const pulse = Math.sin(this.t * (this.enraged ? 7 : 3.6));
    const coreBase = this.enraged ? 1.22 : 1;
    this.core.scale.set(coreBase * (1 + pulse * 0.05 + pose.charge * 0.12));
    this.coreGlow.alpha =
      ((this.enraged ? 0.4 : 0.24) + pulse * 0.09 + pose.charge * 0.75) *
      this.glowGain;

    if (this.alive) {
      // The shadow answers the beats that move the beast's weight, and nothing
      // else. Rearing lifts it off its own floor, so the pool tightens and
      // lightens; leaning in spreads it. Left alone once the beast is dying —
      // die() is fading it out and would only be fought over.
      const sh = 1 - pose.swing * 0.09 + pose.lean * 0.0016 + pose.crouch * 0.1;
      this.shadow.scale.set(this.shadowBase.x * sh, this.shadowBase.y * sh);
      this.shadow.alpha = 0.58 * (1 - pose.swing * 0.18);
      this.emitEmbers(dt);
    }
    this.bits.update(dt);
  }

  /**
   * Spend the pose on the mesh.
   *
   * Everything the beast does that no beat asked for is added here: the head
   * trails the chest by a fifth of a breath, the rider trails the head again
   * and keeps bouncing after it has stopped, and the whole figure looks slowly
   * around on a clock unrelated to the one it breathes on. None of that is a
   * beat, and all of it is why a still holds the screen between them.
   */
  updatePainted(dt, bob, amp, rate) {
    const pose = this.pose;
    const P = this.P;

    const vs =
      pose.breath *
      (1 + bob * amp) *
      (1 + pose.swing * 0.03) *
      (1 - pose.crouch * 0.45);
    P.vs = vs;
    // Roughly constant volume: what the body loses in height it takes in width.
    P.hs = 1 + (1 - vs) * 0.5 + pose.crouch * 0.14;

    P.lean = pose.lean;
    P.twist = pose.twist;
    P.jaw = pose.jaw;
    P.headY = pose.headY + Math.sin(this.t * rate - 0.85) * 6.5;
    P.headX = pose.headX + Math.sin(this.t * 0.61) * 9;
    // The rider trails the head again, and is the only part of the figure the
    // travelling wave is allowed to throw around: he is not attached to it.
    P.riderY =
      pose.headY * 0.35 +
      Math.sin(this.t * rate - 1.5) * 11 +
      pose.wob * Math.sin(pose.wobT * 11.5) * 26;
    P.riderX = Math.sin(this.t * 0.44 + 2.1) * 8 + pose.twist * 18;
    // Arms swing from the shoulder, and keep swinging a beat after the body
    // has stopped.
    P.armY = -pose.swing * 195 + pose.wob * Math.sin(pose.wobT * 12 - 0.9) * 18;
    P.armX = -pose.swing * 46;
    P.chest = (vs - 1) * 160 + pose.charge * 14;
    P.tremor = pose.charge * 3.4 + (this.enraged ? 1.1 : 0);
    P.wob = pose.wob;
    P.wobT = pose.wobT;
    P.t = this.t;

    this.applyPose();
    this.placeLights();

    // The jaw's fire opens with the jaw and widens as well as growing — a mouth
    // is wider than it is deep — and it is the one light allowed to get bright,
    // because an open furnace is the brightest thing on this beast.
    this.mouth.scale.set(1 + pose.jaw * 0.7, 1 + pose.jaw * 1.7);
    this.mouth.alpha = 1 + pose.jaw * 2.4 + pose.charge * 0.6;

    // The wind-up banks up in front of the jaw and lags it, because it is fire
    // in the air rather than a lamp bolted to the beast.
    const c = clamp01(pose.charge);
    this.gatherGlow.alpha = c * c * 0.9;
    this.gather.scale.set(0.5 + c * 0.7);
    const k = Math.min(1, dt * 13);
    this.gather.x += (this.mouth.x - this.gather.x) * k;
    this.gather.y += (this.mouth.y + 10 - this.gather.y) * k;

    // The aura is a haze around the beast, not a decal on it: it follows, late.
    const ak = Math.min(1, dt * 5);
    this.aura.x += (this.core.x * 0.6 - this.aura.x) * ak;
    this.aura.y += (this.auraHome + pose.lean * 0.5 - this.aura.y) * ak;
  }

  /** The same pose, spent on the drawn golem's own joints. */
  updateDrawn(bob, amp, rate) {
    const pose = this.pose;

    const vs = pose.breath * (1 + bob * amp) * (1 - pose.crouch * 0.45);
    this.rig.scale.y = vs;
    this.rig.scale.x = 1 + (1 - vs) * 0.5 + pose.crouch * 0.14;
    this.rig.y =
      -bob * 8 + pose.lean * K + pose.wob * Math.sin(pose.wobT * 16.5) * 9;

    this.headNode.y =
      HEAD_REST + (pose.headY + Math.sin(this.t * rate - 0.85) * 6.5) * K;
    this.headNode.x = (pose.headX + Math.sin(this.t * 0.61) * 9) * K;
    this.headNode.rotation = Math.sin(this.t * 0.9) * 0.03 + pose.twist * 0.16;
    this.mouth.scale.set(1 + pose.jaw * 0.4, 1 + pose.jaw * 1.6);

    // The idle sway fades out as the arms are driven by an attack, so a raised
    // fist does not keep bobbing as if nothing were happening.
    const sway = 1 - Math.min(1, Math.abs(pose.swing) * 3);
    const lag = pose.wob * Math.sin(pose.wobT * 12 - 0.9) * 0.1;
    this.armL.rotation =
      pose.swing + lag + Math.sin(this.t * 1.1) * 0.05 * sway;
    this.armR.rotation =
      -pose.swing - lag - Math.sin(this.t * 1.1 + 0.6) * 0.05 * sway;

    this.veins.alpha =
      (this.enraged
        ? 0.95 + Math.sin(this.t * 6) * 0.05
        : 0.75 + Math.sin(this.t * 3) * 0.12) +
      pose.charge * 0.4;
  }

  /**
   * The slow drift of sparks off a thing that is on fire.
   *
   * Continuous and cheap, and the only motion on screen with nothing to do with
   * what the beast is doing — which is exactly why it works: it is what
   * separates a creature standing still from a picture of one. The rate rides
   * `charge`, so a wind-up visibly draws heat up out of the body before the
   * attack it belongs to has started.
   */
  emitEmbers(dt) {
    const pose = this.pose;
    const rate = (this.enraged ? 15 : 7) + pose.charge * 34;
    this.emberDebt += rate * dt;
    const tex = sparkTexture();
    while (this.emberDebt >= 1) {
      this.emberDebt -= 1;
      // Half rise off the body, half off the jaw that is gathering: during a
      // wind-up that reads as an inhale the player can see.
      const up = Math.random() < 0.5;
      const from = up ? this.core : this.mouth;
      const spread = up ? 150 : 70;
      this.bits.spawn(tex, {
        x: this.rig.x + from.x + (Math.random() - 0.5) * spread,
        y: this.rig.y + from.y + (Math.random() - 0.5) * spread * 0.7,
        vx: (Math.random() - 0.5) * 46,
        vy: -30 - Math.random() * 70 - pose.charge * 90,
        g: -18,
        drag: 0.9,
        life: 0.6 + Math.random() * 0.7,
        size: 8 + Math.random() * 16,
        grow: 0.2,
        tint: Math.random() < 0.35 ? this.ember : this.enragedTint,
        blend: "add",
        alpha: 0.5 + Math.random() * 0.4,
      });
    }
  }

  /**
   * Out of the pool.
   *
   * The length is the director's to set, not this file's: the rise is one of
   * four things arriving on the same frame and they all take T.introIn, so a
   * number kept here would be a fourth clock nobody could see. The curve is
   * still ours — cubicOut, the weight of something heavy settling — and the
   * beast now lands rather than simply arriving: it comes up crouched,
   * straightens as it clears the lava, and the floor rings once under it.
   */
  async rise(seconds) {
    this.y = this.homeY + this.riseFrom;
    this.alpha = 1;
    sfx.bossRise();
    const d = seconds === undefined ? 0.95 : seconds;
    this.pose.crouch = 0.35;
    this.pose.headY = 26;
    tween(this.pose, { crouch: 0, headY: 0 }, d * 0.8, {
      delay: d * 0.35,
      ease: Ease.cubicOut,
    });
    await tween(this, { y: this.homeY }, d, { ease: Ease.cubicOut });
    this.pose.wob = 0.5;
    this.pose.wobT = 0;
    this.dust(16, 0.7);
  }

  /**
   * The roar, and the only beat here not aimed at anything.
   *
   * Inhale first — the body pulls in, the jaw shuts, the head goes back — so
   * that the open has something to come out of. A roar that starts from rest is
   * a mouth opening; a roar that starts from a held breath is a roar.
   */
  async roar() {
    sfx.bossRoar();
    await tween(
      this.pose,
      { breath: 0.93, headY: -14, jaw: 0, charge: 0.2 },
      0.17,
      { ease: Ease.quadOut },
    );
    await tween(
      this.pose,
      { jaw: 1, breath: 1.11, lean: 16, headY: 16, charge: 0.55 },
      0.13,
      { ease: Ease.backOut },
    );
    this.pose.wob = 0.65;
    this.pose.wobT = 0;
    this.blast(this.mouth, 12, 260, 0.5);
    await delay(0.34);
    await tween(
      this.pose,
      { jaw: 0, breath: 1, lean: 0, headY: 0, charge: 0 },
      0.34,
      { ease: Ease.quadOut },
    );
  }

  /** Wind up and spit: the tell before obsidian lands on the board. */
  async spit() {
    sfx.bossSpit();
    await tween(
      this.pose,
      { breath: 0.9, headY: 16, jaw: 0.15, charge: 0.6, lean: -8 },
      0.18,
      { ease: Ease.quadOut },
    );
    // All the way up on the throw itself: the fire is at its biggest the
    // instant the glob leaves, which is the instant before the board is hit.
    await tween(
      this.pose,
      { jaw: 1, breath: 1.12, headY: -8, charge: 1, lean: 20 },
      0.12,
      { ease: Ease.backOut },
    );
    this.pose.wob = 0.5;
    this.pose.wobT = 0;
    this.blast(this.mouth, 8, 300, 0.4);
    tween(this.pose, { jaw: 0, breath: 1, headY: 0, lean: 0 }, 0.32, {
      delay: 0.18,
      ease: Ease.quadOut,
    });
    tween(this.pose, { charge: 0 }, 0.26, { delay: 0.2 });
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

    // Inhale: pull the head back, jaw shut, everything winds up. The charge
    // going in ahead of the fire is what drags the embers up into the jaw.
    await tween(
      this.pose,
      { breath: 0.86, lean: -18, charge: 0.85, jaw: 0.1, headY: -26 },
      0.26,
      { ease: Ease.quadOut },
    );
    // Scheduled on the exhale, not the inhale: the hiss has to arrive with the
    // jaw opening, and it is the longest sound in the rotation.
    sfx.bossBreath(h);

    // Exhale: throw the head forward and open up.
    await tween(
      this.pose,
      { breath: 1.16, lean: 34, charge: 1, jaw: 1, headY: 22 },
      0.14,
      { ease: Ease.backOut },
    );
    this.pose.wob = 0.7;
    this.pose.wobT = 0;
    this.blast(this.mouth, 14, 340, 0.55);

    // The furnace stays open for as long as the flame is out, and shuts with
    // it. The lean is held down the whole time rather than snapping back — a
    // jet this size pushes against the thing throwing it.
    tween(this.pose, { lean: 24, headY: 16 }, h, { ease: Ease.quadOut });
    tween(this.pose, { jaw: 0, breath: 1, lean: 0, headY: 0 }, 0.38, {
      delay: h,
      ease: Ease.quadOut,
    });
    tween(this.pose, { charge: 0 }, 0.3, { delay: h });
  }

  /**
   * Magma slam: both fists overhead, then down into the floor.
   *
   * Resolves on the frame of impact so the shockwave and the damage go out
   * together; the rig springs back on its own afterwards. The arms are real
   * here — ANATOMY.arm is what lifts them and what drives them down — so the
   * held frame at the top is a silhouette with its fists in the air, rather
   * than a picture that has got slightly taller.
   */
  async smash() {
    // Half a charge and no further: this attack ends with the fists in the
    // floor, not with fire held out in front of the jaw. Half is enough to
    // light the beast up, which is all the tell needs to be.
    await tween(
      this.pose,
      { swing: 0.95, breath: 1.08, lean: -16, charge: 0.45, headY: -18 },
      0.3,
      { ease: Ease.quadOut },
    );
    // A held frame at the top: the tell that tells the player it is coming.
    await delay(0.13);
    if (!this.alive) return;

    await tween(
      this.pose,
      { swing: -0.45, breath: 0.82, lean: 34, jaw: 0.8, headY: 28 },
      0.1,
      { ease: Ease.quadIn },
    );

    sfx.bossSmash();
    // Hit-stop, and the cheapest weight there is: four frames of nothing at
    // all, after which the recovery reads as recoil rather than as a second
    // animation starting.
    this.hold = 0.06;
    this.pose.wob = 1;
    this.pose.wobT = 0;
    this.spawnShards(12, 1);
    this.dust(22, 1.2);
    tween(this.pose, { swing: 0, breath: 1, lean: 0, headY: 0 }, 0.6, {
      delay: 0.14,
      ease: Ease.elasticOut,
    });
    // Their own tweens, and not elastic ones: the recovery above overshoots,
    // and a charge or a jaw that rang past zero would light the beast back up
    // or leave it grinning.
    tween(this.pose, { charge: 0 }, 0.2, { ease: Ease.quadOut });
    tween(this.pose, { jaw: 0 }, 0.3, { delay: 0.12, ease: Ease.quadOut });
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
   * The swipe is a genuine twist of the body — `pose.twist` carries the top of
   * the figure across while the feet stay planted — with the arms thrown
   * through ahead of it. Rotating the whole rig, which is what this used to do,
   * turned the beast and the ground it stands on together.
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
    await tween(
      this.pose,
      {
        breath: 0.92,
        lean: -14,
        charge: 0.75,
        twist: -dir * 0.9,
        swing: 0.55,
        headX: -dir * 22,
        headY: -18,
      },
      0.27,
      { ease: Ease.quadOut },
    );
    // The held frame at the top of the wind-up, same as smash(): the tell that
    // tells the player it is coming.
    await delay(0.1);
    if (!this.alive) return dir;

    sfx.bossSmash();
    await tween(
      this.pose,
      {
        breath: 1.12,
        lean: 28,
        charge: 1,
        twist: dir * 1.15,
        swing: -0.35,
        headX: dir * 30,
        headY: 20,
        jaw: 0.85,
      },
      0.09,
      { ease: Ease.quadIn },
    );
    this.hold = 0.045;
    this.pose.wob = 0.85;
    this.pose.wobT = 0;
    this.spawnShards(8, 0.85);
    // Sparks torn off along the line the claws travelled, so the swipe leaves
    // something on the beast as well as on the screen.
    this.blast(this.core, 12, 420, 0.45, dir);

    // Fire and forget from here, the same recovery every other beat runs — and
    // `charge` on its own tween for the same reason smash() splits it out: the
    // elastic overshoot above rings past zero, and a charge that rang past zero
    // would light the beast straight back up.
    tween(
      this.pose,
      { breath: 1, lean: 0, twist: 0, swing: 0, headX: 0, headY: 0 },
      0.52,
      { delay: 0.08, ease: Ease.elasticOut },
    );
    tween(this.pose, { charge: 0 }, 0.22, { ease: Ease.quadOut });
    tween(this.pose, { jaw: 0 }, 0.28, { delay: 0.1, ease: Ease.quadOut });

    return dir;
  }

  /**
   * Reaction to taking a hit: hit-stop, flinch, flash, spit rock chips.
   *
   * The stop is the important half. A hero swing that only pushes the beast
   * sideways reads as a nudge however far it pushes it, because nothing on
   * screen acknowledges the moment of contact. Two or three frames where the
   * whole creature simply stops do, and cost nothing.
   */
  hit(power) {
    const p = power || 1;
    sfx.bossHit(p);
    const rest = this.enraged ? this.enragedTint : 0xffffff;
    tweenValue(0, 1, 0.3, (v) => {
      this.tint = lerpColor(0xfff0e0, rest, v);
    });
    if (this.flash) {
      this.flash.alpha = Math.min(0.62, 0.34 * p);
      tween(this.flash, { alpha: 0 }, 0.3, { ease: Ease.quadOut });
    }

    const dir = Math.random() < 0.5 ? -1 : 1;
    this.hold = Math.min(0.07, 0.028 * p);
    this.pose.shove = dir * 16 * p;
    // Two channels, not one: the body travels, and the head snaps away from
    // the blow ahead of it. `breath` is left alone on purpose — an attack may
    // be mid-tween on it, and two tweens fighting over one key is a stutter.
    this.pose.headX = -dir * 12 * p;
    this.pose.wob = Math.min(1.1, 0.55 * p);
    this.pose.wobT = 0;
    tween(this.pose, { shove: 0, headX: 0 }, 0.44, { ease: Ease.elasticOut });
    this.spawnShards(6 + 4 * p, 1);
    this.blast(this.core, 10, 300, 0.4, -dir);
  }

  /**
   * Rock knocked off the beast: chips that arc, tumble and fall.
   *
   * Integrated rather than tweened between two points — see Bits — because a
   * straight-line throw is the single most reliable tell that a burst was
   * animated by a programmer.
   */
  spawnShards(count, spread) {
    const tex = shardTexture();
    const n = Math.round(count);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const v = (200 + Math.random() * 320) * spread;
      this.bits.spawn(tex, {
        x: this.rig.x + (Math.random() - 0.5) * 220,
        y: this.rig.y + this.core.y + (Math.random() - 0.5) * 180,
        vx: Math.cos(ang) * v,
        vy: Math.sin(ang) * v - 90,
        g: 1400,
        drag: 0.5,
        spin: (Math.random() - 0.5) * 16,
        life: 0.55 + Math.random() * 0.4,
        size: 14 + Math.random() * 26,
        tint: i % 3 === 0 ? LAVA : ROCK_EDGE,
      });
    }
  }

  /** Sparks thrown off a point on the beast, optionally biased to one side. */
  blast(from, count, speed, life, dir) {
    const tex = sparkTexture();
    for (let i = 0; i < count; i++) {
      const a =
        dir === undefined
          ? Math.random() * Math.PI * 2
          : (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 1.5;
      const v = speed * (0.45 + Math.random() * 0.75);
      this.bits.spawn(tex, {
        x: this.rig.x + from.x + (Math.random() - 0.5) * 60,
        y: this.rig.y + from.y + (Math.random() - 0.5) * 60,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v - 40,
        g: 120,
        drag: 1.6,
        life: life * (0.7 + Math.random() * 0.6),
        size: 12 + Math.random() * 22,
        grow: 0.3,
        tint: Math.random() < 0.4 ? this.ember : this.enragedTint,
        blend: "add",
        alpha: 0.85,
      });
    }
  }

  /**
   * Dust off the floor: flat, wide, slow, and pushed outward along the ground.
   *
   * The counterweight to the sparks. Everything else the beast throws is hot
   * and goes up; this is cold and goes sideways, and it is what tells the eye
   * the fists arrived at a surface rather than at nothing.
   */
  dust(count, spread) {
    const tex = glowTexture();
    for (let i = 0; i < count; i++) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const v = (120 + Math.random() * 260) * spread;
      this.bits.spawn(tex, {
        x: this.rig.x + (Math.random() - 0.5) * 180,
        y: this.rig.y + this.feetY - 6,
        vx: dir * v,
        vy: -20 - Math.random() * 60,
        g: 60,
        drag: 2.2,
        life: 0.5 + Math.random() * 0.5,
        size: 60 + Math.random() * 110,
        // Flattened: a ground puff is an ellipse, and a round one reads as
        // smoke off something burning rather than dust off something landing.
        flat: 0.42,
        grow: 2.1,
        tint: SHADOW_TINT,
        alpha: 0.3 + Math.random() * 0.2,
      });
    }
  }

  enrage() {
    this.enraged = true;
    sfx.bossEnrage();
    this.aura.tint = this.painted ? 0xff2a6a : 0xff2a06;
    tweenValue(0, 1, 0.5, (v) => {
      this.tint = lerpColor(0xffffff, this.enragedTint, v);
    });
    this.pose.wob = 0.9;
    this.pose.wobT = 0;
    this.spawnShards(16, 1.3);
    this.blast(this.core, 26, 460, 0.7);
    this.dust(14, 1);
  }

  /**
   * Collapse into rubble.
   *
   * Not a fade of the whole figure at once: the legs go first — `crouch` is a
   * vertical crush about the floor line — the mass follows them down, and the
   * beast topples across its own axis on the way out. What is left is dust, and
   * a shadow that goes with it.
   */
  async die() {
    this.alive = false;
    sfx.bossDie();
    // Whatever attack was half-played when the last gem landed is over.
    killTweensOf(this.pose);
    const dir = Math.random() < 0.5 ? -1 : 1;

    this.spawnShards(26, 1.6);
    this.blast(this.core, 34, 520, 0.8);
    await Promise.all([
      tween(this.aura, { alpha: 1 }, 0.2),
      tween(this.aura.scale, { x: 2.4, y: 2.4 }, 0.5, { ease: Ease.quadOut }),
      // One last rear before it goes: the body straightens, the jaw opens, and
      // then nothing is holding it up.
      tween(this.pose, { breath: 1.18, jaw: 0.9, headY: -22 }, 0.26, {
        ease: Ease.backOut,
      }),
    ]);

    this.spawnShards(30, 2.2);
    this.dust(26, 1.6);
    await Promise.all([
      tween(
        this.pose,
        { crouch: 1, breath: 0.86, twist: dir * 1.4, lean: 26, jaw: 0.2 },
        0.42,
        { ease: Ease.quadIn },
      ),
      tween(this.rig, { alpha: 0 }, 0.4, { delay: 0.14 }),
      tween(this.aura, { alpha: 0 }, 0.5),
      // Nothing left standing, so nothing left casting one.
      tween(this.shadow, { alpha: 0 }, 0.44, { delay: 0.1 }),
    ]);
  }
}
