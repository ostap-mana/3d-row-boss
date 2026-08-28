/**
 * The lesson — the opening one, and every auto-hint after it.
 *
 * The creative used to explain itself with four words and a hand. `MATCH TO
 * ATTACK` says what to do to somebody who already knows what a match is, and
 * the hand demonstrates a swipe — but a swipe over gems that never move shows
 * a gesture and not a rule. Somebody meeting a match-three for the first time,
 * in a thirty second window, with a monster roaring at them, is not going
 * to infer "line three of the same colour up" from a gauntlet sliding sideways.
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
 *   4. the three light as one, inside a single frame drawn round the lot of
 *      them — this is what you were making.
 *
 * Then it puts everything back and does it again, holding the pair lit at
 * REST_ALPHA in between, until whoever started it calls stop().
 *
 * Two things start it, both through Director.showLesson. The opening hint runs
 * it a second into the fight for a player who has not touched the board yet,
 * and the first touch ends that one for the whole run — see
 * Director.spendOpeningHint. The auto-hint runs the same thing, on the same
 * board, every time somebody stalls for T.hint afterwards, and every touch puts
 * it away again. The second is the reason this file is not called the tutorial:
 * a player five moves in gets exactly the demonstration a player who has made
 * none gets, because there is only one way to say "three of these, in a line"
 * and the fight is too short to teach it twice.
 *
 * Nothing here ever blocks input: at every beat the board underneath is live,
 * and a player who has understood it two beats in can swipe straight through
 * the lesson.
 *
 * The marks themselves are painted: the corner frames and the arrow are cut off
 * the same neon UI sheet the gems came off, so a lit gem wears a bracket drawn
 * to sit round it rather than a shape this file guessed at. See
 * art/hintmarks.js. When that art does not decode the lesson falls back to
 * drawing its own rings and dart in Graphics — same beats, same places, plainer
 * marks — because a hint that does not come up is worse than a plain one.
 */

import { Container, Graphics } from "pixi.js";
import { GEM_LIGHT } from "../config.js";
import { tween, delay, killTweensOf } from "../core/tween.js";
import {
  hintArrowSprite,
  hintFrameSprite,
  hintMarksReady,
} from "../art/hintmarks.js";

/** How long the completed run is held up before the board is put back. */
const HOLD = 0.62;
/** The travel, out and back. Out is the lesson; back is only bookkeeping. */
const TRAVEL = 0.4;
const RETURN = 0.26;
/** The beat between one pass and the next. */
const REST = 0.5;
/**
 * What the marks fade back to between passes rather than off.
 *
 * The lesson used to go to nothing and come back from nothing, which on a loop
 * is a set of outlines blinking on and off over the board — and blinking is the
 * one thing on a screen that cannot be ignored and cannot be read either. Held
 * dim, the pair stays picked out the whole time the hint is up, so the answer
 * is on screen continuously and the demonstration of it merely repeats.
 */
const REST_ALPHA = 0.42;

/**
 * The frame's side, as a fraction of a cell.
 *
 * Just under one, so a frame reaches the edges of the cell it is on and the two
 * on a lit pair meet without touching. The gem inside it is 0.86 of a cell, so
 * the brackets clear the disc by a comfortable margin on all four sides.
 */
const FRAME_SPAN = 0.98;

/**
 * The arrow's length, as a fraction of a cell.
 *
 * It sits on the seam between the two cells being swapped, and there is nothing
 * else there: two adjacent gems leave a gap of 0.14 of a cell between their
 * discs. So it is always partly over the gems, and long enough to be read as an
 * arrow rather than short enough to fit in a gap that does not exist.
 */
const ARROW_SPAN = 0.62;

/**
 * How far the frame round a hero card stands off it, as a fraction of the
 * card's width.
 *
 * Small, and measured off the width rather than off the height, because the
 * only thing on either side of a card is another card: the row leaves a gap of
 * about a hundredth of its own width between them — see CARD.gap in
 * core/layout.js — and a frame that reached much further would put its bracket
 * on the neighbour it is not talking about. Enough to clear the card's own
 * painted border and no more.
 */
const CARD_PAD = 0.07;

/** Whether two cells are the same cell. */
const same = (a, b) => a.r === b.r && a.c === b.c;

