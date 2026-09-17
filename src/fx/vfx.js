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
  SPELL_ASPECT,
  SPELL_BY_ELEMENT,
  SPELL_TRAVEL_LAST,
  bossSpellFrames,
  spellFrames,
} from "../art/spells.js";
import { RAKE_ASPECT, rakeFrameAt, rakeFrames } from "../art/rake.js";
import { streamArt } from "../art/streams.js";
import { boltArt } from "../art/bolts.js";
import { POP_ASPECT, popFrames } from "../art/gempop.js";
import { CHARGE_ASPECT, chargeFrames } from "../art/gemcharge.js";
import { CROWN_CELL, readyCrownFrames } from "../art/readyfx.js";
import { FIRE, MEND_FX, ULT_CALL, ULT_FX } from "../config.js";

const MAX_PARTICLES = 180;

const CONE_STEPS = 16;

const CONE_CAP = 7;

function paintCone(g, c, t) {
  const { len, mouth, spread, wob, seed } = c;
  const feather = c.feather || 1;

  const outline = (narrow, shorten) => {
    const l = len * (1 - shorten);
    const halfAt = (p) =>
      (mouth + (spread - mouth) * p ** 0.78) * 0.5 * (1 - narrow * p);
    const side = (i, sgn) => {
      const p = i / CONE_STEPS;
      const n =
        Math.sin(p * 9.1 + t * 11 + seed) * 0.55 +
        Math.sin(p * 17.3 - t * 7.3 + seed * 2.1) * 0.3 +
        Math.sin(p * 31.7 + t * 19 + seed * 3.7) * 0.15;
      const grip = Math.min(1, p * 2.4) * Math.min(1, (1 - p) * 4);
      return [l * p, sgn * halfAt(p) * (1 + n * wob * grip)];
    };

    const pts = [];
    for (let i = 0; i <= CONE_STEPS; i++) pts.push(...side(i, -1));
    const halfEnd = halfAt(1);
    const bulge = spread * 0.1 * (1 - narrow);
    for (let j = 1; j < CONE_CAP; j++) {
      const a = -Math.PI / 2 + (Math.PI * j) / CONE_CAP;
      pts.push(l + Math.cos(a) * bulge, Math.sin(a) * halfEnd);
    }
    for (let i = CONE_STEPS; i >= 0; i--) pts.push(...side(i, 1));
    return pts;
  };

  g.clear();
  for (let j = 0; j < feather; j++) {
    const f = j / feather;
    g.poly(outline(f * 0.5, f * 0.16));
    g.fill({ color: c.color, alpha: c.alpha / feather });
  }
}

