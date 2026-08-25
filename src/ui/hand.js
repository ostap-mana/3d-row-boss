/**
 * Tutorial hand.
 *
 * Anti-stall device first, tutorial second: it appears after half a second of
 * silence, grows insistent at 5s, and the director plays the move itself at 7s.
 *
 * It has a second job now. When the player makes a move of their own the hand
 * does not simply get out of the way — it goes to their finger and rides the
 * swipe with it, so the gesture on screen is the same gesture whoever is
 * driving. See grab/dragTo/letGo, which the board's pointer handlers feed
 * through the director.
 *
 * The hand it shows is the painted gauntlet — see art/hinthand.js, which also
 * holds the fingertip the sprite is anchored on. The white hand this file used
 * to draw for itself is still here, one function down, as the fallback for a
 * device that cannot decode the bitmap: plainer, but it points at the same cell.
 */

import { Container, Graphics, Sprite } from "pixi.js";
import { tween, delay, Ease, killTweensOf } from "../core/tween.js";
import { getRenderer } from "../core/context.js";
import { HAND_ASPECT, HAND_TIP, hintHandTexture } from "../art/hinthand.js";

/**
 * The two hands, each with the three numbers the prop is driven by: how tall it
 * stands to its width, where its fingertip is, and how wide it is asked to be
 * against the board's cell.
 *
 * The painted hand is asked for wider than the drawn one, and that is not a
 * taste call. The drawn hand is a silhouette of a pointing finger and almost
 * nothing else, so its whole width is the gesture. The painting is a gauntlet:
 * the finger is about a quarter of the width and under half the height, and the
 * rest is glove, plate and cuff. Sized to the same box the *pointing* — the one
 * thing the prop is for — would come out two thirds the size it used to be.
 */
const DRAWN = {
  aspect: 1.55,
  tip: { x: 0.42, y: 0.06 },
  size: { k: 1.15, min: 46, max: 110 },
};

const PAINTED = {
  aspect: HAND_ASPECT,
  tip: HAND_TIP,
  size: { k: 1.45, min: 58, max: 140 },
};

/** Hand width the ripple was drawn at, so it scales with the prop. */
const RIPPLE_AT = 74;

let drawnTex = null;
function drawnTexture() {
  if (drawnTex) return drawnTex;
  const g = new Graphics();

  // Palm
  g.roundRect(-26, 4, 56, 62, 22);
  g.fill({ color: 0xf7f2ff });
  // Index finger
  g.roundRect(-8, -54, 22, 74, 11);
  g.fill({ color: 0xf7f2ff });
  // Thumb
  g.roundRect(-40, 20, 22, 34, 11);
  g.fill({ color: 0xe7dcf5 });
  // Outline pass
  g.roundRect(-26, 4, 56, 62, 22);
  g.stroke({ width: 5, color: 0x2a1738, alpha: 0.9 });
  g.roundRect(-8, -54, 22, 74, 11);
  g.stroke({ width: 5, color: 0x2a1738, alpha: 0.9 });
  // Fingertip highlight
  g.circle(3, -44, 7);
  g.fill({ color: 0xffffff, alpha: 0.75 });

  drawnTex = getRenderer().generateTexture({
    target: g,
    resolution: 2,
    antialias: true,
  });
  g.destroy();
  return drawnTex;
}

export class Hand extends Container {
  constructor() {
    super();

    this.ripple = new Graphics();
    this.ripple.circle(0, 0, 26);
    this.ripple.stroke({ width: 5, color: 0xffffff, alpha: 0.9 });
    this.ripple.alpha = 0;
    this.addChild(this.ripple);

    // The painting when it decoded, the drawn hand when it did not. The drawn
    // one is only built in that case: it costs a render texture to bake.
    const painted = hintHandTexture();
    const art = painted ? PAINTED : DRAWN;
    this.aspect = art.aspect;
    this.size = art.size;

    this.sprite = new Sprite(painted || drawnTexture());
    // Anchor on the fingertip so the hand points at the exact cell.
    this.sprite.anchor.set(art.tip.x, art.tip.y);
    this.addChild(this.sprite);

    this.alpha = 0;
    this.visible = false;
    this.token = 0;
    /** Token of the touch the hand is riding, or 0 when it is on its own. */
    this.held = 0;
    this.urgency = 1;
    this.baseSize = art.size.min;
  }

  resize(layout) {
    const { k, min, max } = this.size;
    this.baseSize = Math.max(min, Math.min(layout.board.cell * k, max));
    this.applySize();
  }

  applySize() {
    const s = this.baseSize * this.urgency;
    this.sprite.setSize(s, s * this.aspect);
    this.ripple.scale.set((s / RIPPLE_AT) * this.urgency);
  }

  setUrgency(level) {
    this.urgency = level;
    this.applySize();
  }

  stop() {
    this.token++;
    this.held = 0;
    tween(this, { alpha: 0 }, 0.18).then(() => {
      if (this.alpha === 0) this.visible = false;
    });
  }

  /* ------------------------------------------------------- the player's own */