export class Coach extends Container {
  constructor() {
    super();

    /** The fallback, and empty for the whole of a lesson when the art decoded. */
    this.marks = new Graphics();
    /** The painted marks. Rebuilt when the lesson changes element — see wear(). */
    this.kit = new Container();
    this.addChild(this.marks, this.kit);
    this.painted = null;
    /** The beat on screen, kept so a relayout can put it back — see resize(). */
    this.last = null;
    /**
     * The point the hand is tapping through an ult lesson.
     *
     * Handed to Hand.tapLoop once and then written in place rather than passed
     * again, because the loop reads it at the top of every pass: a relayout
     * moves the card under a demo that is already running, and the prop picks
     * the new place up on its next tap instead of going on knocking at where
     * the row used to be.
     */
    this.cardAt = null;

    this.alpha = 0;
    this.visible = false;
    /** Retires a lesson in flight — every await in the loop checks it. */
    this.token = 0;
  }

  resize() {
    // Every mark is placed from the board's own cell size at draw time, so the
    // beat that is up, drawn again, lands on the new layout by itself. Drawn
    // again rather than merely taken down: the beats are as much as a second
    // apart — the travel and then the hold on the finished run — and a lesson
    // that cleared and waited would spend that second as a hand moving over an
    // unmarked board. Nothing is redrawn when nothing is up: stop() drops this.
    if (!this.last) {
      this.clearMarks();
      return;
    }
    // Two lessons, so two things to put back. The row has already been laid out
    // again by the time this runs — main.js resizes it before the coach — so
    // the card is simply asked where it is now, and this is also what moves the
    // point the hand is tapping. See cardAt.
    if (this.last.card) {
      this.drawCard(this.last.card, this.last.type, this.last.color);
      return;
    }
    this.draw(this.last.board, this.last.step);
  }

  /**
   * End the lesson. The board is put back by whoever owns it.
   *
   * The fade is killed rather than overwritten. Setting the alpha under a tween
   * that is still running does nothing at all — the next frame writes the
   * curve's own value back over it — so a lesson retired mid-fade went on
   * climbing to REST_ALPHA behind `visible = false`, and the next one to open
   * came up already half lit instead of arriving from nothing.
   */
  stop() {
    this.token++;
    killTweensOf(this);
    this.last = null;
    this.clearMarks();
    this.alpha = 0;
    this.visible = false;
  }

  /** Take every mark off screen without throwing the sprites away. */
  clearMarks() {
    this.marks.clear();
    if (!this.painted) return;
    this.painted.arrow.visible = false;
    this.painted.frames.forEach((f) => (f.visible = false));
  }

  /**
   * Loop the lesson until stop().
   *
   * @param {object} board the live Board
   * @param {object} hand the tutorial hand
   * @param {object} shape from Board.matchShape — what the swap would make
   * @param {function=} solve asked for a fresh shape when this one stops being
   *   true, and allowed to answer null when the board has nothing left to teach
   */
  async play(board, hand, shape, solve) {
    const id = ++this.token;
    this.visible = true;
    let live = shape;
    while (id === this.token) {
      // Nothing is drawn over a board that is still moving. Every mark here is
      // placed from a cell position, and mid-cascade the gems are not on their
      // cells — so a pass that started now would outline empty squares and then
      // be refused by previewSwap anyway.
      while (board.busy) {
        await delay(0.12);
        if (id !== this.token) return;
      }

      // And then the swap is solved again rather than remembered. A hint loops
      // for as long as the player stalls, and the board does not hold still
      // underneath it — the boss drops obsidian on a cell, the lava lands, a
      // cascade settles the run somewhere else. The director re-aims this from
      // outside at the places it knows about, but it cannot know about all of
      // them, and a lesson that has stopped being true is worse than no lesson:
      // it demonstrates, in full, a swipe that makes nothing. matchShape is
      // model-only and costs one pass over sixty-four cells.
      //
      // The destination goes in first, and that is load-bearing. matchShape
      // reads its own first argument as the traveller's landing cell whenever
      // that cell is in the run, and a swap can complete a line at *both* ends
      // — hand it the pair the other way round and it answers with the mirror
      // lesson, so the arrow would turn round between one pass and the next
      // over a board where nothing had changed at all.
      const next =
        board.matchShape(live.to, live.from) || (solve ? solve() : null);
      if (!next) {
        this.stop();
        return;
      }
      // A different pair is a different sentence, so it starts from nothing
      // rather than from the marks still lit on the old one — frames sliding
      // across the board to new cells read as the marks moving, which is the
      // one thing on screen here that is not supposed to mean anything.
      if (!same(next.from, live.from) || !same(next.to, live.to)) {
        this.last = null;
        this.clearMarks();
        this.alpha = 0;
      }
      live = next;

      await this.lesson(id, board, hand, live);
      if (id !== this.token) return;
      await delay(REST);
    }
  }

