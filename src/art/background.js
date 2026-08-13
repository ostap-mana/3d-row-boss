/**
 * Arena backdrop: a painted lava field, framed so its shore line lands exactly
 * on the boss floor — the same line the boss rig is masked at, so the golem
 * climbs out of the lava *in the picture* instead of in front of it.
 *
 * Everything layered on top of the bitmap is still procedural: the shore glow,
 * the drifting embers and the scrim that keeps the board readable all reflow
 * with the layout, and they are what stop a still image from reading as one.
 */

import { Container, Sprite, Texture, ImageSource } from "pixi.js";
import { glowTexture, gradientTexture } from "./textures.js";
import arenaUrl from "../assets/background.webp";

/** Height fraction of the source art where the lava shore sits. */
const HORIZON = 0.5;

/**
 * Extra scale on top of a plain cover fit. Without slack there is no room to
 * slide the picture at all, and the shore cannot be pinned to the boss floor.
 */
const OVERSCAN = 1.14;

/** Fallback wash, and the base colour behind the bitmap either way. */
const SKY_STOPS = [
  [0.0, "#0a0610"],
  [0.32, "#1b0d1c"],
  [0.6, "#3a1418"],
  [0.82, "#7d2409"],
  [1.0, "#ff8420"],
];

/**
 * Darkening under the shore. The painted plateau is busy and bright in places
 * and the board sits straight on top of it — this is the difference between a
 * readable board and a pretty screenshot.
 */
const SCRIM_STOPS = [
  [0.0, "rgba(9,5,15,0)"],
  [0.3, "rgba(9,5,15,0.5)"],
  [0.62, "rgba(9,5,15,0.82)"],
  [1.0, "rgba(9,5,15,0.94)"],
];

/**
 * Darkening behind the health bar and the boss name.
 *
 * A gradient rather than the flat band the drawn arena used: over a painting,
 * a hard-edged rectangle of black reads as a rendering bug, not as depth.
 */
const CROWN_STOPS = [
  [0.0, "rgba(0,0,0,0.66)"],
  [0.5, "rgba(0,0,0,0.26)"],
  [1.0, "rgba(0,0,0,0)"],
];

let arenaTexture = null;

/**
 * Decode the arena bitmap before the first frame is drawn.
 *
 * Never rejects: a device that cannot decode WebP falls through to the
 * gradient sky, which is plain but is still an arena rather than a black
 * screen. A creative that shows nothing is worse than one that shows less.
 */
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

    // Heat haze on the shore line. The boss rig is masked at exactly this
    // height, and a soft glow is what makes that cut read as lava rather than
    // as a straight edge somebody forgot to hide.
    this.shore = new Sprite(glowTexture());
    this.shore.anchor.set(0.5);
    this.shore.blendMode = "add";
    this.shore.tint = 0xff7a1a;
    this.shore.alpha = 0.5;
    this.addChild(this.shore);

    // Pulsing hot spots along the shore. Sprites, not redrawn geometry — a
    // per-frame Graphics rebuild is the one thing an old phone cannot afford.
    this.hotspots = [];
    for (let i = 0; i < 7; i++) {
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.blendMode = "add";
      s.tint = i % 2 ? 0xff7a1a : 0xffc247;
      this.hotspots.push(s);
      this.addChild(s);
    }

    this.embers = [];
    for (let i = 0; i < 22; i++) {
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.blendMode = "add";
      s.tint = 0xffa53d;
      this.embers.push(s);
      this.addChild(s);
      s.life = Math.random();
    }

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

    const lavaY = layout.boss.floor;
    this.lavaY = lavaY;

    this.sky.setSize(w, h);
    if (this.arena) this.fitArena(w, h, lavaY);

    this.shore.setSize(w * 1.5, h * 0.16);
    this.shore.x = w / 2;
    this.shore.y = lavaY;

    // Starts a touch under the shore so the boss keeps its bright footing.
    const scrimTop = lavaY + h * 0.03;
    this.scrim.x = 0;
    this.scrim.y = scrimTop;
    this.scrim.setSize(w, Math.max(1, h - scrimTop));

    // Deep enough to clear the bar and the boss name in either orientation.
    this.crown.setSize(w, Math.max(layout.hud.y + layout.hud.h * 4, h * 0.16));

    this.hotspots.forEach((s, i) => {
      const span = w * 0.42;
      s.x = (w / (this.hotspots.length - 1)) * i;
      s.y = lavaY + h * 0.012;
      s.setSize(span, span * 0.5);
      s.baseSX = s.scale.x;
      s.phase = i * 0.9;
    });

    this.embers.forEach((s) => {
      const size = 6 + Math.random() * 10;
      s.setSize(size * 2.4, size * 2.4);
      s.baseX = Math.random() * w;
      s.speed = 0.06 + Math.random() * 0.1;
      s.sway = 8 + Math.random() * 22;
      s.lavaY = lavaY;
    });
  }

  /**
   * Cover the screen, then slide the picture until its shore sits on the boss
   * floor — clamped so an edge of the bitmap can never come into frame.
   *
   * A 16:9 painting on a 9:16 phone is mostly crop, so the anchor matters more
   * than the fit: get the shore wrong and the boss floats or stands in rock.
   */
  fitArena(w, h, lavaY) {
    const tex = this.arena.texture;
    const scale = Math.max(w / tex.width, h / tex.height) * OVERSCAN;
    const dw = tex.width * scale;
    const dh = tex.height * scale;

    this.arena.setSize(dw, dh);
    this.arena.x = (w - dw) / 2;
    this.arena.y = Math.min(0, Math.max(h - dh, lavaY - HORIZON * dh));
  }

  update(dt) {
    if (!this.layout) return;
    this.t += dt;
    const { w, h } = this.layout;

    for (let i = 0; i < this.hotspots.length; i++) {
      const s = this.hotspots[i];
      const p = Math.sin(this.t * 1.6 + s.phase);
      // Softer than the drawn arena needed: the painting already glows here.
      s.alpha = 0.2 + p * 0.12;
      s.scale.x = s.baseSX * (1 + p * 0.06);
    }

    for (let i = 0; i < this.embers.length; i++) {
      const s = this.embers[i];
      s.life += dt * s.speed;
      if (s.life > 1) {
        s.life -= 1;
        s.baseX = Math.random() * w;
      }
      const travel = h * 0.55;
      s.x = s.baseX + Math.sin(s.life * 9 + i) * s.sway;
      s.y = s.lavaY - s.life * travel;
      s.alpha = Math.sin(s.life * Math.PI) * 0.75;
    }
  }
}
