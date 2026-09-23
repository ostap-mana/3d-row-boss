import { Container, Graphics, Sprite } from "pixi.js";
import {
  beamTexture,
  glowTexture,
  shockTexture,
  sparkTexture,
} from "../art/textures.js";
import { tween, tweenValue, delay, Ease } from "../core/tween.js";
import { rndRange } from "../core/rng.js";
import {
  FIRE_ASPECT,
  FIRE_LEAD,
  FIRE_TRAVEL_LAST,
  fireFrames,
} from "../art/fire.js";
import {
  HIT_BY_ELEMENT,
  SPELL_ASPECT,
  SPELL_BY_ELEMENT,
  SPELL_TRAVEL_LAST,
  bossSpellFrames,
  spellFrames,
} from "../art/spells.js";
import { streamArt } from "../art/streams.js";
import { boulderFrames } from "../art/shards.js";
import { blockTexture } from "../art/obsidian.js";
import { boltArt } from "../art/bolts.js";
import { POP_ASPECT, popFrames } from "../art/gempop.js";
import { CHARGE_ASPECT, chargeFrames } from "../art/gemcharge.js";
import { CROWN_CELL, readyCrownFrames } from "../art/readyfx.js";
import {
  BLAST,
  BOOM,
  BOULDER,
  FIRE,
  HITP,
  IMPACT_FX,
  MEND_FX,
  OBSIDIAN,
  SHARD,
  SPARK,
  ULT_CALL,
  ULT_FX,
  VOLLEY,
} from "../config.js";

