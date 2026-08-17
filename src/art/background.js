/**
 * Arena backdrop: a painted sky fortress above a cloud sea, framed so the cloud
 * shelf under the castle lands exactly on the boss floor — the same line the
 * boss rig is masked at, so the golem rises out of the cloud bank *in the
 * picture* instead of in front of it.
 *
 * Everything layered on top of the bitmap is still procedural: the light bloom
 * on the cloud line, the drifting motes and the scrim that keeps the board
 * readable all reflow with the layout, and they are what stop a still image
 * from reading as one.
 */

import { Container, Sprite, Texture, ImageSource } from "pixi.js";
import { glowTexture, gradientTexture } from "./textures.js";
import arenaUrl from "../assets/arena-sky.webp";

/**
 * Height fraction of the source art where the cloud shelf sits.
 *
 * Measured on the *packed* file, not the export it came from: tools/pack-arena
 * cuts the flat blue off the top precisely so this number lands somewhere the
 * fit below can actually reach.
 */
const HORIZON = 0.58;

/**
 * Extra scale on top of a plain cover fit. Without slack there is no room to
 * slide the picture at all, and the cloud line cannot be pinned to the boss
 * floor.
 *
 * Higher than the lava arena needed. The boss floor sits around 0.42 down a
 * portrait screen and the cloud line is at 0.58 of the art, so the picture has
 * to ride further up than a cover fit alone allows — the slack *is* the range
 * the pin has to work in, and at 1.14 the clamp in fitArena eats the pin and
 * the boss goes back to floating.
 *
 * Do not raise this to make the pin exact everywhere. It is a seesaw, and the
 * two ends are the only two ways this backdrop can look wrong:
 *
 *   1.40   boss floats up to 7.2% of the screen above the cloud   castle whole
 *   1.45   floats up to 5.1%                                      tips cut 1%
 *   1.60   pins exactly on every screen                           tips cut 6.8%
 *
 * The art is what forces the choice: a fifth of the painting's height sits
 * between the spire tips and the cloud shelf, and the shortest screens do not
 * have that much room above the boss floor to give it. Cropping the source
 * differently does not help — it scales both sides of the gap together.
 *
 * 1.45 because the failures are not equally visible. The float is covered: the
 * bloom sprite is 0.16 of the screen tall and centred on the floor, and what
 * sits just above the shelf in the picture is the fortress's own base and its
 * glow, not empty blue — so the boss reads as standing in haze rather than
 * hovering. A clipped spire is a clipped spire, on the one silhouette the
 * whole backdrop is composed around.
 */
const OVERSCAN = 1.45;

/** Fallback wash, and the base colour behind the bitmap either way. */
const SKY_STOPS = [
  [0.0, "#2d5687"],
  [0.3, "#7ea6cb"],
  [0.55, "#e3d7c0"],
  [0.78, "#b9b3ae"],
  [1.0, "#7d8496"],
];

/**
 * Darkening under the cloud line. The painted cloud sea is bright and busy and
 * the board sits straight on top of it — this is the difference between a
 * readable board and a pretty screenshot.
 *
 * Blue-black rather than the lava arena's near-black: over a sky this reads as
 * the shadow under the cloud deck, where neutral black reads as a bar someone
 * laid over the art.
 */
const SCRIM_STOPS = [
  [0.0, "rgba(10,16,34,0)"],
  [0.3, "rgba(10,16,34,0.52)"],
  [0.62, "rgba(10,16,34,0.84)"],
  [1.0, "rgba(10,16,34,0.95)"],
];

/**
 * Darkening behind the health bar and the boss name.
 *
 * A gradient rather than the flat band the drawn arena used: over a painting,
 * a hard-edged rectangle of black reads as a rendering bug, not as depth.
 * Deeper than the lava arena carried, because the strip it has to hold type
 * against is now lit sky rather than a black ceiling.
 */
const CROWN_STOPS = [
  [0.0, "rgba(6,11,26,0.72)"],
  [0.5, "rgba(6,11,26,0.3)"],
  [1.0, "rgba(6,11,26,0)"],
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

    // Light haze on the cloud line. The boss rig is masked at exactly this
    // height, and a soft glow is what makes that cut read as cloud rather than
    // as a straight edge somebody forgot to hide.
    this.bloom = new Sprite(glowTexture());
    this.bloom.anchor.set(0.5);
    this.bloom.blendMode = "add";
    this.bloom.tint = 0xffdca8;
    this.bloom.alpha = 0.34;
    this.addChild(this.bloom);

    // Pulsing light pools along the cloud line. Sprites, not redrawn geometry —
    // a per-frame Graphics rebuild is the one thing an old phone cannot afford.
    this.shafts = [];
    for (let i = 0; i < 7; i++) {
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.blendMode = "add";
      // Warm against cool, the two lights already in the painting: the gold off
      // the fortress and the blue the open sky bounces back into the cloud.
      s.tint = i % 2 ? 0xffefcc : 0xcfe4ff;
      this.shafts.push(s);
      this.addChild(s);
    }

    this.motes = [];
    for (let i = 0; i < 22; i++) {
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.blendMode = "add";
      s.tint = 0xffeecb;
      this.motes.push(s);
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

    const deckY = layout.boss.floor;
    this.deckY = deckY;

    this.sky.setSize(w, h);
    if (this.arena) this.fitArena(w, h, deckY);

    this.bloom.setSize(w * 1.5, h * 0.16);
    this.bloom.x = w / 2;
    this.bloom.y = deckY;

    // Starts a touch under the cloud line so the boss keeps its bright footing.
    const scrimTop = deckY + h * 0.03;
    this.scrim.x = 0;
    this.scrim.y = scrimTop;
    this.scrim.setSize(w, Math.max(1, h - scrimTop));

    // Deep enough to clear the bar and the boss name in either orientation.
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
      // Slower than the lava arena's embers. Embers are thrown off a fire and
      // shoot; motes are lit dust hanging in still air, and at ember speed the
      // same sprites read as sparks over a sky that has nothing burning in it.
      s.speed = 0.035 + Math.random() * 0.06;
      s.sway = 8 + Math.random() * 22;
      s.deckY = deckY;
    });
  }

  /**
   * Cover the screen, then slide the picture until its cloud line sits on the
   * boss floor — clamped so an edge of the bitmap can never come into frame.
   *
   * A 2.6:1 painting on a 9:16 phone is mostly crop, so the anchor matters more
   * than the fit: get the cloud line wrong and the boss floats in open sky.
   */
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
      // Slower than the lava pulse, and shallower. Lava throbs; light on cloud
      // breathes, and the painting is already bright here — an additive glow
      // over lit cloud buys far less than it did over black rock, so pushing
      // it harder only greys the cloud out.
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
