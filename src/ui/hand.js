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
 * The hand it shows is the neon outline off the hand-pose sheet — see
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
 * 1.45 came off the old hint-hand sheet, which had composed the hand for us:
 * its section 10.6 stood the hand beside an element icon at about 1.7 times its
 * diameter, and a gem is 0.86 of a cell, which put the artist's own composition
 * at 1.47 cells of hand. It has fitted every squat draw of the prop since — the
 * gauntlet at 1.13 times its own width, the neon redraws at 1.38 and, on the
 * sheet the art comes off now, 1.38 again — because on a hand that wide 1.45
 * cells of width is also a sane height.
 *
 * It went to 1.10 for one draw and came back, and what that swap worked out is
 * the thing to keep. That hand was a long straight finger on a narrow palm
 * standing 1.81 times its own width, so holding the width would have hung two
 * and a half cells of hand off the fingertip on a board five cells tall; 1.10 is
 * what holds the *height* instead, and 1.45 times 1.38 and 1.10 times 1.81 both
 * come out a hair under two cells of reach down the board. So height is the
 * number that carries across a redraw which changes the hand's proportions, and
 * the width to write here is whichever one gives that height back. min and max
 * move with it — they went to 0.76 of these for the narrow hand and back — so
 * the reach holds at both ends of the clamp, on the widest screen the prop is on
 * and on the narrowest.
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

/** How far the hand shrinks under a press, as a fraction of its own size. */
const PRESS = 0.86;

/**
 * How the prop gets to the cell it is about to point at.
 *
 * It used not to get there at all. reach() and both loops wrote x and y
 * outright and faded the hand up where it landed, so the prop never moved onto
 * the frame it was pointing at — it appeared on it, dead still, and the only
 * thing that said it had arrived was the fade. On a lesson that plays the same
 * swap over and over, that reads as a hand blinking in and out of the board
 * rather than one hand demonstrating a move.
 *
 * So every arrival is a travel now. A hand already on the screen goes from
 * wherever it is. One coming back from nothing starts `entry` off the target —
 * below and to the right, the side its own wrist and cuff are on, so it comes in
 * from off the board the way a real hand does and not out of the middle of it —
 * and fades up over the first `fade` of the way, so it is solid well before it
 * lands.
 *
 * `arc` and `rise` are what make it a hand and not a sprite on a path. The prop
 * lifts off the glass on the way over — up the screen, and a little larger for
 * being nearer — and settles back onto it as it arrives, which is the gesture
 * press() and release() already play at either end of a drag. The lift is a
 * fraction of the distance travelled so a hop between neighbours barely leaves
 * the board, and it is capped in units of the hand's own width so a move across
 * the whole board does not throw the prop off the top of it.
 *
 * Only the *approach* bows. The drag itself — swipeLoop's travel, and the
 * slideTo the lesson runs against previewSwap — stays flat and stays pressed,
 * because a finger carrying a stone from one cell to the next is a finger on the
 * glass, and lifting it there would be the hand letting go of the gem it is
 * supposed to be moving.
 */
const APPROACH = {
  /** Seconds of travel: `min` for a hop, up to `max` once it is `span` away. */
  min: 0.24,
  max: 0.42,
  /**
   * The distance, in points, that earns the whole of `max`.
   *
   * A couple of cells. The board is five cells of about 130 points, so a swap
   * between neighbours travels well under this and gets a quick hop, and
   * anything reaching across the board gets the full glide.
   */
  span: 320,
  /** Where a hand arriving from nothing starts, in its own drawn size. */
  entry: { x: 0.5, y: 0.7 },
  /** How much of that travel is spent fading up. */
  fade: 0.55,
  /** The lift at the top of the arc: this much of the distance travelled... */
  arc: 0.16,
  /** ...and never more than this much of the hand's own width. */
  ceiling: 0.4,
  /** How much bigger the hand is drawn at the top of the arc. */
  rise: 1.07,
};

