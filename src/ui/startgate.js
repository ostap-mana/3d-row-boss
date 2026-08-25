/**
 * The start gate — the tap the fight does not begin without.
 *
 * Every network this ships to asks a playable not to start on its own. The
 * creative used to raise the boss the moment the slot reported itself viewable,
 * which is precisely the behaviour that rule names: a monster roaring out of a
 * lava pool at somebody who has not agreed to look at it yet.
 *
 * Holding the run behind one tap buys three things past the compliance:
 *
 *   - The audio opens on that tap. Web Audio needs a user gesture and the only
 *     gesture a match-3 otherwise offers is a drag, which is the weakest kind
 *     of gesture to hang an unlock on — see audio/engine.js. A deliberate first
 *     tap is the cleanest unlock there is, and it means the intro roar is the
 *     first thing the player hears rather than the first thing they lose.
 *   - The twenty second clock starts when somebody is actually looking. It ran
 *     from viewability before, so on a slow scroll the fight was half over by
 *     the time the ad was on screen.
 *   - The intro plays to somebody already leaning in.
 *
 * Deliberately not the PLAY NOW plate, and deliberately not the word PLAY. That
 * plate is a store button on every other surface in the creative; a first screen
 * where it means `begin` and a last screen where it means `install` teaches the
 * player to distrust the one control the whole thing is selling.
 *
 * The scrim is sheer rather than solid on purpose. What is behind it is the
 * arena — the lava, the pillars, the light — and a gate that hides the art is a
 * gate that spends its one screen saying nothing about the game.
 */

import { Container, Graphics, Rectangle, Text } from "pixi.js";
import { COPY, FONT } from "../config.js";
import { fitLogo, logoHeight, logoSprite } from "../art/brand.js";
import { tween } from "../core/tween.js";
import { fitFont } from "./text.js";

/** The prompt's breath, in radians a second — the one moving thing here. */
const PULSE = 2.6;

export class StartGate extends Container {
  constructor() {
    super();

    this.scrim = new Graphics();
    this.addChild(this.scrim);

    // The wordmark, when it decoded. Guarded like every other use of it: a
    // device that could not read the bitmap still gets a gate it can tap.
    this.logo = logoSprite();
    if (this.logo) this.addChild(this.logo);

    this.prompt = new Text({
      text: COPY.start,
      style: {
        fontFamily: FONT,
        fontSize: 22,
        fontWeight: "900",
        fill: 0xfbf1e4,
        letterSpacing: 3,
        stroke: { color: 0x1a0714, width: 4, join: "round" },
        align: "center",
      },
    });
    this.prompt.anchor.set(0.5);
    this.addChild(this.prompt);

    this.eventMode = "static";
    this.cursor = "pointer";
    this.t = 0;
    /** The promise handed out by wait(), so a second caller gets the same one. */
    this.taken = null;
  }

  resize(layout) {
    const { w, h, ui, safe } = layout;

    this.scrim.clear();
    this.scrim.rect(0, 0, w, h);
    this.scrim.fill({ color: 0x05030a, alpha: 0.62 });

    // Centred inside the safe area rather than inside the screen: this is the
    // one screen in the creative with nothing else on it to pull the eye off a
    // notch, so a wordmark under one would be the only thing anybody saw.
    const midY = safe.top + (h - safe.top - safe.bottom) * 0.5;

    const logoW = Math.min(w * 0.72, 420 * ui);
    const logoH = this.logo ? logoHeight(logoW) : 0;
    if (this.logo) fitLogo(this.logo, logoW);

    fitFont(this.prompt, w * 0.7, Math.max(15, 22 * ui));
    const gap = Math.max(18, 26 * ui);
    const promptH = this.prompt.height;
    const top = midY - (logoH + gap + promptH) / 2;

    if (this.logo) {
      this.logo.x = w / 2;
      this.logo.y = top + logoH / 2;
    }
    this.prompt.x = w / 2;
    this.prompt.y = top + logoH + gap + promptH / 2;

    // The whole screen is the button. Nothing behind this is live yet, so there
    // is nothing a generous target can steal a tap from.
    this.hitArea = new Rectangle(0, 0, w, h);
  }

  update(dt) {
    if (!this.visible) return;
    this.t += dt;
    this.prompt.alpha = 0.62 + Math.abs(Math.sin(this.t * PULSE)) * 0.38;
  }

  /**
   * The first tap, once.
   *
   * Resolves after the gate has finished getting out of the way rather than on
   * the tap itself: the intro's first beat is a shake, and a shake starting
   * under a screen that is still fading off reads as the fade being broken.
   *
   * @returns {Promise<void>}
   */
  wait() {
    if (this.taken) return this.taken;
    this.taken = new Promise((resolve) => {
      this.on("pointertap", () => {
        this.eventMode = "none";
        this.removeAllListeners();
        tween(this, { alpha: 0 }, 0.28).then(() => {
          this.visible = false;
          resolve();
        });
      });
    });
    return this.taken;
  }
}