const MAX_PARTICLES = 320;

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
      const life = 0.42 * rndRange(0.72, 1.35);
      const fall = size * SPARK.fall * rndRange(0.4, 1.4);
      if (i % 4 === 0) s.tint = SPARK.hot;
      s.rotation = ang;
      s.setSize(size * SPARK.streak, size);

      const ex = x + Math.cos(ang) * dist;
      const ey = y + Math.sin(ang) * dist;
      tweenValue(0, 1, life, (t) => {
        if (s.destroyed) return;
        const e = Ease.quadOut(t);
        s.x = x + (ex - x) * e;
        s.y = y + (ey - y) * e + fall * t * t;
        const k = 1 - Ease.quadIn(t);
        s.setSize(size * SPARK.streak * k, size * k);
        s.alpha = t > SPARK.hold ? 1 - (t - SPARK.hold) / (1 - SPARK.hold) : 1;
      }).then(() => {
        if (!s.destroyed) s.destroy();
      });
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

  ring(x, y, color, size, width, opts) {
    const o = opts || {};
    const wide = size || 200;
    const heft = Math.max(0.35, Math.min(1.6, (width || 8) / 8));
    const dur = o.duration || 0.45;
    const flat = o.flat === undefined ? 1 : o.flat;
    const spin =
      o.rotation === undefined ? rndRange(0, Math.PI * 2) : o.rotation;

    return this.shockRing(x, y, color, {
      from: wide * 0.18,
      to: wide,
      duration: dur,
      flat,
      rotation: spin,
      halo: 0.55 * heft,
      core: Math.min(1, 0.85 * heft),
      hold: o.hold === undefined ? 0.25 : o.hold,
    });
  }

  blastWave(x, y, wide, o) {
    const frames = spellFrames("shock");
    if (!frames || o.painted === false) return false;

    const s = new Sprite(frames[0]);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = o.tint || BLAST.tint;
    s.x = x;
    s.y = y + wide * BLAST.drop;
    s.alpha = 0;
    this.field.addChild(s);

    const from = wide * BLAST.from;
    const dur = o.duration || 0.5;
    const top = o.alpha === undefined ? BLAST.alpha : o.alpha;
    const n = frames.length;

    tweenValue(0, 1, dur, (p) => {
      if (s.destroyed) return;
      s.texture = frames[Math.min(n - 1, (p * n) | 0)];
      const w = from + (wide - from) * Ease.quadOut(p);
      s.setSize(w, w);
      const fade =
        p < BLAST.rise
          ? p / BLAST.rise
          : 1 - (p - BLAST.rise) / (1 - BLAST.rise);
      s.alpha = top * Math.max(0, fade);
    }).then(() => !s.destroyed && s.destroy());

    return true;
  }

  shockRing(x, y, color, o) {
    const from = o.from || 40;
    const to = o.to || 300;
    const dur = o.duration || 0.45;
    const flat = o.flat === undefined ? 1 : o.flat;
    const hold = o.hold === undefined ? 0.25 : o.hold;

    const layers = [
      { tint: color, gain: o.halo === undefined ? 0.55 : o.halo, fat: 1.16 },
      {
        tint: o.light || 0xffffff,
        gain: o.core === undefined ? 0.8 : o.core,
        fat: 1,
      },
    ]
      .filter((l) => l.gain > 0.01)
      .map(({ tint, gain, fat }) => {
        const s = new Sprite(shockTexture());
        s.anchor.set(0.5);
        s.blendMode = "add";
        s.tint = tint;
        s.x = x;
        s.y = y;
        s.rotation = o.rotation || 0;
        s.setSize(from * fat, from * fat * flat);
        s.alpha = 0;
        this.field.addChild(s);
        return { s, gain, fat };
      });

    if (!layers.length) return Promise.resolve();

    return tweenValue(0, 1, dur, (p) => {
      const e = Ease.quadOut(p);
      const w = from + (to - from) * e;
      const fade = p < hold ? p / hold : 1 - (p - hold) / (1 - hold);
      layers.forEach(({ s, gain, fat }) => {
        if (s.destroyed) return;
        s.setSize(w * fat, w * fat * flat);
        s.alpha = gain * Math.max(0, fade);
      });
    }).then(() => layers.forEach(({ s }) => !s.destroyed && s.destroy()));
  }

  shatter(x, y, size, color) {
    const frames = spellFrames("shatter");
    if (!frames) return false;

    const s = new Sprite(frames[0]);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = color || 0xffffff;
    s.x = x;
    s.y = y;
    s.rotation = rndRange(0, Math.PI * 2);
    s.alpha = 0;
    this.field.addChild(s);

    const wide = (size || 150) * SHARD.scale;
    const n = frames.length;

    tweenValue(0, 1, SHARD.seconds, (p) => {
      if (s.destroyed) return;
      s.texture = frames[Math.min(n - 1, (p * n) | 0)];
      const w = wide * (SHARD.from + Ease.quadOut(p) * (1 - SHARD.from));
      s.setSize(w, w);
      s.alpha =
        SHARD.alpha *
        (p < SHARD.rise
          ? p / SHARD.rise
          : 1 - (p - SHARD.rise) / (1 - SHARD.rise));
    }).then(() => !s.destroyed && s.destroy());

    return true;
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

    this.impact(to, color, o.impact || 1, o.element);

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
    this.impact(to, color, o.impact || 2.4, element);
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

    const heading = Math.atan2(to.y - from.y, to.x - from.x);
    const shade = (paint, alpha) => {
      if (!lance || paint == null) return null;
      const s = new Sprite(lance.frames[0]);
      s.anchor.set(1, 0.5);
      s.rotation = heading;
      s.tint = paint;
      s.alpha = alpha;
      s.blendMode = "add";
      s.x = from.x;
      s.y = from.y;
      this.field.addChild(s);
      return s;
    };

    const haze = shade(lance && lance.deep, ULT_FX.boltHazeAlpha);

    const bolt = new Sprite(lance ? lance.frames[0] : frames[0]);
    bolt.anchor.set(lance ? 1 : 0.5, 0.5);
    if (lance) bolt.rotation = heading;
    if (lance && lance.tint != null) bolt.tint = lance.tint;
    bolt.blendMode = "add";
    bolt.x = from.x;
    bolt.y = from.y;
    this.field.addChild(bolt);

    const core = shade(lance && lance.core, ULT_FX.boltCoreAlpha);

    const lead = new Sprite(glowTexture());
    lead.anchor.set(0.5);
    lead.blendMode = "add";
    lead.tint = color;
    lead.alpha = 0.5;
    lead.setSize(size * 0.45, size * 0.45);
    this.field.addChild(lead);

    let last = { x: from.x, y: from.y };
    let drop = 0;

    const span = Math.hypot(to.x - from.x, to.y - from.y) || 1;
    const aim = { x: (to.x - from.x) / span, y: (to.y - from.y) / span };
    const shaft = lance
      ? Math.min(size * ULT_FX.boltLong, span * ULT_FX.boltSpan)
      : 0;

    await tweenValue(0, 1, o.travel || ULT_FX.travel, (p) => {
      if (bolt.destroyed) return;
      const e = p * 0.45 + Ease.quadIn(p) * 0.55;

      if (lance) {
        const gone = shaft + (span - shaft) * e;
        bolt.x = from.x + aim.x * gone;
        bolt.y = from.y + aim.y * gone;
        const len = shaft * (1 + e * ULT_FX.boltSwell);
        const n = lance.frames.length;
        if (n > 1) bolt.texture = lance.frames[Math.min(n - 1, (p * n) | 0)];
        bolt.setSize(len, len / lance.aspect);
        const ride = (s, long, thick) => {
          if (!s || s.destroyed) return;
          s.texture = bolt.texture;
          s.x = bolt.x;
          s.y = bolt.y;
          s.setSize(len * long, (len / lance.aspect) * thick);
        };
        ride(haze, ULT_FX.boltHazeLong, ULT_FX.boltHaze);
        ride(core, ULT_FX.boltCoreLong, ULT_FX.boltCore);
      } else {
        bolt.x = from.x + (to.x - from.x) * e;
        bolt.y = from.y + (to.y - from.y) * e;
        const w = size * (ULT_FX.boltSize + e * ULT_FX.boltSwell);
        const i = Math.floor(e * (SPELL_TRAVEL_LAST + 1));
        bolt.texture = frames[Math.min(SPELL_TRAVEL_LAST, i)];
        bolt.setSize(w, w / SPELL_ASPECT);
      }

      lead.x = bolt.x;
      lead.y = bolt.y;

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
    [haze, core].forEach((s) => {
      if (!s) return;
      s.x = to.x;
      s.y = to.y;
      tween(s, { alpha: 0 }, ULT_FX.boltCoreFade).then(
        () => !s.destroyed && s.destroy(),
      );
    });
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

    this.boom(to, size, { tint: light });
    this.ultShock(to, from, color, light, size);
  }

  boom(at, size, opts) {
    const frames = spellFrames("ultburst");
    if (!frames) return false;

    const o = opts || {};
    const s = new Sprite(frames[0]);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = o.tint || BOOM.tint;
    s.x = at.x;
    s.y = at.y;
    s.rotation = rndRange(0, Math.PI * 2);
    s.alpha = 0;
    this.field.addChild(s);

    const wide = size * BOOM.scale;
    const n = frames.length;

    tweenValue(0, 1, o.duration || BOOM.seconds, (p) => {
      if (s.destroyed) return;
      s.texture = frames[Math.min(n - 1, (p * n) | 0)];
      const w = wide * (BOOM.from + Ease.quadOut(p) * (1 - BOOM.from));
      s.setSize(w, w);
      s.alpha =
        BOOM.alpha *
        (p < BOOM.rise ? p / BOOM.rise : 1 - (p - BOOM.rise) / (1 - BOOM.rise));
    }).then(() => !s.destroyed && s.destroy());

    return true;
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
    const reach = size * ULT_FX.shockReach;
    this.shockRing(at.x, at.y, color, {
      from: reach * 0.14,
      to: reach,
      duration: ULT_FX.shockLife,
      flat: 0.72,
      rotation: rndRange(0, Math.PI * 2),
      halo: 0.5,
      core: 0.85,
      light,
      hold: 0.16,
    });

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

    const blend = o.blend || "add";
    const additive = blend === "add";
    const last = frames.length - 1;

    const pair = [frames[0], frames[Math.min(last, 1)]].map((frame) => {
      const s = new Sprite(frame);
      s.anchor.set(0.5);
      s.blendMode = blend;
      s.x = at.x;
      s.y = at.y;
      s.rotation = o.rotation || 0;
      s.alpha = base;
      this.field.addChild(s);
      return s;
    });
    const [near, far] = pair;
    far.alpha = 0;

    tweenValue(0, 1, o.duration || 0.5, (p) => {
      const step = p * frames.length;
      const i = Math.min(last, step | 0);
      const mix = i < last ? step - i : 0;
      near.texture = frames[i];
      far.texture = frames[Math.min(last, i + 1)];

      const w = size * (1 + p * grow);
      const fade = base * (p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3);
      for (const s of pair) {
        s.setSize(w, w / SPELL_ASPECT);
        if (o.mirror) s.scale.x = -s.scale.x;
      }
      near.alpha = fade * (additive ? 1 - mix : 1);
      far.alpha = fade * mix;
    }).then(() => pair.forEach((s) => s.destroy()));

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
      const s = new Sprite(shockTexture());
      s.anchor.set(0.5);
      s.blendMode = "add";
      s.tint = color;
      s.x = at.x;
      s.y = at.y;
      s.rotation = rndRange(0, Math.PI * 2);
      s.alpha = 0;
      this.field.addChild(s);

      const wide = size * MEND_FX.reach * (1 - i * 0.22);
      const lead = i * seconds * 0.16;
      const life = seconds * MEND_FX.peak - lead;

      tweenValue(
        0,
        1,
        life,
        (p) => {
          if (s.destroyed) return;
          const e = Ease.quadIn(p);
          const w = wide * (1 - e * 0.88);
          s.setSize(w, w * MEND_FX.ringFlat);
          s.rotation += 0.004;
          s.alpha =
            MEND_FX.ringAlpha * (p < 0.2 ? p / 0.2 : 1 - (p - 0.2) / 0.8);
        },
        { delay: lead },
      ).then(() => {
        if (!s.destroyed) s.destroy();
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

  impact(at, color, power, element) {
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

    const spin = rndRange(0, Math.PI * 2);

    if (this.hitPlate(at, color, p, spin, element)) {
      this.burst(at.x, at.y, color, Math.round(10 * p), 1.4 * p);
      return;
    }

    this.shockRing(at.x, at.y, color, {
      from: 46 * p,
      to: 300 * p,
      duration: 0.34,
      flat: IMPACT_FX.flat,
      rotation: spin,
      halo: 0.62,
      core: 0.34,
      light: 0xffd7b0,
      hold: 0.16,
    });
    this.shockRing(at.x, at.y, color, {
      from: 28 * p,
      to: 160 * p,
      duration: 0.24,
      flat: IMPACT_FX.flat,
      rotation: spin + 1.1,
      halo: 0,
      core: 0.9,
      light: 0xfff0d6,
      hold: 0.1,
    });

    this.lick(at, color, p, spin);
    this.burst(at.x, at.y, color, Math.round(10 * p), 1.4 * p);
  }

  hitPlate(at, color, p, spin, element) {
    const own = spellFrames(HIT_BY_ELEMENT[element]);
    const frames = own || spellFrames("hitburst");
    if (!frames) return false;

    const s = new Sprite(frames[0]);
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.tint = own ? 0xffffff : color;
    s.x = at.x;
    s.y = at.y;
    s.rotation = spin;
    s.alpha = 0;
    this.field.addChild(s);

    const wide = HITP.size * p;
    const n = frames.length;

    tweenValue(0, 1, HITP.seconds, (t) => {
      if (s.destroyed) return;
      s.texture = frames[Math.min(n - 1, (t * n) | 0)];
      const w = wide * (HITP.from + Ease.quadOut(t) * (1 - HITP.from));
      s.setSize(w, w);
      s.alpha =
        HITP.alpha *
        (t < HITP.rise ? t / HITP.rise : 1 - (t - HITP.rise) / (1 - HITP.rise));
    }).then(() => !s.destroyed && s.destroy());

    return true;
  }

  lick(at, color, p, spin) {
    const room = MAX_PARTICLES - this.field.children.length;
    const n = Math.min(IMPACT_FX.streaks, Math.max(0, room));

    for (let i = 0; i < n; i++) {
      const s = new Sprite(beamTexture());
      s.anchor.set(0, 0.5);
      s.blendMode = "add";
      s.tint = i % 3 === 0 ? 0xffd7b0 : color;
      const a = spin + (i / n) * Math.PI * 2 + rndRange(-0.2, 0.2);
      const len = 78 * p * rndRange(0.62, 1.25);
      s.rotation = a;
      s.setSize(len, 8 * p * rndRange(0.7, 1.2));
      s.x = at.x;
      s.y = at.y;
      s.alpha = 0.9;
      this.field.addChild(s);

      const reach = 118 * p * rndRange(0.7, 1.15);
      const life = 0.3 * rndRange(0.75, 1.2);
      tween(
        s,
        {
          x: at.x + Math.cos(a) * reach,
          y: at.y + Math.sin(a) * reach * IMPACT_FX.flat,
        },
        life,
        { ease: Ease.quadOut },
      );
      tween(s.scale, { x: s.scale.x * 0.3, y: s.scale.y * 0.2 }, life, {
        ease: Ease.quadOut,
      });
      tween(s, { alpha: 0 }, life).then(() => {
        if (!s.destroyed) s.destroy();
      });
    }
  }

  async flash(color, alpha, dur) {
    this.flashRect.tint = color === undefined ? 0xffffff : color;
    this.flashRect.alpha = alpha === undefined ? 0.9 : alpha;
    await tween(this.flashRect, { alpha: 0 }, dur || 0.5, {
      ease: Ease.quadOut,
    });
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

  shardVolley(from, targets, opts) {
    if (!targets || !targets.length) return Promise.resolve();
    const o = opts || {};
    const size = o.size || 90;
    const flight = o.flight || VOLLEY.flight;
    const stagger = o.stagger || VOLLEY.stagger;

    return Promise.all(
      targets.map((to, i) => {
        const lead = i * stagger;
        const span = flight * rndRange(0.9, 1.12);
        const spin =
          rndRange(VOLLEY.spin[0], VOLLEY.spin[1]) * (i % 2 ? -1 : 1);
        const wide = size * rndRange(0.86, 1.14);
        const lift = Math.abs(to.x - from.x) * VOLLEY.arc + wide * 0.6;
        const mouth = {
          x: from.x + (to.x - from.x) * VOLLEY.fan,
          y: from.y + (to.y - from.y) * VOLLEY.fan * 0.35,
        };
        const bow = (to.x - from.x) * VOLLEY.bow;

        const streak = new Sprite(beamTexture());
        streak.anchor.set(0.5);
        streak.blendMode = "add";
        streak.tint = OBSIDIAN.seam;
        streak.alpha = 0;
        this.field.addChild(streak);

        const glow = new Sprite(glowTexture());
        glow.anchor.set(0.5);
        glow.blendMode = "add";
        glow.tint = OBSIDIAN.seam;
        glow.setSize(wide * VOLLEY.glow, wide * VOLLEY.glow);
        glow.alpha = 0;
        this.field.addChild(glow);

        const slab = blockTexture();
        const rock = slab ? new Sprite(slab) : null;
        const flip = i % 2 ? -1 : 1;
        if (rock) {
          rock.anchor.set(0.5);
          rock.setSize(wide * VOLLEY.from, wide * VOLLEY.from);
          rock.scale.x *= flip;
          rock.rotation = rndRange(0, Math.PI * 2);
          rock.alpha = 0;
          this.field.addChild(rock);
        }

        const seed = rock ? rock.rotation : 0;

        return delay(lead)
          .then(
            () =>
              new Promise((done) => {
                tweenValue(0, 1, span, (p) => {
                  const e = p * (VOLLEY.launch + (1 - VOLLEY.launch) * p);
                  const swell = Math.sin(Math.PI * e);
                  const x = mouth.x + (to.x - mouth.x) * e + swell * bow;
                  const y =
                    mouth.y + (to.y - mouth.y) * e - swell * lift * VOLLEY.hang;
                  const grow = VOLLEY.from + (1 - VOLLEY.from) * e;
                  const fade = p < 0.12 ? p / 0.12 : 1;

                  const runX = x - mouth.x;
                  const runY = y - mouth.y;
                  const run = Math.hypot(runX, runY);
                  streak.x = mouth.x + runX / 2;
                  streak.y = mouth.y + runY / 2;
                  streak.rotation = Math.atan2(runY, runX) + Math.PI / 2;
                  streak.setSize(wide * VOLLEY.tail, run);
                  streak.alpha =
                    VOLLEY.tailAlpha *
                    (p < 0.12 ? p / 0.12 : 1 - Math.max(0, (p - 0.72) / 0.28));

                  glow.x = x;
                  glow.y = y;
                  glow.setSize(
                    wide * VOLLEY.glow * grow,
                    wide * VOLLEY.glow * grow,
                  );
                  glow.alpha = VOLLEY.glowAlpha * fade;

                  if (rock && !rock.destroyed) {
                    rock.x = x;
                    rock.y = y;
                    rock.rotation = seed + spin * e;
                    rock.setSize(wide * grow, wide * grow);
                    rock.scale.x *= flip;
                    rock.alpha = fade;
                  }
                }).then(done);
              }),
          )
          .then(() => {
            glow.destroy();
            streak.destroy();
            if (rock && !rock.destroyed) rock.destroy();
            this.burst(to.x, to.y, OBSIDIAN.seamHot, VOLLEY.chips, 0.9);
          });
      }),
    );
  }

  async boulder(from, to, opts) {
    const o = opts || {};
    const size = o.size || 260;
    const art = boulderFrames(o.seed || 0);

    const halo = new Sprite(glowTexture());
    halo.anchor.set(0.5);
    halo.blendMode = "add";
    halo.tint = OBSIDIAN.seam;
    halo.x = from.x;
    halo.y = from.y;
    halo.alpha = 0;
    this.field.addChild(halo);

    const shroudFrames = spellFrames("flame");
    const shroud = shroudFrames ? new Sprite(shroudFrames[0]) : null;
    if (shroud) {
      shroud.anchor.set(0.5);
      shroud.blendMode = "add";
      shroud.tint = OBSIDIAN.seamHot;
      shroud.x = from.x;
      shroud.y = from.y;
      shroud.alpha = 0;
      this.field.addChild(shroud);
    }

    const rock = art ? new Sprite(art) : null;
    if (rock) {
      rock.anchor.set(0.5);
      rock.x = from.x;
      rock.y = from.y;
      rock.alpha = 0;
      this.field.addChild(rock);
    }
    const spin = rndRange(BOULDER.spin[0], BOULDER.spin[1]);
    const seed = rndRange(0, Math.PI * 2);

    const wrap = (x, y, w, p, alpha) => {
      if (!shroud || shroud.destroyed) return;
      const n = shroudFrames.length;
      shroud.texture = shroudFrames[Math.min(n - 1, ((p * n * 2) | 0) % n)];
      shroud.x = x;
      shroud.y = y + w * BOULDER.shroudDrop;
      shroud.setSize(w * BOULDER.shroud, w * BOULDER.shroud);
      shroud.rotation = seed * 0.4 + p * 0.6;
      shroud.alpha = alpha;
    };

    await tweenValue(0, 1, BOULDER.charge, (p) => {
      const e = Ease.quadOut(p);
      const w = size * BOULDER.from * (0.3 + e * 0.7);
      halo.setSize(w * BOULDER.halo, w * BOULDER.halo);
      halo.alpha = BOULDER.haloAlpha * e;
      const lift = from.y - size * BOULDER.rear * e;
      if (rock && !rock.destroyed) {
        rock.texture = art[((p * art.length) | 0) % art.length];
        const squash = 1 - BOULDER.wind * Math.sin(Math.PI * p);
        rock.setSize(w * (2 - squash), w * squash);
        rock.rotation = seed + spin * 0.12 * e;
        rock.alpha = e;
        rock.y = lift;
      }
      halo.y = lift;
      wrap(from.x, lift, w, p * 0.3, BOULDER.shroudAlpha * e * 0.7);
    });

    let trail = 0;
    await tweenValue(0, 1, BOULDER.flight, (p) => {
      const e = p * (BOULDER.launch + (1 - BOULDER.launch) * p);
      const grow = BOULDER.from + (1 - BOULDER.from) * Ease.quadIn(p);
      const w = size * grow;
      const x = from.x + (to.x - from.x) * e;
      const y =
        from.y -
        size * BOULDER.rear +
        (to.y - from.y + size * BOULDER.rear) * e -
        Math.sin(Math.PI * e) * size * BOULDER.hang;

      halo.x = x;
      halo.y = y;
      halo.setSize(w * BOULDER.halo, w * BOULDER.halo);
      halo.alpha = BOULDER.haloAlpha * (0.6 + 0.4 * e);

      if (rock && !rock.destroyed) {
        rock.texture = art[((p * art.length * BOULDER.beat) | 0) % art.length];
        rock.x = x;
        rock.y = y;
        const pull = 1 + BOULDER.stretch * Math.min(1, p * 1.4);
        rock.setSize(w * (2 - pull), w * pull);
        rock.rotation = seed + spin * e;
        rock.alpha = 1;
      }

      wrap(x, y, w, 0.3 + p, BOULDER.shroudAlpha);

      if (p - trail > BOULDER.trail) {
        trail = p;
        this.ember(
          x + rndRange(-w, w) * 0.22,
          y + rndRange(-w, w) * 0.22,
          w * 0.2,
          p > 0.5 ? OBSIDIAN.seamHot : OBSIDIAN.seam,
        );
      }
    });

    halo.destroy();
    if (shroud && !shroud.destroyed) shroud.destroy();
    if (rock && !rock.destroyed) rock.destroy();
    this.breakRock(to, size);

    this.flash(BOULDER.flash, BOULDER.flashAlpha, BOULDER.flashSeconds);
    this.shockRing(to.x, to.y, OBSIDIAN.seam, {
      from: size * 0.3,
      to: size * BOULDER.ring,
      duration: BOULDER.ringSeconds,
      flat: BOULDER.ringFlat,
      light: OBSIDIAN.seamHot,
    });
    this.burst(to.x, to.y, OBSIDIAN.seamHot, BOULDER.chips, 1.5);

    for (let i = 0; i < BOULDER.debris; i++) {
      const chip = blockTexture();
      if (!chip) break;
      const s = new Sprite(chip);
      s.anchor.set(0.5);
      const w = size * rndRange(0.12, 0.24);
      s.setSize(w, w);
      s.x = to.x;
      s.y = to.y;
      s.rotation = rndRange(0, Math.PI * 2);
      this.field.addChild(s);

      const ang = -Math.PI / 2 + rndRange(-1.25, 1.25);
      const reach = size * rndRange(0.4, 1.05);
      const life = BOULDER.debrisSeconds * rndRange(0.8, 1.2);
      tweenValue(0, 1, life, (p) => {
        if (s.destroyed) return;
        s.x = to.x + Math.cos(ang) * reach * p;
        s.y = to.y + Math.sin(ang) * reach * p + reach * 1.5 * p * p;
        s.rotation += 0.24;
        s.alpha = p < 0.65 ? 1 : 1 - (p - 0.65) / 0.35;
      }).then(() => !s.destroyed && s.destroy());
    }
  }

  breakRock(at, size) {
    for (let i = 0; i < BOULDER.pieces; i++) {
      const art = blockTexture();
      if (!art) break;
      const s = new Sprite(art);
      s.anchor.set(0.5);
      const w = size * rndRange(BOULDER.piece[0], BOULDER.piece[1]);
      s.setSize(w, w);
      s.x = at.x;
      s.y = at.y;
      s.rotation = rndRange(0, Math.PI * 2);
      this.field.addChild(s);

      const ang = -Math.PI / 2 + (i / BOULDER.pieces - 0.5) * Math.PI * 1.5;
      const speed = size * rndRange(0.5, 1.0);
      const spin = rndRange(-5, 5);
      const life = BOULDER.piecesSeconds * rndRange(0.85, 1.15);

      tweenValue(0, 1, life, (p) => {
        if (s.destroyed) return;
        s.x = at.x + Math.cos(ang) * speed * p;
        s.y = at.y + Math.sin(ang) * speed * p + size * 1.9 * p * p;
        s.rotation += spin * 0.02;
        const shrink = 1 - p * 0.25;
        s.setSize(w * shrink, w * shrink);
        s.alpha = p < 0.6 ? 1 : 1 - (p - 0.6) / 0.4;
      }).then(() => !s.destroyed && s.destroy());
    }
  }

  async sweep(color) {
    if (!this.layout) return;
    const { w, h } = this.layout;
    const band = new Sprite(glowTexture());
    band.anchor.set(0, 0);
    band.setSize(w * 0.34, h * 1.4);
    band.tint = color;
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
