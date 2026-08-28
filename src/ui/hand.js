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
 * The hand it shows is the neon outline off the hint-hand sheet — see
 * art/hinthand.js, which also holds the fingertip the sprite is anchored on. It
 * comes in all six element colours and setElement decides which is worn, so the
 * hand matches the gem it has hold of the way the frame and the arrow around it
 * already do. The white hand this file used to draw for itself is still here, one
 * function down, as the fallback for a device that cannot decode the bitmaps:
 * plainer, and one colour, but it points at the same cell.
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
 * nothing else, so its whole width is the gesture; the painted one carries a
 * palm, a thumb and a cuff around it, so the same box would spend most of itself
 * on everything except the pointing.
 *
 * 1.45 survived the swap from the gauntlet to the neon hand because the sheet
 * agrees with it. Section 10.6 of the hint-hand sheet stands the hand beside an
 * element icon at about 1.7 times its diameter, and a gem is 0.86 of a cell —
 * which puts the artist's own composition at 1.47 cells of hand.
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

/** How far the hand shrinks under a press, as a fraction of its own size. */
const PRESS = 0.86;

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

  /**
   * Put the prop back to the size the layout and the urgency ask for.
   *
   * The size tweens go with it. press() and release() both drive the sprite's
   * width and height, and a resize landing between the two used to set the size
   * underneath a tween that went on interpolating towards the old one — the
   * hand snapped to the new board and then crawled back to the size of the old.
   *
   * The ripple is not sized here any more, and the line that did it was dead
   * anyway: the ring only exists while it is expanding, and the press it
   * expands under overwrote this scale a frame later — which is how it went on
   * reading the urgency twice, once inside `s` and once beside it, without the
   * squared number ever reaching the screen. Sizing it is press()'s job now,
   * and it is done there off the same `s`, so RIPPLE_AT means what it says.
   */
  applySize() {
    const s = this.baseSize * this.urgency;
    killTweensOf(this.sprite);
    this.sprite.setSize(s, s * this.aspect);
  }

  setUrgency(level) {
    this.urgency = level;
    this.applySize();
  }

  /**
   * Wear the colour of the element the hand is about to point at.
   *
   * A texture swap and nothing else — not a resize, not a re-anchor. The six
   * hands are packed onto a common canvas with their fingertips on a common
   * point (see tools/pack-neon-hand.mjs), so HAND_ASPECT and HAND_TIP are as
   * true of the new texture as they were of the old one and neither number has
   * to be read again. Which is the whole reason the packer normalises them: the
   * height this file sets is a width times one aspect, and the anchor is a
   * fraction of whatever picture happens to be under it, so six crops of six
   * shapes would each need their own pair and would stretch and drift on the
   * swap without them.
   *
   * Called before the hand is shown rather than while it is up. Recolouring a
   * hand mid-gesture would read as a second hand arriving, and the callers have
   * nothing to say in the middle of a swipe anyway: what element the lesson is
   * about is settled before the finger goes down. Callers that do not know or do
   * not care leave it alone — nothing here has to be told anything for the prop
   * to work.
   *
   * A no-op on a device that fell back to the drawn hand: hintHandTexture
   * answers null for every element, and a white hand is what that device gets.
   *
   * @param {number} type one of config.js's six, or -1 for none
   */
  setElement(type) {
    const tex = hintHandTexture(type);
    if (tex) this.sprite.texture = tex;
  }

  /**
   * Take the prop off the screen.
   *
   * Everything driving it is killed first, and that is not tidiness. The engine
   * has no idea two tweens want the same property: updateTweens walks its list
   * backwards, so of two tweens on one alpha the one added *first* is written
   * last and wins. A fade-out added on top of a fade-in therefore lost to it —
   * a stop landing inside the 0.18s the hand takes to arrive left it sitting on
   * the board at full alpha with nothing left running to take it off again.
   *
   * The slide goes with it. A hand fading out is finished talking, and one that
   * keeps travelling to the cell it was going to is a hand still pointing.
   */
  stop() {
    const id = ++this.token;
    this.held = 0;
    killTweensOf(this);
    killTweensOf(this.sprite);
    killTweensOf(this.ripple);
    killTweensOf(this.ripple.scale);
    this.ripple.alpha = 0;
    tween(this, { alpha: 0 }, 0.18).then(() => {
      // The token, not the alpha: a touch arriving mid-fade has already put the
      // hand back at alpha 1 through grab(), and reading the alpha here would
      // hide the prop out from under the finger that just claimed it.
      if (id === this.token) this.visible = false;
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
      // Checked between beats, not only between passes. stop() kills whatever
      // tween is in flight, which resolves it early — a body that read that as
      // "landed" carried straight on into the next second of gesture, sliding a
      // hand across a board that had already been given back to the player.
      if (!(await this.beat(id, tween(this, { alpha: 1 }, 0.18)))) return;
      if (!(await this.beat(id, this.press()))) return;
      const travel = tween(this, { x: to.x, y: to.y }, 0.42, {
        ease: Ease.cubicInOut,
      });
      if (!(await this.beat(id, travel))) return;
      if (!(await this.beat(id, this.release()))) return;
      if (!(await this.beat(id, tween(this, { alpha: 0 }, 0.2)))) return;
      await this.beat(id, delay(0.3));
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
      if (!(await this.beat(id, tween(this, { alpha: 1 }, 0.18)))) return;
      if (!(await this.beat(id, this.press()))) return;
      if (!(await this.beat(id, delay(0.12)))) return;
      if (!(await this.beat(id, this.release()))) return;
      if (!(await this.beat(id, delay(0.1)))) return;
      if (!(await this.beat(id, this.press()))) return;
      if (!(await this.beat(id, this.release()))) return;
      if (!(await this.beat(id, tween(this, { alpha: 0 }, 0.22)))) return;
      await this.beat(id, delay(0.32));
    });
  }

  async run(id, body) {
    while (id === this.token) {
      await body();
      if (id !== this.token) return;
    }
  }

  /**
   * Wait out one beat of a looped demo.
   *
   * @returns {Promise<boolean>} whether the prop is still the caller's
   */
  async beat(id, job) {
    await job;
    return id === this.token;
  }

  /**
   * The finger goes down: the hand dips, and a ring goes out under it.
   *
   * Both halves are measured off the prop's own size rather than off numbers,
   * and neither is relative to where the sprite happens to be standing.
   *
   * The ring used to expand from 0.4 to 1.5 flat, which is a 10px circle
   * growing to a 39px one whatever the board underneath was — RIPPLE_AT, the
   * radius the circle was drawn against, went unread because applySize set the
   * scale and the next press overwrote it. On a tall phone the hand is 140
   * wide and the ring it put down was a third of its fingertip.
   *
   * The dip used to be taken as a fraction of the current scale, so two presses
   * without a release between them compounded — the hand shrank 14% and then
   * another 14% of that, and only a release could put it back. Both of these
   * write width and height on the same object now, so killing one kills the
   * other and they cannot interleave.
   */
  async press() {
    const s = this.baseSize * this.urgency;
    const ring = s / RIPPLE_AT;
    killTweensOf(this.ripple);
    killTweensOf(this.ripple.scale);
    this.ripple.alpha = 0.9;
    this.ripple.scale.set(ring * 0.4);
    tween(this.ripple.scale, { x: ring * 1.5, y: ring * 1.5 }, 0.4);
    tween(this.ripple, { alpha: 0 }, 0.4);

    killTweensOf(this.sprite);
    await tween(
      this.sprite,
      { width: s * PRESS, height: s * this.aspect * PRESS },
      0.1,
    );
  }

  /** The finger comes up. Absolute, so it lands on the size the layout asks. */
  async release() {
    const s = this.baseSize * this.urgency;
    killTweensOf(this.sprite);
    await tween(this.sprite, { width: s, height: s * this.aspect }, 0.14, {
      ease: Ease.backOut,
    });
  }
}
