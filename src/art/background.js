/**
 * Arena backdrop: a painted demon gate over a cracked stone courtyard, framed
 * so the courtyard floor lands exactly on the boss floor — the same line the
 * boss rig is masked at, so the golem stands on the stone *in the picture*
 * instead of in front of it.
 *
 * This replaced a gold-lit sky fortress above a cloud sea, and the swap is the
 * whole answer to a note that said the boss did not read as a boss. It was
 * true, and it was never the boss's fault: a sunlit castle in an open sky is a
 * hero's establishing shot, and the darkest silhouette in the creative was
 * standing in the middle of one. The grade below still runs, but it is now a
 * light touch on art that arrives dark rather than a rescue of art that does
 * not — see DOOM_GRADE for what that cost when it was the only tool there was.
 *
 * Everything layered on top of the bitmap is still procedural: the firelight on
 * the floor line, the drifting embers and the scrim that keeps the board
 * readable all reflow with the layout, and they are what stop a still image
 * from reading as one.
 */

import { Container, Sprite, Texture, ImageSource } from "pixi.js";
import { glowTexture, gradientTexture } from "./textures.js";
import { BOSS_ART } from "../core/layout.js";
import arenaUrl from "../assets/arena/sky.webp";

/**
 * Height fraction of the source art where the courtyard floor sits.
 *
 * Measured on the *packed* file, not the render it came from: the stone starts
 * at 0.63 of the delivered square, and tools/pack-arena cuts 26% off the top
 * precisely so this number lands somewhere the fit below can actually reach.
 * Change one of the two and the other is wrong.
 */
const HORIZON = 0.5;

/**
 * Extra scale on top of a plain cover fit. Without slack there is no room to
 * slide the picture at all, and the floor line cannot be pinned to the boss
 * floor.
 *
 * There is a hard floor under this number, and it is worth writing down because
 * it is the thing that decides the crop in tools/pack-arena. The pin is only
 * reachable while
 *
 *     OVERSCAN >= (1 - bossFloor/screenHeight) / (1 - HORIZON)
 *
 * and the boss floor sits about 0.42 down a portrait screen, so with HORIZON at
 * 0.50 the minimum is 1.16. Below it the fit clamps and the golem walks up off
 * the stone into the middle distance.
 *
 * 1.25 rather than that 1.16, and rather than the 1.45 the sky castle needed.
 * The slack over the minimum is what absorbs a screen shorter than 9:16 — an
 * iPhone SE still pins exactly at 1.25 — and every point above it is paid for
 * twice: it magnifies a 928-row source further, and it narrows the strip of a
 * 1.35:1 painting that a portrait phone gets to show at all. At 1.25 that strip
 * is about 27% of the width, centred, which is the gate's left pillar, the
 * doorway and the stairs. Push it back to 1.45 and it is 24%, softer, for
 * nothing.
 */
const OVERSCAN = 1.25;

/**
 * Fallback wash, and the base colour behind the bitmap either way.
 *
 * Repainted with the arena. It was a blue-to-cream sky because the painting in
 * front of it was one; a device that cannot decode WebP now falls through to an
 * ember dusk over dark stone, which is plain but is at least the same fight. A
 * fallback left in the old palette would be a bright blue hole in the one
 * screen the whole creative is composed on.
 */
