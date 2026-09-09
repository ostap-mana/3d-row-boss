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

import { FONT, FONT_TITLE, GEM_LIGHT, HEROES, READY_CALL } from "../config.js";
import { CROWN_CELL, readyCrownFrames } from "../art/readyfx.js";
import { tween, killTweensOf, Ease } from "../core/tween.js";

export class ReadyCall extends Container {
  constructor() {
    super();
    this.visible = false;
    this.layout = null;
    this.playId = 0;

    /** Frames of the sheet currently on the crown, and where in them we are. */
    this.frames = null;
    this.frameT = 0;

    this.crown = new Sprite();
    this.crown.anchor.set(0.5, 1);
    this.crown.blendMode = "add";
    this.addChild(this.crown);

    this.word = new Text({
      text: "READY",
      style: {
        fontFamily: FONT_TITLE,
        fontSize: 64,
        fontWeight: "900",
        fill: 0xffffff,
        letterSpacing: 10,
      },
    });
    this.word.anchor.set(0.5);
    this.addChild(this.word);

    this.who = new Text({
      text: "",
      style: {
        fontFamily: FONT,
        fontSize: 18,
        fontWeight: "800",
        fill: 0xffffff,
        letterSpacing: 6,
      },
    });
    this.who.anchor.set(0.5);
    this.addChild(this.who);

    /**
     * Everything that moves as one piece, so the collapse is one tween on one
     * transform rather than five that have to agree with each other.
     */
    this.rig = new Container();
    this.addChild(this.rig);
    this.rig.addChild(this.crown, this.word, this.who);
  }

  resize(layout) {
    this.layout = layout;
    const s = layout.safeBox;

    // Placed against the safe box and not the window, for the reason
    // core/layout.js gives: a notch is not screen the composition may use.
    this.homeX = s.x + s.w / 2;
    this.homeY = s.y + s.h * READY_CALL.y;

    // Height drives it and the width follows the cell's aspect, which is the
    // packer's fourth rule: these sheets are fitted, never stretched. See
    // art/readyfx.js and CROWN_CELL.
    this.crownH = s.w * READY_CALL.crown;
    this.crownW = this.crownH * CROWN_CELL.aspect;
    this.crown.position.set(0, this.crownH * 0.34);
    this.fitCrown();

    this.word.style.fontSize = Math.round(s.w * READY_CALL.word);
    this.who.style.fontSize = Math.round(s.w * READY_CALL.who);
    this.word.position.set(0, 0);
    this.who.position.set(0, -this.word.height * 0.62);

    if (!this.playing) this.rig.position.set(this.homeX, this.homeY);
  }

  /**
   * Size the crown, and only ever with a real texture under it.
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
  fitCrown() {
    if (!this.crownH || !this.crown.texture || this.crown.texture.width <= 1) {
      return;
    }
    this.crown.setSize(this.crownW, this.crownH);
  }

  /**
   * Walk the crown's flipbook.
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
    if (this.crown.texture === this.frames[i]) return;
    this.crown.texture = this.frames[i];
    this.fitCrown();
  }

  /**
   * Announce a hero, then drop the whole thing into their card.
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
    // A hero whose sheet has not landed yet still gets the words — see
    // art/readyfx.js on why an element with no sheet is a supported case.
    this.crown.visible = !!this.frames;
    if (this.frames) {
      this.crown.texture = this.frames[0];
      this.fitCrown();
    }

    this.word.style.fill = light;
    this.who.style.fill = 0xffffff;
    this.who.text = hero.name;

    killTweensOf(this.rig);
    killTweensOf(this.rig.scale);
    killTweensOf(this.word.scale);

    this.rig.position.set(this.homeX, this.homeY);
    this.rig.alpha = 1;
    this.rig.scale.set(READY_CALL.from);
    this.word.scale.set(1);
    this.visible = true;

    // In on a back-out, which is the one ease that reads as arriving rather than
    // as growing: it overshoots the size it is going to hold and settles back
    // into it, and the settle is what the eye reads as weight.
    await tween(this.rig.scale, { x: 1, y: 1 }, READY_CALL.in, {
      ease: Ease.backOut,
    });
    if (token !== this.playId) return;

    await tween(this.word.scale, { x: 1.06, y: 1.06 }, READY_CALL.hold, {
      ease: Ease.quadOut,
    });
    if (token !== this.playId) return;

    // Where the card is, in this container's own space. Read now and not at
    // resize: the row is laid out by then, and a card can be anywhere in it.
    const to = card
      ? this.toLocal(card.getGlobalPosition())
      : { x: this.homeX, y: this.homeY };

    await Promise.all([
      tween(this.rig, { x: to.x, y: to.y }, READY_CALL.drop, {
        ease: Ease.quadIn,
      }),
      tween(
        this.rig.scale,
        { x: READY_CALL.to, y: READY_CALL.to },
        READY_CALL.drop,
        { ease: Ease.quadIn },
      ),
      tween(this.rig, { alpha: 0 }, READY_CALL.drop, { ease: Ease.quadIn }),
    ]);
    if (token !== this.playId) return;

    this.playing = false;
    this.visible = false;
    this.frames = null;
  }

  /** Take it off the screen now — a rebuilt fight, or a cast that beat it. */
  clear() {
    this.playId++;
    this.playing = false;
    this.visible = false;
    this.frames = null;
    killTweensOf(this.rig);
    killTweensOf(this.rig.scale);
    killTweensOf(this.word.scale);
    this.rig.alpha = 1;
  }
}
