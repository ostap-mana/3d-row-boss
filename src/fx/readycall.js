/**
 * The READY call — the beat that tells the player an ultimate exists.
 *
 * ## Why it is not on the card
 *
 * The card already says everything a card can say: the element breaks over the
 * portrait, the border lights, it stands taller and breathes, and the HUD names
 * the hero. All of it happens inside a tile the width of a thumb, in a row of
 * six, underneath the thing the player has been staring at for the whole run.
 * A player watching the boss misses the entire callout, and the largest number
 * in the fight sits there unspent behind a control nobody showed them.
 *
 * ## Why it is not in the middle of the screen either
 *
 * It was, for one revision: a screen-wide plate at a third of the height that
 * arrived over the arena, held, and fell into the tile. It read as an
 * interstitial. Something the size of the screen landing in the middle of the
 * screen stops the fight to be looked at, and this is not news worth stopping a
 * cascade for — it is a pointer at a control most of a screen further down, and
 * the player's eye had to make that trip twice.
 *
 * So it is a lower third now, docked above the hero row, and it never occupies
 * the middle at all. Nothing about the announcement is in a place the player
 * then has to leave.
 *
 * ## Why it comes out of the card
 *
 * The ribbon does not fade up centred; it rips outward from the x of the hero
 * who charged, out to the full width and back. A beam of that hero's element
 * stands down from the ribbon onto the top edge of their tile for as long as it
 * is up, with the crowns burning either side of where it lands. The sentence is
 * built out of the motion rather than said: this came from there, it is still
 * attached to there, tap there.
 *
 * The collapse is the same line run backwards — the ribbon sucks back to the
 * card's x and the word rides it down into the tile, which is the card the hand
 * lesson then taps. See Director.teachUlt.
 *
 * ## What it must not do
 *
 * Outshine the cast. fx/cutin.js is the payoff and has to stay the loudest
 * thing in the creative, so this is deliberately built from less: no dim over
 * the fight, no rays, no bust, no wash, nothing laid over the board or the
 * boss, and it is off the screen in under a second and a half.
 *
 * ## The art
 *
 * Nothing new is drawn here, and nothing is drawn at all. The crown flipbooks
 * are the per-element sheets art/readyfx.js already loads for the card's
 * caption, and everything else is type standing on gradient strips.
 *
 * There was a radial haze behind the word for one revision, the same
 * glowTexture the cut-in rests its hero on. It went, and the reason is worth
 * keeping: `add`-blended over a lit arena it washed the whole upper half of the
 * screen to white at a fifth of full alpha, took the boss with it, and drowned
 * the crown it was supposed to be lifting. A gradient is not the thing that
 * makes this read — the element's own silhouette is.
 */

import { Container, Sprite, Text } from "pixi.js";

import { COPY, FONT_READY, GEM_LIGHT, HEROES, READY_CALL } from "../config.js";
import { CROWN_CELL, readyCrownFrames } from "../art/readyfx.js";
import { rampTexture } from "../art/textures.js";
import { tween, delay, killTweensOf, Ease } from "../core/tween.js";

/**
 * The ribbon's plate: a hard, wide middle and a short fade at each end.
 *
 * It faded over the outer fifth for one revision, which put both ends of the
 * type — the word at one edge, the hero's name at the other — inside the fade
 * and stood them on the board instead of on the plate. The fade is there to
 * keep the plate from ending in two vertical cuts, and 7% is plenty for that.
 */
const BAND_RAMP = [
  [0, "rgba(255,255,255,0)"],
  [0.07, "rgba(255,255,255,1)"],
  [0.93, "rgba(255,255,255,1)"],
  [1, "rgba(255,255,255,0)"],
];

const RULE_RAMP = [
  [0, "rgba(255,255,255,0)"],
  [0.3, "rgba(255,255,255,1)"],
  [0.7, "rgba(255,255,255,1)"],
  [1, "rgba(255,255,255,0)"],
];

const BEAM_RAMP = [
  [0, "rgba(255,255,255,0)"],
  [0.55, "rgba(255,255,255,0.5)"],
  [1, "rgba(255,255,255,1)"],
];

const BAND_TINT = 0x05070f;
const BAND_ALPHA = 0.93;

