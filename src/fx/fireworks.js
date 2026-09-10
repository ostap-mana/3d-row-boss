import { Container, Sprite } from "pixi.js";
import { glowTexture, sparkTexture } from "../art/textures.js";
import { popFrames } from "../art/gempop.js";
import { rnd, rndRange, pick } from "../core/rng.js";

const MAX_SPARKS = 300;
const TRAIL_STEP = 0.012;
const GAP = [0.2, 0.38];

const WARM = [0xffe9b4, 0xf5c65a, 0xffb03a, 0xffd22e, 0xff8f3a];
const COOL = [0x8ceee2, 0xa855f7, 0x7fd4ff, 0xff5aa8, 0xff7a2f];

const SHAPES = ["peony", "peony", "willow", "crackle", "ring"];

const SHAPE = {
  peony: {
    count: 42,
    speed: 1,
    spread: [0.2, 1],
    grav: 220,
    drag: 1.7,
    ttl: [0.85, 1.25],
    twinkle: 0.35,
    tail: 0.9,
  },
  willow: {
    count: 34,
    speed: 0.72,
    spread: [0.34, 1],
    grav: 440,
    drag: 0.95,
    ttl: [1.3, 1.8],
    twinkle: 0.1,
    tail: 1.5,
  },
  crackle: {
    count: 54,
    speed: 1.15,
    spread: [0.55, 1],
    grav: 150,
    drag: 3.2,
    ttl: [0.5, 0.85],
    twinkle: 0.95,
    tail: 0.6,
  },
  ring: {
    count: 38,
    speed: 1.05,
    spread: [0.88, 1],
    grav: 200,
    drag: 1.9,
    ttl: [0.9, 1.2],
    twinkle: 0.3,
    tail: 1.1,
  },
};

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

export class Fireworks extends Container {
  constructor() {
    super();
    this.eventMode = "none";
    this.w = 0;
    this.h = 0;
    this.unit = 1;
    this.running = false;
    this.next = 0;
    this.shells = [];
    this.sparks = [];
    this.marks = [];
    this.spare = [];
    this.field = new Container();
    this.field.eventMode = "none";
    this.addChild(this.field);
  }

  resize(layout) {
    this.w = layout.w;
    this.h = layout.h;
    this.unit = clamp(Math.min(layout.w, layout.h) / 430, 0.85, 2.4);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.next = GAP[0];
    this.launch(0.34);
    this.launch(0.62);
  }

  stop() {
    this.running = false;
  }

  clear() {
    this.stop();
    this.shells.forEach((s) => this.release(s.sprite));
    this.sparks.forEach((s) => this.release(s.sprite));
    this.marks.forEach((m) => this.release(m.sprite));
    this.shells.length = 0;
    this.sparks.length = 0;
    this.marks.length = 0;
  }

  acquire(texture) {
    const s = this.spare.pop() || new Sprite(texture);
    s.texture = texture;
    s.anchor.set(0.5);
    s.blendMode = "add";
    s.visible = true;
    s.alpha = 1;
    s.rotation = 0;
    if (s.parent !== this.field) this.field.addChild(s);
    return s;
  }

  release(sprite) {
    sprite.visible = false;
    this.spare.push(sprite);
  }

  launch(rise) {
    if (!this.w) return;
    const x = rndRange(this.w * 0.2, this.w * 0.8);
    const apex = rndRange(this.h * 0.12, this.h * 0.38);
    const from = this.h * 1.03;
    const t = rise || rndRange(0.58, 0.88);
    const d = Math.max(80, from - apex);
    const color = rnd() < 0.76 ? pick(WARM) : pick(COOL);

    const sprite = this.acquire(glowTexture());
    sprite.tint = 0xffe2ac;
    const w = 15 * this.unit;
    sprite.setSize(w, w * 2.1);

    this.shells.push({
      x,
      y: from,
      vx: rndRange(-46, 46) * this.unit,
      vy: (-2 * d) / t,
      g: (2 * d) / (t * t),
      t: 0,
      fuse: t,
      trail: 0,
      color,
      sprite,
    });
  }

  burst(x, y, color) {
    const spec = SHAPE[pick(SHAPES)];
    const second =
      rnd() < 0.34 ? (WARM.includes(color) ? pick(COOL) : pick(WARM)) : color;

    this.mark(x, y, color);
    this.flare(x, y, color);

    const room = MAX_SPARKS - this.sparks.length;
    if (room <= 0) return;
    const n = Math.min(spec.count, room);
    const base = rndRange(310, 410) * spec.speed * this.unit;
    const turn = rndRange(0, Math.PI * 2);

    for (let i = 0; i < n; i++) {
      const step = (Math.PI * 2) / n;
      const ang = turn + i * step + rndRange(-step * 0.45, step * 0.45);
      const lo = spec.spread[0];
      const power = base * Math.sqrt(rndRange(lo * lo, 1));
      this.spawn(x, y, Math.cos(ang) * power, Math.sin(ang) * power, {
        color: i % 2 ? second : color,
        grav: spec.grav * this.unit,
        drag: spec.drag,
        ttl: rndRange(spec.ttl[0], spec.ttl[1]),
        twinkle: rnd() < spec.twinkle,
        tail: spec.tail,
        size: rndRange(4.5, 8) * this.unit,
      });
    }
  }