  /**
   * The other lesson: which hero is charged, and what to do about it.
   *
   * Everything above teaches the board. This teaches the row underneath it, in
   * the same marks and the same grammar — the frame off the hint sheet, in the
   * hero's own element, with the hand that drags gems tapping instead. A player
   * who has watched the board lesson has already been told what a frame round a
   * thing means, so this only has to say which thing.
   *
   * No arrow and no words: there is nowhere for the card to travel to, and the
   * gesture is the whole of the instruction. The HUD's own TAP {hero} shout is
   * still up while this arrives — Director.teachUlt waits for it on purpose —
   * so the hero is named once, in type, by the surface that names everything
   * else in the creative, and the hand says the rest.
   *
   * Loops until stop(), exactly as play() does, and what bounds it is the
   * director: the prop is held for T.ultHint and then handed back to the board,
   * because a hand parked on the row is a hand pointing away from the fight.
   *
   * @param {object} card the HeroCard that just charged
   * @param {object} hand the tutorial hand
   * @param {number} type the hero's element, which picks the painted set
   */
  async playCard(card, hand, type) {
    const id = ++this.token;
    this.visible = true;
    const color = GEM_LIGHT[type] === undefined ? 0xffffff : GEM_LIGHT[type];

    // The hand wears the hero's colour the way it wears a gem's on the board,
    // and it is told before it is shown rather than while it is up.
    hand.setElement(type);
    this.drawCard(card, type, color);
    // Fired, not awaited: the loop below is the frame's beat and the tap is the
    // prop's, and the two are deliberately not on one clock — a frame that
    // waited for the hand would spend half the lesson holding still.
    hand.tapLoop(this.cardAt);

    await tween(this, { alpha: 1 }, 0.2);
    // And then it breathes between full and REST_ALPHA rather than blinking,
    // for the reason that constant exists at all: the frame is the answer to
    // "which card", and an answer that goes out is one the player has to wait
    // for all over again.
    while (id === this.token) {
      await delay(0.55);
      if (id !== this.token) return;
      await tween(this, { alpha: REST_ALPHA }, 0.3);
      if (id !== this.token) return;
      await delay(0.2);
      if (id !== this.token) return;
      await tween(this, { alpha: 1 }, 0.22);
    }
  }

  /**
   * Place the frame round one hero card.
   *
   * The cards are children of a row that sits at the world's origin, so a
   * card's own x and y are already coordinates in this container — no
   * conversion, unlike the board, whose cells are offsets inside it.
   *
   * @param {object} card the HeroCard
   * @param {number} type the element, which picks the painted set
   * @param {number} color the element's light, which the fallback strokes with
   */
  drawCard(card, type, color) {
    this.last = { card, type, color };
    const w = card.cardW || 0;
    const h = card.cardH || 0;
    // Before the row's first resize a card has no size at all, and a frame
    // round nothing is a bracket in the corner of the screen.
    if (!w || !h) return;

    const pad = w * CARD_PAD;
    const box = {
      x: card.x - w / 2 - pad,
      y: card.y - h / 2 - pad,
      w: w + pad * 2,
      h: h + pad * 2,
      // The card's own corner, so the drawn fallback traces the card instead of
      // putting a capsule round it: a box twice as tall as it is wide, taken at
      // the stadium radius the board's marks want, comes out an oval. Same
      // fraction HeroCard.resize falls back to — see art/heroes.js.
      r: Math.min(w, h) * 0.18,
    };

    if (this.cardAt) {
      this.cardAt.x = card.x;
      this.cardAt.y = card.y;
    } else {
      this.cardAt = { x: card.x, y: card.y };
    }

    // Measured off the card's width rather than a board cell's: it is what the
    // stroked fallback weights its line against, and a card is about three
    // quarters of a cell.
    this.paint([box], null, type, color, w);
  }

