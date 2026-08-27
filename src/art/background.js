/**
 * Arena backdrop: a chain of floating islands under a mint sky, framed so the
 * front lip of the near island lands exactly on the boss floor — the same line
 * the boss rig is masked at, so the golem stands on the rock *in the picture*
 * instead of in front of it.
 *
 * Sixth painting in this slot, and the first that is not a render made for it.
 * It is `T_CAM_Lobby_Background_01` out of the Invokers Titan Legacy build: the
 * game this creative advertises, so the arena is now that game's own sky rather
 * than a painting of somewhere like it. The five before it were a gold-lit sky
 * fortress, a demon gate over a stone courtyard, a violet city over a fog
 * chasm, a burning rift, and a lightning storm over a ruined spire city.
 *
 * The measurement that matters is the one that goes the wrong way, and it is
 * the reason two constants below moved further in this swap than in any before
 * it. Over the band directly behind the beast's mass — the only part of the
 * picture the silhouette is actually read against — the storm plate came in at
 * 53 mean luminance. This one comes in at 157. It is a lobby background: it was
 * lit to sit behind menus, and the middle of it is open mist from edge to edge.
 * No ground line in it measures better; taken at every candidate from 0.45 to
 * 0.76 the band runs between two and three times the plate it replaces.
 *
 * So the darkening moved off the picture and onto the boss. GRADE_ALPHA — a
 * global multiply — came *down*, because the half of its job that survived the
 * storm swap was darkening a bright top of frame and this frame's top is 55
 * where the storm's was 116. POOL_ALPHA, the one layer aimed at the silhouette
 * rather than at the picture, went up hard and its tint went darker with it.
 * Graded, the band behind the beast lands at 48 against the storm's 38: not the
 * same reading, and honestly not reachable from a source three times as bright,
 * but a silhouette that separates. See both constants for the arithmetic.
 *
 * What the swap buys back is colour and cold. The frame is teal and violet with
 * no warm light anywhere in it — measured 35 points cooler in blue than in red
 * behind the beast — so the ember, the motes and the shafts are once again the
 * only warm things on the screen, and they read as the golem's own fire rather
 * than as the painting's. That was true of the storm plate too and it is more
 * true here.
 *
 * Geometrically it is the plate that needed the most inventing: 2048x1024 in,
 * standing its ground line at 0.76, so tools/pack-arena pads the bottom by the
 * full length of the picture again to reach HORIZON — 1024 smeared rows under
 * 1024 real ones. All of it is behind the board, the scrim and the hero row.
 * It arrives clean, with no letterbox at either edge, which is the first plate
 * in three not to need a crop.
 *
 * Everything layered on top of the bitmap is still procedural: the firelight on
 * the floor line, the drifting motes and the scrim that keeps the board readable
 * all reflow with the layout, and they are what stop a still image from reading
 * as one. The two shaft colours were not retuned, and under this plate they read
 * as the beast's own light rather than the painting's — which is what they are
 * pinned to anyway, the floor line the golem stands on.
 */

import { Container, Sprite, Texture, ImageSource } from "pixi.js";
import { glowTexture, gradientTexture } from "./textures.js";
import { BOSS_ART } from "../core/layout.js";
import arenaUrl from "../assets/arena/sky.webp";

/**
 * Height fraction of the source art where the ground line sits.
 *
 * Measured on the *packed* file, not the source it came from: the near island's
 * green top stops and its rock underside starts at 0.76 of the delivered
 * texture, and tools/pack-arena carries the bottom edge down by the full length
 * of the picture precisely so this number lands somewhere the fit below can
 * actually reach. Change one of the two and the other is wrong — `floor` and
 * `horizon` in that tool's job are the two halves of this contract, and the
 * second of them is this constant.
 *
 * 0.38, and the four plates before the storm citadel all packed at 0.50. This is the
 * first time the number has moved, and it moved because it was wrong — not for
 * this painting, which it fits, but for three of the screens the creative ships
 * to. See OVERSCAN below for the measurement and the arithmetic; the short
 * version is that on a short or a wide-ish portrait screen the board takes the
 * height it is owed, the boss's floor comes up the screen with it, and the fit
 * then cannot slide the picture far enough to follow — so the painted ground
 * line came to rest below the golem's feet and he stood in mid-air. A 375x667
 * SE was out by 57 points, an iPad in portrait by 72, and a 438 point window by
 * 24. At 0.38 every screen in the matrix pins exactly, in both orientations.
 *
 * What made it the cheap fix rather than an expensive one is what is under the
 * line. Everything below it is behind the board, the scrim and the hero row, so
 * lowering it does not throw picture away — it asks tools/pack-arena for more of
 * the smear nobody can see, 787 rows against 452, and buys back the pin plus
 * about a third more of the painting's width on a phone: a taller plate is
 * cover-fitted at a smaller scale, so the same screen shows more of it. Measured
 * across the matrix, the narrowest crop went from 37% of the plate's width to
 * 49%. The gate render reached
 * its own horizon by having its top quarter cut off and all three landscape
 * plates by having their bottoms extended; this is the same trade one notch
 * further, and the same reason it is affordable.
 *
 * The window is [0.34, 0.42] and 0.38 is the middle of it. Below 0.34 the other
 * clamp in `fitArena` starts to bite and the ground line rides *above* the feet
 * on a tall phone; above 0.42 the SE goes back to floating. Anything that moves
 * the boss's floor — BOSS_MIN, BOSS_OVERLAP, the hero row's share — moves that
 * window, so re-measure rather than assume.
 */