  mark(x, y, color) {
    const frames = popFrames();
    if (!frames) return;
    const sprite = this.acquire(frames[0]);
    sprite.tint = color;
    sprite.x = x;
    sprite.y = y;
    sprite.rotation = rndRange(0, Math.PI * 2);
    const w = rndRange(96, 150) * this.unit;
    sprite.setSize(w, w);
    this.marks.push({ sprite, frames, t: 0, ttl: 0.3, w });
  }

  flare(x, y, color) {
    const sprite = this.acquire(glowTexture());
    sprite.tint = color;
    sprite.x = x;
    sprite.y = y;
    const w = rndRange(130, 180) * this.unit;
    sprite.setSize(w, w);
    this.marks.push({ sprite, frames: null, t: 0, ttl: 0.42, w });
  }

  spawn(x, y, vx, vy, opt) {
    if (this.sparks.length >= MAX_SPARKS) return;
    const sprite = this.acquire(sparkTexture());
    sprite.tint = opt.color;
    sprite.x = x;
    sprite.y = y;
    this.sparks.push({
      x,
      y,
      vx,
      vy,
      t: 0,
      ttl: opt.ttl,
      size: opt.size,
      grav: opt.grav,
      drag: opt.drag,
      tail: opt.tail,
      twinkle: opt.twinkle,
      rate: rndRange(24, 40),
      phase: rndRange(0, Math.PI * 2),
      sprite,
    });
  }

  update(dt) {
    if (!this.w) return;
    if (this.running) {
      this.next -= dt;
      if (this.next <= 0) {
        this.launch();
        this.next = rndRange(GAP[0], GAP[1]);
      }
    }
    this.stepShells(dt);
    this.stepMarks(dt);
    this.stepSparks(dt);
  }

  stepShells(dt) {
    for (let i = this.shells.length - 1; i >= 0; i--) {
      const sh = this.shells[i];
      sh.t += dt;
      sh.vy += sh.g * dt;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      sh.sprite.x = sh.x;
      sh.sprite.y = sh.y;
      sh.sprite.alpha = 0.72 + Math.sin(sh.t * 46) * 0.28;

      sh.trail += dt;
      while (sh.trail >= TRAIL_STEP) {
        sh.trail -= TRAIL_STEP;
        this.spawn(
          sh.x + rndRange(-3, 3),
          sh.y + rndRange(-3, 3) + 8 * this.unit,
          sh.vx * 0.1 + rndRange(-24, 24),
          sh.vy * 0.08 + rndRange(-10, 30),
          {
            color: 0xffcf86,
            grav: 120 * this.unit,
            drag: 3.4,
            ttl: rndRange(0.22, 0.4),
            twinkle: false,
            tail: 0.5,
            size: rndRange(4, 7) * this.unit,
          },
        );
      }

      if (sh.t >= sh.fuse) {
        this.release(sh.sprite);
        this.shells.splice(i, 1);
        this.burst(sh.x, sh.y, sh.color);
      }
    }
  }

  stepMarks(dt) {
    for (let i = this.marks.length - 1; i >= 0; i--) {
      const m = this.marks[i];
      m.t += dt;
      const k = m.t / m.ttl;
      if (k >= 1) {
        this.release(m.sprite);
        this.marks.splice(i, 1);
        continue;
      }
      if (m.frames) {
        m.sprite.texture =
          m.frames[Math.min(m.frames.length - 1, (k * m.frames.length) | 0)];
        const w = m.w * (1 + k * 0.4);
        m.sprite.setSize(w, w);
        m.sprite.alpha = (k < 0.45 ? 1 : 1 - (k - 0.45) / 0.55) * 0.6;
      } else {
        const w = m.w * (1 + k * 0.7);
        m.sprite.setSize(w, w);
        m.sprite.alpha = (1 - k) * (1 - k) * 0.7;
      }
    }
  }

  stepSparks(dt) {
    const damp = Math.exp(-dt);
    for (let i = this.sparks.length - 1; i >= 0; i--) {
      const p = this.sparks[i];
      p.t += dt;
      const k = p.t / p.ttl;
      if (k >= 1 || p.y > this.h * 1.25) {
        this.release(p.sprite);
        this.sparks.splice(i, 1);
        continue;
      }

      const d = Math.pow(damp, p.drag);
      p.vx *= d;
      p.vy *= d;
      p.vy += p.grav * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      const speed = Math.hypot(p.vx, p.vy);
      const s = p.sprite;
      s.x = p.x;
      s.y = p.y;
      s.rotation = Math.atan2(p.vy, p.vx);
      const size = p.size * (1 - k * 0.55);
      const len =
        size * (1 + Math.min(4.2, (speed / (250 * this.unit)) * p.tail * 2.6));
      s.setSize(len, size);

      let a = Math.pow(1 - k, 1.15) * 0.9;
      if (p.twinkle && k > 0.3) {
        a *= 0.35 + 0.65 * Math.abs(Math.sin(p.t * p.rate + p.phase));
      }
      s.alpha = a;
    }
  }
}
