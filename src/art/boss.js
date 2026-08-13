/**
 * MAGMAROTH — the one thing the player must remember from this creative.
 * Obsidian golem rig, drawn in code, animated by parts.
 */

import { Container, Graphics, Sprite } from "pixi.js";
import { tween, delay, Ease, tweenValue } from "../core/tween.js";
import { glowTexture } from "./textures.js";
import { getRenderer } from "../core/context.js";
import { lerpColor } from "../core/color.js";

/** Colour the rig settles back to once phase 2 starts. */
const ENRAGED_TINT = 0xffa58c;
const ROCK = 0x2a1b28;
const ROCK_DARK = 0x150d16;
const ROCK_EDGE = 0x4a2f3c;
const LAVA = 0xff6a10;
const LAVA_HOT = 0xffd35a;

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

    this.head = this.buildHead();
    this.head.y = -178;
    this.rig.addChild(this.head);

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

  resize(layout) {
    this.scale.set(layout.boss.scale);
    this.homeX = layout.boss.x;
    this.homeY = layout.boss.y;
    this.x = this.homeX;
    this.y = this.homeY;
    this.riseFrom = layout.boss.floor - layout.boss.y + 320 * layout.boss.scale;
  }

  impactPoint() {
    return { x: this.x, y: this.y + 6 * this.scale.y };
  }

  update(dt) {
    if (!this.alive) return;
    this.t += dt;
    const rate = this.enraged ? 3.1 : 1.7;
    const amp = this.enraged ? 0.05 : 0.03;
    const s = Math.sin(this.t * rate);

    this.rig.scale.y = this.breath * (1 + s * amp);
    this.rig.scale.x = this.breath * (1 - s * amp * 0.5);
    this.rig.y = -s * 8 + this.lunge;

    this.head.rotation = Math.sin(this.t * 0.9) * 0.03;
    // The idle sway fades out as the arms are driven by an attack, so a raised
    // fist does not keep bobbing as if nothing were happening.
    const sway = 1 - Math.min(1, Math.abs(this.swing) * 3);
    this.armL.rotation = this.swing + Math.sin(this.t * 1.1) * 0.05 * sway;
    this.armR.rotation =
      -this.swing - Math.sin(this.t * 1.1 + 0.6) * 0.05 * sway;

    const flicker = 0.82 + Math.sin(this.t * 9.3) * 0.08;
    this.eyes.alpha = flicker;
    this.aura.alpha =
      (this.enraged ? 0.75 : 0.45) + Math.sin(this.t * 2.2) * 0.12;
    this.veins.alpha = this.enraged
      ? 0.95 + Math.sin(this.t * 6) * 0.05
      : 0.75 + Math.sin(this.t * 3) * 0.12;

    const pulse = Math.sin(this.t * (this.enraged ? 7 : 3.6));
    const coreBase = this.enraged ? 1.22 : 1;
    this.core.scale.set(coreBase * (1 + pulse * 0.05));
    this.coreGlow.alpha = (this.enraged ? 0.85 : 0.6) + pulse * 0.2;
  }

  async rise() {
    this.y = this.homeY + this.riseFrom;
    this.alpha = 1;
    await tween(this, { y: this.homeY }, 0.95, { ease: Ease.cubicOut });
  }

  async roar() {
    await Promise.all([
      tween(this.mouth.scale, { y: 2.1 }, 0.16, { ease: Ease.backOut }),
      tween(this, { breath: 1.1 }, 0.16),
      tween(this.head, { y: -196 }, 0.16),
    ]);
    await delay(0.34);
    await Promise.all([
      tween(this.mouth.scale, { y: 1 }, 0.3, { ease: Ease.quadOut }),
      tween(this, { breath: 1 }, 0.3),
      tween(this.head, { y: -178 }, 0.3),
    ]);
  }

  /** Where lava globs leave the boss: the mouth. */
  mouthPoint() {
    return {
      x: this.x,
      y: this.y + (this.head.y + this.mouth.y) * this.scale.y,
    };
  }

  /** Wind up and spit: the tell before obsidian lands on the board. */
  async spit() {
    await Promise.all([
      tween(this, { breath: 0.9 }, 0.18, { ease: Ease.quadOut }),
      tween(this.head, { y: -164 }, 0.18),
    ]);
    await Promise.all([
      tween(this.mouth.scale, { y: 2.4 }, 0.12, { ease: Ease.backOut }),
      tween(this, { breath: 1.12 }, 0.12),
      tween(this.head, { y: -186 }, 0.12),
    ]);
    tween(this.mouth.scale, { y: 1 }, 0.34, { delay: 0.18 });
    tween(this, { breath: 1 }, 0.3, { delay: 0.18 });
    tween(this.head, { y: -178 }, 0.3, { delay: 0.18 });
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
      tween(this, { breath: 0.88, lunge: -10 }, 0.24, { ease: Ease.quadOut }),
      tween(this.head, { y: -206 }, 0.24),
      tween(this.mouth.scale, { y: 0.55 }, 0.24),
    ]);

    // Exhale: throw the head forward and open up.
    await Promise.all([
      tween(this, { breath: 1.14, lunge: 18 }, 0.14, { ease: Ease.backOut }),
      tween(this.head, { y: -158 }, 0.14, { ease: Ease.backOut }),
      tween(this.mouth.scale, { x: 1.35, y: 3.2 }, 0.14, {
        ease: Ease.backOut,
      }),
    ]);

    tween(this.mouth.scale, { x: 1, y: 1 }, 0.32, { delay: h });
    tween(this, { breath: 1, lunge: 0 }, 0.36, { delay: h });
    tween(this.head, { y: -178 }, 0.36, { delay: h });
  }

  /** Where the fists land when the boss slams the floor. */
  fistPoint() {
    return { x: this.x, y: this.y + 190 * this.scale.y };
  }

  /**
   * Magma slam: both fists overhead, then down into the floor.
   * Resolves on the frame of impact so the shockwave and the damage go out
   * together; the rig springs back on its own afterwards.
   */
  async smash() {
    await Promise.all([
      tween(this, { swing: 1.05, breath: 1.08, lunge: -14 }, 0.28, {
        ease: Ease.quadOut,
      }),
      tween(this.head, { y: -198 }, 0.28),
    ]);
    // A held frame at the top: the tell that tells the player it is coming.
    await delay(0.12);

    await Promise.all([
      tween(this, { swing: -0.52, breath: 0.84, lunge: 30 }, 0.11, {
        ease: Ease.quadIn,
      }),
      tween(this.head, { y: -148 }, 0.11, { ease: Ease.quadIn }),
      tween(this.mouth.scale, { y: 2.2 }, 0.11, { ease: Ease.backOut }),
    ]);

    this.spawnShards(10, 0.9);
    tween(this, { swing: 0, breath: 1, lunge: 0 }, 0.55, {
      delay: 0.14,
      ease: Ease.elasticOut,
    });
    tween(this.head, { y: -178 }, 0.4, { delay: 0.14 });
    tween(this.mouth.scale, { y: 1 }, 0.34, { delay: 0.14 });
  }

  /** Reaction to taking a hit: flinch, flash, spit rock chips. */
  hit(power) {
    const p = power || 1;
    const rest = this.enraged ? ENRAGED_TINT : 0xffffff;
    tweenValue(0, 1, 0.3, (v) => {
      this.tint = lerpColor(0xfff0e0, rest, v);
    });

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
    this.aura.tint = 0xff2a06;
    tweenValue(0, 1, 0.5, (v) => {
      this.tint = lerpColor(0xffffff, ENRAGED_TINT, v);
    });
    this.spawnShards(14, 1.2);
  }

  /** Collapse into rubble. */
  async die() {
    this.alive = false;
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
    ]);
  }
}