/**
 * The dark rim carried under the hand, and what it is for.
 *
 * The prop is a neon *outline* in the colour of the gem it is pointing at — see
 * art/hinthand.js, which packs one per element for exactly that reason. Which
 * means the one board it is guaranteed to be unreadable on is the board it is
 * always on: a green hand laid over the three green gems it is demonstrating is
 * a bright line on a bright line, and what the player sees is a smear where the
 * move was supposed to be.
 *
 * So the same art goes down twice: once in black a little fatter, then the neon
 * over it. Because both copies are the same alpha mask, the black is only ever
 * *behind the line* — a rim, not a silhouette, and nothing of the gems under the
 * open middle of the hand is covered that was not covered before.
 *
 * 1.12 is a rim about a pixel and a half at the size the prop is drawn, which is
 * the width the neon itself is: enough to read as an edge on the hand's own
 * colour, not enough to read as a second hand.
 */
const SHADE = { grow: 1.12, alpha: 0.58 };

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

    // The painting when it decoded, the drawn hand when it did not. The drawn
    // one is only built in that case: it costs a render texture to bake.
    const painted = hintHandTexture();
    const art = painted ? PAINTED : DRAWN;
    this.aspect = art.aspect;
    this.size = art.size;

    const texture = painted || drawnTexture();

    // Under the hand and sharing its texture, so the two can never disagree
    // about what shape they are — see SHADE. Added first, which is the whole of
    // what makes it a backing rather than a stain over the top.
    this.shade = new Sprite(texture);
    this.shade.anchor.set(art.tip.x, art.tip.y);
    this.shade.tint = 0x000000;
    this.shade.alpha = SHADE.alpha;
    this.addChild(this.shade);

    this.sprite = new Sprite(texture);
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
   */
  applySize() {
    killTweensOf(this.sprite);
    killTweensOf(this.shade);
    this.drawAt(1);
  }

  /**
   * Write the prop's size, at a multiple of the one the layout asks for.
   *
   * Split out of applySize because approach() drives it per frame off the arc
   * and must not kill the tweens it is being driven from. Every writer of the
   * hand's size goes through here, so the rim and the line can only ever be the
   * same size as each other.
   */
  drawAt(scale) {
    const s = this.baseSize * this.urgency * scale;
    this.sprite.setSize(s, s * this.aspect);
    this.shade.setSize(s * SHADE.grow, s * this.aspect * SHADE.grow);
  }

  /**
   * Travel to the point the prop is about to point at, and arrive on it.
   *
   * One position tween, with the arc and the rise written from its onUpdate
   * rather than tweened beside it. That is deliberate: the engine hands the
   * callback the progress of the tween it belongs to (see core/tween.js), so the
   * bow and the size cannot drift out of step with the travel they are a bow and
   * a rise *of*, and a stop() landing mid-flight ends all three by ending one.
   * It is also safe to write x and y from there — the tween re-derives both from
   * the values it captured when it was made, every frame, so an offset laid on
   * top of them is not carried into the next frame and cannot accumulate.
   *
   * @param {number} id the caller's token
   * @param {boolean=} fresh start off the target even if the prop is already on
   *   the screen somewhere — see tapLoop, which needs it
   * @returns {Promise<boolean>} whether the prop is still the caller's
   */
  async approach(id, x, y, fresh = false) {
    // Whatever was driving the prop is not driving it any more, and this is the
    // gesture that says so. It also takes out a fade left in flight by a stop()
    // in the same tick: that tween writes alpha *after* one started later does,
    // so a hand told to go somewhere while it was leaving used to travel there
    // invisibly. Killed tweens still resolve, and stop()'s continuation checks
    // the token the caller has already bumped, so nothing hides the prop behind
    // this.
    killTweensOf(this);

    const entering = fresh || this.alpha <= 0;
    const s = this.baseSize * this.urgency;
    if (entering) {
      this.x = x + s * APPROACH.entry.x;
      this.y = y + s * this.aspect * APPROACH.entry.y;
      this.alpha = 0;
    }

    const span = Math.hypot(x - this.x, y - this.y);
    if (span < 1) {
      // Already standing on it. An eased tween over no distance is a frame of
      // stall and nothing to look at.
      this.x = x;
      this.y = y;
      this.drawAt(1);
      if (entering) await tween(this, { alpha: 1 }, APPROACH.min);
      return id === this.token;
    }

    const dur =
      APPROACH.min +
      (APPROACH.max - APPROACH.min) * Math.min(1, span / APPROACH.span);
    const lift = Math.min(span * APPROACH.arc, s * APPROACH.ceiling);

    if (entering) tween(this, { alpha: 1 }, dur * APPROACH.fade);

    // Decelerating into the frame when it is arriving from off the board, eased
    // at both ends when it is already on the board and crossing it: the first is
    // a hand coming to rest on something, the second a hand leaving one place
    // for another.
    await tween(this, { x, y }, dur, {
      ease: entering ? Ease.cubicOut : Ease.cubicInOut,
      onUpdate: (e, t) => {
        // Zero at both ends, so the prop lands on the exact point asked for and
        // at the exact size the layout asks for, whatever the arc did in
        // between. Off linear time rather than the eased position, so the lift
        // is symmetric about the middle of the flight and not about the middle
        // of the distance.
        const bow = Math.sin(Math.PI * t);
        this.y -= lift * bow;
        this.drawAt(1 + (APPROACH.rise - 1) * bow);
      },
    });
    return id === this.token;
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
    // The hand of the element the lesson is about, and the dark rim under it is
    // what keeps that readable. The prop is a neon line laid over the gems it is
    // demonstrating, so a green hand on three green gems is a bright line on a
    // bright line of the same hue with nothing between them — SHADE is the thing
    // between them, and it is drawn for this case and no other.
    //
    // This spent a while pinned to the neutral hand for that reason: the pale
    // one separates from all six, and which element the lesson is about is
    // already said by the frames round the pair, the arrow between them and the
    // light the scrim cuts. The colour is back because a hand that names the
    // element it has hold of is worth the contrast it costs. If it ever reads as
    // a smear again, dropping the argument on the line below is the whole of
    // taking it away.
    const tex = hintHandTexture(type);
    if (!tex) return;
    this.sprite.texture = tex;
    this.shade.texture = tex;
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
      // Checked between beats, not only between passes. stop() kills whatever
      // tween is in flight, which resolves it early — a body that read that as
      // "landed" carried straight on into the next second of gesture, sliding a
      // hand across a board that had already been given back to the player.
      // approach() answers the same question as beat() for the same reason.
      if (!(await this.approach(id, from.x, from.y))) return;
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
    this.applySize();
    // The travel onto the cell, rather than an appearance on it. See APPROACH:
    // a hand still on the board crosses it, one arriving from nothing comes in
    // off the frame, and either way it is moving when the player first sees it.
    if (!(await this.approach(id, x, y))) return 0;
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
      // Always in off the target, never across from wherever the prop was: the
      // tap lesson is played on the hero row, and ui/coach.js's cardBeat takes
      // the hand off the board in the same tick it asks for this precisely so
      // that it does not travel there from a gem — a hand crossing that gap
      // reads as the player dragging a stone into the row. Which is a thing the
      // prop must not appear to do, and the reason approach() takes the flag.
      if (!(await this.approach(id, at.x, at.y, true))) return;
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
   * The finger goes down: the hand dips.
   *
   * Measured off the prop's own size rather than off a number, and not relative
   * to where the sprite happens to be standing.
   *
   * A white ring used to go out under the hand on every press, expanding and
   * fading over the same 0.4s. It is gone. What it was drawn over is the thing
   * the tap is *about* — a hero card's portrait, three gems in a run — and a
   * disc of white light thrown across that twice a second hid the subject to
   * announce the pointer. The hand already reads as a tap: it dips, and it has
   * a dark rim under it so it reads whatever it is over. See SHADE.
   *
   * The dip used to be taken as a fraction of the current scale, so two presses
   * without a release between them compounded — the hand shrank 14% and then
   * another 14% of that, and only a release could put it back. Both halves
   * write width and height on the same object now, so killing one kills the
   * other and they cannot interleave.
   */
  async press() {
    const s = this.baseSize * this.urgency;
    killTweensOf(this.sprite);
    killTweensOf(this.shade);
    // Both on the same clock. Awaited on the hand rather than on the pair: they
    // are given the same duration, so the rim lands with the line it is under.
    tween(
      this.shade,
      {
        width: s * PRESS * SHADE.grow,
        height: s * this.aspect * PRESS * SHADE.grow,
      },
      0.1,
    );
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
    killTweensOf(this.shade);
    tween(
      this.shade,
      { width: s * SHADE.grow, height: s * this.aspect * SHADE.grow },
      0.14,
      { ease: Ease.backOut },
    );
    await tween(this.sprite, { width: s, height: s * this.aspect }, 0.14, {
      ease: Ease.backOut,
    });
  }
}
