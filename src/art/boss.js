import { Container, Graphics, Mesh, PlaneGeometry, Sprite } from "pixi.js";
import { tween, delay, Ease, tweenValue, killTweensOf } from "../core/tween.js";
import { canvasTexture, glowTexture, sparkTexture } from "./textures.js";
import { getRenderer } from "../core/context.js";
import { lerpColor } from "../core/color.js";
import { BOSS_ART } from "../core/layout.js";
import * as sfx from "../audio/sfx.js";
import stillUrl from "../assets/boss/magmaroth.webp";

const ENRAGED_TINT = 0xffa58c;
const ENRAGED_PAINTED = 0xffa2cd;
const ROCK = 0x2a1b28;
const ROCK_DARK = 0x150d16;
const ROCK_EDGE = 0x4a2f3c;
const LAVA = 0xff6a10;
const LAVA_HOT = 0xffd35a;

const RUNE = 0xb43cff;
const RUNE_HOT = 0xff8ae8;

const SHADOW_TINT = 0x33304a;

const DEATH = {
  sear: 0.3,
  white: 0xfff4e2,
  land: 0.26,
  fade: 0.34,
  shards: 34,
  dust: 30,
  motes: 30,
};

const LAND = {
  wob: 0.95,
  hold: 0.06,
  dust: 30,
  shards: 12,
  spread: 1.5,
  dip: 0.22,
  give: 0.1,
  rebound: 0.6,
};

const MEND_TINT = 0x3fd16a;
const MEND_SKIN = 0xa8f5c4;

const ART_GRADE = 0xc6bdd8;

const STILL = {
  cell: { w: 900, h: 999 },
  anchor: { x: 441, y: 983 },
  rise: 982,
  span: 897,
};

const AX = STILL.anchor.x;
const AY = STILL.anchor.y;
const RISE = STILL.rise;
const SPAN_H = STILL.span / 2;

const K = Math.min(BOSS_ART.h / STILL.rise, BOSS_ART.w / STILL.span);

const FEET_Y = 189;

const STILL_H = STILL.rise * K;

const STILL_FEET = FEET_Y - (BOSS_ART.h - STILL_H) / 2;

const LIGHTS = {
  crown: { x: 429, y: 438 },
  maw: { x: 437, y: 510 },
  core: { x: 441, y: 605 },
};

const HEAD_REST = -178;

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

const ramp = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const bell = (v, c, r) => {
  const t = clamp01(1 - Math.abs(v - c) / r);
  return t * t * (3 - 2 * t);
};

const ANATOMY = {
  arm: (u, y) =>
    ramp(0.36, 0.8, Math.abs(u)) * ramp(230, 640, y) * (1 - ramp(670, 920, y)),
  head: (u, y) => bell(y, 420, 220) * (1 - ramp(0.42, 0.8, Math.abs(u))),
  jaw: (u, y) =>
    ramp(435, 560, y) *
    (1 - ramp(560, 715, y)) *
    (1 - ramp(0.16, 0.44, Math.abs(u))),
  chest: (u, y) => bell(y, 620, 140) * (1 - ramp(0.3, 0.72, Math.abs(u))),
  rider: (u, y) => bell(y, 120, 215) * (1 - ramp(0.55, 1, Math.abs(u))),
  foot: (u, y) => ramp(820, 985, y),
};

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

  if (P.wob !== 0) {
    y += Math.sin(P.wobT * 16.5 - fy * 5.4) * fy * 15 * P.wob;
    dx += Math.sin(P.wobT * 13 - fy * 4.1) * fy * 11 * P.wob;
  }

  y += P.lean * (0.22 + 0.78 * fy);

  if (P.twist !== 0) dx += P.twist * (fy2 * 52 - un * fy * 30);

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

  const damp = 1 - 0.85 * wFoot;
  out.x = AX + (cx - AX) * (1 + (P.hs - 1) * (1 - 0.45 * wFoot)) + dx * damp;
  out.y = y;
}

let painting = null;

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

class Bits extends Container {
  constructor() {
    super();
    this.live = [];
  }

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

    this.rig = new Container();
    this.addChild(this.rig);

    this.pose = {
      breath: 1,
      swing: 0,
      lean: 0,
      twist: 0,
      jaw: 0,
      headY: 0,
      headX: 0,
      charge: 0,
      crouch: 0,
      shove: 0,
      wob: 0,
      wobT: 0,
    };

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

