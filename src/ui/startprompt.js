/**
 * The one thing on screen before the creative is touched, over the one thing
 * behind it: the fight.
 *
 * Three shapes have stood in this slot and the first two were both wrong in the
 * same way. A gate screen — scrim over the arena, wordmark across the middle,
 * the prompt under it — spent the creative's first frame on a title card. Then
 * the card went and this line was left over an arena deliberately held empty
 * for the entrance to fill, which spent that frame on an empty room. A
 * playable's first frame is the one moment it is guaranteed to be looked at,
 * and neither of them spent it on the game.
 *
 * So nothing is held back behind this any more (see Director.armIntro and
 * T.entrance): the golem is standing in the ruins, the board is dealt, the
 * party is up, and this line is over the top of all of it. What a viewer sees
 * before they touch is the game, plus the sentence telling them it is theirs
 * to start.
 *
 * It catches nothing. The touch that starts the run is taken by a window
 * listener — see firstTouch in main.js — so this has no hit area, no pointer
 * handler and `eventMode` "none": it is a caption, not a button. The whole
 * screen is what answers it, which is a target nothing can miss, and the board
 * underneath keeps every point of itself rather than losing the middle of it to
 * a control.
 *
 * Deliberately not the word PLAY. That word is the store button on every other
 * surface in the creative — see COPY.cta — and a first screen where it means
 * `begin` against a last screen where it means `install` teaches the player to
 * distrust the one control the whole thing is selling.
 */

import { Container, Text } from "pixi.js";
import { COPY, FONT } from "../config.js";
import { tween } from "../core/tween.js";
import { fitFont } from "./text.js";

/** The line's breath, in radians a second — the one moving thing here. */
const PULSE = 2.6;

export class StartPrompt extends Container {
  constructor() {
    super();

    this.label = new Text({
      text: COPY.start,
      style: {
        fontFamily: FONT,
        fontSize: 22,
        fontWeight: "900",
        fill: 0xfbf1e4,
        letterSpacing: 3,
        /**
         * Heavier than the UI's usual outline, and it is doing real work now.
         * This is the one label in the creative set straight over the board,
         * and what is behind it is five columns of saturated gem — the busiest
         * background any type in here has to hold against. The same trick the
         * hud's own shouts use over the same cells, at the same weight.
         */
        stroke: { color: 0x1a0714, width: 5, join: "round" },
        dropShadow: {
          color: 0x05030a,
          alpha: 0.75,
          blur: 6,
          distance: 0,
          angle: 0,
        },
        align: "center",
      },
    });
    this.label.anchor.set(0.5);
    this.addChild(this.label);

    // A caption, not a button. See the header.
    this.eventMode = "none";
    this.t = 0;
    this.gone = false;
  }

  resize(layout) {
    const { w, h, ui, safe } = layout;

    fitFont(this.label, w * 0.82, Math.max(15, 23 * ui));
    this.label.x = w / 2;
    // Centred inside the safe area rather than inside the screen: a line under
    // a notch is a line nobody reads, and this is the one sentence in the
    // creative that has to be read before anything else happens.
    this.label.y = safe.top + (h - safe.top - safe.bottom) * 0.5;
  }

  update(dt) {
    if (this.gone || !this.visible) return;
    this.t += dt;
    // On the label rather than on the container, so `dismiss` owns an alpha of
    // its own and the two do not fight over the same number.
    this.label.alpha = 0.66 + Math.abs(Math.sin(this.t * PULSE)) * 0.34;
  }

  /**
   * Off, on the touch it asked for.
   *
   * Fired and not awaited: the first beat of the answer is the flash and the
   * roar, and holding those back a fifth of a second to let a caption fade
   * would spend the only moment in the creative that is pure answer to the
   * player's own input.
   */
  dismiss() {
    if (this.gone) return;
    this.gone = true;
    tween(this, { alpha: 0 }, 0.2).then(() => {
      this.visible = false;
    });
  }
}
