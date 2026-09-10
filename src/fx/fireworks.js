import { Container, Sprite } from "pixi.js";
import { glowTexture, sparkTexture } from "../art/textures.js";
import { rnd, rndRange, pick } from "../core/rng.js";

const MAX_SPARKS = 900;
const TRAIL_STEP = 0.01;
const TRAIL_BURST = 4;
const DUST_BURST = 3;
const GAP = [0.26, 0.6];
const SALVO_GAP = [3, 6];
const GLITTER_ROOM = 0.78;

const WARM = [0xffe9b4, 0xf5c65a, 0xffb03a, 0xffd22e, 0xff8f3a];
const COOL = [0x8ceee2, 0xa855f7, 0x7fd4ff, 0xff5aa8, 0xff7a2f];

const SHAPES = [
  "peony",
  "peony",
  "chrysanth",
  "chrysanth",
  "willow",
  "crackle",
  "ring",
  "palm",
  "crossette",
  "strobe",
];

const BIG = ["chrysanth", "willow", "palm", "crossette"];

const SHAPE = {
  peony: {
    count: 46,
    speed: 1,
    spread: [0.25, 1],
    grav: 230,
    drag: 1.7,
    ttl: [0.9, 1.35],
    twinkle: 0.32,
    tail: 0.95,
    size: [4.5, 8],
    glitter: 0,
    shift: 0.4,
  },
  chrysanth: {
    count: 54,
    speed: 0.96,
    spread: [0.5, 1],
    grav: 300,
    drag: 1.2,
    ttl: [1.3, 1.9],
    twinkle: 0.16,
    tail: 1.6,
    size: [4.5, 7.5],
    glitter: 32,
    shift: 0.35,
  },
  willow: {
    count: 30,
    speed: 0.68,
    spread: [0.4, 1],
    grav: 470,
    drag: 0.85,
    ttl: [1.6, 2.3],
    twinkle: 0.1,
    tail: 1.8,
    size: [5, 8],
    glitter: 22,
    shift: 0.2,
  },
  crackle: {
    count: 64,
    speed: 1.2,
    spread: [0.6, 1],
    grav: 150,
    drag: 3.4,
    ttl: [0.45, 0.8],
    twinkle: 1,
    tail: 0.55,
    size: [4, 6.5],
    glitter: 0,
    shift: 0,
  },
  ring: {
    count: 44,
    speed: 1.06,
    spread: [0.92, 1],
    grav: 200,
    drag: 1.9,
    ttl: [1, 1.3],
    twinkle: 0.26,
    tail: 1.15,
    size: [5, 7.5],
    glitter: 0,
    shift: 0.5,
  },
  palm: {
    count: 16,
    speed: 1.15,
    spread: [0.85, 1],
    grav: 260,
    drag: 1.1,
    ttl: [1.5, 2],
    twinkle: 0.1,
    tail: 2.4,
    size: [7, 11],
    glitter: 16,
    shift: 0.25,
  },
  crossette: {
    count: 20,
    speed: 0.95,
    spread: [0.8, 1],
    grav: 160,
    drag: 1.5,
    ttl: [1.1, 1.5],
    twinkle: 0.1,
    tail: 1,
    size: [5.5, 8],
    glitter: 0,
    shift: 0,
    split: { n: 4, speed: 165, ttl: [0.42, 0.7], tail: 0.7, size: [3.5, 5.5] },
    splitAt: [0.34, 0.46],
  },
  strobe: {
    count: 50,
    speed: 0.9,
    spread: [0.4, 1],
    grav: 210,
    drag: 2.2,
    ttl: [1.1, 1.6],
    twinkle: 1,
    tail: 0.4,
    size: [5, 7],
    glitter: 0,
    shift: 0.45,
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
    this.beat = 0;
    this.salvo = 0;
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
    this.beat = 0;
    this.salvo = (rndRange(SALVO_GAP[0], SALVO_GAP[1]) | 0) + 1;
    this.next = rndRange(GAP[0], GAP[1]);
    this.launch(0.44, "chrysanth");
    this.launch(0.68, "peony");
    this.launch(0.94, pick(BIG));
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

  launch(rise, shape) {
    if (!this.w) return;
    const x = rndRange(this.w * 0.14, this.w * 0.86);
    const apex = rndRange(this.h * 0.07, this.h * 0.29);
    const from = this.h * 1.03;
    const t = rise || rndRange(0.58, 0.92);
    const d = Math.max(80, from - apex);
    const color = rnd() < 0.72 ? pick(WARM) : pick(COOL);

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
      shape: shape || pick(SHAPES),
      sprite,
    });
  }

  burst(x, y, color, shape) {
    const key = shape || pick(SHAPES);
    const spec = SHAPE[key];
    const second =
      rnd() < 0.42 ? (WARM.includes(color) ? pick(COOL) : pick(WARM)) : color;

    this.flare(x, y, color, BIG.includes(key));

    const room = MAX_SPARKS - this.sparks.length;
    if (room <= 0) return;
    const n = Math.min(spec.count, room);
    const base = rndRange(310, 430) * spec.speed * this.unit;
    const turn = rndRange(0, Math.PI * 2);
    const tilt = key === "ring" ? rndRange(0.28, 0.62) : 1;

    for (let i = 0; i < n; i++) {
      const step = (Math.PI * 2) / n;
      const ang = turn + i * step + rndRange(-step * 0.45, step * 0.45);
      const lo = spec.spread[0];
      const power = base * Math.sqrt(rndRange(lo * lo, 1));
      const own = i % 2 ? second : color;
      this.spawn(x, y, Math.cos(ang) * power, Math.sin(ang) * power * tilt, {
        color: own,
        grav: spec.grav * this.unit,
        drag: spec.drag,
        ttl: rndRange(spec.ttl[0], spec.ttl[1]),
        twinkle: rnd() < spec.twinkle,
        tail: spec.tail,
        size: rndRange(spec.size[0], spec.size[1]) * this.unit,
        glitter: spec.glitter,
        shift: rnd() < spec.shift ? (own === color ? second : color) : 0,
        split: spec.split || null,
        splitAt: spec.split ? rndRange(spec.splitAt[0], spec.splitAt[1]) : 0,
      });
    }
  }

  flare(x, y, color, big) {
    const sprite = this.acquire(glowTexture());
    sprite.tint = color;
    sprite.x = x;
    sprite.y = y;
    const w = rndRange(120, 168) * this.unit * (big ? 1.18 : 1);
    sprite.setSize(w, w);
    this.marks.push({ sprite, t: 0, ttl: 0.44, w, fade: 0.5 });

    const core = this.acquire(glowTexture());
    core.tint = 0xfffdf2;
    core.x = x;
    core.y = y;
    const cw = w * 0.3;
    core.setSize(cw, cw);
    this.marks.push({ sprite: core, t: 0, ttl: 0.14, w: cw, fade: 0.8 });
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
      glitter: opt.glitter || 0,
      dust: 0,
      shift: opt.shift || 0,
      shifted: false,
      split: opt.split || null,
      splitAt: opt.splitAt || 0,
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
        this.beat++;
        if (this.beat >= this.salvo) {
          const n = 2 + ((rnd() * 2) | 0);
          for (let i = 0; i < n; i++) {
            this.launch(rndRange(0.5, 0.95), i ? undefined : pick(BIG));
          }
          this.salvo = this.beat + (rndRange(SALVO_GAP[0], SALVO_GAP[1]) | 0);
        } else {
          this.launch();
        }
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
      let puffs = TRAIL_BURST;
      while (sh.trail >= TRAIL_STEP && puffs--) {
        sh.trail -= TRAIL_STEP;
        const back = (puffs / TRAIL_BURST) * dt;
        this.spawn(
          sh.x - sh.vx * back + rndRange(-3, 3),
          sh.y - sh.vy * back + rndRange(-3, 3) + 8 * this.unit,
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
      if (sh.trail >= TRAIL_STEP) sh.trail = 0;

      if (sh.t >= sh.fuse) {
        this.release(sh.sprite);
        this.shells.splice(i, 1);
        this.burst(sh.x, sh.y, sh.color, sh.shape);
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
      const w = m.w * (1 + k * 0.7);
      m.sprite.setSize(w, w);
      m.sprite.alpha = (1 - k) * (1 - k) * m.fade;
    }
  }

  stepSparks(dt) {
    const damp = Math.exp(-dt);
    const room = this.sparks.length < MAX_SPARKS * GLITTER_ROOM;
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

      if (p.split && p.t >= p.splitAt) {
        this.shatter(p);
        this.release(p.sprite);
        this.sparks.splice(i, 1);
        continue;
      }

      if (p.shift && !p.shifted && k > 0.42) {
        p.shifted = true;
        p.sprite.tint = p.shift;
      }

      if (p.glitter && room && k > 0.2) {
        p.dust += dt * p.glitter;
        let motes = DUST_BURST;
        while (p.dust >= 1 && motes--) {
          p.dust -= 1;
          this.spawn(p.x, p.y, rndRange(-18, 18), rndRange(-18, 18), {
            color: 0xfff0c8,
            grav: 60 * this.unit,
            drag: 4.2,
            ttl: rndRange(0.14, 0.3),
            twinkle: false,
            tail: 0.3,
            size: rndRange(2.4, 4.2) * this.unit,
          });
        }
        if (p.dust >= 1) p.dust = 0;
      }

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

  shatter(p) {
    const s = p.split;
    const turn = rndRange(0, Math.PI * 2);
    const speed = s.speed * this.unit;
    for (let i = 0; i < s.n; i++) {
      const ang = turn + (i * Math.PI * 2) / s.n;
      this.spawn(
        p.x,
        p.y,
        p.vx * 0.22 + Math.cos(ang) * speed,
        p.vy * 0.22 + Math.sin(ang) * speed,
        {
          color: p.sprite.tint,
          grav: p.grav * 0.8,
          drag: 2.4,
          ttl: rndRange(s.ttl[0], s.ttl[1]),
          twinkle: rnd() < 0.5,
          tail: s.tail,
          size: rndRange(s.size[0], s.size[1]) * this.unit,
        },
      );
    }
  }
}
