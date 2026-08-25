/**
 * The opening lesson.
 *
 * The creative used to explain itself with four words and a hand. `MATCH TO
 * ATTACK` says what to do to somebody who already knows what a match is, and
 * the hand demonstrates a swipe — but a swipe over gems that never move shows
 * a gesture and not a rule. Somebody meeting a match-three for the first time,
 * in a twenty second window, with a monster roaring at them, is not going to
 * infer "line three of the same colour up" from a gauntlet sliding sideways.
 * They will decide the screen is busy and wait for it to be over.
 *
 * So this shows the rule instead of naming it, in four beats and no words:
 *
 *   1. the two gems that are already in a line light up — here is a pair;
 *   2. the one that would complete it lights up too, with an arrow off it —
 *      this one, that way;
 *   3. the gem actually travels. Board.previewSwap slides the real stones on
 *      screen without touching the model, so what the player watches is the
 *      move they are being asked to make, made;
 *   4. the three light as one, joined by a bar drawn across them — this is
 *      what you were making.
 *
 * Then it puts everything back and does it again, until the player touches the
 * board. The first touch ends it for the whole run — see
 * Director.spendOpeningHint. Nothing here ever blocks input: at every beat the
 * board underneath is live, and a player who has understood it two beats in
 * can swipe straight through the lesson.
 *
 * Drawn, not painted: outlines, a bar and a chevron in Graphics, which is zero
 * kilobytes and sharp on any screen.
 */

import { Container, Graphics } from "pixi.js";
import { GEM_LIGHT } from "../config.js";
import { tween, delay } from "../core/tween.js";

/** How long the completed run is held up before the board is put back. */
const HOLD = 0.62;
/** The travel, out and back. Out is the lesson; back is only bookkeeping. */
const TRAVEL = 0.4;
const RETURN = 0.26;

export class Coach extends Container {
  constructor() {
    super();

    this.marks = new Graphics();
    this.addChild(this.marks);

    this.alpha = 0;
    this.visible = false;
    /** Retires a lesson in flight — every await in the loop checks it. */
    this.token = 0;
  }

  resize() {
    // Every mark is drawn from the board's own cell size at draw time, so the
    // next beat lands in the right place by itself and a lesson is never more
    // than a beat from its next redraw. All this has to do is take down what
    // is on screen now, rather than leave an outline floating over the layout
    // it was measured against.
    this.marks.clear();
  }

  /** End the lesson. The board is put back by whoever owns it. */
  stop() {
    this.token++;
    this.marks.clear();
    this.alpha = 0;
    this.visible = false;
  }

  /**
   * Loop the lesson until stop().
   *
   * @param {object} board the live Board
   * @param {object} hand the tutorial hand
   * @param {object} shape from Board.matchShape — what the swap would make
   */
  async play(board, hand, shape) {
    const id = ++this.token;
    this.visible = true;
    while (id === this.token) {
      await this.lesson(id, board, hand, shape);
      if (id !== this.token) return;
      await delay(0.4);
    }
  }

  /** One pass. Bails at every await if the lesson has been retired. */
  async lesson(id, board, hand, shape) {
    const { from, to, run, rest } = shape;
    const type = board.typeAt(from.r, from.c);
    const color = GEM_LIGHT[type] === undefined ? 0xffffff : GEM_LIGHT[type];

    // 1. What is already lined up.
    this.draw(board, { lit: rest, color });
    this.alpha = 0;
    await tween(this, { alpha: 1 }, 0.2);
    if (id !== this.token) return;
    await delay(0.28);
    if (id !== this.token) return;

    // 2. The one that completes it, and which way it goes.
    this.draw(board, { lit: rest.concat([from]), color, from, to });
    await delay(0.34);
    if (id !== this.token) return;

    // 3. The move, hand and stone together. The hand refuses the demo outright
    //    if the player's own finger already has the prop, and that is the
    //    right answer: somebody touching the board does not need the lesson.
    const a = board.cellPos(from.r, from.c);
    const b = board.cellPos(to.r, to.c);
    const grip = await hand.reach(board.x + a.x, board.y + a.y);
    if (!grip || id !== this.token) return;

    this.draw(board, { lit: rest, color });
    const [, moved] = await Promise.all([
      hand.slideTo(grip, board.x + b.x, board.y + b.y, TRAVEL),
      board.previewSwap(from, to, TRAVEL),
    ]);
    if (id !== this.token) return;
    if (!moved) {
      hand.leave(grip);
      return;
    }

    // 4. Three of a kind, joined up and held.
    this.draw(board, { lit: run, joined: run, color });
    await delay(HOLD);
    if (id !== this.token) return;

    // 5. Put the board back the way the model has always had it.
    hand.leave(grip);
    this.draw(board, { lit: rest, color });
    await board.previewSwap(from, to, RETURN, true);
    if (id !== this.token) return;
    await tween(this, { alpha: 0 }, 0.22);
  }

  /**
   * Redraw every mark for one beat.
   *
   * @param {object} board
   * @param {object} step
   *   `lit`    cells to outline
   *   `joined` cells to draw one connecting bar behind
   *   `from`/`to` draw the travel chevron between these two
   *   `color`  the element's own light, so the marks belong to the gems
   */
  draw(board, step) {
    const g = this.marks;
    const size = board.cell;
    const inset = size * 0.08;
    const box = size - inset * 2;
    const round = size * 0.26;
    const color = step.color;

    g.clear();

    const at = (cell) => {
      const p = board.cellPos(cell.r, cell.c);
      return { x: board.x + p.x, y: board.y + p.y };
    };

    // The bar behind a finished run — one shape over the whole line, so three
    // separate outlines read as one thing the player just made.
    if (step.joined && step.joined.length > 1) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      step.joined.forEach((cell) => {
        const p = at(cell);
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      });
      const bx = x0 - size / 2 + inset;
      const by = y0 - size / 2 + inset;
      const bw = x1 - x0 + box;
      const bh = y1 - y0 + box;
      g.roundRect(bx, by, bw, bh, round);
      g.fill({ color, alpha: 0.18 });
      g.roundRect(bx, by, bw, bh, round);
      g.stroke({ width: Math.max(3, size * 0.06), color, alpha: 0.95 });
    }

    (step.lit || []).forEach((cell) => {
      const p = at(cell);
      g.roundRect(
        p.x - size / 2 + inset,
        p.y - size / 2 + inset,
        box,
        box,
        round,
      );
      g.stroke({ width: Math.max(2, size * 0.042), color, alpha: 0.85 });
    });

    // A chevron on the midpoint, pointing the way the stone travels. Only ever
    // drawn before it does: once the gem is moving it is sitting on this exact
    // spot, and an arrow under a gem is a smudge.
    if (step.from && step.to) {
      const p = at(step.from);
      const q = at(step.to);
      const dx = Math.sign(q.x - p.x);
      const dy = Math.sign(q.y - p.y);
      const mx = (p.x + q.x) / 2;
      const my = (p.y + q.y) / 2;
      const k = size * 0.15;
      const tip = { x: mx + dx * k, y: my + dy * k };
      const base = { x: mx - dx * k, y: my - dy * k };
      // Perpendicular to the travel, so the wings open the right way on both
      // a sideways swap and an upward one.
      const px = -dy * k;
      const py = dx * k;
      g.moveTo(base.x + px, base.y + py);
      g.lineTo(tip.x, tip.y);
      g.lineTo(base.x - px, base.y - py);
      g.stroke({
        width: Math.max(3, size * 0.062),
        color: 0xffffff,
        alpha: 0.95,
      });
    }
  }
}