export class ReadyCall extends Container {
  constructor() {
    super();
    this.visible = false;
    this.layout = null;
    this.playId = 0;
    this.playing = false;

    this.frames = null;
    this.frameT = 0;

    this.wipe = { k: 0 };
    this.reach = { k: 0 };
    this.flight = { k: 0 };

    this.mark = new Container();
    this.rig = new Container();
    this.addChild(this.mark, this.rig);

    this.beam = new Sprite(rampTexture("readyBeam", BEAM_RAMP));
    this.beam.anchor.set(0, 0.5);
    this.beam.rotation = Math.PI / 2;
    this.beam.blendMode = "add";

    this.pad = new Sprite(rampTexture("readyRule", RULE_RAMP));
    this.pad.anchor.set(0.5);
    this.pad.blendMode = "add";

    this.crownL = new Sprite();
    this.crownL.anchor.set(0.5, 1);
    this.crownL.blendMode = "add";
    this.crownR = new Sprite();
    this.crownR.anchor.set(0.5, 1);
    this.crownR.blendMode = "add";

    this.mark.addChild(this.beam, this.crownL, this.crownR, this.pad);

    this.scrim = new Sprite(rampTexture("readyBand", BAND_RAMP));
    this.scrim.anchor.set(0.5);
    this.scrim.tint = BAND_TINT;

    this.ruleTop = new Sprite(rampTexture("readyRule", RULE_RAMP));
    this.ruleTop.anchor.set(0.5);
    this.ruleTop.blendMode = "add";
    this.ruleBot = new Sprite(rampTexture("readyRule", RULE_RAMP));
    this.ruleBot.anchor.set(0.5);
    this.ruleBot.blendMode = "add";

    this.word = new Text({
      text: "READY",
      style: {
        fontFamily: FONT_READY,
        fontSize: 64,
        fontWeight: "900",
        fill: 0xffffff,
        letterSpacing: 3,
        dropShadow: {
          color: 0x05070f,
          alpha: 0.85,
          angle: Math.PI / 2,
          blur: 4,
          distance: 4,
        },
        padding: 14,
      },
    });
    this.word.anchor.set(0.5);

    this.who = new Text({
      text: "",
      style: {
        fontFamily: FONT_READY,
        fontSize: 18,
        fontWeight: "800",
        fill: 0xffffff,
        letterSpacing: 6,
        padding: 6,
      },
    });
    this.who.anchor.set(0.5);

    this.rig.addChild(
      this.scrim,
      this.ruleTop,
      this.ruleBot,
      this.word,
      this.who,
    );
  }

  /**
   * Measure the ribbon against the hero row rather than against the screen.
   *
   * Every number in here comes off `layout.cards` — the same rect
   * art/heroes.js lays the tiles out from, read the same way — so the beam
   * lands on the top edge of a real tile on every aspect in the matrix instead
   * of somewhere near one.
   */
  resize(layout) {
    this.layout = layout;
    const s = layout.safeBox;
    const c = layout.cards;

    this.cardW = (c.w - c.gap * (HEROES.length - 1)) / HEROES.length;
    this.cardStep = this.cardW + c.gap;
    this.cardX0 = c.x + this.cardW / 2;
    this.cardMid = c.y + c.h / 2;

    this.whoSize = s.w * READY_CALL.who;
    this.fitType(this.word, s.w * READY_CALL.word, READY_CALL.wordTrack);
    this.fitType(this.who, this.whoSize, READY_CALL.whoTrack);

    this.bandW = s.w * READY_CALL.ribbonW;
    this.bandH = this.typeH(this.word) * (1 + READY_CALL.bandPad * 2);
    this.ruleH = Math.max(2, Math.round(s.w * 0.005));

    this.beamLen = c.h * READY_CALL.lift;
    this.beamW = Math.max(2, Math.round(this.cardW * READY_CALL.beam));
    this.padW = this.cardW * 1.02;

    this.homeX = s.x + s.w / 2;
    this.markY = c.y - this.beamLen;
    this.homeY = this.markY - this.bandH / 2;

    this.typeInset = Math.max(this.bandH * 0.45, s.w * 0.05);
    this.layType();

    this.crownH = this.cardW * READY_CALL.crown;
    this.crownW = this.crownH * CROWN_CELL.aspect;
    const flank = this.cardW * READY_CALL.crownFlank;
    this.crownL.x = -flank;
    this.crownR.x = flank;
    this.fitCrowns();

    this.drawBand();
    this.drawBeam();
    if (!this.playing) {
      this.rig.position.set(this.homeX, this.homeY);
      this.mark.position.set(this.homeX, this.markY);
    }
  }