  /**
   * Put the hand on the player's own finger and leave it there.
   *
   * The same prop, driven from the other end: instead of demonstrating a swap it
   * rides the one being made. It arrives at full alpha with no fade — a fade-in
   * is how a suggestion introduces itself, and there is nothing to introduce
   * when the finger is already on the glass.
   *
   * Any demo running is cancelled outright, tweens and all. `stop()` alone would
   * not do: it only ends the loop, and the eased slide it was in the middle of
   * would go on dragging the hand towards a cell the player is not touching.
   */
  grab(x, y) {
    const id = ++this.token;
    killTweensOf(this);
    killTweensOf(this.sprite);
    killTweensOf(this.sprite.scale);
    killTweensOf(this.ripple);
    killTweensOf(this.ripple.scale);

    this.held = id;
    this.visible = true;
    this.alpha = 1;
    this.x = x;
    this.y = y;
    this.applySize();
    this.press();
  }

  /** Follow the finger. Straight assignment: a tween here would lag the touch. */
  dragTo(x, y) {
    if (!this.held) return;
    this.x = x;
    this.y = y;
  }

  /** The finger came off: pop back to size and fade out. */
  async letGo() {
    const id = this.held;
    if (!id) return;
    this.held = 0;
    await this.release();
    // A new touch, or the hint taking the hand back, happened while that ran.
    if (id !== this.token) return;
    this.stop();
  }

  /* ----------------------------------------------------------- the demo loop */

  /** Loop a swipe demo between two points until stopped. */
  swipeLoop(from, to) {
    // Never over the player's own hand: the hint is what they are already doing.
    if (this.held) return;
    const id = ++this.token;
    this.visible = true;
    this.run(id, async () => {
      this.x = from.x;
      this.y = from.y;
      this.alpha = 0;
      await tween(this, { alpha: 1 }, 0.18);
      await this.press();
      await tween(this, { x: to.x, y: to.y }, 0.42, {
        ease: Ease.cubicInOut,
      });
      await this.release();
      await tween(this, { alpha: 0 }, 0.2);
      await delay(0.3);
    });
  }

  /* ------------------------------------------------- a lesson, beat by beat */

  /**
   * The same gesture as swipeLoop, taken apart.
   *
   * swipeLoop owns its own timing, which is right for a hint that only has to
   * nag and wrong for a lesson: the opening tutorial has to move the hand and
   * the stone under it on the same clock, and it cannot do that from outside a
   * loop that decides for itself when the travel starts. So the demo is handed
   * over in three pieces and the caller keeps the beat — see ui/coach.js.
   *
   * `reach` returns the token the rest of the beats have to be passed, and 0
   * if the prop was refused or taken. Every piece re-checks it, so a real
   * touch arriving mid-lesson (grab bumps the same token) stops the whole
   * thing exactly where it is rather than fighting the finger for the hand.
   *
   * @returns {Promise<number>} the token to drive the rest of the beats with
   */
  async reach(x, y) {
    if (this.held) return 0;
    const id = ++this.token;
    this.visible = true;
    this.x = x;
    this.y = y;
    this.alpha = 0;
    this.applySize();
    await tween(this, { alpha: 1 }, 0.18);
    if (id !== this.token) return 0;
    await this.press();
    return id === this.token ? id : 0;
  }

  /** Carry the pressed hand to another point. */
  async slideTo(id, x, y, dur) {
    if (id !== this.token) return false;
    await tween(this, { x, y }, dur, { ease: Ease.cubicInOut });
    return id === this.token;
  }

  /** Let go and fade out. Fire and forget: nothing waits on a hand leaving. */
  async leave(id) {
    if (id !== this.token) return;
    await this.release();
    if (id !== this.token) return;
    await tween(this, { alpha: 0 }, 0.2);
    if (id === this.token && this.alpha === 0) this.visible = false;
  }

  /** Loop a tap demo on one point until stopped. */
  tapLoop(at) {
    if (this.held) return;
    const id = ++this.token;
    this.visible = true;
    this.run(id, async () => {
      this.x = at.x;
      this.y = at.y;
      this.alpha = 0;
      await tween(this, { alpha: 1 }, 0.18);
      await this.press();
      await delay(0.12);
      await this.release();
      await delay(0.1);
      await this.press();
      await this.release();
      await tween(this, { alpha: 0 }, 0.22);
      await delay(0.32);
    });
  }

  async run(id, body) {
    while (id === this.token) {
      await body();
      if (id !== this.token) return;
    }
  }

  async press() {
    this.ripple.alpha = 0.9;
    this.ripple.scale.set(0.4 * this.urgency);
    tween(
      this.ripple.scale,
      { x: 1.5 * this.urgency, y: 1.5 * this.urgency },
      0.4,
    );
    tween(this.ripple, { alpha: 0 }, 0.4);
    await tween(
      this.sprite.scale,
      {
        x: this.sprite.scale.x * 0.86,
        y: this.sprite.scale.y * 0.86,
      },
      0.1,
    );
  }

  async release() {
    const s = this.baseSize * this.urgency;
    await tween(this.sprite, { width: s, height: s * this.aspect }, 0.14, {
      ease: Ease.backOut,
    });
  }
}