const SKY_STOPS = [
  [0.0, "#2b1420"],
  [0.34, "#6d2a24"],
  [0.52, "#c25a22"],
  [0.66, "#7a4030"],
  [1.0, "#2a1b1c"],
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

/**
 * The doom grade — three sprites that seat the boss in the picture.
 *
 * Written when the painting under it was a gold-lit sky fortress and these were
 * the only tools there were: the brightest ground in the creative with the
 * darkest silhouette in the creative standing on it, and no budget for new art.
 * They carried it, at a cost — grading a bright painting dark spends contrast
 * the painting never gets back, and at the alphas that shipped, the cloud sea
 * came out flat.
 *
 * The gate render made the job small. It arrives dark, lit by its own fires,
 * already the tone the grade was faking, so what is left for these three is
 * seating rather than rescue — and the alphas below are about a third of what
 * they were, which is the whole reason the stone still has depth in it.
 *
 * Three sprites, and not one of them is a new asset:
 *
 *   1. `grade` takes the whole painting down a fifth and cools it a little,
 *      which pulls the sunset off the top of the frame and stops the stone
 *      competing with the hero cards to be the warmest thing on screen.
 *   2. `pool` is a soft dark ellipse pinned behind the beast's mass. It is the
 *      one thing here aimed at the boss rather than at the sky, and it is the
 *      one that actually does the job: the figure is a dark shape, the cloud
 *      line behind it is the brightest band in the painting, and no amount of
 *      overall darkening separates those two — only darkening exactly where the
 *      silhouette is does.
 *   3. `ember` is firelight along the floor line, which is what stops 1 and 2
 *      reading as a screenshot with the brightness pulled down. The braziers in
 *      the painting are already doing this; the sprite is what makes it move.
 *
 * Tuned as one, so move them as one. If the arena art is ever replaced again,
 * take GRADE_ALPHA and POOL_ALPHA in the direction the new art needs — up over
 * a bright painting, down over a dark one. Left high over dark art they give a
 * black screen with a monster somewhere in it, which is the opposite failure
 * and no better than the one they were written for.
 */
const GRADE_TINT = 0x9a90a6;
const GRADE_ALPHA = 0.2;

/** The dark the silhouette is read against. */
const POOL_TINT = 0x4a3c50;
const POOL_ALPHA = 0.4;

/**
 * The two fires on the deck: the haze the beast's feet stand in, and the wider
 * wash under it. Ember rather than the gold the haze used to carry — whatever
 * colour this is, the boss is standing in it.
 */
const BLOOM_TINT = 0xff8a44;
const EMBER_TINT = 0xff5a1e;

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

    // Storm grade over the painting — see the block above for why a sunlit sky
    // fortress has to come down before a boss can stand in front of it.
    this.grade = new Sprite(Texture.WHITE);
    this.grade.blendMode = "multiply";
    this.grade.tint = GRADE_TINT;
    this.grade.alpha = GRADE_ALPHA;
    this.addChild(this.grade);

    // Light haze on the cloud line. The boss rig is masked at exactly this
    // height, and a soft glow is what makes that cut read as cloud rather than
    // as a straight edge somebody forgot to hide.
    //
    // Half the strength it carried, and ember instead of gold. The haze is the
    // one bright thing touching the beast's feet, so it lights the beast: at
    // 0.34 of warm gold it was lighting the golem from below the way a hero
    // shot lights a hero. Same seam hidden, from something burning rather than
    // from the fortress in the distance.
    this.bloom = new Sprite(glowTexture());
    this.bloom.anchor.set(0.5);
    this.bloom.blendMode = "add";
    this.bloom.tint = BLOOM_TINT;
    this.bloom.alpha = 0.18;
    this.addChild(this.bloom);

    // The fire under the deck. This is what keeps `grade` and `pool` from
    // reading as a brightness slider rather than as a time of day.
    this.ember = new Sprite(glowTexture());
    this.ember.anchor.set(0.5);
    this.ember.blendMode = "add";
    this.ember.tint = EMBER_TINT;
    this.ember.alpha = 0.3;
    this.addChild(this.ember);

    // Pulsing light pools along the cloud line. Sprites, not redrawn geometry —
    // a per-frame Graphics rebuild is the one thing an old phone cannot afford.
    this.shafts = [];
    for (let i = 0; i < 7; i++) {
      const s = new Sprite(glowTexture());
      s.anchor.set(0.5);
      s.blendMode = "add";
      // Ember against rune, the two lights the *fight* has, in place of the two
      // the painting had. The gold off the fortress and the blue off the open
      // sky are exactly the pair that made this deck read as a good character's
      // ground; the boss's own fire and the violet on its runes are the pair
      // that make it read as its floor.
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

    // The hole the boss is cut out of. Last of the sky layers, and over every
    // light in it on purpose: the shafts and the motes are what the beast would
    // otherwise be read against, and a pool underneath them would be brightened
    // straight back over the silhouette by the two brightest things up here.
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

    // Sized off the beast and not off the screen, which is the difference
    // between the two orientations working and one of them working. In
    // portrait the golem is most of the width and a pool measured in screen
    // widths happens to fit it; held sideways the same figure is a third of
    // the width and sits left of centre, and a pool that wide stops being a
    // pool — it is an even wash over the whole sky, which darkens the picture
    // without separating anything from it.
    //
    // Centred on the mass rather than on the floor: the silhouette stands well
    // above its own feet, and a pool pinned to the floor line darkens the deck
    // the boss is lit *against* instead of the sky it is read against.
    const reach = layout.boss.scale;
    this.pool.setSize(BOSS_ART.w * reach * 1.7, BOSS_ART.h * reach * 1.9);
    this.pool.x = layout.boss.x;
    this.pool.y = deckY - BOSS_ART.h * reach * 0.42;

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
