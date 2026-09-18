import { Container } from "pixi.js";
import { LottieClip } from "./lottie.js";
import burstClip from "../assets/outcome/fireworks.json";
import { rnd, rndRange } from "../core/rng.js";

const POOL = 8;

const HERO_SPOT = { nx: 0.5, ny: 0.33, k: 1 / 0.74 };

const OPENING = [0, 0.2];
const GAP = [0.44, 0.72];
const SALVO_CHANCE = 0.34;
const SALVO = [2, 3];
const TRAIL = [0.09, 0.24];

const SPAN_X = { portrait: [0.14, 0.46], landscape: [0.1, 0.43] };
const SPAN_Y = { portrait: [0.12, 0.5], landscape: [0.14, 0.62] };
const SIZE = { portrait: [0.5, 1], landscape: [0.62, 1.25] };
const RATE = [0.85, 1.3];
const SPIN = 0.42;
const FADE = [0.7, 1];

export class Fireworks extends Container {
  constructor() {
    super();
    this.eventMode = "none";
    this.w = 0;
    this.h = 0;
    this.running = false;
    this.next = 0;
    this.queue = [];
    this.clips = [];
    this.side = 0;
    this.key = "portrait";
  }

  resize(layout) {
    this.w = layout.w;
    this.h = layout.h;
    this.key = layout.portrait ? "portrait" : "landscape";
    this.clips.forEach((clip) => this.place(clip));
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.next = rndRange(GAP[0], GAP[1]);
    OPENING.forEach((wait) => this.queue.push(wait));
  }

  stop() {
    this.running = false;
    this.queue.length = 0;
  }

  clear() {
    this.stop();
    this.clips.forEach((clip) => {
      clip.clear();
      clip.spot = null;
    });
  }

  hero() {
    const clip = this.free();
    if (!clip) return;
    clip.spot = HERO_SPOT;
    clip.rotation = 0;
    clip.scale.set(1);
    clip.alpha = 1;
    clip.rate = 1;
    this.place(clip);
    clip.play();
  }

  launch() {
    if (!this.w) return;
    const clip = this.free();
    if (!clip) return;
    const span = SPAN_X[this.key];
    const drop = SPAN_Y[this.key];
    const size = SIZE[this.key];
    const off = rndRange(span[0], span[1]);
    this.side ^= 1;
    clip.spot = {
      nx: this.side ? 0.5 + off : 0.5 - off,
      ny: rndRange(drop[0], drop[1]),
      k: rndRange(size[0], size[1]),
    };
    clip.rotation = rndRange(-SPIN, SPIN);
    clip.scale.set(rnd() < 0.5 ? -1 : 1, 1);
    clip.alpha = rndRange(FADE[0], FADE[1]);
    clip.rate = rndRange(RATE[0], RATE[1]);
    this.place(clip);
    clip.play();
  }

  volley() {
    this.launch();
    if (rnd() >= SALVO_CHANCE) return;
    const extra = (rndRange(SALVO[0], SALVO[1]) | 0) - 1;
    for (let i = 0; i < extra; i++) {
      this.queue.push(rndRange(TRAIL[0], TRAIL[1]));
    }
  }

  free() {
    const idle = this.clips.find((clip) => !clip.playing);
    if (idle) return idle;
    if (this.clips.length >= POOL) return null;

    const clip = new LottieClip(burstClip);
    clip.blendMode = "add";
    clip.spot = null;
    this.addChild(clip);
    this.clips.push(clip);
    return clip;
  }

  place(clip) {
    const spot = clip.spot;
    if (!spot || !this.w) return;
    clip.pin(
      this.w * spot.nx,
      this.h * spot.ny,
      Math.min(this.w, this.h) * spot.k,
    );
  }

  update(dt) {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      this.queue[i] -= dt;
      if (this.queue[i] > 0) continue;
      this.queue.splice(i, 1);
      this.launch();
    }

    if (this.running) {
      this.next -= dt;
      if (this.next <= 0) {
        this.volley();
        this.next = rndRange(GAP[0], GAP[1]);
      }
    }

    this.clips.forEach((clip) => clip.update(dt));
  }
}
