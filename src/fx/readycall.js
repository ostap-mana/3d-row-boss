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
 * So this is the same news, said at the size of the screen.
 *
 * ## Why it collapses into the card
 *
 * A banner that announced READY and then vanished would teach that something
 * happened, not what to do about it. This one lands big, holds for a beat, and
 * then falls into the hero's own tile — so the sentence is "this, and it lives
 * there". The hand lesson that follows (see Director.teachUlt) lands on a card
 * the player has just watched the banner drop onto.
 *
 * ## What it must not do
 *
 * Outshine the cast. fx/cutin.js is the payoff and has to stay the loudest
 * thing in the creative, so this is deliberately built from less: no dim over
 * the fight, no rays, no bust, no wash, and it is off the screen in under a
 * second. It is an announcement, not a cut-in.
 *
 * ## The art
 *
 * Nothing new is drawn here, and nothing is drawn at all. The crown flipbooks
 * are the per-element sheets art/readyfx.js already loads for the card's
 * caption, used at four times the size — which is what they were cut at — and
 * the rest is type.
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

const BAND_RAMP = [
  [0, "rgba(255,255,255,0)"],
  [0.18, "rgba(255,255,255,1)"],
  [0.82, "rgba(255,255,255,1)"],
  [1, "rgba(255,255,255,0)"],
];