  /**
   * The word to the left edge of the ribbon, the hero to the right, and the
   * name shrunk until the two cannot touch.
   *
   * The inset is the band's own height or the screen's gutter, whichever is
   * more: measured off the band alone, a thin ribbon put READY hard against the
   * left bezel on a phone, which is the one place on this screen no other piece
   * of chrome goes.
   *
   * Pinning type to both ends is the whole reason the ribbon can be this thin —
   * centred type needs the plate to be as wide as the sentence is long. It is
   * also the reason the name has to be fitted rather than set: the ribbon is a
   * fixed width, READY owns the left of it, and TAP QUINNTO on the narrowest
   * phone in the matrix is wider than what is left. Unfitted, it ran straight
   * through the word — two pieces of type on one line, overlapping, which is
   * the single most broken-looking thing a lower third can do.
   *
   * Run again from play(), because the hero's name changes width.
   */
  layType() {
    this.fitType(this.who, this.whoSize, READY_CALL.whoTrack);
    const inset = this.typeInset;
    const room =
      this.bandW - inset * 2 - this.bandH * 0.5 - this.typeW(this.word);
    for (let i = 0; i < 6; i++) {
      const over = this.typeW(this.who);
      if (over <= room) break;
      const next = this.who.style.fontSize * Math.max(0.8, room / over);
      if (next < this.whoSize * 0.55) break;
      this.fitType(this.who, next, READY_CALL.whoTrack);
    }
    this.wordX = -this.bandW / 2 + inset + this.typeW(this.word) / 2;
    this.whoX = this.bandW / 2 - inset - this.typeW(this.who) / 2;
    this.word.position.set(this.wordX, 0);
    this.who.position.set(this.whoX, 0);
  }

  /**
   * A Text's own size, with the style padding taken back off.
   *
   * `width` and `height` on a Pixi Text are the texture's, and fitType pads
   * that texture generously so the drop shadow and the last letter's tracking
   * have somewhere to live. Measuring the ribbon off the padded height made a
   * band a third taller than the type standing on it, and measuring the insets
   * off the padded width pushed both ends inward until they met in the middle.
   */
  typeW(text) {
    return Math.max(1, text.width - text.style.padding * 2);
  }

  typeH(text) {
    return Math.max(1, text.height - text.style.padding * 2);
  }

  fitType(text, size, track) {
    const px = Math.round(size);
    const shadow = text.style.dropShadow;
    text.style.fontSize = px;
    text.style.letterSpacing = px * track;
    if (shadow) {
      shadow.blur = px * 0.06;
      shadow.distance = px * 0.05;
    }
    text.style.padding = Math.ceil(
      px * 0.18 + (shadow ? shadow.blur + shadow.distance : 0),
    );
  }

  /**
   * The ribbon at whatever fraction of its width the rip has reached.
   *
   * Width only. A lower third that also grows in height reads as a plate
   * inflating, and the one thing this must not look like is the centre banner
   * it replaced.
   */
  drawBand() {
    if (!this.bandW) return;
    const k = this.wipe.k;
    const w = Math.max(1, this.bandW * k);
    this.scrim.width = w;
    this.scrim.height = this.bandH;
    this.scrim.alpha = BAND_ALPHA * Math.min(1, k * 2.4);
    this.ruleTop.width = w;
    this.ruleBot.width = w;
    this.ruleTop.height = this.ruleH;
    this.ruleBot.height = this.ruleH;
    this.ruleTop.y = -this.bandH / 2;
    this.ruleBot.y = this.bandH / 2;
  }