function paintGlob(g, r) {
  const N = 9;
  const shape = [];
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2;
    shape.push([Math.cos(a), Math.sin(a), rndRange(0.78, 1.16)]);
  }
  const ring = (k) =>
    shape.flatMap(([cx, cy, j]) => [cx * r * k * j, cy * r * k * j]);

  g.poly(ring(1));
  g.fill({ color: 0x4a1000 });
  g.poly(ring(0.74));
  g.fill({ color: 0xff5e0c });
  g.poly(ring(0.4));
  g.fill({ color: 0xffd76a });
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

  burst(x, y, color, count, power) {
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

  pop(x, y, color, size) {
    const frames = popFrames();
    if (!frames) return false;
    if (this.field.children.length >= MAX_PARTICLES) return false;

    const s = new Sprite(frames[0]);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = color;
    s.x = x;
    s.y = y;
    const w = size || 96;
    s.setSize(w, w / POP_ASPECT);
    this.field.addChild(s);

    tweenValue(0, 1, 0.34, (p) => {
      s.texture = frames[Math.min(frames.length - 1, (p * frames.length) | 0)];
      const k = w * (1 + p * 0.35);
      s.setSize(k, k / POP_ASPECT);
      s.alpha = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
    }).then(() => s.destroy());

    return true;
  }

  charge(x, y, color, size, life) {
    const frames = chargeFrames();
    if (!frames) return false;
    if (this.field.children.length >= MAX_PARTICLES) return false;

    const s = new Sprite(frames[0]);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = color;
    s.x = x;
    s.y = y;
    const w = size || 128;
    s.setSize(w * 0.86, (w * 0.86) / CHARGE_ASPECT);
    this.field.addChild(s);

    tweenValue(0, 1, life || 0.32, (p) => {
      s.texture = frames[Math.min(frames.length - 1, (p * frames.length) | 0)];
      const k = w * (0.86 + p * 0.3);
      s.setSize(k, k / CHARGE_ASPECT);
    }).then(() => s.destroy());

    return true;
  }

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

  ember(x, y, size, color) {
    if (this.field.children.length >= MAX_PARTICLES) return;
    const s = new Sprite(glowTexture());
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = color;
    s.x = x;
    s.y = y;
    s.setSize(size, size);
    s.alpha = 0.55;
    this.field.addChild(s);
    tween(s.scale, { x: s.scale.x * 0.4, y: s.scale.y * 0.4 }, 0.34, {
      ease: Ease.quadOut,
    });
    tween(s, { alpha: 0 }, 0.34).then(() => {
      if (!s.destroyed) s.destroy();
    });
  }

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

  async stream(element, from, to, color, opts) {
    const art = streamArt(element);
    if (!art) return false;
    const frames = art.frames;

    const o = opts || {};
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    const thickness = o.thickness || 120;
    const reach = dist * (o.reach || ULT_FX.streamReach);
    const muzzle = thickness * art.aspect * 0.22;
    const rush = o.rush || ULT_FX.streamRush;
    const hold = o.hold || ULT_FX.streamHold;
    const fps = o.fps || ULT_FX.streamFps;
    const span = rush + hold;

    const jet = new Sprite(frames[0]);
    jet.blendMode = art.blend;
    jet.anchor.set(0, 0.5);
    jet.x = from.x;
    jet.y = from.y;
    jet.rotation = Math.atan2(dy, dx);
    jet.setSize(muzzle, thickness);
    this.field.addChild(jet);

    const running = tweenValue(0, 1, span, (p) => {
      if (jet.destroyed) return;
      const t = p * span;
      jet.texture = frames[Math.min(frames.length - 1, Math.floor(t * fps))];
      const out = t < rush ? Ease.cubicOut(t / rush) : 1;
      jet.setSize(muzzle + (reach - muzzle) * out, thickness);
    });

    await delay(rush);
    this.impact(to, color, o.impact || 2.4);
    running.then(() => {
      if (jet.destroyed) return;
      tween(jet, { alpha: 0 }, 0.18).then(() => {
        if (!jet.destroyed) jet.destroy();
      });
    });
    return true;
  }

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

  async spell(element, from, to, color, opts) {
    const o = opts || {};

    const frames = spellFrames(SPELL_BY_ELEMENT[element]);
    if (!frames) {
      if (element === FIRE) return this.fireball(from, to, color, o);
      return this.beam(from, to, color, { ...o, ...(o.beam || {}) });
    }

    return this.paintedBolt(
      {
        frames,
        aspect: SPELL_ASPECT,
        lead: null,
        travelLast: SPELL_TRAVEL_LAST,
      },
      from,
      to,
      color,
      o,
    );
  }

  async ultCast(element, from, to, color, light, opts) {
    const o = opts || {};
    const size = o.size || 420;

    await this.ultGather(from, color, light, size * ULT_FX.gatherSize);
    this.ultMuzzle(from, to, color, size);

    const lance = boltArt(element);

    if (
      !lance &&
      (await this.stream(element, from, to, color, {
        thickness: size * ULT_FX.streamThick,
        ...(o.stream || {}),
      }))
    ) {
      this.ultShock(to, from, color, light, size);
      return;
    }

    this.ultLance(from, to, light, size);

    const frames = spellFrames(SPELL_BY_ELEMENT[element]);
    if (!frames && !lance) {
      if (element === FIRE) await this.fireball(from, to, color, o);
      else await this.beam(from, to, color, { ...o, ...(o.beam || {}) });
      this.ultShock(to, from, color, light, size);
      return;
    }

    const bolt = new Sprite(lance ? lance.frames[0] : frames[0]);
    bolt.anchor.set(lance ? 1 : 0.5, 0.5);
    if (lance) bolt.rotation = Math.atan2(to.y - from.y, to.x - from.x);
    if (lance && lance.tint != null) bolt.tint = lance.tint;
    bolt.blendMode = "add";
    bolt.x = from.x;
    bolt.y = from.y;
    this.field.addChild(bolt);

    const lead = new Sprite(glowTexture());
    lead.anchor.set(0.5);
    lead.blendMode = "add";
    lead.tint = color;
    lead.alpha = 0.5;
    lead.setSize(size * 0.45, size * 0.45);
    this.field.addChild(lead);

    let last = { x: from.x, y: from.y };
    let drop = 0;

    await tweenValue(0, 1, o.travel || ULT_FX.travel, (p) => {
      if (bolt.destroyed) return;
      const e = p * 0.45 + Ease.quadIn(p) * 0.55;
      bolt.x = from.x + (to.x - from.x) * e;
      bolt.y = from.y + (to.y - from.y) * e;
      lead.x = bolt.x;
      lead.y = bolt.y;

      if (lance) {
        const len = size * (ULT_FX.boltLong + e * ULT_FX.boltSwell);
        const n = lance.frames.length;
        if (n > 1) bolt.texture = lance.frames[Math.min(n - 1, (p * n) | 0)];
        bolt.setSize(len, len / lance.aspect);
      } else {
        const w = size * (ULT_FX.boltSize + e * ULT_FX.boltSwell);
        const i = Math.floor(e * (SPELL_TRAVEL_LAST + 1));
        bolt.texture = frames[Math.min(SPELL_TRAVEL_LAST, i)];
        bolt.setSize(w, w / SPELL_ASPECT);
      }

      drop += Math.hypot(bolt.x - last.x, bolt.y - last.y);
      if (drop >= ULT_FX.trailGap) {
        drop = 0;
        this.ember(
          bolt.x + rndRange(-10, 10),
          bolt.y + rndRange(-10, 10),
          size * ULT_FX.trailSize * rndRange(0.6, 1.1),
          color,
        );
      }
      last = { x: bolt.x, y: bolt.y };
    });

    tween(lead, { alpha: 0 }, 0.24).then(() => lead.destroy());

    bolt.x = to.x;
    bolt.y = to.y;
    if (lance) {
      if (!frames) {
        tween(bolt, { alpha: 0 }, 0.2).then(() => bolt.destroy());
        this.ultShock(to, from, color, light, size);
        return;
      }
      bolt.rotation = 0;
      bolt.anchor.set(0.5);
      bolt.tint = 0xffffff;
    }
    const first = SPELL_TRAVEL_LAST + 1;
    const n = frames.length - first;
    tweenValue(0, 1, o.blast || 0.52, (p) => {
      if (bolt.destroyed) return;
      const w = size * ULT_FX.blastScale * (1 + p * 0.35);
      bolt.texture = frames[first + Math.min(n - 1, Math.floor(p * n))];
      bolt.setSize(w, w / SPELL_ASPECT);
      bolt.alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    }).then(() => bolt.destroy());

    this.ultShock(to, from, color, light, size);
  }

  async ultGather(at, color, light, size) {
    const core = new Sprite(glowTexture());
    core.anchor.set(0.5);
    core.blendMode = "add";
    core.tint = light;
    core.x = at.x;
    core.y = at.y;
    core.setSize(size, size);
    core.alpha = 0;
    this.field.addChild(core);
    const base = { x: core.scale.x, y: core.scale.y };
    tweenValue(0, 1, ULT_FX.gather * 1.3, (p) => {
      if (core.destroyed) return;
      const k = 0.2 + Ease.expoOut(p) * 1.1;
      core.scale.set(base.x * k, base.y * k);
      core.alpha = p < 0.7 ? p / 0.7 : 1 - (p - 0.7) / 0.3;
    }).then(() => core.destroy());

    const room = MAX_PARTICLES - this.field.children.length;
    const n = Math.min(ULT_FX.gatherMotes, Math.max(0, room));
    for (let i = 0; i < n; i++) {
      const mote = new Sprite(sparkTexture());
      mote.anchor.set(0.5);
      mote.blendMode = "add";
      mote.tint = i % 3 === 0 ? 0xffffff : color;
      const w = rndRange(14, 30);
      mote.setSize(w, w);
      const a = rndRange(0, Math.PI * 2);
      const dist = size * ULT_FX.gatherReach * rndRange(0.55, 1);
      mote.x = at.x + Math.cos(a) * dist;
      mote.y = at.y + Math.sin(a) * dist;
      this.field.addChild(mote);
      const life = ULT_FX.gather * rndRange(0.7, 1.05);
      tween(mote, { x: at.x, y: at.y }, life, { ease: Ease.quadIn });
      tween(mote.scale, { x: 0, y: 0 }, life, { ease: Ease.quadIn }).then(() =>
        mote.destroy(),
      );
    }

    await delay(ULT_FX.gather);
  }

  ultMuzzle(from, to, color, size) {
    const ang = Math.atan2(to.y - from.y, to.x - from.x);
    const w = size * ULT_FX.muzzle;

    [
      { tint: color, scale: 1, alpha: 0.95 },
      { tint: 0xffffff, scale: 0.5, alpha: 1 },
    ].forEach(({ tint, scale, alpha }) => {
      const flare = new Sprite(glowTexture());
      flare.anchor.set(0.5);
      flare.blendMode = "add";
      flare.tint = tint;
      flare.x = from.x;
      flare.y = from.y;
      flare.rotation = ang;
      flare.setSize(w * 1.6 * scale, w * scale);
      this.field.addChild(flare);
      const base = { x: flare.scale.x, y: flare.scale.y };
      tweenValue(0, 1, ULT_FX.muzzleLife, (p) => {
        if (flare.destroyed) return;
        const k = 0.45 + Ease.expoOut(p) * 1.15;
        flare.scale.set(base.x * k, base.y * k);
        flare.alpha = alpha * (p < 0.15 ? p / 0.15 : 1 - (p - 0.15) / 0.85);
      }).then(() => flare.destroy());
    });
  }

  ultLance(from, to, color, size) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    const rot = Math.atan2(dy, dx);

    [
      { tint: color, thick: ULT_FX.lanceThick, alpha: 0.85 },
      { tint: 0xffffff, thick: ULT_FX.lanceThick * ULT_FX.lanceCore, alpha: 1 },
    ].forEach(({ tint, thick, alpha }) => {
      const lance = new Sprite(beamTexture());
      lance.anchor.set(0, 0.5);
      lance.blendMode = "add";
      lance.tint = tint;
      lance.alpha = alpha;
      lance.x = from.x;
      lance.y = from.y;
      lance.rotation = rot;
      lance.setSize(len, size * thick);
      this.field.addChild(lance);
      tween(lance.scale, { y: lance.scale.y * 0.12 }, ULT_FX.lanceLife, {
        ease: Ease.quadOut,
      });
      tween(lance, { alpha: 0 }, ULT_FX.lanceLife).then(() => lance.destroy());
    });
  }

  ultShock(at, from, color, light, size) {
    const ring = new Graphics();
    ring.circle(0, 0, 50);
    ring.stroke({ width: ULT_FX.shockWidth, color: light, alpha: 1 });
    ring.x = at.x;
    ring.y = at.y;
    ring.blendMode = "add";
    ring.scale.set(0.15);
    this.field.addChild(ring);
    const reach = (size * ULT_FX.shockReach) / 100;
    tween(ring.scale, { x: reach, y: reach * 0.72 }, ULT_FX.shockLife, {
      ease: Ease.expoOut,
    });
    tween(ring, { alpha: 0 }, ULT_FX.shockLife).then(() => ring.destroy());

    const incoming = Math.atan2(at.y - from.y, at.x - from.x);
    const room = MAX_PARTICLES - this.field.children.length;
    const n = Math.min(ULT_FX.sparks, Math.max(0, room));
    for (let i = 0; i < n; i++) {
      const spark = new Sprite(sparkTexture());
      spark.anchor.set(0.5);
      spark.blendMode = "add";
      spark.tint = i % 4 === 0 ? 0xffffff : color;
      const w = rndRange(12, 34);
      spark.setSize(w, w);
      spark.x = at.x;
      spark.y = at.y;
      this.field.addChild(spark);
      const out = incoming + Math.PI + rndRange(-1.3, 1.3);
      const dist = rndRange(60, 240);
      tween(
        spark,
        { x: at.x + Math.cos(out) * dist, y: at.y + Math.sin(out) * dist },
        0.5,
        { ease: Ease.quadOut },
      );
      tween(spark.scale, { x: 0, y: 0 }, 0.5, { ease: Ease.quadIn }).then(() =>
        spark.destroy(),
      );
    }
  }

  ultSummon(cells, to, color, light, size, cell) {
    const cfg = ULT_CALL.summon;
    if (!cells.length || !size) return;

    let cx = 0;
    let cy = 0;
    cells.forEach((p) => {
      cx += p.x;
      cy += p.y;
    });
    const from = { x: cx / cells.length, y: cy / cells.length };

    this.beam(from, to, color, {
      thickness: (cell || size) * cfg.thickness,
      travel: cfg.travel,
      impact: cfg.impact,
    });

    const picks = cells.slice(0, cfg.motes);
    picks.forEach((seed, i) => {
      if (MAX_PARTICLES - this.field.children.length <= 0) return;

      const head = new Sprite(glowTexture());
      head.anchor.set(0.5);
      head.blendMode = "add";
      head.tint = light;
      const w = size * cfg.head;
      head.setSize(w, w);
      head.x = seed.x;
      head.y = seed.y;
      head.alpha = 0;
      this.field.addChild(head);

      const core = new Sprite(sparkTexture());
      core.anchor.set(0.5);
      core.blendMode = "add";
      core.tint = 0xffffff;
      core.setSize(w * 0.5, w * 0.5);
      core.x = seed.x;
      core.y = seed.y;
      core.alpha = 0;
      this.field.addChild(core);

      const drop = to.y - seed.y;
      const side = (i % 2 ? 1 : -1) * rndRange(0.5, 1) * cfg.bow;
      const bowX = (seed.x + to.x) / 2 + drop * side;
      const bowY = seed.y + drop * 0.5;

      let lastX = seed.x;
      let lastY = seed.y;

      delay(i * cfg.stagger).then(() => {
        if (head.destroyed) return;
        tweenValue(0, 1, cfg.dur, (p) => {
          const q = 1 - p;
          const x = q * q * seed.x + 2 * q * p * bowX + p * p * to.x;
          const y = q * q * seed.y + 2 * q * p * bowY + p * p * to.y;
          head.x = x;
          head.y = y;
          core.x = x;
          core.y = y;
          const fade = p < 0.12 ? p / 0.12 : 1;
          head.alpha = fade;
          core.alpha = fade;
          const k = w * (1 - p * 0.35);
          head.setSize(k, k);
          core.setSize(k * 0.5, k * 0.5);
          if (Math.hypot(x - lastX, y - lastY) >= cfg.trail) {
            lastX = x;
            lastY = y;
            this.ember(x, y, k * 0.9, color);
          }
        }).then(() => {
          head.destroy();
          core.destroy();
          this.burst(to.x, to.y, light, 5, 0.9);
          if (i === picks.length - 1)
            this.ring(to.x, to.y, light, size * cfg.land, 6);
        });
      });
    });
  }

  ultBeckon(at, element, color, light, w, h, urgent) {
    const cfg = ULT_CALL.beckon;
    const grow = urgent ? cfg.urgentGrow : 1;

    const top = at.y - h * 0.44;

    const shaft = new Sprite(glowTexture());
    shaft.anchor.set(0.5, 1);
    shaft.blendMode = "add";
    shaft.tint = color;
    shaft.x = at.x;
    shaft.y = top;
    shaft.alpha = 0;
    this.field.addChild(shaft);

    const sw = w * cfg.shaft.w * grow;
    const sh = h * cfg.shaft.h * grow;
    tweenValue(0, 1, cfg.shaft.dur, (p) => {
      const rise = p < 0.45 ? p / 0.45 : 1;
      shaft.setSize(sw * (0.7 + rise * 0.3), sh * rise);
      shaft.alpha = cfg.shaft.alpha * (p < 0.45 ? rise : 1 - (p - 0.45) / 0.55);
    }).then(() => shaft.destroy());

    this.ring(at.x, at.y, light, w * cfg.ring.size * grow, cfg.ring.width);

    const frames = readyCrownFrames(element);
    if (!frames) return;

    const lick = new Sprite(frames[0]);
    lick.anchor.set(0.5, 1);
    lick.blendMode = "add";
    lick.tint = light;
    const lh = h * cfg.lick.h * grow;
    lick.setSize(lh * CROWN_CELL.aspect, lh);
    lick.x = at.x;
    lick.y = top;
    lick.alpha = cfg.lick.alpha;
    this.field.addChild(lick);

    tweenValue(0, 1, cfg.lick.dur, (p) => {
      lick.texture =
        frames[Math.min(frames.length - 1, (p * frames.length) | 0)];
      lick.y = top - h * cfg.lick.rise * p;
      lick.alpha = cfg.lick.alpha * (p < 0.5 ? 1 : 1 - (p - 0.5) / 0.5);
    }).then(() => lick.destroy());
  }

  bossSwing(kind, at, opts) {
    const frames = bossSpellFrames(kind);
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
      if (o.mirror) s.scale.x = -s.scale.x;
      s.alpha = base * (p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3);
    }).then(() => s.destroy());

    return true;
  }

  async mend(at, opts) {
    const o = opts || {};
    const size = o.size || 420;
    const seconds = o.duration || MEND_FX.seconds;
    const color = o.color === undefined ? MEND_FX.green : o.color;
    const light = o.light === undefined ? MEND_FX.light : o.light;

    this.bossSwing("mend", at, {
      size: size * MEND_FX.sheet,
      duration: seconds * 0.82,
      alpha: 0.92,
      grow: MEND_FX.grow,
    });

    const layers = [
      { tint: color, span: MEND_FX.halo, top: MEND_FX.haloAlpha, grow: 1.1 },
      { tint: MEND_FX.core, span: MEND_FX.heart, top: 1, grow: 0.7 },
    ].map(({ tint, span, top, grow }) => {
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.blendMode = "add";
      s.tint = tint;
      s.x = at.x;
      s.y = at.y;
      s.setSize(size * span, size * span);
      s.alpha = 0;
      this.field.addChild(s);
      return { s, top, grow, seed: { x: s.scale.x, y: s.scale.y } };
    });

    tweenValue(0, 1, seconds, (p) => {
      const swell =
        p < MEND_FX.peak
          ? Ease.quadIn(p / MEND_FX.peak)
          : 1 - Ease.quadIn((p - MEND_FX.peak) / (1 - MEND_FX.peak));
      layers.forEach(({ s, top, grow, seed }) => {
        if (s.destroyed) return;
        const k = 0.5 + swell * grow;
        s.scale.set(seed.x * k, seed.y * k);
        s.alpha = (p < 0.14 ? p / 0.14 : 1) * top * (0.2 + swell * 0.8);
      });
    }).then(() => layers.forEach(({ s }) => s.destroy()));

    this.mendMotes(at, size, color, light, seconds);
    this.mendCinch(at, size, color, seconds);

    await delay(seconds);
  }

  mendMotes(at, size, color, light, seconds) {
    const room = MAX_PARTICLES - this.field.children.length;
    const n = Math.min(MEND_FX.motes, Math.max(0, room));

    for (let i = 0; i < n; i++) {
      const mote = new Sprite(sparkTexture());
      mote.anchor.set(0.5);
      mote.blendMode = "add";
      mote.tint = i % 4 === 0 ? light : color;
      const w = rndRange(12, 26);
      mote.setSize(w, w);
      const a = rndRange(0, Math.PI * 2);
      const reach = size * MEND_FX.reach * rndRange(0.6, 1.15);
      mote.x = at.x + Math.cos(a) * reach;
      mote.y = at.y + Math.sin(a) * reach * 0.82;
      mote.alpha = 0;
      this.field.addChild(mote);

      const lead = (i / n) * seconds * MEND_FX.stagger;
      const life = (seconds - lead) * rndRange(0.62, 0.86);
      tween(mote, { alpha: 1 }, Math.min(0.2, life * 0.4), { delay: lead });
      tween(mote, { x: at.x, y: at.y }, life, {
        delay: lead,
        ease: Ease.quadIn,
      });
      tween(mote.scale, { x: 0, y: 0 }, life, {
        delay: lead,
        ease: Ease.quadIn,
      }).then(() => {
        if (!mote.destroyed) mote.destroy();
      });
    }
  }

  mendCinch(at, size, color, seconds) {
    for (let i = 0; i < MEND_FX.rings; i++) {
      const g = new Graphics();
      g.circle(0, 0, 50);
      g.stroke({ width: MEND_FX.ringWidth - i * 1.2, color, alpha: 1 });
      g.x = at.x;
      g.y = at.y;
      g.blendMode = "add";
      g.scale.set((size * MEND_FX.reach * (1 - i * 0.22)) / 100);
      g.alpha = 0;
      this.field.addChild(g);

      const lead = i * seconds * 0.16;
      const life = seconds * MEND_FX.peak - lead;
      tween(g, { alpha: MEND_FX.ringAlpha }, Math.min(0.24, life * 0.5), {
        delay: lead,
      });
      tween(g.scale, { x: 0.12, y: 0.12 }, life, {
        delay: lead,
        ease: Ease.quadIn,
      });
      tween(g, { alpha: 0 }, life * 0.42, {
        delay: lead + life * 0.58,
      }).then(() => {
        if (!g.destroyed) g.destroy();
      });
    }
  }

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
    s.rotation = leadAngle === null ? 0 : angle - leadAngle;
    this.field.addChild(s);

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

    s.rotation = 0;
    s.x = to.x;
    s.y = to.y;
    const blast = o.blast || 0.52;
    tweenValue(0, 1, blast, (p) => {
      const i = travelLast + 1;
      const n = frames.length - i;
      show(i + Math.min(n - 1, Math.floor(p * n)), size * (1 + p * 0.35));
      s.alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    }).then(() => s.destroy());
  }

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

  async flash(color, alpha, dur) {
    this.flashRect.tint = color === undefined ? 0xffffff : color;
    this.flashRect.alpha = alpha === undefined ? 0.9 : alpha;
    await tween(this.flashRect, { alpha: 0 }, dur || 0.5, {
      ease: Ease.quadOut,
    });
  }

  async lob(from, to, color, opts) {
    const o = opts || {};
    const dur = o.duration || 0.5;

    const glob = new Sprite(glowTexture());
    glob.anchor.set(0.5);
    glob.blendMode = "add";
    glob.tint = color;
    const size = o.size || 54;
    glob.setSize(size, size);
    const base = glob.scale.x;
    glob.x = from.x;
    glob.y = from.y;
    this.field.addChild(glob);

    const core = new Graphics();
    paintGlob(core, size * 0.3);
    core.x = from.x;
    core.y = from.y;
    this.field.addChild(core);

    const peak = Math.min(from.y, to.y) - (o.arc || 140);

    let tick = 0;
    let lastX = from.x;
    let lastY = from.y;
    await tweenValue(
      0,
      1,
      dur,
      (t) => {
        const x = from.x + (to.x - from.x) * t;
        const inv = 1 - t;
        const y = inv * inv * from.y + 2 * inv * t * peak + t * t * to.y;
        glob.x = x;
        glob.y = y;
        core.x = x;
        core.y = y;
        core.rotation += 0.34;

        const vx = x - lastX;
        const vy = y - lastY;
        const speed = Math.sqrt(vx * vx + vy * vy);
        if (speed > 0.01) {
          glob.rotation = Math.atan2(vy, vx);
          glob.scale.set(
            base * (1 + Math.min(0.55, speed * 0.02)),
            base * 0.92,
          );
        }
        lastX = x;
        lastY = y;

        if (tick++ % 3 === 0) {
          this.ember(
            x,
            y,
            size * rndRange(0.22, 0.4),
            tick % 2 ? 0xff8a10 : color,
          );
        }
      },
      { delay: o.delay || 0, ease: Ease.linear },
    );

    this.burst(to.x, to.y, color, 9, 1.3);
    this.ring(to.x, to.y, color, 130, 6);
    glob.destroy();
    core.destroy();
  }

  async cone(from, to, color, opts) {
    const o = opts || {};
    const hold = o.hold === undefined ? 0.5 : o.hold;
    const heat = o.heat === undefined ? 1 : o.heat;
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

    const spec = [
      {
        len,
        mouth: mouth * 1.12,
        spread: spread * 1.02,
        color: 0x8e1f05,
        alpha: 0.5 * heat,
        add: false,
        wob: 0.3,
        seed: 0,
        feather: 5,
      },
      {
        len: len * 0.97,
        mouth: mouth * 0.94,
        spread: spread * 0.86,
        color: 0xff4408,
        alpha: 0.44 * heat,
        add: true,
        wob: 0.27,
        seed: 1.7,
        feather: 4,
      },
      {
        len: len * 0.8,
        mouth: mouth * 0.64,
        spread: spread * 0.48,
        color: 0xff9c22,
        alpha: 0.3 * heat,
        add: true,
        wob: 0.22,
        seed: 3.4,
        feather: 3,
      },
      {
        len: len * 0.4,
        mouth: mouth * 0.42,
        spread: spread * 0.16,
        color: 0xffeeb0,
        alpha: 0.28 * heat,
        add: true,
        wob: 0.17,
        seed: 5.1,
        feather: 2,
      },
    ];
    const layers = spec.map((c) => {
      const g = new Graphics();
      paintCone(g, c, 0);
      if (c.add) g.blendMode = "add";
      flame.addChild(g);
      return g;
    });

    const throat = new Sprite(glowTexture());
    throat.anchor.set(0.5);
    throat.blendMode = "add";
    throat.tint = 0xffd487;
    throat.alpha = 0.55 * heat;
    const throatW = throat.texture.width || 256;
    throat.scale.set((mouth * 2.1) / throatW);
    flame.addChild(throat);

    flame.scale.set(0.05, 0.5);
    await Promise.all([
      tween(flame.scale, { x: 1 }, 0.15, { ease: Ease.quadOut }),
      tween(flame.scale, { y: 1 }, 0.2, { ease: Ease.backOut }),
    ]);

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

    const tongues = this.flameTongues(flame, len, mouth, spread, hold, heat);

    await tweenValue(
      0,
      hold,
      hold,
      (t) => {
        if (flame.destroyed) return;
        for (let i = 0; i < layers.length; i++) {
          paintCone(layers[i], spec[i], t);
          layers[i].alpha = 0.82 + Math.sin(t * (41 + i * 13) + i * 1.7) * 0.18;
        }
        throat.alpha = (0.46 + Math.sin(t * 53) * 0.16) * heat;
        flame.scale.y = 1 + Math.sin(t * 31) * 0.07;
      },
      { ease: Ease.linear },
    );

    await Promise.all([
      tween(flame, { alpha: 0 }, 0.22),
      tween(flame.scale, { x: 0.7, y: 0.6 }, 0.22, { ease: Ease.quadIn }),
      embers,
      tongues,
    ]);
    flame.destroy({ children: true });
  }

  async flameTongues(flame, len, mouth, spread, hold, heat) {
    const widthAt = (d) => mouth + (spread - mouth) * d;
    const until = hold + 0.12;

    for (let step = 0; step * 0.055 < until; step++) {
      if (flame.destroyed) return;
      for (let i = 0; i < 2; i++) {
        if (this.field.children.length >= MAX_PARTICLES) break;
        const s = new Sprite(glowTexture());
        s.anchor.set(0.5);
        s.blendMode = "add";
        s.tint = i % 2 ? 0xff7a18 : 0xffc65a;
        const tex = s.texture.width || 256;
        const d0 = rndRange(0.05, 0.24);
        const d1 = rndRange(0.82, 1.06);
        const w0 = widthAt(d0) * rndRange(0.55, 0.95);
        const w1 = widthAt(d1) * rndRange(0.6, 1.05);
        s.scale.set(w0 / tex);
        s.x = len * d0;
        s.y = rndRange(-0.3, 0.3) * widthAt(d0);
        s.alpha = 0;
        flame.addChild(s);

        const life = rndRange(0.24, 0.4);
        tween(s, { alpha: rndRange(0.22, 0.44) * heat }, life * 0.35);
        tween(
          s,
          { x: len * d1, y: s.y + rndRange(-0.22, 0.22) * spread },
          life,
          {
            ease: Ease.quadOut,
          },
        );
        tween(s.scale, { x: w1 / tex, y: w1 / tex }, life, {
          ease: Ease.quadOut,
        });
        tween(s, { alpha: 0 }, life * 0.6, { delay: life * 0.4 }).then(() => {
          if (!s.destroyed) s.destroy();
        });
      }
      await delay(0.055);
    }
  }

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

  claw(x, y, color, opts) {
    const o = opts || {};
    const dir = (o.dir || 1) < 0 ? -1 : 1;
    const len = o.len || 460;
    const gap = o.gap || 62;

    const painted = rakeFrames();
    if (painted) {
      const swipe = new Container();
      swipe.x = x;
      swipe.y = y;
      swipe.scale.x = dir > 0 ? -1 : 1;
      this.field.addChild(swipe);

      const wide = len;
      const tall = wide / RAKE_ASPECT;

      const bed = new Sprite(glowTexture());
      bed.anchor.set(0.5);
      bed.blendMode = "multiply";
      bed.tint = 0x4a2a55;
      bed.alpha = 0;
      bed.setSize(wide * 0.94, tall * 1.2);
      swipe.addChild(bed);

      const tear = new Sprite(painted[0]);
      tear.anchor.set(0.5);
      swipe.addChild(tear);

      const heat = new Sprite(painted[0]);
      heat.anchor.set(0.5);
      heat.blendMode = "add";
      swipe.addChild(heat);

      return tweenValue(0, 1, o.duration || 1.15, (p) => {
        const frame = painted[rakeFrameAt(p)];
        tear.texture = frame;
        heat.texture = frame;

        const grow = 0.93 + p * 0.15;
        tear.setSize(wide * grow, tall * grow);
        heat.setSize(wide * grow * 1.05, tall * grow * 1.05);

        const out = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
        tear.alpha = out;
        heat.alpha = out * 0.62;
        bed.alpha = Math.min(1, p / 0.07) * out * 0.55;
      }).then(() => swipe.destroy({ children: true }));
    }

    const marks = new Container();
    marks.x = x;
    marks.y = y;
    marks.rotation = (o.angle === undefined ? 0.5 : o.angle) * dir;
    this.field.addChild(marks);

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

    const thick = gap * 0.42;
    const core = o.core || 0xffd9e2;

    for (let i = 0; i < 3; i++) {
      const off = (i - 1) * gap;
      const mid = i === 1;
      const l = len * (mid ? 1 : 0.84);
      const bow = l * 0.13;

      const gash = new Graphics();
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
      tween(gash, { alpha: 0 }, 0.42, { delay: 0.2 + i * 0.04 });
    }

    delay(0.75).then(() => marks.destroy({ children: true }));
  }

  async wave(fromY, toY, color, opts) {
    if (!this.layout) return;
    const o = opts || {};

    const band = new Sprite(glowTexture());
    band.anchor.set(0.5);
    band.blendMode = "add";
    band.tint = color;
    const stage = this.layout.stage;
    band.setSize(stage.w * 1.4, o.thickness || 130);
    band.x = stage.cx;
    band.y = fromY;
    band.alpha = 0.95;
    this.field.addChild(band);

    await tween(band, { y: toY }, o.duration || 0.24, { ease: Ease.quadIn });
    tween(band, { alpha: 0 }, 0.2).then(() => band.destroy());
  }

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