const HORIZON = 0.38;

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
 * and the boss floor runs from 0.29 of a portrait screen on a short phone to
 * 0.42 on a tall one, so with HORIZON at 0.38 the binding screen asks for 1.15.
 * Below it the fit clamps and the golem walks up off the stone into the middle
 * distance.
 *
 * 1.25 rather than that 1.15, and rather than the 1.45 the sky castle needed.
 * Every point above the minimum is paid for twice: it magnifies the source
 * further, and it narrows the strip of the plate that a portrait phone gets to
 * show at all. At 1.25 that strip is about 50% of the width, centred, which is
 * the gate tower, the near spires and the lit windows between them.
 *
 * Where the slack runs out, measured rather than assumed — and this is the
 * paragraph the HORIZON change above was made for, so it is worth keeping the
 * old numbers next to the new ones. At HORIZON 0.50 a 390x844 phone pinned
 * exactly and an iPad sideways pinned exactly, and three screens did not: a
 * 375x667 SE was out by 57 points, an iPad in portrait by 72, a 438x860 window
 * by 24. The shape of the miss is always the same. A short or wide-ish portrait
 * screen gives the board the width it is owed, the board's height comes out of
 * the boss's band, the boss's floor rides up the screen — 0.29 of the height on
 * the SE against 0.42 on a 390 — and the fit is then asked to slide the picture
 * further than `h - dh` will let it, because the plate's bottom edge would come
 * into frame. Work that clamp backwards and it wants
 *
 *     OVERSCAN * (1 - HORIZON) >= 1 - bossFloor/screenHeight
 *
 * which at HORIZON 0.50 needed an OVERSCAN of 1.42 on the SE. That was never
 * payable here: 1.42 is a 2.8x blow-up showing a quarter of the picture. The
 * same inequality read the other way is free, because 1 - HORIZON is on the
 * cheap side of the frame — hence 0.38, hence 0 misses across the matrix, and
 * hence this number not moving at all.
 *
 * Unchanged across every arena swap, then, and that is the point of the padding
 * rather than a crop. This plate's ground line sits at 0.872 of its render, so
 * reaching HORIZON by cutting the top instead would have taken 482 of the 608
 * rows and left 126 — the storm, the lightning and every tower in the picture,
 * spent to save a smear nobody can see. The plate is 1395 rows, a 390x844 phone
 * draws it at 0.76x in CSS pixels, and nothing in this file had to move.
 */
const OVERSCAN = 1.25;

/**
 * Fallback wash, and the base colour behind the bitmap either way.
 *
 * Repainted with the arena, for the fifth time and for the same reason each
 * time: a device that cannot decode WebP has to fall through to the same fight,
 * not to the previous one. It was a blue-to-cream sky under the fortress, an
 * ember dusk under the gate, a storm slate under the violet city and a bruised
 * violet over an ember plain under the rift; under the citadel it is stormlight
 * at the top falling to black rock.
 *
 * Sampled off the packed plate *through the fit* rather than read off the file:
 * the layout pins the ground line to the boss floor at 0.42 of the screen and
 * cover-fits at OVERSCAN, so a screen fraction lands about `0.5 + (s - 0.42) *
 * 0.8` down the plate on a 390x844 phone. Every stop below is that sample.
 *
 * Where the light sits is the one thing that moved, and it moved because the
 * painting moved it. Under the rift the bright stop was at 0.52 — *below* the
 * ground line, because the light down there was lava. This picture keeps its
 * light in the sky: 91 luminance at the top of the screen, 51 at the floor line
 * and 10 a fifth below it. So the bright end is the top, the boss is read
 * against a muted violet rather than against fire, and the fallback still does
 * the one job it exists for — a wash that is dark all the way down loses the
 * silhouette the whole composition is built on.
 */