  /** One pass. Bails at every await if the lesson has been retired. */
  async lesson(id, board, hand, shape) {
    const { from, to, run, rest } = shape;
    const type = board.typeAt(from.r, from.c);
    const color = GEM_LIGHT[type] === undefined ? 0xffffff : GEM_LIGHT[type];
    // Which element it is decides which of the painted sets is worn; the light
    // off it is what the drawn fallback strokes with. Every beat carries both.
    const show = (step) => this.draw(board, { type, color, ...step });

    // 1. What is already lined up. Up from nothing on the first pass and from
    //    REST_ALPHA on every one after it, which is why the alpha is not reset
    //    here: the marks were never all the way off.
    show({ lit: rest });
    await tween(this, { alpha: 1 }, 0.2);
    if (id !== this.token) return;
    await delay(0.28);
    if (id !== this.token) return;

    // 2. The one that completes it, and which way it goes.
    show({ lit: rest.concat([from]), from, to });
    await delay(0.34);
    if (id !== this.token) return;

    // 3. The move, hand and stone together. The hand refuses the demo outright
    //    if the player's own finger already has the prop, and that is the
    //    right answer: somebody touching the board does not need the lesson.
    const a = board.cellPos(from.r, from.c);
    const b = board.cellPos(to.r, to.c);
    // The same element the frames and the arrow are wearing this pass. Set
    // before the hand is asked for, so it arrives already the right colour
    // rather than changing to it in front of the player.
    hand.setElement(type);
    const grip = await hand.reach(board.x + a.x, board.y + a.y);
    if (!grip || id !== this.token) return;

    // The board is asked once more, in the same tick the travel starts — the
    // reach above took a third of a second, and a boss turn fits inside that.
    // previewSwap refuses a busy or blocked board on its first line and returns
    // false immediately, while Promise.all below would still run the hand's
    // full 0.4s slide beside it: a finger dragging a stone that never moves,
    // which is the one thing this whole file exists so as not to show.
    if (
      board.busy ||
      board.isLocked(from.r, from.c) ||
      board.isLocked(to.r, to.c)
    ) {
      hand.leave(grip);
      return;
    }

    show({ lit: rest });
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
    show({ lit: run, joined: run });
    await delay(HOLD);
    if (id !== this.token) return;

    // 5. Put the board back the way the model has always had it — and leave
    //    the pair lit underneath while the lesson waits to say it again.
    hand.leave(grip);
    show({ lit: rest });
    await board.previewSwap(from, to, RETURN, true);
    if (id !== this.token) return;
    await tween(this, { alpha: REST_ALPHA }, 0.22);
  }

