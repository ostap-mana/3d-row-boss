import { Container, Sprite, Texture, ImageSource } from "pixi.js";
import { glowTexture, gradientTexture } from "./textures.js";
import { BOSS_ART } from "../core/layout.js";
import arenaUrl from "../assets/arena/sky.webp";

const HORIZON = 0.38;

const OVERSCAN = 1.25;

const SKY_STOPS = [
  [0.0, "#5c5688"],
  [0.22, "#674c6e"],
  [0.42, "#412d3e"],
  [0.6, "#0b0911"],
  [1.0, "#040306"],
];

const SCRIM_STOPS = [
  [0.0, "rgba(10,16,34,0)"],
  [0.3, "rgba(10,16,34,0.52)"],
  [0.62, "rgba(10,16,34,0.84)"],
  [1.0, "rgba(10,16,34,0.95)"],
];

const CROWN_STOPS = [
  [0.0, "rgba(6,11,26,0.54)"],
  [0.5, "rgba(6,11,26,0.3)"],
  [1.0, "rgba(6,11,26,0)"],
];

const GRADE_TINT = 0x9a90a6;
const GRADE_ALPHA = 0.08;

const POOL_TINT = 0x241d2a;
const POOL_ALPHA = 0.78;

const BLOOM_TINT = 0xff8a44;
const EMBER_TINT = 0xff5a1e;

let arenaTexture = null;

export async function loadArena() {
  if (arenaTexture) return arenaTexture;
  try {
    const img = new Image();
    img.src = arenaUrl;
    await img.decode();
    arenaTexture = new Texture({ source: new ImageSource({ resource: img }) });
  } catch {
    arenaTexture = null;
  }
  return arenaTexture;
}

export class Background extends Container {
  constructor() {
    super();

    this.sky = new Sprite(gradientTexture("sky", SKY_STOPS));
    this.addChild(this.sky);

    if (arenaTexture) {
      this.arena = new Sprite(arenaTexture);
      this.addChild(this.arena);
    }

    this.grade = new Sprite(Texture.WHITE);
    this.grade.blendMode = "multiply";
    this.grade.tint = GRADE_TINT;
    this.grade.alpha = GRADE_ALPHA;
    this.addChild(this.grade);

    this.bloom = new Sprite(glowTexture());
    this.bloom.anchor.set(0.5);
    this.bloom.blendMode = "add";
    this.bloom.tint = BLOOM_TINT;
    this.bloom.alpha = 0.18;
    this.addChild(this.bloom);

    this.ember = new Sprite(glowTexture());
    this.ember.anchor.set(0.5);
    this.ember.blendMode = "add";
    this.ember.tint = EMBER_TINT;
    this.ember.alpha = 0.3;
    this.addChild(this.ember);

    this.shafts = [];
    for (let i = 0; i < 7; i++) {
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.blendMode = "add";
      s.tint = i % 2 ? 0xff8a3d : 0x7a6cff;
      this.shafts.push(s);
      this.addChild(s);
    }

    this.motes = [];
    for (let i = 0; i < 22; i++) {
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.blendMode = "add";
      s.tint = 0xff9a4a;
      this.motes.push(s);
      this.addChild(s);
      s.life = Math.random();
    }

    this.pool = new Sprite(glowTexture());
    this.pool.anchor.set(0.5);
    this.pool.blendMode = "multiply";
    this.pool.tint = POOL_TINT;
    this.pool.alpha = POOL_ALPHA;
    this.addChild(this.pool);

    this.scrim = new Sprite(gradientTexture("scrim", SCRIM_STOPS));
    this.addChild(this.scrim);

    this.crown = new Sprite(gradientTexture("crown", CROWN_STOPS));
    this.addChild(this.crown);

    this.t = 0;
    this.layout = null;
  }

  resize(layout) {
    this.layout = layout;
    const { w, h } = layout;

    const deckY = layout.boss.floor;
    this.deckY = deckY;

    this.sky.setSize(w, h);
    if (this.arena) this.fitArena(w, h, deckY);

    this.grade.setSize(w, h);

    this.bloom.setSize(w * 1.5, h * 0.16);
    this.bloom.x = w / 2;
    this.bloom.y = deckY;

    this.ember.setSize(w * 1.6, h * 0.13);
    this.ember.x = w / 2;
    this.ember.y = deckY + h * 0.02;

    const reach = layout.boss.scale;
    this.pool.setSize(BOSS_ART.w * reach * 1.7, BOSS_ART.h * reach * 1.9);
    this.pool.x = layout.boss.x;
    this.pool.y = deckY - BOSS_ART.h * reach * 0.42;

    const scrimTop = deckY + h * 0.03;
    this.scrim.x = 0;
    this.scrim.y = scrimTop;
    this.scrim.setSize(w, Math.max(1, h - scrimTop));

    this.crown.setSize(w, Math.max(layout.hud.y + layout.hud.h * 4, h * 0.16));

    this.shafts.forEach((s, i) => {
      const span = w * 0.42;
      s.x = (w / (this.shafts.length - 1)) * i;
      s.y = deckY + h * 0.012;
      s.setSize(span, span * 0.5);
      s.baseSX = s.scale.x;
      s.phase = i * 0.9;
    });

    this.motes.forEach((s) => {
      const size = 6 + Math.random() * 10;
      s.setSize(size * 2.4, size * 2.4);
      s.baseX = Math.random() * w;
      s.speed = 0.035 + Math.random() * 0.06;
      s.sway = 8 + Math.random() * 22;
      s.deckY = deckY;
    });
  }

  fitArena(w, h, deckY) {
    const tex = this.arena.texture;
    const scale = Math.max(w / tex.width, h / tex.height) * OVERSCAN;
    const dw = tex.width * scale;
    const dh = tex.height * scale;

    this.arena.setSize(dw, dh);
    this.arena.x = (w - dw) / 2;
    this.arena.y = Math.min(0, Math.max(h - dh, deckY - HORIZON * dh));
  }

  update(dt) {
    if (!this.layout) return;
    this.t += dt;
    const { w, h } = this.layout;

    for (let i = 0; i < this.shafts.length; i++) {
      const s = this.shafts[i];
      const p = Math.sin(this.t * 1.1 + s.phase);
      s.alpha = 0.13 + p * 0.07;
      s.scale.x = s.baseSX * (1 + p * 0.06);
    }

    for (let i = 0; i < this.motes.length; i++) {
      const s = this.motes[i];
      s.life += dt * s.speed;
      if (s.life > 1) {
        s.life -= 1;
        s.baseX = Math.random() * w;
      }
      const travel = h * 0.55;
      s.x = s.baseX + Math.sin(s.life * 9 + i) * s.sway;
      s.y = s.deckY - s.life * travel;
      s.alpha = Math.sin(s.life * Math.PI) * 0.6;
    }
  }
}