  /**
   * The beam reaching down from the ribbon to the tile's top edge, and the
   * light and the crowns that ride its far end down.
   *
   * The ramp is a horizontal strip turned a quarter turn, so `width` is the
   * reach and `height` is the thickness — and the solid end of the gradient is
   * the end that arrives, which is what puts the light on the card rather than
   * on the ribbon that already has its own.
   *
   * The crowns are placed from here and nowhere else. Left at their own y they
   * sit on the ribbon's bottom edge, and the ribbon is drawn over them — a
   * whole element burst rendering every frame, behind an opaque plate, for
   * three revisions before anybody noticed it was missing.
   */
  drawBeam() {
    if (!this.beamLen) return;
    const k = this.reach.k;
    const end = this.beamLen * k;
    this.beam.width = Math.max(1, end);
    this.beam.height = this.beamW;
    this.pad.y = end;
    this.pad.width = Math.max(1, this.padW * k);
    this.pad.height = this.ruleH;
    this.crownL.y = end + this.crownH * READY_CALL.crownSink;
    this.crownR.y = this.crownL.y;
  }

  /**
   * Size the crowns, and only ever with a real texture under them.
   *
   * Pixi v8 turns a width into a scale against whatever texture the sprite is
   * carrying at the time. A sprite built with `new Sprite()` carries the 1x1
   * empty one, so sizing it during resize — before play() has put a frame on it
   * — set a scale of two hundred, and the 112x128 frame that arrived afterwards
   * inherited it and rendered twenty thousand pixels wide. On `add`, over a lit
   * arena, that is the whole screen washed white with the boss inside it.
   *
   * So the size is held as a number and applied only from here, and this is
   * called on the far side of every texture assignment.
   */
  fitCrowns() {
    if (!this.crownH) return;
    for (const c of [this.crownL, this.crownR]) {
      if (!c.texture || c.texture.width <= 1) continue;
      c.setSize(this.crownW, this.crownH);
    }
    this.crownR.scale.x = -Math.abs(this.crownR.scale.x);
  }

  /**
   * Walk the crowns' flipbook.
   *
   * On the world clock like everything else that animates, so a cast rushing
   * the board does not leave this one sheet playing at its own speed. Held on
   * the last frame rather than looped: the sheets are a burst and a burst that
   * restarts reads as a strobe.
   */
  update(dt) {
    if (!this.visible || !this.frames) return;
    this.frameT += dt * READY_CALL.fps;
    const i = Math.min(this.frames.length - 1, this.frameT | 0);
    if (this.crownL.texture === this.frames[i]) return;
    this.crownL.texture = this.frames[i];
    this.crownR.texture = this.frames[i];
    this.fitCrowns();
  }

  cardX(index) {
    return this.cardX0 + index * this.cardStep;
  }