  /**
   * Place every mark for one beat.
   *
   * The layout is worked out once, as boxes on screen, and then either worn as
   * painted sprites or stroked in Graphics. Both routes get the same boxes, so
   * a device that could not decode the art gets the lesson in the same places
   * — only plainer.
   *
   * @param {object} board
   * @param {object} step
   *   `lit`    cells to frame
   *   `joined` cells to put one frame round instead of framing each
   *   `from`/`to` point the travel arrow between these two
   *   `type`   the element, which picks the painted set
   *   `color`  the element's own light, which the fallback strokes with
   */
  draw(board, step) {
    // Kept for resize(), which has no other way of knowing which of the five
    // beats is the one on screen.
    this.last = { board, step };
    const size = board.cell;
    const at = (cell) => {
      const p = board.cellPos(cell.r, cell.c);
      return { x: board.x + p.x, y: board.y + p.y };
    };

    const joined = step.joined && step.joined.length > 1 ? step.joined : null;
    const inRun = (cell) =>
      !!joined && joined.some((j) => j.r === cell.r && j.c === cell.c);

    const span = size * FRAME_SPAN;
    const boxes = [];

    // One frame round the whole finished run, so three gems read as the one
    // thing the player just made rather than as three things that happen to be
    // lit. It is the same frame as a single gem wears, pulled along the run —
    // which is what the nine-slice is for.
    if (joined) {
      let x0 = Infinity;
      let y0 = Infinity;
      let x1 = -Infinity;
      let y1 = -Infinity;
      joined.forEach((cell) => {
        const p = at(cell);
        x0 = Math.min(x0, p.x);
        y0 = Math.min(y0, p.y);
        x1 = Math.max(x1, p.x);
        y1 = Math.max(y1, p.y);
      });
      boxes.push({
        x: x0 - span / 2,
        y: y0 - span / 2,
        w: x1 - x0 + span,
        h: y1 - y0 + span,
      });
    }

    // A gem already inside the run's frame does not get one of its own: it is
    // framed, and a second frame inside the first is two marks for one fact.
    (step.lit || []).forEach((cell) => {
      if (inRun(cell)) return;
      const p = at(cell);
      boxes.push({ x: p.x - span / 2, y: p.y - span / 2, w: span, h: span });
    });

    // The pointer, on the seam the stone is about to cross. Only ever placed
    // before it does: once the gem is moving it is sitting on this exact spot,
    // and an arrow under a gem is a smudge.
    let arrow = null;
    if (step.from && step.to) {
      const p = at(step.from);
      const q = at(step.to);
      arrow = {
        x: (p.x + q.x) / 2,
        y: (p.y + q.y) / 2,
        // Adjacent cells only, so this is a quarter turn or a half one and the
        // packed arrow — which points right — covers all four directions.
        rotation: Math.atan2(q.y - p.y, q.x - p.x),
        length: size * ARROW_SPAN,
      };
    }

    this.paint(boxes, arrow, step.type, step.color, size);
  }

  /**
   * Put one set of boxes on screen: painted where the art allows, stroked where
   * it does not.
   *
   * The one door to the marks, so both lessons come through it and a device
   * that could not decode the sheet gets them both plainly rather than getting
   * one of them not at all.
   *
   * Asked about this element, not about the set as a whole. Board.typeAt
   * reports -1 for an encased cell, and the boss can encase one between the
   * hint being solved and the beat being drawn — wear() would find no art for
   * -1, quietly draw nothing, and leave the lesson miming over a bare board.
   * The stroked marks do not care what element it is.
   *
   * @param {object[]} boxes what to frame, in this container's coordinates
   * @param {object} arrow the pointer, or null when there is nowhere to point
   * @param {number} type the element, which picks the painted set
   * @param {number} color the element's light, for the fallback
   * @param {number} size what the fallback weights its line against
   */
  paint(boxes, arrow, type, color, size) {
    if (hintMarksReady(type)) this.wear(type, boxes, arrow);
    else this.stroke(boxes, arrow, color, size);
  }

  /**
   * The painted marks: a frame on each box and the arrow on the seam.
   *
   * Sprites are kept and reused rather than rebuilt, because a lesson redraws
   * five times a pass and loops until it is stopped. They are only rebuilt when
   * the element changes, which happens when a new hint picks a different run —
   * never inside one pass.
   */
  wear(type, boxes, arrow) {
    this.marks.clear();

    if (!this.painted || this.painted.type !== type) {
      // The textures are shared and stay; only the views go. Sprite.destroy()
      // with nothing passed leaves the texture alone, which is what the next
      // lesson on this element will want. `painted` is dropped before anything
      // can throw, so clearMarks() is never left holding a destroyed sprite.
      this.kit.removeChildren().forEach((child) => child.destroy());
      this.painted = null;
      const pointer = hintArrowSprite(type);
      if (!pointer) return;
      this.painted = { type, frames: [], arrow: pointer };
      this.kit.addChild(pointer);
    }
    const kit = this.painted;

    boxes.forEach((box, i) => {
      if (!kit.frames[i]) {
        const frame = hintFrameSprite(kit.type);
        if (!frame) return;
        kit.frames[i] = frame;
        // Under the arrow, which is the one mark allowed to sit on top of
        // anything: it is pointing at a gem that is inside a frame.
        this.kit.addChildAt(frame, i);
      }
      const frame = kit.frames[i];
      frame.visible = true;
      // Sized in the art's own pixels with the scale carrying the rest, so the
      // corner slices land the same size on both axes and every extra point of
      // a run's length is spent on the empty middle. Same trick as the hero
      // cards' frames — see art/cardframe.js.
      const k = Math.min(box.w, box.h) / frame.texture.width;
      frame.scale.set(k);
      frame.setSize(box.w / k, box.h / k);
      frame.x = box.x;
      frame.y = box.y;
    });
    for (let i = boxes.length; i < kit.frames.length; i++) {
      kit.frames[i].visible = false;
    }

    kit.arrow.visible = !!arrow;
    if (arrow) {
      const scale = arrow.length / kit.arrow.texture.width;
      kit.arrow.scale.set(scale);
      kit.arrow.rotation = arrow.rotation;
      kit.arrow.x = arrow.x;
      kit.arrow.y = arrow.y;
    }
  }