    this.painted = !!painting;
    if (this.painted) this.buildPainted();
    else this.buildDrawn();

    this.auraRest = this.aura.tint;

    this.shadow.y = this.feetY - 8;

    this.bits = new Bits();
    this.addChild(this.bits);

    this.t = 0;
    this.hold = 0;
    this.emberDebt = 0;
    this.enraged = false;
    this.alive = true;
  }

  buildPainted() {
    this.aura.tint = RUNE;
    this.auraHome = this.rigY(AY - RISE * 0.55);
    this.aura.y = this.auraHome;
    this.aura.setSize(STILL.span * K * 1.55, STILL_H * 1.5);

    this.geo = new PlaneGeometry({
      width: STILL.cell.w,
      height: STILL.cell.h,
      verticesX: 19,
      verticesY: 25,
    });
    this.rest = Float32Array.from(this.geo.positions);
    this.bakeWeights();

    this.art = new Mesh({ geometry: this.geo, texture: painting });
    this.art.tint = ART_GRADE;
    this.art.scale.set(K);
    this.art.x = -AX * K;
    this.art.y = STILL_FEET - AY * K;
    this.rig.addChild(this.art);

    this.flash = new Mesh({ geometry: this.geo, texture: painting });
    this.flash.blendMode = "add";
    this.flash.alpha = 0;
    this.flash.scale.set(K);
    this.flash.x = this.art.x;
    this.flash.y = this.art.y;
    this.rig.addChild(this.flash);

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

    this.gather = new Container();
    this.gatherGlow = this.light(RUNE_HOT, 250, 210, 0);
    this.gather.addChild(this.gatherGlow);
    this.rig.addChild(this.gather);

    this.feetY = STILL_FEET;
    this.enragedTint = ENRAGED_PAINTED;
    this.ember = RUNE_HOT;

    this.glowGain = 0.5;

    this.applyPose();
    this.placeLights();
    this.gather.position.set(this.mouth.x, this.mouth.y);
  }

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

  rigY(cy) {
    return STILL_FEET - (AY - cy) * K;
  }

  placeLights() {
    const p = this.pt;
    this.warpToRig(LIGHTS.crown.x, LIGHTS.crown.y, p);
    this.eyes.position.set(p.x, p.y);
    this.warpToRig(LIGHTS.maw.x, LIGHTS.maw.y, p);
    this.mouth.position.set(p.x, p.y);
    this.warpToRig(LIGHTS.core.x, LIGHTS.core.y, p);
    this.core.position.set(p.x, p.y);
  }

  light(tint, w, h, alpha) {
    const g = new Sprite(glowTexture());
    g.anchor.set(0.5);
    g.blendMode = "add";
    g.tint = tint;
    g.alpha = alpha;
    g.setSize(w, h);
    return g;
  }

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

    g.poly([
      -152, -74, -190, 6, -168, 104, -110, 176, 110, 176, 168, 104, 190, 6, 152,
      -74, 66, -118, -66, -118,
    ]);
    g.fill({ color: ROCK });
    g.stroke({ width: 7, color: ROCK_DARK, alpha: 1 });

    g.poly([-96, -56, 96, -56, 118, 44, 0, 116, -118, 44]);
    g.fill({ color: 0x37232f });

    g.poly([-152, -74, -66, -118, -40, -40, -118, 0]);
    g.fill({ color: ROCK_EDGE, alpha: 0.35 });
    g.poly([152, -74, 66, -118, 40, -40, 118, 0]);
    g.fill({ color: ROCK_EDGE, alpha: 0.22 });
    g.poly([-110, 176, -168, 104, -60, 96, -30, 168]);
    g.fill({ color: 0x000000, alpha: 0.25 });
    g.poly([110, 176, 168, 104, 60, 96, 30, 168]);
    g.fill({ color: 0x000000, alpha: 0.25 });

    for (let i = -1; i <= 1; i += 2) {
      g.poly([i * 96, -104, i * 150, -172, i * 138, -84]);
      g.fill({ color: 0x3b2533 });
      g.stroke({ width: 5, color: ROCK_DARK });
    }

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

    g.circle(dir * 226, 122, 64);
    g.fill({ color: ROCK });
    g.stroke({ width: 7, color: ROCK_DARK });
    g.circle(dir * 226, 122, 34);
    g.fill({ color: 0x3b2533, alpha: 0.8 });

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
    skull.poly([-88, -20, 88, -20, 62, 6, -62, 6]);
    skull.fill({ color: 0x1d1220 });
    head.addChild(skull);

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

  toStage(px, py) {
    return {
      x: this.x + (this.rig.x + px) * this.scale.x,
      y: this.y + (this.rig.y + py) * this.scale.y,
    };
  }

  impactPoint() {
    if (!this.painted) return this.toStage(0, this.coreY);
    return this.toStage(this.core.x, this.core.y);
  }

  mouthPoint() {
    if (!this.painted) {
      return this.toStage(this.mouth.x, this.headNode.y + this.mouth.y);
    }
    return this.toStage(this.mouth.x, this.mouth.y);
  }

  fistPoint() {
    return this.toStage(0, this.feetY);
  }

  update(dt) {
    if (this.hold > 0) {
      this.hold -= dt;
      return;
    }
    if (!this.alive && this.rig.alpha <= 0.002) {
      this.bits.update(dt);
      return;
    }

    this.t += dt;
    const pose = this.pose;

    pose.wobT += dt;
    if (pose.wob > 0.0005) pose.wob *= Math.exp(-dt * 3.4);
    else pose.wob = 0;

    const rate = this.enraged ? 2.9 : 1.55;
    const bob =
      Math.sin(this.t * rate) * 0.62 +
      Math.sin(this.t * rate * 0.41 + 1.7) * 0.38;
    const amp = this.enraged ? 0.042 : 0.026;

    if (this.painted) this.updatePainted(dt, bob, amp, rate);
    else this.updateDrawn(bob, amp, rate);

    this.rig.x = pose.shove;

    const flicker = 0.82 + Math.sin(this.t * 9.3) * 0.08;
    const blinkT = (this.t * 0.31) % 1;
    const blink = blinkT > 0.94 ? 1 - Math.sin((blinkT - 0.94) * 62) * 0.8 : 1;
    this.eyes.alpha = flicker * blink * (1 + pose.charge * 1.9);
    if (this.alive) {
      this.aura.alpha =
        ((this.enraged ? 0.75 : 0.45) +
          Math.sin(this.t * 2.2) * 0.12 +
          pose.charge * 0.35) *
        this.glowGain;
    }

    const pulse = Math.sin(this.t * (this.enraged ? 7 : 3.6));
    const coreBase = this.enraged ? 1.22 : 1;
    this.core.scale.set(coreBase * (1 + pulse * 0.05 + pose.charge * 0.12));
    this.coreGlow.alpha =
      ((this.enraged ? 0.4 : 0.24) + pulse * 0.09 + pose.charge * 0.75) *
      this.glowGain;

    if (this.alive) {
      const sh = 1 - pose.swing * 0.09 + pose.lean * 0.0016 + pose.crouch * 0.1;
      this.shadow.scale.set(this.shadowBase.x * sh, this.shadowBase.y * sh);
      this.shadow.alpha = 0.58 * (1 - pose.swing * 0.18);
      this.emitEmbers(dt);
    }
    this.bits.update(dt);
  }

  updatePainted(dt, bob, amp, rate) {
    const pose = this.pose;
    const P = this.P;

    const vs =
      pose.breath *
      (1 + bob * amp) *
      (1 + pose.swing * 0.03) *
      (1 - pose.crouch * 0.45);
    P.vs = vs;
    P.hs = 1 + (1 - vs) * 0.5 + pose.crouch * 0.14;

    P.lean = pose.lean;
    P.twist = pose.twist;
    P.jaw = pose.jaw;
    P.headY = pose.headY + Math.sin(this.t * rate - 0.85) * 6.5;
    P.headX = pose.headX + Math.sin(this.t * 0.61) * 9;
    P.riderY =
      pose.headY * 0.35 +
      Math.sin(this.t * rate - 1.5) * 11 +
      pose.wob * Math.sin(pose.wobT * 11.5) * 26;
    P.riderX = Math.sin(this.t * 0.44 + 2.1) * 8 + pose.twist * 18;
    P.armY = -pose.swing * 195 + pose.wob * Math.sin(pose.wobT * 12 - 0.9) * 18;
    P.armX = -pose.swing * 46;
    P.chest = (vs - 1) * 160 + pose.charge * 14;
    P.tremor = pose.charge * 3.4 + (this.enraged ? 1.1 : 0);
    P.wob = pose.wob;
    P.wobT = pose.wobT;
    P.t = this.t;

    this.applyPose();
    this.placeLights();

    this.mouth.scale.set(1 + pose.jaw * 0.7, 1 + pose.jaw * 1.7);
    this.mouth.alpha = 1 + pose.jaw * 2.4 + pose.charge * 0.6;

    const c = clamp01(pose.charge);
    this.gatherGlow.alpha = c * c * 0.9;
    this.gather.scale.set(0.5 + c * 0.7);
    const k = Math.min(1, dt * 13);
    this.gather.x += (this.mouth.x - this.gather.x) * k;
    this.gather.y += (this.mouth.y + 10 - this.gather.y) * k;

    const ak = Math.min(1, dt * 5);
    this.aura.x += (this.core.x * 0.6 - this.aura.x) * ak;
    this.aura.y += (this.auraHome + pose.lean * 0.5 - this.aura.y) * ak;
  }

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

  emitEmbers(dt) {
    const pose = this.pose;
    const rate = (this.enraged ? 15 : 7) + pose.charge * 34;
    this.emberDebt += rate * dt;
    const tex = sparkTexture();
    while (this.emberDebt >= 1) {
      this.emberDebt -= 1;
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
    this.pose.wob = LAND.wob;
    this.pose.wobT = 0;
    this.hold = LAND.hold;
    this.dust(LAND.dust, LAND.spread);
    this.spawnShards(LAND.shards, LAND.spread);
    tween(this.pose, { crouch: LAND.dip }, LAND.give, {
      ease: Ease.quadOut,
    }).then(() =>
      tween(this.pose, { crouch: 0 }, LAND.rebound, { ease: Ease.elasticOut }),
    );
  }

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
    this.blast(this.mouth, 18, 300, 0.55);
    this.dust(10, 0.8);
    this.spawnShards(6, 0.7);
    await delay(0.34);
    await tween(
      this.pose,
      { jaw: 0, breath: 1, lean: 0, headY: 0, charge: 0 },
      0.34,
      { ease: Ease.quadOut },
    );
  }

  async spit() {
    sfx.bossSpit();
    await tween(
      this.pose,
      { breath: 0.9, headY: 16, jaw: 0.15, charge: 0.6, lean: -8 },
      0.18,
      { ease: Ease.quadOut },
    );
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

  async lavaBreath(hold) {
    const h = hold === undefined ? 0.55 : hold;

    await tween(
      this.pose,
      { breath: 0.86, lean: -18, charge: 0.85, jaw: 0.1, headY: -26 },
      0.26,
      { ease: Ease.quadOut },
    );
    sfx.bossBreath(h);

    await tween(
      this.pose,
      { breath: 1.16, lean: 34, charge: 1, jaw: 1, headY: 22 },
      0.14,
      { ease: Ease.backOut },
    );
    this.pose.wob = 0.7;
    this.pose.wobT = 0;
    this.blast(this.mouth, 14, 340, 0.55);

    tween(this.pose, { lean: 24, headY: 16 }, h, { ease: Ease.quadOut });
    tween(this.pose, { jaw: 0, breath: 1, lean: 0, headY: 0 }, 0.38, {
      delay: h,
      ease: Ease.quadOut,
    });
    tween(this.pose, { charge: 0 }, 0.3, { delay: h });
  }

  async smash() {
    await tween(
      this.pose,
      { swing: 0.95, breath: 1.08, lean: -16, charge: 0.45, headY: -18 },
      0.3,
      { ease: Ease.quadOut },
    );
    await delay(0.13);
    if (!this.alive) return;

    await tween(
      this.pose,
      { swing: -0.45, breath: 0.82, lean: 34, jaw: 0.8, headY: 28 },
      0.1,
      { ease: Ease.quadIn },
    );

    sfx.bossSmash();
    this.hold = 0.06;
    this.pose.wob = 1;
    this.pose.wobT = 0;
    this.spawnShards(12, 1);
    this.dust(22, 1.2);
    tween(this.pose, { swing: 0, breath: 1, lean: 0, headY: 0 }, 0.6, {
      delay: 0.14,
      ease: Ease.elasticOut,
    });
    tween(this.pose, { charge: 0 }, 0.2, { ease: Ease.quadOut });
    tween(this.pose, { jaw: 0 }, 0.3, { delay: 0.12, ease: Ease.quadOut });
  }

  async rake(side) {
    const dir =
      side === undefined ? (Math.random() < 0.5 ? -1 : 1) : side < 0 ? -1 : 1;

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
    this.blast(this.core, 12, 420, 0.45, dir);

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

  async mend(seconds) {
    const span = seconds === undefined ? 1.15 : seconds;
    const skin = () => (this.enraged ? this.enragedTint : 0xffffff);

    sfx.bossMend(span);

    this.aura.tint = MEND_TINT;

    const draw = span * 0.62;
    const from = skin();
    tweenValue(0, 1, draw, (v) => {
      this.tint = lerpColor(from, MEND_SKIN, v);
    });

    await tween(
      this.pose,
      { breath: 0.88, lean: -12, charge: 0.7, headY: -14, jaw: 0.25 },
      draw,
      { ease: Ease.quadOut },
    );
    if (!this.alive) {
      this.aura.tint = this.auraRest;
      return;
    }

    await tween(
      this.pose,
      { breath: 1.18, lean: 6, charge: 1, headY: -26, jaw: 0.6 },
      span * 0.16,
      { ease: Ease.backOut },
    );
    this.pose.wob = 0.5;
    this.pose.wobT = 0;

    const settle = span * 0.34;
    tweenValue(0, 1, settle, (v) => {
      this.tint = lerpColor(MEND_SKIN, skin(), v);
    });
    tween(
      this.pose,
      { breath: 1, lean: 0, charge: 0, headY: 0, jaw: 0 },
      settle,
      { ease: Ease.elasticOut },
    ).then(() => {
      this.aura.tint = this.auraRest;
    });

    await delay(settle * 0.5);
  }

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
    this.pose.headX = -dir * 12 * p;
    this.pose.wob = Math.min(1.1, 0.55 * p);
    this.pose.wobT = 0;
    tween(this.pose, { shove: 0, headX: 0 }, 0.44, { ease: Ease.elasticOut });
    this.spawnShards(6 + 4 * p, 1);
    this.blast(this.core, 10, 300, 0.4, -dir);
  }

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
    this.auraRest = this.painted ? 0xff2a6a : 0xff2a06;
    this.aura.tint = this.auraRest;
    tweenValue(0, 1, 0.5, (v) => {
      this.tint = lerpColor(0xffffff, this.enragedTint, v);
    });
    this.pose.wob = 0.9;
    this.pose.wobT = 0;
    this.spawnShards(16, 1.3);
    this.blast(this.core, 26, 460, 0.7);
    this.dust(14, 1);
  }

  async die() {
    this.alive = false;
    sfx.bossDie();
    killTweensOf(this.pose);
    const dir = Math.random() < 0.5 ? -1 : 1;

    this.spawnShards(26, 1.6);
    this.blast(this.core, 34, 520, 0.8);
    await Promise.all([
      tween(this.aura, { alpha: 1 }, 0.2),
      tween(this.aura.scale, { x: 2.4, y: 2.4 }, 0.5, { ease: Ease.quadOut }),
      tween(this.pose, { breath: 1.18, jaw: 0.9, headY: -22 }, 0.26, {
        ease: Ease.backOut,
      }),
    ]);

    this.spawnShards(30, 2.2);
    this.dust(26, 1.6);

    tweenValue(0, 1, DEATH.sear, (v) => {
      this.tint = lerpColor(DEATH.white, this.enragedTint, Ease.quadIn(v));
    });

    delay(DEATH.land).then(() => {
      if (this.destroyed) return;
      this.spawnShards(DEATH.shards, 2.6);
      this.dust(DEATH.dust, 2.1);
      this.blast(this.core, DEATH.motes, 620, 0.9);
    });

    await Promise.all([
      tween(
        this.pose,
        { crouch: 1, breath: 0.86, twist: dir * 1.4, lean: 26, jaw: 0.2 },
        0.42,
        { ease: Ease.quadIn },
      ),
      tween(this.rig, { alpha: 0 }, DEATH.fade, { delay: DEATH.land }),
      tween(this.aura, { alpha: 0 }, 0.5),
      tween(this.shadow, { alpha: 0 }, 0.44, { delay: 0.1 }),
    ]);
  }
}