const RULE_RAMP = [
  [0, "rgba(255,255,255,0)"],
  [0.3, "rgba(255,255,255,1)"],
  [0.7, "rgba(255,255,255,1)"],
  [1, "rgba(255,255,255,0)"],
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
    this.flight = { k: 0 };

    this.rig = new Container();
    this.addChild(this.rig);

    this.scrim = new Sprite(rampTexture("readyBand", BAND_RAMP));
    this.scrim.anchor.set(0.5);
    this.scrim.tint = BAND_TINT;

    this.ruleTop = new Sprite(rampTexture("readyRule", RULE_RAMP));
    this.ruleTop.anchor.set(0.5);
    this.ruleTop.blendMode = "add";
    this.ruleBot = new Sprite(rampTexture("readyRule", RULE_RAMP));
    this.ruleBot.anchor.set(0.5);
    this.ruleBot.blendMode = "add";

    this.crownL = new Sprite();
    this.crownL.anchor.set(0.5, 1);
    this.crownL.blendMode = "add";
    this.crownR = new Sprite();
    this.crownR.anchor.set(0.5, 1);
    this.crownR.blendMode = "add";

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
      this.crownL,
      this.crownR,
      this.ruleTop,
      this.ruleBot,
      this.word,
      this.who,
    );
  }

  resize(layout) {
    this.layout = layout;
    const s = layout.safeBox;

    this.homeX = s.x + s.w / 2;
    this.homeY = s.y + s.h * READY_CALL.y;

    this.fitType(this.word, s.w * READY_CALL.word, READY_CALL.wordTrack);
    this.fitType(this.who, s.w * READY_CALL.who, READY_CALL.whoTrack);

    const wordH = this.word.height;
    const whoH = this.who.height;
    const pad = wordH * READY_CALL.bandPad;
    const gap = whoH * 0.4;

    this.bandW = s.w * READY_CALL.bandW;
    this.bandH = pad * 2 + wordH + gap + whoH;
    this.ruleH = Math.max(2, Math.round(s.w * 0.006));

    this.word.position.set(0, -this.bandH / 2 + pad + wordH / 2);
    this.whoY = this.word.y + wordH / 2 + gap + whoH / 2;
    this.who.position.set(0, this.whoY);

    this.crownH = s.w * READY_CALL.crown;
    this.crownW = this.crownH * CROWN_CELL.aspect;
    const inset = this.bandW / 2 - this.crownW * 0.52;
    this.crownL.x = -inset;
    this.crownR.x = inset;
    this.fitCrowns();

    this.drawBand();
    if (!this.playing) this.rig.position.set(this.homeX, this.homeY);
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

  drawBand() {
    if (!this.bandW) return;
    const k = this.wipe.k;
    const w = Math.max(1, this.bandW * (0.1 + 0.9 * k));
    this.scrim.width = w;
    this.scrim.height = Math.max(1, this.bandH * k);
    this.scrim.alpha = BAND_ALPHA * Math.min(1, k * 2.4);
    this.ruleTop.width = w;
    this.ruleBot.width = w;
    this.ruleTop.height = this.ruleH;
    this.ruleBot.height = this.ruleH;
    this.ruleTop.y = (-this.bandH / 2) * k;
    this.ruleBot.y = (this.bandH / 2) * k;
    this.crownL.y = this.ruleBot.y;
    this.crownR.y = this.ruleBot.y;
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

  /**
   * Announce a hero, then drop the word into their card.
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
    this.who.style.fill = light;
    this.who.text = COPY.ultReady.replace("{hero}", hero.name);

    this.killAll();

    this.rig.position.set(this.homeX, this.homeY);
    this.rig.alpha = 1;
    this.rig.scale.set(1);
    this.wipe.k = 0;
    this.drawBand();
    this.word.alpha = 0;
    this.word.scale.set(1);
    this.who.alpha = 0;
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

    await delay(READY_CALL.open * 0.5);
    if (token !== this.playId) return;

    this.frameT = 0;
    this.word.scale.set(READY_CALL.slamX, READY_CALL.slamY);
    tween(this.word, { alpha: 1 }, READY_CALL.slam * 0.3);
    tween(this.crownL, { alpha: 1 }, READY_CALL.slam * 0.4);
    tween(this.crownR, { alpha: 1 }, READY_CALL.slam * 0.4);
    this.who.y = this.whoY + this.who.height * 0.5;
    tween(this.who, { alpha: 1, y: this.whoY }, READY_CALL.slam, {
      ease: Ease.cubicOut,
      delay: READY_CALL.slam * 0.45,
    });

    await tween(this.word.scale, { x: 1, y: 1 }, READY_CALL.slam, {
      ease: Ease.expoOut,
    });
    if (token !== this.playId) return;

    await tween(this.word.scale, { x: 1.03, y: 1.03 }, READY_CALL.hold, {
      ease: Ease.quadOut,
    });
    if (token !== this.playId) return;

    tween(this.who, { alpha: 0 }, READY_CALL.close * 0.7);
    tween(this.crownL, { alpha: 0 }, READY_CALL.close);
    tween(this.crownR, { alpha: 0 }, READY_CALL.close);
    await tween(this.wipe, { k: 0 }, READY_CALL.close, {
      ease: Ease.quadIn,
      onUpdate: () => this.drawBand(),
    });
    if (token !== this.playId) return;

    const to = card
      ? this.toLocal(card.getGlobalPosition())
      : { x: this.homeX, y: this.homeY };
    const from = { x: this.rig.x, y: this.rig.y };
    this.flight.k = 0;

    await Promise.all([
      tween(this.flight, { k: 1 }, READY_CALL.drop, {
        ease: Ease.quadIn,
        onUpdate: () => {
          const k = this.flight.k;
          const n = 1 - k;
          this.rig.x = n * n * from.x + (2 * n * k + k * k) * to.x;
          this.rig.y = (n * n + 2 * n * k) * from.y + k * k * to.y;
        },
      }),
      tween(
        this.rig.scale,
        { x: READY_CALL.to, y: READY_CALL.to },
        READY_CALL.drop,
        { ease: Ease.quadIn },
      ),
      tween(this.rig, { alpha: 0 }, READY_CALL.drop, { ease: Ease.expoIn }),
    ]);
    if (token !== this.playId) return;

    if (card && card.flareReady) card.flareReady();

    this.playing = false;
    this.visible = false;
    this.frames = null;
  }

  killAll() {
    killTweensOf(this.wipe);
    killTweensOf(this.flight);
    killTweensOf(this.rig);
    killTweensOf(this.rig.scale);
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
    this.wipe.k = 0;
    this.drawBand();
  }
}