  /**
   * Announce a hero out of their own tile, then put the word back into it.
   *
   * @param {number} index which hero in the row
   * @param {import("pixi.js").Container} card the tile to collapse into
   * @returns {Promise<void>} resolves when the screen is its own again
   */
  async play(index, card) {
    if (!this.layout) return;
    const hero = HEROES[index];
    if (!hero) return;

    const token = ++this.playId;
    this.playing = true;

    const light = GEM_LIGHT[hero.element];
    this.frames = readyCrownFrames(hero.element);
    this.frameT = 0;

    this.ruleTop.tint = light;
    this.ruleBot.tint = light;
    this.beam.tint = light;
    this.pad.tint = light;
    this.who.style.fill = light;
    this.who.text = COPY.ultReady.replace("{hero}", hero.name);
    this.layType();

    this.killAll();

    const from = this.cardX(index);
    this.rig.position.set(from, this.homeY);
    this.rig.alpha = 1;
    this.rig.scale.set(1);
    this.mark.position.set(from, this.markY);
    this.mark.alpha = 1;

    this.wipe.k = 0;
    this.reach.k = 0;
    this.drawBand();
    this.drawBeam();

    this.word.alpha = 0;
    this.word.scale.set(1);
    this.who.alpha = 0;
    this.beam.alpha = 0;
    this.pad.alpha = 0;
    this.crownL.alpha = 0;
    this.crownR.alpha = 0;
    this.crownL.visible = !!this.frames;
    this.crownR.visible = !!this.frames;
    if (this.frames) {
      this.crownL.texture = this.frames[0];
      this.crownR.texture = this.frames[0];
      this.fitCrowns();
    }
    this.visible = true;

    tween(this.wipe, { k: 1 }, READY_CALL.open, {
      ease: Ease.expoOut,
      onUpdate: () => this.drawBand(),
    });
    tween(this.rig, { x: this.homeX }, READY_CALL.open, { ease: Ease.expoOut });

    await delay(READY_CALL.open * 0.5);
    if (token !== this.playId) return;

    this.frameT = 0;
    this.word.scale.set(READY_CALL.slamX, READY_CALL.slamY);
    tween(this.word, { alpha: 1 }, READY_CALL.slam * 0.3);
    tween(this.who, { alpha: 1 }, READY_CALL.slam, {
      delay: READY_CALL.slam * 0.45,
    });

    tween(this.beam, { alpha: 0.9 }, READY_CALL.slam * 0.4);
    tween(this.reach, { k: 1 }, READY_CALL.slam, {
      ease: Ease.cubicOut,
      onUpdate: () => this.drawBeam(),
    });
    tween(this.pad, { alpha: 1 }, READY_CALL.slam * 0.5, {
      delay: READY_CALL.slam * 0.5,
    });
    tween(this.crownL, { alpha: 1 }, READY_CALL.slam * 0.6, {
      delay: READY_CALL.slam * 0.4,
    });
    tween(this.crownR, { alpha: 1 }, READY_CALL.slam * 0.6, {
      delay: READY_CALL.slam * 0.4,
    });

    await tween(this.word.scale, { x: 1, y: 1 }, READY_CALL.slam, {
      ease: Ease.expoOut,
    });
    if (token !== this.playId) return;

    tween(this.beam, { alpha: 0.55 }, READY_CALL.hold, { ease: Ease.quadOut });
    await tween(this.word.scale, { x: 1.03, y: 1.03 }, READY_CALL.hold, {
      ease: Ease.quadOut,
    });
    if (token !== this.playId) return;

    tween(this.who, { alpha: 0 }, READY_CALL.close * 0.7);
    tween(this.rig, { x: from }, READY_CALL.close, { ease: Ease.quadIn });
    tween(this.word, { x: 0 }, READY_CALL.close, { ease: Ease.quadIn });
    await tween(this.wipe, { k: 0 }, READY_CALL.close, {
      ease: Ease.quadIn,
      onUpdate: () => this.drawBand(),
    });
    if (token !== this.playId) return;

    const to = card
      ? this.toLocal(card.getGlobalPosition())
      : { x: from, y: this.cardMid };
    const start = { x: this.rig.x, y: this.rig.y };
    this.flight.k = 0;

    await Promise.all([
      tween(this.flight, { k: 1 }, READY_CALL.drop, {
        ease: Ease.quadIn,
        onUpdate: () => {
          const k = this.flight.k;
          const n = 1 - k;
          this.rig.x = n * n * start.x + (2 * n * k + k * k) * to.x;
          this.rig.y = (n * n + 2 * n * k) * start.y + k * k * to.y;
        },
      }),
      tween(
        this.rig.scale,
        { x: READY_CALL.to, y: READY_CALL.to },
        READY_CALL.drop,
        { ease: Ease.quadIn },
      ),
      tween(this.rig, { alpha: 0 }, READY_CALL.drop, { ease: Ease.expoIn }),
      tween(this.reach, { k: 0.12 }, READY_CALL.drop, {
        ease: Ease.quadIn,
        onUpdate: () => this.drawBeam(),
      }),
      tween(this.mark, { alpha: 0 }, READY_CALL.drop, { ease: Ease.quadIn }),
    ]);
    if (token !== this.playId) return;

    if (card && card.flareReady) card.flareReady();

    this.playing = false;
    this.visible = false;
    this.frames = null;
  }

  killAll() {
    killTweensOf(this.wipe);
    killTweensOf(this.reach);
    killTweensOf(this.flight);
    killTweensOf(this.rig);
    killTweensOf(this.rig.scale);
    killTweensOf(this.mark);
    killTweensOf(this.beam);
    killTweensOf(this.pad);
    killTweensOf(this.word);
    killTweensOf(this.word.scale);
    killTweensOf(this.who);
    killTweensOf(this.crownL);
    killTweensOf(this.crownR);
  }

  /** Take it off the screen now — a rebuilt fight, or a cast that beat it. */
  clear() {
    this.playId++;
    this.playing = false;
    this.visible = false;
    this.frames = null;
    this.killAll();
    this.rig.alpha = 1;
    this.rig.scale.set(1);
    this.mark.alpha = 1;
    this.wipe.k = 0;
    this.reach.k = 0;
    this.drawBand();
    this.drawBeam();
  }
}