const SKY_STOPS = [
  [0.0, "#5c5688"],
  [0.22, "#674c6e"],
  [0.42, "#412d3e"],
  [0.6, "#0b0911"],
  [1.0, "#040306"],
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
 *
 * 0.72 to 0.54 with the sky islands, and the reason is the one this constant
 * was given in the first place. It went deep because the strip it holds type
 * against was lit sky — the rift's and the storm's tops of frame both measured
 * over 110 mean luminance. This plate's is 55, and after GRADE_ALPHA it is 53:
 * the darkest ceiling any painting has put behind that type. At 0.72 over it
 * the boss's name sits in a black bar with a picture either side of it, which
 * is the flat-band failure this gradient was written to avoid, arrived at from
 * the other direction. 0.54 keeps the same contrast under the type that the
 * storm plate had over a sky twice as bright.
 */
const CROWN_STOPS = [
  [0.0, "rgba(6,11,26,0.54)"],
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
 * The gate and the ruined city made the job small. Both arrive dark, lit by
 * their own fires, already the tone the grade was faking, so what was left for
 * these three was seating rather than rescue, and the alphas came down to about
 * a third of what they had been.
 *
 * The rift takes some of that back. It is a bright plate again — a burning ring
 * filling the top left and a lit plain running the width — so these three are
 * doing more than seating for the first time since the fortress, and the numbers
 * below moved up rather than down. Not all the way: a fifth of the way, because
 * the fire and the daylight are not the same problem. Daylight had to be
 * cancelled; fire only has to be kept from out-shouting the boss.
 *
 * Three sprites, and not one of them is a new asset:
 *
 *   1. `grade` takes the whole painting down and cools it, which pulls the
 *      rift's orange off the top of the frame and stops the plain competing with
 *      the hero cards to be the warmest thing on screen.
 *   2. `pool` is a soft dark ellipse pinned behind the beast's mass. It is the
 *      one thing here aimed at the boss rather than at the sky, and it is the
 *      one that actually does the job: the figure is a dark shape, the band
 *      behind it is the brightest thing in the painting, and no amount of
 *      overall darkening separates those two — only darkening exactly where the
 *      silhouette is does.
 *   3. `ember` is firelight along the floor line, which is what stops 1 and 2
 *      reading as a screenshot with the brightness pulled down. The lava seams
 *      in the painting are already doing this; the sprite is what makes it move.
 *
 * Tuned as one, so move them as one. If the arena art is ever replaced again,
 * take GRADE_ALPHA and POOL_ALPHA in the direction the new art needs — up over
 * a bright painting, down over a dark one. Left high over dark art they give a
 * black screen with a monster somewhere in it, which is the opposite failure
 * and no better than the one they were written for.
 */
const GRADE_TINT = 0x9a90a6;
/**
 * Down again with the arena, 0.16 to 0.08, and the lowest this has ever run.
 *
 * This is a cool grey multiply and it had two jobs: pull warmth out of the top
 * of the frame, and stop the ground competing with the hero cards to be the
 * warmest thing on screen. The storm citadel killed the first one — it arrived
 * cold — and the sky islands keep it dead: measured behind the beast this plate
 * runs 35 points cooler in blue than in red. There is still no warmth to pull.
 *
 * What killed the second half is new, and it is the one place this painting is
 * *darker* than the plate it replaces. The storm's top of frame was a pale
 * lightning bank at 116 mean luminance, and 0.16 of grey multiply over it was
 * earned. This one's top is deep teal cloud at 55 — under half — and the same
 * multiply over it only takes colour out of the one band of the picture that
 * was already dark enough. So the global layer steps back to almost nothing.
 *
 * It is worth being exact about what this does *not* do: it does not darken the
 * band behind the beast. That band is three times brighter here than it was
 * under the storm, and a global multiply strong enough to fix it would grey out
 * the whole painting to fix one sixth of it. POOL_ALPHA below is the layer that
 * answers it, and this swap is the clearest case yet for why the two exist
 * separately rather than as one number.
 */
const GRADE_ALPHA = 0.08;

/**
 * The dark the silhouette is read against, and the layer this swap turns on.
 *
 * Against the grade, and hard: 0.40 to 0.78, with the tint taken from 0x4a3c50
 * down to 0x241d2a to buy the last of it. Both numbers are the same measurement
 * twice. The band directly behind the beast's mass runs 157 mean luminance in
 * this painting against the storm's 53 — it is open mist, lit for a lobby — and
 * left at 0.40 it would grade out at 103, which is brighter than the *ungraded*
 * plate this replaces. A dark golem in front of that is a shape, not a threat.
 *
 * At 0.78 of 0x241d2a it grades out at 48, against the storm plate's 38. That
 * is the honest number and it is not a match: three times the light going in
 * does not come out the same, and a multiply cannot take a band below the tint
 * it is multiplying by however hard it is pushed. What it is, is separation -
 * the beast reads against sky that is darker than the sky either side of it,
 * which is the whole job of a layer aimed at the boss rather than at the frame.
 *
 * The tint went with the alpha rather than instead of it because the two do
 * different things to the colour. Alpha alone at this depth pushes the band
 * toward the tint's own violet-grey and the pool starts to read as a painted
 * vignette; taking the tint darker lets the same darkening arrive with less of
 * its own hue in it. If this ever needs to come back, it comes back as a pair.
 */
const POOL_TINT = 0x241d2a;
const POOL_ALPHA = 0.78;

/**
 * The two fires on the deck: the haze the beast's feet stand in, and the wider
 * wash under it. Ember rather than the gold the haze used to carry — whatever
 * colour this is, the boss is standing in it.
 *
 * Unchanged across this swap, and it is the one warm thing on the screen that
 * had to survive it. Under the rift the painting's own lava ran along this line
 * and these two agreed with it; under the citadel the line is cold rock, so the
 * same two sprites now read as light coming off the golem rather than light it
 * is standing in. That is the better reading of the two — it is a fire golem —
 * and it is the only firelight left in the frame, which is what stops the grade
 * and the pool above from turning the deck into a dark screenshot.
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