  /**
   * The fallback: the same lesson stroked in Graphics.
   *
   * Round, and measured off the gem rather than off the cell. GemView.resize
   * fits every disc to 0.86 of a cell, so the art has a radius of 0.43 and the
   * ring clears it by a hair.
   *
   * Every mark is struck twice — once in black, a little wider, then once in
   * the element's own light on top. GEM_LIGHT is a set of pale pastels, and
   * this runs over gold and violet discs as often as over the dark board, so a
   * single coloured line has stretches where it carries no contrast at all.
   */
  stroke(boxes, arrow, color, size) {
    const g = this.marks;
    const weight = Math.max(2, size * 0.042);
    const shadow = { width: weight * 1.9, color: 0x000000, alpha: 0.42 };
    const light = { width: weight, color, alpha: 0.92 };

    this.clearMarks();

    boxes.forEach((box) => {
      // Inset by the shadow it carries, so a ring on one cell of a lit pair
      // stops short of the ring on the other. The painted frame does not need
      // this — its brackets are open where a ring is closed, and two of them
      // meeting at a seam reads as a pair rather than as a collision.
      const pad = shadow.width / 2;
      const w = box.w - pad * 2;
      const h = box.h - pad * 2;
      // Cornered at half its own thickness a box comes out a stadium, which on
      // a single cell is the ring round one gem and on a run is that ring at
      // both ends with the line between them filled in. A box that asked for a
      // corner of its own gets that instead — the hero cards do, because a card
      // is twice as tall as it is wide and the stadium on that is an oval.
      const r =
        box.r === undefined
          ? Math.min(w, h) / 2
          : Math.min(box.r, w / 2, h / 2);
      g.roundRect(box.x + pad, box.y + pad, w, h, r);
      g.stroke(shadow);
      g.roundRect(box.x + pad, box.y + pad, w, h, r);
      g.stroke(light);
    });

    if (!arrow) return;

    // A filled dart with a dark rim, because the seam is half one gem and half
    // the next and the arrow has to survive both.
    const ux = Math.cos(arrow.rotation);
    const uy = Math.sin(arrow.rotation);
    // `along` runs with the travel and `across` square to it, so one set of
    // numbers draws the arrow whichever of the four ways the stone goes.
    const point = (along, across) => ({
      x: arrow.x + ux * along - uy * across,
      y: arrow.y + uy * along + ux * across,
    });
    const len = arrow.length * 0.45;
    const wing = arrow.length * 0.26;
    const tip = point(len, 0);
    const right = point(-len * 0.55, wing);
    const notch = point(-len * 0.2, 0);
    const left = point(-len * 0.55, -wing);
    const dart = [
      tip.x,
      tip.y,
      right.x,
      right.y,
      notch.x,
      notch.y,
      left.x,
      left.y,
    ];
    // Closed explicitly. Polygon defaults closePath to true, but ShapePath
    // assigns whatever poly() was handed straight over the top of that, so
    // leaving the argument off sets it to undefined and the stroke comes back
    // open — a dart with one wing unattached to the tip.
    g.poly(dart, true);
    g.stroke({
      width: weight * 2.2,
      color: 0x000000,
      alpha: 0.5,
      join: "round",
    });
    g.poly(dart, true);
    g.fill({ color: 0xffffff, alpha: 0.97 });
  }
}
